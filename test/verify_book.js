/* Проверка физики ядра по книге Sh. A. Furman, A. V. Tikhonravov, «Basics of Optics of Multilayer Systems» (1992):
   1) матричный метод Абелеса (формулы 1.2.9, 1.2.13, 1.2.14) — независимая реализация;
   2) воспроизведение таблицы 1.2 (17-слойный узкополосный фильтр S (HL)^4 2H (LH)^4, λ0 = 500 нм);
   3) сравнение рекурсии Эйри ядра (rhoStack) с матричным методом при наклонном падении, поглощающих слоях и подложке;
   4) уравнение Риккати для локальной функции отражения (1.1.19, 1.1.20): непрерывный градиент n(z) против лестницы подслоёв;
   5) закон сохранения энергии R + T = 1 для непоглощающей системы;
   6) аналитический якобиан (разд. 1.4.1) против конечных разностей, включая силу хвоста поглощения A_k;
   7) хвост поглощения: численная проверка Крамерса–Кронига и монотонный рост k к синему краю;
   8) задняя сторона подложки: r′, t′ обращённой стопки, классическая некогерентная сумма для пластины, предел f → 0, численный якобиан;
   9) спектральная полоса: синтез (свёртка интенсивностей I_p, I_s, r_p r_s* на выровненной сетке) и модель фита (второй порядок по σ) против прямой свёртки в точке;
  10) аналитический якобиан с полосой в модели; производные по δ и d_r в нуле; конечность ε₁ Тауца–Лоренца при E = E_g; k₄₀₀ по найденной дисперсии;
  11) таблицы кремния: Green 2008 и Aspnes–Studna воспроизводят узлы источников, кубическая интерполяция гладкая.
   Запуск: node test/verify_book.js */
const E = require("../src/ellip_core.js");
const PI = Math.PI;
// ---- комплексная арифметика (конвенция книги: exp(+iωt), N = n − ik)
const C = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1]], sub: (a, b) => [a[0] - b[0], a[1] - b[1]],
  mul: (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]],
  div: (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; },
  scale: (a, s) => [a[0] * s, a[1] * s], abs2: (a) => a[0] * a[0] + a[1] * a[1], abs: (a) => Math.hypot(a[0], a[1]),
  sqrt: (a) => { const r = Math.hypot(a[0], a[1]); let re = Math.sqrt(Math.max(0, (r + a[0]) / 2)), im = Math.sqrt(Math.max(0, (r - a[0]) / 2)); if (a[1] < 0) im = -im; return [re, im]; },
  cos: (a) => [Math.cos(a[0]) * Math.cosh(a[1]), -Math.sin(a[0]) * Math.sinh(a[1])],
  sin: (a) => [Math.sin(a[0]) * Math.cosh(a[1]), Math.cos(a[0]) * Math.sinh(a[1])],
  I: [0, 1], ONE: [1, 0],
};
const cosGamma = (N, alpha2) => C.sqrt(C.sub(C.ONE, C.div([alpha2, 0], C.mul(N, N))));   // cos γ_j = sqrt(1 − α²/n_j²), главная ветвь

/** Матричный метод книги. layers: [{N: [n,−k], d}] сверху вниз (как в ядре); возвращает {rs, rp, ts, tp, Rs, Rp, Ts, Tp} на одной λ. */
function abeles(lam, layers, Nsub, phiDeg, Nout) {
  Nout = Nout || [1, 0];
  const alpha = Nout[0] * Math.sin(phiDeg * PI / 180), alpha2 = alpha * alpha, k = 2 * PI / lam;
  const out = {};
  for (const pol of ["s", "p"]) {
    const q = (N) => { const c = cosGamma(N, alpha2); return pol === "s" ? C.mul(N, c) : C.div(N, c); };
    // M = M_m ... M_1, сомножители от внешней среды к подложке; слои у нас перечислены сверху вниз
    let M = [[C.ONE, [0, 0]], [[0, 0], C.ONE]];
    for (const L of layers) {
      const c = cosGamma(L.N, alpha2), phi = C.scale(C.mul(L.N, c), k * L.d), qj = q(L.N);
      const cp = C.cos(phi), sp = C.sin(phi);
      const Mj = [[cp, C.div(C.mul(C.I, sp), qj)], [C.mul(C.mul(C.I, qj), sp), cp]];
      M = [[C.add(C.mul(M[0][0], Mj[0][0]), C.mul(M[0][1], Mj[1][0])), C.add(C.mul(M[0][0], Mj[0][1]), C.mul(M[0][1], Mj[1][1]))],
           [C.add(C.mul(M[1][0], Mj[0][0]), C.mul(M[1][1], Mj[1][0])), C.add(C.mul(M[1][0], Mj[0][1]), C.mul(M[1][1], Mj[1][1]))]];
    }
    const qa = q(Nout), qs = q(Nsub);
    const [m11, m12, m21, m22] = [M[0][0], M[0][1], M[1][0], M[1][1]];
    const den = C.add(C.add(C.mul(qa, m11), C.mul(qs, m22)), C.add(C.mul(C.mul(qa, qs), m12), m21));
    const num = C.sub(C.add(C.mul(qa, m11), C.mul(C.mul(qa, qs), m12)), C.add(C.mul(qs, m22), m21));
    const r = C.div(num, den), t = C.div(C.scale(qa, 2), den);
    out["r" + pol] = r; out["t" + pol] = t; out["R" + pol] = C.abs2(r); out["T" + pol] = qs[0] / qa[0] * C.abs2(t);
  }
  return out;
}

/** Уравнение Риккати (1.1.19)/(1.1.20) для локальной функции отражения; профиль eps(z), z от подложки (0) к поверхности (za). RK4. */
function riccati(lam, epsOf, za, Nsub, phiDeg, h) {
  const alpha = Math.sin(phiDeg * PI / 180), alpha2 = alpha * alpha, k = 2 * PI / lam;
  const out = {};
  for (const pol of ["s", "p"]) {
    const ca = Math.sqrt(1 - alpha2), qa = pol === "s" ? [ca, 0] : [1 / ca, 0];
    const cs = cosGamma(Nsub, alpha2), qs = pol === "s" ? C.mul(Nsub, cs) : C.div(Nsub, cs);
    const f = (z, r) => {        // dr/dz = (ik/2qa) [ qa² (1−r)² (·) − (·)(1+r)² ]
      const eps = epsOf(z), m = C.mul(C.sub(C.ONE, r), C.sub(C.ONE, r)), p = C.mul(C.add(C.ONE, r), C.add(C.ONE, r));
      let term;
      if (pol === "s") term = C.sub(C.scale(m, qa[0] * qa[0]), C.mul(C.sub(eps, [alpha2, 0]), p));
      else term = C.sub(C.scale(C.mul(C.sub(C.ONE, C.div([alpha2, 0], eps)), m), qa[0] * qa[0]), C.mul(eps, p));
      return C.mul([0, k / (2 * qa[0])], term);
    };
    let r = C.div(C.sub(qa, qs), C.add(qa, qs));
    const n = Math.ceil(za / h), dz = za / n;
    for (let i = 0; i < n; i++) {
      const z = i * dz;
      const k1 = f(z, r), k2 = f(z + dz / 2, C.add(r, C.scale(k1, dz / 2))), k3 = f(z + dz / 2, C.add(r, C.scale(k2, dz / 2))), k4 = f(z + dz, C.add(r, C.scale(k3, dz)));
      r = C.add(r, C.scale(C.add(C.add(k1, C.scale(k2, 2)), C.add(C.scale(k3, 2), k4)), dz / 6));
    }
    out["r" + pol] = r;
  }
  return out;
}
const psiDelta = (rp, rs) => { const psi = Math.atan(Math.sqrt(C.abs2(rp) / C.abs2(rs))) * 180 / PI; const pr = C.mul(rp, [rs[0], -rs[1]]); let d = Math.atan2(pr[1], pr[0]) * 180 / PI; if (d < 0) d += 360; return [psi, d]; };
const wrap = (v) => ((v + 180) % 360 + 360) % 360 - 180;
let failures = 0; const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) failures++; };

// ================================================================ 1–2. Таблица 1.2 книги
console.log("1. Таблица 1.2 (17 слоёв S (HL)^4 xH (LH)^4, n_s = 1.52, n_H = 2.3 − 0.0002i, n_L = 1.35 − 0.0002i, λ0 = 500 нм, нормальное падение)");
const nH = [2.3, -0.0002], nL = [1.35, -0.0002], ns = [1.52, 0];
const dH = 500 / (4 * 2.3), dL = 500 / (4 * 1.35);
const bottomUp = [];                                    // от подложки к воздуху
for (let i = 0; i < 4; i++) bottomUp.push({ N: nH, d: dH }, { N: nL, d: dL });
bottomUp.push({ N: nH, d: 4 * dH });                    // спейсер с оптической толщиной λ0 (см. примечание в отчёте)
for (let i = 0; i < 4; i++) bottomUp.push({ N: nL, d: dL }, { N: nH, d: dH });
const topDown = bottomUp.slice().reverse();
const table = [[480, 0.146, 99.721, 0.133], [485, 0.238, 99.616, 0.146], [492, 0.780, 98.982, 0.238], [497, 5.196, 93.786, 1.018], [499, 31.286, 63.049, 5.665],
  [500, 83.401, 1.597, 15.002], [501, 31.429, 62.827, 5.744], [503, 5.312, 93.624, 1.064], [508, 0.829, 98.917, 0.254], [515, 0.264, 99.585, 0.151], [520, 0.165, 99.702, 0.133]];
let maxDev = 0, maxDevT = 0, maxDevApp = 0;
console.log("   λ, нм | T книга / расчёт | R книга / расчёт (свет из подложки) | A книга / расчёт | R прямого хода: матрица / ядро");
for (const [lam, Tb, Rb, Ab] of table) {
  const rev = abeles(lam, bottomUp, [1, 0], 0, ns);      // обратный ход: внешняя среда 1.52, выход в воздух
  const fwd = abeles(lam, topDown, ns, 0);               // прямой ход: из воздуха
  const T = 100 * rev.Ts, R = 100 * rev.Rs, A = 100 - T - R;
  const [RP, RS] = E.rhoStack([lam], topDown.map(L => ({ N: [L.N], d: L.d })), [ns], 1e-6);
  const Rapp = 100 * C.abs2(RS[0]);
  maxDev = Math.max(maxDev, Math.abs(T - Tb), Math.abs(R - Rb), Math.abs(A - Ab)); maxDevT = Math.max(maxDevT, Math.abs(100 * fwd.Ts - Tb)); maxDevApp = Math.max(maxDevApp, Math.abs(Rapp - 100 * fwd.Rs));
  console.log(`   ${lam}   | ${Tb.toFixed(3)} / ${T.toFixed(3)} | ${Rb.toFixed(3)} / ${R.toFixed(3)} | ${Ab.toFixed(3)} / ${A.toFixed(3)} | ${(100 * fwd.Rs).toFixed(3)} / ${Rapp.toFixed(3)}`);
}
check(maxDev < 0.002, `матричный метод воспроизводит таблицу 1.2 (T, R, A) с точностью ${maxDev.toFixed(4)} % — при свете со стороны подложки`);
check(maxDevT < 0.002, `T не зависит от направления хода (разд. 1.3.2): прямой ход даёт те же T с точностью ${maxDevT.toFixed(4)} %`);
check(maxDevApp < 1e-9, `рекурсия Эйри ядра совпадает с матричным методом по R прямого хода: макс. отклонение ${maxDevApp.toExponential(1)} %`);

// ================================================================ 3. Ядро против матричного метода при наклонном падении
console.log("\n2. rhoStack против матричного метода: TiO2 1000 нм с градиентом +5 % (40 подслоёв) и EMA-слоем 2 нм на c-Si, 65°, 400–800 нм");
{
  const lam = []; for (let l = 400; l <= 800; l += 4) lam.push(l);
  const m = E.MATERIALS.tio2, Nsub = E.substrateN("si", lam);
  const layers = E.buildLayers(lam, 1000, m, 0.05, 2.0, 40);
  const [RP, RS] = E.rhoStack(lam, layers, Nsub, 65);
  let dRs = 0, dRpSign = 0, dPsi = 0, dDel = 0;
  for (let i = 0; i < lam.length; i++) {
    const a = abeles(lam[i], layers.map(L => ({ N: L.N[i], d: L.d })), Nsub[i], 65);
    dRs = Math.max(dRs, C.abs(C.sub(a.rs, RS[i])));
    dRpSign = Math.max(dRpSign, C.abs(C.add(a.rp, RP[i])));           // r_p ядра = −r_p книги (определение через H, а не через E_танг)
    const [ps1, d1] = psiDelta(RP[i], RS[i]); const [ps2, d2] = psiDelta(C.scale(a.rp, -1), a.rs);
    dPsi = Math.max(dPsi, Math.abs(ps1 - ps2)); dDel = Math.max(dDel, Math.abs(wrap(d1 - d2)));
  }
  check(dRs < 1e-10, `r_s совпадает: макс. |Δr_s| = ${dRs.toExponential(1)}`);
  check(dRpSign < 1e-10, `r_p ядра равен −r_p книги (эллипсометрическая конвенция знака p): макс. невязка ${dRpSign.toExponential(1)}`);
  check(dPsi < 1e-8 && dDel < 1e-8, `Ψ, Δ совпадают после учёта знака: max|ΔΨ| = ${dPsi.toExponential(1)}°, max|ΔΔ| = ${dDel.toExponential(1)}°`);
  // Δ книги отличается на 180°
  const [, dCore] = psiDelta(RP[10], RS[10]); const a = abeles(lam[10], layers.map(L => ({ N: L.N[10], d: L.d })), Nsub[10], 65); const [, dBook] = psiDelta(a.rp, a.rs);
  console.log(`   при λ = ${lam[10]} нм: Δ ядра ${dCore.toFixed(2)}°, Δ в конвенции книги ${dBook.toFixed(2)}° (разница 180°)`);
}

// ================================================================ 4. Риккати: непрерывный градиент против лестницы
console.log("\n3. Непрерывный линейный профиль n(z) (уравнение Риккати, RK4, шаг 0.25 нм) против лестницы подслоёв; TiO2 1000 нм на BK7, 65°");
{
  const lam = []; for (let l = 400; l <= 800; l += 8) lam.push(l);
  const m = E.MATERIALS.tio2, Nsub = E.substrateN("bk7", lam), Nf = E.filmN(lam, m);
  const sigP = lam.map(l => 0.015 + 0.02 * Math.max(0, (650 - l) / 250) ** 2), sigD = sigP.map(v => 2.2 * v);
  for (const delta of [0.01, 0.05, 0.12]) {
    const refPD = [];
    const t0 = Date.now();
    for (let i = 0; i < lam.length; i++) {
      const N0 = Nf[i], d = 1000;
      const epsOf = (z) => { const s = 1 + delta * (z / d - 0.5); const N = C.scale(N0, s); return C.mul(N, N); };
      const r = riccati(lam[i], epsOf, d, Nsub[i], 65, 0.25);
      refPD.push(psiDelta(C.scale(r.rp, -1), r.rs));
    }
    const ms = Date.now() - t0;
    const row = [];
    for (const M of [10, 20, 40, 80, 160]) {
      const pd = E.modelPsiDelta(lam, Nsub, 65, 1000, m, delta, 0, M);
      let sp = 0, sd = 0; for (let i = 0; i < lam.length; i++) { sp += ((pd.psi[i] - refPD[i][0]) / sigP[i]) ** 2; sd += (wrap(pd.del[i] - refPD[i][1]) / sigD[i]) ** 2; }
      row.push(`M=${M}: Ψ ${Math.sqrt(sp / lam.length).toFixed(2)}σ, Δ ${Math.sqrt(sd / lam.length).toFixed(2)}σ`);
    }
    console.log(`   δ = ${(100 * delta).toFixed(0)} % (Риккати ${ms} мс на ${lam.length} λ): RMS отклонения лестницы от непрерывного профиля — ${row.join("; ")}`);
  }
  // сходимость Риккати по шагу
  const N0 = Nf[20], epsOf = (z) => { const s = 1 + 0.05 * (z / 1000 - 0.5); const N = C.scale(N0, s); return C.mul(N, N); };
  const r1 = riccati(lam[20], epsOf, 1000, Nsub[20], 65, 0.5), r2 = riccati(lam[20], epsOf, 1000, Nsub[20], 65, 0.125);
  check(C.abs(C.sub(r1.rp, r2.rp)) < 1e-6 && C.abs(C.sub(r1.rs, r2.rs)) < 1e-6, `сходимость RK4 по шагу: |r(0.5 нм) − r(0.125 нм)| = ${Math.max(C.abs(C.sub(r1.rp, r2.rp)), C.abs(C.sub(r1.rs, r2.rs))).toExponential(1)}`);
  // rhoGraded ядра (h = 0.5) против независимого Риккати теста (h = 0.25), с EMA-слоем
  {
    const lam2 = [420, 550, 700], Ns2 = E.substrateN("bk7", lam2), Nf2 = E.filmN(lam2, m);
    const [RPg, RSg] = E.rhoGraded(lam2, Ns2, 65, 1000, m, 0.07, 0, 0.5);
    let dm = 0;
    for (let i = 0; i < lam2.length; i++) {
      const epsOf = (z) => { const sc = 1 + 0.07 * (z / 1000 - 0.5); const N = C.scale(Nf2[i], sc); return C.mul(N, N); };
      const r = riccati(lam2[i], epsOf, 1000, Ns2[i], 65, 0.25);
      dm = Math.max(dm, C.abs(C.add(RPg[i], r.rp)), C.abs(C.sub(RSg[i], r.rs)));
    }
    check(dm < 1e-4, `rhoGraded ядра совпадает с независимой реализацией Риккати: max|Δr| = ${dm.toExponential(1)}`);
  }
  // однородная плёнка: Риккати должен совпасть с Эйри точно
  const eps0 = C.mul(N0, N0); const r0 = riccati(lam[20], () => eps0, 1000, Nsub[20], 65, 0.25);
  const [RP, RS] = E.rhoStack([lam[20]], [{ N: [N0], d: 1000 }], [Nsub[20]], 65);
  check(C.abs(C.add(r0.rp, RP[0])) < 1e-8 && C.abs(C.sub(r0.rs, RS[0])) < 1e-8, `однородная плёнка: Риккати = Эйри с точностью ${Math.max(C.abs(C.add(r0.rp, RP[0])), C.abs(C.sub(r0.rs, RS[0]))).toExponential(1)}`);
}

// ================================================================ 5. Сохранение энергии и предельные случаи
console.log("\n4. Сохранение энергии, френелевские пределы, ветвь корня");
{
  const lam = 550, m = E.MATERIALS.ta2o5, N0 = E.filmN([lam], m)[0];
  const a = abeles(lam, [{ N: [N0[0], 0], d: 700 }], [1.52, 0], 60);
  check(Math.abs(a.Rs + a.Ts - 1) < 1e-12 && Math.abs(a.Rp + a.Tp - 1) < 1e-12, `непоглощающая плёнка на стекле, 60°: R_s + T_s − 1 = ${(a.Rs + a.Ts - 1).toExponential(1)}, R_p + T_p − 1 = ${(a.Rp + a.Tp - 1).toExponential(1)}`);
  const Nuv = E.filmN([340], E.MATERIALS.tio2)[0];
  const b = abeles(340, [{ N: Nuv, d: 300 }], E.substrateN("bk7", [340])[0], 60);
  check(Nuv[1] < 0 && b.Rs + b.Ts < 1 && b.Rp + b.Tp < 1, `TiO2 при 340 нм: N = ${Nuv[0].toFixed(3)} − ${(-Nuv[1]).toFixed(3)}i (k > 0 в конвенции n − ik); плёнка 300 нм на BK7, 60°: A_s = ${(1 - b.Rs - b.Ts).toFixed(4)}, A_p = ${(1 - b.Rp - b.Tp).toFixed(4)} — положительны (знак мнимой части верен)`);
  // EMA Бруггемана: корень удовлетворяет уравнению и физичен
  const eps = C.mul(N0, N0), b0 = C.scale(C.add(C.scale(eps, 0.5), [0.5, 0]), 1); // (3f−1)ε_a + (3f−1)ε_b при f = 0.5
  const Nema = E.buildLayers([lam], 100, m, 0, 5, 1)[0].N[0], eEma = C.mul(Nema, Nema);
  const resid = C.add(C.scale(C.div(C.sub(eps, eEma), C.add(eps, C.scale(eEma, 2))), 0.5), C.scale(C.div(C.sub(C.ONE, eEma), C.add(C.ONE, C.scale(eEma, 2))), 0.5));
  check(C.abs(resid) < 1e-12 && eEma[0] > 1 && eEma[0] < eps[0], `слой Бруггемана 50/50: невязка уравнения ЭС ${C.abs(resid).toExponential(1)}, ε_ema = ${eEma[0].toFixed(4)} между 1 и ε_плёнки = ${eps[0].toFixed(4)} (n_ema = ${Nema[0].toFixed(4)})`);
  // голая подложка: Френель; угол Брюстера BK7 при 550 нм
  const nb = E.substrateN("bk7", [550])[0]; const brew = Math.atan(nb[0]) * 180 / PI;
  const [RPb, RSb] = E.rhoStack([550], [], [nb], brew);
  check(C.abs(RPb[0]) < 1e-6, `угол Брюстера BK7 (${brew.toFixed(2)}°): |r_p| = ${C.abs(RPb[0]).toExponential(1)}`);
  const [RP1, RS1] = E.rhoStack([550], [], [nb], 45), [RP2, RS2] = E.rhoStack([550], [], [nb], 70);
  const d45 = psiDelta(RP1[0], RS1[0])[1], d70 = psiDelta(RP2[0], RS2[0])[1];
  check(Math.abs(d45 - 180) < 1e-9 && Math.abs(d70) < 1e-9, `Δ голого диэлектрика: ${d45.toFixed(1)}° ниже Брюстера, ${d70.toFixed(1)}° выше (эллипсометрическая конвенция)`);
  const [RPn, RSn] = E.rhoStack([550], [], [nb], 1e-9);
  check(C.abs(C.add(RPn[0], RSn[0])) < 1e-9, `нормальное падение: r_p = −r_s (ρ = −1, Δ = 180°), как и должно быть при определении r_p через H`);
  // ветвь корня: затухание в поглощающей среде и в плёнке
  const Nsi = E.substrateN("si", [400])[0]; const c = cosGamma(Nsi, Math.sin(65 * PI / 180) ** 2); const qz = C.mul(Nsi, c);
  check(qz[1] < 0, `Im(N cos γ) = ${qz[1].toFixed(4)} < 0 для c-Si при 400 нм: прошедшая волна затухает (требование книги для exp(+iωt))`);
}

// ================================================================ 6. Аналитический якобиан (разд. 1.4.1) против конечных разностей
console.log("\n5. Аналитический якобиан по формулам 1.4.9–1.4.16 (матрицы D_j, N_j, Ψ_r, следы) против центральных разностей");
{
  const lam = []; for (let l = 400; l <= 800; l += 2) lam.push(l);
  const sig = lam.map(l => 0.015 + 0.02 * Math.max(0, (650 - l) / 250) ** 2), sigD = sig.map(v => 2.2 * v);
  const free = ["d", "A", "Auv", "Eg", "dRough", "delta", "Ak"], hs = { d: 1e-2, A: 4e-3, Auv: 4e-3, Eg: 4e-6, dRough: 4e-4, delta: 2e-5, Ak: 2e-4 };   // шаги на минимуме суммы ошибок усечения и округления
  for (const [subKey, phi, matKey, P] of [["bk7", 65, "tio2", { d: 1017.3, A: 262, Auv: 131, Eg: 3.37, dRough: 2.2, delta: -0.008, Ak: 0.05 }], ["si", 70, "si3n4", { d: 612.5, A: 160, Auv: 100, Eg: 4.65, dRough: 0.9, delta: 0.05, Ak: 0.3 }]]) {
    const mat = E.MATERIALS[matKey], cfg = { mat, subKey, Nsub: E.substrateN(subKey, lam), phi };
    // «данные» = модель в x0 + 0.1° по Ψ и 1° по Δ: невязка мала, и конечные разности не теряют точность на округлении (и нет разрыва wrap на 180°)
    const m0 = E.modelPsiDelta(lam, cfg.Nsub, phi, P.d, Object.assign({}, mat, { A: P.A, Auv: P.Auv, Eg: P.Eg, Ak: P.Ak }), P.delta, P.dRough, 40);
    const data = { lam, psi: m0.psi.map(v => v + 0.1), del: m0.del.map(v => (v + 1) % 360), sigPsi: sig, sigDel: sigD };
    const fn = E.makeResidJacFn(data, cfg, free, {}, 40), x0 = free.map(k => P[k]), ev = fn(x0, true);
    let worst = 0;
    for (let p = 0; p < free.length; p++) {
      const h = hs[free[p]], xp = x0.slice(), xm = x0.slice(); xp[p] += h; xm[p] -= h;
      const rp = fn(xp, false).r, rm = fn(xm, false).r; let maxAbs = 0, norm = 0;
      for (let i = 0; i < rp.length; i++) { const num = (rp[i] - rm[i]) / (2 * h); maxAbs = Math.max(maxAbs, Math.abs(num - ev.J[p][i])); norm = Math.max(norm, Math.abs(num)); }
      worst = Math.max(worst, maxAbs / norm);
    }
    check(worst < 1e-5, `${mat.name} на ${subKey}, ${phi}°, 42 слоя, 7 параметров (d, A, A_uv, E_g, слой ЭС, δ, A_k хвоста поглощения): макс. относительное расхождение ${worst.toExponential(1)} (уровень округления центральных разностей)`);
  }
}

// ================================================================ 7. Хвост поглощения: причинность (Крамерс–Крониг) и форма
console.log("\n6. Хвост поглощения (второй осциллятор Тауца–Лоренца с порогом E_t): численная проверка соотношения Крамерса–Кронига и рост k к синему краю");
{
  // ε₁(E) − 1 = (2/π) P∫₀^∞ E' ε₂(E') / (E'² − E²) dE' для ε₂ хвоста; особенность выделяется вычитанием: ∫ [E'ε₂(E') − Eε₂(E)]/(E'² − E²) dE' + ε₂(E)·E·∫ dE'/(E'²−E²)
  const Et = E.TAIL_ET, kkCheck = (E0, C, Eg, label) => {
    const eps2 = (x) => E.tlEps(x, 1, E0, C, Eg)[1];
    let worst = 0;
    for (const Ex of [1.5, 2.0, 2.5, 3.1, 3.6]) {
      const Emax = 400, N = 400000, hh = Emax / N; let s = 0; const e2x = eps2(Ex);
      for (let i = 0; i <= N; i++) { const x = i * hh, w = (i === 0 || i === N) ? 0.5 : 1; const den = x * x - Ex * Ex; if (Math.abs(den) < 1e-12) continue; s += w * (x * eps2(x) - Ex * e2x) / den; }
      s *= hh; const pv = Math.log(Math.abs((Emax - Ex) / (Emax + Ex))) / (2 * Ex);       // P∫₀^Emax dE'/(E'² − Ex²) = (1/2Ex) ln|(Emax−Ex)/(Emax+Ex)|
      const eps1num = 2 / Math.PI * (s + Ex * e2x * pv), eps1an = E.tlEps(Ex, 1, E0, C, Eg)[0];
      worst = Math.max(worst, Math.abs(eps1num - eps1an));
    }
    return worst;
  };
  const wTail = kkCheck(4.0, 1.77, Et, "хвост TiO2"), wHost = kkCheck(4.0, 1.77, 3.40, "TiO2");
  check(wTail < 1e-4, `хвост (E₀ = 4.0, C = 1.77, E_t = ${Et} эВ): |ε₁(численный КК) − ε₁(аналитический)| ≤ ${wTail.toExponential(1)} в 1.5–3.6 эВ — хвост причинен`);
  check(wHost < 1e-4, `основной осциллятор TiO₂ (E_g = 3.40): та же проверка, расхождение ${wHost.toExponential(1)}`);
  const m = E.MATERIALS.tio2, Ak = E.tailAk(m, 1e-3), lamK = [400, 500, 600, 700, 800];
  const nk = E.filmNK(lamK, Object.assign({}, m, { Ak })), nk0 = E.filmNK(lamK, m), kt = nk.k.map((v, i) => v - nk0.k[i]);
  const mono = kt.every((v, i) => i === 0 || v < kt[i - 1]);
  check(Math.abs(kt[0] - 1e-3) < 1e-9 && mono && kt[0] / kt[4] > 10, `tailAk обращает tailK400 (k хвоста при 400 нм = ${kt[0].toExponential(4)}), k хвоста монотонно растёт к синему краю: ${kt.map((v, i) => lamK[i] + " нм: " + v.toExponential(2)).join(", ")} (отношение 400/800 = ${(kt[0] / kt[4]).toFixed(0)})`);
  const dn = nk.n.map((v, i) => v - nk0.n[i]);
  console.log(`   вклад хвоста в n (КК): ${dn.map((v, i) => lamK[i] + " нм: " + v.toExponential(2)).join(", ")}`);
}

// ================================================================ 8. Задняя сторона подложки: некогерентное сложение пучков
console.log("\n7. Задняя сторона подложки: матричный метод (r, t, r′, t′), тождество обращённой стопки, классическая формула для пластины, предел f → 0");
{
  const lam = []; for (let l = 400; l <= 800; l += 4) lam.push(l);
  const m = E.MATERIALS.tio2, Nsub = E.substrateN("bk7", lam), phi = 65, layers = E.buildLayers(lam, 1017.3, m, -0.008, 2.2, 40);
  // (а) f → 0: N, C, S матричного метода совпадают с рекурсией Эйри
  const a = E.ncsBackside(lam, layers, Nsub, phi, { f: 1e-300, ds: 1e6 }); const [RP, RS] = E.rhoStack(lam, layers, Nsub, phi); const q = E.ncsFromR(RP, RS);
  let d0 = 0; for (let i = 0; i < lam.length; i++) d0 = Math.max(d0, Math.abs(a.N[i] - q.N[i]), Math.abs(a.C[i] - q.C[i]), Math.abs(a.S[i] - q.S[i]));
  check(d0 < 1e-12, `f → 0: N, C, S матричного метода с некогерентной суммой совпадают с рекурсией Эйри (42 слоя): max разность ${d0.toExponential(1)}`);
  // (б) r′, t′ из тождества M′ = J Mᵀ J против прямого расчёта обращённой стопки (свет из подложки, слои в обратном порядке, «подложка» — воздух)
  let worst = 0;
  for (const i of [0, 25, 50, 100]) {
    const L = layers.map(Lr => ({ N: Lr.N[i], d: Lr.d })), ns = Nsub[i], cf = E.stackCoefs(lam[i], L, ns, phi);
    const alpha2 = Math.sin(phi * PI / 180) ** 2, k = 2 * PI / lam[i];
    for (const pol of ["s", "p"]) {
      const qOf = (N) => { const c = cosGamma(N, alpha2); return pol === "s" ? C.mul(N, c) : C.div(N, c); };
      const matOf = (Ls) => { let M = [[C.ONE, [0, 0]], [[0, 0], C.ONE]]; for (const Lr of Ls) { const c = cosGamma(Lr.N, alpha2), ph = C.scale(C.mul(Lr.N, c), k * Lr.d), qj = qOf(Lr.N), cp = C.cos(ph), sp = C.sin(ph); const Mj = [[cp, C.div(C.mul(C.I, sp), qj)], [C.mul(C.mul(C.I, qj), sp), cp]]; M = [[C.add(C.mul(M[0][0], Mj[0][0]), C.mul(M[0][1], Mj[1][0])), C.add(C.mul(M[0][0], Mj[0][1]), C.mul(M[0][1], Mj[1][1]))], [C.add(C.mul(M[1][0], Mj[0][0]), C.mul(M[1][1], Mj[1][0])), C.add(C.mul(M[1][0], Mj[0][1]), C.mul(M[1][1], Mj[1][1]))]]; } return M; };
      const Mr = matOf(L.slice().reverse()), qa = pol === "s" ? [Math.cos(phi * PI / 180), 0] : [1 / Math.cos(phi * PI / 180), 0], qs = qOf(ns);
      const a11 = C.mul(qs, Mr[0][0]), a12 = C.mul(C.mul(qs, qa), Mr[0][1]), a22 = C.mul(qa, Mr[1][1]), a21 = Mr[1][0], den = C.add(C.add(a11, a12), C.add(a22, a21));
      const rP = C.div(C.sub(C.add(a11, a12), C.add(a22, a21)), den), tP = C.div(C.scale(qs, 2), den);
      worst = Math.max(worst, C.abs(C.sub(rP, cf[pol].rb)), C.abs(C.sub(tP, cf[pol].tb)));
    }
  }
  check(worst < 1e-12, `r′, t′ (отражение и пропускание стопки со стороны подложки) из M′ = J Mᵀ J против прямого расчёта обращённой стопки: max расхождение ${worst.toExponential(1)}`);
  // (в) голая пластина BK7: R_tot = R + T T_b R_b/(1 − R_b²) — классическая некогерентная сумма
  let dc = 0;
  { const i = 50, cf = E.stackCoefs(lam[i], [], Nsub[i], phi);
    for (const pol of ["s", "p"]) { const c = cf[pol], R = C.abs2(c.r), qa = c.qa[0], qs = c.qs[0], T = qs / qa * C.abs2(c.t), rb = (qs - qa) / (qs + qa), Rb = rb * rb, Tb = qa / qs * C.abs2(c.tb);
      const classic = R + T * Tb * Rb / (1 - Rb * Rb), core = R + C.abs2(C.mul(c.t, c.tb)) * Rb / (1 - C.abs2(c.rb) * Rb); dc = Math.max(dc, Math.abs(classic - core), Math.abs(T * Tb - C.abs2(C.mul(c.t, c.tb)))); } }
  const bare0 = E.modelPsiDelta(lam, Nsub, phi, 0, m, 0, 0, 1, null), bare1 = E.modelPsiDelta(lam, Nsub, phi, 0, m, 0, 0, 1, { f: 1, ds: 1e6 });
  check(dc < 1e-12, `голая пластина BK7, 65°: |t t′|² = T·T_b и R_tot = R + T T_b R_b/(1 − R_b²) для s и p (расхождение ${dc.toExponential(1)}); Ψ при 550 нм ${bare0.psi[37].toFixed(3)}° → ${bare1.psi[37].toFixed(3)}° при f = 1, Δ = ${bare1.del[37].toFixed(1)}°`);
  // (г) величина эффекта и поглощающая подложка
  const f0 = E.modelPsiDelta(lam, Nsub, phi, 1017.3, m, -0.008, 2.2, 40, null), f1 = E.modelPsiDelta(lam, Nsub, phi, 1017.3, m, -0.008, 2.2, 40, { f: 1, ds: 1e6 });
  let dP = 0, dD = 0; for (let i = 0; i < lam.length; i++) { dP = Math.max(dP, Math.abs(f0.psi[i] - f1.psi[i])); dD = Math.max(dD, Math.abs(wrap(f0.del[i] - f1.del[i]))); }
  const NsSi = E.substrateN("si", lam), s1 = E.modelPsiDelta(lam, NsSi, 70, 612.5, E.MATERIALS.si3n4, 0, 0, 1, null), s2 = E.modelPsiDelta(lam, NsSi, 70, 612.5, E.MATERIALS.si3n4, 0, 0, 1, { f: 1, ds: 5e5 });
  let dS = 0; for (let i = 0; i < lam.length; i++) dS = Math.max(dS, Math.abs(s1.psi[i] - s2.psi[i]));
  check(dP > 1 && dS < 1e-9, `TiO₂ 1017 нм / BK7, 65°, f = 1: max|ΔΨ| = ${dP.toFixed(2)}°, max|ΔΔ| = ${dD.toFixed(1)}° (сотни σ — без учёта задней стороны фит невозможен); Si₃N₄ / c-Si 0.5 мм: |ΔΨ| = ${dS.toExponential(1)}° — поглощающая подложка гасит вклад`);
  // (д) численный якобиан при задней стороне против аналитического при f → 0
  const lam2 = []; for (let l = 400; l <= 800; l += 2) lam2.push(l);
  const Ns2 = E.substrateN("bk7", lam2), sig = lam2.map(() => 0.02), sigD = sig.map(v => 2.2 * v), free = ["d", "A", "Auv", "Eg", "dRough", "delta", "Ak"], P = { d: 1017.3, A: 262, Auv: 131, Eg: 3.37, dRough: 2.2, delta: -0.008, Ak: 0.05 };
  const m0 = E.modelPsiDelta(lam2, Ns2, phi, P.d, Object.assign({}, m, { A: P.A, Auv: P.Auv, Eg: P.Eg, Ak: P.Ak }), P.delta, P.dRough, 40, null);
  const data = { lam: lam2, psi: m0.psi.map(v => v + 0.1), del: m0.del.map(v => (v + 1) % 360), sigPsi: sig, sigDel: sigD };
  const fnA = E.makeResidJacFn(data, { mat: m, subKey: "bk7", Nsub: Ns2, phi, back: null }, free, {}, 40), fnN = E.makeResidJacFn(data, { mat: m, subKey: "bk7", Nsub: Ns2, phi, back: { f: 1e-12, ds: 1e6 } }, free, {}, 40);
  const x0 = free.map(k => P[k]), evA = fnA(x0, true), evN = fnN(x0, true);
  let wj = 0; for (let p = 0; p < free.length; p++) { let mx = 0, nrm = 0; for (let i = 0; i < evA.r.length; i++) { mx = Math.max(mx, Math.abs(evA.J[p][i] - evN.J[p][i])); nrm = Math.max(nrm, Math.abs(evA.J[p][i])); } wj = Math.max(wj, mx / nrm); }
  check(wj < 1e-4, `численный якобиан (центральные разности, используется при включённой задней стороне) против аналитического при f → 0: max относительное расхождение ${wj.toExponential(1)}`);
}

// ================================================================ 9. Спектральная полоса: синтез и модель против прямой свёртки в точке
console.log("\n8. Спектральная полоса прибора: усреднение интенсивностей I_p, I_s, r_p r_s* (а не N, C, S) — синтез и модель фита против прямой свёртки в точке (шаг 0.02 нм)");
{
  const lam = []; for (let l = 400; l <= 800; l += 2) lam.push(l);
  const sigP = lam.map(l => 0.015 + 0.02 * Math.max(0, (650 - l) / 250) ** 2);
  const refBand = (sub, phi, d, m, delta, dRough, bw, off, back, pts) => {           // эталон: свёртка I_p, I_s, Z в каждой точке прибора
    const sg = bw / 2.3548, h = 0.02, half = Math.ceil(4 * sg / h), psi = [], del = [];
    for (const l of pts) {
      const lf = [], w = []; let ws = 0;
      for (let j = -half; j <= half; j++) { lf.push(l + off + j * h); const g = Math.exp(-0.5 * (j * h / sg) ** 2); w.push(g); ws += g; }
      const Nsub = E.substrateN(sub, lf), layers = E.buildLayers(lf, d, m, delta, dRough, back ? 160 : 40);
      const R = back ? E.ncsBackside(lf, layers, Nsub, phi, back) : E.muellerFromR(...E.rhoStack(lf, layers, Nsub, phi));
      let ip = 0, is = 0, zr = 0, zi = 0; for (let j = 0; j < lf.length; j++) { ip += R.Ip[j] * w[j]; is += R.Is[j] * w[j]; zr += R.Zr[j] * w[j]; zi += R.Zi[j] * w[j]; }
      psi.push(0.5 * Math.acos((is - ip) / (ip + is)) * 180 / PI); let dd = Math.atan2(zi, zr) * 180 / PI; if (dd < 0) dd += 360; del.push(dd);
    }
    return { psi, del };
  };
  const cases = [["TiO₂/BK7 65°, 1017 нм, δ −0.8 %, ЭС 2.2 нм, полоса 1.2 нм", "tio2", "bk7", 65, 1017.3, -0.008, 2.2, 1.2, 0.06, null],
    ["Nb₂O₅/BK7 60°, 1188 нм, δ +1.2 %, полоса 1.4 нм", "nb2o5", "bk7", 60, 1188.0, 0.012, 0, 1.4, 0.03, null],
    ["HfO₂/c-Si 65°, 933 нм, δ +0.5 %, ЭС 0.9 нм, полоса 1.2 нм", "hfo2", "si", 65, 933.0, 0.005, 0.9, 1.2, 0.05, null],
    ["ZrO₂/кварц 65°, 780 нм, задняя сторона f = 0.96, полоса 1.0 нм", "zro2", "silica", 65.01, 780.4, -0.006, 1.0, 1.0, -0.03, { f: 0.96, ds: 1e6 }]];
  for (const [name, mat, sub, phi, d, delta, dRough, bw, off, back] of cases) {
    const m = E.MATERIALS[mat], idx = []; for (let i = 0; i < lam.length; i += 5) idx.push(i); const pts = idx.map(i => lam[i]);
    const ref = refBand(sub, phi, d, m, delta, dRough, bw, off, back, pts);
    const app = E.synthesizeClean(lam, sub, phi, d, m, delta, dRough, { bw, lamOffset: off, back });
    const old = (() => {                                                                     // прежний способ: свёртка нормированных N, C, S
      const sg = bw / 2.3548, h = 0.02, half = Math.ceil(4 * sg / h), psi = [], del = [];
      for (const l of pts) { const lf = [], w = []; let ws = 0; for (let j = -half; j <= half; j++) { lf.push(l + off + j * h); const g = Math.exp(-0.5 * (j * h / sg) ** 2); w.push(g); ws += g; }
        const Nsub = E.substrateN(sub, lf), layers = E.buildLayers(lf, d, m, delta, dRough, back ? 160 : 40), R = back ? E.ncsBackside(lf, layers, Nsub, phi, back) : E.ncsFromR(...E.rhoStack(lf, layers, Nsub, phi));
        let n = 0, c = 0, s = 0; for (let j = 0; j < lf.length; j++) { n += R.N[j] * w[j]; c += R.C[j] * w[j]; s += R.S[j] * w[j]; }
        psi.push(0.5 * Math.acos(n / ws) * 180 / PI); let dd = Math.atan2(s, c) * 180 / PI; if (dd < 0) dd += 360; del.push(dd); }
      return { psi, del };
    })();
    const lamOff = lam.map(l => l + off), mod = E.modelPsiDelta(lamOff, E.substrateN(sub, lamOff), phi, d, m, delta, dRough, back ? 160 : 40, back, { bw, subKey: sub });
    let dA = [0, 0], dM = [0, 0], dO = [0, 0];
    idx.forEach((i, q) => { dA = [Math.max(dA[0], Math.abs(app.psi[i] - ref.psi[q])), Math.max(dA[1], Math.abs(wrap(app.del[i] - ref.del[q])))];
      dM = [Math.max(dM[0], Math.abs(mod.psi[i] - ref.psi[q])), Math.max(dM[1], Math.abs(wrap(mod.del[i] - ref.del[q])))];
      dO = [Math.max(dO[0], Math.abs(old.psi[q] - ref.psi[q])), Math.max(dO[1], Math.abs(wrap(old.del[q] - ref.del[q])))]; });
    check(dA[0] < 2e-3 && dA[1] < 1.5e-2, `${name}: синтез — max|ΔΨ| ${dA[0].toExponential(1)}°, max|ΔΔ| ${dA[1].toExponential(1)}° (свёртка N, C, S дала бы ${dO[0].toExponential(1)}°, ${dO[1].toExponential(1)}°)`);
    check(dM[0] < 3e-3 && dM[1] < 2e-2, `   модель фита с полосой (второй порядок, три сетки λ): max|ΔΨ| ${dM[0].toExponential(1)}°, max|ΔΔ| ${dM[1].toExponential(1)}°`);
  }
}

// ================================================================ 10. Якобиан с полосой, производные в нуле, край Тауца–Лоренца, k₄₀₀
console.log("\n9. Аналитический якобиан с полосой в модели; производные по δ и d_r в нуле; ε₁ при E = E_g; k₄₀₀ по найденной дисперсии");
{
  const lam = []; for (let l = 400; l <= 800; l += 2) lam.push(l);
  const sig = lam.map(l => 0.015 + 0.02 * Math.max(0, (650 - l) / 250) ** 2), sigD = sig.map(v => 2.2 * v);
  const free = ["d", "A", "Auv", "Eg", "dRough", "delta", "Ak"], hs = { d: 1e-2, A: 4e-3, Auv: 4e-3, Eg: 4e-6, dRough: 4e-4, delta: 2e-5, Ak: 2e-4 };
  for (const [subKey, phi, matKey, P, bw] of [["bk7", 65, "tio2", { d: 1017.3, A: 262, Auv: 131, Eg: 3.37, dRough: 2.2, delta: -0.008, Ak: 0.05 }, 1.2], ["si", 70, "si3n4", { d: 612.5, A: 160, Auv: 100, Eg: 4.65, dRough: 0.9, delta: 0.05, Ak: 0.3 }, 1.0]]) {
    const mat = E.MATERIALS[matKey], cfg = { mat, subKey, Nsub: E.substrateN(subKey, lam), phi, band: { bw, subKey } };
    const m0 = E.modelPsiDelta(lam, cfg.Nsub, phi, P.d, Object.assign({}, mat, { A: P.A, Auv: P.Auv, Eg: P.Eg, Ak: P.Ak }), P.delta, P.dRough, 40, null, cfg.band);
    const data = { lam, psi: m0.psi.map(v => v + 0.1), del: m0.del.map(v => (v + 1) % 360), sigPsi: sig, sigDel: sigD };
    const fn = E.makeResidJacFn(data, cfg, free, {}, 40), x0 = free.map(k => P[k]), ev = fn(x0, true);
    let worst = 0;
    for (let p = 0; p < free.length; p++) {
      const h = hs[free[p]], xp = x0.slice(), xm = x0.slice(); xp[p] += h; xm[p] -= h;
      const rp = fn(xp, false).r, rm = fn(xm, false).r; let maxAbs = 0, norm = 0;
      for (let i = 0; i < rp.length; i++) { const num = (rp[i] - rm[i]) / (2 * h); maxAbs = Math.max(maxAbs, Math.abs(num - ev.J[p][i])); norm = Math.max(norm, Math.abs(num)); }
      worst = Math.max(worst, maxAbs / norm);
    }
    check(worst < 1e-5, `${mat.name} на ${subKey}, ${phi}°, полоса ${bw} нм в модели, 7 параметров: макс. относительное расхождение с разностями ${worst.toExponential(1)}`);
  }
  // производные по δ и d_r в нуле (раньше — тождественный ноль)
  const free0 = ["d", "A", "Auv", "Eg", "dRough", "delta"], mat = E.MATERIALS.tio2, cfg0 = { mat, subKey: "bk7", Nsub: E.substrateN("bk7", lam), phi: 65 };
  const P0 = { d: 1017.3, A: 262, Auv: 131, Eg: 3.37, dRough: 0, delta: 0 };
  const m00 = E.modelPsiDelta(lam, cfg0.Nsub, 65, P0.d, Object.assign({}, mat, { A: P0.A, Auv: P0.Auv, Eg: P0.Eg }), 0, 0, 40);
  const data0 = { lam, psi: m00.psi.map(v => v + 0.1), del: m00.del.map(v => (v + 1) % 360), sigPsi: sig, sigDel: sigD };
  const fn0 = E.makeResidJacFn(data0, cfg0, free0, {}, 40), x00 = free0.map(k => P0[k]), ev0 = fn0(x00, true);
  for (const [k, h] of [["dRough", 1e-4], ["delta", 1e-5]]) {
    const p = free0.indexOf(k), xp = x00.slice(), xm = x00.slice(); xp[p] += h; if (k !== "dRough") xm[p] -= h;
    const rp = fn0(xp, false).r, rm = fn0(xm, false).r, hh = xp[p] - xm[p]; let maxAbs = 0, norm = 0, normJ = 0;
    for (let i = 0; i < rp.length; i++) { const num = (rp[i] - rm[i]) / hh; maxAbs = Math.max(maxAbs, Math.abs(num - ev0.J[p][i])); norm = Math.max(norm, Math.abs(num)); normJ = Math.max(normJ, Math.abs(ev0.J[p][i])); }
    check(normJ > 0 && maxAbs / norm < 1e-3, `∂r/∂${k} в точке ${k} = 0 (свободный параметр): max|аналит.| = ${normJ.toExponential(2)}, расхождение с разностями ${(maxAbs / norm).toExponential(1)}`);
  }
  const [e1, e2] = E.tlEps(3.4, 255.83, 4.0, 1.77, 3.4), [f1] = E.tlEps(3.4 + 1e-7, 255.83, 4.0, 1.77, 3.4);
  check(isFinite(e1) && isFinite(e2) && Math.abs(e1 - f1) < 1e-4, `Тауц–Лоренц при E = E_g: ε₁ = ${e1.toFixed(6)} (конечно; при E = E_g + 10⁻⁷ эВ: ${f1.toFixed(6)}), ε₂ = ${e2}`);
  // k₄₀₀ по найденной дисперсии: бесшумный CeO₂/Si
  const c0 = E.MATERIALS.ceo2, mT = Object.assign({}, c0, { A: c0.A * 1.02, Auv: c0.Auv * 0.98, E0: 3.94, C: 0.91, Eg: 2.79 }); mT.Ak = E.tailAk(mT, 1.2e-3);
  const cfgC = { mat: Object.assign({}, c0, { E0: 3.94, C: 0.91 }), subKey: "si", Nsub: E.substrateN("si", lam), phi: 65 }, prior = { dMin: 855, dMax: 945 };
  const cl = E.synthesizeClean(lam, "si", 65, 887.5, mT, -0.010, 0, { bw: 0 });
  const dC = { lam, psi: Array.from(cl.psi), del: Array.from(cl.del), sigPsi: sig, sigDel: sig.map((v, i) => 2.2 * v / Math.max(Math.sin(2 * cl.psi[i] * PI / 180), 0.15)) };
  const rf = E.referenceFit(dC, cfgC, prior), fin = E.finalFit(dC, cfgC, prior, { grad: true, rough: false, abs: true }, Object.assign({}, rf.P, { delta: -0.009, Ak: E.tailAk(cfgC.mat, 1e-3), starts: rf.starts, startCosts: rf.startCosts }));
  check(Math.abs(fin.P.k400 - 1.2e-3) < 2e-5 && Math.abs(fin.P.d - 887.5) < 1e-2, `CeO₂/c-Si без шума, хвост k₄₀₀ = 1.2·10⁻³: найдено k₄₀₀ = ${(1000 * fin.P.k400).toFixed(3)}·10⁻³ по найденной дисперсии (по справочной было бы ${(1000 * E.tailK400(cfgC.mat, fin.P.Ak)).toFixed(3)}·10⁻³), d = ${fin.P.d.toFixed(3)}, δ = ${(100 * fin.P.delta).toFixed(3)} %`);
}

// ================================================================ 11. Таблицы кремния
console.log("\n10. Таблицы кремния: узлы источников и гладкость интерполяции");
{
  const g = E.substrateN("si", [400, 500, 1000]), a = E.substrateN("si_aspnes", [399.9, 495.9, 826.6]);
  check(Math.abs(g[0][0] - 5.613) < 1e-9 && Math.abs(-g[0][1] - 0.296) < 1e-9 && Math.abs(g[1][0] - 4.294) < 1e-9 && Math.abs(g[2][0] - 3.572) < 1e-9,
    `Green 2008: n(400) = ${g[0][0].toFixed(3)}, k(400) = ${(-g[0][1]).toFixed(3)}; n(500) = ${g[1][0].toFixed(3)}; n(1000) = ${g[2][0].toFixed(3)} — узлы источника`);
  check(Math.abs(a[0][0] - 5.570) < 1e-3 && Math.abs(-a[0][1] - 0.387) < 1e-3 && Math.abs(a[1][0] - 4.320) < 1e-3 && Math.abs(a[2][0] - 3.673) < 1e-3,
    `Aspnes–Studna: n(3.1 эВ) = ${a[0][0].toFixed(3)}, k = ${(-a[0][1]).toFixed(3)}; n(2.5 эВ) = ${a[1][0].toFixed(3)}; n(1.5 эВ) = ${a[2][0].toFixed(3)} — узлы источника`);
  let jump = 0; const fine = []; for (let l = 400; l <= 1000; l += 0.5) fine.push(l); const nk = E.substrateN("si", fine);
  for (let i = 1; i < fine.length; i++) jump = Math.max(jump, Math.abs(nk[i][0] - nk[i - 1][0]));
  check(jump < 0.02, `кубическая интерполяция Green по 0.5 нм: макс. скачок n между соседними точками ${jump.toExponential(1)} (гладко)`);
  const old420 = 5.010, new420 = E.substrateN("si", [420])[0][0], asp420 = E.substrateN("si_aspnes", [420])[0][0];
  console.log(`   прежняя таблица v1.2.0 при 420 нм: n = ${old420} против Aspnes ${asp420.toFixed(3)} и Green ${new420.toFixed(3)} — расхождение 0.08–0.11 (до 0.25° по Ψ голого Si)`);
}

console.log(failures ? `\nОШИБОК: ${failures}` : "\nВсе проверки по книге пройдены");
process.exit(failures ? 1 : 0);
