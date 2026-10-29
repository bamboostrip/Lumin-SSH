package sshmanager

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"errors"
	"net"
	"strings"
	"sync"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"
)

// 本文件回归「远端删除目录优先走 shell rm -rf」的策略。
//
// 背景：DeleteItemContext 原先先调 SFTP RemoveAll（逐目录项 RPC），十万级文件的
// 目录要跑很久，且整条路径没有任何超时/取消手段，卡住就是永久挂起。
// 远端会话现在优先用一条 rm -rf（走长超时通道、可被 ctx 取消），
// 仅在 shell 不可用时回退 SFTP RemoveAll。

// recordedExec 记录假 SSH 服务端收到的 exec 命令。
type recordedExec struct {
	mu       sync.Mutex
	commands []string
}

func (r *recordedExec) add(cmd string) {
	r.mu.Lock()
	r.commands = append(r.commands, cmd)
	r.mu.Unlock()
}

func (r *recordedExec) all() []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]string, len(r.commands))
	copy(out, r.commands)
	return out
}

// newRecordingSSHClient 启动一个会记录 exec 命令、按固定 exit status 回包的假 SSH 服务端。
func newRecordingSSHClient(t *testing.T, exitStatus uint32) (*ssh.Client, *recordedExec) {
	t.Helper()

	_, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	signer, err := ssh.NewSignerFromKey(privateKey)
	if err != nil {
		t.Fatal(err)
	}
	serverConfig := &ssh.ServerConfig{NoClientAuth: true}
	serverConfig.AddHostKey(signer)

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}

	recorder := &recordedExec{}
	serverDone := make(chan struct{})
	go func() {
		defer close(serverDone)
		for {
			conn, acceptErr := listener.Accept()
			if acceptErr != nil {
				return
			}
			go func(conn net.Conn) {
				server, channels, requests, handshakeErr := ssh.NewServerConn(conn, serverConfig)
				if handshakeErr != nil {
					_ = conn.Close()
					return
				}
				defer server.Close()
				go ssh.DiscardRequests(requests)
				for newChannel := range channels {
					if newChannel.ChannelType() != "session" {
						_ = newChannel.Reject(ssh.UnknownChannelType, "only session")
						continue
					}
					channel, channelRequests, acceptErr := newChannel.Accept()
					if acceptErr != nil {
						continue
					}
					go func() {
						for request := range channelRequests {
							if request.Type != "exec" {
								if request.WantReply {
									_ = request.Reply(false, nil)
								}
								continue
							}
							var payload struct{ Command string }
							_ = ssh.Unmarshal(request.Payload, &payload)
							recorder.add(payload.Command)
							if request.WantReply {
								_ = request.Reply(true, nil)
							}
							_, _ = channel.SendRequest("exit-status", false, ssh.Marshal(struct{ Status uint32 }{exitStatus}))
							_ = channel.Close()
							return
						}
					}()
				}
			}(conn)
		}
	}()

	dialer := net.Dialer{Timeout: 2 * time.Second}
	clientConn, err := dialer.Dial("tcp", listener.Addr().String())
	if err != nil {
		_ = listener.Close()
		t.Fatal(err)
	}
	config := &ssh.ClientConfig{
		User:            "test",
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         2 * time.Second,
	}
	sshConn, channels, requests, err := ssh.NewClientConn(clientConn, listener.Addr().String(), config)
	if err != nil {
		_ = clientConn.Close()
		_ = listener.Close()
		t.Fatal(err)
	}
	client := ssh.NewClient(sshConn, channels, requests)

	t.Cleanup(func() {
		_ = client.Close()
		_ = clientConn.Close()
		_ = listener.Close()
		select {
		case <-serverDone:
		case <-time.After(2 * time.Second):
			t.Error("假 SSH 服务端未退出")
		}
	})
	return client, recorder
}

func newDeleteStrategyManager(t *testing.T, client *ssh.Client) *SSHManager {
	t.Helper()
	manager := NewSSHManager()
	manager.clients["conn-1"] = &sshClientEntry{Client: client}
	manager.sessions["session-1"] = &SessionData{ConnKey: "conn-1"}
	return manager
}

func TestDeleteItemContextPrefersShellForRemoteDirectory(t *testing.T) {
	client, recorder := newRecordingSSHClient(t, 0)
	manager := newDeleteStrategyManager(t, client)

	if err := manager.DeleteItemContext(context.Background(), "session-1", "/tmp/big-dir", true); err != nil {
		t.Fatalf("远端目录删除应成功: %v", err)
	}
	commands := recorder.all()
	if len(commands) != 1 {
		t.Fatalf("应只执行一条 shell 删除命令，实际 %d 条: %v", len(commands), commands)
	}
	if !strings.Contains(commands[0], "rm -rf") || !strings.Contains(commands[0], "/tmp/big-dir") {
		t.Fatalf("删除命令不符合预期: %q", commands[0])
	}
}

func TestDeleteItemContextFallsBackWhenRmMissing(t *testing.T) {
	// 127 = command not found，属于「服务器没有 rm」的合法回退场景。
	client, recorder := newRecordingSSHClient(t, 127)
	manager := newDeleteStrategyManager(t, client)

	err := manager.DeleteItemContext(context.Background(), "session-1", "/tmp/big-dir", true)
	if err == nil {
		t.Fatal("shell 删除失败且无 SFTP 可用时应返回错误")
	}
	if !strings.Contains(err.Error(), "rm -rf failed") || !strings.Contains(err.Error(), "sftp fallback unavailable") {
		t.Fatalf("rm 不存在时应尝试 SFTP 回退: %v", err)
	}
	if len(recorder.all()) != 1 {
		t.Fatalf("应先尝试一次 shell 删除，实际命令: %v", recorder.all())
	}
}

func TestDeleteItemContextDoesNotFallbackOnGenericShellFailure(t *testing.T) {
	// exit 1 是普通失败（权限/磁盘/路径错误），不能再用不可中断的 SFTP RemoveAll
	// 继续删；否则「取消/超时后继续删除」会重新出现。
	client, recorder := newRecordingSSHClient(t, 1)
	manager := newDeleteStrategyManager(t, client)

	err := manager.DeleteItemContext(context.Background(), "session-1", "/tmp/big-dir", true)
	if err == nil {
		t.Fatal("shell 删除失败应返回错误")
	}
	if strings.Contains(err.Error(), "sftp fallback") {
		t.Fatalf("普通 shell 失败不应回退 SFTP，实际: %v", err)
	}
	if len(recorder.all()) != 1 {
		t.Fatalf("只应尝试一次 shell 删除，实际命令: %v", recorder.all())
	}
}

func TestDeleteItemContextCanceledDoesNotFallBack(t *testing.T) {
	// 命令卡住时用户取消：必须立刻返回 ctx 错误，不能落到无超时的 SFTP RemoveAll。
	client := newSlowExecSSHClient(t, 3*time.Second)
	manager := NewSSHManager()
	manager.clients["conn-1"] = &sshClientEntry{Client: client}
	manager.sessions["session-1"] = &SessionData{ConnKey: "conn-1"}

	ctx, cancel := context.WithTimeout(context.Background(), 150*time.Millisecond)
	defer cancel()

	started := time.Now()
	err := manager.DeleteItemContext(ctx, "session-1", "/tmp/big-dir", true)
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("取消后应返回 DeadlineExceeded，实际: %v", err)
	}
	if elapsed := time.Since(started); elapsed > 2*time.Second {
		t.Fatalf("取消后未及时返回，耗时 %v", elapsed)
	}
}

func TestRmUnavailableForFallbackClassification(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want bool
	}{
		{"nil", nil, false},
		{"restricted-shell", errors.New("ssh: exec request failed"), true},
		{"windows-cmd", errors.New("'rm' is not recognized as an internal or external command"), true},
		{"powershell", errors.New("The term 'rm' is not recognized as a name. CommandNotFoundException"), true},
		{"permission-denied", errors.New("rm: cannot remove '/x': Permission denied"), false},
		{"timeout", errors.New("command timed out after 30m0s"), false},
		{"canceled", context.Canceled, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := rmUnavailableForFallback(tc.err); got != tc.want {
				t.Fatalf("rmUnavailableForFallback(%v)=%v, want %v", tc.err, got, tc.want)
			}
		})
	}
}
