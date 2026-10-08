// Completed stages stay in a continuous feed; computation runs in a reusable Worker.
let analysisWorker = null, analysisRequest = 0, analysisPending = null, analysisAbort = null;
let analysisStage = 0, fitHistory = [], analysisStarted = 0, analysisTimer = null;
let fitPass = 0, fitOffset = 0, fitEvaluations = 0, fitRange = { min: Infinity, max: 0 };
const stageNames = ['Спектр', 'Опорный фит', 'Обучение ИИ', 'Диагноз', 'Окончательный фит'];
const abortError = () => new DOMException('Расчёт остановлен.', 'AbortError');
const yieldPaint = () => new Promise(resolve => setTimeout(resolve, 24));
const analysisResultHold = 2400;
let analysisScroll = null, analysisScrollFrame = 0;
function analysisPause(ms) {
  const signal = analysisAbort?.signal;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    const finish = () => { signal?.removeEventListener('abort', cancel); resolve(); };
    const timer = setTimeout(finish, ms);
    const cancel = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); reject(abortError()); };
    signal?.addEventListener('abort', cancel, { once: true });
  });
}
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

function analysisNavigationOffset() {
  const nav = document.querySelector('.analysis-navigation');
  const header = document.querySelector('.appbar');
  const headerHeight = getComputedStyle(header).position === 'sticky' ? header.getBoundingClientRect().height : 0;
  nav.style.top = headerHeight + 'px';
  const top = headerHeight + nav.getBoundingClientRect().height + 10;
  document.querySelector('.steps').style.setProperty('--analysis-offset', top + 'px');
  return top;
}
function stopAnalysisScroll() { analysisScroll?.(); }
function revealAnalysisProgress(n = analysisStage, smooth = false) {
  const section = $('s' + n), card = $('stageLive' + n);
  if (section.hidden) return Promise.resolve();
  stopAnalysisScroll();
  const top = analysisNavigationOffset(), sectionTop = section.getBoundingClientRect().top;
  // Keep the heading in view when the entire live panel fits below it.
  const target = card && !card.hidden && card.getBoundingClientRect().bottom - sectionTop > innerHeight - top - 12 ? card : section;
  const destination = Math.max(0, window.scrollY + target.getBoundingClientRect().top - top);
  if (!smooth || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    window.scrollTo({ top: destination, behavior: 'instant' }); return Promise.resolve();
  }
  return new Promise(resolve => {
    const start = window.scrollY, time = performance.now(), signal = analysisAbort?.signal;
    const finish = () => { cancelAnimationFrame(analysisScrollFrame); analysisScroll = null; signal?.removeEventListener('abort', finish); resolve(); };
    analysisScroll = finish; signal?.addEventListener('abort', finish, { once: true });
    const tick = now => {
      const t = Math.min(1, (now - time) / 520), ease = t * t * (3 - 2 * t);
      window.scrollTo({ top: start + (destination - start) * ease, behavior: 'instant' });
      if (t < 1) analysisScrollFrame = requestAnimationFrame(tick); else finish();
    };
    analysisScrollFrame = requestAnimationFrame(tick);
  });
}
window.addEventListener('wheel', stopAnalysisScroll, { passive: true });
window.addEventListener('touchstart', stopAnalysisScroll, { passive: true });
let analysisResizeFrame = 0;
function resizeAnalysisView() {
  cancelAnimationFrame(analysisResizeFrame);
  analysisResizeFrame = requestAnimationFrame(() => {
    analysisNavigationOffset();
    if (astraBusy) revealAnalysisProgress();
  });
}
window.addEventListener('resize', resizeAnalysisView);
window.visualViewport?.addEventListener('resize', resizeAnalysisView);

function refreshStageNav() {
  const done = [S.data, S.ref, S.train, S.probs, S.fin];
  document.querySelectorAll('[data-analysis-stage]').forEach(b => {
    const n = Number(b.dataset.analysisStage), selected = n === analysisStage;
    b.disabled = !selected && !done[n];
    b.setAttribute('aria-current', selected ? 'step' : 'false');
    b.tabIndex = b.disabled ? -1 : 0;
    b.classList.toggle('is-complete', !!done[n] && n > 0);
  });
  [1, 2, 3, 4].forEach(n => {
    $('btn' + n).classList.toggle('stage-active', astraBusy && n === analysisStage);
    $('btn' + n).setAttribute('aria-current', n === analysisStage ? 'step' : 'false');
  });
  $('btnCancel').hidden = !astraBusy;
  $('analysisPosition').textContent = analysisStage ? `Шаг ${analysisStage} из 4` : 'Начало';
}
function showAnalysisStage(n, scroll = false) {
  analysisStage = n;
  $('s' + n).hidden = false;
  if (n) $('resultsHeading').hidden = false;
  refreshStageNav();
  if (scroll) {
    $('s' + n).querySelector('h2').focus({ preventScroll: true });
    revealAnalysisProgress(n, true);
  }
  requestAnimationFrame(() => { for (const c of Object.values(S.charts)) if (c.canvas.closest('#s' + n)) c.resize(); });
}
document.querySelectorAll('[data-analysis-stage]').forEach(b => {
  b.addEventListener('click', () => {
    const n = Number(b.dataset.analysisStage);
    if (astraBusy) revealAnalysisProgress(n, true); else showAnalysisStage(n, true);
  });
  b.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const tabs = [...document.querySelectorAll('[data-analysis-stage]')].filter(t => !t.disabled).sort((a, b) => Number(a.dataset.analysisStage) - Number(b.dataset.analysisStage));
    let i = tabs.indexOf(b);
    i = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    e.preventDefault(); tabs[i].click(); tabs[i].focus();
  });
});
$('btnCancel').addEventListener('click', () => analysisAbort?.abort());
// When reviewing the finished feed, the legend follows the section on screen.
let analysisSpyFrame = 0;
window.addEventListener('scroll', () => {
  if (analysisSpyFrame || astraBusy || analysisScroll || currentPage !== 'analysis') return;
  analysisSpyFrame = requestAnimationFrame(() => {
    analysisSpyFrame = 0;
    if (astraBusy || analysisScroll || currentPage !== 'analysis') return;
    const top = analysisNavigationOffset() + 40;
    const visible = [...document.querySelectorAll('#page-analysis main>.step')].filter(s => !s.hidden);
    const section = visible.filter(s => s.getBoundingClientRect().top <= top).at(-1);
    if (section && Number(section.id.slice(1)) !== analysisStage) { analysisStage = Number(section.id.slice(1)); refreshStageNav(); }
  });
}, { passive: true });

function stageStatus(text) {
  $('globalStatus').textContent = text;
  const out = $('stageStatus' + analysisStage); if (out) out.textContent = text;
}
function progressCard(stage) {
  const el = $('stageLive' + stage); el.hidden = false; el.classList.add('is-running');
  $('stageStatus' + stage).textContent = 'Подготовка…';
  $('elapsed' + stage).textContent = '0 с';
  if (stage === 2) resetTrainingProgress();
  if (stage === 3) { prepareInference(); $('otherProbs').textContent = ''; }
  if (stage === 4) resetFitProgress();
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
function trainingRow(name, done, total, text) {
  const bar = $('train' + name + 'Bar'), row = bar.closest('.training-phase');
  bar.max = total; bar.value = done; bar.setAttribute('aria-valuetext', text);
  $('train' + name + 'Count').textContent = text;
  row.classList.toggle('is-complete', done === total);
  row.classList.toggle('is-active', done < total);
}
function resetTrainingProgress() {
  for (const name of ['Spectra', 'Anchors', 'Model']) {
    trainingRow(name, 0, 1, 'Ожидает');
    $('train' + name + 'Bar').closest('.training-phase').classList.remove('is-active');
  }
}
function trainingProgress(e) {
  const labels = { spectra: 'Моделируем и фитируем спектры', anchors: 'Обрабатываем остатки по якорям', holdout: 'Обучаем контрольный классификатор', classifier: 'Обучаем итоговый классификатор', ridge: 'Обучаем оценки размеров дефектов' };
  if (e.phase === 'spectra' || e.phase === 'anchors') trainingRow(e.phase === 'spectra' ? 'Spectra' : 'Anchors', e.done, e.total, `${e.done} / ${e.total}${e.done === e.total ? ' · готово' : ''}`);
  else if (e.phase === 'trained') trainingRow('Model', 506, 506, 'Готово · 500 эпох + 6 регрессий');
  else {
    const offset = { holdout: 0, classifier: 250, ridge: 500 }[e.phase];
    trainingRow('Model', offset + e.done, 506, e.phase === 'ridge' ? `Регрессии: ${e.done} / ${e.total} (контрольные и итоговые)` : `${e.phase === 'holdout' ? 'Контроль' : 'Итоговая модель'}: ${e.done} / ${e.total} эпох`);
  }
  stageStatus(e.phase === 'trained' ? 'Обучение завершено.' : labels[e.phase]);
  progressValue(e.fraction);
}

function renderInferenceFrame(frame, final = false) {
  const order = frame.probs.map((_, i) => i).sort((a, b) => frame.probs[b] - frame.probs[a]);
  for (let i = 0; i < E.CLASSES.length; i++) {
    const row = $('probLive' + i), rank = order.indexOf(i), visible = rank < 5;
    row.style.setProperty('--prob-rank', Math.min(rank, 5));
    row.style.opacity = visible ? '1' : '0'; row.style.visibility = visible ? 'visible' : 'hidden';
    row.setAttribute('aria-hidden', String(!visible));
    row.querySelector('.live-rank').textContent = String(rank + 1).padStart(2, '0');
    row.querySelector('.live-prob-value').textContent = fmt(100 * frame.probs[i], 1) + ' %';
    row.querySelector('.live-prob-bar').style.width = (100 * frame.probs[i]) + '%';
  }
  $('otherProbs').textContent = 'Остальные 7 комбинаций: ' + fmt(100 * order.slice(5).reduce((s, i) => s + frame.probs[i], 0), 1) + ' %';
  stageStatus(final ? 'Итоговые вероятности' : 'Определяем вероятности · ' + Math.round(100 * frame.fraction) + '\u00a0%');
  progressValue(frame.fraction);
}
function prepareInference() {
  $('inferenceTop').innerHTML = E.CLASSES.map((c, i) => {
    const parts = [c.g ? 'градиент n' + (c.g > 0 ? '↑' : '↓') : '', c.r ? 'шероховатость' : '', c.a ? 'поглощение' : ''].filter(Boolean);
    const name = parts.length ? parts.join(', ') : 'однородная плёнка';
    return `<div class="live-prob-row" id="probLive${i}" aria-hidden="true"><span class="live-rank"></span><div class="live-prob-copy"><b class="live-prob-value">—</b><span class="live-prob-name" title="${c.name}">${name}</span></div><span class="live-prob-track"><span class="live-prob-bar"></span></span></div>`;
  }).join('');
}
async function animateInference(frames) {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  // Sample actual forward-pass frames at a readable pace, without invented values.
  const count = reduced ? 1 : Math.min(8, frames.length);
  for (let k = 0; k < count; k++) {
    if (analysisAbort?.signal.aborted) throw abortError();
    const i = count === 1 ? frames.length - 1 : Math.round(k * (frames.length - 1) / (count - 1));
    renderInferenceFrame(frames[i], k === count - 1);
    if (k < count - 1) await analysisPause(600);
  }
}

function fitMetric(value, digits) {
  if (!Number.isFinite(value)) return '—';
  const text = fmt(value, digits);
  return text.length > 8 || (value !== 0 && Math.abs(value) < Math.pow(10, -digits)) ? Number(value).toExponential(2).replace('e+', 'e') : text;
}
function resetFitProgress() {
  fitHistory = []; fitPass = 0; fitOffset = 0; fitEvaluations = 0; fitRange = { min: Infinity, max: 0 };
  $('fitTrace').setAttribute('d', ''); $('fitCurrent').setAttribute('visibility', 'hidden');
  ['fitChi', 'fitD', 'fitEvaluations', 'fitYMin', 'fitYMax', 'fitXMax'].forEach(id => $(id).textContent = '—');
  $('fitPhase').textContent = 'Ожидаем первые расчёты…';
}
function drawFitTrace() {
  const positiveMin = Math.min(...fitHistory.filter(p => p.chi2 > 0).map(p => p.chi2));
  const floor = Number.isFinite(positiveMin) ? Math.max(Number.MIN_VALUE, positiveMin / 10) : 1e-12;
  let lo = Math.log10(fitRange.min || floor), hi = Math.log10(fitRange.max || floor);
  if (hi === lo) { lo -= 0.5; hi += 0.5; }
  const xy = p => [600 * p.nfev / Math.max(1, fitEvaluations), 120 - 120 * (Math.log10(p.chi2 || floor) - lo) / (hi - lo)];
  $('fitTrace').setAttribute('d', fitHistory.map((p, i) => `${i && p.key === fitHistory[i - 1].key ? 'L' : 'M'}${xy(p).join(',')}`).join(' '));
  const [x, y] = xy(fitHistory.at(-1));
  $('fitCurrent').setAttribute('cx', x); $('fitCurrent').setAttribute('cy', y); $('fitCurrent').setAttribute('visibility', 'visible');
  $('fitYMin').textContent = (fitRange.min === 0 ? '≤ ' : '') + fitMetric(Math.pow(10, lo), 2);
  $('fitYMax').textContent = fitMetric(Math.pow(10, hi), 2);
  $('fitXMax').textContent = String(fitEvaluations);
}
function finalProgress(e, pass = 0) {
  const names = { absorption: 'Поиск силы поглощения', starts: 'Проверка стартов', refine: 'Точный фит', layers: 'Уточнение профиля', uncertainty: 'Оценка погрешностей' };
  const prefix = pass ? `Вето ${pass} · ` : '';
  const info = ['starts', 'absorption'].includes(e.phase) ? ` · старт ${e.start}` : '';
  stageStatus(prefix + (names[e.phase] || 'Окончательный фит') + info);
  if (!Number.isFinite(e.chi2)) return;
  $('fitChi').textContent = fitMetric(e.chi2, 3); $('fitD').textContent = e.P ? fitMetric(e.P.d, 2) : '—';
  if (pass !== fitPass) { fitOffset = fitEvaluations; fitPass = pass; }
  fitEvaluations = fitOffset + e.nfev;
  $('fitEvaluations').textContent = String(fitEvaluations);
  const profile = e.profileLayers === 1 ? 'Однородный профиль' : `Градиент: ${e.profileLayers} подслоёв`;
  $('fitPhase').textContent = `${profile} · итерация ${e.iteration} текущего запуска`;
  fitRange.min = Math.min(fitRange.min, e.chi2); fitRange.max = Math.max(fitRange.max, e.chi2);
  fitHistory.push({ chi2: e.chi2, nfev: fitEvaluations, key: `${pass}:${e.run}` });
  // Bounded rendering cost even for a long multistart fit.
  if (fitHistory.length > 240) {
    const minIndex = fitHistory.findIndex(p => p.chi2 === fitRange.min), maxIndex = fitHistory.findIndex(p => p.chi2 === fitRange.max);
    fitHistory = fitHistory.filter((p, i, a) => i % 2 === 0 || i === a.length - 1 || p.key !== a[i - 1]?.key || p.key !== a[i + 1]?.key || i === minIndex || i === maxIndex);
  }
  drawFitTrace();
}
function fitComplete(fin) {
  // Include the exact returned solution even if intermediate events were throttled.
  finalProgress({ ...fin, phase: 'complete', run: fin.runs, iteration: fin.iterations }, fitPass);
  $('fitPhase').textContent = `Итог: ${fin.profileLayers === 1 ? 'однородный профиль' : fin.profileLayers + ' подслоёв градиента'} · ν = ${fin.dof}`;
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
