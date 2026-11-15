import { localized } from '../i18n';
// Каталог объектов на орбите Земли: реальные элементы GP (CelesTrak / USSPACECOM SSN).
// Офлайн-снимок лежит в public/data/catalog/earth.json (scripts/build-catalog.py);
// при наличии сети каталог обновляется из автоматического зеркала CelesTrak на GitHub
// (raw.githubusercontent.com отдаёт CORS-заголовки, CelesTrak напрямую из браузера — нет).

export const CLASS_NAMES = [localized("Действующий аппарат", "Active spacecraft"), localized("Обломок", "Debris"), localized("Ступень ракеты", "Rocket body"), localized("Неактивный аппарат", "Inactive spacecraft"), localized("Неопознанный", "Unidentified")] as const;
export const CLASS_SHORT = [localized("АКТ", "ACT"), localized("ОБЛ", "DEB"), localized("СТУП", "R/B"), localized("НЕАКТ", "INACT"), '?'] as const;
export const CLS_ACTIVE = 0, CLS_DEBRIS = 1, CLS_ROCKET = 2, CLS_INACTIVE = 3, CLS_UNKNOWN = 4;

// --- Классификация опасности для запуска ракеты ---
// Пороговые значения: перигей ≤ 600 км (зона активного запуска), наклонение 20–105°
// (пересекает большинство коридоров запуска), высокий BSTAR = непредсказуемая орбита.
export const DANGER_PERIGEE_MAX_KM = 600;
export const DANGER_INCL_MIN_DEG = 15;
export const DANGER_INCL_MAX_DEG = 108;

/** Возвращает true, если объект опасен для траектории запуска ракеты. */
export function isLaunchDangerous(o: OrbitalObject): boolean {
  // Только обломки и ступени — активные аппараты отслеживаются и маневрируют
  if (o.cls !== CLS_DEBRIS && o.cls !== CLS_ROCKET) return false;
  if (o.regime !== 'LEO') return false;
  if (o.perigeeKm > DANGER_PERIGEE_MAX_KM) return false;
  if (o.apogeeKm < 160) return false;  // уже сходит с орбиты, скоро сгорит
  // Наклонение пересекает типовые коридоры запуска
  const incl = o.incl;
  return incl >= DANGER_INCL_MIN_DEG && incl <= DANGER_INCL_MAX_DEG;
}

/** Уровень угрозы для запуска (0–3): 0 нет, 1 низкий, 2 средний, 3 критический */
export function dangerLevel(o: OrbitalObject): 0 | 1 | 2 | 3 {
  if (!isLaunchDangerous(o)) return 0;
  const h = (o.perigeeKm + o.apogeeKm) / 2;
  if (h < 300) return 3;    // критически низкая орбита — прямо в зоне запуска
  if (h < 450) return 2;    // средняя угроза
  return 1;                  // пересекает коридор
}

/** Текстовое описание угрозы */
export function dangerText(o: OrbitalObject): string {
  const lv = dangerLevel(o);
  if (lv === 0) return '';
  const h = Math.round((o.perigeeKm + o.apogeeKm) / 2);
  const reasons: string[] = [];
  if (o.perigeeKm < 300) reasons.push(`${localized("перигей ", "perigee ")}${Math.round(o.perigeeKm)}${localized(" км — в зоне активного запуска", " km — in the active launch zone")}`);
  else reasons.push(`${localized("перигей ", "perigee ")}${Math.round(o.perigeeKm)}${localized(" км — пересекает коридор запуска", " km — crosses the launch corridor")}`);
  reasons.push(`${localized("наклонение ", "inclination ")}${o.incl.toFixed(1)}${localized("° пересекает типовые азимуты запуска", "° crosses typical launch azimuths")}`);
  if (o.cls === CLS_ROCKET) reasons.push(localized("крупный объект (ступень ракеты)", "large object (rocket body)"));
  if (Math.abs(o.bstar) > 1e-4) reasons.push(localized("высокое BSTAR — орбита нестабильна", "high BSTAR — unstable orbit"));
  return `${localized("Опасен для запуска: ", "Launch hazard: ")}${reasons.join('; ')}.`;
}

/** События фрагментации, облака которых есть в каталоге. */
export const EVENTS: Record<string, { name: string; date: string; text: string }> = {
  fy1c: { name: 'Fengyun-1C', date: '2007-01-11', text: localized("Испытание противоспутникового оружия (КНР): метеоспутник разрушен ракетой SC-19 на высоте ≈865 км. Крупнейшее облако обломков в истории.", "Anti-satellite weapon test (China): a weather satellite was destroyed by an SC-19 missile at ≈865 km. The largest debris cloud in history.") },
  c2251: { name: 'Cosmos 2251', date: '2009-02-10', text: localized("Первое случайное столкновение двух спутников: неработающий «Космос-2251» и действующий Iridium 33 над Сибирью, ≈789 км.", "The first accidental collision of two satellites: inactive Cosmos 2251 and active Iridium 33 over Siberia, ≈789 km.") },
  i33: { name: 'Iridium 33', date: '2009-02-10', text: localized("Вторая половина того же столкновения с «Космосом-2251».", "The other half of the same collision with Cosmos 2251.") },
  c1408: { name: 'Cosmos 1408', date: '2021-11-15', text: localized("Испытание ПСО (РФ): спутник разрушен на высоте ≈480 км; экипаж МКС укрывался в кораблях. Почти все обломки уже сгорели.", "Anti-satellite test (Russia): a satellite was destroyed at ≈480 km; the ISS crew sheltered in spacecraft. Almost all debris has already re-entered.") },
};

export const TAG_NAMES: Record<string, string> = {
  crew: localized("Пилотируемые станции", "Crewed stations"), starlink: 'Starlink', oneweb: 'OneWeb', kuiper: 'Project Kuiper', qianfan: 'Qianfan (G60)', guowang: 'Guowang',
  iridium: 'Iridium NEXT', globalstar: 'Globalstar', orbcomm: 'Orbcomm', planet: 'Planet Labs', spire: 'Spire', gnss: localized("Навигация (GPS/ГЛОНАСС/Galileo/BeiDou)", "Navigation (GPS/GLONASS/Galileo/BeiDou)"),
  geo: localized("Геостационар (связь)", "Geostationary (communications)"), comm: localized("Связь (прочие)", "Communications (other)"), weather: localized("Метеоспутники", "Weather satellites"), earthobs: localized("ДЗЗ", "Earth observation"), sar: localized("Поиск и спасание", "Search and rescue"), science: localized("Научные", "Science"),
  tech: localized("Технологические / учебные", "Technology / education"), cubesat: 'CubeSat', amateur: localized("Радиолюбительские", "Amateur radio"), military: localized("Военные", "Military"), relay: localized("Группа TDRSS (обслуживаемые и ретрансляторы)", "TDRSS group (servicing and relay spacecraft)"),
  visual: localized("100 самых ярких", "100 brightest"), new: localized("Запущены за 30 дней", "Launched in the past 30 days"), analyst: localized("Неопознанные (analyst)", "Unidentified (analyst)"), gpz: localized("Зона защиты ГСО", "GEO protected zone"), decay: localized("Скоро сойдут с орбиты", "Re-entering soon"),
  'evt:fy1c': localized("Облако Fengyun-1C", "Fengyun-1C cloud"), 'evt:c2251': localized("Облако Cosmos 2251", "Cosmos 2251 cloud"), 'evt:i33': localized("Облако Iridium 33", "Iridium 33 cloud"), 'evt:c1408': localized("Облако Cosmos 1408", "Cosmos 1408 cloud"),
};

export interface OrbitalObject {
  idx: number;
  norad: number;
  name: string;
  cospar: string;
  epochMs: number;
  nRevDay: number;
  ecc: number;
  incl: number;   // град
  raan: number;
  argp: number;
  ma: number;
  bstar: number;
  ndot: number;
  nddot: number;
  cls: number;
  tags: string[];
  // производные
  aKm: number;
  perigeeKm: number;
  apogeeKm: number;
  periodMin: number;
  regime: 'LEO' | 'MEO' | 'GEO' | 'HEO';
}

export interface Catalog {
  source: string;
  generated: string;
  live: boolean;
  objects: OrbitalObject[];
  byNorad: Map<number, OrbitalObject>;
}

const MU = 398600.4418, RE = 6378.137;

type Row = [number, string, string, number, number, number, number, number, number, number, number, number, number, number, string];

function derive(r: Row, idx: number): OrbitalObject {
  const nRevDay = r[4], ecc = r[5];
  const nRadS = (nRevDay * 2 * Math.PI) / 86400;
  const aKm = Math.cbrt(MU / (nRadS * nRadS));
  const perigeeKm = aKm * (1 - ecc) - RE, apogeeKm = aKm * (1 + ecc) - RE;
  const periodMin = 1440 / nRevDay;
  const regime = ecc > 0.25 ? 'HEO' : periodMin > 1300 && periodMin < 1580 ? 'GEO' : perigeeKm < 2000 ? 'LEO' : 'MEO';
  return {
    idx, norad: r[0], name: r[1], cospar: r[2], epochMs: r[3], nRevDay, ecc, incl: r[6], raan: r[7], argp: r[8], ma: r[9],
    bstar: r[10], ndot: r[11], nddot: r[12], cls: r[13], tags: r[14] ? r[14].split(',') : [],
    aKm, perigeeKm, apogeeKm, periodMin, regime,
  };
}

function build(json: { source: string; generated: string; objects: Row[] }, live: boolean): Catalog {
  const objects = json.objects
    .map((r, i) => derive(r, i))
    .filter((o) => o.nRevDay > 0.05 && o.perigeeKm > 80); // сгоревшие/вырожденные элементы не рисуем
  objects.forEach((o, i) => (o.idx = i));
  return { source: json.source, generated: json.generated, live, objects, byNorad: new Map(objects.map((o) => [o.norad, o])) };
}

export async function loadBundledCatalog(): Promise<Catalog> {
  const res = await fetch('data/catalog/earth.json');
  if (!res.ok) throw new Error('earth.json ' + res.status);
  return build(await res.json(), false);
}

/** Онлайн-обновление: те же группы CelesTrak из зеркала, обновляемого каждые несколько часов. */
const MIRROR = 'https://raw.githubusercontent.com/satvisorcom/satvisor-data/master/celestrak';
const LIVE_GROUPS: [string, string | null][] = [
  ['active', null], ['stations', 'crew'], ['starlink', 'starlink'], ['oneweb', 'oneweb'], ['kuiper', 'kuiper'], ['qianfan', 'qianfan'], ['hulianwang', 'guowang'],
  ['gnss', 'gnss'], ['geo', 'geo'], ['weather', 'weather'], ['resource', 'earthobs'], ['science', 'science'], ['military', 'military'], ['last-30-days', 'new'],
  ['analyst', 'analyst'], ['visual', 'visual'], ['cubesat', 'cubesat'], ['amateur', 'amateur'], ['tdrss', 'relay'],
  ['fengyun-1c-debris', 'evt:fy1c'], ['cosmos-2251-debris', 'evt:c2251'], ['iridium-33-debris', 'evt:i33'], ['cosmos-1408-debris', 'evt:c1408'],
];
const LIVE_SPECIAL: [string, string][] = [['gpz-plus', 'gpz'], ['decaying', 'decay']];

interface Omm { OBJECT_NAME: string; OBJECT_ID?: string; EPOCH: string; MEAN_MOTION: number; ECCENTRICITY: number; INCLINATION: number; RA_OF_ASC_NODE: number; ARG_OF_PERICENTER: number; MEAN_ANOMALY: number; NORAD_CAT_ID: number; BSTAR?: number; MEAN_MOTION_DOT?: number; MEAN_MOTION_DDOT?: number }

function classify(name: string, isActive: boolean, tags: Set<string>): number {
  const n = name.toUpperCase();
  if (n.includes(' DEB') || n.endsWith('DEB')) return CLS_DEBRIS;
  if (n.includes('R/B') || n.includes('AKM') || n.includes('PKM')) return CLS_ROCKET;
  if (isActive) return CLS_ACTIVE;
  if (tags.has('analyst') || n.startsWith('UNKNOWN') || n.startsWith('OBJECT ')) return CLS_UNKNOWN;
  return CLS_INACTIVE;
}

export async function loadLiveCatalog(onProgress?: (done: number, total: number) => void): Promise<Catalog> {
  const all = [...LIVE_GROUPS.map(([g, t]) => ({ url: `${MIRROR}/json/${g}.json`, tag: t, active: g === 'active' })), ...LIVE_SPECIAL.map(([g, t]) => ({ url: `${MIRROR}/special/json/${g}.json`, tag: t, active: false }))];
  const objs = new Map<number, Omm>(), tags = new Map<number, Set<string>>(), active = new Set<number>();
  let done = 0;
  await Promise.all(all.map(async (g) => {
    try {
      const r = await fetch(g.url, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) return;
      const rows = (await r.json()) as Omm[];
      if (!Array.isArray(rows)) return;
      for (const o of rows) {
        const id = o.NORAD_CAT_ID, prev = objs.get(id);
        if (!prev || o.EPOCH > prev.EPOCH) objs.set(id, o);
        if (g.tag) { if (!tags.has(id)) tags.set(id, new Set()); tags.get(id)!.add(g.tag); }
        if (g.active) active.add(id);
      }
    } finally { onProgress?.(++done, all.length); }
  }));
  if (objs.size < 1000) throw new Error('live catalog too small');
  const rows: Row[] = [...objs.values()].map((o) => {
    const tg = tags.get(o.NORAD_CAT_ID) ?? new Set<string>();
    return [o.NORAD_CAT_ID, o.OBJECT_NAME.trim(), o.OBJECT_ID ?? '', Date.parse(o.EPOCH.endsWith('Z') ? o.EPOCH : o.EPOCH + 'Z'), +o.MEAN_MOTION, +o.ECCENTRICITY, +o.INCLINATION,
      +o.RA_OF_ASC_NODE, +o.ARG_OF_PERICENTER, +o.MEAN_ANOMALY, +(o.BSTAR ?? 0), +(o.MEAN_MOTION_DOT ?? 0), +(o.MEAN_MOTION_DDOT ?? 0),
      classify(o.OBJECT_NAME, active.has(o.NORAD_CAT_ID), tg), [...tg].sort().join(',')];
  });
  return build({ source: localized("CelesTrak GP (онлайн, зеркало satvisor-data)", "CelesTrak GP (online, satvisor-data mirror)"), generated: new Date().toISOString(), objects: rows }, true);
}

/** Объект → OMM для satellite.js json2satrec (полный SGP4/SDP4). */
export function toOmm(o: OrbitalObject) {
  return {
    OBJECT_NAME: o.name, OBJECT_ID: o.cospar, EPOCH: new Date(o.epochMs).toISOString().replace('Z', ''),
    MEAN_MOTION: o.nRevDay, ECCENTRICITY: o.ecc, INCLINATION: o.incl, RA_OF_ASC_NODE: o.raan, ARG_OF_PERICENTER: o.argp, MEAN_ANOMALY: o.ma,
    EPHEMERIS_TYPE: 0, CLASSIFICATION_TYPE: 'U', NORAD_CAT_ID: o.norad, ELEMENT_SET_NO: 999, REV_AT_EPOCH: 0,
    BSTAR: o.bstar, MEAN_MOTION_DOT: o.ndot, MEAN_MOTION_DDOT: o.nddot,
  };
}
