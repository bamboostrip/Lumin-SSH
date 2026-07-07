package main

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/pkg/sftp"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type localArchiveStats struct {
	TotalBytes int64
	FileCount  int64
	DirCount   int64
}

type compressedUploadTask struct {
	id        string
	sessionId string
	cancel    context.CancelFunc

	mu            sync.Mutex
	tempDir       string
	remoteArchive string
}

type compressedUploadSessionLimiter struct {
	mu     sync.Mutex
	active int
}

var compressedUploadTasks sync.Map // uploadId -> *compressedUploadTask
var compressedUploadSlots sync.Map // sessionId -> *compressedUploadSessionLimiter

func clampPercent(value float64) float64 {
	if value < 0 {
		return 0
	}
	if value > 100 {
		return 100
	}
	return value
}

func (task *compressedUploadTask) setTempDir(tempDir string) {
	task.mu.Lock()
	task.tempDir = tempDir
	task.mu.Unlock()
}

func (task *compressedUploadTask) clearTempDir() {
	task.mu.Lock()
	task.tempDir = ""
	task.mu.Unlock()
}

func (task *compressedUploadTask) setRemoteArchive(remoteArchive string) {
	task.mu.Lock()
	task.remoteArchive = remoteArchive
	task.mu.Unlock()
}

func (task *compressedUploadTask) clearRemoteArchive() {
	task.mu.Lock()
	task.remoteArchive = ""
	task.mu.Unlock()
}

func (task *compressedUploadTask) snapshot() (string, string) {
	task.mu.Lock()
	defer task.mu.Unlock()
	return task.tempDir, task.remoteArchive
}

func (task *compressedUploadTask) cleanup(m *SSHManager) {
	tempDir, remoteArchive := task.snapshot()
	if tempDir != "" {
		_ = os.RemoveAll(tempDir)
		task.clearTempDir()
	}
	if remoteArchive != "" {
		_ = m.DeleteItem(task.sessionId, remoteArchive, false)
		task.clearRemoteArchive()
	}
}

func getCompressedUploadSessionLimiter(sessionId string) *compressedUploadSessionLimiter {
	limiter, _ := compressedUploadSlots.LoadOrStore(sessionId, &compressedUploadSessionLimiter{})
	if typed, ok := limiter.(*compressedUploadSessionLimiter); ok && typed != nil {
		return typed
	}
	fallback := &compressedUploadSessionLimiter{}
	compressedUploadSlots.Store(sessionId, fallback)
	return fallback
}

func acquireCompressedUploadSlot(sessionId string, limit int, ctx context.Context) (*compressedUploadSessionLimiter, error) {
	if limit < 1 {
		limit = 1
	}
	limiter := getCompressedUploadSessionLimiter(sessionId)
	for {
		limiter.mu.Lock()
		if limiter.active < limit {
			limiter.active++
			limiter.mu.Unlock()
			return limiter, nil
		}
		limiter.mu.Unlock()

		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(150 * time.Millisecond):
		}
	}
}

func releaseCompressedUploadSlot(limiter *compressedUploadSessionLimiter) {
	if limiter == nil {
		return
	}
	limiter.mu.Lock()
	if limiter.active > 0 {
		limiter.active--
	}
	limiter.mu.Unlock()
}

func registerCompressedUploadTask(uploadID string, task *compressedUploadTask) error {
	if uploadID == "" {
		return fmt.Errorf("missing upload id")
	}
	if _, loaded := compressedUploadTasks.LoadOrStore(uploadID, task); loaded {
		return fmt.Errorf("compressed upload already exists")
	}
	return nil
}

func unregisterCompressedUploadTask(uploadID string, task *compressedUploadTask) {
	if current, ok := compressedUploadTasks.Load(uploadID); ok && current == task {
		compressedUploadTasks.Delete(uploadID)
	}
}

func (m *SSHManager) abortCompressedUploadTaskByID(uploadID string, task *compressedUploadTask) {
	if task == nil {
		return
	}
	task.cancel()
	task.cleanup(m)
	if uploadID != "" {
		compressedUploadTasks.Delete(uploadID)
	}
}

func (m *SSHManager) AbortCompressedUpload(identifier string) error {
	identifier = strings.TrimSpace(identifier)
	if identifier == "" {
		return fmt.Errorf("missing upload identifier")
	}

	if current, ok := compressedUploadTasks.Load(identifier); ok {
		task, _ := current.(*compressedUploadTask)
		m.abortCompressedUploadTaskByID(identifier, task)
		return nil
	}

	compressedUploadTasks.Range(func(key, value any) bool {
		uploadID, _ := key.(string)
		task, _ := value.(*compressedUploadTask)
		if task != nil && task.sessionId == identifier {
			m.abortCompressedUploadTaskByID(uploadID, task)
		}
		return true
	})
	return nil
}

func (m *SSHManager) emitCompressedUploadProgress(sessionId string, uploadID string, phase string, progress float64, phaseProgress float64, bytesDone int64, bytesTotal int64, current string, detail string) {
	if m.ctx == nil {
		return
	}
	runtime.EventsEmit(m.ctx, "compressed-upload-progress-"+sessionId, map[string]interface{}{
		"uploadId":      uploadID,
		"phase":         phase,
		"progress":      clampPercent(progress),
		"phaseProgress": clampPercent(phaseProgress),
		"bytesDone":     bytesDone,
		"bytesTotal":    bytesTotal,
		"current":       current,
		"detail":        detail,
	})
}

func collectLocalArchiveStats(localPaths []string) (localArchiveStats, error) {
	var stats localArchiveStats
	for _, localPath := range localPaths {
		cleanPath := strings.TrimSpace(localPath)
		if cleanPath == "" {
			continue
		}
		absPath, rootRealPath, info, err := resolveArchiveSourcePath(cleanPath)
		if err != nil {
			return stats, err
		}
		if err := collectLocalArchiveStatsForPath(absPath, rootRealPath, make(map[string]struct{}), &stats); err != nil {
			return stats, err
		}
		if !info.IsDir() {
			continue
		}
	}
	return stats, nil
}

func cleanArchiveName(name string) string {
	name = strings.TrimSpace(strings.ReplaceAll(name, "\\", "/"))
	name = strings.Trim(name, "/")
	if name == "" || name == "." || name == ".." {
		return "upload"
	}
	parts := strings.Split(name, "/")
	cleaned := make([]string, 0, len(parts))
	for _, part := range parts {
		if part == "" || part == "." || part == ".." {
			continue
		}
		cleaned = append(cleaned, part)
	}
	if len(cleaned) == 0 {
		return "upload"
	}
	return strings.Join(cleaned, "/")
}

func ensureCompressedUploadContext(ctx context.Context) error {
	if ctx == nil {
		return nil
	}
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
		return nil
	}
}

func resolveArchiveSourcePath(localPath string) (string, string, os.FileInfo, error) {
	cleanPath := strings.TrimSpace(localPath)
	if cleanPath == "" {
		return "", "", nil, fmt.Errorf("empty local path")
	}

	absPath, err := filepath.Abs(cleanPath)
	if err != nil {
		return "", "", nil, err
	}

	realPath, err := filepath.EvalSymlinks(absPath)
	if err != nil {
		return "", "", nil, fmt.Errorf("failed to resolve link target for %s: %w", absPath, err)
	}
	realPath, err = filepath.Abs(realPath)
	if err != nil {
		return "", "", nil, err
	}

	info, err := os.Stat(absPath)
	if err != nil {
		return "", "", nil, err
	}
	if !info.IsDir() && !info.Mode().IsRegular() {
		return "", "", nil, fmt.Errorf("unsupported file type: %s (%s)", absPath, info.Mode().String())
	}
	return absPath, realPath, info, nil
}

func isPathWithinRoot(rootRealPath string, targetRealPath string) bool {
	rel, err := filepath.Rel(rootRealPath, targetRealPath)
	if err != nil {
		return false
	}
	if rel == "." {
		return true
	}
	return rel != ".." && !strings.HasPrefix(rel, ".."+string(os.PathSeparator))
}

func collectLocalArchiveStatsForPath(localPath string, rootRealPath string, stack map[string]struct{}, stats *localArchiveStats) error {
	_, realPath, info, err := resolveArchiveSourcePath(localPath)
	if err != nil {
		return err
	}
	if !isPathWithinRoot(rootRealPath, realPath) {
		return fmt.Errorf("link target escapes selected root: %s -> %s", localPath, realPath)
	}

	if info.IsDir() {
		if _, exists := stack[realPath]; exists {
			return fmt.Errorf("cyclic link detected: %s -> %s", localPath, realPath)
		}
		stack[realPath] = struct{}{}
		defer delete(stack, realPath)

		stats.DirCount++
		entries, err := os.ReadDir(realPath)
		if err != nil {
			return err
		}
		for _, entry := range entries {
			if err := collectLocalArchiveStatsForPath(filepath.Join(realPath, entry.Name()), rootRealPath, stack, stats); err != nil {
				return err
			}
		}
		return nil
	}

	stats.FileCount++
	stats.TotalBytes += info.Size()
	return nil
}

func writeArchiveHeader(tw *tar.Writer, archiveName string, info os.FileInfo) error {
	header, err := tar.FileInfoHeader(info, "")
	if err != nil {
		return err
	}
	header.Name = cleanArchiveName(archiveName)
	if info.IsDir() && !strings.HasSuffix(header.Name, "/") {
		header.Name += "/"
	}
	return tw.WriteHeader(header)
}

func addRegularFileToTar(ctx context.Context, tw *tar.Writer, realPath string, archiveName string, info os.FileInfo, onProgress func(int64, string)) error {
	if err := ensureCompressedUploadContext(ctx); err != nil {
		return err
	}
	if err := writeArchiveHeader(tw, archiveName, info); err != nil {
		return err
	}

	file, err := os.Open(realPath)
	if err != nil {
		return err
	}
	defer file.Close()

	buf := make([]byte, 1024*1024)
	for {
		if err := ensureCompressedUploadContext(ctx); err != nil {
			return err
		}
		n, readErr := file.Read(buf)
		if n > 0 {
			if _, err := tw.Write(buf[:n]); err != nil {
				return err
			}
			if onProgress != nil {
				onProgress(int64(n), realPath)
			}
		}
		if readErr == io.EOF {
			return nil
		}
		if readErr != nil {
			return readErr
		}
	}
}

func addPathToTar(ctx context.Context, tw *tar.Writer, localPath string, archiveRoot string, rootRealPath string, stack map[string]struct{}, onProgress func(int64, string)) error {
	if err := ensureCompressedUploadContext(ctx); err != nil {
		return err
	}

	_, realPath, info, err := resolveArchiveSourcePath(localPath)
	if err != nil {
		return err
	}
	if !isPathWithinRoot(rootRealPath, realPath) {
		return fmt.Errorf("link target escapes selected root: %s -> %s", localPath, realPath)
	}

	archiveRoot = cleanArchiveName(archiveRoot)
	if info.IsDir() {
		if _, exists := stack[realPath]; exists {
			return fmt.Errorf("cyclic link detected: %s -> %s", localPath, realPath)
		}
		stack[realPath] = struct{}{}
		defer delete(stack, realPath)

		if err := writeArchiveHeader(tw, archiveRoot, info); err != nil {
			return err
		}

		entries, err := os.ReadDir(realPath)
		if err != nil {
			return err
		}
		for _, entry := range entries {
			childPath := filepath.Join(realPath, entry.Name())
			childArchiveName := filepath.ToSlash(filepath.Join(archiveRoot, entry.Name()))
			if err := addPathToTar(ctx, tw, childPath, childArchiveName, rootRealPath, stack, onProgress); err != nil {
				return err
			}
		}
		return nil
	}

	return addRegularFileToTar(ctx, tw, realPath, archiveRoot, info, onProgress)
}

func createLocalTarGz(ctx context.Context, localPaths []string, stats localArchiveStats, onProgress func(int64, int64, string)) (string, string, error) {
	if len(localPaths) == 0 {
		return "", "", fmt.Errorf("no local paths")
	}
	tempDir, err := os.MkdirTemp("", "lumin-upload-*")
	if err != nil {
		return "", "", err
	}
	archiveName := fmt.Sprintf("lumin_upload_%d.tar.gz", time.Now().UnixNano())
	archivePath := filepath.Join(tempDir, archiveName)
	file, err := os.Create(archivePath)
	if err != nil {
		_ = os.RemoveAll(tempDir)
		return "", "", err
	}

	var processedBytes int64
	lastEmit := time.Time{}
	emit := func(current string, force bool) {
		if onProgress == nil {
			return
		}
		now := time.Now()
		if force || now.Sub(lastEmit) > 200*time.Millisecond || processedBytes >= stats.TotalBytes {
			onProgress(processedBytes, stats.TotalBytes, current)
			lastEmit = now
		}
	}
	onBytes := func(n int64, current string) {
		processedBytes += n
		if stats.TotalBytes > 0 && processedBytes > stats.TotalBytes {
			processedBytes = stats.TotalBytes
		}
		emit(current, false)
	}

	gw := gzip.NewWriter(file)
	tw := tar.NewWriter(gw)
	emit("", true)
	for _, localPath := range localPaths {
		if err := ensureCompressedUploadContext(ctx); err != nil {
			_ = tw.Close()
			_ = gw.Close()
			_ = file.Close()
			_ = os.RemoveAll(tempDir)
			return "", "", err
		}
		cleanPath := strings.TrimSpace(localPath)
		if cleanPath == "" {
			continue
		}
		absPath, rootRealPath, _, err := resolveArchiveSourcePath(cleanPath)
		if err != nil {
			_ = tw.Close()
			_ = gw.Close()
			_ = file.Close()
			_ = os.RemoveAll(tempDir)
			return "", "", err
		}
		if err := addPathToTar(ctx, tw, absPath, filepath.Base(filepath.Clean(cleanPath)), rootRealPath, make(map[string]struct{}), onBytes); err != nil {
			_ = tw.Close()
			_ = gw.Close()
			_ = file.Close()
			_ = os.RemoveAll(tempDir)
			return "", "", err
		}
		emit(cleanPath, true)
	}
	if stats.TotalBytes == 0 {
		emit("", true)
	}
	if err := tw.Close(); err != nil {
		_ = gw.Close()
		_ = file.Close()
		_ = os.RemoveAll(tempDir)
		return "", "", err
	}
	if err := gw.Close(); err != nil {
		_ = file.Close()
		_ = os.RemoveAll(tempDir)
		return "", "", err
	}
	if err := file.Close(); err != nil {
		_ = os.RemoveAll(tempDir)
		return "", "", err
	}
	if onProgress != nil {
		onProgress(stats.TotalBytes, stats.TotalBytes, "")
	}
	return archivePath, tempDir, nil
}

func (m *SSHManager) uploadLocalFileWithContext(ctx context.Context, localPath string, remoteDir string, onProgress func(int64, int64)) error {
	sftpClient, err := m.getSFTPClientFromRemoteDirSession(ctx, remoteDir)
	if err != nil {
		return err
	}

	src, err := os.Open(localPath)
	if err != nil {
		return err
	}
	defer src.Close()

	destPath := filepath.ToSlash(filepath.Join(remoteDir, filepath.Base(localPath)))
	dst, err := sftpClient.Create(destPath)
	if err != nil {
		return err
	}
	removeDest := true
	defer func() {
		_ = dst.Close()
		if removeDest {
			_ = sftpClient.Remove(destPath)
		}
	}()

	var totalSize int64
	if stat, statErr := src.Stat(); statErr == nil {
		totalSize = stat.Size()
	}

	buf := make([]byte, 2*1024*1024)
	var uploaded int64
	for {
		if err := ensureCompressedUploadContext(ctx); err != nil {
			return err
		}
		n, readErr := src.Read(buf)
		if n > 0 {
			if _, err := dst.Write(buf[:n]); err != nil {
				return err
			}
			uploaded += int64(n)
			if onProgress != nil {
				onProgress(uploaded, totalSize)
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return readErr
		}
	}

	if onProgress != nil {
		onProgress(totalSize, totalSize)
	}
	removeDest = false
	return nil
}

func (m *SSHManager) getSFTPClientFromRemoteDirSession(ctx context.Context, remoteDir string) (*sftp.Client, error) {
	sessionID, ok := ctx.Value("compressedUploadSessionId").(string)
	if !ok || sessionID == "" {
		return nil, fmt.Errorf("compressed upload session missing")
	}
	return m.getSFTPClient(sessionID)
}

func (m *SSHManager) UploadLocalPathsCompressed(sessionId string, uploadID string, maxConcurrent int, localPaths []string, remoteDir string) error {
	paths := make([]string, 0, len(localPaths))
	for _, localPath := range localPaths {
		localPath = strings.TrimSpace(localPath)
		if localPath != "" {
			paths = append(paths, localPath)
		}
	}
	if len(paths) == 0 {
		return fmt.Errorf("no local paths")
	}

	ctx, cancel := context.WithCancel(context.WithValue(context.Background(), "compressedUploadSessionId", sessionId))
	task := &compressedUploadTask{
		id:        uploadID,
		sessionId: sessionId,
		cancel:    cancel,
	}
	if err := registerCompressedUploadTask(uploadID, task); err != nil {
		cancel()
		return err
	}
	defer func() {
		cancel()
		task.cleanup(m)
		unregisterCompressedUploadTask(uploadID, task)
	}()

	limiter, err := acquireCompressedUploadSlot(sessionId, maxConcurrent, ctx)
	if err != nil {
		return err
	}
	defer releaseCompressedUploadSlot(limiter)

	m.emitCompressedUploadProgress(sessionId, uploadID, "preparing", 0, 0, 0, 0, "", fmt.Sprintf("%d paths", len(paths)))

	if len(paths) == 1 {
		info, err := os.Stat(paths[0])
		if err != nil {
			return err
		}
		if !info.IsDir() {
			fileName := filepath.Base(paths[0])
			m.emitCompressedUploadProgress(sessionId, uploadID, "uploading-file", 0, 0, 0, info.Size(), fileName, "")
			if err := m.uploadLocalFileWithContext(ctx, paths[0], remoteDir, func(done int64, total int64) {
				phaseProgress := float64(100)
				if total > 0 {
					phaseProgress = float64(done) / float64(total) * 100
				}
				m.emitCompressedUploadProgress(sessionId, uploadID, "uploading-file", phaseProgress, phaseProgress, done, total, fileName, "")
			}); err != nil {
				return err
			}
			m.emitCompressedUploadProgress(sessionId, uploadID, "completed", 100, 100, info.Size(), info.Size(), fileName, "")
			return nil
		}
	}

	stats, err := collectLocalArchiveStats(paths)
	if err != nil {
		return err
	}
	m.emitCompressedUploadProgress(
		sessionId,
		uploadID,
		"scanning",
		0,
		100,
		0,
		stats.TotalBytes,
		"",
		fmt.Sprintf("%d files, %d directories", stats.FileCount, stats.DirCount),
	)

	archivePath, tempDir, err := createLocalTarGz(ctx, paths, stats, func(done int64, total int64, current string) {
		phaseProgress := float64(100)
		if total > 0 {
			phaseProgress = float64(done) / float64(total) * 100
		}
		m.emitCompressedUploadProgress(sessionId, uploadID, "compressing", phaseProgress*0.5, phaseProgress, done, total, current, "creating local tar.gz")
	})
	if err != nil {
		return err
	}
	task.setTempDir(tempDir)

	archiveSize := int64(0)
	if archiveInfo, statErr := os.Stat(archivePath); statErr == nil {
		archiveSize = archiveInfo.Size()
	}

	fileName := filepath.Base(archivePath)
	m.emitCompressedUploadProgress(sessionId, uploadID, "uploading", 50, 0, 0, archiveSize, fileName, "uploading local tar.gz")
	remoteArchive := filepath.ToSlash(filepath.Join(remoteDir, fileName))
	task.setRemoteArchive(remoteArchive)
	if err := m.uploadLocalFileWithContext(ctx, archivePath, remoteDir, func(done int64, total int64) {
		phaseProgress := float64(100)
		if total > 0 {
			phaseProgress = float64(done) / float64(total) * 100
		}
		overall := 50 + phaseProgress*0.49
		m.emitCompressedUploadProgress(sessionId, uploadID, "uploading", overall, phaseProgress, done, total, fileName, "uploading local tar.gz")
	}); err != nil {
		return err
	}

	m.emitCompressedUploadProgress(sessionId, uploadID, "cleanup-local", 99, 0, 0, 0, fileName, "removing local temporary archive")
	_ = os.RemoveAll(tempDir)
	task.clearTempDir()

	if err := ensureCompressedUploadContext(ctx); err != nil {
		return err
	}
	m.emitCompressedUploadProgress(sessionId, uploadID, "extracting", 99, 0, 0, 0, fileName, "extracting archive on remote server")
	if err := m.UncompressItem(sessionId, remoteArchive); err != nil {
		_ = m.DeleteItem(sessionId, remoteArchive, false)
		task.clearRemoteArchive()
		return err
	}

	if err := ensureCompressedUploadContext(ctx); err != nil {
		return err
	}
	m.emitCompressedUploadProgress(sessionId, uploadID, "cleanup-remote", 99, 0, 0, 0, fileName, "removing remote archive")
	if err := m.DeleteItem(sessionId, remoteArchive, false); err != nil {
		return err
	}
	task.clearRemoteArchive()
	m.emitCompressedUploadProgress(sessionId, uploadID, "completed", 100, 100, 0, 0, "", "completed")
	return nil
}
