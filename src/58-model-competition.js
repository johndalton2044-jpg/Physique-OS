/* ============================================================================
   MODEL COMPETITION (audit §105\u2013§107, phase 10). Important predictions compete: a naive baseline, the current model and
   challengers, scored by a rolling-origin backtest that uses only data available at each origin \u2014 mean absolute error,
   bias, 80% interval coverage, recent-context error, stability, and simplicity as the tiebreak. Newer is not assumed
   better: a challenger replaces the primary only when significantly better on paired errors (a Diebold\u2013Mariano style
   test, beyond two standard errors) and calibrated (coverage 70\u201390%). A primary that cannot beat the baseline is
   flagged; a model significantly worse than the baseline is deprecated, then retired; a new primary whose recent error
   grows past the old one's is rolled back. Lifecycle: DRAFT \u2192 EXPERIMENTAL \u2192 OPERATIONAL \u2192 CALIBRATED \u2192 CHALLENGER \u2192
   PRIMARY \u2192 DEPRECATED \u2192 RETIRED, kept in DB.settings.modelLifecycle with every change in the audit log.
   ============================================================================ */
var MODEL_LIFECYCLE_STATES=['DRAFT','EXPERIMENTAL','OPERATIONAL','CALIBRATED','CHALLENGER','PRIMARY','DEPRECATED','RETIRED'];
function _tail(S,origin,n){return S.filter(function(x){return x.date<=origin&&x.date>addDays(origin,-n);});}
function _residSd(S,origin){var T=_tail(S,origin,21);if(T.length<5)return null;var f=_slopePerWeek(T);if(!f)return sd(T.map(function(x){return x.value;}));
  var x0=T[0].date,res=T.map(function(x){return x.value-(mean(T.map(function(y){return y.value;}))+f.slope/7*(daysBetween(x0,x.date)-mean(T.map(function(y){return daysBetween(x0,y.date);}))));});return sd(res);}
var COMPETITION_CANDIDATES={
  naive:{label:'Recent average, held flat (baseline)',params:1,baseline:true,predict:function(S,o,h){var T=_tail(S,o,7);if(T.length<3)return null;var s=_residSd(S,o)||sd(T.map(function(x){return x.value;}));return {mean:mean(T.map(function(x){return x.value;})),sd:Math.sqrt(s*s+0.02*h*s*s)};}},
  theil_sen:{label:'14-day Theil\u2013Sen trend (the app\u2019s method)',params:2,incumbent:true,predict:function(S,o,h){var T=_tail(S,o,14);if(T.length<6)return null;var sl=[];
    for(var i=0;i<T.length;i++)for(var j=i+1;j<T.length;j++){var dd=daysBetween(T[i].date,T[j].date);if(dd)sl.push((T[j].value-T[i].value)/dd);}var b=_medianOf(sl),L=_tail(S,o,7),anchor=mean(L.map(function(x){return x.value;}));
    var s=_residSd(S,o)||0.5;return {mean:anchor+b*(h+3),sd:Math.sqrt(s*s*(1+h/14)+Math.pow(0.15*b*h,2))};}},
  holt:{label:'Holt exponential smoothing (level and trend)',params:2,predict:function(S,o,h){var T=_tail(S,o,42);if(T.length<10)return null;var a=0.3,bt=0.1,l=T[0].value,t=0,prev=T[0].date;
    for(var i=1;i<T.length;i++){var gap=Math.max(1,daysBetween(prev,T[i].date)),lp=l;l=a*T[i].value+(1-a)*(l+t*gap);t=bt*(l-lp)/gap+(1-bt)*t;prev=T[i].date;}
    var s=_residSd(S,o)||0.5,lead=daysBetween(prev,o)+h;return {mean:l+t*lead,sd:Math.sqrt(s*s*(1+h/10))};}},
  damped:{label:'Damped trend (the trend fades week by week)',params:3,predict:function(S,o,h){var base=COMPETITION_CANDIDATES.theil_sen.predict(S,o,0);if(!base)return null;var T=_tail(S,o,14),sl=[];
    for(var i=0;i<T.length;i++)for(var j=i+1;j<T.length;j++){var dd=daysBetween(T[i].date,T[j].date);if(dd)sl.push((T[j].value-T[i].value)/dd);}var b=_medianOf(sl),phi=0.9,eff=0;for(var k=1;k<=h;k++)eff+=Math.pow(phi,k/7);
    var s=_residSd(S,o)||0.5;return {mean:base.mean-b*3+b*(3+eff),sd:Math.sqrt(s*s*(1+h/14))};}}};
function _e1rmTop(){var by={};sessionsOf({from:addDays(todayISO(),-180)}).forEach(function(s){(s.sets||[]).forEach(function(x){if(!x.load||!x.reps)return;var v=x.load*(1+x.reps/30);(by[x.exercise]=by[x.exercise]||{})[s.date]=Math.max((by[x.exercise]||{})[s.date]||0,v);});});
  var top=Object.keys(by).sort(function(a,b){return Object.keys(by[b]).length-Object.keys(by[a]).length;})[0];return top?{exercise:top,series:Object.keys(by[top]).sort().map(function(d){return {date:d,value:by[top][d]};})}:null;}
var MODEL_COMPETITIONS={
  weight:{label:'Weight forecast',unit:'lb',horizons:[7,14],series:function(){return seriesWindow('weight',200).map(function(x){return {date:x.date,value:x.value};});},candidates:['naive','theil_sen','holt','damped']},
  strength:{label:'Strength forecast (most-trained lift)',unit:'lb e1RM',horizons:[14],series:function(){var t=_e1rmTop();return t?t.series:[];},candidates:['naive','theil_sen','holt']}};
/* the rolling-origin backtest: every 3 days over the last 90, only data on or before the origin */
function backtestCompetition(id,opts){opts=opts||{};if(!opts.series&&typeof memo==='function')return memo('competition:'+id+':'+todayISO(),function(){return _backtestCompetition(id,opts);});return _backtestCompetition(id,opts);}
function _backtestCompetition(id,opts){var C=MODEL_COMPETITIONS[id];opts=opts||{};var S=opts.series||C.series();if(S.length<20)return {status:'insufficient',competition:id,note:'fewer than 20 readings'};
  var lastDate=S[S.length-1].date,res={};C.candidates.forEach(function(c){res[c]={};C.horizons.forEach(function(h){res[c][h]=[];});});
  for(var k=0;k<=90;k+=3){var o=addDays(lastDate,-k);C.horizons.forEach(function(h){var tgt=addDays(o,h),act=S.filter(function(x){return Math.abs(daysBetween(x.date,tgt))<=1;});if(!act.length||o<=S[0].date)return;
      var actual=mean(act.map(function(x){return x.value;}));C.candidates.forEach(function(c){var p=COMPETITION_CANDIDATES[c].predict(S,o,h);if(!p||!isFinite(p.mean))return;
        res[c][h].push({origin:o,err:p.mean-actual,inside:Math.abs(p.mean-actual)<=1.2816*Math.max(p.sd,1e-6),pred:p.mean,ratio:Math.abs(p.mean-actual)/Math.max(p.sd,1e-6)});});});}
  var recentFrom=addDays(lastDate,-30);
  var rows=C.candidates.map(function(c){var m={};C.horizons.forEach(function(h){var E=res[c][h];if(E.length<5){m[h]=null;return;}var ae=E.map(function(e){return Math.abs(e.err);}),R=E.filter(function(e){return e.origin>=recentFrom;});
      var preds=E.map(function(e){return e.pred;}),jumps=[];for(var i=1;i<preds.length;i++)jumps.push(Math.abs(preds[i]-preds[i-1]));
      /* CALIBRATION: the factor that would have made the 80% interval hold 80% of the time, learned on the older half of the
         origins and checked on the newer half (no leakage); the full-data factor widens live forecasts */
      var byAge=E.slice().sort(function(a,b){return a.origin<b.origin?-1:1;}),half=Math.floor(byAge.length/2),q80=function(A){var r=A.map(function(e){return e.ratio;}).sort(function(a,b){return a-b;});return r.length?r[Math.min(r.length-1,Math.floor(0.8*r.length))]/1.2816:1;};
      /* both ways: intervals too wide are miscalibrated too (only widening let an over-wide model never qualify) */
      var kOld=Math.max(0.25,q80(byAge.slice(0,half))),kAll=Math.max(0.25,q80(byAge)),newer=byAge.slice(half);
      m[h]={n:E.length,mae:round(mean(ae),3),bias:round(mean(E.map(function(e){return e.err;})),3),coverage:round(E.filter(function(e){return e.inside;}).length/E.length,2),
        scale:round(kAll,2),calibratedCoverage:newer.length?round(newer.filter(function(e){return e.ratio<=1.2816*kOld;}).length/newer.length,2):null,calibrationN:newer.length,
        recentMae:R.length>=3?round(mean(R.map(function(e){return Math.abs(e.err);})),3):null,stability:jumps.length?round(mean(jumps),3):null};});
    return {candidate:c,label:COMPETITION_CANDIDATES[c].label,params:COMPETITION_CANDIDATES[c].params,baseline:!!COMPETITION_CANDIDATES[c].baseline,metrics:m,errors:res[c]};});
  return {status:'ok',competition:id,label:C.label,unit:C.unit,horizons:C.horizons,rows:rows,origins:Math.floor(90/3)+1};}
/* paired comparison of absolute errors on the same origins: positive z = a is worse than b */
/* Overlapping multi-step forecasts have correlated errors, so the paired test uses a Newey–West (HAC) variance with a lag
   set by the overlap, as Diebold–Mariano prescribes; a plain standard error overstated the evidence. */
function _pairedZ(Ea,Eb,h){var by={};Eb.forEach(function(e){by[e.origin]=Math.abs(e.err);});
  var d=Ea.filter(function(e){return by[e.origin]!=null;}).sort(function(a,b){return a.origin<b.origin?-1:1;}).map(function(e){return Math.abs(e.err)-by[e.origin];});
  var n=d.length;if(n<5)return null;var m=mean(d),L=Math.max(0,Math.ceil((h||7)/3)-1),g=function(k){var s=0;for(var i=k;i<n;i++)s+=(d[i]-m)*(d[i-k]-m);return s/n;};
  var v=g(0);for(var k=1;k<=Math.min(L,n-1);k++)v+=2*(1-k/(L+1))*g(k);v=Math.max(v,1e-12)/n;
  return {z:m/Math.sqrt(v),n:n,meanDiff:m,hacLag:L};}
function _lc(){return DB.settings.modelLifecycle||(DB.settings.modelLifecycle={});}
function evaluateCompetition(id,opts){opts=opts||{};var B0=backtestCompetition(id,opts);if(B0.status!=='ok')return B0;var B=Object.assign({},B0,{rows:B0.rows.map(function(r){return Object.assign({},r);})});var C=MODEL_COMPETITIONS[id],h=C.horizons[C.horizons.length-1];
  var saved=_lc()[id];
  /* lifecycle changes at most once a day: "deprecated twice" counts evaluations, not screen refreshes */
  if(saved&&saved.lastRun===todayISO()&&!opts.force)opts=Object.assign({},opts,{dryRun:true});
  var L=JSON.parse(JSON.stringify(saved||{primary:C.candidates.filter(function(c){return COMPETITION_CANDIDATES[c].incumbent;})[0]||C.candidates[0],states:{},history:[],deprecatedRuns:{}}));
  var get=function(c){return B.rows.filter(function(r){return r.candidate===c;})[0];},base=B.rows.filter(function(r){return r.baseline;})[0],prim=get(L.primary),changes=[];
  /* judged after calibration, on forecasts the factor did not see, within sampling error: with n forecasts a calibrated
     80% interval's coverage varies by about 2√(0.16/n) (a fixed 70–95% band rejected good models on small backtests) */
  var calibrated=function(r){var m=r&&r.metrics[h];if(!m)return false;var c=m.calibratedCoverage!=null?m.calibratedCoverage:m.coverage,n=m.calibrationN||m.n;return c!=null&&Math.abs(c-0.8)<=Math.max(0.1,2*Math.sqrt(0.16/Math.max(1,n)));};
  B.rows.forEach(function(r){if(L.states[r.candidate]==='RETIRED')return;var m=r.metrics[h];if(!m){L.states[r.candidate]=L.states[r.candidate]||'EXPERIMENTAL';return;}
    var vsBase=base&&r!==base?_pairedZ(r.errors[h],base.errors[h],h):null;r.vsBaseline=vsBase;
    if(vsBase&&vsBase.z>2&&r.candidate!==L.primary){L.deprecatedRuns[r.candidate]=(L.deprecatedRuns[r.candidate]||0)+1;L.states[r.candidate]=L.deprecatedRuns[r.candidate]>=2?'RETIRED':'DEPRECATED';return;}
    L.deprecatedRuns[r.candidate]=0;L.states[r.candidate]=r.candidate===L.primary?'PRIMARY':(calibrated(r)?'CALIBRATED':'OPERATIONAL');});
  /* rollback: a recently promoted primary whose recent error has grown past the one it replaced */
  var last=L.history[L.history.length-1];if(last&&last.type==='promoted'&&prim&&get(last.from)){var pm=prim.metrics[h],om=get(last.from).metrics[h];
    if(pm&&om&&pm.recentMae!=null&&om.recentMae!=null&&pm.recentMae>om.recentMae*1.1){changes.push({type:'rolled back',from:L.primary,to:last.from,why:'recent error '+pm.recentMae+' against '+om.recentMae+' for the model it replaced'});L.primary=last.from;prim=get(L.primary);}}
  /* promotion: significantly better on paired errors, and calibrated */
  var best=null;B.rows.forEach(function(r){if(r.candidate===L.primary||L.states[r.candidate]==='RETIRED'||L.states[r.candidate]==='DEPRECATED'||!prim||!prim.metrics[h]||!r.metrics[h])return;
    var z=_pairedZ(prim.errors[h],r.errors[h],h);if(z&&z.z>2&&calibrated(r)){L.states[r.candidate]='CHALLENGER';if(!best||z.z>best.z.z||(Math.abs(z.z-best.z.z)<0.5&&r.params<best.r.params))best={r:r,z:z};}});
  if(best&&!changes.length){changes.push({type:'promoted',from:L.primary,to:best.r.candidate,why:'mean absolute error '+best.r.metrics[h].mae+' against '+prim.metrics[h].mae+' ('+round(best.z.z,1)+' standard errors better on '+best.z.n+' paired forecasts, allowing for their overlap), calibrated coverage '+Math.round((best.r.metrics[h].calibratedCoverage!=null?best.r.metrics[h].calibratedCoverage:best.r.metrics[h].coverage)*100)+'%'});
    L.states[L.primary]='OPERATIONAL';L.primary=best.r.candidate;}
  L.states[L.primary]='PRIMARY';
  Object.keys(L.states).forEach(function(k){if(MODEL_LIFECYCLE_STATES.indexOf(L.states[k])<0)L.states[k]='EXPERIMENTAL';});   /* the registry is the authority for states */
  if(!opts.dryRun)changes.forEach(function(c){c.at=nowISO();c.competition=id;L.history.push(c);if(typeof auditAppend==='function')auditAppend('model.'+c.type.replace(' ','-'),c);});
  if(!opts.dryRun){L.lastRun=todayISO();_lc()[id]=L;save('settings');}
  else if(saved){L=saved;}
  var p=get(L.primary),beatsBase=p&&base&&p!==base?_pairedZ(p.errors[h],base.errors[h],h):null;
  return Object.assign(B,{lifecycle:MODEL_LIFECYCLE_STATES,primary:L.primary,states:L.states,history:L.history.slice(-10),changes:changes,
    primaryBeatsBaseline:p===base?null:(beatsBase?beatsBase.z<-2:null),warning:beatsBase&&beatsBase.z>=-2&&p!==base?'the primary model does not clearly beat the naive baseline':null,
    rule:'a challenger replaces the primary only when significantly better on paired errors (beyond two standard errors) and calibrated (70\u201390% coverage); newer is not assumed better'});}
function competitionForecast(id,h){var L=_lc()[id],C=MODEL_COMPETITIONS[id];if(!C)return null;var c=L?L.primary:C.candidates.filter(function(x){return COMPETITION_CANDIDATES[x].incumbent;})[0],S=C.series();if(!S.length)return null;
  var p=COMPETITION_CANDIDATES[c].predict(S,S[S.length-1].date,h),B=backtestCompetition(id),row=B.status==='ok'?B.rows.filter(function(r){return r.candidate===c;})[0]:null,mm=row&&(row.metrics[h]||row.metrics[C.horizons[C.horizons.length-1]]),k=mm&&mm.scale?mm.scale:1;
  return p?{model:c,label:COMPETITION_CANDIDATES[c].label,mean:round(p.mean,2),lo:round(p.mean-1.2816*p.sd*k,2),hi:round(p.mean+1.2816*p.sd*k,2),horizon:h,calibrationScale:k}:null;}
(function(){if(typeof MODELS==='undefined'||MODELS.some(function(m){return m.id==='model_competition';}))return;
  MODELS.push({id:'model_competition',name:'Model competition',cls:'EMPIRICAL',version:'1.0',inputs:['weight'],minN:20,
    assumes:['the backtest period resembles the coming one'],failsWhen:['fewer than 20 readings','a regime change inside the backtest window'],
    output:'which forecast to trust for each important prediction, with its error, bias and calibration',consumers:['competitionForecast'],freshnessDays:7,uncertainty:{kind:'paired error test and interval coverage'},fn:'evaluateCompetition'});})();
