// Интро на главной: надпись SOLAR EXPLORER собирается из «звёзд» неба,
// под ней прорисовывается волосяная линия и подзаголовок. По клику / клавише / колесу
// или через ~7 с бездействия буквы снова рассыпаются в звёзды, и оверлей удаляется.
// Показывается только при первом заходе на главную в этой вкладке.
import './intro.css';

const TITLE = 'SOLAR EXPLORER';
const SUBTITLE = 'ОБСЕРВАТОРИЯ СОЛНЕЧНОЙ СИСТЕМЫ  ·  SPHEREx × PLANET X  ·  ПОЛОЖЕНИЯ НА ТЕКУЩИЙ МОМЕНТ';
const FORM_S = 2.6;     // время сборки букв
const IDLE_S = 7.5;     // после сборки — автоматический уход
const LEAVE_S = 1.5;    // рассыпание
const SEEN_KEY = 'se.introSeen';
const FONT = '"DIN Alternate", "Bahnschrift", "D-DIN", "Barlow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif';

interface P {
  x0: number; y0: number;          // откуда летит (звезда)
  tx: number; ty: number;          // точка в букве
  x: number; y: number;
  vx: number; vy: number;          // скорость при рассыпании
  delay: number; dur: number;
  curve: number;                   // изгиб траектории
  size: number; base: number;      // размер и яркость
  tw: number; ph: number;          // мерцание
  warm: boolean;
  ambient: boolean;                // фоновая звезда (не входит в буквы)
}

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

export function startIntro() {
  const hash = location.hash.replace(/^#\/?/, '');
  const route = hash.split('?')[0].split('/')[0];
  const params = new URLSearchParams(location.hash.split('?')[1] ?? '');
  const holdAt = params.has('introT') ? Number(params.get('introT')) : null; // для скриншотов: заморозить на t секунд
  if (route && route !== 'home') return;
  let seen = false;
  try { seen = sessionStorage.getItem(SEEN_KEY) === '1'; } catch { /* приватный режим */ }
  if (seen && holdAt === null) return;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.createElement('div');
  root.id = 'intro';
  root.innerHTML = `
    <canvas class="in-canvas" aria-hidden="true"></canvas>
    <div class="in-text">
      <h1 class="in-sr">${TITLE}</h1>
      <div class="in-rule"><i></i></div>
      <div class="in-sub">${SUBTITLE}</div>
      <div class="in-meta">
        <span>EPOCH <b class="in-epoch"></b></span>
        <span>ASTRONOMY ENGINE · JPL HORIZONS · CELESTRAK · SGP4</span>
      </div>
      <button type="button" class="in-enter">ВОЙТИ <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" /></svg></button>
      <div class="in-hint">клик · любая клавиша · колесо мыши</div>
    </div>`;
  document.body.appendChild(root);
  document.body.classList.add('intro-on');
  (root.querySelector('.in-epoch') as HTMLElement).textContent = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

  const canvas = root.querySelector('canvas')!;
  const ctx = canvas.getContext('2d')!;
  let W = 0, H = 0, dpr = 1;
  let parts: P[] = [];
  let titleBox = { x: 0, y: 0, w: 0, h: 0 };

  function layout() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    buildTargets();
  }

  /** Рисуем заголовок во внеэкранный канвас с широким трекингом и берём точки букв. */
  function buildTargets() {
    const lines = W < 700 ? ['SOLAR', 'EXPLORER'] : [TITLE];
    const longest = Math.max(...lines.map((l) => l.length));
    const track = 0.42;                             // трекинг в долях кегля
    let size = Math.min(132, (W * 0.84) / (longest * (0.62 + track)));
    size = Math.max(size, 34);
    const off = document.createElement('canvas');
    const ow = Math.ceil(W), oh = Math.ceil(size * 1.25 * lines.length + 20);
    off.width = ow; off.height = oh;
    const g = off.getContext('2d', { willReadFrequently: true })!;
    g.fillStyle = '#fff';
    g.textBaseline = 'alphabetic';
    g.font = `400 ${size}px ${FONT}`;
    const widths = lines.map((l) => [...l].reduce((a, ch, i) => a + g.measureText(ch).width + (i < l.length - 1 ? size * track : 0), 0));
    const lineH = size * 1.2;
    lines.forEach((l, li) => {
      let x = (ow - widths[li]) / 2;
      const y = size * 0.98 + li * lineH + 4;
      for (const ch of l) { g.fillText(ch, x, y); x += g.measureText(ch).width + size * track; }
    });
    const data = g.getImageData(0, 0, ow, oh).data;
    let filled = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 128) filled++;
    const target = W < 700 ? 2400 : 4600;
    const step = Math.max(1.6, Math.sqrt(filled / target));
    const pts: [number, number][] = [];
    for (let y = 0; y < oh; y += step) {
      for (let x = 0; x < ow; x += step) {
        const jx = x + (Math.random() - 0.5) * step * 0.6, jy = y + (Math.random() - 0.5) * step * 0.6;
        const ix = Math.round(jx), iy = Math.round(jy);
        if (ix < 0 || iy < 0 || ix >= ow || iy >= oh) continue;
        if (data[(iy * ow + ix) * 4 + 3] > 128) pts.push([jx, jy]);
      }
    }
    const blockH = oh;
    const top = Math.round(H * 0.5 - blockH * 0.5 - (W < 700 ? 40 : 46));
    titleBox = { x: (ow - Math.max(...widths)) / 2, y: top, w: Math.max(...widths), h: blockH };
    // Положение текстового блока (линия, подзаголовок) — сразу под буквами
    const textEl = root.querySelector<HTMLElement>('.in-text')!;
    textEl.style.top = `${top + blockH + 6}px`;
    textEl.style.setProperty('--rule-w', `${Math.min(titleBox.w, W - 40)}px`);

    const old = parts.length;
    const mk = (tx: number, ty: number, ambient: boolean): P => {
      // Звёзды стартуют по всему небу; чуть больше — у краёв
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * Math.hypot(W, H) * 0.6;
      const x0 = W / 2 + Math.cos(a) * r, y0 = H / 2 + Math.sin(a) * r * 0.75;
      return {
        x0, y0, tx, ty, x: x0, y: y0, vx: 0, vy: 0,
        delay: Math.random() * 0.7 + (tx / W) * 0.35, dur: 1.5 + Math.random() * 0.8,
        curve: (Math.random() - 0.5) * 0.5,
        size: ambient ? 0.5 + Math.random() * 0.9 : 0.9 + Math.random() * 0.9,
        base: ambient ? 0.15 + Math.random() * 0.4 : 0.55 + Math.random() * 0.45,
        tw: 1.2 + Math.random() * 2.5, ph: Math.random() * 6.28,
        warm: Math.random() < 0.07, ambient,
      };
    };
    parts = pts.map(([x, y]) => mk(x, y + top, false));
    const amb = W < 700 ? 140 : 320;
    for (let i = 0; i < amb; i++) { const p = mk(0, 0, true); p.tx = p.x0; p.ty = p.y0; parts.push(p); }
    if (old && state !== 'form') for (const p of parts) { p.x = p.tx; p.y = p.ty; }
  }

  let state: 'form' | 'hold' | 'leave' = 'form';
  let t0 = performance.now();
  let leaveT0 = 0;
  let raf = 0;
  let done = false;

  function draw(now: number) {
    const t = holdAt !== null ? holdAt : (now - t0) / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    const leaveK = state === 'leave' ? clamp01((now - leaveT0) / 1000 / LEAVE_S) : 0;

    for (const p of parts) {
      let x: number, y: number, alpha: number;
      if (state === 'leave') {
        const e = easeInOut(leaveK);
        x = p.x + p.vx * e; y = p.y + p.vy * e;
        alpha = p.base * (1 - leaveK) * (p.ambient ? 1 : 1 - leaveK * 0.2);
      } else if (p.ambient) {
        x = p.tx + Math.sin(t * 0.07 + p.ph) * 3; y = p.ty + Math.cos(t * 0.05 + p.ph) * 2;
        alpha = p.base * clamp01(t / 0.8);
        p.x = x; p.y = y;
      } else {
        const k = easeOutExpo(clamp01((t - p.delay) / p.dur));
        const dx = p.tx - p.x0, dy = p.ty - p.y0;
        const bend = Math.sin(Math.PI * k) * p.curve;
        x = p.x0 + dx * k - dy * bend; y = p.y0 + dy * k + dx * bend;
        // во время полёта — тусклая «звезда», в букве — ярче
        alpha = (0.2 + 0.8 * k) * p.base * clamp01(t / 0.5);
        p.x = x; p.y = y;
      }
      const tw = 0.78 + 0.22 * Math.sin(t * p.tw + p.ph);
      const a = Math.max(0, Math.min(1, alpha * tw));
      if (a < 0.01) continue;
      ctx.fillStyle = p.warm ? `rgba(255,196,150,${a})` : `rgba(232,238,248,${a})`;
      const s = p.size;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
    ctx.globalCompositeOperation = 'source-over';

    // HTML-часть: линия и подписи появляются после сборки
    root.style.setProperty('--k-rule', String(easeInOut(clamp01((t - 1.9) / 1.0))));
    root.style.setProperty('--k-sub', String(clamp01((t - 2.5) / 0.8)));
    root.style.setProperty('--k-hint', String(clamp01((t - 3.3) / 0.8)));
    if (state === 'form' && t > FORM_S + 0.6) state = 'hold';
    if (state === 'hold' && holdAt === null && t > FORM_S + IDLE_S) leave();
    if (state === 'leave' && leaveK >= 1) return finish();
    raf = requestAnimationFrame(draw);
  }

  function leave() {
    if (state === 'leave' || done) return;
    state = 'leave';
    if (reduce) {
      try { sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* ignore */ }
      root.classList.add('leaving'); document.body.classList.remove('intro-on'); off();
      setTimeout(finish, 700);
      return;
    }
    leaveT0 = performance.now();
    root.classList.add('leaving');
    document.body.classList.remove('intro-on');
    for (const p of parts) {
      // рассыпаются наружу от центра, с вращательной составляющей — «обратно в небо»
      const dx = p.x - W / 2, dy = p.y - H / 2, d = Math.hypot(dx, dy) || 1;
      const sp = (p.ambient ? 30 : 160) + Math.random() * (p.ambient ? 60 : 380);
      p.vx = (dx / d) * sp - (dy / d) * sp * 0.25 + (Math.random() - 0.5) * 40;
      p.vy = (dy / d) * sp + (dx / d) * sp * 0.25 + (Math.random() - 0.5) * 40;
    }
    try { sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* ignore */ }
    off();
  }

  function finish() {
    done = true;
    cancelAnimationFrame(raf);
    removeEventListener('resize', onResize);
    document.body.classList.remove('intro-on');
    root.remove();
  }

  const onAny = (e: Event) => {
    if (e instanceof KeyboardEvent && (e.ctrlKey || e.metaKey || e.altKey)) return;
    if (holdAt !== null) return;
    leave();
  };
  const onHash = () => { const r = location.hash.replace(/^#\/?/, '').split('?')[0].split('/')[0]; if (r && r !== 'home') leave(); };
  const onResize = () => { if (!done) layout(); };
  function off() {
    root.removeEventListener('pointerdown', onAny);
    removeEventListener('keydown', onAny);
    removeEventListener('wheel', onAny);
    removeEventListener('hashchange', onHash);
  }
  root.addEventListener('pointerdown', onAny);
  addEventListener('keydown', onAny);
  addEventListener('wheel', onAny, { passive: true });
  addEventListener('hashchange', onHash);
  addEventListener('resize', onResize);

  if (reduce) {
    // Без анимации частиц: статичная надпись, плавное появление и исчезновение оверлея
    root.classList.add('reduced');
    layout();
    root.style.setProperty('--k-rule', '1'); root.style.setProperty('--k-sub', '1'); root.style.setProperty('--k-hint', '1');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const p of parts) { ctx.fillStyle = `rgba(232,238,248,${p.base})`; ctx.fillRect(p.tx, p.ty, p.size, p.size); }
    state = 'hold';
    if (holdAt === null) setTimeout(leave, 6000);
    return;
  }

  layout();
  t0 = performance.now();
  raf = requestAnimationFrame(draw);
}
