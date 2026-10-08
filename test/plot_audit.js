/* Release audit: independent holdout regressions, exact fit curves, factor budget
 * and real Chart.js handling of nonmonotone residual coordinates. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const E = require('../src/ellip_core');
const source = fs.readFileSync(path.join(__dirname, '../src/analysis_tasks.js'), 'utf8');
const template = fs.readFileSync(path.join(__dirname, '../src/app_template.html'), 'utf8');
function jobs(core) {
  const context = { module: { exports: {} }, require: () => core };
  vm.runInNewContext(source, context);
  return context.module.exports;
}

// Use deterministic feature rows with real standardization, ridge and softmax.
// A validation prediction is rejected if its spectrum was used to fit that ridge.
let index = 0;
const regressionCalls = [];
const target = i => [Math.sin(i * .71), (i % 7) / 3, (i % 11) / 20];
const core = { ...E,
  trainingSpectrum(data, cfg, prior, nuis, rng, cls) {
    const i = index++, values = target(i);
    return { dd: { del: [i] }, resid: [i], y: cls,
      delta: values[0] / 100, dRough: values[1], k400: values[2] / 1000 };
  },
  featureVector(dd) { const i = dd.del[0]; return [i, ...Array.from({ length: 9 }, (_, j) => Math.sin((i + 1) * (j + 1) * .17))]; },
  ridge(X, y, alpha) {
    const m = E.ridge(X, y, alpha), ids = new Set(X.map(row => row[0]));
    const call = { count: X.length, predictions: [] }; regressionCalls.push(call);
    return { ...m, predict(x) {
      assert.ok(!ids.has(x[0]), 'RMSE must use spectra excluded from fitting and standardization');
      const value = m.predict(x); call.predictions.push([x[0], value]); return value;
    } };
  }
};
const trained = jobs(core).run('train', { data: { lam: [400] }, cfg: {}, prior: {}, nuis: {}, N: 60, seed: 7 });
const validation = regressionCalls.filter(call => call.predictions.length);
assert.equal(validation.length, 3);
assert.ok(validation.every(call => call.count === 30 && call.predictions.length === 30));
assert.equal(regressionCalls.filter(call => call.count === 60).length, 3, 'final regressions use the full generated sample');
const expected = validation.map((call, j) => Math.sqrt(call.predictions.reduce((s, [i, prediction]) => s + ((j === 2 ? Math.max(0, prediction) : prediction) - target(i)[j]) ** 2, 0) / call.predictions.length));
assert.equal(trained.rmseD, expected[0]); assert.equal(trained.rmseR, expected[1]); assert.equal(trained.rmseK, expected[2] / 1000);

// A fitted delta can cross a mesh threshold during the last optimization.
// Plot the mesh that produced the returned residuals, not a reselected mesh.
let plottedLayers;
const finalJob = jobs({ ...E,
  finalFit: () => ({ P: { d: 1000, A: 1, Auv: 1, Eg: 3, delta: .0399 }, M: 80 }),
  modelPsiDelta(...args) { plottedLayers = args[7]; return { psi: [1], del: [2] }; }
});
finalJob.run('final', { data: { lam: [400] }, cfg: { mat: E.MATERIALS.tio2 }, flags: {}, prior: {}, p0: {} });
assert.equal(plottedLayers, 80);

// Pure Delta drift must remain present on the noise-only removal row; a
// substrate thickness mismatch belongs to the backside budget even at equal f.
const synthesisOptions = [], fittedBacks = [];
const P = { d: 1000, A: 100, Auv: 80, Eg: 3, delta: 0, dRough: 0, k400: 0 };
const budgetJob = jobs({ ...E,
  synthesize(lam, sub, phi, d, mat, delta, rough, opt) { synthesisOptions.push(opt); return { psi: lam.map(() => 20), del: lam.map(() => 180) }; },
  finalFit(data, cfg) { fittedBacks.push(cfg.back); return { P, chi2: 0 }; }
});
const data = { lam: [400, 500, 600], sigPsi: [.02, .02, .02], sigDel: [.04, .04, .04] };
const truth = { d: 1000, mat: E.MATERIALS.tio2, phiTrue: 65, delta: 0, dRough: 0, k400: 0, bw: 0, lamOffset: 0, driftDel: [.03, .01], back: { f: .4, ds: 1e6 } };
const budget = budgetJob.run('causes', { data, example: { truth }, cfg: { subKey: 'bk7', mat: E.MATERIALS.tio2, back: { f: .4, ds: .5e6 } }, prior: {}, ref: { P }, fin: { P, chi2: 1 }, finFlags: { grad: false, rough: false, abs: false } });
assert.deepEqual(synthesisOptions[0].driftDel, truth.driftDel);
assert.match(budget.rows[1].label, /без шума \(дрейф/);
assert.ok(budget.rows.some(row => /толщина подложки/.test(row.label)));
assert.ok(fittedBacks.some(back => back.ds === 1e6));
assert.doesNotMatch(budget.rows.at(-1).label, /только численная/);

// Exercise the bundled Chart.js engine, not a chart stub. The old parsing:false
// marked these points sorted and could clip the negative/maximum x coordinates.
const planeSource = template.slice(template.indexOf('  function residualPlaneOpts()'), template.indexOf('\n  /** Опорный фит для иллюстраций'));
const context = { baseOpts: () => ({ responsive: false, animation: false, plugins: { legend: { display: false } }, scales: { x: { type: 'linear' }, y: { type: 'linear' } } }) };
vm.runInNewContext(planeSource, context);
const Chart = require('../vendor/chart.umd.min.js');
const canvas = { width: 600, height: 400 };
const ctx = new Proxy({ canvas, measureText: s => ({ width: String(s).length * 7 }), getLineDash: () => [] }, { get: (t, k) => k in t ? t[k] : () => {} });
canvas.getContext = () => ctx;
const points = [{ x: 1, y: 1 }, { x: -4, y: 3 }, { x: 10, y: -2 }, { x: 2, y: 0 }];
const chart = new Chart(canvas, { type: 'scatter', data: { datasets: [{ data: points }] }, options: context.residualPlaneOpts() });
assert.equal(chart.getDatasetMeta(0)._sorted, false);
assert.ok(chart.scales.x.min <= -4 && chart.scales.x.max >= 10, 'all residual coordinates must remain within the autoscaled plane');
chart.destroy();

// Phase wrapping introduces a line break without deleting a measured sample.
const phaseSource = template.slice(template.indexOf('  const delPts ='), template.indexOf('  const SIZE_FIELDS'));
const phaseContext = {};
vm.runInNewContext(phaseSource + '\nglobalThis.points = delPts([400, 402, 404], [359, 1, 4]);', phaseContext);
assert.deepEqual(Array.from(phaseContext.points).filter(p => p.y !== null).map(p => [p.x, p.y]), [[400, 359], [402, 1], [404, 4]]);
assert.ok(phaseContext.points.some(p => p.y === null));

// Side-by-side n/k tables need distinct physical headings; small nonzero
// absorption must survive numeric formatting instead of becoming a displayed 0.
const tableSource = template.slice(template.indexOf('  const fmtVal ='), template.indexOf('  /** Экспорт графика в PNG'));
const tableContext = {
  S: { charts: {
    n: { data: { datasets: [{ label: 'модель', data: [{ x: 400, y: 1.8 }] }] }, options: { scales: { x: { title: { text: 'λ, нм' } }, y: { title: { text: 'n' } } } } },
    k: { data: { datasets: [{ label: 'модель', data: [{ x: 400, y: 1e-9 }] }] }, options: { scales: { x: { title: { text: 'λ, нм' } }, y: { title: { text: 'k' } } } } }
  } },
  MINUS: '−', numStr: (v, n) => Number(v).toFixed(n), esc: String
};
vm.runInNewContext(tableSource, tableContext);
const table = tableContext.figTableHtml({ querySelectorAll: () => [{ id: 'n' }, { id: 'k' }] });
assert.match(table, /модель · n/); assert.match(table, /модель · k/); assert.match(table, /1\.000e−9/);
console.log('PASS: independent regression holdout, fitted mesh curves, Delta-only drift/backside budget, real Chart.js residual planes, phase wrap data and scientific table units/precision.');
