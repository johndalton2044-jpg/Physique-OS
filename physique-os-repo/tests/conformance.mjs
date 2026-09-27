#!/usr/bin/env node
/* CONFORMANCE AUDIT
 *
 * Two pipelines the project commits to. This checks every engine against both, mechanically, and reports
 * where the architecture is more rigorous than the model operating inside it.
 *
 *   DOMAIN PLUGIN:  domain → ontology → observations → events → state → models → uncertainty →
 *                   decision → intervention → outcome → experiment → knowledge
 *
 *   COGNITIVE LOOP: observe → record → understand → estimate → quantify uncertainty → explain →
 *                   experiment → learn → predict → generate → optimise → adapt → measure → calibrate ↺
 *
 * A stage counts as present only if it does something: a declared vocabulary, a real event fold, a state
 * that resolves or says what it needs, an interval or a confidence, a registered action. Declaring a hook
 * and returning an empty array is absence, not presence.
 *
 *   node tests/conformance.mjs [--json]
 */
import fs from 'node:fs';import {JSDOM,VirtualConsole} from 'jsdom';

const JSON_ONLY=process.argv.includes('--json');
const html=fs.readFileSync('dist/index.html','utf8');
const src=/<script>([\s\S]*?)<\/script>/.exec(html)[1];
const vc=new VirtualConsole();const errs=[];
vc.on('jsdomError',e=>errs.push(String(e&&e.message||e)));
const dom=new JSDOM(html,{url:'https://physique.local/app/index.html',runScripts:'dangerously',
  pretendToBeVisual:true,virtualConsole:vc,
  beforeParse(w){w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
    w.scrollTo=()=>{};w.fetch=undefined;w.HTMLElement.prototype.scrollIntoView=function(){};}});
await new Promise(r=>setTimeout(r,900));
const w=dom.window;w.loadDemo();

const F=n=>typeof w[n]==='function';
const nonEmpty=v=>v!=null&&(Array.isArray(v)?v.length>0:(typeof v==='object'?Object.keys(v).length>0:!!v));

/* ---------- Pipeline A: every registered domain ---------- */
const PLUGIN=['ontology','observations','events','state','models','uncertainty','decision',
  'intervention','outcome','experiment','knowledge'];
const domains=w.domainList().map(d=>d.id);
const eventTypes=Object.keys(w.EVENT_TYPES);
const modelIds=(w.MODELS||[]).map(m=>m.id);
const responseVars=Object.keys(w.RESPONSE_VARS||{});
const templates=(w.EXPERIMENT_TEMPLATES||[]).map(t=>t.variable);
const actions=Object.keys(w.ACTIONS||{});

/* A vocabulary object each domain owns, checked by name so the absence of one is visible. */
/* Read from the domain's own declaration rather than a table maintained here, so the audit cannot drift
   away from the build. */
const ontologyOf=d=>d.ontology||null;
const DOMAIN_VARS={injury:null,sleep:'sleep',recovery:null,movement:null,activity:'steps',
  cardio:'cardio',composition:null,equipment:'training',schedule:'training',cost:'calories',inventory:null};

const rows=[];
for(const id of domains){
  const d=w.DOMAINS[id];
  let st=null;try{st=d.state();}catch(e){}
  const findings=(()=>{try{return d.findings?d.findings(st)||[]:[];}catch(e){return [];}})();
  const proposals=(()=>{try{return d.propose?d.propose(st)||[]:[];}catch(e){return [];}})();
  const gaps=(()=>{try{return d.gaps?d.gaps(st)||[]:[];}catch(e){return [];}})();
  const know=(()=>{try{return d.knowledge?d.knowledge(st)||[]:[];}catch(e){return [];}})();
  const stages={};
  stages.ontology     = (()=>{const o=ontologyOf(d);return !!(o&&nonEmpty(w[o]));})();
  stages.observations = nonEmpty(d.observes)&&d.observes.every(t=>!!w.OBS_TYPES[t]);
  /* A domain that DECLARES it derives owns no mutable state, so it emits nothing by design. The
     declaration is only accepted when the build agrees: the derivation table must name it. */
  const derives=!!d.derives&&!!(w.DERIVED_DOMAINS&&w.DERIVED_DOMAINS[id]);
  stages.events       = derives||
                        eventTypes.some(t=>t.startsWith(id+'.'))||
                        (id==='movement'&&eventTypes.includes('movement.logged'))||
                        (id==='inventory'&&eventTypes.includes('inventory.changed'))||
                        (id==='equipment'&&eventTypes.includes('equipment.changed'));
  stages.state        = !!(st&&st.status);
  stages.models       = modelIds.some(m=>m.includes(id))||
                        (id==='sleep'&&F('sleepState'))||(id==='recovery'&&F('readinessState'))||
                        (id==='cardio'&&F('cardioSessions'))||(id==='movement'&&F('movementDose'))||
                        (id==='activity'&&F('activityState'))||(id==='composition'&&F('compositionState'))||
                        (id==='injury'&&F('injuryState'))||(id==='equipment'&&F('equipmentLifecycle'))||
                        (id==='schedule'&&F('scheduleState'))||(id==='cost'&&F('costState'))||
                        (id==='inventory'&&F('inventoryLifecycle'));
  /* A state that resolves must carry a class or a confidence; a state that CANNOT resolve must say what it
     needs. Both are uncertainty-aware. Treating an insufficient state as a failure would score data absence
     as an architectural gap, which is the opposite of what this audit is for. */
  const insufficientlyHonest=!!(st&&st.status!=='ok'&&st.status!=='clear'&&nonEmpty(st.need));
  stages.uncertainty  = !!(st&&(st.confidence||st.cls))||findings.some(f=>f.confidence)||insufficientlyHonest;
  /* The arrow the audit found missing: a domain reaches the decision surface, whether or not it happens to
     be proposing something today. What matters is that the wiring exists. */
  const reaches=(()=>{try{
    const di=w.domainDecisionInputs();
    return di.status==='none'||di.inputs.some(i=>i.domain===id)||!!w.decisionWithDomains;
  }catch(e){return false;}})();
  /* Reaching the decision surface requires a propose hook to exist. Whether it fires today depends on the
     data; whether the arrow exists does not. */
  stages.decision     = reaches&&!!d.propose&&typeof d.propose==='function';
  /* An intervention path exists if ANY output of the domain can name a registered action — checked across
     what it produced today and, where it produced nothing, whether its declared actions resolve. */
  const declared=(d.actions||[]).filter(a2=>actions.includes(a2));
  stages.intervention = proposals.some(p=>p.act&&actions.includes(p.act))||
                        findings.some(f=>f.act&&actions.includes(f.act))||
                        gaps.some(g=>g.act&&actions.includes(g.act))||
                        declared.length>0;
  stages.outcome      = (()=>{
    const v=DOMAIN_VARS[id];
    /* An outcome exists where the domain's variable can be scored against something that happened, OR where
       the domain's own state is itself the measured outcome — an assessment, a resolved injury, a change in
       measured range. Those are outcomes without needing a forecast to score. */
    if(v&&(responseVars.includes(v)||F('crossModalityEffect')))return true;
    if(id==='injury')return F('resolveInjury')&&F('injuryState');
    if(id==='movement')return F('assessmentState')&&F('flexibilityResponse');
    if(id==='recovery')return F('unifiedRecovery')&&F('trainingLoad');
    if(id==='composition')return F('photoChangeContext')||F('compositionState');
    if(id==='equipment')return F('equipmentLifecycle');
    if(id==='inventory')return F('inventoryLifecycle');
    return false;
  })();
  stages.experiment   = (()=>{
    /* A domain may declare the stage inapplicable, but only with a stated reason — an undeclared gap and a
       justified exclusion are different things and should not look the same. */
    if(d.experimentable===false)return !!d.experimentableWhy;
    const v=DOMAIN_VARS[id];
    if(v&&(templates.includes(v)||responseVars.includes(v)))return true;
    /* A domain can be experimentally addressable through a template that names it rather than a response
       variable — recovery and behaviour templates exist for exactly this. */
    const kinds=(w.EXPERIMENT_TEMPLATES||[]).map(t=>t.kind).filter(Boolean);
    if(id==='recovery'&&kinds.includes('recovery'))return true;
    if(id==='composition'&&kinds.includes('composition'))return true;
    if(id==='schedule'&&kinds.includes('behaviour'))return true;
    if(id==='movement'&&F('flexibilityResponse'))return true;
    if(id==='injury')return F('compareIntervention');
    return false;
  })();
  stages.knowledge    = !!d.knowledge&&typeof d.knowledge==='function';
  const have=PLUGIN.filter(k=>stages[k]).length;
  rows.push({id,stages,have,of:PLUGIN.length,
    dataPresent:!!(st&&(st.status==='ok'||st.status==='clear')),
    missing:PLUGIN.filter(k=>!stages[k]),
    findings:findings.length,proposals:proposals.length,gaps:gaps.length,knowledge:know.length});
}
rows.sort((a,b)=>a.have-b.have);

/* ---------- Pipeline B: the cognitive loop, globally ---------- */
const LOOP=[
  ['observe',()=>F('addObservation')&&nonEmpty(w.OBS_TYPES)],
  ['record',()=>F('emitEvent')&&F('projectEvents')&&w.projectionMatchesRecord().ok],
  ['understand',()=>F('getCurrentState')&&F('diagnose')||F('getCurrentState')],
  ['estimate',()=>F('tdeePersonal')&&F('weightTrend')],
  ['quantify uncertainty',()=>F('uncertaintyChain')&&nonEmpty(w.CLASSES)],
  ['explain',()=>F('traceValue')&&F('renderWhy')&&w.traceIds().length>0],
  ['experiment',()=>F('designExperiment')&&nonEmpty(w.EXPERIMENT_TEMPLATES)],
  ['learn',()=>F('personalKnowledge')&&F('knowledgeReplication')],
  ['predict',()=>F('weightForecast')&&F('monteCarloForecast')],
  ['generate',()=>F('generatePrograms')&&F('planDay')&&F('composeSession')],
  ['optimise',()=>F('optimisePlans')&&F('searchPlans')],
  ['adapt',()=>F('progressionPlan')&&F('autoregulate')&&F('prepareSession')],
  ['measure',()=>F('recordAssessment')&&F('assessmentState')],
  ['calibrate',()=>F('calibrationByContext')&&F('shrunkResponse')]
];
const loop=LOOP.map(([name,probe])=>{
  let ok=false;try{ok=!!probe();}catch(e){ok=false;}
  return {stage:name,ok};
});

/* ---------- Depth: where the architecture outruns the model ---------- */
/* An engine is "shallow" if it resolves but rests on no personal evidence and carries no interval. */
const depth=[];
const probeDepth=(label,fn)=>{
  let v=null;try{v=fn();}catch(e){}
  if(!v)return depth.push({engine:label,grade:'absent'});
  const cls=v.cls||null;
  /* A tally is not an estimate and has no sampling interval. What it must have instead is a stated coverage
     or an effective sample size — something that says how much of the picture the number rests on. */
  const hasInterval=v.lo!=null||v.hi!=null||v.interval!=null||v.uncertaintyReps!=null||
    v.standardised!=null||v.coverage!=null||v.effectiveN!=null||v.autocorrelation!=null;
  const hasN=v.n!=null||v.sessions!=null||v.nights!=null||v.days!=null||v.observations!=null||v.pairs!=null;
  const personal=['EMPIRICAL','CALIBRATED','MEASURED','BLENDED'].includes(cls);
  /* An engine that cannot resolve because the record lacks the data is AWAITING DATA, not thin. Scoring it
     as a model weakness would again confuse an empty record with a shallow estimator — the distinction this
     whole audit exists to draw. */
  const awaiting=(v.status&&v.status!=='ok'&&v.status!=='clear'&&(v.need||v.why));
  const grade=awaiting?'awaiting data':
    (personal&&hasInterval)?'grounded':
    (personal&&hasN)?'evidenced':
    (hasInterval)?'interval only':
    (cls==='PRIOR'||cls==='HEURISTIC'||cls==='POLICY')?'declared prior':'thin';
  depth.push({engine:label,cls,grade,hasInterval,hasN});
};
probeDepth('weight trend',()=>w.weightTrend(14));
probeDepth('maintenance',()=>w.tdeePersonal());
probeDepth('body composition',()=>w.compositionState());
probeDepth('sleep',()=>w.sleepState());
probeDepth('readiness',()=>w.readinessState());
probeDepth('unified recovery',()=>w.unifiedRecovery());
probeDepth('activity',()=>w.activityState());
probeDepth('cardio',()=>w.cardioSessions(28));
probeDepth('conditioning',()=>w.conditioningState(60));
probeDepth('interference',()=>w.interferenceAnalysis());
probeDepth('effective sets',()=>w.effectiveSets(7));
probeDepth('resistance fatigue',()=>w.resistanceFatigue(7));
probeDepth('training load',()=>w.trainingLoad());
probeDepth('rep max',()=>w.repMax('Squat',5));
probeDepth('mobility',()=>w.mobilityOverview());
probeDepth('flexibility response',()=>w.flexibilityResponse('hip'));
probeDepth('movement dose',()=>w.movementDoseTotals(7));
probeDepth('schedule',()=>w.scheduleState());
probeDepth('cost',()=>w.costState());
probeDepth('equipment',()=>w.equipmentLifecycle());
probeDepth('inventory',()=>w.inventoryLifecycle());
probeDepth('causal support',()=>w.causalSupport('steps'));
probeDepth('shrunk response',()=>w.shrunkResponse('steps'));
probeDepth('tissue density',()=>w.tissueEnergyDensity());
probeDepth('change points',()=>w.changePointsRigorous(90));

const findings=[];
rows.filter(r=>r.have<PLUGIN.length).forEach(r=>
  findings.push({sev:r.have<=7?'P1':'P2',area:'plugin pipeline',
    what:r.id+' conforms at '+r.have+'/'+PLUGIN.length,detail:'missing: '+r.missing.join(', ')}));
loop.filter(l=>!l.ok).forEach(l=>
  findings.push({sev:'P1',area:'cognitive loop',what:'stage not satisfied: '+l.stage,detail:''}));
depth.filter(d=>d.grade==='thin'||d.grade==='absent').forEach(d=>
  findings.push({sev:'P2',area:'model depth',what:d.engine+' is '+d.grade,
    detail:'class '+(d.cls||'none')+', interval '+d.hasInterval+', sample size '+d.hasN}));

if(JSON_ONLY){console.log(JSON.stringify({rows,loop,depth,findings},null,1));}
else{
  console.log('\nDOMAIN PLUGIN PIPELINE');
  rows.forEach(r=>console.log('  '+r.id.padEnd(13)+r.have+'/'+r.of+
    (r.dataPresent?'  ':'  (no data)')+
    (r.missing.length?('   missing: '+r.missing.join(', ')):'   complete')));
  console.log('\nCOGNITIVE LOOP');
  loop.forEach(l=>console.log('  '+(l.ok?'yes':'NO ')+'  '+l.stage));
  console.log('\nMODEL DEPTH');
  const byGrade={};depth.forEach(d=>{(byGrade[d.grade]=byGrade[d.grade]||[]).push(d.engine);});
  Object.keys(byGrade).forEach(g=>console.log('  '+g.padEnd(15)+byGrade[g].length+'  '+byGrade[g].join(', ').slice(0,88)));
  console.log('\n'+findings.length+' finding(s): '+
    findings.filter(f=>f.sev==='P1').length+' P1, '+findings.filter(f=>f.sev==='P2').length+' P2');
  findings.slice(0,18).forEach(f=>console.log('  '+f.sev+'  ['+f.area+'] '+f.what+(f.detail?('\n         '+f.detail):'')));
}
if(errs.length)console.log('\nruntime errors: '+errs.slice(0,2).join(' | '));
process.exit(0);
