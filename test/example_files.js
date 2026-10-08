/* Check that downloadable examples and their answer key describe the embedded data. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const XLSX = require('../vendor/xlsx.full.min.js');
const E = require('../src/ellip_core.js');
const root = path.join(__dirname, '../examples');
const examples = JSON.parse(fs.readFileSync(path.join(root, 'examples.json'), 'utf8'));
const rows = (book, sheet) => XLSX.utils.sheet_to_json(book.Sheets[sheet], { header: 1, defval: null });
const book = file => XLSX.read(fs.readFileSync(path.join(root, file)), { type: 'buffer' });
const close = (actual, expected, tolerance, label) => {
  assert(Number.isFinite(actual), `${label}: expected a numeric cell, got ${actual}`);
  assert(Math.abs(actual - expected) <= tolerance + 1e-12, `${label}: ${actual} != ${expected}`);
};
const keyBook = book('answer_key.xlsx');
const keyRows = rows(keyBook, 'Истина');
const headers = keyRows[0];
assert.equal(new Set(headers).size, headers.length, 'Answer key headers must be unique');
const keyByFile = new Map(keyRows.slice(1).filter(row => /\.xlsx$/.test(row[0] || '')).map(row => [row[0], row]));
assert.equal(keyByFile.size, examples.length, 'Exactly one answer key row per spectrum');
let spectrumPoints = 0;
for (const example of examples) {
  const wb = book(example.file);
  assert.deepEqual(wb.SheetNames, ['Спектр', 'Условия'], `${example.id}: workbook structure`);
  const spectrum = rows(wb, 'Спектр');
  assert.deepEqual(spectrum[0], ['λ, нм', 'Ψ, град', 'Δ, град', 'σΨ, град', 'σΔ, град']);
  assert.equal(spectrum.length - 1, example.lam.length, `${example.id}: point count`);
  for (let i = 0; i < example.lam.length; i++) {
    const expected = ['lam', 'psi', 'del', 'sigPsi', 'sigDel'].map(k => example[k][i]);
    assert.deepEqual(spectrum[i + 1], expected, `${example.id}: spectrum row ${i + 2}`);
    assert(expected[0] > 0 && expected[1] >= 0 && expected[1] <= 90 && expected[2] >= 0 && expected[2] < 360);
    assert(expected[3] > 0 && expected[4] > 0);
  }
  spectrumPoints += example.lam.length;
  const conditions = Object.fromEntries(rows(wb, 'Условия'));
  assert.equal(conditions['Образец'], example.title);
  close(conditions['Угол падения, град'], example.phi, 0, `${example.id}: nominal angle`);
  close(conditions['Толщина (номинал), нм'], example.dNom, 0, `${example.id}: nominal thickness`);
  close(conditions['Спектральная полоса прибора, нм (FWHM)'], example.bw, 0, `${example.id}: bandwidth`);
  assert.equal(conditions['Неопределённость толщины, %'], `±${example.dRange}`);
  const ref = E.MATERIALS[example.mat];
  assert(conditions['Справочные параметры'].includes(`A = ${ref.A.toFixed(2)} эВ`));
  assert(conditions['Справочные параметры'].includes(`A_uv = ${ref.Auv.toFixed(2)} эВ²`));
  const row = keyByFile.get(example.file);
  assert(row, `${example.id}: missing key row`);
  const cell = header => { const i = headers.indexOf(header); assert(i >= 0, `Missing key column: ${header}`); return row[i]; };
  assert.equal(cell('Образец'), example.title);
  const truth = example.truth, mat = truth.mat;
  for (const [header, expected, tolerance] of [
    ['d, нм', truth.d, 0],
    ['Градиент δ, % (n растёт к поверхности > 0)', 100 * truth.delta, 0],
    ['EMA-слой шероховатости, нм', truth.dRough, 0],
    ['Поглощение: k хвоста при 400 нм, ×10⁻³', 1000 * (truth.k400 || 0), 0],
    ['Фактический угол, град', truth.phiTrue, 0], ['Полоса, нм (FWHM)', truth.bw, 0],
    ['Сдвиг шкалы λ, нм', truth.lamOffset, 0],
    ['A, эВ', mat.A, 0.005], ['E₀, эВ', mat.E0, 0], ['C, эВ', mat.C, 0],
    ['E_g, эВ', mat.Eg, 0], ['A_uv, эВ²', mat.Auv, 0.005], ['E_uv, эВ', mat.Euv, 0],
    ['A_k хвоста, эВ', mat.Ak || 0, 0.00005],
  ]) close(cell(header), expected, tolerance, `${example.id}: ${header}`);
  const nk = E.filmNK([450, 550, 650, 750], mat);
  [450, 550, 650, 750].forEach((wavelength, i) => close(cell(`n(${wavelength} нм)`), nk.n[i], 0.00005, `${example.id}: n(${wavelength})`));
  [450, 550].forEach((wavelength, i) => close(cell(`k(${wavelength} нм)`), nk.k[i], 0.000005, `${example.id}: k(${wavelength})`));
  const back = truth.back ? `${truth.back.f.toFixed(3)} (${example.back.f.toFixed(2)} ± ${example.back.ferr.toFixed(2)})` : 'нет';
  assert.equal(cell('Задняя сторона: истинная доля (задано ± неопр.)'), back);
}
console.log(`Example files: ${examples.length} spectra, ${spectrumPoints} wavelength rows, ${spectrumPoints * 5} numeric spectrum cells and all answer key parameters agree.`);
