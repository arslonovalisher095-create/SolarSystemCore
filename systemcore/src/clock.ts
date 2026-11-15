import { localized } from './i18n';
/** Глобальные часы симуляции: скорость в сим-секундах за реальную секунду. */
export class SimClock {
  private simMs = Date.now();
  private last = performance.now();
  rate = 1;
  paused = false;

  get date() { return new Date(this.simMs); }

  tick() {
    const now = performance.now();
    if (!this.paused) this.simMs += (now - this.last) * this.rate;
    this.last = now;
  }
  setRate(r: number) { this.rate = r; this.paused = false; }
  setTime(ms: number) { this.simMs = ms; }
  togglePause() { this.paused = !this.paused; }
  goLive() { this.simMs = Date.now(); this.rate = 1; this.paused = false; }
  isLive() { return !this.paused && this.rate === 1 && Math.abs(this.simMs - Date.now()) < 5000; }

  describe() {
    if (this.paused) return localized("ПАУЗА", "PAUSED");
    if (this.isLive()) return '';
    const r = Math.abs(this.rate), sign = this.rate < 0 ? '−' : '';
    const units: [number, string][] = [[31557600, localized("год", "year")], [2629800, localized("мес", "mo")], [86400, localized("день", "day")], [3600, localized("час", "h")], [60, localized("мин", "min")], [1, localized("сек", "s")]];
    const [v, n] = units.find(([u]) => r >= u) ?? [1, localized("сек", "s")];
    return `${sign}${+(r / v).toFixed(1)} ${n}${localized("/с", "/s")}`;
  }
}
