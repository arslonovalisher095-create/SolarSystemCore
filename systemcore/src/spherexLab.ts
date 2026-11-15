import './spherexLab.css';
import {
  DEFAULT_SURVEY_BANDS,
  SPECTRAL_TARGETS,
  SPHEREX_COSPAR,
  SPHEREX_LAUNCH_MS,
  SPHEREX_NORAD,
  SPHEREX_SURVEY_START_MS,
  SpectralChannel,
  SpectralTargetId,
  SpherexTelemetry,
  SurveyBandMeta,
  TleRecord,
  fetchLiveSurveyArchive,
  generateSpectrum,
  propagateSpherex,
  surveyStats,
} from './spherex';
import type { SurveyBandId } from './spherexSky';
import {
  DistanceEstimate,
  RESEARCH_ARCSEC_PER_PX,
  SurveySector,
  estimateDistance,
  generateSector,
  synthFrame,
} from './research';

export interface SpherexLabCallbacks {
  getDate: () => Date;
  getTelemetry: () => SpherexTelemetry | null;
  getTle: () => TleRecord;
  isIrSkyEnabled: () => boolean;
  setIrSkyEnabled: (on: boolean) => void;
  getSurveyBand: () => SurveyBandId;
  setSurveyBand: (band: SurveyBandId) => void;
  isScanConeEnabled: () => boolean;
  setScanConeEnabled: (on: boolean) => void;
  isTelescopeView: () => boolean;
  setTelescopeView: (on: boolean) => void;
  focusBody: (id: string) => void;
}

type Tab = 'telemetry' | 'spectrum' | 'planetx' | 'mission';

export interface SpherexLabController {
  open: (tab?: Tab) => void;
  close: () => void;
  toggle: () => void;
  isOpen: () => boolean;
}

// ---------- Константы прибора ----------
/** Детекторы спектрометра: диапазон и спектральное разрешение R = λ/Δλ. */
const DETECTORS = [
  { id: 'D1', min: 0.75, max: 1.10, R: 39 },
  { id: 'D2', min: 1.10, max: 1.62, R: 41 },
  { id: 'D3', min: 1.62, max: 2.42, R: 41 },
  { id: 'D4', min: 2.42, max: 3.82, R: 35 },
  { id: 'D5', min: 3.82, max: 4.42, R: 112 },
  { id: 'D6', min: 4.42, max: 5.00, R: 128 },
] as const;
const PASS_DAYS = 182.625;
const DETECTION_SIGMA = 5;

const KIND_LABEL: Record<SurveySector['kind'] | 'inconclusive', string> = {
  'planet-x-candidate': 'Кандидат Planet X',
  tno: 'TNO',
  asteroid: 'Астероид',
  none: 'Нет движения',
  inconclusive: 'Неопределён',
};

const ICON = {
  close: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg>',
  play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.5v9l7-4.5z"/></svg>',
  pause: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 3.5v9M10.5 3.5v9"/></svg>',
  next: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M8.5 4.5L12 8l-3.5 3.5"/></svg>',
  target: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="4.5"/><path d="M8 1v3M8 12v3M1 8h3M12 8h3"/></svg>',
  scope: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="5" width="12" height="6"/><path d="M5 5V3h6v2"/></svg>',
};

// ---------- Утилиты отрисовки ----------
const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
const MONO = '10px ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace';
const MONO_S = '9px ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace';

/** Колормэп inferno (опорные точки matplotlib) — только для научных изображений. */
const INFERNO: [number, number, number, number][] = [
  [0.0, 0, 0, 4], [0.13, 27, 12, 65], [0.25, 74, 12, 107], [0.38, 120, 28, 109], [0.5, 165, 44, 96],
  [0.63, 207, 68, 70], [0.75, 237, 105, 37], [0.88, 251, 180, 26], [1.0, 252, 255, 164],
];
const INFERNO_LUT = (() => {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let k = 0;
    while (k < INFERNO.length - 2 && INFERNO[k + 1][0] < t) k++;
    const [t0, r0, g0, b0] = INFERNO[k], [t1, r1, g1, b1] = INFERNO[k + 1];
    const f = (t - t0) / (t1 - t0);
    lut[i * 3] = r0 + (r1 - r0) * f; lut[i * 3 + 1] = g0 + (g1 - g0) * f; lut[i * 3 + 2] = b0 + (b1 - b0) * f;
  }
  return lut;
})();

function prepCanvas(c: HTMLCanvasElement, aspect: number, minW = 280) {
  const W = Math.max(minW, Math.round(c.getBoundingClientRect().width || c.parentElement?.clientWidth || 480));
  const H = Math.round(W / aspect);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (c.width !== W * dpr || c.height !== H * dpr) { c.width = W * dpr; c.height = H * dpr; }
  c.style.height = `${H}px`;
  const g = c.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { g, W, H };
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const utc = (d: Date) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
const fmtDay = (ms: number) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`; };
const sgn = (x: number, d = 1) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(d)}`;
const fmtAu = (x: number | null) => (x == null ? '—' : x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2));

/** Номер витка: из колонок 64–68 второй строки TLE + витки, накопленные после эпохи. */
function orbitNumber(tle: TleRecord, date: Date, revsPerDay: number) {
  const rev = parseInt(tle.line2.slice(63, 68), 10);
  const t = Date.parse(tle.epochIso);
  if (!Number.isFinite(rev) || !Number.isFinite(t)) return null;
  return rev + Math.floor(((date.getTime() - t) / 86400e3) * revsPerDay);
}

export function initSpherexLab(cb: SpherexLabCallbacks): SpherexLabController {
  const panel = document.getElementById('spherex-lab')!;
  const btn = document.getElementById('spherex-lab-btn')!;

  let activeTab: Tab = 'telemetry';
  let activeTarget: SpectralTargetId = 'planet-x';
  let channels: SpectralChannel[] = generateSpectrum(activeTarget);
  let hoverChannel: SpectralChannel | null = null;
  let archiveBands: SurveyBandMeta[] = DEFAULT_SURVEY_BANDS;
  let archiveLive = false;
  let archiveRelease = '2026-06-12';

  // Состояние поиска
  let blinkEpoch = 0;
  let blinkAuto = true;
  let viewMode: 'frame' | 'diff' = 'frame';
  // Первый сектор сессии — с обнаружением ≥5σ, чтобы инструмент сразу показывал метод; дальше — как выпадет
  let sector: SurveySector = generateSector();
  for (let i = 0; i < 40 && !(sector.kind !== 'none' && sector.snrDb >= 5); i++) sector = generateSector();
  let estimate: DistanceEstimate = estimateDistance(sector);
  const FRAME_W = 248, FRAME_H = 133;
  let frames: Float32Array[] = [];
  const session = { scanned: 0, detections: 0, planetX: 0 };
  const candidates: { n: number; sector: SurveySector; est: DistanceEstimate }[] = [];
  const log: string[] = [];

  panel.setAttribute('aria-label', 'SPHEREx — научная консоль');
  panel.innerHTML = `
    <header class="sxw-head">
      <div class="sxw-id">
        <span class="ui-micro">SPHEREx · MIDEX-9 · NORAD ${SPHEREX_NORAD} · COSPAR ${SPHEREX_COSPAR}</span>
        <h2>Научная консоль</h2>
      </div>
      <span id="sxw-src" class="sxw-src">TLE</span>
      <button type="button" id="sxw-close" class="sxw-x" aria-label="Закрыть">${ICON.close}</button>
    </header>
    <div class="sxw-status" id="sxw-status">
      <div><span>UTC</span><b id="st-utc">—</b></div>
      <div><span>Виток</span><b id="st-orbit">—</b></div>
      <div><span>Высота</span><b id="st-alt">—</b></div>
      <div><span>Накл.</span><b id="st-inc">—</b></div>
      <div><span>Проход</span><b id="st-pass">—</b></div>
      <div><span>Небо</span><b id="st-sky">—</b></div>
    </div>
    <nav class="ui-tabs sxw-tabs" role="tablist" aria-label="Разделы SPHEREx">
      <button role="tab" data-tab="telemetry" aria-selected="true">Телеметрия</button>
      <button role="tab" data-tab="spectrum" aria-selected="false">Спектрометр</button>
      <button role="tab" data-tab="planetx" aria-selected="false">Поиск Planet X</button>
      <button role="tab" data-tab="mission" aria-selected="false">Миссия</button>
    </nav>

    <section class="sxw-pane" data-pane="telemetry" role="tabpanel">
      <h3 class="sxw-h">Орбита · SGP4</h3>
      <dl class="sxw-kv" id="tel-kv"></dl>
      <h3 class="sxw-h">Подспутниковая трасса <em>−½ / +1 виток · терминатор</em></h3>
      <div class="sxw-plot"><canvas id="tel-track"></canvas></div>
      <h3 class="sxw-h">Обзор неба <em>полное небо каждые 182,6 сут</em></h3>
      <table class="ui-table sxw-pass" id="tel-pass"></table>
      <dl class="sxw-kv" id="tel-survey"></dl>
      <div class="sxw-actions">
        <button type="button" class="ui-btn primary" id="act-craft">${ICON.target}Подлететь к SPHEREx</button>
        <button type="button" class="ui-btn" id="act-scope">${ICON.scope}<span>Вид с телескопа</span></button>
        <button type="button" class="ui-btn" id="act-cone" aria-pressed="false">Конус FOV</button>
      </div>
    </section>

    <section class="sxw-pane" data-pane="spectrum" role="tabpanel" hidden>
      <h3 class="sxw-h">Детекторы <em>щелчок — показать канал на ИК-небе</em></h3>
      <table class="ui-table sxw-det" id="spec-det"></table>
      <div class="sxw-row">
        <button type="button" class="ui-btn" id="act-irsky" aria-pressed="false">ИК-небо</button>
        <div class="sxw-seg" id="spec-bands" role="group" aria-label="Канал ИК-неба">
          ${(['color', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6'] as SurveyBandId[]).map((b) => `<button type="button" data-band="${b}">${b === 'color' ? 'RGB' : b}</button>`).join('')}
        </div>
      </div>
      <h3 class="sxw-h">Спектр 102 канала <em>модель цели · F<sub>ν</sub> норм.</em></h3>
      <div class="sxw-row">
        <label class="ui-micro" for="spec-target">Цель</label>
        <select id="spec-target" class="ui-input">${SPECTRAL_TARGETS.map((t) => `<option value="${t.id}">${t.name}</option>`).join('')}</select>
        <span class="sxw-temp" id="spec-temp"></span>
      </div>
      <div class="sxw-plot"><canvas id="spec-canvas" data-testid="spectrum-canvas"></canvas></div>
      <div class="sxw-readout" id="spec-readout">КАН — · — · λ — мкм · R — · Fν —</div>
      <div class="sxw-lines" id="spec-lines"></div>
      <h3 class="sxw-h" id="arch-title">Архив QR2</h3>
      <table class="ui-table" id="arch-table"></table>
    </section>

    <section class="sxw-pane" data-pane="planetx" role="tabpanel" hidden>
      <p class="sxw-disclaimer">Симуляция метода на синтетических секторах: параллакс и шум — реальная физика, изображения — нет.</p>
      <div class="sxw-row sxw-toolbar">
        <div class="sxw-seg" id="px-mode" role="group" aria-label="Режим">
          <button type="button" data-mode="frame">Кадр</button>
          <button type="button" data-mode="diff" title="Разностное изображение: эпоха n минус эпоха 1">Eₙ−E₁</button>
        </div>
        <div class="sxw-seg" id="px-epochs" role="group" aria-label="Эпоха">
          ${[0, 1, 2, 3].map((i) => `<button type="button" data-epoch="${i}">E${i + 1}</button>`).join('')}
        </div>
        <button type="button" class="ui-btn sxw-icon" id="px-auto" aria-label="Автоблинк" aria-pressed="true">${ICON.pause}</button>
        <button type="button" class="ui-btn primary" id="px-next">Следующий сектор${ICON.next}</button>
      </div>
      <div class="sxw-plot sxw-image"><canvas id="px-canvas" data-testid="blink-canvas"></canvas></div>
      <dl class="sxw-kv sxw-kv3" id="px-meas"></dl>
      <div class="sxw-verdict" id="px-verdict"></div>
      <h3 class="sxw-h">Кандидаты сессии <em id="px-counts"></em></h3>
      <div class="sxw-scroll"><table class="ui-table sxw-cand" id="px-cand"></table></div>
      <h3 class="sxw-h">Журнал</h3>
      <pre class="sxw-log" id="px-log"></pre>
      <div class="sxw-actions">
        <button type="button" class="ui-btn primary" id="px-3d">${ICON.target}Planet X в 3D</button>
        <button type="button" class="ui-btn" id="px-spec">Спектр Planet X</button>
      </div>
    </section>

    <section class="sxw-pane" data-pane="mission" role="tabpanel" hidden>
      <h3 class="sxw-h">Паспорт миссии</h3>
      <table class="ui-table sxw-facts">
        <tr><td>Полное название</td><td>Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer</td></tr>
        <tr><td>Программа</td><td>NASA Explorers · MIDEX-9</td></tr>
        <tr><td>Запуск</td><td class="n">${utc(new Date(SPHEREX_LAUNCH_MS))} UTC</td></tr>
        <tr><td>Носитель / площадка</td><td>Falcon 9 · Ванденберг</td></tr>
        <tr><td>Начало обзора</td><td class="n">${fmtDay(SPHEREX_SURVEY_START_MS)}</td></tr>
        <tr><td>Орбита</td><td>Солнечно-синхронная, полярная</td></tr>
        <tr><td>Диапазон</td><td class="n">0,75–5,00 мкм</td></tr>
        <tr><td>Спектральных каналов</td><td class="n">102 (6 детекторов × 17)</td></tr>
        <tr><td>Разрешение R</td><td class="n">35–41 · 112 · 128</td></tr>
        <tr><td>Поле зрения</td><td class="n">11,3° × 3,5°</td></tr>
        <tr><td>Пиксель</td><td class="n">${RESEARCH_ARCSEC_PER_PX.toFixed(1)}″</td></tr>
        <tr><td>Каденс обзора</td><td>Всё небо каждые ~6 мес.</td></tr>
        <tr><td>Базовая миссия</td><td>2 года · 4 прохода неба</td></tr>
        <tr><td>Каталог (план)</td><td class="n">~450 млн галактик · ~100 млн звёзд</td></tr>
        <tr><td>Архив</td><td>NASA/IPAC IRSA · HiPS через CDS</td></tr>
      </table>
      <h3 class="sxw-h">Научные задачи</h3>
      <table class="ui-table sxw-facts">
        <tr><td>Инфляция</td><td>Трёхмерная карта ~450 млн галактик → негауссовость первичных флуктуаций</td></tr>
        <tr><td>История галактик</td><td>Суммарное фоновое излучение (intensity mapping)</td></tr>
        <tr><td>Льды</td><td>H₂O, CO₂, CO в молекулярных облаках Галактики</td></tr>
      </table>
    </section>
  `;

  const $ = <T extends HTMLElement = HTMLElement>(s: string) => panel.querySelector<T>(s)!;
  const scopeBtn = $<HTMLButtonElement>('#act-scope');
  const coneBtn = $<HTMLButtonElement>('#act-cone');
  const irBtn = $<HTMLButtonElement>('#act-irsky');
  const bandBtns = [...panel.querySelectorAll<HTMLButtonElement>('#spec-bands button')];
  const targetSel = $<HTMLSelectElement>('#spec-target');
  const specCanvas = $<HTMLCanvasElement>('#spec-canvas');
  const trackCanvas = $<HTMLCanvasElement>('#tel-track');
  const pxCanvas = $<HTMLCanvasElement>('#px-canvas');
  const epochBtns = [...panel.querySelectorAll<HTMLButtonElement>('#px-epochs button')];
  const modeBtns = [...panel.querySelectorAll<HTMLButtonElement>('#px-mode button')];
  const autoBtn = $<HTMLButtonElement>('#px-auto');

  // ---------- Слои 3D ----------
  const syncLayerControls = () => {
    const ir = cb.isIrSkyEnabled(), cone = cb.isScanConeEnabled(), scope = cb.isTelescopeView(), band = cb.getSurveyBand();
    irBtn.setAttribute('aria-pressed', String(ir));
    coneBtn.setAttribute('aria-pressed', String(cone));
    scopeBtn.setAttribute('aria-pressed', String(scope));
    scopeBtn.querySelector('span')!.textContent = scope ? 'Выйти из телескопа' : 'Вид с телескопа';
    bandBtns.forEach((b) => b.setAttribute('aria-pressed', String(ir && b.dataset.band === band)));
    panel.querySelectorAll<HTMLTableRowElement>('#spec-det tr[data-band]').forEach((r) => r.classList.toggle('on', ir && r.dataset.band === band));
  };
  const showBand = (band: SurveyBandId) => {
    cb.setSurveyBand(band);
    if (!cb.isIrSkyEnabled()) cb.setIrSkyEnabled(true);
    syncLayerControls();
  };

  // ---------- Вкладки / открытие ----------
  const setTab = (tab: Tab) => {
    activeTab = tab;
    panel.querySelectorAll<HTMLButtonElement>('.sxw-tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    panel.querySelectorAll<HTMLElement>('.sxw-pane').forEach((p) => (p.hidden = p.dataset.pane !== tab));
    redraw();
  };
  const redraw = () => {
    if (panel.classList.contains('hidden')) return;
    if (activeTab === 'telemetry') { refreshTelemetry(); drawTrack(); }
    if (activeTab === 'spectrum') drawSpectrum();
    if (activeTab === 'planetx') drawBlink();
  };

  const toggleOpen = (force?: boolean) => {
    const next = force ?? panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !next);
    document.body.classList.toggle('lab-open', next);
    btn.classList.toggle('on', next);
    btn.setAttribute('aria-pressed', String(next));
    if (next) {
      const tb = document.getElementById('toolbox');
      if (tb && !tb.classList.contains('hidden')) { tb.classList.add('hidden'); document.body.classList.remove('tb-open'); }
      syncLayerControls();
      refreshStatus();
      requestAnimationFrame(redraw);
    }
  };

  btn.onclick = () => toggleOpen();
  $('#sxw-close').onclick = () => toggleOpen(false);
  const tabBtns = [...panel.querySelectorAll<HTMLButtonElement>('.sxw-tabs button')];
  tabBtns.forEach((b, i) => {
    b.onclick = () => setTab(b.dataset.tab as Tab);
    b.onkeydown = (ev) => {
      if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
      const n = tabBtns[(i + (ev.key === 'ArrowRight' ? 1 : tabBtns.length - 1)) % tabBtns.length];
      n.focus(); n.click();
    };
  });
  addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !panel.classList.contains('hidden')) toggleOpen(false); });
  addEventListener('resize', () => redraw());

  irBtn.onclick = () => { cb.setIrSkyEnabled(!cb.isIrSkyEnabled()); syncLayerControls(); };
  coneBtn.onclick = () => { cb.setScanConeEnabled(!cb.isScanConeEnabled()); syncLayerControls(); };
  bandBtns.forEach((b) => (b.onclick = () => showBand(b.dataset.band as SurveyBandId)));
  $('#act-craft').onclick = () => { cb.setTelescopeView(false); cb.focusBody('spherex'); syncLayerControls(); };
  scopeBtn.onclick = () => {
    const next = !cb.isTelescopeView();
    if (next && !cb.isIrSkyEnabled()) cb.setIrSkyEnabled(true);
    cb.setTelescopeView(next);
    syncLayerControls();
  };

  // ---------- Статусная строка ----------
  function refreshStatus() {
    const date = cb.getDate(), tel = cb.getTelemetry(), tle = cb.getTle(), st = surveyStats(date);
    const set = (id: string, t: string) => { const el = panel.querySelector(id); if (el) el.textContent = t; };
    set('#st-utc', utc(date).slice(5));
    const live = tle.source === 'live';
    const src = $('#sxw-src');
    src.textContent = 'TLE ' + tle.epochIso.slice(0, 10);
    void live;
    if (tel) {
      const orb = orbitNumber(tle, date, tel.revsPerDay);
      set('#st-orbit', orb != null ? String(orb) : '—');
      set('#st-alt', `${tel.altitudeKm.toFixed(1)} км`);
      set('#st-inc', `${tel.inclinationDeg.toFixed(2)}°`);
    } else {
      set('#st-orbit', 'до запуска'); set('#st-alt', '—'); set('#st-inc', '—');
    }
    const before = date.getTime() < SPHEREX_SURVEY_START_MS;
    set('#st-pass', before ? '—' : `${st.currentPass}`);
    set('#st-sky', before ? '0 %' : `${st.passProgressPct.toFixed(1)} %`);
  }

  // ---------- Телеметрия ----------
  function refreshTelemetry() {
    const date = cb.getDate(), tel = cb.getTelemetry(), tle = cb.getTle(), st = surveyStats(date);
    const row = (k: string, v: string) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
    $('#tel-kv').innerHTML = tel
      ? [
          row('Высота', `${tel.altitudeKm.toFixed(2)} км`),
          row('Скорость', `${tel.speedKmS.toFixed(3)} км/с`),
          row('Период', `${tel.periodMin.toFixed(2)} мин`),
          row('Наклонение', `${tel.inclinationDeg.toFixed(3)}°`),
          row('Шир. / долг.', `${sgn(tel.latDeg, 2)}° ${sgn(tel.lonDeg, 2)}°`),
          row('Освещённость', tel.sunlit ? 'Солнце' : 'Тень Земли'),
          row('Витков/сут', tel.revsPerDay.toFixed(4)),
          row('Эпоха TLE', tle.epochIso.slice(0, 16).replace('T', ' ')),
        ].join('')
      : row('Статус', 'Аппарат ещё не запущен на выбранную дату') + row('Запуск', utc(new Date(SPHEREX_LAUNCH_MS)));

    const passes = [1, 2, 3, 4, 5, 6];
    $('#tel-pass').innerHTML = `<thead><tr><th>Проход</th><th>Интервал</th><th>Покрытие</th><th></th></tr></thead><tbody>${passes
      .map((p) => {
        const t0 = SPHEREX_SURVEY_START_MS + (p - 1) * PASS_DAYS * 86400e3;
        const pct = date.getTime() < SPHEREX_SURVEY_START_MS ? 0 : p < st.currentPass ? 100 : p === st.currentPass ? st.passProgressPct : 0;
        const ext = p > 4 ? ' <i>расш.</i>' : '';
        return `<tr class="${p === st.currentPass ? 'cur' : ''}"><td class="n">${p}${ext}</td><td class="n">${fmtDay(t0)} → ${fmtDay(t0 + PASS_DAYS * 86400e3)}</td>
          <td class="sxw-bar"><span style="width:${pct}%"></span></td><td class="n">${pct.toFixed(pct > 0 && pct < 100 ? 1 : 0)} %</td></tr>`;
      })
      .join('')}</tbody>`;
    const row2 = (k: string, v: string) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
    $('#tel-survey').innerHTML = [
      row2('Спектров', `${st.totalSpectraBillions.toFixed(2)} млрд`),
      row2('Экспозиций', st.exposuresCount.toLocaleString('ru-RU')),
      row2('Галактик / звёзд', `${st.galaxiesCatalogedM} / ${st.starsCatalogedM} млн`),
      row2('Глубина полей', `${st.deepFieldDepthX}×`),
    ].join('');
  }

  let trackCache: { t: number; pts: [number, number][] } | null = null;
  function drawTrack() {
    const { g, W, H } = prepCanvas(trackCanvas, 2.15);
    const date = cb.getDate(), tel = cb.getTelemetry();
    const L = 34, R = 8, T = 8, B = 18, pw = W - L - R, ph = H - T - B;
    const X = (lon: number) => L + ((lon + 180) / 360) * pw, Y = (lat: number) => T + ((90 - lat) / 180) * ph;
    g.fillStyle = '#06080a'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#0b0f13'; g.fillRect(L, T, pw, ph);

    // Ночная сторона: терминатор по подсолнечной точке
    const doy = (date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86400e3;
    const decl = (-23.44 * Math.cos((2 * Math.PI * (doy + 10)) / 365)) * (Math.PI / 180);
    const lonS = (12 - (date.getUTCHours() + date.getUTCMinutes() / 60)) * 15;
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.beginPath();
    for (let i = 0; i <= 180; i++) {
      const lon = -180 + i * 2;
      const lat = Math.atan(-Math.cos(((lon - lonS) * Math.PI) / 180) / Math.tan(decl)) * (180 / Math.PI);
      if (i === 0) g.moveTo(X(lon), Y(lat)); else g.lineTo(X(lon), Y(lat));
    }
    const nightBelow = decl > 0;
    g.lineTo(X(180), Y(nightBelow ? -90 : 90)); g.lineTo(X(-180), Y(nightBelow ? -90 : 90)); g.closePath(); g.fill();

    // Сетка и подписи
    g.strokeStyle = '#1b2128'; g.lineWidth = 1; g.font = MONO_S; g.fillStyle = '#56616d';
    g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let lat = -60; lat <= 60; lat += 30) { g.beginPath(); g.moveTo(L, Y(lat) + 0.5); g.lineTo(L + pw, Y(lat) + 0.5); g.stroke(); g.fillText(`${lat}°`, L - 4, Y(lat)); }
    g.textAlign = 'center'; g.textBaseline = 'top';
    for (let lon = -180; lon <= 180; lon += 60) { g.beginPath(); g.moveTo(X(lon) + 0.5, T); g.lineTo(X(lon) + 0.5, T + ph); g.stroke(); g.fillText(`${lon}°`, X(lon), T + ph + 4); }
    g.strokeStyle = '#29313b'; g.strokeRect(L + 0.5, T + 0.5, pw - 1, ph - 1);
    // Подсолнечная точка
    g.strokeStyle = '#ffcc4d'; g.beginPath(); g.arc(X(((lonS + 540) % 360) - 180), Y(decl * 180 / Math.PI), 3.5, 0, Math.PI * 2); g.stroke();

    if (!tel) { g.fillStyle = '#8a94a1'; g.font = MONO; g.textAlign = 'left'; g.fillText('нет данных: до запуска', L + 8, T + 8); return; }
    // Трасса: −0,5…+1 виток (SGP4), кэш на 20 с модельного времени
    if (!trackCache || Math.abs(trackCache.t - date.getTime()) > 20e3) {
      const per = tel.periodMin * 60e3, pts: [number, number][] = [];
      for (let i = 0; i <= 150; i++) {
        const p = propagateSpherex(new Date(date.getTime() + (-0.5 + (i / 150) * 1.5) * per));
        if (p) pts.push([p.telemetry.lonDeg, p.telemetry.latDeg]);
      }
      trackCache = { t: date.getTime(), pts };
    }
    const pts = trackCache.pts, nowIdx = Math.round((0.5 / 1.5) * 150);
    const seg = (from: number, to: number, color: string, dash: number[]) => {
      g.strokeStyle = color; g.setLineDash(dash); g.lineWidth = 1.2; g.beginPath();
      for (let i = from; i <= Math.min(to, pts.length - 1); i++) {
        const [lo, la] = pts[i];
        if (i === from || Math.abs(lo - pts[i - 1][0]) > 180) g.moveTo(X(lo), Y(la)); else g.lineTo(X(lo), Y(la));
      }
      g.stroke(); g.setLineDash([]);
    };
    seg(0, nowIdx, '#56616d', [2, 3]);
    seg(nowIdx, pts.length - 1, css('--accent'), []);
    const x = X(tel.lonDeg), y = Y(tel.latDeg);
    g.fillStyle = css('--accent'); g.fillRect(x - 3, y - 3, 6, 6);
    g.strokeStyle = css('--accent'); g.strokeRect(x - 6.5, y - 6.5, 13, 13);
    g.fillStyle = '#e6e9ee'; g.font = MONO_S; g.textAlign = x > W - 110 ? 'right' : 'left'; g.textBaseline = 'bottom';
    g.fillText(`${sgn(tel.latDeg)}° ${sgn(tel.lonDeg)}°`, x + (x > W - 110 ? -10 : 10), y - 4);
  }

  // ---------- Спектрометр ----------
  function renderDetectors() {
    $('#spec-det').innerHTML = `<thead><tr><th>Дет.</th><th>λ, мкм</th><th>R</th><th>Кан.</th><th>Назначение</th></tr></thead><tbody>${DETECTORS.map((d) => {
      const meta = archiveBands.find((b) => b.id === d.id);
      return `<tr data-band="${d.id}" tabindex="0"><td><b>${d.id}</b></td><td class="n">${d.min.toFixed(2)}–${d.max.toFixed(2)}</td><td class="n">${d.R}</td><td class="n">17</td><td>${meta?.scienceFocus ?? ''}</td></tr>`;
    }).join('')}</tbody>`;
    panel.querySelectorAll<HTMLTableRowElement>('#spec-det tr[data-band]').forEach((r) => {
      r.onclick = () => showBand(r.dataset.band as SurveyBandId);
      r.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); showBand(r.dataset.band as SurveyBandId); } };
    });
    syncLayerControls();
  }

  function renderTarget() {
    const meta = SPECTRAL_TARGETS.find((t) => t.id === activeTarget)!;
    $('#spec-temp').textContent = `T ≈ ${meta.tempK} K`;
    $('#spec-lines').innerHTML = meta.keyLines.map((k) => `<span>${k}</span>`).join('');
  }

  function renderArchive() {
    $('#arch-title').innerHTML = archiveLive
      ? `Архив QR2 <em>релиз ${archiveRelease.slice(0, 10)}</em>`
      : 'Архив QR2';
    $('#arch-table').innerHTML = `<thead><tr><th>Слой</th><th>λ, мкм</th><th>Покрытие</th><th>Тайлов HiPS</th></tr></thead><tbody>${archiveBands
      .map((b) => `<tr><td>${b.id === 'color' ? 'RGB' : b.id}</td><td class="n">${b.lambdaMinUm.toFixed(2)}–${b.lambdaMaxUm.toFixed(2)}</td><td class="n">${b.skyCoveragePct.toFixed(2)} %</td><td class="n">${b.tilesCount.toLocaleString('ru-RU')}</td></tr>`)
      .join('')}</tbody>`;
  }

  const SPEC = { L: 46, R: 12, T: 22, B: 34 };
  const specX = (um: number, W: number) => SPEC.L + ((um - 0.75) / (5.0 - 0.75)) * (W - SPEC.L - SPEC.R);
  function drawSpectrum() {
    const { g, W, H } = prepCanvas(specCanvas, 2.2);
    const pw = W - SPEC.L - SPEC.R, ph = H - SPEC.T - SPEC.B;
    const X = (um: number) => specX(um, W), Y = (f: number) => SPEC.T + (1 - f / 1.2) * ph;
    g.fillStyle = '#06080a'; g.fillRect(0, 0, W, H);

    // Полоса детекторов под осью
    g.font = MONO_S; g.textBaseline = 'middle'; g.textAlign = 'center';
    DETECTORS.forEach((d, i) => {
      const x0 = X(d.min), x1 = X(d.max);
      g.fillStyle = i % 2 ? '#0d1116' : '#0a0d11';
      g.fillRect(x0, SPEC.T, x1 - x0, ph);
      g.fillStyle = hoverChannel?.band === d.id ? css('--accent') : '#29313b';
      g.fillRect(x0 + 1, H - 12, x1 - x0 - 2, 2);
      g.fillStyle = hoverChannel?.band === d.id ? '#e6e9ee' : '#56616d';
      g.fillText(d.id, (x0 + x1) / 2, SPEC.T - 10);
    });

    // Сетка и оси
    g.strokeStyle = '#1b2128'; g.lineWidth = 1;
    g.textAlign = 'right'; g.fillStyle = '#56616d';
    for (const f of [0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2]) {
      const y = Math.round(Y(f)) + 0.5;
      g.beginPath(); g.moveTo(SPEC.L, y); g.lineTo(SPEC.L + pw, y); g.stroke();
      g.fillText(f.toFixed(1), SPEC.L - 6, y);
    }
    g.textAlign = 'center'; g.textBaseline = 'top';
    for (let um = 1; um <= 5; um += 0.25) {
      const x = Math.round(X(um)) + 0.5, major = Math.abs(um - Math.round(um)) < 1e-6;
      g.strokeStyle = major ? '#3a4450' : '#29313b';
      g.beginPath(); g.moveTo(x, SPEC.T + ph); g.lineTo(x, SPEC.T + ph + (major ? 5 : 3)); g.stroke();
      if (major) { g.textAlign = um === 5 ? 'right' : 'center'; g.fillText(um === 5 ? '5.0 мкм' : um.toFixed(1), um === 5 ? x + 6 : x, SPEC.T + ph + 7); }
    }
    g.strokeStyle = '#3a4450';
    g.beginPath(); g.moveTo(SPEC.L + 0.5, SPEC.T); g.lineTo(SPEC.L + 0.5, SPEC.T + ph + 0.5); g.lineTo(SPEC.L + pw, SPEC.T + ph + 0.5); g.stroke();
    g.fillStyle = '#8a94a1';
    g.save(); g.translate(10, SPEC.T + ph / 2); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.fillText('Fν, норм.', 0, 0); g.restore();

    // Спектральные особенности: вертикальные метки
    g.font = MONO_S; g.textBaseline = 'bottom';
    const used: number[] = [];
    for (const ch of channels) {
      if (!ch.feature) continue;
      const x = Math.round(X(ch.wavelengthUm)) + 0.5;
      g.strokeStyle = 'rgba(255,107,44,0.35)'; g.setLineDash([2, 3]);
      g.beginPath(); g.moveTo(x, SPEC.T + 12); g.lineTo(x, Y(ch.flux) - 4); g.stroke(); g.setLineDash([]);
      const ly = used.some((u) => Math.abs(u - x) < 54) ? SPEC.T + 21 : SPEC.T + 11;
      if (ly === SPEC.T + 11) used.push(x);
      g.fillStyle = '#b8c0ca'; g.textAlign = x > W - 60 ? 'right' : x < SPEC.L + 30 ? 'left' : 'center';
      g.fillText(ch.feature, x, ly);
    }

    // Данные: линия + точки
    g.strokeStyle = '#e6e9ee'; g.lineWidth = 1.2; g.beginPath();
    channels.forEach((ch, i) => { const x = X(ch.wavelengthUm), y = Y(ch.flux); if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); });
    g.stroke();
    g.fillStyle = '#e6e9ee';
    for (const ch of channels) { const x = X(ch.wavelengthUm), y = Y(ch.flux); g.fillRect(x - 1.25, y - 1.25, 2.5, 2.5); }

    if (hoverChannel) {
      const x = Math.round(X(hoverChannel.wavelengthUm)) + 0.5, y = Y(hoverChannel.flux);
      g.strokeStyle = css('--accent'); g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, SPEC.T); g.lineTo(x, SPEC.T + ph); g.stroke();
      g.strokeRect(x - 4.5, y - 4.5, 9, 9);
    }
  }

  const setReadout = () => {
    const ro = $('#spec-readout');
    if (!hoverChannel) { ro.textContent = 'КАН — · — · λ — мкм · R — · Fν —'; return; }
    const d = DETECTORS.find((x) => x.id === hoverChannel!.band)!;
    ro.innerHTML = `КАН <b>${String(hoverChannel.channel).padStart(3, '0')}</b>/102 · <b>${hoverChannel.band}</b> · λ <b>${hoverChannel.wavelengthUm.toFixed(3)}</b> мкм · Δλ ${(hoverChannel.wavelengthUm / d.R).toFixed(3)} · R ${d.R} · Fν <b>${hoverChannel.flux.toFixed(3)}</b>${hoverChannel.feature ? ` · <span class="acc">${hoverChannel.feature}</span>` : ''}`;
  };
  specCanvas.addEventListener('pointermove', (ev) => {
    const rect = specCanvas.getBoundingClientRect();
    const um = 0.75 + ((ev.clientX - rect.left - SPEC.L) / Math.max(1, rect.width - SPEC.L - SPEC.R)) * 4.25;
    let best: SpectralChannel | null = null, bd = Infinity;
    for (const ch of channels) { const d = Math.abs(ch.wavelengthUm - um); if (d < bd) { bd = d; best = ch; } }
    hoverChannel = best;
    setReadout();
    drawSpectrum();
  });
  specCanvas.addEventListener('pointerleave', () => { hoverChannel = null; setReadout(); drawSpectrum(); });
  targetSel.onchange = () => {
    activeTarget = targetSel.value as SpectralTargetId;
    channels = generateSpectrum(activeTarget);
    hoverChannel = null;
    renderTarget(); setReadout(); drawSpectrum();
  };

  // ---------- Поиск Planet X ----------
  const detected = (s: SurveySector) => s.kind !== 'none' && s.snrDb >= DETECTION_SIGMA;
  const stamp = () => { const d = new Date(); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`; };

  function ingestSector(s: SurveySector, est: DistanceEstimate) {
    session.scanned++;
    let line = `${stamp()}  ${s.label}  `;
    if (s.kind === 'none') line += 'нет движущихся источников';
    else if (!detected(s)) line += `источник ${s.snrDb.toFixed(1)}σ < ${DETECTION_SIGMA}σ — отбрасывается`;
    else {
      session.detections++;
      if (est.verdict === 'planet-x-candidate') session.planetX++;
      candidates.unshift({ n: session.detections, sector: s, est });
      const d = est.fromShortArcAu != null && est.fromParallaxJumpAu != null ? (est.fromShortArcAu + est.fromParallaxJumpAu) / 2 : null;
      line += `C${session.detections}  ${KIND_LABEL[est.verdict].toUpperCase()}  d≈${fmtAu(d)} а.е.  ${s.snrDb.toFixed(1)}σ`;
    }
    log.unshift(line);
    if (log.length > 40) log.pop();
  }

  function loadSector(s: SurveySector, record: boolean) {
    sector = s;
    estimate = estimateDistance(sector);
    frames = [0, 1, 2, 3].map((e) => synthFrame(sector, e, FRAME_W, FRAME_H));
    blinkEpoch = viewMode === 'diff' ? 1 : 0;
    if (record) ingestSector(sector, estimate);
    renderSearchTables();
    drawBlink();
  }

  function renderSearchTables() {
    const s = sector, e = estimate, det = detected(s);
    const ep = s.epochs[blinkEpoch];
    const dArc = Math.hypot(ep.dx - s.epochs[0].dx, ep.dy - s.epochs[0].dy) * (248 / 372) * RESEARCH_ARCSEC_PER_PX;
    const row = (k: string, v: string, cls = '') => `<div class="${cls}"><dt>${k}</dt><dd>${v}</dd></div>`;
    $('#px-meas').innerHTML = [
      row('Сектор', s.label),
      row('α / δ', `${s.raDeg.toFixed(2)}° ${sgn(s.decDeg, 2)}°`),
      row('Канал', 'D5–D6 · 3,8–5,0 мкм'),
      row('Δ E1→E' + (blinkEpoch + 1), s.kind === 'none' ? '—' : `${dArc.toFixed(1)}″`),
      row('Скорость', det && s.measuredShortArcRateArcsecPerDay != null ? `${s.measuredShortArcRateArcsecPerDay.toFixed(2)}″/сут` : '—'),
      row('SNR', s.kind === 'none' ? '—' : `${s.snrDb.toFixed(1)}σ`, s.kind !== 'none' && !det ? 'warn' : ''),
      row('d₁ короткая дуга', det ? `${fmtAu(e.fromShortArcAu)} а.е.` : '—'),
      row('d₂ параллакс 6 мес.', det ? `${fmtAu(e.fromParallaxJumpAu)} а.е.` : '—'),
      row('Согласие d₁/d₂', det && e.agreePct != null ? `${e.agreePct.toFixed(0)} %` : '—', det && e.agreePct != null && e.agreePct < 70 ? 'warn' : ''),
    ].join('');
    const v = $('#px-verdict');
    v.className = 'sxw-verdict ' + (det ? (e.verdict === 'planet-x-candidate' ? 'px' : 'det') : 'none');
    v.innerHTML = s.kind === 'none'
      ? '<b>Пусто</b><span>Неподвижный фон во всех 4 эпохах.</span>'
      : !det
      ? `<b>Ниже порога</b><span>Источник ${s.snrDb.toFixed(1)}σ — порог обнаружения ${DETECTION_SIGMA}σ.</span>`
      : `<b>${KIND_LABEL[e.verdict]}</b><span>${e.agreePct != null && e.agreePct >= 70 ? 'Оценки расстояния согласуются' : 'Оценки расходятся — нужны дополнительные проходы'} · модельное значение ${s.truthDistanceAu.toFixed(s.truthDistanceAu < 10 ? 1 : 0)} а.е.</span>`;

    $('#px-counts').textContent = `секторов ${session.scanned} · обнаружений ${session.detections} · Planet X ${session.planetX}`;
    $('#px-cand').innerHTML = `<thead><tr><th>#</th><th>Сектор</th><th>″/сут</th><th>d₁</th><th>d₂</th><th>Согл.</th><th>SNR</th><th>Класс</th></tr></thead><tbody>${
      candidates.length
        ? candidates.map((c) => `<tr data-seed="${c.sector.seed}" class="${c.sector === sector ? 'on' : ''} ${c.est.verdict === 'planet-x-candidate' ? 'px' : ''}" tabindex="0">
            <td class="n">C${c.n}</td><td>${c.sector.label}</td><td class="n">${c.sector.measuredShortArcRateArcsecPerDay!.toFixed(1)}</td>
            <td class="n">${fmtAu(c.est.fromShortArcAu)}</td><td class="n">${fmtAu(c.est.fromParallaxJumpAu)}</td>
            <td class="n">${c.est.agreePct != null ? c.est.agreePct.toFixed(0) : '—'}</td><td class="n">${c.sector.snrDb.toFixed(1)}</td><td>${KIND_LABEL[c.est.verdict]}</td></tr>`).join('')
        : '<tr><td colspan="8" class="empty">Пока нет обнаружений ≥ 5σ</td></tr>'
    }</tbody>`;
    panel.querySelectorAll<HTMLTableRowElement>('#px-cand tr[data-seed]').forEach((r) => {
      const open = () => { const c = candidates.find((x) => String(x.sector.seed) === r.dataset.seed); if (c) loadSector(c.sector, false); };
      r.onclick = open;
      r.onkeydown = (ev) => { if (ev.key === 'Enter') open(); };
    });
    $('#px-log').textContent = log.join('\n') || '—';
  }

  function drawBlink() {
    const { g, W, H } = prepCanvas(pxCanvas, FRAME_W / FRAME_H);
    // Пиксельное изображение детектора
    const img = new ImageData(FRAME_W, FRAME_H);
    const cur = frames[blinkEpoch], ref = frames[0];
    for (let i = 0; i < FRAME_W * FRAME_H; i++) {
      let r: number, gg: number, b: number;
      if (viewMode === 'diff') {
        const d = cur[i] - ref[i];
        const t = Math.max(0, Math.min(255, 128 + d * 9));
        r = gg = b = t;
      } else {
        const v = Math.asinh(Math.max(0, cur[i] + 0.5) / 2.5) / Math.asinh(44 / 2.5);
        const k = Math.max(0, Math.min(255, Math.round(v * 255))) * 3;
        r = INFERNO_LUT[k]; gg = INFERNO_LUT[k + 1]; b = INFERNO_LUT[k + 2];
      }
      img.data[i * 4] = r; img.data[i * 4 + 1] = gg; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
    }
    const off = document.createElement('canvas');
    off.width = FRAME_W; off.height = FRAME_H;
    off.getContext('2d')!.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = false;
    g.drawImage(off, 0, 0, W, H);

    // Шкала: деления каждые 2′
    const sc = W / FRAME_W, tickPx = (120 / RESEARCH_ARCSEC_PER_PX) * sc;
    g.strokeStyle = 'rgba(230,233,238,0.55)'; g.lineWidth = 1;
    for (let x = tickPx; x < W; x += tickPx) { g.beginPath(); g.moveTo(Math.round(x) + 0.5, 0); g.lineTo(Math.round(x) + 0.5, 5); g.moveTo(Math.round(x) + 0.5, H); g.lineTo(Math.round(x) + 0.5, H - 5); g.stroke(); }
    for (let y = tickPx; y < H; y += tickPx) { g.beginPath(); g.moveTo(0, Math.round(y) + 0.5); g.lineTo(5, Math.round(y) + 0.5); g.moveTo(W, Math.round(y) + 0.5); g.lineTo(W - 5, Math.round(y) + 0.5); g.stroke(); }

    // Подписи кадра
    g.font = MONO_S; g.textBaseline = 'top'; g.textAlign = 'left';
    const tag = (t: string, x: number, y: number, align: CanvasTextAlign = 'left') => {
      g.textAlign = align;
      const w = g.measureText(t).width;
      g.fillStyle = 'rgba(5,6,8,0.78)'; g.fillRect(align === 'right' ? x - w - 4 : x - 2, y - 2, w + 6, 13);
      g.fillStyle = '#e6e9ee'; g.fillText(t, align === 'right' ? x - 1 : x + 1, y);
    };
    tag(`${sector.label}  E${blinkEpoch + 1}${viewMode === 'diff' ? '−E1' : ''}  D5–D6`, 8, 8);
    tag(`α ${sector.raDeg.toFixed(2)}°  δ ${sgn(sector.decDeg, 2)}°`, W - 8, 8, 'right');
    tag(`деление 2′ · пикс ${RESEARCH_ARCSEC_PER_PX}″`, 8, H - 19);

    // Маркер обнаружения
    if (detected(sector)) {
      const mark = (ex: number, ey: number, label: string, dashed: boolean) => {
        const x = W / 2 + ex * (W / 372), y = H / 2 + ey * (H / 200);
        g.strokeStyle = css('--accent'); g.lineWidth = 1.2; g.setLineDash(dashed ? [3, 2] : []);
        g.strokeRect(Math.round(x - 9) + 0.5, Math.round(y - 9) + 0.5, 18, 18);
        g.setLineDash([]);
        g.font = MONO_S; g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillStyle = css('--accent');
        g.fillText(label, x + 12, y - 6);
      };
      const c = candidates.find((x) => x.sector === sector);
      const name = c ? `C${c.n}` : 'C?';
      const ep = sector.epochs[blinkEpoch];
      if (viewMode === 'diff') mark(sector.epochs[0].dx, sector.epochs[0].dy, 'E1 −', true);
      mark(ep.dx, ep.dy, `${name} ${sector.snrDb.toFixed(1)}σ`, false);
    }

    epochBtns.forEach((b, i) => {
      b.setAttribute('aria-pressed', String(i === blinkEpoch));
      b.disabled = viewMode === 'diff' && i === 0;
    });
    modeBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === viewMode)));
    autoBtn.innerHTML = blinkAuto ? ICON.pause : ICON.play;
    autoBtn.setAttribute('aria-pressed', String(blinkAuto));
  }

  epochBtns.forEach((b) => (b.onclick = () => {
    blinkEpoch = Number(b.dataset.epoch); blinkAuto = false;
    renderSearchTables(); drawBlink();
  }));
  modeBtns.forEach((b) => (b.onclick = () => {
    viewMode = b.dataset.mode as 'frame' | 'diff';
    if (viewMode === 'diff' && blinkEpoch === 0) blinkEpoch = 3;
    renderSearchTables(); drawBlink();
  }));
  autoBtn.onclick = () => { blinkAuto = !blinkAuto; drawBlink(); };
  $('#px-next').onclick = () => loadSector(generateSector(), true);
  $('#px-3d').onclick = () => { cb.setTelescopeView(false); cb.focusBody('planet-x'); syncLayerControls(); };
  $('#px-spec').onclick = () => {
    activeTarget = 'planet-x'; targetSel.value = 'planet-x';
    channels = generateSpectrum('planet-x'); hoverChannel = null;
    renderTarget(); setReadout(); setTab('spectrum');
  };

  // ---------- Старт ----------
  renderDetectors();
  renderTarget();
  renderArchive();
  loadSector(sector, true);
  fetchLiveSurveyArchive().then((res) => {
    archiveBands = res.bands; archiveLive = res.live; archiveRelease = res.releaseDate;
    renderArchive(); renderDetectors();
  });

  let tick = 0;
  setInterval(() => {
    if (panel.classList.contains('hidden')) return;
    tick++;
    refreshStatus();
    if (activeTab === 'telemetry') { refreshTelemetry(); if (tick % 3 === 0) drawTrack(); }
    if (activeTab === 'planetx' && blinkAuto) {
      blinkEpoch = viewMode === 'diff' ? (blinkEpoch % 3) + 1 : (blinkEpoch + 1) % 4;
      renderSearchTables(); drawBlink();
    }
  }, 700);

  return {
    open(tab) {
      toggleOpen(true);
      if (tab) setTab(tab);
    },
    close: () => toggleOpen(false),
    toggle: () => toggleOpen(),
    isOpen: () => !panel.classList.contains('hidden'),
  };
}
