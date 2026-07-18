// README 截图脚本：用本机 Chrome 截移动视口下的界面（node scripts/shoot.mjs）
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:4173';

const SHOTS = [
  {
    file: 'docs/screenshot-main.png',
    url: `${BASE}/?q=白日依山尽，黄河入海流`,
    height: 1000,
    wait: 900, // 400ms 起笔延迟后，正在画第一笔（避开循环间隙的空白期）
  },
  {
    file: 'docs/screenshot-canto.png',
    url: `${BASE}/?q=佢哋喺度搵嘢食`,
    height: 1000,
    wait: 1500,
    prepare: async (page) => {
      // 点一个粤语字，展示按需下载提示
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll('.char-card.trad')][0];
        btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await new Promise((r) => setTimeout(r, 400));
    },
  },
  {
    file: 'docs/screenshot-settings.png',
    url: `${BASE}/`,
    height: 1000,
    wait: 800,
    prepare: async (page) => {
      await page.click('#settings-btn');
      await new Promise((r) => setTimeout(r, 300));
    },
  },
];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'shell',
  args: ['--user-data-dir=/tmp/bishun-shoot', '--no-first-run'],
});

for (const shot of SHOTS) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: shot.height, deviceScaleFactor: 2, isMobile: true });
  await page.goto(shot.url, { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise((r) => setTimeout(r, shot.wait));
  if (shot.prepare) await shot.prepare(page);
  await page.screenshot({ path: shot.file });
  console.log('saved', shot.file);
  await page.close();
}
await browser.close();
