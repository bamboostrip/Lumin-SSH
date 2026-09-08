//go:build darwin

package platformruntime

// AdjustWindowSize macOS 上不做屏幕自适应收缩。
func AdjustWindowSize(width, height int) (int, int) {
	return width, height
}

// WebviewUserDataPath macOS 上由 WKWebView 自行管理数据目录。
func WebviewUserDataPath() string { return "" }

// WebviewGPUArgs macOS 上无需禁用 GPU 的启动参数。
func WebviewGPUArgs(bool) []string { return nil }
