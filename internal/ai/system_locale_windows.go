//go:build windows

package ai

import (
	"syscall"
	"unsafe"
)

var (
	aiKernel32                  = syscall.NewLazyDLL("kernel32.dll")
	aiGetUserDefaultLocaleName  = aiKernel32.NewProc("GetUserDefaultLocaleName")
)

const aiLocaleNameMaxLength = 85

func detectAISystemLocale() string {
	buffer := make([]uint16, aiLocaleNameMaxLength)
	result, _, _ := aiGetUserDefaultLocaleName.Call(
		uintptr(unsafe.Pointer(&buffer[0])),
		uintptr(len(buffer)),
	)
	if result == 0 {
		return ""
	}
	return syscall.UTF16ToString(buffer)
}