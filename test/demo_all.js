/* Прогон страницы «Иллюстрации» по встроенным образцам в jsdom: для каждого образца строятся все разделы, затем проверяются
   тексты (сведения, подписи, таблицы, формулы), ряды графиков (NaN, пустые ряды, подписи легенд, оси) и согласованность
   с расчётом ядра. Запуск: npm install && node test/demo_all.js [ex1,ex5,...] [--json файл]   (≈1–3 мин на образец; jsdom медленнее браузера) */
const { JSDOM } = require("jsdom"); const fs = require("fs"), path = require("path");
const E = require("../src/ellip_core.js");
const args = process.argv.slice(2), jsonAt = args.indexOf("--json"), jsonFile = jsonAt >= 0 ? args[jsonAt + 1] : null;
const want = args.filter((a, i) => a !== "--json" && (jsonAt < 0 || i !== jsonAt + 1)).join(",").split(",").map(s => s.trim()).filter(Boolean);
let html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
// Chart.js — заглушка, запоминающая тип, ряды и настройки графика (в jsdom нет canvas); SheetJS не нужен; KaTeX — текстовый вариант формул
html = html.replace(/<script src="(?:https:\/\/cdnjs|vendor\/)[^"]*chart[^"]*"><\/script>/, '<script>window.Chart = class { constructor(el, cfg){ this.canvas = el; this.type = cfg && cfg.type; this.data = cfg && cfg.data || { datasets: [] }; this.options = cfg && cfg.options || {}; } destroy(){} resize(){} update(){} }; window.Chart.defaults = { font: {} }; window.Chart.register = () => {}; window.Chart.Ticks = { formatters: { numeric: (v) => String(v) } };</script>')
  .replace(/<script src="(?:https:\/\/cdnjs|vendor\/)[^"]*xlsx[^"]*"><\/script>/, '<script>window.XLSX = {};</script>')
  .replace(/<script src="(?:https:\/\/cdnjs|vendor\/)[^"]*katex[^"]*"><\/script>/, '')
  .replace(/<link rel="stylesheet" href="(?:https:\/\/cdnjs|vendor\/)[^"]*katex[^"]*">/, '');
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true }); const w = dom.window; w.HTMLCanvasElement.prototype.getContext = () => ({}); w.scrollTo = () => {};
const $ = (id) => w.document.getElementById(id); const txt = (el) => (el ? el.textContent : "").replace(/\s+/g, " ").trim();
let failures = 0; const out = {};
const check = (ok, msg) => { console.log((ok ? "  ok   " : "  FAIL ") + msg); if (!ok) failures++; };
const warn = (msg) => console.log("  warn " + msg);
w.addEventListener("error", (e) => { console.log("window error:", e.message); failures++; });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function waitDemo() { const t0 = Date.now(); while (!/^Готово|^Ошибка/.test($("dmStatus").textContent) && Date.now() - t0 < 900000) await sleep(200); return (Date.now() - t0) / 1000; }
/** Все графики страницы «Иллюстрации»: id → экземпляр заглушки Chart (через перерисовку берём из S.charts недоступно, поэтому читаем canvas.__chart). */
const charts = () => { const r = {}; for (const c of w.document.querySelectorAll("#page-demo canvas")) if (c.__chart) r[c.id] = c.__chart; return r; };
// заглушка не знает о S.charts — привязываем экземпляр к canvas при создании
w.eval("(function(){ const C = window.Chart; window.Chart = class extends C { constructor(el, cfg){ super(el, cfg); if (el) el.__chart = this; } }; window.Chart.defaults = C.defaults; window.Chart.register = C.register; window.Chart.Ticks = C.Ticks; })()");
const bad = (v) => v === undefined || (typeof v === "number" && !isFinite(v));
/** Проверка рядов графика: пустые ряды, NaN/undefined в y, подписи легенды, названия осей. allowNull — ряд с намеренными разрывами (null). */
function checkChart(id, c, exp) {
  if (!c) { check(false, `${id}: график не построен`); return; }
  const ds = c.data.datasets || []; const labels = ds.map(d => d.label);
  const problems = [];
  ds.forEach(d => {
    const data = d.data || []; if (!data.length) problems.push(`ряд «${d.label}» пуст`);
    let nan = 0, nulls = 0; data.forEach(p => { const y = typeof p === "number" ? p : (p ? p.y : undefined); if (y === null) nulls++; else if (bad(y)) nan++; if (p && typeof p === "object" && bad(p.x)) nan++; });
    if (nan) problems.push(`ряд «${d.label}»: ${nan} NaN/undefined`);
    if (nulls === data.length && data.length) problems.push(`ряд «${d.label}»: все значения null`);
    if (!d.label && d.label !== "") problems.push("ряд без подписи");
  });
  const xt = c.options.scales && c.options.scales.x && c.options.scales.x.title && c.options.scales.x.title.text, yt = c.options.scales && c.options.scales.y && c.options.scales.y.title && c.options.scales.y.title.text;
  if (exp && exp.minSeries && ds.length < exp.minSeries) problems.push(`рядов ${ds.length} < ${exp.minSeries}`);
  check(!problems.length, `${id}: ${c.type}, ${ds.length} рядов [${labels.filter(l => !/^_/.test(l || "")).join(" | ")}], оси «${xt || ""}» / «${yt || ""}»` + (problems.length ? " — " + problems.join("; ") : ""));
  return { type: c.type, labels, x: xt, y: yt, n: ds.map(d => (d.data || []).length) };
}
(async () => {
  await sleep(50);
  const EX = w.eval("EXAMPLES"); const N = EX.length; const list = want.length ? want.map(s => +s.replace(/^ex/, "") - 1) : [...Array(N).keys()];
  for (const i of list) {
    const ex = EX[i]; console.log(`\n=== Образец ${i + 1}: ${ex.title}`);
    w.location.hash = "#analysis"; await sleep(30);
    $("exSel").value = String(i); $("exSel").dispatchEvent(new w.Event("change")); await sleep(50);
    w.location.hash = "#demo"; await sleep(50);
    const sec = await waitDemo(); const st = $("dmStatus").textContent;
    check(/^Готово/.test(st) && !/Пока шло построение/.test(st), `построено за ${sec.toFixed(0)} с: ${st}`);
    const R = { title: ex.title, sec, status: st, texts: {}, charts: {} };
    // --- тексты
    for (const id of ["dmBackSrc", "dmInstrSrc", "dmFingerInfo", "fingerOverlaySub", "fingerGridSub", "fingerGridNote", "dmAnchorInfo", "dmDispInfo", "dispSub", "dmBackInfo", "backFitSub", "backFitNote", "dmInstrInfo", "anchUnitsNote"]) R.texts[id] = txt($(id));
    R.texts.fingerMinis = [...$("fingerGrid").querySelectorAll(".mini")].map(m => txt(m.querySelector(".mini-title")) + " — " + txt(m.querySelector(".mini-sub")));
    R.texts.instrRawMinis = [...$("instrRawGrid").querySelectorAll(".mini")].map(m => txt(m.querySelector(".mini-title")) + " — " + txt(m.querySelector(".mini-sub")));
    R.texts.instrFitMinis = [...$("instrFitGrid").querySelectorAll(".mini")].map(m => txt(m.querySelector(".mini-title")) + " — " + txt(m.querySelector(".mini-sub")));
    const tableRows = (id) => [...$(id).querySelectorAll("tr")].map(r => [...r.children].map(c => txt(c)));
    R.texts.anchorTable = tableRows("dmAnchorTable"); R.texts.dispTable = tableRows("dmDispTable"); R.texts.instrTable = tableRows("dmInstrTable");
    R.texts.formulas = [...$("dmFormula").querySelectorAll(".f-cap, .f-plain")].map(txt);
    const all = JSON.stringify(R.texts);
    check(!/NaN|undefined|null|—\s*нм|Infinity/.test(all.replace(/«—»|—(?=<)/g, "")) , "в текстах нет NaN/undefined/Infinity" + (/NaN|undefined|Infinity/.test(all) ? ": " + (all.match(/.{40}(NaN|undefined|Infinity).{40}/g) || []).slice(0, 3).join(" … ") : ""));
    check($("fingerGrid").querySelectorAll(".mini").length === 12, "сетка отпечатков: 12 классов");
    check(R.texts.anchorTable.length === 6, `сводка по якорям: ${R.texts.anchorTable.length - 1} вариантов`);
    check(/Найдено HW-якорей: \d+ \([\d, ]+ нм\), QW-якорей: \d+/.test(R.texts.dmAnchorInfo), "сведения о якорях: " + R.texts.dmAnchorInfo);
    const dispCols = R.texts.dispTable[0].slice(1);
    check(dispCols.join(",") === (R.texts.dispSub.split(" · ").join(",")), `столбцы дисперсии = подпись фигуры: ${dispCols.join(", ")}`);
    check(R.texts.formulas.length === 8, `формулы: ${R.texts.formulas.length / 2} с подписями (текстовый вариант)`);
    check(R.texts.instrTable.length === 7, "сводка по эффектам прибора: 6 строк");
    // --- графики
    const C = charts();
    const ids = ["cFingerOverlay", "cAnchPsi", "cAnchPhase", "cAnchPsiHW", "cAnchPsiQW", "cAnchDelHW", "cAnchDelQW", "cDispN", "cDispK", "cDispTail", "cDispEps", "cBackPsi", "cBackDel", "cBackDiff", "cBackDepol", "cBackFit", "cInstrSum"].concat([...Array(12).keys()].map(k => "cFg" + k)).concat([...Array(6).keys()].flatMap(k => ["cIr" + k, "cIf" + k]));
    for (const id of ids) R.charts[id] = checkChart(id, C[id]);
    // --- согласованность с ядром
    const num = (s) => parseFloat(String(s).replace(/−/g, "-").replace(/·10⁻³/, "e-3").replace(/[^\d.eE+-]/g, ""));
    const tr = ex.truth;
    // таблица дисперсии: столбец «истина» = истина образца; k₄₀₀ хвоста = truth.k400
    const col = (name) => { const j = R.texts.dispTable[0].indexOf(name); return j < 0 ? null : Object.fromEntries(R.texts.dispTable.slice(1).map(r => [r[0], r[j]])); };
    const T = col("истина");
    if (T) {
      check(Math.abs(num(T["Толщина d, нм"]) - tr.d) < 0.006, `дисперсия/истина: d = ${T["Толщина d, нм"]} (истина ${tr.d})`);
      const nk = E.filmNK([550], tr.mat).n[0]; check(Math.abs(num(T["n(550 нм)"]) - nk) < 6e-5, `дисперсия/истина: n(550) = ${T["n(550 нм)"]} (ядро ${nk.toFixed(4)})`);
      const k4 = tr.k400 || 0; check(Math.abs(num(T["k₄₀₀ хвоста"]) - k4) < 6e-6, `дисперсия/истина: k₄₀₀ хвоста = ${T["k₄₀₀ хвоста"]} (истина ${k4})`);
    } else check(false, "в таблице дисперсии нет столбца «истина»");
    // якоря: у однородной плёнки отклонения в HW равны нулю
    // (для прозрачной плёнки — точно нули; у материала с поглощением в диапазоне Ψ-отклонение однородной плёнки отлично от нуля, о чём должно быть сказано в примечании)
    const hom = R.texts.anchorTable[1], kFilm = E.filmNK([ex.lam[0]], tr.mat).k[0], absorbs = kFilm > 1e-4, noteA = txt($("dmAnchorTable").querySelector("p.note"));
    check(/однородная/.test(hom[0]) && Math.abs(num(hom[4])) < 2e-3 && Math.abs(num(hom[3])) < 2e-3 && (absorbs ? /Материал поглощает/.test(noteA) : Math.abs(num(hom[1])) < 2e-3 && /исчезает/.test(noteA)), `якоря/однородная плёнка: ⟨Ψ − Ψподл⟩ HW = ${hom[1]}${absorbs ? ` (материал поглощает, k(${ex.lam[0]}) = ${kFilm.toFixed(4)}: примечание есть)` : ""}, ⟨Ψ − Ψоднор⟩ QW = ${hom[3]}, ⟨|Δ − Δподл|⟩ HW = ${hom[4]}`);
    // таблица фигуры отпечатков — по длине волны, на ряд два столбца (Ψ, Δ), строки отсортированы, числа с настоящим минусом
    { const fig = $("figFingerOverlay"), tb = fig.querySelector('[data-act="table"]'); tb.click(); const t = fig.querySelector(".fig-table table"); const head = [...t.querySelectorAll("thead th")].map(txt), rows = [...t.querySelectorAll("tbody tr")].map(r => [...r.children].map(txt));
      check(head[0] === "λ, нм" && head.length === 1 + 2 * 6 && rows.length === ex.lam.length && rows.every(r => r.every(v => v !== "" && !/-/.test(v))) && +rows[0][0] === ex.lam[0], `таблица отпечатков: ${rows.length} строк по λ, ${head.length} столбцов (${head.slice(0, 3).join(" | ")} …), без пустых ячеек`); tb.click(); }
    { const fig = $("figAnchSpec"), tb = fig.querySelector('[data-act="table"]'); tb.click(); const t = fig.querySelector(".fig-table table"); const head = [...t.querySelectorAll("thead th")].map(txt), rows = [...t.querySelectorAll("tbody tr")].map(r => [...r.children].map(txt));
      const t2 = fig.querySelectorAll(".fig-table table")[1], head2 = t2 ? [...t2.querySelectorAll("thead th")].map(txt) : [];
    check(head[0] === "Длина волны, нм" && head.length === 7 && rows.length === 401 && +rows[0][0] === ex.lam[0] && +rows[400][0] === ex.lam[ex.lam.length - 1] && !rows.some(r => r.some(v => /^-/.test(v))) && head2.length === 6 && t2.querySelectorAll("tbody tr").length === 401, `таблицы фигуры Ψ(λ) и фазы: ${rows.length} строк по λ, ${head.length} и ${head2.length} столбцов, настоящий минус`); tb.click(); }
    // якоря страницы = якоря ядра для той же плёнки на мелкой сетке
    {
      const A = C.cAnchPsi; const subDs = A.data.datasets.find(d => d.label === "голая подложка"), homDs = A.data.datasets.find(d => /^однородная/.test(d.label));
      const lamF = subDs.data.map(p => p.x); const nHW = (R.texts.dmAnchorInfo.match(/HW-якорей: (\d+)/) || [])[1], nQW = (R.texts.dmAnchorInfo.match(/QW-якорей: (\d+)/) || [])[1];
      const xl = (A.options.plugins.guides || {}).xLines || []; check(xl.length === +nHW + +nQW, `линии якорей на графике Ψ: ${xl.length} = HW ${nHW} + QW ${nQW}`);
      check(lamF.length === 401 && Math.abs(lamF[0] - ex.lam[0]) < 1e-9 && Math.abs(lamF[400] - ex.lam[ex.lam.length - 1]) < 1e-9, `мелкая сетка якорей: ${lamF.length} точек, ${lamF[0]}–${lamF[400]} нм`);
    }
    // ε₂: подписи и линии E_t, E_g, E₀
    { const c = C.cDispEps; const xl = ((c.options.plugins.guides || {}).xLines || []).map(l => l.label); check(xl.length === 3 && /Et/.test(xl[0]) && /Eg/.test(xl[1]) && /E₀/.test(xl[2]), `ε₂: линии ${xl.join(" | ")}`); }
    // задняя сторона: подложка и доля из условий
    check($("dmBackSub").value === ex.sub && Math.abs(+$("dmBackF").value - (ex.back ? ex.back.f : 1)) < 1e-9, `задняя сторона: подложка ${$("dmBackSub").value}, доля ${$("dmBackF").value}` + (ex.back ? "" : " (на «Анализе» выключена)"));
    check((ex.back ? !/выключена/.test(R.texts.dmBackInfo) : /выключена/.test(R.texts.dmBackInfo)), "сведения о задней стороне согласованы с флажком «Анализа»");
    // The labels reflect the current source or manual sizes, including exact zero.
    const shown = id => Number((+$(id).value).toPrecision(5)).toString();
    check(R.texts.fingerGridSub === `δ = ±${shown("dmDelta")} %, слой ${shown("dmRough")} нм, k₄₀₀ = ${shown("dmK")}·10⁻³`, `подпись сетки отпечатков = поля размеров: ${R.texts.fingerGridSub}`);
    check(/со страницы «Анализ»/.test(R.texts.dmBackSrc) && /Симулятор измерения/.test(R.texts.dmInstrSrc) && $("dmBackReset").hidden && $("dmInstrReset").hidden, `источники полей разделов 4–5: ${R.texts.dmBackSrc} | ${R.texts.dmInstrSrc}`);
    out["ex" + (i + 1)] = R;
    console.log("  тексты: " + ["dmFingerInfo", "dmAnchorInfo", "dmDispInfo", "dmBackInfo", "backFitNote", "dmInstrInfo"].map(id => `\n    [${id}] ${R.texts[id]}`).join(""));
    console.log("  якоря:\n    " + R.texts.anchorTable.map(r => r.join(" | ")).join("\n    "));
    console.log("  дисперсия:\n    " + R.texts.dispTable.map(r => r.join(" | ")).join("\n    "));
    console.log("  прибор:\n    " + R.texts.instrTable.map(r => r.join(" | ")).join("\n    "));
    console.log("  отпечатки:\n    " + R.texts.fingerMinis.join("\n    "));
  }
  // --- синхронизация со страницей «Анализ» (на последнем построенном образце)
  console.log("\n=== Синхронизация со страницей «Анализ»");
  {
    const matBefore = $("matSel").value, dBefore = txt($("refOut"));
    $("matSel").value = matBefore === "tio2" ? "ta2o5" : "tio2"; $("matSel").dispatchEvent(new w.Event("change"));
    check(/Априорные условия.*изменились/.test($("dmStatus").textContent), "смена материала на «Анализе» помечает иллюстрации устаревшими: " + $("dmStatus").textContent);
    w.location.hash = "#analysis"; await sleep(30); w.location.hash = "#demo"; await sleep(50); await waitDemo();
    const matName = w.eval("EllipCore.MATERIALS")[$("matSel").value].name;
    check(/^Готово/.test($("dmStatus").textContent) && /пересчитан для текущих условий/.test($("dmStatus").textContent) && txt($("dmFingerInfo")).includes(matName) && txt($("refOut")) === dBefore && /опорный фит \(текущие условия\)/.test(txt($("dmDispTable"))), `при возврате на страницу иллюстрации перестроены для «${matName}» на своём опорном фите, панели «Анализа» не тронуты: ${$("dmStatus").textContent.slice(0, 90)}`);
    $("matSel").value = matBefore; $("matSel").dispatchEvent(new w.Event("change"));
    // поля задней стороны и прибора: закрепление и возврат
    $("dmBackSub").value = "bk7"; $("dmBackSub").dispatchEvent(new w.Event("change"));
    check(!$("dmBackReset").hidden && /заданы здесь: подложка/.test($("dmBackSrc").textContent), "подложка раздела «Задняя сторона» закреплена: " + $("dmBackSrc").textContent);
    $("dmBackReset").click(); await sleep(300); { const t0 = Date.now(); while (/пересчёт/.test($("dmStatus").textContent) && Date.now() - t0 < 60000) await sleep(100); }
    check($("dmBackReset").hidden && $("dmBackSub").value === $("subSel").value && /со страницы «Анализ»/.test($("dmBackSrc").textContent) && /пересчитана/.test($("dmStatus").textContent), `кнопка «Как на «Анализе»» вернула подложку ${$("dmBackSub").value} и пересчитала раздел: ${$("dmStatus").textContent}`);
    $("dmIbw").value = "3"; $("dmIbw").dispatchEvent(new w.Event("change"));
    check(!$("dmInstrReset").hidden && /заданы здесь: полоса/.test($("dmInstrSrc").textContent), "полоса раздела «Прибор» закреплена: " + $("dmInstrSrc").textContent);
    $("simBw").value = "0.7"; $("simBw").dispatchEvent(new w.Event("input"));
    check($("dmIbw").value === "3" && /заданы здесь: полоса/.test($("dmInstrSrc").textContent), "смена полосы в симуляторе не трогает закреплённое поле: " + $("dmIbw").value);
    $("dmInstrReset").click(); await sleep(300); { const t0 = Date.now(); while (!/пересчитаны|Ошибка/.test($("dmStatus").textContent) && Date.now() - t0 < 120000) await sleep(100); }
    check($("dmInstrReset").hidden && $("dmIbw").value === "0.7" && /пересчитаны/.test($("dmStatus").textContent) && /FWHM 0\.7 нм/.test(txt($("dmInstrTable"))), `кнопка «Как на «Анализе»» вернула полосу ${$("dmIbw").value} из симулятора и пересчитала эффекты: ${$("dmStatus").textContent}`);
    $("btn1").click(); await sleep(100);
    check(/выполнен фит/.test($("dmStatus").textContent), "опорный фит на «Анализе» помечает иллюстрации устаревшими: " + $("dmStatus").textContent);
  }
  if (jsonFile) fs.writeFileSync(jsonFile, JSON.stringify(out, null, 1));
  console.log(failures ? `\nОШИБОК: ${failures}` : "\nВсе проверки пройдены");
  process.exit(failures ? 1 : 0);
})();
