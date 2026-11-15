import * as THREE from 'three';

/**
 * Млечный Путь: процедурная спиральная галактика (без внешних текстур).
 * Масштаб НЕ реальный (иначе числа не влезут в float): радиус диска условно 1,5e7 единиц сцены.
 * Солнце лежит в начале координат группы, остальная галактика смещена так, чтобы оно было на ~0,53 радиуса от центра.
 */
export const GALAXY_RADIUS = 1.5e7;
const SUN_R = 0.53;                 // расстояние Солнца от центра в долях радиуса (~26 тыс. из ~50 тыс. св. лет)
const ARMS = 4, PITCH = 0.28;       // число рукавов и закрутка спирали

function rand() { return Math.random(); }
function gauss() { return (rand() + rand() + rand() + rand() - 2) / 2; } // ≈ N(0, 0.58), в пределах ±1

function softDot(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!, grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** Точка на спирали: r в долях радиуса → [x, z] в долях радиуса */
function armPoint(r: number, arm: number, spread: number): [number, number] {
  const theta = Math.log(r / 0.04 + 1) / PITCH * 0.5 + (arm * Math.PI * 2) / ARMS;
  const j = gauss() * spread * (0.25 + r);
  return [Math.cos(theta) * r + j * Math.sin(theta) * 0.9 + gauss() * 0.01, Math.sin(theta) * r - j * Math.cos(theta) * 0.9 + gauss() * 0.01];
}

function hazeTexture(): THREE.CanvasTexture {
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'lighter';
  const blob = (x: number, y: number, rad: number, col: string, a: number) => {
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, `rgba(${col},${a})`); grd.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  };
  const to = (x: number, z: number): [number, number] => [S / 2 + x * S * 0.5, S / 2 + z * S * 0.5];
  for (let i = 0; i < 5200; i++) {
    const r = 0.06 + Math.pow(rand(), 0.7) * 0.94;
    const [x, z] = armPoint(r, Math.floor(rand() * ARMS), 0.2);
    const [px, py] = to(x, z);
    const warm = Math.max(0, 1 - r * 1.6);
    blob(px, py, 14 + rand() * 26, warm > 0.3 ? '255,220,170' : '150,175,255', 0.05 + 0.03 * (1 - r));
    if (rand() < 0.07) blob(px, py, 8 + rand() * 12, '255,120,170', 0.12);       // розовые области звездообразования
  }
  const [cx, cy] = to(0, 0);
  blob(cx, cy, S * 0.16, '255,225,170', 0.9);                                       // ядро
  blob(cx, cy, S * 0.06, '255,250,235', 0.9);
  // Пылевые полосы
  g.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 900; i++) {
    const r = 0.1 + rand() * 0.85, [x, z] = armPoint(r, Math.floor(rand() * ARMS), 0.05), [px, py] = to(x, z);
    blob(px, py, 6 + rand() * 12, '0,0,0', 0.1);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createGalaxy(scene: THREE.Scene, onSelect: () => void = () => {}) {
  const root = new THREE.Group();                 // находится в позиции Солнца
  const tilt = new THREE.Group();                 // плоскость Галактики наклонена к эклиптике ~60°
  tilt.rotation.set(THREE.MathUtils.degToRad(60), 0, THREE.MathUtils.degToRad(-25));
  root.add(tilt);
  const R = GALAXY_RADIUS, offset = new THREE.Vector3(-SUN_R * R, 0, 0); // центр галактики относительно Солнца

  // Размытое «изображение» диска
  const hazeMat = new THREE.MeshBasicMaterial({ map: hazeTexture(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const haze = new THREE.Mesh(new THREE.PlaneGeometry(R * 2, R * 2), hazeMat);
  haze.rotation.x = -Math.PI / 2;
  haze.position.copy(offset);
  tilt.add(haze);

  // Отдельные звёзды
  const N = 70000, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    let x: number, y: number, z: number, hue: number, light: number;
    if (i < N * 0.22) {                            // балдж
      const rr = Math.abs(gauss()) * 0.22, a = rand() * Math.PI * 2, b = Math.acos(2 * rand() - 1);
      x = Math.sin(b) * Math.cos(a) * rr; z = Math.sin(b) * Math.sin(a) * rr; y = Math.cos(b) * rr * 0.55;
      hue = 0.11; light = 0.65 + rand() * 0.2;
    } else {                                       // рукава
      const r = 0.05 + Math.pow(rand(), 0.8) * 0.95;
      [x, z] = armPoint(r, Math.floor(rand() * ARMS), 0.32);
      y = gauss() * 0.02 * (1.1 - r);
      hue = r < 0.35 ? 0.1 : 0.6 + rand() * 0.06; light = 0.6 + rand() * 0.3;
    }
    pos.set([x * R + offset.x, y * R, z * R], i * 3);
    c.setHSL(hue, 0.55, light * 0.42);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const starMat = new THREE.PointsMaterial({ size: 2.4, sizeAttenuation: false, vertexColors: true, map: softDot(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const stars = new THREE.Points(geo, starMat);
  tilt.add(stars);

  root.visible = false;
  scene.add(root);

  // Подписи
  const wrap = document.createElement('div');
  wrap.id = 'galaxy-ui';
  wrap.innerHTML = `
    <div class="g-label g-core" title="Перейти к Млечному Пути"><span class="marker"></span><span class="name">MILKY WAY</span></div>
    <div class="g-label g-sun"><span class="marker"></span><span class="name">ВЫ ЗДЕСЬ · СОЛНЦЕ</span></div>
    <div class="g-caption"><b>Млечный Путь</b><span>Диаметр ≈ 100 000 световых лет · 100–400 млрд звёзд · Солнце в рукаве Ориона, ≈ 26 000 св. лет от центра</span><em>Масштаб условный</em></div>`;
  document.body.appendChild(wrap);
  const coreEl = wrap.querySelector<HTMLElement>('.g-core')!, sunEl = wrap.querySelector<HTMLElement>('.g-sun')!;
  coreEl.onclick = onSelect;
  const tmp = new THREE.Vector3();

  const place = (el: HTMLElement, p: THREE.Vector3, camera: THREE.Camera, alpha: number) => {
    tmp.copy(p).project(camera);
    const ok = tmp.z < 1 && alpha > 0.01;
    el.style.display = ok ? '' : 'none';
    if (ok) { el.style.transform = `translate(${(tmp.x * 0.5 + 0.5) * innerWidth}px, ${(-tmp.y * 0.5 + 0.5) * innerHeight}px)`; el.style.opacity = String(alpha); }
  };

  /** 0 — вблизи, 1 — полностью виден Млечный Путь */
  const ZOOM_START = 3e5, ZOOM_FULL = 2e7;
  const amount = (camDist: number) => {
    const k = (Math.log10(camDist) - Math.log10(ZOOM_START)) / (Math.log10(ZOOM_FULL) - Math.log10(ZOOM_START));
    const t = Math.min(Math.max(k, 0), 1);
    return t * t * (3 - 2 * t);
  };

  return {
    amount,
    update(camera: THREE.Camera, sunScenePos: THREE.Vector3, camDist: number) {
      const k = amount(camDist);
      root.visible = k > 0.001;
      root.position.copy(sunScenePos);
      hazeMat.opacity = k; starMat.opacity = k;
      tilt.updateMatrixWorld();
      const labelAlpha = Math.min(1, Math.max(0, (k - 0.2) / 0.3));
      place(coreEl, tilt.localToWorld(offset.clone()), camera, labelAlpha);
      place(sunEl, sunScenePos, camera, labelAlpha);
      wrap.classList.toggle('show', k > 0.55);
      return k;
    },
  };
}
