// 生成首次访问演示用的 GIF：录制"笔"字笔顺动画（与米字格外观一致），
// 用 ffmpeg 编码为循环 GIF，存到 public/demo-bi.gif。
// 依赖：本机 Chrome（截图）+ ffmpeg（合成）。跑一次： node scripts/make-demo-gif.mjs
import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:4173';
const SIZE = 320; // 与应用内 #writer-target 的最大尺寸一致（min(80vw, 320px)）
const OUT = 'public/demo-bi.gif';
const FRAME_INTERVAL = 70; // ms，约 14fps

if (!existsSync(CHROME)) {
  console.error('未找到本机 Chrome，请确认路径: ' + CHROME);
  process.exit(1);
}

const frameDir = mkdtempSync(join(tmpdir(), 'bishun-gif-'));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'shell',
  args: ['--user-data-dir=/tmp/bishun-gif-capture', '--no-first-run'],
});
const page = await browser.newPage();
await page.setViewport({ width: 480, height: 480, deviceScaleFactor: 1 });
await page.goto(`${BASE}/?clean`, { waitUntil: 'networkidle0', timeout: 30000 });

// 用 CDN 上的 hanzi-writer 独立渲染一个演示用的实例（不复用主应用的打包代码，
// 避免和应用内笔顺渲染逻辑产生耦合），数据仍取本地 strokes.json，与线上一致。
await page.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/hanzi-writer@3/dist/hanzi-writer.min.js' });

const box = await page.evaluate(
  ({ size }) => {
    const el = document.createElement('div');
    el.id = 'gif-demo-target';
    el.style.cssText = `
      position:fixed; left:0; top:0; width:${size}px; height:${size}px;
      border:2px solid #c0392b; border-radius:8px; box-sizing:border-box;
      background:
        linear-gradient(to right, transparent calc(50% - 1px), #f0d9d5 calc(50% - 1px), #f0d9d5 calc(50% + 1px), transparent calc(50% + 1px)),
        linear-gradient(to bottom, transparent calc(50% - 1px), #f0d9d5 calc(50% - 1px), #f0d9d5 calc(50% + 1px), transparent calc(50% + 1px)),
        linear-gradient(45deg, transparent calc(50% - 1px), #f7ece9 calc(50% - 1px), #f7ece9 calc(50% + 1px), transparent calc(50% + 1px)),
        linear-gradient(-45deg, transparent calc(50% - 1px), #f7ece9 calc(50% - 1px), #f7ece9 calc(50% + 1px), transparent calc(50% + 1px)),
        #fffdfb;
      z-index: 99999;
    `;
    document.body.appendChild(el);
    return { x: 0, y: 0, width: size, height: size };
  },
  { size: SIZE }
);

const strokeData = await page.evaluate(async () => {
  const r = await fetch('/data/strokes.json');
  const all = await r.json();
  return all['笔'];
});

await page.evaluate(
  ({ data, size }) => {
    window.__demoWriter = HanziWriter.create('gif-demo-target', '笔', {
      width: size,
      height: size,
      padding: 8,
      strokeColor: '#2c3e50',
      radicalColor: '#c0392b',
      showCharacter: false,
      strokeAnimationSpeed: 1.6,
      delayBetweenStrokes: 180,
      charDataLoader: (_char, onComplete) => onComplete(data),
    });
  },
  { data: strokeData, size: SIZE }
);

let done = false;
await page.evaluate(() => {
  window.__demoWriter.animateCharacter({
    onComplete: () => {
      window.__demoDone = true;
    },
  });
});

let frame = 0;
const holdFramesAfterDone = Math.round(900 / FRAME_INTERVAL); // 画完停留约 0.9s
let holdRemaining = -1;
for (;;) {
  const shotPath = join(frameDir, `f${String(frame).padStart(4, '0')}.png`);
  await page.screenshot({ path: shotPath, clip: box });
  frame++;
  if (!done) {
    done = await page.evaluate(() => Boolean(window.__demoDone));
    if (done) holdRemaining = holdFramesAfterDone;
  } else if (holdRemaining >= 0) {
    holdRemaining--;
    if (holdRemaining < 0) break;
  }
  await new Promise((res) => setTimeout(res, FRAME_INTERVAL));
  if (frame > 200) break; // 安全上限，避免异常时死循环
}

await browser.close();
console.log(`captured ${frame} frames`);

const fps = Math.round(1000 / FRAME_INTERVAL);
execFileSync('ffmpeg', [
  '-y',
  '-framerate',
  String(fps),
  '-i',
  join(frameDir, 'f%04d.png'),
  '-vf',
  `fps=${fps},scale=${SIZE}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
  '-loop',
  '0',
  OUT,
]);

rmSync(frameDir, { recursive: true, force: true });
console.log('saved', OUT);
