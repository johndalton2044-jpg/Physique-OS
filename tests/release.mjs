#!/usr/bin/env node
/* RELEASE VERIFICATION (\u00a733, \u00a737, \u00a738 and the 24-item final verification list)
 *
 * Every item on the list is mapped to something that actually runs, and its outcome is recorded with evidence. An
 * item with no check is reported as NOT VERIFIED rather than ticked. The documents in docs/release are generated
 * here from those results and are never edited by hand.
 *
 *   node tests/release.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {JSDOM,VirtualConsole} from 'jsdom';

const ITEMS=[];   // {n,label,status:'PASS'|'FAIL'|'NOT VERIFIED',evidence}
const item=(n,label,ok,evidence)=>ITEMS.push({n,label,status:ok===null?'NOT VERIFIED':(ok?'PASS':'FAIL'),evidence:evidence||''});
const run=(cmd)=>{const r=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['run','-s',cmd],{encoding:'utf8',maxBuffer:64*1024*1024});
  const out=(r.stdout||'')+(r.stderr||'');
  const summary=out.split('\n').filter(l=>/passed,|finding\(s\)|all passed|dist verified|failing|within budget|viewports|verified|failed$/.test(l)).slice(-2).join(' \u00b7 ').trim();
  return {ok:r.status===0,summary:summary||out.trim().split('\n').slice(-1)[0]||''};};

console.log('running the gates \u2014 this takes several minutes');
/* ---------------- gates, in order ---------------- */
const G={};
function manifestBuildId(){try{return JSON.parse(fs.readFileSync('dist/version.json','utf8')).build;}catch(e){return null;}}
const GATES=['build','authority','layers','maturity','dictionary','engine','test','adversarial','audit','conformance','governance','shipped','browser','visual','persistence','spine','parity','adapt','integration','intelligence','external','deploy','voice','direction','server','timezones','connect','inputs','blackbox','ai','reproducible','perf','cloud:e2e','yields:gate','baseline','verify'];
/* --from-results: use gates recorded by tests/gate-record.mjs, ONLY if every one passed against the identical build now in
   dist/. Anything else — a missing gate, a failure, a different build — and the gates are run here as before. */
let reused=false;
if(process.argv.includes('--from-results')){
  try{const cur=JSON.parse(fs.readFileSync(path.join('dist','version.json'),'utf8')).build;
    const rec=JSON.parse(fs.readFileSync(path.join('docs','release','gate-results.json'),'utf8'));
    const missing=GATES.filter(g=>!(rec.gates&&rec.gates[g]&&rec.gates[g].ok));
    if(rec.build===cur&&!missing.length){reused=true;GATES.forEach(g=>{G[g]={ok:true,summary:'recorded against build '+cur+': '+rec.gates[g].summary};});
      console.log('  using gate results recorded against build '+cur);}
    else console.log('  recorded results not usable ('+(rec.build!==cur?'recorded for build '+rec.build+', dist is '+cur:'missing or failed: '+missing.join(', '))+') \u2014 running the gates');
  }catch(e){console.log('  no recorded results \u2014 running the gates');}
}
if(!reused)for(const g of GATES){
  process.stdout.write('  '+g.padEnd(12));G[g]=run(g);console.log(G[g].ok?'pass':'FAIL','  '+G[g].summary.slice(0,110));
}

/* ---------------- explicit verifications, in the running app ---------------- */
const vc=new VirtualConsole();const errs=[];vc.on('jsdomError',e=>errs.push(String(e&&e.message).slice(0,160)));
const dom=new JSDOM(fs.readFileSync('dist/index.html','utf8'),{url:'https://physique.local/app/index.html',runScripts:'dangerously',
  pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
    w.scrollTo=()=>{};w.fetch=undefined;w.HTMLElement.prototype.scrollIntoView=function(){};}});
await new Promise(r=>setTimeout(r,1000));
const w=dom.window;w.loadDemo();
const tryv=(f)=>{try{return f();}catch(e){return {__error:String(e&&e.message||e)};}};

/* 11 replay: nothing after the replay date is visible at it */
const replay=tryv(()=>{const d=w.addDays(w.todayISO(),-21);const leaks=w.replayLeakageCheck([d,w.addDays(d,-14)]);
  const r=w.replayAt(d);const future=w.withAsOf(d,()=>w.obsOf('weight').filter(o=>o.date>d).length);
  return {leaks:leaks.length,future,decided:!!(r&&r.decision)};});
/* 12 migration */
const migration=tryv(()=>{const v1=JSON.parse(JSON.stringify(w.emptyDB()));v1.schemaVersion=1;
  const up=w.migrate(v1);const newer=w.migrate(Object.assign({},w.emptyDB(),{schemaVersion:999}));
  const junk=w.migrate({schemaVersion:'x'});
  return {upgraded:up.ok&&up.db.schemaVersion===w.SCHEMA_VERSION,applied:(up.applied||[]).length,newerRefused:!newer.ok,junkRefused:!junk.ok};});
/* 13 provenance */
const prov=tryv(()=>{let bad=[];w.MODELS.forEach(m=>{const r=w.infer({modelId:m.id});
  if(r.status==='ok'&&(!r.provenance||!r.provenance.nodes.some(n=>n.type==='model-run')))bad.push(m.id);});
  return {audit:w.provenanceAudit().ok,missing:bad};});
/* 14 uncertainty propagation: uncertainty grows where it must */
const unc=tryv(()=>{const F=w.forecastFamily();const sds=[7,14,28].map(h=>F.forecastDistribution[h]&&F.forecastDistribution[h].sd).filter(x=>x!=null);
  const rec=w.recoveryLatentState();const bands=[rec.hi-rec.lo].concat(rec.forecast.map(f=>f.hi-f.lo));
  const sc=w.runScenario(w.buildScenario('x',{calories:-200}));
  return {forecastWidens:sds.every((x,i)=>i===0||x>=sds[i-1]-1e-9),recoveryWidens:bands.every((x,i)=>i===0||x>=bands[i-1]-1e-9),
    scenarioCarriesTrend:sc.uncertaintyParts.trend>0&&sc.rateSd>=sc.uncertaintyParts.trend};});
/* 15 dependency invalidation */
const dep=tryv(()=>{const a=w.affectedBy('weight');const before=w._viewIdentity('weightTrend');
  const o=w.DB.observations.filter(x=>x.type==='weight').slice(-1)[0];const keep=o.value;o.value=keep-10;
  const after=w._viewIdentity('weightTrend');const food=w._viewIdentity('weightTrend');o.value=keep;w._memoInvalidate();
  return {reachesTrend:a.models.includes('weight_trend'),reachesTdee:a.models.includes('tdee_personal'),identityChanges:before!==after};});
/* 19 export/import round trips */
const rt=tryv(()=>{const kinds=Object.keys(w.EXPORT_ADAPTERS).filter(k=>w.EXPORT_ADAPTERS[k].apply);
  const res={};kinds.forEach(k=>{const e=w.exportArtifact(k,'json');if(e.status!=='ok'){res[k]='nothing to export';return;}
    const r=w.importArtifact(e.text);res[k]=r.status;});return res;});

/* \u00a733 adversarial matrix \u2014 one concrete check per case */
const adv={};
adv['missing data']=tryv(()=>{const r=w.infer({modelId:'bodycomp_circ'});const keep=w.DB.observations;
  w.DB.observations=[];w._memoInvalidate();const e=w.infer({modelId:'weight_trend'});w.DB.observations=keep;w._memoInvalidate();
  return e.status!=='ok'||e.degraded?true:(JSON.stringify(e.value||{}).indexOf('NaN')<0);});
adv['conflicting data']=tryv(()=>{const d=w.todayISO();const n=w.DB.observations.length;
  w.DB.observations.push({id:'adv-c1',type:'weight',date:d,value:240,source:'scale-b'});w._memoInvalidate();
  const f=w.fuseObservations('weight',d);w.DB.observations=w.DB.observations.slice(0,n);w._memoInvalidate();
  return f&&f.status!=='error'&&!/NaN/.test(JSON.stringify(f));});
adv['corrected data']=tryv(()=>{const o=w.DB.observations.filter(x=>x.type==='weight').slice(-1)[0];const t0=w.weightTrend(14).slopePerWeek;
  const r=w.correctObservation(o.id,o.value-5,'release check');w._memoInvalidate();
  const visible=w.obsOf('weight').filter(x=>x.id===o.id).length;return visible===0&&w.weightTrend(14).slopePerWeek!==t0;});
adv['retracted data']=tryv(()=>{const o=w.obsOf('weight').slice(-1)[0];w.retractObservation(o.id,'release check');w._memoInvalidate();
  return w.obsOf('weight').every(x=>x.id!==o.id);});
adv['stale data']=tryv(()=>{const d=w.addDays(w.todayISO(),120);return w.withAsOf(d,()=>{const r=w.infer({modelId:'weight_trend'});
  return r.status!=='ok'||r.degraded||(r.diagnostics||[]).length>0||(r.value&&r.value.status!=='ok');});});
adv['unit mismatch']=tryv(()=>w.validateQuantityValue('weight',80,'kcal').ok===false&&w.assertDimensionallyCompatible('weight','intake').ok===false);
adv['invalid dates']=tryv(()=>{let threw=false,rec=null;try{rec=w.makeObservation({type:'weight',date:'2026-13-45',value:250});}catch(e){threw=true;}
  return threw||!rec||rec.date!=='2026-13-45';});
adv['version mismatch']=tryv(()=>!w.migrate(Object.assign({},w.emptyDB(),{schemaVersion:999})).ok&&
  w.importArtifact(JSON.stringify({kind:'physique-os/dashboard',schemaVersion:99,data:{}})).stage==='version');
adv['dependency invalidation']=tryv(()=>dep.identityChanges===true);
adv['duplicate events']=tryv(()=>{let n=0;const k=w.idempotencyKey('release-dup',{a:1});w.runIdempotent(k,()=>{n++;});w.runIdempotent(k,()=>{n++;});return n===1;});
adv['impossible values']=tryv(()=>{const d=w.todayISO();const t0=w.weightTrend(14).slopePerWeek;
  const r=w.addObservation({type:'weight',date:d,value:9999},{silent:true,noSave:true});w._memoInvalidate();
  const flagged=r&&r.flags&&r.flags.indexOf('outside plausible range')>=0;const t1=w.weightTrend(14).slopePerWeek;
  if(r&&r.id)w.retractObservation(r.id,'release check');w._memoInvalidate();
  /* Flagging is not enough: the first version of this check passed a flagged value that still moved the trend. */
  return flagged&&Math.abs(t1-t0)<1e-9;});
function round(x){return Math.round(x*1000)/1000;}

/* \u00a738 traceability: a new observation followed through every stage */
const trace=tryv(()=>{
  const d=w.todayISO();const stages={};
  const t0=w.infer({modelId:'weight_trend'});
  const r=w.addObservation({type:'weight',date:d,value:(w.obsOf('weight').slice(-1)[0].value-0.6)},{silent:true});
  stages.OBSERVATION=!!(r&&r.id);
  stages.EVENT=(w._EVENTS||[]).some(e=>/observation/.test(e.type));
  w._memoInvalidate();
  const S=w.getCurrentState();stages.STATE=!!(S&&S.weight);
  const t1=w.infer({modelId:'weight_trend'});stages.MODEL=t1.status==='ok';
  stages.INFERENCE=t1.runId!==t0.runId;
  stages.EVIDENCE=w.canonicalKnowledgeGraph().nodes.some(n=>n.type==='finding'||n.type==='observation');
  stages.UNCERTAINTY=!!(t1.uncertainty&&t1.uncertainty.sources.length);
  stages.PROVENANCE=t1.provenance.nodes.some(n=>n.type==='observation'&&n.source==='weight');
  const dec=w.decide();stages.DECISION=!!(dec&&dec.code);
  const v=w.buildVisualization({modelId:'weight_trend',chartType:'line'});
  stages['PRESENTATION MODEL']=!!(v.presentationModel);stages.VISUALIZATION=v.status==='ok'&&/<svg/.test(v.html);
  w.switchTab('today');stages.VIEW=(w.document.getElementById('todayDecision')||w.document.body).innerHTML.length>0;
  stages['USER ACTION']=typeof w.ACTIONS['log.type']==='function'||!!w.ACTIONS['log.type'];
  const r2=w.addObservation({type:'waist',date:d,value:40},{silent:true});stages['NEW OBSERVATION']=!!(r2&&r2.id);
  return stages;});

/* ---------------- record the 24 items ---------------- */
const all=(o)=>o&&!o.__error&&Object.values(o).every(v=>v===true||(typeof v==='number'&&v===0)||(Array.isArray(v)&&v.length===0));
item(1,'Build',G.build.ok,G.build.summary);
item(2,'Engine',G.engine.ok,G.engine.summary);
item(3,'Unit tests (in-app self-tests)',G.engine.ok&&G.shipped.ok,'engine: '+G.engine.summary+' \u00b7 shipped: '+G.shipped.summary);
item(4,'DOM tests',G.test.ok,G.test.summary);
item(5,'Browser tests',G.browser.ok,G.browser.summary);
item(6,'Audit',G.audit.ok,G.audit.summary);
item(7,'Conformance',G.conformance.ok,G.conformance.summary);
item(8,'Adversarial tests',G.adversarial.ok,G.adversarial.summary);
item(9,'Performance tests',G.perf.ok,G.perf.summary);
item(10,'Cloud E2E',G['cloud:e2e'].ok,G['cloud:e2e'].summary);
item(11,'Replay verification',!replay.__error&&replay.leaks===0&&replay.future===0&&replay.decided,JSON.stringify(replay));
/* applied is how many migrations ran, not a count of problems — the first version of this line treated it as one. */
item(12,'Migration verification',!migration.__error&&migration.upgraded&&migration.applied>=1&&migration.newerRefused&&migration.junkRefused,JSON.stringify(migration));
item(13,'Provenance verification',!prov.__error&&prov.audit&&prov.missing.length===0,JSON.stringify(prov));
item(14,'Uncertainty propagation verification',all(unc),JSON.stringify(unc));
item(15,'Dependency invalidation verification',all(dep),JSON.stringify(dep));
item(16,'Accessibility verification',G.browser.ok&&G.audit.ok,'browser gate: contrast and 44px targets at 6 viewports; audit: labels, focus, reachability');
item(17,'Responsive verification',G.browser.ok,'browser gate: 6 viewports \u00d7 12 tabs and every form sheet');
item(18,'Visual regression verification',G.visual.ok,G.visual.summary);
item(19,'Export/import round trips',!rt.__error&&Object.values(rt).every(v=>v==='ok'||v==='nothing to export'),JSON.stringify(rt));
/* the count comes from the live registry, via the baseline written for THIS build; a hand-written "25" drifted */
const _bl=fs.existsSync('docs/implementation/baseline.json')?JSON.parse(fs.readFileSync('docs/implementation/baseline.json','utf8')):null;
const _blOk=!!(_bl&&manifestBuildId()&&_bl.sourceBuildId===manifestBuildId());
item(20,'Model reproducibility',G.visual.ok&&_blOk,(_bl?_bl.registries.models:'?')+' models (from the live registry'+(_blOk?'':', but the baseline is from another build')+'), identical results and run identities across independent loads at a pinned time');
item(21,'Production build',G.build.ok&&G.verify.ok,G.verify.summary);
const manifest=fs.existsSync('dist/BUILD-MANIFEST.json')?JSON.parse(fs.readFileSync('dist/BUILD-MANIFEST.json','utf8')):null;
item(22,'Release manifest',!!manifest,manifest?('build '+manifest.build+', release '+manifest.release+', '+(manifest.inputs||[]).length+' hashed inputs'):'no manifest');
item(23,'Architecture/conformance report',G.governance.ok&&G.conformance.ok,'docs/implementation/governance-report.md');
const cm=w.capabilityMatrix();const mr=w.maturityReport();
item(24,'Capability maturity report',!!(cm&&mr),'docs/release/capability-maturity.md');

/* ---------------- documents ---------------- */
const OUT='docs/release';fs.mkdirSync(OUT,{recursive:true});
const version=JSON.parse(fs.readFileSync('dist/version.json','utf8'));
const passN=ITEMS.filter(i=>i.status==='PASS').length,failN=ITEMS.filter(i=>i.status==='FAIL').length,nvN=ITEMS.filter(i=>i.status==='NOT VERIFIED').length;
const advRows=Object.entries(adv).map(([k,v])=>{const ok=v===true||(v&&v.flagged===true);return [k,v&&v.__error?'ERROR':(ok?'PASS':'FAIL'),typeof v==='object'?JSON.stringify(v):String(v)];});
const trRows=trace&&!trace.__error?Object.entries(trace):[];
const md=[`# Release ${version.build}`,'',`Release id ${version.release} \u00b7 schema ${version.schema} \u00b7 generated ${new Date().toISOString()}`,'',
  `**${passN} of ${ITEMS.length} verification items pass**`+(failN?` \u00b7 **${failN} fail**`:'')+(nvN?` \u00b7 ${nvN} not verified`:''),'',
  '## Final verification','','| # | Item | Status | Evidence |','|---|---|---|---|',
  ...ITEMS.map(i=>`| ${i.n} | ${i.label} | ${i.status} | ${String(i.evidence).replace(/\|/g,'\\|').slice(0,160)} |`),'',
  '## Adversarial cases (\u00a733)','','| Case | Result | Detail |','|---|---|---|',...advRows.map(r=>`| ${r[0]} | ${r[1]} | ${r[2].replace(/\|/g,'\\|').slice(0,120)} |`),'',
  '## Traceability (\u00a738)','','A new weight observation followed through every stage of the chain:','',
  ...trRows.map(([k,v])=>`- ${v?'\u2713':'\u2717'} ${k}`),''].join('\n');
fs.writeFileSync(path.join(OUT,'RELEASE.md'),md);
/* capability maturity */
const mat=['# Capability maturity','',`Build ${version.build}. Every status is derived from evidence the build can check; none is assigned by hand.`,'',
  '| Capability | Domain | Status | Maturity |','|---|---|---|---|',...cm.rows.map(r=>`| ${r.id} | ${r.domain} | ${r.status} | ${r.maturity||'\u2014'} |`),'',
  '## Models','','| Model | Version | Maturity | Evidence |','|---|---|---|---|',
  ...w.MODELS.map(m=>{const c=w.modelContract(m.id);return `| ${m.id} | ${c.version} | ${c.maturity} | ${c.maturityEvidence?c.maturityEvidence.verdict:(c.maturitySource==='derived'?'graded by rule':'assigned')} |`;}),'',
  `Production-ready capabilities: ${cm.detections.productionReady.length}. Experimentally validated engines: ${mr.experimentallyValidated}.`,''].join('\n');
fs.writeFileSync(path.join(OUT,'capability-maturity.md'),mat);
/* definition of done, per capability */
const dodRows=cm.rows.map(r=>{const e=r.evidence||{};
  return `| ${r.id} | ${e.implemented?'\u2713':'\u2717'} | ${e.integrated?'\u2713':'\u2717'} | ${e.surfaced?'\u2713':'\u2717'} | ${e.validated?'\u2713':'\u2717'} | ${e.productionReady?'\u2713':'\u2717'} |`;});
fs.writeFileSync(path.join(OUT,'definition-of-done.md'),['# Definition of done (\u00a737)','',
  'Per capability, from the capability registry. A capability is complete only when every box is ticked; most are not, and this says so.','',
  '| Capability | Coded | Integrated | Surfaced | Validated | Production-ready |','|---|---|---|---|---|---|',...dodRows,''].join('\n'));
/* manifest: every dist file, hashed */
const files=[];(function walk(d){for(const f of fs.readdirSync(d)){const p=path.join(d,f);const st=fs.statSync(p);
  if(st.isDirectory()){if(!/data[\/\\]food/.test(p))walk(p);}else files.push({file:path.relative('dist',p),bytes:st.size,sha256:crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')});}})('dist');
fs.writeFileSync(path.join(OUT,'release-manifest.json'),JSON.stringify({build:version.build,release:version.release,schema:version.schema,
  generatedAt:new Date().toISOString(),verification:ITEMS,adversarial:adv,traceability:trace,files},null,2)+'\n');

/* ---------------- output ---------------- */
console.log('\nFINAL VERIFICATION');ITEMS.forEach(i=>console.log(`  ${String(i.n).padStart(2)}  ${i.status.padEnd(12)} ${i.label}`));
console.log('\nADVERSARIAL (\u00a733)');advRows.forEach(r=>console.log(`  ${r[1].padEnd(6)} ${r[0].padEnd(24)} ${r[2].slice(0,90)}`));
console.log('\nTRACEABILITY (\u00a738)');trRows.forEach(([k,v])=>console.log(`  ${v?'\u2713':'\u2717'} ${k}`));
if(errs.length)console.log('\nruntime errors:',errs.slice(0,3).join(' | '));
const advFail=advRows.filter(r=>r[1]!=='PASS').length,trFail=trRows.filter(([k,v])=>!v).length;
console.log(`\n${passN}/${ITEMS.length} verification items pass \u00b7 adversarial ${advRows.length-advFail}/${advRows.length} \u00b7 traceability ${trRows.length-trFail}/${trRows.length} \u2014 documents in ${OUT}/`);
process.exit((failN||advFail||trFail||errs.length)?1:0);
