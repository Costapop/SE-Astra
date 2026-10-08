/* Shared, DOM-free analysis jobs. Embedded in the offline HTML and its Blob Worker. */
(function (root) {
  'use strict';
  const E = typeof module !== 'undefined' && module.exports ? require('./ellip_core.js') : root.EllipCore;
  const packSoftmax = m => ({ W: m.W, b: m.b, mu: m.st.mu, sd: m.st.sd });
  const packRidge = m => ({ w: m.w, ym: m.ym, mu: m.st.mu, sd: m.st.sd });
  const softmax = scores => {
    const mx = Math.max(...scores), exp = Array.from(scores, v => Math.exp(v - mx)), sum = exp.reduce((a, b) => a + b, 0);
    return exp.map(v => v / sum);
  };
  const ridgePredict = (m, x) => { let s = m.ym; for (let j = 0; j < x.length; j++) s += m.w[j] * ((x[j] - m.mu[j]) / m.sd[j]); return s; };

  function train(a, emit) {
    const { data, cfg, prior, nuis, N, seed } = a, K = E.CLASSES.length, rng = E.makeRng(seed);
    const X = [], y = [], sz = [], pending = [], t0 = Date.now();
    emit({ phase: 'spectra', done: 0, total: N, fraction: 0 });
    for (let i = 0; i < N; i++) {
      const s = E.trainingSpectrum(data, cfg, prior, nuis, rng, i % K);
      // Only Δ and residuals are needed for anchor features; release Ψ here.
      pending.push({ dd: { lam: data.lam, del: s.dd.del }, resid: s.resid });
      y.push(s.y); sz.push([s.delta, s.dRough, s.k400]);
      emit({ phase: 'spectra', done: i + 1, total: N, fraction: 0.65 * (i + 1) / N });
    }
    emit({ phase: 'anchors', done: 0, total: N, fraction: 0.65 });
    for (let i = 0; i < N; i++) {
      X.push(E.featureVector(pending[i].dd, cfg, pending[i].resid));
      pending[i] = null;
      emit({ phase: 'anchors', done: i + 1, total: N, fraction: 0.65 + 0.05 * (i + 1) / N });
    }
    const idx = X.map((_, k) => k);
    for (let k = idx.length - 1; k > 0; k--) { const j = rng.int(k + 1); [idx[k], idx[j]] = [idx[j], idx[k]]; }
    const nte = Math.max(30, Math.floor(N / 4)), te = idx.slice(0, nte), tr = idx.slice(nte);
    const mHold = E.trainSoftmax(tr.map(k => X[k]), tr.map(k => y[k]), K, { epochs: 250, onProgress: (done, total) => emit({ phase: 'holdout', done, total, fraction: 0.7 + 0.1 * done / total }) });
    let acc = 0, accBig = 0, nBig = 0;
    for (const k of te) {
      const p = mHold.predictProba(X[k]), kk = p.indexOf(Math.max(...p));
      const big = (sz[k][0] === 0 || Math.abs(sz[k][0]) >= 0.004) && (sz[k][1] === 0 || sz[k][1] >= 0.4) && (sz[k][2] === 0 || sz[k][2] >= 2e-4);
      if (kk === y[k]) { acc++; if (big) accBig++; } if (big) nBig++;
    }
    const model = E.trainSoftmax(X, y, K, { epochs: 250, onProgress: (done, total) => emit({ phase: 'classifier', done, total, fraction: 0.8 + 0.1 * done / total }) });
    emit({ phase: 'ridge', done: 0, total: 3, fraction: 0.9 });
    const rd = E.ridge(X, sz.map(v => 100 * v[0]), 30);
    emit({ phase: 'ridge', done: 1, total: 3, fraction: 0.93 });
    const rr = E.ridge(X, sz.map(v => v[1]), 30);
    emit({ phase: 'ridge', done: 2, total: 3, fraction: 0.96 });
    const rk = E.ridge(X, sz.map(v => 1000 * v[2]), 30);
    emit({ phase: 'ridge', done: 3, total: 3, fraction: 0.99 });
    let e1 = 0, e2 = 0, e3 = 0;
    for (const k of te) { e1 += (rd.predict(X[k]) - 100 * sz[k][0]) ** 2; e2 += (rr.predict(X[k]) - sz[k][1]) ** 2; e3 += (rk.predict(X[k]) - 1000 * sz[k][2]) ** 2; }
    emit({ phase: 'trained', fraction: 1 });
    return { model: packSoftmax(model), rd: packRidge(rd), rr: packRidge(rr), rk: packRidge(rk), N, acc: 100 * acc / nte, accBig: nBig ? 100 * accBig / nBig : NaN, rmseD: Math.sqrt(e1 / nte), rmseR: Math.sqrt(e2 / nte), rmseK: Math.sqrt(e3 / nte) / 1000, sec: (Date.now() - t0) / 1000 };
  }

  // A deterministic explanation of one forward pass, not repeated inference or
  // calibrated probabilities for incomplete spectra. Omitted features have z = 0.
  // Accumulation order is identical to trainSoftmax.predictProba, including anchors.
  function diagnose({ train: t, x }) {
    const m = t.model, scores = Array.from(m.b), n = (x.length - E.N_CHANNELS) / 2;
    const frames = [{ phase: 'bias', fraction: 0, probs: softmax(scores) }];
    const channels = ['Ψ в HW-якорях', 'Разброс Ψ в HW', '|Δ| в HW-якорях', '|Δ| в QW-якорях', 'RMS Ψ', 'RMS Δ', 'Синий–красный тренд Ψ в HW', 'Синий–красный тренд Ψ в QW'];
    const add = j => { const z = (x[j] - m.mu[j]) / m.sd[j]; for (let k = 0; k < scores.length; k++) scores[k] += m.W[k][j] * z; };
    for (let channel = 0; channel < 2; channel++) {
      for (let block = 0; block < 12; block++) {
        const end = Math.floor((block + 1) * n / 12);
        for (let i = Math.floor(block * n / 12); i < end; i++) add(channel * n + i);
        frames.push({ phase: channel ? 'delta' : 'psi', scan: end / n, fraction: (channel * n + end) / x.length, probs: softmax(scores) });
      }
    }
    channels.forEach((label, j) => { add(2 * n + j); frames.push({ phase: 'anchors', label, fraction: (2 * n + j + 1) / x.length, probs: softmax(scores) }); });
    return { frames, probs: frames[frames.length - 1].probs, est: { delta: ridgePredict(t.rd, x) / 100, dRough: ridgePredict(t.rr, x), k400: Math.max(0, ridgePredict(t.rk, x) / 1000) } };
  }

  function curves(data, cfg, P) {
    const mat = Object.assign({}, cfg.mat, { A: P.A, Auv: P.Auv, Eg: P.Eg, Ak: P.Ak || 0 });
    return E.modelPsiDelta(data.lam, cfg.Nsub, cfg.phi, P.d, mat, P.delta || 0, P.dRough || 0, E.subLayersFor(P.delta || 0), cfg.back, cfg.band || null);
  }

  function causes(S, emit) {
    const Tt = S.example.truth, tk = Tt.k400 || 0, fin = S.fin, flags = S.finFlags, lam = S.data.lam;
    const nAt = (m, l) => E.filmNK([l], m).n[0], fmt = (v, n) => Number(v).toFixed(n);
    const mFin = Object.assign({}, S.cfg.mat, { A: fin.P.A, Auv: fin.P.Auv, Eg: fin.P.Eg, Ak: fin.P.Ak || 0 });
    const trueFlags = { grad: Tt.delta !== 0, rough: Tt.dRough > 0, abs: tk > 0 };
    const classOK = flags.grad === trueFlags.grad && flags.rough === trueFlags.rough && flags.abs === trueFlags.abs && (!flags.grad || Math.sign(fin.P.delta) === Math.sign(Tt.delta));
    const p0 = Object.assign({}, S.ref.P, { d: Tt.d, dRough: Tt.dRough || 0.5, delta: Tt.delta || 0, Ak: Tt.mat.Ak || 0 });
    const mk = (opt) => { const sy = E.synthesize(lam, S.cfg.subKey, Tt.phiTrue, Tt.d, Tt.mat, Tt.delta, Tt.dRough, Object.assign({ continuous: !!Tt.continuous, back: Tt.back || null }, opt), E.makeRng(1)); return { lam, psi: Array.from(sy.psi), del: Array.from(sy.del), sigPsi: S.data.sigPsi, sigDel: S.data.sigDel }; };
    const cfg0 = S.cfg, cfgA = Object.assign({}, S.cfg, { phi: Tt.phiTrue, subDel: null });
    const bwModel = S.cfg.band ? S.cfg.band.bw : 0;                          // полоса в модели фита; строка бюджета «полоса как в модели» убирает её ошибку
    const backDiff = !!(Tt.back && S.cfg.back && Math.abs(Tt.back.f - S.cfg.back.f) > 1e-9) || (!!Tt.back !== !!S.cfg.back);
    const cfgAB = backDiff ? Object.assign({}, cfgA, { back: Tt.back || null, subDel: null }) : cfgA;
    const cfgAD = Object.assign({}, cfgAB, { mat: Object.assign({}, S.cfg.mat, { E0: Tt.mat.E0, C: Tt.mat.C, Euv: Tt.mat.Euv }) });
    const fitRow = (label, data, cfg) => { emit({ phase: 'causes', row: label }); const r = E.finalFit(data, cfg, S.prior, trueFlags, p0, null, e => emit({ ...e, phase: 'causes', row: label })); const m = Object.assign({}, cfg.mat, { A: r.P.A, Auv: r.P.Auv, Eg: r.P.Eg, Ak: r.P.Ak || 0 }); return { label, d: r.P.d, delta: trueFlags.grad ? r.P.delta : 0, rough: trueFlags.rough ? r.P.dRough : 0, k: trueFlags.abs ? r.P.k400 : 0, n: nAt(m, 550), chi2: r.chi2 }; };
    const rows = [{ label: 'измеренный спектр, модель по выбору ИИ (как есть)', d: fin.P.d, delta: flags.grad ? fin.P.delta : 0, rough: flags.rough ? fin.P.dRough : 0, k: flags.abs ? fin.P.k400 : 0, n: nAt(mFin, 550), chi2: fin.chi2 }];
    if (!classOK) rows.push(fitRow('измеренный спектр, верный набор дефектов', S.data, cfg0));
    const hasDrift = !!Tt.driftPsi;
    if (hasDrift) rows.push(fitRow('без шума (дрейф, полоса, сдвиг λ, угол — остаются)', mk({ bw: Tt.bw, lamOffset: Tt.lamOffset, driftPsi: Tt.driftPsi, driftDel: Tt.driftDel }), cfg0));
    rows.push(fitRow(hasDrift ? '+ без дрейфа' : 'без шума и дрейфа (полоса, сдвиг λ, угол — остаются)', mk({ bw: Tt.bw, lamOffset: Tt.lamOffset }), cfg0));
    rows.push(fitRow('+ без сдвига шкалы λ', mk({ bw: Tt.bw, lamOffset: 0 }), cfg0));
    rows.push(fitRow(bwModel > 0 ? `+ полоса в истине равна заданной в модели (${fmt(bwModel, 1)} нм)` : '+ без спектральной полосы', mk({ bw: bwModel, lamOffset: 0 }), cfg0));
    rows.push(fitRow('+ угол известен точно', mk({ bw: bwModel, lamOffset: 0 }), cfgA));
    if (backDiff) rows.push(fitRow('+ доля задней стороны как у образца', mk({ bw: bwModel, lamOffset: 0 }), cfgAB));
    rows.push(fitRow('+ E₀, C, E_uv как у образца (остаётся только численная точность)', mk({ bw: bwModel, lamOffset: 0 }), cfgAD));
    const truthRow = { label: 'истина', d: Tt.d, delta: Tt.delta, rough: Tt.dRough, k: tk, n: nAt(Tt.mat, 550), chi2: NaN };
    // вклад каждого фактора = изменение параметров при его устранении
    const contrib = []; for (let i = 1; i < rows.length; i++) contrib.push({ label: rows[i].label, dd: rows[i - 1].d - rows[i].d, dDelta: rows[i - 1].delta - rows[i].delta, dRough: rows[i - 1].rough - rows[i].rough, dk: rows[i - 1].k - rows[i].k, dn: rows[i - 1].n - rows[i].n });
    const last = rows[rows.length - 1]; const unexpl = { dd: last.d - Tt.d, dDelta: last.delta - Tt.delta, dRough: last.rough - Tt.dRough, dk: last.k - tk, dn: last.n - nAt(Tt.mat, 550) };
    return { rows, truthRow, contrib, unexpl, bwModel };
  }

  function run(type, a, emit = () => {}) {
    if (type === 'reference') {
      const ref = E.referenceFit(a.data, a.cfg, a.prior, emit);
      const feature = E.featureVector(a.data, a.cfg, ref.resid);
      return { ref, feature, subDel: a.cfg.subDel, curves: curves(a.data, a.cfg, ref.P) };
    }
    if (type === 'train') return train(a, emit);
    if (type === 'diagnose') return diagnose(a);
    if (type === 'final') {
      const fin = E.finalFit(a.data, a.cfg, a.prior, a.flags, a.p0, a.nuis, emit);
      return { fin, curves: curves(a.data, a.cfg, fin.P) };
    }
    if (type === 'causes') return causes(a, emit);
    throw new Error('Неизвестный этап анализа: ' + type);
  }
  const api = { run, diagnose };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EllipAnalysis = api;
  if (typeof WorkerGlobalScope !== 'undefined' && root instanceof WorkerGlobalScope) {
    root.onmessage = ({ data: { id, type, args } }) => {
      let last = 0, phase = '';
      const emit = p => {
        const key = p.phase + ':' + (p.start || '') + ':' + (p.row || '');
        const now = Date.now();
        if (key === phase && now - last < 75 && p.fraction !== 1 && (p.total === undefined || p.done !== p.total) && !p.completed) return;
        last = now; phase = key; root.postMessage({ id, progress: p });
      };
      try { root.postMessage({ id, result: run(type, args, emit) }); }
      catch (error) { root.postMessage({ id, error: error.message || String(error) }); }
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
