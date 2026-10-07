/* ============================================================================
   REGION: DIAGNOSIS — differential hypotheses, ranked, each with evidence, missing data and a test.
   ============================================================================ */
function diagnose(){
  return memo('diag',function(){
    var S=getCurrentState();var ph=S.phase;var tr=S.trend,band=S.targetRate,ad=S.adherence,rec=S.recovery,app=S.appetite,st=S.training.strength,wn=S.waterNoise,trust=S.trust;
    var findings=[];
    var addF=function(f){findings.push(f);};
    var phaseDays=ph?daysBetween(ph.startDate,asOf()):null;
    if(tr.status!=='ok'){addF({id:'insufficient',title:'Insufficient data',likelihood:'confirmed',severity:'info',summary:'The weight trend cannot be estimated yet, so no energy-balance diagnosis is possible.',evidence:[tr.n+' weigh-ins over '+tr.span+' days'],missing:tr.need||[],test:'Continue daily weigh-ins and intake logging.',causes:[]});return {findings:findings,primary:findings[0]};}
    var flat=tr.direction==='flat';var loss=tr.slopePerWeek;
    var reliable=ad.logging.pct>=80&&(!ad.reported||ad.reported.mean>=80);
    var flatDays=flat?((S.trend28.status==='ok'&&S.trend28.direction==='flat')?S.trend28.span+1:tr.span+1):0;
    var zone=band&&band.band?band.band:band; // system band for the weight zone (user target may be stricter)
    var slowerThanBoth=band&&zone&&loss>band.hi&&loss>zone.hi;
    // STALL
    if(flat&&ph&&ph.type==='cut'&&flatDays>=14){
      var waistFlat=S.waistTrend.status!=='ok'||S.waistTrend.direction!=='falling';
      var ev=['weight trend '+fmtRate(loss)+' over '+flatDays+' days',S.waistTrend.status==='ok'?('waist '+S.waistTrend.direction+' ('+fmtSigned(S.waistTrend.delta,1)+' in)'):'waist trend unavailable','intake logged '+ad.logging.pct+'% of days'+(ad.calories?(' \u00b7 within target '+ad.calories.pct+'%'):''),S.steps.mean7!=null?('steps averaging '+fmtNum(S.steps.mean7,0)):'no step data','training '+S.training.consistency];
      var causes=[];
      causes.push({cause:'actual deficit smaller than estimated (intake under-recorded)',rank:reliable?2:1,test:'weigh and log everything for 7 days; compare to the estimate'});
      causes.push({cause:'activity compensation: steps or NEAT fell',rank:S.steps.compensation?1:3,test:'compare 7-day steps with the 28-day baseline'});
      causes.push({cause:'TDEE estimate too high',rank:S.tdee.cls==='PRIOR'?1:3,test:'let the personal energy model accumulate 14+ logged days'});
      causes.push({cause:'water retention masking loss',rank:wn.level==='high'?1:(waistFlat?4:2),test:'a waist measurement and 7 more days'});
      causes.push({cause:'observation window too short to distinguish signal from noise',rank:flatDays<21?2:5,test:'extend the window to 21 days before changing intake'});
      causes.sort(function(a,b){return a.rank-b.rank;});
      var lik=flatDays>=21&&reliable&&waistFlat?'probable':'possible';
      addF({id:'stall',title:lik==='probable'?'Insufficient observed energy deficit':'Possible stall',likelihood:lik,severity:flatDays>=21?'high':'moderate',summary:'Weight has been essentially flat for '+flatDays+' days'+(waistFlat?' and the waist is not falling':' while the waist continues to fall (fat loss may be continuing under water noise)')+'.',evidence:ev,counter:waistFlat?[]:['waist still falling'],missing:[S.waistTrend.status!=='ok'?'waist trend':'',!ad.calories?'calorie target adherence':''].filter(Boolean),causes:causes,test:flatDays<21?'Hold all variables and extend the observation window to 21 days.':'Hold calories, add ~2,000 steps/day, recheck in 14 days.',preferred:flatDays<21?'wait':'steps',flatDays:flatDays});
    }
    // SLOW LOSS
    if(!flat&&ph&&ph.type==='cut'&&band&&loss<0&&slowerThanBoth&&tr.span>=13){
      addF({id:'slow',title:'Loss slower than the target band',likelihood:reliable?'probable':'possible',severity:'moderate',summary:'Trend '+fmtRate(loss)+' versus a band of '+fmtRateRange(band.lo,band.hi)+' for '+tr.span+' days.',evidence:['trend confidence '+tr.confidence,'logging '+ad.logging.pct+'%'],counter:wn.level==='high'?['water noise high; the true rate may be faster']:[],missing:reliable?[]:['reliable adherence data'],causes:[{cause:'deficit smaller than intended',rank:1,test:'one major variable: +1,500\u20132,000 steps or \u2212150\u2013200 kcal, then 14 days'},{cause:'NEAT drift',rank:2,test:'step baseline comparison'},{cause:'water masking',rank:wn.level==='high'?1:3,test:'waist + 7 days'}],test:'Change one major variable and recheck in 14 days.',preferred:'steps'});
    }
    // RAPID LOSS
    if(ph&&ph.type==='cut'&&zone&&loss<zone.lo*1.2&&phaseDays!=null&&phaseDays>21){
      var sig=[];if(st.status==='ok'&&st.overall==='declining')sig.push('strength \u2193');if(rec.status==='ok'&&(rec.level==='strained'||rec.level==='poor'))sig.push('recovery '+rec.level);if(rec.sleep&&rec.sleep.mean<rec.target-0.5)sig.push('sleep \u2193');if(app.status==='ok'&&app.level==='high')sig.push('hunger \u2191');if(rec.fatigue&&rec.fatigue.mean>=7)sig.push('fatigue \u2191');
      addF({id:'rapid',title:sig.length>=2?'Rate of loss is too aggressive':'Rapid loss without supporting negative signals',likelihood:sig.length>=2?'probable':'possible',severity:sig.length>=2?'high':'low',summary:'Trend '+fmtRate(loss)+' is faster than the '+fmtRateRange(zone.lo,zone.hi)+' band'+(sig.length?(' with supporting signals: '+sig.join(', ')):' but strength, recovery and appetite look acceptable')+'.',evidence:['trend '+fmtRate(loss)+' ('+tr.confidence+')'].concat(sig),counter:sig.length?[]:['no deterioration in strength, recovery or appetite'],missing:[st.status!=='ok'?'strength history':'',rec.status!=='ok'?'recovery ratings':''].filter(Boolean),causes:[{cause:'deficit larger than intended',rank:1,test:'raise intake 150\u2013250 kcal or drop one cardio session; recheck 14 days'},{cause:'early water/glycogen loss',rank:phaseDays<28?1:4,test:'wait for day 28 of the phase'}],test:sig.length>=2?'Reduce the deficit (calories or cardio, not both) and recheck in 14 days.':'Hold and watch strength, hunger and sleep for 7 days.',preferred:sig.length>=2?'reduce_deficit':'hold'});
    }
    // POSSIBLE MUSCLE LOSS
    if(S.muscleRisk.status==='ok'&&S.muscleRisk.level!=='low'){
      addF({id:'muscle',title:'Lean-mass loss is '+(S.muscleRisk.level==='high'?'plausible':'possible'),likelihood:S.muscleRisk.level==='high'?'probable':'possible',severity:S.muscleRisk.level==='high'?'high':'moderate',summary:'Current evidence does not distinguish lean-mass loss from water and glycogen change, but the proxies point the wrong way.',evidence:S.muscleRisk.factors.filter(function(f){return f.tone!=='good';}).map(function(f){return f.text;}),counter:S.muscleRisk.factors.filter(function(f){return f.tone==='good';}).map(function(f){return f.text;}),missing:['a circumference or DEXA measurement would help'],causes:[{cause:'deficit too large for the training stimulus',rank:1,test:'reduce the deficit; hold training'},{cause:'protein below target',rank:S.adherence.protein&&S.adherence.protein.pct<70?1:3,test:'raise protein to target for 14 days'},{cause:'under-recovery suppressing performance (not tissue loss)',rank:2,test:'deload week; if strength returns, tissue was not lost'}],test:'Protect protein and training first; reduce the deficit if strength keeps falling.',preferred:'protect'});
    }
    // UNDER-RECOVERY
    if(rec.status==='ok'&&(rec.level==='strained'||rec.level==='poor')){
      addF({id:'recovery',title:'Under-recovery',likelihood:rec.level==='poor'?'probable':'possible',severity:rec.level==='poor'?'high':'moderate',summary:'Multiple recovery signals have deteriorated: '+rec.signals.map(function(s){return s.text;}).join('; ')+'.',evidence:rec.signals.map(function(s){return s.text;}),counter:[],missing:[],causes:[{cause:'sleep debt',rank:rec.signals.some(function(s){return s.key==='sleep';})?1:3,test:'sleep target for 7 days'},{cause:'training load sustained too long',rank:2,test:'deload candidate: cut volume 30\u201350% for one week'},{cause:'deficit too large',rank:3,test:'see rate of loss'}],test:'Prioritize sleep; consider a deload if performance is also falling.',preferred:'sleep'});
    }
    // UNDERLOGGING / ADHERENCE
    if(ad.logging.pct<60){
      addF({id:'underlogging',title:'Underlogging',likelihood:'confirmed',severity:'moderate',summary:'Intake logged on only '+ad.logging.pct+'% of the last 14 days. Unlogged days are unknown, not zero, so energy models are throttled.',evidence:[ad.logging.n+' of 14 days'],counter:[],missing:['intake on the missing days'],causes:[],test:'Log intake for 7 consecutive days before any calorie change.',preferred:'log'});
    } else if(ad.calories&&ad.calories.pct<50&&(ad.reported?ad.reported.mean<75:true)){
      addF({id:'adherence',title:'Low plan adherence',likelihood:'confirmed',severity:'moderate',summary:'Intake landed within 10% of target on '+ad.calories.pct+'% of logged days'+(ad.reported?(' \u00b7 self-reported adherence '+fmtNum(ad.reported.mean,0)+'%'):'')+'. A plan not executed cannot be evaluated.',evidence:['calorie adherence '+ad.calories.pct+'%'],counter:[],missing:[],causes:[{cause:'target too aggressive for the food environment',rank:1,test:'appetite ratings for 7 days'},{cause:'meal structure',rank:2,test:'protein and fiber distribution'}],test:'Address execution before changing the target.',preferred:'adherence'});
    }
    // COMPENSATION
    if(S.steps.compensation)addF({id:'compensation',title:'Possible activity compensation',likelihood:'possible',severity:'low',summary:S.steps.compensation+'.',evidence:['step trend '+fmtSigned(S.steps.trendPerDay,0)+'/day'],counter:[],missing:[],causes:[],test:'Hold cardio; watch steps for 7 days.',preferred:'hold'});
    // WATER NOISE
    if(wn.level==='high')addF({id:'water',title:'High water-noise probability',likelihood:'possible',severity:'info',summary:'Scale movement is likely dominated by water right now: '+wn.reasons.join('; ')+'.',evidence:wn.reasons,counter:[],missing:[],causes:[],test:'Interpret the 14-day trend, not single weigh-ins.',preferred:'hold'});
    // MAINTENANCE / REBOUND
    if(ph&&(ph.type==='maintenance'||ph.type==='transition'||ph.type==='diet_break')&&loss>0.5&&tr.span>=13){
      var early=phaseDays!=null&&phaseDays<=21;
      addF({id:'rebound',title:early?'Weight rising after the transition':'Upward trend in maintenance',likelihood:early?'possible':'probable',severity:early?'low':'moderate',summary:early?'The first 1\u20133 weeks after raising intake restore glycogen, water and gut contents. This is not evidence of fat regain yet.':'Trend '+fmtRate(loss)+' has persisted beyond the glycogen-restoration window.',evidence:['trend '+fmtRate(loss)+' over '+tr.span+' days',ad.calories?('intake averaging '+fmtKcal(ad.calories.mean)):'no intake data'],counter:early?['expected water/glycogen restoration']:[],missing:[S.waistTrend.status!=='ok'?'waist trend':''].filter(Boolean),causes:[{cause:'intake above the true maintenance range',rank:1,test:'hold intake for 14 days; compare trend and waist'},{cause:'glycogen/water restoration',rank:early?1:4,test:'wait until day 21 of the phase'},{cause:'activity fell after the cut',rank:2,test:'steps vs previous phase'}],test:early?'Hold and recheck at day 21.':'Trim intake 100\u2013150 kcal or restore steps; one variable.',preferred:early?'wait':'trim'});
    }
    if(!findings.length)findings.push({id:'none',title:'No problem detected',likelihood:'confirmed',severity:'info',summary:'Trend, adherence, recovery and strength are within expectation for this phase.',evidence:['trend '+fmtRate(loss)+' ('+tr.confidence+')','logging '+ad.logging.pct+'%',rec.status==='ok'?('recovery '+rec.level):'recovery not rated'],counter:[],missing:[],causes:[],test:'Continue.',preferred:'hold'});
    var order={high:0,moderate:1,low:2,info:3};findings.sort(function(a,b){return order[a.severity]-order[b.severity];});
    return {findings:findings,primary:findings[0],trust:trust.overall};
  });
}
/* Quick diagnosis from user-selected symptoms: hypotheses come from the same state. */
var SYMPTOMS=[{id:'stalled',label:'Weight stalled'},{id:'toofast',label:'Losing too fast'},{id:'hunger',label:'Hunger high'},{id:'strength',label:'Strength dropping'},{id:'fatigue',label:'Fatigue high'},{id:'waist',label:'Waist stalled'},{id:'adherence',label:'Adherence poor'},{id:'rising',label:'Scale rising'},{id:'perfup',label:'Performance improving'},{id:'perfdown',label:'Performance declining'},{id:'sleep',label:'Sleep poor'}];
function quickDiagnose(ids){
  var d=diagnose();var out=[];var S=getCurrentState();
  var add=function(title,hyps,test){out.push({title:title,hypotheses:hyps,test:test});};
  ids.forEach(function(id){
    if(id==='stalled'||id==='waist'){var f=d.findings.filter(function(x){return x.id==='stall'||x.id==='slow';})[0];add(id==='stalled'?'Weight stalled':'Waist stalled',f?f.causes.map(function(c){return c.cause+' \u2014 '+c.test;}):(S.trend.status==='ok'?['the recorded trend is '+fmtRate(S.trend.slopePerWeek)+', not a stall; if the scale feels stuck, water noise is '+S.waterNoise.level]:['trend unavailable: '+(S.trend.need||[]).join(', ')]),f?f.test:'extend observation to 14\u201321 days');}
    if(id==='toofast'||id==='rising'){var g=d.findings.filter(function(x){return x.id==='rapid'||x.id==='rebound';})[0];add(id==='toofast'?'Losing too fast':'Scale rising',g?g.causes.map(function(c){return c.cause+' \u2014 '+c.test;}):[S.waterNoise.level==='high'?'water noise is high: '+S.waterNoise.reasons.join('; '):'no rapid trend recorded; the 14-day trend is '+(S.trend.status==='ok'?fmtRate(S.trend.slopePerWeek):'unavailable')],g?g.test:'interpret the 14-day trend');}
    if(id==='hunger')add('Hunger high',['deficit larger than necessary \u2014 compare rate of loss with the band','low food volume or fiber \u2014 log fiber for 7 days','sleep restriction raises hunger and intake \u2014 check sleep vs target','protein below target reduces satiety \u2014 check protein adherence'].concat(S.appetite.status==='ok'?['current appetite burden: '+S.appetite.level]:['no appetite ratings yet']),'Do not assume the target is wrong; test volume, fiber and sleep first.');
    if(id==='strength'||id==='perfdown'){var m=d.findings.filter(function(x){return x.id==='muscle'||x.id==='recovery';})[0];add(id==='strength'?'Strength dropping':'Performance declining',(m?m.causes.map(function(c){return c.cause+' \u2014 '+c.test;}):[]).concat(['under-recovery suppresses performance without tissue loss','deficit too large for the stimulus','protein inadequate','program stale: volume or exercise selection'].filter(function(x,i){return !m||i>1;})),'Deload or reduce the deficit; hold training.');}
    if(id==='fatigue'||id==='sleep'){var r=d.findings.filter(function(x){return x.id==='recovery';})[0];add(id==='fatigue'?'Fatigue high':'Sleep poor',['sleep debt \u2014 hit the sleep target for 7 days','late caffeine \u2014 move caffeine earlier','training load sustained \u2014 deload candidate','deficit too large \u2014 see rate of loss'].concat(r?['recovery state: '+S.recovery.level]:[]),'Prioritize sleep before adding any stimulus.');}
    if(id==='adherence')add('Adherence poor',['target too aggressive for the food environment','meal structure lacks protein and volume','logging burden \u2014 use repeat-last and recipes','life context (travel, stress) \u2014 tag it so the model does not blame the plan'],'Address execution before changing the target.');
    if(id==='perfup')add('Performance improving',['stimulus and recovery are matched \u2014 this is the desired state in a cut','beginner adaptation \u2014 expect it to slow','creatine or carbohydrate timing may be contributing'],'Hold; do not add volume for its own sake.');
  });
  return out;
}

/* ============================================================================
   REGION: DECISION ENGINE — priority lattice → one dominant action. Hold steady is a legitimate result.
   ============================================================================ */
var DECISION_RULES_VERSION='1.2';
var LATTICE=['safety','data integrity','adherence','rate of loss','performance','plateau','nutrition','training','activity','optimization'];
/* every decision records the uncertainty its numbers carry, and (when known) this person's own measured
   response to the variable it proposes moving */
function decorateDecision(dec){
  if(!dec)return dec;
  try{var u=uncertaintyChain();dec.uncertainty={ceiling:u.ceiling,text:u.text,balance:u.balance,relative:u.relative,links:u.links};
    if(u.ceiling==='low'&&dec.confidence==='high')dec.confidence='medium';
    if(dec.trace&&typeof dec.trace==='object'){dec.trace.uncertainty=u.text;dec.trace.models=(dec.trace.models||[]).concat(['energy-balance interval '+(u.balance?fmtKcal(u.balance.lo)+' to '+fmtKcal(u.balance.hi)+'/day':'not computable')+' [DERIVED, confidence ceiling '+u.ceiling+']']);}}catch(e){_q(e);}
  try{var v=(dec.variable||'').toLowerCase();var r=v?responseFor(v):null;
    if(r)dec.personalResponse={variable:r.variable,text:r.text,confidence:r.confidence,n:r.n};}catch(e){_q(e);}
  return dec;
}
function decide(){
  return memo('decision',function(){
    var S=getCurrentState();var d=diagnose();var ph=S.phase;var tr=S.trend,band=S.targetRate,ad=S.adherence,rec=S.recovery,app=S.appetite,st=S.training.strength,trust=S.trust;
    var F=function(id){return d.findings.filter(function(x){return x.id===id;})[0];};
    var base={rulesVersion:DECISION_RULES_VERSION,date:asOf(),phaseId:ph?ph.id:null,phaseType:ph?ph.type:null,assumptions:['weight trend uses Theil\u2013Sen over 14 days','one major variable changes at a time','unlogged days are unknown, not zero'],alternatives:[],missing:[],trace:null};
    var actionsBase=function(){var a=[];if(ph){if(ph.calorieTarget)a.push({key:'calories',text:fmtKcal(ph.calorieTarget)+'/day'});if(ph.proteinTarget)a.push({key:'protein',text:'\u2265'+fmtG(ph.proteinTarget)+' protein'});if(ph.stepTarget)a.push({key:'steps',text:fmtNum(ph.stepTarget,0)+' steps'});if(ph.trainingSessions)a.push({key:'training',text:ph.trainingSessions+' resistance sessions/week'});if(ph.cardioSessions)a.push({key:'cardio',text:ph.cardioSessions+'\u00d7 '+(ph.cardioMinutes||30)+' min moderate cardio/week'});if(ph.sleepTargetH)a.push({key:'sleep',text:fmtH(ph.sleepTargetH)+' sleep'});}return a;};
    var neg=getNegativeKnowledge();var negFor=function(v){return neg.filter(function(n){return n.variable===v&&n.applicability!=='expired';});};
    var dec=null;
    // 0. no phase
    if(!ph){dec=Object.assign(base,{code:'SETUP',verb:'Set up a phase',tone:'neutral',priority:'data integrity',lede:'No active phase. The decision engine needs a phase with targets before it can evaluate anything.',why:['no phase is active'],evidence:[],action:[{key:'setup',text:'Create a profile and start a phase'}],confidence:'insufficient',recheckDays:null,reverseIf:[]});}
    // 1. safety / major recovery deterioration
    else if(rec.status==='ok'&&rec.level==='poor'&&(st.status==='ok'&&st.overall==='declining'||(tr.status==='ok'&&band&&tr.slopePerWeek<band.lo))){
      var cut=ph.type==='cut';
      dec=Object.assign(base,{code:'REDUCE_DEFICIT',verb:cut?'Reduce the deficit':'Prioritize recovery',tone:'negative',priority:'safety',lede:'Recovery is poor and '+(st.status==='ok'&&st.overall==='declining'?'strength is falling':'loss is faster than the band')+'. The intervention has become counterproductive; more effort will not fix it.',
        why:rec.signals.map(function(s){return s.text;}).concat(st.status==='ok'?['strength '+st.overall+' ('+st.declining+' of '+st.tracked+' lifts)']:[],tr.status==='ok'?['trend '+fmtRate(tr.slopePerWeek)+(band?(' vs band '+fmtRateRange(band.lo,band.hi)):'')]:[]),
        evidence:['recovery score '+rec.score+' over '+rec.n+' ratings'],action:[{key:'calories',text:cut?('raise intake by 150\u2013250 kcal/day (to \u2248'+fmtKcal((ph.calorieTarget||0)+200,{bare:true})+')'):'hold intake'},{key:'sleep',text:'sleep target '+fmtH(rec.target)+' for 7 nights'},{key:'training',text:'deload: cut volume 30\u201350% for one week, keep intensity'},{key:'cardio',text:'drop one cardio session'}],
        confidence:rec.confidence==='medium'&&tr.status==='ok'?'medium':'low',recheckDays:7,reverseIf:['fatigue and sleep return to baseline and strength stops falling within 7 days'],intervention:{variable:'calories',from:ph.calorieTarget,to:cut&&ph.calorieTarget?ph.calorieTarget+200:ph.calorieTarget,expected:'recovery signals improve within 7\u201314 days; rate of loss moves back into the band',recheckDays:14},safety:true});
    }
    // 2. data integrity
    else if(tr.status!=='ok'||trust.overall.level==='insufficient'||(trust.overall.level==='low'&&ad.logging.pct<50)){
      var need=[].concat(tr.status!=='ok'?(tr.need||[]):[],trust.reasons.slice(0,3));
      dec=Object.assign(base,{code:'INSUFFICIENT',verb:'Insufficient data',tone:'inferred',priority:'data integrity',lede:'The record cannot support a change yet. A recommendation now would be a guess dressed as a decision.',why:[tr.status!=='ok'?(tr.n+' weigh-ins over '+tr.span+' days; the trend model needs 7 over 10+ days'):'trend available','data trust '+trust.overall.level+' ('+trust.overall.pct+'%)'],evidence:trust.reasons,action:actionsBase().concat([{key:'log',text:'Weigh daily; log intake, steps and sleep'}]),confidence:'insufficient',recheckDays:7,reverseIf:['7 weigh-ins over 10+ days and intake logged on 70% of days'],missing:need});
    }
    // 2b. an active experiment holds every lower level: outcomes must stay attributable
    else if(activeExperiments().length&&!(F('rapid')&&F('rapid').likelihood==='probable')){
      var ex=activeExperiments()[0];var left=daysBetween(asOf(),ex.recheckDate);var el=daysBetween(ex.startDate,asOf());
      dec=Object.assign(base,{code:'EXPERIMENT',verb:'Hold: experiment running',tone:'inferred',priority:'plateau',lede:'"'+(ex.intervention||ex.variable)+'" is on day '+el+' of '+ex.durationDays+'. Changing anything else now would make the outcome unattributable. The prediction stamped on '+shortDate(localDateOf(ex.createdAt))+' is scored on '+shortDate(ex.recheckDate)+'.',why:['one major variable at a time','prediction: '+(ex.prediction||'—'),tr.status==='ok'?('trend so far '+fmtRate(tr.slopePerWeek)+(ex.baseline&&ex.baseline.trend!=null?(' vs '+fmtRate(ex.baseline.trend)+' at baseline'):'')):'trend not yet estimable'],evidence:[],action:actionsBase(),confidence:'medium',recheckDays:Math.max(0,left),reverseIf:['recovery becomes poor or strength falls with the rate past the band → the safety level overrides this hold','the experiment is evaluated or abandoned'],alternatives:['abandon the experiment and change a different variable'],experimentId:ex.id});
    }
    // 3. severe adherence
    else if(F('underlogging')||F('adherence')){
      var f=F('underlogging')||F('adherence');
      dec=Object.assign(base,{code:'ADHERENCE',verb:f.id==='underlogging'?'Log before changing anything':'Fix execution first',tone:'attention',priority:'adherence',lede:f.summary,why:f.evidence,evidence:f.evidence,action:actionsBase().concat([{key:'log',text:f.id==='underlogging'?'log intake for 7 consecutive days':'rate appetite and difficulty daily for 7 days'}]),confidence:'medium',recheckDays:7,reverseIf:['logging above 80% and calorie adherence above 70%'],alternatives:['reduce the calorie target (not recommended: cannot be evaluated until execution is known)']});
    }
    // 4. excessive rate of loss
    else if(F('rapid')&&F('rapid').likelihood==='probable'){
      var r=F('rapid');var cardio=ad.cardio.sessions>=3;var prev=negFor('calories');
      dec=Object.assign(base,{code:'REDUCE_DEFICIT',verb:'Reduce the deficit',tone:'negative',priority:'rate of loss',lede:r.summary,why:r.evidence,evidence:r.evidence,action:[{key:'calories',text:cardio?'drop one cardio session this week (keep calories)':('raise intake 150\u2013250 kcal/day to \u2248'+fmtKcal((ph.calorieTarget||0)+200,{bare:true}))},{key:'protein',text:'protein stays at target'},{key:'training',text:'hold training; do not add volume'}],confidence:r.likelihood==='probable'?'medium':'low',recheckDays:14,reverseIf:['strength stabilizes and hunger/fatigue fall within 14 days','if loss stays above the band with no negative signals, hold instead'],intervention:{variable:cardio?'cardio':'calories',from:cardio?ad.cardio.sessions:ph.calorieTarget,to:cardio?ad.cardio.sessions-1:(ph.calorieTarget||0)+200,expected:'trend moves toward '+fmtRateRange(band.lo,band.hi)+'; strength and recovery stabilize',recheckDays:14},alternatives:['both calories up and cardio down (not recommended: two variables)'],negatives:prev});
    }
    // 5. severe performance decline
    else if(st.status==='ok'&&st.overall==='declining'&&(st.sustainedCount>=2||st.maxConsecutiveDeclines>=3)){
      dec=Object.assign(base,{code:'DELOAD',verb:'Deload and hold intake',tone:'attention',priority:'performance',lede:'Strength has fallen across the last three exposures on '+st.sustainedCount+' of '+st.tracked+' tracked lifts ('+st.declining+' declining overall). A deload separates fatigue from tissue loss.',why:st.per.filter(function(x){return x.status==='ok'&&x.direction==='declining';}).map(function(x){return x.exercise+' '+fmtSigned(x.pct,1)+'% (last 3 vs prior 3)';}),evidence:['recovery '+(rec.status==='ok'?rec.level:'unrated'),ad.protein?('protein target met '+ad.protein.pct+'% of days'):'protein not logged'],action:[{key:'training',text:'one deload week: volume \u221230\u201350%, intensity kept'},{key:'calories',text:'hold intake at '+fmtKcal(ph.calorieTarget)},{key:'protein',text:'protein at target every day'}],confidence:st.confidence,recheckDays:10,reverseIf:['strength returns after the deload (fatigue, not tissue); if it does not, reduce the deficit'],intervention:{variable:'training',from:'normal volume',to:'deload',expected:'e1RM recovers to prior level within 10\u201314 days',recheckDays:10}});
    }
    // 6. plateau / stall
    else if(F('stall')){
      var s=F('stall');
      if(s.preferred==='wait'){dec=Object.assign(base,{code:'WAIT',verb:'Hold and extend the window',tone:'inferred',priority:'plateau',lede:'Weight is flat over '+s.flatDays+' days, but that window may contain too little signal to justify a change. Additional observations still have high information value.',why:s.evidence,evidence:s.evidence,action:actionsBase().concat([{key:'measure',text:'measure waist this week'}]),confidence:'medium',recheckDays:21-s.flatDays>0?21-s.flatDays:7,reverseIf:['still flat at 21 days with logging above 85% \u2192 add steps'],costOfWaiting:'about one week at the current intake; a false change now would confound the next 14 days'});}
      else{
        var stepsNeg=negFor('steps'),calNeg=negFor('calories');var useSteps=!(stepsNeg.length&&!calNeg.length);
        /* the lever choice weighs expected effect by the probability it is carried out (personal response × friction). Steps
           stay the default unless calories are clearly better, by half again: a calorie cut also adds hunger, which the
           effect model does not count. A lever that failed before is still avoided. */
        var _lv=null;try{if(typeof rankLevers==='function')_lv=rankLevers([{key:'steps',variable:'steps',dose:2000,current:S.steps.mean7},{key:'calories',variable:'calories',dose:-175,current:ph.calorieTarget}]);}catch(e){_lv=null;}
        var _le=function(k){var o=_lv&&_lv.filter(function(x){return x.key===k;})[0];return o&&o.effectiveEffect!=null?Math.abs(o.effectiveEffect):null;};
        /* population figures never override the policy: only this person's own record can (an estimate mostly from their
           data, or past steps changes they did or did not carry out). Found when priors alone flipped a stall to calories. */
        var _o=function(k){return _lv&&_lv.filter(function(x){return x.key===k;})[0];},_personal=_o('steps')&&_o('calories')&&(_o('steps').personalWeight>=0.5||_o('calories').personalWeight>=0.5||_o('steps').adherenceEvidence>=1);
        if(useSteps&&!calNeg.length&&_personal&&_le('calories')!=null&&_le('steps')!=null&&_le('calories')>1.5*_le('steps'))useSteps=false;
        var stepTo=S.steps.mean7!=null?roundTo(S.steps.mean7+2000,500):(ph.stepTarget?ph.stepTarget+2000:10000);
        dec=Object.assign(base,{code:useSteps?'ADD_STEPS':'REDUCE_CALORIES',verb:useSteps?'Add steps, hold calories':'Reduce calories modestly',tone:'attention',priority:'plateau',lede:s.summary+' The most likely cause is an observed deficit smaller than estimated. Change one variable and observe.',why:s.causes.slice(0,4).map(function(c){return c.cause;}),evidence:s.evidence,action:useSteps?[{key:'steps',text:'raise steps to \u2248'+fmtNum(stepTo,0)+'/day (+2,000)'},{key:'calories',text:'hold '+fmtKcal(ph.calorieTarget)},{key:'protein',text:'protein at target'}]:[{key:'calories',text:'reduce intake by 150\u2013200 kcal/day'},{key:'steps',text:'hold steps'}],confidence:s.likelihood==='probable'?'medium':'low',recheckDays:14,reverseIf:['trend reaches '+fmtRateRange(band?band.lo:-2,band?band.hi:-1)+' within 14 days \u2192 hold','no change after 21 days \u2192 record as negative knowledge and try the other variable'],intervention:useSteps?{variable:'steps',from:S.steps.mean7!=null?Math.round(S.steps.mean7):ph.stepTarget,to:stepTo,expected:'about 0.2\u20130.4 lb/week additional loss',recheckDays:14}:{variable:'calories',from:ph.calorieTarget,to:(ph.calorieTarget||0)-175,expected:'about 0.3\u20130.4 lb/week additional loss',recheckDays:14},alternatives:[useSteps?'\u2212150\u2013200 kcal/day instead':'+2,000 steps instead','add a cardio session (higher recovery cost)'],negatives:useSteps?stepsNeg:calNeg});
        if(_lv)dec.leverChoice={options:_lv,rule:'expected effect \u00d7 the probability of carrying it out; steps unless your own record shows calories are better by half again (a cut also adds hunger); population figures alone never switch the lever; a lever that failed before is avoided'};
        if(_lv&&Array.isArray(dec.evidence)){var _t=_lv.filter(function(o){return o.effectiveEffect!=null;}).map(function(o){return o.key+' '+o.effectiveEffect+' lb/week (done on about '+Math.round(o.pExecution*100)+'% of days)';});if(_t.length)dec.evidence=dec.evidence.concat(['Allowing for how often each is carried out: '+_t.join(', ')+'.']);}
      }
    }
    // 6b. slow loss
    else if(F('slow')&&F('slow').likelihood==='probable'){
      var sl=F('slow');var stepTo2=S.steps.mean7!=null?roundTo(S.steps.mean7+1500,500):10000;
      dec=Object.assign(base,{code:'ADD_STEPS',verb:'Add steps, hold calories',tone:'attention',priority:'plateau',lede:sl.summary+' The lowest-cost lever is activity.',why:sl.evidence,evidence:sl.evidence,action:[{key:'steps',text:'raise steps to \u2248'+fmtNum(stepTo2,0)+'/day'},{key:'calories',text:'hold '+fmtKcal(ph.calorieTarget)}],confidence:'medium',recheckDays:14,reverseIf:['trend enters '+fmtRateRange(band.lo,band.hi)],intervention:{variable:'steps',from:S.steps.mean7!=null?Math.round(S.steps.mean7):ph.stepTarget,to:stepTo2,expected:'trend improves by ~0.2\u20130.3 lb/week',recheckDays:14},alternatives:['\u2212150 kcal/day instead']});
    }
    // 6c. maintenance rebound
    else if(F('rebound')&&F('rebound').likelihood==='probable'){
      var rb=F('rebound');dec=Object.assign(base,{code:'TRIM',verb:'Trim intake slightly',tone:'attention',priority:'plateau',lede:rb.summary,why:rb.evidence,evidence:rb.evidence,action:[{key:'calories',text:'reduce intake 100\u2013150 kcal/day'},{key:'steps',text:'restore steps to the cut-phase average'}],confidence:'low',recheckDays:14,reverseIf:['trend returns to \u00b10.25 lb/week'],intervention:{variable:'calories',from:ph.calorieTarget,to:(ph.calorieTarget||0)-125,expected:'weight stabilizes within 14 days',recheckDays:14}});
    }
    // 7. nutrition adequacy
    else if(ad.protein&&ad.protein.pct<60&&ad.protein.n>=5){
      dec=Object.assign(base,{code:'PROTEIN',verb:'Prioritize protein',tone:'attention',priority:'nutrition',lede:'Protein reached target on only '+ad.protein.pct+'% of logged days (averaging '+fmtG(ad.protein.mean)+' vs '+fmtG(ad.protein.target)+'). During a deficit this is the highest-value nutrition variable; calories stay where they are.',why:['protein adherence '+ad.protein.pct+'%',tr.status==='ok'?('trend '+fmtRate(tr.slopePerWeek)+' is acceptable'):''].filter(Boolean),evidence:[],action:[{key:'protein',text:'40\u201350 g protein at each of 3\u20134 meals; whey only to close the gap'},{key:'calories',text:'hold '+fmtKcal(ph.calorieTarget)}],confidence:'medium',recheckDays:7,reverseIf:['protein target met on 85% of days']});
    }
    // 8. training / 9. activity optimization
    else if(S.training.planned&&S.training.consistency==='low'){
      dec=Object.assign(base,{code:'HOLD_TRAINING',verb:'Restore the training schedule',tone:'attention',priority:'training',lede:'Resistance training is at '+S.training.adherence+'% of plan ('+S.training.perWeek.toFixed(1)+'/week vs '+S.training.planned+'). The stimulus that protects lean mass is the variable that slipped; calories do not need to move.',why:['training adherence '+S.training.adherence+'%'],evidence:[],action:[{key:'training',text:S.training.planned+' sessions this week, even if shorter'},{key:'calories',text:'hold intake'}],confidence:'medium',recheckDays:7,reverseIf:['training adherence back above 85%']});
    }
    /* LOSING FASTER THAN THE BAND, RECOVERY FINE. There was no branch for this: it fell through to "hold steady", which
       for a while even recorded the trend as inside the band. Loss faster than planned is when muscle is at risk. Early
       in a cut it is mostly water and glycogen, so the first two weeks hold and extend the window; after that, intake
       rises by half the gap (about 500 kcal/day per lb/week), a conservative step with a recheck, not a jump. */
    else if(ph.type==='cut'&&tr.status==='ok'&&band&&tr.slopePerWeek<band.lo&&tr.confidence!=='low'){
      var phaseAge=ph.startDate?daysBetween(ph.startDate,asOf()):999;
      var gap=band.lo-tr.slopePerWeek;                              /* lb/week faster than the fastest allowed */
      if(phaseAge<14){
        dec=Object.assign(base,{code:'WAIT',verb:'Hold and extend the window',tone:'attention',priority:'rate',
          lede:'Weight is falling faster than the band ('+fmtRate(tr.slopePerWeek)+' against '+fmtRateRange(band.lo,band.hi)+'), but this cut is '+phaseAge+' days old. Early loss is mostly water and glycogen, so nothing changes yet.',
          why:['trend '+fmtRate(tr.slopePerWeek)+' is faster than '+fmtRateRange(band.lo,band.hi),'phase day '+phaseAge+' of the first 14'],
          evidence:[],action:[{key:'recheck',text:'recheck on '+shortDate(addDays(ph.startDate,14))+', once the early water shift has passed'}],
          confidence:'medium',recheckDays:Math.max(1,14-phaseAge),reverseIf:['the trend moves into the band by day 14']});
      }else{
        var add=Math.max(100,Math.min(400,Math.round(gap*500/2/50)*50));
        var to=ph.calorieTarget?ph.calorieTarget+add:null;
        dec=Object.assign(base,{code:'REDUCE_DEFICIT',verb:'Ease the deficit',tone:'attention',priority:'rate',
          lede:'Weight is falling at '+fmtRate(tr.slopePerWeek)+', '+fmtNum(gap,1)+' lb/week faster than the band allows. Recovery looks fine, but loss this fast costs muscle. Raise intake by '+add+' kcal/day \u2014 about half the gap \u2014 and recheck in two weeks.',
          why:['trend '+fmtRate(tr.slopePerWeek)+' is faster than '+fmtRateRange(band.lo,band.hi),'recovery '+(rec.status==='ok'?rec.level:'not assessed'),'phase day '+phaseAge],
          evidence:['trend confidence '+tr.confidence],
          action:[{key:'calories',text:'raise intake by '+add+' kcal/day'+(to?(' (to \u2248'+fmtKcal(to,{bare:true})+')'):'')},{key:'protein',text:'keep protein at target'}],
          confidence:tr.confidence==='high'?'medium':'low',recheckDays:14,
          reverseIf:['the trend moves into the band within two weeks','strength or recovery begins to fall'],
          intervention:{variable:'calories',from:ph.calorieTarget,to:to}});
      }
    }
    else if(ph.stepTarget&&S.steps.mean7!=null&&S.steps.mean7<ph.stepTarget*0.8&&S.steps.n7>=4&&tr.status==='ok'&&band&&tr.slopePerWeek>band.hi){
      dec=Object.assign(base,{code:'ADD_STEPS',verb:'Bring steps back to target',tone:'attention',priority:'activity',lede:'Steps average '+fmtNum(S.steps.mean7,0)+' against a '+fmtNum(ph.stepTarget,0)+' target while the trend sits above the band. Restore the target before considering intake.',why:['steps '+fmtNum(S.steps.mean7,0)+' vs '+fmtNum(ph.stepTarget,0),'trend '+fmtRate(tr.slopePerWeek)],evidence:[],action:[{key:'steps',text:fmtNum(ph.stepTarget,0)+' steps/day'},{key:'calories',text:'hold intake'}],confidence:'medium',recheckDays:7,reverseIf:['steps at target for 7 days; then re-evaluate the trend']});
    }
    // goal reached
    else if(S.goal.status==='ok'&&S.goal.remaining<=0&&ph.type==='cut'){
      dec=Object.assign(base,{code:'TRANSITION',verb:'Transition to maintenance',tone:'good',priority:'optimization',lede:'The 7-day average has reached the goal weight. This is not the end of the program: intake now moves gradually toward the observed maintenance range while training, steps and protein stay.',why:['7-day average '+fmtWeight(S.averages.avg7)+' vs goal '+fmtWeight(S.goal.goal)],evidence:[S.tdee.status==='ok'?('estimated TDEE '+fmtKcal(S.tdee.value,{estimate:true})+' ('+S.tdee.cls.toLowerCase()+')'):'TDEE unknown'],action:[{key:'phase',text:'start a Transition phase: +100\u2013150 kcal every 1\u20132 weeks toward '+(S.tdee.status==='ok'?fmtKcal(S.tdee.value,{estimate:true}):'the observed maintenance range')},{key:'training',text:'keep resistance training and steps'}],confidence:'medium',recheckDays:14,reverseIf:['if the trend keeps falling under maintenance intake, the TDEE estimate was low']});
    }
    // default: hold steady
    else{
      /* This fallback used to assert "trend X is within the band" whenever a band existed, WITHOUT checking — and
         there is no branch for losing faster than the band when recovery is fine, so that case fell through to
         here and was recorded in the knowledge graph as within range: "trend −3.9 lb/wk is within −2.5 to −1.5".
         The statement is now tested, and a hold with the trend outside the band says so and asks for review. */
      var whyInBand=!band||tr.status!=='ok'||(tr.slopePerWeek>=band.lo&&tr.slopePerWeek<=band.hi);
      var why=[];if(tr.status==='ok')why.push('trend '+fmtRate(tr.slopePerWeek)+(band?(whyInBand?(' is within '+fmtRateRange(band.lo,band.hi)):
        (' is '+(tr.slopePerWeek<band.lo?'faster':'slower')+' than '+fmtRateRange(band.lo,band.hi))):''));
      if(S.waistTrend.status==='ok')why.push('waist '+S.waistTrend.direction+' ('+fmtSigned(S.waistTrend.delta,1)+' in over 4 weeks)');
      if(st.status==='ok')why.push('strength '+st.overall);else why.push('strength trend not yet estimable');
      if(ad.protein)why.push('protein adequate ('+ad.protein.pct+'% of days)');
      if(rec.status==='ok')why.push('recovery '+rec.level);
      if(app.status==='ok')why.push('appetite burden '+app.level);
      var inBand=tr.status==='ok'&&band&&tr.slopePerWeek>=band.lo&&tr.slopePerWeek<=band.hi;
      var conf=(inBand&&tr.confidence==='high'&&trust.overall.level==='high')?'high':((tr.confidence!=='low'&&trust.overall.level!=='low')?'medium':'low');
      dec=Object.assign(base,{code:'HOLD',verb:'Hold steady',tone:(inBand||tr.status!=='ok'||!band)?'good':'attention',priority:'optimization',lede:inBand?'Current evidence does not justify a change. The trend is where it should be and the supporting signals are acceptable.':(tr.status==='ok'&&band&&band.band&&tr.slopePerWeek>band.hi&&tr.slopePerWeek<=band.band.hi?'Loss is slightly slower than your target but inside the sustainable band for this weight zone ('+fmtRateRange(band.band.lo,band.band.hi)+'). That is not a problem to fix.':(tr.status==='ok'&&band&&tr.slopePerWeek<band.lo?'Loss is faster than the band but nothing else is deteriorating; early water loss is the likely reason. Hold and watch.':'Nothing in the record asks for a change right now.')),why:why,evidence:['data trust '+trust.overall.level+' ('+trust.overall.pct+'%)'],action:actionsBase(),confidence:conf,recheckDays:inBand?14:7,reverseIf:['loss accelerates past '+(band?fmtRate(band.lo):'the band')+' with falling strength or recovery','trend flattens for 14+ days with logging above 85%','protein slips below target on most days']});
    }
    dec.trace=buildTrace(dec,S,d);
    dec.diagnosis=d.primary;
    return decorateDecision(dec);
  });
}
function buildTrace(dec,S,d){
  var obs=[];var w=S.weight;if(w.value!=null)obs.push('weight '+fmtWeight(w.value)+' \u00b7 '+ageLabel(w.date));
  if(S.averages.avg7!=null)obs.push(S.averages.n7+' weigh-ins in 7 days');
  if(S.nutrition.n14)obs.push(S.nutrition.n14+' intake days in 14');
  if(S.training.sessions14)obs.push(S.training.sessions14+' training sessions in 14 days');
  if(S.recovery.n)obs.push(S.recovery.n+' recovery ratings in 7 days');
  var sig=[];if(S.trend.status==='ok')sig.push('trend '+fmtRate(S.trend.slopePerWeek)+' \u00b7 '+S.trend.confidence);if(S.averages.avg7!=null)sig.push('7-day average '+fmtWeight(S.averages.avg7));if(S.waistTrend.status==='ok')sig.push('waist '+fmtSigned(S.waistTrend.perWeek,2)+' in/wk');if(S.adherence.logging)sig.push('logging '+S.adherence.logging.pct+'%');if(S.recovery.status==='ok')sig.push('recovery '+S.recovery.level);if(S.training.strength.status==='ok')sig.push('strength '+S.training.strength.overall);
  var mod=[];if(S.tdee.status==='ok')mod.push('TDEE '+fmtKcal(S.tdee.value,{estimate:true})+' ['+S.tdee.cls+', '+S.tdee.confidence+']');if(S.targetRate)mod.push('rate band '+fmtRateRange(S.targetRate.lo,S.targetRate.hi)+' ['+(S.targetRate.source==='user target'?'USER TARGET':S.targetRate.cls)+']');mod.push('water noise '+S.waterNoise.level+' [HEURISTIC]');if(S.muscleRisk.status==='ok')mod.push('muscle-retention risk '+S.muscleRisk.level+' [HEURISTIC]');
  return {observations:obs,signals:sig,models:mod,rule:'lattice level: '+dec.priority+' \u2192 '+dec.code+' (rules v'+DECISION_RULES_VERSION+')',diagnosis:d.primary?d.primary.title+' ('+d.primary.likelihood+')':'\u2014',confidence:dec.confidence,recheck:dec.recheckDays?dec.recheckDays+' days':'\u2014'};
}
function recordDecision(dec){
  if(!dec||!dec.code)return null;var today=todayISO();
  var last=(DB.decisions||[]).filter(function(x){return x.source==='system';}).slice(-1)[0];
  if(last&&last.date===today&&last.code===dec.code)return last;
  if(last&&last.code===dec.code&&last.date>addDays(today,-7)&&!dec.intervention)return last; // same standing decision within a week: not a new record
  var rec={id:uid('dec'),date:today,at:nowISO(),createdAt:nowISO(),source:'system',code:dec.code,verb:dec.verb,lede:dec.lede,why:dec.why,action:dec.action,confidence:dec.confidence,recheckDays:dec.recheckDays,recheckDate:dec.recheckDays?addDays(today,dec.recheckDays):null,reverseIf:dec.reverseIf,phaseId:dec.phaseId,rulesVersion:dec.rulesVersion,trace:dec.trace,intervention:dec.intervention||null,status:'standing'};
  DB.decisions.push(rec);emitEvent('decision.recorded',rec,{at:rec.createdAt||rec.at});save('decision');return rec;
}
function recordUserDecision(o){var rec={id:uid('dec'),date:o.date||todayISO(),at:nowISO(),createdAt:nowISO(),source:'user',code:'USER',verb:o.verb||'Decision',lede:o.note||'',why:[],action:[],confidence:null,recheckDays:num(o.recheckDays),recheckDate:num(o.recheckDays)?addDays(o.date||todayISO(),num(o.recheckDays)):null,phaseId:(activePhase()||{}).id||null,status:'standing'};pushUndo('record decision');DB.decisions.push(rec);save('decision:user');return rec;}
function decisionsOf(){return (DB.decisions||[]).filter(function(d){return d.date<=asOf()&&_knownBy(d,asOf());}).sort(function(a,b){return a.date<b.date?-1:1;});}

/* ============================================================================
   REGION: PREDICTION LEDGER — stamped before outcomes, never rewritten, scored when due.
   ============================================================================ */
function stampPredictions(){
  var today=todayISO();var made=[];
  [['weight7',7],['weight14',14],['weight28',28]].forEach(function(pair){
    var subject=pair[0],h=pair[1];
    if((DB.predictions||[]).some(function(p){return p.subject===subject&&localDateOf(p.madeAt)===today;}))return;
    var f=weightForecast(h);if(f.status!=='ok')return;
    var rec={id:uid('pred'),madeAt:nowISO(),date:today,subject:subject,model:'weight_forecast',modelVersion:modelById('weight_forecast').version,horizonDays:h,dueDate:f.dueDate,point:round(f.point,2),lo:round(f.lo,2),hi:round(f.hi,2),confidence:f.confidence,unit:'lb',
      inputs:{base:round(f.base,2),slopePerWeek:round(f.trend.slopePerWeek,3),residSd:round(f.trend.residSd,2),n:f.trend.n},assumptions:f.assumptions,phaseId:(activePhase()||{}).id||null,context:predictionContext(),outcome:null,actual:null,error:null,absError:null,covered:null,status:'pending',scoredAt:null};
    DB.predictions.push(rec);emitEvent('prediction.stamped',rec,{at:rec.madeAt});made.push(rec);
  });
  /* The forecast family's predictions are stamped too, under their own model id, so its track record against real
     outcomes accumulates from now on. That record — not its backtest — is what can eventually earn it a grade above
     operational. Only horizons the family would forecast reliably are stamped. */
  try{
    var F=forecastFamily();
    if(F.status==='ok')[7,14].forEach(function(h){
      var subject='weight'+h+'f',d=F.forecastDistribution[h];
      /* Every forecast the app shows is recorded, reliable or not, with its flag. Recording only the ones the forecaster
         trusted — the first version — would have made its track record a record of its confident moments, flattering
         it exactly where honesty matters. */
      if(!d||d.status==='insufficient')return;
      if((DB.predictions||[]).some(function(p){return p.subject===subject&&localDateOf(p.madeAt)===today;}))return;
      var rec={id:uid('pred'),madeAt:nowISO(),date:today,subject:subject,model:'weight_forecast_family',modelVersion:'1.0',horizonDays:h,
        dueDate:d.dueDate,point:d.point,lo:d.p10,hi:d.p90,level:d.level,confidence:'n/a',unit:'lb',reliable:d.reliable!==false,
        inputs:{method:F.selection[h].selected,weights:F.selection[h].weights},assumptions:['the recent regime continues','a single phase across the window'],
        phaseId:(activePhase()||{}).id||null,status:'pending'};
      DB.predictions.push(rec);emitEvent('prediction.stamped',rec,{at:rec.madeAt});made.push(rec);});
  }catch(e){_q(e,'P2');}
  if(made.length)save('predictions');return made;
}
function scorePredictions(){
  var today=todayISO();var scored=0;
  (DB.predictions||[]).forEach(function(p){
    if(p.status!=='pending'||p.dueDate>today)return;
    var s=dailySeries('weight',p.dueDate,7);var actual=s.length>=3?mean(s.map(function(d){return d.value;})):(s.length?s[s.length-1].value:null);
    if(actual==null){if(daysBetween(p.dueDate,today)>5){p.status='expired';p.scoredAt=nowISO();p.note='no weigh-ins near the due date';scored++;
      emitEvent('prediction.scored',{id:p.id,result:{status:'expired',scoredAt:p.scoredAt,note:p.note}},{at:p.scoredAt});}return;}
    p.actual=round(actual,2);p.error=round(actual-p.point,2);p.absError=Math.abs(p.error);p.covered=actual>=p.lo&&actual<=p.hi;p.status='scored';p.scoredAt=nowISO();p.actualBasis=s.length>=3?('7-day mean of '+s.length+' weigh-ins'):'single weigh-in';scored++;
    emitEvent('prediction.scored',{id:p.id,result:{actual:p.actual,error:p.error,absError:p.absError,covered:p.covered,status:'scored',scoredAt:p.scoredAt,actualBasis:p.actualBasis}},{at:p.scoredAt});
  });
  if(scored)save('predictions:score');return scored;
}
function forecastAccuracy(){
  var out={};['weight7','weight14','weight28'].forEach(function(sub){
    var list=(DB.predictions||[]).filter(function(p){return p.subject===sub&&p.status==='scored'&&p.scoredAt&&localDateOf(p.scoredAt)<=asOf();});
    if(list.length<3){out[sub]={status:'insufficient',n:list.length,need:(3-list.length)+' more scored forecasts'};return;}
    var errs=list.map(function(p){return p.error;});
    out[sub]={status:'ok',n:list.length,mae:mean(list.map(function(p){return p.absError;})),bias:mean(errs),coverage:Math.round(100*list.filter(function(p){return p.covered;}).length/list.length),nominal:80,verdict:function(){var b=mean(errs);var cov=list.filter(function(p){return p.covered;}).length/list.length;return (Math.abs(b)<0.4?'directionally accurate':(b>0?'losing less than predicted':'losing more than predicted'))+(cov<0.6?' \u00b7 intervals too narrow':(cov>0.95?' \u00b7 intervals wider than needed':' \u00b7 intervals calibrated'));}()};
  });
  return out;
}
function pendingPredictions(){return (DB.predictions||[]).filter(function(p){return p.status==='pending';}).sort(function(a,b){return a.dueDate<b.dueDate?-1:1;});}

/* ============================================================================
   REGION: INTERVENTIONS + EXPERIMENTS — change one variable, predict, recheck, score, learn.
   ============================================================================ */
function baselineSnapshot(){var S=getCurrentState();return {date:asOf(),trend:S.trend.status==='ok'?round(S.trend.slopePerWeek,2):null,avg7:S.averages.avg7!=null?round(S.averages.avg7,1):null,steps:S.steps.mean7!=null?Math.round(S.steps.mean7):null,calories:S.nutrition.avg7!=null?Math.round(S.nutrition.avg7):null,protein:S.nutrition.protein7!=null?Math.round(S.nutrition.protein7):null,recovery:S.recovery.status==='ok'?S.recovery.level:null,hunger:S.appetite.hunger?round(S.appetite.hunger.mean,1):null,strength:S.training.strength.status==='ok'?S.training.strength.overall:null};}
function experimentSpec(r){r=r||{};var dur=r.durationDays||14;
  return {estimand:'the difference in '+(r.metric||'the outcome')+' between the baseline ('+(r.baselineValue!=null?r.baselineValue:'current')+') and the intervention ('+(r.interventionValue!=null?r.interventionValue:'changed')+') periods for this person',
    design:{kind:'single-subject A\u2013B (baseline, then intervention)',days:dur,washoutDays:r.washoutDays||null,recheck:r.recheckDate||null},
    intervention:r.intervention||(r.variable?{variable:r.variable,from:r.baselineValue,to:r.interventionValue}:null),outcome:r.outcome||null,
    analysis:{method:'trend-adjusted comparison of the two periods, scored against the stated prediction interval',prediction:r.prediction||null,interval:[r.predLo!=null?r.predLo:null,r.predHi!=null?r.predHi:null]},
    finding:r.conclusion?{conclusion:r.conclusion,confidence:r.confidence||null}:null};}
function createExperiment(e){
  var start=e.startDate||todayISO();var dur=num(e.durationDays)||14;
  var rec={id:uid('exp'),createdAt:nowISO(),question:e.question||'',hypothesis:e.hypothesis||'',variable:e.variable||'other',baselineValue:e.baselineValue!=null?e.baselineValue:null,interventionValue:e.interventionValue!=null?e.interventionValue:null,intervention:e.intervention||'',
    prediction:e.prediction||'',predLo:num(e.predLo),predHi:num(e.predHi),metric:e.metric||'weight trend (lb/week)',startDate:start,durationDays:dur,recheckDate:addDays(start,dur),baseline:e.baseline||baselineSnapshot(),successCriteria:e.successCriteria||'',status:e.status||'active',outcome:null,conclusion:null,confidence:null,confounders:[],phaseId:(activePhase()||{}).id||null,decisionId:e.decisionId||null,notes:e.notes||''};
  /* §19 fields, set BEFORE the fingerprint: older records are never rewritten (that would change their hash and falsely
     flag their plan as changed); experimentSpec(e) derives the same fields for them, read-only. */
  Object.assign(rec,experimentSpec(rec));
  if(!e.silent)pushUndo('create experiment');
  /* §19: the plan is fingerprinted at creation, so any later change to it is detectable once results exist. */
  if(typeof experimentPlanHash==='function'){rec.planVersion=1;rec.planHash=experimentPlanHash(rec);}
  /* the intervention's id is part of the experiment before it is recorded: set afterwards, it reached the log only
     through a shared object, so a replay after a restart lost the link */
  var ivId=uid('iv');rec.interventionId=ivId;
  DB.experiments.push(rec);emitEvent('experiment.created',rec,{at:rec.createdAt});
  var iv={id:ivId,date:start,createdAt:nowISO(),variable:rec.variable,from:rec.baselineValue,to:rec.interventionValue,decisionId:rec.decisionId,experimentId:rec.id,expected:rec.prediction,recheckDate:rec.recheckDate,status:'active',outcome:null,phaseId:rec.phaseId};
  DB.interventions.push(iv);emitEvent('intervention.recorded',iv,{at:iv.createdAt});
  if(!e.noSave)save('experiment:create');return rec;
}
function applyDecisionIntervention(dec){
  if(!dec||!dec.intervention)return null;var iv=dec.intervention;var ph=activePhase();
  var d=recordDecision(dec);
  var exp=createExperiment({question:'Does '+iv.variable+' '+(iv.to!=null?('\u2192 '+iv.to):'change')+' produce: '+iv.expected+'?',hypothesis:iv.expected,variable:iv.variable,baselineValue:iv.from,interventionValue:iv.to,intervention:dec.verb,prediction:iv.expected,predLo:iv.variable==='steps'?-0.4:(iv.variable==='calories'&&iv.to>iv.from?null:-0.4),predHi:iv.variable==='steps'?-0.2:(iv.variable==='calories'&&iv.to>iv.from?null:-0.3),durationDays:iv.recheckDays||14,decisionId:d?d.id:null,silent:true,noSave:true});
  /* Route through updatePhase so the change lands in phase history and phaseAsOf() can reconstruct the
     pre-intervention targets. Writing ph.calorieTarget directly left no history entry, so a replay of the
     days before an intervention showed the post-intervention target. createExperiment already recorded the
     intervention for this change, so intervention:false suppresses a duplicate. */
  var IV_FIELD={calories:'calorieTarget',steps:'stepTarget',cardio:'cardioSessions',training:'trainingSessions',protein:'proteinTarget'};
  if(ph&&iv.to!=null&&IV_FIELD[iv.variable]){
    pushUndo('apply intervention');
    var patch={};patch[IV_FIELD[iv.variable]]=iv.to;
    updatePhase(ph.id,patch,{noUndo:true,noSave:true,intervention:false,label:'apply intervention'});
  }
  if(d){d.status='applied';d.experimentId=exp.id;emitEvent('decision.applied',{id:d.id,experimentId:exp.id});}
  save('intervention:apply');
  if(typeof notePlanChange==='function')notePlanChange('decision');   /* the decision's evidence and alternatives become the trigger */
  return exp;
}
function detectConfounders(exp){
  var c=[];var others=(DB.interventions||[]).filter(function(i){return i.id!==exp.interventionId&&i.date>=addDays(exp.startDate,-3)&&i.date<=exp.recheckDate&&_knownBy(i,asOf());});
  others.forEach(function(i){c.push('another variable changed: '+i.variable+' on '+shortDate(i.date));});
  var tags=obsOf('context',{from:exp.startDate}).filter(function(o){return o.date<=exp.recheckDate;});tags.forEach(function(t){if(/travel|illness|holiday|new scale|injury/i.test(t.value))c.push('context: '+t.value+' on '+shortDate(t.date));});
  var slBefore=dailySeries('sleep',exp.startDate,14),slAfter=dailySeries('sleep',exp.recheckDate,exp.durationDays);
  if(slBefore.length>=5&&slAfter.length>=5){var d=mean(slAfter.map(function(x){return x.value;}))-mean(slBefore.map(function(x){return x.value;}));if(Math.abs(d)>0.8)c.push('sleep changed by '+fmtSigned(d,1)+' h');}
  var cBefore=dailySeries('calories',exp.startDate,14),cAfter=dailySeries('calories',exp.recheckDate,exp.durationDays);
  if(exp.variable!=='calories'&&cBefore.length>=7&&cAfter.length>=7){var dc=mean(cAfter.map(function(x){return x.value;}))-mean(cBefore.map(function(x){return x.value;}));if(Math.abs(dc)>150)c.push('intake changed by '+fmtSigned(dc,0)+' kcal');}
  return c;
}
function evaluateExperiment(id,opts){
  opts=opts||{};var exp=DB.experiments.filter(function(e){return e.id===id;})[0];if(!exp)return null;
  var end=opts.asOf||exp.recheckDate;
  var before=weightTrend(14,exp.startDate),after=weightTrend(exp.durationDays,end);
  var res={evaluatedAt:nowISO(),endDate:end};
  if(before.status!=='ok'||after.status!=='ok'){res.conclusion='inconclusive';res.confidence='insufficient';res.summary='Not enough weigh-ins around the experiment window to compare trends.';res.observed=null;}
  else{
    var delta=after.slopePerWeek-before.slopePerWeek;res.before=round(before.slopePerWeek,2);res.after=round(after.slopePerWeek,2);res.observed=round(delta,2);
    var conf=detectConfounders(exp);
    var expected=exp.predLo!=null&&exp.predHi!=null;var lo=expected?Math.min(exp.predLo,exp.predHi):null,hi=expected?Math.max(exp.predLo,exp.predHi):null;
    /* Conclusions are graded, not binary. `confounded` says the experiment cannot answer the question — it is
       not evidence against the intervention. `contradicted` means the effect went the wrong way, which is
       different from `unsupported` (no material effect). Only the latter two become negative knowledge. */
    var noise=0.15;try{var pb=personalBaselines().streams.weight;if(pb&&pb.status==='ok')noise=Math.max(0.12,pb.baseline*1.2);}catch(e){_q(e);}
    if(conf.length>=2){res.conclusion='confounded';res.confidence='none';res.summary='Cannot attribute: '+conf.join('; ')+'. The experiment cannot answer the question either way.';}
    else if(expected){
      var half=Math.abs(lo)*0.5;var wrongWay=(lo<0&&delta>noise)||(lo>0&&delta<-noise);
      if(wrongWay){res.conclusion='contradicted';res.summary='Trend moved '+fmtRate(delta)+', in the opposite direction to the predicted '+fmtRateRange(lo,hi)+'.';}
      else if(delta<=hi+0.05&&delta>=lo-0.3){res.conclusion='supported';res.summary='Trend changed by '+fmtRate(delta)+' vs predicted '+fmtRateRange(lo,hi)+'.';}
      else if(delta<=hi&&delta<-half){res.conclusion='supported';res.summary='Trend changed by '+fmtRate(delta)+', more than predicted.';}
      else if(Math.abs(delta)<=noise){res.conclusion='unsupported';res.summary='Trend changed by '+fmtRate(delta)+', inside your own scale noise ('+fmtRate(noise)+'), vs predicted '+fmtRateRange(lo,hi)+'; no material effect.';}
      else if(Math.abs(delta)<=Math.max(0.15,half)){res.conclusion='weakly-supported';res.summary='Trend changed by '+fmtRate(delta)+' — the right direction but short of the predicted '+fmtRateRange(lo,hi)+'.';}
      else{res.conclusion='unsupported';res.summary='Trend moved '+fmtRate(delta)+', short of the prediction.';}
      res.confidence=conf.length?'low':(after.confidence==='high'&&before.confidence!=='low'?'medium':'low');}
    else{res.conclusion=Math.abs(delta)>Math.max(0.2,noise)?'weakly-supported':'inconclusive';res.confidence='low';res.summary='Trend changed by '+fmtRate(delta)+' (no numeric prediction was stamped, so this cannot be scored against an expectation).';}
    res.noiseFloor=round(noise,2);res.confounders=conf;
    var recB=dailySeries('fatigue',exp.startDate,7),recA=dailySeries('fatigue',end,7);if(recB.length>=3&&recA.length>=3){var df=mean(recA.map(function(x){return x.value;}))-mean(recB.map(function(x){return x.value;}));res.recoveryDelta=round(df,1);if(df>=1.5)res.summary+=' Fatigue rose by '+fmtNum(df,1)+' points.';}
  }
  if(!opts.dryRun){
    pushUndo('score experiment');exp.outcome=res;exp.conclusion=res.conclusion;exp.confidence=res.confidence;exp.status='complete';exp.completedAt=nowISO();
    var result={outcome:res,conclusion:res.conclusion,confidence:res.confidence,status:'complete',completedAt:exp.completedAt};
    if(res.confounders){exp.confounders=res.confounders;result.confounders=res.confounders;}
    emitEvent('experiment.evaluated',{id:exp.id,result:result},{at:exp.completedAt});
    var iv=DB.interventions.filter(function(i){return i.id===exp.interventionId;})[0];if(iv){iv.status='evaluated';iv.outcome=res.conclusion;}   /* folded from experiment.evaluated as well */
    if(res.conclusion==='unsupported'||res.conclusion==='contradicted')addNegative({intervention:exp.intervention||(exp.variable+' '+exp.baselineValue+'\u2192'+exp.interventionValue),variable:exp.variable,expected:exp.prediction,observed:res.summary,reasons:(res.conclusion==='contradicted'?['effect went the wrong way']:[]).concat(['adherence','compensation','water','measurement error']).concat(exp.confounders||[]),confidence:res.confidence,applicability:'this phase / weight zone',experimentId:exp.id,silent:true});
    try{var arc={id:uid('arc'),kind:'experiment',archivedAt:nowISO(),summary:exp.question,record:JSON.parse(JSON.stringify(exp))};DB.archive.push(arc);emitEvent('archive.recorded',JSON.parse(JSON.stringify(arc)),{at:arc.archivedAt});}catch(e){_q(e);}
    save('experiment:evaluate');
  }
  return res;
}
/* as-of aware: an experiment is active on a day if it had been created by then, had started, and had not yet been completed/abandoned by that day */
function _experimentActiveOn(e,date){if(!_knownBy(e,date))return false;if(e.startDate>date)return false;if(!_ASOF)return e.status==='active';if(e.status==='active')return true;var done=e.completedAt||e.abandonedAt||null;return !!done&&localDateOf(done)>date;}
function experimentsDue(){var d=asOf();return (DB.experiments||[]).filter(function(e){return _experimentActiveOn(e,d)&&e.recheckDate<=d;});}
function activeExperiments(){var d=asOf();return (DB.experiments||[]).filter(function(e){return _experimentActiveOn(e,d);});}

/* ============================================================================
   REGION: NEGATIVE KNOWLEDGE — what did not work is kept, searchable, and consulted.
   ============================================================================ */
function addNegative(n){
  var rec={id:uid('neg'),date:todayISO(),at:nowISO(),createdAt:nowISO(),intervention:n.intervention,variable:n.variable||'other',expected:n.expected||'',observed:n.observed||'',reasons:n.reasons||[],confidence:n.confidence||'low',applicability:n.applicability||'',experimentId:n.experimentId||null,phaseId:(activePhase()||{}).id||null,weightZone:(rateBand(weightAverages().avg7||currentWeight().value)||{}).zone||null};
  if(!n.silent)pushUndo('record negative knowledge');
  /* versioned (Stage E): the method that judged it, and its place among findings about the same change */
  var same=(DB.negatives||[]).filter(function(x){return x.variable===rec.variable&&x.intervention===rec.intervention;});
  rec.modelVersion=NEGATIVE_MODEL_VERSION;rec.version=same.length+1;rec.follows=same.length?same[same.length-1].id:null;
  DB.negatives.push(rec);emitEvent('negative.recorded',rec,{at:rec.createdAt||rec.at});if(!n.silent)save('negative');return rec;
}
var NEGATIVE_MODEL_VERSION='negative-1.0';
function getNegativeKnowledge(){return (DB.negatives||[]).filter(function(n){return n.date<=asOf()&&_knownBy(n,asOf());}).sort(function(a,b){return a.date<b.date?1:-1;});}

/* ============================================================================
   REGION: LEARNING — what we know / think / don't know / what failed / what worked.
   ============================================================================ */
function learningSummary(){
  var S=getCurrentState();var acc=forecastAccuracy();var know=[],think=[],unknown=[],failed=[],worked=[];
  var t=S.tdee;
  if(t.status==='ok'&&(t.cls==='EMPIRICAL'||t.cls==='CALIBRATED'))know.push({text:'Maintenance is about '+fmtKcal(t.lo,{estimate:true,bare:true})+'\u2013'+fmtKcal(t.hi,{estimate:true})+' at the current weight',prov:t.cls.toLowerCase()+' \u00b7 '+t.n+' logged days',conf:t.confidence});
  else if(t.status==='ok'&&t.cls==='BLENDED')think.push({text:'Maintenance is probably near '+fmtKcal(t.value,{estimate:true})+' ('+fmtKcal(t.lo,{estimate:true,bare:true})+'\u2013'+fmtKcal(t.hi,{estimate:true,bare:true})+')',prov:'blended prior + '+t.n+' days',conf:t.confidence});
  else unknown.push({text:'Individual maintenance calories',prov:t.status==='ok'?('only a generic prior of '+fmtKcal(t.value,{estimate:true})+' exists'):'no estimate',need:(t.need||t.empiricalNeed||['14+ days of intake and weight'])});
  if(S.trend.status==='ok'&&S.trend.confidence==='high')know.push({text:'Weight is moving at '+fmtRate(S.trend.slopePerWeek)+' with day-to-day noise of about '+fmtWeight(S.trend.residSd),prov:'derived \u00b7 '+S.trend.n+' weigh-ins',conf:'high'});
  if(acc.weight14.status==='ok')know.push({text:'14-day forecasts have a mean error of '+fmtWeight(acc.weight14.mae)+' and are '+acc.weight14.verdict,prov:'calibrated \u00b7 '+acc.weight14.n+' scored',conf:acc.weight14.n>=6?'medium':'low'});else unknown.push({text:'How accurate the system\u2019s forecasts are',prov:acc.weight14.n+' scored',need:[acc.weight14.need]});
  (DB.experiments||[]).filter(function(e){return e.status==='complete';}).forEach(function(e){var item={text:(e.intervention||e.variable)+': '+(e.outcome&&e.outcome.summary||''),prov:'experiment \u00b7 '+shortDate(e.startDate)+'\u2013'+shortDate(e.recheckDate),conf:e.confidence};if(e.conclusion==='supported')worked.push(item);else if(e.conclusion==='unsupported')failed.push(item);else think.push(Object.assign({},item,{text:'Inconclusive \u2014 '+item.text}));});
  getNegativeKnowledge().forEach(function(n){if(!n.experimentId||!(DB.experiments||[]).some(function(e){return e.id===n.experimentId;}))failed.push({text:n.intervention+' \u2014 '+n.observed,prov:'negative knowledge \u00b7 '+shortDate(n.date),conf:n.confidence});});
  // associations (labeled as association, not causation)
  /* An association shown to the user must clear the SAME bar the rigorous engine applies. This panel was
     asserting "shorter sleep is associated with higher hunger, r=-0.30" while the distributed-lag engine
     found no lag surviving correction for autocorrelation — consecutive days are not independent, and the
     uncorrected r treats the same information as though it arrived 45 times. A claim the system's own
     stricter test rejects does not belong on a panel headed "What we think". */
  var hs=lagCorrelation('sleep','hunger',0);
  var hsOk=false,hsLag=null;
  try{
    /* The corrected engine, not the raw one: this claim was already demoted once for failing the
       autocorrelation test, and it must also clear correction for having searched several lags. */
    var dl=distributedLagCorrected('sleep','hunger',{maxLag:3});
    hsOk=dl.status==='ok'&&dl.surviving.length>0;
    hsLag=dl.surviving[0]||null;
  }catch(e){}
  if(hs.status==='ok'&&hsOk)think.push({text:(hsLag.r<0?'Shorter sleep is associated with higher hunger':'Longer sleep is associated with higher hunger'),
    prov:'association \u00b7 lag '+hsLag.lag+' day(s) \u00b7 r='+hsLag.r+' \u00b7 survives autocorrelation correction',conf:'low'});
  else if(hs.status==='ok')unknown.push({text:'Whether your sleep affects your hunger',
    prov:'a raw correlation of '+round(hs.r,2)+' does not survive correction for autocorrelation',
    need:['more variation in sleep, or an experiment that changes it deliberately']});
  /* A claim that fails its trend-adjusted placebo check says so in its own words, not only in its provenance. */
  var ch=cardioHungerAssociation();if(ch.status==='ok')think.push({text:ch.text+(ch.placeboVerdict==='failed'&&Math.abs(ch.diff)>=0.5?' \u2014 but most of that difference follows the overall trend, so it may not be the cardio':''),prov:'association \u00b7 '+ch.n+' days \u00b7 placebo check '+ch.placeboVerdict+(ch.trendAdjusted!=null?(' (trend-adjusted difference '+fmtNum(ch.trendAdjusted,1)+', future-cardio '+fmtNum(ch.placebo,1)+')'):''),conf:ch.placeboVerdict==='failed'?'very low':'low'});
  if(S.training.strength.status==='ok')know.push({text:'Strength is '+S.training.strength.overall+' across '+S.training.strength.tracked+' tracked lifts',prov:'derived \u00b7 e1RM per exposure',conf:S.training.strength.confidence});else unknown.push({text:'Whether strength is holding',prov:'',need:['4+ exposures per lift']});
  if(S.bodyComp.measured)know.push({text:'Body fat '+fmtPct(S.bodyComp.measured.value,1)+' by '+S.bodyComp.measured.method,prov:'measured \u00b7 '+ageLabel(S.bodyComp.measured.date),conf:S.bodyComp.measured.fresh.state==='stale'?'low':'medium'});
  else if(S.bodyComp.estimate&&S.bodyComp.estimate.status==='ok')think.push({text:'Body fat is roughly '+fmtPct(S.bodyComp.estimate.lo,0)+'\u2013'+fmtPct(S.bodyComp.estimate.hi,0)+' by circumference model',prov:'heuristic',conf:S.bodyComp.estimate.confidence});else unknown.push({text:'Body composition',prov:'',need:S.bodyComp.estimate?S.bodyComp.estimate.need:['waist and neck']});
  if(S.muscleRisk.status==='ok')think.push({text:'Muscle-retention risk is '+S.muscleRisk.level,prov:'heuristic from proxies',conf:S.muscleRisk.confidence});
  unknown.push({text:'Individual response to step changes',prov:'',need:['a completed steps experiment']});
  return {know:know,think:think,unknown:unknown,failed:failed,worked:worked,maturity:t.status==='ok'?t.maturity:'no model'};
}
function lagCorrelation(typeA,typeB,lag){
  var a=seriesWindow(typeA,60),b=seriesWindow(typeB,60);var bm={};b.forEach(function(d){bm[d.date]=d.value;});
  var xs=[],ys=[];a.forEach(function(d){var k=addDays(d.date,lag||0);if(bm[k]!=null){xs.push(d.value);ys.push(bm[k]);}});
  if(xs.length<10)return {status:'insufficient',n:xs.length};var c=correlation(xs,ys);return {status:'ok',n:c.n,r:c.r};
}
/* The outcome with its straight-line trend over the window removed: a real effect survives this, a coincidence of
   timing does not. A one-week placebo alone let a pure trend pass (hunger rising, cardio in the later weeks). */
function _detrended(series){var n=series.length;if(n<3)return series.map(function(d){return {date:d.date,value:d.value};});
  var xs=series.map(function(d,i){return i;}),ys=series.map(function(d){return d.value;}),xm=mean(xs),ym=mean(ys);
  var sxx=xs.reduce(function(a,x){return a+(x-xm)*(x-xm);},0),b=sxx?xs.reduce(function(a,x,i){return a+(x-xm)*(ys[i]-ym);},0)/sxx:0;
  return series.map(function(d,i){return {date:d.date,value:d.value-(ym+b*(i-xm))};});}
function placeboDifference(markType,outcomeType,shiftDays,days,detrend){
  var c=seriesWindow(markType,days+shiftDays),h=seriesWindow(outcomeType,days),cm={};c.forEach(function(d){cm[addDays(d.date,-shiftDays)]=1;});
  if(detrend)h=_detrended(h);
  var on=[],off=[];h.forEach(function(d){(cm[d.date]?on:off).push(d.value);});return (on.length<5||off.length<5)?null:mean(on)-mean(off);
}
function cardioHungerAssociation(){
  var c=seriesWindow('cardio',42),h=seriesWindow('hunger',42);var cm={};c.forEach(function(d){cm[d.date]=1;});
  var on=[],off=[];h.forEach(function(d){(cm[d.date]?on:off).push(d.value);});
  if(on.length<5||off.length<5)return {status:'insufficient'};var diff=mean(on)-mean(off);
  /* PLACEBO CHECK (H4). Next week's cardio cannot change today's hunger; if "future cardio" days differ as much, the
     pattern is a shared trend, not the cardio. The claim passes only if the real difference is at least twice it. */
  var adj=placeboDifference('cardio','hunger',0,42,true),pl=placeboDifference('cardio','hunger',7,42,true);
  var verdict=(pl==null||adj==null)?'not checked':(Math.abs(adj)>=0.5&&Math.abs(pl)<=Math.abs(adj)/2?'passed':'failed');
  return {status:'ok',n:on.length+off.length,diff:diff,trendAdjusted:adj,placebo:pl,placeboVerdict:verdict,text:Math.abs(diff)<0.5?'Hunger is similar on cardio and non-cardio days':(diff>0?'Hunger runs '+fmtNum(diff,1)+' points higher on cardio days':'Hunger runs '+fmtNum(-diff,1)+' points lower on cardio days')};
}

/* ============================================================================
   REGION: REPLAY — what the system knew at the time. No future information leaks backward.
   ============================================================================ */
function replayAt(date){return withAsOf(date,function(){var S=getCurrentState();var dec=decide();return {date:date,state:S,decision:dec,diagnosis:diagnose(),predictionsThen:(DB.predictions||[]).filter(function(p){return localDateOf(p.madeAt)<=date;}).length,snapshot:(DB.snapshots||[]).filter(function(s){return s.date===date;})[0]||null};});}
function replayLeakageCheck(dates){
  var leaks=[];(dates||[]).forEach(function(d){withAsOf(d,function(){getCurrentState();decide();Object.keys(_MEMO).forEach(function(k){if(k.indexOf('ds:')!==0)return;(_MEMO[k]||[]).forEach(function(day){if(day.date>d)leaks.push({asOf:d,key:k,date:day.date});(day.obs||[]).forEach(function(o){if(o.createdAt&&localDateOf(o.createdAt)>d)leaks.push({asOf:d,key:k,createdAt:o.createdAt});});});});});});
  return leaks;
}
/* ---- snapshots + archive ---- */
function captureSnapshot(){
  var today=todayISO();var S=getCurrentState();var dec=decide();
  var snap={date:today,at:nowISO(),phaseId:S.phase?S.phase.id:null,weight:S.weight.value!=null?round(S.weight.value,1):null,avg7:S.averages.avg7!=null?round(S.averages.avg7,1):null,trend:S.trend.status==='ok'?round(S.trend.slopePerWeek,2):null,trendConf:S.trend.status==='ok'?S.trend.confidence:'insufficient',waist:S.waist?S.waist.value:null,calories:S.nutrition.calories,protein:S.nutrition.protein,steps:S.steps.last?S.steps.last.value:null,sleep:S.recovery.sleep?round(S.recovery.sleep.mean,1):null,recovery:S.recovery.status==='ok'?S.recovery.level:null,hunger:S.appetite.hunger?round(S.appetite.hunger.mean,1):null,tdee:S.tdee.status==='ok'?Math.round(S.tdee.value):null,tdeeCls:S.tdee.status==='ok'?S.tdee.cls:null,decision:dec.code,confidence:dec.confidence,trust:S.trust.overall.level};
  var idx=(DB.snapshots||[]).findIndex(function(s){return s.date===today;});if(idx>=0)DB.snapshots[idx]=snap;else DB.snapshots.push(snap);emitEvent('snapshot.captured',snap);
  if(DB.snapshots.length>400)DB.snapshots=DB.snapshots.slice(-400);
  return snap;
}
function archivePhase(ph){
  var startW=dailySeries('weight',ph.startDate,7);var endW=dailySeries('weight',ph.endDate||asOf(),7);
  var sW=startW.length?mean(startW.map(function(d){return d.value;})):null,eW=endW.length?mean(endW.map(function(d){return d.value;})):null;
  var days=daysBetween(ph.startDate,ph.endDate||asOf());var weeks=days/7;
  var cal=DB.observations.filter(function(o){return o.type==='calories'&&!o.retracted&&o.phaseId===ph.id;}),pr=DB.observations.filter(function(o){return o.type==='protein'&&!o.retracted&&o.phaseId===ph.id;});
  var sess=(DB.sessions||[]).filter(function(s){return s.phaseId===ph.id&&!s.retracted;});
  var exps=(DB.experiments||[]).filter(function(e){return e.phaseId===ph.id;});var negs=(DB.negatives||[]).filter(function(n){return n.phaseId===ph.id;});
  var summary={label:phaseLabel(ph)+' \u00b7 '+Math.round(weeks)+' weeks',startWeight:sW,endWeight:eW,observedRate:(sW!=null&&eW!=null&&weeks>0)?(eW-sW)/weeks:null,avgIntake:cal.length?mean(cal.map(function(o){return o.value;})):null,avgProtein:pr.length?mean(pr.map(function(o){return o.value;})):null,trainingSessions:sess.length,trainingPerWeek:weeks>0?sess.length/weeks:null,experiments:exps.length,supported:exps.filter(function(e){return e.conclusion==='supported';}).length,unsupported:exps.filter(function(e){return e.conclusion==='unsupported';}).length,negatives:negs.length,outcome:ph.outcome||'',lessons:exps.filter(function(e){return e.outcome;}).map(function(e){return e.intervention+': '+e.conclusion;}).concat(negs.map(function(n){return 'did not work: '+n.intervention;}))};
  var arc={id:uid('arc'),kind:'phase',archivedAt:nowISO(),summary:summary.label,record:{phase:JSON.parse(JSON.stringify(ph)),summary:summary,modelVersions:MODELS.map(function(m){return m.id+'@'+m.version;}),rulesVersion:DECISION_RULES_VERSION,decisions:(DB.decisions||[]).filter(function(d){return d.phaseId===ph.id;}).map(function(d){return {date:d.date,code:d.code,confidence:d.confidence};})}};
  DB.archive.push(arc);emitEvent('archive.recorded',JSON.parse(JSON.stringify(arc)),{at:arc.archivedAt});
  return summary;
}
/* ---- value of information ---- */
/* The formal engine (valueOfInformationFormal) scores uncertainty reduction against decision impact and burden.
   This list stays as the human-facing catalogue and inherits the formal ranking when it has an opinion. */
function valueOfInformation(){
  var S=getCurrentState();var items=[];
  var formal=null;try{formal=valueOfInformationFormal();}catch(e){_q(e);}
  var wc=coverage('weight',14);if(wc.pct<85)items.push({what:'Daily weigh-in',value:wc.pct<50?'high':'medium',why:'the trend model has '+wc.logged+' of 14 days; every model downstream of the trend inherits its uncertainty'});
  var cc=coverage('calories',14);if(cc.pct<70)items.push({what:'Intake logging',value:'high',why:'the personal energy model needs 70% coverage; it has '+cc.pct+'%'});
  var waist=latestObs('waist');if(!waist||freshness('waist',waist.date).state!=='fresh')items.push({what:'Waist measurement',value:(S.waterNoise.level==='high'||(S.trend.status==='ok'&&S.trend.direction==='flat'))?'high':'medium',why:(!waist?'never measured; ':'last '+ageLabel(waist.date)+'; ')+'it separates fat loss from water when the scale is noisy or flat'});
  if(S.recovery.status!=='ok')items.push({what:'Sleep and fatigue ratings',value:'medium',why:'recovery is unrated, so the safety level of the lattice cannot fire and rate-of-loss checks are weaker'});
  if(S.training.strength.status!=='ok')items.push({what:'Training sets with load and reps',value:'medium',why:'strength trend needs 4 exposures per lift; it is the strongest muscle-retention proxy available'});
  var pc=coverage('protein',14);if(cc.pct>=70&&pc.pct<70)items.push({what:'Protein grams',value:'medium',why:'protein adherence is a priority variable in a cut'});
  if(!latestObs('neck')&&waist)items.push({what:'Neck measurement',value:'low',why:'unlocks the circumference body-fat estimate (heuristic, \u00b13\u20134%)'});
  if(S.appetite.status!=='ok')items.push({what:'Hunger rating',value:'low',why:'appetite burden informs sustainability and the over-aggressive check'});
  var rank={high:0,medium:1,low:2};items.sort(function(a,b){return rank[a.value]-rank[b.value];});
  if(formal&&formal.items.length){var byId={weight:'weight-frequency',intake:'intake-coverage',waist:'waist',training:'strength-tracking'};
    items.forEach(function(it){var key=/weigh/i.test(it.what)?'weight-frequency':(/intake/i.test(it.what)?'intake-coverage':(/waist/i.test(it.what)?'waist':(/training|strength/i.test(it.what)?'strength-tracking':null)));
      var f=key&&formal.items.filter(function(x){return x.id===key;})[0];if(f){it.score=f.value;it.timeToInfo=f.timeToInfo;it.why=it.why+' \u00b7 answer in '+f.timeToInfo+' days';}});
    items.sort(function(a,b){return (b.score||0)-(a.score||0)||rank[a.value]-rank[b.value];});}
  return {items:items,top:items[0]||null,formal:formal};
}
/* ---- due actions ---- */
function dueActions(){
  var today=asOf();var out=[];
  pendingPredictions().filter(function(p){return p.dueDate<=today;}).forEach(function(p){out.push({kind:'prediction',label:'Score the '+p.horizonDays+'-day forecast made '+shortDate(p.date),due:p.dueDate,act:'pred.score'});});
  experimentsDue().forEach(function(e){out.push({kind:'experiment',label:'Evaluate experiment: '+(e.intervention||e.variable),due:e.recheckDate,act:'exp.evaluate',arg:e.id});});
  var waist=latestObs('waist');if(!waist||daysBetween(waist.date,today)>=7)out.push({kind:'measurement',label:'Weekly waist measurement',due:waist?addDays(waist.date,7):today,act:'log.open',arg:'waist'});
  var ph=activePhase();if(ph){var wk=phaseWeek(ph);if(wk&&wk%4===0&&dowShort(today)==='Mon')out.push({kind:'review',label:'Phase review (week '+wk+')',due:today,act:'nav.tab',arg:'plan'});}
  var lastB=DB.settings.lastBackupAt;if(!lastB||daysBetween(lastB.slice(0,10),today)>7)out.push({kind:'backup',label:lastB?('Backup is '+ageLabel(lastB.slice(0,10)))+'':'No backup yet',due:today,act:'data.backup'});
  (DB.decisions||[]).filter(function(d){return d.status==='standing'&&d.recheckDate&&d.recheckDate<=today;}).slice(-1).forEach(function(d){out.push({kind:'recheck',label:'Recheck window reached for "'+d.verb+'"',due:d.recheckDate,act:'nav.tab',arg:'today'});});
  return out.sort(function(a,b){return a.due<b.due?-1:1;});
}
/* ---- upcoming schedule (next 7 days) ---- */
function upcoming(){
  var out=[];var ph=activePhase();var today=asOf();
  var prog=trainingProgram();
  /* from the schedule, not the weekly template: shift patterns, moved sessions, days off and plan edits now show here */
  for(var i=0;i<7;i++){var d=addDays(today,i),day=null;try{day=typeof scheduledPlan==='function'?scheduledPlan(d,prog):prog.week[dowShort(d)];}catch(e){day=prog.week[dowShort(d)];}
    if(day&&day.kind&&day.kind!=='rest'){var done=i===0&&(DB.sessions||[]).some(function(s){return s.date===d&&!s.retracted;});out.push({date:d,label:(day.label||day.name||'Training')+(done?' (done)':''),kind:day.kind});}}
  var waist=latestObs('waist');out.push({date:waist?addDays(waist.date,7):today,label:'Waist measurement',kind:'measure'});
  pendingPredictions().slice(0,3).forEach(function(p){out.push({date:p.dueDate,label:p.horizonDays+'-day forecast due',kind:'prediction'});});
  activeExperiments().forEach(function(e){out.push({date:e.recheckDate,label:'Experiment recheck: '+(e.intervention||e.variable),kind:'experiment'});});
  (DB.decisions||[]).filter(function(d){return d.status==='standing'&&d.recheckDate&&d.recheckDate>=today;}).slice(-1).forEach(function(d){out.push({date:d.recheckDate,label:'Reassess: '+d.verb,kind:'recheck'});});
  if(ph&&ph.type==='cut'){var wk=phaseWeek(ph);if(wk&&(wk%7===0||wk%7===6))out.push({date:addDays(ph.startDate,(Math.ceil(wk/7)*7)*7),label:'Deload window (every 6\u20138 weeks)',kind:'deload'});}
  return out.filter(function(x){return x.date>=today&&daysBetween(today,x.date)<=14;}).sort(function(a,b){return a.date<b.date?-1:1;});
}
/* ---- attention items with a budget ---- */
function attentionItems(){
  var S=getCurrentState();var d=diagnose();var items=[];
  d.findings.forEach(function(f){if(f.id==='none')return;var sev=f.severity==='high'?(f.id==='rapid'&&f.likelihood==='probable'?'critical':'high'):f.severity;items.push({severity:sev,title:f.title,evidence:f.evidence.slice(0,3),consequence:f.id==='stall'?'the deficit is not producing tissue change; time is spent without information':(f.id==='rapid'?'lean tissue and training quality are at risk':(f.id==='recovery'?'performance and adherence degrade before the scale does':(f.id==='underlogging'?'every energy model is throttled to low confidence':''))),action:f.test,recheck:f.id==='water'?'7 days':'14 days',id:f.id});});
  var waist=latestObs('waist');if(!waist)items.push({severity:'low',title:'No waist measurement yet',evidence:['weight alone cannot separate fat from water'],consequence:'stall and composition models stay insufficient',action:'Log a waist measurement',recheck:'weekly',id:'waist'});
  else if(freshness('waist',waist.date).state==='stale')items.push({severity:'info',title:'Waist measurement is '+ageLabel(waist.date),evidence:[],consequence:'composition estimate confidence is reduced',action:'Measure waist',recheck:'weekly',id:'waist'});
  if(S.trust.overall.level==='low'||S.trust.overall.level==='moderate'){var top=S.trust.reasons[0];if(top)items.push({severity:S.trust.overall.level==='low'?'moderate':'info',title:'Data trust '+S.trust.overall.level,evidence:S.trust.reasons.slice(0,2),consequence:'model confidence is capped at data trust',action:'Fill the weakest stream: '+top,recheck:'7 days',id:'trust'});}
  if(S.adherence.protein&&S.adherence.protein.pct<85&&S.adherence.protein.pct>=60)items.push({severity:'info',title:'Protein slightly below target on some days',evidence:['target met '+S.adherence.protein.pct+'% of days'],consequence:'',action:'front-load protein at breakfast',recheck:'7 days',id:'protein'});
  var order={critical:0,high:1,moderate:2,low:3,info:4};items.sort(function(a,b){return order[a.severity]-order[b.severity];});
  var budget={critical:1,high:2,moderate:3,low:3,info:4},seen={},kept=[],dropped=0;items.forEach(function(it){seen[it.severity]=(seen[it.severity]||0)+1;if(seen[it.severity]<=budget[it.severity])kept.push(it);else dropped++;});
  return {items:kept,dropped:dropped};
}
/* ---- training program templates (from the source framework; adjustable, explainable) ---- */
var PROGRAMS={
  fullbody3:{label:'3\u00d7 full body (phase A)',days:{Mon:{label:'Full body A',kind:'lift',template:'fbA'},Wed:{label:'Full body B',kind:'lift',template:'fbB'},Fri:{label:'Full body A/B',kind:'lift',template:'fbA'},Tue:{label:'Walk',kind:'walk'},Thu:{label:'Cardio 25\u201330 min + walk',kind:'cardio'},Sat:{label:'Cardio 25\u201330 min + walk',kind:'cardio'},Sun:{label:'Rest / walk',kind:'rest'}},
    templates:{fbA:[['Squat or leg press',3,'8\u201312'],['Bench press or machine press',3,'8\u201312'],['Lat pulldown',3,'8\u201312'],['Romanian deadlift',2,'8\u201312'],['Lateral raise',2,'12\u201315'],['Cable curl',2,'10\u201315'],['Triceps pressdown',2,'10\u201315']],fbB:[['Leg press',3,'8\u201312'],['Incline DB press',3,'8\u201312'],['Seated cable row',3,'8\u201312'],['Leg curl',3,'10\u201315'],['Shoulder press',2,'8\u201312'],['Lat pulldown',2,'8\u201312'],['Calf raise',3,'10\u201315']]},rir:'2\u20133 RIR \u2014 the ACSM 2026 position stand reports similar hypertrophy to training to failure with less accumulated fatigue',acsm:'\u226510 sets per muscle per week is the hypertrophy target; full range of motion; loads anywhere from 30\u2013100% 1RM work when effort is sufficient',why:'establish technique and consistency with repeated exposure to the fundamental movements'},
  upperlower4:{label:'4\u00d7 upper/lower (phase B\u2013D)',days:{Mon:{label:'Upper A',kind:'lift',template:'uA'},Tue:{label:'Lower A',kind:'lift',template:'lA'},Wed:{label:'Cardio 35\u201345 min + walk',kind:'cardio'},Thu:{label:'Upper B',kind:'lift',template:'uB'},Fri:{label:'Lower B',kind:'lift',template:'lB'},Sat:{label:'Cardio 40\u201345 min + walk',kind:'cardio'},Sun:{label:'Walk / recovery',kind:'rest'}},
    templates:{uA:[['Bench press',3,'6\u201310'],['Lat pulldown',3,'8\u201312'],['Incline DB press',3,'8\u201312'],['Cable row',3,'8\u201312'],['Lateral raise',3,'12\u201320'],['Biceps curl',2,'10\u201315'],['Triceps extension',2,'10\u201315']],lA:[['Squat or leg press',3,'6\u201310'],['Romanian deadlift',3,'8\u201312'],['Leg curl',3,'10\u201315'],['Leg extension',2,'10\u201315'],['Calf raise',3,'10\u201315'],['Abdominal movement',3,'10\u201320']],uB:[['Overhead press',3,'6\u201310'],['Pull-up or lat pulldown',3,'8\u201312'],['Machine or DB chest press',3,'8\u201312'],['Cable row',3,'8\u201312'],['Lateral raise',3,'12\u201320'],['Curl',2,'10\u201315'],['Triceps pressdown',2,'10\u201315']],lB:[['Deadlift variation',2,'5\u20138'],['Leg press',3,'8\u201312'],['Bulgarian split squat',2,'8\u201312'],['Leg curl',3,'10\u201315'],['Calf raise',3,'10\u201315'],['Abs',3,'10\u201320']]},rir:'2\u20133 RIR on accessories, 1\u20132 on the main lifts; increase load 2\u201310% at the top of the range',acsm:'strength work sits at \u226580% 1RM for 2\u20133 sets, at least twice a week, with the key lifts placed early in the session (ACSM 2026)',why:'more weekly volume per muscle once consistency exists; progression is load-when-reps-are-met, not every week'}
};
function trainingProgram(){var key=DB.settings.program||'fullbody3';
  if(_ASOF&&Array.isArray(DB.settings.programHistory)&&DB.settings.programHistory.length){
    var H=DB.settings.programHistory;
    var hist=H.filter(function(h){return localDateOf(h.at)<=_ASOF;});
    /* With no change recorded on or before the replay day, the program in force then is what the earliest
       recorded change moved AWAY from — not what it moved to. Using the entry's own program would report a
       switch as if it had always been in place. */
    key=hist.length?hist[hist.length-1].program:(H[0].from||H[0].program);
  }
  /* A user copy of a plan wins over the built-in. During a replay, the copy is projected from the event log
     so the plan reads as it stood then, not as it stands now. */
  var p;
  if(_ASOF&&typeof projectEvents==='function'){
    try{var proj=projectEvents(_EVENTS,{asOf:_ASOF}).db;
      p=((proj.settings&&proj.settings.customPrograms)||{})[key]||PROGRAMS[key]||PROGRAMS.fullbody3;}
    catch(e){_q(e,'P2');p=PROGRAMS[key]||PROGRAMS.fullbody3;}
  }else p=(typeof programDef==='function'?programDef(key):(PROGRAMS[key]||PROGRAMS.fullbody3));
  return {key:key,label:p.label,week:p.days,templates:p.templates,rir:p.rir,why:p.why,acsm:p.acsm||null,
    custom:(typeof programIsCustom==='function')?programIsCustom(key):false};}
function todaysTraining(){var p=trainingProgram();var dow=dowShort(asOf());var day=p.week[dow]||{label:'Rest',kind:'rest'};var S=getCurrentState();var why=[];if(S.recovery.status==='ok')why.push('recovery is '+S.recovery.level);if(S.training.strength.status==='ok')why.push('strength is '+S.training.strength.overall);if(S.phase)why.push('the '+phaseLabel(S.phase).toLowerCase()+' phase prioritizes '+(S.phase.type==='cut'?'lean-mass retention':'the stimulus'));return {day:day,template:day.template?p.templates[day.template]:null,why:why,program:p,adjust:(S.recovery.status==='ok'&&S.recovery.level==='poor')?'recovery is poor: keep the session, cut volume by a third':null};}

/* ============================================================================
   \u00a719: EXPERIMENTS \u2014 PLAN SEPARATE FROM RESULTS, NEVER REWRITTEN AFTER RESULTS
   hypothesis \u2192 estimand \u2192 design \u2192 baseline \u2192 intervention \u2192 washout/control \u2192 outcome \u2192 analysis \u2192 finding.
   An experiment record held its plan and its results in the same object, and nothing would have noticed if
   the hypothesis or prediction were changed after the outcome was known \u2014 which is how a question gets quietly
   reshaped to fit its answer. The plan is fingerprinted at creation; plan and results are read as separate
   views; a revision before results is appended to a history; after results, the original is left untouched and
   the change becomes a new, linked experiment.
   ============================================================================ */
var EXPERIMENT_PLAN_FIELDS=['question','hypothesis','variable','baselineValue','interventionValue','intervention',
  'prediction','predLo','predHi','metric','startDate','durationDays','successCriteria'];
var EXPERIMENT_RESULT_FIELDS=['outcome','conclusion','confidence','confounders','completedAt','status'];
function experimentPlan(ex){var p={};EXPERIMENT_PLAN_FIELDS.forEach(function(k){p[k]=ex[k]===undefined?null:ex[k];});return p;}
function experimentResults(ex){var r={};EXPERIMENT_RESULT_FIELDS.forEach(function(k){r[k]=ex[k]===undefined?null:ex[k];});return r;}
function experimentPlanHash(ex){return sha256(canonicalJSON(experimentPlan(ex)));}
function experimentIntegrity(ex){
  var hasResults=ex.outcome!=null;
  if(!ex.planHash)return {status:'unfingerprinted',hasResults:hasResults,
    note:'created before plans were fingerprinted, so a change to it cannot be detected'};
  var now=experimentPlanHash(ex);
  return {status:now===ex.planHash?'intact':'altered',hasResults:hasResults,planVersion:ex.planVersion||1,
    note:now===ex.planHash?'the plan is exactly as registered':
      (hasResults?'the plan has changed since it was registered and results exist \u2014 the finding cannot be trusted':'the plan differs from its fingerprint')};
}
function reviseExperiment(id,changes,why){
  var ex=(DB.experiments||[]).filter(function(x){return x.id===id;})[0];
  if(!ex)return {status:'unknown',id:id};
  var bad=Object.keys(changes||{}).filter(function(k){return EXPERIMENT_PLAN_FIELDS.indexOf(k)<0;});
  if(bad.length)return {status:'refused',note:'only plan fields can be revised: '+bad.join(', ')+' are not plan fields'};
  if(ex.outcome!=null){
    /* Results exist: the original definition is never rewritten. The revision becomes a new experiment. */
    var next=createExperiment(Object.assign(experimentPlan(ex),changes,{silent:true,
      question:(changes&&changes.question)||ex.question}));
    next.revisionOf=ex.id;
    return {status:'new-experiment',id:next.id,revisionOf:ex.id,
      note:'This experiment already has results, so its definition stays as registered. The revision is a new experiment that links back to it.'};
  }
  var previous={};Object.keys(changes).forEach(function(k){previous[k]=ex[k];});
  var version=(ex.planVersion||1)+1;
  var trial=Object.assign({},ex,changes);
  /* Apply live AND emit. emitEvent only logs for replay here — the first version emitted and never applied, so
     it reported "revised" while the experiment, and its history, were unchanged. */
  var at=nowISO(),hash=experimentPlanHash(trial);
  ex.revisions=(ex.revisions||[]).concat([{version:version,at:at,previous:previous,changes:changes,why:why||''}]);
  Object.keys(changes).forEach(function(k){ex[k]=changes[k];});
  if(changes.durationDays!=null||changes.startDate!=null)ex.recheckDate=addDays(ex.startDate,num(ex.durationDays)||14);
  ex.planVersion=version;ex.planHash=hash;
  emitEvent('experiment.revised',{id:id,version:version,previous:previous,changes:changes,why:why||'',planHash:hash},{at:at});
  save('experiment:revise');
  return {status:'revised',id:id,version:version};
}
function experimentStructure(ex){
  var P=experimentPlan(ex),R=experimentResults(ex);
  var st=function(label,value,missingNote){return {stage:label,value:value==null||value===''?null:value,
    defined:!(value==null||value===''),note:(value==null||value==='')?missingNote:null};};
  return {id:ex.id,planVersion:ex.planVersion||1,integrity:experimentIntegrity(ex),
    stages:[
      st('hypothesis',P.hypothesis||P.question,'no hypothesis written down'),
      st('estimand',P.metric?('change in '+P.metric):null,'no outcome measure named'),
      st('design','before/after within one person over '+(P.durationDays||'?')+' days',null),
      st('baseline',P.baselineValue,'no baseline value recorded'),
      st('intervention',P.intervention||(P.variable+' '+P.baselineValue+' \u2192 '+P.interventionValue),null),
      st('washout/control',null,'no washout or control period \u2014 a before/after comparison cannot separate the intervention from anything else that changed'),
      st('outcome',R.outcome,'not yet measured'),
      st('analysis',R.conclusion,'not yet analysed'),
      st('finding',R.conclusion?(R.conclusion+(R.confidence?' ('+R.confidence+' confidence)':'')):null,'no finding until the analysis is done')
    ],
    plan:P,results:R};
}
