/* ============================================================================
   REGION: KNOWLEDGE GRAPH · CAUSAL SUPPORT · EXPERIMENT LIBRARY (catalogue A1, A4, W, X)
   ============================================================================ */

/* ---------------- A1. KNOWLEDGE GRAPH ----------------
   Knowledge already had context and decay; what it lacked was EDGES. The chain the catalogue names —
   observation → finding → hypothesis → experiment → outcome → knowledge → recommendation → decision — is
   already present in the record as separate collections. The graph makes the connections explicit so a
   person can walk from a recommendation back to the observations underneath it.

   Every edge is derived from something already recorded. Nothing here invents a relationship: an edge exists
   because an experiment names a variable, or an intervention names a decision, not because two things look
   related. */
var NODE_KINDS={
  observation:{label:'Observation',cls:'MEASURED'},
  finding:{label:'Finding',cls:'DERIVED'},
  hypothesis:{label:'Hypothesis',cls:'DERIVED'},
  experiment:{label:'Experiment',cls:'EMPIRICAL'},
  outcome:{label:'Outcome',cls:'MEASURED'},
  knowledge:{label:'What it learned',cls:'EMPIRICAL'},
  decision:{label:'Decision',cls:'POLICY'},
  intervention:{label:'Change made',cls:'MEASURED'},
  negative:{label:'Did not work',cls:'EMPIRICAL'}
};
function knowledgeGraph(opts){
  opts=opts||{};
  var days=opts.days||365;
  var from=addDays(asOf(),-days);
  var nodes=[],edges=[],seen={};
  var add=function(kind,id,label,extra){
    var key=kind+':'+id;
    if(seen[key])return key;
    seen[key]=1;
    nodes.push(Object.assign({key:key,kind:kind,id:id,label:label,cls:NODE_KINDS[kind].cls},extra||{}));
    return key;
  };
  var link=function(a,b,rel){if(a&&b&&a!==b)edges.push({from:a,to:b,rel:rel});};

  decisionsOf().filter(function(d){return d.date>=from;}).forEach(function(d){
    var dk=add('decision',d.id,d.verb||d.code,{date:d.date,confidence:d.confidence});
    /* A decision's stated reasons are findings; they are already written down, so they become nodes. */
    (d.why||[]).slice(0,4).forEach(function(w,i){
      var text=typeof w==='string'?w:(w.text||'');
      if(!text)return;
      var fk=add('finding',d.id+'-w'+i,text,{date:d.date});
      link(fk,dk,'supported');
    });
  });
  (DB.interventions||[]).filter(function(i){return i.date>=from&&_knownBy(i,asOf());}).forEach(function(iv){
    var ik=add('intervention',iv.id,iv.variable+(iv.from!=null?(' '+iv.from+' \u2192 '+iv.to):''),{date:iv.date});
    /* An intervention made on the same day as a decision was made BY it. */
    decisionsOf().filter(function(d){return d.date===iv.date;}).forEach(function(d){
      link('decision:'+d.id,ik,'produced');
    });
    (DB.predictions||[]).filter(function(p){
      return p.madeAt&&String(p.madeAt).slice(0,10)===iv.date;}).forEach(function(p){
      var pk=add('hypothesis',p.id,(p.subject||'forecast')+' '+fmtNum(p.point,1),{date:iv.date});
      link(ik,pk,'predicted');
      if(p.status==='scored'){
        var ok2=add('outcome',p.id,'actual '+fmtNum(p.actual,1)+' ('+(p.covered?'within':'outside')+' the range)',
          {date:String(p.dueDate||'').slice(0,10),covered:p.covered});
        link(pk,ok2,'tested by');
      }
    });
  });
  (DB.experiments||[]).filter(function(e){return e.startDate>=from;}).forEach(function(e){
    var ek=add('experiment',e.id,(e.intervention||e.variable||'experiment'),{date:e.startDate,status:e.status});
    /* The observations an experiment was actually judged on. Without these the chain claims to start at
       observations while containing none, which is a diagram of a principle rather than of this record. */
    /* An experiment's `metric` is a human label ("weight trend (lb/week)"), not an observation type.
       Passing it straight to obsOf() silently matched nothing, which is why the chain never reached the
       observations it claims to start from. */
    var metric=(e.metric&&OBS_TYPES[e.metric])?e.metric:
      (/waist/i.test(e.metric||'')?'waist':(/hunger/i.test(e.metric||'')?'hunger':
       (/fatigue/i.test(e.metric||'')?'fatigue':'weight')));
    /* An experiment has no endDate — its end is when it completed, or its recheck date, or its start plus its
       duration. Bounding by e.endDate meant the bound was always missing, so every reading from the start onward
       was attributed to the experiment, including readings taken long after it ended. Found by the governance
       gate's never-written-field detector. */
    var eEnd=e.completedAt?String(e.completedAt).slice(0,10):(e.recheckDate||(e.startDate&&e.durationDays?addDays(e.startDate,+e.durationDays):null));
    var window=obsOf(metric,{from:e.startDate}).filter(function(o){
      return !eEnd||o.date<=eEnd;}).slice(0,40);
    if(window.length){
      var ok1=add('observation',e.id+'-obs',window.length+' '+((OBS_TYPES[metric]||{}).label||metric).toLowerCase()+
        ' readings during it',{date:e.startDate,count:window.length});
      link(ok1,ek,'measured by');
    }
    (DB.interventions||[]).filter(function(iv){return iv.variable===e.variable&&Math.abs(daysBetween(iv.date,e.startDate))<=3;})
      .forEach(function(iv){link('intervention:'+iv.id,ek,'tested by');});
    if(e.status==='complete'){
      var ok3=add('outcome',e.id+'-out',String(e.conclusion||'evaluated'),{date:e.completedAt?String(e.completedAt).slice(0,10):null});
      link(ek,ok3,'concluded');
      var kk=add('knowledge',e.id+'-k',(e.variable||'')+': '+String(e.conclusion||'').slice(0,60),{date:e.completedAt?String(e.completedAt).slice(0,10):null});
      link(ok3,kk,'became');
    }
  });
  try{getNegativeKnowledge().forEach(function(n){
    var nk=add('negative',n.id||n.variable,(n.variable||n.intervention||'')+' did not produce the expected effect',{date:n.date});
    (DB.experiments||[]).filter(function(e){return e.variable===n.variable;}).forEach(function(e){
      link('experiment:'+e.id,nk,'concluded');});
  });}catch(e){_q(e,'P3');}
  try{personalKnowledge().items.filter(function(i){return i.kind==='response';}).forEach(function(i){
    var kk=add('knowledge','resp-'+i.subject,i.subject+': '+i.statement,{confidence:i.decayedConfidence,freshness:i.freshness});
    (DB.interventions||[]).filter(function(iv){return iv.variable===i.subject;}).slice(-3).forEach(function(iv){
      link('intervention:'+iv.id,kk,'contributed to');});
  });}catch(e){_q(e,'P3');}

  /* Orphans are worth surfacing: a finding that led nowhere, or knowledge with nothing underneath it. */
  var linked={};edges.forEach(function(e){linked[e.from]=1;linked[e.to]=1;});
  var orphans=nodes.filter(function(n){return !linked[n.key];});
  return {nodes:nodes,edges:edges,orphans:orphans,
    counts:Object.keys(NODE_KINDS).reduce(function(a,k){
      a[k]=nodes.filter(function(n){return n.kind===k;}).length;return a;},{}),
    cls:'DERIVED',
    note:'Every edge comes from something already in the record \u2014 an experiment naming a variable, an intervention sharing a date with a decision. Nothing here infers a relationship because two things look related.'};
}
function walkBack(nodeKey,graph){
  graph=graph||knowledgeGraph();
  var byKey={};graph.nodes.forEach(function(n){byKey[n.key]=n;});
  var chain=[],seen={},queue=[nodeKey];
  while(queue.length&&chain.length<30){
    var k=queue.shift();
    if(seen[k])continue;seen[k]=1;
    if(byKey[k])chain.push(byKey[k]);
    graph.edges.filter(function(e){return e.to===k;}).forEach(function(e){queue.push(e.from);});
  }
  return chain;
}
/* ---------------- A4. CAUSAL SUPPORT ----------------
   The catalogue is explicit that this must not be "AI says X causes Y". It grades what the record can
   actually support, and the top grade available to an N-of-1 record without randomisation is deliberately
   short of "proven". */
var CAUSAL_GRADES=['contradicted','unknown','confounded','correlated','weakly supported','supported'];
function causalSupport(variable){
  var exps=(DB.experiments||[]).filter(function(e){return e.variable===variable&&e.status==='complete';});
  var ivs=(DB.interventions||[]).filter(function(i){return i.variable===variable&&_knownBy(i,asOf());});
  var negs=[];try{negs=getNegativeKnowledge().filter(function(n){return n.variable===variable;});}catch(e){}
  var resp=null;try{resp=(personalResponse().rows||[]).filter(function(r){return r.variable===variable;})[0];}catch(e){}
  var its=[];
  ivs.slice(-4).forEach(function(iv){
    try{var r=interruptedTimeSeries({changeDate:iv.date});if(r.status==='ok')its.push(r);}catch(e){}
  });
  var clear=its.filter(function(r){return Math.abs(r.t||0)>2.5;}).length;
  var confounded=0;
  ivs.forEach(function(iv){
    var others=(DB.interventions||[]).filter(function(o){
      return o.id!==iv.id&&o.variable!==variable&&Math.abs(daysBetween(o.date,iv.date))<=7;});
    if(others.length)confounded++;
  });
  var grade='unknown',why=[],repeats=ivs.length;
  if(negs.length&&!exps.length){grade='contradicted';why.push('an evaluated attempt did not produce the expected effect');}
  else if(!ivs.length&&!resp){grade='unknown';why.push('this has never been changed on its own in your record');}
  else if(confounded>=repeats&&repeats>0){grade='confounded';
    why.push('every change to '+variable+' in your record happened within a week of another change');}
  else if(exps.length>=2&&clear>=2){grade='supported';
    why.push(exps.length+' completed experiments','the shift was clear against the pre-existing trend '+clear+' times');}
  else if((exps.length>=1&&clear>=1)||(repeats>=3&&clear>=2)){grade='weakly supported';
    why.push((exps.length?exps.length+' completed experiment(s)':repeats+' separate changes'),
      clear+' clear shift(s) against the prior trend');}
  else if(resp&&resp.n>=3){grade='correlated';
    why.push(resp.n+' observations show an association','none of them isolated '+variable+' from everything else');}
  else {grade='correlated';why.push('some association, from few observations');}
  return {variable:variable,grade:grade,why:why,n:exps.length+repeats,
    experiments:exps.length,changes:repeats,confoundedChanges:confounded,clearShifts:clear,
    cls:'EMPIRICAL',
    ceiling:'supported',
    note:'The strongest grade available here is "supported", never "proven". Nothing in a personal record is randomised, so a repeated, clean, unconfounded response is the most that can honestly be claimed.',
    next:grade==='supported'?'nothing further is needed for a personal decision':
      (grade==='confounded'?'change '+variable+' on its own, with nothing else moving, for the designed duration':
       'repeat the change in a clean window and evaluate it')};
}
function causalMap(){
  var vars=Object.keys(typeof RESPONSE_VARS!=='undefined'?RESPONSE_VARS:{});
  return {rows:vars.map(causalSupport).sort(function(a,b){
    return CAUSAL_GRADES.indexOf(b.grade)-CAUSAL_GRADES.indexOf(a.grade);}),
    grades:CAUSAL_GRADES,cls:'EMPIRICAL',
    note:'Graded from what your own record can support, not from what the literature says in general.'};
}
/* ---------------- W. EXPERIMENT LIBRARY ----------------
   Reusable templates, each carrying the things people forget: a washout, a confounder list, and a reversal
   condition. A template is not a protocol until the duration is computed from THIS person's noise, which is
   what designExperiment already does. */
var EXPERIMENT_TEMPLATES=[
  {id:'calorie-step',todo:'eat about 250 kcal a day less than you do now',label:'Change calories',variable:'calories',delta:-250,metric:'weight',
   question:'Does a smaller intake actually move my trend, or does activity compensate?',
   confounders:['activity drifting in the same week','a change in sodium or carbohydrate shifting water'],
   washoutDays:3,reversal:'trend moves past the band, or strength falls two sessions running'},
  {id:'step-intervention',todo:'walk about 2,500 more steps a day',label:'Change daily steps',variable:'steps',delta:2500,metric:'weight',
   question:'Do more steps change my rate, or do I eat them back?',
   confounders:['intake rising with activity','training volume changing at the same time'],
   washoutDays:2,reversal:'appetite or fatigue rises and stays risen'},
  {id:'protein',todo:'eat about 30 g more protein a day, at the same calories',label:'Change protein',variable:'protein',delta:30,metric:'hunger',
   question:'Does more protein change how hungry I am at the same calories?',
   confounders:['calories changing at the same time','fibre changing with the protein source'],
   washoutDays:2,reversal:'no change in hunger after the designed duration'},
  {id:'training-volume',todo:'add one lifting session a week',label:'Change training volume',variable:'training',delta:1,metric:'weight',
   question:'Does an extra session change my rate or just my fatigue?',
   confounders:['recovery falling','intake rising on training days'],
   washoutDays:5,reversal:'recovery drops below your own baseline for a week'},
  {id:'cardio',todo:'add one cardio session a week',label:'Add or remove cardio',variable:'cardio',delta:1,metric:'weight',
   question:'Is cardio worth its recovery cost for me?',
   confounders:['lifting volume changing','steps changing alongside'],
   washoutDays:4,reversal:'strength falls while cardio is in place'},
  {id:'composition-protein',todo:'eat about 40 g more protein a day and keep calories the same',label:'Change protein while holding calories',variable:'protein',delta:40,metric:'bodyfat',
   question:'Does more protein at the same calories change what I lose rather than how fast?',
   confounders:['training volume changing at the same time',
     'measurement method drifting — compare like with like or the result is the method'],
   washoutDays:0,reversal:'no difference in measured composition after the designed duration',
   kind:'composition',
   note:'Composition moves slowly and is measured badly, so this needs a longer run than a weight experiment and a single consistent method.'},
  {id:'recovery-intervention',todo:'add one recovery practice on set days — 10 minutes of mobility, or going to bed 45 minutes earlier',label:'Add a recovery practice',variable:'sleep',delta:0,metric:'fatigue',
   question:'Does a deliberate recovery practice change how I feel the next day?',
   confounders:['you choose to do it on days you already feel worse, which reverses the apparent effect',
     'training load changing in the same period'],
   washoutDays:1,reversal:'no difference in next-day fatigue after the designed duration',
   kind:'recovery'},
  {id:'behaviour-experiment',todo:'log at the same time every day',label:'Change when you log',variable:'steps',delta:0,metric:'adherence',
   question:'Does logging at a fixed time of day improve how much I actually log?',
   confounders:['motivation is usually high in the first week of any change',
     'a lighter schedule that week makes anything look easier'],
   washoutDays:0,reversal:'coverage returns to where it was',
   kind:'behaviour'},
  {id:'sleep',todo:'sleep about an hour more a night',label:'Change sleep',variable:'sleep',delta:1,metric:'fatigue',
   question:'Does an extra hour show up anywhere I can measure?',
   confounders:['weekday and weekend differing','stress changing independently'],
   washoutDays:2,reversal:'no difference after the designed duration'}
];
function experimentTemplate(id){
  var t=EXPERIMENT_TEMPLATES.filter(function(x){return x.id===id;})[0];
  if(!t)return null;
  var design=null;
  try{design=designExperiment({variable:t.variable,delta:t.delta,metric:t.metric});}catch(e){_q(e,'P2');}
  return Object.assign({},t,{design:design,
    ready:!!(design&&design.status==='ok'&&design.feasible),
    note:'A template is not a protocol until the duration is computed from your own measurement noise, which is what the design below does.'});
}
/* ---------------- X. AUTOMATIC EXPERIMENT DISCOVERY ----------------
   Not "evaluate the experiments you started" but "find the questions worth asking". Ranked the way
   value-of-information already ranks everything: what it would resolve, against what it costs to run. */
function experimentOpportunities(){
  var out=[];
  EXPERIMENT_TEMPLATES.forEach(function(t){
    var causal=causalSupport(t.variable);
    var design=null;try{design=designExperiment({variable:t.variable,delta:t.delta,metric:t.metric});}catch(e){}
    var running=(DB.experiments||[]).some(function(e){return e.variable===t.variable&&e.status!=='complete';});
    if(running)return;
    /* Worth most where the record is confounded or merely correlated: those are resolvable by design.
       Something already supported has little left to learn; something contradicted has been answered. */
    var value={confounded:0.9,correlated:0.75,unknown:0.6,'weakly supported':0.4,supported:0.1,contradicted:0.15}[causal.grade];
    var burden=design&&design.status==='ok'?Math.min(1,(design.durationDays||28)/60+0.2):0.8;
    var feasible=!design||design.status!=='ok'?false:design.feasible;
    out.push({id:t.id,label:t.label,variable:t.variable,question:t.question,
      grade:causal.grade,why:causal.why,
      value:value,burden:round(burden,2),ratio:round(value/Math.max(0.1,burden),2),
      weeks:design&&design.status==='ok'?design.weeksNeeded:null,
      feasible:feasible,
      /* An insufficient design has no verdict, it has a reason. Reading only the verdict left the blocker
         empty, so a question was listed as not runnable with no explanation — the exact dead end the
         availability rules exist to prevent. */
      blocker:feasible?null:((design&&design.verdict)||(design&&design.why)||
        (design&&design.need?('needs '+design.need.join('; ')):'no effect estimate for '+t.variable)),
      next:causal.next});
  });
  /* Feasible questions first. Leading with something that cannot be run puts the least useful item at the
     top of a list meant to answer "what should I test next". */
  out.sort(function(a,b){
    if(a.feasible!==b.feasible)return a.feasible?-1:1;
    return b.ratio-a.ratio;});
  var runnable=out.filter(function(o){return o.feasible;});
  return {opportunities:out,runnable:runnable,
    best:runnable[0]||null,cls:'DERIVED',
    note:'Ranked by what each would resolve against what it costs to run. The best question is usually the one where your record is confounded rather than the one where it is silent \u2014 a confound can be designed away.',
    caveat:'These are questions worth asking, not experiments that will succeed. An experiment that cannot detect its own effect is excluded rather than offered.'};
}

/* ============================================================================
   \u00a720: THE CANONICAL KNOWLEDGE GRAPH
   The graph used its own vocabulary \u2014 "supported", "produced", "became", "contributed to" \u2014 none of the eight
   edge types the direction names, and it had no model, source or claim nodes. Its findings carried a label and
   a date and none of the six things every personal finding needs. This is a canonical VIEW computed from
   knowledgeGraph() on demand \u2014 not a second store \u2014 with each existing edge mapped by what it actually connects.

   The mapping is conservative on purpose. "contributed to" becomes associatedWith, not causes: turning an
   observed association into a causal edge would be a new false claim. causes is reserved for an effect an
   experiment actually supported.
   ============================================================================ */
var KNOWLEDGE_NODE_TYPES=['observation','finding','intervention','outcome','model','source','experiment','claim'];
var KNOWLEDGE_EDGE_TYPES=['supports','contradicts','derivedFrom','causes','associatedWith','replicates','generalizes','limitedBy'];
var _KIND_TO_TYPE={observation:'observation',finding:'finding',knowledge:'finding',intervention:'intervention',
  outcome:'outcome',experiment:'experiment',decision:'claim',hypothesis:'claim'};
/* rel \u2192 canonical type, and whether the endpoints must be reversed so that "A derivedFrom B" reads correctly. */
var _REL_MAP={supported:{type:'supports'},produced:{type:'derivedFrom',reverse:true},predicted:{type:'derivedFrom',reverse:true},
  'measured by':{type:'derivedFrom',reverse:true},concluded:{type:'derivedFrom',reverse:true},became:{type:'derivedFrom',reverse:true},
  'contributed to':{type:'associatedWith'}};
var FINDING_REVIEW_DAYS={current:28,due:90};
function canonicalKnowledgeGraph(){
  var g=knowledgeGraph();
  var byKey={};(g.nodes||[]).forEach(function(n){byKey[n.key]=n;});
  var nodes=(g.nodes||[]).map(function(n){return {key:n.key,type:_KIND_TO_TYPE[n.kind]||'claim',label:n.label,date:n.date||null,cls:n.cls||null,originalKind:n.kind};});
  var edges=[];
  (g.edges||[]).forEach(function(e){
    var m=_REL_MAP[e.rel];
    if(e.rel==='tested by'&&byKey[e.to]&&byKey[e.to].kind==='outcome'){
      /* An outcome supports or contradicts the claim it tested \u2014 read from what the outcome says, never assumed. */
      var lab=String(byKey[e.to].label||'');
      /* Forecast outcomes read "(within the range)" or "(outside the range)" — now from the field the scorer
         actually writes — and those are a clear support or contradiction of the prediction they test. */
      var t=/refut|contradict|did not|no effect|failed to|outside the range/i.test(lab)?'contradicts':
        (/support|confirm|held|as predicted|within the range/i.test(lab)?'supports':'associatedWith');
      edges.push({from:e.to,to:e.from,type:t,originalRel:e.rel});return;
    }
    if(e.rel==='tested by'){edges.push({from:e.to,to:e.from,type:'derivedFrom',originalRel:e.rel});return;}
    if(!m){edges.push({from:e.from,to:e.to,type:'associatedWith',originalRel:e.rel,note:'unmapped relation, recorded as association only'});return;}
    edges.push(m.reverse?{from:e.to,to:e.from,type:m.type,originalRel:e.rel}:{from:e.from,to:e.to,type:m.type,originalRel:e.rel});
  });
  /* model and source nodes: where each finding came from */
  var MODEL_FOR=[[/^trend\b/i,'weight_trend'],[/^waist\b/i,'bodycomp_circ'],[/^strength\b/i,'strength_trend'],[/recovery|readiness/i,'recovery'],[/protein|calorie|intake/i,'energy_balance']];
  var addNode=function(key,type,label){if(!nodes.some(function(n){return n.key===key;}))nodes.push({key:key,type:type,label:label});};
  var sources={};(DB.observations||[]).forEach(function(o){sources[o.source||'unspecified']=1;});
  Object.keys(sources).forEach(function(s){addNode('source:'+s,'source',s);});
  nodes.filter(function(n){return n.type==='finding';}).forEach(function(n){
    var mm=MODEL_FOR.filter(function(x){return x[0].test(n.label||'');})[0];
    if(mm){addNode('model:'+mm[1],'model',mm[1]);edges.push({from:n.key,to:'model:'+mm[1],type:'derivedFrom'});}
    Object.keys(sources).forEach(function(s){edges.push({from:n.key,to:'source:'+s,type:'derivedFrom'});});
  });
  /* every personal finding: evidence, provenance, uncertainty, applicability, creation version, review state */
  var today=asOf();
  nodes.forEach(function(n){
    if(n.type!=='finding')return;
    var ev=edges.filter(function(e){return (e.from===n.key&&e.type==='supports')||(e.to===n.key&&(e.type==='supports'||e.type==='derivedFrom'));});
    var prov=edges.filter(function(e){return e.from===n.key&&e.type==='derivedFrom';}).map(function(e){return e.to;});
    var age=n.date?daysBetween(n.date,today):null;
    var model=prov.filter(function(k){return /^model:/.test(k);})[0];
    var mc=model&&typeof modelContract==='function'?modelContract(model.slice(6)):null;
    n.evidence=ev.map(function(e){return {type:e.type,node:e.from===n.key?e.to:e.from};});
    n.provenance={derivedFrom:prov,recordedOn:n.date||null};
    n.uncertainty={cls:n.cls||null,note:'the interval behind this finding was not stored with it; its class says what kind of claim it is'};
    n.applicability={phase:(DB.phases||[]).filter(function(p){return n.date&&p.startDate<=n.date&&(!p.endDate||p.endDate>=n.date);}).map(function(p){return p.type;})[0]||null,
      note:'holds for the phase and conditions it was recorded in, not in general'};
    n.creationVersion={app:(typeof APP_VERSION!=='undefined')?APP_VERSION:null,model:mc?mc.version:null};
    n.review={ageDays:age,state:age==null?'unknown':(age<=FINDING_REVIEW_DAYS.current?'current':(age<=FINDING_REVIEW_DAYS.due?'review due':'stale')),
      rule:'current for '+FINDING_REVIEW_DAYS.current+' days, due for review until '+FINDING_REVIEW_DAYS.due+', stale after'};
  });
  var counts={nodes:{},edges:{}};
  nodes.forEach(function(n){counts.nodes[n.type]=(counts.nodes[n.type]||0)+1;});
  edges.forEach(function(e){counts.edges[e.type]=(counts.edges[e.type]||0)+1;});
  return {nodes:nodes,edges:edges,counts:counts,cls:'DERIVED',
    note:'The knowledge graph in the direction\u2019s vocabulary, computed from the working graph on demand. causes is reserved for an effect an experiment supported; nothing here is upgraded to it from association.'};
}
function knowledgeGraphAudit(){
  var c=canonicalKnowledgeGraph(),issues=[];
  c.nodes.forEach(function(n){if(KNOWLEDGE_NODE_TYPES.indexOf(n.type)<0)issues.push('node '+n.key+' has non-canonical type '+n.type);});
  c.edges.forEach(function(e){if(KNOWLEDGE_EDGE_TYPES.indexOf(e.type)<0)issues.push('edge '+e.from+'\u2192'+e.to+' has non-canonical type '+e.type);});
  var keys={};c.nodes.forEach(function(n){keys[n.key]=1;});
  c.edges.forEach(function(e){if(!keys[e.from]||!keys[e.to])issues.push('edge '+e.type+' names a missing node');});
  c.nodes.filter(function(n){return n.type==='finding';}).forEach(function(n){
    ['evidence','provenance','uncertainty','applicability','creationVersion','review'].forEach(function(f){
      if(n[f]===undefined)issues.push('finding '+n.key+' lacks '+f);});});
  /* causes may only come from a supported experiment */
  c.edges.filter(function(e){return e.type==='causes';}).forEach(function(e){issues.push('a causes edge exists without an experiment behind it: '+e.from);});
  return {ok:issues.length===0,issues:issues,counts:c.counts};
}
