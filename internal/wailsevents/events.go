// Package wailsevents 提供 v3 下向后兼容的事件发射入口。
// Wails v2 通过 OnStartup 注入的 ctx 调 runtime.EventsEmit(ctx, ...)；
// v3 移除了 ctx 型运行时 API，改为 application.Get().Event.Emit。
// 各内部包（sshmanager/config/ai 等）无法反向依赖 wailsapp 包（会循环引用），
// 故收敛到这个独立小包，并在应用未启动（Get() 返回 nil）时静默丢弃事件，
// 与 v2 中 ctx 为 nil 时的防御行为一致。
package wailsevents

import "github.com/wailsapp/wails/v3/pkg/application"

// Emit 向前端广播一个自定义事件（等价 v2 的 runtime.EventsEmit）。
func Emit(name string, data ...any) {
	if app := application.Get(); app != nil {
		app.Event.Emit(name, data...)
	}
}
