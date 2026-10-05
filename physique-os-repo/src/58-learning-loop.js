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
function nextTest(){var M=_safe(function(){return personalResponseModel();},{rows:[]}),running={};(DB.experiments||[]).forEach(function(e){if(e.status==='running'||e.status==='active')running[e.variable]=1;});
  var c=M.rows.filter(function(r){return LOOP_TEST_TEMPLATE[r.variable]&&!running[r.variable]&&r.outcome==='weight'&&Math.abs(r.prior.mean)>0;})
    .map(function(r){return {r:r,u:(1-r.personalWeight)*Math.abs(r.prior.mean)};}).sort(function(a,b){return b.u-a.u;})[0];
  if(!c)return {status:'none',note:'an experiment is already running on each lever, or nothing is uncertain enough to test'};
  return {status:'ok',variable:c.r.variable,template:LOOP_TEST_TEMPLATE[c.r.variable],why:'your '+c.r.variable+' response is '+Math.round(c.r.personalWeight*100)+'% your own data; a test would tell how '+c.r.variable+' work for you rather than for people in general'};}
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
(function(){if(typeof MODELS==='undefined'||MODELS.some(function(m){return m.id==='learning_loop';}))return;
  MODELS.push({id:'learning_loop',name:'Learning loop',cls:'DERIVED',version:'1.0',inputs:['weight','calories'],minN:1,assumes:['a week is long enough to see a change in beliefs'],failsWhen:['stages starved of data'],
    output:'a weekly cycle: each stage\u2019s status, what changed in what the app knows about you, loop health and the next test',consumers:['loopCard'],freshnessDays:7,uncertainty:{kind:'carried from each stage'},fn:'learningCycleView'});})();
/* the model's own output: the cycle computed from the record, without its timestamp or a write, so it reproduces */
function learningCycleView(){var r=runLearningCycle({dryRun:true,force:true});delete r.at;return r;}
