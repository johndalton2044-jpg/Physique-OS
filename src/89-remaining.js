/* ============================================================================
   REGION: REMAINING DOMAINS (Work.md)

   The last sections with no implementation behind them. A note on how these were found: a keyword scan over
   Work.md flagged twenty-seven sections, but several were false alarms — "fatigue is not yet
   compartmentalized" is built, under the spelling "compartmentalised". That is vocabulary matching rather
   than capability checking, which is precisely the failure the model contract had before it was made to
   resolve references. The scan narrows what to look at; it does not decide.

   STATE (corrected in H0): all four are implemented and self-tested — recoveryAllocation, motorLearning,
   hydrationContext, supplementReview. The line that stood here said they were "genuinely absent", which had been
   false for several builds. They are registered as capabilities in 87-governance.js with result contracts, and each
   has a surface. What remains is H1 work: bringing them into Today and the attention queue. Each is bounded by what a
   phone record can actually support.
   ============================================================================ */

/* ---------------- RECOVERY RESOURCE ALLOCATION ----------------
   Recovery is finite and several things draw on it at once. The useful question is not "how recovered am I"
   but "what is currently spending it", because that is the thing you can change. */
var RECOVERY_DRAWS={
  training:{label:'Training load',modifiable:'directly'},
  deficit:{label:'Energy deficit',modifiable:'directly'},
  sleepDebt:{label:'Sleep debt',modifiable:'usually'},
  stress:{label:'Life stress',modifiable:'rarely, and not by training'},
  illness:{label:'Illness or injury',modifiable:'no'},
  activity:{label:'Non-training activity',modifiable:'partly'}
};
function recoveryAllocation(){
  var draws=[],unknown=[];
  var add=function(id,share,detail,evidence){
    draws.push({id:id,label:RECOVERY_DRAWS[id].label,share:share,detail:detail,
      modifiable:RECOVERY_DRAWS[id].modifiable,evidence:evidence});};
  var load=null;try{load=trainingLoad();}catch(e){}
  if(load&&load.status==='ok')add('training',load.ratio>1.3?3:(load.ratio>=0.8?2:1),
    load.band,'acute against chronic load');
  else unknown.push('training');
  var eb=null;try{eb=energyBalance();}catch(e){}
  if(eb&&eb.status==='ok'){
    var pct=eb.intake?Math.abs(eb.balance)/eb.intake*100:0;
    add('deficit',eb.balance<0?(pct>25?3:(pct>12?2:1)):0,
      eb.balance<0?('running about '+Math.round(pct)+'% below maintenance'):'not in a deficit','energy balance');
  }else unknown.push('deficit');
  var sl=null;try{sl=sleepState();}catch(e){}
  if(sl&&sl.status==='ok'){
    var target=(prof().sleepTargetH||7.5);
    var debt=target-(sl.mean||target);
    add('sleepDebt',debt>1.5?3:(debt>0.5?2:(debt>0?1:0)),
      debt>0?('averaging '+round(debt,1)+'h below your target'):'at or above your target','sleep log');
  }else unknown.push('sleepDebt');
  var st=seriesWindow('stress',14);
  if(st.length>=5){
    var m=mean(st.map(function(d){return d.value;}));
    add('stress',m>=7?3:(m>=5?2:1),'averaging '+round(m,1)+'/10','your own ratings');
  }else unknown.push('stress');
  var inj=[];try{inj=activeInjuries();}catch(e){}
  if(inj.length)add('illness',2,inj.length+' active issue(s)','injury log');
  var act=null;try{act=activityState();}catch(e){}
  if(act&&act.status==='ok')add('activity',act.mean>12000?2:1,fmtNum(act.mean,0)+' steps/day','step log');
  else unknown.push('activity');
  var total=draws.reduce(function(a,d){return a+d.share;},0);
  var ranked=draws.filter(function(d){return d.share>0;})
    .sort(function(a,b){return b.share-a.share;});
  var modifiable=ranked.filter(function(d){return d.modifiable==='directly';});
  return {status:draws.length?'ok':'insufficient',cls:'HEURISTIC',
    draws:ranked,total:total,unknown:unknown,
    largest:ranked[0]||null,
    firstLever:modifiable[0]||null,
    note:'What is currently drawing on recovery, ranked, with whether each is something you can actually change. "How recovered am I" is a number; "what is spending it" is a decision.',
    caveat:'The shares are an ordering, not a partition \u2014 they do not sum to a hundred per cent of anything real. '+
      (unknown.length?('Nothing is known about: '+unknown.join(', ')+', so those draw an unknown amount.'):'')};
}
/* ---------------- MOTOR LEARNING ----------------
   Skill acquisition is not strength. It shows as reduced variability at a given load before it shows as more
   load, which is a measurable thing if sets carry effort ratings. */
function motorLearning(exercise,opts){
  opts=opts||{};
  /* With no exercise named, every exercise with enough working sets is assessed. Called bare, this looked for sets of
     an exercise called "undefined" and asked for ten more of them. */
  if(!exercise){
    var counts={};sessionsOf({from:addDays(asOf(),-(opts.days||120))}).forEach(function(s){(s.sets||[]).forEach(function(st){
      if(st.load&&st.reps&&SET_KINDS[setKind(st)].volume)counts[st.exercise]=(counts[st.exercise]||0)+1;});});
    var names=Object.keys(counts).filter(function(k){return counts[k]>=10;}).sort(function(a,b){return counts[b]-counts[a];});
    if(!names.length)return {status:'insufficient',need:['10 working sets of any one exercise in the last '+(opts.days||120)+' days'],
      note:'Variability needs a reasonable number of sets before it means anything.'};
    return {status:'ok',mode:'all',cls:'DERIVED',rows:names.map(function(n){return Object.assign({exercise:n},motorLearning(n,opts));}),
      note:'Each exercise with at least ten working sets, assessed separately.'};
  }
  var days=opts.days||120;
  var rows=[];
  sessionsOf({from:addDays(asOf(),-days)}).forEach(function(s){
    (s.sets||[]).forEach(function(st){
      if(st.exercise!==exercise||!st.load||!st.reps)return;
      if(!SET_KINDS[setKind(st)].volume)return;
      var e=e1rmFrom(st.load,st.reps,st.rir);
      if(e!=null)rows.push({date:s.date,e1rm:e,load:st.load,reps:st.reps});
    });
  });
  if(rows.length<10)return {status:'insufficient',need:[(10-rows.length)+' more working sets of '+exercise],
    note:'Variability needs a reasonable number of sets before it means anything.'};
  rows.sort(function(a,b){return a.date<b.date?-1:1;});
  var half=Math.floor(rows.length/2);
  var early=rows.slice(0,half).map(function(r){return r.e1rm;});
  var late=rows.slice(half).map(function(r){return r.e1rm;});
  var cvEarly=mean(early)?(sd(early)||0)/mean(early):null;
  var cvLate=mean(late)?(sd(late)||0)/mean(late):null;
  var ex=null;try{ex=resolveExercise(exercise);}catch(e){}
  var skill=ex?ex.skill:'moderate';
  var tightening=(cvEarly!=null&&cvLate!=null)&&cvLate<cvEarly*0.8;
  return {status:'ok',cls:'EMPIRICAL',exercise:exercise,sets:rows.length,
    skillDemand:skill,
    variabilityEarly:cvEarly!=null?round(cvEarly*100,1):null,
    variabilityLate:cvLate!=null?round(cvLate*100,1):null,
    tightening:tightening,
    meanEarly:round(mean(early),1),meanLate:round(mean(late),1),
    interpretation:tightening?
      'your output at a given effort has become more consistent, which is what skill acquisition looks like before it looks like more load':
      ((cvLate!=null&&cvEarly!=null&&cvLate>cvEarly*1.2)?
        'your output has become less consistent, which usually means fatigue, a technique change, or varied conditions rather than lost skill':
        'consistency is roughly unchanged'),
    note:'Skill shows as reduced variability at a given effort before it shows as more load, so this tracks the spread rather than the mean.',
    caveat:'Variability also falls when training conditions become more consistent \u2014 same time of day, same equipment, same rest \u2014 and this cannot tell that apart from you getting better at the movement. High-skill lifts are where it is most meaningful.'};
}
/* ---------------- HYDRATION AND ELECTROLYTES ----------------
   Bounded hard: a phone record cannot assess hydration status. What it can do is identify when a weight
   reading is likely to be distorted by it. */
function hydrationContext(){
  var w=seriesWindow('weight',14);
  if(w.length<7)return {status:'insufficient',need:[(7-w.length)+' more weigh-ins']};
  var vals=w.map(function(d){return d.value;});
  var dayToDay=[];
  for(var i=1;i<vals.length;i++)dayToDay.push(Math.abs(vals[i]-vals[i-1]));
  var typical=dayToDay.length?median(dayToDay):null;
  var last=dayToDay.length?dayToDay[dayToDay.length-1]:null;
  var water=seriesWindow('water',7);
  var carbs=seriesWindow('carbs',7);
  var flags=[];
  if(last!=null&&typical!=null&&last>typical*2.5)
    flags.push('yesterday to today moved '+round(last,1)+' lb against a typical '+round(typical,1)+', which is more than body tissue changes in a day');
  if(carbs.length>=4){
    var cEarly=mean(carbs.slice(0,2).map(function(d){return d.value;}));
    var cLate=mean(carbs.slice(-2).map(function(d){return d.value;}));
    if(Math.abs(cLate-cEarly)>80)flags.push('carbohydrate intake shifted by about '+Math.round(Math.abs(cLate-cEarly))+' g, and glycogen carries water with it');
  }
  if(water.length>=4){
    var wm=mean(water.map(function(d){return d.value;}));
    if(wm<48)flags.push('logged fluid intake is low, which affects the scale before it affects anything else');
  }
  return {status:'ok',cls:'DERIVED',
    typicalDayToDay:typical!=null?round(typical,1):null,
    latestMove:last!=null?round(last,1):null,
    flags:flags,
    likelyDistorted:flags.length>0,
    note:flags.length?'Conditions that make today\u2019s weight a poor read on body tissue.':
      'Nothing suggests today\u2019s weight is unusually distorted.',
    caveat:'This does NOT assess your hydration. Nothing in a phone record can \u2014 that needs blood or urine markers. It only flags when the scale is likely to be reporting water movement, and a trend over a fortnight is the correct response to that rather than a single reading.'};
}
/* ---------------- ERGOGENICS AND SUPPLEMENTS ----------------
   The registry already ships evidence entries. What was missing is connecting a logged supplement to the
   evidence and to whether the person has ever actually tested it. */
function supplementReview(){
  var logged={};
  obsOf('supplement').forEach(function(o){
    var name=String(o.value||o.note||'').trim();
    if(name)logged[name.toLowerCase()]=(logged[name.toLowerCase()]||0)+1;});
  var names=Object.keys(logged);
  if(!names.length)return {status:'none',
    note:'No supplements logged. That is a perfectly reasonable position and this system will not suggest any.'};
  var rows=names.map(function(n){
    /* Matched against the NIH ODS ingredient list by key word. This searched REF_EVIDENCE by an e.name field those
       entries do not have; new RegExp(undefined) matches everything, so creatine was given the first entry in the list —
       a study of appetite after dieting. No match now means no evidence, never the wrong evidence. */
    var ev=null;
    ((REF_SUPPLEMENTS&&REF_SUPPLEMENTS.ingredients)||[]).forEach(function(e){
      if(ev)return;var full=String(e.name||'').toLowerCase(),key=full.replace(/\(.*\)/,'').trim().split(/\s+/);
      var words=key.filter(function(w){return w.length>3;});
      if(n.indexOf(full)>=0||words.some(function(w){return n.indexOf(w)>=0;}))ev=e;});
    /* Has this person ever tested it themselves? That outranks the literature for a decision about them. */
    var tested=(DB.experiments||[]).some(function(x){
      return x.status==='complete'&&String(x.intervention||x.variable||'').toLowerCase().indexOf(n)>=0;});   /* user text is not a pattern */
    return {name:n,days:logged[n],
      evidence:ev?{ingredient:ev.name,role:ev.role,efficacy:ev.efficacy,safety:ev.safety||null,source:REF_SUPPLEMENTS.id}:null,
      personallyTested:tested,
      standing:tested?'you have tested this yourself, which outranks the general evidence for a decision about you':
        (ev?'general evidence only \u2014 nothing in your record says whether it does anything for you':
          'not in the evidence registry and never tested here')};
  }).sort(function(a,b){return b.days-a.days;});
  return {status:'ok',cls:'MEASURED',rows:rows,
    untested:rows.filter(function(r){return !r.personallyTested;}).length,
    note:'What you take, what the general evidence says, and whether you have ever established that it does anything for you specifically.',
    caveat:'General efficacy and personal efficacy are different questions. A supplement with good population evidence can do nothing for you, and the only way to find out is an experiment with a washout \u2014 which is exactly what the experiment layer is for.'};
}
