import * as THREE from 'three';

export type SurveyBandId = 'color' | 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6';

interface Palette {
  bg: [number, number, number];
  plane: [number, number, number];
  core: [number, number, number];
  hot: [number, number, number];
  deepField: string;
}

const BAND_PALETTES: Record<SurveyBandId, Palette> = {
  color: { bg: [6, 8, 18], plane: [215, 110, 48], core: [255, 220, 140], hot: [110, 210, 255], deepField: '#b388ff' },
  D1:    { bg: [4, 10, 24], plane: [95, 165, 255], core: [220, 242, 255], hot: [140, 220, 255], deepField: '#6ec6ff' },
  D2:    { bg: [4, 16, 20], plane: [65, 210, 195], core: [210, 255, 245], hot: [120, 255, 220], deepField: '#5be4d2' },
  D3:    { bg: [6, 18, 12], plane: [110, 225, 130], core: [230, 255, 190], hot: [170, 255, 130], deepField: '#8ef59d' },
  D4:    { bg: [18, 12, 5], plane: [245, 185, 70], core: [255, 240, 180], hot: [255, 210, 90], deepField: '#ffd36b' },
  D5:    { bg: [20, 8, 5], plane: [245, 120, 55], core: [255, 200, 140], hot: [255, 145, 75], deepField: '#ff9654' },
  D6:    { bg: [20, 5, 12], plane: [235, 70, 115], core: [255, 185, 205], hot: [255, 110, 165], deepField: '#ff5d7a' },
};

const texCache = new Map<SurveyBandId, THREE.CanvasTexture>();

function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967295;
  };
}

/** Генерирует 360° ИК-карту всего неба SPHEREx в выбранном диапазоне (0.75–5.00 мкм). */
function buildAllSkyTexture(band: SurveyBandId): THREE.CanvasTexture {
  const hit = texCache.get(band);
  if (hit) return hit;

  const pal = BAND_PALETTES[band];
  const W = 2048, H = 1024;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = `rgb(${pal.bg[0]},${pal.bg[1]},${pal.bg[2]})`;
  g.fillRect(0, 0, W, H);

  const rnd = prng(42 + band.charCodeAt(0) * 13);
  g.globalCompositeOperation = 'lighter';

  // Мягкое зодиакальное ИК-свечение вдоль эклиптики (особенно заметно в D4–D6)
  const zStrength = band === 'D5' || band === 'D6' ? 0.13 : band === 'D4' ? 0.09 : 0.04;
  const zGrad = g.createLinearGradient(0, H * 0.22, 0, H * 0.78);
  zGrad.addColorStop(0, 'rgba(0,0,0,0)');
  zGrad.addColorStop(0.5, `rgba(${pal.plane[0]},${pal.plane[1]},${pal.plane[2]},${zStrength})`);
  zGrad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = zGrad;
  g.fillRect(0, H * 0.2, W, H * 0.6);

  // Галактическая плоскость Млечного Пути (наклонена на ~60.2° к эклиптике)
  const blob = (x: number, y: number, r: number, rgb: [number, number, number], a: number) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`);
    gr.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  };

  for (let i = 0; i < 720; i++) {
    const u = rnd();
    const lon = u * Math.PI * 2;
    const galLat = Math.sin(lon - 1.4) * 1.05 + (rnd() - 0.5) * 0.26;
    const x = u * W;
    const y = (0.5 - galLat / Math.PI) * H;
    const centerDist = Math.abs(Math.sin((lon - 4.65) * 0.5));
    const isCore = centerDist < 0.25;
    const rgb = isCore ? pal.core : pal.plane;
    const rad = (isCore ? 60 : 32) + rnd() * 52;
    const alpha = (isCore ? 0.13 : 0.05) * (0.6 + rnd() * 0.55);
    blob(x, y, rad, rgb, alpha);
    if (x < rad) blob(x + W, y, rad, rgb, alpha);
    if (x > W - rad) blob(x - W, y, rad, rgb, alpha);
  }

  // Точечные круглые ИК-источники (без квадратных артефактов при увеличении)
  for (let i = 0; i < 3600; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const bright = Math.pow(rnd(), 3.6);
    const r = 0.55 + bright * 1.45;
    const rgb = rnd() > 0.35 ? pal.hot : pal.core;
    g.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.18 + bright * 0.72})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  // Тонкие линии Глубоких полей SPHEREx (Северный и Южный полюсы эклиптики)
  g.globalCompositeOperation = 'source-over';
  g.strokeStyle = pal.deepField;
  g.globalAlpha = 0.45;
  g.lineWidth = 1.5;
  g.setLineDash([8, 8]);
  for (const py of [H * 0.055, H * 0.945]) {
    g.beginPath();
    g.moveTo(0, py);
    g.lineTo(W, py);
    g.stroke();
  }
  g.setLineDash([]);
  g.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  texCache.set(band, tex);
  return tex;
}

export interface SpherexSkyOverlay {
  group: THREE.Group;
  setEnabled: (on: boolean) => void;
  isEnabled: () => boolean;
  setBand: (band: SurveyBandId) => void;
  getBand: () => SurveyBandId;
  update: (cameraPos: THREE.Vector3, date: Date, galaxyFade: number) => void;
}

export function createSpherexSkyOverlay(scene: THREE.Scene): SpherexSkyOverlay {
  const group = new THREE.Group();
  let enabled = false;
  let band: SurveyBandId = 'color';

  const SKY_R = 7.5e5;
  const skyGeo = new THREE.SphereGeometry(SKY_R, 64, 32);
  const skyMat = new THREE.MeshBasicMaterial({
    map: buildAllSkyTexture('color'),
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  skyMesh.renderOrder = -2;
  group.add(skyMesh);

  // Большой круг активного сканирования SPHEREx (полоса 11.3° перпендикулярно Солнцу)
  const ringPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 128; i++) {
    const a = (i / 128) * Math.PI * 2;
    ringPts.push(new THREE.Vector3(0, Math.sin(a) * SKY_R * 0.96, Math.cos(a) * SKY_R * 0.96));
  }
  const scanRing = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(ringPts),
    new THREE.LineBasicMaterial({ color: 0x5be4d2, transparent: true, opacity: 0.45, depthWrite: false })
  );
  group.add(scanRing);

  // Кольца SPHEREx Deep Fields у северного и южного полюсов эклиптики
  const deepMat = new THREE.LineBasicMaterial({ color: 0xb388ff, transparent: true, opacity: 0.55, depthWrite: false });
  for (const sign of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    const lat = sign * (82 * Math.PI) / 180;
    const r = Math.cos(lat) * SKY_R * 0.95;
    const y = Math.sin(lat) * SKY_R * 0.95;
    for (let i = 0; i <= 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
    }
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), deepMat));
  }

  group.visible = false;
  scene.add(group);

  return {
    group,
    setEnabled(on: boolean) {
      enabled = on;
      group.visible = on;
    },
    isEnabled: () => enabled,
    setBand(next: SurveyBandId) {
      band = next;
      skyMat.map = buildAllSkyTexture(next);
      skyMat.needsUpdate = true;
      (scanRing.material as THREE.LineBasicMaterial).color.set(BAND_PALETTES[next].deepField);
    },
    getBand: () => band,
    update(cameraPos: THREE.Vector3, date: Date, galaxyFade: number) {
      group.visible = enabled && galaxyFade < 0.85;
      if (!group.visible) return;
      group.position.copy(cameraPos);
      // Полоса сканирования SPHEREx поворачивается на ~360° за год, оставаясь ~90° к Солнцу
      const dayOfYear = (date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86400e3;
      scanRing.rotation.y = (dayOfYear / 365.256) * Math.PI * 2;
      skyMat.opacity = 0.78 * Math.max(0, 1 - galaxyFade * 1.4);
    },
  };
}
