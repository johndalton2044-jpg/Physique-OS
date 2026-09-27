/* ============================================================================
   REGION: VIEWS A — Today (answer first), Log, Plan, Train, Food
   ============================================================================ */
var RENDERERS={};
/* In replay mode the ENTIRE interface renders as of the replayed day, rather than one panel summarising it.
   Wrapping the single render entry point is what makes that true everywhere at once, including views written
   before replay existed. */
function renderAll(force){
  try{if(typeof updateRail==='function')setTimeout(updateRail,0);}catch(e){}
  if(typeof replayActive==='function'&&replayActive()&&typeof _RENDER_REPLAY_GUARD==='undefined'){
    return withAsOf(replayMode().date,function(){
      _RENDER_REPLAY_GUARD=1;
      try{return renderAll(force);}finally{_RENDER_REPLAY_GUARD=undefined;}
    });
  }
  try{renderHeader();}catch(e){_q(e);}
  var fn=RENDERERS[_TAB];
  if(fn){
    try{
      if(typeof presentationViewGuard==='function'){
        var _pv=presentationViewGuard(_TAB);
        if(!_pv.ok)throw new Error('Presentation view contract: '+_pv.status);
      }
      fn();
    }catch(e){_q(e);setHTML((_TAB==='today'?'decisionZone':_TAB+'Zone'),'<div class="banner negative">This view hit an error and was quarantined: '+esc(e.message)+'. Other views still work. See Tools → System diagnostics.</div>');}
  }
  try{updateFabs();}catch(e){_q(e);}
}
function renderHeader(){
  var ph=activePhase();var el=document.getElementById('contextLine');if(!el)return;
  var parts=[];if(ph){parts.push(phaseLabel(ph));parts.push('week '+phaseWeek(ph));if(ph.calorieTarget)parts.push(fmtKcal(ph.calorieTarget));var _G=canonicalGoal();if(_G.activeTargetLb)parts.push('goal '+fmtWeight(_G.activeTargetLb));}else parts.push('no active phase');
  parts.push(longDate(todayISO()));if(DB.demo&&DB.demo.active)parts.push('<span class="demo-flag">DEMO DATA</span>');
  el.innerHTML=parts.join(' \u00b7 ');
  var dot=document.getElementById('profileDot');if(dot)dot.className='dot '+((DB.profile&&DB.profile.age&&DB.profile.heightIn)?'good':'attention');
}
function updateFabs(){var u=document.getElementById('undoFab');if(u)u.className='fab-mini'+(canUndo()?' show':'');var c=document.getElementById('cmdkFab');if(c)c.className='fab-mini show';}
/* ---- TODAY ---- */
var _WHATIF=null;
var WHATIF_PRESETS=[
  {label:'+2,000 steps/day',changes:{steps:2000}},
  {label:'\u2212200 kcal/day',changes:{calories:-200}},
  {label:'+1 cardio session/week',changes:{cardio:1}},
  {label:'\u2212300 kcal and +2,000 steps',changes:{calories:-300,steps:2000}},
  {label:'+1 training session/week',changes:{training:1}}
];
RENDERERS.today=function(){
  var S=getCurrentState();var dec=decide();var ph=S.phase;var today=todayISO();
  // banners
  var b=[];if(DB.demo&&DB.demo.active)b.push(uiBanner('neutral',
    'Demo record loaded: 70 days of generated data marked <b>demo</b>. Nothing here is yours.',
    uiBtn('Reset to empty','demo.reset',null,'btn-sm btn-secondary')));
  /* Today presents from the attention queue rather than assembling its own notices (H1): the most urgent item that
     needs acting on is shown here with its action; everything else is in the queue. The demo strip is a mode, not a
     notification. Saving failing, an update, offline and due experiments were separate banners, and a due experiment
     appeared twice. */
  try{var _aq=attentionQueue().items.filter(function(i){return i.severity==='action';})[0];
    if(_aq)b.push('<div class="banner '+(_aq.id==='save-failing'?'negative':'attention')+'"><span class="banner-text"><b>'+esc(_aq.what)+'.</b> '+esc(_aq.why||'')+'</span>'+
      (_aq.act?uiBtn(_aq.cando||'Open',_aq.act,_aq.arg||null,'btn-sm btn-secondary'):'')+(_aq.canSnooze!==false&&_aq.id!=='save-failing'?uiBtn('Not now','attention.snooze',_aq.id,'btn-sm btn-ghost'):'')+'</div>');
    var _off=attentionQueue().items.filter(function(i){return i.id==='offline'||i.id==='update-ready';});
    _off.forEach(function(o){b.push('<div class="banner neutral"><span class="banner-text">'+esc(o.what)+'. '+esc(o.why)+'</span>'+(o.act?uiBtn(o.cando,o.act,null,'btn-sm btn-ghost'):'')+'</div>');});
  }catch(e){_q(e,'P2');}
  setHTML('todayBanners',b.join(''));
  // headline
  var eyebrow=(ph?(phaseLabel(ph)+' \u00b7 week '+phaseWeek(ph)):'No phase')+' \u00b7 '+longDate(today);
  setHTML('todayEyebrow',eyebrow);
  var head;if(!ph)head='Start with a profile and a phase.';else if(S.trend.status!=='ok')head='Collecting the first two weeks of evidence.';else{var dir=S.trend.direction==='falling'?'falling':(S.trend.direction==='rising'?'rising':'flat');head=fmtWeight(S.averages.avg7||S.weight.value)+' \u00b7 '+dir+' at '+fmtRate(S.trend.slopePerWeek)+(S.targetRate?(' \u00b7 band '+fmtRateRange(S.targetRate.lo,S.targetRate.hi)):'');}
  setHTML('todayHeadline',head);
  setHTML('todaySubtitle',ph?('Data trust '+S.trust.overall.level+' ('+S.trust.overall.pct+'%) \u00b7 TDEE '+(S.tdee.status==='ok'?(fmtKcal(S.tdee.value,{estimate:true})+' '+clsMark(S.tdee.cls)):'unknown')+' \u00b7 recovery '+S.recovery.level+' \u00b7 appetite '+S.appetite.level):'The system needs a person and a phase before it can say anything about a body.');
  // decision
  setHTML('decisionZone',renderDecisionCard(dec,S));
  // attention
  var att=attentionItems();
  setHTML('attentionZone',att.items.length?(sectionH('Needs attention',att.items.length+(att.dropped?' shown \u00b7 '+att.dropped+' held back':''))+att.items.map(renderWatch).join('')):'');
  // vitals 2×2
  var tiles=[];
  tiles.push(uiMetric({personal:personalizationLabel(infer({modelId:'weight_avg'})),trace:'weight_trend',label:'Weight \u00b7 7-day avg',value:S.averages.avg7!=null?fmtWeight(S.averages.avg7,{bare:true}):null,unit:weightUnit(),cls:'DERIVED',source:S.averages.n7+' of 7 days',date:S.weight.date,type:'weight',need:S.averages.need&&S.averages.need[0]||'weigh in daily',badge:S.trend.status==='ok'?uiPill(fmtRate(S.trend.slopePerWeek),S.trend.direction==='falling'?'good':(S.trend.direction==='rising'?'attention':'neutral')):''}));
  tiles.push(uiMetric({personal:(function(){var L=personalizationLabel(S.tdee,{becomes:'About two weeks of logged intake and weigh-ins make it yours.',history:obsOf('calories').length>=14&&obsOf('weight').length>=14});var PS=priorSensitivity();if(PS.status==='ok'&&L.key==='adjusted')L=Object.assign({},L,{why:L.why+' '+PS.note});return L;})(),trace:'tdee',label:'Maintenance (TDEE)',value:S.tdee.status==='ok'?fmtKcal(S.tdee.value,{estimate:true,bare:true}):null,unit:'kcal',cls:S.tdee.status==='ok'?S.tdee.cls:null,source:S.tdee.status==='ok'?(S.tdee.n?S.tdee.n+' logged days':'population prior'):'',conf:S.tdee.confidence,need:S.tdee.need?S.tdee.need[0]:'profile needed'}));
  var pr=S.nutrition;tiles.push(uiMetric({trace:'adherence',label:'Protein today',value:pr.protein!=null?fmtNum(pr.protein,0):null,unit:'g'+(pr.proteinTarget?' / '+fmtNum(pr.proteinTarget,0):''),cls:'MEASURED',source:pr.fromFoodLog?'food log':'logged',date:pr.protein!=null?today:null,need:'log protein or food',badge:pr.protein!=null&&pr.proteinTarget?uiPill(pr.protein>=pr.proteinTarget*0.9?'on target':'below',pr.protein>=pr.proteinTarget*0.9?'good':'attention'):''}));
  tiles.push(uiMetric({label:'Steps \u00b7 7-day avg',value:S.steps.mean7!=null?fmtNum(S.steps.mean7,0):null,unit:'',cls:'MEASURED',source:S.steps.n7+' of 7 days'+(S.steps.target?' \u00b7 target '+fmtNum(S.steps.target,0):''),date:S.steps.last?S.steps.last.date:null,type:'steps',need:'log steps'}));
  setHTML('vitalsZone','<div class="vitals">'+tiles.join('')+'</span></div>');
  // actions checklist
  /* The latest progress photo as a small icon on Today (usage review): off by default \u2014 progress photos are personal and
     Today is the screen other people glance at \u2014 and shown only when a photo exists. */
  var _ph=(DB.settings.showPhotoOnToday!==false&&(DB.settings.photos||[]).length)?   /* shown once a photo exists, unless hidden (it was off by default, and a person who added a photo saw nothing) */
    (DB.settings.photos||[]).slice().sort(function(a,b){return String(a.date||a.at)<String(b.date||b.at)?1:-1;})[0]:null;
  setHTML('actionsZone',(_ph?'<button class="today-photo" data-act="nav.photos" aria-label="Open progress photos"><img data-photo="'+attrEsc(_ph.id)+'" alt="Latest progress photo, '+attrEsc(shortDate(_ph.date||String(_ph.at||'').slice(0,10)))+'"><span>Latest photo \u00b7 '+esc(shortDate(_ph.date||String(_ph.at||'').slice(0,10)))+'</span></button>':'')+renderActionsChecklist(dec,S)+(function(){try{return renderWeatherCard();}catch(e){_q(e,'P2');return '';}})()+(function(){try{return renderSetupMore();}catch(e){_q(e,'P2');return '';}})());   /* weather once a place is set; then what is not set up yet */
  if(_ph&&typeof hydratePhotoThumbs==='function')setTimeout(hydratePhotoThumbs,0);
  // forecast
  setHTML('forecastZone',renderForecastCard(S));
  // data quality + VOI
  var voi=valueOfInformation();
  setHTML('dataQualityZone',uiFold('today-data','Data quality',S.trust.overall.level+' \u00b7 '+(voi.top?('next: '+voi.top.what):'nothing urgent'),renderTrust(S.trust)+(voi.items.length?'<div class="divider"></div><div class="card-title" style="font-size:14px">Most valuable next observation</div>'+voi.items.slice(0,3).map(function(v){return uiRow(v.what,uiPill(v.value+' value',v.value==='high'?'attention':'neutral'),{sub:v.why});}).join(''):''),{tone:S.trust.overall.level==='low'||S.trust.overall.level==='insufficient'?'attention':''}));
  // upcoming
  var up=upcoming();
  setHTML('upcomingZone',uiFold('today-upcoming','Upcoming',up.length?(up.slice(0,3).map(function(u){return shortDate(u.date)+' '+u.label;}).join(' \u00b7 ')):'nothing scheduled',up.length?up.map(function(u){return uiRow(u.label,'<strong>'+(u.date===today?'today':shortDate(u.date))+'</strong>',{sub:u.kind,rsub:dowShort(u.date)});}).join(''):'<div class="muted">Set a phase and a program to populate the schedule.</div>'));
  // technical fold
  setHTML('todayTechZone',uiFold('today-tech','Technical detail','rules v'+DECISION_RULES_VERSION+' \u00b7 '+MODELS.length+' models \u00b7 as of '+today,renderTrace(dec.trace)+'<div class="divider"></div>'+kv([['assumptions',(dec.assumptions||[]).join('; ')],['alternatives',(dec.alternatives||[]).join('; ')||'\u2014'],['missing',(dec.missing||[]).join('; ')||'\u2014'],['negative knowledge consulted',(dec.negatives||[]).length?dec.negatives.map(function(n){return n.intervention;}).join('; '):'none applicable'],['storage',idbStatus().durable],['saves',DB.ledger.saves+' \u00b7 last '+(DB.ledger.lastSaveAt?ageLabel(DB.ledger.lastSaveAt.slice(0,10)):'never')]])));
};
function renderDecisionCard(dec,S){
  var tone={good:'var(--good)',attention:'var(--attention)',negative:'var(--negative)',inferred:'var(--inferred)',neutral:'var(--neutral)'}[dec.tone]||'var(--neutral)';
  var why=(dec.why||[]).map(function(w){return '<li>'+esc(w)+'</li>';}).join('');
  var act=(dec.action||[]).map(function(a){return '<li class="good">'+esc(a.text)+'</li>';}).join('');
  var rev=(dec.reverseIf||[]).map(function(r){return '<li class="attention">'+esc(r)+'</li>';}).join('');
  var askRow='<div class="btn-row" style="margin-top:10px">'+uiBtn('Ask the record','nav.ask',null,'btn-sm btn-ghost')+'</div>';
  var attn=(function(){try{var q=attentionQueue();if(!q.items.length)return '';
    var top=q.items[0];
    return '<div class="attn-strip" data-act="nav.attention" role="button" tabindex="0" aria-label="Attention: '+q.items.length+' items"><span class="as-count">'+q.items.length+'</span><span class="as-text">'+esc(top.what)+(q.items.length>1?(' \u00b7 and '+(q.items.length-1)+' more'):'')+'</span><span class="as-go">Review</span></div>';}catch(e){return '';}})();
  var mind=renderChangeMyMind(dec,S);
  var hold=(dec.code==='HOLD'||dec.code==='CONTINUE')?renderWhyNotChange(dec,S):'';
  var unc=dec.uncertainty?'<div class="d-block"><div class="d-block-title">HOW SURE THE NUMBERS ARE</div><div class="lead" style="font-size:13px">'+esc(dec.uncertainty.text)+(dec.uncertainty.balance?' \u00b7 energy balance '+fmtKcal(dec.uncertainty.balance.lo)+' to '+fmtKcal(dec.uncertainty.balance.hi)+'/day':'')+'</div></div>':'';
  var presp=dec.personalResponse?'<div class="d-block"><div class="d-block-title">YOUR OWN RESPONSE TO THIS VARIABLE</div><div class="lead" style="font-size:13px">'+esc(dec.personalResponse.text)+'</div></div>':'';
  var btns='';
  if(dec.intervention&&dec.code!=='SETUP')btns+=uiBtn('Apply and start the experiment','decision.apply',null,'btn-primary')+uiBtn('Record my own decision','decision.user',null,'btn-secondary');
  else if(dec.code==='SETUP')btns+=uiBtn('Set up profile and phase','profile.edit',null,'btn-primary')+uiBtn('Load the demo record','demo.load',null,'btn-secondary');
  else if(dec.code==='TRANSITION')btns+=uiBtn('Start a transition phase','phase.start','transition','btn-primary');
  else btns+=uiBtn('Record my own decision','decision.user',null,'btn-secondary')+uiBtn('Why this, in full','nav.tab','diagnose','btn-ghost');
  return '<section class="decision" style="--dcol:'+tone+'" aria-label="Decision"><div class="d-eyebrow"><span>DECISION \u00b7 '+esc(dec.priority||'').toUpperCase()+'</span><span>'+(dec.recheckDays?'recheck in '+dec.recheckDays+' days':'')+'</span></div><div class="d-verb'+(dec.confidence==='insufficient'?' insufficient':'')+'">'+esc(dec.verb)+'</div><div class="d-lede">'+esc(dec.lede)+'</div>'+(why?'<div class="d-block"><div class="d-block-title">WHY</div><ul>'+why+'</ul></div>':'')+(act?'<div class="d-block"><div class="d-block-title">DO</div><ul>'+act+'</ul></div>':'')+(rev?'<div class="d-block"><div class="d-block-title">REVERSE IF</div><ul>'+rev+'</ul></div>':'')+hold+unc+presp+mind+attn+askRow+setupStrip()+(dec.intervention?'<div class="d-block"><div class="d-block-title">PREDICTION TO BE STAMPED</div><div class="lead" style="font-size:13px">'+esc(dec.intervention.expected)+' \u00b7 recheck '+dec.intervention.recheckDays+' days</div></div>':'')+'<div class="d-meta">'+confPill(dec.confidence)+uiPill('rules v'+DECISION_RULES_VERSION)+(dec.diagnosis?uiPill(dec.diagnosis.title.toLowerCase()+' \u00b7 '+dec.diagnosis.likelihood,'inferred'):'')+(dec.costOfWaiting?uiPill('cost of waiting: '+esc(dec.costOfWaiting),'neutral'):'')+'</div><div class="d-actions">'+btns+'</div></section>';
}
/* A decision is only honest if it names the observation that would overturn it. This component is shared by
   Today, Plan and Diagnose so the falsification conditions read identically wherever they appear. */
function changeMyMind(dec,S){
  S=S||getCurrentState();var out=[];
  (dec.reverseIf||[]).forEach(function(r){out.push({text:r,kind:'stated'});});
  var band=S.targetRate,tr=S.trend;
  if(tr&&tr.status==='ok'&&band&&band.band){
    if(tr.slopePerWeek>band.band.hi)out.push({text:'two more weeks of weigh-ins putting the trend back inside '+fmtRateRange(band.band.lo,band.band.hi),kind:'trend'});
    else if(tr.slopePerWeek<band.band.lo)out.push({text:'the trend slowing to inside '+fmtRateRange(band.band.lo,band.band.hi)+' without a target change',kind:'trend'});
    else out.push({text:'the trend leaving '+fmtRateRange(band.band.lo,band.band.hi)+' for two consecutive weeks',kind:'trend'});
  }
  if(S.recovery&&S.recovery.status==='ok'&&S.recovery.level!=='poor')out.push({text:'recovery dropping to poor (sleep, fatigue or soreness worse than your own baseline)',kind:'recovery'});
  if(S.training&&S.training.strength&&S.training.strength.status==='ok'&&S.training.strength.direction!=='declining')out.push({text:'a strength decline larger than your own session-to-session noise on two tracked lifts',kind:'strength'});
  if(S.adherence&&S.adherence.overall!=null&&S.adherence.overall<80)out.push({text:'adherence rising above 80% \u2014 the current numbers describe execution, not the plan',kind:'adherence'});
  if(dec.uncertainty&&dec.uncertainty.ceiling==='low')out.push({text:'enough logged days to shrink the energy-balance interval below the deficit itself',kind:'uncertainty'});
  var seen={};return out.filter(function(x){if(seen[x.text])return false;seen[x.text]=1;return true;}).slice(0,5);
}
function renderChangeMyMind(dec,S){
  var items=changeMyMind(dec,S);if(!items.length)return '';
  return '<div class="d-block"><div class="d-block-title">WHAT WOULD CHANGE THIS</div><ul>'+items.map(function(i){return '<li class="attention">'+esc(i.text)+'</li>';}).join('')+'</ul></div>';
}
/* A hold is a decision too. Saying nothing is happening is not the same as saying why a change was rejected. */
function renderWhyNotChange(dec,S){
  S=S||getCurrentState();var rows=[];
  var tr=S.trend,band=S.targetRate;
  if(tr&&tr.status==='ok'&&band&&band.band&&tr.slopePerWeek>=band.band.lo&&tr.slopePerWeek<=band.band.hi)rows.push('the trend ('+fmtRate(tr.slopePerWeek)+') is inside the band this system works within ('+fmtRateRange(band.band.lo,band.band.hi)+'), so a change would be tuning noise');
  if(dec.uncertainty&&dec.uncertainty.ceiling!=='high')rows.push('the energy numbers carry '+dec.uncertainty.ceiling+' confidence right now \u2014 a calorie change would be smaller than its own uncertainty');
  if(S.adherence&&S.adherence.overall!=null&&S.adherence.overall<85)rows.push('adherence is '+fmtNum(S.adherence.overall,0)+'%; changing the plan before execution is settled changes two things at once');
  var neg=getNegativeKnowledge().slice(0,1);if(neg.length)rows.push('already tried here: '+esc(neg[0].intervention)+' \u2014 '+esc(String(neg[0].observed||'').slice(0,90)));
  if(!rows.length)return '';
  return '<div class="d-block"><div class="d-block-title">WHY NOT CHANGE SOMETHING</div><ul>'+rows.map(function(r){return '<li>'+r+'</li>';}).join('')+'</ul></div>';
}
/* Setup completeness sits on Today only while it is incomplete, and disappears once it is done rather than
   becoming permanent furniture. */
/* The selection bar states the count, offers only the actions that apply, and always offers a way out.
   Every action here also exists on the individual record, so selection is an accelerator, not a gate. */
function renderSelectionBar(){
  var n=selectionCount();var acts=bulkActions();
  return '<div class="sel-bar" role="toolbar" aria-label="Selection actions"><span class="sb-count">'+n+' selected</span>'+
    (n?(acts.map(function(a){return uiBtn(a.label,'sel.act',a.id,'btn-sm '+(a.danger?'btn-danger':'btn-secondary'));}).join('')+uiBtn('Export CSV','sel.export',null,'btn-sm btn-ghost')):'<span class="muted">Choose records below</span>')+
    uiBtn('Select all on this day','sel.all',selectionKind(),'btn-sm btn-ghost')+uiBtn('Cancel','sel.exit',null,'btn-sm btn-ghost')+'</div>';
}
function setupStrip(){
  try{var sc=setupCompleteness();if(sc.complete)return '';
    var next=sc.items.filter(function(i){return !i.done;})[0];
    return '<div class="d-block"><div class="d-block-title">SETUP '+sc.done+' / '+sc.total+'</div>'+
      '<div class="lead" style="font-size:13px">'+esc(next.label)+(next.progress?(' \u00b7 '+esc(next.progress)):'')+' \u2014 unlocks '+esc(next.unlocks)+'</div>'+
      '<div class="btn-row">'+uiBtn('Complete '+next.label.toLowerCase(),next.act,next.arg||'','btn-sm btn-secondary')+uiBtn('See all','nav.setup',null,'btn-sm btn-ghost')+'</div></div>';
  }catch(e){return '';}
}
function renderWatch(it){return '<div class="watch '+it.severity+'"><div class="w-head"><div class="w-title">'+esc(it.title)+'</div><div class="w-sev">'+it.severity.toUpperCase()+'</div></div><div class="w-body">'+(it.evidence&&it.evidence.length?'<b>Evidence</b> '+it.evidence.map(esc).join('; ')+'. ':'')+(it.consequence?'<b>If ignored</b> '+esc(it.consequence)+'. ':'')+(it.action?'<b>Do</b> '+esc(it.action):'')+'</div><div class="w-foot">'+(it.recheck?uiPill('recheck '+it.recheck):'')+(it.id==='waist'?uiBtn('Log waist','log.open','waist','btn-sm btn-secondary'):'')+(it.id==='underlogging'?uiBtn('Log food','nav.tab','food','btn-sm btn-secondary'):'')+'</div></div>';}
/* Today's actions, read from the plan: intended, done, partial, skipped or not yet recorded (never "failed" for a missing
   log), the training session's smaller versions one tap away, and the one next thing to do. Rebuilt on the canonical
   execution model in H1 rather than keeping a second list beside it. */
function renderActionsChecklist(dec,S){
  if(typeof ensurePlan==='function')ensurePlan();
  var E=executionFor(todayISO());
  if(!E||E.status!=='ok')return uiCard({title:'Today\u2019s actions',sub:'no plan yet',body:uiEmpty('Set up your plan','Your goal, your week and what you have to work with.',uiBtn('Setup guide','nav.welcome',null,'btn-primary'))});
  var PILL={done:['done','good'],partial:['partly done','attention'],skipped:['skipped','neutral'],unknown:['not recorded','neutral'],upcoming:['to do','neutral'],'in progress':['in progress','attention']};
  var done=E.rows.filter(function(r){return r.status==='done';}).length;
  var N=nextAction();
  var head=N&&N.act?'<div class="next-action"><div><div class="na-label">Next: '+esc(N.label)+'</div><div class="na-why">'+esc(N.why)+'</div></div>'+uiBtn('Do it',N.act,N.arg,'btn-primary btn-sm')+'</div>':
    (N&&N.status==='ok'?'<div class="next-action done"><div class="na-label">'+esc(N.label)+'</div></div>':'');
  var rows=E.rows.map(function(r){var p=PILL[r.status]||[r.status,'neutral'],act=NEXT_ACTION_FOR[r.item]||['Log','log.open'];
    var variant='';
    /* The smaller versions stay one tap away rather than on screen: Today has to read at a glance. A chosen version
       is shown in the open. */
    if(r.item==='training'&&r.status!=='done'){
      var _rs=(!r.variant&&r.status!=='skipped')?recoverySuggestion():null;
      variant=(_rs?'<div class="hint" style="color:var(--attention)">'+esc(_rs.why)+' The reduced version is suggested today.</div>'+uiBtn('Use the reduced version','exec.variant','training|reduced','btn-sm btn-secondary'):'')+(r.variant?'<div class="hint">'+esc(PLAN_VARIANTS[r.variant].label+' version: '+PLAN_VARIANTS[r.variant].note)+'</div>':'')+
        '<details class="variant-more"><summary>'+(r.variant?'Change the version':'Can\u2019t do all of it?')+'</summary><div class="variant-row">'+
        Object.keys(PLAN_VARIANTS).filter(function(k){return k!=='full';}).map(function(k){
          return uiBtn(PLAN_VARIANTS[k].label,'exec.variant','training|'+k,'btn-sm '+(r.variant===k?'btn-primary':'btn-ghost'));}).join('')+
        (r.status!=='skipped'?uiBtn('Skip today','exec.skip','training','btn-sm btn-ghost'):'')+'</div></details>';}
    return '<div class="row"><div class="l"><span class="check'+(r.status==='done'?' done':'')+'" aria-hidden="true">'+(r.status==='done'?'\u2713':'')+'</span> '+esc(r.label)+
      (r.detail?'<div class="hint">'+esc(r.detail)+'</div>':'')+variant+'</div><div class="r">'+uiPill(p[0],p[1])+
      (r.status!=='done'&&r.status!=='skipped'?uiBtn('Log',act[1],act[2]||null,'btn-sm btn-ghost'):'')+'</div></div>';}).join('');
  return uiCard({title:'Today\u2019s actions',sub:done+' of '+E.rows.length+' done \u00b7 plan v'+E.planVersion,body:head+'<div class="check-list">'+rows+'</div>'});
}
function renderForecastCard(S){
  var f=[S.forecast7,S.forecast14,S.forecast28];var ok=f.filter(function(x){return x.status==='ok';});
  if(!ok.length)return uiCard({title:'Forecast',sub:'predictive \u00b7 not yet available',body:'<div class="muted">'+esc((S.forecast14.need||['a weight trend']).join(', '))+' before any forecast is stamped.</div>'});
  var acc=forecastAccuracy();
  var rows=ok.map(function(x){return uiRow(x.horizonDays+' days \u00b7 '+shortDate(x.dueDate),'<strong style="color:var(--inferred)">'+fmtWeight(x.point)+'</strong>',{sub:'80% interval '+fmtWeight(x.lo,{bare:true})+'\u2013'+fmtWeight(x.hi),rsub:'conf '+x.confidence,tone:'inferred'});}).join('');
  var accTxt=acc.weight14.status==='ok'?('14-day forecasts: mean error '+fmtWeight(acc.weight14.mae)+' over '+acc.weight14.n+' scored \u00b7 '+acc.weight14.verdict):('accuracy unknown: '+acc.weight14.n+' of 3 scored forecasts needed');
  var goal=S.goal;var goalTxt='';if(goal.status==='ok'&&goal.projectedDate)goalTxt='<div class="divider"></div>'+uiRow('Goal '+fmtWeight(goal.goal),'<strong style="color:var(--inferred)">'+shortDate(goal.projectedDate)+'</strong>',{sub:(goal.projectedEarliest&&goal.projectedLatest?('range '+shortDate(goal.projectedEarliest)+' \u2013 '+shortDate(goal.projectedLatest)+' if the trend holds'):'if the current trend holds')+(goal.deadline?(' \u00b7 deadline '+shortDate(goal.deadline)+' needs '+fmtRate(goal.requiredRate)+' ('+goal.requiredVsBand+')'):''),rsub:goal.status2,tone:'inferred'});
  else if(goal.status==='ok')goalTxt='<div class="divider"></div>'+uiRow('Goal '+fmtWeight(goal.goal),goal.status2,{sub:goal.remaining>0?fmtWeight(goal.remaining)+' remaining':'reached'});
  /* Which forecast is shown at each horizon, and why — the current straight line, or the improved method where it won a
     head-to-head on hold-out forecasts. A forecast should say what produced it. */
  var srcTxt=ok.map(function(x){var pr=x.promotion;return x.horizonDays+' d: '+(x.source==='weight_forecast_family'?('improved ('+x.method+')'):'current straight line')+
    (pr&&pr.reason?(' \u2014 '+(pr.promoted?'clearly better on hold-out forecasts':(/too close/.test(pr.reason)?'too close to call':(/too few/.test(pr.reason)?'not enough evidence to compare':'improved one not better here')))):'');}).join(' \u00b7 ');
  return uiCard({title:'Forecast '+clsMark('PREDICTIVE'),sub:'stamped to the ledger before outcomes; scored when due',body:rows+goalTxt+
    /* Model health (H4): a forecast is trusted according to its record. The caution is visible at every level; the
       detail is for the Insightful level. */
    (function(){var src=(ok[0]&&ok[0].source)||'weight_forecast',H=modelHealthInContext(src);
      return '<div class="m-plabel '+(H.state==='performing'?'good':(H.state==='unproven'?'neutral':'attention'))+'" title="'+attrEsc(H.why)+'">'+esc(H.label)+'</div>'+
        (H.state==='biased'||H.state==='degraded'?'<div class="hint">'+esc(H.why)+'</div>':'');})()+
    '<div class="prov" style="margin-top:8px">'+accTxt+'</div><div class="prov">Shown: '+esc(srcTxt)+' \u00b7 '+uiBtn('Details','nav.forecast',null,'btn-sm btn-ghost')+'</div>'});
}
function renderTrust(t){return Object.keys(t.streams).map(function(k){var s=t.streams[k];return uiRow(k,uiPill(s.level,s.level==='high'?'good':(s.level==='moderate'?'neutral':(s.level==='low'?'attention':'negative'))),{sub:s.detail});}).join('');}
function renderTrace(tr){if(!tr)return '';return '<div class="trace">'+['observations','signals','models'].map(function(k){return '<div class="t-step '+(k==='observations'?'obs':(k==='signals'?'sig':'mod'))+'"><b>'+k+'</b> '+(tr[k]||[]).map(esc).join(' \u00b7 ')+'</div>';}).join('')+'<div class="t-step rule"><b>rule</b> '+esc(tr.rule)+' \u00b7 diagnosis: '+esc(tr.diagnosis)+'</div><div class="t-step dec"><b>decision</b> confidence '+esc(tr.confidence)+' \u00b7 recheck '+esc(tr.recheck)+'</div></div>';}
/* ---- LOG ---- */
var _LOG_DAY=null;
RENDERERS.log=function(){
  var today=todayISO();var day=_LOG_DAY||today;
  var chips=[['weight','Weight'],['food','Food'],['steps','Steps'],['cardio','Cardio'],['sleep','Sleep'],['recovery','Recovery'],['hunger','Appetite'],['waist','Waist'],['note','Note'],['context','Context']].map(function(c){return '<button class="chip" data-act="log.open" data-arg="'+c[0]+'">'+c[1]+'</button>';}).join('');
  setHTML('logQuickZone',uiCard({title:'Quick log',sub:'the FAB opens the same sheet; L on a keyboard',body:'<div class="chips">'+chips+uiBtn('Training session','session.new',null,'chip')+'</div>'}));
  var strip='';for(var i=13;i>=0;i--){var d=addDays(today,-i);var has=DB.observations.some(function(o){return o.date===d&&!o.retracted;})||DB.sessions.some(function(s){return s.date===d&&!s.retracted;});strip+='<button data-act="log.day" data-arg="'+d+'"'+(d===day?' class="active" aria-current="date"':'')+'>'+dowShort(d)+'<i class="'+(has?'has':'')+'">'+(has?'\u25cf':'\u00b7')+'</i>'+shortDate(d).split(' ')[1]+'</button>';}
  setHTML('logDayZone','<div class="day-strip" role="tablist" aria-label="Recent days">'+strip+'</span></div>');
  var obs=DB.observations.filter(function(o){return o.date===day;}).sort(function(a,b){return a.at<b.at?-1:1;});
  var sess=DB.sessions.filter(function(s){return s.date===day;});
  var list=obs.map(function(o){var t=OBS_TYPES[o.type];var val=t.text?esc(o.value):(fmtNum(o.value,t.step&&t.step<1?1:0)+' '+t.unit);var flags=(o.flags||[]).map(function(f){return uiPill(f,'attention');}).join(' ');var state=o.retracted?uiPill('retracted','negative'):(o.correctedBy?uiPill('corrected'):'');
    var selBox=selectionActive()&&selectionKind()==='obs'?('<button class="selbox'+(selectionIds().indexOf(o.id)>=0?' on':'')+'" data-act="sel.toggle" data-arg="'+o.id+'" role="checkbox" aria-checked="'+(selectionIds().indexOf(o.id)>=0)+'" aria-label="Select '+attrEsc(t.label)+' on '+shortDate(o.date)+'"></button>'):'';
    return '<div class="list-item'+(selectionActive()?' selectable':'')+'" data-record="obs:'+o.id+'"><div class="li-head"><div class="li-title">'+selBox+t.label+' <span class="mono" style="color:var(--text-2)">'+val+'</span></div><div class="li-meta">'+esc(o.source)+(o.method?' \u00b7 '+esc(o.method):'')+' \u00b7 '+(o.at||'').slice(11,16)+'</div></div><div class="li-body">'+(o.note?esc(o.note)+' ':'')+flags+' '+state+(o.correction?' <span class="muted">was '+esc(String(o.correction.originalValue))+'</span>':'')+'</div>'+'<div class="li-actions">'+uiBtn('Details','obs.inspect',o.id,'btn-sm btn-ghost')+(!o.retracted&&!o.correctedBy&&o.source!=='food-log'?((t.text?'':uiBtn('Correct','obs.correct',o.id,'btn-sm btn-ghost'))+uiBtn('Delete','obs.retract',o.id,'btn-sm btn-ghost')):'')+'</div></div>';}).join('');
  var sl=sess.map(function(s){return '<div class="list-item" data-record="session:'+s.id+'"><div class="li-head"><div class="li-title">'+esc(s.name)+' <span class="muted">'+(s.sets||[]).length+' sets</span></div><div class="li-meta">'+esc(s.source)+(s.durationMin?' \u00b7 '+s.durationMin+' min':'')+'</div></div><div class="li-body">'+(s.sets||[]).map(function(x){return esc(x.exercise)+' '+(x.load!=null?fmtNum(x.load,0)+'\u00d7':'')+x.reps+(x.rir!=null?' @'+x.rir+'RIR':'');}).join(' \u00b7 ')+'</div>'+(s.retracted?'':'<div class="li-actions">'+uiBtn('Edit','session.edit',s.id,'btn-sm btn-ghost')+uiBtn('Delete','session.retract',s.id,'btn-sm btn-ghost')+'</div>')+'</div>';}).join('');
  var fl=foodLogsOn(day);
  var foodTxt=fl.length?('<div class="list-item"><div class="li-head"><div class="li-title">Food log</div><div class="li-meta">'+fl.length+' items \u00b7 '+fmtKcal(dayNutrition(day).totals.kcal)+'</div></div><div class="li-body">Calories and protein for this day come from the foods you logged. '+uiBtn('Open in Food','log.foodDay',day,'btn-sm btn-ghost')+'</div></div>'):'';
  var selBar=selectionActive()?renderSelectionBar():'';
  var capture='<div class="btn-row" style="margin-bottom:6px">'+uiBtn('Build a day','gen.meals',null,'btn-sm btn-ghost')+uiBtn('Log by voice','nav.voice',null,'btn-sm btn-ghost')+uiBtn('Read a nutrition panel','nav.label',null,'btn-sm btn-ghost')+uiBtn('Raw to cooked','nav.yields',null,'btn-sm btn-ghost')+'</div>';
  var selEnter=selectionActive()?'':('<div class="btn-row" style="margin-bottom:6px">'+uiBtn('Select multiple','sel.enter','obs','btn-sm btn-ghost')+'</span></div>');
  var dayNav='<div class="day-nav">'+uiBtn('\u2039','day.step','-1','btn-sm btn-ghost')+uiBtn('Today','day.jump','day.today','btn-sm btn-ghost')+uiBtn('\u203a','day.step','1','btn-sm btn-ghost')+
    uiBtn('Previous logged','day.jump','day.prevLogged','btn-sm btn-ghost')+uiBtn('Previous weigh-in','day.jump','day.prevWeigh','btn-sm btn-ghost')+uiBtn('Previous session','day.jump','day.prevSession','btn-sm btn-ghost')+uiBtn('Jump to date\u2026','day.jump','day.pick','btn-sm btn-ghost')+'</div>';
  setHTML('logListZone',dayNav+selBar+capture+selEnter+uiCard({title:(day===today?'Today':longDate(day)),sub:obs.length+' observations \u00b7 '+sess.length+' sessions',body:(list+sl+foodTxt)||uiEmpty('Nothing logged on this day','Observations you add appear here with their source and time.',uiBtn('Log something','log.open',null,'btn-primary btn-sm')+uiBtn('Previous logged day','day.jump','day.prevLogged','btn-sm btn-ghost'))})+
    uiFold('log-all','All observations',DB.observations.filter(function(o){return !o.retracted;}).length+' records \u00b7 '+DB.sessions.length+' sessions',renderObsTable()));
};
function renderObsTable(){var counts={};DB.observations.forEach(function(o){if(o.retracted)return;counts[o.type]=(counts[o.type]||0)+1;});var rows=Object.keys(counts).sort().map(function(t){var l=latestObs(t);return '<tr><td>'+OBS_TYPES[t].label+'</td><td class="num">'+counts[t]+'</td><td class="num">'+(l?shortDate(l.date):'\u2014')+'</td><td>'+(l?ageSpan(l.date):'')+'</td></tr>';}).join('');return '<div class="table-wrap"><table class="data"><thead><tr><th>type</th><th class="num">count</th><th class="num">latest</th><th>age</th></tr></thead><tbody>'+(rows||'<tr><td colspan="4" class="muted">no observations yet</td></tr>')+'</tbody></table></div>'+'<div class="btn-row">'+uiBtn('Export CSV','data.csv','observations','btn-sm btn-secondary')+'</div>';}
/* ---- PLAN ---- */
RENDERERS.plan=function(){
  var S=getCurrentState();var ph=S.phase;var p=DB.profile;
  var _programModel=programPresentationModel({mesocycle:ph?{id:ph.id,status:ph.status,startDate:ph.startDate,targetDate:ph.targetDate,objective:ph.objective}:null,weeks:ph?[{week:phaseWeek(ph),targets:{calories:ph.calorieTarget,protein:ph.proteinTarget,steps:ph.stepTarget,training:ph.trainingSessions}}]:[],fatigue:S.training&&S.training.fatigue||null,volume:S.training&&S.training.volume||null,strength:S.training&&S.training.strength||null,recovery:S.recovery||null,bodyweight:S.weight||null,energyAvailability:S.energy||null});
  var out='';
  if(!p.age||!p.heightIn)out+='<div class="banner attention">Profile is incomplete: age, sex and height power the energy prior. '+uiBtn('Complete profile','profile.edit',null,'btn-sm btn-secondary')+'</div>';
  if(!ph){out+=uiEmpty('No active phase','A phase carries the targets the decision engine evaluates against. Start with a cut, maintenance, or recomposition.','<div class="btn-row">'+uiBtn('Start a phase','phase.start',null,'btn-primary')+uiBtn('Load demo','demo.load',null,'btn-secondary')+'</span></div>');}
  else{
    var ps=proteinTargetSuggestion(),cs=calorieTargetSuggestion(),band=S.targetRate;
    var targ=[
      ['Calories',ph.calorieTarget?fmtKcal(ph.calorieTarget):'\u2014','user target',cs?('system: '+fmtKcal(cs.value,{estimate:true})+' ('+fmtKcal(cs.lo,{estimate:true,bare:true})+'\u2013'+fmtKcal(cs.hi,{estimate:true,bare:true})+') '+clsMark(cs.cls)):'system: needs TDEE'],
      ['Protein',ph.proteinTarget?fmtG(ph.proteinTarget):'\u2014','user target',ps?('system: '+fmtG(ps.lo)+'\u2013'+fmtG(ps.hi)+' from '+ps.basis+' '+clsMark('PRIOR')):''],
      ['Fat floor',ph.fatFloor?fmtG(ph.fatFloor):'\u2014','user target','system: 0.3\u20130.4 g/lb goal weight'],
      ['Fiber',ph.fiberTarget?fmtG(ph.fiberTarget):'\u2014','user target','reference: DV 28 g \u00b7 AI 38 g (men)'],
      ['Steps',ph.stepTarget?fmtNum(ph.stepTarget,0):'\u2014','user target',S.steps.baseline?('observed baseline '+fmtNum(S.steps.baseline,0)):''],
      ['Cardio',ph.cardioSessions?(ph.cardioSessions+'\u00d7 '+(ph.cardioMinutes||30)+' min'):'\u2014','user target','framework: 2\u00d725\u201330 \u2192 3\u20134\u00d740\u201345 min, RPE 5\u20136'],
      ['Resistance training',ph.trainingSessions?(ph.trainingSessions+'/week'):'\u2014','user target','program: '+trainingProgram().label],
      ['Sleep',ph.sleepTargetH?fmtH(ph.sleepTargetH):'\u2014','user target',''],
      ['Rate of loss',band?fmtRateRange(band.lo,band.hi):'\u2014',band?band.source:'',band&&band.band?('zone: '+band.band.zone+' \u00b7 '+band.band.label):''],
      ['Goal',(function(){var G=canonicalGoal();return (G.typeLabel?esc(G.typeLabel)+(G.activeTargetLb?' \u00b7 ':''):'')+(G.activeTargetLb?fmtWeight(G.activeTargetLb):(G.typeLabel?'':'\u2014'));})(),(function(){var G=canonicalGoal();return G.activeTargetSource||'user target';})(),ph.targetDate?('by '+shortDate(ph.targetDate)+(S.goal.status==='ok'&&S.goal.requiredRate!=null?(' \u00b7 requires '+fmtRate(S.goal.requiredRate)+' ('+S.goal.requiredVsBand+')'):'')):'no deadline']
    ];
    out+=uiCard({accent:'neutral',title:phaseLabel(ph)+' \u00b7 week '+phaseWeek(ph),sub:'since '+shortDate(ph.startDate)+(ph.targetDate?' \u00b7 target date '+shortDate(ph.targetDate):'')+' \u00b7 objective: '+esc(ph.objective||'\u2014'),presentation:{kind:'program',model:_programModel},body:'<div class="targ-list">'+targ.map(function(t){return '<div class="targ-row"><div class="targ-main"><span class="targ-name">'+t[0]+'</span><span class="num targ-val">'+t[1]+'</span>'+(t[2]?uiPill(t[2]):'')+'</div>'+(t[3]?'<div class="targ-sys">'+t[3]+'</div>':'')+'</div>';}).join('')+'</div><div class="btn-row">'+uiBtn('Edit targets','phase.edit',ph.id,'btn-primary')+uiBtn('End phase','phase.end',ph.id,'btn-secondary')+uiBtn('Start a new phase','phase.start',null,'btn-ghost')+'</div>'});
    out+=uiCard({title:'How targets and estimates are kept apart',sub:'four different things that are never mixed',body:uiRow('User target','what you chose',{sub:'held until you change it; the engine evaluates against it'})+uiRow('System recommendation','what the framework suggests '+clsMark('HEURISTIC'),{sub:'population rules: rate bands by weight zone, protein per kg, activity progression'})+uiRow('Model estimate','what the personal models infer '+clsMark('EMPIRICAL'),{sub:'TDEE, forecasts and goal dates; confidence shown, interval widens with horizon'})+uiRow('Observation','what actually happened '+clsMark('MEASURED'),{sub:'trend, intake, steps, sessions'})});
    out+=uiCard({title:'Criteria',sub:'success, stop and transition rules for this phase',body:kv([['success',esc(ph.successCriteria||'\u2014')],['stop',esc(ph.stopCriteria||'\u2014')],['transition',esc(ph.transitionCriteria||'\u2014')],['one-variable rule','only one major variable (calories, cardio, steps, training volume) changes per 14-day window'],['deload','every 6\u20138 weeks or when strength falls with poor recovery']])});
    out+=uiCard({title:'Phase progression (framework)',sub:'the source plan for a 270 \u2192 180 cut; the engine adapts the pace',body:'<div class="table-wrap"><table class="data"><thead><tr><th>weeks</th><th>phase</th><th>training</th><th>walking</th><th>cardio</th><th>focus</th></tr></thead><tbody>'+[['1\u20134','A adaptation','3\u00d7 full body','6\u20138k','2\u00d725\u201330','technique, consistency, protein'],['5\u201310','B fat loss','4\u00d7 upper/lower','8\u201310k','3\u00d730\u201340','rate 1.5\u20132.5 lb/wk, strength held'],['11\u201316','C recomposition','4\u00d7 U/L','10k+','3\u00d735\u201345','waist down, deload week 12'],['17\u201322','D preservation','4\u00d7 U/L','10\u201312k','3\u20134\u00d740\u201345','rate 0.75\u20131.5 lb/wk, muscle retention'],['23\u201326','E definition \u2192 maintenance','4\u00d7 U/L','10\u201312k','3\u00d735\u201340','final loss, transition protocol']].map(function(r){return '<tr>'+r.map(function(c,i){return '<td'+(i===0?' class="num"':'')+'>'+c+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table></div>'});
  }
  out+=uiFold('plan-phases','Phase history',(DB.phases.length)+' phases',DB.phases.slice().reverse().map(function(x){return uiRow(phaseLabel(x)+' \u00b7 '+shortDate(x.startDate)+' \u2192 '+(x.endDate?shortDate(x.endDate):'now'),uiPill(x.status,x.status==='active'?'good':'neutral'),{sub:x.outcome||x.objective||''});}).join('')||'<div class="muted">No phases yet.</div>');
  /* THE PLAN (H1): what you are working to, this week's shape, and why it last changed. */
  if(typeof ensurePlan==='function')ensurePlan();
  var _pl=currentPlan();
  if(_pl){var c=_pl.content,t=c.targets||{},X=explainPlanChange(_pl.id),CM=constraintModel();
    var DOWS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    var _SMv=scheduleModel();
    var weekHtml=_SMv.mode==='weekly'?('<div class="plan-week">'+DOWS.map(function(d){var v=c.training.week[d];return '<div class="pw-day'+(v?'':' rest')+'"><b>'+d+'</b><span>'+esc(v||'rest')+'</span></div>';}).join('')+'</div>'):
      /* a rotating or irregular schedule does not repeat weekly: the next 14 days, each with its shift and session */
      ('<div class="card-title" style="margin-top:8px">Next 14 days</div><div class="sched-strip">'+scheduleAhead(14).map(function(x){
        return '<div class="pw-day'+(x.planned?'':' rest')+'" title="'+attrEsc(x.why)+'"><b>'+esc(dowShort(x.date))+' '+esc(x.date.slice(8))+'</b>'+(x.shift?'<span class="sh sh-'+x.shift+'">'+esc(x.shift)+'</span>':'')+'<span>'+esc(x.planned||'rest')+'</span></div>';}).join('')+'</div>'+
       (_SMv.mode==='rotation'?'<div class="hint">D day shift \u00b7 N night shift \u00b7 O day off'+(_SMv.protectAfterNights?' \u00b7 the first day off after nights is kept for sleep':'')+'</div>':''))+
      '<div class="btn-row">'+uiBtn('Schedule','nav.schedule',null,'btn-sm btn-ghost')+'</div>';
    out+=uiCard({title:'The plan',sub:'version '+_pl.version+' \u00b7 since '+shortDate(_pl.effectiveFrom),body:
      uiRow('Goal',esc(c.goal.label||'not set')+(c.goal.activeTargetLb?(' \u00b7 '+fmtWeight(c.goal.activeTargetLb)):''),{sub:c.goal.activeTargetSource?esc(c.goal.activeTargetSource):''})+
      uiRow('Each day',(t.kcal?fmtNum(t.kcal,0)+' kcal':'')+(t.protein?' \u00b7 '+t.protein+' g protein':'')+(t.steps?' \u00b7 '+fmtNum(t.steps,0)+' steps':''))+
      uiRow('Each week',(t.trainingSessions?t.trainingSessions+' training sessions':'')+(t.cardioSessions?' \u00b7 '+t.cardioSessions+' cardio':''),{sub:esc(c.training.programLabel||'')})+
      weekHtml+
      '<div class="plan-why"><b>Latest change:</b> '+esc(X.headline)+(X.reason?' \u2014 '+esc(X.reason):'')+'</div>'+
      (function(){var F=planFeasibility();if(F.status!=='ok'||F.ok)return '';
        return '<div class="card-title" style="margin-top:10px">Doesn\u2019t fit yet</div>'+F.conflicts.slice(0,5).map(function(c){return uiRow(esc(c.what),'',{sub:esc(c.fix),tone:'attention'});}).join('')+
          (F.conflicts.length>5?'<div class="hint">and '+(F.conflicts.length-5)+' more</div>':'')+'<div class="btn-row">'+uiBtn('Build a programme that fits','gen.program',null,'btn-sm btn-primary')+'</div>';})()+
      (CM.missing.length?'<div class="hint">The plan would fit better knowing your '+esc(CM.missing.join(', '))+'. '+uiBtn('Add them','nav.welcome','4','btn-sm btn-ghost')+'</div>':'')});
    /* Suggested changes (H3): from how the plan is actually going, with evidence and alternatives; nothing changes
       until accepted. */
    var AP=adaptationProposals();
    if(AP.proposals.length)out+=uiCard({title:'Suggested changes',sub:'from how the last four weeks actually went',body:AP.proposals.map(function(pr){
      return '<div class="adapt"><div class="adapt-t">'+esc(pr.title)+'</div><div class="hint" style="font-size:inherit;color:var(--text-2)">'+esc(pr.why)+'</div>'+
        '<ul class="cue-list prov">'+pr.evidence.map(function(e){return '<li>'+esc(e)+'</li>';}).join('')+'</ul>'+
        '<div class="prov"><b>Also considered:</b> '+pr.alternatives.map(function(a){return esc(a.label)+' ('+esc(a.why)+')';}).join('; ')+'</div>'+
        '<div class="hint">Expected: '+esc(pr.expected)+' Trade-off: '+esc(pr.tradeoff)+' Confidence: '+esc(pr.confidence)+'.</div>'+
        '<div class="btn-row">'+uiBtn('Apply','adapt.apply',pr.id,'btn-sm btn-primary')+uiBtn('Not now','adapt.dismiss',pr.id,'btn-sm btn-ghost')+'</div></div>';}).join('')});
    /* How the last four weeks went (H4): the plan against what was done, as a calendar (heatmap renderer). */
    (function(){var days=[],rowsK=['weigh-in','training','cardio','nutrition','protein','steps','check-in'],LBL={'weigh-in':'Weigh-in',training:'Training',cardio:'Cardio',nutrition:'Calories',protein:'Protein',steps:'Steps','check-in':'Check-in'};
      for(var i=27;i>=0;i--)days.push(addDays(todayISO(),-i));
      var E=days.map(function(d){return executionFor(d);});
      var used=rowsK.filter(function(k){return E.some(function(e){return e.status==='ok'&&e.rows.some(function(r){return r.item===k;});});});
      if(!used.length)return;
      var ST={done:'done',partial:'partial','in progress':'partial',skipped:'skipped',unknown:'unknown',upcoming:'upcoming'};
      var cells=used.map(function(k){return E.map(function(e,ci){if(e.status!=='ok')return null;var r=e.rows.filter(function(x){return x.item===k;})[0];
        return r?{state:ST[r.status]||'unknown',text:r.status+(r.detail?(' \u2014 '+r.detail):'')}:null;});});
      var A=adherenceAnalysis(4),T=A.training;
      var summary=T?('Training: '+(T.counts.done+T.counts.partial)+' of '+T.counts.scheduled+' sessions done'+(T.moved?(' ('+T.moved+' on another day)'):'')+'. '+T.why):'';
      out+=uiCard({title:'How the last four weeks went',sub:'the plan against what was recorded',body:(summary?'<div class="hint" style="font-size:inherit">'+esc(summary)+'</div>':'')+
        renderChartSpec('heatmap',{title:'The plan against what was recorded, last four weeks',rows:used.map(function(k){return LBL[k];}),cols:days.map(function(d){return shortDate(d);}),cells:cells,
          colMarks:[{i:0,label:shortDate(days[0])},{i:27,label:'today'}]})});})();
    /* Plan history (H4): versions, programme changes and phases on one timeline. */
    (function(){var ev=[];plansOf().forEach(function(v){ev.push({date:v.effectiveFrom,lane:'Plan',short:'v'+v.version,label:'Plan v'+v.version+': '+explainPlanChange(v.id).headline});});
      programVersions().forEach(function(v){ev.push({date:v.from,lane:'Programme',short:'v'+v.version,label:v.change});});
      (DB.phases||[]).forEach(function(ph){if(ph.startDate)ev.push({date:ph.startDate,lane:'Phase',short:((PHASE_TYPES[ph.type]||{}).label||ph.type).slice(0,4),label:((PHASE_TYPES[ph.type]||{}).label||ph.type)+' phase started'});});
      if(ev.length<2)return;
      out+=uiCard({title:'Plan history',sub:ev.length+' events',body:renderChartSpec('timeline',{title:'Plan versions, programme changes and phases',events:ev,lanes:['Plan','Programme','Phase'],to:todayISO()})});})();
    var P=plansOf();
    out+=uiCard({title:'Why the plan changed',sub:'every version keeps its reason, evidence and the alternatives considered',body:
      (X.changes.length?X.changes.map(function(ch){return uiRow(esc(ch.what),esc(ch.from)+' \u2192 '+esc(ch.to));}).join(''):'<div class="hint">The first version: nothing changed yet.</div>')+
      ((X.evidence||[]).length?'<div class="card-title" style="margin-top:8px">Evidence</div><ul class="cue-list">'+X.evidence.map(function(e){return '<li>'+esc(e)+'</li>';}).join('')+'</ul>':'')+
      ((X.alternatives||[]).length?'<div class="card-title" style="margin-top:8px">Alternatives considered</div><ul class="cue-list">'+X.alternatives.map(function(e){return '<li>'+esc(e)+'</li>';}).join('')+'</ul>':'')+
      (X.expected?'<div class="hint">Expected: '+esc(typeof X.expected==='string'?X.expected:JSON.stringify(X.expected))+'</div>':'')+
      (P.length>1?'<div class="card-title" style="margin-top:8px">Versions</div>'+P.slice().reverse().slice(0,8).map(function(v){var e=explainPlanChange(v.id);var o=v.adaptation?adaptationOutcome(v.id):null;
        return uiRow('v'+v.version+' \u00b7 '+shortDate(v.effectiveFrom),esc(e.headline),o&&o.note?{sub:esc(o.note)}:null);}).join(''):'')});
  }
  out+=uiFold('plan-profile','Profile',p.name?(esc(p.name)+' \u00b7 '+esc(String(p.age||'?'))+' \u00b7 '+esc(String(p.sex||'?'))+' \u00b7 '+fmtHeight(p.heightIn)):'not set',kv([['name',esc(p.name||'\u2014')],['age / sex',(p.age||'\u2014')+' / '+(p.sex||'\u2014')],['height',fmtHeight(p.heightIn)],['start weight',p.startWeightLb?fmtWeight(p.startWeightLb):'\u2014'],['goal',(function(){var G=canonicalGoal();return (G.typeLabel?esc(G.typeLabel):'')+(G.targetWeightLb?((G.typeLabel?' \u00b7 ':'')+fmtWeight(G.targetWeightLb)):'')||'\u2014';})()],['training',esc(p.trainingExperience||'\u2014')],['activity baseline',esc((ACTIVITY_FACTORS[p.activityBaseline]||{}).label||'\u2014')],['diet',esc(p.dietPreference||'\u2014')],['equipment',esc(p.equipment||'\u2014')],['schedule',esc(p.schedule||'\u2014')]])+'<div class="btn-row">'+uiBtn('Edit profile','profile.edit',null,'btn-secondary btn-sm')+'</span></div>');
  out+=uiCard({title:'What if',sub:'projected from your own response where it is known, a population estimate where it is not',body:
    '<div class="sym-grid">'+WHATIF_PRESETS.map(function(w,i){return '<button class="chip'+(_WHATIF===i?' active':'')+'" data-act="plan.whatif" data-arg="'+i+'" aria-pressed="'+(_WHATIF===i)+'">'+esc(w.label)+'</button>';}).join('')+'</div>'+
    (_WHATIF!=null&&WHATIF_PRESETS[_WHATIF]?(function(){var cf=counterfactual(WHATIF_PRESETS[_WHATIF].changes);
      if(cf.status!=='ok')return '<div class="hint warn">'+esc(cf.text)+'</div>';
      return '<div class="divider"></div>'+uiRow('Projected trend','<strong>'+fmtRate(cf.projected)+'</strong>',{sub:'from '+fmtRate(cf.base)+' \u00b7 range '+fmtRateRange(cf.lo,cf.hi)+' \u00b7 '+clsMark(cf.cls)})+
        cf.parts.map(function(pp){return uiRow(esc(pp.variable)+' '+fmtSigned(pp.delta,0),fmtSigned(pp.effect,2)+' lb/wk',{sub:esc(pp.basis)});}).join('')+
        '<div class="prov">'+esc(cf.caveat)+'</div>';})():'<div class="prov">Pick a change to see what your own record predicts it would do. Nothing is applied \u2014 this is a projection, not an intervention.</div>')});
  setHTML('planZone',out);
};
/* ---- TRAIN ---- */
RENDERERS.train=function(){
  var S=getCurrentState();var t=todaysTraining();var ts=S.training;var st=ts.strength;var _sessionModel=sessionPresentationModel({blocks:(t.template||[]).map(function(r){return {phase:'PRIMARY',duration:null,volume:{sets:r[1],reps:r[2]},intensity:null,fatigue:null,rest:null,purpose:r[0]};})});var out='';
  var _movementModel=movementPresentationModel({renderer:'anatomical',sequences:(t.template||[]).map(function(r){return {exercise:r[0],sets:r[1],reps:r[2]};})});
  var _visualEntry='<div class="btn-row">'+uiBtn('Program calendar','nav.program',null,'btn-sm btn-secondary')+
    uiBtn('Movement and mobility','nav.movement',null,'btn-sm btn-secondary')+'</div>';
  var tmpl=t.template?'<div class="table-wrap"><table class="data"><thead><tr><th>exercise</th><th class="num">sets</th><th class="num">reps</th></tr></thead><tbody>'+t.template.map(function(r){return '<tr><td>'+r[0]+'</td><td class="num">'+r[1]+'</td><td class="num">'+r[2]+'</td></tr>';}).join('')+'</tbody></table></div><div class="prov" style="margin-top:6px">'+esc(t.program.rir)+'</div>':'';
  out+=uiCard({accent:t.day.kind==='lift'?'good':'neutral',title:'Today: '+t.day.label,sub:t.why.join(' \u00b7 ')||'\u2014',presentation:{kind:'session',model:_sessionModel},body:(t.adjust?'<div class="banner attention">'+esc(t.adjust)+'</div>':'')+tmpl+'<div class="prov">Movement presentation: '+_movementModel.sequences.length+' planned exercise sequences · mechanics remain descriptive, not inferred.</div><div class="btn-row">'+uiBtn(t.day.kind==='lift'?'Log this session':'Log a session','session.new',t.day.template||'','btn-primary')+(t.day.kind==='cardio'?uiBtn('Log cardio','log.open','cardio','btn-secondary'):'')+'</div>'});
  var stBody;
  if(st.status!=='ok')stBody='<div class="muted">'+esc((st.need||['log sessions with load and reps']).join(', '))+'. Strength trend is the strongest available proxy for muscle retention.</div>'+(st.per?st.per.map(function(p){return uiRow(p.exercise,p.status==='ok'?uiPill(p.direction,p.direction==='improving'?'good':(p.direction==='declining'?'negative':'neutral')):uiPill('insufficient'),{sub:p.status==='ok'?'':p.need});}).join(''):'');
  else stBody=st.per.map(function(p){if(p.status!=='ok')return uiRow(p.exercise,uiPill('insufficient'),{sub:p.need});var hist=p.history.map(function(hh,i){return {x:i,y:hh.best.value};});return '<div class="list-item"><div class="li-head"><div class="li-title">'+esc(p.exercise)+' <span class="mono muted">e1RM '+fmtNum(p.last.value,0)+' lb</span></div><div class="li-meta">'+uiPill(p.direction+(p.pct!=null?' '+fmtSigned(p.pct,1)+'%':''),p.direction==='improving'?'good':(p.direction==='declining'?'negative':'neutral'))+'</div></div>'+svgChart({height:70,series:[{type:'line',cls:'avg',pts:hist},{type:'dots',pts:hist,r:2}],yFmt:function(v){return fmtNum(v,0);},aria:p.exercise+' e1RM history'})+'<div class="prov">'+p.n+' exposures \u00b7 e1RM '+clsMark('DERIVED')+' '+esc(p.last.reliability)+(p.sustainedDecline?' \u00b7 sustained decline':'')+'</div></div>';}).join('');
  out+=uiCard({title:'Strength trend',sub:st.status==='ok'?('overall '+st.overall+' \u00b7 '+st.tracked+' lifts tracked \u00b7 conf '+st.confidence):'insufficient exposures',body:stBody});
  var vol=weeklyMuscleSets(7);var cov=movementCoverage(7);
  out+=uiCard({title:'This week',sub:ts.sessions7+' sessions \u00b7 '+ts.sets7+' sets \u00b7 '+ts.hardSets7+' hard (\u22643 RIR) \u00b7 volume load '+fmtNum(ts.volume7,0),body:uiRow('Consistency',ts.planned?(uiPill(ts.consistency,ts.consistency==='consistent'?'good':(ts.consistency==='partial'?'attention':'negative'))+' '+ts.adherence+'%'):'no plan',{sub:ts.planned?(ts.perWeek.toFixed(1)+'/week over 14 days vs '+ts.planned+' planned'):'set sessions/week in the phase'})+uiRow('Last session',ts.last?(esc(ts.last.name)+' '+ageSpan(ts.last.date)):'none',{})+uiRow('Movement coverage',cov.filter(function(c){return c.covered;}).length+' of 6 patterns',{sub:cov.map(function(c){return c.pattern+(c.covered?' \u2713':' \u2717');}).join(' \u00b7 ')})+(vol.length?'<div class="divider"></div><div class="card-title" style="font-size:13px">Sets per muscle (7 days)</div>'+vol.map(function(v){return uiRow(v.muscle,fmtNum(v.sets,1)+' sets',{tight:true});}).join(''):'')});
  out+=uiCard({title:'Recovery and deload',sub:'recovery '+S.recovery.level+(S.recovery.status==='ok'?' \u00b7 score '+S.recovery.score:''),body:(S.recovery.signals||[]).map(function(s){return uiRow(esc(s.text),uiPill('severity '+s.severity,s.severity>1?'negative':'attention'));}).join('')||'<div class="muted">No recovery signals'+(S.recovery.status!=='ok'?' rated yet':'')+'.</div>'+'<div class="prov" style="margin-top:8px">Deload rule: volume \u221230\u201350% for a week when strength falls across three exposures with poor recovery, or every 6\u20138 weeks. If strength returns after the deload, tissue was not lost.</div>'});
  out+=uiFold('train-program','Program',trainingProgram().label,'<div data-presentation-domain="program" data-presentation-sealed="1" class="lead" style="font-size:13px">'+esc(trainingProgram().why)+'</div><div class="btn-row">'+Object.keys(PROGRAMS).map(function(k){return uiBtn(PROGRAMS[k].label,'program.set',k,DB.settings.program===k?'btn-primary btn-sm':'btn-secondary btn-sm');}).join('')+'</div><div class="divider"></div>'+Object.keys(trainingProgram().week).map(function(d){var x=trainingProgram().week[d];return uiRow(d,x.label,{tight:true});}).join(''));
  out+=uiFold('train-sub','Substitutions and ontology',EXERCISES.length+' exercises \u00b7 '+Object.keys(MUSCLE_GROUPS).length+' muscle groups','<div class="form-row"><label for="subSearch">Exercise to substitute</label><input id="subSearch" type="text" placeholder="e.g. squat" data-act="train.sub" data-ev="input" autocomplete="off"></div><div id="subResults" class="muted">Type an exercise to see alternatives that share its pattern or primary muscles.</div>');
  /* Programme versions (H2): what the programme was, what changed, and what was done under each. */
  (function(){var V=programVersions();if(!V.length)return;
    out+=uiFold('train-programme-history','Programme history','version '+V[V.length-1].version+' \u00b7 '+V.length+' change'+(V.length===1?'':'s'),
      V.slice().reverse().map(function(v){return uiRow('v'+v.version+' \u00b7 '+esc(shortDate(v.from))+(v.to?' \u2013 '+esc(shortDate(v.to)):' \u2013 now'),esc(v.change),
        {sub:esc(v.label)+' \u00b7 '+v.sessions+' session'+(v.sessions===1?'':'s')+', '+v.sets+' sets logged under it'});}).join(''));})();
  out+=uiFold('train-history','Session history',DB.sessions.filter(function(s){return !s.retracted;}).length+' sessions',sessionsOf().slice(-20).reverse().map(function(s){return uiRow(esc(s.name)+' \u00b7 '+(s.sets||[]).length+' sets','<strong>'+shortDate(s.date)+'</strong>',{sub:(s.sets||[]).slice(0,4).map(function(x){return esc(x.exercise)+' '+(x.load!=null?fmtNum(x.load,0)+'\u00d7':'')+x.reps;}).join(' \u00b7 ')+((s.sets||[]).length>4?' \u2026':''),rsub:s.source});}).join('')||'<div class="muted">No sessions logged.</div>');
  var er=exerciseResponse();
  var okRows=er.rows.filter(function(r){return r.status==='ok';});
  if(er.rows.length)out+=uiCard({title:'How each lift is responding',sub:'e1RM slope over exposures, against your own session-to-session noise \u00b7 '+clsMark('EMPIRICAL'),body:
    (okRows.length?okRows.slice(0,8).map(function(r){
      var tone=r.direction==='progressing'?'good':(r.direction==='declining'?'negative':'neutral');
      return uiRow(esc(r.exercise),uiPill(r.direction,tone),{sub:(r.directionDetail?esc(r.directionDetail)+' \u00b7 ':'')+(r.slopePerWeek!=null?fmtSigned(r.slopePerWeek,1)+' e1RM/week \u00b7 ':'')+r.weeklySets+' sets/week \u00b7 '+r.exposures+' exposures'+(r.noiseFloor!=null?' \u00b7 your noise \u00b1'+fmtNum(r.noiseFloor,0):''),rsub:''})+
        '<div class="prov" style="margin:-4px 0 10px 0">'+esc(r.stimulus)+(r.fatigueCost?' \u00b7 '+esc(r.fatigueCost):'')+'<br><b>next</b> '+esc(r.suggestion)+'</div>';}).join(''):'')+
    (er.rows.filter(function(r){return r.status!=='ok';}).length?uiRow('Not yet readable',er.rows.filter(function(r){return r.status!=='ok';}).length+' lifts',{sub:'each needs 4 exposures before a slope means anything'}):'')});
  var prg=trainingProgram();
  if(prg.acsm)out+=uiFold('train-acsm','What the evidence supports','ACSM 2026 position stand','<div class="lead" style="font-size:13px">'+esc(prg.acsm)+'</div><div class="prov">Currier BS, Phillips SM, et al. Resistance Training Prescription for Muscle Function, Hypertrophy, and Physical Performance in Healthy Adults: An Overview of Reviews. Med Sci Sports Exerc 2026 (overview of 137 systematic reviews, &gt;30,000 participants). Effort target: '+esc(prg.rir)+'</span></div>');
  out+=uiCard({title:'Your plan',sub:(trainingProgram().custom?'edited':'built-in')+' \u00b7 '+esc(trainingProgram().label),body:
    '<div class="btn-row">'+uiBtn('Dashboard','nav.dashboard',null,'btn-sm btn-secondary')+'</div>'+
    '<div class="btn-row">'+uiBtn('Compose today','nav.compose',null,'btn-sm btn-primary')+uiBtn('Prepare','move.prepare',null,'btn-sm btn-secondary')+uiBtn('Resistance','nav.resistance',null,'btn-sm btn-secondary')+uiBtn('After the session','move.recover',null,'btn-sm btn-ghost')+uiBtn('Movement library','move.library',null,'btn-sm btn-ghost')+uiBtn('Progressions','move.progress',null,'btn-sm btn-ghost')+'</div>'+
    '<div class="btn-row">'+uiBtn('Build a plan','gen.program',null,'btn-sm btn-secondary')+uiBtn('What to change next week','gen.progress',null,'btn-sm btn-secondary')+uiBtn('Edit the plan','nav.planEdit',null,'btn-sm btn-ghost')+'</div>'+
    '<div class="prov">Exercises, sets, reps and which days you train are all changeable, and the plan can be adapted to the equipment you actually have. Changes are dated, so a replay shows the plan as it stood then and past sessions are not rewritten.</div>'});
  out=_visualEntry+out;
  setHTML('trainZone',out);
};
/* ---- FOOD ---- */
var _FOOD_DAY=null,_FOOD_Q='',_FOOD_RESULTS={local:[],branded:[],state:'idle'};
RENDERERS.food=function(){
  var today=todayISO();var day=_FOOD_DAY||today;var S=getCurrentState();var ph=S.phase||{};
  var _nutritionModel=nutritionPresentationModel({calories:{avg7:S.nutrition&&S.nutrition.avg7||null,avg14:S.nutrition&&S.nutrition.avg14||null},macros:{protein:S.nutrition&&S.nutrition.protein7||null},adequacy:null,inventory:(DB.foods||[]).length,cost:null,deficits:null,surpluses:null});
  var strip='';for(var i=6;i>=0;i--){var d=addDays(today,-i);var n=foodLogsOn(d).length;strip+='<button data-act="food.day" data-arg="'+d+'"'+(d===day?' class="active"':'')+'>'+dowShort(d)+'<i class="'+(n?'has':'')+'">'+(n?n+' items':'\u00b7')+'</i></button>';}
  var out='<div class="day-strip">'+strip+'</div>';
  var dn=dayNutrition(day);var tot=dn.totals;
  var manual=DB.observations.filter(function(o){return o.date===day&&o.type==='calories'&&!o.retracted&&o.source!=='food-log';})[0];
  var kcal=manual?manual.value:tot.kcal;
  var bars=[['Calories',kcal,ph.calorieTarget,'kcal'],['Protein',manual?(latestObs('protein',{asOf:day})||{}).value:tot.protein,ph.proteinTarget,'g'],['Fiber',tot.fiber,ph.fiberTarget||28,'g'],['Fat',tot.fat,ph.fatFloor,'g']].map(function(b){var pct=b[2]?Math.round(100*(b[1]||0)/b[2]):null;var tone=pct==null?'':(b[0]==='Calories'?(pct>110?'attention':(pct>=85?'good':'')):(pct>=90?'good':(pct>=60?'attention':'')));return uiRow(b[0],'<strong>'+(b[1]!=null?fmtNum(b[1],0):'\u2014')+'</strong>'+(b[2]?' / '+fmtNum(b[2],0):'')+' '+b[3],{sub:progressBar(pct==null?0:Math.min(100,pct),tone),rsub:pct!=null?pct+'% of target':'no target'});}).join('');
  out+=uiCard({title:(day===today?'Today':longDate(day))+' \u00b7 '+fmtKcal(kcal),sub:manual?'a manual calorie entry overrides the food log for this day':(dn.items+' items logged \u00b7 nutrition observations derived from the log'),presentation:{kind:'nutrition',model:_nutritionModel},body:bars+'<div class="btn-row">'+uiBtn('Add food','food.add',day,'btn-primary')+uiBtn('Quick calories','log.open','food','btn-secondary')+(foodLogsOn(addDays(day,-1)).length?uiBtn('Repeat yesterday','food.repeatDay',addDays(day,-1)+'|'+day,'btn-ghost'):'')+'</div>'});
  out+='<div class="form-row"><label for="foodSearch">Search foods <small>Foundation foods answer instantly; branded products load from the local database shards</small></label><input id="foodSearch" type="search" placeholder="chicken breast, greek yogurt, 0041570059920 (barcode)\u2026" value="'+attrEsc(_FOOD_Q)+'" data-act="food.search" data-ev="input" autocomplete="off"></div><div id="foodResults">'+renderFoodResults(day)+'</div>';
  MEALS.forEach(function(m){var bm=dn.byMeal[m];out+='<div class="meal-head"><div class="mh-title">'+m.charAt(0).toUpperCase()+m.slice(1)+'</div><div class="mh-tot">'+(bm.items.length?fmtKcal(bm.totals.kcal)+' \u00b7 P '+fmtNum(bm.totals.protein,0)+' \u00b7 C '+fmtNum(bm.totals.carbs,0)+' \u00b7 F '+fmtNum(bm.totals.fat,0):'\u2014')+(foodLogsOn(addDays(day,-1)).some(function(l){return l.meal===m;})&&!bm.items.length?' '+uiBtn('repeat','food.repeatMeal',addDays(day,-1)+'|'+m+'|'+day,'btn-sm btn-ghost'):'')+'</div></div>';out+=bm.items.length?bm.items.map(function(l){return '<div class="food-item" data-act="food.edit" data-arg="'+l.id+'" tabindex="0" role="button"><div><div class="fi-name">'+esc(l.food.name)+(l.food.brand?' <span class="muted">'+esc(l.food.brand)+'</span>':'')+'</div><div class="fi-src">'+esc(l.portionLabel)+' \u00b7 '+esc(l.food.source)+' '+esc(String(l.food.version||''))+'</div></div><div class="fi-kcal">'+fmtNum(l.nutrients.kcal,0)+' kcal<br><span class="muted">P '+fmtNum(l.nutrients.protein,0)+'</span></div></div>';}).join(''):'<div class="muted" style="font-size:12px">nothing logged</div>';});
  if(dn.items)out+='<div class="divider"></div>'+uiCard({title:'Against reference',sub:'targets first; DGA 2025\u20132030 and FDA Daily Values as context, not prescription',body:nutritionReference(dn).map(function(r){return uiRow(r.label,'<strong>'+r.value+'</strong>',{sub:r.ref,tone:r.tone});}).join('')});
  var quick=recentFoods(8),freq=frequentFoods(6),fav=favorites();
  out+=uiFold('food-quick','Recent, frequent and favorites',quick.length+' recent \u00b7 '+fav.length+' favorites',(fav.length?'<div class="card-title" style="font-size:13px">Favorites</div>'+fav.map(function(f){return foodItem(f,day);}).join(''):'')+(freq.length?'<div class="card-title" style="font-size:13px;margin-top:8px">Frequent</div>'+freq.map(function(f){return foodItem(f,day,f.count+'\u00d7');}).join(''):'')+(quick.length?'<div class="card-title" style="font-size:13px;margin-top:8px">Recent</div>'+quick.map(function(f){return foodItem(f,day);}).join(''):'<div class="muted">Log foods to build quick picks.</div>'));
  var avg='';if(S.nutrition.n7)avg=uiRow('7-day average intake',fmtKcal(S.nutrition.avg7),{sub:S.nutrition.n7+' of 7 days logged \u00b7 protein '+fmtG(S.nutrition.protein7,0)+'/day'})+uiRow('14-day average',fmtKcal(S.nutrition.avg14),{sub:S.nutrition.n14+' of 14 days'})+(S.energy.status==='ok'?uiRow('Observed energy balance',fmtSigned(S.energy.balance,0)+' kcal/day',{sub:'intake minus estimated TDEE '+fmtKcal(S.energy.tdee.value,{estimate:true})+' '+clsMark(S.energy.tdee.cls)+' \u00b7 range '+fmtSigned(S.energy.lo,0)+' to '+fmtSigned(S.energy.hi,0),tone:'inferred'}):uiRow('Observed energy balance','not yet',{sub:(S.energy.need||[]).join(', ')}));
  out+=uiFold('food-energy','What the food record feeds',S.nutrition.n7?(fmtKcal(S.nutrition.avg7)+' avg \u00b7 balance '+(S.energy.status==='ok'?fmtSigned(S.energy.balance,0):'unknown')):'no intake logged',avg||'<div class="muted">Intake logging drives TDEE, energy balance and the plateau diagnosis. Unlogged days are unknown, not zero.</div>');
  /* Possible duplicates among the person's own foods (H2): suggested, never merged without them. */
  (function(){var D=foodDuplicates();if(!D.length)return;
    out+=uiCard({title:'Possibly the same food',sub:'the same barcode, or a close name with matching nutrition',body:D.slice(0,5).map(function(d){
      return uiRow(esc(d.foodName),'',{sub:'looks like '+esc(d.matchName)+' \u2014 '+esc(d.reason)})+'<div class="btn-row">'+
        uiBtn('Same food','food.same',d.food+'|'+d.matches,'btn-sm btn-primary')+uiBtn('Different','food.notSame',d.food+'|'+d.matches,'btn-sm btn-ghost')+'</div>';}).join('')+
      '<div class="hint">Marking them the same counts them as one food in your frequent foods and meal suggestions. Nothing already logged changes.</div>'});})();
  /* This week by macro (H4): calories per day split by protein, carbohydrate and fat (stackedBar renderer). */
  (function(){var days=[];for(var i=6;i>=0;i--)days.push(addDays(todayISO(),-i));
    var get=function(t,d){var r=dailySeries(t,todayISO(),14).filter(function(x){return x.date===d;})[0];return r?r.value:0;};
    var P=days.map(function(d){return get('protein',d)*4;}),C=days.map(function(d){return get('carbs',d)*4;}),F=days.map(function(d){return get('fat',d)*9;});
    if(P.concat(C,F).every(function(v){return !v;}))return;
    var pl=currentPlan(),tg=pl&&pl.content.targets.kcal;
    out+=uiCard({title:'This week by macro',sub:'calories from protein, carbohydrate and fat',body:renderChartSpec('stackedBar',{title:'Calories by macro, last seven days',unit:'kcal',
      categories:days.map(function(d){return dowShort(d);}),series:[{name:'Protein',values:P},{name:'Carbohydrate',values:C},{name:'Fat',values:F}],target:tg||null,targetLabel:'target'})+
      '<div class="hint">A day with no macros logged shows a dash, not zero.</div>'});})();
  out+=uiFold('food-recipes','Recipes and my foods',DB.recipes.length+' recipes \u00b7 '+DB.foods.length+' custom foods',(DB.recipes.map(function(r){var t=recipeTotals(r);return uiRow(esc(r.name),fmtKcal(t.perServing.kcal)+'/serving',{sub:r.ingredients.length+' ingredients \u00b7 '+r.servings+' servings \u00b7 P '+fmtNum(t.perServing.protein,0)+' g'})+'<div class="btn-row">'+uiBtn('Log a serving','food.logRecipe',r.id+'|'+day,'btn-sm btn-secondary')+uiBtn('Edit','recipe.edit',r.id,'btn-sm btn-ghost')+'</div>';}).join(''))+(DB.foods.map(function(f){normalizeFood(f);var p=f.per100||f.perServing||{};return uiRow(esc(f.name),fmtNum(p.kcal,0)+' kcal/'+foodBasisLabel(f),{sub:'user entered \u00b7 P '+fmtNum(p.protein,0)+' C '+fmtNum(p.carbs,0)+' F '+fmtNum(p.fat,0)});}).join(''))+'<div class="btn-row">'+uiBtn('New recipe','recipe.edit','','btn-secondary btn-sm')+uiBtn('New custom food','food.custom','','btn-secondary btn-sm')+'</span></div>');
  out+=uiFold('food-sources','Data sources','USDA FDC '+FOUNDATION_RELEASE+' \u00b7 '+_foodManifestState,renderFoodSources());
  var ad=nutritionAdequacy(7);
  if(ad.status==='ok')out+=uiCard({title:'Adequacy (7-day)',sub:ad.logged+' of 7 days logged \u00b7 mean '+fmtKcal(ad.meanKcal)+' \u00b7 '+clsMark('DERIVED'),body:
    ad.rows.map(function(r){
      if(r.status!=='ok')return uiRow(r.label,'no data',{sub:r.note});
      var tone=r.verdict==='meets'||r.verdict==='within'?'good':(r.verdict==='below'||r.verdict==='above'?'attention':(r.verdict==='info'?'neutral':'negative'));
      return uiRow(r.label,'<strong>'+fmtNum(r.mean,r.mean<10?1:0)+' '+esc(r.unit)+'</strong>'+(r.target!=null?' '+uiPill(r.verdict,tone):''),{sub:(r.target!=null?(r.dir==='min'?'target \u2265':'limit \u2264')+fmtNum(r.target,r.target<10?1:0)+' '+esc(r.unit)+' \u00b7 ':'')+esc(r.ref)+(r.note?' \u00b7 '+esc(r.note):''),rsub:r.coverage<100?(r.coverage+'% coverage'):''});}).join('')+
    (ad.perMealProtein?'<div class="divider"></div>'+uiRow('Protein per meal','<strong>'+ad.perMealProtein.meals.map(function(m){return m.mean;}).join(' / ')+' g</strong>',{sub:'breakfast / lunch / dinner / snacks \u00b7 \u2265'+ad.perMealProtein.thresholdG+' g per meal \u00b7 '+esc(ad.perMealProtein.note)}):'')+
    (ad.fatFloor?uiRow('Fat floor',fmtG(ad.fatFloor.mean,0)+' / day',{sub:esc(ad.fatFloor.note),rsub:ad.fatFloor.meets?'above floor':'below floor'}):'')+
    (ad.caveat?'<div class="hint warn">'+esc(ad.caveat)+'</div>':'')});
  else out+=uiCard({title:'Adequacy (7-day)',sub:'not enough logged food',body:'<div class="muted">'+esc(ad.need||'log a day of food')+'</div>'});
  out+='<div class="btn-row">'+uiBtn('Intake composition','nav.nutritionviz',null,'btn-sm btn-secondary')+'</div>';
  setHTML('foodZone',out);
};
function foodItem(f,day,extra){return _foodItemCore(f,day,extra)+(f.lastQuantity!=null?'<div class="fi-again">'+uiBtn('Log again \u00b7 '+(f.lastLabel||(fmtNum(f.lastQuantity,0)+' '+(f.lastBasis||'g'))),'food.again',f.kind+'|'+f.id+'|'+day,'btn-sm btn-ghost')+'</div>':'');}
function _foodItemCore(f,day,extra){return '<div class="food-item" data-act="food.pick" data-arg="'+attrEsc(f.kind+'|'+f.id+'|'+day)+'" tabindex="0" role="button"><div><div class="fi-name">'+esc(f.name)+(f.brand?' <span class="muted">'+esc(f.brand)+'</span>':'')+'</div><div class="fi-src">'+esc(f.source||'')+(f.category?' \u00b7 '+esc(f.category):'')+(extra?' \u00b7 '+extra:'')+(f.discontinued?' \u00b7 discontinued':'')+'</div></div><div class="fi-kcal">'+foodKcalLabel(f)+'</div></div>';}
function renderFoodResults(day){
  var R=_FOOD_RESULTS;if(!_FOOD_Q||_FOOD_Q.length<2)return '';
  var out='';if(R.local.length)out+='<div class="card-title" style="font-size:12px;margin:6px 0 2px">Foundation, recipes and my foods</div>'+R.local.map(function(f){return foodItem(f,day);}).join('');
  if(R.state==='loading')out+='<div class="muted" style="font-size:12px;margin:8px 0">Searching branded products\u2026</div>';
  else if(R.state==='error')out+='<div class="muted" style="font-size:12px;margin:8px 0">Branded database unavailable: '+esc(R.error||'')+'. Cached shards still work offline; use Tools \u2192 Food database to prefetch.</div>';
  else if(R.branded.length)out+='<div class="card-title" style="font-size:12px;margin:10px 0 2px">Branded products <span class="muted">'+R.branded.length+' shown</span></div>'+R.branded.map(function(f){return foodItem(f,day);}).join('');
  else if(R.state==='done'&&!R.local.length)out+='<div class="muted" style="font-size:12px;margin:8px 0">No match. '+uiBtn('Create a custom food','food.custom',_FOOD_Q,'btn-sm btn-secondary')+'</div>';
  return out;
}
function renderFoodSources(){var m=_foodManifest;return FOOD_SOURCES.map(function(s){return uiRow(esc(s.name),uiPill(s.planned?'planned':'active',s.planned?'neutral':'good'),{sub:s.org+' \u00b7 '+s.license+' \u00b7 version '+s.version+' \u00b7 '+s.shipped+(m&&s.id==='FDC_BRANDED'?(' \u00b7 '+fmtNum(m.branded.records,0)+' products, '+m.branded.recShards+' record shards, '+fmtNum(m.totalBytes/1048576,0)+' MB'):'')});}).join('')+'<div class="prov" style="margin-top:8px">Precedence when sources disagree: your own entries \u203a NIH DSLD (planned) \u203a FNDDS (planned) \u203a Foundation \u203a Branded. Branded label energy is authoritative for that product; the 4/4/9 macro check only flags inconsistencies.</div><div class="btn-row">'+uiBtn('Load database manifest','food.manifest',null,'btn-sm btn-secondary')+uiBtn('Download all shards for offline','food.prefetch',null,'btn-sm btn-secondary')+'</div><div class="food-prefetch-status" class="prov" style="margin-top:6px"></div>';}
