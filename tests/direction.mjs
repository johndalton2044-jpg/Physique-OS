/* IMPLEMENTATION DIRECTION CONFORMANCE. The specification's required fields, kept here, checked against real calls on the
   demo record (not against names in the source). Sections covered: 2 quantities, 3 model registry, 4 infer(),
   5 dependency graph, 7 run identity, 8 version vector, 9 materialisation, 10 uncertainty. */
import fs from 'node:fs';import {JSDOM,VirtualConsole} from 'jsdom';
let failed=0;const line=(ok,msg,d)=>{if(!ok)failed++;console.log('  '+(ok?'pass':'FAIL')+'  '+msg+(d&&!ok?'  \u2014 '+d:''));};
const errs=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errs.push(String(e&&e.message)));
const dom=new JSDOM(fs.readFileSync('dist/index.html','utf8'),{url:'https://physique.local/app/index.html',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,
  beforeParse(w){w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.scrollTo=()=>{};w.fetch=undefined;w.HTMLElement.prototype.scrollIntoView=function(){};}});
await new Promise(r=>setTimeout(r,900));const w=dom.window;w.loadDemo();
const lacks=(o,fields)=>fields.filter(f=>!(o&&f in o));
const SPEC={
  quantity:['dimension','unitFamily','canonicalUnit','acceptedUnits','conversion','precision','display','aggregation','temporalSemantics','uncertaintySemantics','missingnessSemantics'],
  model:['id','version','maturity','inputs','outputs','dependencies','assumptions','applicability','evidenceRequirements','uncertaintyContract','provenanceContract','materialization','lifecycle','validation','consumers'],
  inferResult:['runId','modelId','modelVersion','asOf','request','subject','context','outputs','maturity','assumptions','applicability','dependencies','diagnostics','uncertainty','provenance','versionVector'],
  inferRequest:['modelId','subject','context','options','requestedOutputs'],
  edge:['dependencyId','sourceId','targetId','dependencyType','scope','version'],
  materialized:['runId','modelVersion','asOf','identity'],
  uncertainty:['sources','distribution','interval','confidence','calibration','propagation','limitations']
};
/* \u00a72 */ {const bad=Object.keys(w.QUANTITY_REGISTRY).map(k=>[k,lacks(w.QUANTITY_REGISTRY[k],SPEC.quantity)]).filter(x=>x[1].length);
  line(!bad.length,'\u00a72 every quantity carries the specified fields, conversion and display included',JSON.stringify(bad.slice(0,3)));
  const q=w.QUANTITY_REGISTRY.weight;line(q.conversion.factors.kg>2.2&&q.conversion.factors.kg<2.21,'\u00a72 conversion factors are the converter\u2019s own (1 kg = 2.20462 lb)');}
/* \u00a73 */ {const bad=w.MODELS.map(m=>[m.id,lacks(w.modelContract(m.id),SPEC.model)]).filter(x=>x[1].length);
  line(!bad.length,'\u00a73 every model\u2019s contract carries the specified fields ('+w.MODELS.length+' models)',JSON.stringify(bad.slice(0,3)));
  line(w.MODELS.every(m=>w.modelContract(m.id).maturity!=='production-validated'||w.modelContract(m.id).maturityEvidence),'\u00a73 no model claims production maturity without evidence');}
/* \u00a74 */ {const r=w.infer({modelId:'weight_avg',subject:'self',context:{phase:'cut'},options:{},requestedOutputs:['avg7']});
  line(r.status==='ok'&&!lacks(r,SPEC.inferResult).length,'\u00a74 infer() returns the specified result',JSON.stringify(lacks(r,SPEC.inferResult)));
  line(!lacks(r.request,SPEC.inferRequest).length&&r.request.context.phase==='cut','\u00a74 the specified request is carried through, context included',JSON.stringify(r.request));
  line(Object.keys(r.outputs||{}).join()==='avg7','\u00a74 requestedOutputs selects the outputs',JSON.stringify(r.outputs));
  const refused=w.infer({model:'weightAverages'});line(refused.status==='refused','\u00a74 only registry ids are accepted (a bare function name is refused)');}
/* \u00a75 */ {const G=w.dependencyGraph();const bad=G.edges.filter(e=>lacks(e,SPEC.edge).length);
  line(G.edges.length>0&&!bad.length,'\u00a75 every dependency edge carries the specified fields ('+G.edges.length+' edges)',JSON.stringify(bad[0]));}
/* \u00a77, \u00a78 */ {const a=w.infer({modelId:'weight_avg'}),b=w.infer({modelId:'weight_avg'});
  line(a.runId===b.runId,'\u00a77 an identical analysis reproduces the same run id');
  w.addObservation({type:'weight',date:w.todayISO(),value:249.9,source:'manual'},{silent:true,noSave:true});w._memoInvalidate();
  line(w.infer({modelId:'weight_avg'}).runId!==a.runId,'\u00a77 new data changes the run id');
  line(!!a.versionVector&&Object.keys(a.versionVector).length>=5,'\u00a78 every run carries its version vector',JSON.stringify(a.versionVector).slice(0,120));}
/* \u00a79 */ {const m0=w.materialize('tdee',{force:true});line(!lacks(m0,SPEC.materialized).length,'\u00a79 a materialised view carries its run identity, model version and as-of date',JSON.stringify(lacks(m0,SPEC.materialized)));
  const inv=w.invalidateView('tdee');line(inv.status==='invalidated','\u00a79 a view can be invalidated by name');
  const before=w.restatements('tdee').length;
  for(let i=0;i<10;i++)w.addObservation({type:'calories',date:w.addDays(w.todayISO(),-i),value:3900,source:'manual'},{silent:true,noSave:true});w._memoInvalidate();
  const m1=w.recomputeView('tdee');
  line(m1.status==='computed'&&m1.changed===true&&w.restatements('tdee').length===before+1&&w.restatements('tdee').slice(-1)[0].before!=null,'\u00a79 a recomputation that changes the value is kept as a restatement',JSON.stringify({changed:m1.changed,before,after:w.restatements('tdee').length}));}
/* \u00a710 */ {const r=w.infer({modelId:'weight_avg'});line(!lacks(r.uncertainty,SPEC.uncertainty).length,'\u00a710 the uncertainty object carries the specified parts',JSON.stringify(lacks(r.uncertainty,SPEC.uncertainty)));
  line((r.uncertainty.sources||[]).every(s=>!!s.kind),'\u00a710 every uncertainty source names its kind');}
line(errs.length===0,'no errors',errs.slice(0,2).join(' | '));
console.log(failed?failed+' failed':'all passed');process.exit(failed?1:0);
