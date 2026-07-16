// 从 hanzi-writer-data 提取《通用规范汉字表》全量 8105 字中有数据的笔顺，
// 合并为单个 JSON（一次请求即可全部离线缓存）。
// 注：数据源对三级字覆盖率仅 ~31%，缺的字由前端兜底提示。
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chars = JSON.parse(readFileSync(join(root, 'scripts/gsc-chars.json'), 'utf8'));
const dataDir = join(root, 'node_modules/hanzi-writer-data');
const outFile = join(root, 'public/data/strokes.json');

const map = {};
const missing = [];
for (const ch of chars) {
  const file = join(dataDir, `${ch}.json`);
  if (existsSync(file)) {
    map[ch] = JSON.parse(readFileSync(file, 'utf8'));
  } else {
    missing.push(ch);
  }
}

mkdirSync(dirname(outFile), { recursive: true });
// 坐标取整（1024 单位坐标系，取整无可见差异），可减小体积
const json = JSON.stringify(map).replace(/-?\d+\.\d+/g, (n) => String(Math.round(Number(n))));
writeFileSync(outFile, json);
console.log(`strokes.json: ${Object.keys(map).length} 字, ${(json.length / 1024 / 1024).toFixed(1)} MB`);
if (missing.length) console.warn(`缺少笔顺数据的字: ${missing.length} 个（数据源未覆盖，多为三级生僻字）`);
