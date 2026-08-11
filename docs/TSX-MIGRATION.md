# JSX → TSX 全面迁移计划

> 目标：将 `frontend/src` 全部 JS/JSX 迁移为 TS/TSX，补全类型。
> 核心原则：**任何时刻项目都可运行、可构建**。每阶段结束必须 `npm run build` 验证通过。
> 分支：`refactor/tsx-migration`（基于 main，不直接提交到 main）

---

## 安全红线（每阶段必须遵守）

1. **每阶段结束**：`npm run build` 通过 + 关键功能手动冒烟（dev 模式起应用）。
2. **每次提交**：只包含该阶段的改动，提交信息注明阶段号（`refactor(tsx): 阶段X ...`）。
3. **禁止**：在未转换完前删除任何 JS 文件 / 移除 `allowJs` / 打开 `checkJs` 全量检查。
4. **迁移顺序**：纯逻辑 → hooks → i18n → 小组件 → 巨兽组件 → 收尾。
5. 类型先「合理」后「严格」：不追求一步到位 100% 精确类型，优先保证可编译可运行。
6. 任何 `any` 的使用需注释说明原因（`// eslint-ignore` 风格或注释），收尾阶段统一清理。

---

## 现状统计（迁移前基线）

| 指标 | 数值 |
|---|---|
| JSX 文件 | 78 |
| JS 文件 | 88 |
| 总代码量 | 118,024 行 |
| 现有 TS/TSX | 0 |
| tsconfig / eslint | 无 |

### 巨型文件（单独攻坚）
- `components/FileManager.jsx` — 8,038 行
- `components/AIPanel.jsx` — 5,905 行
- `components/Terminal.jsx` — 4,382 行
- `components/SettingsModal.jsx` — 2,554 行
- `components/ai/AIProviderSelector.jsx` — 2,178 行
- `components/ai/AIProviderQuickEditOverlay.jsx` — 2,079 行
- `components/ai/AIComposer.jsx` — 1,972 行

### 既有类型资产（Wails 自动生成，直接复用）
- `frontend/wailsjs/go/wailsapp/App.d.ts` — 全部 Go 方法签名
- `frontend/wailsjs/go/wailsapp/AIBindings.d.ts` / `AIProviderBindings.d.ts`
- `frontend/wailsjs/go/models.ts` — Go 结构体模型（7 个 namespace）
- `frontend/wailsjs/runtime/runtime.d.ts` — 事件/窗口 API

---

## 阶段进度

| 阶段 | 内容 | 状态 |
|---|---|---|
| 0 | TS 骨架：tsconfig、vite TS、全局声明、i18n 类型模板 | ✅ 完成 |
| 1 | 纯逻辑转 TS：`utils/`(17) + `constants/`(2) + `config.js` | ✅ 完成 |
| 2 | hooks 转 TS：`hooks/`(17) | 🔄 进行中 |
| 3 | i18n 类型化：28 个语言文件对齐 `zh-CN` 键 | ⏳ |
| 4 | 小组件 JSX→TSX（批量） | ⏳ |
| 5 | 巨兽组件：FileManager / AIPanel / Terminal / SettingsModal / AI 系列 | ⏳ |
| 6 | 收尾：移除 allowJs、严格模式全量通过、回归验证 | ⏳ |

---

## 阶段 0：TS 骨架（详细清单）

- [x] 安装 devDeps：`typescript@^5.9`、`@types/react@^18.3`、`@types/react-dom@^18.3`、`@types/node`
- [x] 创建 `frontend/tsconfig.json`（allowJs: true, checkJs: false, jsx: react-jsx, noEmit, strict）
- [x] 创建 `frontend/tsconfig.node.json`（vite.config.ts 用，独立配置不引用）
- [x] `vite.config.js` → `vite.config.ts`（git mv 保留历史）
- [x] 创建 `src/types/wails.d.ts`：全局 `window.go` 声明（引用 wailsjs d.ts）
- [x] 创建 `src/i18n/types.ts`：以 `zh-CN/basic.js` 推导的翻译键类型模板
- [x] 验证：`npx tsc --noEmit` 无错误 + `npm run build` 通过

> 备注：tsconfig include 仅 `src`，不包含 `wailsjs`（生成的 `.js` 带 `// @ts-check` 会覆盖 checkJs:false；src 内 import 均带 `.js` 后缀，TS 自动映射到同名 `.d.ts`）。

---

## 阶段 1：纯逻辑转 TS（详细清单）

### utils/（17 个，全部完成 ✅）
- [x] `platform.ts` — 平台检测（getModKey/formatShortcut）
- [x] `contextMenu.ts` — 全局右键菜单事件（GlobalContextMenuDetail 类型化）
- [x] `menuPosition.ts` — 菜单位置夹取
- [x] `quickCommandParams.ts` — 快捷命令参数占位符
- [x] `fileTypeClassify.ts` — 文件类型分类
- [x] `recoveryPasswordSync.ts` — 恢复密码同步（泛型 syncWithRecoveryPassword）
- [x] `dragOutClickGuard.ts` — 拖拽失焦抑制
- [x] `terminalCommandAutocompleteParser.ts` — shell 分词器（CommandInputContext 基础类型）
- [x] `terminalCommandAutocompleteRegistry.ts` — 内置命令树（CommandNode/AutocompletePlan）
- [x] `terminalCommandAutocompleteProviders.ts` — 补全候选构建（AutocompleteItem/AutocompleteSources）
- [x] `terminalCommandAutocomplete.ts` — 自动补全入口（对外聚合导出）
- [x] `terminalPaneLayout.ts` — 分屏布局（TerminalPaneCellId 等）
- [x] `sessionWorkspace.ts` — 会话工作区工具
- [x] `terminalKeywordHighlight.ts` — 终端关键字高亮
- [x] `fileWorkbench.ts` — 文件管理器全局 store（事件订阅）
- [x] `theme.ts` — 主题系统（ThemePackage/终端主题，1075 行）
- [x] `programFonts.ts` — 程序字体加载

### constants/（2 个，完成 ✅）
- [x] `terminalEncodings.ts` — 编码分组（TerminalEncodingGroup/Option）
- [x] `zIndex.ts` — `Z` 常量 `as const` + ZIndexKey 类型

### config.js（完成 ✅）
- [x] `config.ts` + `src/vite-env.d.ts`（`__APP_BUILD_TIME__` 全局声明）

### 关键决策
- vite.config.ts 增加自定义 resolve 插件 `lumin-js-to-ts-extension-alias`：
  存量 `import './foo.js'` 自动回退解析 `foo.ts`/`foo.tsx`（vite 5 无 extensionAlias），
  **收尾阶段移除**。`tsconfig.json` include 仅 `src`（wailsjs 生成的 .js 带 `// @ts-check`）。

---

## 验证命令速查

```bash
cd frontend
npx tsc --noEmit          # 类型检查（增量阶段应无错误）
npm run build             # 生产构建（每阶段必跑）
npm run dev               # 开发模式冒烟（手动验证 UI）
npm run i18n:check        # i18n 键完整性检查
```

---

## 风险与对策记录

| 风险 | 对策 |
|---|---|
| 巨兽文件 8k 行迁移出错 | 拆分为多次小提交，每部分独立验证；保持 allowJs 混合运行 |
| `window.go` 在 dev 模式（纯浏览器 vite）下不存在 | 已有可选链/守卫用法（`window.go?.`），迁移时保留，类型用 optional 声明 |
| i18n 28 语言键不一致 | 以 zh-CN 为基准类型，`i18n:check` 脚本辅助验证 |
| `use-stick-to-bottom` 等无类型依赖 | 在 `src/types/` 下补充 module 声明 |
| 事件/消息系统无类型 | 从 Go 侧结构体（models.ts）推导，集中定义消息类型 |
