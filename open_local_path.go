package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

func startFirstAvailableCommand(commands ...[]string) error {
	var lastErr error
	for _, command := range commands {
		if len(command) == 0 {
			continue
		}
		if _, err := exec.LookPath(command[0]); err != nil {
			lastErr = err
			continue
		}
		if err := exec.Command(command[0], command[1:]...).Start(); err != nil {
			lastErr = err
			continue
		}
		return nil
	}
	if lastErr != nil {
		return lastErr
	}
	return fmt.Errorf("no supported local opener found")
}

func openLocalPathInExplorer(localPath string, isDirectory bool) error {
	cleaned := filepath.Clean(strings.TrimSpace(localPath))
	if cleaned == "" {
		return fmt.Errorf("missing local path")
	}
	info, err := os.Stat(cleaned)
	if err != nil {
		return err
	}
	if info.IsDir() {
		isDirectory = true
	}
	switch runtime.GOOS {
	case "windows":
		if isDirectory {
			return exec.Command("explorer", cleaned).Start()
		}
		return exec.Command("explorer", "/select,", cleaned).Start()
	case "darwin":
		if isDirectory {
			return exec.Command("open", cleaned).Start()
		}
		return exec.Command("open", "-R", cleaned).Start()
	default:
		if !isDirectory {
			cleaned = filepath.Dir(cleaned)
		}
		return startFirstAvailableCommand(
			[]string{"xdg-open", cleaned},
			[]string{"gio", "open", cleaned},
			[]string{"kde-open", cleaned},
			[]string{"gnome-open", cleaned},
		)
	}
}