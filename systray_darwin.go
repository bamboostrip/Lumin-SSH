//go:build darwin

package main

import "github.com/energye/systray"

// prepareSystray attaches the tray to Wails' AppKit event loop while main is
// still on the macOS main thread. Wails invokes OnStartup from a goroutine.
func prepareSystray(app *App) func() {
	start, end := systray.RunWithExternalLoop(func() {
		setupSystray(app)
	}, func() {})
	start()
	return end
}

// The macOS tray is already started by prepareSystray on the main thread.
func startSystray(app *App) {}
