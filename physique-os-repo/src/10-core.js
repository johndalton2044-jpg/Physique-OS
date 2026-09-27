/* ============================================================================
   REGION: CORE — version, error quarantine, dates, statistics, units, precision, freshness.
   Everything here is pure (no DOM) so it can be unit-tested and reused by replay/self-test.
   ============================================================================ */
'use strict';
var APP_NAME='Physique OS';
var APP_VERSION='1.0.0';
var SCHEMA_VERSION=2;
var SCHEMA_MIN_KNOWN=1; // oldest schema this build can migrate from; anything older is rejected, never guessed
/* SW_VERSION removed in H0: defined but never read (see docs/architecture/presentation-policies.md where it recorded a decision). */
/* DATA_VERSION removed in H0: defined but never read (see docs/architecture/presentation-policies.md where it recorded a decision). */
var BUILD_ID='__BUILD_ID__';        // hash of src/ — identifies the application code
var RELEASE_ID='__RELEASE_ID__';   // hash of every material build input (src, build.mjs, scripts, reference data, package config) — identifies the distribution and names the service-worker cache
var BUILD_TIME='__BUILD_TIME__';

/* ---- error quarantine: non-critical failures are recorded, never fatal ---- */
var _SWALLOWED={count:0,byMessage:{},recent:[],bySeverity:{},critical:[]};
/* Contained errors are classified, because a failed write and a failed chart are not the same event.
   P0 (data loss or corruption risk) is escalated to the user rather than merely counted — containment
   should keep the app usable, not hide the one class of failure that costs the record. */
function _q(e,severity){
  try{
    _SWALLOWED.count++;
    var msg=String((e&&e.message)||e||'unknown');
    var sev=(typeof severityOf==='function')?severityOf(e,severity):(severity||'P2');
    _SWALLOWED.bySeverity[sev]=(_SWALLOWED.bySeverity[sev]||0)+1;
    if(sev==='P0')_SWALLOWED.critical.push({at:Date.now(),message:msg.slice(0,200),severity:sev});
    if(_SWALLOWED.critical.length>20)_SWALLOWED.critical.shift();
    _SWALLOWED.byMessage[msg]=(_SWALLOWED.byMessage[msg]||0)+1;
    _SWALLOWED.recent.push({at:Date.now(),message:msg.slice(0,200),severity:sev,stack:(e&&e.stack)?String(e.stack).slice(0,400):null});
    if(_SWALLOWED.recent.length>40)_SWALLOWED.recent.shift();
    if(typeof PX_DEBUG!=='undefined'&&PX_DEBUG&&typeof console!=='undefined')console.warn('[quarantined]',msg);
  }catch(x){}
}
function getSwallowedErrors(){
  var top=Object.keys(_SWALLOWED.byMessage).sort(function(a,b){return _SWALLOWED.byMessage[b]-_SWALLOWED.byMessage[a];}).slice(0,5).map(function(m){return {message:m,count:_SWALLOWED.byMessage[m]};});
  return {count:_SWALLOWED.count,distinct:Object.keys(_SWALLOWED.byMessage).length,top:top,recent:_SWALLOWED.recent.slice(-8),
    bySeverity:_SWALLOWED.bySeverity,critical:_SWALLOWED.critical.slice(-5),
    note:_SWALLOWED.count?(_SWALLOWED.count+' error'+(_SWALLOWED.count===1?'':'s')+' caught and contained'+(top.length?(' — most common: '+top[0].message):'')):'nothing has failed quietly'};
}

/* ---- ids ---- */
var _idSeq=0;
function uid(prefix){_idSeq++;return (prefix||'id')+'-'+Date.now().toString(36)+'-'+(_idSeq).toString(36)+'-'+Math.random().toString(36).slice(2,6);}

/* ---- dates: ISO day strings internally, local display ---- */
function pad2(n){return String(n).padStart(2,'0');}
function isoDate(d){d=d||new Date();return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());}
var _NOW_OVERRIDE=null; // replay + tests can pin "today"
function todayISO(){return _NOW_OVERRIDE||isoDate(new Date());}
function nowISO(){return _NOW_OVERRIDE?(_NOW_OVERRIDE+'T12:00:00.000Z'):new Date().toISOString();}
function parseISO(s){if(!s)return null;var m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));if(!m)return null;return new Date(+m[1],+m[2]-1,+m[3]);}
function addDays(iso,n){var d=parseISO(iso);if(!d)return null;d.setDate(d.getDate()+n);return isoDate(d);}
function daysBetween(a,b){var da=parseISO(a),db=parseISO(b);if(!da||!db)return null;return Math.round((db-da)/86400000);}
/* A date is valid only if it survives a round trip. Date() silently ROLLS impossible dates over — 2026-13-45 becomes
   a day in February 2027 — so "it parses" accepted month 13, day 45, February 30 and February 29 of non-leap
   years. The release gate's invalid-date case found it. */
function isValidISO(s){
  var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));if(!m)return false;
  var y=+m[1],mo=+m[2],d=+m[3],t=new Date(Date.UTC(y,mo-1,d));
  return t.getUTCFullYear()===y&&t.getUTCMonth()===mo-1&&t.getUTCDate()===d;
}
var _MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var _DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function shortDate(iso){var d=parseISO(iso);if(!d)return '—';var now=parseISO(todayISO());var far=now&&Math.abs(d-now)>150*86400000;return _MON[d.getMonth()]+' '+d.getDate()+(far?' '+d.getFullYear():'');}
function longDate(iso){var d=parseISO(iso);if(!d)return '—';return _DOW[d.getDay()]+', '+_MON[d.getMonth()]+' '+d.getDate()+', '+d.getFullYear();}
function dowShort(iso){var d=parseISO(iso);return d?_DOW[d.getDay()]:'';}
function ageLabel(iso,asOf){
  var n=daysBetween(iso,asOf||todayISO());
  if(n==null)return 'undated';
  if(n<0)return 'future';
  if(n===0)return 'today';
  if(n===1)return 'yesterday';
  if(n<14)return n+'d ago';
  if(n<60)return Math.round(n/7)+'w ago';
  return Math.round(n/30)+'mo ago';
}
function weekOf(iso,startIso){var n=daysBetween(startIso,iso);return n==null?null:Math.floor(n/7)+1;}

/* ---- numbers ---- */
function num(v){if(v==null||v==='')return null;var n=parseFloat(v);return isFinite(n)?n:null;}
function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}
function round(v,dp){if(v==null||!isFinite(v))return null;var f=Math.pow(10,dp||0);return Math.round(v*f)/f;}
function roundTo(v,step){if(v==null||!isFinite(v))return null;return Math.round(v/step)*step;}
function fmtNum(v,dp){if(v==null||!isFinite(v))return '—';var s=round(v,dp).toFixed(dp||0);var parts=s.split('.');parts[0]=parts[0].replace(/\B(?=(\d{3})+(?!\d))/g,',');return parts.join('.');}
function fmtSigned(v,dp){if(v==null||!isFinite(v))return '—';var s=fmtNum(Math.abs(v),dp);return (v<0?'\u2212':(v>0?'+':''))+s;}
function fmtRange(lo,hi,dp,unit){if(lo==null||hi==null)return '—';return fmtNum(lo,dp)+'\u2013'+fmtNum(hi,dp)+(unit?(' '+unit):'');}
function fmtSignedRange(lo,hi,dp,unit){if(lo==null||hi==null)return '—';var a=Math.min(lo,hi),b=Math.max(lo,hi);var sa=fmtSigned(a,dp),sb=fmtSigned(b,dp);return sa+' to '+sb+(unit?(' '+unit):'');}
function fmtPct(v,dp){return v==null?'—':fmtNum(v,dp||0)+'%';}

/* ---- statistics engine ---- */
function mean(xs){xs=(xs||[]).filter(function(x){return x!=null&&isFinite(x);});if(!xs.length)return null;return xs.reduce(function(s,x){return s+x;},0)/xs.length;}
function median(xs){xs=(xs||[]).filter(function(x){return x!=null&&isFinite(x);}).slice().sort(function(a,b){return a-b;});if(!xs.length)return null;var m=xs.length>>1;return xs.length%2?xs[m]:(xs[m-1]+xs[m])/2;}
function sd(xs){xs=(xs||[]).filter(function(x){return x!=null&&isFinite(x);});if(xs.length<2)return null;var m=mean(xs);return Math.sqrt(xs.reduce(function(s,x){return s+(x-m)*(x-m);},0)/(xs.length-1));}
function mad(xs){var m=median(xs);if(m==null)return null;return median(xs.map(function(x){return Math.abs(x-m);}));}
function percentile(xs,p){xs=(xs||[]).filter(function(x){return x!=null&&isFinite(x);}).slice().sort(function(a,b){return a-b;});if(!xs.length)return null;var i=(xs.length-1)*p;var lo=Math.floor(i),hi=Math.ceil(i);return xs[lo]+(xs[hi]-xs[lo])*(i-lo);}
function ewma(xs,alpha){var out=[],prev=null;(xs||[]).forEach(function(x){if(x==null||!isFinite(x)){out.push(prev);return;}prev=prev==null?x:alpha*x+(1-alpha)*prev;out.push(prev);});return out;}
function rollingMean(xs,n){return (xs||[]).map(function(_,i){var w=xs.slice(Math.max(0,i-n+1),i+1).filter(function(v){return v!=null&&isFinite(v);});return w.length?mean(w):null;});}
// ordinary least squares on {x,y} points; x in days
function ols(pts){
  pts=(pts||[]).filter(function(p){return p&&p.x!=null&&p.y!=null&&isFinite(p.x)&&isFinite(p.y);});
  var n=pts.length;if(n<2)return {n:n,slope:null,intercept:null,r2:null,residSd:null,se:null};
  var mx=mean(pts.map(function(p){return p.x;})),my=mean(pts.map(function(p){return p.y;}));
  var sxx=0,sxy=0,syy=0;pts.forEach(function(p){sxx+=(p.x-mx)*(p.x-mx);sxy+=(p.x-mx)*(p.y-my);syy+=(p.y-my)*(p.y-my);});
  if(sxx===0)return {n:n,slope:0,intercept:my,r2:0,residSd:sd(pts.map(function(p){return p.y;})),se:null};
  var slope=sxy/sxx,intercept=my-slope*mx;
  var ssr=0;pts.forEach(function(p){var e=p.y-(intercept+slope*p.x);ssr+=e*e;});
  var r2=syy>0?1-ssr/syy:0;
  var residSd=n>2?Math.sqrt(ssr/(n-2)):null;
  var se=(residSd!=null&&sxx>0)?residSd/Math.sqrt(sxx):null;
  return {n:n,slope:slope,intercept:intercept,r2:r2,residSd:residSd,se:se,mx:mx,my:my};
}
// Theil–Sen: median of pairwise slopes. Robust to a few bad weigh-ins.
function theilSen(pts){
  pts=(pts||[]).filter(function(p){return p&&p.x!=null&&p.y!=null&&isFinite(p.x)&&isFinite(p.y);});
  var n=pts.length;if(n<2)return {n:n,slope:null,intercept:null};
  var slopes=[];for(var i=0;i<n;i++)for(var j=i+1;j<n;j++){var dx=pts[j].x-pts[i].x;if(dx!==0)slopes.push((pts[j].y-pts[i].y)/dx);}
  if(!slopes.length)return {n:n,slope:0,intercept:median(pts.map(function(p){return p.y;}))};
  var s=median(slopes);var b=median(pts.map(function(p){return p.y-s*p.x;}));
  return {n:n,slope:s,intercept:b};
}
function zScores(xs){var m=mean(xs),s=sd(xs);if(m==null||!s)return xs.map(function(){return 0;});return xs.map(function(x){return x==null?null:(x-m)/s;});}
function robustOutliers(xs,k){k=k||3.5;var m=median(xs),d=mad(xs);if(m==null||!d)return xs.map(function(){return false;});return xs.map(function(x){return x!=null&&Math.abs(0.6745*(x-m)/d)>k;});}
function correlation(xs,ys){var pts=[];for(var i=0;i<Math.min(xs.length,ys.length);i++){if(xs[i]!=null&&ys[i]!=null&&isFinite(xs[i])&&isFinite(ys[i]))pts.push([xs[i],ys[i]]);}if(pts.length<3)return {n:pts.length,r:null};var mx=mean(pts.map(function(p){return p[0];})),my=mean(pts.map(function(p){return p[1];}));var sxy=0,sxx=0,syy=0;pts.forEach(function(p){sxy+=(p[0]-mx)*(p[1]-my);sxx+=(p[0]-mx)*(p[0]-mx);syy+=(p[1]-my)*(p[1]-my);});if(!sxx||!syy)return {n:pts.length,r:0};return {n:pts.length,r:sxy/Math.sqrt(sxx*syy)};}
// simplest useful change-point: index maximizing between-segment mean difference vs pooled sd
function changePoint(xs,minSeg){minSeg=minSeg||5;var best=null;if(!xs||xs.length<minSeg*2)return null;var s=sd(xs)||1;for(var i=minSeg;i<=xs.length-minSeg;i++){var a=mean(xs.slice(0,i)),b=mean(xs.slice(i));var t=Math.abs(a-b)/s;if(!best||t>best.t)best={index:i,t:t,before:a,after:b};}return best&&best.t>1.2?best:null;}
// shrinkage toward a prior: n observations of `obs` vs prior with weight k
function shrink(obs,n,prior,k){if(obs==null||!n)return prior;return (n*obs+k*prior)/(n+k);}

/* ---- units: canonical lb / in / kcal / g; metric only at display ---- */
var LB_PER_KG=2.2046226218,IN_PER_CM=0.3937007874;
function lbToKg(lb){return lb==null?null:lb/LB_PER_KG;}
function kgToLb(kg){return kg==null?null:kg*LB_PER_KG;}
function inToCm(i){return i==null?null:i/IN_PER_CM;}
function cmToIn(c){return c==null?null:c*IN_PER_CM;}
function unitPref(){try{return (DB&&DB.settings&&DB.settings.units)||'imperial';}catch(e){return 'imperial';}}
function fmtWeight(lb,opts){opts=opts||{};if(lb==null||!isFinite(lb))return '—';if(unitPref()==='metric')return fmtNum(lbToKg(lb),1)+(opts.bare?'':' kg');return fmtNum(lb,1)+(opts.bare?'':' lb');}
function weightUnit(){return unitPref()==='metric'?'kg':'lb';}
function lengthUnit(){return unitPref()==='metric'?'cm':'in';}
function fmtLength(inch,opts){opts=opts||{};if(inch==null||!isFinite(inch))return '—';if(unitPref()==='metric')return fmtNum(inToCm(inch),1)+(opts.bare?'':' cm');return fmtNum(inch,1)+(opts.bare?'':' in');}
function fmtRate(lbPerWk,opts){opts=opts||{};if(lbPerWk==null||!isFinite(lbPerWk))return '—';var v=unitPref()==='metric'?lbToKg(lbPerWk):lbPerWk;return fmtSigned(v,opts.dp!=null?opts.dp:(unitPref()==='metric'?2:1))+(opts.bare?'':(' '+weightUnit()+'/wk'));}
function fmtRateRange(lo,hi,opts){opts=opts||{};if(lo==null||hi==null)return '—';var a=unitPref()==='metric'?lbToKg(lo):lo,b=unitPref()==='metric'?lbToKg(hi):hi;return fmtSignedRange(a,b,unitPref()==='metric'?2:1,opts.bare?'':(weightUnit()+'/wk'));}
function fmtKcal(v,opts){opts=opts||{};if(v==null||!isFinite(v))return '—';var r=opts.estimate?roundTo(v,10):Math.round(v);return (opts.approx?'\u2248':'')+fmtNum(r,0)+(opts.bare?'':' kcal');}
function fmtG(v,dp){return v==null?'—':fmtNum(v,dp||0)+' g';}
function fmtH(v){return v==null?'—':fmtNum(v,1)+' h';}
function fmtMin(v){return v==null?'—':fmtNum(v,0)+' min';}
function fmtHeight(inch){if(inch==null)return '—';if(unitPref()==='metric')return fmtNum(inToCm(inch),0)+' cm';var ft=Math.floor(inch/12),rem=Math.round(inch-ft*12);return ft+'\u2032'+rem+'\u2033';}
function toCanonicalWeight(v){var n=num(v);if(n==null)return null;return unitPref()==='metric'?kgToLb(n):n;}
function toCanonicalLength(v){var n=num(v);if(n==null)return null;return unitPref()==='metric'?cmToIn(n):n;}
function fromCanonicalWeight(lb){if(lb==null)return null;return unitPref()==='metric'?round(lbToKg(lb),1):round(lb,1);}
function fromCanonicalLength(i){if(i==null)return null;return unitPref()==='metric'?round(inToCm(i),1):round(i,1);}

/* ---- freshness: domain-aware aging, in days. fresh ≤ f, aging ≤ a, else stale ---- */
var FRESHNESS={
  weight:{fresh:1,aging:3},waist:{fresh:7,aging:14},neck:{fresh:14,aging:30},hip:{fresh:14,aging:30},chest:{fresh:14,aging:30},arm:{fresh:14,aging:30},thigh:{fresh:14,aging:30},
  bodyfat:{fresh:30,aging:60},rhr:{fresh:3,aging:10},
  calories:{fresh:0,aging:2},protein:{fresh:0,aging:2},carbs:{fresh:0,aging:2},fat:{fresh:0,aging:2},fiber:{fresh:0,aging:2},water:{fresh:0,aging:2},adherence:{fresh:0,aging:2},
  hunger:{fresh:1,aging:3},fullness:{fresh:1,aging:3},cravings:{fresh:1,aging:3},difficulty:{fresh:1,aging:3},
  steps:{fresh:0,aging:2},cardio:{fresh:3,aging:7},
  sleep:{fresh:1,aging:3},sleepq:{fresh:1,aging:3},fatigue:{fresh:1,aging:3},stress:{fresh:1,aging:3},soreness:{fresh:1,aging:3},motivation:{fresh:1,aging:3},
  training:{fresh:3,aging:7},supplement:{fresh:1,aging:3},note:{fresh:7,aging:30},context:{fresh:7,aging:30},
  tdee:{fresh:7,aging:14},decision:{fresh:7,aging:14}
};
function freshness(type,iso,asOf){
  var t=FRESHNESS[type]||{fresh:1,aging:3};var n=daysBetween(iso,asOf||todayISO());
  if(n==null)return {state:'unknown',days:null,label:'undated'};
  var state=n<=t.fresh?'fresh':(n<=t.aging?'aging':'stale');
  return {state:state,days:n,label:ageLabel(iso,asOf)};
}
function ageHtml(type,iso,asOf){var f=freshness(type,iso,asOf);var cls=f.state==='aging'?'age-aging':(f.state==='stale'?'age-stale':'');return '<span class="'+cls+'">'+f.label+(f.state==='aging'?' \u00b7 aging':(f.state==='stale'?' \u00b7 stale':''))+'</span>';}

/* ---- confidence vocabulary: evidence-based, never decorative ---- */
var CONF_ORDER=['insufficient','low','medium','high'];
function confRank(c){var i=CONF_ORDER.indexOf(c);return i<0?0:i;}
function minConf(a,b){return CONF_ORDER[Math.min(confRank(a),confRank(b))];}
function confLabel(c){return c==='insufficient'?'insufficient data':(c||'—')+' confidence';}
function confTone(c){return c==='high'?'good':(c==='medium'?'neutral':(c==='low'?'attention':'negative'));}

/* ---- html escaping ---- */
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function attrEsc(s){return esc(s);}
