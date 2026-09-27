/* ============================================================================
   REGION: GAP CLOSURE (catalogue §24, §35, §55, §65, §73, §100, §17)

   The thirteen sub-features a coverage probe found missing. Two of them deserve more care than the others,
   and the care is the implementation rather than a disclaimer attached to it:

   §24 VISUAL CHANGE. A photo comparison must not tell someone their body changed. Two photographs differ
   because of lighting, posture, time of day, pump, hydration, camera distance and lens, all before anything
   about the person has changed. So this standardises CAPTURE CONDITIONS and reports whether two photos are
   comparable — it never renders a verdict on the body. The person looks; the system tells them whether the
   comparison is fair.

   §65 STREAKS AND DROP-OFF. A streak counter is a guilt mechanic when it is built to be defended. Breaking a
   long streak makes people abandon the record entirely, which is the outcome this system most wants to
   avoid, since a record that stops is worth nothing. So consistency is reported as a proportion rather than
   a chain, a broken run is explicitly not framed as a loss, and the drop-off signal exists to prompt an
   easier target rather than to warn someone about their own discipline.
   ============================================================================ */

/* ---------------- §24.1 STANDARDISED CAPTURE ---------------- */
var PHOTO_VIEWS={
  front:{label:'Front',cue:'feet shoulder width, arms relaxed at your sides, look straight ahead'},
  side:{label:'Side',cue:'turn ninety degrees, arms hanging naturally, do not twist toward the camera'},
  back:{label:'Back',cue:'same stance as the front, arms relaxed'},
  frontRelaxed:{label:'Front, relaxed',cue:'no bracing, breathe out normally'},
  frontFlexed:{label:'Front, flexed',cue:'only if you compare it against other flexed photos'}
};
var PHOTO_CONDITIONS=['lighting','timeOfDay','distance','clothing','fed','pump'];
var LIGHTING_KINDS={
  daylightIndirect:{label:'Indirect daylight',consistency:'good'},
  daylightDirect:{label:'Direct sunlight',consistency:'poor \u2014 shadows exaggerate definition'},
  overhead:{label:'Overhead artificial',consistency:'poor \u2014 top light exaggerates definition'},
  diffuseIndoor:{label:'Diffuse indoor',consistency:'good'},
  mixed:{label:'Mixed or unknown',consistency:'unknown'}
};
function photoProtocol(){
  return {views:PHOTO_VIEWS,conditions:PHOTO_CONDITIONS,lighting:LIGHTING_KINDS,
    guidance:['same time of day, before eating',
      'same place and the same light \u2014 this matters more than anything else',
      'same distance from the camera, phone at chest height',
      'same clothing, or as close as makes no difference',
      'relaxed rather than braced, unless you only ever compare flexed against flexed'],
    cls:'POLICY',
    note:'A comparison is only worth making if the conditions match. Two photographs differ from lighting, posture, time of day, hydration and camera distance long before anything about you has changed.'};
}
/* §24.2 comparability: the question the system CAN answer. */
function photoComparability(a,b){
  if(!a||!b)return {status:'insufficient',need:['two photos to compare']};
  var issues=[],matched=[];
  var check=function(field,label,severity){
    var av=a[field],bv=b[field];
    if(av==null||bv==null){issues.push({field:label,why:'not recorded for '+(av==null?'the earlier':'the later')+' photo',severity:'unknown'});return;}
    if(av===bv)matched.push(label);
    else issues.push({field:label,why:'changed from '+av+' to '+bv,severity:severity});
  };
  check('view','view','blocking');
  check('lighting','lighting','major');
  check('timeOfDay','time of day','major');
  check('distance','camera distance','moderate');
  check('clothing','clothing','moderate');
  check('fed','fed state','moderate');
  var blocking=issues.filter(function(i){return i.severity==='blocking';});
  var major=issues.filter(function(i){return i.severity==='major';});
  var unknown=issues.filter(function(i){return i.severity==='unknown';});
  var grade=blocking.length?'not comparable':
    (major.length?'poorly comparable':(unknown.length>2?'unknown':(issues.length?'roughly comparable':'comparable')));
  return {status:'ok',cls:'MEASURED',grade:grade,matched:matched,issues:issues,
    daysApart:(a.date&&b.date)?Math.abs(daysBetween(a.date,b.date)):null,
    verdict:grade==='not comparable'?'These are different views. Comparing them shows the angle, not you.':
      (grade==='poorly comparable'?'The light or the time of day differs, which changes the picture more than a fortnight of training does.':
       (grade==='unknown'?'Too little was recorded about how these were taken to say whether the comparison is fair.':
        'Conditions match well enough that a difference is more likely to be real.')),
    note:'This judges the COMPARISON, not the body. Whether you look different is yours to see; whether the two photographs can fairly be set beside each other is the part a system can answer.'};
}
function photoPairs(opts){
  opts=opts||{};
  var all=photoMeta();
  var byView={};
  all.forEach(function(p){(byView[p.view||'unspecified']=byView[p.view||'unspecified']||[]).push(p);});
  var out=[];
  Object.keys(byView).forEach(function(v){
    var rows=byView[v].slice().sort(function(a,b){return a.date<b.date?-1:1;});
    if(rows.length<2)return;
    var first=rows[0],last=rows[rows.length-1];
    out.push({view:v,earlier:first,later:last,
      comparability:photoComparability(first,last),count:rows.length});
  });
  return {pairs:out,total:all.length,
    note:out.length?'Earliest against latest within each view. Comparing across views measures the angle.':
      'Not enough photos in any single view to pair.'};
}
/* §24.3 change detection, honestly bounded: measured change over the same interval, so the person has
   numbers beside the pictures rather than an opinion about the pictures. */
function photoChangeContext(pair){
  if(!pair||!pair.earlier||!pair.later)return null;
  var from=pair.earlier.date,to=pair.later.date;
  var series=function(type){
    var s=obsOf(type).filter(function(o){return o.date>=from&&o.date<=to;});
    if(s.length<2)return null;
    return {from:s[0].value,to:s[s.length-1].value,change:round(s[s.length-1].value-s[0].value,1),n:s.length};
  };
  return {days:daysBetween(from,to),
    weight:series('weight'),waist:series('waist'),
    comparability:pair.comparability.grade,
    cls:'MEASURED',
    note:'What the tape and the scale did over the same period. The system offers these beside the photographs rather than an opinion about the photographs \u2014 it cannot see your body, and a model that claims to would be guessing with confidence.'};
}
/* ---------------- §65 BEHAVIOUR ----------------
   Consistency without a guilt mechanic. */
function loggingHabits(days){
  days=days||56;
  var from=addDays(asOf(),-(days-1));
  var types=['weight','calories','steps','sleep'];
  var rows=types.map(function(t){
    var s=obsOf(t,{from:from});
    var byDate={};s.forEach(function(o){byDate[o.date]=1;});
    var dates=Object.keys(byDate).sort();
    /* Which day of the week it tends to slip, which is actionable in a way a total is not. */
    var byDow={};
    for(var i=0;i<days;i++){
      var d=addDays(from,i);
      var dow=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(d+'T12:00:00Z').getUTCDay()];
      byDow[dow]=byDow[dow]||{have:0,of:0};
      byDow[dow].of++;if(byDate[d])byDow[dow].have++;
    }
    var worst=Object.keys(byDow).filter(function(k){return byDow[k].of>=4;})
      .sort(function(a,b){return (byDow[a].have/byDow[a].of)-(byDow[b].have/byDow[b].of);})[0];
    var coverage=dates.length/days;
    return {type:t,label:(OBS_TYPES[t]||{}).label||t,
      days:dates.length,of:days,coverage:round(coverage*100,0),
      weakestDay:worst&&(byDow[worst].have/byDow[worst].of)<0.6?worst:null,
      /* Longest run is reported, and explicitly not as something to protect. */
      longestRun:(function(){var best=0,run=0;
        for(var i=0;i<days;i++){if(byDate[addDays(from,i)])best=Math.max(best,++run);else run=0;}
        return best;})()};
  }).filter(function(r){return r.days>0;});
  return {days:days,rows:rows,cls:'MEASURED',
    note:'Coverage as a proportion, not a chain to defend. A run is shown because it is interesting, not because breaking one means anything \u2014 the record is worth keeping whether or not yesterday is in it.',
    caveat:'A missed day is a missed day. It is not a failure, and nothing here is designed to make it feel like one.'};
}
function adherenceRisk(){
  var h=loggingHabits(56);
  if(!h.rows.length)return {status:'insufficient',need:['some logging history']};
  /* Recent coverage against earlier coverage: a fall is the signal, not a low absolute number. */
  var rows=h.rows.map(function(r){
    var recent=obsOf(r.type,{from:addDays(asOf(),-13)});
    var byDate={};recent.forEach(function(o){byDate[o.date]=1;});
    var recentCov=Object.keys(byDate).length/14;
    var drop=round((r.coverage/100-recentCov)*100,0);
    return {type:r.type,label:r.label,overall:r.coverage,recent:round(recentCov*100,0),drop:drop};
  });
  var falling=rows.filter(function(r){return r.drop>=20;});
  return {status:'ok',cls:'DERIVED',rows:rows,falling:falling,
    level:falling.length>=2?'several streams have fallen off':(falling.length?'one stream has fallen off':'steady'),
    suggestion:falling.length?
      ('Logging '+falling.map(function(f){return f.label.toLowerCase();}).join(' and ')+' has dropped. The useful response is usually a smaller target rather than a renewed effort at the old one \u2014 a record with three streams kept is worth more than five abandoned.'):
      'Nothing has fallen off recently.',
    note:'A change in your own logging, compared against your own earlier pattern. It exists to suggest an easier target, not to tell you anything about your discipline.'};
}
/* ---------------- §55 ANOMALY EXPLANATION ----------------
   An anomaly with no candidate explanation is an accusation. */
function explainAnomaly(obs){
  if(!obs)return null;
  var d=obs.date,candidates=[];
  var near=function(type,label,test){
    var s=obsOf(type).filter(function(o){return Math.abs(daysBetween(o.date,d))<=2;});
    s.forEach(function(o){if(!test||test(o))candidates.push({factor:label,value:o.value,date:o.date,
      relation:o.date<d?'the day before':(o.date>d?'the day after':'the same day')});});
  };
  if(obs.type==='weight'){
    near('calories','a high intake day',function(o){return o.value>((activePhase()||{}).calorieTarget||2500)*1.15;});
    near('steps','an unusually low activity day',function(o){return o.value<3000;});
    near('cardio','a long cardio session',function(o){return o.value>=45;});
    near('sleep','a short night',function(o){return o.value<6;});
    sessionsOf({from:addDays(d,-2),to:d}).forEach(function(s){
      candidates.push({factor:'a training session',value:(s.sets||[]).length+' sets',date:s.date,
        relation:s.date<d?'the day before':'the same day'});});
    if(obs.quality&&obs.quality!=='good')candidates.push({factor:'the reading itself was flagged',value:obs.quality,date:d,relation:'same reading'});
  }
  return {observation:{type:obs.type,date:d,value:obs.value},
    candidates:candidates,cls:'DERIVED',
    verdict:candidates.length?'Things in the record near that date that could account for it':
      'Nothing in the record around that date accounts for it, which is itself worth knowing',
    note:'Candidates, not causes. A single reading out of line is usually water, food weight or the scale \u2014 and an anomaly presented without candidate explanations reads as an accusation.'};
}
function anomaliesExplained(days){
  var out=[];
  try{
    (changePoints(days||90).items||[]).slice(0,5).forEach(function(cp){
      var o=obsOf('weight').filter(function(x){return x.date===cp.date;})[0];
      out.push({point:cp,explanation:o?explainAnomaly(o):null});
    });
  }catch(e){_q(e,'P3');}
  return {rows:out,note:out.length?'Detected shifts with what the record holds around them.':'No shifts detected in this window.'};
}
/* ---------------- §100 USER-AUTHORED RULES ----------------
   A person's own rule about their own body, kept as evidence of its own kind and never confused with a
   model output. */
function userRules(){return (DB.settings.userRules||[]).filter(function(r){return !r.retiredAt;});}
function addUserRule(o){
  o=o||{};
  if(!o.statement)return null;
  pushUndo('add a rule');
  var rec={id:uid('rule'),statement:String(o.statement).slice(0,240),
    context:String(o.context||'').slice(0,120),
    basis:o.basis||'your own observation',createdAt:nowISO(),retiredAt:null};
  DB.settings.userRules=(DB.settings.userRules||[]).concat([rec]);
  emitEvent('userRule.added',rec,{at:rec.createdAt});
  _memoInvalidate();save('userRule');
  return rec;
}
function retireUserRule(id){
  var r=(DB.settings.userRules||[]).filter(function(x){return x.id===id;})[0];
  if(!r||r.retiredAt)return false;
  pushUndo('retire a rule');
  r.retiredAt=nowISO();
  emitEvent('userRule.retired',{id:id},{at:r.retiredAt});
  _memoInvalidate();save('userRule:retire');
  return true;
}
function userRulesState(){
  var rows=userRules().map(function(r){
    /* A user rule is checked against the record where the record can speak to it, and left alone where it
       cannot. Contradicting somebody about their own body on thin evidence is worse than staying quiet. */
    var related=null;
    try{
      var v=Object.keys(typeof RESPONSE_VARS!=='undefined'?RESPONSE_VARS:{})
        .filter(function(k){return new RegExp('\\b'+k,'i').test(r.statement);})[0];
      if(v)related=causalSupport(v);
    }catch(e){}
    return {rule:r,related:related,
      standing:related?('your record grades '+related.variable+' as '+related.grade):'nothing in the record speaks to this either way'};
  });
  return {rows:rows,count:rows.length,cls:'MEASURED',
    note:'Rules you wrote about yourself. They are kept as your own evidence, shown beside what the record can say, and never overwritten by a model output \u2014 you have access to things the record does not.'};
}
