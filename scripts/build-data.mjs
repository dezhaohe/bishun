// 从 hanzi-writer-data 生成两个数据包：
//  - strokes.json      基础包：《通用规范汉字表》中有数据的字（随应用预缓存）
//  - strokes-trad.json 扩展包：其余的字（主要是繁体/生僻字），用户按需下载
//  - trad-index.json   扩展包字表索引（几 KB，随应用预缓存，用于识别"可下载"的字）
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCantoChars } from './canto.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// 默认全量规范字表；设置 CHAR_LIMIT 可裁剪（字表按一级→二级→三级排序，
// 如 CHAR_LIMIT=3500 只保留一级常用字，基础包从 ~19.5MB 降到 ~9MB）
const limit = Number(process.env.CHAR_LIMIT) || Infinity;
const chars = JSON.parse(readFileSync(join(root, 'scripts/gsc-chars.json'), 'utf8')).slice(0, limit);
const dataDir = join(root, 'node_modules/hanzi-writer-data');
const outDir = join(root, 'public/data');

const read = (ch) => JSON.parse(readFileSync(join(dataDir, `${ch}.json`), 'utf8'));
// 坐标取整（1024 单位坐标系，取整无可见差异），可减小体积
const compact = (map) =>
  JSON.stringify(map).replace(/-?\d+\.\d+/g, (n) => String(Math.round(Number(n))));

// 基础包
const base = {};
const baseSet = new Set();
let missing = 0;
for (const ch of chars) {
  if (existsSync(join(dataDir, `${ch}.json`))) {
    base[ch] = read(ch);
    baseSet.add(ch);
  } else {
    missing++;
  }
}

// 扩展包：数据源里所有不在基础包中的单字（繁体字、部件、生僻字）
const trad = {};
for (const f of readdirSync(dataDir)) {
  if (!f.endsWith('.json') || f === 'package.json') continue;
  const ch = f.slice(0, -5);
  if ([...ch].length !== 1 || baseSet.has(ch)) continue;
  trad[ch] = read(ch);
}

// 合成的粤语字并入扩展包（开源数据源未覆盖，见 canto.mjs）
const canto = buildCantoChars(dataDir);
let cantoCount = 0;
for (const [ch, data] of Object.entries(canto)) {
  if (!baseSet.has(ch) && !trad[ch]) {
    trad[ch] = data;
    cantoCount++;
  }
}

mkdirSync(outDir, { recursive: true });
const baseJson = compact(base);
const tradJson = compact(trad);
writeFileSync(join(outDir, 'strokes.json'), baseJson);
writeFileSync(join(outDir, 'strokes-trad.json'), tradJson);
writeFileSync(join(outDir, 'trad-index.json'), JSON.stringify(Object.keys(trad).join('')));

const mb = (s) => (s.length / 1024 / 1024).toFixed(1);
console.log(`基础包 strokes.json: ${baseSet.size} 字, ${mb(baseJson)} MB`);
console.log(`扩展包 strokes-trad.json: ${Object.keys(trad).length} 字, ${mb(tradJson)} MB（含合成粤语字 ${cantoCount} 个）`);
if (missing) console.warn(`规范字表中缺数据的字: ${missing} 个（数据源未覆盖，多为三级生僻字）`);
