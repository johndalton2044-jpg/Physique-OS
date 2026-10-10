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
var BODYFAT_METHOD_SE={DEXA:1.5,'Bod Pod':2,hydrostatic:2,calipers:3,'BIA scale':3.5,circumference:3.5,'visual estimate':4,other:4,unspecified:4};
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
  /* HIERARCHICAL PERSONALISATION (Stage E; TRANSITION item 5): each region's strength trend borrows from the person's
     other regions (hierarchicalPosterior over the trained regions), so a region measured on few sessions is pulled toward
     the person's own typical rate before it is called lagging; a precisely measured slow region stays slow. */
  var pool=trained.length>=3?poolRegionalTrends(trained.map(function(r){return {id:r.muscle,value:r.strength.pctPerMonth,sd:r.strength.se};})):null;
  if(pool)rows.forEach(function(r){var p=pool.byId[r.muscle];if(p&&r.strength)r.strength.pooled=p;});
  rows.forEach(function(r){
    if(r.sets<(r.priority?PHYSIQUE_RANGE.setsLow:6))r.status='under-trained';
    else if(r.sets>PHYSIQUE_RANGE.setsHigh&&!r.priority)r.status='over-served';
    else if(r.strength&&med!=null&&(r.strength.pooled?r.strength.pooled.lagging:r.strength.pctPerMonth<med-2*Math.max(r.strength.se,0.25)))r.status=r.sets>=PHYSIQUE_RANGE.setsLow?'lagging':'under-trained';
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
/* The pooled trends: each region's posterior and its sd, the person's typical rate (the hyper-mean), and whether the region
   is clearly below it (posterior + 2 sd under the hyper-mean). Units are {id, value: % a month, sd}; an sd under 0.25 is
   taken as 0.25, the floor the unpooled rule uses. */
function poolRegionalTrends(units){
  var U=units.map(function(u){return {id:u.id,value:u.value,sd:Math.max(u.sd||0,0.25)};});
  var H=hierarchicalPosterior(U);if(H.status!=='ok')return null;
  var byId={};H.rows.forEach(function(r){byId[r.id]={mean:r.posterior,sd:r.posteriorSd,raw:r.raw,typical:H.hyperMean,lagging:r.posterior+2*r.posteriorSd<H.hyperMean};});
  return {byId:byId,typical:H.hyperMean,spread:H.tau,method:'hierarchical posterior across the person\u2019s trained regions'};}
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
/* ============================================================================
   BODY-COMPOSITION LATENT STATE (Stage D; TRANSITION item 2). Fat and lean trajectories, each with its uncertainty, from
   everything that bears on them, through the one Bayesian engine (bayesUpdate). The unknown is the fat-mass rate (lb a
   week). Its prior is the share of the weight trend that is fat (tissueEnergyDensity: body-fat level, rate of loss,
   protein, lifting), moved toward lean by the muscle-retention risk in a cut. Each body-fat method's own fat-mass slope is
   an observation weighted by that method's error (BODYFAT_METHOD_SE), never mixed with another method's readings, so a
   fixed offset between methods cannot read as change; the waist enters as one more method through the circumference
   equation, as a change, not a level. Lean is the remainder, weight trend minus fat rate, its interval taken as if the
   two were independent, which is wider than the truth. Masses, not only rates, are given only when a measured reading
   from the last 60 days anchors them, the rule bodyComp() follows. Limits, stated: the scale moves with water and gut
   content, so the rate needs weeks before it means much; no method here is calibrated against another.
   ============================================================================ */
/* the partition range tissueEnergyDensity states (\u00b10.15) is taken as one standard deviation: partitioning cannot be
   measured from the record, so the prior should not be more certain than its own stated range */
var BCS_SHARE_SD=0.15;
/* a slope in lb a week from {date, fat} points, its standard error floored by the method's error per reading */
function _bcsSlope(points,sigma){if(points.length<3)return null;var t0=points[0].date,xs=points.map(function(p){return daysBetween(t0,p.date)/7;}),ys=points.map(function(p){return p.fat;});
  var mx=mean(xs),my=mean(ys),sxx=0,sxy=0;xs.forEach(function(x,i){sxx+=(x-mx)*(x-mx);sxy+=(x-mx)*(ys[i]-my);});if(xs[xs.length-1]-xs[0]<2||!sxx)return null;
  var b=sxy/sxx,res=0;xs.forEach(function(x,i){var e=ys[i]-my-b*(x-mx);res+=e*e;});var s2=Math.max(res/Math.max(1,xs.length-2),sigma*sigma);
  return {slope:b,se:Math.sqrt(s2/sxx),n:points.length,weeks:round(xs[xs.length-1]-xs[0],1)};}
function _bcsInputs(){
  var tr=weightTrend(56);if(!tr||tr.status!=='ok')return {need:'a weight trend over the last 8 weeks'};
  var dW=tr.slopePerWeek,share={mean:0.5,sd:0.2,basis:'gaining: no reliable population split, so a wide prior around half'};
  if(dW<0){var T=tissueEnergyDensity(),s=T&&T.status==='ok'?T.fatShare:0.75,why=T&&T.reasons?T.reasons.slice():[];
    var M=null;try{M=muscleRetentionRisk();}catch(e){}
    if(M&&M.status==='ok'&&M.level!=='low'){s-=M.level==='high'?0.10:0.05;why.push('muscle-retention risk '+M.level);}
    share={mean:clamp(s,0.45,0.95),sd:BCS_SHARE_SD,basis:'the fat share of a loss: '+why.join('; ')};}
  var wAt=function(d){var W=obsOf('weight').filter(function(o){return !o.retracted&&Math.abs(daysBetween(o.date,d))<=3;});return W.length?W[W.length-1].value:null;};
  var from=addDays(asOf(),-84),by={};
  obsOf('bodyfat').filter(function(o){return !o.retracted&&o.date>=from;}).forEach(function(o){var raw=o.method||(o.meta&&o.meta.method)||'unspecified',m=BODYFAT_METHOD_NAME[String(raw).toLowerCase()]||raw,w=wAt(o.date);
    if(w)(by[m]=by[m]||[]).push({date:o.date,fat:w*o.value/100,bf:o.value});});
  var p=prof();
  if(!by.circumference&&p.heightIn&&(p.sex!=='female'||latestObs('hip'))){var neck=latestObs('neck'),hip=latestObs('hip');
    if(neck)obsOf('waist').filter(function(o){return !o.retracted&&o.date>=from;}).forEach(function(o){var w=wAt(o.date);if(!w)return;
      var bf=navyBodyFat(p.sex,p.heightIn,o.value,neck.value,hip?hip.value:null);if(isFinite(bf))(by.circumference=by.circumference||[]).push({date:o.date,fat:w*bf/100,bf:bf,fromWaist:true});});}
  var W7=seriesWindow('weight',7).map(function(x){return x.value;}),wNow=W7.length?mean(W7):null;
  var methods=Object.keys(by).map(function(m){return {method:m,se:BODYFAT_METHOD_SE[m]||4,points:by[m].sort(function(a,b){return a.date<b.date?-1:1;})};});
  var meas=obsOf('bodyfat').filter(function(o){return !o.retracted&&daysBetween(o.date,asOf())<=60;}).slice(-1)[0],anchor=null;
  if(meas&&wNow){var mm=BODYFAT_METHOD_NAME[String(meas.method||'').toLowerCase()]||meas.method||'unspecified';anchor={bf:meas.value,method:mm,date:meas.date,se:BODYFAT_METHOD_SE[mm]||4,weight:wNow};}
  return {trend:{slope:dW,se:tr.slopeSe!=null?tr.slopeSe:Math.abs(dW)*0.5},share:share,methods:methods,anchor:anchor};
}
function bodyCompositionState(inp){
  var D=inp||_bcsInputs();if(!D.trend)return {status:'insufficient',need:D.need||'a weight trend'};
  var dW=D.trend.slope,seW=D.trend.se,s0=D.share.mean,sdS=D.share.sd;
  var prior={mean:s0*dW,sd:Math.sqrt(Math.pow(sdS*dW,2)+Math.pow(s0*seW,2)+0.05*0.05)};
  var wRef=D.anchor?D.anchor.weight:null;
  var used=(D.methods||[]).map(function(m){var w=wRef||mean(m.points.map(function(p){return p.fat/(p.bf/100);})),f=_bcsSlope(m.points,w*m.se/100);
    return f?{method:m.method,fromWaist:!!(m.points[0]&&m.points[0].fromWaist),value:f.slope,sd:f.se,n:f.n,weeks:f.weeks}:null;}).filter(Boolean);
  var B=bayesUpdate({prior:prior,observations:used.map(function(u){return {value:u.value,sd:u.sd};})});
  var dF=B.mean,sdF=B.sd,dL=dW-dF,sdL=Math.sqrt(seW*seW+sdF*sdF);
  var iv=function(m,s){return {mean:round(m,2),sd:round(s,2),lo:round(m-1.96*s,2),hi:round(m+1.96*s,2)};};
  var out={status:'ok',cls:used.length?(B.cls||'BLENDED'):'PRIOR',weightRate:iv(dW,seW),fatRate:iv(dF,sdF),leanRate:iv(dL,sdL),measuredShare:B.weightOnData||0,prior:{fatShare:round(s0,2),basis:D.share.basis},
    methods:used.map(function(u){return {method:u.method,fromWaist:u.fromWaist,fatPerWeek:round(u.value,2),sd:round(u.sd,2),n:u.n,weeks:u.weeks};}),anchored:!!D.anchor,masses:null,trajectory:[],
    limits:'the scale moves with water and gut content, so the rate needs weeks before it means much; methods are not calibrated against each other, so each is read only for its own change; lean\u2019s interval treats it as independent of the fat rate, which is wider than the truth'};
  if(D.anchor){var F0=D.anchor.weight*D.anchor.bf/100,sF0=D.anchor.weight*D.anchor.se/100,L0=D.anchor.weight-F0;
    out.masses={fat:iv(F0,sF0),lean:iv(L0,sF0),from:D.anchor.method+' on '+D.anchor.date};
    for(var t=-8;t<=4;t+=2)out.trajectory.push({weeksFromNow:t,fat:iv(F0+dF*t,Math.sqrt(sF0*sF0+Math.pow(sdF*t,2))),lean:iv(L0+dL*t,Math.sqrt(sF0*sF0+Math.pow(sdL*t,2)))});}
  out.reading=(used.length?('fat '+(dF>0?'+':'')+round(dF,2)+' lb a week ('+out.fatRate.lo+' to '+out.fatRate.hi+'), lean '+(dL>0?'+':'')+round(dL,2)+' ('+out.leanRate.lo+' to '+out.leanRate.hi+'); '+Math.round(out.measuredShare*100)+'% from '+used.map(function(u){return u.method;}).join(', ')):
    ('no body-fat measurements in the last 12 weeks: the split of the weight trend is the population assumption ('+D.share.basis+')'));
  return out;
}
(function(){if(typeof MODELS==='undefined'||_registryTaken(MODELS,'MODELS','body_composition_state'))return;
  MODELS.push({id:'body_composition_state',name:'Body-composition latent state',cls:'EMPIRICAL',version:'1.0',inputs:['weight_trend','bodyfat','waist','muscle_risk'],minN:1,
    assumes:['a method\u2019s error is the same at every reading','a method\u2019s offset from the truth is constant, so its change is meaningful','the fat share of a loss follows the partition prior unless measurements say otherwise'],
    failsWhen:['large water shifts within the window','a method used under different conditions each time (BIA after a meal or a workout)','a new device or technician part-way through'],
    output:'fat and lean rates (lb a week) with intervals, how much rests on measurement, and fat and lean masses with trajectories when a recent measurement anchors them',
    consumers:['physiqueCard','stateVector'],freshnessDays:14,uncertainty:{kind:'posterior interval on the fat rate; lean by subtraction'},fn:'bodyCompositionState'});})();
/* body composition, one trend per method; methods are compared by their offset on near dates, never mixed */
/* the form saves dexa/bia/calipers/bodpod/navy/other: mapped to the method names whose errors are known */
var BODYFAT_METHOD_NAME={dexa:'DEXA',bia:'BIA scale',calipers:'calipers',bodpod:'Bod Pod',navy:'circumference',other:'other',hydrostatic:'hydrostatic',visual:'visual estimate'};
function bodyCompositionByMethod(){var by={};obsOf('bodyfat').forEach(function(o){var raw=o.method||(o.meta&&o.meta.method)||'unspecified',m=BODYFAT_METHOD_NAME[String(raw).toLowerCase()]||raw;(by[m]=by[m]||[]).push(o);});
  var wAt=function(d){var W=obsOf('weight').filter(function(o){return Math.abs(daysBetween(o.date,d))<=3;});return W.length?W[W.length-1].value:null;};
  var methods=Object.keys(by).map(function(m){var L=by[m].slice().sort(function(a,b){return a.date<b.date?-1:1;}),se=BODYFAT_METHOD_SE[m]||4,f=_slopePerWeek(L.map(function(o){return {date:o.date,value:o.value};}));
    var pts=L.map(function(o){var w=wAt(o.date);return w?{date:o.date,bf:o.value,lean:round(w*(1-o.value/100),1),fat:round(w*o.value/100,1)}:{date:o.date,bf:o.value};});
    var lf=_slopePerWeek(pts.filter(function(p){return p.lean!=null;}).map(function(p){return {date:p.date,value:p.lean};}));
    return {method:m,n:L.length,latest:L[L.length-1].value,errorPct:se,trendPerMonth:f?round(f.slope*30/7,2):null,leanPerMonth:lf?round(lf.slope*30/7,2):null,points:pts.slice(-6),
      note:L.length<3?'too few readings for a trend':'a single reading is \u00b1'+se+' percentage points'};});
  var offsets=[];for(var i=0;i<methods.length;i++)for(var j=i+1;j<methods.length;j++){var a=by[methods[i].method],b=by[methods[j].method],d=[];
    a.forEach(function(x){b.forEach(function(y){if(Math.abs(daysBetween(x.date,y.date))<=7)d.push(x.value-y.value);});});if(d.length)offsets.push({between:[methods[i].method,methods[j].method],offset:round(mean(d),1),pairs:d.length});}
  return {methods:methods,offsets:offsets,rule:'each method is trended only against itself; methods differ by a steady offset, which is shown, not corrected away',unspecified:!!by.unspecified};}
(function(){if(typeof MODELS==='undefined'||_registryTaken(MODELS,'MODELS','physique_regions'))return;
  MODELS.push({id:'physique_regions',name:'Physique by region',cls:'EMPIRICAL',version:'1.0',inputs:['waist','bodyfat','weight'],minN:4,
    assumes:['strength progress stands in for growth','regions are comparable with each other'],failsWhen:['fewer than three trained regions','too few sessions per exercise','circumference changes that are fat, not muscle'],
    output:'per region: exposure, strength and size trends, status, and where to add or take sets',consumers:['physiqueCard'],freshnessDays:7,uncertainty:{kind:'standard error of each trend'},fn:'physiqueModel'});})();
