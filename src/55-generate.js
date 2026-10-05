/* ============================================================================
   REGION: GENERATION (catalogue B1, B2, C1, C3, C4, T)
   Everything here PROPOSES. Nothing writes: a generated plan or meal day is a candidate the user accepts
   through the ordinary registered action, which is the same rule every domain follows.

   The shared discipline: a generator that always returns something is useless, because it cannot tell you
   when your constraints are impossible. Each of these reports what it could not satisfy rather than quietly
   relaxing a constraint to produce an answer.
   ============================================================================ */

/* ---------------- B1. PROGRAM GENERATION ----------------
   Build a week from the constraints that actually bind: days available, equipment, movements to cover, and
   anything sore. Candidates are then scored, and the score is shown — a plan you cannot audit is a plan you
   have to trust. */
var PATTERN_GROUPS={
  push:['horizontal push','incline push','vertical push'],
  pull:['vertical pull','horizontal pull'],
  squat:['squat','lunge','knee extension'],
  hinge:['hinge','knee flexion','hip extension'],
  /* The expanded library's patterns get groups of their own, so programmes can cover them. */
  core:['trunk flexion','hip flexion','anti-extension','anti-rotation','rotation','anti-lateral flexion'],
  carry:['carry','grip'],
  power:['jump','throw'],
  accessory:['elbow flexion','elbow extension','abduction','hip adduction','external rotation','plantar flexion','scapular elevation']
};
var SPLIT_TEMPLATES={
  fullbody:{minDays:2,maxDays:4,label:'Full body',
    day:function(){return ['squat','push','pull','hinge','accessory'];}},
  upperlower:{minDays:4,maxDays:4,label:'Upper / lower',
    day:function(i){return i%2===0?['push','pull','accessory']:['squat','hinge','accessory'];}},
  pushpulllegs:{minDays:3,maxDays:6,label:'Push / pull / legs',
    day:function(i){return [['push','accessory'],['pull','accessory'],['squat','hinge']][i%3];}}
};
function _availableExercises(equipment,avoidRegions){
  var out=[];
  Object.keys(EXERCISES||{}).forEach(function(k){
    var e=EXERCISES[k];
    if(!e||!e.pattern)return;
    var eq=Array.isArray(e.equipment)?e.equipment:(e.equipment?[e.equipment]:[]);
    if(eq.length&&!equipPossible(eq,equipment))return;
    /* A sore region excludes the movements that load it, which is the injury domain's own mapping reused
       rather than a second opinion about anatomy. */
    var blocked=(avoidRegions||[]).some(function(r){
      var reg=BODY_REGIONS[r];if(!reg)return false;
      return reg.patterns.indexOf(e.pattern)>=0;
    });
    if(blocked)return;
    out.push(e);
  });
  return out;
}
/* Experience decides which exercises are offered: at or below your level. Set by you (the welcome setup asks), or
   inferred from how long the record shows you training. */
var EXPERIENCE_RANK={beginner:0,intermediate:1,advanced:2};
function trainingExperience(){
  /* The profile's trainingExperience is the one home for this fact. */
  var PX={novice:'beginner','novice-intermediate':'beginner',intermediate:'intermediate',advanced:'advanced'};
  var st=PX[(DB.profile||{}).trainingExperience];if(st)return {level:st,source:'you said'};
  var S=(DB.sessions||[]).filter(function(x){return !x.retracted;}).map(function(x){return x.date;}).sort();
  var weeks=S.length?daysBetween(S[0],S[S.length-1])/7:0;
  return {level:weeks>=52?'advanced':(weeks>=12?'intermediate':'beginner'),source:'inferred from '+Math.round(weeks)+' weeks of training in the record'};
}
/* Dose by group: power is low volume while fresh; holds and carries are prescribed in seconds and metres. */
/* The dose follows the exercise, not the slot it filled: the carry slot also admits grip work, and the first version
   prescribed a wrist curl in metres. */
function _doseFor(group,e){
  if(group==='power')return [3,'3\u20135'];
  if(e&&e.pattern==='carry')return [3,'30\u201340 m'];
  if(e&&e.isometric)return [3,'20\u201340 s'];
  if(group==='carry')return [3,'12\u201315'];
  if(group==='core')return [3,'8\u201312'];
  var isCompound=['squat','hinge','push','pull'].indexOf(group)>=0;
  return isCompound?[3,'5\u20138']:[2,'8\u201312'];
}
function _pickFor(group,pool,used){
  var pats=group==='carryOnly'?['carry']:(PATTERN_GROUPS[group]||[]);
  var cands=pool.filter(function(e){return pats.indexOf(e.pattern)>=0&&!used[e.name];});
  if(!cands.length)cands=pool.filter(function(e){return pats.indexOf(e.pattern)>=0;});
  if(!cands.length)return null;
  /* Prefer what the record shows you respond to, then what you have actually been doing, then anything. */
  var scored=cands.map(function(e){
    var s=0;
    try{
      var r=(exerciseResponse().rows||[]).filter(function(x){return x.exercise===e.name;})[0];
      if(r&&r.status==='ok'&&r.direction==='rising')s+=3;
      if(r&&r.exposures)s+=Math.min(2,r.exposures/6);
    }catch(err){}
    if(e.compound)s+=1;
    return {e:e,s:s};
  }).sort(function(a,b){return b.s-a.s;});
  return scored[0].e;
}
function generatePrograms(opts){
  opts=opts||{};
  var eqState=null;try{eqState=equipmentState();}catch(e){}
  var equipment=opts.equipment||((eqState&&eqState.have&&eqState.have.length)?eqState.have:['bodyweight']);
  var days=opts.days||((DB.settings.trainingDays||[]).length?DB.settings.trainingDays.slice():null)||(function(){
    var sc=null;try{sc=scheduleState();}catch(e){}
    if(sc&&sc.status==='ok'){
      var d=Object.keys(sc.byDay).filter(function(k){return sc.byDay[k]>=2;});
      if(d.length)return d;
    }
    return ['Mon','Wed','Fri'];
  })();
  /* Calendar order, so a generated week reads like a week. */
  days=DAY_KEYS.filter(function(d){return days.indexOf(d)>=0;});
  var avoid=opts.avoidRegions||(function(){
    try{return activeInjuries().filter(function(i){return i.severity>=3;}).map(function(i){return i.region;});}catch(e){return [];}
  })();
  var exp=trainingExperience();
  var pool=_availableExercises(equipment,avoid).filter(function(e){return (EXPERIENCE_RANK[e.level||'intermediate']||0)<=EXPERIENCE_RANK[exp.level];});
  if(pool.length<4)return {status:'impossible',
    reason:'only '+pool.length+' movement(s) are possible with that equipment once sore areas are excluded',
    equipment:equipment,avoided:avoid,
    note:'Rather than generating something you cannot perform, this says the constraints cannot be met.'};
  var candidates=[];
  Object.keys(SPLIT_TEMPLATES).forEach(function(key){
    var t=SPLIT_TEMPLATES[key];
    if(days.length<t.minDays||days.length>t.maxDays)return;
    var dayNotes={},dayMinutes={};var templates={},week={},used={};
    days.forEach(function(day,i){
      var groups=t.day(i).slice();
      /* The expanded library's groups: core on every day, a different exercise each time; on lower and full-body days a
         carry to finish and, for intermediate and advanced lifters with the equipment, a jump or throw first while
         fresh. Templates never asked for these, so no generated programme could contain them. */
      var lowerDay=groups.indexOf('squat')>=0||groups.indexOf('hinge')>=0;
      if(lowerDay&&EXPERIENCE_RANK[exp.level]>=1&&pool.some(function(e){return (PATTERN_GROUPS.power||[]).indexOf(e.pattern)>=0;}))groups.unshift('power');
      groups.push('core');
      if(lowerDay)groups.push('carry');
      var name=key+'-'+(i+1);
      var rows=[];
      groups.forEach(function(g){
        /* The carry slot takes a real carry when one is possible, and grip work only when none is. */
        var e=g==='carry'?(_pickFor('carryOnly',pool,used)||_pickFor(g,pool,used)):_pickFor(g,pool,used);
        if(!e)return;
        used[e.name]=1;
        var d=_doseFor(g,e);
        rows.push([e.name,d[0],d[1],g]);
      });
      if(!rows.length)return;
      /* FIT THE SESSION LENGTH (H1). Generated to fit rather than checked afterwards: the least important work is
         trimmed first — accessories, then the carry, then power, then a set off core work, then a set off the main
         lifts — and every trim is stated. Estimate: 8 minutes of warm-up plus about 2.5 minutes per set. */
      var mins=opts.sessionMinutes||(typeof constraintModel==='function'?constraintModel().sessionMinutes:null);
      var est=function(){return 8+rows.reduce(function(a,r){return a+r[1];},0)*2.5;};
      var trims=[];
      if(mins){
        ['accessory','carry','power'].forEach(function(grp){for(var k=rows.length-1;k>=0&&est()>mins;k--){if(rows[k][3]===grp){trims.push('dropped '+rows[k][0]);rows.splice(k,1);}}});
        ['core','squat','hinge','push','pull'].forEach(function(grp){rows.forEach(function(r){if(est()>mins&&r[3]===grp&&r[1]>2){r[1]--;trims.push('one set fewer of '+r[0]);}});});
      }
      if(trims.length)(dayNotes[name]=trims);
      templates[name]=rows.map(function(r){return [r[0],r[1],r[2]];});
      dayMinutes[name]=Math.round(est());
      week[day]={label:t.label+' '+(i+1),kind:'lift',template:name};
    });
    if(!Object.keys(week).length)return;
    /* Score on what the plan can be judged on before it is run: coverage, volume, and fit to the week. */
    var covered={};
    Object.keys(templates).forEach(function(n){templates[n].forEach(function(r){
      var e=resolveExercise(r[0]);if(e)covered[e.pattern]=1;});});
    var groupsCovered=Object.keys(PATTERN_GROUPS).filter(function(g){
      return PATTERN_GROUPS[g].some(function(p){return covered[p];});}).length;
    var sets=Object.keys(templates).reduce(function(a,n){
      return a+templates[n].reduce(function(b,r){return b+r[1];},0);},0);
    candidates.push({
      key:key,label:t.label+' \u00b7 '+days.length+' days',
      def:{label:t.label+' ('+days.length+' days)',days:week,templates:templates,
        rir:'2\u20133 reps in reserve',why:'generated from your days, equipment and history'},
      days:days.slice(),
      coverage:groupsCovered+'/'+Object.keys(PATTERN_GROUPS).length,
      fit:{sessionMinutes:opts.sessionMinutes||(typeof constraintModel==='function'?constraintModel().sessionMinutes:null),dayMinutes:dayMinutes,trims:dayNotes},
      coverageScore:groupsCovered/Object.keys(PATTERN_GROUPS).length,
      weeklySets:sets,
      exercises:Object.keys(templates).reduce(function(a,n){return a+templates[n].length;},0),
      fitsWeek:days.length,
      avoided:avoid.slice()
    });
  });
  if(!candidates.length)return {status:'impossible',
    reason:days.length+' training day(s) does not fit any split this system knows',
    note:'Full body works at 2\u20134 days, upper/lower at 4, push/pull/legs at 3\u20136.'};
  candidates.sort(function(a,b){return b.coverageScore-a.coverageScore||b.weeklySets-a.weeklySets;});
  return {status:'ok',cls:'DERIVED',candidates:candidates,
    equipment:equipment,days:days,avoided:avoid,experience:exp,
    note:'Candidates, not a prescription. Nothing is applied until you choose one, and the score each was ranked on is shown so you can disagree with it.',
    caveat:'Generated from movement coverage and your own exercise history. It knows nothing about your technique, your preferences, or what you enjoy \u2014 all of which matter more for adherence than the split does.'};
}
/* ---------------- B2. ADAPTIVE PROGRESSION ----------------
   Progress what the record supports progressing, hold what it does not, and say which is which. The rule is
   deliberately conservative: adding volume to a lift that is not moving is how people accumulate fatigue and
   call it training. */
function progressionPlan(opts){
  opts=opts||{};
  var p=trainingProgram();
  var resp=null;try{resp=exerciseResponse();}catch(e){}
  var rec=null;try{rec=readinessState();}catch(e){}
  var adh=null;try{adh=adherenceState(14);}catch(e){}
  if(!resp||!resp.rows||!resp.rows.length)return {status:'insufficient',
    need:['several sessions per exercise before progression can be judged'],
    note:'Progression from no evidence is just a number going up.'};
  /* Two global brakes, both of which outrank any per-exercise signal. */
  var brake=null;
  if(rec&&rec.status==='ok'&&rec.score<=-1.2)brake='readiness is '+rec.band;
  if(adh&&adh.overall!=null&&adh.overall<60)brake=(brake?brake+'; ':'')+'the current plan is being completed '+Math.round(adh.overall)+'% of the time';
  /* The rows carry a slope and the exercise's OWN noise floor, not a direction. Deriving the direction
     against that floor is the point: a slope smaller than the week-to-week noise of the lift is not a
     trend, and treating it as one is how a plan progresses into randomness. */
  var rows=resp.rows.map(function(r){
    var floor=(r.noiseFloor!=null&&r.slopePerWeek!=null&&r.volume)?
      Math.abs(r.noiseFloor)/Math.max(1,r.exposures/2):null;
    var moving=(r.slopePerWeek!=null&&floor!=null)?Math.abs(r.slopePerWeek)>floor*0.25:
               (r.slopePerWeek!=null?Math.abs(r.slopePerWeek)>0.5:false);
    var direction=r.slopePerWeek==null?'unknown':(!moving?'flat':(r.slopePerWeek>0?'rising':'falling'));
    var action='hold',why='';
    if((r.exposures||0)<6){action='hold';why='only '+(r.exposures||0)+' exposures \u2014 not enough to tell a trend from noise';}
    else if(brake){action='hold';why=brake;}
    else if(direction==='rising'){action='add load';why='estimated 1RM rising '+fmtSigned(r.slopePerWeek,1)+'/week on '+fmtNum(r.weeklySets,1)+' sets';}
    else if(direction==='flat'&&r.weeklySets<10){action='add a set';why='flat on '+fmtNum(r.weeklySets,1)+' sets/week, below the range this system works within';}
    else if(direction==='flat'){action='hold';why='flat at '+fmtNum(r.weeklySets,1)+' sets/week \u2014 more volume is not the obvious lever';}
    else if(direction==='falling'){action='reduce volume';why='estimated 1RM falling '+fmtSigned(r.slopePerWeek,1)+'/week';}
    else{action='hold';why='no usable trend yet';}
    return {exercise:r.exercise,action:action,why:why,
      weeklySets:r.weeklySets,direction:direction,exposures:r.exposures,
      slopePerWeek:r.slopePerWeek!=null?round(r.slopePerWeek,2):null};
  });
  return {status:'ok',cls:'DERIVED',rows:rows,brake:brake,
    changes:rows.filter(function(r){return r.action!=='hold';}).length,
    confidence:'low',
    note:brake?('Everything is held: '+brake+'. Progressing into a depressed baseline measures the baseline, not the training.'):
      'One change per exercise at most, so that if something stops working it is clear what changed.',
    caveat:'Derived from your own e1RM trend per exercise. It cannot see technique, and a rising estimate from a degrading bar path is not progress.'};
}
/* ---------------- C1 / C3. MEAL PLANNING ----------------
   Hit the day's targets from foods the person actually eats. Candidates are built greedily against the
   binding constraint (protein is usually it), then reported with how far off they land \u2014 never silently
   rounded into looking exact. */
function planDay(opts){
  opts=opts||{};
  var ph=activePhase()||{};
  var kcalTarget=opts.kcal||ph.calorieTarget||null;
  var proteinTarget=opts.protein||ph.proteinTarget||null;
  if(!kcalTarget||!proteinTarget)return {status:'insufficient',
    need:['a calorie and protein target, which come from an active phase'],
    note:'A meal plan without targets is a shopping list.'};
  /* Prefer foods this person has actually logged: familiarity predicts adherence far better than macros do. */
  var freq={};
  _liveFoodLogs().filter(function(l){return l.date>=addDays(asOf(),-60);}).forEach(function(l){
    if(l.food&&l.food.id){var k=foodIdentity(l.food)||l.food.id;freq[k]=(freq[k]||0)+1;}});   /* per identity, not per record */
  /* Diet restrictions from the person's constraints apply to every suggestion (H1). */
  var _CM=(typeof constraintModel==='function')?constraintModel():null,_restr=_CM?_CM.restrictions:[],_cook=_CM?_CM.cookingTime:null,_budget=_CM?_CM.foodBudget:null;
  var pool=localFoods().filter(function(f){
    if(!f.per100||f.per100.kcal==null)return false;
    if(opts.exclude&&opts.exclude.indexOf(f.id)>=0)return false;
    if(_restr.length&&!foodAllowed(f,_restr))return false;
    if(_cook&&!prepAllowed(f,_cook))return false;
    return true;
  }).map(function(f){
    var per=f.per100;
    return {food:f,kcal:per.kcal,protein:per.protein||0,
      density:per.kcal?((per.protein||0)*4/per.kcal):0,
      familiar:freq[foodIdentity(f)||f.id]||0};
  });
  if(pool.length<6)return {status:'insufficient',need:['more foods in your list'],
    note:'There is not enough to build a day from.'};
  var mealsWanted=opts.meals||3;
  var candidates=[];
  /* Three different priorities, so the output is a genuine choice rather than one answer three times. */
  [{id:'familiar',label:'Built from what you usually eat',rank:function(x){return x.familiar*2+x.density;}},
   {id:'protein',label:'Protein first',rank:function(x){return x.density*3+x.familiar*0.2;}},
   {id:'variety',label:'Wider variety',rank:function(x){return x.density+(x.familiar?0:1.5);}}
  ].forEach(function(strategy){
    /* Budget scales each strategy's own ranking: it favours staples and never excludes a food. */
    var _r=function(x){return strategy.rank(x)*(_budget?budgetFactor(x.food,_budget):1);};
    var ranked=pool.slice().sort(function(a,b){return _r(b)-_r(a);}).slice(0,24);
    var items=[],kcal=0,protein=0;
    /* Protein first, because it is the constraint that binds \u2014 but each portion is sized to the REMAINING
       need and never beyond it. Sizing to a fixed maximum per food is how a 195 g target becomes a 350 g
       day: every item adds a full portion regardless of what the previous ones already supplied. */
    for(var i=0;i<ranked.length&&protein<proteinTarget*0.95;i++){
      var c=ranked[i];
      if(c.protein<8)continue;
      var needP=proteinTarget-protein;
      if(needP<=5)break;
      var gramsForProtein=needP/Math.max(0.05,c.protein/100);
      var gramsForCalories=(kcalTarget*0.92-kcal)/Math.max(0.01,c.kcal/100);
      var grams=Math.round(Math.min(300,gramsForProtein,gramsForCalories)/10)*10;
      if(grams<40)continue;
      items.push({food:c.food,grams:grams,kcal:round(c.kcal*grams/100,0),protein:round(c.protein*grams/100,1)});
      kcal+=c.kcal*grams/100;protein+=c.protein*grams/100;
    }
    /* Filling the remaining calories from the SAME protein-ranked list is what pushed protein past target
       while leaving energy short: those foods are chosen for protein per calorie, which is the opposite of
       what an energy filler needs. The fill draws from energy-dense, protein-light foods instead, and stops
       as soon as protein would exceed the target. */
    var fillers=pool.filter(function(x){return x.kcal>=120&&x.density<0.3;})
      .sort(function(a2,b2){return (b2.familiar*2+b2.kcal/100)-(a2.familiar*2+a2.kcal/100);});
    var proteinCeiling=proteinTarget*1.2;
    for(var j=0;j<fillers.length&&kcal<kcalTarget*0.94;j++){
      var d=fillers[j];
      if(items.length>=mealsWanted*4)break;
      if(items.some(function(x){return x.food.id===d.food.id;}))continue;
      var room=kcalTarget*0.98-kcal;
      var g2=Math.round(Math.min(250,room/Math.max(0.05,d.kcal/100))/10)*10;
      if(g2<30)continue;
      if(protein+(d.protein||0)*g2/100>proteinCeiling)continue;
      items.push({food:d.food,grams:g2,kcal:round(d.kcal*g2/100,0),protein:round((d.protein||0)*g2/100,1)});
      kcal+=d.kcal*g2/100;protein+=(d.protein||0)*g2/100;
    }
    if(!items.length)return;
    /* Split across meals in order; this is arrangement, not nutrition. */
    var perMeal=Math.ceil(items.length/mealsWanted);
    items.forEach(function(it,i){it.meal=MEALS[Math.min(MEALS.length-1,Math.floor(i/perMeal))];});
    candidates.push({strategy:strategy.id,label:strategy.label,items:items,
      kcal:Math.round(kcal),protein:round(protein,0),
      kcalGap:Math.round(kcal-kcalTarget),proteinGap:round(protein-proteinTarget,0),
      familiarShare:round(100*items.filter(function(i){return freq[i.food.id];}).length/items.length,0),
      /* Hitting a target means landing in a range, not clearing a floor. Overshooting protein by 80% is
         not a hit, and calling it one would make the whole panel untrustworthy. */
      hitsProtein:protein>=proteinTarget*0.9&&protein<=proteinTarget*1.25,
      hitsCalories:Math.abs(kcal-kcalTarget)<=kcalTarget*0.08});
  });
  if(!candidates.length)return {status:'impossible',
    reason:'no combination of your foods reaches '+fmtNum(proteinTarget,0)+' g protein inside '+fmtKcal(kcalTarget),
    note:'Rather than returning a day that misses the target quietly, this says the targets cannot be met from these foods.'};
  return {status:'ok',cls:'DERIVED',targets:{kcal:kcalTarget,protein:proteinTarget},
    candidates:candidates,
    constraints:(function(){var C=(typeof constraintModel==='function')?constraintModel():null;if(!C)return null;
      var applied=C.restrictions.slice();if(C.cookingTime)applied.push('cooking time');if(C.foodBudget)applied.push('food budget');
      return {applied:applied,notYetApplied:[],
        note:(C.restrictions.length?'Suggestions leave out foods that match '+C.restrictions.join(', ')+' by name and category \u2014 check labels; a match is not a certification. ':'')+
          (C.cookingTime?'Foods are kept to what your cooking time allows, judged from each food\u2019s name and category. ':'')+
          (C.foodBudget&&C.foodBudget!=='flexible'?'Cheaper staples are favoured using rough cost tiers by category \u2014 estimates, not prices.':'')};})(),
    note:'Candidates you can log, edit or ignore. Nothing is written until you choose one.',
    caveat:'Built from foods already in your list and weighted towards what you actually eat, because familiarity predicts whether a plan gets followed far better than its macros do. It knows nothing about taste, time or what is in your fridge.'};
}
/* ---------------- C4. GROCERY GENERATION ---------------- */
function groceryList(plan,days){
  days=days||7;
  if(!plan||plan.status!=='ok'||!plan.candidates.length)return null;
  var chosen=plan.candidates[0];
  var by={};
  chosen.items.forEach(function(it){
    var k=it.food.id||it.food.name;
    by[k]=by[k]||{name:it.food.name,grams:0,food:it.food};
    by[k].grams+=it.grams*days;
  });
  var rows=Object.keys(by).map(function(k){
    var r=by[k];
    var priced=r.food.pricePer100!=null?round(r.food.pricePer100*r.grams/100,2):null;
    return {name:r.name,grams:Math.round(r.grams),kg:round(r.grams/1000,2),cost:priced};
  }).sort(function(a,b){return b.grams-a.grams;});
  var total=rows.reduce(function(a,r){return a+(r.cost||0);},0);
  var pricedCount=rows.filter(function(r){return r.cost!=null;}).length;
  return {days:days,rows:rows,
    cost:pricedCount?round(total,2):null,
    pricedShare:round(100*pricedCount/rows.length,0),
    note:pricedCount<rows.length?('Only '+pricedCount+' of '+rows.length+' items are priced, so the total is partial.'):'Every item is priced.',
    caveat:'Quantities assume the plan is followed exactly for '+days+' days, which nobody does. Treat it as an upper bound.'};
}
/* ---------------- T. PARETO SCENARIO SEARCH ----------------
   Scenarios compared named plans. This searches the space and returns the frontier: the plans where nothing
   else is better on every axis at once. Returning a single "best" would require weighting outcome against
   burden against cost on the user's behalf, and that weighting is theirs, not the system's. */
function searchPlans(opts){
  opts=opts||{};
  var calorieSteps=opts.calorieSteps||[0,-100,-200,-300,-400];
  var stepSteps=opts.stepSteps||[0,1000,2000,3000,4000];
  var cardioSteps=opts.cardioSteps||[0,1,2];
  var horizon=opts.horizonWeeks||12;
  var out=[];
  calorieSteps.forEach(function(c){
    stepSteps.forEach(function(s){
      cardioSteps.forEach(function(k){
        if(c===0&&s===0&&k===0)return;
        var changes={};
        if(c)changes.calories=c;
        if(s)changes.steps=s;
        if(k)changes.cardio=k;
        var r;
        try{r=runScenario(buildScenario(_planLabel(c,s,k),changes,{horizonWeeks:horizon}));}
        catch(e){return;}
        if(r.ratePerWeek==null)return;
        out.push({name:r.name,changes:changes,
          rate:r.ratePerWeek,expected:r.expectedRate,burden:r.burden,
          execution:r.executionLikelihood,withinBand:r.withinBand,
          endWeight:r.expectedEndWeight!=null?r.expectedEndWeight:r.endWeight});
      });
    });
  });
  if(!out.length)return {status:'insufficient',need:['an established trend to project from'],
    note:'Without a trend there is nothing to search over.'};
  /* Non-dominated on: faster expected loss, lower burden, inside the rate band.
     A plan is dominated when another is at least as good on every axis and better on one. */
  /* Plans outside the rate band this system works within are excluded from the frontier rather than offered
     and annotated. Putting a plan on a recommended list and then warning about it invites choosing it. */
  var inBand=out.filter(function(x){return x.withinBand!==false;});
  var pool=inBand.length?inBand:out;
  var excluded=out.length-pool.length;
  var frontier=pool.filter(function(a){
    return !pool.some(function(b){
      if(b===a)return false;
      var betterRate=(b.expected!=null&&a.expected!=null)?b.expected<=a.expected:false;
      var betterBurden=b.burden<=a.burden;
      var strictly=(b.expected<a.expected)||(b.burden<a.burden);
      return betterRate&&betterBurden&&strictly;
    });
  });
  frontier.sort(function(a,b){return a.burden-b.burden;});
  return {status:'ok',cls:'PREDICTIVE',searched:out.length,frontier:frontier,
    horizonWeeks:horizon,excludedOutsideBand:excluded,
    note:'Every plan where nothing else is better on both expected outcome and burden. Choosing between them is a trade only you can make, which is why this returns a frontier rather than a winner.',
    caveat:'Projections assume the trend continues and that the change is the only thing that changes. Burden is a crude index, not a measurement of how hard something feels to you.'};
}
function _planLabel(c,s,k){
  var p=[];
  if(c)p.push(fmtSigned(c,0)+' kcal');
  if(s)p.push(fmtSigned(s,0)+' steps');
  if(k)p.push('+'+k+' cardio');
  return p.join(', ')||'no change';
}

/* moved from 76-visual-complete.js: an engine function that lived in an interface file */
function programStructure(weeks){
  weeks=weeks||4;
  var prog=null;try{prog=trainingProgram();}catch(e){}
  if(!prog||!prog.week)return {status:'no-program',note:'No training program is set.'};
  var today=todayISO();
  var dow=new Date(today+'T12:00:00Z').getUTCDay();
  var monday=addDays(today,-((dow+6)%7));
  var start=addDays(monday,-(weeks-1)*7);
  var byDate={};(DB.sessions||[]).forEach(function(s){(byDate[s.date]=byDate[s.date]||[]).push(s);});
  var micro=[],planned=0,done=0,missed=0,setsPlanned=0,setsDone=0;
  for(var w=0;w<weeks;w++){
    var days=[];
    for(var d=0;d<7;d++){
      var date=addDays(start,w*7+d),dn=_DOW[new Date(date+'T12:00:00Z').getUTCDay()];
      var plan=typeof scheduledPlan==='function'?scheduledPlan(date,prog):(prog.week[dn]||null);   /* weekly, rotating or irregular */
      var exs=plan&&plan.template&&prog.templates?(prog.templates[plan.template]||[]).map(function(t){
        return {name:t[0],sets:t[1],reps:t[2]};}):[];
      var sp=exs.reduce(function(a,e){return a+(+e.sets||0);},0);
      var sess=byDate[date]||[];
      var sd=sess.reduce(function(a,s){return a+(s.sets||[]).length;},0);
      var liftPlanned=plan&&plan.kind==='lift';
      /* A planned lifting day with no session is NOT "missed" on its own: the first version matched by exact
         weekday and reported 12 of 14 sessions missed in a record that trained 13 times in the window — on
         different days. Moving a session is not skipping it. The day-level status only says what happened
         on that day; whether the week was kept is judged per week, below. */
      var status=date>today?'upcoming':(sess.length?(liftPlanned?'done':'done-other-day'):(liftPlanned?'not-on-this-day':(plan?'rest-or-other':'rest')));
      setsDone+=date<=today?sd:0;
      days.push({date:date,dow:dn,planned:plan?{label:plan.label,kind:plan.kind,exercises:exs,sets:sp}:null,
        completed:sess.length?{sessions:sess.length,sets:sd,
          exercises:Object.keys(sess.reduce(function(a,s){(s.sets||[]).forEach(function(st){a[st.exercise]=1;});return a;},{}))}:null,
        status:status});
    }
    /* The week is the unit of adherence: sessions done against sessions planned in the same microcycle, on
       whichever days they fell. Only days already past count, so the current week is not penalised for
       days that have not happened yet. */
    var past=days.filter(function(x){return x.date<=today;});
    var wkPlanned=past.filter(function(x){return x.planned&&x.planned.kind==='lift';}).length;
    var wkDone=past.filter(function(x){return !!x.completed;}).length;
    var wkSetsPlanned=past.reduce(function(a,x){return a+(x.planned&&x.planned.kind==='lift'?x.planned.sets:0);},0);
    planned+=wkPlanned;done+=Math.min(wkDone,wkPlanned);missed+=Math.max(0,wkPlanned-wkDone);setsPlanned+=wkSetsPlanned;
    micro.push({index:w,weekStart:addDays(start,w*7),days:days,sessionsPlanned:wkPlanned,sessionsDone:wkDone,
      onPlannedDay:past.filter(function(x){return x.status==='done';}).length,
      setsDone:days.reduce(function(a,x){return a+(x.completed?x.completed.sets:0);},0)});
  }
  return {status:'ok',program:{id:prog.key,label:prog.label},
    mesocycles:[{id:'current',label:prog.label,implicit:true,microcycles:micro}],
    summary:{sessionsPlanned:planned,sessionsDone:done,sessionsMissed:missed,setsPlanned:setsPlanned,setsDone:setsDone,
      onPlannedDay:micro.reduce(function(a,m){return a+m.onPlannedDay;},0),
      totalSessions:micro.reduce(function(a,m){return a+m.sessionsDone;},0)},
    cls:'MEASURED',
    note:'The plan, and what was actually done, over '+weeks+' weeks. The program has no explicit block structure, so the window is one implicit mesocycle.'};
}
