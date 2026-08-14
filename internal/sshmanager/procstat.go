package sshmanager

// /proc 直读的进程采样解析。探针脚本与 GetFullProcessList 的 BusyBox 路径
// 都输出原始 /proc/[pid]/stat 行,由本文件负责字段提取与 CPU% 计算,
// 不依赖 procps-ng 的 ps(OpenWrt/BusyBox 开箱即用)。

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
)

// procStatSample 单个进程一次采样的解析结果。
type procStatSample struct {
	Pid     string
	Comm    string
	State   string
	Utime   uint64
	Stime   uint64
	Start   uint64 // starttime(ticks since boot),完整进程列表的 etime 换算用
	Rss     uint64 // 内存页数(×4KiB 得 KB)
	Threads uint64
	Uid     string
	Cmd     string
}

// parseProcStatLine 解析 /proc/[pid]/stat 原始行:
//
//	pid (comm) state ppid pgrp session tty tpgid flags minflt cminflt majflt cmajflt
//	utime stime cutime cstime priority nice num_threads itrealvalue starttime vsize rss ...
//
// comm 可能含空格与括号,不能按空白切分;以「最后一个 ) 之后」为其余字段的锚点,
// 括号内为 comm,括号前为 pid。
func parseProcStatLine(line string) (procStatSample, bool) {
	closeIdx := strings.LastIndex(line, ")")
	if closeIdx < 0 {
		return procStatSample{}, false
	}
	head := strings.TrimSpace(line[:closeIdx])
	openIdx := strings.Index(head, "(")
	if openIdx < 0 {
		return procStatSample{}, false
	}
	s := procStatSample{
		Pid:  strings.TrimSpace(head[:openIdx]),
		Comm: strings.TrimSpace(head[openIdx+1:]),
	}
	if s.Pid == "" || s.Comm == "" {
		return procStatSample{}, false
	}
	// 锚点后的字段(1-based 对应 /proc/pid/stat): 1 state, 12 utime, 13 stime, 20 starttime, 22 rss
	tail := strings.Fields(line[closeIdx+2:])
	if len(tail) < 22 {
		return procStatSample{}, false
	}
	s.State = tail[0]
	s.Utime, _ = strconv.ParseUint(tail[11], 10, 64)
	s.Stime, _ = strconv.ParseUint(tail[12], 10, 64)
	s.Start, _ = strconv.ParseUint(tail[19], 10, 64)
	s.Rss, _ = strconv.ParseUint(tail[21], 10, 64)
	return s, true
}

// procSection 一次采集:首行为 date +%s 时间戳,其余行为 stat 原始行。
type procSection struct {
	ts      float64
	samples []procStatSample
}

// parseProcSection 解析一个 PROC section(lines 首行为时间戳)。
func parseProcSection(lines []string) (procSection, bool) {
	if len(lines) < 1 {
		return procSection{}, false
	}
	ts, err := strconv.ParseFloat(strings.TrimSpace(lines[0]), 64)
	if err != nil {
		return procSection{}, false
	}
	sec := procSection{ts: ts}
	for _, l := range lines[1:] {
		l = strings.TrimSpace(l)
		if l == "" {
			continue
		}
		if sample, ok := parseProcStatLine(l); ok {
			sec.samples = append(sec.samples, sample)
		}
	}
	return sec, true
}

// parseProbeProcSections 将探针 PROC1/PROC2 两个采样配成进程列表:
// cpu% = (Δutime+Δstime) / Δ秒(CLK_TCK=100,即每秒 100 tick,满核=100%)。
// 只出现在单侧采样的进程(采样窗口内创建/退出)直接丢弃;按 CPU 降序取前 6,
// 与旧版 `ps ... | head -6` 行为一致。
func parseProbeProcSections(proc1Lines, proc2Lines []string) ([]map[string]interface{}, error) {
	sec1, ok1 := parseProcSection(proc1Lines)
	sec2, ok2 := parseProcSection(proc2Lines)
	if !ok1 || !ok2 {
		return nil, fmt.Errorf("invalid PROC sections")
	}
	elapsed := sec2.ts - sec1.ts
	if elapsed <= 0 {
		elapsed = 1
	}
	first := make(map[string]procStatSample, len(sec1.samples))
	for _, p := range sec1.samples {
		first[p.Pid] = p
	}
	procs := make([]map[string]interface{}, 0, len(sec2.samples))
	for _, p2 := range sec2.samples {
		p1, ok := first[p2.Pid]
		if !ok {
			continue
		}
		ticks := int64(p2.Utime+p2.Stime) - int64(p1.Utime+p1.Stime)
		cpu := float64(ticks) / elapsed
		if cpu < 0 {
			cpu = 0
		}
		procs = append(procs, map[string]interface{}{
			"pid": p2.Pid,
			"cpu": cpu,
			"mem": float64(p2.Rss) * 4.0 / 1024.0, // 页→MB
			"cmd": p2.Comm,
		})
	}
	sort.Slice(procs, func(i, j int) bool {
		return procs[i]["cpu"].(float64) > procs[j]["cpu"].(float64)
	})
	if len(procs) > 6 {
		procs = procs[:6]
	}
	return procs, nil
}
