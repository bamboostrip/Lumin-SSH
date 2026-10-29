package transfer

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/binary"
	"net"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"
)

// newHungSFTPTestClient 启动一个假 SSH 服务端：接受 session + sftp subsystem 并回
// 版本包，之后不再响应任何 SFTP 请求（模拟「服务端活着但 sftp-server 卡死」）。
func newHungSFTPTestClient(t *testing.T) *ssh.Client {
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
					go func(ch ssh.Channel, reqs <-chan *ssh.Request) {
						for request := range reqs {
							if request.Type != "subsystem" {
								if request.WantReply {
									_ = request.Reply(false, nil)
								}
								continue
							}
							if request.WantReply {
								_ = request.Reply(true, nil)
							}
							// SSH_FXP_VERSION: length=5, type=2, version=3
							packet := make([]byte, 9)
							binary.BigEndian.PutUint32(packet[0:4], 5)
							packet[4] = 2
							binary.BigEndian.PutUint32(packet[5:9], 3)
							_, _ = ch.Write(packet)
							// 之后故意不再读写：任何 SFTP 请求都会永久等待响应。
						}
					}(channel, channelRequests)
				}
			}(conn)
		}
	}()

	rawConn, err := net.DialTimeout("tcp", listener.Addr().String(), 2*time.Second)
	if err != nil {
		_ = listener.Close()
		t.Fatal(err)
	}
	clientConn, channels, requests, err := ssh.NewClientConn(rawConn, listener.Addr().String(), &ssh.ClientConfig{
		User:            "test",
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         2 * time.Second,
	})
	if err != nil {
		_ = rawConn.Close()
		_ = listener.Close()
		t.Fatal(err)
	}
	client := ssh.NewClient(clientConn, channels, requests)
	t.Cleanup(func() {
		_ = client.Close()
		_ = rawConn.Close()
		_ = listener.Close()
		select {
		case <-serverDone:
		case <-time.After(2 * time.Second):
			t.Error("假 SSH 服务端未退出")
		}
	})
	return client
}

// TestDedicatedSFTPCloseUnblocksBlockedRequest 回归 P0：看门狗关闭专用通道时必须
// 先关 SSH session，让阻塞中的 SFTP 请求返回；且 closeFn 本身不能阻塞调用方。
func TestDedicatedSFTPCloseUnblocksBlockedRequest(t *testing.T) {
	sshClient := newHungSFTPTestClient(t)
	client, closeFn, err := OpenDedicatedSFTPClient(sshClient, DefaultTuning())
	if err != nil {
		t.Fatalf("打开专用通道失败: %v", err)
	}

	requestErr := make(chan error, 1)
	go func() {
		_, openErr := client.Open("/hung")
		requestErr <- openErr
	}()

	// 等 OPEN 请求真正发出去并阻塞。
	time.Sleep(100 * time.Millisecond)

	closeStarted := time.Now()
	closeFn()
	if elapsed := time.Since(closeStarted); elapsed > time.Second {
		t.Fatalf("closeFn 不应阻塞调用方，实际耗时 %v", elapsed)
	}

	select {
	case openErr := <-requestErr:
		if openErr == nil {
			t.Fatal("关闭专用通道后，阻塞中的 Open 应返回错误")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("关闭专用通道后，阻塞中的 Open 仍未返回（看门狗会永久卡死）")
	}
}

// TestDedicatedSFTPCloseIsIdempotent 确保看门狗与 defer 并发调用 closeFn 时不 panic/不阻塞。
func TestDedicatedSFTPCloseIsIdempotent(t *testing.T) {
	sshClient := newHungSFTPTestClient(t)
	_, closeFn, err := OpenDedicatedSFTPClient(sshClient, DefaultTuning())
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan struct{})
	go func() {
		closeFn()
		closeFn()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("重复调用 closeFn 阻塞")
	}
}
