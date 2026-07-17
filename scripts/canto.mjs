// 合成粤语字笔顺数据：开源数据源均未覆盖香港粤语字（哋咗佢冇…），
// 但它们绝大多数是"已有部件 + 已有字"的左右组合。
// 做法：取一个同偏旁的真实字（donor）保留其偏旁笔画（位置来自真实字形），
// 将声旁字（comp）的笔画仿射变换到 donor 被替换部分的包围盒中，
// 笔顺 = 偏旁在前、声旁在后（先左后右），符合书写规范。
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// donor: 提供偏旁的字; keepN: 保留 donor 前 N 笔（偏旁）;
// comp: 声旁字（可指定 from 取其第 from 笔之后的部分）; subset: 直接取某字的部分笔画
const RECIPES = {
  哋: { donor: '味', keepN: 3, comp: '地', jyutping: 'dei6' },
  咗: { donor: '味', keepN: 3, comp: '左', jyutping: 'zo2' },
  咁: { donor: '味', keepN: 3, comp: '甘', jyutping: 'gam3' },
  啲: { donor: '味', keepN: 3, comp: '的', jyutping: 'di1' },
  嗰: { donor: '味', keepN: 3, comp: '個', jyutping: 'go2' },
  嚟: { donor: '味', keepN: 3, comp: '黎', jyutping: 'lai4' },
  嗮: { donor: '味', keepN: 3, comp: '晒', jyutping: 'saai3' },
  噉: { donor: '味', keepN: 3, comp: '敢', jyutping: 'gam2' },
  喺: { donor: '味', keepN: 3, comp: '奚', jyutping: 'hai2' },
  喎: { donor: '味', keepN: 3, comp: '咼', jyutping: 'wo3' },
  嘥: { donor: '味', keepN: 3, comp: '徙', jyutping: 'saai1' },
  佢: { donor: '仁', keepN: 2, comp: '巨', jyutping: 'keoi5' },
  諗: { donor: '說', keepN: 7, comp: '念', jyutping: 'nam2' },
  攞: { donor: '提', keepN: 3, comp: '羅', jyutping: 'lo2' },
  搵: { donor: '提', keepN: 3, comp: { char: '温', from: 3 }, jyutping: 'wan2' },
  冇: { subset: '有', keep: [0, 1, 2, 3], jyutping: 'mou5' },
};

const num = /-?\d+(?:\.\d+)?/g;

function pathPoints(d) {
  const nums = d.match(num).map(Number);
  const pts = [];
  for (let i = 0; i < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  return pts;
}

function bbox(strokes, medians) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const d of strokes) {
    for (const [x, y] of pathPoints(d)) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  void medians;
  return { minX, minY, maxX, maxY };
}

// 将 path 中的坐标对做仿射变换（数据只含 M/L/Q/C/Z 绝对坐标）
function transformPath(d, fn) {
  let idx = 0;
  const nums = d.match(num).map(Number);
  const out = [];
  for (let i = 0; i < nums.length; i += 2) out.push(fn(nums[i], nums[i + 1]));
  return d.replace(num, () => {
    const pair = out[Math.floor(idx / 2)];
    return String(Math.round(pair[idx++ % 2]));
  });
}

export function buildCantoChars(dataDir) {
  const read = (ch) => JSON.parse(readFileSync(join(dataDir, `${ch}.json`), 'utf8'));
  const has = (ch) => existsSync(join(dataDir, `${ch}.json`));
  const result = {};

  for (const [ch, r] of Object.entries(RECIPES)) {
    if (r.subset) {
      if (!has(r.subset)) continue;
      const src = read(r.subset);
      result[ch] = {
        strokes: r.keep.map((i) => src.strokes[i]),
        medians: r.keep.map((i) => src.medians[i]),
        info: { jyutping: r.jyutping },
      };
      continue;
    }
    const compChar = typeof r.comp === 'string' ? r.comp : r.comp.char;
    const compFrom = typeof r.comp === 'string' ? 0 : r.comp.from;
    if (!has(r.donor) || !has(compChar)) continue;
    const donor = read(r.donor);
    const comp = read(compChar);
    const compStrokes = comp.strokes.slice(compFrom);
    const compMedians = comp.medians.slice(compFrom);
    // 目标区域 = donor 被替换部分（第 keepN 笔起）的包围盒
    const target = bbox(donor.strokes.slice(r.keepN));
    const srcBox = bbox(compStrokes);
    const sx = (target.maxX - target.minX) / (srcBox.maxX - srcBox.minX);
    const sy = (target.maxY - target.minY) / (srcBox.maxY - srcBox.minY);
    const fn = (x, y) => [target.minX + (x - srcBox.minX) * sx, target.minY + (y - srcBox.minY) * sy];
    result[ch] = {
      strokes: [
        ...donor.strokes.slice(0, r.keepN),
        ...compStrokes.map((d) => transformPath(d, fn)),
      ],
      medians: [
        ...donor.medians.slice(0, r.keepN),
        ...compMedians.map((m) => m.map(([x, y]) => fn(x, y).map(Math.round))),
      ],
      radStrokes: Array.from({ length: r.keepN }, (_, i) => i),
      info: { jyutping: r.jyutping },
    };
  }
  return result;
}
