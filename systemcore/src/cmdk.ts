// Командная палитра: «/» или Ctrl/Cmd+K — нечёткий поиск по всем объектам сцены,
// внешним каталогам (window.__searchProviders) и переход по дате.
import { t } from './i18n';

export interface PaletteItem {
  label: string;
  sub: string;
  kind: string;
  go: () => void;
  /** Закреплённые пункты (например, переход по дате) всегда идут первыми. */
  pin?: boolean;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

/** Нечёткое совпадение (подпоследовательность) с бонусами за начало слова и подряд идущие символы.
 *  Возвращает счёт (больше — лучше) и позиции совпавших символов, либо null. */
function fuzzy(q: string, text: string): { score: number; hits: number[] } | null {
  if (!q) return { score: 0, hits: [] };
  const t = norm(text);
  const direct = t.indexOf(q);
  if (direct >= 0) {
    const hits = Array.from({ length: q.length }, (_, i) => direct + i);
    const wordStart = direct === 0 || /[\s\-(/·]/.test(t[direct - 1]);
    return { score: 1000 - direct * 2 + (wordStart ? 300 : 0) + (t.length === q.length ? 500 : 0) - t.length * 0.5, hits };
  }
  let ti = 0, score = 0, run = 0;
  const hits: number[] = [];
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    if (ch === ' ') continue;
    let found = -1;
    while (ti < t.length) { if (t[ti] === ch) { found = ti; break; } ti++; }
    if (found < 0) return null;
    const wordStart = found === 0 || /[\s\-(/·]/.test(t[found - 1]);
    run = hits.length && hits[hits.length - 1] === found - 1 ? run + 1 : 0;
    score += 10 + run * 15 + (wordStart ? 25 : 0);
    hits.push(found);
    ti = found + 1;
  }
  return { score: score - t.length * 0.5 - (hits[0] ?? 0), hits };
}

function highlight(text: string, hits: number[]): string {
  if (!hits.length) return esc(text);
  const set = new Set(hits);
  let out = '', open = false;
  for (let i = 0; i < text.length; i++) {
    const h = set.has(i);
    if (h && !open) { out += '<mark>'; open = true; }
    if (!h && open) { out += '</mark>'; open = false; }
    out += esc(text[i]);
  }
  return out + (open ? '</mark>' : '');
}

export function initCommandPalette(getItems: (q: string) => PaletteItem[]) {
  const root = document.getElementById('cmdk')!;
  const input = document.getElementById('cmdk-input') as HTMLInputElement;
  const list = document.getElementById('cmdk-list')!;
  const count = document.getElementById('cmdk-count')!;
  let shown: PaletteItem[] = [];
  let sel = 0;

  const isOpen = () => !root.classList.contains('hidden');
  const open = () => {
    root.classList.remove('hidden');
    input.value = '';
    render();
    requestAnimationFrame(() => input.focus());
  };
  const close = () => { root.classList.add('hidden'); input.blur(); };

  function render() {
    const q = norm(input.value.trim());
    const scored: { it: PaletteItem; score: number; hits: number[] }[] = [];
    for (const it of getItems(input.value)) {
      if (it.pin) { scored.push({ it, score: 1e6, hits: [] }); continue; }
      const a = fuzzy(q, it.label);
      const b = q ? fuzzy(q, it.sub) : null;
      if (!a && !b) continue;
      const score = Math.max(a?.score ?? -1e9, (b?.score ?? -1e9) - 200);
      scored.push({ it, score, hits: a?.hits ?? [] });
    }
    scored.sort((x, y) => y.score - x.score);
    const top = scored.slice(0, 60);
    shown = top.map((s) => s.it);
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    count.textContent = scored.length ? t('search.count', scored.length) : '';
    list.innerHTML = top.length
      ? (q ? '' : `<li class="ck-group">${t('search.all-label')}</li>`) + top.map((s, i) =>
        `<li role="option" data-i="${i}" data-kind="${esc(s.it.kind)}" class="${i === sel ? 'sel' : ''}"><span class="ck-k"></span><span class="ck-l">${highlight(s.it.label, s.hits)}</span><span class="ck-s">${esc(s.it.sub)}</span></li>`).join('')
      : `<li class="ck-empty">${t('search.empty', input.value)}</li>`;
  }

  function move(d: number) {
    if (!shown.length) return;
    sel = (sel + d + shown.length) % shown.length;
    list.querySelectorAll('li[data-i]').forEach((li) => li.classList.toggle('sel', Number((li as HTMLElement).dataset.i) === sel));
    list.querySelector('li.sel')?.scrollIntoView({ block: 'nearest' });
  }
  function choose(i = sel) {
    const it = shown[i];
    if (!it) return;
    close();
    it.go();
  }

  input.addEventListener('input', () => { sel = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  list.addEventListener('mousemove', (e) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>('li[data-i]');
    if (li && Number(li.dataset.i) !== sel) { sel = Number(li.dataset.i); list.querySelectorAll('li[data-i]').forEach((x) => x.classList.toggle('sel', x === li)); }
  });
  list.addEventListener('click', (e) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>('li[data-i]');
    if (li) choose(Number(li.dataset.i));
  });
  root.addEventListener('mousedown', (e) => { if (e.target === root) close(); });
  document.getElementById('cmdk-btn')?.addEventListener('click', open);
  addEventListener('keydown', (e) => {
    const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement)?.isContentEditable;
    if ((e.key === 'k' || e.key === 'K' || e.key === 'л' || e.key === 'Л') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); isOpen() ? close() : open(); return; }
    if (e.key === '/' && !typing && !isOpen()) { e.preventDefault(); open(); }
  });
  return { open, close };
}
