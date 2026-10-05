/* ============================================================================
   SCHEDULES (usage review: "too rigid for irregular schedules such as 2-2-3 day and night 12-hour shifts")
   Availability was weekday names and programme sessions were keyed to weekdays, which cannot describe a rotation that
   does not repeat weekly. A schedule is now one of:
     weekly     \u2014 the days of the week you can train (as before; nothing changes for these records);
     rotation   \u2014 a repeating cycle of day shifts (D), night shifts (N) and days off (O), anchored to the date the
                  cycle started, with a rule per shift type: no training, a short session, or a full one;
     irregular  \u2014 the next days you can train, picked one by one.
   For rotations and irregular schedules the programme's sessions are placed IN ORDER onto available dates, from the
   anchor, so past days keep their assignments; at most the programme's weekly number of lifting sessions falls in any
   seven days, never more than three lifting days run together, a short day gets a short slot, and the first day off
   after nights is kept for sleep unless the person turns that off.
   ============================================================================ */
var SHIFT_LABELS={D:'Day shift',N:'Night shift',O:'Day off',E:'Evening shift'};
var ROTATION_PRESETS={
  'pitman-dn':{label:'2-2-3, days then nights (28-day cycle)',pattern:'DDOODDDOODDOOONNOONNNOONNOOO',note:'two weeks of 2-2-3 on days, then two on nights'},
  'pitman-d':{label:'2-2-3, days only (14-day cycle)',pattern:'DDOODDDOODDOOO'},
  'pitman-n':{label:'2-2-3, nights only (14-day cycle)',pattern:'NNOONNNOONNOOO'},
  'dupont':{label:'DuPont (28-day cycle)',pattern:'NNNNOOODDDONNNOOODDDDOOOOOOO',note:'4 nights, 3 off, 3 days, 1 off, 3 nights, 3 off, 4 days, 7 off'},
  '4on4off-dn':{label:'4 on, 4 off, days then nights (16-day cycle)',pattern:'DDDDOOOONNNNOOOO'},
  '4on4off-d':{label:'4 on, 4 off, days only (8-day cycle)',pattern:'DDDDOOOO'},
  'custom':{label:'My own pattern',pattern:null}
};
var SHIFT_RULE_OPTIONS=[['none','No training'],['short','A short session'],['full','A full session']];
function scheduleModel(){
  var s=DB.settings.schedule||{},p=prof()||{};
  var mode=s.mode==='rotation'||s.mode==='irregular'?s.mode:'weekly';
  var rules=Object.assign({D:'short',N:'none',O:'full',E:'short'},s.rules||{});
  var mins=Object.assign({short:Math.min(30,p.sessionMinutes||30),full:p.sessionMinutes||60},s.minutes||{});
  return {mode:mode,pattern:s.pattern||null,preset:s.preset||null,anchor:s.anchor||null,rules:rules,minutes:mins,protectAfterNights:s.protectAfterNights!==false,
    available:s.available||{},weekdays:(DB.settings.trainingDays||[]).slice(),overrides:s.overrides||{},cycleTrain:s.cycleTrain||{}};
}
function shiftOn(date,M){M=M||scheduleModel();if(M.mode!=='rotation'||!M.pattern||!isValidISO(M.anchor))return null;
  var L=M.pattern.length,i=((daysBetween(M.anchor,date)%L)+L)%L;return M.pattern.charAt(i);}
/* What the person can do on a date: none, short or full, with the minutes and the reason. */
function availabilityOn(date,M){
  M=M||scheduleModel();var dn=_DOW[new Date(date+'T12:00:00Z').getUTCDay()];
  if(M.mode==='weekly'){var ok=!M.weekdays.length||M.weekdays.indexOf(dn)>=0;return {level:ok?'full':'none',minutes:ok?M.minutes.full:0,why:ok?'a training day':'not one of your training days'};}
  if(M.mode==='irregular'){var a=M.available[date];if(a==null)return {level:'none',minutes:0,why:'not marked available',unknown:date>todayISO()};
    return {level:a>=45?'full':(a>0?'short':'none'),minutes:a,why:'you marked '+a+' minutes'};}
  var sh=shiftOn(date,M);if(!sh)return {level:'none',minutes:0,why:'the rotation has no start date'};
  if(sh==='O'&&M.protectAfterNights&&shiftOn(addDays(date,-1),M)==='N')return {level:'none',minutes:0,shift:sh,why:'the first day off after nights, kept for sleep'};
  var lv=M.rules[sh]||'none';return {level:lv,minutes:lv==='none'?0:M.minutes[lv],shift:sh,why:SHIFT_LABELS[sh]+(lv==='none'?': no training':(lv==='short'?': a short session':': a full session'))};
}
/* The programme's lifting sessions in order, and its weekly frequency. */
function _liftSequence(prog){var order=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],seq=[];
  order.forEach(function(d){var p=prog.week&&prog.week[d];if(p&&p.kind==='lift')seq.push(p);});return seq;}
/* Deterministic placement from the anchor: past days keep their assignments. */
function scheduledPlan(date,prog){
  /* YOUR CHOICE FIRST: a day set to Train, Rest or Short beats the automatic placement (an off day could be forced to
     rest with no way to say otherwise). Weekly mode follows the schedule's training days \u2014 they were ignored, so two
     places set the days and only the programme's grid counted \u2014 taking the programme's sessions in order. */
  var M=scheduleModel(),seq=_liftSequence(prog),ov=M.overrides[date];
  var shortDay=function(){return {label:'Short session: cardio or mobility',kind:'cardio',minutes:M.minutes.short,chosen:true};};
  if(M.mode==='weekly'){var order=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],dow=_DOW[new Date(date+'T12:00:00Z').getUTCDay()],T=M.weekdays.slice().sort(function(a,b){return order.indexOf(a)-order.indexOf(b);});
    var base=null;if(T.length&&seq.length){var pos=T.indexOf(dow);if(pos>=0){var x=seq[pos%seq.length];base={label:x.label,kind:'lift',template:x.template,minutes:M.minutes.full};}else{var w=(prog.week||{})[dow];base=w&&w.kind!=='lift'?w:null;}}
    else base=(prog.week||{})[dow]||null;
    if(ov==='rest')return null;if(ov==='short')return shortDay();
    if(ov==='train'){if(base&&base.kind==='lift')return Object.assign({},base,{chosen:true});var n=0;for(var k=1;k<=6;k++){var dd=addDays(date,-k);if(order.indexOf(_DOW[new Date(dd+'T12:00:00Z').getUTCDay()])>order.indexOf(dow))break;var dw=_DOW[new Date(dd+'T12:00:00Z').getUTCDay()];if(T.length?T.indexOf(dw)>=0:(((prog.week||{})[dw]||{}).kind==='lift'))n++;}   /* the next session in order, by the same source as the week */
      var y=seq.length?seq[n%seq.length]:null;return y?{label:y.label,kind:'lift',template:y.template,minutes:M.minutes.full,chosen:true}:null;}
    return base;}
  if(!seq.length)return null;
  var anchor=M.mode==='rotation'&&isValidISO(M.anchor)?M.anchor:(Object.keys(M.available).sort()[0]||addDays(todayISO(),-28));
  if(date<anchor)return null;
  var key='sched:'+JSON.stringify([M.mode,M.pattern,M.anchor,M.rules,M.minutes,M.protectAfterNights,Object.keys(M.available).length,prog.id||prog.label,seq.length,M.overrides,M.cycleTrain]);
  var map=memo(key,function(){var out={},k=0,run=0,recent=[],end=addDays(todayISO(),60),perWeek=seq.length,plen=(M.pattern||'').length;
    for(var d=anchor;d<=end;d=addDays(d,1)){var av=availabilityOn(d,M);recent=recent.filter(function(x){return daysBetween(x,d)<7;});
      var choice=M.overrides[d]||(M.mode==='rotation'&&plen?M.cycleTrain[daysBetween(anchor,d)%plen]:null);
      if(choice==='rest'){run=0;continue;}
      if(choice==='short'){out[d]=Object.assign(shortDay(),{shift:av.shift||null});run=0;continue;}
      if(choice==='train'||(av.level==='full'&&recent.length<perWeek&&run<3)){out[d]={label:seq[k%seq.length].label,kind:'lift',template:seq[k%seq.length].template,shift:av.shift||null,minutes:choice==='train'?M.minutes.full:av.minutes,chosen:choice==='train'};k++;run++;recent.push(d);}
      else{if(av.level==='short')out[d]={label:'Short session: cardio or mobility',kind:'cardio',shift:av.shift||null,minutes:av.minutes};run=0;}}
    return out;});
  return map[date]||null;
}
/* The next days, for the plan's view of a rotating or irregular schedule. */
function scheduleAhead(n,prog){prog=prog||trainingProgram();var out=[];for(var i=0;i<(n||14);i++){var d=addDays(todayISO(),i),av=availabilityOn(d),pl=scheduledPlan(d,prog);
  out.push({date:d,shift:av.shift||null,level:av.level,why:av.why,planned:pl?pl.label:null,kind:pl?pl.kind:null});}return out;}
function setSchedule(o){
  var s=Object.assign({},DB.settings.schedule||{});
  if(o.mode)s.mode=o.mode;if(o.preset){s.preset=o.preset;if(ROTATION_PRESETS[o.preset]&&ROTATION_PRESETS[o.preset].pattern)s.pattern=ROTATION_PRESETS[o.preset].pattern;}
  if(o.pattern!=null)s.pattern=String(o.pattern).toUpperCase().replace(/[^DNOE]/g,'').slice(0,42)||null;
  if(o.anchor&&isValidISO(o.anchor))s.anchor=o.anchor;if(o.rules)s.rules=Object.assign({},s.rules||{},o.rules);
  if(o.minutes)s.minutes=Object.assign({},s.minutes||{},o.minutes);if(o.protectAfterNights!=null)s.protectAfterNights=!!o.protectAfterNights;
  if(o.available)s.available=Object.assign({},s.available||{},o.available);
  if(o.override){s.overrides=Object.assign({},s.overrides||{});if(o.override.choice&&o.override.choice!=='auto')s.overrides[o.override.date]=o.override.choice;else delete s.overrides[o.override.date];}
  if(o.cycleChoice){s.cycleTrain=Object.assign({},s.cycleTrain||{});if(o.cycleChoice.choice&&o.cycleChoice.choice!=='auto')s.cycleTrain[o.cycleChoice.index]=o.cycleChoice.choice;else delete s.cycleTrain[o.cycleChoice.index];}
  DB.settings.schedule=s;_memoInvalidate();save('settings');
  if(typeof notePlanChange==='function')notePlanChange('constraint change',{reason:'Your schedule changed.'});
  return {status:'ok',schedule:s};
}
function scheduleAudit(){var M=scheduleModel(),issues=[];
  if(M.mode==='rotation'){if(!M.pattern)issues.push('a rotation needs a pattern');if(!isValidISO(M.anchor))issues.push('a rotation needs the date its cycle started');
    if(M.pattern&&!/^[DNOE]+$/.test(M.pattern))issues.push('the pattern may only use D, N, O and E');}
  return {ok:!issues.length,issues:issues,mode:M.mode};}
