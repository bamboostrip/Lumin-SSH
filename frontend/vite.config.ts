import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const buildTime = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
}).format(new Date());

/**
 * TS 迁移期专用：允许 `import './foo.js'` 解析到 `foo.ts`/`foo.tsx`，
 * 避免逐文件改动存量 import 路径。收尾阶段（全部转 TS）后移除。
 */
function jsToTsExtensionAlias(): Plugin {
  return {
    name: 'lumin-js-to-ts-extension-alias',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (!importer || !source.startsWith('.')) return null;
      const isJs = source.endsWith('.js');
      const isJsx = source.endsWith('.jsx');
      if (!isJs && !isJsx) return null;
      const candidates = isJs
        ? [source.slice(0, -3) + '.ts', source.slice(0, -3) + '.tsx']
        : [source.slice(0, -4) + '.tsx', source.slice(0, -4) + '.ts'];
      for (const candidate of candidates) {
        const resolved = await this.resolve(candidate, importer, { skipSelf: true });
        if (resolved) return resolved;
      }
      return null;
    },
  };
}

export default defineConfig({
  define: {
    __APP_BUILD_TIME__: JSON.stringify(buildTime),
  },
  plugins: [react(), jsToTsExtensionAlias()],
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
      },
    },
  },
});
