// Два пропагатора над одним набором элементов GP:
//  * SGP4/SDP4 (satellite.js) — эталон для выбранного объекта, трека, сближений-уточнений;
//  * Кеплер + вековые возмущения J2 (+ ndot) — для массовой отрисовки ~20 тыс. объектов
//    (тот же алгоритм работает в вершинном шейдере и в воркере скрининга сближений).
import * as satellite from 'satellite.js';
import { OrbitalObject, toOmm } from './catalog';

export const MU_MIN = 398600.4418 * 3600;   // км³/мин²
export const RE = 6378.137;
export const J2 = 1.08262668e-3;
const D2R = Math.PI / 180;

export type V3 = [number, number, number];

const satrecs = new Map<number, ReturnType<typeof satellite.json2satrec>>();
export function satrecOf(o: OrbitalObject) {
  let s = satrecs.get(o.norad);
  if (!s) { s = satellite.json2satrec(toOmm(o) as never); satrecs.set(o.norad, s); }
  return s;
}
export function clearSatrecs() { satrecs.clear(); }

/** SGP4: положение/скорость в TEME (≈ ECI), км и км/с. null — если объект «сгорел» по модели. */
export function sgp4(o: OrbitalObject, date: Date): { r: V3; v: V3 } | null {
  const pv = satellite.propagate(satrecOf(o), date);
  if (!pv || !pv.position || typeof pv.position === 'boolean' || !pv.velocity || typeof pv.velocity === 'boolean') return null;
  const p = pv.position as { x: number; y: number; z: number }, v = pv.velocity as { x: number; y: number; z: number };
  if (!isFinite(p.x)) return null;
  return { r: [p.x, p.y, p.z], v: [v.x, v.y, v.z] };
}

export function gmst(date: Date) { return satellite.gstime(date); }

/** Подспутниковая точка: широта/долгота (град), высота (км). */
export function geodetic(r: V3, date: Date) {
  const g = satellite.eciToGeodetic({ x: r[0], y: r[1], z: r[2] } as never, satellite.gstime(date));
  return { lat: satellite.degreesLat(g.latitude), lon: satellite.degreesLong(g.longitude), alt: g.height };
}

/** Кеплер + J2 (вековые члены). Совпадает с GLSL-версией в earthLayer.ts. Результат в ECI, км. */
export interface KepEl { n: number; e: number; i: number; raan: number; argp: number; m0: number; t0: number; ndot: number }
export function kepEl(o: OrbitalObject): KepEl {
  return {
    n: (o.nRevDay * 2 * Math.PI) / 1440, e: o.ecc, i: o.incl * D2R, raan: o.raan * D2R, argp: o.argp * D2R, m0: o.ma * D2R,
    t0: o.epochMs / 60000, ndot: (2 * Math.PI * o.ndot) / (1440 * 1440),
  };
}
export function keplerJ2(k: KepEl, tMin: number, out: V3 = [0, 0, 0]): V3 {
  const dt = tMin - k.t0;
  const a = Math.cbrt(MU_MIN / (k.n * k.n));
  const e = k.e, ci = Math.cos(k.i), si = Math.sin(k.i);
  const p = a * (1 - e * e);
  const kk = 1.5 * J2 * (RE / p) * (RE / p) * k.n;
  const raan = k.raan - kk * ci * dt;
  const argp = k.argp + 0.5 * kk * (5 * ci * ci - 1) * dt;
  let M = k.m0 + k.n * dt + k.ndot * dt * dt;
  M %= 2 * Math.PI;
  let E = M + e * Math.sin(M);
  for (let j = 0; j < 6; j++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cO = Math.cos(raan), sO = Math.sin(raan), cw = Math.cos(argp), sw = Math.sin(argp);
  const x1 = xp * cw - yp * sw, y1 = xp * sw + yp * cw;
  out[0] = x1 * cO - y1 * ci * sO;
  out[1] = x1 * sO + y1 * ci * cO;
  out[2] = y1 * si;
  return out;
}

/** Замкнутая орбита (SGP4) на один период вперёд от даты, ECI км. */
export function orbitRing(o: OrbitalObject, date: Date, steps = 180): V3[] {
  const pts: V3[] = [];
  const T = o.periodMin * 60e3, t0 = date.getTime();
  for (let i = 0; i <= steps; i++) {
    const s = sgp4(o, new Date(t0 + (i / steps) * T));
    if (s) pts.push(s.r);
  }
  return pts;
}

/** Наземный трек (широта/долгота) на ±витки. */
export function groundTrack(o: OrbitalObject, date: Date, revs = 1.5, steps = 240) {
  const out: { lat: number; lon: number; t: number }[] = [];
  const T = o.periodMin * 60e3 * revs, t0 = date.getTime() - T * 0.33;
  for (let i = 0; i <= steps; i++) {
    const t = t0 + (i / steps) * T, d = new Date(t);
    const s = sgp4(o, d);
    if (!s) continue;
    const g = geodetic(s.r, d);
    out.push({ lat: g.lat, lon: g.lon, t });
  }
  return out;
}

export const len = (v: V3) => Math.hypot(v[0], v[1], v[2]);
