/* ============================================================================
   REGION: MODELS — Layer 2 (state) and Layer 3 (models). Pure functions over observations.
   Every model is registered with an epistemic class, version, inputs, minimum evidence, assumptions and
   failure conditions. Below the minimum, a model returns {status:'insufficient'} — never a number.
   ============================================================================ */
var CLASSES={
  MEASURED:'read directly from an instrument or entered as a measurement',
  DERIVED:'computed from measurements by a fixed formula',
  HEURISTIC:'a rule of thumb \u2014 useful, not fitted to this person',
  POLICY:'a chosen operating rule, not a finding \u2014 a boundary this system elects to work within',
  PRIOR:'a generic starting assumption from population evidence, not from this record',
  EMPIRICAL:'fitted to this person\u2019s own logged intake and measurements',
  CALIBRATED:'corrected by comparing past predictions with what actually happened',
  PREDICTIVE:'a forecast of something that has not happened yet'
};
var MODELS=[
  {id:'weight_avg',name:'Rolling weight average',cls:'DERIVED',version:'1.0',inputs:['weight'],minN:4,assumes:['weigh-ins under similar conditions'],failsWhen:['fewer than 4 of the last 7 days logged','scale changed inside the window'],output:'7- and 14-day mean of daily weight'},
  {id:'weight_trend',name:'Weight trend',cls:'DERIVED',version:'1.1',inputs:['weight'],minN:7,assumes:['Theil\u2013Sen slope is robust to a few odd weigh-ins','a 14-day window separates noise from tissue change'],failsWhen:['fewer than 7 weigh-ins spanning 10+ days','scale change in window','extreme water disturbance (illness, travel, high sodium)'],output:'slope in lb/week with residual noise and confidence'},
  {id:'water_noise',name:'Water-noise probability',cls:'HEURISTIC',version:'1.0',inputs:['water_noise|weight volatility','context|context tags','record.phases|phase age','carbs|carbohydrate swings'],minN:5,assumes:['glycogen, sodium, bowel contents and training inflammation move scale weight without changing fat mass'],failsWhen:['no context logged and volatility is ambiguous'],output:'low / medium / high'},
  {id:'tdee_prior',name:'TDEE prior (Mifflin-St Jeor \u00d7 activity)',cls:'PRIOR',version:'1.0',inputs:['profile.age|age','profile.sex|sex','profile.heightIn|height','weight','profile.activityBaseline|activity baseline'],minN:0,assumes:['population RMR equation; activity multiplier is a rough band'],failsWhen:['profile incomplete'],output:'starting estimate with \u00b1 ~15% uncertainty; replaced as personal evidence accumulates'},
  {id:'tdee_personal',name:'Personal energy model',cls:'EMPIRICAL',version:'1.2',inputs:['calories','weight_trend|weight trend','adherence|logging coverage','adherence'],minN:14,assumes:['tissue lost/gained averages about 3,200 kcal/lb (\u00b1500) at higher body fat','intake logging error of about \u00b110% unless adherence data says otherwise','no large change in activity inside the window'],failsWhen:['under 14 usable days','intake coverage under 70%','weight trend insufficient','rapid phase transition or extreme water disturbance'],output:'estimated TDEE with interval, evidence count and calibration status'},
  {id:'energy_balance',name:'Energy balance',cls:'DERIVED',version:'1.0',inputs:['calories|mean intake','tdee_personal|estimated TDEE'],minN:7,assumes:['inherits TDEE uncertainty'],failsWhen:['TDEE insufficient'],output:'observed deficit/surplus estimate'},
  {id:'bodycomp_circ',name:'Body-fat estimate (circumference model)',cls:'HEURISTIC',version:'1.0',inputs:['waist','neck','profile.heightIn|height','hip|hip (female)'],minN:1,assumes:['U.S. Navy circumference equation; population fit, \u00b13\u20134% typical error'],failsWhen:['waist or neck missing','measurements older than 30 days','method inconsistency'],output:'body-fat range and fat/lean mass ranges'},
  {id:'fat_vs_other',name:'Fat vs other mass change',cls:'HEURISTIC',version:'1.0',inputs:['weight_trend|weight trend','waist|waist trend','record.phases|phase age','water_noise|water noise'],minN:14,assumes:['a falling waist alongside a falling trend indicates fat loss is the dominant component'],failsWhen:['fewer than 2 waist measurements 10+ days apart','first 14 days of a cut (glycogen/water)'],output:'plausible split, never a precise fat number'},
  {id:'rate_band',name:'Sustainable rate band',cls:'POLICY',version:'1.1',inputs:['weight|current weight','record.phases|phase'],minN:0,assumes:['0.5\u20131% body weight/week; tighter as body mass falls to protect lean tissue','the zone boundaries (250/230/210/190 lb) are chosen operating limits, not measured thresholds'],failsWhen:['no weight'],output:'the lb/week range this system elects to work within for the current weight zone'},
  {id:'goal_traj',name:'Goal trajectory',cls:'PREDICTIVE',version:'1.0',inputs:['weight_avg|7-day average','canonicalGoal|goal weight (profile) or phase milestone','weight_trend|trend','profile.targetDate|deadline'],minN:7,assumes:['current trend persists, which it will not exactly; interval widens with horizon'],failsWhen:['trend insufficient','trend not converging on goal'],output:'required rate, status, projected date range'},
  {id:'weight_forecast',name:'Weight forecast',cls:'PREDICTIVE',version:'1.0',inputs:['weight_avg|7-day average','weight_trend|trend','water_noise|residual noise'],minN:7,assumes:['linear trend over 7\u201328 days; interval = residual noise + slope uncertainty'],failsWhen:['trend insufficient','phase change inside horizon'],output:'point and interval at 7/14/28 days; stamped to the ledger before outcomes'},
  {id:'e1rm',name:'Estimated 1RM',cls:'DERIVED',version:'1.0',inputs:['session.load|load','session.reps|reps'],minN:1,assumes:['Epley/Brzycki/Lander/Lombardi/Mayhew consensus; reliability falls above ~10 reps'],failsWhen:['reps > 15','load missing'],output:'e1RM consensus with estimator spread'},
  {id:'strength_trend',name:'Strength trend',cls:'DERIVED',version:'1.0',inputs:['record.sessions|sessions','e1rm|e1RM per exercise'],minN:4,assumes:['comparable exercises across sessions'],failsWhen:['fewer than 4 exposures of an exercise','program change'],output:'improving / stable / declining per exercise and overall'},
  {id:'recovery',name:'Recovery state',cls:'HEURISTIC',version:'1.0',inputs:['sleep','sleepq|sleep quality','fatigue','soreness','stress'],minN:3,assumes:['subjective ratings are honest and roughly consistent'],failsWhen:['fewer than 3 ratings in 7 days'],output:'good / acceptable / strained / poor / unknown with the signals that drove it'},
  {id:'appetite',name:'Appetite burden',cls:'HEURISTIC',version:'1.0',inputs:['hunger','cravings','fullness','difficulty'],minN:3,assumes:['ratings reflect daily experience'],failsWhen:['no ratings'],output:'low / moderate / high'},
  {id:'muscle_risk',name:'Muscle-retention risk',cls:'HEURISTIC',version:'1.0',inputs:['strength_trend|strength trend','protein|protein adherence','weight_trend|rate of loss','recovery','adherence|training consistency'],minN:7,assumes:['strength and protein are the strongest available proxies; scale weight is not muscle'],failsWhen:['no training record','no protein record'],output:'low / medium / high / insufficient'},
  {id:'adherence',name:'Adherence',cls:'DERIVED',version:'1.0',inputs:['calories','protein','steps','record.sessions|sessions','sleep','record.phases|plan targets'],minN:3,assumes:['unlogged days are unknown, not zero'],failsWhen:['no plan targets'],output:'per-stream adherence, never one collapsed score'},
  {id:'data_trust',name:'Data trust',cls:'DERIVED',version:'1.0',inputs:['coverage','freshness','adherence|consistency','change_point|anomalies'],minN:0,assumes:['confidence of any model cannot exceed the trust of its inputs'],failsWhen:['\u2014'],output:'per-stream trust with reasons'},
  {id:'met_energy',name:'Activity energy (MET)',cls:'DERIVED',version:'1.0',inputs:['session.modality|modality','session.duration|duration','weight|body weight'],minN:1,assumes:['2024 Compendium METs are population averages; \u00b120%'],failsWhen:['modality unknown'],output:'estimated kcal for a session, never measured expenditure'},
  {id:'personal_baseline',name:'Personal baselines',cls:'EMPIRICAL',version:'1.0',inputs:['weight','steps','sleep','hunger','fatigue','stress','soreness','calories','protein','cardio','record.sessions|sessions'],minN:10,assumes:['the first half of the window represents \u201cusual\u201d for this person','robust centre and spread (median / MAD) resist a few odd days'],failsWhen:['fewer than 10 logged days in a stream','a protocol change inside the window (a new scale rebases weight noise)'],output:'per-stream personal centre, spread and where the last 7 days sit against it'},
  {id:'measurement_quality',name:'Measurement quality',cls:'DERIVED',version:'1.0',inputs:['record.observations|observation source','record.observations|flags','record.observations|protocol conditions','record.observations|method consistency'],minN:1,assumes:['self-reported protocol adherence is honest'],failsWhen:['no protocol recorded \u2014 quality then reflects only source and flags'],output:'0\u20131 quality score per observation and per stream'},
  {id:'change_point',name:'Change-point detection',cls:'DERIVED',version:'1.0',inputs:['weight_trend|weight trend series','steps','sleep','calories|intake','fatigue','hunger','e1rm|e1RM'],minN:14,assumes:['a single shift in level or slope; between-segment difference vs pooled spread'],failsWhen:['fewer than 2\u00d7 the minimum segment length','several changes inside one window (only the strongest is reported)'],output:'dated shifts per stream with candidate causes and an attribution strength'},
  {id:'response_matrix',name:'Personal response matrix',cls:'EMPIRICAL',version:'1.0',inputs:['record.experiments|completed experiments','record.interventions|interventions','weight_trend|weight trend before/after','record.phases|phase','rate_band|weight zone'],minN:1,assumes:['the trend difference around an intervention estimates its effect when no other variable moved'],failsWhen:['no completed experiment for a variable','2+ confounders inside the window'],output:'effect per unit change, n, confidence and confounders per variable'},
  {id:'exercise_response',name:'Exercise-level response',cls:'EMPIRICAL',version:'1.0',inputs:['session.sets|sets per exercise','session.load|load \u00d7 reps','session.rir|RIR','record.sessions|session dates'],minN:4,assumes:['e1RM slope over exposures tracks the training response for that lift'],failsWhen:['fewer than 4 exposures','exercise variant or equipment changed inside the window'],output:'per-exercise slope, volume-vs-response, fatigue cost and a progression suggestion'},
  {id:'uncertainty_chain',name:'Uncertainty propagation',cls:'DERIVED',version:'1.0',inputs:['calories|intake coverage','measurement_quality|measurement quality','tdee_personal|TDEE interval','weight_trend|trend interval'],minN:7,assumes:['independent error sources add in quadrature'],failsWhen:['TDEE insufficient'],output:'an energy-balance interval and the decision confidence ceiling it implies'}
];
/* ---- data contracts: every model declares consumers, freshness and how its uncertainty is expressed.
   The self-test asserts that these are complete and that every declared consumer actually exists. ---- */
var MODEL_CONTRACTS={
  weight_avg:{consumers:['weight_trend','tdee_personal','goal_traj','today|Today vitals','body|Body view'],freshnessDays:3,uncertainty:'none (a mean); its inputs carry the noise'},
  weight_trend:{consumers:['tdee_personal','rate_band|rate_band comparison','weight_forecast','fat_vs_other','diagnose','decide','change_point'],freshnessDays:3,uncertainty:'95% slope interval from the OLS standard error, plus residual noise'},
  water_noise:{consumers:['fat_vs_other','diagnose','decide','body|Body view'],freshnessDays:3,uncertainty:'ordinal (low / medium / high) with the drivers listed'},
  tdee_prior:{consumers:['tdee_personal|tdee_personal blending','calorieTargetSuggestion','today|Today vitals'],freshnessDays:30,uncertainty:'\u00b115% band around the population equation'},
  tdee_personal:{consumers:['energy_balance','calorieTargetSuggestion','learningSummary','uncertainty_chain'],freshnessDays:3,uncertainty:'95% interval combining slope error, tissue-density spread and logging error'},
  energy_balance:{consumers:['diagnose','food|Food view','uncertainty_chain'],freshnessDays:3,uncertainty:'inherited TDEE interval'},
  bodycomp_circ:{consumers:['body|Body view','data_trust','learningSummary'],freshnessDays:30,uncertainty:'\u00b13\u20134 percentage points (population fit)'},
  fat_vs_other:{consumers:['body|Body view','diagnose'],freshnessDays:14,uncertainty:'a qualitative verdict; a numeric split only with measured composition'},
  rate_band:{consumers:['decide','diagnose','muscle_risk','goal_traj'],freshnessDays:30,uncertainty:'a policy range, not an estimate'},
  goal_traj:{consumers:['today|Today forecast','plan|Plan view'],freshnessDays:7,uncertainty:'projection range from the trend interval'},
  weight_forecast:{consumers:['record.predictions|prediction ledger','today|Today forecast','forecastAccuracy'],freshnessDays:3,uncertainty:'point plus interval from slope error and scale noise'},
  e1rm:{consumers:['strength_trend','exercise_response','train|Train view'],freshnessDays:7,uncertainty:'spread across five estimator formulas'},
  strength_trend:{consumers:['muscle_risk','decide','diagnose','change_point','train|Train view'],freshnessDays:7,uncertainty:'direction per lift; confidence from the number of tracked lifts'},
  recovery:{consumers:['decide','diagnose','muscle_risk','todaysTraining'],freshnessDays:3,uncertainty:'ordinal level from the count and severity of signals'},
  appetite:{consumers:['diagnose','decide','learningSummary'],freshnessDays:3,uncertainty:'ordinal burden level'},
  muscle_risk:{consumers:['decide','diagnose','body|Body view'],freshnessDays:7,uncertainty:'ordinal level; the contributing proxies are listed'},
  adherence:{consumers:['decide','diagnose','tdee_personal|tdee_personal logging error','data_trust'],freshnessDays:3,uncertainty:'per-stream percentages, never one collapsed score'},
  data_trust:{consumers:['decide|decide (confidence ceiling)','valueOfInformation','uncertainty_chain'],freshnessDays:3,uncertainty:'per-stream levels plus an overall percentage'},
  met_energy:{consumers:['log|Log view cardio estimate','steps|activity context'],freshnessDays:7,uncertainty:'\u00b120% (population METs)'},
  personal_baseline:{consumers:['recovery','change_point','diagnose','learn|Learn view'],freshnessDays:7,uncertainty:'median with MAD spread; z-scores against the personal centre'},
  measurement_quality:{consumers:['data_trust','weight_trend|weight_trend exclusion of off-protocol weigh-ins','log|Log view'],freshnessDays:1,uncertainty:'0\u20131 score with the deductions listed'},
  change_point:{consumers:['diagnose','diagnose|Diagnose view','attributeChange'],freshnessDays:7,uncertainty:'t statistic of the shift; attribution strength stated separately'},
  response_matrix:{consumers:['decide|decide (expected effect)','counterfactual','learn|Learn view'],freshnessDays:60,uncertainty:'effect per unit with n and confounder count'},
  exercise_response:{consumers:['train|Train view','record.sessions|progression suggestion'],freshnessDays:14,uncertainty:'slope with exposure count; compared against personal e1RM noise'},
  uncertainty_chain:{consumers:['decide|decide (numeric confidence)','today|Today technical detail'],freshnessDays:3,uncertainty:'the interval it produces is the uncertainty'}
};
MODELS.forEach(function(m){var c=MODEL_CONTRACTS[m.id]||{};m.consumers=c.consumers||[];m.freshnessDays=c.freshnessDays!=null?c.freshnessDays:null;m.uncertainty=c.uncertainty||'not declared';});
function modelById(id){return MODELS.filter(function(m){return m.id===id;})[0]||null;}
/* ---------------- TYPED CONTRACT RESOLUTION ----------------
   The contract used to accept a consumer if the string merely CONTAINED one of a handful of words — "view",
   "profile", "weight_trend|trend", "training". That makes "contract passes" a statement about vocabulary rather than
   about wiring: a consumer could name something that does not exist and still pass.

   Every declared input and consumer now has to resolve to a concrete node in the build: another model, a
   declared observation type, a real view, a function that actually exists, or a named profile field. What
   does not resolve is reported with the exact string, so the declaration gets fixed rather than the check
   loosened. */
var CONTRACT_SURFACES=['today','log','plan','train','food','body','progress','diagnose','experiments','learn','archive','tools'];
var SESSION_FIELDS=['sets','reps','load','rir','date','exercise','duration','modality','tempo'];
var RECORD_COLLECTIONS=['observations','sessions','foodLogs','phases','interventions','experiments','predictions','decisions','negativeKnowledge','settings','programHistory'];
function resolveContractRef(ref){
  /* "ref|human prose": the machine reference first, the sentence people read second. Keeping both in one
     string means the prose cannot drift away from the thing it describes, which is what happens when a
     contract carries a parallel documentation field. */
  var raw=String(ref||'').trim();
  var r=raw.indexOf('|')>=0?raw.slice(0,raw.indexOf('|')).trim():raw;
  if(!r)return {resolved:false,kind:'empty'};
  if(/^session\.[a-zA-Z]+$/.test(r)){
    var sf=r.split('.')[1];
    return (SESSION_FIELDS.indexOf(sf)>=0)?{resolved:true,kind:'session',id:r}:{resolved:false,kind:'unknown session field'};
  }
  if(/^record\.[a-zA-Z]+$/.test(r)){
    var rc=r.split('.')[1];
    return (RECORD_COLLECTIONS.indexOf(rc)>=0)?{resolved:true,kind:'record',id:r}:{resolved:false,kind:'unknown collection'};
  }
  if(MODELS.some(function(m){return m.id===r;}))return {resolved:true,kind:'model',id:r};
  if(OBS_TYPES[r])return {resolved:true,kind:'observation',id:r};
  if(CONTRACT_SURFACES.indexOf(r)>=0)return {resolved:true,kind:'surface',id:r};
  if(/^profile\.[a-zA-Z]+$/.test(r)){
    var f=r.split('.')[1];
    return (PROFILE_FIELDS.indexOf(f)>=0)?{resolved:true,kind:'profile',id:r}:{resolved:false,kind:'unknown profile field'};
  }
  if(/^setting\.[a-zA-Z]+$/.test(r))return {resolved:true,kind:'setting',id:r};
  if(/^domain\.[a-zA-Z]+$/.test(r)){
    var d=r.split('.')[1];
    return (typeof DOMAINS!=='undefined'&&DOMAINS[d])?{resolved:true,kind:'domain',id:r}:{resolved:false,kind:'unknown domain'};
  }
  /* A bare identifier must be a function that genuinely exists in the build. */
  if(/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(r)){
    var g=(typeof window!=='undefined')?window:(typeof globalThis!=='undefined'?globalThis:{});
    if(typeof g[r]==='function')return {resolved:true,kind:'function',id:r};
    return {resolved:false,kind:'no such function'};
  }
  return {resolved:false,kind:'unrecognised reference'};
}
var PROFILE_FIELDS=['name','age','sex','heightIn','startWeightLb','goalWeightLb','goalType','targetDate','trainingExperience','activityBaseline','dietPreference','equipment','schedule','sleepTargetH','sessionMinutes','cookingTime','foodBudget','dietRestrictions'];
/* The dependency graph the contract describes, materialised so it can be inspected rather than asserted. */
function contractLabel(ref){
  var raw=String(ref||'');
  return raw.indexOf('|')>=0?raw.slice(raw.indexOf('|')+1).trim():raw;
}
function modelGraph(){
  var nodes=[],edges=[],unresolved=[];
  MODELS.forEach(function(m){nodes.push({id:'model:'+m.id,kind:'model',label:m.label||m.id,cls:m.cls});});
  MODELS.forEach(function(m){
    (m.inputs||[]).forEach(function(i){
      var r=resolveContractRef(i);
      if(!r.resolved){unresolved.push({model:m.id,side:'input',ref:i,why:r.kind});return;}
      var key=r.kind+':'+r.id;
      if(!nodes.some(function(n){return n.id===key;}))nodes.push({id:key,kind:r.kind,label:r.id});
      edges.push({from:key,to:'model:'+m.id,rel:'feeds'});
    });
    (m.consumers||[]).forEach(function(c){
      var r=resolveContractRef(c);
      if(!r.resolved){unresolved.push({model:m.id,side:'consumer',ref:c,why:r.kind});return;}
      var key=r.kind+':'+r.id;
      if(!nodes.some(function(n){return n.id===key;}))nodes.push({id:key,kind:r.kind,label:r.id});
      edges.push({from:'model:'+m.id,to:key,rel:'used by'});
    });
  });
  /* A model nothing consumes and that feeds nothing is dead weight; report it rather than let it sit. */
  var orphans=MODELS.filter(function(m){
    return !edges.some(function(e){return e.from==='model:'+m.id||e.to==='model:'+m.id;});
  }).map(function(m){return m.id;});
  return {nodes:nodes,edges:edges,unresolved:unresolved,orphans:orphans,
    note:'Every edge resolves to a concrete node in the build \u2014 a model, an observation type, a view, a real function or a named profile field. A reference that resolves to nothing is reported rather than matched by vocabulary.'};
}
function modelContractIssues(){ // reverse validation: every declared input and consumer must resolve to a real node
  var issues=[];var ids={};MODELS.forEach(function(m){ids[m.id]=1;});
  MODELS.forEach(function(m){
    if(!m.cls||!CLASSES[m.cls])issues.push({model:m.id,kind:'unknown epistemic class'});
    if(!m.inputs||!m.inputs.length)issues.push({model:m.id,kind:'no declared inputs'});
    if(!m.output)issues.push({model:m.id,kind:'no declared output'});
    if(!m.assumes||!m.assumes.length)issues.push({model:m.id,kind:'no declared assumptions'});
    if(!m.failsWhen||!m.failsWhen.length)issues.push({model:m.id,kind:'no declared failure conditions'});
    if(!m.consumers||!m.consumers.length)issues.push({model:m.id,kind:'output has no consumer'});
    if(m.uncertainty==='not declared')issues.push({model:m.id,kind:'no declared uncertainty'});
    (m.consumers||[]).forEach(function(c){
      var r=resolveContractRef(c);
      if(!r.resolved)issues.push({model:m.id,kind:'consumer does not resolve to anything in the build',ref:c});
    });
    (m.inputs||[]).forEach(function(i){
      var r=resolveContractRef(i);
      if(!r.resolved)issues.push({model:m.id,kind:'input does not resolve to anything in the build',ref:i});
    });
  });
  return issues;
}
function insufficient(model,need,extra){var o={status:'insufficient',confidence:'insufficient',model:model,need:need||[],note:'insufficient observations'};if(extra)Object.keys(extra).forEach(function(k){o[k]=extra[k];});return o;}
/* The profile is a MODEL INPUT — height and sex feed BMR, which feeds maintenance, which feeds the calorie
   target and the decision. Reading the current profile during a replay leaks today's values into a past day's
   reasoning, which is exactly what replay exists to prevent. A height corrected in March must not change what
   February's decision was computed from.

   Rather than add a profileAsOf() and then a settingsAsOf() and so on, the profile is resolved from the EVENT
   PROJECTION while replaying. That is the direction the whole replay path should eventually move in: one
   mechanism, not a growing family of as-of accessors. */
var _PROFILE_ASOF_CACHE={date:null,value:null,eventCount:-1};
function profileAsOf(date){
  if(!date)return DB.profile||{};
  if(typeof projectEvents!=='function'||typeof _EVENTS==='undefined')return DB.profile||{};
  if(_PROFILE_ASOF_CACHE.date===date&&_PROFILE_ASOF_CACHE.eventCount===_EVENTS.length)return _PROFILE_ASOF_CACHE.value;
  /* Before the date this record entered the event history, the profile cannot be reconstructed: the
     adoption snapshot holds only what the values were at adoption, and there is no evidence they held
     earlier. Returning today's profile there was the previous behaviour and it was wrong — it presents a
     guess in the position of a fact, and the models downstream cannot tell the difference. An empty profile
     instead makes bmrPrior() and everything after it report insufficient, which is true. */
  if(typeof beforeBaseline==='function'&&beforeBaseline(date)){
    var out={__unavailable:true,__baseline:recordBaseline().date};
    _PROFILE_ASOF_CACHE={date:date,value:out,eventCount:_EVENTS.length};
    return out;
  }
  var p;
  try{p=projectEvents(_EVENTS,{asOf:date}).db.profile||{};}
  catch(e){_q(e,'P1');p=DB.profile||{};}
  if(!p||!Object.keys(p).length)p=DB.profile||{};
  _PROFILE_ASOF_CACHE={date:date,value:p,eventCount:_EVENTS.length};
  return p;
}
function prof(){
  if(typeof _ASOF!=='undefined'&&_ASOF)return profileAsOf(_ASOF);
  return DB.profile||{};
}
/* Which profile fields have ever changed, and when. Used by the trace and by the replay comparison so a
   reader can see that a past figure rested on a different height or age. */
function profileHistory(){
  if(typeof _EVENTS==='undefined')return [];
  var out=[],prev={};
  _EVENTS.filter(function(e){return e.type==='profile.changed'||e.type==='record.snapshot';})
    .forEach(function(e){
      var p=e.type==='record.snapshot'?((e.data&&e.data.record&&e.data.record.profile)||null):e.data;
      if(!p)return;
      var changed=[];
      Object.keys(p).forEach(function(k){
        if(typeof p[k]==='object')return;
        if(prev[k]!==undefined&&prev[k]!==p[k])changed.push({field:k,from:prev[k],to:p[k]});
        prev[k]=p[k];
      });
      if(changed.length)out.push({at:e.at,date:localDateOf(e.at),changed:changed,
        source:e.type==='record.snapshot'?'baseline':'edited'});
    });
  return out.sort(function(a,b){return a.at<b.at?1:-1;});
}
function profileTemporalState(){
  var b=(typeof recordBaseline==='function')?recordBaseline():{};
  var h=profileHistory();
  if(b.adopted)return {changes:h.length,hasEvents:true,baseline:b.date,adopted:true,
    fields:h.reduce(function(a,x){x.changed.forEach(function(c){if(a.indexOf(c.field)<0)a.push(c.field);});return a;},[]),
    note:'This record entered the event history on '+longDate(b.date)+'. Observations before then are kept and shown, but the profile as it stood on those dates cannot be reconstructed, so replays before that date report the energy figures as unavailable rather than assuming today\u2019s values.'};
  var hasEvents=(typeof _EVENTS!=='undefined')&&_EVENTS.some(function(e){return e.type==='profile.changed';});
  return {changes:h.length,hasEvents:hasEvents,
    fields:h.reduce(function(a,x){x.changed.forEach(function(c){if(a.indexOf(c.field)<0)a.push(c.field);});return a;},[]),
    note:h.length?'Replays before a profile edit use the profile as it stood then, because height, age and sex feed BMR and therefore every energy figure downstream.':
      'The profile has not changed, so replay and today read the same values.'};
}
function weightKgNow(){var w=currentWeight();return w.value!=null?lbToKg(w.value):(prof().startWeightLb?lbToKg(prof().startWeightLb):null);}

/* ---- weight ---- */
function currentWeight(){var o=latestObs('weight');if(!o)return {value:null,obs:null};return {value:o.value,date:o.date,obs:o,fresh:freshness('weight',o.date)};}
function weightAverages(){
  var s7=seriesWindow('weight',7),s14=seriesWindow('weight',14);
  var a7=s7.length>=4?mean(s7.map(function(d){return d.value;})):null,a14=s14.length>=7?mean(s14.map(function(d){return d.value;})):null;
  return {avg7:a7,n7:s7.length,avg14:a14,n14:s14.length,last:s7.length?s7[s7.length-1]:null,status:a7==null?'insufficient':'ok',cls:'DERIVED',need:a7==null?[(4-s7.length)+' more weigh-ins this week']:[]};
}
function weightTrend(windowDays,asOfDate){
  windowDays=windowDays||14;
  var s=dailySeries('weight',asOfDate||asOf(),windowDays);
  /* protocol discipline: a weigh-in taken off-protocol (different time of day, after eating, clothed, other
     scale) is a different measurement, not a different body. Off-protocol readings are removed at the
     observation level and the day is re-averaged from what remains; a day with nothing left drops out.
     Applied only while at least 7 on-protocol days survive, so a careful week is never reduced to noise. */
  var offProtocol=0;
  var std=[];
  s.forEach(function(d){
    var obs=d.obs||[];var keep=obs.filter(function(o){return !(o.meta&&o.meta.protocol==='off');});
    if(keep.length===obs.length){std.push(d);return;}
    offProtocol+=obs.length-keep.length;
    if(!keep.length)return;
    std.push({date:d.date,x:d.x,n:keep.length,obs:keep,value:keep.reduce(function(a2,o){return a2+o.value;},0)/keep.length});
  });
  if(offProtocol&&std.length>=7)s=std;else offProtocol=0;
  var pts=s.map(function(d){return {x:d.x,y:d.value};});
  var span=s.length?daysBetween(s[0].date,s[s.length-1].date):0;
  /* Every model must declare its epistemic class, or the presentation layer cannot style it honestly and
     defaults to looking authoritative. The visualization contract check caught this one missing. */
  var res={model:'weight_trend',cls:'DERIVED',window:windowDays,n:s.length,span:span};
  if(s.length<7||span<10)return insufficient('weight_trend',[(Math.max(0,7-s.length))+' more weigh-ins over '+Math.max(0,10-span)+' more days'],res);
  var ts=theilSen(pts),ol=ols(pts);
  var perWeek=ts.slope*7;
  var noise=ol.residSd;var slopeSe=ol.se!=null?ol.se*7:null;
  var deviceChange=hasContext(/new scale|scale changed/i,windowDays);
  var conf='low';
  if(s.length>=12&&span>=13&&noise!=null&&noise<1.5&&!deviceChange)conf='high';else if(s.length>=9&&!deviceChange)conf='medium';
  if(slopeSe!=null&&Math.abs(perWeek)<slopeSe*1.2&&conf==='high')conf='medium'; // slope indistinguishable from flat at high noise
  res.status='ok';res.excludedOffProtocol=offProtocol;res.slopePerWeek=perWeek;res.slopeSe=slopeSe;res.residSd=noise;res.r2=ol.r2;res.lo=slopeSe!=null?perWeek-1.96*slopeSe:null;res.hi=slopeSe!=null?perWeek+1.96*slopeSe:null;res.confidence=conf;res.deviceChange=deviceChange;res.intercept=ts.intercept;res.first=s[0].date;res.last=s[s.length-1].date;
  res.direction=Math.abs(perWeek)<0.25?'flat':(perWeek<0?'falling':'rising');
  return res;
}
function waterNoise(){
  var s=seriesWindow('weight',14);var vals=s.map(function(d){return d.value;});
  var vol=null;if(vals.length>=5){var diffs=[];for(var i=1;i<vals.length;i++)diffs.push(Math.abs(vals[i]-vals[i-1]));vol=median(diffs);}
  var reasons=[];var score=0;
  var w=currentWeight().value||prof().startWeightLb||200;
  if(vol!=null&&vol>w*0.006){score+=2;reasons.push('day-to-day swings of ~'+fmtWeight(vol)+' exceed usual scale noise');}
  var ph=activePhase();if(ph&&ph.type==='cut'&&daysBetween(ph.startDate,asOf())<14){score+=2;reasons.push('first two weeks of a cut: glycogen and water leave first');}
  if(hasContext(/sodium|carb|alcohol|travel|holiday/i,5)){score+=2;reasons.push('recent sodium, carbohydrate, alcohol or travel context');}
  var creat=obsOf('supplement').filter(function(o){return /creatine/i.test(o.value);});var creatStart=creat.length?creat[0].date:null;
  if(hasContext(/creatine started/i,10)||(creatStart&&daysBetween(creatStart,asOf())<=10)){score+=1;reasons.push('creatine started recently: intracellular water can add scale weight');}
  var sore=seriesWindow('soreness',3);if(sore.length&&mean(sore.map(function(d){return d.value;}))>=7){score+=1;reasons.push('high soreness: training inflammation retains water');}
  var carbs=seriesWindow('carbs',7);if(carbs.length>=4){var cs=sd(carbs.map(function(d){return d.value;}));if(cs&&cs>80){score+=1;reasons.push('carbohydrate intake swinging by ~'+fmtNum(cs,0)+' g/day');}}
  if(vals.length<5)return {status:'insufficient',level:'unknown',reasons:['fewer than 5 weigh-ins'],volatility:vol};
  return {status:'ok',level:score>=4?'high':(score>=2?'medium':'low'),reasons:reasons.length?reasons:['no noise drivers detected'],volatility:vol,score:score};
}
/* ---- energy ---- */
function bmrPrior(){
  var p=prof();var w=currentWeight().value||p.startWeightLb;
  if(!w||!p.heightIn||!p.age||!p.sex)return insufficient('tdee_prior',['age, sex, height and a weight']);
  var kg=lbToKg(w),cm=inToCm(p.heightIn);
  var bmr=10*kg+6.25*cm-5*p.age+(p.sex==='male'?5:-161);
  return {status:'ok',bmr:bmr,weightLb:w};
}
var ACTIVITY_FACTORS={sedentary:{f:1.2,label:'sedentary (desk work, little walking)'},light:{f:1.375,label:'light (some walking, light exercise 1\u20133 days)'},moderate:{f:1.55,label:'moderate (on feet part of the day or exercise 3\u20135 days)'},active:{f:1.725,label:'active (physical job or hard exercise 6\u20137 days)'},very:{f:1.9,label:'very active (heavy labor plus training)'}};
function tdeePrior(){
  var b=bmrPrior();if(b.status!=='ok')return b;
  var af=ACTIVITY_FACTORS[prof().activityBaseline||'light']||ACTIVITY_FACTORS.light;
  var t=b.bmr*af.f;
  return {status:'ok',model:'tdee_prior',cls:'PRIOR',value:t,lo:t*0.85,hi:t*1.15,bmr:b.bmr,factor:af.f,factorLabel:af.label,confidence:'low',note:'population equation \u00d7 activity band'};
}
/* ---------------- ONE CANONICAL ENERGY DENSITY ----------------
   These were a hard-coded 3200 kcal/lb with a hard-coded ±500, while the counterfactual and scenario paths
   used the composition-aware tissueEnergyDensity(). Two competing conversions meant two parts of the app
   could read the same weight change as different amounts of energy.

   Worse than the inconsistency: the roadmap claimed the constant had been removed from every energy path.
   It had not — the verification grepped for 3500 and never looked for 3200, so a check that felt thorough
   confirmed only what it happened to search for.

   Everything now resolves through one function, and the SD comes from that function's own interval rather
   than a parallel guess. The names are kept as accessors so no call site silently keeps a stale number. */
function tissueKcalPerLb(){
  try{var d=tissueEnergyDensity();if(d&&d.status==='ok')return d.kcalPerLb;}catch(e){}
  return ENERGY_PER_LB.fallback;   // only if the composition model cannot resolve at all
}
function tissueKcalSd(){
  try{
    var d=tissueEnergyDensity();
    /* The interval is a plausible-partitioning range, so half its width is the honest 1-sigma stand-in —
       rather than an independent ±500 that no longer relates to the number it qualifies. */
    if(d&&d.status==='ok'&&d.hi!=null&&d.lo!=null)return Math.max(120,(d.hi-d.lo)/2);
  }catch(e){}
  return 500;
}
function tdeePersonal(windowDays,asOfDate){
  windowDays=windowDays||28;var date=asOfDate||asOf();
  var cal=dailySeries('calories',date,windowDays);
  var need=[];
  var covPct=Math.round(100*cal.length/windowDays);
  var tr=weightTrend(windowDays,date);
  var res={model:'tdee_personal',window:windowDays,intakeDays:cal.length,coverage:covPct};
  if(cal.length<14)need.push((14-cal.length)+' more days of intake logging');
  if(covPct<70)need.push('intake coverage above 70% (now '+covPct+'%)');
  if(tr.status!=='ok')need=need.concat(tr.need||['a usable weight trend']);
  if(need.length)return insufficient('tdee_personal',need,res);
  var intake=mean(cal.map(function(d){return d.value;}));
  var adh=seriesWindow('adherence',windowDays);var adhMean=adh.length>=3?mean(adh.map(function(d){return d.value;})):null;
  var logErr=adhMean!=null?(adhMean>=90?0.08:(adhMean>=75?0.12:0.18)):0.12;
  var perDay=tr.slopePerWeek/7;
  var _tk=tissueKcalPerLb(),_tkSd=tissueKcalSd();
  var tdee=intake-perDay*_tk;
  var seSlope=(tr.slopeSe!=null?tr.slopeSe/7:Math.abs(perDay)*0.5);
  var varTot=Math.pow(seSlope*_tk,2)+Math.pow(perDay*_tkSd,2)+Math.pow(intake*logErr,2)/cal.length*4;
  var half=1.96*Math.sqrt(varTot);
  var conf='low';if(cal.length>=28&&covPct>=85&&tr.confidence==='high')conf='high';else if(cal.length>=21&&covPct>=75&&tr.confidence!=='low')conf='medium';
  var trust=dataTrust();if(confRank(trust.overall.level==='high'?'high':(trust.overall.level==='moderate'?'medium':'low'))<confRank(conf))conf=trust.overall.level==='moderate'?'medium':'low';
  res.status='ok';res.cls=cal.length>=21&&covPct>=75?'EMPIRICAL':'BLENDED';res.value=tdee;res.lo=tdee-half;res.hi=tdee+half;res.intake=intake;res.trendPerWeek=tr.slopePerWeek;res.confidence=conf;res.logErr=logErr;res.trend=tr;res.n=cal.length;
  return res;
}
function tdeeEstimate(){
  return memo('tdee',function(){
    var prior=tdeePrior(),emp=tdeePersonal(28);
    var cal=tdeeCalibration();
    if(emp.status==='ok'){
      var w=emp.n/(emp.n+14);var v=prior.status==='ok'?w*emp.value+(1-w)*prior.value:emp.value;
      var lo=prior.status==='ok'?w*emp.lo+(1-w)*prior.lo:emp.lo,hi=prior.status==='ok'?w*emp.hi+(1-w)*prior.hi:emp.hi;
      var cls=emp.cls==='EMPIRICAL'&&w>=0.6?'EMPIRICAL':'BLENDED';var adjusted=false;
      if(cal.status==='ok'&&cal.n>=3){var adj=clamp(cal.bias,-300,300);v=v-adj;lo=lo-adj;hi=hi-adj;adjusted=true;if(cls==='EMPIRICAL')cls='CALIBRATED';}
      return {status:'ok',cls:cls,value:v,lo:lo,hi:hi,confidence:emp.confidence,empirical:emp,prior:prior,weight:w,calibration:cal,adjusted:adjusted,maturity:cls==='CALIBRATED'?'calibrated by outcomes':(cls==='EMPIRICAL'?'personalized':(adjusted?'personalizing (outcome-adjusted)':'personalizing')),n:emp.n,coverage:emp.coverage,asOf:asOf()};
    }
    if(prior.status==='ok')return {status:'ok',cls:'PRIOR',value:prior.value,lo:prior.lo,hi:prior.hi,confidence:'low',prior:prior,empirical:emp,need:emp.need,maturity:'generic prior',n:0,asOf:asOf()};
    return insufficient('tdee_prior',['profile: age, sex, height, weight'],{empiricalNeed:emp.need});
  });
}
function tdeeCalibration(){ // from scored TDEE-implied predictions: bias = mean signed error of weight forecasts converted to kcal
  var scored=(DB.predictions||[]).filter(function(p){return p.subject==='weight14'&&p.status==='scored'&&p.error!=null&&localDateOf(p.madeAt)<=asOf()&&(!p.scoredAt||localDateOf(p.scoredAt)<=asOf());});
  if(scored.length<3)return {status:'insufficient',n:scored.length,need:[(3-scored.length)+' more scored 14-day forecasts']};
  var err=mean(scored.map(function(p){return p.error;})); // actual - predicted, lb over 14 days
  var biasKcal=err/14*tissueKcalPerLb(); // positive error → lost less than predicted → TDEE lower than assumed
  return {status:'ok',n:scored.length,biasLb14:err,bias:biasKcal,mae:mean(scored.map(function(p){return Math.abs(p.error);}))};
}
function energyBalance(){
  var t=tdeeEstimate();var cal=seriesWindow('calories',14);
  if(t.status!=='ok'||cal.length<7)return insufficient('energy_balance',t.status!=='ok'?(t.need||[]):[(7-cal.length)+' more intake days'],{tdee:t});
  var intake=mean(cal.map(function(d){return d.value;}));var bal=intake-t.value;
  /* the everyday movement this deficit is expected to cost, from the person's NEAT response (or its prior) */
  var neat=(bal<0&&typeof neatOffset==='function')?neatOffset(-bal):null;
  return {status:'ok',intake:intake,tdee:t,balance:bal,lo:intake-t.hi,hi:intake-t.lo,confidence:t.confidence,n:cal.length,cls:t.cls==='PRIOR'?'HEURISTIC':'DERIVED',neat:neat};
}
/* ---- body composition ---- */
function bodyComp(){
  var p=prof();var waist=latestObs('waist'),neck=latestObs('neck'),hip=latestObs('hip');
  var measured=latestObs('bodyfat');
  var out={measured:measured?{value:measured.value,method:measured.method||'unspecified',date:measured.date,fresh:freshness('bodyfat',measured.date)}:null};
  var need=[];if(!waist)need.push('a waist measurement');if(!neck)need.push('a neck measurement');if(!p.heightIn)need.push('profile.heightIn|height');if(p.sex==='female'&&!hip)need.push('a hip measurement');
  if(need.length){out.estimate=insufficient('bodycomp_circ',need);return out;}
  var h=p.heightIn,w=waist.value,n=neck.value;var bf;
  if(p.sex==='female'){var hp=hip.value;bf=163.205*Math.log10(w+hp-n)-97.684*Math.log10(h)-78.387;}else bf=86.010*Math.log10(w-n)-70.041*Math.log10(h)+36.76;
  if(!isFinite(bf))return {measured:out.measured,estimate:insufficient('bodycomp_circ',['measurements produce an out-of-domain result'])};
  var stale=freshness('waist',waist.date).state==='stale'||freshness('neck',neck.date).state==='stale';
  var wt=weightAverages().avg7||currentWeight().value;
  var lo=clamp(bf-3.5,2,70),hi=clamp(bf+3.5,2,70);
  /* fat and lean masses are only shown when an independent measurement anchors them; otherwise a circumference
     equation would be dressed up as a body-composition measurement. */
  var anchored=out.measured&&daysBetween(out.measured.date,asOf())<=60;
  out.estimate={status:'ok',model:'bodycomp_circ',cls:'HEURISTIC',bf:bf,lo:lo,hi:hi,confidence:stale?'low':'medium',stale:stale,waist:waist,neck:neck,hip:hip,
    headline:'Estimated body fat ~'+fmtNum(lo,0)+'\u2013'+fmtNum(hi,0)+'%',qualifier:'HEURISTIC \u00b7 circumference model \u00b7 not a measurement',
    massAnchored:!!anchored,anchorNote:anchored?('anchored to a measured body fat by '+out.measured.method+' '+ageLabel(out.measured.date)):'no measured body fat in the last 60 days, so fat and lean masses are not split out',
    fatLo:anchored&&wt?wt*lo/100:null,fatHi:anchored&&wt?wt*hi/100:null,leanLo:anchored&&wt?wt*(1-hi/100):null,leanHi:anchored&&wt?wt*(1-lo/100):null,weightBasis:wt};
  return out;
}
function waistTrend(days){
  days=days||28;var s=dailySeries('waist',asOf(),days);
  if(s.length<2||daysBetween(s[0].date,s[s.length-1].date)<10)return insufficient('fat_vs_other',['2 waist measurements at least 10 days apart'],{n:s.length});
  var pts=s.map(function(d){return {x:d.x,y:d.value};});var ts=theilSen(pts);
  var perWeek=ts.slope*7;var delta=s[s.length-1].value-s[0].value;
  return {status:'ok',perWeek:perWeek,delta:delta,n:s.length,first:s[0],last:s[s.length-1],direction:Math.abs(perWeek)<0.1?'flat':(perWeek<0?'falling':'rising'),confidence:s.length>=4?'medium':'low'};
}
function fatVsOther(){
  var tr=weightTrend(28),wt=waistTrend(28),wn=waterNoise();var ph=activePhase();
  var need=[];if(tr.status!=='ok')need=need.concat(tr.need||['weight_trend|weight trend']);if(wt.status!=='ok')need=need.concat(wt.need||['waist|waist trend']);
  if(ph&&ph.type==='cut'&&daysBetween(ph.startDate,asOf())<14)need.push('the first 14 days of the cut to pass (water and glycogen dominate early loss)');
  if(need.length)return insufficient('fat_vs_other',need);
  var totalChange=tr.slopePerWeek*4; // over ~28 days
  var waistDown=wt.direction==='falling';
  /* Qualitative by default. A scale and a tape cannot resolve tissue compartments; the signal is directional.
     A numeric split appears only when two measured body-fat readings 21+ days apart bracket the window. */
  var signal,verdict;
  if(tr.direction==='falling'&&waistDown){signal='fat-loss-compatible';verdict='weight and waist are both falling \u2014 a fat-loss-compatible signal';}
  else if(tr.direction==='falling'&&!waistDown){signal='composition unresolved';verdict='weight is falling while the waist holds \u2014 composition unresolved; water, glycogen and gut contents move the scale too';}
  else if(tr.direction==='flat'&&waistDown){signal='recomposition-compatible';verdict='weight is flat while the waist falls \u2014 a recomposition-compatible signal';}
  else if(tr.direction==='rising'&&waistDown){signal='recomposition-compatible';verdict='weight is rising while the waist falls \u2014 a recomposition-compatible signal';}
  else{signal='gain, composition unresolved';verdict='weight is rising and the waist is not falling \u2014 composition unresolved';}
  if(wn.level==='high')verdict+='; water noise is high right now, so read the 4-week direction, not the week';
  var out={status:'ok',cls:'HEURISTIC',totalChange:totalChange,signal:signal,verdict:verdict,waist:wt,trend:tr,waterNoise:wn,quantified:false,
    confidence:minConf(tr.confidence,wt.confidence==='medium'&&wn.level!=='high'?'medium':'low')};
  var bf=obsOf('bodyfat');
  if(bf.length>=2){var last=bf[bf.length-1],prev=bf[bf.length-2];
    if(last.method===prev.method&&daysBetween(prev.date,last.date)>=21&&daysBetween(last.date,asOf())<=45){
      var w0=dailySeries('weight',prev.date,7),w1=dailySeries('weight',last.date,7);
      if(w0.length>=3&&w1.length>=3){var a0=mean(w0.map(function(d){return d.value;})),a1=mean(w1.map(function(d){return d.value;}));
        var fat0=a0*prev.value/100,fat1=a1*last.value/100;var dFat=fat1-fat0,dTotal=a1-a0;
        out.quantified=true;out.cls='DERIVED';out.measuredSplit={fatChange:dFat,otherChange:dTotal-dFat,totalChange:dTotal,from:prev.date,to:last.date,method:last.method,days:daysBetween(prev.date,last.date)};
        out.verdict=verdict+'. Measured by '+last.method+' between '+shortDate(prev.date)+' and '+shortDate(last.date)+': '+fmtSigned(dFat,1)+' lb fat and '+fmtSigned(dTotal-dFat,1)+' lb other tissue of '+fmtSigned(dTotal,1)+' lb total';
      }}}
  return out;
}
/* ---- rate bands and goal ---- */
function rateBand(weightLb,phaseType){
  if(weightLb==null)return null;
  if(phaseType&&phaseType!=='cut')return {lo:-0.25,hi:0.25,label:'stable',zone:'maintenance'};
  var b;
  if(weightLb>250)b={lo:1.5,hi:2.5,zone:'above 250 lb \u00b7 fat loss dominant'};else if(weightLb>230)b={lo:1.25,hi:2.0,zone:'230\u2013250 lb \u00b7 fat loss + retention'};else if(weightLb>210)b={lo:1.0,hi:1.75,zone:'210\u2013230 lb \u00b7 recomposition'};else if(weightLb>190)b={lo:0.75,hi:1.5,zone:'190\u2013210 lb \u00b7 preservation'};else b={lo:0.5,hi:1.0,zone:'under 190 lb \u00b7 composition'};
  var pct={lo:weightLb*0.005,hi:weightLb*0.01};
  return {lo:-b.hi,hi:-b.lo,label:fmtRateRange(-b.hi,-b.lo),zone:b.zone,pctBand:pct,cls:'HEURISTIC'};
}
function targetRate(){
  var ph=activePhase();var w=weightAverages().avg7||currentWeight().value;
  if(ph&&ph.targetRateLo!=null&&ph.targetRateHi!=null)return {lo:Math.min(ph.targetRateLo,ph.targetRateHi),hi:Math.max(ph.targetRateLo,ph.targetRateHi),source:'user target',cls:'MEASURED',band:rateBand(w,ph.type)};
  var b=rateBand(w,ph?ph.type:'cut');if(!b)return null;return {lo:b.lo,hi:b.hi,source:'system recommendation for this weight zone',cls:'HEURISTIC',band:b};
}
/* ============================================================================
   THE CANONICAL GOAL.
   The goal is the individual's outcome and lives in the profile: what kind of goal, which weight, by when. A phase is the
   temporal context executing it; a phase's weight and date are a MILESTONE on the way, not a second goal. Before this,
   goal trajectory took the phase's weight first, the protein suggestion took only the profile's, scenarios and the
   copilot each had their own fallback, and the setup stored goal types in the phase vocabulary \u2014 so two parts of the
   app could be working toward different goal weights at once. Every reader now goes through here, and governance fails
   the build if a module outside the owners reads the goal fields directly.
   ============================================================================ */
var GOAL_TYPES={
  fat_loss:{label:'Lose fat',phases:['cut'],direction:-1},
  maintenance:{label:'Maintain',phases:['maintenance'],direction:0},
  muscle_gain:{label:'Build muscle',phases:['lean_gain'],direction:1},
  recomposition:{label:'Lose fat and build muscle',phases:['recomp','maintenance'],direction:0},
  strength:{label:'Get stronger',phases:['maintenance','lean_gain','recomp'],direction:0},
  endurance:{label:'Endurance',phases:['maintenance'],direction:0},
  general:{label:'General fitness',phases:['maintenance','recomp'],direction:0},
  mixed:{label:'Several goals',phases:['maintenance','recomp','cut','lean_gain'],direction:0}
};
var GOAL_TYPE_ALIASES={cut:'fat_loss',lean_gain:'muscle_gain',recomp:'recomposition'};
var PHASE_GOAL={cut:'fat_loss',lean_gain:'muscle_gain',recomp:'recomposition',maintenance:'maintenance'};
/* Temporary contexts that serve any goal. */
var CONTEXT_PHASES=['diet_break','transition','recovery','goal_complete'];
function canonicalGoalType(t){return GOAL_TYPES[t]?t:(GOAL_TYPE_ALIASES[t]||null);}
function canonicalGoal(){
  var p=prof()||{},ph=activePhase();
  var type=canonicalGoalType(p.goalType),typeSource=type?'you set it':null;
  if(!type&&ph&&PHASE_GOAL[ph.type]){type=PHASE_GOAL[ph.type];typeSource='inferred from the current phase';}
  var conflicts=[],compatible=null;
  if(ph&&type){compatible=CONTEXT_PHASES.indexOf(ph.type)>=0||GOAL_TYPES[type].phases.indexOf(ph.type)>=0;
    if(!compatible)conflicts.push({kind:'phase-goal',note:'Your goal is to '+GOAL_TYPES[type].label.toLowerCase()+', but the current phase is '+((PHASE_TYPES[ph.type]||{}).label||ph.type).toLowerCase()+'.'});}
  var cur=null;try{cur=weightAverages().avg7||currentWeight().value;}catch(e){}
  var gw=p.goalWeightLb!=null?p.goalWeightLb:null;
  if(type&&gw!=null&&cur!=null){var dir=GOAL_TYPES[type].direction;
    if(dir<0&&gw>cur+1)conflicts.push({kind:'goal-direction',note:'The goal weight is above your current weight, for a fat-loss goal.'});
    if(dir>0&&gw<cur-1)conflicts.push({kind:'goal-direction',note:'The goal weight is below your current weight, for a muscle-gain goal.'});}
  var mw=ph&&ph.goalWeightLb!=null?ph.goalWeightLb:null,md=ph&&ph.targetDate?ph.targetDate:null;
  return {status:(type||gw!=null)?'ok':'none',type:type,typeLabel:type?GOAL_TYPES[type].label:null,typeSource:typeSource,
    targetWeightLb:gw,targetDate:p.targetDate||null,milestoneWeightLb:mw,milestoneDate:md,
    activeTargetLb:mw!=null?mw:gw,activeTargetSource:mw!=null?'this phase\u2019s milestone':(gw!=null?'your goal':null),
    activeDate:md||p.targetDate||null,phaseType:ph?ph.type:null,compatible:compatible,conflicts:conflicts};
}
function goalTrajectory(){
  var p=prof();var G=canonicalGoal();var goal=G.activeTargetLb;var deadline=G.activeDate;
  var wa=weightAverages();var cur=wa.avg7||currentWeight().value;var tr=weightTrend(14);
  if(!goal||cur==null)return insufficient('goal_traj',[!goal?'a goal weight':'','a weight'].filter(Boolean));
  var remaining=cur-goal;var out={status:'ok',model:'goal_traj',cls:'PREDICTIVE',goal:goal,current:cur,remaining:remaining,deadline:deadline||null,trend:tr};
  var band=targetRate();out.band=band;
  if(deadline){var weeks=daysBetween(asOf(),deadline)/7;out.weeksLeft=weeks;out.requiredRate=weeks>0?-remaining/weeks:null;
    if(band&&out.requiredRate!=null){var req=Math.abs(out.requiredRate),hiAbs=Math.abs(band.lo);out.requiredVsBand=req>hiAbs*1.3?'very aggressive':(req>hiAbs?'aggressive':(req<Math.abs(band.hi)?'gentle':'within band'));}}
  if(tr.status==='ok'){
    if(remaining>0&&tr.slopePerWeek<-0.1){var wks=remaining/(-tr.slopePerWeek);out.projectedWeeks=wks;out.projectedDate=addDays(asOf(),Math.round(wks*7));
      if(tr.lo!=null&&tr.hi!=null){var fast=tr.lo<0?remaining/(-tr.lo):null,slow=tr.hi<0?remaining/(-tr.hi):null;out.projectedEarliest=fast!=null?addDays(asOf(),Math.round(fast*7)):null;out.projectedLatest=slow!=null?addDays(asOf(),Math.round(slow*7)):null;}
      if(deadline&&out.requiredRate!=null){out.status2=out.requiredVsBand==='very aggressive'?'unrealistic':(tr.slopePerWeek<=out.requiredRate*1.05?'ahead':(tr.slopePerWeek<=out.requiredRate*0.85?'on track':'behind'));}
      else out.status2='converging';
      out.confidence=tr.confidence==='high'?'medium':'low';
    } else {out.status2=remaining<=0?'at goal':'not converging';out.confidence=tr.confidence==='insufficient'?'insufficient':'low';}
  } else {out.status2='insufficient data';out.confidence='insufficient';out.need=tr.need;}
  return out;
}
function weightForecast(horizonDays){
  var tr=weightTrend(14);var wa=weightAverages();var base=wa.avg7;
  if(tr.status!=='ok'||base==null)return insufficient('weight_forecast',tr.need||['weight_avg|7-day average'],{horizonDays:horizonDays});
  var weeks=horizonDays/7;var point=base+tr.slopePerWeek*weeks;
  var slopeUnc=tr.slopeSe!=null?tr.slopeSe*weeks:Math.abs(tr.slopePerWeek)*0.5*weeks;
  var noise=tr.residSd!=null?tr.residSd:1.0;
  var half=Math.sqrt(Math.pow(1.5*slopeUnc,2)+Math.pow(noise,2))+0.45*weeks;
  var conf=tr.confidence==='high'?(horizonDays<=14?'medium':'low'):'low';
  return {status:'ok',model:'weight_forecast',cls:'PREDICTIVE',horizonDays:horizonDays,point:point,lo:point-half,hi:point+half,base:base,trend:tr,confidence:conf,dueDate:addDays(asOf(),horizonDays),assumptions:['current 14-day trend continues','no phase or intervention change inside the horizon','interval combines scale noise and slope uncertainty']};
}
/* ---- training ---- */
var E1RM={epley:function(w,r){return w*(1+r/30);},brzycki:function(w,r){return r>=37?null:w*36/(37-r);},lander:function(w,r){return w*100/(101.3-2.67123*r);},lombardi:function(w,r){return w*Math.pow(r,0.10);},mayhew:function(w,r){return w*100/(52.2+41.9*Math.exp(-0.055*r));}};
function e1rm(load,reps){if(load==null||reps==null||reps<1)return null;if(reps===1)return {value:load,lo:load,hi:load,reliability:'measured'};var vals=Object.keys(E1RM).map(function(k){return E1RM[k](load,reps);}).filter(function(v){return v!=null&&isFinite(v);});if(!vals.length)return null;return {value:median(vals),lo:Math.min.apply(null,vals),hi:Math.max.apply(null,vals),reliability:reps>12?'low (high-rep estimate)':(reps>8?'moderate':'good')};}
function normExercise(n){return String(n||'').toLowerCase().replace(/\s+/g,' ').trim();}
function exerciseHistory(name){
  var key=normExercise(name);var out=[];
  sessionsOf().forEach(function(s){var best=null,vol=0,sets=0;(s.sets||[]).forEach(function(x){if(normExercise(x.exercise)!==key)return;sets++;if(x.load!=null&&x.reps!=null){vol+=x.load*x.reps;var e=e1rm(x.load,x.reps);if(e&&(!best||e.value>best.value))best=e;}});if(sets)out.push({date:s.date,sessionId:s.id,best:best,volume:vol,sets:sets});});
  return out;
}
function strengthTrend(){
  var sess=sessionsOf();if(sess.length<2)return insufficient('strength_trend',[(4-sess.length)+' more sessions'],{sessions:sess.length});
  var counts={};sess.forEach(function(s){(s.sets||[]).forEach(function(x){var k=normExercise(x.exercise);if(!k)return;counts[k]=(counts[k]||0)+1;});});
  var names=Object.keys(counts).sort(function(a,b){return counts[b]-counts[a];}).slice(0,6);
  var per=[];names.forEach(function(k){var h=exerciseHistory(k).filter(function(x){return x.best;});if(h.length<4){per.push({exercise:k,status:'insufficient',n:h.length,need:(4-h.length)+' more exposures'});return;}
    var recent=h.slice(-3).map(function(x){return x.best.value;}),prior=h.slice(-6,-3).map(function(x){return x.best.value;});
    var pct=prior.length?(mean(recent)-mean(prior))/mean(prior)*100:null;var dir=pct==null?'stable':(pct>2?'improving':(pct<-2.5?'declining':'stable'));
    var consec=0;for(var i=h.length-1;i>0;i--){if(h[i].best.value<h[i-1].best.value)consec++;else break;}
    var priorMean=prior.length?mean(prior):null;var sustained=priorMean!=null&&recent.length===3&&recent.every(function(v){return v<priorMean;})&&pct!=null&&pct<=-4;
    per.push({exercise:k,status:'ok',n:h.length,pct:pct,direction:dir,last:h[h.length-1].best,consecutiveDeclines:consec,sustainedDecline:sustained,history:h});});
  var ok=per.filter(function(x){return x.status==='ok';});
  if(!ok.length)return insufficient('strength_trend',['4+ exposures of the same exercise'],{per:per,sessions:sess.length});
  /* One answer to "is this lift improving?". The recent-versus-earlier rule called any 2% rise improving, with no
     allowance for noise, while the per-lift response model — slope against its standard error — found most of the
     same rises not yet clear. "Improving" now needs both; a rise the slope test cannot yet separate from noise reads
     "rising, not yet clear". Declining keeps its early rule on purpose: it guards against muscle loss, where an early
     warning is worth a false alarm. */
  try{var RESP={};exerciseResponse().rows.forEach(function(r){RESP[String(r.exercise).toLowerCase()]=r;});
    ok.forEach(function(x){if(x.direction!=='improving')return;var rr=RESP[String(x.exercise).toLowerCase()];
      if(rr&&rr.status==='ok'&&rr.direction!=='progressing'){x.direction='rising, not yet clear';x.slopePerWeek=rr.slopePerWeek;x.slopeSePerWeek=rr.slopeSePerWeek;}});}catch(e){_q(e,'P2');}
  var dec=ok.filter(function(x){return x.direction==='declining';}).length,imp=ok.filter(function(x){return x.direction==='improving';}).length;
  var rising=ok.filter(function(x){return x.direction==='rising, not yet clear';}).length;
  var overall=dec>ok.length/2?'declining':(imp>ok.length/2?'improving':(dec>0&&dec>=imp?'mixed, some decline':((imp+rising)>ok.length/2&&dec===0?'rising, not yet clear':'stable')));
  var maxConsec=Math.max.apply(null,ok.map(function(x){return x.consecutiveDeclines;}));
  var sustainedCount=ok.filter(function(x){return x.sustainedDecline;}).length;
  return {status:'ok',cls:'DERIVED',overall:overall,per:per,declining:dec,improving:imp,tracked:ok.length,maxConsecutiveDeclines:maxConsec,sustainedCount:sustainedCount,confidence:ok.length>=3?'medium':'low'};
}
function trainingState(){
  var s14=sessionsOf({from:addDays(asOf(),-13)}),s7=sessionsOf({from:addDays(asOf(),-6)});
  var ph=activePhase();var planned=ph&&ph.trainingSessions?ph.trainingSessions:null;
  var hard=0,sets=0,vol=0;s7.forEach(function(s){(s.sets||[]).forEach(function(x){sets++;if(x.rir==null||x.rir<=3)hard++;if(x.load&&x.reps)vol+=x.load*x.reps;});});
  var last=sessionsOf().slice(-1)[0]||null;
  var adherence=planned?Math.round(100*Math.min(1,(s14.length/2)/planned)):null;
  return {sessions7:s7.length,sessions14:s14.length,perWeek:s14.length/2,planned:planned,adherence:adherence,sets7:sets,hardSets7:hard,volume7:vol,last:last,lastFresh:last?freshness('training',last.date):null,strength:strengthTrend(),consistency:adherence==null?'no plan':(adherence>=85?'consistent':(adherence>=60?'partial':'low'))};
}
/* ---- recovery / appetite ---- */
function recoveryState(){
  var target=(activePhase()||{}).sleepTargetH||prof().sleepTargetH||7.5;
  var m=function(t,d){var s=seriesWindow(t,d||7);return s.length?{mean:mean(s.map(function(x){return x.value;})),n:s.length,last:s[s.length-1]}:null;};
  var sl=m('sleep'),sq=m('sleepq'),fa=m('fatigue'),so=m('soreness'),st=m('stress'),mo=m('motivation');
  var n=[sl,sq,fa,so,st].filter(Boolean).reduce(function(a,x){return a+x.n;},0);
  var signals=[];
  if(sl&&sl.mean<target-0.5)signals.push({key:'sleep',text:'sleep averaging '+fmtH(sl.mean)+' vs '+fmtH(target)+' target',severity:sl.mean<target-1.5?2:1});
  if(sq&&sq.mean<=4)signals.push({key:'sleepq',text:'sleep quality low ('+fmtNum(sq.mean,1)+'/10)',severity:1});
  if(fa&&fa.mean>=7)signals.push({key:'fatigue',text:'fatigue high ('+fmtNum(fa.mean,1)+'/10)',severity:fa.mean>=8?2:1});
  if(so&&so.mean>=7)signals.push({key:'soreness',text:'soreness high ('+fmtNum(so.mean,1)+'/10)',severity:1});
  if(st&&st.mean>=7)signals.push({key:'stress',text:'stress high ('+fmtNum(st.mean,1)+'/10)',severity:1});
  if(mo&&mo.mean<=3)signals.push({key:'motivation',text:'motivation low ('+fmtNum(mo.mean,1)+'/10)',severity:1});
  /* deviation from this person's own baseline, not only from a fixed threshold */
  var dev=[];try{dev=recoveryBaselineDeviation();}catch(e){_q(e);}
  dev.forEach(function(d){if(!signals.some(function(x){return x.key===d.key;}))signals.push({key:d.key,text:d.text,severity:Math.abs(d.z)>2?2:1,personal:true});});
  /* one severe reading today is enough to act on, without a baseline (a new person at fatigue 9 on 4.5 h of sleep read
     “recovery unknown”): acute status from today's readings alone; the weekly picture still needs three ratings */
  var ac=acuteRecovery();if(n<3&&ac.flag)return {status:'acute',cls:'HEURISTIC',label:'Today\u2019s recovery readings',level:ac.level,signals:ac.reasons.map(function(r){return {key:'acute',text:r,severity:2};}),n:n,advice:ac.advice,note:'from today\u2019s readings alone; the weekly picture needs '+(3-n)+' more ratings',sleep:sl,fatigue:fa,soreness:so,stress:st,sleepq:sq,target:target,personalDeviation:dev};
  if(n<3)return {status:'insufficient',level:'unknown',signals:signals,n:n,need:[(3-n)+' more recovery ratings this week'],sleep:sl,fatigue:fa,soreness:so,stress:st,sleepq:sq,target:target,personalDeviation:dev};
  var score=signals.reduce(function(a,s){return a+s.severity;},0);
  var level=score===0?'good':(score===1?'acceptable':(score<=3?'strained':'poor'));
  return {status:'ok',cls:'HEURISTIC',label:'Reported recovery state',level:level,score:score,signals:signals,personalDeviation:dev,n:n,sleep:sl,sleepq:sq,fatigue:fa,soreness:so,stress:st,motivation:mo,target:target,confidence:n>=7?'medium':'low',note:'this is what you reported, not a physiological measurement'};
}
function appetiteState(){
  var m=function(t){var s=seriesWindow(t,7);return s.length?{mean:mean(s.map(function(x){return x.value;})),n:s.length}:null;};
  var hu=m('hunger'),cr=m('cravings'),fu=m('fullness'),df=m('difficulty');
  var n=[hu,cr,fu,df].filter(Boolean).reduce(function(a,x){return a+x.n;},0);
  if(n<3)return {status:'insufficient',level:'unknown',n:n,need:[(3-n)+' more appetite ratings this week'],hunger:hu,cravings:cr,fullness:fu,difficulty:df};
  var burden=0;if(hu&&hu.mean>=7)burden+=2;else if(hu&&hu.mean>=5)burden+=1;if(cr&&cr.mean>=7)burden+=1;if(fu&&fu.mean<=3)burden+=1;if(df&&df.mean>=7)burden+=1;
  var level=burden>=3?'high':(burden>=1?'moderate':'low');
  return {status:'ok',cls:'HEURISTIC',level:level,burden:burden,hunger:hu,cravings:cr,fullness:fu,difficulty:df,n:n,sustainability:level==='high'?'at risk':(level==='moderate'?'watch':'acceptable'),confidence:n>=7?'medium':'low'};
}
/* ---- adherence: separate dimensions, unlogged = unknown ---- */
function adherenceState(days){
  days=days||14;var ph=activePhase()||{};var out={days:days};
  var cal=seriesWindow('calories',days);
  out.logging={pct:Math.round(100*cal.length/days),n:cal.length};
  if(ph.calorieTarget&&cal.length){var ok=cal.filter(function(d){return COMPLETION_TARGETS.calories.met(d.value,ph.calorieTarget);}).length;out.calories={pct:Math.round(100*ok/cal.length),n:cal.length,target:ph.calorieTarget,mean:mean(cal.map(function(d){return d.value;}))};}
  var pr=seriesWindow('protein',days);
  if(ph.proteinTarget&&pr.length){var okp=pr.filter(function(d){return COMPLETION_TARGETS.protein.met(d.value,ph.proteinTarget);}).length;out.protein={pct:Math.round(100*okp/pr.length),n:pr.length,target:ph.proteinTarget,mean:mean(pr.map(function(d){return d.value;}))};}
  var st=seriesWindow('steps',days);
  if(st.length){out.steps={n:st.length,mean:mean(st.map(function(d){return d.value;})),target:ph.stepTarget||null,pct:ph.stepTarget?Math.round(100*st.filter(function(d){return COMPLETION_TARGETS.steps.met(d.value,ph.stepTarget);}).length/st.length):null};}
  var sl=seriesWindow('sleep',days);var tgt=ph.sleepTargetH||prof().sleepTargetH;
  if(sl.length&&tgt)out.sleep={n:sl.length,pct:Math.round(100*sl.filter(function(d){return COMPLETION_TARGETS.sleep.met(d.value,tgt);}).length/sl.length),target:tgt,mean:mean(sl.map(function(d){return d.value;}))};
  var tr=trainingState();out.training={pct:tr.adherence,perWeek:tr.perWeek,planned:tr.planned};
  var rep=seriesWindow('adherence',days);if(rep.length)out.reported={mean:mean(rep.map(function(d){return d.value;})),n:rep.length};
  var cardio=seriesWindow('cardio',days);out.cardio={sessions:cardio.reduce(function(a,d){return a+d.n;},0),minutes:cardio.reduce(function(a,d){return a+d.value;},0),plannedSessions:ph.cardioSessions?ph.cardioSessions*days/7:null};
  var fields=['calories','protein','steps','sleep'].filter(function(k){return out[k]&&out[k].pct!=null;});
  out.overallNote=fields.length?fields.map(function(k){return k+' '+out[k].pct+'%';}).join(' \u00b7 '):'no plan targets to compare against';
  out.confidence=out.logging.pct>=80&&(out.reported?out.reported.n>=5:true)?'high':(out.logging.pct>=50?'medium':'low');
  return out;
}
/* ---- data trust ---- */
function dataTrust(){
  return memo('trust',function(){
    var streams={};var reasons=[];
    var w=coverage('weight',14),c=coverage('calories',14),p=coverage('protein',14),s=coverage('steps',14),sl=coverage('sleep',14);
    var lvl=function(pct){return pct>=85?'high':(pct>=60?'moderate':(pct>0?'low':'insufficient'));};
    streams.weight={level:lvl(w.pct),detail:w.logged+' of 14 days'};
    streams.nutrition={level:lvl(c.pct),detail:c.logged+' of 14 days logged'+(p.logged<c.logged?(' \u00b7 protein on '+p.logged):'')};
    streams.activity={level:lvl(s.pct),detail:s.logged+' of 14 days'};
    streams.sleep={level:lvl(sl.pct),detail:sl.logged+' of 14 days'};
    var ts=trainingState();streams.training={level:ts.sessions14>=4?'high':(ts.sessions14>=2?'moderate':(ts.sessions14?'low':'insufficient')),detail:ts.sessions14+' sessions in 14 days'};
    var waist=latestObs('waist');streams.waist={level:!waist?'insufficient':(freshness('waist',waist.date).state==='fresh'?'high':(freshness('waist',waist.date).state==='aging'?'moderate':'low')),detail:waist?('last '+ageLabel(waist.date)):'never measured'};
    var bc=bodyComp();streams.composition={level:bc.measured?(bc.measured.fresh.state==='stale'?'low':'moderate'):(bc.estimate&&bc.estimate.status==='ok'?'low':'insufficient'),detail:bc.measured?('measured by '+bc.measured.method+' '+ageLabel(bc.measured.date)):(bc.estimate&&bc.estimate.status==='ok'?'circumference estimate only':'no measurements')};
    var an=detectAnomalies();var flagged=DB.observations.filter(function(o){return !o.retracted&&o.flags&&o.flags.length&&daysBetween(o.date,asOf())<=14;}).length;
    var mq=null;try{mq=streamQuality('weight',14);}catch(e){_q(e);}
    streams.consistency={level:an.length>2||flagged>3?'low':(an.length||flagged?'moderate':'high'),detail:(an.length?an.length+' anomal'+(an.length===1?'y':'ies'):'no anomalies')+(flagged?(' \u00b7 '+flagged+' flagged entries'):'')};
    if(mq&&mq.n)streams.measurement={level:mq.level,detail:'weigh-in quality '+fmtNum(mq.mean*100,0)+'%'+(mq.low?(' \u00b7 '+mq.low+' low-quality entries'):'')};
    var core=['weight','nutrition','activity','sleep','training'].map(function(k){return streams[k].level;});
    var score=core.reduce(function(a,l){return a+(l==='high'?3:l==='moderate'?2:l==='low'?1:0);},0)/(core.length*3);
    if(streams.consistency.level==='low')score*=0.8;
    var overall=score>=0.8?'high':(score>=0.55?'moderate':(score>=0.25?'low':'insufficient'));
    Object.keys(streams).forEach(function(k){if(streams[k].level==='low'||streams[k].level==='insufficient')reasons.push(k+': '+streams[k].detail);});
    return {streams:streams,overall:{level:overall,pct:Math.round(score*100)},reasons:reasons,anomalies:an};
  });
}
/* ---- muscle retention risk ---- */
function muscleRetentionRisk(){
  var ph=activePhase();var st=strengthTrend(),ad=adherenceState(14),tr=weightTrend(14),rec=recoveryState(),ts=trainingState();
  var have=0,score=0,factors=[];
  if(st.status==='ok'){have++;if(st.overall==='declining'){score+=2;factors.push({text:'strength declining across tracked lifts',tone:'negative'});}else if(st.overall.indexOf('decline')>=0){score+=1;factors.push({text:'some lifts declining',tone:'attention'});}else factors.push({text:'strength '+st.overall,tone:'good'});}
  if(ad.protein){have++;if(ad.protein.pct<60){score+=2;factors.push({text:'protein target met on '+ad.protein.pct+'% of logged days',tone:'negative'});}else if(ad.protein.pct<85){score+=1;factors.push({text:'protein target met on '+ad.protein.pct+'% of days',tone:'attention'});}else factors.push({text:'protein adequate ('+ad.protein.pct+'% of days)',tone:'good'});}
  var early=ph&&ph.type==='cut'&&daysBetween(ph.startDate,asOf())<14;
  if(tr.status==='ok'){have++;var band=targetRate();var sysBand=band&&band.band?band.band:band;if(early){factors.push({text:'rate of loss not assessed in the first 14 days (water and glycogen leave first)',tone:'neutral'});}else if(sysBand&&tr.slopePerWeek<sysBand.lo*1.3){score+=2;factors.push({text:'rate of loss '+fmtRate(tr.slopePerWeek)+' is well past the '+fmtRateRange(sysBand.lo,sysBand.hi)+' band',tone:'negative'});}else if(sysBand&&tr.slopePerWeek<sysBand.lo){score+=1;factors.push({text:'rate of loss slightly faster than the band',tone:'attention'});}else factors.push({text:'rate of loss within band',tone:'good'});}
  if(rec.status==='ok'){have++;if(rec.level==='poor'){score+=2;factors.push({text:'recovery poor',tone:'negative'});}else if(rec.level==='strained'){score+=1;factors.push({text:'recovery strained',tone:'attention'});}else factors.push({text:'recovery '+rec.level,tone:'good'});}
  if(ts.planned){have++;if(ts.consistency==='low'){score+=2;factors.push({text:'resistance training '+ts.adherence+'% of plan',tone:'negative'});}else if(ts.consistency==='partial'){score+=1;factors.push({text:'training partially consistent',tone:'attention'});}else factors.push({text:'training consistent',tone:'good'});}
  if(!ph||ph.type!=='cut')return {status:'n/a',level:'not in a cut',factors:factors};
  if(have<2)return {status:'insufficient',level:'insufficient data',factors:factors,need:['strength history (4+ exposures per lift)','protein logging','recovery ratings']};
  var strong=factors.some(function(f){return f.tone==='negative';});
  var level=score>=4?'high':((score>=3||(score>=2&&strong))?'medium':'low');
  return {status:'ok',cls:'HEURISTIC',level:level,score:score,factors:factors,confidence:have>=4?'medium':'low',note:'an interpretation from proxies, not a measurement of muscle'};
}
/* ---- step baseline ---- */
function stepState(){
  var s7=seriesWindow('steps',7),s28=seriesWindow('steps',28);
  var base=s28.length>=10?median(s28.slice(0,Math.max(5,Math.floor(s28.length/2))).map(function(d){return d.value;})):null;
  var m7=s7.length?mean(s7.map(function(d){return d.value;})):null;
  var tr=s28.length>=10?theilSen(s28.map(function(d){return {x:d.x,y:d.value};})).slope:null;
  var comp=null;if(tr!=null&&base!=null&&m7!=null&&tr*28<-1500&&m7<base*0.85&&seriesWindow('cardio',14).length>=3)comp='steps averaging '+fmtNum(m7,0)+' vs a baseline of '+fmtNum(base,0)+' while cardio is logged: possible NEAT compensation';
  return {mean7:m7,n7:s7.length,baseline:base,trendPerDay:tr,target:(activePhase()||{}).stepTarget||null,last:s7.length?s7[s7.length-1]:null,compensation:comp};
}
/* ---- canonical state ---- */
function getCurrentState(){
  return memo('state',function(){
    var ph=activePhase();
    var st={asOf:asOf(),phase:ph,phaseWeek:phaseWeek(ph),profile:prof(),
      weight:currentWeight(),averages:weightAverages(),trend:weightTrend(14),trend28:weightTrend(28),waterNoise:waterNoise(),
      waist:latestObs('waist'),waistTrend:waistTrend(28),bodyComp:bodyComp(),fatVsOther:fatVsOther(),
      tdee:tdeeEstimate(),energy:energyBalance(),targetRate:targetRate(),goal:goalTrajectory(),
      nutrition:nutritionToday(),adherence:adherenceState(14),steps:stepState(),training:trainingState(),recovery:recoveryState(),appetite:appetiteState(),muscleRisk:muscleRetentionRisk(),
      trust:dataTrust(),missing:missingness(14),forecast7:displayedForecast(7),forecast14:displayedForecast(14),forecast28:displayedForecast(28)};
    return st;
  });
}
function nutritionToday(){
  var day=asOf();var ph=activePhase()||{};
  var get=function(t){var s=dailySeries(t,day,1);return s.length&&s[0].date===day?s[0]:null;};
  var cal=get('calories'),pr=get('protein'),cb=get('carbs'),ft=get('fat'),fb=get('fiber'),wt=get('water');
  var c7=seriesWindow('calories',7),p7=seriesWindow('protein',7),c14=seriesWindow('calories',14);
  return {date:day,calories:cal?cal.value:null,protein:pr?pr.value:null,carbs:cb?cb.value:null,fat:ft?ft.value:null,fiber:fb?fb.value:null,water:wt?wt.value:null,
    calorieTarget:ph.calorieTarget||null,proteinTarget:ph.proteinTarget||null,fiberTarget:ph.fiberTarget||null,fatFloor:ph.fatFloor||null,
    avg7:c7.length?mean(c7.map(function(d){return d.value;})):null,n7:c7.length,avg14:c14.length?mean(c14.map(function(d){return d.value;})):null,n14:c14.length,protein7:p7.length?mean(p7.map(function(d){return d.value;})):null,pn7:p7.length,
    fromFoodLog:!!(cal&&cal.obs.some(function(o){return o.source==='food-log';}))};
}
/* ---- protein target heuristic: anchored to target/lean weight during a cut ---- */
function proteinTargetSuggestion(){
  /* Anchored to the individual's long-term goal weight, not a phase milestone. */
  var p=prof();var w=weightAverages().avg7||currentWeight().value||p.startWeightLb;var goal=canonicalGoal().targetWeightLb;
  if(!w)return null;var anchor=goal&&goal<w?goal:w;var kg=lbToKg(anchor);
  return {lo:Math.round(kg*1.6),hi:Math.round(kg*2.2),anchorLb:anchor,basis:goal&&goal<w?'goal weight (avoids scaling protein to a large body mass)':'weight|current weight',cls:'PRIOR',source:'ISSN 1.4\u20132.0 g/kg; Morton 2018 plateau ~1.6 g/kg; higher end during deficits',reference:REF_PROTEIN.id};
}
/* opts.band: the rate band of a phase being STARTED. Read only from the active phase, a person starting their first
   phase got no calorie suggestion at all, and setup produced a plan with no calorie target. */
function calorieTargetSuggestion(opts){
  var t=tdeeEstimate();var band=(opts&&opts.band)||targetRate();if(t.status!=='ok'||!band)return null;
  var zone=band.band||band;var midRate=(zone.lo+zone.hi)/2; // lb/week, negative for loss; zone band, not the user's stricter target
  var deficit=-midRate*tissueKcalPerLb()/7;var cap=t.value*0.25;var capped=false;
  if(deficit>cap){deficit=cap;capped=true;}
  var b=bmrPrior();var floor=Math.max(b.status==='ok'?b.bmr:0,prof().sex==='female'?1200:1500);var floored=false;
  var target=roundTo(t.value-deficit,10);if(target<floor){target=roundTo(floor,10);floored=true;}
  return {value:target,lo:roundTo(Math.max(floor,t.lo-deficit),10),hi:roundTo(t.hi-deficit,10),tdee:t,deficit:round(t.value-target,0),rate:-(t.value-target)*7/tissueKcalPerLb(),capped:capped,floored:floored,cls:t.cls==='PRIOR'?'PRIOR':'DERIVED',basis:'estimated TDEE minus the deficit for the middle of the zone band'+(capped?', capped at 25% of TDEE':'')+(floored?', floored at estimated BMR':'')};
}

/* ---------------- STEP 3: EXECUTABLE BINDINGS ----------------
   Every model in this registry described itself and none of them said which function computed it. So the
   inference gateway could not resolve a model by id at all \u2014 it took raw function names and bypassed the
   registry, which is precisely the arrangement the implementation direction forbids ("infer() becomes the
   standard production gateway"). Each entry now names its implementation. The binding is a name rather
   than a reference because most of these functions are defined in later modules. */
var MODEL_BINDINGS={
  weight_avg:'weightAverages',weight_trend:'weightTrend',water_noise:'waterNoise',
  tdee_prior:'tdeePrior',tdee_personal:'tdeePersonal',energy_balance:'energyBalance',
  bodycomp_circ:'bodyComp',fat_vs_other:'fatVsOther',rate_band:'rateBand',goal_traj:'goalTrajectory',
  weight_forecast:'weightForecast',e1rm:'e1rmFrom',strength_trend:'strengthTrend',recovery:'recoveryLatentState',
  appetite:'appetiteState',muscle_risk:'muscleRetentionRisk',adherence:'adherenceState',data_trust:'dataTrust',
  met_energy:'metKcal',personal_baseline:'personalBaselines',measurement_quality:'measurementQuality',
  change_point:'changePoints',response_matrix:'personalResponse',exercise_response:'exerciseResponse',
  uncertainty_chain:'uncertaintyChain'
};
(function(){MODELS.forEach(function(m){if(MODEL_BINDINGS[m.id])m.fn=MODEL_BINDINGS[m.id];});})();

/* ============================================================================
   \u00a711: FORECASTING AS A MODEL FAMILY
   The production forecast is one formula: a straight-line trend with a heuristic interval. Its own ledger
   shows what that costs \u2014 a mean error that grows with horizon, +0.38 lb at a week and +5.01 lb at four,
   because a cut slows and a straight line does not. The direction is explicit: build a family, backtest it
   from many origins at several horizons, diagnose the residuals, calibrate, check suitability, and only then
   choose \u2014 per horizon, and only when the advantage is bigger than the noise.

   Every candidate sees only the readings dated on or before its origin, so a backtest cannot leak the future.
   ============================================================================ */
var FORECAST_HORIZONS=[7,14,28];
var FORECAST_LEVEL=0.80, FORECAST_Z=1.2816;   // a declared nominal level, so coverage can be judged against it
function _levelSlopeAt(series,origin){
  var hist=series.filter(function(o){return o.date<=origin;});
  if(hist.length<10)return null;
  var last7=hist.slice(-7).map(function(o){return o.value;});
  var level=mean(last7);
  var win=hist.filter(function(o){return daysBetween(o.date,origin)<=28;});
  if(win.length<8)return null;
  var pts=win.map(function(o){return {x:daysBetween(win[0].date,o.date),y:o.value};});
  var fit=theilSen(pts);
  if(!fit||fit.slope==null)return null;
  var resid=pts.map(function(p){return p.y-(fit.intercept+fit.slope*p.x);});
  var noise=sd(resid)||0.5;
  /* Standard error of the slope from the residual scatter and the spread of the x values. */
  var xs=pts.map(function(p){return p.x;}),mx=mean(xs);
  var sxx=xs.reduce(function(a,x){return a+(x-mx)*(x-mx);},0)||1;
  var slopeSe=noise/Math.sqrt(sxx);
  return {level:level,slopePerDay:fit.slope,slopeSePerDay:slopeSe,noise:noise,n:win.length};
}
var FORECAST_CANDIDATES={
  naive:{label:'last level',fit:function(ls,h){
    return {point:ls.level,sd:ls.noise*Math.sqrt(1+h/7)};}},
  linear:{label:'linear trend',fit:function(ls,h){
    return {point:ls.level+ls.slopePerDay*h,sd:Math.sqrt(Math.pow(ls.noise,2)+Math.pow(ls.slopeSePerDay*h,2))};}},
  damped:{label:'damped trend',fit:function(ls,h){
    /* The slope decays week by week (phi per week), so a cut is projected to slow, as cuts do. */
    var phi=0.85,wk=h/7,sum=0;
    for(var k=1;k<=Math.ceil(wk);k++)sum+=Math.pow(phi,k)*Math.min(1,wk-(k-1));
    var eff=sum*7;
    return {point:ls.level+ls.slopePerDay*eff,sd:Math.sqrt(Math.pow(ls.noise,2)+Math.pow(ls.slopeSePerDay*eff,2))};}}
};
function forecastBacktest(opts){
  opts=opts||{};
  var mk='__forecastBacktest:'+JSON.stringify(opts);if(_MEMO[mk])return _MEMO[mk];
  var res=_forecastBacktestCore(opts);_MEMO[mk]=res;return res;
}
function _forecastBacktestCore(opts){
  opts=opts||{};
  var series=obsOf('weight').slice().sort(function(a,b){return a.date<b.date?-1:1;});
  if(series.length<30)return {status:'insufficient',need:['at least 30 weigh-ins to backtest from several origins']};
  var byDate={};series.forEach(function(o){byDate[o.date]=o.value;});
  var actualNear=function(date){
    /* The outcome is the reading on the due date, or the nearest within two days \u2014 never interpolated. */
    for(var d=0;d<=2;d++){var a=byDate[addDays(date,d)],b=byDate[addDays(date,-d)];if(a!=null)return a;if(b!=null)return b;}
    return null;};
  var first=series[0].date,last=series[series.length-1].date;
  /* Bounded to the most recent 240 days. Every origin in the whole history made current state cost 2 seconds on a
     five-year record, over its budget, once the displayed forecast began to depend on this. A regime from years ago
     also says little about the present one, so the bound is better forecasting as well as cheaper. */
  var lookbackStart=addDays(last,-(opts.lookbackDays||240));
  if(first<lookbackStart)first=lookbackStart;
  var origins=[];
  /* Origins every 3 days from the first date a candidate could be fitted (_levelSlopeAt refuses fewer than 10
     readings). Neighbouring origins share data, so their errors correlate; the lag-1 residual autocorrelation
     is reported so that is visible rather than hidden in an inflated count. */
  for(var o=addDays(first,21);o<=addDays(last,-7);o=addDays(o,opts.step||3))origins.push(o);
  var rows=[];
  origins.forEach(function(org){
    var ls=_levelSlopeAt(series,org);if(!ls)return;
    FORECAST_HORIZONS.forEach(function(h){
      var due=addDays(org,h);if(due>last)return;
      var act=actualNear(due);if(act==null)return;
      Object.keys(FORECAST_CANDIDATES).forEach(function(c){
        var f=FORECAST_CANDIDATES[c].fit(ls,h);
        var lo=f.point-FORECAST_Z*f.sd,hi=f.point+FORECAST_Z*f.sd;
        rows.push({origin:org,horizon:h,candidate:c,point:f.point,sd:f.sd,actual:act,error:act-f.point,covered:act>=lo&&act<=hi});
      });
    });
  });
  if(!rows.length)return {status:'insufficient',need:['more history']};
  return {status:'ok',origins:origins.length,rows:rows,level:FORECAST_LEVEL,
    note:'Rolling-origin backtest: each candidate refit at every origin using only readings up to it, scored at every horizon it can reach.'};
}
/* Not _lag1: 54-scenarios.js already owns that name and loads later, so a function called _lag1 here was
   silently replaced by one expecting different input. The namespace guard caught it. */
function _residualLag1(x){if(x.length<4)return null;var m=mean(x),num=0,den=0;
  for(var i=0;i<x.length;i++){den+=(x[i]-m)*(x[i]-m);if(i)num+=(x[i]-m)*(x[i-1]-m);}return den?round(num/den,2):null;}
function forecastFamily(opts){
  opts=opts||{};
  var bt=forecastBacktest(opts);
  if(bt.status!=='ok')return {status:bt.status,need:bt.need};
  var cands=Object.keys(FORECAST_CANDIDATES);
  var backtestResult={},residualDiagnostics={},calibrationResult={},choice={};
  FORECAST_HORIZONS.forEach(function(h){
    backtestResult[h]={};residualDiagnostics[h]={};calibrationResult[h]={};
    cands.forEach(function(c){
      var r=bt.rows.filter(function(x){return x.horizon===h&&x.candidate===c;});
      if(r.length<5)return;
      var e=r.map(function(x){return x.error;}),b=mean(e),s2=sd(e)||0;
      backtestResult[h][c]={n:r.length,mae:round(mean(e.map(Math.abs)),2),rmse:round(Math.sqrt(mean(e.map(function(v){return v*v;}))),2)};
      /* Neighbouring origins share data, so their errors are correlated (lag-1 around 0.5 here) and are not
         n independent observations. Testing bias against the raw n overstated its significance; the effective
         n, n(1−ρ)/(1+ρ), is what the evidence is actually worth. */
      var rho=_residualLag1(e);var rc=Math.max(0,Math.min(0.95,rho||0));
      var nEff=Math.max(2,Math.min(e.length,e.length*(1-rc)/(1+rc)));
      var tEff=s2?b/(s2/Math.sqrt(nEff)):null;
      residualDiagnostics[h][c]={bias:round(b,2),biasT:tEff!=null?round(tEff,1):null,
        lag1:rho,n:e.length,effectiveN:round(nEff,1),
        verdict:(tEff!=null&&Math.abs(tEff)>=2)?'systematically biased':'no significant bias'};
      var cov=r.filter(function(x){return x.covered;}).length/r.length;
      calibrationResult[h][c]={nominal:FORECAST_LEVEL,empirical:round(cov,3),
        verdict:Math.abs(cov-FORECAST_LEVEL)<=0.10?'calibrated':(cov<FORECAST_LEVEL?'intervals too narrow':'intervals too wide')};
    });
    /* Choice per horizon, never one champion for all: lowest error among candidates with no significant bias
       and calibrated intervals; ahead of the runner-up by more than the noise, or else an ensemble. */
    var ok=cands.filter(function(c){return backtestResult[h][c]&&residualDiagnostics[h][c].verdict==='no significant bias';});
    var allBiased=!ok.length;
    var pool=ok.length?ok:cands.filter(function(c){return backtestResult[h][c];});
    /* A horizon with too few backtest points for any candidate is not forecast: with nothing to choose on,
       a forecast there would be a guess presented as a selection. */
    if(!pool.length){choice[h]={selected:null,weights:{},insufficient:true,
      reason:'too few backtest points at '+h+' days to choose between candidates, so no forecast is made at this horizon'};return;}
    pool.sort(function(a,b){return backtestResult[h][a].rmse-backtestResult[h][b].rmse;});
    var best=pool[0],second=pool[1];
    var clear=second?(backtestResult[h][second].rmse-backtestResult[h][best].rmse)>0.1*backtestResult[h][best].rmse:true;
    var w={};
    if(clear)w[best]=1;
    else{var inv=pool.map(function(c){return 1/Math.pow(backtestResult[h][c].rmse,2);});var tot=inv.reduce(function(a,b){return a+b;},0);
      pool.forEach(function(c,i){w[c]=round(inv[i]/tot,3);});}
    /* The reason must describe the branch actually taken. The first version said "no significant bias" even
       when every candidate was biased and the choice had quietly fallen back to lowest error. */
    var biasNote=allBiased?(' \u2014 but every candidate is systematically biased at '+h+' days, so this is the least wrong, not a sound forecast'):'';
    choice[h]={selected:clear?best:'ensemble',weights:w,unbiasedCandidates:ok,allBiased:allBiased,
      reason:(clear?(best+' has the lowest error'+(allBiased?'':' with no significant bias')+', by more than the noise'):
        ('no candidate is clearly best, so the forecast is an inverse-variance ensemble'+(allBiased?' of biased candidates':'')))+biasNote};
  });
  /* The forecast itself: each horizon uses its own selection, from today's data. */
  var series=obsOf('weight').slice().sort(function(a,b){return a.date<b.date?-1:1;});
  var ls=_levelSlopeAt(series,asOf());
  var forecastDistribution={};
  if(ls)FORECAST_HORIZONS.forEach(function(h){
    if(choice[h].insufficient){forecastDistribution[h]={status:'insufficient',reason:choice[h].reason};return;}
    var ws=choice[h].weights,pt=0,v=0;
    Object.keys(ws).forEach(function(c){var f=FORECAST_CANDIDATES[c].fit(ls,h);pt+=ws[c]*f.point;v+=ws[c]*f.sd*f.sd;});
    /* Size the interval from the error the backtest actually saw, not a flat widening factor. The first
       version multiplied by 1.25 whatever the shortfall, so a 29% coverage against an 80% target was barely
       corrected. The weighted backtest RMSE includes the bias, so a biased horizon gets a wide interval. */
    var rmseW=0;Object.keys(ws).forEach(function(c){rmseW+=ws[c]*(backtestResult[h][c]?backtestResult[h][c].rmse:0);});
    var sModel=Math.sqrt(v);
    var s=Math.max(sModel,rmseW);
    var inflate=s>sModel;
    forecastDistribution[h]={dueDate:addDays(asOf(),h),point:round(pt,2),sd:round(s,2),
      p10:round(pt-FORECAST_Z*s,2),p50:round(pt,2),p90:round(pt+FORECAST_Z*s,2),level:FORECAST_LEVEL,
      inflated:inflate,sizedFrom:inflate?'backtest error':'model uncertainty',
      reliable:!choice[h].allBiased,
      warning:choice[h].allBiased?'every candidate is systematically biased at this horizon; treat as indicative only':null};
  });
  var ident=(typeof runIdentity==='function')?runIdentity({model:'forecast_family',inputs:{n:series.length,last:series.length?series[series.length-1].date:null},params:{horizons:FORECAST_HORIZONS,level:FORECAST_LEVEL}}):null;
  return {status:'ok',cls:'PREDICTIVE',
    forecastModel:{family:cands.map(function(c){return {id:c,label:FORECAST_CANDIDATES[c].label};}),horizons:FORECAST_HORIZONS,level:FORECAST_LEVEL},
    backtestResult:{origins:bt.origins,byHorizon:backtestResult},
    residualDiagnostics:residualDiagnostics,
    calibrationResult:calibrationResult,
    contextSuitability:forecastSuitability(series),
    selection:choice,
    forecastDistribution:forecastDistribution,
    forecastProvenance:{runId:ident?ident.runId:null,origins:bt.origins,candidates:cands,
      readings:series.length,asOf:asOf(),method:'rolling-origin backtest, per-horizon selection'},
    note:'A family of forecasts, each backtested from '+bt.origins+' origins at '+FORECAST_HORIZONS.join(', ')+' days; the forecast at each horizon uses whichever candidate that horizon\u2019s evidence supports.',
    caveat:'Lower historical error is evidence for this record and this kind of period, not universal superiority \u2014 a candidate that wins during a cut can lose during maintenance.'};
}
function forecastSuitability(series){
  /* A trend model assumes the recent regime continues. A phase change inside its window breaks that. */
  var ph=null;try{ph=activePhase();}catch(e){}
  var recentChange=!!(ph&&ph.startDate&&daysBetween(ph.startDate,asOf())<28);
  var n=series.filter(function(o){return daysBetween(o.date,asOf())<=28;}).length;
  return {phaseChangeInWindow:recentChange,readingsInWindow:n,
    trendSuitable:!recentChange&&n>=8,
    note:recentChange?'The current phase began inside the fitting window, so a trend fitted across the change mixes two regimes.':
      (n<8?'Too few readings in the last four weeks to fit a trend reliably.':'The fitting window lies inside a single phase with enough readings.')};
}

/* ============================================================================
   \u00a718: ADHERENCE AS A PREDICTED PROBABILITY
   planned intervention \u2192 friction features \u2192 completion probability \u2192 observed completion \u2192 calibration.
   adherenceState reports the share of days a target was met: pass or fail per day, averaged. The direction
   asks for a probability of completion driven by friction, updated from outcomes, and never a moral or
   binary label. Each prediction here is made only from days BEFORE the day it predicts, so calibration is
   earned, and the model is scored against the plain base rate: if the friction features do not beat simply
   knowing how often a target is usually met, it says so rather than claiming they help.
   ============================================================================ */
var COMPLETION_TARGETS={
  calories:{label:'Calorie target',met:function(v,t){return t!=null&&Math.abs(v-t)<=t*0.10;},target:function(){var p=activePhase()||{};return p.calorieTarget||null;}},
  protein:{label:'Protein target',met:function(v,t){return t!=null&&v>=t*0.9;},target:function(){var p=activePhase()||{};return p.proteinTarget||null;}},
  /* ONE definition of "met", read by both this model and adherenceState. They had drifted: this used the full
     step target where adherenceState used 90%, and read p.sleepTarget — a field that does not exist; the target
     is sleepTargetH — so it always fell back to 7.5 h. The same target showed 25% met here and 62% there. */
  steps:{label:'Step target',met:function(v,t){return t!=null&&v>=t*0.9;},target:function(){var p=activePhase()||{};return p.stepTarget||null;}},
  sleep:{label:'Sleep target',met:function(v,t){return t!=null&&v>=t-0.5;},target:function(){var p=activePhase()||{};return p.sleepTargetH||(prof()||{}).sleepTargetH||null;}}
};
function _completionHistory(kind,days){
  var t=COMPLETION_TARGETS[kind].target();if(t==null)return null;
  /* The same daily series adherenceState reads. Taking the last raw entry per day instead gave protein 94%
     against its 92% — a day with two entries was counted differently — so the data basis is shared as well as
     the criterion. */
  var byDate={};seriesWindow(kind,days).forEach(function(o){byDate[o.date]=o.value;});
  var rows=[];
  for(var i=days-1;i>=0;i--){var d=addDays(asOf(),-i);
    /* A day with no record is not a miss: completion is only observed where the quantity was recorded. */
    if(byDate[d]==null)continue;
    rows.push({date:d,completed:COMPLETION_TARGETS[kind].met(byDate[d],t)?1:0,
      weekend:[0,6].indexOf(new Date(d+'T12:00:00Z').getUTCDay())>=0?1:0});}
  rows.forEach(function(r,i){
    var prev=rows.slice(Math.max(0,i-7),i);
    r.priorRate=prev.length?prev.reduce(function(a,x){return a+x.completed;},0)/prev.length:null;
    var k=i-1,since=0;while(k>=0&&rows[k].completed){since++;k--;}r.sinceMiss=since;});
  return {target:t,rows:rows};
}
function _fitCompletion(train){
  /* Logistic on friction features, regularised; below 20 days the base rate is all the data can support. */
  var X=train.map(function(r){return [1,r.weekend,(r.priorRate==null?0.5:r.priorRate)-0.5,Math.min(r.sinceMiss,7)/7];});
  var y=train.map(function(r){return r.completed;});
  if(train.length<20)return null;
  return _logistic(X,y,{iters:300,lr:0.1});
}
function _predictCompletion(beta,r,baseRate){
  if(!beta)return baseRate;
  var x=[1,r.weekend,(r.priorRate==null?0.5:r.priorRate)-0.5,Math.min(r.sinceMiss,7)/7];
  var z=0;for(var j=0;j<x.length;j++)z+=beta[j]*x[j];
  return 1/(1+Math.exp(-z));
}
function completionModel(kind,opts){
  opts=opts||{};
  var days=opts.days||56;
  if(!COMPLETION_TARGETS[kind])return {status:'unknown-target',kind:kind};
  var h=_completionHistory(kind,days);
  if(!h)return {status:'no-target',kind:kind,note:'No target is set for this, so there is nothing to complete.'};
  var rows=h.rows;
  if(rows.length<14)return {status:'insufficient',kind:kind,need:['at least 14 recorded days']};
  /* Prequential scoring: predict each day from the days before it only. */
  var preds=[];
  for(var i=10;i<rows.length;i++){
    var train=rows.slice(0,i);
    var base=(train.reduce(function(a,x){return a+x.completed;},0)+1)/(train.length+2);   // Laplace-smoothed base rate
    var beta=_fitCompletion(train);
    preds.push({date:rows[i].date,p:_predictCompletion(beta,rows[i],base),base:base,y:rows[i].completed});
  }
  var brier=function(k){return preds.reduce(function(a,x){return a+Math.pow(x[k]-x.y,2);},0)/preds.length;};
  var bModel=brier('p'),bBase=brier('base');
  /* reliability: in bins of predicted probability, how often was the target actually met */
  var bins=[[0,0.4],[0.4,0.7],[0.7,1.01]].map(function(b){
    var g=preds.filter(function(x){return x.p>=b[0]&&x.p<b[1];});
    return {range:b[0]+'\u2013'+Math.min(1,b[1]),n:g.length,
      predicted:g.length?round(mean(g.map(function(x){return x.p;})),2):null,
      observed:g.length?round(mean(g.map(function(x){return x.y;})),2):null};});
  var full=_fitCompletion(rows);
  var baseAll=(rows.reduce(function(a,x){return a+x.completed;},0)+1)/(rows.length+2);
  var tomorrow=addDays(asOf(),1);
  var next={weekend:[0,6].indexOf(new Date(tomorrow+'T12:00:00Z').getUTCDay())>=0?1:0,
    priorRate:rows.slice(-7).reduce(function(a,x){return a+x.completed;},0)/Math.min(7,rows.length),
    sinceMiss:(function(){var s=0,k=rows.length-1;while(k>=0&&rows[k].completed){s++;k--;}return s;})()};
  var pNext=_predictCompletion(full,next,baseAll);
  var featuresHelp=bModel<bBase*0.95;
  return {status:'ok',cls:'EMPIRICAL',kind:kind,label:COMPLETION_TARGETS[kind].label,target:h.target,
    plannedIntervention:{what:COMPLETION_TARGETS[kind].label,target:h.target},
    frictionFeatures:['weekend','completion over the previous week','days since the last miss'],
    completionProbability:{tomorrow:round(pNext,2),date:tomorrow,
      basis:full?'friction model fitted on '+rows.length+' recorded days':'base rate \u2014 fewer than 20 days to fit friction'},
    observedCompletion:{rate:round(rows.reduce(function(a,x){return a+x.completed;},0)/rows.length,2),days:rows.length},
    calibration:{brier:round(bModel,3),baseRateBrier:round(bBase,3),predictions:preds.length,reliability:bins,
      featuresHelp:featuresHelp,
      verdict:featuresHelp?'the friction features predict better than the base rate':
        'the friction features do not beat simply using how often this target is usually met, so they are not relied on'},
    note:'A probability of meeting the target, predicted from friction and scored against what actually happened \u2014 not a verdict on the day.',
    caveat:'Only recorded days count. A day with nothing recorded is unknown, not a miss.'};
}

/* ---- HOLD-OUT VALIDATION OF THE FORECAST PROCEDURE ----
   The family's own backtest chooses a method and sizes the interval from the same errors it then reports, so its
   calibration is in-sample. Here the whole procedure \u2014 choice per horizon and interval sizing \u2014 is fitted on the
   earlier 60% of origins and graded on the later 40%, which it never saw. A horizon is validated only if the hold-out
   shows no significant bias (effective n, as in the family) and coverage within ten points of nominal, on enough
   hold-out evidence to say so. Too little evidence is reported as exactly that. */
var FORECAST_HOLDOUT_MIN_NEFF=6;
function forecastHoldoutValidation(){
  if(_MEMO.__holdout)return _MEMO.__holdout;
  var r=_forecastHoldoutCore();_MEMO.__holdout=r;return r;
}
function _forecastHoldoutCore(){
  var bt=forecastBacktest();
  if(bt.status!=='ok')return {status:'insufficient',need:bt.need};
  var origins=Array.from(new Set(bt.rows.map(function(r){return r.origin;}))).sort();
  var cut=origins[Math.floor(origins.length*0.6)];
  var cands=Object.keys(FORECAST_CANDIDATES),out={};
  FORECAST_HORIZONS.forEach(function(h){
    var fit=bt.rows.filter(function(r){return r.horizon===h&&r.origin<cut;});
    var test=bt.rows.filter(function(r){return r.horizon===h&&r.origin>=cut;});
    var byC=function(rows,c){return rows.filter(function(r){return r.candidate===c;});};
    /* choose on the fit window only */
    /* The same rule the family uses: lowest error among candidates with no significant bias, falling back to all. */
    var stat=cands.map(function(c){var e=byC(fit,c).map(function(r){return r.error;});if(e.length<3)return null;
      var m=mean(e),q=sd(e)||0,rh=Math.max(0,Math.min(0.95,_residualLag1(e)||0)),ne=Math.max(2,Math.min(e.length,e.length*(1-rh)/(1+rh)));
      return {c:c,rmse:Math.sqrt(mean(e.map(function(v){return v*v;}))),unbiased:!q||Math.abs(m/(q/Math.sqrt(ne)))<2};}).filter(Boolean);
    var pool=stat.filter(function(x){return x.unbiased;});if(!pool.length)pool=stat;
    pool.sort(function(a,b){return a.rmse-b.rmse;});
    var best=pool.length?pool[0].c:null,bestRmse=pool.length?pool[0].rmse:Infinity;
    var held=best?byC(test,best):[];
    if(!best||held.length<3){out[h]={verdict:'insufficient evidence',holdoutN:held.length,
      note:'too few hold-out forecasts at '+h+' days to judge'};return;}
    var e=held.map(function(r){return r.error;}),b=mean(e),s2=sd(e)||0;
    var rho=_residualLag1(e),rc=Math.max(0,Math.min(0.95,rho||0));
    var nEff=Math.max(2,Math.min(e.length,e.length*(1-rc)/(1+rc)));
    var t=s2?b/(s2/Math.sqrt(nEff)):0;
    var sizeSd=bestRmse;                       /* interval sized from the fit window's error, never the hold-out's */
    var cov=held.filter(function(r){return Math.abs(r.error)<=FORECAST_Z*sizeSd;}).length/held.length;
    var enough=nEff>=FORECAST_HOLDOUT_MIN_NEFF;
    var unbiased=Math.abs(t)<2,calibrated=Math.abs(cov-FORECAST_LEVEL)<=0.10;
    out[h]={method:best,holdoutN:held.length,effectiveN:round(nEff,1),bias:round(b,2),biasT:round(t,1),coverage:round(cov,2),nominal:FORECAST_LEVEL,
      verdict:!enough?'insufficient evidence':((unbiased&&calibrated)?'validated':'not validated'),
      note:!enough?('hold-out effective sample '+round(nEff,1)+' is below '+FORECAST_HOLDOUT_MIN_NEFF+' \u2014 more weigh-ins are needed to judge'):
        ((unbiased&&calibrated)?'unbiased and calibrated on forecasts the procedure never saw':
          ((!unbiased?'biased on the hold-out (t = '+round(t,1)+')':'')+(!unbiased&&!calibrated?'; ':'')+(!calibrated?'coverage '+Math.round(cov*100)+'% against '+Math.round(FORECAST_LEVEL*100)+'% nominal':'')))};
  });
  var validated=FORECAST_HORIZONS.filter(function(h){return out[h].verdict==='validated';});
  return {status:'ok',cut:cut,byHorizon:out,validatedHorizons:validated,
    grade:validated.length?'STATISTICALLY_VALIDATED':'OPERATIONAL_ANALYTICAL',
    note:validated.length?('validated at '+validated.join(' and ')+' days on hold-out forecasts'):'not validated at any horizon yet'};
}

/* ---- CHAMPION / CHALLENGER: which forecast is shown ----
   The displayed forecast was the straight-line weightForecast(), whose own ledger shows it running heavy and worse
   with horizon. The forecast family was built and backtested but only recorded in the background. Here the two meet
   on the same hold-out origins \u2014 the later 40%, which the family's procedure never saw when choosing its method \u2014
   using the ACTUAL displayed forecast rather than the backtest's simplified linear candidate. The family is shown at
   a horizon only if it has lower error and no larger bias there, on at least three hold-out forecasts; otherwise the
   current forecast stays, and the reason is given. Both keep being recorded under their own ids. */
function forecastPromotion(){
  if(_MEMO.__forecastPromotion)return _MEMO.__forecastPromotion;
  var H=forecastHoldoutValidation(),bt=forecastBacktest(),out={};
  if(H.status!=='ok'||bt.status!=='ok'){out={status:'insufficient'};_MEMO.__forecastPromotion=out;return out;}
  var series=obsOf('weight');var byDate={};series.forEach(function(o){byDate[o.date]=o.value;});
  var actualNear=function(d){for(var k=0;k<=2;k++){var a=byDate[addDays(d,k)],b=byDate[addDays(d,-k)];if(a!=null)return a;if(b!=null)return b;}return null;};
  FORECAST_HORIZONS.forEach(function(h){
    var ho=H.byHorizon[h]||{};
    var fam=bt.rows.filter(function(r){return r.horizon===h&&r.origin>=H.cut&&r.candidate===ho.method;});
    if(!ho.method||fam.length<3){out[h]={promoted:false,reason:'too few hold-out forecasts at '+h+' days to compare'};return;}
    var fe=[],pe=[];
    fam.forEach(function(r){
      var pf=null;try{pf=withAsOf(r.origin,function(){return weightForecast(h);});}catch(e){}
      if(!pf||pf.status!=='ok')return;
      var act=actualNear(addDays(r.origin,h));if(act==null)return;
      fe.push(r.error);pe.push(act-pf.point);});
    if(fe.length<3){out[h]={promoted:false,reason:'too few paired hold-out forecasts at '+h+' days'};return;}
    var rm=function(e){return Math.sqrt(mean(e.map(function(v){return v*v;})));};
    var fR=rm(fe),pR=rm(pe),fB=mean(fe),pB=mean(pe);
    /* A win must be real: at least 10% lower error, the same margin the family's own selection demands, and no larger
       bias. The first version promoted the 7-day forecast on 1.28 against 1.30 lb over six forecasts — a tie — which
       would switch what people see on noise. On a tie the current forecast stays. */
    var win=fR<pR*0.9&&Math.abs(fB)<=Math.abs(pB);
    var tie=!win&&fR<=pR*1.1&&fR>=pR*0.9;
    var fit=bt.rows.filter(function(r){return r.horizon===h&&r.origin<H.cut&&r.candidate===ho.method;}).map(function(r){return r.error;});
    out[h]={promoted:win,n:fe.length,method:ho.method,sizeSd:fit.length?rm(fit):null,
      improved:{rmse:round(fR,2),bias:round(fB,2)},current:{rmse:round(pR,2),bias:round(pB,2)},
      reason:'on '+fe.length+' hold-out forecasts \u2014 current: error '+round(pR,2)+' lb, bias '+round(pB,2)+' lb; improved ('+ho.method+'): error '+round(fR,2)+' lb, bias '+round(fB,2)+' lb \u2014 '+
        (win?'the improved forecast is clearly better, so it is shown':(tie?'too close to call, so the current forecast stays':'the improved forecast is not better here, so the current one stays'))};
  });
  out.status='ok';_MEMO.__forecastPromotion=out;return out;
}
function displayedForecast(h){
  var cur=weightForecast(h);
  var P=forecastPromotion();
  if(P.status!=='ok'||!P[h]||!P[h].promoted)return Object.assign({},cur,{source:'weight_forecast',promotion:P[h]||null});
  /* Exactly the procedure that won: the hold-out's method, from today's data, sized by the fit window's error. The
     first version showed the full-sample choice (an ensemble), which is not what had been evaluated. */
  var series=obsOf('weight').slice().sort(function(a,b){return a.date<b.date?-1:1;});
  var ls=_levelSlopeAt(series,asOf());
  if(!ls||!FORECAST_CANDIDATES[P[h].method])return Object.assign({},cur,{source:'weight_forecast',promotion:P[h]});
  var f=FORECAST_CANDIDATES[P[h].method].fit(ls,h),sdv=Math.max(f.sd,P[h].sizeSd||0);
  /* Same shape as weightForecast(), so every consumer reads it unchanged. */
  return {status:'ok',model:'weight_forecast_family',cls:'PREDICTIVE',horizonDays:h,point:round(f.point,2),lo:round(f.point-FORECAST_Z*sdv,2),hi:round(f.point+FORECAST_Z*sdv,2),level:FORECAST_LEVEL,
    base:cur.base,trend:cur.trend,dueDate:addDays(asOf(),h),confidence:'medium',
    assumptions:['the recent regime continues','a single phase across the fitting window'],
    source:'weight_forecast_family',method:P[h].method,promotion:P[h]};
}

/* ---- PRIOR SENSITIVITY (H4). The maintenance estimate blends the population prior with the person's data at weight
   w = n / (n + 14), so the share of any prior error that still carries into it is exactly 1 − w; and how much the
   answer depends on the assumed prior strength is read by recomputing with 7 and 28 in place of 14. ---- */
function priorSensitivity(){
  var t=tdeeEstimate();if(t.status!=='ok')return {status:t.status};
  if(t.cls==='PRIOR')return {status:'ok',share:1,verdict:'prior-led',note:'This is still the population starting estimate: none of it comes from your own data yet.'};
  var emp=t.empirical,pr=t.prior;if(!emp||emp.status!=='ok'||!pr||pr.status!=='ok')return {status:'ok',share:0,verdict:'data-led',note:'No population prior is blended in.'};
  /* The same outcome calibration the estimate applies: without it the range (2,860–2,910) did not contain the 2,662
     shown. */
  var adj=(t.adjusted&&t.calibration&&t.calibration.status==='ok')?clamp(t.calibration.bias,-300,300):0;
  var at=function(k){var w=emp.n/(emp.n+k);return w*emp.value+(1-w)*pr.value-adj;},share=1-t.weight;
  var v7=at(7),v28=at(28),spread=Math.abs(v28-v7);
  return {status:'ok',cls:'DERIVED',share:round(share,2),n:emp.n,range:[roundTo(Math.min(v7,v28),10),roundTo(Math.max(v7,v28),10)],spread:round(spread,0),
    verdict:share<=0.25?'data-led':(share<=0.6?'balanced':'prior-led'),
    note:'About '+Math.round(share*100)+'% of any error in the population starting estimate still carries into this one, from '+emp.n+' logged days; it shrinks as you log more. '+
      'Assuming a weaker or stronger prior moves the answer between '+fmtNum(roundTo(Math.min(v7,v28),10),0)+' and '+fmtNum(roundTo(Math.max(v7,v28),10),0)+' kcal.'};
}
/* ACUTE RECOVERY: today's readings alone. Autoregulation heuristics, labelled as such: very high fatigue or very short
   sleep \u2192 rest or train very lightly; high fatigue, short sleep or high soreness \u2192 go lighter (a set fewer per exercise,
   3 or more reps in reserve). */
function acuteRecovery(date){date=date||asOf();var v=function(t){var o=obsOf(t).filter(function(x){return x.date===date;});return o.length?o[o.length-1].value:null;};
  var fa=v('fatigue'),sl=v('sleep'),so=v('soreness'),reasons=[],sev=0;
  if(fa!=null&&fa>=9){reasons.push('fatigue '+fa+'/10');sev=Math.max(sev,2);}else if(fa!=null&&fa>=8){reasons.push('fatigue '+fa+'/10');sev=Math.max(sev,1);}
  if(sl!=null&&sl<4.5){reasons.push(fmtH(sl)+' of sleep');sev=Math.max(sev,2);}else if(sl!=null&&sl<5){reasons.push(fmtH(sl)+' of sleep');sev=Math.max(sev,1);}
  if(so!=null&&so>=8){reasons.push('soreness '+so+'/10');sev=Math.max(sev,1);}
  if(!sev)return {flag:false,reasons:[]};
  return {flag:true,cls:'HEURISTIC',level:sev>=2?'poor':'strained',reasons:reasons,
    advice:sev>=2?'rest today, or train very lightly (a walk, mobility, technique work)':'go lighter today: a set fewer per exercise, and keep 3 or more reps in reserve',
    basis:'autoregulation heuristic on today\u2019s readings; not a diagnosis'};}
