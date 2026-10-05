/* ============================================================================
   REGION: IDENTIFICATION BEYOND THE BACKDOOR (WorkConC.md)

   The backdoor criterion is one identification strategy of several, and it fails in the exact case that
   matters most here: an effect confounded by something nobody records. Three more strategies, each of which
   answers a question the backdoor cannot.

   FRONT-DOOR. If the whole effect passes through a mediator you DO observe, and nothing confounds the
   treatment-to-mediator or mediator-to-outcome steps, the effect is identified even when the treatment
   itself is hopelessly confounded. This is the strategy for "calories affects weight through energy
   balance" when motivation is unmeasured.

   INSTRUMENTAL VARIABLES. Something that moves the treatment, has no path to the outcome except through it,
   and shares no cause with the outcome. Day-of-week is the honest candidate here and a weak one, which is
   why the implementation reports instrument strength rather than assuming it.

   SENSITIVITY BOUNDS. When nothing identifies the effect, the useful question stops being "what is it" and
   becomes "how strong would unmeasured confounding have to be to explain this away". The E-value answers
   exactly that, and it is computable without knowing what the confounder is.
   ============================================================================ */

/* ---------------- front-door criterion ---------------- */
function frontDoorSet(treatment,outcome){
  if(CAUSAL_DAG.nodes.indexOf(treatment)<0||CAUSAL_DAG.nodes.indexOf(outcome)<0)
    return {status:'unknown',note:'one of these is not in the causal graph'};
  var paths=_allPaths(treatment,outcome);
  var directed=paths.filter(function(p){return p.every(function(s,i){return i===0||s.edgeDir==='out';});});
  if(!directed.length)return {status:'none',treatment:treatment,outcome:outcome,
    note:'No directed path from '+treatment+' to '+outcome+', so there is no mediator to route through.'};
  /* A front-door set must intercept EVERY directed path. */
  var counts={};
  directed.forEach(function(p){
    p.slice(1,-1).forEach(function(s){counts[s.node]=(counts[s.node]||0)+1;});});
  var full=Object.keys(counts).filter(function(n){return counts[n]===directed.length;});
  if(!full.length)return {status:'none',treatment:treatment,outcome:outcome,
    directedPaths:directed.length,
    note:'No single observed variable intercepts every path from '+treatment+' to '+outcome+
      ', so the front door does not apply. Some of the effect would travel around whatever mediator you picked.'};
  /* The mediator must itself be free of backdoor confounding with the outcome. */
  var usable=full.filter(function(m){
    var a2=adjustmentSet(m,outcome);
    return a2.status==='ok'&&a2.identifiable;
  });
  var tracked=usable.filter(function(m){
    var g=(typeof window!=='undefined')?window:{};
    return !!OBS_TYPES[m]||typeof g[m]==='function';});
  return {status:tracked.length?'ok':(usable.length?'not-tracked':'none'),
    treatment:treatment,outcome:outcome,
    candidates:full,usable:usable,tracked:tracked,
    mediator:tracked[0]||null,
    directedPaths:directed.length,
    note:tracked.length?
      ('The whole effect passes through '+tracked[0]+', which is observed, so the effect is identified even if '+
       treatment+' itself is confounded by something nobody records.'):
      (usable.length?('The front door would work through '+usable.join(' or ')+', but '+
        (usable.length>1?'none of those are':'that is not')+' tracked.'):
       'No usable front-door mediator.'),
    caveat:'The front door needs the treatment-to-mediator step unconfounded AND the mediator-to-outcome step unconfounded given the treatment. Both are claims about the graph, and a mediator that leaks some of the effect around itself invalidates the whole strategy.'};
}
/* LINEAR FRONT DOOR. With linear legs the front-door formula reduces to a·b: a is the slope of the mediator on the
   treatment, and b is the mediator's coefficient in a regression of the outcome on the mediator AND the treatment. The
   first version took b from the outcome on the mediator alone. The treatment opens a backdoor between the two
   (mediator ← treatment ← confounder → outcome), so that leg carried exactly the confounding the front door exists to
   route around: on data with a known effect of 1.0 it reported about 1.7. The interval is the delta method for a
   product of two estimated coefficients. Rows are {T, M, Y}; null when the legs cannot be estimated. */
function linearFrontDoor(rows){
  var n=(rows||[]).length;if(n<5)return null;
  var mT=mean(rows.map(function(r){return r.T;})),mM=mean(rows.map(function(r){return r.M;})),mY=mean(rows.map(function(r){return r.Y;}));
  var stt=0,stm=0,smm=0,sty=0,smy=0,syy=0;
  rows.forEach(function(r){var t=r.T-mT,m=r.M-mM,y=r.Y-mY;stt+=t*t;stm+=t*m;smm+=m*m;sty+=t*y;smy+=m*y;syy+=y*y;});
  var det=smm*stt-stm*stm;if(!stt||!(det>1e-12*smm*stt))return null;   /* no variation, or the mediator is the treatment */
  var a=stm/stt,seA=Math.sqrt(Math.max(0,smm-a*stm)/(n-2)/stt);
  var b=(smy*stt-sty*stm)/det,c=(sty*smm-smy*stm)/det;
  var seB=Math.sqrt(Math.max(0,syy-b*smy-c*sty)/(n-3)*stt/det);
  var est=a*b,se=Math.sqrt(b*b*seA*seA+a*a*seB*seB);
  return {a:a,b:b,directGivenMediator:c,estimate:est,se:se,lo:est-1.96*se,hi:est+1.96*se,n:n};
}
function frontDoorEstimate(treatment,outcome,opts){
  opts=opts||{};
  var fd=frontDoorSet(treatment,outcome);
  if(fd.status!=='ok')return fd;
  var m=fd.mediator;
  var days=opts.days||120;
  var T=seriesWindow(treatment,days),M=seriesWindow(m,days),Y=seriesWindow(outcome,days);
  var byM={},byY={};
  M.forEach(function(d){byM[d.date]=d.value;});
  Y.forEach(function(d){byY[d.date]=d.value;});
  var rows=[];
  T.forEach(function(d){
    if(byM[d.date]!=null&&byY[d.date]!=null)rows.push({T:d.value,M:byM[d.date],Y:byY[d.date]});});
  if(rows.length<25)return {status:'insufficient',mediator:m,have:rows.length,
    need:['at least 25 days with '+treatment+', '+m+' and '+outcome+' all recorded']};
  var lf=linearFrontDoor(rows);
  if(!lf)return {status:'insufficient',mediator:m,have:rows.length,need:['variation in '+treatment+' and in '+m+' that is not just '+treatment+' again']};
  var mx=mean(rows.map(function(r){return r.T;})),my=mean(rows.map(function(r){return r.Y;}));
  var vx=mean(rows.map(function(r){return Math.pow(r.T-mx,2);}));
  var direct=vx?mean(rows.map(function(r){return (r.T-mx)*(r.Y-my);}))/vx:null;
  return {status:'ok',cls:'EMPIRICAL',approximation:'linear',treatment:treatment,mediator:m,outcome:outcome,
    n:rows.length,
    legTreatmentToMediator:round(lf.a,4),
    legMediatorToOutcome:round(lf.b,4),
    frontDoorEstimate:round(lf.estimate,5),
    se:round(lf.se,5),lo:round(lf.lo,5),hi:round(lf.hi,5),
    naiveDirect:direct!=null?round(direct,5):null,
    difference:direct!=null?round(lf.estimate-direct,5):null,
    method:'linear front-door approximation: the '+treatment+'\u2192'+m+' slope times the '+m+'\u2192'+outcome+' coefficient adjusted for '+treatment,
    assumptions:['the whole effect of '+treatment+' on '+outcome+' passes through '+m,'nothing unmeasured confounds '+treatment+' and '+m,
      'nothing unmeasured confounds '+m+' and '+outcome+' once '+treatment+' is accounted for','both legs are linear and the same on every day'],
    decisionUse:'exploratory: the decision engine does not act on it',
    note:'Estimated through '+m+' rather than around the confounders of '+treatment+
      '. A linear approximation of the front-door formula: the two legs are multiplied, the second adjusted for '+treatment+'.',
    caveat:'Linear legs are an assumption this makes and does not test. The difference from the naive estimate is the confounding the front door is routing around \u2014 or evidence the mediator leaks, and nothing here distinguishes those two.'};
}
/* ---------------- instrumental variables ---------------- */
var INSTRUMENT_CANDIDATES={
  dayOfWeek:{affects:['steps','calories','training','sleep'],
    why:'the weekly cycle moves behaviour for reasons unrelated to how you feel',
    concern:'it also moves stress, meals and sleep directly, which would violate the exclusion restriction'},
  season:{affects:['steps','neat','temperature'],
    why:'daylight and weather move activity',
    concern:'season affects mood and eating directly too'}
};
function instrumentalEstimate(instrument,treatment,outcome,opts){
  opts=opts||{};
  var days=opts.days||150;
  var cand=INSTRUMENT_CANDIDATES[instrument];
  if(!cand)return {status:'unknown-instrument',
    note:'No declared instrument by that name. An instrument has to be argued for, not picked from the data.'};
  if(cand.affects.indexOf(treatment)<0)return {status:'not-relevant',
    note:instrument+' is not declared to move '+treatment+', so it cannot instrument for it.'};
  var T=seriesWindow(treatment,days),Y=seriesWindow(outcome,days);
  var byY={};Y.forEach(function(d){byY[d.date]=d.value;});
  var rows=[];
  T.forEach(function(d){
    if(byY[d.date]==null)return;
    var z=instrument==='dayOfWeek'?
      (new Date(d.date+'T12:00:00Z').getUTCDay()>=5?1:0):
      (new Date(d.date+'T12:00:00Z').getUTCMonth()>=3&&new Date(d.date+'T12:00:00Z').getUTCMonth()<=8?1:0);
    rows.push({Z:z,T:d.value,Y:byY[d.date]});
  });
  if(rows.length<30)return {status:'insufficient',have:rows.length,need:['at least 30 paired days']};
  var g1=rows.filter(function(r){return r.Z===1;}),g0=rows.filter(function(r){return r.Z===0;});
  if(g1.length<8||g0.length<8)return {status:'no-variation',
    note:'The instrument barely varies in this window, so it cannot separate anything.'};
  /* Wald estimator: the shift in outcome divided by the shift in treatment. */
  var dT=mean(g1.map(function(r){return r.T;}))-mean(g0.map(function(r){return r.T;}));
  var dY=mean(g1.map(function(r){return r.Y;}))-mean(g0.map(function(r){return r.Y;}));
  /* Instrument strength: a weak instrument makes the estimate wildly unstable and biased toward the
     confounded one, which is the failure mode people forget. */
  var sdT=sd(rows.map(function(r){return r.T;}))||1;
  var strength=Math.abs(dT)/sdT;
  var wald=Math.abs(dT)>1e-9?dY/dT:null;
  /* Weak-instrument thresholds are conventionally expressed as a first-stage F. Approximated here from the
     shift and the group sizes, because "0.2 standard deviations" means nothing to most readers. */
  var nEff=(g1.length*g0.length)/rows.length;
  var firstStageF=sdT?Math.pow(dT/sdT,2)*nEff:null;
  return {status:'ok',cls:'EMPIRICAL',instrument:instrument,treatment:treatment,outcome:outcome,
    n:rows.length,groupSizes:{high:g1.length,low:g0.length},
    shiftInTreatment:round(dT,3),shiftInOutcome:round(dY,4),
    waldEstimate:wald!=null?round(wald,5):null,
    instrumentStrength:round(strength,3),
    firstStageF:firstStageF!=null?round(firstStageF,1):null,
    /* The conventional rule of thumb is a first-stage F below 10, which is stricter than it sounds. */
    weak:strength<0.3||(firstStageF!=null&&firstStageF<10),
    relevance:cand.why,exclusionConcern:cand.concern,
    verdict:(strength<0.3||(firstStageF!=null&&firstStageF<10))?
      ('The instrument moves '+treatment+' by '+round(strength,2)+' standard deviations'+
       (firstStageF!=null?(' (first-stage F about '+round(firstStageF,0)+', against a conventional minimum of 10)'):'')+
       ', which is weak. A weak instrument is unstable and biased TOWARD the confounded estimate, so this number should not be used.'):
      ('The instrument shifts '+treatment+' by '+round(dT,2)+', and the outcome by '+round(dY,3)+'.'),
    note:'A Wald estimator: the instrument-induced shift in outcome divided by the shift in treatment.',
    caveat:'The exclusion restriction cannot be tested, only argued. For this instrument the concern is explicit: '+cand.concern+'. If that path exists, the estimate is wrong and nothing in the data will say so.'};
}
/* ---------------- sensitivity bounds ----------------
   When nothing identifies the effect, the answerable question is how strong unmeasured confounding would
   have to be to explain the association away. */
function eValue(estimate,lo,hi,opts){
  opts=opts||{};
  if(estimate==null)return {status:'insufficient',need:['an estimate to bound']};
  /* VanderWeele and Ding. For a ratio-scale estimate; a difference is converted via the approximation for
     a standardised mean difference. */
  var rr=opts.isRatio?Math.abs(estimate):
    Math.exp(0.91*(estimate/(opts.sd||1)));   // Chinn's approximation
  if(rr<1)rr=1/rr;
  var ev=rr+Math.sqrt(rr*(rr-1));
  var evLo=null;
  if(lo!=null&&hi!=null){
    var bound=(estimate>0)?Math.min(Math.abs(lo),Math.abs(hi)):Math.max(Math.abs(lo),Math.abs(hi));
    var rrB=opts.isRatio?Math.abs(bound):Math.exp(0.91*(bound/(opts.sd||1)));
    if(rrB<1)rrB=1/rrB;
    evLo=rrB<=1?1:rrB+Math.sqrt(rrB*(rrB-1));
  }
  return {status:'ok',cls:'DERIVED',
    estimate:estimate,approximateRiskRatio:round(rr,3),
    eValue:round(ev,2),eValueForInterval:evLo!=null?round(evLo,2):null,
    interpretation:'An unmeasured confounder would need to be associated with BOTH the exposure and the outcome by a risk ratio of at least '+
      round(ev,2)+', above and beyond everything already adjusted for, to explain this association away'+
      (evLo!=null?(' \u2014 and '+round(evLo,2)+' to move the interval to no effect'):'')+'.',
    weak:ev<1.5,
    note:'The E-value: how strong unmeasured confounding would have to be. Computable without knowing what the confounder is, which is the point \u2014 it turns "there might be confounding" into a quantity.',
    caveat:'A large E-value does not mean no confounding exists, and a small one does not mean the effect is fake. It converts an unanswerable question into a comparison: is a confounder that strong plausible in this setting?'};
}
function identificationStrategy(treatment,outcome){
  /* Which strategies are available, in the order anyone should actually try them. */
  var out=[];
  var bd=null;try{bd=adjustmentSet(treatment,outcome);}catch(e){}
  if(bd&&bd.status==='ok')out.push({strategy:'backdoor adjustment',
    available:bd.identifiable,
    detail:bd.identifiable?('adjust for '+(bd.adjustFor.join(', ')||'nothing')):bd.note,
    blocked:(function(){
      if(!bd.identifiable)return 'no blocking set found';
      var untracked=bd.adjustFor.filter(function(c){
        return !OBS_TYPES[c]||seriesWindow(c,90).length===0;});
      return untracked.length?('requires '+untracked.join(', ')+', not tracked'):null;})()});
  var fd=null;try{fd=frontDoorSet(treatment,outcome);}catch(e){}
  if(fd)out.push({strategy:'front door',available:fd.status==='ok',
    detail:fd.note,blocked:fd.status==='not-tracked'?'mediator not tracked':null});
  Object.keys(INSTRUMENT_CANDIDATES).forEach(function(iv){
    if(INSTRUMENT_CANDIDATES[iv].affects.indexOf(treatment)<0)return;
    var r=null;try{r=instrumentalEstimate(iv,treatment,outcome);}catch(e){}
    /* A marginal instrument with a doubtful exclusion restriction is not an identification strategy, it is
       a number. 0.217 standard deviations of movement scraped past a 0.2 threshold and got the effect
       reported as "identified" — while day-of-week plainly reaches meals, sleep and stress directly. The bar
       is higher, and the exclusion concern travels with the verdict instead of sitting in a caveat nobody
       reaches. */
    /* Use the estimator's own verdict. Identification used to accept on strength >= 0.3 alone while the
       estimator also calls an instrument weak below a first-stage F of 10, so identification could approve an
       instrument its own estimator would reject. */
    var strongEnough=!!r&&r.status==='ok'&&!r.weak;
    out.push({strategy:'instrumental variable ('+iv+')',
      available:strongEnough,
      assumptionRisk:INSTRUMENT_CANDIDATES[iv].concern,
      detail:r?(r.verdict||r.note):'not computed',
      blocked:(!r||r.status!=='ok')?'not computable':
        (r.weak?('instrument too weak: '+round(r.instrumentStrength,2)+' SD of movement, first-stage F about '+(r.firstStageF!=null?Math.round(r.firstStageF):'?')):null)});
  });
  var usable=out.filter(function(o){return o.available&&!o.blocked;});
  return {treatment:treatment,outcome:outcome,strategies:out,
    usable:usable.length,best:usable[0]||null,cls:'POLICY',
    verdict:usable.length?
      ('This effect could be identified by '+usable[0].strategy+
       (usable[0].assumptionRisk?(', but only if its untestable assumption holds: '+usable[0].assumptionRisk):'')+'.'):
      'No identification strategy is available for this effect with what is currently recorded, so the honest output is a sensitivity bound rather than an estimate.',
    note:'Identification strategies in the order worth trying. The backdoor is the default; the front door survives unmeasured confounding of the treatment; an instrument survives it too but needs an untestable exclusion restriction.',
    caveat:'Availability here means the strategy APPLIES given the graph and the data. It does not mean the resulting estimate is correct \u2014 every strategy rests on assumptions the data cannot check.'};
}
/* ---------------- walk-forward governance ---------------- */
function walkForwardBacktest(quantity,opts){
  opts=opts||{};
  /* Six points was a tournament, not evidence. Walk forward at weekly spacing across everything available. */
  var horizon=opts.horizonDays||14;
  var spacing=opts.spacingDays||7;
  var span=opts.spanDays||180;
  var points=Math.floor((span-horizon)/spacing);
  var bt=backtestEstimators(quantity,{points:points,spacingDays:spacing,horizonDays:horizon});
  if(bt.status!=='ok')return Object.assign({},bt,{requestedPoints:points});
  return Object.assign({},bt,{
    requestedPoints:points,walkForward:true,
    adequate:bt.replayPoints>=20,
    note:bt.note+' Walked forward at '+spacing+'-day spacing across '+span+' days.',
    caveat:bt.replayPoints>=20?bt.caveat:
      ('Only '+bt.replayPoints+' replay points were usable, which is still a small tournament. '+
       'Twenty or more is where a difference in mean error starts meaning something, and this record does not yet contain it.')});
}
function promotionDecision(quantity,opts){
  var bt=walkForwardBacktest(quantity,opts);
  if(bt.status!=='ok')return {status:bt.status,note:bt.note,need:bt.need};
  /* A rule, stated, rather than a person deciding after seeing the numbers. */
  var RULE={minPoints:20,minMarginFraction:0.1,maxBiasFraction:0.6,minCoverage:80};
  var best=bt.rows[0];
  var current=bt.rows.filter(function(r){return r.role==='champion';})[0];
  var reasons=[];
  if(bt.replayPoints<RULE.minPoints)reasons.push('only '+bt.replayPoints+' replay points, and the rule requires '+RULE.minPoints);
  if(current&&bt.margin!=null&&bt.margin<=best.mae*RULE.minMarginFraction)
    reasons.push('the margin over the champion is inside the noise');
  if(best&&Math.abs(best.bias)>best.mae*RULE.maxBiasFraction)
    reasons.push('the leading estimator is systematically biased rather than merely noisy');
  if(best&&best.coverage!=null&&best.coverage<RULE.minCoverage)
    reasons.push('the leading estimator\u2019s intervals only covered '+best.coverage+'% of outcomes');
  var promote=reasons.length===0&&!!current&&best.id!==current.id;
  return {status:'ok',cls:'POLICY',quantity:quantity,
    rule:RULE,leading:best?best.id:null,champion:current?current.id:null,
    promote:promote,blockers:reasons,
    decision:promote?('promote '+best.id):'no promotion',
    why:promote?('it leads on error by '+bt.margin+' over '+bt.replayPoints+' points, is not systematically biased, and its intervals are calibrated'):
      (reasons.length?reasons.join('; '):'the champion is still leading'),
    note:'Promotion by a stated rule rather than by someone deciding after seeing the numbers. A rule written before the result is the only version of this that is not just preference.',
    caveat:'The rule is a judgement too \u2014 the thresholds are arguable. Writing them down makes them arguable, which is the point.'};
}

/* ============================================================================
   \u00a712: THE CAUSAL PIPELINE
   question \u2192 DAG \u2192 estimand \u2192 identification \u2192 treatment model \u2192 estimator \u2192 balance/positivity \u2192 effect \u2192
   uncertainty \u2192 sensitivity. Every stage already existed as a separate function; nothing ran them in order,
   so a caller could take an effect estimate without having passed identification. This orchestrates the
   existing pieces \u2014 it is deliberately not a second causal framework \u2014 keeps each stage's output separate,
   and stops at the first stage that fails, naming it.
   ============================================================================ */
function causalAnalysis(treatment,outcome,opts){
  opts=opts||{};
  var stages=[],out={question:{treatment:treatment,outcome:outcome,
    asks:'what change in '+outcome+' would a change in '+treatment+' cause, here, for this person'}};
  var stop=function(stage,note,extra){
    return Object.assign({status:'stopped',stoppedAt:stage,stages:stages,note:note},out,extra||{});};
  /* DAG */
  var dv=null;try{dv=dagValidate();}catch(e){}
  if(!dv||!dv.acyclic)return stop('dag','The causal graph is not a valid DAG, so nothing downstream can be trusted.');
  if(CAUSAL_DAG.nodes.indexOf(treatment)<0||CAUSAL_DAG.nodes.indexOf(outcome)<0)
    return stop('dag',treatment+' or '+outcome+' is not in the causal graph.');
  out.dag={nodes:dv.nodes,edges:dv.edges,acyclic:true};stages.push('dag');
  /* estimand */
  out.estimand={id:'ATE',means:'the average effect across all days in the analysis, not the effect on treated days alone'};
  stages.push('estimand');
  /* identification: assumptions made explicit */
  var id=identificationStrategy(treatment,outcome);
  out.identification={strategies:id.strategies,usable:id.usable,best:id.best,
    assumptions:['the causal graph is correct','no unmeasured confounding beyond what the graph names',
      'positivity: every day could have received either level of treatment','consistency: the treatment is well defined']};
  stages.push('identification');
  if(!id.usable){
    /* Not identifiable: the honest output is a sensitivity bound on the raw association, not an effect. */
    var a2=adjustmentSet(treatment,outcome);
    out.sensitivity={note:id.verdict};
    return stop('identification',id.verdict,{blockedBy:(id.strategies||[]).map(function(s){return s.strategy+': '+(s.blocked||s.detail);})});
  }
  /* The estimator follows the strategy identification chose. The first version always ran the backdoor
     estimator, so a question identified through an instrument was then estimated by adjustment \u2014 and failed
     on a covariate the chosen strategy did not need. */
  var strat=id.best.strategy;
  out.identification.selected=strat;
  if(/^instrumental variable/.test(strat)){
    var ivName=(strat.match(/\(([^)]+)\)/)||[])[1];
    var iv=instrumentalEstimate(ivName,treatment,outcome,opts);
    if(iv.status!=='ok')return stop('estimator','instrumental estimate: '+(iv.note||iv.status));
    out.treatmentModel={method:'first stage: '+ivName+' shifts '+treatment,shift:iv.shiftInTreatment,
      firstStageF:iv.firstStageF,instrumentStrength:iv.instrumentStrength};
    stages.push('treatment-model');
    out.estimator={method:'Wald instrumental-variable estimator',estimand:'LATE',
      note:'an instrument identifies the effect on days whose '+treatment+' the instrument actually moved (the local average effect), not the average over all days'};
    out.estimand={id:'LATE',means:'the effect among days whose '+treatment+' is moved by '+ivName+', not the average effect over all days'};
    stages.push('estimator');
    out.balance={instrumentStrong:!iv.weak,firstStageF:iv.firstStageF,exclusionRestriction:'untestable \u2014 '+iv.exclusionConcern};
    stages.push('balance');
    if(iv.weak)return stop('balance','The instrument is weak, so the estimate would be unstable and biased toward the confounded one.');
    out.effect={estimate:iv.waldEstimate,n:iv.n};stages.push('effect');
    /* Delta-method standard error of a Wald ratio is unstable at these sample sizes; the interval is
       reported as unavailable rather than invented. */
    out.uncertainty={source:'causal',se:null,lo:null,hi:null,
      basis:'not computed: a Wald ratio\u2019s interval is unreliable at this sample size, and an invented one would look like evidence'};
    stages.push('uncertainty');
    out.sensitivity={exclusionRestriction:iv.exclusionConcern,
      note:'The whole estimate rests on '+ivName+' affecting '+outcome+' ONLY through '+treatment+'. If it has any other path, the estimate is wrong and nothing in the data would show it.'};
    stages.push('sensitivity');
    return Object.assign({status:'ok',stages:stages,cls:'EMPIRICAL',strategy:strat},out,
      {note:'Estimated through an instrument, so it answers a narrower question (the local effect) and rests on an untestable exclusion restriction.'});
  }
  if(/^front door/.test(strat)){
    var fd=frontDoorEstimate(treatment,outcome,opts);
    if(fd.status!=='ok')return stop('estimator','front-door estimate: '+(fd.note||fd.status));
    out.treatmentModel={method:'mediator '+fd.mediator+' on '+treatment,leg:fd.legTreatmentToMediator};stages.push('treatment-model');
    out.estimator={method:fd.method,estimand:'ATE',approximation:'linear',assumptions:fd.assumptions,decisionUse:fd.decisionUse};stages.push('estimator');
    out.balance={note:'the front door requires no confounding of either leg, which the graph asserts and the data cannot check'};stages.push('balance');
    out.effect={estimate:fd.frontDoorEstimate,n:fd.n};stages.push('effect');
    out.uncertainty={source:'causal',se:fd.se,lo:fd.lo,hi:fd.hi,
      basis:'delta method for the product of the two estimated legs; it reflects sampling noise only, not the untested assumptions'};stages.push('uncertainty');
    out.sensitivity={note:fd.caveat};stages.push('sensitivity');
    return Object.assign({status:'ok',stages:stages,cls:'EMPIRICAL',strategy:strat},out);
  }
  /* backdoor adjustment: treatment model, estimator, balance/positivity */
  var ps=propensityScoreModel(treatment,outcome,opts);
  if(ps.status!=='ok')return stop('treatment-model',ps.note||('treatment model: '+ps.status),{need:ps.need,untracked:ps.untracked});
  out.treatmentModel={method:'logistic regression of treatment on the adjustment set',adjustedFor:ps.adjustedFor,
    propensityRange:ps.propensityRange,commonSupport:ps.commonSupport};
  stages.push('treatment-model');
  out.estimator={method:'stabilised inverse-probability weighting with trimming to common support',estimand:ps.estimand};
  stages.push('estimator');
  out.balance={positivityOk:ps.positivityOk,positivityViolations:ps.positivityViolations,
    balanceAfterWeighting:ps.balanceAfterWeighting,stillImbalanced:ps.stillImbalanced,effectiveSampleSize:ps.effectiveSampleSize};
  stages.push('balance');
  if(!ps.positivityOk&&ps.positivityViolations>ps.n*0.1)
    return stop('balance','Positivity fails on more than a tenth of days, so the estimate would extrapolate rather than compare.');
  if(ps.stillImbalanced&&ps.stillImbalanced.length)
    return stop('balance','Weighting did not balance '+ps.stillImbalanced.map(function(b){return b.covariate;}).join(', ')+', so the estimate remains confounded on it.');
  out.effect={estimate:ps.ateEstimate,naive:ps.naiveDifference,n:ps.trimmed};
  stages.push('effect');
  var sdY=null;try{var ys=seriesWindow(outcome,opts.days||120).map(function(d){return d.value;});sdY=sd(ys);}catch(e){}
  var se=(sdY&&ps.effectiveSampleSize)?sdY*Math.sqrt(2/ps.effectiveSampleSize):null;
  out.uncertainty={source:'causal',se:se!=null?round(se,3):null,
    lo:se!=null?round(ps.ateEstimate-1.96*se,3):null,hi:se!=null?round(ps.ateEstimate+1.96*se,3):null,
    basis:'normal approximation on the weighted effective sample size \u2014 wider than a naive interval, as it should be'};
  stages.push('uncertainty');
  /* sensitivity */
  var ev=eValue(ps.ateEstimate,out.uncertainty.lo,out.uncertainty.hi,{sd:sdY||1});
  out.sensitivity=ev;stages.push('sensitivity');
  return Object.assign({status:'ok',stages:stages,cls:'EMPIRICAL',strategy:strat},out,
    {note:'Every stage ran and passed. The effect is conditional on the identification assumptions, which the data cannot check.'});
}
