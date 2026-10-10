/* ============================================================================
   FRICTION AND ADHERENCE (audit §80, phase 7): not only "did you do it?" but "why not?", and P(execution | intervention).
   Per plan item, a ridge-regularised logistic model over the last eight weeks of days: did the item happen, given the
   burdens the record can measure \u2014 plan burden (items planned that day), time burden (a long session), schedule conflict
   (a work shift), sleep conflict (short sleep the night before), motivation and fatigue (self-reports), social context
   (the weekend), weather for outdoor cardio and steps, cooking burden (no meal template), decision fatigue (decisions
   awaiting a response). Friction is reported as odds ratios with uncertainty, and feeds the lever choice in decide().
   Unknown outcomes are left out; a partial item counts as not done (it met friction).
   ============================================================================ */
var FRICTION_FACTORS={
  planLoad:{label:'a heavy plan day (6+ items)',kind:'plan burden'},longSession:{label:'a session of an hour or more',kind:'time burden'},
  workShift:{label:'a work shift',kind:'schedule conflict'},shortSleep:{label:'under 6 hours of sleep the night before',kind:'sleep conflict'},
  lowMotivation:{label:'low motivation (4 or less)',kind:'motivation'},highFatigue:{label:'high fatigue (7 or more)',kind:'fatigue'},
  weekend:{label:'the weekend',kind:'social context'},badWeather:{label:'rain or heat',kind:'weather'},
  noTemplate:{label:'no saved meal to repeat',kind:'cooking burden'},pendingDecisions:{label:'decisions waiting for you',kind:'decision fatigue'}};
var FRICTION_ITEMS=['training','cardio','steps','nutrition','protein','weigh-in'];
function _dayVal(type,date){var s=(obsOf(type)||[]).filter(function(o){return o.date===date;});return s.length?s[s.length-1].value:null;}
function _frictionFeatures(date,item,rows){var f={},plan=null;try{plan=scheduledPlan(date,trainingProgram());}catch(e){}
  var dow=new Date(date+'T12:00:00Z').getUTCDay();f.weekend=(dow===0||dow===6)?1:0;
  f.planLoad=(rows||[]).length>=6?1:0;f.longSession=plan&&plan.kind==='lift'&&(plan.minutes||plan.durationMin||0)>=60?1:0;
  f.workShift=plan&&plan.shift&&plan.shift!=='O'&&plan.shift!=='off'?1:0;
  var sl=_dayVal('sleep',date);f.shortSleep=sl!=null&&sl<6?1:0;var mo=_dayVal('motivation',date);f.lowMotivation=mo!=null&&mo<=4?1:0;var fa=_dayVal('fatigue',date);f.highFatigue=fa!=null&&fa>=7?1:0;
  f.badWeather=0;if((item==='cardio'||item==='steps')&&typeof weatherContextAt==='function'){try{var w=weatherContextAt(date+'T17:00:00');if(w&&((w.precipitation||0)>=2||(w.temperature!=null&&w.temperature>=32)))f.badWeather=1;}catch(e){}}
  f.noTemplate=(item==='nutrition'||item==='protein')&&!(DB.settings.templates||[]).some(function(t){return t.kind==='meal';})?1:0;
  /* a decision is waiting when it proposed a change and nothing applied it (applying records its decisionId); the first
     version read accepted/dismissed flags that nothing writes, so every decision counted as waiting */
  var acted={};(DB.experiments||[]).concat(DB.interventions||[]).forEach(function(x){if(x.decisionId)acted[x.decisionId]=1;});
  f.pendingDecisions=(DB.decisions||[]).filter(function(d){var dd=String(d.date||'').slice(0,10);return dd<=date&&dd>=addDays(date,-3)&&d.intervention&&!acted[d.id];}).length>=2?1:0;
  return f;}
/* ridge logistic regression by Newton\u2013Raphson; returns coefficients and standard errors */
function _logitRidge(X,y,lambda){var p=X[0].length,b=new Array(p).fill(0);for(var it=0;it<25;it++){var g=new Array(p).fill(0),H=[];for(var i=0;i<p;i++)H.push(new Array(p).fill(0));
    X.forEach(function(x,k){var z=x.reduce(function(a,v,j){return a+v*b[j];},0),mu=1/(1+Math.exp(-z)),wt=mu*(1-mu);for(var i2=0;i2<p;i2++){g[i2]+=(y[k]-mu)*x[i2];for(var j=0;j<p;j++)H[i2][j]+=wt*x[i2]*x[j];}});
    for(var i3=1;i3<p;i3++){g[i3]-=lambda*b[i3];H[i3][i3]+=lambda;}H[0][0]+=1e-6;var inv=_matInv(H);if(!inv)break;var step=inv.map(function(r){return r.reduce(function(a,v,j){return a+v*g[j];},0);});
    b=b.map(function(v,j){return v+step[j];});if(Math.max.apply(null,step.map(Math.abs))<1e-6)break;}
  var Hf=[];for(var q=0;q<p;q++)Hf.push(new Array(p).fill(0));X.forEach(function(x){var z=x.reduce(function(a,v,j){return a+v*b[j];},0),mu=1/(1+Math.exp(-z)),wt=mu*(1-mu);for(var i=0;i<p;i++)for(var j=0;j<p;j++)Hf[i][j]+=wt*x[i]*x[j];});
  for(var r=1;r<p;r++)Hf[r][r]+=lambda;var iv=_matInv(Hf);return {b:b,se:iv?iv.map(function(r,i){return Math.sqrt(Math.max(0,r[i]));}):b.map(function(){return null;})};}
function _matInv(A){var n=A.length,M=A.map(function(r,i){return r.concat(Array.from({length:n},function(_,j){return i===j?1:0;}));});
  for(var c=0;c<n;c++){var piv=c;for(var r=c+1;r<n;r++)if(Math.abs(M[r][c])>Math.abs(M[piv][c]))piv=r;if(Math.abs(M[piv][c])<1e-12)return null;var t=M[c];M[c]=M[piv];M[piv]=t;
    var d=M[c][c];for(var j=0;j<2*n;j++)M[c][j]/=d;for(var r2=0;r2<n;r2++){if(r2===c)continue;var f=M[r2][c];if(f)for(var j2=0;j2<2*n;j2++)M[r2][j2]-=f*M[c][j2];}}
  return M.map(function(r){return r.slice(n);});}
function frictionModel(days){days=days||56;if(typeof memo==='function')return memo('friction:'+days+':'+todayISO(),function(){return _frictionModel(days);});return _frictionModel(days);}
function _frictionModel(days){var data={};FRICTION_ITEMS.forEach(function(i){data[i]=[];});
  for(var k=1;k<=days;k++){var d=addDays(todayISO(),-k),e=null;try{e=executionFor(d);}catch(err){}if(!e||!e.rows)continue;
    e.rows.forEach(function(r){if(!data[r.item])return;if(r.status==='unknown'||r.status==='planned'||r.status==='pending'||r.status==='rest')return;data[r.item].push({date:d,y:r.status==='done'?1:0,f:_frictionFeatures(d,r.item,e.rows)});});}
  var keys=Object.keys(FRICTION_FACTORS);
  var items=FRICTION_ITEMS.map(function(it){var D=data[it],n=D.length,rate=n?D.filter(function(x){return x.y;}).length/n:null;
    if(n<14)return {item:it,n:n,rate:rate!=null?round(rate,2):null,status:'insufficient',note:'fewer than 14 recorded days'};
    var used=keys.filter(function(f){var ex=D.filter(function(x){return x.f[f];}).length;return ex>=3&&ex<=n-3;});   /* a factor needs both kinds of day */
    var misses=D.filter(function(x){return !x.y;}).length;
    if(!used.length||misses<2)return {item:it,n:n,rate:round(rate,2),status:'ok',factors:[],note:misses<2?'almost never missed: no friction to explain':'no factor varies enough to test'};
    var X=D.map(function(x){return [1].concat(used.map(function(f){return x.f[f];}));}),y=D.map(function(x){return x.y;}),fit=_logitRidge(X,y,1);
    var factors=used.map(function(f,i){var c=fit.b[i+1],s=fit.se[i+1];return {factor:f,label:FRICTION_FACTORS[f].label,kind:FRICTION_FACTORS[f].kind,exposedDays:D.filter(function(x){return x.f[f];}).length,
      oddsRatio:round(Math.exp(c),2),lo:s!=null?round(Math.exp(c-2*s),2):null,hi:s!=null?round(Math.exp(c+2*s),2):null,clear:s!=null&&Math.abs(c)>2*s};})
      .sort(function(a,b){return a.oddsRatio-b.oddsRatio;});
    return {item:it,n:n,rate:round(rate,2),status:'ok',intercept:fit.b[0],coef:used.reduce(function(o,f,i){o[f]=fit.b[i+1];return o;},{}),factors:factors};});
  return {status:'ok',cls:'EMPIRICAL',days:days,items:items,method:'ridge-regularised logistic regression per item on the last '+days+' days (\u03bb = 1); odds ratios below 1 are friction',
    limits:'Associations, not causes: a factor can stand in for something unmeasured. Needs 14 recorded days per item and both kinds of day for a factor.'};}
function executionProbability(item,date){var M=frictionModel(),r=M.items.filter(function(x){return x.item===item;})[0];date=date||todayISO();
  if(!r||r.status!=='ok'||r.rate==null)return null;if(!r.coef)return {p:r.rate,basis:'your rate over '+r.n+' days',drivers:[]};
  var f=_frictionFeatures(date,item,null),z=r.intercept,drivers=[];Object.keys(r.coef).forEach(function(k){if(f[k]){z+=r.coef[k];drivers.push(FRICTION_FACTORS[k].label);}});
  return {p:round(1/(1+Math.exp(-z)),2),basis:'your record over '+r.n+' days',drivers:drivers};}
/* P(execution | intervention): past adherence to changes of this kind (Response records), a prior that falls with the
   size of the change, and today's friction on the related item */
var FRICTION_ITEM_FOR={steps:'steps',calories:'nutrition',protein:'protein',cardio:'cardio','training days':'training'};
function interventionAdherence(variable,dose,current){var rel=current&&dose!=null?Math.abs(dose)/Math.max(1,Math.abs(current)):0.1;
  var pm=rel>0.2?0.55:(rel>0.1?0.65:0.75),a=pm*6,b=(1-pm)*6;   /* a prior worth six days: bigger changes are carried out less */
  (DB.responses||[]).filter(function(r){return r.variable===variable&&r.adherence&&r.adherence.share!=null;}).forEach(function(r){var n=Math.min(21,r.adherence.daysLogged||0);a+=r.adherence.share*n;b+=(1-r.adherence.share)*n;});
  var m=a/(a+b),sdv=Math.sqrt(a*b/((a+b)*(a+b)*(a+b+1))),today=FRICTION_ITEM_FOR[variable]?executionProbability(FRICTION_ITEM_FOR[variable]):null,adj=1;
  var base=frictionModel().items.filter(function(x){return x.item===FRICTION_ITEM_FOR[variable];})[0];if(today&&base&&base.rate)adj=Math.min(1.3,Math.max(0.5,today.p/base.rate));
  return {p:round(Math.min(0.98,m*adj),2),sd:round(sdv,2),relativeSize:round(rel,2),basis:'past adherence to '+variable+' changes, a prior for a change of this size'+(adj!==1?', and today\u2019s friction':''),drivers:today?today.drivers:[]};}
/* the lever choice: expected effect \u00d7 the probability it is carried out */
function rankLevers(options){return options.map(function(o){var eff=typeof predictResponse==='function'?predictResponse(o.variable,o.outcome||'weight',o.dose):null,ad=interventionAdherence(o.variable,o.dose,o.current);
  var effective=eff?eff.mean*ad.p:null,adN=(DB.responses||[]).filter(function(r){return r.variable===o.variable&&r.adherence&&r.adherence.share!=null;}).length;
  return Object.assign({},o,{expectedEffect:eff?eff.mean:null,effectBasis:eff?eff.basis:null,personalWeight:eff?eff.personalWeight:0,adherenceEvidence:adN,pExecution:ad.p,adherenceBasis:ad.basis,effectiveEffect:effective!=null?round(effective,3):null});})
  .sort(function(a,b){return (a.effectiveEffect==null?0:Math.abs(b.effectiveEffect||0))-(b.effectiveEffect==null?0:Math.abs(a.effectiveEffect||0));});}
(function(){if(typeof MODELS==='undefined'||_registryTaken(MODELS,'MODELS','friction'))return;
  MODELS.push({id:'friction',name:'Friction and adherence',cls:'EMPIRICAL',version:'1.0',inputs:['sleep','fatigue','motivation','weight'],minN:14,
    assumes:['recorded burdens stand for the real ones','days are independent'],failsWhen:['fewer than 14 recorded days per item','a factor that never varies'],
    output:'why plan items are missed (odds ratios per burden) and the probability a change is carried out',consumers:['decide','rankLevers'],freshnessDays:7,uncertainty:{kind:'standard error of each log odds'},fn:'frictionModel'});})();
