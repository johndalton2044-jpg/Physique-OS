/* ============================================================================
   REGION: MOVEMENT ENGINE
   The specification is emphatic about the architecture, and it is right:

     "I would NOT make these six separate engines... That would fragment the architecture.
      Instead: one underlying Movement Engine with specialised domains."

   So there is no stretching engine, yoga engine or warm-up engine here. There is one ontology in which a
   movement has ROLES, and the same physical movement can carry different roles depending on why it is being
   done. A leg swing is preparation before a squat session and mobility work on a rest day; the movement is
   identical and the meaning is not.

   The second principle the spec insists on, and the one that makes the whole thing work with the existing
   architecture: DOSE IS NOT ONE NUMBER. Thirty minutes of restorative yoga and thirty minutes of intense
   calisthenics are both "thirty minutes of exercise" and nothing else about them is alike. Every movement
   record therefore carries separate stimulus, fatigue, mobility, skill and cardiovascular dimensions.

   Third: observation is not diagnosis (§19). The engine may record that depth was reduced. It may not
   conclude that hip mobility is deficient \u2014 that is an inference needing evidence, and it goes through the
   same causal grading everything else does.
   ============================================================================ */

/* ---------------- 31. UNIFIED MOVEMENT ONTOLOGY ----------------
   Roles, not silos. A movement declares which roles it can serve; context decides which one applies. */
var MOVEMENT_ROLES={
  resistance:{label:'Resistance',phase:'perform',note:'loaded work whose objective is force production'},
  calisthenics:{label:'Calisthenics',phase:'perform',note:'bodyweight resistance, where leverage is the load'},
  isometric:{label:'Isometric',phase:'perform',note:'force without movement \u2014 held, overcoming or yielding'},
  conditioning:{label:'Conditioning',phase:'perform',note:'objective is cardiovascular or metabolic'},
  skill:{label:'Skill',phase:'perform',note:'objective is competence, not fatigue'},
  mobility:{label:'Mobility',phase:'adapt',note:'usable range \u2014 range you can control, not merely reach'},
  flexibility:{label:'Flexibility',phase:'adapt',note:'available range, passive'},
  activation:{label:'Activation',phase:'prepare',note:'preparing a specific structure'},
  warmup:{label:'Warm-up',phase:'prepare',note:'raising temperature and circulation'},
  movementPrep:{label:'Movement prep',phase:'prepare',note:'rehearsing the pattern about to be loaded'},
  ramp:{label:'Ramp set',phase:'prepare',note:'progressive loading toward the working weight'},
  cooldown:{label:'Cool-down',phase:'recover',note:'down-regulation after work'},
  breathing:{label:'Breathing',phase:'recover',note:'down-regulation without movement'},
  practice:{label:'Practice',phase:'perform',note:'yoga, balance, mind-body work'}
};
var MOVEMENT_PHASES=['prepare','perform','recover','adapt'];
/* Dose dimensions (§24, §25, §26). Each is 0\u20131 and they are deliberately NOT summed into a single score:
   collapsing them is exactly the mistake that makes yoga and calisthenics look interchangeable. */
var DOSE_DIMENSIONS=['stimulus','fatigue','mobility','skill','cardio'];
function emptyDose(){return {stimulus:0,fatigue:0,mobility:0,skill:0,cardio:0};}
/* Modality defaults. A record can override any of them; these are starting points, not physiology. */
var MODALITY_DOSE={
  resistance:{stimulus:0.8,fatigue:0.7,mobility:0.1,skill:0.3,cardio:0.2},
  calisthenics:{stimulus:0.7,fatigue:0.6,mobility:0.3,skill:0.6,cardio:0.3},
  isometric:{stimulus:0.5,fatigue:0.4,mobility:0.2,skill:0.3,cardio:0.1},
  conditioning:{stimulus:0.2,fatigue:0.5,mobility:0.1,skill:0.1,cardio:0.9},
  skill:{stimulus:0.2,fatigue:0.2,mobility:0.2,skill:0.9,cardio:0.1},
  mobility:{stimulus:0.1,fatigue:0.1,mobility:0.8,skill:0.3,cardio:0.1},
  flexibility:{stimulus:0.05,fatigue:0.05,mobility:0.7,skill:0.1,cardio:0.05},
  activation:{stimulus:0.15,fatigue:0.1,mobility:0.3,skill:0.3,cardio:0.1},
  warmup:{stimulus:0.1,fatigue:0.1,mobility:0.3,skill:0.2,cardio:0.3},
  movementPrep:{stimulus:0.1,fatigue:0.05,mobility:0.3,skill:0.5,cardio:0.1},
  ramp:{stimulus:0.2,fatigue:0.15,mobility:0.1,skill:0.4,cardio:0.1},
  cooldown:{stimulus:0.05,fatigue:0.05,mobility:0.3,skill:0.05,cardio:0.2},
  breathing:{stimulus:0,fatigue:0,mobility:0.05,skill:0.1,cardio:0.05},
  practice:{stimulus:0.3,fatigue:0.3,mobility:0.6,skill:0.6,cardio:0.2}
};
/* Intensity scales the dose; duration scales it again, with diminishing weight so an hour of easy movement
   does not read as more fatiguing than twenty hard minutes. */
function movementDose(rec){
  var base=MODALITY_DOSE[rec.role]||emptyDose();
  var intensity=rec.intensity!=null?clamp(rec.intensity/10,0,1):0.5;
  var minutes=rec.minutes||rec.duration||10;
  var span=Math.sqrt(Math.min(120,minutes)/20);
  var out={};
  DOSE_DIMENSIONS.forEach(function(d){
    var v=(base[d]||0)*(0.5+intensity)*span;
    if(rec.dose&&rec.dose[d]!=null)v=rec.dose[d];
    out[d]=round(clamp(v,0,3),2);
  });
  return out;
}
/* ---------------- 27. MOVEMENT INTERVENTION LIBRARY ----------------
   One structure for stretching, mobility, yoga, warm-ups, cool-downs, activation, isometrics and
   calisthenics, exactly as the spec asks. A library entry states its objective and its expected effect, and
   carries a place for personal evidence that starts empty and is filled by the record. */
var MOVEMENT_LIBRARY=[
  {id:'ankle-dorsiflexion',label:'Ankle dorsiflexion drill',role:'mobility',phase:'prepare',
   targets:['ankle'],patterns:['squat','lunge'],objective:'usable dorsiflexion for squatting depth',
   dose:{minutes:2,intensity:3},expected:'more depth available without the heel lifting',
   evidence:'mobility work produces acute range change; whether it persists is individual',
   prerequisites:[],contraindications:['sharp ankle pain']},
  {id:'hip-90-90',label:'90/90 hip rotations',role:'mobility',phase:'prepare',
   targets:['hip'],patterns:['squat','hinge','lunge'],objective:'hip internal and external rotation',
   dose:{minutes:3,intensity:3},expected:'easier depth and a more stable base',
   prerequisites:[],contraindications:['sharp hip pain']},
  {id:'thoracic-rotation',label:'Thoracic rotations',role:'mobility',phase:'prepare',
   targets:['neck','shoulder'],patterns:['vertical push','horizontal push'],objective:'overhead and pressing position',
   dose:{minutes:2,intensity:3},expected:'less compensation reaching overhead',prerequisites:[],contraindications:[]},
  {id:'leg-swings',label:'Leg swings',role:'warmup',phase:'prepare',
   targets:['hip'],patterns:['squat','hinge','lunge'],objective:'dynamic range and circulation',
   dose:{minutes:2,intensity:4},expected:'movement feels easier, not looser',prerequisites:[],contraindications:[]},
  {id:'scap-pullups',label:'Scapular pull-ups',role:'activation',phase:'prepare',
   targets:['shoulder'],patterns:['vertical pull'],objective:'scapular control before pulling',
   dose:{minutes:2,intensity:4},expected:'better position at the start of each pull',
   prerequisites:['dead hang'],contraindications:['shoulder pain at hang']},
  {id:'glute-bridge',label:'Glute bridges',role:'activation',phase:'prepare',
   targets:['hip','lowBack'],patterns:['hinge'],objective:'posterior chain rehearsal',
   dose:{minutes:2,intensity:4},expected:'the hinge pattern feels driven by the hips',prerequisites:[],contraindications:[]},
  {id:'static-hamstring',label:'Static hamstring stretch',role:'flexibility',phase:'recover',
   targets:['hip','lowBack'],patterns:['hinge'],objective:'passive range',
   dose:{minutes:3,intensity:4},expected:'range increases acutely',
   evidence:'long static holds immediately before heavy work are associated with a small acute strength decrement; after work that concern does not apply',
   prerequisites:[],contraindications:[],avoidBefore:['resistance']},
  {id:'couch-stretch',label:'Couch stretch',role:'flexibility',phase:'recover',
   targets:['hip','knee'],patterns:['lunge','squat'],objective:'hip flexor length',
   dose:{minutes:4,intensity:5},expected:'easier upright posture under load',prerequisites:[],contraindications:['knee pain in flexion']},
  {id:'box-breathing',label:'Box breathing',role:'breathing',phase:'recover',
   targets:[],patterns:[],objective:'down-regulation after work',
   dose:{minutes:3,intensity:1},expected:'a quicker subjective transition out of training',
   evidence:'subjective; the physiological case for post-session breathing is weaker than the perceptual one',
   prerequisites:[],contraindications:[]},
  {id:'easy-walk',label:'Easy walk',role:'cooldown',phase:'recover',
   targets:[],patterns:[],objective:'gradual intensity reduction',
   dose:{minutes:8,intensity:2},expected:'a gentler return to rest',prerequisites:[],contraindications:[]},
  {id:'sun-salutation',label:'Sun salutation flow',role:'practice',phase:'perform',
   targets:['shoulder','hip','lowBack'],patterns:['hinge','vertical push'],objective:'whole-body mobility and control',
   dose:{minutes:10,intensity:4},expected:'mobility exposure with some strength and balance demand',
   prerequisites:[],contraindications:[]},
  {id:'restorative-yoga',label:'Restorative sequence',role:'practice',phase:'recover',
   targets:['hip','lowBack','shoulder'],patterns:[],objective:'perceived recovery',
   dose:{minutes:20,intensity:2},expected:'better perceived recovery; a measurable performance effect is not assumed',
   prerequisites:[],contraindications:[]},
  {id:'wall-sit',label:'Wall sit',role:'isometric',phase:'perform',
   targets:['knee','hip'],patterns:['squat'],objective:'yielding isometric at mid-range',
   dose:{minutes:3,intensity:6},expected:'quadriceps endurance without eccentric load',prerequisites:[],contraindications:[]},
  {id:'overcoming-pin-press',label:'Overcoming pin press',role:'isometric',phase:'perform',
   targets:['shoulder','elbow'],patterns:['vertical push'],objective:'force production at a chosen angle',
   dose:{minutes:5,intensity:8},expected:'strength at and near the trained joint angle',
   evidence:'isometric strength transfers most strongly near the trained angle',prerequisites:[],contraindications:[]}
];
function movementLibrary(opts){
  opts=opts||{};
  var rows=MOVEMENT_LIBRARY.slice();
  if(opts.role)rows=rows.filter(function(m){return m.role===opts.role;});
  if(opts.phase)rows=rows.filter(function(m){return m.phase===opts.phase;});
  if(opts.target)rows=rows.filter(function(m){return (m.targets||[]).indexOf(opts.target)>=0;});
  if(opts.pattern)rows=rows.filter(function(m){return (m.patterns||[]).indexOf(opts.pattern)>=0;});
  return rows.map(function(m){
    return Object.assign({},m,{dose:movementDose({role:m.role,minutes:m.dose.minutes,intensity:m.dose.intensity}),
      personalEvidence:movementResponse(m.id)});
  });
}
/* ---------------- 15/16. CALISTHENICS PROGRESSION GRAPHS ----------------
   Progressions, not a list of unrelated exercises. Each step declares what it demands, so the engine can say
   which step is next and \u2014 more usefully \u2014 what is actually holding you at the current one. */
var PROGRESSIONS={
  push:{label:'Push-up family',pattern:'horizontal push',
    steps:[{id:'incline-pushup',label:'Incline push-up',demand:{strength:1,skill:1}},
           {id:'pushup',label:'Push-up',demand:{strength:2,skill:1}},
           {id:'decline-pushup',label:'Decline push-up',demand:{strength:3,skill:2}},
           {id:'archer-pushup',label:'Archer push-up',demand:{strength:4,skill:3}},
           {id:'onearm-progression',label:'One-arm progression',demand:{strength:6,skill:5}}]},
  pull:{label:'Pull-up family',pattern:'vertical pull',
    steps:[{id:'dead-hang',label:'Dead hang',demand:{strength:1,skill:1}},
           {id:'scap-pull',label:'Scapular pull',demand:{strength:1,skill:2}},
           {id:'assisted-pullup',label:'Assisted pull-up',demand:{strength:2,skill:2}},
           {id:'pullup',label:'Pull-up',demand:{strength:3,skill:2}},
           {id:'weighted-pullup',label:'Weighted pull-up',demand:{strength:5,skill:3}},
           {id:'archer-pullup',label:'Archer pull-up',demand:{strength:5,skill:4}}]},
  squat:{label:'Squat family',pattern:'squat',
    steps:[{id:'box-squat-bw',label:'Box squat',demand:{strength:1,skill:1}},
           {id:'bw-squat',label:'Bodyweight squat',demand:{strength:1,skill:1}},
           {id:'split-squat',label:'Split squat',demand:{strength:2,skill:2}},
           {id:'shrimp-squat',label:'Shrimp squat',demand:{strength:4,skill:4}},
           {id:'pistol',label:'Pistol squat',demand:{strength:4,skill:5}}]},
  hold:{label:'Static holds',pattern:'trunk flexion',
    steps:[{id:'tuck-hold',label:'Tuck hold',demand:{strength:2,skill:2}},
           {id:'lsit',label:'L-sit',demand:{strength:4,skill:4}},
           {id:'vsit',label:'V-sit',demand:{strength:6,skill:6}}]}
};
var SKILL_STATES=['not attempted','learning','assisted','partial','consistent','mastered'];
/* Skill states are reconstructed as-of: a progression marked "consistent" today did not read that way
   last month, and a replay that says it did is telling you something that was not true then. */
function skillStates(){
  var on=asOf();
  var cur=DB.settings.skills||{};
  /* No early return on `on >= todayISO()`: todayISO() is itself as-of aware, so inside a replay it equals
     `on` and the shortcut handed back the CURRENT states every time. The filter below is cheap and correct
     in both cases. */
  var out={};
  Object.keys(cur).forEach(function(k){
    if(!cur[k].at||localDateOf(cur[k].at)<=on)out[k]=cur[k];
  });
  /* Anything changed after the replay date is reconstructed from the log rather than dropped outright. */
  try{
    var proj=projectEvents(_EVENTS,{asOf:on}).db;
    if(proj.settings&&proj.settings.skills)out=proj.settings.skills;
  }catch(e){_q(e,'P3');}
  return out;
}
function setSkillState(stepId,state,note){
  if(SKILL_STATES.indexOf(state)<0)return null;
  pushUndo('update a skill');
  var s=DB.settings.skills||{};
  s[stepId]={state:state,at:nowISO(),note:String(note||'').slice(0,160)};
  DB.settings.skills=s;
  emitEvent('skill.changed',{id:stepId,state:state,note:note||''});
  _memoInvalidate();save('skill');
  return s[stepId];
}
function progressionStatus(familyId){
  /* Reads every family, not just the four defined here. The skill families in 57-composition.js are the same
     shape, and a sheet iterating all of them got null back for seven of eleven. */
  var f=PROGRESSIONS[familyId];
  if(!f&&typeof SKILL_FAMILIES!=='undefined'&&SKILL_FAMILIES[familyId])f=SKILL_FAMILIES[familyId];
  if(!f)return null;
  var states=skillStates();
  var rows=f.steps.map(function(st,i){
    var rec=states[st.id];
    return {index:i,id:st.id,label:st.label,demand:st.demand,
      state:rec?rec.state:'not attempted',at:rec?rec.at:null};
  });
  var achieved=rows.filter(function(r){return r.state==='consistent'||r.state==='mastered';});
  var current=achieved.length?achieved[achieved.length-1]:null;
  var next=rows[current?current.index+1:0]||null;
  /* The useful question is not "what is next" but "what is holding you". Strength and skill are separated so
     the answer can be either. */
  var limiter=null;
  if(next){
    var strengthOk=false;
    try{
      var r=(exerciseResponse().rows||[]).filter(function(x){return x.exercise&&f.pattern&&
        (resolveExercise(x.exercise)||{}).pattern===f.pattern;})[0];
      strengthOk=!!(r&&r.exposures>=6);
    }catch(e){}
    var practised=rows.filter(function(r2){return r2.state==='learning'||r2.state==='partial';}).length>0;
    limiter=(!strengthOk&&!practised)?'neither strength nor practice is recorded for this pattern':
      (practised?'practice \u2014 you are working on it but it is not consistent yet':
       'strength or practice, which cannot be separated without recording attempts');
  }
  return {family:familyId,label:f.label,rows:rows,current:current,next:next,limiter:limiter,
    cls:'MEASURED',
    note:'States are what you recorded, not what the system inferred. A progression graph says what is next; it cannot say whether you are ready.'};
}
/* ---------------- 2/21/22. MOBILITY ASSESSMENT ----------------
   assess \u2192 intervene \u2192 reassess, which is the only way a mobility claim becomes evidence rather than a
   feeling. Assessments are recorded as ordinary observations so they replay like everything else. */
var ASSESSMENTS=[
  {id:'ankle-wall',label:'Ankle wall test',region:'ankle',unit:'cm',
   how:'Knee to wall, foot square, heel down. Measure the greatest distance from wall to toe.',
   requiredFor:['squat','lunge'],direction:'higher is more range'},
  {id:'shoulder-flexion',label:'Overhead reach',region:'shoulder',unit:'\u00b0',
   how:'Lying with the lower back flat, raise straight arms overhead. Measure where the arms stop.',
   requiredFor:['vertical push'],direction:'higher is more range'},
  {id:'hip-ir',label:'Hip internal rotation',region:'hip',unit:'\u00b0',
   how:'Seated, knee at ninety degrees, rotate the shin outward without lifting the thigh.',
   requiredFor:['squat','hinge'],direction:'higher is more range'},
  {id:'sit-reach',label:'Sit and reach',region:'lowBack',unit:'cm',
   how:'Seated, legs straight, reach toward the toes. Measure fingertips against the feet.',
   requiredFor:['hinge'],direction:'higher is more range'}
];
function recordAssessment(id,value,opts){
  var a=ASSESSMENTS.filter(function(x){return x.id===id;})[0];
  if(!a||num(value)==null)return null;
  opts=opts||{};
  /* Recorded as a note observation carrying structured metadata, so it inherits visibility, replay and
     correction without inventing a parallel store. */
  var rec=addObservation({type:'note',date:opts.date||todayISO(),
    value:a.label+': '+value+' '+a.unit,source:'assessment',
    meta:{assessment:id,value:num(value),unit:a.unit,region:a.region,side:opts.side||null}},
    {silent:opts.silent,noSave:opts.noSave});
  return rec;
}
function assessmentHistory(id){
  return obsOf('note').filter(function(o){return o.meta&&o.meta.assessment===id;})
    .map(function(o){return {date:o.date,value:o.meta.value,side:o.meta.side,id:o.id};})
    .sort(function(a,b){return a.date<b.date?-1:1;});
}
function assessmentState(id){
  var a=ASSESSMENTS.filter(function(x){return x.id===id;})[0];
  if(!a)return null;
  var h=assessmentHistory(id);
  if(!h.length)return {assessment:a,status:'never measured',need:['a baseline measurement'],
    limits:'any claim that a mobility intervention changed anything'};
  var first=h[0],last=h[h.length-1];
  var change=h.length>1?round(last.value-first.value,1):null;
  /* Between the two measurements, what was actually done? Without that the change is a number with no cause
     available to it. */
  var between=h.length>1?movementLog({from:first.date,to:last.date})
    .filter(function(m){return (m.targets||[]).indexOf(a.region)>=0;}).length:0;
  return {assessment:a,status:'ok',baseline:first.value,latest:last.value,
    measurements:h.length,change:change,daysSpanned:daysBetween(first.date,last.date),
    interventionsBetween:between,
    interpretation:change==null?'one measurement is a baseline, not a trend':
      (between===0?'the change happened without any recorded work on that region, so it is not evidence that anything worked':
       (Math.abs(change)<1?'no meaningful change despite '+between+' session(s) of work on that region':
        fmtSigned(change,1)+' '+a.unit+' across '+between+' session(s) of work on that region')),
    cls:'MEASURED'};
}
/* ---------------- 1/23. MOVEMENT RECORDS AND SESSION COMPOSITION ---------------- */
function logMovement(o){
  o=o||{};
  if(!MOVEMENT_ROLES[o.role])return null;
  var lib=MOVEMENT_LIBRARY.filter(function(m){return m.id===o.movementId;})[0];
  if(!o.silent)pushUndo('log '+(MOVEMENT_ROLES[o.role].label||'movement').toLowerCase());
  var rec={id:uid('mv'),date:o.date||todayISO(),createdAt:nowISO(),
    movementId:o.movementId||null,label:o.label||(lib?lib.label:'Movement'),
    role:o.role,phase:MOVEMENT_ROLES[o.role].phase,
    minutes:num(o.minutes)||(lib?lib.dose.minutes:10),
    intensity:num(o.intensity)!=null?num(o.intensity):(lib?lib.dose.intensity:5),
    targets:o.targets||(lib?lib.targets:[]),patterns:o.patterns||(lib?lib.patterns:[]),
    sessionId:o.sessionId||null,note:String(o.note||'').slice(0,200),retracted:false};
  rec.dose=movementDose(rec);
  DB.settings.movements=(DB.settings.movements||[]).concat([rec]);
  emitEvent('movement.logged',rec,{at:rec.createdAt});
  _memoInvalidate();
  if(!o.noSave)save('movement');
  return rec;
}
function movementLog(opts){
  opts=opts||{};
  return (DB.settings.movements||[]).filter(function(m){
    if(m.retracted)return false;
    if(m.createdAt&&localDateOf(m.createdAt)>asOf())return false;
    if(m.date>asOf())return false;
    if(opts.from&&m.date<opts.from)return false;
    if(opts.to&&m.date>opts.to)return false;
    if(opts.role&&m.role!==opts.role)return false;
    if(opts.phase&&m.phase!==opts.phase)return false;
    return true;
  });
}
/* 24/25/26. Dose accounting across everything, kept in separate dimensions. */
function movementDoseTotals(days){
  days=days||7;
  var from=addDays(asOf(),-(days-1));
  var mv=movementLog({from:from});
  var totals=emptyDose(),byPhase={};
  mv.forEach(function(m){
    DOSE_DIMENSIONS.forEach(function(d){totals[d]=round((totals[d]||0)+(m.dose[d]||0),2);});
    byPhase[m.phase]=byPhase[m.phase]||emptyDose();
    DOSE_DIMENSIONS.forEach(function(d){byPhase[m.phase][d]=round((byPhase[m.phase][d]||0)+(m.dose[d]||0),2);});
  });
  /* Lifting sessions contribute too, or the accounting describes only half the training. */
  sessionsOf({from:from}).forEach(function(s){
    var sets=(s.sets||[]).length;
    var d=movementDose({role:'resistance',minutes:s.durationMin||45,intensity:7});
    DOSE_DIMENSIONS.forEach(function(k){totals[k]=round((totals[k]||0)+(d[k]||0)*Math.min(2,sets/12),2);});
    byPhase.perform=byPhase.perform||emptyDose();
    DOSE_DIMENSIONS.forEach(function(k){byPhase.perform[k]=round((byPhase.perform[k]||0)+(d[k]||0)*Math.min(2,sets/12),2);});
  });
  /* A dose tally with nothing logged is not a zero dose, it is an unanswered question. Reporting 0 across
     five dimensions would read as "you did nothing", which is a claim the record cannot support. */
  if(!mv.length&&!sessionsOf({from:from}).length)
    return {status:'insufficient',days:days,records:0,
      need:['movement, mobility or practice sessions logged'],
      why:'Nothing was logged in this window, which is different from having done nothing.',
      totals:totals,byPhase:byPhase};
  return {status:'ok',days:days,totals:totals,byPhase:byPhase,records:mv.length,n:mv.length,
    /* A tally has no sampling interval, because it is not an estimate. What it needs instead is coverage:
       the share of records that carried an intensity rather than falling back to a default, which is the
       largest source of error in these totals. */
    /* Coverage across EVERYTHING contributing to the tally, not just the movement records. Lifting sessions
       enter the dose at an assumed intensity, so counting only movement records reported 100% coverage on a
       week whose dose came almost entirely from assumptions. */
    coverage:(function(){
      var sess=sessionsOf({from:from}).length;
      var rated=mv.filter(function(x){return x.intensity!=null;}).length;
      var total=mv.length+sess;
      return total?Math.round(100*rated/total):null;})(),
    fromSessions:sessionsOf({from:from}).length,
    cls:'DERIVED',
    note:'Five separate dimensions, never summed. Thirty minutes of restorative yoga and thirty minutes of hard calisthenics are both half an hour and nothing else about them is alike.'};
}
/* ---------------- 4/5/28. ADAPTIVE PREPARATION ----------------
   A warm-up that is the same every day is a ritual. This one reads the state that should change it, and
   states WHY each element is there \u2014 including when the answer is "nothing extra is warranted today". */
function prepareSession(opts){
  opts=opts||{};
  var p=trainingProgram();
  var day=opts.day||['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(todayISO()+'T12:00:00Z').getUTCDay()];
  var plan=p.week&&p.week[day];
  if(!plan||plan.kind!=='lift')return {status:'rest',day:day,
    note:'No lifting session is scheduled today, so there is nothing specific to prepare for.'};
  var rows=(p.templates&&p.templates[plan.template])||[];
  var patterns={};
  rows.forEach(function(r){var e=null;try{e=resolveExercise(r[0]);}catch(err){}
    if(e&&e.pattern)patterns[e.pattern]=1;});
  var readiness=null;try{readiness=readinessState();}catch(e){}
  var sore=[];try{sore=activeInjuries().map(function(i){return i.region;});}catch(e){}
  var budget=opts.minutes||(readiness&&readiness.status==='ok'&&readiness.score<=-1?16:10);
  var blocks=[],why=[];
  blocks.push({role:'warmup',label:'General movement',minutes:readiness&&readiness.score<=-1?5:3,
    reason:readiness&&readiness.score<=-1?'readiness is '+readiness.band+', so a longer raise before anything specific':'raise temperature and circulation'});
  /* Mobility chosen by what the session actually demands, and by what is measurably short. */
  var chosen={};
  ASSESSMENTS.forEach(function(a){
    if(!(a.requiredFor||[]).some(function(pt){return patterns[pt];}))return;
    var st=assessmentState(a.id);
    var short=st&&st.status==='ok'&&st.baseline!=null&&st.latest<st.baseline;
    var never=!st||st.status!=='ok';
    var lib=movementLibrary({target:a.region,role:'mobility'})[0];
    if(!lib)return;
    if(short||never||sore.indexOf(a.region)>=0){
      if(chosen[lib.id])return;chosen[lib.id]=1;
      blocks.push({role:'mobility',label:lib.label,minutes:lib.dose.minutes||2,movementId:lib.id,
        reason:short?(a.label+' is below your own baseline'):
          (sore.indexOf(a.region)>=0?(a.region+' is sore, so prepare it rather than loading it cold'):
           (a.label+' has never been measured, so this is precautionary'))});
      if(short)why.push(a.label+' below baseline');
    }
  });
  if(sore.length){
    sore.forEach(function(r){
      var act=movementLibrary({target:r,role:'activation'})[0];
      if(act&&!chosen[act.id]){chosen[act.id]=1;
        blocks.push({role:'activation',label:act.label,minutes:act.dose.minutes||2,movementId:act.id,
          reason:'rehearse the pattern around a sore '+r+' before loading it'});}
    });
  }
  blocks.push({role:'movementPrep',label:'Pattern rehearsal \u2014 '+Object.keys(patterns).slice(0,2).join(', '),
    minutes:2,reason:'unloaded rehearsal of what is about to be loaded'});
  /* 6. Ramp sets, from the first compound in the session. */
  var first=rows[0];
  if(first){
    blocks.push({role:'ramp',label:'Ramp sets \u2014 '+first[0],minutes:readiness&&readiness.score<=-1?6:4,
      ramp:rampScheme(first[0],{conservative:readiness&&readiness.score<=-1}),
      reason:readiness&&readiness.score<=-1?'more ramp steps at lower jumps, because readiness is down':'progressive loading toward the working weight'});
  }
  var total=blocks.reduce(function(a,b){return a+(b.minutes||0);},0);
  return {status:'ok',day:day,session:plan.label,blocks:blocks,minutes:total,budget:budget,
    adapted:why.length>0||sore.length>0||(readiness&&readiness.status==='ok'&&readiness.score<=-1),
    reasons:why,
    cls:'DERIVED',
    note:blocks.length<=3?'Nothing about today warrants extra preparation, so this is the short version. A warm-up that is the same every day is a ritual rather than preparation.':
      'Adapted to what is actually different today.',
    caveat:'Whether this preparation helps you is testable and has not been tested. Log what you do and the record can answer it.'};
}
/* 6. Ramp-set scheme, personalised only as far as the record supports. */
function rampScheme(exercise,opts){
  opts=opts||{};
  var working=null;
  try{
    var recent=sessionsOf({from:addDays(asOf(),-28)});
    var loads=[];
    recent.forEach(function(s){(s.sets||[]).forEach(function(st){
      if(st.exercise===exercise&&st.load)loads.push(st.load);});});
    if(loads.length)working=Math.max.apply(null,loads);
  }catch(e){}
  var pcts=opts.conservative?[0.2,0.4,0.55,0.7,0.8,0.9]:[0.3,0.5,0.7,0.85];
  var reps=opts.conservative?[10,8,5,4,3,1]:[8,5,3,1];
  return {exercise:exercise,workingLoad:working,
    steps:pcts.map(function(p,i){
      return {pct:Math.round(p*100),load:working?Math.round(working*p/5)*5:null,reps:reps[i]};}),
    note:working?'From your heaviest set of this lift in the last four weeks.':
      'No recent load recorded for this lift, so the percentages have nothing to scale.'};
}
/* ---------------- 29. POST-SESSION ---------------- */
function recoverSession(opts){
  opts=opts||{};
  var dose=movementDoseTotals(1);
  var sore=[];try{sore=activeInjuries().map(function(i){return i.region;});}catch(e){}
  var blocks=[],skip=[];
  blocks.push({role:'cooldown',label:'Easy walk',minutes:6,movementId:'easy-walk',
    reason:'gradual reduction rather than stopping dead'});
  if(dose.totals.fatigue>=1.2)blocks.push({role:'breathing',label:'Box breathing',minutes:3,movementId:'box-breathing',
    reason:'a high-fatigue day; the case here is perceptual rather than physiological, and it is stated as such'});
  sore.forEach(function(r){
    var m=movementLibrary({target:r,role:'flexibility'})[0];
    if(m)blocks.push({role:'flexibility',label:m.label,minutes:m.dose.minutes,movementId:m.id,
      reason:'optional range work for a sore '+r+', after work rather than before it'});
  });
  if(dose.totals.stimulus>=1.5)skip.push({what:'additional loaded stretching',
    why:'today already carried a high loaded stimulus; more load on the same tissue has an uncertain benefit'});
  return {status:'ok',blocks:blocks,skip:skip,dose:dose.totals,cls:'DERIVED',
    note:'A recommendation, not a protocol. Whether any of it helps you is a question the record can answer once you log it.',
    caveat:'Cool-downs have a better case for how you feel than for what your body does. This distinguishes the two rather than claiming both.'};
}
/* ---------------- 30. CROSS-MODALITY LEARNING ----------------
   Does mobility work actually change anything? Does yoga before lifting cost you? These reuse the same
   within-person lag machinery the sleep domain uses, and carry the same warning. */
function movementResponse(movementId){
  var mv=movementLog({}).filter(function(m){return m.movementId===movementId;});
  if(mv.length<4)return {status:'insufficient',n:mv.length,
    need:[(4-mv.length)+' more sessions of this before any pattern could show']};
  return {status:'ok',n:mv.length,
    note:'Logged often enough to be testable; a formal comparison needs an experiment.'};
}
function crossModalityEffect(role,metric,opts){
  opts=opts||{};
  var days=opts.days||90;
  var mv=movementLog({from:addDays(asOf(),-days),role:role});
  if(mv.length<6)return {status:'insufficient',need:[(6-mv.length)+' more '+(MOVEMENT_ROLES[role]||{}).label+' sessions']};
  var byDate={};mv.forEach(function(m){byDate[m.date]=(byDate[m.date]||0)+m.minutes;});
  var series=seriesWindow(metric,days);
  if(series.length<12)return {status:'insufficient',need:['more '+((OBS_TYPES[metric]||{}).label||metric)+' readings']};
  var after=[],without=[];
  series.forEach(function(d){
    var prev=byDate[addDays(d.date,-1)];
    (prev?after:without).push(d.value);
  });
  if(after.length<4||without.length<4)return {status:'insufficient',
    need:['days both with and without '+(MOVEMENT_ROLES[role]||{}).label+' before them']};
  var diff=mean(after)-mean(without);
  var pooled=Math.sqrt((Math.pow(sd(after)||0,2)+Math.pow(sd(without)||0,2))/2);
  var d2=pooled?diff/pooled:null;
  return {status:'ok',cls:'EMPIRICAL',role:role,metric:metric,
    afterDays:after.length,otherDays:without.length,
    afterMean:round(mean(after),2),otherMean:round(mean(without),2),
    difference:round(diff,2),standardised:d2!=null?round(d2,2):null,
    meaningful:d2!=null&&Math.abs(d2)>=0.5,
    note:'Days following '+(MOVEMENT_ROLES[role]||{}).label.toLowerCase()+' against days that did not. Observational \u2014 you choose when to do this, and the reasons you choose are probably related to how you already felt.',
    confidence:after.length>=12&&d2!=null&&Math.abs(d2)>=0.5?'medium':'low'};
}
/* ---------------- registered as one domain ---------------- */
registerDomain({
  id:'movement',label:'Movement and preparation',priority:35,ontology:'MOVEMENT_ROLES',actions:['move.prepare','move.assess','nav.mobility'],
  propose:function(st){
    var out=[];
    try{
      ASSESSMENTS.forEach(function(a2){
        var as=assessmentState(a2.id);
        if(as&&as.status!=='ok')return;
        if(as&&as.change!=null&&as.change<=-2)
          out.push({verb:'Look at your '+a2.label.toLowerCase(),
            why:[a2.label+' has fallen '+fmtSigned(as.change,1)+' '+a2.unit+' since baseline',
                 'it limits '+(a2.requiredFor||[]).join(' and ')],
            cls:'MEASURED',confidence:'medium',priority:34,act:'nav.mobility',
            reverseIf:['it comes back on a re-test, since range measured on different days varies anyway']});
      });
    }catch(e){}
    return out;
  },
  observes:['soreness','fatigue','note'],
  state:function(){
    var dose=movementDoseTotals(7);
    var log=movementLog({from:addDays(asOf(),-7)});
    if(!log.length)return {status:'insufficient',need:['mobility, warm-up or practice sessions logged'],
      headline:'no movement work recorded',
      why:'Preparation, mobility and practice are invisible to the system until they are logged, so none of their effects can be judged.'};
    var byRole={};log.forEach(function(m){byRole[m.role]=(byRole[m.role]||0)+1;});
    var mc=null;try{mc=movementConfidence();}catch(e){}
    return {status:'ok',cls:'MEASURED',sessions:log.length,byRole:byRole,dose:dose.totals,
      confidence:mc?mc.confidence:'low',doseCoverage:mc?mc.coverage:null,
      uncertaintyNote:mc?mc.note:null,
      headline:log.length+' session'+(log.length===1?'':'s')+' this week \u00b7 '+
        Object.keys(byRole).map(function(r){return (MOVEMENT_ROLES[r]||{}).label||r;}).slice(0,3).join(', '),
      note:dose.note};
  },
  findings:function(st){
    if(st.status!=='ok')return [];
    var out=[];
    if(st.dose.mobility>=3&&st.dose.stimulus<0.5)out.push({
      text:'this week is almost entirely mobility and practice, with very little loaded stimulus',
      cls:'DERIVED',confidence:'medium',severity:'info',basis:'dose accounting across five dimensions'});
    ASSESSMENTS.forEach(function(a){
      var as=assessmentState(a.id);
      if(as&&as.status==='ok'&&as.change!=null&&as.interventionsBetween===0&&Math.abs(as.change)>=1)
        out.push({text:a.label+' changed '+fmtSigned(as.change,1)+' '+a.unit+' with no recorded work on that region',
          cls:'MEASURED',confidence:'low',severity:'info',
          basis:'a change without an intervention is not evidence that anything worked'});
    });
    return out;
  },
  gaps:function(st){
    var out=[];
    ASSESSMENTS.slice(0,2).forEach(function(a){
      var as=assessmentState(a.id);
      if(!as||as.status!=='ok')out.push({question:'What is your '+a.label.toLowerCase()+'?',
        need:[a.how],limits:as?as.limits:'any claim that mobility work changed anything',
        burden:0.15,value:0.45,act:'move.assess',arg:a.id});
    });
    if(st.status!=='ok')out.push({question:'Does your warm-up or mobility work do anything for you?',
      need:['preparation and mobility sessions logged'],limits:'every cross-modality question',
      burden:0.25,value:0.5,act:'move.prepare'});
    return out;
  },
  knowledge:function(st){
    if(st.status!=='ok')return [];
    var out=[];
    ['mobility','practice'].forEach(function(role){
      var r=crossModalityEffect(role,'fatigue');
      if(r.status==='ok'&&r.meaningful)out.push({kind:'movement',
        subject:'day after '+(MOVEMENT_ROLES[role]||{}).label.toLowerCase(),
        statement:'fatigue '+fmtSigned(r.difference,1)+' against days without it',
        confidence:r.confidence,evidence:r.afterDays+' days after, '+r.otherDays+' without',
        context:'observational',lastValidated:asOf(),
        transfers:'you choose when to do this, and that choice is probably related to how you already felt'});
    });
    return out;
  }
});
