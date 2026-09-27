/* ============================================================================
   REGION: CAUSAL UNIVERSE, MODEL COMPETITION AND INVALIDATION (ConBWork.md)

   Three items, and one of them changes what the app is allowed to claim.

   THE CAUSAL UNIVERSE was sixteen nodes against an application that reasons about forty-odd variables.
   A graph missing a variable does not merely omit it — it silently asserts that variable confounds nothing,
   which is a strong claim made by accident. Expanded to cover what the app actually models, with the same
   discipline: acyclic, feedback held as lagged edges, and declared as a claim rather than derived.

   CHAMPION/CHALLENGER was registration. Two estimators sat side by side and the first one registered won by
   arriving first. Competition means replaying both against history and scoring them on what actually
   happened — error, calibration, bias, coverage — and promotion is a consequence of that, not a decision
   someone makes.

   DEPENDENCY INVALIDATION did not exist. A food database correction should ripple to recipes, intake, energy
   balance, maintenance, forecasts and decisions, and say exactly what changed. Without it, corrections
   silently leave stale conclusions standing.
   ============================================================================ */

/* ---------------- the expanded causal universe ---------------- */
var CAUSAL_EXTENSIONS={
  nodes:['protein','carbs','fat','fiber','mealTiming','caffeine','hydration','sodium',
         'resistanceVolume','exerciseSelection','rom','effort','sleepTiming','environment',
         'temperature','phase','goal','equipment','scheduleConstraint','deficitSize',
         'leanMass','waterBalance','glycogen','neat','age','sex'],
  edges:[
    /* structural: things that do not change, or change slowly, and cause much else */
    ['age','leanMass'],['sex','leanMass'],['age','readiness'],
    ['phase','deficitSize'],['goal','phase'],['phase','calories'],['phase','training'],
    ['scheduleConstraint','training'],['scheduleConstraint','sleepTiming'],
    ['equipment','exerciseSelection'],['exerciseSelection','resistanceVolume'],
    /* nutrition composition */
    ['calories','protein'],['calories','carbs'],['calories','fat'],
    ['protein','leanMass'],['protein','hunger'],['fiber','hunger'],
    ['carbs','glycogen'],['glycogen','waterBalance'],['sodium','waterBalance'],
    ['hydration','waterBalance'],['waterBalance','weight'],
    ['mealTiming','hunger'],['mealTiming','sleep'],
    /* training composition */
    ['resistanceVolume','fatigue'],['resistanceVolume','soreness'],['resistanceVolume','leanMass'],
    ['rom','stimulusQuality'],['effort','fatigue'],['effort','stimulusQuality'],
    ['stimulusQuality','leanMass'],['training','resistanceVolume'],
    /* environment and stimulants */
    ['temperature','neat'],['environment','neat'],['season','temperature'],
    ['caffeine','sleep'],['caffeine','readiness'],['caffeine','neat'],
    ['sleepTiming','sleep'],
    /* energetics */
    ['neat','weight'],['steps','neat'],['deficitSize','weight'],['deficitSize','readiness'],
    ['deficitSize','hunger'],['deficitSize','leanMass'],
    ['leanMass','bodyfat']
  ],
  laggedEdges:[
    {from:'deficitSize',to:'neat',lagDays:14,
     why:'metabolic and behavioural compensation takes weeks, not days'},
    {from:'glycogen',to:'weight',lagDays:2,
     why:'glycogen and its water move over a couple of days, which is why a carbohydrate change shows on the scale before anything real has happened'},
    {from:'leanMass',to:'tdee',lagDays:30,
     why:'a change in lean mass changes maintenance slowly, well after the mass itself moved'}
  ]
};
function expandCausalGraph(){
  /* Merged once at load, so every consumer of the graph sees the same universe. */
  CAUSAL_EXTENSIONS.nodes.forEach(function(n){
    if(CAUSAL_DAG.nodes.indexOf(n)<0)CAUSAL_DAG.nodes.push(n);});
  if(CAUSAL_DAG.nodes.indexOf('stimulusQuality')<0)CAUSAL_DAG.nodes.push('stimulusQuality');
  if(CAUSAL_DAG.nodes.indexOf('tdee')<0)CAUSAL_DAG.nodes.push('tdee');
  CAUSAL_EXTENSIONS.edges.forEach(function(e){
    if(!CAUSAL_DAG.edges.some(function(x){return x[0]===e[0]&&x[1]===e[1];}))
      CAUSAL_DAG.edges.push(e);});
  CAUSAL_DAG.laggedEdges=(CAUSAL_DAG.laggedEdges||[]).concat(CAUSAL_EXTENSIONS.laggedEdges);
  return dagValidate();
}
/* Which graph variables the record can actually supply, which decides what is estimable at all. */
function causalCoverage(){
  var tracked=[],untracked=[];
  CAUSAL_DAG.nodes.forEach(function(n){
    var has=!!OBS_TYPES[n];
    if(!has){
      /* Some nodes are derived rather than observed, and that counts as available. */
      var g=(typeof window!=='undefined')?window:{};
      has=['tdee','leanMass','neat','deficitSize','glycogen','waterBalance','resistanceVolume',
           'stimulusQuality','phase','goal','equipment','age','sex','season','temperature',
           'environment','scheduleConstraint','mealTiming','sleepTiming','exerciseSelection',
           'rom','effort','illness','motivation'].indexOf(n)>=0;
      /* Derived-but-available and named-but-unrecorded are different. Training volume comes from the
         session log and readiness is computed; motivation and caffeine are named by the graph and nothing
         records them. Only the second kind blocks an estimate. */
      if(['training','readiness','resistanceVolume','stimulusQuality','fatigue'].indexOf(n)>=0)has=true;
      if(['motivation','illness','mealTiming','sleepTiming','environment','temperature',
          'caffeine','hydration','sodium','rom','effort','exerciseSelection'].indexOf(n)>=0)has=false;
    }
    (has?tracked:untracked).push(n);
  });
  return {nodes:CAUSAL_DAG.nodes.length,tracked:tracked.length,untracked:untracked,
    coverage:round(100*tracked.length/CAUSAL_DAG.nodes.length,0),cls:'MEASURED',
    note:'Which variables in the causal graph the record can actually supply. An effect whose adjustment set includes an untracked variable is not estimable, however much data accumulates.',
    caveat:'A graph node that nothing records is not a defect in the graph. Leaving it out would be worse \u2014 omitting a variable silently asserts that it confounds nothing.'};
}
/* ---------------- model lifecycle ---------------- */
var LIFECYCLE=['proposed','experimental','candidate','validated','champion','superseded','deprecated','retired'];
function modelLifecycle(){
  DB.settings.modelLifecycle=DB.settings.modelLifecycle||{};
  return DB.settings.modelLifecycle;
}
function setModelStage(id,stage,why){
  if(LIFECYCLE.indexOf(stage)<0)return null;
  var lc=modelLifecycle();
  var prev=lc[id]?lc[id].stage:null;
  /* Attribution is the point: a promotion with no reason recorded is indistinguishable from a preference. */
  lc[id]={stage:stage,since:nowISO(),previous:prev,
    why:String(why||'').slice(0,200),
    history:((lc[id]&&lc[id].history)||[]).concat([{stage:prev,until:nowISO()}]).slice(-10)};
  emitEvent('model.stage',{id:id,stage:stage,from:prev,why:lc[id].why});
  _memoInvalidate();save('model:stage');
  return lc[id];
}
/* ---------------- champion vs challenger, by replay ----------------
   Both estimators are run AS OF each historical date, and scored against what actually happened next.
   Running them on today's data and comparing outputs would tell you nothing about which predicts better. */
function backtestEstimators(quantity,opts){
  opts=opts||{};
  var r=MODEL_ROLES[quantity];
  if(!r||!r.champion)return {status:'none',quantity:quantity,
    note:'No estimator registered for this quantity.'};
  var horizon=opts.horizonDays||14;
  var points=opts.points||6;
  var spacing=opts.spacingDays||14;
  var models=[r.champion].concat(r.challengers||[]);
  if(models.length<2)return {status:'uncontested',quantity:quantity,champion:r.champion.id,
    note:'One estimator, so there is nothing to compete. Uncontested is not the same as validated \u2014 it has simply never been challenged.'};
  var scores={};
  models.forEach(function(m){scores[m.id]={errors:[],covered:0,n:0,signed:[]};});
  for(var k=points;k>=1;k--){
    var asOfDate=addDays(todayISO(),-(k*spacing+horizon));
    var outcomeDate=addDays(asOfDate,horizon);
    if(outcomeDate>todayISO())continue;
    /* What actually happened, measured after the fact. */
    var actual=null;
    try{
      actual=withAsOf(outcomeDate,function(){
        var t=weightTrend(14);return t.status==='ok'?t.slopePerWeek:null;});
    }catch(e){}
    if(actual==null)continue;
    models.forEach(function(m){
      var pred=null,lo=null,hi=null;
      try{
        withAsOf(asOfDate,function(){
          var v=m.fn();
          if(v&&v.status==='ok'){
            /* Each estimator predicts the same thing: the rate implied by its maintenance estimate. */
            var eb=energyBalance();
            if(eb.status==='ok'&&v.value!=null){
              pred=(eb.intake-v.value)*7/tissueKcalPerLb();
              if(v.lo!=null&&v.hi!=null){
                lo=(eb.intake-v.hi)*7/tissueKcalPerLb();
                hi=(eb.intake-v.lo)*7/tissueKcalPerLb();
              }
            }
          }
          return null;
        });
      }catch(e){}
      if(pred==null)return;
      var s=scores[m.id];
      s.n++;s.errors.push(Math.abs(pred-actual));s.signed.push(pred-actual);
      if(lo!=null&&hi!=null&&actual>=Math.min(lo,hi)&&actual<=Math.max(lo,hi))s.covered++;
    });
  }
  var rows=models.map(function(m){
    var s=scores[m.id];
    if(!s.n)return {id:m.id,role:m===r.champion?'champion':'challenger',n:0,
      note:'produced no usable prediction at any replay point'};
    return {id:m.id,role:m===r.champion?'champion':'challenger',n:s.n,
      mae:round(mean(s.errors),3),
      bias:round(mean(s.signed),3),
      coverage:round(100*s.covered/s.n,0),
      note:Math.abs(mean(s.signed))>mean(s.errors)*0.6?'systematically biased rather than merely noisy':null};
  });
  var scored=rows.filter(function(x){return x.n>=3;});
  if(scored.length<2)return {status:'insufficient',rows:rows,
    need:['more history before both estimators can be scored'],
    note:'Backtesting needs enough past to replay. Comparing their outputs today would compare opinions, not accuracy.'};
  scored.sort(function(a,b){return a.mae-b.mae;});
  var best=scored[0],current=scored.filter(function(x){return x.role==='champion';})[0];
  var margin=current?round(current.mae-best.mae,3):null;
  /* Promotion needs a margin that exceeds the noise in the comparison, not just a lower number. */
  /* If the champion produced no scorable predictions it was not in the tournament at all, and "keep the
     current champion" would be a recommendation resting on nothing. An unscored champion is itself a
     finding. */
  var championScored=!!current;
  var meaningful=championScored&&margin!=null&&margin>0&&margin>best.mae*0.1;
  return {status:'ok',cls:'EMPIRICAL',quantity:quantity,
    replayPoints:scored[0].n,horizonDays:horizon,
    rows:scored,best:best.id,champion:current?current.id:null,
    margin:margin,
    championScored:championScored,
    recommendation:!championScored?
      ('the current champion produced no usable prediction at any replay point, so it cannot be defended on accuracy \u2014 '+
       best.id+' is the only estimator that actually scored'):
      (meaningful?
        ('promote '+best.id+': it is more accurate by '+margin+' over '+scored[0].n+' replay points'):
        'keep the current champion \u2014 no challenger beats it by more than the noise in this comparison'),
    baselineWins:best.id.indexOf('population')>=0?
      'the population baseline has the lowest error here, which means the personal estimators are not yet earning their complexity on this record':null,
    calibration:scored.map(function(x){return {id:x.id,coverage:x.coverage,
      calibrated:x.coverage!=null&&x.coverage>=80&&x.coverage<=99};}),
    note:'Both estimators replayed AS OF each past date and scored against what actually happened. Comparing their outputs on today\u2019s data would say nothing about which predicts better.',
    caveat:'Six replay points is a small tournament. A lower mean error over six fortnights is weak evidence, and the margin test exists so a fractional improvement does not trigger a promotion.'};
}
/* ---------------- dependency invalidation ----------------
   A correction upstream must reach every conclusion downstream, and say what changed. */
/* ---------------- dependency edges from model contracts ----------------
   The derivation graph was hand-enumerated, which means it drifts the moment a model changes what it reads
   and nobody remembers to update a table in another file. Every model already DECLARES its inputs in the
   contract the conformance audit checks; those declarations are the authoritative statement of what depends
   on what, so the graph is now built from them and the hand-written table is only a fallback for the few
   nodes that are not registered models. */
function contractDerivedEdges(){
  var edges={},unresolved=[];
  try{
    (MODELS||[]).forEach(function(m){
      (m.inputs||[]).forEach(function(i){
        var r=resolveContractRef(i);
        if(!r.resolved){unresolved.push(m.id+' ← '+i);return;}
        /* An input is upstream of the model that reads it. */
        (edges[r.id]=edges[r.id]||[]).push(m.id);
      });
      (m.consumers||[]).forEach(function(c){
        var r2=resolveContractRef(c);
        if(!r2.resolved)return;
        (edges[m.id]=edges[m.id]||[]).push(r2.id);
      });
    });
  }catch(e){}
  Object.keys(edges).forEach(function(k){
    edges[k]=edges[k].filter(function(v,i,a){return a.indexOf(v)===i&&v!==k;});});
  return {edges:edges,nodes:Object.keys(edges).length,
    unresolved:unresolved,
    note:'Dependency edges read from the model contracts rather than a hand-maintained table. A model that changes what it reads changes this automatically; a table in another file does not.',
    caveat:'Only registered models contribute. Quantities that are plain functions rather than registry entries still rely on the declared fallback below, and they are listed as such.'};
}
var DERIVATION_GRAPH_MANUAL={
  foodReference:['recipe','dailyIntake'],
  recipe:['dailyIntake'],
  dailyIntake:['energyBalance','adherence'],
  energyBalance:['tdee'],
  tdee:['forecast','calorieTarget','decision'],
  weightObservation:['weightTrend'],
  weightTrend:['tdee','forecast','rateBand','decision'],
  forecast:['decision'],
  tissueDensity:['tdee','forecast','counterfactual'],
  sessionLog:['stimulus','fatigue','trainingLoad','strengthTrend'],
  stimulus:['fatigue','recoveryCost'],
  fatigue:['readiness','unifiedRecovery'],
  readiness:['unifiedRecovery','decision'],
  adherence:['tdee','decision']
};
/* The effective graph: contract-derived edges where they exist, the declared table elsewhere. */
var _MERGED_GRAPH=null;
function derivationGraph(){
  if(_MERGED_GRAPH)return _MERGED_GRAPH;
  var merged={};
  Object.keys(DERIVATION_GRAPH_MANUAL).forEach(function(k){
    merged[k]=DERIVATION_GRAPH_MANUAL[k].slice();});
  var c=contractDerivedEdges();
  Object.keys(c.edges).forEach(function(k){
    merged[k]=(merged[k]||[]).concat(c.edges[k]).filter(function(v,i,a){return a.indexOf(v)===i;});});
  _MERGED_GRAPH=merged;
  return merged;
}
/* DERIVATION_GRAPH removed in H0: defined but never read (see docs/architecture/presentation-policies.md where it recorded a decision). */
function downstreamOf(node,seen){
  seen=seen||{};
  var out=[];
  (derivationGraph()[node]||[]).forEach(function(c){
    if(seen[c])return;
    seen[c]=1;out.push(c);
    out=out.concat(downstreamOf(c,seen));
  });
  return out;
}
function invalidationPlan(changed){
  var affected=downstreamOf(changed);
  if(!derivationGraph()[changed]&&!affected.length)
    return {status:'unknown',changed:changed,
      note:'Nothing in the derivation graph depends on that, which either means it is a leaf or that the graph is missing an edge. The second is worth checking.'};
  /* Order matters: recompute a dependency before whatever depends on it. */
  var order=[],placed={};
  (function place(n){
    (derivationGraph()[n]||[]).forEach(function(c){
      if(placed[c])return;
      place(c);
      if(!placed[c]){placed[c]=1;order.push(c);}
    });
  })(changed);
  return {status:'ok',cls:'DERIVED',changed:changed,
    affected:affected,count:affected.length,
    recomputeOrder:order.slice().reverse(),
    reachesDecision:affected.indexOf('decision')>=0,
    note:'Everything downstream of '+changed+', in the order it must be recomputed. '+
      (affected.indexOf('decision')>=0?
        'This reaches the decision, so a change here can change what the app recommends \u2014 which is exactly why a silent correction is dangerous.':
        'This does not reach the decision.'),
    caveat:'The plan says what to recompute. Whether a recomputed value actually CHANGED is a separate question, and only re-running it answers that.'};
}
function applyInvalidation(changed,opts){
  opts=opts||{};
  var plan=invalidationPlan(changed);
  if(plan.status!=='ok')return plan;
  var g=(typeof window!=='undefined')?window:{};
  var FN={tdee:'tdeePersonal',weightTrend:'weightTrend',energyBalance:'energyBalance',
    forecast:'weightForecast',readiness:'readinessState',unifiedRecovery:'unifiedRecovery',
    adherence:'adherenceState',trainingLoad:'trainingLoad',decision:'decide'};
  var before={};
  plan.affected.forEach(function(a){
    var fn=FN[a];if(!fn||typeof g[fn]!=='function')return;
    try{var v=g[fn]();before[a]=v&&v.value!=null?v.value:(v&&v.score!=null?v.score:JSON.stringify(v&&v.verb||null));}catch(e){}
  });
  _memoInvalidate();
  var changedValues=[];
  plan.affected.forEach(function(a){
    var fn=FN[a];if(!fn||typeof g[fn]!=='function')return;
    try{
      var v=g[fn]();
      var after=v&&v.value!=null?v.value:(v&&v.score!=null?v.score:JSON.stringify(v&&v.verb||null));
      if(before[a]!==undefined&&String(before[a])!==String(after))
        changedValues.push({quantity:a,before:before[a],after:after});
    }catch(e){}
  });
  return Object.assign({},plan,{
    recomputed:Object.keys(before).length,
    changedValues:changedValues,
    anythingChanged:changedValues.length>0,
    summary:changedValues.length?
      (changedValues.length+' downstream value(s) changed: '+changedValues.map(function(c){return c.quantity;}).join(', ')):
      'Nothing downstream actually changed, so the correction was inconsequential here \u2014 which is worth knowing rather than assuming.'});
}
/* ---------------- register real competitors ----------------
   Two genuinely different estimators for maintenance, so the competition has something to compare. */
(function(){
  try{
    registerEstimator('tdee','tdee_intake_balance',function(){return tdeePersonal();},
      {champion:true,cls:'DERIVED',note:'intake minus the energy behind the observed weight change'});
    registerEstimator('tdee','tdee_bayes_posterior',function(){
      var b=tdeeBayes();
      return b.status==='ok'||b.status==='prior-only'?
        {status:'ok',value:b.mean,lo:b.lo,hi:b.hi,cls:b.cls}:b;},
      {cls:'BLENDED',note:'population prior updated by the same energy balance evidence'});
    registerEstimator('tdee','tdee_population_only',function(){
      var p=tdeePrior();
      return p.status==='ok'?{status:'ok',value:p.value,lo:p.value*0.85,hi:p.value*1.15,cls:'PRIOR'}:p;},
      {cls:'PRIOR',note:'the population equation alone — the baseline any personal model must beat'});
  }catch(e){}
})();
/* Run the expansion at load. */
var _CAUSAL_EXPANDED=(function(){try{return expandCausalGraph();}catch(e){return null;}})();
