//go:build linux || windows

package main

import "github.com/energye/systray"

// Keep the existing standalone systray event loop on Windows and Linux.
func prepareSystray(app *App) func() {
	return func() {
		systray.Quit()
	}
}

func startSystray(app *App) {
	go systray.Run(func() {
		setupSystray(app)
	}, func() {})
}
