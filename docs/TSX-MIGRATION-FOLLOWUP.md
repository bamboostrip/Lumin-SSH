# TSX 迁移后续工作清单（Follow-up）

> 迁移主工程（阶段 0-6）已完成：`frontend/src` 0 个 .js/.jsx、allowJs 关闭、`tsc --noEmit` 零错误、build/i18n:check 全绿。
> 本文档列出**审查（2026-08-11）后遗留的长程事项**，按优先级排序，供后续接手人执行。
> 前置阅读：`docs/TSX-MIGRATION-HANDOFF.md`、`docs/TSX-MIGRATION.md`。

---

## 0. 当前健康度（审计基线）

| 指标 | 数值 |
|---|---|
| src 文件 | 170 个（78 .tsx + 89 .ts + 3 .d.ts），0 个 .js/.jsx |
| 类型化行数 | ~68,758 / 123,613（**55.6%**）|
| `@ts-nocheck` 桥接 | 22 文件 / 3,866 行（3.1%，零类型检查）|
| 语言表（无标注）| 28 文件 / 50,989 行（41.2%，已加 `satisfies I18nDict` 编译期校验）|
| 显式 any | `: any` ×3、`Record<string, any>` ×6、`BridgeData = any` ×1（55 处使用）|
| 逃生通道 | `as I18nKey` ×52（21 文件）、`as unknown` ×31（带注释）、`@ts-ignore` ×0 |

---

## 1. 运行时冒烟测试（最高优先，需 wails 环境）🔴

静态审查无法覆盖的部分，需在真实 wails 桌面环境验证：

- [ ] 服务器连接/保存/移动分组/重命名 —— 验证 toast 修复后的文案（应无 "Error: " 前缀）
- [ ] 终端：连接、分屏、cwd 标签高亮（`isCwdSystemPinnedTab` 修复激活了此前从未渲染的 UI）、搜索、命令历史
- [ ] 文件管理：上传/下载、FileEditor 打开、系统固定 Tab
- [ ] AI 面板：provider 快照轮询（`defaultTokenStoreTitle` 修复点）、对话、mention/斜杠菜单
- [ ] 设置：搜索、各 Tab 切换
- [ ] 主题切换、窗口状态、workspace 持久化恢复
- [ ] 28 语言切换（语言表加了 satisfies 后需确认动态加载无回归）

**验证方法**：`cd frontend && npm run dev`（纯浏览器可测 UI 部分）；完整桌面验证需 `wails dev`。

---

## 2. 去 `@ts-nocheck`：22 个桥接文件类型化（核心长程任务）🟠

22 个文件全部是纯逻辑（无 JSX/React 组件），边界清晰，可机械推进。
**方法**：去掉文件头 `@ts-nocheck` → 以 `tsc --noEmit` 报错为检查清单逐个修 → 每批提交。

**推荐顺序**（依赖关系 + 泄漏面从大到小）：

| 优先级 | 文件 | 备注 |
|---|---|---|
| 1 | `ai/aiProviderBridge.ts` | `normalizeProvider` 返回形状被 AIProviderSelector/AIComposer 消费，`AIProviderLike` 宽松形状依赖它 |
| 2 | `settings/settingDefinitions.ts` | 被 8+ 个 settings Tab 断言消费（SettingsModal.tsx:613 等处的 `as unknown as ...` 全是它造成的连锁） |
| 3 | `ai/aiMentions.ts` | AIComposer 的 mention 状态机 |
| 4 | `ai/aiChatBridge.ts` | `resolveAIChatFollowup` 有 `: any[]` |
| 5 | `ai/chat/aiChatMessageTopology.ts` | `groupConversationMessages`/`getConversationBranchAnchor` 的 `: any[]` |
| 6 | 其余 17 个 | `aiConversationBridge`/`aiConversationBackupBridge`/`aiExecutionContext`/`aiImageCompression`/`aiGlobalSettingsBridge`/`aiSlashCommands`/`aiProviderPasteHandlers`/`inputDragSelect`/`providerSpecialHosts`/`probeFormatting`/`responsesProvider`/`compatibleProvider`/`messagesProvider`/`providers/index.ts`/`settings/proxyNodesBridge`/`settings/runtimeEnvironmentBridge` |

**类型化要点**（来自阶段 6 确立的模式）：
- `.js` 时代 `= []` 默认值推断为 `any[]`，转 `.ts` 后是 `never[]` —— 显式标注参数类型
- `.js` 少传参合法，`.ts` 参数必填 —— 实际可选参数补 `?`
- `@ts-nocheck` 抑制文件内错误但**推断签名仍作用于调用方**，签名级差异需在桥接侧修
- 完成一个桥接后，可移除调用方对应的 `as unknown as X` 断言（SettingsModal.tsx:615,621、NetworkTab.tsx:326 等）

---

## 3. 审计 52 处 `as I18nKey` 逃生 🟡

阶段 3 声称 4 处、阶段 6 后实际 52 处。逐个检查：
- 键在 zh-CN 表中存在 → 去掉逃生（直接 t() 调用）
- 动态拼接键（如 `t(\`${prefix}...\` as I18nKey)`）→ 保留，但确认 t() 兜底行为可接受
- 高价值目标：`useUpdateChecker.ts:316,320`、`terminalCommandAutocompleteProviders.ts:278,322`（阶段 3 原始 4 处，优先复查）

---

## 4. `any` 收敛 🟡

- `AIPanel.tsx:32` `type BridgeData = any`（55 处使用）→ 定义最小 `BridgeData` 接口（字段来自 aiChatBridge 的运行时形状），或在桥接类型化后（事项 2）自然消解
- `SettingsModal.tsx:59-66` `Record<string, any>` ×6 → 随 settingDefinitions 类型化消解
- 注意：`String(...)` 包装 undefined 会得到 `"undefined"`。已知风险位（非迁移回归，但可顺手修）：`NetworkTab.tsx:326` `${String(node?.host)}:${String(node?.port)}`（node 来自桥接）、`AIPanel.tsx:229` `String(value).padStart(2,'0')`

---

## 5. 收尾与合并 🟢

- [ ] 全部 22 桥接类型化后：删除 `TSX-MIGRATION-FOLLOWUP.md` 的对应条目
- [ ] `npm run dev` 冒烟通过后，将 `refactor/tsx-migration` 合并回 `main`（PR 或 ff，见 HANDOFF 3.6 提交规范）
- [ ] 合并前更新 HANDOFF/进度文档中的统计数字

---

## 6. 长期观察项（不需要立即处理）

- **主 bundle 4.4MB**：28 个语言表（51k 行）被 `i18n.ts` 的 eager glob 静态打入主包 —— 预存设计权衡，如需优化可改 dynamic import（非本次迁移引入）
- **`getEffectiveTerminals` 契约收紧**（App.tsx:325-327）：`term.id || ''` 兜底 —— 当前所有会话构造点都产生字符串 id，等价；若未来出现 falsy 非字符串 id 需注意
- **`draft?.` → `draft.`**（AIProviderQuickEditOverlay.tsx:193）：draft 永不为 null（useState 初始化），当前安全；若未来允许 null 需还原 `?.`
- **`i18n:check` 的 `englishCandidates=3` 告警**：base 时代即存在（文件打开相关 3 键），与迁移无关

---

## 7. 本次审计已修复项（存档）

| 事项 | 修复 |
|---|---|
| toast "Error: " 前缀漂移（5 处：App.tsx:1412、useServerCatalog.ts:94/167/212/140） | `err instanceof Error ? err : String(err)` 模式 |
| 阶段 6 遗漏：113 处 `.jsx` 后缀 import（静态 112 + 动态 1）| 补扫为 `.tsx`，消除对 Vite 隐式扩展名替换的依赖 |
| 语言表键一致性仅靠外部脚本 | 27 个语言表（除基准 zh-CN）加 `satisfies I18nDict`，编译期强制（负向测试验证 TS2353 生效）|
| 文档过期（逃生计数 4→52、统计、any 措辞、11 处代码注释）| 已更正 |
