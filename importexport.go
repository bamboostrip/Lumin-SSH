package main

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"time"
)

// 节点导入/导出功能。
//
// 设计要点：
//   - 导出文件格式为 Lumin-SSH 自有 JSON（明文，含真实密码/私钥），便于跨机器完整还原。
//   - 导入采用"合并（跳过重复）"策略：按 host+port+username 判重，已存在则跳过，仅新增。
//   - 敏感数据全程在后端处理，不经过前端暴露面。
//   - 导入后走 saveConnectionsFile/saveCredentialsFile 自动加密 + 原子写，并触发云同步。

const connectionsExportFormat = "lumin-ssh-connections"

// connectionsExport 节点导出文件的顶层结构
type connectionsExport struct {
	Format      string       `json:"format"` // 固定 lumin-ssh-connections，导入时据此校验来源
	Version     int          `json:"version"`
	ExportedAt  int64        `json:"exportedAt"` // Unix 毫秒时间戳
	Connections []Connection `json:"connections"`
	Credentials []Credential `json:"credentials"` // 仅含被 connection 引用的凭据
}

// skippedItem 记录导入时被跳过（本地已存在）的节点信息
type skippedItem struct {
	Name     string `json:"name"`
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Username string `json:"username"`
}

// ImportResult 导入操作的统计结果
type ImportResult struct {
	Total    int           `json:"total"`    // 文件中的节点总数
	Imported int           `json:"imported"` // 实际新增数
	Skipped  int           `json:"skipped"`  // 跳过的重复数
	Details  []skippedItem `json:"details"`  // 被跳过的节点明细
}

// newConnectionID 生成一个新的连接/凭据 ID（crypto/rand 16 hex 字符，与 SaveConnection 口径一致）
func newConnectionID() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		// 极少触发；回退到纳秒时间戳避免返回空 ID
		return fmt.Sprintf("%x", time.Now().UnixNano())
	}
	return fmt.Sprintf("%x", b)
}

// buildConnectionsExport 组装导出对象：仅保留被 connection 引用的 credential。
func buildConnectionsExport(conns []Connection, creds []Credential) connectionsExport {
	// 收集所有被引用的 credentialId
	referenced := make(map[string]bool)
	for _, c := range conns {
		if c.CredentialID != "" {
			referenced[c.CredentialID] = true
		}
	}
	exportedCreds := make([]Credential, 0, len(referenced))
	for _, cr := range creds {
		if referenced[cr.ID] {
			exportedCreds = append(exportedCreds, cr)
		}
	}
	return connectionsExport{
		Format:      connectionsExportFormat,
		Version:     1,
		ExportedAt:  time.Now().UnixMilli(),
		Connections: conns,
		Credentials: exportedCreds,
	}
}

// connectionKey 返回用于判重的三元组 key（host+port+username，port 缺省 22）
func connectionKey(c Connection) string {
	port := c.Port
	if port == 0 {
		port = 22
	}
	return fmt.Sprintf("%s|%d|%s", c.Host, port, c.Username)
}

// mergeImport 是纯函数：将导入列表与本地列表合并（跳过重复），返回待新增列表与统计结果。
// 不触碰任何存储，便于单元测试。
//
// 判重口径：host+port+username（port 默认 22），与前端 saveServerConfig 一致。
func mergeImport(localConns, importConns []Connection) (toAdd []Connection, result ImportResult) {
	// 本地已存在的三元组集合
	localKeys := make(map[string]bool, len(localConns))
	for _, c := range localConns {
		localKeys[connectionKey(c)] = true
	}
	// 本地已占用的 ID 集合
	localIDs := make(map[string]bool, len(localConns))
	for _, c := range localConns {
		localIDs[c.ID] = true
	}
	// 本次导入已分配的 ID（避免导入文件内部 ID 重复）
	usedIDs := make(map[string]bool, len(importConns))

	now := time.Now().UnixMilli()
	result.Total = len(importConns)
	result.Details = []skippedItem{}
	toAdd = make([]Connection, 0, len(importConns))

	for _, c := range importConns {
		key := connectionKey(c)
		if localKeys[key] {
			// 本地已存在相同 host+port+username，跳过
			result.Skipped++
			port := c.Port
			if port == 0 {
				port = 22
			}
			result.Details = append(result.Details, skippedItem{
				Name:     c.Name,
				Host:     c.Host,
				Port:     port,
				Username: c.Username,
			})
			continue
		}
		// ID 冲突（被本地或本次导入已占用）则重新生成
		if c.ID == "" || localIDs[c.ID] || usedIDs[c.ID] {
			c.ID = newConnectionID()
		}
		usedIDs[c.ID] = true
		c.LastModified = now
		toAdd = append(toAdd, c)
	}
	result.Imported = len(toAdd)
	return toAdd, result
}

// mergeImportCredentials 合并凭据：按 ID 判重，已存在则跳过，否则新增。返回待新增凭据列表。
func mergeImportCredentials(localCreds, importCreds []Credential) []Credential {
	localIDs := make(map[string]bool, len(localCreds))
	for _, cr := range localCreds {
		localIDs[cr.ID] = true
	}
	now := time.Now().UnixMilli()
	usedIDs := make(map[string]bool, len(importCreds))
	toAdd := make([]Credential, 0, len(importCreds))
	for _, cr := range importCreds {
		if cr.ID == "" || localIDs[cr.ID] || usedIDs[cr.ID] {
			// ID 冲突重新生成，保留凭据内容
			cr.ID = newConnectionID()
		}
		usedIDs[cr.ID] = true
		cr.LastModified = now
		toAdd = append(toAdd, cr)
	}
	return toAdd
}

// parseConnectionsExport 解析并校验导入文件内容。
// 容错：port 缺失默认 22，authMethod 缺失按 password。
func parseConnectionsExport(data []byte) (*connectionsExport, error) {
	var exp connectionsExport
	if err := json.Unmarshal(data, &exp); err != nil {
		return nil, fmt.Errorf("解析文件失败：%w", err)
	}
	if exp.Format != connectionsExportFormat {
		return nil, fmt.Errorf("无效的导入文件格式（format 应为 %s）", connectionsExportFormat)
	}
	// 字段容错：补默认值
	for i := range exp.Connections {
		if exp.Connections[i].Port == 0 {
			exp.Connections[i].Port = 22
		}
		if exp.Connections[i].AuthMethod == "" {
			exp.Connections[i].AuthMethod = "password"
		}
	}
	return &exp, nil
}
