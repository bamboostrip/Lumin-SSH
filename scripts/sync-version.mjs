// 版本号同步脚本：以传入版本为准，更新所有版本落点。
// 用法: node scripts/sync-version.mjs <version>
// v3 迁移说明：新增 build/windows/info.json 与 build/config.yml 两个落点
// （v3 的 Windows 版本资源与打包元数据不再走 wails.json 模板变量）。
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];
if (!version) {
  console.error('Usage: node scripts/sync-version.mjs <version>');
  process.exit(1);
}

// wails.json（保留作为应用元数据）
const w = JSON.parse(readFileSync('wails.json', 'utf8'));
w.info.productVersion = version;
writeFileSync('wails.json', JSON.stringify(w, null, 2) + '\n');

// frontend/src/config.ts
let c = readFileSync('frontend/src/config.ts', 'utf8');
c = c.replace(/APP_VERSION\s*=\s*'[^']*'/, `APP_VERSION = '${version}'`);
writeFileSync('frontend/src/config.ts', c);

// frontend/package.json + package-lock.json
const p = JSON.parse(readFileSync('frontend/package.json', 'utf8'));
p.version = version;
writeFileSync('frontend/package.json', JSON.stringify(p, null, 2) + '\n');
const pl = JSON.parse(readFileSync('frontend/package-lock.json', 'utf8'));
pl.version = version;
if (pl.packages && pl.packages['']) pl.packages[''].version = version;
writeFileSync('frontend/package-lock.json', JSON.stringify(pl, null, 2) + '\n');

// build/windows/info.json（v3：Windows 版本资源，静态 JSON）
const info = JSON.parse(readFileSync('build/windows/info.json', 'utf8'));
info.fixed.file_version = version;
info.info['0000'].ProductVersion = version;
writeFileSync('build/windows/info.json', JSON.stringify(info, null, '\t') + '\n');

// build/config.yml（v3：打包元数据）
let cfg = readFileSync('build/config.yml', 'utf8');
cfg = cfg.replace(/(\n\s*version:\s*")[^"]*(")/, `$1${version}$2`);
writeFileSync('build/config.yml', cfg);

console.log(`Synced version ${version} to wails.json, config.ts, package.json, package-lock.json, build/windows/info.json, build/config.yml`);
