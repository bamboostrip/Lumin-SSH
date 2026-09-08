// Wails v3 迁移兼容层：
// v2 由 wails generate 生成单一 models.ts（各 Go 包一个 export namespace）；
// v3 改为每个包生成独立的 models.ts。此处按 v2 的命名空间结构重新组装，
// src 下 `import { config } from 'wailsjs/go/models.ts'` 等导入无需改动。
// 重新生成绑定后本文件无需变更。
export * as ai from '../../bindings/luminssh-go/internal/ai/models';
export * as aitypes from '../../bindings/luminssh-go/internal/aitypes/models';
export * as config from '../../bindings/luminssh-go/internal/config/models';
export * as mcp from '../../bindings/luminssh-go/internal/mcp/models';
export * as mcpserver from '../../bindings/luminssh-go/internal/mcpserver/models';
export * as programfonts from '../../bindings/luminssh-go/internal/programfonts/models';
export * as provider from '../../bindings/luminssh-go/internal/ai/provider/models';
export * as runtimeenv from '../../bindings/luminssh-go/module/runtimeenv/models';
export * as sshmanager from '../../bindings/luminssh-go/internal/sshmanager/models';
export * as wailsapp from '../../bindings/luminssh-go/internal/wailsapp/models';
