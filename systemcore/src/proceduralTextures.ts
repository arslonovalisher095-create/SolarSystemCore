import * as THREE from 'three';
import type { BodyDef } from './bodies';

/**
 * Процедурные текстуры-заглушки: используются, когда нет файла в public/textures
 * (и для тел, для которых готовых карт нет: Ио, Европа, Ганимед, Каллисто, Плутон).
 * Шум считается по 3D-координатам точки на сфере, поэтому шва на карте нет.
 */
function hash(x: number, y: number, z: number, seed: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x: number, y: number, z: number, seed: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const s = (t: number) => t * t * (3 - 2 * t);
  const u = s(fx), v = s(fy), w = s(fz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash(xi + dx, yi + dy, zi + dz, seed);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v), l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
function fbm(x: number, y: number, z: number, seed: number, oct = 5) {
  let a = 0.5, f = 1, sum = 0;
  for (let i = 0; i < oct; i++) { sum += a * vnoise(x * f, y * f, z * f, seed + i); a *= 0.5; f *= 2; }
  return sum; // ~0..1
}

interface Style { base: string; dark: string; light: string; scale: number; contrast: number; bands?: number; seed: number; spots?: string; cracks?: boolean; craters?: number; heart?: boolean }

const STYLES: Record<string, Partial<Style>> = {
  sun:      { base: '#ffb73a', dark: '#e0701a', light: '#fff0a0', scale: 6, contrast: 1.4 },
  mercury:  { base: '#8d8680', dark: '#4e4a47', light: '#bdb7ae', scale: 5, contrast: 1.4, craters: 140 },
  venus:    { base: '#d9a85a', dark: '#a8742f', light: '#f2d9a0', scale: 3, contrast: 1.0, bands: 4 },
  earth:    { base: '#2f6db5', dark: '#12356b', light: '#4f9a52', scale: 2.4, contrast: 2.2 },
  moon:     { base: '#a09d98', dark: '#5a5855', light: '#d2cfca', scale: 4, contrast: 1.3, craters: 160 },
  mars:     { base: '#c1633a', dark: '#6e3220', light: '#e8a070', scale: 3.5, contrast: 1.5 },
  jupiter:  { base: '#d8b48a', dark: '#9c5f3a', light: '#f2e3c8', scale: 2, contrast: 0.9, bands: 18 },
  saturn:   { base: '#e3cf9a', dark: '#b9975d', light: '#f6ecc9', scale: 2, contrast: 0.7, bands: 14 },
  uranus:   { base: '#9fe0e6', dark: '#76bcc6', light: '#cff4f6', scale: 1.5, contrast: 0.5, bands: 6 },
  neptune:  { base: '#3f66e0', dark: '#223f9c', light: '#7fa0ff', scale: 2, contrast: 0.8, bands: 8 },
  pluto:    { base: '#b08f74', dark: '#5a3f33', light: '#e6d3bd', scale: 4, contrast: 1.5, heart: true },
  io:       { base: '#e6d46a', dark: '#b8651f', light: '#fff4a8', scale: 4, contrast: 1.3, spots: '#2b1f14' },
  europa:   { base: '#d8cdb8', dark: '#9a7c58', light: '#f4efe6', scale: 3, contrast: 0.8, cracks: true },
  ganymede: { base: '#8f877a', dark: '#4f4a42', light: '#c6bfb0', scale: 5, contrast: 1.3, craters: 90 },
  phobos:   { base: '#7d7168', dark: '#41392f', light: '#a39588', scale: 6, contrast: 1.3, craters: 70 },
  deimos:   { base: '#8d8277', dark: '#52483e', light: '#b3a698', scale: 6, contrast: 1.0, craters: 30 },
  mimas:    { base: '#b4b4b4', dark: '#6d6d6d', light: '#e0e0e0', scale: 5, contrast: 1.0, craters: 160 },
  enceladus:{ base: '#f0f4f8', dark: '#c9d6e2', light: '#ffffff', scale: 3, contrast: 0.5, cracks: true },
  tethys:   { base: '#d2d2ce', dark: '#8f8f8a', light: '#f0f0ec', scale: 4, contrast: 0.8, craters: 110 },
  dione:    { base: '#c8c8c3', dark: '#7d7d78', light: '#e8e8e3', scale: 4, contrast: 1.0, craters: 90, cracks: true },
  rhea:     { base: '#bdbbb5', dark: '#75736d', light: '#e3e1db', scale: 4, contrast: 1.0, craters: 170 },
  titan:    { base: '#d29a3c', dark: '#a8721f', light: '#eac06c', scale: 2, contrast: 0.5, bands: 3 },
  iapetus:  { base: '#d9d4c8', dark: '#2e2a25', light: '#f2eee4', scale: 2, contrast: 2.4, craters: 80 },
  miranda:  { base: '#a8a8a8', dark: '#5f5f5f', light: '#d6d6d6', scale: 7, contrast: 1.6, craters: 40, cracks: true },
  ariel:    { base: '#b9b9b9', dark: '#767676', light: '#e6e6e6', scale: 4, contrast: 1.0, craters: 80, cracks: true },
  umbriel:  { base: '#6c6c6c', dark: '#3a3a3a', light: '#9a9a9a', scale: 4, contrast: 1.0, craters: 110 },
  titania:  { base: '#a39f98', dark: '#5f5b55', light: '#cfcac2', scale: 4, contrast: 1.1, craters: 120, cracks: true },
  oberon:   { base: '#8d8882', dark: '#4a4642', light: '#b8b2aa', scale: 4, contrast: 1.2, craters: 150 },
  triton:   { base: '#d2c4b8', dark: '#9c7f70', light: '#f2e8de', scale: 3, contrast: 0.9, craters: 25 },
  charon:   { base: '#8a8580', dark: '#4a3f3a', light: '#bdb8b2', scale: 4, contrast: 1.2, craters: 60 },
  callisto: { base: '#6e665b', dark: '#3a352e', light: '#a39b8d', scale: 5, contrast: 1.2, craters: 260 },
  'planet-x': { base: '#4d3ca6', dark: '#1b1448', light: '#c98aff', scale: 2.3, contrast: 1.15, bands: 10 },
};

const cache = new Map<string, THREE.CanvasTexture>();

export function proceduralTexture(def: BodyDef): THREE.CanvasTexture {
  const hit = cache.get(def.id);
  if (hit) return hit;
  const st: Style = { base: def.color, dark: def.color, light: def.color, scale: 3, contrast: 1, seed: 1, ...STYLES[def.id] } as Style;
  st.seed = [...def.id].reduce((a, ch) => a + ch.charCodeAt(0) * 31, 7);
  const W = 1024, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  const mix = (a: THREE.Color, b: THREE.Color, t: number) => [a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t];
  const base = new THREE.Color(st.base), dark = new THREE.Color(st.dark), light = new THREE.Color(st.light);
  const isEarth = def.id === 'earth', sea = new THREE.Color('#1d4f94'), deep = new THREE.Color('#0d2a5c'), land = new THREE.Color('#5b8c4a'), desert = new THREE.Color('#b69a62'), ice = new THREE.Color('#f2f6f8');

  for (let y = 0; y < H; y++) {
    const lat = (0.5 - (y + 0.5) / H) * Math.PI;
    for (let x = 0; x < W; x++) {
      const lon = ((x + 0.5) / W) * Math.PI * 2;
      const px = Math.cos(lat) * Math.cos(lon), pz = Math.cos(lat) * Math.sin(lon), py = Math.sin(lat);
      let n = fbm(px * st.scale, py * st.scale, pz * st.scale, st.seed);
      let rgb: number[];
      if (st.bands) {
        // зональные полосы: шум искажает широту
        const warp = (fbm(px * 3, py * 3, pz * 3, st.seed + 9) - 0.5) * 0.35;
        const band = Math.sin((py + warp) * st.bands * Math.PI) * 0.5 + 0.5;
        n = band * 0.7 + (n - 0.5) * 0.5 * st.contrast + 0.15;
        rgb = n < 0.5 ? mix(dark, base, n * 2) : mix(base, light, (n - 0.5) * 2);
      } else if (isEarth) {
        const h = n * 1.0 + (fbm(px * 6, py * 6, pz * 6, st.seed + 3) - 0.5) * 0.25;
        if (h < 0.5) rgb = mix(deep, sea, Math.min(1, h * 2.2));
        else rgb = mix(land, desert, Math.min(1, (h - 0.5) * 3 + Math.abs(py) * -0.3 + (fbm(px * 4, py * 4, pz * 4, 77) - 0.5)));
        const polar = Math.max(0, (Math.abs(py) - 0.82) * 8) + (Math.abs(py) > 0.7 ? (fbm(px * 8, py * 8, pz * 8, 5) - 0.55) * 1.5 : 0);
        if (polar > 0) rgb = mix(new THREE.Color(rgb[0], rgb[1], rgb[2]), ice, Math.min(1, polar));
      } else {
        const t = Math.min(1, Math.max(0, (n - 0.5) * st.contrast * 1.6 + 0.5));
        rgb = t < 0.5 ? mix(dark, base, t * 2) : mix(base, light, (t - 0.5) * 2);
      }
      const i = (y * W + x) * 4;
      img.data[i] = Math.min(255, rgb[0] * 255); img.data[i + 1] = Math.min(255, rgb[1] * 255); img.data[i + 2] = Math.min(255, rgb[2] * 255); img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);

  // Детали поверх шума (случайные, но воспроизводимые)
  let s = st.seed; const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967295);
  if (st.craters) {
    for (let i = 0; i < st.craters; i++) {
      const x = rnd() * W, y = (0.12 + rnd() * 0.76) * H, r = 1.5 + Math.pow(rnd(), 3) * 16;
      const grd = g.createRadialGradient(x, y, r * 0.2, x, y, r);
      grd.addColorStop(0, 'rgba(0,0,0,.28)'); grd.addColorStop(0.8, 'rgba(0,0,0,.12)'); grd.addColorStop(0.92, 'rgba(255,255,255,.25)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  }
  if (st.spots) {
    for (let i = 0; i < 40; i++) {
      const x = rnd() * W, y = (0.15 + rnd() * 0.7) * H, r = 3 + rnd() * 9;
      g.fillStyle = 'rgba(40,25,15,.65)'; g.beginPath(); g.ellipse(x, y, r * 1.2, r, 0, 0, 7); g.fill();
      g.strokeStyle = 'rgba(255,120,40,.5)'; g.lineWidth = 1.5; g.stroke();
    }
  }
  if (st.cracks) {
    g.strokeStyle = 'rgba(120,70,40,.55)'; g.lineWidth = 1.4;
    for (let i = 0; i < 70; i++) {
      let x = rnd() * W, y = (0.1 + rnd() * 0.8) * H, a = rnd() * 6.28;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 14; k++) { a += (rnd() - 0.5) * 0.7; x += Math.cos(a) * 14; y += Math.sin(a) * 9; g.lineTo(x, y); }
      g.stroke();
    }
  }
  if (st.heart) {
    const grd = g.createRadialGradient(W * 0.55, H * 0.52, 5, W * 0.55, H * 0.52, 90);
    grd.addColorStop(0, 'rgba(255,245,235,.85)'); grd.addColorStop(1, 'rgba(255,245,235,0)');
    g.fillStyle = grd; g.beginPath(); g.ellipse(W * 0.55, H * 0.52, 95, 70, 0, 0, 7); g.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(def.id, tex);
  return tex;
}
