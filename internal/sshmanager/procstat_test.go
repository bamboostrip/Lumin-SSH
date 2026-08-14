package sshmanager

import (
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
