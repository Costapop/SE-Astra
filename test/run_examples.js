const E = require("../src/ellip_core.js"); const fs = require("fs");
const ex = JSON.parse(fs.readFileSync(require("path").join(__dirname, "../examples/examples.json")));
const NTR = +(process.argv[2] || 500), only = process.argv[3] ? process.argv[3].split(",") : null;
const K = E.CLASSES.length; let wrong = 0;
const fk = (k) => (1000 * k).toFixed(2) + "·10⁻³";
for (const e of ex) {
  if (only && !only.includes(e.id)) continue;
  const lam = e.lam, data = { lam, psi: e.psi, del: e.del, sigPsi: e.sigPsi, sigDel: e.sigDel };
  const back = e.back ? { f: e.back.f, ds: e.back.ds } : null;                       // заданная доля задней стороны (не фитируется)
  const BAND_REF = process.env.BAND_REF === "1";                                       // полоса и в опорном фите/обучении (эксперимент)
  const cfgFin = { mat: E.MATERIALS[e.mat], subKey: e.sub, Nsub: E.substrateN(e.sub, lam), phi: e.phi, back, band: e.bw > 0 ? { bw: e.bw, subKey: e.sub } : null };   // паспортная полоса — в модели окончательного фита
  const cfg = BAND_REF ? cfgFin : Object.assign({}, cfgFin, { band: null });          // опорный фит и обучение — без полосы (отпечаток остатка)
  const nuis = { deltaMax: 0.05, roughMax: 3, kMax: 5e-3, bw: e.bw, phiErr: 0.03, backFerr: e.back ? e.back.ferr : 0, bwErr: 0.3, offErr: 0.1 };
  const prior = { dMin: e.dNom * (1 - e.dRange / 100), dMax: e.dNom * (1 + e.dRange / 100) };
  let t = Date.now();
  const rf = E.referenceFit(data, cfg, prior);
  const tRef = Date.now() - t;
  const subDel = E.modelPsiDelta(lam, cfg.Nsub, cfg.phi, 0, cfg.mat, 0, 0, 1, back).del;
  const { HW, QW } = E.anchors(lam, data.del, subDel); const ch = E.channels(lam, rf.resid, HW, QW);
  const rng = E.makeRng(77); const X = [], y = [], sz = [];
  t = Date.now();
  for (let i = 0; i < NTR; i++) { const s = E.trainingExample(data, cfg, prior, nuis, rng, i % K); X.push(s.x); y.push(s.y); sz.push([s.delta, s.dRough, s.k400]); }
  const tGen = Date.now() - t;
  const idx = X.map((_, i) => i); for (let i = idx.length - 1; i > 0; i--) { const j = rng.int(i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  const nte = Math.floor(NTR / 4), te = idx.slice(0, nte), tr = idx.slice(nte);
  const model = E.trainSoftmax(tr.map(i => X[i]), tr.map(i => y[i]), K, { epochs: 250 });
  let acc = 0; for (const i of te) { const p = model.predictProba(X[i]); if (p.indexOf(Math.max(...p)) === y[i]) acc++; }
  const full = E.trainSoftmax(X, y, K, { epochs: 250 });
  const rd = E.ridge(X, sz.map(v => 100 * v[0]), 30), rr = E.ridge(X, sz.map(v => v[1]), 30), rk = E.ridge(X, sz.map(v => 1000 * v[2]), 30);
  const xr = E.featureVector(data, cfg, rf.resid); const probs = full.predictProba(xr); const k = probs.indexOf(Math.max(...probs)); const cls = E.CLASSES[k];
  const choice = E.chooseFlags(probs);                                                 // при неуверенном ИИ — объединение двух лучших классов, решает вето
  const kEst = Math.max(0, rk.predict(xr) / 1000);
  const dEst = rd.predict(xr) / 100;
  const p0 = Object.assign({}, rf.P, { dRough: Math.max(0.1, rr.predict(xr)), delta: choice.sign ? choice.sign * Math.max(0.002, Math.abs(dEst)) : dEst, Ak: kEst > 0 ? E.tailAk(cfg.mat, kEst) : 0, starts: rf.starts, startCosts: rf.startCosts });
  t = Date.now();
  let flags = Object.assign({}, choice.flags), veto = "";
  const note = choice.merged ? ` [ИИ не уверен: ${(100 * choice.pBest).toFixed(0)} % против ${(100 * choice.pSecond).toFixed(0)} % — в фит взято объединение дефектов двух лучших классов, решает вето]` : "";
  let ff = E.finalFit(data, cfgFin, prior, flags, p0, nuis);
  for (let pass = 0; pass < 2; pass++) {
    let changed = false;
    // вето: |p| < √((3σ)² + сист.²) — с учётом систематики заявленных неопределённостей условий
    if (flags.rough && ff.P.dRough < Math.max(0.03, E.vetoThreshold(ff, "dRough"))) { flags.rough = false; changed = true; veto += " EMA незначим →"; }
    if (flags.grad && Math.abs(ff.P.delta) < Math.max(3e-4, E.vetoThreshold(ff, "delta"))) { flags.grad = false; changed = true; veto += " δ незначим →"; }
    if (flags.abs && ff.P.Ak < Math.max(3e-4, E.vetoThreshold(ff, "Ak"))) { flags.abs = false; changed = true; veto += " поглощение незначимо →"; }
    if (!changed) break;
    ff = E.finalFit(data, cfgFin, prior, flags, p0, nuis);
  }
  const tFin = Date.now() - t;
  const T = e.truth, tk = T.k400 || 0;
  const trueCls = E.classIndex(Math.sign(T.delta), T.dRough > 0 ? 1 : 0, tk > 0 ? 1 : 0);
  const finCls = E.classIndex(flags.grad ? Math.sign(ff.P.delta) : 0, flags.rough ? 1 : 0, flags.abs ? 1 : 0);
  if (finCls !== trueCls) wrong++;
  const top = probs.map((p, i) => [p, i]).sort((a, b) => b[0] - a[0]).slice(0, 4);
  console.log(`\n${e.title}${back ? ` [задняя сторона: задано ${back.f}, истина ${T.back.f}]` : ""}: опорный фит ${tRef} мс, χ²/ν = ${rf.chi2.toFixed(1)}, d = ${rf.P.d.toFixed(1)}; каналы Ψ_HW ${ch.psiHW.toFixed(1)}σ, |Δ|_HW ${ch.delHW.toFixed(1)}σ, |Δ|_QW ${ch.delQW.toFixed(1)}σ, перепад Ψ синие−красные якоря HW ${ch.psiHWtrend.toFixed(1)}σ / QW ${ch.psiQWtrend.toFixed(1)}σ (якорей ${ch.nHW})`);
  console.log(`   обучение: ${NTR} примеров (${K} классов) за ${(tGen / 1000).toFixed(0)} с, точность на отложенных ${(100 * acc / nte).toFixed(1)} %`);
  console.log(`   вероятности (4 лучших): ${top.map(([p, i]) => E.CLASSES[i].name + " " + (100 * p).toFixed(1) + "%").join("; ")}`);
  console.log(`   выбрано ИИ: «${cls.name}» ${k === trueCls ? "✓ верно" : "✗ (истина: " + E.CLASSES[trueCls].name + ")"}; ridge: δ ${rd.predict(xr).toFixed(2)} %, EMA ${rr.predict(xr).toFixed(2)} нм, k₄₀₀ ${fk(kEst)}`);
  const sy = (k) => (ff.sys && ff.sys.total && isFinite(ff.sys.total[k])) ? ff.sys.total[k] : 0;
  console.log(`   финальный фит ${tFin} мс${note}${veto ? " (вето:" + veto + " упрощено)" : ""}, подслоёв ${ff.M}: «${E.CLASSES[finCls].name}» ${finCls === trueCls ? "✓" : "✗"}; χ²/ν = ${ff.chi2.toFixed(2)}; d = ${ff.P.d.toFixed(2)} ± ${(ff.E.d || 0).toFixed(2)} (сист. ${sy("d").toFixed(2)}; истина ${T.d}); δ = ${(100 * ff.P.delta).toFixed(3)} ± ${(100 * (ff.E.delta || 0)).toFixed(3)} % (сист. ${(100 * sy("delta")).toFixed(3)}; истина ${(100 * T.delta).toFixed(2)}); EMA = ${ff.P.dRough.toFixed(3)} ± ${(ff.E.dRough || 0).toFixed(3)} (сист. ${sy("dRough").toFixed(3)}; истина ${T.dRough}); k₄₀₀ = ${fk(ff.P.k400)} ± ${fk(ff.E.k400 || 0)} (сист. ${fk(sy("k400"))}; истина ${fk(tk)})`);
  const nk = E.filmNK([550], Object.assign({}, cfg.mat, { A: ff.P.A, Auv: ff.P.Auv, Eg: ff.P.Eg, Ak: ff.P.Ak }));
  console.log(`   n(550) = ${nk.n[0].toFixed(4)} (истина ${T.n["550"].toFixed(4)})` + (T.k ? `, k(550) = ${nk.k[0].toFixed(5)} (истина ${T.k["550"].toFixed(5)})` : ""));
}
console.log(wrong ? `\nНЕВЕРНЫХ НАБОРОВ ДЕФЕКТОВ: ${wrong}` : "\nНабор дефектов верен во всех образцах");
process.exit(wrong ? 1 : 0);
