# Solar Explorer — NASA Space Apps 2026 · Planet X and SPHEREx

Реальные снимки неба SPHEREx со сравнением эпох, 3D-система в реальном времени, трекер 21 677 спутников и обломков
со скринингом сближений и учебный поиск Planet X. Описание для подачи, ресурсы и чек-лист — **[SUBMISSION.md](SUBMISSION.md)**.
Демо: `docs/demo.mp4`, скриншоты: `docs/screenshots/` (Сатурн и Юпитер в HD, трекер, облако Fengyun-1C, МКС, консоль SPHEREx). Независимый проект, не связан с NASA и не одобрен ею. Лицензия MIT.

## Запуск

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # статический сайт → dist/
docker compose up --build   # http://localhost:8080
```
Деплой: Render.com (Blueprint, `render.yaml`) или любой статический хостинг для `dist/`.

**Адреса:** `#/home`, `#/earth`, `#/spherex`, `#/sat/25544`, `#/sb/101955-bennu`, `?sky=1` (сразу «Небо SPHEREx»). `?lighting=flood` — заливающий свет.

## Небо SPHEREx — главная функция под задачу челленджа
Настоящие HiPS-карты всего неба SPHEREx QR2 (NASA/IPAC IRSA → CDS): цвет и детекторы D1–D6, 0,75–5,0 мкм. Сравнение
с DSS2, 2MASS и AllWISE наложением и мерцанием; цели с большим собственным движением (звезда Барнарда, Каптейна,
Грумбридж 1830, 61 Лебедя, Проксима) — с расчётом ожидаемого смещения в пикселях SPHEREx; поиск по имени/координатам.
Просмотр — Aladin Lite v3 (CDS), подгружается с CDN; нужен интернет.

## Open source и открытые данные

### Код
| Проект | Назначение | Лицензия |
|---|---|---|
| [three.js](https://github.com/mrdoob/three.js) | WebGL-рендеринг, OrbitControls | MIT |
| [astronomy-engine](https://github.com/cosinekitty/astronomy) (Don Cross) | Эфемериды планет, Луны и спутников Юпитера (VSOP87, ELP/MPP02, L1.2) | MIT |
| [@tweenjs/tween.js](https://github.com/tweenjs/tween.js) | Анимации (зарезервировано для историй) | MIT |
| [Vite](https://github.com/vitejs/vite) | Сборка и dev-сервер | MIT |
| [TypeScript](https://github.com/microsoft/TypeScript) | Язык | Apache-2.0 |
| [satellite.js](https://github.com/shashwatak/satellite-js) | SGP4/SDP4 | MIT |

### Данные
| Источник | Что берём | Лицензия |
|---|---|---|
| [JPL Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html) | Траектории космических аппаратов (векторы, км) | Public domain (NASA/JPL) |
| [NASA NSSDCA Planetary Fact Sheets](https://nssdc.gsfc.nasa.gov/planetary/factsheet/) | Масса, радиус, периоды, наклон оси | Public domain |
| [JPL SSD Physical Parameters](https://ssd.jpl.nasa.gov/planets/phys_par.html) | Физические параметры планет и спутников | Public domain |
| [Solar System Scope Textures](https://www.solarsystemscope.com/textures/) | Текстуры планет (по желанию) | CC BY 4.0 |
| [CelesTrak GP](https://celestrak.org/NORAD/elements/) через [satvisor-data](https://github.com/satvisorcom/satvisor-data) | Элементы орбит 21 677 объектов | открытые данные / MIT (зеркало) |
| [Stellarium](https://github.com/Stellarium/stellarium) `ssystem_minor.ini` | Элементы 476 малых тел (MPC/JPL) | GPL-2.0 (данные) |
| [MOID dataset](https://github.com/runningabc/moid) | 35 792 орбиты NEA | см. репозиторий |
| [NASA 3D Resources](https://github.com/nasa/NASA-3D-Resources), [Space Radar](https://github.com/Sara-Managed-Projects/space-radar) | 3D-модели | public domain / MIT |

### В планах (см. PLAN.md)
NAIF SPICE kernels (DE440, спутники), JPL Small-Body Database, MPC MPCORB, каталог звёзд HYG (CC BY-SA 4.0), NASA 3D Resources (модели КА), NASA Trek (тайлы поверхности).

## Орбита Земли: трекер спутников и космического мусора
- **21 677 реальных объектов** — элементы GP (CelesTrak / сеть наблюдения USSPACECOM) из всех открытых групп:
  все действующие аппараты, облака обломков **Fengyun-1C** (ПСО, 2007), **Cosmos 2251 + Iridium 33** (столкновение, 2009),
  **Cosmos 1408** (ПСО, 2021), зона защиты ГСО (включая брошенные аппараты и ступени) и объекты, сходящие с орбиты.
  Снимок от 2026-11-15 лежит в `public/data/catalog/earth.json`; кнопка «Обновить» в трекере грузит свежие элементы
  из автоматического зеркала CelesTrak (`raw.githubusercontent.com/satvisorcom/satvisor-data`).
  Полный каталог (~30 тыс. объектов, включая все обломки) публикуется только на Space-Track по регистрации — честно указано в интерфейсе.
- **GPU-отрисовка**: позиции всех объектов считаются в вершинном шейдере (Кеплер + вековые возмущения J2) — плавно при любом
  ускорении времени. Сверка с эталонным SGP4: ~5–10 км для МКС/Hubble/GPS (медиана по НОО ≈ 50 км из-за торможения).
  Выбранный объект сопровождается **полным SGP4/SDP4** (satellite.js).
- **Трекер** (кнопка «Трекер»): обзор засорённости (гистограмма высот, наклонение × высота, пики обломков), каталог с поиском
  по названию/NORAD/COSPAR и фильтрами, события фрагментации с веером реальных орбит облака, карточка объекта
  (живая телеметрия, наземный трек и зона радиовидимости), **скрининг сближений на 24 ч**: воркер перебирает все объекты
  пересекающейся высотной оболочки с шагом 20 с, минимумы уточняются, лучшие кандидаты проверяются полным SGP4;
  пристыкованные модули исключаются.
- Земля ориентирована по полюсу J2000 и вращается по гринвичскому звёздному времени — треки совпадают с географией.

## Малые тела
- 476 астероидов, комет, ТНО и межзвёздных объектов с полными оскулирующими элементами (MPC/JPL через Stellarium
  `data/ssystem_minor.ini`): положение по уравнению Кеплера (эллипс, парабола, гипербола) на текущую дату.
- 35 792 орбиты околоземных астероидов (форма орбит без фазы, набор MOID: github.com/runningabc/moid) — цвет по MOID,
  потенциально опасные (MOID < 0,05 а.е.) выделены.
- Реальные модели форм: Bennu, Vesta, Eros, Itokawa, Ryugu, Didymos, Arrokoth, Donaldjohanson, Lutetia, Šteins, Toutatis,
  Kleopatra, 67P, Ceres.

## 3D-модели
Настоящие модели NASA 3D Resources и Space Radar (см. `public/models/CREDITS.md`): Europa Clipper (модель NASA/JPL), Lucy,
Psyche, JUICE, МКС, Hubble, Тяньгун, Starlink, OneWeb, GPS, GOES, TDRS, Terra, Landsat, Sentinel-2, «Союз», «Прогресс», Dragon,
отработавшие ступени (Falcon 9, Delta II, Centaur, H-IIA, «Космос-3М»). Для объектов без модели — условная форма с пометкой.

## Интерфейс
- Интро на главной: надпись Solar Explorer собирается из звёзд (`src/intro.ts`).
- Дизайн-система «Flight Dynamics Console» (`src/theme.css`): один акцент, волосяные линии, моноширинные цифры, без эмодзи.
- Командная палитра: `/` или Ctrl+K — объекты, спутники по NORAD, малые тела, события, переход к дате `ГГГГ-ММ-ДД`.
- Научная консоль SPHEREx: телеметрия по живому TLE, 102 канала спектрометра, поиск Planet X (симуляция метода на синтетических
  секторах: два независимых способа оценки расстояния, разностные кадры, порог 5σ).

## Пересборка данных
```bash
git clone --depth 1 https://github.com/satvisorcom/satvisor-data
git clone --depth 1 --filter=blob:none --no-checkout https://github.com/Stellarium/stellarium && (cd stellarium && git checkout HEAD -- data/ssystem_minor.ini)
git clone --depth 1 https://github.com/runningabc/moid
python3 scripts/build-catalog.py satvisor-data stellarium moid
```

## Офлайн-превью без сборщика
`scripts/offline-preview/build.sh`, затем `python3 scripts/offline-preview/devserver.py . 8731` → `http://localhost:8731/preview.html`.
Нужен только на машине, где не установлены нативные бинарники Vite 8 / TypeScript 7; обычный путь — `npm install && npm run dev`.

## Отличия от оригинала
- Движок Pioneer и код eyes.nasa.gov не используются: они не опубликованы как open source. Всё написано заново.
- Логотип и брендинг NASA не используются.
- Звёздный фон пока процедурный. Наклон осей задан упрощённо, без ориентации полюсов по IAU.
