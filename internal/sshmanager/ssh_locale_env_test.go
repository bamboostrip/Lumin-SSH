package sshmanager

import (
	"crypto/ed25519"
	"crypto/rand"
	"net"
	"sync"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"
)

// envRequestPayload 对应 RFC 4254 env 请求的载荷（两个长度前缀字符串）
type envRequestPayload struct {
	Name  string
	Value string
}

type recordedChannelRequest struct {
	RequestType string
	Payload     string
	WantReply   bool
}

// envRecordingServer 记录每个 session 通道上到达的请求序列。与真实 sshd 对
// want_reply=0 请求的行为一致：一律不回应 env（无论 AcceptEnv 是否接受），
// 其余请求应答成功；shell 到达时写入 shellSeen 以便测试同步。
type envRecordingServer struct {
	mu        sync.Mutex
	requests  []recordedChannelRequest
	shellSeen chan struct{}
}

func (s *envRecordingServer) snapshot() []recordedChannelRequest {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]recordedChannelRequest, len(s.requests))
	copy(out, s.requests)
	return out
}

func (s *envRecordingServer) envRequests() []recordedChannelRequest {
	s.mu.Lock()
	defer s.mu.Unlock()
	var envs []recordedChannelRequest
	for _, request := range s.requests {
		if request.RequestType == "env" {
			envs = append(envs, request)
		}
	}
	return envs
}

func newEnvRecordingSSHClient(t *testing.T) (*ssh.Client, *envRecordingServer) {
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
	recorder := &envRecordingServer{shellSeen: make(chan struct{}, 4)}
	serverDone := make(chan struct{})
	go func() {
		defer close(serverDone)
		conn, acceptErr := listener.Accept()
		if acceptErr != nil {
			return
		}
		server, channels, requests, serverErr := ssh.NewServerConn(conn, serverConfig)
		if serverErr != nil {
			conn.Close()
			return
		}
		defer server.Close()
		go func() {
			for range requests {
			}
		}()
		for newChannel := range channels {
			if newChannel.ChannelType() != "session" {
				newChannel.Reject(ssh.UnknownChannelType, "测试服务不支持通道")
				continue
			}
			channel, channelRequests, acceptErr := newChannel.Accept()
			if acceptErr != nil {
				continue
			}
			go func() {
				defer channel.Close()
				for request := range channelRequests {
					switch request.Type {
					case "env":
						var payload envRequestPayload
						_ = ssh.Unmarshal(request.Payload, &payload)
						recorder.mu.Lock()
						recorder.requests = append(recorder.requests, recordedChannelRequest{
							RequestType: "env",
							Payload:     payload.Name + "=" + payload.Value,
							WantReply:   request.WantReply,
						})
						recorder.mu.Unlock()
					case "shell":
						recorder.mu.Lock()
						recorder.requests = append(recorder.requests, recordedChannelRequest{RequestType: "shell"})
						recorder.mu.Unlock()
						_ = request.Reply(true, nil)
						recorder.shellSeen <- struct{}{}
						return
					default:
						_ = request.Reply(true, nil)
					}
				}
			}()
		}
	}()
	clientConn, err := net.DialTimeout("tcp", listener.Addr().String(), time.Second)
	if err != nil {
		listener.Close()
		t.Fatal(err)
	}
	config := &ssh.ClientConfig{
		User:            "test",
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         time.Second,
	}
	sshConn, channels, requests, err := ssh.NewClientConn(clientConn, listener.Addr().String(), config)
	if err != nil {
		clientConn.Close()
		listener.Close()
		t.Fatal(err)
	}
	client := ssh.NewClient(sshConn, channels, requests)
	t.Cleanup(func() {
		client.Close()
		clientConn.Close()
		listener.Close()
		select {
		case <-serverDone:
		case <-time.After(time.Second):
			t.Error("测试 SSH 服务未退出")
		}
	})
	return client, recorder
}

func waitShellSeen(t *testing.T, recorder *envRecordingServer) {
	t.Helper()
	select {
	case <-recorder.shellSeen:
	case <-time.After(2 * time.Second):
		t.Fatal("测试服务未收到 shell 请求")
	}
}

func TestRequestUTF8LocaleEnvSendsLangBeforeShell(t *testing.T) {
	client, recorder := newEnvRecordingSSHClient(t)
	session, err := client.NewSession()
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close()

	requestUTF8LocaleEnv(session, "utf-8", "test-session")
	if err := session.Shell(); err != nil {
		t.Fatalf("发送 LANG 后 shell 请求应仍可成功: %v", err)
	}
	waitShellSeen(t, recorder)

	sequence := recorder.snapshot()
	if len(sequence) < 2 || sequence[0].RequestType != "env" || sequence[1].RequestType != "shell" {
		t.Fatalf("env 请求应先于 shell 到达，实际序列: %#v", sequence)
	}
	envs := recorder.envRequests()
	if len(envs) != 1 || envs[0].Payload != "LANG=C.UTF-8" {
		t.Fatalf("应恰好发送一次 LANG=C.UTF-8，实际: %#v", envs)
	}
	// want_reply=0 是结构性护栏：对不应答 env 的服务器（不良固件）也不能阻塞建连
	if envs[0].WantReply {
		t.Fatal("env 请求必须以 want_reply=0 发送，否则不良固件会卡死连接")
	}
}

func TestRequestUTF8LocaleEnvSkipsNonUTF8Encoding(t *testing.T) {
	client, recorder := newEnvRecordingSSHClient(t)
	session, err := client.NewSession()
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close()

	// GBK 等遗留编码连接的 locale 由服务器自身配置管理，客户端不应干预
	requestUTF8LocaleEnv(session, "gbk", "test-session")
	if err := session.Shell(); err != nil {
		t.Fatal(err)
	}
	waitShellSeen(t, recorder)

	if envs := recorder.envRequests(); len(envs) != 0 {
		t.Fatalf("非 UTF-8 编码不应发送 env 请求，实际: %#v", envs)
	}
}

// TestRequestUTF8LocaleEnvEncodingNormalization 钉死归一化语义：空值（默认连接）、
// utf8/UTF-8 别名与未知编码值都归一为 utf-8，应当发送；显式非 UTF-8 编码不发送。
func TestRequestUTF8LocaleEnvEncodingNormalization(t *testing.T) {
	cases := []struct {
		name     string
		encoding string
		wantSend bool
	}{
		{"空值即默认连接", "", true},
		{"utf8 别名", "utf8", true},
		{"大小写混合", "UTF-8", true},
		{"未知编码值归一为 utf-8", "not-an-encoding", true},
		{"显式非 UTF-8 不发送", "us-ascii", false},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			client, recorder := newEnvRecordingSSHClient(t)
			session, err := client.NewSession()
			if err != nil {
				t.Fatal(err)
			}
			defer session.Close()

			requestUTF8LocaleEnv(session, testCase.encoding, "test-session")
			if err := session.Shell(); err != nil {
				t.Fatal(err)
			}
			waitShellSeen(t, recorder)

			envs := recorder.envRequests()
			if testCase.wantSend {
				if len(envs) != 1 || envs[0].Payload != "LANG=C.UTF-8" {
					t.Fatalf("编码 %q 归一为 utf-8 后应发送 LANG=C.UTF-8，实际: %#v", testCase.encoding, envs)
				}
			} else if len(envs) != 0 {
				t.Fatalf("编码 %q 不应发送 env 请求，实际: %#v", testCase.encoding, envs)
			}
		})
	}
}

func TestRequestUTF8LocaleEnvToleratesClosedTransport(t *testing.T) {
	client, _ := newEnvRecordingSSHClient(t)
	session, err := client.NewSession()
	if err != nil {
		t.Fatal(err)
	}
	if err := client.Close(); err != nil {
		t.Fatal(err)
	}

	// 连接已断开时发送应立刻失败返回，不得挂起或 panic
	done := make(chan struct{})
	go func() {
		defer close(done)
		requestUTF8LocaleEnv(session, "utf-8", "test-session")
	}()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("连接已关闭时 requestUTF8LocaleEnv 不应阻塞")
	}
}
