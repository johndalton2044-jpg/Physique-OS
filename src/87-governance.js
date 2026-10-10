/* ============================================================================
   REGION: MODEL GOVERNANCE AND ORCHESTRATION (Work.md)

   The remaining Work.md sections are not physiology. They are the machinery that keeps a growing collection
   of models honest with itself: which model is authoritative for a quantity, whether a challenger beats it,
   whether the models obey the invariants they implicitly claim, how fragile a conclusion is to its own
   assumptions, where a number came from, and whether an automated action can safely run twice.

   The through-line: a system with fifty models and no governance is not more intelligent than one with five.
   It is harder to tell when it is wrong.
   ============================================================================ */

/* ---------------- canonical data dictionary ----------------
   One place that says what each quantity IS, its units, and who owns it. Without it, "load" means kilograms
   in one module and pounds in another and nobody notices until the numbers are wrong. */
var DATA_DICTIONARY={
  weight:{unit:'lb (canonical)',owner:'currentWeight',meaning:'scale mass, as recorded',
    notes:'stored canonically in pounds; display converts'},
  calories:{unit:'kcal/day',owner:'food log',meaning:'energy INTAKE as logged',
    notes:'logged intake is not absorbed intake \u2014 see absorptionContext()'},
  tdee:{unit:'kcal/day',owner:'tdeePersonal',meaning:'maintenance energy, fitted from intake and weight change',
    notes:'an estimate with an interval, never a measurement'},
  e1rm:{unit:'lb',owner:'e1rmFrom',meaning:'estimated one-rep maximum from a submaximal set',
    notes:'Epley; degrades badly above about fifteen effective reps'},
  rir:{unit:'count',owner:'effortOf',meaning:'reps left in reserve at the end of a set',
    notes:'subjective; reliability falls as the number rises'},
  stimulus:{unit:'index',owner:'mechanicalDemand',meaning:'weighted exposure, comparable within a programme',
    notes:'not a physical quantity and not comparable between people'},
  fatigue:{unit:'index',owner:'fatigueCompartments',meaning:'accumulated exposure by compartment',
    notes:'an accounting scheme, not a measurement of fatigue'},
  kcalPerLb:{unit:'kcal/lb',owner:'tissueEnergyDensity',meaning:'energy behind a pound of scale weight',
    notes:'composition-dependent; 3500 is adipose tissue alone'},
  readiness:{unit:'z (own baseline)',owner:'readinessState',meaning:'today against your own middle per signal',
    notes:'relative to the person, meaningless as an absolute'},
  trainingLoad:{unit:'ratio',owner:'trainingLoad',meaning:'acute against own chronic average',
    notes:'descriptive; its predictive value for injury is contested'}
};
function dataDictionary(){
  var rows=Object.keys(DATA_DICTIONARY).map(function(k){
    return Object.assign({id:k},DATA_DICTIONARY[k]);});
  /* Anything the dictionary names must actually exist, or the dictionary is decoration. */
  var missing=rows.filter(function(r){
    var g=(typeof window!=='undefined')?window:{};
    return r.owner&&/^[a-zA-Z_$][\w$]*$/.test(r.owner)&&typeof g[r.owner]!=='function';
  }).map(function(r){return r.id+' \u2192 '+r.owner;});
  return {rows:rows,count:rows.length,unresolvedOwners:missing,
    cls:'POLICY',
    note:'What each quantity means, its units and which function owns it. A dictionary whose owners do not exist is documentation pretending to be governance, so the owners are checked.'};
}
/* ---------------- model registry: champion and challenger ----------------
   Two models can estimate the same quantity. Keeping both and scoring them against outcomes is how one
   earns the right to be authoritative \u2014 rather than whichever was written last. */
var MODEL_ROLES={};
function registerEstimator(quantity,id,fn,opts){
  opts=opts||{};
  MODEL_ROLES[quantity]=MODEL_ROLES[quantity]||{champion:null,challengers:[]};
  var rec={id:id,fn:fn,cls:opts.cls||'DERIVED',since:opts.since||todayISO(),note:opts.note||null};
  if(opts.champion||!MODEL_ROLES[quantity].champion)MODEL_ROLES[quantity].champion=rec;
  else MODEL_ROLES[quantity].challengers.push(rec);
  return rec;
}
function estimatorComparison(quantity){
  var r=MODEL_ROLES[quantity];
  if(!r||!r.champion)return {status:'none',quantity:quantity,
    note:'No estimator is registered for this quantity, so there is nothing to compare.'};
  if(!r.challengers.length)return {status:'uncontested',quantity:quantity,champion:r.champion.id,
    note:'One estimator, so it is authoritative by default rather than by merit. That is worth knowing: uncontested is not the same as validated.'};
  var rows=[r.champion].concat(r.challengers).map(function(m){
    var v=null;try{v=m.fn();}catch(e){}
    return {id:m.id,role:m===r.champion?'champion':'challenger',
      value:v&&v.value!=null?v.value:(typeof v==='number'?v:null),
      cls:m.cls,status:v&&v.status?v.status:'ok'};
  });
  var vals=rows.map(function(x){return x.value;}).filter(function(x){return x!=null;});
  var spread=vals.length>1?round(Math.max.apply(null,vals)-Math.min.apply(null,vals),2):null;
  return {status:'ok',quantity:quantity,rows:rows,spread:spread,
    agree:spread!=null&&Math.abs(spread)<=Math.abs(vals[0]||1)*0.1,
    cls:'DERIVED',
    note:'Champion and challengers side by side. Where they disagree materially, the disagreement is the finding \u2014 promoting one without scoring both against outcomes would be preference wearing the costume of evidence.'};
}
/* ---------------- monotonicity and domain invariants ----------------
   Properties the models implicitly claim. If eating less projects slower loss, something is wrong no matter
   how sophisticated the estimator is. This is the class of bug an external audit already found twice. */
var INVARIANTS=[
  {id:'deficit-direction',statement:'eating less never projects slower loss',
    test:function(){var a=counterfactual({calories:-300}),b=counterfactual({calories:300});
      if(a.status!=='ok'||b.status!=='ok')return null;return a.change<b.change;}},
  {id:'expenditure-direction',statement:'adding expenditure never projects slower loss',
    test:function(){var r=['steps','cardio','training'].map(function(v){
      var c=counterfactual((function(o){o[v]=v==='steps'?2000:1;return o;})({}));
      return c.status!=='ok'?null:c.change<=0;}).filter(function(x){return x!=null;});
      return r.length?r.every(Boolean):null;}},
  {id:'goal-direction',statement:'a goal below current weight is reached by ending at or under it',
    test:function(){var cur=currentWeight().value;if(cur==null)return null;
      var m=monteCarloForecast({goalWeight:Math.round(cur-30)});
      return m.status!=='ok'||m.goalDirection==='below your current weight';}},
  {id:'shrinkage-bound',statement:'no personal estimate is ever fully personal',
    test:function(){var m=shrunkResponseMatrix();
      return m.rows.every(function(r){return r.weight==null||r.weight<=0.95;});}},
  {id:'effort-uncertainty',statement:'uncertainty grows with reps in reserve',
    test:function(){return effortOf({rir:6}).uncertaintyReps>effortOf({rir:1}).uncertaintyReps;}},
  {id:'fatigue-decay',statement:'connective fatigue clears more slowly than local',
    test:function(){return FATIGUE_COMPARTMENTS.connective.halfLifeDays>FATIGUE_COMPARTMENTS.local.halfLifeDays;}},
  {id:'density-range',statement:'tissue energy density stays between lean and adipose',
    test:function(){var d=tissueEnergyDensity();
      return d.kcalPerLb>ENERGY_PER_LB.lean&&d.kcalPerLb<=ENERGY_PER_LB.fat;}},
  {id:'confidence-decay',statement:'a latent state loses confidence while nothing is observed',
    test:function(){
      var fresh=latentFrom([{date:addDays(todayISO(),-1),value:10}],{processVar:0.02,obsVar:1});
      var stale=latentFrom([{date:addDays(todayISO(),-90),value:10}],{processVar:0.02,obsVar:1});
      return stale.sd>fresh.sd;}},
  {id:'volume-excludes-warmup',statement:'a warm-up never counts toward working volume',
    test:function(){return SET_KINDS.warmup.volume===false&&SET_KINDS.working.volume===true;}},
  {id:'replay-monotone',statement:'a replay never shows more than the present',
    test:function(){var now=obsOf('weight').length;
      var then=withAsOf(addDays(todayISO(),-30),function(){return obsOf('weight').length;});
      return then<=now;}}
];
function checkInvariants(){
  var rows=INVARIANTS.map(function(inv){
    var r=null;try{r=inv.test();}catch(e){r=false;}
    return {id:inv.id,statement:inv.statement,
      result:r==null?'not applicable':(r?'holds':'VIOLATED')};
  });
  var broken=rows.filter(function(r){return r.result==='VIOLATED';});
  return {rows:rows,violations:broken,ok:broken.length===0,cls:'POLICY',
    note:'Properties the models implicitly claim, checked rather than assumed. Two of these encode defects an external audit found: a sign inversion that made adding cardio project weight gain, and a goal test that keyed off trend direction rather than the goal.',
    caveat:'An invariant holding does not make a model correct. It only rules out being wrong in the specific way the invariant names.'};
}
/* ---------------- robustness and fragility ----------------
   How much a conclusion depends on an assumption it cannot verify. A conclusion that flips when a plausible
   assumption moves slightly is worth knowing about. */
function fragilityOf(quantity){
  var probes={
    tdee:function(mult){
      var d=tissueEnergyDensity();
      var t=tdeePersonal();
      if(t.status!=='ok')return null;
      /* Re-derive with a different tissue density and see how far the answer moves. */
      var tr=weightTrend(14);
      if(tr.status!=='ok')return null;
      var eb=energyBalance();
      if(eb.status!=='ok')return null;
      return eb.intake-tr.slopePerWeek*d.kcalPerLb*mult/7;
    },
    rate:function(mult){
      var c=counterfactual({calories:-300});
      return c.status==='ok'?c.change*mult:null;
    }
  };
  var probe=probes[quantity];
  if(!probe)return {status:'unknown',note:'no fragility probe for that quantity'};
  var base=probe(1);
  if(base==null)return {status:'insufficient',need:['the underlying estimate to resolve']};
  var lo=probe(0.85),hi=probe(1.15);
  if(lo==null||hi==null)return {status:'insufficient'};
  var swing=Math.abs(hi-lo);
  var rel=Math.abs(base)>0?swing/Math.abs(base):null;
  return {status:'ok',cls:'DERIVED',quantity:quantity,
    base:round(base,1),lo:round(Math.min(lo,hi),1),hi:round(Math.max(lo,hi),1),
    swing:round(swing,1),relative:rel!=null?round(rel*100,0):null,
    fragile:rel!=null&&rel>0.2,
    verdict:rel==null?null:(rel>0.2?
      'moving the tissue-density assumption by 15% moves this by '+round(rel*100,0)+'%, so the conclusion rests on an assumption it cannot verify':
      'a 15% shift in the underlying assumption moves this by '+round(rel*100,0)+'%, which is within its own interval'),
    note:'How much this figure depends on an assumption nothing in the record can check. A conclusion that survives its assumptions moving is a stronger conclusion.'};
}
/* ---------------- computational lineage ----------------
   For any figure: what it was computed from, all the way down. The trace layer explains one number to a
   person; this is the machine-readable version, for checking that the graph has no cycles or orphans. */
function lineageOf(quantity,depth){
  depth=depth||0;
  var GRAPH={
    tdee:['calories','weight_trend','tissueEnergyDensity'],
    weight_trend:['weight','personalBaselines'],
    energy_balance:['calories','tdee'],
    tissueEnergyDensity:['bodyfat','weight_trend','adherence','sessions'],
    stimulus:['sessions','exercise_ontology','effort','rom','tempo'],
    fatigue:['stimulus','sessions','effort'],
    readiness:['fatigue_obs','soreness','stress','motivation','sleep','personalBaselines'],
    trainingLoad:['stimulus','movement','cardio'],
    unifiedRecovery:['readiness','trainingLoad','strength_trend','activity'],
    decision:['weight_trend','energy_balance','adherence','unifiedRecovery','domainProposals']
  };
  var kids=GRAPH[quantity]||[];
  if(depth>6)return {node:quantity,children:[],truncated:true};
  return {node:quantity,
    children:kids.map(function(k){return lineageOf(k,depth+1);}),
    leaf:!kids.length};
}
function lineageAudit(){
  var GRAPHKEYS=['tdee','energy_balance','readiness','unifiedRecovery','decision','fatigue','trainingLoad'];
  var issues=[];
  GRAPHKEYS.forEach(function(k){
    var seen={};
    (function walk(n,path){
      if(seen[n.node]&&path.indexOf(n.node)>=0){issues.push('cycle through '+n.node);return;}
      (n.children||[]).forEach(function(c){walk(c,path.concat([n.node]));});
    })(lineageOf(k),[]);
  });
  return {roots:GRAPHKEYS,issues:issues,ok:issues.length===0,cls:'DERIVED',
    note:'The dependency graph behind the headline figures, checked for cycles. A cycle would mean a number depending on itself, which produces a stable-looking answer that means nothing.'};
}
/* ---------------- decision arbitration ----------------
   Work.md: make decision arbitration real. When two sources want to lead, something has to decide, and the
   rule has to be stated rather than emergent. */
function arbitrateDecision(){
  var d=null;try{d=decide();}catch(e){}
  var di=null;try{di=domainDecisionInputs();}catch(e){}
  var rec=null;try{rec=unifiedRecovery();}catch(e){}
  var claims=[];
  if(d)claims.push({source:'rate',priority:40,verb:d.verb,confidence:d.confidence||'low',
    why:(d.why||[]).slice(0,2).map(function(x){return typeof x==='string'?x:(x.text||'');})});
  if(di&&di.status==='ok')di.inputs.forEach(function(i){
    claims.push({source:i.domainLabel,priority:i.priority,verb:i.verb,confidence:i.confidence,why:i.why.slice(0,2)});});
  if(rec&&rec.status==='ok'&&rec.score<=-1.2)
    claims.push({source:'recovery veto',priority:5,verb:'Hold',confidence:rec.confidence,
      why:['recovery is '+rec.band,'a change made now would be judged against a depressed baseline']});
  if(!claims.length)return {status:'none',note:'Nothing is claiming the decision.'};
  claims.sort(function(a,b){return a.priority-b.priority;});
  var winner=claims[0];
  var contested=claims.filter(function(c){return c.priority<=winner.priority+10&&c!==winner;});
  return {status:'ok',cls:'POLICY',claims:claims,winner:winner,contested:contested,
    rule:'Lowest priority number leads. Safety vetoes sit below 10, domain proposals between 10 and 80, rate optimisation at 40.',
    note:'Arbitration stated rather than emergent. Where two claims sit within ten of each other the decision is contested, and both are shown rather than one being silently dropped.',
    caveat:'Priority is a declared ordering, not a measured one. It encodes a judgement \u2014 that pain and recovery outrank rate \u2014 which is arguable and is therefore visible rather than buried.'};
}
/* ---- ARBITRATION (§33), extending arbitrateDecision in place: every claim scored on all seven dimensions ---- */
var CLAIM_GOAL={recovery:['recover','ease-recovery','favour-strength','protect-muscle'],rate:['lose-faster','keep-pace'],training:['keep-stimulus','keep-volume','favour-strength'],nutrition:['protect-muscle']};
(function(){var _base=arbitrateDecision;
  arbitrateDecision=function(){var a=_base();if(!a||a.status!=='ok')return a;var P=DB.settings.goalPriorities||{},chosen=Object.keys(P).map(function(k){return P[k];});
    var mins=null;try{var M=scheduleModel();mins=(M.minutes&&M.minutes.full)||null;}catch(e){}
    a.claims.forEach(function(c){var src=String(c.source).toLowerCase(),key=/recover/.test(src)?'recovery':(/rate/.test(src)?'rate':(/train|volume|strength/.test(src)?'training':(/nutri|food|protein/.test(src)?'nutrition':'other')));
      var verb=String(c.verb||'').toLowerCase();
      c.dimensions={priority:c.priority,confidence:c.confidence||'low',
        constraints:/add|more|increase/.test(verb)&&key==='training'&&mins!=null&&mins<45?'conflicts with the session length you set':'none',
        risk:c.priority<10?'acting against it risks injury or poor recovery':(/cut|reduce|lower/.test(verb)&&key==='rate'?'a faster loss risks lean mass':'low'),
        reversibility:/programme|program/.test(verb)?'slower to reverse':'easily reversed (a target)',
        expectedBenefit:(c.why||[])[0]||null,opportunityCost:/add|more/.test(verb)?'more time each week':'none',
        alignedWithYourChoice:(CLAIM_GOAL[key]||[]).some(function(x){return chosen.indexOf(x)>=0;})};});
    var safety=a.claims.filter(function(c){return c.priority<10;}),blocked=a.claims.filter(function(c){return c.priority>=10&&c.dimensions.constraints!=='none';}),
      open=a.claims.filter(function(c){return c.priority>=10&&c.dimensions.constraints==='none';});
    var conf={high:3,medium:2,low:1,insufficient:0};var score=function(c){return (c.dimensions.alignedWithYourChoice?10:0)+(conf[c.confidence]||1)-(c.dimensions.risk==='low'?0:1)-(/slower/.test(c.dimensions.reversibility)?1:0)-(c.dimensions.opportunityCost==='none'?0:0.5);};
    var winner=safety.length?safety.sort(function(x,y){return x.priority-y.priority;})[0]:null;
    if(!winner&&open.length){open.sort(function(x,y){return x.priority-y.priority;});var lead=open[0],tie=open.filter(function(c){return c.priority<=lead.priority+10;});
      winner=tie.sort(function(x,y){return score(y)-score(x)||x.priority-y.priority;})[0];}
    if(winner){a.winner=winner;a.contested=a.claims.filter(function(c){return c!==winner&&c.priority<=winner.priority+10;});}
    a.setAside=blocked.map(function(c){return {source:c.source,verb:c.verb,reason:c.dimensions.constraints};});
    a.rule='Safety vetoes (priority under 10) lead. A claim that breaks a constraint is set aside and shown. Among claims within ten of the lowest priority, the one aligned with the goal you chose leads, then confidence, risk, reversibility and time cost; all are shown.';
    a.dimensions=['priority','constraints','risk','confidence','reversibility','expected benefit','opportunity cost'];return a;};})();
/* ---------------- automation idempotency ----------------
   Work.md names it twice. A background job that runs twice must not produce two of anything. */
function idempotencyKey(job,date){return job+':'+(date||todayISO());}
function jobAlreadyRan(job,date){
  var log=(DB.settings.jobRuns||{});
  return !!log[idempotencyKey(job,date)];
}
function markJobRan(job,date,result){
  DB.settings.jobRuns=DB.settings.jobRuns||{};
  var k=idempotencyKey(job,date);
  if(DB.settings.jobRuns[k])return false;   // already recorded; do not double-count
  DB.settings.jobRuns[k]={at:nowISO(),result:result==null?null:result};
  /* Keep the log bounded: a key per job per day forever is a slow leak. */
  var keys=Object.keys(DB.settings.jobRuns).sort();
  while(keys.length>400){delete DB.settings.jobRuns[keys.shift()];}
  return true;
}
function runIdempotent(job,fn,date){
  if(jobAlreadyRan(job,date))return {ran:false,reason:'already ran for '+(date||todayISO()),
    note:'A job that ran today does not run again. Without this, a background wake-up and an app open on the same day would both fire it.'};
  var out=null;try{out=fn();}catch(e){_q(e,'P2');return {ran:false,error:String(e&&e.message||e)};}
  markJobRan(job,date,typeof out==='number'?out:null);
  return {ran:true,result:out};
}
/* ---------------- referential repair ----------------
   Records that point at things which no longer exist. Reported, never silently deleted. */
function referentialCheck(){
  var issues=[];
  var sessionIds={};(DB.sessions||[]).forEach(function(s){sessionIds[s.id]=1;});
  var obsIds={};(DB.observations||[]).forEach(function(o){obsIds[o.id]=1;});
  var foodIds={};(DB.foodLogs||[]).forEach(function(l){foodIds[l.id]=1;});
  var phaseIds={};(DB.phases||[]).forEach(function(p){phaseIds[p.id]=1;});
  (DB.observations||[]).forEach(function(o){
    if(o.supersedes&&!obsIds[o.supersedes])issues.push({kind:'observation',id:o.id,points:'supersedes '+o.supersedes});
    if(o.correctedBy&&!obsIds[o.correctedBy])issues.push({kind:'observation',id:o.id,points:'correctedBy '+o.correctedBy});
  });
  (DB.foodLogs||[]).forEach(function(l){
    if(l.supersedes&&!foodIds[l.supersedes])issues.push({kind:'foodLog',id:l.id,points:'supersedes '+l.supersedes});});
  (DB.experiments||[]).forEach(function(e){
    if(e.phaseId&&!phaseIds[e.phaseId])issues.push({kind:'experiment',id:e.id,points:'phase '+e.phaseId});});
  (DB.predictions||[]).forEach(function(p){
    if(p.decisionId&&!(DB.decisions||[]).some(function(d){return d.id===p.decisionId;}))
      issues.push({kind:'prediction',id:p.id,points:'decision '+p.decisionId});});
  return {issues:issues,ok:issues.length===0,cls:'MEASURED',
    note:issues.length?'Records pointing at things that are not in the record. These are reported rather than repaired: deleting a dangling reference destroys the evidence that something went missing.':
      'Every reference resolves.',
    repair:issues.length?'Repair is a user decision. The safe action is almost always to leave it and investigate, not to tidy it away.':null};
}
/* ---------------- sensor fusion ----------------
   Work.md: no full sensor-fusion model. Where two sources measure the same thing, combine them by their
   reliability rather than preferring whichever arrived last. */
var SOURCE_RELIABILITY={
  manual:{weight:1,note:'entered by you'},
  scale:{weight:1,note:'a dedicated scale'},
  appleHealth:{weight:0.9,note:'aggregated by the platform, sometimes from several devices'},
  fitbit:{weight:0.8},withings:{weight:0.95},oura:{weight:0.85},
  estimate:{weight:0.4,note:'derived rather than measured'},
  unspecified:{weight:0.6}
};
function fuseObservations(type,date,opts){opts=opts||{};
  var day=opts.obs||(obsOf(type,{asOf:opts.asOf})||[]).filter(function(o){return o.date===date;});
  if(!day.length)return {status:'none',type:type,date:date};
  /* Stage G: the shared per-source parameters (_sourceParams), as of the date asked about; a reading from a source with a
     measured bias is put on the reference scale even when it is the day's only one, so the series does not jump on the
     days one source is missing */
  var SP=_sourceParams(type,opts.asOf||asOf()),P=SP.params;
  if(day.length===1){var p1=P[sourceKeyOf(day[0])],b1=p1&&p1.bias||0;return {status:'single',type:type,date:date,value:round(day[0].value-b1,3),exact:day[0].value-b1,raw:day[0].value,
    source:sourceKeyOf(day[0]),correction:b1,reference:SP.ref,
    note:'One reading, so there is nothing to fuse'+(b1?'; it is put on the reference scale':'')+'.'};}
  /* Two fusion paths had survived side by side: this one weighted sources by a FIXED reliability table, and
     measurementModel() estimates each source's bias and noise from the data. The same day could be fused
     two different ways. This now uses the measurement model — bias-corrected, weighted by measured noise —
     and falls back to the declared table only for a source whose noise could not be measured, saying so. */
  /* each reading: bias-corrected to the reference, weighted by its quality (measurementQuality) over its source's measured
     noise squared; a source whose noise cannot be measured falls back to the declared table, and says so */
  var rows=day.map(function(o){
    var src=sourceKeyOf(o),p=P[src],q=Math.max(0.01,measurementQuality(o).score);
    if(p&&p.noise){
      return {value:round(o.value-(p.bias||0),3),exact:o.value-(p.bias||0),raw:o.value,source:src,quality:q,noise:p.noise,weight:q/(p.noise*p.noise),weightFrom:'quality over measured noise squared'};
    }
    var r=SOURCE_RELIABILITY[o.source]||SOURCE_RELIABILITY[src.split(':').slice(-1)[0]]||SOURCE_RELIABILITY.unspecified;
    return {value:o.value,exact:o.value,raw:o.value,source:src,quality:q,noise:null,weight:q*r.weight,weightFrom:'declared reliability (noise not measurable)'};});
  /* with three or more sources, a reading more than four combined standard deviations from the others' fused value is
     set aside as contradicted (only between readings whose noise is measured) */
  var fz=function(R){var W=0,S=0;R.forEach(function(r){W+=r.weight;S+=r.weight*r.exact;});return {v:S/W,se:Math.sqrt(1/W)};},nsrc={};rows.forEach(function(r){nsrc[r.source]=1;});
  if(Object.keys(nsrc).length>=3)rows.forEach(function(r){if(!r.noise)return;var o=rows.filter(function(x){return x!==r&&x.source!==r.source&&x.noise;});if(o.length<2)return;var f=fz(o);r.contradicted=Math.abs(r.exact-f.v)>4*Math.sqrt(r.noise*r.noise+f.se*f.se);});
  var kept=rows.filter(function(r){return !r.contradicted;});if(!kept.length)kept=rows;
  var wsum=kept.reduce(function(a,r){return a+r.weight;},0);
  var fused=kept.reduce(function(a,r){return a+r.exact*r.weight;},0)/wsum;
  rows.forEach(function(r){r.share=r.contradicted?0:round(r.weight/wsum,3);});
  var spread=Math.max.apply(null,rows.map(function(r){return r.value;}))-
             Math.min.apply(null,rows.map(function(r){return r.value;}));
  return {status:'ok',cls:'DERIVED',type:type,date:date,reference:SP.ref,
    value:round(fused,2),exact:fused,sources:rows,spread:round(spread,2),contradicted:rows.filter(function(r){return r.contradicted;}).map(function(r){return r.source;}),
    disagreement:spread>Math.abs(fused)*0.02,
    note:'Multiple readings for one day, combined by how much each source is trusted rather than by which arrived last.',
    caveat:spread>Math.abs(fused)*0.02?
      'The sources disagree by more than 2%, which usually means they are measuring under different conditions rather than that one is wrong.':null};
}

/* ============================================================================
   STEP 9: CAPABILITY REGISTRY, GENERATED FROM CODE
   The direction: "Governance reads the same registries used by runtime. Do not maintain manually duplicated
   capability inventories." And: "Do not mark a capability production-ready merely because its function
   exists." So nothing here is hand-assigned. Each status is DERIVED from evidence the build can check.
   ============================================================================ */
var CAPABILITY_STATUSES=['specified','implemented','integrated','surfaced','validated','production-ready'];
var CAPABILITIES={
  /* The four domains 89-remaining.js wrongly called absent (H0). They return structured results — an ordering, flags,
     a list — for which a registered quantity would be invented, so each declares a RESULT CONTRACT instead: the fields
     a live call must carry. Integration is checked against an actual call, not asserted. */
  recoveryAllocation:{fn:'recoveryAllocation',domain:'recovery',action:'nav.recoveryAllocation',resultContract:['status','cls','draws']},
  motorLearning:{fn:'motorLearning',domain:'training',action:'nav.motorLearning',resultContract:['status','rows']},
  hydrationContext:{fn:'hydrationContext',domain:'body',action:'nav.hydration',resultContract:['status','cls','likelyDistorted','caveat']},
  supplementReview:{fn:'supplementReview',domain:'nutrition',action:'nav.supplements',resultContract:['status','rows','caveat']},
  weightTrend:{fn:'weightTrend',domain:'body',action:'nav.weightTrend',quantity:'weightTrend'},
  maintenance:{fn:'tdeeBayes',domain:'energy',action:'nav.maintenance',quantity:'posteriorMaintenance'},
  readiness:{fn:'readinessState',domain:'recovery',action:'nav.recoveryState',quantity:'readiness'},
  unifiedRecovery:{fn:'unifiedRecovery',domain:'recovery',action:'nav.recovery2',quantity:'unifiedRecovery'},
  resistance:{fn:'effectiveSets',domain:'training',action:'nav.resistance',quantity:'effectiveSets'},
  fatigue:{fn:'fatigueCompartments',domain:'training',action:'nav.propagation',quantity:'localFatigue'},
  causalIdentification:{fn:'identificationStrategy',domain:'inference',action:'nav.inference',quantity:null},
  propensity:{fn:'propensityScoreModel',domain:'inference',action:'nav.inference',quantity:'propensityScore'},
  missingData:{fn:'multipleImputation',domain:'inference',action:'nav.inference',quantity:null},
  measurementModel:{fn:'measurementModel',domain:'measurement',action:'nav.measurement',quantity:null},
  forecast:{fn:'forecastFamily',domain:'forecast',action:'nav.forecast',quantity:'weightTrend'},
  appearance:{fn:'applyAppearanceProfile',domain:'presentation',action:'settings.profile',quantity:null},
  materialization:{fn:'materializeAll',domain:'runtime',action:'nav.internals',quantity:null},
  inferenceGateway:{fn:'infer',domain:'runtime',action:'nav.internals',quantity:null},
  provenance:{fn:'buildProvenance',domain:'runtime',action:'nav.internals',quantity:null},
  runIdentity:{fn:'runIdentity',domain:'runtime',action:'nav.internals',quantity:null},
  quantityRegistry:{fn:'resolveQuantity',domain:'semantic',action:'nav.internals',quantity:null},
  browserGate:{fn:null,domain:'testing',action:null,quantity:null,external:'tests/browser.mjs'}
};
function _resultContractHolds(c){
  var g=(typeof window!=='undefined')?window:{};var fn=g[c.fn];if(typeof fn!=='function')return false;
  var r;try{r=fn();}catch(e){return false;}
  if(!r||!r.status)return false;
  if(r.status!=='ok')return true;          /* declining with a reason is within contract */
  return c.resultContract.every(function(k){return k in r;});
}
function capabilityStatus(id){
  var c=CAPABILITIES[id];
  if(!c)return null;
  var g=(typeof window!=='undefined')?window:{};
  var evidence={};
  /* implemented: the function exists and runs without throwing. */
  evidence.implemented=!c.fn||typeof g[c.fn]==='function';
  /* integrated: its output type is in the canonical quantity registry, or it is runtime infrastructure. */
  evidence.integrated=evidence.implemented&&
    (c.quantity?!!resolveQuantity(c.quantity):c.resultContract?_verifiedPass(id,'result contract',evidence):(c.domain==='runtime'||c.domain==='semantic'||c.domain==='testing'||c.domain==='inference'||c.domain==='measurement'||c.domain==='presentation'||c.domain==='forecast'));
  /* surfaced: a registered action exposes it to the person. */
  evidence.surfaced=evidence.integrated&&!!(c.action&&typeof ACTIONS!=='undefined'&&ACTIONS[c.action]);
  /* validated. The first version read ENGINE_MATURITY — a hand-assigned table — and counted any grade above
     infrastructure, so two capabilities were reported as validated on an operational grade that someone had typed
     in, while the release documents said every status was derived from evidence. Now:
       infrastructure — validated only if a live check of its behaviour passes when this is computed;
       analytical     — validated only if its DERIVED grade is statistically validated or better. */
  var grade=capabilityDerivedGrade(id,c);
  var verify=CAPABILITY_VERIFY[id];
  evidence.gradeSource=verify?'live verification':(grade?'derived from evidence':'no derived grade');
  /* read from the latest verification run for this build, never by running the check here */
  if(verify){var ve=verificationEvidence(id,'live verification');
    evidence.verification=ve?(ve.passed?'passes':'fails'):'not run';evidence.verificationRun=ve?ve.id:null;evidence.verifiedAt=ve?ve.generatedAt:null;
    evidence.validated=evidence.surfaced&&!!(ve&&ve.passed);}
  else evidence.validated=evidence.surfaced&&VALIDATED_GRADES.indexOf(grade)>=0;
  /* production-ready: validated AND experimentally or prospectively validated. Nothing here reaches it,
     and deriving that from evidence rather than assigning it is the point. */
  evidence.productionReady=evidence.validated&&
    (grade==='EXPERIMENTALLY_VALIDATED'||grade==='PRODUCTION_PREDICTIVE');
  var status='specified';
  if(evidence.implemented)status='implemented';
  if(evidence.integrated)status='integrated';
  if(evidence.surfaced)status='surfaced';
  if(evidence.validated)status='validated';
  if(evidence.productionReady)status='production-ready';
  return {id:id,domain:c.domain,status:status,rank:CAPABILITY_STATUSES.indexOf(status),
    evidence:evidence,maturity:grade||null,
    sourceFunction:c.fn,surface:c.action,quantity:c.quantity};
}
/* UNIQUE REGISTRY IDS (catalogue W-008). An array registry with two entries of one id serves whichever a lookup finds
   first; a keyed entry that names a different id than its key is read under two names. Each issue names the registry,
   the id, where each entry sits and whether the definitions conflict. Duplicate keys in a keyed registry's source never
   reach run time (the later replaces the earlier), so the governance gate checks those in the source. */
var REGISTRY_ID_SOURCES={arrays:['MODELS','COMMANDS','NAV_COMMANDS','JOBS','MOVEMENT_LIBRARY','MOBILITY_LIBRARY','EXERCISES'],
  keyed:['ENTITY_CONTRACTS','EVENT_TYPES','VIEW_REGISTRY','WIDGET_REGISTRY','VISUALIZATION_REGISTRY','QUANTITY_REGISTRY','IMPORT_SOURCES','EXTERNAL_SOURCES','PROGRESSIONS','ACTIONS','OBS_TYPES','CAPABILITIES','DOMAINS','SUPPLEMENT_CATALOGUE']};
function _registryDefinition(e){try{return JSON.stringify(e,function(k,v){return typeof v==='function'?String(v):v;});}catch(x){return String(e);}}
function assertUniqueRegistryIds(registry,name){
  var issues=[];
  if(Array.isArray(registry)){var at={};
    registry.forEach(function(e,i){var id=e&&e.id;if(id==null){issues.push({registry:name,id:null,locations:[i],conflict:false,why:'an entry without an id'});return;}(at[id]=at[id]||[]).push(i);});
    Object.keys(at).forEach(function(id){var ix=at[id];if(ix.length<2)return;var defs=ix.map(function(i){return _registryDefinition(registry[i]);});
      issues.push({registry:name,id:id,locations:ix,conflict:defs.some(function(d){return d!==defs[0];}),why:'the same id '+ix.length+' times'});});}
  else if(registry&&typeof registry==='object')Object.keys(registry).forEach(function(k){var e=registry[k];
    if(e&&typeof e==='object'&&e.id!=null&&String(e.id)!==k)issues.push({registry:name,id:k,locations:[k,String(e.id)],conflict:true,why:'the entry under '+k+' says its id is '+e.id});});
  else issues.push({registry:name,id:null,locations:[],conflict:false,why:'not a registry in this build'});
  return issues;}
function registryIdAudit(){
  var g=(typeof window!=='undefined')?window:{};
  var issues=[];REGISTRY_ID_SOURCES.arrays.concat(REGISTRY_ID_SOURCES.keyed).forEach(function(n){issues=issues.concat(assertUniqueRegistryIds(g[n],n));});
  _REGISTRY_CONFLICTS.forEach(function(c){issues.push({registry:c.registry,id:c.id,locations:[],conflict:true,why:c.why});});
  return {ok:!issues.length,checked:REGISTRY_ID_SOURCES.arrays.length+REGISTRY_ID_SOURCES.keyed.length,issues:issues};}
/* ---------------- VERIFICATION EVIDENCE (catalogue doc 2, P0.1 and P0.2) ----------------
   Reading the capability matrix ran the live checks: infer() over every model, twice, and each capability's own function,
   about five seconds on the demo record every time anything asked for a status, so asking about the system changed what
   the system was doing. A status now traces to a verification run. runVerification() runs the checks once and records
   one immutable entry per capability and suite: the build, schema, model versions, reference data and record revision it
   ran against, whether it passed, what failed, how long it took, and when it expires. capabilityStatus() and
   capabilityMatrix() only read the entries and never execute a model. An entry from another build, or past its expiry,
   is ignored, and the status then says the check was not run. Kept in memory (it describes this running build), and
   rebuilt by any reader that needs verified statuses: the internals sheet, the governance gate, the release check. */
var VERIFICATION_EXPIRY_DAYS=7;
var _VERIFICATION_EVIDENCE=[];
function _verificationContext(){
  return {buildId:BUILD_ID,schemaVersion:SCHEMA_VERSION,
    modelVersions:_hash(MODELS.map(function(m){return m.id+'@'+(m.version||'?');}).sort().join(',')),
    referenceVersions:{food:(DB&&DB.settings&&DB.settings.foodDatabaseVersion)||null},
    dataRegime:'record revision '+((DB&&DB.revision)||0)};}
function _verificationSuites(id){var c=CAPABILITIES[id],out=[];
  if(CAPABILITY_VERIFY[id])out.push({suite:'live verification',run:function(){return {passed:!!CAPABILITY_VERIFY[id]()};}});
  if(c&&c.resultContract&&!c.quantity)out.push({suite:'result contract',run:function(){return {passed:_resultContractHolds(c)};}});
  if(id==='forecast'&&typeof forecastHoldoutValidation==='function')out.push({suite:'hold-out grade',run:function(){var h=forecastHoldoutValidation();
    return {passed:h.status==='ok',grade:h.status==='ok'?h.grade:null,why:h.status==='ok'?null:'hold-out validation '+h.status};}});
  return out;}
function runVerification(opts){
  opts=opts||{};var ctx=_verificationContext(),at=nowISO(),made=[],t00=Date.now();
  Object.keys(CAPABILITIES).forEach(function(id){if(opts.only&&opts.only.indexOf(id)<0)return;
    _verificationSuites(id).forEach(function(S){var t0=Date.now(),r={passed:false},failures=[];
      try{r=S.run()||{passed:false};}catch(e){failures.push(String(e&&e.message||e).slice(0,160));}
      if(!r.passed&&!failures.length)failures.push(r.why||'the check did not hold');
      var e={id:'ver-'+_hash(id+'|'+S.suite+'|'+ctx.buildId+'|'+ctx.dataRegime+'|'+at),capabilityId:id,suiteId:S.suite,buildId:ctx.buildId,
        schemaVersion:ctx.schemaVersion,modelVersions:ctx.modelVersions,referenceVersions:Object.freeze(Object.assign({},ctx.referenceVersions)),
        dataRegime:ctx.dataRegime,passed:!!r.passed,grade:r.grade||null,durationMs:Date.now()-t0,checks:Object.freeze([S.suite]),
        failures:Object.freeze(failures),generatedAt:at,expiresAt:addDays(at.slice(0,10),VERIFICATION_EXPIRY_DAYS)};
      made.push(Object.freeze(e));});});
  _VERIFICATION_EVIDENCE=_VERIFICATION_EVIDENCE.concat(made).slice(-500);
  return {status:'ok',generatedAt:at,buildId:ctx.buildId,entries:made.length,passed:made.filter(function(e){return e.passed;}).length,
    failed:made.filter(function(e){return !e.passed;}).map(function(e){return e.capabilityId+' ('+e.suiteId+')';}),durationMs:Date.now()-t00};}
/* the latest entry for one capability and suite that still applies: this build, not expired */
function verificationEvidence(id,suite){var today=todayISO();
  for(var i=_VERIFICATION_EVIDENCE.length-1;i>=0;i--){var e=_VERIFICATION_EVIDENCE[i];
    if(e.capabilityId===id&&e.suiteId===suite&&e.buildId===BUILD_ID&&e.expiresAt>=today)return e;}
  return null;}
function _verifiedPass(id,suite,evidence){var e=verificationEvidence(id,suite);
  if(evidence){evidence.contract=e?(e.passed?'holds':'fails'):'not run';evidence.contractRun=e?e.id:null;}
  return !!(e&&e.passed);}
function capabilityMatrix(){
  var rows=Object.keys(CAPABILITIES).map(capabilityStatus);
  var byStatus={};
  rows.forEach(function(r){(byStatus[r.status]=byStatus[r.status]||[]).push(r.id);});
  /* The governance detections the direction lists, read from the same registries. */
  var detections={
    implementedButUnsurfaced:rows.filter(function(r){return r.evidence.integrated&&!r.evidence.surfaced&&r.domain!=='runtime'&&r.domain!=='semantic'&&r.domain!=='testing';}).map(function(r){return r.id;}),
    registeredButUnimplemented:rows.filter(function(r){return !r.evidence.implemented;}).map(function(r){return r.id;}),
    productionReady:rows.filter(function(r){return r.status==='production-ready';}).map(function(r){return r.id;})
  };
  var last=_VERIFICATION_EVIDENCE.length?_VERIFICATION_EVIDENCE[_VERIFICATION_EVIDENCE.length-1]:null;
  return {capabilities:rows.length,rows:rows,byStatus:byStatus,detections:detections,cls:'POLICY',
    verification:{lastRun:last?last.generatedAt:null,buildId:BUILD_ID,current:!!(last&&last.buildId===BUILD_ID&&last.expiresAt>=todayISO()),
      note:'statuses that need a check are read from the latest verification run (runVerification) for this build; none is computed while the matrix is read'},
    note:'Every status is derived from evidence the build can check \u2014 existence, registry membership, a surfacing action, a maturity grade \u2014 and none is assigned by hand. Nothing is production-ready, because nothing has been experimentally or prospectively validated.'};
}

var VALIDATED_GRADES=['STATISTICALLY_VALIDATED','EXPERIMENTALLY_VALIDATED','PRODUCTION_PREDICTIVE'];
function capabilityDerivedGrade(id,c){
  /* the forecast's grade comes from its hold-out validation, which runs backtests: so it is taken from the verification
     run's record of that validation, not computed while a status is read */
  if(id==='forecast'){var hv=verificationEvidence(id,'hold-out grade');return hv&&hv.passed?hv.grade:null;}
  /* A capability backed by a registered model takes that model's derived maturity. Nothing else earns a grade. */
  var mid=Object.keys(MODEL_BINDINGS).filter(function(k){return MODEL_BINDINGS[k]===c.fn;})[0];
  if(mid){var m=MODELS.filter(function(x){return x.id===mid;})[0];return m?modelMaturity(m):null;}
  return null;
}
/* Live checks of the infrastructure's behaviour \u2014 the same properties the release gate verifies. */
var CAPABILITY_VERIFY={
  provenance:function(){return provenanceAudit().ok&&MODELS.every(function(m){var r=infer({modelId:m.id});
    return r.status!=='ok'||(r.provenance&&r.provenance.nodes.some(function(n){return n.type==='model-run';}));});},
  runIdentity:function(){var a=infer({modelId:'weight_trend'}).runId,b=infer({modelId:'weight_trend'}).runId;
    var x=runIdentity({model:'probe',inputs:{v:1}}).runId,y=runIdentity({model:'probe',inputs:{v:2}}).runId;return !!a&&a===b&&x!==y;},
  /* modelVersion and MODELS.length: the first version read r.version and ra.checked, neither of which exists, and
     reported a working gateway as failing. */
  inferenceGateway:function(){var ra=modelRegistryAudit();return ra.ok&&ra.executable===MODELS.length&&MODELS.every(function(m){var r=infer({modelId:m.id});
    return r.status!=='ok'||(r.uncertainty&&r.modelVersion&&r.provenance);});},
  materialization:function(){var o=(DB.observations||[]).filter(function(x){return x.type==='weight';}).slice(-1)[0];if(!o)return true;
    var a=_viewIdentity('weightTrend'),k=o.value;o.value=k+0.123;var b=_viewIdentity('weightTrend');o.value=k;return a!==b;},
  quantityRegistry:function(){var r=registryDrift();return r&&(r.ok||(r.issues||[]).length===0);}
};