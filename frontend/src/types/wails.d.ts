/**
 * Wails 桥接全局对象类型声明
 *
 * Wails v3 迁移说明：v3 移除了 window.go / window.runtime 全局，绑定与运行时
 * 走纯模块（wailsjs/ 目录为兼容 shim：绑定指向 v3 生成代码，runtime 指向
 * @wailsio/runtime）。main.tsx 启动时用模块实现重新挂载这两个全局，
 * 历史代码（AI 桥接等 30+ 处）的可选链调用方式保持不变。
 */
import type * as App from '../../wailsjs/go/wailsapp/App';
import type * as AIBindings from '../../wailsjs/go/wailsapp/AIBindings';
import type * as AIProviderBindings from '../../wailsjs/go/wailsapp/AIProviderBindings';

declare global {
  interface Window {
    /** v3 已移除该全局；main.tsx 用 v3 绑定模块重新挂载，供历史桥接代码使用 */
    go?: {
      wailsapp: {
        App: typeof App;
        AIBindings: typeof AIBindings;
        AIProviderBindings: typeof AIProviderBindings;
      };
    };
    /** v3 已移除该全局；main.tsx 用 @wailsio/runtime 兼容 shim 重新挂载 */
    runtime?: typeof import('../../wailsjs/runtime/runtime');
    /** 文件管理器/编辑器状态注入（App 调用处桥接，AI 上下文快照读取） */
    __luminEditorStates?: Record<string, { openFilePaths?: unknown; activeFilePath?: unknown }>;
    __luminFileManagerPaths?: Record<string, unknown>;
  }
}

export {};
