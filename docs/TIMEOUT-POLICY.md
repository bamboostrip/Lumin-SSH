# 超时策略（Timeout Policy）

本文档记录 Lumin-SSH 各类「远端操作 / 网络操作」的超时分层与规则，避免再次出现
「合法长耗时操作被短超时打断」或「卡死后永久挂起」两类问题。

## 分层表

| 场景 | 上限 | 实现位置 | 规则 |
|---|---|---|---|
| 远端短命令（stat/ls/mkdir/探测部署等） | 30s | `sshmanager.remoteCmdShortTimeout` | 只用于秒级命令，不得承载长任务 |
| 远端长命令（tar 压缩/解压、`rm -rf`、git、chmod -R、大文件 cp/mv） | 30min | `sshmanager.remoteCmdLongTimeout` | 必须走 `ExecuteLongCmdWithClientContext`，且必须响应 ctx 取消 |
| 探针一次采集（部署 15s + 运行 45s + 诊断 10s） | 70s 总预算 | `probeTotalBudget` | 必须小于前端等待上限（ProbePanel/BigScreen 90s） |
| 文件管理器长操作（压缩/解压/预览/chmod/删除） | 30min | `fileOperationRegistry` + `AbortFileOperation(opID)` | 必须有取消入口；压缩取消时清理本次新产生的半成品归档 |
| 下载/读文件 SFTP 传输 | 120s 无进展 | `stallguard` + 专用 SFTP 通道 | 只看「是否有进展」，不限制总时长；卡死只断本次专用通道 |
| 上传分片写入 | 5min | `uploadChunkStallTimeout` | 超时关闭该池 client 并丢弃，不阻塞后续分片 |
| R2 对象存储操作 | list/read/write 60s、delete 30s | `internal/config/r2.go` | 幂等操作（list/read）对 5xx/429/408/网络超时重试一次 |
| 前端等待后端 | 必须 > 后端预算 | 各面板常量 | 前端 `Promise.race` 超时只是「放弃等待」，不等于取消；取消必须显式调用 abort 接口 |

## 规则

1. **新增远端长操作必须提供可取消入口**：走 ctx 版本方法，并在 Wails binding
   暴露 `operationId`；前端提供取消按钮（Toast action）。
2. **不要给所有操作统一调大超时**：短命令保持 30s 兜底，避免僵死命令长期占用
   SSH channel（服务端 `MaxSessions` 默认 10）。
3. **阻塞式 IO（SFTP Read/Write）不要只靠 ctx**：`ctx` 无法打断已阻塞的 `Read`；
   需要专用通道 + 看门狗关闭通道，或关闭对应 client。
4. **超时值要成组设计**：后端总预算必须明显小于前端等待上限，否则会出现
   「前端先报超时、后端还在跑」的假超时。
5. **取消后的副作用要写清楚**：解压/删除/递归改权限被取消时，远端可能留下
   部分结果；压缩取消会清理本次产生的新归档，已有同名归档不删除。

## 验证建议

- 大目录（GB 级）下载/上传/右键压缩解压：不再 30s 失败；点取消 1s 内生效。
- 慢服务器探针：90s 内返回结果或明确错误，后端最坏 70s。
- SFTP 卡死（服务端活着但不响应）：120s 后报 `remote SFTP made no progress`，
  其它终端/传输不受影响。
