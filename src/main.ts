import HanziWriter from 'hanzi-writer';
import cnchar from 'cnchar';
import order from 'cnchar-order';
import radical from 'cnchar-radical';
import trad from 'cnchar-trad';
import './style.css';
import { registerSW } from 'virtual:pwa-register';

registerSW({ immediate: true });
cnchar.use(order, radical, trad);

interface CharData {
  strokes: string[];
  medians: number[][][];
  info?: { jyutping?: string };
}
type StrokeMap = Record<string, CharData>;

const SETTINGS_KEY = 'bishun-settings';
interface Settings {
  quizEnabled: boolean;
  speed: number; // 动画速度倍率
}
function loadSettings(): Settings {
  try {
    return { quizEnabled: false, speed: 1, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { quizEnabled: false, speed: 1 };
  }
}
function saveSettings(s: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

const settings = loadSettings();
let strokeData: StrokeMap = {};
let tradIndex = new Set<string>();
// 扩充包（其余基础字）后台加载状态：用于首访空窗期正确处理点击与字卡样式
let baseMoreReady = false;
let baseMorePromise: Promise<void> | null = null;
let coreReady = false; // 核心包是否就绪（决定清空输入后是否重新展示演示）
// 由 vite.config 在构建时注入的两个数据包解压后字节数，用于计算加载进度百分比
declare const __CORE_BYTES__: number;
declare const __MORE_BYTES__: number;
const TRAD_KEY = 'bishun-trad-downloaded';
let writer: HanziWriter | null = null;
let currentChar = '';
let quizMode = false;

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="topbar">
    <h1>笔顺随身查</h1>
    <button id="settings-btn" class="icon-btn" aria-label="设置">⚙</button>
  </header>

  <div id="settings-panel" class="settings-page" hidden>
    <div class="settings-inner">
    <header class="settings-header">
      <button id="settings-back" class="back-btn" aria-label="返回">‹ 返回</button>
      <h2>设置</h2>
      <span class="settings-header-spacer"></span>
    </header>
    <p class="settings-group-title">应用</p>
    <div class="settings-group">
      <button id="add-home-btn" class="setting-item setting-action">
        <span class="setting-label">
          <span>📲 添加到主屏幕速开</span>
          <small>安装为应用，每次都能快速找到和打开，断网也能查</small>
        </span>
        <span class="chevron">›</span>
      </button>
      <button id="trad-pack-btn" class="setting-item setting-action">
        <span class="setting-label">
          <span>扩展字库</span>
          <small id="trad-pack-status">未下载 · 含繁体、粤语和生僻字，约 10MB</small>
        </span>
        <span class="chevron">›</span>
      </button>
    </div>

    <p class="settings-group-title">学习</p>
    <div class="settings-group">
      <label class="setting-item">
        <span class="setting-label">
          <span>描红练习</span>
          <small>点开字卡后可用手指描写笔画</small>
        </span>
        <input type="checkbox" id="quiz-toggle" />
      </label>
      <label class="setting-item">
        <span class="setting-label">
          <span>笔顺动画速度</span>
          <small>默认 ×1.0</small>
        </span>
        <select id="speed-select">
          <option value="0.5">×0.5</option>
          <option value="1">×1.0</option>
          <option value="1.5">×1.5</option>
        </select>
      </label>
    </div>

    <p class="settings-group-title">反馈</p>
    <div class="settings-group">
      <button id="feedback-btn" class="setting-item setting-action">
        <span class="setting-label">
          <span>💬 意见反馈</span>
          <small>建议和问题都欢迎，会认真看</small>
        </span>
        <span class="chevron">›</span>
      </button>
    </div>

    <p class="settings-group-title">关于</p>
    <div class="settings-group">
      <div class="setting-item about-text">
        <span class="setting-label">
          <span>笔顺随身查</span>
          <small>离线汉字笔顺查询工具。输入一段话，点任意字查看笔顺动画、拼音、笔画和部首结构；支持描红练习。基础字库覆盖《通用规范汉字表》常用字，繁体、粤语和生僻字可按需下载；首次打开后断网也能用，建议添加到主屏幕当作 App 使用。</small>
        </span>
      </div>
      <a class="setting-item setting-action" href="https://github.com/dezhaohe/bishun" target="_blank" rel="noopener">
        <span class="setting-label">
          <span>开源地址</span>
          <small>GitHub · MIT License</small>
        </span>
        <span class="chevron">›</span>
      </a>
    </div>
    </div>
  </div>

  <section class="input-area">
    <textarea id="text-input" rows="2" placeholder="请输入一个字或一段话让我识别吧。使用语音输入会更快哦 🎤" autocomplete="off" autofocus></textarea>
  </section>

  <section id="char-grid" class="char-grid"></section>
  <p id="empty-hint" class="empty-hint">输入文字后，点击任意字查看笔顺 ✍️</p>
  <div id="empty-demo" class="empty-demo" hidden>
    <img class="demo-gif" src="${import.meta.env.BASE_URL}demo-bi.gif" width="320" height="320" alt="点击文字查看笔顺动画演示" />
  </div>

  <div id="detail" class="detail" hidden>
    <div class="detail-head">
      <div class="detail-info">
        <span id="detail-pinyin" class="pinyin"></span>
        <span id="detail-count" class="stroke-count"></span>
      </div>
      <button id="detail-close" class="icon-btn" aria-label="关闭">✕</button>
    </div>
    <div class="writer-box">
      <div class="grid-lines"></div>
      <div id="writer-target"></div>
    </div>
    <p id="radical-info" class="stroke-names"></p>
    <p id="stroke-names" class="stroke-names"></p>
    <div class="detail-actions">
      <button id="quiz-btn" class="action-btn" hidden>✍ 练习</button>
    </div>
    <p id="quiz-hint" class="setting-hint" hidden>沿着灰色轮廓逐笔描写，写错会提示重画</p>
  </div>

  <div id="feedback-page" class="settings-page feedback-page" hidden>
    <div class="settings-inner">
      <header class="settings-header">
        <button id="feedback-back" class="back-btn" aria-label="返回">‹ 返回</button>
        <h2>意见反馈</h2>
        <span class="settings-header-spacer"></span>
      </header>
      <div class="settings-group feedback-form">
        <textarea id="feedback-text" rows="6" placeholder="说说你的建议，或遇到的问题（比如某个字的笔顺不对）…"></textarea>
        <input id="feedback-contact" type="text" placeholder="联系方式（选填，方便回复你）" autocomplete="off" />
        <button id="feedback-submit" class="action-btn install-primary">提交反馈</button>
      </div>
    </div>
  </div>

  <div id="loading" class="loading">正在加载笔顺数据…</div>

  <div id="trad-prompt" class="install-banner" hidden>
    <div class="install-text">
      <strong id="trad-prompt-title"></strong>
      <span>该字不在基础字库中。可下载扩展字库（2724 个繁体、粤语和生僻字，约 10MB，仅需一次，下载后离线可用）。</span>
    </div>
    <div class="install-actions">
      <button id="trad-download" class="action-btn install-primary">下载扩展字库</button>
      <button id="trad-cancel" class="action-btn">暂不</button>
    </div>
  </div>

  <div id="install-banner" class="install-banner" hidden>
    <div class="install-text">
      <strong id="install-title">📲 添加到主屏幕，断网也能查</strong>
      <span id="install-steps"></span>
    </div>
    <div class="install-actions">
      <button id="copy-link-btn" class="action-btn">🔗 复制链接</button>
      <button id="install-btn" class="action-btn install-primary" hidden>一键安装</button>
      <button id="install-dismiss" class="action-btn">知道了</button>
    </div>
  </div>
`;

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const textInput = $<HTMLTextAreaElement>('#text-input');
const charGrid = $('#char-grid');
const emptyHint = $('#empty-hint');
const detail = $('#detail');
const loading = $('#loading');
const quizToggle = $<HTMLInputElement>('#quiz-toggle');
const quizBtn = $<HTMLButtonElement>('#quiz-btn');
const quizHint = $('#quiz-hint');
const speedSelect = $<HTMLSelectElement>('#speed-select');
const emptyDemo = $('#empty-demo');

speedSelect.value = String(settings.speed);
if (speedSelect.value !== String(settings.speed)) {
  // 旧版本存在 ×2 挡位，已下线（改为 ×1.5）；旧存档值在此兜底回退到默认速度
  settings.speed = 1;
  speedSelect.value = '1';
  saveSettings(settings);
}
// 抢占输入焦点，光标闪烁引导用户直接开始输入（innerHTML 插入的 autofocus 属性不会自动生效，需手动 focus）
textInput.focus();
quizToggle.checked = settings.quizEnabled;

// ---------- 数据加载 ----------
const dataUrl = (name: string) => `${import.meta.env.BASE_URL}data/${name}`;

// 各数据包都走 CacheFirst 运行时缓存（不再预缓存，避免首访被重复下载）。
// 内容更新时必须升对应版本号换 URL，否则老用户永远拿到旧包（例如修正某字笔顺后无法推送）。
const CORE_PACK_VERSION = 1;
const MORE_PACK_VERSION = 1;
const TRAD_PACK_VERSION = 3;

async function fetchPack(name: string, version: number): Promise<StrokeMap> {
  const r = await fetch(dataUrl(`${name}?v=${version}`));
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}
const fetchTradPack = () => fetchPack('strokes-trad.json', TRAD_PACK_VERSION);

// 边下边报告已接收字节数的版本：用流式读取实现加载进度。onBytes 收到的是解压后累计字节，
// 与构建时注入的解压后总大小（__CORE_BYTES__/__MORE_BYTES__）对应，可算出准确百分比。
async function fetchPackWithProgress(
  name: string,
  version: number,
  onBytes: (receivedTotal: number) => void
): Promise<StrokeMap> {
  const r = await fetch(dataUrl(`${name}?v=${version}`));
  if (!r.ok) throw new Error(String(r.status));
  if (!r.body) return r.json(); // 极老浏览器无流式 body，退化为普通读取
  const reader = r.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      onBytes(received);
    }
  }
  let size = 0;
  for (const c of chunks) size += c.length;
  const buf = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.length;
  }
  return JSON.parse(new TextDecoder().decode(buf));
}

// ---------- 字库加载进度（底部提示条） ----------
// 核心包 + 扩充包合计为一条 0→100% 的进度；核心包就绪后文案切到"完整字库"，进度不回退。
const CORE_BYTES = __CORE_BYTES__ || 0;
const MORE_BYTES = __MORE_BYTES__ || 0;
const TOTAL_BYTES = CORE_BYTES + MORE_BYTES;
let coreBytesGot = 0;
let moreBytesGot = 0;
function renderLoadingProgress() {
  if (loading.hidden) return;
  const label = coreReady ? '正在加载完整字库' : '正在加载常用字库';
  if (TOTAL_BYTES > 0) {
    const pct = Math.min(100, Math.floor(((coreBytesGot + moreBytesGot) / TOTAL_BYTES) * 100));
    loading.textContent = `${label}… ${pct}%`;
    loading.style.setProperty('--progress', `${pct}%`);
  } else {
    loading.textContent = `${label}…`;
  }
}

// 首屏立即显示演示 GIF：GIF 仅 11KB，而核心字库有 2MB 级，绝不能让
// 字库下载阻塞演示动画的显示。二者并行，互不阻塞——演示先出现，字库在后台下载。
// 这里同步读取 ?q= 预填参数（可分享带内容的链接），据此决定是否展示演示。
{
  const q = new URLSearchParams(location.search).get('q');
  if (q && !textInput.value) textInput.value = q;
  if (!textInput.value) showDemo();
}

renderLoadingProgress(); // 初始 0%

Promise.all([
  fetchPackWithProgress('strokes-core.json', CORE_PACK_VERSION, (n) => {
    coreBytesGot = n;
    renderLoadingProgress();
  }),
  fetch(dataUrl('trad-index.json')).then((r) => r.json()).catch(() => ''),
])
  .then(([core, index]: [StrokeMap, string]) => {
    strokeData = core;
    tradIndex = new Set(index);
    coreReady = true;
    coreBytesGot = CORE_BYTES; // 核心包按满额计入，避免估算误差导致进度停在 99%
    renderLoadingProgress();
    updateTradStatus();
    renderChars();
    if (!textInput.value) showDemo();

    // 其余基础字（二级/三级规范字）后台并行加载，不阻塞首屏；进度条继续走到 100%，到位后合并重绘
    baseMorePromise = fetchPackWithProgress('strokes-more.json', MORE_PACK_VERSION, (n) => {
      moreBytesGot = n;
      renderLoadingProgress();
    })
      .then((more) => {
        Object.assign(strokeData, more);
        baseMoreReady = true;
        loading.hidden = true; // 全部基础字就绪，收起进度条
        renderChars();
      })
      .catch(() => {
        // 下次启动再试；仍标记为就绪，避免点击时一直卡在"加载中"提示
        baseMoreReady = true;
        loading.hidden = true;
      });

    // 下载过扩展包的用户，启动时后台异步加载（Service Worker 已缓存，离线可用）；
    // 不 await，避免扩展包阻塞基础字库的渲染，加载完成后再重绘一次
    if (localStorage.getItem(TRAD_KEY)) {
      fetchTradPack()
        .then((pack) => {
          Object.assign(strokeData, pack);
          renderChars();
        })
        .catch(() => {
          /* 下次启动再试 */
        });
    }
  })
  .catch(() => {
    loading.hidden = false;
    loading.style.removeProperty('--progress');
    loading.textContent = '笔顺数据加载失败，请刷新重试';
  });

// ---------- 汉字提取与字卡 ----------
function extractChars(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ch of text.match(/\p{Script=Han}/gu) ?? []) {
    if (!seen.has(ch)) {
      seen.add(ch);
      out.push(ch);
    }
  }
  return out;
}

// 选中并展示某字：从当前 DOM 里找对应字卡（后台加载重绘后，旧闭包里的按钮已失效，
// 所以按字符实时查找，保证高亮的是当前可见的卡片）
function openChar(ch: string) {
  document.querySelectorAll('.char-card.active').forEach((el) => el.classList.remove('active'));
  const card = [...charGrid.querySelectorAll<HTMLButtonElement>('.char-card')].find(
    (b) => b.textContent === ch
  );
  card?.classList.add('active');
  showDetail(ch);
}

function renderChars() {
  const chars = extractChars(textInput.value);
  if (chars.length > 0) hideDemo();
  else if (coreReady) showDemo(); // 清空输入回到空白态时，演示重新出现
  charGrid.innerHTML = '';
  emptyHint.hidden = chars.length > 0;
  const cardOf = new Map<string, HTMLButtonElement>();
  for (const ch of chars) {
    const btn = document.createElement('button');
    btn.className = 'char-card';
    btn.textContent = ch;
    const available = ch in strokeData;
    const inTradPack = !available && tradIndex.has(ch);
    if (inTradPack) {
      btn.classList.add('trad');
      btn.title = '可下载扩展字库查看';
    } else if (!available) {
      if (baseMoreReady) {
        btn.classList.add('unavailable');
        btn.title = '暂无笔顺数据';
      } else {
        // 扩充包仍在后台加载，可能马上就能查——先不标灰，避免常用字误判为生僻字
        btn.title = '字库加载中…';
      }
    }
    btn.addEventListener('click', () => {
      if (ch in strokeData) {
        openChar(ch); // 已可查（含扩充包/扩展包加载后的情况）
      } else if (tradIndex.has(ch)) {
        showTradPrompt(ch);
      } else if (!baseMoreReady && baseMorePromise) {
        // 首访空窗期：其余基础字还在后台加载，到位后自动打开
        showToast('字库加载中，请稍候…');
        baseMorePromise.then(() => {
          if (ch in strokeData) openChar(ch);
          else if (tradIndex.has(ch)) showTradPrompt(ch);
          else showToast(`「${ch}」暂无笔顺数据（生僻字）`);
        });
      } else {
        showToast(`「${ch}」暂无笔顺数据（生僻字）`);
      }
    });
    charGrid.appendChild(btn);
    cardOf.set(ch, btn);
  }

  // 识别后自动展示：正在查看的字仍在列表中则保持选中，否则默认选中第一个可查的字
  const keepCurrent =
    !detail.hidden && currentChar && chars.includes(currentChar) && currentChar in strokeData;
  if (keepCurrent) {
    cardOf.get(currentChar)?.classList.add('active');
  } else {
    const first = chars.find((c) => c in strokeData);
    if (first) {
      cardOf.get(first)?.classList.add('active');
      showDetail(first, { scroll: false });
    } else {
      detail.hidden = true;
    }
  }
}

let renderTimer: number | undefined;
textInput.addEventListener('input', () => {
  hideDemo(); // 一开始打字就收起首次演示，不用等 debounce
  clearTimeout(renderTimer);
  renderTimer = window.setTimeout(renderChars, 200);
});

// ---------- 演示：用一张循环播放的 GIF 教用户"点字看笔顺" ----------
// GIF 由 scripts/make-demo-gif.mjs 预先生成（public/demo-bi.gif），与应用内
// HanziWriter 的实时渲染逻辑完全独立，互不影响。
// 展示条件：只要用户当前没有输入内容就展示——每次进主页立即展示，
// 借空白期反复强化"点字看笔顺"这一核心用法，占领用户心智；输入后隐藏。
function hideDemo() {
  if (!emptyDemo.hidden) emptyDemo.hidden = true;
}

function showDemo() {
  emptyDemo.hidden = false;
}

// ---------- 详情与动画 ----------
function showDetail(ch: string, opts: { scroll?: boolean } = {}) {
  currentChar = ch;
  quizMode = false;
  detail.hidden = false;

  const data = strokeData[ch];
  let pinyin = (cnchar.spell(ch, 'array', 'tone', 'poly', 'low') as string[])
    .join(' / ')
    .replace(/[()]/g, '')
    .replace(/\|/g, ' / ');
  // cnchar 不认识的字（如粤语字）会原样返回；粤语字改用数据内嵌的粤拼
  if (pinyin === ch) pinyin = data.info?.jyutping ? `粤拼 ${data.info.jyutping}` : '';
  const count = (cnchar.stroke(ch) as number) || data.strokes.length;
  const names = ((cnchar.stroke(ch, 'order', 'name') as string[][])[0] ?? []).map((n) =>
    n.replace(/\d+$/, '').replace(/\|/g, ' / ')
  );
  $('#detail-pinyin').textContent = pinyin ? `${ch} · ${pinyin}` : ch;
  $('#detail-count').textContent = `${count} 画`;
  const rad = (cnchar.radical(ch) as { radical: string; struct: string }[])[0];
  $('#radical-info').textContent = rad?.radical ? `部首：${rad.radical} · ${rad.struct}` : '';
  $('#stroke-names').textContent = names.length ? `笔顺：${names.join(' → ')}` : '';

  quizBtn.hidden = !settings.quizEnabled;
  quizHint.hidden = true;
  createWriter();
  // 自动展示（如输入时默认选中第一个字）不抢滚动位置
  if (opts.scroll !== false) detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

let animTimer: number | undefined;

function createWriter() {
  clearTimeout(animTimer);
  const target = $('#writer-target');
  target.innerHTML = '';
  const size = Math.min(target.clientWidth || 280, 320);
  writer = HanziWriter.create(target, currentChar, {
    width: size,
    height: size,
    padding: 12,
    strokeColor: '#2c3e50',
    radicalColor: '#c0392b',
    outlineColor: '#e5e0da',
    drawingColor: '#c0392b',
    strokeAnimationSpeed: settings.speed,
    delayBetweenStrokes: 300 / settings.speed,
    delayBetweenLoops: 1500,
    showCharacter: false,
    charDataLoader: (char, onComplete) => onComplete(strokeData[char] as never),
  });
  // 延迟 400ms 再起笔：让用户先看清整个米字格，不错过第一笔
  const w = writer;
  animTimer = window.setTimeout(() => {
    if (writer === w) w.loopCharacterAnimation();
  }, 400);
}

$('#detail-close').addEventListener('click', () => {
  detail.hidden = true;
  document.querySelectorAll('.char-card.active').forEach((el) => el.classList.remove('active'));
});

speedSelect.addEventListener('change', () => {
  settings.speed = Number(speedSelect.value) || 1;
  saveSettings(settings);
  if (writer && !detail.hidden && !quizMode) createWriter();
});

quizBtn.addEventListener('click', () => {
  if (!writer) return;
  quizMode = true;
  quizHint.hidden = false;
  clearTimeout(animTimer);
  writer.cancelQuiz();
  const target = $('#writer-target');
  target.innerHTML = '';
  const size = Math.min(target.clientWidth || 280, 320);
  writer = HanziWriter.create(target, currentChar, {
    width: size,
    height: size,
    padding: 12,
    strokeColor: '#2c3e50',
    outlineColor: '#e5e0da',
    drawingColor: '#c0392b',
    drawingWidth: 20,
    showCharacter: false,
    showOutline: true,
    charDataLoader: (char, onComplete) => onComplete(strokeData[char] as never),
  });
  writer.quiz({
    onComplete: () => {
      quizHint.textContent = '✅ 写完了！再点"练习"可以再来一次';
    },
  });
  quizHint.textContent = '沿着灰色轮廓逐笔描写，写错会提示重画';
});

// ---------- 设置（独立全屏页，避免与主界面耦合） ----------
$('#settings-btn').addEventListener('click', () => {
  $('#settings-panel').hidden = false;
});
$('#settings-back').addEventListener('click', () => {
  $('#settings-panel').hidden = true;
});
quizToggle.addEventListener('change', () => {
  settings.quizEnabled = quizToggle.checked;
  saveSettings(settings);
  quizBtn.hidden = !settings.quizEnabled || detail.hidden;
});

// ---------- 意见反馈（Formspree） ----------
const FEEDBACK_ENDPOINT = 'https://formspree.io/f/mrenpprz';
const feedbackPage = $('#feedback-page');
const feedbackText = $<HTMLTextAreaElement>('#feedback-text');
const feedbackContact = $<HTMLInputElement>('#feedback-contact');
const feedbackSubmit = $<HTMLButtonElement>('#feedback-submit');

$('#feedback-btn').addEventListener('click', () => {
  feedbackPage.hidden = false;
});
$('#feedback-back').addEventListener('click', () => {
  feedbackPage.hidden = true;
});

feedbackSubmit.addEventListener('click', async () => {
  const message = feedbackText.value.trim();
  if (!message) {
    showToast('先写点内容再提交吧');
    return;
  }
  feedbackSubmit.disabled = true;
  feedbackSubmit.textContent = '提交中…';
  try {
    const r = await fetch(FEEDBACK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        message,
        contact: feedbackContact.value.trim() || '未留联系方式',
        ua: navigator.userAgent,
      }),
    });
    if (!r.ok) throw new Error(String(r.status));
    // 先让用户看到成功状态，再返回设置页，避免"不知道有没有提交上"
    feedbackSubmit.textContent = '✅ 提交成功，谢谢你的反馈！';
    await new Promise((res) => setTimeout(res, 2500));
    feedbackText.value = '';
    feedbackContact.value = '';
    feedbackPage.hidden = true;
  } catch {
    showToast('提交失败，请检查网络后重试');
  } finally {
    feedbackSubmit.disabled = false;
    feedbackSubmit.textContent = '提交反馈';
  }
});

// ---------- 扩展字库（繁体、粤语和生僻字，按需下载） ----------
const tradPrompt = $('#trad-prompt');
const tradDownloadBtn = $<HTMLButtonElement>('#trad-download');
const tradStatusEl = $('#trad-pack-status');
let tradPendingChar = '';
let tradDownloading = false;

function updateTradStatus() {
  tradStatusEl.textContent = localStorage.getItem(TRAD_KEY)
    ? `已下载 · ${tradIndex.size} 个繁体、粤语和生僻字，点击可删除`
    : '未下载 · 含繁体、粤语和生僻字，约 10MB，点击下载';
}

// 共享的下载逻辑：字卡提示和设置项两个入口都走这里
async function doDownloadTradPack(): Promise<boolean> {
  if (tradDownloading) return false;
  tradDownloading = true;
  try {
    Object.assign(strokeData, await fetchTradPack());
    localStorage.setItem(TRAD_KEY, '1');
    renderChars();
    updateTradStatus();
    return true;
  } catch {
    showToast('下载失败，请检查网络后重试');
    return false;
  } finally {
    tradDownloading = false;
  }
}

function showTradPrompt(ch: string) {
  tradPendingChar = ch;
  $('#trad-prompt-title').textContent = `「${ch}」需下载扩展字库`;
  $('#install-banner').hidden = true; // 避免与安装引导条重叠
  tradPrompt.hidden = false;
}

tradDownloadBtn.addEventListener('click', async () => {
  tradDownloadBtn.disabled = true;
  tradDownloadBtn.textContent = '下载中…';
  if (await doDownloadTradPack()) {
    tradPrompt.hidden = true;
    if (tradPendingChar in strokeData) {
      showDetail(tradPendingChar);
      showToast('扩展字库已就绪，之后离线也能查 ✅');
    }
  }
  tradDownloadBtn.disabled = false;
  tradDownloadBtn.textContent = '下载扩展字库';
});

// 设置里的扩展字库入口：未下载 → 下载；已下载 → 可删除（删除后随时可重新下载）
$('#trad-pack-btn').addEventListener('click', async () => {
  if (localStorage.getItem(TRAD_KEY)) {
    if (confirm('删除扩展字库？删除后繁体、粤语和生僻字将不可查，可随时重新下载。')) {
      localStorage.removeItem(TRAD_KEY);
      await caches.delete('bishun-trad-pack').catch(() => {});
      location.reload();
    }
    return;
  }
  tradStatusEl.textContent = '下载中…';
  if (await doDownloadTradPack()) {
    showToast('扩展字库已就绪 ✅');
  } else {
    updateTradStatus();
  }
});

$('#trad-cancel').addEventListener('click', () => {
  tradPrompt.hidden = true;
});

// ---------- 添加到主屏幕引导（仅从设置项触发，不在加载时自动弹出打扰用户） ----------
const installBanner = $('#install-banner');
const installBtn = $<HTMLButtonElement>('#install-btn');
let deferredInstall: (Event & { prompt: () => Promise<void> }) | null = null;

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

// 微信/QQ/微博等 App 内置浏览器无法添加到主屏幕，必须先跳到系统浏览器
function inAppBrowserName(): string | null {
  const ua = navigator.userAgent;
  if (/MicroMessenger/i.test(ua)) return '微信';
  if (/\bQQ\//i.test(ua) && !/MQQBrowser/i.test(ua)) return 'QQ';
  if (/Weibo/i.test(ua)) return '微博';
  if (/DingTalk/i.test(ua)) return '钉钉';
  if (/AlipayClient/i.test(ua)) return '支付宝';
  if (/(toutiao|bytedance|musical_ly|aweme)/i.test(ua)) return '今日头条/抖音';
  return null;
}

// Android 品牌繁多，各家默认浏览器菜单位置不同，尽量给出对应提示
function androidBrowserSteps(): string {
  const ua = navigator.userAgent;
  if (/SamsungBrowser/i.test(ua)) return '点击地址栏右侧菜单 ≡ → 选「添加页面至」→「主屏幕」（三星浏览器）';
  if (/HuaweiBrowser|HUAWEI|HONOR/i.test(ua)) return '点击右下角菜单 ⋯ → 选「添加到桌面」（华为浏览器）';
  if (/MiuiBrowser|XIAOMI|REDMI|POCO/i.test(ua)) return '点击右下角菜单 ⋯ → 选「添加到桌面」（小米浏览器）';
  if (/HeyTapBrowser|OppoBrowser|\bOPPO\b|CPH\d{4}/i.test(ua)) return '点击右下角菜单 ⋯ → 选「添加到桌面」（OPPO 浏览器）';
  if (/VivoBrowser|\bvivo\b/i.test(ua)) return '点击右下角菜单 ⋯ → 选「添加到桌面」（vivo 浏览器）';
  return '点浏览器菜单 ⋮ → 选「安装应用」或「添加到主屏幕」';
}

function setupInstallBanner() {
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  const inApp = inAppBrowserName();

  const copyBtn = $<HTMLButtonElement>('#copy-link-btn');
  if (inApp) {
    // 当前在 App 内置浏览器里，添加到主屏幕的操作走不通，引导用户先跳出/复制链接
    $('#install-title').textContent = `📲 当前在「${inApp}」中打开`;
    $('#install-steps').textContent =
      `无法直接添加到主屏幕。点右上角「···」或「≡」选择"在浏览器打开"；如果没有这个选项，复制链接后到系统浏览器（如 Safari / Chrome）里粘贴打开即可。`;
    copyBtn.classList.add('install-primary');
  } else {
    $('#install-title').textContent = '📲 添加到主屏幕，断网也能查';
    const steps = isIOS
      ? '用 Safari 打开 → 点底部 分享按钮 ⬆️ → 选「添加到主屏幕」'
      : isAndroid
        ? androidBrowserSteps()
        : '用手机浏览器打开本页效果最佳；电脑 Chrome 可点地址栏右侧的安装图标';
    $('#install-steps').textContent = steps;
    copyBtn.classList.remove('install-primary');
  }
  installBanner.hidden = false;
}

// 复制本页链接（去掉 ?q= 等临时参数），方便在 App 内浏览器里跳转到系统浏览器打开
async function copyPageUrl() {
  const url = `${location.origin}${location.pathname}`;
  try {
    await navigator.clipboard.writeText(url);
    showToast('链接已复制，去浏览器粘贴打开吧 📋');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = url;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showToast('链接已复制，去浏览器粘贴打开吧 📋');
    } catch {
      showToast('复制失败，请手动复制地址栏链接');
    }
    ta.remove();
  }
}

$('#copy-link-btn').addEventListener('click', copyPageUrl);

// Android Chrome 等支持原生安装提示时，显示"一键安装"
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e as typeof deferredInstall;
  installBtn.hidden = false;
});

installBtn.addEventListener('click', async () => {
  if (!deferredInstall) return;
  await deferredInstall.prompt();
  deferredInstall = null;
  installBanner.hidden = true;
});

$('#install-dismiss').addEventListener('click', () => {
  installBanner.hidden = true;
});

// 引导条的唯一入口：设置 → 添加到主屏幕
$('#add-home-btn').addEventListener('click', async () => {
  if (isStandalone()) {
    showToast('已经是主屏幕应用啦 🎉');
    return;
  }
  if (deferredInstall) {
    // 支持原生安装提示的浏览器直接弹安装框
    await deferredInstall.prompt();
    deferredInstall = null;
    return;
  }
  $('#settings-panel').hidden = true;
  setupInstallBanner();
});

// 不在首页加载时自动打扰用户，只在设置里点击"添加到主屏幕"时才触发引导条

// ---------- Toast ----------
let toastTimer: number | undefined;
function showToast(msg: string) {
  let toast = document.querySelector<HTMLDivElement>('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  // 有底部悬浮提示条（添加到主屏幕/扩展字库）时，把 toast 挪到条上方，避免被挡住
  const banner = [installBanner, tradPrompt].find((el) => el && !el.hidden);
  toast.style.bottom = banner ? `${window.innerHeight - banner.getBoundingClientRect().top + 12}px` : '';
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast!.classList.remove('show'), 2000);
}
