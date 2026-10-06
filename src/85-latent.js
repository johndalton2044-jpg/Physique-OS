/* ============================================================================
   REGION: LATENT STATES (Work.md)

   Work.md asks repeatedly for the same structural change: quantities the app currently DERIVES on demand
   should be carried as latent states that persist, update on new evidence, and decay when evidence stops
   arriving. A derivation answers "what does the last fortnight imply"; a latent state answers "what do I
   believe now, how confident am I, and when did I last learn anything".

   The estimator used throughout is a one-dimensional Kalman-style update, which is the simplest thing that
   does the job honestly: a belief with a variance, a process noise saying how fast the truth can really move,
   and an observation noise saying how much to trust each new reading. Two consequences worth stating:

     * A noisy observation moves the belief less than a clean one. That is the point.
     * With no observations the variance GROWS, so confidence decays with silence rather than persisting.
       A state that stays confident while nothing arrives is the failure mode being avoided here.

   Nothing here claims to measure a physiological quantity. Each state says what it is inferred from and what
   would change it.
   ============================================================================ */

/* ---------------- the shared estimator ---------------- */
function latentUpdate(prior,obs,opts){
  opts=opts||{};
  var processVar=opts.processVar!=null?opts.processVar:0.02;   // how fast the truth can move per day
  var obsVar=opts.obsVar!=null?opts.obsVar:1;
  var gapDays=opts.gapDays!=null?opts.gapDays:1;
  if(prior==null||prior.mean==null)
    return {mean:obs,variance:obsVar,updates:1,lastAt:opts.at||null,
      note:'first observation, so the belief is the observation'};
  /* Predict: uncertainty grows with elapsed time whether or not anything was observed. */
  var pv=prior.variance+processVar*Math.max(0,gapDays);
  if(obs==null)return {mean:prior.mean,variance:pv,updates:prior.updates||0,lastAt:prior.lastAt,
    note:'no observation, so the belief is unchanged and less certain'};
  /* Correct: the gain is the share of total uncertainty that belongs to the prior. */
  var k=pv/(pv+obsVar);
  return {mean:prior.mean+k*(obs-prior.mean),variance:(1-k)*pv,
    gain:round(k,3),updates:(prior.updates||0)+1,lastAt:opts.at||prior.lastAt,
    note:'moved '+Math.round(k*100)+'% of the way to the new observation, which is what its noise justifies'};
}
function latentFrom(series,opts){
  opts=opts||{};
  if(!series||!series.length)return {status:'insufficient',need:['observations to learn from']};
  var st=null,prev=null;
  series.forEach(function(p){
    var gap=prev?Math.max(1,daysBetween(prev,p.date)):1;
    st=latentUpdate(st,p.value,{processVar:opts.processVar,obsVar:opts.obsVar,gapDays:gap,at:p.date});
    prev=p.date;
  });
  /* Decay to today: silence costs confidence. */
  var silent=prev?daysBetween(prev,asOf()):0;
  if(silent>0)st=latentUpdate(st,null,{processVar:opts.processVar,gapDays:silent});
  var sd2=Math.sqrt(st.variance);
  return {status:'ok',mean:round(st.mean,3),sd:round(sd2,3),
    lo:round(st.mean-1.96*sd2,3),hi:round(st.mean+1.96*sd2,3),
    updates:st.updates,lastObserved:prev,silentDays:silent,
    confidence:silent>21?'very low':(st.updates>=8&&sd2<Math.abs(st.mean||1)*0.3?'medium':'low'),
    note:'A belief updated by each observation in proportion to how noisy it is, and widened by every day since the last one.'};
}
/* ---------------- cardio fitness as a latent state ----------------
   Work.md: cardio fitness is missing as a longitudinal latent state. The proxy available here is
   heart-rate recovery or resting heart rate against training volume \u2014 imperfect, and named as such. */
function cardioFitnessState(){
  var rhr=seriesWindow('rhr',180);
  if(rhr.length<6)return {status:'insufficient',need:[(6-rhr.length)+' more resting heart rate readings'],
    note:'Resting heart rate is the only aerobic proxy this record holds. Without it there is nothing to carry as a fitness state \u2014 cardio minutes are a dose, not a capacity.'};
  /* Lower resting heart rate is taken as better fitness, so the state is inverted for readability. */
  var lat=latentFrom(rhr.map(function(d){return {date:d.date,value:-d.value};}),
    {processVar:0.015,obsVar:9});
  if(lat.status!=='ok')return lat;
  var first=rhr[0].value,last=rhr[rhr.length-1].value;
  return {status:'ok',cls:'EMPIRICAL',
    index:round(-lat.mean,1),lo:round(-lat.hi,1),hi:round(-lat.lo,1),
    unit:'bpm resting',
    direction:(last<first-1)?'improving':((last>first+1)?'declining':'unchanged'),
    updates:lat.updates,lastObserved:lat.lastObserved,silentDays:lat.silentDays,
    confidence:lat.confidence,
    note:'Resting heart rate carried as a state rather than read off the last measurement, so a single high morning does not move it much and three weeks of silence widens it.',
    caveat:'Resting heart rate is a weak proxy for aerobic fitness. It moves with sleep, illness, caffeine, stress and measurement position, and this record holds no heart-rate-recovery or pace data that would pin it down properly.'};
}
/* ---------------- conditioning capacity, separated from fitness ----------------
   Work.md is explicit that these are different states. Fitness is aerobic; capacity is what you can repeat. */
function conditioningCapacityState(){
  var c=null;try{c=conditioningState(90);}catch(e){}
  if(!c||c.status!=='ok')return {status:'insufficient',
    need:['circuit or interval work recorded over several weeks'],
    note:'Capacity is what you can repeat. Steady aerobic work does not measure it, which is why this is a separate state from cardio fitness.'};
  var pts=[];
  sessionsOf({from:addDays(asOf(),-90)}).forEach(function(s){
    var dense=(s.sets||[]).filter(function(st){
      var k=setKind(st);return k==='superset'||k==='giant'||k==='cluster'||k==='restPause'||k==='endurance';}).length;
    if(dense&&s.durationMin)pts.push({date:s.date,value:dense/s.durationMin*60});
  });
  if(pts.length<4)return {status:'insufficient',need:[(4-pts.length)+' more sessions containing circuit or interval work'],
    note:'Density needs a handful of comparable sessions before it means anything.'};
  var lat=latentFrom(pts,{processVar:0.05,obsVar:4});
  return {status:'ok',cls:'EMPIRICAL',
    density:round(lat.mean,1),lo:round(lat.lo,1),hi:round(lat.hi,1),unit:'sets per hour',
    updates:lat.updates,silentDays:lat.silentDays,confidence:lat.confidence,
    note:'Work capacity carried separately from aerobic fitness, because they are different things that respond to different training and the same person can have one without the other.',
    caveat:'Density is a crude proxy: a session can be dense because you rushed it rather than because you recovered faster between efforts.'};
}
/* ---------------- lean mass, longitudinally ----------------
   Work.md: lean mass is not really modeled longitudinally. With measured composition it can be. */
function leanMassState(){
  var bf=obsOf('bodyfat');
  var pts=[];
  bf.forEach(function(o){
    var w=null;
    var near=obsOf('weight').filter(function(x){return Math.abs(daysBetween(x.date,o.date))<=3;});
    if(near.length)w=mean(near.map(function(x){return x.value;}));
    if(w!=null&&o.value!=null)pts.push({date:o.date,value:round(w*(1-o.value/100),2),method:o.method||'unspecified'});
  });
  if(pts.length<2)return {status:'insufficient',
    need:[(2-pts.length)+' more measured body-fat readings paired with a weigh-in'],
    note:'Lean mass is weight times one minus body fat, so it needs a measured composition reading and a weight within a few days of it. A circumference estimate is not enough \u2014 its own error is larger than the change being tracked.'};
  /* Methods are not interchangeable, so mixing them inflates the observation noise honestly. */
  var methods=[];pts.forEach(function(p){if(methods.indexOf(p.method)<0)methods.push(p.method);});
  var obsVar=methods.length>1?9:4;
  var lat=latentFrom(pts,{processVar:0.01,obsVar:obsVar});
  var change=pts.length>1?round(pts[pts.length-1].value-pts[0].value,1):null;
  return {status:'ok',cls:'MEASURED',
    lean:round(lat.mean,1),lo:round(lat.lo,1),hi:round(lat.hi,1),unit:'lb',
    readings:pts.length,methods:methods,change:change,
    spanDays:daysBetween(pts[0].date,pts[pts.length-1].date),
    updates:lat.updates,silentDays:lat.silentDays,confidence:lat.confidence,
    note:'Lean mass as a belief updated by each paired reading rather than recomputed from the last one, so one odd scan does not look like a change in you.',
    caveat:methods.length>1?
      ('Readings come from '+methods.length+' methods, which are not interchangeable \u2014 the interval is widened to reflect that rather than pretending they agree.'):
      'A single method throughout, which is the only way this comparison holds. The interval is still wide: lean mass changes slowly and is measured badly.'};
}
/* ---------------- water and glycogen as a latent state ----------------
   Work.md: water/glycogen is a classifier rather than a latent state. Carried now, with the honest limit
   that it is inferred from the residual between weight movement and energy balance. */
function waterGlycogenState(){
  var w=seriesWindow('weight',28);
  if(w.length<10)return {status:'insufficient',need:[(10-w.length)+' more weigh-ins'],
    note:'This is inferred from the part of your weight movement that energy balance cannot explain, so it needs a dense run of weigh-ins.'};
  var eb=null;try{eb=energyBalance();}catch(e){}
  var tr=null;try{tr=weightTrend(14);}catch(e){}
  if(!eb||eb.status!=='ok'||!tr||tr.status!=='ok')
    return {status:'insufficient',need:['an energy balance and an established trend'],
      note:'Without both there is no residual to attribute.'};
  /* Expected weight change from energy balance, against observed. The gap is water, glycogen, gut content
     and error, and it is NOT separable into those here. */
  var expected=kcalToLb(eb.balance*7).lb;
  var residual=tr.slopePerWeek-expected;
  var pts=w.slice(-14).map(function(d,i,arr){
    return {date:d.date,value:i>0?(d.value-arr[i-1].value):0};});
  var lat=latentFrom(pts.slice(1),{processVar:0.3,obsVar:1.2});
  return {status:'ok',cls:'DERIVED',
    residualPerWeek:round(residual,2),
    expectedFromEnergy:round(expected,2),observed:round(tr.slopePerWeek,2),
    dailyVolatility:round(Math.abs(lat.mean||0)+lat.sd,2),
    confidence:'low',
    interpretation:Math.abs(residual)<0.4?'weight movement is roughly what energy balance predicts':
      (residual>0?'you are losing less than energy balance predicts, which is often water or under-reported intake':
        'you are losing more than energy balance predicts, which is often water or over-reported intake'),
    note:'The part of your weight movement that energy balance does not explain, carried as a state rather than recomputed each day.',
    caveat:'This residual bundles water, glycogen, gut content, logging error and formula error together, and nothing in this record separates them. Reading it as "water weight" specifically would be an invention \u2014 under-reported intake produces exactly the same signal.'};
}
/* ---------------- adaptive thermogenesis ----------------
   Work.md: adaptive thermogenesis is not really modeled. The honest version compares measured maintenance
   against what body mass alone predicts, over time. */
function adaptiveThermogenesis(){
  var t=null;try{t=tdeePersonal();}catch(e){}
  var p=null;try{p=bmrPrior();}catch(e){}
  if(!t||t.status!=='ok'||!p||p.status!=='ok')
    return {status:'insufficient',need:['a personal maintenance estimate and the profile it needs'],
      note:'Adaptive thermogenesis is the gap between measured maintenance and what your mass predicts. Both sides have to exist.'};
  var ph=activePhase()||{};
  var weeks=ph.startDate?round(daysBetween(ph.startDate,asOf())/7,1):null;
  /* An activity multiplier of roughly 1.5 is the population expectation for a moderately active person. */
  var predicted=p.bmr*1.5;
  var gap=t.value-predicted;
  var gapPct=round(100*gap/predicted,1);
  return {status:'ok',cls:'DERIVED',
    measured:Math.round(t.value),predictedFromMass:Math.round(predicted),
    gap:Math.round(gap),gapPercent:gapPct,
    phaseWeeks:weeks,
    interpretation:gapPct<-12?'measured maintenance sits well below what your mass predicts, which is consistent with adaptation \u2014 and equally consistent with under-reported intake':
      (gapPct<-5?'measured maintenance sits somewhat below prediction':
        (gapPct>8?'measured maintenance sits above prediction, which usually means activity higher than the multiplier assumes':
          'measured and predicted maintenance agree within the noise')),
    confidence:'low',
    note:'The gap between what your maintenance measures at and what your body mass alone would predict, tracked across the phase.',
    caveat:'This cannot distinguish metabolic adaptation from under-reported intake or from an activity multiplier that never fitted you. Those three produce an identical signal, and only a controlled refeed would separate them.'};
}
/* ---------------- NEAT compensation, modelled ----------------
   Work.md: detected but not deeply modeled, and asks specifically for lag and individual effect size. */
function neatCompensation(opts){
  opts=opts||{};
  var days=opts.days||90;
  var steps=seriesWindow('steps',days);
  var kcal=seriesWindow('calories',days);
  if(steps.length<21)return {status:'insufficient',need:[(21-steps.length)+' more days of steps'],
    note:'Compensation is a relationship over weeks, so it needs weeks of data.'};
  /* Weekly means, so a single quiet day is not mistaken for compensation. */
  var byWeek={};
  steps.forEach(function(d){var k=_weekKey(d.date);(byWeek[k]=byWeek[k]||{s:[],c:[]}).s.push(d.value);});
  kcal.forEach(function(d){var k=_weekKey(d.date);(byWeek[k]=byWeek[k]||{s:[],c:[]}).c.push(d.value);});
  var weeks=Object.keys(byWeek).sort().map(function(k){
    return {week:k,steps:byWeek[k].s.length?mean(byWeek[k].s):null,
      kcal:byWeek[k].c.length?mean(byWeek[k].c):null};
  }).filter(function(x){return x.steps!=null;});
  if(weeks.length<4)return {status:'insufficient',need:[(4-weeks.length)+' more weeks of step data'],
    note:'Four weeks is the minimum before a within-person relationship could appear.'};
  /* Deficit weeks against the earlier baseline: does activity fall as the deficit runs? */
  var half=Math.floor(weeks.length/2);
  var early=mean(weeks.slice(0,half).map(function(x){return x.steps;}));
  var late=mean(weeks.slice(half).map(function(x){return x.steps;}));
  var drift=late-early;
  /* Lag: which week the fall began, relative to the phase start. */
  var ph=activePhase()||{};
  var firstFall=null;
  weeks.forEach(function(x,i){
    if(firstFall==null&&i>0&&x.steps<early-800)firstFall=x.week;});
  var lagWeeks=(firstFall&&ph.startDate)?round(daysBetween(ph.startDate,firstFall)/7,1):null;
  /* Individual effect size, in the units that matter: kcal of expenditure lost per week of phase. */
  var kcalPerWeek=drift<0?round(Math.abs(drift)*0.045,0):0;
  return {status:'ok',cls:'EMPIRICAL',weeks:weeks.length,
    earlyMean:Math.round(early),lateMean:Math.round(late),drift:Math.round(drift),
    compensating:drift<=-800,
    lagWeeks:lagWeeks,
    effectKcalPerDay:kcalPerWeek,
    confidence:weeks.length>=8?'low':'very low',
    interpretation:drift<=-800?
      ('activity has fallen '+Math.abs(Math.round(drift))+' steps/day across the phase, worth roughly '+kcalPerWeek+' kcal/day of expenditure'+
       (lagWeeks!=null?(', beginning about week '+lagWeeks):'')):
      'no meaningful downward drift in activity across the phase',
    note:'Compensation modelled as weekly means across the phase, with the lag before it started and the effect expressed in expenditure rather than steps.',
    caveat:'Unintentional compensation and a deliberate decision to walk less look identical here. The conversion from steps to kcal is a population figure of roughly 0.045 kcal per step and varies with body mass and gait.'};
}
/* ============================================================================
   PERSONAL NEAT RESPONSE (Stage D; TRANSITION item 1). Does this person move less when they eat less? Each week's
   deficit is measured rather than assumed: the energy the weight trend implies (its 14-day slope at the week's end,
   times the tissue's energy density) against what was eaten, as a share of expenditure (intake + deficit). The week's
   mean steps are regressed on that share, per 10 points, with a prior centred on a small decline: spontaneous activity
   falls under energy restriction in controlled studies (Martin et al. 2007, CALERIE), by amounts that vary widely
   between people. Normal-normal posterior; personal weight as elsewhere. Six weeks at least, with deficits that differ
   by 5 points or more (a steady deficit cannot show a response). Limits, stated: steps include deliberate walks, so a
   decision to walk less looks like unplanned compensation; an association across weeks, not proof of cause.
   neatCompensation() above describes the drift within one phase; this is the response it can be predicted from.
   ============================================================================ */
var NEAT_PRIOR={mean:-250,sd:400,source:'spontaneous activity falls under energy restriction, by amounts that vary widely between people (Martin et al. 2007, CALERIE)'};
/* energy per step: the personal response model's population figure, about 0.5 kcal per 1,000 steps per kg (90 kg if unknown) */
function kcalPerStep(){var kg=(typeof _kgNow==='function')?_kgNow():null;return 0.0005*(kg||90);}
function _neatWeeks(days){
  days=days||182;var end=asOf(),by={};
  var add=function(type,key){dailySeries(type,end,days).forEach(function(d){var k=_weekKey(d.date),w=by[k]=by[k]||{s:[],c:[],last:d.date};w[key].push(d.value);if(d.date>w.last)w.last=d.date;});};
  add('steps','s');add('calories','c');
  var kcalLb=tissueKcalPerLb();
  return Object.keys(by).sort().map(function(k){var w=by[k];if(w.s.length<4||w.c.length<4)return null;
    var tr=weightTrend(14,w.last);if(!tr||tr.status!=='ok')return null;
    var intake=mean(w.c),deficit=-tr.slopePerWeek/7*kcalLb,expend=intake+deficit;if(!(expend>0))return null;
    return {week:k,steps:mean(w.s),deficitPct:100*deficit/expend};}).filter(Boolean);
}
function personalNeatResponse(weeks){
  weeks=weeks||_neatWeeks();
  if(weeks.length<6)return {status:'insufficient',need:'6 weeks with steps, intake and a weight trend',n:weeks.length};
  var xs=weeks.map(function(w){return w.deficitPct/10;}),ys=weeks.map(function(w){return w.steps;});
  if((Math.max.apply(null,xs)-Math.min.apply(null,xs))*10<5)return {status:'insufficient',need:'weeks whose deficits differ by 5 points of expenditure or more',n:weeks.length};
  var mx=mean(xs),my=mean(ys),sxx=0,sxy=0;xs.forEach(function(x,i){sxx+=(x-mx)*(x-mx);sxy+=(x-mx)*(ys[i]-my);});
  var b=sxy/sxx,res=0;xs.forEach(function(x,i){var e=ys[i]-my-b*(x-mx);res+=e*e;});var se=Math.sqrt(res/(xs.length-2)/sxx)||1e-6;
  var pv=NEAT_PRIOR.sd*NEAT_PRIOR.sd,vp=1/(1/pv+1/(se*se)),mp=vp*(NEAT_PRIOR.mean/pv+b/(se*se)),pw=Math.max(0,Math.min(1,1-vp/pv));
  var sdp=Math.sqrt(vp),lo=mp-2*sdp,hi=mp+2*sdp,kps=kcalPerStep();
  return {status:'ok',cls:'EMPIRICAL',perTenPct:Math.round(mp),sd:Math.round(sdp),interval:[Math.round(lo),Math.round(hi)],personalWeight:round(pw,2),n:weeks.length,
    kcalPerStep:round(kps,4),kcalPerTenPct:Math.round(mp*kps),weeks:weeks,prior:NEAT_PRIOR,
    reading:pw<0.2?('not enough of your own data yet; the population evidence is used ('+NEAT_PRIOR.source+')'):
      (hi<0?('your steps fall about '+Math.round(-mp)+' a day for each 10% deficit'):(lo>0?('your steps rise about '+Math.round(mp)+' a day for each 10% deficit'):'no clear change in your steps with the size of the deficit')),
    limits:'steps include deliberate walks, so a decision to walk less looks like unplanned compensation; an association across weeks, not proof of cause'};
}
/* The expected change in everyday movement when the deficit deepens by deficitKcal a day: steps, the energy they carry
   (negative = less expenditure) and its sd, from the person's response, or the population prior while there is none. */
function neatOffset(deficitKcal){
  if(!deficitKcal)return null;
  var t=(typeof tdeeEstimate==='function')?tdeeEstimate():null;if(!t||t.status!=='ok'||!(t.value>0))return null;
  var R=memo('pneat:'+todayISO(),function(){return personalNeatResponse();}),own=R.status==='ok';
  var per=own?R.perTenPct:NEAT_PRIOR.mean,sdPer=own?R.sd:NEAT_PRIOR.sd,units=100*deficitKcal/t.value/10,kps=kcalPerStep();
  return {steps:Math.round(per*units),kcal:Math.round(per*units*kps),sdKcal:Math.round(Math.abs(sdPer*units*kps)),personalWeight:own?R.personalWeight:0,
    basis:own&&R.personalWeight>=0.2?('your NEAT response, '+R.perTenPct.toLocaleString()+' steps a day per 10% deficit, '+Math.round(R.personalWeight*100)+'% your own data'+
      (R.interval[0]<0&&R.interval[1]>0?'; its interval includes no change':'')):('the population prior: '+NEAT_PRIOR.source)};
}
(function(){if(typeof MODELS==='undefined'||MODELS.some(function(m){return m.id==='personal_neat_response';}))return;
  MODELS.push({id:'personal_neat_response',name:'Personal NEAT response',cls:'EMPIRICAL',version:'1.0',inputs:['steps','calories','weight_trend'],minN:6,
    assumes:['the deficit the weight trend implies is the deficit eaten into','a week\u2019s steps respond to that week\u2019s deficit','the relationship is roughly linear across the deficits seen'],
    failsWhen:['a deficit that hardly changes between weeks','deliberate changes in walking that track the diet','water shifts large enough to distort a week\u2019s trend'],
    output:'the change in everyday steps a day for each 10% of expenditure in deficit, with its interval and how much is the person\u2019s own data',
    consumers:['energyBalance','unifiedOptimiser','physiologySummary'],freshnessDays:14,uncertainty:{kind:'posterior interval on the slope'},fn:'personalNeatResponse'});})();
/* ---------------- circadian context ----------------
   Work.md names this. What the record can support is time-of-day consistency, not a phase estimate. */
function circadianContext(){
  var obs=obsOf('weight').filter(function(o){return o.createdAt;});
  if(obs.length<10)return {status:'insufficient',need:['more weigh-ins with timestamps'],
    note:'Time-of-day consistency needs timestamps, not just dates.'};
  var hours=obs.map(function(o){return new Date(o.createdAt).getUTCHours();});
  var m=mean(hours),s=sd(hours)||0;
  var sleepSeries=seriesWindow('sleep',28);
  return {status:'ok',cls:'MEASURED',
    meanHour:round(m,1),spreadHours:round(s,1),
    consistent:s<=1.5,
    readings:obs.length,
    sleepMean:sleepSeries.length?round(mean(sleepSeries.map(function(d){return d.value;})),1):null,
    interpretation:s<=1.5?'you weigh in at a consistent time, which removes a large source of day-to-day variation':
      ('your weigh-in time varies by about '+round(s,1)+' hours, which adds noise that looks like weight change'),
    note:'Time-of-day consistency of your measurements, which is the part of circadian context that actually affects the numbers here.',
    caveat:'This is about measurement timing, not about your circadian phase. Nothing in this record could estimate the latter, and a system claiming to would be guessing.'};
}
/* ---------------- performance normalisation ----------------
   Work.md names it: compare performance against the state it was produced in, not raw. */
function normalisedPerformance(exercise){
  var rows=[];
  sessionsOf({from:addDays(asOf(),-90)}).forEach(function(s){
    (s.sets||[]).forEach(function(st){
      if(st.exercise!==exercise||!st.load||!st.reps)return;
      if(!SET_KINDS[setKind(st)].volume)return;
      var e=e1rmFrom(st.load,st.reps,st.rir);
      if(e==null)return;
      /* The state the set was produced in: readiness and bodyweight on that day. */
      var rd=null;try{rd=withAsOf(s.date,function(){return readinessState();});}catch(err){}
      var w=null;try{w=withAsOf(s.date,function(){return currentWeight().value;});}catch(err){}
      rows.push({date:s.date,e1rm:e,readiness:rd&&rd.status==='ok'?rd.score:null,weight:w});
    });
  });
  if(rows.length<6)return {status:'insufficient',need:[(6-rows.length)+' more working sets of '+exercise]};
  var withR=rows.filter(function(r){return r.readiness!=null;});
  var adj=null;
  if(withR.length>=6){
    /* Remove the part of performance that tracks readiness, so what is left is closer to real change. */
    var mr=mean(withR.map(function(r){return r.readiness;}));
    var me=mean(withR.map(function(r){return r.e1rm;}));
    var cov=mean(withR.map(function(r){return (r.readiness-mr)*(r.e1rm-me);}));
    var vr=mean(withR.map(function(r){return Math.pow(r.readiness-mr,2);}));
    var beta=vr?cov/vr:0;
    adj=withR.map(function(r){return {date:r.date,raw:round(r.e1rm,1),
      normalised:round(r.e1rm-beta*(r.readiness-mr),1),readiness:r.readiness};});
    var rawTrend=theilSen(withR.map(function(r,i){return {x:i,y:r.e1rm};}));
    var normTrend=theilSen(adj.map(function(r,i){return {x:i,y:r.normalised};}));
    return {status:'ok',cls:'DERIVED',exercise:exercise,sets:rows.length,
      readinessCoefficient:round(beta,2),
      rawSlope:rawTrend.slope!=null?round(rawTrend.slope,2):null,
      normalisedSlope:normTrend.slope!=null?round(normTrend.slope,2):null,
      rows:adj.slice(-8),
      interpretation:(rawTrend.slope!=null&&normTrend.slope!=null)?
        (Math.abs(normTrend.slope)<Math.abs(rawTrend.slope)*0.7?
          'a good part of the apparent trend tracks how you felt rather than what you can do':
          'the trend survives adjusting for readiness, which makes it more likely to be real'):null,
      note:'Performance adjusted for the state it was produced in. A lift that looks flat across a fortnight of poor sleep may be holding up better than it appears.',
      caveat:'The adjustment assumes readiness affects performance linearly and that the relationship is causal in that direction. Neither is established, and a person who trains harder when they feel good produces the same correlation.'};
  }
  return {status:'partial',exercise:exercise,sets:rows.length,
    need:['readiness ratings on the days you trained'],
    note:'Without readiness on training days, performance cannot be separated from the state it was produced in.'};
}
/* ---------------- generalised distributed-lag engine ----------------
   Work.md: no generalised distributed-lag engine. One is useful because almost every question here is
   "does X today affect Y in a few days", and each domain was implementing its own one-day version. */
function distributedLag(causeType,effectType,opts){
  opts=opts||{};
  var days=opts.days||120;
  var maxLag=opts.maxLag||5;
  var a=seriesWindow(causeType,days),b=seriesWindow(effectType,days);
  if(a.length<20||b.length<20)return {status:'insufficient',
    need:['at least 20 days of both '+((OBS_TYPES[causeType]||{}).label||causeType)+' and '+
      ((OBS_TYPES[effectType]||{}).label||effectType)]};
  var byB={};b.forEach(function(d){byB[d.date]=d.value;});
  var rows=[];
  for(var lag=0;lag<=maxLag;lag++){
    var pairs=[];
    a.forEach(function(d){
      var v=byB[addDays(d.date,lag)];
      if(v!=null)pairs.push([d.value,v]);
    });
    if(pairs.length<12){rows.push({lag:lag,n:pairs.length,r:null,note:'too few pairs'});continue;}
    var ma=mean(pairs.map(function(p){return p[0];})),mb=mean(pairs.map(function(p){return p[1];}));
    var cov=mean(pairs.map(function(p){return (p[0]-ma)*(p[1]-mb);}));
    var sa=sd(pairs.map(function(p){return p[0];}))||0,sb=sd(pairs.map(function(p){return p[1];}))||0;
    var r=(sa&&sb)?cov/(sa*sb):null;
    /* Autocorrelation correction, same as change detection: consecutive days are not independent. */
    var rho=lag1Autocorrelation(pairs.map(function(p){return p[1];}));
    var nEff=effectiveN(pairs.length,rho);
    var t=(r!=null&&nEff>2)?r*Math.sqrt((nEff-2)/Math.max(1e-6,1-r*r)):null;
    rows.push({lag:lag,n:pairs.length,effectiveN:round(nEff,1),
      r:r!=null?round(r,2):null,t:t!=null?round(t,2):null,
      survives:t!=null&&Math.abs(t)>=2});
  }
  var best=rows.filter(function(x){return x.survives;}).sort(function(x,y){return Math.abs(y.r)-Math.abs(x.r);})[0];
  return {status:'ok',cls:'EMPIRICAL',cause:causeType,effect:effectType,rows:rows,
    best:best||null,maxLag:maxLag,
    verdict:best?('the strongest surviving relationship is at a lag of '+best.lag+' day(s), r='+best.r):
      'no lag in this window shows a relationship that survives correction for autocorrelation',
    note:'One engine for "does X today show up in Y a few days later", correlated at every lag and corrected for the fact that consecutive days are not independent observations.',
    caveat:'Correlation at a lag is not causation at a lag. Testing several lags also means several chances to find something by accident, which is why the threshold is two rather than 1.2 and why a surviving result is a reason to run an experiment rather than a conclusion.'};
}
/* ---------------- nutrient absorption and utilisation ----------------
   Work.md asks for it. What is honest here is narrow: state that logged intake is not absorbed intake, and
   quantify the one part the record can speak to. */
function absorptionContext(){
  var logs=_liveFoodLogs().filter(function(l){return l.date>=addDays(asOf(),-28);});
  if(!logs.length)return {status:'insufficient',need:['food logged']};
  var fiber=0,protein=0,kcal=0;
  logs.forEach(function(l){
    var n=l.nutrients||{};
    fiber+=n.fiber||0;protein+=n.protein||0;kcal+=n.kcal||0;});
  /* Divide by the number of distinct days that were actually logged. The first version divided by
     daysBetween(logs[0].date, today)+1, assuming oldest-first order; the logs are newest-first, so the divisor
     was 1 and three days of meals were reported as one day's intake — 7,681 kcal and 582 g of protein "per
     day" for someone eating about 2,400 and 190. Dividing by the calendar span instead would count unlogged
     days as zero intake, which is the same error in the other direction. */
  var distinct={};logs.forEach(function(l){distinct[l.date]=1;});
  var days=Math.max(1,Object.keys(distinct).length);
  return {status:'ok',cls:'PRIOR',loggedDays:days,
    fiberPerDay:round(fiber/days,1),proteinPerDay:round(protein/days,0),kcalPerDay:round(kcal/days,0),
    /* The published figures, applied as a range rather than a correction. */
    atwaterNote:'Calorie values on labels come from Atwater factors, which overstate available energy from high-fibre and whole foods by a few percent.',
    fiberEffect:fiber/days>=30?'a high fibre intake, where the overstatement is largest':
      (fiber/days>=20?'a moderate fibre intake':'a low fibre intake, where label values are closest to available energy'),
    plausibleRange:{lo:Math.round(kcal/days*0.92),hi:Math.round(kcal/days*1.0)},
    note:'Logged intake is not absorbed intake. The gap is small, systematic, and larger on a high-fibre whole-food diet than on a processed one.',
    caveat:'No correction is applied, because the per-person size of this gap is unmeasurable here and applying a population adjustment would swap a known bias for an unknown one. The range is shown so the bias is visible instead of hidden. Protein utilisation, amino acid profile and micronutrient absorption are entirely outside what this record can address.'};
}

/* ============================================================================
   \u00a715: RECOVERY AS A LATENT STATE
   Three recovery measures existed \u2014 readinessState, unifiedRecovery, recoveryState \u2014 and the model registry's
   "recovery" pointed at the first. All of them z-scored each self-report and averaged: the reports WERE the
   score. The direction is explicit that subjective reports are observations, not ground truth, and that
   recovery is a latent state estimated from stressors, carried forward in time, with uncertainty and a
   forecast. None of the three had a forecast.

     observations \u2192 stressor state \u2192 recovery model \u2192 latent recovery \u2192 uncertainty \u2192 forecast

   A one-dimensional Kalman filter, the same machinery the other latent states here use. Recovery R is 0 at
   your own baseline, positive when recovered. Each day it decays toward baseline and is pushed down by that
   day's stressors; each report is a NOISY reading of R, with its noise measured from its own scatter. A report
   moves the estimate in proportion to how reliable it has proven, so one bad night's answer cannot redefine
   the state. The two composites remain, correctly described as summaries of observations.
   ============================================================================ */
var RECOVERY_STREAMS={
  /* sign: +1 when a higher value means better recovered */
  sleep:{sign:1,kind:'objective',label:'Sleep duration'},
  sleepq:{sign:1,kind:'subjective',label:'Sleep quality'},
  fatigue:{sign:-1,kind:'subjective',label:'Fatigue'},
  soreness:{sign:-1,kind:'subjective',label:'Soreness'},
  stress:{sign:-1,kind:'subjective',label:'Stress'}
};
/* Declared, not fitted: too few days to estimate these without overfitting. They are named so they can be
   argued with, and the sensitivity of the result to them is reported. */
var RECOVERY_PROCESS={phi:0.7,loadEffect:0.35,sleepDebtEffect:0.25,processVar:0.15};
/* TRAINING LOAD. Session-RPE — how hard the session felt (1–10) times how long it lasted, in arbitrary units — is the
   standard measure, and it captures what set counts cannot: a long grinding session and a short easy one with the same
   sets. Sessions logged before ratings existed have no rating; dropping them would understate load and mixing units
   would be wrong. So once three or more sessions carry both a rating and hard sets, this person's own load per hard set
   is learned from them (a ratio estimate) and fills the unrated days, and how much was filled is reported. With fewer
   rated sessions the model stays on hard sets, and says so. */
function _dailyLoad(from,to){
  var S=(DB.sessions||[]).filter(function(s){return !s.retracted&&s.date>=from&&s.date<=to;});
  var hardOf=function(s){return (s.sets||[]).filter(function(st){return st.rir==null||st.rir<=3;}).length;};
  var srpeOf=function(s){return (s.effort!=null&&s.durationMin!=null&&s.durationMin>0)?s.effort*s.durationMin:null;};
  var both=S.filter(function(s){return srpeOf(s)!=null&&hardOf(s)>0;});
  var by={};
  if(both.length<3){
    S.forEach(function(s){by[s.date]=(by[s.date]||0)+hardOf(s);});
    return {by:by,unit:'hard sets',basis:'hard sets per day',rated:both.length,filled:0,
      note:both.length?('only '+both.length+' session'+(both.length===1?'':'s')+' rated so far — three are needed before effort × duration can be used'):'no sessions rated yet, so load is counted in hard sets'};
  }
  var k=both.reduce(function(a,s){return a+srpeOf(s);},0)/both.reduce(function(a,s){return a+hardOf(s);},0);
  var filled=0,total=0;
  S.forEach(function(s){var v=srpeOf(s);if(v==null){v=hardOf(s)*k;if(v>0)filled++;}total++;by[s.date]=(by[s.date]||0)+v;});
  return {by:by,unit:'load units',basis:'effort × duration (session-RPE)',rated:S.length-filled,filled:filled,perHardSet:round(k,1),
    note:filled?(filled+' of '+total+' sessions had no rating and were estimated at '+round(k,1)+' load units per hard set, learned from your rated sessions'):'every session in the window is rated'};
}
function _dailyHardSets(from,to){
  var by={};
  (DB.sessions||[]).forEach(function(s){
    if(s.date<from||s.date>to)return;
    var n=(s.sets||[]).filter(function(st){return st.rir==null||st.rir<=3;}).length;
    by[s.date]=(by[s.date]||0)+n;});
  return by;
}
function recoveryLatentState(opts){
  opts=opts||{};
  var days=opts.days||42,today=asOf(),from=addDays(today,-(days-1));
  /* observations, standardised against the person's own baseline in the window */
  var streams={},used=[];
  Object.keys(RECOVERY_STREAMS).forEach(function(k){
    var o=obsOf(k,{from:from}).filter(function(x){return x.date<=today;});
    if(o.length<6)return;
    var v=o.map(function(x){return x.value;}),m=mean(v),sdv=sd(v);
    if(!sdv)return;
    var byDate={};o.forEach(function(x){byDate[x.date]=RECOVERY_STREAMS[k].sign*(x.value-m)/sdv;});
    /* Measurement noise: how much a standardised reading scatters around its own local level. Measured, and
       a stream that scatters more moves the estimate less. */
    var zs=o.map(function(x){return byDate[x.date];});
    var res=[];for(var i=1;i<zs.length;i++)res.push(zs[i]-zs[i-1]);
    var noiseVar=Math.max(0.25,(sd(res)||1)*(sd(res)||1)/2);
    streams[k]={byDate:byDate,noiseVar:round(noiseVar,3),n:o.length,baseline:round(m,2),kind:RECOVERY_STREAMS[k].kind};
    used.push(k);
  });
  if(used.length<2)return {status:'insufficient',need:['at least two recovery observations streams with six or more days each'],
    note:'Recovery is estimated from several signals; with fewer than two there is nothing to reconcile.'};
  /* stressor state */
  var LOAD=_dailyLoad(from,today),hard=LOAD.by;
  var hv=Object.keys(hard).map(function(k){return hard[k];});
  var loadMean=hv.length?mean(hv):0,loadSd=(hv.length>1?sd(hv):1)||1;
  var sleepBase=streams.sleep?streams.sleep.baseline:null;
  var sleepObs={};obsOf('sleep',{from:from}).forEach(function(x){sleepObs[x.date]=x.value;});
  /* filter */
  var P=Object.assign({},RECOVERY_PROCESS,opts._override||{}),R=0,Pv=1,trace=[];
  for(var d=0;d<days;d++){
    var date=addDays(from,d);
    var load=hard[date]?(hard[date]-loadMean)/loadSd:(-loadMean/loadSd);
    var debt=(sleepBase!=null&&sleepObs[date]!=null)?Math.max(0,sleepBase-sleepObs[date]):0;
    /* predict */
    R=P.phi*R-P.loadEffect*Math.max(0,load)-P.sleepDebtEffect*debt;
    Pv=P.phi*P.phi*Pv+P.processVar;
    /* update, one stream at a time */
    var obsToday=[];
    used.forEach(function(k){
      var y=streams[k].byDate[date];if(y==null)return;
      var K=Pv/(Pv+streams[k].noiseVar);
      R=R+K*(y-R);Pv=(1-K)*Pv;obsToday.push(k);});
    trace.push({date:date,latent:round(R,3),sd:round(Math.sqrt(Pv),3),hardSets:hard[date]||0,sleepDebt:round(debt,2),observed:obsToday});
  }
  var last=trace[trace.length-1];
  /* forecast. The first version drove the future with the DECLARED load coefficient and the TEMPLATE's
     prescribed sets, and projected -2.7 and -3.8 standard deviations on the next two lifting days \u2014 when the
     history never left \u00b10.3. With no future reports to correct it, a declared coefficient runs unchecked.
     So the load effect is estimated from this person's own history (how the state actually moved on the day
     after a given load), and planned days use the hard sets this person actually does on a lifting day, not
     the number the template prescribes. */
  var pairs=[];
  for(var q=1;q<trace.length;q++){
    /* Stressors enter as max(0, z) everywhere — filter, effect estimate and forecast — so only above-usual load
       counts as a stressor. The first version used the signed value here and in the forecast while the filter
       used max(0, z), so a rest day entered the forecast as a large negative stressor and the band NARROWED
       from day one to day two, which uncertainty cannot do. */
    var prevLoad=hard[trace[q-1].date]?Math.max(0,(hard[trace[q-1].date]-loadMean)/loadSd):null;
    if(prevLoad!=null)pairs.push({x:prevLoad,y:trace[q].latent-P.phi*trace[q-1].latent});
  }
  var effect=null,effectSe=null;
  if(pairs.length>=6){
    var mx=mean(pairs.map(function(z){return z.x;})),my=mean(pairs.map(function(z){return z.y;}));
    var sxx=pairs.reduce(function(a,z){return a+(z.x-mx)*(z.x-mx);},0);
    if(sxx>0){effect=pairs.reduce(function(a,z){return a+(z.x-mx)*(z.y-my);},0)/sxx;
      var rs=pairs.map(function(z){return z.y-(my+effect*(z.x-mx));});
      effectSe=(sd(rs)||0)/Math.sqrt(sxx);}
  }
  var liftDays=hv.filter(function(x){return x>0;});
  var typicalSets=liftDays.length?Math.round(mean(liftDays)):0;
  var prog=null;try{prog=trainingProgram();}catch(e){}
  var fc=[],Rf=R,Pf=Pv;
  for(var h=1;h<=3;h++){
    var fd=addDays(today,h),dn=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(fd+'T12:00:00Z').getUTCDay()];
    var plan=prog&&prog.week?prog.week[dn]:null;
    var lifting=!!(plan&&plan.kind==='lift');
    var sets=lifting?typicalSets:0;
    var pl=Math.max(0,(sets-loadMean)/loadSd);
    /* An effect that is not distinguishable from zero is not projected: the forecast then says recovery
       relaxes toward baseline, and the band carries the effect's uncertainty rather than hiding it. */
    var useEff=(effect!=null&&effectSe!=null&&Math.abs(effect)>2*effectSe)?effect:0;
    Rf=P.phi*Rf+useEff*pl;
    Pf=P.phi*P.phi*Pf+P.processVar+(effectSe!=null?Math.pow(effectSe*pl,2):0);
    fc.push({date:fd,latent:round(Rf,2),lo:round(Rf-1.96*Math.sqrt(Pf),2),hi:round(Rf+1.96*Math.sqrt(Pf),2),
      plan:plan?plan.label:null,assumedLoad:round(sets,1),loadUnit:LOAD.unit});
  }
  var forecastBasis=effect==null?'too few loaded days to estimate a load effect, so the forecast only relaxes toward baseline':
    (Math.abs(effect)>2*(effectSe||Infinity)?('a load effect estimated from your history: '+round(effect,2)+' \u00b1 '+round(effectSe,2)+' per standard deviation of training load'):
      ('the load effect in your history ('+round(effect,2)+' \u00b1 '+round(effectSe,2)+') is not distinguishable from zero, so it is not projected'));
  /* sensitivity: today's estimate and the forecast are affected differently by the declared coefficients */
  var sens=null;
  if(!opts._noSensitivity){
    var alt=recoveryLatentState(Object.assign({},opts,{_noSensitivity:true,_override:{loadEffect:P.loadEffect*1.5}}));
    sens={todayIfLoadEffectPlus50pct:alt.status==='ok'?round(alt.score-round(last.latent,2),2):null,
      reading:'today\u2019s estimate is dominated by the reports, so a stronger declared load effect barely moves it; the forecast uses the load effect estimated from your history instead of the declared one'};
  }
  var band=last.latent>0.5?'better recovered than your baseline':(last.latent<-0.5?'less recovered than your baseline':'about your baseline');
  return {status:'ok',cls:'HEURISTIC',method:'kalmanFilter',
    score:round(last.latent,2),lo:round(last.latent-1.96*last.sd,2),hi:round(last.latent+1.96*last.sd,2),sd:last.sd,band:band,
    observations:used.map(function(k){return {stream:k,label:RECOVERY_STREAMS[k].label,kind:streams[k].kind,n:streams[k].n,
      measurementNoise:streams[k].noiseVar,treatedAs:'a noisy reading of recovery, not recovery itself'};}),
    stressorState:{loadToday:round(last.hardSets,1),loadUnit:LOAD.unit,loadBasis:LOAD.basis,loadNote:LOAD.note,ratedSessions:LOAD.rated,filledSessions:LOAD.filled,
      sleepDebtHours:last.sleepDebt,loadMean:round(loadMean,1)},
    recoveryModel:{process:RECOVERY_PROCESS,declared:true},
    trace:trace.slice(-14),forecast:fc,forecastBasis:forecastBasis,typicalLoadOnTrainingDays:round(typicalSets,1),loadUnit:LOAD.unit,sensitivity:sens,
    note:'A latent recovery state carried forward day by day, pushed down by training load and sleep debt, and corrected by each report in proportion to how reliable that report has proven.',
    caveat:'The process coefficients are declared, not fitted \u2014 there are too few days to estimate them without overfitting. The sensitivity line shows how much the answer moves if the load effect is half again as strong.'};
}
