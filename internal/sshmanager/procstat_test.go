package sshmanager

import (
	"os/exec"
	"strconv"
	"strings"
	"testing"
)

// statLine 构造 /proc/[pid]/stat 行:pid 与 comm 之外共 23 个数字字段。
func statLine(pid int, comm string, utime, stime, starttime, rss uint64) string {
	return strings.Join([]string{
		strconv.Itoa(pid), "(" + comm + ")", "S", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10",
		strconv.FormatUint(utime, 10), strconv.FormatUint(stime, 10), "13", "14", "15", "16", "17", "18", strconv.FormatUint(starttime, 10), "20",
		strconv.FormatUint(rss, 10), "22", "23", "24",
	}, " ")
}

func TestParseProcStatLineBasic(t *testing.T) {
	// 123 (sshd) S 1 ... utime=100 stime=50 ... starttime=1800 ... rss=256 页
	line := statLine(123, "sshd", 100, 50, 1800, 256)
	s, ok := parseProcStatLine(line)
	if !ok {
		t.Fatal("应解析成功")
	}
	if s.Pid != "123" || s.Comm != "sshd" || s.State != "S" {
		t.Fatalf("pid/comm/state 错误: %+v", s)
	}
	if s.Utime != 100 || s.Stime != 50 || s.Start != 1800 || s.Rss != 256 {
		t.Fatalf("数值字段错误: %+v", s)
	}
}

func TestParseProcStatLineCommWithSpacesAndParens(t *testing.T) {
	// comm 含空格与括号时,以最后一个 ) 为锚点
	line := "456 (foo bar) (baz) S 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24"
	s, ok := parseProcStatLine(line)
	if !ok {
		t.Fatal("应解析成功")
	}
	if s.Pid != "456" || s.Comm != "foo bar) (baz" {
		t.Fatalf("锚点解析错误: %+v", s)
	}
	if s.Utime != 11 || s.Rss != 21 {
		t.Fatalf("锚点后字段偏移错误: %+v", s)
	}
}

func TestParseProcStatLineTooShort(t *testing.T) {
	if _, ok := parseProcStatLine("123 (sshd) S 1 2"); ok {
		t.Fatal("字段不足应解析失败")
	}
	if _, ok := parseProcStatLine("no parens at all"); ok {
		t.Fatal("无括号应解析失败")
	}
}

func TestParseProbeProcSectionsComputesCPUAndCapsTop6(t *testing.T) {
	// 采样间隔 1s:进程 A 消耗 80 tick(80%),B 消耗 5 tick(5%)。
	// C 只出现在第一次采样,D 只出现在第二次,均应收敛丢弃。
	proc1 := []string{
		"1000",
		statLine(1, "procA", 100, 50, 10, 256),
		statLine(2, "procB", 10, 0, 10, 128),
		statLine(3, "procC", 99, 0, 10, 64),
	}
	proc2 := []string{
		"1001",
		statLine(1, "procA", 160, 70, 10, 256),
		statLine(2, "procB", 15, 0, 10, 128),
		statLine(4, "procD", 5, 0, 10, 32),
	}
	procs, err := parseProbeProcSections(proc1, proc2)
	if err != nil {
		t.Fatalf("解析失败: %v", err)
	}
	if len(procs) != 2 {
		t.Fatalf("应只保留双侧采样进程, 得到 %d: %#v", len(procs), procs)
	}
	// 按 cpu 降序: A(80) > B(5)
	if procs[0]["pid"] != "1" || procs[0]["cpu"].(float64) != 80.0 {
		t.Fatalf("procA 应排首位且 cpu=80: %#v", procs[0])
	}
	if procs[1]["pid"] != "2" || procs[1]["cpu"].(float64) != 5.0 {
		t.Fatalf("procB 应排第二且 cpu=5: %#v", procs[1])
	}
	if mem := procs[0]["mem"].(float64); mem != 1.0 {
		t.Fatalf("256 页 ×4KiB = 1MB, 得到 %v", mem)
	}
	if procs[0]["cmd"] != "procA" {
		t.Fatalf("cmd 应为 comm: %v", procs[0]["cmd"])
	}
}

func TestParseProbeProcSectionsTop6CapAndZeroElapsed(t *testing.T) {
	// 时间戳相同(elapsed 回退 1s)+ 超过 6 个进程验证截断
	proc1 := []string{"1000"}
	proc2 := []string{"1000"}
	for i := 1; i <= 8; i++ {
		proc1 = append(proc1, statLine(i, "p"+strconv.Itoa(i), uint64(i), 0, 10, 64))
		proc2 = append(proc2, statLine(i, "p"+strconv.Itoa(i), uint64(i*10), 0, 10, 64))
	}
	procs, err := parseProbeProcSections(proc1, proc2)
	if err != nil {
		t.Fatalf("解析失败: %v", err)
	}
	if len(procs) != 6 {
		t.Fatalf("应截断为 6 条, 得到 %d", len(procs))
	}
	// cpu = Δticks/1s = i*9,进程 8 应排首位
	if procs[0]["pid"] != "8" {
		t.Fatalf("cpu 降序排列错误: %#v", procs[0])
	}
}

func TestParseProcSectionInvalid(t *testing.T) {
	if _, ok := parseProcSection([]string{"not-a-number"}); ok {
		t.Fatal("时间戳非法应失败")
	}
	if _, ok := parseProcSection(nil); ok {
		t.Fatal("空 section 应失败")
	}
}

func TestFormatProcEtime(t *testing.T) {
	cases := []struct {
		sec  float64
		want string
	}{
		{0, "00:00"},
		{59, "00:59"},
		{60, "01:00"},
		{3661, "1:01:01"},
		{90061, "1-01:01:01"},
		{-5, "00:00"}, // 负数(时钟回拨)钳制为 0
	}
	for _, c := range cases {
		if got := formatProcEtime(c.sec); got != c.want {
			t.Fatalf("formatProcEtime(%v) = %q, want %q", c.sec, got, c.want)
		}
	}
}

func TestParseFullProcListOutput(t *testing.T) {
	// uptime=10000s;进程 1(sshd, uid 0→root)与 2(内核线程 kworker,无 cmdline)
	out := strings.Join([]string{
		"10000.5 20000",
		"---PASSWD---",
		"root:0",
		"daemon:1",
		"---PROCS1---",
		"1000",
		procFullLine(1, "sshd", 100, 50, 9000, 256, 2, "0", "/usr/sbin/sshd -D"),
		procFullLine(2, "kworker/0:0", 50, 0, 100, 64, 1, "0", ""),
		"---PROCS2---",
		"1001",
		procFullLine(1, "sshd", 160, 70, 9000, 256, 2, "0", "/usr/sbin/sshd -D"),
		procFullLine(2, "kworker/0:0", 55, 0, 100, 64, 1, "0", ""),
		"---DONE---",
	}, "\n")

	procs, err := parseFullProcListOutput(out)
	if err != nil {
		t.Fatalf("解析失败: %v", err)
	}
	if len(procs) != 2 {
		t.Fatalf("应有 2 个进程, 得到 %d", len(procs))
	}
	p1 := procs[0]
	if p1["pid"] != "1" || p1["cpu"].(float64) != 80.0 {
		t.Fatalf("sshd cpu=80 且排首位: %#v", p1)
	}
	if p1["user"] != "root" || p1["name"] != "sshd" || p1["stat"] != "S" {
		t.Fatalf("user/name/stat 错误: %#v", p1)
	}
	if p1["nlwp"].(uint64) != 2 || p1["mem"].(float64) != 1.0 {
		t.Fatalf("nlwp/mem 错误: %#v", p1)
	}
	if p1["cmd"] != "/usr/sbin/sshd -D" || p1["loc"] != "/usr/sbin/sshd" {
		t.Fatalf("cmd/loc 错误: %#v", p1)
	}
	// etime = 10000 - 9000/100 = 9910s = 2:45:10
	if p1["etime"] != "2:45:10" {
		t.Fatalf("etime 换算错误: %v", p1["etime"])
	}
	// 内核线程:cmd 回退 comm
	p2 := procs[1]
	if p2["cmd"] != "kworker/0:0" || p2["loc"] != "kworker/0:0" {
		t.Fatalf("内核线程 cmd 应回退 comm: %#v", p2)
	}
	if p2["user"] != "root" {
		t.Fatalf("kworker 用户应为 root: %#v", p2)
	}
	// cpu = (55-50)/1 = 5,排在 sshd 之后
	if procs[1]["pid"] != "2" || procs[1]["cpu"].(float64) != 5.0 {
		t.Fatalf("排序错误: %#v", procs)
	}
}

func TestParseFullProcListOutputMalformedLines(t *testing.T) {
	out := strings.Join([]string{
		"10000",
		"---PASSWD---",
		"bad-line-without-colon",
		"root:0",
		"---PROCS1---",
		"1000",
		"1\x1fnot-a-stat-line\x1f1\x1f0\x1f/cmd",   // stat 行非法 → 跳过
		"2\x1fwrong-field-count",                    // 字段数不足 → 跳过
		"---PROCS2---",
		"1001",
		"1\x1fnot-a-stat-line\x1f1\x1f0\x1f/cmd",
		"---DONE---",
	}, "\n")
	procs, err := parseFullProcListOutput(out)
	if err != nil {
		t.Fatalf("解析失败: %v", err)
	}
	if len(procs) != 0 {
		t.Fatalf("非法行应全部跳过: %#v", procs)
	}
}

// procFullLine 构造完整进程列表的一行记录(pid|stat|threads|uid|cmd)。
func procFullLine(pid int, comm string, utime, stime, starttime, rss, threads uint64, uid, cmd string) string {
	return strings.Join([]string{
		strconv.Itoa(pid),
		statLine(pid, comm, utime, stime, starttime, rss),
		strconv.FormatUint(threads, 10),
		uid,
		cmd,
	}, "\x1f")
}

func TestProbeDeployCmdHeredocStructure(t *testing.T) {
	cmd := probeDeployCmd()
	for _, want := range []string{
		"tee ~/.lumin/probe.sh /tmp/.lumin/probe.sh >/dev/null <<'LUMIN_EOF'",
		"---PROC1---",
		"---PROC2---",
		"[ -f ~/.lumin/probe.sh ] || [ -f /tmp/.lumin/probe.sh ]",
	} {
		if !strings.Contains(cmd, want) {
			t.Fatalf("部署命令缺少 %q", want)
		}
	}
	if strings.Contains(cmd, "---PROC---\n") {
		t.Fatal("部署命令不应再包含旧 ps 进程段")
	}
	if strings.Contains(dynamicProbeScript, "LUMIN_EOF") {
		t.Fatal("探针脚本内容不能包含 heredoc 定界符 LUMIN_EOF,否则部署截断")
	}
}

func TestParseRemoteFeatureProbeOutput(t *testing.T) {
	got := parseRemoteFeatureProbeOutput("BUSYBOX=1\nOPENWRT=1\n")
	if got[featureBusybox] != 1 || got[featureOpenWrt] != 1 {
		t.Fatalf("双命中解析错误: %#v", got)
	}
	if len(got) != 2 {
		t.Fatalf("不应有额外字段: %#v", got)
	}

	got = parseRemoteFeatureProbeOutput("  BUSYBOX=1  \ngarbage line\nBUSYBOX=1\n")
	if got[featureBusybox] != 1 {
		t.Fatalf("BUSYBOX 命中解析错误: %#v", got)
	}
	if _, has := got[featureOpenWrt]; has {
		t.Fatalf("未命中特性不应出现: %#v", got)
	}

	if got := parseRemoteFeatureProbeOutput(""); len(got) != 0 {
		t.Fatalf("空输出应为空 map: %#v", got)
	}
}

// 探测命令必须以 0 退出:常规 Linux 上「未匹配」是合法结果,必须能被
// ensureRemoteFeatures 缓存为「否」——历史上探测命令最后一行测试失败会
// 以非零退出,导致每次轮询都重跑探测,且 BUSYBOX=1 输出被当作失败丢弃。
func TestRemoteFeatureProbeCmdExitsZeroUnderPOSIXShell(t *testing.T) {
	sh, err := exec.LookPath("sh")
	if err != nil {
		t.Skip("no POSIX sh available")
	}
	out, err := exec.Command(sh, "-c", remoteFeatureProbeCmd).CombinedOutput()
	if err != nil {
		t.Fatalf("探测命令应以 0 退出, 得到 %v, 输出: %s", err, out)
	}
	parsed := parseRemoteFeatureProbeOutput(string(out))
	for k := range parsed {
		if k != featureBusybox && k != featureOpenWrt {
			t.Fatalf("探测输出含意外标记 %q: %s", k, out)
		}
	}
}

func TestWrapShCmd(t *testing.T) {
	wrapped := wrapShCmd("echo 'a b'")
	want := `sh -c 'echo '\''a b'\'''`
	if wrapped != want {
		t.Fatalf("转义结果: %q, want %q", wrapped, want)
	}

	sh, err := exec.LookPath("sh")
	if err != nil {
		t.Skip("no POSIX sh available")
	}
	// 回环验证:内容含单引号/双引号/多行,经 sh 执行后行为与原命令一致。
	// 这保证 wrapShCmd 的 '\'' 转义不会被外层登录 shell(即使非 bash)误解。
	script := "echo 'quoted' \"double\"\nprintf '%s\\n' 'line2'"
	out, err := exec.Command(sh, "-c", wrapShCmd(script)).CombinedOutput()
	if err != nil {
		t.Fatalf("wrapShCmd 命令执行失败: %v, 输出: %s", err, out)
	}
	if got := string(out); got != "quoted double\nline2\n" {
		t.Fatalf("回环输出不符: %q", got)
	}
}
