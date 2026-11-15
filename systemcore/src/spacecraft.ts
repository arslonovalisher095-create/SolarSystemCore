import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Упрощённые 3D-модели аппаратов, собранные из примитивов (без внешних файлов).
 * Единицы модели: весь аппарат ≈ 1–2 единицы. Ось +Z — направление «антенна на Землю» (или щит на Солнце у Parker).
 * В сцене модель масштабируется на MODEL_SIZE (увеличена относительно реальных размеров, иначе её не видно).
 */
export const MODEL_SIZE = 2e-4; // единиц сцены (1 ед. = 1 млн км) → ≈ 200 км на единицу модели

const gold = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.85, roughness: 0.38 });
const white = new THREE.MeshStandardMaterial({ color: 0xc4c4c0, metalness: 0.15, roughness: 0.6, side: THREE.DoubleSide });
const grey = new THREE.MeshStandardMaterial({ color: 0x8a8d92, metalness: 0.6, roughness: 0.5 });
const dark = new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.3, roughness: 0.7 });
const black = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9, side: THREE.DoubleSide });
const rtg = new THREE.MeshStandardMaterial({ color: 0x4a4a4e, metalness: 0.7, roughness: 0.4 });

function solarTexture(cols: number, rows: number) {
  const W = 512, c = document.createElement('canvas'); c.width = c.height = W;
  const g = c.getContext('2d')!;
  g.fillStyle = '#8d96b4'; g.fillRect(0, 0, W, W);                       // подложка видна в зазорах между ячейками
  const cw = W / cols, ch = W / rows, gap = Math.max(2, Math.min(cw, ch) * 0.06);
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const l = 16 + Math.random() * 7;                                    // у каждой ячейки чуть свой оттенок
    const gr = g.createLinearGradient(i * cw, j * ch, (i + 1) * cw, (j + 1) * ch);
    gr.addColorStop(0, `hsl(226 52% ${l + 5}%)`); gr.addColorStop(1, `hsl(232 58% ${l - 3}%)`);
    g.fillStyle = gr; g.fillRect(i * cw + gap, j * ch + gap, cw - gap * 2, ch - gap * 2);
    g.strokeStyle = 'rgba(214,178,96,.55)'; g.lineWidth = 1;             // токосъёмные шины
    for (const f of [0.33, 0.66]) { g.beginPath(); g.moveTo(i * cw + gap + (cw - gap * 2) * f, j * ch + gap); g.lineTo(i * cw + gap + (cw - gap * 2) * f, (j + 1) * ch - gap); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const solarCache = new Map<string, THREE.Texture>();
const solarMat = (cols = 6, rows = 10) => {
  const key = cols + 'x' + rows; let t = solarCache.get(key);
  if (!t) { t = solarTexture(cols, rows); solarCache.set(key, t); }
  return new THREE.MeshPhysicalMaterial({ map: t, metalness: 0.45, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.25, emissive: 0x0a1230, emissiveIntensity: 0.5 });
};

const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };
/** Цилиндр вдоль оси: 'x' | 'y' | 'z' */
function cyl(r: number, h: number, m: THREE.Material, axis: 'x' | 'y' | 'z' = 'y', x = 0, y = 0, z = 0, seg = 24, r2 = r) {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, h, seg), m);
  if (axis === 'x') o.rotation.z = Math.PI / 2; else if (axis === 'z') o.rotation.x = Math.PI / 2;
  o.position.set(x, y, z); return o;
}
const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T => { o.position.set(x, y, z); return o; };
/** Стержень между двумя точками */
function strut(p1: THREE.Vector3, p2: THREE.Vector3, r: number, m: THREE.Material = grey) {
  const len = p1.distanceTo(p2), o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), m);
  o.position.copy(p1).add(p2).multiplyScalar(0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p2.clone().sub(p1).normalize());
  return o;
}
const panel = (w: number, d: number, x: number, y: number, z: number, cols?: number, rows?: number) => box(w, 0.025, d, solarMat(cols, rows), x, y, z);
const hex = (r: number, h: number, m: THREE.Material, seg = 6) => { const o = cyl(r, h, m, 'z', 0, 0, 0, seg); return o; };

type Builder = (g: THREE.Group) => void;

// ---------- Материалы повышенной детализации ----------
function crinkleNormal(): THREE.CanvasTexture {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!, img = g.createImageData(S, S);
  const h = new Float32Array(S * S);
  for (let i = 0; i < 400; i++) {                         // случайные «складки» фольги
    const cx = Math.random() * S, cy = Math.random() * S, r = 6 + Math.random() * 26, a = (Math.random() - 0.5) * 2;
    for (let y = -r; y < r; y++) for (let x = -r; x < r; x++) {
      const d = Math.hypot(x, y) / r; if (d > 1) continue;
      h[(((cy + y) | 0) & (S - 1)) * S + (((cx + x) | 0) & (S - 1))] += a * (1 - d) * (1 - d);
    }
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = h[y * S + ((x + 1) & (S - 1))] - h[y * S + ((x - 1) & (S - 1))], dy = h[((y + 1) & (S - 1)) * S + x] - h[((y - 1) & (S - 1)) * S + x];
    const i = (y * S + x) * 4;
    img.data[i] = 128 - dx * 90; img.data[i + 1] = 128 - dy * 90; img.data[i + 2] = 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); return t;
}
const CRINKLE = crinkleNormal();
const foilGold = new THREE.MeshStandardMaterial({ color: 0xc99a35, metalness: 0.62, roughness: 0.4, normalMap: CRINKLE, normalScale: new THREE.Vector2(0.9, 0.9) });
const foilBlack = new THREE.MeshStandardMaterial({ color: 0x26262b, metalness: 0.4, roughness: 0.5, normalMap: CRINKLE, normalScale: new THREE.Vector2(0.7, 0.7) });
const foilSilver = new THREE.MeshStandardMaterial({ color: 0xcfd2d8, metalness: 0.6, roughness: 0.36, normalMap: CRINKLE, normalScale: new THREE.Vector2(0.6, 0.6) });

/** Панель солнечных батарей: рамка, сетка ячеек, обратная сторона. */
function solarWing(w: number, d: number, cols: number, rows: number): THREE.Group {
  const g = new THREE.Group();
  g.add(box(w, 0.022, d, solarMat(cols, rows)));
  g.add(box(w + 0.03, 0.012, 0.03, grey, 0, -0.012, d / 2), box(w + 0.03, 0.012, 0.03, grey, 0, -0.012, -d / 2));
  g.add(box(0.03, 0.012, d, grey, w / 2, -0.012, 0), box(0.03, 0.012, d, grey, -w / 2, -0.012, 0));
  g.add(box(w, 0.006, d, new THREE.MeshStandardMaterial({ color: 0x9a9aa0, metalness: 0.4, roughness: 0.7 }), 0, -0.016, 0));
  return g;
}
/** Блок двигателей (4 сопла). */
function thrusters(x: number, y: number, z: number) {
  const g = new THREE.Group();
  for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) g.add(cyl(0.018, 0.05, dark, 'z', x + dx * 0.04, y + dy * 0.04, z, 12, 0.03));
  return g;
}
/** Ребристая антенна: параболоид + рёбра + опоры облучателя. Раскрыв в сторону +Z. */
function ribbedDish(r: number, depth: number, z: number, x = 0, y = 0, tint: THREE.Material = white) {
  const g = new THREE.Group();
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 18; i++) { const t = i / 18; pts.push(new THREE.Vector2(t * r, depth * t * t)); }
  const bowl = new THREE.Mesh(new THREE.LatheGeometry(pts, 64), tint);
  bowl.rotation.x = Math.PI / 2; bowl.position.set(x, y, z); g.add(bowl);
  for (let k = 0; k < 12; k++) {                                   // радиальные рёбра на тыльной стороне
    const a = (k / 12) * Math.PI * 2, rib = box(r * 0.98, 0.012, 0.012, grey);
    rib.position.set(x + Math.cos(a) * r * 0.49, y + Math.sin(a) * r * 0.49, z - 0.012 + depth * 0.2);
    rib.rotation.z = a; g.add(rib);
  }
  const hz = z + depth + r * 0.55;
  for (const a of [0, 2.094, 4.188]) {                              // три опоры облучателя
    g.add(strut(new THREE.Vector3(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.92, z + depth * 0.85), new THREE.Vector3(x, y, hz), 0.007));
  }
  g.add(cyl(r * 0.07, r * 0.1, foilSilver, 'z', x, y, hz, 20));
  g.add(cyl(r * 0.035, r * 0.12, grey, 'z', x, y, hz + r * 0.08, 12));
  return g;
}
/** Круглая панель Lucy: диск с ячейками, обод, спицы с тыльной стороны, ступица. Плоскость XZ. */
function circArray(r: number): THREE.Group {
  const g = new THREE.Group();
  const face = solarMat(14, 14), back = new THREE.MeshStandardMaterial({ color: 0x9a9ca2, metalness: 0.4, roughness: 0.6 });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.03, 96, 1), [back, face, back]);
  g.add(disc);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.018, 8, 96), foilSilver); rim.rotation.x = Math.PI / 2; g.add(rim);
  for (let i = 0; i < 6; i++) { const sp = box(r * 2, 0.012, 0.012, grey, 0, -0.02, 0); sp.rotation.y = (i / 6) * Math.PI; g.add(sp); }
  g.add(cyl(0.07, 0.06, foilSilver, 'y', 0, -0.03, 0, 20));
  return g;
}
const dish = (r: number, depth: number, z: number, x = 0, y = 0) => ribbedDish(r, depth, z, x, y);
const camera = (x: number, y: number, z: number) => { const g = new THREE.Group(); g.add(cyl(0.05, 0.14, dark, 'z', x, y, z, 14), cyl(0.034, 0.03, black, 'z', x, y, z + 0.08, 14)); return g; };

const simple = (core: THREE.Material, dishR: number, wingW = 0): Builder => (g) => {
  g.add(box(0.5, 0.5, 0.6, core, 0, 0, -0.1), ribbedDish(dishR, dishR * 0.25, 0.25));
  if (wingW) for (const sg of [-1, 1]) g.add(at(solarWing(wingW, 1.1, 6, 8), (0.4 + wingW / 2) * sg, 0, -0.1));
};
const MODELS: Record<string, Builder> = {
  'voyager-1': simple(foilGold, 0.6), 'voyager-2': simple(foilGold, 0.6),
  'pioneer-10': simple(foilGold, 0.7), 'pioneer-11': simple(foilGold, 0.7),
  juno: simple(foilGold, 0.4, 1.0),
  'new-horizons': (g) => {
    // Корпус — пирамидальная призма (треугольное сечение), золотая фольга
    g.add(cyl(0.42, 0.62, foilGold, 'z', 0, 0, -0.1, 3));
    g.add(cyl(0.44, 0.04, grey, 'z', 0, 0, 0.22, 3), cyl(0.44, 0.04, grey, 'z', 0, 0, -0.42, 3));
    g.add(ribbedDish(0.62, 0.15, 0.26));                                       // антенна 2,1 м
    // РИТЭГ с рёбрами
    const rt = new THREE.Group();
    rt.add(cyl(0.065, 0.62, rtg, 'x'));
    for (let i = 0; i < 9; i++) rt.add(cyl(0.1, 0.012, rtg, 'x', -0.28 + i * 0.07, 0, 0, 16));
    rt.position.set(0.66, -0.05, -0.18); g.add(rt);
    g.add(box(0.28, 0.025, 0.025, grey, 0.4, -0.05, -0.18));
    // Приборы: LORRI, Ralph, звёздные датчики, SWAP, PEPSSI
    g.add(camera(-0.1, -0.18, 0.14), camera(0.12, -0.16, 0.12));
    g.add(box(0.2, 0.12, 0.16, dark, -0.12, -0.3, -0.12));
    g.add(cyl(0.05, 0.09, black, 'z', 0.18, -0.24, -0.2, 12));
    g.add(box(0.14, 0.14, 0.05, black, -0.28, 0.12, -0.28));                  // радиатор
    g.add(thrusters(-0.28, -0.1, -0.44), thrusters(0.2, 0.2, -0.44));
  },
  'parker-solar-probe': (g) => {
    g.add(cyl(0.7, 0.07, white, 'z', 0, 0, 0.12, 64));                          // щит TPS
    g.add(cyl(0.68, 0.02, black, 'z', 0, 0, 0.16, 64));
    g.add(cyl(0.2, 0.7, grey, 'z', 0, 0, -0.18, 24, 0.5));                       // конус за щитом
    g.add(box(0.28, 0.3, 0.5, foilSilver, 0, 0, -0.55));
    for (const s of [-1, 1]) g.add(at(solarWing(0.3, 0.12, 3, 2), 0.45 * s, 0, -0.3));
    g.add(dish(0.2, 0.05, -0.85));
    g.add(cyl(0.012, 1.1, grey, 'x', 0.6, 0.0, -0.55, 6));
  },
  'europa-clipper': (g) => {
    g.add(box(0.5, 0.55, 1.0, foilGold, 0, 0, -0.2));                          // корпус/двигательный модуль
    g.add(cyl(0.36, 0.22, foilGold, 'z', 0, 0, -0.82, 8));
    g.add(ribbedDish(0.56, 0.14, 0.46));                                       // антенна 3 м
    for (const s of [-1, 1]) {                                                 // два крыла по 5 панелей (≈22 м)
      g.add(box(0.6, 0.03, 0.03, grey, 0.6 * s, 0, -0.2));
      for (let i = 0; i < 5; i++) g.add(at(solarWing(0.95, 1.1, 8, 8), (1.65 + i * 1.02) * s, 0, -0.2));
    }
    for (const s of [-1, 1]) g.add(cyl(0.012, 3.4, grey, 'x', 0, 0.42 * s, -0.5, 6));   // антенны REASON
    g.add(cyl(0.015, 1.8, grey, 'y', 0, 1.2, -0.5, 6), box(0.1, 0.1, 0.1, dark, 0, 2.15, -0.5));    // магнитометр
    g.add(camera(0, -0.3, 0.2), box(0.22, 0.16, 0.22, dark, 0.28, -0.35, 0.1));
    g.add(thrusters(0.2, 0.25, -0.95), thrusters(-0.2, -0.25, -0.95));
  },
  juice: (g) => {
    g.add(box(0.7, 0.7, 1.2, foilGold, 0, 0, -0.2));
    g.add(box(0.72, 0.72, 0.04, foilBlack, 0, 0, 0.42));
    g.add(ribbedDish(0.62, 0.15, 0.6));                                        // антенна 2,5 м
    for (const s of [-1, 1]) {                                                 // два крыла по 5 панелей (≈27 м)
      g.add(box(0.5, 0.03, 0.03, grey, 0.55 * s, 0, -0.2));
      for (let i = 0; i < 5; i++) g.add(at(solarWing(0.85, 1.4, 7, 9), (1.3 + i * 0.9) * s, 0, -0.2));
    }
    g.add(cyl(0.012, 4.2, grey, 'y', 0.42, 2.2, 0.15, 6), cyl(0.012, 4.2, grey, 'y', -0.42, -2.2, 0.15, 6));   // антенна радара RIME
    g.add(cyl(0.015, 2.0, grey, 'z', 0, 0.45, -1.4, 6), box(0.1, 0.1, 0.1, dark, 0, 0.45, -2.4));              // штанга J-MAG
    g.add(camera(-0.2, -0.45, 0.3), box(0.24, 0.2, 0.2, dark, 0.3, -0.45, 0.2), thrusters(0.25, 0.25, -0.82));
  },
  lucy: (g) => {
    g.add(box(0.56, 0.56, 0.9, foilGold, 0, 0, -0.1));                           // шина в золотой фольге
    g.add(box(0.58, 0.58, 0.05, foilBlack, 0, 0, 0.36), box(0.5, 0.04, 0.5, grey, 0, 0.3, -0.25));
    g.add(box(0.02, 0.44, 0.6, foilBlack, 0.29, 0, -0.2), box(0.02, 0.44, 0.6, foilBlack, -0.29, 0, -0.2));   // радиаторы
    g.add(ribbedDish(0.52, 0.13, 0.4));                                            // антенна 2,74 м
    for (const s of [-1, 1]) {                                                     // два круглых крыла ≈7,3 м
      g.add(box(0.5, 0.03, 0.03, grey, 0.5 * s, 0, -0.1), cyl(0.04, 0.12, dark, 'x', 0.34 * s, 0, -0.1, 12));
      g.add(at(circArray(0.9), 1.45 * s, 0, -0.1));
    }
    g.add(box(0.34, 0.26, 0.3, dark, 0, -0.46, 0.12), cyl(0.07, 0.22, black, 'z', 0.12, -0.42, 0.3, 14), cyl(0.045, 0.16, black, 'z', -0.1, -0.44, 0.28, 12));   // L'LORRI, L'Ralph, L'TES
    g.add(camera(0.18, 0.32, 0.18), camera(-0.18, 0.32, 0.18), thrusters(0.2, 0.2, -0.58), thrusters(-0.22, -0.2, -0.58));
  },
  psyche: (g) => {
    g.add(box(0.55, 0.55, 0.95, foilGold, 0, 0, -0.1));
    g.add(ribbedDish(0.5, 0.12, 0.48));
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {                      // крестообразные крылья: 4 × 3 панели
      g.add(box(0.5, 0.03, 0.03, grey, 0.35 * sx, 0.2 * sy, -0.1));
      for (let i = 0; i < 3; i++) g.add(at(solarWing(0.85, 0.9, 6, 7), (1.0 + i * 0.9) * sx, 0.2 * sy, -0.1));
    }
    for (let i = 0; i < 4; i++) g.add(cyl(0.12, 0.08, foilSilver, 'z', ((i % 2) - 0.5) * 0.3, (Math.floor(i / 2) - 0.5) * 0.3, -0.62, 20));   // ионные двигатели
    g.add(cyl(0.012, 2.0, grey, 'y', 0, -1.1, -0.2, 6), box(0.1, 0.1, 0.1, dark, 0, -2.1, -0.2));
    g.add(camera(0.1, -0.3, 0.3), camera(-0.12, -0.3, 0.3));
  },
  spherex: (g) => {
    // Три концентрических конических фотонных экрана SPHEREx (ось +Z — апертура телескопа в глубокий космос)
    const shieldMatOuter = new THREE.MeshStandardMaterial({ color: 0xe3e6ed, metalness: 0.55, roughness: 0.38, side: THREE.DoubleSide, normalMap: CRINKLE, normalScale: new THREE.Vector2(0.45, 0.45) });
    const shieldMatInner = new THREE.MeshStandardMaterial({ color: 0xc8ccd6, metalness: 0.72, roughness: 0.28, side: THREE.DoubleSide });
    const baffleMat = new THREE.MeshStandardMaterial({ color: 0x161922, metalness: 0.2, roughness: 0.88, side: THREE.DoubleSide });
    const mirrorMat = new THREE.MeshPhysicalMaterial({ color: 0xdff6ff, metalness: 0.95, roughness: 0.08, clearcoat: 1.0 });

    const cones: [number, number, number, number, THREE.Material][] = [
      [0.86, 0.44, 0.68, 0.12, shieldMatOuter], // внешний экран (3.2 м)
      [0.68, 0.35, 0.62, 0.16, shieldMatInner], // средний экран
      [0.50, 0.27, 0.56, 0.20, shieldMatInner], // внутренний экран
    ];
    for (const [rTop, rBot, h, zPos, mat] of cones) {
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, 48, 1, true), mat);
      cone.rotation.x = Math.PI / 2;
      cone.position.z = zPos;
      g.add(cone);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(rTop, 0.014, 8, 48), foilSilver);
      rim.position.z = zPos + h / 2;
      g.add(rim);
    }

    // 3-ступенчатый V-образный пассивный криогенный радиатор под экранами
    for (let i = 0; i < 3; i++) {
      const rad = new THREE.Mesh(new THREE.CylinderGeometry(0.42 - i * 0.06, 0.26 - i * 0.03, 0.07, 36, 1, true), foilSilver);
      rad.rotation.x = Math.PI / 2;
      rad.position.z = -0.20 - i * 0.09;
      g.add(rad);
    }

    // Оптическая труба телескопа TMA (20 см) и главное зеркало
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.19, 0.54, 28, 1, true), baffleMat);
    tube.rotation.x = Math.PI / 2;
    tube.position.z = 0.22;
    g.add(tube);
    g.add(cyl(0.18, 0.03, mirrorMat, 'z', 0, 0, -0.02, 28));

    // Шестиугольный корпус космического аппарата (шина в золотой фольге)
    g.add(cyl(0.32, 0.42, foilGold, 'z', 0, 0, -0.56, 6));
    g.add(cyl(0.34, 0.04, grey, 'z', 0, 0, -0.35, 6), cyl(0.34, 0.04, grey, 'z', 0, 0, -0.77, 6));

    // Фиксированная солнечная панель (2.67 x 1.02 м) + крепёжная ферма
    g.add(box(0.36, 0.03, 0.03, grey, 0.38, 0, -0.60));
    const wing = solarWing(0.95, 0.42, 8, 4);
    wing.rotation.x = Math.PI / 2;
    wing.position.set(0.92, 0, -0.60);
    g.add(wing);

    // Антенны связи Ka/S-диапазона и звёздные датчики
    g.add(ribbedDish(0.18, 0.04, -0.82, -0.18, -0.15));
    g.add(camera(0.22, 0.24, -0.45), camera(-0.22, 0.24, -0.45));
    g.add(thrusters(0, 0, -0.80));

    // Конус ИК-обзора телескопа SPHEREx (11.3° × 3.5°): визуализирует сканирование неба
    const fovGroup = new THREE.Group();
    fovGroup.name = 'spherex-fov';
    const fovLen = 3.2;
    const hw = Math.tan((11.3 * Math.PI) / 360) * fovLen;
    const hh = Math.tan((3.5 * Math.PI) / 360) * fovLen;
    const apex = new THREE.Vector3(0, 0, 0.42);
    const corners = [
      new THREE.Vector3(-hw, -hh, 0.42 + fovLen),
      new THREE.Vector3(hw, -hh, 0.42 + fovLen),
      new THREE.Vector3(hw, hh, 0.42 + fovLen),
      new THREE.Vector3(-hw, hh, 0.42 + fovLen),
    ];
    const linePts: THREE.Vector3[] = [];
    for (let i = 0; i < 4; i++) {
      linePts.push(apex, corners[i], corners[i], corners[(i + 1) % 4]);
    }
    fovGroup.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(linePts),
      new THREE.LineBasicMaterial({ color: 0x5be4d2, transparent: true, opacity: 0.65, depthWrite: false })
    ));
    const beamPos = new Float32Array([
      apex.x, apex.y, apex.z, corners[0].x, corners[0].y, corners[0].z, corners[1].x, corners[1].y, corners[1].z,
      apex.x, apex.y, apex.z, corners[1].x, corners[1].y, corners[1].z, corners[2].x, corners[2].y, corners[2].z,
      apex.x, apex.y, apex.z, corners[2].x, corners[2].y, corners[2].z, corners[3].x, corners[3].y, corners[3].z,
      apex.x, apex.y, apex.z, corners[3].x, corners[3].y, corners[3].z, corners[0].x, corners[0].y, corners[0].z,
    ]);
    const beamGeo = new THREE.BufferGeometry();
    beamGeo.setAttribute('position', new THREE.BufferAttribute(beamPos, 3));
    fovGroup.add(new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
      color: 0x5be4d2, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    })));
    g.add(fovGroup);
  },
};

let ENV: THREE.Texture | null = null;
/** Карта окружения для бликов на металле и фольге. */
export function setSpacecraftEnv(t: THREE.Texture) { ENV = t; }
export function getSpacecraftEnv() { return ENV; }

/** Создаёт модель аппарата (обобщённую, если id неизвестен). */
export function buildSpacecraftModel(id: string): THREE.Group {
  const g = new THREE.Group();
  (MODELS[id] ?? ((m: THREE.Group) => { m.add(box(0.4, 0.4, 0.6, gold)); m.add(dish(0.4, 0.1, 0.35)); m.add(panel(1, 0.5, 1.0, 0, 0), panel(1, 0.5, -1.0, 0, 0)); }))(g);
  g.scale.setScalar(MODEL_SIZE);
  g.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (m && ENV && 'envMapIntensity' in m) { m.envMap = ENV; m.envMapIntensity = 0.9; m.needsUpdate = true; }
  });
  return g;
}
/** Куда «смотрит» аппарат: Parker — щитом на Солнце, остальные — антенной на Землю. */
export const aimsAtSun = (id: string) => id === 'parker-solar-probe';

// ---------- Настоящие 3D-модели NASA (public/models/*.glb, NASA 3D Resources, без авторских прав) ----------
/** file — имя в public/models, size — размер модели в «единицах модели» (1 ед. ≈ 200 км на экране),
 *  rot — поворот, чтобы ось +Z смотрела туда, куда «смотрит» аппарат (антенна на Землю / щит на Солнце). */
const GLB: Record<string, { file: string; size: number; rot: [number, number, number] }> = {
  'voyager-1': { file: 'voyager.glb', size: 3.6, rot: [Math.PI / 2, 0, 0] },
  'voyager-2': { file: 'voyager.glb', size: 3.6, rot: [Math.PI / 2, 0, 0] },
  'pioneer-10': { file: 'pioneer.glb', size: 2.8, rot: [0, Math.PI, 0] },
  'pioneer-11': { file: 'pioneer.glb', size: 2.8, rot: [0, Math.PI, 0] },
  'parker-solar-probe': { file: 'parker.glb', size: 2.4, rot: [0, Math.PI, 0] },
  juno: { file: 'juno.glb', size: 4.4, rot: [Math.PI / 2, 0, 0] },
  'new-horizons': { file: 'nh', size: 3.4, rot: [Math.PI / 2, 0, 0] },   // STL-детали NASA 3D Printing, собираются в loadNH()
  // public/models/sr — сжатые (meshopt) модели из проекта Space Radar (MIT): Europa Clipper — собственная модель NASA/JPL
  // (public domain); Lucy, Psyche, JUICE построены по опубликованным размерам (см. public/models/CREDITS.md)
  'europa-clipper': { file: 'sr/europa-clipper.glb', size: 5.6, rot: [0, 0, 0] },
  juice: { file: 'sr/juice.glb', size: 5.0, rot: [0, 0, 0] },
  lucy: { file: 'sr/lucy.glb', size: 4.2, rot: [0, 0, 0] },
  psyche: { file: 'sr/psyche.glb', size: 4.6, rot: [0, 0, 0] },
};

let gltf: GLTFLoader | null = null;
export function gltfLoader() { return loader(); }
const glbCache = new Map<string, Promise<THREE.Object3D>>();
function loader() {
  if (!gltf) {
    const draco = new DRACOLoader();
    draco.setDecoderPath('draco/');
    gltf = new GLTFLoader();
    gltf.setDRACOLoader(draco);
    gltf.setMeshoptDecoder(MeshoptDecoder);
  }
  return gltf;
}

/** New Horizons из трёх STL-деталей NASA (тело, антенна, РИТЭГ). Единица STL ≈ 0,5 м; ось антенны — +Y. */
async function loadNH(): Promise<THREE.Object3D> {
  const stl = new STLLoader();
  const load = async (name: string, mat: THREE.Material) => {
    let geo = await stl.loadAsync(`models/nh/${name}.stl`);
    geo = toCreasedNormals(geo, 0.6);
    const pos = geo.attributes.position, uv = new Float32Array(pos.count * 2);   // у STL нет UV — планарная проекция для фактуры фольги
    for (let i = 0; i < pos.count; i++) { uv[i * 2] = (pos.getX(i) + pos.getZ(i)) * 0.35; uv[i * 2 + 1] = pos.getY(i) * 0.35; }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return new THREE.Mesh(geo, mat);
  };
  const dishMat = new THREE.MeshStandardMaterial({ color: 0xdedbd2, metalness: 0.25, roughness: 0.5, side: THREE.DoubleSide });
  const rtgMat = new THREE.MeshStandardMaterial({ color: 0x55575c, metalness: 0.7, roughness: 0.4 });
  const [body, antenna, rtg] = await Promise.all([load('body', foilGold.clone()), load('antenna', dishMat), load('rtg', rtgMat)]);
  const g = new THREE.Group();
  g.add(body);
  antenna.position.y = 2.3; g.add(antenna);                                   // тарелка на верхней грани
  rtg.rotation.z = -Math.PI / 2; rtg.position.set(2.45, 1.1, 0.15); g.add(rtg); // РИТЭГ на штанге вбок
  const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 10), grey); mount.rotation.z = Math.PI / 2; mount.position.set(2.5, 1.1, 0.15); g.add(mount);
  return g;
}

/** Центр по площади треугольников — модель крутится вокруг корпуса, а не вокруг длинной штанги. */
function areaCentroid(root: THREE.Object3D): THREE.Vector3 {
  root.updateMatrixWorld(true);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  const acc = new THREE.Vector3();
  let total = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const pos = m.geometry.attributes.position, idx = m.geometry.index;
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i + 2 < n; i += 3) {
      const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
      a.fromBufferAttribute(pos, ia).applyMatrix4(m.matrixWorld);
      b.fromBufferAttribute(pos, ib).applyMatrix4(m.matrixWorld);
      c.fromBufferAttribute(pos, ic).applyMatrix4(m.matrixWorld);
      const area = e1.subVectors(b, a).cross(e2.subVectors(c, a)).length() / 2;
      acc.x += ((a.x + b.x + c.x) / 3) * area; acc.y += ((a.y + b.y + c.y) / 3) * area; acc.z += ((a.z + b.z + c.z) / 3) * area;
      total += area;
    }
  });
  return total > 0 ? acc.divideScalar(total) : new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3());
}

/** Загружает модель NASA для аппарата; null, если для него нет файла (остаётся процедурная модель). */
export async function loadSpacecraftModel(id: string): Promise<THREE.Group | null> {
  const cfg = GLB[id];
  if (!cfg) return null;
  let p = glbCache.get(cfg.file);
  if (!p) { p = cfg.file === 'nh' ? loadNH() : loader().loadAsync(`models/${cfg.file}`).then((g) => g.scene); glbCache.set(cfg.file, p); }
  let src: THREE.Object3D;
  try { src = await p; } catch { return null; }
  const model = src.clone(true);
  const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3());
  const center = areaCentroid(model);
  const pivot = new THREE.Group();            // сдвиг центра в начало координат
  model.position.sub(center);
  pivot.add(model);
  const orient = new THREE.Group();           // поворот «антенной» в +Z
  orient.rotation.set(...cfg.rot);
  orient.add(pivot);
  const root = new THREE.Group();
  root.add(orient);
  root.scale.setScalar((cfg.size / Math.max(size.x, size.y, size.z)) * MODEL_SIZE);
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (!m || !('envMapIntensity' in m)) return;
    m.envMap = ENV; m.color?.multiplyScalar(0.82); m.envMapIntensity = 0.5; m.metalness = Math.min(m.metalness ?? 0, 0.55);
    m.side = THREE.DoubleSide; m.needsUpdate = true;
  });
  return root;
}

/** Радиус охватывающей сферы модели в единицах сцены (для расстояния камеры). */
export function modelRadius(g: THREE.Object3D): number {
  const size = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
  return Math.max(size.x, size.y, size.z) / 2;
}
