/* Проверка учёта задней стороны подложки во всех расчётах ядра (дополняет разд. 8 test/verify_book.js):
   1) ncsBackside против явной суммы 60 пучков задней стороны по коэффициентам stackCoefs (t, r′, t′, r^b) — для плёнки с EMA-слоем,
      лестницей градиента и хвостом поглощения, на стекле, кварце (f < 1), тонкой пластине и кремнии (вклад гасится в толще);
   2) предел f → 0 совпадает с рекурсией Эйри;
   3) полуволновые якоря: в HW-точках однородная плёнка «исчезает» и с задней стороной — Ψ, Δ равны значениям голой пластины,
      положения якорей не зависят от задней стороны;
   4) самосогласованность синтеза и модели фита: чистый спектр образца 09 фитируется с верной долей до χ²/ν ≈ 0 и точных параметров;
      ошибка доли 0.01 и фит без задней стороны дают документированные смещения (README, разд. 3.4 и 9);
   5) полоса прибора вместе с задней стороной: модель второго порядка против точной свёртки;
   6) систематика по доле (линейное распространение) против прямого пересчёта фита при изменённой доле;
   7) степень деполяризации 1 − √(N² + C² + S²): нуль без задней стороны, 6–7 % для образца 09.
   Запуск: node test/verify_backside.js */
const E = require("../src/ellip_core.js");
const path = require("path");
const EX = require(path.join(__dirname, "../examples/examples.json"));
const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]], conj = (a) => [a[0], -a[1]], abs2 = (a) => a[0] * a[0] + a[1] * a[1];
const cdiv = (a, b) => { const d = abs2(b); return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
let failures = 0; const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) failures++; };

// ---- 1. явная сумма пучков: A_j^(m) = t_j (r^b_j)^m (r′_j)^(m−1) t′_j, затухание w^m, матрицы Мюллера складываются, знак p — эллипсометрический
function explicitSum(lam1, layersAt, Nsub1, phi, back, nBeams) {
  const S = E.stackCoefs(lam1, layersAt, Nsub1, phi), k = 2 * Math.PI / lam1;
  const ncs = cmul(Nsub1, S.cs), w = Math.exp(4 * k * back.ds * ncs[1]);                  // |exp(−2ik d_s N_s cos γ_s)|², Im(N cos γ) ≤ 0
  const beams = (pol) => { const c = S[pol]; const rb = cdiv([c.qs[0] - c.qa[0], c.qs[1] - c.qa[1]], [c.qs[0] + c.qa[0], c.qs[1] + c.qa[1]]); const A = []; let cur = cmul(cmul(c.t, rb), c.tb); for (let m = 1; m <= nBeams; m++) { A.push(cur); cur = cmul(cur, cmul(c.rb, rb)); } return A; };
  const Ap = beams("p"), As = beams("s"); let Sp = 0, Ss = 0, X = [0, 0];
  for (let m = 0; m < nBeams; m++) { const wm = Math.pow(w, m + 1); Sp += abs2(Ap[m]) * wm; Ss += abs2(As[m]) * wm; const z = cmul(Ap[m], conj(As[m])); X = [X[0] + z[0] * wm, X[1] + z[1] * wm]; }
  const rr = cmul(S.p.r, conj(S.s.r));
  const Ip = abs2(S.p.r) + back.f * Sp, Is = abs2(S.s.r) + back.f * Ss, Zr = -(rr[0] + back.f * X[0]), Zi = -(rr[1] + back.f * X[1]), tot = Ip + Is;
  return { N: (Is - Ip) / tot, C: 2 * Zr / tot, S: 2 * Zi / tot };
}
console.log("1. ncsBackside против явной суммы 60 пучков (TiO₂ 1017 нм, δ = −0.8 %, EMA 2.2 нм, хвост k₄₀₀ = 10⁻³, 65°)");
const lam = [400, 452.5, 517, 600, 700, 800], mat = Object.assign({}, E.MATERIALS.tio2, { Ak: E.tailAk(E.MATERIALS.tio2, 1e-3) });
for (const [subKey, ds, f, label] of [["bk7", 1e6, 1, "стекло BK7 1 мм, f = 1"], ["silica", 1e6, 0.96, "кварц 1 мм, f = 0.96"], ["bk7", 1e5, 0.5, "стекло 0.1 мм, f = 0.5"], ["si", 5e5, 1, "кремний 0.5 мм, f = 1"]]) {
  const Nsub = E.substrateN(subKey, lam), layers = E.buildLayers(lam, 1017.3, mat, -0.008, 2.2, 40), back = { f, ds };
  const R = E.ncsBackside(lam, layers, Nsub, 65, back); let worst = 0, dep = 0;
  lam.forEach((l, i) => { const X = explicitSum(l, layers.map(L => ({ N: L.N[i], d: L.d })), Nsub[i], 65, back, 60); worst = Math.max(worst, Math.abs(X.N - R.N[i]), Math.abs(X.C - R.C[i]), Math.abs(X.S - R.S[i])); dep = Math.max(dep, 1 - Math.hypot(R.N[i], R.C[i], R.S[i])); });
  check(worst < 1e-12, `${label}: расхождение по N, C, S ${worst.toExponential(1)}, деполяризация до ${(100 * dep).toFixed(2)} %`);
  if (subKey === "si") check(dep < 1e-6, `кремний 0.5 мм: вклад задней стороны гасится в толще (деполяризация ${dep.toExponential(1)})`);
}
console.log("2. предел f → 0");
{ const Nsub = E.substrateN("bk7", lam), layers = E.buildLayers(lam, 1017.3, mat, -0.008, 2.2, 40); const R = E.ncsBackside(lam, layers, Nsub, 65, { f: 0, ds: 1e6 }), R0 = E.ncsFromR(...E.rhoStack(lam, layers, Nsub, 65)); let w = 0; lam.forEach((l, i) => { w = Math.max(w, Math.abs(R.N[i] - R0.N[i]), Math.abs(R.C[i] - R0.C[i]), Math.abs(R.S[i] - R0.S[i])); }); check(w < 1e-12, `f = 0 совпадает с рекурсией Эйри: ${w.toExponential(1)}`); }

// ---- образец 09: ZrO₂ 780.4 нм / кварц 1 мм, 65°, истинная доля 0.96
const ex = EX[8], T = ex.truth, lamEx = ex.lam, matT = Object.assign({}, T.mat, { Ak: 0 });
console.log("3. полуволновые якоря с задней стороной (образец 09, сетка 0.05 нм)");
{ const lamF = []; for (let l = 400; l <= 800 + 1e-9; l += 0.05) lamF.push(+l.toFixed(3)); const anch = {};
  for (const [key, back] of [["без", null], ["с", { f: 0.96, ds: 1e6 }]]) {
    const Nsub = E.substrateN("silica", lamF), sub = E.modelPsiDelta(lamF, Nsub, 65, 0, matT, 0, 0, 1, back, null), hom = E.modelPsiDelta(lamF, Nsub, 65, T.d, matT, 0, 0, 1, back, null);
    const { HW } = E.anchors(lamF, hom.del, sub.del); anch[key] = HW;
    const dPsi = lamF.map((l, i) => hom.psi[i] - sub.psi[i]), dDel = lamF.map((l, i) => E.wrap(hom.del[i] - sub.del[i])); let mx = 0, mxD = 0;
    HW.forEach(x => { mx = Math.max(mx, Math.abs(E.interp(x, lamF, dPsi))); mxD = Math.max(mxD, Math.abs(E.interp(x, lamF, dDel))); });
    check(mx < 1e-3 && mxD < 1e-6, `${key} задней стороны: в ${HW.length} HW-якорях |Ψ_плёнки − Ψ_подложки| ≤ ${mx.toExponential(1)}°, |Δ − Δ_подложки| ≤ ${mxD.toExponential(1)}°`);
  }
  const shift = Math.max(...anch["с"].map((x, k) => Math.abs(x - anch["без"][k]))); check(anch["с"].length === anch["без"].length && shift < 0.01, `положения HW-якорей не зависят от задней стороны (сдвиг ≤ ${shift.toFixed(3)} нм)`); }

console.log("4. самосогласованность синтеза и фита (чистый спектр образца 09, истинные параметры)");
const dd = (() => { const s = E.synthesizeClean(lamEx, "silica", T.phiTrue, T.d, T.mat, T.delta, T.dRough, { back: T.back }); return { lam: lamEx, psi: Array.from(s.psi), del: Array.from(s.del), sigPsi: ex.sigPsi, sigDel: ex.sigDel }; })();
const prior = { dMin: 740, dMax: 820 }, flags = { grad: true, rough: true, abs: false }, p0 = { d: T.d, A: T.mat.A, Auv: T.mat.Auv, Eg: T.mat.Eg, dRough: T.dRough, delta: T.delta, Ak: 0 };
const cfgOf = (back) => ({ mat: matT, subKey: "silica", Nsub: E.substrateN("silica", lamEx), phi: T.phiTrue, subDel: null, back, band: null });
const fitTrue = E.finalFit(dd, cfgOf({ f: 0.96, ds: 1e6 }), prior, flags, p0);
check(fitTrue.chi2 < 1e-4 && Math.abs(fitTrue.P.d - T.d) < 1e-3 && Math.abs(fitTrue.P.delta - T.delta) < 1e-5 && Math.abs(fitTrue.P.dRough - T.dRough) < 5e-3, `верная доля 0.96: d = ${fitTrue.P.d.toFixed(4)} (${T.d}), δ = ${(100 * fitTrue.P.delta).toFixed(4)} % (${100 * T.delta}), слой ${fitTrue.P.dRough.toFixed(3)} (${T.dRough}), χ²/ν = ${fitTrue.chi2.toExponential(1)}`);
const fit95 = E.finalFit(dd, cfgOf({ f: 0.95, ds: 1e6 }), prior, flags, p0, { phiErr: 0, backFerr: 0.01, bwErr: 0, offErr: 0 });
check(Math.abs(fit95.P.d - T.d) < 1.0 && Math.abs(fit95.P.d - T.d) > 0.1 && Math.abs(100 * (fit95.P.delta - T.delta)) < 0.2, `заданная доля 0.95 при истинной 0.96: Δd = ${(fit95.P.d - T.d).toFixed(3)} нм, Δδ = ${(100 * (fit95.P.delta - T.delta)).toFixed(3)} % (документировано ≈ 0.4 нм и 0.07 %), χ²/ν = ${fit95.chi2.toFixed(2)}`);
const fitNo = E.finalFit(dd, cfgOf(null), prior, flags, p0);
check(fitNo.chi2 > 1e3 && Math.abs(fitNo.P.d - T.d) > 5, `без задней стороны в модели: Δd = ${(fitNo.P.d - T.d).toFixed(1)} нм, δ = ${(100 * fitNo.P.delta).toFixed(2)} %, χ²/ν = ${fitNo.chi2.toExponential(1)} — задняя сторона превращается в ложные дефекты`);

console.log("5. полоса прибора вместе с задней стороной");
{ const s = E.synthesizeClean(lamEx, "silica", T.phiTrue, T.d, T.mat, T.delta, T.dRough, { back: T.back, bw: 1.0 }), Nsub = E.substrateN("silica", lamEx);
  const mdl = E.modelPsiDelta(lamEx, Nsub, T.phiTrue, T.d, T.mat, T.delta, T.dRough, 160, T.back, { bw: 1.0, subKey: "silica" }), m0 = E.modelPsiDelta(lamEx, Nsub, T.phiTrue, T.d, T.mat, T.delta, T.dRough, 160, T.back, null);
  let e = 0, eff = 0; lamEx.forEach((l, i) => { e = Math.max(e, Math.abs(s.psi[i] - mdl.psi[i]), Math.abs(E.wrap(s.del[i] - mdl.del[i])) / 3); eff = Math.max(eff, Math.abs(s.psi[i] - m0.psi[i])); });
  check(e < 1e-3 && eff > 1e-3, `полоса 1 нм: эффект до ${eff.toFixed(3)}° по Ψ, модель второго порядка против точной свёртки ≤ ${e.toExponential(1)}°`); }

console.log("6. систематика по доле: линейное распространение против прямого пересчёта");
{ const fit96 = E.finalFit(dd, cfgOf({ f: 0.96, ds: 1e6 }), prior, flags, p0);
  const dLin = fit95.sys.total.d, dDir = Math.abs(fit96.P.d - fit95.P.d), gLin = fit95.sys.total.delta, gDir = Math.abs(fit96.P.delta - fit95.P.delta);
  check(Math.abs(dLin - dDir) < 0.05 * dDir + 1e-3 && Math.abs(gLin - gDir) < 0.05 * gDir + 1e-6, `±0.01 по доле: линейно Δd ${dLin.toFixed(3)} нм, Δδ ${(100 * gLin).toFixed(3)} %; прямой пересчёт 0.95 → 0.96: Δd ${dDir.toFixed(3)} нм, Δδ ${(100 * gDir).toFixed(3)} %`); }

console.log("7. степень деполяризации");
{ const Nsub = E.substrateN("silica", lamEx), layers = E.buildLayers(lamEx, T.d, T.mat, T.delta, T.dRough, 160);
  const R = E.ncsBackside(lamEx, layers, Nsub, T.phiTrue, T.back), R0 = E.ncsFromR(...E.rhoStack(lamEx, layers, Nsub, T.phiTrue)); let dep = 0, dep0 = 0;
  lamEx.forEach((l, i) => { dep = Math.max(dep, 1 - Math.hypot(R.N[i], R.C[i], R.S[i])); dep0 = Math.max(dep0, Math.abs(1 - Math.hypot(R0.N[i], R0.C[i], R0.S[i]))); });
  check(dep0 < 1e-12 && dep > 0.05 && dep < 0.08, `без задней стороны ${dep0.toExponential(1)}, образец 09 (f = 0.96) до ${(100 * dep).toFixed(1)} % (README: 6.7 %)`); }

console.log(failures ? `\nОШИБОК: ${failures}` : "\nВсе проверки задней стороны пройдены");
process.exit(failures ? 1 : 0);
