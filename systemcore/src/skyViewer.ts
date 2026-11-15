import { localized } from './i18n';
// «Небо SPHEREx»: настоящие изображения всего неба SPHEREx (QR2, NASA/IPAC IRSA → HiPS CDS)
// и сравнение эпох: как небо выглядело в обзорах DSS2 / 2MASS / AllWISE и как его видит SPHEREx.
// Это прямой ответ на задачу челленджа: показать снимки SPHEREx и то, как небо меняется со временем
// (собственное движение близких звёзд, переменность, ИК против видимого света).
// Просмотрщик — Aladin Lite v3 (CDS, GPL-3.0), загружается с CDN при первом открытии.
import './skyViewer.css';

type AladinT = {
  setBaseImageLayer(l: unknown): void;
  setOverlayImageLayer(l: unknown, name?: string): unknown;
  removeImageLayer?(name: string): void;
  gotoRaDec(ra: number, dec: number): void;
  gotoObject(name: string, cb?: { success?: (rd: [number, number]) => void; error?: () => void }): void;
  setFoV(deg: number): void;
  getRaDec(): [number, number];
  getFov(): [number, number];
  on(ev: string, cb: (...a: unknown[]) => void): void;
  newImageSurvey?(id: string): unknown;
};
type ALib = { init: Promise<void>; aladin(sel: string | HTMLElement, opts: object): AladinT; imageHiPS?(idOrUrl: string, opts?: object): unknown };

const ALADIN_JS = 'https://aladin.cds.unistra.fr/AladinLite/api/v3/latest/aladin.js';

interface Layer { id: string; label: string; src: string; epoch: string; yr: number; band: string }
// SPHEREx QR2 по детекторам (HiPS построены CDS из данных IRSA; t = MJD 60789–61165, май 2025 – май 2026)
const SPX: Layer[] = [
  { id: 'spx-color', label: localized("SPHEREx · цвет (D1–D6)", "SPHEREx · color (D1–D6)"), src: 'https://alasky.cds.unistra.fr/SPHEREx/color', epoch: '2025–2026', yr: 2025.9, band: localized("0,75–5,0 мкм", "0.75–5.0 μm") },
  { id: 'spx-d1', label: 'SPHEREx · D1', src: 'https://alasky.cds.unistra.fr/SPHEREx/D1', epoch: '2025–2026', yr: 2025.9, band: localized("0,75–1,1 мкм", "0.75–1.1 μm") },
  { id: 'spx-d2', label: 'SPHEREx · D2', src: 'https://alasky.cds.unistra.fr/SPHEREx/D2', epoch: '2025–2026', yr: 2025.9, band: localized("1,1–1,6 мкм", "1.1–1.6 μm") },
  { id: 'spx-d3', label: 'SPHEREx · D3', src: 'https://alasky.cds.unistra.fr/SPHEREx/D3', epoch: '2025–2026', yr: 2025.9, band: localized("1,6–2,4 мкм", "1.6–2.4 μm") },
  { id: 'spx-d4', label: 'SPHEREx · D4', src: 'https://alasky.cds.unistra.fr/SPHEREx/D4', epoch: '2025–2026', yr: 2025.9, band: localized("2,4–3,8 мкм", "2.4–3.8 μm") },
  { id: 'spx-d5', label: 'SPHEREx · D5', src: 'https://alasky.cds.unistra.fr/SPHEREx/D5', epoch: '2025–2026', yr: 2025.9, band: localized("3,8–4,4 мкм", "3.8–4.4 μm") },
  { id: 'spx-d6', label: 'SPHEREx · D6', src: 'https://alasky.cds.unistra.fr/SPHEREx/D6', epoch: '2025–2026', yr: 2025.9, band: localized("4,4–5,0 мкм", "4.4–5.0 μm") },
];
// Обзоры прошлого для сравнения (эпохи — годы наблюдений обзора)
const PAST: Layer[] = [
  { id: 'dss2', label: localized("DSS2 · видимый свет", "DSS2 · visible light"), src: 'CDS/P/DSS2/color', epoch: '≈1980–1999', yr: 1990, band: localized("0,4–0,9 мкм", "0.4–0.9 μm") },
  { id: '2mass', label: localized("2MASS · ближний ИК", "2MASS · near infrared"), src: 'CDS/P/2MASS/color', epoch: '1997–2001', yr: 1999, band: localized("1,2–2,2 мкм", "1.2–2.2 μm") },
  { id: 'wise', label: localized("AllWISE · средний ИК", "AllWISE · mid-infrared"), src: 'CDS/P/allWISE/color', epoch: '2010–2011', yr: 2010.5, band: localized("3,4–22 мкм", "3.4–22 μm") },
];

interface Target { name: string; ra: number; dec: number; fov: number; pm?: number; note: string }
// Координаты J2000; pm — полное собственное движение, ″/год (≈, по каталогу Hipparcos/Gaia)
const TARGETS: Target[] = [
  { name: localized("Звезда Барнарда", "Barnard’s Star"), ra: 269.4521, dec: 4.6934, fov: 0.22, pm: 10.39, note: localized("Самое быстрое собственное движение на небе: звезда уходит на север. Сравните с 2MASS — за четверть века она «переехала» почти на 5′.", "The fastest proper motion in the sky: the star moves northward. Compare with 2MASS — it has moved almost 5′ in a quarter-century.") },
  { name: localized("Звезда Каптейна", "Kapteyn’s Star"), ra: 77.919, dec: -45.0185, fov: 0.2, pm: 8.6, note: localized("Звезда гало, летит почти навстречу вращению Галактики.", "A halo star moving almost against the Galaxy’s rotation.") },
  { name: localized("Грумбридж 1830", "Groombridge 1830"), ra: 178.2448, dec: 37.7186, fov: 0.2, pm: 7.06, note: localized("Третье по скорости собственное движение среди ярких звёзд.", "The third-fastest proper motion among bright stars.") },
  { name: localized("61 Лебедя", "61 Cygni"), ra: 316.7247, dec: 38.7494, fov: 0.2, pm: 5.28, note: localized("Первая звезда с измеренным параллаксом (Бессель, 1838). Видна пара A+B.", "The first star with a measured parallax (Bessel, 1838). The A+B pair is visible.") },
  { name: localized("Проксима Центавра", "Proxima Centauri"), ra: 217.4289, dec: -62.6795, fov: 0.15, pm: 3.85, note: localized("Ближайшая к Солнцу звезда.", "The closest star to the Sun.") },
  { name: localized("Туманность Ориона", "Orion Nebula"), ra: 83.8221, dec: -5.3911, fov: 1.2, note: localized("В ИК пыль прозрачнее: SPHEREx видит молодые звёзды, скрытые в видимом свете (DSS2).", "Dust is more transparent in infrared: SPHEREx sees young stars hidden in visible light (DSS2).") },
  { name: localized("Центр Галактики", "Galactic Center"), ra: 266.4168, dec: -29.0078, fov: 3, note: localized("Сквозь пылевые облака к Sgr A*: сравните видимый DSS2 и ИК SPHEREx.", "Through dust clouds toward Sgr A*: compare visible DSS2 and infrared SPHEREx.") },
  { name: localized("Глубокое поле NEP", "NEP deep field"), ra: 270.0, dec: 66.5607, fov: 4, note: localized("Северный полюс эклиптики: SPHEREx снимает его на каждом витке — самое глубокое поле миссии.", "North ecliptic pole: SPHEREx images it on every orbit, the mission’s deepest field.") },
  { name: localized("Туманность Андромеды", "Andromeda Galaxy"), ra: 10.6847, dec: 41.269, fov: 3, note: localized("Звёздное население M31 в ближнем ИК.", "M31’s stellar population in near infrared.") },
];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

let libPromise: Promise<ALib> | null = null;
function loadAladin(): Promise<ALib> {
  if (!libPromise) libPromise = new Promise((res, rej) => {
    const w = window as unknown as { A?: ALib };
    if (w.A) return void w.A.init.then(() => res(w.A!));
    const s = document.createElement('script');
    s.src = ALADIN_JS; s.charset = 'utf-8'; s.async = true;
    s.onload = () => (w.A ? w.A.init.then(() => res(w.A!), rej) : rej(new Error(localized("Aladin Lite не загрузился", "Aladin Lite failed to load"))));
    s.onerror = () => { libPromise = null; rej(new Error(localized("нет доступа к aladin.cds.unistra.fr", "cannot access aladin.cds.unistra.fr"))); };
    document.head.appendChild(s);
  });
  return libPromise;
}

export interface SkyViewer { open(): void; close(): void; toggle(): void }

export function initSkyViewer(): SkyViewer {
  const root = document.createElement('section');
  root.id = 'skyview';
  root.className = 'hidden';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', localized("Небо SPHEREx: снимки и сравнение эпох", "SPHEREx sky: images and epoch comparison"));
  document.body.appendChild(root);

  const st = { base: SPX[0], cmp: PAST[1], mode: 'swipe' as 'swipe' | 'blink' | 'single', mix: 0.5, target: TARGETS[0] as Target | null, blinkOn: false };
  let aladin: AladinT | null = null, lib: ALib | null = null, blinkTimer = 0, cmpLayer: { setOpacity?(o: number): void; setAlpha?(o: number): void } | null = null;

  root.innerHTML = `${localized("\n    <header class=\"sv-head\">\n      <div><span class=\"ui-micro\">NASA/IPAC IRSA · SPHEREx QR2 · HiPS CDS</span><strong>Небо SPHEREx — как оно меняется со временем</strong></div>\n      <button class=\"sv-x\" data-act=\"close\" aria-label=\"Закрыть\"><svg viewBox=\"0 0 16 16\"><path d=\"M3 3l10 10M13 3L3 13\"/></svg></button>\n    </header>\n    <div class=\"sv-main\">\n      <aside class=\"sv-side\">\n        <div class=\"ui-micro\">Снимок SPHEREx (2025–2026)</div>\n        <div class=\"sv-grid\" id=\"sv-base\">", "\n    <header class=\"sv-head\">\n      <div><span class=\"ui-micro\">NASA/IPAC IRSA · SPHEREx QR2 · HiPS CDS</span><strong>SPHEREx sky — how it changes over time</strong></div>\n      <button class=\"sv-x\" data-act=\"close\" aria-label=\"Close\"><svg viewBox=\"0 0 16 16\"><path d=\"M3 3l10 10M13 3L3 13\"/></svg></button>\n    </header>\n    <div class=\"sv-main\">\n      <aside class=\"sv-side\">\n        <div class=\"ui-micro\">SPHEREx image (2025–2026)</div>\n        <div class=\"sv-grid\" id=\"sv-base\">")}${SPX.map((l) => `<button data-base="${l.id}" class="${l.id === st.base.id ? 'on' : ''}" title="${l.band}">${l.label.replace('SPHEREx · ', '')}<small>${l.band}</small></button>`).join('')}${localized("</div>\n        <div class=\"ui-micro\">Сравнить с прошлым</div>\n        <div class=\"sv-grid sv-grid1\" id=\"sv-cmp\">", "</div>\n        <div class=\"ui-micro\">Compare with the past</div>\n        <div class=\"sv-grid sv-grid1\" id=\"sv-cmp\">")}${PAST.map((l) => `<button data-cmp="${l.id}" class="${l.id === st.cmp.id ? 'on' : ''}">${l.label}<small>${l.epoch} · ${l.band}</small></button>`).join('')}${localized("</div>\n        <div class=\"ui-micro\">Режим</div>\n        <div class=\"sv-modes\">\n          <button data-mode=\"swipe\" class=\"on\">Наложение</button><button data-mode=\"blink\">Мерцание</button><button data-mode=\"single\">Только SPHEREx</button>\n        </div>\n        <label class=\"sv-slider\" id=\"sv-mixrow\"><span class=\"ui-micro\">Прошлое</span><input type=\"range\" id=\"sv-mix\" min=\"0\" max=\"100\" value=\"50\"><span class=\"ui-micro\">SPHEREx</span></label>\n        <div class=\"ui-micro\">Цели</div>\n        <div class=\"sv-targets\">", "</div>\n        <div class=\"ui-micro\">Mode</div>\n        <div class=\"sv-modes\">\n          <button data-mode=\"swipe\" class=\"on\">Overlay</button><button data-mode=\"blink\">Blink</button><button data-mode=\"single\">SPHEREx only</button>\n        </div>\n        <label class=\"sv-slider\" id=\"sv-mixrow\"><span class=\"ui-micro\">Past</span><input type=\"range\" id=\"sv-mix\" min=\"0\" max=\"100\" value=\"50\"><span class=\"ui-micro\">SPHEREx</span></label>\n        <div class=\"ui-micro\">Objectives</div>\n        <div class=\"sv-targets\">")}${TARGETS.map((t, i) => `<button data-t="${i}" class="${i === 0 ? 'on' : ''}">${esc(t.name)}${t.pm ? `<small>μ ≈ ${t.pm.toFixed(2).replace('.', ',')}${localized("″/год</small>", "″/year</small>")}` : ''}</button>`).join('')}${localized("</div>\n        <form class=\"sv-goto\" id=\"sv-goto\"><input class=\"ui-input\" id=\"sv-q\" placeholder=\"Объект или RA Dec (напр. M51, 83.82 -5.39)\" autocomplete=\"off\"><button class=\"ui-btn\" type=\"submit\">Найти</button></form>\n      </aside>\n      <div class=\"sv-view\">\n        <div id=\"sv-aladin\"></div>\n        <div class=\"sv-badge\" id=\"sv-badge\"></div>\n        <div class=\"sv-msg hidden\" id=\"sv-msg\"></div>\n      </div>\n    </div>\n    <footer class=\"sv-foot\" id=\"sv-foot\"></footer>", "</div>\n        <form class=\"sv-goto\" id=\"sv-goto\"><input class=\"ui-input\" id=\"sv-q\" placeholder=\"Object or RA Dec (e.g. M51, 83.82 -5.39)\" autocomplete=\"off\"><button class=\"ui-btn\" type=\"submit\">Find</button></form>\n      </aside>\n      <div class=\"sv-view\">\n        <div id=\"sv-aladin\"></div>\n        <div class=\"sv-badge\" id=\"sv-badge\"></div>\n        <div class=\"sv-msg hidden\" id=\"sv-msg\"></div>\n      </div>\n    </div>\n    <footer class=\"sv-foot\" id=\"sv-foot\"></footer>")}`;

  const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;

  const mk = (l: Layer) => (lib!.imageHiPS ? lib!.imageHiPS(l.src) : aladin!.newImageSurvey?.(l.src) ?? l.src);

  function applyLayers() {
    if (!aladin || !lib) return;
    aladin.setBaseImageLayer(mk(st.base));
    // Слой сравнения поверх снимка SPHEREx; прозрачность — ползунком или мерцанием
    try { aladin.removeImageLayer?.('past'); } catch { /* слоя ещё нет */ }
    cmpLayer = null;
    if (st.mode !== 'single') {
      const l = mk(st.cmp) as typeof cmpLayer;
      aladin.setOverlayImageLayer(l, 'past');
      cmpLayer = l;
    }
    applyMix();
    renderInfo();
  }
  function setOpacity(o: number) { if (cmpLayer) (cmpLayer.setOpacity ?? cmpLayer.setAlpha)?.call(cmpLayer, o); }
  function applyMix() {
    clearInterval(blinkTimer);
    if (st.mode === 'swipe') setOpacity(1 - st.mix);
    else if (st.mode === 'blink') {
      blinkTimer = window.setInterval(() => { st.blinkOn = !st.blinkOn; setOpacity(st.blinkOn ? 1 : 0); renderBadge(); }, 900);
    }
    renderBadge();
  }
  function renderBadge() {
    const showPast = st.mode === 'blink' ? st.blinkOn : st.mode === 'swipe' ? st.mix < 0.5 : false;
    const l = showPast ? st.cmp : st.base;
    $('#sv-badge').innerHTML = `<b>${esc(l.label)}</b><span class="ui-num">${l.epoch}</span>`;
    $('#sv-mixrow').style.display = st.mode === 'swipe' ? '' : 'none';
  }
  function renderInfo() {
    const t = st.target;
    const dt = st.base.yr - st.cmp.yr;
    const shift = t?.pm ? t.pm * dt : null;
    $('#sv-foot').innerHTML = `
      <div class="sv-f1">${t ? `<strong>${esc(t.name)}</strong><p>${esc(t.note)}</p>` : localized("<strong>Свободный поиск</strong><p>Перемещайте и масштабируйте карту; слои сравниваются в той же точке неба.</p>", "<strong>Free exploration</strong><p>Pan and zoom the map; layers are compared at the same sky position.</p>")}${localized("</div>\n      <table class=\"ui-table sv-f2\">\n        <tr><td>Разница эпох</td><td class=\"n\">≈ ", "</div>\n      <table class=\"ui-table sv-f2\">\n        <tr><td>Epoch difference</td><td class=\"n\">≈ ")}${dt.toFixed(0)}${localized(" лет (", " years (")}${st.cmp.epoch} → ${st.base.epoch})</td></tr>
        ${shift != null ? `${localized("<tr><td>Ожидаемое смещение звезды</td><td class=\"n\">≈ ", "<tr><td>Expected stellar displacement</td><td class=\"n\">≈ ")}${shift.toFixed(0)}″ = ${(shift / 60).toFixed(1).replace('.', ',')}′ ≈ ${(shift / 6.2).toFixed(0)}${localized(" пикс. SPHEREx</td></tr>", " SPHEREx pixels</td></tr>")}` : ''}${localized("\n        <tr><td>Пиксель SPHEREx</td><td class=\"n\">6,2″ · 102 канала 0,75–5,0 мкм</td></tr>\n        <tr><td>Центр поля</td><td class=\"n\" id=\"sv-coo\">—</td></tr>\n      </table>\n      <div class=\"sv-f3\">\n        <a class=\"ui-btn\" href=\"https://irsa.ipac.caltech.edu/Missions/spherex.html\" target=\"_blank\" rel=\"noopener\">Исходные FITS · IRSA</a>\n        <span class=\"ui-micro\">Снимки: NASA/JPL-Caltech/IPAC; HiPS: CDS (Unistra/CNRS); просмотр: Aladin Lite</span>\n      </div>", "\n        <tr><td>SPHEREx pixel</td><td class=\"n\">6.2″ · 102 channels, 0.75–5.0 μm</td></tr>\n        <tr><td>Field center</td><td class=\"n\" id=\"sv-coo\">—</td></tr>\n      </table>\n      <div class=\"sv-f3\">\n        <a class=\"ui-btn\" href=\"https://irsa.ipac.caltech.edu/Missions/spherex.html\" target=\"_blank\" rel=\"noopener\">Original FITS · IRSA</a>\n        <span class=\"ui-micro\">Images: NASA/JPL-Caltech/IPAC; HiPS: CDS (Unistra/CNRS); viewer: Aladin Lite</span>\n      </div>")}`;
    updateCoo();
  }
  function updateCoo() {
    if (!aladin) return;
    const [ra, dec] = aladin.getRaDec(), fov = aladin.getFov()[0];
    const el = root.querySelector('#sv-coo');
    if (el) el.textContent = `RA ${ra.toFixed(4)}° · Dec ${dec >= 0 ? '+' : ''}${dec.toFixed(4)}${localized("° · поле ", "° · field ")}${fov < 1 ? (fov * 60).toFixed(1) + '′' : fov.toFixed(2) + '°'}`;
  }
  function goTarget(t: Target) {
    st.target = t;
    aladin?.gotoRaDec(t.ra, t.dec);
    aladin?.setFoV(t.fov);
    root.querySelectorAll<HTMLButtonElement>('[data-t]').forEach((b) => b.classList.toggle('on', +b.dataset.t! === TARGETS.indexOf(t)));
    renderInfo();
  }

  async function boot() {
    const msg = $('#sv-msg');
    msg.classList.remove('hidden');
    msg.textContent = localized("Загрузка Aladin Lite и тайлов SPHEREx…", "Loading Aladin Lite and SPHEREx tiles…");
    try {
      lib = await loadAladin();
      aladin = lib.aladin('#sv-aladin', {
        fov: st.target!.fov, target: `${st.target!.ra} ${st.target!.dec}`, cooFrame: 'ICRS',
        showReticle: true, showZoomControl: true, showFullscreenControl: false, showLayersControl: false, showGotoControl: false,
        showFrame: false, showCooGridControl: false, showProjectionControl: false, showSettingsControl: false, showShareControl: false,
        showSimbadPointerControl: true, showContextMenu: true, reticleColor: '#ff6b2c', reticleSize: 20,
      });
      aladin.on('positionChanged', updateCoo);
      aladin.on('zoomChanged', updateCoo);
      applyLayers();
      msg.classList.add('hidden');
    } catch (err) {
      msg.innerHTML = `${localized("Не удалось загрузить просмотрщик неба (", "Could not load the sky viewer (")}${esc(String((err as Error).message ?? err))}${localized("). Нужен доступ в интернет к aladin.cds.unistra.fr и alasky.cds.unistra.fr.", "). Internet access to aladin.cds.unistra.fr and alasky.cds.unistra.fr is required.")}`;
    }
  }

  root.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLElement>('button');
    if (!b) return;
    if (b.dataset.act === 'close') return ctl.close();
    if (b.dataset.base) { st.base = SPX.find((l) => l.id === b.dataset.base)!; mark('[data-base]', b); applyLayers(); }
    if (b.dataset.cmp) { st.cmp = PAST.find((l) => l.id === b.dataset.cmp)!; mark('[data-cmp]', b); applyLayers(); }
    if (b.dataset.mode) { st.mode = b.dataset.mode as typeof st.mode; mark('[data-mode]', b); applyLayers(); }
    if (b.dataset.t) goTarget(TARGETS[+b.dataset.t]);
  });
  const mark = (sel: string, on: HTMLElement) => root.querySelectorAll(sel).forEach((x) => x.classList.toggle('on', x === on));
  $<HTMLInputElement>('#sv-mix').addEventListener('input', (ev) => { st.mix = +(ev.target as HTMLInputElement).value / 100; applyMix(); });
  $('#sv-goto').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const q = $<HTMLInputElement>('#sv-q').value.trim();
    if (!q || !aladin) return;
    st.target = null;
    root.querySelectorAll('[data-t]').forEach((x) => x.classList.remove('on'));
    const m = q.match(/^(-?\d+(?:\.\d+)?)[\s,]+([+-]?\d+(?:\.\d+)?)$/);
    if (m) { aladin.gotoRaDec(+m[1], +m[2]); renderInfo(); return; }
    aladin.gotoObject(q, { success: () => renderInfo(), error: () => { $<HTMLInputElement>('#sv-q').value = `${localized("Не найдено: ", "Not found: ")}${q}`; } });
  });
  addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !root.classList.contains('hidden')) ctl.close(); });

  const ctl: SkyViewer = {
    open() {
      root.classList.remove('hidden');
      document.body.dataset.skyview = '1';
      document.getElementById('skyview-btn')?.classList.add('on');
      if (!aladin) boot(); else applyMix();
      renderInfo();
    },
    close() {
      root.classList.add('hidden');
      clearInterval(blinkTimer);
      document.body.dataset.skyview = '0';
      document.getElementById('skyview-btn')?.classList.remove('on');
    },
    toggle() { root.classList.contains('hidden') ? ctl.open() : ctl.close(); },
  };
  renderBadge();
  renderInfo();
  return ctl;
}
