import { BODIES } from './bodies';
import { MISSIONS } from './missions';
import { t, onLangChange } from './i18n';

interface Ent { def: { id: string; name: string; kind: string; parent?: string } }

/** ToolBox: слои (категории объектов) и дерево всех объектов с перелётом камеры. */
export function initToolbox(entities: Map<string, Ent>, kindOn: Record<string, boolean>, getFocusId: () => string | null, onEvent: (craftId: string, date: string) => void, extraCounts: Record<string, number> = {}) {
  const panel = document.getElementById('toolbox')!;
  const btn = document.getElementById('toolbox-btn')!;
  const count = (k: string) => extraCounts[k] ?? [...entities.values()].filter((e) => e.def.kind === k).length;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

  const row = (id: string, label: string, cls = '') => `<a class="tb-row ${cls}" data-id="${id}" href="#/${id}">${esc(label)}</a>`;
  const moonsOf = (id: string) => BODIES.filter((b) => b.parent === id && entities.has(b.id));

  function buildHTML() {
    const layers: [string, string][] = [
      ['planet', t('tb.layer-planet')], ['dwarf', t('tb.layer-dwarf')], ['moon', t('tb.layer-moon')],
      ['spacecraft', t('tb.layer-spacecraft')], ['satellite', t('tb.layer-satellite')], ['smallbody', t('tb.layer-smallbody')],
    ];
    const locale = document.documentElement.lang === 'ru' ? 'ru-RU' : 'en-US';
    const shortDate = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' });

    const tree = [
      row('home', t('tb.solar-system'), 'tb-home'),
      row('milky-way', t('tb.milky-way'), 'tb-galaxy'),
      row('sun', 'Sun'),
      ...BODIES.filter((b) => (b.kind === 'planet' || b.kind === 'dwarf') && entities.has(b.id)).map((b) => {
        const ms = moonsOf(b.id);
        return ms.length
          ? `<details class="tb-group" data-parent="${b.id}"><summary>${row(b.id, b.name)}<span class="tb-count">${ms.length}</span></summary>${ms.map((m) => row(m.id, m.name, 'tb-sub')).join('')}</details>`
          : row(b.id, b.name);
      }),
      `<details class="tb-group" data-parent="craft" open><summary><span class="tb-title">${t('tb.spacecraft-group')}</span><span class="tb-count">${count('spacecraft')}</span></summary>${
        [...entities.values()].filter((e) => e.def.kind === 'spacecraft').map((e) => row(e.def.id, e.def.name, 'tb-sub')).join('') || `<div class="tb-empty">${t('tb.no-data')}</div>`}</details>`,
      `<details class="tb-group" data-parent="satellites"><summary><span class="tb-title">${t('tb.earth-orbit')}</span><span class="tb-count">${count('satellite')}</span></summary>
        <a class="tb-row tb-sub" href="#/sat/25544">${t('tb.iss')}</a><a class="tb-row tb-sub" href="#/sat/20580">${t('tb.hubble')}</a><a class="tb-row tb-sub" href="#/sat/48274">${t('tb.tiangong')}</a>
        <button class="tb-row tb-sub" type="button" data-open-tracker>${t('tb.all-tracker')}</button></details>`,
    ].join('');

    const missions = [...MISSIONS].sort((a, b) => a.events[0].date.localeCompare(b.events[0].date)).filter((m) => entities.has(m.id)).map((m) => {
      const name = entities.get(m.id)!.def.name;
      return `<div class="tb-mission"><a class="tb-mname" href="#/${m.id}">${esc(name)}<span>${esc(m.years)}</span></a>
        <div class="tb-mgoal">${esc(m.goal)}</div>
        ${m.status ? `<div class="tb-mstatus">${esc(m.status)}</div>` : ''}
        <div class="tb-mevents">${m.events.map((ev) => `<button class="tb-ev" data-craft="${m.id}" data-date="${ev.date}" title="${esc(ev.text)}"><b>${ev.approx ? '≈ ' : ''}${shortDate(ev.date)}</b> ${esc(ev.title)}</button>`).join('')}</div></div>`;
    }).join('');

    // Remember open/closed pane
    const activePaneEl = panel.querySelector<HTMLElement>('.tb-body:not(.hidden)');
    const activePane = activePaneEl?.dataset.pane ?? 'objects';

    panel.innerHTML = `
      <div class="tb-head"><span>${t('tb.title')}</span><button class="tb-close" aria-label="${t('tb.close')}"></button></div>
      <div class="tb-tabs">
        <button data-tab="objects" class="${activePane === 'objects' ? 'on' : ''}">${t('tb.tab-objects')}</button>
        <button data-tab="missions" class="${activePane === 'missions' ? 'on' : ''}">${t('tb.tab-missions')} <span class="tb-count">${MISSIONS.length}</span></button>
      </div>
      <div class="tb-body${activePane === 'objects' ? '' : ' hidden'}" data-pane="objects">
        <div class="tb-section">${t('tb.layers')}</div>
        ${layers.map(([k, n]) => `<label class="tb-check"><input type="checkbox" data-kind="${k}" ${kindOn[k] ? 'checked' : ''}> ${n} <span class="tb-count">${count(k)}</span></label>`).join('')}
        <div class="tb-section">${t('tb.objects')}</div>
        <div class="tb-tree">${tree}</div>
        <div class="tb-section">${t('tb.controls')}</div>
        <div class="tb-help">${t('tb.help')}</div>
      </div>
      <div class="tb-body${activePane === 'missions' ? '' : ' hidden'}" data-pane="missions">
        <div class="tb-hint">${t('tb.mission-hint')}</div>
        ${missions}
      </div>`;

    // Rebind events after innerHTML replacement
    panel.querySelectorAll<HTMLButtonElement>('.tb-tabs button').forEach((tabBtn) => (tabBtn.onclick = () => {
      panel.querySelectorAll('.tb-tabs button').forEach((x) => x.classList.toggle('on', x === tabBtn));
      panel.querySelectorAll<HTMLElement>('.tb-body').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== tabBtn.dataset.tab));
    }));
    panel.querySelectorAll<HTMLButtonElement>('.tb-ev').forEach((b) => (b.onclick = () => onEvent(b.dataset.craft!, b.dataset.date!)));
    panel.querySelector<HTMLElement>('.tb-close')!.onclick = () => toggle(false);
    panel.querySelectorAll<HTMLInputElement>('input[data-kind]').forEach((i) => (i.onchange = () => (kindOn[i.dataset.kind!] = i.checked)));
    panel.querySelector<HTMLButtonElement>('[data-open-tracker]')?.addEventListener('click', () => document.getElementById('tracker-btn')?.click());
  }

  const toggle = (open?: boolean) => {
    const on = open ?? panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !on);
    document.body.classList.toggle('tb-open', on);
  };

  btn.onclick = () => toggle();
  // Кнопка «Миссии» в шапке: открывает ToolBox сразу на вкладке миссий
  document.getElementById('missions-btn')!.onclick = () => {
    toggle(true);
    panel.querySelector<HTMLButtonElement>('.tb-tabs button[data-tab="missions"]')!.click();
  };

  // Initial render + re-render on language change
  buildHTML();
  onLangChange(() => buildHTML());

  // Подсветка текущего объекта; раскрываем группу его родителя
  let last: string | null = '';
  setInterval(() => {
    const id = getFocusId();
    if (id === last) return;
    last = id;
    panel.querySelectorAll('.tb-row').forEach((r) => r.classList.toggle('active', (r as HTMLElement).dataset.id === (id ?? 'home')));
    const active = panel.querySelector('.tb-row.active');
    const g = active?.closest('details');
    if (g) g.open = true;
    active?.scrollIntoView({ block: 'nearest' });
  }, 300);
}
