# Solar Explorer — подача на NASA Space Apps (Planet X and SPHEREx)

## Короткое описание (≤ 250 символов)

**RU (204):** Solar Explorer: реальные снимки неба SPHEREx со сравнением эпох, 3D-система в реальном времени, трекер 21 677 спутников и обломков CelesTrak со скринингом сближений и учебный поиск Planet X по параллаксу.

**EN (219):** Solar Explorer: real SPHEREx all-sky images with epoch comparison, a live 3D solar system, a tracker of 21,677 CelesTrak satellites and debris with conjunction screening, and a hands-on parallax search for Planet X.

## Как проект отвечает на задачу

Задача: публичный веб-инструмент, который показывает изображения неба SPHEREx и позволяет легко увидеть, как небо меняется со временем.

| Требование | Что сделано |
| --- | --- |
| Показать снимки SPHEREx | Вкладка **«Небо SPHEREx»**: настоящие карты всего неба SPHEREx QR2 (NASA/IPAC IRSA) — цветная и по детекторам D1–D6 (0,75–5,0 мкм), бесшовный зум от всего неба до пикселя 6,2″. |
| Как небо меняется со временем | Тот же участок неба в разные эпохи: **наложение** (ползунок) и **мерцание** SPHEREx 2025–26 против DSS2 (≈1980–1999), 2MASS (1997–2001), AllWISE (2010). Готовые цели с собственным движением: звезда Барнарда (≈279″ за 27 лет ≈ 45 пикселей SPHEREx — расчёт показывается на экране), звезда Каптейна, Грумбридж 1830, 61 Лебедя, Проксима; ИК против видимого: туманность Ориона, центр Галактики; глубокое поле SPHEREx у полюса эклиптики. Поиск любого объекта по имени или координатам. |
| Planet X | Научная консоль: учебный слепой поиск по методу параллакса на синтетических секторах (честно помечено), разностные кадры Eₙ−E₁, порог 5σ, две независимые оценки расстояния. Объект Planet X в 3D-сцене. |
| Контекст миссии | Живая орбита SPHEREx по TLE (SGP4), конус сканирования, телеметрия, 102 спектральных канала, прогресс обзора неба. |
| Дополнительно | Трекер околоземной орбиты: 21 677 реальных объектов CelesTrak, облака обломков Fengyun-1C, Cosmos 2251, Iridium 33, Cosmos 1408, скрининг сближений на 24 ч с проверкой SGP4; 476 малых тел и 35 792 орбиты околоземных астероидов; настоящие 3D-модели NASA. |

## Кому полезно (impact)

Учителям и школьникам — увидеть, что «неподвижные» звёзды движутся, и понять, как ищут далёкие планеты. Любителям астрономии — исследовать небо в ИК-диапазоне SPHEREx. Всем — понять масштаб засорения орбиты на реальных данных.

## Использованные ресурсы

**Данные NASA и партнёров**
- SPHEREx QR2 spectral images — NASA/JPL-Caltech/IPAC, архив IRSA (https://irsa.ipac.caltech.edu/Missions/spherex.html); HiPS-карты построены CDS (https://alasky.cds.unistra.fr/SPHEREx/)
- DSS2, 2MASS, AllWISE — HiPS CDS (STScI, UMass/IPAC, NASA/JPL-Caltech)
- JPL Horizons — траектории аппаратов; NASA Image and Video Library — фото; NASA 3D Resources — модели
- NASA NSSDCA Planetary Fact Sheets — физические параметры

**Открытые данные**
- CelesTrak GP (USSPACECOM) через зеркало github.com/satvisorcom/satvisor-data — 21 677 объектов
- MPC/JPL элементы малых тел через Stellarium `ssystem_minor.ini`; набор MOID (github.com/runningabc/moid) — 35 792 орбиты NEA
- CDS MocServer — метаданные архива SPHEREx

**Библиотеки:** three.js, Astronomy Engine, satellite.js, Aladin Lite v3 (CDS), Vite, TypeScript. 3D-модели: NASA 3D Resources, Space Radar (MIT). Подробно: README.md, public/models/CREDITS.md.

## Запуск

```bash
npm install
npm run dev            # http://localhost:3000
npm run build          # статический сайт в dist/
```

Docker: `docker compose up --build` → http://localhost:8080
Хостинг: Render.com → New → Blueprint (файл `render.yaml`), либо любой статический хостинг для `dist/`.

Адреса: `#/home`, `#/earth`, `#/spherex`, `#/sat/25544` (МКС), `#/sb/101955-bennu`, `?sky=1` — сразу открыть «Небо SPHEREx». Клавиши: `/` — поиск, пробел — пауза, Esc — закрыть.

## Демонстрация

- `docs/demo.webm` — запись основных сценариев (без звука).
- Скриншоты — `docs/screenshots/`.
- Сценарий 60-секундного видео с озвучкой — `docs/DEMO_SCRIPT.md`.

## Чек-лист подачи

1. Создать публичный репозиторий на GitHub и загрузить проект (см. ниже).
2. Развернуть сайт (Render/Netlify/GitHub Pages) и получить ссылку.
3. Записать видео по `docs/DEMO_SCRIPT.md` (OBS, 1–2 мин), загрузить на YouTube.
4. В форме Submit → Solution: описание из этого файла, ссылки на репозиторий, сайт и видео.

```bash
git init && git add . && git commit -m "Solar Explorer — NASA Space Apps 2026"
git branch -M main
git remote add origin https://github.com/<ваш-логин>/solar-explorer.git
git push -u origin main
```
