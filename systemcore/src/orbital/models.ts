// 3D-модели для объектов на орбите Земли и малых тел.
// Настоящие модели: NASA 3D Resources (public domain) и Space Radar (MIT, построены по опубликованным размерам) —
// см. public/models/CREDITS.md. Если для объекта нет своей модели, строится условная: обломок — рваный
// фрагмент обшивки, неизвестный аппарат — типовая платформа; в интерфейсе это помечается.
import * as THREE from 'three';
import { gltfLoader, getSpacecraftEnv } from '../spacecraft';
import { OrbitalObject, CLS_DEBRIS, CLS_ROCKET } from './catalog';

export interface ModelPick { file: string | null; generic: boolean; typical?: boolean; note: string }

const BY_NORAD: Record<number, string> = {
  25544: 'iss.glb', 48274: 'tiangong.glb', 20580: 'hubble.glb', 43435: 'tess.glb', 54234: 'noaa21.glb', 43013: 'noaa21.glb',
  25994: 'terra.glb', 39084: 'landsat8.glb', 49260: 'landsat8.glb', 40697: 'sentinel-2.glb', 42063: 'sentinel-2.glb',
};
const BY_NAME: [RegExp, string, string][] = [
  [/^ISS\b/, 'iss.glb', 'NASA 3D Resources'],
  [/^CSS \(|TIANHE|WENTIAN|MENGTIAN/, 'tiangong.glb', 'Space Radar'],
  [/^STARLINK/, 'starlink-v1.glb', 'Starlink v1 (условно для всех поколений)'],
  [/^ONEWEB/, 'oneweb.glb', 'Space Radar'],
  [/^(GPS|NAVSTAR)/, 'gps-iii.glb', 'GPS III (условно для всех блоков)'],
  [/^GOES/, 'goes.glb', 'NASA 3D Resources'],
  [/^TDRS/, 'tdrs.glb', 'NASA 3D Resources'],
  [/^TERRA$/, 'terra.glb', 'NASA 3D Resources'],
  [/^LANDSAT/, 'landsat8.glb', 'NASA 3D Resources'],
  [/^SENTINEL-2/, 'sentinel-2.glb', 'Space Radar'],
  [/^SOYUZ-MS/, 'soyuz-ms.glb', 'Space Radar'],
  [/^PROGRESS-MS/, 'progress-ms.glb', 'Space Radar'],
  [/^(CREW )?DRAGON|^DRAGON/, 'dragon-crew.glb', 'Space Radar'],
  [/^HST$/, 'hubble.glb', 'NASA 3D Resources'],
  [/^NOAA 2[01]/, 'noaa21.glb', 'Space Radar'],
  [/FALCON 9 R\/B/, 'falcon9-upper.glb', 'Space Radar'],
  [/DELTA 2 R\/B|DELTA II R\/B/, 'delta2-stage.glb', 'Space Radar'],
  [/ATLAS 5 CENTAUR R\/B/, 'atlas5-centaur.glb', 'Space Radar'],
  [/CENTAUR R\/B/, 'centaur-d.glb', 'Space Radar'],
  [/H-2A R\/B|H-IIA R\/B/, 'h2a-stage2.glb', 'Space Radar'],
  [/SL-8 R\/B/, 'kosmos3m-stage2.glb', 'Space Radar (Космос-3М)'],
];

export function modelFor(o: OrbitalObject): ModelPick {
  if (BY_NORAD[o.norad]) return { file: BY_NORAD[o.norad], generic: false, note: 'модель аппарата' };
  const hit = BY_NAME.find(([re]) => re.test(o.name));
  if (hit) return { file: hit[1], generic: false, typical: /условно/.test(hit[2]), note: hit[2] };
  if (o.cls === CLS_DEBRIS) return { file: null, generic: true, note: 'условный фрагмент: форма конкретного обломка неизвестна' };
  if (o.cls === CLS_ROCKET) return { file: null, generic: true, note: 'условная ступень: модели этого типа нет' };
  return { file: null, generic: true, note: 'условная платформа: модели этого аппарата нет' };
}

const cache = new Map<string, Promise<THREE.Object3D>>();
function loadFile(file: string) {
  let p = cache.get(file);
  if (!p) { p = gltfLoader().loadAsync(`models/sr/${file}`).then((g) => g.scene); cache.set(file, p); }
  return p;
}

const metal = new THREE.MeshStandardMaterial({ color: 0xa8aeb4, metalness: 0.8, roughness: 0.32 });
const foil = new THREE.MeshStandardMaterial({ color: 0xc8a250, metalness: 0.85, roughness: 0.3 });
const panel = new THREE.MeshStandardMaterial({ color: 0x1c2a4a, metalness: 0.4, roughness: 0.35 });
const darkMetal = new THREE.MeshStandardMaterial({ color: 0x4a4f56, metalness: 0.9, roughness: 0.4 });
const burnedMetal = new THREE.MeshStandardMaterial({ color: 0x6b5a3a, metalness: 0.6, roughness: 0.75 });
const whiteFoam = new THREE.MeshStandardMaterial({ color: 0xd0ccc0, metalness: 0.1, roughness: 0.9 });

/** Псевдослучайный генератор на основе seed */
function mkRng(seed: number) {
  let s = seed | 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) | 0; return (s >>> 0) / 0xFFFFFFFF; };
}

/** Тип обломка по seed */
function debrisType(seed: number): number { return seed % 7; }

/** Рваный фрагмент обшивки (обожжённый металл/фольга) */
function shardPanel(rnd: () => number) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++)
    p.setXYZ(i, p.getX(i) * (0.6 + rnd() * 0.9), p.getY(i) * (0.08 + rnd() * 0.18), p.getZ(i) * (0.5 + rnd() * 0.8));
  g.computeVertexNormals();
  const mat = rnd() > 0.6 ? foil : (rnd() > 0.5 ? burnedMetal : metal);
  const m = new THREE.Mesh(g, mat);
  m.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6);
  const grp = new THREE.Group(); grp.add(m);
  return grp;
}

/** Обломок солнечной батареи — деформированная тонкая пластина */
function shardSolarPanel(rnd: () => number) {
  const g = new THREE.BoxGeometry(1.8, 0.04, 0.9, 4, 1, 3);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) + (rnd() - 0.5) * 0.25, p.getY(i) + (rnd() - 0.5) * 0.08, p.getZ(i) + (rnd() - 0.5) * 0.15);
  }
  g.computeVertexNormals();
  const mat = rnd() > 0.4 ? panel : darkMetal;
  const m = new THREE.Mesh(g, mat);
  m.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6);
  const grp = new THREE.Group(); grp.add(m);
  return grp;
}

/** Фрагмент ракетной ступени — цилиндрический кусок корпуса */
function shardCylinder(rnd: () => number) {
  const g = new THREE.CylinderGeometry(0.3 + rnd() * 0.3, 0.2 + rnd() * 0.3, 1.2 + rnd() * 0.8, 12, 1, true);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++)
    p.setXYZ(i, p.getX(i) * (0.8 + rnd() * 0.4), p.getY(i), p.getZ(i) * (0.8 + rnd() * 0.4));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, rnd() > 0.5 ? metal : burnedMetal);
  m.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6);
  const grp = new THREE.Group(); grp.add(m);
  return grp;
}

/** Маленький болт/гайка */
function shardBolt(rnd: () => number) {
  const g = new THREE.CylinderGeometry(0.12, 0.12, 0.6, 6);
  const washer = new THREE.TorusGeometry(0.18, 0.06, 6, 8);
  const m1 = new THREE.Mesh(g, metal);
  const m2 = new THREE.Mesh(washer, metal);
  m2.rotation.x = Math.PI / 2;
  m1.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6);
  const grp = new THREE.Group(); grp.add(m1, m2);
  return grp;
}

/** Обломок теплозащиты — рваный кусок пены */
function shardInsulation(rnd: () => number) {
  const g = new THREE.IcosahedronGeometry(0.8, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++)
    p.setXYZ(i, p.getX(i) * (0.5 + rnd() * 1.2), p.getY(i) * (0.3 + rnd() * 0.8), p.getZ(i) * (0.5 + rnd() * 1.0));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, rnd() > 0.5 ? whiteFoam : burnedMetal);
  m.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6);
  const grp = new THREE.Group(); grp.add(m);
  return grp;
}

/** Обломок антенны */
function shardAntenna(rnd: () => number) {
  const grp = new THREE.Group();
  // Прут
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5 + rnd() * 0.8, 6), metal);
  rod.rotation.z = rnd() * 0.5;
  grp.add(rod);
  // Скрученный конец
  const end = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), darkMetal);
  end.position.y = 0.9; grp.add(end);
  grp.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6);
  return grp;
}

/** Осколок стекла оптики */
function shardOptic(rnd: () => number) {
  const g = new THREE.IcosahedronGeometry(0.6, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++)
    p.setXYZ(i, p.getX(i) * (0.4 + rnd() * 0.6), p.getY(i) * (0.1 + rnd() * 0.15), p.getZ(i) * (0.4 + rnd() * 0.6));
  g.computeVertexNormals();
  const mirrorMat = new THREE.MeshStandardMaterial({ color: 0xd0e8f0, metalness: 0.95, roughness: 0.05 });
  const m = new THREE.Mesh(g, mirrorMat);
  m.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6);
  const grp = new THREE.Group(); grp.add(m);
  return grp;
}

/** Выбрать модель обломка по seed — 7 реалистичных вариантов */
function shard(seed: number) {
  const rnd = mkRng(seed);
  switch (debrisType(seed)) {
    case 0: return shardPanel(rnd);
    case 1: return shardSolarPanel(rnd);
    case 2: return shardCylinder(rnd);
    case 3: return shardBolt(rnd);
    case 4: return shardInsulation(rnd);
    case 5: return shardAntenna(rnd);
    default: return shardOptic(rnd);
  }
}

function genericBus() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1.3), foil); g.add(body);
  for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.03, 0.9), panel); w.position.x = sx * 1.7; g.add(w);
  }
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.05, 0.2, 20), metal); dish.rotation.x = Math.PI / 2; dish.position.z = 0.8; g.add(dish);
  return g;
}
function genericStage() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 3, 24), metal); body.rotation.z = Math.PI / 2; g.add(body);
  const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.7, 20, 1, true), metal); nozzle.rotation.z = -Math.PI / 2; nozzle.position.x = 1.8; g.add(nozzle);
  return g;
}

/** Модель, нормированная так, что её наибольший размер = sizeUnits (единицы сцены). */
export async function buildOrbitalModel(o: OrbitalObject, sizeUnits: number): Promise<{ obj: THREE.Group; pick: ModelPick }> {
  const pick = modelFor(o);
  let src: THREE.Object3D;
  if (pick.file) {
    try { src = (await loadFile(pick.file)).clone(true); } catch { src = o.cls === CLS_DEBRIS ? shard(o.norad) : genericBus(); pick.generic = true; }
  } else src = o.cls === CLS_DEBRIS ? shard(o.norad) : o.cls === CLS_ROCKET ? genericStage() : genericBus();
  return { obj: normalize(src, sizeUnits), pick };
}

export async function buildShapeModel(file: string, sizeUnits: number): Promise<THREE.Group | null> {
  try {
    const g = normalize((await loadFile(file)).clone(true), sizeUnits);
    // у моделей форм часто нет цвета: тёмный реголит (альбедо малых тел ~0,04–0,25), без металлического блеска
    const rock = new THREE.MeshStandardMaterial({ color: file.includes('vesta') || file.includes('ceres') ? 0x9a938a : 0x77716a, roughness: 1, metalness: 0 });
    g.traverse((n) => { const m = n as THREE.Mesh; if (m.isMesh) { const old = m.material as THREE.MeshStandardMaterial; if (old.map) { old.metalness = 0; old.roughness = 1; old.envMap = null; } else m.material = rock; } });
    return g;
  } catch { return null; }
}

function normalize(src: THREE.Object3D, sizeUnits: number) {
  const box = new THREE.Box3().setFromObject(src), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  src.position.sub(c);
  const root = new THREE.Group();
  root.add(src);
  root.scale.setScalar(sizeUnits / Math.max(size.x, size.y, size.z, 1e-9));
  root.traverse((n) => {
    const m = (n as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (m && 'side' in m) {
      m.side = THREE.DoubleSide;
      if ('envMap' in m) { m.envMap = getSpacecraftEnv(); m.envMapIntensity = 0.7; if (m.metalness !== undefined) m.metalness = Math.min(m.metalness, 0.6); }
      m.needsUpdate = true;
    }
  });
  return root;
}
