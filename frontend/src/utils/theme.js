// ── 终端主题定义（深色/浅色两套配色） ──────────────────────────────────────────────
// 四个主题：Lumin Default / Tokyo Night / Catppuccin / Dracula
// 每个主题含 dark 和 light 两套变体，自动跟随 App 浅色/深色模式切换

const TERMINAL_THEMES = {
  'lumin': {
    name: 'Lumin Default',
    swatches: ['#22c55e', '#58a6ff', '#bc8cff', '#0d1117'],
    dark: {
      xterm: {
        // 深色：黄/白/亮色提高饱和度，重点色更醒目
        background: '#00000000', foreground: '#e6edf3', cursor: '#4d9eff',
        cursorAccent: '#0e1218', selectionBackground: '#2563eb',
        selectionForeground: '#ffffff',
        selectionInactiveBackground: '#2563eb',
        black: '#484f58', red: '#ff6b6b', green: '#3dd68c', yellow: '#ffcc33',
        blue: '#6cb6ff', magenta: '#d2a8ff', cyan: '#39d0d6', white: '#d0d7de',
        brightBlack: '#8b949e', brightRed: '#ff8a80', brightGreen: '#56f09c',
        brightYellow: '#ffe066', brightBlue: '#91cbff', brightMagenta: '#e2b6ff',
        brightCyan: '#5ce1e6', brightWhite: '#ffffff',
      },
      container: {
        // 冷蓝黑 + 蓝调 tint
        containerBg: '#0b111a',
        tint: 'rgba(77, 158, 255, 0.10)',
        statusBarBg: 'rgba(12, 28, 48, 0.96)', statusBarBorder: '1px solid rgba(77,158,255,0.42)',
        statusBarColor: '#4d9eff', serverNameColor: '#eaf0f7',
        inputBarBg: 'rgba(12, 28, 48, 0.98)', inputBarBorder: '1px solid rgba(77,158,255,0.36)',
        inputBg: 'rgba(8, 18, 32, 0.94)', inputColor: '#eaf0f7', inputPlaceholder: '#5a6578',
        popupBg: '#121a26', popupBorder: '1px solid rgba(77,158,255,0.28)',
        popupShadow: '0 -8px 32px rgba(0,5,20,0.5), 0 2px 8px rgba(0,5,20,0.3)',
        contextBg: '#121a26', contextBorder: '1px solid rgba(77,158,255,0.28)',
        contextShadow: '0 8px 32px rgba(0,5,20,0.6), 0 2px 8px rgba(0,5,20,0.4)',
        separator: 'rgba(77,158,255,0.22)', mutedColor: '#5a6578',
        btnBorder: 'rgba(77,158,255,0.28)', btnMuted: '#5a6578',
      },
    },
    light: {
      xterm: {
        // 浅色：作背景时黑字要清楚 → 色块用更亮的中亮色；black 保持近黑
        background: '#00000000', foreground: '#0f172a', cursor: '#2563eb',
        cursorAccent: '#ffffff', selectionBackground: '#2563eb',
        selectionForeground: '#ffffff',
        selectionInactiveBackground: '#2563eb',
        black: '#0a0f1a', red: '#b91c1c', green: '#15803d', yellow: '#854d0e',
        blue: '#1d4ed8', magenta: '#7e22ce', cyan: '#0f766e', white: '#e2e8f0',
        brightBlack: '#475569', brightRed: '#dc2626', brightGreen: '#16a34a',
        brightYellow: '#a16207', brightBlue: '#2563eb', brightMagenta: '#9333ea',
        brightCyan: '#0891b2', brightWhite: '#f8fafc',
      },
      container: {
        // 暖白 + 蓝：Lumin 浅色
        containerBg: '#f7f9fc', tint: 'rgba(37, 99, 235, 0.10)',
        statusBarBg: 'rgba(232, 240, 254, 0.98)', statusBarBorder: '1px solid rgba(37,99,235,0.38)',
        statusBarColor: '#1d4ed8', serverNameColor: '#0f172a',
        inputBarBg: 'rgba(232, 240, 254, 0.98)', inputBarBorder: '1px solid rgba(37,99,235,0.30)',
        inputBg: 'rgba(255,255,255,0.95)', inputColor: '#0f172a', inputPlaceholder: '#64748b',
        popupBg: '#ffffff', popupBorder: '1px solid rgba(37,99,235,0.22)',
        popupShadow: '0 -8px 32px rgba(28,25,23,0.1), 0 2px 8px rgba(28,25,23,0.06)',
        contextBg: '#ffffff', contextBorder: '1px solid rgba(37,99,235,0.22)',
        contextShadow: '0 8px 32px rgba(28,25,23,0.12), 0 2px 8px rgba(28,25,23,0.06)',
        separator: 'rgba(37,99,235,0.16)', mutedColor: '#64748b',
        btnBorder: 'rgba(37,99,235,0.24)', btnMuted: '#64748b',
      },
    },
  },
  'tokyo-night': {
    name: 'Tokyo Night',
    swatches: ['#7aa2f7', '#bb9af7', '#73daca', '#1a1b26'],
    dark: {
      xterm: {
        background: '#00000000', foreground: '#c0caf5', cursor: '#7aa2f7',
        cursorAccent: '#1a1b26', selectionBackground: '#3d59a1',
        selectionForeground: '#ffffff',
        selectionInactiveBackground: '#3d59a1',
        black: '#32344a', red: '#ff7a93', green: '#9ece6a', yellow: '#e0af68',
        blue: '#7aa2f7', magenta: '#bb9af7', cyan: '#7dcfff', white: '#a9b1d6',
        brightBlack: '#565f89', brightRed: '#ff9db0', brightGreen: '#b9f27c',
        brightYellow: '#ffc777', brightBlue: '#89b4fa', brightMagenta: '#cbb2ff',
        brightCyan: '#89ddff', brightWhite: '#ffffff',
      },
      container: {
        // 靛蓝夜色 + 靛蓝 tint
        containerBg: '#161821',
        tint: 'rgba(122, 162, 247, 0.12)',
        statusBarBg: 'rgba(28, 32, 58, 0.97)', statusBarBorder: '1px solid rgba(122,162,247,0.48)',
        statusBarColor: '#7aa2f7', serverNameColor: '#c0caf5',
        inputBarBg: 'rgba(28, 32, 58, 0.98)', inputBarBorder: '1px solid rgba(122,162,247,0.40)',
        inputBg: 'rgba(18, 22, 40, 0.94)', inputColor: '#c0caf5', inputPlaceholder: '#565f89',
        popupBg: '#1a1b2e', popupBorder: '1px solid rgba(122,162,247,0.32)',
        popupShadow: '0 -8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
        contextBg: '#1a1b2e', contextBorder: '1px solid rgba(122,162,247,0.32)',
        contextShadow: '0 8px 32px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)',
        separator: 'rgba(122,162,247,0.24)', mutedColor: '#565f89',
        btnBorder: 'rgba(122,162,247,0.30)', btnMuted: '#565f89',
      },
    },
    light: {
      xterm: {
        background: '#00000000', foreground: '#1f2335', cursor: '#1d4ed8',
        cursorAccent: '#ffffff', selectionBackground: '#1d4ed8',
        selectionForeground: '#ffffff',
        selectionInactiveBackground: '#1d4ed8',
        black: '#0c0e18', red: '#b8344e', green: '#286214', yellow: '#724905',
        blue: '#1d57c4', magenta: '#7a30cb', cyan: '#005b76', white: '#d5d9e8',
        brightBlack: '#444b6a', brightRed: '#cf2d4c', brightGreen: '#387a21',
        brightYellow: '#8f5e15', brightBlue: '#245fcb', brightMagenta: '#8536f5',
        brightCyan: '#007197', brightWhite: '#f4f5f9',
      },
      container: {
        // 冷蓝灰 + 靛蓝：Tokyo 浅色
        containerBg: '#e8ecf7', tint: 'rgba(61, 89, 161, 0.14)',
        statusBarBg: 'rgba(214, 222, 245, 0.98)', statusBarBorder: '1px solid rgba(61,89,161,0.42)',
        statusBarColor: '#1d4ed8', serverNameColor: '#1f2335',
        inputBarBg: 'rgba(214, 222, 245, 0.98)', inputBarBorder: '1px solid rgba(61,89,161,0.34)',
        inputBg: 'rgba(255,255,255,0.94)', inputColor: '#1f2335', inputPlaceholder: '#5b6388',
        popupBg: '#eef1f8', popupBorder: '1px solid rgba(61,89,161,0.28)',
        popupShadow: '0 -8px 32px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.06)',
        contextBg: '#eef1f8', contextBorder: '1px solid rgba(61,89,161,0.28)',
        contextShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
        separator: 'rgba(61,89,161,0.18)', mutedColor: '#5b6388',
        btnBorder: 'rgba(61,89,161,0.28)', btnMuted: '#5b6388',
      },
    },
  },
  'catppuccin': {
    name: 'Catppuccin',
    swatches: ['#cba6f7', '#89b4fa', '#a6e3a1', '#1e1e2e'],
    dark: {
      xterm: {
        background: '#00000000', foreground: '#cdd6f4', cursor: '#f5c2e7',
        cursorAccent: '#1e1e2e', selectionBackground: '#7c3aed',
        selectionForeground: '#ffffff',
        selectionInactiveBackground: '#7c3aed',
        black: '#45475a', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af',
        blue: '#89b4fa', magenta: '#f5c2e7', cyan: '#94e2d5', white: '#cdd6f4',
        brightBlack: '#6c7086', brightRed: '#f38ba8', brightGreen: '#b4f0a7',
        brightYellow: '#ffe6a8', brightBlue: '#a6c8ff', brightMagenta: '#f5c2e7',
        brightCyan: '#a6f0e2', brightWhite: '#ffffff',
      },
      container: {
        // 深咖啡紫 + 粉紫 tint
        containerBg: '#181825',
        tint: 'rgba(203, 166, 247, 0.12)',
        statusBarBg: 'rgba(36, 28, 52, 0.97)', statusBarBorder: '1px solid rgba(203,166,247,0.50)',
        statusBarColor: '#cba6f7', serverNameColor: '#cdd6f4',
        inputBarBg: 'rgba(36, 28, 52, 0.98)', inputBarBorder: '1px solid rgba(203,166,247,0.42)',
        inputBg: 'rgba(26, 22, 40, 0.94)', inputColor: '#cdd6f4', inputPlaceholder: '#6c7086',
        popupBg: '#1e1e2e', popupBorder: '1px solid rgba(203,166,247,0.34)',
        popupShadow: '0 -8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
        contextBg: '#1e1e2e', contextBorder: '1px solid rgba(203,166,247,0.34)',
        contextShadow: '0 8px 32px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)',
        separator: 'rgba(203,166,247,0.24)', mutedColor: '#6c7086',
        btnBorder: 'rgba(203,166,247,0.30)', btnMuted: '#6c7086',
      },
    },
    light: {
      xterm: {
        // Catppuccin 浅色：原先粉紫底 + 淡色字整盘发虚，整体加对比
        background: '#00000000', foreground: '#2c2f3a', cursor: '#d20f39',
        cursorAccent: '#ffffff', selectionBackground: '#1e66f5',
        selectionForeground: '#ffffff',
        selectionInactiveBackground: '#1e66f5',
        black: '#11111b', red: '#d20f39', green: '#40a02b', yellow: '#df8e1d',
        blue: '#1e66f5', magenta: '#8839ef', cyan: '#179299', white: '#dce0e8',
        brightBlack: '#6c6f85', brightRed: '#e64553', brightGreen: '#40a02b',
        brightYellow: '#df8e1d', brightBlue: '#04a5e5', brightMagenta: '#ea76cb',
        brightCyan: '#209fb5', brightWhite: '#eff1f5',
      },
      container: {
        // 更实的米白底 + 更深紫状态栏，减少「整屏粉雾」
        containerBg: '#eff1f5', tint: 'rgba(136, 57, 239, 0.06)',
        statusBarBg: 'rgba(220, 214, 240, 0.98)', statusBarBorder: '1px solid rgba(136,57,239,0.45)',
        statusBarColor: '#8839ef', serverNameColor: '#2c2f3a',
        inputBarBg: 'rgba(220, 214, 240, 0.98)', inputBarBorder: '1px solid rgba(136,57,239,0.36)',
        inputBg: 'rgba(255,255,255,0.96)', inputColor: '#2c2f3a', inputPlaceholder: '#6c6f85',
        popupBg: '#eff1f5', popupBorder: '1px solid rgba(136,57,239,0.30)',
        popupShadow: '0 -8px 32px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.06)',
        contextBg: '#eff1f5', contextBorder: '1px solid rgba(136,57,239,0.30)',
        contextShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
        separator: 'rgba(136,57,239,0.20)', mutedColor: '#6c6f85',
        btnBorder: 'rgba(136,57,239,0.30)', btnMuted: '#6c6f85',
      },
    },
  },
  'dracula': {
    name: 'Dracula',
    swatches: ['#ff79c6', '#bd93f9', '#50fa7b', '#282a36'],
    dark: {
      xterm: {
        background: '#00000000', foreground: '#f8f8f2', cursor: '#f8f8f2',
        cursorAccent: '#282a36', selectionBackground: '#bd93f9',
        selectionForeground: '#1e1f29',
        selectionInactiveBackground: '#bd93f9',
        black: '#21222c', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c',
        blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2',
        brightBlack: '#6272a4', brightRed: '#ff6e6e', brightGreen: '#69ff94',
        brightYellow: '#ffffa5', brightBlue: '#d6acff', brightMagenta: '#ff92df',
        brightCyan: '#a4ffff', brightWhite: '#ffffff',
      },
      container: {
        // 偏紫灰 + 粉 tint：最跳一档
        containerBg: '#2b2d3a',
        tint: 'rgba(255, 121, 198, 0.10)',
        statusBarBg: 'rgba(52, 42, 66, 0.97)', statusBarBorder: '1px solid rgba(255,121,198,0.48)',
        statusBarColor: '#ff79c6', serverNameColor: '#f8f8f2',
        inputBarBg: 'rgba(52, 42, 66, 0.98)', inputBarBorder: '1px solid rgba(189,147,249,0.40)',
        inputBg: 'rgba(40, 34, 54, 0.94)', inputColor: '#f8f8f2', inputPlaceholder: '#6272a4',
        popupBg: '#2b2d3a', popupBorder: '1px solid rgba(189,147,249,0.34)',
        popupShadow: '0 -8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
        contextBg: '#2b2d3a', contextBorder: '1px solid rgba(189,147,249,0.34)',
        contextShadow: '0 8px 32px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)',
        separator: 'rgba(255,121,198,0.22)', mutedColor: '#6272a4',
        btnBorder: 'rgba(255,121,198,0.30)', btnMuted: '#6272a4',
      },
    },
    light: {
      xterm: {
        // Dracula 浅色：色块底用中亮色 + 近黑字；亮白底必须浅（不能当深色字用）
        background: '#00000000', foreground: '#1f1f2e', cursor: '#be185d',
        cursorAccent: '#ffffff', selectionBackground: '#7c3aed',
        selectionForeground: '#ffffff',
        selectionInactiveBackground: '#7c3aed',
        black: '#0a0a0f', red: '#e11d48', green: '#16a34a', yellow: '#ca8a04',
        blue: '#7c3aed', magenta: '#db2777', cyan: '#0e7490', white: '#9ca3af',
        brightBlack: '#4b5563', brightRed: '#f43f5e', brightGreen: '#22c55e',
        brightYellow: '#eab308', brightBlue: '#a78bfa', brightMagenta: '#ec4899',
        brightCyan: '#0891b2', brightWhite: '#f3f4f6',
      },
      container: {
        // 近中性浅灰底，粉只留在状态栏识别，减少整屏粉雾
        containerBg: '#f4f4f5', tint: 'rgba(219, 39, 119, 0.03)',
        statusBarBg: 'rgba(253, 242, 248, 0.98)', statusBarBorder: '1px solid rgba(190,24,93,0.40)',
        statusBarColor: '#be185d', serverNameColor: '#1f1f2e',
        inputBarBg: 'rgba(253, 242, 248, 0.98)', inputBarBorder: '1px solid rgba(124,58,237,0.32)',
        inputBg: 'rgba(255,255,255,0.97)', inputColor: '#1f1f2e', inputPlaceholder: '#6b7280',
        popupBg: '#fafafa', popupBorder: '1px solid rgba(124,58,237,0.26)',
        popupShadow: '0 -8px 32px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.06)',
        contextBg: '#fafafa', contextBorder: '1px solid rgba(124,58,237,0.26)',
        contextShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
        separator: 'rgba(190,24,93,0.16)', mutedColor: '#6b7280',
        btnBorder: 'rgba(190,24,93,0.26)', btnMuted: '#6b7280',
      },
    },
  },
};

// 检测 App 浅色/深色模式
export function getAppThemeMode() {
  if (typeof window !== 'undefined' && window.__luminForceDarkTheme === true) {
    return 'dark';
  }
  const mode = localStorage.getItem('themeMode') || 'dark';
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return mode;
}

export function getTerminalTheme() {
  const key = localStorage.getItem('terminalColorTheme') || 'lumin';
  const theme = TERMINAL_THEMES[key] || TERMINAL_THEMES['lumin'];
  const mode = getAppThemeMode() === 'light' ? 'light' : 'dark';
  return theme[mode] || theme.dark;
}

/** 设置页主题列表：名称 + 终端真实会用到的颜色（非装饰用四色点） */
export function listTerminalThemes() {
  const mode = getAppThemeMode() === 'light' ? 'light' : 'dark';
  return Object.entries(TERMINAL_THEMES).map(([key, def]) => {
    const t = def[mode] || def.dark;
    const x = t.xterm || {};
    const c = t.container || {};
    return {
      key,
      name: def.name || key,
      // 与终端实际界面一致：底、状态栏、前景、光标、连接点（不做多余 ANSI 色条）
      preview: {
        containerBg: c.containerBg || '#0e1218',
        statusBarBg: c.statusBarBg || c.containerBg || '#141a23',
        statusBarColor: c.statusBarColor || x.cursor || '#4d9eff',
        foreground: x.foreground || '#cdd9e5',
        cursor: x.cursor || '#4d9eff',
        green: x.green || '#3fb950',
      },
    };
  });
}

// ponytail: hex 颜色转 "r, g, b" 字符串，供 CSS rgba() 使用
export function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}