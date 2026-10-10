/* ============================================================================
   UNIFIED INTERVENTION OPTIMISER (audit §81, phase 11): state \u2192 candidate interventions \u2192 expected effect \u2192
   uncertainty \u2192 burden \u2192 adherence probability \u2192 risk \u2192 opportunity cost \u2192 reversibility \u2192 robustness \u2192 Pareto
   set \u2192 the person's choice. One search across nutrition, activity, training, recovery and schedule, instead of each
   domain's rules on their own. Effects come from the personal response model (phase 6); the probability a change is
   carried out from the friction model (phase 7); a choice is applied as a phase change, which the Response entity
   then evaluates. Assumptions stated: effects of separate changes add; carrying them out is independent.
   ============================================================================ */
var OPT_LEVERS={
  calories:{label:'calories',doses:[0,-100,-200,-300],unit:'kcal a day',field:'calorieTarget',minutesPer:0,hungerPer100:0.15},
  steps:{label:'steps',doses:[0,1000,2000,3000],unit:'steps a day',field:'stepTarget',minutesPer:70/1000},
  cardio:{label:'cardio',doses:[0,1,2],unit:'30-minute sessions a week',field:'cardioSessions',minutesPer:30,training:true},
  training:{label:'training days',doses:[-1,0,1],unit:'sessions a week',field:'trainingSessions',minutesPer:60,training:true},
  sleep:{label:'sleep',doses:[0,0.5],unit:'hours a night',minutesPer:0},
  protein:{label:'protein',doses:[0,20],unit:'g a day',field:'proteinTarget',minutesPer:0,costPerUnit:0.025}
};
function _leverText(k,d){var n=function(x){return Math.abs(x).toLocaleString();};return {calories:(d<0?'eat '+n(d)+' kcal less a day':'eat '+n(d)+' kcal more a day'),steps:(d>0?'+':'\u2212')+n(d)+' steps a day',cardio:(d>0?'+':'\u2212')+n(d)+' cardio session'+(Math.abs(d)===1?'':'s')+' a week',
  training:(d>0?'one more':'one fewer')+' training session a week',sleep:'+'+Math.round(d*60)+' min sleep a night',protein:'+'+n(d)+' g protein a day'}[k];}
function _goalDirection(ph){var t=ph?ph.type:'maintenance';return t==='cut'?-1:(t==='bulk'?1:0);}
/* each lever's expected weekly effect on the weight trend, with its sd, from the personal model where it has one */
function _leverEffect(k,dose,kg){if(!dose)return {mean:0,sd:0,basis:'no change'};
  if(k==='calories'||k==='steps'){var p=predictResponse(k,'weight',dose);if(p){var out={mean:p.mean,sd:Math.abs(p.hi-p.lo)/4,basis:p.basis};
    /* A deeper cut costs some everyday movement (the NEAT response), which gives back part of the deficit. The person's
       own calorie responses are measured on the scale and already contain it, so only the share still resting on the
       population figure is adjusted. */
    var n=(typeof neatOffset==='function')?neatOffset(k==='calories'?Math.max(0,-dose):0):null;
    if(n&&dose<0){var share=1-(p.personalWeight||0),kl=tissueKcalPerLb(),back=-n.kcal*7/kl*share;
      out.mean=round(out.mean+back,3);out.sd=round(Math.sqrt(out.sd*out.sd+Math.pow(n.sdKcal*7/kl*share,2)),3);
      out.basis+='; less the everyday movement a deeper deficit is expected to cost, about '+Math.abs(n.steps).toLocaleString()+' steps a day ('+n.basis+')';}
    if(k==='steps'){var pull=null;try{var eb=energyBalance();pull=eb.status==='ok'&&eb.neat?eb.neat:null;}catch(e){}
      if(pull&&pull.steps<0)out.basis+='; your current deficit is expected to pull everyday steps down by about '+Math.abs(pull.steps).toLocaleString()+' a day, which a step target holds against';}
    return out;}}
  if(k==='cardio'){var kcal=6*(kg||85)*0.5*dose,m=-kcal/tissueKcalPerLb(),pp=typeof predictResponse==='function'?predictResponse('cardio','weight',dose):null;return pp&&pp.n?{mean:pp.mean,sd:Math.abs(pp.hi-pp.lo)/4,basis:pp.basis}:{mean:m,sd:Math.abs(m)*0.4,basis:'about 6 METs for 30 minutes per session'};}
  if(k==='training'){var e=-(4*(kg||85)*1*dose)/tissueKcalPerLb();return {mean:e,sd:Math.abs(e)*0.6,basis:'about 4 METs for an hour per session; mainly for strength, not weight'};}
  return {mean:0,sd:0,basis:k==='sleep'?'sleep helps hunger, recovery and muscle retention more than the scale':'protein protects muscle and fullness; little direct effect on weight'};}
function unifiedOptimiser(opts){opts=opts||{};if(typeof memo==='function'&&!opts.minutesBudget)return memo('uopt:'+(DB.settings.optimiserPreference||'balanced')+':'+todayISO(),function(){return _unifiedOptimiser(opts);});return _unifiedOptimiser(opts);}
function _unifiedOptimiser(opts){opts=opts||{};
  var ph=typeof activePhase==='function'?activePhase():null,dir=_goalDirection(ph),kg=typeof _kgNow==='function'?_kgNow():null,M=typeof scheduleModel==='function'?scheduleModel():{minutes:{full:60}};
  var R=typeof physiqueRate==='function'?physiqueRate():{status:'insufficient'},nowRate=R.status==='ok'?R.pctPerWeek:null,band=R.status==='ok'?R.range:(dir<0?[-1,-0.5]:(dir>0?[0.1,0.25]:[-0.1,0.1])),w=R.status==='ok'?seriesWindow('weight',7).slice(-1)[0]:null;
  var fat=(function(){var v=seriesWindow('fatigue',7).map(function(x){return x.value;});return v.length?mean(v):null;})();
  var lagging=false;try{lagging=physiqueModel().regions.some(function(r){return r.priority&&r.status==='lagging';});}catch(e){}
  var timeBudget=(opts.minutesBudget!=null?opts.minutesBudget:(M.minutes&&M.minutes.full||60)*2);   /* extra minutes a week a person can usually find: two sessions' worth */
  var cur={calories:ph&&ph.calorieTarget,steps:ph&&ph.stepTarget||(seriesWindow('steps',7).length?mean(seriesWindow('steps',7).map(function(x){return x.value;})):8000),cardio:ph&&ph.cardioSessions||0,training:ph&&ph.trainingSessions||4,protein:ph&&ph.proteinTarget};
  /* the search: every combination of up to three changes */
  var keys=Object.keys(OPT_LEVERS),cands=[];(function rec(i,pick,n){if(i===keys.length){cands.push(JSON.parse(JSON.stringify(pick)));return;}var L=OPT_LEVERS[keys[i]];
    L.doses.forEach(function(d){if(d!==0&&n>=3)return;pick[keys[i]]=d;rec(i+1,pick,n+(d!==0?1:0));});})(0,{},0);
  /* each lever and dose once (about 20), then combined: per-candidate recomputation took 16 s */
  var E={},A={};keys.forEach(function(k){E[k]={};A[k]={};OPT_LEVERS[k].doses.forEach(function(d){if(!d)return;E[k][d]=_leverEffect(k,d,kg);
    A[k][d]=typeof interventionAdherence==='function'?interventionAdherence(k==='training'?'training days':k,d,cur[k]||null):{p:0.7};});});
  var rows=cands.filter(function(c){return keys.some(function(k){return c[k];});}).map(function(c){
    var eff=0,v=0,effective=0,pAll=1,burden=0,minutes=0,money=0,parts=[],risk=[],bases=[],levers=[];
    keys.forEach(function(k){var d=c[k];if(!d)return;var L=OPT_LEVERS[k],e=E[k][d],ad=A[k][d];
      eff+=e.mean;v+=e.sd*e.sd;effective+=e.mean*ad.p;pAll*=ad.p;bases.push(L.label+': '+e.basis);levers.push({lever:k,dose:d,mean:e.mean,sd:e.sd,p:ad.p});
      var mins=Math.abs(L.minutesPer*d)*(k==='steps'?1:1);if(k==='steps')mins=L.minutesPer*d*7;minutes+=Math.max(0,d>0||k==='calories'?mins:0);
      burden+=(k==='calories'?L.hungerPer100*Math.abs(d)/100:0)+(mins/600)+(k==='sleep'?0.1:0)+(1-ad.p)*0.3;money+=(L.costPerUnit||0)*Math.max(0,d)*7;
      parts.push(_leverText(k,d));});
    var sd=Math.sqrt(v+Math.pow(0.1*eff,2)),proj=nowRate!=null&&w?nowRate+100*effective/w.value:null;
    if(proj!=null&&dir<0&&proj<band[0])risk.push('faster than the safe range ('+round(proj,2)+'% a week): more muscle at risk');
    if(proj!=null&&dir>0&&proj>band[1])risk.push('faster than the lean-gain range: more of it is fat');
    if(fat!=null&&fat>=6.5&&(c.cardio>0||c.training>0))risk.push('adds training while fatigue is high');
    if(lagging&&c.training<0)risk.push('drops a training day while a priority muscle is lagging');
    var toward=dir===0?-Math.abs(effective):dir*effective,robust=sd>0&&dir!==0?_normCdf(dir*eff/sd):(dir===0?1:0.5);
    return {changes:c,label:parts.join(', ').replace(/\s+/g,' '),effect:round(eff,3),effective:round(effective,3),sd:round(sd,3),pAll:round(pAll,2),toward:round(toward,3),
      burden:round(burden,2),minutes:Math.round(minutes),money:round(money,1),risk:risk,riskScore:risk.length,robustness:round(robust,2),reversible:'yes: every target can be changed back',projectedRate:proj!=null?round(proj,2):null,bases:bases,levers:levers,
      feasible:minutes<=timeBudget&&!(fat!=null&&fat>=7&&(c.cardio>0||c.training>0))};});
  var feasible=rows.filter(function(r){return r.feasible&&(dir===0||r.toward>0)&&!(r.projectedRate!=null&&((dir<0&&r.projectedRate<band[0]-0.25)||(dir>0&&r.projectedRate>band[1]+0.1)));});
  /* the Pareto set: nothing else is at least as good on every count and better on one */
  var dom=function(a,b){var ge=a.toward>=b.toward&&a.burden<=b.burden&&a.minutes<=b.minutes&&a.riskScore<=b.riskScore,gt=a.toward>b.toward||a.burden<b.burden||a.minutes<b.minutes||a.riskScore<b.riskScore;return ge&&gt;};
  var pareto=feasible.filter(function(r){return !feasible.some(function(s){return s!==r&&dom(s,r);});});
  /* each change beyond the first costs something of its own: stacked changes are harder to keep, and the Response record
     cannot tell which of them worked (a first version suggested three at once, with a 21% chance of doing all three) */
  var pref=DB.settings.optimiserPreference||'balanced',W={balanced:{t:1,b:0.6,m:0.004,r:0.5,c:0.5},effort:{t:0.6,b:1.2,m:0.004,r:0.5,c:0.8},time:{t:0.6,b:0.4,m:0.012,r:0.5,c:0.3},fastest:{t:1.6,b:0.3,m:0.002,r:0.8,c:0.1}}[pref]||{t:1,b:0.6,m:0.004,r:0.5,c:0.5};
  var nCh=function(r){return keys.filter(function(k){return r.changes[k];}).length;};
  var score=function(r){return W.t*r.toward*10-W.b*r.burden-W.m*r.minutes-W.r*r.riskScore-W.c*Math.max(0,nCh(r)-1);};
  pareto.sort(function(a,b){return score(b)-score(a);});
  return {status:'ok',cls:'PREDICTIVE',goal:dir<0?'lose fat':(dir>0?'gain lean mass':'hold steady'),phase:ph?ph.type:null,currentRate:nowRate,band:band,preference:pref,
    searched:rows.length,feasible:feasible.length,pareto:pareto.slice(0,8),recommended:pareto[0]||null,
    constraints:['about '+timeBudget+' extra minutes a week','the phase\u2019s safe rate range ('+band.join(' to ')+'% a week)','no added training when fatigue averages 7 or more'],
    method:'combinations of up to three changes; effects from your response model (population figures where it has none), weighted by the probability each is carried out; Pareto set over effect toward the goal, burden, time and risk; ranked by your preference',
    assumptions:['effects of separate changes add','carrying them out is independent','the next weeks resemble the last'],limits:'Two weeks is short for a body-composition effect: the Response record judges whether a choice worked.'};}
function _normCdf(z){var t=1/(1+0.2316419*Math.abs(z)),d=0.3989423*Math.exp(-z*z/2),p=d*t*(0.3193815+t*(-0.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));return z>0?1-p:p;}
/* the person's choice, applied as a phase change (the Response entity evaluates it later) */
/* POLICY SIMULATION (Stage F; TRANSITION item 9). Each option carried forward week by week. The forecast competition's
   winning model (competitionForecast: the lifecycle's primary, its 80% interval calibrated on its own backtest) gives the
   path if nothing changes; each change in the option adds its effect on the weekly rate from the personal response model
   (population figures where it has none), counted only if it is carried out. One lever with effect m \u00b1 s, done with
   probability p, adds a rate with mean p\u00b7m and variance p(s\u00b2 + m\u00b2) \u2212 (p\u00b7m)\u00b2 (a mixture of doing it and not);
   levers add and are carried out independently, as the optimiser assumes; the effect accumulates over the days it has
   acted, from three days after the change (the washout). The forecast's noise and the lever's are independent. Against
   changing nothing the forecast's noise is shared, so the difference carries the levers' uncertainty alone. */
var POLICY_WASHOUT_DAYS=3;
function _policyBaseline(weeks){var out=[];for(var w=1;w<=weeks;w++){var f=competitionForecast('weight',7*w);if(!f)return null;out.push({week:w,date:addDays(todayISO(),7*w),mean:f.mean,sd:(f.hi-f.lo)/(2*1.2816),lo:f.lo,hi:f.hi,model:f.model,label:f.label});}return out;}
function simulateOption(row,base){var mr=0,vr=0;(row.levers||[]).forEach(function(l){mr+=l.p*l.mean;vr+=l.p*(l.sd*l.sd+l.mean*l.mean)-Math.pow(l.p*l.mean,2);});
  var path=base.map(function(b){var t=Math.max(0,7*b.week-POLICY_WASHOUT_DAYS)/7,m=b.mean+mr*t,s=Math.sqrt(b.sd*b.sd+vr*t*t);
    return {week:b.week,date:b.date,mean:round(m,2),lo:round(m-1.2816*s,2),hi:round(m+1.2816*s,2),shift:round(mr*t,2),shiftSd:round(Math.sqrt(Math.max(0,vr))*t,3)};});
  var e=path[path.length-1];return {path:path,end:e,vsNothing:{mean:e.shift,lo:round(e.shift-1.2816*e.shiftSd,2),hi:round(e.shift+1.2816*e.shiftSd,2)}};}
function simulatePolicies(opts){opts=opts||{};var weeks=opts.weeks||8,O=unifiedOptimiser();
  if(O.status!=='ok'||!O.pareto.length)return {status:'insufficient',need:['options from the optimiser']};
  var base=_policyBaseline(weeks);if(!base)return {status:'insufficient',need:['20 weigh-ins, for the forecast competition']};
  return {status:'ok',cls:'PREDICTIVE',weeks:weeks,model:base[0].model,modelLabel:base[0].label,
    baseline:base.map(function(b){return {week:b.week,date:b.date,mean:b.mean,lo:b.lo,hi:b.hi};}),
    options:O.pareto.slice(0,opts.limit||5).map(function(r,i){var s=simulateOption(r,base);return Object.assign({index:i,label:r.label,changes:r.changes,pAll:r.pAll},s);}),
    method:'the forecast competition\u2019s winning model for the path with no change, plus each change\u2019s effect from your response model, counted only if carried out; 80% intervals',
    assumptions:['effects of separate changes add','carrying them out is independent','the change acts from three days after it starts and holds steady'],
    limits:'Weight, not composition; and the further ahead, the more a change in circumstances (illness, travel, a new phase) matters, which no forecast sees.'};}
function applyOptimiserChoice(row){var ph=activePhase();if(!ph||!row)return {status:'refused'};var patch={};
  Object.keys(row.changes).forEach(function(k){var d=row.changes[k],L=OPT_LEVERS[k];if(!d||!L.field)return;var base=ph[L.field]!=null?ph[L.field]:(k==='steps'?Math.round(mean(seriesWindow('steps',7).map(function(x){return x.value;}))||8000):(k==='training'?4:0));patch[L.field]=Math.max(0,base+d);});
  if(row.changes.sleep)applyProfileFields({sleepTargetH:(DB.profile.sleepTargetH||8)+row.changes.sleep});   /* through the profile's owner */
  var sim=null;try{var B=_policyBaseline(8);if(B)sim=simulateOption(row,B);}catch(e){_q(e,'P2');}
  if(Object.keys(patch).length)changePlan({kind:'optimiser choice',source:'optimiser',reason:'You chose: '+row.label,expected:(row.effective>0?'+':'')+row.effective+' lb a week (\u00b1'+round(2*row.sd,2)+'), allowing for a '+Math.round(row.pAll*100)+'% chance of carrying it all out'+
    (sim?'; in 8 weeks about '+fmtNum(sim.end.mean,1)+' lb ('+fmtNum(sim.end.lo,1)+' to '+fmtNum(sim.end.hi,1)+'), '+(sim.vsNothing.mean>0?'+':'')+sim.vsNothing.mean+' lb against changing nothing':''),
    apply:function(){return updatePhase(ph.id,patch,{label:'optimiser choice: '+row.label});}});_memoInvalidate();return {status:'ok',patch:patch};}
(function(){if(typeof MODELS==='undefined'||_registryTaken(MODELS,'MODELS','unified_optimiser'))return;
  MODELS.push({id:'unified_optimiser',name:'Unified intervention optimiser',cls:'PREDICTIVE',version:'1.0',inputs:['weight','steps','calories','fatigue'],minN:7,
    assumes:['effects of separate changes add','carrying them out is independent'],failsWhen:['changes that interact','a regime change in the coming weeks'],
    output:'the Pareto set of changes across nutrition, activity, training, recovery and schedule, ranked by preference; each simulated forward with an interval',consumers:['optimiserCard','simulatePolicies','applyOptimiserChoice'],freshnessDays:7,uncertainty:{kind:'combined standard deviation and robustness'},fn:'unifiedOptimiser'});})();
