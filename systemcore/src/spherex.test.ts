import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMBEDDED_TLE,
  SPHEREX_LAUNCH_MS,
  propagateSpherex,
  spherexOrbitRing,
  generateSpectrum,
  surveyStats,
  planetXState,
  planetXOrbitPath,
  KM_PER_AU,
} from './spherex';

test('SGP4 propagates SPHEREx in realistic Sun-Synchronous LEO (~630-710 km)', () => {
  const date = new Date('2026-11-14T12:00:00Z');
  const res = propagateSpherex(date);
  assert.ok(res, 'SPHEREx propagation must succeed after launch');
  assert.ok(
    res.telemetry.altitudeKm > 600 && res.telemetry.altitudeKm < 750,
    `Expected SSO altitude 600..750 km, got ${res.telemetry.altitudeKm}`
  );
  assert.ok(
    res.telemetry.speedKmS > 7.2 && res.telemetry.speedKmS < 7.8,
    `Expected orbital speed ~7.5 km/s, got ${res.telemetry.speedKmS}`
  );
  assert.ok(
    Math.abs(res.telemetry.inclinationDeg - 97.96) < 0.5,
    `Expected SSO inclination ~97.96 deg, got ${res.telemetry.inclinationDeg}`
  );
  // Dawn-dusk SSO stays sunlit most or all of the orbit, never NaN
  let sunlitCount = 0;
  for (let m = 0; m < 100; m += 10) {
    const p = propagateSpherex(new Date(date.getTime() + m * 60e3));
    if (p?.telemetry.sunlit) sunlitCount++;
  }
  assert.ok(sunlitCount >= 5, `Expected Dawn-Dusk SSO to be sunlit across most of orbit, got ${sunlitCount}/10`);
  assert.equal(EMBEDDED_TLE.source, 'embedded');
});

test('SGP4 returns null before March 11, 2025 launch', () => {
  const preLaunch = new Date(SPHEREX_LAUNCH_MS - 86400e3);
  assert.equal(propagateSpherex(preLaunch), null);
});

test('spherexOrbitRing builds a closed ~7000 km orbital loop around Earth', () => {
  const pts = spherexOrbitRing(new Date('2026-11-14T12:00:00Z'), 120);
  assert.equal(pts.length, 121);
  for (const [x, y, z] of pts) {
    const r = Math.hypot(x, y, z);
    assert.ok(r > 6900 && r < 7200, `Expected geocentric radius ~7020 km, got ${r}`);
  }
  const gap = Math.hypot(
    pts[0][0] - pts[120][0],
    pts[0][1] - pts[120][1],
    pts[0][2] - pts[120][2]
  );
  assert.ok(gap < 150, `Expected nearly closed 1-orbit ring, gap was ${gap} km`);
});

test('generateSpectrum emits exact 102 SPHEREx NIR channels (0.75-5.00 um) with distinct physics', () => {
  const europa = generateSpectrum('europa');
  const planetX = generateSpectrum('planet-x');
  assert.equal(europa.length, 102);
  assert.equal(planetX.length, 102);
  assert.equal(europa[0].wavelengthUm, 0.75);
  assert.equal(europa[101].wavelengthUm, 5);
  assert.equal(europa[0].band, 'D1');
  assert.equal(europa[101].band, 'D6');

  // Europa has strong water-ice absorption around 3.05 um (D4)
  const europa305 = europa.find((c) => Math.abs(c.wavelengthUm - 3.05) < 0.03)!;
  const europa100 = europa.find((c) => Math.abs(c.wavelengthUm - 1.0) < 0.03)!;
  assert.ok(europa305.flux < europa100.flux * 0.45, 'Europa 3.05 um H2O ice dip must be deep');

  // Planet X shows rising thermal/D6 tail relative to mid-IR D4 dip
  const px335 = planetX.find((c) => Math.abs(c.wavelengthUm - 3.35) < 0.03)!;
  const px490 = planetX.find((c) => Math.abs(c.wavelengthUm - 4.9) < 0.03)!;
  assert.ok(px490.flux > px335.flux * 2.0, 'Planet X D6 4.9 um flux must exceed CH4 3.35 um absorption');

  // Feature callouts must never duplicate across adjacent channels
  const features = planetX.map((c) => c.feature).filter(Boolean);
  assert.equal(features.length, 4);
  assert.equal(new Set(features).size, features.length);
});

test('surveyStats tracks passes and multi-billion spectra progression', () => {
  const s2026 = surveyStats(new Date('2026-11-14T12:00:00Z'));
  assert.ok(s2026.currentPass >= 3 && s2026.currentPass <= 4);
  assert.ok(s2026.totalSpectraBillions > 8.0, `Expected >8B spectra by Nov 2026, got ${s2026.totalSpectraBillions}`);
  assert.equal(s2026.galaxiesCatalogedM, 450);
  assert.equal(s2026.starsCatalogedM, 100);
});

test('planetXState and planetXOrbitPath compute outer solar system eccentric orbit (~220-540 AU)', () => {
  const st = planetXState(new Date('2026-11-14T12:00:00Z'));
  const rAu = Math.hypot(st.pos[0], st.pos[1], st.pos[2]) / KM_PER_AU;
  assert.ok(rAu > 200 && rAu < 600, `Expected Planet X at 200..600 AU, got ${rAu} AU`);
  const path = planetXOrbitPath(180);
  assert.equal(path.length, 181);
});
