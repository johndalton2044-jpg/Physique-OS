/* ============================================================================
   THE LEARNING LOOP (audit phase 12): observe \u2192 understand \u2192 decide \u2192 act \u2192 measure \u2192 explain \u2192 learn \u2192 adapt \u2192
   predict \u2192 test \u2192 personalize, run as one recorded cycle a week. Each stage reports its status and its figure; the
   cycle records what the app's beliefs about this person are, and what changed since the last cycle ("what I learned
   about you"); loop health says whether the loop is closing (changes judged, days to a verdict, how personal the models
   are, forecast calibration, starved stages); the test stage proposes the next experiment where the personal model is
   least certain. Recorded through the event log (cycle.recorded), so it replays and syncs.
   ============================================================================ */
function _isoWeek(d){var t=new Date(d+'T12:00:00Z'),day=(t.getUTCDay()+6)%7;t.setUTCDate(t.getUTCDate()-day+3);var y=t.getUTCFullYear(),f=new Date(Date.UTC(y,0,4));return y+'-W'+String(1+Math.round(((t-f)/86400000-3+((f.getUTCDay()+6)%7))/7)).padStart(2,'0');}
var LOOP_TEST_TEMPLATE={calories:'calorie-step',steps:'step-intervention',protein:'protein','training days':'training-volume',cardio:'cardio',sleep:'sleep'};
function _safe(f,d){try{return f();}catch(e){return d;}}
function loopBeliefs(){
  var M=_safe(function(){return personalResponseModel();},{rows:[]}),F=_safe(function(){return frictionModel();},{items:[]}),Wc=_safe(function(){return evaluateCompetition('weight');},{status:'none'}),P=_safe(function(){return physiqueModel();},{regions:[]}),A=_safe(function(){return adherenceState(14);},{});
  var resp={};M.rows.filter(function(r){return r.n>0;}).forEach(function(r){resp[r.key]={mean:r.posterior.mean,sd:r.posterior.sd,personal:r.personalWeight,n:r.n,label:r.label,unit:r.unit};});
  var fr=[];F.items.forEach(function(i){(i.factors||[]).filter(function(x){return x.clear;}).forEach(function(x){fr.push(i.item+': '+x.label);});});
  return {responses:resp,friction:fr,forecast:Wc.status==='ok'?{primary:Wc.primary,coverage:(function(){var r=Wc.rows.filter(function(x){return x.candidate===Wc.primary;})[0],m=r&&r.metrics[Wc.horizons[Wc.horizons.length-1]];return m?m.calibratedCoverage:null;})()}:null,
    lagging:P.regions.filter(function(r){return r.status==='lagging';}).map(function(r){return r.label;}),adherence:A&&A.overall!=null?Math.round(A.overall):null};}
function _loopDeltas(prev,now){var out=[];if(!prev)return ['the first cycle: a baseline for what follows'];
  Object.keys(now.responses).forEach(function(k){var a=prev.responses[k],b=now.responses[k];
    if(!a)out.push('a first estimate of your '+k.replace('\u2192',' \u2192 ')+' response: '+b.mean+' '+b.unit+' '+b.label+' ('+Math.round(b.personal*100)+'% your own data)');
    else if(Math.abs(b.mean-a.mean)>Math.max(0.5*b.sd,1e-6)||b.personal-a.personal>0.1)out.push('your '+k.replace('\u2192',' \u2192 ')+' response moved from '+a.mean+' to '+b.mean+' '+b.unit+' '+b.label+'; now '+Math.round(b.personal*100)+'% your own data');});
  now.friction.filter(function(x){return prev.friction.indexOf(x)<0;}).forEach(function(x){out.push('something now clearly gets in the way \u2014 '+x);});
  if(now.forecast&&prev.forecast&&now.forecast.primary!==prev.forecast.primary)out.push('the weight forecast now trusts '+COMPETITION_CANDIDATES[now.forecast.primary].label.split(' (')[0].toLowerCase()+' (it outscored the previous one)');
  now.lagging.filter(function(x){return prev.lagging.indexOf(x)<0;}).forEach(function(x){out.push(x+' is now lagging');});
  prev.lagging.filter(function(x){return now.lagging.indexOf(x)<0;}).forEach(function(x){out.push(x+' is no longer lagging');});
  if(now.adherence!=null&&prev.adherence!=null&&Math.abs(now.adherence-prev.adherence)>=10)out.push('plan followed '+now.adherence+'% of the time (was '+prev.adherence+'%)');
  return out.length?out:['nothing changed enough to report: the estimates held'];}
/* TEST: the next experiment, where the personal model is least certain and the change matters for the goal */
/* EXPERIMENT PORTFOLIO (Stage E; TRANSITION item 8). Every lever's ready-made test, on one scale: the information it is
   expected to give. A lever's effect per unit is believed to be normal with SD s0 (the personal response model's
   posterior, already discounted for age, widened by half of the largest disagreement between its findings); a test
   gives a result with standard error se per unit; the expected information gain is 1/2 ln(1 + s0^2/se^2) nats
   (Lindley 1956; for a normal model it does not depend on the result), and the estimate's SD would fall to
   1/sqrt(1/s0^2 + 1/se^2). se is the outcome's noise over a Response's two 21-day windows, divided by the dose expected
   to be carried out (the template's change times the probability it is done, interventionAdherence); where this person
   has final responses on that outcome measured over most of both windows (14 readings a side), their median standard
   error replaces the formula, because it carries their real day-to-day carry-over (a response with a few readings on one
   side measures the gap in the record, not the person). Ranked by gain per week of testing, because tests run one at a time. A test that would narrow
   the estimate by less than 10% is not worth running. */
var PORTFOLIO_MIN_GAIN=-Math.log(0.9);
function _testNoise(outcome){
  var past=(DB.responses||[]).filter(function(r){var n=r.primary&&r.primary.n;return r.outcome===outcome&&r.stage==='final'&&r.primary.se>0&&n&&n[0]>=14&&n[1]>=14;}).map(function(r){return r.primary.se;});
  if(past.length)return {se:median(past),basis:'the median standard error of your '+past.length+' earlier response'+(past.length===1?'':'s')+' on '+outcome};
  if(outcome==='weight'){var w=personalBaselines().streams.weight,s=w&&w.status==='ok'?w.baseline:0.45;
    return {se:s*7*Math.SQRT2/Math.sqrt(770),basis:'your day-to-day weight swing ('+round(s,2)+' lb) over two 21-day trends'};}
  var v=seriesWindow(outcome,56).map(function(d){return d.value;}),s2=v.length>=7?sd(v):null;
  return s2?{se:s2*Math.sqrt(2/21),basis:'the day-to-day spread of '+outcome+' ('+round(s2,2)+') over two 21-day averages'}:null;}
function experimentPortfolio(){
  var M=personalResponseModel(),PR=RESPONSE_PRIORS(),T={},running={},C=[];try{C=knowledgeConflicts();}catch(e){_q(e,'P2');}
  EXPERIMENT_TEMPLATES.forEach(function(t){T[t.id]=t;});
  (DB.experiments||[]).forEach(function(e){if(e.status==='running'||e.status==='active')running[e.variable]=1;});
  var base=personalBaselines().streams;
  var rows=M.rows.map(function(r){var tid=LOOP_TEST_TEMPLATE[r.variable],t=T[tid];if(!t||!t.delta)return null;
    var noise=_testNoise(r.outcome);
    if(!noise)return {variable:r.variable,outcome:r.outcome,key:r.key,template:tid,status:'insufficient',need:['readings of '+r.outcome+' to know its noise']};
    var sc=(PR[r.key]||{}).scale||1,cur=base[r.variable]&&base[r.variable].status==='ok'?base[r.variable].baseline:null,p=interventionAdherence(r.variable,t.delta,cur).p;
    var doseUnits=Math.abs(t.delta)*p/sc,seU=noise.se/doseUnits;
    var dis=C.filter(function(c){return c.subject===r.key&&c.difference!=null;}).map(function(c){return Math.abs(c.difference);}),half=dis.length?Math.max.apply(null,dis)/2:0;
    var s0=Math.sqrt(r.posterior.sd*r.posterior.sd+half*half),eig=0.5*Math.log(1+s0*s0/(seU*seU)),s1=1/Math.sqrt(1/(s0*s0)+1/(seU*seU)),days=21+(t.washoutDays||0);
    var busy=!!(running[r.variable]||running[t.variable]);
    return {variable:r.variable,outcome:r.outcome,key:r.key,template:tid,todo:t.todo,delta:t.delta,pDone:p,label:r.label,unit:r.unit,
      sdNow:round(s0,3),testSe:round(seU,3),sdAfter:round(s1,3),narrowing:round(1-s1/s0,2),eig:round(eig,3),bits:round(eig/Math.LN2,2),days:days,perWeek:round(eig/(days/7),3),
      conflicted:half>0,noiseBasis:noise.basis,status:busy?'running':(eig<PORTFOLIO_MIN_GAIN?'not worth it':'ok')};}).filter(Boolean);
  var order={ok:0,'not worth it':1,running:2,insufficient:3};
  rows.sort(function(a,b){return (order[a.status]-order[b.status])||((b.perWeek||0)-(a.perWeek||0));});
  return {status:'ok',cls:'DERIVED',rows:rows,
    method:'expected information gain of each lever\u2019s ready-made test, 1/2 ln(1 + s0\u00b2/se\u00b2), per week of testing; s0 from the personal response model, se from the outcome\u2019s noise and the dose likely to be carried out',
    limits:'Assumes the effect is the same in the test as in earlier responses, and that one test runs at a time. Information about different outcomes is counted alike; what matters more to you is your call.'};}
function nextTest(){var P=_safe(function(){return experimentPortfolio();},{rows:[]}),c=(P.rows||[]).filter(function(r){return r.status==='ok';})[0];
  if(!c)return {status:'none',portfolio:(P.rows||[]).slice(0,4),note:(P.rows||[]).some(function(r){return r.status==='not worth it';})?'no test would narrow what is known by 10% or more; an experiment is running on, or nothing is left to learn from, the rest':'an experiment is already running on each lever, or nothing is uncertain enough to test'};
  var u=c.unit?' '+c.unit:'';
  return {status:'ok',variable:c.variable,outcome:c.outcome,template:c.template,eig:c.eig,bits:c.bits,portfolio:P.rows.slice(0,4),
    why:'a '+Math.round(c.days/7)+'-week test ('+c.todo+') would narrow your '+c.variable+' \u2192 '+c.outcome+' estimate from \u00b1'+round(2*c.sdNow,2)+' to \u00b1'+round(2*c.sdAfter,2)+u+' '+c.label+
      ': the most expected learning per week of any lever'+(c.conflicted?' (its findings disagree)':'')};}
function loopStages(){var st=[],push=function(id,label,f){var r=_safe(f,{status:'attention',figure:'\u2014',detail:'could not be read'});st.push(Object.assign({id:id,label:label},r));};
  push('observe','Observe',function(){var m=missingness(14),w=m.weight.pct,c=m.calories.pct;return {status:w>=70&&c>=50?'ok':(w<30?'starved':'attention'),figure:'weigh-ins '+w+'%, food '+c+'%',detail:'the last 14 days'};});
  push('understand','Understand',function(){var t=personalStateModel();return {status:t.fidelity>=60?'ok':'attention',figure:'twin fidelity '+t.fidelity+'%',detail:'how much of the state model has data'};});
  push('decide','Decide',function(){var d=decide();return {status:'ok',figure:(d.verb||d.code||'').toString().slice(0,40),detail:'confidence '+(d.confidence||'')};});
  push('act','Act',function(){var a=adherenceState(14);return {status:a.overall==null?'attention':(a.overall>=70?'ok':'attention'),figure:a.overall!=null?'plan followed '+Math.round(a.overall)+'%':'not enough logged',detail:'the last 14 days'};});
  push('measure','Measure',function(){var R=responsesOf();return {status:R.length?'ok':'attention',figure:R.length+' change'+(R.length===1?'':'s')+' evaluated, '+R.filter(function(r){return r.stage==='final';}).length+' final',detail:'Response records'};});
  push('explain','Explain',function(){var R=responsesOf().filter(function(r){return r.stage==='final';}),clear=R.filter(function(r){return /^a clear response/.test(r.verdict||'');}).length;   /* "no clear response" is not clear */return {status:R.length?'ok':'attention',figure:clear+' of '+R.length+' final verdicts clear',detail:'each with its evidence, expectation and side effects'};});
  push('learn','Learn',function(){var M=personalResponseModel(),rows=M.rows.filter(function(r){return r.n>0;}),pi=rows.length?mean(rows.map(function(r){return r.personalWeight;})):0;return {status:rows.length?'ok':'attention',figure:Math.round(pi*100)+'% personal',detail:rows.length+' response estimate'+(rows.length===1?'':'s')+' updated from your own record'};});
  push('adapt','Adapt',function(){var P=plansOf().filter(function(p){return daysBetween(p.effectiveFrom,todayISO())<=28;});return {status:'ok',figure:P.length+' plan change'+(P.length===1?'':'s')+' in 4 weeks',detail:'each evaluated as a Response'};});
  push('predict','Predict',function(){var W=evaluateCompetition('weight');if(W.status!=='ok')return {status:'attention',figure:'not scored yet',detail:'needs 20 weigh-ins'};var r=W.rows.filter(function(x){return x.candidate===W.primary;})[0],m=r&&r.metrics[W.horizons[W.horizons.length-1]];
    return {status:W.warning?'attention':'ok',figure:COMPETITION_CANDIDATES[W.primary].label.split(' (')[0]+(m?' \u00b1'+m.mae+' lb':''),detail:W.warning||'calibrated intervals'};});
  push('test','Test',function(){var run=(DB.experiments||[]).filter(function(e){return e.status==='running'||e.status==='active';}).length,n=nextTest();return {status:run||n.status==='ok'?'ok':'attention',figure:run+' running',detail:n.status==='ok'?'next: '+n.variable:n.note};});
  push('personalize','Personalize',function(){var O=unifiedOptimiser(),R=O.recommended;if(!R)return {status:'attention',figure:'no options yet',detail:''};var own=R.bases.filter(function(b){return /your \d+ earlier response/.test(b);}).length;return {status:own?'ok':'attention',figure:own+' of '+R.bases.length+' effects personal',detail:'in the suggested option'};});
  return st;}
function loopHealth(){var IV=_safe(function(){return responseInterventions();},[]),R=responsesOf(),fin=R.filter(function(r){return r.stage==='final';});
  var days=fin.map(function(r){return daysBetween(r.start,String(r.evaluatedAt).slice(0,10));}).sort(function(a,b){return a-b;});
  return {judged:IV.length?round(fin.length/IV.length,2):null,interventions:IV.length,medianDaysToVerdict:days.length?days[Math.floor(days.length/2)]:null,openExperiments:(DB.experiments||[]).filter(function(e){return e.status==='running'||e.status==='active';}).length};}
function runLearningCycle(opts){opts=opts||{};DB.cycles=DB.cycles||[];var wk=_isoWeek(todayISO()),have=DB.cycles.filter(function(c){return c.week===wk;})[0];if(have&&!opts.force)return have;
  var prev=DB.cycles.filter(function(c){return c.week<wk;}).slice(-1)[0],beliefs=loopBeliefs(),stages=loopStages();
  var rec={id:'cycle:'+wk,week:wk,at:nowISO(),stages:stages.map(function(s){return {id:s.id,status:s.status,figure:s.figure};}),beliefs:beliefs,learned:_loopDeltas(prev&&prev.beliefs,beliefs),health:loopHealth(),next:nextTest(),
    starved:stages.filter(function(s){return s.status==='starved';}).map(function(s){return s.id;})};
  if(opts.dryRun)return rec;
  DB.cycles=DB.cycles.filter(function(c){return c.id!==rec.id;});DB.cycles.push(rec);emitEvent('cycle.recorded',rec,{at:rec.at});save('cycles');return rec;}
(function(){if(typeof MODELS==='undefined'||_registryTaken(MODELS,'MODELS','learning_loop'))return;
  MODELS.push({id:'learning_loop',name:'Learning loop',cls:'DERIVED',version:'1.0',inputs:['weight','calories'],minN:1,assumes:['a week is long enough to see a change in beliefs'],failsWhen:['stages starved of data'],
    output:'a weekly cycle: each stage\u2019s status, what changed in what the app knows about you, loop health and the next test, chosen by expected information gain across levers',consumers:['loopCard'],freshnessDays:7,uncertainty:{kind:'carried from each stage'},fn:'learningCycleView'});})();
/* the model's own output: the cycle computed from the record, without its timestamp or a write, so it reproduces */
function learningCycleView(){var r=runLearningCycle({dryRun:true,force:true});delete r.at;return r;}
