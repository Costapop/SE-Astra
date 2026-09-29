#!/usr/bin/env node
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
let html=read('src/app_template.html');
const replacements={'/*__CORE__*/':read('src/ellip_core.js'),'/*__EXAMPLES__*/[]':read('examples/examples.json').trim(),'/*__ASTRA_CSS__*/':read('src/astra.css'),'/*__ASTRA_JS__*/':read('src/astra.js')};
for(const [key,value] of Object.entries(replacements)){ if(!html.includes(key))throw new Error('Missing build marker '+key);html=html.replace(key,()=>value); }
fs.writeFileSync(path.join(root,'index.html'),html);
fs.mkdirSync(path.join(root,'dist'),{recursive:true});fs.writeFileSync(path.join(root,'dist/index.html'),html);
if(fs.existsSync(path.join(root,'vendor')))fs.cpSync(path.join(root,'vendor'),path.join(root,'dist/vendor'),{recursive:true});
console.log(`Built SE Astra: ${Buffer.byteLength(html)} bytes`);
