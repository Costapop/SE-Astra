/* Regression checks from the v1.3.0 scientific audit.
   Run: node test/physics_audit.js. No external dependencies or saved fit snapshots. */
'use strict';
const assert = require('node:assert/strict');
const E = require('../src/ellip_core.js');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`ok ${passed} — ${name}`); }
function near(actual, expected, abs, rel = 0) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= abs + rel * Math.abs(expected), `${actual} ≠ ${expected}`);
}

test('Si tables are continuous at both published endpoints', () => {
  for (const key of ['si', 'si_aspnes']) {
    const [lo, hi] = E.SUBSTRATES[key].range;
    for (const [edge, inside] of [[lo, lo + 1e-7], [hi, hi - 1e-7]]) {
      const [a, b] = E.substrateN(key, [edge, inside]);
      near(a[0], b[0], 5e-8); near(a[1], b[1], 5e-8);
    }
  }
  // The first Green interval must connect the actual 250 and 260 nm data.
  const mid = E.substrateN('si', [255])[0];
  near(mid[0], (1.665 + 1.757) / 2, 1e-14);
  near(-mid[1], (3.665 + 4.084) / 2, 1e-14);
});

test('tabulated knots, short tables and endpoint clamping are preserved', () => {
  for (const t of [[[0, 1, 0], [1, 2, .1]], [[0, 1, 0], [1, 2, .1], [2, 4, .2]], [[0, 1, 0], [1, 2, .1], [2, 4, .2], [3, 3, .3]]]) {
    for (const row of t) assert.deepEqual(E.cubicTab(t, row[0]), row.slice(1));
    assert.deepEqual(E.cubicTab(t, -1), t[0].slice(1));
    assert.deepEqual(E.cubicTab(t, 10), t.at(-1).slice(1));
    assert.ok(E.cubicTab(t, .5).every(Number.isFinite));
  }
});

test('weak extinction satisfies ε₂ = 2nk down to a 10⁻¹¹ eV tail', () => {
  const m = E.MATERIALS.tio2, energy = E.HC / 400;
  for (const Ak of [1e-3, 1e-5, 1e-7, 1e-9, 1e-11]) {
    const [n, minusK] = E.filmN([400], { ...m, Ak })[0];
    const eps2 = E.tlEps(energy, Ak, m.E0, m.C, E.TAIL_ET)[1];
    near(-2 * n * minusK, eps2, 1e-25, 2e-14);
    const jac = E.filmNJac([400], { ...m, Ak });
    near(jac.N[0][0], n, 1e-14); near(jac.N[0][1], minusK, 1e-20, 1e-12);
  }
  for (const k of [1e-10, 1e-8, 1e-6, 1e-3, .03]) near(E.tailK400(m, E.tailAk(m, k)), k, 1e-14, 1e-8);
});

test('propagation preserves tiny absorption and the passive evanescent branch', () => {
  const phi = 70, s2 = Math.sin(phi * Math.PI / 180) ** 2, n = 1.5, k = 1e-11;
  const stack = E.stackCoefs(550, [], [n, -k], phi), [qr, qi] = stack.s.qs;
  // (N cos γ)² = N² − sin²φ, an identity independent of Fresnel implementation.
  near(qr * qr - qi * qi, n * n - k * k - s2, 1e-14);
  near(2 * qr * qi, -2 * n * k, 1e-25, 1e-13);
  const evanescent = E.stackCoefs(550, [], [.5, 0], 60);
  assert.ok(evanescent.s.qs[1] < 0, 'exp(−ikz) must decay into a passive substrate');
  const [rp, rs] = E.rhoStack([550], [], [[.5, 0]], 60);
  near(rp[0][0] ** 2 + rp[0][1] ** 2, 1, 1e-14);
  near(rs[0][0] ** 2 + rs[0][1] ** 2, 1, 1e-14);
  near(rp[0][1], -evanescent.p.r[1], 1e-14);
  near(rs[0][1], evanescent.s.r[1], 1e-14);
});

test('zero-thickness continuous film equals the bare substrate', () => {
  const lam = [400, 550, 800], sub = E.substrateN('bk7', lam);
  const a = E.rhoGraded(lam, sub, 65, 0, E.MATERIALS.tio2, .1, 0, .5), b = E.rhoStack(lam, [], sub, 65);
  for (let p = 0; p < 2; p++) for (let i = 0; i < lam.length; i++) for (let z = 0; z < 2; z++) near(a[p][i][z], b[p][i][z], 1e-14);
});

test('dispersion derivative remains defined at zero oscillator strength', () => {
  const m = { ...E.MATERIALS.tio2, A: 0 }, lam = [350, 400, 600], analytic = E.filmNJac(lam, m), h = 1e-4;
  const plus = E.filmN(lam, { ...m, A: h }), minus = E.filmN(lam, { ...m, A: -h });
  // In the transparent region both signs are admissible for the numerical check.
  for (const i of [1, 2]) near(analytic.dN.A[i][0], (plus[i][0] - minus[i][0]) / (2 * h), 1e-10, 1e-6);
  assert.ok(analytic.dN.A.flat().every(Number.isFinite));
});

test('quarter-wave crossings before the first half-wave point are retained', () => {
  const lam = [400, 450, 500, 550, 600, 650, 700, 750, 800], phase = lam.map((_, i) => 45 + 45 * i);
  for (const sign of [1, -1]) {
    const anchors = E.anchors(lam, phase.map(x => sign * x), lam.map(() => 0));
    assert.deepEqual(anchors.HW, [750]); assert.deepEqual(anchors.QW, [550]);
  }
  // A turn in phase must produce both local crossings, without duplicated grid hits.
  const turns = E.anchors([400, 450, 500, 550, 600], [0, 120, 240, 120, 0], [0, 0, 0, 0, 0]);
  assert.deepEqual(turns.HW, []); assert.deepEqual(turns.QW, [475, 525]);
});

test('global residual RMS survives an absence of interference anchors', () => {
  const dd = { lam: [400, 500, 600], del: [0, 0, 0] }, cfg = { subDel: [0, 0, 0] };
  const result = E.featureVector(dd, cfg, [1, -2, 2, 3, -4, 0]);
  near(result[6 + 4], Math.sqrt(3), 1e-14);
  near(result[6 + 5], 5 / Math.sqrt(3), 1e-14);
  near(result[6], 0, 0);
});

test('unavailable covariance cannot silently become a zero significance threshold', () => {
  const singular = E.lmFitJac(x => ({ r: [x[0] + x[1] - 1, 2 * (x[0] + x[1] - 1)], J: [[1, 2], [1, 2]] }), [.4, .4], [0, 0], [1, 1], 10);
  assert.equal(singular.cov, null);
  assert.ok(Number.isNaN(E.vetoThreshold({ E: { delta: singular.err[0] } }, 'delta')));
  assert.ok(Number.isNaN(E.vetoThreshold({ E: { delta: .1 }, sys: { total: { delta: NaN } } }, 'delta')));
  near(E.vetoThreshold({ E: { delta: .1 }, sys: { total: { delta: .4 } } }, 'delta'), .5, 1e-14);
});

// A reproducible absorbing spectrum with correlated dispersion parameters.
const lam = Array.from({ length: 81 }, (_, i) => 400 + 5 * i), m = { ...E.MATERIALS.sinx };
const P = { d: 850, A: m.A, Auv: m.Auv, Eg: m.Eg, Ak: E.tailAk(m, .03), dRough: 0, delta: 0 };
const cfg = { mat: m, subKey: 'bk7', Nsub: E.substrateN('bk7', lam), phi: 65, back: null, band: null };
const prior = { dMin: 830, dMax: 870 }, flags = { abs: true, grad: false, rough: false };
const clean = E.modelPsiDelta(lam, cfg.Nsub, cfg.phi, P.d, { ...m, Ak: P.Ak }, 0, 0, 1);
const data = { lam, psi: Array.from(clean.psi, (v, i) => v + .012 * Math.sin(1.7 * i)), del: Array.from(clean.del, (v, i) => v + .025 * Math.cos(1.3 * i)), sigPsi: lam.map(() => .02), sigDel: lam.map(() => .04) };
const fit = E.finalFit(data, cfg, prior, flags, P, { phiErr: .002 });

test('k₄₀₀ uncertainty agrees with independent covariance-direction perturbations', () => {
  assert.ok(fit.cov && fit.E.k400 > 0);
  // Cholesky factors define independent 1σ directions. Evaluate the nonlinear
  // derived quantity along each direction; do not use the core gradient.
  const size = fit.free.length, L = Array.from({ length: size }, () => Array(size).fill(0));
  for (let i = 0; i < size; i++) for (let j = 0; j <= i; j++) {
    let value = (fit.cov[i][j] + fit.cov[j][i]) / 2;
    for (let k = 0; k < j; k++) value -= L[i][k] * L[j][k];
    L[i][j] = i === j ? Math.sqrt(value) : value / L[j][j];
  }
  const derived = values => E.tailK400({ ...m, ...values }, values.Ak), step = .01;
  let variance = 0;
  for (let j = 0; j < size; j++) {
    const plus = { ...fit.P }, minus = { ...fit.P };
    fit.free.forEach((key, i) => { plus[key] += step * L[i][j]; minus[key] -= step * L[i][j]; });
    variance += ((derived(plus) - derived(minus)) / (2 * step)) ** 2;
  }
  near(fit.E.k400, Math.sqrt(variance), 1e-11, 2e-5);
  const h = 1e-5, onlyAk = fit.E.Ak * (derived({ ...fit.P, Ak: fit.P.Ak + h }) - derived({ ...fit.P, Ak: fit.P.Ak - h })) / (2 * h);
  assert.ok(Math.abs(onlyAk / fit.E.k400 - 1) > .15, 'fixture must expose the omitted covariance contribution');
});

test('k₄₀₀ angle systematic agrees with two independently repeated fits', () => {
  const plus = E.finalFit(data, { ...cfg, phi: cfg.phi + .002 }, prior, flags, fit.P);
  const minus = E.finalFit(data, { ...cfg, phi: cfg.phi - .002 }, prior, flags, fit.P);
  const observed = (plus.P.k400 - minus.P.k400) / 2;
  near(fit.sys.shifts.phi.k400, observed, 1e-8, .01);
  near(fit.sys.total.k400, Math.abs(observed), 1e-8, .01);
});

console.log(`\n${passed} scientific-audit regression checks passed.`);
