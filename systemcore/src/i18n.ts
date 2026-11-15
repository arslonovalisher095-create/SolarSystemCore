/** Internationalization: English (default) + Russian */

export type Lang = 'en' | 'ru';

const STORAGE_KEY = 'solar-explorer-lang';

// ─── Translations ────────────────────────────────────────────────────────────

const EN = {
  // Loader
  'loader.sub': 'LOADING EPHEMERIDES & TEXTURES',

  // Header nav
  'nav.spherex-sky': 'SPHEREx SKY',
  'nav.console': 'CONSOLE',
  'nav.toolbox': 'TOOLBOX',
  'nav.missions': 'MISSIONS',
  'nav.tracker': 'TRACKER',

  // Search button
  'search.placeholder': 'Planet, satellite, spacecraft, NORAD ID or date YYYY-MM-DD',
  'search.hint': 'Search objects, dates, NORAD',
  'search.kbd': '/',
  'search.empty': (q: string) => `Nothing found for «${q}». Try a name, NORAD ID or date YYYY-MM-DD.`,
  'search.all-label': 'ALL OBJECTS',
  'search.count': (n: number) => `${n} match${n === 1 ? '' : 'es'}`,

  // Settings panel
  'menu.title': 'DISPLAY SETTINGS',
  'menu.scene': 'SCENE',
  'menu.orbits': 'Orbits',
  'menu.labels': 'Object labels',
  'menu.tracks': 'Spacecraft trajectories',
  'menu.spherex': 'SPHEREx',
  'menu.irsky': 'IR background in 3D',
  'menu.scancone': 'Scan cone',
  'menu.lighting': 'LIGHTING',
  'menu.flood': 'Flood light',
  'menu.project': 'PROJECT',
  'menu.about': 'About · data · credits',
  'menu.keys': 'KEYBOARD',
  'menu.key-search': 'search',
  'menu.key-pause': 'pause',
  'menu.key-esc': 'close',
  'menu.lang': 'LANGUAGE',

  // Timeline
  'tl.year': 'year',
  'tl.day': 'day',
  'tl.real': 'live',
  'tl.hour': 'hour',
  'tl.month': 'mo',
  'tl.btn-year-back': 'Back: 1 year per second',
  'tl.btn-day-back': 'Back: 1 day per second',
  'tl.btn-real': 'Real time',
  'tl.btn-hour': '1 hour per second',
  'tl.btn-day': '1 day per second',
  'tl.btn-month': '1 month per second',
  'tl.btn-year': '1 year per second',
  'tl.pause': 'Pause / resume (space)',
  'tl.live': 'Jump to current moment',

  // Toolbox
  'tb.title': 'TOOLBOX · OBJECTS & LAYERS',
  'tb.close': 'Close',
  'tb.tab-objects': 'Objects',
  'tb.tab-missions': 'Missions',
  'tb.layers': 'LAYERS',
  'tb.objects': 'OBJECTS',
  'tb.controls': 'CONTROLS',
  'tb.layer-planet': 'Planets',
  'tb.layer-dwarf': 'Dwarf planets',
  'tb.layer-moon': 'Moons',
  'tb.layer-spacecraft': 'Spacecraft',
  'tb.layer-satellite': 'Earth orbit: satellites, debris, boosters',
  'tb.layer-smallbody': 'Asteroids & comets',
  'tb.iss': 'ISS',
  'tb.hubble': 'Hubble',
  'tb.tiangong': 'Tiangong (CSS)',
  'tb.all-tracker': 'All objects — debris tracker',
  'tb.solar-system': 'Entire Solar System',
  'tb.milky-way': 'Milky Way',
  'tb.spacecraft-group': 'Spacecraft',
  'tb.earth-orbit': 'Earth Orbit',
  'tb.no-data': 'No data. Run npm run fetch:horizons',
  'tb.help': '<kbd>Scroll</kbd>zoom<br><kbd>LMB</kbd>rotate<br><kbd>RMB</kbd><kbd>←→</kbd>pan (satellites, craft)<br><kbd>Space</kbd>pause<br><kbd>/</kbd>search',
  'tb.mission-hint': 'Click an event — time jumps to that date and camera flies to the spacecraft.',

  // Scope HUD
  'scope.exit': 'Exit telescope view',

  // Tracker (key strings only — full tracker has its own inline HTML)
  'trk.dangerous': 'DANGEROUS FOR LAUNCH',
  'trk.danger-critical': 'Critical',
  'trk.danger-medium': 'Medium',
  'trk.danger-low': 'Low',

  // Assistant
  'ai.system': 'You are an assistant for an interactive 3D model of the Solar System. Answer in English, concisely and accurately. You are told which object the user is currently viewing and the current date in the model. Do not invent numbers.',
  'ai.context': (name: string, date: string) => `Currently on screen: ${name}. Model date: ${date}.`,
  'ai.context-galaxy': 'User is looking at the Milky Way galaxy.',
  'ai.galaxy-ref': 'If asked about the Milky Way, it can be opened via search or ToolBox.',
  'ai.offline-default': 'I know data about planets, moons, **SPHEREx** and **Planet X**. Ask: "Tell me about SPHEREx", "How to find Planet X?" or "What am I looking at?"',
  'ai.offline-unknown': 'Unknown object.',
};

const RU: Partial<typeof EN> = {
  'loader.sub': 'ЗАГРУЗКА ЭФЕМЕРИД И ТЕКСТУР',

  'nav.spherex-sky': 'НЕБО SPHEREx',
  'nav.console': 'КОНСОЛЬ',
  'nav.toolbox': 'TOOLBOX',
  'nav.missions': 'МИССИИ',
  'nav.tracker': 'ТРЕКЕР',

  'search.placeholder': 'Планета, спутник, аппарат, NORAD ID или дата ГГГГ-ММ-ДД',
  'search.hint': 'Поиск объектов, дат, NORAD',
  'search.empty': (q: string) => `Ничего не найдено по запросу «${q}». Попробуйте название, NORAD ID или дату ГГГГ-ММ-ДД.`,
  'search.all-label': 'ВСЕ ОБЪЕКТЫ',
  'search.count': (n: number) => `${n} совп.`,

  'menu.title': 'НАСТРОЙКИ ВИДА',
  'menu.scene': 'СЦЕНА',
  'menu.orbits': 'Орбиты',
  'menu.labels': 'Подписи объектов',
  'menu.tracks': 'Траектории аппаратов',
  'menu.irsky': 'ИК-фон в 3D',
  'menu.scancone': 'Конус сканирования',
  'menu.lighting': 'ОСВЕЩЕНИЕ',
  'menu.flood': 'Заливающий свет',
  'menu.project': 'ПРОЕКТ',
  'menu.about': 'О проекте · данные · авторство',
  'menu.keys': 'КЛАВИШИ',
  'menu.key-search': 'поиск',
  'menu.key-pause': 'пауза',
  'menu.key-esc': 'закрыть',
  'menu.lang': 'ЯЗЫК',

  'tl.year': 'год',
  'tl.day': 'день',
  'tl.real': 'реал',
  'tl.hour': 'час',
  'tl.month': 'мес',
  'tl.btn-year-back': 'Назад: 1 год в секунду',
  'tl.btn-day-back': 'Назад: 1 день в секунду',
  'tl.btn-real': 'Реальное время',
  'tl.btn-hour': '1 час в секунду',
  'tl.btn-day': '1 день в секунду',
  'tl.btn-month': '1 месяц в секунду',
  'tl.btn-year': '1 год в секунду',
  'tl.pause': 'Пауза / продолжить (пробел)',
  'tl.live': 'Вернуться к текущему моменту',

  'tb.title': 'TOOLBOX · ОБЪЕКТЫ И СЛОИ',
  'tb.close': 'Закрыть',
  'tb.tab-objects': 'Объекты',
  'tb.tab-missions': 'Миссии',
  'tb.layers': 'СЛОИ',
  'tb.objects': 'ОБЪЕКТЫ',
  'tb.controls': 'УПРАВЛЕНИЕ',
  'tb.layer-planet': 'Планеты',
  'tb.layer-dwarf': 'Карликовые планеты',
  'tb.layer-moon': 'Спутники планет',
  'tb.layer-spacecraft': 'Космические аппараты',
  'tb.layer-satellite': 'Орбита Земли: спутники, обломки, ступени',
  'tb.layer-smallbody': 'Астероиды и кометы',
  'tb.iss': 'МКС (ISS)',
  'tb.hubble': 'Hubble',
  'tb.tiangong': 'Тяньгун (CSS)',
  'tb.all-tracker': 'Все объекты — трекер мусора',
  'tb.solar-system': 'Вся Солнечная система',
  'tb.milky-way': 'Млечный Путь (Milky Way)',
  'tb.spacecraft-group': 'Космические аппараты',
  'tb.earth-orbit': 'Орбита Земли',
  'tb.no-data': 'Нет данных. Выполните npm run fetch:horizons',
  'tb.help': '<kbd>Колесо</kbd>приближение<br><kbd>ЛКМ</kbd>вращение<br><kbd>ПКМ</kbd><kbd>←→</kbd>сдвиг камеры (спутники, аппараты)<br><kbd>Space</kbd>пауза<br><kbd>/</kbd>поиск',
  'tb.mission-hint': 'Нажмите на событие — время перейдёт на эту дату, а камера полетит к аппарату.',

  'scope.exit': 'Выйти из вида телескопа',

  'trk.dangerous': 'ОПАСЕН ДЛЯ ЗАПУСКА',
  'trk.danger-critical': 'Критический',
  'trk.danger-medium': 'Средний',
  'trk.danger-low': 'Низкий',

  'ai.system': 'Ты — ассистент интерактивной 3D-модели Солнечной системы. Отвечай по-русски, кратко и точно. Тебе передают, какой объект пользователь сейчас просматривает и на какую дату. Не выдумывай числа.',
  'ai.context': (name: string, date: string) => `Сейчас на экране: ${name}. Дата в модели: ${date}.`,
  'ai.context-galaxy': 'Пользователь смотрит на галактику Млечный Путь.',
  'ai.galaxy-ref': 'Если спросят про Млечный Путь, его можно открыть через поиск или ToolBox.',
  'ai.offline-default': 'Я знаю данные о планетах, спутниках, **SPHEREx** и **Planet X**. Спросите: «Расскажи про SPHEREx», «Как найти Planet X?» или «Что я сейчас вижу?».',
  'ai.offline-unknown': 'Неизвестный объект.',
};

// ─── State ────────────────────────────────────────────────────────────────────

let _lang: Lang = (localStorage.getItem(STORAGE_KEY) as Lang) ?? 'en';
const _listeners: Array<(lang: Lang) => void> = [];

export function getLang(): Lang { return _lang; }

export function setLang(lang: Lang) {
  _lang = lang;
  localStorage.setItem(STORAGE_KEY, lang);
  document.documentElement.lang = lang;
  applyAll();
  _listeners.forEach((fn) => fn(lang));
}

export function onLangChange(fn: (lang: Lang) => void) {
  _listeners.push(fn);
}

// ─── Translation helper ───────────────────────────────────────────────────────

type Dict = typeof EN;

export function t<K extends keyof Dict>(key: K, ...args: Dict[K] extends (...a: infer A) => unknown ? A : []): string {
  const dict = (_lang === 'ru' ? { ...EN, ...RU } : EN) as Dict;
  const val = dict[key];
  if (typeof val === 'function') return (val as (...a: unknown[]) => string)(...args);
  return val as string;
}

// ─── DOM auto-apply ───────────────────────────────────────────────────────────

/** Apply translations to all [data-i18n] elements in the DOM. */
export function applyAll() {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n as keyof Dict;
    if (!key) return;
    const val = t(key as keyof Dict);
    if (el.dataset.i18nAttr) {
      el.setAttribute(el.dataset.i18nAttr, val);
    } else {
      el.innerHTML = val;
    }
  });
  // Update lang toggle button state
  document.querySelectorAll<HTMLElement>('[data-lang-btn]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.langBtn === _lang);
  });
  // Update html lang attr
  document.documentElement.lang = _lang;
}

/** Call once after DOM is ready. */
export function initI18n() {
  applyAll();
}
