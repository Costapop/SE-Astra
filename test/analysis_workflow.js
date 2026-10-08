const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');
let html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
html = html.replace(/<script src="vendor\/chart[^" ]*"><\/script>/, '<script>window.Chart=class { constructor(el,cfg){this.canvas=el;this.config=cfg;this.data=cfg.data;this.options=cfg.options;}destroy(){}resize(){}update(){} };</script>').replace(/<script src="vendor\/[^" ]*"><\/script>/g, '');
html = html.replace('  // ---------------------------------------------------------------- стартовое состояние:', 'window.__analysisTest={S,stopAnalysisWorker,runAnalysis};\n  // ---------------------------------------------------------------- стартовое состояние:');
const errors = [];
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost', beforeParse(w) {
  require('./worker_shim')(w); w.scrollTo = () => {}; w.addEventListener('error', e => errors.push(e.message));
} });
const w = dom.window, $ = id => w.document.getElementById(id), sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 180000) { const t = Date.now(); while (!fn()) { assert.ok(Date.now() - t < ms, 'Timed out: ' + $('globalStatus').textContent); await sleep(20); } }
const active = () => [...w.document.querySelectorAll('#page-analysis main>.step')].filter(s => !s.hidden).map(s => s.id);
(async () => {
  await sleep(25); assert.deepEqual(active(), ['s0']);
  $('nTrain').value = '200';
  const seen = new Set(), statuses = new Set(); let ticks = 0, maxGap = 0, last = Date.now();
  const timer = setInterval(() => {
    const now = Date.now(); maxGap = Math.max(maxGap, now - last); last = now; ticks++;
    const visible = active(); assert.equal(visible.length, 1); seen.add(visible[0]);
    statuses.add($('stageStatus4').textContent);
    if (visible[0] === 's3' && $('inferenceTop').children.length) {
      const shown = [...$('inferenceTop').children].filter(r => r.getAttribute('aria-hidden') === 'false');
      if (shown.length) assert.equal(shown.length, 5);
    }
  }, 16);
  $('btnAll').click(); assert.deepEqual(active(), ['s1']);
  assert.equal($('analysisControls').inert, true);
  await until(() => !$('btnAll').disabled);
  clearInterval(timer);
  assert.equal($('globalStatus').textContent, 'Готово.');
  assert.deepEqual([...seen].sort(), ['s1', 's2', 's3', 's4']);
  assert.ok(ticks > 50); assert.ok(maxGap < 500, 'UI event-loop stalled for ' + maxGap + ' ms');
  assert.ok(statuses.size > 4); assert.deepEqual(active(), ['s4']);
  assert.ok(w.__analysisTest.S.fin); assert.ok($('causeOut').querySelector('table'));
  w.location.hash = '#s0'; await sleep(40); assert.deepEqual(active(), ['s0']);
  w.location.hash = '#s4'; await sleep(40); assert.deepEqual(active(), ['s4']);
  for (const id of ['finOut', 'truthOut', 'causeOut']) {
    const table = $(id).querySelector('table'); assert.ok(table.classList.contains('analysis-table'));
    assert.ok([...table.querySelectorAll('tbody td')].every(td => td.dataset.label));
  }
  $('viewStage3').click(); assert.deepEqual(active(), ['s3']);
  assert.equal([...$('inferenceTop').children].filter(r => r.getAttribute('aria-hidden') === 'false').length, 5);
  // Cancel diagnosis; stale final results must disappear and training remains reusable.
  $('btn3').click(); await until(() => /Учитываем/.test($('stageStatus3').textContent));
  $('btnCancel').click(); await until(() => !$('btnAll').disabled);
  assert.match($('globalStatus').textContent, /остановлен/); assert.equal(w.__analysisTest.S.fin, null); assert.equal(w.__analysisTest.S.probs, null);
  $('btn3').click(); await until(() => !$('btnAll').disabled); assert.ok(w.__analysisTest.S.probs);
  // Cancellation in a true background fit is immediate; the next launch succeeds.
  $('btn4').click(); await until(() => $('fitTrace').getAttribute('points').length > 10);
  $('btnCancel').click(); await until(() => !$('btnAll').disabled, 2000); assert.match($('globalStatus').textContent, /остановлен/);
  $('btn4').click(); await until(() => !$('btnAll').disabled); assert.equal($('globalStatus').textContent, 'Готово.');
  $('viewStage3').click(); $('ckAbs').click(); assert.equal(w.__analysisTest.S.fin, null); assert.equal($('viewStage4').disabled, true);
  // Error/unsupported worker restores controls; no silent synchronous freeze fallback.
  w.__analysisTest.stopAnalysisWorker(new Error('test reset'));
  const Worker = w.Worker; w.Worker = class { constructor() { throw new Error('worker failed'); } };
  $('btn1').click(); await until(() => !$('btnAll').disabled); assert.match($('globalStatus').textContent, /worker failed/); assert.equal($('analysisControls').inert, false);
  w.Worker = Worker; $('btn1').click(); await until(() => !$('btnAll').disabled); assert.ok(w.__analysisTest.S.ref);
  // Cancel training, switch sample, no late worker response may revive old results.
  $('btn2').click(); await until(() => /Смоделировано/.test($('globalStatus').textContent));
  $('btnCancel').click(); await until(() => !$('btnAll').disabled, 2000);
  $('exSel').value = '8'; $('exSel').dispatchEvent(new w.Event('change')); await sleep(100);
  assert.deepEqual(active(), ['s0']); assert.equal(w.__analysisTest.S.train, null); assert.equal($('stageLive3').hidden, true);
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(`PASS: four live stages, top 5, tables, actual Worker, cancel/retry/error/sample reset; ${ticks} heartbeats, maximum gap ${maxGap} ms.`);
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => dom.window.close());
