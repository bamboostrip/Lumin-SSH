// Wails v3 迁移兼容层：v2 生成的 window['go'] IPC 调用已废弃。
// 这里把 v3 生成的绑定（frontend/bindings/...，基于 @wailsio/runtime 的 Call.ByID）
// 按原模块路径原样再导出，src 下所有 `from 'wailsjs/go/wailsapp/App.js'` 导入无需改动。
// 重新生成绑定后本文件无需变更。
export * from '../../../bindings/luminssh-go/internal/wailsapp/app';
