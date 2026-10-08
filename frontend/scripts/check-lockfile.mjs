// 校验 package-lock.json 内部完整性：所有 dependencies / optionalDependencies
// 依赖边都必须按 node_modules 逐级向上查找规则解析到一个已存在的条目。
//
// 背景：lock 一旦出现「有依赖边、无解析条目」的悬空结构，Linux 的 npm ci
// 校验依赖树时直接 EUSAGE 失败（报 Missing: xxx from lock file），且报错
// 难以定位到根因；Windows 本地 npm install / npm ci --dry-run 完全发现不了。
// 两个已知来源：
//   1) npm ≤ 11.6 在 Windows 上重新生成 lock 时，会裁剪 wasm 平台回退子树
//      （@tailwindcss/oxide-wasm32-wasi 下的 @emnapi/* 等 6 个嵌套条目）；
//      npm ≥ 11.19 已修复，node 24.21.0 LTS 自带 npm 11.19.0。
//   2) 跨上游同步时 git 对 lock 的文本 auto-merge 可能拼出不一致的结构。
// 本脚本在 CI 的 npm ci 之前运行，把这两类问题拦在安装前并给出明确提示。
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
const packages = lock.packages ?? {};

// node 解析算法：从依赖方路径开始，逐级向上尝试 <base>/node_modules/<name>
function resolvePath(fromPath, name) {
  let base = fromPath;
  for (;;) {
    const candidate = base ? `${base}/node_modules/${name}` : `node_modules/${name}`;
    if (packages[candidate]) return candidate;
    if (base === '') return null;
    const idx = base.lastIndexOf('/node_modules/');
    base = idx === -1 ? '' : base.slice(0, idx);
  }
}

const dangling = [];
for (const [path, meta] of Object.entries(packages)) {
  for (const section of ['dependencies', 'optionalDependencies']) {
    for (const name of Object.keys(meta[section] ?? {})) {
      if (!resolvePath(path, name)) dangling.push(`${path || '(根)'} -> ${name}`);
    }
  }
}

if (dangling.length > 0) {
  console.error(`[check-lockfile] 发现 ${dangling.length} 条悬空依赖边，lock 不完整，Linux npm ci 必失败：`);
  for (const edge of dangling) console.error(`  ${edge}`);
  console.error('修复方式：用 npm ≥ 11.19 重新生成 lock（fnm：fnm install --lts 后 npm install），');
  console.error('若条目来自上游合并冲突，可从 upstream/main 的 lock 恢复对应嵌套条目。');
  process.exit(1);
}
console.log(`[check-lockfile] ${Object.keys(packages).length} 个条目的依赖边全部可解析`);
