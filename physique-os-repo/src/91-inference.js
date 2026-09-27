/* ============================================================================
   REGION: INFERENCE RUNTIME AND STATISTICAL CONTROL (ConWork.md)

   Four findings, each of which makes the app claim less rather than more.

   MULTIPLE TESTING. The distributed-lag engine tests six lags and reports the best. Testing six hypotheses
   and reporting the winner at a threshold chosen for ONE is how noise becomes a finding. With six
   independent tests at alpha 0.05 the chance of at least one false positive is about 26%, not 5%. Both
   Benjamini-Hochberg (controls the false discovery rate) and Bonferroni (controls the family-wise rate) are
   applied, because they answer different questions and the honest thing is to say which bar a result clears.

   MISSINGNESS. The app reported coverage and called it a caveat. Whether data is missing at random decides
   whether the analysis is biased or merely underpowered, and the record can often distinguish them: if
   logging stops on the days weight rises, missingness depends on the unobserved value itself, which is the
   case no amount of data fixes.

   SENSOR BIAS. Fusion weighted sources by a fixed reliability. A source with a systematic OFFSET needs that
   offset estimated and removed, which is a different operation from trusting it less.

   INFERENCE RUNTIME. Models were called directly by other functions, so freshness, applicability and
   provenance were each model's own business. One runtime now wraps execution.
   ============================================================================ */

/* ---------------- multiple-testing control ---------------- */
function _pFromT(t,n){
  /* Exact Student-t, not a normal approximation. The approximation was defensible at n=200 and wrong at
     n=20 to 40, which is the range this app actually works in \u2014 and understating a p-value is precisely how
     a correction layer changes a conclusion by accident, which is the opposite of its purpose. */
  if(t==null||!isFinite(t))return null;
  var df=Math.max(1,(n!=null?n:30)-2);
  var p=studentTP(t,df);
  if(p!=null)return p;
  var z=Math.abs(t);
  return Math.max(0,Math.min(1,2*(1-(1-0.5*Math.exp(-0.717*z-0.416*z*z)))));
}

function multipleTesting(tests,opts){
  opts=opts||{};
  var alpha=opts.alpha||0.05;
  var rows=tests.filter(function(t){return t.p!=null;})
    .map(function(t){return {label:t.label,p:t.p,t:t.t!=null?t.t:null};});
  if(!rows.length)return {status:'none',note:'nothing testable'};
  var m=rows.length;
  rows.sort(function(a,b){return a.p-b.p;});
  /* Benjamini-Hochberg: largest k where p(k) <= k/m * alpha. */
  var cut=-1;
  rows.forEach(function(r,i){if(r.p<=(i+1)/m*alpha)cut=i;});
  rows.forEach(function(r,i){
    r.rank=i+1;
    r.bhThreshold=round((i+1)/m*alpha,4);
    r.survivesFDR=i<=cut;
    r.survivesBonferroni=r.p<=alpha/m;
    r.survivesUncorrected=r.p<=alpha;
  });
  return {status:'ok',cls:'DERIVED',tests:m,alpha:alpha,
    rows:rows,
    fdr:rows.filter(function(r){return r.survivesFDR;}).length,
    bonferroni:rows.filter(function(r){return r.survivesBonferroni;}).length,
    uncorrected:rows.filter(function(r){return r.survivesUncorrected;}).length,
    familywiseRisk:round(1-Math.pow(1-alpha,m),2),
    note:'Testing '+m+' hypotheses and reporting the best is not the same as testing one. Uncorrected, the chance of at least one false positive here is about '+
      Math.round(100*(1-Math.pow(1-alpha,m)))+'%, not '+Math.round(100*alpha)+'%.',
    caveat:'Benjamini-Hochberg controls the share of reported findings that are false; Bonferroni controls the chance of ANY false finding and is stricter. A result clearing neither is a reason to run an experiment, not a result.'};
}
/* The lag engine, corrected. */
function distributedLagCorrected(causeType,effectType,opts){
  opts=opts||{};
  var base=distributedLag(causeType,effectType,opts);
  if(base.status!=='ok')return base;
  var tests=base.rows.filter(function(r){return r.t!=null;})
    .map(function(r){return {label:'lag '+r.lag,p:_pFromT(r.t,r.effectiveN),t:r.t};});
  var mt=multipleTesting(tests,{alpha:opts.alpha||0.05});
  var byLabel={};
  if(mt.status==='ok')mt.rows.forEach(function(r){byLabel[r.label]=r;});
  var rows=base.rows.map(function(r){
    var c=byLabel['lag '+r.lag]||{};
    return Object.assign({},r,{p:c.p!=null?round(c.p,4):null,
      survivesFDR:!!c.survivesFDR,survivesBonferroni:!!c.survivesBonferroni});
  });
  var kept=rows.filter(function(r){return r.survivesFDR;});
  return {status:'ok',cls:'EMPIRICAL',cause:causeType,effect:effectType,
    rows:rows,surviving:kept,
    lagsTested:base.rows.length,
    correction:mt.status==='ok'?{fdr:mt.fdr,bonferroni:mt.bonferroni,uncorrected:mt.uncorrected,
      familywiseRisk:mt.familywiseRisk}:null,
    verdict:kept.length?('lag '+kept[0].lag+' survives false-discovery correction across '+base.rows.length+' lags tested'):
      ('no lag survives correction for having tested '+base.rows.length+' of them'),
    preSpecified:opts.preSpecifiedLag!=null?opts.preSpecifiedLag:null,
    note:'The lag engine with the correction it was missing. Searching lags and reporting the best is a search, and a search needs a stricter bar than a single pre-specified test.',
    caveat:'Correcting for multiple tests does not make a surviving result causal. The clean version of this question is to pre-specify one lag and test only that \u2014 pass preSpecifiedLag to do it.'};
}
/* ---------------- missingness mechanism ---------------- */
function missingnessMechanism(type,opts){
  opts=opts||{};
  var days=opts.days||90;
  var from=addDays(asOf(),-(days-1));
  var have={};
  obsOf(type,{from:from}).forEach(function(o){have[o.date]=o.value;});
  var all=[];for(var i=0;i<days;i++)all.push(addDays(from,i));
  var present=all.filter(function(d){return have[d]!=null;});
  var missing=all.filter(function(d){return have[d]==null;});
  if(!missing.length)return {status:'complete',type:type,days:days,
    note:'Nothing missing in this window, so the mechanism does not arise.'};
  if(present.length<10)return {status:'insufficient',need:['more observations to compare against']};
  /* MAR test: does missingness depend on something OBSERVED \u2014 day of week, or the value of another stream? */
  var dow={};
  all.forEach(function(d){
    var k=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(d+'T12:00:00Z').getUTCDay()];
    dow[k]=dow[k]||{have:0,of:0};dow[k].of++;if(have[d]!=null)dow[k].have++;});
  var rates=Object.keys(dow).map(function(k){return {day:k,rate:dow[k].have/dow[k].of};});
  var spread=Math.max.apply(null,rates.map(function(r){return r.rate;}))-
             Math.min.apply(null,rates.map(function(r){return r.rate;}));
  var dayDependent=spread>=0.35;
  /* MNAR signal: around a gap, did the value JUMP? If readings resume higher than they paused, missingness
     is plausibly related to the unobserved value itself. */
  var jumps=[];
  missing.forEach(function(d){
    var before=null,after=null;
    for(var k=1;k<=5;k++){if(before==null&&have[addDays(d,-k)]!=null)before=have[addDays(d,-k)];}
    for(var k2=1;k2<=5;k2++){if(after==null&&have[addDays(d,k2)]!=null)after=have[addDays(d,k2)];}
    if(before!=null&&after!=null)jumps.push(after-before);
  });
  var meanJump=jumps.length?mean(jumps):null;
  var typical=present.length>2?(sd(present.map(function(d){return have[d];}))||1):1;
  var mnarSignal=meanJump!=null&&Math.abs(meanJump)>typical*0.8;
  var mechanism=mnarSignal?'MNAR (possibly)':(dayDependent?'MAR':'consistent with MCAR');
  return {status:'ok',cls:'DERIVED',type:type,days:days,
    present:present.length,missing:missing.length,
    coverage:round(100*present.length/days,0),
    dayRates:rates,dayDependent:dayDependent,
    meanJumpAcrossGaps:meanJump!=null?round(meanJump,2):null,
    mechanism:mechanism,
    implication:mnarSignal?
      'readings resume systematically different from where they paused, which suggests the missingness depends on the value itself \u2014 the one case more data does not fix, because the missing days are not like the present ones':
      (dayDependent?'missingness depends on the day of the week, which is observable \u2014 analyses can adjust for it and remain unbiased':
        'missingness looks unrelated to anything observed, so estimates lose precision but not accuracy'),
    note:'Why data is missing decides whether an analysis is biased or merely underpowered. Reporting coverage alone cannot distinguish those.',
    caveat:'MNAR cannot be proven from the observed data \u2014 by definition the evidence is in what is missing. This reports a SIGNAL consistent with it, which is a reason for caution rather than a conclusion.'};
}
/* ---------------- per-source bias and precision ---------------- */
function sourceCalibration(type,opts){
  opts=opts||{};
  var days=opts.days||180;
  var obs=obsOf(type,{from:addDays(asOf(),-days)});
  var bySource={};
  obs.forEach(function(o){
    var s=o.source||'unspecified';
    (bySource[s]=bySource[s]||[]).push(o);});
  var sources=Object.keys(bySource);
  if(sources.length<2)return {status:'single',type:type,source:sources[0]||null,
    note:'One source, so there is nothing to calibrate against. A single source can be systematically wrong and nothing here would show it.'};
  /* Same-day pairs are the only fair comparison \u2014 a difference across days is a real change. */
  var pairs=[];
  sources.forEach(function(a,i){
    sources.slice(i+1).forEach(function(b){
      var byDate={};bySource[a].forEach(function(o){byDate[o.date]=o.value;});
      var ds=[];
      bySource[b].forEach(function(o){if(byDate[o.date]!=null)ds.push(o.value-byDate[o.date]);});
      if(ds.length>=3)pairs.push({a:a,b:b,n:ds.length,
        bias:round(mean(ds),2),precision:round(sd(ds)||0,2)});
    });
  });
  return {status:pairs.length?'ok':'no-overlap',cls:'MEASURED',type:type,
    sources:sources.map(function(s){
      var vals=bySource[s].map(function(o){return o.value;});
      return {source:s,n:vals.length,
        spread:vals.length>2?round(sd(vals)||0,2):null};}),
    pairs:pairs,
    note:pairs.length?'Systematic offset between sources measured from same-day readings, which is the only fair comparison \u2014 a difference across days is a real change, not a bias.':
      'Your sources never recorded on the same day, so no offset between them can be measured.',
    caveat:'A measured offset says the sources disagree, not which is right. Removing it requires choosing a reference, and that is a decision rather than a calculation.'};
}
/* ---------------- universal inference runtime ----------------
   Models were called directly, so freshness, applicability and provenance were each model's own business.
   One path now wraps execution and records what happened. */
var _RUN_SEQ=0;
function infer(request){
  request=request||{};
  var id=request.model;
  var started=nowISO();
  /* STEP 6/7: the run id is the SHA-256 identity of the computation, not an execution counter, so an
     identical analysis reproduces the same id and the provenance DAG can be addressed by it. */
  var _ident=(typeof runIdentity==='function')?runIdentity({model:id,inputs:request.inputs||request.args||{},
    params:request.params||{},dependencies:request.dependsOn||[]}):null;
  var runId=_ident?_ident.runId:('run-'+(++_RUN_SEQ)+'-'+(id||'anon'));
  _RUN_SEQ++;
  var g=(typeof window!=='undefined')?window:(typeof globalThis!=='undefined'?globalThis:{});
  var fn=typeof g[id]==='function'?g[id]:null;
  var out={runId:runId,model:id,at:started,asOf:asOf()};
  if(!fn)return Object.assign(out,{status:'unknown-model',
    note:'No model of that name exists. A registry entry without a function behind it is documentation.'});
  /* FRESHNESS: how stale are the inputs this model depends on. */
  var stale=[];
  (request.dependsOn||[]).forEach(function(t){
    var s=obsOf(t);
    var last=s.length?s[s.length-1].date:null;
    var age=last?daysBetween(last,asOf()):null;
    if(age==null)stale.push({input:t,age:null,why:'never recorded'});
    else if(age>(request.maxAgeDays||14))stale.push({input:t,age:age,why:'last recorded '+age+' days ago'});
  });
  /* APPLICABILITY: is this model meaningful in the current context at all. */
  var applicable=true,why=null;
  if(request.requiresPhase){
    var ph=activePhase()||{};
    if(ph.type!==request.requiresPhase){applicable=false;why='this model applies during a '+request.requiresPhase+' and you are not in one';}
  }
  if(!applicable)return Object.assign(out,{status:'not-applicable',reason:why,
    note:'Refused before running. A model that returns a number outside the context it was built for is worse than one that declines.'});
  var value=null,err=null;
  try{value=fn.apply(null,request.args||[]);}catch(e){err=String(e&&e.message||e);}
  if(err)return Object.assign(out,{status:'error',error:err});
  /* A MODEL THAT DECLINES IS NOT A SUCCESSFUL RUN. The models refused correctly — energy balance on four days of data
     returned "insufficient" with what it needed — but this wrapped the refusal as a value and labelled the run "ok", so
     anything asking the gateway whether a result was usable was told yes. The minimum-evidence refusal was defeated
     at exactly the layer meant to enforce it. A decline now carries the model's own status and reasons, and no value. */
  var DECLINES={insufficient:1,none:1,unknown:1,'not-applicable':1,impossible:1,'no-data':1,empty:1,declined:1,refused:1};
  if(value&&typeof value==='object'&&value.status&&DECLINES[value.status]){
    var cdecl=(typeof modelContract==='function'&&request.modelId)?modelContract(request.modelId):null;
    return Object.assign(out,{status:value.status,value:null,result:value,need:value.need||null,
      note:value.note||('the model declined: '+value.status),cls:value.cls||null,
      provenance:buildProvenance({runId:runId,model:id,identity:_ident,inputs:request.dependsOn||[],value:null,asOf:asOf()})});
  }
  /* PROVENANCE and uncertainty, read from what the model returned rather than assumed. When the model returns no class,
     the class its registry contract declares is used, and labelled as declared. */
  var cls=value&&value.cls?value.cls:null,clsSource=cls?'returned':null;
  if(!cls){var _m=(typeof MODELS!=='undefined')?MODELS.filter(function(m){return m.fn===request.model;})[0]:null;if(_m&&_m.cls){cls=_m.cls;clsSource='declared by the model contract';}}
  var interval=(value&&(value.lo!=null||value.hi!=null))?{lo:value.lo,hi:value.hi}:null;
  /* STEP 7: provenance is GENERATED here, during execution, rather than reconstructed from UI metadata
     afterwards. Observation nodes are the declared inputs as they stood at as-of; the run node records the
     model, its version vector and the identity; the output node carries the result's class and interval. */
  var prov=buildProvenance({runId:runId,model:id,identity:_ident,inputs:request.dependsOn||[],
    value:value,asOf:asOf()});
  return Object.assign(out,{status:'ok',value:value,
    provenance:prov,versionVector:_ident?_ident.versionVector:null,
    cls:cls,clsSource:clsSource,modelStatus:value&&value.status?value.status:null,interval:interval,
    freshness:{stale:stale,ok:stale.length===0},
    lineage:(typeof lineageOf==='function'&&request.quantity)?lineageOf(request.quantity):null,
    degraded:stale.length>0,
    note:stale.length?('Ran, but '+stale.length+' input(s) are stale: '+stale.map(function(s){return s.input;}).join(', ')+
      '. The result is reported as degraded rather than withheld, because a stale answer with its staleness stated is more useful than silence.'):
      'All declared inputs are current.'});
}
function inferenceContract(model){
  var g=(typeof window!=='undefined')?window:{};
  return {model:model,exists:typeof g[model]==='function',
    dictionary:DATA_DICTIONARY[model]||null,
    note:'What a caller can expect from this model: whether it exists, and what the data dictionary says about the quantity it produces.'};
}

/* ---------------- STEP 7: PROVENANCE DAG ----------------
   Node types from the direction: observation, event, state, transformation, reference, model, model-run,
   inference, forecast, decision, experiment, presentation. Every node carries id, type, source, version,
   timestamp, runId, parentIds and metadata. */
var PROVENANCE_TYPES=['observation','event','state','transformation','reference','model','model-run',
  'inference','forecast','decision','experiment','presentation'];
var _PROVENANCE_STORE={};
function _provNode(type,id,o){
  return Object.assign({id:id,type:type,source:null,version:null,timestamp:nowISO(),
    runId:null,parentIds:[],metadata:{}},o||{});
}
function buildProvenance(o){
  var nodes=[],edges=[];
  var inputIds=[];
  (o.inputs||[]).forEach(function(t){
    var obs=[];try{obs=obsOf(t);}catch(e){}
    var last=obs.length?obs[obs.length-1]:null;
    /* Identified by content, so the same observation set produces the same node id every time. */
    var nid='obs:'+t+':'+sha256(t+'|'+obs.length+'|'+(last?last.date+':'+last.value:'none')).slice(0,12);
    nodes.push(_provNode('observation',nid,{source:t,runId:o.runId,
      metadata:{count:obs.length,latest:last?last.date:null}}));
    inputIds.push(nid);
  });
  var vv=o.identity?o.identity.versionVector:{};
  var modelNode='model:'+o.model+'@'+(vv.modelVersion||'1');
  nodes.push(_provNode('model',modelNode,{source:o.model,version:vv.modelVersion||'1',
    metadata:{maturity:(typeof ENGINE_MATURITY!=='undefined'&&ENGINE_MATURITY[o.model])||'ungraded'}}));
  var runNode='run:'+o.runId;
  nodes.push(_provNode('model-run',runNode,{source:o.model,runId:o.runId,
    version:vv.modelVersion||'1',parentIds:inputIds.concat([modelNode]),
    metadata:{versionVector:vv,asOf:o.asOf,digest:o.identity?o.identity.digest:null}}));
  inputIds.forEach(function(i){edges.push({from:i,to:runNode,rel:'input'});});
  edges.push({from:modelNode,to:runNode,rel:'executed-by'});
  var v=o.value||{};
  var outNode='out:'+o.runId;
  nodes.push(_provNode('inference',outNode,{source:o.model,runId:o.runId,parentIds:[runNode],
    metadata:{cls:v.cls||null,value:v.value!=null?v.value:null,
      interval:(v.lo!=null&&v.hi!=null)?[v.lo,v.hi]:null}}));
  edges.push({from:runNode,to:outNode,rel:'produced'});
  var dag={runId:o.runId,nodes:nodes,edges:edges,root:outNode};
  _PROVENANCE_STORE[o.runId]=dag;
  return dag;
}
function provenanceFor(runId){return _PROVENANCE_STORE[runId]||null;}
function provenanceAudit(){
  var issues=[];
  Object.keys(_PROVENANCE_STORE).forEach(function(r){
    var d=_PROVENANCE_STORE[r];
    var ids={};d.nodes.forEach(function(n){ids[n.id]=1;});
    d.nodes.forEach(function(n){
      if(PROVENANCE_TYPES.indexOf(n.type)<0)issues.push(r+': unknown node type '+n.type);
      (n.parentIds||[]).forEach(function(p){if(!ids[p])issues.push(r+': '+n.id+' names a parent that is not in the DAG');});
    });
  });
  return {runs:Object.keys(_PROVENANCE_STORE).length,issues:issues,ok:issues.length===0,
    note:'Every node of every recorded DAG has a declared type and every parent it names exists.'};
}

/* ============================================================================
   STEPS 3\u20135: THE MODEL REGISTRY AS THE AUTHORITATIVE DESCRIPTION, INFER() ROUTED THROUGH IT, AND A
   TYPED DEPENDENCY GRAPH BUILT FROM IT

   Nothing here is a second registry. modelContract() reads MODELS and derives the fields the direction
   specifies from registries that already exist \u2014 maturity from ENGINE_MATURITY, lifecycle from the model
   lifecycle store, materialisation from MATERIALIZED_VIEWS, typed dependencies from the contract resolver.
   Deriving them means they cannot disagree with the things they describe.
   ============================================================================ */
var DEPENDENCY_TYPES=['data','model','reference','ontology','configuration','derived-state'];
function _depType(ref){
  var r=resolveContractRef(ref);
  if(!r.resolved)return {type:'unresolved',id:ref};
  if(r.kind==='model')return {type:'model',id:r.id};
  if(r.kind==='observation'||r.kind==='session'||r.kind==='record')return {type:'data',id:r.id};
  if(r.kind==='profile'||r.kind==='setting')return {type:'configuration',id:r.id};
  if(r.kind==='function')return {type:'derived-state',id:r.id};
  return {type:'reference',id:r.id};
}
/* 23 of the 25 core models had no maturity grade: ENGINE_MATURITY was built around the newer engines and
   keyed by their function names, so it never met the original model registry. Two registries describing
   overlapping things with disjoint keys. Rather than hand-assign 23 grades, a grade is DERIVED from what the
   record can actually show about each model, and an explicit assignment still wins where one exists.

   The rule is deliberately conservative. A heuristic, a prior or a policy is infrastructure — it runs, and
   that says nothing about whether it is right. Only a model whose output is scored against later outcomes
   can rise to statistically validated, and nothing here is experimentally validated because no controlled
   trial has ever been run. */
var SCORED_AGAINST_OUTCOMES={weight_forecast:true,goal_traj:false,tdee_personal:false};
/* The first version of this rule granted STATISTICALLY_VALIDATED to any model that was scored against
   outcomes — for being CHECKED, not for being RIGHT. The weight forecast held that grade while its own
   ledger showed a +1.70 lb mean error across 42 scored forecasts: actual weight lands above the forecast,
   consistently. Validation now reads the ledger: enough scored forecasts, and a mean error that is not
   significantly different from zero. Coverage is reported alongside, because the interval has no nominal
   level, so its record is the only statement of what it means. */
function forecastTrackRecord(modelId){
  var S=(DB.predictions||[]).filter(function(p){return p.model===modelId&&p.status==='scored'&&p.error!=null;});
  if(!S.length)return {n:0};
  var errs=S.map(function(p){return p.error;});
  var b=mean(errs),s2=sd(errs)||0,n=errs.length;
  var t=s2>0?b/(s2/Math.sqrt(n)):null;
  var cov=S.filter(function(p){return p.covered===true;}).length;
  var byH={};S.forEach(function(p){var h=p.horizonDays;(byH[h]=byH[h]||[]).push(p);});
  /* Reported for the forecasts flagged reliable as well, so selective trust can be checked rather than assumed. */
  var R=S.filter(function(p){return p.reliable!==false;});
  var reliableOnly=R.length?{n:R.length,bias:round(mean(R.map(function(p){return p.error;})),2),
    coverage:round(R.filter(function(p){return p.covered===true;}).length/R.length,3)}:null;
  return {n:n,reliableOnly:reliableOnly,bias:round(b,2),biasT:t!=null?round(t,1):null,
    biasSignificant:t!=null&&Math.abs(t)>=2,
    coverage:round(cov/n,3),covered:cov,
    byHorizon:Object.keys(byH).sort(function(a,b){return a-b;}).map(function(h){var g=byH[h];
      return {horizonDays:+h,n:g.length,bias:round(mean(g.map(function(p){return p.error;})),2),
        coverage:round(g.filter(function(p){return p.covered===true;}).length/g.length,3)};})};
}
function modelMaturity(m){
  if(typeof ENGINE_MATURITY!=='undefined'){
    var explicit=ENGINE_MATURITY[m.fn]||ENGINE_MATURITY[m.id];
    if(explicit)return explicit;
  }
  if(SCORED_AGAINST_OUTCOMES[m.id]){
    var tr=forecastTrackRecord(m.id);
    if(tr.n>=20&&!tr.biasSignificant)return 'STATISTICALLY_VALIDATED';
    /* Scored but not passing: it is still operational, and the reason is on the contract. */
    return 'OPERATIONAL_ANALYTICAL';
  }
  if(m.cls==='HEURISTIC'||m.cls==='PRIOR'||m.cls==='POLICY')return 'INFRASTRUCTURE_GRADE';
  /* Measured and derived arithmetic with a declared uncertainty is operational; without one it is not yet. */
  if((m.cls==='DERIVED'||m.cls==='MEASURED'||m.cls==='EMPIRICAL'||m.cls==='PREDICTIVE')&&m.uncertainty)
    return 'OPERATIONAL_ANALYTICAL';
  return 'INFRASTRUCTURE_GRADE';
}
function modelContract(id){
  var m=(MODELS||[]).filter(function(x){return x.id===id;})[0];
  if(!m)return null;
  var g=(typeof window!=='undefined')?window:{};
  var deps=(m.inputs||[]).map(_depType);
  var matKey=Object.keys(typeof MATERIALIZED_VIEWS!=='undefined'?MATERIALIZED_VIEWS:{}).filter(function(k){
    return MATERIALIZED_VIEWS[k].fn===m.fn;})[0]||null;
  var lc=null;try{lc=modelLifecycle()[id]||null;}catch(e){}
  return {
    id:m.id,name:m.name,version:m.version,
    fn:m.fn||null,executable:!!(m.fn&&typeof g[m.fn]==='function'),
    maturity:modelMaturity(m),
    maturityEvidence:SCORED_AGAINST_OUTCOMES[m.id]?(function(){var tr=forecastTrackRecord(m.id);
      return tr.n?Object.assign({},tr,{verdict:tr.n<20?'too few scored forecasts to validate':
        (tr.biasSignificant?('scored against '+tr.n+' outcomes, but biased: mean error '+tr.bias+' (t = '+tr.biasT+')'):
          ('scored against '+tr.n+' outcomes with no significant bias'))}):{n:0,verdict:'nothing scored yet'};})():null,
    maturitySource:(typeof ENGINE_MATURITY!=='undefined'&&(ENGINE_MATURITY[m.fn]||ENGINE_MATURITY[m.id]))?'assigned':'derived',
    inputs:m.inputs||[],
    outputs:[{description:m.output,cls:m.cls}],
    dependencies:deps,
    assumptions:m.assumes||[],
    applicability:{minN:m.minN,freshnessDays:m.freshnessDays,failsWhen:m.failsWhen||[]},
    evidenceRequirements:{minimumObservations:m.minN,maximumAgeDays:m.freshnessDays},
    /* §10: each model declares where its uncertainty comes from, how it is computed, and what it emits. */
    uncertaintyInputs:(m.inputs||[]).map(function(i){var q=(typeof resolveQuantity==='function')&&resolveQuantity(i);
      return {input:i,kind:q?canonicalUncertainty(q.uncertaintySemantics||'measurement'):'measurement'};}),
    uncertaintyMethod:m.cls==='PREDICTIVE'?'residual scatter projected over the horizon':
      (m.cls==='EMPIRICAL'||m.cls==='DERIVED'?'residual or sampling error of the fit':
       (m.cls==='PRIOR'?'reference-equation error':(m.cls==='HEURISTIC'?'none quantified — heuristic':'none'))),
    uncertaintyOutput:(m.cls==='HEURISTIC'||m.cls==='POLICY')?'none':'interval',
    uncertaintyContract:{declared:m.uncertainty||null,
      /* The taxonomy class is inferred from the epistemic class, not invented by the presentation layer. */
      taxonomy:({MEASURED:'measurement',DERIVED:'model',EMPIRICAL:'sampling',BLENDED:'parameter',
        PRIOR:'referenceData',HEURISTIC:'structural',PREDICTIVE:'forecast'})[m.cls]||'unspecified'},
    provenanceContract:{generatedDuring:'execution',nodeTypes:['observation','model','model-run','inference']},
    materialization:matKey?{view:matKey,policy:'content-addressed'}:{view:null,policy:'computed on demand'},
    lifecycle:lc?lc.stage:'unstaged',
    validation:{backtestable:!!(typeof MODEL_ROLES!=='undefined'&&MODEL_ROLES[id])},
    consumers:m.consumers||[]
  };
}
function modelRegistryAudit(){
  var issues=[];
  (MODELS||[]).forEach(function(m){
    var c=modelContract(m.id);
    if(!c.fn)issues.push(m.id+': no executable binding');
    else if(!c.executable)issues.push(m.id+': bound to '+c.fn+', which does not exist');
    c.dependencies.forEach(function(d){if(d.type==='unresolved')issues.push(m.id+': input "'+d.id+'" resolves to nothing');});
  });
  /* A model with no grade at all is a governance failure the direction names explicitly. */
  (MODELS||[]).forEach(function(m){if(!modelMaturity(m))issues.push(m.id+': no maturity grade');});
  return {models:(MODELS||[]).length,issues:issues,ok:issues.length===0,
    graded:(MODELS||[]).filter(function(m){return !!modelMaturity(m);}).length,
    derivedGrades:(MODELS||[]).filter(function(m){return modelContract(m.id).maturitySource==='derived';}).length,
    executable:(MODELS||[]).filter(function(m){return modelContract(m.id).executable;}).length,
    note:'Every registered model must name a function that exists, and every input it declares must resolve. A registry entry with no implementation behind it is documentation.'};
}
/* ---------------- STEP 4: infer({modelId}) ----------------
   Resolves through the registry, validates applicability BEFORE executing, and never invents missing
   inputs. The implementation underneath stays reusable; the gateway adds identity, provenance, uncertainty
   and diagnostics. The older call shape (model: functionName) still works during migration and is reported
   as legacy, so the remaining direct callers can be found rather than guessed. */
/* The function-name call shape is removed (H0). No production path used it — the runtime counter stayed empty across
   every tab — but two behaviours were reachable only through it: declining outside a phase, and degrading on stale
   inputs with a caller-chosen freshness. Both now pass through the id gateway as NARROWING overrides: a caller may
   make applicability stricter, never looser. The core underneath is the implementation, not a legacy path. */
var _inferCore=infer;
var INFER_LEGACY_CALLS={};
infer=function(request){
  request=request||{};
  if(!request.modelId){
    INFER_LEGACY_CALLS[request.model||'anon']=(INFER_LEGACY_CALLS[request.model||'anon']||0)+1;
    return {status:'refused',model:request.model||null,
      note:'infer() takes a registry id (modelId). The function-name call shape was removed, so every inference goes through the registry, its contract and its applicability.'};
  }
  var c=modelContract(request.modelId);
  if(!c)return {status:'unknown-model',modelId:request.modelId,
    note:'Not in the model registry. The gateway resolves models by id and will not guess.'};
  if(!c.executable)return {status:'unbound',modelId:request.modelId,fn:c.fn,
    note:'Registered but with no implementation behind it.'};
  /* Applicability first: a model outside its evidence requirements declines rather than returning a number. */
  var diagnostics=[];
  (c.dependencies||[]).filter(function(d){return d.type==='data';}).forEach(function(d){
    var n=0;try{n=obsOf(d.id).length;}catch(e){}
    if(c.applicability.minN!=null&&n<c.applicability.minN)
      diagnostics.push({kind:'insufficient-evidence',input:d.id,have:n,need:c.applicability.minN});
  });
  var dataDeps=c.dependencies.filter(function(d){return d.type==='data';}).map(function(d){return d.id;});
  /* The identity must hash the inputs the model ran on. It hashed request.inputs, which is empty for a registry call,
     so the run id never reflected the data at all: a new weigh-in left it unchanged, and "identical across loads"
     passed only because nothing in it could differ. The record's content hash is now part of it, held in the memo
     store so it is dropped exactly when cached model results are. */
  var content=_MEMO.__recordContent||(_MEMO.__recordContent=(typeof _contentHash==='function'?_contentHash():null));
  var fresh=c.applicability.freshnessDays||14;if(request.maxAgeDays!=null)fresh=Math.min(fresh,request.maxAgeDays);
  var out=_inferCore({model:c.fn,args:request.args||[],dependsOn:dataDeps,requiresPhase:request.requiresPhase||undefined,
    maxAgeDays:fresh,inputs:Object.assign({},request.inputs||{},{recordContent:content,asOf:asOf()}),params:request.options||{}});
  return Object.assign({},out,{
    modelId:c.id,modelVersion:c.version,maturity:c.maturity,
    asOf:asOf(),
    assumptions:c.assumptions,applicability:c.applicability,
    uncertainty:buildUncertainty(c,out,diagnostics),
    dependencies:c.dependencies,
    diagnostics:diagnostics,
    degraded:!!out.degraded||diagnostics.length>0
  });
};
/* ---------------- STEP 5: TYPED DEPENDENCY GRAPH AND INVALIDATION ----------------
   Built from the registry, not a second hand-written graph. When a source changes, walk outward to every
   model, materialisation and decision that depends on it. */
function registryDependencyGraph(){
  var edges=[];
  (MODELS||[]).forEach(function(m){
    var c=modelContract(m.id);
    c.dependencies.forEach(function(d){
      edges.push({dependencyId:d.id+'\u2192'+m.id,dependencyType:d.type,sourceId:d.id,targetId:m.id,
        version:m.version,scope:'model'});
    });
  });
  return {edges:edges,types:DEPENDENCY_TYPES,
    byType:DEPENDENCY_TYPES.reduce(function(a,t){a[t]=edges.filter(function(e){return e.dependencyType===t;}).length;return a;},{})};
}
function affectedBy(sourceId){
  var g=registryDependencyGraph();
  var models=[],seen={};
  (function walk(src){
    g.edges.forEach(function(e){
      if(e.sourceId===src&&!seen[e.targetId]){seen[e.targetId]=1;models.push(e.targetId);walk(e.targetId);}
    });
  })(sourceId);
  var views=Object.keys(typeof MATERIALIZED_VIEWS!=='undefined'?MATERIALIZED_VIEWS:{}).filter(function(k){
    var fn=MATERIALIZED_VIEWS[k].fn;
    return models.some(function(mid){var c=modelContract(mid);return c&&c.fn===fn;});
  });
  var decisions=models.filter(function(mid){
    var c=modelContract(mid);
    return c&&(c.consumers||[]).some(function(x){return /decide|decision/.test(String(x));});
  });
  return {source:sourceId,models:models,materializations:views,decisions:decisions,
    note:'Every model, cached view and decision downstream of '+sourceId+', walked from the model registry itself.'};
}

/* §10: THE UNCERTAINTY OBJECT, BUILT AT EXECUTION.
   { sources, distribution, interval, confidence, calibration, propagation, limitations }. Assembled here from
   what the model declared and what the run produced, so the presentation layer never invents a confidence
   label. A part that cannot be stated honestly is null with the reason, not a plausible-looking default. */
function buildUncertainty(c,out,diagnostics){
  var v=(out&&out.value)||{};
  var sources=[];
  var add=function(k,why){k=canonicalUncertainty(k);if(!sources.some(function(x){return x.kind===k;}))sources.push({kind:k,why:why});};
  (c.uncertaintyInputs||[]).forEach(function(u){add(u.kind,'input '+u.input);});
  if(c.uncertaintyContract&&c.uncertaintyContract.taxonomy&&c.uncertaintyContract.taxonomy!=='unspecified')
    add(c.uncertaintyContract.taxonomy,'the model\u2019s own epistemic class');
  if((diagnostics||[]).some(function(d){return d.kind==='insufficient-evidence';}))add('missingness','fewer observations than the model requires');
  var lo=v.lo!=null?v.lo:(out&&out.interval&&out.interval.lo),hi=v.hi!=null?v.hi:(out&&out.interval&&out.interval.hi);
  var tr=(SCORED_AGAINST_OUTCOMES[c.id])?forecastTrackRecord(c.id):null;
  return {
    sources:sources,
    distribution:(lo!=null&&hi!=null)?'approximately normal (symmetric interval)':'not characterised',
    interval:(lo!=null&&hi!=null)?{lo:lo,hi:hi,level:v.level||null,
      levelNote:v.level?null:'no nominal level is declared for this interval, so its meaning rests on its track record'}:null,
    confidence:v.level?{nominal:v.level}:{nominal:null,label:v.confidence||null,
      note:'a label, not a probability'},
    calibration:tr&&tr.n?{status:'scored',n:tr.n,empiricalCoverage:tr.coverage,bias:tr.bias,
      biasSignificant:tr.biasSignificant,byHorizon:tr.byHorizon}:{status:'unscored',
      note:'this model\u2019s outputs are not scored against outcomes, so its uncertainty is unverified'},
    propagation:{method:c.uncertaintyMethod,inputs:(c.uncertaintyInputs||[]).map(function(u){return u.input;}),
      output:c.uncertaintyOutput},
    limitations:(c.assumptions||[]).concat((c.applicability&&c.applicability.failsWhen)||[])
  };
}

/* ---- PERSONALISATION LABELS (H4, MK W24) ----
   Every headline estimate says how personal it is, in words: a population starting estimate, adjusted to you, from
   your own data, stale, or not enough data yet. Derived from the result's own class, status and freshness, so it cannot
   drift from what the model actually did. */
var PERSONAL_LABELS={
  none:{label:'Not enough data yet',tone:'neutral'},
  population:{label:'Starting estimate',tone:'neutral'},
  adjusted:{label:'Adjusted to you',tone:'attention'},
  yours:{label:'From your data',tone:'good'},
  stale:{label:'Out of date',tone:'attention'}
};
function personalizationLabel(r,opts){
  opts=opts||{};
  if(!r||r.status!=='ok')return Object.assign({key:'none',why:(r&&r.need&&r.need.length?('Needs '+r.need.join(', ')+'.'):'Not enough of your data to estimate this yet.')},PERSONAL_LABELS.none);
  if(r.stale||(r.freshness&&r.freshness.ok===false)||r.degraded)return Object.assign({key:'stale',why:'Your recent inputs are missing, so this reflects an earlier period.'},PERSONAL_LABELS.stale);
  var c=String(r.cls||'').toUpperCase();
  /* A population estimate for someone who HAS history means their recent data is missing and the model has fallen
     back — "based on people like you, not yet on you" was untrue for a person with eight weeks of records. */
  if((c==='PRIOR'||c==='HEURISTIC')&&opts.history)return Object.assign({key:'stale',why:'Your recent data is missing, so this has fallen back to a starting estimate. Logging for a week or two brings it back to yours.'},PERSONAL_LABELS.stale);
  if(c==='PRIOR'||c==='HEURISTIC'||c==='POLICY')return Object.assign({key:'population',why:'Based on people like you, not yet on you.'+(opts.becomes?(' '+opts.becomes):'')},PERSONAL_LABELS.population);
  if(c==='BLENDED'||c==='CALIBRATED')return Object.assign({key:'adjusted',why:'A starting estimate, updated with your own data.'+(opts.becomes?(' '+opts.becomes):'')},PERSONAL_LABELS.adjusted);
  return Object.assign({key:'yours',why:'Fitted to your own record.'},PERSONAL_LABELS.yours);
}

/* ---- MODEL HEALTH (H4, D1 \u00a715) ----
   A forecast is trusted according to its record, not by default. Unproven below ten scored predictions; biased when it
   leans one way by a clear margin; degraded when its recent predictions land in their stated range clearly less often
   than its earlier ones; otherwise performing. Stated in words, with the size of the problem. */
function modelHealth(modelId){
  var t=forecastTrackRecord(modelId);
  if(!t||!t.n||t.n<10)return {model:modelId,state:'unproven',label:'Not yet proven',why:'Fewer than ten of its predictions have been checked against what happened.',n:t?t.n||0:0};
  var P=(DB.predictions||[]).filter(function(p){return p.model===modelId&&p.status!=='pending'&&p.covered!=null;}).sort(function(a,b){return a.dueDate<b.dueDate?-1:1;});
  var half=Math.floor(P.length/2),early=P.slice(0,half),recent=P.slice(half);
  var cov=function(a){return a.length?a.filter(function(p){return p.covered;}).length/a.length:null;};
  var ce=cov(early),cr=cov(recent),lvl=(P[0]&&P[0].level)||0.8;
  if(recent.length>=6&&ce!=null&&cr!=null&&cr<ce-0.15&&cr<lvl-0.1)
    return {model:modelId,state:'degraded',label:'Getting less reliable',n:t.n,
      why:'Its recent predictions landed in their range '+Math.round(cr*100)+'% of the time, against '+Math.round(ce*100)+'% earlier \u2014 something has changed that it does not capture.'};
  if(t.biasSignificant)
    return {model:modelId,state:'biased',label:'Leans '+(t.bias>0?'high':'low'),n:t.n,bias:t.bias,
      why:'On '+t.n+' checked predictions it has run about '+Math.abs(round(t.bias,1))+' lb '+(t.bias>0?'heavy':'light')+' on average \u2014 read it with that lean in mind.'};
  var cv=t.coverage||0;
  /* 100% against a claimed 80% is not "close": sustained, it means the ranges are wider than they need to be. On few
     predictions it may be chance, so the state waits for twenty; until then the two numbers are simply stated. */
  if(t.n>=20&&cv>lvl+0.15)return {model:modelId,state:'wide',label:'Ranges wider than needed',n:t.n,
    why:'On '+t.n+' checked predictions its range held '+Math.round(cv*100)+'% of the time against the '+Math.round(lvl*100)+'% it claims \u2014 it is more uncertain than it needs to be.'};
  return {model:modelId,state:'performing',label:'Performing as stated',n:t.n,why:'On '+t.n+' checked predictions its range held '+Math.round(cv*100)+'% of the time'+
    (Math.abs(cv-lvl)<=0.1?(', close to the '+Math.round(lvl*100)+'% it claims.'):(' against the '+Math.round(lvl*100)+'% it claims; too few checks yet to say more.'))};
}

/* ---- MODEL HEALTH IN THIS SITUATION (H4). The overall record can hide a situation where the forecast fails. When the
   record spans more than one situation, the forecast is judged in the current one. ---- */
function modelHealthInContext(modelId){
  var H=modelHealth(modelId),C=null;try{C=calibrationByContext();}catch(e){}
  if(!C||!C.rows||C.rows.length<2)return H;
  var cur=C.rows.filter(function(r){return r.current;})[0],others=C.rows.filter(function(r){return !r.current;}).reduce(function(a,r){return a+r.n;},0);
  var here=(C.current.phaseType||'this phase')+' at '+(C.current.weightZone||'this weight');
  if(!cur||cur.n<10)return {model:modelId,state:'unproven',context:true,label:'Not yet proven in this situation',
    why:(cur?cur.n:0)+' checked predictions in '+here+', against '+others+' elsewhere — its record elsewhere may not hold here.'};
  var se=cur.mae/Math.sqrt(cur.n);
  if(Math.abs(cur.bias)>2*se&&Math.abs(cur.bias)>=0.5)return {model:modelId,state:'biased',context:true,label:'Leans '+(cur.bias>0?'high':'low')+' in this situation',bias:cur.bias,
    why:'In '+here+' it has run about '+Math.abs(round(cur.bias,1))+' lb '+(cur.bias>0?'heavy':'light')+' on '+cur.n+' checked predictions.'};
  if(cur.hitRate!=null&&cur.hitRate<0.7)return {model:modelId,state:'degraded',context:true,label:'Less reliable in this situation',
    why:'In '+here+' its range held '+Math.round(cur.hitRate*100)+'% of the time on '+cur.n+' checks.'};
  return {model:modelId,state:'performing',context:true,label:'Performing in this situation',why:'In '+here+' its range held '+Math.round((cur.hitRate||0)*100)+'% of the time on '+cur.n+' checks.'};
}
