// Графика: настоящий Млечный Путь на фоне (Solar System Scope, CC BY 4.0) в правильной
// галактической ориентации, постобработка (тон-маппинг + мягкое свечение ярких источников)
// и фоновая подгрузка текстур высокого разрешения после старта.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const OBL = (23.4392911 * Math.PI) / 180;

// Карта неба в галактических координатах: l растёт влево, центр Галактики посередине, юг (b<0) сверху.
// Направление в сцене → эклиптика → экватор J2000 → галактика (матрица IAU).
const SKY_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_Position.z = gl_Position.w * 0.99999; // всегда позади всего
  #include <logdepthbuf_vertex>
}`;
const SKY_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uMap;
uniform float uBright;
uniform float uCosE;
uniform float uSinE;
varying vec3 vDir;
void main() {
  #include <logdepthbuf_fragment>
  vec3 d = normalize(vDir);
  vec3 ecl = vec3(d.x, -d.z, d.y);
  vec3 eq = vec3(ecl.x, uCosE * ecl.y - uSinE * ecl.z, uSinE * ecl.y + uCosE * ecl.z);
  vec3 g = vec3(
    -0.0548755604 * eq.x - 0.8734370902 * eq.y - 0.4838350155 * eq.z,
     0.4941094279 * eq.x - 0.4448296300 * eq.y + 0.7469822445 * eq.z,
    -0.8676661490 * eq.x - 0.1980763734 * eq.y + 0.4559837762 * eq.z);
  float l = atan(g.y, g.x);
  float b = asin(clamp(g.z, -1.0, 1.0));
  vec2 uv = vec2(fract(0.5 - l / 6.28318530718), 0.5 - b / 3.14159265359);
  vec3 c = texture2D(uMap, uv).rgb;
  gl_FragColor = vec4(c * uBright, 1.0);
  #include <colorspace_fragment>
}`;

export interface SkyBackground { mesh: THREE.Mesh; setFade(k: number): void }

export function createMilkyWay(scene: THREE.Scene, camera: THREE.Camera, maxAniso: number): SkyBackground {
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, depthTest: false,
    uniforms: { uMap: { value: null }, uBright: { value: 0 }, uCosE: { value: Math.cos(OBL) }, uSinE: { value: Math.sin(OBL) } },
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  mesh.onBeforeRender = () => { mesh.position.copy(camera.position); mesh.scale.setScalar(1); };
  scene.add(mesh);
  let base = 3.6, fade = 1;
  new THREE.TextureLoader().load('textures/hd/milkyway_4k.jpg', (t) => {
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; t.wrapS = THREE.RepeatWrapping;
    mat.uniforms.uMap.value = t; mat.uniforms.uBright.value = base * fade;
  });
  return { mesh, setFade(k) { fade = k; if (mat.uniforms.uMap.value) mat.uniforms.uBright.value = base * fade; mesh.visible = k > 0.01; } };
}

/** Тон-маппинг ACES + мягкое свечение (bloom) только для ярких источников: Солнце, блики. */
export function createPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, enabled: boolean) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  if (!enabled) return { render: () => renderer.render(scene, camera), setSize: (_w: number, _h: number) => {} };
  const size = renderer.getSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.38, 0.5, 0.97);   // светится только почти белое: Солнце, яркие звёзды
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  return {
    render: () => composer.render(),
    setSize: (w: number, h: number) => { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); },
  };
}

/** Очередь фоновой подгрузки HD-текстур: по одной, когда браузер свободен. */
export function hdQueue() {
  const loader = new THREE.TextureLoader();
  const jobs: { url: string; apply: (t: THREE.Texture) => void; color: boolean }[] = [];
  let running = false;
  const idle = (cb: () => void) => ((window as unknown as { requestIdleCallback?: (f: () => void, o?: object) => void }).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 200)))(cb, { timeout: 1500 });
  const next = () => {
    const j = jobs.shift();
    if (!j) { running = false; return; }
    running = true;
    idle(() => loader.load(j.url, (t) => { if (j.color) t.colorSpace = THREE.SRGBColorSpace; j.apply(t); next(); }, undefined, () => next()));
  };
  return {
    add(url: string, apply: (t: THREE.Texture) => void, color = true) { jobs.push({ url, apply, color }); },
    start() { if (!running) setTimeout(next, 1500); },
  };
}
