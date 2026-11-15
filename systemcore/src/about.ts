// «О проекте»: краткое описание для жюри, что решает проект, научная/общественная польза, источники данных.

export const SHORT_DESCRIPTION =
  'Solar Explorer: реальные снимки неба SPHEREx со сравнением эпох, 3D-система в реальном времени, трекер 21 677 спутников и обломков CelesTrak со скринингом сближений и учебный поиск Planet X по параллаксу.';

export function initAbout() {
  const el = document.createElement('section');
  el.id = 'about';
  el.className = 'hidden';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'О проекте');
  el.innerHTML = `
    <div class="ab-box ui-panel">
      <header><div><span class="ui-micro">NASA Space Apps · Planet X and SPHEREx</span><strong>Solar Explorer</strong></div>
        <button class="ab-x" aria-label="Закрыть"><svg viewBox="0 0 16 16"><path d="M3 3l10 10M13 3L3 13"/></svg></button></header>
      <div class="ab-body">
        <p class="ab-lead">${SHORT_DESCRIPTION}</p>
        <section><h3>Задача челленджа → наш ответ</h3>
          <table class="ui-table">
            <tr><td>Показать изображения неба SPHEREx</td><td><b>Небо SPHEREx</b>: настоящие карты всего неба QR2 (детекторы D1–D6 и цвет, 0,75–5 мкм) из архива NASA/IPAC IRSA, бесшовный зум</td></tr>
            <tr><td>Легко увидеть, как небо меняется со временем</td><td>Наложение и мерцание SPHEREx (2025–26) с DSS2, 2MASS (1997–2001) и AllWISE (2010): видно собственное движение звёзд — звезда Барнарда сместилась почти на 5′</td></tr>
            <tr><td>Planet X</td><td>Учебный поиск по методу параллакса: синтетические сектора, разностные кадры, две независимые оценки расстояния</td></tr>
            <tr><td>Контекст миссии</td><td>Живая орбита SPHEREx по TLE (SGP4), конус сканирования, 102 спектральных канала</td></tr>
          </table>
        </section>
        <section><h3>Кому полезно</h3>
          <p>Учителям и школьникам — увидеть, что «неподвижные» звёзды движутся, и понять, как ищут далёкие планеты. Любителям астрономии — найти любую область неба в ИК. Всем — понять, насколько засорена околоземная орбита: трекер показывает реальные облака обломков и считает сближения на сутки вперёд.</p>
        </section>
        <section><h3>Данные</h3>
          <table class="ui-table">
            <tr><td>Снимки SPHEREx QR2</td><td>NASA/JPL-Caltech/IPAC (IRSA), HiPS: CDS Strasbourg</td></tr>
            <tr><td>DSS2 · 2MASS · AllWISE</td><td>STScI/Caltech/UMass/IPAC/NASA через HiPS CDS</td></tr>
            <tr><td>Орбиты спутников и обломков</td><td>CelesTrak GP (сеть USSPACECOM), 21 677 объектов</td></tr>
            <tr><td>Траектории аппаратов</td><td>JPL Horizons</td></tr>
            <tr><td>Планеты и луны</td><td>Astronomy Engine (VSOP87, ELP/MPP02)</td></tr>
            <tr><td>Астероиды и кометы</td><td>MPC/JPL (через Stellarium), 35 792 орбиты NEA</td></tr>
            <tr><td>3D-модели</td><td>NASA 3D Resources, Space Radar (MIT)</td></tr>
            <tr><td>Текстуры планет и Млечного Пути</td><td>Solar System Scope (CC BY 4.0), NASA 3D Resources</td></tr>
            <tr><td>Фото</td><td>NASA Image and Video Library</td></tr>
          </table>
          <p class="ab-note">Независимый учебный проект, не связан с NASA и не одобрен ею. Код открыт (MIT).</p>
        </section>
      </div>
    </div>`;
  document.body.appendChild(el);
  const close = () => el.classList.add('hidden');
  el.querySelector('.ab-x')!.addEventListener('click', close);
  el.addEventListener('click', (ev) => { if (ev.target === el) close(); });
  addEventListener('keydown', (ev) => { if (ev.key === 'Escape') close(); });
  return { open: () => { el.classList.remove('hidden'); document.getElementById('menu')?.classList.add('hidden'); }, close };
}
