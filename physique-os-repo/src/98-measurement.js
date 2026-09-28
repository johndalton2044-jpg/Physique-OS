/* ============================================================================
   REGION: UNIVERSAL TYPING, MISSING DATA AND MEASUREMENT (ConBWork.md)

   UNIVERSAL TYPING. Fifteen quantities were typed against an application passing hundreds between models.
   A type system covering a tenth of the traffic catches a tenth of the errors, and creates a false sense
   that the problem is handled. Every cross-model quantity is typed here, and an audit finds the ones that
   are not rather than trusting that the list is complete.

   MISSING DATA. The previous work diagnosed a mechanism and stopped. Diagnosis without a correction leaves
   the analysis biased and the user informed about it, which is better than silence and worse than fixing it.
   Inverse-probability weighting and multiple imputation are implemented, and — more importantly — a
   sensitivity analysis under MNAR, because the one case that matters most is the one no correction fixes.

   MEASUREMENT. Fusion weighted sources by a fixed reliability constant. A real measurement model separates
   the latent true value from each source's bias, its variance, and its drift over time, and estimates all
   of them from overlap rather than asserting them.
   ============================================================================ */

/* ---------------- universal typing ----------------
   Every quantity that crosses a model boundary, typed. The audit below is what makes this more than a list:
   it scans the actual outputs of the engines and reports quantities travelling untyped. */
var TYPES_EXTENDED={
  mechanicalDemand:{dimension:'index',unit:'index',temporal:'instant',aggregation:'sum',cls:'HEURISTIC',
    population:'this person only',note:'force-time proxy, comparable within a programme'},
  neuralDemand:{dimension:'index',unit:'index',temporal:'instant',aggregation:'sum',cls:'HEURISTIC',
    population:'this person only'},
  connectiveDemand:{dimension:'index',unit:'index',temporal:'instant',aggregation:'sum',cls:'HEURISTIC',
    population:'this person only'},
  metabolicDemand:{dimension:'index',unit:'index',temporal:'instant',aggregation:'sum',cls:'HEURISTIC',
    population:'this person only'},
  recoveryCost:{dimension:'index',unit:'index',temporal:'window',aggregation:'mean',cls:'HEURISTIC',
    population:'this person only'},
  effectiveSets:{dimension:'count',unit:'count',temporal:'window',aggregation:'sum',cls:'HEURISTIC',
    population:'this person only',note:'a weighted count, not a count of anything physical'},
  localFatigue:{dimension:'index',unit:'index',temporal:'cumulative',aggregation:'sum',cls:'HEURISTIC',
    population:'this person only'},
  systemicFatigue:{dimension:'index',unit:'index',temporal:'cumulative',aggregation:'sum',cls:'HEURISTIC',
    population:'this person only'},
  adherenceRisk:{dimension:'ratio',unit:'percent',temporal:'window',aggregation:'mean',cls:'DERIVED',
    population:'this person'},
  unifiedRecovery:{dimension:'zScore',unit:'z',temporal:'daily',aggregation:'mean',cls:'EMPIRICAL',
    population:'this person\u2019s own baseline'},
  cardioFitness:{dimension:'index',unit:'index',temporal:'window',aggregation:'last',cls:'EMPIRICAL',
    population:'this person',note:'resting heart rate inverted \u2014 a weak aerobic proxy'},
  conditioningDensity:{dimension:'index',unit:'index',temporal:'window',aggregation:'mean',cls:'EMPIRICAL',
    population:'this person'},
  leanMass:{dimension:'mass',unit:'lb',temporal:'instant',aggregation:'last',cls:'MEASURED',
    population:'this person'},
  neatDrift:{dimension:'count',unit:'count',temporal:'rate',aggregation:'slope',cls:'EMPIRICAL',
    population:'this person'},
  trainingLoadRatio2:{dimension:'ratio',unit:'ratio',temporal:'window',aggregation:'none',cls:'HEURISTIC',
    population:'this person'},
  propensityScore:{dimension:'ratio',unit:'ratio',temporal:'instant',aggregation:'mean',cls:'DERIVED',
    population:'this person'},
  causalEffect:{dimension:'massRate',unit:'lb/week',temporal:'rate',aggregation:'none',cls:'EMPIRICAL',
    population:'this person',note:'conditional on the graph being right'},
  posteriorMaintenance:{dimension:'energyRate',unit:'kcal/day',temporal:'window',aggregation:'none',
    cls:'BLENDED',population:'this person, pooled toward population'},
  tissueDensityValue:{dimension:'energyDensity',unit:'kcal/lb',temporal:'window',aggregation:'none',
    cls:'PRIOR',population:'population, adjusted'},
  stimulusQuality:{dimension:'index',unit:'index',temporal:'instant',aggregation:'mean',cls:'HEURISTIC',
    population:'this person only'},
  frictionScore:{dimension:'index',unit:'index',temporal:'window',aggregation:'mean',cls:'HEURISTIC',
    population:'this person'},
  deficitSize:{dimension:'energyRate',unit:'kcal/day',temporal:'daily',aggregation:'mean',cls:'DERIVED',
    population:'this person'},
  glycogenWater:{dimension:'mass',unit:'lb',temporal:'instant',aggregation:'last',cls:'DERIVED',
    population:'this person',note:'a residual, not separable into its parts'}
};
(function registerExtendedTypes(){
  try{Object.keys(TYPES_EXTENDED).forEach(function(k){if(!TYPES[k])TYPES[k]=TYPES_EXTENDED[k];});}catch(e){}
})();
/* The audit that makes the type system honest: find cross-model quantities travelling untyped. */
function untypedQuantities(){
  var g=(typeof window!=='undefined')?window:{};
  /* Engines whose outputs cross model boundaries, and the numeric fields they expose. */
  var probes=[
    ['weightTrend',function(){return weightTrend(14);}],
    ['tdeePersonal',function(){return tdeePersonal();}],
    ['readinessState',function(){return readinessState();}],
    ['unifiedRecovery',function(){return unifiedRecovery();}],
    ['trainingLoad',function(){return trainingLoad();}],
    ['effectiveSets',function(){return effectiveSets(7);}],
    ['fatigueCompartments',function(){return fatigueCompartments(14);}],
    ['tissueEnergyDensity',function(){return tissueEnergyDensity();}],
    ['tdeeBayes',function(){return tdeeBayes();}],
    ['cardioFitnessState',function(){return cardioFitnessState();}],
    ['adherenceState',function(){return adherenceState(14);}]
  ];
  /* Which declared type an engine's principal output carries. Without this the audit cannot tell that
     tdeePersonal.value IS the quantity `tdee`, and reports honest work as untyped. */
  var ENGINE_OUTPUT={tdeePersonal:'tdee',weightTrend:'weightTrend',readinessState:'readiness',
    unifiedRecovery:'unifiedRecovery',trainingLoad:'trainingLoadRatio',
    effectiveSets:'effectiveSets',fatigueCompartments:'localFatigue',
    tissueEnergyDensity:'tissueDensityValue',tdeeBayes:'posteriorMaintenance',
    cardioFitnessState:'cardioFitness',adherenceState:'adherence'};
  var PRINCIPAL=/^(value|mean|score|estimate|index|ratio|kcalPerLb|systemic|neural|density|slopePerWeek|overall|acute|chronicPerWeek)$/;
  /* Internal diagnostics are not cross-model quantities and do not need a semantic type: a window length or
     an excluded-row count never crosses a model boundary as a measured value. Counting them as untyped made
     the coverage figure describe something nobody was trying to achieve. */
  var DIAGNOSTIC=/^(window|span|excluded[A-Z]|slopeSe|residSd|intakeDays|setsConsidered|inferredKinds|missingEffort|sessions|records|readings|pricedEntries|totalEntries|draws|replayPoints|weeks|fromSessions|of|have|present)/;
  var BOUND=/^(lo|hi|sd|se|p10|p25|p75|p90|min|max)$/;
  var untyped=[],typedCount=0,checked=0,diagnostics=0;
  var IGNORE=/^(status|cls|note|caveat|need|days|n|rows|parts|confidence|band|verdict|label|id|date|why|source|interpretation|updates|silentDays|lastObserved|model|unit|reasons|missing|coverage)$/;
  probes.forEach(function(p){
    var v=null;try{v=p[1]();}catch(e){}
    if(!v||typeof v!=='object')return;
    Object.keys(v).forEach(function(k){
      if(typeof v[k]!=='number')return;
      if(IGNORE.test(k))return;
      if(DIAGNOSTIC.test(k)){diagnostics++;return;}
      checked++;
      /* A field is typed if its own name, or the engine's canonical output name, is in TYPES. */
      /* A field is typed when it names a declared type, or when it is the principal output (or an interval
         bound on it) of an engine whose output type IS declared. An interval bound inherits its quantity's
         type — `lo` is the same dimension as what it bounds. */
      var engineType=ENGINE_OUTPUT[p[0]];
      if(TYPES[k]||TYPES[k.replace(/Value$|Index$|Ratio$/,'')]||
         (engineType&&TYPES[engineType]&&(PRINCIPAL.test(k)||BOUND.test(k))))typedCount++;
      else untyped.push(p[0]+'.'+k);
    });
  });
  return {checked:checked,typed:typedCount,untyped:untyped,diagnostics:diagnostics,
    coverage:checked?round(100*typedCount/checked,0):null,
    typesDeclared:Object.keys(TYPES).length,
    cls:'POLICY',
    note:'Cross-model numeric fields actually emitted by the engines, checked against the type registry. '+
      diagnostics+' internal diagnostic field(s) were excluded, because a window length or an excluded-row count never crosses a model boundary as a measured value. A type system that covers a tenth of the traffic catches a tenth of the errors and creates a false sense that the problem is handled.',
    caveat:untyped.length?('Still untyped: '+untyped.slice(0,8).join(', ')+
      (untyped.length>8?(' and '+(untyped.length-8)+' more'):'')):'Every probed cross-model field resolves to a declared type.'};
}
/* ---------------- one typing system ----------------
   DATA_DICTIONARY described quantities in prose; TYPES described them for the machine. Two registries for
   one concept is how they drift: the RIR unit mismatch found earlier was exactly that, caught only because
   an audit happened to compare them. The dictionary is now DERIVED from the types, so there is one source
   and the drift is structurally impossible rather than merely detectable. */
function unifiedRegistry(){
  var rows=Object.keys(TYPES).map(function(k){
    var t=TYPES[k];
    var dim=DIMENSIONS[t.dimension]||{};
    var prose=DATA_DICTIONARY[k]||null;
    return {id:k,unit:t.unit,dimension:t.dimension,base:dim.base||null,
      temporal:t.temporal,temporalMeans:TEMPORAL[t.temporal]||null,
      aggregation:t.aggregation,aggregationMeans:AGGREGATION[t.aggregation]||null,
      cls:t.cls,population:t.population,
      /* Prose survives where it says something the type cannot — caveats, provenance — and is dropped
         where it merely restates the type, which is where it used to drift. */
      meaning:prose?prose.meaning:(t.note||null),
      owner:prose?prose.owner:null,
      notes:t.note||(prose?prose.notes:null)};
  });
  var orphans=Object.keys(DATA_DICTIONARY).filter(function(k){return !TYPES[k];});
  return {rows:rows,count:rows.length,proseOnly:orphans,cls:'POLICY',
    note:'One registry: the machine types are the source and the prose hangs off them. Two registries for one concept is how a unit says "reps" in one place and "count" in another — which happened here, and was caught only because something compared them.',
    caveat:orphans.length?('Still prose-only, and therefore unchecked: '+orphans.join(', ')):null};
}
function registryDrift(){
  var issues=[];
  Object.keys(DATA_DICTIONARY).forEach(function(k){
    var t=TYPES[k];if(!t)return;
    var d=DATA_DICTIONARY[k];
    if(d.unit&&t.unit&&d.unit.indexOf(t.unit)<0&&!/index|^z$/.test(t.unit))
      issues.push(k+': prose says "'+d.unit+'", type says "'+t.unit+'"');
  });
  return {issues:issues,ok:issues.length===0,
    note:'Prose and types must agree on units. They derive from one source now, so this should stay empty — and if it does not, a second registry has crept back in.'};
}
function _tCrit(df){
  /* The 97.5th percentile of Student-t, by bisection on the exact CDF already implemented. */
  if(!isFinite(df)||df>2000)return 1.96;
  var lo=1.5,hi=20;
  for(var i=0;i<40;i++){
    var mid=(lo+hi)/2;
    if(studentTP(mid,Math.max(1,df))>0.05)lo=mid;else hi=mid;
  }
  return round((lo+hi)/2,3);
}
/* ---------------- formal missing-data inference ---------------- */
function missingnessWeights(type,opts){
  opts=opts||{};
  var days=opts.days||90;
  var from=addDays(asOf(),-(days-1));
  var have={};
  obsOf(type,{from:from}).forEach(function(o){have[o.date]=o.value;});
  var all=[];for(var i=0;i<days;i++)all.push(addDays(from,i));
  var present=all.filter(function(d){return have[d]!=null;});
  if(present.length<15||present.length===all.length)
    return {status:present.length===all.length?'complete':'insufficient',
      present:present.length,of:all.length,
      note:present.length===all.length?'Nothing missing, so no weighting is needed.':
        'Too few present days to model the chance of being observed.'};
  /* Logistic model of BEING OBSERVED, on predictors the record can supply for every day. */
  var predictors=(opts.predictors||['steps','calories','sleep']).filter(function(p){return p!==type;});
  var cov={};
  predictors.forEach(function(p){
    cov[p]={};seriesWindow(p,days).forEach(function(d){cov[p][d.date]=d.value;});});
  var rows=[];
  all.forEach(function(d){
    var x=[1],ok=true;
    predictors.forEach(function(p){
      if(cov[p][d]==null)ok=false;else x.push(cov[p][d]);});
    /* Day of week is always available and is a common driver of whether someone logs. */
    x.push(new Date(d+'T12:00:00Z').getUTCDay()>=5?1:0);
    if(ok)rows.push({date:d,R:have[d]!=null?1:0,X:x});
  });
  if(rows.length<20)return {status:'insufficient',have:rows.length,
    need:['days where the predictors of being observed are themselves present'],
    note:'Modelling missingness needs predictors that are not themselves missing, which is the awkward part of this whole problem.'};
  var p2=rows[0].X.length;
  for(var j=1;j<p2-1;j++){
    var col=rows.map(function(r){return r.X[j];});
    var mu=mean(col),sg=sd(col)||1;
    rows.forEach(function(r){r.X[j]=(r.X[j]-mu)/sg;});
  }
  var beta=_logistic(rows.map(function(r){return r.X;}),rows.map(function(r){return r.R;}),{iters:400});
  rows.forEach(function(r){
    var z=0;for(var j2=0;j2<p2;j2++)z+=beta[j2]*r.X[j2];
    r.pObserved=1/(1+Math.exp(-z));
    r.weight=r.R?1/Math.max(0.05,r.pObserved):null;
  });
  var obs=rows.filter(function(r){return r.R;});
  var ws=obs.map(function(r){return r.weight;});
  var sumW=ws.reduce(function(a,x){return a+x;},0);
  var sumW2=ws.reduce(function(a,x){return a+x*x;},0);
  var extreme=obs.filter(function(r){return r.weight>5;}).length;
  var weighted=obs.reduce(function(a,r){return a+r.weight*have[r.date];},0)/sumW;
  var naive=mean(obs.map(function(r){return have[r.date];}));
  return {status:'ok',cls:'DERIVED',type:type,days:days,
    present:present.length,of:all.length,
    naiveMean:round(naive,2),weightedMean:round(weighted,2),
    difference:round(weighted-naive,2),
    effectiveSampleSize:round(sumW*sumW/sumW2,1),
    extremeWeights:extreme,
    trustworthy:extreme<=obs.length*0.1,
    note:'Inverse-probability weighting: days less likely to be logged count for more, so the estimate reflects all days rather than only the ones you felt like recording.',
    caveat:(extreme>obs.length*0.1?
      'More than a tenth of observed days carry a weight above five, which means the model thinks they almost never get logged. Estimates built on a handful of heavily weighted days are unstable. ':'')+
      'IPW corrects for missingness that depends on OBSERVED things. If logging depends on the unrecorded value itself, this does nothing and the bias remains.'};
}
function multipleImputation(type,opts){
  opts=opts||{};
  var m=opts.draws||20;
  var days=opts.days||60;
  var s=seriesWindow(type,days);
  if(s.length<10)return {status:'insufficient',need:['more observations to impute from']};
  var from=addDays(asOf(),-(days-1));
  var have={};s.forEach(function(d){have[d.date]=d.value;});
  var all=[];for(var i=0;i<days;i++)all.push(addDays(from,i));
  var missing=all.filter(function(d){return have[d]==null;});
  if(!missing.length)return {status:'complete',note:'Nothing to impute.'};
  var vals=s.map(function(d){return d.value;});
  var mu=mean(vals),sg=sd(vals)||1;
  var rnd=_mulberry32(opts.seed||20260920);
  /* A CONDITIONAL imputation model rather than draws from the marginal. Imputing from the overall
     distribution ignores that a Tuesday in a deficit is not an average day: every imputed value is pulled
     toward the grand mean, which biases the estimate and understates real variation. */
  var byDow={};
  s.forEach(function(d){var kk=new Date(d.date+'T12:00:00Z').getUTCDay();(byDow[kk]=byDow[kk]||[]).push(d.value);});
  var dowEffect={};
  Object.keys(byDow).forEach(function(kk){dowEffect[kk]=byDow[kk].length>=3?mean(byDow[kk])-mu:0;});
  var localLevel=function(date){
    var near=s.filter(function(d){return Math.abs(daysBetween(d.date,date))<=7;});
    return near.length>=3?mean(near.map(function(d){return d.value;})):mu;};
  var residArr=s.map(function(d){
    var kk=new Date(d.date+'T12:00:00Z').getUTCDay();
    return d.value-(localLevel(d.date)+(dowEffect[kk]||0));});
  var residSd=sd(residArr)||sg;
  var withins=[];
  var ests=[];
  for(var k=0;k<m;k++){
    /* Parameter uncertainty: each completed dataset draws its own residual scale, which is what makes the
       between-imputation variance mean anything. */
    var scaleDraw=residSd*Math.sqrt(Math.max(0.2,1+_gaussFrom(rnd)*0.15));
    var filled=all.map(function(d){
      if(have[d]!=null)return have[d];
      /* Draw from the observed distribution, carrying the uncertainty rather than substituting the mean \u2014
         mean-substitution is the classic error: it fills the gap and understates the variance. */
      var dow=new Date(d+'T12:00:00Z').getUTCDay();
      return localLevel(d)+(dowEffect[dow]||0)+_gaussFrom(rnd)*scaleDraw;
    });
    ests.push(mean(filled));
    /* Within-imputation variance is the sampling variance of the estimate IN THAT completed dataset. The
       previous version reused one marginal spread for every dataset, which is not a within-imputation
       variance at all. */
    withins.push(Math.pow(sd(filled)||scaleDraw,2)/all.length);
  }
  var qbar=mean(ests);
  var withinVar=mean(withins);
  var betweenVar=Math.pow(sd(ests)||0,2);
  /* Rubin's rules: total variance is within plus between plus a finite-m correction. */
  var total=withinVar+(1+1/m)*betweenVar;
  var se=Math.sqrt(total);
  var lambda=total>0?((1+1/m)*betweenVar)/total:0;
  var dfRubin=lambda>0?(m-1)/Math.pow(lambda,2):1e6;
  var tc=_tCrit(dfRubin);
  return {status:'ok',cls:'DERIVED',type:type,draws:m,
    imputed:missing.length,observed:s.length,
    estimate:round(qbar,2),se:round(se,3),
    withinVariance:round(withinVar,4),betweenVariance:round(betweenVar,4),
    fractionMissingInformation:round(lambda,3),df:round(dfRubin,1),tCritical:tc,
    /* Student-t at Rubin's degrees of freedom rather than a normal. */
    lo:round(qbar-tc*se,2),hi:round(qbar+tc*se,2),
    naive:round(mean(vals),2),
    fractionMissing:round(missing.length/all.length,2),
    note:'Multiple imputation with Rubin\u2019s rules from a conditional model (local level plus day-of-week): '+m+' completed datasets, with within- and between-imputation variance computed separately and the interval taken from Student-t at '+round(dfRubin,1)+' degrees of freedom, and the interval carries the extra uncertainty from having imputed rather than pretending the filled values were observed.',
    caveat:'Mean-substitution would give the same point estimate and a falsely narrow interval, which is why it is not used. This still assumes the data are missing at random \u2014 see the sensitivity analysis for what happens if they are not.'};
}
function mnarSensitivity(type,opts){
  opts=opts||{};
  var deltas=opts.deltas||[-2,-1,-0.5,0,0.5,1,2];
  var mi=multipleImputation(type,opts);
  if(mi.status!=='ok')return mi;
  var s=seriesWindow(type,opts.days||60);
  var sg=sd(s.map(function(d){return d.value;}))||1;
  var rows=deltas.map(function(dl){
    /* Shift the imputed values by delta standard deviations: what if the unobserved days were
       systematically different from the observed ones? */
    var shifted=mi.estimate+dl*sg*mi.fractionMissing;
    return {delta:dl,assumption:dl===0?'missing at random':
      ('unobserved days ran '+(dl>0?'+':'')+dl+' SD '+(dl>0?'higher':'lower')),
      estimate:round(shifted,2)};
  });
  var span=Math.max.apply(null,rows.map(function(r){return r.estimate;}))-
           Math.min.apply(null,rows.map(function(r){return r.estimate;}));
  return {status:'ok',cls:'DERIVED',type:type,rows:rows,
    span:round(span,2),fractionMissing:mi.fractionMissing,
    robust:span<sg*0.5,
    verdict:span<sg*0.5?
      'the conclusion holds across every plausible assumption about the missing days':
      ('the estimate moves by '+round(span,2)+' across plausible MNAR assumptions, which is more than the noise \u2014 so the conclusion depends on an assumption the data cannot check'),
    note:'Sensitivity analysis under MNAR. There is no test for this and no correction: the only honest treatment is to show how far the answer moves across assumptions you cannot rule out.',
    caveat:'A robust result here does not prove the data are missing at random. It shows the conclusion would survive if they were not, which is a weaker and more useful claim.'};
}
/* ---------------- probabilistic measurement model ----------------
   latent true value = observation - source bias - drift, with per-source variance estimated from overlap. */
/* ---------------- \u00a714: THE MEASUREMENT MODEL ----------------
   latent state \u2192 measurement process \u2192 source observation, with the seven source properties the direction
   names: bias, drift, noise, resolution, reliability, calibration, missingness. Each is MEASURED from the
   record or reported as not measurable with the reason \u2014 never defaulted.

   The first version defaulted an unmeasured source's variance to 1. With one source \u2014 the common case \u2014 the
   fused estimate then reported "\u00b11" that nobody had measured. A single source's noise IS measurable: it is
   the scatter of its readings around their own local level, which is what is used now. */
function _sourceNoise(list){
  /* Scatter around a centred 7-reading rolling median: day-to-day noise, with the underlying trend removed. */
  if(list.length<7)return null;
  var vals=list.map(function(o){return o.value;});
  var res=[];
  for(var k=3;k<vals.length-3;k++){
    var win=vals.slice(k-3,k+4).slice().sort(function(a,b){return a-b;});
    res.push(vals[k]-win[3]);
  }
  return res.length>=4?round(sd(res)||0,3):null;
}
function _resolution(list){
  /* The smallest step the source actually records: the instrument's resolution, as evidenced by its data. */
  var v=list.map(function(o){return o.value;}).filter(function(x){return x!=null&&isFinite(x);});
  var dp=v.reduce(function(a,x){var s=String(x),i=s.indexOf('.');return Math.max(a,i<0?0:s.length-i-1);},0);
  return {decimals:dp,step:Math.pow(10,-dp)};
}
function measurementModel(type,opts){
  opts=opts||{};
  var days=opts.days||180;
  var obs=obsOf(type,{from:addDays(asOf(),-days)});
  if(obs.length<10)return {status:'insufficient',need:['more observations']};
  var bySource={};
  obs.forEach(function(o){(bySource[o.source||'unspecified']=bySource[o.source||'unspecified']||[]).push(o);});
  var sources=Object.keys(bySource);
  /* Reference source: the one with the most readings. Bias is only ever relative to a choice. */
  var ref=sources.slice().sort(function(a,b){return bySource[b].length-bySource[a].length;})[0];
  var refByDate={};bySource[ref].forEach(function(o){refByDate[o.date]=o.value;});
  var cal=null;try{cal=sourceCalibration(type,{days:days});}catch(e){}
  var miss=null;try{miss=missingnessMechanism(type);}catch(e){}
  var first=obs[0].date,span=Math.max(1,daysBetween(first,asOf())+1);
  var params=sources.map(function(s){
    var list=bySource[s];
    var distinctDays={};list.forEach(function(o){distinctDays[o.date]=1;});
    var coverage=Object.keys(distinctDays).length/span;
    var base={source:s,reference:s===ref,n:list.length,
      noise:_sourceNoise(list),
      resolution:_resolution(list),
      reliability:{coverage:round(coverage,3),
        note:'the share of days in the window with a reading from this source'},
      missingness:{fraction:round(1-coverage,3),mechanism:miss&&miss.mechanism||'not assessed'}};
    if(s===ref){
      return Object.assign(base,{bias:0,drift:null,
        biasNote:'bias is zero by definition for the reference, which is a choice rather than a measurement',
        driftNote:'drift cannot be measured without a second source to measure it against',
        calibration:sources.length<2?
          {status:'uncalibrated',note:'one source, so nothing to calibrate against \u2014 it can be systematically wrong and nothing here would show it'}:
          {status:'reference',pairs:cal&&cal.status==='ok'?cal.pairs:null}});
    }
    var pairs=[];
    list.forEach(function(o){if(refByDate[o.date]!=null)pairs.push({date:o.date,d:o.value-refByDate[o.date]});});
    if(pairs.length<3)return Object.assign(base,{bias:null,drift:null,overlap:pairs.length,
      calibration:{status:'insufficient-overlap',note:'too little same-day overlap with the reference to estimate a bias'}});
    var ds=pairs.map(function(p){return p.d;});
    var ts=pairs.map(function(p){return {x:daysBetween(pairs[0].date,p.date),y:p.d};});
    var tsFit=theilSen(ts);
    return Object.assign(base,{bias:round(mean(ds),2),agreementSd:round(sd(ds)||0,2),overlap:pairs.length,
      drift:tsFit.slope!=null?{perMonth:round(tsFit.slope*30,3),
        drifting:Math.abs(tsFit.slope*30)>(sd(ds)||1)*0.5}:null,
      calibration:{status:'calibrated-against-reference',against:ref,pairs:pairs.length}});
  });
  /* Latent estimate for the latest day: each reading bias-corrected, weighted by its MEASURED noise. A source
     whose noise could not be measured does not contribute a made-up precision; if none can, the latent
     estimate carries no uncertainty figure at all rather than an invented one. */
  var latest=obs[obs.length-1].date;
  var sameDay=obs.filter(function(o){return o.date===latest;});
  var contributions=sameDay.map(function(o){
    var p=params.filter(function(x){return x.source===(o.source||'unspecified');})[0];
    var bias=p&&p.bias!=null?p.bias:0;
    var noise=p&&p.noise;
    return {source:o.source||'unspecified',raw:o.value,corrected:round(o.value-bias,2),
      noise:noise,precision:noise?1/(noise*noise):null};
  });
  var weighted=contributions.filter(function(c){return c.precision;});
  var tp=weighted.reduce(function(a,c){return a+c.precision;},0);
  var latent=tp?weighted.reduce(function(a,c){return a+c.corrected*c.precision;},0)/tp:
    (contributions.length?mean(contributions.map(function(c){return c.corrected;})):null);
  return {status:'ok',cls:'DERIVED',type:type,sources:sources.length,reference:ref,
    parameters:params,
    latest:{date:latest,contributions:contributions,
      latentEstimate:latent!=null?round(latent,2):null,
      sd:tp?round(Math.sqrt(1/tp),3):null,
      sdNote:tp?'from the measured day-to-day noise of the contributing source(s)':'no source\u2019s noise could be measured, so no uncertainty is claimed'},
    drifting:params.filter(function(p){return p.drift&&p.drift.drifting;}).map(function(p){return p.source;}),
    raw:'untouched \u2014 the fused estimate is derived on demand and never written back over a reading',
    note:'A latent true value behind the readings, with every source property measured from the record: bias and drift against the reference, noise from each source\u2019s own scatter, resolution from the values it records, reliability and missingness from coverage, calibration from same-day agreement.',
    caveat:'Bias is relative to whichever source was chosen as reference \u2014 here '+ref+
      ', because it has the most readings. That choice is a decision, not a measurement, and a biased reference makes every other bias wrong by the same amount.'};
}


/* ============================================================================
   STEP 2: ONE CANONICAL QUANTITY REGISTRY
   The direction: "Merge TYPES and TYPES_EXTENDED. Do not maintain separate quantity definitions."

   There were three: TYPES, TYPES_EXTENDED (copied into TYPES at load) and TYPE_ALIASES. That is the
   arrangement the direction forbids, and it is how a unit said "reps" in one place and "count" in another.
   QUANTITY_REGISTRY is now the single object. TYPES is not a copy of it \u2014 it IS it, the same reference, so
   existing consumers keep working and there is nothing to drift apart. Each entry gains the fields the
   direction specifies that the old registries lacked.
   ============================================================================ */
var QUANTITY_REGISTRY=(function(){
  /* Fold the extension set in first, so there is exactly one pass that owns every definition. */
  try{Object.keys(TYPES_EXTENDED).forEach(function(k){if(!TYPES[k])TYPES[k]=TYPES_EXTENDED[k];});}catch(e){}
  var PRECISION={mass:1,energy:0,energyRate:0,massRate:2,energyDensity:0,time:1,count:0,ratio:0,index:2,zScore:2};
  var UNCERTAINTY={MEASURED:'measurement',DERIVED:'model',EMPIRICAL:'sampling',CALIBRATED:'model',
    BLENDED:'parameter',PRIOR:'referenceData',HEURISTIC:'structural',PREDICTIVE:'forecast',POLICY:'none'};
  Object.keys(TYPES).forEach(function(k){
    var t=TYPES[k];
    var dim=DIMENSIONS[t.dimension]||{};
    t.id=k;
    t.unitFamily=t.dimension;
    t.canonicalUnit=dim.base||t.unit;
    t.acceptedUnits=dim.units?Object.keys(dim.units):[t.unit];
    t.precision=PRECISION[t.dimension]!=null?PRECISION[t.dimension]:2;
    t.temporalSemantics=t.temporal;
    t.uncertaintySemantics=UNCERTAINTY[t.cls]||'unspecified';
    /* A missing value of a quantity is a GAP, never a zero \u2014 the one rule every renderer must honour. */
    t.missingnessSemantics='gap';
    /* conversion and display (implementation direction \u00a72): the factors come from the dimension table itself, so they
       cannot drift from the converter that uses them. */
    t.conversion={canonicalUnit:t.canonicalUnit,factors:dim.units?Object.assign({},dim.units):{},rule:'value in unit \u00d7 factor = value in the canonical unit'};
    t.display={decimals:t.precision,unit:t.canonicalUnit,label:t.label||t.id};
  });
  return TYPES;   // the same object: one registry, two names during migration, zero copies
})();
/* Contract boundary: an unknown quantity is rejected rather than defaulted. */
function resolveQuantity(id){
  if(QUANTITY_REGISTRY[id])return QUANTITY_REGISTRY[id];
  if(typeof TYPE_ALIASES!=='undefined'&&TYPE_ALIASES[id]&&QUANTITY_REGISTRY[TYPE_ALIASES[id]])
    return QUANTITY_REGISTRY[TYPE_ALIASES[id]];
  return null;
}
function validateQuantityValue(id,value,unit){
  var q=resolveQuantity(id);
  if(!q)return {ok:false,reason:'unknown quantity "'+id+'" \u2014 rejected at the contract boundary rather than defaulted'};
  if(unit&&q.acceptedUnits.indexOf(unit)<0)
    return {ok:false,reason:'"'+unit+'" is not an accepted unit for '+id+' (accepts '+q.acceptedUnits.join(', ')+')'};
  if(value!=null&&typeof value!=='number')return {ok:false,reason:'not a number'};
  if(value!=null&&!isFinite(value))return {ok:false,reason:'not finite'};
  return {ok:true,quantity:id,canonicalUnit:q.canonicalUnit};
}
/* Dimensional compatibility BEFORE a calculation, not after a wrong answer. */
function assertDimensionallyCompatible(a,b){
  var qa=resolveQuantity(a),qb=resolveQuantity(b);
  if(!qa||!qb)return {ok:false,reason:'unknown quantity'};
  if(qa.dimension!==qb.dimension)
    return {ok:false,reason:a+' is '+qa.dimension+' and '+b+' is '+qb.dimension+'; combining them is a category error'};
  return {ok:true,dimension:qa.dimension};
}
function quantityRegistryAudit(){
  var REQUIRED=['dimension','unitFamily','canonicalUnit','acceptedUnits','precision','aggregation',
    'temporalSemantics','uncertaintySemantics','missingnessSemantics'];
  var issues=[];
  Object.keys(QUANTITY_REGISTRY).forEach(function(k){
    var q=QUANTITY_REGISTRY[k];
    REQUIRED.forEach(function(f){if(q[f]==null)issues.push(k+': missing '+f);});
    if(q.acceptedUnits&&q.acceptedUnits.indexOf(q.canonicalUnit)<0)
      issues.push(k+': canonical unit '+q.canonicalUnit+' is not among its accepted units');
  });
  return {quantities:Object.keys(QUANTITY_REGISTRY).length,issues:issues,ok:issues.length===0,
    singleSource:QUANTITY_REGISTRY===TYPES,
    note:'One registry. TYPES is the same object, not a copy, so the two names cannot disagree.'};
}
