/* ============================================================================
   REGION: OPTIMISATION, STATE MODEL AND ADAPTIVE CAPTURE (catalogue §32, §34, §38)

   The last three items in the catalogue, and the ones most able to mislead, so each carries a constraint
   taken from the catalogue itself or from what the record can actually support.

   §32 states its own rule: "Never collapse all dimensions into one arbitrary score." Weighting outcome
   against time against cost is the user's trade, not the system's, so the output stays a frontier.

   §34 is the convergence point, and the honest thing to say about it is that a simulation is only as good
   as the response estimates underneath it. Most of those are population priors until a personal experiment
   replaces them. So the twin reports its own FIDELITY — how much of it rests on your evidence rather than on
   a starting assumption — and that number governs how far it should be trusted.

   §38 asks what to capture next. The ranking already exists in the value-of-information machinery; what was
   missing is a single daily answer rather than a list.
   ============================================================================ */

/* ---------------- §32 MULTI-DIMENSIONAL OPTIMISATION ---------------- */
var PLAN_DIMENSIONS=[
  {id:'outcome',label:'Expected outcome',better:'lower',unit:'lb/week'},
  {id:'adherence',label:'Likely to be followed',better:'higher',unit:'share'},
  {id:'burden',label:'Burden',better:'lower',unit:'index'},
  {id:'time',label:'Time cost',better:'lower',unit:'min/week'},
  {id:'cost',label:'Money cost',better:'lower',unit:'per week'},
  {id:'fatigue',label:'Fatigue cost',better:'lower',unit:'index'},
  {id:'feasible',label:'Possible with your equipment',better:'higher',unit:'yes/no'}
];
function _planDimensions(changes,base){
  /* Each dimension is computed from something real, or left null. A dimension filled with a default would
     make the frontier look richer than the evidence behind it. */
  var timePerWeek=0,costPerWeek=null,fatigue=0;
  if(changes.steps)timePerWeek+=Math.round(changes.steps/100);           // roughly a minute per 100 steps
  if(changes.cardio)timePerWeek+=changes.cardio*30;
  if(changes.training)timePerWeek+=changes.training*60;
  if(changes.calories){
    try{
      var cs=costState();
      if(cs.status==='ok'&&cs.perDay!=null){
        /* Eating less costs less, in proportion, but only where prices exist for the food. */
        var ph=activePhase()||{};
        if(ph.calorieTarget)costPerWeek=round(cs.perDay*7*(changes.calories/ph.calorieTarget),2);
      }
    }catch(e){}
  }
  if(changes.training)fatigue+=changes.training*0.8;
  if(changes.cardio)fatigue+=changes.cardio*0.4;
  if(changes.steps)fatigue+=changes.steps/8000*0.2;
  var feasible=true;
  if(changes.training){
    try{var eq=equipmentState();feasible=eq.status!=='ok'||eq.impossible.length===0;}catch(e){}
  }
  return {time:timePerWeek||null,cost:costPerWeek,fatigue:round(fatigue,2)||null,feasible:feasible};
}
function optimisePlans(opts){
  opts=opts||{};
  var base=searchPlans({horizonWeeks:opts.horizonWeeks||12});
  if(base.status!=='ok')return base;
  var rows=base.frontier.concat(opts.includeAll?[]:[]).map(function(p){
    var d=_planDimensions(p.changes||{},base);
    /* §22 uncertainty on every objective value that has one: the outcome range from the twin's own scenario. */
    var sc=null;try{sc=runScenario(buildScenario(p.name,p.changes||{},{horizonWeeks:opts.horizonWeeks||12}));}catch(e){}
    return {name:p.name,changes:p.changes,
      outcomeLo:sc&&sc.lo!=null?round(sc.lo,2):null,outcomeHi:sc&&sc.hi!=null?round(sc.hi,2):null,
      outcome:round(p.expected!=null?p.expected:p.rate,2),
      adherence:p.execution!=null?round(p.execution,2):null,
      burden:p.burden,time:d.time,cost:d.cost,fatigue:d.fatigue,feasible:d.feasible,
      withinBand:p.withinBand};
  });
  /* Pareto across every dimension that has a value on BOTH plans being compared. A plan is dominated only
     when another is at least as good on every comparable dimension and better on one. */
  var cmp=function(a,b,dim){
    var av=a[dim.id],bv=b[dim.id];
    if(av==null||bv==null)return 0;
    /* Two outcomes whose ranges overlap are not distinguishable, so neither dominates the other on outcome.
       Comparing midpoints alone would put a plan on or off the frontier over a difference the data cannot
       resolve. */
    if(dim.id==='outcome'&&a.outcomeLo!=null&&b.outcomeLo!=null&&a.outcomeLo<=b.outcomeHi&&b.outcomeLo<=a.outcomeHi)return 0;
    if(typeof av==='boolean')return (bv===av)?0:(bv?1:-1);
    return dim.better==='lower'?(av-bv):(bv-av);   // >0 means b is better
  };
  /* The frontier computed on midpoints as well, to name the plans that drop off ONLY because their outcome
     advantage lies inside the uncertainty. Treating overlapping outcomes as ties shrank the demo frontier from
     three plans to one — correctly, since extra effort for an unresolvable gain is dominated — but a lone plan
     would hide how close the others are. They are listed, not silently discarded. */
  var midCmp=function(a,b,dim){var av=a[dim.id],bv=b[dim.id];if(av==null||bv==null)return 0;
    if(typeof av==='boolean')return (bv===av)?0:(bv?1:-1);return dim.better==='lower'?(av-bv):(bv-av);};
  var onMidFrontier=rows.filter(function(a){return !rows.some(function(b){if(b===a)return false;
    var ok=true,st=false;PLAN_DIMENSIONS.forEach(function(dim){var c=midCmp(a,b,dim);if(c<0)ok=false;if(c>0)st=true;});return ok&&st;});});
  var frontier=rows.filter(function(a){
    return !rows.some(function(b){
      if(b===a)return false;
      var atLeastAsGood=true,strictlyBetter=false;
      PLAN_DIMENSIONS.forEach(function(dim){
        var c=cmp(a,b,dim);
        if(c<0)atLeastAsGood=false;
        if(c>0)strictlyBetter=true;
      });
      return atLeastAsGood&&strictlyBetter;
    });
  });
  var dimsUsed=PLAN_DIMENSIONS.filter(function(d){
    return rows.some(function(r){return r[d.id]!=null;});});
  /* §22: objectives and constraints are different things and are declared separately. A constraint removes a
     plan; an objective only ranks the plans that remain. */
  var objectives=PLAN_DIMENSIONS.filter(function(d){return d.id!=='feasible';}).map(function(d){
    return {id:d.id,label:d.label,better:d.better,available:rows.some(function(r){return r[d.id]!=null;})};});
  var constraints=[
    {id:'withinBand',label:'rate inside the safe loss band',removed:base.excludedOutsideBand||0},
    {id:'feasible',label:'executable with the time and equipment available',removed:rows.filter(function(r){return r.feasible===false;}).length}];
  var feasibility={searched:base.searched,removedByConstraints:constraints.reduce(function(a,c){return a+c.removed;},0),
    dominated:Math.max(0,base.searched-(base.excludedOutsideBand||0)-frontier.length),
    onFrontier:frontier.length,
    note:'Plans removed by a constraint were never eligible; dominated plans were eligible but another plan was at least as good on every objective and better on one.'};
  /* trade-offs: what each frontier plan is best at, and what it gives up, among the frontier */
  var tradeOffs=frontier.map(function(r){
    var best=[],worst=[];
    objectives.filter(function(o){return o.available;}).forEach(function(o){
      var vals=frontier.map(function(x){return x[o.id];}).filter(function(v){return v!=null;});
      if(r[o.id]==null||vals.length<2)return;
      var bestV=o.better==='lower'?Math.min.apply(null,vals):Math.max.apply(null,vals);
      var worstV=o.better==='lower'?Math.max.apply(null,vals):Math.min.apply(null,vals);
      if(bestV===worstV)return;
      if(r[o.id]===bestV)best.push(o.label);else if(r[o.id]===worstV)worst.push(o.label);});
    return {plan:r.name,bestAt:best,givesUp:worst};});
  return {status:'ok',cls:'PREDICTIVE',
    objectives:objectives,constraints:constraints,feasibility:feasibility,tradeOffs:tradeOffs,
    unresolvedAlternatives:onMidFrontier.filter(function(r){return frontier.indexOf(r)<0;}).map(function(r){
      return {plan:r.name,outcome:r.outcome,outcomeRange:[r.outcomeLo,r.outcomeHi],burden:r.burden,
        why:'its expected outcome is better, but its range overlaps the frontier plan\u2019s, so the gain is not resolvable \u2014 a reasonable choice only as a bet on the faster result'};}),
    searched:base.searched,rows:rows,frontier:frontier,
    dimensions:dimsUsed.map(function(d){return d.label;}),
    unavailable:PLAN_DIMENSIONS.filter(function(d){
      return !rows.some(function(r){return r[d.id]!=null;});}).map(function(d){return d.label;}),
    note:'Every plan where nothing else is better on all of the dimensions that could be compared. The dimensions are not weighted into one score, because weighting outcome against time against money is your trade and not the system\u2019s.',
    caveat:'A dimension with no data is left out of the comparison rather than filled with a default. '+
      'Cost is only available for food you have priced; time and fatigue are indices, not measurements.'};
}
/* ---------------- §34 PERSONAL STATE MODEL ----------------
   Assembled from the layers, with its own fidelity stated. */
function personalStateModel(){
  var state={},fidelity=[],missing=[];
  var take=function(name,fn,personal){
    try{
      var v=fn();
      if(v&&(v.status==='ok'||v.status==='clear')){
        state[name]=v;
        fidelity.push({part:name,personal:!!personal,cls:v.cls||null});
      }else{state[name]=null;missing.push(name);}
    }catch(e){state[name]=null;missing.push(name);}
  };
  take('body',function(){var b=bodyComp();return b&&b.estimate?Object.assign({status:'ok',cls:'HEURISTIC'},b):null;},false);
  take('weight',function(){var t=weightTrend(14);return t;},true);
  take('energy',function(){return tdeePersonal();},true);
  take('training',function(){return {status:'ok',cls:'MEASURED',load:trainingLoad(),volume:effectiveSets(7)};},true);
  take('nutrition',function(){var a=adherenceState(14);return a&&a.overall!=null?{status:'ok',cls:'MEASURED',adherence:a}:null;},true);
  take('recovery',function(){return unifiedRecovery();},true);
  take('behaviour',function(){var s=scheduleState();return s;},true);
  take('knowledge',function(){var k=personalKnowledge();return {status:'ok',cls:'EMPIRICAL',count:k.count,items:k.items.slice(0,8)};},true);
  /* Fidelity: what share of the model rests on this person's own evidence rather than a population prior. */
  var personalParts=fidelity.filter(function(f){return f.personal&&f.cls!=='PRIOR'&&f.cls!=='HEURISTIC';}).length;
  var share=fidelity.length?personalParts/(fidelity.length+missing.length):0;
  /* And how much of the RESPONSE matrix — the thing any simulation actually runs on — is personal. */
  var responsePersonal=0,responseTotal=0;
  try{
    (personalResponse().rows||[]).forEach(function(r){
      responseTotal++;
      if(r.cls==='EMPIRICAL'||r.cls==='CALIBRATED')responsePersonal++;
    });
  }catch(e){}
  return {state:state,parts:fidelity.length,missing:missing,
    fidelity:round(share*100,0),
    /* A share from one variable is reported with its denominator, because 100% of one is not 100%. */
    responseBase:responseTotal<3?'narrow':'adequate',
    responsePersonal:responsePersonal,responseTotal:responseTotal,
    responseShare:responseTotal?round(100*responsePersonal/responseTotal,0):0,
    cls:'DERIVED',
    trustworthiness:share>=0.7&&responseTotal>=3&&responsePersonal/responseTotal>=0.5?'reasonable for comparing options':
      (share>=0.4?'adequate for describing where you are, weak for predicting what a change would do':
        'descriptive only \u2014 too little of it rests on your own evidence to simulate from'),
    note:'A model of where you are, assembled from the layers rather than invented. Its fidelity is the share resting on your own evidence rather than on a population starting point.',
    caveat:'A simulation is only as good as the response estimates underneath it. '+
      (!responseTotal?'None of those have personal evidence yet.':
       (responsePersonal===responseTotal?
         ('All '+responseTotal+' have personal evidence'+(responseTotal<3?', which is a narrow base for simulating from':'')+'.'):
         ((responseTotal-responsePersonal)+' of '+responseTotal+' are still population priors.')))+
      ' That is the honest limit on anything this model predicts.'};
}
/* §33/§34 simulation, refusing where fidelity is too low to mean anything. */
function simulateChange(changes,opts){
  opts=opts||{};
  var twin=personalStateModel();
  if(twin.responseTotal&&twin.responsePersonal===0&&!opts.force)
    return {status:'unsupported',fidelity:twin.fidelity,
      need:['at least one variable with a measured personal response'],
      note:'Every response estimate available is a population prior, so a simulation would be projecting the literature onto you and calling it your forecast. Run one experiment and this becomes answerable.'};
  var scenario;
  try{scenario=runScenario(buildScenario('simulated',changes,{horizonWeeks:opts.horizonWeeks||12}));}
  catch(e){return {status:'error',note:String(e&&e.message||e)};}
  return {status:'ok',cls:'PREDICTIVE',changes:changes,
    result:scenario,fidelity:twin.fidelity,
    responseShare:twin.responseShare,
    confidence:twin.responseShare>=50?'moderate':(twin.responseShare>0?'low':'very low'),
    /* The sentence has to survive the edge cases: at 100% there is no "rest", and a share computed from one
       variable is not the same claim as one computed from five. */
    note:'Projected from the response estimates in your record. '+
      (twin.responseTotal===0?'None of them rest on your own evidence yet, so this is the literature applied to you.':
       (twin.responsePersonal===twin.responseTotal?
         ('All '+twin.responseTotal+' of them rest on your own evidence'+
          (twin.responseTotal<3?', though that is a narrow base \u2014 one or two measured responses is not a model of you':'')+'.'):
         (twin.responsePersonal+' of '+twin.responseTotal+' rest on your own evidence; the rest are population starting points')))+
      ' The interval matters more than the number.',
    caveat:twin.caveat};
}
/* ---------------- §38 ADAPTIVE CAPTURE ----------------
   One answer, not a list: what is the single most useful thing to record today. */
function captureRequest(opts){
  opts=opts||{};
  var candidates=[];
  /* From the domains, which already rank by value against burden. */
  try{
    domainGaps().forEach(function(g){
      candidates.push({what:g.question,need:g.need,value:g.value,burden:g.burden,
        limits:g.limits,act:g.act,arg:g.arg,source:g.domainLabel});
    });
  }catch(e){}
  /* From missing data, weighted by what it limits. */
  try{
    missingDataReport().rows.filter(function(r){return r.have<r.of;}).forEach(function(r){
      var share=r.have/Math.max(1,r.of);
      candidates.push({what:'Log '+r.label.toLowerCase(),
        need:[(r.of-r.have)+' more day(s) in the window'],
        value:round(0.4+0.5*(1-share),2),burden:0.2,
        limits:r.limits,act:'log.type',arg:r.type||null,source:'data quality'});
    });
  }catch(e){}
  /* From the experiment layer: the question that would resolve most. */
  try{
    var o=experimentOpportunities();
    if(o.best)candidates.push({what:o.best.question,need:['a designed experiment of about '+o.best.weeks+' weeks'],
      value:o.best.value,burden:o.best.burden,limits:'whether '+o.best.variable+' does anything for you',
      act:'nav.experiments2',source:'experiments'});
  }catch(e){}
  if(!candidates.length)return {status:'none',
    note:'Nothing is limiting a current decision enough to be worth asking for. Asking anyway would be a habit rather than a question.'};
  candidates.forEach(function(c){c.ratio=round(c.value/Math.max(0.1,c.burden),2);});
  candidates.sort(function(a,b){return b.ratio-a.ratio;});
  /* Do not ask for something already recorded today. */
  var todayTypes={};
  obsOf(null,{from:todayISO()}).forEach(function(o){todayTypes[o.type]=1;});
  var top=candidates.filter(function(c){return !(c.arg&&todayTypes[c.arg]);})[0]||candidates[0];
  return {status:'ok',cls:'DERIVED',ask:top,alternatives:candidates.slice(1,4),
    note:'One request, chosen by how much it would resolve against how much work it is. Asking for everything every day is how logging becomes a chore and then stops.',
    caveat:'This ranks by what the system can see is missing. Something it never asks about is something it cannot know it needs.'};
}
