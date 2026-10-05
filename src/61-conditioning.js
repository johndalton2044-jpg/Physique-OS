/* ============================================================================
   REGION: CONDITIONING, CARDIO AND INTERFERENCE (catalogue §16, §17, §18)

   The catalogue is right that conditioning and cardio are different questions. Cardio asks how much aerobic
   work was done; conditioning asks what you can repeat, and how fast you recover between efforts. They are
   separated here because they progress differently and because conflating them hides the one that matters
   for training: work capacity is a property you can build, aerobic minutes are a dose you accumulate.

   §18 is the one with teeth, and the catalogue's instruction on it is the whole point: *use personal
   evidence rather than generic assumptions*. The interference effect is real in the literature and wildly
   overstated in practice, and an app that announces "your cardio is killing your gains" from a textbook
   would be doing the opposite of what this system is for. So interference is graded through the same causal
   machinery as everything else, and its honest answer is usually "your record cannot separate this yet".
   ============================================================================ */

/* ---------------- §17 CARDIO MODALITIES ---------------- */
var CARDIO_MODALITIES={
  walk:{label:'Walking',impact:'low',interference:'minimal',
    note:'the least costly way to add expenditure; rarely interferes with anything'},
  incline:{label:'Incline walking',impact:'low',interference:'low',
    note:'more expenditure per minute than flat walking, with some calf and hip load'},
  run:{label:'Running',impact:'high',interference:'moderate',
    note:'eccentric loading of the same muscles used in squatting, which is where the overlap lives'},
  cycle:{label:'Cycling',impact:'low',interference:'low-moderate',
    note:'concentric-dominant, so it costs less soreness than running at similar effort, but loads the quads'},
  row:{label:'Rowing',impact:'low',interference:'moderate',
    note:'uses the pulling muscles as well, so it is not neutral on an upper-body day'},
  swim:{label:'Swimming',impact:'none',interference:'low',
    note:'almost no eccentric load; the overlap is systemic rather than local'},
  elliptical:{label:'Elliptical',impact:'low',interference:'low'},
  other:{label:'Other',impact:'unknown',interference:'unknown'}
};
/* Zones as a named vocabulary rather than a prescription. Without heart rate the record cannot place a
   session in a zone, and this says so rather than inferring one from duration. */
var CARDIO_ZONES={
  1:{label:'Zone 1',feel:'very easy, conversational',rpe:'2\u20133'},
  2:{label:'Zone 2',feel:'easy, could hold a conversation',rpe:'3\u20134'},
  3:{label:'Zone 3',feel:'moderate, conversation broken',rpe:'5\u20136'},
  4:{label:'Zone 4',feel:'hard, a few words at a time',rpe:'7\u20138'},
  5:{label:'Zone 5',feel:'maximal, no talking',rpe:'9\u201310'}
};
function cardioZoneFor(o){
  o=o||{};
  if(o.zone&&CARDIO_ZONES[o.zone])return {zone:o.zone,source:'recorded',cls:'MEASURED'};
  if(o.hr!=null&&o.maxHr){
    var pct=o.hr/o.maxHr;
    var z=pct<0.6?1:(pct<0.7?2:(pct<0.8?3:(pct<0.9?4:5)));
    return {zone:z,source:'heart rate against your stated maximum',cls:'DERIVED',
      note:'A percentage-of-maximum estimate. A measured or field-tested threshold would place this better.'};
  }
  if(o.rpe!=null){
    var r=num(o.rpe);
    var z2=r<=3?1:(r<=4?2:(r<=6?3:(r<=8?4:5)));
    return {zone:z2,source:'your perceived effort',cls:'EMPIRICAL',
      note:'From how hard it felt. That is a legitimate way to place a session and a poor way to compare two people.'};
  }
  return {zone:null,source:null,cls:null,
    note:'No heart rate, pace or effort rating, so this session cannot be placed in a zone. Duration alone does not imply intensity.'};
}
function cardioSessions(days){
  days=days||28;
  var from=addDays(asOf(),-days);
  var rows=obsOf('cardio',{from:from}).map(function(o){
    var meta=o.meta||{};
    var mod=meta.modality||o.method||'other';
    return {date:o.date,minutes:o.value,modality:mod,
      /* Distance, pace and power where the record holds them. Power is the only one of these that is a
         measurement rather than an inference, so it is kept separate from pace, which is derived. */
      distance:meta.distance!=null?num(meta.distance):null,
      distanceUnit:meta.distanceUnit||'mi',
      watts:meta.watts!=null?num(meta.watts):null,
      pace:(meta.distance&&o.value)?round(o.value/num(meta.distance),2):null,
      paceUnit:'min per '+(meta.distanceUnit||'mi'),
      modalityData:CARDIO_MODALITIES[mod]||CARDIO_MODALITIES.other,
      zone:cardioZoneFor({zone:meta.zone,hr:meta.hr,grade:meta.grade!=null?+meta.grade:null,maxHr:(prof().maxHr||null),rpe:meta.rpe}),
      /* the measurements themselves, not only the zone they imply: the fitness model needs them */
      hr:meta.hr!=null?+meta.hr:null,rpe:meta.rpe!=null?+meta.rpe:null,grade:meta.grade!=null?+meta.grade:null,steady:meta.steady||null,externalId:meta.externalId||null};
  });
  if(!rows.length)return {status:'insufficient',need:['cardio sessions logged'],days:days};
  var minutes=rows.reduce(function(a,r){return a+(r.minutes||0);},0);
  var weeks=Math.max(1,days/7);
  var byModality={},zoned=0;
  rows.forEach(function(r){
    byModality[r.modality]=(byModality[r.modality]||0)+(r.minutes||0);
    if(r.zone.zone)zoned++;
  });
  var withPower=rows.filter(function(r){return r.watts!=null;});
  var withDistance=rows.filter(function(r){return r.distance!=null;});
  return {status:'ok',cls:'MEASURED',days:days,sessions:rows.length,rows:rows,
    minutesPerWeek:Math.round(minutes/weeks),byModality:byModality,
    zonedShare:round(100*zoned/rows.length,0),
    power:withPower.length?{sessions:withPower.length,mean:round(mean(withPower.map(function(r){return r.watts;})),0),
      note:'Average power across the sessions that recorded it. This is the one intensity measure here that is measured rather than inferred.'}:null,
    distance:withDistance.length?{sessions:withDistance.length,
      total:round(withDistance.reduce(function(a2,r){return a2+r.distance;},0),1),
      unit:withDistance[0].distanceUnit,
      meanPace:round(mean(withDistance.map(function(r){return r.pace;}).filter(function(x){return x!=null;})),2)}:null,
    note:zoned<rows.length?((rows.length-zoned)+' of '+rows.length+' sessions have no intensity recorded, so any statement about intensity distribution would be invented.'):
      'Every session carries an intensity.'};
}
/* ---------------- §16 CONDITIONING ----------------
   Work capacity, which is a different question from aerobic minutes: what can you repeat, and how fast do
   you recover between efforts. */
function conditioningState(days){
  days=days||28;
  var from=addDays(asOf(),-days);
  var circuits=[];
  sessionsOf({from:from}).forEach(function(s){
    var sets=(s.sets||[]).filter(function(st){
      var k=setKind(st);return k==='superset'||k==='giant'||k==='cluster'||k==='restPause'||k==='endurance';});
    if(sets.length)circuits.push({date:s.date,sets:sets.length,
      density:s.durationMin?round(sets.length/s.durationMin*60,1):null});
  });
  var c=cardioSessions(days);
  var intervals=(c.status==='ok')?c.rows.filter(function(r){return r.zone.zone>=4;}).length:0;
  if(!circuits.length&&!intervals)
    return {status:'insufficient',days:days,
      need:['circuit, superset or interval work recorded'],
      note:'Conditioning is what you can repeat and how fast you recover between efforts. Steady aerobic work is a different question and is reported as cardio.'};
  var density=circuits.filter(function(x){return x.density!=null;});
  return {status:'ok',cls:'MEASURED',days:days,
    circuitSessions:circuits.length,intervalSessions:intervals,
    density:density.length?round(mean(density.map(function(x){return x.density;})),1):null,
    trend:(function(){
      if(density.length<4)return null;
      var half=Math.floor(density.length/2);
      var a=mean(density.slice(0,half).map(function(x){return x.density;}));
      var b=mean(density.slice(half).map(function(x){return x.density;}));
      return round(b-a,2);
    })(),
    note:'Density is sets per hour within sessions that contained circuit or interval work. It is a crude proxy for work capacity \u2014 a session can be dense because you rushed it rather than because you recovered faster.'};
}
/* ---------------- §18 INTERFERENCE ----------------
   Personal evidence, graded. The default answer is that the record cannot separate it, because for almost
   everyone it cannot. */
function interferenceAnalysis(opts){
  opts=opts||{};
  var days=opts.days||120;
  var c=cardioSessions(days);
  if(c.status!=='ok')return {status:'insufficient',need:['cardio sessions logged'],
    note:'Without recorded cardio there is nothing to weigh against your training.'};
  /* Weekly cardio minutes against weekly strength change, paired by week. */
  var weeks={};
  c.rows.forEach(function(r){
    var wk=_weekKey(r.date);
    weeks[wk]=weeks[wk]||{cardio:0,dates:[]};
    weeks[wk].cardio+=(r.minutes||0);weeks[wk].dates.push(r.date);
  });
  /* ONE lift, not an average across lifts. Averaging squat and bench estimated maxima into a single number
     means a week containing more squats reads as a stronger week, and the resulting "effect" measures which
     exercises happened to be scheduled. The most frequently trained compound is used instead. */
  var counts={};
  var since=addDays(asOf(),-days);
  sessionsOf({from:since}).forEach(function(s){(s.sets||[]).forEach(function(st){
    if(!st.load||!st.reps||!SET_KINDS[setKind(st)].volume)return;
    var e=null;try{e=resolveExercise(st.exercise);}catch(err){}
    if(e&&e.compound)counts[st.exercise]=(counts[st.exercise]||0)+1;});});
  var lift=Object.keys(counts).sort(function(a2,b2){return counts[b2]-counts[a2];})[0];
  if(!lift)return {status:'insufficient',need:['a compound lift trained regularly with load and reps'],
    note:'Interference is judged against one lift, because averaging estimated maxima across different lifts measures the schedule rather than your strength.'};
  var series=[];
  Object.keys(weeks).forEach(function(wk){
    var sess=sessionsOf({from:wk,to:addDays(wk,6)});
    var e1=[];
    sess.forEach(function(s){(s.sets||[]).forEach(function(st){
      if(st.exercise!==lift||!st.load||!st.reps)return;
      if(!SET_KINDS[setKind(st)].volume)return;
      var v=e1rmFrom(st.load,st.reps,st.rir);
      if(v!=null)e1.push(v);});});
    if(e1.length>=2)series.push({week:wk,cardio:weeks[wk].cardio,e1rm:round(mean(e1),1)});
  });
  if(series.length<6)return {status:'insufficient',
    need:[(6-series.length)+' more weeks with both cardio and lifting recorded'],
    weeks:series.length,
    note:'Six weeks is the minimum before a relationship between weekly cardio and weekly strength could show at all, and even then it would be a correlation.'};
  series.sort(function(a,b){return a.week<b.week?-1:1;});
  var hiCut=mean(series.map(function(s){return s.cardio;}));
  var hi=series.filter(function(s){return s.cardio>hiCut;});
  var lo=series.filter(function(s){return s.cardio<=hiCut;});
  if(hi.length<3||lo.length<3)return {status:'insufficient',
    need:['more variation in your weekly cardio than this period contains'],
    note:'Your cardio has been too consistent for a comparison. Nothing can be separated when nothing varies.'};
  var hiMean=mean(hi.map(function(s){return s.e1rm;})),loMean=mean(lo.map(function(s){return s.e1rm;}));
  var diff=hiMean-loMean;
  var pooled=Math.sqrt((Math.pow(sd(hi.map(function(s){return s.e1rm;}))||0,2)+
                        Math.pow(sd(lo.map(function(s){return s.e1rm;}))||0,2))/2);
  var d=pooled?diff/pooled:null;
  /* Confounding is the norm here: high-cardio weeks are usually also high-deficit or high-stress weeks. */
  var confounds=[];
  try{
    var ph=activePhase();
    if(ph&&ph.type==='cut')confounds.push('you are in a deficit, which suppresses strength independently of cardio');
  }catch(e){}
  try{
    var rd=readinessState();
    if(rd.status==='ok'&&rd.score<=-0.5)confounds.push('readiness has been below your normal, which affects both');
  }catch(e){}
  var grade=(d==null)?'unknown':
    (Math.abs(d)<0.3?'no detectable difference':
     (confounds.length?'correlated, and confounded':'correlated'));
  return {status:'ok',cls:'EMPIRICAL',weeks:series.length,lift:lift,
    highCardioWeeks:hi.length,lowCardioWeeks:lo.length,
    threshold:Math.round(hiCut),
    strengthHigh:round(hiMean,1),strengthLow:round(loMean,1),
    difference:round(diff,1),standardised:d!=null?round(d,2):null,
    grade:grade,confounds:confounds,
    verdict:grade==='no detectable difference'?
      'Across your own weeks, strength looks the same whether cardio was high or low. That is not proof there is no effect \u2014 it is the absence of one large enough for your record to see.':
      (grade==='unknown'?'Not enough spread in the strength figures to compare.':
       'Estimated '+lift+' max ran '+fmtSigned(diff,1)+' lb in your higher-cardio weeks. '+
       (confounds.length?'This is confounded: '+confounds.join('; ')+'.':'No obvious confound, but nothing was randomised either.')),
    next:confounds.length?'hold calories and training volume steady and vary cardio alone for a designed period':
      'a designed experiment would settle what this comparison only suggests',
    note:'Your own weeks compared against each other, not a textbook claim. The interference effect is real in the literature and routinely overstated in practice \u2014 which is why this reports what YOUR record can and cannot separate.'};
}
function _weekKey(date){
  var d=new Date(date+'T12:00:00Z');
  var day=d.getUTCDay();
  var monday=new Date(d);monday.setUTCDate(d.getUTCDate()-((day+6)%7));
  return localDateOf(monday.toISOString());
}
/* Timing: same-day cardio and lifting is the arrangement most likely to interfere, and it is checkable. */
function cardioTiming(days){
  days=days||90;
  var from=addDays(asOf(),-days);
  var lift={},both=0,cardioDays=0;
  sessionsOf({from:from}).forEach(function(s){lift[s.date]=true;});
  obsOf('cardio',{from:from}).forEach(function(o){
    cardioDays++;
    if(lift[o.date])both++;
  });
  return {days:days,cardioSessions:cardioDays,sameDayAsLifting:both,
    share:cardioDays?round(100*both/cardioDays,0):null,cls:'MEASURED',
    note:both?'Same-day cardio and lifting is the arrangement where interference is most plausible. Separating them by several hours, or onto different days, is the cheapest thing to try before cutting cardio.':
      'Your cardio and lifting already fall on different days, which is the arrangement least likely to interfere.'};
}

/* ============================================================================
   \u00a716: CARDIO THROUGH A NORMALISATION LAYER
   raw session \u2192 power/pace/HR normalisation \u2192 relative intensity \u2192 stimulus \u2192 conditioning state \u2192 cost.
   Watts, pace and heart rate are different quantities in different units, and the direction forbids mixing
   them. Every session is first converted to ABSOLUTE intensity (METs) and, where the record allows,
   RELATIVE intensity (a fraction of this person's capacity). Load is only summed within one basis: relative
   load and absolute MET-minutes are separate totals and are never added together.
   ============================================================================ */
/* Reference data, not measurement: compendium-style MET values by modality, used only when neither power nor
   pace is recorded. */
var CARDIO_MET_TABLE={'walk':3.5,'incline walk':5.0,'run':9.8,'jog':7.0,'cycle':7.0,'bike':7.0,'row':7.0,
  'swim':6.0,'elliptical':5.0,'stairs':8.0,'hike':6.0,'other':4.0};
function _metFromModality(mod){
  mod=String(mod||'other').toLowerCase();
  var k=Object.keys(CARDIO_MET_TABLE).sort(function(a,b){return b.length-a.length;}).filter(function(x){return mod.indexOf(x)>=0;})[0];
  return {met:CARDIO_MET_TABLE[k||'other'],basis:'reference table ('+(k||'other')+')',cls:'PRIOR'};
}
/* Band midpoints matching cardioZoneFor(): below 60%, 60–70, 70–80, 80–90, above 90% of max heart rate. */
var ZONE_FRACTION={1:0.55,2:0.65,3:0.75,4:0.85,5:0.95};
function normaliseCardioSession(r){
  var kg=null;try{var w=obsOf('weight').slice(-1)[0];kg=w?w.value*0.4536:null;}catch(e){}
  var abs=null;
  if(r.watts!=null&&kg){
    /* ACSM leg-cycling: VO2 (ml/kg/min) = 1.8 x work rate (kg\u00b7m/min) / mass + 7; 1 W = 6.12 kg\u00b7m/min. */
    abs={met:round((1.8*r.watts*6.12/kg+7)/3.5,1),basis:'power (ACSM cycling equation)',cls:'DERIVED'};
  }else if(r.pace!=null&&r.pace>0){
    var mPerMin=(r.distanceUnit==='km'?1000:1609.34)/r.pace;
    var running=mPerMin>134;   /* above ~8 km/h the gait is a run */
    abs={met:round(((running?0.2:0.1)*mPerMin+3.5)/3.5,1),basis:'pace (ACSM '+(running?'running':'walking')+' equation, level ground)',cls:'DERIVED'};
  }else abs=_metFromModality(r.modality);
  /* Relative intensity as a fraction of maximal effort, on ONE scale whatever the source. Zones carry no
     numbers — only an effort range — so the first version averaged two missing fields and a recorded zone 3
     came out as intensity 0 and load 0. The zone midpoints now come from the same %-of-max-heart-rate bands
     cardioZoneFor() uses to assign a zone, so a zone means the same thing on every path. */
  var rel=null;
  var z=r.zone||{};
  if(z.zone!=null&&ZONE_FRACTION[z.zone]!=null)rel={value:ZONE_FRACTION[z.zone],basis:'zone '+z.zone+' ('+(z.source||'recorded')+'), midpoint of its %-max-heart-rate band'};
  else if(r.rpe!=null&&isFinite(r.rpe))rel={value:Math.max(0,Math.min(1,r.rpe/10)),basis:'effort rating '+r.rpe+'/10'};
  return {date:r.date,minutes:r.minutes,modality:r.modality,
    absolute:{met:abs.met,basis:abs.basis,cls:abs.cls,metMinutes:round(abs.met*(r.minutes||0),0)},
    relative:rel?{fraction:round(rel.value,2),basis:rel.basis,
      /* Banister-style stimulus: duration weighted exponentially by relative intensity. */
      load:round((r.minutes||0)*rel.value*Math.exp(1.92*rel.value),1)}:
      {fraction:null,basis:'not available \u2014 no heart rate, pace-to-threshold, effort rating or zone recorded',load:null}};
}
function cardioLoad(days){
  days=days||28;
  var c=null;try{c=cardioSessions(days);}catch(e){}
  if(!c||c.status!=='ok')return {status:'insufficient',need:['cardio sessions logged']};
  var sessions=c.rows.map(normaliseCardioSession);
  var withRel=sessions.filter(function(s){return s.relative.load!=null;});
  var fit=null;try{fit=cardioFitnessState();}catch(e){}
  var relLoad=withRel.reduce(function(a,s){return a+s.relative.load;},0);
  return {status:'ok',cls:'DERIVED',days:days,sessions:sessions,
    totals:{
      metMinutes:sessions.reduce(function(a,s){return a+s.absolute.metMinutes;},0),
      metMinutesBasis:'absolute intensity \u2014 comparable across people, not across fitness levels',
      relativeLoad:withRel.length?round(relLoad,1):null,
      relativeLoadSessions:withRel.length,
      relativeLoadBasis:withRel.length?'relative intensity \u2014 comparable across modalities for this person':
        'no session carries relative intensity, so no relative load is reported rather than one inferred from minutes'},
    fitnessState:fit&&fit.status==='ok'?{estimate:fit.value!=null?fit.value:fit.estimate,cls:fit.cls,note:fit.note}:{status:'insufficient'},
    fatigueCost:withRel.length?{basis:'relative load',value:round(relLoad/days*7,1),unit:'load per week'}:
      {basis:null,note:'recovery cost needs relative intensity; minutes alone cannot say how hard a session was'},
    adaptation:{status:'insufficient',need:['repeated sessions at a fixed pace or power with heart rate, to see the heart-rate cost of the same work fall'],
      note:'adaptation is a falling cost for the same work, which needs both an absolute and a relative measure of the same session over time'},
    note:'Every session is normalised before anything is summed; watts, pace and heart rate are never added to one another.'};
}
function cardioNormalisationAudit(){
  /* The structural guarantee: aggregates are only ever built from normalised fields, never from raw units. */
  var r=cardioLoad(28);if(r.status!=='ok')return {ok:true,checked:0,note:'no cardio to audit'};
  var issues=[];
  r.sessions.forEach(function(s,i){
    if(s.absolute.met==null)issues.push('session '+i+' has no absolute intensity');
    if(s.relative.load!=null&&s.relative.fraction==null)issues.push('session '+i+' has relative load without relative intensity');});
  var sum=r.sessions.reduce(function(a,s){return a+s.absolute.metMinutes;},0);
  if(sum!==r.totals.metMinutes)issues.push('MET-minute total is not the sum of normalised sessions');
  return {ok:issues.length===0,checked:r.sessions.length,issues:issues};
}
