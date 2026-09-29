/* Эллипсометрия тонкой плёнки: физика, синтез, фит и ИИ-модель на остатках.
   Конвенция: N = n - ik, фазовый множитель exp(-2iβ), ρ = r_p/r_s = tanΨ·exp(iΔ) (Аззам–Башара). */
(function (root) {
  'use strict';
  const HC = 1239.841984;
  const PI = Math.PI;

  // ---------------------------------------------------------------- комплексные числа [re, im]
  const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const cdiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
  const cadd = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const csub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const cabs2 = (a) => a[0] * a[0] + a[1] * a[1];
  function csqrt(a) { const r = Math.hypot(a[0], a[1]); let re = Math.sqrt(Math.max(0, (r + a[0]) / 2)); let im = Math.sqrt(Math.max(0, (r - a[0]) / 2)); if (a[1] < 0) im = -im; return [re, im]; }
  function cexp(a) { const e = Math.exp(a[0]); return [e * Math.cos(a[1]), e * Math.sin(a[1])]; }

  // ---------------------------------------------------------------- дисперсия: Тауц–Лоренц + УФ-полюс (ε∞ = 1)
  function tlEps(E, A, E0, C, Eg) {
    const E2 = E * E, E02 = E0 * E0, C2 = C * C, Eg2 = Eg * Eg;
    const eps2 = E > Eg ? A * E0 * C * (E - Eg) * (E - Eg) / (((E2 - E02) * (E2 - E02) + C2 * E2) * E) : 0;
    const aln = (Eg2 - E02) * E2 + Eg2 * C2 - E02 * (E02 + 3 * Eg2);
    const aatan = (E2 - E02) * (E02 + Eg2) + Eg2 * C2;
    const alpha = Math.sqrt(4 * E02 - C2), gamma2 = E02 - C2 / 2;
    const zeta4 = (E2 - gamma2) * (E2 - gamma2) + alpha * alpha * C2 / 4;
    // При E → E_g оба логарифма расходятся, но их сумма ∝ (E − E_g)² ln|E − E_g| → 0; в точке E = E_g получалось 0·(−∞) = NaN — ограничиваем |E − E_g| снизу
    const dEg = Math.max(Math.abs(E - Eg), 1e-9);
    const eps1 = A * C * aln / (2 * PI * zeta4 * alpha * E0) * Math.log((E02 + Eg2 + alpha * Eg) / (E02 + Eg2 - alpha * Eg))
      - A * aatan / (PI * zeta4 * E0) * (PI - Math.atan((2 * Eg + alpha) / C) + Math.atan((-2 * Eg + alpha) / C))
      + 2 * A * E0 * Eg * (E2 - gamma2) / (PI * zeta4 * alpha) * (PI + 2 * Math.atan(2 * (gamma2 - Eg2) / (alpha * C)))
      - A * E0 * C * (E2 + Eg2) / (PI * zeta4 * E) * Math.log(dEg / (E + Eg))
      + 2 * A * E0 * C * Eg / (PI * zeta4) * Math.log(dEg * (E + Eg) / Math.sqrt((E02 - Eg2) * (E02 - Eg2) + Eg2 * C2));
    return [eps1, eps2];
  }
  /** Хвост поглощения ниже края (дефект «поглощение»): второй осциллятор Тауца–Лоренца с теми же E₀ и C, что у материала,
   *  порогом E_t = TAIL_ET и силой m.Ak (эВ). ε₂ хвоста ∝ (E − E_t)²/E · L(E) растёт к синему краю; ε₁ — то же КК-выражение
   *  Джеллисона–Модина, поэтому хвост причинен. При m.Ak = 0 (или undefined) дисперсия совпадает с чистым материалом. */
  const TAIL_ET = 1.2;
  /** Комплексный показатель плёнки в конвенции n - ik: массив [n, -k] на каждой λ. */
  function filmN(lam, m) {
    const out = new Array(lam.length), Ak = m.Ak || 0;
    for (let i = 0; i < lam.length; i++) {
      const E = HC / lam[i];
      const [e1, e2] = tlEps(E, m.A, m.E0, m.C, m.Eg);
      let eps1 = 1 + e1 + m.Auv / (m.Euv * m.Euv - E * E), eps2 = e2;
      if (Ak) { const [t1, t2] = tlEps(E, Ak, m.E0, m.C, TAIL_ET); eps1 += t1; eps2 += t2; }
      const N = csqrt([eps1, eps2]);
      out[i] = [N[0], -Math.abs(N[1])];
    }
    return out;
  }
  function filmNK(lam, m) { const N = filmN(lam, m); return { n: N.map(v => v[0]), k: N.map(v => -v[1]) }; }
  /** k хвоста поглощения при 400 нм (k плёнки с хвостом минус k чистого материала) — характерный размер дефекта «поглощение». */
  function tailK400(m, Ak) {
    const k1 = filmNK([400], Object.assign({}, m, { Ak: Ak })).k[0], k0 = filmNK([400], Object.assign({}, m, { Ak: 0 })).k[0];
    return k1 - k0;
  }
  /** Обратное к tailK400: сила хвоста A_k (эВ), дающая заданный k хвоста при 400 нм (монотонная зависимость; Ньютон). */
  function tailAk(m, k400) {
    if (!(k400 > 0)) return 0;
    let Ak = k400 / Math.max(1e-12, tailK400(m, 1e-3) / 1e-3);            // линейное приближение (k ≈ ε₂/2n)
    for (let it = 0; it < 12; it++) {
      const f = tailK400(m, Ak) - k400; if (Math.abs(f) < 1e-9 * Math.max(k400, 1e-6)) break;
      const h = Math.max(1e-6, 1e-3 * Ak), df = (tailK400(m, Ak + h) - tailK400(m, Ak)) / h;
      const step = f / df; Ak = Math.max(0.1 * Ak, Ak - step);
    }
    return Ak;
  }

  // ---------------------------------------------------------------- подложки (полубесконечные)
  function nBK7(l) { const x = (l / 1000) ** 2; return Math.sqrt(1 + 1.03961212 * x / (x - 0.00600069867) + 0.231792344 * x / (x - 0.0200179144) + 1.01046945 * x / (x - 103.560653)); }
  function nSilica(l) { const x = (l / 1000) ** 2; return Math.sqrt(1 + 0.6961663 * x / (x - 0.0684043 ** 2) + 0.4079426 * x / (x - 0.1162414 ** 2) + 0.8974794 * x / (x - 9.896161 ** 2)); }
  /** Таблицы n, k кремния c-Si. SI_GREEN — M. A. Green, Sol. Energy Mater. Sol. Cells 92, 1305 (2008): самосогласованные (КК) данные при 300 K,
   *  250–1450 нм с шагом 10 нм (через базу refractiveindex.info, набор Si/Green-2008). SI_ASPNES — D. E. Aspnes, A. A. Studna, Phys. Rev. B 27, 985 (1983):
   *  эллипсометрия при 1.5–6.0 эВ с шагом 0.1 эВ (207–827 нм), приведено дословно (набор Si/Aspnes). Интерполяция — кубическая (Кэтмулл–Ром) по
   *  собственной равномерной переменной таблицы (λ для Green, E для Aspnes); вне диапазона значения фиксируются на краю, а SUBSTRATES[key].range
   *  позволяет интерфейсу предупредить об этом. */
  const SI_GREEN = [
    [250,1.665,3.665], [260,1.757,4.084], [270,2.068,4.68], [280,2.959,5.287], [290,4.356,5.286], [300,4.976,4.234], [310,5.121,3.598], [320,5.112,3.303],
    [330,5.195,3.1], [340,5.301,2.977], [350,5.494,2.938], [360,6.026,2.966], [370,6.891,2.171], [380,6.616,0.946], [390,6.039,0.445], [400,5.613,0.296],
    [410,5.33,0.227], [420,5.119,0.176], [430,4.949,0.138], [440,4.812,0.107], [450,4.691,0.0863], [460,4.587,0.07138], [470,4.497,0.06209], [480,4.419,0.055],
    [490,4.35,0.04913], [500,4.294,0.04417], [510,4.241,0.03937], [520,4.193,0.03642], [530,4.151,0.03311], [540,4.112,0.03029], [550,4.077,0.02797], [560,4.045,0.02576],
    [570,4.015,0.02413], [580,3.988,0.02252], [590,3.963,0.02108], [600,3.94,0.01993], [610,3.918,0.01845], [620,3.898,0.01737], [630,3.879,0.01644], [640,3.861,0.01543],
    [650,3.844,0.01443], [660,3.828,0.0135], [670,3.813,0.01274], [680,3.798,0.01191], [690,3.784,0.0112], [700,3.772,0.01053], [710,3.759,0.01006], [720,3.748,0.009626],
    [730,3.737,0.008946], [740,3.727,0.008362], [750,3.717,0.007819], [760,3.708,0.007197], [770,3.699,0.00674], [780,3.691,0.006393], [790,3.683,0.005834], [800,3.675,0.005411],
    [810,3.668,0.004995], [820,3.661,0.004613], [830,3.654,0.004273], [840,3.647,0.003944], [850,3.641,0.003612], [860,3.635,0.003278], [870,3.63,0.002984], [880,3.624,0.002682],
    [890,3.619,0.002429], [900,3.614,0.00217], [910,3.609,0.001962], [920,3.604,0.001757], [930,3.6,0.001547], [940,3.595,0.001369], [950,3.591,0.001179], [960,3.587,0.001024],
    [970,3.583,0.0008722], [980,3.579,0.0007487], [990,3.575,0.0006224], [1000,3.572,0.0005093], [1010,3.568,0.0004107], [1020,3.565,0.0003239], [1030,3.562,0.0002475], [1040,3.559,0.000187],
    [1050,3.556,0.0001362], [1060,3.553,9.363e-05], [1070,3.55,6.812e-05], [1080,3.547,5.329e-05], [1090,3.545,4.077e-05], [1100,3.542,3.064e-05], [1110,3.54,2.385e-05], [1120,3.537,1.782e-05],
    [1130,3.535,1.349e-05], [1140,3.532,9.072e-06], [1150,3.53,6.223e-06], [1160,3.528,3.877e-06], [1170,3.526,2.048e-06], [1180,3.524,6.104e-07], [1190,3.522,3.409e-07], [1200,3.52,2.101e-07],
    [1210,3.518,1.252e-07], [1220,3.517,7.961e-08], [1230,3.515,4.6e-08], [1240,3.513,2.368e-08], [1250,3.511,9.947e-09], [1260,3.509,3.61e-09], [1270,3.508,2.021e-09], [1280,3.506,1.222e-09],
    [1290,3.505,7.289e-10], [1300,3.503,4.655e-10], [1310,3.502,2.815e-10], [1320,3.5,1.681e-10], [1330,3.499,8.467e-11], [1340,3.497,3.732e-11], [1350,3.496,1.826e-11], [1360,3.495,1.028e-11],
    [1370,3.494,6.541e-12], [1380,3.492,4.173e-12], [1390,3.491,2.544e-12], [1400,3.49,1.56e-12], [1410,3.489,9.537e-13], [1420,3.488,5.65e-13], [1430,3.487,2.845e-13], [1440,3.486,2.063e-13],
    [1450,3.485,1.385e-13]
  ];
  const SI_ASPNES = [
    [206.6,1.010,2.909], [210.1,1.083,2.982], [213.8,1.133,3.045], [217.5,1.186,3.120], [221.4,1.247,3.206], [225.4,1.340,3.302], [229.6,1.471,3.366], [233.9,1.579,3.353],
    [238.4,1.589,3.354], [243.1,1.571,3.429], [248.0,1.570,3.565], [253.0,1.597,3.749], [258.3,1.658,3.979], [263.8,1.764,4.278], [269.5,1.988,4.678], [275.5,2.452,5.082],
    [281.8,3.120,5.344], [288.3,4.087,5.395], [295.2,4.888,4.639], [302.4,5.020,3.979], [310.0,5.010,3.586], [317.9,5.016,3.346], [326.3,5.065,3.182], [335.1,5.156,3.058],
    [344.4,5.296,2.987], [354.2,5.610,3.014], [364.7,6.522,2.705], [375.7,6.709,1.320], [387.5,6.062,0.630], [399.9,5.570,0.387], [413.3,5.222,0.269], [427.5,4.961,0.203],
    [442.8,4.753,0.163], [459.2,4.583,0.130], [476.9,4.442,0.090], [495.9,4.320,0.073], [516.6,4.215,0.060], [539.1,4.123,0.048], [563.6,4.042,0.032], [590.4,3.969,0.030],
    [619.9,3.906,0.022], [652.5,3.847,0.016], [688.8,3.796,0.013], [729.3,3.752,0.010], [774.9,3.714,0.008], [826.6,3.673,0.005]
  ];
  /** Кубическая интерполяция Кэтмулла–Рома по таблице [[x, n, k], ...] с монотонно возрастающим x (равномерная сетка по x или близкая к ней). */
  function cubicTab(t, x) {
    const L = t.length; if (x <= t[0][0]) return [t[0][1], t[0][2]]; if (x >= t[L - 1][0]) return [t[L - 1][1], t[L - 1][2]];
    let j = 1; while (t[j][0] < x) j++; j = Math.min(L - 3, Math.max(1, j - 1));
    const u = (x - t[j][0]) / (t[j + 1][0] - t[j][0]);
    const cr = (y0, y1, y2, y3) => y1 + 0.5 * u * (y2 - y0 + u * (2 * y0 - 5 * y1 + 4 * y2 - y3 + u * (3 * (y1 - y2) + y3 - y0)));
    return [cr(t[j - 1][1], t[j][1], t[j + 1][1], t[j + 2][1]), Math.max(0, cr(t[j - 1][2], t[j][2], t[j + 1][2], t[j + 2][2]))];
  }
  const SI_ASPNES_E = SI_ASPNES.map(r => [HC / r[0], r[1], r[2]]).reverse();                    // равномерная сетка по энергии, по возрастанию E
  function siGreenNK(l) { return cubicTab(SI_GREEN, l); }
  function siAspnesNK(l) { return cubicTab(SI_ASPNES_E, HC / l); }
  const SUBSTRATES = {
    bk7: { name: 'Стекло BK7 (Зельмейер Schott)', fn: l => [nBK7(l), 0], range: [300, 2500] },
    silica: { name: 'Плавленый кварц (Malitson 1965)', fn: l => [nSilica(l), 0], range: [210, 3700] },
    si: { name: 'Кремний c-Si (Green 2008, 250–1450 нм)', fn: l => siGreenNK(l), range: [250, 1450] },
    si_aspnes: { name: 'Кремний c-Si (Aspnes–Studna 1983, 207–827 нм)', fn: l => siAspnesNK(l), range: [206.6, 826.6] },
    glass152: { name: 'Стекло n = 1.52 (без дисперсии)', fn: l => [1.52, 0], range: [0, Infinity] },
  };
  function substrateN(key, lam) { const f = SUBSTRATES[key].fn; return Array.from(lam).map(l => { const nk = f(l); return [nk[0], -nk[1]]; }); }

  // ---------------------------------------------------------------- справочник материалов (Тауц–Лоренц + УФ-полюс; типовые значения для аморфных плёнок)
  const MATERIALS = {
    tio2: { name: 'TiO₂ (аморфный)', A: 255.83, E0: 4.00, C: 1.77, Eg: 3.40, Auv: 137.65, Euv: 11.0 },
    ta2o5: { name: 'Ta₂O₅ (аморфный)', A: 321.34, E0: 5.30, C: 2.60, Eg: 4.20, Auv: 11.33, Euv: 12.0 },
    nb2o5: { name: 'Nb₂O₅ (аморфный)', A: 307.24, E0: 4.70, C: 2.30, Eg: 3.75, Auv: 69.07, Euv: 11.0 },
    hfo2: { name: 'HfO₂ (аморфный)', A: 396.97, E0: 6.20, C: 2.80, Eg: 5.20, Auv: 16.82, Euv: 13.0 },
    si3n4: { name: 'Si₃N₄ (LPCVD)', A: 156.51, E0: 7.20, C: 3.60, Eg: 4.60, Auv: 103.31, Euv: 13.0 },
    sio2: { name: 'SiO₂ (термический)', A: 295.50, E0: 10.35, C: 3.00, Eg: 8.70, Auv: 10.76, Euv: 16.0 },
    al2o3: { name: 'Al₂O₃ (аморфный)', A: 182.48, E0: 9.50, C: 3.50, Eg: 6.60, Auv: 11.45, Euv: 14.0 },
    zro2: { name: 'ZrO₂ (аморфный)', A: 449.00, E0: 5.95, C: 3.00, Eg: 5.00, Auv: 28.74, Euv: 13.0 },
    // материалы с краем поглощения в измеряемом диапазоне: параметры подобраны по табличным n, k из литературы (см. README, разд. 3.3)
    sinx: { name: 'SiNₓ:H (PECVD, обогащённый Si)', A: 52.04, E0: 7.38, C: 3.26, Eg: 2.17, Auv: 79.35, Euv: 13.0 },   // Vogt 2015 (n = 2.13 при 633 нм): k(400) ≈ 0.036, k(500) ≈ 0.005
    ceo2: { name: 'CeO₂ (поликристаллический)', A: 65.58, E0: 3.92, C: 0.89, Eg: 2.81, Auv: 414.58, Euv: 13.0 },    // ALD, arXiv:1705.04071: k(400) ≈ 0.03, k ≥ 440 нм ≈ 0
    wo3: { name: 'WO₃ (тонкая плёнка)', A: 57.22, E0: 4.41, C: 1.20, Eg: 3.26, Auv: 311.01, Euv: 13.0 },              // Kulikova 2020, Opt. Express 28, 32049: k(350) ≈ 0.023, k ≥ 380 нм ≈ 0
  };

  // ---------------------------------------------------------------- слои
  function bruggeman(ea, eb, fa) {
    const fb = 1 - fa;
    const b = cadd([(3 * fa - 1) * ea[0], (3 * fa - 1) * ea[1]], [(3 * fb - 1) * eb[0], (3 * fb - 1) * eb[1]]);
    const disc = cadd(cmul(b, b), [8 * (ea[0] * eb[0] - ea[1] * eb[1]), 8 * (ea[0] * eb[1] + ea[1] * eb[0])]);
    const s = csqrt(disc);
    const r1 = [(b[0] + s[0]) / 4, (b[1] + s[1]) / 4], r2 = [(b[0] - s[0]) / 4, (b[1] - s[1]) / 4];
    return (r1[0] > 0) ? r1 : r2;
  }
  /** Слои сверху вниз: [{N: [[n,-k],...], d}]. delta > 0 — n растёт к поверхности. */
  function buildLayers(lam, d, m, delta, dRough, M) {
    const Nf = filmN(lam, m);
    const film = [];
    if (!delta) film.push({ N: Nf, d: d });
    else for (let j = M - 1; j >= 0; j--) { const z = (j + 0.5) / M; const s = 1 + delta * (z - 0.5); film.push({ N: Nf.map(v => [v[0] * s, v[1] * s]), d: d / M }); }
    const layers = [];
    if (dRough > 0) {
      const top = film[0].N;
      const Ne = top.map(v => { const eps = cmul(v, v); const e = bruggeman(eps, [1, 0], 0.5); const N = csqrt(e); return [Math.abs(N[0]), -Math.abs(N[1])]; });
      layers.push({ N: Ne, d: dRough });
    }
    return layers.concat(film);
  }

  // ---------------------------------------------------------------- отражение от стопки
  function cosT(N, s02) { const q = cdiv([s02, 0], cmul(N, N)); return csqrt([1 - q[0], -q[1]]); }
  function fresnelPS(Ni, ci, Nj, cj) {
    const a = cmul(Nj, ci), b = cmul(Ni, cj);
    const rp = cdiv(csub(a, b), cadd(a, b));
    const c = cmul(Ni, ci), e = cmul(Nj, cj);
    const rs = cdiv(csub(c, e), cadd(c, e));
    return [rp, rs];
  }
  /** r_p, r_s для каждой λ. layers сверху вниз; Nsub — массив [n,-k] подложки; phi — угол, град. */
  function rhoStack(lam, layers, Nsub, phi) {
    // рекурсия Эйри снизу вверх без промежуточных аллокаций: N = n − ik, X = exp(−2iβ), r_p — эллипсометрический знак
    const s0 = Math.sin(phi * PI / 180), s02 = s0 * s0, c0 = Math.cos(phi * PI / 180);
    const L = layers.length, n = lam.length, RP = new Array(n), RS = new Array(n);
    const cr_ = new Float64Array(L + 1), ci_ = new Float64Array(L + 1), nr_ = new Float64Array(L + 1), ni_ = new Float64Array(L + 1);
    for (let i = 0; i < n; i++) {
      const k = 2 * PI / lam[i];
      // косинусы: индекс L — подложка, 0..L−1 — слои сверху вниз; внешняя среда: (1, cos φ0)
      for (let j = 0; j <= L; j++) {
        const Nv = j < L ? layers[j].N[i] : Nsub[i], Nr = Nv[0], Ni = Nv[1];
        const N2r = Nr * Nr - Ni * Ni, N2i = 2 * Nr * Ni, den = N2r * N2r + N2i * N2i;
        const ar = 1 - s02 * N2r / den, ai = s02 * N2i / den, mod = Math.hypot(ar, ai);
        let cre = Math.sqrt(Math.max(0, (mod + ar) / 2)), cim = Math.sqrt(Math.max(0, (mod - ar) / 2)); if (ai < 0) cim = -cim;
        cr_[j] = cre; ci_[j] = cim; nr_[j] = Nr; ni_[j] = Ni;
      }
      // старт: граница нижний слой (или воздух) | подложка
      let ur, ui, ucr, uci;
      if (L) { ur = nr_[L - 1]; ui = ni_[L - 1]; ucr = cr_[L - 1]; uci = ci_[L - 1]; } else { ur = 1; ui = 0; ucr = c0; uci = 0; }
      const br = nr_[L], bi = ni_[L], bcr = cr_[L], bci = ci_[L];
      // r_p = (Nb cu − Nu cb)/(Nb cu + Nu cb), r_s = (Nu cu − Nb cb)/(Nu cu + Nb cb)
      let ar = br * ucr - bi * uci, ai = br * uci + bi * ucr, cr = ur * bcr - ui * bci, ci = ur * bci + ui * bcr;
      let dr = ar + cr, di = ai + ci, dm = dr * dr + di * di, nr = ar - cr, ni = ai - ci;
      let rpr = (nr * dr + ni * di) / dm, rpi = (ni * dr - nr * di) / dm;
      let er = ur * ucr - ui * uci, ei = ur * uci + ui * ucr, fr = br * bcr - bi * bci, fi = br * bci + bi * bcr;
      dr = er + fr; di = ei + fi; dm = dr * dr + di * di; nr = er - fr; ni = ei - fi;
      let rsr = (nr * dr + ni * di) / dm, rsi = (ni * dr - nr * di) / dm;
      for (let j = L - 1; j >= 0; j--) {
        const Nr = nr_[j], Ni = ni_[j], cjr = cr_[j], cji = ci_[j], d = layers[j].d;
        // X = exp(−2iβ), β = k d N cos γ → −2iβ = 2 k d Im(Ncosγ) − 2i k d Re(Ncosγ)
        const ncr = Nr * cjr - Ni * cji, nci = Nr * cji + Ni * cjr, ex = Math.exp(2 * k * d * nci), ang = -2 * k * d * ncr;
        const Xr = ex * Math.cos(ang), Xi = ex * Math.sin(ang);
        let Ur, Ui, Ucr, Uci; if (j > 0) { Ur = nr_[j - 1]; Ui = ni_[j - 1]; Ucr = cr_[j - 1]; Uci = ci_[j - 1]; } else { Ur = 1; Ui = 0; Ucr = c0; Uci = 0; }
        // Френель верхняя среда U → слой j
        ar = Nr * Ucr - Ni * Uci; ai = Nr * Uci + Ni * Ucr; cr = Ur * cjr - Ui * cji; ci = Ur * cji + Ui * cjr;
        dr = ar + cr; di = ai + ci; dm = dr * dr + di * di; nr = ar - cr; ni = ai - ci;
        const rpur = (nr * dr + ni * di) / dm, rpui = (ni * dr - nr * di) / dm;
        er = Ur * Ucr - Ui * Uci; ei = Ur * Uci + Ui * Ucr; fr = Nr * cjr - Ni * cji; fi = Nr * cji + Ni * cjr;
        dr = er + fr; di = ei + fi; dm = dr * dr + di * di; nr = er - fr; ni = ei - fi;
        const rsur = (nr * dr + ni * di) / dm, rsui = (ni * dr - nr * di) / dm;
        // r ← (r_u + r X)/(1 + r_u r X)
        let rXr = rpr * Xr - rpi * Xi, rXi = rpr * Xi + rpi * Xr;
        nr = rpur + rXr; ni = rpui + rXi; dr = 1 + (rpur * rXr - rpui * rXi); di = rpur * rXi + rpui * rXr; dm = dr * dr + di * di;
        rpr = (nr * dr + ni * di) / dm; rpi = (ni * dr - nr * di) / dm;
        rXr = rsr * Xr - rsi * Xi; rXi = rsr * Xi + rsi * Xr;
        nr = rsur + rXr; ni = rsui + rXi; dr = 1 + (rsur * rXr - rsui * rXi); di = rsur * rXi + rsui * rXr; dm = dr * dr + di * di;
        rsr = (nr * dr + ni * di) / dm; rsi = (ni * dr - nr * di) / dm;
      }
      RP[i] = [rpr, rpi]; RS[i] = [rsr, rsi];
    }
    return [RP, RS];
  }
  function psiDeltaFromR(RP, RS) {
    const n = RP.length, psi = new Float64Array(n), del = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const rp = RP[i], rs = RS[i];
      psi[i] = Math.atan(Math.sqrt(cabs2(rp) / cabs2(rs))) * 180 / PI;
      const re = rp[0] * rs[0] + rp[1] * rs[1], im = rp[1] * rs[0] - rp[0] * rs[1];
      let d = Math.atan2(im, re) * 180 / PI; if (d < 0) d += 360; del[i] = d;
    }
    return { psi, del };
  }
  /** Ненормированные элементы матрицы Мюллера изотропного образца (то, что прибор интегрирует по полосе): I_p = |r_p|², I_s = |r_s|², Z = r_p r_s*. */
  function muellerFromR(RP, RS) {
    const n = RP.length, Ip = new Float64Array(n), Is = new Float64Array(n), Zr = new Float64Array(n), Zi = new Float64Array(n);
    for (let i = 0; i < n; i++) { const rp = RP[i], rs = RS[i]; Ip[i] = cabs2(rp); Is[i] = cabs2(rs); Zr[i] = rp[0] * rs[0] + rp[1] * rs[1]; Zi[i] = rp[1] * rs[0] - rp[0] * rs[1]; }
    return { Ip, Is, Zr, Zi };
  }
  /** N, C, S из ненормированных элементов: N = (I_s − I_p)/(I_p + I_s), C = 2 Re Z/(I_p + I_s), S = 2 Im Z/(I_p + I_s). */
  function ncsFromMueller(M) {
    const n = M.Ip.length, N = new Float64Array(n), C = new Float64Array(n), S = new Float64Array(n);
    for (let i = 0; i < n; i++) { const t = M.Ip[i] + M.Is[i]; N[i] = (M.Is[i] - M.Ip[i]) / t; C[i] = 2 * M.Zr[i] / t; S[i] = 2 * M.Zi[i] / t; }
    return { N, C, S, Ip: M.Ip, Is: M.Is, Zr: M.Zr, Zi: M.Zi };
  }
  function ncsFromR(RP, RS) { return ncsFromMueller(muellerFromR(RP, RS)); }
  /** Ψ, Δ (град) из нормированных элементов матрицы Мюллера: Ψ = ½ arccos N, Δ = atan2(S, C) ∈ [0, 360). */
  function psiDeltaFromNCS(N, C, S) {
    const n = N.length, psi = new Float64Array(n), del = new Float64Array(n);
    for (let i = 0; i < n; i++) { psi[i] = 0.5 * Math.acos(Math.max(-1, Math.min(1, N[i]))) * 180 / PI; let d = Math.atan2(S[i], C[i]) * 180 / PI; if (d < 0) d += 360; del[i] = d; }
    return { psi, del };
  }

  // ---------------------------------------------------------------- задняя сторона подложки: некогерентное сложение пучков
  /** Коэффициенты стопки матричным методом Абелеса в конвенции книги (тангенциальные амплитуды E, exp(+iωt), N = n − ik) на одной λ:
   *  r — отражение из внешней среды, t — пропускание в подложку, rb — отражение стопки со стороны подложки, tb — пропускание из подложки наружу.
   *  Для стопки в обратном порядке M′ = J Mᵀ J = [[m22, m12], [m21, m11]], поэтому при том же знаменателе
   *  den = q_a m11 + q_a q_s m12 + q_s m22 + m21: r = (q_a m11 + q_a q_s m12 − q_s m22 − m21)/den, t = 2q_a/den,
   *  rb = (−q_a m11 + q_a q_s m12 + q_s m22 − m21)/den, tb = 2q_s/den. Возвращает {s: {...}, p: {...}, cs: cos γ подложки}. */
  function stackCoefs(lam1, layersAt, Nsub1, phi) {
    const s0 = Math.sin(phi * PI / 180), s02 = s0 * s0, c0 = Math.cos(phi * PI / 180), k = 2 * PI / lam1, out = {};
    const cs = cosT(Nsub1, s02);
    for (const pol of ['s', 'p']) {
      const isS = pol === 's', qa = [isS ? c0 : 1 / c0, 0], qs = isS ? cmul(Nsub1, cs) : cdiv(Nsub1, cs);
      let m11 = [1, 0], m12 = [0, 0], m21 = [0, 0], m22 = [1, 0];
      for (const L of layersAt) {                                                // сверху вниз: M = M_0 M_1 ⋯
        const c = cosT(L.N, s02), q = isS ? cmul(L.N, c) : cdiv(L.N, c), ph = cmul([k * L.d, 0], cmul(L.N, c));
        const cp = ccos(ph), sp = csin(ph), b = cdiv([-sp[1], sp[0]], q), cq = cmul([0, 1], cmul(q, sp));   // b = (i/q) sin φ, cq = i q sin φ
        const n11 = cadd(cmul(m11, cp), cmul(m12, cq)), n12 = cadd(cmul(m11, b), cmul(m12, cp));
        const n21 = cadd(cmul(m21, cp), cmul(m22, cq)), n22 = cadd(cmul(m21, b), cmul(m22, cp));
        m11 = n11; m12 = n12; m21 = n21; m22 = n22;
      }
      const a11 = cmul(qa, m11), a12 = cmul(cmul(qa, qs), m12), a22 = cmul(qs, m22);
      const den = cadd(cadd(a11, a12), cadd(a22, m21));
      out[pol] = { r: cdiv(csub(cadd(a11, a12), cadd(a22, m21)), den), t: cdiv([2 * qa[0], 0], den),
        rb: cdiv(cadd(csub(a12, a11), csub(a22, m21)), den), tb: cdiv([2 * qs[0], 2 * qs[1]], den), qa, qs };
    }
    out.cs = cs;
    return out;
  }
  /** N, C, S с некогерентным вкладом отражения от задней стороны подложки (плоскопараллельная подложка, задняя граница — с воздухом).
   *  back = {f, ds}: f — доля света задней стороны, попадающая в детектор (задана, не фитируется), ds — толщина подложки, нм
   *  (нужна только для затухания в поглощающей подложке: для стекла w = 1, для c-Si w ≈ 0).
   *  Пучок m ≥ 1: A_j = t_j (r^b_j)^m (r′_j)^{m−1} t′_j, фазы хода по подложке одинаковы для p и s и в A_p A_s* сокращаются, поэтому
   *  Σ|A_j|² = |t_j t′_j|² |r^b_j|² w / (1 − |r′_j r^b_j|² w), Σ A_p A_s* = t_p t′_p (t_s t′_s)* r^b_p r^b_s* w / (1 − r′_p r′_s* r^b_p r^b_s* w),
   *  w = |exp(−2ik d_s N_s cos γ_s)|². Матрицы Мюллера пучков складываются; знак p приводится к эллипсометрическому (C, S → −C, −S). */
  function ncsBackside(lam, layers, Nsub, phi, back) {
    // та же математика, что в stackCoefs, но без промежуточных аллокаций (скалярная комплексная арифметика);
    // кроме N, C, S возвращает и ненормированные суммы I_p, I_s, Z (эллипсометрический знак p) — для свёртки по полосе
    const n = lam.length, N = new Float64Array(n), C = new Float64Array(n), S = new Float64Array(n), f = back.f, ds = back.ds || 0;
    const IP = new Float64Array(n), IS = new Float64Array(n), ZR = new Float64Array(n), ZI = new Float64Array(n);
    const s0 = Math.sin(phi * PI / 180), s02 = s0 * s0, c0 = Math.cos(phi * PI / 180), L = layers.length;
    // cos γ = sqrt(1 − s0²/N²) для N = (Nr, Ni): результат в (cr, ci)
    let cr = 0, ci = 0;
    const cosG = (Nr, Ni) => { const N2r = Nr * Nr - Ni * Ni, N2i = 2 * Nr * Ni, den = N2r * N2r + N2i * N2i, ar = 1 - s02 * N2r / den, ai = s02 * N2i / den, mod = Math.hypot(ar, ai); cr = Math.sqrt(Math.max(0, (mod + ar) / 2)); ci = Math.sqrt(Math.max(0, (mod - ar) / 2)); if (ai < 0) ci = -ci; };
    for (let i = 0; i < n; i++) {
      const k = 2 * PI / lam[i], Nbr = Nsub[i][0], Nbi = Nsub[i][1];
      cosG(Nbr, Nbi); const cbr = cr, cbi = ci;
      const w = Math.exp(4 * k * ds * (Nbr * cbi + Nbi * cbr));            // |exp(−2ik d_s N_s cos γ_s)|², Im(N cos γ) ≤ 0
      // на каждую поляризацию: r, t·t′ (произведение), r′, отражение задней грани r^b, q_a, q_s
      const R = [[0, 0], [0, 0]], U = [[0, 0], [0, 0]], RB = [[0, 0], [0, 0]], RQ = [[0, 0], [0, 0]];
      for (let pol = 0; pol < 2; pol++) {
        const isS = pol === 0, qar = isS ? c0 : 1 / c0;
        let qsr, qsi; if (isS) { qsr = Nbr * cbr - Nbi * cbi; qsi = Nbr * cbi + Nbi * cbr; } else { const dd = cbr * cbr + cbi * cbi; qsr = (Nbr * cbr + Nbi * cbi) / dd; qsi = (Nbi * cbr - Nbr * cbi) / dd; }
        let m11r = 1, m11i = 0, m12r = 0, m12i = 0, m21r = 0, m21i = 0, m22r = 1, m22i = 0;
        for (let a = 0; a < L; a++) {
          const Nr = layers[a].N[i][0], Ni = layers[a].N[i][1], dj = layers[a].d;
          cosG(Nr, Ni);
          const ncr = Nr * cr - Ni * ci, nci = Nr * ci + Ni * cr;           // N cos γ
          let qr, qi; if (isS) { qr = ncr; qi = nci; } else { const dd = cr * cr + ci * ci; qr = (Nr * cr + Ni * ci) / dd; qi = (Ni * cr - Nr * ci) / dd; }
          const phr = k * dj * ncr, phi_ = k * dj * nci;
          const cpr = Math.cos(phr) * Math.cosh(phi_), cpi = -Math.sin(phr) * Math.sinh(phi_), spr = Math.sin(phr) * Math.cosh(phi_), spi = Math.cos(phr) * Math.sinh(phi_);
          const qq = qr * qr + qi * qi, br = (-spi * qr + spr * qi) / qq, bi = (spr * qr + spi * qi) / qq;   // b = i sin φ / q
          const cqr = -(qr * spi + qi * spr), cqi = qr * spr - qi * spi;                                     // c = i q sin φ
          // M ← M · [[cp, b], [c, cp]]
          const n11r = m11r * cpr - m11i * cpi + m12r * cqr - m12i * cqi, n11i = m11r * cpi + m11i * cpr + m12r * cqi + m12i * cqr;
          const n12r = m11r * br - m11i * bi + m12r * cpr - m12i * cpi, n12i = m11r * bi + m11i * br + m12r * cpi + m12i * cpr;
          const n21r = m21r * cpr - m21i * cpi + m22r * cqr - m22i * cqi, n21i = m21r * cpi + m21i * cpr + m22r * cqi + m22i * cqr;
          const n22r = m21r * br - m21i * bi + m22r * cpr - m22i * cpi, n22i = m21r * bi + m21i * br + m22r * cpi + m22i * cpr;
          m11r = n11r; m11i = n11i; m12r = n12r; m12i = n12i; m21r = n21r; m21i = n21i; m22r = n22r; m22i = n22i;
        }
        // a11 = q_a m11, a12 = q_a q_s m12, a22 = q_s m22
        const a11r = qar * m11r, a11i = qar * m11i;
        const a12r = qar * (qsr * m12r - qsi * m12i), a12i = qar * (qsr * m12i + qsi * m12r);
        const a22r = qsr * m22r - qsi * m22i, a22i = qsr * m22i + qsi * m22r;
        const dr = a11r + a12r + a22r + m21r, di = a11i + a12i + a22i + m21i, dm = dr * dr + di * di;
        const inv = (xr, xi) => [(xr * dr + xi * di) / dm, (xi * dr - xr * di) / dm];               // x / den
        R[pol] = inv(a11r + a12r - a22r - m21r, a11i + a12i - a22i - m21i);                          // r
        const t = inv(2 * qar, 0), tb = inv(2 * qsr, 2 * qsi);
        U[pol] = [t[0] * tb[0] - t[1] * tb[1], t[0] * tb[1] + t[1] * tb[0]];                          // t·t′
        RQ[pol] = inv(-a11r + a12r + a22r - m21r, -a11i + a12i + a22i - m21i);                       // r′ (со стороны подложки)
        const sr = qsr - qar, si = qsi, tr_ = qsr + qar, ti_ = qsi, tm = tr_ * tr_ + ti_ * ti_;
        RB[pol] = [(sr * tr_ + si * ti_) / tm, (si * tr_ - sr * ti_) / tm];                          // r^b = (q_s − q_a)/(q_s + q_a): задняя грань → воздух
      }
      const abs2 = (a) => a[0] * a[0] + a[1] * a[1], mulc = (a, b) => [a[0] * b[0] + a[1] * b[1], a[1] * b[0] - a[0] * b[1]];   // a·conj(b)
      const Bs = abs2(U[0]) * abs2(RB[0]) * w / (1 - abs2(RQ[0]) * abs2(RB[0]) * w), Bp = abs2(U[1]) * abs2(RB[1]) * w / (1 - abs2(RQ[1]) * abs2(RB[1]) * w);
      const uu = mulc(U[1], U[0]), bb = mulc(RB[1], RB[0]), gg = mulc(RQ[1], RQ[0]);
      const numr = (uu[0] * bb[0] - uu[1] * bb[1]) * w, numi = (uu[0] * bb[1] + uu[1] * bb[0]) * w;
      const gbr = gg[0] * bb[0] - gg[1] * bb[1], gbi = gg[0] * bb[1] + gg[1] * bb[0], dnr = 1 - gbr * w, dni = -gbi * w, dnm = dnr * dnr + dni * dni;
      const Xr = (numr * dnr + numi * dni) / dnm, Xi = (numi * dnr - numr * dni) / dnm;
      const rr_ = mulc(R[1], R[0]);
      const Ip = abs2(R[1]) + f * Bp, Is = abs2(R[0]) + f * Bs, Zr = -(rr_[0] + f * Xr), Zi = -(rr_[1] + f * Xi), tot = Ip + Is;
      N[i] = (Is - Ip) / tot; C[i] = 2 * Zr / tot; S[i] = 2 * Zi / tot;
      IP[i] = Ip; IS[i] = Is; ZR[i] = Zr; ZI[i] = Zi;
    }
    return { N, C, S, Ip: IP, Is: IS, Zr: ZR, Zi: ZI };
  }
  /** Активна ли задняя сторона: back = {f > 0, ds}. */
  const backOn = (back) => !!(back && back.f > 0);
  /** Непрерывный линейный профиль n(z) = n·[1 + δ(z/d − ½)]: уравнение Риккати для локальной функции отражения
   *  (Furman & Tikhonravov, 1.1.19, 1.1.20), RK4 с шагом h (нм); EMA-слой сверху добавляется по Эйри.
   *  Возвращает [RP, RS] в конвенции ядра (r_p как в эллипсометрии, т.е. −r_p книги). */
  function rhoGraded(lam, Nsub, phi, d, m, delta, dRough, h) {
    h = h || 1.0;
    const s0 = Math.sin(phi * PI / 180), s02 = s0 * s0, c0 = [Math.cos(phi * PI / 180), 0], N0 = [1, 0];
    const Nf = filmN(lam, m);
    const RP = new Array(lam.length), RS = new Array(lam.length);
    const nSteps = Math.max(4, Math.ceil(d / h)), dz = d / nSteps;
    for (let i = 0; i < lam.length; i++) {
      const k = 2 * PI / lam[i], Nb = Nsub[i], cb = cosT(Nb, s02), Nc = Nf[i];
      const epsAt = (z) => { const sc = 1 + delta * (z / d - 0.5); const N = [Nc[0] * sc, Nc[1] * sc]; return cmul(N, N); };
      const out = {};
      for (const pol of ['s', 'p']) {
        const qa = pol === 's' ? c0[0] : 1 / c0[0];                             // внешняя среда — воздух
        const qs = pol === 's' ? cmul(Nb, cb) : cdiv(Nb, cb);
        const pref = [0, k / (2 * qa)];
        const f = (z, r) => {
          const eps = epsAt(z), om = csub([1, 0], r), op = cadd([1, 0], r), om2 = cmul(om, om), op2 = cmul(op, op);
          let term;
          if (pol === 's') term = csub([qa * qa * om2[0], qa * qa * om2[1]], cmul(csub(eps, [s02, 0]), op2));
          else { const g = cmul(csub([1, 0], cdiv([s02, 0], eps)), om2); term = csub([qa * qa * g[0], qa * qa * g[1]], cmul(eps, op2)); }
          return cmul(pref, term);
        };
        let r = cdiv(csub([qa, 0], qs), cadd([qa, 0], qs));                    // голая подложка (1.2.17)
        for (let j = 0; j < nSteps; j++) {
          const z = j * dz;
          const k1 = f(z, r), k2 = f(z + dz / 2, cadd(r, [k1[0] * dz / 2, k1[1] * dz / 2])), k3 = f(z + dz / 2, cadd(r, [k2[0] * dz / 2, k2[1] * dz / 2])), k4 = f(z + dz, cadd(r, [k3[0] * dz, k3[1] * dz]));
          r = [r[0] + dz / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]), r[1] + dz / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])];
        }
        if (dRough > 0) {                                                         // EMA-слой поверх: r относительно среды ЭС, затем шаг Эйри
          const sc = 1 + delta * 0.5, Ntop = [Nc[0] * sc, Nc[1] * sc];
          const e = bruggeman(cmul(Ntop, Ntop), [1, 0], 0.5); let Ne = csqrt(e); Ne = [Math.abs(Ne[0]), -Math.abs(Ne[1])];
          const ce = cosT(Ne, s02), qe = pol === 's' ? cmul(Ne, ce) : cdiv(Ne, ce);
          const w = cmul([qa, 0], cdiv(csub([1, 0], r), cadd([1, 0], r)));       // w = v/u на верхней границе плёнки
          const re = cdiv(csub(qe, w), cadd(qe, w));                              // отражение плёнки, видимое из среды ЭС
          const rae = cdiv(csub([qa, 0], qe), cadd([qa, 0], qe));                // Френель воздух → ЭС (конвенция книги)
          const bt = cmul([2 * PI * dRough / lam[i], 0], cmul(Ne, ce)); const X = cexp([2 * bt[1], -2 * bt[0]]);
          r = cdiv(cadd(rae, cmul(re, X)), cadd([1, 0], cmul(cmul(rae, re), X)));
        }
        out[pol] = r;
      }
      RS[i] = out.s; RP[i] = [-out.p[0], -out.p[1]];                             // знак p: конвенция эллипсометрии
    }
    return [RP, RS];
  }
  // ---------------------------------------------------------------- спектральная полоса прибора
  /** Прибор интегрирует по полосе интенсивности, поэтому усредняются ненормированные I_p = |r_p|², I_s = |r_s|², Z = r_p r_s* (а не Ψ, Δ и не N, C, S),
   *  и только затем берутся отношения: N = (⟨I_s⟩ − ⟨I_p⟩)/(⟨I_p⟩ + ⟨I_s⟩) и т. д. — как в некогерентной сумме пучков задней стороны.
   *  В модели фита полоса учитывается во втором порядке по σ: ⟨M⟩ ≈ M + (σ²/2) M″, где M″ — центральная разность по λ с шагом BAND_H
   *  (три сетки λ − h, λ, λ + h, т. е. три вычисления модели вместо одного). Отброшенный член σ⁴M⁗/8 при σ ≤ 0.7 нм и периоде полос ≥ 20 нм
   *  составляет < 2·10⁻⁴ от эффекта полосы; ошибка самой разности (h²/12)M⁗ — < 0.5 % от M″. */
  const BAND_H = 1.0;
  const bandOn = (band) => !!(band && band.bw > 0);
  function lam3Of(lam, h) { const n = lam.length, out = new Float64Array(3 * n); for (let i = 0; i < n; i++) { out[i] = lam[i] - h; out[n + i] = lam[i]; out[2 * n + i] = lam[i] + h; } return out; }
  /** Значение на сетке прибора из массива на тройной сетке: y + (σ²/2h²)(y⁻ − 2y + y⁺). */
  function band2(y3, n, sg, h) { const c = sg * sg / (2 * h * h), out = new Float64Array(n); for (let i = 0; i < n; i++) out[i] = y3[n + i] + c * (y3[i] - 2 * y3[n + i] + y3[2 * n + i]); return out; }
  const band2All = (R, n, sg, h) => ({ Ip: band2(R.Ip, n, sg, h), Is: band2(R.Is, n, sg, h), Zr: band2(R.Zr, n, sg, h), Zi: band2(R.Zi, n, sg, h) });
  /** Ненормированные элементы Мюллера модели (с задней стороной, если back). */
  function modelMueller(lam, Nsub, phi, d, m, delta, dRough, M, back) {
    const layers = buildLayers(lam, d, m, delta || 0, dRough || 0, M || 20);
    if (backOn(back)) return ncsBackside(lam, layers, Nsub, phi, back);
    return ncsFromR(...rhoStack(lam, layers, Nsub, phi));
  }
  /** Ψ, Δ модели на сетке lam; back = {f, ds} — задняя сторона подложки (некогерентно), band = {bw, subKey} — полоса прибора (FWHM, нм)
   *  во втором порядке; null — без них. */
  function modelPsiDelta(lam, Nsub, phi, d, m, delta, dRough, M, back, band) {
    if (bandOn(band)) {
      const n = lam.length, lam3 = lam3Of(lam, BAND_H), Nsub3 = substrateN(band.subKey, lam3);
      const R = modelMueller(lam3, Nsub3, phi, d, m, delta, dRough, M, back);
      const { N, C, S } = ncsFromMueller(band2All(R, n, band.bw / 2.3548, BAND_H));
      return psiDeltaFromNCS(N, C, S);
    }
    const layers = buildLayers(lam, d, m, delta || 0, dRough || 0, M || 20);
    if (backOn(back)) { const { N, C, S } = ncsBackside(lam, layers, Nsub, phi, back); return psiDeltaFromNCS(N, C, S); }
    const [RP, RS] = rhoStack(lam, layers, Nsub, phi);
    return psiDeltaFromR(RP, RS);
  }
  /** Чистый спектр «измерения»: полоса (свёртка интенсивностей I_p, I_s, Z на мелкой сетке, затем нормировка), сдвиг шкалы, фактический угол.
   *  opt.continuous — непрерывный профиль градиента (Риккати, шаг opt.h, по умолчанию 0.5 нм) вместо лестницы из 40 подслоёв;
   *  opt.back = {f, ds} — задняя сторона подложки (тогда градиент считается лестницей из 160 подслоёв: уравнение Риккати даёт только r).
   *  Мелкая сетка: шаг ≤ σ/1.5 (и ≤ 0.5 нм) — ядро Гаусса дискретизовано с ошибкой < 1 %; начало сетки кратно шагу относительно lam[0], поэтому
   *  точки прибора, кратные шагу, попадают точно в узлы; на сетку прибора свёрнутые I_p, I_s, Z переносятся кубической интерполяцией (Кэтмулл–Ром). */
  function synthesizeClean(lam, subKey, phiTrue, d, m, delta, dRough, opt) {
    opt = opt || {};
    const back = backOn(opt.back) ? opt.back : null;
    const bw = opt.bw || 0, off = opt.lamOffset || 0, cont = !!(opt.continuous && delta && !back), h = opt.h || 0.5;
    const rps = (lf, Nsub) => cont ? rhoGraded(lf, Nsub, phiTrue, d, m, delta, dRough, h) : rhoStack(lf, buildLayers(lf, d, m, delta, dRough, 40), Nsub, phiTrue);
    const mueller = (lf, Nsub) => back ? ncsBackside(lf, buildLayers(lf, d, m, delta, dRough, delta ? 160 : 1), Nsub, phiTrue, back) : muellerFromR(...rps(lf, Nsub));
    let psi, del;
    if (bw > 0) {
      const sg = bw / 2.3548, step = Math.min(0.5, sg / 1.5), margin = 4 * sg + 2;
      const lo = lam[0] - Math.ceil(margin / step) * step, hi = lam[lam.length - 1] + margin;
      const nf = Math.floor((hi - lo) / step) + 2; const lf = new Array(nf); for (let i = 0; i < nf; i++) lf[i] = lo + i * step + off;
      const R = mueller(lf, substrateN(subKey, lf));
      const half = Math.ceil(4 * sg / step); const ker = []; let ks = 0;
      for (let j = -half; j <= half; j++) { const w = Math.exp(-0.5 * (j * step / sg) ** 2); ker.push(w); ks += w; }
      const conv = (y) => { const out = new Float64Array(nf); for (let i = 0; i < nf; i++) { let s = 0; for (let j = -half; j <= half; j++) { const ii = Math.min(nf - 1, Math.max(0, i + j)); s += y[ii] * ker[j + half]; } out[i] = s / ks; } return out; };
      const Ipc = conv(R.Ip), Isc = conv(R.Is), Zrc = conv(R.Zr), Zic = conv(R.Zi);
      const cubic = (y, x) => { const j = Math.min(nf - 3, Math.max(1, Math.floor(x))), t = x - j; if (Math.abs(t) < 1e-9) return y[j]; const y0 = y[j - 1], y1 = y[j], y2 = y[j + 1], y3 = y[j + 2]; return y1 + 0.5 * t * (y2 - y0 + t * (2 * y0 - 5 * y1 + 4 * y2 - y3 + t * (3 * (y1 - y2) + y3 - y0))); };
      psi = new Float64Array(lam.length); del = new Float64Array(lam.length);
      for (let i = 0; i < lam.length; i++) {
        const x = (lam[i] - lo) / step;
        const Ip = cubic(Ipc, x), Is = cubic(Isc, x), Zr = cubic(Zrc, x), Zi = cubic(Zic, x), tot = Ip + Is;
        psi[i] = 0.5 * Math.acos(Math.max(-1, Math.min(1, (Is - Ip) / tot))) * 180 / PI;
        let dd = Math.atan2(Zi, Zr) * 180 / PI; if (dd < 0) dd += 360; del[i] = dd;
      }
    } else {
      const la = lam.map(l => l + off);
      const R = mueller(la, substrateN(subKey, la)); const { N, C, S } = ncsFromMueller(R); const r = psiDeltaFromNCS(N, C, S); psi = r.psi; del = r.del;
    }
    return { psi, del };
  }
  /** Дрейф калибровки и шум поверх чистого спектра (возвращает новые массивы). */
  function applyNoise(clean, lam, opt, rng) {
    const n = lam.length, t = (l) => (l - (lam[0] + lam[n - 1]) / 2) / ((lam[n - 1] - lam[0]) / 2);
    const dp = opt.driftPsi || [0, 0], dd = opt.driftDel || [0, 0];
    const psi = new Float64Array(n), del = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      psi[i] = clean.psi[i] + dp[0] + dp[1] * t(lam[i]) + (opt.sigPsi ? opt.sigPsi[i] * rng.normal() : 0);
      let v = clean.del[i] + dd[0] + dd[1] * t(lam[i]) + (opt.sigDel ? opt.sigDel[i] * rng.normal() : 0);
      v = v % 360; if (v < 0) v += 360; del[i] = v;
    }
    return { psi, del };
  }
  /** Синтез «измерения» = чистый спектр + дрейф + шум. */
  function synthesize(lam, subKey, phiTrue, d, m, delta, dRough, opt, rng) {
    return applyNoise(synthesizeClean(lam, subKey, phiTrue, d, m, delta, dRough, opt), lam, opt || {}, rng);
  }

  // ---------------------------------------------------------------- генератор случайных чисел (детерминированный)
  function makeRng(seed) {
    let a = seed >>> 0;
    const uniform = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    let spare = null;
    const normal = () => { if (spare !== null) { const s = spare; spare = null; return s; } let u, v, s; do { u = 2 * uniform() - 1; v = 2 * uniform() - 1; s = u * u + v * v; } while (s >= 1 || s === 0); const m = Math.sqrt(-2 * Math.log(s) / s); spare = v * m; return u * m; };
    return { uniform, normal, range: (lo, hi) => lo + (hi - lo) * uniform(), int: (n) => Math.floor(uniform() * n) };
  }

  // ---------------------------------------------------------------- фит (Левенберг–Марквардт, численный якобиан, границы)
  function solveLinear(A, b) {
    const n = b.length, M = A.map((r, i) => r.concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      [M[c], M[p]] = [M[p], M[c]];
      const piv = M[c][c]; if (Math.abs(piv) < 1e-300) return null;
      for (let r = 0; r < n; r++) { if (r === c) continue; const f = M[r][c] / piv; if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
    }
    return M.map((r, i) => r[n] / r[i]);
  }
  function invert(A) {
    const n = A.length, M = A.map((r, i) => r.concat(Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))));
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      [M[c], M[p]] = [M[p], M[c]];
      const piv = M[c][c]; if (Math.abs(piv) < 1e-300) return null;
      for (let k = 0; k < 2 * n; k++) M[c][k] /= piv;
      for (let r = 0; r < n; r++) { if (r === c) continue; const f = M[r][c]; if (f) for (let k = 0; k < 2 * n; k++) M[r][k] -= f * M[c][k]; }
    }
    return M.map(r => r.slice(n));
  }
  function lmFit(residFn, x0, lo, hi, scale, maxIter) {
    maxIter = maxIter || 60;
    const p = x0.length, clamp = (x) => x.map((v, k) => Math.min(hi[k], Math.max(lo[k], v)));
    let x = clamp(x0.slice()), r = residFn(x), cost = r.reduce((s, v) => s + v * v, 0), lam = 1e-3, nfev = 1;
    let J = null;
    for (let it = 0; it < maxIter; it++) {
      const m = r.length; J = Array.from({ length: p }, () => new Float64Array(m));
      for (let k = 0; k < p; k++) {
        const h = 1e-4 * scale[k]; const xp = x.slice(); xp[k] = Math.min(hi[k], x[k] + h); const hh = xp[k] - x[k] || h;
        const rp = residFn(xp); nfev++; for (let i = 0; i < m; i++) J[k][i] = (rp[i] - r[i]) / hh;
      }
      const JTJ = Array.from({ length: p }, () => new Array(p).fill(0)), JTr = new Array(p).fill(0);
      for (let a = 0; a < p; a++) { for (let b = a; b < p; b++) { let s = 0; for (let i = 0; i < m; i++) s += J[a][i] * J[b][i]; JTJ[a][b] = s; JTJ[b][a] = s; } let s = 0; for (let i = 0; i < m; i++) s += J[a][i] * r[i]; JTr[a] = s; }
      let improved = false;
      for (let tries = 0; tries < 12; tries++) {
        const Aug = JTJ.map((row, a) => row.map((v, b) => (a === b ? v * (1 + lam) + 1e-12 : v)));
        const dx = solveLinear(Aug, JTr.map(v => -v)); if (!dx) { lam *= 10; continue; }
        const xn = clamp(x.map((v, k) => v + dx[k])); const rn = residFn(xn); nfev++;
        const cn = rn.reduce((s, v) => s + v * v, 0);
        if (cn < cost) { const rel = (cost - cn) / Math.max(cost, 1e-300); x = xn; r = rn; cost = cn; lam = Math.max(lam * 0.3, 1e-9); improved = true; if (rel < 1e-9) it = maxIter; break; }
        lam *= 5;
      }
      if (!improved) break;
    }
    const m = r.length, nu = Math.max(1, m - p), chi2 = cost / nu;
    // ковариация по последнему якобиану
    let cov = null;
    if (J) { const JTJ = Array.from({ length: p }, () => new Array(p).fill(0)); for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) { let s = 0; for (let i = 0; i < m; i++) s += J[a][i] * J[b][i]; JTJ[a][b] = s; } const inv = invert(JTJ); if (inv) cov = inv.map(row => row.map(v => v * chi2)); }
    return { x, resid: r, chi2, cov, nfev, err: cov ? cov.map((row, k) => Math.sqrt(Math.max(0, row[k]))) : x.map(() => NaN) };
  }

  // ---------------------------------------------------------------- модели фита
  const wrap = (v) => { let w = ((v + 180) % 360 + 360) % 360 - 180; return w; };
  const PARAM_NAMES = ['d', 'A', 'Auv', 'Eg', 'dRough', 'delta', 'Ak'];
  const K400_MAX = 0.05;                                                  // верхняя граница k хвоста при 400 нм в окончательном фите
  function makeResidFn(data, cfg, free, fixedVals, M) {
    const Nsub = cfg.Nsub, lam = data.lam, n = lam.length;
    return (x) => {
      const P = Object.assign({}, fixedVals); free.forEach((k, i) => P[k] = x[i]);
      const m = Object.assign({}, cfg.mat, { A: P.A, Auv: P.Auv, Eg: P.Eg, Ak: P.Ak || 0 });
      const r = modelPsiDelta(lam, Nsub, cfg.phi, P.d, m, P.delta || 0, P.dRough || 0, M || 20, cfg.back);
      const out = new Float64Array(2 * n);
      for (let i = 0; i < n; i++) { out[i] = (data.psi[i] - r.psi[i]) / data.sigPsi[i]; out[n + i] = wrap(data.del[i] - r.del[i]) / data.sigDel[i]; }
      return out;
    };
  }
  function boundsFor(k, cfg, prior) {
    const m = cfg.mat;
    switch (k) {
      case 'd': return [prior.dMin, prior.dMax, 5];
      case 'A': return [0.2 * m.A, 4 * m.A, 0.05 * m.A];
      case 'Auv': return [0, 3 * Math.abs(m.Auv) + 100, 0.05 * Math.abs(m.Auv) + 5];
      case 'Eg': return [Math.max(0.8, m.Eg - 1.0), Math.min(m.E0 - 0.15, m.Eg + 1.0), 0.05];
      case 'dRough': return [0, 12, 0.5];
      case 'delta': return [-0.20, 0.20, 0.01];
      case 'Ak': { const s = tailAk(m, 1e-3); return [0, tailAk(m, K400_MAX), s]; }      // k хвоста при 400 нм от 0 до K400_MAX
    }
  }
  /** Опорный фит однородной плёнки: грубый перебор d при справочной дисперсии → три лучших локальных минимума χ²(d) →
   *  ЛМ (аналитический якобиан, масштабированные параметры) по (d, A, Auv, Eg) из каждого; лучший по χ². */
  function referenceFit(data, cfg, prior) {
    const fixed = { dRough: 0, delta: 0, Ak: 0 };
    const base = { A: cfg.mat.A, Auv: cfg.mat.Auv, Eg: cfg.mat.Eg };
    const scan = makeResidJacFn(data, cfg, ['d'], Object.assign({}, fixed, base), 1);
    const step = Math.max(0.5, (prior.dMax - prior.dMin) / 120), grid = [], cost = [];
    for (let dg = prior.dMin; dg <= prior.dMax + 1e-9; dg += step) { const r = scan([dg], false).r; let c = 0; for (let i = 0; i < r.length; i++) c += r[i] * r[i]; grid.push(dg); cost.push(c); }
    const cands = [];
    for (let i = 0; i < grid.length; i++) if ((i === 0 || cost[i] <= cost[i - 1]) && (i === grid.length - 1 || cost[i] <= cost[i + 1])) cands.push(i);
    cands.sort((a, b) => cost[a] - cost[b]);
    const starts = cands.slice(0, 3).map(i => grid[i]), startCosts = cands.slice(0, 3).map(i => cost[i]);
    const free = ['d', 'A', 'Auv', 'Eg'];
    const b = free.map(k => boundsFor(k, cfg, prior));
    const margin = 0.3 * (prior.dMax - prior.dMin); b[0] = [prior.dMin - margin, prior.dMax + margin, b[0][2]];
    const fn = makeResidJacFn(data, cfg, free, fixed, 1);
    let res = null, nfev = 0;
    for (const d0 of starts) {
      const r = lmFitJac(fn, [d0, base.A, base.Auv, base.Eg], b.map(v => v[0]), b.map(v => v[1]), 80); nfev += r.nfev;
      if (!res || r.chi2 < res.chi2) res = r;
    }
    const P = {}; free.forEach((k, i) => P[k] = res.x[i]); P.dRough = 0; P.delta = 0; P.Ak = 0; P.k400 = 0;
    const E = {}; free.forEach((k, i) => E[k] = res.err[i]);
    return { P, E, resid: res.resid, chi2: res.chi2, free, starts, startCosts, nfev };
  }
  /** Число подслоёв лестницы градиента в окончательном фите по величине |δ|: 40; 80 при |δ| > 4 %; 160 при |δ| > 12 %
   *  (ошибка лестницы относительно непрерывного профиля ≤ 0.35σ по Δ во всём допустимом диапазоне ±20 %, см. docs/VERIFICATION.md). */
  const subLayersFor = (delta) => (Math.abs(delta) > 0.12 ? 160 : (Math.abs(delta) > 0.04 ? 80 : 40));
  /** Систематическая погрешность параметров от заявленных неопределённостей условий измерения (линейное распространение в решении):
   *  δx = −(JᵀJ)⁻¹ Jᵀ (∂r/∂q) Δq для q = угол (nuis.phiErr), доля задней стороны (nuis.backFerr), полоса (nuis.bwErr), сдвиг шкалы λ (nuis.offErr);
   *  ∂r/∂q — центральные разности по невязке. Возвращает {total: {param: ±}, parts: {phi, backF, bw, off: {param: ±}}} — полуширины при предельных Δq. */
  function sysErrors(data, cfg, free, fixed, M, x, nuis) {
    const fn0 = makeResidJacFn(data, cfg, free, fixed, M), ev = fn0(x, true), J = ev.J, m = ev.r.length, p = free.length;
    const JTJ = Array.from({ length: p }, () => new Array(p).fill(0));
    for (let a = 0; a < p; a++) for (let b = a; b < p; b++) { let s = 0; for (let i = 0; i < m; i++) s += J[a][i] * J[b][i]; JTJ[a][b] = s; JTJ[b][a] = s; }
    const inv = invert(JTJ); if (!inv) return null;
    const parts = {}, total = {}; free.forEach(k => total[k] = 0);
    const push = (name, rPlus, rMinus, hh, dq) => {                          // δx = −(JᵀJ)⁻¹ Jᵀ (∂r/∂q) Δq
      const g = new Array(p).fill(0);
      for (let a = 0; a < p; a++) { let s = 0; for (let i = 0; i < m; i++) s += J[a][i] * (rPlus[i] - rMinus[i]) / hh; g[a] = s; }
      const dx = {}; free.forEach((k, a) => { let s = 0; for (let b = 0; b < p; b++) s += inv[a][b] * g[b]; dx[k] = Math.abs(s * dq); total[k] += dx[k] * dx[k]; });
      parts[name] = dx;
    };
    const r = (cfgX, dataX) => makeResidJacFn(dataX || data, cfgX, free, fixed, M)(x, false).r;
    if (nuis.phiErr > 0) { const h = 0.005; push('phi', r(Object.assign({}, cfg, { phi: cfg.phi + h })), r(Object.assign({}, cfg, { phi: cfg.phi - h })), 2 * h, nuis.phiErr); }
    if (backOn(cfg.back) && nuis.backFerr > 0) { const h = 0.005, f = cfg.back.f; push('backF', r(Object.assign({}, cfg, { back: Object.assign({}, cfg.back, { f: Math.min(1, f + h) }) })), r(Object.assign({}, cfg, { back: Object.assign({}, cfg.back, { f: Math.max(0, f - h) }) })), Math.min(1, f + h) - Math.max(0, f - h), nuis.backFerr); }
    if (bandOn(cfg.band) && nuis.bwErr > 0) { const h = 0.05, bw = cfg.band.bw; push('bw', r(Object.assign({}, cfg, { band: Object.assign({}, cfg.band, { bw: bw + h }) })), r(Object.assign({}, cfg, { band: Object.assign({}, cfg.band, { bw: Math.max(1e-6, bw - h) }) })), bw + h - Math.max(1e-6, bw - h), nuis.bwErr); }
    if (nuis.offErr > 0 && cfg.subKey) {                                       // сдвиг шкалы: измерение снято при λ + off — модель в точках λ ± h
      const h = 0.02, lamP = data.lam.map(l => l + h), lamM = data.lam.map(l => l - h);
      const cP = Object.assign({}, cfg, { Nsub: substrateN(cfg.subKey, lamP) }), cM = Object.assign({}, cfg, { Nsub: substrateN(cfg.subKey, lamM) });
      push('off', r(cP, Object.assign({}, data, { lam: lamP })), r(cM, Object.assign({}, data, { lam: lamM })), 2 * h, nuis.offErr);
    }
    free.forEach(k => total[k] = Math.sqrt(total[k]));
    return { total, parts };
  }
  /** Порог вето для параметра дефекта k: √((3σ_форм)² + сист.²) — дефект должен превышать и формальную погрешность (3σ), и линейно
   *  распространённую систематику заявленных неопределённостей условий (если fin.sys есть). */
  function vetoThreshold(fin, k) { const e = fin.E[k] || 0, s = (fin.sys && fin.sys.total && isFinite(fin.sys.total[k])) ? fin.sys.total[k] : 0; return Math.sqrt(9 * e * e + s * s); }
  /** Фит в выбранной модели дефектов flags = {grad, rough, abs}: несколько стартов (толщины из перебора опорного фита × знак градиента),
   *  лучший по χ² дотягивается до сходимости; при |δ| > 4 % — повтор с 80 подслоями, при |δ| > 12 % — со 160. Поглощение — сила хвоста A_k
   *  (старт из p0.Ak); k₄₀₀ пересчитывается по найденной дисперсии (A, A_uv, E_g фита), а не по справочной. cfg.band — полоса прибора в модели.
   *  nuis = {phiErr, backFerr, bwErr, offErr} (необязательно) — систематические погрешности от неопределённости условий, поле sys. */
  function finalFit(data, cfg, prior, flags, p0, nuis) {
    const free = ['d', 'A', 'Auv', 'Eg']; if (flags.rough) free.push('dRough'); if (flags.grad) free.push('delta'); if (flags.abs) free.push('Ak');
    const fixed = { dRough: 0, delta: 0, Ak: 0 };
    const b = free.map(k => boundsFor(k, cfg, prior));
    const margin = 0.3 * (prior.dMax - prior.dMin); b[0] = [prior.dMin - margin, prior.dMax + margin, b[0][2]];
    const lo = b.map(v => v[0]), hi = b.map(v => v[1]);
    const clampP = (P) => free.map((k, i) => Math.min(hi[i], Math.max(lo[i], P[k] === undefined ? 0 : P[k])));
    // альтернативные старты: толщины из перебора опорного фита, если их грубый χ² не хуже лучшего более чем в 5 раз; знак δ — если |δ| ≤ 1 %
    const sc = p0.startCosts || [], best0 = sc.length ? Math.min(...sc) : 0;
    const alt = (p0.starts || []).filter((v, i) => Math.abs(v - p0.d) > 1.0 && (!sc.length || sc[i] <= 5 * best0));
    const dStarts = [p0.d].concat(alt).slice(0, 3);
    const d0 = flags.grad ? (p0.delta || 0) : 0;
    const deltaStarts = flags.grad ? (Math.abs(d0) <= 0.01 ? (Math.abs(d0) > 1e-4 ? [d0, -d0] : [0.004, -0.004]) : [d0]) : [0];
    // разведка бассейнов на грубой модели (10 подслоёв), затем лучший старт дотягивается на 40 подслоях
    const fn10 = makeResidJacFn(data, cfg, free, fixed, flags.grad ? 10 : 40), fn40 = makeResidJacFn(data, cfg, free, fixed, 40);
    let best = null, nfev = 0, nStarts = 0;
    let base = Object.assign({}, p0, { dRough: Math.max(0.1, p0.dRough || 0.1), Ak: 0 });
    if (flags.abs) {
      // Поглощение: опорный фит без хвоста искажает дисперсию (A, E_g растут, компенсируя затухание полос), и старт из него
      // ведёт в ложный минимум. Раунд А: старты по силе хвоста (оценка ИИ и k₄₀₀ = 10⁻⁴, 10⁻³, 10⁻²) × дисперсия
      // (опорный фит / справочник) при основной толщине; лучший по χ² задаёт дисперсию и хвост для раунда Б.
      const kEst = p0.Ak > 0 ? tailK400(cfg.mat, p0.Ak) : 0, ks = [];
      for (const k of [kEst, 1e-4, 1e-3, 1e-2]) if (k >= 3e-5 && !ks.some(v => Math.abs(Math.log(v / k)) < 0.5)) ks.push(k);
      const disp = [{ A: p0.A, Auv: p0.Auv, Eg: p0.Eg }, { A: cfg.mat.A, Auv: cfg.mat.Auv, Eg: cfg.mat.Eg }];
      let bestA = null;
      for (const dp of disp) for (const k of ks) {
        const x0 = clampP(Object.assign({}, base, dp, { delta: deltaStarts[0], Ak: tailAk(cfg.mat, k) }));
        const r = lmFitJac(fn10, x0, lo, hi, 20); nfev += r.nfev; nStarts++;
        if (!bestA || r.chi2 < bestA.chi2) bestA = r;
      }
      const PA = {}; free.forEach((k, i) => PA[k] = bestA.x[i]);
      base = Object.assign({}, base, { A: PA.A, Auv: PA.Auv, Eg: PA.Eg, Ak: PA.Ak, dRough: Math.max(0.1, PA.dRough || 0.1) });
      if (dStarts.length === 1 && deltaStarts.length === 1) best = bestA;
    }
    const cands = [];
    for (const dS of dStarts) for (const dl of deltaStarts) cands.push(clampP(Object.assign({}, base, { d: dS, delta: dl })));
    if (cands.length > 1) cands.forEach((x0) => { const r = lmFitJac(fn10, x0, lo, hi, 25); nfev += r.nfev; nStarts++; if (!best || r.chi2 < best.chi2) best = r; });
    let res = lmFitJac(fn40, best ? best.x : cands[0], lo, hi, 80); nfev += res.nfev; nStarts = Math.max(1, nStarts);
    const iD = free.indexOf('delta'); let Mfin = 40;
    if (iD >= 0 && subLayersFor(res.x[iD]) > 40) { Mfin = subLayersFor(res.x[iD]); const rM = lmFitJac(makeResidJacFn(data, cfg, free, fixed, Mfin), res.x, lo, hi, 40); nfev += rM.nfev; res = rM; }   // 80 или 160 подслоёв
    const P = { dRough: 0, delta: 0, Ak: 0 }; free.forEach((k, i) => P[k] = res.x[i]);
    const E = {}; free.forEach((k, i) => E[k] = res.err[i]);
    const mFit = Object.assign({}, cfg.mat, { A: P.A, Auv: P.Auv, Eg: P.Eg });                  // k₄₀₀ — по найденной дисперсии
    const dk400 = (Ak) => { const h = Math.max(1e-6, 1e-3 * Ak); return (tailK400(mFit, Ak + h) - tailK400(mFit, Ak)) / h; };
    if (flags.abs) { P.k400 = tailK400(mFit, P.Ak); E.k400 = E.Ak * dk400(P.Ak); } else { P.k400 = 0; }
    let sys = null;
    if (nuis) { sys = sysErrors(data, cfg, free, fixed, Mfin, res.x, nuis); if (sys && flags.abs) { const dk = dk400(P.Ak); sys.total.k400 = sys.total.Ak * dk; for (const q of Object.keys(sys.parts)) sys.parts[q].k400 = sys.parts[q].Ak * dk; } }
    return { P, E, sys, resid: res.resid, chi2: res.chi2, free, nfev, starts: nStarts, M: Mfin };
  }

  // ---------------------------------------------------------------- аналитический якобиан (Фурман–Тихонравов, разд. 1.4.1: формулы 1.4.9–1.4.16) и ЛМ с масштабированием
  function ccos(a) { return [Math.cos(a[0]) * Math.cosh(a[1]), -Math.sin(a[0]) * Math.sinh(a[1])]; }
  function csin(a) { return [Math.sin(a[0]) * Math.cosh(a[1]), Math.cos(a[0]) * Math.sinh(a[1])]; }
  function mmul(A, B) {
    return [[cadd(cmul(A[0][0], B[0][0]), cmul(A[0][1], B[1][0])), cadd(cmul(A[0][0], B[0][1]), cmul(A[0][1], B[1][1]))],
            [cadd(cmul(A[1][0], B[0][0]), cmul(A[1][1], B[1][0])), cadd(cmul(A[1][0], B[0][1]), cmul(A[1][1], B[1][1]))]];
  }
  const trace2 = (G, X) => cadd(cadd(cmul(G[0][0], X[0][0]), cmul(G[0][1], X[1][0])), cadd(cmul(G[1][0], X[0][1]), cmul(G[1][1], X[1][1])));
  const I2 = [[[1, 0], [0, 0]], [[0, 0], [1, 0]]];

  /** Показатель плёнки N = n − ik и его производные по A, Auv, Eg, Ak (комплексные): N = sqrt(conj ε), dN/dp = conj(∂ε/∂p)/(2N).
   *  ∂ε/∂A, ∂ε/∂Auv и ∂ε/∂Ak аналитические (ε_TL линейна по силе осциллятора), ∂ε/∂Eg — центральная разность по скалярной функции. */
  function filmNJac(lam, m) {
    const n = lam.length, N = new Array(n), dA = new Array(n), dAuv = new Array(n), dEg = new Array(n), dAk = new Array(n), h = 1e-5, Ak = m.Ak || 0;
    for (let i = 0; i < n; i++) {
      const E = HC / lam[i], [e1, e2] = tlEps(E, m.A, m.E0, m.C, m.Eg), uvd = m.Euv * m.Euv - E * E;
      const [t1, t2] = tlEps(E, 1, m.E0, m.C, TAIL_ET);                                   // хвост единичной силы: ∂ε/∂Ak
      let Nv = csqrt([1 + e1 + m.Auv / uvd + (Ak ? Ak * t1 : 0), -(e2 + (Ak ? Ak * t2 : 0))]); Nv = [Math.abs(Nv[0]), -Math.abs(Nv[1])]; N[i] = Nv;
      const g = cdiv([0.5, 0], Nv);
      dA[i] = cmul(g, [e1 / m.A, -e2 / m.A]);
      dAuv[i] = cmul(g, [1 / uvd, 0]);
      dAk[i] = cmul(g, [t1, -t2]);
      const [p1, p2] = tlEps(E, m.A, m.E0, m.C, m.Eg + h), [q1, q2] = tlEps(E, m.A, m.E0, m.C, m.Eg - h);
      dEg[i] = cmul(g, [(p1 - q1) / (2 * h), -(p2 - q2) / (2 * h)]);
    }
    return { N, dN: { A: dA, Auv: dAuv, Eg: dEg, Ak: dAk } };
  }

  /** Слои сверху вниз с чувствительностями: {N, d, dN: {param: [complex]}, dNs: {param: scalar}, dd: {param: number}};
   *  чувствительность по параметру = dNs[param] · dN[param][i]. Геометрия совпадает с buildLayers. */
  /** forceGrad / forceRough: строить лестницу подслоёв и слой ЭС даже при δ = 0 / d_r = 0, когда эти параметры свободны — иначе производные
   *  ∂/∂δ и ∂/∂d_r в нуле получались тождественно нулевыми (физически они ненулевые: слой нулевой толщины имеет D_j ≠ 0). */
  function buildLayersJac(lam, P, mat, M, forceGrad, forceRough) {
    const fj = filmNJac(lam, Object.assign({}, mat, { A: P.A, Auv: P.Auv, Eg: P.Eg, Ak: P.Ak || 0 }));
    const Nf = fj.N, delta = P.delta || 0, d = P.d, dRough = P.dRough || 0, n = lam.length, sub = (delta || forceGrad) ? M : 1;
    const film = [];
    for (let j = sub - 1; j >= 0; j--) {
      const z = sub === 1 ? 0.5 : (j + 0.5) / sub, sc = 1 + delta * (z - 0.5);
      film.push({ N: sc === 1 ? Nf : Nf.map(v => [v[0] * sc, v[1] * sc]), d: d / sub, dN: { A: fj.dN.A, Auv: fj.dN.Auv, Eg: fj.dN.Eg, Ak: fj.dN.Ak, delta: Nf }, dNs: { A: sc, Auv: sc, Eg: sc, Ak: sc, delta: z - 0.5 }, dd: { d: 1 / sub } });
    }
    const layers = [];
    if (dRough > 0 || forceRough) {
      const top = film[0], N = new Array(n), dN = { A: new Array(n), Auv: new Array(n), Eg: new Array(n), Ak: new Array(n), delta: new Array(n) };
      for (let i = 0; i < n; i++) {
        const Nt = top.N[i], eps = cmul(Nt, Nt);
        const b = [0.5 * (eps[0] + 1), 0.5 * eps[1]], sq = csqrt(cadd(cmul(b, b), [8 * eps[0], 8 * eps[1]]));
        let sgn = 1, e = [(b[0] + sq[0]) / 4, (b[1] + sq[1]) / 4]; if (e[0] <= 0) { sgn = -1; e = [(b[0] - sq[0]) / 4, (b[1] - sq[1]) / 4]; }
        let Ne = csqrt(e); Ne = [Math.abs(Ne[0]), -Math.abs(Ne[1])]; N[i] = Ne;
        const dEdEt = cadd([0.125, 0], cdiv([sgn * (b[0] + 8) / 8, sgn * b[1] / 8], sq));           // dε_ema/dε_top
        const chain = cmul(cmul(dEdEt, cdiv([0.5, 0], Ne)), [2 * Nt[0], 2 * Nt[1]]);               // dN_e/dN_top
        for (const key of ['A', 'Auv', 'Eg', 'Ak', 'delta']) { const v = top.dN[key][i], sc = top.dNs[key]; dN[key][i] = cmul(chain, [v[0] * sc, v[1] * sc]); }
      }
      layers.push({ N, d: dRough, dN, dNs: { A: 1, Auv: 1, Eg: 1, Ak: 1, delta: 1 }, dd: { dRough: 1 } });
    }
    return layers.concat(film);
  }

  /** r_p, r_s и ∂r/∂x по списку параметров free: матричный метод Абелеса; D_j (1.4.9), N_j (∂M_j/∂n_j), Ψ_r (1.4.10),
   *  ∂r/∂x_j = Tr(Ψ_r^{j−1} M^{j+1} X_j) (1.4.12, 1.4.16) и цепное правило к глобальным параметрам. r_p — в эллипсометрической конвенции.
   *  Реализация без промежуточных аллокаций: комплексные 2×2 матрицы — блоки по 8 чисел в Float64Array. */
  function rhoStackJac(lam, layers, Nsub, phi, free) {
    const s0 = Math.sin(phi * PI / 180), s02 = s0 * s0, c0 = Math.cos(phi * PI / 180);
    const nL = layers.length, nP = free.length, n = lam.length;
    const RP = new Array(n), RS = new Array(n), dRP = free.map(() => new Array(n)), dRS = free.map(() => new Array(n));
    const Mb = new Float64Array(8 * Math.max(1, nL)), Db = new Float64Array(8 * Math.max(1, nL)), Nb_ = new Float64Array(8 * Math.max(1, nL));
    const Pb = new Float64Array(8 * (nL + 1)), Bb = new Float64Array(8 * Math.max(1, nL)), T = new Float64Array(8), G = new Float64Array(8), PsiR = new Float64Array(8);
    const ddKey = layers.map(L => free.map(k => (L.dd && L.dd[k]) ? L.dd[k] : 0)), dNKey = layers.map(L => free.map(k => (L.dN && L.dN[k]) ? L.dN[k] : null)), dNs = layers.map(L => free.map(k => (L.dNs && L.dNs[k] !== undefined) ? L.dNs[k] : 1));
    // C = A × B для блоков (offsets a, b, c)
    const mm = (A, a, B, b, Cm, c) => {
      const a11r = A[a], a11i = A[a + 1], a12r = A[a + 2], a12i = A[a + 3], a21r = A[a + 4], a21i = A[a + 5], a22r = A[a + 6], a22i = A[a + 7];
      const b11r = B[b], b11i = B[b + 1], b12r = B[b + 2], b12i = B[b + 3], b21r = B[b + 4], b21i = B[b + 5], b22r = B[b + 6], b22i = B[b + 7];
      Cm[c] = a11r * b11r - a11i * b11i + a12r * b21r - a12i * b21i; Cm[c + 1] = a11r * b11i + a11i * b11r + a12r * b21i + a12i * b21r;
      Cm[c + 2] = a11r * b12r - a11i * b12i + a12r * b22r - a12i * b22i; Cm[c + 3] = a11r * b12i + a11i * b12r + a12r * b22i + a12i * b22r;
      Cm[c + 4] = a21r * b11r - a21i * b11i + a22r * b21r - a22i * b21i; Cm[c + 5] = a21r * b11i + a21i * b11r + a22r * b21i + a22i * b21r;
      Cm[c + 6] = a21r * b12r - a21i * b12i + a22r * b22r - a22i * b22i; Cm[c + 7] = a21r * b12i + a21i * b12r + a22r * b22i + a22i * b22r;
    };
    let trR = 0, trI = 0;
    const tr = (A, a, X, x) => {   // Tr(A X) = a11 x11 + a12 x21 + a21 x12 + a22 x22
      trR = A[a] * X[x] - A[a + 1] * X[x + 1] + A[a + 2] * X[x + 4] - A[a + 3] * X[x + 5] + A[a + 4] * X[x + 2] - A[a + 5] * X[x + 3] + A[a + 6] * X[x + 6] - A[a + 7] * X[x + 7];
      trI = A[a] * X[x + 1] + A[a + 1] * X[x] + A[a + 2] * X[x + 5] + A[a + 3] * X[x + 4] + A[a + 4] * X[x + 3] + A[a + 5] * X[x + 2] + A[a + 6] * X[x + 7] + A[a + 7] * X[x + 6];
    };
    const drR = new Float64Array(nP), drI = new Float64Array(nP);
    for (let i = 0; i < n; i++) {
      const k = 2 * PI / lam[i], Nbr = Nsub[i][0], Nbi = Nsub[i][1];
      // cos γ подложки: sqrt(1 − s0²/Nb²)
      let N2r = Nbr * Nbr - Nbi * Nbi, N2i = 2 * Nbr * Nbi, den = N2r * N2r + N2i * N2i, qr = s02 * N2r / den, qi = -s02 * N2i / den, ar = 1 - qr, ai = -qi, mod = Math.hypot(ar, ai);
      let cbr = Math.sqrt(Math.max(0, (mod + ar) / 2)), cbi = Math.sqrt(Math.max(0, (mod - ar) / 2)); if (ai < 0) cbi = -cbi;
      for (let pol = 0; pol < 2; pol++) {
        const isS = pol === 0, qa = isS ? c0 : 1 / c0;
        let qsr, qsi; if (isS) { qsr = Nbr * cbr - Nbi * cbi; qsi = Nbr * cbi + Nbi * cbr; } else { const dd = cbr * cbr + cbi * cbi; qsr = (Nbr * cbr + Nbi * cbi) / dd; qsi = (Nbi * cbr - Nbr * cbi) / dd; }
        for (let a = 0; a < nL; a++) {
          const Nr = layers[a].N[i][0], Ni = layers[a].N[i][1], dj = layers[a].d;
          N2r = Nr * Nr - Ni * Ni; N2i = 2 * Nr * Ni; den = N2r * N2r + N2i * N2i; qr = s02 * N2r / den; qi = -s02 * N2i / den; ar = 1 - qr; ai = -qi; mod = Math.hypot(ar, ai);
          let cr = Math.sqrt(Math.max(0, (mod + ar) / 2)), ci = Math.sqrt(Math.max(0, (mod - ar) / 2)); if (ai < 0) ci = -ci;    // cos γ_j
          const ncr = Nr * cr - Ni * ci, nci = Nr * ci + Ni * cr;                                        // N cos γ
          let qjr, qji; if (isS) { qjr = ncr; qji = nci; } else { const dd = cr * cr + ci * ci; qjr = (Nr * cr + Ni * ci) / dd; qji = (Ni * cr - Nr * ci) / dd; }
          const phr = k * dj * ncr, phi_ = k * dj * nci;
          const cpr = Math.cos(phr) * Math.cosh(phi_), cpi = -Math.sin(phr) * Math.sinh(phi_), spr = Math.sin(phr) * Math.cosh(phi_), spi = Math.cos(phr) * Math.sinh(phi_);
          const qq = qjr * qjr + qji * qji, ioqr = qji / qq, ioqi = qjr / qq;                             // i/q = (i q*)/|q|² → (qji + i qjr)/|q|²
          const iqr = -qji, iqi = qjr;                                                                    // i q
          const o = 8 * a;
          // M_j = [[cos φ, (i/q) sin φ], [i q sin φ, cos φ]]
          Mb[o] = cpr; Mb[o + 1] = cpi; Mb[o + 2] = ioqr * spr - ioqi * spi; Mb[o + 3] = ioqr * spi + ioqi * spr;
          Mb[o + 4] = iqr * spr - iqi * spi; Mb[o + 5] = iqr * spi + iqi * spr; Mb[o + 6] = cpr; Mb[o + 7] = cpi;
          // D_j = k N cos γ · [[−sin φ, (i/q) cos φ], [i q cos φ, −sin φ]]
          const dpr = k * ncr, dpi = k * nci;
          const x12r = ioqr * cpr - ioqi * cpi, x12i = ioqr * cpi + ioqi * cpr, x21r = iqr * cpr - iqi * cpi, x21i = iqr * cpi + iqi * cpr;
          Db[o] = -(dpr * spr - dpi * spi); Db[o + 1] = -(dpr * spi + dpi * spr); Db[o + 2] = dpr * x12r - dpi * x12i; Db[o + 3] = dpr * x12i + dpi * x12r;
          Db[o + 4] = dpr * x21r - dpi * x21i; Db[o + 5] = dpr * x21i + dpi * x21r; Db[o + 6] = Db[o]; Db[o + 7] = Db[o + 1];
          // N_j = f1 D_j + c [[0, −(i/q²) sin φ], [i sin φ, 0]],  f1 = d/(N cos²γ),  c = 1/cosγ (s) или (1 − tan²γ)/cosγ = (2cos²γ − 1)/cos³γ (p)
          const c2r = cr * cr - ci * ci, c2i = 2 * cr * ci;                                               // cos²γ
          const nc2r = Nr * c2r - Ni * c2i, nc2i = Nr * c2i + Ni * c2r, nc2m = nc2r * nc2r + nc2i * nc2i;
          const f1r = dj * nc2r / nc2m, f1i = -dj * nc2i / nc2m;
          let cfr, cfi;
          if (isS) { const cm = cr * cr + ci * ci; cfr = cr / cm; cfi = -ci / cm; }
          else { const numr = 2 * c2r - 1, numi = 2 * c2i, c3r = c2r * cr - c2i * ci, c3i = c2r * ci + c2i * cr, c3m = c3r * c3r + c3i * c3i; cfr = (numr * c3r + numi * c3i) / c3m; cfi = (numi * c3r - numr * c3i) / c3m; }
          // −(i/q²) sin φ = −i sin φ / q²;  q² = qjr² − qji² + 2i qjr qji
          const q2r = qjr * qjr - qji * qji, q2i = 2 * qjr * qji, q2m = q2r * q2r + q2i * q2i;
          const isr = -spi, isi = spr;                                                                     // i sin φ
          const t12r = -(isr * q2r + isi * q2i) / q2m, t12i = -(isi * q2r - isr * q2i) / q2m;             // −(i sin φ)/q²
          const T12r = cfr * t12r - cfi * t12i, T12i = cfr * t12i + cfi * t12r, T21r = cfr * isr - cfi * isi, T21i = cfr * isi + cfi * isr;
          for (let e = 0; e < 8; e += 2) { Nb_[o + e] = f1r * Db[o + e] - f1i * Db[o + e + 1]; Nb_[o + e + 1] = f1r * Db[o + e + 1] + f1i * Db[o + e]; }
          Nb_[o + 2] += T12r; Nb_[o + 3] += T12i; Nb_[o + 4] += T21r; Nb_[o + 5] += T21i;
        }
        // префиксы P_a = M_0 ⋯ M_{a−1}
        Pb[0] = 1; Pb[1] = 0; Pb[2] = 0; Pb[3] = 0; Pb[4] = 0; Pb[5] = 0; Pb[6] = 1; Pb[7] = 0;
        for (let a = 0; a < nL; a++) mm(Pb, 8 * a, Mb, 8 * a, Pb, 8 * (a + 1));
        const mo = 8 * nL, m11r = Pb[mo], m11i = Pb[mo + 1], m12r = Pb[mo + 2], m12i = Pb[mo + 3], m21r = Pb[mo + 4], m21i = Pb[mo + 5], m22r = Pb[mo + 6], m22i = Pb[mo + 7];
        const qaqsr = qa * qsr, qaqsi = qa * qsi;
        const dnr = qa * m11r + (qsr * m22r - qsi * m22i) + (qaqsr * m12r - qaqsi * m12i) + m21r, dni = qa * m11i + (qsr * m22i + qsi * m22r) + (qaqsr * m12i + qaqsi * m12r) + m21i;
        const nur = qa * m11r + (qaqsr * m12r - qaqsi * m12i) - (qsr * m22r - qsi * m22i) - m21r, nui = qa * m11i + (qaqsr * m12i + qaqsi * m12r) - (qsr * m22i + qsi * m22r) - m21i;
        const dm = dnr * dnr + dni * dni, rr = (nur * dnr + nui * dni) / dm, ri = (nui * dnr - nur * dni) / dm;
        // f = t/(2 q_a) = 1/den
        const fr = dnr / dm, fi = -dni / dm, omr_r = 1 - rr, omr_i = -ri, mop_r = -1 - rr, mop_i = -ri;
        // Ψ_r = f [[q_a(1−r), −(1+r)], [q_a q_s (1−r), −q_s (1+r)]]
        let tr_ = qa * omr_r, ti_ = qa * omr_i; PsiR[0] = fr * tr_ - fi * ti_; PsiR[1] = fr * ti_ + fi * tr_;
        PsiR[2] = fr * mop_r - fi * mop_i; PsiR[3] = fr * mop_i + fi * mop_r;
        tr_ = qaqsr * omr_r - qaqsi * omr_i; ti_ = qaqsr * omr_i + qaqsi * omr_r; PsiR[4] = fr * tr_ - fi * ti_; PsiR[5] = fr * ti_ + fi * tr_;
        tr_ = qsr * mop_r - qsi * mop_i; ti_ = qsr * mop_i + qsi * mop_r; PsiR[6] = fr * tr_ - fi * ti_; PsiR[7] = fr * ti_ + fi * tr_;
        // суффиксы B_a = M_{a+1} ⋯ M_{nL−1}
        if (nL) { const bo = 8 * (nL - 1); Bb[bo] = 1; Bb[bo + 1] = 0; Bb[bo + 2] = 0; Bb[bo + 3] = 0; Bb[bo + 4] = 0; Bb[bo + 5] = 0; Bb[bo + 6] = 1; Bb[bo + 7] = 0; for (let a = nL - 2; a >= 0; a--) mm(Mb, 8 * (a + 1), Bb, 8 * (a + 1), Bb, 8 * a); }
        drR.fill(0); drI.fill(0);
        for (let a = 0; a < nL; a++) {
          mm(PsiR, 0, Pb, 8 * a, T, 0); mm(Bb, 8 * a, T, 0, G, 0);
          tr(G, 0, Db, 8 * a); const ddr = trR, ddi = trI;
          tr(G, 0, Nb_, 8 * a); const dnr_ = trR, dni_ = trI;
          const ddk = ddKey[a], dNk = dNKey[a], dNsA = dNs[a];
          for (let p = 0; p < nP; p++) {
            if (ddk[p]) { drR[p] += ddr * ddk[p]; drI[p] += ddi * ddk[p]; }
            if (dNk[p]) { const v = dNk[p][i], sc = dNsA[p]; drR[p] += (dnr_ * v[0] - dni_ * v[1]) * sc; drI[p] += (dnr_ * v[1] + dni_ * v[0]) * sc; }
          }
        }
        if (isS) { RS[i] = [rr, ri]; for (let p = 0; p < nP; p++) dRS[p][i] = [drR[p], drI[p]]; }
        else { RP[i] = [-rr, -ri]; for (let p = 0; p < nP; p++) dRP[p][i] = [-drR[p], -drI[p]]; }
      }
    }
    return { RP, RS, dRP, dRS };
  }

  /** Ψ, Δ (град) и их производные: dΨ = ½ sin2Ψ · Re(ρ'/ρ), dΔ = Im(ρ'/ρ), ρ = r_p/r_s. */
  function psiDeltaJac(RP, RS, dRP, dRS) {
    const n = RP.length, nP = dRP.length, deg = 180 / PI;
    const psi = new Float64Array(n), del = new Float64Array(n), dpsi = dRP.map(() => new Float64Array(n)), ddel = dRP.map(() => new Float64Array(n));
    for (let i = 0; i < n; i++) {
      const rp = RP[i], rs = RS[i], tanPsi = Math.sqrt((rp[0] * rp[0] + rp[1] * rp[1]) / (rs[0] * rs[0] + rs[1] * rs[1]));
      psi[i] = Math.atan(tanPsi) * deg;
      let d = Math.atan2(rp[1] * rs[0] - rp[0] * rs[1], rp[0] * rs[0] + rp[1] * rs[1]) * deg; if (d < 0) d += 360; del[i] = d;
      const s2 = 2 * tanPsi / (1 + tanPsi * tanPsi);
      for (let p = 0; p < nP; p++) { const g = csub(cdiv(dRP[p][i], rp), cdiv(dRS[p][i], rs)); dpsi[p][i] = 0.5 * s2 * g[0] * deg; ddel[p][i] = g[1] * deg; }
    }
    return { psi, del, dpsi, ddel };
  }

  /** Ненормированные элементы Мюллера и их производные из r_p, r_s и ∂r_p, ∂r_s: dI_p = 2 Re(r_p* ∂r_p), dZ = ∂r_p r_s* + r_p ∂r_s*. */
  function muellerJac(RP, RS, dRP, dRS) {
    const n = RP.length, nP = dRP.length, R = muellerFromR(RP, RS), dR = [];
    for (let p = 0; p < nP; p++) {
      const Ip = new Float64Array(n), Is = new Float64Array(n), Zr = new Float64Array(n), Zi = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const a = RP[i][0], b = RP[i][1], c = RS[i][0], d = RS[i][1], da = dRP[p][i][0], db = dRP[p][i][1], dc = dRS[p][i][0], dd = dRS[p][i][1];
        Ip[i] = 2 * (a * da + b * db); Is[i] = 2 * (c * dc + d * dd);
        Zr[i] = da * c + a * dc + db * d + b * dd; Zi[i] = db * c + b * dc - da * d - a * dd;
      }
      dR.push({ Ip, Is, Zr, Zi });
    }
    return { R, dR };
  }
  /** Ψ, Δ (град) и производные из ненормированных элементов Мюллера: N = (I_s − I_p)/T, C = 2Z_r/T, S = 2Z_i/T, T = I_p + I_s;
   *  Ψ = ½ arccos N → dΨ = −dN/(2 sin 2Ψ); Δ = atan2(S, C) → dΔ = (C dS − S dC)/(C² + S²). */
  function psiDeltaJacMueller(R, dR) {
    const n = R.Ip.length, nP = dR.length, deg = 180 / PI;
    const psi = new Float64Array(n), del = new Float64Array(n), dpsi = dR.map(() => new Float64Array(n)), ddel = dR.map(() => new Float64Array(n));
    for (let i = 0; i < n; i++) {
      const Ip = R.Ip[i], Is = R.Is[i], Zr = R.Zr[i], Zi = R.Zi[i], T = Ip + Is, T2 = T * T;
      const N = (Is - Ip) / T, C = 2 * Zr / T, S = 2 * Zi / T;
      psi[i] = 0.5 * Math.acos(Math.max(-1, Math.min(1, N))) * deg; let d = Math.atan2(S, C) * deg; if (d < 0) d += 360; del[i] = d;
      const s2 = Math.max(1e-12, Math.sqrt(Math.max(0, 1 - N * N))), cs2 = Math.max(1e-300, C * C + S * S);
      for (let p = 0; p < nP; p++) {
        const dIp = dR[p].Ip[i], dIs = dR[p].Is[i], dZr = dR[p].Zr[i], dZi = dR[p].Zi[i], dT = dIp + dIs;
        const dN = ((dIs - dIp) * T - (Is - Ip) * dT) / T2, dC = 2 * (dZr * T - Zr * dT) / T2, dS = 2 * (dZi * T - Zi * dT) / T2;
        dpsi[p][i] = -0.5 * dN / s2 * deg; ddel[p][i] = (C * dS - S * dC) / cs2 * deg;
      }
    }
    return { psi, del, dpsi, ddel };
  }

  /** Шаги центральных разностей для численного якобиана (только при включённой задней стороне подложки). */
  const JAC_STEP = { d: () => 1e-3, A: (v) => 1e-4 * Math.max(1, Math.abs(v)), Auv: (v) => 1e-4 * Math.max(10, Math.abs(v)), Eg: () => 1e-5, dRough: () => 1e-4, delta: () => 2e-6, Ak: (v) => 1e-4 * Math.max(0.01, Math.abs(v)) };
  /** Невязка и аналитический якобиан для ЛМ: fn(x, needJ) → {r, J?, psi, del}; при needJ = false — только невязка (быстрый путь).
   *  cfg.band = {bw, subKey} — полоса прибора в модели (второй порядок, три сетки λ); тогда аналитический якобиан идёт через элементы Мюллера.
   *  При cfg.back (задняя сторона подложки) якобиан считается центральными разностями по невязке с некогерентной суммой пучков. */
  function makeResidJacFn(data, cfg, free, fixedVals, M) {
    const lam = data.lam, n = lam.length, Mm = M || 40, back = backOn(cfg.back) ? cfg.back : null, band = bandOn(cfg.band) ? cfg.band : null;
    const lamJ = band ? lam3Of(lam, BAND_H) : lam, NsubJ = band ? substrateN(band.subKey || cfg.subKey, lamJ) : cfg.Nsub, sg = band ? band.bw / 2.3548 : 0;
    const forceGrad = free.includes('delta'), forceRough = free.includes('dRough');
    const evalR = (P) => {                                                    // невязка без якобиана
      const m = Object.assign({}, cfg.mat, { A: P.A, Auv: P.Auv, Eg: P.Eg, Ak: P.Ak || 0 });
      const { psi, del } = modelPsiDelta(lam, cfg.Nsub, cfg.phi, P.d, m, P.delta || 0, P.dRough || 0, Mm, back, band);
      const r = new Float64Array(2 * n);
      for (let i = 0; i < n; i++) { r[i] = (data.psi[i] - psi[i]) / data.sigPsi[i]; r[n + i] = wrap(data.del[i] - del[i]) / data.sigDel[i]; }
      return { r, psi, del };
    };
    return (x, needJ) => {
      const P = Object.assign({}, fixedVals); free.forEach((k, i) => P[k] = x[i]);
      if (needJ === false) return evalR(P);
      if (back) {                                                              // с задней стороной якобиан — центральные разности (аналитический есть только для r)
        const base = evalR(P), J = free.map(() => new Float64Array(2 * n));
        free.forEach((k, p) => {
          const h = JAC_STEP[k] ? JAC_STEP[k](P[k]) : 1e-4 * Math.max(1, Math.abs(P[k]));
          const lo0 = (k === 'dRough' || k === 'Ak' || k === 'Auv') ? 0 : -Infinity;             // неотрицательные параметры: у нуля — односторонняя разность
          const Pp = Object.assign({}, P, { [k]: P[k] + h }), Pm = Object.assign({}, P, { [k]: Math.max(lo0, P[k] - h) });
          const hh = Pp[k] - Pm[k], rp = evalR(Pp).r, rm = evalR(Pm).r;
          for (let i = 0; i < 2 * n; i++) J[p][i] = (rp[i] - rm[i]) / hh;
        });
        return { r: base.r, J, psi: base.psi, del: base.del };
      }
      const r = new Float64Array(2 * n);
      const layers = buildLayersJac(lamJ, P, cfg.mat, Mm, forceGrad, forceRough);
      const { RP, RS, dRP, dRS } = rhoStackJac(lamJ, layers, NsubJ, cfg.phi, free);
      let psi, del, dpsi, ddel;
      if (!band) ({ psi, del, dpsi, ddel } = psiDeltaJac(RP, RS, dRP, dRS));
      else {
        const { R, dR } = muellerJac(RP, RS, dRP, dRS);
        ({ psi, del, dpsi, ddel } = psiDeltaJacMueller(band2All(R, n, sg, BAND_H), dR.map(D => band2All(D, n, sg, BAND_H))));
      }
      const J = free.map(() => new Float64Array(2 * n));
      for (let i = 0; i < n; i++) {
        r[i] = (data.psi[i] - psi[i]) / data.sigPsi[i]; r[n + i] = wrap(data.del[i] - del[i]) / data.sigDel[i];
        for (let p = 0; p < free.length; p++) { J[p][i] = -dpsi[p][i] / data.sigPsi[i]; J[p][n + i] = -ddel[p][i] / data.sigDel[i]; }
      }
      return { r, J, psi, del };
    };
  }

  /** ЛМ с аналитическим якобианом. Параметры масштабированы преобразованием x = lo + (hi − lo)(1 + sin θ)/2:
   *  θ безразмерны и O(1), границы соблюдаются гладко (без отсечения). Демпфирование по Нильсену (gain ratio),
   *  диагональное масштабирование Марквардта с нижним порогом; пробные шаги — без якобиана. Ковариация — по J_x в решении. */
  function lmFitJac(residJac, x0, lo, hi, maxIter) {
    maxIter = maxIter || 60;
    const p = x0.length, W = lo.map((v, k) => hi[k] - v);
    const toX = (th) => th.map((v, k) => lo[k] + W[k] * (1 + Math.sin(v)) / 2);
    const toTh = (x) => x.map((v, k) => Math.asin(Math.max(-0.999999, Math.min(0.999999, 2 * (v - lo[k]) / W[k] - 1))));
    let th = toTh(x0), x = toX(th), ev = residJac(x, true), r = ev.r, Jx = ev.J;
    const m = r.length;
    let F = 0; for (let i = 0; i < m; i++) F += r[i] * r[i]; F *= 0.5;
    let lam = -1, nu = 2, nfev = 1, nit = 0;
    const JTJ = Array.from({ length: p }, () => new Array(p).fill(0)), g = new Array(p).fill(0), D = new Array(p).fill(0);
    for (let it = 0; it < maxIter; it++) {
      nit++;
      const sc = th.map((v, k) => W[k] / 2 * Math.cos(v));                     // dx/dθ
      let maxD = 0;
      for (let a = 0; a < p; a++) {
        for (let b = a; b < p; b++) { let s = 0; const Ja = Jx[a], Jb = Jx[b]; for (let i = 0; i < m; i++) s += Ja[i] * Jb[i]; s *= sc[a] * sc[b]; JTJ[a][b] = s; JTJ[b][a] = s; }
        let s = 0; const Ja = Jx[a]; for (let i = 0; i < m; i++) s += Ja[i] * r[i]; g[a] = s * sc[a];
        maxD = Math.max(maxD, JTJ[a][a]);
      }
      for (let a = 0; a < p; a++) D[a] = Math.max(JTJ[a][a], 1e-8 * maxD, 1e-300);
      if (lam < 0) lam = 1e-3;
      let accepted = false;
      for (let tries = 0; tries < 15; tries++) {
        const Aug = JTJ.map((row, a) => row.map((v, b) => (a === b ? v + lam * D[a] : v)));
        const dth = solveLinear(Aug, g.map(v => -v));
        if (!dth) { lam *= nu; nu *= 2; continue; }
        // геодезическое ускорение (Transtrum–Sethna): вторая производная невязки вдоль шага по разностям, поправка ½a
        let vnorm = 0; for (let k = 0; k < p; k++) vnorm += dth[k] * dth[k]; vnorm = Math.sqrt(vnorm);
        if (vnorm > 1e-12) {
          const hh = Math.min(0.1, 0.1 / vnorm);
          const rP = residJac(toX(th.map((v, k) => v + hh * dth[k])), false).r, rM = residJac(toX(th.map((v, k) => v - hh * dth[k])), false).r; nfev += 2;
          const rhs = new Array(p).fill(0);
          for (let a = 0; a < p; a++) { let sacc = 0; const Ja = Jx[a]; for (let i = 0; i < m; i++) sacc += Ja[i] * (rP[i] - 2 * r[i] + rM[i]); rhs[a] = -sacc * sc[a] / (hh * hh); }
          const acc = solveLinear(Aug, rhs);
          if (acc) { let anorm = 0; for (let k = 0; k < p; k++) anorm += acc[k] * acc[k]; anorm = Math.sqrt(anorm); if (anorm < 0.75 * vnorm) for (let k = 0; k < p; k++) dth[k] += 0.5 * acc[k]; }
        }
        let maxStep = 0; for (let k = 0; k < p; k++) { dth[k] = Math.max(-1.0, Math.min(1.0, dth[k])); maxStep = Math.max(maxStep, Math.abs(dth[k])); }
        const thn = th.map((v, k) => v + dth[k]), xn = toX(thn), evn = residJac(xn, false); nfev++;
        let Fn = 0; for (let i = 0; i < m; i++) Fn += evn.r[i] * evn.r[i]; Fn *= 0.5;
        let pred = 0; for (let k = 0; k < p; k++) pred += dth[k] * (lam * D[k] * dth[k] - g[k]); pred *= 0.5;
        const rho = pred > 0 ? (F - Fn) / pred : (Fn < F ? 1 : -1);
        if (Fn < F) {
          const rel = (F - Fn) / Math.max(F, 1e-300);
          th = thn; x = xn; r = evn.r; F = Fn; accepted = true;
          lam *= Math.max(1 / 3, 1 - Math.pow(2 * rho - 1, 3)); nu = 2;
          if (rel < 1e-8 || maxStep < 1e-7) { it = maxIter; } else { Jx = residJac(x, true).J; }
          break;
        }
        lam *= nu; nu *= 2;
      }
      if (!accepted) break;
    }
    Jx = residJac(x, true).J;                                                  // якобиан в решении — для ковариации
    const nuDof = Math.max(1, m - p), chi2 = 2 * F / nuDof;
    const JTJx = Array.from({ length: p }, () => new Array(p).fill(0));
    for (let a = 0; a < p; a++) for (let b = a; b < p; b++) { let s = 0; for (let i = 0; i < m; i++) s += Jx[a][i] * Jx[b][i]; JTJx[a][b] = s; JTJx[b][a] = s; }
    const inv = invert(JTJx); const cov = inv ? inv.map(row => row.map(v => v * chi2)) : null;
    return { x, resid: r, chi2, cov, nfev, nit, err: cov ? cov.map((row, k) => Math.sqrt(Math.max(0, row[k]))) : x.map(() => NaN) };
  }

  // ---------------------------------------------------------------- якоря (полуволновые/четвертьволновые точки) и каналы остатка
  function unwrapDeg(a) { const out = new Float64Array(a.length); out[0] = a[0]; for (let i = 1; i < a.length; i++) { let d = a[i] - a[i - 1]; d = ((d + 180) % 360 + 360) % 360 - 180; out[i] = out[i - 1] + d; } return out; }
  function interp(x, xs, ys) { if (x <= xs[0]) return ys[0]; if (x >= xs[xs.length - 1]) return ys[ys.length - 1]; let j = 1; while (xs[j] < x) j++; const f = (x - xs[j - 1]) / (xs[j] - xs[j - 1]); return ys[j - 1] + f * (ys[j] - ys[j - 1]); }
  function anchors(lam, del, delSub) {
    const diff = new Float64Array(lam.length); for (let i = 0; i < lam.length; i++) diff[i] = wrap(del[i] - delSub[i]);
    let ph = unwrapDeg(diff); if (ph[ph.length - 1] < ph[0]) ph = ph.map(v => -v);
    const HW = [], QW = [];
    for (let t = Math.ceil(ph[0] / 360 + 1e-9) * 360; t < ph[ph.length - 1]; t += 360) { HW.push(interp(t, ph, lam)); if (t + 180 < ph[ph.length - 1]) QW.push(interp(t + 180, ph, lam)); }
    return { HW, QW };
  }
  /** Каналы остатка по якорям. В полуволновых точках однородная прозрачная плёнка «отсутствует» и Ψ = Ψ подложки при любых n и d,
   *  поэтому Ψ-остаток в HW-якорях не зависит от того, как опорный фит подобрал дисперсию, и читает дефекты напрямую:
   *  градиент сдвигает Ψ в HW-якорях примерно одинаково по всему диапазону (канал psiHW — среднее), поглощение — гасит контраст
   *  полос тем сильнее, чем ближе к синему краю (∝ k(λ)·d/λ), поэтому его канал — перепад Ψ-остатка между синей и красной половинами
   *  якорей: psiHWtrend = ⟨r_Ψ(HW)⟩_синие − ⟨r_Ψ(HW)⟩_красные; в четвертьволновых точках контраст гасится с противоположной стороны
   *  (psiQWtrend — тот же перепад по QW-якорям). Половины — по середине диапазона λ; если одна пуста — по номеру якоря. */
  function channels(lam, resid, HW, QW) {
    const n = lam.length, rp = Array.from(resid.slice(0, n)), rd = Array.from(resid.slice(n));
    const at = (xs, ys) => xs.map(x => interp(x, lam, ys));
    const psiHW = at(HW, rp), delHW = at(HW, rd), delQW = at(QW, rd), psiQW = at(QW, rp);
    const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN, mabs = a => mean(a.map(Math.abs));
    const rms = a => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
    const mid = (lam[0] + lam[n - 1]) / 2;
    const trend = (xs, ys) => {
      if (xs.length < 2) return 0;
      let blue = [], red = []; xs.forEach((x, j) => (x < mid ? blue : red).push(ys[j]));
      if (!blue.length || !red.length) { const h = Math.floor(xs.length / 2); blue = ys.slice(0, h); red = ys.slice(h); }
      return mean(blue) - mean(red);
    };
    return { psiHW: mean(psiHW), psiHWsd: Math.sqrt(Math.max(0, mean(psiHW.map(v => v * v)) - mean(psiHW) ** 2)), delHW: mabs(delHW), delQW: mabs(delQW), rmsPsi: rms(rp), rmsDel: rms(rd),
      psiHWtrend: trend(HW, psiHW), psiQWtrend: trend(QW, psiQW), nHW: HW.length };
  }

  // ---------------------------------------------------------------- ИИ: мультиномиальная логистическая регрессия (softmax, Adam) и гребневая регрессия
  function standardizer(X) {
    const n = X.length, D = X[0].length, mu = new Float64Array(D), sd = new Float64Array(D);
    for (let j = 0; j < D; j++) { let s = 0; for (let i = 0; i < n; i++) s += X[i][j]; mu[j] = s / n; }
    for (let j = 0; j < D; j++) { let s = 0; for (let i = 0; i < n; i++) { const v = X[i][j] - mu[j]; s += v * v; } sd[j] = Math.sqrt(s / n) || 1; }
    return { mu, sd, apply: (x) => { const z = new Float64Array(D); for (let j = 0; j < D; j++) z[j] = (x[j] - mu[j]) / sd[j]; return z; } };
  }
  function trainSoftmax(X, y, K, opt) {
    opt = opt || {}; const l2 = opt.l2 ?? 2e-3, epochs = opt.epochs ?? 250, lr = opt.lr ?? 0.05;
    const st = standardizer(X), Z = X.map(st.apply), n = Z.length, D = Z[0].length;
    const W = Array.from({ length: K }, () => new Float64Array(D)), b = new Float64Array(K);
    const mW = Array.from({ length: K }, () => new Float64Array(D)), vW = Array.from({ length: K }, () => new Float64Array(D)), mb = new Float64Array(K), vb = new Float64Array(K);
    const b1 = 0.9, b2 = 0.999, eps = 1e-8;
    const P = Array.from({ length: n }, () => new Float64Array(K));
    for (let ep = 1; ep <= epochs; ep++) {
      // прямой проход
      for (let i = 0; i < n; i++) { const z = Z[i]; let mx = -Infinity; for (let k = 0; k < K; k++) { let s = b[k]; const w = W[k]; for (let j = 0; j < D; j++) s += w[j] * z[j]; P[i][k] = s; if (s > mx) mx = s; } let sum = 0; for (let k = 0; k < K; k++) { P[i][k] = Math.exp(P[i][k] - mx); sum += P[i][k]; } for (let k = 0; k < K; k++) P[i][k] /= sum; }
      // градиенты
      const gW = Array.from({ length: K }, () => new Float64Array(D)), gb = new Float64Array(K);
      for (let i = 0; i < n; i++) { const z = Z[i]; for (let k = 0; k < K; k++) { const g = (P[i][k] - (y[i] === k ? 1 : 0)) / n; gb[k] += g; const gw = gW[k]; for (let j = 0; j < D; j++) gw[j] += g * z[j]; } }
      for (let k = 0; k < K; k++) { const gw = gW[k], w = W[k]; for (let j = 0; j < D; j++) { const g = gw[j] + l2 * w[j]; mW[k][j] = b1 * mW[k][j] + (1 - b1) * g; vW[k][j] = b2 * vW[k][j] + (1 - b2) * g * g; w[j] -= lr * (mW[k][j] / (1 - b1 ** ep)) / (Math.sqrt(vW[k][j] / (1 - b2 ** ep)) + eps); }
        mb[k] = b1 * mb[k] + (1 - b1) * gb[k]; vb[k] = b2 * vb[k] + (1 - b2) * gb[k] * gb[k]; b[k] -= lr * (mb[k] / (1 - b1 ** ep)) / (Math.sqrt(vb[k] / (1 - b2 ** ep)) + eps); }
    }
    const predictProba = (x) => { const z = st.apply(x); const s = new Float64Array(K); let mx = -Infinity; for (let k = 0; k < K; k++) { let v = b[k]; for (let j = 0; j < D; j++) v += W[k][j] * z[j]; s[k] = v; if (v > mx) mx = v; } let sum = 0; for (let k = 0; k < K; k++) { s[k] = Math.exp(s[k] - mx); sum += s[k]; } return Array.from(s, v => v / sum); };
    return { predictProba, W, b, st };
  }
  function ridge(X, y, alpha) {
    const st = standardizer(X), Z = X.map(st.apply), n = Z.length, D = Z[0].length;
    const ym = y.reduce((s, v) => s + v, 0) / n;
    const G = Array.from({ length: D }, () => new Array(D).fill(0)), g = new Array(D).fill(0);
    for (let i = 0; i < n; i++) { const z = Z[i], yc = y[i] - ym; for (let a = 0; a < D; a++) { const za = z[a]; if (!za) continue; g[a] += za * yc; const row = G[a]; for (let b = a; b < D; b++) row[b] += za * z[b]; } }
    for (let a = 0; a < D; a++) { for (let b = 0; b < a; b++) G[a][b] = G[b][a]; G[a][a] += alpha; }
    const w = solveLinear(G, g) || new Array(D).fill(0);
    return { predict: (x) => { const z = st.apply(x); let s = ym; for (let j = 0; j < D; j++) s += w[j] * z[j]; return s; } };
  }

  // ---------------------------------------------------------------- классы дефектов: градиент g ∈ {0, +1, −1} × шероховатость r ∈ {0, 1} × поглощение a ∈ {0, 1}
  const CLASSES = (() => {
    const base = [{ g: 0, r: 0, name: 'однородная плёнка' }, { g: 1, r: 0, name: 'градиент, n растёт к поверхности' }, { g: -1, r: 0, name: 'градиент, n падает к поверхности' },
      { g: 0, r: 1, name: 'шероховатость' }, { g: 1, r: 1, name: 'градиент (n растёт) + шероховатость' }, { g: -1, r: 1, name: 'градиент (n падает) + шероховатость' }];
    const abs = base.map(c => ({ g: c.g, r: c.r, a: 1, name: c.g === 0 && c.r === 0 ? 'поглощение' : c.name.replace('градиент, n растёт к поверхности', 'градиент (n растёт)').replace('градиент, n падает к поверхности', 'градиент (n падает)') + ' + поглощение' }));
    return base.map(c => Object.assign({ a: 0 }, c)).concat(abs);
  })();
  /** Индекс класса по набору дефектов. */
  const classIndex = (g, r, a) => CLASSES.findIndex(c => c.g === g && c.r === r && c.a === a);
  /** Набор дефектов для окончательного фита по вероятностям классов. Обычно — лучший класс. Если ИИ не уверен (P₁ < 0.6) и второй класс —
   *  серьёзный конкурент (P₂ ≥ 0.25), берётся объединение дефектов двух лучших классов: решение о каждом дефекте, по которому классы расходятся,
   *  передаётся физике — вето на 3σ в окончательном фите отбросит незначимый. Знак градиента — из лучшего класса, где он есть.
   *  Возвращает {flags: {grad, rough, abs}, sign, best, second, merged}. */
  function chooseFlags(probs, pMin, pSecond) {
    pMin = pMin ?? 0.6; pSecond = pSecond ?? 0.25;
    const order = probs.map((v, i) => i).sort((a, b) => probs[b] - probs[a]), best = order[0], second = order[1], c1 = CLASSES[best], c2 = CLASSES[second];
    const merged = probs[best] < pMin && probs[second] >= pSecond;
    const flags = merged ? { grad: c1.g !== 0 || c2.g !== 0, rough: c1.r === 1 || c2.r === 1, abs: c1.a === 1 || c2.a === 1 } : { grad: c1.g !== 0, rough: c1.r === 1, abs: c1.a === 1 };
    const sign = c1.g !== 0 ? c1.g : (merged ? c2.g : 0);
    return { flags, sign, best, second, merged, pBest: probs[best], pSecond: probs[second] };
  }
  const N_CHANNELS = 8;

  /** Вектор признаков: остаток опорного фита + 8 чисел каналов якорей (Ψ в HW, разброс, |Δ| в HW и QW, RMS Ψ/Δ,
   *  перепад Ψ-остатка синие − красные якоря HW и QW — затухание контраста полос к синему краю). */
  function featureVector(dd, cfg, resid) {
    const subDel = cfg.subDel || (cfg.subDel = modelPsiDelta(dd.lam, cfg.Nsub, cfg.phi, 0, cfg.mat, 0, 0, 1, cfg.back).del);   // якоря — по голой подложке (с задней стороной, если она включена)
    const { HW, QW } = anchors(dd.lam, dd.del, subDel);
    let ch = { psiHW: 0, psiHWsd: 0, delHW: 0, delQW: 0, rmsPsi: 0, rmsDel: 0, psiHWtrend: 0, psiQWtrend: 0 };
    if (HW.length >= 2 && QW.length >= 1) ch = channels(dd.lam, resid, HW, QW);
    const f = (v) => (isFinite(v) ? v : 0);
    return Array.from(resid).concat([f(ch.psiHW), f(ch.psiHWsd), f(ch.delHW), f(ch.delQW), f(ch.rmsPsi), f(ch.rmsDel), f(ch.psiHWtrend), f(ch.psiQWtrend)]);
  }
  /** Случайный размер дефекта в двух шкалах: с вероятностью ½ в тонкой [lo, small], иначе в [small, max] (если max > small). */
  function twoScale(rng, lo, small, max) { small = Math.min(small, max); return (max > small + 1e-12 && rng.uniform() < 0.5) ? rng.range(small, max) : rng.range(lo, small); }
  /** Один обучающий пример: истина со случайными дефектами и мешающими факторами → опорный фит → остаток.
   *  nuis = {deltaMax, roughMax, kMax, bw, phiErr, backFerr}; kMax — верхняя граница k хвоста поглощения при 400 нм;
   *  backFerr — неопределённость заданной доли задней стороны (cfg.back), в этих пределах доля истины разыгрывается случайно. */
  function trainingExample(data, cfg, prior, nuis, rng, cls) {
    const c = CLASSES[cls];
    const delta = c.g * twoScale(rng, 0.0002, 0.02, nuis.deltaMax), dRough = c.r ? rng.range(0.02, nuis.roughMax) : 0;
    const k400 = c.a ? twoScale(rng, 2e-5, 1e-3, nuis.kMax || 5e-3) : 0;
    const d = rng.range(prior.dMin, prior.dMax);
    const m = Object.assign({}, cfg.mat, { A: cfg.mat.A * (1 + rng.range(-0.05, 0.05)), Auv: cfg.mat.Auv * (1 + rng.range(-0.05, 0.05)) + rng.range(-2, 2), E0: cfg.mat.E0 + rng.range(-0.05, 0.05), C: cfg.mat.C + rng.range(-0.06, 0.06), Eg: cfg.mat.Eg + rng.range(-0.05, 0.05) });
    if (m.Auv < 0) m.Auv = 0;
    if (k400 > 0) m.Ak = tailAk(m, k400);
    const opt = { bw: Math.max(0, nuis.bw + rng.range(-0.3, 0.3)), lamOffset: rng.range(-0.1, 0.1), driftPsi: [rng.range(-0.01, 0.01), rng.range(-0.015, 0.015)], driftDel: [rng.range(-0.03, 0.03), rng.range(-0.04, 0.04)], sigPsi: data.sigPsi, sigDel: data.sigDel };
    if (backOn(cfg.back)) opt.back = { f: Math.min(1, Math.max(0, cfg.back.f + rng.range(-(nuis.backFerr || 0), nuis.backFerr || 0))), ds: cfg.back.ds };   // истинная доля задней стороны — в пределах её неопределённости
    const s = synthesize(data.lam, cfg.subKey, cfg.phi + rng.range(-nuis.phiErr, nuis.phiErr), d, m, delta, dRough, opt, rng);
    const dd = { lam: data.lam, psi: s.psi, del: s.del, sigPsi: data.sigPsi, sigDel: data.sigDel };
    const fit = referenceFit(dd, cfg, prior);
    return { x: featureVector(dd, cfg, fit.resid), y: cls, delta, dRough, k400, d, dFit: fit.P.d, chi2: fit.chi2 };
  }

  const api = { HC, TAIL_ET, K400_MAX, N_CHANNELS, BAND_H, MATERIALS, SUBSTRATES, CLASSES, classIndex, chooseFlags, filmN, filmNK, tailK400, tailAk, substrateN, cubicTab, buildLayers, rhoStack, psiDeltaFromR, psiDeltaFromNCS, ncsFromR, muellerFromR, ncsFromMueller, stackCoefs, ncsBackside, backOn, bandOn, band2, lam3Of, modelMueller, modelPsiDelta, rhoGraded, synthesizeClean, applyNoise, synthesize, makeRng, lmFit, lmFitJac, makeResidJacFn, rhoStackJac, buildLayersJac, filmNJac, psiDeltaJac, muellerJac, psiDeltaJacMueller, referenceFit, finalFit, subLayersFor, sysErrors, vetoThreshold, anchors, channels, featureVector, trainSoftmax, ridge, trainingExample, wrap, interp, tlEps };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.EllipCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
