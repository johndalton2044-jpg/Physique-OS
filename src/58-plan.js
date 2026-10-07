/* ============================================================================
   THE PRODUCT SPINE (H1)
   Goal -> Constraints -> Plan -> Execution -> Observation -> Response -> Explanation -> Next action.

   The plan is a VERSIONED object over what already exists \u2014 the canonical goal, the phase's targets, the programme's
   week and the decision lattice \u2014 not a second engine. Each version records why it exists: its trigger, the evidence,
   the alternatives and the reason, so "why did my plan change?" is answered from the record.

   Execution keeps intended, attempted and done apart (MK \u00a74.2, \u00a75.2): a scheduled session is not a done session, a
   done session is not a response, and a missing log is UNKNOWN, never a failure. The response to a week is read only
   when enough of the plan was actually done to judge it.
   ============================================================================ */

/* ---- CONSTRAINTS ---- */
var CONSTRAINT_OPTIONS={
  sessionMinutes:[[30,'30 minutes'],[45,'45 minutes'],[60,'An hour'],[90,'90 minutes or more']],
  cookingTime:[['none','I don\u2019t cook'],['quick','Quick meals only'],['normal','I\u2019m happy to cook']],
  foodBudget:[['tight','Tight'],['moderate','Moderate'],['flexible','Not a concern']],
  dietRestrictions:[['vegetarian','Vegetarian'],['vegan','Vegan'],['dairy-free','No dairy'],['gluten-free','No gluten'],['nut-free','No nuts'],['halal','Halal'],['kosher','Kosher']]
};
function constraintModel(){
  var p=prof()||{},eq=null;try{eq=resolvedEquipment();}catch(e){}
  var days=(DB.settings.trainingDays||[]).slice();
  var m={equipment:eq&&eq.have?eq.have.slice():[],trainingDays:days,sessionMinutes:p.sessionMinutes||null,
    diet:p.dietPreference||null,restrictions:Array.isArray(p.dietRestrictions)?p.dietRestrictions.slice():[],
    cookingTime:p.cookingTime||null,foodBudget:p.foodBudget||null,activity:p.activityBaseline||null,sleepTargetH:p.sleepTargetH||null};
  m.missing=[];
  m.schedule=typeof scheduleModel==='function'?scheduleModel().mode:'weekly';
  if(!days.length&&m.schedule==='weekly')m.missing.push('training days');if(!m.sessionMinutes)m.missing.push('session length');
  if(!m.cookingTime)m.missing.push('cooking time');if(!m.foodBudget)m.missing.push('food budget');
  m.status='ok';return m;
}

/* ---- VARIANTS: the same objective, smaller. Never a silent redefinition of the objective. ---- */
var PLAN_VARIANTS={
  full:{label:'Full session',share:1,note:'as planned'},
  reduced:{label:'Reduced',share:0.6,note:'about 60% of the sets, same exercises'},
  minimum:{label:'Minimum',share:0.25,note:'the first working set of each main lift \u2014 keeps the habit and the signal'},
  recovery:{label:'Recovery',share:0,note:'a mobility routine instead; counts as recovery, not training'},
  travel:{label:'Travel',share:0.7,note:'bodyweight versions of the same movements'}
};

/* ---- THE PLAN ---- */
function _planSnapshot(){
  var G=canonicalGoal(),ph=activePhase(),ps=null;try{ps=programStructure();}catch(e){}
  var week={};
  if(ps&&ps.status==='ok'){var mc=ps.mesocycles&&ps.mesocycles[0]&&ps.mesocycles[0].microcycles;var last=mc&&mc[mc.length-1];
    (last&&last.days||[]).forEach(function(d){week[d.dow]=d.planned&&d.planned.kind!=='rest'?d.planned.label:null;});}
  var d=null;try{d=decide();}catch(e){}
  return {
    goal:{type:G.type,label:G.typeLabel,targetWeightLb:G.targetWeightLb,activeTargetLb:G.activeTargetLb,activeTargetSource:G.activeTargetSource,targetDate:G.activeDate},
    phaseId:ph?ph.id:null,phaseType:ph?ph.type:null,
    targets:ph?{kcal:ph.calorieTarget||null,protein:ph.proteinTarget||null,fiber:ph.fiberTarget||null,steps:ph.stepTarget||null,
      cardioSessions:ph.cardioSessions||null,trainingSessions:ph.trainingSessions||null,sleepH:ph.sleepTargetH||null,
      rateLo:ph.targetRateLo!=null?ph.targetRateLo:null,rateHi:ph.targetRateHi!=null?ph.targetRateHi:null}:{},
    training:{program:ps&&ps.program?ps.program.id:null,programLabel:ps&&ps.program?ps.program.label:null,week:week},
    constraints:constraintModel(),
    adaptation:{engine:'decision lattice',rulesVersion:d?d.rulesVersion:null,recheckDays:d?d.recheckDays:null}
  };
}
var _PLAN_COMPARE=['goal.type','goal.activeTargetLb','goal.targetDate','phaseId','phaseType','targets.kcal','targets.protein','targets.fiber','targets.steps',
  'targets.cardioSessions','targets.trainingSessions','targets.sleepH','targets.rateLo','targets.rateHi','training.program','training.week',
  'constraints.trainingDays','constraints.sessionMinutes','constraints.equipment','constraints.restrictions','constraints.cookingTime','constraints.foodBudget'];
function _get(o,path){return path.split('.').reduce(function(a,k){return a==null?a:a[k];},o);}
function _planDiff(a,b){
  var out=[];_PLAN_COMPARE.forEach(function(k){var x=_get(a,k),y=_get(b,k);if(JSON.stringify(x)!==JSON.stringify(y))out.push({field:k,from:x==null?null:x,to:y==null?null:y});});return out;
}
function plansOf(){return (DB.plans||[]).slice().sort(function(a,b){return a.version-b.version;});}
function currentPlan(){
  var at=asOf(),P=plansOf().filter(function(p){return p.effectiveFrom<=at;});return P.length?P[P.length-1]:null;
}
/* Create a plan version from the current state. Returns the previous version unchanged when nothing changed and the
   trigger does not demand a version (setup always does). */
function createPlanVersion(trigger){
  trigger=trigger||{kind:'your edit'};
  var prev=plansOf().slice(-1)[0]||null,snap=_planSnapshot();
  var diff=prev?_planDiff(prev.content,snap):[];
  if(prev&&!diff.length&&trigger.kind!=='setup')return prev;
  var rec={id:uid('plan'),version:prev?prev.version+1:1,createdAt:nowISO(),effectiveFrom:todayISO(),supersedes:prev?prev.id:null,
    content:snap,changes:diff,
    trigger:{kind:trigger.kind||'your edit',reason:trigger.reason||null,evidence:(trigger.evidence||[]).slice(0,8),
      alternatives:(trigger.alternatives||[]).slice(0,6),decisionCode:trigger.decisionCode||null,expected:trigger.expected||null,source:trigger.source||null},
    provenance:{source:'createPlanVersion',goal:'canonicalGoal',targets:'active phase',training:'programStructure',adaptation:'decision lattice'}};
  DB.plans=DB.plans||[];DB.plans.push(rec);
  emitEvent('plan.created',JSON.parse(JSON.stringify(rec)),{at:rec.createdAt});
  _memoInvalidate();save('plan');
  return rec;
}
/* A record that already has a phase but no plan (every record before H1) adopts one, saying so. */
function ensurePlan(){
  if(plansOf().length||!activePhase())return currentPlan();
  return createPlanVersion({kind:'adopted',reason:'Your plan was created from the phase and programme already in place.'});
}
/* Called where the plan's inputs change. The trigger carries the evidence; a decision contributes its own. */
/* Off while a record is being generated or rebuilt: the demo's own interventions fired this mid-generation, so version 1
   captured a half-built state and the next version attributed the rest of the difference to the person's edit. */
var _PLAN_HOOKS_OFF=0;
function notePlanChange(kind,extra){
  if(_PLAN_HOOKS_OFF>0)return null;
  if(typeof _PERSIST_SUSPENDED!=='undefined'&&_PERSIST_SUSPENDED>0&&!(extra&&extra.inFixture))return null;
  if(!activePhase()&&!plansOf().length)return null;
  var t={kind:kind};Object.keys(extra||{}).forEach(function(k){t[k]=extra[k];});
  if(kind==='decision'&&!t.evidence){try{var d=decide();t.decisionCode=d.code;t.reason=t.reason||d.lede||d.verb;
    t.evidence=(d.why?String(d.why).split(/,(?![^(]*\))/):[]).map(function(x){return x.trim();}).filter(Boolean);
    t.alternatives=(d.alternatives||[]).map(function(a){return typeof a==='string'?a:(a.label||a.verb||a.code||JSON.stringify(a));});
    t.expected=d.action||null;}catch(e){}}
  if(_PLAN_TXN){_PLAN_TXN.notes.push(t);return null;}   /* inside changePlan: gathered into its one version */
  return createPlanVersion(t);
}

/* ---- EXECUTION ---- */
function markExecution(date,item,status,opts){
  opts=opts||{};
  if(['skipped','done','variant'].indexOf(status)<0)return {status:'refused',note:'unknown execution status'};
  var rec={id:uid('exe'),date:date,item:item,status:status,variant:opts.variant&&PLAN_VARIANTS[opts.variant]?opts.variant:null,
    reason:opts.reason?String(opts.reason).slice(0,140):null,at:nowISO(),planId:(currentPlan()||{}).id||null};
  DB.executions=DB.executions||[];DB.executions.push(rec);
  emitEvent('execution.marked',JSON.parse(JSON.stringify(rec)),{at:rec.at});_memoInvalidate();save('execution');
  return rec;
}
function _markFor(date,item){var m=(DB.executions||[]).filter(function(x){return x.date===date&&x.item===item;});return m.length?m[m.length-1]:null;}
function intendedFor(date){
  var plan=currentPlan();if(!plan)return {status:'none',note:'No plan yet.',items:[]};
  var items=[],t=plan.content.targets||{};
  var ps=null;try{ps=programStructure();}catch(e){}
  var day=null;if(ps&&ps.status==='ok')ps.mesocycles.forEach(function(ms){(ms.microcycles||[]).forEach(function(mc){(mc.days||[]).forEach(function(d){if(d.date===date)day=d;});});});
  /* The decision engine's own wording for each action, where it has one. */
  var guide={};try{(decide().action||[]).forEach(function(a){if(a&&a.key)guide[a.key]=a.text;});}catch(e){}
  items.push({item:'weigh-in',label:'Weigh in'});
  if(day&&day.planned&&day.planned.kind==='lift'){
    var sets=(day.planned.exercises||[]).reduce(function(a,e){return a+(e.sets||0);},0);
    items.push({item:'training',label:day.planned.label+(guide.training?(' \u2014 '+guide.training):''),plannedSets:sets,variants:Object.keys(PLAN_VARIANTS)});}
  if(day&&day.planned&&day.planned.kind==='cardio')items.push({item:'cardio',label:day.planned.label});
  if(t.kcal)items.push({item:'nutrition',label:guide.calories||(fmtNum(t.kcal,0)+' kcal'),kcal:t.kcal});
  if(t.protein)items.push({item:'protein',label:guide.protein||(t.protein+' g protein'),protein:t.protein});
  if(t.steps)items.push({item:'steps',label:guide.steps||(fmtNum(t.steps,0)+' steps'),steps:t.steps});
  items.push({item:'check-in',label:guide.sleep||'Log sleep and how you feel'});
  return {status:'ok',planId:plan.id,version:plan.version,date:date,items:items};
}
/* MOVED SESSIONS. A session done on Wednesday instead of Tuesday is done, not missed. Within each Monday-to-Sunday week,
   every scheduled training day with no session that day takes a session logged on another day of the week — one whose
   name matches its label first, otherwise the nearest unmatched one — and no session is counted twice. Without this
   the demo's four weeks read almost entirely "not recorded" while 28 sessions sat on other weekdays. */
function _weekTrainingMatch(date){
  var dow=new Date(date+'T12:00:00Z').getUTCDay(),mon=addDays(date,-((dow+6)%7));
  return memo('wtm:'+mon+':'+(DB.sessions||[]).length+':'+plansOf().length,function(){
    var days=[];for(var i=0;i<7;i++)days.push(addDays(mon,i));
    var sched={};days.forEach(function(d){var I=intendedFor(d);var t=(I.items||[]).filter(function(x){return x.item==='training';})[0];if(t)sched[d]=t;});
    var S=(DB.sessions||[]).filter(function(s){return !s.retracted&&!s.supersededBy&&s.date>=days[0]&&s.date<=days[6];});
    var used={},match={};
    Object.keys(sched).forEach(function(d){var same=S.filter(function(s){return s.date===d;});if(same.length){same.forEach(function(s){used[s.id]=1;});match[d]={sessions:same,moved:null};}});
    Object.keys(sched).filter(function(d){return !match[d];}).forEach(function(d){
      var lbl=String(sched[d].label||'').toLowerCase().split(' \u2014 ')[0];
      var free=S.filter(function(s){return !used[s.id]&&!sched[s.date];});
      var byName=free.filter(function(s){return String(s.name||'').toLowerCase()===lbl;})[0];
      var pick=byName||free.sort(function(a,b){return Math.abs(daysBetween(a.date,d))-Math.abs(daysBetween(b.date,d));})[0];
      if(pick){used[pick.id]=1;match[d]={sessions:[pick],moved:pick.date};}});
    return match;});
}
/* Each intended item's execution, from what was logged and what you marked. "unknown" means nothing was recorded \u2014
   it is never read as a failure. "upcoming" is a future or still-open day. */
function executionFor(date){
  var I=intendedFor(date);if(I.status!=='ok')return I;
  var today=todayISO(),open=date>=today;
  var rows=I.items.map(function(it){
    var mk=_markFor(date,it.item),r={item:it.item,label:it.label,status:'unknown',detail:null,variant:mk&&mk.variant||null};
    if(it.item==='training'){
      var _m=_weekTrainingMatch(date)[date];var S=_m?_m.sessions:[];var _moved=_m&&_m.moved;
      var done=S.reduce(function(a,s){return a+(s.sets||[]).filter(function(st){return !st.kind||st.kind==='working';}).length;},0);
      if(mk&&mk.status==='skipped'){r.status='skipped';r.detail=mk.reason||'you marked it skipped';}
      else if(S.length){var share=it.plannedSets?done/it.plannedSets:1;var need=mk&&mk.variant?PLAN_VARIANTS[mk.variant].share:1;
        r.status=(share>=Math.min(0.9,need*0.9))?'done':'partial';r.detail=done+' of '+it.plannedSets+' planned sets'+(mk&&mk.variant?(' ('+PLAN_VARIANTS[mk.variant].label.toLowerCase()+' version)'):'')+
          (_moved?(' \u2014 done on '+dowShort(_moved)+' instead'):'');r.movedTo=_moved||null;}
      else if(mk&&mk.variant==='recovery'&&mk.status==='done'){r.status='done';r.detail='recovery version: mobility instead';}
      else r.status=open?'upcoming':'unknown';
    }else if(it.item==='nutrition'){
      /* The day's calories exactly as the energy model reads them (dailySeries: summed or averaged per SUM_TYPES). */
      var ds=dailySeries('calories',date,1),kc=ds.length?ds[ds.length-1].value:null;
      if(kc==null)r.status=open?'upcoming':'unknown';
      else{var dev=Math.abs(kc-it.kcal)/it.kcal;r.status=dev<=0.1?'done':'partial';r.detail=fmtNum(kc,0)+' kcal logged';
        if(open&&r.status==='partial'&&kc<it.kcal)r.status='in progress';}
    }else if(it.item==='cardio'){
      var cd=obsOf('cardio',{from:date,to:date});
      if(mk&&mk.status==='skipped'){r.status='skipped';r.detail=mk.reason||'you marked it skipped';}
      else if(cd.length){r.status='done';r.detail=fmtNum(cd.reduce(function(a,o){return a+(o.value||0);},0),0)+' min logged';}
      else r.status=open?'upcoming':'unknown';
    }else if(it.item==='protein'){
      var pd=dailySeries('protein',date,1),pv=pd.length?pd[pd.length-1].value:null;
      if(pv==null)r.status=open?'upcoming':'unknown';
      else{r.status=pv>=it.protein*0.9?'done':(open?'in progress':'partial');r.detail=fmtNum(pv,0)+' g logged';}
    }else if(it.item==='check-in'){
      var sl=obsOf('sleep',{from:date,to:date}).length+obsOf('fatigue',{from:date,to:date}).length;
      r.status=sl?'done':(open?'upcoming':'unknown');
    }else if(it.item==='steps'){
      var st=obsOf('steps',{from:date,to:date});
      if(!st.length)r.status=open?'upcoming':'unknown';
      else{var v=st[st.length-1].value;r.status=v>=it.steps*0.95?'done':(open?'in progress':'partial');r.detail=fmtNum(v,0)+' steps';}
    }else if(it.item==='weigh-in'){
      var w=obsOf('weight',{from:date,to:date});r.status=w.length?'done':(open?'upcoming':'unknown');if(w.length)r.detail=fmtWeight(w[w.length-1].value);
    }
    if(mk&&mk.status==='skipped'&&it.item!=='training'){r.status='skipped';r.detail=mk.reason||'you marked it skipped';}
    return r;});
  var next=rows.filter(function(r){return r.status==='upcoming'||r.status==='in progress';})[0]||null;
  return {status:'ok',date:date,planVersion:I.version,rows:rows,next:next};
}
function executionWeek(endDate){
  endDate=endDate||todayISO();var days=[];for(var i=6;i>=0;i--)days.push(addDays(endDate,-i));
  var tally={done:0,partial:0,skipped:0,unknown:0,upcoming:0,'in progress':0},byItem={};
  days.forEach(function(d){var e=executionFor(d);if(e.status!=='ok')return;e.rows.forEach(function(r){tally[r.status]=(tally[r.status]||0)+1;
    var b=byItem[r.item]=byItem[r.item]||{done:0,total:0};if(r.status!=='upcoming'&&r.status!=='in progress'){b.total++;if(r.status==='done')b.done++;}});});
  var judged=tally.done+tally.partial+tally.skipped,known=judged+tally.unknown;
  return {status:'ok',from:days[0],to:endDate,tally:tally,byItem:byItem,doneShare:judged?round(tally.done/judged,2):null,recordedShare:known?round(judged/known,2):null};
}

/* ---- RESPONSE: what the body did, read only when enough of the plan was done to judge it ---- */
function planResponse(endDate){
  var ex=executionWeek(endDate);
  var trend=null;try{trend=weightTrend(14);}catch(e){}
  var st=null;try{st=strengthTrend();}catch(e){}
  var out={status:'ok',cls:'DERIVED',window:{from:ex.from,to:ex.to},execution:{doneShare:ex.doneShare,recordedShare:ex.recordedShare},
    observed:{weightTrendLbPerWeek:trend&&trend.status==='ok'?round(trend.slopePerWeek,2):null,strength:st&&st.status==='ok'?(st.overall||null):null}};
  if(ex.recordedShare!=null&&ex.recordedShare<0.5){out.interpretation='Too little of the week was recorded to judge the plan \u2014 this is missing information, not a failed plan.';out.judged=false;}
  else if(ex.doneShare!=null&&ex.doneShare<0.6){out.interpretation='Less than 60% of the plan was done, so this week says more about the plan fitting your week than about how your body responds to it.';out.judged=false;}
  else if(out.observed.weightTrendLbPerWeek==null){out.interpretation='Not enough weigh-ins yet to read a response.';out.judged=false;}
  else{out.interpretation='The plan was mostly followed, so the trend ('+(out.observed.weightTrendLbPerWeek>0?'+':'')+out.observed.weightTrendLbPerWeek+' lb/week) reflects the plan.';out.judged=true;}
  return out;
}

/* ---- EXPLANATION: why did the plan change? ---- */
var _PLAN_FIELD_LABEL={'goal.type':'goal','goal.activeTargetLb':'target weight','goal.targetDate':'target date','phaseId':'phase','phaseType':'phase type',
  'targets.kcal':'calorie target','targets.protein':'protein target','targets.fiber':'fibre target','targets.steps':'step target','targets.cardioSessions':'cardio sessions',
  'targets.trainingSessions':'training sessions','targets.sleepH':'sleep target','targets.rateLo':'target rate (low)','targets.rateHi':'target rate (high)',
  'training.program':'programme','training.week':'weekly schedule','constraints.trainingDays':'training days','constraints.sessionMinutes':'session length',
  'constraints.equipment':'equipment','constraints.restrictions':'diet restrictions','constraints.cookingTime':'cooking time','constraints.foodBudget':'food budget'};
var _TRIGGER_LABEL={adaptation:'Adapted to what you actually do',setup:'You set it up',adopted:'Created from your existing phase and programme','your edit':'You changed it',decision:'The weekly review recommended it',
  'phase change':'A new phase started','programme change':'You changed the programme','constraint change':'Your circumstances changed'};
function _fmtPlanVal(field,v){
  if(v==null)return 'not set';if(Array.isArray(v))return v.length?v.join(', '):'none';
  if(typeof v==='object')return Object.keys(v).filter(function(k){return v[k];}).map(function(k){return k+' '+v[k];}).join(', ')||'none';
  if(/kcal/.test(field))return fmtNum(v,0)+' kcal';if(/steps/.test(field))return fmtNum(v,0);if(/TargetLb/.test(field))return fmtWeight(v);return String(v);
}
function explainPlanChange(planId){
  var P=plansOf(),p=planId?P.filter(function(x){return x.id===planId;})[0]:P[P.length-1];
  if(!p)return {status:'none',note:'No plan yet.'};
  return {status:'ok',version:p.version,date:p.effectiveFrom,
    headline:(_TRIGGER_LABEL[p.trigger.kind]||p.trigger.kind)+(p.version>1&&p.changes.length?(': '+p.changes.map(function(c){return _PLAN_FIELD_LABEL[c.field]||c.field;}).slice(0,3).join(', ')):''),
    changes:p.changes.map(function(c){return {what:_PLAN_FIELD_LABEL[c.field]||c.field,from:_fmtPlanVal(c.field,c.from),to:_fmtPlanVal(c.field,c.to)};}),
    trigger:p.trigger.kind,reason:p.trigger.reason,evidence:p.trigger.evidence,alternatives:p.trigger.alternatives,expected:p.trigger.expected,
    provenance:p.provenance};
}
var NEXT_ACTION_FOR={training:['Start today\u2019s workout','workout.start'],cardio:['Log cardio','log.open','cardio'],nutrition:['Log food','nav.tab','food'],
  protein:['Log food','nav.tab','food'],steps:['Log steps','log.open','steps'],'weigh-in':['Weigh in','log.open','weight'],'check-in':['Log sleep and how you feel','log.open','recovery']};
/* The one next thing to do today, with its reason. */
function nextAction(){
  var e=executionFor(todayISO());if(e.status!=='ok')return {status:'none',label:'Set up your plan',act:'nav.welcome',why:'There is no plan yet.'};
  /* A workout already under way is the next thing, before anything else. */
  try{var dr=JSON.parse(localStorage.getItem('physiqueOS_workout_draft')||'null');
    if(dr&&dr.date===todayISO()){var dn=dr.exercises.reduce(function(a,x){return a+x.sets.filter(function(s){return s.done;}).length;},0),tt=dr.exercises.reduce(function(a,x){return a+x.sets.length;},0);
      return {status:'ok',item:'training',label:'Resume your workout',act:'workout.resume',arg:null,why:dr.label+' \u2014 '+dn+' of '+tt+' sets done'};}}catch(er){}
  var n=e.next;if(!n)return {status:'ok',label:'Today\u2019s plan is done',act:null,why:'Everything planned for today is recorded.'};
  var map=NEXT_ACTION_FOR;
  var m=map[n.item]||['Open the log','log.open'];
  return {status:'ok',item:n.item,label:m[0],act:m[1],arg:m[2]||null,why:n.label+(n.detail?(' \u2014 so far '+n.detail):'')};
}
function planAudit(){
  var issues=[];plansOf().forEach(function(p,i,arr){
    if(i>0&&p.supersedes!==arr[i-1].id)issues.push('plan v'+p.version+' does not supersede v'+arr[i-1].version);
    if(p.version!==i+1)issues.push('plan versions are not contiguous at v'+p.version);
    if(!p.trigger||!p.trigger.kind)issues.push('plan v'+p.version+' records no trigger');
    if(i>0&&!p.changes.length&&p.trigger.kind!=='setup')issues.push('plan v'+p.version+' changed nothing');});
  if(activePhase()&&!plansOf().length)issues.push('an active phase with no plan');
  return {ok:issues.length===0,issues:issues,versions:plansOf().length};
}

/* ---- FOOD CONSTRAINTS: diet restrictions applied to what the app suggests ----
   Matched on food category and name. A match is not a certification: labels still need checking, and kosher in
   particular involves more than ingredients (preparation and the separation of meat and dairy). */
var _MEAT=/\b(chicken|beef|pork|veal|lamb|mutton|turkey|duck|goose|venison|bison|bacon|ham|sausage|salami|pepperoni|prosciutto|jerky|meatball|hot dog|frankfurter|gelatin|lard)\b/i;
var _FISH=/\b(fish|tuna|salmon|cod|tilapia|trout|sardine|anchov|mackerel|halibut|haddock|pollock|shrimp|prawn|crab|lobster|clam|mussel|oyster|scallop|squid|octopus)\b/i;
var _SHELLFISH=/\b(shrimp|prawn|crab|lobster|clam|mussel|oyster|scallop|squid|octopus|crawfish)\b/i;
var _DAIRY=/\b(milk|cheese|yogurt|yoghurt|whey|casein|butter|cream|ghee|kefir|curd|custard|ice cream)\b/i;
var _PLANT_DAIRY=/\b(peanut|almond|cashew|soy|soya|oat|coconut|rice|hemp|pea|sunflower)\s+(butter|milk|yogurt|yoghurt|cheese|cream)\b|cocoa butter|apple butter/i;
var _EGG=/\beggs?\b|\bmayonnaise\b/i;
var _GLUTEN=/\b(wheat|bread|pasta|spaghetti|macaroni|noodle|barley|rye|couscous|bagel|bulgur|semolina|seitan|cracker|croissant|muffin|pancake|waffle|flour tortilla|pretzel|cereal)\b/i;
var _GLUTEN_OK=/gluten[- ]free|corn tortilla|rice noodle|\brice\b|\boat(s|meal)?\b|quinoa|buckwheat/i;
var _NUTS=/\b(almond|cashew|walnut|pecan|pistachio|hazelnut|macadamia|peanut|brazil nut|pine nut|nut butter|mixed nuts|praline|marzipan)\b/i;
var _PORK=/\b(pork|bacon|ham|lard|prosciutto|pepperoni|salami|chorizo|pancetta)\b/i;
var _ALCOHOL=/\b(wine|beer|liquor|rum|vodka|whisk(e)?y|gin|brandy|liqueur|sake)\b/i;
var DIET_RULES={
  vegetarian:function(t,c){return !(_MEAT.test(t)||_FISH.test(t)||/Poultry|Beef|Pork|Finfish|Shellfish|Lamb|Veal|Game|Sausages|Luncheon/.test(c));},
  vegan:function(t,c){if(!DIET_RULES.vegetarian(t,c))return false;if(_EGG.test(t)||/\bhoney\b/i.test(t))return false;
    if(_DAIRY.test(t)&&!_PLANT_DAIRY.test(t))return false;return !/Dairy and Egg/.test(c)||_PLANT_DAIRY.test(t);},
  'dairy-free':function(t,c){return !(_DAIRY.test(t)&&!_PLANT_DAIRY.test(t));},
  'gluten-free':function(t,c){return !_GLUTEN.test(t)||_GLUTEN_OK.test(t);},
  'nut-free':function(t,c){return !_NUTS.test(t);},
  halal:function(t,c){return !(_PORK.test(t)||_ALCOHOL.test(t)||/Pork Products/.test(c));},
  kosher:function(t,c){return !(_PORK.test(t)||_SHELLFISH.test(t)||/Pork Products/.test(c));}
};
function foodAllowed(food,restrictions){
  if(!restrictions||!restrictions.length||!food)return true;
  var t=String(food.name||'')+' '+String(food.brand||''),c=String(food.category||'');
  return restrictions.every(function(r){return !DIET_RULES[r]||DIET_RULES[r](t,c);});
}

/* ---- FEASIBILITY: does the plan fit the person? Checked before asking anyone to follow it (MK W17). ---- */
function _sessionMinutesEstimate(planned){
  var sets=(planned.exercises||[]).reduce(function(a,e){return a+(e.sets||0);},0);
  return Math.round(8+sets*2.5);   /* warm-up, then about two and a half minutes per set with its rest */
}
function planFeasibility(){
  var plan=currentPlan();if(!plan)return {status:'none',conflicts:[]};
  var C=constraintModel(),conflicts=[];
  var ps=null;try{ps=programStructure();}catch(e){}
  var days=[];if(ps&&ps.status==='ok'){var mc=ps.mesocycles[0].microcycles;days=(mc[mc.length-1]||{}).days||[];}
  var have=C.equipment.length?C.equipment:null;
  var seenEx={};
  days.forEach(function(d){var p=d.planned;if(!p||p.kind==='rest')return;
    var _SM=typeof scheduleModel==='function'?scheduleModel():{mode:'weekly'};
    if(_SM.mode==='weekly'&&C.trainingDays.length&&C.trainingDays.indexOf(d.dow)<0)
      conflicts.push({kind:'day',what:p.label+' is on '+d.dow+', which is not one of your training days',fix:'Move it in the programme editor, or add '+d.dow+' to your training days.'});
    var _lim=_SM.mode==='rotation'?(_SM.minutes.full||C.sessionMinutes):C.sessionMinutes;
    if(p.kind==='lift'&&_lim){var est=_sessionMinutesEstimate(p);C.sessionMinutes=_lim;
      if(est>_lim*1.1)conflicts.push({kind:'time',what:p.label+' takes about '+est+' minutes; you have '+C.sessionMinutes,fix:'Use the reduced version on busy days, or trim the accessories.'});}
    if(have)(p.exercises||[]).forEach(function(x){if(seenEx[x.name])return;seenEx[x.name]=1;var e=resolveExercise(x.name);
      if(e&&!equipPossible(e.equipment,have))conflicts.push({kind:'equipment',what:x.name+' needs '+e.equipment.join(' and ')+', which you have not listed',fix:'Swap it for a version that fits your equipment (Train \u2192 exercise library).'});});
  });
  return {status:'ok',ok:conflicts.length===0,conflicts:conflicts,
    note:conflicts.length?'The plan asks for something your circumstances do not allow. It is shown here rather than left for you to discover mid-session.':'The plan fits the constraints you have given.'};
}

/* ---- THE PLAN'S SIGNALS, in the one attention queue ---- */
function planAttentionItems(){
  var out=[],plan=currentPlan();
  try{var u=(typeof unsavedAtClose==='function')?unsavedAtClose():null;
    if(u)out.push({id:'lost-saves',severity:'action',what:'Your last '+(u.missing===1?'change':u.missing+' changes')+' before the app closed may not have been saved',
      why:'Storage did not have them when the app reopened.',cando:'Check your latest entries',act:'nav.tab',arg:'log',tab:'log'});}catch(e){}
  try{var LR=(DB.settings.cloud||{}).lastReset;if(LR&&daysBetween(localDateOf(LR.at),todayISO())<=7)out.push({id:'sync-reset:'+LR.at,severity:'review',
    what:'The sync server lost its data and was refilled from this device',why:'It sent '+LR.resent+' changes again. Free hosting wipes files on restart; a persistent disk stops this. Other devices need re-adding from this one.',cando:'Sync settings',act:'nav.cloud',tab:'tools'});}catch(e){}
  try{if(typeof possibleDuplicateWorkouts==='function')possibleDuplicateWorkouts().slice(0,3).forEach(function(d){out.push({id:'dup:'+d.imported.id,severity:'review',
    what:'The same workout twice? '+d.imported.value+' min ('+sourceLabel(sourceKeyOf(d.imported))+') and '+d.manual.value+' min (logged by you) on '+shortDate(d.imported.date),
    why:'Counting both would double that day\u2019s cardio. Keep the imported one, or keep both if they were different workouts.',cando:'Keep the imported one',act:'dup.keepImported',arg:d.imported.id,tab:'today'});});}catch(e){}
  try{var CS=phaseCriteriaStatus();if(CS.status==='ok'){CS.stop.filter(function(r){return r.state==='met';}).forEach(function(r){out.push({id:'crit-stop:'+CS.phase+':'+r.id,severity:'action',what:'A stop rule for this phase is met: '+r.label,why:r.why+'. Review the phase before continuing.',cando:'See the criteria',act:'nav.tab',arg:'plan',tab:'plan',section:'plan-criteria'});});
    CS.success.concat(CS.transition).filter(function(r){return r.state==='met';}).slice(0,2).forEach(function(r){out.push({id:'crit:'+CS.phase+':'+r.id,severity:'review',what:'Phase milestone: '+r.label,why:r.why+'.',cando:'See the criteria',act:'nav.tab',arg:'plan',tab:'plan',section:'plan-criteria'});});}}catch(e){}
  /* acute recovery: today's readings, acted on today (works from the first day; needs no baseline) */
  try{var AC=acuteRecovery(todayISO());if(AC.flag)out.push({id:'acute-recovery:'+todayISO(),severity:'safety',what:(AC.level==='poor'?'Rest or go very light today':'Go lighter today')+': '+AC.reasons.join(', '),
    why:AC.advice.charAt(0).toUpperCase()+AC.advice.slice(1)+'. '+AC.basis+'.',cando:'See recovery',act:'nav.tab',arg:'body',tab:'body'});}catch(e){}
  if(!plan)return out;
  var F=planFeasibility();
  if(F.status==='ok'&&!F.ok)out.push({id:'plan-fit',severity:'action',what:'Your plan does not fit your circumstances ('+F.conflicts.length+')',
    why:F.conflicts[0].what+'.',cando:'See how to fix it',act:'nav.tab',arg:'plan',tab:'plan'});
  var P=plansOf(),last=P[P.length-1];
  if(last&&last.version>1&&daysBetween(last.effectiveFrom,todayISO())<=3){var X=explainPlanChange(last.id);
    out.push({id:'plan-changed:'+last.version,severity:'review',what:'Your plan changed: '+X.changes.map(function(c){return c.what;}).slice(0,3).join(', '),
      why:X.reason||'See the evidence behind it.',cando:'See why',act:'nav.tab',arg:'plan',tab:'plan',section:'plan-history',detail:X.changes});}
  try{var AP=adaptationProposals();if(AP.proposals.length)out.push({id:'adapt:'+AP.proposals[0].id,severity:'review',what:'Your plan could fit you better: '+AP.proposals[0].title.toLowerCase(),
    why:AP.proposals[0].why,cando:'See the suggestion',act:'nav.tab',arg:'plan',tab:'plan'});}catch(e){}
  var C=constraintModel(),key=C.missing.filter(function(m){return m==='training days'||m==='session length';});
  if(key.length)out.push({id:'plan-constraints',severity:'review',what:'The plan would fit better knowing your '+key.join(' and '),
    why:'Without them the plan cannot check that sessions fit your week.',cando:'Add them',act:'nav.welcome',arg:'3',tab:'plan'});
  return out;
}

/* ---- COOKING TIME AND BUDGET in meal selection. Food records carry no preparation time or price, so both are
   judged: preparation from name and category (reliable enough to filter on), cost from rough category tiers (only good
   enough to FAVOUR staples, never to exclude). The app says which is which. ---- */
function foodPrep(food){
  var t=String(food&&food.name||'').toLowerCase(),c=String(food&&food.category||'');
  if(/canned|cooked|boiled|baked|roasted|grilled|fried|steamed|ready-to-eat|prepared|frozen dinner/.test(t))return 'none';
  if(/(beans|lentils|peas|chickpeas|mature seeds).*(raw|dry|dried)|(raw|dry|dried).*(beans|lentils|chickpeas)|brown rice|wild rice|barley|farro|bulgur|split peas/.test(t)||(/Legumes/.test(c)&&/raw|mature seeds/.test(t)))return 'long';
  if(/Poultry|Beef|Pork|Finfish|Shellfish|Lamb|Veal|Game|Sausages/.test(c)&&/\braw\b/.test(t))return 'quick';
  if(/\b(chicken|beef|pork|turkey|salmon|tuna steak|cod|shrimp)\b/.test(t)&&/\braw\b/.test(t))return 'quick';
  if(/\beggs?\b.*\braw\b|\braw\b.*\beggs?\b|pasta.*(dry|uncooked)|spaghetti.*dry|macaroni.*dry|rice.*white.*(raw|uncooked)|oats|oatmeal.*dry|couscous.*dry/.test(t))return 'quick';
  if(/Cereal Grains and Pasta/.test(c)&&/raw|dry|uncooked/.test(t))return 'quick';
  return 'none';
}
var _PREP_ALLOWED={none:['none'],quick:['none','quick'],normal:['none','quick','long']};
function prepAllowed(food,cookingTime){return !cookingTime||(_PREP_ALLOWED[cookingTime]||_PREP_ALLOWED.normal).indexOf(foodPrep(food))>=0;}
function foodCostTier(food){
  var t=String(food&&food.name||'').toLowerCase(),c=String(food&&food.category||'');
  if(/Finfish|Shellfish/.test(c)||/\b(salmon|shrimp|scallop|lobster|crab|steak|tenderloin|sirloin|ribeye|filet|macadamia|pistachio|pine nut|cashew|protein bar|energy bar|whey|jerky|prosciutto)\b/.test(t))return 3;
  if(/\b(oats|oatmeal|rice|pasta|spaghetti|macaroni|beans|lentils|chickpeas|split peas|eggs?|milk|potato|banana|cabbage|carrot|onion|peanut butter|bread|flour|chicken thigh|whole chicken|frozen)\b/.test(t))return 1;
  return 2;
}
function budgetFactor(food,budget){var tier=foodCostTier(food);
  if(budget==='tight')return tier===3?0.5:(tier===1?1.25:1);
  if(budget==='moderate')return tier===3?0.8:1;
  return 1;
}

/* ============================================================================
   ADAPTIVE INTEGRATION (H3)
   What a person actually does, and how their body responds, can change the plan \u2014 traceably. Adherence is read
   first and diagnosed without blame: a day that never fits the week, a plan too big to finish, too little recorded
   to say, a recent change, or a plan that fits. Proposals follow from the diagnosis, each with its evidence, the
   alternatives weighed and its trade-offs, and nothing changes until the person accepts. An accepted proposal becomes
   a plan version recorded as an adaptation, and after a week it reports what happened since.
   ============================================================================ */
function adherenceAnalysis(weeks){
  weeks=weeks||4;var end=addDays(todayISO(),-1),start=addDays(end,-(weeks*7-1));
  var tr={scheduled:0,done:0,partial:0,skipped:0,unknown:0,setsPlanned:0,setsDone:0,missByDow:{},schedByDow:{},moved:0},
      nu={days:0,logged:0,within:0,over:0},stp={days:0,logged:0,met:0},recent={sched:0,done:0},prior={sched:0,done:0};
  var _SM2=typeof scheduleModel==='function'?scheduleModel():{mode:'weekly'};
  for(var d=start;d<=end;d=addDays(d,1)){var E=executionFor(d);if(E.status!=='ok')continue;
    /* in a rotation, weekday names mean nothing; misses are grouped by shift context instead */
    var dw=_SM2.mode==='rotation'?(function(){var sh=shiftOn(d,_SM2);return sh?SHIFT_LABELS[sh]:dowShort(d);})():dowShort(d),isRecent=d>addDays(end,-7);
    E.rows.forEach(function(r){
      if(r.item==='training'){tr.scheduled++;tr.schedByDow[dw]=(tr.schedByDow[dw]||0)+1;
        (isRecent?recent:prior).sched++;
        if(r.status==='done'||r.status==='partial'){if(r.status==='done')tr.done++;else tr.partial++;(isRecent?recent:prior).done++;
          var m=String(r.detail||'').match(/^(\d+) of (\d+)/);if(m){tr.setsDone+=+m[1];tr.setsPlanned+=+m[2];}if(r.movedTo)tr.moved++;}
        else{if(r.status==='skipped')tr.skipped++;else tr.unknown++;tr.missByDow[dw]=(tr.missByDow[dw]||0)+1;}}
      if(r.item==='nutrition'){nu.days++;if(r.status!=='unknown'){nu.logged++;if(r.status==='done')nu.within++;else if(/kcal/.test(r.detail||'')){var k=parseFloat(String(r.detail).replace(/,/g,''));var t=(currentPlan()||{content:{targets:{}}}).content.targets.kcal;if(t&&k>t*1.1)nu.over++;}}}
      if(r.item==='steps'){stp.days++;if(r.status!=='unknown'){stp.logged++;if(r.status==='done')stp.met++;}}
    });}
  var out={status:'ok',window:{from:start,to:end,weeks:weeks},training:null,nutrition:null,steps:null};
  if(tr.scheduled){var att=(tr.done+tr.partial)/tr.scheduled,vol=tr.setsPlanned?tr.setsDone/tr.setsPlanned:null;
    var worst=Object.keys(tr.missByDow).sort(function(a,b){return tr.missByDow[b]-tr.missByDow[a];})[0];
    var worstRate=worst?tr.missByDow[worst]/(tr.schedByDow[worst]||1):0;
    var diag='fits',why='';
    if(tr.done+tr.partial===0&&tr.skipped===0){diag='not enough recorded';why='No sessions were recorded against the plan, so it cannot be judged.';}
    else if(worst&&worstRate>=0.75&&tr.missByDow[worst]>=2){diag='does not fit the week';why='The '+worst+' session was missed in '+tr.missByDow[worst]+' of '+tr.schedByDow[worst]+' weeks.';}
    else if(vol!=null&&vol<0.7&&att>=0.6){diag='too demanding';why='Sessions happen, but at '+Math.round(vol*100)+'% of the planned sets.';}
    else if(prior.sched&&recent.sched&&prior.done/prior.sched>=0.7&&recent.done/recent.sched<0.4){diag='recent change';why='Last week fell well below the three before it \u2014 something may have changed.';}
    else if(att<0.6){diag='too demanding';why='Only '+Math.round(att*100)+'% of scheduled sessions were done.';}
    else why='Most scheduled sessions were done at close to the planned volume.';
    out.training={diagnosis:diag,why:why,attended:round(att,2),volumeShare:vol!=null?round(vol,2):null,missedDay:worst||null,missedDayRate:round(worstRate,2),moved:tr.moved,counts:tr};}
  if(nu.days){out.nutrition={diagnosis:nu.logged<nu.days*0.5?'not enough recorded':(nu.over>=nu.logged*0.6?'too demanding':'fits'),logged:nu.logged,of:nu.days,within:nu.within,over:nu.over};}
  if(stp.days){out.steps={diagnosis:stp.logged<stp.days*0.5?'not enough recorded':(stp.met<stp.logged*0.5?'too demanding':'fits'),logged:stp.logged,of:stp.days,met:stp.met};}
  return out;
}
function _daysOf(key){var P=programDef(key)||{};return Object.keys(P.days||{}).filter(function(d){return P.days[d]&&P.days[d].kind==='lift';});}
function adaptationProposals(){
  var A=adherenceAnalysis(4),plan=currentPlan();if(!plan)return {status:'none',proposals:[],analysis:A};
  var out=[],dismissed=(DB.settings.dismissedAdaptations||{});
  var push=function(p){var d=dismissed[p.id];if(d&&daysBetween(d,todayISO())<14)return;out.push(p);};
  var T=A.training,cur=trainingProgram().key,curDays=_daysOf(cur).length;
  var _SM3=typeof scheduleModel==='function'?scheduleModel():{mode:'weekly'};
  if(_SM3.mode==='rotation'&&T&&T.diagnosis==='does not fit the week'&&T.missedDay&&/shift/i.test(T.missedDay)){
    var shk=Object.keys(SHIFT_LABELS).filter(function(k){return SHIFT_LABELS[k]===T.missedDay;})[0];
    if(shk&&_SM3.rules[shk]!=='none')push({id:'shift-rule:'+shk,domain:'training',title:'Stop scheduling sessions on '+T.missedDay.toLowerCase()+' days',
      change:{kind:'shiftRule',shift:shk,from:_SM3.rules[shk],to:'none'},why:T.why,evidence:['Sessions on '+T.missedDay.toLowerCase()+' days were missed in '+T.counts.missByDow[T.missedDay]+' of '+T.counts.schedByDow[T.missedDay]],
      alternatives:[{label:'Make them short sessions instead',why:'keeps the habit, but these were missed even so'},{label:'Keep scheduling them',why:'the pattern has held for four weeks'}],
      expected:'Sessions land on the days you actually have; the programme places them on your days off instead.',tradeoff:'Fewer sessions in a stretch of shifts.',confidence:'medium'});
  }
  if(_SM3.mode==='weekly'&&T&&(T.diagnosis==='does not fit the week'||T.diagnosis==='too demanding')){
    var fewer=Object.keys(PROGRAMS).filter(function(k){var n=_daysOf(k).length;return n>0&&n<curDays;}).sort(function(a,b){return _daysOf(b).length-_daysOf(a).length;})[0];
    var ev=['Scheduled '+T.counts.scheduled+' sessions in 4 weeks; done '+(T.counts.done+T.counts.partial)+(T.moved?' ('+T.moved+' on a different day)':''),
      T.volumeShare!=null?'Sets done: '+Math.round(T.volumeShare*100)+'% of those planned':null,
      T.missedDay?T.missedDay+' was missed in '+T.counts.missByDow[T.missedDay]+' of '+T.counts.schedByDow[T.missedDay]+' weeks':null].filter(Boolean);
    if(fewer)push({id:'fewer-days:'+cur+'>'+fewer,domain:'training',title:'Train '+_daysOf(fewer).length+' days a week instead of '+curDays,
      change:{kind:'program',from:cur,to:fewer,fromLabel:(PROGRAMS[cur]||{}).label,toLabel:(PROGRAMS[fewer]||{}).label},why:T.why,evidence:ev,
      alternatives:[{label:'Keep '+curDays+' days and use the reduced version',why:'keeps the schedule but not the volume you are managing now'},
        {label:'Keep the plan as it is',why:'the pattern has held for four weeks, so waiting is unlikely to change it'}],
      expected:'More of the plan done as written; total weekly volume closer to what you already do, so progress should hold.',
      tradeoff:'Fewer weekly sessions per muscle group than the '+curDays+'-day plan.',confidence:T.counts.scheduled>=12?'medium':'low'});
  }
  var N=A.nutrition,S=A.steps,t=plan.content.targets||{};
  if(S&&S.diagnosis==='too demanding'&&t.steps){var got=obsOf('steps',{from:A.window.from}).map(function(o){return o.value;});var med=got.length?got.slice().sort(function(a,b){return a-b;})[Math.floor(got.length/2)]:null;
    if(med&&med<t.steps){var to=Math.round(Math.max(med*1.1,5000)/500)*500;
      push({id:'steps:'+t.steps+'>'+to,domain:'activity',title:'Set the step target to '+fmtNum(to,0),change:{kind:'target',field:'stepTarget',from:t.steps,to:to},
        why:'The target was met on '+S.met+' of '+S.logged+' recorded days; your typical day is about '+fmtNum(med,0)+' steps.',
        evidence:['Median '+fmtNum(med,0)+' steps over '+S.logged+' recorded days','Target met on '+S.met+' days'],
        alternatives:[{label:'Keep '+fmtNum(t.steps,0),why:'a target missed most days tends to be ignored rather than approached'}],
        expected:'A target you meet most days, set about 10% above what you already do.',tradeoff:'Fewer calories spent from walking than the old target assumed; the energy model reads the steps you actually take.',
        confidence:S.logged>=14?'medium':'low'});}}
  return {status:'ok',proposals:out,analysis:A};
}
function applyAdaptation(id){
  var P=adaptationProposals().proposals.filter(function(p){return p.id===id;})[0];if(!P)return {status:'refused',note:'That suggestion no longer applies.'};
  _PLAN_HOOKS_OFF++;
  try{if(P.change.kind==='program')setProgram(P.change.to,{source:'adaptation'});
    else if(P.change.kind==='shiftRule'){var rr={};rr[P.change.shift]=P.change.to;DB.settings.schedule=Object.assign({},DB.settings.schedule||{},{rules:Object.assign({},(DB.settings.schedule||{}).rules||{},rr)});_memoInvalidate();save('settings');}
    else if(P.change.kind==='target'){var ph=activePhase();var patch={};patch[P.change.field]=P.change.to;updatePhase(ph.id,patch,{noUndo:false,intervention:false,label:'apply intervention'});}}
  finally{_PLAN_HOOKS_OFF=Math.max(0,_PLAN_HOOKS_OFF-1);}
  var v=createPlanVersion({kind:'adaptation',reason:P.title+'. '+P.why,evidence:P.evidence,
    alternatives:P.alternatives.map(function(a){return a.label+' \u2014 '+a.why;}),expected:P.expected+' Trade-off: '+P.tradeoff});
  v.adaptation={proposal:P.id,domain:P.domain,change:P.change,confidence:P.confidence};save('plan');
  return {status:'ok',version:v.version,plan:v};
}
function dismissAdaptation(id){DB.settings.dismissedAdaptations=DB.settings.dismissedAdaptations||{};DB.settings.dismissedAdaptations[id]=todayISO();save('settings');}
/* After a week, an adaptation reports what happened since: the share of the plan done before and after. */
function adaptationOutcome(planId){
  var v=plansOf().filter(function(p){return p.id===planId;})[0];if(!v||!v.adaptation)return {status:'none'};
  var since=daysBetween(v.effectiveFrom,todayISO());if(since<7)return {status:'pending',note:'Too early \u2014 '+(7-since)+' more day'+(7-since===1?'':'s')+' before the change can be read.'};
  var before=executionWeek(addDays(v.effectiveFrom,-1)),after=executionWeek(addDays(todayISO(),-1));
  return {status:'ok',cls:'DERIVED',before:before.doneShare,after:after.doneShare,
    note:before.doneShare!=null&&after.doneShare!=null?('Done as planned: '+Math.round(before.doneShare*100)+'% the week before the change, '+Math.round(after.doneShare*100)+'% the last week.'):'Not enough recorded on one side to compare.'};
}
function adaptationsOf(){return plansOf().filter(function(p){return !!p.adaptation;});}
/* ============================================================================
   USER-APPROVED AUTOMATION (Stage H; TRANSITION item 13). Section 213 rules out "automation that changes important state
   without policy and audit". Every automated action has an approval level, and none runs without both the approval its
   level needs and an entry in the audit log:
   - view: changes nothing (opens a screen). It runs.
   - routine: adds a small record that can be undone (supplements taken, a glass of water). It runs under the standing
     approval recorded when the rule was turned on; turning the rule off withdraws it.
   - important: changes the plan, a target, the programme or the profile, or deletes. It never runs on a trigger. The
     trigger holds a proposal, applied only when it is approved, through the plan's own authority (changePlan); a decline
     is kept as well.
   An action with no declared level is important. Every decision (ran, held, approved, applied, declined, refused, an
   approval granted or withdrawn) goes to the audit log with the rule, the level and the approval it rests on.
   ============================================================================ */
var AUTOMATION_POLICY={'nav.today':'view','supp.logStack':'routine','qa.water':'routine','adapt.apply':'important'};
var AUTOMATION_LEVEL_TEXT={view:'changes nothing',routine:'adds a record you can undo; runs under your standing approval',important:'changes your plan; each one waits for your approval'};
function automationLevel(action){return AUTOMATION_POLICY[action]||'important';}
function _autoAudit(kind,detail){if(typeof auditAppend==='function')auditAppend('automation.'+kind,detail);}
function setAutomationApproval(ruleId,action,on){var A=DB.settings.automationApprovals=Object.assign({},DB.settings.automationApprovals||{}),lv=automationLevel(action);
  if(on&&lv!=='important'){A[ruleId]={level:lv,grantedAt:nowISO(),scope:'each time the rule fires, at most once a day'};_autoAudit('approval-granted',{rule:ruleId,level:lv});}
  else if(!on&&A[ruleId]){delete A[ruleId];_autoAudit('approval-withdrawn',{rule:ruleId,level:lv});}
  return A[ruleId]||null;}
/* what a rule may do when it fires: a pure decision, testable without running anything */
function automationDecision(rule){var lv=automationLevel(rule.action),ap=(DB.settings.automationApprovals||{})[rule.id]||null;
  if(lv==='view')return {run:true,level:lv,approval:null,why:'it changes nothing'};
  if(lv==='routine')return ap&&ap.level==='routine'?{run:true,level:lv,approval:ap.grantedAt,why:'your standing approval of '+String(ap.grantedAt).slice(0,10)}:{run:false,level:lv,approval:null,why:'no standing approval for this rule'};
  return {run:false,hold:true,level:lv,approval:null,why:'a change to the plan waits for your approval each time'};}
/* the proposal an important action would make now */
function automationProposal(action){if(action==='adapt.apply'){var A=(adaptationProposals().proposals||[])[0];return A?{arg:A.id,title:A.title,why:A.why,expected:A.expected}:null;}return null;}
function automationPending(){return (DB.settings.automationPending||[]).filter(function(p){return p.status==='waiting';});}
function holdAutomation(rule,proposal){if(!proposal)return null;var L=DB.settings.automationPending=(DB.settings.automationPending||[]).slice();
  if(L.some(function(p){return p.status==='waiting'&&p.rule===rule.id&&p.arg===proposal.arg;}))return null;
  var rec={id:uid('auto'),rule:rule.id,action:rule.action,arg:proposal.arg,title:proposal.title,why:proposal.why||'',expected:proposal.expected||'',heldAt:nowISO(),status:'waiting'};
  L.push(rec);_autoAudit('held',{rule:rule.id,action:rule.action,arg:proposal.arg,level:'important',pending:rec.id});return rec;}
/* the person's answer to a held change; the interface applies an approved one through the action's own path */
function resolveAutomation(id,approve){var P=(DB.settings.automationPending||[]).filter(function(p){return p.id===id;})[0];if(!P||P.status!=='waiting')return {status:'refused',note:'nothing is waiting with that id'};
  P.status=approve?'approved':'declined';P.resolvedAt=nowISO();_autoAudit(approve?'approved':'declined',{rule:P.rule,action:P.action,arg:P.arg,level:'important',pending:P.id});return {status:'ok',pending:P};}
function automationHistory(n){return (typeof auditLog==='function'?auditLog(200):[]).filter(function(e){return /^automation\./.test(e.kind);}).slice(0,n||8);}
/* Recovery shapes today's session when the evidence is there: a below-baseline reading suggests the reduced version. */
function recoverySuggestion(){
  var r=null;try{r=recoveryLatentState();}catch(e){}
  if(!r||r.status!=='ok'||!/less recovered/.test(String(r.band||'')))return null;
  var I=intendedFor(todayISO());if(!(I.items||[]).some(function(x){return x.item==='training';}))return null;
  return {suggest:'reduced',why:'Recovery reads '+r.band+' today, from '+((r.stressorState&&r.stressorState.loadBasis)||'recent training load')+' and what you logged.',cls:r.cls};
}
/* ============================================================================
   THE PLAN AUTHORITY (audit A-004): every user-facing change to the plan \u2014 targets, schedule, programme, a phase
   starting or ending, an experiment, a decision, an adaptation, an optimiser choice \u2014 goes through changePlan. The
   underlying mutators still do the work; their version notes are gathered into exactly one plan version, which carries
   the change's reason and, for an adaptive change, its expected outcome (rule 7). tests/authority.mjs fails on a
   user-facing call to an underlying mutator outside changePlan (its list of mutators lives in that check).
   ============================================================================ */
var _PLAN_TXN=null,PLAN_ADAPTIVE_SOURCES={decision:1,adaptation:1,optimiser:1,experiment:1};
function changePlan(c){if(!c||typeof c.apply!=='function')throw new Error('changePlan needs the change to apply');
  if(!c.reason)throw new Error('changePlan: a plan change states its reason (rule 7)');
  if(PLAN_ADAPTIVE_SOURCES[c.source]&&(c.expected==null||c.expected===''))throw new Error('changePlan: an adaptive change ('+c.source+') states its expected outcome (rule 7)');
  if(_PLAN_TXN)return {result:c.apply(),version:null,nested:true};   /* part of an outer change */
  _PLAN_TXN={notes:[]};var result,ok=false,notes;
  try{result=c.apply();ok=true;}finally{notes=_PLAN_TXN.notes;_PLAN_TXN=null;}
  /* whether there is a new version is decided by the plan itself (createPlanVersion compares the content), not by
     whether the mutators left notes: they record nothing while persistence is suspended, and only add evidence here */
  var v=null;if(ok&&_PLAN_HOOKS_OFF<=0&&(activePhase()||plansOf().length)){var ev=[];notes.forEach(function(n){(n.evidence||[]).forEach(function(e){if(ev.indexOf(e)<0)ev.push(e);});});
    var dn=notes.filter(function(n){return n.decisionCode;})[0],prev=plansOf().slice(-1)[0]||null;
    /* the first plan is the setup version whatever path made it, and keeps the reason its mutator gave */
    var first=!prev,setupNote=notes.filter(function(n){return n.kind==='setup';})[0];
    var made=createPlanVersion({kind:first?'setup':(c.kind||(notes[0]&&notes[0].kind)||'your edit'),reason:first&&setupNote&&setupNote.reason?setupNote.reason:c.reason,evidence:ev,alternatives:c.alternatives||(dn&&dn.alternatives)||[],decisionCode:c.decisionCode||(dn&&dn.decisionCode)||null,expected:c.expected,source:c.source||null});
    v=made&&(!prev||made.id!==prev.id)?made:null;}
  return {result:result,version:v};}
