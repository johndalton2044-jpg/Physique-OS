/* ============================================================================
   REGION: SKILL GRAPH AND SESSION COMPOSITION (catalogue §4, §12, §14)

   Two things the rest of the movement engine was missing.

   §4 asks for progression FAMILIES with prerequisites and mastery criteria, and — the part that makes it
   useful rather than decorative — an explicit answer to what is holding you at your current step. "You are
   strong enough but cannot balance" is actionable; "next: handstand" is not.

   §12 asks for sessions built from BLOCKS, with the generator deciding which blocks belong. The pieces
   already exist separately — preparation, resistance, practice, recovery — so composition is the layer that
   decides what a given day should contain and, more importantly, what it should leave out. A session that
   includes every block is not a session, it is a list.
   ============================================================================ */

/* ---------------- §4.1 SKILL ONTOLOGY ----------------
   Families extend the four already in PROGRESSIONS. Each step declares what it demands across the axes that
   can actually hold someone back, which is what §4.3 needs. */
var SKILL_FAMILIES={
  handstand:{label:'Handstand',pattern:'vertical push',
    prerequisites:['shoulder flexion overhead','wrist extension'],
    steps:[
      {id:'wall-plank',label:'Wall plank',demand:{strength:2,balance:1,mobility:2,technique:2}},
      {id:'wall-handstand',label:'Wall handstand',demand:{strength:3,balance:2,mobility:3,technique:3}},
      {id:'chest-to-wall',label:'Chest-to-wall handstand',demand:{strength:3,balance:3,mobility:4,technique:4}},
      {id:'freestanding',label:'Freestanding handstand',demand:{strength:4,balance:6,mobility:4,technique:6}},
      {id:'hspu',label:'Handstand push-up',demand:{strength:7,balance:5,mobility:4,technique:6}}]},
  planche:{label:'Planche',pattern:'horizontal push',
    prerequisites:['straight-arm scapular strength','wrist extension'],
    steps:[
      {id:'plank-lean',label:'Planche lean',demand:{strength:3,balance:2,mobility:2,technique:2}},
      {id:'tuck-planche',label:'Tuck planche',demand:{strength:5,balance:3,mobility:2,technique:4}},
      {id:'adv-tuck-planche',label:'Advanced tuck planche',demand:{strength:6,balance:4,mobility:3,technique:5}},
      {id:'straddle-planche',label:'Straddle planche',demand:{strength:8,balance:5,mobility:4,technique:6}}]},
  muscleup:{label:'Muscle-up',pattern:'vertical pull',
    prerequisites:['strict pull-up','straight-bar dip'],
    steps:[
      {id:'high-pullup',label:'Chest-to-bar pull-up',demand:{strength:5,balance:1,mobility:2,technique:3}},
      {id:'transition-drill',label:'Transition drill',demand:{strength:5,balance:2,mobility:3,technique:5}},
      {id:'kipping-mu',label:'Kipping muscle-up',demand:{strength:5,balance:2,mobility:3,technique:6}},
      {id:'strict-mu',label:'Strict muscle-up',demand:{strength:8,balance:2,mobility:3,technique:7}}]},
  frontLever:{label:'Front lever',pattern:'horizontal pull',
    prerequisites:['dead hang','straight-arm scapular strength'],
    steps:[
      {id:'tuck-fl',label:'Tuck front lever',demand:{strength:4,balance:1,mobility:2,technique:3}},
      {id:'adv-tuck-fl',label:'Advanced tuck front lever',demand:{strength:5,balance:2,mobility:2,technique:4}},
      {id:'straddle-fl',label:'Straddle front lever',demand:{strength:7,balance:2,mobility:3,technique:5}},
      {id:'full-fl',label:'Full front lever',demand:{strength:9,balance:2,mobility:3,technique:6}}]},
  core:{label:'L-sit and compression',pattern:'trunk flexion',
    prerequisites:['hamstring range','shoulder depression'],
    steps:[
      {id:'foot-support-lsit',label:'Foot-supported L-sit',demand:{strength:2,balance:1,mobility:3,technique:2}},
      {id:'tuck-lsit',label:'Tuck L-sit',demand:{strength:3,balance:1,mobility:3,technique:2}},
      {id:'lsit',label:'L-sit',demand:{strength:5,balance:2,mobility:5,technique:3}},
      {id:'vsit',label:'V-sit',demand:{strength:7,balance:3,mobility:7,technique:5}}]},
  pistol:{label:'Pistol squat',pattern:'squat',
    prerequisites:['ankle dorsiflexion','single-leg balance'],
    steps:[
      {id:'box-pistol',label:'Box pistol',demand:{strength:3,balance:3,mobility:3,technique:3}},
      {id:'assisted-pistol',label:'Assisted pistol',demand:{strength:4,balance:4,mobility:4,technique:3}},
      {id:'pistol-full',label:'Pistol squat',demand:{strength:6,balance:6,mobility:6,technique:5}}]},
  nordic:{label:'Nordic curl',pattern:'knee flexion',
    prerequisites:['hamstring tolerance'],
    steps:[
      {id:'nordic-negative-assisted',label:'Assisted negative',demand:{strength:4,balance:1,mobility:2,technique:3}},
      {id:'nordic-negative',label:'Full negative',demand:{strength:6,balance:1,mobility:3,technique:4}},
      {id:'nordic-full',label:'Full Nordic curl',demand:{strength:9,balance:2,mobility:3,technique:5}}]}
};
/* Mastery is a stated criterion rather than a feeling, so "consistent" means the same thing twice. */
/* MASTERY removed in H0: defined but never read (see docs/architecture/presentation-policies.md where it recorded a decision). */
function skillFamilies(){
  var out={};
  Object.keys(PROGRESSIONS).forEach(function(k){
    out[k]={label:PROGRESSIONS[k].label,pattern:PROGRESSIONS[k].pattern,
      steps:PROGRESSIONS[k].steps,prerequisites:[],source:'basic'};
  });
  Object.keys(SKILL_FAMILIES).forEach(function(k){out[k]=Object.assign({source:'skill'},SKILL_FAMILIES[k]);});
  return out;
}
/* ---------------- §4.3 STRENGTH VERSUS SKILL LIMITER ----------------
   The question worth answering. Each axis is estimated from something in the record, and where an axis has
   nothing behind it that is said rather than defaulted. */
function skillLimiter(familyId){
  var fams=skillFamilies();
  var f=fams[familyId];
  if(!f)return null;
  var states=skillStates();
  var rows=f.steps.map(function(st,i){
    var rec=states[st.id];
    return {index:i,id:st.id,label:st.label,demand:st.demand||{},
      state:rec?rec.state:'not attempted',at:rec?rec.at:null};
  });
  var achieved=rows.filter(function(r){return r.state==='consistent'||r.state==='mastered';});
  var current=achieved.length?achieved[achieved.length-1]:null;
  var next=rows[current?current.index+1:0]||null;
  if(!next)return {family:familyId,label:f.label,rows:rows,current:current,next:null,
    note:'Every step in this family is recorded as consistent or mastered.'};
  var need=next.demand||{};
  var axes=[];
  /* STRENGTH: from the pattern's own e1RM trend where the family maps onto a trained pattern. */
  var strengthEvidence=null;
  try{
    var r=(exerciseResponse().rows||[]).filter(function(x){
      var e=resolveExercise(x.exercise);return e&&e.pattern===f.pattern;})[0];
    if(r&&r.exposures>=6)strengthEvidence={exposures:r.exposures,exercise:r.exercise};
  }catch(e){}
  axes.push({axis:'strength',needed:need.strength||null,
    evidence:strengthEvidence?(strengthEvidence.exposures+' logged sets of '+strengthEvidence.exercise):null,
    status:strengthEvidence?'trained':'no loaded work recorded for this pattern'});
  /* MOBILITY: from measured joint range where the family declares a prerequisite that maps to an assessment. */
  var mobEvidence=null;
  (f.prerequisites||[]).forEach(function(p){
    ASSESSMENTS.forEach(function(a){
      if(!mobEvidence&&String(p).toLowerCase().indexOf(a.region.toLowerCase())>=0){
        var st2=assessmentState(a.id);
        if(st2&&st2.status==='ok')mobEvidence={test:a.label,value:st2.latest,unit:a.unit};
      }
    });
  });
  axes.push({axis:'mobility',needed:need.mobility||null,
    evidence:mobEvidence?(mobEvidence.test+' at '+mobEvidence.value+' '+mobEvidence.unit):null,
    status:mobEvidence?'measured':'never measured'});
  /* BALANCE and TECHNIQUE: only practice evidences these, so practice attempts are the evidence. */
  var practised=rows.filter(function(r2){return r2.state==='learning'||r2.state==='partial'||r2.state==='assisted';}).length;
  axes.push({axis:'balance',needed:need.balance||null,
    evidence:practised?(practised+' step(s) recorded as in progress'):null,
    status:practised?'being practised':'not practised'});
  axes.push({axis:'technique',needed:need.technique||null,
    evidence:practised?(practised+' step(s) recorded as in progress'):null,
    status:practised?'being practised':'not practised'});
  /* FATIGUE is a current-state veto rather than an axis you build. */
  var fatigueBlock=null;
  try{
    var rd=readinessState();
    if(rd.status==='ok'&&rd.score<=-1.2)fatigueBlock='readiness is '+rd.band+', which is the wrong state to attempt a new skill in';
  }catch(e){}
  /* The limiter is the axis with a real demand and no evidence behind it. Where several qualify, the one
     demanding most is named, and where none does the honest answer is that it cannot be told apart. */
  var unevidenced=axes.filter(function(a){return a.needed&&!a.evidence;})
    .sort(function(a,b){return b.needed-a.needed;});
  var limiter=unevidenced.length?unevidenced[0].axis:null;
  return {family:familyId,label:f.label,rows:rows,current:current,next:next,
    prerequisites:f.prerequisites||[],axes:axes,limiter:limiter,fatigueBlock:fatigueBlock,
    cls:'DERIVED',
    verdict:fatigueBlock?fatigueBlock:
      (limiter?('the axis with nothing behind it is '+limiter+
        (limiter==='mobility'?' \u2014 measure it before assuming it is strength':
         (limiter==='strength'?' \u2014 no loaded work for this pattern is recorded':' \u2014 it needs practice, which is not the same as needing to be stronger'))):
       'strength, mobility and practice all have something behind them; the next step is a matter of attempting it'),
    note:'What holds someone at a step is usually not what they assume. This reports which axis has no evidence behind it, which is different from proving that axis is the cause.'};
}
/* ---------------- §12 SESSION COMPOSITION ----------------
   Blocks, and a generator that decides which belong today. The discipline: leave blocks OUT. */
/* SESSION_BLOCKS removed in H0: defined but never read (see docs/architecture/presentation-policies.md where it recorded a decision). */
function composeSession(opts){
  opts=opts||{};
  var day=opts.day||['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(todayISO()+'T12:00:00Z').getUTCDay()];
  var p=trainingProgram();
  var planned=p.week&&p.week[day];
  var readiness=null;try{readiness=readinessState();}catch(e){}
  var sore=[];try{sore=activeInjuries().map(function(i){return i.region;});}catch(e){}
  var budget=opts.minutes||60;
  var blocks=[],excluded=[];
  var add=function(kind,label,minutes,why,act,arg){blocks.push({kind:kind,label:label,minutes:minutes,why:why,act:act||null,arg:arg||null});};
  var skip=function(kind,why){excluded.push({kind:kind,why:why});};

  /* ASSESSMENT: only when something is actually due, never as routine. */
  var dueTest=null;
  ASSESSMENTS.forEach(function(a){
    if(dueTest)return;
    var st=assessmentState(a.id);
    if(!st)return;
    if(st.status!=='ok'){dueTest={test:a,why:'never measured, and it limits '+st.limits};return;}
    var h=assessmentHistory(a.id);
    var last=h[h.length-1];
    if(last&&daysBetween(last.date,asOf())>=28)dueTest={test:a,why:'last measured '+daysBetween(last.date,asOf())+' days ago'};
  });
  if(dueTest)add('assessment','Measure '+dueTest.test.label,2,dueTest.why,'move.assess',dueTest.test.id);
  else skip('assessment','nothing is due; measuring on a schedule you have not set is noise');

  if(!planned||planned.kind!=='lift'){
    /* A non-lifting day is not an empty day, but it is not a full one either. */
    if(sore.length)add('mobility','Mobility for '+sore.join(', '),8,'a sore area on a day with no session is the time to work on it','nav.mobility');
    if(readiness&&readiness.status==='ok'&&readiness.score<=-1)
      add('recovery','Easy movement and breathing',12,'readiness is '+readiness.band,'move.recover');
    else add('practice','Optional practice or a walk',20,'no session is scheduled today','nav.yoga');
    skip('resistance','no lifting session is scheduled today');
    skip('warmup','there is nothing specific to prepare for');
    return {status:'ok',day:day,session:null,blocks:blocks,excluded:excluded,
      minutes:blocks.reduce(function(a,b){return a+b.minutes;},0),budget:budget,cls:'DERIVED',
      note:'A rest day composed deliberately rather than left blank, and still mostly empty.'};
  }
  /* PREPARATION comes from the existing engine rather than a second opinion. */
  var prep=null;try{prep=prepareSession({day:day});}catch(e){}
  if(prep&&prep.status==='ok'){
    add('warmup','Preparation \u00b7 '+prep.blocks.length+' parts',prep.minutes,
      prep.adapted?('adapted today: '+(prep.reasons.join('; ')||'readiness or a sore area')):'standard preparation','move.prepare');
    if(prep.blocks.some(function(b){return b.role==='mobility';}))
      add('mobility','Session-specific mobility',0,'folded into preparation rather than repeated as its own block');
    else skip('mobility','nothing in today\u2019s session is limited by a measured range');
  }
  /* SKILL before fatigue, or not at all. */
  var skillFam=null;
  Object.keys(skillFamilies()).forEach(function(k){
    if(skillFam)return;
    var lim=skillLimiter(k);
    if(lim&&lim.next&&!lim.fatigueBlock&&lim.rows.some(function(r){return r.state!=='not attempted';}))skillFam={k:k,lim:lim};
  });
  if(skillFam&&(!readiness||readiness.status!=='ok'||readiness.score>-1))
    add('skill',skillFam.lim.next.label,8,'skill work goes before the session, while you are fresh','move.progress');
  else if(skillFam)skip('skill','readiness is down, and a skill attempted tired teaches the compensation');
  else skip('skill','no calisthenics progression is in progress');

  add('resistance',planned.label,Math.max(20,budget-30),'the scheduled session','session.new');
  skip('calisthenics','bodyweight work is inside the session rather than a separate block');
  /* CONDITIONING competes with recovery from lifting, so it is included only when the week is light. */
  var weekDose=null;try{weekDose=movementDoseTotals(7);}catch(e){}
  if(weekDose&&weekDose.totals.cardio<1.5&&(!readiness||readiness.score>-1))
    add('conditioning','Easy conditioning',10,'cardiovascular exposure is low this week and readiness allows it','log.type','cardio');
  else skip('conditioning',weekDose&&weekDose.totals.cardio>=1.5?'cardiovascular exposure is already adequate this week':'readiness is down');
  var rec=null;try{rec=recoverSession();}catch(e){}
  if(rec&&rec.blocks.length)add('cooldown','After the session \u00b7 '+rec.blocks.length+' parts',
    rec.blocks.reduce(function(a,b){return a+b.minutes;},0),'gradual reduction rather than stopping dead','move.recover');
  skip('practice','a practice session on a lifting day competes with recovery from it');
  skip('recovery','the cool-down covers it; a separate recovery block would be the same work twice');
  /* Fit the budget by DROPPING, in reverse priority. A generator that reports "65 minutes of a 60-minute
     session" has not composed anything — it has listed everything and left the arithmetic to the reader.
     The session itself and its preparation are never dropped; everything else is optional, and each removal
     is recorded with the reason so the trade is visible. */
  var DROP_ORDER=['conditioning','assessment','skill','cooldown'];
  var total=function(){return blocks.reduce(function(a,b){return a+b.minutes;},0);};
  var trimmed=[];
  DROP_ORDER.forEach(function(kind){
    if(total()<=budget)return;
    var i=blocks.map(function(b){return b.kind;}).indexOf(kind);
    if(i<0)return;
    var removed=blocks.splice(i,1)[0];
    trimmed.push(removed.kind);
    excluded.push({kind:removed.kind,
      why:'dropped to fit '+budget+' minutes — it was worth '+removed.minutes+' minutes but the session and its preparation come first'});
  });
  var mins=total();
  return {status:'ok',day:day,session:planned.label,blocks:blocks,excluded:excluded,
    minutes:mins,budget:budget,overBudget:mins>budget,trimmed:trimmed,
    trimNote:trimmed.length?('Trimmed to fit: '+trimmed.join(', ')+'. Give it more time and they come back.'):null,
    cls:'DERIVED',
    note:'Composed from what today actually calls for. The blocks left out are listed with the reason \u2014 a session containing every block is not a session, it is a list.',
    caveat:'Durations are estimates and the block order is a convention. Whether this composition suits you is testable and untested.'};
}
/* ---------------- §13/§14 MOVEMENT QUALITY ----------------
   Observation, never diagnosis: the engine records what was seen and refuses to name a cause. */
var QUALITY_DIMENSIONS=['range','stability','control','symmetry','tempo','technique'];
function logQuality(o){
  o=o||{};
  if(!o.exercise)return null;
  var obs={};
  QUALITY_DIMENSIONS.forEach(function(d){if(o[d]!=null)obs[d]=Math.max(1,Math.min(5,Math.round(num(o[d]))));});
  if(!Object.keys(obs).length)return null;
  return addObservation({type:'note',date:o.date||todayISO(),
    value:'Movement quality \u00b7 '+o.exercise+': '+Object.keys(obs).map(function(k){return k+' '+obs[k];}).join(', '),
    source:'observation',
    meta:{quality:true,exercise:o.exercise,dimensions:obs,side:o.side||null}},
    {silent:o.silent,noSave:o.noSave});
}
function qualityHistory(exercise){
  return obsOf('note').filter(function(o){return o.meta&&o.meta.quality&&(!exercise||o.meta.exercise===exercise);})
    .map(function(o){return {date:o.date,exercise:o.meta.exercise,dimensions:o.meta.dimensions,side:o.meta.side};})
    .sort(function(a,b){return a.date<b.date?-1:1;});
}
function qualityTrend(exercise){
  var h=qualityHistory(exercise);
  if(h.length<3)return {status:'insufficient',need:[(3-h.length)+' more quality observations for '+exercise],
    note:'Three observations is the minimum before a direction means anything, and even then it is your own eye.'};
  var first=h.slice(0,Math.ceil(h.length/2)),last=h.slice(Math.ceil(h.length/2));
  var avg=function(rows,d){var v=rows.map(function(r){return r.dimensions[d];}).filter(function(x){return x!=null;});
    return v.length?mean(v):null;};
  var rows=QUALITY_DIMENSIONS.map(function(d){
    var a=avg(first,d),b=avg(last,d);
    return {dimension:d,before:a!=null?round(a,1):null,after:b!=null?round(b,1):null,
      change:(a!=null&&b!=null)?round(b-a,1):null};
  }).filter(function(r){return r.change!=null;});
  return {status:'ok',cls:'MEASURED',exercise:exercise,observations:h.length,rows:rows,
    note:'What you observed, not what it means. A reduced range was observed; whether a joint, a muscle or a decision caused it is not something this can tell you, and it will not guess.'};
}
