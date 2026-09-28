/* ============================================================================
   REGION: DEMO + FIXTURES — a deterministic generator (seeded PRNG) for the demo record and the test
   scenarios. Demo data is marked source:'demo' and DB.demo.active; it never mixes with real entries.
   ============================================================================ */
function _rng(seed){var s=seed>>>0||1;return function(){s=(s*1664525+1013904223)>>>0;return s/4294967296;};}
function _gauss(r){var u=Math.max(1e-9,r()),v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
/* spec: {days, start:'ISO'|null (defaults so the record ends today), weight0, segments:[{from,to,rate(lb/wk),noise}], phase:{...}, logging:{cal,weight,steps,sleep}, calories:{target,sd}, protein:{target,sd}, steps:[{from,to,mean,sd}], sleep:[{from,to,mean,sd}], hunger:[{from,to,mean}], fatigue:[{from,to,mean}], waist:{start,ratePerWeek,flatFrom,flatTo}, training:{program,switchDay,strength:'up'|'flat'|'down'|'downFrom:<day>'}, cardio:[{from,to,perWeek}], context:[{day,text}], experiments:[{day,variable,from,to,predLo,predHi,recheckDays,supported}], seed} */
function generateRecord(spec,seedIn){
  var r=_rng(spec.seed||seedIn||7);var days=spec.days||70;var today=todayISO();var start=spec.start||addDays(today,-(days-1));
  var db=emptyDB();db.profile=Object.assign(db.profile,{name:spec.name||'Demo',age:24,sex:'male',heightIn:72,startWeightLb:spec.weight0||270,goalWeightLb:spec.goal||180,goalType:'fat loss',targetDate:addDays(start,26*7),trainingExperience:'novice-intermediate',activityBaseline:'light',dietPreference:'omnivore',equipment:'commercial gym',schedule:'rotating shifts',sleepTargetH:7.5,createdAt:start+'T08:00:00.000Z'});
  var ph=Object.assign({id:'phase-demo-1',type:'cut',startDate:start,endDate:null,status:'active',objective:'fat loss with lean-mass retention',calorieTarget:2400,proteinTarget:195,fatFloor:70,fiberTarget:35,stepTarget:8000,cardioSessions:2,cardioMinutes:30,trainingSessions:3,sleepTargetH:7.5,targetRateLo:-2.5,targetRateHi:-1.5,goalWeightLb:spec.goal||180,targetDate:addDays(start,26*7),successCriteria:'\u22651.5 lb/wk with strength held',stopCriteria:'strength falling 3 sessions + recovery poor',transitionCriteria:'7-day average \u2264 goal',startingState:{weight:spec.weight0||270,waist:46},targetSource:'user',createdAt:start+'T08:00:00.000Z',notes:'demo record'},spec.phase||{});
  db.phases.push(ph);
  var obs=db.observations;var d=function(i){return addDays(start,i);};var stamp=function(i){return d(i)+'T'+(spec.stampHour||'07')+':30:00.000Z';};
  var push=function(type,i,value,extra){if(value==null)return;var o=makeObservation(Object.assign({type:type,date:d(i),value:value,source:'demo',quality:'demo',at:stamp(i),createdAt:stamp(i)},extra||{}));o.phaseId=ph.id;obs.push(o);return o;};
  var seg=function(list,i,def){for(var k=0;k<(list||[]).length;k++){if(i>=list[k].from&&i<list[k].to)return list[k];}return def;};
  var log=spec.logging||{};var pw=log.weight!=null?log.weight:0.9,pc=log.cal!=null?log.cal:0.85,ps=log.steps!=null?log.steps:0.9,pl=log.sleep!=null?log.sleep:0.85;
  var w=spec.weight0||270;var trueW=w;
  for(var i=0;i<days;i++){
    var s=seg(spec.segments,i,{rate:-1.5,noise:0.9});trueW+=s.rate/7;
    if(r()<pw)push('weight',i,round(trueW+_gauss(r)*(s.noise!=null?s.noise:0.9),1),{method:'scale'});
    var cal=spec.calories||{target:2400,sd:150};var weekend=(i%7===5||i%7===6);
    if(r()<pc){var cv=cal.target+_gauss(r)*cal.sd+(weekend&&spec.weekendBump!==false?150:0)+(cal.driftPerDay?cal.driftPerDay*i:0);push('calories',i,Math.round(cv));var pt=spec.protein||{target:193,sd:11};push('protein',i,Math.round(pt.target+_gauss(r)*pt.sd));push('carbs',i,Math.round(220+_gauss(r)*40));push('fat',i,Math.round(75+_gauss(r)*12));push('fiber',i,Math.round(30+_gauss(r)*7));if(r()<0.6)push('adherence',i,Math.round(clamp(88+_gauss(r)*8,40,100)));}
    var st=seg(spec.steps,i,{mean:7500,sd:1400});if(r()<ps)push('steps',i,Math.max(1500,Math.round(st.mean+_gauss(r)*st.sd)));
    var sl=seg(spec.sleep,i,{mean:7.2,sd:0.7});if(r()<pl){push('sleep',i,round(clamp(sl.mean+_gauss(r)*sl.sd,3.5,10),1));push('sleepq',i,Math.round(clamp((sl.mean>=7?7:4.5)+_gauss(r)*1.2,1,10)));}
    var hu=seg(spec.hunger,i,{mean:4});if(r()<0.7){push('hunger',i,Math.round(clamp(hu.mean+_gauss(r)*1.2,1,10)));if(r()<0.5)push('cravings',i,Math.round(clamp(hu.mean-0.5+_gauss(r)*1.4,1,10)));}
    var fa=seg(spec.fatigue,i,{mean:4});if(r()<0.7){push('fatigue',i,Math.round(clamp(fa.mean+_gauss(r)*1.1,1,10)));if(r()<0.5)push('stress',i,Math.round(clamp(4+_gauss(r)*1.5,1,10)));if(r()<0.5)push('soreness',i,Math.round(clamp((i%7===1||i%7===3)?5:3.5+_gauss(r)*1.2,1,10)));}
    if(spec.waist&&i%7===0){var wk=i/7;var wz=spec.waist;var inFlat=wz.flatFrom!=null&&i>=wz.flatFrom&&i<wz.flatTo;var flatWeeks=wz.flatFrom!=null?Math.max(0,Math.min(i,wz.flatTo)-wz.flatFrom)/7:0;var waistV=wz.start+wz.ratePerWeek*(wk-(inFlat?(i-wz.flatFrom)/7:flatWeeks))+_gauss(r)*0.15;push('waist',i,round(waistV,2),{method:'tape'});if(i%28===0)push('neck',i,round(17+_gauss(r)*0.1,2),{method:'tape'});}
    (spec.context||[]).forEach(function(c){if(c.day===i)push('context',i,c.text);});
    if(spec.supplements!==false&&i>=3&&i%1===0&&r()<0.5)push('supplement',i,'creatine 5 g');
    if(spec.supplements!==false&&i>=40){push('supplement',i,'Vitamin D3 50 \u00b5g',{meta:{supplementId:'vitd',dose:50,unit:'\u00b5g'}});if(i%7===2||i%7===4)push('supplement',i,'Caffeine 200 mg',{meta:{supplementId:'caffeine',dose:200,unit:'mg'}});}
    var car=seg(spec.cardio,i,{perWeek:2});var cardioDays=car.perWeek>=3?[3,5,6]:(car.perWeek===2?[3,5]:(car.perWeek===1?[5]:[]));if(cardioDays.indexOf(i%7)>=0)(function(){var mins=30+(car.perWeek>=3?10:0);   /* heart rate at the same work falls as fitness improves */
      push('cardio',i,mins,{method:'incline walk',meta:{hr:Math.round(138-i*0.12+((i*37)%5-2)),distance:+(3.2*mins/60).toFixed(2),distanceUnit:'mi',grade:10,rpe:6}});})();
    push('rhr',i,Math.round(70-i*0.08+((i*13)%3-1)));push('water',i,+(2.1+((i*7)%9)/10).toFixed(1));if(i%14===3)push('bodyfat',i,+(32-i*0.05).toFixed(1));
  }
  /* training */
  var tr=spec.training||{program:'fullbody3',switchDay:42,strength:'up'};var lifts={'Squat':185,'Bench press':155,'Lat pulldown':130,'Romanian deadlift':155,'Leg press':320,'Incline DB press':55,'Seated cable row':120,'Overhead press':95};
  var sessCount=0;
  for(var j=0;j<days;j++){var dow=j%7;var fb=(!tr.switchDay||j<tr.switchDay);var lift=fb?(dow===0||dow===2||dow===4):(dow===0||dow===1||dow===3||dow===4);if(!lift)continue;if(r()<(spec.trainingSkip||0.1))continue;sessCount++;
    var name=fb?(dow===2?'Full body B':'Full body A'):(dow===0?'Upper A':dow===1?'Lower A':dow===3?'Upper B':'Lower B');
    var list=fb?(dow===2?['Leg press','Incline DB press','Seated cable row']:['Squat','Bench press','Lat pulldown','Romanian deadlift']):(dow===0?['Bench press','Lat pulldown','Incline DB press']:dow===1?['Squat','Romanian deadlift','Leg press']:dow===3?['Overhead press','Seated cable row','Lat pulldown']:['Leg press','Romanian deadlift','Squat']);
    var prog=0;if(tr.strength==='up')prog=1;else if(tr.strength==='flat')prog=0;else if(tr.strength==='down')prog=-1;else if(typeof tr.strength==='string'&&tr.strength.indexOf('downFrom:')===0)prog=j>=parseInt(tr.strength.slice(9),10)?-1:1;
    if(spec.weakWeek&&j>=spec.weakWeek.from&&j<spec.weakWeek.to)prog=-1;
    var sets=[];list.forEach(function(ex){var base=lifts[ex];var trendPct=prog*0.006*sessCount+(prog<0?-0.02*Math.max(0,sessCount-1)*0.3:0);var load=roundTo(base*(1+trendPct)+_gauss(r)*base*(prog<0?0.006:0.015),5);var reps=prog<0?Math.max(5,8-Math.round(Math.abs(_gauss(r))*0.6)):8+Math.round(Math.abs(_gauss(r)));for(var k=0;k<3;k++)sets.push({exercise:ex,load:load,reps:Math.max(4,reps-k),rir:k===2?1:2});});
    db.sessions.push({id:uid('sess'),date:d(j),name:name,template:fb?'fb':'ul',durationMin:fb?55:60,notes:'',source:'demo',createdAt:stamp(j),sets:sets,phaseId:ph.id,retracted:false});
  }
  /* the demo record must carry the same provenance a real record would: a program switch is a dated event,
     not just a current-state field, or replay of the weeks before the switch shows the wrong program */
  db.settings.programHistory=[{at:stamp(0),program:'fullbody3',from:null,source:'demo'}];
  if(tr.switchDay&&days>tr.switchDay){ph.trainingSessions=4;db.settings.program='upperlower4';
    db.settings.programHistory.push({at:stamp(tr.switchDay),program:'upperlower4',from:'fullbody3',source:'demo'});
    db.observations.push(makeObservation({type:'context',date:d(tr.switchDay),value:'new program (4\u00d7 upper/lower)',source:'demo',createdAt:stamp(tr.switchDay)}));}
  else db.settings.program='fullbody3';
  db.demo={active:true,generatedAt:nowISO(),scenario:spec.name||'demo'};db.settings.onboarded=true;
  return {db:db,start:start,ph:ph,d:d};
}
/* Apply the model layer to a generated record over time: stamp predictions, score them, run decisions,
   apply interventions and evaluate experiments exactly as the app would have done on those dates. */
function replayHistory(gen,spec){
  var prev=DB;DB=gen.db;_memoInvalidate();
  var days=spec.days||70;var today=todayISO();
  try{
    for(var i=13;i<days;i++){var date=gen.d(i);if(date>today)break;
      withAsOf(date,function(){
        _memoInvalidate();
        if((i-13)%3===0){var made=stampPredictions();made.forEach(function(p){p.madeAt=date+'T12:00:00.000Z';});}
        scorePredictions();
        (spec.experiments||[]).forEach(function(e){
          if(e.day===i){var dec=decide();var iv={variable:e.variable,from:e.from,to:e.to,expected:e.expected||('about '+fmtRateRange(e.predLo,e.predHi)+' additional change'),recheckDays:e.recheckDays||14};var fake=Object.assign({},dec,{code:e.code||'ADD_STEPS',verb:e.verb||'Add steps, hold calories',intervention:iv,priority:'plateau',lede:e.lede||dec.lede});var exp=applyDecisionIntervention(fake);exp.predLo=e.predLo;exp.predHi=e.predHi;exp.startDate=date;exp.recheckDate=addDays(date,e.recheckDays||14);exp.createdAt=date+'T12:00:00.000Z';exp.baseline=baselineSnapshot();var dd=DB.decisions[DB.decisions.length-1];if(dd){dd.date=date;dd.at=date+'T12:00:00.000Z';}}
          if(e.day+(e.recheckDays||14)===i){var ex=DB.experiments.filter(function(x){return x.status==='active';})[0];if(ex){var res=evaluateExperiment(ex.id,{asOf:date});if(res){ex.completedAt=date+'T12:00:00.000Z';var neg=DB.negatives[DB.negatives.length-1];if(neg&&neg.date>date){neg.date=date;neg.at=date+'T12:00:00.000Z';}}}}
        });
        if(i%7===6||i===days-1){var dec2=decide();var rec=recordDecision(dec2);if(rec&&rec.date!==date){rec.date=date;rec.at=date+'T12:00:00.000Z';rec.recheckDate=rec.recheckDays?addDays(date,rec.recheckDays):null;}captureSnapshot();var sn=DB.snapshots[DB.snapshots.length-1];if(sn)sn.date=date;}
      });
    }
    DB.predictions.forEach(function(p){if(p.status==='pending'&&p.dueDate<today){/* scored at the end */}});
    _memoInvalidate();scorePredictions();
  }finally{var out=DB;DB=prev;_memoInvalidate();return out;}
}
var DEMO_SPEC={name:'Demo cut',days:70,weight0:270,goal:180,
  segments:[{from:0,to:10,rate:-4.9,noise:1.1},{from:10,to:35,rate:-1.9,noise:0.9},{from:35,to:49,rate:-0.15,noise:0.9},{from:49,to:99,rate:-1.4,noise:0.85}],
  steps:[{from:0,to:49,mean:7500,sd:1400},{from:49,to:99,mean:9700,sd:1200}],
  sleep:[{from:0,to:28,mean:7.2,sd:0.7},{from:28,to:35,mean:5.8,sd:0.5},{from:35,to:99,mean:7.3,sd:0.6}],
  hunger:[{from:0,to:28,mean:4},{from:28,to:49,mean:6.2},{from:49,to:99,mean:4.5}],
  fatigue:[{from:0,to:28,mean:4},{from:28,to:36,mean:7.6},{from:36,to:99,mean:4.2}],
  waist:{start:46.0,ratePerWeek:-0.32,flatFrom:35,flatTo:49},
  training:{program:'fullbody3',switchDay:42,strength:'up'},weakWeek:{from:28,to:36},
  cardio:[{from:0,to:49,perWeek:2},{from:49,to:99,perWeek:3}],
  context:[{day:3,text:'creatine started'},{day:29,text:'travel: two nights away, sleep poor'},{day:49,text:'intervention: steps +2,000/day'}],
  experiments:[{day:49,variable:'steps',from:7500,to:9500,predLo:-0.4,predHi:-0.2,recheckDays:14}]};
function loadDemo(){
  if(typeof _PLAN_HOOKS_OFF!=='undefined')_PLAN_HOOKS_OFF++;
  try{return _loadDemoInner();}finally{if(typeof _PLAN_HOOKS_OFF!=='undefined')_PLAN_HOOKS_OFF=Math.max(0,_PLAN_HOOKS_OFF-1);
    if(typeof ensurePlan==='function'){try{ensurePlan();}catch(e){_q(e,'P1');}}}
}
function _loadDemoInner(){
  var gen=generateRecord(DEMO_SPEC,11);var db=replayHistory(gen,DEMO_SPEC);
  // steps intervention also raised the phase target and cardio (as the decision prescribed)
  var ph=db.phases[0];ph.stepTarget=9500;ph.cardioSessions=3;ph.cardioMinutes=40;
  DB=db;_memoInvalidate();
  if(typeof dismissWelcome==='function')dismissWelcome();
  try{seedDemoFoodLogs();}catch(e){_q(e);}
  /* a supplement regimen: creatine daily, vitamin D daily, caffeine on training days */
  DB.settings.supplementStack=[{id:'creatine',dose:5,unit:'g',when:'daily'},{id:'vitd',dose:50,unit:'\u00b5g',when:'daily'},{id:'caffeine',dose:200,unit:'mg',when:'training days'}];
  /* The generator writes the record directly rather than through the mutators, so the event log must be
     restarted from it. Without this the log would describe a different record than the one on screen. */
  try{
    resetEventLog('demo record generated');
    /* A generated record should look like one that GREW, not one adopted today. Without a profile event
       dated at the start, the adoption snapshot becomes the reconstruction boundary and every replay of the
       demo correctly reports the profile as unavailable — which is honest but makes the demo useless for
       showing what replay does. Seeding the profile at day one gives the demo real history rather than
       loosening the rule for it. */
    var firstDay=(DB.observations||[]).map(function(o){return o.date;}).sort()[0];
    if(firstDay){
      var savedNow=_NOW_OVERRIDE;
      _NOW_OVERRIDE=firstDay;
      emitEvent('profile.changed',JSON.parse(JSON.stringify(DB.profile||{})),{at:firstDay+'T08:00:00.000Z'});
      _NOW_OVERRIDE=savedNow;
    }
  }catch(e){_q(e,'P1');}
  /* Capture today's snapshot here, as the last step, so the loaded record is in one definite state. Boot also
     captures today's snapshot on a timer; whether that timer fired before or after the demo loaded decided whether
     today's snapshot existed, and the maintenance baseline — a median over a handful of snapshots — read 2,662 kcal
     in some loads and 2,606 in others from identical data. The reproducibility gate caught it. A capture replaces
     any snapshot for the same day, so a second one from the timer is harmless. */
  /* The demo's last four weeks carry effort ratings, as a record would once someone began rating sessions, so the
     session-load basis (effort \u00d7 duration) is exercised by the demo itself. Deterministic: derived from each
     session's hard sets. */
  (DB.sessions||[]).forEach(function(x){if(x.retracted||x.date<addDays(todayISO(),-27))return;
    var hard=(x.sets||[]).filter(function(st){return st.rir==null||st.rir<=3;}).length;
    x.effort=Math.max(5,Math.min(9,Math.round(5+hard/4)));if(!x.durationMin)x.durationMin=40+hard*2;});
  if(typeof captureSnapshot==='function'){try{captureSnapshot();}catch(e){}}
  save('demo:load');
  return db;
}
function seedDemoFoodLogs(){
  var picks=[['breakfast','eggs grade a large egg whole',150],['breakfast','oats rolled old fashioned',80],['breakfast','milk 2%',250],['lunch','chicken breast skinless boneless cooked braised',220],['lunch','rice white long grain raw',90],['lunch','broccoli raw',150],['lunch','avocado',60],['dinner','salmon atlantic',180],['dinner','sweet potatoes orange flesh',300],['snacks','yogurt greek plain nonfat',250],['snacks','bananas ripe',120],['snacks','almonds whole raw',30]];
  var today=todayISO();[0,1,2].forEach(function(back){var date=addDays(today,-back);picks.forEach(function(p){var f=foodSearchLocal(p[1],1)[0];if(!f)return;DB.foodLogs.push({id:uid('fl'),date:date,meal:p[0],food:foodSnapshot(f),quantity:p[2],basis:'g',grams:p[2],ml:null,servings:null,portionLabel:p[2]+' g',nutrients:nutrientsFor(f,p[2]),createdAt:date+'T12:00:00.000Z',source:'demo'});});syncNutritionObservations(date);DB.observations.filter(function(o){return o.date===date&&o.source==='food-log';}).forEach(function(o){o.quality='demo';});});
}
/* ---- fixtures for the self-test: each returns a DB ---- */
var FIXTURES={
  /* Covers what the other fixtures and the demo never exercise, each through its real write path: a phase ended with
     an outcome, a session corrected (which supersedes the original), and sessions rated for effort. Built with
     persistence suspended, so constructing it can never touch the stored record. */
  corrections_and_outcomes:function(){
    var g=generateRecord({name:'corrections_and_outcomes',days:42,weight0:250,segments:[{from:0,to:99,rate:-1.2,noise:0.6}],
      training:{program:'fullbody3',strength:'up'},logging:{cal:1,weight:1,steps:1,sleep:1}},29).db;
    var keep=DB;_PERSIST_SUSPENDED++;DB=g;_memoInvalidate();
    try{
      var ph=activePhase();if(ph)endPhase(ph.id,'reached the milestone \u2014 7 lb down, strength held');
      startPhase({type:'diet_break',startDate:todayISO(),objective:'two weeks at maintenance'});
      var S=DB.sessions.filter(function(x){return !x.retracted&&!x.supersededBy;});
      if(S.length>4)updateSession(S[S.length-4].id,{notes:'corrected: one set had been entered twice'});
      DB.sessions.filter(function(x){return !x.retracted&&!x.supersededBy;}).slice(-3).forEach(function(x,i){x.effort=[6,8,7][i];x.durationMin=x.durationMin||[55,65,60][i];});
    }finally{DB=keep;_PERSIST_SUSPENDED=Math.max(0,_PERSIST_SUSPENDED-1);_memoInvalidate();}
    return g;
  },
  normal_loss:function(){return generateRecord({name:'normal_loss',days:28,weight0:262,segments:[{from:0,to:99,rate:-1.6,noise:0.6}],waist:{start:45,ratePerWeek:-0.3},training:{program:'fullbody3',strength:'up'},phase:{targetRateLo:null,targetRateHi:null}},21).db;},
  rapid_water:function(){return generateRecord({name:'rapid_water',days:12,weight0:270,segments:[{from:0,to:10,rate:-5.5,noise:1.0},{from:10,to:99,rate:-1.8,noise:0.9}],training:{program:'fullbody3',strength:'up'},context:[{day:1,text:'cut started'}]},22).db;},
  stall:function(){return generateRecord({name:'stall',days:35,weight0:245,segments:[{from:0,to:7,rate:-1.2,noise:0.7},{from:7,to:99,rate:0.0,noise:0.7}],logging:{cal:1,weight:1,steps:1,sleep:1},waist:{start:44,ratePerWeek:0,flatFrom:0,flatTo:99},training:{program:'fullbody3',strength:'flat'},weekendBump:false},23).db;},
  inconsistent:function(){return generateRecord({name:'inconsistent',days:28,weight0:250,segments:[{from:0,to:99,rate:-1.0,noise:1.2}],logging:{cal:0.35,weight:0.6,steps:0.4,sleep:0.4},training:{program:'fullbody3',strength:'flat'}},24).db;},
  reduced_neat:function(){return generateRecord({name:'reduced_neat',days:28,weight0:240,segments:[{from:0,to:99,rate:-0.6,noise:0.6}],steps:[{from:0,to:12,mean:9200,sd:900},{from:12,to:99,mean:6100,sd:900}],cardio:[{from:0,to:99,perWeek:3}],training:{program:'fullbody3',strength:'flat'},logging:{cal:1,weight:1,steps:1,sleep:1},phase:{targetRateLo:null,targetRateHi:null}},25).db;},
  excessive:function(){return generateRecord({name:'excessive',days:35,weight0:255,segments:[{from:0,to:99,rate:-3.6,noise:0.9}],hunger:[{from:0,to:99,mean:8}],fatigue:[{from:0,to:99,mean:8}],sleep:[{from:0,to:99,mean:5.6,sd:0.5}],training:{program:'fullbody3',strength:'down'},calories:{target:1700,sd:120},logging:{cal:1,weight:1,steps:1,sleep:1}},26).db;},
  strength_decline:function(){return generateRecord({name:'strength_decline',days:35,weight0:235,segments:[{from:0,to:99,rate:-1.4,noise:0.6}],training:{program:'fullbody3',strength:'downFrom:14'},phase:{targetRateLo:null,targetRateHi:null},logging:{cal:1,weight:1,steps:1,sleep:1}},27).db;},
  successful_cut:function(){return generateRecord({name:'successful_cut',days:56,weight0:265,segments:[{from:0,to:99,rate:-1.7,noise:0.6}],waist:{start:45.5,ratePerWeek:-0.35},training:{program:'fullbody3',switchDay:35,strength:'up'},logging:{cal:0.95,weight:0.95,steps:0.9,sleep:0.9}},28).db;},
  maintenance:function(){return generateRecord({name:'maintenance',days:35,weight0:190,goal:185,segments:[{from:0,to:99,rate:0.05,noise:0.5}],phase:{type:'maintenance',calorieTarget:2900,targetRateLo:-0.25,targetRateHi:0.25,goalWeightLb:null},calories:{target:2900,sd:150},training:{program:'upperlower4',strength:'up'},logging:{cal:1,weight:1,steps:1,sleep:1}},29).db;},
  regain:function(){return generateRecord({name:'regain',days:42,weight0:186,goal:185,segments:[{from:0,to:99,rate:0.9,noise:0.5}],phase:{type:'maintenance',calorieTarget:3100,targetRateLo:-0.25,targetRateHi:0.25,goalWeightLb:null},calories:{target:3200,sd:180},training:{program:'upperlower4',strength:'flat'},logging:{cal:1,weight:1,steps:1,sleep:1}},30).db;},
  insufficient:function(){return generateRecord({name:'insufficient',days:4,weight0:270,segments:[{from:0,to:99,rate:-2,noise:1}],logging:{weight:1,cal:0.5},training:{program:'fullbody3',strength:'flat'}},31).db;},
  calibration:function(){var g=generateRecord({name:'calibration',days:63,weight0:260,segments:[{from:0,to:99,rate:-1.5,noise:0.8}],training:{program:'fullbody3',strength:'up'},logging:{cal:1,weight:1,steps:1,sleep:1}},32);return replayHistory(g,{days:63});},
  failed_intervention:function(){var g=generateRecord({name:'failed_intervention',days:56,weight0:245,segments:[{from:0,to:14,rate:-1.2,noise:0.7},{from:14,to:99,rate:-0.05,noise:0.7}],steps:[{from:0,to:35,mean:7600,sd:900},{from:35,to:99,mean:9600,sd:900}],waist:{start:44,ratePerWeek:0,flatFrom:14,flatTo:99},training:{program:'fullbody3',strength:'flat'},logging:{cal:1,weight:1,steps:1,sleep:1},weekendBump:false,experiments:[{day:35,variable:'steps',from:7600,to:9600,predLo:-0.4,predHi:-0.2,recheckDays:14}]},33);return replayHistory(g,{days:56,experiments:[{day:35,variable:'steps',from:7600,to:9600,predLo:-0.4,predHi:-0.2,recheckDays:14}]});},
  successful_intervention:function(){var g=generateRecord({name:'successful_intervention',days:56,weight0:245,segments:[{from:0,to:14,rate:-1.2,noise:0.7},{from:14,to:35,rate:-0.05,noise:0.7},{from:35,to:99,rate:-1.3,noise:0.6}],steps:[{from:0,to:35,mean:7600,sd:900},{from:35,to:99,mean:9600,sd:900}],waist:{start:44,ratePerWeek:-0.3,flatFrom:14,flatTo:35},training:{program:'fullbody3',strength:'up'},logging:{cal:1,weight:1,steps:1,sleep:1},weekendBump:false,phase:{targetRateLo:null,targetRateHi:null},experiments:[{day:35,variable:'steps',from:7600,to:9600,predLo:-0.4,predHi:-0.2,recheckDays:14}]},34);return replayHistory(g,{days:56,experiments:[{day:35,variable:'steps',from:7600,to:9600,predLo:-0.4,predHi:-0.2,recheckDays:14}]});}
};
/* A fixture is a record from outside the log, so the log is restarted for its duration and restored after.
   Both the record and its history have to be put back, or a test would leave the caller with a log that
   describes a record that is no longer loaded. */
function withFixture(name,fn){
  var prev=DB,prevEvents=(typeof _EVENTS!=='undefined')?_EVENTS.slice():null,prevSeq=(typeof _EVENT_SEQ!=='undefined')?_EVENT_SEQ:0;
  _PERSIST_SUSPENDED++;
  var db;try{db=FIXTURES[name]();}catch(e){_PERSIST_SUSPENDED=Math.max(0,_PERSIST_SUSPENDED-1);throw e;}   /* never leave saving suspended */
  DB=db;_memoInvalidate();
  try{
    if(typeof resetEventLog==='function')resetEventLog('fixture: '+name);
    var fd=(DB.observations||[]).map(function(o){return o.date;}).sort()[0];
    if(fd&&typeof emitEvent==='function')
      emitEvent('profile.changed',JSON.parse(JSON.stringify(DB.profile||{})),{at:fd+'T08:00:00.000Z'});
  }catch(e){_q(e,'P2');}
  try{return fn(db);}
  finally{DB=prev;
    if(prevEvents){_EVENTS.length=0;Array.prototype.push.apply(_EVENTS,prevEvents);_EVENT_SEQ=prevSeq;}
    _PERSIST_SUSPENDED=Math.max(0,_PERSIST_SUSPENDED-1);_memoInvalidate();}
}
