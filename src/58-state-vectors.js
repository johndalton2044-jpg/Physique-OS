/* ============================================================================
   STAGE B PROJECTIONS (future plan items 16, 17, 18). Read-only views of existing records \u2014 no new store, no second
   registry: regimes (named periods with an entry and an exit), the personal state vector (each value with its
   uncertainty and how fresh it is), and the capability vector (what the person can do, with the data it rests on).
   ============================================================================ */
var REGIME_CONTEXT_TAGS=['travel','illness','holiday','injury'];
/* ---- REGIMES (§89): phases, context periods, time off training and the return, breaks in the weight trend ---- */
function regimes(){var out=[];
  (DB.phases||[]).forEach(function(p){if(p.startDate)out.push({id:'phase:'+p.id,kind:'phase',label:(p.type||'')+' phase',from:p.startDate,to:p.endDate||null,source:'phase'});});
  REGIME_CONTEXT_TAGS.forEach(function(tag){var days=obsOf('context').filter(function(o){return String(o.value).toLowerCase().indexOf(tag)>=0;}).map(function(o){return o.date;}).sort();
    var cur=null;days.forEach(function(d){if(cur&&daysBetween(cur.to,d)<=2)cur.to=d;else{if(cur)out.push(cur);cur={id:'context:'+tag+':'+d,kind:'context',label:tag,from:d,to:d,source:'context tags'};}});if(cur)out.push(cur);});
  var S=(DB.sessions||[]).filter(function(s){return !s.retracted;}).map(function(s){return s.date;}).filter(function(v,i,a){return a.indexOf(v)===i;}).sort();
  for(var i=1;i<S.length;i++){var gap=daysBetween(S[i-1],S[i]);if(gap>=10){out.push({id:'break:'+S[i-1],kind:'training break',label:(gap-1)+' days without training',from:addDays(S[i-1],1),to:addDays(S[i],-1),source:'sessions'});
      out.push({id:'return:'+S[i],kind:'return to training',label:'the first two weeks back',from:S[i],to:addDays(S[i],13)<todayISO()?addDays(S[i],13):null,source:'sessions'});}}
  try{(changePoints(180).items||[]).filter(function(c){return c.stream==='weight';}).forEach(function(c){out.push({id:'trend:'+c.date,kind:'trend break',label:c.text,from:c.date,to:c.date,point:true,source:'change-point detection'});});}catch(e){}
  return out.sort(function(a,b){return a.from<b.from?-1:(a.from>b.from?1:0);});}
function currentRegimes(date){date=date||asOf();return regimes().filter(function(r){return !r.point&&r.from<=date&&(!r.to||r.to>=date);});}
/* regime changes strictly inside a window: entering or leaving one there (a phase that starts on the window's first day is not a change within it) */
function regimeChangesIn(from,to){var out=[];regimes().forEach(function(r){if(r.kind==='phase'&&r.from===from)return;
  if(r.from>from&&r.from<=to)out.push((r.point?'':'started: ')+r.label+' ('+r.from+')');else if(r.to&&r.to>=from&&r.to<to&&!r.point)out.push('ended: '+r.label+' ('+r.to+')');});return out;}

/* ---- STATE VECTOR (§4.1): every value with its uncertainty and its freshness ---- */
function _fresh(type){var o=obsOf(type).filter(function(x){return !x.retracted&&x.date<=asOf();});var d=o.length?o[o.length-1].date:null;return {asOf:d,ageDays:d?daysBetween(d,asOf()):null};}
function _sdOfMean(v){if(v.length<2)return null;var m=mean(v),s=Math.sqrt(v.reduce(function(a,x){return a+(x-m)*(x-m);},0)/(v.length-1));return s/Math.sqrt(v.length);}
function stateVector(){var C=[],push=function(key,label,value,unit,sd,fresh,source){if(value==null||!isFinite(value))return;C.push({key:key,label:label,value:round(value,2),unit:unit,sd:sd!=null&&isFinite(sd)?round(sd,2):null,asOf:fresh&&fresh.asOf||null,ageDays:fresh?fresh.ageDays:null,source:source});};
  try{var W=seriesWindow('weight',7).map(function(x){return x.value;});push('weight','Weight, 7-day average',W.length?mean(W):null,'lb',_sdOfMean(W),_fresh('weight'),'weigh-ins');}catch(e){}
  try{var T=weightTrend(21);if(T&&T.status!=='insufficient')push('weightTrend','Weight trend',T.slopePerWeek,'lb a week',T.slopeSe,_fresh('weight'),'weigh-ins, 21 days');   /* weightTrend names its standard error slopeSe */}catch(e){}
  try{var D=tdeePersonal();if(D&&D.status==='ok')push('tdee','Energy expenditure',D.value,'kcal a day',(D.hi-D.lo)/3.92,_fresh('calories'),'intake and weight trend, '+D.window+' days');}catch(e){}
  try{var E=_e1rmTop();if(E&&E.series.length){var last=E.series.slice(-4).map(function(x){return x.value;});push('strength','Strength ('+E.exercise+', estimated one-rep max)',last[last.length-1],'lb',_sdOfMean(last),{asOf:E.series[E.series.length-1].date,ageDays:daysBetween(E.series[E.series.length-1].date,asOf())},'sessions');}}catch(e){}
  try{var A=adherenceState(14);if(A&&A.overall!=null){var p=A.overall/100,n=14;push('adherence','Plan followed',A.overall,'%',100*Math.sqrt(p*(1-p)/n),null,'executions, 14 days');}}catch(e){}
  try{var BC=bodyCompositionState();if(BC.status==='ok'){var bf=_fresh('bodyfat'),src=BC.methods.length?('weight trend and '+BC.methods.map(function(m){return m.method;}).join(', ')):'weight trend, partition prior';
    push('fatRate','Fat mass, rate',BC.fatRate.mean,'lb a week',BC.fatRate.sd,_fresh('weight'),src);push('leanRate','Lean mass, rate',BC.leanRate.mean,'lb a week',BC.leanRate.sd,_fresh('weight'),src);
    if(BC.masses){push('fatMass','Fat mass',BC.masses.fat.mean,'lb',BC.masses.fat.sd,bf,BC.masses.from);push('leanMass','Lean mass',BC.masses.lean.mean,'lb',BC.masses.lean.sd,bf,BC.masses.from);}}}catch(e){}
  try{var F=seriesWindow('fatigue',7).map(function(x){return x.value;});push('fatigue','Fatigue, 7-day average',F.length?mean(F):null,'1\u201310',_sdOfMean(F),_fresh('fatigue'),'recovery check-ins');}catch(e){}
  return {asOf:asOf(),components:C,stale:C.filter(function(c){return c.ageDays!=null&&c.ageDays>7;}).map(function(c){return c.key;}),note:'each value with its uncertainty (standard deviation) and how old its newest data is'};}

/* ---- CAPABILITY VECTOR (§106): what the person can do, with what it rests on ---- */
function _weekly(fn,weeks){var out=[];for(var w=0;w<weeks;w++){var to=addDays(asOf(),-7*w),from=addDays(to,-6);out.push(fn(from,to));}return out;}
function capabilityVector(){var weeks=4,cap={asOf:asOf(),weeks:weeks};
  try{cap.strength=physiqueModel().regions.filter(function(r){return r.strength&&r.strength.pctPerMonth!=null;}).map(function(r){return {region:r.label,trendPctPerMonth:r.strength.pctPerMonth,se:r.strength.se,setsPerWeek:r.sets,status:r.status};});}catch(e){cap.strength=[];}
  var sets=_weekly(function(f,t){return (DB.sessions||[]).filter(function(s){return !s.retracted&&s.date>=f&&s.date<=t;}).reduce(function(a,s){return a+(s.sets||[]).length;},0);},weeks);
  cap.workCapacity={setsPerWeek:round(mean(sets),1),sd:sets.length>1?round(Math.sqrt(sets.reduce(function(a,x){var m=mean(sets);return a+(x-m)*(x-m);},0)/(sets.length-1)),1):null,weeks:sets};
  var card=_weekly(function(f,t){return obsOf('cardio').filter(function(o){return o.date>=f&&o.date<=t;}).reduce(function(a,o){return a+(o.value||0);},0);},weeks);
  cap.endurance={cardioMinutesPerWeek:round(mean(card),0),weeks:card};
  /* minutes are the dose; capacity is the aerobic estimate and its trend, where heart rate and pace or power allow one */
  try{var CF=cardioFitnessModel(),h=CF.status==='ok'?CF.headline:null;
    cap.endurance.capacity=h?{vo2max:h.estimate,sd:h.sd,ci80:h.ci80,family:h.family,sessions:h.n,trend:h.trend&&h.trend.status==='ok'?h.trend:null,trendNeed:h.trend&&h.trend.status!=='ok'?h.trend.need:null}:
      {status:'insufficient',need:CF.need||['steady sessions with heart rate and pace or power']};}catch(e){cap.endurance.capacity={status:'insufficient',need:['the aerobic model could not run']};}
  var mob=_weekly(function(f,t){return obsOf('mobility').filter(function(o){return o.date>=f&&o.date<=t;}).length;},weeks);
  cap.mobility={sessionsPerWeek:round(mean(mob),1),weeks:mob};
  cap.note='strength by region from the physique model; work capacity, endurance and mobility from the last '+weeks+' weeks, newest first';
  return cap;}
