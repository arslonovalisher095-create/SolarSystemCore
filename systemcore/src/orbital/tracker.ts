import { localized } from '../i18n';
// Трекер орбитальных объектов: обзор засорённости, каталог с поиском, события фрагментации,
// сопровождение выбранного объекта (SGP4, наземный трек, скрининг сближений) и малые тела.
import './tracker.css';
import { Catalog, OrbitalObject, CLASS_NAMES, CLASS_SHORT, EVENTS, TAG_NAMES, loadLiveCatalog, CLS_DEBRIS, CLS_ROCKET, isLaunchDangerous, dangerLevel, dangerText } from './catalog';
import { EarthLayer, CLASS_COLORS, DANGER_COLOR } from './earthLayer';
import { sgp4, geodetic, groundTrack, len, clearSatrecs } from './propagate';
import { screenConjunctions, Approach } from './conjunctions';
import { SmallBodyLayer, SB_COLORS, SB_NAMES, SbClass, SmallBody } from './smallBodies';
import { modelFor } from './models';

export interface TrackerDeps {
  getDate(): Date;
  layer: EarthLayer;
  sb: SmallBodyLayer | null;
  getCatalog(): Catalog;
  setCatalog(c: Catalog): void;
  track(norad: number): void;
  trackSmallBody(b: SmallBody): void;
  getTracked(): OrbitalObject | null;
  flyToEarth(): void;
  setLayerVisible(on: boolean): void;
  isLayerVisible(): boolean;
}

export interface TrackerController {
  open(tab?: Tab): void;
  close(): void;
  toggle(): void;
  onTracked(o: OrbitalObject | null): void;
  search(q: string): { label: string; sub: string; kind: string; go: () => void }[];
  infoHtml(o: OrbitalObject): string;
  updateInfo(o: OrbitalObject): void;
}

type Tab = 'overview' | 'catalog' | 'events' | 'object' | 'small';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const nf = (x: number, d = 0) => x.toLocaleString((document.documentElement.lang === 'ru' ? 'ru-RU' : 'en-US'), { maximumFractionDigits: d, minimumFractionDigits: d });
const utc = (ms: number) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
const icon = (d: string) => `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${d}"/></svg>`;
const I_CLOSE = icon('M3 3l10 10M13 3L3 13');
const I_REFRESH = icon('M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3');
const I_TARGET = icon('M8 1v4M8 11v4M1 8h4M11 8h4M8 5.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5');
const I_EYE = icon('M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8zM8 6a2 2 0 1 0 0 4a2 2 0 1 0 0-4');

export function initTracker(deps: TrackerDeps): TrackerController {
  const root = document.createElement('aside');
  root.id = 'tracker';
  root.className = 'trk hidden';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', localized("Трекер орбитальных объектов", "Orbital object tracker"));
  document.body.appendChild(root);

  // ---------------- состояние фильтров ----------------
  const st = {
    tab: 'overview' as Tab,
    cls: [true, true, true, true, true],
    regime: new Set(['LEO', 'MEO', 'GEO', 'HEO']),
    tag: '',
    q: '',
    isolate: false,          // в 3D показывать только отфильтрованное
    sort: 'name' as 'name' | 'norad' | 'perigee' | 'incl' | 'period',
    approaches: null as null | { forNorad: number; list: (Approach & { o: OrbitalObject; sgpKm: number | null })[]; screened: number; at: number; docked: number; rejected: number },
    screening: false,
    eventShown: '',
  };
  let filtered: OrbitalObject[] = [];

  const matches = (o: OrbitalObject) => {
    if (!st.cls[o.cls] || !st.regime.has(o.regime)) return false;
    if (st.tag && !o.tags.includes(st.tag)) return false;
    if (st.q) {
      const q = st.q.toLowerCase();
      if (!(o.name.toLowerCase().includes(q) || String(o.norad) === q || o.cospar.toLowerCase().startsWith(q))) return false;
    }
    return true;
  };

  function applyFilters() {
    const cat = deps.getCatalog();
    filtered = cat.objects.filter(matches);
    const set = new Set(filtered);
    const narrowed = !!st.q || !!st.tag;
    deps.layer.setVisibility((o) => {
      const inF = set.has(o);
      if (st.isolate || !st.cls[o.cls] || !st.regime.has(o.regime)) return inF ? (narrowed ? 2 : 1) : 0;
      return inF && narrowed ? 2 : 1;
    });
    if (st.tab === 'catalog') renderCatalogList();
  }

  // ---------------- каркас ----------------
  function frame() {
    const cat = deps.getCatalog();
    root.innerHTML = `${localized("\n      <header class=\"trk-head\">\n        <div class=\"trk-title\">\n          <span class=\"ui-micro\">Трекер · орбита Земли</span>\n          <strong>Космический мусор и спутники</strong>\n        </div>\n        <button class=\"trk-x\" data-act=\"close\" aria-label=\"Закрыть\">", "\n      <header class=\"trk-head\">\n        <div class=\"trk-title\">\n          <span class=\"ui-micro\">Tracker · Earth orbit</span>\n          <strong>Space debris and satellites</strong>\n        </div>\n        <button class=\"trk-x\" data-act=\"close\" aria-label=\"Close\">")}${I_CLOSE}</button>
      </header>
      <div class="trk-src">
        <span>CelesTrak GP · ${utc(Date.parse(cat.generated)).slice(0, 16)} · <b class="ui-num">${nf(cat.objects.length)}${localized("</b> объектов</span>\n        <button class=\"ui-btn sm\" data-act=\"refresh\" title=\"Загрузить свежие элементы из зеркала CelesTrak\">", "</b> objects</span>\n        <button class=\"ui-btn sm\" data-act=\"refresh\" title=\"Load fresh elements from the CelesTrak mirror\">")}${I_REFRESH}${localized("<span>Обновить</span></button>\n      </div>\n      <nav class=\"ui-tabs trk-tabs\" role=\"tablist\">\n        ", "<span>Refresh</span></button>\n      </div>\n      <nav class=\"ui-tabs trk-tabs\" role=\"tablist\">\n        ")}${(['overview', 'catalog', 'events', 'object', 'small'] as Tab[]).map((t) => `<button role="tab" data-tab="${t}" aria-selected="${st.tab === t}">${{ overview: localized("Обзор", "Overview"), catalog: localized("Каталог", "Catalog"), events: localized("События", "Events"), object: localized("Объект", "Object"), small: localized("Малые тела", "Small bodies") }[t]}</button>`).join('')}
      </nav>
      <div class="trk-body" id="trk-body"></div>`;
    renderTab();
  }

  function renderTab() {
    const body = root.querySelector<HTMLElement>('#trk-body')!;
    root.querySelectorAll<HTMLButtonElement>('.trk-tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === st.tab)));
    if (st.tab === 'overview') body.innerHTML = overviewHtml(), drawOverviewCharts();
    else if (st.tab === 'catalog') { body.innerHTML = catalogHtml(); renderCatalogList(); }
    else if (st.tab === 'events') body.innerHTML = eventsHtml();
    else if (st.tab === 'object') { body.innerHTML = objectHtml(); drawGroundTrack(); }
    else body.innerHTML = smallHtml();
  }

  // ---------------- ОБЗОР ----------------
  function overviewHtml() {
    const cat = deps.getCatalog();
    const cc = [0, 0, 0, 0, 0];
    const rg: Record<string, number> = { LEO: 0, MEO: 0, GEO: 0, HEO: 0 };
    // Подсчёт опасных объектов по уровням
    let dangerCrit = 0, dangerMed = 0, dangerLow = 0;
    for (const o of cat.objects) {
      cc[o.cls]++;
      rg[o.regime]++;
      const lv = dangerLevel(o);
      if (lv === 3) dangerCrit++;
      else if (lv === 2) dangerMed++;
      else if (lv === 1) dangerLow++;
    }
    const dangerTotal = dangerCrit + dangerMed + dangerLow;
    // самые засорённые оболочки (по 50 км, только обломки)
    const shells = new Map<number, number>();
    const dangerShells = new Map<number, number>();
    for (const o of cat.objects) if ((o.cls === CLS_DEBRIS || o.cls === CLS_ROCKET) && o.regime === 'LEO') {
      const h = Math.floor(((o.perigeeKm + o.apogeeKm) / 2) / 50) * 50;
      if (o.cls === CLS_DEBRIS) shells.set(h, (shells.get(h) ?? 0) + 1);
      if (isLaunchDangerous(o)) dangerShells.set(h, (dangerShells.get(h) ?? 0) + 1);
    }
    const topShells = [...shells.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topDanger = [...dangerShells.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    return `
      <section class="trk-kpis">
        ${CLASS_NAMES.map((n, i) => `<button class="kpi ${st.cls[i] ? '' : 'off'}" data-cls="${i}${localized("\" title=\"Показать/скрыть в 3D\">\n          <i style=\"background:", "\" title=\"Show/hide in 3D\">\n          <i style=\"background:")}${CLASS_COLORS[i]}"></i><span class="ui-micro">${n}</span><b class="ui-num">${nf(cc[i])}</b></button>`).join('')}
      </section>
      <section class="trk-sec trk-danger-panel">
        <div class="trk-sec-h">
          <span class="ui-micro" style="color:${DANGER_COLOR}${localized("\">⚠ Опасные для запуска ракеты</span>\n          <span class=\"ui-micro\">перигей ≤ 600 км · НОО</span>\n        </div>\n        <div class=\"trk-danger-kpis\">\n          <div class=\"trk-danger-kpi crit\" title=\"Критически опасные: перигей < 300 км\">\n            <span class=\"dot-danger\"></span>\n            <div><b class=\"ui-num\">", "\">⚠ Rocket launch hazards</span>\n          <span class=\"ui-micro\">perigee ≤600 km · LEO</span>\n        </div>\n        <div class=\"trk-danger-kpis\">\n          <div class=\"trk-danger-kpi crit\" title=\"Critical: perigee <300 km\">\n            <span class=\"dot-danger\"></span>\n            <div><b class=\"ui-num\">")}${nf(dangerCrit)}${localized("</b><span class=\"ui-micro\">Критический</span></div>\n          </div>\n          <div class=\"trk-danger-kpi med\" title=\"Средняя угроза: перигей 300–450 км\">\n            <span class=\"dot-danger med\"></span>\n            <div><b class=\"ui-num\">", "</b><span class=\"ui-micro\">Critical</span></div>\n          </div>\n          <div class=\"trk-danger-kpi med\" title=\"Medium hazard: perigee 300–450 km\">\n            <span class=\"dot-danger med\"></span>\n            <div><b class=\"ui-num\">")}${nf(dangerMed)}${localized("</b><span class=\"ui-micro\">Средний</span></div>\n          </div>\n          <div class=\"trk-danger-kpi low\" title=\"Низкая угроза: перигей 450–600 км\">\n            <span class=\"dot-danger low\"></span>\n            <div><b class=\"ui-num\">", "</b><span class=\"ui-micro\">Medium</span></div>\n          </div>\n          <div class=\"trk-danger-kpi low\" title=\"Low hazard: perigee 450–600 km\">\n            <span class=\"dot-danger low\"></span>\n            <div><b class=\"ui-num\">")}${nf(dangerLow)}${localized("</b><span class=\"ui-micro\">Низкий</span></div>\n          </div>\n          <div class=\"trk-danger-kpi total\">\n            <div><b class=\"ui-num\">", "</b><span class=\"ui-micro\">Low</span></div>\n          </div>\n          <div class=\"trk-danger-kpi total\">\n            <div><b class=\"ui-num\">")}${nf(dangerTotal)}${localized("</b><span class=\"ui-micro\">Всего</span></div>\n          </div>\n        </div>\n        <p class=\"trk-danger-note\">Красные точки в 3D = мусор на траектории запуска. Зелёные коридоры = безопасные полосы запуска (КК 28.5°, БК 51.6°, ВФБ 97.8°).</p>\n      </section>\n      <section class=\"trk-sec\">\n        <div class=\"trk-sec-h\"><span class=\"ui-micro\">Распределение по высоте · НОО 150–2000 км</span><span class=\"ui-micro\">шаг 25 км</span></div>\n        <canvas id=\"trk-hist\" height=\"150\"></canvas>\n        <div class=\"trk-legend\">", "</b><span class=\"ui-micro\">Total</span></div>\n          </div>\n        </div>\n        <p class=\"trk-danger-note\">Red points in 3D = debris on launch trajectories. Green corridors = safe launch bands (CC 28.5°, BK 51.6°, VAFB 97.8°).</p>\n      </section>\n      <section class=\"trk-sec\">\n        <div class=\"trk-sec-h\"><span class=\"ui-micro\">Altitude distribution · LEO 150–2000 km</span><span class=\"ui-micro\">25 km bins</span></div>\n        <canvas id=\"trk-hist\" height=\"150\"></canvas>\n        <div class=\"trk-legend\">")}${CLASS_NAMES.map((n, i) => `<span><i style="background:${CLASS_COLORS[i]}"></i>${n}</span>`).join('')}<span><i style="background:${DANGER_COLOR}${localized("\"></i>Опасный</span></div>\n      </section>\n      <section class=\"trk-sec\">\n        <div class=\"trk-sec-h\"><span class=\"ui-micro\">Наклонение × высота (лог.)</span><span class=\"ui-micro\">каждая точка — объект</span></div>\n        <canvas id=\"trk-scatter\" height=\"210\"></canvas>\n      </section>\n      <section class=\"trk-sec trk-cols\">\n        <div>\n          <div class=\"ui-micro\">Орбитальные режимы</div>\n          <table class=\"ui-table\">", "\"></i>Hazardous</span></div>\n      </section>\n      <section class=\"trk-sec\">\n        <div class=\"trk-sec-h\"><span class=\"ui-micro\">Inclination × altitude (log)</span><span class=\"ui-micro\">each point is an object</span></div>\n        <canvas id=\"trk-scatter\" height=\"210\"></canvas>\n      </section>\n      <section class=\"trk-sec trk-cols\">\n        <div>\n          <div class=\"ui-micro\">Orbital regimes</div>\n          <table class=\"ui-table\">")}${Object.entries(rg).map(([k, v]) => `<tr><td>${{ LEO: localized("НОО · LEO", "LEO"), MEO: localized("СОО · MEO", "MEO"), GEO: localized("ГСО · GEO", "GEO"), HEO: localized("ВЭО · HEO", "HEO") }[k]}</td><td class="n">${nf(v)}</td></tr>`).join('')}${localized("</table>\n        </div>\n        <div>\n          <div class=\"ui-micro\">Пик обломков, высота</div>\n          <table class=\"ui-table\">", "</table>\n        </div>\n        <div>\n          <div class=\"ui-micro\">Debris peak altitude</div>\n          <table class=\"ui-table\">")}${topShells.map(([h, n]) => `<tr><td class="ui-num">${h}–${h + 50}${localized(" км</td><td class=\"n\">", " km</td><td class=\"n\">")}${nf(n)}</td></tr>`).join('')}</table>
        </div>
      </section>
      <section class="trk-sec">
        <div class="trk-sec-h"><span class="ui-micro" style="color:${DANGER_COLOR}${localized("\">Пик опасных · высота</span><span class=\"ui-micro\">перигей ≤ 600 км</span></div>\n        <table class=\"ui-table\">", "\">Hazard peak · altitude</span><span class=\"ui-micro\">perigee ≤600 km</span></div>\n        <table class=\"ui-table\">")}${topDanger.map(([h, n]) => `<tr><td class="ui-num"><span class="dot-danger sm"></span>${h}–${h + 50}${localized(" км</td><td class=\"n\" style=\"color:", " km</td><td class=\"n\" style=\"color:")}${DANGER_COLOR}">${nf(n)}</td></tr>`).join('')}${localized("</table>\n      </section>\n      <p class=\"trk-note\">Состав: все действующие аппараты, облака обломков четырёх событий, объекты зоны ГСО и сходящие с орбиты из открытых групп CelesTrak. Полный каталог ~30 тыс. отслеживаемых объектов публикуется только на Space-Track (по регистрации).</p>", "</table>\n      </section>\n      <p class=\"trk-note\">Includes all active spacecraft, debris clouds from four events, GEO-zone and decaying objects from public CelesTrak groups. The full catalog of ~30,000 tracked objects is only published on Space-Track (registration required).</p>")}`;
  }

  function drawOverviewCharts() {
    const cat = deps.getCatalog();
    const hist = root.querySelector<HTMLCanvasElement>('#trk-hist');
    if (hist) {
      const { g, W, H } = prep(hist);
      const bins = 74, lo = 150, step = 25;
      const stack = Array.from({ length: bins }, () => [0, 0, 0, 0, 0]);
      for (const o of cat.objects) {
        if (o.regime !== 'LEO') continue;
        const h = (o.perigeeKm + o.apogeeKm) / 2;
        const b = Math.floor((h - lo) / step);
        if (b >= 0 && b < bins) stack[b][o.cls]++;
      }
      const max = Math.max(...stack.map((s) => s.reduce((a, b) => a + b, 0)));
      const L = 34, B = 18, T = 6, pw = W - L - 6, ph = H - B - T;
      axes(g, L, T, pw, ph, B);
      const yLog = (v: number) => (Math.log10(1 + v) / Math.log10(1 + max)) * ph;
      stack.forEach((s, i) => {
        let acc = 0;
        const x = L + (i / bins) * pw, w = Math.max(1, pw / bins - 1);
        [1, 2, 3, 4, 0].forEach((c) => {
          if (!s[c]) return;
          const y0 = yLog(acc), y1 = yLog(acc + s[c]);
          g.fillStyle = CLASS_COLORS[c];
          g.globalAlpha = c === 0 ? 0.85 : 0.95;
          g.fillRect(x, T + ph - y1, w, y1 - y0);
          acc += s[c];
        });
      });
      g.globalAlpha = 1;
      g.fillStyle = '#56616d'; g.font = '10px ' + mono();
      for (const h of [200, 500, 800, 1100, 1400, 1700, 2000]) { const x = L + ((h - lo) / (bins * step)) * pw; g.fillText(String(h), x - 9, H - 4); }
      for (const v of [10, 100, 1000]) if (v < max) { const y = T + ph - yLog(v); g.fillText(String(v), 2, y + 3); g.strokeStyle = '#141a20'; g.beginPath(); g.moveTo(L, y); g.lineTo(L + pw, y); g.stroke(); }
    }
    const sc = root.querySelector<HTMLCanvasElement>('#trk-scatter');
    if (sc) {
      const { g, W, H } = prep(sc);
      const L = 34, B = 18, T = 6, pw = W - L - 6, ph = H - B - T;
      axes(g, L, T, pw, ph, B);
      const hx = (h: number) => L + ((Math.log10(Math.max(h, 150)) - Math.log10(150)) / (Math.log10(45000) - Math.log10(150))) * pw;
      const iy = (i: number) => T + ph - (Math.min(i, 150) / 150) * ph;
      // зоны
      g.fillStyle = 'rgba(255,107,44,0.06)'; g.fillRect(hx(500), iy(99.5), hx(1000) - hx(500), iy(96) - iy(99.5));
      g.fillStyle = '#56616d'; g.font = '10px ' + mono();
      g.fillText(localized("ССО", "SSO"), hx(1050), iy(98) + 3);
      g.fillText(localized("ГСО", "GEO"), hx(30000), iy(4));
      // Зона опасности запуска: выделить полосу перигея ≤ 600 км
      g.fillStyle = 'rgba(255,26,26,0.04)';
      g.fillRect(hx(150), iy(108), hx(600) - hx(150), iy(15) - iy(108));
      g.strokeStyle = 'rgba(255,26,26,0.2)';
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(hx(600), T); g.lineTo(hx(600), T + ph); g.stroke();
      g.fillStyle = 'rgba(255,26,26,0.5)'; g.font = '9px ' + mono();
      g.fillText(localized("⚠ зона запуска", "⚠ launch zone"), hx(170), iy(112) + 3);
      // Обычные объекты
      for (const o of cat.objects) {
        if (!st.cls[o.cls] || isLaunchDangerous(o)) continue;
        g.fillStyle = CLASS_COLORS[o.cls];
        g.globalAlpha = o.cls === 0 ? 0.35 : 0.6;
        g.fillRect(hx((o.perigeeKm + o.apogeeKm) / 2), iy(o.incl), 1.4, 1.4);
      }
      // Опасные объекты поверх — красным
      for (const o of cat.objects) {
        if (!(isLaunchDangerous(o) && st.cls[o.cls])) continue;
        const lv = dangerLevel(o);
        g.fillStyle = lv === 3 ? '#ff1a1a' : lv === 2 ? '#ff5533' : '#ff8844';
        g.globalAlpha = 0.9;
        g.fillRect(hx((o.perigeeKm + o.apogeeKm) / 2) - 0.5, iy(o.incl) - 0.5, 2.4, 2.4);
      }
      g.globalAlpha = 1; g.fillStyle = '#56616d';
      for (const h of [200, 500, 1000, 2000, 5000, 20000, 36000]) g.fillText(h >= 1000 ? h / 1000 + 'k' : String(h), hx(h) - 8, H - 4);
      for (const i of [0, 30, 60, 90, 120, 150]) g.fillText(i + '°', 4, iy(i) + 3);
    }
  }

  // ---------------- КАТАЛОГ ----------------
  function catalogHtml() {
    const tags = Object.keys(TAG_NAMES);
    return `${localized("\n      <div class=\"trk-filters\">\n        <input class=\"ui-input\" id=\"trk-q\" placeholder=\"Название, NORAD или COSPAR (напр. ISS, 25544, 1999-025)\" value=\"", "\n      <div class=\"trk-filters\">\n        <input class=\"ui-input\" id=\"trk-q\" placeholder=\"Name, NORAD or COSPAR (e.g. ISS, 25544, 1999-025)\" value=\"")}${esc(st.q)}" autocomplete="off" spellcheck="false">
        <div class="chips">${CLASS_SHORT.map((n, i) => `<button class="chip ${st.cls[i] ? 'on' : ''}" data-cls="${i}" title="${CLASS_NAMES[i]}"><i style="background:${CLASS_COLORS[i]}"></i>${n}</button>`).join('')}
          <span class="sep"></span>${['LEO', 'MEO', 'GEO', 'HEO'].map((r) => `<button class="chip ${st.regime.has(r) ? 'on' : ''}" data-reg="${r}">${r}</button>`).join('')}${localized("</div>\n        <div class=\"row\">\n          <select class=\"ui-input\" id=\"trk-tag\"><option value=\"\">Все группы</option>", "</div>\n        <div class=\"row\">\n          <select class=\"ui-input\" id=\"trk-tag\"><option value=\"\">All groups</option>")}${tags.map((t) => `<option value="${t}" ${st.tag === t ? 'selected' : ''}>${TAG_NAMES[t]}</option>`).join('')}</select>
          <label class="chk"><input type="checkbox" id="trk-iso" ${st.isolate ? 'checked' : ''}${localized("><span></span>Только отфильтрованное в 3D</label>\n        </div>\n      </div>\n      <div class=\"trk-table-h\">\n        ", "><span></span>Only filtered objects in 3D</label>\n        </div>\n      </div>\n      <div class=\"trk-table-h\">\n        ")}${[['norad', 'NORAD'], ['name', localized("Объект", "Object")], ['', localized("Класс", "Class")], ['perigee', localized("Перигей", "Perigee")], ['', localized("Апогей", "Apogee")], ['incl', localized("Накл.", "Incl.")], ['period', localized("Период", "Period")]].map(([k, n]) => `<button ${k ? `data-sort="${k}"` : 'disabled'} class="${st.sort === k ? 'on' : ''}">${n}</button>`).join('')}
      </div>
      <div class="trk-list" id="trk-list"><div class="trk-spacer"></div><div class="trk-rows"></div></div>
      <div class="trk-foot ui-micro" id="trk-count"></div>`;
  }

  const ROW_H = 26;
  function sorted() {
    const a = [...filtered];
    const k = st.sort;
    a.sort((x, y) => k === 'norad' ? x.norad - y.norad : k === 'perigee' ? x.perigeeKm - y.perigeeKm : k === 'incl' ? x.incl - y.incl : k === 'period' ? x.periodMin - y.periodMin : x.name.localeCompare(y.name));
    return a;
  }
  let sortedCache: OrbitalObject[] = [];
  function renderCatalogList() {
    const list = root.querySelector<HTMLElement>('#trk-list');
    if (!list) return;
    sortedCache = sorted();
    list.querySelector<HTMLElement>('.trk-spacer')!.style.height = sortedCache.length * ROW_H + 'px';
    root.querySelector('#trk-count')!.textContent = `${nf(sortedCache.length)}${localized(" из ", " of ")}${nf(deps.getCatalog().objects.length)}${localized(" · в 3D: ", " · in 3D: ")}${st.isolate ? localized("только эти", "only these") : localized("все, совпадения подсвечены", "all, matches highlighted")}`;
    paintRows();
  }
  function paintRows() {
    const list = root.querySelector<HTMLElement>('#trk-list');
    if (!list) return;
    const first = Math.max(0, Math.floor(list.scrollTop / ROW_H) - 4), count = Math.ceil(list.clientHeight / ROW_H) + 8;
    const tracked = deps.getTracked();
    const rows = sortedCache.slice(first, first + count).map((o, k) => {
      const danger = isLaunchDangerous(o);
      const lv = danger ? dangerLevel(o) : 0;
      const dangerDot = danger ? `<span class="dot-danger${lv === 3 ? ' crit' : lv === 2 ? ' med' : ' low'} sm" title="${dangerText(o)}"></span>` : '';
      return `<button class="trk-row ${tracked === o ? 'on' : ''} ${danger ? 'trk-row-danger' : ''}" data-norad="${o.norad}" style="top:${(first + k) * ROW_H}px">
        <span class="ui-num">${o.norad}</span><span class="nm">${dangerDot}${esc(o.name)}</span>
        <span class="cl"><i style="background:${CLASS_COLORS[o.cls]}"></i>${CLASS_SHORT[o.cls]}</span>
        <span class="ui-num r">${nf(o.perigeeKm)}</span><span class="ui-num r">${nf(o.apogeeKm)}</span>
        <span class="ui-num r">${nf(o.incl, 1)}°</span><span class="ui-num r">${nf(o.periodMin, 1)}</span>
      </button>`;
    }).join('');
    list.querySelector('.trk-rows')!.innerHTML = rows;
  }

  // ---------------- СОБЫТИЯ ----------------
  function eventsHtml() {
    const cat = deps.getCatalog();
    const card = (tag: string, title: string, date: string, text: string) => {
      const objs = cat.objects.filter((o) => o.tags.includes(tag));
      const deb = objs.filter((o) => o.cls === CLS_DEBRIS).length;
      const hs = objs.map((o) => (o.perigeeKm + o.apogeeKm) / 2).sort((a, b) => a - b);
      const p10 = hs[Math.floor(hs.length * 0.1)] ?? 0, p90 = hs[Math.floor(hs.length * 0.9)] ?? 0;
      return `<article class="trk-ev ${st.eventShown === tag ? 'on' : ''}">
        <div class="trk-ev-h"><strong>${title}</strong><span class="ui-num">${date}</span></div>
        <p>${text}${localized("</p>\n        <div class=\"trk-ev-stats\">\n          <span><span class=\"ui-micro\">На орбите</span><b class=\"ui-num\">", "</p>\n        <div class=\"trk-ev-stats\">\n          <span><span class=\"ui-micro\">In orbit</span><b class=\"ui-num\">")}${nf(objs.length)}${localized("</b></span>\n          <span><span class=\"ui-micro\">Обломков</span><b class=\"ui-num\">", "</b></span>\n          <span><span class=\"ui-micro\">Debris</span><b class=\"ui-num\">")}${nf(deb)}${localized("</b></span>\n          <span><span class=\"ui-micro\">Высоты (10–90%)</span><b class=\"ui-num\">", "</b></span>\n          <span><span class=\"ui-micro\">Altitudes (10–90%)</span><b class=\"ui-num\">")}${objs.length ? `${nf(p10)}–${nf(p90)}${localized(" км", " km")}` : '—'}</b></span>
        </div>
        <div class="trk-ev-act">
          <button class="ui-btn ${st.eventShown === tag ? 'is-on' : ''}" data-show="${tag}">${I_EYE}<span>${st.eventShown === tag ? localized("Скрыть облако", "Hide cloud") : localized("Показать облако и орбиты", "Show cloud and orbits")}</span></button>
          <button class="ui-btn" data-list="${tag}${localized("\"><span>Список</span></button>\n        </div>\n      </article>", "\"><span>List</span></button>\n        </div>\n      </article>")}`;
    };
    return `<div class="trk-events">
      ${Object.entries(EVENTS).map(([k, e]) => card('evt:' + k, e.name, e.date, e.text)).join('')}
      ${card('decay', localized("Скоро сойдут с орбиты", "Re-entering soon"), 'CelesTrak', localized("Объекты, которые по прогнозу войдут в атмосферу в ближайшие недели: низкий перигей и высокая скорость убывания периода.", "Objects predicted to re-enter the atmosphere in the coming weeks: low perigee and rapidly decreasing orbital period."))}
      ${card('gpz', localized("Зона защиты геостационара", "Geostationary protected zone"), 'IADC', localized("Объекты в кольце ГСО ±200 км и наклонении до 15°: действующие спутники, «кладбище» над ГСО и брошенные аппараты.", "Objects within GEO ±200 km and inclinations up to 15°: active satellites, the graveyard above GEO and abandoned spacecraft."))}
      ${card('starlink', 'Starlink', 'SpaceX', localized("Крупнейшая группировка: больше половины всех действующих спутников. Её оболочки 340–570 км хорошо видны на гистограмме высот.", "The largest constellation: more than half of all active satellites. Its shells at 340–570 km are visible in the altitude histogram."))}
    </div>`;
  }

  function showEvent(tag: string) {
    if (st.eventShown === tag) { st.eventShown = ''; st.tag = ''; st.isolate = false; deps.layer.setOrbitSet([], deps.getDate()); }
    else {
      st.eventShown = tag; st.tag = tag; st.isolate = true;
      const objs = deps.getCatalog().objects.filter((o) => o.tags.includes(tag));
      deps.layer.setOrbitSet(objs, deps.getDate(), tag.startsWith('evt:') ? '#ff6b2c' : '#58c4ff');
      deps.setLayerVisible(true);
      deps.flyToEarth();
    }
    applyFilters();
    if (st.tab === 'events') renderTab();
  }

  // ---------------- ОБЪЕКТ ----------------
  function objectHtml() {
    const o = deps.getTracked();
    if (!o) return localized("<div class=\"trk-empty\"><p>Объект не выбран.</p><p class=\"ui-micro\">Кликните по точке у Земли, найдите объект во вкладке «Каталог» или в поиске (клавиша /).</p></div>", "<div class=\"trk-empty\"><p>No object selected.</p><p class=\"ui-micro\">Click a point near Earth, find an object in the Catalog tab or use search (press /).</p></div>");
    const m = modelFor(o);
    const ap = st.approaches?.forNorad === o.norad ? st.approaches : null;
    const ageDays = (deps.getDate().getTime() - o.epochMs) / 86400e3;
    return `
      <div class="trk-obj-h">
        <div><span class="ui-micro">NORAD ${o.norad} · ${esc(o.cospar || '—')}</span><strong>${esc(o.name)}</strong>
          <span class="tags"><i style="background:${CLASS_COLORS[o.cls]}"></i>${CLASS_NAMES[o.cls]}${o.tags.filter((t) => TAG_NAMES[t]).map((t) => ` · ${TAG_NAMES[t]}`).join('')}${localized("</span></div>\n      </div>\n      <table class=\"ui-table trk-live\" id=\"trk-live\"></table>\n      <div class=\"trk-sec-h\"><span class=\"ui-micro\">Наземный трек · ±1,5 витка</span><span class=\"ui-micro\" id=\"trk-ll\"></span></div>\n      <canvas id=\"trk-map\" height=\"190\"></canvas>\n      <table class=\"ui-table\">\n        <tr><td>Перигей / апогей</td><td class=\"n\">", "</span></div>\n      </div>\n      <table class=\"ui-table trk-live\" id=\"trk-live\"></table>\n      <div class=\"trk-sec-h\"><span class=\"ui-micro\">Ground track · ±1.5 orbits</span><span class=\"ui-micro\" id=\"trk-ll\"></span></div>\n      <canvas id=\"trk-map\" height=\"190\"></canvas>\n      <table class=\"ui-table\">\n        <tr><td>Perigee / apogee</td><td class=\"n\">")}${nf(o.perigeeKm)} / ${nf(o.apogeeKm)}${localized(" км</td></tr>\n        <tr><td>Наклонение / эксцентриситет</td><td class=\"n\">", " km</td></tr>\n        <tr><td>Inclination / eccentricity</td><td class=\"n\">")}${nf(o.incl, 2)}° / ${o.ecc.toFixed(5)}${localized("</td></tr>\n        <tr><td>Период</td><td class=\"n\">", "</td></tr>\n        <tr><td>Period</td><td class=\"n\">")}${nf(o.periodMin, 2)}${localized(" мин · ", " min · ")}${nf(o.nRevDay, 3)}${localized(" об/сут</td></tr>\n        <tr><td>BSTAR (торможение)</td><td class=\"n\">", " rev/day</td></tr>\n        <tr><td>BSTAR (drag)</td><td class=\"n\">")}${o.bstar.toExponential(3)}${localized("</td></tr>\n        <tr><td>Эпоха элементов</td><td class=\"n ", "</td></tr>\n        <tr><td>Element epoch</td><td class=\"n ")}${ageDays > 7 ? 'warn' : ''}">${utc(o.epochMs).slice(0, 16)} · ${nf(Math.abs(ageDays), 1)}${localized(" сут</td></tr>\n        <tr><td>3D-модель</td><td class=\"n\">", " days</td></tr>\n        <tr><td>3D model</td><td class=\"n\">")}${m.generic ? localized("<span class=\"warn\">условная</span>", "<span class=\"warn\">illustrative</span>") : m.typical ? localized("типовая для серии", "representative of the series") : localized("реальная", "actual")}</td></tr>
      </table>
      ${o.tags.includes('decay') || o.perigeeKm < 220 ? `${localized("<div class=\"trk-alert\">Низкий перигей (", "<div class=\"trk-alert\">Low perigee (")}${nf(o.perigeeKm)}${localized(" км): объект тормозится атмосферой и в ближайшее время войдёт в неё.</div>", " km): atmospheric drag is slowing the object, which will re-enter soon.</div>")}` : ''}${localized("\n      <div class=\"trk-sec-h\"><span class=\"ui-micro\">Скрининг сближений · 24 ч · порог 50 км</span>\n        <button class=\"ui-btn sm ", "\n      <div class=\"trk-sec-h\"><span class=\"ui-micro\">Conjunction screening · 24 h · 50 km threshold</span>\n        <button class=\"ui-btn sm ")}${st.screening ? 'is-on' : ''}" data-act="screen" ${st.screening ? 'disabled' : ''}>${I_TARGET}<span>${st.screening ? localized("Идёт расчёт…", "Calculating…") : ap ? localized("Пересчитать", "Recalculate") : localized("Запустить", "Run")}</span></button></div>
      <div id="trk-conj">${ap ? conjTable(ap) : localized("<p class=\"trk-note\">Перебор всех объектов в пересекающейся высотной оболочке с шагом 20 с, уточнение минимума и проверка лучших кандидатов полным SGP4.</p>", "<p class=\"trk-note\">Searches all objects in an overlapping altitude shell at 20 s steps, refines the minimum and verifies the best candidates with full SGP4.</p>")}</div>`;
  }

  function conjTable(ap: NonNullable<typeof st.approaches>) {
    const extra = `${ap.docked ? `${localized(" · исключено пристыкованных: ", " · docked objects excluded: ")}${ap.docked}` : ''}${ap.rejected ? `${localized(" · не подтверждено SGP4: ", " · not confirmed by SGP4: ")}${ap.rejected}` : ''}`;
    if (!ap.list.length) return `${localized("<p class=\"trk-note\">Проверено ", "<p class=\"trk-note\">Checked ")}${nf(ap.screened)}${localized(" объектов", " objects")}${extra}${localized(": сближений ближе 50 км за 24 ч не найдено.</p>", ": no conjunctions closer than 50 km found within 24 h.</p>")}`;
    return `${localized("<p class=\"trk-note\">Проверено ", "<p class=\"trk-note\">Checked ")}${nf(ap.screened)}${localized(" объектов · ", " objects · ")}${utc(ap.at).slice(0, 16)}${extra}${localized("</p>\n      <table class=\"ui-table trk-conj\"><tr><th>Объект</th><th>TCA, UTC</th><th class=\"n\">Пролёт</th><th class=\"n\">V отн.</th></tr>\n      ", "</p>\n      <table class=\"ui-table trk-conj\"><tr><th>Object</th><th>TCA, UTC</th><th class=\"n\">Miss distance</th><th class=\"n\">Rel. V</th></tr>\n      ")}${ap.list.slice(0, 15).map((a) => `<tr data-norad="${a.o.norad}" class="click"><td><i style="background:${CLASS_COLORS[a.o.cls]}"></i>${esc(a.o.name)}</td>
        <td class="ui-num">${utc(a.tcaMs).slice(5, 16)}</td><td class="n ${(a.sgpKm ?? a.missKm) < 5 ? 'warn' : ''}">${nf(a.sgpKm ?? a.missKm, 1)}${localized(" км</td><td class=\"n\">", " km</td><td class=\"n\">")}${nf(a.relKmS, 1)}${localized(" км/с</td></tr>", " km/s</td></tr>")}`).join('')}</table>`;
  }

  async function runScreening() {
    const o = deps.getTracked();
    if (!o || st.screening) return;
    st.screening = true; renderTab();
    const start = deps.getDate();
    const all = deps.getCatalog().objects;   // тот же массив, по которому шёл перебор (обновление каталога не сдвинет индексы)
    try {
    const { results, screened } = await screenConjunctions(o, all, start, {
      onProgress: (f, n) => { const b = root.querySelector('[data-act="screen"] span'); if (b) b.textContent = `${Math.round(f * 100)}${localized("% из ", "% of ")}${nf(n)}`; },
    });
    // Уточнение полным SGP4: поиск минимума в окне ±5 мин вокруг TCA модели Кеплер+J2
    // (у объектов с сильным торможением модели расходятся на десятки секунд), затем шаг 0,1 с.
    const sep = (a: OrbitalObject, b: OrbitalObject, t: number) => {
      const d = new Date(t), s1 = sgp4(a, d), s2 = sgp4(b, d);
      return s1 && s2 ? Math.hypot(s1.r[0] - s2.r[0], s1.r[1] - s2.r[1], s1.r[2] - s2.r[2]) : Infinity;
    };
    let docked = 0, rejected = 0;
    const refined = results.slice(0, 40).map((a) => {
      const other = all[a.idx];
      if (!other) return { ...a, o, sgpKm: Infinity };
      let bt = a.tcaMs, bd = Infinity;
      for (let dt = -300; dt <= 300; dt += 4) { const m = sep(o, other, a.tcaMs + dt * 1000); if (m < bd) { bd = m; bt = a.tcaMs + dt * 1000; } }
      const c = bt;
      for (let dt = -4; dt <= 4; dt += 0.1) { const m = sep(o, other, c + dt * 1000); if (m < bd) { bd = m; bt = c + dt * 1000; } }
      // относительная скорость по SGP4
      const d = new Date(bt), s1 = sgp4(o, d), s2 = sgp4(other, d);
      const rel = s1 && s2 ? Math.hypot(s1.v[0] - s2.v[0], s1.v[1] - s2.v[1], s1.v[2] - s2.v[2]) : a.relKmS;
      return { ...a, tcaMs: bt, o: other, sgpKm: bd, relKmS: rel };
    }).filter((a) => {
      if (a.relKmS < 0.05 && (a.sgpKm ?? 0) < 5) { docked++; return false; }   // пристыкованный модуль/корабль
      if ((a.sgpKm ?? Infinity) > 50) { rejected++; return false; }           // SGP4 не подтвердил
      return true;
    }).sort((x, y) => (x.sgpKm ?? x.missKm) - (y.sgpKm ?? y.missKm));
    const list = refined.slice(0, 15);
    st.approaches = { forNorad: o.norad, list, screened, at: Date.now(), docked, rejected };
    } catch (err) { console.warn('screening', err); } finally { st.screening = false; }
    if (st.tab === 'object') renderTab();
  }

  // ---------------- наземный трек ----------------
  let mapImg: HTMLImageElement | null = null;
  let trackCache: { norad: number; t: number; pts: { lat: number; lon: number; t: number }[] } | null = null;
  function drawGroundTrack() {
    const c = root.querySelector<HTMLCanvasElement>('#trk-map');
    const o = deps.getTracked();
    if (!c || !o) return;
    if (!mapImg) { mapImg = new Image(); mapImg.src = 'textures/earth_atmos_2048.jpg'; mapImg.onload = () => drawGroundTrack(); }
    const { g, W, H } = prep(c);
    const date = deps.getDate();
    g.fillStyle = '#06080b'; g.fillRect(0, 0, W, H);
    if (mapImg.complete && mapImg.naturalWidth) { g.globalAlpha = 0.55; g.drawImage(mapImg, 0, 0, W, H); g.globalAlpha = 1; }
    g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 1;
    for (let lon = -150; lon <= 150; lon += 30) { const x = ((lon + 180) / 360) * W; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let lat = -60; lat <= 60; lat += 30) { const y = ((90 - lat) / 180) * H; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    if (!trackCache || trackCache.norad !== o.norad || Math.abs(date.getTime() - trackCache.t) > o.periodMin * 60e3 * 0.25) {
      trackCache = { norad: o.norad, t: date.getTime(), pts: groundTrack(o, date) };
    }
    const X = (lon: number) => ((lon + 180) / 360) * W, Y = (lat: number) => ((90 - lat) / 180) * H;
    const now = date.getTime();
    g.lineWidth = 1.4;
    let prev: { lat: number; lon: number; t: number } | null = null;
    for (const p of trackCache.pts) {
      if (prev && Math.abs(p.lon - prev.lon) < 180) {
        g.strokeStyle = p.t < now ? 'rgba(255,107,44,0.45)' : '#ff6b2c';
        g.beginPath(); g.moveTo(X(prev.lon), Y(prev.lat)); g.lineTo(X(p.lon), Y(p.lat)); g.stroke();
      }
      prev = p;
    }
    const s = sgp4(o, date);
    if (s) {
      const gd = geodetic(s.r, date);
      // круг видимости над горизонтом (угол места 0°)
      const rho = Math.acos(6378 / (6378 + gd.alt)) * 180 / Math.PI;
      g.strokeStyle = 'rgba(88,196,255,0.6)'; g.setLineDash([3, 3]); g.beginPath();
      let prevL = 0;
      for (let k = 0; k <= 72; k++) {
        const az = (k / 72) * 2 * Math.PI, la1 = gd.lat * Math.PI / 180, d = rho * Math.PI / 180;
        const lat = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(az));
        const lon = gd.lon * Math.PI / 180 + Math.atan2(Math.sin(az) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(lat));
        const L = ((lon * 180 / Math.PI + 540) % 360) - 180;
        if (k === 0 || Math.abs(L - prevL) > 180) g.moveTo(X(L), Y(lat * 180 / Math.PI)); else g.lineTo(X(L), Y(lat * 180 / Math.PI));
        prevL = L;
      }
      g.stroke(); g.setLineDash([]);
      g.fillStyle = '#fff'; g.strokeStyle = '#ff6b2c'; g.lineWidth = 2;
      g.beginPath(); g.arc(X(gd.lon), Y(gd.lat), 4, 0, Math.PI * 2); g.fill(); g.stroke();
      const ll = root.querySelector('#trk-ll'); if (ll) ll.textContent = `${gd.lat.toFixed(2)}°, ${gd.lon.toFixed(2)}°`;
    }
  }

  function liveRows(o: OrbitalObject) {
    const date = deps.getDate();
    const s = sgp4(o, date);
    if (!s) return localized("<tr><td>Состояние</td><td class=\"n warn\">SGP4: объект сошёл с орбиты по модели</td></tr>", "<tr><td>State</td><td class=\"n warn\">SGP4: object has decayed according to the model</td></tr>");
    const gd = geodetic(s.r, date);
    return `${localized("<tr><td>Высота</td><td class=\"n\">", "<tr><td>Altitude</td><td class=\"n\">")}${nf(gd.alt, 1)}${localized(" км</td></tr>\n      <tr><td>Широта / долгота</td><td class=\"n\">", " km</td></tr>\n      <tr><td>Latitude / longitude</td><td class=\"n\">")}${gd.lat.toFixed(3)}° / ${gd.lon.toFixed(3)}${localized("°</td></tr>\n      <tr><td>Скорость (инерциальная)</td><td class=\"n\">", "°</td></tr>\n      <tr><td>Speed (inertial)</td><td class=\"n\">")}${nf(len(s.v), 3)}${localized(" км/с</td></tr>\n      <tr><td>Дальность от центра Земли</td><td class=\"n\">", " km/s</td></tr>\n      <tr><td>Range from Earth’s center</td><td class=\"n\">")}${nf(len(s.r), 1)}${localized(" км</td></tr>", " km</td></tr>")}`;
  }

  // ---------------- МАЛЫЕ ТЕЛА ----------------
  function smallHtml() {
    const sb = deps.sb;
    if (!sb) return localized("<div class=\"trk-empty\"><p>Каталог малых тел не загружен.</p></div>", "<div class=\"trk-empty\"><p>Small-body catalog not loaded.</p></div>");
    const counts = new Map<SbClass, number>();
    sb.bodies.forEach((b) => counts.set(b.cls, (counts.get(b.cls) ?? 0) + 1));
    return `
      <section class="trk-kpis">
        ${(Object.keys(SB_NAMES) as SbClass[]).filter((c) => counts.get(c)).map((c) => `<button class="kpi ${sb.isClassVisible(c) ? '' : 'off'}" data-sb="${c}"><i style="background:${SB_COLORS[c]}"></i><span class="ui-micro">${SB_NAMES[c]}</span><b class="ui-num">${nf(counts.get(c) ?? 0)}</b></button>`).join('')}
        <button class="kpi ${sb.isClassVisible('nea-orbits') ? '' : 'off'}${localized("\" data-sb=\"nea-orbits\"><i style=\"background:linear-gradient(90deg,#ff6b2c,#73859e)\"></i><span class=\"ui-micro\">Орбиты NEA (форма)</span><b class=\"ui-num\">", "\" data-sb=\"nea-orbits\"><i style=\"background:linear-gradient(90deg,#ff6b2c,#73859e)\"></i><span class=\"ui-micro\">NEA orbit shapes</span><b class=\"ui-num\">")}${nf(sb.neaCount)}</b></button>
      </section>
      <p class="trk-note">${nf(sb.bodies.length)}${localized(" тел с полными оскулирующими элементами (MPC/JPL через Stellarium) — положение считается по Кеплеру на текущую дату. ", " bodies with complete osculating elements (MPC/JPL via Stellarium) — positions computed with Kepler’s equations for the current date. ")}${nf(sb.neaCount)}${localized(" орбит околоземных астероидов показаны формой: цвет — минимальное расстояние пересечения орбит с Землёй (MOID), оранжевые ближе 0,05 а.е.</p>\n      <input class=\"ui-input\" id=\"trk-sbq\" placeholder=\"Поиск: Bennu, Apophis, Halley, 2I/Borisov…\" autocomplete=\"off\">\n      <div class=\"trk-sblist\" id=\"trk-sblist\">", " near-Earth asteroid orbit shapes: color indicates minimum orbit intersection distance with Earth (MOID); orange orbits are closer than 0.05 AU.</p>\n      <input class=\"ui-input\" id=\"trk-sbq\" placeholder=\"Search: Bennu, Apophis, Halley, 2I/Borisov…\" autocomplete=\"off\">\n      <div class=\"trk-sblist\" id=\"trk-sblist\">")}${sbRows('')}</div>`;
  }
  function sbRows(q: string) {
    const sb = deps.sb!;
    const ql = q.toLowerCase();
    return sb.bodies.filter((b) => !ql || b.name.toLowerCase().includes(ql)).slice(0, 200).map((b) => `
      <button class="trk-sbrow" data-sbi="${b.idx}"><i style="background:${SB_COLORS[b.cls]}"></i><span class="nm">${esc(b.name)}</span>
      <span class="ui-num r">${b.e < 1 ? nf(b.a, 2) + localized(" а.е.", " AU") : 'e ' + b.e.toFixed(3)}</span><span class="ui-micro">${SB_NAMES[b.cls]}</span>${b.model ? '<span class="ui-micro mdl">3D</span>' : ''}</button>`).join('');
  }

  // ---------------- события UI ----------------
  root.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    const btn = t.closest<HTMLElement>('button, tr.click');
    if (!btn) return;
    if (btn.dataset.act === 'close') return ctl.close();
    if (btn.dataset.act === 'refresh') return refresh(btn as HTMLButtonElement);
    if (btn.dataset.act === 'screen') return void runScreening();
    if (btn.dataset.tab) { st.tab = btn.dataset.tab as Tab; return renderTab(); }
    if (btn.dataset.cls !== undefined) { const i = +btn.dataset.cls; st.cls[i] = !st.cls[i]; applyFilters(); return renderTab(); }
    if (btn.dataset.reg) { const r = btn.dataset.reg; st.regime.has(r) ? st.regime.delete(r) : st.regime.add(r); applyFilters(); return renderTab(); }
    if (btn.dataset.sort) { st.sort = btn.dataset.sort as typeof st.sort; renderTab(); return; }
    if (btn.dataset.show) return showEvent(btn.dataset.show);
    if (btn.dataset.list) { st.tag = btn.dataset.list; st.q = ''; st.tab = 'catalog'; applyFilters(); return renderTab(); }
    if (btn.dataset.norad) return deps.track(+btn.dataset.norad);
    if (btn.dataset.sb && deps.sb) { const c = btn.dataset.sb as SbClass | 'nea-orbits'; deps.sb.setClassVisible(c, !deps.sb.isClassVisible(c)); return renderTab(); }
    if (btn.dataset.sbi && deps.sb) return deps.trackSmallBody(deps.sb.bodies[+btn.dataset.sbi]);
  });
  root.addEventListener('input', (ev) => {
    const t = ev.target as HTMLInputElement;
    if (t.id === 'trk-q') { st.q = t.value.trim(); applyFilters(); }
    if (t.id === 'trk-sbq') root.querySelector('#trk-sblist')!.innerHTML = sbRows(t.value.trim());
  });
  root.addEventListener('change', (ev) => {
    const t = ev.target as HTMLInputElement;
    if (t.id === 'trk-tag') { st.tag = t.value; applyFilters(); }
    if (t.id === 'trk-iso') { st.isolate = t.checked; applyFilters(); }
  });
  root.addEventListener('scroll', (ev) => { if ((ev.target as HTMLElement).id === 'trk-list') paintRows(); }, true);

  async function refresh(btn: HTMLButtonElement) {
    btn.disabled = true;
    const label = btn.querySelector('span')!;
    try {
      const cat = await loadLiveCatalog((d, n) => (label.textContent = `${d}/${n}`));
      clearSatrecs();
      deps.setCatalog(cat);
      applyFilters();
      frame();
    } catch {
      label.textContent = localized("Не удалось", "Failed");
      setTimeout(() => { label.textContent = localized("Обновить", "Refresh"); btn.disabled = false; }, 2500);
    }
  }

  // живое обновление вкладки «Объект»
  setInterval(() => {
    if (root.classList.contains('hidden') || st.tab !== 'object') return;
    const o = deps.getTracked();
    const live = root.querySelector('#trk-live');
    if (o && live) { live.innerHTML = liveRows(o); drawGroundTrack(); }
  }, 500);

  addEventListener('resize', () => { if (!root.classList.contains('hidden') && st.tab === 'overview') drawOverviewCharts(); });

  const ctl: TrackerController = {
    open(tab) {
      if (tab) st.tab = tab;
      root.classList.remove('hidden');
      document.body.dataset.tracker = '1';
      document.getElementById('tracker-btn')?.classList.add('on');
      deps.setLayerVisible(true);
      frame();
    },
    close() {
      root.classList.add('hidden');
      document.body.dataset.tracker = '0';
      document.getElementById('tracker-btn')?.classList.remove('on');
    },
    toggle() { root.classList.contains('hidden') ? ctl.open() : ctl.close(); },
    onTracked(o) {
      if (o && st.approaches && st.approaches.forNorad !== o.norad) st.approaches = null;
      if (!root.classList.contains('hidden')) {
        if (st.tab === 'object' || st.tab === 'catalog') renderTab();
      }
    },
    search(q) {
      const ql = q.trim().toLowerCase();
      if (ql.length < 2) return [];
      const out: { label: string; sub: string; kind: string; go: () => void }[] = [];
      for (const o of deps.getCatalog().objects) {
        if (o.name.toLowerCase().includes(ql) || String(o.norad) === ql) {
          out.push({ label: o.name, sub: `NORAD ${o.norad} · ${CLASS_NAMES[o.cls]} · ${nf(o.perigeeKm)}–${nf(o.apogeeKm)}${localized(" км", " km")}`, kind: localized("Орбита Земли", "Earth orbit"), go: () => deps.track(o.norad) });
          if (out.length >= 12) break;
        }
      }
      if (deps.sb) for (const b of deps.sb.bodies) {
        if (b.name.toLowerCase().includes(ql)) { out.push({ label: b.name, sub: SB_NAMES[b.cls], kind: localized("Малое тело", "Small body"), go: () => deps.trackSmallBody(b) }); if (out.length >= 20) break; }
      }
      for (const [k, e] of Object.entries(EVENTS)) if (e.name.toLowerCase().includes(ql) || localized("мусор обломки debris", "debris fragments").includes(ql)) out.push({ label: `${localized("Облако обломков ", "Debris cloud ")}${e.name}`, sub: e.date, kind: localized("Событие", "Event"), go: () => { ctl.open('events'); if (st.eventShown !== 'evt:' + k) showEvent('evt:' + k); } });
      return out;
    },
    infoHtml(o) {
      const m = modelFor(o);
      const danger = isLaunchDangerous(o);
      const lv = dangerLevel(o);
      const lvLabel = ['', localized("Низкий", "Low"), localized("Средний", "Medium"), localized("Критический", "Critical")][lv];
      const lvColor = ['', '#ffa040', '#ff6020', '#ff1a1a'][lv];
      const dangerBlock = danger ? `
        <div class="trk-danger-alert" style="border-color:${lvColor}">
          <span class="dot-danger${lv === 3 ? ' crit' : lv === 2 ? ' med' : ' low'}"></span>
          <div>
            <b style="color:${lvColor}${localized("\">⚠ Опасен для запуска · уровень: ", "\">⚠ Launch hazard · level: ")}${lvLabel}</b>
            <p>${dangerText(o)}</p>
          </div>
        </div>` : '';
      return `<div class="trk-info">
        <span class="ui-micro">NORAD ${o.norad} · ${esc(o.cospar)} · ${o.regime}</span>
        <div class="tags"><i style="background:${CLASS_COLORS[o.cls]}"></i>${CLASS_NAMES[o.cls]}${o.tags.filter((t) => TAG_NAMES[t]).slice(0, 3).map((t) => ` · ${TAG_NAMES[t]}`).join('')}</div>
        ${dangerBlock}
        <table class="ui-table" id="trk-info-live">${liveRows(o)}${localized("</table>\n        <table class=\"ui-table\">\n          <tr><td>Перигей / апогей</td><td class=\"n\">", "</table>\n        <table class=\"ui-table\">\n          <tr><td>Perigee / apogee</td><td class=\"n\">")}${nf(o.perigeeKm)} / ${nf(o.apogeeKm)}${localized(" км</td></tr>\n          <tr><td>Наклонение</td><td class=\"n\">", " km</td></tr>\n          <tr><td>Inclination</td><td class=\"n\">")}${nf(o.incl, 2)}${localized("°</td></tr>\n          <tr><td>Период</td><td class=\"n\">", "°</td></tr>\n          <tr><td>Period</td><td class=\"n\">")}${nf(o.periodMin, 1)}${localized(" мин</td></tr>\n          <tr><td>BSTAR (сопр.)</td><td class=\"n\">", " min</td></tr>\n          <tr><td>BSTAR (drag)</td><td class=\"n\">")}${o.bstar.toExponential(3)}${localized("</td></tr>\n          <tr><td>Эпоха TLE</td><td class=\"n\">", "</td></tr>\n          <tr><td>TLE epoch</td><td class=\"n\">")}${utc(o.epochMs).slice(0, 16)}${localized("</td></tr>\n          <tr><td>3D-модель</td><td class=\"n\">", "</td></tr>\n          <tr><td>3D model</td><td class=\"n\">")}${m.generic ? localized("условная", "illustrative") : m.typical ? localized("типовая для серии", "representative of the series") : localized("реальная", "actual")}</td></tr>
        </table>
        <p class="trk-note">${m.generic ? m.note[0].toUpperCase() + m.note.slice(1) + '. ' : ''}${localized("Модель увеличена для видимости; положение — SGP4 по элементам GP.</p>\n        <div class=\"trk-ev-act\"><button class=\"ui-btn primary\" data-trk-open=\"object\">Сопровождение и сближения</button></div>\n      </div>", "Model enlarged for visibility; position calculated by SGP4 from GP elements.</p>\n        <div class=\"trk-ev-act\"><button class=\"ui-btn primary\" data-trk-open=\"object\">Tracking and conjunctions</button></div>\n      </div>")}`;
    },
    updateInfo(o) { const el = document.getElementById('trk-info-live'); if (el) el.innerHTML = liveRows(o); },
  };

  document.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-trk-open]');
    if (b) ctl.open(b.dataset.trkOpen as Tab);
  });

  applyFilters();
  return ctl;
}

// ---------------- canvas helpers ----------------
function mono() { return getComputedStyle(document.documentElement).getPropertyValue('--f-mono') || 'monospace'; }
function prep(c: HTMLCanvasElement) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const W = c.clientWidth || c.parentElement!.clientWidth, H = +c.getAttribute('height')!;
  c.width = W * dpr; c.height = H * dpr; c.style.height = H + 'px';
  const g = c.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  return { g, W, H };
}
function axes(g: CanvasRenderingContext2D, L: number, T: number, pw: number, ph: number, _B: number) {
  g.strokeStyle = '#29313b'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(L + 0.5, T); g.lineTo(L + 0.5, T + ph + 0.5); g.lineTo(L + pw, T + ph + 0.5); g.stroke();
}
