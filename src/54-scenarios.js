/* ============================================================================
   REGION: SCENARIOS · PROBABILISTIC FORECASTING · N-OF-1 INFERENCE · EXPERIMENT DESIGN
   Everything here is pure. Nothing mutates the record, and every output states the basis it rests on.
   ============================================================================ */
/* ---------- scenario engine (§52) ----------
   counterfactual() answered "what would this one change do". A scenario compares several complete plans
   against each other over a horizon, under one set of model versions, so the comparison is like for like. */
function buildScenario(name,changes,opts){
  opts=opts||{};
  return {name:name,changes:changes||{},horizonWeeks:opts.horizonWeeks||12,
    constraints:opts.constraints||[],note:opts.note||''};
}
function runScenario(sc){
  var cf=counterfactual(sc.changes);
  var tr=weightTrend(14);
  var band=(typeof targetRate==='function')?targetRate():null;
  var base=tr.status==='ok'?tr.slopePerWeek:null;
  var rate=cf.status==='ok'?cf.projected:base;
  var start=weightAverages().avg7||currentWeight().value;
  /* The interval used to cover only the uncertainty in the CHANGE's effect, never in the underlying trend, so the
     "do nothing" scenario claimed certainty — weight would be exactly 231.7 lb in twelve weeks — and every
     intervention's range was too narrow by the same amount. Trend and effect uncertainty are independent, so
     their variances add. */
  var z=1.96;
  var effSd=(cf.status==='ok'&&cf.lo!=null&&cf.hi!=null)?Math.abs(cf.hi-cf.lo)/(2*z):0;
  var trendSd=(tr.status==='ok'&&tr.slopeSe!=null)?tr.slopeSe:0;
  var rateSd=Math.sqrt(effSd*effSd+trendSd*trendSd);
  var lo=rate!=null?rate-z*rateSd:null,hi=rate!=null?rate+z*rateSd:null;
  /* A straight-line rate held for weeks is extrapolation: the forecast family is only checked to four weeks,
     and a linear trend is biased even there. Past that, the projection is flagged rather than presented plainly. */
  var validatedWeeks=4;
  var out={name:sc.name,changes:sc.changes,horizonWeeks:sc.horizonWeeks,cls:cf.cls,
    ratePerWeek:rate,lo:lo,hi:hi,rateSd:round(rateSd,3),
    uncertaintyParts:{effect:round(effSd,3),trend:round(trendSd,3)},
    parts:cf.parts,basis:cf.status==='ok'?'projected from your own response where known':'insufficient history',
    endWeight:(start!=null&&rate!=null)?round(start+rate*sc.horizonWeeks,1):null,
    endLo:(start!=null&&lo!=null)?round(start+lo*sc.horizonWeeks,1):null,
    endHi:(start!=null&&hi!=null)?round(start+hi*sc.horizonWeeks,1):null,
    startWeight:start,
    extrapolated:sc.horizonWeeks>validatedWeeks,
    horizonNote:sc.horizonWeeks>validatedWeeks?('this projects '+sc.horizonWeeks+' weeks; forecasts here are only checked to '+validatedWeeks+
      ', and a straight-line rate tends to overstate loss as a cut slows, so treat the end weight as indicative'):null};
  /* Feasibility, not just arithmetic: a plan the person will not execute is not a better plan. */
  var burden=0;
  Object.keys(sc.changes).forEach(function(k){
    var d=Math.abs(num(sc.changes[k])||0);
    burden+=k==='calories'?d/150:(k==='steps'?d/2500:(k==='cardio'||k==='training'?d*1.2:d/25));
  });
  out.burden=round(burden,2);
  var ad=adherenceState(14);
  out.adherence=ad.overall!=null?ad.overall:null;
  out.executionLikelihood=out.adherence==null?null:clamp(round((out.adherence/100)*Math.exp(-burden/4),2),0,1);
  out.expectedRate=(out.ratePerWeek!=null&&out.executionLikelihood!=null)?round(out.ratePerWeek*out.executionLikelihood+(base||0)*(1-out.executionLikelihood),3):out.ratePerWeek;
  out.expectedEndWeight=(start!=null&&out.expectedRate!=null)?round(start+out.expectedRate*sc.horizonWeeks,1):null;
  if(band&&out.ratePerWeek!=null&&band.lo!=null)out.withinBand=out.ratePerWeek>=band.lo&&out.ratePerWeek<=band.hi;
  out.constraintsViolated=(sc.constraints||[]).filter(function(c){return typeof c.test==='function'&&!c.test(out);}).map(function(c){return c.label;});
  return out;
}
function compareScenarios(list){
  var rows=list.map(runScenario);
  rows.forEach(function(r){
    r.verdict=r.constraintsViolated.length?'violates a constraint':
      (r.withinBand===false?'outside the rate band this system works within':
      (r.executionLikelihood!=null&&r.executionLikelihood<0.5?'unlikely to be executed as written':'plausible'));
  });
  /* Rank by expected outcome, which already discounts for the probability of actually doing it. */
  rows.sort(function(a,b){
    if(a.constraintsViolated.length!==b.constraintsViolated.length)return a.constraintsViolated.length-b.constraintsViolated.length;
    return (a.expectedRate==null?0:a.expectedRate)-(b.expectedRate==null?0:b.expectedRate);
  });
  return {rows:rows,cls:'PREDICTIVE',
    note:'Ranked by expected outcome, which discounts the projected rate by how likely you are to execute the plan. The best plan on paper and the best plan for you are different questions.'};
}
/* ---------- probabilistic forecasting (§53) ----------
   Interval arithmetic answers "how wide is the uncertainty". A distribution answers "what is the chance I
   reach the goal by the date", which is the question people actually ask. Sampling is deterministic given a
   seed so the same record produces the same answer twice \u2014 a forecast that changes when you reopen the app
   is not a forecast. */
function _mulberry32(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;var t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
function _gaussFrom(rnd){var u=0,v=0;while(u===0)u=rnd();while(v===0)v=rnd();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
function monteCarloForecast(opts){
  opts=opts||{};
  var weeks=opts.weeks||12,draws=opts.draws||2000;
  /* A twelve-week projection must not rest on a fourteen-day slope: the standard error of a short window
     compounds once per projected week and produces intervals wide enough to be useless. Use the longest
     window that is actually established, and say which one was used. */
  var tr=weightTrend(28),window=28;
  if(tr.status!=='ok'||tr.n<20){tr=weightTrend(14);window=14;}
  var u=uncertaintyChain(),pb=personalBaselines();
  if(tr.status!=='ok')return {status:'insufficient',need:tr.need||['more weigh-ins'],cls:'PREDICTIVE'};
  var start=weightAverages().avg7||currentWeight().value;if(start==null)return {status:'insufficient',need:['a current weight'],cls:'PREDICTIVE'};
  /* Three independent sources of spread, each estimated from this record rather than assumed:
     rate uncertainty (the slope standard error), week-to-week variation, and scale noise on the final read. */
  var rateSd=tr.slopeSe!=null?tr.slopeSe*7:Math.abs(tr.slopePerWeek||0.3)*0.4;
  var weekSd=(pb.streams.weight&&pb.streams.weight.status==='ok')?pb.streams.weight.baseline*1.2:0.4;
  var scaleSd=(pb.streams.weight&&pb.streams.weight.status==='ok')?pb.streams.weight.baseline:0.5;
  var rnd=_mulberry32(opts.seed||20260907);
  var ends=[],paths=[];
  for(var i=0;i<draws;i++){
    var rate=tr.slopePerWeek+_gaussFrom(rnd)*rateSd;
    var w=start;
    for(var k=0;k<weeks;k++)w+=rate+_gaussFrom(rnd)*weekSd;
    w+=_gaussFrom(rnd)*scaleSd;
    ends.push(w);
    if(i<40)paths.push(w);
  }
  ends.sort(function(a,b){return a-b;});
  var q=function(p){return ends[Math.min(ends.length-1,Math.max(0,Math.floor(p*ends.length)))];};
  var goal=opts.goalWeight!=null?opts.goalWeight:canonicalGoal().activeTargetLb;
  /* Reaching a goal is defined by where the goal sits RELATIVE TO NOW, not by which way the trend happens to
     point. Keying off the trend sign meant a goal of 180 while weighing 200 and gaining was scored as
     "x >= 180" — true in essentially every draw — and reported as a near-certain success. */
  var goalBelow=(goal!=null&&start!=null)?goal<start:(tr.slopePerWeek<0);
  var reach=goal!=null?ends.filter(function(x){return goalBelow?x<=goal:x>=goal;}).length/ends.length:null;
  /* Moving away from the goal is worth saying outright rather than leaving as a small number. */
  var movingAway=(goal!=null&&start!=null&&tr.status==='ok')&&
    ((goalBelow&&tr.slopePerWeek>0)||(!goalBelow&&tr.slopePerWeek<0));
  return {status:'ok',cls:'PREDICTIVE',model:'monte_carlo_weight',weeks:weeks,draws:draws,start:start,
    median:round(q(0.5),1),p10:round(q(0.1),1),p25:round(q(0.25),1),p75:round(q(0.75),1),p90:round(q(0.9),1),
    goal:goal,probReachGoal:reach!=null?round(reach,2):null,
    goalDirection:goal!=null?(goalBelow?'below your current weight':'above your current weight'):null,
    movingAway:movingAway,
    goalNote:goal==null?null:(movingAway?
      ('Your goal is '+(goalBelow?'below':'above')+' your current weight and the trend is moving the other way, so this probability is what continuing exactly as you are would produce \u2014 not what is achievable if something changes.'):
      null),
    inputs:{ratePerWeek:round(tr.slopePerWeek,3),rateSd:round(rateSd,3),weekSd:round(weekSd,3),scaleSd:round(scaleSd,3),trendWindowDays:window,trendN:tr.n},
    uncertaintyCeiling:u.ceiling,
    note:'Sampled from your own rate uncertainty, week-to-week variation and scale noise. Deterministic for a given record, so it does not change when you reopen it.',
    caveat:'A distribution over what the trend would produce if nothing else changes. It is not a promise, and it cannot know about the things that will change.'};
}
/* ---------- N-of-1 inference (§54) ----------
   The experiment layer compared before with after and looked for confounders. That is a difference, not a
   causal estimate. This adds the three things that make an N-of-1 result defensible: a level shift measured
   against the pre-existing trend rather than the pre-existing mean, a washout so carry-over is not counted
   as effect, and an autocorrelation-aware significance estimate, because daily body-weight data is not
   independent day to day and pretending it is manufactures certainty. */
function _lag1(series){
  if(series.length<4)return 0;
  var m=mean(series),num2=0,den=0;
  for(var i=0;i<series.length;i++){den+=(series[i]-m)*(series[i]-m);if(i)num2+=(series[i]-m)*(series[i-1]-m);}
  return den?clamp(num2/den,-0.95,0.95):0;
}
function interruptedTimeSeries(opts){
  opts=opts||{};
  var type=opts.type||'weight';
  var change=opts.changeDate;if(!change)return {status:'insufficient',need:['a change date']};
  var washout=opts.washoutDays!=null?opts.washoutDays:3,pre,post;
  /* Explicit windows (a Response passes its own before and after, Stage E), or windows around the change date:
     seriesWindow(type, days, asOfDate) returns the window ENDING at asOfDate, so the pre window ends the day before the
     change and the post window ends `postDays` after the washout. */
  if(opts.before&&opts.after){pre=_rangeSeries(type,opts.before[0],opts.before[1]);post=_rangeSeries(type,opts.after[0],opts.after[1]);washout=Math.max(0,daysBetween(change,opts.after[0]));}
  else{pre=seriesWindow(type,opts.preDays||28,addDays(change,-1));
    var postEnd=addDays(change,washout+(opts.postDays||28));
    if(postEnd>todayISO())postEnd=todayISO();
    post=seriesWindow(type,opts.postDays||28,postEnd).filter(function(d){return d.date>=addDays(change,washout);});}
  if(pre.length<10||post.length<10)return {status:'insufficient',
    need:[(pre.length<10?(10-pre.length)+' more days before the change':''),(post.length<10?(10-post.length)+' more days after it':'')].filter(Boolean),cls:'EMPIRICAL'};
  /* Both segments on one axis, days from the change. Each window's own x counts from that window's first day, so the
     first version projected the pre-change fit with the post window's x: it evaluated the old trend at the START of the
     pre window, a month before the change, and the "level shift" was the whole drift across that month \u2014 a steady
     loss read as a clear shift. And the level after the change is the post fit at the boundary, not one reading. */
  var pts=function(S){return S.map(function(d){return {x:daysBetween(change,d.date),y:d.value};});};
  var pp=pts(pre),qp=pts(post);
  var preFit=theilSen(pp),postFit=theilSen(qp);
  /* Counterfactual: project the pre-change trend across the washout to where the post window begins, and compare. */
  var x0=qp[0].x;
  var predicted=preFit.intercept+preFit.slope*x0,observed=postFit.intercept+postFit.slope*x0;
  var levelShift=observed-predicted;
  var slopeChange=(postFit.slope-preFit.slope)*7;
  var rp=pp.map(function(q){return q.y-(preFit.intercept+preFit.slope*q.x);}),rq=qp.map(function(q){return q.y-(postFit.intercept+postFit.slope*q.x);});
  /* lag-1 autocorrelation of the residuals, both segments; never below zero, so the correction only ever widens */
  var rho=Math.max(0,(_lag1(rp)*rp.length+_lag1(rq)*rq.length)/(rp.length+rq.length));
  var sdResid=Math.sqrt((rp.concat(rq)).reduce(function(a,r){return a+r*r;},0)/Math.max(1,rp.length+rq.length-4));
  /* Effective sample size under autocorrelation: n_eff = n * (1-rho)/(1+rho). With rho around 0.7 \u2014 typical
     for daily weight \u2014 this is roughly a fifth of the nominal n, and ignoring it is how people convince
     themselves a two-week change is significant. Every standard error below is inflated by sqrt((1+rho)/(1-rho)),
     the AR(1) variance factor for a slowly varying regressor such as time. */
  var nEff=post.length*(1-rho)/(1+rho),infl=Math.sqrt((1+rho)/(1-rho));
  var seg=function(Q){var xm=mean(Q.map(function(q){return q.x;})),sxx=Q.reduce(function(a,q){return a+(q.x-xm)*(q.x-xm);},0);return {n:Q.length,xm:xm,sxx:sxx||1};};
  var a=seg(pp),b=seg(qp);
  var se=infl*sdResid*Math.sqrt(1/a.n+(x0-a.xm)*(x0-a.xm)/a.sxx+1/b.n+(x0-b.xm)*(x0-b.xm)/b.sxx);
  var seSlope=infl*sdResid*Math.sqrt(1/a.sxx+1/b.sxx)*7;
  var t=se?levelShift/se:null,tSlope=seSlope?slopeChange/seSlope:null,tMax=Math.max(Math.abs(t||0),Math.abs(tSlope||0));
  return {status:'ok',cls:'EMPIRICAL',model:'interrupted_time_series',type:type,changeDate:change,washoutDays:washout,
    preDays:pre.length,postDays:post.length,preSlopePerWeek:round(preFit.slope*7,3),
    postSlopePerWeek:round(postFit.slope*7,3),
    levelShift:round(levelShift,2),levelShiftSe:round(se,2),slopeChangePerWeek:round(slopeChange,3),slopeChangeSe:round(seSlope,3),
    autocorrelation:round(rho,2),effectiveN:round(nEff,1),nominalN:post.length,t:t!=null?round(t,2):null,tSlope:tSlope!=null?round(tSlope,2):null,
    verdict:t==null?'not estimable':(tMax>2.5?'a clear shift relative to the pre-existing trend':
      (tMax>1.5?'a shift larger than the noise, but not decisively':'indistinguishable from the trend that was already there')),
    note:'Compared against the projected pre-change trend, not the pre-change average, in level and in rate, and discounted for day-to-day autocorrelation ('+
      'effective n '+round(nEff,1)+' from '+post.length+' days).',
    caveat:'A single interrupted series is still observational. It answers whether something changed at that moment, not whether the intervention caused it.'};
}
/* ---------- experiment design (§55, §56) ----------
   Designing an experiment that cannot answer its question is worse than running none, because it produces a
   confident-looking null. This computes the duration needed for the effect the user cares about, given their
   own noise, and refuses to design one that is not feasible. */
function designExperiment(o){
  o=o||{};
  var variable=o.variable||'steps';
  var metric=o.metric||'weight';
  var pb=personalBaselines();
  var noise=(pb.streams.weight&&pb.streams.weight.status==='ok')?pb.streams.weight.baseline*1.2:0.45;
  var resp=responseFor(variable);
  var delta=num(o.delta);
  /* Expected effect: from this person's own response where it exists, otherwise a population prior which is
     labelled as such. */
  var perWeek=null,basis='';
  if(resp&&delta!=null){perWeek=resp.effect*(delta/(RESPONSE_VARS[variable]?RESPONSE_VARS[variable].scale:1));basis='your own measured response ('+resp.n+' observation'+(resp.n===1?'':'s')+')';}
  else if(delta!=null){
    var kcal=variable==='steps'?delta*0.045:(variable==='calories'?-delta:(variable==='cardio'?-delta*250/7:(variable==='training'?-delta*180/7:0)));
    perWeek=-kcalToLb(kcal*7).lb;basis='a population estimate \u2014 you have no measured response for '+variable+' yet';
  }
  /* An effect estimate of zero is not a small effect, it is the absence of an estimate. Computing a
     minimum detectable difference from it produces "detecting 0.0 lb/wk is not worth running", which blames
     the experiment for a gap in the system's own knowledge. */
  if(o.minimumDetectable==null&&(perWeek==null||Math.abs(perWeek)<1e-6))
    return {status:'insufficient',cls:'DERIVED',variable:variable,metric:metric,
      need:['a measured response for '+variable+', or a stated effect size you would care about'],
      why:'There is no estimate of what changing '+variable+' would do'+
        (metric!=='weight'?(' to '+((OBS_TYPES[metric]||{}).label||metric).toLowerCase()):'')+
        ', so the duration needed to detect it cannot be derived.',
      note:'A duration computed from an effect of zero would be arithmetic, not a design.',
      personalNoise:round(noise,2),
      suggestion:'State the smallest change you would act on, and the design follows from that.'};
  var mde=o.minimumDetectable!=null?Math.abs(o.minimumDetectable):Math.abs(perWeek)*0.7;
  /* Weeks needed so the standard error of the weekly trend is small enough for the effect to clear it.
     SE of a trend over n daily points falls roughly with n^1.5 for a slope, so this is deliberately
     conservative: it uses the weekly-mean SE, which is the estimator the app actually reports. */
  var weeksNeeded=null;
  if(mde>0){
    var perWeekSd=noise*Math.sqrt(7)/7;
    weeksNeeded=Math.ceil(2*Math.pow(2.5*perWeekSd/mde,2));
    weeksNeeded=Math.max(2,Math.min(26,weeksNeeded));
  }
  var days=weeksNeeded!=null?weeksNeeded*7:null;
  var feasible=days!=null&&days<=90;
  var confounders=[];
  try{
    (DB.interventions||[]).forEach(function(i){if(daysBetween(i.date,todayISO())<=14)confounders.push('a change to '+i.variable+' '+ageLabel(i.date));});
    var ph=activePhase();if(ph&&daysBetween(ph.startDate,todayISO())<=14)confounders.push('this phase started '+ageLabel(ph.startDate));
    protocolChanges(21).forEach(function(p){confounders.push(p.text);});
  }catch(e){_q(e);}
  return {status:'ok',cls:'DERIVED',variable:variable,metric:metric,delta:delta,
    expectedEffectPerWeek:perWeek!=null?round(perWeek,3):null,effectBasis:basis,
    personalNoise:round(noise,2),minimumDetectable:round(mde,3),
    weeksNeeded:weeksNeeded,durationDays:days,washoutDays:3,measurementCadence:'daily weigh-ins; a missed day widens everything downstream',
    startAfter:confounders.length?'wait for the current changes to settle':'now',
    confounders:confounders,feasible:feasible,
    successCriterion:perWeek!=null?('trend changes by at least '+fmtRate(mde)+' in the predicted direction'):'no numeric prediction is possible without an effect estimate',
    recheckDate:days?addDays(todayISO(),days):null,
    /* Two decimals, because the figure that matters here is often a twentieth of a pound and rounding it to
       "0.0" makes a correct verdict read like a bug. */
    verdict:!feasible?('Not worth running: the expected effect is about '+fmtNum(mde,2)+' lb/week, which your own day-to-day noise of '+fmtWeight(noise)+' would hide. Either accept a larger change or measure something less noisy.'):
      (confounders.length>=2?'Runnable, but two or more things are already moving; the result will be confounded unless you wait.':'Runnable as designed.'),
    note:'Duration is derived from your own measurement noise, not a rule of thumb. An experiment too short to detect the effect it is looking for produces a confident-looking null.'};
}
function powerCurve(variable,delta){
  var d=designExperiment({variable:variable,delta:delta});
  if(d.status!=='ok')return d;
  var rows=[];
  for(var w=2;w<=12;w+=2){
    var perWeekSd=d.personalNoise*Math.sqrt(7)/7;
    var se=perWeekSd*Math.sqrt(2/w);
    var detectable=2.5*se;
    rows.push({weeks:w,detectable:round(detectable,3),
      detectsExpected:d.expectedEffectPerWeek!=null&&Math.abs(d.expectedEffectPerWeek)>=detectable});
  }
  return {rows:rows,expected:d.expectedEffectPerWeek,noise:d.personalNoise,cls:'DERIVED',
    note:'What size of weekly change each duration can distinguish from your own noise.'};
}
