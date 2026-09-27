/* ============================================================================
   REGION: OBSERVATIONS — Layer 1. What was actually measured, logged or reported.
   Append-only: a correction is a new record that supersedes the old one; deletion is a retraction with
   metadata. Every read accepts an as-of date so replay can reconstruct what the system knew.
   ============================================================================ */
var _ASOF=null; // set during replay; null = now
function asOf(){return _ASOF||todayISO();}
function withAsOf(date,fn){var prev=_ASOF,prevNow=_NOW_OVERRIDE;_ASOF=date;_NOW_OVERRIDE=date;_memoInvalidate();try{return fn();}finally{_ASOF=prev;_NOW_OVERRIDE=prevNow;_memoInvalidate();}}
// visibility rule for replay: the record must be dated on/before the as-of day AND have been created by then
/* Visibility is a question about a moment in time, not about the record's current state.
   A record is visible on `date` if it had been created by then AND had not yet been superseded or retracted
   by then. Using the boolean `retracted` / `correctedBy` flags directly would let a correction made today
   erase what the system knew last month — replay would then reconstruct history from present belief, which is
   exactly what replay exists to prevent. Every suppression therefore carries the date it became known:
     correctedBy + correctedAt   the correction's creation date (the correction itself is a normal record)
     retracted   + retractedAt   the retraction's creation date
   Outside replay (_ASOF unset) the flags win, because "now" is after every suppression. */
function _suppressedBy(o,date){
  if(!o)return true;
  if(o.retracted){var ra=o.retractedAt;if(!_ASOF||!ra||String(ra).slice(0,10)<=date)return true;}
  if(o.correctedBy){var ca=o.correctedAt||_correctionDate(o);if(!_ASOF||!ca||String(ca).slice(0,10)<=date)return true;}
  return false;
}
/* Fallback for records written before correctedAt was stored: find the superseding record and use its
   creation date. Never guesses — with no successor found the correction is treated as always-known. */
function _correctionDate(o){
  if(!o||!o.correctedBy)return null;
  var succ=(DB.observations||[]).filter(function(x){return x.id===o.correctedBy;})[0];
  if(!succ)return null;
  return (succ.correction&&succ.correction.at)||succ.createdAt||succ.at||null;
}
function _visible(o,date){
  if(!o)return false;
  if(o.date>date)return false;
  if(o.createdAt&&o.createdAt.slice(0,10)>date)return false;
  if(_suppressedBy(o,date))return false;
  return true;
}
/* knowledge-date rule: during replay an entity is visible only if it had been created by the as-of day.
   Effective dates (a phase's startDate, an intervention's date) say when something applied; creation dates say
   when the system learned of it. Replay must use the latter. Outside replay everything is visible. */
function _knownBy(x,date){if(!_ASOF||!x)return true;var c=x.createdAt||x.at||null;if(!c)return true;return String(c).slice(0,10)<=date;}
/* phaseAsOf: reconstruct a phase as it stood on `date` by reverting edits recorded after that day (updatePhase/endPhase keep a history of {at, before}). */
function phaseAsOf(ph,date){if(!_ASOF||!ph||!ph.history||!ph.history.length)return ph;var later=ph.history.filter(function(h){return String(h.at).slice(0,10)>date;});if(!later.length)return ph;var copy=Object.assign({},ph);for(var i=later.length-1;i>=0;i--){var before=later[i].before||{};Object.keys(before).forEach(function(k){copy[k]=before[k];});}copy._reconstructed=date;return copy;}
function activePhase(date){date=date||asOf();var ph=(DB.phases||[]).filter(function(p){return _knownBy(p,date);}).map(function(p){return phaseAsOf(p,date);}).filter(function(p){return p.status!=='archived'&&p.startDate<=date&&(!p.endDate||p.endDate>=date);});return ph.length?ph[ph.length-1]:null;}
function phaseAt(date){var ph=(DB.phases||[]).filter(function(p){return p.startDate<=date&&(!p.endDate||p.endDate>=date);});return ph.length?ph[ph.length-1]:null;}
function _phaseHistory(ph,patch){var before={};Object.keys(patch).forEach(function(k){before[k]=ph[k]===undefined?null:ph[k];});ph.history=ph.history||[];ph.history.push({at:nowISO(),before:before});Object.keys(patch).forEach(function(k){ph[k]=patch[k];});}
function makeObservation(o){
  var t=OBS_TYPES[o.type];if(!t)throw new Error('unknown observation type '+o.type);
  var date=o.date||todayISO();if(!isValidISO(date))throw new Error('invalid date');
  var value=t.text?String(o.value==null?'':o.value).trim():num(o.value);
  if(!t.text&&value==null)throw new Error('value required');
  var ph=phaseAt(date);
  return {id:uid('obs'),type:o.type,date:date,at:o.at||nowISO(),value:value,unit:t.unit,method:o.method||null,source:o.source||'manual',quality:o.quality||(o.source==='demo'?'demo':(o.method==='estimate'?'estimated':'measured')),
    note:o.note?String(o.note).slice(0,500):'',meta:o.meta||null,phaseId:ph?ph.id:null,supersedes:o.supersedes||null,correctedBy:null,retracted:false,createdAt:o.createdAt||nowISO(),flags:[]};
}
function addObservation(o,opts){
  opts=opts||{};
  var rec=makeObservation(o);
  var t=OBS_TYPES[rec.type];
  if(!t.text){
    if(rec.value<t.min||rec.value>t.max)rec.flags.push('outside plausible range');
    var out=outlierCheck(rec.type,rec.value,rec.date);if(out.outlier)rec.flags.push('possible outlier: '+out.note);
  }
  if(!opts.silent)pushUndo('log '+t.label);
  DB.observations.push(rec);emitEvent('observation.added',rec,{at:rec.createdAt});_memoInvalidate();
  if(!opts.noSave)save('observation:'+rec.type);
  return rec;
}
function correctObservation(id,newValue,reason){
  var old=DB.observations.filter(function(x){return x.id===id;})[0];if(!old)return null;
  pushUndo('correct '+OBS_TYPES[old.type].label);
  var rec=makeObservation({type:old.type,date:old.date,value:newValue,method:old.method,source:old.source,note:old.note,meta:old.meta,supersedes:old.id});
  rec.correction={of:old.id,originalValue:old.value,reason:reason||'',at:nowISO()};
  emitEvent('observation.corrected',{of:old.id,record:rec,reason:reason||''},{at:rec.correction.at});
  old.correctedBy=rec.id;old.correctedAt=rec.correction.at; // when the correction became known, so replay can honour it
  old.correctionHistory=(old.correctionHistory||[]).concat([{at:rec.correction.at,by:rec.id,from:old.value,to:newValue}]);
  DB.observations.push(rec);_memoInvalidate();save('correction');return rec;
}
function retractObservation(id,reason){
  var o=DB.observations.filter(function(x){return x.id===id;})[0];if(!o)return false;
  pushUndo('delete '+OBS_TYPES[o.type].label);o.retracted=true;o.retractedAt=nowISO();o.retractReason=reason||'';emitEvent('observation.retracted',{id:id,reason:reason||''},{at:o.retractedAt});_memoInvalidate();save('observation:retract');return true;
}
function outlierCheck(type,value,date){
  try{var s=dailySeries(type,date,21).filter(function(d){return d.date<date;}).map(function(d){return d.value;});
    if(s.length<5)return {outlier:false};
    var m=median(s),d=mad(s)||0;var thresh=Math.max(d*3.5/0.6745,(OBS_TYPES[type].step||1)*(type==='weight'?4:type==='waist'?1.5:3));
    if(Math.abs(value-m)>thresh)return {outlier:true,note:'differs from the recent median ('+fmtNum(m,1)+') by more than usual variation'};
  }catch(e){_q(e);}
  return {outlier:false};
}
/* Every visible observation on a single day, regardless of type. obsOf() requires a type; several callers
   (the log view, selection, day navigation) need the whole day instead. */
function obsOnDay(date,opts){
  opts=opts||{};var asof=opts.asOf||asOf();
  return DB.observations.filter(function(o){return o.date===date&&_visible(o,asof);})
    .sort(function(a,b){return String(a.at)<String(b.at)?-1:1;});
}
function obsOf(type,opts){
  opts=opts||{};var date=opts.asOf||asOf();
  /* A reading flagged as outside the plausible range stays in the record, visible and correctable, but does not
     feed a model unless asked for. It was flagged and still counted: a 9,999 lb weigh-in moved the weekly trend by
     0.54 lb. Every model reads through here, so this is the one place to exclude it. */
  var out=DB.observations.filter(function(o){return o.type===type&&_visible(o,date)&&(!opts.phaseId||o.phaseId===opts.phaseId)&&(!opts.from||o.date>=opts.from)&&
    (opts.includeImplausible||!(o.flags&&o.flags.indexOf('outside plausible range')>=0));});
  out.sort(function(a,b){return a.date<b.date?-1:(a.date>b.date?1:(a.at<b.at?-1:1));});
  return out;
}
function latestObs(type,opts){var l=obsOf(type,opts);return l.length?l[l.length-1]:null;}
var SUM_TYPES={calories:1,protein:1,carbs:1,fat:1,fiber:1,water:1,steps:1,cardio:1,sleep:1};
// one value per day: sums for intake/activity streams, means for measurements and ratings
function dailySeries(type,asOfDate,days,opts){
  opts=opts||{};asOfDate=asOfDate||asOf();
  var key='ds:'+type+':'+asOfDate+':'+days+':'+(opts.phaseId||'')+':'+(opts.from||'');
  return memo(key,function(){
    var from=days?addDays(asOfDate,-(days-1)):null;if(opts.from&&(!from||opts.from>from))from=opts.from;
    var list=obsOf(type,{asOf:asOfDate,phaseId:opts.phaseId,from:from});
    var by={};list.forEach(function(o){if(!by[o.date])by[o.date]={date:o.date,vals:[],obs:[]};by[o.date].vals.push(o.value);by[o.date].obs.push(o);});
    return Object.keys(by).sort().map(function(d){var b=by[d];var v=SUM_TYPES[type]?b.vals.reduce(function(s,x){return s+x;},0):mean(b.vals);return {date:d,value:v,n:b.vals.length,obs:b.obs,x:daysBetween(from||b.date,d)};});
  });
}
function seriesWindow(type,days,asOfDate){return dailySeries(type,asOfDate||asOf(),days);}
function coverage(type,days,asOfDate){var s=seriesWindow(type,days,asOfDate);return {logged:s.length,days:days,pct:days?Math.round(100*s.length/days):0};}
function missingness(days){
  days=days||14;var out={};
  ['weight','calories','protein','steps','sleep','waist','hunger','fatigue'].forEach(function(t){var c=coverage(t,days);out[t]={logged:c.logged,days:days,pct:c.pct,state:c.pct>=85?'complete':(c.pct>=50?'partial':(c.pct>0?'sparse':'none'))};});
  var lastTrain=(DB.sessions||[]).filter(function(s){return s.date<=asOf();}).sort(function(a,b){return a.date<b.date?1:-1;})[0];
  out.training={lastDate:lastTrain?lastTrain.date:null,sessions14:(DB.sessions||[]).filter(function(s){return s.date<=asOf()&&daysBetween(s.date,asOf())<14;}).length};
  return out;
}
function detectAnomalies(){
  var found=[];var today=todayISO();var seen={};
  DB.observations.forEach(function(o){
    if(o.retracted)return;var t=OBS_TYPES[o.type];if(!t)return;
    if(o.date>addDays(today,1))found.push({kind:'future timestamp',obs:o,detail:o.date});
    if(!t.text){if(o.value<t.min||o.value>t.max)found.push({kind:'implausible value',obs:o,detail:fmtNum(o.value,1)+' '+t.unit});if(o.value<0)found.push({kind:'negative value',obs:o,detail:o.value});}
    var k=o.type+'|'+o.date+'|'+o.value;if(!SUM_TYPES[o.type]){if(seen[k]&&!o.correctedBy&&!o.supersedes)found.push({kind:'duplicate observation',obs:o,detail:t.label+' '+o.date});seen[k]=1;}
  });
  var byDate={};(DB.sessions||[]).forEach(function(s){var k=s.date+'|'+(s.name||'');if(byDate[k])found.push({kind:'duplicate training session',obs:s,detail:s.date+' '+(s.name||'')});byDate[k]=1;});
  var tags=obsOf('context');var scale=tags.filter(function(o){return /new scale|scale changed/i.test(o.value);});
  scale.forEach(function(o){found.push({kind:'device change',obs:o,detail:'scale changed on '+shortDate(o.date)+' \u2014 weight trend treats this as a discontinuity'});});
  return found;
}
function contextTags(days){return obsOf('context',{from:addDays(asOf(),-(days||14))});}
function hasContext(re,days){return contextTags(days).some(function(o){return re.test(o.value);});}

/* ---- phases ---- */
function startPhase(p){
  var ph={id:uid('phase'),type:p.type||'cut',startDate:p.startDate||todayISO(),endDate:null,status:'active',objective:p.objective||(PHASE_TYPES[p.type||'cut']||{}).objective,
    calorieTarget:num(p.calorieTarget),proteinTarget:num(p.proteinTarget),fatFloor:num(p.fatFloor),fiberTarget:num(p.fiberTarget),stepTarget:num(p.stepTarget),cardioSessions:num(p.cardioSessions),cardioMinutes:num(p.cardioMinutes),trainingSessions:num(p.trainingSessions),sleepTargetH:num(p.sleepTargetH),
    targetRateLo:num(p.targetRateLo),targetRateHi:num(p.targetRateHi),goalWeightLb:num(p.goalWeightLb),targetDate:p.targetDate||'',
    successCriteria:p.successCriteria||'',stopCriteria:p.stopCriteria||'',transitionCriteria:p.transitionCriteria||'',
    startingState:p.startingState||null,targetSource:p.targetSource||'user',createdAt:nowISO(),history:[],notes:p.notes||''};
  pushUndo('start phase');
  emitEvent('phase.started',Object.assign({},ph,{priorEnd:addDays(ph.startDate,-1)}),{at:ph.createdAt});
  (DB.phases||[]).forEach(function(x){if(x.status==='active'&&!x.endDate){_phaseHistory(x,{endDate:addDays(ph.startDate,-1)<x.startDate?x.startDate:addDays(ph.startDate,-1),status:'ended'});}});
  DB.phases.push(ph);save('phase:start');
  /* The first plan comes from setup; later ones from a new phase. */
  if(typeof notePlanChange==='function'){var _first=(typeof plansOf==='function')&&!plansOf().length;
    notePlanChange(_first?'setup':'phase change',{reason:_first?'Created from your setup: your goal, your circumstances and your first phase.':'A new '+((PHASE_TYPES[ph.type]||{}).label||ph.type).toLowerCase()+' phase started.'});}
  return ph;
}
function endPhase(id,outcome){
  var ph=DB.phases.filter(function(p){return p.id===id;})[0];if(!ph)return null;
  pushUndo('end phase');emitEvent('phase.ended',{id:ph.id,endDate:todayISO(),outcome:outcome||''});_phaseHistory(ph,{endDate:todayISO(),status:'ended',outcome:outcome||''});
  try{archivePhase(ph);}catch(e){_q(e);}
  save('phase:end');return ph;
}
/* THE single phase-mutation primitive. Every path that changes a phase target — the phase editor, a decision
   applying an intervention, an experiment starting — must go through this. Two mutation paths meant two
   different behaviours: one recorded phase history (so replay could reconstruct it) and one did not, and both
   generated interventions, producing duplicates whose `from` value was read after the mutation had already
   happened (recording "2200 → 2200" instead of "2400 → 2200").
   `opts.intervention` controls the record: false to suppress it, or an object to attribute it to a decision or
   experiment. It is generated exactly once, here, from the pre-mutation values. */
var MAJOR_PHASE_VARS=['calorieTarget','proteinTarget','stepTarget','cardioSessions','cardioMinutes','trainingSessions'];
var PHASE_VAR_LABEL={calorieTarget:'calories',proteinTarget:'protein',stepTarget:'steps',cardioSessions:'cardio',cardioMinutes:'cardio',trainingSessions:'training'};
function updatePhase(id,patch,opts){
  opts=opts||{};
  var ph=DB.phases.filter(function(p){return p.id===id;})[0];if(!ph)return null;
  if(!opts.noUndo)pushUndo(opts.label||'edit phase');
  var changed={},before={};
  Object.keys(patch).forEach(function(k){if(patch[k]===undefined)return;if(JSON.stringify(ph[k])!==JSON.stringify(patch[k])){changed[k]=patch[k];before[k]=ph[k]===undefined?null:ph[k];}});
  if(!Object.keys(changed).length){ph.updatedAt=nowISO();if(!opts.noSave)save('phase:edit');return ph;}
  emitEvent('phase.targetsChanged',{id:ph.id,before:before,changed:changed});
  _phaseHistory(ph,changed); // records {at, before} so phaseAsOf() can reconstruct this phase on any past day
  var majors=Object.keys(changed).filter(function(k){return MAJOR_PHASE_VARS.indexOf(k)>=0;});
  if(majors.length&&opts.intervention!==false){
    var iv=opts.intervention||{};
    var primary=majors[0];
    try{var ivRec={id:uid('iv'),date:iv.date||todayISO(),createdAt:nowISO(),
      variable:majors.length===1?(PHASE_VAR_LABEL[primary]||primary):'multiple',
      from:before[primary],to:changed[primary], // pre-mutation value, captured above
      changes:majors.map(function(k){return {variable:PHASE_VAR_LABEL[k]||k,from:before[k],to:changed[k]};}),
      decisionId:iv.decisionId||null,experimentId:iv.experimentId||null,
      source:iv.source||'phase-edit',expected:iv.expected||'',
      recheckDate:iv.recheckDate!==undefined?iv.recheckDate:addDays(todayISO(),14),
      status:'active',outcome:null,phaseId:ph.id,
      note:iv.note||('targets edited: '+majors.join(', '))};DB.interventions.push(ivRec);emitEvent('intervention.recorded',ivRec,{at:ivRec.createdAt});}catch(e){_q(e);}
  }
  ph.updatedAt=nowISO();if(!opts.noSave)save('phase:edit');
  /* The plan records the change and why. A decision applies its targets through here too and records its own trigger. */
  if(typeof notePlanChange==='function'&&opts.label!=='apply intervention')notePlanChange('your edit',{reason:'You changed the phase\u2019s targets.'});
  return ph;
}
/* Program changes are phase-adjacent state and need the same treatment: the program control appended to
   settings.programHistory while the phase editor wrote settings.program directly, so replaying a past day
   could show today's program. setProgram is now the only way to change it. */
function setProgram(key,opts){
  opts=opts||{};
  if(!key||(typeof PROGRAMS==='object'&&!PROGRAMS[key]))return false;
  var prev=DB.settings.program;
  if(prev===key)return false;
  emitEvent('program.changed',{from:prev||null,to:key,source:opts.source||'user'});
  DB.settings.program=key;
  DB.settings.programHistory=(DB.settings.programHistory||[]).concat([{at:nowISO(),program:key,from:prev||null,source:opts.source||'user'}]);
  if(!opts.silent){try{addObservation({type:'context',date:todayISO(),value:'new program ('+((PROGRAMS[key]||{}).label||key)+')',source:'system'},{silent:true,noSave:true});}catch(e){_q(e);}}
  if(!opts.noSave)save('program');
  if(typeof notePlanChange==='function')notePlanChange('programme change',{reason:'The programme changed to '+((PROGRAMS[key]||{}).label||key)+'.'});return true;
}
function phaseWeek(ph,date){if(!ph)return null;return weekOf(date||asOf(),ph.startDate);}
function phaseLabel(ph){return ph?((PHASE_TYPES[ph.type]||{}).label||ph.type):'No phase';}

/* ---- training sessions (sets are observations of load × reps × RIR) ---- */
function addSession(s){
  var rec={id:uid('sess'),date:s.date||todayISO(),name:s.name||'Session',template:s.template||null,durationMin:num(s.durationMin),notes:s.notes||'',source:s.source||'manual',createdAt:s.createdAt||nowISO(),
    sets:(s.sets||[]).filter(function(x){return x&&x.exercise&&num(x.reps)!=null;}).map(function(x){return {exercise:String(x.exercise).trim(),load:num(x.load),reps:num(x.reps),rir:num(x.rir),note:x.note||''};}),
    phaseId:(phaseAt(s.date||todayISO())||{}).id||null,retracted:false};
  if(!s.silent)pushUndo('log training');
  DB.sessions.push(rec);emitEvent('session.added',rec,{at:rec.createdAt});_memoInvalidate();if(!s.noSave)save('session');return rec;
}
function retractSession(id){var s=DB.sessions.filter(function(x){return x.id===id;})[0];if(!s)return false;pushUndo('delete session');s.retracted=true;s.retractedAt=nowISO();emitEvent('session.retracted',{id:id},{at:s.retractedAt});_memoInvalidate();save('session:retract');return true;}
/* Sessions follow the same rule as observations: a session deleted today was still known last month. */
function _sessionVisible(s,date){
  if(!s)return false;
  if(s.date>date)return false;
  if(s.createdAt&&s.createdAt.slice(0,10)>date)return false;
  if(s.retracted){var ra=s.retractedAt;if(!_ASOF||!ra||String(ra).slice(0,10)<=date)return false;}
  if(s.supersededBy){var sa=s.supersededAt;if(!_ASOF||!sa||String(sa).slice(0,10)<=date)return false;}
  return true;
}
/* Editing a session supersedes it rather than overwriting it, exactly as a food-log edit does. A training
   session edited today must still read as it did last week in a replay of last week. */
function updateSession(id,patch){
  var old=(DB.sessions||[]).filter(function(x){return x.id===id;})[0];
  if(!old)return null;
  pushUndo('edit session');
  var at=nowISO();
  var rec=JSON.parse(JSON.stringify(old));
  rec.id=uid('sess');rec.createdAt=at;rec.supersedes=old.id;rec.retracted=false;
  delete rec.supersededBy;delete rec.supersededAt;delete rec.retractedAt;
  Object.keys(patch||{}).forEach(function(k){if(k!=='id'&&k!=='createdAt')rec[k]=patch[k];});
  rec.edit={of:old.id,at:at,changed:Object.keys(patch||{})};
  old.supersededBy=rec.id;old.supersededAt=at;
  DB.sessions.push(rec);
  emitEvent('session.superseded',{of:old.id,record:rec},{at:at});
  _memoInvalidate();save('session:edit');
  return rec;
}
function sessionHistory(id){
  var out=[],seen={};
  var walk=function(sid){
    if(!sid||seen[sid])return;seen[sid]=1;
    var s=(DB.sessions||[]).filter(function(x){return x.id===sid;})[0];
    if(!s)return;
    out.push(s);
    if(s.supersedes)walk(s.supersedes);
  };
  walk(id);
  var s0=(DB.sessions||[]).filter(function(x){return x.id===id;})[0];
  while(s0&&s0.supersededBy){s0=(DB.sessions||[]).filter(function(x){return x.id===s0.supersededBy;})[0];if(s0)out.unshift(s0);}
  return out.sort(function(a,b){return String(a.createdAt)<String(b.createdAt)?-1:1;});
}
function sessionsOf(opts){opts=opts||{};var date=opts.asOf||asOf();return (DB.sessions||[]).filter(function(s){return _sessionVisible(s,date)&&(!opts.from||s.date>=opts.from);}).sort(function(a,b){return a.date<b.date?-1:1;});}
