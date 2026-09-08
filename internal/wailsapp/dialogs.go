package wailsapp

// v3 对话框兼容层：v2 的 runtime.SaveFileDialog/OpenFileDialog/OpenMultipleFilesDialog/
// OpenDirectoryDialog(ctx, opts) 统一收敛到这里，改为 app.Dialog.*WithOptions(...).Prompt*。
// 取消时返回空串/nil 切片 + nil error，与 v2 语义一致。

import (
	"fmt"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func requireApp() (*application.App, error) {
	if app := application.Get(); app != nil {
		return app, nil
	}
	return nil, fmt.Errorf("application not running")
}

// saveFileDialog 弹出保存文件对话框（等价 v2 runtime.SaveFileDialog）。
func saveFileDialog(title, defaultFilename, defaultDirectory string, filters []application.FileFilter) (string, error) {
	app, err := requireApp()
	if err != nil {
		return "", err
	}
	return app.Dialog.SaveFileWithOptions(&application.SaveFileDialogOptions{
		Title:     title,
		Filename:  defaultFilename,
		Directory: defaultDirectory,
		Filters:   filters,
	}).PromptForSingleSelection()
}

// openFileDialog 弹出单选文件对话框（等价 v2 runtime.OpenFileDialog）。
func openFileDialog(title, defaultDirectory string, filters []application.FileFilter) (string, error) {
	app, err := requireApp()
	if err != nil {
		return "", err
	}
	return app.Dialog.OpenFileWithOptions(&application.OpenFileDialogOptions{
		Title:          title,
		Directory:      defaultDirectory,
		Filters:        filters,
		CanChooseFiles: true,
	}).PromptForSingleSelection()
}

// openMultipleFilesDialog 弹出多选文件对话框（等价 v2 runtime.OpenMultipleFilesDialog）。
func openMultipleFilesDialog(title, defaultDirectory string, filters []application.FileFilter) ([]string, error) {
	app, err := requireApp()
	if err != nil {
		return nil, err
	}
	return app.Dialog.OpenFileWithOptions(&application.OpenFileDialogOptions{
		Title:                  title,
		Directory:              defaultDirectory,
		Filters:                filters,
		CanChooseFiles:         true,
		AllowsMultipleSelection: true,
	}).PromptForMultipleSelection()
}

// openDirectoryDialog 弹出目录选择对话框（等价 v2 runtime.OpenDirectoryDialog）。
func openDirectoryDialog(title, defaultDirectory string) (string, error) {
	app, err := requireApp()
	if err != nil {
		return "", err
	}
	return app.Dialog.OpenFileWithOptions(&application.OpenFileDialogOptions{
		Title:               title,
		Directory:           defaultDirectory,
		CanChooseDirectories: true,
		CanChooseFiles:      false,
	}).PromptForSingleSelection()
}
