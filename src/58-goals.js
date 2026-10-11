/* ============================================================================
   STAGE C (future plan items 22, 23; reconstruction §7.3, §7.4, §32, §33).
   \u2022 Marginal returns: one dose-response curve per lever, its shape from cited population evidence \u2014 rising,
     diminishing, a plateau, possibly negative \u2014 and the next unit's expected benefit at the person's current dose,
     with its uncertainty, fatigue, adherence and time costs. Population curves say so.
   \u2022 Goal conflicts: goals as a vector; tensions detected from the person's actual state and shown, never silently
     resolved; the person sets the priority.
   \u2022 Arbitration: arbitrateDecision (87-governance) is extended in place, not duplicated.
   ============================================================================ */
var MARGINAL_CURVES={
  sets:{label:'Hard sets per muscle a week',unit:'sets',step:1,k:7,negBeyond:25,
    benefit:'muscle growth',negNote:'past about 25 a week, recovery may limit what extra sets add',
    heuristic:{id:'curve.sets',subject:'weekly hard sets per muscle',predicate:'follow a saturating curve for muscle growth',
      parameters:{k:{unit:'sets (the curve\u2019s scale)',meaning:'sets at which about 63% of the attainable growth is reached'},negBeyond:{unit:'sets a week',meaning:'past this, recovery may limit what extra sets add'}},
      statement:function(v){return 'muscle growth rises with weekly sets and flattens, with recovery limiting sets past about '+v.negBeyond+' a week';},
      rationale:'graded dose-response with diminishing returns per added set',evidenceBasis:['schoenfeld2017volume','pelland2024volume','acsm2026rt'],
      parameterSource:'curve shape chosen by this system to match the cited dose-response; the 25-set limit is a judgement, not an estimate',parameterVersion:'1.0',
      calibrationStatus:'scaled to the person once their own strength trends carry a fifth of the curve',validationStatus:HEURISTIC_NOT_VALIDATED,
      applicability:{population:'adults training for hypertrophy',phases:['cut','bulk','maintain']},failureConditions:['an injury','a novice or returning lifter (faster early gains)'],outcomes:['muscle growth']}},
  protein:{label:'Protein',unit:'g/kg a day',step:0.1,plateau:1.6,plateauHi:2.2,
    benefit:'muscle retained and gained',
    heuristic:{id:'curve.protein',subject:'daily protein',predicate:'stops adding muscle past a plateau',
      parameters:{plateau:{unit:'g/kg a day',meaning:'where added protein stops adding muscle on average'},plateauHi:{unit:'g/kg a day',meaning:'the upper end of the plateau\u2019s interval'}},
      statement:function(v){return 'protein adds muscle up to about '+v.plateau+' g per kg a day (possibly up to '+v.plateauHi+'), and little beyond';},
      rationale:'meta-regression breakpoint for fat-free-mass gains with resistance training',evidenceBasis:['morton2018'],
      parameterSource:'the cited breakpoint and its upper interval',parameterVersion:'1.0',calibrationStatus:'not calibrated to this person',validationStatus:HEURISTIC_NOT_VALIDATED,
      applicability:{population:'adults who resistance train',phases:['cut','bulk','maintain']},failureConditions:['kidney disease','protein not logged'],outcomes:['muscle retained and gained']}},
  steps:{label:'Steps',unit:'steps a day',step:1000,k:5000,
    benefit:'health (energy expenditure itself rises in proportion)',
    heuristic:{id:'curve.steps',subject:'daily steps',predicate:'follow a saturating curve for health',
      parameters:{k:{unit:'steps a day (the curve\u2019s scale)',meaning:'steps at which about 63% of the attainable benefit is reached'}},
      statement:function(v){return 'the health benefit of steps rises and levels off, with the curve scaled on '+fmtNum(v.k,0)+' steps a day';},
      rationale:'mortality risk falls with steps and levels off; energy expenditure itself rises in proportion',evidenceBasis:['paluch2022steps'],
      parameterSource:'curve scale chosen by this system to level off where the cited cohorts did',parameterVersion:'1.0',calibrationStatus:'not calibrated to this person',validationStatus:HEURISTIC_NOT_VALIDATED,
      applicability:{population:'adults',phases:['cut','bulk','maintain']},failureConditions:['an injury that limits walking'],outcomes:['health','energy expenditure']}},
  cardio:{label:'Cardio',unit:'minutes a week',step:30,k:150,negBeyond:180,
    benefit:'aerobic fitness',negNote:'past about 180 minutes, interference with strength and size gains grows',
    heuristic:{id:'curve.cardio',subject:'weekly cardio minutes',predicate:'add aerobic fitness and, past a point, interfere with lifting',
      parameters:{k:{unit:'minutes a week (the curve\u2019s scale)',meaning:'the guideline minimum the curve is scaled on'},negBeyond:{unit:'minutes a week',meaning:'past this, interference with strength and size gains is flagged'}},
      statement:function(v){return 'cardio adds aerobic fitness, scaled on '+v.k+' minutes a week, and past about '+v.negBeyond+' minutes it is flagged for interfering with lifting';},
      rationale:'the guideline range for health, and interference that grows with endurance frequency and duration',evidenceBasis:['who2020pa','wilson2012concurrent'],
      parameterSource:'the guideline minimum, and an interference point chosen by this system: the cited meta-analysis estimated no minutes threshold',parameterVersion:'1.0',
      calibrationStatus:'not calibrated to this person',validationStatus:HEURISTIC_NOT_VALIDATED,applicability:{population:'adults combining cardio and lifting',phases:['cut','bulk','maintain']},
      failureConditions:['endurance is the main goal'],outcomes:['aerobic fitness','strength and size gains']}},
  sleep:{label:'Sleep',unit:'hours a night',step:0.5,k:2.2,start:5,
    benefit:'recovery and appetite regulation',
    heuristic:{id:'curve.sleep',subject:'nightly sleep',predicate:'follows a saturating curve for recovery and appetite',
      parameters:{start:{unit:'hours a night',meaning:'below this the curve gives no benefit'},k:{unit:'hours (the curve\u2019s scale)',meaning:'hours past the start at which about 63% of the benefit is reached'}},
      statement:function(v){return 'recovery and appetite regulation improve with sleep from '+v.start+' hours and level off past 7';},
      rationale:'7 hours or more is the consensus target; restriction raises intake',evidenceBasis:['watson2015sleep','sleep_restriction_meta'],
      parameterSource:'curve shape chosen by this system to reach most of its benefit by about 7 hours',parameterVersion:'1.0',
      calibrationStatus:'personal for each outcome the person\u2019s own data carry',validationStatus:HEURISTIC_NOT_VALIDATED,applicability:{population:'adults',phases:['cut','bulk','maintain']},
      failureConditions:['shift work','a sleep disorder'],outcomes:['recovery','appetite']}},
  deficit:{label:'Rate of loss',unit:'% of body weight a week',step:0.25,negBeyond:1,linear:1.5,
    benefit:'fat lost each week',negNote:'past about 1% a week, more of the loss is lean mass',
    heuristic:{id:'curve.deficit',subject:'rate of loss',predicate:'risks lean mass past',
      parameters:{negBeyond:{unit:'% of body weight a week',meaning:'past this, more of the loss is lean mass'},linear:{unit:'% of body weight a week (the curve\u2019s scale)',meaning:'the rate at which fat lost reaches the curve\u2019s maximum'}},
      statement:function(v){return 'fat lost rises with the rate of loss, and past about '+v.negBeyond+'% of body weight a week more of the loss is lean mass';},
      rationale:'faster loss took more lean mass in lean, trained people',evidenceBasis:['garthe2011rate','helms2014prep'],
      parameterSource:'the upper end of the cited range',parameterVersion:'1.0',calibrationStatus:'not calibrated to this person',validationStatus:HEURISTIC_NOT_VALIDATED,
      applicability:{population:'adults losing fat; the cited trials were in lean, trained people',phases:['cut']},failureConditions:['a medically supervised diet'],outcomes:['fat lost each week','lean mass']}}};
/* the short names of a contract's evidence ("Schoenfeld et al. 2017"), from the evidence registry: the source a row shows */
function evidenceLabel(id){var r=claimById(id);if(!r)return id;var c=String(r.citation||''),y=(c.match(/\b(19|20)\d{2}\b/)||[''])[0];
  var a=c.split(/[ ,.;(]/)[0];return a+(/et al|,/.test(c.split(/[0-9]/)[0])?' et al.':'')+(y?' '+y:'');}
function curveSource(c){return c&&c.heuristic?c.heuristic.evidenceBasis.map(evidenceLabel).join('; '):'';}
function _curve(c,d){if(d==null)return null;
  if(c.plateau!=null)return Math.min(1,Math.max(0,d)/c.plateau);
  if(c.linear)return Math.max(0,d)/c.linear;   /* fat lost rises with the rate; the cost is the lean-mass risk past 1% (a flag, not an identity check: curves are copied when scaled) */
  var x=Math.max(0,d-(c.start||0));return 1-Math.exp(-x/c.k);}
function _zone(c,d){if(c.negBeyond!=null&&d>c.negBeyond)return 'possibly negative';if(c.plateau!=null)return d>=c.plateau?'plateau':'rising';
  if(c.linear)return 'rising';var f=_curve(c,d);return f<0.5?'rising':(f<0.85?'diminishing':'plateau');}
function _currentDoses(){var d={},kg=(typeof _kgNow==='function'?_kgNow():null);
  try{d.sets=(physiqueModel().regions||[]).map(function(r){return {region:r.label,dose:r.sets,priority:!!r.priority};});}catch(e){d.sets=[];}
  try{var P=seriesWindow('protein',14).map(function(x){return x.value;});if(P.length&&kg)d.protein=round(mean(P)/kg,2);}catch(e){}
  try{var S=seriesWindow('steps',14).map(function(x){return x.value;});if(S.length)d.steps=Math.round(mean(S));}catch(e){}
  try{d.cardio=capabilityVector().endurance.cardioMinutesPerWeek;}catch(e){}
  try{var Z=seriesWindow('sleep',14).map(function(x){return x.value;});if(Z.length)d.sleep=round(mean(Z),1);}catch(e){}
  try{var R=physiqueRate();if(R.status==='ok'&&R.pctPerWeek<0)d.deficit=round(-R.pctPerWeek,2);}catch(e){}
  return d;}
/* the next unit at the current dose: expected benefit (share of the attainable maximum), its uncertainty (the curve's
   scale \u00b130%), zone, and the costs that come with it */
function marginalReturn(lever,dose,opts){var c=MARGINAL_CURVES[lever];if(!c||dose==null)return null;
  /* the sets curve becomes personal once the person's own data carry at least a fifth of it */
  var personal=null;if(lever==='sets'&&!(opts&&opts.population)){var PD=(opts&&opts.personal)||_personalDoseCached();if(PD&&PD.status==='ok'&&PD.personalWeight>=0.2){personal=PD;c=Object.assign({},c,{k:c.k*PD.scale});}}
  var gain=function(scale){var cc=Object.assign({},c);if(cc.k)cc.k*=scale;if(cc.plateau)cc.plateau*=scale;if(cc.linear)cc.linear*=scale;return _curve(cc,dose+c.step)-_curve(cc,dose);};
  var mid=gain(1),lo=gain(c.plateau?1.375:1.3),hi=gain(c.plateau?0.8:0.7),z=_zone(c,dose+c.step);
  return {lever:lever,label:c.label,dose:dose,unit:c.unit,next:'+'+c.step+' '+(c.step===1&&c.unit==='sets'?'set':c.unit),benefit:c.benefit,marginalPct:round(100*mid,1),range:[round(100*Math.min(lo,hi),1),round(100*Math.max(lo,hi),1)],
    zone:z,warning:z==='possibly negative'?c.negNote:null,
    fatigue:lever==='sets'?'about one more hard set to recover from':(lever==='cardio'?'more fatigue, and more interference with lifting':null),
    timeMinutes:{sets:3,steps:10,cardio:30,sleep:30}[lever]||0,source:curveSource(MARGINAL_CURVES[lever]),contract:MARGINAL_CURVES[lever].heuristic.id,
    basis:personal?'personal curve: fitted across '+personal.n+' regions, '+Math.round(personal.personalWeight*100)+'% your own data (scale '+personal.scale+', between '+personal.interval[0]+' and '+personal.interval[1]+')':'population curve (personal scaling needs strength trends across regions)',personal:!!personal};}
function _personalDoseCached(){return typeof memo==='function'?memo('pdr:'+todayISO(),function(){return personalDoseResponse();}):personalDoseResponse();}
function marginalReturns(){var D=_currentDoses(),out=[];
  (D.sets||[]).filter(function(r){return r.dose!=null;}).forEach(function(r){var m=marginalReturn('sets',r.dose);if(m){m.region=r.region;m.priority=r.priority;out.push(m);}});
  ['protein','steps','cardio','sleep','deficit'].forEach(function(k){var m=marginalReturn(k,D[k]);if(m)out.push(m);});
  /* the sleep row becomes personal for each outcome the person's own data carry */
  try{var SR=typeof memo==='function'?memo('psr:'+todayISO(),function(){return personalSleepResponse();}):personalSleepResponse(),sr=out.filter(function(r){return r.lever==='sleep';})[0];
    if(sr&&SR.status==='ok'){var own=SR.outcomes.filter(function(o){return o.status==='ok'&&o.personalWeight>=0.2;});if(own.length){sr.personal=true;sr.basis='for you: '+own.map(function(o){return o.reading;}).join('; ')+'. '+SR.limits;}}}catch(e){}
  /* one more weekly exposure at the same sets: personal once the person's data carry a fifth of it */
  try{var FR=typeof memo==='function'?memo('pfr:'+todayISO(),function(){return personalFrequencyResponse();}):personalFrequencyResponse();
    if(FR.status==='ok')out.push({lever:'frequency',label:'Weekly exposures per muscle',next:'+1 exposure a week (same sets)',unit:'exposures a week',dose:null,benefit:'strength gained a month',
      marginalPct:FR.personalWeight>=0.2?FR.perExposure:0,range:FR.personalWeight>=0.2?FR.interval:[-0.5,0.5],zone:FR.personalWeight>=0.2?(FR.interval[0]>0?'rising':'no clear effect'):'little on average',
      warning:null,fatigue:'one more session to recover from',timeMinutes:0,source:['schoenfeld2019freq','grgic2018freq'].map(evidenceLabel).join('; '),basis:FR.reading+' '+FR.limits,personal:FR.personalWeight>=0.2});}catch(e){}
  return {status:out.length?'ok':'insufficient',cls:'HEURISTIC',rows:out,doses:D,method:'one dose-response curve per lever from cited evidence; the next unit\u2019s change in benefit at the current dose',
    validation:'The cited evidence supports each curve\u2019s shape; the curves themselves are this system\u2019s heuristics and are not validated as models.'};}

/* ---- GOAL CONFLICTS (§32): tensions detected from the person's state, with the trade-off and a choice ---- */
var _TENSION_BASE={parameterVersion:'1.0',calibrationStatus:'not calibrated to this person',validationStatus:HEURISTIC_NOT_VALIDATED};
var GOAL_TENSIONS=[
  {id:'deficit-vs-muscle',goals:['fat loss','hypertrophy'],test:function(s){return s.phase==='cut'&&s.priorityRegions>0;},
    evidence:function(s){return s.priorityRegions+' muscle'+(s.priorityRegions===1?'':'s')+' set as a priority during a cut';},
    tradeoff:function(v){return 'Muscle builds slowly in a deficit. A smaller deficit (about '+v.protectiveRate+'% a week) protects it; a larger one loses fat sooner.';},
    magnitude:function(s,v){return s.deficit!=null?{quantity:'rate of loss',value:s.deficit,unit:'% of body weight a week',threshold:v.protectiveRate}:null;},
    consequences:{'protect-muscle':{outcome:'fat lost each week',direction:'slower'},'lose-faster':{outcome:'lean mass at risk',direction:'more'}},
    options:[['protect-muscle','Protect muscle'],['lose-faster','Lose fat faster']],
    heuristic:Object.assign({id:'tension.deficit-vs-muscle',subject:'a cut with priority muscles',predicate:'protects muscle at a loss of about',
      parameters:{protectiveRate:{value:0.5,unit:'% of body weight a week',meaning:'the rate that protects muscle in a deficit'}},
      statement:function(v){return 'in a cut with priority muscles, a loss of about '+v.protectiveRate+'% a week protects them';},
      rationale:'muscle builds slowly in a deficit, and a smaller deficit keeps more of it',evidenceBasis:['helms2014prep','garthe2011rate'],parameterSource:'the slow end of the cited range',
      applicability:{phases:['cut']},failureConditions:['no priority muscles set'],outcomes:['fat lost each week','lean mass']},_TENSION_BASE)},
  {id:'cardio-vs-strength',goals:['endurance','strength'],test:function(s,v){return s.cardio>v.from&&(s.strengthPriority||s.priorityRegions>0);},
    evidence:function(s){return s.cardio+' cardio minutes a week while strength or size is a priority';},
    tradeoff:function(v){return 'Past about '+v.from+'\u2013'+MARGINAL_CURVES.cardio.negBeyond+' minutes a week, cardio starts to blunt strength and size gains. Less cardio keeps lifting gains; more builds endurance.';},
    magnitude:function(s,v){return {quantity:'cardio',value:s.cardio,unit:'minutes a week',threshold:v.from};},
    consequences:{'favour-strength':{outcome:'aerobic fitness',direction:'slower'},'favour-endurance':{outcome:'strength and size gains',direction:'blunted'}},
    options:[['favour-strength','Favour strength'],['favour-endurance','Favour endurance']],
    heuristic:Object.assign({id:'tension.cardio-vs-strength',subject:'cardio while strength or size is a priority',predicate:'is in tension past',
      parameters:{from:{value:150,unit:'minutes a week',meaning:'cardio above this, with a strength or size priority, is shown as a tension'}},
      statement:function(v){return 'past about '+v.from+' cardio minutes a week, with strength or size a priority, the two goals pull against each other';},
      rationale:'interference grows with the frequency and duration of endurance work',evidenceBasis:['wilson2012concurrent','who2020pa'],parameterSource:'the guideline minimum; the cited meta-analysis estimated no minutes threshold',
      applicability:{phases:['cut','bulk','maintain']},failureConditions:['endurance is the main goal'],outcomes:['strength and size gains','aerobic fitness']},_TENSION_BASE)},
  {id:'time-vs-volume',goals:['time','training volume'],test:function(s,v){return s.needMinutes!=null&&s.haveMinutes!=null&&s.needMinutes>s.haveMinutes*v.ratio;},
    evidence:function(s){return 'the plan needs about '+s.needMinutes+' minutes a week; the schedule gives about '+s.haveMinutes;},
    tradeoff:function(){return 'The plan asks for more time than the schedule gives. Fewer sets fit the week; keeping the volume means longer sessions or another day.';},
    magnitude:function(s,v){return {quantity:'training time',value:s.needMinutes,unit:'minutes a week',threshold:Math.round(s.haveMinutes*v.ratio)};},
    consequences:{'fit-the-week':{outcome:'weekly sets',direction:'fewer'},'keep-volume':{outcome:'session length',direction:'longer'}},
    options:[['fit-the-week','Fit the week'],['keep-volume','Keep the volume']],
    heuristic:Object.assign({id:'tension.time-vs-volume',subject:'the plan\u2019s weekly time',predicate:'is in tension with the schedule past',
      parameters:{ratio:{value:1.1,unit:'times the scheduled minutes',meaning:'how far the plan may exceed the schedule before it is shown'}},
      statement:function(v){return 'a plan needing more than '+v.ratio+' times the scheduled minutes is in tension with the schedule';},
      rationale:'a plan that does not fit the week is not carried out',evidenceBasis:[],parameterSource:'a planning rule of this system; no published evidence registered',
      applicability:{phases:['cut','bulk','maintain']},failureConditions:['no schedule set'],outcomes:['weekly sets','time']},_TENSION_BASE)},
  {id:'rate-vs-recovery',goals:['fat loss','recovery'],test:function(s,v){return s.deficit!=null&&s.deficit>v.rate&&s.fatigue!=null&&s.fatigue>=v.fatigue;},
    evidence:function(s){return 'losing '+s.deficit+'% a week with fatigue averaging '+s.fatigue;},
    tradeoff:function(){return 'A fast loss is wearing on recovery. Slowing the loss eases it; keeping the pace finishes sooner.';},
    magnitude:function(s,v){return {quantity:'rate of loss',value:s.deficit,unit:'% of body weight a week',threshold:v.rate,fatigue:s.fatigue};},
    consequences:{'ease-recovery':{outcome:'time to goal',direction:'longer'},'keep-pace':{outcome:'recovery',direction:'worse'}},
    options:[['ease-recovery','Ease recovery'],['keep-pace','Keep the pace']],
    heuristic:Object.assign({id:'tension.rate-vs-recovery',subject:'a fast loss with high fatigue',predicate:'is in tension past',
      parameters:{rate:{value:0.75,unit:'% of body weight a week',meaning:'a loss faster than this'},fatigue:{value:6,unit:'average fatigue of 10',meaning:'with fatigue at or above this'}},
      statement:function(v){return 'a loss faster than '+v.rate+'% a week with fatigue averaging '+v.fatigue+' or more is wearing on recovery';},
      rationale:'faster loss costs more lean mass and recovery',evidenceBasis:['garthe2011rate'],parameterSource:'chosen by this system within the cited range',
      applicability:{phases:['cut']},failureConditions:['fatigue not rated'],outcomes:['fat lost each week','recovery']},_TENSION_BASE)},
  {id:'volume-vs-fatigue',goals:['training volume','recovery'],test:function(s,v){return s.setsPerWeek>v.sets&&s.fatigue!=null&&s.fatigue>=v.fatigue;},
    evidence:function(s){return s.setsPerWeek+' sets a week with fatigue averaging '+s.fatigue;},
    tradeoff:function(){return 'High volume with high fatigue may be adding fatigue faster than growth. A lighter week recovers; keeping volume keeps the stimulus.';},
    magnitude:function(s,v){return {quantity:'weekly sets',value:s.setsPerWeek,unit:'sets a week',threshold:v.sets,fatigue:s.fatigue};},
    consequences:{'recover':{outcome:'stimulus this week',direction:'lower'},'keep-stimulus':{outcome:'fatigue',direction:'higher'}},
    options:[['recover','Recover first'],['keep-stimulus','Keep the stimulus']],
    heuristic:Object.assign({id:'tension.volume-vs-fatigue',subject:'high weekly volume with high fatigue',predicate:'is in tension past',
      parameters:{sets:{value:60,unit:'sets a week',meaning:'total weekly sets above this'},fatigue:{value:7,unit:'average fatigue of 10',meaning:'with fatigue at or above this'}},
      statement:function(v){return 'more than '+v.sets+' sets a week with fatigue averaging '+v.fatigue+' or more may be adding fatigue faster than growth';},
      rationale:'returns per added set diminish while fatigue keeps accumulating',evidenceBasis:['pelland2024volume','schoenfeld2017volume'],parameterSource:'chosen by this system; the cited evidence estimated no fatigue threshold',
      applicability:{phases:['cut','bulk','maintain']},failureConditions:['fatigue not rated'],outcomes:['muscle growth','recovery']},_TENSION_BASE)}];
function _tensionValues(t){var v={};Object.keys(t.heuristic.parameters).forEach(function(k){v[k]=t.heuristic.parameters[k].value;});return v;}
function _goalState(){var s={},ph=null;try{ph=activePhase();}catch(e){}s.phase=ph?ph.type:null;
  try{s.priorityRegions=physiqueModel().regions.filter(function(r){return r.priority;}).length;}catch(e){s.priorityRegions=0;}
  var g=null;try{g=canonicalGoal();}catch(e){}s.strengthPriority=!!(g&&/strength/.test(String(g.type)));
  try{var C=capabilityVector();s.cardio=C.endurance.cardioMinutesPerWeek;s.setsPerWeek=C.workCapacity.setsPerWeek;}catch(e){}
  try{var M=scheduleModel(),days=(DB.settings.trainingDays||[]).length||(ph&&ph.trainingSessions)||4;s.haveMinutes=days*((M.minutes&&M.minutes.full)||60);
    s.needMinutes=s.setsPerWeek!=null?Math.round(s.setsPerWeek*3+(s.cardio||0)):null;}catch(e){}
  try{var R=physiqueRate();s.deficit=R.status==='ok'&&R.pctPerWeek<0?round(-R.pctPerWeek,2):null;}catch(e){}
  try{var F=seriesWindow('fatigue',7).map(function(x){return x.value;});s.fatigue=F.length?round(mean(F),1):null;}catch(e){}
  return s;}
/* GOAL ARBITRATION AS VALUES (catalogue doc 2, P1.8): each conflict reports what it affects, the competing objectives,
   how large the trade-off is against its threshold, the person's priority, the objective chosen (or none), the
   alternatives set aside, the expected consequence and the confidence. With no choice made, nothing is favoured: the
   conflict says so instead of a hidden priority deciding it. */
function goalConflicts(){var s=_goalState(),P=DB.settings.goalPriorities||{};
  var rows=GOAL_TENSIONS.filter(function(t){try{return t.test(s,_tensionValues(t));}catch(e){return false;}}).map(function(t){var v=_tensionValues(t),ch=P[t.id]||null;
    var opt=ch?t.options.filter(function(o){return o[0]===ch;})[0]:null;
    return {id:t.id,goals:t.goals,evidence:t.evidence(s),tradeoff:t.tradeoff(v),options:t.options,chosen:ch,
      affectedOutcomes:t.heuristic.outcomes.slice(),competingObjectives:t.goals.slice(),tradeoffMagnitude:(function(){try{return t.magnitude(s,v);}catch(e){return null;}})(),
      userPriority:ch,chosenObjective:opt?opt[1]:null,rejectedAlternatives:opt?t.options.filter(function(o){return o[0]!==ch;}).map(function(o){return o[1];}):[],
      expectedConsequence:ch?Object.assign({option:opt?opt[1]:ch},t.consequences[ch]||{}):null,
      confidence:'low',heuristic:t.heuristic.id,
      arbitration:ch?'arbitration follows your choice: '+(opt?opt[1]:ch).toLowerCase():'no choice made: arbitration favours neither goal for this tension, and both stay shown'};});
  return {status:'ok',cls:'POLICY',conflicts:rows,state:s,note:'Tensions are shown, never silently resolved: you choose which goal leads, and arbitration follows your choice.'};}
function setGoalPriority(id,choice){var P=Object.assign({},DB.settings.goalPriorities||{});if(choice)P[id]=choice;else delete P[id];return P;}
/* arbitration (§33) is extended in 87-governance.js, right after arbitrateDecision, so it applies (this file loads first) */
/* ============================================================================
   PERSONAL TRAINING DOSE-RESPONSE (Stage D; §7.4 made personal). The sets curve's scale s, fitted across the person's
   regions: gain = a \u00b7 (1 \u2212 e^(\u2212sets/(7s))), weighted by 1/SE\u00b2, a solved exactly for each s on a grid, prior
   log s ~ N(0, 0.5\u00b2) centred on the population curve. Personal weight = 1 \u2212 posterior variance / prior variance.
   Limitation, stated: it compares regions with each other, not changes over time, so a muscle that grows easily can
   look like a dose effect; the prior keeps it near the population curve until the data say otherwise.
   ============================================================================ */
function personalDoseResponse(rows){
  if(!rows){try{rows=physiqueModel().regions.filter(function(r){return r.sets!=null&&r.strength&&r.strength.pctPerMonth!=null&&r.strength.se>0;}).map(function(r){return {region:r.label,sets:r.sets,gain:r.strength.pctPerMonth,se:r.strength.se};});}catch(e){rows=[];}}
  if(rows.length<4)return {status:'insufficient',need:'strength trends in 4 or more regions with different weekly sets',n:rows.length};
  var spread=Math.max.apply(null,rows.map(function(r){return r.sets;}))-Math.min.apply(null,rows.map(function(r){return r.sets;}));
  if(spread<4)return {status:'insufficient',need:'weekly sets that differ by 4 or more between regions',n:rows.length};
  var PRIOR_SD=0.5,grid=[],post=[];for(var L=-1.5;L<=1.5001;L+=0.02)grid.push(L);
  grid.forEach(function(L){var sc=Math.exp(L),num=0,den=0;rows.forEach(function(r){var f=1-Math.exp(-r.sets/(7*sc)),w=1/(r.se*r.se);num+=w*r.gain*f;den+=w*f*f;});
    var a=den>0?num/den:0,sse=0;rows.forEach(function(r){var f=1-Math.exp(-r.sets/(7*sc));sse+=Math.pow(r.gain-a*f,2)/(r.se*r.se);});
    post.push(-sse/2-L*L/(2*PRIOR_SD*PRIOR_SD));});
  var mx=Math.max.apply(null,post),wts=post.map(function(v){return Math.exp(v-mx);}),Z=wts.reduce(function(a,b){return a+b;},0);
  var m=0;grid.forEach(function(L,i){m+=L*wts[i]/Z;});var v=0;grid.forEach(function(L,i){v+=(L-m)*(L-m)*wts[i]/Z;});
  var pw=Math.max(0,Math.min(1,1-v/(PRIOR_SD*PRIOR_SD)));
  return {status:'ok',cls:'EMPIRICAL',scale:round(Math.exp(m),2),logSd:round(Math.sqrt(v),3),interval:[round(Math.exp(m-2*Math.sqrt(v)),2),round(Math.exp(m+2*Math.sqrt(v)),2)],personalWeight:round(pw,2),n:rows.length,rows:rows,
    reading:(function(){var r=Math.exp(m)<0.85?'gains that level off at fewer sets than the population curve':(Math.exp(m)>1.15?'gains that keep rising with more sets than the population curve suggests':null);
      /* below a fifth of the estimate, the person's data only hint: say so rather than state it */
      if(pw<0.2)return 'not enough of your own data yet'+(r?'; so far it hints at '+r:'')+'. The population curve is used.';return r?'Your data show '+r+'.':'Close to the population curve.';})(),
    limits:'compares regions with each other, not changes over time: a muscle that grows easily can look like a dose effect'};}
(function(){if(typeof MODELS==='undefined'||_registryTaken(MODELS,'MODELS','personal_dose_response'))return;
  MODELS.push({id:'personal_dose_response',name:'Personal training dose-response',cls:'EMPIRICAL',version:'1.0',inputs:['physique_regions'],minN:4,
    assumes:['the population curve\u2019s shape (1 \u2212 e^(\u2212sets/7)) holds; only its scale is personal','regions differ in dose, not in how readily they grow'],
    failsWhen:['regions that grow at very different rates for reasons other than volume','fewer than four regions with strength trends'],
    output:'the scale of the person\u2019s sets curve, with its interval and how much is their own data',consumers:['marginalReturns'],freshnessDays:14,uncertainty:{kind:'posterior interval on the scale'},fn:'personalDoseResponse'});})();
/* ============================================================================
   PERSONAL FREQUENCY RESPONSE (Stage D; §7.5). With volume's effect removed by the dose-response curve, does how often
   a region is trained explain what is left? Weighted regression of the residual gain on weekly exposures, prior
   N(0, 1.5\u00b2 %/month per extra weekly exposure) \u2014 centred on zero because, at equal volume, frequency adds little
   (Schoenfeld et al. 2019 for size; Grgic et al. 2018 for strength). Limits, stated: regions compared with each other,
   and no measure yet of fatigue per exposure, so "response per unit fatigue" is not claimed.
   ============================================================================ */
function personalFrequencyResponse(rows){
  if(!rows){try{rows=physiqueModel().regions.filter(function(r){return r.sets!=null&&r.frequency>0&&r.strength&&r.strength.pctPerMonth!=null&&r.strength.se>0;}).map(function(r){return {region:r.label,sets:r.sets,frequency:r.frequency,gain:r.strength.pctPerMonth,se:r.strength.se};});}catch(e){rows=[];}}
  if(rows.length<4)return {status:'insufficient',need:'strength trends in 4 or more regions trained at different frequencies',n:rows.length};
  var fs=rows.map(function(r){return r.frequency;}),spread=Math.max.apply(null,fs)-Math.min.apply(null,fs);
  if(spread<0.5)return {status:'insufficient',need:'regions trained at frequencies at least half a session a week apart',n:rows.length};
  var D=personalDoseResponse(rows),sc=D.status==='ok'&&D.personalWeight>=0.2?D.scale:1;
  /* volume's effect: the curve's amplitude fitted with the chosen scale, then removed */
  var num=0,den=0;rows.forEach(function(r){var f=1-Math.exp(-r.sets/(7*sc)),w=1/(r.se*r.se);num+=w*r.gain*f;den+=w*f*f;});var a=den>0?num/den:0;
  var W=0,mf=0;rows.forEach(function(r){var w=1/(r.se*r.se);W+=w;mf+=w*r.frequency;});mf/=W;
  var sxy=0,sxx=0;rows.forEach(function(r){var w=1/(r.se*r.se),res=r.gain-a*(1-Math.exp(-r.sets/(7*sc))),x=r.frequency-mf;sxy+=w*x*res;sxx+=w*x*x;});
  var bHat=sxy/sxx,seB=Math.sqrt(1/sxx),PRIOR=1.5,vp=1/(1/(PRIOR*PRIOR)+1/(seB*seB)),mp=vp*(bHat/(seB*seB)),pw=Math.max(0,Math.min(1,1-vp/(PRIOR*PRIOR)));
  var lo=mp-2*Math.sqrt(vp),hi=mp+2*Math.sqrt(vp);
  return {status:'ok',cls:'EMPIRICAL',perExposure:round(mp,2),sd:round(Math.sqrt(vp),2),interval:[round(lo,2),round(hi,2)],personalWeight:round(pw,2),n:rows.length,volumeScale:sc,
    reading:pw<0.2?'Not enough of your own data yet. At equal weekly sets, frequency adds little on average (Schoenfeld 2019; Grgic 2018).':
      (lo>0?'At the same weekly sets, your regions trained more often have gained more: about '+round(mp,1)+'% a month more per extra weekly exposure.':(hi<0?'At the same weekly sets, your regions trained more often have gained less: about '+round(-mp,1)+'% a month less per extra weekly exposure.':'At the same weekly sets, how often you train a region makes no clear difference for you so far.')),
    limits:'regions compared with each other, not changes over time; fatigue per exposure is not measured, so response per unit fatigue is not claimed'};}
(function(){if(typeof MODELS==='undefined'||_registryTaken(MODELS,'MODELS','personal_frequency_response'))return;
  MODELS.push({id:'personal_frequency_response',name:'Personal frequency response',cls:'EMPIRICAL',version:'1.0',inputs:['physique_regions'],minN:4,
    assumes:['volume\u2019s effect is captured by the dose-response curve','regions differ in frequency, not in how readily they grow'],
    failsWhen:['frequency and volume rising together in every region','fewer than four regions with strength trends'],
    output:'the change in monthly strength gain per extra weekly exposure at equal volume, with its interval and how much is the person\u2019s own data',consumers:['marginalReturns'],freshnessDays:14,uncertainty:{kind:'posterior interval on the slope'},fn:'personalFrequencyResponse'});})();
