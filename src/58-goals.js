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
    benefit:'muscle growth',source:'Schoenfeld, Ogborn & Krieger 2017 (dose-response meta-analysis); Pelland et al. 2024 (diminishing returns)',negNote:'past about 25 a week, recovery may limit what extra sets add'},
  protein:{label:'Protein',unit:'g/kg a day',step:0.1,plateau:1.6,plateauHi:2.2,
    benefit:'muscle retained and gained',source:'Morton et al. 2018 (meta-regression: breakpoint 1.62 g/kg/day, 95% CI up to 2.2)'},
  steps:{label:'Steps',unit:'steps a day',step:1000,k:5000,
    benefit:'health (energy expenditure itself rises in proportion)',source:'Paluch et al. 2022 (steps and mortality: benefit levels off around 6,000\u201310,000 a day)'},
  cardio:{label:'Cardio',unit:'minutes a week',step:30,k:150,negBeyond:180,
    benefit:'aerobic fitness',source:'WHO 2020 activity guidelines (150\u2013300 min); Wilson et al. 2012 (concurrent training interference)',negNote:'past about 180 minutes, interference with strength and size gains grows'},
  sleep:{label:'Sleep',unit:'hours a night',step:0.5,k:2.2,start:5,
    benefit:'recovery and appetite regulation',source:'Watson et al. 2015 (AASM/SRS consensus: 7 hours or more)'},
  deficit:{label:'Rate of loss',unit:'% of body weight a week',step:0.25,negBeyond:1,linear:1.5,
    benefit:'fat lost each week',source:'Garthe et al. 2011; Helms et al. 2014 (faster loss risks more lean mass)',negNote:'past about 1% a week, more of the loss is lean mass'}};
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
    timeMinutes:{sets:3,steps:10,cardio:30,sleep:30}[lever]||0,source:c.source,
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
      warning:null,fatigue:'one more session to recover from',timeMinutes:0,source:'Schoenfeld et al. 2019; Grgic et al. 2018',basis:FR.reading+' '+FR.limits,personal:FR.personalWeight>=0.2});}catch(e){}
  return {status:out.length?'ok':'insufficient',cls:'HEURISTIC',rows:out,doses:D,method:'one dose-response curve per lever from cited evidence; the next unit\u2019s change in benefit at the current dose'};}

/* ---- GOAL CONFLICTS (§32): tensions detected from the person's state, with the trade-off and a choice ---- */
var GOAL_TENSIONS=[
  {id:'deficit-vs-muscle',goals:['fat loss','hypertrophy'],test:function(s){return s.phase==='cut'&&s.priorityRegions>0;},
    evidence:function(s){return s.priorityRegions+' muscle'+(s.priorityRegions===1?'':'s')+' set as a priority during a cut';},
    tradeoff:'Muscle builds slowly in a deficit. A smaller deficit (about 0.5% a week) protects it; a larger one loses fat sooner.',options:[['protect-muscle','Protect muscle'],['lose-faster','Lose fat faster']]},
  {id:'cardio-vs-strength',goals:['endurance','strength'],test:function(s){return s.cardio>150&&(s.strengthPriority||s.priorityRegions>0);},
    evidence:function(s){return s.cardio+' cardio minutes a week while strength or size is a priority';},
    tradeoff:'Past about 150\u2013180 minutes a week, cardio starts to blunt strength and size gains. Less cardio keeps lifting gains; more builds endurance.',options:[['favour-strength','Favour strength'],['favour-endurance','Favour endurance']]},
  {id:'time-vs-volume',goals:['time','training volume'],test:function(s){return s.needMinutes!=null&&s.haveMinutes!=null&&s.needMinutes>s.haveMinutes*1.1;},
    evidence:function(s){return 'the plan needs about '+s.needMinutes+' minutes a week; the schedule gives about '+s.haveMinutes;},
    tradeoff:'The plan asks for more time than the schedule gives. Fewer sets fit the week; keeping the volume means longer sessions or another day.',options:[['fit-the-week','Fit the week'],['keep-volume','Keep the volume']]},
  {id:'rate-vs-recovery',goals:['fat loss','recovery'],test:function(s){return s.deficit!=null&&s.deficit>0.75&&s.fatigue!=null&&s.fatigue>=6;},
    evidence:function(s){return 'losing '+s.deficit+'% a week with fatigue averaging '+s.fatigue;},
    tradeoff:'A fast loss is wearing on recovery. Slowing the loss eases it; keeping the pace finishes sooner.',options:[['ease-recovery','Ease recovery'],['keep-pace','Keep the pace']]},
  {id:'volume-vs-fatigue',goals:['training volume','recovery'],test:function(s){return s.setsPerWeek>60&&s.fatigue!=null&&s.fatigue>=7;},
    evidence:function(s){return s.setsPerWeek+' sets a week with fatigue averaging '+s.fatigue;},
    tradeoff:'High volume with high fatigue may be adding fatigue faster than growth. A lighter week recovers; keeping volume keeps the stimulus.',options:[['recover','Recover first'],['keep-stimulus','Keep the stimulus']]}];
function _goalState(){var s={},ph=null;try{ph=activePhase();}catch(e){}s.phase=ph?ph.type:null;
  try{s.priorityRegions=physiqueModel().regions.filter(function(r){return r.priority;}).length;}catch(e){s.priorityRegions=0;}
  var g=null;try{g=canonicalGoal();}catch(e){}s.strengthPriority=!!(g&&/strength/.test(String(g.type)));
  try{var C=capabilityVector();s.cardio=C.endurance.cardioMinutesPerWeek;s.setsPerWeek=C.workCapacity.setsPerWeek;}catch(e){}
  try{var M=scheduleModel(),days=(DB.settings.trainingDays||[]).length||(ph&&ph.trainingSessions)||4;s.haveMinutes=days*((M.minutes&&M.minutes.full)||60);
    s.needMinutes=s.setsPerWeek!=null?Math.round(s.setsPerWeek*3+(s.cardio||0)):null;}catch(e){}
  try{var R=physiqueRate();s.deficit=R.status==='ok'&&R.pctPerWeek<0?round(-R.pctPerWeek,2):null;}catch(e){}
  try{var F=seriesWindow('fatigue',7).map(function(x){return x.value;});s.fatigue=F.length?round(mean(F),1):null;}catch(e){}
  return s;}
function goalConflicts(){var s=_goalState(),P=DB.settings.goalPriorities||{};
  var rows=GOAL_TENSIONS.filter(function(t){try{return t.test(s);}catch(e){return false;}}).map(function(t){return {id:t.id,goals:t.goals,evidence:t.evidence(s),tradeoff:t.tradeoff,options:t.options,chosen:P[t.id]||null};});
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
