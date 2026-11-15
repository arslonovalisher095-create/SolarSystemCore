import { localized } from './i18n';
// Процедурный «слепой обзор» неба + оценка расстояния по двум независимым методам.
// Заменяет прежний захардкоженный 4-кадровый Planet X Blink (одни и те же dx/dy каждый раз)
// на настоящий поиск: при каждом запуске генерируется новый случайный сектор неба. Иногда там
// прячется кандидат в Planet X, иногда ближний астероид, иногда TNO, иногда вообще ничего —
// результат не предопределён. Расстояние не «подогнано» под подпись: оно вычисляется из тех же
// формул отражённого движения/параллакса, которые задают сдвиг кандидата между эпохами —
// честная демонстрация метода, которым реальный SPHEREx отделяет медленные холодные тела от
// неподвижного фона.
//
// Физика (как и в прежнем автономном детекторе SKYSHIFT):
//  - короткая дуга внутри одного прохода: скорость отражённого движения ≈ (0.9856°/сутки) / d[а.е.]
//  - скачок между проходами через ~6 месяцев: параллакс на базе 2 а.е. ≈ (2/d[а.е.]) рад → arcsec ×206265

export type MoverKind = 'planet-x-candidate' | 'tno' | 'asteroid' | 'none';

export interface BackgroundSource { x: number; y: number; r: number; a: number; tint: string }

export interface EpochSample { dx: number; dy: number; dateLabel: string; tDays: number }

export interface SurveySector {
  seed: number;
  background: BackgroundSource[];
  kind: MoverKind;
  epochs: EpochSample[]; // 4 эпохи — только для отрисовки blink-компаратора (визуальный масштаб ограничен для читаемости кадра)
  truthDistanceAu: number;
  snrDb: number;
  /** Измеренная (с шумом) скорость короткой дуги, arcsec/сутки — независимый вход для метода 1. */
  measuredShortArcRateArcsecPerDay: number | null;
  /** Измеренная (с шумом) амплитуда скачка параллакса за ~6 мес., arcsec — независимый вход для метода 2. */
  measuredJumpArcsec: number | null;
  /** Центр поля (условные экваториальные координаты сектора), градусы. */
  raDeg: number;
  decDeg: number;
  /** Обозначение сектора, напр. «SX-3F2A9C». */
  label: string;
}

export interface DistanceEstimate {
  fromShortArcAu: number | null;
  fromParallaxJumpAu: number | null;
  agreePct: number | null; // насколько две независимые оценки согласуются
  verdict: MoverKind | 'inconclusive';
  confidenceLabel: string;
}

const ARCSEC_PER_PX = 6.2; // плата-скейл SPHEREx (как в основном приложении)
const EARTH_DEG_PER_DAY = 0.9856;
const AU_BASELINE = 2; // Земля по разные стороны орбиты через полгода

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EPOCH_LABELS = [localized("Проход 1", "Pass 1"), localized("Проход 2", "Pass 2"), localized("Проход 3", "Pass 3"), localized("Проход 4", "Pass 4")];

export function generateSector(seed: number = (Date.now() ^ (Math.random() * 1e9)) & 0xffffffff): SurveySector {
  const rnd = mulberry32(seed);

  const background: BackgroundSource[] = [];
  for (let i = 0; i < 110; i++) {
    const isGalaxy = rnd() < 0.12;
    background.push({
      x: 0.05 + rnd() * 0.9,
      y: 0.08 + rnd() * 0.84,
      r: isGalaxy ? 1.6 + rnd() * 2.2 : 0.7 + rnd() * 1.7,
      a: 0.28 + rnd() * 0.55,
      tint: isGalaxy ? '#8aa0d8' : rnd() < 0.12 ? '#ffd2a1' : rnd() < 0.24 ? '#9cc8ff' : '#e6e8f0',
    });
  }

  const roll = rnd();
  let kind: MoverKind;
  let distanceAu: number;
  if (roll < 0.3) { kind = 'planet-x-candidate'; distanceAu = 280 + rnd() * 320; }
  else if (roll < 0.55) { kind = 'tno'; distanceAu = 32 + rnd() * 70; }
  else if (roll < 0.8) { kind = 'asteroid'; distanceAu = 1.6 + rnd() * 3.2; }
  else { kind = 'none'; distanceAu = 0; }

  const tDaysList = [0, 183, 366, 549];
  const phase0 = rnd() * Math.PI * 2;

  let measuredShortArcRateArcsecPerDay: number | null = null;
  let measuredJumpArcsec: number | null = null;
  const epochs: EpochSample[] = [];

  if (kind === 'none') {
    for (let i = 0; i < 4; i++) epochs.push({ dx: (rnd() - 0.5) * 2, dy: (rnd() - 0.5) * 2, dateLabel: EPOCH_LABELS[i], tDays: tDaysList[i] });
  } else {
    // Истинные физические величины для этого расстояния (независимые друг от друга по происхождению):
    //  - скорость короткой дуги (отражённое движение Земли, спроецированное): rate = (0.9856°/сутки × 3600) / d
    //  - амплитуда скачка параллакса за ~6 мес. (база 2 а.е., противоположные стороны орбиты Земли): jump = (2/d) × 206265″
    // Обе величины «измеряются» независимо, каждая со своим шумом — поэтому они не обязаны совпасть идеально,
    // как и в реальной астрометрии.
    const trueRate = (EARTH_DEG_PER_DAY * 3600) / distanceAu;
    const trueJump = (AU_BASELINE / distanceAu) * 206265;
    measuredShortArcRateArcsecPerDay = trueRate * (1 + (rnd() - 0.5) * 0.18);
    measuredJumpArcsec = trueJump * (1 + (rnd() - 0.5) * 0.18);

    // Визуальный офсет для blink-канваса — только иллюстрация, сжатая в читаемый диапазон пикселей
    // (у близкого астероида реальный скачок — сотни градусов, рисовать это буквально бессмысленно).
    const ampPxVisual = 8 + 55 * (1 - 1 / (1 + trueJump / (ARCSEC_PER_PX * 30)));
    for (let i = 0; i < 4; i++) {
      const t = tDaysList[i];
      const phase = phase0 + (2 * Math.PI * t) / 365.25;
      const noisePx = (rnd() - 0.5) * 1.2;
      epochs.push({
        dx: ampPxVisual * Math.cos(phase) + noisePx,
        dy: ampPxVisual * 0.42 * Math.sin(phase) + noisePx,
        dateLabel: EPOCH_LABELS[i],
        tDays: t,
      });
    }
  }

  const snrDb = kind === 'none' ? 0 : 3.2 + rnd() * 10.5;
  const raDeg = rnd() * 360;
  const decDeg = Math.asin(rnd() * 2 - 1) * 180 / Math.PI;
  const label = 'SX-' + (seed >>> 0).toString(16).toUpperCase().padStart(8, '0').slice(-6);
  return { seed, background, kind, epochs, truthDistanceAu: distanceAu, snrDb, measuredShortArcRateArcsecPerDay, measuredJumpArcsec, raDeg, decDeg, label };
}

/** Оценка расстояния методом 1: скорость короткой дуги внутри прохода. d = (0.9856°/сутки × 3600) / rate. */
function distanceFromShortArc(sector: SurveySector): number | null {
  if (sector.measuredShortArcRateArcsecPerDay == null || sector.measuredShortArcRateArcsecPerDay <= 0) return null;
  return (EARTH_DEG_PER_DAY * 3600) / sector.measuredShortArcRateArcsecPerDay;
}

/** Оценка расстояния методом 2: скачок параллакса между проходами через ~полгода. d = (2/jump) × 206265. */
function distanceFromParallaxJump(sector: SurveySector): number | null {
  if (sector.measuredJumpArcsec == null || sector.measuredJumpArcsec <= 0) return null;
  return (AU_BASELINE / sector.measuredJumpArcsec) * 206265;
}

export function estimateDistance(sector: SurveySector): DistanceEstimate {
  if (sector.kind === 'none') {
    return { fromShortArcAu: null, fromParallaxJumpAu: null, agreePct: null, verdict: 'inconclusive', confidenceLabel: localized("Значимого движения в этом секторе не обнаружено — только неподвижный фон.", "No significant motion detected in this sector — only a fixed background.") };
  }
  const a = distanceFromShortArc(sector);
  const b = distanceFromParallaxJump(sector);
  let agreePct: number | null = null;
  if (a != null && b != null && a > 0 && b > 0) {
    agreePct = 100 * (1 - Math.abs(a - b) / Math.max(a, b));
  }
  const avg = a != null && b != null ? (a + b) / 2 : a ?? b ?? sector.truthDistanceAu;
  let verdict: MoverKind | 'inconclusive' = 'inconclusive';
  if (avg != null) {
    if (avg > 150) verdict = 'planet-x-candidate';
    else if (avg > 20) verdict = 'tno';
    else verdict = 'asteroid';
  }
  const confidenceLabel =
    agreePct != null && agreePct > 70
      ? `${localized("Две независимые оценки согласуются (", "Two independent estimates agree (")}${agreePct.toFixed(0)}${localized("%) — надёжный кандидат.", "%) — reliable candidate.")}`
      : agreePct != null
      ? `${localized("Оценки расходятся (совпадение ", "Estimates differ (agreement ")}${agreePct.toFixed(0)}${localized("%) — нужно больше проходов для подтверждения.", "%) — more passes are needed for confirmation.")}`
      : localized("Недостаточно эпох для перекрёстной проверки.", "Insufficient epochs for cross-checking.");
  return { fromShortArcAu: a, fromParallaxJumpAu: b, agreePct, verdict, confidenceLabel };
}

export const RESEARCH_ARCSEC_PER_PX = ARCSEC_PER_PX;

/** Канва blink-компаратора, к которой привязаны пиксельные офсеты эпох (dx, dy). */
export const BLINK_REF_W = 372;
export const BLINK_REF_H = 200;

/**
 * Синтетический кадр детектора для эпохи: гауссов PSF неподвижных источников (одинаковых во всех эпохах),
 * движущийся источник с амплитудой SNR×σ и независимый гауссов шум (σ = 1) — свой для каждой эпохи.
 * Возвращает поток в единицах σ шума, размер w×h.
 */
export function synthFrame(sector: SurveySector, epoch: number, w: number, h: number): Float32Array {
  const img = new Float32Array(w * h);
  const rnd = mulberry32((sector.seed ^ ((epoch + 1) * 0x9e3779b1)) >>> 0);
  // Шум: Бокс–Мюллер
  for (let i = 0; i < img.length; i += 2) {
    const u = Math.max(1e-9, rnd()), v = rnd();
    const r = Math.sqrt(-2 * Math.log(u));
    img[i] = r * Math.cos(2 * Math.PI * v);
    if (i + 1 < img.length) img[i + 1] = r * Math.sin(2 * Math.PI * v);
  }
  const sx = w / BLINK_REF_W, sy = h / BLINK_REF_H;
  const stamp = (cx: number, cy: number, amp: number, sigma: number) => {
    const R = Math.ceil(sigma * 3.5);
    const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(w - 1, Math.ceil(cx + R));
    const y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(h - 1, Math.ceil(cy + R));
    const k = -1 / (2 * sigma * sigma);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = x - cx, dy = y - cy;
      img[y * w + x] += amp * Math.exp((dx * dx + dy * dy) * k);
    }
  };
  for (const s of sector.background) {
    const galaxy = s.tint === '#8aa0d8';
    stamp(s.x * w, s.y * h, 6 + s.a * s.r * 22, galaxy ? 1.2 + s.r * 0.35 : 0.9);
  }
  if (sector.kind !== 'none') {
    const ep = sector.epochs[epoch];
    stamp(w / 2 + ep.dx * sx, h / 2 + ep.dy * sy, sector.snrDb * 1.6, 0.95);
  }
  return img;
}
