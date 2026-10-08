// The analysis workspace shows one stage; computation runs in a reusable Worker.
let analysisWorker = null, analysisRequest = 0, analysisPending = null, analysisAbort = null;
let analysisStage = 0, fitHistory = [], analysisStarted = 0, analysisTimer = null;
const stageNames = ['Спектр', 'Опорный фит', 'Обучение ИИ', 'Диагноз', 'Окончательный фит'];
const abortError = () => new DOMException('Расчёт остановлен.', 'AbortError');
const yieldPaint = () => new Promise(resolve => setTimeout(resolve, 24));
function stopAnalysisWorker(error) {
  if (analysisWorker) analysisWorker.terminate();
  analysisWorker = null;
  const pending = analysisPending; analysisPending = null;
  if (pending) { pending.cleanup(); pending.reject(error); }
}
function analysisTask(type, args, onProgress) {
  return new Promise((resolve, reject) => {
    if (analysisAbort?.signal.aborted) { reject(abortError()); return; }
    if (analysisPending) { reject(new Error('Предыдущий расчёт ещё выполняется.')); return; }
    try {
      if (!analysisWorker) {
        if (typeof Worker === 'undefined') throw new Error('Фоновые вычисления недоступны. Откройте приложение в актуальном Safari, Chrome, Firefox или Edge.');
        const code = $('ellip-core').textContent + '\n' + $('analysis-tasks').textContent;
        const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
        try { analysisWorker = new Worker(url); } finally { URL.revokeObjectURL(url); }
        analysisWorker.onmessage = ({ data }) => {
          const p = analysisPending;
          if (!p || p.id !== data.id) return;
          if (data.progress) { p.onProgress?.(data.progress); return; }
          analysisPending = null; p.cleanup();
          if (data.error) p.reject(new Error(data.error)); else p.resolve(data.result);
        };
        analysisWorker.onerror = e => { e.preventDefault?.(); stopAnalysisWorker(new Error('Фоновый расчёт прерван: ' + (e.message || 'ошибка запуска'))); };
        analysisWorker.onmessageerror = () => stopAnalysisWorker(new Error('Не удалось получить результат фонового расчёта. Повторите шаг.'));
      }
      const id = ++analysisRequest, signal = analysisAbort?.signal;
      const onAbort = () => stopAnalysisWorker(abortError());
      signal?.addEventListener('abort', onAbort, { once: true });
      analysisPending = { id, resolve, reject, onProgress, cleanup: () => signal?.removeEventListener('abort', onAbort) };
      analysisWorker.postMessage({ id, type, args });
    } catch (e) { if (analysisPending) stopAnalysisWorker(e); else reject(e); }
  });
}
window.addEventListener('pagehide', () => { analysisAbort?.abort(); stopAnalysisWorker(abortError()); });

function refreshStageNav() {
  const done = [S.data, S.ref, S.train, S.probs, S.fin];
  document.querySelectorAll('[data-analysis-stage]').forEach(b => {
    const n = Number(b.dataset.analysisStage), selected = n === analysisStage;
    b.disabled = astraBusy ? !selected : !done[n];
    b.setAttribute('aria-selected', String(selected)); b.tabIndex = selected ? 0 : -1;
    b.classList.toggle('is-complete', !!done[n] && n > 0);
  });
  [1, 2, 3, 4].forEach(n => {
    $('btn' + n).classList.toggle('stage-active', astraBusy && n === analysisStage);
    $('btn' + n).setAttribute('aria-current', n === analysisStage ? 'step' : 'false');
  });
  $('btnCancel').hidden = !astraBusy;
}
function showAnalysisStage(n, scroll = false) {
  analysisStage = n;
  for (let i = 0; i <= 4; i++) $('s' + i).hidden = i !== n;
  $('resultsHeading').hidden = n === 0;
  refreshStageNav();
  if (scroll) {
    const section = $('s' + n); section.scrollIntoView?.({ behavior: 'instant', block: 'start' });
    section.querySelector('h2').focus({ preventScroll: true });
  }
  requestAnimationFrame(() => { for (const c of Object.values(S.charts)) if (c.canvas.closest('#s' + n)) c.resize(); });
}
document.querySelectorAll('[data-analysis-stage]').forEach(b => {
  b.addEventListener('click', () => showAnalysisStage(Number(b.dataset.analysisStage), true));
  b.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const tabs = [...document.querySelectorAll('[data-analysis-stage]')].filter(t => !t.disabled);
    let i = tabs.indexOf(b);
    i = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    e.preventDefault(); tabs[i].click(); tabs[i].focus();
  });
});
$('btnCancel').addEventListener('click', () => analysisAbort?.abort());

function stageStatus(text) {
  $('globalStatus').textContent = text;
  const out = $('stageStatus' + analysisStage); if (out) out.textContent = text;
}
function progressCard(stage) {
  const el = $('stageLive' + stage); el.hidden = false; el.classList.add('is-running');
  $('stageStatus' + stage).textContent = 'Подготовка…';
  $('elapsed' + stage).textContent = '0 с';
}
function progressValue(fraction) {
  if (!Number.isFinite(fraction)) return;
  const value = Math.max(0, Math.min(100, fraction * 100));
  $('runProgress').style.width = value + '%';
  const bar = $('stageBar' + analysisStage);
  if (bar) { bar.value = value; bar.setAttribute('aria-valuetext', Math.round(value) + ' %'); }
}
function referenceProgress(e) {
  if (e.phase === 'scan') { stageStatus('Перебор толщины · d = ' + fmt(e.d, 1) + ' нм'); progressValue(e.fraction * 0.45); }
  else { stageStatus(`Опорный фит · старт ${e.start}/${e.totalStarts} · итерация ${e.iteration} · χ²/ν = ${fmt(e.chi2, 2)}`); progressValue(0.45 + 0.5 * (e.start - 1) / e.totalStarts); }
}
function trainingProgress(e) {
  const labels = { examples: 'Смоделировано и профитировано', holdout: 'Проверка классификатора · эпоха', classifier: 'Обучение классификатора · эпоха', ridge: 'Оценка размеров дефектов · регрессия' };
  const text = e.phase === 'trained' ? 'Обучение завершено.' : `${labels[e.phase]} ${e.done} из ${e.total}`;
  stageStatus(text); $('trainOut').textContent = text;
  progressValue(e.fraction); $('trainBar').style.width = (100 * e.fraction) + '%';
}

function renderInferenceFrame(frame, final = false) {
  const order = frame.probs.map((_, i) => i).sort((a, b) => frame.probs[b] - frame.probs[a]);
  for (let i = 0; i < E.CLASSES.length; i++) {
    const row = $('probLive' + i), rank = order.indexOf(i), visible = rank < 5;
    row.style.transform = `translateY(${Math.min(rank, 5) * 72}px)`;
    row.style.opacity = visible ? '1' : '0'; row.style.visibility = visible ? 'visible' : 'hidden';
    row.setAttribute('aria-hidden', String(!visible));
    row.querySelector('.live-rank').textContent = String(rank + 1).padStart(2, '0');
    row.querySelector('.live-prob-value').textContent = fmt(100 * frame.probs[i], 1) + ' %';
    row.querySelector('.live-prob-bar').style.width = (100 * frame.probs[i]) + '%';
  }
  $('otherProbs').textContent = 'Остальные 7 комбинаций: ' + fmt(100 * order.slice(5).reduce((s, i) => s + frame.probs[i], 0), 1) + ' %';
  const label = final ? 'Все признаки учтены · итоговые вероятности' : frame.phase === 'bias' ? 'Начальные оценки обученной модели' : frame.phase === 'anchors' ? 'Канал: ' + frame.label : `Учитываем ${frame.phase === 'psi' ? 'Ψ' : 'Δ'}-остаток · ${Math.round(frame.scan * 100)} % диапазона`;
  stageStatus(label); progressValue(frame.fraction);
  const scan = $('residualScan');
  scan.setAttribute('x1', 16 + 568 * (frame.scan || 0)); scan.setAttribute('x2', 16 + 568 * (frame.scan || 0));
  scan.style.opacity = final || frame.phase === 'anchors' ? '0' : '1';
  $('inferencePhase').textContent = final ? 'Готово' : frame.phase === 'anchors' ? 'Якорные каналы' : 'Спектральный остаток';
}
function prepareInference() {
  $('inferenceTop').innerHTML = E.CLASSES.map((c, i) => `<div class="live-prob-row" id="probLive${i}"><span class="live-rank"></span><span class="live-prob-name">${classDots(c)}${c.name}</span><b class="live-prob-value">—</b><span class="live-prob-track"><span class="live-prob-bar"></span></span></div>`).join('');
  const r = S.ref.resid, n = S.data.lam.length;
  const amp = Math.max(1, ...Array.from(r, Math.abs));
  const path = offset => {
    const step = Math.max(1, Math.ceil(n / 200)), pts = [];
    for (let i = 0; i < n; i += step) pts.push(`${16 + 568 * i / (n - 1)},${100 - 78 * r[offset + i] / amp}`);
    pts.push(`${584},${100 - 78 * r[offset + n - 1] / amp}`); return pts.join(' ');
  };
  $('inferencePsi').setAttribute('points', path(0)); $('inferenceDelta').setAttribute('points', path(n));
  $('inferenceRange').textContent = `${fmt(S.data.lam[0], 0)}–${fmt(S.data.lam[n - 1], 0)} нм · остаток в единицах σ`;
}
async function animateInference(frames) {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const duration = reduced ? 0 : 2200, started = performance.now();
  let previous = -1;
  do {
    if (analysisAbort?.signal.aborted) throw abortError();
    const i = duration ? Math.min(frames.length - 1, Math.floor((performance.now() - started) / duration * (frames.length - 1))) : frames.length - 1;
    if (i !== previous) { renderInferenceFrame(frames[i], i === frames.length - 1); previous = i; }
    if (i === frames.length - 1) break;
    await new Promise(resolve => setTimeout(resolve, 32));
  } while (true);
  if (!reduced) await new Promise(resolve => setTimeout(resolve, 200));
  if (analysisAbort?.signal.aborted) throw abortError();
}

function finalProgress(e, pass = 0) {
  const names = { absorption: 'Поиск силы поглощения', starts: 'Проверка стартов', refine: 'Точный фит', layers: 'Уточнение профиля', uncertainty: 'Оценка погрешностей' };
  const prefix = pass ? `Повтор после вето ${pass} · ` : '';
  const info = e.phase === 'uncertainty' ? '' : ` · старт ${e.start} · итерация ${e.iteration}`;
  stageStatus(prefix + (names[e.phase] || 'Окончательный фит') + info);
  if (!Number.isFinite(e.chi2)) return;
  $('fitChi').textContent = fmt(e.chi2, 3); $('fitD').textContent = e.P ? fmt(e.P.d, 2) + ' нм' : '—';
  $('fitIteration').textContent = String(e.iteration ?? '—');
  $('fitPhase').textContent = `${e.M || 40} подслоёв · ${e.nfev || 0} вычислений в текущем запуске`;
  fitHistory.push(e.chi2);
  // Bounded rendering cost even for a long multistart fit.
  if (fitHistory.length > 240) fitHistory = fitHistory.filter((_, i) => i % 2 === 0);
  const values = fitHistory.map(v => Math.log10(Math.max(v, 1e-12))), lo = Math.min(...values), hi = Math.max(lo + 0.1, ...values);
  $('fitTrace').setAttribute('points', values.map((v, i) => `${20 + 560 * i / Math.max(1, values.length - 1)},${160 - 140 * (v - lo) / (hi - lo)}`).join(' '));
  $('fitScale').textContent = `χ²/ν: ${fmt(Math.pow(10, lo), 2)}–${fmt(Math.pow(10, hi), 2)} · логарифмическая шкала`;
}
function fitComplete(fin) {
  $('fitChi').textContent = fmt(fin.chi2, 3); $('fitD').textContent = fmt(fin.P.d, 2) + ' нм';
  $('fitPhase').textContent = `Фит завершён · ${fin.M} подслоёв · ${fin.starts} стартов`;
}

function formatResultTables() {
  document.querySelectorAll('#finOut table, #truthOut table, #causeOut table').forEach(table => {
    table.classList.add('analysis-table');
    if (table.closest('#causeOut')) table.classList.add('budget-table');
    const labels = [...table.querySelectorAll('thead th')].map(t => t.textContent);
    table.querySelectorAll('thead th').forEach(th => th.scope = 'col');
    table.querySelectorAll('tbody tr').forEach(tr => [...tr.children].forEach((td, i) => td.dataset.label = labels[i]));
  });
}
