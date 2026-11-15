import { localized } from './i18n';
// Истории: последовательность шагов (время, скорость, фокус камеры, дистанция, текст).
// Даты событий взяты из пресс-материалов NASA/JPL.
export interface StoryStep {
  time: string;          // ISO UTC
  focus: string;         // id объекта или 'home'
  distanceKm?: number;   // дистанция камеры
  rate?: number;         // сим-секунд за секунду (по умолчанию пауза = 0)
  title: string;
  text: string;
}

export interface Story {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  steps: StoryStep[];
}

const D = 86400;

export const STORIES: Story[] = [
  {
    id: 'spherex-allsky', title: localized("SPHEREx: 14 млрд спектров", "SPHEREx: 14 billion spectra"), subtitle: localized("2025–2027 · Реальная орбита", "2025–2027 · Real orbit"), icon: '🔭',
    steps: [
      { time: '2025-03-11T04:00:00Z', focus: 'spherex', distanceKm: 2800, rate: 10, title: localized("Запуск на полярную орбиту", "Launch into polar orbit"), text: localized("11 марта 2025 года ракета Falcon 9 выводит SPHEREx на солнечно-синхронную орбиту высотой ~660 км вдоль линии терминатора Земли.", "On March 11, 2025 a Falcon 9 rocket places SPHEREx into a Sun-synchronous orbit at ~660 km along Earth’s terminator.") },
      { time: '2025-05-01T12:00:00Z', focus: 'spherex', distanceKm: 1800, rate: 60, title: localized("Тройной фотонный экран", "Triple photon shield"), text: localized("Три концентрических конусных экрана и V-радиаторы пассивно охлаждают 20-см телескоп до ~55 K без криогена, защищая от тепла Солнца и Земли.", "Three concentric conical shields and V-groove radiators passively cool the 20 cm telescope to ~55 K without cryogen, shielding it from the Sun’s and Earth’s heat.") },
      { time: '2026-06-12T12:00:00Z', focus: 'spherex', distanceKm: 16000, rate: 120, title: localized("102 канала и >14 млрд спектров", "102 channels and >14 billion spectra"), text: localized("С помощью 6 детекторов (D1–D6, 0.75–5.00 мкм) SPHEREx снимает весь небосвод 4 раза: 450+ млн галактик, 100+ млн звёзд и >14 млрд спектров воды, CO₂ и органики.", "Using six detectors (D1–D6, 0.75–5.00 μm), SPHEREx scans the entire sky four times: 450+ million galaxies, 100+ million stars and >14 billion spectra of water, CO₂ and organics.") },
      { time: 'now', focus: 'spherex', distanceKm: 2200, rate: 1, title: localized("Сейчас в реальном времени", "Now in real time"), text: localized("Положение SPHEREx рассчитывается по живому TLE NORAD 63182 (SGP4). Откройте панель «SPHEREx & Planet X» вверху для анализа 102 каналов и ИК-неба.", "The SPHEREx position is calculated from live NORAD 63182 TLE data (SGP4). Open the SPHEREx & Planet X panel above to analyze 102 channels and the infrared sky.") },
    ],
  },
  {
    id: 'planet-x-hunt', title: 'Planet X & SPHEREx', subtitle: localized("2026 · ИК-поиск 9-й планеты · ~440 а.е.", "2026 · Infrared search for Planet Nine · ~440 AU"), icon: '🪐',
    steps: [
      { time: 'now', focus: 'spherex', distanceKm: 2200, rate: 1, title: localized("Охота с орбиты Земли", "Hunting from Earth orbit"), text: localized("На расстоянии 400+ а.е. гипотетическая Planet X отражает слишком мало света (V ≈ 22.5), но её холодное тепловое и метановое ИК-излучение (3.8–5.0 мкм) ловит SPHEREx.", "At 400+ AU, hypothetical Planet X reflects very little light (V ≈22.5), but SPHEREx can detect its cold thermal and methane infrared emission (3.8–5.0 μm).") },
      { time: 'now', focus: 'planet-x', distanceKm: 1.5e6, rate: 1, title: localized("Далёкий ледяной гигант", "Distant ice giant"), text: localized("Вытянутая наклонённая орбита (~380 а.е., e = 0.42, i = 18°). Сопоставьте 4 прохода обзора SPHEREx в Blink-детекторе, чтобы заметить смещение холодного источника!", "An elongated, inclined orbit (~380 AU, e =0.42, i =18°). Compare four SPHEREx survey passes in the Blink detector to spot the cold source’s motion!") },
    ],
  },
  {
    id: 'voyager-grand-tour', title: "Voyager's Grand Tour", subtitle: localized("1977 – сегодня", "1977 – present"), icon: '🛰',
    steps: [
      { time: '1977-09-06T00:00:00Z', focus: 'earth', distanceKm: 3e7, rate: D, title: localized("Старт", "Launch"), text: localized("В 1977 году с разницей в 16 дней стартуют Voyager 2 (20 августа) и Voyager 1 (5 сентября). Редкий парад планет позволяет облететь все четыре гиганта.", "In 1977, Voyager 2 (August 20) and Voyager 1 (September 5) launch 16 days apart. A rare planetary alignment makes a tour of all four giants possible.") },
      { time: '1979-03-05T12:00:00Z', focus: 'jupiter', distanceKm: 1.2e7, rate: 3600 * 4, title: localized("Voyager 1 у Юпитера", "Voyager 1 at Jupiter"), text: localized("5 марта 1979 года. Voyager 1 открывает активные вулканы на Ио — первые, найденные за пределами Земли.", "March 5, 1979. Voyager 1 discovers active volcanoes on Io, the first found beyond Earth.") },
      { time: '1979-07-09T22:00:00Z', focus: 'voyager-2', distanceKm: 2e7, rate: 3600 * 4, title: localized("Voyager 2 у Юпитера", "Voyager 2 at Jupiter"), text: localized("9 июля 1979 года. Voyager 2 получает детальные снимки Европы, которые позже наведут на мысль о подлёдном океане.", "July 9, 1979. Voyager 2 obtains detailed images of Europa that later suggest a subsurface ocean.") },
      { time: '1981-08-26T03:00:00Z', focus: 'saturn', distanceKm: 1.5e7, rate: 3600 * 4, title: localized("Voyager 2 у Сатурна", "Voyager 2 at Saturn"), text: localized("26 августа 1981 года. Гравитационный манёвр у Сатурна направляет аппарат к Урану.", "August 26, 1981. A gravity assist at Saturn sends the spacecraft toward Uranus.") },
      { time: '1986-01-24T18:00:00Z', focus: 'uranus', distanceKm: 5e6, rate: 3600 * 2, title: localized("Voyager 2 у Урана", "Voyager 2 at Uranus"), text: localized("24 января 1986 года. Первый и пока единственный визит к Урану: открыто 10 новых спутников и два кольца.", "January 24, 1986. The first and so far only visit to Uranus: 10 new moons and two rings discovered.") },
      { time: '1989-08-25T04:00:00Z', focus: 'neptune', distanceKm: 5e6, rate: 3600 * 2, title: localized("Voyager 2 у Нептуна", "Voyager 2 at Neptune"), text: localized("25 августа 1989 года. Пролёт над северным полюсом Нептуна завершает Большое турне.", "August 25, 1989. A flyby over Neptune’s north pole completes the Grand Tour.") },
      { time: '2012-08-25T00:00:00Z', focus: 'voyager-1', distanceKm: 3e9, rate: D * 30, title: localized("Межзвёздное пространство", "Interstellar space"), text: localized("25 августа 2012 года Voyager 1 пересекает гелиопаузу и становится первым рукотворным объектом в межзвёздном пространстве. Voyager 2 делает то же 5 ноября 2018 года.", "On August 25, 2012 Voyager 1 crosses the heliopause, becoming the first human-made object in interstellar space. Voyager 2 follows on November 5, 2018.") },
      { time: 'now', focus: 'voyager-1', distanceKm: 3e9, rate: 1, title: localized("Сегодня", "Today"), text: localized("Оба аппарата всё ещё передают данные — это самая дальняя связь в истории человечества.", "Both spacecraft still transmit data, the longest-distance communication in human history.") },
    ],
  },
  {
    id: 'psyche-mars-flyby', title: 'Psyche Mars Gravity Assist', subtitle: localized("Пролёт Марса 15 мая 2026", "Mars flyby, May 15, 2026"), icon: '🪐',
    steps: [
      { time: '2023-10-14T00:00:00Z', focus: 'earth', distanceKm: 3e7, rate: D * 5, title: localized("Старт", "Launch"), text: localized("13 октября 2023 года Psyche стартует на Falcon Heavy к металлическому астероиду (16) Психея.", "On October 13, 2023 Psyche launches on Falcon Heavy toward the metallic asteroid (16) Psyche.") },
      { time: '2026-04-15T00:00:00Z', focus: 'psyche', distanceKm: 3e7, rate: D, title: localized("Сближение с Марсом", "Approaching Mars"), text: localized("Солнечно-электрические двигатели на эффекте Холла плавно разгоняют аппарат к Марсу.", "Solar-electric Hall-effect thrusters gradually accelerate the spacecraft toward Mars.") },
      { time: '2026-05-15T00:00:00Z', focus: 'mars', distanceKm: 2e6, rate: 600, title: localized("Гравитационный манёвр", "Gravity assist"), text: localized("Гравитация Марса меняет наклон и скорость траектории — бесплатный разгон к поясу астероидов.", "Mars’s gravity changes the trajectory’s inclination and speed, providing a free boost toward the asteroid belt.") },
      { time: '2026-06-01T00:00:00Z', focus: 'psyche', distanceKm: 3e8, rate: D * 10, title: localized("Курс на Психею", "Course for Psyche"), text: localized("Прибытие к астероиду запланировано на август 2029 года.", "Arrival at the asteroid is planned for August 2029.") },
    ],
  },
  {
    id: 'new-horizons-pluto', title: localized("New Horizons у Плутона", "New Horizons at Pluto"), subtitle: localized("Пролёт 14 июля 2015", "Flyby, July 14, 2015"), icon: '❄',
    steps: [
      { time: '2006-01-20T00:00:00Z', focus: 'earth', distanceKm: 5e7, rate: D * 3, title: localized("Самый быстрый старт", "The fastest launch"), text: localized("19 января 2006 года New Horizons уходит от Земли быстрее любого аппарата до него.", "On January 19, 2006 New Horizons leaves Earth faster than any spacecraft before it.") },
      { time: '2007-02-28T00:00:00Z', focus: 'jupiter', distanceKm: 3e7, rate: 3600 * 6, title: localized("Разгон у Юпитера", "Jupiter boost"), text: localized("Гравитационный манёвр у Юпитера сокращает путь к Плутону на три года.", "A gravity assist at Jupiter shortens the journey to Pluto by three years.") },
      { time: '2015-07-14T11:50:00Z', focus: 'pluto', distanceKm: 1e6, rate: 600, title: localized("Пролёт Плутона", "Pluto flyby"), text: localized("14 июля 2015 года, 12 500 км над поверхностью. Открыта ледяная равнина Спутника в форме сердца.", "July 14, 2015, 12,500 km above the surface. The heart-shaped icy Sputnik Planitia is discovered.") },
      { time: '2019-01-01T05:33:00Z', focus: 'new-horizons', distanceKm: 1e9, rate: D * 20, title: localized("Аррокот", "Arrokoth"), text: localized("1 января 2019 года — пролёт объекта пояса Койпера Аррокот, самого далёкого из изученных вблизи.", "January 1, 2019: a flyby of Kuiper Belt object Arrokoth, the most distant object explored up close.") },
    ],
  },
  {
    id: 'parker-perihelion', title: 'Parker Solar Probe', subtitle: localized("Рекордное сближение 24 декабря 2024", "Record close approach, December 24, 2024"), icon: '☀',
    steps: [
      { time: '2018-08-13T00:00:00Z', focus: 'earth', distanceKm: 3e7, rate: D * 2, title: localized("Старт", "Launch"), text: localized("12 августа 2018 года стартует миссия, которая «коснётся Солнца».", "On August 12, 2018 a mission launches that will touch the Sun.") },
      { time: '2024-12-17T00:00:00Z', focus: 'parker-solar-probe', distanceKm: 5e7, rate: 3600 * 3, title: localized("Рекордное сближение", "Record close approach"), text: localized("24 декабря 2024 года — 6,1 млн км от поверхности Солнца на скорости около 192 км/с. Это самый быстрый объект, созданный человеком.", "December 24, 2024: 6.1 million km from the Sun’s surface at about 192 km/s. The fastest human-made object.") },
    ],
  },
  {
    id: 'juno-jupiter', title: localized("Juno у Юпитера", "Juno at Jupiter"), subtitle: localized("Выход на орбиту 5 июля 2016", "Orbit insertion, July 5, 2016"), icon: '🌀',
    steps: [
      { time: '2011-08-06T00:00:00Z', focus: 'earth', distanceKm: 3e7, rate: D * 3, title: localized("Старт", "Launch"), text: localized("5 августа 2011 года Juno стартует к Юпитеру.", "On August 5, 2011 Juno launches toward Jupiter.") },
      { time: '2013-10-09T19:21:00Z', focus: 'earth', distanceKm: 1e7, rate: 3600, title: localized("Пролёт Земли", "Earth flyby"), text: localized("9 октября 2013 года гравитационный манёвр у Земли добавляет 7,3 км/с.", "On October 9, 2013 an Earth gravity assist adds 7.3 km/s.") },
      { time: '2016-07-01T00:00:00Z', focus: 'jupiter', distanceKm: 2e7, rate: 3600 * 6, title: localized("Выход на орбиту", "Orbit insertion"), text: localized("5 июля 2016 года Juno выходит на полярную орбиту и начинает изучать недра и полярные сияния Юпитера.", "On July 5, 2016 Juno enters polar orbit and begins studying Jupiter’s interior and auroras.") },
    ],
  },
];
