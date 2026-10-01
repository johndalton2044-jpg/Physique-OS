/* ============================================================================
   PHYSIQUE INTELLIGENCE (audit §24, §90, §91, phase 8), as extensions of movement, response, body composition and
   decision \u2014 not a hypertrophy equation. Body-region exposure \u2192 longitudinal regional outcome (strength of the region's
   primary exercises; its circumference where measured) \u2192 status (under-trained, lagging, over-served, on track) \u2192
   priorities and allocation \u2192 rate control \u2192 body composition per method, never mixed across methods.
   Ranges are stated with their source: about 10\u201320 hard sets a week per muscle and at least two sessions a week
   (dose\u2013response meta-analyses, e.g. Schoenfeld 2017; Pelland 2024 finds diminishing returns rather than a ceiling).
   ============================================================================ */
var PHYSIQUE_RANGE={setsLow:10,setsHigh:20,minFrequency:2,source:'dose\u2013response meta-analyses (Schoenfeld 2017; Pelland 2024): about 10\u201320 hard sets a week, at least twice a week'};
var REGION_MEASURE={chest:'chest',biceps:'arm',triceps:'arm',quads:'thigh',hamstrings:'thigh',glutes:'hip'};
var BODYFAT_METHOD_SE={DEXA:1.5,'Bod Pod':2,hydrostatic:2,calipers:3,'BIA scale':3.5,'visual estimate':4,other:4,unspecified:4};
function _setsByMuscle(from,to){var out={},freq={};sessionsOf({from:from}).filter(function(s){return s.date<=to;}).forEach(function(s){var seen={};
  (s.sets||[]).forEach(function(x){var e=resolveExercise(x.exercise);if(!e)return;e.primary.forEach(function(m){out[m]=(out[m]||0)+1;seen[m]=1;});e.secondary.forEach(function(m){out[m]=(out[m]||0)+0.5;});});
  Object.keys(seen).forEach(function(m){freq[m]=(freq[m]||0)+1;});});return {sets:out,freq:freq};}
function regionalExposure(weeks){weeks=weeks||8;var W=[];for(var k=0;k<weeks;k++){var to=addDays(todayISO(),-7*k),from=addDays(to,-6);W.push(_setsByMuscle(from,to));}
  var keys={};W.forEach(function(w){Object.keys(w.sets).forEach(function(m){keys[m]=1;});});
  var out={};Object.keys(keys).forEach(function(m){var s=W.map(function(w){return w.sets[m]||0;}),f=W.map(function(w){return w.freq[m]||0;});
    out[m]={weekly:s,recentSets:round(mean(s.slice(0,4)),1),recentFrequency:round(mean(f.slice(0,4)),1)};});return out;}
/* strength of a region: each primary exercise's e1RM relative to its own start, pooled by precision (% per month) */
function regionalStrength(muscle,weeks){weeks=weeks||12;var from=addDays(todayISO(),-7*weeks),by={};
  sessionsOf({from:from}).forEach(function(s){(s.sets||[]).forEach(function(x){var e=resolveExercise(x.exercise);if(!e||e.primary.indexOf(muscle)<0||!x.load||!x.reps)return;
    var v=x.load*(1+x.reps/30);(by[e.name]=by[e.name]||{})[s.date]=Math.max((by[e.name]||{})[s.date]||0,v);});});
  var est=[];Object.keys(by).forEach(function(n){var d=Object.keys(by[n]).sort();if(d.length<4)return;var base=by[n][d[0]];
    var S=d.map(function(dd){return {date:dd,value:100*by[n][dd]/base};}),f=_slopePerWeek(S);if(f)est.push({exercise:n,slope:f.slope*30/7,se:f.se*30/7,n:d.length});});
  if(!est.length)return null;var w=est.map(function(e){return 1/Math.max(1e-6,e.se*e.se);}),sw=w.reduce(function(a,b){return a+b;},0);
  return {pctPerMonth:round(est.reduce(function(a,e,i){return a+e.slope*w[i];},0)/sw,2),se:round(Math.sqrt(1/sw),2),exercises:est.map(function(e){return e.exercise;})};}
function regionalSize(muscle){var t=REGION_MEASURE[muscle];if(!t)return null;var S=obsOf(t).slice(-12).map(function(o){return {date:o.date,value:o.value};});var f=_slopePerWeek(S);
  return f?{measure:t,perMonth:round(f.slope*30/7,2),se:round(Math.max(f.se,0.2)*30/7,2),n:S.length,note:'tape error is about 0.5 cm a reading; a limb also grows with fat'}:{measure:t,status:'not measured'};}
function physiquePriorities(){return (DB.settings.physiquePriorities||[]).filter(function(m){return MUSCLE_GROUPS[m];}).slice(0,3);}
function physiqueModel(){
  var X=regionalExposure(8),pri=physiquePriorities(),regions=Object.keys(X).concat(pri.filter(function(m){return !X[m];}));
  var rows=regions.map(function(m){var x=X[m]||{recentSets:0,recentFrequency:0},st=regionalStrength(m),sz=regionalSize(m);
    return {muscle:m,label:MUSCLE_GROUPS[m]||m,priority:pri.indexOf(m)>=0,sets:x.recentSets,frequency:x.recentFrequency,strength:st,size:sz};});
  var trained=rows.filter(function(r){return r.strength&&r.sets>=PHYSIQUE_RANGE.setsLow;}),med=trained.length>=3?_medianOf(trained.map(function(r){return r.strength.pctPerMonth;})):null;
  rows.forEach(function(r){
    if(r.sets<(r.priority?PHYSIQUE_RANGE.setsLow:6))r.status='under-trained';
    else if(r.sets>PHYSIQUE_RANGE.setsHigh&&!r.priority)r.status='over-served';
    else if(r.strength&&med!=null&&r.strength.pctPerMonth<med-2*Math.max(r.strength.se,0.25))r.status=r.sets>=PHYSIQUE_RANGE.setsLow?'lagging':'under-trained';
      /* slower with fewer than 10 sets cannot be told apart from under-training: never "lagging", never "on track" */
    else r.status=r.strength?'on track':'unknown';
    r.why=r.status==='under-trained'?(r.sets>=6&&!r.priority?r.sets+' sets a week: progressing slower than your other regions, but with too few sets to tell a weak point from under-training':r.sets+' sets a week is below what can be judged ('+(r.priority?PHYSIQUE_RANGE.setsLow:6)+')'):
      (r.status==='lagging'?'enough sets ('+r.sets+'/week), yet strength is rising '+r.strength.pctPerMonth+'% a month against '+round(med,2)+'% for your other regions':
      (r.status==='over-served'?r.sets+' sets a week, above the range, and not a priority':(r.status==='on track'?'progressing in line with your other regions':'no strength record for this region yet')));});
  /* allocation: priorities and lagging regions first, taking sets from over-served regions */
  var need=rows.filter(function(r){return (r.priority||r.status==='lagging')&&r.sets<PHYSIQUE_RANGE.setsHigh;}),donors=rows.filter(function(r){return r.status==='over-served';}),sugg=[];
  need.forEach(function(r){var add=Math.max(2,Math.min(4,Math.round(PHYSIQUE_RANGE.setsLow+4-r.sets)));if(r.sets>=PHYSIQUE_RANGE.setsLow+4&&r.status!=='lagging')return;
    sugg.push({muscle:r.muscle,text:'add '+add+' sets a week for '+r.label+(r.frequency<PHYSIQUE_RANGE.minFrequency?', across two sessions':'')+(donors.length?' (take them from '+donors.map(function(d){return d.label;}).join(', ')+')':''),why:r.status==='lagging'?r.why:'a priority'});});
  rows.filter(function(r){return r.priority&&r.frequency<PHYSIQUE_RANGE.minFrequency&&r.sets>=PHYSIQUE_RANGE.setsLow;}).forEach(function(r){sugg.push({muscle:r.muscle,text:'split '+r.label+' across at least two sessions a week',why:'trained '+r.frequency+' times a week'});});
  return {status:'ok',cls:'EMPIRICAL',regions:rows.sort(function(a,b){return (b.priority-a.priority)||(b.sets-a.sets);}),suggestions:sugg,redundancy:exerciseRedundancy(28),rate:physiqueRate(),bodyComposition:bodyCompositionByMethod(),
    range:PHYSIQUE_RANGE,limits:'Strength is a proxy for size, and a limb also grows with fat. "Lagging" compares your regions with each other, needs three trained regions, and only applies to a region with enough sets.'};}
/* three or more different exercises with the same pattern for the same main muscle in four weeks */
function exerciseRedundancy(days){var by={};sessionsOf({from:addDays(todayISO(),-(days||28))}).forEach(function(s){(s.sets||[]).forEach(function(x){var e=resolveExercise(x.exercise);if(!e||!e.primary.length)return;
  var k=e.primary[0]+'|'+e.pattern;(by[k]=by[k]||{})[e.name]=1;});});
  return Object.keys(by).filter(function(k){return Object.keys(by[k]).length>=3;}).map(function(k){var p=k.split('|');return {muscle:p[0],pattern:p[1],exercises:Object.keys(by[k]),note:Object.keys(by[k]).length+' '+p[1]+' exercises for '+(MUSCLE_GROUPS[p[0]]||p[0])+': one or two may be enough'};});}
/* rate control: the weight trend as a share of body weight, against the phase's range */
function physiqueRate(){var ph=typeof activePhase==='function'?activePhase():(DB.phases||[]).slice(-1)[0],S=seriesWindow('weight',21),f=_slopePerWeek(S),w=S.length?S[S.length-1].value:null;
  if(!f||!w)return {status:'insufficient'};var pct=100*f.slope/w,type=ph?ph.type:'maintenance',R={cut:[-1.0,-0.5],bulk:[0.1,0.25],maintenance:[-0.1,0.1]}[type]||[-0.1,0.1];
  /* worded by direction of travel: for a cut, "above -0.5%" is slower, not higher */
  var state=type==='cut'?(pct<R[0]?'faster than the range: more muscle at risk':(pct>R[1]?'slower than the range':'within the range')):
    (type==='bulk'?(pct>R[1]?'faster than the range: more of the gain is fat':(pct<R[0]?'slower than the range':'within the range')):(pct<R[0]||pct>R[1]?'drifting outside maintenance':'within the range'));
  return {status:'ok',phase:type,pctPerWeek:round(pct,2),se:round(100*f.se/w,2),range:R,state:state,basis:'cut 0.5\u20131% of body weight a week; lean gain 0.1\u20130.25% a week (about 0.5\u20131% a month); maintenance within \u00b10.1%'};}
/* body composition, one trend per method; methods are compared by their offset on near dates, never mixed */
function bodyCompositionByMethod(){var by={};obsOf('bodyfat').forEach(function(o){var m=o.method||(o.meta&&o.meta.method)||'unspecified';(by[m]=by[m]||[]).push(o);});
  var wAt=function(d){var W=obsOf('weight').filter(function(o){return Math.abs(daysBetween(o.date,d))<=3;});return W.length?W[W.length-1].value:null;};
  var methods=Object.keys(by).map(function(m){var L=by[m].slice().sort(function(a,b){return a.date<b.date?-1:1;}),se=BODYFAT_METHOD_SE[m]||4,f=_slopePerWeek(L.map(function(o){return {date:o.date,value:o.value};}));
    var pts=L.map(function(o){var w=wAt(o.date);return w?{date:o.date,bf:o.value,lean:round(w*(1-o.value/100),1),fat:round(w*o.value/100,1)}:{date:o.date,bf:o.value};});
    var lf=_slopePerWeek(pts.filter(function(p){return p.lean!=null;}).map(function(p){return {date:p.date,value:p.lean};}));
    return {method:m,n:L.length,latest:L[L.length-1].value,errorPct:se,trendPerMonth:f?round(f.slope*30/7,2):null,leanPerMonth:lf?round(lf.slope*30/7,2):null,points:pts.slice(-6),
      note:L.length<3?'too few readings for a trend':'a single reading is \u00b1'+se+' percentage points'};});
  var offsets=[];for(var i=0;i<methods.length;i++)for(var j=i+1;j<methods.length;j++){var a=by[methods[i].method],b=by[methods[j].method],d=[];
    a.forEach(function(x){b.forEach(function(y){if(Math.abs(daysBetween(x.date,y.date))<=7)d.push(x.value-y.value);});});if(d.length)offsets.push({between:[methods[i].method,methods[j].method],offset:round(mean(d),1),pairs:d.length});}
  return {methods:methods,offsets:offsets,rule:'each method is trended only against itself; methods differ by a steady offset, which is shown, not corrected away',unspecified:!!by.unspecified};}
(function(){if(typeof MODELS==='undefined'||MODELS.some(function(m){return m.id==='physique_regions';}))return;
  MODELS.push({id:'physique_regions',name:'Physique by region',cls:'EMPIRICAL',version:'1.0',inputs:['waist','bodyfat','weight'],minN:4,
    assumes:['strength progress stands in for growth','regions are comparable with each other'],failsWhen:['fewer than three trained regions','too few sessions per exercise','circumference changes that are fat, not muscle'],
    output:'per region: exposure, strength and size trends, status, and where to add or take sets',consumers:['physiqueCard'],freshnessDays:7,uncertainty:{kind:'standard error of each trend'},fn:'physiqueModel'});})();
