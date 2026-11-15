import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { initI18n, setLang, getLang, onLangChange } from './i18n';
import './theme.css';
import './style.css';
import { BODIES, SPACECRAFT, BodyDef } from './bodies';
import { bodyState, orbitPath, trackState, Track, State, UNIT_KM, KM_PER_AU } from './ephemeris';
import { SimClock } from './clock';
import { STORIES, Story } from './stories';
import { initAssistant } from './assistant';
import { createGalaxy } from './galaxy';
import { initToolbox } from './toolbox';
import { missionFor } from './missions';
import { proceduralTexture } from './proceduralTextures';
import { buildSpacecraftModel, loadSpacecraftModel, modelRadius, MODEL_SIZE, aimsAtSun, setSpacecraftEnv } from './spacecraft';
import { ATMOSPHERES, makeAtmosphere, makeNightLights, specularToRoughness, SunUniform } from './planetFx';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  SPHEREX_LAUNCH_MS,
  SpherexTelemetry,
  fetchLiveSpherexTle,
  getActiveTle,
  propagateSpherex,
  spherexOrbitRing,
  surveyStats,
} from './spherex';
import { createSpherexSkyOverlay } from './spherexSky';
import { initSpherexLab, SpherexLabController } from './spherexLab';
import { initCommandPalette, PaletteItem } from './cmdk';
import { startIntro } from './intro';
import { Catalog, OrbitalObject, loadBundledCatalog, isLaunchDangerous } from './orbital/catalog';
import { createEarthLayer, OBLIQUITY } from './orbital/earthLayer';
import { sgp4, gmst, orbitRing, V3 } from './orbital/propagate';
import { createSmallBodyLayer, SmallBodyLayer, SmallBody, smallBodyOrbit, jdOf, SB_NAMES, SB_COLORS } from './orbital/smallBodies';
import { buildOrbitalModel, buildShapeModel } from './orbital/models';
import { initTracker, TrackerController } from './orbital/tracker';
import { initSkyViewer } from './skyViewer';
import { initAbout } from './about';
import { createMilkyWay, createPost, hdQueue } from './graphics';

// ---------- Сущности ----------
interface Entity {
  def: BodyDef;
  state: State;
  group: THREE.Group;          // позиция в сцене (относительно floating origin)
  mesh?: THREE.Mesh;
  label: HTMLDivElement;
  orbit?: THREE.Line;
  orbitTime?: number;
  track?: Track;
  liveTle?: boolean;
  model?: THREE.Group;         // 3D-модель аппарата
  sunU?: SunUniform;           // направление на Солнце для шейдеров атмосферы и огней
  clouds?: THREE.Mesh;
  modelR?: number;             // радиус модели аппарата (ед. сцены)
}

const params = new URLSearchParams(location.hash.split('?')[1] ?? '');
const canvas = document.getElementById('scene') as HTMLCanvasElement;
const probeGl = document.createElement('canvas').getContext('webgl2');
const dbgExt = probeGl?.getExtension('WEBGL_debug_renderer_info');
const glRenderer = dbgExt && probeGl ? String(probeGl.getParameter(dbgExt.UNMASKED_RENDERER_WEBGL)) : '';
const isSoftwareGl = /SwiftShader|llvmpipe|Software|Microsoft Basic Render/i.test(glRenderer);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isSoftwareGl, logarithmicDepthBuffer: true });
renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(devicePixelRatio, 2));
const glCtx = renderer.getContext() as WebGL2RenderingContext;
function afterDraw(cb: () => void) {
  if (!isSoftwareGl || typeof glCtx.fenceSync !== 'function') {
    requestAnimationFrame(cb);
    return;
  }
  const sync = glCtx.fenceSync(glCtx.SYNC_GPU_COMMANDS_COMPLETE, 0);
  glCtx.flush();
  if (!sync) { requestAnimationFrame(cb); return; }
  const poll = () => {
    const st = glCtx.clientWaitSync(sync, 0, 0);
    if (st === glCtx.TIMEOUT_EXPIRED) { setTimeout(poll, 4); return; }
    glCtx.deleteSync(sync);
    requestAnimationFrame(cb);
  };
  setTimeout(poll, 0);
}

const scene = new THREE.Scene();
// HD-текстуры (Solar System Scope 4K/2K, CC BY 4.0; луны — NASA 3D Resources) подгружаются в фоне после старта
const HD: Record<string, string> = {
  sun: 'hd/sun_4k.jpg', mercury: 'hd/mercury_4k.jpg', venus: 'hd/venus_4k.jpg', earth: 'hd/earth_day_4k.jpg', moon: 'hd/moon_4k.jpg',
  mars: 'hd/mars_4k.jpg', jupiter: 'hd/jupiter_4k.jpg', saturn: 'hd/saturn_4k.jpg', uranus: 'hd/uranus_2k.jpg', neptune: 'hd/neptune_2k.jpg',
  io: 'hd/io_nasa.jpg', europa: 'hd/europa_nasa.jpg', phobos: 'hd/phobos_nasa.jpg', pluto: 'hd/pluto_nasa.jpg', charon: 'hd/charon_nasa.jpg', titan: 'hd/titan_nasa.jpg',
};
const hd = hdQueue();
const camera = new THREE.PerspectiveCamera(50, 1, 1e-7, 1e8);
camera.position.set(0, 900, 1400);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enablePan = false;
controls.zoomSpeed = 1.5;
controls.maxDistance = 5.5e7;
controls.screenSpacePanning = true;
controls.listenToKeyEvents(window as unknown as HTMLElement); // стрелки — сдвиг камеры
controls.keyPanSpeed = 12;

const ambient = new THREE.AmbientLight(0xffffff, 0.06);
const sunLight = new THREE.PointLight(0xffffff, 3, 0, 0);
scene.add(ambient, sunLight);
const spherexSky = createSpherexSkyOverlay(scene);
const milkyWay = createMilkyWay(scene, camera, renderer.capabilities.getMaxAnisotropy());
const post = createPost(renderer, scene, camera, !isSoftwareGl || params.get('bloom') === '1');
const galaxy = createGalaxy(scene, () => { location.hash = '#/milky-way'; });
let galaxyMode = false, lastGk = 0;
const viewingGalaxy = () => galaxyMode || lastGk > 0.5;

const clock = new SimClock();
const entities = new Map<string, Entity>();
const labelsEl = document.getElementById('labels')!;
const loader = new THREE.TextureLoader();
const maxAniso = renderer.capabilities.getMaxAnisotropy();
// Окружение для бликов на металле моделей аппаратов
setSpacecraftEnv(new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture);
const ROCKY = new Set(['mercury', 'moon', 'mars', 'phobos', 'deimos', 'io', 'europa', 'ganymede', 'callisto', 'mimas', 'tethys', 'dione', 'rhea', 'iapetus', 'enceladus', 'miranda', 'ariel', 'umbriel', 'titania', 'oberon', 'triton', 'charon', 'pluto']);
let originKm: [number, number, number] = [0, 0, 0];
let focus: Entity | null = null;
let showOrbits = true, showLabels = true, showTracks = false, showScanCone = true, telescopeView = false;
let latestSpherexTel: SpherexTelemetry | null = null;
let spherexLab: SpherexLabController | null = null;
const kindOn: Record<string, boolean> = { star: true, planet: true, dwarf: true, moon: true, spacecraft: true, satellite: true, smallbody: true };
// Орбита Земли: ~21 тыс. реальных объектов CelesTrak (GPU), выбранный — SGP4; малые тела Солнечной системы
const earthLayer = createEarthLayer(renderer);
scene.add(earthLayer.root);
let catalog: Catalog | null = null;
let sbLayer: SmallBodyLayer | null = null;
let tracker: TrackerController | null = null;
let trackedObj: OrbitalObject | null = null;
let trackedBody: SmallBody | null = null;
// TEME → эклиптика: тот же поворот на наклон экватора, что у меша Земли и GPU-слоя, — всё в одной системе
const cE = Math.cos(OBLIQUITY), sE = Math.sin(OBLIQUITY);
const eqToEcl = (v: V3): V3 => [v[0], cE * v[1] + sE * v[2], -sE * v[1] + cE * v[2]];
const escH = (s: string) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// Плоскость эклиптики → XZ сцены
const toScene = (p: [number, number, number], out: THREE.Vector3) =>
  out.set((p[0] - originKm[0]) / UNIT_KM, (p[2] - originKm[2]) / UNIT_KM, -(p[1] - originKm[1]) / UNIT_KM);

function makeLabel(e: Entity) {
  const el = document.createElement('div');
  el.className = `label ${e.def.kind}`;
  el.innerHTML = `<span class="marker" style="border-color:${e.def.color}"></span><span class="name">${escH(e.def.name)}</span>`;
  el.onclick = () => (location.hash = `#/${e.def.id}`);
  labelsEl.appendChild(el);
  return el;
}

function addBody(def: BodyDef) {
  const group = new THREE.Group();
  const e: Entity = { def, state: bodyState(def, clock.date), group, label: null as unknown as HTMLDivElement };
  const r = def.radiusKm / UNIT_KM;
  const geo = new THREE.SphereGeometry(r, def.kind === 'planet' || def.kind === 'star' || def.id === 'moon' ? 160 : 96, def.kind === 'planet' || def.kind === 'star' || def.id === 'moon' ? 80 : 48);
  const mat = def.kind === 'star'
    ? new THREE.MeshBasicMaterial({ color: def.color })
    : new THREE.MeshStandardMaterial({ color: def.color, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  // Настоящая текстура из public/textures; если файла нет — процедурная заглушка
  const sunU: SunUniform = { value: new THREE.Vector3(1, 0, 0) };
  e.sunU = sunU;
  const useProcedural = () => { mat.map = proceduralTexture(def); mat.color.set(0xffffff); mat.needsUpdate = true; };
  if (def.texture) loader.load(`textures/${def.texture}`, (t) => {
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso;
    mat.map = t; mat.color.set(0xffffff);
    if (mat instanceof THREE.MeshStandardMaterial && ROCKY.has(def.id)) { mat.bumpMap = t; mat.bumpScale = 1.5; } // рельеф из яркости карты
    mat.needsUpdate = true;
  }, undefined, useProcedural);
  if (HD[def.id]) hd.add(`textures/${HD[def.id]}`, (t) => {
    t.anisotropy = maxAniso;
    const old = mat.map;
    mat.map = t; mat.color.set(0xffffff);
    if (mat instanceof THREE.MeshStandardMaterial && ROCKY.has(def.id)) { mat.bumpMap = t; mat.bumpScale = def.id === 'moon' ? 2.2 : 1.6; }
    mat.needsUpdate = true;
    if (old && old !== t) old.dispose();
  });
  else useProcedural();
  const tilt = new THREE.Group();
  // У Земли реальная ориентация: полюс J2000 и вращение по гринвичскому звёздному времени —
  // иначе спутники (SGP4, система TEME≈ECI) не совпадали бы с географией.
  if (def.id === 'earth') tilt.rotation.x = -OBLIQUITY;
  else tilt.rotation.z = THREE.MathUtils.degToRad(def.tiltDeg ?? 0);
  tilt.add(mesh);
  group.add(tilt);
  e.mesh = mesh;

  // Земля: рельеф, блики океана, облака, огни городов
  if (def.id === 'earth' && mat instanceof THREE.MeshStandardMaterial) {
    loader.load('textures/earth_normal_2048.jpg', (t) => { mat.normalMap = t; mat.normalScale.set(0.9, 0.9); mat.needsUpdate = true; });
    const img = new Image();
    img.onload = () => { mat.roughnessMap = specularToRoughness(img); mat.roughness = 1; mat.metalness = 0.05; mat.needsUpdate = true; };
    img.src = 'textures/earth_specular_2048.jpg';
    loader.load('textures/earth_lights_2048.png', (t) => { t.colorSpace = THREE.SRGBColorSpace; mesh.add(makeNightLights(r, t, sunU)); });
    loader.load('textures/earth_clouds_1024.png', (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      const cMat = new THREE.MeshStandardMaterial({ map: t, transparent: true, opacity: 0.85, depthWrite: false, roughness: 1 });
      const cm = new THREE.Mesh(new THREE.SphereGeometry(r * 1.006, 160, 80), cMat);
      mesh.add(cm); e.clouds = cm;
      // HD-облака: карта яркости как прозрачность
      hd.add('textures/hd/earth_clouds_4k.jpg', (ct) => { ct.anisotropy = maxAniso; cMat.map = null; cMat.color.set(0xffffff); cMat.alphaMap = ct; cMat.opacity = 0.95; cMat.needsUpdate = true; }, false);
    });
    hd.add('textures/hd/earth_normal_4k.jpg', (t) => { t.anisotropy = maxAniso; mat.normalMap = t; mat.normalScale.set(1.1, 1.1); mat.needsUpdate = true; }, false);
    hd.add('textures/hd/earth_rough_4k.jpg', (t) => { mat.roughnessMap = t; mat.roughness = 1; mat.metalness = 0.04; mat.needsUpdate = true; }, false);
    hd.add('textures/hd/earth_night_4k.jpg', (t) => { const nl = mesh.children.find((c) => (c as THREE.Mesh).material && ((c as THREE.Mesh).material as THREE.ShaderMaterial).uniforms?.uMap) as THREE.Mesh | undefined; if (nl) { ((nl.material as THREE.ShaderMaterial).uniforms.uMap.value = t); } });
  }
  // Атмосферы (свечение по краю диска, ярче на освещённой стороне)
  const atmo = ATMOSPHERES[def.id];
  if (atmo) group.add(makeAtmosphere(r, atmo, sunU));

  if (def.id === 'saturn') {
    const ring = new THREE.RingGeometry(66900 / UNIT_KM, 136780 / UNIT_KM, 128, 4);
    const pos = ring.attributes.position, uv = ring.attributes.uv, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); uv.setXY(i, (v.length() * UNIT_KM - 66900) / 69880, 0.5); }
    const c = document.createElement('canvas'); c.width = 512; c.height = 1;
    const g = c.getContext('2d')!;
    for (let x = 0; x < 512; x++) {
      const a = 0.35 + 0.5 * Math.abs(Math.sin(x * 0.07) * Math.sin(x * 0.013)) * (x > 300 && x < 330 ? 0.1 : 1);
      g.fillStyle = `rgba(230,210,170,${a})`; g.fillRect(x, 0, 1, 1);
    }
    const ringMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), side: THREE.DoubleSide, transparent: true, depthWrite: false });
    loader.load('textures/saturnringcolor.jpg', (col) => loader.load('textures/saturnringpattern.gif', (alpha) => {
      col.colorSpace = THREE.SRGBColorSpace; col.anisotropy = maxAniso;
      ringMat.map = col; ringMat.alphaMap = alpha; ringMat.needsUpdate = true;
    }));
    hd.add('textures/hd/saturn_ring_2k.png', (t) => { t.anisotropy = maxAniso; ringMat.map = t; ringMat.alphaMap = null; ringMat.needsUpdate = true; });
    const rm = new THREE.Mesh(ring, ringMat);
    rm.rotation.x = -Math.PI / 2;
    tilt.add(rm);
  }
  if (def.kind === 'star') {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d')!, grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,240,200,1)'); grd.addColorStop(0.2, 'rgba(255,200,100,0.5)'); grd.addColorStop(1, 'rgba(255,160,60,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(r * 9);
    group.add(glow);
    const corona = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow.material.map, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.25, color: 0xffb060 }));
    corona.scale.setScalar(r * 26);
    group.add(corona);
  }
  scene.add(group);
  e.label = makeLabel(e);
  entities.set(def.id, e);
}

function parentState(e: Entity, d: Date): State {
  const p = e.def.parent ? entities.get(e.def.parent)! : entities.get('sun')!;
  return bodyState(p.def, d);
}

function rebuildOrbit(e: Entity) {
  if (!e.def.orbitDays) return;
  const pts = orbitPath(e.def, clock.date, (d) => parentState(e, d));
  const arr = new Float32Array(pts.length * 3);
  pts.forEach((p, i) => { arr[i * 3] = p[0] / UNIT_KM; arr[i * 3 + 1] = p[2] / UNIT_KM; arr[i * 3 + 2] = -p[1] / UNIT_KM; });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  // Затухание к «хвосту» орбиты, как в оригинале
  const col = new Float32Array(pts.length * 3), c = new THREE.Color(e.def.color);
  pts.forEach((_, i) => { const k = 1.1 - (i / pts.length) * 1.05; col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k; });
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (e.orbit) { scene.remove(e.orbit); e.orbit.geometry.dispose(); }
  e.orbit = new THREE.Line(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: e.def.kind === 'moon' ? 0.6 : 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  e.orbitTime = clock.date.getTime();
  scene.add(e.orbit);
}

async function loadSpacecraft() {
  for (const sc of SPACECRAFT) {
    if ('liveTle' in sc && sc.liveTle) {
      const def: BodyDef = {
        id: sc.id,
        name: sc.name,
        kind: 'spacecraft',
        parent: 'parent' in sc ? sc.parent : undefined,
        radiusKm: 0.005,
        massKg: sc.massKg,
        color: '#5be4d2',
        agency: sc.agency,
        launch: sc.launch,
        description: `${sc.description} Орбита рассчитывается в реальном времени по TLE (${sc.horizons}, SGP4).`,
      };
      const group = new THREE.Group();
      scene.add(group);
      const earthEnt = entities.get('earth');
      const prop = propagateSpherex(clock.date, earthEnt?.state);
      if (prop) latestSpherexTel = prop.telemetry;
      const e: Entity = {
        def,
        state: prop?.state ?? { pos: [0, 0, 0], vel: [0, 0, 0] },
        group,
        label: null as unknown as HTMLDivElement,
        liveTle: true,
      };
      e.model = buildSpacecraftModel(sc.id);
      group.add(e.model);
      e.modelR = modelRadius(e.model);
      e.label = makeLabel(e);

      const ringPts = spherexOrbitRing(clock.date, 180);
      const arr = new Float32Array(Math.max(ringPts.length, 2) * 3);
      ringPts.forEach((p, i) => {
        arr[i * 3] = p[0] / UNIT_KM;
        arr[i * 3 + 1] = p[2] / UNIT_KM;
        arr[i * 3 + 2] = -p[1] / UNIT_KM;
      });
      e.orbit = new THREE.Line(
        new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(arr, 3)),
        new THREE.LineBasicMaterial({ color: 0x5be4d2, transparent: true, opacity: 0.72, depthWrite: false })
      );
      e.orbitTime = clock.date.getTime();
      scene.add(e.orbit);
      entities.set(sc.id, e);

      fetchLiveSpherexTle().then(() => {
        e.orbitTime = 0; // перестроить SSO-кольцо по свежему TLE
      });
      continue;
    }

    try {
      const res = await fetch(`data/spacecraft/${sc.id}.json`);
      if (!res.ok || !res.headers.get('content-type')?.includes('json')) continue;
      const track = (await res.json()) as Track;
      const def: BodyDef = { id: sc.id, name: sc.name, kind: 'spacecraft', radiusKm: 0.005, massKg: sc.massKg, color: '#cfd8dc', agency: sc.agency, launch: sc.launch, description: `${sc.description} Траектория — по данным JPL Horizons (ID ${sc.horizons}).` };
      const group = new THREE.Group();
      scene.add(group);
      const e: Entity = { def, state: { pos: [0, 0, 0], vel: [0, 0, 0] }, group, label: null as unknown as HTMLDivElement, track };
      e.model = buildSpacecraftModel(sc.id);
      group.add(e.model);
      e.modelR = modelRadius(e.model);
      // Если для аппарата есть настоящая модель NASA — подменяем ею процедурную
      loadSpacecraftModel(sc.id).then((m) => { if (m) { group.remove(e.model!); e.model = m; group.add(m); e.modelR = modelRadius(m); } });
      e.label = makeLabel(e);
      // След траектории целиком
      const arr = new Float32Array(track.p.length * 3);
      e.orbit = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(arr, 3)),
        new THREE.LineBasicMaterial({ color: 0x8899aa, transparent: true, opacity: 0.5 }));
      scene.add(e.orbit);
      entities.set(sc.id, e);
    } catch { /* нет данных — пропускаем */ }
  }
}

// ---------- Выбранный объект на орбите Земли / малое тело: динамическая сущность ----------
const SAT_MODEL_UNITS = 30 / UNIT_KM;   // модель спутника ≈ 30 км (увеличена, иначе не видна рядом с Землёй)
let orbitalEnt: Entity | null = null;
let orbitalToken = 0;

function dropOrbitalEntity() {
  if (!orbitalEnt) return;
  scene.remove(orbitalEnt.group);
  orbitalEnt.group.traverse((n) => { const m = n as THREE.Mesh; if (m.isMesh && !m.userData.shared) { m.geometry?.dispose(); } });
  if (orbitalEnt.orbit) { orbitalEnt.orbit.parent?.remove(orbitalEnt.orbit); orbitalEnt.orbit.geometry.dispose(); (orbitalEnt.orbit.material as THREE.Material).dispose(); }
  orbitalEnt.label.remove();
  entities.delete(orbitalEnt.def.id);
  orbitalEnt = null;
}

function satState(o: OrbitalObject, date: Date, earth: State): State | null {
  const s = sgp4(o, date);
  if (!s) return null;
  const p = eqToEcl(s.r), v = eqToEcl(s.v);
  return { pos: [earth.pos[0] + p[0], earth.pos[1] + p[1], earth.pos[2] + p[2]], vel: [earth.vel[0] + v[0], earth.vel[1] + v[1], earth.vel[2] + v[2]] };
}

function rebuildSatOrbit(o: OrbitalObject, date: Date) {
  if (!orbitalEnt) return;
  const pts = orbitRing(o, date, 240);
  const arr = new Float32Array(Math.max(pts.length, 2) * 3);
  pts.forEach((p, i) => { arr[i * 3] = p[0] / UNIT_KM; arr[i * 3 + 1] = p[2] / UNIT_KM; arr[i * 3 + 2] = -p[1] / UNIT_KM; });
  const old = orbitalEnt.orbit!.geometry;
  orbitalEnt.orbit!.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(arr, 3));
  old.dispose();
  orbitalEnt.orbitTime = date.getTime();
}

function selectOrbital(norad: number) {
  const o = catalog?.byNorad.get(norad);
  if (!o) return false;
  dropOrbitalEntity();
  trackedBody = null;
  trackedObj = o;
  const earth = entities.get('earth')!;
  const def: BodyDef = { id: 'sat-' + norad, name: o.name, kind: 'satellite', parent: 'earth', radiusKm: 0.01, color: '#58c4ff', description: '' };
  const group = new THREE.Group();
  scene.add(group);
  const e: Entity = { def, state: satState(o, clock.date, earth.state) ?? earth.state, group, label: null as unknown as HTMLDivElement };
  const marker = new THREE.Mesh(new THREE.OctahedronGeometry(SAT_MODEL_UNITS * 0.25), new THREE.MeshBasicMaterial({ color: 0xff6b2c, wireframe: true }));
  group.add(marker);
  e.model = marker as unknown as THREE.Group;
  e.modelR = SAT_MODEL_UNITS / 2;
  const token = ++orbitalToken;
  buildOrbitalModel(o, SAT_MODEL_UNITS).then(({ obj }) => {
    if (token !== orbitalToken || !orbitalEnt) return;
    group.remove(marker);
    obj.traverse((n) => { const m = (n as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m && 'envMapIntensity' in m) { m.envMapIntensity = 0.6; m.needsUpdate = true; } });
    group.add(obj); e.model = obj;
  });
  e.label = makeLabel(e);
  e.orbit = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xff6b2c, transparent: true, opacity: 0.85, depthWrite: false }));
  e.orbit.frustumCulled = false;
  earthLayer.root.add(e.orbit);   // орбита в ECI → дочерний объект слоя (тот же наклон и центр)
  orbitalEnt = e;
  entities.set(def.id, e);
  rebuildSatOrbit(o, clock.date);
  tracker?.onTracked(o);
  return true;
}

function pickBody(cx: number, cy: number): Entity | null {
  const w = innerWidth, h = innerHeight, p = new THREE.Vector3(), q = new THREE.Vector3(), right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  let best: Entity | null = null, bestScore = Infinity;
  for (const e of entities.values()) {
    if (e === orbitalEnt || !e.group.visible || e.label.dataset.hidden === '1') continue;
    if (!(kindOn[e.def.kind] ?? true)) continue;
    p.copy(e.group.position).project(camera);
    if (p.z > 1 || p.z < -1) continue;
    const sx = (p.x * 0.5 + 0.5) * w, sy = (-p.y * 0.5 + 0.5) * h;
    // видимый радиус диска в пикселях
    const rU = e.def.kind === 'spacecraft' ? (e.modelR ?? 0) : e.def.radiusKm / UNIT_KM;
    q.copy(e.group.position).addScaledVector(right, rU).project(camera);
    const rPx = Math.hypot((q.x - p.x) * 0.5 * w, (q.y - p.y) * 0.5 * h);
    const R = Math.max(rPx * 1.05, 18), d = Math.hypot(sx - cx, sy - cy);
    if (d <= R) { const score = d / R + (e.def.kind === 'star' ? 0.3 : 0); if (score < bestScore) { bestScore = score; best = e; } }
  }
  return best;
}

function selectSmallBody(b: SmallBody) {
  dropOrbitalEntity();
  trackedObj = null;
  tracker?.onTracked(null);
  trackedBody = b;
  // у комет H — полный блеск с комой, диаметр ядра по нему не оценить: условные 5 км
  const diamKm = b.cls === 'comet' || b.H == null ? 5 : (1329 / Math.sqrt(0.15)) * Math.pow(10, -b.H / 5);
  const def: BodyDef = { id: b.id, name: b.name, kind: 'smallbody', radiusKm: Math.max(diamKm / 2, 0.05), color: SB_COLORS[b.cls], description: '' };
  const group = new THREE.Group();
  scene.add(group);
  const pos = sbLayer!.posKm(b, clock.date);
  const e: Entity = { def, state: { pos, vel: [0, 0, 0] }, group, label: null as unknown as HTMLDivElement };
  const sizeU = (Math.max(diamKm, 0.1)) / UNIT_KM;
  // условная форма по умолчанию: «картофелина» из шума; если есть реальная модель формы — заменяем
  const rock = new THREE.IcosahedronGeometry(sizeU / 2, 3);
  const rp = rock.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < rp.count; i++) { v.fromBufferAttribute(rp, i); const k = 1 + 0.18 * Math.sin(v.x * 9 / sizeU) * Math.cos(v.y * 7 / sizeU) + 0.1 * Math.sin(v.z * 13 / sizeU); rp.setXYZ(i, v.x * k, v.y * k * 0.85, v.z * k); }
  rock.computeVertexNormals();
  const mesh = new THREE.Mesh(rock, new THREE.MeshStandardMaterial({ color: b.cls === 'comet' ? 0x6d6a66 : 0x8b8279, roughness: 1, metalness: 0 }));
  group.add(mesh); e.mesh = mesh;
  const token = ++orbitalToken;
  if (b.model) buildShapeModel(b.model, sizeU).then((m) => {
    if (!m || token !== orbitalToken || !orbitalEnt) return;
    group.remove(mesh); group.add(m);
  });
  e.label = makeLabel(e);
  const pts = smallBodyOrbit(b, jdOf(clock.date), 512);
  const arr = new Float32Array(pts.length * 3);
  pts.forEach((p, i) => { arr[i * 3] = p[0] / UNIT_KM; arr[i * 3 + 1] = p[2] / UNIT_KM; arr[i * 3 + 2] = -p[1] / UNIT_KM; });
  e.orbit = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(arr, 3)), new THREE.LineBasicMaterial({ color: SB_COLORS[b.cls], transparent: true, opacity: 0.8, depthWrite: false }));
  e.orbit.frustumCulled = false;
  scene.add(e.orbit);
  orbitalEnt = e;
  entities.set(def.id, e);
  return diamKm;
}

function updateOrbitalState(date: Date, earth: Entity) {
  if (!orbitalEnt) return;
  if (trackedObj) {
    const s = satState(trackedObj, date, earth.state);
    orbitalEnt.label.dataset.hidden = s ? '' : '1';
    orbitalEnt.group.visible = !!s;
    if (s) orbitalEnt.state = s;
    if (Math.abs(date.getTime() - (orbitalEnt.orbitTime ?? 0)) > trackedObj.periodMin * 60e3 * 0.5) rebuildSatOrbit(trackedObj, date);
  } else if (trackedBody && sbLayer) {
    const p = sbLayer.posKm(trackedBody, date), p2 = sbLayer.posKm(trackedBody, new Date(date.getTime() + 3600e3));
    orbitalEnt.state = { pos: p, vel: [(p2[0] - p[0]) / 3600, (p2[1] - p[1]) / 3600, (p2[2] - p[2]) / 3600] };
  }
}

function placeOrbitalLayers(date: Date, earth: Entity, gk: number) {
  toScene(earth.state.pos, earthLayer.root.position);
  const catAgeDays = catalog ? Math.abs(date.getTime() - Date.parse(catalog.generated)) / 86400e3 : 0;
  earthLayer.root.visible = kindOn.satellite && gk < 0.5 && catAgeDays < 45;   // элементы GP актуальны ± недели от эпохи
  // Коридоры запуска: видимы только когда смотрим на Землю (gk < 0.5) и слой активен
  if (launchCorridorGroup) {
    launchCorridorGroup.visible = kindOn.satellite && gk < 0.5 && catAgeDays < 45;
    toScene(earth.state.pos, launchCorridorGroup.position);
  }
  earthLayer.update(date);
  if (sbLayer) {
    sbLayer.update(date, originKm);
    sbLayer.points.visible = kindOn.smallbody && gk < 0.6;
    sbLayer.neaLines.visible = sbLayer.neaLines.visible && gk < 0.6;
  }
  if (orbitalEnt?.orbit && trackedBody) toScene([0, 0, 0], orbitalEnt.orbit.position);
  if (orbitalEnt?.orbit) orbitalEnt.orbit.visible = showOrbits && gk < 0.9;
}

// Звёзды: процедурная заглушка (план: каталог HYG, CC BY-SA 4.0)
function addStars() {
  const n = 9000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    pos.set([s * Math.cos(th), u, s * Math.sin(th)].map((x) => x * 1e6), i * 3);
    const b = Math.pow(Math.random(), 3) * 0.9 + 0.1;
    col.set([b, b * (0.9 + Math.random() * 0.1), b * (0.85 + Math.random() * 0.15)], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const stars = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false }));
  stars.renderOrder = -1;
  stars.onBeforeRender = () => stars.position.copy(camera.position);
  scene.add(stars);
}

// ---------- Зелёные коридоры запуска ракет ----------
// Показывают безопасные зоны для запуска ракет относительно орбитальных плоскостей.
// Три основных космодрома: мыс Канаверал (28.5°), Байконур (51.6°), Ванденберг (97.8°).
let launchCorridorGroup: THREE.Group | null = null;

interface LaunchSite {
  name: string;
  latDeg: number;
  lonDeg: number;
  inclDeg: number;   // целевое наклонение (типовой коридор запуска)
  altKm: number;     // высота коридора (км)
  color: string;
  label: string;
}

const LAUNCH_SITES: LaunchSite[] = [
  { name: 'Мыс Канаверал', latDeg: 28.5, lonDeg: -80.6, inclDeg: 28.5, altKm: 400, color: '#00ff88', label: 'КК · 28.5°' },
  { name: 'Байконур', latDeg: 45.9, lonDeg: 63.3, inclDeg: 51.6, altKm: 420, color: '#44ff44', label: 'БК · 51.6°' },
  { name: 'Ванденберг', latDeg: 34.7, lonDeg: -120.6, inclDeg: 97.8, altKm: 500, color: '#88ff00', label: 'ВФБ · 97.8°' },
];

function createLaunchCorridors() {
  const grp = new THREE.Group();
  grp.name = 'launch-corridors';

  for (const site of LAUNCH_SITES) {
    const RE_U = 6371 / UNIT_KM;
    const altU = (6371 + site.altKm) / UNIT_KM;
    const incl = (site.inclDeg * Math.PI) / 180;

    // --- Трубка коридора: дуга 90° орбиты на высоте altKm ---
    const SEG = 64;
    const tubePoints: THREE.Vector3[] = [];
    for (let s = 0; s <= SEG; s++) {
      const angle = (s / SEG) * (Math.PI / 2);  // 90° дуги
      // ECI: орбита в плоскости (наклонение incl), начало над экватором
      const x = altU * Math.cos(angle);
      const y = altU * Math.sin(angle) * Math.cos(incl);
      const z = altU * Math.sin(angle) * Math.sin(incl);
      // ECI → scene coords (Y=полюс): (x, z, -y)
      tubePoints.push(new THREE.Vector3(x, z, -y));
    }
    const path = new THREE.CatmullRomCurve3(tubePoints);
    const tubeGeo = new THREE.TubeGeometry(path, SEG, 0.012 * RE_U, 8, false);
    const tubeMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(site.color), transparent: true, opacity: 0.55,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const tube = new THREE.Mesh(tubeGeo, tubeMat);
    tube.renderOrder = 3;
    grp.add(tube);

    // --- Конус вылета: от поверхности до 200 км ---
    const latRad = (site.latDeg * Math.PI) / 180;
    const lonRad = (site.lonDeg * Math.PI) / 180;
    // Позиция на поверхности Земли в ECI (приближение: без учёта GMST, статично)
    const sx = RE_U * Math.cos(latRad) * Math.cos(lonRad);
    const sy = RE_U * Math.sin(latRad);
    const sz = RE_U * Math.cos(latRad) * Math.sin(lonRad);
    // Вершина конуса — на 200 км выше
    const scale200 = (6371 + 200) / 6371;
    const ex = sx * scale200, ey = sy * scale200, ez = sz * scale200;

    // scene coords (ECI: x,y,z → scene: x, z, -y)
    const surfacePos = new THREE.Vector3(sx, sz, -sy);  // ECI→scene
    const exitPos = new THREE.Vector3(ex, ez, -ey);     // ECI→scene
    const coneDir = exitPos.clone().sub(surfacePos);
    const coneLen = coneDir.length();

    const coneGeo = new THREE.ConeGeometry(0.025 * RE_U, coneLen, 16, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(site.color), transparent: true, opacity: 0.22,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    // Позиция и ориентация конуса
    cone.position.copy(surfacePos.clone().add(exitPos).multiplyScalar(0.5));
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), coneDir.clone().normalize());
    cone.renderOrder = 3;
    grp.add(cone);

    // --- Кольцо на высоте орбиты (показывает «безопасную плоскость») ---
    const ringGeo = new THREE.TorusGeometry(altU, 0.004 * RE_U, 6, 96);
    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(site.color), transparent: true, opacity: 0.3,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2 - incl;  // наклонение плоскости орбиты
    ring.renderOrder = 3;
    grp.add(ring);
  }

  // Родительская группа наклонена вместе с Землёй
  grp.rotation.x = -OBLIQUITY;
  scene.add(grp);
  return grp;
}

// ---------- Камера: перелёт к объекту ----------
let flight: { from: [number, number, number]; t0: number; dur: number; d0: number; d1: number } | null = null;

/** Млечный Путь как «объект»: камера отлетает на расстояние, с которого видна вся галактика. */
function selectGalaxy() {
  galaxyMode = true;
  focus = null;
  controls.target.set(0, 0, 0);
  controls.enablePan = false;
  controls.minDistance = 0;
  flight = { from: [...originKm], t0: performance.now(), dur: 4500, d0: camera.position.length(), d1: 4.5e7 };
  info.classList.remove('hidden');
  info.innerHTML = `<button class="close" onclick="location.hash='#/home'">✕</button>
    <h1>Milky Way</h1><div class="kind">Галактика · Млечный Путь</div>
    <p>Наша галактика — спиральная галактика с перемычкой. Солнечная система расположена в рукаве Ориона, примерно на двух третях радиуса от центра.</p>
    <table>
      <tr><td>Диаметр диска</td><td>≈ 100 000 св. лет</td></tr>
      <tr><td>Толщина диска</td><td>≈ 1 000 св. лет</td></tr>
      <tr><td>Число звёзд</td><td>100–400 млрд</td></tr>
      <tr><td>Возраст</td><td>≈ 13,6 млрд лет</td></tr>
      <tr><td>Масса (с тёмной материей)</td><td>≈ 1–2 трлн M☉</td></tr>
      <tr><td>Расстояние от Солнца до центра</td><td>≈ 26 000 св. лет</td></tr>
      <tr><td>Оборот Солнца вокруг центра</td><td>≈ 230 млн лет</td></tr>
      <tr><td>Скорость Солнца</td><td>≈ 230 км/с</td></tr>
      <tr><td>Чёрная дыра в центре</td><td>Sagittarius A*, ≈ 4,3 млн M☉</td></tr>
    </table>
    <p class="photos-note" style="margin-top:12px">Масштаб на экране условный.</p>
    <div class="photos-title">ФОТО NASA</div>
    <div id="nasa-photos" class="photos"><span class="photos-note">Загрузка…</span></div>`;
  loadPhotos('milky-way', 'Milky Way galaxy');
}
function select(id: string, distanceKm?: number, withInfo = true) {
  const e = entities.get(id) ?? (id === 'home' ? null : undefined);
  if (e === undefined) return;
  galaxyMode = false;
  if (id !== 'spherex') setTelescopeView(false);
  const d0 = camera.position.length();
  // У аппарата нет данных на текущую дату (миссия закончилась или ещё не началась) — перематываем к ближайшей дате с данными
  if (e?.track && !trackState(e.track, clock.date)) {
    const T = e.track.t, now = clock.date.getTime();
    clock.setTime(now < T[0] ? T[0] + 86400e3 : T[T.length - 1] - 86400e3);
    e.state = trackState(e.track, clock.date) ?? e.state;
  }
  if (e?.liveTle) {
    if (clock.date.getTime() < SPHEREX_LAUNCH_MS) {
      clock.setTime(Date.now() >= SPHEREX_LAUNCH_MS ? Date.now() : SPHEREX_LAUNCH_MS + 86400e3);
    }
    const earth = entities.get('earth')!;
    earth.state = bodyState(earth.def, clock.date);
    const prop = propagateSpherex(clock.date, earth.state);
    if (prop) { e.state = prop.state; latestSpherexTel = prop.telemetry; }
  }
  focus = e;
  document.body.dataset.focus = e?.def.id ?? 'home';
  const d1 = distanceKm ? distanceKm / UNIT_KM
    : e ? (e.def.id === 'spherex' ? MODEL_SIZE * 7 : e.def.kind === 'spacecraft' ? Math.max(MODEL_SIZE * 5, (e.modelR ?? 0) * 2.6) : Math.max((e.def.radiusKm / UNIT_KM) * (e.def.kind === 'star' ? 8 : 5), 1e-4)) : 1700;
  // Свободный осмотр: у спутников и аппаратов можно двигать камеру (ПКМ / стрелки), приближаться вплотную
  controls.target.set(0, 0, 0);
  controls.enablePan = !!e && (e.def.kind === 'spacecraft' || e.def.kind === 'moon' || e.def.kind === 'satellite');
  controls.minDistance = e?.def.kind === 'spacecraft' ? MODEL_SIZE * 0.6 : e?.def.kind === 'moon' ? (e.def.radiusKm / UNIT_KM) * 1.15 : 0;
  flight = { from: [...originKm], t0: performance.now(), dur: 2500, d0, d1 };
  showInfo(withInfo ? e : null);
}

const scopeHud = document.getElementById('scope-hud')!;
const scopeBandEl = document.getElementById('scope-band')!;
document.getElementById('scope-exit')!.onclick = () => setTelescopeView(false);

function setTelescopeView(on: boolean) {
  if (on && focus?.def.id !== 'spherex') {
    select('spherex');
  }
  telescopeView = on;
  document.body.dataset.telescope = on ? '1' : '0';
  scopeHud.classList.toggle('hidden', !on);
  scopeBandEl.textContent = spherexSky.getBand() === 'color' ? 'RGB-ИК (0.75–5.0 мкм)' : `${spherexSky.getBand()} ИК-канал`;
  const infoScopeBtn = info.querySelector<HTMLButtonElement>('[data-spx-action="scope"]');
  if (infoScopeBtn) infoScopeBtn.textContent = on ? 'Выйти из телескопа' : 'Вид с телескопа';
  if (!on) {
    controls.enabled = true;
    controls.target.set(0, 0, 0);
    if (focus?.def.id === 'spherex') {
      camera.position.setLength(MODEL_SIZE * 7);
    }
  } else {
    flight = null;
    controls.enabled = false;
  }
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function updateOrigin() {
  const target = focus ? focus.state.pos : [0, 0, 0];
  if (!flight) { originKm = [target[0], target[1], target[2]]; return; }
  const k = Math.min((performance.now() - flight.t0) / flight.dur, 1), f = ease(k);
  originKm = [0, 1, 2].map((i) => flight!.from[i] + (target[i] - flight!.from[i]) * f) as [number, number, number];
  // Логарифмическая интерполяция дистанции — плавный подлёт через порядки величин
  const dist = Math.exp(Math.log(flight.d0) + (Math.log(flight.d1) - Math.log(flight.d0)) * f);
  camera.position.setLength(dist);
  if (k >= 1) flight = null;
}

// ---------- Инфопанель ----------
const info = document.getElementById('info')!;
const fmt = (x: number, d = 3) => (Math.abs(x) >= 1e5 || (Math.abs(x) < 1e-2 && x !== 0) ? x.toExponential(d) : x.toLocaleString('ru-RU', { maximumFractionDigits: d }));
const len = (v: number[]) => Math.hypot(v[0], v[1], v[2]);

// ---------- Миссии ----------
const fmtDate = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
function missionBlock(e: Entity) {
  const m = missionFor(e.def.id);
  if (!m) return '';
  const now = clock.date.getTime();
  const hasData = (d: string) => {
    if (e.liveTle) return Date.parse(d) >= SPHEREX_LAUNCH_MS;
    return !e.track || !!trackState(e.track, new Date(d + 'T12:00:00Z'));
  };
  return `<div class="m-title">МИССИЯ</div>
    <div class="m-goal">${m.goal}</div>
    <table class="m-facts"><tr><td>Цели</td><td>${m.target}</td></tr><tr><td>Годы</td><td>${m.years}</td></tr>${m.status ? `<tr><td>Статус</td><td>${m.status}</td></tr>` : ''}</table>
    <ol class="m-events">${m.events.map((ev) => {
      const past = Date.parse(ev.date) <= now, ok = hasData(ev.date);
      return `<li class="${past ? 'past' : 'future'}${ok ? '' : ' nodata'}"><button class="m-ev" data-craft="${m.id}" data-date="${ev.date}" ${ok ? '' : 'disabled title="Нет данных траектории на эту дату"'}>
        <span class="m-date">${ev.approx ? '≈ ' : ''}${fmtDate(ev.date)}</span><span class="m-name">${ev.title}</span><span class="m-text">${ev.text}</span></button></li>`;
    }).join('')}</ol>`;
}
/** Переход по времени к событию миссии: ставим дату и перелетаем к аппарату. */
function goToMissionEvent(craftId: string, date: string) {
  clock.setTime(Date.parse(date + 'T12:00:00Z'));
  clock.setRate(1);
  const e = entities.get(craftId);
  if (e?.track) e.state = trackState(e.track, clock.date) ?? e.state;
  if (e?.liveTle) {
    const earth = entities.get('earth')!;
    earth.state = bodyState(earth.def, clock.date);
    const prop = propagateSpherex(clock.date, earth.state);
    if (prop) { e.state = prop.state; latestSpherexTel = prop.telemetry; }
  }
  if (location.hash !== `#/${craftId}`) location.hash = `#/${craftId}`; else select(craftId);
}
info.addEventListener('click', (ev) => {
  const b = (ev.target as HTMLElement).closest<HTMLButtonElement>('.m-ev');
  if (b && !b.disabled) goToMissionEvent(b.dataset.craft!, b.dataset.date!);
  const act = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-spx-action]')?.dataset.spxAction;
  if (act === 'open-lab') spherexLab?.open('telemetry');
  if (act === 'open-px') spherexLab?.open('planetx');
  if (act === 'scope') setTelescopeView(!telescopeView);
});

function showInfo(e: Entity | null) {
  info.classList.toggle('hidden', !e);
  if (!e) return;
  const d = e.def;
  if (e === orbitalEnt && trackedObj && tracker) {
    info.innerHTML = `<button class="close" onclick="location.hash='#/earth'" aria-label="Закрыть"><svg viewBox="0 0 16 16"><path d="M3 3l10 10M13 3L3 13"/></svg></button>
      <h1>${escH(d.name)}</h1><div class="kind">Объект на орбите Земли</div>${tracker.infoHtml(trackedObj)}`;
    return;
  }
  if (e === orbitalEnt && trackedBody) {
    const b = trackedBody, f2 = (x: number, k = 4) => x.toLocaleString('ru-RU', { maximumFractionDigits: k });
    const per = b.e < 1 ? 2 * Math.PI / (0.01720209895 / Math.pow(b.a, 1.5)) / 365.25 : null;
    info.innerHTML = `<button class="close" onclick="location.hash='#/home'" aria-label="Закрыть"><svg viewBox="0 0 16 16"><path d="M3 3l10 10M13 3L3 13"/></svg></button>
      <h1>${escH(d.name)}</h1><div class="kind">${SB_NAMES[b.cls]} · ${escH(b.type)}</div>
      <table>
        ${b.e < 1 ? `<tr><td>Большая полуось</td><td>${f2(b.a)} а.е.</td></tr>` : ''}
        <tr><td>Перигелий q</td><td>${f2(b.q)} а.е.</td></tr>
        <tr><td>Эксцентриситет</td><td>${f2(b.e, 5)}</td></tr>
        <tr><td>Наклонение</td><td>${f2(b.i * 180 / Math.PI, 3)}°</td></tr>
        ${per ? `<tr><td>Период</td><td>${f2(per, 2)} лет</td></tr>` : '<tr><td>Орбита</td><td>разомкнутая (e ≥ 1)</td></tr>'}
        <tr><td>Прохождение перигелия</td><td>${new Date((b.tp - 2440587.5) * 86400000).toISOString().slice(0, 10)}</td></tr>
        ${b.H != null ? `<tr><td>Абс. звёздная величина H</td><td>${f2(b.H, 2)}</td></tr>${b.cls !== 'comet' ? `<tr><td>Диаметр (оценка, альбедо 0,15)</td><td>≈ ${f2(2 * d.radiusKm, 2)} км</td></tr>` : ''}` : ''}
        ${b.discoverer ? `<tr><td>Открыт</td><td>${escH(b.discoverer)}${b.discovery ? ', ' + escH(b.discovery) : ''}</td></tr>` : ''}
        <tr><td>Расстояние до Солнца</td><td id="i-sun"></td></tr>
        <tr><td>Расстояние до Земли</td><td id="i-earth"></td></tr>
        <tr><td>Скорость (гелиоц.)</td><td id="i-vel"></td></tr>
      </table>
      <p class="photos-note" style="margin-top:10px">${b.model ? 'Форма — реальная 3D-модель по данным миссий/радара.' : 'Форма условная: детальной модели этого тела нет.'} Положение — по оскулирующим элементам MPC/JPL (Stellarium).</p>
      <div class="photos-title">ФОТО NASA</div><div id="nasa-photos" class="photos"><span class="photos-note">Загрузка…</span></div>`;
    updateInfo();
    loadPhotos(b.id, b.name.replace(/^\(\d+\)\s*/, '') + (b.cls === 'comet' ? ' comet' : ' asteroid'));
    return;
  }
  const spxExtra = d.id === 'spherex' ? `
    <div class="info-spx-actions">
      <button type="button" class="ui-btn primary" data-spx-action="open-lab">Научная консоль</button>
      <button type="button" class="ui-btn" data-spx-action="scope">${telescopeView ? 'Выйти из телескопа' : 'Вид с телескопа'}</button>
    </div>` : d.id === 'planet-x' ? `
    <div class="info-spx-actions">
      <button type="button" class="ui-btn primary" data-spx-action="open-px">Поиск Planet X</button>
    </div>` : '';
  info.innerHTML = `<button class="close" onclick="location.hash='#/home'">✕</button>
    <h1>${d.name}</h1><div class="kind">${({ star: 'Звезда', planet: 'Планета', dwarf: 'Карликовая планета', moon: 'Спутник', spacecraft: 'Космический аппарат', satellite: 'Спутник Земли / мусор', smallbody: 'Малое тело' })[d.kind]}</div>
    <p>${d.description}</p>
    ${spxExtra}
    <table>
      ${d.agency ? `<tr><td>Агентство</td><td>${d.agency}</td></tr>` : ''}
      ${d.launch ? `<tr><td>Запуск</td><td>${d.launch}</td></tr>` : ''}
      ${d.massKg ? `<tr><td>Масса</td><td>${d.kind === 'spacecraft' ? '≈ ' + fmt(d.massKg, 5) : fmt(d.massKg)} кг</td></tr>` : ''}
      ${d.kind !== 'spacecraft' ? `<tr><td>Радиус</td><td>${fmt(d.radiusKm)} км</td></tr>` : ''}
      ${d.orbitDays ? `<tr><td>Период обращения</td><td>${fmt(d.orbitDays)} сут</td></tr>` : ''}
      ${d.dayHours ? `<tr><td>Период вращения</td><td>${fmt(d.dayHours)} ч</td></tr>` : ''}
      ${d.tiltDeg !== undefined ? `<tr><td>Наклон оси</td><td>${d.tiltDeg}°</td></tr>` : ''}
      ${d.id === 'spherex' ? `<tr><td>Высота / Наклонение</td><td id="i-spx-alt">—</td></tr><tr><td>Спектры / Проход</td><td id="i-spx-spec">—</td></tr>` : ''}
      <tr><td>Расстояние до Солнца</td><td id="i-sun"></td></tr>
      <tr><td>Расстояние до Земли</td><td id="i-earth"></td></tr>
      <tr><td>Скорость (гелиоц.)</td><td id="i-vel"></td></tr>
    </table>
    ${missionBlock(e)}
    <div class="photos-title">ФОТО NASA</div>
    <div id="nasa-photos" class="photos"><span class="photos-note">Загрузка…</span></div>`;
  updateInfo();
  const query = e.def.id === 'planet-x' ? 'Planet Nine outer solar system' : e.def.kind === 'planet' ? `${e.def.name} planet` : e.def.kind === 'spacecraft' ? `${e.def.name} spacecraft` : e.def.name;
  loadPhotos(e.def.id, query);
}

// ---------- Фото из NASA Image and Video Library (публичный API, ключ не нужен) ----------
interface Photo { thumb: string; title: string; id: string }
const photoCache = new Map<string, Photo[]>();
let photoFor = '';
async function loadPhotos(id: string, q: string) {
  photoFor = id;
  const box = () => (photoFor === id ? document.getElementById('nasa-photos') : null);
  let photos: Photo[] = photoCache.get(id) ?? [];
  if (!photoCache.has(id)) {
    try {
      const res = await fetch(`https://images-api.nasa.gov/search?media_type=image&page_size=12&q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      photos = ((data.collection?.items ?? []) as any[]).slice(0, 9).flatMap((it): Photo[] => {
        const href = it.links?.[0]?.href, d = it.data?.[0];
        return href && d ? [{ thumb: String(href), title: String(d.title), id: String(d.nasa_id) }] : [];
      });
      photoCache.set(id, photos);
    } catch {
      const b = box(); if (b) b.innerHTML = '<span class="photos-note">Фото сейчас недоступны</span>';
      return;
    }
  }
  const b = box(); if (!b) return;
  b.innerHTML = photos.length
    ? photos.map((p) => `<a href="https://images.nasa.gov/details/${encodeURIComponent(p.id)}" target="_blank" rel="noopener" title="${p.title.replace(/"/g, '&quot;')}"><img loading="lazy" src="${p.thumb}" alt=""></a>`).join('')
    : '<span class="photos-note">Фото не найдены</span>';
}

function updateInfo() {
  if (!focus) return;
  if (focus === orbitalEnt && trackedObj) { tracker?.updateInfo(trackedObj); return; }
  const s = focus.state, earth = entities.get('earth')!.state;
  const ds = len(s.pos), de = len([s.pos[0] - earth.pos[0], s.pos[1] - earth.pos[1], s.pos[2] - earth.pos[2]]);
  const set = (id: string, t: string) => { const el = document.getElementById(id); if (el) el.textContent = t; };
  set('i-sun', `${fmt(ds / KM_PER_AU, 4)} а.е. (${fmt(ds, 4)} км)`);
  set('i-earth', focus.def.id === 'earth' ? '—' : `${fmt(de / KM_PER_AU, 4)} а.е. (${fmt(de, 4)} км)`);
  set('i-vel', `${fmt(len(s.vel), 3)} км/с`);
  if (focus.def.id === 'spherex') {
    const st = surveyStats(clock.date);
    set('i-spx-alt', latestSpherexTel ? `${latestSpherexTel.altitudeKm.toFixed(1)} км · ${latestSpherexTel.inclinationDeg.toFixed(2)}°` : '—');
    set('i-spx-spec', `${st.totalSpectraBillions.toFixed(2)} млрд · Проход ${st.currentPass}`);
  }
}
setInterval(updateInfo, 250);

// ---------- Кадр ----------
const tmp = new THREE.Vector3();
const _zero = new THREE.Vector3();
const _zenith = new THREE.Vector3();
const _toSun = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _look = new THREE.Vector3();
const _scopeDir = new THREE.Vector3();
const J2000 = Date.UTC(2000, 0, 1, 12);

function frame() {
  clock.tick();
  const date = clock.date;
  const earthEnt = entities.get('earth')!;
  earthEnt.state = bodyState(earthEnt.def, date);

  for (const e of entities.values()) {
    if (e === orbitalEnt) continue; // выбранный орбитальный объект / малое тело — updateOrbitalState()
    if (e.liveTle) {
      const prop = propagateSpherex(date, earthEnt.state);
      latestSpherexTel = prop?.telemetry ?? null;
      e.group.visible = !!prop && (kindOn.spacecraft || e === focus);
      e.label.dataset.hidden = prop ? '' : '1';
      if (prop) e.state = prop.state;
    } else if (e.track) {
      const s = trackState(e.track, date);
      e.group.visible = !!s && (kindOn.spacecraft || e === focus);
      e.label.dataset.hidden = s ? '' : '1';
      if (s) e.state = s;
    } else {
      if (e !== earthEnt) e.state = bodyState(e.def, date);
      e.group.visible = kindOn[e.def.kind] || e === focus;
    }
  }
  updateOrbitalState(date, earthEnt);
  updateOrigin();
  const gk = galaxy.update(camera, toScene([0, 0, 0], _zero), camera.position.length());
  placeOrbitalLayers(date, earthEnt, gk);
  milkyWay.setFade(Math.max(0, 1 - gk * 1.6) * (spherexSky.isEnabled() ? 0.25 : 1));
  lastGk = gk;
  spherexSky.update(camera.position, date, gk);
  eventsEl.style.opacity = String(Math.max(0, 1 - gk * 2));
  labelsEl.style.opacity = String(1 - gk * 1.4 > 0 ? 1 - gk * 1.4 : 0);

  for (const e of entities.values()) {
    toScene(e.state.pos, e.group.position);
    if (e.mesh && e.def.id === 'earth') e.mesh.rotation.y = gmst(date);
    else if (e.mesh && e.def.dayHours) e.mesh.rotation.y = (((date.getTime() - J2000) / 3.6e6) / e.def.dayHours) * Math.PI * 2;
    if (e.liveTle && e.orbit) {
      if (!e.orbitTime || Math.abs(date.getTime() - e.orbitTime) > 10 * 60e3) {
        const ringPts = spherexOrbitRing(date, 180);
        const a = e.orbit.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < Math.min(a.count, ringPts.length); i++) {
          const p = ringPts[i];
          a.setXYZ(i, p[0] / UNIT_KM, p[2] / UNIT_KM, -p[1] / UNIT_KM);
        }
        a.needsUpdate = true;
        e.orbitTime = date.getTime();
      }
      toScene(earthEnt.state.pos, e.orbit.position);
      const fov = e.model?.getObjectByName('spherex-fov');
      if (fov) fov.visible = showScanCone && !telescopeView;
    } else if (!e.track && e.def.orbitDays) {
      if (!e.orbit || Math.abs(date.getTime() - (e.orbitTime ?? 0)) > (e.def.orbitDays ?? 1) * 86400e3 * 0.01) rebuildOrbit(e);
      toScene(parentState(e, date).pos, e.orbit!.position);
    }
    if (e.orbit && e.track) {
      const a = e.orbit.geometry.attributes.position as THREE.BufferAttribute;
      e.track.p.forEach((p, i) => { toScene(p, tmp); a.setXYZ(i, tmp.x, tmp.y, tmp.z); });
      a.needsUpdate = true;
    }
    if (e.orbit && e !== orbitalEnt) e.orbit.visible = showOrbits && gk < 0.9 && (kindOn[e.def.kind] || e === focus) && (!e.track || showTracks || e === focus);
  }
  // Рассеянный свет: вблизи аппарата чуть ярче, чтобы была видна теневая сторона модели
  ambient.intensity = floodOn ? 1.4 : focus?.def.kind === 'spacecraft' || focus?.def.kind === 'satellite' ? 0.35 : focus?.def.kind === 'smallbody' ? 0.5 : focus?.def.id === 'planet-x' ? 0.25 : 0.06;
  toScene([0, 0, 0], sunLight.position);
  // Направление на Солнце для шейдеров атмосферы/огней; облака чуть обгоняют вращение планеты
  for (const e of entities.values()) {
    if (e.sunU) e.sunU.value.copy(sunLight.position).sub(e.group.position).normalize();
    if (e.clouds) e.clouds.rotation.y = ((date.getTime() - J2000) / 3.6e6) * 0.0008;
  }
  // Ориентация аппаратов: SPHEREx — в зенит от Земли с солнечным избеганием (>91°), Parker — на Солнце, остальные — антенной на Землю
  const earthPos = earthEnt.group.position;
  for (const e of entities.values()) {
    if (!e.model || !e.group.visible) continue;
    if (e.liveTle) {
      _zenith.copy(e.group.position).sub(earthPos);
      if (_zenith.lengthSq() > 1e-12) {
        _zenith.normalize();
        _toSun.copy(sunLight.position).sub(e.group.position).normalize();
        const sunDot = _zenith.dot(_toSun);
        if (sunDot > -0.02) {
          _zenith.addScaledVector(_toSun, -(sunDot + 0.06)).normalize();
        }
        _tan.crossVectors(_zenith, _toSun).normalize();
        _zenith.addScaledVector(_tan, Math.sin(date.getTime() * 1e-4) * 0.22).normalize();
        _look.copy(e.group.position).add(_zenith);
        e.group.lookAt(_look);
      }
      continue;
    }
    if (e === orbitalEnt && trackedBody) { e.group.rotation.y = date.getTime() / 3.6e6 * 0.3; continue; }
    const t = aimsAtSun(e.def.id) ? sunLight.position : earthPos;
    if (t.distanceToSquared(e.group.position) > 1e-12) e.group.lookAt(t);
  }

  // Режим вида с телескопа SPHEREx
  if (telescopeView && focus?.liveTle) {
    focus.group.getWorldDirection(_scopeDir);
    camera.position.copy(_scopeDir).multiplyScalar(MODEL_SIZE * 0.9);
    controls.target.copy(_scopeDir).multiplyScalar(MODEL_SIZE * 50);
    camera.lookAt(controls.target);
  } else {
    // Не даём «улететь» слишком далеко от объекта при сдвиге камеры
    if (focus && controls.enablePan) {
      const lim = focus.def.kind === 'spacecraft' ? MODEL_SIZE * 40 : (focus.def.radiusKm / UNIT_KM) * 30;
      if (controls.target.length() > lim) { const k = lim / controls.target.length(); controls.target.multiplyScalar(k); }
    }
    controls.update();
  }

  post.render();
  placeLabels();
  const iso = date.toISOString();
  document.getElementById('date')!.textContent = iso.slice(0, 10);
  document.getElementById('clocktime')!.textContent = iso.slice(11, 19) + ' UTC';
  document.getElementById('rate')!.textContent = clock.describe();
  afterDraw(frame);
}

const LABEL_PRIO: Record<string, number> = { star: 0, planet: 1, dwarf: 2, moon: 3, spacecraft: 4, smallbody: 5, satellite: 5 };
function placeLabels() {
  const w = innerWidth, h = innerHeight;
  const items: { e: Entity; x: number; y: number; show: boolean }[] = [];
  const screen = new Map<string, [number, number]>();
  for (const e of entities.values()) {
    tmp.copy(e.group.position).project(camera);
    const visible = showLabels && tmp.z < 1 && e.label.dataset.hidden !== '1' && (kindOn[e.def.kind] || e === focus);
    const x = (tmp.x * 0.5 + 0.5) * w, y = (-tmp.y * 0.5 + 0.5) * h;
    screen.set(e.def.id, [x, y]);
    let show = visible;
    // Прячем подписи спутников, если они сливаются с родителем
    if (show && e.def.parent) { const p = screen.get(e.def.parent) ?? [0, 0]; if (screen.has(e.def.parent) && Math.hypot(p[0] - x, p[1] - y) < 25) show = false; }
    items.push({ e, x, y, show });
  }
  // Раскладка без наложений: важные объекты (выбранный, звезда, планеты) первыми, остальные прячутся при пересечении
  const placed: [number, number, number][] = [];
  items.sort((a, b) => (a.e === focus ? -1 : LABEL_PRIO[a.e.def.kind]) - (b.e === focus ? -1 : LABEL_PRIO[b.e.def.kind]));
  for (const it of items) {
    if (it.show && it.e !== focus) {
      const bw = it.e.def.name.length * 7 + 24;
      if (placed.some(([px, py, pw]) => Math.abs(px - it.x) < (pw + bw) / 2 && Math.abs(py - it.y) < 15)) it.show = false;
    }
    if (it.show) placed.push([it.x, it.y, it.e.def.name.length * 7 + 24]);
    it.e.label.style.display = it.show ? '' : 'none';
    if (it.show) it.e.label.style.transform = `translate(${it.x}px, ${it.y}px)`;
    it.e.label.classList.toggle('active', it.e === focus);
  }
}

// ---------- UI ----------
function resize() { renderer.setSize(innerWidth, innerHeight, false); post.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);

document.querySelectorAll<HTMLButtonElement>('#timeline [data-rate]').forEach((b) => (b.onclick = () => clock.setRate(+b.dataset.rate!)));
document.getElementById('pause')!.onclick = () => clock.togglePause();
document.getElementById('live')!.onclick = () => clock.goLive();
addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); clock.togglePause(); }
});
// Подсветка активной скорости, иконка паузы, индикатор LIVE
const rateBtns = [...document.querySelectorAll<HTMLButtonElement>('#timeline [data-rate]')];
const pauseBtn = document.getElementById('pause')!, liveBtn = document.getElementById('live')!;
setInterval(() => {
  rateBtns.forEach((b) => b.classList.toggle('on', !clock.paused && +b.dataset.rate! === clock.rate));
  pauseBtn.classList.toggle('paused', clock.paused);
  if (pauseBtn.dataset.state !== String(clock.paused)) {
    pauseBtn.dataset.state = String(clock.paused);
    pauseBtn.innerHTML = clock.paused
      ? '<svg viewBox="0 0 16 16"><path d="M5 3.5v9l7-4.5z" /></svg>'
      : '<svg viewBox="0 0 16 16"><path d="M5.5 3.5v9M10.5 3.5v9" /></svg>';
  }
  liveBtn.classList.toggle('on', clock.isLive());
}, 150);
// ── i18n init ──────────────────────────────────────────────────────────────
initI18n();
document.getElementById('lang-en-btn')!.onclick = () => setLang('en');
document.getElementById('lang-ru-btn')!.onclick = () => setLang('ru');
onLangChange(() => {
  // Re-render dynamic parts that bypass data-i18n
  if (earthLayer) earthLayer.setCatalog(catalog ?? undefined);
});

document.getElementById('menu-btn')!.onclick = () => document.getElementById('menu')!.classList.toggle('hidden');
(document.getElementById('opt-orbits') as HTMLInputElement).onchange = (ev) => (showOrbits = (ev.target as HTMLInputElement).checked);
(document.getElementById('opt-labels') as HTMLInputElement).onchange = (ev) => (showLabels = (ev.target as HTMLInputElement).checked);
(document.getElementById('opt-tracks') as HTMLInputElement).onchange = (ev) => (showTracks = (ev.target as HTMLInputElement).checked);
const optIrSky = document.getElementById('opt-irsky') as HTMLInputElement;
const setIrSky = (on: boolean) => {
  optIrSky.checked = on;
  spherexSky.setEnabled(on);
  document.body.dataset.irsky = on ? '1' : '0';
};
optIrSky.onchange = () => setIrSky(optIrSky.checked);
const optScanCone = document.getElementById('opt-scancone') as HTMLInputElement;
const setScanCone = (on: boolean) => {
  optScanCone.checked = on;
  showScanCone = on;
};
optScanCone.onchange = () => setScanCone(optScanCone.checked);

const flood = document.getElementById('opt-flood') as HTMLInputElement;
let floodOn = false;
const setFlood = (on: boolean) => { flood.checked = on; floodOn = on; };
flood.onchange = () => setFlood(flood.checked);
setFlood(params.get('lighting') === 'flood');

// Командная палитра (/ или Ctrl+K): объекты сцены + внешние каталоги (window.__searchProviders) + дата
const KIND_RU: Record<string, string> = { star: 'Звезда', planet: 'Планета', dwarf: 'Карликовая планета', moon: 'Спутник планеты', spacecraft: 'Космический аппарат', satellite: 'Спутник Земли' };
initCommandPalette((q) => {
  const t = q.trim();
  const items: PaletteItem[] = [];
  const dm = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dm && !Number.isNaN(Date.parse(t + 'T12:00:00Z'))) {
    items.push({ label: `Перейти к дате ${t}`, sub: 'машина времени · 12:00 UTC', kind: 'date', pin: true, go: () => { clock.setTime(Date.parse(t + 'T12:00:00Z')); clock.setRate(1); } });
  }
  items.push({ label: 'Млечный Путь', sub: 'Milky Way · галактика', kind: 'galaxy', go: () => { location.hash = '#/milky-way'; } });
  items.push({ label: 'Вся Солнечная система', sub: 'home · обзор', kind: 'galaxy', go: () => { location.hash = '#/home'; } });
  for (const e of entities.values()) {
    const parent = e.def.parent ? entities.get(e.def.parent)?.def.name : '';
    items.push({ label: e.def.name, sub: `${KIND_RU[e.def.kind] ?? e.def.kind}${parent ? ' · ' + parent : ''} · ${e.def.id}`, kind: e.def.kind, go: () => { location.hash = `#/${e.def.id}`; } });
  }
  const providers = ((window as unknown as { __searchProviders?: ((q: string) => PaletteItem[])[] }).__searchProviders) ?? [];
  for (const p of providers) { try { items.push(...p(t)); } catch { /* провайдер упал — не ломаем поиск */ } }
  return items;
});

// ---------- Карточки событий и истории ----------
const eventsEl = document.getElementById('events')!;
const storyEl = document.getElementById('story')!;
document.getElementById('event-cards')!.innerHTML = STORIES.map((s) => {
  const yr = (s.subtitle.match(/\d{4}/g) ?? []).pop() ?? '';
  return `<a class="ev-row" href="#/story/${s.id}" title="${s.subtitle}"><span>${s.title}</span><em>${yr}</em></a>`;
}).join('');
document.getElementById('events-count')!.textContent = String(STORIES.length);
{
  const box = document.getElementById('events')!, btn = document.getElementById('events-toggle')!;
  let open = true; try { open = localStorage.getItem('eventsOpen') !== '0'; } catch { /* ignore */ }
  const apply = () => { box.classList.toggle('collapsed', !open); btn.setAttribute('aria-expanded', String(open)); };
  apply();
  btn.addEventListener('click', () => { open = !open; apply(); try { localStorage.setItem('eventsOpen', open ? '1' : '0'); } catch { /* ignore */ } });
}

function playStory(story: Story, index: number) {
  const step = story.steps[Math.min(Math.max(index, 0), story.steps.length - 1)];
  const i = story.steps.indexOf(step);
  clock.setTime(step.time === 'now' ? Date.now() : Date.parse(step.time));
  clock.setRate(step.rate ?? 0);
  if (story.id === 'spherex-allsky' && !spherexSky.isEnabled()) setIrSky(true);
  select(step.focus, step.distanceKm, false);
  const link = (k: number) => `#/story/${story.id}/${k}`;
  storyEl.innerHTML = `
    <div class="story-head"><span class="story-name">${story.title}</span><a class="close" href="#/home">✕</a></div>
    <div class="story-progress">${story.steps.map((_, k) => `<a href="${link(k)}" class="${k === i ? 'on' : ''}"></a>`).join('')}</div>
    <h2>${step.title}</h2>
    <p>${step.text}</p>
    <div class="story-nav">
      ${i > 0 ? `<a href="${link(i - 1)}">← Назад</a>` : '<span></span>'}
      <span class="story-count">${i + 1} / ${story.steps.length}</span>
      ${i < story.steps.length - 1 ? `<a href="${link(i + 1)}">Далее →</a>` : `<a href="#/home">Готово</a>`}
    </div>`;
}

function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('?')[0].split('/');
  const id = parts[0] || 'home';
  const story = id === 'story' ? STORIES.find((s) => s.id === parts[1]) : undefined;
  eventsEl.classList.toggle('hidden', id !== 'home');
  storyEl.classList.toggle('hidden', !story);
  if (story) return playStory(story, +(parts[2] ?? 0));
  if (clock.rate === 0) clock.goLive(); // вышли из истории на остановленном кадре
  if (id === 'milky-way') return selectGalaxy();
  if (id === 'sat') {
    const norad = +parts[1];
    if (!catalog) return;
    if (!trackedObj || trackedObj.norad !== norad || !orbitalEnt) { if (!selectOrbital(norad)) return; }
    if (focus?.def.kind !== 'satellite' && focus?.def.id !== 'earth') { flight = null; }
    return select('sat-' + norad);
  }
  if (id === 'sb') {
    const b = sbLayer?.bodies.find((x) => x.id === 'sb-' + parts.slice(1).join('/'));
    if (!b) return;
    const diam = selectSmallBody(b);
    return select(b.id, Math.max(diam * 5, 3));
  }
  if (trackedObj || trackedBody) { dropOrbitalEntity(); trackedObj = null; trackedBody = null; tracker?.onTracked(null); }
  select(id);
}
addEventListener('hashchange', route);

// ---------- AI-ассистент ----------
initAssistant(() => ({ focusId: viewingGalaxy() ? 'milky-way' : focus?.def.id ?? null, focusName: viewingGalaxy() ? 'Milky Way (Млечный Путь)' : focus?.def.name ?? null, date: clock.date.toISOString().slice(0, 10) }));

// ---------- Старт ----------
(async () => {
  const fill = document.querySelector<HTMLDivElement>('#loader .fill')!;
  resize();
  addStars();
  BODIES.forEach(addBody);
  fill.style.width = '50%';
  await loadSpacecraft();
  fill.style.width = '70%';
  // Реальные каталоги: орбита Земли (CelesTrak) и малые тела (MPC/JPL); сбой одного не ломает остальное
  try { catalog = await loadBundledCatalog(); earthLayer.setCatalog(catalog); earthLayer.setDanger(isLaunchDangerous); } catch (err) { console.warn('catalog', err); }
  try { sbLayer = await createSmallBodyLayer(); scene.add(sbLayer.points, sbLayer.neaLines); } catch (err) { console.warn('small bodies', err); }
  // Зелёные коридоры запуска (показывать только когда смотрим на Землю)
  launchCorridorGroup = createLaunchCorridors();
  if (catalog) {
    tracker = initTracker({
      getDate: () => clock.date,
      layer: earthLayer,
      sb: sbLayer,
      getCatalog: () => catalog!,
      setCatalog: (c) => { catalog = c; earthLayer.setCatalog(c); earthLayer.setDanger(isLaunchDangerous); if (trackedObj) { const n = c.byNorad.get(trackedObj.norad); if (n && selectOrbital(n.norad)) select('sat-' + n.norad, undefined, true); } },
      track: (norad) => { location.hash = `#/sat/${norad}`; },
      trackSmallBody: (b) => { location.hash = `#/sb/${b.id.slice(3)}`; },
      getTracked: () => trackedObj,
      flyToEarth: () => { if (location.hash !== '#/earth') location.hash = '#/earth'; else select('earth', 60000, false); },
      setLayerVisible: (on) => { kindOn.satellite = on; const cb = document.querySelector<HTMLInputElement>('#toolbox input[data-kind="satellite"]'); if (cb) cb.checked = on; },
      isLayerVisible: () => kindOn.satellite,
    });
    const tb = document.getElementById('tracker-btn');
    if (tb) tb.onclick = () => { document.getElementById('spherex-lab')?.classList.add('hidden'); tracker!.toggle(); };
    document.getElementById('spherex-lab-btn')?.addEventListener('click', () => tracker?.close());
    const w = window as unknown as { __searchProviders?: ((q: string) => unknown[])[] };
    (w.__searchProviders ??= []).push((q) => tracker!.search(q));
  }
  // Настоящие снимки неба SPHEREx и сравнение эпох; «О проекте»
  const sky = initSkyViewer();
  const about = initAbout();
  document.getElementById('skyview-btn')?.addEventListener('click', () => { tracker?.close(); document.getElementById('spherex-lab')?.classList.add('hidden'); sky.toggle(); });
  document.getElementById('about-btn')?.addEventListener('click', () => about.open());
  for (const id of ['tracker-btn', 'spherex-lab-btn', 'toolbox-btn', 'missions-btn']) document.getElementById(id)?.addEventListener('click', () => sky.close());
  if (params.get('sky') === '1' || location.hash.startsWith('#/sky')) sky.open();
  // Клик по сцене: выбор спутника/обломка или малого тела (без перетаскивания)
  let down: [number, number] | null = null;
  canvas.addEventListener('pointerdown', (ev) => { down = [ev.clientX, ev.clientY]; });
  canvas.addEventListener('pointerup', (ev) => {
    if (!down || Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) > 4) { down = null; return; }
    down = null;
    camera.updateMatrixWorld();
    const o = earthLayer.root.visible ? earthLayer.pick(ev.clientX, ev.clientY, camera, clock.date) : null;
    if (o) { location.hash = `#/sat/${o.norad}`; return; }
    // Круглый хитбокс планет, лун и аппаратов: радиус = max(видимый радиус диска, 18 px)
    const hit = pickBody(ev.clientX, ev.clientY);
    if (hit) { location.hash = `#/${hit.def.id}`; return; }
    const b = sbLayer?.points.visible ? sbLayer.pick(ev.clientX, ev.clientY, camera) : null;
    if (b) location.hash = `#/sb/${b.id.slice(3)}`;
  });
  initToolbox(entities, kindOn, () => (viewingGalaxy() ? 'milky-way' : focus?.def.id ?? null), goToMissionEvent, { satellite: catalog?.objects.length ?? 0, smallbody: sbLayer?.bodies.length ?? 0 });
  document.querySelector('[data-open-tracker]')?.addEventListener('click', () => tracker?.open('catalog'));
  spherexLab = initSpherexLab({
    getDate: () => clock.date,
    getTelemetry: () => latestSpherexTel,
    getTle: () => getActiveTle(),
    isIrSkyEnabled: () => spherexSky.isEnabled(),
    setIrSkyEnabled: (on) => setIrSky(on),
    getSurveyBand: () => spherexSky.getBand(),
    setSurveyBand: (band) => {
      spherexSky.setBand(band);
      scopeBandEl.textContent = band === 'color' ? 'RGB-ИК (0.75–5.0 мкм)' : `${band} ИК-канал`;
    },
    isScanConeEnabled: () => showScanCone,
    setScanConeEnabled: (on) => setScanCone(on),
    isTelescopeView: () => telescopeView,
    setTelescopeView: (on) => setTelescopeView(on),
    focusBody: (id) => {
      if (location.hash !== `#/${id}`) location.hash = `#/${id}`;
      else select(id);
    },
  });
  document.getElementById('search-list')!.innerHTML = ['Milky Way', 'Млечный Путь', ...[...entities.values()].map((e) => e.def.name)].map((n) => `<option value="${n}">`).join('');
  fill.style.width = '100%';
  route();
  afterDraw(frame);
  hd.start();
  setTimeout(() => document.getElementById('loader')!.classList.add('done'), 400);
  startIntro();
  // Отладочный доступ из консоли браузера (dev/testing only, ничего не ломает в проде)
  (window as unknown as { __se: unknown }).__se = { kindOn, entities, select, clock, focus: () => focus };
})();
