/* ============================================================================
   REGION: PERSONAL BASELINES · CHANGE POINTS · MEASUREMENT PROTOCOLS
   Individualization layer between state and decision: what is normal FOR THIS PERSON, when something
   changed, and how much each measurement can be trusted. Pure functions over observations; as-of aware.
   ============================================================================ */
/* ---- measurement protocols: values without a protocol drift; a protocol makes drift visible ---- */
var PROTOCOLS={
  weight:{label:'Weight',steps:['morning','after the bathroom','before food or drink','same scale','similar clothing'],cadence:'daily',driftNote:'a different time of day or scale shows up as a discontinuity, not as tissue change'},
  waist:{label:'Waist',steps:['same landmark (navel)','standing, relaxed exhale','same tape tension','same time of day, before food'],cadence:'weekly',driftNote:'tension and landmark changes of 1 cm are common; that is one week of real change'},
  neck:{label:'Neck',steps:['below the larynx','tape level','relaxed'],cadence:'monthly'},
  hip:{label:'Hip',steps:['widest point','feet together','tape level'],cadence:'monthly'},
  bodyfat:{label:'Body fat',steps:['same method every time','same operator or device','same hydration state (morning, fasted)'],cadence:'monthly or less',driftNote:'methods are not comparable; the record keeps the method with the value'},
  training:{label:'Training',steps:['same exercise variant and equipment','same range of motion','same load units','RIR rated after the set'],cadence:'per session',driftNote:'a new machine or variant restarts the strength history for that lift'},
  steps:{label:'Steps',steps:['same device worn the same way'],cadence:'daily'},
  sleep:{label:'Sleep',steps:['time asleep, not time in bed','same source (device or estimate)'],cadence:'daily'}
};
function protocolFor(type){return PROTOCOLS[type]||null;}
/* ---- measurement quality: a score per observation from source, flags, protocol and method consistency ---- */
function measurementQuality(o){
  if(!o)return {score:0,factors:['no observation'],level:'none'};
  var score=1,factors=[];
  if(o.quality==='estimated'||o.method==='estimate'){score-=0.3;factors.push('estimated, not measured');}
  if(o.quality==='derived'){score-=0.15;factors.push('derived from a food log');}
  (o.flags||[]).forEach(function(f){if(/outlier/.test(f)){score-=0.3;factors.push(f);}else if(/plausible/.test(f)){score-=0.5;factors.push(f);}});
  var proto=o.meta&&o.meta.protocol;if(proto==='off'){score-=0.25;factors.push('off-protocol conditions');}else if(proto==='partial'){score-=0.1;factors.push('partial protocol');}
  if(o.type==='bodyfat'&&o.method){var methods={};obsOf('bodyfat').forEach(function(x){methods[x.method||'unspecified']=(methods[x.method||'unspecified']||0)+1;});var top=Object.keys(methods).sort(function(a,b){return methods[b]-methods[a];})[0];if(top&&top!==(o.method||'unspecified')){score-=0.2;factors.push('method differs from the usual ('+top+')');}}
  if(o.source==='demo')factors.push('demo');
  score=clamp(round(score,2),0,1);
  return {score:score,level:score>=0.85?'high':(score>=0.6?'moderate':'low'),factors:factors};
}
function streamQuality(type,days){var list=obsOf(type,{from:addDays(asOf(),-((days||14)-1))});if(!list.length)return {n:0,mean:null,level:'insufficient',low:0};var qs=list.map(measurementQuality);var m=mean(qs.map(function(q){return q.score;}));return {n:list.length,mean:m,level:m>=0.85?'high':(m>=0.6?'moderate':'low'),low:qs.filter(function(q){return q.level==='low';}).length};}
/* ---- personal baselines: robust centre and spread per stream, and where the last 7 days sit against them ---- */
var BASELINE_STREAMS={weight:{kind:'volatility'},steps:{kind:'level'},sleep:{kind:'level'},hunger:{kind:'level'},fatigue:{kind:'level'},stress:{kind:'level'},soreness:{kind:'level'},calories:{kind:'level'},protein:{kind:'level'},cardio:{kind:'level'}};
function personalBaselines(days){
  days=days||56;
  return memo('baselines:'+days+':'+asOf(),function(){
    var out={days:days,streams:{},asOf:asOf()};
    Object.keys(BASELINE_STREAMS).forEach(function(t){
      var s=seriesWindow(t,days);var vals=s.map(function(d){return d.value;});
      if(t==='weight'){var diffs=[];for(var i=1;i<vals.length;i++)diffs.push(Math.abs(vals[i]-vals[i-1]));if(diffs.length<8){out.streams.weight={status:'insufficient',n:diffs.length,need:(8-diffs.length)+' more consecutive weigh-ins'};return;}var last7=diffs.slice(-7);out.streams.weight={status:'ok',cls:'EMPIRICAL',metric:'day-to-day swing',baseline:median(diffs),spread:mad(diffs),n:diffs.length,last7:mean(last7),ratio:mean(last7)/Math.max(0.05,median(diffs)),note:'personal scale noise; the trend model widens intervals when this rises'};return;}
      if(vals.length<10){out.streams[t]={status:'insufficient',n:vals.length,need:(10-vals.length)+' more days'};return;}
      var base=median(vals.slice(0,Math.max(7,vals.length-7))),spread=mad(vals.slice(0,Math.max(7,vals.length-7)))||0;var l7=s.slice(-7).map(function(d){return d.value;});var m7=l7.length?mean(l7):null;
      var z=m7!=null&&spread>0?(m7-base)/(1.4826*spread):null;
      out.streams[t]={status:'ok',cls:'EMPIRICAL',metric:'level',baseline:base,spread:spread,n:vals.length,last7:m7,n7:l7.length,z:z,drift:z==null?'unknown':(z>1?'above':(z<-1?'below':'within')),deviation:m7!=null?m7-base:null};
    });
    // strength volatility: coefficient of variation of e1RM across exposures per tracked lift
    var st=strengthTrend();if(st.status==='ok'){var cvs=[];st.per.forEach(function(p){if(p.status!=='ok'||!p.history)return;var v=p.history.map(function(h){return h.best.value;});var m=mean(v),sdv=sd(v);if(m&&sdv!=null)cvs.push({exercise:p.exercise,cv:sdv/m});});if(cvs.length)out.streams.strength={status:'ok',cls:'EMPIRICAL',metric:'e1RM coefficient of variation',baseline:median(cvs.map(function(c){return c.cv;})),per:cvs,n:cvs.length,note:'session-to-session e1RM noise; a decline smaller than this is not a decline'};}
    // maintenance history from snapshots (TDEE as estimated on each day)
    var snaps=(DB.snapshots||[]).filter(function(x){return x.date<=asOf()&&x.tdee!=null&&(x.tdeeCls==='EMPIRICAL'||x.tdeeCls==='CALIBRATED');});
    if(snaps.length>=7)out.streams.tdee={status:'ok',cls:'EMPIRICAL',metric:'estimated maintenance over time',baseline:median(snaps.map(function(x){return x.tdee;})),spread:mad(snaps.map(function(x){return x.tdee;})),n:snaps.length,first:snaps[0].date,last:snaps[snaps.length-1].date,latest:snaps[snaps.length-1].tdee};
    out.summary=Object.keys(out.streams).filter(function(k){return out.streams[k].status==='ok';}).length+' of '+(Object.keys(BASELINE_STREAMS).length+2)+' baselines established';
    return out;
  });
}
function recoveryBaselineDeviation(){ // the recovery model uses this to say "worse than usual for you" rather than only "above 7/10"
  var b=personalBaselines();var out=[];['sleep','fatigue','stress','soreness','hunger'].forEach(function(t){var s=b.streams[t];if(!s||s.status!=='ok'||s.z==null)return;var worse=(t==='sleep'?s.z<-1:s.z>1);if(worse)out.push({key:t,text:t+' '+(t==='sleep'?'below':'above')+' your usual by '+fmtNum(Math.abs(s.deviation),1)+(t==='sleep'?' h':' points')+' (baseline '+fmtNum(s.baseline,1)+')',z:s.z});});return out;}
/* ---- change points: "something changed around <date>" across streams, with the candidates that could explain it ---- */
function _cpOnSeries(s,minSeg,label,fmt){if(s.length<minSeg*2)return null;var cp=changePoint(s.map(function(d){return d.value;}),minSeg);if(!cp)return null;var d=s[cp.index].date;return {date:d,before:cp.before,after:cp.after,t:cp.t,text:label+' moved from '+fmt(cp.before)+' to '+fmt(cp.after)+' around '+shortDate(d)};}
function changePoints(days){
  days=days||56;
  return memo('changepoints:'+days+':'+asOf(),function(){
    var items=[];
    // weight: change in the 7-day rolling slope (a slope shift, not a level shift)
    var w=seriesWindow('weight',days);if(w.length>=20){var slopes=[];for(var i=6;i<w.length;i++){var win=w.slice(i-6,i+1).map(function(d){return {x:d.x,y:d.value};});var ts=theilSen(win);if(ts.slope!=null)slopes.push({date:w[i].date,value:ts.slope*7});}var cpw=_cpOnSeries(slopes,7,'weight trend',function(v){return fmtRate(v);});if(cpw){cpw.stream='weight';items.push(cpw);}}
    var st=seriesWindow('steps',days);var cps=_cpOnSeries(st,7,'steps',function(v){return fmtNum(v,0)+'/day';});if(cps){cps.stream='steps';items.push(cps);}
    var sl=seriesWindow('sleep',days);var cpsl=_cpOnSeries(sl,7,'sleep',function(v){return fmtH(v);});if(cpsl){cpsl.stream='sleep';items.push(cpsl);}
    var cal=seriesWindow('calories',days);var cpc=_cpOnSeries(cal,7,'intake',function(v){return fmtKcal(v);});if(cpc){cpc.stream='calories';items.push(cpc);}
    var fa=seriesWindow('fatigue',days);var cpf=_cpOnSeries(fa,5,'fatigue',function(v){return fmtNum(v,1)+'/10';});if(cpf){cpf.stream='fatigue';items.push(cpf);}
    var hu=seriesWindow('hunger',days);var cph=_cpOnSeries(hu,5,'hunger',function(v){return fmtNum(v,1)+'/10';});if(cph){cph.stream='hunger';items.push(cph);}
    // strength: best e1RM per session day across the most-exposed lift
    var stt=strengthTrend();if(stt.status==='ok'){var top=stt.per.filter(function(p){return p.status==='ok';}).sort(function(a,b){return b.n-a.n;})[0];if(top&&top.history.length>=10){var hs=top.history.map(function(h){return {date:h.date,value:h.best.value};});var cpst=_cpOnSeries(hs,4,top.exercise+' e1RM',function(v){return fmtNum(v,0);});if(cpst){cpst.stream='strength';items.push(cpst);}}}
    items.forEach(function(it){it.candidates=changeCandidates(it.date);it.attribution=attributeChange(it);});
    items.sort(function(a,b){return b.t-a.t;});
    return {items:items,days:days,cls:'DERIVED',note:'between-segment mean shift vs pooled spread (t>1.2); a change point is a question, not a cause'};
  });
}
/* candidates that could explain a change: interventions, phase starts, context tags and protocol changes within ±5 days */
function changeCandidates(date){
  var out=[];var lo=addDays(date,-5),hi=addDays(date,5);
  (DB.interventions||[]).forEach(function(i){if(i.date>=lo&&i.date<=hi&&_knownBy(i,asOf()))out.push({kind:'intervention',date:i.date,text:i.variable+(i.from!=null&&i.to!=null?' '+i.from+' \u2192 '+i.to:''),weight:3});});
  (DB.phases||[]).forEach(function(p){if(p.startDate>=lo&&p.startDate<=hi&&_knownBy(p,asOf()))out.push({kind:'phase',date:p.startDate,text:phaseLabel(p)+' started',weight:3});});
  obsOf('context').forEach(function(o){if(o.date>=lo&&o.date<=hi)out.push({kind:'context',date:o.date,text:o.value,weight:/new (scale|tape|program|gym|machine|food database|method)/i.test(o.value)?2.5:2});});
  protocolChanges(90).filter(function(p){return p.date>=lo&&p.date<=hi;}).forEach(function(p){out.push({kind:'protocol',date:p.date,text:p.text,weight:2.5});});
  var seen={};return out.filter(function(c){var k=c.kind+c.date+c.text;if(seen[k])return false;seen[k]=1;return true;}).sort(function(a,b){return b.weight-a.weight;});
}
/* ---- protocol-change detection: discontinuity markers that models must respect (they are not biology) ---- */
function protocolChanges(days){
  days=days||90;var from=addDays(asOf(),-days);var out=[];
  obsOf('context',{from:from}).forEach(function(o){var m=/new (scale|tape|program|gym|machine|food database|method|exercise|serving convention)/i.exec(o.value);if(m)out.push({kind:m[1].toLowerCase(),date:o.date,text:o.value,affects:{scale:['weight trend','TDEE'],tape:['waist trend','body composition'],program:['strength trend','training adherence'],gym:['strength trend'],machine:['strength trend'],'food database':['intake comparison','TDEE'],method:['body composition'],exercise:['strength trend'],'serving convention':['intake comparison']}[m[1].toLowerCase()]||[]});});
  // exercise variant first exposure inside the window (new lift = restarted history)
  var firstSeen={};sessionsOf().forEach(function(s){(s.sets||[]).forEach(function(x){var k=normExercise(x.exercise);if(k&&!firstSeen[k])firstSeen[k]=s.date;});});
  Object.keys(firstSeen).forEach(function(k){if(firstSeen[k]>=from&&sessionsOf().filter(function(s){return s.date<firstSeen[k];}).length>=3)out.push({kind:'exercise',date:firstSeen[k],text:'new exercise: '+k,affects:['strength trend for '+k]});});
  // body-fat method change
  var bf=obsOf('bodyfat');for(var i=1;i<bf.length;i++){if((bf[i].method||'')!==(bf[i-1].method||'')&&bf[i].date>=from)out.push({kind:'method',date:bf[i].date,text:'body-fat method changed: '+(bf[i-1].method||'?')+' \u2192 '+(bf[i].method||'?'),affects:['body composition (values are not comparable across methods)']});}
  return out.sort(function(a,b){return a.date<b.date?1:-1;});
}
/* ---- causal attribution for a change point: which candidate explains it, and how strongly ---- */
function attributeChange(cp){
  var c=cp.candidates||[];if(!c.length)return {strength:'unattributed',text:'no intervention, phase change, context tag or protocol change within \u00b15 days',ranked:[]};
  var ranked=c.map(function(x){var lag=Math.abs(daysBetween(x.date,cp.date));var score=x.weight-lag*0.3;var coherent=true;
    if(x.kind==='intervention'&&cp.stream==='weight'){var txt=String(x.text||'');if(/steps.*\u2192/.test(txt)||/calories.*\u2192/.test(txt))coherent=true;}
    if(x.kind==='protocol'||/new (scale|tape|machine|exercise|method)/i.test(x.text))return {cand:x,score:score+1,verdict:'measurement discontinuity, not a physiological change',lag:lag};
    return {cand:x,score:score,verdict:coherent?'plausible cause':'timing only',lag:lag};}).sort(function(a,b){return b.score-a.score;});
  var top=ranked[0];var strength=ranked.length===1?(top.lag<=2?'supported':'weakly supported'):(ranked[0].score-ranked[1].score>1?'weakly supported':'confounded');
  if(/discontinuity/.test(top.verdict))strength='artifact';
  return {strength:strength,text:top.cand.text+' ('+top.cand.kind+', '+(top.lag===0?'same day':top.lag+' days apart')+') \u2014 '+top.verdict,ranked:ranked,cls:'HEURISTIC'};
}
