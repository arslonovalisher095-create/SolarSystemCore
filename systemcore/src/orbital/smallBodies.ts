import { localized } from '../i18n';
// Малые тела: астероиды, кометы, транснептуновые объекты с реальными оскулирующими элементами
// (Stellarium ssystem_minor.ini ← MPC/JPL) + 35 792 орбиты околоземных астероидов (форма орбит,
// без фазы — в наборе нет средней аномалии, поэтому рисуем только сами орбиты).
import * as THREE from 'three';
import { UNIT_KM, KM_PER_AU } from '../ephemeris';

const K_GAUSS = 0.01720209895; // рад/сут
const D2R = Math.PI / 180;

export type SbClass = 'neo' | 'mba' | 'trojan' | 'centaur' | 'tno' | 'comet' | 'interstellar' | 'dwarf';
export const SB_COLORS: Record<SbClass, string> = {
  neo: '#ffb36b', mba: '#9aa5b3', trojan: '#7ee0a6', centaur: '#e0c36b', tno: '#7fa8ff', comet: '#8fd8ff', interstellar: '#ff4a4a', dwarf: '#ffffff',
};
export const SB_NAMES: Record<SbClass, string> = {
  neo: localized("Сближающиеся с Землёй", "Near-Earth"), mba: localized("Главный пояс", "Main belt"), trojan: localized("Троянцы Юпитера", "Jupiter Trojans"), centaur: localized("Кентавры", "Centaurs"), tno: localized("Транснептуновые", "Trans-Neptunian"), comet: localized("Кометы", "Comets"), interstellar: localized("Межзвёздные", "Interstellar"), dwarf: localized("Карликовые планеты", "Dwarf planets"),
};

export interface SmallBody {
  idx: number;
  id: string;          // sb-<slug>
  name: string;
  type: string;        // как в источнике
  cls: SbClass;
  e: number; i: number; node: number; peri: number;   // рад
  q: number;           // перигелий, а.е.
  a: number;           // большая полуось, а.е. (<0 для гиперболы)
  tp: number;          // JD прохождения перигелия
  H: number | null;
  discoverer?: string;
  discovery?: string;
  model?: string;      // файл формы в public/models/sr
}

interface Raw { n: string; t: string; e: number; i: number; O: number; w: number; k: 'a' | 'q'; x: number; m: number; ep: number; H: number | null; d?: string; dd?: string }

const SHAPES: [RegExp, string][] = [
  [/\bBennu\b/i, 'asteroid-bennu.glb'], [/\bVesta\b/i, 'asteroid-vesta.glb'], [/\bEros\b/i, 'asteroid-eros.glb'], [/\bItokawa\b/i, 'asteroid-itokawa.glb'],
  [/\bRyugu\b/i, 'asteroid-ryugu.glb'], [/\bDidymos\b/i, 'asteroid-didymos.glb'], [/Arrokoth/i, 'asteroid-arrokoth.glb'], [/Donaldjohanson/i, 'asteroid-donaldjohanson.glb'],
  [/\bLutetia\b/i, 'asteroid-lutetia.glb'], [/\bSteins\b/i, 'asteroid-steins.glb'], [/\bToutatis\b/i, 'asteroid-toutatis.glb'], [/\bKleopatra\b/i, 'asteroid-kleopatra.glb'],
  [/Churyumov|67P/i, 'comet-67p.glb'], [/\bCeres\b/i, 'dwarf-ceres.glb'],
];

function classify(r: Raw, a: number, q: number): SbClass {
  const t = r.t.toLowerCase();
  if (t.includes('interstellar')) return 'interstellar';
  if (t === 'comet') return 'comet';
  if (t.includes('dwarf')) return 'dwarf';
  if (t.includes('cubewano') || t.includes('plutino') || t.includes('scattered') || t.includes('sednoid') || a > 30) return 'tno';
  if (q < 1.3) return 'neo';
  if (a > 5.0 && a < 5.4) return 'trojan';
  if (a > 5.5 && a < 30) return 'centaur';
  return 'mba';
}

export function parseSmallBodies(raw: Raw[]): SmallBody[] {
  const seen = new Map<string, number>();
  return raw.map((r, idx) => {
    const e = r.e;
    let a: number, q: number, tp: number;
    if (r.k === 'a') {
      a = r.x; q = a * (1 - e);
      const n = K_GAUSS / Math.pow(a, 1.5);
      tp = r.ep - (r.m * D2R) / n;
    } else {
      q = r.x; a = e === 1 ? Infinity : q / (1 - e); tp = r.m;
    }
    let slug = r.n.toLowerCase().replace(/[^a-z0-9а-я]+/gi, '-').replace(/^-|-$/g, '');
    const k = seen.get(slug) ?? 0; seen.set(slug, k + 1);
    if (k) slug += '-' + (k + 1);   // у нескольких комет одинаковое имя (PANSTARRS)
    return {
      idx, id: 'sb-' + slug, name: r.n, type: r.t, cls: classify(r, a, q), e, i: r.i * D2R, node: r.O * D2R, peri: r.w * D2R, q, a, tp, H: r.H,
      discoverer: r.d, discovery: r.dd, model: SHAPES.find(([re]) => re.test(r.n))?.[1],
    };
  });
}

/** Гелиоцентрическое положение (эклиптика J2000, км) по элементам: эллипс, парабола, гипербола. */
export function smallBodyPos(b: SmallBody, jd: number, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
  const e = b.e, dt = jd - b.tp;
  let xv: number, yv: number;
  if (e < 0.999) {
    const a = b.a, n = K_GAUSS / Math.pow(a, 1.5);
    let M = (n * dt) % (2 * Math.PI);
    let E = e < 0.8 ? M : Math.PI;
    for (let j = 0; j < 30; j++) { const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); E -= d; if (Math.abs(d) < 1e-12) break; }
    xv = a * (Math.cos(E) - e); yv = a * Math.sqrt(1 - e * e) * Math.sin(E);
  } else if (e > 1.001) {
    const aa = Math.abs(b.q / (1 - e)), n = K_GAUSS / Math.pow(aa, 1.5);
    const M = n * dt;
    let H = Math.asinh(M / e);
    for (let j = 0; j < 50; j++) { const d = (e * Math.sinh(H) - H - M) / (e * Math.cosh(H) - 1); H -= d; if (Math.abs(d) < 1e-12) break; }
    xv = aa * (e - Math.cosh(H)); yv = aa * Math.sqrt(e * e - 1) * Math.sinh(H);
  } else {
    // парабола: уравнение Баркера
    const W = 3 * K_GAUSS / Math.sqrt(2 * b.q * b.q * b.q) * dt;
    const Y = Math.cbrt(W / 2 + Math.sqrt(W * W / 4 + 1));
    const s = Y - 1 / Y;
    xv = b.q * (1 - s * s); yv = 2 * b.q * s;
  }
  const cO = Math.cos(b.node), sO = Math.sin(b.node), cw = Math.cos(b.peri), sw = Math.sin(b.peri), ci = Math.cos(b.i), si = Math.sin(b.i);
  const x1 = xv * cw - yv * sw, y1 = xv * sw + yv * cw;
  out[0] = (x1 * cO - y1 * ci * sO) * KM_PER_AU;
  out[1] = (x1 * sO + y1 * ci * cO) * KM_PER_AU;
  out[2] = y1 * si * KM_PER_AU;
  return out;
}

/** Точки орбиты (км, эклиптика) — для выбранного тела. Для разомкнутых орбит — дуга ±2 года от перигелия. */
export function smallBodyOrbit(b: SmallBody, jd: number, steps = 360): [number, number, number][] {
  const pts: [number, number, number][] = [];
  if (b.e < 0.999) {
    // равномерно по эксцентрической аномалии — иначе у вытянутых орбит пропадает перигелий
    const n = K_GAUSS / Math.pow(b.a, 1.5);
    for (let s = 0; s <= steps; s++) { const E = (s / steps) * 2 * Math.PI; pts.push(smallBodyPos(b, b.tp + (E - b.e * Math.sin(E)) / n)); }
    void jd;
  } else {
    for (let s = 0; s <= steps; s++) pts.push(smallBodyPos(b, b.tp + (s / steps - 0.5) * 1460));
  }
  return pts;
}

export const jdOf = (d: Date) => d.getTime() / 86400000 + 2440587.5;

// ---------------------------------------------------------------- слой точек малых тел
export interface SmallBodyLayer {
  points: THREE.Points;
  neaLines: THREE.LineSegments;
  bodies: SmallBody[];
  neaCount: number;
  update(date: Date, originKm: [number, number, number]): void;
  setClassVisible(cls: SbClass | 'nea-orbits', on: boolean): void;
  isClassVisible(cls: SbClass | 'nea-orbits'): boolean;
  pick(cx: number, cy: number, camera: THREE.Camera): SmallBody | null;
  posKm(b: SmallBody, date: Date): [number, number, number];
}

const NEA_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aU;
attribute vec4 aO0;  // a (а.е.), e, i, Ω (рад)
attribute vec2 aO1;  // ω (рад), MOID (а.е.)
uniform vec3 uSun;   // положение Солнца в сцене
uniform float uAU;   // а.е. в единицах сцены
varying float vMoid;
varying float vU;
void main() {
  float a = aO0.x, e = aO0.y, inc = aO0.z, node = aO0.w, w = aO1.x;
  float E = aU * 6.28318530718;
  float xv = a * (cos(E) - e), yv = a * sqrt(max(1.0 - e * e, 0.0)) * sin(E);
  float cO = cos(node), sO = sin(node), cw = cos(w), sw = sin(w), ci = cos(inc), si = sin(inc);
  float x1 = xv * cw - yv * sw, y1 = xv * sw + yv * cw;
  vec3 ecl = vec3(x1 * cO - y1 * ci * sO, x1 * sO + y1 * ci * cO, y1 * si);
  vec3 p = uSun + vec3(ecl.x, ecl.z, -ecl.y) * uAU;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  #include <logdepthbuf_vertex>
  vMoid = aO1.y;
  vU = aU;
}`;
const NEA_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
varying float vMoid;
varying float vU;
uniform float uOpacity;
void main() {
  #include <logdepthbuf_fragment>
  // MOID < 0.05 а.е. — потенциально опасные: тёплый цвет; дальше — холодный серый
  float k = clamp(vMoid / 0.3, 0.0, 1.0);
  vec3 col = mix(vec3(1.0, 0.42, 0.17), vec3(0.45, 0.52, 0.62), k);
  float pha = vMoid < 0.05 ? 3.0 : 1.0;
  gl_FragColor = vec4(col, uOpacity * pha);
}`;

export async function createSmallBodyLayer(): Promise<SmallBodyLayer> {
  const sbJson = await (await fetch('data/catalog/smallbodies.json')).json();
  const bodies = parseSmallBodies(sbJson.bodies);
  const N = bodies.length;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  bodies.forEach((b, i) => { const c = new THREE.Color(SB_COLORS[b.cls]); col.set([c.r, c.g, c.b], i * 3); });
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false }));
  points.frustumCulled = false;
  points.renderOrder = 1;
  const visible = new Set<string>(['neo', 'mba', 'trojan', 'centaur', 'tno', 'comet', 'interstellar', 'dwarf']);

  // NEA: инстансированные линии орбит
  const SEG = 96;
  const nea = await (await fetch('data/catalog/nea.json')).json() as { count: number; a: number[]; e: number[]; i: number[]; O: number[]; w: number[]; moid: number[] };
  const base = new Float32Array(SEG * 2);
  for (let s = 0; s < SEG; s++) { base[s * 2] = s / SEG; base[s * 2 + 1] = (s + 1) / SEG; }
  const ig = new THREE.InstancedBufferGeometry();
  ig.setAttribute('aU', new THREE.BufferAttribute(base, 1));
  ig.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SEG * 2 * 3), 3));
  const o0 = new Float32Array(nea.count * 4), o1 = new Float32Array(nea.count * 2);
  for (let k = 0; k < nea.count; k++) {
    o0.set([nea.a[k], nea.e[k], nea.i[k] * D2R, nea.O[k] * D2R], k * 4);
    o1.set([nea.w[k] * D2R, nea.moid[k]], k * 2);
  }
  ig.setAttribute('aO0', new THREE.InstancedBufferAttribute(o0, 4));
  ig.setAttribute('aO1', new THREE.InstancedBufferAttribute(o1, 2));
  ig.instanceCount = nea.count;
  const neaMat = new THREE.ShaderMaterial({
    vertexShader: NEA_VERT, fragmentShader: NEA_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uSun: { value: new THREE.Vector3() }, uAU: { value: KM_PER_AU / UNIT_KM }, uOpacity: { value: 0.011 } },
  });
  const neaLines = new THREE.LineSegments(ig, neaMat);
  neaLines.frustumCulled = false;
  neaLines.visible = false;

  const tmp: [number, number, number] = [0, 0, 0];
  let lastJd = -1;
  const helio = new Float64Array(N * 3);

  return {
    points, neaLines, bodies, neaCount: nea.count,
    update(date, origin) {
      const jd = jdOf(date);
      if (jd !== lastJd) {
        bodies.forEach((b, i) => { smallBodyPos(b, jd, tmp); helio[i * 3] = tmp[0]; helio[i * 3 + 1] = tmp[1]; helio[i * 3 + 2] = tmp[2]; });
        lastJd = jd;
      }
      for (let i = 0; i < N; i++) {
        if (!visible.has(bodies[i].cls)) { pos[i * 3] = 1e9; pos[i * 3 + 1] = 1e9; pos[i * 3 + 2] = 1e9; continue; }
        pos[i * 3] = (helio[i * 3] - origin[0]) / UNIT_KM;
        pos[i * 3 + 1] = (helio[i * 3 + 2] - origin[2]) / UNIT_KM;
        pos[i * 3 + 2] = -(helio[i * 3 + 1] - origin[1]) / UNIT_KM;
      }
      (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      neaMat.uniforms.uSun.value.set(-origin[0] / UNIT_KM, -origin[2] / UNIT_KM, origin[1] / UNIT_KM);
    },
    setClassVisible(cls, on) {
      if (cls === 'nea-orbits') { neaLines.visible = on; return; }
      if (on) visible.add(cls); else visible.delete(cls);
      lastJd = -1;
    },
    isClassVisible(cls) { return cls === 'nea-orbits' ? neaLines.visible : visible.has(cls); },
    pick(cx, cy, camera) {
      if (!points.visible) return null;
      const v = new THREE.Vector3(), w = innerWidth, h = innerHeight;
      let best: SmallBody | null = null, bd = 81;
      for (let i = 0; i < N; i++) {
        if (!visible.has(bodies[i].cls)) continue;
        v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).project(camera);
        if (v.z > 1) continue;
        const dx = (v.x * 0.5 + 0.5) * w - cx, dy = (-v.y * 0.5 + 0.5) * h - cy, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = bodies[i]; }
      }
      return best;
    },
    posKm(b, date) { return smallBodyPos(b, jdOf(date), [0, 0, 0]); },
  };
}
