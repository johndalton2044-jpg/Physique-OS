/* CAPABILITY MATURITY (audit EC-003): no claim may exceed its maturity. docs/capabilities.json is the ledger; this
   gate checks that each level is earned (validated needs a black-box workflow or a registered release gate that
   exists; production-ready needs operational evidence, which nothing has yet), that the README's claims follow each
   capability's rules, and that the README's maturity table is the one generated from the ledger. */
import fs from 'node:fs';
const C=JSON.parse(fs.readFileSync('docs/capabilities.json','utf8')),L=C.levels,rank=m=>L.indexOf(m);
const bb=fs.readFileSync('tests/blackbox.mjs','utf8'),pkg=JSON.parse(fs.readFileSync('package.json','utf8')).scripts,rel=fs.readFileSync('tests/release.mjs','utf8');
const readme=fs.readFileSync('README.md','utf8');const problems=[];
for(const c of C.capabilities){
  if(rank(c.maturity)<0)problems.push(c.id+': unknown level "'+c.maturity+'"');
  for(const e of c.evidence||[]){if(e.blackbox&&!new RegExp("'"+e.blackbox+' ').test(bb))problems.push(c.id+': evidence '+e.blackbox+' is not a workflow in tests/blackbox.mjs');
    if(e.gate&&(!pkg[e.gate]||!rel.includes("'"+e.gate+"'")))problems.push(c.id+': evidence gate '+e.gate+' is not a registered release gate');}
  if(rank(c.maturity)>=rank('validated')&&!(c.evidence||[]).some(e=>e.blackbox||(e.gate&&['persistence','blackbox','cloud:e2e'].includes(e.gate))))problems.push(c.id+': "validated" without independent evidence');
  if(c.maturity==='production-ready'&&!(c.evidence||[]).some(e=>e.operations))problems.push(c.id+': "production-ready" without operational evidence');
  for(const m of (c.readme&&c.readme.must)||[])if(!new RegExp(m,'i').test(readme))problems.push(c.id+': the README must say "'+m+'"');
  for(const m of (c.readme&&c.readme.mustNot)||[]){const hit=readme.match(new RegExp(m,'i'));if(hit)problems.push(c.id+': the README claims "'+hit[0]+'", beyond '+c.maturity);}}
/* MULTIDIMENSIONAL MATURITY (§211): every capability rated on each axis, each level earned */
const AX=C.axes||{},INDEPENDENT_GATES=['persistence','integration','cloud:e2e','blackbox','browser'],CALIBRATION_MEASURED=['forecasting'];
for(const c of C.capabilities){const a=c.axes;if(!a){problems.push(c.id+': no axes');continue;}
  for(const k of Object.keys(AX)){if(k==='engineering'){if(a.engineering!==c.maturity)problems.push(c.id+': engineering ('+a.engineering+') differs from its ladder level ('+c.maturity+')');continue;}
    if(!Array.isArray(AX[k])||AX[k].indexOf(a[k])<0)problems.push(c.id+': '+k+' "'+a[k]+'" is not a level of that axis');}
  const ev=c.evidence||[],bbox=ev.some(e=>e.blackbox),indep=bbox||ev.some(e=>e.gate&&INDEPENDENT_GATES.includes(e.gate));
  if(a.scientific==='population evidence'&&!c.source)problems.push(c.id+': "population evidence" without a cited source');
  if(a.scientific==='backtested'&&!ev.some(e=>e.gate==='engine'||e.gate==='intelligence'))problems.push(c.id+': "backtested" without a gate that scores it');
  if(a.ux==='workflow-tested'&&!bbox)problems.push(c.id+': "workflow-tested" without a black-box workflow');
  if(a.evidence==='independent'&&!indep)problems.push(c.id+': "independent" evidence without a black-box workflow or an independent gate');
  if((a.calibration==='measured'||a.calibration==='calibrated')&&!CALIBRATION_MEASURED.includes(c.id))problems.push(c.id+': calibration "'+a.calibration+'" but no gate scores its calibration');
  if(a.personalization==='personal'&&!CALIBRATION_MEASURED.includes(c.id))problems.push(c.id+': "personal" claimed but it is not fitted to the person\u2019s own data');
  [['scientific','prospectively validated'],['data','real data at scale'],['operational','production'],['evidence','real-world'],['calibration','calibrated']].forEach(([k,v])=>{if(a[k]===v)problems.push(c.id+': '+k+' "'+v+'" is not possible yet');});}
/* the README's table is generated from the ledger */
const na=v=>v==='not applicable'?'\u2014':v;
const table=['<!-- maturity:begin (generated from docs/capabilities.json by tests/maturity.mjs --write) -->','| Capability | Engineering | Scientific | Data | Personalisation | UX | Operational | Evidence | Calibration | Shown by |','|---|---|---|---|---|---|---|---|---|---|',
  ...C.capabilities.map(c=>{const a=c.axes||{};return '| '+c.label+' | '+c.maturity+' | '+na(a.scientific)+' | '+na(a.data)+' | '+na(a.personalization)+' | '+na(a.ux)+' | '+na(a.operational)+' | '+na(a.evidence)+' | '+na(a.calibration)+' | '+((c.evidence||[]).map(e=>e.blackbox?'workflow '+e.blackbox:(e.gate?'gate '+e.gate:'')).join(', ')||'\u2014')+' |';}),'<!-- maturity:end -->'].join('\n');
const re=/<!-- maturity:begin[\s\S]*?<!-- maturity:end -->/;
if(process.argv.includes('--write')){const next=re.test(readme)?readme.replace(re,table):readme.replace(/\n## /,'\n## Capability maturity\n\nWhat is finished, what is partial and what is not built, with the evidence for each. Levels: '+L.join(' \u2192 ')+'.\n\n'+table+'\n\n## ');fs.writeFileSync('README.md',next);console.log('README maturity table written');process.exit(0);}
if(!re.test(readme))problems.push('the README has no generated maturity table (run node tests/maturity.mjs --write)');else if(readme.match(re)[0]!==table)problems.push('the README\u2019s maturity table differs from the ledger (edit docs/capabilities.json, then --write)');
const by={};C.capabilities.forEach(c=>{by[c.maturity]=(by[c.maturity]||0)+1;});
console.log('  '+C.capabilities.length+' capabilities: '+L.filter(l=>by[l]).map(l=>by[l]+' '+l).join(', '));
problems.forEach(p=>console.log('  FAIL  '+p));if(!problems.length)console.log('  pass  every claim is within its capability\u2019s maturity');
console.log(problems.length?problems.length+' failed':'all passed');process.exit(problems.length?1:0);
