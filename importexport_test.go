package main

import (
	"encoding/json"
	"errors"
	"testing"
)

func TestMergeImport_AllNew(t *testing.T) {
	local := []Connection{}
	incoming := []Connection{
		{ID: "a", Host: "h1", Port: 22, Username: "root"},
		{ID: "b", Host: "h2", Port: 22, Username: "root"},
	}
	toAdd, result := mergeImport(local, incoming)
	if len(toAdd) != 2 {
		t.Fatalf("expected 2 to add, got %d", len(toAdd))
	}
	if result.Total != 2 || result.Imported != 2 || result.Skipped != 0 {
		t.Fatalf("unexpected result: %+v", result)
	}
	// ID 保留
	if toAdd[0].ID != "a" || toAdd[1].ID != "b" {
		t.Fatalf("IDs not preserved: %s %s", toAdd[0].ID, toAdd[1].ID)
	}
	// LastModified 应被重置为非零
	if toAdd[0].LastModified == 0 {
		t.Fatal("LastModified not set")
	}
}

func TestMergeImport_AllDuplicates(t *testing.T) {
	local := []Connection{
		{ID: "x", Host: "h1", Port: 22, Username: "root"},
	}
	incoming := []Connection{
		{ID: "a", Host: "h1", Port: 22, Username: "root"}, // 重复
	}
	toAdd, result := mergeImport(local, incoming)
	if len(toAdd) != 0 {
		t.Fatalf("expected 0 to add, got %d", len(toAdd))
	}
	if result.Skipped != 1 || result.Imported != 0 {
		t.Fatalf("unexpected result: %+v", result)
	}
	if len(result.Details) != 1 || result.Details[0].Host != "h1" {
		t.Fatalf("unexpected details: %+v", result.Details)
	}
}

func TestMergeImport_PartialDuplicate(t *testing.T) {
	local := []Connection{
		{ID: "x", Host: "h1", Port: 22, Username: "root"},
	}
	incoming := []Connection{
		{ID: "a", Host: "h1", Port: 22, Username: "root"}, // 重复
		{ID: "b", Host: "h2", Port: 22, Username: "root"}, // 新增
	}
	toAdd, result := mergeImport(local, incoming)
	if len(toAdd) != 1 {
		t.Fatalf("expected 1 to add, got %d", len(toAdd))
	}
	if toAdd[0].Host != "h2" {
		t.Fatalf("expected h2, got %s", toAdd[0].Host)
	}
	if result.Imported != 1 || result.Skipped != 1 {
		t.Fatalf("unexpected result: %+v", result)
	}
}

func TestMergeImport_PortDefault22(t *testing.T) {
	// 本地 port=22，导入 port=0（缺省），应判为重复
	local := []Connection{
		{ID: "x", Host: "h1", Port: 22, Username: "root"},
	}
	incoming := []Connection{
		{ID: "a", Host: "h1", Port: 0, Username: "root"}, // port 缺省按 22，重复
	}
	toAdd, result := mergeImport(local, incoming)
	if len(toAdd) != 0 {
		t.Fatalf("expected 0 to add (port default 22 dup), got %d", len(toAdd))
	}
	if result.Skipped != 1 {
		t.Fatalf("expected 1 skipped, got %d", result.Skipped)
	}
	if result.Details[0].Port != 22 {
		t.Fatalf("expected detail port 22, got %d", result.Details[0].Port)
	}
}

func TestMergeImport_IDCollisionRegenerated(t *testing.T) {
	local := []Connection{
		{ID: "shared", Host: "h1", Port: 22, Username: "root"},
	}
	incoming := []Connection{
		{ID: "shared", Host: "h2", Port: 22, Username: "admin"}, // host/user 不同，非重复；但 ID 冲突
	}
	toAdd, _ := mergeImport(local, incoming)
	if len(toAdd) != 1 {
		t.Fatalf("expected 1 to add, got %d", len(toAdd))
	}
	if toAdd[0].ID == "shared" {
		t.Fatal("expected ID to be regenerated on collision, still 'shared'")
	}
	if toAdd[0].ID == "" {
		t.Fatal("regenerated ID is empty")
	}
	if toAdd[0].Host != "h2" {
		t.Fatalf("content mismatch: %s", toAdd[0].Host)
	}
}

func TestMergeImport_InternalIDDuplicate(t *testing.T) {
	// 导入文件内部两条记录 ID 相同（数据异常），应重新生成第二条的 ID
	local := []Connection{}
	incoming := []Connection{
		{ID: "dup", Host: "h1", Port: 22, Username: "root"},
		{ID: "dup", Host: "h2", Port: 22, Username: "root"},
	}
	toAdd, result := mergeImport(local, incoming)
	if len(toAdd) != 2 {
		t.Fatalf("expected 2 to add, got %d", len(toAdd))
	}
	if result.Imported != 2 {
		t.Fatalf("expected imported=2, got %d", result.Imported)
	}
	// 两条 ID 必须不同
	if toAdd[0].ID == toAdd[1].ID {
		t.Fatal("internal duplicate IDs not regenerated")
	}
}

func TestParseConnectionsExport_Valid(t *testing.T) {
	raw := `{"format":"lumin-ssh-connections","version":1,"exportedAt":100,"connections":[{"id":"a","host":"h","username":"u"}],"credentials":[]}`
	exp, err := parseConnectionsExport([]byte(raw))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if exp.Format != connectionsExportFormat {
		t.Fatalf("wrong format: %s", exp.Format)
	}
	// port 缺省应补 22，authMethod 缺省应补 password
	if exp.Connections[0].Port != 22 {
		t.Fatalf("expected default port 22, got %d", exp.Connections[0].Port)
	}
	if exp.Connections[0].AuthMethod != "password" {
		t.Fatalf("expected default authMethod password, got %s", exp.Connections[0].AuthMethod)
	}
}

func TestParseConnectionsExport_WrongFormat(t *testing.T) {
	raw := `{"format":"something-else","version":1,"connections":[]}`
	_, err := parseConnectionsExport([]byte(raw))
	if err == nil {
		t.Fatal("expected error for wrong format, got nil")
	}
}

func TestParseConnectionsExport_InvalidJSON(t *testing.T) {
	_, err := parseConnectionsExport([]byte("{not json"))
	if err == nil {
		t.Fatal("expected error for invalid json, got nil")
	}
}

func TestBuildConnectionsExport_OnlyReferencedCreds(t *testing.T) {
	conns := []Connection{
		{ID: "c1", Host: "h1", Username: "u", CredentialID: "cred1"},
		{ID: "c2", Host: "h2", Username: "u"}, // 无凭据引用
	}
	creds := []Credential{
		{ID: "cred1", Name: "one"},
		{ID: "cred2", Name: "two"}, // 未被引用，不应导出
	}
	exp := buildConnectionsExport(conns, creds)
	if len(exp.Credentials) != 1 {
		t.Fatalf("expected 1 exported credential, got %d", len(exp.Credentials))
	}
	if exp.Credentials[0].ID != "cred1" {
		t.Fatalf("expected cred1, got %s", exp.Credentials[0].ID)
	}
	if exp.Format != connectionsExportFormat {
		t.Fatalf("wrong format: %s", exp.Format)
	}
}

// 导出 → 导入 往返测试：导出对象序列化后能被 parseConnectionsExport 正确解析
func TestExportImportRoundTrip(t *testing.T) {
	conns := []Connection{
		{ID: "c1", Host: "h1", Port: 22, Username: "root", Password: "secret", AuthMethod: "password"},
	}
	creds := []Credential{}
	exp := buildConnectionsExport(conns, creds)
	data, err := json.Marshal(exp)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}
	parsed, err := parseConnectionsExport(data)
	if err != nil {
		t.Fatalf("parse failed: %v", err)
	}
	if len(parsed.Connections) != 1 || parsed.Connections[0].Password != "secret" {
		t.Fatalf("roundtrip lost data: %+v", parsed)
	}
}

func TestMergeImportCredentials_SkipExisting(t *testing.T) {
	local := []Credential{
		{ID: "cred1", Name: "one"},
	}
	incoming := []Credential{
		{ID: "cred1", Name: "one-dup"}, // ID 重复，跳过内容、保留新数据按逻辑是重新生成 ID
		{ID: "cred2", Name: "two"},     // 新增
	}
	toAdd := mergeImportCredentials(local, incoming)
	if len(toAdd) != 2 {
		t.Fatalf("expected 2 to add (both get new/distinct handling), got %d", len(toAdd))
	}
}

// ── 密文导入/导出测试 ──────────────────────────────────────────

// newTestConfigManager 创建一个临时 ConfigManager 用于加解密测试（会生成临时配置目录）。
func newTestConfigManager(t *testing.T) *ConfigManager {
	t.Helper()
	return NewConfigManager()
}

// TestEncryptedRoundTrip_PasswordKey 密文往返：用密码加密 → parseImportData 解密 → 数据一致
func TestEncryptedRoundTrip_PasswordKey(t *testing.T) {
	cm := newTestConfigManager(t)
	exp := buildConnectionsExport([]Connection{
		{ID: "c1", Host: "h1", Port: 22, Username: "root", Password: "secret", AuthMethod: "password"},
	}, []Credential{})
	password := "myPassword123"
	key := sha256Key(password)

	encrypted, err := cm.encryptExportData(exp, key)
	if err != nil {
		t.Fatalf("encrypt failed: %v", err)
	}

	// 用错误密码解密应返回 errNeedPassword
	wrongKey := sha256Key("wrong")
	_, err = cm.parseImportData([]byte(encrypted), [][]byte{}, wrongKey)
	if !errors.Is(err, errNeedPassword) {
		t.Fatalf("expected errNeedPassword with wrong key, got %v", err)
	}

	// 用正确密码解密
	parsed, err := cm.parseImportData([]byte(encrypted), [][]byte{}, key)
	if err != nil {
		t.Fatalf("parse failed: %v", err)
	}
	if len(parsed.Connections) != 1 || parsed.Connections[0].Password != "secret" {
		t.Fatalf("roundtrip lost data: %+v", parsed)
	}
}

// TestParseImportData_Plaintext 明文 JSON 应直接解析，不走解密
func TestParseImportData_Plaintext(t *testing.T) {
	cm := newTestConfigManager(t)
	plainExp := buildConnectionsExport([]Connection{
		{Host: "h1", Port: 22, Username: "root"},
	}, []Credential{})
	data, _ := json.Marshal(plainExp)

	parsed, err := cm.parseImportData(data, [][]byte{}, nil)
	if err != nil {
		t.Fatalf("plaintext parse failed: %v", err)
	}
	if len(parsed.Connections) != 1 || parsed.Connections[0].Host != "h1" {
		t.Fatalf("plaintext data mismatch: %+v", parsed)
	}
}

// TestParseImportData_SyncSnapshotFormat 云端 SyncSnapshot 格式（明文）应能解析
func TestParseImportData_SyncSnapshotFormat(t *testing.T) {
	cm := newTestConfigManager(t)
	snap := SyncSnapshot{
		Connections: []Connection{{Host: "snap-host", Port: 22, Username: "u"}},
	}
	data, _ := json.Marshal(snap)
	// SyncSnapshot 没有 format 字段，tryParseExportJSON 会失败，应回退到 tryParseSnapshotJSON
	parsed, err := cm.parseImportData(data, [][]byte{}, nil)
	if err != nil {
		t.Fatalf("snapshot parse failed: %v", err)
	}
	if len(parsed.Connections) != 1 || parsed.Connections[0].Host != "snap-host" {
		t.Fatalf("snapshot data mismatch: %+v", parsed)
	}
}

// TestParseImportData_EncryptedSnapshot 加密的云端备份格式应能用云端密钥解密
func TestParseImportData_EncryptedSnapshot(t *testing.T) {
	cm := newTestConfigManager(t)
	snap := SyncSnapshot{
		Connections: []Connection{{Host: "cloud-host", Port: 2222, Username: "cloud-user"}},
	}
	snapJSON, _ := json.Marshal(snap)
	cloudKey := sha256Key("fake-cloud-credentials")
	encrypted, err := cm.encryptWithKey(string(snapJSON), cloudKey)
	if err != nil {
		t.Fatalf("encrypt snapshot failed: %v", err)
	}

	// 用云端密钥作为候选密钥，应能解密并识别为 SyncSnapshot
	parsed, err := cm.parseImportData([]byte(encrypted), [][]byte{cloudKey}, nil)
	if err != nil {
		t.Fatalf("encrypted snapshot parse failed: %v", err)
	}
	if len(parsed.Connections) != 1 || parsed.Connections[0].Host != "cloud-host" {
		t.Fatalf("encrypted snapshot data mismatch: %+v", parsed)
	}
}

// TestParseImportData_NeedPassword 无任何正确密钥时返回 errNeedPassword
func TestParseImportData_NeedPassword(t *testing.T) {
	cm := newTestConfigManager(t)
	exp := buildConnectionsExport([]Connection{{Host: "h1"}}, []Credential{})
	realKey := sha256Key("correct")
	encrypted, _ := cm.encryptExportData(exp, realKey)

	// 没有提供任何正确密钥
	_, err := cm.parseImportData([]byte(encrypted), [][]byte{sha256Key("wrong1"), sha256Key("wrong2")}, nil)
	if !errors.Is(err, errNeedPassword) {
		t.Fatalf("expected errNeedPassword, got %v", err)
	}
}

// TestParseImportData_PasswordKeyPriority 用户密码优先于候选密钥
func TestParseImportData_PasswordKeyPriority(t *testing.T) {
	cm := newTestConfigManager(t)
	exp := buildConnectionsExport([]Connection{{Host: "h1", Password: "pw"}}, []Credential{})
	passwordKey := sha256Key("user-password")
	encrypted, _ := cm.encryptExportData(exp, passwordKey)

	// passwordKey 正确，candidateKeys 全错，应优先用 passwordKey 成功
	parsed, err := cm.parseImportData([]byte(encrypted), [][]byte{sha256Key("wrong")}, passwordKey)
	if err != nil {
		t.Fatalf("expected success with passwordKey priority, got %v", err)
	}
	if parsed.Connections[0].Password != "pw" {
		t.Fatalf("data mismatch: %+v", parsed)
	}
}

// TestBuildImportTemplate 模板应包含 2 条样例且格式合法
func TestBuildImportTemplate(t *testing.T) {
	tmpl := buildImportTemplate()
	if tmpl.Format != connectionsExportFormat {
		t.Fatalf("wrong format: %s", tmpl.Format)
	}
	if len(tmpl.Connections) != 2 {
		t.Fatalf("expected 2 sample connections, got %d", len(tmpl.Connections))
	}
	// 应能被 tryParseExportJSON 正确解析
	data, _ := json.Marshal(tmpl)
	parsed, ok := tryParseExportJSON(data)
	if !ok {
		t.Fatal("template should parse as connectionsExport")
	}
	if len(parsed.Connections) != 2 {
		t.Fatalf("parsed template has %d connections", len(parsed.Connections))
	}
}

// TestProviderOrder 同步后端排序：当前模式应排第一
func TestProviderOrder(t *testing.T) {
	order := providerOrder("r2")
	if order[0] != "r2" {
		t.Fatalf("expected r2 first, got %v", order)
	}
	if len(order) != 4 {
		t.Fatalf("expected 4 providers, got %d", len(order))
	}
	// "all" 时保持默认顺序
	orderAll := providerOrder("all")
	if orderAll[0] != "webdav" {
		t.Fatalf("expected webdav first for 'all', got %v", orderAll)
	}
}
