package transfer

import (
	"fmt"
	"log"
	"sync"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

// OpenDedicatedSFTPClient 在独立 SSH session 上打开私有 SFTP 通道。
//
// 为什么需要：共享 SFTP client 被下载/编辑读文件/文件管理共用，一旦某次 Read
// 卡住（服务端活着但传输卡死），没有超时参数可打断；关闭共享 client 又会误伤
// 终端与其它传输。专用通道的 closeFn 会先关闭 SSH session，让阻塞中的
// Read/ReadDir 立刻返回错误。
func OpenDedicatedSFTPClient(sshClient *ssh.Client, tuning Tuning) (*sftp.Client, func(), error) {
	return openDedicatedSFTPClientWithOptions(sshClient, SharedSFTPClientOptions(tuning))
}

// openDedicatedSFTPClientWithOptions 与 OpenDedicatedSFTPClient 相同，但由调用方
// 决定 sftp 选项：下载/读文件用 SharedSFTPClientOptions（32KB 读安全包长），
// 上传池用 buildTunedSFTPOptions（写方向可放大包长）。
func openDedicatedSFTPClientWithOptions(sshClient *ssh.Client, options []sftp.ClientOption) (*sftp.Client, func(), error) {
	if sshClient == nil {
		return nil, nil, fmt.Errorf("ssh client unavailable")
	}
	session, err := sshClient.NewSession()
	if err != nil {
		return nil, nil, fmt.Errorf("open dedicated sftp session: %w", err)
	}
	stdin, err := session.StdinPipe()
	if err != nil {
		_ = session.Close()
		return nil, nil, fmt.Errorf("dedicated sftp stdin: %w", err)
	}
	stdout, err := session.StdoutPipe()
	if err != nil {
		_ = session.Close()
		return nil, nil, fmt.Errorf("dedicated sftp stdout: %w", err)
	}
	if err := session.RequestSubsystem("sftp"); err != nil {
		_ = session.Close()
		return nil, nil, fmt.Errorf("request sftp subsystem: %w", err)
	}
	client, err := sftp.NewClientPipe(stdout, stdin, options...)
	if err != nil {
		_ = session.Close()
		return nil, nil, fmt.Errorf("open dedicated sftp client: %w", err)
	}

	var once sync.Once
	closeFn := func() {
		once.Do(func() {
			// 顺序是关键：必须先发 SSH_MSG_CHANNEL_CLOSE（session.Close）。
			// 对端 sshd 的传输层会回 CLOSE，本地 mux 随即关闭 channel，唤醒
			// 阻塞在 Read/ReadDir 的 goroutine；反过来先 client.Close 的话，
			// pkg/sftp 会阻塞在等待 recv goroutine 的 wg.Wait 上（关闭 stdin
			// 对卡死的 sftp-server 无效），session.Close 永远执行不到，
			// 看门狗和调用方都会永久挂起。
			//
			// 全程异步：closeFn 会被看门狗 goroutine 与调用方 defer 并发调用，
			// 任何同步阻塞都可能卡死调用方，甚至让 sync.Once 永久占用。
			go func() {
				_ = session.Close()
				_ = client.Close()
			}()
		})
	}
	return client, closeFn, nil
}

// openDedicatedSFTP 为单次传输打开专用 SFTP 通道（使用当前调优参数）。
func (s *Service) openDedicatedSFTP(sessionID string) (*sftp.Client, func(), error) {
	sshClient, _, err := s.backend.ClientEntry(sessionID)
	if err != nil {
		return nil, nil, err
	}
	return OpenDedicatedSFTPClient(sshClient, s.Tuning())
}

// openDownloadSFTP 优先使用专用通道；服务器 MaxSessions 紧张/拒绝新 channel 时
// 回退共享 client（保持旧行为，但失去看门狗保护）。dedicated=false 时调用方不启动看门狗。
func (s *Service) openDownloadSFTP(sessionID string) (*sftp.Client, func(), bool, error) {
	client, closeFn, err := s.openDedicatedSFTP(sessionID)
	if err == nil {
		return client, closeFn, true, nil
	}
	shared, sharedErr := s.backend.SFTPClient(sessionID)
	if sharedErr != nil {
		return nil, nil, false, fmt.Errorf("%v; shared sftp unavailable: %w", err, sharedErr)
	}
	log.Printf("[transfer] dedicated sftp unavailable, fallback to shared client: %v", err)
	return shared, func() {}, false, nil
}
