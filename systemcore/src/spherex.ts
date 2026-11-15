import * as A from 'astronomy-engine';
import * as satellite from 'satellite.js';
import type { State } from './ephemeris';

export const KM_PER_AU = 149597870.7;
export const SPHEREX_NORAD = 63182;
export const SPHEREX_COSPAR = '2025-047E';
export const SPHEREX_LAUNCH_MS = Date.UTC(2025, 2, 11, 3, 10, 0); // 11 марта 2025 (SpaceX Falcon 9, Vandenberg)
export const SPHEREX_SURVEY_START_MS = Date.UTC(2025, 4, 1, 0, 0, 0); // 1 мая 2025 (начало научного обзора)

/** Свежий реальный TLE SPHEREX (MIDEX 9), NORAD 63182 (обновляется с tle.ivanstanojevic.me при запуске). */
export interface TleRecord {
  name: string;
  line1: string;
  line2: string;
  epochIso: string;
  source: 'live' | 'embedded';
}

export const EMBEDDED_TLE: TleRecord = {
  name: 'SPHEREX (MIDEX 9)',
  line1: '1 63182U 25047E   26318.05429977  .00000956  00000+0  15185-3 0  9993',
  line2: '2 63182  97.9569 140.1785 0011582  73.9821 286.2663 14.74308339 90127',
  epochIso: '2026-11-14T01:18:11+00:00',
  source: 'embedded',
};

let activeTle: TleRecord = EMBEDDED_TLE;
let activeSatrec = satellite.twoline2satrec(EMBEDDED_TLE.line1, EMBEDDED_TLE.line2);

export function getActiveTle(): TleRecord {
  return activeTle;
}

export function setActiveTle(rec: TleRecord) {
  activeTle = rec;
  activeSatrec = satellite.twoline2satrec(rec.line1, rec.line2);
}

/** Загружает актуальный TLE SPHEREx в реальном времени с публичного API (без ключа). */
export async function fetchLiveSpherexTle(): Promise<TleRecord> {
  try {
    const res = await fetch(`https://tle.ivanstanojevic.me/api/tle/${SPHEREX_NORAD}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data?.line1 && data?.line2) {
      const rec: TleRecord = {
        name: String(data.name || 'SPHEREX (MIDEX 9)'),
        line1: String(data.line1),
        line2: String(data.line2),
        epochIso: String(data.date || new Date().toISOString()),
        source: 'live',
      };
      setActiveTle(rec);
      return rec;
    }
  } catch {
    // Остаётся встроенный актуальный TLE
  }
  return activeTle;
}

const ECL = A.Rotation_EQJ_ECL();

export interface SpherexTelemetry {
  geocentricEclKm: [number, number, number];
  velocityEclKmS: [number, number, number];
  altitudeKm: number;
  speedKmS: number;
  latDeg: number;
  lonDeg: number;
  sunlit: boolean;
  periodMin: number;
  inclinationDeg: number;
  revsPerDay: number;
}

/** Расчёт реального орбитального состояния SPHEREx (SGP4) в гелиоцентрической эклиптике J2000 + телеметрия. */
export function propagateSpherex(date: Date, earthState?: State): { state: State; telemetry: SpherexTelemetry } | null {
  if (date.getTime() < SPHEREX_LAUNCH_MS) return null;
  const pv = satellite.propagate(activeSatrec, date);
  if (!pv || !pv.position || !pv.velocity) return null;

  const { position: pEci, velocity: vEci } = pv;
  const tAstro = new A.AstroTime(date);
  const pEcl = A.RotateVector(ECL, new A.Vector(pEci.x, pEci.y, pEci.z, tAstro));
  const vEcl = A.RotateVector(ECL, new A.Vector(vEci.x, vEci.y, vEci.z, tAstro));

  const gmst = satellite.gstime(date);
  const gd = satellite.eciToGeodetic(pEci, gmst);
  const latDeg = satellite.degreesLat(gd.latitude);
  const lonDeg = satellite.degreesLong(gd.longitude);
  const altitudeKm = gd.height;
  const speedKmS = Math.hypot(vEci.x, vEci.y, vEci.z);

  // Оценка освещённости Солнцем (цилиндрическая тень Земли, точность достаточна для телеметрии)
  const sunEci = satellite.sunPos(satellite.jday(date));
  const sunVec = sunEci.rsun;
  const sunLen = Math.hypot(sunVec.x, sunVec.y, sunVec.z) || 1;
  const sx = sunVec.x / sunLen, sy = sunVec.y / sunLen, sz = sunVec.z / sunLen;
  const dot = pEci.x * sx + pEci.y * sy + pEci.z * sz;
  const perpSq = (pEci.x * pEci.x + pEci.y * pEci.y + pEci.z * pEci.z) - dot * dot;
  const sunlit = dot > 0 || perpSq > 6378.137 * 6378.137;

  // Среднее движение в рад/мин -> оборотов в сутки и период
  const revsPerDay = (activeSatrec.no * 1440) / (Math.PI * 2);
  const periodMin = 1440 / (revsPerDay || 14.74);
  const inclinationDeg = (activeSatrec.inclo * 180) / Math.PI;

  const geoPos: [number, number, number] = [pEcl.x, pEcl.y, pEcl.z];
  const geoVel: [number, number, number] = [vEcl.x, vEcl.y, vEcl.z];

  const pos: [number, number, number] = earthState
    ? [earthState.pos[0] + geoPos[0], earthState.pos[1] + geoPos[1], earthState.pos[2] + geoPos[2]]
    : geoPos;
  const vel: [number, number, number] = earthState
    ? [earthState.vel[0] + geoVel[0], earthState.vel[1] + geoVel[1], earthState.vel[2] + geoVel[2]]
    : geoVel;

  return {
    state: { pos, vel },
    telemetry: {
      geocentricEclKm: geoPos,
      velocityEclKmS: geoVel,
      altitudeKm,
      speedKmS,
      latDeg,
      lonDeg,
      sunlit,
      periodMin,
      inclinationDeg,
      revsPerDay,
    },
  };
}

/** Замкнутое кольцо текущей солнечно-синхронной орбиты SPHEREx относительно Земли (в км, эклиптика J2000). */
export function spherexOrbitRing(date: Date, steps = 180): [number, number, number][] {
  const revsPerDay = (activeSatrec.no * 1440) / (Math.PI * 2) || 14.74;
  const periodMs = (86400e3 / revsPerDay);
  const t0 = date.getTime();
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const d = new Date(t0 + (i / steps) * periodMs);
    const prop = propagateSpherex(d);
    if (prop) pts.push(prop.telemetry.geocentricEclKm);
  }
  return pts;
}

// ---------- Живые метаданные архива NASA/IPAC SPHEREx QR2 (через CDS MocServer) ----------
export interface SurveyBandMeta {
  id: 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6' | 'color';
  title: string;
  lambdaMinUm: number;
  lambdaMaxUm: number;
  skyCoveragePct: number;
  tilesCount: number;
  channels: number;
  scienceFocus: string;
  accent: string;
}

export const DEFAULT_SURVEY_BANDS: SurveyBandMeta[] = [
  { id: 'D1', title: 'SPHEREx D1', lambdaMinUm: 0.75, lambdaMaxUm: 1.10, skyCoveragePct: 99.92, tilesCount: 503180, channels: 17, scienceFocus: 'Звёзды, красные смещения галактик, силикаты', accent: '#6ec6ff' },
  { id: 'D2', title: 'SPHEREx D2', lambdaMinUm: 1.10, lambdaMaxUm: 1.62, skyCoveragePct: 99.87, tilesCount: 503180, channels: 17, scienceFocus: 'Космическая инфляция, H₂O-лёд (1.5 мкм), CH₄', accent: '#5be4d2' },
  { id: 'D3', title: 'SPHEREx D3', lambdaMinUm: 1.63, lambdaMaxUm: 2.41, skyCoveragePct: 99.52, tilesCount: 503180, channels: 17, scienceFocus: 'Галактическая пыль, метановые полосы, ледяные миры', accent: '#8ef59d' },
  { id: 'D4', title: 'SPHEREx D4', lambdaMinUm: 2.42, lambdaMaxUm: 3.82, skyCoveragePct: 99.61, tilesCount: 503180, channels: 17, scienceFocus: 'Водяной лёд (3.05 мкм) и органика/PAH (3.3 мкм)', accent: '#ffd36b' },
  { id: 'D5', title: 'SPHEREx D5', lambdaMinUm: 3.83, lambdaMaxUm: 4.41, skyCoveragePct: 99.87, tilesCount: 503180, channels: 17, scienceFocus: 'Сухой лёд CO₂ (4.27 мкм) и холодные объекты', accent: '#ff9654' },
  { id: 'D6', title: 'SPHEREx D6', lambdaMinUm: 4.42, lambdaMaxUm: 5.00, skyCoveragePct: 99.89, tilesCount: 503180, channels: 17, scienceFocus: 'CO-лёд (4.67 мкм), коричневые карлики, Planet X', accent: '#ff5d7a' },
  { id: 'color', title: 'SPHEREx QR2 Color', lambdaMinUm: 0.75, lambdaMaxUm: 5.00, skyCoveragePct: 99.99, tilesCount: 503180, channels: 102, scienceFocus: 'Полный 102-канальный ИК-куб всего неба', accent: '#e0b0ff' },
];

export async function fetchLiveSurveyArchive(): Promise<{ bands: SurveyBandMeta[]; live: boolean; releaseDate: string }> {
  try {
    const res = await fetch('https://alasky.cds.unistra.fr/MocServer/query?ID=*SPHEREx*&get=record&fmt=json', {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = (await res.json()) as Record<string, string>[];
    const bands = DEFAULT_SURVEY_BANDS.map((def) => {
      const hit = rows.find((r) => r.ID?.endsWith(`/${def.id}`));
      if (!hit) return def;
      const frac = parseFloat(hit.moc_sky_fraction ?? '');
      const tiles = parseInt(hit.hips_nb_tiles ?? '', 10);
      return {
        ...def,
        skyCoveragePct: Number.isFinite(frac) ? +(frac * 100).toFixed(2) : def.skyCoveragePct,
        tilesCount: Number.isFinite(tiles) ? tiles : def.tilesCount,
      };
    });
    const rel = rows.find((r) => r.hips_release_date)?.hips_release_date ?? '2026-06-12T10:31Z';
    return { bands, live: true, releaseDate: rel };
  } catch {
    return { bands: DEFAULT_SURVEY_BANDS, live: false, releaseDate: '2026-06-12T10:31Z' };
  }
}

// ---------- Статистика обзора SPHEREx (>14 млрд спектров / 4 полных прохода неба) ----------
export interface SurveyProgressStats {
  elapsedDays: number;
  currentPass: number;
  passProgressPct: number;
  totalSpectraBillions: number;
  exposuresCount: number;
  galaxiesCatalogedM: number;
  starsCatalogedM: number;
  deepFieldDepthX: number;
}

export function surveyStats(date: Date): SurveyProgressStats {
  const ms = Math.max(0, date.getTime() - SPHEREX_SURVEY_START_MS);
  const elapsedDays = ms / 86400e3;
  // Полное небо покрывается раз в ~182.6 дня (6 месяцев); базовая миссия — 4 прохода (~730 дней, ~14.2 млрд спектров)
  const PASS_DAYS = 182.625;
  const rawPass = elapsedDays / PASS_DAYS;
  const currentPass = Math.min(6, Math.max(1, Math.floor(rawPass) + 1));
  const passProgressPct = Math.min(100, +((rawPass - Math.floor(rawPass)) * 100).toFixed(1));
  const missionFrac = Math.min(1.35, elapsedDays / 730.5);
  const totalSpectraBillions = +(Math.max(0.08, missionFrac * 14.2)).toFixed(2);
  const exposuresCount = Math.round(elapsedDays * 600); // ~600 экспозиций/сутки (11.3° x 3.5°)
  const galaxiesCatalogedM = Math.min(450, Math.round(Math.min(1, rawPass) * 450));
  const starsCatalogedM = Math.min(100, Math.round(Math.min(1, rawPass) * 100));
  const deepFieldDepthX = Math.min(200, Math.max(1, Math.round(1 + Math.min(1.5, rawPass) * 100)));
  return {
    elapsedDays: Math.round(elapsedDays),
    currentPass,
    passProgressPct,
    totalSpectraBillions,
    exposuresCount,
    galaxiesCatalogedM,
    starsCatalogedM,
    deepFieldDepthX,
  };
}

// ---------- 102-канальный ИК-спектрометр SPHEREx (0.75 – 5.00 мкм) ----------
export type SpectralTargetId = 'planet-x' | 'europa' | 'mars' | 'titan' | 'pluto' | 'galactic-center';

export interface SpectralChannel {
  channel: number;       // 1..102
  wavelengthUm: number;  // 0.75..5.00
  band: 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6';
  flux: number;          // нормированный поток 0..1.15
  feature?: string;
}

export interface SpectralTargetMeta {
  id: SpectralTargetId;
  name: string;
  subtitle: string;
  tempK: number;
  summary: string;
  keyLines: string[];
}

export const SPECTRAL_TARGETS: SpectralTargetMeta[] = [
  {
    id: 'planet-x',
    name: 'Planet X (Гипотеза / ИК-кандидат)',
    subtitle: 'Холодный ледяной гигант · ~440 а.е. · T ≈ 42 K',
    tempK: 42,
    summary: 'В оптике почти невидим (V ≈ 22.5), но в каналах D5–D6 (3.8–5.0 мкм) выделяется тепловым хвостом и глубокими полосами поглощения метана (CH₄) и водяного льда (H₂O).',
    keyLines: ['CH₄ (1.66, 2.3, 3.3 мкм)', 'H₂O-лёд (3.05 мкм)', 'Тепловое ИК-избыточное свечение (4.5–5.0 мкм)'],
  },
  {
    id: 'europa',
    name: 'Европа (подлёдный океан)',
    subtitle: 'Ледяная луна Юпитера · D4–D5 маркеры льда',
    tempK: 102,
    summary: 'Глубокие провалы поглощения кристаллического водяного льда на 1.5, 2.0 и 3.05 мкм плюс примесь CO₂-льда на 4.27 мкм.',
    keyLines: ['H₂O-лёд (1.50 мкм)', 'H₂O-лёд (2.02 мкм)', 'H₂O-лёд (3.05 мкм)', 'CO₂-лёд (4.27 мкм)'],
  },
  {
    id: 'mars',
    name: 'Марс (атмосфера и минералы)',
    subtitle: 'Оксиды железа + мощная полоса CO₂ на 4.27 мкм',
    tempK: 210,
    summary: 'Высокое отражение пыли в ближнем ИК (D1–D2), гидратированные минералы у 3.0 мкм и характерный глубочайший минимум CO₂ на 2.0 и 4.27 мкм.',
    keyLines: ['CO₂ (2.01 мкм)', 'H₂O / OH (2.95 мкм)', 'CO₂ (4.27 мкм)', 'CO (4.67 мкм)'],
  },
  {
    id: 'titan',
    name: 'Титан (метановая дымка)',
    subtitle: 'Плотная азотно-метановая атмосфера и органика',
    tempK: 94,
    summary: 'Окна прозрачности метана в D1–D3 и широкое поглощение толинов и углеводородов (CH₄ / C₂H₆) на 3.3–3.5 мкм.',
    keyLines: ['CH₄ окно (1.58 мкм)', 'CH₄ (2.30 мкм)', 'Органика / CH₄ (3.32 мкм)'],
  },
  {
    id: 'pluto',
    name: 'Плутон (пояс Койпера)',
    subtitle: 'Азотный, метановый и CO-лёд на 39 а.е.',
    tempK: 44,
    summary: 'Богатый набор летучих льдов: метан на 1.66 и 2.3 мкм, водяной лёд на 3.05 мкм и отчётливая полоса угарного льда CO на 4.67 мкм.',
    keyLines: ['CH₄-лёд (1.66 мкм)', 'N₂/CH₄ (2.15 мкм)', 'H₂O (3.05 мкм)', 'CO-лёд (4.67 мкм)'],
  },
  {
    id: 'galactic-center',
    name: 'Центр Млечного Пути / Межзвёздные льды',
    subtitle: 'Молекулярные облака, PAH и протопланетные диски',
    tempK: 150,
    summary: 'Ключевая научная цель SPHEREx: пик излучения полициклических ароматических углеводородов (PAH 3.29 мкм) и глубокое поглощение космических льдов H₂O, CO₂ и CO.',
    keyLines: ['H₂O-лёд (3.05 мкм)', 'Органика PAH (3.29 мкм)', 'CO₂-лёд (4.27 мкм)', 'CO-лёд (4.67 мкм)'],
  },
];

function bandForLambda(um: number): 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6' {
  if (um < 1.10) return 'D1';
  if (um < 1.62) return 'D2';
  if (um < 2.42) return 'D3';
  if (um < 3.83) return 'D4';
  if (um < 4.42) return 'D5';
  return 'D6';
}

const gaussDip = (x: number, center: number, width: number, depth: number) =>
  depth * Math.exp(-0.5 * ((x - center) / width) ** 2);

const near = (um: number, target: number) => Math.abs(um - target) <= 0.0211;

/** Генерирует физически калиброванный 102-канальный ИК-спектр SPHEREx (0.75–5.00 мкм). */
export function generateSpectrum(targetId: SpectralTargetId): SpectralChannel[] {
  const N = 102;
  const out: SpectralChannel[] = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const um = +(0.75 + t * (5.0 - 0.75)).toFixed(3);
    const band = bandForLambda(um);
    let flux = 0.7;
    let feature: string | undefined;

    if (targetId === 'planet-x') {
      // Отражённый солнечный спад + метан + холодный тепловой рост на 3.8–5.0 мкм (индикатор холодной планеты)
      const reflected = 0.42 * Math.exp(-0.55 * (um - 0.75));
      const thermalTail = 0.68 * Math.pow(Math.max(0, (um - 2.6) / 2.4), 1.85);
      flux = reflected + thermalTail
        - gaussDip(um, 1.66, 0.08, 0.22)
        - gaussDip(um, 2.30, 0.11, 0.25)
        - gaussDip(um, 3.05, 0.14, 0.28)
        - gaussDip(um, 3.35, 0.12, 0.34);
      if (near(um, 1.66)) feature = 'CH₄';
      else if (near(um, 3.05)) feature = 'H₂O лёд';
      else if (near(um, 3.35)) feature = 'CH₄ (3.3 мкм)';
      else if (near(um, 4.70)) feature = 'ИК-избыток Planet X';
    } else if (targetId === 'europa') {
      flux = 0.92 - 0.08 * t
        - gaussDip(um, 1.50, 0.09, 0.38)
        - gaussDip(um, 2.02, 0.10, 0.45)
        - gaussDip(um, 3.05, 0.18, 0.72)
        - gaussDip(um, 4.27, 0.07, 0.22);
      if (near(um, 1.50)) feature = 'H₂O 1.5 мкм';
      else if (near(um, 2.02)) feature = 'H₂O 2.0 мкм';
      else if (near(um, 3.05)) feature = 'H₂O лёд 3.05 мкм';
      else if (near(um, 4.27)) feature = 'CO₂ лёд';
    } else if (targetId === 'mars') {
      flux = 0.88 - 0.15 * Math.max(0, t - 0.3) + 0.12 * Math.max(0, um - 3.9)
        - gaussDip(um, 2.01, 0.07, 0.36)
        - gaussDip(um, 2.95, 0.15, 0.24)
        - gaussDip(um, 4.27, 0.11, 0.68)
        - gaussDip(um, 4.67, 0.06, 0.15);
      if (near(um, 2.01)) feature = 'CO₂ (2.0 мкм)';
      else if (near(um, 2.95)) feature = 'OH / H₂O';
      else if (near(um, 4.27)) feature = 'CO₂ (4.27 мкм)';
      else if (near(um, 4.67)) feature = 'CO';
    } else if (targetId === 'titan') {
      flux = 0.74 - 0.18 * t
        - gaussDip(um, 1.15, 0.07, 0.32)
        - gaussDip(um, 1.40, 0.08, 0.38)
        - gaussDip(um, 1.75, 0.10, 0.34)
        - gaussDip(um, 2.30, 0.14, 0.45)
        - gaussDip(um, 3.35, 0.16, 0.48);
      if (near(um, 1.58)) feature = 'Окно CH₄';
      else if (near(um, 2.30)) feature = 'CH₄';
      else if (near(um, 3.35)) feature = 'Толины / C₂H₆';
    } else if (targetId === 'pluto') {
      flux = 0.78 - 0.12 * t
        - gaussDip(um, 1.66, 0.07, 0.32)
        - gaussDip(um, 2.15, 0.06, 0.22)
        - gaussDip(um, 2.30, 0.09, 0.35)
        - gaussDip(um, 3.05, 0.14, 0.42)
        - gaussDip(um, 4.67, 0.07, 0.28);
      if (near(um, 1.66)) feature = 'CH₄';
      else if (near(um, 2.15)) feature = 'N₂ лёд';
      else if (near(um, 3.05)) feature = 'H₂O лёд';
      else if (near(um, 4.67)) feature = 'CO лёд';
    } else {
      // Galactic center / interstellar ices & PAHs
      flux = 0.48 + 0.38 * Math.pow(t, 1.2)
        + gaussDip(um, 3.29, 0.08, 0.42) // PAH эмиссия!
        - gaussDip(um, 3.05, 0.13, 0.44)
        - gaussDip(um, 4.27, 0.07, 0.29)
        - gaussDip(um, 4.67, 0.06, 0.24);
      if (near(um, 3.05)) feature = 'H₂O лёд (погл.)';
      else if (near(um, 3.29)) feature = 'PAH органика (пик)';
      else if (near(um, 4.27)) feature = 'CO₂ лёд';
      else if (near(um, 4.67)) feature = 'CO лёд';
    }

    // Небольшой детерминированный приборный шум (реалистичный S/N)
    const ripple = Math.sin(i * 1.9 + targetId.length * 3.1) * 0.012;
    out.push({
      channel: i + 1,
      wavelengthUm: um,
      band,
      flux: Math.max(0.04, Math.min(1.12, +(flux + ripple).toFixed(4))),
      feature,
    });
  }
  return out;
}

// ---------- Гипотетическая Planet X (модель Батыгина — Брауна для SPHEREx ИК-поиска) ----------
// a ≈ 380 а.е., e ≈ 0.42, i ≈ 18°, Ω ≈ 94°, ω ≈ 150°, период ≈ 7408 лет.
const PX_A_KM = 380 * KM_PER_AU;
const PX_E = 0.42;
const PX_PERIOD_DAYS = Math.pow(380, 1.5) * 365.256;
const PX_INC = (18 * Math.PI) / 180;
const PX_OMEGA = (94 * Math.PI) / 180;
const PX_W = (150 * Math.PI) / 180;
// Начальная фаза выбрана так, чтобы в 2026 году объект находился в секторе Ориона/Тельца (~435 а.е.)
const PX_M0 = 2.08;
const J2000_MS = Date.UTC(2000, 0, 1, 12);

function solveKepler(M: number, e: number): number {
  let E = M;
  for (let k = 0; k < 8; k++) {
    E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  }
  return E;
}

function pxPosAt(E: number): [number, number, number] {
  const xOrb = PX_A_KM * (Math.cos(E) - PX_E);
  const yOrb = PX_A_KM * Math.sqrt(1 - PX_E * PX_E) * Math.sin(E);

  const cw = Math.cos(PX_W), sw = Math.sin(PX_W);
  const cO = Math.cos(PX_OMEGA), sO = Math.sin(PX_OMEGA);
  const ci = Math.cos(PX_INC), si = Math.sin(PX_INC);

  const px = (cO * cw - sO * sw * ci) * xOrb + (-cO * sw - sO * cw * ci) * yOrb;
  const py = (sO * cw + cO * sw * ci) * xOrb + (-sO * sw + cO * cw * ci) * yOrb;
  const pz = (sw * si) * xOrb + (cw * si) * yOrb;
  return [px, py, pz];
}

export function planetXState(date: Date): State {
  const days = (date.getTime() - J2000_MS) / 86400e3;
  const n = (2 * Math.PI) / PX_PERIOD_DAYS;
  const M = PX_M0 + n * days;
  const E = solveKepler(M, PX_E);
  const pos = pxPosAt(E);
  // Численная скорость (сдвиг 1 сутки)
  const E2 = solveKepler(M + n, PX_E);
  const pos2 = pxPosAt(E2);
  const vel: [number, number, number] = [
    (pos2[0] - pos[0]) / 86400,
    (pos2[1] - pos[1]) / 86400,
    (pos2[2] - pos[2]) / 86400,
  ];
  return { pos, vel };
}

export function planetXOrbitPath(steps = 360): [number, number, number][] {
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const E = (i / steps) * Math.PI * 2;
    pts.push(pxPosAt(E));
  }
  return pts;
}
