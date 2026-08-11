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
| 2 | hooks 转 TS：`hooks/`(17) | ✅ 完成 |
| 3 | i18n 类型化：28 个语言文件对齐 `zh-CN` 键 | ✅ 完成 |
| 4 | 小组件 JSX→TSX（批量） | 🔄 进行中（42/76 已转） |
| 5 | 巨兽组件：FileManager / AIPanel / Terminal / SettingsModal / AI 系列 | ⏳ |
| 6 | 收尾：移除 allowJs、严格模式全量通过、回归验证 | ⏳ |

---

## 阶段 2：hooks 转 TS（17 个，全部完成 ✅）

- [x] `useToasts.ts` — Toast 管理（ToastItem/ToastAction）
- [x] `useWindowState.ts` — 窗口尺寸记忆（SavedWindowSize）
- [x] `usePanelLayout.ts` — 面板布局（ProbePanelPosition）
- [x] `usePortForwardDialog.ts` — 端口转发对话框（PortForwardInitialMapping）
- [x] `useServerPing.ts` — 服务器 ping（ServerPingResult/PingCounts）
- [x] `useDashboardPreferences.ts` — 仪表盘偏好（ServerListViewMode/DashboardHostPageMode）
- [x] `useWorkspaceSettings.ts` — 工作区设置（WorkspacePersistenceLevel）
- [x] `useSessionWorkspaceModel.ts` — 会话工作区模型
- [x] `useImportExport.ts` — 导入导出（ExportOptions）
- [x] `useServerCatalog.ts` — 服务器目录（ServerFormData）
- [x] `useUpdateChecker.ts` — 更新检查（UpdateCheckResult/compareVersions）
- [x] `useWorkspacePersistence.ts` — 工作区持久化（WorkspaceSessionSnapshot/SnapshotOverrides）
- [x] `useWorkspacePanelDocking.ts` — 面板停靠拖拽（DockRect/FileManagerDockPosition）
- [x] `useAIReview.ts` — AI 变更审查（AIChangeReview/ConversationDiffPanel）
- [x] `useTerminalSubTabs.ts` — 终端子标签滚动/停靠（TerminalDockDragPreview）
- [x] `useTerminalDocking.ts` — 终端分屏停靠
- [x] `useSessionConnections.ts` — 会话连接中枢（1408 行，ConnectingServer/SessionAuthPrompt/SshChannelUsage）

### 全局类型资产（阶段 2 新增）
- `src/types/luminDialog.d.ts` — window.luminDialog 全局 API
- `wails.d.ts` 补充 window.runtime 声明
- `recoveryPasswordSync.ts` 的 sync 参数改为可选（initialError 场景）

---

## 阶段 3：i18n 类型化（完成 ✅）

- [x] `i18n.js` → `i18n.ts`（git mv 保留历史），语言文件保持 `.js` 不动（28 个 × 1810 键）
- [x] `t()` key 参数类型化：`I18nKey`（`keyof typeof zh-CN/basic.js`，字面量 key 拼写错误直接 tsc 报错）
- [x] `setLanguage`/`loadLanguage`/`initializeI18n`/`getLanguage` 类型化：`LanguageCode`（28 语言代码联合类型，`src/i18n/types.ts` 新增）
- [x] `getAvailableLanguages` 返回 `{ code: LanguageCode; label: string }[]`
- [x] 动态 key 逃生：`t(raw as I18nKey)` 共 4 处（useUpdateChecker ×2、terminalCommandAutocompleteProviders ×2），`t()` 内部对未知 key 原样兜底
- [x] `useTranslation` 返回 `{ t: typeof t; lang: LanguageCode }`
- [x] 验证：`tsc --noEmit` 零错误 + `npm run i18n:check` 通过（28 语言 1810 键一致）+ `npm run build` 通过

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

## 阶段 4：小组件 JSX→TSX（完成 ✅ 66/76 + main.tsx）

**已转（66 个，均含 tsc + build 验证）**：
- 基础组件（18）：Tiptop、Toast、SyncFailureToast、ErrorBoundary、UpdateModal、ConnectingCard、SessionAuthCard、SearchableGroupedSelect、GlobalContextMenu、SerialConfigModal、CredentialsModal、CommandHistory、ImportExportDialog、ExportSelectedDialog、MCPServersView、AppTopbar、AppOverlays、GlobalDialog
- 面板/页面（8）：PortForwardDialog、AddServerModal、NetworkPage、ProcessPage、FileUploadQueuePanel、Dashboard、ServerList、main.tsx（入口）
- 设置（11）：SharedComponents、ShortcutsTab、RuntimeEnvironmentTab、GeneralTab、NetworkTab、ColorPicker、KeywordRulesPanel、SyncTab、AppTab、FileManagerTab、AppearanceTab
- AI 面板（29）：IconActionButton、AIPanelHeader、AIProviderListRow、AIChangeReviewWorkbench、MCPAccessView、AISlashCommandsSettings、AIChatMarkdown、AIChatErrorBlock、AIChatToolSessionPane、AIChatMessageActionBar、AIChatMessageActions、AIChatCompletionCard、AIChatContextCondenseCard、AIChatReasoningBlock、AIChatRequestStatusRow、AIChatMCPCard、AIChatCommandCard、AIChatUserMessage、AIChatAssistantTurn、AIChatAssistantBodyPane、AIChatFollowUpCard、AIChatToolCard、AIChatConversation、AIConversationBackupSettings、AIConversationDiffOverlay、AICollaborationPromptDropdown、AIAutoApproveDropdown、AIPanelSettingsOverlay、AIDiffViewerPair

**已确立的转换模式**（含本阶段新增）：
1. `git mv X.jsx X.tsx`（保留历史；`.jsx` import 在 tsc 下自动映射到 `.tsx`，vite 侧由回退插件兜底）
2. 定义 `interface XProps` 并导出（供父级引用）
3. 被 `.jsx` 子组件推断类型卡住时（`never[]`/`string|undefined`），连同子组件一起转
4. `settingDefinitions.js` 等未转 .js 数据源：调用处按实际结构断言（`settings as {...}`）
5. 动态 t() key 用 `as I18nKey` 逃生（附注释）；注入式 t 参数保持宽松 `(key: string)` 签名；helper 内 t 参数用严格 `(key: I18nKey)` 签名（与 useTranslation 返回一致，宽松签名反而不兼容）
6. 复用已转资产：SessionAuthPrompt/ConnectingServer（useSessionConnections）、KeywordRule（terminalKeywordHighlight）、config.Credential（wailsjs models）、GlobalContextMenuDetail（contextMenu）、TopbarSession（AppTopbar）、TabContextMenuState/TerminalTabContextMenuState（AppOverlays）
7. 未导出子组件类型：用 `Parameters<typeof X>[0]` 取 props 类型做断言（如 AIPanelSettingsOverlay 传参 MCPAccessView/MCPServersView）
8. `onSelectChange` 等多态回调：用宽联合类型 `(payload: string | string[] | Array<{id, selected}>) => void`
9. 转换时发现并修复潜在 i18n bug：PortForwardDialog 用不存在的键「本机目标地址」（改复用现有键「本地目标地址」）；FileManagerTab 短键「增大后可能提高同一会话内的 SFTP/SSH 通道占用」缺失（as I18nKey 逃生，留待收尾补 28 语言键）

**剩余（12 个 .jsx）**：App.jsx（1709 行，已开始转换后回退，状态声明区/帮助函数已类型化约 120 行，见 git stash 不可用——下次直接重做前 350 行）、ProbePanel、FileEditor、SessionWorkspace、QuickCommands、AIComposer、AIProviderSelector、AIProviderQuickEditOverlay、SettingsModal、Terminal、AIPanel、FileManager

**App.jsx 转换要点**（下次接手直接照做）：
- 前 350 行（imports + 状态声明 + 帮助函数）的类型化方案已完成并验证可编译（本次回退仅因会话余量不足，非技术障碍）
- 关键：`useToasts` 的 addToast 带 `ToastAction[]` 参数，传给 hooks/组件时需 cast 为 `actions?: unknown[]`；严格 t 传给组件/hooks 时 cast 为 `(key: string, vars?) => string`
- `useServerPing({ serversRef })` 需要 `serversRef as unknown as MutableRefObject<PingServerLike[] | null>`
- `SessionLike` 的索引签名使 `s.id`/`s.terminals` 为 optional，比较/长度判断需 `|| ''` / `(x?.length || 0)` 包装
- index.html 入口已改 `/src/main.tsx`

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
