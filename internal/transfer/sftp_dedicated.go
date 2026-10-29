package transfer

import (
	"fmt"
	"sync"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

// OpenDedicatedSFTPClient 在独立 SSH session 上打开私有 SFTP 通道。
//
// 为什么需要：共享 SFTP client 被下载/编辑读文件/文件管理共用，一旦某次 Read
// 卡住（服务端活着但传输卡死），没有超时参数可打断；关闭共享 client 又会误伤
// 终端与其它传输。专用通道的 closeFn 同时关闭 sftp client 与 session，
// 可让阻塞中的 Read/ReadDir 立刻返回错误。
func OpenDedicatedSFTPClient(sshClient *ssh.Client, tuning Tuning) (*sftp.Client, func(), error) {
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
	client, err := sftp.NewClientPipe(stdout, stdin, SharedSFTPClientOptions(tuning)...)
	if err != nil {
		_ = session.Close()
		return nil, nil, fmt.Errorf("open dedicated sftp client: %w", err)
	}

	var once sync.Once
	closeFn := func() {
		once.Do(func() {
			_ = client.Close()
			_ = session.Close()
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
