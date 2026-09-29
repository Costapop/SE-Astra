#!/usr/bin/env node
/* Генерация девяти встроенных тестовых образцов (examples/examples.json): пять прозрачных оксидов/нитрида,
   три материала с краем поглощения (SiNₓ:H, WO₃, CeO₂), у которых в истине есть хвост поглощения (k400 > 0),
   и один образец на плоскопараллельной подложке с заданной долей отражения от задней стороны (back).
   Детерминировано: те же зёрна → те же спектры. Истина каждого образца хранится рядом со спектром
   и в приложении используется только для сверки на шаге 4. */
const fs = require("fs"), path = require("path");
const E = require("../src/ellip_core.js");
const sigModel = (l) => 0.015 + 0.020 * Math.max(0, (650 - l) / 250) ** 2;      // σΨ(λ): 0.015° на красном краю, до 0.035° при 400 нм
const grid = (a, b, s) => { const o = []; for (let l = a; l <= b + 1e-9; l += s) o.push(Math.round(l * 1000) / 1000); return o; };
const defs = [
  { id: "ex1", file: "01_TiO2_on_BK7_65deg.xlsx", title: "TiO₂ на BK7, 65°", mat: "tio2", sub: "bk7", phi: 65.0, dNom: 1000, dRange: 5, lam: grid(400, 800, 2),
    truth: { d: 1017.3, delta: -0.008, dRough: 2.2, phiTrue: 65.02, bw: 1.2, off: 0.06, mp: { A: 1.024, Auv: 0.955, E0: 4.04, C: 1.82, Eg: 3.37 } }, seed: 101 },
  { id: "ex2", file: "02_Ta2O5_on_fused_silica_60deg.xlsx", title: "Ta₂O₅ на плавленом кварце, 60°", mat: "ta2o5", sub: "silica", phi: 60.0, dNom: 850, dRange: 6, lam: grid(400, 800, 2),
    truth: { d: 862.4, delta: 0.0, dRough: 1.6, phiTrue: 59.98, bw: 1.0, off: -0.04, mp: { A: 0.97, Auv: 1.0, E0: 5.25, C: 2.70, Eg: 4.15 } }, seed: 202 },
  { id: "ex3", file: "03_Nb2O5_on_BK7_60deg.xlsx", title: "Nb₂O₅ на BK7, 60°", mat: "nb2o5", sub: "bk7", phi: 60.0, dNom: 1200, dRange: 5, lam: grid(420, 800, 2),
    truth: { d: 1188.0, delta: 0.012, dRough: 0.0, phiTrue: 60.03, bw: 1.4, off: 0.03, mp: { A: 1.035, Auv: 0.96, E0: 4.72, C: 2.25, Eg: 3.78 } }, seed: 303 },
  { id: "ex4", file: "04_Si3N4_on_Si_70deg.xlsx", title: "Si₃N₄ на кремнии, 70°", mat: "si3n4", sub: "si", phi: 70.0, dNom: 600, dRange: 6, lam: grid(400, 800, 2),
    truth: { d: 612.5, delta: 0.0, dRough: 0.0, phiTrue: 70.01, bw: 1.0, off: -0.02, mp: { A: 1.03, Auv: 0.98, E0: 7.10, C: 3.50, Eg: 4.70 } }, seed: 404 },
  { id: "ex5", file: "05_HfO2_on_Si_65deg.xlsx", title: "HfO₂ на кремнии, 65°", mat: "hfo2", sub: "si", phi: 65.0, dNom: 950, dRange: 6, lam: grid(400, 800, 2),
    truth: { d: 933.0, delta: 0.005, dRough: 0.9, phiTrue: 64.99, bw: 1.2, off: 0.05, mp: { A: 0.985, Auv: 1.04, E0: 6.15, C: 2.85, Eg: 5.16 } }, seed: 505 },
  // материалы с краем поглощения в диапазоне; k400 — k хвоста поглощения при 400 нм (дефект «поглощение»)
  { id: "ex6", file: "06_SiNx_on_fused_silica_65deg.xlsx", title: "SiNₓ:H (обогащённый Si) на плавленом кварце, 65°", mat: "sinx", sub: "silica", phi: 65.0, dNom: 700, dRange: 6, lam: grid(400, 800, 2),
    truth: { d: 712.6, delta: 0.0, dRough: 0.0, k400: 2.5e-3, phiTrue: 65.02, bw: 1.1, off: 0.03, mp: { A: 1.03, Auv: 0.97, E0: 7.42, C: 3.30, Eg: 2.14 } }, seed: 606 },
  { id: "ex7", file: "07_WO3_on_BK7_60deg.xlsx", title: "WO₃ на BK7, 60° (350–800 нм)", mat: "wo3", sub: "bk7", phi: 60.0, dNom: 850, dRange: 5, lam: grid(350, 800, 2),
    truth: { d: 838.2, delta: 0.0, dRough: 1.5, k400: 2.0e-3, phiTrue: 60.02, bw: 1.2, off: 0.04, mp: { A: 1.02, Auv: 0.98, E0: 4.45, C: 1.24, Eg: 3.23 } }, seed: 707 },
  { id: "ex8", file: "08_CeO2_on_Si_65deg.xlsx", title: "CeO₂ на кремнии, 65°", mat: "ceo2", sub: "si", phi: 65.0, dNom: 900, dRange: 5, lam: grid(400, 800, 2),
    truth: { d: 887.5, delta: -0.010, dRough: 0.0, k400: 1.2e-3, phiTrue: 65.03, bw: 1.0, off: 0.05, mp: { A: 1.02, Auv: 0.98, E0: 3.94, C: 0.91, Eg: 2.79 } }, seed: 808 },
  // задняя сторона подложки: back — заданная доля (независимое измерение) с неопределённостью, truth.back — истинная
  { id: "ex9", file: "09_ZrO2_on_fused_silica_1mm_backside_65deg.xlsx", title: "ZrO₂ на плавленом кварце 1 мм с задней стороной, 65°", mat: "zro2", sub: "silica", phi: 65.0, dNom: 800, dRange: 5, lam: grid(400, 800, 2),
    back: { f: 0.95, ds: 1e6, ferr: 0.02 },
    truth: { d: 780.4, delta: -0.006, dRough: 1.0, phiTrue: 65.01, bw: 1.0, off: -0.03, back: { f: 0.96, ds: 1e6 }, mp: { A: 1.015, Auv: 1.03, E0: 5.98, C: 3.04, Eg: 4.96 } }, seed: 909 },
];
const out = [];
for (const D of defs) {
  const m0 = E.MATERIALS[D.mat];
  const m = Object.assign({}, m0, { A: m0.A * D.truth.mp.A, Auv: m0.Auv * D.truth.mp.Auv, E0: D.truth.mp.E0, C: D.truth.mp.C, Eg: D.truth.mp.Eg });
  if (D.truth.k400) m.Ak = E.tailAk(m, D.truth.k400);                              // хвост поглощения в истине
  const rng = E.makeRng(D.seed);
  const clean = E.synthesize(D.lam, D.sub, D.truth.phiTrue, D.truth.d, m, D.truth.delta, D.truth.dRough, { bw: D.truth.bw, lamOffset: D.truth.off, back: D.truth.back || null }, rng);
  const sigP = D.lam.map(sigModel), sigD = sigP.map((v, i) => 2.2 * v / Math.max(Math.sin(2 * clean.psi[i] * Math.PI / 180), 0.15));
  const s = E.synthesize(D.lam, D.sub, D.truth.phiTrue, D.truth.d, m, D.truth.delta, D.truth.dRough,
    { bw: D.truth.bw, lamOffset: D.truth.off, back: D.truth.back || null, driftPsi: [rng.range(-0.01, 0.01), rng.range(-0.015, 0.015)], driftDel: [rng.range(-0.03, 0.03), rng.range(-0.04, 0.04)], sigPsi: sigP, sigDel: sigD }, rng);
  const nk = E.filmNK([450, 550, 650, 750], m);
  const truth = { d: D.truth.d, delta: D.truth.delta, dRough: D.truth.dRough, phiTrue: D.truth.phiTrue, bw: D.truth.bw, lamOffset: D.truth.off, mat: m, n: { 450: nk.n[0], 550: nk.n[1], 650: nk.n[2], 750: nk.n[3] } };
  if (D.truth.k400) { truth.k400 = D.truth.k400; truth.k = { 450: nk.k[0], 550: nk.k[1], 650: nk.k[2], 750: nk.k[3] }; }   // старые образцы без этих полей — байт в байт как раньше
  if (D.truth.back) truth.back = D.truth.back;
  const rec = { id: D.id, file: D.file, title: D.title, mat: D.mat, sub: D.sub, phi: D.phi, dNom: D.dNom, dRange: D.dRange, bw: D.truth.bw };
  if (D.back) rec.back = D.back;
  out.push(Object.assign(rec, { lam: D.lam, psi: Array.from(s.psi).map(v => +v.toFixed(4)), del: Array.from(s.del).map(v => +v.toFixed(4)), sigPsi: sigP.map(v => +v.toFixed(4)), sigDel: sigD.map(v => +v.toFixed(4)), truth }));
  console.log(D.id, D.title, "Ψ", Math.min(...s.psi).toFixed(1), "–", Math.max(...s.psi).toFixed(1), D.truth.k400 ? `k хвоста(400) = ${D.truth.k400}, k плёнки(450/550) = ${nk.k[0].toFixed(4)}/${nk.k[1].toFixed(4)}` : "", D.truth.back ? `задняя сторона: истина ${D.truth.back.f}, задано ${D.back.f} ± ${D.back.ferr}` : "");
}
const file = path.join(__dirname, "../examples/examples.json");
if (process.argv.includes("--check")) {
  const old = JSON.parse(fs.readFileSync(file, "utf8"));
  const same = JSON.stringify(old) === JSON.stringify(out);
  console.log(same ? "examples.json воспроизведён точно" : "ВНИМАНИЕ: examples.json отличается от сгенерированного");
  process.exit(same ? 0 : 1);
}
fs.writeFileSync(file, JSON.stringify(out));
console.log("записано", file);
