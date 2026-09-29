// Interface enhancements share the original application's state and actions.
function selectPanel(name) {
  document.querySelectorAll('[data-panel]').forEach(b => { const on = b.dataset.panel === name; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; $('panel-' + b.dataset.panel).hidden = !on; });
}
document.querySelectorAll('[data-panel]').forEach(b => {
  b.addEventListener('click', () => selectPanel(b.dataset.panel));
  b.addEventListener('keydown', e => {
    const tabs = [...document.querySelectorAll('[data-panel]')]; let next = tabs.indexOf(b);
    if (e.key === 'ArrowRight') next = (next + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (next + tabs.length - 1) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else return;
    e.preventDefault(); selectPanel(tabs[next].dataset.panel); tabs[next].focus();
  });
});
function updateSummary() {
  if(!window.document)return;
  $('summaryMaterial').textContent = matSel.selectedOptions[0]?.textContent.split(' (')[0] || '—';
  const substrateLabel=subSel.selectedOptions[0]?.textContent || '';
  $('summarySubstrate').textContent = subSel.value === 'bk7' ? 'BK7' : subSel.value === 'silica' ? 'Кварц' : substrateLabel.startsWith('Кремний') ? 'c-Si' : substrateLabel.startsWith('Стекло n') ? 'n = 1.52' : substrateLabel.split(' (')[0] || '—';
  $('summaryAngle').textContent = $('phi').value + '°';
  if (S.data) $('summaryRange').textContent = `${Math.round(S.data.lam[0])}–${Math.round(S.data.lam.at(-1))} нм`;
  [S.ref,S.train,S.probs,S.fin].forEach((done,i) => $('btn'+(i+1)).classList.toggle('stage-done',!!done));
}
new MutationObserver(updateSummary).observe($('dataInfo'), { childList:true,subtree:true,characterData:true });
document.querySelectorAll('#analysisControls input,#analysisControls select').forEach(el => el.addEventListener('change',updateSummary));
new MutationObserver(updateSummary).observe($('globalStatus'), { childList:true,subtree:true,characterData:true });
// Method details stay available without dominating the working surface.
document.querySelectorAll('.step:not(#s0)>.lead').forEach(p => {
  const details=document.createElement('details'); details.className='method-detail';
  const summary=document.createElement('summary'); summary.textContent='Как это работает';
  p.before(details); details.append(summary,p);
});
// Native drag-and-drop and file input go through the same import path.
const zone=$('uploadZone');
zone.addEventListener('dragover',ev=>{ev.preventDefault();zone.classList.add('dragging');});
zone.addEventListener('dragleave',()=>zone.classList.remove('dragging'));
zone.addEventListener('drop',ev=>{ev.preventDefault();zone.classList.remove('dragging');if(ev.dataTransfer.files.length){$('fileIn').files=ev.dataTransfer.files;$('fileIn').dispatchEvent(new Event('change'));}});
// The same settings remain available at every viewport size.
const compactMedia=window.matchMedia?.('(max-width:720px)');
const samplePanel=$('panel-sample'),conditionsCard=samplePanel.querySelectorAll('.card')[1];
const compactDetails=document.createElement('details'); compactDetails.className='mobile-settings';
const compactSummary=document.createElement('summary'); compactSummary.textContent='Условия измерения и материал';
conditionsCard.before(compactDetails); compactDetails.append(compactSummary,conditionsCard);
const syncCompact=()=>{compactDetails.open=!compactMedia?.matches;};syncCompact();compactMedia?.addEventListener?.('change',syncCompact);
document.querySelector('.appbar .seg').addEventListener('click',ev=>{
 if(!compactMedia?.matches||!ev.target.closest('button'))return;
 const order=['auto','light','dark'],current=document.documentElement.getAttribute('data-theme')||'auto';applyTheme(order[(order.indexOf(current)+1)%3]);
});
// Configurations are tied to a trained classifier. Changes require a fresh fit.
['matSel','subSel','phi','phiErr','dNom','dRange','bw','sigDef','mA','mE0','mC','mEg','mAuv','mEuv','backFerr','deltaMax','kMax','seed','nTrain'].forEach(id=>$(id).addEventListener('change',()=>{
  if(S.data){S.analysisStale=true;if(S.onCfgChange)S.onCfgChange();['btn2','btn3','btn4'].forEach(id=>$(id).disabled=true);$('globalStatus').textContent='Условия изменились. Выполните анализ заново.';$('analysisFreshness').textContent='Предыдущие результаты · условия изменились';updateSummary();}
}));
// Accessible structured actions for browsers supporting WebMCP.
if(document.modelContext?.registerTool){
  const lifecycle=new AbortController();
  const register=tool=>{try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
  register({name:'read_analysis_state',description:'Read the selected spectrum, conditions and completed analysis stages.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute(){return{sample:S.example?.title||'Пользовательский спектр',points:S.data?.lam.length||0,material:matSel.value,substrate:subSel.value,angle:Number($('phi').value),busy:astraBusy,stale:!!S.analysisStale,stages:{reference:!!S.ref,training:!!S.train,diagnosis:!!S.probs,final:!!S.fin},status:$('globalStatus').textContent};}});
  register({name:'select_example_spectrum',description:'Replace the current spectrum with one of the nine built-in examples and clear previous analysis results. Index starts at 1.',inputSchema:{type:'object',properties:{index:{type:'integer',minimum:1,maximum:9}},required:['index'],additionalProperties:false},annotations:{readOnlyHint:false},execute(input){if(!input||Object.keys(input).some(k=>k!=='index')||!Number.isInteger(input.index)||input.index<1||input.index>EXAMPLES.length)throw new Error('Номер образца должен быть от 1 до 9.');if(astraBusy||DM.building)throw new Error('Дождитесь завершения расчёта.');exSel.value=String(input.index-1);exSel.dispatchEvent(new Event('change'));selectPanel('sample');updateSummary();return{sample:S.example.title,points:S.data.lam.length};}});
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
