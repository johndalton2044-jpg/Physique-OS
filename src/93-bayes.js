/* ============================================================================
   REGION: BAYESIAN MAINTENANCE AND SEMANTIC TYPES (ConWork.md)

   BAYESIAN TDEE. The existing estimator is a point estimate with a variance assembled from three error
   terms. That is defensible arithmetic, but it cannot answer the questions people actually ask: how likely
   is it that my maintenance is above 2,700; what should I expect next week's weight to do given everything
   I know; and how much should one unusual fortnight move my belief.

   A posterior answers all three. The prior is the population equation, which is exactly what a prior is for
   — a starting belief held before this person's data arrived. The likelihood is the energy balance
   relationship. Partial pooling falls out of it: with two weeks of data the posterior sits near the prior,
   and with three months it barely remembers the prior existed. Nobody has to choose when to switch.

   SEMANTIC TYPES. The data dictionary described ten quantities in prose. A prose dictionary catches nothing.
   Types here are machine-checked: dimension, unit, temporal semantics, aggregation and epistemic class, with
   a conversion that REFUSES rather than guessing when two quantities are not commensurable.
   ============================================================================ */

/* ---------------- semantic type system ---------------- */
var DIMENSIONS={
  mass:{base:'lb',units:{lb:1,kg:2.20462,g:0.00220462}},
  energy:{base:'kcal',units:{kcal:1,kJ:0.239006}},
  energyRate:{base:'kcal/day',units:{'kcal/day':1,'kcal/week':1/7}},
  massRate:{base:'lb/week',units:{'lb/week':1,'lb/day':7,'kg/week':2.20462}},
  energyDensity:{base:'kcal/lb',units:{'kcal/lb':1,'kcal/kg':0.453592}},
  time:{base:'day',units:{day:1,week:7,hour:1/24,minute:1/1440,second:1/86400}},
  length:{base:'cm',units:{cm:1,'in':2.54}},   /* field tests (sit-and-reach, knee-to-wall, jump height), Stage D item 4 */
  count:{base:'count',units:{count:1}},
  ratio:{base:'ratio',units:{ratio:1,percent:0.01}},
  index:{base:'index',units:{index:1}},
  zScore:{base:'z',units:{z:1}}
};
var TEMPORAL={
  instant:'a value at a moment',
  daily:'one value per day',
  window:'an aggregate over a stated window',
  rate:'a change per unit time',
  cumulative:'accumulated since a start point'
};
var AGGREGATION={sum:'adds across the window',mean:'averages',median:'middle value',
  last:'most recent',slope:'fitted rate of change',none:'not aggregable'};
/* Every quantity the system passes between models, typed. */
var TYPES={
  weight:{dimension:'mass',unit:'lb',temporal:'instant',aggregation:'mean',cls:'MEASURED',
    population:'this person'},
  weightTrend:{dimension:'massRate',unit:'lb/week',temporal:'rate',aggregation:'slope',cls:'DERIVED',
    population:'this person'},
  intake:{dimension:'energyRate',unit:'kcal/day',temporal:'daily',aggregation:'mean',cls:'MEASURED',
    population:'this person',note:'as logged, which is not as absorbed'},
  tdee:{dimension:'energyRate',unit:'kcal/day',temporal:'window',aggregation:'mean',cls:'DERIVED',
    population:'this person'},
  bmrPrior:{dimension:'energyRate',unit:'kcal/day',temporal:'window',aggregation:'mean',cls:'PRIOR',
    population:'population equation'},
  tissueDensity:{dimension:'energyDensity',unit:'kcal/lb',temporal:'window',aggregation:'none',cls:'PRIOR',
    population:'population, adjusted for this person'},
  e1rm:{dimension:'mass',unit:'lb',temporal:'instant',aggregation:'max',cls:'DERIVED',
    population:'this person'},
  rir:{dimension:'count',unit:'count',temporal:'instant',aggregation:'mean',cls:'MEASURED',
    population:'this person',note:'subjective'},
  stimulus:{dimension:'index',unit:'index',temporal:'window',aggregation:'sum',cls:'HEURISTIC',
    population:'this person only \u2014 not comparable between people'},
  fatigueIndex:{dimension:'index',unit:'index',temporal:'cumulative',aggregation:'sum',cls:'HEURISTIC',
    population:'this person only'},
  readiness:{dimension:'zScore',unit:'z',temporal:'daily',aggregation:'mean',cls:'EMPIRICAL',
    population:'this person\u2019s own baseline'},
  trainingLoadRatio:{dimension:'ratio',unit:'ratio',temporal:'window',aggregation:'none',cls:'HEURISTIC',
    population:'this person'},
  adherence:{dimension:'ratio',unit:'percent',temporal:'window',aggregation:'mean',cls:'MEASURED',
    population:'this person'},
  steps:{dimension:'count',unit:'count',temporal:'daily',aggregation:'mean',cls:'MEASURED',
    population:'this person'},
  sleep:{dimension:'time',unit:'hour',temporal:'daily',aggregation:'mean',cls:'MEASURED',
    population:'this person'}
};
function typeOf(q){return TYPES[q]||null;}
function convertUnits(value,from,to){
  if(value==null)return null;
  var dim=null;
  Object.keys(DIMENSIONS).forEach(function(d){
    if(DIMENSIONS[d].units[from]!=null&&DIMENSIONS[d].units[to]!=null)dim=d;});
  if(!dim)return {status:'incommensurable',from:from,to:to,
    note:'These units do not belong to a shared dimension, so no conversion exists. Returning a number here would be inventing one.'};
  var u=DIMENSIONS[dim].units;
  /* Each entry is "how many BASE units one of this unit is worth", so converting runs from-unit-to-base
     then base-to-target. The first version divided instead of multiplying and turned 70 kg into 31.75 lb —
     a factor-squared error that a unit system exists precisely to prevent. */
  return {status:'ok',value:value*u[from]/u[to],dimension:dim,from:from,to:to,
    note:'via the '+dim+' base unit of '+DIMENSIONS[dim].base};
}
/* The check that makes the type system worth having: two quantities may only be combined if their
   dimensions and temporal semantics agree. */
function checkCompatible(a,b,op){
  var ta=typeOf(a),tb=typeOf(b);
  if(!ta||!tb)return {ok:false,why:'one or both quantities are untyped, so nothing can be guaranteed about combining them'};
  if(op==='ratio')return {ok:true,resultDimension:'ratio',
    note:'a ratio of like quantities is dimensionless'};
  if(ta.dimension!==tb.dimension)
    return {ok:false,why:'different dimensions: '+ta.dimension+' and '+tb.dimension,
      note:'Adding or comparing these would be a category error the arithmetic would not complain about.'};
  if(ta.temporal!==tb.temporal)
    return {ok:false,why:'different temporal semantics: '+ta.temporal+' and '+tb.temporal,
      note:TEMPORAL[ta.temporal]+' against '+TEMPORAL[tb.temporal]+'. The numbers are the same dimension and mean different things.'};
  if(ta.population!==tb.population)
    return {ok:true,caution:'different populations: '+ta.population+' and '+tb.population,
      note:'Combinable, but the result inherits the weaker population claim.'};
  return {ok:true};
}
function typeSystemAudit(){
  var issues=[];
  Object.keys(TYPES).forEach(function(k){
    var t=TYPES[k];
    if(!DIMENSIONS[t.dimension])issues.push(k+': unknown dimension '+t.dimension);
    else if(DIMENSIONS[t.dimension].units[t.unit]==null)
      issues.push(k+': unit '+t.unit+' does not belong to dimension '+t.dimension);
    if(!TEMPORAL[t.temporal])issues.push(k+': unknown temporal semantics '+t.temporal);
    if(!t.population)issues.push(k+': no population declared');
    if(!t.cls)issues.push(k+': no epistemic class');
  });
  /* And the prose dictionary must not contradict the machine types. */
  Object.keys(DATA_DICTIONARY).forEach(function(k){
    var t=TYPES[k]||TYPES[k.replace(/Ratio$/,'')];
    if(t&&DATA_DICTIONARY[k].unit&&t.unit&&
       DATA_DICTIONARY[k].unit.indexOf(t.unit)<0&&t.unit.indexOf('index')<0&&t.unit!=='z')
      issues.push(k+': dictionary says "'+DATA_DICTIONARY[k].unit+'" but the type says "'+t.unit+'"');
  });
  return {typed:Object.keys(TYPES).length,dimensions:Object.keys(DIMENSIONS).length,
    issues:issues,ok:issues.length===0,cls:'POLICY',
    note:'Types checked against their own dimensions and against the prose dictionary. A dictionary that describes units and a system that ignores them is documentation, not a type system.'};
}
/* ---------------- Bayesian maintenance ----------------
   Prior: the population equation, with the uncertainty it deserves.
   Likelihood: intake minus maintenance, times days, equals energy behind the observed weight change.
   Posterior: conjugate normal, which is exact here and needs no sampling. */
function tdeeBayes(opts){
  opts=opts||{};
  var windowDays=opts.windowDays||28;
  var prior=null;try{prior=tdeePrior();}catch(e){}
  if(!prior||prior.status!=='ok')return {status:'insufficient',method:'conjugateNormal',posterior:'full',
    need:['the profile the population equation needs'],
    note:'A posterior needs a prior, and the prior here is the population equation.'};
  var cal=dailySeries('calories',asOf(),windowDays);
  var tr=weightTrend(windowDays);
  /* PRIOR: the population estimate, with a standard deviation reflecting how badly these equations fit
     individuals \u2014 roughly 10%, which is generous to them. */
  var priorMean=prior.value,priorSd=prior.value*0.10;
  if(cal.length<7||tr.status!=='ok')
    return {status:'prior-only',cls:'PRIOR',method:'conjugateNormal',posterior:'full',
      mean:Math.round(priorMean),sd:Math.round(priorSd),
      lo:Math.round(priorMean-1.96*priorSd),hi:Math.round(priorMean+1.96*priorSd),
      n:cal.length,weightOnData:0,
      need:[(7-cal.length>0?(7-cal.length)+' more days of intake':'a usable weight trend')],
      note:'Not enough of your own data to update the population estimate, so the posterior IS the prior. That is the correct answer, not a failure \u2014 it is what you should believe before evidence arrives.'};
  /* LIKELIHOOD: each day contributes intake - density*rate as a noisy observation of maintenance. */
  var density=tissueKcalPerLb();
  var perDay=tr.slopePerWeek/7;
  var intake=mean(cal.map(function(d){return d.value;}));
  var obsMean=intake-perDay*density;
  /* Observation noise: logging error dominates, then slope error, then the density interval. */
  var adh=seriesWindow('adherence',windowDays);
  var adhMean=adh.length>=3?mean(adh.map(function(d){return d.value;})):null;
  var logErr=adhMean!=null?(adhMean>=90?0.08:(adhMean>=75?0.12:0.18)):0.12;
  var seSlope=(tr.slopeSe!=null?tr.slopeSe/7:Math.abs(perDay)*0.5);
  var obsVar=Math.pow(seSlope*density,2)+
             Math.pow(perDay*tissueKcalSd(),2)+
             Math.pow(intake*logErr,2)/Math.max(1,cal.length);
  var obsSd=Math.sqrt(obsVar);
  /* POSTERIOR: conjugate normal. Precision adds, which is why more data narrows the belief. */
  var priorPrec=1/Math.pow(priorSd,2),obsPrec=1/obsVar;
  var postPrec=priorPrec+obsPrec;
  var postMean=(priorMean*priorPrec+obsMean*obsPrec)/postPrec;
  var postSd=Math.sqrt(1/postPrec);
  /* PARTIAL POOLING falls out: the weight on data is its share of total precision. */
  var wData=obsPrec/postPrec;
  /* POSTERIOR PREDICTIVE: what next week's weight change should be, carrying BOTH the uncertainty in
     maintenance and the day-to-day noise \u2014 a prediction that used only the posterior mean would be
     narrower than the truth. */
  var predict=function(plannedIntake,days){
    days=days||7;
    var balance=plannedIntake-postMean;
    var lbs=balance*days/density;
    /* Variance in the prediction: maintenance uncertainty plus weight measurement noise. */
    var maintVar=Math.pow(postSd*days/density,2);
    var noiseSd=0;
    try{var pb=personalBaselines();if(pb.streams.weight&&pb.streams.weight.status==='ok')noiseSd=pb.streams.weight.baseline||0;}catch(e){}
    var totalSd=Math.sqrt(maintVar+Math.pow(noiseSd,2));
    return {intake:plannedIntake,days:days,
      expected:round(lbs,2),lo:round(lbs-1.96*totalSd,2),hi:round(lbs+1.96*totalSd,2),
      note:'Carries both the uncertainty in your maintenance and the day-to-day noise in the scale. A prediction using only the best estimate of maintenance would be narrower than the truth and wrong more often than it admitted.'};
  };
  var probAbove=function(x){
    var z=(x-postMean)/postSd;
    return round(1-(0.5*(1+_erf(z/Math.SQRT2))),3);
  };
  return {status:'ok',cls:'BLENDED',model:'tdee_bayes',method:'conjugateNormal',posterior:'full',
    assumptions:['normal likelihood','the likelihood variance is treated as known','no systematic logging bias'],
    mean:Math.round(postMean),sd:Math.round(postSd),
    lo:Math.round(postMean-1.96*postSd),hi:Math.round(postMean+1.96*postSd),
    prior:{mean:Math.round(priorMean),sd:Math.round(priorSd),source:'population equation'},
    likelihood:{mean:Math.round(obsMean),sd:Math.round(obsSd),n:cal.length,
      source:'your intake against your weight change'},
    weightOnData:round(wData,2),
    pooling:Math.round(wData*100)+'% of this posterior comes from your own data and '+
      Math.round((1-wData)*100)+'% from the population prior',
    predict:predict,probAbove:probAbove,
    confidence:wData>=0.8&&cal.length>=21?'medium':'low',
    note:'A posterior rather than a point estimate, so it answers how likely a value is rather than only what the single best guess is. Partial pooling is not a switch that gets thrown \u2014 it falls out of the arithmetic, so two weeks of data sits near the population estimate and three months barely remembers it.',
    caveat:'The likelihood assumes intake is logged without systematic bias, which is the assumption most likely to be wrong. Under-reporting shifts the whole posterior down and no amount of data corrects it \u2014 only a controlled period would.'};
}
function _erf(x){
  /* Abramowitz-Stegun 7.1.26; adequate for reporting probabilities to two decimals. */
  var s=x<0?-1:1;x=Math.abs(x);
  var t=1/(1+0.3275911*x);
  var y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-x*x);
  return s*y;
}
