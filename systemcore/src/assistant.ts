import { localized } from './i18n';
import { ASSISTANT_CONFIG as CFG } from './assistant.config';
import { BODIES } from './bodies';
import { t } from './i18n';

export interface AssistantContext { focusId: string | null; focusName: string | null; date: string }
type Msg = { role: 'user' | 'assistant'; content: string };

const RU: Record<string, string[]> = {
  sun: ['солнц'], mercury: ['меркур'], venus: ['венер'], earth: ['земл', 'земн'], moon: ['лун'], mars: ['марс'],
  jupiter: ['юпитер'], io: ['ио '], europa: ['европ'], ganymede: ['ганимед'], callisto: ['каллист'],
  saturn: ['сатурн'], uranus: ['уран'], neptune: ['нептун'], pluto: ['плутон'], 'planet-x': ['planet x', 'планет x', 'девят', 'planet 9'],
};

const SPHEREX_FACTS =
  localized("SPHEREx (MIDEX 9, NORAD 63182) — инфракрасный космический телескоп NASA/Caltech, запущенный 11 марта 2025 года на солнечно-синхронную орбиту (~660 км, наклонение 97.96°). ", "SPHEREx (MIDEX 9, NORAD 63182) is a NASA/Caltech infrared space telescope, launched on March 11, 2025 into a Sun-synchronous orbit (~660 km, inclination 97.96°). ") +
  localized("Он строит первую полную спектральную карту всего неба в 102 ИК-каналах (0.75–5.00 мкм) по 6 детекторам D1–D6: более 14 млрд индивидуальных спектров, 450+ млн галактик, 100+ млн звёзд и поиск холодных тел внешней Солнечной системы, включая гипотетическую Planet X.", "It is building the first complete spectral map of the sky in 102 infrared channels (0.75–5.00 μm) using six detectors D1–D6: over 14 billion individual spectra, 450+ million galaxies, 100+ million stars, and a search for cold outer Solar System objects, including hypothetical Planet X.");

const GALAXY_FACTS =
  localized("Млечный Путь (Milky Way) — спиральная галактика с перемычкой. Диаметр диска ≈ 100 000 св. лет, толщина ≈ 1 000 св. лет, 100–400 млрд звёзд, возраст ≈ 13,6 млрд лет, ", "The Milky Way is a barred spiral galaxy. Its disk is ≈100,000 light-years across and ≈1,000 light-years thick, with 100–400 billion stars and an age of ≈13.6 billion years, ") +
  localized("масса с тёмной материей ≈ 1–2 трлн масс Солнца. Солнце — в рукаве Ориона, ≈ 26 000 св. лет от центра, делает оборот за ≈ 230 млн лет со скоростью ≈ 230 км/с. ", "and a mass including dark matter of ≈1–2 trillion solar masses. The Sun is in the Orion Arm, ≈26,000 light-years from the center, orbiting in ≈230 million years at ≈230 km/s. ") +
  localized("В центре — сверхмассивная чёрная дыра Sagittarius A* (≈ 4,3 млн масс Солнца). Масштаб галактики на экране условный.", "At its center is the supermassive black hole Sagittarius A* (≈4.3 million solar masses). The on-screen galaxy scale is illustrative.");
const isGalaxyQ = (query: string) => /(млечн|галактик|milky|galaxy)/.test(query);
const isSpherexQ = (query: string) => /(spherex|сферекс|спектр|миллиард|102|ик-карт|инфракр|infrared|spectrum)/.test(query);

// ---------- Вызов API (единственное место, которое нужно подстроить под ваш провайдер) ----------
async function askApi(history: Msg[], ctx: AssistantContext): Promise<string> {
  const focusLabel = ctx.focusName ?? (document.documentElement.lang === 'ru' ? localized("вся Солнечная система", "entire Solar System") : 'entire Solar System');
  const context = t('ai.context', focusLabel, ctx.date) +
    (ctx.focusId === 'milky-way' ? ` ${t('ai.context-galaxy')} Ref: ${GALAXY_FACTS}` : ` ${t('ai.galaxy-ref')}`);
  const body = JSON.stringify({
    model: CFG.model,
    messages: [{ role: 'system', content: `${CFG.systemPrompt}\n${context}` }, ...history],
  });
  const headers = { 'Content-Type': 'application/json', ...(CFG.apiKey ? { Authorization: `Bearer ${CFG.apiKey}` } : {}) };

  let status = 0;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1))); // пауза 1с, 2с, 4с
    const res = await fetch(CFG.apiUrl, { method: 'POST', headers, body });
    if (res.ok) {
      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? data.content?.[0]?.text ?? data.reply ?? '…';
    }
    status = res.status;
    if (status !== 503 && status !== 429) break; // остальные ошибки повторять бесполезно
  }
  const isRu = document.documentElement.lang === 'ru';
  throw new Error(status === 503 || status === 429
    ? (isRu ? localized("сервер перегружен, попробуйте ещё раз через минуту", "server overloaded, please try again in a minute") : 'server overloaded, please try again in a minute')
    : `API ${status}`);
}

// ---------- Офлайн-режим: отвечает из данных bodies.ts ----------
function askLocal(q: string, ctx: AssistantContext): string {
  const query = ` ${q.toLowerCase()} `;
  if (isSpherexQ(query) || (ctx.focusId === 'spherex' && /(это|здесь|вижу|сейчас|экран|what|this|here|looking|see|screen)/.test(query))) {
    return `**SPHEREx (NASA)** — ${SPHEREX_FACTS}`;
  }
  if (isGalaxyQ(query) || (ctx.focusId === 'milky-way' && /(это|здесь|вижу|сейчас|экран|what|this|here|looking|see|screen)/.test(query))) {
    return `${localized("**Млечный Путь (Milky Way)** — ", "**Milky Way** — ")}${GALAXY_FACTS}`;
  }
  if (/(largest|biggest|самая большая)/.test(query)) return askLocal('Jupiter', ctx);
  const def = BODIES.find((b) => query.includes(b.name.toLowerCase()) || RU[b.id]?.some((s) => query.includes(s)))
    ?? (/(это|здесь|вижу|сейчас|экран|what|this|here|looking|see|screen)/.test(query) ? BODIES.find((b) => b.id === ctx.focusId) : undefined);
  if (!def) {
    return t('ai.offline-default');
  }
  const isRu = document.documentElement.lang === 'ru';
  const locale = isRu ? (document.documentElement.lang === 'ru' ? 'ru-RU' : 'en-US') : 'en-US';
  const f = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 3 });
  const lines = [`**${def.name}** — ${def.description}`];
  if (def.radiusKm) lines.push(isRu ? `${localized("Радиус: ", "Radius: ")}${f(def.radiusKm)}${localized(" км", " km")}` : `Radius: ${f(def.radiusKm)} km`);
  if (def.massKg) lines.push(isRu ? `${localized("Масса: ", "Mass: ")}${def.massKg.toExponential(3)}${localized(" кг", " kg")}` : `Mass: ${def.massKg.toExponential(3)} kg`);
  if (def.orbitDays) lines.push(isRu ? `${localized("Период обращения: ", "Orbital period: ")}${f(def.orbitDays)}${localized(" сут", " days")}` : `Orbital period: ${f(def.orbitDays)} days`);
  if (def.dayHours) lines.push(isRu ? `${localized("Период вращения: ", "Rotation period: ")}${f(def.dayHours)}${localized(" ч", " h")}` : `Rotation period: ${f(def.dayHours)} h`);
  return lines.join('\n');
}

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
const md = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');

// ---------- Интерфейс ----------
export function initAssistant(getContext: () => AssistantContext) {
  const root = document.createElement('div');
  root.id = 'assistant';
  root.innerHTML = localized("\n    <button class=\"as-fab\" aria-label=\"Открыть ассистента\"><svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path d=\"M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z\" /><path class=\"k\" d=\"M5.5 7h5\" /></svg><span>Ассистент</span></button>\n    <div class=\"as-panel\" role=\"dialog\" aria-label=\"AI ассистент\">\n      <div class=\"as-head\"><span>АССИСТЕНТ <b>·</b> КОНТЕКСТ СЦЕНЫ</span><button class=\"as-close\" aria-label=\"Свернуть\"></button></div>\n      <div class=\"as-msgs\"></div>\n      <div class=\"as-chips\"></div>\n      <form class=\"as-form\"><input placeholder=\"Спросите о том, что видите…\" autocomplete=\"off\" /><button type=\"submit\" aria-label=\"Отправить\"><svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path d=\"M2.5 8h10M9 4.5 12.5 8 9 11.5\" /></svg></button></form>\n    </div>", "\n    <button class=\"as-fab\" aria-label=\"Open assistant\"><svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path d=\"M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z\" /><path class=\"k\" d=\"M5.5 7h5\" /></svg><span>Assistant</span></button>\n    <div class=\"as-panel\" role=\"dialog\" aria-label=\"AI assistant\">\n      <div class=\"as-head\"><span>ASSISTANT <b>·</b> SCENE CONTEXT</span><button class=\"as-close\" aria-label=\"Minimize\"></button></div>\n      <div class=\"as-msgs\"></div>\n      <div class=\"as-chips\"></div>\n      <form class=\"as-form\"><input placeholder=\"Ask about what you see…\" autocomplete=\"off\" /><button type=\"submit\" aria-label=\"Send\"><svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path d=\"M2.5 8h10M9 4.5 12.5 8 9 11.5\" /></svg></button></form>\n    </div>");
  document.body.appendChild(root);

  const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const msgs = $('.as-msgs'), input = $<HTMLInputElement>('.as-form input'), chips = $('.as-chips');
  const history: Msg[] = [];
  let busy = false;

  const scrollDown = () => msgs.scrollTo({ top: msgs.scrollHeight, behavior: 'smooth' });
  const add = (role: Msg['role'], text: string) => {
    const el = document.createElement('div');
    el.className = `as-msg ${role}`;
    el.innerHTML = md(text);
    msgs.appendChild(el);
    scrollDown();
    return el;
  };

  const toggle = (open: boolean) => {
    root.classList.toggle('open', open);
    if (open) { setTimeout(() => input.focus(), 250); scrollDown(); }
  };
  $('.as-fab').onclick = () => toggle(true);
  $('.as-close').onclick = () => toggle(false);
  addEventListener('keydown', (e) => { if (e.key === 'Escape') toggle(false); });

  add('assistant', localized("Привет! Я подскажу о том, что вы сейчас видите в модели: про планеты, спутники и аппараты.", "Hello! I can explain what you are viewing in the model: planets, moons and spacecraft."));
  chips.innerHTML = [localized("Что я сейчас вижу?", "What am I looking at?"), localized("Расскажи про Млечный Путь", "Tell me about the Milky Way"), localized("Какая планета самая большая?", "Which planet is the largest?")]
    .map((q) => `<button type="button">${q}</button>`).join('');
  chips.onclick = (e) => { const b = (e.target as HTMLElement).closest('button'); if (b) send(b.textContent!); };

  async function send(text: string) {
    text = text.trim();
    if (!text || busy) return;
    busy = true; input.value = ''; chips.classList.add('hidden');
    add('user', text); history.push({ role: 'user', content: text });
    const wait = add('assistant', '…'); wait.classList.add('typing');
    const ctx = getContext();
    let answer: string;
    try {
      answer = CFG.apiUrl ? await askApi(history.slice(-12), ctx) : askLocal(text, ctx);
    } catch (err) {
      // API не ответил — отвечаем из встроенных данных и сообщаем причину
      answer = `${askLocal(text, ctx)}${localized("\n\n_(Расширенный ответ сейчас недоступен.)_", "\n\n_(An extended answer is currently unavailable.)_")}`;
    }
    wait.classList.remove('typing'); wait.innerHTML = md(answer);
    history.push({ role: 'assistant', content: answer });
    busy = false; scrollDown();
  }
  $<HTMLFormElement>('.as-form').onsubmit = (e) => { e.preventDefault(); send(input.value); };
}
