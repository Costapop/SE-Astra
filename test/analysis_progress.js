const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const E = require('../src/ellip_core'), jobs = require('../src/analysis_tasks');
const examples = require('../examples/examples.json');
// Real scientific inputs: callbacks must not change parameters, residuals or errors.
for (const e of [examples[0], examples[5], examples[8]]) {
  const data = Object.fromEntries(['lam', 'psi', 'del', 'sigPsi', 'sigDel'].map(k => [k, e[k]]));
  const cfg = { mat: E.MATERIALS[e.mat], subKey: e.sub, Nsub: E.substrateN(e.sub, e.lam), phi: e.phi, back: e.back ? { f: e.back.f, ds: e.back.ds } : null };
  const prior = { dMin: e.dNom * (1 - e.dRange / 100), dMax: e.dNom * (1 + e.dRange / 100) };
  const events = [], baseline = E.referenceFit(data, cfg, prior), observed = E.referenceFit(data, cfg, prior, p => events.push(p));
  assert.deepEqual(observed, baseline); assert.ok(events.some(p => p.phase === 'reference' && p.iteration > 0));
  const flags = { grad: e.truth.delta !== 0, rough: e.truth.dRough > 0, abs: e.truth.k400 > 0 };
  const p0 = { ...baseline.P, delta: e.truth.delta, dRough: e.truth.dRough, Ak: e.truth.mat.Ak || 0 };
  const finCfg = { ...cfg, band: { bw: e.bw, subKey: e.sub } };
  const f0 = E.finalFit(data, finCfg, prior, flags, p0), f1 = E.finalFit(data, finCfg, prior, flags, p0, null, p => events.push(p));
  assert.deepEqual(f1, f0); assert.ok(events.some(p => p.phase === 'refine' && Number.isFinite(p.P.d)));
}
// The explanation's last frame must equal the actual classifier, not interpolated odds.
const X = Array.from({ length: 48 }, (_, i) => Array.from({ length: 32 }, (_, j) => Math.sin(i * .3 + j) + Math.cos(i * j * .03)));
const model = E.trainSoftmax(X, X.map((_, i) => i % 12), 12, { epochs: 40 });
const rd = E.ridge(X, X.map((_, i) => i / 10), 30);
const pack = m => ({ w: m.w, ym: m.ym, mu: m.st.mu, sd: m.st.sd });
const t = { model: { W: model.W, b: model.b, mu: model.st.mu, sd: model.st.sd }, rd: pack(rd), rr: pack(rd), rk: pack(rd) };
const d = jobs.diagnose({ train: t, x: X[17] });
assert.deepEqual(d.probs, model.predictProba(X[17]));
assert.equal(d.est.delta, rd.predict(X[17]) / 100);
assert.ok(d.frames.length > 20);
d.frames.forEach(f => { assert.ok(Math.abs(f.probs.reduce((s, p) => s + p, 0) - 1) < 1e-12); assert.ok(f.probs.every(p => p >= 0 && p <= 1)); });
assert.equal(d.frames.at(-1).fraction, 1);
console.log('PASS: progress preserves real fits (gradient, absorption, backside); inference trace equals trained softmax.');
