/* ============================================================================
   REGION: NAVIGATION AND INTERACTION SYSTEM
   The principle this file implements: every important state must be navigable to, every important action must
   have at least one obvious path, and every power-user path must have a discoverable equivalent. A capability
   that exists only because someone might guess a keyboard shortcut does not exist.

   The command taxonomy below is the single register of what this application can do. The command palette, the
   keyboard map, the utility rail and the interaction matrix are all projections of it, so a capability cannot
   be reachable one way and invisible another.
   ============================================================================ */
var COMMAND_GROUPS=[
  {id:'navigation',label:'Navigation',note:'move between views, dates and history positions'},
  {id:'logging',label:'Logging',note:'record an observation, meal, session or note'},
  {id:'editing',label:'Editing',note:'correct, retract or duplicate an existing record'},
  {id:'analysis',label:'Analysis',note:'compare, replay, explain and project'},
  {id:'decisions',label:'Decisions',note:'act on, inspect or override the current recommendation'},
  {id:'recovery',label:'Recovery',note:'undo, restore, retry'},
  {id:'discovery',label:'Discovery',note:'search, commands, help'},
  {id:'system',label:'System',note:'settings, storage, backup, diagnostics'}
];
/* Surfaces a command can be reached through. `ui` means a visible control exists in a view; `rail` the
   right-side utility rail; `palette` the command palette; `key` a keyboard shortcut; `context` a long-press or
   secondary-click menu; `sheet` inside a sheet only. */
var SURFACES=['ui','rail','palette','key','context','sheet'];

/* ---------- application navigation history ----------
   Browser history is one dimension; application position is several — tab, scroll offset, selected date,
   active filter. Closing a sheet should not lose the place the user was reading, and Back should return to
   where they actually were rather than reloading a view at the top. */
var _NAV=[],_NAV_AT=-1,_NAV_SUPPRESS=false;
function navSnapshot(){
  return {tab:_TAB,scroll:(typeof window!=='undefined'?(window.scrollY||0):0),
    day:(typeof _FOOD_DAY!=='undefined'?_FOOD_DAY:null),logDay:(typeof _LOG_DAY!=='undefined'?_LOG_DAY:null),
    range:(typeof _PROGRESS_RANGE!=='undefined'?_PROGRESS_RANGE:null),
    sym:(typeof _SYM!=='undefined'?(_SYM||[]).slice():null),
    whatif:(typeof _WHATIF!=='undefined'?_WHATIF:null),
    replay:(typeof _REPLAY!=='undefined'&&_REPLAY?_REPLAY.date:null),at:nowISO()};
}
function navPush(){
  if(_NAV_SUPPRESS)return;
  var snap=navSnapshot();var cur=_NAV[_NAV_AT];
  if(cur&&cur.tab===snap.tab&&cur.day===snap.day&&cur.range===snap.range&&cur.replay===snap.replay){_NAV[_NAV_AT]=snap;return;}
  if(cur)_NAV[_NAV_AT]=Object.assign(cur,{scroll:snap.scroll===0?cur.scroll:snap.scroll});
  _NAV=_NAV.slice(0,_NAV_AT+1);_NAV.push(snap);_NAV_AT=_NAV.length-1;
  if(_NAV.length>60){_NAV=_NAV.slice(-60);_NAV_AT=_NAV.length-1;}
}
function navRestore(snap){
  if(!snap)return;
  _NAV_SUPPRESS=true;
  try{
    if(snap.day!=null&&typeof _FOOD_DAY!=='undefined')_FOOD_DAY=snap.day;
    if(snap.logDay!=null&&typeof _LOG_DAY!=='undefined')_LOG_DAY=snap.logDay;
    if(snap.range!=null&&typeof _PROGRESS_RANGE!=='undefined')_PROGRESS_RANGE=snap.range;
    if(snap.sym&&typeof _SYM!=='undefined')_SYM=snap.sym.slice();
    if(snap.whatif!==undefined&&typeof _WHATIF!=='undefined')_WHATIF=snap.whatif;
    if(snap.tab&&snap.tab!==_TAB)switchTab(snap.tab);else renderAll();
    restoreScroll(snap.scroll);
  }catch(e){_q(e);}
  _NAV_SUPPRESS=false;
}
function navBack(){if(_NAV_AT<=0)return false;if(_NAV[_NAV_AT])_NAV[_NAV_AT].scroll=window.scrollY||0;_NAV_AT--;navRestore(_NAV[_NAV_AT]);return true;}
function navForward(){if(_NAV_AT>=_NAV.length-1)return false;_NAV_AT++;navRestore(_NAV[_NAV_AT]);return true;}
function navCanBack(){return _NAV_AT>0;}
function navCanForward(){return _NAV_AT<_NAV.length-1;}
function navHistory(){return _NAV.map(function(s,i){return {index:i,current:i===_NAV_AT,tab:s.tab,day:s.day,at:s.at};});}

/* ---------- scroll memory ----------
   Per-tab scroll offsets, restored on return. Automatic movement is never applied while a sheet is open, and
   never steals focus: an unexpected scroll is as disorienting for a screen-reader user as a focus jump. */
var _SCROLL={},_SCROLL_BEFORE_SHEET=null;
function rememberScroll(){if(_TAB)_SCROLL[_TAB]=window.scrollY||0;}
function restoreScroll(y){
  if(typeof window==='undefined'||!window.scrollTo)return;
  var target=y!=null?y:(_SCROLL[_TAB]||0);
  /* Clamp every scroll, not just the explicit ones. A remembered position from a longer view, or a page-down
     near the end, would otherwise land past the content in the padding that clears the floating controls. */
  /* Never negative, whatever happens. The upper bound needs a measured height, so it is applied only when
     one is available — clamping to a height of zero would pin every scroll to the top. */
  target=Math.max(0,target||0);
  try{
    var vh=window.innerHeight||600;
    var docH=Math.max(document.body.scrollHeight||0,document.documentElement.scrollHeight||0);
    if(docH>vh)target=Math.min(target,docH-vh);
  }catch(e){}
  try{window.scrollTo({top:target,behavior:prefersReducedMotion()?'auto':'smooth'});}catch(e){try{window.scrollTo(0,target);}catch(x){}}
}
function prefersReducedMotion(){
  if(DB&&DB.settings&&DB.settings.motion==='reduced')return true;
  try{return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);}catch(e){return false;}
}
function scrollToTop(){restoreScroll(0);announce('Top of '+(_TAB||'view'));}
/* The end of the CONTENT, not the end of the document. `main` carries 150px of bottom padding so the
   floating controls never cover a card, and scrolling to the document end parks the viewport inside that
   padding — the last card scrolled off the top and a blank strip below it. The target is the bottom of the
   last real element, brought to the bottom of the viewport. */
function contentBottom(){
  var view=document.querySelector('.view.active')||document.querySelector('main');
  if(!view)return null;
  var kids=[].slice.call(view.children).filter(function(el){
    return el.offsetParent!==null||el.getClientRects().length;   // skip anything not rendered
  });
  var last=kids[kids.length-1];
  if(!last||!last.getBoundingClientRect)return null;
  var r=last.getBoundingClientRect();
  if(!r.height&&!r.bottom)return null;                            // no layout available (e.g. jsdom)
  return (window.scrollY||0)+r.bottom;
}
function bottomScrollTarget(opts){
  opts=opts||{};
  var vh=opts.innerHeight!=null?opts.innerHeight:(window.innerHeight||600);
  var docH=opts.docHeight!=null?opts.docHeight:Math.max(document.body.scrollHeight,document.documentElement.scrollHeight);
  var maxScroll=Math.max(0,docH-vh);
  var cb=opts.contentBottom!==undefined?opts.contentBottom:contentBottom();
  if(cb==null)return maxScroll;                                   // no measurement: the old behaviour
  /* A small margin so the final card is not flush against the edge, and never past the real maximum. */
  return Math.max(0,Math.min(maxScroll,Math.round(cb-vh+24)));
}
function scrollToBottom(){
  restoreScroll(bottomScrollTarget());
  announce('End of '+(_TAB||'view'));
}
function scrollByViewport(frac){
  var vh=window.innerHeight||600;
  var next=(window.scrollY||0)+vh*frac;
  /* Paging down stops at the end of the content rather than continuing into the padding. */
  if(frac>0)next=Math.min(next,bottomScrollTarget());
  restoreScroll(Math.max(0,next));
}
function scrollToSection(id){
  var el=document.getElementById(id);if(!el)return false;
  var y=(el.getBoundingClientRect().top+(window.scrollY||0))-70; // clear the sticky header
  restoreScroll(Math.max(0,y));return true;
}
/* Newly created content is scrolled to only when the user asked for it — never on a background refresh. */
function revealRecord(kind,id){
  var el=document.querySelector('[data-record="'+kind+':'+id+'"]')||document.getElementById(kind+'-'+id);
  if(!el)return false;
  var y=(el.getBoundingClientRect().top+(window.scrollY||0))-70;restoreScroll(Math.max(0,y));
  el.classList.add('flash');setTimeout(function(){el.classList.remove('flash');},1200);
  return true;
}

/* ---------- date navigation ----------
   The day strip moves one day at a time. Most questions about a record are "when did this last happen", so
   the jumps below are the ones worth having: previous logged day, previous weigh-in, previous session, and the
   dated events the decision layer already knows about. */
function currentDay(){if(_TAB==='food'&&typeof _FOOD_DAY!=='undefined'&&_FOOD_DAY)return _FOOD_DAY;if(typeof _LOG_DAY!=='undefined'&&_LOG_DAY)return _LOG_DAY;return todayISO();}
function setCurrentDay(date){
  if(!isValidISO(date))return false;
  if(date>todayISO())date=todayISO();
  if(typeof _FOOD_DAY!=='undefined')_FOOD_DAY=date;
  if(typeof _LOG_DAY!=='undefined')_LOG_DAY=date;
  navPush();renderAll();announce(longDate(date));return true;
}
function dayStep(delta){return setCurrentDay(addDays(currentDay(),delta));}
function prevDayWith(pred,from,limitDays){
  var d=from||currentDay();limitDays=limitDays||400;
  for(var i=1;i<=limitDays;i++){var c=addDays(d,-i);if(pred(c))return c;}
  return null;
}
function nextDayWith(pred,from,limitDays){
  var d=from||currentDay();limitDays=limitDays||400;
  for(var i=1;i<=limitDays;i++){var c=addDays(d,i);if(c>todayISO())return null;if(pred(c))return c;}
  return null;
}
function DAY_JUMPS(){
  var anyObs=function(c){return DB.observations.some(function(o){return o.date===c&&_visible(o,todayISO());});};
  var anyFood=function(c){return foodLogsOn(c).length>0;};
  var anyWeigh=function(c){return DB.observations.some(function(o){return o.type==='weight'&&o.date===c&&_visible(o,todayISO());});};
  var anySession=function(c){return sessionsOf().some(function(s){return s.date===c;});};
  return [
    {id:'day.prev',label:'Previous day',key:'\u2190',run:function(){dayStep(-1);}},
    {id:'day.next',label:'Next day',key:'\u2192',run:function(){dayStep(1);}},
    {id:'day.today',label:'Today',key:'T',run:function(){setCurrentDay(todayISO());}},
    {id:'day.prevLogged',label:'Previous logged day',run:function(){var d=prevDayWith(anyObs);d?setCurrentDay(d):announce('No earlier logged day');}},
    {id:'day.nextLogged',label:'Next logged day',run:function(){var d=nextDayWith(anyObs);d?setCurrentDay(d):announce('No later logged day');}},
    {id:'day.prevFood',label:'Previous day with food logged',run:function(){var d=prevDayWith(anyFood);d?setCurrentDay(d):announce('No earlier food log');}},
    {id:'day.prevWeigh',label:'Previous weigh-in',run:function(){var d=prevDayWith(anyWeigh);d?setCurrentDay(d):announce('No earlier weigh-in');}},
    {id:'day.prevSession',label:'Previous training day',run:function(){var d=prevDayWith(anySession);d?setCurrentDay(d):announce('No earlier session');}},
    {id:'day.phaseStart',label:'Jump to the start of this phase',run:function(){var p=activePhase();p?setCurrentDay(p.startDate):announce('No active phase');}},
    {id:'day.lastIntervention',label:'Jump to the last intervention',run:function(){var iv=(DB.interventions||[]).slice().sort(function(a,b){return a.date<b.date?1:-1;})[0];iv?setCurrentDay(iv.date):announce('No interventions yet');}},
    {id:'day.pick',label:'Jump to a date\u2026',run:function(){promptDialog({title:'Jump to a date',label:'Date (YYYY-MM-DD)',value:currentDay()}).then(function(v){if(v&&isValidISO(v))setCurrentDay(v);else if(v)toast('Use YYYY-MM-DD',{tone:'negative'});});}}
  ];
}

/* ---------- attention queue ----------
   Not notifications, and no badge counts for their own sake. Every item answers three questions: what
   happened, why it matters, and what can be done — and carries the action that does it. */
/* Domains feed the same attention queue as everything else, so a new domain needs no queue of its own. */
function _domainAttention(){
  var out=[];
  try{
    domainFindings().filter(function(f){return f.severity==='action'||f.severity==='attention';})
      .forEach(function(f){
        out.push({id:'dom-'+f.domain+'-'+Math.abs(_hashStr(f.text)),
          severity:f.severity==='action'?'action':'review',
          what:f.text,
          why:f.domainLabel+' \u00b7 '+(f.basis||f.cls),
          cando:f.act?'Open':'Review',act:f.act||'nav.domains',arg:f.arg||null,tab:null});
      });
    domainProposals().forEach(function(p){
      out.push({id:'domprop-'+p.domain,severity:'review',
        what:p.verb,why:(p.why[0]||p.domainLabel),
        cando:p.act?'Act on it':'See why',act:p.act||'nav.domains',arg:p.arg||null,tab:null});
    });
  }catch(e){_q(e,'P2');}
  return out;
}
function _hashStr(s){var h=0;for(var i=0;i<String(s).length;i++)h=((h<<5)-h+String(s).charCodeAt(i))|0;return h;}
function attentionQueue(){
  var items=[];
  var add=function(o){items.push(o);};
  /* System states that were separate banners on Today now arrive here too; Today presents from this queue (H1). */
  try{
    if(typeof _SAVE_STATE!=='undefined'&&_SAVE_STATE&&_SAVE_STATE.ok===false)add({id:'save-failing',severity:'action',what:'Saving is failing',
      why:String(_SAVE_STATE.lastError||'storage refused the last write')+'. Changes may not survive closing the app.',cando:'Export a backup now',act:'data.backup',tab:'tools'});
    if(typeof _SW_UPDATE!=='undefined'&&_SW_UPDATE)add({id:'update-ready',severity:'system',what:'An update is ready',
      why:'It applies on next launch.',cando:'Update now',act:'pwa.update',tab:'today'});
    if(typeof navigator!=='undefined'&&navigator.onLine===false)add({id:'offline',severity:'system',what:'You are offline',
      why:'Everything works; the branded food database loads only what is already cached.',cando:null,act:null,tab:'today'});
  }catch(e){_q(e,'P2');}
  try{
    var due=experimentsDue();
    due.forEach(function(e){add({id:'exp:'+e.id,severity:'action',what:'An experiment reached its recheck date',
      why:'An experiment that is never evaluated becomes a belief instead of a result',
      cando:'Evaluate '+(e.intervention||e.variable),act:'exp.evaluate',arg:e.id,tab:'experiments'});});
    var overdue=(DB.predictions||[]).filter(function(p){return p.status==='pending'&&p.dueDate&&p.dueDate<todayISO();});
    if(overdue.length)add({id:'pred',severity:'action',what:overdue.length+' forecast'+(overdue.length===1?'':'s')+' past due',
      why:'Calibration only improves when forecasts are scored against what happened',
      cando:'Score them now',act:'pred.score',tab:'learn'});
    var an=detectAnomalies();
    if(an.length)add({id:'anom',severity:'review',what:an.length+' anomal'+(an.length===1?'y':'ies')+' in the record',
      why:'An outlier or implausible value distorts every trend downstream of it',
      cando:'Review the flagged entries',act:'nav.dataQuality',tab:'diagnose'});
    var trust=dataTrust();
    Object.keys(trust.streams||{}).forEach(function(k){var st=trust.streams[k];
      if(st.level==='low')add({id:'trust:'+k,severity:'review',what:k+' data is thin or stale',
        why:'Every model reading '+k+' widens its interval to match',
        cando:'See what is missing',act:'nav.missing',arg:k,tab:'diagnose'});});
    var u=uncertaintyChain();
    if(u.ceiling==='low')add({id:'unc',severity:'review',what:'Calorie numbers carry low confidence',
      why:u.text,cando:'See the cheapest way to fix that',act:'nav.voi',tab:'learn'});
    var jobs=jobsSummary().filter(function(j){return j.ok===false;});
    jobs.forEach(function(j){add({id:'job:'+j.id,severity:'system',what:j.label+' did not complete',
      why:j.lastText||'a scheduled check failed',cando:'Run it again',act:'jobs.runOne',arg:j.id,tab:'tools'});});
    if(_SCHEMA_REJECTION)add({id:'schema',severity:'system',what:'A stored record could not be opened',
      why:_SCHEMA_REJECTION.reason,cando:'Inspect storage and restore a backup',act:'nav.tab',arg:'tools',tab:'tools'});
    var last=DB.settings.lastBackupAt;
    if(!last||daysBetween(last.slice(0,10),todayISO())>14)add({id:'backup',severity:'system',
      what:last?('Last export was '+ageLabel(last.slice(0,10))):'No backup has ever been exported',
      why:'The export is the only copy of the record you control',cando:'Export a backup',act:'data.backup',tab:'tools'});
    var ph=activePhase();
    if(!ph)add({id:'phase',severity:'action',what:'No active phase',
      why:'Without a phase there are no targets, so adherence and rate checks cannot fire',
      cando:'Start a phase',act:'phase.start',tab:'plan'});
  }catch(e){_q(e);}
  /* Domain items join the queue BEFORE it is ordered. Appending them afterwards left review items sitting
     below system ones and broke the action-first guarantee the queue makes. */
  try{items=items.concat(_domainAttention());}catch(e){_q(e,'P2');}
  /* The plan's signals — it changed, it does not fit, a constraint is missing, a save was lost — arrive here like any other. */
  try{if(typeof planAttentionItems==='function')items=items.concat(planAttentionItems());}catch(e){_q(e,'P2');}
  var rank={action:0,review:1,system:2};
  /* SNOOZED, NEVER DISMISSED FOR GOOD. "Not now" hides an item for a day (act now), three days (review) or a week (system);
     three snoozes in a row and it must stay visible for a day before it can be snoozed again. A snooze record whose item
     has gone (the cause resolved) is cleared. */
  var SZ=DB.settings.attentionSnooze||{},liveIds={},snoozed=[];items.forEach(function(i){liveIds[i.id]=1;});
  Object.keys(SZ).forEach(function(k){if(!liveIds[k])delete SZ[k];});
  items=items.filter(function(i){var z=SZ[i.id];if(z&&z.until&&z.until>nowISO()){snoozed.push(i);return false;}return true;});
  items.forEach(function(i){var z=SZ[i.id];i.snoozeCount=z?z.count||0:0;i.canSnooze=!(z&&z.count>=3&&z.lastUntil&&(Date.now()-Date.parse(z.lastUntil))<86400000);});
  items.sort(function(a,b){return rank[a.severity]-rank[b.severity];});
  return {items:items,snoozed:snoozed,counts:{action:items.filter(function(i){return i.severity==='action';}).length,
    review:items.filter(function(i){return i.severity==='review';}).length,
    system:items.filter(function(i){return i.severity==='system';}).length}};
}

/* ---------- missing data and data quality, as navigation ----------
   Uncertainty becomes a path rather than a disclaimer: what is limited, why, and the action that improves it. */
function missingDataReport(){
  var rows=[];
  var streams=[['weight','weight'],['calories','intake'],['protein','protein'],['steps','steps'],['sleep','sleep'],['waist','waist']];
  streams.forEach(function(pair){
    var type=pair[0],label=pair[1];
    var have=obsOf(type,{from:addDays(asOf(),-13)}).length;
    var missing=[];for(var i=0;i<14;i++){var d=addDays(asOf(),-i);if(!obsOf(type,{from:d,to:d}).length)missing.push(d);}
    rows.push({type:type,label:label,have:have,of:14,missingDays:missing,
      limits:type==='weight'?'the weight trend interval, and every energy number that depends on it':
             (type==='calories'?'the personal maintenance estimate and the energy-balance interval':
             (type==='waist'?'the fat-versus-other reading':'adherence and recovery context')),
      action:{label:'Log '+label,act:'log.type',arg:type}});
  });
  var sessions=sessionsOf({from:addDays(asOf(),-13)}).length;
  rows.push({type:'session',label:'training sessions',have:sessions,of:(activePhase()||{}).trainingSessions?Math.round((activePhase().trainingSessions)*2):6,missingDays:[],
    limits:'the strength trend, which is the only muscle-retention proxy available without a lab',action:{label:'Log a session',act:'session.new'}});
  rows.sort(function(a,b){return (a.have/a.of)-(b.have/b.of);});
  return {rows:rows,asOf:asOf(),note:'An unlogged day is unknown, not zero. Every model states what it needs before it states a number.'};
}
function dataQualityReport(){
  var groups=[];
  var an=detectAnomalies();
  var byKind={};an.forEach(function(a){(byKind[a.kind]=byKind[a.kind]||[]).push(a);});
  Object.keys(byKind).forEach(function(k){groups.push({kind:k,count:byKind[k].length,
    items:byKind[k].slice(0,12).map(function(a){return {id:a.obs.id,type:a.obs.type,date:a.obs.date,detail:a.detail,act:'obs.inspect',arg:a.obs.id};})});});
  var flagged=DB.observations.filter(function(o){return _visible(o,asOf())&&o.flags&&o.flags.length;});
  if(flagged.length)groups.push({kind:'flagged on entry',count:flagged.length,
    items:flagged.slice(0,12).map(function(o){return {id:o.id,type:o.type,date:o.date,detail:o.flags.join('; '),act:'obs.inspect',arg:o.id};})});
  var lowQ=DB.observations.filter(function(o){return _visible(o,asOf())&&measurementQuality(o).level==='low';});
  if(lowQ.length)groups.push({kind:'low measurement quality',count:lowQ.length,
    items:lowQ.slice(0,12).map(function(o){return {id:o.id,type:o.type,date:o.date,detail:measurementQuality(o).factors.join('; '),act:'obs.inspect',arg:o.id};})});
  var stale=[];['weight','waist','calories','sleep'].forEach(function(t){var o=latestObs(t);var f=o?freshness(t,o.date):null;if(!o||(f&&f.state!=='fresh'))stale.push({id:t,type:t,date:o?o.date:null,detail:o?('last '+ageLabel(o.date)):'never logged',act:'log.type',arg:t});});
  if(stale.length)groups.push({kind:'stale streams',count:stale.length,items:stale});
  var pcs=protocolChanges(120);
  if(pcs.length)groups.push({kind:'protocol discontinuities',count:pcs.length,
    items:pcs.slice(0,12).map(function(p){return {id:p.kind,type:'context',date:p.date,detail:p.text+' \u2014 affects '+(p.affects||[]).join(', '),act:'nav.day',arg:p.date};})});
  return {groups:groups,total:groups.reduce(function(a,g){return a+g.count;},0)};
}

/* ---------- unified timeline ----------
   The epistemic architecture is observation → decision → intervention → prediction → outcome → calibration.
   This makes that chain traversable: every event carries the record it came from. */
function timeline(opts){
  opts=opts||{};var days=opts.days||60;var from=addDays(asOf(),-days);var ev=[];
  (DB.decisions||[]).forEach(function(d){if(d.date<from||!_knownBy(d,asOf()))return;
    ev.push({at:d.at||d.date+'T12:00:00.000Z',date:d.date,kind:'decision',label:d.verb||d.code,detail:d.lede||'',
      cls:d.confidence?('confidence '+d.confidence):'',id:d.id,act:'obs.inspectDecision',arg:d.id});});
  (DB.interventions||[]).forEach(function(i){if(i.date<from||!_knownBy(i,asOf()))return;
    ev.push({at:i.createdAt||i.date+'T12:00:00.000Z',date:i.date,kind:'intervention',
      label:i.variable+(i.from!=null&&i.to!=null?' '+i.from+' \u2192 '+i.to:' changed'),detail:i.note||i.expected||'',id:i.id,act:'nav.day',arg:i.date});});
  (DB.experiments||[]).forEach(function(e){if(!_knownBy(e,asOf()))return;
    if(e.startDate>=from)ev.push({at:e.createdAt||e.startDate+'T12:00:00.000Z',date:e.startDate,kind:'experiment',label:'Experiment started: '+(e.intervention||e.variable),detail:e.prediction||'',id:e.id,act:'exp.open',arg:e.id});
    var done=e.completedAt||e.abandonedAt;
    if(done&&done.slice(0,10)>=from)ev.push({at:done,date:done.slice(0,10),kind:'outcome',label:'Experiment '+(e.conclusion||e.status),detail:e.summary||'',id:e.id,act:'exp.open',arg:e.id});});
  (DB.predictions||[]).forEach(function(p){if(!p.madeAt)return;
    if(p.madeAt.slice(0,10)>=from)ev.push({at:p.madeAt,date:p.madeAt.slice(0,10),kind:'prediction',label:'Forecast stamped',detail:p.subject+(p.lo!=null?(' '+fmtWeight(p.lo,{bare:true})+'\u2013'+fmtWeight(p.hi)):''),id:p.id});
    if(p.status==='scored'&&p.scoredAt&&p.scoredAt.slice(0,10)>=from)ev.push({at:p.scoredAt,date:p.scoredAt.slice(0,10),kind:'calibration',label:'Forecast scored',detail:(p.covered?'inside':'outside')+' the stated range'+(p.error!=null?(', error '+fmtSigned(p.error,2)):''),id:p.id});});
  (DB.phases||[]).forEach(function(p){if(!_knownBy(p,asOf()))return;
    if(p.startDate>=from)ev.push({at:p.createdAt||p.startDate+'T00:00:00.000Z',date:p.startDate,kind:'phase',label:phaseLabel(p)+' started',detail:'',id:p.id,act:'phase.edit',arg:p.id});
    (p.history||[]).forEach(function(h){if(h.at.slice(0,10)<from)return;
      var keys=Object.keys(h.before||{});ev.push({at:h.at,date:h.at.slice(0,10),kind:'target',label:'Targets edited',detail:keys.join(', '),id:p.id,act:'phase.edit',arg:p.id});});});
  obsOf('context',{from:from}).forEach(function(o){ev.push({at:o.createdAt||o.at,date:o.date,kind:'context',label:o.value,detail:'',id:o.id,act:'nav.day',arg:o.date});});
  (DB.negatives||[]).forEach(function(n){if(n.date<from||!_knownBy(n,asOf()))return;
    ev.push({at:n.createdAt||n.at,date:n.date,kind:'negative',label:'Recorded as ineffective: '+n.intervention,detail:String(n.observed||'').slice(0,120),id:n.id});});
  changePoints().items.forEach(function(cp){if(cp.date<from)return;
    ev.push({at:cp.date+'T12:00:00.000Z',date:cp.date,kind:'changepoint',label:cp.text,detail:(cp.attribution||{}).text||'',id:cp.stream,act:'nav.day',arg:cp.date});});
  if(opts.kinds&&opts.kinds.length)ev=ev.filter(function(e){return opts.kinds.indexOf(e.kind)>=0;});
  ev.sort(function(a,b){return String(a.at)<String(b.at)?1:-1;});
  return {events:ev.slice(0,opts.limit||120),days:days,kinds:['decision','intervention','experiment','outcome','prediction','calibration','phase','target','context','negative','changepoint']};
}

/* ---------- focus mode ----------
   Hides secondary metadata, research and diagnostics so the current decision and today's logging are the only
   things on screen. It never hides a warning or an uncertainty statement: reducing clutter must not reduce
   honesty. */
function focusMode(){return !!(DB.settings&&DB.settings.focusMode);}
function setFocusMode(on){
  DB.settings.focusMode=!!on;
  document.documentElement.setAttribute('data-focus',on?'on':'off');
  save('focus');announce(on?'Focus mode on. Secondary detail hidden.':'Focus mode off.');
  renderAll();
}

/* ---------- undo history ----------
   "Undo" that does not say what it will undo is a gamble. Every entry carries its label and time. */
function undoHistory(){
  var stack=(typeof _undoStack!=='undefined'&&_undoStack)?_undoStack:[];
  /* newest first, with the label the user will actually see before committing to it */
  return stack.slice().reverse().map(function(u,i){return {steps:i+1,label:u.label||'change',at:u.at||null,age:u.at?ageLabel(u.at.slice(0,10)):''};});
}

/* ---------- search domains ----------
   One ambiguous search box makes everything equally hard to find. Domains are addressable with a prefix, and
   an unprefixed query searches everything with exact matches first. */
var SEARCH_DOMAINS=[
  {id:'food',label:'Food',prefix:'food:',run:function(q){return foodSearchLocal(q,12).map(function(f){return {kind:'food',label:f.name,detail:foodKcalLabel(f)+' \u00b7 '+(f.category||f.source),act:'food.pick',arg:f.id};});}},
  {id:'exercise',label:'Exercises',prefix:'exercise:',run:function(q){return (typeof EXERCISES!=='undefined'?EXERCISES:[]).filter(function(e){return String(e.name||e).toLowerCase().indexOf(q.toLowerCase())>=0;}).slice(0,12).map(function(e){return {kind:'exercise',label:e.name||e,detail:(e.pattern||'')+(e.primary?(' \u00b7 '+e.primary):''),act:'session.new'};});}},
  {id:'observation',label:'Observations',prefix:'obs:',run:function(q){var toks=q.toLowerCase();return DB.observations.filter(function(o){return _visible(o,asOf())&&((OBS_TYPES[o.type]||{}).label||o.type).toLowerCase().indexOf(toks)>=0;}).slice(-15).reverse().map(function(o){return {kind:'observation',label:(OBS_TYPES[o.type]||{}).label+' '+(o.value!=null?o.value:''),detail:shortDate(o.date)+' \u00b7 '+o.source,act:'obs.inspect',arg:o.id};});}},
  {id:'session',label:'Sessions',prefix:'session:',run:function(q){return sessionsOf().filter(function(s){return (s.name||'').toLowerCase().indexOf(q.toLowerCase())>=0||(s.sets||[]).some(function(x){return String(x.exercise).toLowerCase().indexOf(q.toLowerCase())>=0;});}).slice(-12).reverse().map(function(s){return {kind:'session',label:s.name||'Session',detail:shortDate(s.date)+' \u00b7 '+(s.sets||[]).length+' sets',act:'session.open',arg:s.id};});}},
  {id:'decision',label:'Decisions',prefix:'decision:',run:function(q){return decisionsOf().filter(function(d){return ((d.verb||'')+' '+(d.code||'')+' '+(d.lede||'')).toLowerCase().indexOf(q.toLowerCase())>=0;}).slice(-12).reverse().map(function(d){return {kind:'decision',label:d.verb||d.code,detail:shortDate(d.date)+' \u00b7 '+(d.confidence||''),act:'obs.inspectDecision',arg:d.id};});}},
  {id:'experiment',label:'Experiments',prefix:'experiment:',run:function(q){return (DB.experiments||[]).filter(function(e){return ((e.question||'')+' '+(e.variable||'')).toLowerCase().indexOf(q.toLowerCase())>=0;}).slice(-12).reverse().map(function(e){return {kind:'experiment',label:e.intervention||e.variable,detail:(e.conclusion||e.status)+' \u00b7 '+shortDate(e.startDate),act:'exp.open',arg:e.id};});}},
  {id:'evidence',label:'Evidence',prefix:'evidence:',run:function(q){return REF_EVIDENCE.filter(function(e){return ((e.topic||'')+' '+(e.summary||'')+' '+(e.citation||'')).toLowerCase().indexOf(q.toLowerCase())>=0;}).slice(0,10).map(function(e){return {kind:'evidence',label:e.topic,detail:String(e.summary).slice(0,110),act:'nav.tab',arg:'learn'};});}},
  {id:'note',label:'Notes',prefix:'note:',run:function(q){return obsOf('note').filter(function(o){return String(o.value||'').toLowerCase().indexOf(q.toLowerCase())>=0;}).slice(-12).reverse().map(function(o){return {kind:'note',label:String(o.value).slice(0,60),detail:shortDate(o.date),act:'obs.inspect',arg:o.id};});}}
];
function searchAll(raw){
  var q=String(raw||'').trim();if(!q)return {query:'',domain:null,results:[]};
  var domain=null;
  for(var i=0;i<SEARCH_DOMAINS.length;i++){var d=SEARCH_DOMAINS[i];if(q.toLowerCase().indexOf(d.prefix)===0){domain=d;q=q.slice(d.prefix.length).trim();break;}}
  var dateM=/^date:(\d{4}-\d{2}(-\d{2})?)$/.exec(q);
  if(dateM)return {query:q,domain:'date',results:[{kind:'date',label:'Go to '+dateM[1],detail:'jump the day strip to this date',act:'nav.day',arg:dateM[1].length===7?dateM[1]+'-01':dateM[1]}]};
  var results=[];
  var domains=domain?[domain]:SEARCH_DOMAINS;
  domains.forEach(function(d){try{var r=d.run(q)||[];r.forEach(function(x){x.domain=d.id;x.domainLabel=d.label;});results=results.concat(domain?r:r.slice(0,4));}catch(e){_q(e);}});
  var ql=q.toLowerCase();
  results.sort(function(a,b){var ea=String(a.label).toLowerCase()===ql?0:(String(a.label).toLowerCase().indexOf(ql)===0?1:2);var eb=String(b.label).toLowerCase()===ql?0:(String(b.label).toLowerCase().indexOf(ql)===0?1:2);return ea-eb;});
  return {query:q,domain:domain?domain.id:null,results:results.slice(0,40),
    hint:domain?null:'Narrow with a prefix: '+SEARCH_DOMAINS.map(function(d){return d.prefix;}).join(' ')+' date:2026-08'};
}

/* ---------- keyboard map ----------
   The single source for both the hotkey handler and the help sheet, so a shortcut cannot exist without being
   documented. */
var KEYMAP=[
  {keys:'\u2318/Ctrl K',label:'Command palette',group:'discovery'},
  {keys:'/',label:'Search',group:'discovery'},
  {keys:'?',label:'Keyboard help',group:'discovery'},
  {keys:'\u2318/Ctrl Z',label:'Undo the last change',group:'recovery'},
  {keys:'Esc',label:'Close a sheet, dialog or replay',group:'navigation'},
  {keys:'1\u20139',label:'Go to a view by position',group:'navigation'},
  {keys:'G then H / L / P / T / F / R',label:'Go to Today, Log, Plan, Train, Food or Review',group:'navigation'},
  {keys:'[ and ]',label:'Back and forward through application history',group:'navigation'},
  {keys:'\u2190 / \u2192',label:'Previous / next day',group:'navigation'},
  {keys:'T',label:'Jump to today',group:'navigation'},
  {keys:'Home / End',label:'Top / bottom of the view',group:'navigation'},
  {keys:'L',label:'Quick log',group:'logging'},
  {keys:'F',label:'Focus mode',group:'system'},
  {keys:'R',label:'Replay a past day',group:'analysis'},
  {keys:'H',label:'Today',group:'navigation'},
  {keys:'?',label:'Ask the record',group:'discovery'},
  {keys:'A',label:'Attention queue',group:'discovery'},
  {keys:'Tab / Shift+Tab',label:'Move through controls; inside a sheet focus stays in the sheet',group:'navigation'},
  {keys:'Enter / Space',label:'Activate the focused control',group:'navigation'}
];

/* ---------- the command register ----------
   Every command declares its group and the surfaces it is reachable through. `interactionMatrix()` projects
   this into the audit table, and the self-test asserts the coverage rules below. */
/* ---------- command metadata (catalogue §1–§15) ----------
   Every registered action is in the register. Some are INTERNAL — a field handler inside a sheet, a
   dispatcher hook — and those are marked rather than omitted, so the audit still sees them and nobody has
   to remember to add one. A command carries what a person needs to decide whether to run it: what it does,
   whether it can run right now, and why not when it cannot.

   `available` returns true, or a STRING SAYING WHY NOT. A disabled control that will not say why is a dead
   end; the catalogue is explicit about this and it is the whole reason the reason is a string. */
var REQUIRES_SUBJECT=/^(welcome\.|sources\.(prefer|deletePreview|deleteConfirm)|qa\.(run|hide)|tpl\.(run|delete|saveMeal)|pattern\.(accept|dismiss)|rule\.(enable|toggle)|supp\.(q|add|remove|dose|when)|features\.go|tools\.pin|dictate|voice\.typed|sched\.(mode|weekday|preset|cycleDay|anchor|rule|minutes|avail)|attention\.snooze|weather\.(q|pick)|fold\.hide|import\.file|adapt\.|food\.again|food\.same|food\.notSame|exec\.|scan\.typed|scan\.custom|workout\.(field|setDone|goto|swapTo)|trace\.open|exp\.download|nav\.exercise|nav\.routine|lib\.|post\.|mob\.|mv\.pick|pg\.weeks|nu\.days|bm\.days|viz\.type|dash\.op|dash\.use|dash\.duplicate|dash\.delete|studio\.load|studio\.duplicate|studio\.delete|inf\.question|eq\.retire|sub\.for|skill\.limiter|yoga\.log|stretch\.info|res\.exercise|ask\.(run|field)|move\.(log|skill|assess)|exp\.fromTemplate|gen\.(apply|grocery)|injury\.(review|resolve|region|sev|save)|why\.shown|copy\.(trace|decision)|jump\.go|saved\.|cmd\.pin|ui\.layout|plan\.(swap|sets|move|remove|add|day|adapt|reset)|obs\.(inspect|retract|correct)|food\.(edit|remove|editSave)|exp\.(open|abandon)|session\.(edit|open|retract)|phase\.edit|attention\.go|undo\.at|sel\.act|yields\.apply|jobs\.runOne|device\.test|nav\.(day|section|tab)|day\.(step|jump)|program\.set|timeline\.filter|label\.|voice\.apply|cloud\.(addDevice)|sync\.)/;
var INTERNAL_ACTION=/^(sheet\.|cmdk\.(filter|pick|backdrop)|prompt\.|confirm\.|edit\.close|log\.close|timeline\.filter|yields\.field|voice\.(discard)|sel\.toggle|fold\.|tab\.|ui\.skipToMain|scale\.|set\.|ing\.|recipe\.addIng|food\.pick)/;
var COMMAND_META={
  'log.open':{d:'Record a weight, measurement, or how you are feeling',k:['add','new','entry','quick']},
  'log.type':{d:'Log one specific kind of observation',k:['weight','steps','sleep','waist']},
  'nav.voice':{d:'Dictate an entry and confirm it before it is saved',k:['speak','say','dictate','microphone']},
  'nav.label':{d:'Turn a nutrition panel into a food you can log',k:['scan','panel','package','nutrition facts']},
  'nav.yields':{d:'Convert a raw weight to its cooked weight using USDA measurements',k:['cooked','raw','shrink','yield']},
  'nav.photos':{d:'Progress photos, stored outside the record so exports stay small',k:['picture','camera','compare']},
  'session.new':{d:'Record a training session',k:['workout','lift','train','gym'],
    available:function(){return true;}},
  'exp.design':{d:'Work out how long an experiment must run to answer its question',k:['power','duration','test']},
  'exp.evaluate':{d:'Score an experiment against what it predicted',k:['result','conclude'],
    available:function(){return experimentsDue().length?true:'no experiment has reached its recheck date yet';}},
  'nav.scenarios':{d:'Compare whole plans, ranked by what you are likely to actually do',k:['what if','compare','plan','forecast']},
  'nav.knowledge':{d:'What this record has established about you, and how stale it is',k:['learned','about me','findings']},
  'nav.episodes':{d:'Travel, illness, plateaus and gaps — what happened, as distinct from what you planned',k:['travel','illness','plateau']},
  'nav.timeline':{d:'Every decision, intervention, forecast and outcome in order',k:['history','events','chronology']},
  'nav.missing':{d:'What data is missing, what it limits, and how to fix it',k:['gaps','incomplete']},
  'nav.dataQuality':{d:'Anomalies, flagged entries and stale streams, each linked to its record',k:['anomalies','outliers','quality']},
  'nav.attention':{d:'Everything waiting on you, with what to do about it',k:['todo','inbox','alerts']},
  'nav.integrity':{d:'Rebuild the record from its own event log and check the two agree',k:['verify','audit','history','events']},
  'nav.storage':{d:'What the record costs, and what can safely be deleted',k:['space','quota','disk']},
  'nav.cloud':{d:'End-to-end encrypted sync between your devices',k:['sync','backup','devices','server']},
  'nav.sync':{d:'Event exchange and merge status across tabs and devices',k:['merge','devices','conflicts']},
  'nav.import':{d:'Bring in data exported from another app',k:['apple health','fitbit','csv','migrate']},
  'nav.health':{d:'Storage, schema and error conditions you can act on',k:['status','problems','errors']},
  'nav.setup':{d:'What is still unconfigured, and what each thing unlocks',k:['onboarding','getting started']},
  'nav.whatChanged':{d:'What changed recently, and why',k:['recent','diff','changes']},
  'nav.voi':{d:'The cheapest measurement that would most improve the next decision',k:['worth measuring','next']},
  'data.backup':{d:'Export the record as a file you control',k:['export','save','download']},
  'data.backupEncrypted':{d:'Export an encrypted backup that needs a passphrase to open',k:['encrypt','secure export'],
    available:function(){return _cryptoOk()?true:'encryption needs a secure context (https or localhost)';}},
  'data.restore':{d:'Restore from a backup file',k:['import','recover']},
  'undo.last':{d:'Undo the most recent change',k:['revert','oops'],
    available:function(){return canUndo()?true:'nothing has been changed yet in this session';}},
  'ui.undoHistory':{d:'See what each undo step would revert before committing to it',k:['history','revert'],
    available:function(){return canUndo()?true:'nothing to undo yet';}},
  'ui.focus':{d:'Hide secondary detail without hiding warnings',k:['zen','simplify','declutter']},
  'ui.keys':{d:'Every keyboard shortcut, generated from the same map the app uses',k:['shortcuts','help','keys']},
  'search.open':{d:'Search food, exercises, observations, sessions, decisions and evidence',k:['find','lookup']},
  'phase.start':{d:'Begin a cut, maintenance or gain phase with targets',k:['goal','plan','new phase'],
    available:function(){return activePhase()?'a phase is already running — end it first':true;}},
  'phase.end':{d:'End the current phase and archive its outcome',k:['finish','close'],
    available:function(){return activePhase()?true:'no phase is running';}},
  'sel.enter':{d:'Select several records to act on together',k:['multi','bulk','batch']},
  'replay.pick':{d:'See the app as it was on a past day, with nothing after it visible',k:['replay','history','past','rewind','time travel']},
  'replay.waypoints':{d:'Jump to a day when something was decided, changed or detected',k:['moments','events','jump']},
  'replay.compare':{d:'What was known then against what is known now, and what actually followed',k:['then','now','hindsight','compare']},
  'replay.exit':{d:'Leave replay and return to today',k:['exit','today','stop'],
    available:function(){return replayActive()?true:'you are not replaying anything';}},
  'gen.program':{d:'Generate candidate training weeks from your days, equipment and history',
    k:['generate','build','program','routine','plan','split']},
  'gen.progress':{d:'What to add, hold or reduce next week, per lift',k:['progress','progression','next week','overload']},
  'gen.meals':{d:'Build a day that hits your targets from foods you already eat',k:['meal','plan','food','day','menu']},
  'nav.equipment':{d:'Individual equipment and supplies: condition, service, expiry and when to reorder',
    k:['equipment','kit','supplies','inventory','service','expiry','reorder']},
  'nav.deload':{d:'Whether several signals agree that you need an easier week',
    k:['deload','easier week','rest week','back off','fatigue']},
  'nav.welcome':{d:'Walk through setup again: you, your goal, training, detail and appearance',k:['setup','welcome','guide','start','onboarding','tour','help']},
  'nav.recoveryAllocation':{d:'What is drawing on your recovery, largest first',k:['recovery','fatigue','stress','sleep','load','allocation']},
  'nav.motorLearning':{d:'Whether your lifts are becoming more consistent',k:['skill','technique','consistency','motor learning','variability']},
  'nav.hydration':{d:'Whether today\u2019s weight is likely water movement',k:['water','hydration','scale','bloat','sodium','carbs']},
  'nav.supplements':{d:'What you take, the evidence, and whether you tested it',k:['supplements','creatine','caffeine','evidence']},
  'exp.custom':{d:'An experiment you design yourself, when none of the ready-made ones fits',k:['experiment','design','custom','own']},
  'sources.open':{d:'Where your record comes from, how sources agree, which one to trust for steps and sleep, and removing a source\u2019s data',k:['sources','data sources','import','apple health','fitbit','withings','duplicate','delete data','devices']},
  'automation.open':{d:'Quick actions, templates, automations, patterns noticed in your record, and home-screen shortcuts',k:['automation','shortcuts','quick actions','templates','routine','one tap','repeat','auto']},
  'supp.open':{d:'Your supplement regimen, vitamins and minerals from food and supplements, evidence and cautions',k:['supplements','vitamins','minerals','creatine','vitamin d','magnesium','iron','regimen','stack','multivitamin']},
  'physio.open':{d:'Aerobic fitness, hydration, energy availability, protein quality, motor learning and supplement effects',k:['fitness','vo2max','cardio','hydration','water','energy availability','protein quality','digestibility','supplements','learning']},
  'features.open':{d:'Every feature, whether it is set up, and one tap to start',k:['features','help','what can','set up','guide','tour']},
  'diag.server':{d:'Checks, layer by layer, whether this deployment reaches the Physique OS server and the weather provider',k:['server','connection','weather not working','sync','deployment','diagnostics','something went wrong']},
  'nav.schedule':{d:'Weekly days, rotating shifts (2-2-3, DuPont, 4-on-4-off, your own) or an irregular week',k:['schedule','shifts','rotation','nights','2-2-3','availability','days']},
  'weather.open':{d:'Current weather, 14-day forecast, the past week, history and air quality for your place',k:['weather','forecast','temperature','rain','uv','air quality','humidity','sunrise','wind']},
  'nav.charts':{d:'Every chart type the app can draw, each from your own record',k:['charts','graphs','visualisation','catalogue','gallery']},
  'workout.start':{d:'Today\u2019s planned session with targets, a rest timer and set-by-set logging',k:['workout','train','session','gym','sets','rest timer','lift']},
  'nav.exlibrary':{d:'Every exercise: how to do it, what it works, easier and harder versions',k:['exercise','library','movement','how to','progression','regression','ladder']},
  'nav.weightTrend':{d:'Your smoothed weight trend',k:['weight','trend','progress','chart']},
  'nav.forecast':{d:'Where your weight is heading, per horizon, with how far to trust it',k:['forecast','predict','projection','future','weeks']},
  'nav.measurement':{d:'Your scale\u2019s noise, bias, drift and calibration',k:['scale','measurement','noise','accuracy','bias']},
  'nav.recoveryState':{d:'Recovery estimated from load, sleep and your ratings, with a forecast',k:['recovery','readiness','fatigue','sore']},
  'nav.internals':{d:'Inference gateway, provenance, run identity and caches, each checked live',k:['internals','provenance','run','debug','system']},
  'nav.exports':{d:'Export layouts, charts, experiments, programs, provenance and data; import with validation',
    k:['export','import','download','backup','csv','json','markdown','share']},
  'nav.movement':{d:'Strength movement patterns and mobility poses drawn on one skeleton, with range of motion',
    k:['movement','mobility','yoga','pose','skeleton','range of motion','technique','pattern']},
  'nav.program':{d:'Your program as a calendar: planned sessions against what was actually done',
    k:['program','calendar','schedule','planned','adherence','sessions','week']},
  'nav.nutritionviz':{d:'Daily intake composition: protein, carbohydrate and fat',
    k:['macros','composition','intake','nutrition','protein','carbs','fat']},
  'nav.bodymap':{d:'A body map of where training load has landed, front and back',
    k:['body map','anatomy','muscles','muscle map','where','load','fatigue']},
  'nav.vizstudio':{d:'Build a chart from any model, validated stage by stage, and save it to your dashboard',
    k:['chart','visualize','visualise','graph','plot','studio','catalogue']},
  'nav.dashboard':{d:'Your dashboard, and an editor for it: move, resize, hide, pin, add and remove widgets',
    k:['dashboard','widgets','layout','home','customise','arrange']},
  'nav.studio':{d:'Edit appearance as a validated specification: custom colour, saved profiles, import and export',
    k:['studio','appearance','theme','colour','color','customise','profile','export']},
  'nav.inference':{d:'Which questions your record can actually answer, what is missing and why, and which estimate to believe',
    k:['inference','identifiable','causal','missing','which estimate','can i know']},
  'nav.maturity':{d:'How far each engine has actually been validated, and what is only infrastructure',
    k:['maturity','validated','trust','grade','evidence level']},
  'nav.maintenance':{d:'Maintenance as a posterior: how likely each value is, and how much is yours rather than the population\u2019s',
    k:['maintenance','tdee','posterior','bayes','calories','how likely']},
  'nav.twin':{d:'Your current state across every layer, and how much of it rests on your own evidence',
    k:['state','twin','model','where am i','fidelity']},
  'nav.optimise':{d:'Plans compared across outcome, burden, time, cost and fatigue without collapsing them',
    k:['optimise','optimize','trade','tradeoff','compare plans','frontier']},
  'nav.recovery2':{d:'Everything bearing on recovery at once, with the signals actually dragging named',
    k:['recovery','readiness','load','fatigue','state','ready']},
  'nav.substitute':{d:'Swap a food for one that fills the same role, with the portion that preserves it',
    k:['swap','substitute','replace','alternative','instead of']},
  'nav.conditioning':{d:'Cardio volume and intensity, work capacity, and whether cardio costs you strength',
    k:['cardio','conditioning','interference','intervals','zone','running']},
  'nav.compose':{d:'What today\u2019s session should contain, and what it should leave out',
    k:['compose','session','today','blocks','plan today']},
  'nav.mobility':{d:'Joint range, the gap between range you have and range you can use, and the stretch kinds',
    k:['mobility','stretch','flexibility','range','rom','joint']},
  'nav.yoga':{d:'What a sequence actually trains, and whether practice does anything for you',
    k:['yoga','practice','pose','sequence','flow','asana']},
  'nav.propagation':{d:'Mechanical demand, where it lands by muscle and joint, four fatigue compartments, and stimulus against cost per lift',
    k:['fatigue','stimulus','demand','propagation','cost','compartments','lands']},
  'nav.resistance':{d:'Volume, exposure and progression per lift, with how each exercise loads through its range',
    k:['resistance','volume','sets','e1rm','strength','progression','fatigue']},
  'move.prepare':{d:'A warm-up built from today\u2019s session, what is sore and how you feel',
    k:['warmup','warm up','prepare','mobility','ramp','activation']},
  'move.recover':{d:'Cool-down and optional range work after training',k:['cooldown','cool down','after','stretch','breathe']},
  'move.library':{d:'Stretching, mobility, activation, isometrics, breathing and practice in one place',
    k:['stretch','mobility','yoga','isometric','breathing','library']},
  'move.progress':{d:'Calisthenics progressions and what is holding you at each step',
    k:['calisthenics','pullup','pistol','progression','skill']},
  'nav.ask':{d:'Ask a question and get an answer from your own record, with its class and basis',
    k:['ask','question','query','what is','how much','why']},
  'nav.graph':{d:'Walk from what the system learned back to the observations underneath it',
    k:['graph','chain','connects','provenance','why']},
  'nav.causal':{d:'How strongly your own record supports each relationship',
    k:['causal','cause','support','evidence','proven']},
  'nav.experiments2':{d:'The questions worth testing next, ranked by what they would resolve',
    k:['test','experiment','next','discover','opportunity']},
  'gen.search':{d:'Search combinations of calories, steps and cardio for the trade-offs worth considering',
    k:['search','optimise','optimize','options','pareto','trade']},
  'nav.domains':{d:'Every area the system tracks: what it concludes, what it would advise, what it cannot answer yet',
    k:['domains','areas','sleep','injury','tracks','engines']},
  'injury.add':{d:'Record a sore area so training recommendations work around it',
    k:['injury','pain','sore','hurt','ache']},
  'nav.planEdit':{d:'Swap exercises, change sets and reps, move days, or adapt the plan to your equipment',
    k:['program','routine','exercises','schedule','equipment','swap','gym']},
  'nav.home':{d:'Back to Today, leaving replay and any selected date behind',k:['today','home','start']},
  'nav.recent':{d:'The last things you recorded',k:['recent','history','latest']},
  'nav.saved':{d:'Searches you saved, re-run fresh each time',k:['saved','bookmarks','queries']},
  'search.save':{d:'Save the search you have typed so you can run it again',k:['save','bookmark','pin search'],
    available:function(){return savedSearches().length<20?true:'twenty saved searches is the limit';}},
  'nav.jump':{d:'Jump to the last plan change, the last forecast, or the next thing waiting on you',k:['jump','goto','last']},
  'nav.since':{d:'What you logged and what the system changed since yesterday',k:['since','yesterday','new']},
  'nav.compare':{d:'Forecast against outcome, phase against phase, before against after',k:['compare','versus','vs']},
  'sel.export':{d:'Export the selected records as CSV',k:['csv','export','download'],
    available:function(){return selectionCount()?true:'nothing is selected';}},
  'nav.back':{d:'Return to where you were, including scroll position and date',k:['previous','return']},
  'nav.forward':{d:'Go forward again',k:['next']},
  'nav.top':{d:'Jump to the top of this view',k:['scroll','beginning']},
  'nav.bottom':{d:'Jump to the bottom of this view',k:['scroll','end']}
};
/* Which commands make sense HERE (catalogue §12): the current view first, then anything globally useful. */
var VIEW_COMMANDS={
  today:['log.open','nav.ask','nav.attention','nav.since','nav.jump','nav.whatChanged'],
  log:['log.open','nav.voice','nav.label','nav.yields','sel.enter','day.prevLogged'],
  plan:['phase.start','nav.optimise','gen.search','nav.scenarios','exp.design'],
  train:['nav.compose','session.new','nav.resistance','nav.propagation','nav.deload','move.prepare'],
  food:['gen.meals','nav.substitute','nav.label','nav.yields','nav.voice'],
  body:['log.type','nav.mobility','move.library','nav.photos'],
  progress:['nav.timeline','nav.compare','nav.whatChanged'],
  diagnose:['nav.maintenance','nav.recovery2','nav.missing','nav.dataQuality','nav.timeline'],
  experiments:['nav.experiments2','exp.design','exp.evaluate','nav.causal'],
  learn:['nav.knowledge','nav.inference','nav.twin','nav.graph','nav.causal','nav.domains'],
  archive:['replay.pick','replay.waypoints','replay.compare','nav.timeline'],
  tools:['nav.maturity','nav.integrity','nav.storage','nav.cloud','nav.import','data.backup']
};
function commandAvailability(id){
  var meta=COMMAND_META[id];
  if(!meta||!meta.available)return {ok:true};
  var r;
  try{r=meta.available();}catch(e){_q(e,'P2');return {ok:true};}
  return r===true?{ok:true}:{ok:false,reason:String(r)};
}
function commandsHere(){
  var tab=_TAB||'today';
  var ids=(VIEW_COMMANDS[tab]||[]).slice();
  var reg={};commandRegister().forEach(function(c){reg[c.id]=c;});
  return ids.map(function(id){
    var c=reg[id];if(!c||!commandVisibleAtLevel(c))return null;
    var av=commandAvailability(id);
    return {id:id,label:c.label,description:(COMMAND_META[id]||{}).d||'',available:av.ok,reason:av.reason||null};
  }).filter(Boolean);
}
/* Recency and frequency, so the palette surfaces what this person actually uses (§6). Stored in settings,
   capped, and never allowed to reorder a destructive command into a resting position. */
function noteCommandUse(id){
  if(!DB||!DB.settings)return;
  var u=DB.settings.commandUse||{};
  var e=u[id]||{n:0,at:null};
  e.n++;e.at=nowISO();u[id]=e;
  var keys=Object.keys(u);
  if(keys.length>200){keys.sort(function(a,b){return (u[a].at<u[b].at)?-1:1;});delete u[keys[0]];}
  DB.settings.commandUse=u;
}
function commandUseScore(id){
  var u=(DB.settings&&DB.settings.commandUse)||{};
  var e=u[id];if(!e)return 0;
  var ageDays=e.at?daysBetween(String(e.at).slice(0,10),todayISO()):999;
  return e.n*Math.pow(0.5,ageDays/21);   // frequency, halving every three weeks
}
function commandRegister(){
  var reg=[];
  var push=function(o){reg.push(o);};
  (typeof COMMANDS!=='undefined'?COMMANDS:[]).forEach(function(c){
    var group=/^nav\./.test(c.id)?'navigation':(/^log\./.test(c.id)?'logging':(/^(exp|decision|neg|pred)\./.test(c.id)?'decisions':(/^(data|demo|settings|ui|jobs|device)\./.test(c.id)?'system':(/^(replay|diag|progress|learn)\./.test(c.id)?'analysis':'discovery'))));
    push({id:c.id,label:c.label,group:group,surfaces:['palette'].concat(c.hint?['key']:[]),source:'COMMANDS'});
  });
  DAY_JUMPS().forEach(function(j){push({id:j.id,label:j.label,group:'navigation',surfaces:['palette','ui'].concat(j.key?['key']:[]),source:'DAY_JUMPS'});});
  NAV_COMMANDS.forEach(function(c){push({id:c.id,label:c.label,group:c.group,surfaces:c.surfaces,source:'NAV_COMMANDS'});});
  /* Every registered action joins the register, so nothing can be reachable without being auditable.
     Internal handlers are marked, not omitted. */
  var have={};reg.forEach(function(c){have[c.id]=1;});
  if(typeof ACTIONS==='object')Object.keys(ACTIONS).forEach(function(id){
    if(have[id])return;
    reg.push({id:id,label:_labelFor(id),group:_groupFor(id),
      surfaces:INTERNAL_ACTION.test(id)?['internal']:['ui'],
      internal:INTERNAL_ACTION.test(id),source:'ACTIONS'});
  });
  reg.forEach(function(c){
    var m=COMMAND_META[c.id];
    c.description=m?m.d:'';
    c.keywords=m&&m.k?m.k:[];
    var av=commandAvailability(c.id);
    c.available=av.ok;c.unavailableReason=av.reason||null;
    c.useScore=commandUseScore(c.id);
    /* A command is STANDALONE if it can be run from the palette with no argument. Row-level actions
       (retract THIS observation, evaluate THAT experiment) need a subject and belong on the row, not in a
       list of verbs with nothing to act on. Both are in the register; only standalone ones are offered. */
    c.standalone=!c.internal&&!REQUIRES_SUBJECT.test(c.id);
  });
  var seen={};return reg.filter(function(c){if(seen[c.id])return false;seen[c.id]=1;return true;});
}
function _labelFor(id){
  var m=COMMAND_META[id];if(m&&m.label)return m.label;
  var parts=String(id).split('.');
  var word=parts[parts.length-1].replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase();
  return word.charAt(0).toUpperCase()+word.slice(1)+(parts.length>1?(' ('+parts[0]+')'):'');
}
function _groupFor(id){
  if(/^(nav|day)\./.test(id))return 'navigation';
  if(/^(log|session|food|voice|label|yields|photo)/.test(id))return 'logging';
  if(/^(obs|phase|recipe|sel|bulk)/.test(id))return 'editing';
  if(/^(exp|decision|neg|pred)/.test(id))return 'decisions';
  if(/^(undo|data|storage|events|cloud|sync)/.test(id))return 'recovery';
  if(/^(cmdk|search|ui)/.test(id))return 'discovery';
  return 'system';
}
var NAV_COMMANDS=[
  {id:'nav.back',label:'Back',group:'navigation',surfaces:['rail','palette','key']},
  {id:'nav.forward',label:'Forward',group:'navigation',surfaces:['palette','key']},
  {id:'nav.top',label:'Jump to top',group:'navigation',surfaces:['rail','palette','key']},
  {id:'nav.bottom',label:'Jump to bottom',group:'navigation',surfaces:['palette','key']},
  {id:'nav.attention',label:'Attention queue',group:'discovery',surfaces:['rail','palette','key']},
  {id:'nav.timeline',label:'Timeline',group:'analysis',surfaces:['ui','palette']},
  {id:'nav.missing',label:'What data is missing',group:'analysis',surfaces:['ui','palette']},
  {id:'nav.dataQuality',label:'Data quality',group:'analysis',surfaces:['ui','palette']},
  {id:'nav.voi',label:'What is worth measuring next',group:'analysis',surfaces:['ui','palette']},
  {id:'ui.focus',label:'Focus mode',group:'system',surfaces:['palette','key']},
  {id:'ui.keys',label:'Keyboard help',group:'discovery',surfaces:['palette','key']},
  {id:'ui.undoHistory',label:'Undo history',group:'recovery',surfaces:['rail','palette']},
  {id:'ui.contextMenu',label:'Record actions (long press or right click)',group:'editing',surfaces:['context','sheet'],note:'opens the same inspector a tap on the row opens \u2014 the gesture is an accelerator, not the only route'},
  {id:'search.open',label:'Search',group:'discovery',surfaces:['rail','palette','key']},
  {id:'nav.setup',label:'Setup completeness',group:'system',surfaces:['ui','palette']},
  {id:'nav.whatChanged',label:'What changed',group:'analysis',surfaces:['ui','palette']},
  {id:'sel.enter',label:'Select multiple records',group:'editing',surfaces:['ui','palette']},
  {id:'sel.exit',label:'Cancel selection',group:'editing',surfaces:['ui','palette']},
  {id:'nav.health',label:'System health',group:'system',surfaces:['ui','palette']},
  {id:'nav.storage',label:'Storage',group:'system',surfaces:['ui','palette']},
  {id:'nav.integrity',label:'History integrity',group:'system',surfaces:['ui','palette']},
  {id:'nav.planEdit',label:'Edit the training plan',group:'editing',surfaces:['ui','palette']},
  {id:'nav.domains',label:'What the system tracks',group:'analysis',surfaces:['ui','palette']},
  {id:'gen.program',label:'Build a training plan',group:'decisions',surfaces:['ui','palette']},
  {id:'gen.progress',label:'What to change next week',group:'decisions',surfaces:['ui','palette']},
  {id:'gen.meals',label:'Build a day of food',group:'decisions',surfaces:['ui','palette']},
  {id:'gen.search',label:'Search the options',group:'analysis',surfaces:['ui','palette']},
  {id:'nav.graph',label:'How it connects',group:'analysis',surfaces:['ui','palette']},
  {id:'nav.ask',label:'Ask the record',group:'discovery',surfaces:['ui','palette','key']},
  {id:'move.prepare',label:'Prepare for today\u2019s session',group:'logging',surfaces:['ui','palette']},
  {id:'nav.resistance',label:'Resistance',group:'analysis',surfaces:['ui','palette']},
  {id:'nav.propagation',label:'Where training lands',group:'analysis',surfaces:['ui','palette']},
  {id:'nav.mobility',label:'Mobility and stretching',group:'analysis',surfaces:['ui','palette']},
  {id:'nav.compose',label:'Compose today\u2019s session',group:'decisions',surfaces:['ui','palette']},
  {id:'nav.conditioning',label:'Cardio and conditioning',group:'analysis',surfaces:['ui','palette']},
  {id:'nav.substitute',label:'Swap a food',group:'logging',surfaces:['ui','palette']},
  {id:'nav.recovery2',label:'Recovery state',group:'analysis',surfaces:['ui','palette']},
  {id:'nav.twin',label:'Where you are',group:'analysis',surfaces:['ui','palette']},
  {id:'nav.maintenance',label:'What is your maintenance?',group:'analysis',surfaces:['ui','palette']},
  {id:'nav.maturity',label:'How far has this been validated?',group:'system',surfaces:['ui','palette']},
  {id:'nav.inference',label:'What can be known',group:'analysis',surfaces:['ui','palette']},
  {id:'nav.studio',label:'Presentation Studio',group:'system',surfaces:['ui','palette']},
  {id:'nav.dashboard',label:'Dashboard',group:'analysis',surfaces:['ui','palette']},
  {id:'nav.vizstudio',label:'Visualization Studio',group:'analysis',surfaces:['ui','palette']},
  {id:'nav.bodymap',label:'Where training lands (body map)',group:'analysis',surfaces:['ui','palette']},
  {id:'nav.movement',label:'Movement and mobility',group:'analysis',surfaces:['ui','palette']},
  {id:'nav.program',label:'Program: planned and done',group:'analysis',surfaces:['ui','palette']},
  {id:'nav.nutritionviz',label:'Intake composition',group:'analysis',surfaces:['ui','palette']},
  {id:'nav.exports',label:'Export and import',group:'system',surfaces:['ui','palette']},
  {id:'nav.weightTrend',label:'Weight trend',group:'navigation',surfaces:['ui','palette']},
  {id:'nav.exlibrary',label:'Exercise library',group:'navigation',surfaces:['ui','palette']},
  {id:'exp.custom',label:'Design my own experiment',group:'decisions',surfaces:['ui','palette']},
  {id:'sources.open',label:'Your data sources',group:'navigation',surfaces:['ui','palette']},
  {id:'automation.open',label:'Shortcuts and automation',group:'navigation',surfaces:['ui','palette']},
  {id:'supp.open',label:'Supplements and vitamins',group:'navigation',surfaces:['ui','palette']},
  {id:'physio.open',label:'Physiology models',group:'navigation',surfaces:['ui','palette']},
  {id:'features.open',label:'Everything this app can do',group:'discovery',surfaces:['ui','palette']},
  {id:'diag.server',label:'Test external server',group:'system',surfaces:['ui','palette']},
  {id:'nav.schedule',label:'Your schedule',group:'navigation',surfaces:['ui','palette']},
  {id:'weather.open',label:'Weather',group:'navigation',surfaces:['ui','palette']},
  {id:'nav.charts',label:'Chart catalogue',group:'discovery',surfaces:['ui','palette']},
  {id:'workout.start',label:'Start today\u2019s workout',group:'logging',surfaces:['ui','palette']},
  {id:'nav.recoveryAllocation',label:'What is using your recovery',group:'analysis',surfaces:['ui','palette']},
  {id:'nav.motorLearning',label:'Skill in your lifts',group:'analysis',surfaces:['ui','palette']},
  {id:'nav.hydration',label:'Water and the scale',group:'analysis',surfaces:['ui','palette']},
  {id:'nav.supplements',label:'Your supplements',group:'analysis',surfaces:['ui','palette']},
  {id:'nav.welcome',label:'Setup guide',group:'navigation',surfaces:['ui','palette']},
  {id:'nav.forecast',label:'Weight forecast',group:'analysis',surfaces:['ui','palette']},
  {id:'nav.measurement',label:'How your scale measures',group:'analysis',surfaces:['ui','palette']},
  {id:'nav.recoveryState',label:'Recovery state',group:'analysis',surfaces:['ui','palette']},
  {id:'nav.internals',label:'System internals',group:'system',surfaces:['ui','palette']},
  {id:'nav.equipment',label:'Equipment and supplies',group:'system',surfaces:['ui','palette']},
  {id:'nav.deload',label:'Do you need an easier week?',group:'decisions',surfaces:['ui','palette']},
  {id:'nav.optimise',label:'Trade-offs',group:'decisions',surfaces:['ui','palette']},
  {id:'nav.yoga',label:'Practice and yoga',group:'logging',surfaces:['ui','palette']},
  {id:'move.recover',label:'After the session',group:'logging',surfaces:['ui','palette']},
  {id:'move.library',label:'Movement library',group:'logging',surfaces:['ui','palette']},
  {id:'move.progress',label:'Progressions',group:'analysis',surfaces:['ui','palette']},
  {id:'nav.causal',label:'What your record can support',group:'analysis',surfaces:['ui','palette']},
  {id:'nav.experiments2',label:'What to test next',group:'decisions',surfaces:['ui','palette']},
  {id:'injury.add',label:'Record something sore',group:'logging',surfaces:['ui','palette']},
  {id:'nav.home',label:'Today',group:'navigation',surfaces:['rail','palette','key']},
  {id:'nav.recent',label:'Recent entries',group:'discovery',surfaces:['ui','palette']},
  {id:'nav.saved',label:'Saved searches',group:'discovery',surfaces:['ui','palette']},
  {id:'search.save',label:'Save this search',group:'discovery',surfaces:['ui','palette']},
  {id:'ui.layout',label:'Column layout',group:'system',surfaces:['ui','palette']},
  {id:'nav.jump',label:'Take me to\u2026',group:'navigation',surfaces:['ui','palette']},
  {id:'nav.since',label:'What changed since yesterday',group:'analysis',surfaces:['ui','palette']},
  {id:'nav.compare',label:'Compare',group:'analysis',surfaces:['ui','palette']},
  {id:'sel.export',label:'Export the selected records',group:'system',surfaces:['ui','palette']},
  {id:'trace.open',label:'Where a number comes from',group:'analysis',surfaces:['ui','context']},
  {id:'replay.pick',label:'Replay a past day',group:'analysis',surfaces:['ui','palette','key']},
  {id:'replay.waypoints',label:'Jump to a moment',group:'analysis',surfaces:['ui','palette']},
  {id:'replay.compare',label:'Then and now',group:'analysis',surfaces:['ui','palette']},
  {id:'replay.exit',label:'Back to today',group:'analysis',surfaces:['ui','palette']},
  {id:'nav.sync',label:'Sync and devices',group:'system',surfaces:['ui','palette']},
  {id:'nav.cloud',label:'Encrypted sync',group:'system',surfaces:['ui','palette']},
  {id:'nav.voice',label:'Log by voice',group:'logging',surfaces:['ui','palette']},
  {id:'nav.label',label:'Read a nutrition panel',group:'logging',surfaces:['ui','palette']},
  {id:'nav.yields',label:'Raw to cooked weight',group:'logging',surfaces:['ui','palette']},
  {id:'nav.knowledge',label:'What this record knows about you',group:'analysis',surfaces:['ui','palette']},
  {id:'nav.episodes',label:'Episodes',group:'analysis',surfaces:['ui','palette']},
  {id:'nav.scenarios',label:'Compare plans',group:'analysis',surfaces:['ui','palette']},
  {id:'exp.design',label:'Design an experiment',group:'decisions',surfaces:['ui','palette']},
  {id:'nav.import',label:'Import from another app',group:'system',surfaces:['ui','palette']},
  {id:'nav.photos',label:'Progress photos',group:'logging',surfaces:['ui','palette']},
  {id:'storage.integrity',label:'Run an integrity check',group:'system',surfaces:['ui','palette']},
  {id:'data.backupEncrypted',label:'Export an encrypted backup',group:'system',surfaces:['ui','palette']}
];
/* The audit artifact: every command, the surfaces it is reachable through, and whether it satisfies the
   discoverability rule — nothing may be keyboard-only or context-menu-only. */
function interactionMatrix(){
  var reg=commandRegister().filter(function(c){return !c.internal;});
  var rows=reg.map(function(c){
    var s={};SURFACES.forEach(function(k){s[k]=(c.surfaces||[]).indexOf(k)>=0;});
    var discoverable=s.ui||s.rail||s.palette||s.sheet; // a shortcut alone is not discoverable
    return {id:c.id,label:c.label,group:c.group,surfaces:s,discoverable:discoverable,source:c.source};
  });
  var issues=rows.filter(function(r){return !r.discoverable;}).map(function(r){return {id:r.id,kind:'reachable only by keyboard or context menu'};});
  var byGroup={};rows.forEach(function(r){(byGroup[r.group]=byGroup[r.group]||[]).push(r);});
  return {rows:rows,groups:COMMAND_GROUPS.map(function(g){return {id:g.id,label:g.label,note:g.note,count:(byGroup[g.id]||[]).length};}),
    issues:issues,total:rows.length,
    note:'Every row must be reachable through at least one visible surface. A keyboard shortcut is an accelerator, never the only path.'};
}

/* ---------- "Why?" and "What changed?" as reusable components ----------
   Explanations are generated from the model registry and the decision ledger rather than written per screen,
   so an explanation cannot drift from the thing it explains. Every explanation answers the same six
   questions, in the same order, wherever it appears. */
function whyExplain(modelId,extra){
  var m=modelById(modelId);if(!m)return null;
  var out={id:modelId,title:m.name,cls:m.cls,clsMeaning:CLASSES[m.cls]||'',
    inputs:m.inputs||[],assumptions:m.assumes||[],failsWhen:m.failsWhen||[],
    output:m.output,uncertainty:m.uncertainty,consumers:m.consumers||[],
    freshness:m.freshnessDays!=null?('recomputed when inputs are more than '+m.freshnessDays+' day'+(m.freshnessDays===1?'':'s')+' old'):null};
  var ev=REF_EVIDENCE.filter(function(e){return (extra&&extra.evidence||[]).indexOf(e.id)>=0;});
  out.evidence=ev.map(function(e){return {summary:e.summary,citation:e.citation,unverified:!!e.verify};});
  out.alternatives=(extra&&extra.alternatives)||[];
  out.wouldChange=(extra&&extra.wouldChange)||['more days of the inputs above','a protocol change that makes past values comparable again'];
  return out;
}
function renderWhy(modelId,extra){
  var w=whyExplain(modelId,extra);if(!w)return '';
  var ul=function(a){return '<ul>'+a.map(function(x){return '<li>'+esc(typeof x==='string'?x:(x.text||''))+'</li>';}).join('')+'</ul>';};
  return uiFold('why-'+modelId,'Why this number?',w.cls+' \u00b7 '+esc(String(w.output).slice(0,50)),
    '<div class="why-line"><b>What it is</b> '+esc(w.output)+'</div>'+
    '<div class="why-line"><b>Epistemic class</b> '+esc(w.cls)+' \u2014 '+esc(w.clsMeaning)+'</div>'+
    '<div class="why-line"><b>Inputs</b></div>'+ul(w.inputs)+
    '<div class="why-line"><b>Assumptions</b></div>'+ul(w.assumptions)+
    '<div class="why-line"><b>When it fails</b></div>'+ul(w.failsWhen)+
    '<div class="why-line"><b>Uncertainty</b> '+esc(w.uncertainty)+'</div>'+
    (w.freshness?'<div class="why-line"><b>Freshness</b> '+esc(w.freshness)+'</div>':'')+
    (w.evidence.length?'<div class="why-line"><b>Evidence</b></div><ul>'+w.evidence.map(function(e){return '<li>'+esc(e.summary)+' <span class="muted">'+esc(e.citation)+(e.unverified?' \u2014 unverified':'')+'</span></li>';}).join('')+'</ul>':'')+
    (w.alternatives.length?'<div class="why-line"><b>Alternatives considered</b></div>'+ul(w.alternatives):'')+
    '<div class="why-line"><b>What would change it</b></div>'+ul(w.wouldChange)+
    '<div class="prov">Read by: '+esc(w.consumers.join(', '))+'</div>');
}
/* Every meaningful state transition can be asked "what changed?" — answered from the ledger, not from prose. */
function whatChanged(days){
  days=days||14;var from=addDays(asOf(),-days);var items=[];
  (DB.interventions||[]).forEach(function(i){if(i.date<from||!_knownBy(i,asOf()))return;
    items.push({at:i.createdAt||i.date,date:i.date,what:i.variable+(i.from!=null&&i.to!=null?(' '+i.from+' \u2192 '+i.to):' changed'),
      reason:i.expected||i.note||'recorded without a stated expectation',
      confidence:null,expected:i.expected||null,recheck:i.recheckDate||null,kind:'intervention',id:i.id});});
  (DB.phases||[]).forEach(function(p){(p.history||[]).forEach(function(h){if(h.at.slice(0,10)<from)return;
    Object.keys(h.before||{}).forEach(function(k){
      items.push({at:h.at,date:h.at.slice(0,10),what:k+' '+String(h.before[k])+' \u2192 '+String(p[k]),
        reason:'phase targets edited',confidence:null,kind:'target',id:p.id});});});});
  decisionsOf().forEach(function(d){if(d.date<from)return;
    items.push({at:d.at||d.date,date:d.date,what:d.verb||d.code,reason:d.lede||'',confidence:d.confidence||null,
      recheck:d.recheckDays?addDays(d.date,d.recheckDays):null,kind:'decision',id:d.id});});
  (DB.settings.programHistory||[]).forEach(function(h){if(String(h.at).slice(0,10)<from)return;
    items.push({at:h.at,date:h.at.slice(0,10),what:'training program '+(h.from?h.from+' \u2192 ':'set to ')+h.program,
      reason:'program change \u2014 strength history restarts for exercises that are new to the plan',kind:'program',id:h.program});});
  items.sort(function(a,b){return String(a.at)<String(b.at)?1:-1;});
  return {items:items,days:days,empty:!items.length};
}
function renderWhatChanged(days){
  var c=whatChanged(days);
  if(c.empty)return uiFold('whatchanged','What changed?','nothing in the last '+c.days+' days','<div class="muted">No interventions, target edits, decisions or program changes were recorded in this window.</div>');
  return uiFold('whatchanged','What changed?',c.items.length+' change'+(c.items.length===1?'':'s')+' in '+c.days+' days',
    c.items.slice(0,12).map(function(i){
      return uiRow(esc(i.what),shortDate(i.date),{sub:esc(i.reason||'')+(i.confidence?(' \u00b7 confidence '+esc(i.confidence)):'')+(i.recheck?(' \u00b7 recheck '+shortDate(i.recheck)):''),rsub:i.kind});
    }).join('')+'<div class="prov">Taken from the decision ledger and phase history, so this list cannot disagree with what the system actually did.</div>');
}

/* ---------- setup completeness ----------
   Onboarding is a state, not a one-time tutorial: each incomplete item is a live action, and each says what
   it unlocks rather than nagging for its own sake. */
function setupCompleteness(){
  var p=prof();var ph=activePhase();
  var items=[
    {id:'profile',label:'Profile',done:!!(p&&p.age&&p.sex&&p.heightIn),unlocks:'the population maintenance estimate that stands in until your own is fitted',act:'profile.edit'},
    {id:'baseline',label:'Weight baseline',done:obsOf('weight').length>=7,unlocks:'the weight trend, and every energy number that depends on it',act:'log.type',arg:'weight',
      progress:Math.min(7,obsOf('weight').length)+' of 7 days'},
    {id:'goal',label:'Phase and targets',done:!!ph,unlocks:'adherence, rate-of-loss checks and the decision lattice',act:'phase.start'},
    {id:'nutrition',label:'Intake logging',done:obsOf('calories',{from:addDays(asOf(),-13)}).length>=7,unlocks:'your own maintenance estimate instead of a population equation',act:'log.type',arg:'calories',
      progress:obsOf('calories',{from:addDays(asOf(),-13)}).length+' of 14 days'},
    {id:'training',label:'Training log',done:sessionsOf({from:addDays(asOf(),-27)}).length>=4,unlocks:'the strength trend, the only muscle-retention proxy available without a lab',act:'session.new',
      progress:sessionsOf({from:addDays(asOf(),-27)}).length+' of 4 sessions'},
    {id:'protocol',label:'Measurement protocol',done:obsOf('waist').length>=1&&obsOf('neck').length>=1,unlocks:'the circumference body-composition estimate and the fat-versus-other reading',act:'log.type',arg:'waist'},
    {id:'backup',label:'First backup',done:!!(DB.settings&&DB.settings.lastBackupAt),unlocks:'a copy of the record you control; the app cannot recover one for you',act:'data.backup'}
  ];
  var done=items.filter(function(i){return i.done;}).length;
  return {items:items,done:done,total:items.length,pct:Math.round(100*done/items.length),complete:done===items.length};
}

/* ---------- selection and bulk operations ----------
   Deferred from the previous work order because bulk destructive operations across an append-only record
   need their own design rather than a checkbox bolted onto a list. The design:

   1. A bulk operation is never a new kind of mutation. It is N of the same operation the single-record path
      already performs, so retracting twenty entries produces twenty dated retractions in the ledger — not a
      deletion, and not a special "bulk" record that later code would have to know about.
   2. The whole batch is ONE undo entry. Undoing a mistaken bulk action must not require twenty presses, and
      a half-undone batch is a worse state than either end of it.
   3. Confirmation names the count and the kind, and for destructive actions lists what will go. "Retract 14
      entries" is a decision; "Are you sure?" is not.
   4. Selection is transient. It never persists to the record, never survives a reload, and clears after any
      operation, so a stale selection cannot act on records the user is no longer looking at.
   5. Every bulk action has a single-record equivalent, so the capability is not gated behind discovering
      selection mode. */
var _SEL={active:false,kind:null,ids:{}};
function selectionActive(){return !!_SEL.active;}
function selectionKind(){return _SEL.kind;}
function selectionIds(){return Object.keys(_SEL.ids).filter(function(k){return _SEL.ids[k];});}
function selectionCount(){return selectionIds().length;}
function selectionEnter(kind){_SEL={active:true,kind:kind||'obs',ids:{}};announce('Selection mode. Choose records, then pick an action.');}
function selectionExit(){_SEL={active:false,kind:null,ids:{}};announce('Selection cleared.');}
function selectionToggle(id){
  if(!_SEL.active)return false;
  if(_SEL.ids[id])delete _SEL.ids[id];else _SEL.ids[id]=true;
  return !!_SEL.ids[id];
}
function selectionSelectAll(ids){ids.forEach(function(i){_SEL.ids[i]=true;});}
/* The catalogue of bulk actions. `applies` decides whether an action is offered for the current selection;
   `describe` produces the confirmation text; `run` performs it inside one undo entry. */
function bulkActions(){
  if(_SEL.kind==='obs')return [
    {id:'retract',label:'Retract',danger:true,
     describe:function(recs){return 'These entries stay in the record and remain visible in replays of the days before now. Trends from today forward will exclude them.<br><br>'+recs.slice(0,12).map(function(o){return '\u00b7 '+esc((OBS_TYPES[o.type]||{}).label||o.type)+' '+esc(String(o.value))+' on '+shortDate(o.date);}).join('<br>')+(recs.length>12?('<br>\u00b7 and '+(recs.length-12)+' more'):'');},
     run:function(recs){recs.forEach(function(o){if(!o.retracted){o.retracted=true;o.retractedAt=nowISO();o.retractReason='bulk retraction';emitEvent('observation.retracted',{id:o.id,reason:'bulk retraction'},{at:o.retractedAt});}});return recs.length;}},
    {id:'flag',label:'Flag for review',danger:false,
     describe:function(recs){return 'Marks '+recs.length+' entries for later review. Flagged entries lower measurement quality and appear in Data quality.';},
     run:function(recs){recs.forEach(function(o){o.flags=(o.flags||[]).concat(['flagged for review']);emitEvent('observation.flagged',{id:o.id,flag:'flagged for review'});});return recs.length;}}
  ];
  if(_SEL.kind==='food')return [
    {id:'retract',label:'Remove',danger:true,
     describe:function(recs){return 'These entries are retracted, not deleted: the day\u2019s intake before now is unchanged in replays.<br><br>'+recs.slice(0,12).map(function(l){return '\u00b7 '+esc(l.food.name)+' '+esc(l.portionLabel||'')+' on '+shortDate(l.date);}).join('<br>')+(recs.length>12?('<br>\u00b7 and '+(recs.length-12)+' more'):'');},
     run:function(recs){var days={};recs.forEach(function(l){if(l.retracted)return;l.retracted=true;l.retractedAt=nowISO();emitEvent('food.retracted',{id:l.id},{at:l.retractedAt});days[l.date]=1;});
       Object.keys(days).forEach(function(d){syncNutritionObservations(d);});return recs.length;}},
    {id:'meal',label:'Move to another meal',danger:false,needs:'meal',
     describe:function(recs,arg){return 'Moves '+recs.length+' entries to '+esc(arg)+'. Totals for the day are unchanged; only the meal grouping changes.';},
     /* Superseding rather than mutating: the same rule the single-record path follows, so a replay of a day
        before the move still shows the entry in the meal it was logged to. */
     run:function(recs,arg){var n=0;recs.forEach(function(l){if(changeMeal(l.id,arg))n++;});return n;}},
    {id:'copy',label:'Copy to another day',danger:false,needs:'date',
     describe:function(recs,arg){return 'Copies '+recs.length+' entries to '+esc(arg)+' as new entries. The originals are untouched.';},
     run:function(recs,arg){recs.forEach(function(l){var c=_cloneLog(l,arg,l.meal);DB.foodLogs.push(c);emitEvent('food.logged',c,{at:c.createdAt});});syncNutritionObservations(arg);return recs.length;}}
  ];
  return [];
}
function selectionRecords(){
  var ids=selectionIds();
  if(_SEL.kind==='food')return (DB.foodLogs||[]).filter(function(l){return ids.indexOf(l.id)>=0;});
  return (DB.observations||[]).filter(function(o){return ids.indexOf(o.id)>=0;});
}
/* One undo entry for the whole batch, and the ledger records it as a batch for the audit trail. */
function bulkRun(actionId,arg){
  var act=bulkActions().filter(function(a){return a.id===actionId;})[0];
  var recs=selectionRecords();
  if(!act||!recs.length)return {ok:false,n:0,reason:!act?'unknown action':'nothing selected'};
  pushUndo(act.label.toLowerCase()+' '+recs.length+' '+(_SEL.kind==='food'?'food entries':'observations'));
  var n=0;
  try{n=act.run(recs,arg)||recs.length;}catch(e){_q(e);return {ok:false,n:0,reason:String(e&&e.message||e)};}
  DB.ledger.batches=(DB.ledger.batches||[]).concat([{at:nowISO(),action:actionId,kind:_SEL.kind,count:n,arg:arg||null}]);
  save('bulk:'+actionId);_memoInvalidate();
  selectionExit();
  return {ok:true,n:n,label:act.label};
}

/* ---------- error recovery ----------
   Three failure modes are worth surfacing because the user can act on them, and one is worth surfacing
   because they cannot: a save that did not persist, being offline while something needs the network, a
   quarantined record, and errors the app swallowed to stay usable. Anything the user cannot act on says so
   rather than presenting a button that does nothing. */
function systemHealth(){
  var issues=[];
  var st=(typeof _SAVE_STATE!=='undefined'&&_SAVE_STATE)?_SAVE_STATE:{ok:true};
  if(st.ok===false)issues.push({id:'save',severity:'critical',
    what:'The last change may not have been saved',
    why:st.lastError||'storage rejected the write',
    cando:'Export a backup now \u2014 the record is still in memory, and an export does not depend on storage',
    act:'data.backup',recoverable:true});
  if(typeof navigator!=='undefined'&&navigator.onLine===false)issues.push({id:'offline',severity:'info',
    what:'Offline',why:'Everything except food-database downloads works offline; searches for products not yet cached will fail',
    cando:'Continue \u2014 nothing needs the network',act:null,recoverable:true});
  if(typeof _SCHEMA_REJECTION!=='undefined'&&_SCHEMA_REJECTION)issues.push({id:'schema',severity:'critical',
    what:'A stored record could not be opened',why:_SCHEMA_REJECTION.reason,
    cando:'The raw copy is preserved in IndexedDB. Restore a backup, or export this session before making changes.',
    act:'data.restore',recoverable:true});
  var ic=null;try{ic=integrityCheck('health');}catch(e){}
  if(ic&&!ic.ok)issues.push({id:'integrity',severity:'critical',
    what:'The record failed an integrity check',why:ic.blocking.map(function(x){return x.what;}).join('; '),
    cando:'Export a backup before making further changes, then review the details',act:'storage.integrity',recoverable:true});
  else if(ic&&ic.counts.P1)issues.push({id:'integrity-p1',severity:'warn',
    what:ic.counts.P1+' record problem'+(ic.counts.P1===1?'':'s')+' that can affect a calculation',
    why:'P1 means a number downstream of the affected records may be wrong',
    cando:'Review the integrity report',act:'storage.integrity',recoverable:true});
  var sw=getSwallowedErrors();
  if(sw.bySeverity&&sw.bySeverity.P0)issues.push({id:'p0-errors',severity:'critical',
    what:sw.bySeverity.P0+' error'+(sw.bySeverity.P0===1?'':'s')+' risking data loss were contained',
    why:(sw.critical[sw.critical.length-1]||{}).message||'a write or migration failed',
    cando:'Export a backup now, then export diagnostics',act:'data.backup',recoverable:true});
  if(sw.count)issues.push({id:'swallowed',severity:'warn',
    what:sw.count+' error'+(sw.count===1?'':'s')+' were handled without interrupting you',
    why:'The app continued rather than failing, but something did not work as intended',
    cando:'Send the diagnostics export if this repeats',act:'data.diagnostics',recoverable:false});
  var q=(typeof _IDB_READY!=='undefined')?_IDB_READY:true;
  if(!q)issues.push({id:'idb',severity:'warn',what:'IndexedDB is not available',
    why:'Storage falls back to localStorage, which is smaller and more easily evicted',
    cando:'Export backups more often than usual',act:'data.backup',recoverable:true});
  return {issues:issues,ok:!issues.some(function(i){return i.severity==='critical';}),
    critical:issues.filter(function(i){return i.severity==='critical';}).length};
}
/* Actions that touch storage or the network report failure with a retry, rather than a toast that vanishes.
   `retryable(label, fn)` runs fn, and on failure offers the same call again. */
function retryable(label,fn){
  var attempt=function(n){
    var res;
    try{res=fn();}catch(e){_q(e);res=false;}
    if(res!==false)return true;
    confirmDialog({title:label+' did not complete',
      msg:'This can happen when storage is full or the browser blocked the write.'+(n>1?' It has now failed '+n+' times.':'')+'<br><br>Your data is still in memory. Exporting a backup does not depend on storage.',
      ok:'Try again',cancel:'Export a backup'}).then(function(again){
        if(again)attempt(n+1);else dispatchAct('data.backup');});
    return false;
  };
  return attempt(1);
}

/* ---------- replay as a mode (catalogue §46–§60) ----------
   Replay existed as a form that produced a report. As a MODE it is a different thing: the whole interface
   renders as of a past day, so you read the app the way it was rather than reading a summary of it.

   The danger that makes this worth doing carefully is mistaking historical output for current advice. Three
   things prevent it, and none of them are optional:
     * a persistent banner that cannot be scrolled away from,
     * a distinct visual treatment on every view while the mode is active,
     * every decision rendered in replay is marked as what was decided THEN.
   That is also why there is no autoplay: stepping is deliberate, and each step is a choice. */
var _REPLAY_MODE=null;
function replayMode(){return _REPLAY_MODE;}
function replayActive(){return !!_REPLAY_MODE;}
function replayBounds(){
  var dates=(DB.observations||[]).map(function(o){return o.date;}).sort();
  return {min:dates.length?dates[0]:todayISO(),max:todayISO()};
}
function enterReplay(date){
  var b=replayBounds();
  if(!isValidISO(date))return false;
  if(date>b.max)date=b.max;
  if(date<b.min)date=b.min;
  _REPLAY_MODE={date:date,enteredAt:nowISO(),fromTab:_TAB};
  document.documentElement.setAttribute('data-replay','on');
  _memoInvalidate();renderAll();
  /* Synchronously, not on the render tick: a mode banner that appears a frame late is a frame in which
     historical output looks current. */
  try{updateReplayBanner();}catch(e){_q(e,'P2');}
  announce('Replay mode. Showing '+longDate(date)+'. Nothing after that day is visible.');
  return true;
}
function exitReplay(){
  if(!_REPLAY_MODE)return false;
  _REPLAY_MODE=null;
  document.documentElement.removeAttribute('data-replay');
  _memoInvalidate();renderAll();
  try{updateReplayBanner();}catch(e){_q(e,'P2');}
  announce('Left replay. Showing today.');
  return true;
}
function replayStep(days){
  if(!_REPLAY_MODE)return false;
  var b=replayBounds();
  var next=addDays(_REPLAY_MODE.date,days);
  if(next>b.max)next=b.max;
  if(next<b.min)next=b.min;
  if(next===_REPLAY_MODE.date)return false;
  _REPLAY_MODE.date=next;_memoInvalidate();renderAll();
  try{updateReplayBanner();}catch(e){_q(e,'P2');}
  announce(longDate(next));
  return true;
}
/* The days worth stopping on: when something was decided, changed, started or detected. Scrubbing day by
   day through months of unremarkable data is not how anyone actually looks for the moment something moved. */
function replayWaypoints(limit){
  var pts=[],b=replayBounds();
  var add=function(date,kind,label){if(date>=b.min&&date<=b.max)pts.push({date:date,kind:kind,label:label});};
  (DB.interventions||[]).forEach(function(i){add(i.date,'intervention',i.variable+(i.from!=null&&i.to!=null?(' '+i.from+' \u2192 '+i.to):' changed'));});
  (DB.phases||[]).forEach(function(p){add(p.startDate,'phase',phaseLabel(p)+' started');if(p.endDate)add(p.endDate,'phase',phaseLabel(p)+' ended');});
  (DB.experiments||[]).forEach(function(e){add(e.startDate,'experiment','experiment: '+(e.intervention||e.variable));});
  decisionsOf().forEach(function(d){if(d.code&&d.code!=='HOLD')add(d.date,'decision',d.verb||d.code);});
  try{changePoints(180).items.forEach(function(cp){add(cp.date,'changepoint',cp.text);});}catch(e){_q(e,'P3');}
  try{detectEpisodes(365).episodes.forEach(function(ep){add(ep.start,'episode',ep.label);});}catch(e){_q(e,'P3');}
  var seen={};
  pts=pts.filter(function(p){var k=p.date+p.kind;if(seen[k])return false;seen[k]=1;return true;});
  pts.sort(function(a,b2){return a.date<b2.date?1:-1;});
  return pts.slice(0,limit||40);
}
/* Then versus now: what the system knew on that day, what it decided, and what actually happened after.
   The last part is the only honest way to judge a past decision, and it is the part a replay that only
   reconstructs state cannot give you. */
function replayComparison(date){
  var then=withAsOf(date,function(){
    var S=getCurrentState();
    var dec=null;try{dec=decide();}catch(e){_q(e,'P2');}
    return {weight:S.weight.value,avg7:S.averages.avg7,
      trend:S.trend.status==='ok'?S.trend.slopePerWeek:null,
      trendConfidence:S.trend.status==='ok'?S.trend.confidence:null,
      tdee:S.tdee.status==='ok'?S.tdee.value:null,tdeeCls:S.tdee.cls,
      trust:S.trust.overall.level,
      decision:dec?{code:dec.code,verb:dec.verb,lede:dec.lede,confidence:dec.confidence,
        uncertainty:dec.uncertainty?dec.uncertainty.ceiling:null}:null,
      observations:(DB.observations||[]).filter(function(o){return _visible(o,date);}).length};
  });
  var now=(function(){
    var S=getCurrentState();
    return {weight:S.weight.value,avg7:S.averages.avg7,
      trend:S.trend.status==='ok'?S.trend.slopePerWeek:null,
      tdee:S.tdee.status==='ok'?S.tdee.value:null,tdeeCls:S.tdee.cls,
      trust:S.trust.overall.level,
      observations:(DB.observations||[]).filter(function(o){return _visible(o,todayISO());}).length};
  })();
  /* What the trend actually did over the fortnight after that day, which is what the decision was betting on. */
  var after=null;
  var end=addDays(date,14);
  if(end<=todayISO()){
    var s=dailySeries('weight',end,14);
    if(s.length>=6){
      var ts=theilSen(s.map(function(d){return {x:d.x,y:d.value};}));
      if(ts.slope!=null)after={actualRate:ts.slope*7,days:s.length,through:end};
    }
  }
  var verdict=null;
  if(after&&then.trend!=null){
    var diff=after.actualRate-then.trend;
    verdict=Math.abs(diff)<0.15?'the fortnight after played out close to what the trend implied':
      (diff<0?'the fortnight after ran faster than the trend implied by '+fmtRate(Math.abs(diff)):
              'the fortnight after ran slower than the trend implied by '+fmtRate(Math.abs(diff)));
  }
  var recorded=(DB.decisions||[]).filter(function(d){return d.date===date&&d.source==='system';})[0]||null;
  return {date:date,then:then,now:now,after:after,verdict:verdict,
    recorded:recorded?{code:recorded.code,verb:recorded.verb}:null,
    matchesRecorded:recorded&&then.decision?(recorded.code===then.decision.code):null,
    daysAgo:daysBetween(date,todayISO()),
    note:'Reconstructed from what had been recorded by that day. Anything logged, corrected or retracted afterwards is invisible to it \u2014 which is what makes it a fair test of the decision rather than a rerun with hindsight.'};
}

/* ============================================================================
   DETAIL LEVEL: CASUAL \u00b7 INSIGHTFUL \u00b7 DEVELOPER
   One setting that controls how much every page and panel shows. It is wired through the shared building blocks
   rather than panel by panel, so nothing can be missed: method and provenance notes (.prov), classification badges
   (.cls-mark) and advanced folds are hidden in Casual; developer detail (.dev \u2014 run ids, model versions, maturity)
   appears only in Developer; and every command and tab carries a level, so menus, the palette and the tab bar show
   only what the chosen level includes.
   ============================================================================ */
var DETAIL_LEVELS={
  casual:{rank:0,label:'Casual',desc:'The answer and what to do. No method notes, no badges, no analysis pages.'},
  insightful:{rank:1,label:'Insightful',desc:'The answer with its reasons, uncertainty and the analysis behind it.'},
  developer:{rank:2,label:'Developer',desc:'Everything, plus run ids, model versions and maturity, and the system tools.'}
};
var DETAIL_DEVELOPER=/^(nav\.(health|storage|integrity|lineage|audit|capabilit|registry|models?|inference|provenance|conformance|governance|events|materiali|schema|diagnostics|debug|raw|setup)|trace\.|selftest|jobs\.|device\.|data\.(diagnostics|integrity|storage))/;
var DETAIL_INSIGHTFUL=/^(nav\.(diagnose|knowledge|graph|causal|forecast|scenario|optimi|twin|voi|missing|compare|replay|recall|studio|vizstudio|exports|nutritionviz|bodymap|movement|program|explain|evidence|calibration|uncertainty)|exp\.|replay\.|pred\.)/;
var TAB_LEVEL={today:'casual',log:'casual',plan:'casual',train:'casual',food:'casual',body:'casual',progress:'casual',tools:'casual',
  diagnose:'insightful',experiments:'insightful',learn:'insightful',archive:'insightful'};
function detailLevel(){var d=DB&&DB.settings&&DB.settings.detail;return DETAIL_LEVELS[d]?d:'insightful';}
function commandLevel(id,group){
  if(DETAIL_DEVELOPER.test(id)||group==='system')return /^(nav\.setup|ui\.focus|settings\.)/.test(id)?'casual':'developer';
  if(DETAIL_INSIGHTFUL.test(id)||group==='analysis')return 'insightful';
  return 'casual';
}
function levelAllows(level){return (DETAIL_LEVELS[level]||DETAIL_LEVELS.casual).rank<=DETAIL_LEVELS[detailLevel()].rank;}
function commandVisibleAtLevel(c){return levelAllows(commandLevel(c.id,c.group));}
function detailAudit(){
  /* Every tab has a level, every command resolves to one, and every level has styling behind it. */
  var issues=[];
  (typeof document!=='undefined'?[].slice.call(document.querySelectorAll('[data-tab]')):[]).forEach(function(b){
    var t=b.getAttribute('data-tab');if(!TAB_LEVEL[t])issues.push('tab "'+t+'" has no detail level');});
  commandRegister().forEach(function(c){if(!DETAIL_LEVELS[commandLevel(c.id,c.group)])issues.push(c.id+' resolves to no level');});
  return {ok:issues.length===0,issues:issues,levels:Object.keys(DETAIL_LEVELS)};
}
/* ============================================================================
   PANEL LEVELS \u2014 every panel on every page, classified.
   Casual: logging and following the plan. Insightful: digging deeper \u2014 predictions, forecasts, diagnosis, experiments,
   learning. Developer: where the data comes from and why, and every tool, check and record behind it.
   Built from an inventory of the running app (99 panels on 12 tabs). Applied after every render to whatever is on the
   page, whichever function built it; a panel matching no rule is reported, never silently defaulted.
   ============================================================================ */
var PANEL_LEVEL_RULES=[
  /* today */
  [/^Today\u2019s actions/,'casual'],[/^The plan$/,'casual'],[/^Today at a glance$/,'casual'],[/^Set up more/,'casual'],[/^Supplements and vitamins/,'casual'],[/^Physiology models/,'insightful'],[/^Why, and what would change it/,'casual'],[/^Weather$/,'casual'],[/^How the last four weeks went/,'casual'],[/^Plan history/,'insightful'],[/^How much is still assumed/,'insightful'],[/^This week by macro/,'insightful'],[/^Suggested changes/,'casual'],[/^Why the plan changed/,'insightful'],[/^Upcoming/,'casual'],[/^Forecast/,'insightful'],[/^Data quality/,'insightful'],[/^Technical detail/,'developer'],
  /* log */
  [/^Quick log/,'casual'],[/^Today$/,'casual'],[/^All observations/,'casual'],
  /* plan */
  /* The phase card's title always carries "\u00b7 week N"; matching the phase name alone also caught "Recovery and deload". */
  [/^[A-Z][A-Za-z ]+ \u00b7 week \d+/,'casual'],[/^No active phase/,'casual'],[/^Profile$/,'casual'],
  [/^How targets and estimates are kept apart/,'developer'],[/^Criteria/,'insightful'],[/^Phase progression/,'insightful'],[/^Phase history/,'insightful'],[/^What if/,'insightful'],
  /* train */
  [/^Today:/,'casual'],[/^Strength trend/,'casual'],[/^This week/,'casual'],[/^Program$/,'casual'],[/^Session history/,'casual'],[/^Programme history/,'insightful'],[/^Your plan/,'casual'],
  [/^Recovery and deload/,'insightful'],[/^Substitutions/,'insightful'],[/^How each lift is responding/,'insightful'],[/^What the evidence supports/,'insightful'],
  /* food */
  [/^Today \u00b7/,'casual'],[/^Recent, frequent and favorites/,'casual'],[/^Possibly the same food/,'casual'],[/^Recipes and my foods/,'casual'],
  [/^Against reference/,'insightful'],[/^Adequacy/,'insightful'],[/^What the food record feeds/,'developer'],[/^Data sources/,'developer'],
  /* body */
  [/^Circumferences/,'casual'],[/^Progress photos/,'casual'],[/^Measurement schedule/,'casual'],
  [/^Where training lands/,'insightful'],[/^Reading the scale/,'insightful'],[/^Composition/,'insightful'],[/^Not available yet/,'developer'],
  /* progress */
  [/^(Weight|Waist|Intake|Activity|Strength)$/,'casual'],[/^Recovery and appetite/,'insightful'],[/^Compliance vs outcome/,'insightful'],[/^Daily snapshots/,'developer'],
  /* diagnose */
  [/^What is happening/,'insightful'],[/^Quick diagnosis/,'insightful'],[/^What changed/,'insightful'],[/^Protocol changes/,'insightful'],
  [/^Your own baselines/,'insightful'],[/^Where to look next/,'insightful'],[/^Data trust and anomalies/,'developer'],[/^Priority lattice/,'developer'],
  /* experiments */
  [/\u00b7 (supported|refuted|inconclusive|running|planned|abandoned)$/,'insightful'],[/^Negative knowledge/,'insightful'],[/^Intervention log/,'insightful'],[/^Decision history/,'insightful'],
  /* learn */
  [/^What we (know|think|don\u2019t know)/,'insightful'],[/^What (failed|worked)/,'insightful'],[/^Forecast accuracy/,'insightful'],
  [/^What your body has actually done/,'insightful'],[/^What is worth measuring next/,'insightful'],
  [/^Model maturity/,'developer'],[/^Model library/,'developer'],[/^Forecast calibration by context/,'developer'],
  /* archive */
  [/^Replay/,'insightful'],[/^Experiment:/,'insightful'],[/^Prediction ledger/,'developer'],
  /* tools */
  [/^Appearance/,'casual'],[/^Display/,'casual'],[/^Text$/,'casual'],[/^Data$/,'casual'],[/^Demo and reset/,'casual'],[/^Keyboard and gestures/,'casual'],
  [/^About/,'casual'],[/^Areas tracked/,'casual'],[/^Navigation/,'casual'],
  [/^Reference knowledge/,'insightful'],[/^Evidence/,'insightful'],[/^Learning/,'insightful'],[/^Layout/,'insightful'],[/^Food database$/,'insightful'],
  [/^Self-test/,'developer'],[/^External server/,'casual'],[/^System diagnostics/,'developer'],[/^Scheduled checks/,'developer'],[/^Device test checklist/,'developer'],
  [/^Data dependency graph/,'developer'],[/^Food database internals/,'developer'],[/^Interaction matrix/,'developer'],[/^System health/,'developer'],
  [/^Storage and integrity/,'developer'],[/^Event log and sync/,'developer']
];
function panelTitle(el){
  var t=el.matches&&el.matches('details')?(el.querySelector('summary .f-title')||el.querySelector('summary')):(el.querySelector('.card-h, .card-title, h3, h4')||el);
  return t?String(t.textContent||'').trim().replace(/\s+/g,' ').replace(/\s*(PREDICTIVE|EMPIRICAL|DERIVED|MEASURED|HEURISTIC|PRIOR|BLENDED|CALIBRATED|POLICY)$/,''):'';
}
function panelLevel(title){for(var i=0;i<PANEL_LEVEL_RULES.length;i++){if(PANEL_LEVEL_RULES[i][0].test(title))return PANEL_LEVEL_RULES[i][1];}return null;}
var _UNCLASSIFIED_PANELS={};
/* Bookkeeping kept out of the DOM: a WeakSet of panels already tagged (a data attribute here was styling nothing). */
var _PANELS_DONE=(typeof WeakSet!=='undefined')?new WeakSet():null;
function applyPanelLevels(root){
  if(typeof document==='undefined')return;
  [].slice.call((root||document).querySelectorAll('main .card, main details.fold')).forEach(function(el){
    if(el.parentElement&&el.parentElement.closest('.card, details.fold'))return;   /* top-level panels only */
    if(_PANELS_DONE&&_PANELS_DONE.has(el))return;
    var title=panelTitle(el),lvl=panelLevel(title);
    if(!lvl){_UNCLASSIFIED_PANELS[title]=1;lvl='casual';}
    if(lvl!=='casual')el.setAttribute('data-level',lvl);
    if(_PANELS_DONE)_PANELS_DONE.add(el);});
}
function panelLevelAudit(){return {unclassified:Object.keys(_UNCLASSIFIED_PANELS),ok:Object.keys(_UNCLASSIFIED_PANELS).length===0};}
/* Panels are rendered by many paths \u2014 renderAll, each tab's own renderer on switching, sheets. Tagging at the end of
   renderAll missed every panel a tab rendered on arrival, so Insightful showed all 99 panels and Casual showed
   Diagnose panels. A mutation observer tags any panel the moment it appears, from whatever path created it. */
var _PANEL_OBS=null,_PANEL_PENDING=false;
function watchPanelLevels(){
  if(typeof document==='undefined'||typeof MutationObserver==='undefined'||_PANEL_OBS)return;
  var main=document.querySelector('main');if(!main)return;
  _PANEL_OBS=new MutationObserver(function(){if(_PANEL_PENDING)return;_PANEL_PENDING=true;
    (typeof requestAnimationFrame==='function'?requestAnimationFrame:setTimeout)(function(){_PANEL_PENDING=false;applyPanelLevels();});});
  _PANEL_OBS.observe(main,{childList:true,subtree:true});
  applyPanelLevels();
}
