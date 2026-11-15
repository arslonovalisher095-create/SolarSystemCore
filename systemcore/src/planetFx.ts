import * as THREE from 'three';

/** Общие эффекты планет: атмосфера (свечение по краю), ночные огни Земли, перевод карты бликов в шероховатость. */
export type SunUniform = { value: THREE.Vector3 };

const vert = /* glsl */ `
  varying vec3 vN; varying vec3 vW; varying vec2 vUv;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    vUv = uv;
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
    #include <logdepthbuf_vertex>
  }`;

export interface AtmoCfg { color: string; scale: number; power: number; strength: number }
/** Параметры атмосфер: цвет, толщина (доля радиуса), резкость края, яркость. */
export const ATMOSPHERES: Record<string, AtmoCfg> = {
  venus:   { color: '#ffcc88', scale: 1.035, power: 2.2, strength: 1.3 },
  earth:   { color: '#5aa8ff', scale: 1.03,  power: 3.0, strength: 1.8 },
  mars:    { color: '#e8a87c', scale: 1.015, power: 3.2, strength: 0.7 },
  jupiter: { color: '#e8d2b0', scale: 1.012, power: 3.0, strength: 0.45 },
  saturn:  { color: '#efe0b4', scale: 1.012, power: 3.0, strength: 0.45 },
  uranus:  { color: '#a8f0f4', scale: 1.03,  power: 2.6, strength: 1.2 },
  neptune: { color: '#5f86ff', scale: 1.03,  power: 2.6, strength: 1.4 },
  titan:   { color: '#e8a640', scale: 1.06,  power: 2.0, strength: 1.2 },
  'planet-x': { color: '#e06cff', scale: 1.04, power: 2.2, strength: 1.3 },
};

export function makeAtmosphere(radius: number, cfg: AtmoCfg, sun: SunUniform) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSun: sun, uColor: { value: new THREE.Color(cfg.color) }, uPower: { value: cfg.power }, uStrength: { value: cfg.strength } },
    vertexShader: vert,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun; uniform vec3 uColor; uniform float uPower; uniform float uStrength;
      varying vec3 vN; varying vec3 vW; varying vec2 vUv;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vN), V = normalize(cameraPosition - vW);
        float rim = pow(1.0 - max(dot(V, n), 0.0), uPower);
        float lit = smoothstep(-0.3, 0.5, dot(n, uSun));
        gl_FragColor = vec4(uColor * lit * uStrength, rim * clamp(lit * uStrength, 0.0, 1.0));
      }`,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.FrontSide,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(radius * cfg.scale, 64, 32), mat);
}

/** Огни городов: видны только на ночной стороне. Добавляется дочерним к мешу планеты (вращается вместе с ней). */
export function makeNightLights(radius: number, map: THREE.Texture, sun: SunUniform) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSun: sun, uMap: { value: map } },
    vertexShader: vert,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun; uniform sampler2D uMap;
      varying vec3 vN; varying vec3 vW; varying vec2 vUv;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        float night = smoothstep(0.1, -0.2, dot(normalize(vN), uSun));
        vec3 c = texture2D(uMap, vUv).rgb;
        gl_FragColor = vec4(c * vec3(1.0, 0.8, 0.5) * 1.7 * night, 1.0);
      }`,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(radius * 1.0015, 128, 64), mat);
}

/** Карта бликов (белое = вода) → карта шероховатости (вода гладкая ≈0.3, суша ≈1). */
export function specularToRoughness(img: HTMLImageElement): THREE.CanvasTexture {
  const W = 1024, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = Math.round((1 - 0.7 * (d.data[i] / 255)) * 255);
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
  }
  g.putImageData(d, 0, 0);
  return new THREE.CanvasTexture(c);
}
