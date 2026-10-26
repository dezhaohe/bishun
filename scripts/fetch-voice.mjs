// 拼音读音录音：从 npm 官方源下载 cnchar-data（MIT，cnchar 作者维护）的 voice/ 目录，
// 每个「拼音+声调」一个 mp3（如 ni3.mp3、le5.mp3），解出到 public/data/voice/（生成产物，不入库）。
// 不把 cnchar-data 当 npm 依赖装：它把 gulp / lite-server 列为运行时依赖，会拖进几百个无关包；
// 这里只按固定版本下载 tarball 并校验官方源公布的 sha512，取出其中的录音。
// 已解出过就跳过，不重复下载。
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '1.1.0';
const TARBALL = `https://registry.npmjs.org/cnchar-data/-/cnchar-data-${VERSION}.tgz`;
const INTEGRITY =
  'sha512-yruiTj5wm5GMC3IoGGOZmadkw3rNawWK+xHRdoe2lWWEZkzS53DZ5KKAXsNZAR5Airb5ll2wc5RKVZEC5kzOJA==';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public/data/voice');

if (existsSync(outDir) && readdirSync(outDir).some((f) => f.endsWith('.mp3'))) {
  console.log('拼音录音已就绪，跳过下载');
  process.exit(0);
}

console.log(`下载拼音录音 cnchar-data@${VERSION}…`);
const res = await fetch(TARBALL);
if (!res.ok) throw new Error(`下载失败：HTTP ${res.status}`);
const buf = Buffer.from(await res.arrayBuffer());
const got = `sha512-${createHash('sha512').update(buf).digest('base64')}`;
if (got !== INTEGRITY) throw new Error(`校验失败：tarball 的 sha512 与官方源公布的不一致`);

const tmp = mkdtempSync(join(tmpdir(), 'bishun-voice-'));
try {
  const tgz = join(tmp, 'cnchar-data.tgz');
  writeFileSync(tgz, buf);
  execFileSync('tar', ['-xzf', tgz, '-C', tmp, 'package/voice']);
  mkdirSync(dirname(outDir), { recursive: true });
  rmSync(outDir, { recursive: true, force: true });
  renameSync(join(tmp, 'package/voice'), outDir);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`拼音录音：${readdirSync(outDir).length} 个 → public/data/voice/`);
