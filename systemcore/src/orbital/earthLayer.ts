// GPU-слой всех объектов на орбите Земли: ~20 тыс. точек, позиции считаются в вершинном
// шейдере (Кеплер + вековые J2) — плавно при любом ускорении времени. Выбранный объект
// сопровождается полным SGP4 отдельно (main.ts / tracker.ts).
import * as THREE from 'three';
import { Catalog, OrbitalObject } from './catalog';
import { keplerJ2, kepEl, KepEl, V3 } from './propagate';
import { UNIT_KM } from '../ephemeris';

export const OBLIQUITY = (23.4392911 * Math.PI) / 180;

// Цвета классов: действующий, обломок, ступень, неактивный, неопознанный
export const CLASS_COLORS = ['#58c4ff', '#e3e7ec', '#ffcc4d', '#8a94a1', '#ff8a5c'];
// Цвет опасного мусора (красный — опасен для запуска ракеты)
export const DANGER_COLOR = '#ff1a1a';

// aStyle.y кодирование: 0=скрыт, 1=обычный, 2=подсвечен (selected), 3=ОПАСНЫЙ (красная точка)
const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec4 aEl0;   // n (рад/мин), e, i, Ω
attribute vec4 aEl1;   // ω, M0, t0 (мин от tRef), ndot (рад/мин²)
attribute vec2 aStyle; // класс, видимость: 0=скрыт, 1=обычный, 2=подсвечен, 3=ОПАСНЫЙ
uniform float uT;
uniform float uPx;
uniform float uScale;
uniform vec3 uColors[5];
uniform vec3 uHi;
uniform vec3 uDanger;
varying vec3 vColor;
varying float vAlpha;
varying float vDanger;
const float MU = 1.43496159e9;   // км³/мин²
const float RE = 6378.137;
const float J2 = 1.08262668e-3;
void main() {
  if (aStyle.y < 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  float n = aEl0.x, e = aEl0.y, inc = aEl0.z;
  float dt = uT - aEl1.z;
  float a = pow(MU / (n * n), 1.0 / 3.0);
  float ci = cos(inc), si = sin(inc);
  float p = a * (1.0 - e * e);
  float k = 1.5 * J2 * (RE / p) * (RE / p) * n;
  float raan = aEl0.w - k * ci * dt;
  float argp = aEl1.x + 0.5 * k * (5.0 * ci * ci - 1.0) * dt;
  float M = aEl1.y + n * dt + aEl1.w * dt * dt;   // n в TLE — наблюдаемое (Kozai) среднее движение, J2 уже учтён
  M = mod(M, 6.28318530718);
  float E = M + e * sin(M);
  for (int j = 0; j < 7; j++) E -= (E - e * sin(E) - M) / (1.0 - e * cos(E));
  float xp = a * (cos(E) - e), yp = a * sqrt(1.0 - e * e) * sin(E);
  float cO = cos(raan), sO = sin(raan), cw = cos(argp), sw = sin(argp);
  float x1 = xp * cw - yp * sw, y1 = xp * sw + yp * cw;
  vec3 eci = vec3(x1 * cO - y1 * ci * sO, x1 * sO + y1 * ci * cO, y1 * si);
  vec3 local = vec3(eci.x, eci.z, -eci.y) * uScale;   // ECI → локальная система Земли (ось Y — полюс)
  gl_Position = projectionMatrix * modelViewMatrix * vec4(local, 1.0);
  #include <logdepthbuf_vertex>
  int c = int(aStyle.x + 0.5);
  float vis = aStyle.y;
  bool hi = vis > 1.5 && vis < 2.5;
  bool danger = vis > 2.5;
  vec3 col = uColors[0];
  if (c == 1) col = uColors[1]; else if (c == 2) col = uColors[2]; else if (c == 3) col = uColors[3]; else if (c == 4) col = uColors[4];
  vColor = danger ? uDanger : (hi ? uHi : col);
  vAlpha = danger ? 1.0 : (hi ? 1.0 : (c == 1 ? 0.75 : 0.9));
  vDanger = danger ? 1.0 : 0.0;
  float base = c == 0 ? 2.2 : c == 2 ? 2.6 : 1.7;
  gl_PointSize = danger ? 3.5 * uPx : (hi ? 3.2 * uPx : base * uPx);
}`;

const FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
varying vec3 vColor;
varying float vAlpha;
varying float vDanger;
void main() {
  #include <logdepthbuf_fragment>
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  if (r > 0.5) discard;
  // Опасные обломки: яркое красное кольцо + центр
  if (vDanger > 0.5) {
    float ring = smoothstep(0.5, 0.42, r) * smoothstep(0.28, 0.36, r);
    float core = smoothstep(0.22, 0.10, r);
    float a = max(ring * 0.95, core * 0.85);
    gl_FragColor = vec4(vColor, a);
    return;
  }
  gl_FragColor = vec4(vColor, vAlpha * smoothstep(0.5, 0.32, r));
}`;

export interface EarthLayer {
  root: THREE.Group;
  setCatalog(c: Catalog): void;
  setVisibility(fn: (o: OrbitalObject) => 0 | 1 | 2): void;
  /** Пометить объекты как опасные (красная точка). Вызывать после setCatalog/setVisibility. */
  setDanger(fn: (o: OrbitalObject) => boolean): void;
  update(date: Date): void;
  pick(clientX: number, clientY: number, camera: THREE.Camera, date: Date, maxPx?: number): OrbitalObject | null;
  setOrbitSet(objs: OrbitalObject[], date: Date, color?: string): void;
  positionsEci(date: Date): Float32Array;
  readonly count: number;
}

export function createEarthLayer(renderer: THREE.WebGLRenderer): EarthLayer {
  const root = new THREE.Group();
  root.name = 'earth-orbit-layer';
  root.rotation.x = -OBLIQUITY; // экватор Земли относительно эклиптики (как у меша Земли)
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
    uniforms: {
      uT: { value: 0 }, uPx: { value: renderer.getPixelRatio() }, uScale: { value: 1 / UNIT_KM },
      uColors: { value: CLASS_COLORS.map((c) => new THREE.Color(c)) }, uHi: { value: new THREE.Color('#ff6b2c') },
      uDanger: { value: new THREE.Color(DANGER_COLOR) },
    },
  });
  const geo = new THREE.BufferGeometry();
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 2;
  root.add(points);

  // Пучок орбит (например, облако обломков одного события)
  const orbitsGeo = new THREE.BufferGeometry();   // заменяется в setOrbitSet
  const orbitsMat = new THREE.LineBasicMaterial({ color: '#ff6b2c', transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending });
  const orbitLines = new THREE.LineSegments(orbitsGeo, orbitsMat);
  orbitLines.frustumCulled = false;
  orbitLines.visible = false;
  root.add(orbitLines);

  let cat: Catalog | null = null;
  let els: KepEl[] = [];
  let tRef = 0;
  let style: Float32Array = new Float32Array(0);
  let dangerFn: ((o: OrbitalObject) => boolean) | null = null;

  const api: EarthLayer = {
    root,
    get count() { return cat?.objects.length ?? 0; },
    setCatalog(c) {
      cat = c;
      els = c.objects.map(kepEl);
      tRef = Math.floor(Date.now() / 60000);
      const N = c.objects.length;
      const a0 = new Float32Array(N * 4), a1 = new Float32Array(N * 4);
      style = new Float32Array(N * 2);
      els.forEach((k, i) => {
        a0.set([k.n, k.e, k.i, k.raan], i * 4);
        a1.set([k.argp, k.m0, k.t0 - tRef, k.ndot], i * 4);
        style[i * 2] = c.objects[i].cls; style[i * 2 + 1] = 1;
      });
      geo.setAttribute('aEl0', new THREE.BufferAttribute(a0, 4));
      geo.setAttribute('aEl1', new THREE.BufferAttribute(a1, 4));
      geo.setAttribute('aStyle', new THREE.BufferAttribute(style, 2));
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      geo.setDrawRange(0, N);
    },
    setVisibility(fn) {
      if (!cat) return;
      cat.objects.forEach((o, i) => {
        const v = fn(o);
        // Применить видимость, потом переприменить danger-флаг
        style[i * 2 + 1] = v;
        if (v >= 1 && dangerFn && dangerFn(o)) style[i * 2 + 1] = 3;
      });
      (geo.getAttribute('aStyle') as THREE.BufferAttribute).needsUpdate = true;
    },
    setDanger(fn) {
      dangerFn = fn;
      if (!cat) return;
      cat.objects.forEach((o, i) => {
        const vis = style[i * 2 + 1];
        if (fn(o) && vis >= 1) style[i * 2 + 1] = 3; // опасный — красная точка
        else if (vis === 3) style[i * 2 + 1] = 1;     // снять флаг
      });
      (geo.getAttribute('aStyle') as THREE.BufferAttribute).needsUpdate = true;
    },
    update(date) {
      mat.uniforms.uT.value = date.getTime() / 60000 - tRef;
      mat.uniforms.uPx.value = renderer.getPixelRatio();
    },
    positionsEci(date) {
      const out = new Float32Array(els.length * 3), t = date.getTime() / 60000, v: V3 = [0, 0, 0];
      els.forEach((k, i) => { keplerJ2(k, t, v); out[i * 3] = v[0]; out[i * 3 + 1] = v[1]; out[i * 3 + 2] = v[2]; });
      return out;
    },
    pick(cx, cy, camera, date, maxPx = 9) {
      if (!cat || !root.visible) return null;
      root.updateMatrixWorld(true);
      const m = root.matrixWorld, t = date.getTime() / 60000, v: V3 = [0, 0, 0], p = new THREE.Vector3();
      const w = innerWidth, h = innerHeight;
      let best = -1, bestD = maxPx * maxPx, bestZ = Infinity;
      const camPos = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
      const earthC = new THREE.Vector3().setFromMatrixPosition(m);
      const earthR = 6371 / UNIT_KM;
      for (let i = 0; i < els.length; i++) {
        if (style[i * 2 + 1] < 0.5) continue;
        keplerJ2(els[i], t, v);
        p.set(v[0], v[2], -v[1]).multiplyScalar(1 / UNIT_KM).applyMatrix4(m);
        // за диском Земли — не выбирается
        const toP = p.clone().sub(camPos), toE = earthC.clone().sub(camPos);
        const tc = toE.dot(toP.clone().normalize());
        if (tc > 0 && tc < toP.length()) {
          const closest = camPos.clone().addScaledVector(toP.clone().normalize(), tc);
          if (closest.distanceTo(earthC) < earthR) continue;
        }
        const dist = toP.length();
        p.project(camera);
        if (p.z > 1) continue;
        const sx = (p.x * 0.5 + 0.5) * w - cx, sy = (-p.y * 0.5 + 0.5) * h - cy;
        const d2 = sx * sx + sy * sy;
        if (d2 < bestD || (d2 < maxPx * maxPx && Math.abs(d2 - bestD) < 4 && dist < bestZ)) { bestD = d2; best = i; bestZ = dist; }
      }
      return best >= 0 ? cat.objects[best] : null;
    },
    setOrbitSet(objs, date, color = '#ff6b2c') {
      if (!objs.length) { orbitLines.visible = false; return; }
      const SEG = objs.length > 1500 ? 48 : 96;
      const arr = new Float32Array(objs.length * SEG * 6);
      const t = date.getTime() / 60000, v: V3 = [0, 0, 0];
      let o = 0;
      for (const ob of objs) {
        const k = kepEl(ob);
        const T = ob.periodMin;
        let px = 0, py = 0, pz = 0;
        for (let s = 0; s <= SEG; s++) {
          keplerJ2(k, t + (s / SEG) * T, v);
          const x = v[0] / UNIT_KM, y = v[2] / UNIT_KM, z = -v[1] / UNIT_KM;
          if (s > 0) { arr[o++] = px; arr[o++] = py; arr[o++] = pz; arr[o++] = x; arr[o++] = y; arr[o++] = z; }
          px = x; py = y; pz = z;
        }
      }
      const old = orbitLines.geometry;
      orbitLines.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(arr, 3));
      old.dispose();
      orbitsMat.color.set(color);
      orbitsMat.opacity = objs.length > 1500 ? 0.03 : objs.length > 400 ? 0.06 : objs.length > 60 ? 0.16 : 0.35;
      orbitLines.visible = true;
    },
  };
  return api;
}
