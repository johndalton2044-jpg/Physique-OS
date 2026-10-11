/* ============================================================================
   STRUCTURED EXPLANATION (catalogue doc 2, P1.1 to P1.3; doc 1 W-045).
   An explanation is a value, not a paragraph. Each of its claims is a proposition {subject, predicate, object} with its
   type, epistemic class, confidence, the evidence it rests on (observation ids or evidence-registry ids), its
   assumptions, what currently counts against it, its limitations, where it applies and when it is to be reviewed. A
   sentence is only a rendering of a claim: compileExplanation() renders one explanation at three levels (simple,
   analytical, scientific) from the same claims, so the levels differ in how much they say, never in what they claim.

   The chain is evidence, then interpretation, then policy, then decision. A published finding (a claim of type finding)
   can support a policy this system chooses (type policy); a citation never validates the policy itself, and the
   scientific rendering says which of the two a line is.

   Nothing here parses a sentence. Every claim is built from the values the models and the decision engine computed.
   ============================================================================ */
var EXPLANATION_VERSION='1.0';
var CLAIM_TYPES={
  observation:'what was measured or logged in this record',
  inference:'what a model concluded from this record',
  finding:'a general empirical finding from published evidence, about a population',
  policy:'an operating rule this system chooses: cited evidence may support it, but it is not validated as a model',
  prediction:'what is expected to happen, stated before it does and scored when it is due'};
/* the person's detail level chooses the level an explanation is rendered at (doc 2 section 20: commitment levels) */
var EXPLANATION_LEVELS={
  simple:{rank:0,detail:'casual',says:'what the record shows and what to do, in plain words'},
  analytical:{rank:1,detail:'insightful',says:'the figures with their ranges, the rules applied and the evidence behind them'},
  scientific:{rank:2,detail:'developer',says:'everything, with each claim’s epistemic class, model version, evidence grade, population, limitations and review date'}};
function explanationLevelFor(detail){var k=Object.keys(EXPLANATION_LEVELS).filter(function(l){return EXPLANATION_LEVELS[l].detail===detail;})[0];return k||'analytical';}
function currentExplanationLevel(){var d='insightful';try{d=typeof detailLevel==='function'?detailLevel():d;}catch(e){}return explanationLevelFor(d);}

/* ---- the claim (P1.1) ---- */
function explanationClaim(o){
  if(!o||!o.proposition||!o.proposition.subject||!o.proposition.predicate)throw new Error('a claim needs a proposition {subject, predicate, object}');
  if(!CLAIM_TYPES[o.type])throw new Error('unknown claim type: '+o.type);
  var ec=o.type==='policy'?null:(o.epistemicClass||null);
  if(o.type!=='policy'&&!ec)throw new Error('a '+o.type+' claim needs an epistemic class');
  if(ec&&!EPISTEMIC_CLASSES[ec])throw new Error('unknown epistemic class: '+ec);
  if(o.type==='prediction'&&ec!=='PREDICTIVE')throw new Error('a prediction is PREDICTIVE');
  if(o.type==='finding'&&!(o.sourceIds||[]).length)throw new Error('a finding needs the evidence it comes from');
  var p={subject:String(o.proposition.subject),predicate:String(o.proposition.predicate),object:o.proposition.object==null?null:JSON.parse(JSON.stringify(o.proposition.object))};
  var c={id:o.id||('clm-'+_hash(o.type+'|'+p.subject+'|'+p.predicate+'|'+JSON.stringify(p.object))),
    proposition:p,type:o.type,
    scope:o.scope||(o.type==='finding'?'population':(o.type==='policy'?'this system':'this record')),
    population:o.population||(o.type==='finding'?null:'this person'),
    applicability:o.applicability||null,epistemicClass:ec,confidence:o.confidence||null,
    evidenceIds:(o.evidenceIds||[]).slice(),basedOn:(o.basedOn||[]).slice(),
    assumptions:(o.assumptions||[]).slice(),counterIndicators:(o.counterIndicators||[]).slice(),limitations:(o.limitations||[]).slice(),
    reviewDate:o.reviewDate||null,sourceIds:(o.sourceIds||[]).slice(),
    model:o.model||null,modelVersion:o.modelVersion||null,validation:o.validation||null,statement:o.statement||null};
  return _deepFreeze(c);
}

/* ---- claims built from the record's own values ---- */
function _exObsIds(type,from,to){try{return obsOf(type).filter(function(x){return (!from||x.date>=from)&&(!to||x.date<=to);}).map(function(x){return x.id;}).filter(Boolean);}catch(e){return [];}}
function _modelClaim(modelId,res,prop,extra){var m=modelById(modelId)||{};
  return explanationClaim(Object.assign({type:'inference',proposition:prop,epistemicClass:epistemicClassOf(res&&res.cls?res:{cls:m.cls})||'OBSERVED',
    confidence:res&&res.confidence||null,model:modelId,modelVersion:m.version||null,assumptions:m.assumes||[],limitations:m.failsWhen||[],
    counterIndicators:(res&&res.failing)||[]},extra||{}));}
function _bandPosition(v,band){return v<band.lo?'below':(v>band.hi?'above':'within');}
/* each ground: (S, dec, add) -> a claim, a list of claims, or null when the record does not have it */
var EXPLANATION_GROUNDS={
  phase:function(S){return S.phase?null:explanationClaim({type:'observation',proposition:{subject:'phase',predicate:'is',object:{state:'none'}},epistemicClass:'OBSERVED'});},
  trend:function(S){var t=S.trend;if(!t||t.status!=='ok')return null;
    return _modelClaim('weight_trend',t,{subject:'weight trend',predicate:'estimated',object:{value:round(t.slopePerWeek,2),unit:'lb/week',lo:round(Math.min(t.lo,t.hi),2),hi:round(Math.max(t.lo,t.hi),2),n:t.n,days:t.span}},
      {evidenceIds:_exObsIds('weight',t.first,t.last)});},
  band:function(S){var b=S.targetRate;if(!b)return null;
    if(b.source==='user target')return explanationClaim({type:'policy',proposition:{subject:'rate band',predicate:'set to',object:{lo:b.lo,hi:b.hi,unit:'lb/week',source:'your target'}},
      validation:{calibration:'not applicable',validation:'your own choice, not a finding'},population:'this person',
      statement:'this plan works within '+fmtRateRange(b.lo,b.hi)+', the target you set'});
    return policyClaim('rate_band',{lo:b.lo,hi:b.hi,zone:b.band&&b.band.zone});},
  trendBand:function(S,dec,add){var t=S.trend,b=S.targetRate;if(!t||t.status!=='ok'||!b)return null;
    var tc=add(EXPLANATION_GROUNDS.trend(S)),bc=add(EXPLANATION_GROUNDS.band(S));
    return explanationClaim({type:'inference',proposition:{subject:'weight trend',predicate:'compared with the band',object:{value:round(t.slopePerWeek,2),unit:'lb/week',band:{lo:b.lo,hi:b.hi},position:_bandPosition(t.slopePerWeek,b),phaseType:S.phase?S.phase.type:null}},
      epistemicClass:'OBSERVED',confidence:t.confidence,basedOn:[tc.id,bc.id]});},
  recovery:function(S){var r=S.recovery;if(!r||r.status!=='ok')return null;
    return _modelClaim('recovery',r,{subject:'recovery',predicate:'rated',object:{state:r.level,n:r.n}});},
  strength:function(S){var s=S.training&&S.training.strength;if(!s||s.status!=='ok')return null;
    return _modelClaim('strength_trend',s,{subject:'strength',predicate:'trending',object:{state:s.overall,declining:s.declining,tracked:s.tracked}});},
  protein:function(S){var p=S.adherence&&S.adherence.protein;if(!p)return null;
    return explanationClaim({type:'observation',proposition:{subject:'protein target',predicate:'met on',object:{pct:p.pct,unit:'% of logged days',n:p.n,mean:Math.round(p.mean),target:p.target}},
      epistemicClass:'OBSERVED',evidenceIds:_exObsIds('protein',addDays(asOf(),-13),asOf())});},
  logging:function(S){var l=S.adherence&&S.adherence.logging;if(!l)return null;
    return explanationClaim({type:'observation',proposition:{subject:'logging',predicate:'covers',object:{pct:l.pct,unit:'% of days',n:l.n}},epistemicClass:'OBSERVED'});},
  calorieAdherence:function(S){var c=S.adherence&&S.adherence.calories;if(!c)return null;
    return explanationClaim({type:'observation',proposition:{subject:'calorie target',predicate:'met on',object:{pct:c.pct,unit:'% of logged days',n:c.n,mean:Math.round(c.mean),target:c.target}},epistemicClass:'OBSERVED',
      evidenceIds:_exObsIds('calories',addDays(asOf(),-13),asOf())});},
  trust:function(S){var t=S.trust&&S.trust.overall;if(!t)return null;
    return _modelClaim('data_trust',{cls:'DERIVED'},{subject:'data trust',predicate:'rated',object:{state:t.level,pct:t.pct}});},
  waist:function(S){var w=S.waistTrend;if(!w||w.status!=='ok')return null;
    return explanationClaim({type:'observation',proposition:{subject:'waist',predicate:'changed',object:{value:round(w.delta,2),unit:'in',days:daysBetween(w.first.date,w.last.date),direction:w.direction}},
      epistemicClass:'OBSERVED',confidence:w.confidence,evidenceIds:_exObsIds('waist',w.first.date,w.last.date)});},
  appetite:function(S){var a=S.appetite;if(!a||a.status!=='ok')return null;
    return _modelClaim('appetite',a,{subject:'appetite burden',predicate:'rated',object:{state:a.level}});},
  tdee:function(S){var t=S.tdee;if(!t||t.status!=='ok')return null;
    return _modelClaim(t.cls==='PRIOR'?'tdee_prior':'tdee_personal',t,{subject:'maintenance intake',predicate:'estimated',object:{value:Math.round(t.value),unit:'kcal/day',lo:t.lo!=null?Math.round(t.lo):null,hi:t.hi!=null?Math.round(t.hi):null,n:t.n||null}});},
  phaseDay:function(S){var ph=S.phase;if(!ph||!ph.startDate)return null;
    return explanationClaim({type:'observation',proposition:{subject:'phase',predicate:'on day',object:{value:daysBetween(ph.startDate,asOf()),phaseType:ph.type}},epistemicClass:'OBSERVED'});},
  steps:function(S){var s=S.steps;if(!s||s.mean7==null)return null;
    return explanationClaim({type:'observation',proposition:{subject:'steps',predicate:'averaged',object:{value:Math.round(s.mean7),unit:'steps/day',target:(S.phase&&S.phase.stepTarget)||s.target||null,n:s.n7}},epistemicClass:'OBSERVED',
      evidenceIds:_exObsIds('steps',addDays(asOf(),-6),asOf())});},
  training:function(S){var t=S.training;if(!t||t.adherence==null)return null;
    return explanationClaim({type:'observation',proposition:{subject:'resistance training',predicate:'done at',object:{pct:t.adherence,unit:'% of plan',perWeek:t.perWeek!=null?round(t.perWeek,1):null,planned:t.planned||null}},epistemicClass:'OBSERVED'});},
  experiment:function(S,dec){var ex=(DB.experiments||[]).filter(function(e){return e.id===dec.experimentId;})[0];if(!ex)return null;
    return explanationClaim({type:'observation',proposition:{subject:'experiment',predicate:'on day',object:{value:daysBetween(ex.startDate,asOf()),of:ex.durationDays,variable:ex.variable||null}},epistemicClass:'OBSERVED',evidenceIds:[ex.id]});},
  flat:function(S){var f=null;try{f=diagnose().findings.filter(function(x){return x.flatDays!=null;})[0];}catch(e){}if(!f)return null;
    return explanationClaim({type:'inference',proposition:{subject:'weight',predicate:'flat for',object:{days:f.flatDays,likelihood:f.likelihood||null}},epistemicClass:'OBSERVED',confidence:f.likelihood==='probable'?'medium':'low'});},
  goalReached:function(S){if(!S.goal||S.goal.status!=='ok'||S.averages.avg7==null)return null;
    return explanationClaim({type:'observation',proposition:{subject:'7-day average weight',predicate:'compared with the goal',object:{value:round(S.averages.avg7,1),unit:'lb',goal:round(S.goal.goal,1),reached:S.goal.remaining<=0}},epistemicClass:'OBSERVED'});}
};
/* what each decision rests on: the grounds it reads and the policies it applies (the rule contracts in 50-decision,
   the rate band in 40-models, the curves in 58-goals) */
var DECISION_GROUNDS={
  SETUP:['phase'],REDUCE_DEFICIT:['recovery','strength','trendBand','phaseDay','appetite'],INSUFFICIENT:['trend','logging','trust'],
  EXPERIMENT:['experiment','trend'],ADHERENCE:['logging','calorieAdherence'],DELOAD:['strength','recovery','protein'],
  WAIT:['trendBand','flat','phaseDay','logging'],ADD_STEPS:['trendBand','flat','steps','logging'],REDUCE_CALORIES:['trendBand','flat','logging','tdee'],
  TRIM:['trend','steps'],PROTEIN:['protein','trend'],HOLD_TRAINING:['training'],TRANSITION:['goalReached','tdee'],
  HOLD:['trendBand','waist','strength','protein','recovery','appetite','trust'],USER:[]};
var DECISION_POLICIES={'*':['rule.one-variable','rule.unlogged-unknown'],
  REDUCE_DEFICIT:['rate_band'],WAIT:['rate_band','rule.early-water'],ADD_STEPS:['rate_band','curve.steps','rule.steps-restore'],REDUCE_CALORIES:['rate_band'],
  TRIM:['rate_band'],HOLD:['rate_band','rule.protein-adequacy'],DELOAD:['rule.deload','curve.protein'],PROTEIN:['rule.protein-adequacy','curve.protein'],
  HOLD_TRAINING:['curve.sets'],TRANSITION:['rate_band'],USER:[]};

/* ---- heuristic contracts (P1.7): every threshold and curve that drives a decision or a goal, as a value ---- */
var HEURISTIC_REQUIRED=['id','subject','predicate','parameters','rationale','evidenceBasis','parameterSource','parameterVersion','calibrationStatus','validationStatus','applicability','failureConditions'];
function heuristicContracts(){
  var out=[],issues=[];
  var take=function(h,owner,values){if(!h)return;var c=Object.assign({type:'heuristic',owner:owner},h);
    var P={};Object.keys(c.parameters||{}).forEach(function(k){var p=c.parameters[k];P[k]=Object.assign({},p,values&&values[k]!==undefined?{value:values[k]}:{});});c.parameters=P;out.push(c);};
  try{take(RATE_BAND_CONTRACT,'40-models');}catch(e){}
  try{(DECISION_RULE_CONTRACTS||[]).forEach(function(h){take(h,'50-decision');});}catch(e){}
  try{Object.keys(MARGINAL_CURVES).forEach(function(k){var c=MARGINAL_CURVES[k];take(c.heuristic,'58-goals',c);});}catch(e){}
  try{GOAL_TENSIONS.forEach(function(t){take(t.heuristic,'58-goals');});}catch(e){}
  var seen={},refs={};(typeof REF_EVIDENCE!=='undefined'?REF_EVIDENCE:[]).forEach(function(r){refs[r.id]=1;});
  out.forEach(function(c){HEURISTIC_REQUIRED.forEach(function(f){if(c[f]==null)issues.push(c.id+': no '+f);});
    if(seen[c.id])issues.push(c.id+': held twice');seen[c.id]=1;
    (c.evidenceBasis||[]).forEach(function(r){if(!refs[r])issues.push(c.id+': evidence '+r+' is not in the evidence registry');});
    Object.keys(c.parameters||{}).forEach(function(k){var p=c.parameters[k];if(p.value==null||!p.unit)issues.push(c.id+': parameter '+k+' has no value or unit');});
    if(typeof c.statement!=='function')issues.push(c.id+': no rendering');});
  return {contracts:out,issues:issues,ok:issues.length===0};
}
function heuristicContractById(id){return heuristicContracts().contracts.filter(function(c){return c.id===id;})[0]||null;}
function heuristicValues(c){var v={};Object.keys(c.parameters||{}).forEach(function(k){v[k]=c.parameters[k].value;});return v;}
function policyClaim(contractId,extra){var H=heuristicContractById(contractId);if(!H)throw new Error('no heuristic contract '+contractId);
  var v=Object.assign(heuristicValues(H),extra||{});
  return explanationClaim({type:'policy',id:'pol-'+H.id+'-'+_hash(JSON.stringify(v)),proposition:{subject:H.subject,predicate:H.predicate,object:v},
    assumptions:[H.rationale],limitations:H.failureConditions,applicability:H.applicability,sourceIds:H.evidenceBasis,evidenceIds:H.evidenceBasis,
    validation:{calibration:H.calibrationStatus,validation:H.validationStatus,parameterSource:H.parameterSource,parameterVersion:H.parameterVersion,contract:H.id},
    statement:H.statement(v)});}

/* ---- the prediction a decision makes (its expected outcome, as a value) ---- */
function _predictionClaim(dec){var iv=dec&&dec.intervention;if(!iv||!iv.variable)return null;
  var e=null;try{e=_expectedWeightChange(iv);}catch(er){e=null;}
  var o={variable:iv.variable,from:iv.from!=null?iv.from:null,to:iv.to!=null?iv.to:null,withinDays:iv.recheckDays||dec.recheckDays||null};
  if(e&&e.lo!=null&&e.hi!=null){o.outcome='weight trend';o.change={lo:round(Math.min(e.lo,e.hi),2),hi:round(Math.max(e.lo,e.hi),2),unit:e.unit||'lb/week'};}
  return explanationClaim({type:'prediction',proposition:{subject:'weight trend',predicate:'expected to change',object:o},epistemicClass:'PREDICTIVE',
    confidence:dec.confidence||null,model:e&&e.density?e.density.model:null,modelVersion:e&&e.density?e.density.version:null,
    assumptions:e&&e.basis?[e.basis]:[],limitations:['an expected range from population arithmetic until the personal response carries weight'],statement:iv.expected||null});}

/* ---- the explanation (P1.2) ---- */
function explainDecision(dec,S){
  if(!dec||!dec.code)return null;S=S||getCurrentState();
  var made={},claims=[];var add=function(c){if(c&&!made[c.id]){made[c.id]=1;claims.push(c);}return c;};
  (DECISION_GROUNDS[dec.code]||['trendBand','trust']).forEach(function(g){var b=EXPLANATION_GROUNDS[g];if(!b)return;
    try{[].concat(b(S,dec,add)||[]).forEach(add);}catch(e){_q(e,'P2');}});
  var pol=[].concat(DECISION_POLICIES['*'],DECISION_POLICIES[dec.code]||[]);
  pol.forEach(function(id){var c=null;try{c=id==='rate_band'?EXPLANATION_GROUNDS.band(S):policyClaim(id);}catch(e){_q(e,'P2');}
    if(!c)return;add(c);(c.sourceIds||[]).forEach(function(r){var f=null;try{f=findingClaim(r);}catch(e){_q(e,'P2');}add(f);});});
  var pred=null;try{pred=add(_predictionClaim(dec));}catch(e){_q(e,'P2');}
  var ids=function(t){return claims.filter(function(c){return c.type===t;}).map(function(c){return c.id;});};
  var prov=[];claims.forEach(function(c){if(c.model&&!prov.some(function(p){return p.model===c.model;}))prov.push({model:c.model,version:c.modelVersion});});
  prov.push({rules:'decision lattice',version:dec.rulesVersion||null});
  var E={id:'exp-'+_hash(dec.code+'|'+(dec.date||'')+'|'+claims.map(function(c){return c.id;}).join(',')),version:EXPLANATION_VERSION,
    subject:{kind:'decision',code:dec.code,verb:dec.verb||null,date:dec.date||null,priority:dec.priority||null},
    question:{asks:'why',about:'decision',code:dec.code},
    claims:claims,observations:ids('observation'),evidence:ids('finding'),inferences:ids('inference'),policies:ids('policy'),
    uncertainty:{confidence:dec.confidence||null,ceiling:dec.uncertainty?dec.uncertainty.ceiling:null,balance:dec.uncertainty&&dec.uncertainty.balance?{lo:dec.uncertainty.balance.lo,hi:dec.uncertainty.balance.hi,unit:'kcal/day'}:null},
    alternatives:(dec.alternatives||[]).map(function(a){return {statement:String(a),chosen:false};}),
    action:{code:dec.code,verb:dec.verb||null,levers:(dec.action||[]).map(function(a){return {key:a.key,text:a.text};}),
      intervention:dec.intervention?{variable:dec.intervention.variable,from:dec.intervention.from!=null?dec.intervention.from:null,to:dec.intervention.to!=null?dec.intervention.to:null}:null},
    expectedOutcome:pred?{claimId:pred.id,variable:pred.proposition.object.variable,change:pred.proposition.object.change||null,withinDays:pred.proposition.object.withinDays}:null,
    reversalConditions:(dec.reversal||[]).map(function(r){return JSON.parse(JSON.stringify(r));}),
    provenance:prov,applicability:{phaseType:dec.phaseType||null,asOf:dec.date||null,weightZone:S.targetRate&&S.targetRate.band?S.targetRate.band.zone:null}};
  return _deepFreeze(E);
}
/* the claims a decision rests on, without the policies and findings behind them: what every level must render */
function explanationGrounds(E){return E.claims.filter(function(c){return c.type==='observation'||c.type==='inference'||c.type==='prediction';});}

/* ---- the compiler (P1.3) ---- */
var _EX_SUBJECT={'weight trend':'Your weight trend','rate band':'The rate band','recovery':'Recovery','strength':'Strength','protein target':'The protein target',
  'logging':'Logging','calorie target':'The calorie target','data trust':'Data trust','waist':'Your waist','appetite burden':'Appetite burden',
  'maintenance intake':'Maintenance intake','phase':'This phase','steps':'Steps','resistance training':'Resistance training','experiment':'The experiment',
  'weight':'Your weight','7-day average weight':'Your 7-day average'};
function _exSubj(s){return _EX_SUBJECT[s]||(s.charAt(0).toUpperCase()+s.slice(1));}
function _exQty(v,unit){if(v==null)return '—';
  if(unit==='lb/week')return fmtRate(v);if(unit==='kcal/day')return fmtKcal(v)+' a day';if(unit==='lb')return fmtWeight(v);
  if(unit==='steps/day')return fmtNum(v,0)+' steps a day';if(unit==='in')return fmtSigned(v,1)+' in';
  if(/^%/.test(unit||''))return fmtNum(v,0)+unit;return fmtNum(v,Math.abs(v)<10&&v%1?1:0)+(unit?' '+unit:'');}
function _bandWords(o){var p=o.position,cut=o.phaseType==='cut';
  if(p==='within')return 'inside';if(cut)return p==='below'?'faster than':'slower than';return p==='below'?'below':'above';}
function _claimLine(c,level){var p=c.proposition,o=p.object||{},S=_exSubj(p.subject),ana=level!=='simple',out='';
  switch(p.predicate){
    case 'estimated':out=S+' is '+_exQty(o.value,o.unit)+(ana&&o.lo!=null&&o.hi!=null?' ('+_exQty(o.lo,o.unit)+' to '+_exQty(o.hi,o.unit)+')':'')+(ana&&o.n?', from '+o.n+' readings'+(o.days?' over '+o.days+' days':''):'');break;
    case 'compared with the band':out=S+' ('+_exQty(o.value,o.unit)+') is '+_bandWords(o)+' the rate band'+(ana?' of '+fmtRateRange(o.band.lo,o.band.hi):'');break;
    case 'rated':out=S+' is '+o.state+(ana&&o.pct!=null?' ('+o.pct+'%)':'')+(ana&&o.n?', from '+o.n+' ratings':'');break;
    case 'trending':out=S+' is '+o.state+(ana&&o.tracked?': '+o.declining+' of '+o.tracked+' tracked lifts declining':'');break;
    case 'met on':out=S+' was met on '+_exQty(o.pct,o.unit)+(ana&&o.target!=null?' (average '+fmtNum(o.mean,0)+' against '+fmtNum(o.target,0)+(p.subject==='protein target'?' g':' kcal')+')':'');break;
    case 'covers':out=S+' covers '+_exQty(o.pct,o.unit)+(ana&&o.n?' ('+o.n+' days)':'');break;
    case 'changed':out=S+' changed '+_exQty(o.value,o.unit)+(o.days?' over '+o.days+' days':'');break;
    case 'on day':out=p.subject==='experiment'?(S+' is on day '+o.value+' of '+o.of):(S+' is '+o.value+' days old');break;
    case 'averaged':out=S+' average '+_exQty(o.value,o.unit)+(o.target?' against a '+fmtNum(o.target,0)+' target':'');break;
    case 'done at':out=S+' is at '+_exQty(o.pct,o.unit)+(ana&&o.planned?' ('+o.perWeek+' a week against '+o.planned+')':'');break;
    case 'flat for':out=S+' has been flat for '+o.days+' days';break;
    case 'compared with the goal':out=S+' ('+_exQty(o.value,o.unit)+') '+(o.reached?'has reached':'has not reached')+' the goal of '+_exQty(o.goal,o.unit);break;
    case 'is':out=S+' is '+(o.state==='none'?'not set up':o.state);break;
    case 'expected to change':out=o.change?('Expected: '+_exQty(o.change.lo,o.change.unit)+' to '+_exQty(o.change.hi,o.change.unit)+' change in the weight trend'+(o.withinDays?', judged after '+o.withinDays+' days':'')):
      ('Expected: '+(c.statement||'a change in '+o.variable)+(o.withinDays?', judged after '+o.withinDays+' days':''));break;
    default:out=S+' '+p.predicate+' '+JSON.stringify(o);}
  if(c.type==='policy')out=c.statement?(c.statement.charAt(0).toUpperCase()+c.statement.slice(1)):out;
  if(c.type==='finding')out=(level==='scientific'?'Finding: ':'Evidence: ')+(c.statement||p.subject);
  if(level==='scientific'){var tags=[];
    if(c.type==='policy')tags.push('POLICY — '+(c.validation&&c.validation.validation||HEURISTIC_NOT_VALIDATED)+(c.sourceIds.length?'; supported findings: '+c.sourceIds.join(', '):'; no published evidence registered'));
    else tags.push(c.epistemicClass+(c.confidence?', confidence '+c.confidence:''));
    if(c.model)tags.push(c.model+(c.modelVersion?' v'+c.modelVersion:''));
    if(c.type==='finding'){var r=claimById(c.sourceIds[0]);if(r){tags.push(r.citation);tags.push('grade '+r.claim.grade+' ('+EVIDENCE_GRADES[r.claim.grade]+')');tags.push('population: '+r.claim.population);
      tags.push('applied to you it is an association, not a measured effect');tags.push('review by '+r.claim.reviewDate+(claimStatus(r)==='review due'?' (review due)':''));}}
    if(c.counterIndicators.length)tags.push('counting against it: '+c.counterIndicators.join('; '));
    if(c.limitations.length&&c.type!=='finding')tags.push('fails when: '+c.limitations.slice(0,3).join('; '));
    if(c.evidenceIds.length&&c.type!=='policy'&&c.type!=='finding')tags.push(c.evidenceIds.length+' record entr'+(c.evidenceIds.length===1?'y':'ies'));
    out+=' ['+tags.join(' · ')+']';}
  return out;}
/* one explanation at one level. Every level renders every ground claim; the analytical level adds the rules and the
   evidence behind them, the scientific level adds each claim's class, version, grade and limits. */
function compileExplanation(E,level){if(!E)return null;level=EXPLANATION_LEVELS[level]?level:'analytical';
  var G=explanationGrounds(E),pol=E.claims.filter(function(c){return c.type==='policy';}),fin=E.claims.filter(function(c){return c.type==='finding';});
  var line=function(c){return {claimId:c.id,type:c.type,text:_claimLine(c,level)};};
  var out={level:level,explanationId:E.id,version:E.version,grounds:G.map(line),
    rules:level==='simple'?[]:pol.map(line),evidence:level==='simple'?[]:fin.map(line),
    action:E.action.levers.map(function(a){return a.text;}),
    reversal:E.reversalConditions.map(function(r){return renderReversal(r);}),
    uncertainty:E.uncertainty.confidence?('confidence '+E.uncertainty.confidence+(level!=='simple'&&E.uncertainty.ceiling?'; the energy numbers carry '+E.uncertainty.ceiling+' confidence':'')):null};
  out.claimIds=G.map(function(c){return c.id;});
  if(level==='scientific')out.provenance=E.provenance.map(function(p){return p.model?(p.model+' v'+(p.version||'?')):(p.rules+' v'+(p.version||'?'));});
  return out;}

/* ---- reversal conditions (P1.2): what would overturn a decision, as values; reverseIf is their rendering ---- */
function reversalCondition(subject,predicate,object,withinDays,then){return {subject:subject,predicate:predicate,object:object||{},withinDays:withinDays||null,then:then||null};}
function reversalAll(conds,withinDays,then){return {all:conds,withinDays:withinDays||null,then:then||null};}
function reversalAny(conds,withinDays,then){return {any:conds,withinDays:withinDays||null,then:then||null};}
function _revPart(r){var o=r.object||{},s=r.subject;
  if(o.band)return s+' '+r.predicate+' '+fmtRateRange(o.band.lo,o.band.hi);
  if(o.rate!=null)return s+' '+r.predicate+' '+fmtRate(o.rate);
  if(o.pct!=null)return s+' '+r.predicate+' '+o.pct+'%'+(o.of?' of '+o.of:'');
  if(o.count!=null)return o.count+' '+s+' over '+o.days+'+ days';
  if(o.days!=null)return s+' '+r.predicate+' '+o.days+'+ days';
  if(o.state)return s+' '+r.predicate+' '+o.state;
  return s+' '+r.predicate;}
function _revBody(r){return r.all?r.all.map(_revBody).join(' and '):(r.any?r.any.map(_revBody).join(' or '):_revPart(r));}
function renderReversal(r){if(!r)return '';
  return _revBody(r)+(r.withinDays?' within '+r.withinDays+' days':'')+(r.then?' → '+r.then:'');}

/* ---- the claim registry (P1.5): findings from the evidence registry, with their grade and review date ---- */
function claimById(id){return (typeof REF_EVIDENCE!=='undefined'?REF_EVIDENCE:[]).filter(function(r){return r.id===id;})[0]||null;}
function claimStatus(r,date){if(!r||!r.claim)return 'no claim';return (date||asOf())>r.claim.reviewDate?'review due':'current';}
function findingClaim(id){var r=claimById(id);if(!r||!r.claim)throw new Error('no claim registered for '+id);var c=r.claim,due=claimStatus(r)==='review due';
  var conf=r.verify?'low':c.confidence;if(due)conf=conf==='high'?'medium':'low';
  return explanationClaim({type:'finding',id:'fnd-'+r.id,proposition:c.proposition,population:c.population,scope:c.scope,applicability:c.applicability,
    epistemicClass:'ASSOCIATED',confidence:conf,limitations:c.limitations,reviewDate:c.reviewDate,sourceIds:[r.id],statement:r.summary});}
function claimRegistry(){var R=typeof REF_EVIDENCE!=='undefined'?REF_EVIDENCE:[],H=heuristicContracts().contracts,policiesFor={},issues=[];
  R.forEach(function(r){policiesFor[r.id]=H.filter(function(h){return (h.evidenceBasis||[]).indexOf(r.id)>=0;}).map(function(h){return h.id;});
    if(!r.claim){issues.push(r.id+': no claim');return;}
    ['proposition','outcome','population','scope','applicability','limitations','grade','confidence','reviewDate','domains'].forEach(function(f){if(r.claim[f]==null)issues.push(r.id+': no '+f);});
    if(r.claim.grade&&!EVIDENCE_GRADES[r.claim.grade])issues.push(r.id+': unknown grade '+r.claim.grade);});
  var domains=CLAIM_DOMAINS.map(function(d){var ids=R.filter(function(r){return r.claim&&(r.claim.domains||[]).indexOf(d)>=0;}).map(function(r){return r.id;});return {domain:d,claims:ids,gap:!ids.length};});
  return {claims:R.filter(function(r){return r.claim;}).map(function(r){return {id:r.id,proposition:r.claim.proposition,grade:r.claim.grade,confidence:r.verify?'low':r.claim.confidence,
      reviewDate:r.claim.reviewDate,status:claimStatus(r),unverified:!!r.verify,domains:r.claim.domains,policies:policiesFor[r.id]};}),
    domains:domains,gaps:domains.filter(function(d){return d.gap;}).map(function(d){return d.domain;}),policiesFor:policiesFor,
    reviewDue:R.filter(function(r){return r.claim&&claimStatus(r)==='review due';}).map(function(r){return r.id;}),issues:issues,ok:issues.length===0,
    note:'A finding supports a policy; it does not validate it. Each policy says what evidence it rests on, and each finding which policies cite it.'};}
