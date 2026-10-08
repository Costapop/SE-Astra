const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');
let html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
html = html.replace(/<script src="vendor\/chart[^" ]*"><\/script>/, '<script>window.Chart=class { constructor(el,cfg){this.canvas=el;this.config=cfg;this.data=cfg.data;this.options=cfg.options;}destroy(){}resize(){}update(){} };</script>').replace(/<script src="vendor\/[^" ]*"><\/script>/g, '');
html = html.replace('  // ---------------------------------------------------------------- стартовое состояние:', 'window.__analysisTest={S,stopAnalysisWorker,runAnalysis,resetFitProgress,finalProgress,fitComplete,fitMetric};\n  // ---------------------------------------------------------------- стартовое состояние:');
const errors = [];
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost', beforeParse(w) {
  require('./worker_shim')(w); w.scrollTo = () => {}; w.addEventListener('error', e => errors.push(e.message));
} });
const w = dom.window, $ = id => w.document.getElementById(id), sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 180000) { const t = Date.now(); while (!fn()) { assert.ok(Date.now() - t < ms, 'Timed out: ' + $('globalStatus').textContent); await sleep(20); } }
const current = () => Number(w.document.querySelector('[data-analysis-stage][aria-current="step"]').dataset.analysisStage);
const active = () => [...w.document.querySelectorAll('#page-analysis main>.step')].filter(s => !s.hidden).map(s => s.id);
(async () => {
  await sleep(25); assert.deepEqual(active(), ['s0']);
  $('nTrain').value = '200';
  const seen = new Set(), statuses = new Set(); let ticks = 0, maxGap = 0, last = Date.now();
  const completedAt = new Map(), enteredAt = new Map();
  const timer = setInterval(() => {
    const now = Date.now(); maxGap = Math.max(maxGap, now - last); last = now; ticks++;
    const visible = active(), n = current(); seen.add('s' + n);
    if (!enteredAt.has(n)) enteredAt.set(n, Date.now());
    if (n && !$('stageLive' + n).classList.contains('is-running') && !completedAt.has(n)) completedAt.set(n, Date.now());
    assert.deepEqual(visible, Array.from({length:n + 1}, (_, i) => 's' + i));
    statuses.add($('stageStatus4').textContent);
    if (n === 3 && $('inferenceTop').children.length) {
      const shown = [...$('inferenceTop').children].filter(r => r.getAttribute('aria-hidden') === 'false');
      if (shown.length) assert.equal(shown.length, 5);
    }
  }, 16);
  $('btnAll').click(); assert.deepEqual(active(), ['s0', 's1']);
  assert.equal($('analysisControls').inert, true);
  await until(() => !$('btnAll').disabled);
  clearInterval(timer);
  assert.equal($('globalStatus').textContent, 'Готово.');
  assert.deepEqual([...seen].sort(), ['s1', 's2', 's3', 's4']);
  for (const n of [1, 2, 3]) assert.ok(enteredAt.get(n + 1) - completedAt.get(n) >= 2250, 'Result was skipped too quickly: ' + n);
  assert.ok(ticks > 50); assert.ok(maxGap < 500, 'UI event-loop stalled for ' + maxGap + ' ms');
  assert.ok(statuses.size > 4); assert.deepEqual(active(), ['s0', 's1', 's2', 's3', 's4']);
  assert.ok(w.__analysisTest.S.fin); assert.ok($('causeOut').querySelector('table'));
  for (const name of ['Spectra', 'Anchors', 'Model']) {
    const bar = $('train' + name + 'Bar'); assert.equal(bar.value, bar.max);
    assert.ok(bar.closest('.training-phase').classList.contains('is-complete'));
  }
  assert.equal($('stageLive2').querySelectorAll('progress').length, 3);
  assert.equal($('stageBar2'), null);
  const fin = w.__analysisTest.S.fin;
  assert.ok(Number($('fitEvaluations').textContent) >= fin.nfev);
  assert.equal($('fitXMax').textContent, $('fitEvaluations').textContent);
  assert.equal($('fitCurrent').getAttribute('cx'), '600');
  assert.ok(Math.abs(Number($('fitChi').textContent) - fin.chi2) <= Math.max(0.0005, fin.chi2 * 0.005));
  assert.match($('fitPhase').textContent, new RegExp('ν = ' + fin.dof));
  assert.match($('finOut').textContent, new RegExp('N = ' + w.__analysisTest.S.data.lam.length + ', p = ' + fin.free.length + ', ν = ' + fin.dof));
  assert.ok(!$('fitTrace').getAttribute('d').includes('NaN'));
  w.location.hash = '#s0'; await sleep(40); assert.equal(current(), 0); assert.equal(active().length, 5);
  w.location.hash = '#s4'; await sleep(40); assert.equal(current(), 4); assert.equal(active().length, 5);
  for (const id of ['finOut', 'truthOut', 'causeOut']) {
    const table = $(id).querySelector('table'); assert.ok(table.classList.contains('analysis-table'));
    assert.ok([...table.querySelectorAll('tbody td')].every(td => td.dataset.label));
  }
  $('viewStage3').click(); assert.equal(current(), 3); assert.equal(active().length, 5);
  assert.equal([...$('inferenceTop').children].filter(r => r.getAttribute('aria-hidden') === 'false').length, 5);
  // Cancel diagnosis; stale final results must disappear and training remains reusable.
  $('btn3').click(); await until(() => /Определяем вероятности/.test($('stageStatus3').textContent));
  $('btnCancel').click(); await until(() => !$('btnAll').disabled);
  assert.match($('globalStatus').textContent, /остановлен/); assert.equal(w.__analysisTest.S.fin, null); assert.equal(w.__analysisTest.S.probs, null);
  $('btn3').click(); await until(() => !$('btnAll').disabled); assert.ok(w.__analysisTest.S.probs);
  // Cancellation in a true background fit is immediate; the next launch succeeds.
  $('btn4').click(); await until(() => $('fitTrace').getAttribute('d').length > 10);
  $('btnCancel').click(); await until(() => !$('btnAll').disabled, 2000); assert.match($('globalStatus').textContent, /остановлен/);
  $('btn4').click(); await until(() => !$('btnAll').disabled); assert.equal($('globalStatus').textContent, 'Готово.');
  $('viewStage3').click(); $('ckAbs').click(); assert.equal(w.__analysisTest.S.fin, null); assert.equal($('viewStage4').disabled, true);
  // Error/unsupported worker restores controls; no silent synchronous freeze fallback.
  w.__analysisTest.stopAnalysisWorker(new Error('test reset'));
  const Worker = w.Worker; w.Worker = class { constructor() { throw new Error('worker failed'); } };
  $('btn1').click(); await until(() => !$('btnAll').disabled); assert.match($('globalStatus').textContent, /worker failed/); assert.equal($('analysisControls').inert, false);
  w.Worker = Worker; $('btnAll').click(); await until(() => /Шаг 1 завершён/.test($('stageStatus1').textContent));
  $('btnCancel').click(); await until(() => !$('btnAll').disabled, 1000);
  assert.match($('globalStatus').textContent, /остановлен/); assert.ok(w.__analysisTest.S.ref); assert.equal(w.__analysisTest.S.train, null);
  // Cancel training, switch sample, no late worker response may revive old results.
  $('btn2').click(); await until(() => $('trainSpectraBar').value > 0);
  $('btnCancel').click(); await until(() => !$('btnAll').disabled, 2000);
  $('exSel').value = '8'; $('exSel').dispatchEvent(new w.Event('change')); await sleep(100);
  assert.deepEqual(active(), ['s0']); assert.equal(w.__analysisTest.S.train, null); assert.equal($('stageLive3').hidden, true);
  // Synthetic edge cases verify the displayed scale, run boundaries and veto-pass total.
  const ui = w.__analysisTest;
  ui.resetFitProgress();
  const event = { phase: 'refine', run: 1, nfev: 10, chi2: 1e-8, P: {d: 100}, iteration: 2, profileLayers: 1 };
  ui.finalProgress(event);
  assert.equal(Number($('fitChi').textContent), 1e-8);
  assert.ok(Number($('fitYMin').textContent) <= 1e-8 && Number($('fitYMax').textContent) >= 1e-8);
  ui.finalProgress({...event, run: 2, nfev: 21, chi2: 2e-8});
  ui.finalProgress({...event, nfev: 4, chi2: 3e-8}, 1);
  assert.equal($('fitEvaluations').textContent, '25');
  assert.equal(($('fitTrace').getAttribute('d').match(/M/g) || []).length, 3);
  ui.fitComplete({P:{d:100}, chi2:1e-9, nfev:7, iterations:3, runs:1, profileLayers:1, dof:99});
  assert.equal($('fitEvaluations').textContent, '28');
  assert.equal(Number($('fitChi').textContent), 1e-9);
  assert.equal($('fitCurrent').getAttribute('cx'), '600');
  ui.resetFitProgress(); ui.finalProgress({...event, chi2:0});
  assert.ok(!/NaN|Infinity/.test($('fitTrace').getAttribute('d')));
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(`PASS: continuous four-stage feed, top 5, tables, actual Worker, cancel/retry/error/sample reset; ${ticks} heartbeats, maximum gap ${maxGap} ms.`);
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => dom.window.close());
