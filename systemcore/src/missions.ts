import { localized } from './i18n';
/** Миссии космических аппаратов: цель, ключевые события, факты. Даты событий — по данным NASA/ESA. */
export interface MissionEvent { date: string; title: string; text: string; approx?: boolean }
export interface Mission {
  id: string;            // id аппарата (как в bodies.ts)
  goal: string;          // цель миссии
  target: string;        // главные объекты исследования
  years: string;         // краткий период
  status?: string;       // известный статус (если надёжно известен)
  events: MissionEvent[];
}

export const MISSIONS: Mission[] = [
  { id: 'pioneer-10', goal: localized("Первая миссия через пояс астероидов к Юпитеру.", "The first mission through the asteroid belt to Jupiter."), target: localized("Юпитер, дальняя гелиосфера", "Jupiter, outer heliosphere"), years: '1972–2003', status: localized("Связь потеряна в 2003 году", "Contact lost in 2003"),
    events: [
      { date: '1972-03-03', title: localized("Запуск", "Launch"), text: localized("Ракета Atlas-Centaur, мыс Канаверал. Самый быстрый аппарат на момент старта.", "Atlas-Centaur rocket, Cape Canaveral. The fastest spacecraft at launch.") },
      { date: '1973-12-04', title: localized("Пролёт Юпитера", "Jupiter flyby"), text: localized("Сближение ≈ 130 000 км: первые снимки Юпитера вблизи и измерения радиации.", "Closest approach ≈130,000 km: first close-up images of Jupiter and radiation measurements.") },
      { date: '1983-06-13', title: localized("Пересёк орбиту Нептуна", "Crossed Neptune’s orbit"), text: localized("Первый рукотворный объект, покинувший область планет.", "The first human-made object to leave the planetary region.") },
      { date: '2003-01-23', title: localized("Последний сигнал", "Last signal"), text: localized("Слабый сигнал принят в январе 2003 года, дальше связь не удалось установить.", "A weak signal was received in January 2003; contact could not be re-established.") },
    ] },
  { id: 'pioneer-11', goal: localized("Исследовать Юпитер и первым подлететь к Сатурну.", "Explore Jupiter and become the first spacecraft to visit Saturn."), target: localized("Юпитер, Сатурн", "Jupiter, Saturn"), years: '1973–1995', status: localized("Связь потеряна в 1995 году", "Contact lost in 1995"),
    events: [
      { date: '1973-04-06', title: localized("Запуск", "Launch"), text: localized("Ракета Atlas-Centaur с мыса Канаверал.", "Atlas-Centaur rocket from Cape Canaveral.") },
      { date: '1974-12-03', title: localized("Пролёт Юпитера", "Jupiter flyby"), text: localized("Сближение ≈ 43 000 км; манёвр отправил аппарат к Сатурну.", "Closest approach ≈43,000 km; the maneuver sent the spacecraft toward Saturn.") },
      { date: '1979-09-01', title: localized("Пролёт Сатурна", "Saturn flyby"), text: localized("Первый аппарат у Сатурна: открыто узкое кольцо F, измерены магнитное поле и температура Титана.", "The first spacecraft at Saturn: discovered the narrow F ring and measured the magnetic field and Titan’s temperature.") },
      { date: '1995-09-30', title: localized("Конец связи", "End of contact"), text: localized("Последний контакт с аппаратом — после этого он молчит.", "The last contact with the spacecraft; it has been silent since.") },
    ] },
  { id: 'voyager-2', goal: localized("Большое турне по планетам-гигантам и дальше, в межзвёздное пространство.", "A grand tour of the giant planets and onward into interstellar space."), target: localized("Юпитер, Сатурн, Уран, Нептун", "Jupiter, Saturn, Uranus, Neptune"), years: localized("1977–сегодня", "1977–present"),
    events: [
      { date: '1977-08-20', title: localized("Запуск", "Launch"), text: localized("Ракета Titan IIIE-Centaur; запущен раньше Voyager 1, но летит медленнее.", "Titan IIIE-Centaur rocket; launched before Voyager 1 but traveling more slowly.") },
      { date: '1979-07-09', title: localized("Пролёт Юпитера", "Jupiter flyby"), text: localized("Подробные снимки Европы, Ганимеда и вулканов Ио.", "Detailed images of Europa, Ganymede and Io’s volcanoes.") },
      { date: '1981-08-26', title: localized("Пролёт Сатурна", "Saturn flyby"), text: localized("Кольца и спутники Сатурна вблизи; гравитационный манёвр к Урану.", "Saturn’s rings and moons up close; gravity assist toward Uranus.") },
      { date: '1986-01-24', title: localized("Пролёт Урана", "Uranus flyby"), text: localized("Единственный аппарат, побывавший у Урана: ≈ 81 500 км, открыты 10 новых спутников.", "The only spacecraft to visit Uranus: ≈81,500 km, discovering 10 new moons.") },
      { date: '1989-08-25', title: localized("Пролёт Нептуна", "Neptune flyby"), text: localized("Единственный пролёт у Нептуна: Большое тёмное пятно, гейзеры Тритона.", "The only Neptune flyby: the Great Dark Spot and Triton’s geysers.") },
      { date: '2018-11-05', title: localized("Межзвёздное пространство", "Interstellar space"), text: localized("Пересёк гелиопаузу и вышел за пределы гелиосферы Солнца.", "Crossed the heliopause and left the Sun’s heliosphere.") },
    ] },
  { id: 'voyager-1', goal: localized("Исследовать Юпитер и Сатурн, затем — межзвёздную среду.", "Explore Jupiter and Saturn, then the interstellar medium."), target: localized("Юпитер, Сатурн, Титан, межзвёздное пространство", "Jupiter, Saturn, Titan, interstellar space"), years: localized("1977–сегодня", "1977–present"),
    events: [
      { date: '1977-09-05', title: localized("Запуск", "Launch"), text: localized("Ракета Titan IIIE-Centaur. На борту «Золотая пластинка» с записями Земли.", "Titan IIIE-Centaur rocket. Carries the Golden Record with recordings from Earth.") },
      { date: '1979-03-05', title: localized("Пролёт Юпитера", "Jupiter flyby"), text: localized("Сближение ≈ 349 000 км; открыты активные вулканы на Ио.", "Closest approach ≈349,000 km; active volcanoes discovered on Io.") },
      { date: '1980-11-12', title: localized("Пролёт Сатурна", "Saturn flyby"), text: localized("Облёт Титана и Сатурна; траектория вывела аппарат из плоскости планет.", "Titan and Saturn flybys; the trajectory took the spacecraft out of the planetary plane.") },
      { date: '1990-02-14', title: localized("Бледно-голубая точка", "Pale Blue Dot"), text: localized("Снимок Земли с расстояния ≈ 6 млрд км по просьбе Карла Сагана.", "An image of Earth from ≈6 billion km, at Carl Sagan’s request.") },
      { date: '2012-08-25', title: localized("Межзвёздное пространство", "Interstellar space"), text: localized("Первый рукотворный объект, вышедший за гелиопаузу.", "The first human-made object to cross the heliopause.") },
    ] },
  { id: 'new-horizons', goal: localized("Первая разведка Плутона и объектов пояса Койпера.", "The first reconnaissance of Pluto and Kuiper Belt objects."), target: localized("Плутон, Харон, Аррокот", "Pluto, Charon, Arrokoth"), years: localized("2006–сегодня", "2006–present"),
    events: [
      { date: '2006-01-19', title: localized("Запуск", "Launch"), text: localized("Ракета Atlas V. Самый быстрый аппарат на момент старта.", "Atlas V rocket. The fastest spacecraft at launch.") },
      { date: '2007-02-28', title: localized("Пролёт Юпитера", "Jupiter flyby"), text: localized("Гравитационный манёвр у Юпитера сократил путь к Плутону на три года.", "Jupiter gravity assist shortened the trip to Pluto by three years.") },
      { date: '2015-07-14', title: localized("Пролёт Плутона", "Pluto flyby"), text: localized("Сближение ≈ 12 500 км: ледяное «сердце» Плутона, горы из водяного льда, атмосфера.", "Closest approach ≈12,500 km: Pluto’s icy heart, water-ice mountains and atmosphere.") },
      { date: '2019-01-01', title: localized("Пролёт Аррокота", "Arrokoth flyby"), text: localized("Самый далёкий объект, изученный вблизи: двухлопастное тело в поясе Койпера.", "The most distant object explored up close: a two-lobed body in the Kuiper Belt.") },
    ] },
  { id: 'juno', goal: localized("Узнать, как Юпитер устроен внутри и как возник.", "Discover Jupiter’s interior and how it formed."), target: localized("Юпитер, Европа, Ио", "Jupiter, Europa, Io"), years: '2011–2025',
    events: [
      { date: '2011-08-05', title: localized("Запуск", "Launch"), text: localized("Ракета Atlas V 551. Питание — три панели размером с автобус.", "Atlas V 551 rocket. Powered by three bus-sized solar panels.") },
      { date: '2013-10-09', title: localized("Манёвр у Земли", "Earth gravity assist"), text: localized("Гравитационный манёвр у Земли добавил аппарату скорость для полёта к Юпитеру.", "An Earth gravity assist added speed for the journey to Jupiter.") },
      { date: '2016-07-05', title: localized("Выход на орбиту Юпитера", "Jupiter orbit insertion"), text: localized("Полярная орбита: аппарат проходит над полюсами, где радиация слабее.", "Polar orbit: the spacecraft passes over the poles, where radiation is weaker.") },
      { date: '2022-09-29', title: localized("Пролёт Европы", "Europa flyby"), text: localized("Сближение ≈ 350 км — самое близкое за два десятилетия.", "Closest approach ≈350 km, the closest in two decades.") },
      { date: '2023-12-30', title: localized("Пролёт Ио", "Io flyby"), text: localized("Сближение ≈ 1 500 км с самым вулканическим телом Солнечной системы.", "Closest approach ≈1,500 km to the most volcanic body in the Solar System.") },
    ] },
  { id: 'parker-solar-probe', goal: localized("Прикоснуться к Солнцу: изучить корону и источник солнечного ветра.", "Touch the Sun: study the corona and the origin of the solar wind."), target: localized("Солнце, корона, Венера (манёвры)", "Sun, corona, Venus (gravity assists)"), years: localized("2018–сегодня", "2018–present"),
    events: [
      { date: '2018-08-12', title: localized("Запуск", "Launch"), text: localized("Ракета Delta IV Heavy — самая мощная из применявшихся для такой миссии.", "Delta IV Heavy rocket, the most powerful used for such a mission.") },
      { date: '2018-11-06', title: localized("Первый перигелий", "First perihelion"), text: localized("Первое сближение с Солнцем на расстояние ≈ 24 млн км.", "First close approach to the Sun at ≈24 million km.") },
      { date: '2021-04-28', title: localized("Вход в корону", "Entering the corona"), text: localized("Первый аппарат, «потрогавший» Солнце — пересёк альфвеновскую границу.", "The first spacecraft to touch the Sun, crossing the Alfvén critical surface.") },
      { date: '2024-12-24', title: localized("Рекордное сближение", "Record close approach"), text: localized("≈ 6,1 млн км от поверхности Солнца и ≈ 692 000 км/ч — самый быстрый рукотворный объект.", "≈6.1 million km from the Sun’s surface at ≈692,000 km/h, the fastest human-made object.") },
    ] },
  { id: 'lucy', goal: localized("Первая миссия к троянским астероидам Юпитера — «окаменелостям» ранней Солнечной системы.", "The first mission to Jupiter’s Trojan asteroids, fossils of the early Solar System."), target: localized("Троянцы Юпитера, астероиды главного пояса", "Jupiter Trojans, main-belt asteroids"), years: '2021–2033',
    events: [
      { date: '2021-10-16', title: localized("Запуск", "Launch"), text: localized("Ракета Atlas V 401; названа в честь скелета «Люси» — ключа к эволюции человека.", "Atlas V 401 rocket; named after the Lucy skeleton, a key to human evolution.") },
      { date: '2022-10-16', title: localized("Манёвр у Земли", "Earth gravity assist"), text: localized("Первый гравитационный манёвр у Земли.", "First Earth gravity assist.") },
      { date: '2023-11-01', title: localized("Пролёт Динкинеша", "Dinkinesh flyby"), text: localized("Неожиданно оказалось, что у астероида есть маленький спутник.", "The asteroid unexpectedly turned out to have a small moon.") },
      { date: '2024-12-13', title: localized("Второй манёвр у Земли", "Second Earth gravity assist"), text: localized("Гравитационный манёвр у Земли отправил Lucy к троянцам.", "An Earth gravity assist sent Lucy toward the Trojans.") },
      { date: '2025-04-20', title: localized("Пролёт Дональдджохансона", "Donaldjohanson flyby"), text: localized("Астероид главного пояса — ≈ 920 км.", "Main-belt asteroid, ≈920 km.") },
      { date: '2027-08-12', title: localized("Эврибат и Квета", "Eurybates and Queta"), text: localized("Первый троянский астероид — Эврибат, у которого есть спутник.", "The first Trojan asteroid, Eurybates, which has a moon."), approx: true },
      { date: '2028-04-18', title: localized("Левк", "Leucus"), text: localized("Самый медленно вращающийся троянский астероид.", "The slowest-rotating Trojan asteroid."), approx: true },
      { date: '2033-03-02', title: localized("Патрокл и Менетий", "Patroclus and Menoetius"), text: localized("Двойной троянский астероид — финал миссии.", "A binary Trojan asteroid, the mission finale."), approx: true },
    ] },
  { id: 'psyche', goal: localized("Изучить металлический астероид — возможное ядро погибшей планеты.", "Study a metallic asteroid, possibly the core of a destroyed planet."), target: localized("Астероид (16) Психея", "Asteroid (16) Psyche"), years: '2023–2029+',
    events: [
      { date: '2023-10-13', title: localized("Запуск", "Launch"), text: localized("Ракета Falcon Heavy. Движение — ионные двигатели на солнечной энергии.", "Falcon Heavy rocket. Propelled by solar-powered ion engines.") },
      { date: '2026-05-15', title: localized("Манёвр у Марса", "Mars gravity assist"), text: localized("Гравитационный манёвр у Марса перед полётом к главному поясу астероидов.", "Mars gravity assist before the flight to the main asteroid belt.") },
      { date: '2029-08-01', title: localized("Прибытие к Психее", "Arrival at Psyche"), text: localized("Начало орбитального исследования астероида (по плану — август 2029).", "Start of orbital exploration of the asteroid (planned for August 2029)."), approx: true },
    ] },
  { id: 'juice', goal: localized("Исследовать ледяные спутники Юпитера и возможность жизни под льдом.", "Explore Jupiter’s icy moons and the possibility of life beneath the ice."), target: localized("Ганимед, Каллисто, Европа", "Ganymede, Callisto, Europa"), years: '2023–2035',
    events: [
      { date: '2023-04-14', title: localized("Запуск", "Launch"), text: localized("Ракета Ariane 5 с космодрома Куру — первая большая миссия ЕКА к Юпитеру.", "Ariane 5 rocket from Kourou, ESA’s first major mission to Jupiter.") },
      { date: '2024-08-20', title: localized("Манёвр Луна—Земля", "Moon–Earth gravity assist"), text: localized("Первый в истории двойной гравитационный манёвр: Луна, затем Земля.", "The first double gravity assist in history: the Moon, then Earth.") },
      { date: '2025-08-31', title: localized("Манёвр у Венеры", "Venus gravity assist"), text: localized("Гравитационный манёвр у Венеры.", "Gravity assist at Venus.") },
      { date: '2031-07-01', title: localized("Прибытие к Юпитеру", "Arrival at Jupiter"), text: localized("Выход на орбиту Юпитера (июль 2031).", "Jupiter orbit insertion (July 2031)."), approx: true },
    ] },
  { id: 'europa-clipper', goal: localized("Выяснить, пригоден ли для жизни подлёдный океан Европы.", "Determine whether Europa’s subsurface ocean is habitable."), target: localized("Европа", "Europa"), years: '2024–2030+',
    events: [
      { date: '2024-10-14', title: localized("Запуск", "Launch"), text: localized("Ракета Falcon Heavy — крупнейший аппарат NASA для планетарной миссии.", "Falcon Heavy rocket, NASA’s largest spacecraft for a planetary mission.") },
      { date: '2025-03-01', title: localized("Манёвр у Марса", "Mars gravity assist"), text: localized("Гравитационный манёвр у Марса.", "Gravity assist at Mars.") },
      { date: '2026-12-03', title: localized("Манёвр у Земли", "Earth gravity assist"), text: localized("Возвращение к Земле для разгона перед полётом к Юпитеру (по плану — декабрь 2026).", "Return to Earth to gain speed before traveling to Jupiter (planned for December 2026)."), approx: true },
    { date: '2030-04-01', title: localized("Прибытие к Юпитеру", "Arrival at Jupiter"), text: localized("Выход на орбиту Юпитера и начало серии пролётов у Европы (по плану — апрель 2030).", "Jupiter orbit insertion and the start of Europa flybys (planned for April 2030)."), approx: true },
    ] },
  { id: 'spherex', goal: localized("Построить первую спектральную карту всего неба в 102 ИК-диапазонах (>14 млрд спектров): космическая инфляция, межзвёздные льды и поиск холодных объектов вроде Planet X.", "Build the first all-sky spectral map in 102 infrared bands (>14 billion spectra): cosmic inflation, interstellar ices and the search for cold objects such as Planet X."), target: localized("Всё небо (450+ млн галактик, 100+ млн звёзд, внешняя Солнечная система)", "Entire sky (450+ million galaxies, 100+ million stars, outer Solar System)"), years: '2025–2027+', status: localized("Активна на солнечно-синхронной орбите (~660 км)", "Active in Sun-synchronous orbit (~660 km)"),
    events: [
      { date: '2025-03-11', title: localized("Запуск Falcon 9", "Falcon 9 launch"), text: localized("Старт с базы Ванденберг на солнечно-синхронную орбиту терминатора (наклонение 97.96°).", "Launch from Vandenberg into a Sun-synchronous terminator orbit (inclination 97.96°).") },
      { date: '2025-04-01', title: localized("Первый свет", "First light"), text: localized("Телескоп TMA охладился до ~55 K за счёт V-радиаторов и получил первые тестовые ИК-спектры.", "The TMA telescope cooled to ~55 K using V-groove radiators and obtained its first test infrared spectra.") },
      { date: '2025-05-01', title: localized("Старт научного обзора", "Science survey begins"), text: localized("Начало 4 полных проходов неба: 600 экспозиций в сутки по 102 каналам (0.75–5.00 мкм).", "Start of four complete sky passes: 600 exposures per day in 102 channels (0.75–5.00 μm).") },
      { date: '2025-10-15', title: localized("Публикация SPHEREx QR2", "SPHEREx QR2 publication"), text: localized("NASA/IPAC IRSA открыл доступ к перекалиброванным спектральным снимкам всего неба.", "NASA/IPAC IRSA opened access to recalibrated all-sky spectral images.") },
      { date: '2026-06-12', title: localized("Релиз куба DR1 / Color", "DR1 / Color cube release"), text: localized("Единый 102-канальный спектральный куб неба (99.99% покрытия, 503 180 тайлов HiPS).", "A unified 102-channel sky spectral cube (99.99% coverage, 503,180 HiPS tiles).") },
      { date: '2027-05-01', title: localized("Завершение 4-го прохода", "Fourth pass completed"), text: localized("Накопление >14 млрд индивидуальных спектров и глубокие поля у полюсов эклиптики (200× глубина).", "Accumulation of >14 billion individual spectra and deep fields at the ecliptic poles (200× depth)."), approx: true },
    ] },
];

export const missionFor = (id: string) => MISSIONS.find((m) => m.id === id);
