/* Regression of source lifecycle, zero defects, shared legend and anchor units.
 * The test-only hook stays out of the shipped application. Scientific calls are real. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');
let html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
html = html.replace(/<script src="vendor\/chart[^" ]*"><\/script>/, `<script>window.Chart=class {
  constructor(el,cfg){this.canvas=el;this.data=cfg.data;this.options=cfg.options;this.width=400;this.height=300;el.__chart=this;}
  destroy(){}resize(w,h){if(w)this.width=w;if(h)this.height=h;}update(){}
};</script>`).replace(/<script src="vendor\/[^" ]*"><\/script>/g, '');
html = html.replace('  // ---------------------------------------------------------------- стартовое состояние:',
  '  window.__test={S,DM,E,dmSizes,dmBase,dmAnchors,renderAnchors,dmFingerOne,redrawCharts,sizesFromAnalysis,step1,step4,clearFrom,pageHooks,exportPng};\n  // ---------------------------------------------------------------- стартовое состояние:');
const errors = [];
const dom = new JSDOM(html, { runScripts:'dangerously', pretendToBeVisual:true, url:'http://localhost', beforeParse(w) {
  w.scrollTo=()=>{}; w.addEventListener('error', e=>errors.push(e.message));
}});
const w=dom.window, $=id=>w.document.getElementById(id), delay=ms=>new Promise(r=>setTimeout(r,ms));
const input=(id,v)=>{ $(id).value=String(v); $(id).dispatchEvent(new w.Event('input',{bubbles:true})); };
const values=()=>['dmDelta','dmRough','dmK'].map(id=>+$(id).value);
const close=(a,b,eps=1e-10)=>assert.ok(Math.abs(a-b)<eps, `${a} ≠ ${b}`);
const charts=['cAnchPsiHW','cAnchPsiQW','cAnchDelHW','cAnchDelQW'];
async function waitBuild(){const start=Date.now();while(w.__test.DM.building){assert.ok(Date.now()-start<120000,'build timeout');await delay(50);} assert.doesNotMatch($('dmStatus').textContent,/^Ошибка/);}
(async()=>{
 await delay(25);
 const {S,DM,E}=w.__test, T=w.__test;
 input('simDelta',-.8);input('simRough',2.2);input('simK',0);
 assert.deepEqual(values(),[.8,2.2,0]); assert.match($('dmSizesSrc').textContent,/Симулятора/);
 assert.equal(T.dmSizes().k400,0);
 input('dmK','');assert.throws(()=>T.dmSizes(),/введите число/);
 input('dmK',-1);assert.throws(()=>T.dmSizes(),/введите число/);
 input('dmK',51);assert.throws(()=>T.dmSizes(),/введите число/);
 input('dmK',0);input('dmRough',0);input('dmDelta',0);
 assert.deepEqual(Object.values(T.dmSizes()),[0,0,0]);
 // Deterministic final-fit values exercise units and final veto flags (not estimates).
 S.fin={P:{delta:-.01234,dRough:1.234,k400:.000567}};S.finFlags={grad:true,rough:true,abs:true};S.cfgDirty=false;S.analysisStale=false;S.onFitChange();
 values().forEach((v,i)=>close(v,[1.234,1.234,.567][i]));assert.match($('dmSizesSrc').textContent,/окончательного фита/);
 input('simK',8);close(+$('dmK').value,.567);
 input('dmK',0);T.sizesFromAnalysis();assert.equal(+$('dmK').value,0);
 $('dmSizesReset').click();close(+$('dmK').value,.567);
 S.fin={P:{delta:-.01234,dRough:1.234,k400:.000567}};S.finFlags={grad:false,rough:false,abs:false};S.onFitChange();
 assert.deepEqual(values(),[0,0,0]);
 // A new fit with identical values is still a new source; manual settings must reset.
 input('dmK',4);S.fin={P:{delta:0,dRough:0,k400:0}};S.onFitChange();assert.equal(+$('dmK').value,0);
 S.cfgDirty=true;S.onCfgChange();assert.deepEqual(values(),[.8,2.2,8]);
 S.cfgDirty=false;S.analysisStale=true;T.sizesFromAnalysis();assert.deepEqual(values(),[.8,2.2,8]);
 S.analysisStale=false;S.fin=null;input('simK',0);
 // Real final fit: no classifier stub can conceal a misplaced field or callback.
 T.step1();S.probs=[1,...Array(11).fill(0)];S.est={delta:0,dRough:0,k400:0};
 $('ckGrad').checked=$('ckRough').checked=$('ckAbs').checked=false;T.step4();
 assert.deepEqual(values(),[0,0,0]);assert.ok(S.fin.P);assert.match($('dmSizesSrc').textContent,/окончательного фита/);
 // Clearing downstream results without onFitChange is caught when Illustrations opens.
 T.clearFrom(3);DM.building=true;T.pageHooks.demo[0]();DM.building=false;
 assert.deepEqual(values(),[.8,2.2,0]);
 // Build with a snapshot, edit during the queue and retain a truthful stale indicator.
 input('dmK',0);$('dmBuild').click();input('dmK',2);await waitBuild();
 assert.equal(DM.sizes.k400,0);assert.equal(DM.res.anch.sz.k400,0);assert.equal(DM.stale,true);
 assert.match($('dmStatus').textContent,/условия изменились/);
 assert.deepEqual(Array.from(DM.res.finger[6].resid),Array.from(DM.res.finger[0].resid));
 charts.forEach(id=>{const ds=S.charts[id].data.datasets;assert.deepEqual(ds[4].data,ds[0].data);assert.match(ds[4].label,/k₄₀₀ = 0·10⁻³/);});
 input('dmK',0);T.sizesFromAnalysis();assert.equal(+$('dmK').value,0);
 // Every shared legend entry controls all four panels and survives all redraw paths.
 for(let j=0;j<5;j++){
   let btn=$('anchLegend').children[j];btn.click();assert.equal(btn.getAttribute('aria-pressed'),'false');
   charts.forEach(id=>assert.equal(S.charts[id].data.datasets[j].hidden,true));
   T.redrawCharts();charts.forEach(id=>assert.equal(S.charts[id].data.datasets[j].hidden,true));
   T.renderAnchors();assert.equal($('anchLegend').children[j].getAttribute('aria-pressed'),'false');
   $('anchLegend').children[j].click();charts.forEach(id=>assert.equal(S.charts[id].data.datasets[j].hidden,false));
 }
 // Correct σ channel and denominator on every panel, with an exact round trip.
 const deg=charts.map(id=>S.charts[id].data.datasets.map(ds=>ds.data.map(p=>p.y)));
 $('anchUnits').querySelector('[data-u="sig"]').click();
 charts.forEach((id,i)=>S.charts[id].data.datasets.forEach((ds,j)=>ds.data.forEach((p,k)=>{
   const pat=DM.res.anch.pat[i%2===0?'HW':'QW'];close(p.y,deg[i][j][k]/pat[i<2?'sigPsi':'sigDel'][k]);
 })));
 $('anchUnits').querySelector('[data-u="deg"]').click();
 charts.forEach((id,i)=>assert.deepEqual(S.charts[id].data.datasets.map(ds=>ds.data.map(p=>p.y)),deg[i]));
 $('figAnchPat').querySelector('[data-act="table"]').click();
 assert.match($('figAnchPat').querySelector('.fig-table').textContent,/QW · Ψ · Ψ − Ψ однородной плёнки/);
 // A standalone exported panel receives a legend and then restores its screen options.
 let exported=false,downloaded=false;w.URL.createObjectURL=()=>{downloaded=true;return 'blob:test';};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=()=>{};
 const chart=S.charts.cAnchPsiHW;chart.canvas.toBlob=cb=>{assert.equal(chart.options.plugins.legend.display,true);assert.equal(chart.options.devicePixelRatio,3);assert.ok(chart.width>=720);exported=true;cb(new w.Blob(['png']));};
 T.exportPng(chart,'anchors');assert.ok(exported&&downloaded);assert.equal(chart.options.plugins.legend.display,false);
 // Large gradients use the same converged discretization as finalFit (160 sublayers).
 DM.sizes={delta:.15,rough:0,k400:0};T.dmAnchors(DM.base);
 const A=DM.res.anch,base=DM.base,cfg=base.cfg,lam=A.HW;
 const exact=E.modelPsiDelta(lam,E.substrateN(cfg.subKey,lam),cfg.phi,base.d,base.mat,.15,0,E.subLayersFor(.15),cfg.back,null);
 const sub=E.modelPsiDelta(lam,E.substrateN(cfg.subKey,lam),cfg.phi,0,base.mat,0,0,1,cfg.back,null);
 A.pat.HW.psi[1].forEach((v,i)=>close(v,exact.psi[i]-sub.psi[i]));
 assert.equal(errors.length,0,errors.join('\n'));dom.window.close();
 console.log('PASS: source priority, fit units/veto, real final fit, simulator fallback, zero physics, build snapshot, five linked legend entries, redraw persistence, all four σ conversions, table/PNG export, 15% gradient discretization.');
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1;});
