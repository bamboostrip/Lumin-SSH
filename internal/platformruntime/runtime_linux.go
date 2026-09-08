//go:build linux

package platformruntime

// AdjustWindowSize Linux 上不做屏幕自适应收缩。
func AdjustWindowSize(width, height int) (int, int) {
	return width, height
}

// WebviewUserDataPath Linux 上由 WebKitGTK 自行管理数据目录。
func WebviewUserDataPath() string { return "" }

// WebviewGPUArgs Linux 上如需禁用 GPU 应使用 WebviewGpuPolicy（当前未启用）。
func WebviewGPUArgs(bool) []string { return nil }
