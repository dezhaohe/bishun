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
const TRAD_KEY = 'bishun-trad-downloaded';
let writer: HanziWriter | null = null;
let currentChar = '';
let quizMode = false;

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="topbar">
    <h1>笔顺</h1>
    <button id="settings-btn" class="icon-btn" aria-label="设置">⚙</button>
  </header>

  <div id="settings-panel" class="settings-page" hidden>
    <div class="settings-inner">
    <header class="settings-header">
      <button id="settings-back" class="back-btn" aria-label="返回">‹ 返回</button>
      <h2>设置</h2>
      <span class="settings-header-spacer"></span>
    </header>
    <p class="settings-group-title">学习</p>
    <div class="settings-group">
      <label class="setting-item">
        <span class="setting-label">
          <span>描红练习</span>
          <small>点开字卡后可用手指描写笔画</small>
        </span>
        <input type="checkbox" id="quiz-toggle" />
      </label>
    </div>

    <p class="settings-group-title">应用</p>
    <div class="settings-group">
      <button id="add-home-btn" class="setting-item setting-action">
        <span class="setting-label">
          <span>📲 添加到主屏幕</span>
          <small>安装为应用，断网也能查</small>
        </span>
        <span class="chevron">›</span>
      </button>
      <button id="trad-pack-btn" class="setting-item setting-action">
        <span class="setting-label">
          <span>扩展字库</span>
          <small id="trad-pack-status">未下载 · 含繁体与粤语字，约 10MB</small>
        </span>
        <span class="chevron">›</span>
      </button>
    </div>

    <p class="settings-group-title">关于</p>
    <div class="settings-group">
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
    <textarea id="text-input" rows="3" placeholder="请输入一个字或一段话让我识别吧。使用语音输入会更快哦 🎤" autocomplete="off"></textarea>
  </section>

  <section id="char-grid" class="char-grid"></section>
  <p id="empty-hint" class="empty-hint">输入文字后，点击任意字查看笔顺 ✍️</p>

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
      <button id="replay-btn" class="action-btn">▶ 重播</button>
      <button id="speed-btn" class="action-btn"></button>
      <button id="quiz-btn" class="action-btn" hidden>✍ 练习</button>
    </div>
    <p id="quiz-hint" class="setting-hint" hidden>沿着灰色轮廓逐笔描写，写错会提示重画</p>
  </div>

  <div id="loading" class="loading">正在加载笔顺数据…</div>

  <div id="trad-prompt" class="install-banner" hidden>
    <div class="install-text">
      <strong id="trad-prompt-title"></strong>
      <span>该字不在基础字库中。可下载扩展字库（2724 个繁体、粤语及生僻字，约 10MB，仅需一次，下载后离线可用）。</span>
    </div>
    <div class="install-actions">
      <button id="trad-download" class="action-btn install-primary">下载扩展字库</button>
      <button id="trad-cancel" class="action-btn">暂不</button>
    </div>
  </div>

  <div id="install-banner" class="install-banner" hidden>
    <div class="install-text">
      <strong>📲 添加到主屏幕，断网也能查</strong>
      <span id="install-steps"></span>
    </div>
    <div class="install-actions">
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
const speedBtn = $<HTMLButtonElement>('#speed-btn');

const SPEEDS = [0.5, 1, 2];
const speedLabel = () => `速度 ×${settings.speed}`;
speedBtn.textContent = speedLabel();
quizToggle.checked = settings.quizEnabled;

// ---------- 数据加载 ----------
const dataUrl = (name: string) => `${import.meta.env.BASE_URL}data/${name}`;

// 扩展包走 CacheFirst 缓存，内容更新时必须升版本号换 URL，否则老用户永远拿到旧包
const TRAD_PACK_VERSION = 3;

async function fetchTradPack(): Promise<StrokeMap> {
  const r = await fetch(dataUrl(`strokes-trad.json?v=${TRAD_PACK_VERSION}`));
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

Promise.all([
  fetch(dataUrl('strokes.json')).then((r) => r.json()),
  fetch(dataUrl('trad-index.json')).then((r) => r.json()).catch(() => ''),
])
  .then(async ([data, index]: [StrokeMap, string]) => {
    strokeData = data;
    tradIndex = new Set(index);
    // 下载过扩展包的用户，启动时自动加载（Service Worker 已缓存，离线可用）
    if (localStorage.getItem(TRAD_KEY)) {
      try {
        Object.assign(strokeData, await fetchTradPack());
      } catch {
        /* 下次启动再试 */
      }
    }
    loading.hidden = true;
    updateTradStatus();
    renderChars();
  })
  .catch(() => {
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

function renderChars() {
  const chars = extractChars(textInput.value);
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
      btn.title = '可下载繁体扩展字库';
    } else if (!available) {
      btn.classList.add('unavailable');
      btn.title = '暂无笔顺数据';
    }
    btn.addEventListener('click', () => {
      if (ch in strokeData) {
        // 已可查（含下载扩展包后的情况）
        document.querySelectorAll('.char-card.active').forEach((el) => el.classList.remove('active'));
        btn.classList.add('active');
        showDetail(ch);
      } else if (tradIndex.has(ch)) {
        showTradPrompt(ch);
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
  clearTimeout(renderTimer);
  renderTimer = window.setTimeout(renderChars, 200);
});

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

function createWriter() {
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
  writer.loopCharacterAnimation();
}

$('#detail-close').addEventListener('click', () => {
  detail.hidden = true;
  document.querySelectorAll('.char-card.active').forEach((el) => el.classList.remove('active'));
});

$('#replay-btn').addEventListener('click', () => {
  if (!writer) return;
  quizMode = false;
  quizHint.hidden = true;
  createWriter();
});

speedBtn.addEventListener('click', () => {
  settings.speed = SPEEDS[(SPEEDS.indexOf(settings.speed) + 1) % SPEEDS.length] ?? 1;
  saveSettings(settings);
  speedBtn.textContent = speedLabel();
  if (writer && !quizMode) createWriter();
});

quizBtn.addEventListener('click', () => {
  if (!writer) return;
  quizMode = true;
  quizHint.hidden = false;
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
      quizHint.textContent = '✅ 写完了！点"重播"看动画，或"练习"再来一次';
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

// ---------- 繁体扩展字库（按需下载） ----------
const tradPrompt = $('#trad-prompt');
const tradDownloadBtn = $<HTMLButtonElement>('#trad-download');
const tradStatusEl = $('#trad-pack-status');
let tradPendingChar = '';
let tradDownloading = false;

function updateTradStatus() {
  tradStatusEl.textContent = localStorage.getItem(TRAD_KEY)
    ? `已下载 · ${tradIndex.size} 个繁体/粤语字，离线可用`
    : '未下载 · 含繁体与粤语字，约 10MB';
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
  $('#trad-prompt-title').textContent = `「${ch}」是繁体字或生僻字`;
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

// 设置里的扩展字库入口
$('#trad-pack-btn').addEventListener('click', async () => {
  if (localStorage.getItem(TRAD_KEY)) {
    showToast('扩展字库已下载，离线可用 ✅');
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

// ---------- 添加到主屏幕引导 ----------
const INSTALL_DISMISS_KEY = 'bishun-install-dismissed';
const installBanner = $('#install-banner');
const installBtn = $<HTMLButtonElement>('#install-btn');
let deferredInstall: (Event & { prompt: () => Promise<void> }) | null = null;

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function setupInstallBanner() {
  if (isStandalone() || localStorage.getItem(INSTALL_DISMISS_KEY)) return;
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  const steps = isIOS
    ? '用 Safari 打开 → 点底部 分享按钮 ⬆️ → 选「添加到主屏幕」'
    : isAndroid
      ? '点浏览器菜单 ⋮ → 选「安装应用」或「添加到主屏幕」'
      : '手机浏览器打开本页，按提示添加到主屏幕；电脑 Chrome 可点地址栏的安装图标';
  $('#install-steps').textContent = steps;
  installBanner.hidden = false;
}

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
  localStorage.setItem(INSTALL_DISMISS_KEY, '1');
  installBanner.hidden = true;
});

// 设置里的常驻入口：误点过"知道了"的用户也能再次唤起引导
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
  localStorage.removeItem(INSTALL_DISMISS_KEY);
  $('#settings-panel').hidden = true;
  setupInstallBanner();
});

setupInstallBanner();

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
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast!.classList.remove('show'), 2000);
}
