// Скрининг сближений (conjunction screening) для одного объекта против всего каталога.
// Этап 1 (воркер): фильтр по перекрытию высотных оболочек, затем перебор по времени с шагом
// 20 с на 24 ч по модели Кеплер+J2 и уточнение минимума золотым сечением.
// Этап 2 (главный поток): уточнение лучших кандидатов полным SGP4 (tracker.ts).
import { OrbitalObject } from './catalog';
import { kepEl, KepEl } from './propagate';

export interface Approach { idx: number; tcaMs: number; missKm: number; relKmS: number }

const WORKER_SRC = `
const MU = 398600.4418 * 3600, RE = 6378.137, J2 = 1.08262668e-3;
function pos(k, t, o) {
  const dt = t - k.t0, a = Math.cbrt(MU / (k.n * k.n)), e = k.e, ci = Math.cos(k.i), si = Math.sin(k.i);
  const p = a * (1 - e * e), kk = 1.5 * J2 * (RE / p) * (RE / p) * k.n;
  const raan = k.raan - kk * ci * dt, argp = k.argp + 0.5 * kk * (5 * ci * ci - 1) * dt;
  let M = (k.m0 + k.n * dt + k.ndot * dt * dt) % (2 * Math.PI);
  let E = M + e * Math.sin(M);
  for (let j = 0; j < 5; j++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cO = Math.cos(raan), sO = Math.sin(raan), cw = Math.cos(argp), sw = Math.sin(argp);
  const x1 = xp * cw - yp * sw, y1 = xp * sw + yp * cw;
  o[0] = x1 * cO - y1 * ci * sO; o[1] = x1 * sO + y1 * ci * cO; o[2] = y1 * si;
}
onmessage = (ev) => {
  const { target, cands, t0, hours, stepS, thresholdKm } = ev.data;
  const steps = Math.ceil(hours * 3600 / stepS), dtm = stepS / 60;
  const tp = new Float64Array((steps + 1) * 3), a = [0, 0, 0], b = [0, 0, 0];
  for (let s = 0; s <= steps; s++) { pos(target, t0 + s * dtm, a); tp[s * 3] = a[0]; tp[s * 3 + 1] = a[1]; tp[s * 3 + 2] = a[2]; }
  const res = [];
  let done = 0;
  const dist = (k, t) => { pos(target, t, a); pos(k, t, b); return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); };
  for (const c of cands) {
    let prev = Infinity, prev2 = Infinity, best = null;
    for (let s = 0; s <= steps; s++) {
      pos(c.k, t0 + s * dtm, b);
      const d = Math.hypot(tp[s * 3] - b[0], tp[s * 3 + 1] - b[1], tp[s * 3 + 2] - b[2]);
      // выборка грубая (за 20 с объекты проходят до ~300 км), поэтому порог на этапе выборки шире
      if (s >= 2 && prev < prev2 && prev <= d && prev < thresholdKm + 8 * stepS) {
        // уточнение золотым сечением на [s-2, s]
        let lo = t0 + (s - 2) * dtm, hi = t0 + s * dtm;
        const g = 0.6180339887;
        let x1 = hi - g * (hi - lo), x2 = lo + g * (hi - lo), f1 = dist(c.k, x1), f2 = dist(c.k, x2);
        for (let it = 0; it < 40; it++) {
          if (f1 < f2) { hi = x2; x2 = x1; f2 = f1; x1 = hi - g * (hi - lo); f1 = dist(c.k, x1); }
          else { lo = x1; x1 = x2; f1 = f2; x2 = lo + g * (hi - lo); f2 = dist(c.k, x2); }
        }
        const tm = (lo + hi) / 2, dm = dist(c.k, tm);
        if (dm < thresholdKm && (!best || dm < best.missKm)) {
          pos(target, tm + 1 / 60, a); const a2 = a.slice(); pos(c.k, tm + 1 / 60, b); const b2 = b.slice();
          pos(target, tm, a); pos(c.k, tm, b);
          const rel = Math.hypot((a2[0] - a[0]) - (b2[0] - b[0]), (a2[1] - a[1]) - (b2[1] - b[1]), (a2[2] - a[2]) - (b2[2] - b[2]));
          best = { idx: c.idx, tcaMs: tm * 60000, missKm: dm, relKmS: rel };
        }
      }
      prev2 = prev; prev = d;
    }
    if (best) res.push(best);
    if (++done % 200 === 0) postMessage({ progress: done / cands.length });
  }
  res.sort((x, y) => x.missKm - y.missKm);
  postMessage({ done: true, results: res.slice(0, 60), screened: cands.length });
};`;

let worker: Worker | null = null;
function getWorker() {
  if (!worker) worker = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' })));
  return worker;
}

export function screenConjunctions(
  target: OrbitalObject, all: OrbitalObject[], start: Date,
  opts: { hours?: number; stepS?: number; thresholdKm?: number; onProgress?: (f: number, n: number) => void } = {},
): Promise<{ results: Approach[]; screened: number }> {
  const hours = opts.hours ?? 24, stepS = opts.stepS ?? 20, thresholdKm = opts.thresholdKm ?? 50;
  const margin = 25;
  const cands = all
    .filter((o) => o !== target && o.perigeeKm - margin <= target.apogeeKm && o.apogeeKm + margin >= target.perigeeKm)
    .map((o) => ({ idx: o.idx, k: kepEl(o) as KepEl }));
  const w = getWorker();
  return new Promise((resolve, reject) => {
    w.onerror = (e) => { worker?.terminate(); worker = null; reject(e); };
    w.onmessage = (ev) => {
      if (ev.data.progress !== undefined) { opts.onProgress?.(ev.data.progress, cands.length); return; }
      if (ev.data.done) resolve({ results: ev.data.results as Approach[], screened: ev.data.screened });
    };
    w.postMessage({ target: kepEl(target), cands, t0: start.getTime() / 60000, hours, stepS, thresholdKm });
  });
}
