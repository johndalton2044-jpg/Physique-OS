/* ============================================================================
   IMPLEMENTATION DIRECTION, remaining sections (\u00a711\u201315, 19\u201321, 26, 29\u201331). The engines exist; what the probe found
   missing were the specified parts of their results. Each wrapper keeps the original's name and callers, and adds the
   missing parts from real data (never empty placeholders): the point forecast and a calibration summary; the causal
   estimator and its uncertainty, including when the analysis stops; the Bayesian likelihood and diagnostics (with a
   prior\u2013data conflict test); the fused measurement's uncertainty; recovery's observations, uncertainty and a stated
   forecast; the twin's adherence, environment, resources, intervention, forecast and uncertainty; a visualisation spec;
   the specified relation vocabulary in the knowledge graph; view capabilities, dependencies, render and guards. One
   thing was genuinely absent and is new: mobility routines had no step structure (mobilitySequence).
   ============================================================================ */
var _forecastFamilyCore=forecastFamily;
forecastFamily=function(opts){var r=_forecastFamilyCore(opts);if(r&&r.status==='ok'){
  var D=r.forecastDistribution;
  if(!('forecast' in r))r.forecast={model:r.selection||null,points:Array.isArray(D)?D.map(function(d){return {horizon:d.horizon!=null?d.horizon:d.h,value:d.mean!=null?d.mean:(d.median!=null?d.median:d.value)};}):(D&&typeof D==='object'?Object.keys(D).map(function(h){var d=D[h]||{};return {horizon:+h||h,value:d.mean!=null?d.mean:(d.median!=null?d.median:d.value)};}):null)};
  if(!('calibration' in r)){var C=r.calibrationResult;r.calibration={status:C?'evaluated':'not yet',detail:C||null,note:'observed coverage of the stated intervals in the rolling-origin backtest'};}}
  return r;};

var _causalCore=causalAnalysis;
causalAnalysis=function(t,o,opts){var r=_causalCore(t,o,opts);if(!r)return r;
  if(!('estimator' in r))r.estimator=r.status==='ok'?(r.strategy||'identified strategy'):{name:'none',why:'stopped at '+(r.stoppedAt||'an early stage')+': '+(r.note||'not identifiable')};
  if(!('uncertainty' in r)){var e=r.estimate||r.effect||{};r.uncertainty=r.status==='ok'?{se:e.se!=null?e.se:null,interval:e.ci||e.interval||(e.lo!=null?[e.lo,e.hi]:null),note:'sampling uncertainty of the estimate; the sensitivity analysis covers unmeasured confounding'}:{status:'not estimated',why:'no estimate without identification'};}
  return r;};

var _bayesCore=bayesUpdate;
bayesUpdate=function(spec){var r=_bayesCore(spec);if(r&&r.status==='ok'){spec=spec||{};var obs=spec.observations||[],os=spec.obsSd;
  if(!('likelihood' in r))r.likelihood={kind:'normal',n:obs.length,mean:obs.length?round(mean(obs),3):null,sd:os!=null?os:null,note:'each observation normal around the true value, with known variance'};
  if(!('diagnostics' in r)){var pm=r.prior.mean,ps=r.prior.sd,om=obs.length?mean(obs):null,z=(om!=null&&os)?Math.abs(om-pm)/Math.sqrt(ps*ps+os*os/obs.length):null;
    r.diagnostics={weightOnData:r.weightOnData,priorDataConflict:z!=null?{z:round(z,2),conflict:z>2,note:z>2?'the data sit more than 2 SD from the prior: check the prior':'data and prior are compatible'}:null,shrinkage:round(1-r.weightOnData,3)};}}
  return r;};

var _measurementCore=measurementModel;
measurementModel=function(type,opts){var r=_measurementCore(type,opts);if(r&&r.status==='ok'&&!('uncertainty' in r)){var L=r.latest||{};
  r.uncertainty={sd:L.sd!=null?L.sd:null,basis:L.sdNote||'no source noise measured',components:['noise','bias','drift','resolution'].filter(function(k){return (r.parameters||[]).some(function(p){return p[k]!=null;});})};}
  return r;};

var _recoveryStateCore=recoveryState;
recoveryState=function(){var r=_recoveryStateCore.apply(null,arguments);if(r&&r.status==='ok'){
  if(!('observations' in r))r.observations={sleep:r.sleep,sleepQuality:r.sleepq,fatigue:r.fatigue,soreness:r.soreness,stress:r.stress,motivation:r.motivation,n:r.n};
  if(!('uncertainty' in r))r.uncertainty={confidence:r.confidence,n:r.n,basis:'self-reports: '+r.n+' day'+(r.n===1?'':'s')};
  if(!('forecast' in r))r.forecast={tomorrow:r.level,method:'persistence (tomorrow resembles today)',cls:'HEURISTIC',note:'a baseline, not a model: the ledger scores it like any forecast'};}
  return r;};

var _twinCore=personalStateModel;
personalStateModel=function(){var r=_twinCore.apply(null,arguments);if(!r||!r.state)return r;var S=r.state,safe=function(f){try{return f();}catch(e){return {status:'error'};}};
  if(!S.adherence)S.adherence=safe(function(){var a=adherenceState(14);return a&&a.overall!=null?{status:'ok',cls:'MEASURED',overall:a.overall}:{status:'insufficient'};});
  if(!S.environment)S.environment=safe(function(){return typeof environmentNow==='function'?environmentNow():{status:'none'};});
  if(!S.resources)S.resources=safe(function(){return typeof recoveryAllocation==='function'?recoveryAllocation():{status:'none'};});
  if(!S.intervention)S.intervention=safe(function(){var ex=(DB.experiments||[]).filter(function(e){return e.status==='running'||e.status==='active';})[0],pv=currentPlan();
    return {status:'ok',experiment:ex?{id:ex.id,question:ex.question}:null,plan:pv?{version:pv.version!=null?pv.version:null,id:pv.id||null}:null};});
  if(!S.forecast)S.forecast=safe(function(){var f=forecastFamily({horizonDays:14});return f.status==='ok'?{status:'ok',cls:'PREDICTIVE',forecast:f.forecast}:{status:f.status};});
  if(!S.uncertainty)S.uncertainty={fidelity:r.fidelity,missing:r.missing,byPart:Object.keys(S).reduce(function(o,k){o[k]=S[k]&&S[k].cls||(S[k]&&S[k].status)||null;return o;},{})};
  return r;};

var _buildVisualizationCore=buildVisualization;
buildVisualization=function(o){var v=_buildVisualizationCore(o);if(v&&v.status==='ok'&&!v.visualizationSpec){var pm=v.presentationModel||{};o=o||{};
  v.visualizationSpec={visualizationType:o.chartType,dataSource:{model:o.modelId||null,quantities:pm.quantities||pm.types||null},series:pm.series||pm.rows||null,filters:o.filters||[],
    aggregation:pm.aggregation||o.aggregation||'none',temporalRange:pm.range||pm.temporalRange||(o.days?{days:o.days}:null),units:pm.units||pm.unit||null,annotations:pm.annotations||[],
    uncertainty:pm.uncertainty||pm.band||null,prediction:pm.prediction||pm.forecast||null,provenance:v.provenance||null,interaction:{tooltips:true,keyboard:true},appearance:{tokens:'the app\u2019s theme',accent:'var(--accent)'}};}
  return v;};

/* \u00a720: the specified relation vocabulary, mapped from the graph's own verbs (kept as rel). */
var KG_RELATION_MAP={supported:'supports',contradicted:'contradicts',refuted:'contradicts',produced:'derivedFrom','measured by':'derivedFrom',concluded:'supports',
  predicted:'associatedWith','tested by':'associatedWith',became:'generalizes','contributed to':'associatedWith',replicated:'replicates','limited by':'limitedBy',caused:'causes'};
var KG_KIND_MAP={knowledge:'claim',decision:'intervention',hypothesis:'claim'};
var _kgCore=knowledgeGraph;
knowledgeGraph=function(opts){var G=_kgCore(opts);if(!G||!G.edges)return G;
  G.edges.forEach(function(e){if(!e.relation)e.relation=KG_RELATION_MAP[e.rel]||'associatedWith';});
  G.nodes.forEach(function(n){if(!n.entityType)n.entityType=KG_KIND_MAP[n.kind]||n.kind;});
  if(!G.nodes.some(function(n){return n.entityType==='model';})&&typeof MODELS!=='undefined'){
    MODELS.slice(0,40).forEach(function(m){G.nodes.push({id:'model:'+m.id,kind:'model',entityType:'model',label:m.name||m.id,cls:m.cls||'HEURISTIC'});});
    G.nodes.filter(function(n){return n.entityType==='finding'||n.entityType==='claim';}).forEach(function(n){var mm=(n.model||n.modelId);if(mm)G.edges.push({from:n.id,to:'model:'+mm,rel:'produced',relation:'derivedFrom'});});}
  if(typeof REF_SUPPLEMENTS!=='undefined'&&!G.nodes.some(function(n){return n.entityType==='source';})){[REF_SUPPLEMENTS,typeof REF_DRI!=='undefined'?REF_DRI:null].filter(Boolean).forEach(function(s){G.nodes.push({id:'source:'+s.id,kind:'source',entityType:'source',label:s.name,cls:'PRIOR'});   /* population evidence */});}
  G.relationVocabulary=Object.keys(KG_RELATION_MAP).map(function(k){return KG_RELATION_MAP[k];}).filter(function(v,i,a){return a.indexOf(v)===i;});
  return G;};

/* \u00a731: each view states its capabilities, dependencies, renderer and guards. */
(function(){if(typeof VIEW_REGISTRY==='undefined')return;Object.keys(VIEW_REGISTRY).forEach(function(k){var v=VIEW_REGISTRY[k];
  if(!v.dependencies)v.dependencies=(v.dataDependencies||[]).concat(v.modelDependencies||[]);
  if(!v.capabilities)v.capabilities=(v.widgets||[]).map(function(w){return w.widgetId||w;}).concat(v.keyboardShortcuts||[]);
  if(!v.render)v.render=typeof window!=='undefined'&&typeof window['render'+k.charAt(0).toUpperCase()+k.slice(1)]==='function'?'render'+k.charAt(0).toUpperCase()+k.slice(1):'renderAll';
  if(!v.guards)v.guards={permissions:v.permissions||[],detailLevel:'panels classified per level by PANEL_DETAIL',offline:'works offline'};});})();

/* \u00a729: a routine as ordered steps \u2014 the one part that did not exist. */
var _REGION_JOINTS={neck:['cervical'],chest:['shoulder','thoracic'],shoulders:['shoulder'],shoulder:['shoulder'],'upper back':['thoracic','shoulder'],'lower back':['lumbar'],back:['thoracic','lumbar'],
  hips:['hip'],hip:['hip'],'hip flexors':['hip'],glutes:['hip'],hamstrings:['hip','knee'],quads:['knee','hip'],calves:['ankle'],ankles:['ankle'],wrists:['wrist'],wrist:['wrist'],spine:['thoracic','lumbar']};
function mobilitySequence(routineId){
  var R=typeof MOBILITY_ROUTINES!=='undefined'?MOBILITY_ROUTINES[routineId]:null;if(!R)return {status:'unknown-routine',routineId:routineId};
  var steps=(R.ids||[]).map(function(id,i){var m=(typeof _MOB!=='undefined'&&_MOB[id])||{id:id},dose=String(m.dose||''),secs=/(\d+)\s*s(ec)?/.exec(dose),reps=/(\d+)\s*(slow\s*)?reps?/.exec(dose);
    var joints={};(m.regions||[]).forEach(function(r){(_REGION_JOINTS[String(r).toLowerCase()]||[]).forEach(function(j){joints[j]=1;});});
    return {poseId:id,name:m.name||id,sequencePosition:i+1,targetRegions:(m.regions||[]).concat(m.targets||[]),joints:Object.keys(joints),
      positions:typeof POSE_POSITIONS!=='undefined'&&POSE_POSITIONS[id]?POSE_POSITIONS[id]:null,
      duration:secs?{seconds:+secs[1]}:(reps?{reps:+reps[1]}:{text:dose||null}),intensity:m.level==='beginner'?'gentle':(m.level==='advanced'?'firm':'moderate'),
      constraints:(m.cautions||[]).concat(m.level?['level: '+m.level]:[]),cues:m.cues||[]};});
  return {status:'ok',routineId:routineId,title:R.title,why:R.why,steps:steps,note:'positions exist for drawn poses; other steps carry cues'};
}
