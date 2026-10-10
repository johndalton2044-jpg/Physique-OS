/* ============================================================================
   REGION: ESTIMATOR RIGOUR (audit §7, §9, §10)

   Three weaknesses an external audit identified in the models rather than the architecture. Each is a case of
   a defensible method applied with more confidence than it earns, and each fix reduces the app's apparent
   certainty rather than increasing it.

   §7  3,500 kcal/lb was applied as an exact constant. It is the energy density of ADIPOSE tissue, not of
       the mixture a person actually loses, and the mixture varies.
   §10 A personal response estimated from ONE observation was passed downstream at face value. The right
       treatment of a single noisy estimate is to shrink it toward the prior, not to believe it and not to
       discard it.
   §9  Change detection used a t threshold of 1.2 with no correction for autocorrelation. Daily weight is
       strongly autocorrelated, which inflates t, so that threshold flags noise as a change point.
   ============================================================================ */

/* ---------------- §7 TISSUE ENERGY DENSITY ----------------
   Adipose tissue runs about 3,500 kcal per pound. Lean tissue is mostly water and runs far lower — roughly
   600 to 800. What somebody loses is a mixture, so the energy behind a pound of scale weight depends on the
   partitioning, and the partitioning depends on how aggressive the deficit is, how much fat they carry,
   whether they are training, and whether protein is adequate.

   The point of computing this is not precision. It is that a 20% error in the conversion propagates directly
   into every maintenance estimate, and quoting 3,500 as exact hides it. */
/* fat and lean are the endpoints of the mixture; fallback is the only value any energy path may use when
   the composition model cannot resolve, and it lives here so there is exactly one place to find it. */
var ENERGY_PER_LB={fat:3500,lean:700,glycogenWater:0,fallback:3200};
/* ONE ENERGY-DENSITY SERVICE (catalogue W-003). The response entity's expected weight change, the response priors and
   the optimiser's cardio and training levers each still divided by 3,500, so one intervention was read as different
   amounts of weight depending on which part of the app did the arithmetic. Every conversion now goes through this
   function, every converted result names the model and version it was converted under (so a result stored under an
   earlier version can be told apart), and the governance gate fails on arithmetic with an energy-density literal
   anywhere else. */
var ENERGY_DENSITY_MODEL={id:'tissue_energy_density',version:'1.0'};
function tissueEnergyDensity(opts){
  opts=opts||{};
  var reasons=[],fatShare=0.75;   // a common central estimate for a moderate deficit in a trained person
  /* Body fat level: someone leaner loses proportionally more lean tissue at the same deficit. */
  var bf=null;
  try{var bc=bodyComp();if(bc&&bc.estimate&&bc.estimate.status==='ok')bf=bc.estimate.bf;}catch(e){}
  if(bf!=null){
    if(bf>=30){fatShare+=0.10;reasons.push('higher body fat spares lean tissue');}
    else if(bf<=15){fatShare-=0.12;reasons.push('at lower body fat a greater share of loss is lean');}
  }else reasons.push('body fat unknown, so the central estimate is used');
  /* Deficit size: an aggressive deficit costs proportionally more lean tissue. */
  var rate=null;
  try{var tr=weightTrend(14);if(tr.status==='ok')rate=tr.slopePerWeek;}catch(e){}
  var w=currentWeight().value;
  if(rate!=null&&w){
    var pctPerWeek=Math.abs(rate)/w*100;
    if(pctPerWeek>1.1){fatShare-=0.12;reasons.push('losing faster than about 1% of body weight a week');}
    else if(pctPerWeek<0.5){fatShare+=0.05;reasons.push('a gentle rate of loss');}
  }
  /* Protein and resistance training both protect lean tissue. */
  var protOk=null;
  try{
    var ad=adherenceState(14);
    protOk=ad&&ad.protein&&ad.protein.pct!=null?ad.protein.pct>=70:null;
  }catch(e){}
  if(protOk===true){fatShare+=0.06;reasons.push('protein target being met');}
  else if(protOk===false){fatShare-=0.08;reasons.push('protein target often missed');}
  var lifting=false;
  try{lifting=sessionsOf({from:addDays(asOf(),-14)}).length>=3;}catch(e){}
  if(lifting){fatShare+=0.05;reasons.push('lifting regularly');}
  else reasons.push('little resistance training recorded, which costs lean tissue in a deficit');
  fatShare=clamp(fatShare,0.5,0.95);
  var central=fatShare*ENERGY_PER_LB.fat+(1-fatShare)*ENERGY_PER_LB.lean;
  /* The interval spans a plausible partitioning range rather than a statistical confidence band, because
     the uncertainty here is about the mixture and not about sampling. */
  var loShare=clamp(fatShare-0.15,0.45,0.95),hiShare=clamp(fatShare+0.15,0.5,0.98);
  return {status:'ok',cls:'PRIOR',model:ENERGY_DENSITY_MODEL.id,version:ENERGY_DENSITY_MODEL.version,
    kcalPerLb:Math.round(central),
    lo:Math.round(loShare*ENERGY_PER_LB.fat+(1-loShare)*ENERGY_PER_LB.lean),
    hi:Math.round(hiShare*ENERGY_PER_LB.fat+(1-hiShare)*ENERGY_PER_LB.lean),
    fatShare:round(fatShare,2),reasons:reasons,
    naive:ENERGY_PER_LB.fat,
    note:'The energy behind a pound of scale weight, given what you are probably losing rather than assuming it is all fat. 3,500 kcal per pound is adipose tissue; lean tissue is mostly water and runs nearer 700.',
    caveat:'Partitioning cannot be measured from this record, so this is an informed assumption with a stated range. A fifteen-point shift in the fat share moves the figure by roughly '+
      Math.round(0.15*(ENERGY_PER_LB.fat-ENERGY_PER_LB.lean))+' kcal per pound, which is why it is not quoted as a constant.'};
}
/* What a converted result names: the model, its version and the figure it was converted with. */
function energyDensityRef(){var d=null;try{d=tissueEnergyDensity();}catch(e){d=null;}var ok=!!(d&&d.status==='ok');
  return {model:ENERGY_DENSITY_MODEL.id,version:ENERGY_DENSITY_MODEL.version,kcalPerLb:ok?d.kcalPerLb:ENERGY_PER_LB.fallback,
    lo:ok?d.lo:null,hi:ok?d.hi:null,source:ok?'composition model':'fallback (the composition model could not resolve)'};}
/* A quantity in the unit a conversion expects: a plain number, or {value, unit} in that unit. Anything else (a pound
   handed to the kcal side, a missing value) is refused rather than converted into a plausible-looking number. */
function _energyQuantity(x,unit){if(typeof x==='number')return isFinite(x)?x:null;
  if(x&&typeof x==='object'&&typeof x.value==='number'&&isFinite(x.value)&&x.unit===unit)return x.value;return null;}
/* The conversion every energy model should use, so the assumption lives in one place. */
function lbToKcal(lb,opts){
  var v=_energyQuantity(lb,'lb');if(v==null)return {status:'invalid',kcal:null,lo:null,hi:null,density:null,why:'lbToKcal takes pounds: a number, or {value, unit:"lb"}'};
  var d=tissueEnergyDensity(opts);
  return {status:'ok',kcal:Math.round(v*d.kcalPerLb),lo:Math.round(v*d.lo),hi:Math.round(v*d.hi),model:d.model,version:d.version,density:d};
}
function kcalToLb(kcal,opts){
  var v=_energyQuantity(kcal,'kcal');if(v==null)return {status:'invalid',lb:null,lo:null,hi:null,density:null,why:'kcalToLb takes kcal: a number, or {value, unit:"kcal"}'};
  var d=tissueEnergyDensity(opts);
  return {status:'ok',lb:round(v/d.kcalPerLb,3),lo:round(v/d.hi,3),hi:round(v/d.lo,3),model:d.model,version:d.version,density:d};
}
/* registered with the other models, so it runs through the inference gateway with a run identity and provenance */
(function(){if(typeof MODELS==='undefined'||MODELS.some(function(m){return m.id===ENERGY_DENSITY_MODEL.id;}))return;
  MODELS.push({id:ENERGY_DENSITY_MODEL.id,name:'Tissue energy density',cls:'PRIOR',version:ENERGY_DENSITY_MODEL.version,
    inputs:['bodyfat','weight_trend|the rate of loss','adherence|protein adherence','session.sets|resistance training'],minN:0,
    assumes:['adipose tissue holds about 3,500 kcal per lb and lean tissue about 700','the share of a change that is fat moves with body fat, the rate of loss, protein and training','partitioning cannot be measured from the record, so the range is a plausible-partitioning band, not a sampling interval'],
    failsWhen:['day-to-day water and glycogen shifts, which carry almost no energy','no weight trend and no body fat, when only the central estimate remains'],
    output:'kcal per lb of scale weight, with a range and the reasons for the fat share',
    consumers:['tdee_personal','energy_balance','_expectedWeightChange|a response\u2019s expected weight change','RESPONSE_PRIORS|the response priors','_leverEffect|the optimiser\u2019s levers'],
    freshnessDays:14,uncertainty:{kind:'plausible-partitioning range'},fn:'tissueEnergyDensity'});})();
/* ---------------- §10 EMPIRICAL-BAYES SHRINKAGE ----------------
   One noisy observation should not be believed at face value and should not be thrown away. Shrinking it
   toward the population prior in proportion to how noisy it is does both correctly: with n=1 the estimate
   sits near the prior with a wide interval, and it moves toward the personal value as evidence accumulates.

   This is the honest answer to a response matrix with a single entry \u2014 the entry still counts, it just does
   not get to speak as though it were five. */
function priorEffectFor(variable,delta){
  /* The population fallback, in the same units the personal estimate uses: lb/week per unit of the variable. */
  var d=delta||1;
  var kcal=variable==='steps'?d*0.045:
    (variable==='calories'?-d:
    (variable==='cardio'?d*250/7:
    (variable==='training'?d*180/7:0)));
  if(!kcal)return null;
  var conv=kcalToLb(kcal*7);
  return {perUnit:-conv.lb/Math.abs(d)*Math.abs(d),effect:-conv.lb,cls:'PRIOR'};
}
function shrunkResponse(variable){
  var r=null;
  try{r=responseFor(variable);}catch(e){}
  var scale=(typeof RESPONSE_VARS!=='undefined'&&RESPONSE_VARS[variable])?RESPONSE_VARS[variable].scale:1;
  var prior=priorEffectFor(variable,scale);
  if(!r||!r.n)return prior?{status:'prior-only',variable:variable,
    estimate:round(prior.effect,3),n:0,weight:0,
    prior:round(prior.effect,3),cls:'PRIOR',
    note:'No personal observation of this variable, so the population estimate stands alone. It is labelled PRIOR wherever it appears.'}:
    {status:'unknown',variable:variable};
  if(!prior)return {status:'personal-only',variable:variable,estimate:round(r.effect,3),n:r.n,cls:r.cls,
    note:'No population estimate exists for this variable, so the personal observations stand alone.'};
  /* Shrinkage weight: personal evidence earns trust from COUNT and from AGREEMENT between observations.
     A single observation, or several that disagree wildly, both end up close to the prior. */
  var spread=r.spread!=null?Math.abs(r.spread):null;
  var priorSpread=Math.max(0.05,Math.abs(prior.effect)*0.6);   // how uncertain the population figure is
  var withinVar=spread!=null?Math.pow(spread,2):Math.pow(priorSpread,2)*2;
  var seSq=withinVar/Math.max(1,r.n);
  var weight=priorSpread*priorSpread/(priorSpread*priorSpread+seSq);
  weight=clamp(weight,0,0.95);   // never fully personal: a record is never a randomised trial
  var est=weight*r.effect+(1-weight)*prior.effect;
  var seShrunk=Math.sqrt(weight*seSq);
  return {status:'ok',variable:variable,
    estimate:round(est,3),lo:round(est-1.96*seShrunk,3),hi:round(est+1.96*seShrunk,3),
    personal:round(r.effect,3),prior:round(prior.effect,3),
    n:r.n,clean:r.clean,spread:spread!=null?round(spread,3):null,
    weight:round(weight,2),
    cls:weight>=0.6?'EMPIRICAL':(weight>=0.25?'BLENDED':'PRIOR'),
    confidence:r.n>=3&&r.clean>=2&&weight>=0.5?'medium':'low',
    note:'Your own observations pulled toward the population estimate in proportion to how much they can carry. '+
      Math.round(weight*100)+'% of this figure is yours and '+Math.round((1-weight)*100)+'% is the population starting point.',
    caveat:r.n===1?'A single observation. Shrinkage is what stops one measurement being quoted as though it were a finding \u2014 it still counts, it just does not get to speak as though it were five.':
      (r.n<3?'Few observations, so most of the weight is still on the population figure.':null)};
}
function shrunkResponseMatrix(){
  var vars=Object.keys(typeof RESPONSE_VARS!=='undefined'?RESPONSE_VARS:{});
  var rows=vars.map(shrunkResponse).filter(function(r){return r&&r.status!=='unknown';});
  var personal=rows.filter(function(r){return r.weight>=0.5;}).length;
  return {rows:rows,variables:rows.length,
    mostlyPersonal:personal,
    cls:'BLENDED',
    note:'Every variable shown with how much of its estimate is yours. Shrinkage is deliberate: a personal record is not a randomised trial, so no estimate is allowed to become fully personal however many observations accumulate.',
    caveat:personal?null:'No variable yet carries enough personal evidence to outweigh the population estimate.'};
}
/* ---------------- §9 AUTOCORRELATION-CORRECTED DETECTION ----------------
   Consecutive daily weights are strongly correlated, so treating them as independent inflates any test
   statistic. The effective sample size correction is the same one the interrupted time series already
   applies; it was simply missing here. */
function lag1Autocorrelation(values){
  if(!values||values.length<4)return null;
  var m=mean(values),num2=0,den=0;
  for(var i=0;i<values.length;i++){
    den+=Math.pow(values[i]-m,2);
    if(i>0)num2+=(values[i]-m)*(values[i-1]-m);
  }
  return den?clamp(num2/den,-0.95,0.95):null;
}
function effectiveN(n,rho){
  if(rho==null||n<2)return n;
  /* n_eff = n * (1-rho)/(1+rho), the standard first-order correction.
     NEGATIVE autocorrelation makes that formula exceed n — mathematically real, since alternating series do
     carry more information per observation than independent ones, but it is never right for this purpose to
     claim more independent information than there are observations. Capped at n, which only ever makes a
     test more conservative. */
  return Math.max(2,Math.min(n,n*(1-rho)/(1+rho)));
}
function changePointsRigorous(days){
  days=days||56;
  var raw=null;
  try{raw=changePoints(days);}catch(e){return {status:'error',note:String(e&&e.message||e)};}
  if(!raw||!raw.items)return {status:'insufficient',need:['more data in the window']};
  var w=seriesWindow('weight',days).map(function(d){return d.value;});
  var rho=lag1Autocorrelation(w);
  var rows=raw.items.map(function(it){
    var n=it.n||Math.max(8,Math.floor(days/2));
    var nEff=effectiveN(n,rho);
    /* Rescale the reported statistic by the loss of independent information, then apply a threshold that
       means something: |t| > 2 rather than 1.2. */
    var tAdj=(it.t!=null&&n>1)?it.t*Math.sqrt(nEff/n):it.t;
    return Object.assign({},it,{
      tRaw:it.t!=null?round(it.t,2):null,
      tAdjusted:tAdj!=null?round(tAdj,2):null,
      nominalN:n,effectiveN:round(nEff,1),
      survives:tAdj!=null&&Math.abs(tAdj)>=2,
      downgraded:it.t!=null&&Math.abs(it.t)>=1.2&&(tAdj==null||Math.abs(tAdj)<2)});
  });
  var kept=rows.filter(function(r){return r.survives;});
  return {status:'ok',cls:'DERIVED',days:days,
    autocorrelation:rho!=null?round(rho,2):null,
    items:kept,downgraded:rows.filter(function(r){return r.downgraded;}),
    all:rows,
    note:'Change points that survive a correction for autocorrelation at a threshold of two rather than 1.2. Consecutive daily weights are strongly correlated, so the uncorrected statistic treats the same information as though it arrived several times.',
    caveat:(rho!=null&&rho>0.3)?('Your weight series has a lag-one correlation of '+round(rho,2)+
      ', which means roughly '+Math.round(100-100*effectiveN(10,rho)/10)+'% of the apparent sample size is redundant.'):
      'Autocorrelation in this window is low enough that the correction changes little.',
    removed:rows.length-kept.length};
}
