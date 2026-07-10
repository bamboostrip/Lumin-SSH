# 节点导入/导出功能设计

## 背景与目标

Lumin-SSH 是一个 Wails v2 桌面 SSH 客户端（Go 后端 + React 前端）。目前服务器节点只能逐个在 UI 中手动添加，缺乏批量录入手段。本功能为节点配置增加**导出到文件**和**从文件导入**的能力，解决批量录入 / 跨机器迁移的需求。

## 需求（已与用户确认）

1. **导出文件格式**：Lumin-SSH 自有的 JSON 格式（不兼容第三方 SSH 客户端）。
2. **敏感字段处理**：**明文导出**（password / privateKey / passphrase / proxyPassword 写真实值），便于跨机器完整还原连接。代价是导出文件本身为明文，需用户自行妥善保管。
3. **导入策略**：**合并（跳过重复）**。按 `host+port+username` 三元组判重，本地已存在则跳过（保留本地数据），仅新增不重复的节点。最安全，不会覆盖现有配置。
4. **UI 位置**：主机列表上方工具栏（`Dashboard.jsx`），在"隐藏敏感信息"按钮旁新增导入/导出两个图标按钮。

## 架构决策

逻辑全部放在后端 Go（方案 A）。理由：
- 明文敏感数据不经过前端内存暴露面。
- 直接复用后端已有的 `GetConnections`（已解密）、`saveConnectionsFile`/`saveCredentialsFile`（自动加密 + 原子写）。
- 与项目现有"前端只调 Wails 绑定、数据操作都在后端"的模式一致。
- 前端无法直接写本地文件（无 Node fs），文件 IO 必须在后端。

## 文件格式

```json
{
  "format": "lumin-ssh-connections",
  "version": 1,
  "exportedAt": 1730000000000,
  "connections": [ /* Connection 对象数组（config.go:35-58 的全部字段），明文 */ ],
  "credentials":  [ /* Credential 对象数组（config.go:61-70），仅含被引用的凭据，明文 */ ]
}
```

- `format` 字段用于导入时校验来源，防止误导入无关 JSON。
- 凭据一并导出：扫描所有 connection 的 `credentialId`，把它引用到的 Credential 一并写入 `credentials` 数组。无凭据引用时该数组为空。
- 默认文件名 `lumin-ssh-connections-YYYYMMDD.json`，扩展名 `.json`。

## 后端设计

### 新文件 `importexport.go`

#### 导出数据结构与序列化

```go
type connectionsExport struct {
    Format      string        `json:"format"`
    Version     int           `json:"version"`
    ExportedAt  int64         `json:"exportedAt"`
    Connections []Connection  `json:"connections"`
    Credentials []Credential  `json:"credentials"`
}
```

`buildConnectionsExport(conns, creds)`：组装导出对象，仅保留被 connection 引用的 credential（按 `credentialId` 收集）。

#### 导入合并（纯函数，便于测试）

```go
type skippedItem struct {
    Name     string `json:"name"`
    Host     string `json:"host"`
    Port     int    `json:"port"`
    Username string `json:"username"`
}

type ImportResult struct {
    Total    int           `json:"total"`
    Imported int           `json:"imported"`
    Skipped  int           `json:"skipped"`
    Details  []skippedItem `json:"details"`
}
```

`mergeImport(localConns []Connection, importConns []Connection)`：
- 遍历 importConns，按 `host+port+username`（port 默认 22）与 localConns 比对。
- 重复 → 记入 `skipped`/`Details`。
- 不重复 → 加入待新增列表；若其 `id` 已被本地占用，重新生成 ID；重置 `LastModified = now`。
- 返回 `(toAdd []Connection, result ImportResult)`。纯函数，不碰存储。

字段容错（解析时）：port 缺失默认 22，authMethod 缺失按 `password`。

### ConfigManager 方法（`config.go`）

```go
func (c *ConfigManager) ImportConnections(incoming []Connection, incomingCreds []Credential) (ImportResult, error)
```
- 加写锁。
- 读本地 `getConnectionsLocked()` / `getCredentialsLocked()`。
- 调 `mergeImport` 得到 `toAdd`。
- 凭据去重：按 ID，本地已有则跳过，否则新增（ID 冲突也重新生成）。
- 合并后写回：`saveConnectionsFile` / `saveCredentialsFile`（自动加密 + 原子写）。
- `connCacheDirty`/`credCacheDirty = true`，`bumpSnapshotTime()` + `go c.AutoSync()`（与 `SaveConnection` 一致，触发云同步）。
- 返回 `ImportResult`。

### App 绑定（`app.go`，紧跟 `DeleteConnection` 之后）

```go
func (a *App) ExportConnections() (string, error)
func (a *App) ImportConnections() (ImportResult, error)
```

- **ExportConnections**：弹 `runtime.SaveFileDialog`（默认文件名带日期）；取消 → 返回 `("", nil)`；取 `GetConnections()`（已解密）+ `GetCredentials()` → 组装 → `json.MarshalIndent` → `atomicWriteFile`；返回写入路径。
- **ImportConnections**：弹 `runtime.OpenFileDialog`（限定 `.json`）；取消 → 返回空 `ImportResult` + nil；读文件 → 校验 `format` → 解析 → 调 `configManager.ImportConnections` → 返回结果。

格式校验：`format != "lumin-ssh-connections"` → 返回明确错误。

## 前端设计

### `App.jsx`

新增两个 `useCallback`（与 `handleDeleteServer` 同级）：
- `handleExportServers`：调 `AppGo.ExportConnections()` → 返回路径非空则 `addToast(已导出到 {path})`；用户取消（空串）静默。
- `handleImportServers`：调 `AppGo.ImportConnections()` → 成功则 `addToast(已导入 {imported} 个，跳过 {skipped} 个)` → `loadServers()` 刷新；用户取消静默。

在 `<Dashboard>` 渲染处传入 `onExportServers={handleExportServers}` `onImportServers={handleImportServers}`。

### `Dashboard.jsx`

在右侧控件区（第 80-114 行），"隐藏敏感信息"按钮旁新增：
- 导出按钮（`Download` 图标，`title=导出`）→ `onExportServers`
- 导入按钮（`Upload` 图标，`title=导入`）→ `onImportServers`

样式复用 `btn btn-ghost btn-icon`，用 `Tiptop` 包裹加 tooltip，与现有按钮视觉一致。新增 props `onExportServers`/`onImportServers`。

### i18n（`i18n.js`）

中英文均新增：导入、导出、导出节点、导入节点、`已导出到 {path}`、`已导入 {imported} 个，跳过 {skipped} 个重复`、`导入失败：无效的文件格式`、`导出失败`、`导入失败`。

## 错误处理与边界

- **格式校验**：`format` 字段不是 `lumin-ssh-connections` → 报错。
- **字段兼容**：解析容错缺失字段（port 默认 22、authMethod 默认 password）。
- **文件损坏**：JSON 解析失败 → 明确报错。
- **凭据悬空**：导入的 connection 引用了文件/本地都不存在的 `credentialId` → 仍导入该 connection（用户可后续补凭据），不阻塞。
- **空导出**：无节点时允许导出空 `connections` 数组。
- **取消对话框**：返回空值 + nil，前端静默。

## 测试策略

- 后端单元测试 `mergeImport`（纯函数）：无重复全导入、全重复全跳过、部分重复、ID 冲突重新生成、port 默认值处理。
- 导出格式序列化/反序列化往返测试。
- 手动验证：导出 → 导入到新环境 → 节点完整还原（含明文密码）。

## 不在范围内

- 第三方 SSH 客户端格式导入（FinalShell/Termius/Xshell 等）。
- 加密导出（用户设置的导出密码）。
- CSV/表格导入。
