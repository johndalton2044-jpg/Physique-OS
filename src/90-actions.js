/* ============================================================================
   REGION: ACTIONS — every interaction is a registered action reached through one delegated dispatcher.
   Enumerable, testable, keyboard-reachable.
   ============================================================================ */
var ACTIONS={};
function registerAction(name,fn){ACTIONS[name]=fn;}
function dispatchAct(name,arg,ev,el){var fn=ACTIONS[name];if(!fn){_q(new Error('unregistered action '+name));return;}try{var r=fn(arg,ev,el);if(r&&typeof r.then==='function')r.catch(function(e){_q(e);toast('That failed: '+esc(e&&e.message||e),{tone:'negative'});});}catch(e){_q(e);toast('That failed: '+esc(e.message),{tone:'negative'});}}
function _delegated(ev){
  var el=ev.target&&ev.target.closest?ev.target.closest('[data-act]'):null;if(!el)return;
  var wantEv=el.getAttribute('data-ev')||'click';
  if(ev.type==='keydown'){if(wantEv!=='click')return;if(el.tagName==='BUTTON'||el.tagName==='A'||el.tagName==='INPUT'||el.tagName==='SELECT'||el.tagName==='TEXTAREA'||el.tagName==='SUMMARY')return;if(ev.key!=='Enter'&&ev.key!==' ')return;ev.preventDefault();}
  else if(ev.type!==wantEv)return;
  if(ev.type==='click'&&(el.tagName==='INPUT'||el.tagName==='SELECT'||el.tagName==='TEXTAREA'))return;
  if(el.tagName==='SUMMARY'&&ev.type==='click'){setTimeout(function(){dispatchAct(el.getAttribute('data-act'),el.getAttribute('data-arg'),ev,el);},0);return;}
  if(el.tagName==='BUTTON'&&ev.type==='click')ev.preventDefault();
  dispatchAct(el.getAttribute('data-act'),el.getAttribute('data-arg'),ev,el);
}
function installDispatcher(){['click','input','change','keydown'].forEach(function(t){document.addEventListener(t,_delegated,t==='click'?false:true);});}
/* The rail reflects state: Back appears only when there is somewhere to go back to, the top button only when
   away from the top, and the attention button only when something actually needs attention. A control that is
   always present but usually inert teaches people to ignore it. */
/* A save that did not persist is the one failure worth interrupting for, because every later change compounds
   it. It is a banner rather than a toast: a toast that vanishes is the wrong shape for an unresolved problem. */
/* The replay banner is not dismissible and is rendered above everything: a person who forgets they are
   looking at history will act on it. */
function updateReplayBanner(){
  try{
    var el=document.getElementById('replayBanner');if(!el)return;
    if(!replayActive()){el.hidden=true;el.innerHTML='';return;}
    var r=replayMode();var b=replayBounds();
    el.hidden=false;
    el.innerHTML='<span class="rb-tag">REPLAY</span>'+
      '<span class="rb-text">'+esc(longDate(r.date))+' \u00b7 '+daysBetween(r.date,todayISO())+' days ago. Nothing recorded after this day is visible.'+
        /* Before the record entered the event history, the profile and settings of that day are unknown.
           Saying so beats quietly substituting today's, which is what it used to do. */
        ((typeof beforeBaseline==='function'&&beforeBaseline(r.date))?
          (' <strong>Your profile and settings as they stood then cannot be reconstructed \u2014 this record entered the event history on '+
            esc(longDate(recordBaseline().date))+', so the energy figures are reported as unavailable rather than assumed.</strong>'):'')+
        '</span>'+
      '<span class="rb-controls">'+
        '<button class="btn btn-sm btn-ghost" data-act="replay.step" data-arg="-7" aria-label="Back one week"'+(r.date<=b.min?' disabled':'')+'>\u00ab</button>'+
        '<button class="btn btn-sm btn-ghost" data-act="replay.step" data-arg="-1" aria-label="Back one day"'+(r.date<=b.min?' disabled':'')+'>\u2039</button>'+
        '<button class="btn btn-sm btn-ghost" data-act="replay.step" data-arg="1" aria-label="Forward one day"'+(r.date>=b.max?' disabled':'')+'>\u203a</button>'+
        '<button class="btn btn-sm btn-ghost" data-act="replay.step" data-arg="7" aria-label="Forward one week"'+(r.date>=b.max?' disabled':'')+'>\u00bb</button>'+
        '<button class="btn btn-sm btn-ghost" data-act="replay.waypoints">Moments</button>'+
        '<button class="btn btn-sm btn-ghost" data-act="replay.compare">Then and now</button>'+
        '<button class="btn btn-sm btn-primary" data-act="replay.exit">Back to today</button>'+
      '</span>';
  }catch(e){_q(e,'P2');}
}
function updateHealthBanner(){
  try{
    var el=document.getElementById('healthBanner');if(!el)return;
    var h=systemHealth();var crit=h.issues.filter(function(i){return i.severity==='critical';})[0];
    if(!crit){el.hidden=true;el.innerHTML='';return;}
    el.hidden=false;
    el.innerHTML='<span class="hb-text">'+esc(crit.what)+' \u2014 '+esc(crit.cando)+'</span>'+
      (crit.act?('<button class="btn btn-sm btn-primary" data-act="'+crit.act+'">Fix</button>'):'')+
      '<button class="btn btn-sm btn-ghost" data-act="nav.health">Details</button>';
  }catch(e){_q(e);}
}
function updateRail(){
  try{
    var y=window.scrollY||0;
    var back=document.getElementById('backFab');if(back)back.hidden=!navCanBack();
    var top=document.getElementById('topFab');if(top)top.hidden=y<400;
    /* The left rail mirrors position: "up" only once there is somewhere to go up to, "down" only while
       there is more below. */
    var up=document.getElementById('upFab');if(up)up.hidden=y<300;
    var down=document.getElementById('downFab');
    if(down){
      /* Only hide "down" when the page is genuinely scrollable AND we are at the end. Where the height is
         not yet known — first paint, or an environment that does no layout — leave it visible: a control
         that vanishes because a measurement was unavailable is worse than one shown needlessly. */
      /* Hide "down" once the CONTENT is fully in view, not once the document is — otherwise it stays lit
         while the only thing left below is the padding that clears the floating controls. */
      var target=bottomScrollTarget();
      var h=document.body.scrollHeight||0;
      var scrollable=h>window.innerHeight+40;
      down.hidden=scrollable&&y>=(target-8);
    }
    /* Attention lives in the header now: a count that is a status, not a floating action. */
    var att=document.getElementById('attnFab');
    if(att){var q=attentionQueue();var n=q.counts.action;
      att.hidden=!q.items.length;
      var cnt=document.getElementById('attnCount');
      if(cnt)cnt.textContent=String(q.items.length);
      att.setAttribute('aria-label','Attention: '+q.items.length+' item'+(q.items.length===1?'':'s')+(n?', '+n+' needing action':''));
      att.classList.toggle('urgent',n>0);}
    updateHealthBanner();updateReplayBanner();
    var undoFab=document.getElementById('undoFab');
    /* Undo is always in the right rail (usage review: "undo button still missing" \u2014 it only appeared after an action and
       vanished on reload); with nothing to undo it is dimmed and says so. */
    if(undoFab){var lbl=undoLabel();undoFab.hidden=false;undoFab.setAttribute('title',lbl?('Undo: '+lbl):'Nothing to undo');undoFab.setAttribute('aria-label',lbl?('Undo: '+lbl):'Nothing to undo');}
  }catch(e){_q(e);}
}
/* Secondary interaction: right-click on a pointer device, long press on touch. It never introduces an action
   that has no other route — it opens the same inspector a tap on the row opens, so the gesture is an
   accelerator rather than a hiding place. Long press does not fire if the finger moves (that is a scroll). */
function installContextMenus(){
  var open=function(el,ev){
    var rec=el.getAttribute('data-record');if(!rec)return false;
    var parts=rec.split(':');if(parts.length<2)return false;
    ev.preventDefault();
    if(parts[0]==='obs')openObsInspect(parts[1]);
    else if(parts[0]==='decision')openDecisionInspect(parts[1]);
    else return false;
    return true;
  };
  document.addEventListener('contextmenu',function(ev){var el=ev.target&&ev.target.closest?ev.target.closest('[data-record]'):null;if(el)open(el,ev);});
  var timer=null,startY=0,startEl=null;
  document.addEventListener('touchstart',function(ev){
    var el=ev.target&&ev.target.closest?ev.target.closest('[data-record]'):null;if(!el)return;
    startEl=el;startY=(ev.touches&&ev.touches[0])?ev.touches[0].clientY:0;
    clearTimeout(timer);timer=setTimeout(function(){if(startEl)open(startEl,{preventDefault:function(){}});startEl=null;},550);
  },{passive:true});
  var cancel=function(ev){
    if(ev&&ev.touches&&ev.touches[0]&&Math.abs(ev.touches[0].clientY-startY)<8)return; // still a press, not a scroll
    clearTimeout(timer);startEl=null;};
  document.addEventListener('touchmove',cancel,{passive:true});
  document.addEventListener('touchend',function(){clearTimeout(timer);startEl=null;},{passive:true});
}
var _lastScrollY=0,_scrollIdle=null;
function markScrollDirection(){
  var y=window.scrollY||0;
  var goingDown=y>_lastScrollY+4;
  var goingUp=y<_lastScrollY-4;
  _lastScrollY=y;
  var el=document.documentElement;
  /* Hidden only while moving DOWN, which is the reading direction and the one where a floating control is
     least wanted. Any upward movement, or a pause, brings them straight back. */
  if(goingDown&&y>120)el.setAttribute('data-scrolling','down');
  else if(goingUp)el.removeAttribute('data-scrolling');
  clearTimeout(_scrollIdle);
  _scrollIdle=setTimeout(function(){el.removeAttribute('data-scrolling');},450);
}
function installScrollWatch(){
  var pending=false;
  window.addEventListener('scroll',function(){
    try{markScrollDirection();}catch(e){}
    if(pending)return;pending=true;
    setTimeout(function(){pending=false;rememberScroll();updateRail();},120);},{passive:true});
}
function makeDelegatedControlsFocusable(){document.querySelectorAll('[data-act]').forEach(function(el){var role=el.getAttribute('role');if(el.tagName==='BUTTON'||el.tagName==='A'||el.tagName==='INPUT'||el.tagName==='SELECT'||el.tagName==='TEXTAREA'||el.tagName==='SUMMARY'||role==='presentation'||role==='option')return;if(!el.hasAttribute('tabindex'))el.setAttribute('tabindex','0');if(!role)el.setAttribute('role','button');});}
/* ---- navigation ---- */
function switchTab(tab){if(typeof applyRailInsets==='function'&&typeof requestAnimationFrame==='function')requestAnimationFrame(function(){try{applyRailInsets();}catch(e){}});   /* the visible cards change with the panel */

  if(typeof presentationViewGuard==='function'){var _pv=presentationViewGuard(tab);if(!_pv.ok)return;}
  if(!document.getElementById('view-'+tab))return;try{rememberScroll();}catch(e){}_TAB=tab;document.querySelectorAll('.view').forEach(function(v){v.classList.toggle('active',v.id==='view-'+tab);});document.querySelectorAll('nav.primary .tab').forEach(function(b){var on=b.getAttribute('data-tab')===tab;b.classList.toggle('active',on);if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');if(on&&b.scrollIntoView)try{b.scrollIntoView({block:'nearest',inline:'center'});}catch(e){}});try{history.replaceState(null,'','#'+tab);}catch(e){}renderAll();
  /* returning to a view restores where the user was reading rather than resetting to the top */
  try{if(!_NAV_SUPPRESS){restoreScroll(0);navPush();}}catch(e){_q(e);}   /* a tab always opens at the top, not where it was left */
  makeDelegatedControlsFocusable();}
registerAction('nav.tab',function(arg){switchTab(arg);});
registerAction('ui.skipToMain',function(){var m=document.getElementById('main');if(m)m.focus();});
registerAction('ui.fold',function(id,ev,el){setTimeout(function(){
  var d=el.closest('details');if(!d)return;
  DB.settings.folds=DB.settings.folds||{};
  var wasEmpty=d.getAttribute('data-lazy')==='1';
  DB.settings.folds[id]=d.open;save('fold',{quiet:true});
  /* A lazily-built fold has no body until it is opened, so opening one needs a render to fill it. Only the
     active view re-renders, and the open state is restored from settings, so nothing else moves. */
  if(d.open&&wasEmpty){try{if(_SHEET)renderSheet();else renderAll();}catch(e){_q(e,'P2');}}
},0);});
registerAction('ui.openAbout',function(){openSheet('edit',{form:'about',title:'About Physique OS',desc:'',buf:{}});});
registerAction('undo.last',function(){var label=undoLabel();if(!label)return;if(undo()){_memoInvalidate();renderAll();toast('Undid: '+esc(label));}});
/* ---- log sheet ---- */
registerAction('log.open',function(arg){openLog(arg||'weight');});
registerAction('log.close',function(){closeSheet();});
registerAction('log.backdrop',function(arg,ev){if(ev&&ev.target&&ev.target.id==='logBackdrop')closeSheet();});
registerAction('log.save',function(){saveQuickLog(false);});
registerAction('log.saveAnyway',function(){saveQuickLog(true);});
registerAction('jobs.run',function(){var res=runDueJobs();toast(res.length?('Ran '+res.length+' check'+(res.length===1?'':'s')):'Nothing was due');renderAll();});
registerAction('jobs.runOne',function(arg){var r=runJob(arg);if(r&&typeof r.then==='function')r.then(function(x){toast(x.text,{tone:x.ok?'good':'negative'});renderAll();});else if(r){toast(r.text,{tone:r.ok?'good':'negative'});renderAll();}});
registerAction('device.test',function(arg){var p=String(arg).split('|');setDeviceTest(p[0],p[1]);renderAll();toast('Recorded: '+p[1]);});
registerAction('plan.whatif',function(arg){_WHATIF=(_WHATIF===+arg?null:+arg);renderAll();});
registerAction('log.day',function(arg){_LOG_DAY=arg;renderAll();});
registerAction('log.foodDay',function(arg){_FOOD_DAY=arg;switchTab('food');});
/* a new type starts with empty fields: the weight typed before used to stay in the buffer and appear in the next type */
registerAction('sheet.logType',function(arg){var d=_SHEET.buf.date;_SHEET.buf={type:arg,date:d};renderSheet();});
registerAction('sheet.suppTiming',function(arg){var b=_SHEET.buf;b.timing=arg;b.pick=null;renderSheet();});
registerAction('sheet.suppPick',function(id){var b=_SHEET.buf;b.pick=b.pick||{};b.pick[id]=!b.pick[id];renderSheet();});
registerAction('sheet.suppDose',function(id,ev,el){var b=_SHEET.buf;b.doses=b.doses||{};if(el)b.doses[id]=el.value;});
registerAction('sheet.urine',function(v){_SHEET.buf.value=+v;renderSheet();});
registerAction('sheet.waterQuick',function(arg){var b=_SHEET.buf;b.value=(num(b.value)||0)+(+arg);renderSheet();});
registerAction('sheet.field',function(arg,ev,el){setField(arg,el.value);if(_SHEET&&_SHEET.opts.form==='foodAdd'&&(arg==='amount'||arg==='unit'))renderSheet();if(_SHEET&&(_SHEET.opts.form==='phase')&&MAJOR_VARS.indexOf(arg)>=0)renderSheet();if(_SHEET&&_SHEET.opts.form==='customFood'&&arg==='basis')renderSheet();if(_SHEET&&_SHEET.kind==='log'&&arg==='modality')renderSheet();if(_SHEET&&_SHEET.opts.form==='profile'&&arg==='sex')renderSheet();});
registerAction('sheet.scale',function(arg){var p=arg.split('|');setField(p[0],p[1]);renderSheet();});
registerAction('sheet.ctx',function(arg){var b=_SHEET.buf;b.tags=b.tags||{};b.tags[arg]=!b.tags[arg];renderSheet();});   /* several tags, each its own entry */
registerAction('sheet.set',function(arg,ev,el){var p=arg.split('|');var s=_SHEET.buf.sets[+p[0]];if(s){s[p[1]]=el.value;if(p[1]!=='exercise'){var row=el.closest('.set-grid');var hint=row&&row.nextElementSibling&&row.nextElementSibling.classList.contains('hint')?row.nextElementSibling:null;var e=e1rm(num(s.load),num(s.reps));if(hint)hint.textContent=e?('e1RM \u2248'+fmtNum(e.value,0)+' ('+e.reliability+')'):'';}}});
registerAction('sheet.setDel',function(arg){_SHEET.buf.sets.splice(+arg,1);renderSheet();});
registerAction('sheet.setAdd',function(){_SHEET.buf.sets.push({exercise:'',load:'',reps:'',rir:2});renderSheet();setTimeout(function(){var inputs=sheetBodyEl().querySelectorAll('.set-grid input[data-arg$="|exercise"]');if(inputs.length)inputs[inputs.length-1].focus();},30);});
registerAction('sheet.setDup',function(){var s=_SHEET.buf.sets;var last=s[s.length-1];s.push(last?Object.assign({},last):{exercise:'',load:'',reps:'',rir:2});renderSheet();});
registerAction('sheet.ing',function(arg,ev,el){var i=_SHEET.buf.ingredients[+arg];if(i){var q=_ingQty(i);i.quantity=num(el.value)||0;i.basis=q.basis;i.grams=q.basis==='g'?i.quantity:null;}});
registerAction('sheet.ingDel',function(arg){_SHEET.buf.ingredients.splice(+arg,1);renderSheet();});
/* ---- observations ---- */
registerAction('obs.correct',function(id){var o=DB.observations.filter(function(x){return x.id===id;})[0];if(!o)return;var t=OBS_TYPES[o.type];var disp=o.type==='weight'?fromCanonicalWeight(o.value):(/waist|neck|hip|chest|arm|thigh/.test(o.type)?fromCanonicalLength(o.value):o.value);return promptDialog({title:'Correct '+t.label,label:'New value ('+(o.type==='weight'?weightUnit():(/waist|neck|hip|chest|arm|thigh/.test(o.type)?lengthUnit():t.unit))+') \u2014 the original stays in the record',value:disp,inputmode:'decimal'}).then(function(v){if(v==null||v==='')return;var n=num(v);if(n==null){toast('Not a number',{tone:'negative'});return;}var canon=o.type==='weight'?toCanonicalWeight(n):(/waist|neck|hip|chest|arm|thigh/.test(o.type)?toCanonicalLength(n):n);correctObservation(id,canon,'user correction');_memoInvalidate();renderAll();toast('Corrected \u00b7 original preserved',{undo:true});});});
/* obs.retract is registered once, below: it was registered twice with different wording, and the later won. */
/* ---- profile / phase ---- */
registerAction('profile.edit',function(){openProfile();});
registerAction('profile.save',function(){saveProfile();});
registerAction('phase.start',function(arg){openPhase(null,arg||'cut');});
/* Edit means the current phase when none is named; without this, phase.edit with no id opened "Start a phase". */
registerAction('phase.edit',function(id){openPhase(id||((activePhase()||{}).id)||null);});
registerAction('phase.save',function(){savePhase();});
registerAction('phase.end',function(id){return promptDialog({title:'End this phase',label:'Outcome in a sentence (archived with the phase)',value:''}).then(function(v){if(v==null)return;changePlan({kind:'phase end',source:'your edit',reason:'You ended the phase'+(v?': '+v:''),expected:'as you set',apply:function(){return endPhase(id,v);}});_memoInvalidate();renderAll();toast('Phase archived');});});
registerAction('program.set',function(arg){if(!PROGRAMS[arg])return;pushUndo('program');if(changePlan({kind:'programme',source:'your edit',reason:'You chose the '+PROGRAMS[arg].label+' programme',expected:'as you set',apply:function(){return setProgram(arg,{source:'program control'});}}).result){_memoInvalidate();renderAll();toast('Program: '+PROGRAMS[arg].label);}});
registerAction('edit.close',function(){closeSheet();});
registerAction('edit.backdrop',function(arg,ev){if(ev&&ev.target&&ev.target.id==='editBackdrop')closeSheet();});
/* ---- sessions ---- */
registerAction('session.new',function(arg){openSession(null,arg||null);});
registerAction('session.edit',function(id){openSession(id);});
registerAction('session.save',function(){saveSession();});
registerAction('session.retract',function(id){return confirmDialog({title:'Delete this session?',msg:'The session is marked retracted and removed from strength and volume models. Undo is available.',okLabel:'Delete',danger:true}).then(function(ok){if(!ok)return;retractSession(id);_memoInvalidate();renderAll();toast('Session deleted',{undo:true});});});
registerAction('train.sub',function(arg,ev,el){var q=el.value;var out=document.getElementById('subResults');if(!out)return;if(!q||q.length<3){out.innerHTML='<div class="muted">Type an exercise to see alternatives.</div>';return;}var e=resolveExercise(q);if(!e){out.innerHTML='<div class="muted">Not in the ontology yet; log it anyway \u2014 free-text exercises still count for volume.</div>';return;}var subs=substitutesFor(q);out.innerHTML=uiRow(esc(e.name),uiPill(e.pattern),{sub:'primary '+e.primary.map(function(m){return MUSCLE_GROUPS[m];}).join(', ')+' \u00b7 '+e.equipment.join('/')+' \u00b7 fatigue '+e.fatigue+' \u00b7 skill '+e.skill})+subs.map(function(s){return uiRow(esc(s.exercise.name),'',{sub:s.why});}).join('');});
/* ---- decisions / experiments ---- */
registerAction('decision.apply',function(){var dec=decide();if(!dec.intervention){toast('Today\u2019s decision has no intervention to apply; it is a hold.');return;}var iv=dec.intervention;return confirmDialog({title:'Apply: '+dec.verb,msg:'<b>'+esc(iv.variable)+'</b> '+(iv.from!=null?esc(String(iv.from))+' \u2192 ':'')+(iv.to!=null?esc(String(iv.to)):'')+'.<br><br>This updates the phase target, records the decision, and creates an experiment with the prediction <i>'+esc(iv.expected)+'</i> to be checked in '+iv.recheckDays+' days. Undo is available.',okLabel:'Apply'}).then(function(ok){if(!ok)return;var exp=changePlan({kind:'decision',source:'decision',reason:dec.lede||dec.verb||'Today\u2019s decision',expected:(iv&&(iv.expected||iv.prediction))||dec.action||'the outcome the decision names',apply:function(){return applyDecisionIntervention(dec);}}).result;_memoInvalidate();renderAll();toast('Applied \u00b7 experiment recheck '+shortDate(exp.recheckDate),{undo:true});});});
registerAction('decision.user',function(){openSheet('edit',{form:'userDecision',title:'Record my decision',desc:'',buf:{verb:'',note:'',recheckDays:14}});});
registerAction('decision.userSave',function(){var b=_SHEET.buf;if(!b.verb){toast('Say what you decided',{tone:'negative'});return;}recordUserDecision(b);closeSheet();_memoInvalidate();renderAll();toast('Decision recorded');});
/* "New experiment" opens the ready-made options first; an open-ended form was the only way in (usage review). */
registerAction('exp.new',function(){openSheet('edit',{form:'expPicker',title:'Start an experiment',desc:'',buf:{}});});
registerAction('exp.custom',function(){openExperiment();});
SHEETS.expPicker=function(){
  var rows=EXPERIMENT_TEMPLATES.map(function(t0){var t=experimentTemplate(t0.id)||t0,d=t.design;
    var dur=d&&d.status==='ok'?(d.weeksNeeded+' weeks for you'+(d.feasible?'':' \u2014 your own noise may hide the effect')):'how long depends on data you have not logged yet';
    return '<div class="list-item"><div class="li-head"><div class="li-title">'+esc(t.label)+'</div><div class="li-meta">'+uiPill(t.kind||t.metric)+'</div></div>'+
      '<div class="li-body"><div>'+esc(t.question)+'</div><div class="hint">You would '+esc(t.todo||('change '+t.variable))+'. Measured on '+esc(t.metric)+' \u00b7 '+esc(dur)+'.</div>'+
      '<div class="btn-row">'+uiBtn('See this experiment','exp.fromTemplate',t.id,'btn-sm btn-primary')+'</div></div></div>';}).join('');
  return {body:'<div class="hint">Each of these is one change, sized to your own day-to-day noise so it runs long enough to answer its question.</div>'+rows+
    '<div class="btn-row" style="margin-top:10px">'+uiBtn('Design my own','exp.custom',null,'btn-sm btn-ghost')+'</div>',foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
registerAction('exp.save',function(){saveExperiment();});
registerAction('exp.evaluate',function(id){var e=DB.experiments.filter(function(x){return x.id===id;})[0];if(!e)return;var early=e.recheckDate>todayISO();return confirmDialog({title:early?'Evaluate early?':'Evaluate experiment',msg:(early?'The recheck date is '+shortDate(e.recheckDate)+'. Evaluating now uses fewer days and lowers confidence.<br><br>':'')+'The outcome is scored against the stamped prediction. An unsupported result is written to negative knowledge. The experiment is archived. Undo is available.',okLabel:'Evaluate'}).then(function(ok){if(!ok)return;var r=evaluateExperiment(id,{asOf:todayISO()});_memoInvalidate();renderAll();toast('Result: '+r.conclusion,{undo:true});});});
registerAction('exp.abandon',function(id){return confirmDialog({title:'Abandon experiment?',msg:'It is marked abandoned, not deleted; the intervention stays in the log. Undo is available.',okLabel:'Abandon',danger:true}).then(function(ok){if(!ok)return;var e=DB.experiments.filter(function(x){return x.id===id;})[0];pushUndo('abandon experiment');e.status='abandoned';e.abandonedAt=nowISO();e.completedAt=nowISO();var iv=DB.interventions.filter(function(i){return i.id===e.interventionId;})[0];if(iv)iv.status='abandoned';save('experiment:abandon');_memoInvalidate();renderAll();toast('Abandoned',{undo:true});});});
registerAction('neg.new',function(){openSheet('edit',{form:'negative',title:'Record negative knowledge',desc:'What did not work is as useful as what did \u2014 if it is written down with its conditions.',buf:{variable:'calories',confidence:'low'}});});
registerAction('neg.save',function(){var b=_SHEET.buf;if(!b.intervention){toast('Say what was tried',{tone:'negative'});return;}addNegative({intervention:b.intervention,variable:b.variable,expected:b.expected,observed:b.observed,reasons:String(b.reasons||'').split(',').map(function(s){return s.trim();}).filter(Boolean),confidence:b.confidence,applicability:'user recorded'});closeSheet();_memoInvalidate();renderAll();toast('Recorded');});
registerAction('pred.score',function(){var n=scorePredictions();_memoInvalidate();renderAll();toast(n?('Scored '+n+' prediction'+(n>1?'s':'')):'Nothing due');});
registerAction('diag.sym',function(arg){var i=_SYM.indexOf(arg);if(i>=0)_SYM.splice(i,1);else _SYM.push(arg);renderAll();});
registerAction('progress.range',function(arg){_RANGE=arg;renderAll();});
registerAction('replay.run',function(){var el=document.getElementById('replayDate');var d=el&&el.value;if(!isValidISO(d)){toast('Pick a date',{tone:'negative'});return;}if(d>todayISO()){toast('Replay looks backward only',{tone:'negative'});return;}_REPLAY_DATE=d;_REPLAY=replayAt(d);renderAll();announce('Replay for '+longDate(d)+': '+_REPLAY.decision.verb);});
/* ---- food ---- */
registerAction('food.day',function(arg){_FOOD_DAY=arg;renderAll();});
registerAction('food.search',function(arg,ev,el){_FOOD_Q=el.value;if(_FOOD_Q.length<2){_FOOD_RESULTS={local:[],branded:[],state:'idle'};setHTML('foodResults','');return;}runFoodSearch(_FOOD_Q,_FOOD_RESULTS);});
registerAction('food.add',function(arg){openFoodAdd(arg||_FOOD_DAY||todayISO());});
registerAction('food.pick',function(arg){var parts=arg.split('|');var f=foodByRef(parts[0]+'|'+parts[1]);if(!f){toast('Food not available offline',{tone:'negative'});return;}openFoodAdd(parts[2]||_FOOD_DAY||todayISO(),f);});
registerAction('foodsheet.search',function(arg,ev,el){_FOODSHEET.q=el.value;if(_FOODSHEET.q.length<2){_FOODSHEET.local=[];_FOODSHEET.branded=[];_FOODSHEET.state='idle';var r=document.getElementById('fs_results');if(r)r.innerHTML=renderFoodSheetResults();return;}runFoodSearch(_FOODSHEET.q,_FOODSHEET);});
registerAction('foodsheet.pick',function(arg){var f=foodByRef(arg);if(!f)return;_FOODSHEET.picked=f;prepPortion(f);});
registerAction('foodsheet.back',function(){_FOODSHEET.picked=null;renderSheet();setTimeout(function(){var q=document.getElementById('fs_q');if(q)q.focus();},30);});
registerAction('foodsheet.save',function(){saveFoodSheet();});
registerAction('food.fav',function(arg){var f=_FOODSHEET.picked||foodByRef(arg);if(!f)return;var added=toggleFavorite(f);renderSheet();toast(added?'Added to favorites':'Removed from favorites');});
registerAction('food.edit',function(id){var l=DB.foodLogs.filter(function(x){return x.id===id;})[0];if(!l)return;var basis=l.basis||'g',pt=l.portion||{amount:l.quantity!=null?l.quantity:l.grams,unit:basis==='ml'?'ml':(basis==='serving'?'serving':'g')};
  openSheet('edit',{form:'foodEdit',title:'Edit entry',desc:'',buf:{log:l,amount:pt.amount,unit:pt.unit,quantity:l.quantity!=null?l.quantity:l.grams,meal:l.meal}});});
registerAction('food.editSave',function(){var b=_SHEET.buf,f=_foodForEdit(b.log),res=portionResolve(f,b.amount,b.unit);if(!res||!res.qty){toast('That amount does not resolve for this food',{tone:'negative'});return;}
  var lab=(b.unit.indexOf('portion:')===0||b.unit==='serving')?((num(b.amount)===1?'':fmtNum(num(b.amount),num(b.amount)%1?2:0)+' \u00d7 ')+(b.unit.indexOf('portion:')===0?b.unit.slice(8):'serving')+' ('+_qtyLabel(res.qty,res.basis)+')'):res.label;
  updateFoodLog(b.log.id,res.qty,b.meal,{amount:num(b.amount),unit:b.unit,label:lab});_memoInvalidate();closeSheet();renderAll();toast('Updated',{undo:true});});
registerAction('foodsheet.clear',function(){_FOODSHEET.q='';_FOODSHEET.local=[];_FOODSHEET.branded=[];_FOODSHEET.state='idle';_FOODSHEET.picked=null;renderSheet();setTimeout(function(){var q=document.getElementById('fs_q');if(q){q.value='';q.focus();}},30);});
registerAction('foodsheet.saveAnother',function(){saveFoodSheet({another:true});});
registerAction('food.remove',function(id){removeFoodLog(id);_memoInvalidate();closeSheet();renderAll();toast('Removed',{undo:true});});
registerAction('food.repeatDay',function(arg){var p=arg.split('|');var n=repeatDay(p[0],p[1]);_memoInvalidate();renderAll();toast('Repeated '+n+' items',{undo:true});});
registerAction('food.repeatMeal',function(arg){var p=arg.split('|');var n=repeatMeal(p[0],p[1],p[2]);_memoInvalidate();renderAll();toast('Repeated '+n+' items',{undo:true});});
registerAction('food.logRecipe',function(arg){var p=arg.split('|');var r=DB.recipes.filter(function(x){return x.id===p[0];})[0];if(!r)return;var f=recipeAsFood(r);openFoodAdd(p[1]||todayISO(),f);});
registerAction('recipe.edit',function(id){openRecipe(id||null);});
registerAction('recipe.search',function(arg,ev,el){_RCP.q=el.value;if(_RCP.q.length<2){_RCP.local=[];_RCP.branded=[];var r0=document.getElementById('rcp_results');if(r0)r0.innerHTML='';return;}_RCP.local=foodSearchLocal(_RCP.q,10).map(catalogFood);_RCP.state='loading';var r=document.getElementById('rcp_results');if(r)r.innerHTML=renderRecipeResults();var seq=(_RCP._seq=(_RCP._seq||0)+1);foodSearchBranded(_RCP.q,10).then(function(list){if(_RCP._seq!==seq)return;_RCP.branded=list.map(catalogFood);_RCP.state='done';var r2=document.getElementById('rcp_results');if(r2)r2.innerHTML=renderRecipeResults();}).catch(function(e){if(!e||!e.availability)_q(e);_RCP.state='error';});});
registerAction('recipe.addIng',function(arg){var f=foodByRef(arg);if(!f)return;normalizeFood(f);_SHEET.buf.ingredients.push(f.basis==='serving'?{food:f,quantity:1,basis:'serving'}:{food:f,quantity:100,basis:f.basis,grams:f.basis==='g'?100:null});_RCP.q='';_RCP.local=[];_RCP.branded=[];renderSheet();});
registerAction('recipe.save',function(){saveRecipeSheet();});
registerAction('food.custom',function(arg){openSheet('edit',{form:'customFood',title:'Custom food',desc:'For foods not in the database. Per 100 g or per serving.',buf:{name:arg&&!/^\d+$/.test(arg)?arg:'',basis:'100'}});});
registerAction('food.customSave',function(){saveCustomFood();});
registerAction('food.manifest',function(){return loadFoodManifest().then(function(){renderAll();toast('Manifest loaded');}).catch(function(e){renderAll();toast('Manifest unavailable: '+esc(e.message),{tone:'negative'});});});
/* The status appears in the Food tab and in Tools; by id only the first copy (perhaps on a hidden tab) was updated. */
registerAction('food.prefetch',function(){var _els=[].slice.call(document.querySelectorAll('.food-prefetch-status'));var el={set textContent(v){_els.forEach(function(e){e.textContent=v;});}};return confirmDialog({title:'Download the whole food database?',msg:'About 93 MB across 1,100 files, cached by the service worker for offline search. Needs a network connection now.',okLabel:'Download'}).then(function(ok){if(!ok)return;return prefetchFoodDB(function(d,t){if(el)el.textContent=d+' / '+t+' files cached';}).then(function(r){toast('Cached '+r.done+' of '+r.total+' files');if(el)el.textContent='complete: '+r.done+' files \u00b7 '+fmtNum(r.bytes/1048576,0)+' MB';});});});
/* ---- settings ---- */
/* settings map onto <html> attributes: the stylesheet selects html[data-contrast|data-motion|data-density] (P0 fix: these were set on <body>, so the selectors never matched) */
function applySettings(){var s=DB.settings;var root=document.documentElement;
  /* Saved chart widgets live in settings; restore them into the one widget registry on every load, or a
     chart saved from the Visualization Studio would vanish after a reload. */
  if(typeof restoreUserWidgets==='function')restoreUserWidgets();var _navModel=(typeof navigationModel==='function')?navigationModel({views:Object.keys(typeof VIEW_REGISTRY!=='undefined'?VIEW_REGISTRY:{}),favorites:s.favoriteViews||[],hidden:s.hiddenViews||[],pinned:s.pinnedViews||[],shortcuts:s.navigationShortcuts||{}}):null;var _personal=(typeof personalizationModel==='function')?personalizationModel(s):null;var scale={XS:0.85,S:0.93,M:1,L:1.12,XL:1.28}[s.textScale]||1;root.style.setProperty('--ts',String(scale));root.setAttribute('data-density',s.density||'cozy');root.setAttribute('data-contrast',s.contrast||'normal');root.setAttribute('data-motion',s.motion||'auto');root.setAttribute('data-models',s.showModels===false?'hide':'show');root.setAttribute('data-text-scale',s.textScale||'M');if(_navModel&&_navModel.status==='ok')root.setAttribute('data-navigation-views',String(_navModel.order.length));/* data-personalization was removed. personalizationModel() returns status 'ok' unconditionally, so the
   attribute read "active" whether or not anything had been personalised, and no stylesheet rule read it.
   It carried no information to nothing. Adding a CSS rule purely to satisfy the dead-toggle audit would
   have hidden that rather than fixed it. */
root.removeAttribute('data-personalization');if(typeof applyPresentationAppearance==='function')applyPresentationAppearance(s);if(typeof responsiveSpec==='function'){var _rs=responsiveSpec(window.innerWidth||1024,{keyboardAvoidance:true,touchTarget:44});root.setAttribute('data-responsive-capability',_rs.capability);root.style.setProperty('--presentation-touch-target',_rs.touchTarget+'px');root.style.setProperty('--presentation-density-multiplier',String(typeof DENSITY_ENGINE!=='undefined'?DENSITY_ENGINE.multiplier(s.density==='cozy'?'normal':(s.density||'normal')):1));var _motion=(typeof animationPolicy==='function')?animationPolicy({duration:'normal',easing:'standard'},s.motion==='reduced'):null;if(_motion){root.style.setProperty('--presentation-motion-duration',_motion.duration===0?'0ms':'var(--motion)');root.setAttribute('data-presentation-motion',_motion.motion||'animated');}}if(document.body){['data-density','data-contrast','data-motion','data-models'].forEach(function(k){document.body.removeAttribute(k);});}
  /* Rail visibility, and the chart insets that depend on where the rails are. Text size, density and rail visibility
     all move them; measured after paint. (These two lines first landed at the end of exportCSV — inserted by a
     pattern that assumed this function spanned several lines; it is written on one.) */
  document.documentElement.setAttribute('data-rails',DB.settings.rails==='off'?'off':'on');
  document.documentElement.setAttribute('data-detail',typeof detailLevel==='function'?detailLevel():'insightful');
  /* A tab hidden by the detail level cannot stay open. */
  if(typeof TAB_LEVEL!=='undefined'&&typeof _TAB!=='undefined'&&_TAB&&TAB_LEVEL[_TAB]&&!levelAllows(TAB_LEVEL[_TAB])&&typeof switchTab==='function')setTimeout(function(){switchTab('today');},0);
  if(typeof applyRailInsets==='function'&&typeof requestAnimationFrame==='function')requestAnimationFrame(function(){try{applyRailInsets();}catch(e){}});
}
['units','textScale','density','contrast','motion','rails','detail','lineSpacing','letterSpacing','textWeight'].forEach(function(k){registerAction('settings.'+k,function(arg){DB.settings[k]=arg;save('settings');applySettings();_memoInvalidate();renderAll();});});
['theme','accent','font','shape'].forEach(function(k){
  registerAction('settings.'+k,function(arg){
    var r=setAppearance(k,arg);
    if(r.status==='refused'){toast(r.note,{tone:'negative'});return;}
    if(r.status!=='ok')return;
    save('settings');applySettings();_memoInvalidate();renderAll();
  });
});
var _MV={kind:'pattern',id:'squat'},_PG={weeks:4},_NU={days:14};
registerAction('nav.movement',function(){openSheet('edit',{form:'movement',title:'Movement and mobility',
  desc:'Strength patterns and mobility poses on one skeleton and one joint ontology.',buf:{}});});
registerAction('mv.pick',function(arg){var p=String(arg||'').split('|');_MV={kind:p[0],id:p[1]};renderSheet();});
registerAction('nav.program',function(){openSheet('edit',{form:'program',title:'Program',
  desc:'What was planned, and what was done. Read only \u2014 nothing here reschedules anything.',buf:{}});});
registerAction('pg.weeks',function(arg){_PG.weeks=+arg||4;renderSheet();});
registerAction('nav.nutritionviz',function(){openSheet('edit',{form:'nutritionviz',title:'Intake composition',
  desc:'What was logged each day. A day with nothing logged is a gap, not zero intake.',buf:{}});});
registerAction('nu.days',function(arg){_NU.days=+arg||14;renderSheet();});
var _BM={days:14};
registerAction('nav.bodymap',function(){_BM={days:14};openSheet('edit',{form:'bodymap',title:'Where training lands',
  desc:'Local load per muscle from the fatigue model, drawn on the same anatomy the models use.',buf:{}});});
registerAction('bm.days',function(arg){_BM.days=+arg||14;renderSheet();});
var _VIZ={modelId:'weight_trend',chartType:'line'};
/* ============================================================================
   MOVEMENT SCREENS: exercise library, mobility, and after the session.
   ============================================================================ */
var _LIB={q:'',group:'all',equip:'all',level:'all'};
var LIB_EQUIP=[['all','Any'],['bodyweight','Bodyweight'],['dumbbell','Dumbbells'],['barbell','Barbell'],['kettlebell','Kettlebell'],['band','Bands'],['cable','Cable'],['machine','Machines']];
var LIB_GROUP_LABEL={all:'All',push:'Push',pull:'Pull',squat:'Squat and lunge',hinge:'Hinge and glutes',core:'Core',carry:'Carry and grip',power:'Jump and throw',accessory:'Arms and small muscles'};
function libraryMatches(){
  var q=_LIB.q.trim().toLowerCase();
  return EXERCISES.filter(function(e){
    if(_LIB.group!=='all'&&(PATTERN_GROUPS[_LIB.group]||[]).indexOf(e.pattern)<0)return false;
    if(_LIB.equip!=='all'&&e.equipment.indexOf(_LIB.equip)<0)return false;
    if(_LIB.level!=='all'&&e.level!==_LIB.level)return false;
    if(q&&(e.name+' '+(e.aliases||[]).join(' ')+' '+e.pattern+' '+e.primary.map(function(m){return MUSCLE_GROUPS[m]||m;}).join(' ')).toLowerCase().indexOf(q)<0)return false;
    return true;}).sort(function(a,b){var L={beginner:0,intermediate:1,advanced:2};return (L[a.level]-L[b.level])||a.name.localeCompare(b.name);});
}
function _chipRow(list,cur,act){return '<div class="btn-row wrap">'+list.map(function(x){return uiBtn(x[1],act,x[0],'btn-sm '+(cur===x[0]?'btn-primary':'btn-secondary'));}).join('')+'</div>';}
function _mname(m){return MUSCLE_GROUPS[m]||m;}
SHEETS.exlibrary=function(){
  var list=libraryMatches();
  var body='<label class="fld"><span>Search</span><input id="libSearch" type="text" value="'+attrEsc(_LIB.q)+'" placeholder="squat, glutes, band\u2026" data-act="lib.search" data-ev="input" aria-label="search exercises"></label>'+
    _chipRow(Object.keys(LIB_GROUP_LABEL).map(function(k){return [k,LIB_GROUP_LABEL[k]];}),_LIB.group,'lib.group')+
    _chipRow(LIB_EQUIP,_LIB.equip,'lib.equip')+
    _chipRow([['all','Any level'],['beginner','Beginner'],['intermediate','Intermediate'],['advanced','Advanced']],_LIB.level,'lib.level')+
    '<div class="hint">'+list.length+' of '+EXERCISES.length+' exercises</div>'+
    list.slice(0,60).map(function(e){return '<button class="lib-row" data-act="nav.exercise" data-arg="'+e.id+'"><span class="lib-name">'+esc(e.name)+'</span>'+
      '<span class="lib-meta">'+esc(e.primary.map(_mname).join(', '))+' \u00b7 '+esc(e.equipment.join(', '))+'</span><span class="lib-level">'+esc(e.level)+'</span></button>';}).join('')+
    (list.length>60?'<div class="hint">Showing the first 60 \u2014 narrow the search to see the rest.</div>':'');
  return {body:body,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
SHEETS.exercise=function(){
  var e=EXERCISES.filter(function(x){return x.id===_SHEET.buf.id;})[0];if(!e)return {body:uiEmpty('Not found','',''),foot:''};
  var anim='';try{anim=renderMovement(movementModel(e.pattern));}catch(err){anim='';}
  var nm=function(id){var x=EXERCISES.filter(function(y){return y.id===id;})[0];return x?x.name:id;};
  var lad=ladderFor(e.id).map(function(L){
    return '<div class="card-title" style="margin-top:10px">'+esc(L.label)+' \u2014 step '+L.position+' of '+L.of+'</div>'+
      '<div class="btn-row wrap">'+(L.easier?uiBtn('\u2190 Easier: '+nm(L.easier),'nav.exercise',L.easier,'btn-sm btn-secondary'):'')+
      (L.harder?uiBtn('Harder: '+nm(L.harder)+' \u2192','nav.exercise',L.harder,'btn-sm btn-secondary'):'')+'</div>'+
      '<div class="hint">Move up when you can do '+esc(L.up)+'. Move down if '+esc(L.down)+'.</div>';}).join('');
  var body='<div class="ex-anim">'+anim+'</div>'+
    uiRow('Works',esc(e.primary.map(_mname).join(', ')),{sub:e.secondary.length?('also '+esc(e.secondary.map(_mname).join(', '))):''})+
    uiRow('Equipment',esc(e.equipment.join(', ')))+uiRow('Level',esc(e.level)+(e.unilateral?' \u00b7 one side at a time':'')+(e.isometric?' \u00b7 a hold':''))+
    '<div class="card-title" style="margin-top:8px">How to do it</div><ol class="cue-list">'+(e.cues||[]).map(function(c){return '<li>'+esc(c)+'</li>';}).join('')+'</ol>'+
    (function(){var O=exerciseOntology(e.id);if(O.status!=='ok')return '';
      return '<div class="card-title" style="margin-top:8px">How it loads you</div>'+
        uiRow('Movement',esc(O.plane)+' plane \u00b7 '+esc(O.axis))+uiRow('Joints',esc(O.joints.join(', ')))+
        uiRow('Load',esc(O.loadModes.join(', ')),{sub:'stability: '+esc(O.stability)+' \u00b7 range: '+esc(O.rom)})+
        (O.cautions.length?'<div class="card-title" style="margin-top:8px">Take care if you have</div><ul class="cue-list">'+O.cautions.map(function(c){return '<li>'+esc(c)+'</li>';}).join('')+'</ul><div class="hint">'+esc(O.note)+' An easier version is usually a better choice than pushing through pain.</div>':'');})()+lad;
  return {body:body,foot:uiBtn('Back to the library','nav.exlibrary',null,'btn-secondary')+'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
registerAction('nav.exlibrary',function(){openSheet('edit',{form:'exlibrary',title:'Exercise library',desc:'Every exercise with how to do it, what it works, and the easier and harder versions.',buf:{}});});
registerAction('nav.exercise',function(id){var e=EXERCISES.filter(function(x){return x.id===id;})[0];if(!e)return;
  openSheet('edit',{form:'exercise',title:e.name,desc:'',buf:{id:id}});});
registerAction('lib.search',function(a,ev,el){_LIB.q=el?el.value:'';renderSheet();});   /* the in-place update keeps the search field */
registerAction('lib.group',function(k){_LIB.group=k;renderSheet();});
registerAction('lib.equip',function(k){_LIB.equip=k;renderSheet();});
registerAction('lib.level',function(k){_LIB.level=k;renderSheet();});
/* ---- mobility ---- */
var _ROUTINE=null;
function _routineBody(r){
  return '<div class="hint">'+esc(r.why)+' About '+r.minutes+' minute'+(r.minutes===1?'':'s')+'.</div>'+r.items.map(function(m,i){
    var pic='';if(m.pose){try{pic='<div class="mob-pose">'+renderPose(poseModel(m.pose))+'</div>';}catch(e){}}
    return '<div class="mob-step"><div class="mob-num">'+(i+1)+'</div><div><div class="mob-name">'+esc(m.name)+' <span class="mob-dose">'+esc(m.dose)+'</span></div>'+
      (function(){var sec=/(\d+)\s*s(ec)?\b/.exec(String(m.dose||''));return uiTimer('mob-'+(m.id||i),sec?{duration:+sec[1]}:{choices:[30,45,60]});})()+
      '<ul class="cue-list">'+m.cues.map(function(c){return '<li>'+esc(c)+'</li>';}).join('')+'</ul>'+pic+'</div></div>';}).join('');
}
SHEETS.routine=function(){var r=_ROUTINE;if(!r)return {body:'',foot:''};
  return {body:_routineBody(r),foot:uiBtn('All routines','nav.mobility',null,'btn-secondary')+uiBtn('Mark done','mob.done',null,'btn-primary')};};
/* A completed routine is logged as mobility minutes with its name, so it shows in the history. */
function logMobility(title,minutes){
  var r=addObservation({type:'mobility',date:todayISO(),value:Math.max(1,Math.round(minutes)),note:String(title||'Mobility').slice(0,80)});
  _memoInvalidate();renderAll();return r;
}
function mobilityThisWeek(){var o=obsOf('mobility',{from:addDays(todayISO(),-6)});return {count:o.length,minutes:o.reduce(function(a,x){return a+(x.value||0);},0)};}
registerAction('mob.done',function(){var r=_ROUTINE;if(!r)return;logMobility(r.title,r.minutes);closeSheet();
  var w=mobilityThisWeek();toast(r.title+' logged \u00b7 '+w.count+' this week');});
registerAction('mob.cooldownDone',function(){var P=postSessionSummary(_POST&&_POST.id||((DB.sessions||[]).filter(function(x){return !x.retracted;}).slice(-1)[0]||{}).id);
  if(!P)return;logMobility('Cool-down after '+(P.session.name||'session'),P.coolDown.minutes);renderSheet();toast('Cool-down logged');});
registerAction('nav.routine',function(id){var r=mobilityRoutine(id);if(!r)return;_ROUTINE=r;openSheet('edit',{form:'routine',title:r.title,desc:'',buf:{}});});
/* ---- after the session ---- */
var _POST=null;
function postSessionSummary(sessId){
  var s=(DB.sessions||[]).filter(function(x){return x.id===sessId;})[0];if(!s)return null;
  var sets=(s.sets||[]),hard=sets.filter(function(x){return x.rir==null||x.rir<=3;}).length;
  var byEx={};sets.forEach(function(x){(byEx[x.exercise]=byEx[x.exercise]||[]).push(x);});
  var muscles={},secondary={},records=[],next=[];
  Object.keys(byEx).forEach(function(name){
    var e=resolveExercise(name);if(e){e.primary.forEach(function(m){muscles[m]=(muscles[m]||0)+byEx[name].length;});(e.secondary||[]).forEach(function(m){secondary[m]=1;});}
    /* A record: the heaviest load, or the best reliable estimated max, beating every earlier session of this exercise. */
    var best=function(list){var b=0,heavy=0;list.forEach(function(x){if(x.load>heavy)heavy=x.load;var r=e1rm(x.load,x.reps);if(r&&r.reliability!=='poor'&&r.value>b)b=r.value;});return {e1:b,heavy:heavy};};
    var now=best(byEx[name]);
    var prior=[];(DB.sessions||[]).forEach(function(o){if(o.id===s.id||o.retracted||o.date>s.date)return;
      (o.sets||[]).forEach(function(x){var ee=resolveExercise(x.exercise);if(ee&&e&&ee.id===e.id)prior.push(x);});});
    if(prior.length&&now.heavy>0){var was=best(prior);
      if(now.heavy>was.heavy)records.push({exercise:name,what:'heaviest weight',value:now.heavy,was:was.heavy});
      else if(now.e1>was.e1*1.005)records.push({exercise:name,what:'best estimated max',value:Math.round(now.e1),was:Math.round(was.e1)});}
    var pf=null;try{pf=progressionFor(name);}catch(err){}
    if(pf&&pf.status==='ok'&&pf.recommendation){var r=pf.recommendation;
      next.push({exercise:name,text:r.change==='hold'?('same as today \u2014 '+r.why):(r.change+(r.by?(' '+r.by+(r.unit?' '+r.unit:'')):'')+' \u2014 '+r.why)});}
    /* Bodyweight work on a ladder: suggest the harder version when every set cleared the target reps. */
    if(e){var L=ladderFor(e.id)[0],target=L?parseInt((L.up.match(/of (\d+)/)||[])[1],10):0;
      if(L&&L.harder&&target&&byEx[name].length>=3&&byEx[name].every(function(x){return x.reps>=target;})){
        var h=EXERCISES.filter(function(y){return y.id===L.harder;})[0];if(h)next.push({exercise:name,text:'ready for the harder version: '+h.name});}}
  });
  var mList=Object.keys(muscles).sort(function(a,b){return muscles[b]-muscles[a];});
  return {session:s,sets:sets.length,hardSets:hard,exercises:Object.keys(byEx).length,muscles:mList,muscleSets:muscles,records:records,next:next,coolDown:coolDownFor(mList,Object.keys(secondary).filter(function(m){return !muscles[m];}))};
}
/* Saving a session opens the existing After-the-session screen, now expanded (see the wrappers at the end of this file). */
function openPostSession(id){_POST={id:id};dispatchAct('move.recover');}
function _rateSession(field,val){var s=(DB.sessions||[]).filter(function(x){return x.id===(_POST&&_POST.id);})[0];if(!s)return;
  var ev=emitEvent('session.rated',{id:s.id,field:field,value:val});s[field]=val;s.updatedAt=(ev&&ev.at)||nowISO();save('session:edit');renderSheet();}
registerAction('post.effort',function(n){_rateSession('effort',Math.max(1,Math.min(10,parseInt(n,10)||0)));});
registerAction('post.feel',function(v){if(['drained','ok','good'].indexOf(v)>=0)_rateSession('feel',v);});

/* ---- surfaces for capabilities that had none (step 21) ---- */
/* Colour controls. Sliders apply live while dragging (input) and save when released (change). */
var _colorsLive=function(){applyPresentationAppearance(DB.settings);};
var _colorsCommit=function(msg){save('settings');applySettings();_memoInvalidate();renderAll();if(_SHEET)renderSheet();if(msg)toast(msg);};
registerAction('colors.theme',function(id){var r=setAppearance('theme',id);if(r.status!=='ok'){toast(r.note||'Not available',{tone:'negative'});return;}
  var co=DB.settings.colorOverrides||{};if(co.preset&&co.preset!=='standard')setStateColorPreset(co.preset);_colorsCommit();});
registerAction('colors.accent',function(id){var r=chooseAccent(id);if(r.status!=='ok'){toast(r.note||'Not available',{tone:'negative'});return;}_colorsCommit();});
registerAction('colors.custom',function(){setAccentHue(DB.settings.accentHue!=null?DB.settings.accentHue:150);_colorsCommit();});
registerAction('colors.hue',function(a,ev,el){if(!el)return;setAccentHue(el.value);_colorsLive();
  if(ev&&ev.type==='change')_colorsCommit();else{clearTimeout(window._hueT);window._hueT=setTimeout(function(){_colorsCommit();},500);}});
registerAction('colors.cb',function(){var on=!colorBlindFriendly();var r=setColorBlindFriendly(on);
  if(r.status!=='ok'){toast(r.note||'Not available on this theme',{tone:'negative'});return;}_colorsCommit(on?'Colour-blind friendly colours on':'Standard colours');});
registerAction('colors.tintHue',function(a,ev,el){if(!el)return;var co=DB.settings.colorOverrides||{};
  setTintFriendly(el.value,co.tintRequested!=null?co.tintRequested:(co.tintStrength||6));_colorsLive();clearTimeout(window._tintT);window._tintT=setTimeout(function(){_colorsCommit();},500);});
registerAction('colors.tintStrength',function(a,ev,el){if(!el)return;var co=DB.settings.colorOverrides||{};
  setTintFriendly(co.tintHue!=null?co.tintHue:210,el.value);_colorsLive();clearTimeout(window._tintT);window._tintT=setTimeout(function(){_colorsCommit();},500);});
registerAction('colors.noTint',function(){var co=Object.assign({},DB.settings.colorOverrides||{});co.tintStrength=0;co.tintRequested=0;DB.settings.colorOverrides=co;_colorsCommit('Background tint removed');});
registerAction('colors.reset',function(){resetColors();DB.settings.accentHue=null;_colorsCommit('Colours reset');});
/* The Text card is now a fold: open it, then scroll to it. */
registerAction('settings.textCard',function(){DB.settings.folds=DB.settings.folds||{};DB.settings.folds['tools-text']=true;if(typeof switchTab==='function')switchTab('tools');setTimeout(function(){var el=document.getElementById('fold-tools-text')||document.getElementById('textCard');if(el&&el.scrollIntoView)el.scrollIntoView({block:'start'});},60);});
registerAction('nav.weightTrend',function(){switchTab('progress');setTimeout(function(){var el=document.querySelector('#view-progress svg.chart');
  if(el&&el.scrollIntoView)el.scrollIntoView({block:'center'});},60);});
registerAction('nav.forecast',function(){openSheet('edit',{form:'forecastFamily',title:'Weight forecast',
  desc:'Three methods, tested from many past starting points at one, two and four weeks. Each horizon uses whichever the evidence supports \u2014 and says when none is sound.',buf:{}});});
registerAction('nav.measurement',function(){openSheet('edit',{form:'measurement',title:'How your scale measures',
  desc:'Every property of each source is measured from your record, or reported as not measurable with the reason.',buf:{}});});
registerAction('nav.recoveryState',function(){openSheet('edit',{form:'recoveryLatent',title:'Recovery',
  desc:'A hidden recovery state, pushed down by training load and sleep debt. Your ratings are readings of it, weighted by how consistent each has been \u2014 not the answer itself.',buf:{}});});
registerAction('nav.internals',function(){openSheet('edit',{form:'internals',title:'System internals',
  desc:'The infrastructure every figure runs through, each with a live check of its behaviour.',buf:{}});});
SHEETS.forecastFamily=function(){var F=forecastFamily(),H=forecastHoldoutValidation();
  if(F.status!=='ok')return {body:uiEmpty('Not enough history',(F.need||[]).join(', '),''),foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};
  var body=FORECAST_HORIZONS.map(function(h){var d=F.forecastDistribution[h]||{},sel=F.selection[h]||{},ho=(H.byHorizon||{})[h]||{};
    return uiRow(h+' days',d.status==='insufficient'?'\u2014':(fmtWeight(d.point)),{sub:(d.status==='insufficient'?esc(sel.reason||''):
      (fmtWeight(d.p10)+' to '+fmtWeight(d.p90)+' (80%) \u00b7 '+esc(sel.reason||'')))+
      '<div class="prov">hold-out: '+esc(ho.verdict||'\u2014')+(ho.note?' \u2014 '+esc(ho.note):'')+'</div>'+(d.warning?'<div class="hint">'+esc(d.warning)+'</div>':''),
      tone:d.reliable===false?'attention':'neutral'});}).join('');
  var P=forecastPromotion();
  if(P.status==='ok')body+='<div class="card-title" style="margin-top:10px">Which forecast is shown</div>'+FORECAST_HORIZONS.map(function(h){var x=P[h]||{};
    return uiRow(h+' days',x.promoted?uiPill('improved','good'):uiPill('current','neutral'),{sub:esc(x.reason||'')});}).join('');
  var tr=forecastTrackRecord('weight_forecast_family');
  body+=uiRow('Track record',tr.n?(tr.covered+' of '+tr.n+' inside'):'none yet',{sub:tr.n?('mean error '+fmtSigned(tr.bias,2)+' lb'):
    'Predictions are recorded from today; each is scored when its date arrives. That record, not the backtest, is what can earn this forecast a validated grade.'});
  body+='<div class="prov">Grade: '+esc(String(H.grade||'').toLowerCase().replace(/_/g,' '))+' \u2014 '+esc(H.note||'')+'</div>';
  return {body:body,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
SHEETS.measurement=function(){var m=measurementModel('weight');
  if(m.status!=='ok')return {body:uiEmpty('Not enough weigh-ins','Measurement properties need at least ten readings.',''),foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};
  var body=m.parameters.map(function(p){return '<div class="card-title" style="margin-top:8px">'+esc(p.source)+(p.reference?' (reference)':'')+'</div>'+
    uiRow('Noise',p.noise!=null?('\u00b1'+fmtNum(p.noise,2)+' lb'):'not measurable',{sub:'day-to-day scatter around its own trend'})+
    uiRow('Bias',p.bias!=null?fmtSigned(p.bias,2)+' lb':'\u2014',{sub:esc(p.biasNote||(p.reference?'':'against '+m.reference))})+
    uiRow('Drift',p.drift?fmtSigned(p.drift.perMonth,2)+' lb/month':'not measurable',{sub:esc(p.driftNote||'')})+
    uiRow('Resolution',p.resolution?(p.resolution.step+' lb'):'\u2014',{sub:'the smallest step it records'})+
    uiRow('Reliability',Math.round(p.reliability.coverage*100)+'% of days',{sub:esc(p.reliability.note)})+
    uiRow('Missingness',Math.round(p.missingness.fraction*100)+'%',{sub:esc(p.missingness.mechanism)})+
    uiRow('Calibration',esc(p.calibration.status.replace(/-/g,' ')),{sub:esc(p.calibration.note||''),tone:p.calibration.status==='uncalibrated'?'attention':'neutral'});}).join('');
  body+='<div class="prov">'+esc(m.caveat)+'</div>';
  return {body:body,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
SHEETS.recoveryLatent=function(){var r=recoveryLatentState();
  if(r.status!=='ok')return {body:uiEmpty('Not enough readings',(r.need||[]).join(', '),''),foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};
  var body=uiRow('Today',esc(r.band),{sub:'score '+fmtSigned(r.score,2)+' ('+fmtSigned(r.lo,2)+' to '+fmtSigned(r.hi,2)+'), 0 is your baseline'})+
    r.forecast.map(function(f){return uiRow(shortDate(f.date),fmtSigned(f.latent,2),{sub:(f.plan?esc(f.plan)+' \u00b7 ':'')+'range '+fmtSigned(f.lo,2)+' to '+fmtSigned(f.hi,2)});}).join('')+
    '<div class="card-title" style="margin-top:8px">Readings it uses</div>'+
    r.observations.map(function(o){return uiRow(esc(o.label),o.kind,{sub:o.n+' readings \u00b7 noise '+fmtNum(o.measurementNoise,2)+' \u2014 '+esc(o.treatedAs)});}).join('')+
    '<div class="hint">Training load: '+esc(r.stressorState.loadBasis)+' \u2014 '+esc(r.stressorState.loadNote)+'.</div>'+
    '<div class="prov">'+esc(r.forecastBasis)+'. '+esc(r.caveat)+'</div>';
  var legacy=readinessState();
  if(legacy&&legacy.status==='ok')body+='<div class="prov">The older readiness summary, an average of the same ratings, reads '+esc(String(legacy.score!=null?legacy.score:legacy.label||''))+' \u2014 kept as a summary of the readings, not as the state.</div>';
  return {body:body,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
SHEETS.internals=function(){
  var ids=['inferenceGateway','provenance','runIdentity','materialization','quantityRegistry'];
  /* opening this sheet asks for the checks: they run once, as a recorded verification run, and the rows read its entries */
  var vr=runVerification({only:ids});
  var rows=ids.map(function(id){
    var st=capabilityStatus(id),e=st.evidence||{};
    return uiRow(esc(id),e.verification==='passes'?uiPill('verified','good'):uiPill(e.verification==='not run'?'not run':'check fails',e.verification==='not run'?'neutral':'negative'),{sub:'live check of its behaviour, run when this opened ('+vr.durationMs+' ms)'});}).join('');
  var ra=modelRegistryAudit();
  rows+=uiRow('Registered models',ra.executable+' of '+MODELS.length+' executable',{sub:'every model resolves through the gateway with version, provenance and uncertainty'});
  var t=infer({modelId:'weight_trend'});
  if(t.status==='ok')rows+=uiRow('Example run','weight_trend',{sub:'run '+esc(String(t.runId))+' \u00b7 '+(t.provenance.nodes.length)+' provenance nodes \u00b7 as of '+esc(t.asOf)});
  return {body:rows,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
registerAction('nav.exports',function(){openSheet('edit',{form:'exports',title:'Export and import',
  desc:'Every export carries its kind and version. An import passes parse, schema, version and content checks before anything is applied, and is refused at the first check it fails.',buf:{}});});
registerAction('exp.download',function(arg){
  var p=String(arg||'').split('|'),r=exportArtifact(p[0],p[1]);
  if(r.status!=='ok'){toast('Nothing to export: '+r.status,{tone:'negative'});return;}
  var mime={json:'application/json',csv:'text/csv',md:'text/markdown'}[r.format]||'text/plain';
  downloadText('physique-'+p[0]+'-'+todayISO()+'.'+r.format,r.text,mime);});
registerAction('exp.import',function(){
  var ta=document.getElementById('expImport');
  var r=importArtifact(ta?ta.value:'');
  if(r.status!=='ok'){toast('Refused at the '+r.stage+' check: '+(r.errors?r.errors[0]:r.note),{tone:'negative'});return;}
  save('import');applySettings();_memoInvalidate();renderAll();renderSheet();
  toast('Imported '+r.kind+(r.migrated&&r.migrated.length?(' (migrated '+r.migrated.join(', ')+')'):''));});
registerAction('viz.svg',function(){
  var r=visualizationSVG({modelId:_VIZ.modelId,chartType:_VIZ.chartType,title:_VIZ.modelId});
  if(r.status!=='ok'){toast(r.note||'Cannot export this chart',{tone:'negative'});return;}
  downloadText('physique-'+_VIZ.modelId+'-'+_VIZ.chartType+'.svg',r.svg,'image/svg+xml');});
registerAction('viz.png',function(){
  visualizationPNG({modelId:_VIZ.modelId,chartType:_VIZ.chartType,title:_VIZ.modelId}).then(function(r){
    if(r.status!=='ok'){toast(r.note||'PNG export is not available here',{tone:'negative'});return;}
    var a=document.createElement('a');a.href=r.png;a.download='physique-'+_VIZ.modelId+'-'+_VIZ.chartType+'.png';
    document.body.appendChild(a);a.click();document.body.removeChild(a);});});
registerAction('nav.vizstudio',function(){openSheet('edit',{form:'vizstudio',title:'Visualization Studio',
  desc:'Every chart goes model \u2192 presentation \u2192 spec \u2192 validation \u2192 renderer. A type that cannot be drawn says so rather than drawing something wrong.',buf:{}});});
registerAction('viz.model',function(arg,ev,el){_VIZ.modelId=el?el.value:arg;
  var fit=chartTypesFor(_VIZ.modelId);if(fit.indexOf(_VIZ.chartType)<0)_VIZ.chartType=fit[0]||'line';renderSheet();});
registerAction('viz.type',function(arg){_VIZ.chartType=arg;renderSheet();});
registerAction('viz.save',function(){
  var r=saveChartAsWidget({modelId:_VIZ.modelId,chartType:_VIZ.chartType,
    title:((modelContract(_VIZ.modelId)||{}).name||_VIZ.modelId)});
  if(r.status==='ok'){save('settings');toast('Saved as a dashboard widget');}
  else toast(r.note||'Not saved',{tone:r.status==='exists'?'':'negative'});});
var _DASH={editing:false,draft:null,msg:null};
function _dashSpec(){return _DASH.draft||currentDashboard();}
registerAction('nav.dashboard',function(){_DASH={editing:false,draft:null,msg:null};
  openSheet('edit',{form:'dashboard',title:'Dashboard',
    desc:'Your dashboard is a specification: every widget reads a registered model, and every edit is validated before it is kept.',buf:{}});});
registerAction('dash.edit',function(){_DASH.editing=!_DASH.editing;if(_DASH.editing&&!_DASH.draft)_DASH.draft=currentDashboard();renderSheet();});
registerAction('dash.op',function(arg){
  var p=String(arg||'').split('|');
  var op={type:p[0],widgetId:p[1]||undefined};
  if(p[0]==='resizeWidget')op.size=p[2];
  if(p[0]==='moveWidget'){op.toSection=p[2];op.toIndex=+p[3];}
  if(p[0]==='addWidget')op.sectionId=p[2];
  var r=applyDashboardOperation(_dashSpec(),op);
  if(r.status!=='ok'){_DASH.msg=r.note||(r.errors&&r.errors[0])||'Not allowed';toast(_DASH.msg,{tone:'negative'});renderSheet();return;}
  _DASH.draft=r.spec;_DASH.msg=null;renderSheet();});
registerAction('dash.save',function(){
  var r=commitDashboard(_dashSpec());
  if(r.status!=='ok'){toast((r.errors&&r.errors[0])||'Not saved',{tone:'negative'});return;}
  save('settings');_DASH.draft=null;_DASH.editing=false;renderSheet();toast('Dashboard saved as "'+r.id+'"');});
registerAction('dash.discard',function(){_DASH.draft=null;_DASH.editing=false;renderSheet();});
registerAction('dash.use',function(arg){DB.settings.dashboardId=arg;save('settings');_DASH.draft=null;renderSheet();});
registerAction('dash.duplicate',function(arg){var r=duplicateDashboard(arg);
  if(r.status==='ok'){save('settings');renderSheet();toast('Copied as "'+r.id+'"');}else toast(r.note||'Not copied',{tone:'negative'});});
registerAction('dash.delete',function(arg){
  confirmDialog({title:'Delete "'+arg+'"?',msg:'Built-in dashboards are unaffected.',ok:'Delete'}).then(function(y){
    if(!y)return;var r=deleteDashboard(arg);if(r.status!=='ok')toast(r.note||'Not deleted',{tone:'negative'});
    save('settings');renderSheet();});});
registerAction('nav.studio',function(){openSheet('edit',{form:'studio',title:'Presentation Studio',
  desc:'Appearance as a specification: every change is validated against the same registries the app uses, and nothing is applied that fails contrast.',buf:{}});});
var _colorApplied=function(r,ok){if(r.status!=='ok'){toast(r.note||'Not applied',{tone:'negative'});return;}
  save('settings');applySettings();_memoInvalidate();renderAll();renderSheet();toast(ok);};
registerAction('studio.colorPreset',function(id){_colorApplied(setStateColorPreset(id),'State colours: '+(STATE_COLOR_PRESETS[id]||{}).label);});
registerAction('studio.stateColors',function(){
  var r={status:'ok'};['good','attention','negative'].some(function(k){var el=document.getElementById('stateColor-'+k);if(!el)return false;
    r=setStateColor(k,el.value);return r.status!=='ok';});
  _colorApplied(r,'State colours applied');});
registerAction('studio.tint',function(){var h=document.getElementById('tintHue'),st=document.getElementById('tintStrength');
  _colorApplied(setSurfaceTint(h?h.value:210,st?st.value:0),'Background tint applied');});
registerAction('studio.resetColors',function(){_colorApplied(resetColors(),'Colours reset');});
registerAction('studio.customAccent',function(arg,ev,el){
  var inp=document.getElementById('studioHex');
  var r=setCustomAccent(inp?inp.value:arg);
  if(r.status!=='ok'){toast(r.note,{tone:'negative'});return;}
  save('settings');applySettings();renderSheet();toast('Custom accent applied');});
registerAction('studio.clearAccent',function(){clearCustomAccent();save('settings');applySettings();renderSheet();});
registerAction('studio.save',function(){
  var inp=document.getElementById('studioName');
  var r=saveAppearanceProfile(inp?inp.value:'');
  if(r.status!=='ok'){toast(r.note||'Not saved',{tone:'negative'});return;}
  save('settings');renderSheet();toast('Saved as "'+r.name+'"');});
registerAction('studio.load',function(arg){
  var r=loadAppearanceProfile(arg);
  if(r.status!=='ok'){toast(r.note||'Could not load',{tone:'negative'});return;}
  save('settings');applySettings();_memoInvalidate();renderAll();renderSheet();});
registerAction('studio.duplicate',function(arg){var r=duplicateAppearanceProfile(arg);
  if(r.status==='ok'){save('settings');renderSheet();}else toast(r.note||'Not duplicated',{tone:'negative'});});
registerAction('studio.delete',function(arg){
  confirmDialog({title:'Delete "'+arg+'"?',msg:'Built-in profiles are unaffected.',ok:'Delete'}).then(function(y){
    if(y){deleteAppearanceProfile(arg);save('settings');renderSheet();}});});
registerAction('studio.reset',function(){resetAppearance();save('settings');applySettings();_memoInvalidate();renderAll();renderSheet();
  toast('Reset to the standard profile',{undo:true});});
registerAction('studio.export',function(){var ex=exportAppearanceSpec();
  try{navigator.clipboard.writeText(ex.text);toast('Specification copied');}catch(e){toast('Copy failed \u2014 select the text instead',{tone:'negative'});}});
registerAction('studio.import',function(){
  var ta=document.getElementById('studioImport');
  var r=importAppearanceSpec(ta?ta.value:'');
  if(r.status!=='ok'){toast('Rejected at '+r.stage+': '+(r.errors?r.errors[0]:r.note),{tone:'negative'});return;}
  save('settings');applySettings();_memoInvalidate();renderAll();renderSheet();toast('Imported');});
registerAction('settings.profile',function(arg){
  var r=applyAppearanceProfile(arg);
  if(!r)return;
  if(r.status==='refused'){toast(r.note,{tone:'negative'});return;}
  save('settings');applySettings();_memoInvalidate();renderAll();
  toast(APPEARANCE_PROFILES[arg].label+' applied',{undo:true});
});
registerAction('settings.showModels',function(arg){DB.settings.showModels=(arg==='on');save('settings');applySettings();renderAll();});
/* ---- demo ---- */
registerAction('demo.load',function(){return confirmDialog({title:'Load the demo record?',msg:DB.observations.length&&!(DB.demo&&DB.demo.active)?'You have real data. Loading the demo <b>replaces the current record</b>. A backup is written to IndexedDB first, and Undo restores the previous record.':'Ten weeks of generated data will be loaded and marked as demo.',okLabel:'Load demo'}).then(function(ok){if(!ok)return;pushUndo('load demo');writeAutoBackup();loadDemo();applySettings();_memoInvalidate();switchTab('today');toast('Demo loaded',{undo:true});});});
registerAction('demo.reset',function(){var demo=DB.demo&&DB.demo.active;return confirmDialog({title:demo?'Clear the demo record?':'Erase everything?',msg:demo?'The record becomes empty. Undo restores it.':'All observations, sessions, food logs, phases, experiments and predictions are removed from this device. A backup is written to IndexedDB first. Export a JSON backup before doing this if you want to keep anything.',okLabel:demo?'Clear':'Erase',danger:!demo}).then(function(ok){if(!ok)return;pushUndo('reset');writeAutoBackup();DB=emptyDB();DB.settings.onboarded=true;save('reset');_memoInvalidate();applySettings();switchTab('today');toast('Record cleared',{undo:true});});});
/* ---- data: backup, restore, exports ---- */
function downloadText(name,text,mime){try{var blob=new Blob([text],{type:mime||'application/octet-stream'});var url=URL.createObjectURL(blob);var a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();setTimeout(function(){document.body.removeChild(a);URL.revokeObjectURL(url);},500);return true;}catch(e){_q(e);return false;}}
/* WHAT A BACKUP HOLDS OF THE VISUAL HISTORY (catalogue W-004). Progress photos are kept on this device only, by design:
   the record holds each photo's date and pose, and the images stay in the browser database, so an exported backup never
   carries a photo. The backup says so in its own header, and the Data card says so before one is made, so nobody takes
   a backup for a complete visual history. */
function backupPhotoStatement(){var n=((DB.settings&&DB.settings.photos)||[]).filter(function(p){return p&&!p.removedAt;}).length;
  return {count:n,imagesIncluded:false,completeVisualHistory:n===0,
    statement:n?('This backup holds the dates and poses of '+n+' progress photo'+(n===1?'':'s')+', not the images: the images stay on this device only.'):'There are no progress photos, so nothing visual is left out.'};}
function backupJSON(){var counts={observations:DB.observations.length,sessions:DB.sessions.length,foodLogs:DB.foodLogs.length,phases:DB.phases.length,predictions:DB.predictions.length,experiments:DB.experiments.length};var obj=Object.assign({},DB,{backup:{exportedAt:nowISO(),app:APP_NAME,appVersion:APP_VERSION,schemaVersion:SCHEMA_VERSION,build:BUILD_ID,counts:counts,photos:backupPhotoStatement()}});return JSON.stringify(obj,null,1);}
registerAction('data.backup',function(){var s=backupJSON();if(downloadText('physique-os-backup-'+todayISO()+'.json',s,'application/json')){DB.settings.lastBackupAt=nowISO();save('backup');renderAll();toast('Backup exported \u00b7 '+fmtNum(s.length/1024,0)+' KB');}});
registerAction('data.restore',function(){var f=document.getElementById('restoreFile');if(f){f.value='';f.click();}else toast('Open Tools \u2192 Data to restore');});
/* What a file IS is decided by reading it, not by which button opened the picker. Marking the input with a
   data attribute and hoping the handler checked it meant a sync envelope and an encrypted backup were both
   validated as plain databases and rejected — the two import paths simply did not work. Content detection
   also means a file dropped in from anywhere is handled correctly. */
registerAction('data.restoreFile',function(arg,ev,el){var file=el.files&&el.files[0];if(!file)return;var reader=new FileReader();reader.onload=function(){var text=reader.result;var obj;try{obj=JSON.parse(text);}catch(e){toast('Not valid JSON',{tone:'negative'});return;}
  if(obj&&obj.format==='physique-os-sync'){
    var r=mergeEnvelope(obj);
    toast(r.ok?(r.added?('Merged '+r.added+' change'+(r.added===1?'':'s')+(r.conflicts.length?(' \u00b7 '+r.conflicts.length+' concurrent edit(s) to review'):'')):'Already up to date'):('Could not merge: '+r.reason),
      {tone:r.ok?'good':'negative',ms:8000,undo:r.ok&&r.added>0});
    if(r.ok&&r.added){_memoInvalidate();renderAll();}
    el.value='';return;
  }
  if(obj&&obj.format==='physique-os-encrypted-backup'){
    promptDialog({title:'Encrypted backup',label:'Passphrase \u2014 there is no way to recover it',value:''})
      .then(function(pass){
        if(!pass){el.value='';return;}
        decryptBackup(obj,pass).then(function(plain){
          /* Once decrypted it goes through exactly the same preview as a plaintext backup: same validation,
             same counts, same merge-or-replace choice. An encrypted file gets no shortcut. */
          var v2=validateDB(plain);
          openSheet('edit',{form:'restore',title:'Restore from an encrypted backup',desc:'',
            buf:{fileName:file.name+' (decrypted)',obj:plain,mode:'merge',
              preview:{schemaVersion:plain.schemaVersion,appVersion:plain.appVersion,createdAt:plain.createdAt,
                valid:v2.ok,errors:v2.errors||[],
                counts:{observations:(plain.observations||[]).length,sessions:(plain.sessions||[]).length,
                  foodLogs:(plain.foodLogs||[]).length,phases:(plain.phases||[]).length,
                  predictions:(plain.predictions||[]).length,experiments:(plain.experiments||[]).length}}}});
        }).catch(function(e){toast(String(e&&e.message||e),{tone:'negative',ms:9000});el.value='';});
      });
    return;
  }
  var v=validateDB(obj);var preview={schemaVersion:obj.schemaVersion,appVersion:obj.appVersion,createdAt:obj.createdAt,valid:v.ok,errors:v.errors||[],counts:{observations:(obj.observations||[]).length,sessions:(obj.sessions||[]).length,foodLogs:(obj.foodLogs||[]).length,phases:(obj.phases||[]).length,predictions:(obj.predictions||[]).length,experiments:(obj.experiments||[]).length}};openSheet('edit',{form:'restore',title:'Restore from backup',desc:'',buf:{fileName:file.name,preview:preview,obj:obj,mode:'merge'}});};reader.readAsText(file);});
registerAction('data.restoreApply',function(){var b=_SHEET.buf;var obj=b.obj;var mode=b.mode||'merge';var m=migrate(JSON.parse(JSON.stringify(obj)));if(!m.ok){toast('Cannot restore: '+esc(m.reason),{tone:'negative'});return;}pushUndo('restore');writeAutoBackup();var incoming=m.db;var added=0;
  if(mode==='replace'){incoming.instance=DB.instance;DB=incoming;added=DB.observations.length;}
  else{added=mergeRecordCollections(incoming).added;if(!DB.profile.age&&incoming.profile)DB.profile=incoming.profile;}
  DB.ledger.migrations=(DB.ledger.migrations||[]).concat((m.applied||[]).map(function(x){return {at:nowISO(),step:'restore: '+x};}));
  try{resetEventLog('record restored from a backup');}catch(e){_q(e,'P1');}
  save('restore');_memoInvalidate();closeSheet();applySettings();renderAll();toast((mode==='replace'?'Record replaced':'Merged '+added+' records'),{undo:true});});
function csvEscape(v){if(v==null)return '';var s=String(v);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
/* toCSV moved to 65-import.js (engine layer) */
/* exportCSV moved to 65-import.js (engine layer) */
registerAction('data.csv',function(kind){var csv=exportCSV(kind);if(downloadText('physique-'+kind+'-'+todayISO()+'.csv',csv,'text/csv'))toast('Exported '+kind+' CSV');});
function stateReport(){var S=getCurrentState();var dec=decide();var L=learningSummary();var lines=[];var add=function(s){lines.push(s);};
  add(APP_NAME+' \u2014 state report \u00b7 '+longDate(todayISO())+' \u00b7 rules v'+DECISION_RULES_VERSION);add('');
  add('PHASE: '+(S.phase?phaseLabel(S.phase)+' week '+S.phaseWeek+' (since '+S.phase.startDate+')':'none'));
  add('WEIGHT: last '+fmtWeight(S.weight.value)+' ('+(S.weight.date||'\u2014')+') \u00b7 7-day avg '+fmtWeight(S.averages.avg7)+' \u00b7 trend '+(S.trend.status==='ok'?fmtRate(S.trend.slopePerWeek)+' ['+S.trend.confidence+']':'insufficient'));
  add('TDEE: '+(S.tdee.status==='ok'?fmtKcal(S.tdee.value,{estimate:true})+' ('+fmtKcal(S.tdee.lo,{estimate:true,bare:true})+'\u2013'+fmtKcal(S.tdee.hi,{estimate:true,bare:true})+') ['+S.tdee.cls+', '+S.tdee.confidence+']':'unknown'));
  add('INTAKE: 7-day avg '+(S.nutrition.avg7!=null?fmtKcal(S.nutrition.avg7):'\u2014')+' \u00b7 protein '+(S.nutrition.protein7!=null?fmtG(S.nutrition.protein7,0):'\u2014')+' \u00b7 logging '+S.adherence.logging.pct+'%');
  add('ACTIVITY: steps 7-day '+(S.steps.mean7!=null?fmtNum(S.steps.mean7,0):'\u2014')+' \u00b7 training '+S.training.sessions14+' sessions/14d \u00b7 strength '+(S.training.strength.status==='ok'?S.training.strength.overall:'insufficient'));
  add('RECOVERY: '+S.recovery.level+' \u00b7 APPETITE: '+S.appetite.level+' \u00b7 DATA TRUST: '+S.trust.overall.level+' ('+S.trust.overall.pct+'%)');
  add('BODY COMP: '+(S.bodyComp.measured?fmtPct(S.bodyComp.measured.value,1)+' by '+S.bodyComp.measured.method:(S.bodyComp.estimate&&S.bodyComp.estimate.status==='ok'?fmtPct(S.bodyComp.estimate.lo,0)+'\u2013'+fmtPct(S.bodyComp.estimate.hi,0)+' (circumference estimate)':'no estimate'))+' \u00b7 muscle-retention risk '+S.muscleRisk.level);
  add('');add('DECISION: '+dec.verb+' ['+dec.confidence+']');add('  '+dec.lede);(dec.why||[]).forEach(function(w){add('  why: '+w);});(dec.action||[]).forEach(function(a){add('  do: '+a.text);});(dec.reverseIf||[]).forEach(function(r){add('  reverse if: '+r);});
  add('');add('WHAT WE KNOW');L.know.forEach(function(k){add('  - '+k.text+' ['+k.prov+']');});add('WHAT WE THINK');L.think.forEach(function(k){add('  - '+k.text+' ['+k.prov+']');});add('WHAT WE DON\u2019T KNOW');L.unknown.forEach(function(k){add('  - '+k.text+(k.need?' (needs '+k.need.join(', ')+')':''));});add('WHAT FAILED');L.failed.forEach(function(k){add('  - '+k.text);});add('WHAT WORKED');L.worked.forEach(function(k){add('  - '+k.text);});
  add('');add('Generated by '+APP_NAME+' '+APP_VERSION+' \u00b7 not medical advice');
  var body=lines.join('\n');
  /* Existing state-report export remains authoritative; presentation export supplies only the
     presentation contract/metadata, avoiding a second report pipeline. */
  if(typeof exportPresentationSpec==='function'){
    var _reportSpec=exportPresentationSpec({page:'state-report',sections:[{title:'State report',body:body}],source:{app:APP_NAME,version:APP_VERSION,build:BUILD_ID},uncertainty:{included:true}},'print');
    if(_reportSpec&&_reportSpec.status==='ok')return body+'\n\nPRESENTATION EXPORT\nformat: '+_reportSpec.format+'\nrenderer: '+_reportSpec.dedicatedRenderer+'\nsource: '+JSON.stringify(_reportSpec.source);
  }
  return body;
}
registerAction('data.report',function(){if(downloadText('physique-state-'+todayISO()+'.txt',stateReport(),'text/plain'))toast('State report exported');});
function icsExport(){var lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Physique OS//EN'];var stamp=nowISO().replace(/[-:]/g,'').slice(0,15)+'Z';upcoming().forEach(function(u,i){var d=u.date.replace(/-/g,'');lines.push('BEGIN:VEVENT','UID:physique-'+d+'-'+i+'@local','DTSTAMP:'+stamp,'DTSTART;VALUE=DATE:'+d,'SUMMARY:'+u.label.replace(/[,;]/g,' '),'END:VEVENT');});lines.push('END:VCALENDAR');return lines.join('\r\n');}
registerAction('data.ics',function(){if(downloadText('physique-schedule.ics',icsExport(),'text/calendar'))toast('Calendar exported');});
function diagnosticsJSON(){return JSON.stringify({app:APP_NAME,version:APP_VERSION,schema:SCHEMA_VERSION,build:BUILD_ID,at:nowISO(),ua:typeof navigator!=='undefined'?navigator.userAgent:'',storage:idbStatus(),saves:DB.ledger,counts:{observations:DB.observations.length,sessions:DB.sessions.length,foodLogs:DB.foodLogs.length,predictions:DB.predictions.length,experiments:DB.experiments.length},errors:getSwallowedErrors(),anomalies:detectAnomalies().map(function(a){return a.kind+': '+a.detail;}),sw:typeof _SW_STATE!=='undefined'?_SW_STATE:null,settings:DB.settings,demo:DB.demo},null,1);}
registerAction('data.diagnostics',function(){var j=diagnosticsJSON();var copied=false;try{if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(j);copied=true;}}catch(e){}downloadText('physique-diagnostics-'+todayISO()+'.json',j,'application/json');toast(copied?'Diagnostics copied and downloaded':'Diagnostics downloaded');});
/* ---- PWA ---- */
var _SW_STATE='not registered',_SW_UPDATE=null,_SW_REG=null,_STORAGE_EST=null;
function registerServiceWorker(){if(!('serviceWorker' in navigator)){_SW_STATE='unsupported';return;}if(location.protocol==='file:'){_SW_STATE='file:// (service workers need http or https)';return;}try{navigator.serviceWorker.register('./sw.js').then(function(reg){_SW_REG=reg;_SW_STATE=reg.active?'active':'installing';reg.addEventListener('updatefound',function(){var nw=reg.installing;if(!nw)return;nw.addEventListener('statechange',function(){if(nw.state==='installed'&&navigator.serviceWorker.controller){_SW_UPDATE=nw;_SW_STATE='update ready';renderAll();}});});}).catch(function(e){_SW_STATE='failed: '+(e&&e.message||e);_q(e);});navigator.serviceWorker.addEventListener('controllerchange',function(){if(_SW_APPLYING){location.reload();}});}catch(e){_SW_STATE='error';_q(e);}}
var _SW_APPLYING=false;
/* UPDATES APPLY THEMSELVES (usage review: a phone kept running an old build \u2014 old Tools, no undo, a cached 404 \u2014 because
   the update waited behind a dismissible notice). An update found within 15 s of launch is applied at once and the app
   reloads once; later in a session a banner on Today offers it; returning to the app checks for one. */
var _SW_LAUNCH=Date.now(),_SW_RELOADED=false;
/* Only an UPDATE reloads: controllerchange also fires when a first-ever service worker claims the page, and reloading
   then interrupted a first visit on a slow phone (mid-setup). A page that started with no controller is not reloaded. */
var _SW_HAD_CONTROLLER=typeof navigator!=='undefined'&&!!(navigator.serviceWorker&&navigator.serviceWorker.controller);
if(typeof navigator!=='undefined'&&navigator.serviceWorker){navigator.serviceWorker.addEventListener('controllerchange',function(){if(!_SW_HAD_CONTROLLER){_SW_HAD_CONTROLLER=true;return;}if(_SW_RELOADED)return;_SW_RELOADED=true;try{window.location.reload();}catch(e){}});
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible'&&_SW_REG&&_SW_REG.update)try{_SW_REG.update();}catch(e){}});
  setInterval(function(){if(_SW_UPDATE&&!_SW_APPLYING&&Date.now()-_SW_LAUNCH<15000&&!(typeof _SHEET!=='undefined'&&_SHEET)){_SW_APPLYING=true;try{_SW_UPDATE.postMessage({type:'SKIP_WAITING'});}catch(e){}}},1000);}
registerAction('pwa.update',function(){if(!_SW_UPDATE)return;_SW_APPLYING=true;try{_SW_UPDATE.postMessage({type:'SKIP_WAITING'});}catch(e){_q(e);}toast('Applying update\u2026');});
registerAction('pwa.later',function(){_SW_UPDATE=null;renderAll();});
registerAction('pwa.reload',function(){location.reload();});
/* ---- command palette + global search ---- */
var COMMANDS=[
  {id:'log.weight',label:'Log weight',hint:'L',run:function(){openLog('weight');}},{id:'log.food',label:'Log calories / protein',run:function(){openLog('food');}},{id:'log.steps',label:'Log steps',run:function(){openLog('steps');}},{id:'log.cardio',label:'Log cardio',run:function(){openLog('cardio');}},{id:'log.sleep',label:'Log sleep',run:function(){openLog('sleep');}},{id:'log.recovery',label:'Log recovery (fatigue, soreness, stress)',run:function(){openLog('recovery');}},{id:'log.hunger',label:'Log appetite',run:function(){openLog('hunger');}},{id:'log.waist',label:'Log waist / measurements',run:function(){openLog('waist');}},{id:'log.context',label:'Log context (travel, illness, new scale\u2026)',run:function(){openLog('context');}},{id:'log.session',label:'Log training session',run:function(){openSession(null);}},{id:'food.add',label:'Add food to today',run:function(){openFoodAdd(todayISO());}},
  {id:'nav.today',label:'Go to Today',hint:'1',run:function(){switchTab('today');}},{id:'nav.log',label:'Go to Log',hint:'2',run:function(){switchTab('log');}},{id:'nav.plan',label:'Go to Plan',hint:'3',run:function(){switchTab('plan');}},{id:'nav.train',label:'Go to Train',hint:'4',run:function(){switchTab('train');}},{id:'nav.food',label:'Go to Food',hint:'5',run:function(){switchTab('food');}},{id:'nav.body',label:'Go to Body',hint:'6',run:function(){switchTab('body');}},{id:'nav.progress',label:'Go to Progress',hint:'7',run:function(){switchTab('progress');}},{id:'nav.diagnose',label:'Go to Diagnose',hint:'8',run:function(){switchTab('diagnose');}},{id:'nav.experiments',label:'Go to Experiments',hint:'9',run:function(){switchTab('experiments');}},{id:'nav.learn',label:'Go to Learn',run:function(){switchTab('learn');}},{id:'nav.archive',label:'Go to Archive / Replay',run:function(){switchTab('archive');}},{id:'nav.tools',label:'Go to Tools',run:function(){switchTab('tools');}},
  {id:'decision.apply',label:'Apply today\u2019s decision as an experiment',run:function(){dispatchAct('decision.apply');}},{id:'decision.user',label:'Record my own decision',run:function(){dispatchAct('decision.user');}},{id:'exp.new',label:'New experiment',run:function(){openExperiment();}},{id:'neg.new',label:'Record negative knowledge',run:function(){dispatchAct('neg.new');}},{id:'pred.score',label:'Score due predictions',run:function(){dispatchAct('pred.score');}},
  {id:'phase.start',label:'Start a phase',run:function(){openPhase(null,'cut');}},{id:'phase.edit',label:'Edit phase targets',run:function(){var p=activePhase();if(p)openPhase(p.id);else openPhase(null,'cut');}},{id:'phase.end',label:'End the current phase',run:function(){var p=activePhase();if(p)dispatchAct('phase.end',p.id);else toast('No active phase');}},{id:'profile.edit',label:'Edit profile',run:function(){openProfile();}},
  {id:'data.backup',label:'Export backup (JSON)',run:function(){dispatchAct('data.backup');}},{id:'data.restore',label:'Restore from backup',run:function(){switchTab('tools');setTimeout(function(){dispatchAct('data.restore');},100);}},{id:'data.report',label:'Export state report',run:function(){dispatchAct('data.report');}},{id:'data.csv.weight',label:'Export weight CSV',run:function(){dispatchAct('data.csv','weight');}},{id:'undo',label:'Undo last change',hint:'\u2318Z',run:function(){dispatchAct('undo.last');}},
  {id:'settings.units.metric',label:'Units: metric',run:function(){dispatchAct('settings.units','metric');}},{id:'settings.units.imperial',label:'Units: imperial',run:function(){dispatchAct('settings.units','imperial');}},{id:'settings.textScale.L',label:'Text size: large',run:function(){dispatchAct('settings.textScale','L');}},{id:'settings.textScale.M',label:'Text size: medium',run:function(){dispatchAct('settings.textScale','M');}},
  {id:'demo.load',label:'Load demo record',run:function(){dispatchAct('demo.load');}},{id:'selftest.run',label:'Run self-test',run:function(){switchTab('tools');setTimeout(function(){dispatchAct('selftest.run');},50);}},{id:'replay',label:'Replay a past day',run:function(){switchTab('archive');}}
];
var _CMDK_SEL=0,_CMDK_ITEMS=[];
function globalSearch(q){var out=[];var ql=q.toLowerCase();var toks=foodTokens(q);
  foodSearchLocal(q,5).forEach(function(f){out.push({label:'Food: '+f.name,hint:f.source,run:function(){openFoodAdd(todayISO(),f);}});});
  EXERCISES.filter(function(e){return e.name.toLowerCase().indexOf(ql)>=0||e.aliases.some(function(a){return a.indexOf(ql)>=0;});}).slice(0,3).forEach(function(e){out.push({label:'Exercise: '+e.name,hint:e.pattern,run:function(){switchTab('train');}});});
  DB.decisions.filter(function(d){return (d.verb+' '+(d.lede||'')).toLowerCase().indexOf(ql)>=0;}).slice(-3).forEach(function(d){out.push({label:'Decision '+shortDate(d.date)+': '+d.verb,hint:d.source,run:function(){switchTab('experiments');}});});
  DB.experiments.filter(function(e){return (e.question+' '+e.intervention).toLowerCase().indexOf(ql)>=0;}).slice(0,3).forEach(function(e){out.push({label:'Experiment: '+(e.intervention||e.variable),hint:e.status,run:function(){switchTab('experiments');}});});
  getNegativeKnowledge().filter(function(n){return (n.intervention+' '+n.observed).toLowerCase().indexOf(ql)>=0;}).slice(0,3).forEach(function(n){out.push({label:'Did not work: '+n.intervention,hint:shortDate(n.date),run:function(){switchTab('experiments');}});});
  MODELS.filter(function(m){return m.name.toLowerCase().indexOf(ql)>=0;}).slice(0,3).forEach(function(m){out.push({label:'Model: '+m.name,hint:m.cls,run:function(){switchTab('learn');}});});
  Object.keys(OBS_TYPES).filter(function(t){return OBS_TYPES[t].label.toLowerCase().indexOf(ql)>=0;}).slice(0,3).forEach(function(t){var l=latestObs(t);out.push({label:'Observation: '+OBS_TYPES[t].label+(l?' \u2014 last '+fmtNum(l.value,1)+' '+ageLabel(l.date):''),hint:'log',run:function(){openLog(t==='calories'||t==='protein'?'food':(/waist|neck|hip/.test(t)?'waist':t));}});});
  if(/^\d{4}-\d{2}-\d{2}$/.test(q))out.push({label:'Replay '+longDate(q),hint:'archive',run:function(){_REPLAY_DATE=q;_REPLAY=replayAt(q);switchTab('archive');}});
  return out;}
function openCmdk(){_lastFocus=document.activeElement;document.getElementById('cmdkBackdrop').classList.add('show');var i=document.getElementById('cmdkInput');i.value='';_CMDK_SEL=0;renderCmdk('');setTimeout(function(){i.focus();},30);}
function closeCmdk(){document.getElementById('cmdkBackdrop').classList.remove('show');if(_lastFocus&&_lastFocus.focus)try{_lastFocus.focus();}catch(e){}}
/* The palette is the universal action layer: it lists the same commands the interface exposes, plus the
   navigation and day-jump commands, plus search results across every domain. Nothing lives here that has no
   visible equivalent, and nothing visible is missing from here. */
function cmdkCommands(){
  var list=COMMANDS.slice();
  DAY_JUMPS().forEach(function(j){list.push({id:j.id,label:j.label,hint:j.key||'',group:'Navigation',run:j.run});});
  NAV_COMMANDS.forEach(function(c){
    var km=KEYMAP.filter(function(k){return k.label.toLowerCase()===c.label.toLowerCase();})[0];
    list.push({id:c.id,label:c.label,hint:km?km.keys:'',group:'Navigation',run:function(){dispatchAct(c.id);}});
  });
  return list;
}
/* The panels on the current view, as jump targets. nav.section was registered and counted as surfaced, but nothing —
   no control, no palette entry — ever dispatched it, so no one could reach it. On a long page (Tools shows 25 panels at
   the Developer level) a jump list is genuinely useful, so the palette now offers the panels whose title matches what
   is typed. A panel with no id is given a stable one from its title. */
function sectionsOnThisView(){
  if(typeof document==='undefined')return [];var v=document.getElementById('view-'+_TAB);if(!v)return [];
  var seen={};
  return [].slice.call(v.querySelectorAll('.card, details.fold')).filter(function(e){return !e.parentElement.closest('.card, details.fold')&&e.getClientRects().length;})
    .map(function(e){var t=(typeof panelTitle==='function')?panelTitle(e):(e.textContent||'').trim().slice(0,40);if(!t)return null;
      if(!e.id){var slug='sec-'+_TAB+'-'+t.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40);var k=slug,n=2;while(document.getElementById(k))k=slug+'-'+(n++);e.id=k;}
      if(seen[e.id])return null;seen[e.id]=1;return {id:e.id,title:t};}).filter(Boolean);
}
function renderCmdk(q){
  var ql=q.trim().toLowerCase();
  var cmds=cmdkCommands();
  if(ql)sectionsOnThisView().forEach(function(sec){
    cmds.push({id:'nav.section@'+sec.id,label:'Go to: '+sec.title,run:function(){dispatchAct('nav.section',sec.id);}});});
  var meta={};commandRegister().forEach(function(c){meta[c.id]=c;});
  /* The palette shows only what the chosen detail level includes. */
  /* A pinned command is the person's explicit choice and stays, whatever the level: hiding a shortcut someone pinned
     would be baffling. The interface suite caught the first version doing exactly that. */
  cmds=cmds.filter(function(c){var m=meta[c.id];return !m||commandVisibleAtLevel(m)||(typeof isPinned==='function'&&isPinned(c.id));});
  var scored=cmds.map(function(c){
    var m=meta[c.id]||{};
    var lab=c.label.toLowerCase();
    var desc=String(m.description||'').toLowerCase();
    var kws=(m.keywords||[]).join(' ').toLowerCase();
    /* Matching runs over the label, the description and the aliases, so someone who thinks of it as
       "scan" finds the panel reader and someone who thinks of it as "zen" finds focus mode. */
    var score=-1;
    if(!ql)score=0;
    else if(lab===ql)score=100;
    else if(lab.indexOf(ql)===0)score=70;
    else if(kws.split(' ').indexOf(ql)>=0)score=65;
    else if(lab.indexOf(ql)>=0)score=50;
    else if(kws.indexOf(ql)>=0)score=40;
    else if(desc.indexOf(ql)>=0)score=25;
    else if(c.id.indexOf(ql)>=0)score=20;
    if(score>=0)score+=Math.min(12,(m.useScore||0)*3);   // what you actually use, but never enough to outrank an exact match
    if(score>=0&&m.available===false)score-=8;           // still listed, just lower, with the reason shown
    return {c:c,m:m,score:score};
  }).filter(function(x){return !ql||x.score>=0;});
  scored.sort(function(a,b){return b.score-a.score;});
  var items=scored.slice(0,ql?12:16).map(function(x){var c=x.c;c.description=x.m.description;
    c.unavailable=x.m.available===false?x.m.unavailableReason:null;return c;});
  /* With no query, lead with what makes sense on this view, then put the person's own pins in front of
     that: a pin is an explicit choice and should outrank an inferred suggestion. Neither ever displaces an
     exact match once something is typed. */
  if(!ql){
    var here=commandsHere();
    var byId={};items.forEach(function(c){byId[c.id]=1;});
    var lead=[];
    here.forEach(function(h){
      if(byId[h.id])return;
      var c=cmds.filter(function(x){return x.id===h.id;})[0];
      if(c){c.description=h.description;c.unavailable=h.available?null:h.reason;lead.push(c);}
    });
    items=lead.concat(items);
    var pins=pinnedCommands().map(function(id){return cmds.filter(function(c){return c.id===id;})[0];}).filter(Boolean);
    if(pins.length){
      var pinIds={};
      pins.forEach(function(c){pinIds[c.id]=1;c.description=(meta[c.id]||{}).description;c.pinned=true;});
      items=pins.concat(items.filter(function(c){return !pinIds[c.id];}));
    }
    items=items.slice(0,16);
  }
  if(ql.length>=2){
    try{var sr=searchAll(q);sr.results.slice(0,12).forEach(function(r){
      items.push({id:'search:'+r.domain+':'+(r.arg||r.label),label:r.label,hint:r.domainLabel||r.domain,detail:r.detail,
        run:function(){if(r.act)dispatchAct(r.act,r.arg);}});});}catch(e){_q(e);}
  }
  _CMDK_ITEMS=items;if(_CMDK_SEL>=items.length)_CMDK_SEL=0;
  var el=document.getElementById('cmdkResults');
  el.innerHTML=items.length?items.map(function(c,i){
    return '<div class="cmdk-item'+(i===_CMDK_SEL?' sel':'')+'" role="option" aria-selected="'+(i===_CMDK_SEL)+'" data-act="cmdk.pick" data-arg="'+i+'">'+
      '<span class="ci-label">'+esc(c.label)+
        (c.description?'<span class="ci-desc">'+esc(c.description)+'</span>':'')+
        (c.unavailable?'<span class="ci-why">'+esc(c.unavailable)+'</span>':'')+
        (c.detail?' <span class="muted">'+esc(String(c.detail).slice(0,60))+'</span>':'')+'</span>'+
      (c.hint?'<span class="ci-hint">'+esc(c.hint)+'</span>':'')+
      (c.id&&!/^search:/.test(c.id)?('<button class="ci-pin'+(isPinned(c.id)?' on':'')+'" data-act="cmd.pin" data-arg="'+attrEsc(c.id)+'" aria-label="'+(isPinned(c.id)?'Unpin':'Pin')+' '+attrEsc(c.label)+'" title="'+(isPinned(c.id)?'Unpin':'Pin')+'">\u2605</button>'):'')+
      '</div>';
  }).join(''):'<div class="cmdk-empty">No match. Try a prefix: '+SEARCH_DOMAINS.map(function(d){return esc(d.prefix);}).join(' ')+' or date:2026-08</div>';
}

registerAction('cmdk.open',function(){openCmdk();});
registerAction('cmdk.backdrop',function(arg,ev){if(ev&&ev.target&&ev.target.id==='cmdkBackdrop')closeCmdk();});
registerAction('cmdk.filter',function(arg,ev,el){renderCmdk(el.value);});
registerAction('cmdk.pick',function(arg){var c=_CMDK_ITEMS[+arg];closeCmdk();
  if(!c)return;
  /* A command that cannot run right now says why instead of doing nothing. */
  var av=commandAvailability(c.id);
  if(!av.ok){toast(c.label+': '+av.reason,{tone:'attention',ms:7000});return;}
  try{noteCommandUse(c.id);}catch(e){_q(e,'P3');}
  c.run();});
registerAction('confirm.ok',function(){resolveConfirm(true);});
registerAction('confirm.cancel',function(){resolveConfirm(false);});
registerAction('prompt.ok',function(){resolvePrompt(document.getElementById('promptInput').value);});
registerAction('prompt.cancel',function(){resolvePrompt(null);});
/* ---- keyboard ---- */
var _GOTO_ARMED=false,_GOTO_TIMER=null;
function installHotkeys(){document.addEventListener('keydown',function(ev){var mod=ev.metaKey||ev.ctrlKey;var inField=/INPUT|TEXTAREA|SELECT/.test((ev.target&&ev.target.tagName)||'');var cmdkOpen=document.getElementById('cmdkBackdrop').classList.contains('show');
    if(cmdkOpen){if(ev.key==='ArrowDown'){ev.preventDefault();_CMDK_SEL=Math.min(_CMDK_ITEMS.length-1,_CMDK_SEL+1);renderCmdk(document.getElementById('cmdkInput').value);}else if(ev.key==='ArrowUp'){ev.preventDefault();_CMDK_SEL=Math.max(0,_CMDK_SEL-1);renderCmdk(document.getElementById('cmdkInput').value);}else if(ev.key==='Enter'){ev.preventDefault();var c=_CMDK_ITEMS[_CMDK_SEL];closeCmdk();if(c)c.run();}else if(ev.key==='Escape'){ev.preventDefault();closeCmdk();}return;}
    if(ev.key==='Escape'){if(document.getElementById('confirmBackdrop').classList.contains('show')){resolveConfirm(false);return;}if(document.getElementById('promptBackdrop').classList.contains('show')){resolvePrompt(null);return;}if(_SHEET){closeSheet();return;}}
    if(mod&&ev.key.toLowerCase()==='k'){ev.preventDefault();openCmdk();return;}
    if(mod&&ev.key.toLowerCase()==='z'&&!inField){ev.preventDefault();dispatchAct('undo.last');return;}
    if(mod&&ev.key==='['){ev.preventDefault();dispatchAct('nav.back');return;}
    if(mod&&ev.key===']'){ev.preventDefault();dispatchAct('nav.forward');return;}
    if(inField||_SHEET||mod||ev.altKey)return;
    /* G-prefix navigation: G then a letter. The prefix expires after 1.2s so a stray G cannot swallow the
       next keystroke, and every destination is also a visible tab. */
    if(_GOTO_ARMED){var dest=({h:'today',t:'train',l:'log',p:'plan',f:'food',b:'body',r:'progress',d:'diagnose',e:'experiments',n:'learn',a:'archive',s:'tools'})[ev.key.toLowerCase()];
      _GOTO_ARMED=false;clearTimeout(_GOTO_TIMER);
      if(dest){ev.preventDefault();switchTab(dest);announce('Moved to '+dest);return;}}
    if(ev.key.toLowerCase()==='g'){ev.preventDefault();_GOTO_ARMED=true;clearTimeout(_GOTO_TIMER);_GOTO_TIMER=setTimeout(function(){_GOTO_ARMED=false;},1200);announce('Go to: press H, L, P, T, F, B, R, D, E, N, A or S');return;}
    if(ev.key==='/'){ev.preventDefault();dispatchAct('search.open');}
    else if(ev.key==='?'){ev.preventDefault();dispatchAct('ui.keys');}
    else if(ev.key==='['){ev.preventDefault();dispatchAct('nav.back');}
    else if(ev.key===']'){ev.preventDefault();dispatchAct('nav.forward');}
    else if(ev.key==='Home'){ev.preventDefault();scrollToTop();}
    else if(ev.key==='End'){ev.preventDefault();scrollToBottom();}
    else if(ev.key==='PageDown'){ev.preventDefault();scrollByViewport(0.9);}
    else if(ev.key==='PageUp'){ev.preventDefault();scrollByViewport(-0.9);}
    else if(ev.key==='ArrowLeft'){ev.preventDefault();dayStep(-1);}
    else if(ev.key==='ArrowRight'){ev.preventDefault();dayStep(1);}
    else if(ev.key.toLowerCase()==='t'){ev.preventDefault();setCurrentDay(todayISO());}
    else if(ev.key.toLowerCase()==='h'){ev.preventDefault();dispatchAct('nav.home');}
    else if(ev.key.toLowerCase()==='a'){ev.preventDefault();dispatchAct('nav.attention');}
    else if(ev.key.toLowerCase()==='f'){ev.preventDefault();dispatchAct('ui.focus');}
    else if(ev.key.toLowerCase()==='r'){ev.preventDefault();dispatchAct(replayActive()?'replay.exit':'replay.pick');}
    else if(ev.key.toLowerCase()==='l'){ev.preventDefault();openLog('weight');}
    else if(/^[1-9]$/.test(ev.key)){var tabs=['today','log','plan','train','food','body','progress','diagnose','experiments'];switchTab(tabs[+ev.key-1]);}
    else if(ev.key==='Enter'&&document.getElementById('promptBackdrop').classList.contains('show')){resolvePrompt(document.getElementById('promptInput').value);}
  });
  document.getElementById('promptInput').addEventListener('keydown',function(ev){if(ev.key==='Enter'){ev.preventDefault();resolvePrompt(ev.target.value);}});}

/* ---- navigation, scroll, day, discovery and recovery actions (model: 94-navigation.js) ---- */
registerAction('nav.back',function(){if(!navBack())toast('Nothing to go back to');});
registerAction('nav.forward',function(){if(!navForward())toast('Nothing to go forward to');});
registerAction('nav.top',function(){scrollToTop();});
registerAction('nav.home',function(){if(replayActive())exitReplay();setCurrentDay(todayISO());switchTab('today');scrollToTop();});
registerAction('nav.bottom',function(){scrollToBottom();});
/* nav.tab is registered once, above: this was an identical second registration. */
registerAction('nav.day',function(arg){setCurrentDay(arg);if(_TAB!=='food'&&_TAB!=='log')switchTab('log');});
registerAction('nav.section',function(arg){if(!scrollToSection(arg))toast('That section is not on this view');});
registerAction('day.step',function(arg){dayStep(+arg);});
registerAction('day.jump',function(arg){var j=DAY_JUMPS().filter(function(x){return x.id===arg;})[0];if(j)j.run();});
registerAction('nav.attention',function(){openAttention();});
registerAction('nav.setup',function(){openSetup();});
registerAction('nav.health',function(){openHealth();});
registerAction('nav.storage',function(){openStorage();});
registerAction('nav.sync',function(){openSync();});
registerAction('nav.cloud',function(){openCloud();});
registerAction('nav.voice',function(){openVoice();});
registerAction('nav.label',function(){openLabel();});
registerAction('nav.yields',function(){openYields();});
registerAction('nav.integrity',function(){openEventIntegrity();});
registerAction('nav.planEdit',function(){openPlanEdit();});
registerAction('nav.domains',function(){openDomains();});
registerAction('gen.program',function(){openGenProgram();});
registerAction('gen.apply',function(arg){
  var g=_GEN_PROGRAMS;if(!g||g.status!=='ok')return;
  var c=g.candidates[+arg];if(!c)return;
  confirmDialog({title:'Use this plan?',
    msg:'It replaces your current week. The built-in stays underneath, so you can reset, and sessions you already logged are untouched.<br><br>'+
      Object.keys(c.def.templates).map(function(t){return '<b>'+esc(t)+'</b>: '+c.def.templates[t].map(function(r){return esc(r[0]);}).join(', ');}).join('<br>'),
    ok:'Use it'}).then(function(y){
      if(!y)return;
      saveProgramDef(trainingProgram().key,c.def,{change:'generated plan'});
      closeSheet();renderAll();toast('Plan applied \u00b7 one undo reverts it',{undo:true});});});
registerAction('gen.progress',function(){openProgression();});
registerAction('gen.meals',function(){openMealPlan();});
registerAction('gen.grocery',function(arg){
  var out=groceryList(_MEAL_PLAN,+arg||7);
  if(!out){toast('Generate a day first',{tone:'negative'});return;}
  var body='PHYSIQUE OS \u2014 shopping list ('+out.days+' days)\n\n'+
    out.rows.map(function(r){return '  '+(r.kg>=1?(r.kg+' kg'):(r.grams+' g')).padEnd(10)+r.name;}).join('\n')+
    '\n\n'+out.caveat;
  copyText(body).then(function(ok){
    if(ok)toast('Shopping list copied');
    else if(downloadText('shopping-'+todayISO()+'.txt',body,'text/plain'))toast('Copying is unavailable here, so it was downloaded');});});
registerAction('gen.search',function(){openPlanSearch();});
registerAction('nav.graph',function(){openGraph();});
registerAction('nav.ask',function(){_ASK=null;openAsk();});
registerAction('ask.run',function(arg,ev,el){
  var q=arg||((document.getElementById('askInput')||{}).value||'');
  if(!String(q).trim())return;
  _ASK=askQuestion(q);_ASK_Q=q;renderSheet();});
registerAction('ask.field',function(arg,ev,el){_ASK_Q=el.value;});
registerAction('move.prepare',function(){openPrepare();});
registerAction('nav.resistance',function(){openResistance();});
registerAction('nav.propagation',function(){openPropagation();});
registerAction('res.exercise',function(arg){openExerciseDetail(arg);});
registerAction('move.recover',function(){openRecover();});
registerAction('move.library',function(){openMoveLibrary();});
registerAction('nav.mobility',function(){openMobility();});
registerAction('nav.compose',function(){openCompose();});
registerAction('nav.conditioning',function(){openConditioning();});
registerAction('nav.substitute',function(){openSubstitute();});
registerAction('nav.recovery2',function(){openRecoveryState();});
registerAction('nav.twin',function(){openTwin();});
registerAction('nav.maintenance',function(){openMaintenance();});
registerAction('nav.maturity',function(){openMaturity();});
registerAction('nav.inference',function(){openInference();});
registerAction('inf.question',function(arg){
  var p=String(arg||'').split('>');
  openSheet('edit',{form:'identification',title:p[0]+' \u2192 '+p[1],
    desc:'Whether this question can be answered from observation at all, and what it would take.',
    buf:{t:p[0],y:p[1]}});});
registerAction('nav.equipment',function(){openEquipment();});
registerAction('nav.deload',function(){openDeload();});
registerAction('eq.retire',function(arg){
  confirmDialog({title:'Retire this item?',msg:'It stays in the record as something you used to have, so past sessions still make sense.',ok:'Retire'})
    .then(function(y){if(y&&retireEquipment(arg)){renderSheet();renderAll();toast('Retired',{undo:true});}});});
registerAction('nav.optimise',function(){openOptimise();});
registerAction('sub.for',function(arg){_SUB=substituteFood(arg,{grams:150});renderSheet();});
registerAction('skill.limiter',function(arg){
  var l=skillLimiter(arg);
  if(!l)return;
  openSheet('edit',{form:'skillLimiter',title:l.label,desc:'What is holding you at this step.',buf:{l:l}});});
registerAction('nav.yoga',function(){openYoga();});
registerAction('yoga.log',function(arg){if(logSequence(arg)){renderAll();toast('Logged',{undo:true});}});
registerAction('stretch.info',function(arg){
  var p=stretchPrescription(arg,{when:'before'});
  openSheet('edit',{form:'stretchInfo',title:p.label||'Stretch',desc:'',buf:{p:p,kind:arg}});});
registerAction('move.progress',function(){openProgressions();});
registerAction('move.assess',function(arg){
  var a2=ASSESSMENTS.filter(function(x){return x.id===arg;})[0]||ASSESSMENTS[0];
  promptDialog({title:a2.label,label:a2.how+' \u2014 value in '+a2.unit,value:''})
    .then(function(v){if(!v)return;
      if(recordAssessment(a2.id,v)){renderAll();toast('Recorded \u00b7 measure it again after some work to see if anything changed',{ms:7000,undo:true});}
      else toast('That is not a number',{tone:'negative'});});});
registerAction('move.log',function(arg){
  var m=MOVEMENT_LIBRARY.filter(function(x){return x.id===arg;})[0];
  if(!m)return;
  if(logMovement({role:m.role,movementId:m.id})){renderAll();toast('Logged '+esc(m.label),{undo:true});}});
registerAction('move.skill',function(arg){
  var p=String(arg).split('|');
  promptDialog({title:'State for '+p[1],label:SKILL_STATES.join(' / '),value:''})
    .then(function(v){if(!v)return;
      if(setSkillState(p[0],String(v).toLowerCase().trim())){renderSheet();renderAll();toast('Updated',{undo:true});}
      else toast('Use one of: '+SKILL_STATES.join(', '),{tone:'negative',ms:8000});});});
registerAction('nav.causal',function(){openCausal();});
registerAction('nav.experiments2',function(){openExperimentLibrary();});
registerAction('exp.fromTemplate',function(arg){
  var t=experimentTemplate(arg);
  if(!t){toast('No such template');return;}
  openSheet('edit',{form:'expTemplate',title:t.label,desc:esc(t.question),buf:{t:t}});});
registerAction('injury.add',function(){openInjuryAdd();});
registerAction('injury.review',function(arg){openInjuryReview(arg);});
registerAction('injury.save',function(){
  var b=_SHEET.buf;
  if(!b.region){toast('Choose an area first',{tone:'negative'});return;}
  var rec=recordInjury({region:b.region,severity:b.severity||2,since:b.since||todayISO(),note:b.note||''});
  if(rec){closeSheet();renderAll();toast('Recorded \u00b7 your plan is checked against it',{undo:true});}});
registerAction('injury.region',function(arg){_SHEET.buf.region=arg;renderSheet();});
registerAction('injury.sev',function(arg){_SHEET.buf.severity=+arg;renderSheet();});
registerAction('injury.resolve',function(arg){
  confirmDialog({title:'Mark it settled?',msg:'It stays in the record as a past episode, and a recurrence in the same area is what the system watches for.',ok:'Settled'})
    .then(function(y){if(y&&resolveInjury(arg)){closeSheet();renderAll();toast('Marked settled',{undo:true});}});});
registerAction('nav.recent',function(){openRecent();});
registerAction('nav.saved',function(){openSaved();});
registerAction('search.save',function(){
  var q=(document.getElementById('cmdkInput')||{}).value||'';
  if(!q.trim()){toast('Type a search first',{tone:'negative'});return;}
  promptDialog({title:'Name this search',label:'A name you will recognise later',value:q.trim()})
    .then(function(name){if(!name)return;
      var r=saveSearch(q,name);
      toast(r?('Saved \u00b7 it re-runs each time, so it cannot go stale'):'That search is already saved',{ms:6000});});});
registerAction('saved.run',function(arg){
  var r=runSavedSearch(arg);
  if(!r)return;
  closeSheet();openCmdk();
  var el=document.getElementById('cmdkInput');
  if(el){el.value=r.saved.query;renderCmdk(r.saved.query);}});
registerAction('saved.remove',function(arg){removeSavedSearch(arg);renderSheet();});
registerAction('cmd.pin',function(arg){
  if(pinCommand(arg))renderCmdk((document.getElementById('cmdkInput')||{}).value||'');
  else toast('Eight pinned commands is the limit \u2014 unpin one first',{tone:'attention'});});
registerAction('ui.layout',function(arg){
  var m=setLayout(arg);renderAll();
  toast('Layout: '+m.mode+' \u00b7 '+m.reason,{ms:6000});});
registerAction('nav.jump',function(){openJumps();});
registerAction('nav.since',function(){openChangedSince();});
registerAction('nav.compare',function(){openCompare();});
registerAction('jump.go',function(arg){
  var t=jumpTargets().filter(function(x){return x.id===arg;})[0];
  if(!t)return;closeSheet();
  if(t.act)setTimeout(function(){dispatchAct(t.act,t.arg);},60);});
registerAction('why.shown',function(arg){
  var p=String(arg).split('|');var w=whyShown(p[0],p[1]);
  if(!w){toast('No explanation is recorded for that');return;}
  openSheet('edit',{form:'whyShown',title:'Why am I seeing this?',desc:'',buf:{w:w}});});
registerAction('copy.decision',function(arg){
  var txt=decisionReport(arg);
  if(!txt){toast('No decision to copy');return;}
  copyText(txt).then(function(ok){
    if(ok)toast('Decision copied \u00b7 reasoning only, no measurements');
    else if(downloadText('physique-decision-'+todayISO()+'.txt',txt,'text/plain'))toast('Copying is unavailable here, so it was downloaded instead');});});
registerAction('copy.trace',function(arg){
  var txt=traceReport(arg);
  if(!txt){toast('No trace to copy');return;}
  copyText(txt).then(function(ok){
    if(ok)toast('Trace copied');
    else if(downloadText('physique-trace-'+arg+'.txt',txt,'text/plain'))toast('Copying is unavailable here, so it was downloaded instead');});});
registerAction('sel.export',function(){
  var out=exportSelectedCSV();
  if(!out){toast('Nothing selected',{tone:'negative'});return;}
  if(downloadText(out.name,out.body,'text/csv'))toast('Exported '+out.count+' record'+(out.count===1?'':'s'));});
registerAction('plan.swap',function(arg){
  var p=String(arg).split('|');
  promptDialog({title:'Swap this exercise',label:'Exercise name',value:p[2]||''})
    .then(function(v){if(!v)return;setTemplateRow(p[0],p[1],+p[3],{exercise:v});renderSheet();renderAll();});});
registerAction('plan.sets',function(arg){
  var p=String(arg).split('|');
  promptDialog({title:'Sets and reps',label:'e.g. 3x8-12',value:''})
    .then(function(v){if(!v)return;var m=/^(\d+)\s*[x\u00d7]\s*(.+)$/.exec(String(v).trim());
      if(!m){toast('Use the form 3x8-12',{tone:'negative'});return;}
      setTemplateRow(p[0],p[1],+p[2],{sets:+m[1],reps:m[2]});renderSheet();renderAll();});});
registerAction('plan.move',function(arg){var p=String(arg).split('|');moveTemplateRow(p[0],p[1],+p[2],+p[3]);renderSheet();});
registerAction('plan.remove',function(arg){var p=String(arg).split('|');
  confirmDialog({title:'Remove this exercise?',msg:'It comes out of the plan from now on. Sessions you already logged are untouched.',ok:'Remove',danger:true})
    .then(function(y){if(y){setTemplateRow(p[0],p[1],+p[2],null);renderSheet();renderAll();}});});
registerAction('plan.add',function(arg){var p=String(arg).split('|');
  promptDialog({title:'Add an exercise',label:'Exercise name',value:''})
    .then(function(v){if(!v)return;addTemplateRow(p[0],p[1],v,3,'8\u201312');renderSheet();renderAll();});});
registerAction('plan.day',function(arg){var p=String(arg).split('|');
  promptDialog({title:'What happens on '+p[1]+'?',label:'A label, or "rest" to clear the day',value:p[2]||''})
    .then(function(v){if(!v)return;
      if(/^rest$/i.test(v.trim()))setProgramDay(p[0],p[1],{kind:'rest'});
      else setProgramDay(p[0],p[1],{label:v.trim(),kind:p[3]||'lift'});
      renderSheet();renderAll();});});
registerAction('plan.adapt',function(arg){
  var p=String(arg).split('|');
  var r=adaptProgramTo(p[0],p[1],{dryRun:true});
  if(!r.ok||!r.swaps.length){toast(r.note||'nothing to change',{ms:6000});return;}
  confirmDialog({title:'Adapt to '+r.situation+'?',
    msg:r.swaps.slice(0,10).map(function(s){return '\u00b7 '+esc(s.from)+' \u2192 '+esc(s.to);}).join('<br>')+
      (r.swaps.length>10?('<br>\u00b7 and '+(r.swaps.length-10)+' more'):'')+
      (r.unmatched.length?('<br><br>'+r.unmatched.length+' exercise(s) have no substitute with that equipment and stay as they are.'):''),
    ok:'Apply '+r.swaps.length+' swap'+(r.swaps.length===1?'':'s')})
    .then(function(y){if(!y)return;var d=adaptProgramTo(p[0],p[1]);toast(d.note,{ms:7000,undo:true});renderSheet();renderAll();});});
registerAction('plan.reset',function(arg){
  confirmDialog({title:'Reset to the built-in plan?',msg:'Your changes to this plan are discarded. Logged sessions are untouched.',ok:'Reset',danger:true})
    .then(function(y){if(y&&resetProgram(arg)){toast('Reset to the built-in plan',{undo:true});renderSheet();renderAll();}});});
registerAction('trace.open',function(arg){openTrace(arg);});
registerAction('replay.enter',function(arg){enterReplay(arg||addDays(todayISO(),-14));});
registerAction('replay.exit',function(){exitReplay();});
registerAction('replay.step',function(arg){if(!replayStep(+arg))toast('Already at the edge of the record');});
registerAction('replay.goto',function(arg){enterReplay(arg);});
registerAction('replay.pick',function(){
  promptDialog({title:'Replay a day',label:'Date (YYYY-MM-DD)',value:replayActive()?replayMode().date:addDays(todayISO(),-14)})
    .then(function(v){if(v&&isValidISO(v))enterReplay(v);else if(v)toast('Use YYYY-MM-DD',{tone:'negative'});});});
registerAction('replay.waypoints',function(){openReplayWaypoints();});
registerAction('replay.compare',function(){openReplayCompare();});
registerAction('events.verify',function(){
  var m=projectionMatchesRecord();
  var agree=[1,7,30].map(function(d){return replayAgreement(addDays(todayISO(),-d));});
  _EVENT_CHECK={projection:m,agree:agree,at:nowISO()};renderSheet();
  toast(m.ok&&agree.every(function(a2){return a2.agree;})?'History verified \u00b7 the log reproduces the record':'Mismatch found \u2014 see the detail',
    {tone:m.ok?'good':'negative',ms:7000});});
registerAction('events.compact',function(){
  confirmDialog({title:'Compact the event log?',msg:'Older events are folded into a snapshot and the originals are written to the archive. Nothing is deleted, and the record is unchanged \u2014 this only bounds how much history is held in memory.',ok:'Compact'})
    .then(function(y){if(!y)return;var r=compactEvents(true);
      toast(r.compacted?('Archived '+r.compacted+' events'):(r.error||'Nothing to compact'),{tone:r.error?'negative':'good'});
      renderSheet();});});
/* Both fields live in module state, not in the DOM. Re-rendering the sheet after a search would otherwise
   discard the weight already typed — losing a value the user entered is never an acceptable side effect of
   a different action. */
registerAction('yields.field',function(arg,ev,el){
  if(arg==='raw')_YIELD_RAW=el.value;else _YIELD_Q=el.value;});
registerAction('yields.search',function(){
  _YIELDS=findYields(_YIELD_Q,20);renderSheet();});
registerAction('yields.apply',function(arg){
  var raw=num(_YIELD_RAW);
  if(raw==null||raw<=0){toast('Enter the raw weight first',{tone:'negative'});return;}
  var r=applyYield(raw,arg);
  if(!r.applied){toast(r.note,{tone:'negative',ms:8000});return;}
  _YIELD_RESULT=Object.assign({raw:raw},r);renderSheet();});
registerAction('cloud.create',function(){
  promptDialog({title:'Create an encrypted vault',label:'Recovery phrase \u2014 six words or more. It is the only secret, and it cannot be recovered.',value:''})
    .then(function(p){if(!p)return;
      cloudCreateVault(p).then(function(r){toast('Vault created \u00b7 '+String(r.vaultId).slice(0,8)+'\u2026');renderSheet();})
        .catch(function(e){toast(String(e&&e.message||e),{tone:'negative',ms:9000});});});});
registerAction('cloud.unlock',function(){
  promptDialog({title:'Unlock your vault',label:'Recovery phrase',value:''})
    .then(function(p){if(!p)return;cloudUnlock(p).then(function(){toast('Vault unlocked on this device');renderSheet();})
      .catch(function(e){toast(String(e&&e.message||e),{tone:'negative'});});});});
registerAction('cloud.sync',function(){
  cloudSync().then(function(r){toast('Synced \u00b7 sent '+r.sent+', received '+r.received+(r.conflicts?(', '+r.conflicts+' concurrent edit(s)'):''));renderAll();})
    .catch(function(e){toast(String(e&&e.message||e),{tone:'negative',ms:8000});});});
registerAction('cloud.addDevice',function(){
  cloudAddThisDevice().then(function(){toast('This device is now authorised for the vault');renderSheet();})
    .catch(function(e){toast(String(e&&e.message||e),{tone:'negative'});});});
registerAction('cloud.push',function(){
  cloudSubscribePush().then(function(){toast('Reminders enabled \u00b7 pushes carry no data, only a nudge');renderSheet();})
    .catch(function(e){toast(String(e&&e.message||e),{tone:'negative',ms:8000});});});
registerAction('cloud.disable',function(){
  confirmDialog({title:'Stop syncing on this device?',msg:'The vault and its data stay on the server. Use Delete vault to remove them.',ok:'Stop syncing'})
    .then(function(y){if(y){toast(cloudDisable().note,{ms:7000});renderSheet();}});});
registerAction('cloud.delete',function(){
  confirmDialog({title:'Delete the vault from the server?',msg:'Every synced event is erased. Your local record is untouched. This cannot be undone.',ok:'Delete vault',danger:true})
    .then(function(y){if(!y)return;cloudDeleteVault().then(function(){toast('Vault deleted from the server');renderSheet();})
      .catch(function(e){toast(String(e&&e.message||e),{tone:'negative'});});});});
registerAction('voice.start',function(){
  if(_VOICE&&(_VOICE.phase==='listening'||_VOICE.phase==='hearing'||_VOICE.phase==='starting')){stopVoiceCapture();_VOICE={phase:'ended',reason:'Listening stopped.'};renderSheet();return;}
  var r=startVoiceCapture(function(p){_VOICE=p;if(_SHEET&&_SHEET.opts&&_SHEET.opts.form==='voice')renderSheet();});
  if(!r.ok){_VOICE={phase:'error',code:'unavailable',reason:r.reason};renderSheet();}});
/* Typed instead: the same parser and the same confirmation. */
registerAction('voice.typed',function(a,ev,el){if(_SHEET&&_SHEET.buf)_SHEET.buf.typed=el?el.value:'';});
registerAction('voice.parseTyped',function(){var t=((_SHEET&&_SHEET.buf&&_SHEET.buf.typed)||'').trim();if(!t)return;var p=parseUtterance(t);p.phase='heard';p.typed=true;_VOICE=p;renderSheet();});
registerAction('voice.apply',function(){
  if(!_VOICE||!_VOICE.ok)return;
  var r=applyUtterance(_VOICE,{});
  if(r.ok){_VOICE=null;closeSheet();renderAll();toast('Logged',{undo:true});}
  else toast(r.reason,{tone:'negative'});});
registerAction('voice.discard',function(){stopVoiceCapture();_VOICE=null;renderSheet();});
registerAction('label.parse',function(arg,ev,el){
  var text=(document.getElementById('labelText')||{}).value||'';
  _LABEL=parseNutritionLabel(text);renderSheet();});
registerAction('label.save',function(){
  if(!_LABEL||!_LABEL.ok)return;
  var name=(document.getElementById('labelName')||{}).value||'Scanned product';
  var food=labelToFood(_LABEL,name);
  if(!food)return;
  saveUserFood(food);_LABEL=null;closeSheet();renderAll();toast('Saved '+esc(food.name));});
registerAction('nav.knowledge',function(){openKnowledge();});
registerAction('nav.episodes',function(){openEpisodes();});
registerAction('nav.scenarios',function(){openScenarios();});
registerAction('nav.import',function(){openImport();});
registerAction('nav.photos',function(){openPhotos();});
registerAction('sync.export',function(){var e=exportSyncEnvelope();if(downloadText(e.name,e.body,'application/json'))toast('Sync envelope exported \u00b7 '+e.env.count+' events');});
registerAction('sync.import',function(){var i=document.getElementById('restoreFile');if(i){i.value='';i.click();}});   // the handler detects a sync envelope by its content
registerAction('sync.push',function(){toast(pushSync()?'Broadcast to other tabs':'No transport available');});
registerAction('notif.enable',function(){requestNotifications().then(function(p){toast('Reminders: '+p);renderAll();});});
registerAction('exp.design',function(v){openDesign(v);});   /* "Test it" opens with that claim\u2019s variable first */
registerAction('storage.checkpoint',function(){var r=writeCheckpoint('manual');toast(r.ok?('Checkpoint written \u00b7 '+Math.round(r.bytes/1024)+' KB'):'Checkpoint failed',{tone:r.ok?'good':'negative'});renderAll();});
registerAction('storage.clearFood',function(){
  confirmDialog({title:'Delete the cached food database?',msg:'This removes the downloaded USDA shards from the browser cache. It is public reference data, not your record \u2014 nothing you logged is affected, and shards re-download when next needed.',ok:'Delete cache',danger:true})
    .then(function(yes){if(!yes)return;clearFoodCache().then(function(r){toast(r.note||'Cache cleared',{tone:r.ok?'good':'negative'});renderAll();});});});
registerAction('storage.integrity',function(){
  var ic=integrityCheck('manual');
  openSheet('edit',{form:'integrity',title:'Integrity check',desc:'P0 blocks an operation. P1 means a number downstream may be wrong. P2 and P3 are recorded and not blocking.',buf:{ic:ic}});});
registerAction('data.backupEncrypted',function(){
  if(!_cryptoOk()){toast('Encryption needs a secure context (https or localhost)',{tone:'negative'});return;}
  promptDialog({title:'Encrypt this backup',label:'Passphrase (at least 8 characters) \u2014 there is no recovery if you lose it',value:''})
    .then(function(pass){
      if(!pass)return;
      encryptBackup(pass).then(function(env){
        var name='physique-backup-'+todayISO()+'.encrypted.json';
        if(downloadText(name,JSON.stringify(env,null,1),'application/json')){
          DB.settings.lastBackupAt=nowISO();save('settings');
          toast('Encrypted backup exported \u00b7 keep the passphrase somewhere safe');}
      }).catch(function(e){toast(String(e&&e.message||e),{tone:'negative'});});});});
registerAction('data.restoreEncrypted',function(){
  var inp=document.getElementById('restoreFile');if(!inp)return;
  inp.value='';inp.click();});   // an encrypted backup is recognised by its own format field
/* ---- selection and bulk operations ---- */
registerAction('sel.enter',function(arg){selectionEnter(arg||'obs');renderAll();});
registerAction('sel.exit',function(){selectionExit();renderAll();});
registerAction('sel.toggle',function(arg){selectionToggle(arg);renderAll();});
registerAction('sel.all',function(arg){
  var ids=arg==='food'?foodLogsOn(currentDay()).map(function(l){return l.id;}):obsOnDay(currentDay()).map(function(o){return o.id;});
  selectionSelectAll(ids);renderAll();toast(selectionCount()+' selected');});
registerAction('sel.act',function(arg){
  var act=bulkActions().filter(function(a2){return a2.id===arg;})[0];if(!act)return;
  var recs=selectionRecords();if(!recs.length){toast('Nothing selected');return;}
  var proceed=function(extra){
    confirmDialog({title:act.label+' '+recs.length+' '+(selectionKind()==='food'?'food entr'+(recs.length===1?'y':'ies'):'entr'+(recs.length===1?'y':'ies'))+'?',
      msg:act.describe(recs,extra),ok:act.label,danger:!!act.danger}).then(function(yes){
        if(!yes)return;
        var r=bulkRun(arg,extra);
        renderAll();
        toast(r.ok?(r.label+' '+r.n+' · one undo reverts the whole batch'):('Could not complete: '+r.reason),{tone:r.ok?'good':'negative',undo:r.ok});});};
  if(act.needs==='meal')promptDialog({title:'Move to which meal?',label:'breakfast, lunch, dinner or snacks',value:'lunch'}).then(function(v){if(v&&MEALS.indexOf(v)>=0)proceed(v);else if(v)toast('Not a meal name',{tone:'negative'});});
  else if(act.needs==='date')promptDialog({title:'Copy to which day?',label:'Date (YYYY-MM-DD)',value:todayISO()}).then(function(v){if(v&&isValidISO(v))proceed(v);else if(v)toast('Use YYYY-MM-DD',{tone:'negative'});});
  else proceed(null);});
registerAction('nav.whatChanged',function(){openWhatChanged();});
registerAction('nav.timeline',function(){openTimeline();});
registerAction('nav.missing',function(){openMissing();});
registerAction('nav.dataQuality',function(){openDataQuality();});
registerAction('nav.voi',function(){switchTab('learn');setTimeout(function(){scrollToSection('fold-learn-voi');},80);});
registerAction('ui.focus',function(){setFocusMode(!focusMode());});
registerAction('ui.keys',function(){openKeyboardHelp();});
registerAction('ui.undoHistory',function(){openUndoHistory();});
/* Undoing several steps is destructive enough to name what will go and to confirm beyond one step. */
registerAction('undo.at',function(arg){var steps=Math.max(1,+arg);var labels=undoHistory().slice(0,steps).map(function(h){return h.label;});
  var apply=function(){var did=null;for(var i=0;i<steps;i++){did=undo()||did;}if(did){_memoInvalidate();closeSheet();renderAll();toast('Undid '+steps+' change'+(steps>1?'s':'')+': '+labels.join(', '));}else toast('Nothing to undo');};
  if(steps===1)apply();
  else confirmDialog({title:'Undo '+steps+' changes?',msg:'This reverts, most recent first:<br>'+labels.map(function(l){return '\u00b7 '+esc(l);}).join('<br>'),ok:'Undo '+steps,danger:true}).then(function(yes){if(yes)apply();});});
registerAction('search.open',function(){openCmdk();var el=document.getElementById('cmdkInput');if(el){el.value='';renderCmdk('');}});
registerAction('log.type',function(arg){openLog(arg);});
registerAction('obs.inspect',function(arg){openObsInspect(arg);});
registerAction('obs.inspectDecision',function(arg){openDecisionInspect(arg);});
registerAction('obs.retract',function(arg){confirmDialog({title:'Retract this observation?',msg:'It stays in the record and remains visible in replays of the days before now. Trends from today forward will exclude it.',okLabel:'Retract',danger:true}).then(function(yes){if(yes&&retractObservation(arg,'user')){_memoInvalidate();closeSheet();renderAll();toast('Retracted',{undo:true});}});});
/* An alert that only switched tabs left the person at the top (or bottom) of a page with nothing pointing at it; it now
   opens its own sheet: what happened, why, the details, and Show me / Done / Later. Done dismisses it for good. */
registerAction('attention.go',function(arg){var q=attentionQueue().items.filter(function(i){return i.id===arg;})[0];if(!q)return;
  if(!q.act||q.act==='nav.tab'){openSheet('edit',{form:'attentionItem',title:q.what.split(':')[0],desc:'',buf:{id:q.id}});return;}
  closeSheet();if(q.tab)switchTab(q.tab);setTimeout(function(){dispatchAct(q.act,q.arg);},90);});
registerAction('attention.dismiss',function(id){DB.settings.attentionDismissed=Object.assign({},DB.settings.attentionDismissed||{});DB.settings.attentionDismissed[id]=todayISO();save('settings');closeSheet();renderAll();toast('Done',{undo:false});});
registerAction('attention.show',function(id){var q=attentionQueue().items.filter(function(i){return i.id===id;})[0];closeSheet();if(!q)return;if(q.tab)switchTab(q.tab);
  if(q.section)setTimeout(function(){var el=document.getElementById(q.section)||document.querySelector('[data-fold="'+q.section+'"]');if(el){if(el.tagName==='DETAILS')el.open=true;el.scrollIntoView({block:'start'});}},120);});
SHEETS.attentionItem=function(b){var q=attentionQueue().items.filter(function(i){return i.id===b.id;})[0];if(!q)return {body:'<div class="hint">This has been dealt with.</div>',foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};
  var out='<p>'+esc(q.what)+'</p>'+(q.why?'<div class="hint">'+esc(q.why)+'</div>':'');
  if(q.detail&&q.detail.length)out+='<div class="card-title" style="margin-top:10px">What changed</div>'+q.detail.map(function(d){return uiRow(esc(d.what),esc(d.to!=null?String(d.to):''),{sub:esc(d.from!=null?'was '+d.from:(d.why||''))});}).join('');
  return {body:out,foot:'<button class="btn btn-ghost" data-act="attention.snooze" data-arg="'+attrEsc(q.id)+'">Later</button>'+(q.tab?'<button class="btn btn-secondary" data-act="attention.show" data-arg="'+attrEsc(q.id)+'">Show me</button>':'')+'<button class="btn btn-primary" data-act="attention.dismiss" data-arg="'+attrEsc(q.id)+'">Done</button>'};};
registerAction('timeline.filter',function(arg){_TIMELINE_KIND=(_TIMELINE_KIND===arg?null:arg);renderSheet();});

/* ---- navigation sheets. Each is a sheet, so it inherits the focus trap, Escape handling and focus return. ---- */
var _TIMELINE_KIND=null;
function openAttention(){openSheet('edit',{form:'attention',title:'Attention',desc:'Every item answers three questions: what happened, why it matters, and what can be done.',buf:{q:attentionQueue()}});}
SHEETS.attention=function(b){var q=b.q;
  if(!q.items.length)return {body:uiEmpty('Nothing needs attention','No overdue forecasts, unevaluated experiments, data-quality problems or system issues.',''),foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};
  return {body:q.items.map(function(i){
    return '<div class="list-item"><div class="li-head"><div class="li-title">'+esc(i.what)+'</div><div class="li-meta">'+uiPill(i.severity,i.severity==='safety'?'negative':i.severity==='action'?'attention':(i.severity==='system'?'negative':'neutral'))+'</div></div>'+
      '<div class="li-body"><div class="muted">'+esc(i.why)+'</div><div class="btn-row">'+(i.cando?uiBtn(i.cando,'attention.go',i.id,'btn-sm btn-primary'):'')+
        (i.canSnooze!==false?uiBtn('Not now','attention.snooze',i.id,'btn-sm btn-ghost'):'<span class="hint">Snoozed three times \u2014 it stays for a day now</span>')+uiBtn('Done','attention.dismiss',i.id,'btn-sm btn-ghost')+'</div></div></div>';}).join('')+
      ((q.snoozed||[]).length?'<div class="hint" style="margin-top:8px">'+q.snoozed.length+' snoozed \u2014 they come back on their own.</div>':''),
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openTimeline(){_TIMELINE_KIND=null;openSheet('edit',{form:'timeline',title:'Timeline',desc:'Observation \u2192 decision \u2192 intervention \u2192 prediction \u2192 outcome \u2192 calibration. Every event links to the record it came from.',buf:{}});}
SHEETS.timeline=function(){var t=timeline({days:90,kinds:_TIMELINE_KIND?[_TIMELINE_KIND]:null});
  var chips='<div class="sym-grid">'+t.kinds.map(function(k){return '<button class="chip sm'+(_TIMELINE_KIND===k?' active':'')+'" data-act="timeline.filter" data-arg="'+k+'" aria-pressed="'+(_TIMELINE_KIND===k)+'">'+k+'</button>';}).join('')+'</div>';
  return {body:chips+(t.events.length?t.events.map(function(e){
    return '<div class="tl-row"'+(e.act?' data-act="'+e.act+'" data-arg="'+attrEsc(String(e.arg||''))+'" role="button" tabindex="0"':'')+'><div class="tl-when">'+shortDate(e.date)+'</div><div class="tl-what"><div class="tl-kind">'+esc(e.kind)+'</div><div class="tl-label">'+esc(e.label)+'</div>'+(e.detail?'<div class="tl-detail">'+esc(String(e.detail).slice(0,160))+'</div>':'')+'</div></div>';
  }).join(''):uiEmpty('No events in the last 90 days','Decisions, interventions, experiments and change points appear here as they happen.','')),
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openMissing(){openSheet('edit',{form:'missing',title:'What data is missing',desc:'An unlogged day is unknown, not zero. Each row says what the gap limits and what closes it.',buf:{}});}
SHEETS.missing=function(){var m=missingDataReport();
  return {body:m.rows.map(function(r){var pct=Math.round(100*r.have/Math.max(1,r.of));
    return uiRow(esc(r.label),'<strong>'+r.have+' / '+r.of+'</strong>',{sub:'limits '+esc(r.limits),rsub:pct+'%',tone:pct>=80?'good':(pct>=50?'attention':'negative')})+
      '<div class="btn-row" style="margin:-4px 0 10px 0">'+uiBtn(r.action.label,r.action.act,r.action.arg||'','btn-sm btn-ghost')+(r.missingDays.length?'<span class="muted" style="font-size:11px">missing '+r.missingDays.slice(0,6).map(shortDate).join(', ')+(r.missingDays.length>6?'\u2026':'')+'</span>':'')+'</div>';
    }).join('')+'<div class="prov">'+esc(m.note)+'</div>',
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openDataQuality(){openSheet('edit',{form:'dataQuality',title:'Data quality',desc:'Every item links to the record it concerns.',buf:{}});}
SHEETS.dataQuality=function(){var d=dataQualityReport();
  if(!d.groups.length)return {body:uiEmpty('No data-quality issues','No anomalies, flagged entries, low-quality measurements or stale streams.',''),foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};
  return {body:d.groups.map(function(g){return '<div class="card-title" style="margin-top:10px">'+esc(g.kind)+' <span class="muted">'+g.count+'</span></div>'+
    g.items.map(function(i){return uiRow(esc((OBS_TYPES[i.type]||{}).label||i.type)+(i.date?(' \u00b7 '+shortDate(i.date)):''),uiBtn('Open',i.act,i.arg||'','btn-sm btn-ghost'),{sub:esc(String(i.detail||''))});}).join('');}).join(''),
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
var _VOICE=null,_LABEL=null;
function openCloud(){openSheet('edit',{form:'cloud',title:'Encrypted sync',desc:'The server stores ciphertext it cannot read. Your recovery phrase never leaves this device, and there is no way to recover it.',buf:{}});}
SHEETS.cloud=function(){var c=cloudState();
  return {body:uiRow('Status',esc(c.status),{sub:c.configured?('vault '+esc(String(c.vaultId).slice(0,10))+'\u2026'):'no vault on this device'})+
    uiRow('Server',esc(c.url),{sub:'run server/server.mjs, or point this at your own \u2014 it holds ciphertext only'})+
    uiRow('Local events',fmtNum(c.localEvents,0),{sub:c.pushedCount+' already uploaded \u00b7 last sync '+(c.lastSyncAt?ageLabel(localDateOf(c.lastSyncAt)):'never')})+
    '<div class="btn-row">'+
      (c.configured?uiBtn('Sync now','cloud.sync',null,'btn-sm btn-primary'):uiBtn('Create a vault','cloud.create',null,'btn-sm btn-primary'))+
      uiBtn('Unlock an existing vault','cloud.unlock',null,'btn-sm btn-secondary')+
      uiBtn('Authorise this device','cloud.addDevice',null,'btn-sm btn-ghost')+
      uiBtn('Enable push reminders','cloud.push',null,'btn-sm btn-ghost')+
    '</div>'+
    '<div class="btn-row">'+uiBtn('Stop syncing here','cloud.disable',null,'btn-sm btn-ghost')+uiBtn('Delete the vault','cloud.delete',null,'btn-sm btn-danger')+'</div>'+
    '<div class="prov">'+esc(c.note)+' A second device joining must be authorised from one already signed in, so a stolen phrase alone cannot silently join.</div>',
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openVoice(){stopVoiceCapture();_VOICE=null;openSheet('edit',{form:'voice',title:'Say it',desc:'Everything dictated is shown for confirmation before it reaches the record. Recognition mishears, and a misheard number that lands unseen is a silent corruption.',buf:{}});}
SHEETS.voice=function(b){
  var V=_VOICE||{},ph=V.phase,live=ph==='starting'||ph==='listening'||ph==='hearing';
  var body=voiceAvailable()?
    ('<div class="btn-row">'+uiBtn(live?'Stop':'Start listening','voice.start',null,'btn-sm '+(live?'btn-secondary':'btn-primary'))+'</div>'):
    '<div class="hint warn">This browser has no speech recognition. Type it below instead.</div>';
  /* every stage shows: nothing happens silently */
  if(ph==='starting')body+='<div class="voice-state">Starting the microphone\u2026</div>';
  if(ph==='listening')body+='<div class="voice-state live">Listening \u2014 speak now</div>';
  if(ph==='hearing')body+='<div class="voice-state live">Hearing: <b>'+esc(V.interim||'\u2026')+'</b></div>';
  if(ph==='error'||ph==='ended')body+='<div class="banner attention"><span class="banner-text">'+esc(V.reason||'Listening ended.')+'</span>'+(voiceAvailable()?uiBtn('Try again','voice.start',null,'btn-sm btn-secondary'):'')+'</div>';
  if(V.ok){
    body+=uiRow(V.typed?'Typed':'Heard',esc(V.transcript),{sub:V.alternatives&&V.alternatives.length>1?('also considered: '+esc(V.alternatives.slice(1).join('; '))):''})+
      uiRow('Understood as',esc(V.say||''),{sub:V.intent==='food'?('unit '+esc(String(V.unit||'serving'))+(V.meal?(' \u00b7 '+esc(V.meal)):'')):esc(String(V.type||''))})+
      (V.note?'<div class="hint warn">'+esc(V.note)+'</div>':'')+
      '<div class="btn-row">'+uiBtn('Log it','voice.apply',null,'btn-sm btn-primary')+uiBtn('Discard','voice.discard',null,'btn-sm btn-ghost')+'</div>';
  }else if(V.transcript){
    body+=uiRow(V.typed?'Typed':'Heard',esc(V.transcript),{sub:'not understood'+(V.reason?(' \u2014 '+esc(V.reason)):'')})+
      '<div class="prov">Try: '+(V.examples||['weight 182.4','protein 30 grams','2 eggs for breakfast','slept 7 hours']).map(esc).join(' \u00b7 ')+'</div>';
  }
  body+='<label class="fld" style="margin-top:10px"><span>Or type it</span><input id="voiceTyped" type="text" autocomplete="off" value="'+attrEsc((b&&b.typed)||'')+'" placeholder="e.g. weight 182.4" data-act="voice.typed" data-ev="input"></label>'+
    uiBtn('Understand this','voice.parseTyped',null,'btn-sm btn-secondary');
  return {body:body+'<div class="prov">Dictation produces a proposal, never a record. Nothing here writes until you confirm it.'+(voiceAvailable()?' In Chrome, speech is recognised by Google\u2019s speech service, so it needs an internet connection.':'')+'</div>',
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
var _YIELDS=null,_YIELD_Q='',_YIELD_RAW='',_YIELD_RESULT=null;
var _EVENT_CHECK=null;
function openReplayWaypoints(){openSheet('edit',{form:'waypoints',title:'Jump to a moment',
  desc:'The days when something was decided, changed or detected. Scrubbing day by day through unremarkable data is not how anyone looks for the moment something moved.',buf:{}});}
SHEETS.waypoints=function(){
  var pts=replayWaypoints(40);
  if(!pts.length)return {body:uiEmpty('No notable days yet','Interventions, phase changes, experiments and detected shifts appear here.',''),
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};
  return {body:pts.map(function(p){
    return uiRow(esc(p.label),shortDate(p.date),{sub:esc(p.kind),
      rsub:'',tone:p.kind==='changepoint'?'attention':''})+
      '<div class="btn-row" style="margin:-6px 0 8px 0">'+uiBtn('Replay this day','replay.goto',p.date,'btn-sm btn-ghost')+'</div>';
  }).join(''),foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openReplayCompare(){
  var d=replayActive()?replayMode().date:addDays(todayISO(),-14);
  openSheet('edit',{form:'replayCompare',title:'Then and now',desc:'',buf:{date:d}});}
SHEETS.replayCompare=function(b){
  var c=replayComparison(b.date);
  var row=function(label,then,now){return uiRow(label,'<strong>'+esc(then)+'</strong>',{sub:'now '+esc(now)});};
  var body=uiRow('Replaying',longDate(c.date),{sub:c.daysAgo+' days ago \u00b7 '+c.then.observations+' observations were on record then, '+c.now.observations+' are now'})+
    row('Weight',c.then.weight!=null?fmtWeight(c.then.weight):'\u2014',c.now.weight!=null?fmtWeight(c.now.weight):'\u2014')+
    row('Trend',c.then.trend!=null?fmtRate(c.then.trend):'not established',c.now.trend!=null?fmtRate(c.now.trend):'not established')+
    row('Maintenance',c.then.tdee!=null?(fmtKcal(c.then.tdee)+' '+esc(c.then.tdeeCls||'')):'not estimated',c.now.tdee!=null?(fmtKcal(c.now.tdee)+' '+esc(c.now.tdeeCls||'')):'not estimated')+
    row('Data trust',esc(c.then.trust||'\u2014'),esc(c.now.trust||'\u2014'));
  if(c.then.decision)body+='<div class="d-block"><div class="d-block-title">WHAT IT WOULD HAVE DECIDED</div>'+
    '<div class="lead" style="font-size:13px">'+esc(c.then.decision.verb||c.then.decision.code)+'</div>'+
    '<div class="muted">'+esc(c.then.decision.lede||'')+'</div>'+
    '<div class="prov">confidence '+esc(String(c.then.decision.confidence||'\u2014'))+
      (c.then.decision.uncertainty?(' \u00b7 numbers carried '+esc(c.then.decision.uncertainty)+' confidence'):'')+
      (c.recorded?(' \u00b7 recorded that day: '+esc(c.recorded.verb||c.recorded.code)+(c.matchesRecorded===false?' (the rules have changed since)':'')):'')+'</div></div>';
  if(c.after)body+='<div class="d-block"><div class="d-block-title">WHAT ACTUALLY HAPPENED NEXT</div>'+
    uiRow('Fortnight after',fmtRate(c.after.actualRate),{sub:esc(c.verdict||'')})+'</div>';
  else body+='<div class="hint">Not enough time has passed since that day to judge what followed it.</div>';
  return {body:body+'<div class="prov">'+esc(c.note)+'</div>',
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'+
      (replayActive()?'':'<button class="btn btn-primary" data-act="replay.enter" data-arg="'+attrEsc(c.date)+'">Replay this day</button>')};};
function openTrace(id){
  openSheet('edit',{form:'trace',title:'Where this number comes from',
    desc:'The same call the view made, walked step by step. An explanation that recomputed with different rules could disagree with the thing it explains.',buf:{id:id}});}
SHEETS.trace=function(b){
  var t=traceValue(b.id);
  if(t.status==='unknown'||t.status==='error')
    return {body:'<div class="hint warn">'+esc(t.note||'no trace available')+'</div>',
      foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};
  if(t.status==='insufficient')
    return {body:uiRow(esc(t.label),'not established',{sub:esc(t.why||'')})+
      '<div class="d-block"><div class="d-block-title">WHAT IT NEEDS</div><ul>'+
      (t.need||[]).map(function(n){return '<li>'+esc(n)+'</li>';}).join('')+'</ul></div>'+
      '<div class="prov">Reporting what is missing is the honest form of this answer. A number produced anyway would be a guess wearing the same typography as a measurement.</div>',
      foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};
  var body=uiRow(esc(t.label),'<strong>'+t.value+'</strong>',{sub:clsMark(t.cls)+' \u00b7 '+esc((CLASSES[t.cls]||''))});
  if(t.restsOnPrior)body+='<div class="hint warn">This rests on a population assumption at: '+t.restsOnPrior.map(esc).join(', ')+'. It is not measured from you.</div>';
  body+='<div class="trace-chain">'+t.steps.map(function(s,i){
    return '<div class="tc-step">'+
      '<div class="tc-rail"><span class="tc-dot"></span>'+(i<t.steps.length-1?'<span class="tc-line"></span>':'')+'</div>'+
      '<div class="tc-body"><div class="tc-head"><span class="tc-name">'+esc(s.step)+'</span>'+clsMark(s.cls)+'</div>'+
      '<div class="tc-value">'+s.value+'</div>'+
      (s.detail?'<div class="tc-detail">'+esc(s.detail)+'</div>':'')+
      ((s.trace||s.act)?('<div class="btn-row">'+(s.trace?uiBtn('Trace this too','trace.open',s.trace,'btn-sm btn-ghost'):'')+
        (s.act?uiBtn('Open','' + s.act,null,'btn-sm btn-ghost'):'')+'</div>'):'')+
      '</div></div>';
  }).join('')+'</div>';
  if(t.wouldChange&&t.wouldChange.length)body+='<div class="d-block"><div class="d-block-title">WHAT WOULD CHANGE IT</div><ul>'+
    t.wouldChange.map(function(x){return '<li class="attention">'+esc(x)+'</li>';}).join('')+'</ul></div>';
  if(t.model)body+=renderWhy(t.model.id);
  /* Presentation provenance is attached to the existing trace surface; no second inspector is created. */
  if(typeof inspectPresentation==='function'&&typeof presentationProvenance==='function'){
    var _ip=inspectPresentation({label:t.label,source:t.source||null,data:t.value,model:t.model||null,uncertainty:t.uncertainty||null,assumptions:t.assumptions||[],contract:t.presentationContract||null});
    var _pp=presentationProvenance({semantic:t.cls||null,modelContract:t.model&&t.model.id?t.model.id:null,themeToken:'color.'+String((t.cls||'neutral')).toLowerCase(),theme:(DB.settings&&DB.settings.theme)||'dark',skin:(DB.settings&&DB.settings.shape)||'soft',renderer:'trace'});
    body+='<div class="divider"></div><div class="d-block"><div class="d-block-title">PRESENTATION PROVENANCE</div>'+uiRow('Semantic class',esc(String(_pp.semantic||'—')),{sub:'visual state carried from the trace result'})+uiRow('Theme / skin',esc(String(_pp.theme||'—'))+' / '+esc(String(_pp.skin||'—')),{sub:'presentation only'})+uiRow('Renderer',esc(String(_pp.renderer||'—')),{sub:_ip.contract?'contract '+esc(String(_ip.contract)):'no explicit chart contract'})+'</div>';
  }
  body+='<div class="btn-row">'+uiBtn('Copy this trace','copy.trace',b.id,'btn-sm btn-ghost')+'</div>';
  return {body:body,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openSaved(){openSheet('edit',{form:'saved',title:'Saved searches',
  desc:'A saved search stores the query, never its results, so it re-runs each time and cannot show you the record as it was when you saved it.',buf:{}});}
SHEETS.saved=function(){
  var list=savedSearchSummary();
  if(!list.length)return {body:uiEmpty('No saved searches','Run a search from the palette and save it there. Useful ones: low-confidence observations, everything in this phase, a food you eat often.',
    uiBtn('Open search','search.open',null,'btn-sm btn-primary')),
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};
  return {body:list.map(function(s){
    return uiRow(esc(s.name),(s.count!=null?(s.count+' now'):'\u2014'),
      {sub:'<span class="mono">'+esc(s.query)+'</span>'+(s.note?(' \u00b7 '+esc(s.note)):'')})+
      '<div class="btn-row" style="margin:-6px 0 8px 0">'+uiBtn('Run','saved.run',s.id,'btn-sm btn-ghost')+
      uiBtn('Remove','saved.remove',s.id,'btn-sm btn-ghost')+'</div>';}).join(''),
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openRecent(){openSheet('edit',{form:'recent',title:'Recent',desc:'The last things recorded, newest first.',buf:{}});}
SHEETS.recent=function(){
  var r=recentRecords(15);
  if(!r.length)return {body:uiEmpty('Nothing recorded yet','Entries appear here as you log them.',''),
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};
  return {body:r.map(function(x){return uiRow(esc(x.label),shortDate(x.date),
    {sub:esc(x.kind)+' \u00b7 recorded '+(x.at?ageLabel(localDateOf(x.at)):'\u2014'),
     rsub:''});}).join(''),foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openJumps(){openSheet('edit',{form:'jumps',title:'Take me to\u2026',desc:'The places worth returning to, rather than a calendar.',buf:{}});}
SHEETS.jumps=function(){
  var t=jumpTargets();
  if(!t.length)return {body:uiEmpty('Nothing to jump to yet','Plan changes, forecasts and detected shifts appear here.',''),
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};
  return {body:t.map(function(x){return uiRow(esc(x.label),uiBtn('Go','jump.go',x.id,'btn-sm btn-ghost'),
    {sub:esc(String(x.detail||'').slice(0,110))});}).join(''),
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openChangedSince(){openSheet('edit',{form:'since',title:'What changed since yesterday',desc:'What you recorded, and what the system did with it.',buf:{}});}
SHEETS.since=function(){
  var c=changedSince(1);
  if(c.nothing)return {body:uiEmpty('Nothing changed',esc(c.note),uiBtn('Look back a week','nav.day',addDays(todayISO(),-7),'btn-sm btn-ghost')),
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};
  return {body:(c.logged.length?('<div class="card-title">You recorded</div>'+c.logged.map(function(x){
      return uiRow(esc(x.label),shortDate(x.date),{});}).join('')):'')+
    (c.system.length?('<div class="card-title" style="margin-top:10px">The system changed</div>'+c.system.map(function(x){
      return uiRow(esc(x.label),esc(x.kind),{sub:esc(String(x.detail||'').slice(0,110))});}).join('')):'')+
    '<div class="prov">'+esc(c.note)+'</div>',
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
SHEETS.whyShown=function(b){var w=b.w;
  return {body:uiRow('What',esc(w.what),{})+uiRow('Why it is here',esc(w.because),{})+
    uiRow('If you ignore it',esc(w.ifIgnored),{})+
    '<div class="btn-row">'+uiBtn(w.todo||'Open','' + (w.act||'edit.close'),w.arg||'','btn-sm btn-primary')+'</div>',
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openCompare(){openSheet('edit',{form:'compare',title:'Compare',desc:'Every comparison states what it is comparing, and refuses when the two sides are not comparable.',buf:{}});}
SHEETS.compare=function(){
  var po=comparePredictionOutcome(8);
  var ph=comparePhases();
  var body='<div class="card-title">Forecast against outcome</div>';
  if(po.status!=='ok')body+='<div class="hint">'+esc(po.note)+'</div>';
  else{
    body+=uiRow('Coverage',po.coverage+'%',{sub:'how often the actual value fell inside the stated range',
      rsub:po.bias!=null?('bias '+fmtSigned(po.bias,2)):''})+
      po.rows.slice(0,6).map(function(r){
        return uiRow(shortDate(r.due),fmtWeight(r.actual)+' vs '+fmtWeight(r.predicted),
          {sub:(r.covered?'inside the range':'outside the range')+' \u00b7 '+esc(r.context),
           tone:r.covered?'good':'attention'});}).join('')+
      '<div class="prov">'+esc(po.note)+'</div>';
  }
  body+='<div class="card-title" style="margin-top:12px">Phases</div>'+
    ph.rows.map(function(r){return uiRow(esc(r.label)+(r.active?' (running)':''),
      r.rate!=null?fmtRate(r.rate):'not established',
      {sub:r.weeks+' weeks \u00b7 '+(r.startWeight!=null?fmtWeight(r.startWeight,{bare:true})+'\u2192'+fmtWeight(r.endWeight):'')+
        ' \u00b7 '+r.n+' weigh-ins'});}).join('')+
    '<div class="prov">'+esc(ph.note)+'</div>';
  var ivs=(DB.interventions||[]).filter(function(i){return _knownBy(i,asOf());}).slice(-4).reverse();
  if(ivs.length){
    body+='<div class="card-title" style="margin-top:12px">Before and after a change</div>';
    ivs.forEach(function(iv){
      var c=compareIntervention(iv.id);
      if(!c)return;
      body+=uiRow(esc(iv.variable+(iv.from!=null?(' '+iv.from+' \u2192 '+iv.to):'')),
        (c.before.rate!=null?fmtRate(c.before.rate):'\u2014')+' \u2192 '+(c.after.rate!=null?fmtRate(c.after.rate):'\u2014'),
        {sub:c.analysis?esc(c.analysis.verdict):'not enough data either side to judge',
         rsub:shortDate(iv.date)});
    });
    body+='<div class="prov">Before-and-after is a comparison, not a cause.</div>';
  }
  return {body:body,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
var _GEN_PROGRAMS=null,_MEAL_PLAN=null;
function openPropagation(){openSheet('edit',{form:'propagation',title:'Where training lands',
  desc:'What the exercise ontology actually implies, propagated: mechanical demand, where it lands, four fatigue compartments that clear at different rates, and what each lift gives against what it costs.',buf:{}});}
SHEETS.propagation=function(){
  var f=fatigueCompartments(14);
  var rk=recoveryCostRanking(56);
  var body='';
  if(f.status==='ok'){
    body+=uiRow('Systemic',String(f.systemic),{sub:esc(FATIGUE_COMPARTMENTS.systemic.note),rsub:clsMark(f.cls)})+
      uiRow('Neural',String(f.neural),{sub:esc(FATIGUE_COMPARTMENTS.neural.note)})+
      '<div class="card-title" style="margin-top:10px">Local, by muscle</div>'+
      f.highestLocal.map(function(x){return uiRow(esc(x.muscle),String(x.load),
        {sub:'clears in about '+FATIGUE_COMPARTMENTS.local.halfLifeDays+' days'});}).join('')+
      '<div class="card-title" style="margin-top:10px">Connective, by joint</div>'+
      f.highestConnective.map(function(x){return uiRow(esc(x.joint),String(x.load),
        {sub:'clears in about '+FATIGUE_COMPARTMENTS.connective.halfLifeDays+' days \u2014 the slowest, and the one people ignore'});}).join('')+
      uiRow('Input actually recorded',f.effortCoverage+'% effort, '+f.tempoCoverage+'% tempo',
        {sub:esc(f.caveat),tone:f.tempoCoverage<50?'attention':''})+
      '<div class="prov">'+esc(f.note)+'</div>';
  }else body+=uiLocked('Fatigue compartments',f.need||[],{why:f.note});
  if(rk.rows.length){
    body+='<div class="card-title" style="margin-top:12px">Stimulus against cost</div>'+
      rk.rows.slice(0,8).map(function(r){
        return uiRow(esc(r.exercise),String(r.ratio)+'\u00d7',
          {sub:'stimulus '+r.stimulusIndex+' \u00b7 cost '+r.recoveryCost+' \u00b7 '+esc(r.verdict||''),
           tone:r.ratio>=1.2?'good':(r.ratio<0.8?'attention':'')});}).join('')+
      '<div class="prov">'+esc(rk.note)+'</div><div class="hint">'+esc(rk.rows[0].caveat)+'</div>';
  }
  return {body:body,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openResistance(){openSheet('edit',{form:'resistance',title:'Resistance',
  desc:'Volume, fatigue and progression from the sets you logged. Almost everything here is derived from three numbers you typed, so each carries the class that reflects that.',buf:{}});}
SHEETS.resistance=function(){
  var es=effectiveSets(7),f=resistanceFatigue(7),cc=curveCoverage(28);
  var body=uiRow('Effective sets, 7 days',es.rows.length+' muscles',
    {sub:esc(es.confidence)+' confidence'+(es.caveat?(' \u00b7 '+esc(es.caveat)):''),rsub:clsMark(es.cls)})+
    es.rows.slice(0,8).map(function(r){
      return uiRow(esc(r.muscle),r.effective+' effective',
        {sub:r.direct+' direct \u00b7 '+r.indirect+' indirect \u00b7 '+r.raw+' raw'});}).join('')+
    '<div class="prov">'+esc(es.note)+'</div>';
  body+='<div class="card-title" style="margin-top:12px">Exposure this week</div>'+
    uiRow('Systemic',String(f.systemic),{sub:'from compound lifts',rsub:clsMark(f.cls)})+
    f.highest.map(function(h){return uiRow(esc(h.muscle),String(h.load),{sub:'local exposure'});}).join('')+
    '<div class="prov">'+esc(f.note)+'</div>';
  var imbal=cc.rows.filter(function(r){return r.onlyShortened;});
  if(imbal.length)body+='<div class="card-title" style="margin-top:12px">Loading position</div>'+
    imbal.map(function(r){return uiRow(esc(r.muscle),'shortened only',{sub:esc(r.note),tone:'attention'});}).join('')+
    '<div class="prov">'+esc(cc.note)+'</div>';
  var lifts={};
  sessionsOf({from:addDays(asOf(),-28)}).forEach(function(s2){(s2.sets||[]).forEach(function(st){
    if(st.exercise&&SET_KINDS[setKind(st)].volume)lifts[st.exercise]=(lifts[st.exercise]||0)+1;});});
  var top=Object.keys(lifts).sort(function(a2,b2){return lifts[b2]-lifts[a2];}).slice(0,8);
  if(top.length)body+='<div class="card-title" style="margin-top:12px">Lifts</div>'+
    top.map(function(n){var rm=repMax(n,1);
      return uiRow(esc(n),rm.status==='ok'?(fmtNum(rm.estimate,0)+' e1RM'):'\u2014',
        {sub:lifts[n]+' working sets in 28 days',rsub:uiBtn('Detail','res.exercise',n,'btn-sm btn-ghost')});}).join('');
  return {body:body,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openExerciseDetail(name){openSheet('edit',{form:'exerciseDetail',title:esc(name),desc:'',buf:{name:name}});}
SHEETS.exerciseDetail=function(b){
  var n=b.name;
  var bio=exerciseBiomechanics(n),rp=resistanceProfile(n),pr=progressionFor(n),sn=strengthNormalised(n);
  var body='';
  if(bio.status==='ok')body+=uiRow('How it loads',esc(rp.label),
    {sub:esc(rp.meaning)+' \u00b7 hardest at '+esc(rp.hardestAt)+' \u00b7 from '+esc(rp.source),rsub:clsMark(bio.cls)})+
    uiRow('Plane and joints',esc(bio.plane)+' \u00b7 '+(bio.joints||[]).map(esc).join(', '),
      {sub:'sticking region: '+esc(bio.sticking||'\u2014')+(bio.implementNote?(' \u00b7 '+esc(bio.implementNote)):'')});
  [1,5,10].forEach(function(k){var rm=repMax(n,k);
    if(rm.status==='ok')body+=uiRow(k+'RM',fmtNum(rm.estimate,0),
      {sub:fmtNum(rm.lo,0)+'\u2013'+fmtNum(rm.hi,0)+' \u00b7 from '+rm.sets+' working sets',rsub:clsMark(rm.cls)});});
  if(sn&&sn.status==='ok'&&sn.perBodyweight!=null)
    body+=uiRow('Relative to bodyweight',sn.perBodyweight+'\u00d7',{sub:esc(sn.note)});
  if(pr.status==='ok')body+='<div class="d-block"><div class="d-block-title">NEXT SESSION</div>'+
    uiRow(esc(pr.schemeLabel),esc(pr.recommendation.change)+(pr.recommendation.by?(' '+pr.recommendation.by+pr.recommendation.unit):''),
      {sub:esc(pr.recommendation.why)})+
    '<div class="prov">Scheme chosen because '+esc(pr.schemeWhy)+'. '+esc(pr.note)+'</div></div>';
  else body+=uiLocked('Progression',pr.need||[],{why:pr.note});
  body+='<div class="hint">'+esc(bio.note||'')+'</div>';
  return {body:body,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openPrepare(){openSheet('edit',{form:'prepare',title:'Prepare',
  desc:'Built from today\u2019s session, what is sore, and how you have been feeling. A warm-up that is the same every day is a ritual rather than preparation.',buf:{}});}
SHEETS.prepare=function(){
  var p=prepareSession();
  if(p.status!=='ok')return {body:'<div class="hint">'+esc(p.note)+'</div>',
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};
  return {body:uiRow(esc(p.session),p.minutes+' minutes',
      {sub:p.adapted?('adapted today: '+(p.reasons.length?p.reasons.join('; '):'readiness or a sore area')):'nothing today warrants more than the short version'})+
    p.blocks.map(function(b){
      return uiRow(esc(b.label),String(b.minutes)+'m',{sub:esc(b.reason),rsub:esc((MOVEMENT_ROLES[b.role]||{}).label||b.role)})+
        (b.ramp&&b.ramp.steps?('<div class="prov" style="margin:-4px 0 8px 0">'+
          b.ramp.steps.map(function(s2){return s2.load?(s2.load+'\u00d7'+s2.reps):(s2.pct+'%\u00d7'+s2.reps);}).join('  \u00b7  ')+
          ' \u2014 '+esc(b.ramp.note)+'</div>'):'')+
        (b.movementId?('<div class="btn-row" style="margin:-4px 0 8px 0">'+uiBtn('Log it','move.log',b.movementId,'btn-sm btn-ghost')+'</div>'):'');
    }).join('')+
    '<div class="prov">'+esc(p.note)+'</div><div class="hint">'+esc(p.caveat)+'</div>',
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openRecover(){openSheet('edit',{form:'recover',title:'After the session',
  desc:'Cool-downs have a better case for how you feel than for what your body does. This separates the two.',buf:{}});}
SHEETS.recover=function(){
  var r=recoverSession();
  return {body:r.blocks.map(function(b){
      return uiRow(esc(b.label),String(b.minutes)+'m',{sub:esc(b.reason)})+
        (b.movementId?('<div class="btn-row" style="margin:-4px 0 8px 0">'+uiBtn('Log it','move.log',b.movementId,'btn-sm btn-ghost')+'</div>'):'');}).join('')+
    (r.skip.length?('<div class="card-title" style="margin-top:10px">Not suggested today</div>'+
      r.skip.map(function(s2){return uiRow(esc(s2.what),'skip',{sub:esc(s2.why)});}).join('')):'')+
    '<div class="prov">'+esc(r.note)+'</div><div class="hint">'+esc(r.caveat)+'</div>',
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openEquipment(){openSheet('edit',{form:'equipment',title:'Equipment and supplies',
  desc:'Individual items rather than a setup: what wears out, what needs servicing, and what runs out or expires.',buf:{}});}
SHEETS.equipment=function(){
  var el=equipmentLifecycle(),il=inventoryLifecycle();
  var body='';
  if(el.status==='ok'){
    body+=el.rows.map(function(r){
      return uiRow(esc(r.item.label),r.ageYears+'y',
        {sub:esc(r.condition)+(r.lifeUsedPct!=null?(' \u00b7 '+r.lifeUsedPct+'% of expected life'):'')+
          ' \u00b7 '+r.usesLast90+' sets in 90 days'+(r.costPerUse?(' \u00b7 '+fmtNum(r.costPerUse,2)+' per use'):''),
         rsub:uiBtn('Retire','eq.retire',r.item.id,'btn-sm btn-ghost'),
         tone:r.serviceDue?'attention':(r.usable?'':'negative')})+
        (r.serviceDue?'<div class="hint warn">Service is due.</div>':'');}).join('');
  }else body+=uiLocked('Equipment',el.need||[],{why:el.note});
  body+='<div class="card-title" style="margin-top:12px">Supplies</div>';
  if(il.status==='ok'){
    body+=il.rows.map(function(r){
      return uiRow(esc(r.item.label),(r.daysLeft!=null?(r.daysLeft+' days left'):'rate unknown'),
        {sub:(r.expiresInDays!=null?('expires in '+r.expiresInDays+' days \u00b7 '):'')+
          (r.reorderInDays!=null?('reorder in '+r.reorderInDays+' days'):'')+' \u00b7 '+esc(r.basis||''),
         tone:(r.expiringFirst||r.reorderNow)?'attention':''})+
        (r.expiringFirst?'<div class="hint warn">This expires before you will finish it \u2014 buying more is the wrong response.</div>':'');}).join('')+
      '<div class="prov">'+esc(il.note)+'</div>';
  }else body+=uiLocked('Supplies',il.need||[],{why:il.note});
  return {body:body,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openDeload(){openSheet('edit',{form:'deload',title:'Do you need an easier week?',
  desc:'A deload on a calendar is a rest week you may not need; one from a single bad day is a habit. This asks for several signals pointing the same way.',buf:{}});}
SHEETS.deload=function(){
  var d=deloadCheck();
  var rep=knowledgeReplication();
  var body=uiRow(d.recommend?'Yes':'Not yet',String(d.score),
    {sub:esc(d.verdict),rsub:clsMark(d.cls),tone:d.recommend?'attention':''})+
    (d.signals.length?d.signals.map(function(s){return uiRow(esc(s.signal),'',{sub:'weight '+s.weight});}).join(''):
      '<div class="hint good">No signal is elevated.</div>')+
    (d.protocol?('<div class="d-block"><div class="d-block-title">IF YOU TAKE ONE</div>'+
      uiRow('Load',esc(d.protocol.load),{sub:esc(d.protocol.why)})+
      uiRow('Duration',esc(d.protocol.duration),{})+'</div>'):'');
  body+=uiFold('deload-rep','What has replicated',rep.replicated+' of '+rep.rows.length,function(){
    return rep.rows.map(function(r){
      return uiRow(esc(r.variable),esc(r.status),{sub:esc(r.note),
        tone:r.contradicted?'attention':(r.replicated?'good':'')});}).join('')+
      '<div class="prov">'+esc(rep.note)+'</div>';});
  body+='<div class="prov">'+esc(d.note)+'</div>';
  return {body:body,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openInference(){openSheet('edit',{form:'inference',title:'What can be known',
  desc:'What this record can and cannot establish: which questions are answerable from observation, how much is missing and why, how far the models have been validated, and which estimator is actually winning.',buf:{}});}
SHEETS.inference=function(){
  var body='';
  /* 1. Which questions are answerable at all. */
  var QUESTIONS=[['calories','weight'],['steps','weight'],['sleep','hunger'],
    ['protein','leanMass'],['training','weight'],['cardio','weight']];
  body+='<div class="card-title">Questions you could answer</div>';
  QUESTIONS.forEach(function(q){
    var a2=null;try{a2=adjustmentSet(q[0],q[1]);}catch(e){}
    if(!a2||a2.status!=='ok')return;
    var blocked=null;
    try{
      var ps=propensityScoreModel(q[0],q[1]);
      if(ps.status==='covariate-not-tracked')blocked=ps.untracked.join(', ');
      else if(ps.status==='insufficient')blocked='not enough complete days yet';
    }catch(e){}
    body+=uiRow(esc(q[0]+' \u2192 '+q[1]),
      uiBtn('Detail','inf.question',q[0]+'>'+q[1],'btn-sm btn-ghost'),
      {sub:a2.identifiable?
        (blocked?('identifiable, but blocked by: '+esc(blocked)):'identifiable and estimable now'):
        'not identifiable from observation with the current graph',
       tone:a2.identifiable&&!blocked?'good':'attention'});
  });
  var cc=null;try{cc=causalCoverage();}catch(e){}
  if(cc)body+='<div class="prov">'+esc(cc.note)+'</div>'+
    uiRow('Graph variables recorded',cc.tracked+' of '+cc.nodes,
      {sub:'not tracked: '+esc(cc.untracked.slice(0,6).join(', '))});
  /* 2. What is missing, and whether that biases anything. */
  body+='<div class="card-title" style="margin-top:12px">What is missing</div>';
  ['weight','calories','sleep'].forEach(function(t){
    var m=null;try{m=missingnessMechanism(t);}catch(e){}
    if(!m)return;
    if(m.status==='complete'){body+=uiRow(esc((OBS_TYPES[t]||{}).label||t),'complete',{sub:'nothing missing'});return;}
    if(m.status!=='ok')return;
    body+=uiRow(esc((OBS_TYPES[t]||{}).label||t),m.coverage+'%',
      {sub:esc(m.mechanism)+' \u00b7 '+esc(m.implication).slice(0,110),
       tone:/MNAR/.test(m.mechanism)?'attention':''});
  });
  var ms=null;try{ms=mnarSensitivity('calories');}catch(e){}
  if(ms&&ms.status==='ok')body+=uiRow('If the missing days were different',
    ms.robust?'conclusion holds':'conclusion moves',
    {sub:esc(ms.verdict).slice(0,130),tone:ms.robust?'good':'attention'});
  /* 3. Which estimator is winning. */
  var bt=null;try{bt=backtestEstimators('tdee',{points:6});}catch(e){}
  if(bt&&bt.status==='ok'){
    body+='<div class="card-title" style="margin-top:12px">Which estimate to believe</div>'+
      bt.rows.map(function(r){
        return uiRow(esc(r.id),'error '+r.mae,
          {sub:esc(r.role)+' \u00b7 bias '+r.bias+' \u00b7 interval covered '+r.coverage+'% of the time'+
            (r.note?(' \u00b7 '+esc(r.note)):''),
           tone:r.id===bt.best?'good':''});}).join('')+
      '<div class="muted">'+esc(bt.recommendation)+'</div>'+
      (bt.baselineWins?('<div class="hint warn">'+esc(bt.baselineWins)+'</div>'):'')+
      '<div class="prov">'+esc(bt.note)+'</div>';
  }
  /* 4. How far anything has been validated. */
  var mt=null;try{mt=maturityReport();}catch(e){}
  if(mt)body+=uiFold('inf-maturity','How far this has been validated',
    mt.experimentallyValidated+' of '+mt.engines+' experimentally validated',function(){
      return Object.keys(mt.byGrade).map(function(g){
        return uiRow(esc(g.replace(/_/g,' ').toLowerCase()),String(mt.byGrade[g].length),
          {sub:esc(MATURITY[g].means)});}).join('')+
        (mt.caveat?('<div class="hint warn">'+esc(mt.caveat)+'</div>'):'');});
  return {body:body,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
SHEETS.identification=function(b){
  var a2=adjustmentSet(b.t,b.y);
  var body='';
  if(a2.status!=='ok')return {body:'<div class="hint">'+esc(a2.note||'unknown')+'</div>',
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};
  body+=uiRow('Identifiable from observation',a2.identifiable?'yes':'no',
    {sub:esc(a2.note),rsub:clsMark(a2.cls),tone:a2.identifiable?'good':'attention'});
  body+=uiRow('Adjust for',a2.adjustFor.length?esc(a2.adjustFor.join(', ')):'nothing',
    {sub:a2.backdoorPaths+' backdoor path(s) to block'});
  if(a2.warning)body+='<div class="hint warn">'+esc(a2.warning)+'</div>';
  var ps=null;try{ps=propensityScoreModel(b.t,b.y);}catch(e){}
  if(ps){
    if(ps.status==='ok'){
      body+=uiRow('Effect ('+esc(ps.estimand)+')',String(ps.ateEstimate),
        {sub:'unadjusted '+ps.naiveDifference+' \u00b7 effective sample '+ps.effectiveSampleSize+' days',
         rsub:clsMark(ps.cls)})+
        '<div class="muted">'+esc(ps.verdict)+'</div>'+
        '<div class="prov">'+esc(ps.estimandMeans)+'</div>';
    }else body+=uiLocked('Effect estimate',ps.need||[],{why:ps.note});
  }
  var dr=null;try{dr=doseResponse(b.t,b.y);}catch(e){}
  if(dr&&dr.status==='ok')body+=uiRow('Per unit of '+esc(b.t),String(dr.slopePerUnit),
    {sub:'over the range '+dr.doseRange.min+' to '+dr.doseRange.max+' \u00b7 '+dr.n+' days'});
  body+='<div class="hint">'+esc(a2.caveat)+'</div>';
  return {body:body,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
SHEETS.movement=function(){
  var body='<div class="card-title">Strength patterns</div><div class="btn-row mv-pick">'+
    Object.keys(MOVEMENT_PATTERNS).map(function(p){
      return uiBtn(p,'mv.pick','pattern|'+p,'btn-sm '+(_MV.kind==='pattern'&&_MV.id===p?'btn-primary':'btn-ghost'));}).join('')+'</div>'+
    '<div class="card-title" style="margin-top:8px">Mobility</div><div class="btn-row mv-pick">'+
    Object.keys(POSES).map(function(p){
      return uiBtn(POSES[p].label,'mv.pick','pose|'+p,'btn-sm '+(_MV.kind==='pose'&&_MV.id===p?'btn-primary':'btn-ghost'));}).join('')+'</div>';
  if(_MV.kind==='pose'){
    var pm=poseModel(_MV.id);
    body+='<div class="sk-wrap">'+renderPose(pm)+'</div>';
    if(pm.status==='ok')body+=uiRow('Works',esc(pm.joints.map(function(j){return (JOINTS[j]&&JOINTS[j].label)||j;}).join(', ')),
        {sub:'regions '+esc(pm.targetRegions.join(', '))+(pm.intensity!=null?(' \u00b7 range demand '+Math.round(pm.intensity*100)+'%'):'')})+
      (pm.regressions.length?uiRow('Easier',esc(pm.regressions.join(', '))):'')+
      '<div class="prov">'+esc(pm.note)+'</div>';
  }else{
    var ex=(EXERCISES||[]).filter(function(e){return e.pattern===_MV.id;}).map(function(e){return e.name;});
    var mm=movementModel(_MV.id,{exercise:ex[0]||null});
    body+='<div class="sk-wrap">'+renderMovement(mm)+'</div>';
    if(mm.status==='ok')body+=uiRow('Primary joint',esc((JOINTS[mm.primary]&&JOINTS[mm.primary].label)||mm.primary),
        {sub:mm.rom==='angle'?('moves through about '+Math.round(mm.rangeDeg)+'\u00b0'):'moves by translation, not rotation'})+
      (ex.length?uiRow('Exercises',esc(ex.join(', '))):'')+
      '<div class="hint">'+esc(mm.caveat)+'</div><div class="prov">'+esc(mm.note)+'</div>';
  }
  body+='<div class="sk-key"><span class="sk-k sk-k-ghost"></span>start <span class="sk-k sk-k-end"></span>end '+
    '<span class="sk-k sk-k-hot"></span>loaded joint <span class="sk-k sk-k-force"></span>load</div>';
  return {body:body,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
SHEETS.program=function(){
  var ps=programStructure(_PG.weeks);
  var body='<div class="btn-row">'+[4,8,12].map(function(w){
    return uiBtn(w+' weeks','pg.weeks',String(w),'btn-sm '+(w===_PG.weeks?'btn-primary':'btn-ghost'));}).join('')+'</div>';
  if(ps.status!=='ok')return {body:body+'<div class="hint">'+esc(ps.note)+'</div>',
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};
  var r=renderProgram(ps);
  body+='<div class="card-title">'+esc(ps.program.label)+'</div>'+r.calendar+
    '<div class="pg-key"><span class="pg-cell pg-done">L</span>trained on the planned day '+
    '<span class="pg-cell pg-done-other-day">\u00b7</span>trained on another day '+
    '<span class="pg-cell pg-not-on-this-day">L</span>planned, not this day '+
    '<span class="pg-cell pg-upcoming">L</span>upcoming</div>'+
    r.plannedVsCompleted+'<div class="card-title" style="margin-top:10px">Sets logged per week</div>'+r.progression+
    '<div class="prov">'+esc(ps.note)+'</div>';
  return {body:body,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
SHEETS.nutritionviz=function(){
  var nm=nutritionModel(_NU.days);
  var body='<div class="btn-row">'+[7,14,28].map(function(d){
    return uiBtn(d+' days','nu.days',String(d),'btn-sm '+(d===_NU.days?'btn-primary':'btn-ghost'));}).join('')+'</div>';
  if(nm.status!=='ok')return {body:body+'<div class="hint">'+esc(nm.note)+'</div>',
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};
  var r=renderNutrition(nm);
  body+=uiRow('Days logged',nm.loggedDays+' of '+nm.days,
    {sub:nm.itemisedDays+' itemised \u00b7 '+(nm.loggedDays-nm.itemisedDays)+' as a daily total \u00b7 '+
      nm.completeSplitDays+' with a full macro split'})+
    '<div class="card-title" style="margin-top:8px">Composition</div>'+r.composition+
    '<div class="card-title" style="margin-top:10px">Energy logged</div>'+r.trend+'<div class="prov">'+esc(nm.note)+'</div>';
  return {body:body,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
SHEETS.bodymap=function(){
  var m=bodyMapModel(_BM.days),r=renderBodyMap(m);
  var body='<div class="btn-row">'+[7,14,28].map(function(d){
    return uiBtn(d+' days','bm.days',String(d),'btn-sm '+(d===_BM.days?'btn-primary':'btn-ghost'));}).join('')+'</div>';
  body+='<div class="bm-wrap">'+r.svg+'</div>';
  body+='<div class="bm-key"><span class="bm-k bm-k-load"></span>load <span class="bm-k bm-k-none"></span>none in window '+
    '<span class="bm-k bm-k-gap"></span>no record</div>';
  body+=r.table;
  if(m.caveat)body+='<div class="hint">'+esc(m.caveat)+'</div>';
  body+='<div class="prov">'+(typeof clsMark==='function'?clsMark(m.cls):'')+' '+esc(m.note||'')+'</div>';
  return {body:body,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
SHEETS.exports=function(){
  var LABEL={dashboard:'Dashboard layout',appearance:'Appearance profile',visualizationPreset:'Saved charts',
    experiment:'Experiment',program:'Program',provenance:'Provenance (how figures were computed)',data:'Weight data'};
  var body=Object.keys(EXPORT_ADAPTERS).map(function(k){var a=EXPORT_ADAPTERS[k];
    return uiRow(esc(LABEL[k]||k),'',{sub:a.apply?'can be imported back':'export only',
      rsub:a.formats.map(function(f){return uiBtn(f.toUpperCase(),'exp.download',k+'|'+f,'btn-sm btn-ghost');}).join('')});}).join('');
  body+='<div class="card-title" style="margin-top:12px">Import</div>'+
    '<label class="fld"><span>Paste an export</span><textarea id="expImport" rows="4" aria-label="export to import"></textarea></label>'+
    '<div class="btn-row">'+uiBtn('Import','exp.import',null,'btn-sm btn-secondary')+'</div>'+
    '<div class="hint">An experiment imports as a new plan only \u2014 results are never imported, because they must come from your own record. A layout imports under its own name and never replaces one you have.</div>';
  return {body:body,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
SHEETS.vizstudio=function(){
  var models=(MODELS||[]).filter(function(m){return chartTypesFor(m.id).length;});
  var body='<label class="fld"><span>Model</span><select data-act="viz.model" data-ev="change" aria-label="model to visualize">'+
    models.map(function(m){return '<option value="'+m.id+'"'+(m.id===_VIZ.modelId?' selected':'')+'>'+esc(m.name)+'</option>';}).join('')+
    '</select></label>';
  var fit=chartTypesFor(_VIZ.modelId);
  body+='<div class="card-title" style="margin-top:8px">Chart type</div><div class="btn-row viz-types">'+
    fit.map(function(t){return uiBtn(t,'viz.type',t,'btn-sm '+(t===_VIZ.chartType?'btn-primary':'btn-ghost'));}).join('')+'</div>';
  var c=VISUALIZATION_REGISTRY[_VIZ.chartType]||{};
  if(c.encodes)body+=uiRow('Shows',esc(_VIZ.chartType),{sub:esc(c.encodes)});
  if(c.misleads)body+='<div class="hint warn">Misleads '+esc(c.misleads)+'</div>';
  var v=buildVisualization({modelId:_VIZ.modelId,chartType:_VIZ.chartType,title:_VIZ.modelId});
  if(v.status==='ok'){
    body+='<div class="viz-preview">'+v.html+'</div>'+
      uiRow('Pipeline',v.stages.join(' \u2192 '),{sub:'run '+esc(v.runId||'')+' \u00b7 '+esc(v.presentationModel.points.length+' points')});
    body+='<div class="btn-row">'+uiBtn('Save to dashboard','viz.save',null,'btn-sm btn-primary')+
      uiBtn('SVG','viz.svg',null,'btn-sm btn-ghost')+uiBtn('PNG','viz.png',null,'btn-sm btn-ghost')+'</div>';
  }else body+='<div class="hint warn">Stopped at '+esc(v.stage)+': '+esc(v.note)+'</div>';
  var cat=chartCatalogue();
  body+=uiFold('viz-cat','Catalogue',cat.renderable+' of '+cat.types+' can be drawn',function(){
    return cat.rows.map(function(r){return uiRow(esc(r.type),r.renderable?'drawable':'specified',
      {sub:esc(r.encodes||'')+(r.misleads?(' \u00b7 misleads '+esc(r.misleads)):''),tone:r.renderable?'':'attention'});}).join('')+
      '<div class="prov">'+esc(cat.note)+'</div>';});
  return {body:body,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
SHEETS.dashboard=function(){
  var spec=_dashSpec();
  var body='';
  if(!_DASH.editing){
    body+=renderDashboard(spec,{width:(typeof window!=='undefined'?window.innerWidth:0)});
    body+='<div class="btn-row">'+uiBtn('Edit layout','dash.edit',null,'btn-sm btn-primary')+
      uiBtn('New chart','nav.vizstudio',null,'btn-sm btn-secondary')+'</div>';
    body+='<div class="card-title" style="margin-top:12px">Dashboards</div>'+
      listDashboards().map(function(d){
        var active=d.id===(DB.settings.dashboardId||'standard');
        return uiRow(esc(d.id)+(d.builtin?' <small>built-in</small>':''),active?'in use':'',
          {rsub:(active?'':uiBtn('Use','dash.use',d.id,'btn-sm btn-ghost'))+
            uiBtn('Copy','dash.duplicate',d.id,'btn-sm btn-ghost')+
            (d.builtin?'':uiBtn('Delete','dash.delete',d.id,'btn-sm btn-ghost'))});}).join('');
  }else{
    if(_DASH.msg)body+='<div class="hint warn">'+esc(_DASH.msg)+'</div>';
    var secIds=spec.sections.map(function(s){return s.id;});
    spec.sections.forEach(function(sec,si){
      body+='<div class="card-title" style="margin-top:10px">'+esc(sec.title)+'</div>';
      if(!sec.widgets.length)body+='<div class="hint">Empty section.</div>';
      sec.widgets.forEach(function(p,wi){
        var w=WIDGET_REGISTRY[p.widgetId];
        var ctl='';
        if(wi>0)ctl+=uiBtn('\u2191','dash.op','moveWidget|'+p.widgetId+'|'+sec.id+'|'+(wi-1),'btn-sm btn-ghost');
        if(wi<sec.widgets.length-1)ctl+=uiBtn('\u2193','dash.op','moveWidget|'+p.widgetId+'|'+sec.id+'|'+(wi+1),'btn-sm btn-ghost');
        if(si<spec.sections.length-1)ctl+=uiBtn('Next section','dash.op','moveWidget|'+p.widgetId+'|'+secIds[si+1]+'|0','btn-sm btn-ghost');
        (w.sizes||[]).forEach(function(z){if(z!==p.size)ctl+=uiBtn(z.toUpperCase(),'dash.op','resizeWidget|'+p.widgetId+'|'+z,'btn-sm btn-ghost');});
        ctl+=uiBtn(p.visible===false?'Show':'Hide','dash.op',(p.visible===false?'showWidget':'hideWidget')+'|'+p.widgetId,'btn-sm btn-ghost');
        ctl+=uiBtn(p.pinned?'Unpin':'Pin','dash.op',(p.pinned?'unpinWidget':'pinWidget')+'|'+p.widgetId,'btn-sm btn-ghost');
        ctl+=uiBtn('Remove','dash.op','removeWidget|'+p.widgetId,'btn-sm btn-ghost');
        body+=uiRow(esc(w.title||p.widgetId),esc(p.size||''),
          {sub:(p.visible===false?'hidden \u00b7 ':'')+(p.pinned?'pinned \u00b7 ':'')+
            'reads '+esc((w.modelDependencies||[]).join(', ')||'the record')})+
          '<div class="btn-row dash-ctl">'+ctl+'</div>';
      });
    });
    var onDash={};spec.sections.forEach(function(s){s.widgets.forEach(function(p){onDash[p.widgetId]=1;});});
    var avail=Object.keys(WIDGET_REGISTRY).filter(function(id){return !onDash[id]&&WIDGET_REGISTRY[id].renderer&&WIDGET_RENDERERS[WIDGET_REGISTRY[id].renderer];});
    if(avail.length)body+='<div class="card-title" style="margin-top:12px">Add a widget</div>'+
      avail.map(function(id){return uiRow(esc(WIDGET_REGISTRY[id].title||id),'',
        {rsub:uiBtn('Add','dash.op','addWidget|'+id+'|'+secIds[0],'btn-sm btn-ghost')});}).join('');
    body+='<div class="btn-row" style="margin-top:12px">'+uiBtn('Save layout','dash.save',null,'btn-sm btn-primary')+
      uiBtn('Discard','dash.discard',null,'btn-sm btn-ghost')+'</div>'+
      '<div class="hint">Editing a built-in dashboard saves a copy, so the original is always there to go back to.</div>';
  }
  return {body:body,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
SHEETS.studio=function(){
  var ti=tokenInspector(),spec=ti.spec;
  var body='<div class="card-title">Tokens in use</div>'+
    ti.rows.map(function(r){return uiRow(esc(r.token),esc(String(r.value)),{sub:esc(r.source)});}).join('')+
    (ti.valid.ok?'<div class="hint good">This specification passes validation.</div>':
      '<div class="hint warn">'+esc(ti.valid.errors.join('; '))+'</div>');
  body+='<div class="card-title" style="margin-top:12px">Custom accent</div>'+
    '<label class="fld"><span>Hex colour</span><input id="studioHex" type="text" inputmode="text" '+
      'placeholder="#6fb3ff" value="'+attrEsc(spec.customAccent||'')+'" aria-label="custom accent colour"></label>'+
    '<div class="btn-row">'+uiBtn('Apply colour','studio.customAccent',null,'btn-sm btn-primary')+
      (spec.customAccent?uiBtn('Remove','studio.clearAccent',null,'btn-sm btn-ghost'):'')+'</div>'+
    '<div data-level="developer">'+(function(){var co=DB.settings.colorOverrides||{},cur=co.preset||'standard',pal=_currentPalette();
      var eff=function(r){return (co.custom&&co.custom[r])||(STATE_COLOR_PRESETS[cur]&&STATE_COLOR_PRESETS[cur].colors?STATE_COLOR_PRESETS[cur].colors[_themeKind(pal)][r]:pal[r]);};
      return '<div class="card-title" style="margin-top:12px">State colours</div>'+
        '<div class="btn-row">'+Object.keys(STATE_COLOR_PRESETS).map(function(k){return uiBtn(STATE_COLOR_PRESETS[k].label,'studio.colorPreset',k,'btn-sm '+(cur===k&&!co.custom?'btn-primary':'btn-secondary'));}).join('')+'</div>'+
        ['good','attention','negative'].map(function(r){return '<label class="fld"><span><span class="swatch" style="background:'+eff(r)+'"></span> '+r+'</span>'+
          '<input id="stateColor-'+r+'" type="text" maxlength="7" value="'+attrEsc(eff(r))+'" aria-label="'+r+' colour"></label>';}).join('')+
        '<div class="btn-row">'+uiBtn('Apply state colours','studio.stateColors',null,'btn-sm btn-primary')+'</div>'+
        '<div class="hint">Each must reach 3:1 on the surface, and good and negative must stay distinct under every kind of colour blindness.</div>'+
        '<div class="card-title" style="margin-top:12px">Background tint</div>'+
        '<label class="fld"><span>Hue '+(co.tintHue!=null?co.tintHue:210)+'\u00b0</span><input id="tintHue" type="range" min="0" max="360" step="5" value="'+(co.tintHue!=null?co.tintHue:210)+'" aria-label="tint hue"></label>'+
        '<label class="fld"><span>Strength '+(co.tintStrength||0)+'%</span><input id="tintStrength" type="range" min="0" max="20" step="1" value="'+(co.tintStrength||0)+'" aria-label="tint strength"></label>'+
        '<div class="btn-row">'+uiBtn('Apply tint','studio.tint',null,'btn-sm btn-primary')+uiBtn('Reset all colours','studio.resetColors',null,'btn-sm btn-ghost')+'</div>'+
        '<div class="hint">A tint is refused if body text would fall below 4.5:1 or the accent below 3:1.</div>';})()+'</div>'+
    '<div class="hint">A colour is only applied if it reaches 3:1 against the current surface.</div>';
  var ups=userAppearanceProfiles();
  body+='<div class="card-title" style="margin-top:12px">Your profiles</div>'+
    (ups.length?ups.map(function(p){
      return uiRow(esc(p.name),'',{sub:esc(p.spec.theme+' \u00b7 '+(p.spec.customAccent||p.spec.accent)+' \u00b7 '+p.spec.font),
        rsub:uiBtn('Use','studio.load',p.name,'btn-sm btn-ghost')+uiBtn('Copy','studio.duplicate',p.name,'btn-sm btn-ghost')+
          uiBtn('Delete','studio.delete',p.name,'btn-sm btn-ghost')});}).join(''):
      '<div class="hint">No saved profiles yet.</div>')+
    '<label class="fld"><span>Save current as</span><input id="studioName" type="text" placeholder="name" aria-label="profile name"></label>'+
    '<div class="btn-row">'+uiBtn('Save','studio.save',null,'btn-sm btn-secondary')+
      uiBtn('Reset to standard','studio.reset',null,'btn-sm btn-ghost')+'</div>';
  body+='<div class="card-title" style="margin-top:12px">Import and export</div>'+
    '<div class="btn-row">'+uiBtn('Copy specification','studio.export',null,'btn-sm btn-secondary')+'</div>'+
    '<label class="fld"><span>Paste a specification</span><textarea id="studioImport" rows="3" aria-label="appearance specification to import"></textarea></label>'+
    '<div class="btn-row">'+uiBtn('Import','studio.import',null,'btn-sm btn-secondary')+'</div>'+
    '<div class="hint">Imports are parsed, checked against the schema, then validated before anything is applied.</div>';
  return {body:body,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openMaturity(){openSheet('edit',{form:'maturity',title:'How far has this been validated?',
  desc:'Every engine carries how far it has actually been checked. Running is not the same as being right, and this is where the difference is visible.',buf:{}});}
SHEETS.maturity=function(){
  var m=maturityReport();
  var body='';
  ['PRODUCTION_PREDICTIVE','EXPERIMENTALLY_VALIDATED','STATISTICALLY_VALIDATED',
   'OPERATIONAL_ANALYTICAL','INFRASTRUCTURE_GRADE'].forEach(function(g){
    var list=m.byGrade[g]||[];
    body+=uiRow(esc(g.replace(/_/g,' ').toLowerCase()),String(list.length),
      {sub:esc(MATURITY[g].means),tone:list.length?'':'',rsub:list.length?'':'none'});
    if(list.length)body+='<div class="hint">'+esc(list.join(', '))+'</div>';
  });
  if(m.caveat)body+='<div class="hint warn">'+esc(m.caveat)+'</div>';
  body+='<div class="prov">'+esc(m.note)+'</div>';
  return {body:body,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openMaintenance(){openSheet('edit',{form:'maintenance',title:'What is your maintenance?',
  desc:'A posterior rather than a single number, so it can answer how likely a value is \u2014 and how much of the answer is yours rather than the population\u2019s.',buf:{}});}
SHEETS.maintenance=function(){
  var b=tdeeBayes();
  if(b.status==='insufficient')return {body:uiLocked('Maintenance',b.need||[],{why:b.note}),
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};
  var body=uiRow('Most likely',fmtKcal(b.mean),
    {sub:(b.lo!=null?(fmtKcal(b.lo)+' to '+fmtKcal(b.hi)+' \u00b7 '):'')+esc(b.confidence||'')+' confidence',
     rsub:clsMark(b.cls)});
  if(b.status==='prior-only'){
    body+='<div class="hint">'+esc(b.note)+'</div>';
    body+=uiLocked('Your own estimate',b.need||[],{why:'The population equation is what you should believe before evidence arrives.'});
  }else{
    body+=uiRow('Population prior',fmtKcal(b.prior.mean),{sub:'\u00b1'+b.prior.sd+' \u00b7 '+esc(b.prior.source)})+
      uiRow('Your own data',fmtKcal(b.likelihood.mean),
        {sub:'\u00b1'+b.likelihood.sd+' over '+b.likelihood.n+' days \u00b7 '+esc(b.likelihood.source)})+
      uiRow('Where the answer comes from',Math.round(b.weightOnData*100)+'% yours',{sub:esc(b.pooling)});
    body+='<div class="card-title" style="margin-top:10px">How likely is it that</div>'+
      [-300,0,300].map(function(d){
        var x=Math.round((b.mean+d)/50)*50;
        return uiRow('maintenance is above '+fmtKcal(x),Math.round(b.probAbove(x)*100)+'%',{});
      }).join('');
    var ph=activePhase()||{};
    var target=ph.calorieTarget||Math.round(b.mean-500);
    var p=b.predict(target,7);
    body+='<div class="d-block"><div class="d-block-title">NEXT WEEK AT '+esc(fmtKcal(target))+'</div>'+
      uiRow('Expected',fmtSigned(p.expected,2)+' lb',{sub:fmtSigned(p.lo,2)+' to '+fmtSigned(p.hi,2)+' lb'})+
      '<div class="prov">'+esc(p.note)+'</div></div>';
  }
  body+='<div class="prov">'+esc(b.note)+'</div><div class="hint">'+esc(b.caveat||'')+'</div>';
  return {body:body,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openTwin(){openSheet('edit',{form:'twin',title:'Where you are',
  desc:'A model of your current state assembled from the layers, with the share of it resting on your own evidence stated \u2014 because that share is what decides how far it can be trusted to simulate anything.',buf:{}});}
SHEETS.twin=function(){
  var t=personalStateModel();
  var body=uiRow('Fidelity',t.fidelity+'%',
    {sub:esc(t.trustworthiness),rsub:clsMark(t.cls),tone:t.fidelity>=70?'good':'attention'})+
    uiRow('Response estimates',t.responsePersonal+' of '+t.responseTotal+' personal',
      {sub:t.responseBase==='narrow'?'a narrow base \u2014 one or two measured responses is not a model of you':'an adequate base'});
  Object.keys(t.state).forEach(function(k){
    var v=t.state[k];
    body+=uiRow(esc(k),v?'present':'missing',
      {sub:v&&v.cls?('class '+v.cls):'not enough to include',tone:v?'':'attention'});});
  var c=captureRequest();
  if(c.status==='ok')body+='<div class="d-block"><div class="d-block-title">MOST USEFUL THING TO RECORD</div>'+
    uiRow(esc(c.ask.what),c.ask.act?uiBtn('Do it','' + c.ask.act,c.ask.arg||null,'btn-sm btn-primary'):'',
      {sub:'limits '+esc(c.ask.limits||'')})+
    '<div class="prov">'+esc(c.note)+'</div></div>';
  body+='<div class="hint">'+esc(t.caveat)+'</div>';
  return {body:body,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openOptimise(){openSheet('edit',{form:'optimise',title:'Trade-offs',
  desc:'Plans where nothing else is better on every dimension that could be compared. They are not weighted into one score, because that weighting is yours.',buf:{}});}
SHEETS.optimise=function(){
  var o=optimisePlans();
  if(o.status!=='ok')return {body:uiLocked('Plan comparison',o.need||[],{why:o.note}),
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};
  var body=uiRow('Searched',o.searched+' combinations',
    {sub:o.frontier.length+' on the frontier \u00b7 comparing '+o.dimensions.join(', '),rsub:clsMark(o.cls)});
  body+=o.frontier.map(function(f){
    return uiRow(esc(f.name),fmtRate(f.outcome),
      {sub:'burden '+f.burden+(f.time?(' \u00b7 '+f.time+' min/week'):'')+
        (f.fatigue?(' \u00b7 fatigue '+f.fatigue):'')+(f.cost!=null?(' \u00b7 '+fmtNum(f.cost,2)+'/week'):'')+
        (f.feasible===false?' \u00b7 not possible with your equipment':'')});}).join('');
  if(o.unavailable.length)body+=uiLocked('Not compared',[o.unavailable.join(', ')],
    {why:'No data for these, and a dimension filled with a default would make the frontier look richer than the evidence behind it.'});
  body+='<div class="prov">'+esc(o.note)+'</div><div class="hint">'+esc(o.caveat)+'</div>';
  return {body:body,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openRecoveryState(){openSheet('edit',{form:'recoveryState',title:'Recovery',
  desc:'Everything that bears on it, together \u2014 with the signals that are actually dragging named separately, because they do not share a remedy.',buf:{}});}
SHEETS.recoveryState=function(){
  var r=unifiedRecovery();
  if(r.status!=='ok')return {body:uiLocked('Recovery state',r.need||[],{why:r.note}),
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};
  var body=uiRow(esc(r.band),String(r.score),
    {sub:'from '+r.parts.length+' of '+RECOVERY_INPUTS.length+' signals \u00b7 '+esc(r.confidence)+' confidence',
     rsub:clsMark(r.cls),tone:r.score<=-1.2?'negative':(r.score<=-0.5?'attention':'')});
  if(r.limiting.length)body+='<div class="card-title" style="margin-top:10px">What is dragging</div>'+
    r.limiting.map(function(f){
      return uiRow(esc(f.factor),String(f.z),{sub:esc(f.remedy||''),tone:'attention'});}).join('');
  body+='<div class="card-title" style="margin-top:10px">Every signal</div>'+
    r.parts.map(function(p){
      return uiRow(esc(p.label),String(p.z),{sub:'against '+esc(p.source)});}).join('');
  if(r.load)body+=uiRow('Training load',String(r.load.ratio)+'\u00d7',
    {sub:esc(r.load.band)+' \u00b7 acute '+r.load.acute+' against '+r.load.chronicPerWeek+'/week',rsub:clsMark(r.load.cls)});
  var tk=transferableKnowledge();
  body+=uiFold('rec-transfer','What still applies',tk.transfers+' of '+tk.rows.length+' transfer',function(){
    return tk.rows.slice(0,10).map(function(k){
      return uiRow(esc(String(k.subject||k.kind)),esc(k.transfer.grade),
        {sub:esc(k.transfer.verdict).slice(0,120),
         tone:/not transfer/.test(k.transfer.grade)?'attention':''});}).join('')+
      '<div class="prov">'+esc(tk.note)+'</div>';});
  body+='<div class="prov">'+esc(r.note)+'</div><div class="hint">'+esc(r.caveat)+'</div>';
  return {body:body,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
var _SUB=null;
function openSubstitute(){_SUB=null;openSheet('edit',{form:'substitute',title:'Swap a food',
  desc:'Ranked by nutritional fit within the same meal role. What you already eat only breaks near-ties \u2014 ranking by familiarity first would narrow your diet to your habits.',buf:{}});}
SHEETS.substitute=function(){
  var body='';
  if(!_SUB){
    var fq=foodFrequency(60);
    body+='<div class="card-title">Foods you log most</div>'+
      (fq.rows.length?fq.rows.slice(0,10).map(function(r){
        return uiRow(esc(r.name.slice(0,44)),uiBtn('Swap','sub.for',r.id,'btn-sm btn-ghost'),
          {sub:esc(r.role)+' \u00b7 logged '+r.times+' times'});}).join(''):
        '<div class="hint">Nothing logged in the last 60 days.</div>')+
      '<div class="prov">'+esc(fq.note)+'</div>';
  }else if(_SUB.status==='ok'){
    body+=uiRow(esc(_SUB.target),esc(_SUB.targetRole),
      {sub:'protein per 100 kcal: '+_SUB.targetDensity.proteinPer100kcal,rsub:clsMark(_SUB.cls)})+
      _SUB.rows.map(function(r){
        return uiRow(esc(r.name.slice(0,44)),r.equivalentGrams?(r.equivalentGrams+' g'):'\u2014',
          {sub:'fit '+r.similarity+' \u00b7 protein per 100 kcal '+r.proteinPer100kcal+
            (r.familiar?(' \u00b7 you log this '+r.familiar+' times'):'')});}).join('')+
      '<div class="prov">'+esc(_SUB.note)+'</div><div class="hint">'+esc(_SUB.caveat)+'</div>';
  }else body+='<div class="hint warn">'+esc(_SUB.note||'nothing suitable')+'</div>';
  return {body:body,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openConditioning(){openSheet('edit',{form:'conditioning',title:'Cardio and conditioning',
  desc:'Cardio is how much aerobic work you did; conditioning is what you can repeat. They progress differently, so they are reported separately.',buf:{}});}
SHEETS.conditioning=function(){
  var c=cardioSessions(28),cd=conditioningState(60),i=interferenceAnalysis(),t=cardioTiming(90);
  var body='';
  if(c.status==='ok'){
    body+=uiRow('Cardio',c.minutesPerWeek+' min/week',
      {sub:c.sessions+' sessions \u00b7 '+Object.keys(c.byModality).map(function(m){
        return (CARDIO_MODALITIES[m]||{}).label||m;}).join(', '),rsub:clsMark(c.cls)})+
      uiRow('Intensity recorded',c.zonedShare+'% of sessions',{sub:esc(c.note)});
  }else body+=uiLocked('Cardio',c.need||[],{why:'Nothing logged in this window.'});
  body+=(cd.status==='ok'?
    uiRow('Conditioning',(cd.circuitSessions+cd.intervalSessions)+' sessions',
      {sub:(cd.density!=null?('density '+cd.density+' sets/hour \u00b7 '):'')+esc(cd.note).slice(0,110),rsub:clsMark(cd.cls)}):
    uiLocked('Conditioning',cd.need||[],{why:cd.note}));
  body+='<div class="card-title" style="margin-top:12px">Does cardio cost you strength?</div>';
  if(i.status==='ok'){
    body+=uiRow(esc(i.grade),fmtSigned(i.difference,1)+' lb',
      {sub:'on '+esc(i.lift)+' \u00b7 '+i.highCardioWeeks+' higher-cardio weeks against '+i.lowCardioWeeks+' lower',
       rsub:clsMark(i.cls),tone:i.confounds.length?'attention':''})+
      '<div class="muted">'+esc(i.verdict)+'</div>'+
      (i.next?('<div class="prov">Next: '+esc(i.next)+'</div>'):'');
  }else body+=uiLocked('Interference',i.need||[],{why:i.note});
  body+=uiRow('Timing',t.sameDayAsLifting+' of '+t.cardioSessions+' on lifting days',{sub:esc(t.note)});
  body+='<div class="hint">'+esc(i.note||'')+'</div>';
  return {body:body,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openCompose(){openSheet('edit',{form:'compose',title:'Today\u2019s session',
  desc:'Composed from what today calls for. The blocks left out are listed with the reason \u2014 a session containing every block is not a session, it is a list.',buf:{}});}
SHEETS.compose=function(){
  var c=composeSession();
  if(c.status!=='ok')return {body:'<div class="hint">'+esc(c.note||'nothing to compose')+'</div>',
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};
  var body=uiRow(c.session||'Rest day',c.minutes+' of '+c.budget+' minutes',
    {sub:c.trimNote?esc(c.trimNote):esc(c.day),rsub:clsMark(c.cls)})+
    c.blocks.map(function(b){
      return uiRow(esc(b.label),String(b.minutes)+'m',
        {sub:esc(b.why),rsub:b.act?uiBtn('Open','' + b.act,b.arg||null,'btn-sm btn-ghost'):esc(b.kind)});}).join('');
  body+=uiFold('compose-out','Left out',c.excluded.length+' blocks',function(){
    return c.excluded.map(function(e){return uiRow(esc(e.kind),'',{sub:esc(e.why)});}).join('');});
  body+='<div class="prov">'+esc(c.note)+'</div><div class="hint">'+esc(c.caveat||'')+'</div>';
  return {body:body,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
SHEETS.skillLimiter=function(b){
  var l=b.l;
  var body=uiRow('Next step',esc(l.next?l.next.label:'\u2014'),
    {sub:l.current?('after '+esc(l.current.label)):'nothing recorded yet',rsub:clsMark(l.cls)})+
    (l.fatigueBlock?('<div class="hint warn">'+esc(l.fatigueBlock)+'</div>'):'')+
    l.axes.map(function(a2){
      return uiRow(esc(a2.axis),a2.needed!=null?('needs '+a2.needed):'\u2014',
        {sub:esc(a2.evidence||a2.status),tone:(a2.needed&&!a2.evidence)?'attention':''});}).join('')+
    (l.prerequisites.length?('<div class="d-block"><div class="d-block-title">PREREQUISITES</div><ul>'+
      l.prerequisites.map(function(p){return '<li>'+esc(p)+'</li>';}).join('')+'</ul></div>'):'')+
    '<div class="d-block"><div class="d-block-title">WHAT IS HOLDING YOU</div><div class="muted">'+esc(l.verdict)+'</div></div>'+
    '<div class="prov">'+esc(l.note)+'</div>'+
    '<div class="btn-row">'+uiBtn('Record a state','move.progress',null,'btn-sm btn-secondary')+'</div>';
  return {body:body,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openMobility(){openSheet('edit',{form:'mobility',title:'Mobility',
  desc:'Range you have and range you can use are different questions with different remedies, so they are reported separately.',buf:{}});}
SHEETS.mobility=function(){
  var ov=mobilityOverview();
  var body=uiRow('Measured',ov.measured+' of '+ov.total+' joints',{sub:esc(ov.note),rsub:clsMark(ov.cls)});
  ov.rows.filter(function(r){return r.measured;}).forEach(function(r){
    body+=uiRow(esc(r.label),r.activePassiveGap!=null?(fmtSigned(r.activePassiveGap,1)+' gap'):esc(String(r.latest||'')),
      {sub:esc(r.interpretation)});});
  if(ov.unmeasured.length)body+=uiLocked('Not measured',[ov.unmeasured.join(', ')],
    {why:'An unmeasured joint is unknown, which is different from being fine.',act:'move.assess',actLabel:'Measure one'});
  body+='<div class="card-title" style="margin-top:12px">Stretch kinds</div>'+
    Object.keys(STRETCH_KINDS).map(function(k){
      var K=STRETCH_KINDS[k];
      return uiRow(esc(K.label),uiBtn('Detail','stretch.info',k,'btn-sm btn-ghost'),
        {sub:esc(K.how)+' \u00b7 '+esc(K.effect).slice(0,90),tone:K.discouraged?'attention':''});}).join('')+
    '<div class="prov">Doses are starting points from the general literature, not from your record.</div>';
  return {body:body,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
SHEETS.stretchInfo=function(b){
  var p=b.p;
  return {body:uiRow('How',esc(p.how),{rsub:clsMark(p.cls)})+
    uiRow('Starting dose',esc(JSON.stringify(p.dose).replace(/[{}"]/g,'').replace(/,/g,', ')),{})+
    uiRow('What it does',esc(p.effect),{})+
    (p.warning?('<div class="hint warn">Before lifting: '+esc(p.warning)+'</div>'):
      '<div class="hint good">Appropriate before lifting.</div>')+
    '<div class="prov">'+esc(p.note)+'</div>',
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openYoga(){openSheet('edit',{form:'yoga',title:'Practice',
  desc:'What a sequence actually trains, across range, strength, balance and skill \u2014 a pose is not only a stretch.',buf:{}});}
SHEETS.yoga=function(){
  var body=Object.keys(SEQUENCES).map(function(id){
    var a2=sequenceAnalysis(id);
    return '<div class="d-block"><div class="d-block-title">'+esc(a2.label.toUpperCase())+'</div>'+
      uiRow(esc(a2.styleLabel),a2.minutes+' min',{sub:esc(a2.trains),rsub:clsMark(a2.cls)})+
      uiRow('Demands',Object.keys(a2.demands).map(function(k){return k+' '+a2.demands[k];}).join(' \u00b7 '),
        {sub:a2.poses.map(function(p){return esc(p.label);}).join(', ')})+
      '<div class="btn-row">'+uiBtn('Log it','yoga.log',id,'btn-sm btn-secondary')+'</div></div>';
  }).join('');
  var r=yogaResponse('fatigue');
  body+=(r.status==='ok'?
    uiRow('Day after practice',fmtSigned(r.difference,1)+' fatigue',
      {sub:r.afterDays+' days after against '+r.otherDays+' without \u00b7 '+esc(r.note).slice(0,90),rsub:clsMark(r.cls)}):
    uiLocked('Whether practice does anything for you',r.need||[],
      {why:'Logged sessions and daily ratings are what make this answerable.'}));
  return {body:body,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openMoveLibrary(){openSheet('edit',{form:'moveLibrary',title:'Movement library',
  desc:'One library across stretching, mobility, activation, isometrics, breathing and practice. The same movement can serve different roles depending on why you are doing it.',buf:{}});}
SHEETS.moveLibrary=function(){
  var d=movementDoseTotals(7);
  var byRole={};movementLibrary().forEach(function(m){(byRole[m.role]=byRole[m.role]||[]).push(m);});
  return {body:uiRow('This week',DOSE_DIMENSIONS.map(function(k){return k+' '+d.totals[k];}).join(' \u00b7 '),
      {sub:esc(d.note)})+
    Object.keys(byRole).map(function(role){
      return '<div class="card-title" style="margin-top:10px">'+esc((MOVEMENT_ROLES[role]||{}).label||role)+'</div>'+
        byRole[role].map(function(m){
          return uiRow(esc(m.label),uiBtn('Log','move.log',m.id,'btn-sm btn-ghost'),
            {sub:esc(m.objective)+' \u00b7 '+esc(m.expected)+(m.avoidBefore?(' \u00b7 not immediately before '+m.avoidBefore.join(', ')):'')});}).join('');
    }).join(''),
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openProgressions(){openSheet('edit',{form:'progressions',title:'Progressions',
  desc:'What is next, and what is holding you there.',buf:{}});}
SHEETS.progressions=function(){
  return {body:Object.keys(skillFamilies()).map(function(k){
      var ps=progressionStatus(k);
      return '<div class="d-block"><div class="d-block-title">'+esc(ps.label.toUpperCase())+'</div>'+
        ps.rows.map(function(r){return uiRow(esc(r.label),esc(r.state),
          {sub:'strength '+r.demand.strength+' \u00b7 skill '+r.demand.skill,
           tone:(r.state==='consistent'||r.state==='mastered')?'good':''})+
          '<div class="btn-row" style="margin:-6px 0 6px 0">'+uiBtn('Set state','move.skill',r.id+'|'+r.label,'btn-sm btn-ghost')+'</div>';}).join('')+
        (ps.limiter?('<div class="prov">What is holding you: '+esc(ps.limiter)+'</div>'):'')+'<div class="btn-row">'+uiBtn('What is holding me','skill.limiter',k,'btn-sm btn-ghost')+'</div></div>';
    }).join('')+'<div class="prov">'+esc(progressionStatus('pull').note)+'</div>',
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
var _ASK=null,_ASK_Q='';
function openAsk(){openSheet('edit',{form:'ask',title:'Ask the record',
  desc:'Answered from your own data, not from a model. Where the record cannot answer, it says what it would need.',buf:{}});}
SHEETS.ask=function(){
  var body='<label class="fld"><span>Question</span><input id="askInput" type="text" placeholder="what is my trend" value="'+attrEsc(_ASK_Q||'')+'" data-act="ask.field" data-ev="input">'+uiMicBtn('askInput')+'</label>'+
    '<div class="btn-row">'+uiBtn('Ask','ask.run',null,'btn-sm btn-primary')+'</div>';
  /* The value is escaped: an answer can include food names a person typed. "Where this comes from" appears only for a
     registered trace — unregistered names made dead buttons; each answer's own action is its evidence link. */
  if(_ASK&&_ASK.status==='ok'){
    body+=uiRow(esc(_ASK.question),'<strong>'+esc(String(_ASK.value))+'</strong>',
      {sub:esc(_ASK.basis||''),rsub:clsMark(_ASK.cls)})+
      '<div class="btn-row">'+
        (_ASK.trace&&TRACES[_ASK.trace]?uiBtn('Where this comes from','trace.open',_ASK.trace,'btn-sm btn-ghost'):'')+
        (_ASK.act?uiBtn(_ASK.cando||'Open',_ASK.act,_ASK.arg||null,'btn-sm btn-ghost'):'')+'</div>'+
      '<div class="prov">'+esc(_ASK.note)+'</div>';
  }else if(_ASK&&_ASK.status==='declined'){
    body+=uiRow(esc(_ASK.question),'<strong>Not something to answer here</strong>',{sub:esc(_ASK.reason||''),tone:'attention'})+
      (_ASK.act?'<div class="btn-row">'+uiBtn('Open','' + _ASK.act,_ASK.arg||null,'btn-sm btn-ghost')+'</div><div class="hint">'+esc(_ASK.cando||'')+'</div>':'');
  }else if(_ASK&&_ASK.status==='unanswerable'){
    body+=uiLocked(esc(_ASK.question),_ASK.need,{why:_ASK.note});
  }else if(_ASK&&_ASK.status==='unmatched'){
    body+='<div class="hint">'+esc(_ASK.note)+'</div>'+
      '<div class="sym-grid">'+_ASK.suggestions.map(function(q){
        return '<button class="chip sm" data-act="ask.run" data-arg="'+attrEsc(q)+'">'+esc(q)+'</button>';}).join('')+'</div>';
  }
  var st=assistantState();
  body+=uiFold('ask-assistant','Attaching a model',st.attached?'one is attached':'none attached',
    '<div class="muted">'+esc(st.note)+'</div>'+
    '<div class="d-block"><div class="d-block-title">IT MAY</div><ul>'+ASSISTANT_CONTRACT.may.map(function(x){return '<li>'+esc(x)+'</li>';}).join('')+'</ul></div>'+
    '<div class="d-block"><div class="d-block-title">IT MAY NOT</div><ul>'+ASSISTANT_CONTRACT.mayNot.map(function(x){return '<li class="attention">'+esc(x)+'</li>';}).join('')+'</ul></div>'+
    '<div class="prov">'+esc(ASSISTANT_CONTRACT.enforcement)+'</div>');
  return {body:body,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openGraph(){openSheet('edit',{form:'graph',title:'How it connects',
  desc:'Observation \u2192 finding \u2192 decision \u2192 change \u2192 forecast \u2192 outcome \u2192 what it learned. Every edge comes from something already recorded.',buf:{}});}
SHEETS.graph=function(){
  var g=knowledgeGraph();
  var byKey={};g.nodes.forEach(function(n){byKey[n.key]=n;});
  var learned=g.nodes.filter(function(n){return n.kind==='knowledge';});
  var body=uiRow('Graph',g.nodes.length+' nodes, '+g.edges.length+' links',
    {sub:Object.keys(g.counts).filter(function(k){return g.counts[k];})
      .map(function(k){return g.counts[k]+' '+NODE_KINDS[k].label.toLowerCase();}).join(' \u00b7 ')});
  if(!learned.length)body+='<div class="hint">Nothing has completed the chain yet. A finished experiment is what turns an outcome into knowledge.</div>';
  learned.forEach(function(n){
    body+='<div class="d-block"><div class="d-block-title">'+esc(String(n.label).slice(0,60).toUpperCase())+'</div>'+
      walkBack(n.key,g).slice(1).map(function(x){
        return uiRow(esc(NODE_KINDS[x.kind].label),esc(String(x.label).slice(0,70)),
          {sub:x.date?shortDate(x.date):'',rsub:clsMark(x.cls)});}).join('')+'</div>';
  });
  return {body:body+'<div class="prov">'+esc(g.note)+'</div>',
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openCausal(){openSheet('edit',{form:'causal',title:'What your record can support',
  desc:'Graded from your own data. The strongest grade available is "supported", never "proven" \u2014 nothing here is randomised.',buf:{}});}
SHEETS.causal=function(){
  var m=causalMap();
  return {body:m.rows.map(function(r){
      return uiRow(esc(r.variable),esc(r.grade),
        {sub:r.why.join('; ')+' \u00b7 next: '+esc(r.next),
         tone:r.grade==='supported'?'good':(r.grade==='confounded'||r.grade==='contradicted'?'attention':'')});}).join('')+
    '<div class="prov">'+esc(m.note)+' '+esc(causalSupport('steps').note)+'</div>',
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openExperimentLibrary(){openSheet('edit',{form:'expLibrary',title:'What to test next',
  desc:'Ranked by what each would resolve against what it costs to run. Questions that cannot be answered by a runnable experiment are listed last, with the reason.',buf:{}});}
SHEETS.expLibrary=function(){
  var o=experimentOpportunities();
  return {body:(o.best?('<div class="d-block"><div class="d-block-title">BEST QUESTION</div>'+
      '<div class="lead" style="font-size:13px">'+esc(o.best.question)+'</div>'+
      '<div class="muted">'+esc(o.best.why.join('; '))+'</div>'+
      '<div class="btn-row">'+uiBtn('Design it','exp.fromTemplate',o.best.id,'btn-sm btn-primary')+'</div></div>'):'')+
    o.opportunities.map(function(x){
      return uiRow(esc(x.label),x.feasible?(x.weeks+' weeks'):uiPill('not runnable','neutral'),
        {sub:esc(x.grade)+' \u00b7 '+esc(x.question),
         rsub:x.feasible?('value '+x.ratio):'',tone:x.feasible?'':'attention'})+
        '<div class="btn-row" style="margin:-6px 0 8px 0">'+
        uiBtn(x.feasible?'Design it':'Why not?','exp.fromTemplate',x.id,'btn-sm btn-ghost')+'</div>';}).join('')+
    '<div class="prov">'+esc(o.note)+'</div><div class="hint">'+esc(o.caveat)+'</div>',
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
SHEETS.expTemplate=function(b){
  var t=b.t;var d=t.design;
  var body=uiRow('Question',esc(t.question),{})+(t.todo?uiRow('You would',esc(t.todo),{}):'')+
    uiRow('Change',esc(t.variable)+' '+fmtSigned(t.delta,0),{sub:'measured on '+esc(t.metric)})+
    uiRow('Washout',t.washoutDays+' days',{sub:'so carry-over is not counted as effect'})+
    uiRow('Reverse if',esc(t.reversal),{});
  if(d&&d.status==='ok')body+=uiRow('Duration',d.weeksNeeded+' weeks',
      {sub:'derived from your own noise of '+fmtWeight(d.personalNoise)+' per day',tone:d.feasible?'good':'negative'})+
    uiRow('Verdict',esc(d.verdict),{});
  else body+=uiLocked('Duration',(d&&d.need)||['an effect estimate'],{why:d&&d.why});
  body+='<div class="d-block"><div class="d-block-title">CONFOUNDERS TO AVOID</div><ul>'+
    t.confounders.map(function(c){return '<li>'+esc(c)+'</li>';}).join('')+'</ul></div>'+
    '<div class="prov">'+esc(t.note)+'</div>';
  return {body:body,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openGenProgram(){_GEN_PROGRAMS=generatePrograms();
  openSheet('edit',{form:'genProgram',title:'Build a plan',
    desc:'Generated from the days you actually train, the equipment you have, and anything sore. Candidates only \u2014 nothing is applied until you choose one.',buf:{}});}
SHEETS.genProgram=function(){
  var g=_GEN_PROGRAMS;
  if(!g||g.status!=='ok')return {body:'<div class="hint warn">'+esc((g&&g.reason)||'nothing could be generated')+'</div>'+
    (g&&g.note?'<div class="prov">'+esc(g.note)+'</div>':''),
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};
  return {body:uiRow('Built for',g.days.join(', '),{sub:g.equipment.join(', ')+(g.avoided.length?(' \u00b7 avoiding '+g.avoided.join(', ')):'')})+
    g.candidates.map(function(c,i){
      return '<div class="d-block"><div class="d-block-title">'+esc(c.label.toUpperCase())+'</div>'+
        uiRow('Movement coverage',esc(c.coverage),{sub:c.exercises+' exercises \u00b7 '+c.weeklySets+' sets/week'})+
        Object.keys(c.def.templates).map(function(t){
          return uiRow(esc(t),esc(c.def.templates[t].map(function(r){return r[0];}).join(', ')),
            {sub:c.def.templates[t].map(function(r){return r[1]+'\u00d7'+r[2];}).join(' \u00b7 ')});}).join('')+
        '<div class="btn-row">'+uiBtn('Use this plan','gen.apply',String(i),'btn-sm btn-primary')+'</div></div>';
    }).join('')+'<div class="prov">'+esc(g.note)+'</div><div class="hint">'+esc(g.caveat)+'</div>',
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openProgression(){openSheet('edit',{form:'progression',title:'What to change next week',
  desc:'One change per lift at most, so that if something stops working it is clear what changed.',buf:{}});}
SHEETS.progression=function(){
  var p=progressionPlan();
  if(p.status!=='ok')return {body:uiLocked('Progression',p.need||[],{why:p.note}),
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};
  return {body:(p.brake?'<div class="hint warn">Everything is held: '+esc(p.brake)+'</div>':'')+
    p.rows.map(function(r){return uiRow(esc(r.exercise),esc(r.action),
      {sub:esc(r.why),rsub:esc(String(r.direction)),tone:r.action==='hold'?'':(r.action==='reduce volume'?'attention':'good')});}).join('')+
    '<div class="prov">'+esc(p.note)+'</div><div class="hint">'+esc(p.caveat)+'</div>'+
    '<div class="btn-row">'+uiBtn('Edit the plan','nav.planEdit',null,'btn-sm btn-secondary')+'</div>',
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openMealPlan(){_MEAL_PLAN=planDay();
  openSheet('edit',{form:'mealPlan',title:'Build a day',
    desc:'Built from foods already in your list, weighted towards what you actually eat.',buf:{}});}
SHEETS.mealPlan=function(){
  var m=_MEAL_PLAN;
  if(!m||m.status!=='ok')return {body:uiLocked('A planned day',(m&&m.need)||[m&&m.reason].filter(Boolean),{why:m&&m.note}),
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};
  return {body:uiRow('Targets',fmtKcal(m.targets.kcal)+' \u00b7 '+fmtNum(m.targets.protein,0)+' g protein',{})+
    m.candidates.map(function(c){
      return '<div class="d-block"><div class="d-block-title">'+esc(c.label.toUpperCase())+'</div>'+
        uiRow(fmtKcal(c.kcal)+' \u00b7 '+c.protein+' g',
          (c.hitsProtein&&c.hitsCalories)?uiPill('on target','good'):uiPill(fmtSigned(c.kcalGap,0)+' kcal, '+fmtSigned(c.proteinGap,0)+' g','attention'),
          {sub:c.familiarShare+'% foods you already eat'})+
        c.items.map(function(it){return uiRow(esc(it.food.name.slice(0,42)),it.grams+' g',
          {sub:esc(it.meal)+' \u00b7 '+it.kcal+' kcal \u00b7 '+it.protein+' g'});}).join('')+
        '</div>';}).join('')+
    '<div class="btn-row">'+uiBtn('Copy a week\u2019s shopping list','gen.grocery','7','btn-sm btn-secondary')+'</div>'+
    '<div class="prov">'+esc(m.note)+'</div><div class="hint">'+esc(m.caveat)+'</div>',
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openPlanSearch(){openSheet('edit',{form:'planSearch',title:'Search the options',
  desc:'Every plan where nothing else is better on both expected outcome and burden.',buf:{}});}
SHEETS.planSearch=function(){
  var ps=searchPlans();
  if(ps.status!=='ok')return {body:uiLocked('Plan search',ps.need||[],{why:ps.note}),
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};
  return {body:uiRow('Searched',ps.searched+' combinations',
      {sub:ps.frontier.length+' on the frontier \u00b7 '+ps.excludedOutsideBand+' excluded for falling outside the rate band'})+
    ps.frontier.map(function(f){return uiRow(esc(f.name),fmtRate(f.expected!=null?f.expected:f.rate),
      {sub:'burden '+f.burden+(f.execution!=null?(' \u00b7 '+Math.round(f.execution*100)+'% likely to be followed'):'')+
        (f.endWeight!=null?(' \u00b7 '+fmtWeight(f.endWeight)+' in '+ps.horizonWeeks+' weeks'):'')});}).join('')+
    '<div class="prov">'+esc(ps.note)+'</div><div class="hint">'+esc(ps.caveat)+'</div>',
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openDomains(){openSheet('edit',{form:'domains',title:'What the system tracks',
  desc:'Each area runs the same loop: what it observes, what it concludes, what it would advise, and what it cannot answer yet. Adding an area costs a declaration, not a subsystem.',buf:{}});}
SHEETS.domains=function(){
  var sum=domainSummary();var gaps=domainGaps();
  var body=sum.map(function(d){
    return uiRow(esc(d.label),esc(String(d.headline||d.status)),
      {sub:'observes '+d.observes.map(function(t){return (OBS_TYPES[t]||{}).label||t;}).join(', ')+
        ' \u00b7 '+d.findings+' finding'+(d.findings===1?'':'s')+(d.gaps?(' \u00b7 '+d.gaps+' open question'+(d.gaps===1?'':'s')):''),
       rsub:d.cls||'',tone:d.status==='ok'?'':'attention'});}).join('');
  var f=domainFindings();
  if(f.length)body+='<div class="card-title" style="margin-top:12px">What each concludes</div>'+
    f.map(function(x){return uiRow(esc(x.text),clsMark(x.cls),
      {sub:esc(x.domainLabel)+' \u00b7 '+esc(x.basis||'')+' \u00b7 confidence '+esc(x.confidence),
       tone:x.severity==='action'?'negative':(x.severity==='attention'?'attention':'')});}).join('');
  var p=domainProposals();
  if(p.length)body+='<div class="card-title" style="margin-top:12px">What they would advise</div>'+
    p.map(function(x){return '<div class="d-block"><div class="d-block-title">'+esc(x.domainLabel.toUpperCase())+'</div>'+
      '<div class="lead" style="font-size:13px">'+esc(x.verb)+'</div><ul>'+
      x.why.map(function(wy){return '<li>'+esc(wy)+'</li>';}).join('')+'</ul>'+
      (x.reverseIf.length?('<div class="prov">Reverse if: '+x.reverseIf.map(esc).join('; ')+'</div>'):'')+
      (x.act?('<div class="btn-row">'+uiBtn('Act on it',x.act,x.arg||null,'btn-sm btn-secondary')+'</div>'):'')+
      '</div>';}).join('')+
    '<div class="prov">These are proposals. Nothing here changes the record until you apply it through the ordinary action.</div>';
  if(gaps.length)body+='<div class="card-title" style="margin-top:12px">What they cannot answer yet</div>'+
    gaps.slice(0,8).map(function(g){return uiRow(esc(g.question),uiBtn('Fix',g.act||'nav.missing',g.arg||null,'btn-sm btn-ghost'),
      {sub:esc(g.domainLabel)+' \u00b7 limits '+esc(g.limits)+' \u00b7 '+g.need.map(esc).join('; ')});}).join('')+
    '<div class="prov">Ranked by how much each would reduce uncertainty against how much work it is.</div>';
  return {body:body,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openInjuryAdd(){openSheet('edit',{form:'injuryAdd',title:'Something is sore',
  desc:'This records where and how much, and checks your plan against it. It is not a diagnosis and cannot be one \u2014 if something persists, that is a question for a clinician.',buf:{severity:2,since:todayISO()}});}
SHEETS.injuryAdd=function(b){
  return {body:'<div class="sym-grid">'+Object.keys(BODY_REGIONS).map(function(k){
      return '<button class="chip'+(b.region===k?' active':'')+'" data-act="injury.region" data-arg="'+k+'" aria-pressed="'+(b.region===k)+'">'+esc(BODY_REGIONS[k].label)+'</button>';}).join('')+'</div>'+
    '<div class="fld"><span>How much, 1 to 5</span><div class="sym-grid">'+[1,2,3,4,5].map(function(n){
      return '<button class="chip sm'+(b.severity===n?' active':'')+'" data-act="injury.sev" data-arg="'+n+'" aria-pressed="'+(b.severity===n)+'">'+n+'</button>';}).join('')+'</div></div>'+
    '<label class="fld"><span>Since</span><input type="date" data-act="sheet.field" data-arg="since" value="'+attrEsc(b.since||todayISO())+'"></label>'+
    '<label class="fld"><span>Note</span><input type="text" data-act="sheet.field" data-arg="note" placeholder="what provokes it" value="'+attrEsc(b.note||'')+'"></label>'+
    (b.region?('<div class="prov">Movements in your plan that load the '+esc(BODY_REGIONS[b.region].label.toLowerCase())+': '+
      (exercisesLoading(b.region).map(function(e){return esc(e.exercise);}).join(', ')||'none found')+'</div>'):''),
    foot:'<button class="btn btn-secondary" data-act="edit.close">Cancel</button><button class="btn btn-primary" data-act="injury.save">Record</button>'};};
function openInjuryReview(id){
  var st=injuryState();
  var item=(st.items||[]).filter(function(l){return l.injury.id===id;})[0];
  if(!item)return;
  openSheet('edit',{form:'injuryReview',title:item.region.label,desc:'',buf:{item:item}});}
SHEETS.injuryReview=function(b){
  var l=b.item;
  return {body:uiRow('Sore since',longDate(l.injury.since),{sub:l.days+' days \u00b7 '+l.injury.severity+'/5'+(l.injury.note?(' \u00b7 '+esc(l.injury.note)):'')})+
    uiRow('Loading sets logged since',String(l.exposures),{sub:'from your own session log',tone:l.exposures>20?'attention':''})+
    '<div class="card-title" style="margin-top:10px">Movements in your plan that load it</div>'+
    (l.exercises.length?l.exercises.map(function(e){return uiRow(esc(e.exercise),esc(e.pattern||''),{sub:'session '+esc(e.template)});}).join(''):
      '<div class="hint">None of your current movements match this region.</div>')+
    '<div class="btn-row">'+uiBtn('Edit the plan','nav.planEdit',null,'btn-sm btn-secondary')+uiBtn('Mark settled','injury.resolve',l.injury.id,'btn-sm btn-ghost')+'</div>'+
    '<div class="prov">Matched through the movement patterns the exercise ontology declares. This app cannot assess what is wrong with you and does not try; persistent pain is a question for someone qualified.</div>',
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openPlanEdit(){openSheet('edit',{form:'planEdit',title:'Training plan',
  desc:'Swap exercises, change sets and reps, move days, or adapt the whole plan to the equipment you actually have. A plan you cannot follow produces adherence data about the plan rather than about you.',buf:{}});}
SHEETS.planEdit=function(){
  var p=trainingProgram();var key=p.key;var def=programDef(key);
  var body=uiRow(esc(def.label),programIsCustom(key)?uiPill('edited','attention'):uiPill('built-in','neutral'),
      {sub:programIsCustom(key)?('based on '+esc(def.basedOn||key)+' \u00b7 changes are dated, so a replay shows the plan as it stood then'):'unchanged from the built-in plan'})+
    '<div class="btn-row">'+Object.keys(SITUATIONS).map(function(sid){
      return uiBtn(SITUATIONS[sid].label,'plan.adapt',key+'|'+sid,'btn-sm btn-ghost');}).join('')+
      (programIsCustom(key)?uiBtn('Reset to built-in','plan.reset',key,'btn-sm btn-danger'):'')+'</div>';
  body+='<div class="card-title" style="margin-top:12px">Your next 7 days</div><div class="hint">Which days you train comes from your schedule; this plan sets the sessions and their order.</div><div class="sched-choose">'+
    Array.apply(null,{length:7}).map(function(_,i){var d=addDays(todayISO(),i),pl=null;try{pl=scheduledPlan(d,p);}catch(e){}return '<div class="pw-day'+(pl?'':' rest')+'"><b>'+esc(dowShort(d))+'</b><span>'+esc(pl?(pl.kind==='lift'?pl.label:(pl.label||'short')):'rest')+'</span></div>';}).join('')+
    '</div><div class="btn-row">'+uiBtn('Change which days','nav.schedule',null,'btn-sm btn-secondary')+'</div>';
  body+='<div class="card-title" style="margin-top:12px">Session for each weekday (used when no training days are set)</div>';
  DAY_KEYS.forEach(function(d){
    var day=p.week[d];
    body+=uiRow(d,uiBtn(day?esc(day.label||DAY_KINDS[day.kind]||day.kind):'Rest','plan.day',key+'|'+d+'|'+attrEsc(day?(day.label||''):'')+'|'+(day?day.kind:'lift'),'btn-sm btn-ghost'),
      {sub:day?esc(DAY_KINDS[day.kind]||day.kind):'no session scheduled'});
  });
  Object.keys(def.templates||{}).forEach(function(t){
    var rows=templateRows(key,t);
    body+=uiFold('plan-t-'+t,'Session '+t,rows.length+' exercises',
      rows.map(function(r){
        return uiRow(esc(r.exercise),'<span class="mono">'+r.sets+'\u00d7'+esc(String(r.reps))+'</span>',
          {sub:'<span class="btn-row" style="margin-top:4px">'+
            uiBtn('Swap','plan.swap',key+'|'+t+'|'+attrEsc(r.exercise)+'|'+r.index,'btn-sm btn-ghost')+
            uiBtn('Sets/reps','plan.sets',key+'|'+t+'|'+r.index,'btn-sm btn-ghost')+
            uiBtn('\u2191','plan.move',key+'|'+t+'|'+r.index+'|-1','btn-sm btn-ghost')+
            uiBtn('\u2193','plan.move',key+'|'+t+'|'+r.index+'|1','btn-sm btn-ghost')+
            uiBtn('Remove','plan.remove',key+'|'+t+'|'+r.index,'btn-sm btn-ghost')+'</span>'});
      }).join('')+'<div class="btn-row">'+uiBtn('Add an exercise','plan.add',key+'|'+t,'btn-sm btn-secondary')+'</div>');
  });
  if(programIsCustom(key)){
    var d=programDiff(key);
    if(d&&d.changes.length)body+=uiFold('plan-diff','Changes from the built-in',d.changes.length+' changes',
      d.changes.map(function(c){return uiRow(esc(c.text),'',{sub:esc(c.kind)});}).join('')+'<div class="prov">'+esc(d.note)+'</div>');
  }
  return {body:body,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openEventIntegrity(){_EVENT_CHECK=null;
  openSheet('edit',{form:'eventIntegrity',title:'History integrity',
    desc:'The record you see is a projection of an event log. Rebuilding it from that log must reproduce it exactly \u2014 this is where you can check that for yourself.',buf:{}});}
SHEETS.eventIntegrity=function(){
  var es=eventStats();var ar=eventArchiveState();
  var body=uiRow('Events','<strong>'+fmtNum(ar.total,0)+'</strong>',
      {sub:fmtNum(ar.working,0)+' in the working window of '+fmtNum(ar.window,0)+
        (ar.archived?(' \u00b7 '+fmtNum(ar.archived,0)+' archived across '+ar.shards+' shard'+(ar.shards===1?'':'s')):' \u00b7 nothing archived yet'),
       rsub:es.types+' types',tone:ar.healthy?'good':'attention'})+
    uiRow('Archive',esc(ar.note),{sub:ar.lastSnapshotAt?('last snapshot '+shortDate(localDateOf(ar.lastSnapshotAt))):'no snapshot taken'})+
    '<div class="btn-row">'+uiBtn('Verify history','events.verify',null,'btn-sm btn-primary')+uiBtn('Compact now','events.compact',null,'btn-sm btn-ghost')+'</div>';
  if(_EVENT_CHECK){
    var m=_EVENT_CHECK.projection;
    body+='<div class="divider"></div>'+
      uiRow('Rebuild from the log',m.ok?uiPill('reproduces the record','good'):uiPill('mismatch','negative'),
        {sub:m.ok?(fmtNum(m.applied,0)+' events applied, '+m.skipped+' skipped'):('differences in '+m.diffs.map(function(d){return d.collection;}).join(', '))})+
      _EVENT_CHECK.agree.map(function(a2){
        return uiRow('Replay '+shortDate(a2.date),a2.agree?uiPill('both paths agree','good'):uiPill('disagree','negative'),
          {sub:a2.agree?('observations '+a2.viaEvents.observations+' \u00b7 sessions '+a2.viaEvents.sessions+' \u00b7 food '+a2.viaEvents.foodLogs):
            (JSON.stringify(a2.viaFlags)+' vs '+JSON.stringify(a2.viaEvents))});}).join('')+
      '<div class="prov">Two independent mechanisms reconstruct the past: knowledge dates on the record, and a fold of the event log. They are checked against each other because either alone could be quietly wrong.</div>';
  }
  var recent=eventLog({limit:12}).slice().reverse();
  body+=uiFold('event-recent','Recent events',recent.length+' most recent',
    recent.map(function(e){return uiRow(esc(e.type),String(e.at).slice(5,16).replace('T',' '),
      {sub:'device '+esc(String(e.device||'').slice(0,12))+' \u00b7 seq '+e.seq});}).join('')+
    '<div class="prov">Every change is recorded as something that happened, not as the state it produced.</div>');
  return {body:body,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openYields(){_YIELDS=null;_YIELD_RESULT=null;_YIELD_RAW='';_YIELD_Q='';
  openSheet('edit',{form:'yields',title:'Raw to cooked',desc:'Recipes give raw weights; a food scale after cooking gives another. These are USDA measurements of how much weight a food actually loses or gains in preparation.',buf:{}});
  loadReferenceTable('yields').then(function(){if(_SHEET&&_SHEET.opts.form==='yields')renderSheet();}).catch(function(e){_q(e,'P2');});}
SHEETS.yields=function(){
  var info=yieldTableInfo();
  if(!info.installed)return {body:'<div class="hint">Loading the yield table\u2026</div>',
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};
  var body=uiRow('Table',fmtNum(info.count,0)+' verified factors',{sub:esc(info.note)})+
    '<div class="form-pair">'+
      '<label class="fld"><span>Raw weight (g)</span><input id="yieldRaw" type="text" inputmode="decimal" placeholder="200" value="'+attrEsc(_YIELD_RAW)+'" data-act="yields.field" data-arg="raw" data-ev="input"></label>'+
      '<label class="fld"><span>Find a food</span><input id="yieldQuery" type="text" placeholder="fillet, roasted, boiled\u2026" value="'+attrEsc(_YIELD_Q)+'" data-act="yields.field" data-arg="q" data-ev="input"></label>'+
    '</div>'+
    '<div class="btn-row">'+uiBtn('Search','yields.search',null,'btn-sm btn-secondary')+'</div>';
  if(_YIELD_RESULT){
    var r=_YIELD_RESULT;
    body+='<div class="est-block"><div class="eb-head">'+fmtNum(r.raw,0)+' g raw \u2192 '+fmtNum(r.grams,0)+' g prepared</div>'+
      '<div class="eb-qual">USDA AH-102 item '+esc(String(r.code))+' \u00b7 page '+esc(String(r.page))+'</div>'+
      '<div class="eb-body">'+esc(r.to)+'. Yield '+fmtNum(r.factor*100,0)+'%, loss '+esc(String(r.lossPercent))+'% \u2014 the two were checked against each other before this figure was accepted.</div></div>';
  }
  if(_YIELDS&&_YIELDS.rows.length){
    body+=_YIELDS.rows.map(function(y){
      return uiRow(esc(String(y.label).slice(0,54)),uiBtn(y.percent+'%','yields.apply',y.code,'btn-sm btn-ghost'),
        {sub:'item '+y.code+' \u00b7 page '+y.page+' \u00b7 loses '+y.lossPercent+'%'});}).join('')+
      '<div class="prov">'+esc(_YIELDS.note)+'</div>';
  }else if(_YIELDS){body+='<div class="hint">Nothing matched. The descriptions come from scanned pages and are often partial \u2014 try a single word.</div>';}
  return {body:body+'<div class="prov">'+esc(info.caveat)+'</div>',
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openLabel(){_LABEL=null;openSheet('edit',{form:'label',title:'Read a nutrition panel',desc:'Paste the panel text \u2014 from your camera\u2019s live text, a photo app, or by hand. No OCR engine is bundled; the system that already does it well does it better.',buf:{}});}
SHEETS.label=function(){
  var body='<label class="fld"><span>Product name</span><input id="labelName" type="text" placeholder="Oat bar"></label>'+
    '<label class="fld"><span>Panel text</span><textarea id="labelText" rows="7" placeholder="Serving size 55g&#10;Calories 240&#10;Total Fat 12g&#10;Protein 9g"></textarea></label>'+
    '<div class="btn-row">'+uiBtn('Read it','label.parse',null,'btn-sm btn-secondary')+'</div>';
  if(_LABEL&&_LABEL.ok){
    body+=uiRow('Found',_LABEL.fieldsFound+' values',{sub:'per '+(_LABEL.basis==='serving'?('serving'+(_LABEL.servingGrams?(' of '+_LABEL.servingGrams+' g'):'')):('100 '+_LABEL.basis))})+
      Object.keys(_LABEL.per).map(function(k){return uiRow(esc(k),esc(String(_LABEL.per[k])),{});}).join('')+
      (_LABEL.warnings.length?('<div class="hint warn">'+_LABEL.warnings.map(esc).join('<br>')+'</div>'):'')+
      '<div class="prov">'+esc(_LABEL.note)+'</div>'+
      '<div class="btn-row">'+uiBtn('Save as a food','label.save',null,'btn-sm btn-primary')+'</div>';
  }else if(_LABEL){body+='<div class="hint warn">'+esc(_LABEL.reason)+(_LABEL.hint?(' \u2014 '+esc(_LABEL.hint)):'')+'</div>';}
  return {body:body,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openSync(){openSheet('edit',{form:'sync',title:'Sync',desc:'Devices exchange events, not snapshots. Merging is a union of facts, so nothing is discarded and no writer overwrites another.',buf:{}});}
SHEETS.sync=function(){var st=syncState();var es=eventStats();var cf=syncConflicts();
  return {body:uiRow('This device',esc(deviceId()),{sub:'identity is local; there is no account and no server'})+
    uiRow('Event log',fmtNum(es.count,0)+' events',{sub:es.types+' types \u00b7 '+(es.first?shortDate(es.first.slice(0,10)):'\u2014')+' to '+(es.last?shortDate(es.last.slice(0,10)):'\u2014')})+
    uiRow('Transport',esc(st.status),{sub:'other tabs converge automatically; other devices exchange a file'})+
    uiRow('Merges',st.merges+' \u00b7 '+st.received+' events received',{sub:st.lastSync?('last '+ageLabel(st.lastSync.slice(0,10))):'none yet'})+
    (cf.length?('<div class="card-title" style="margin-top:10px">Concurrent edits to review</div>'+cf.map(function(c){return uiRow(esc(c.what),esc(c.when),{sub:esc(c.detail)+' \u00b7 '+esc(c.resolution)});}).join('')):'')+
    '<div class="btn-row">'+uiBtn('Export a sync file','sync.export',null,'btn-sm btn-secondary')+uiBtn('Import a sync file','sync.import',null,'btn-sm btn-secondary')+uiBtn('Broadcast now','sync.push',null,'btn-sm btn-ghost')+'</div>'+
    '<div class="prov">A sync file carries events since the beginning and merges by union on event id. Importing the same file twice changes nothing.</div>',
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openKnowledge(){openSheet('edit',{form:'knowledge',title:'What this record knows about you',desc:'Confidence decays with age, because a finding from a different body weight and a different phase is a different finding.',buf:{}});}
SHEETS.knowledge=function(){var k=personalKnowledge();var g=knowledgeGaps();
  return {body:uiRow('Established',k.count+' items',{sub:k.current+' current \u00b7 '+k.stale+' stale \u00b7 half-life '+k.halfLifeDays+' days'})+
    ((k.conflicts||[]).length?'<div class="card-title" style="margin-top:8px">Findings that disagree</div>'+k.conflicts.map(function(c){
      return uiRow(esc(String(c.subject)),esc(c.text),{sub:esc('older counts '+Math.round(c.older.weight*100)+'%, newer '+Math.round(c.newer.weight*100)+'% \u00b7 '+c.settle),tone:'attention'});}).join(''):'')+
    k.items.map(function(i){return uiRow(esc(String(i.subject)),esc(i.statement),{sub:esc(i.kind)+' \u00b7 '+esc(i.evidence)+' \u00b7 context '+esc(i.context)+(i.transfers?(' \u00b7 '+esc(i.transfers)):''),rsub:i.freshness+' / '+i.decayedConfidence,tone:i.freshness==='stale'?'attention':''})+
      '<div class="hint" style="margin:-4px 0 4px 0">Would change if: '+esc(i.wouldChange)+'.</div>'+
      (i.testable?'<div class="btn-row" style="margin:-2px 0 8px 0">'+uiBtn('Test it','exp.design',i.subject,'btn-sm btn-secondary')+'</div>':'')+
      (i.revalidate?'<div class="prov" style="margin:-4px 0 8px 0">'+esc(i.revalidate)+'</div>':'');}).join('')+
    '<div class="card-title" style="margin-top:12px">Open questions</div>'+
    g.gaps.slice(0,6).map(function(x){return uiRow(esc(x.question),esc(x.uncertainty),{sub:esc(x.whyItMatters)+' \u00b7 '+esc(x.measurement)});}).join('')+
    '<div class="prov">'+esc(k.note)+'</div>',
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openEpisodes(){openSheet('edit',{form:'episodes',title:'Episodes',desc:'A phase is what you planned. An episode is what happened. The difference changes how a discontinuity should be read.',buf:{}});}
SHEETS.episodes=function(){var e=detectEpisodes(365);
  if(!e.episodes.length)return {body:uiEmpty('No episodes detected','Travel, illness, plateaus, training breaks and logging gaps appear here as they are inferred.',''),foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};
  return {body:e.episodes.map(function(x){return uiRow(esc(x.label),shortDate(x.start)+(x.end?(' \u2013 '+shortDate(x.end)):''),{sub:esc(x.interpretation)+' \u00b7 from '+esc(x.source),rsub:x.planned?'planned':'unplanned',tone:x.planned?'':'attention'});}).join('')+'<div class="prov">'+esc(e.note)+'</div>',
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openScenarios(){openSheet('edit',{form:'scenarios',title:'Compare plans',desc:'Ranked by expected outcome, which discounts each plan by how likely you are to execute it.',buf:{}});}
SHEETS.scenarios=function(){
  var cmp=compareScenarios([buildScenario('Hold the current plan',{}),
    buildScenario('\u2212300 kcal/day',{calories:-300}),
    buildScenario('+3,000 steps/day',{steps:3000}),
    buildScenario('+1 cardio session',{cardio:1}),
    buildScenario('\u2212300 kcal and +3,000 steps',{calories:-300,steps:3000})]);
  var mc=monteCarloForecast({weeks:12});
  return {body:cmp.rows.map(function(r){return uiRow(esc(r.name),r.ratePerWeek!=null?fmtRate(r.ratePerWeek):'\u2014',
    {sub:'expected '+(r.expectedRate!=null?fmtRate(r.expectedRate):'\u2014')+' after execution likelihood'+(r.executionLikelihood!=null?(' '+Math.round(r.executionLikelihood*100)+'%'):'')+' \u00b7 burden '+r.burden+' \u00b7 '+esc(r.verdict),
     rsub:r.endWeight!=null?fmtWeight(r.endWeight):'',tone:r.verdict==='plausible'?'good':'attention'});}).join('')+
    (mc.status==='ok'?('<div class="card-title" style="margin-top:12px">Twelve-week distribution</div>'+
      uiRow('Median',fmtWeight(mc.median),{sub:'middle half '+fmtWeight(mc.p25,{bare:true})+'\u2013'+fmtWeight(mc.p75)+' \u00b7 80% range '+fmtWeight(mc.p10,{bare:true})+'\u2013'+fmtWeight(mc.p90)})+
      (mc.probReachGoal!=null?uiRow('Chance of reaching the goal',Math.round(mc.probReachGoal*100)+'%',{sub:'from '+fmtNum(mc.draws,0)+' simulations on your own rate uncertainty and scale noise'}):'')+
      '<div class="prov">'+esc(mc.caveat)+'</div>'):'')+
    '<div class="prov">'+esc(cmp.note)+'</div>',
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openDesign(focus){openSheet('edit',{form:'design',title:'Design an experiment',desc:'Duration is derived from your own measurement noise. An experiment too short to detect its effect produces a confident-looking null.',buf:{focus:(typeof focus==='string'&&RESPONSE_VARS[focus])?focus:null}});}
SHEETS.design=function(b){
  var vars=Object.keys(RESPONSE_VARS);if(b&&b.focus)vars=[b.focus].concat(vars.filter(function(v){return v!==b.focus;}));
  return {body:vars.map(function(v){var d=designExperiment({variable:v,delta:RESPONSE_VARS[v].scale*2});
    return uiRow(esc(v)+' '+fmtSigned(RESPONSE_VARS[v].scale*2,0),d.weeksNeeded?(d.weeksNeeded+' weeks'):'\u2014',
      {sub:esc(d.verdict),rsub:d.feasible?'feasible':'not worth running',tone:d.feasible?'good':'negative'});}).join('')+
    '<div class="prov">Each duration is what it would take to distinguish the expected effect from your own day-to-day noise.</div>',
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openImport(){_IMPORT={status:'idle'};openSheet('edit',{form:'import',title:'Import from another app',desc:'Every import is previewed before anything is written, deduplicated against what you already have, and tagged with where it came from.',buf:{}});}
SHEETS['import']=function(){
  return {body:Object.keys(IMPORT_SOURCES).filter(function(k){return k!=='manual';}).map(function(k){
      var s2=IMPORT_SOURCES[k];return uiRow(esc(s2.label),esc(String(s2.format||'').toUpperCase()),{sub:esc(s2.note)+' \u00b7 trust '+s2.trust});}).join('')+
    /* A real file picker. This was a button wired to data.restoreFile — which expects a file input, so it did nothing,
       and which is the BACKUP RESTORE path, so a health export would have been treated as a backup. No health file
       could be imported from the app; every parser was reachable only from tests. */
    '<label class="btn btn-sm btn-primary file-pick">Choose an export file\u2026<input id="importFile" type="file" accept=".xml,.csv,text/xml,text/csv" data-act="import.file" data-ev="change" hidden></label>'+
    (_IMPORT.status==='reading'?'<div class="hint">Reading '+esc(_IMPORT.name)+'\u2026 '+(_IMPORT.progress||'')+'</div>':'')+
    (_IMPORT.preview?_importPreviewHtml():'')+
    '<div class="prov">No wearable API is called and none can be without platform credentials: these are file imports. An imported value is never presented as one you measured \u2014 it carries its source, its device and a trust weight, and where two sources disagree the disagreement is reported rather than silently resolved.</div>',
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openPhotos(){setTimeout(hydratePhotoThumbs,0);openSheet('edit',{form:'photos',title:'Progress photos',desc:'Photos are stored in the browser database, never in the record document, so exports stay small and a photo is never shared by exporting a backup.',buf:{}});}
/* ---- PROGRESS PHOTOS ----
   The gallery and comparisons existed, and addPhoto() existed, but nothing ever called it: there was no way to add a
   photo at all. Taking one (the camera, on a phone) and choosing one from the library both land here, with the
   view and lighting recorded so photos can be compared fairly. */
var _PHOTO_FORM={view:'front',lighting:'diffuseIndoor',note:''};
SHEETS.photos=function(){
  var _todaySwitch=(DB.settings.photos||[]).length?'<div class="btn-row">'+uiBtn(DB.settings.showPhotoOnToday!==false?'Stop showing the latest on Today':'Show the latest on Today','photo.todayToggle',null,'btn-sm btn-ghost')+'</div>':'';var m=photoMeta();
  var pairs=photoPosePairs();
  var chips=function(reg,cur,act){return '<div class="btn-row" style="margin-top:4px">'+Object.keys(reg).map(function(k){
    return uiBtn(reg[k].label,act,k,'btn-sm '+(cur===k?'btn-primary':'btn-secondary'));}).join('')+'</div>';};
  var v=PHOTO_VIEWS[_PHOTO_FORM.view]||PHOTO_VIEWS.front,l=LIGHTING_KINDS[_PHOTO_FORM.lighting]||LIGHTING_KINDS.mixed;
  var add='<div class="card-title">Add a photo</div>'+
    uiRow('View','',{sub:chips(PHOTO_VIEWS,_PHOTO_FORM.view,'photo.view')+'<div class="hint">'+esc(v.cue)+'</div>'})+
    uiRow('Lighting','',{sub:chips(LIGHTING_KINDS,_PHOTO_FORM.lighting,'photo.light')+'<div class="hint">consistency: '+esc(l.consistency)+'</div>'})+
    '<label class="fld"><span>Note (optional)</span><input id="photoNote" type="text" maxlength="200" value="'+esc(_PHOTO_FORM.note)+'" aria-label="photo note"></label>'+
    '<div class="btn-row">'+uiBtn('Take photo','photo.pick','camera','btn-sm btn-primary')+uiBtn('Choose from library','photo.pick','library','btn-sm btn-secondary')+'</div>'+
    '<input id="photoCam" class="visually-hidden" aria-label="Take a photo" type="file" accept="image/*" capture="environment" data-act="photo.file" data-arg="camera" data-ev="change" tabindex="-1" aria-hidden="true">'+
    '<input id="photoLib" class="visually-hidden" aria-label="Choose a photo" type="file" accept="image/*" data-act="photo.file" data-arg="library" data-ev="change" tabindex="-1" aria-hidden="true">'+
    '<div class="hint">Photos stay on this device, resized to '+PHOTO_MAX_EDGE+' px. Same view, same light and the same time of day make two photos worth comparing.</div>';
  var gallery=m.length?('<div class="card-title" style="margin-top:12px">Your photos</div><div class="photo-grid">'+m.slice(0,24).map(function(p){
    var vw=(PHOTO_VIEWS[p.view||p.pose]||{}).label||p.pose;
    return '<figure class="photo-cell"><img data-photo="'+esc(p.id)+'" alt="'+esc(vw+' photo, '+shortDate(p.date))+'" loading="lazy">'+
      '<figcaption><span>'+esc(vw)+' \u00b7 '+esc(shortDate(p.date))+'</span>'+(p.weight!=null?'<span>'+fmtWeight(p.weight)+'</span>':'')+
      uiBtn('Delete','photo.delete',p.id,'btn-sm btn-ghost')+'</figcaption></figure>';}).join('')+'</div>'):
    uiEmpty('No photos yet','Add one above. A photo every two to four weeks, same view and light, shows change that the scale cannot.','');
  var comps=pairs.length?('<div class="card-title" style="margin-top:10px">Comparisons</div>'+pairs.map(function(p){return uiRow(esc(p.label),p.days+' days apart',
    {sub:(p.weightChange!=null?(fmtSigned(p.weightChange,1)+' lb between them'):'')});}).join('')+
    '<div class="prov">Same view, furthest apart in time \u2014 an honest comparison rather than a flattering one.</div>'):'';
  return {body:_todaySwitch+add+gallery+comps,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
/* Thumbnails come from IndexedDB, asynchronously, after the sheet has rendered. */
function hydratePhotoThumbs(){
  if(typeof document==='undefined')return;
  [].slice.call(document.querySelectorAll('img[data-photo]')).forEach(function(img){
    if(img.getAttribute('src'))return;
    loadPhoto(img.getAttribute('data-photo')).then(function(u){if(u)img.setAttribute('src',u);else img.setAttribute('alt',img.getAttribute('alt')+' (image not found on this device)');});});
}
function _photoRerender(){renderSheet();setTimeout(hydratePhotoThumbs,0);}
registerAction('photo.view',function(k){if(PHOTO_VIEWS[k]){_PHOTO_FORM.view=k;_photoRerender();}});
registerAction('photo.light',function(k){if(LIGHTING_KINDS[k]){_PHOTO_FORM.lighting=k;_photoRerender();}});
registerAction('photo.pick',function(which){var n=document.getElementById('photoNote');if(n)_PHOTO_FORM.note=n.value;
  var el=document.getElementById(which==='camera'?'photoCam':'photoLib');if(el){el.value='';el.click();}});
registerAction('photo.file',function(which,ev,el){
  var f=el&&el.files&&el.files[0];if(!f)return;
  var n=document.getElementById('photoNote');if(n)_PHOTO_FORM.note=n.value;
  toast('Saving photo\u2026');
  addPhoto(f,{view:_PHOTO_FORM.view,lighting:_PHOTO_FORM.lighting,note:_PHOTO_FORM.note,source:which}).then(function(r){
    _PHOTO_FORM.note='';_photoRerender();
    toast('Photo saved'+(r.scaled?(' \u00b7 '+fmtNum(r.bytes/1024,0)+' KB'):''));
  }).catch(function(e){toast(String(e&&e.message||e),{tone:'negative'});});});
registerAction('photo.delete',function(id){deletePhoto(id);_photoRerender();toast('Photo deleted');});
function openStorage(){openSheet('edit',{form:'storage',title:'Storage',desc:'What the record costs, what the food cache costs, and what can be removed without losing anything you logged.',buf:{}});
  storageEstimate().then(function(est){if(_SHEET&&_SHEET.opts.form==='storage'){_SHEET.opts.buf.est=est;renderSheet();}});}
SHEETS.storage=function(b){var sm=storageManager();var est=b.est;
  var body=uiRow('Record',sm.record?fmtNum(sm.record.bytes/1024,0)+' KB':'\u2014',{sub:sm.record?(fmtNum(sm.record.observations,0)+' observations \u00b7 '+fmtNum(sm.record.foodLogs,0)+' food entries \u00b7 '+fmtNum(sm.record.sessions,0)+' sessions \u00b7 about '+sm.record.perObservation+' bytes each'):''})+
    uiRow('Writes','<strong>'+(sm.persistence.ratio!=null?sm.persistence.ratio+'% incremental':'\u2014')+'</strong>',{sub:sm.persistence.incremental+' incremental \u00b7 '+sm.persistence.full+' whole-record \u00b7 '+fmtNum(sm.persistence.collectionsWritten,0)+' collection writes \u00b7 checkpoint every '+sm.persistence.checkpointEvery,rsub:sm.persistence.sinceCheckpoint+' since checkpoint'})+
    uiRow('localStorage mirror',sm.mirror.usable===false?'over budget':'in use',{sub:esc(sm.mirror.note),tone:sm.mirror.usable===false?'attention':'neutral'})+
    uiRow('Food shard cache',sm.foodCache.entries+' in memory',{sub:Object.keys(sm.foodCache.byClass).map(function(k){return k+' '+sm.foodCache.byClass[k]+'/'+sm.foodCache.limits[k];}).join(' \u00b7 ')});
  if(est&&est.supported)body+=uiRow('Origin quota',fmtNum(est.usage/1048576,1)+' MB of '+fmtNum(est.quota/1048576,0)+' MB',{sub:esc(est.note),rsub:est.pressure,tone:est.pressure==='critical'?'negative':(est.pressure==='high'?'attention':'good')});
  else if(est)body+=uiRow('Origin quota','not reported',{sub:esc(est.note)});
  body+='<div class="divider"></div>'+sm.actions.map(function(a2){return uiRow(esc(a2.label),uiBtn(a2.destructive?'Delete':'Run',a2.act,null,'btn-sm '+(a2.destructive?'btn-danger':'btn-ghost')),{sub:esc(a2.why)});}).join('');
  return {body:body,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
SHEETS.integrity=function(b){var ic=b.ic;
  if(!ic.issues.length)return {body:uiEmpty('No integrity problems','Collections are well formed, ids are unique, dates parse, and every retraction carries the date it happened.',''),foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};
  return {body:uiRow('Result',ic.ok?uiPill('no blocking issues','good'):uiPill(ic.blocking.length+' blocking','negative'),{sub:['P0','P1','P2','P3'].map(function(k){return k+' '+ic.counts[k];}).join(' \u00b7 ')})+
    ic.issues.map(function(i){return uiRow(esc(i.what),uiPill(i.severity,i.severity==='P0'?'negative':(i.severity==='P1'?'attention':'neutral')),{sub:esc(i.detail||'')+' \u00b7 '+esc(SEVERITIES[i.severity])});}).join('')+
    '<div class="prov">'+esc(ic.note)+'</div>',
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openHealth(){openSheet('edit',{form:'health',title:'System health',desc:'Only failures you can act on carry an action. Anything you cannot act on says so rather than offering a button that does nothing.',buf:{}});}
SHEETS.health=function(){var h=systemHealth();
  if(!h.issues.length)return {body:uiEmpty('Everything is working','Storage is writing, no record was quarantined, and no errors were handled silently.',''),foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};
  return {body:h.issues.map(function(i){
    return '<div class="list-item"><div class="li-head"><div class="li-title">'+esc(i.what)+'</div><div class="li-meta">'+uiPill(i.severity,i.severity==='critical'?'negative':(i.severity==='warn'?'attention':'neutral'))+'</div></div>'+
      '<div class="li-body"><div class="muted">'+esc(i.why)+'</div><div style="margin-top:4px">'+esc(i.cando)+'</div>'+
      (i.act?('<div class="btn-row">'+uiBtn(i.recoverable?'Do this':'Export diagnostics',i.act,null,'btn-sm btn-primary')+'</div>'):'')+'</div></div>';}).join(''),
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openSetup(){openSheet('edit',{form:'setup',title:'Setup',desc:'Each item says what it unlocks. Nothing here is required \u2014 the app states what it cannot do without them instead of blocking.',buf:{}});}
SHEETS.setup=function(){var sc=setupCompleteness();
  return {body:uiRow('Complete','<strong>'+sc.done+' / '+sc.total+'</strong>',{sub:sc.pct+'%',tone:sc.complete?'good':'attention'})+
    sc.items.map(function(i){return uiRow(esc(i.label),i.done?uiPill('done','good'):uiBtn('Do this',i.act,i.arg||'','btn-sm btn-secondary'),{sub:'unlocks '+esc(i.unlocks),rsub:i.progress||''});}).join(''),
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openWhatChanged(){openSheet('edit',{form:'whatChanged',title:'What changed',desc:'Taken from the decision ledger and phase history, so it cannot disagree with what the system actually did.',buf:{}});}
SHEETS.whatChanged=function(){var c=whatChanged(30);
  if(c.empty)return {body:uiEmpty('Nothing changed in the last 30 days','Interventions, target edits, decisions and program changes appear here.',''),foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};
  return {body:c.items.map(function(i){return uiRow(esc(i.what),shortDate(i.date),{sub:esc(i.reason||'')+(i.confidence?(' \u00b7 confidence '+esc(i.confidence)):'')+(i.recheck?(' \u00b7 recheck '+shortDate(i.recheck)):''),rsub:i.kind});}).join(''),
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openKeyboardHelp(){openSheet('edit',{form:'keys',title:'Keyboard',desc:'Shortcuts are accelerators. Everything here is also reachable from a visible control or the command palette.',buf:{}});}
SHEETS.keys=function(){var groups={};KEYMAP.forEach(function(k){(groups[k.group]=groups[k.group]||[]).push(k);});
  return {body:COMMAND_GROUPS.filter(function(g){return groups[g.id];}).map(function(g){
    return '<div class="card-title" style="margin-top:10px">'+esc(g.label)+'</div>'+groups[g.id].map(function(k){return uiRow('<span class="kbd">'+esc(k.keys)+'</span>',esc(k.label),{});}).join('');}).join('')+
    '<div class="prov">The command palette (\u2318K) lists every command with its shortcut, so no capability depends on remembering one.</div>',
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openUndoHistory(){openSheet('edit',{form:'undoHistory',title:'Undo history',desc:'Newest first. Each entry says what it will revert before you commit to it.',buf:{}});}
SHEETS.undoHistory=function(){var h=undoHistory();
  if(!h.length)return {body:uiEmpty('Nothing to undo','Changes you make are recorded here with a description.',''),foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};
  return {body:h.slice(0,20).map(function(u){return uiRow(esc(u.label),uiBtn(u.steps===1?'Undo this':'Undo '+u.steps+' steps','undo.at',String(u.steps),'btn-sm '+(u.steps===1?'btn-primary':'btn-ghost')),{sub:u.at?('recorded '+String(u.at).slice(11,16)+' \u00b7 '+u.age):''});}).join(''),
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
function openObsInspect(id){var o=DB.observations.filter(function(x){return x.id===id;})[0];if(!o)return;openSheet('edit',{form:'obsInspect',title:'Observation',desc:'',buf:{o:o}});}
SHEETS.obsInspect=function(b){var o=b.o;var t=OBS_TYPES[o.type]||{};var mq=measurementQuality(o);
  var body=uiRow(esc(t.label||o.type),'<strong>'+(o.value!=null?esc(String(o.value)):'\u2014')+' '+esc(t.unit||'')+'</strong>',{sub:longDate(o.date)+' \u00b7 '+esc(o.source||'')+(o.method?(' \u00b7 '+esc(o.method)):'')})+
    uiRow('Recorded',esc(String(o.createdAt||o.at||'').slice(0,16).replace('T',' ')),{sub:'knowledge date \u2014 this is what replay uses, not the observation date'})+
    uiRow('Measurement quality',fmtNum(mq.score*100,0)+'%',{sub:mq.factors.length?esc(mq.factors.join('; ')):'no deductions',tone:mq.level==='high'?'good':(mq.level==='moderate'?'attention':'negative')});
  if(o.flags&&o.flags.length)body+='<div class="hint warn">'+o.flags.map(esc).join('<br>')+'</div>';
  if(o.supersedes)body+=uiRow('Supersedes an earlier entry',esc(String(o.supersedes)),{sub:'this value corrected a previous one'});
  if(o.correctedBy)body+=uiRow('Corrected',esc(o.correctedAt?localDateOf(o.correctedAt):''),{sub:'a later entry supersedes this one; replays of days before that date still see this value'});
  if(o.retracted)body+=uiRow('Retracted',esc(String(o.retractedAt||'').slice(0,10)),{sub:'kept in the record; replays of days before that date still see it'});
  var proto=protocolFor(o.type);
  if(proto)body+=uiFold('proto-'+o.id,'Measurement protocol',proto.cadence,'<ul>'+proto.steps.map(function(x){return '<li>'+esc(x)+'</li>';}).join('')+'</ul>'+(proto.driftNote?'<div class="prov">'+esc(proto.driftNote)+'</div>':''));
  return {body:body,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'+(o.retracted?'':'<button class="btn btn-danger" data-act="obs.retract" data-arg="'+o.id+'">Retract</button>')};};
function openDecisionInspect(id){var d=(DB.decisions||[]).filter(function(x){return x.id===id;})[0];if(!d)return;openSheet('edit',{form:'decisionInspect',title:d.verb||d.code,desc:'',buf:{d:d}});}
SHEETS.decisionInspect=function(b){var d=b.d;var li=function(w){return '<li>'+esc(typeof w==='string'?w:(w.text||''))+'</li>';};
  var body=uiRow('Decided',longDate(d.date),{sub:esc(d.code)+' \u00b7 confidence '+esc(d.confidence||'\u2014')+' \u00b7 '+esc(d.source||'system')})+
    (d.lede?'<div class="lead" style="font-size:14px;margin:8px 0">'+esc(d.lede)+'</div>':'')+
    (d.why&&d.why.length?'<div class="d-block"><div class="d-block-title">WHY</div><ul>'+d.why.map(li).join('')+'</ul></div>':'')+
    (d.action&&d.action.length?'<div class="d-block"><div class="d-block-title">DO</div><ul>'+d.action.map(li).join('')+'</ul></div>':'')+
    (d.reverseIf&&d.reverseIf.length?'<div class="d-block"><div class="d-block-title">WHAT WOULD CHANGE IT</div><ul>'+d.reverseIf.map(function(w){return '<li class="attention">'+esc(w)+'</li>';}).join('')+'</ul></div>':'')+
    (d.uncertainty?'<div class="d-block"><div class="d-block-title">HOW SURE THE NUMBERS WERE</div><div class="muted">'+esc(d.uncertainty.text||'')+'</div></div>':'')+
    '<div class="btn-row">'+uiBtn('Why am I seeing this?','why.shown','decision|'+d.id,'btn-sm btn-ghost')+uiBtn('Copy as a report','copy.decision',d.id,'btn-sm btn-ghost')+'</div>';
  return {body:body,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
/* ---- accessibility audit (assertions, not decoration) ---- */
function runA11yAudit(){var issues=[];var q=function(s){return Array.prototype.slice.call(document.querySelectorAll(s));};
  q('button,[role=button],a[href],input,select,textarea').forEach(function(el){if(el.closest('template'))return;var name=(el.getAttribute('aria-label')||el.textContent||el.getAttribute('title')||el.getAttribute('placeholder')||'').trim();var labelled=el.id&&document.querySelector('label[for="'+el.id+'"]');var wrapped=el.closest('label');if(!name&&!labelled&&!wrapped&&el.type!=='hidden'&&!el.classList.contains('sr-only'))issues.push({kind:'unnamed control',el:(el.tagName+(el.className?'.'+String(el.className).split(' ')[0]:''))});});
  q('[tabindex]').forEach(function(el){if(+el.getAttribute('tabindex')>0)issues.push({kind:'positive tabindex',el:el.tagName});});
  q('[role=dialog],[role=alertdialog]').forEach(function(el){if(!el.getAttribute('aria-labelledby')&&!el.getAttribute('aria-label'))issues.push({kind:'dialog without label',el:el.id||el.tagName});});
  var hs=q('h1,h2,h3,h4').filter(function(x){return x.offsetParent!==null||x.closest('.view.active');});var last=0;hs.forEach(function(h2){var lvl=+h2.tagName[1];if(last&&lvl>last+1)issues.push({kind:'heading skips a level',el:h2.tagName+' "'+h2.textContent.slice(0,30)+'"'});last=lvl;});
  q('details.fold>summary').forEach(function(s){/* native disclosure semantics; verify it is reachable */if(s.tabIndex<0)issues.push({kind:'summary not focusable',el:'summary'});});
  q('.view.active .btn,.view.active .chip,.fab,.fab-mini,.tab,.day-strip button,.scale-row button').forEach(function(el){var r=el.getBoundingClientRect();if(r.width&&r.height&&(r.height<34||r.width<34)&&!el.classList.contains('link'))issues.push({kind:'touch target under 34px',el:el.textContent.trim().slice(0,20)||el.className});});
  q('.pill.good,.pill.negative,.pill.attention').forEach(function(el){if(!el.textContent.trim())issues.push({kind:'color-only signal',el:'pill'});});
  q('img').forEach(function(i){if(!i.hasAttribute('alt'))issues.push({kind:'image without alt',el:i.src});});
  var seen={};issues=issues.filter(function(i){var k=i.kind+'|'+i.el;if(seen[k])return false;seen[k]=1;return true;});
  return {issues:issues,checked:['names on controls','tabindex','dialog labels','heading order','disclosure focus','touch targets','color-only signals','image alt']};}
registerAction('a11y.audit',function(){var r=runA11yAudit();var el=document.getElementById('selfTestOut');if(el)el.innerHTML='<div class="prov" style="margin-top:8px">Checked: '+r.checked.join(', ')+'</div>'+(r.issues.length?'<div class="table-wrap"><table class="data"><thead><tr><th>issue</th><th>element</th></tr></thead><tbody>'+r.issues.map(function(i){return '<tr><td>'+esc(i.kind)+'</td><td>'+esc(i.el)+'</td></tr>';}).join('')+'</tbody></table></div>':'<div class="good" style="color:var(--good);margin-top:6px">No issues found on the current view.</div>');toast(r.issues.length?(r.issues.length+' accessibility issues'):'Accessibility audit clean');});
registerAction('selftest.run',function(){_SELFTEST=runSelfTest();renderAll();toast(_SELFTEST.failed?(_SELFTEST.failed+' self-test failures'):'Self-test passed ('+_SELFTEST.passed+')',{tone:_SELFTEST.failed?'negative':''});});

/* ============================================================================
   ONE MOVEMENT SYSTEM. The expansion first built new screens beside existing ones \u2014 a second Mobility sheet, a second
   After-the-session sheet, a second warm-up and cool-down \u2014 and the older definitions silently replaced the new ones.
   The existing screens are the canonical ones and are expanded here instead.
   ============================================================================ */
(function(){
  var baseMob=SHEETS.mobility;
  SHEETS.mobility=function(){var r=baseMob.apply(this,arguments)||{body:''};
    var routines=Object.keys(MOBILITY_ROUTINES).map(function(k){var rr=mobilityRoutine(k);
      return '<button class="lib-row" data-act="nav.routine" data-arg="'+k+'"><span class="lib-name">'+esc(rr.title)+'</span><span class="lib-meta">'+esc(rr.why)+'</span><span class="lib-level">'+rr.minutes+' min</span></button>';}).join('');
    var byRegion=Object.keys(MOBILITY_REGIONS).map(function(g){var items=MOBILITY_LIBRARY.filter(function(m){return m.regions.indexOf(g)>=0;});
      return '<details class="mob-region"><summary>'+esc(MOBILITY_REGIONS[g])+' <span class="lib-meta">'+items.length+'</span></summary>'+
        items.map(function(m){return uiRow(esc(m.name),esc(m.dose),{sub:esc(m.cues[0])+' \u00b7 '+(m.type==='stretch'?'held stretch':'moving drill')});}).join('')+'</details>';}).join('');
    var wk=mobilityThisWeek();
    r.body='<div class="hint">This week: '+(wk.count?(wk.count+' routine'+(wk.count===1?'':'s')+', '+wk.minutes+' minutes'):'nothing logged yet')+'</div><div class="card-title">Routines</div>'+routines+'<div class="card-title" style="margin-top:12px">Stretches and drills by body area</div>'+byRegion+
      '<div class="card-title" style="margin-top:14px">Your range</div>'+r.body;
    return r;};
  var baseRec=SHEETS.recover;
  SHEETS.recover=function(){var r=baseRec.apply(this,arguments)||{body:''};
    var last=(DB.sessions||[]).filter(function(x){return !x.retracted;}).slice(-1)[0];
    var id=(_POST&&_POST.id)||(last&&last.id);var P=id?postSessionSummary(id):null;
    if(!P)return r;
    var s=P.session;
    var head='<div class="hint">'+esc(s.name||'Session')+' \u00b7 '+esc(shortDate(s.date))+'</div><div class="post-stats"><div><b>'+P.exercises+'</b><span>exercises</span></div><div><b>'+P.sets+'</b><span>sets</span></div><div><b>'+P.hardSets+'</b><span>hard sets</span></div>'+
      (s.durationMin?'<div><b>'+s.durationMin+'</b><span>minutes</span></div>':'')+'</div>'+
      (P.records.length?'<div class="card-title" style="margin-top:10px">New records</div>'+P.records.map(function(x){
        return uiRow(esc(x.exercise),fmtNum(x.value,0),{sub:esc(x.what)+', up from '+fmtNum(x.was,0),tone:'good'});}).join(''):'')+
      '<div class="card-title" style="margin-top:10px">Worked</div><p class="post-muscles">'+esc(P.muscles.map(function(m){return _mname(m)+' ('+P.muscleSets[m]+' sets)';}).join(', '))+'</p>'+
      '<div class="card-title" style="margin-top:10px">How hard was that?</div><div class="btn-row wrap">'+[1,2,3,4,5,6,7,8,9,10].map(function(n){
        return uiBtn(String(n),'post.effort',String(n),'btn-sm '+(s.effort===n?'btn-primary':'btn-secondary'));}).join('')+'</div>'+
      '<div class="hint">1 is very easy, 10 is as hard as you can go.</div>'+
      '<div class="card-title" style="margin-top:10px">How do you feel?</div>'+_chipRow([['drained','Drained'],['ok','OK'],['good','Good']],s.feel||'','post.feel')+
      (P.next.length?'<div class="card-title" style="margin-top:10px">Next time</div>'+P.next.slice(0,6).map(function(n){return uiRow(esc(n.exercise),'',{sub:esc(n.text)});}).join(''):'');
    var cool='<div class="card-title" style="margin-top:12px">Stretches for what you trained \u00b7 about '+P.coolDown.minutes+' min</div>'+_routineBody(P.coolDown)+
      '<div class="btn-row">'+uiBtn('Mark cool-down done','mob.cooldownDone',null,'btn-sm btn-secondary')+'</div>';
    r.body=head+'<div class="card-title" style="margin-top:12px">Cool-down</div>'+r.body+cool;
    return r;};
  var baseLib=SHEETS.moveLibrary;
  if(baseLib)SHEETS.moveLibrary=function(){var r=baseLib.apply(this,arguments)||{body:''};
    r.body='<button class="lib-row" data-act="nav.exlibrary"><span class="lib-name">Strength exercises</span><span class="lib-meta">'+EXERCISES.length+
      ' exercises \u2014 how to do each, what it works, easier and harder versions</span><span class="lib-level">\u2192</span></button>'+r.body;return r;};
  var baseEx=SHEETS.exlibrary;
  SHEETS.exlibrary=function(){var r=baseEx.apply(this,arguments);
    r.body='<button class="lib-row" data-act="move.library"><span class="lib-name">Mobility, activation and breathing</span><span class="lib-meta">the preparation and recovery side of the library</span><span class="lib-level">\u2192</span></button>'+r.body;return r;};
})();

/* ============================================================================
   WELCOME SETUP
   A first visit showed a six-second toast. Now it is a short guided setup \u2014 who you are, your goal, your training, how
   much detail you want, how it looks, how the app works \u2014 that can be skipped at any step and reopened from Tools.
   Every choice goes through the same setters the rest of the app uses; nothing is written a second way.
   ============================================================================ */
var WELCOME_STEPS=['welcome','about','goal','training','food','place','detail','look','tour','done'];
var _WZ={step:0,b:{}};
var WZ_EQUIP=[['bodyweight','Just bodyweight'],['dumbbell','Dumbbells'],['barbell','Barbell and rack'],['kettlebell','Kettlebells'],['band','Resistance bands'],['bar','Pull-up bar'],['machine','Gym machines and cables']];
var WZ_DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
function openWelcome(step){
  var p=DB.profile||{};
  _WZ={step:step||0,b:{units:unitPref(),sex:p.sex||'',age:p.age||'',heightFt:p.heightIn?Math.floor(p.heightIn/12):'',heightIn:p.heightIn?round(p.heightIn%12,1):'',
    height:p.heightIn?round(inToCm(p.heightIn),0):'',startWeight:fromCanonicalWeight(p.startWeightLb||((latestObs('weight')||{}).value))||'',   /* from the record when the profile has none */goalWeight:fromCanonicalWeight(p.goalWeightLb)||'',
    goal:canonicalGoal().type||'',trainingExperience:p.trainingExperience||'',
    equipment:Array.isArray(p.equipment)?p.equipment.slice():(p.equipment?String(p.equipment).split(/\s*,\s*/):[]),days:(DB.settings.trainingDays||[]).slice(),
    sessionMinutes:p.sessionMinutes||((typeof scheduleModel==='function'&&scheduleModel().minutes)||{}).full||'',cookingTime:p.cookingTime||'',foodBudget:p.foodBudget||'',dietRestrictions:Array.isArray(p.dietRestrictions)?p.dietRestrictions.slice():[]}};
  openSheet('edit',{form:'welcome',title:'Welcome',desc:'',buf:{}});
}
function _wzChips(list,cur,field,multi){return '<div class="btn-row wrap">'+list.map(function(x){
  var on=multi?(cur||[]).indexOf(x[0])>=0:cur===x[0];
  return '<button class="btn btn-sm '+(on?'btn-primary':'btn-secondary')+'" data-act="'+(multi?'welcome.toggle':'welcome.set')+'" data-arg="'+field+'|'+x[0]+'" aria-pressed="'+on+'">'+esc(x[1])+'</button>';}).join('')+'</div>';}
function _wzInput(field,label,type,unit){return '<label class="fld"><span>'+esc(label)+(unit?' ('+esc(unit)+')':'')+'</span><input id="wz-'+field+'" type="'+(type||'text')+'" inputmode="'+(type==='number'?'decimal':'text')+'" value="'+attrEsc(String(_WZ.b[field]==null?'':_WZ.b[field]))+'" data-act="welcome.field" data-arg="'+field+'" data-ev="input" aria-label="'+attrEsc(label)+'"></label>';}
SHEETS.welcome=function(){
  var st=WELCOME_STEPS[_WZ.step],b=_WZ.b,body='';
  var dots='<div class="wz-dots" aria-label="step '+(_WZ.step+1)+' of '+WELCOME_STEPS.length+'">'+WELCOME_STEPS.map(function(x,i){return '<span class="'+(i===_WZ.step?'on':(i<_WZ.step?'done':''))+'"></span>';}).join('')+'</div>';
  if(st==='welcome')body='<h2 class="wz-h">Welcome to Physique OS</h2><ul class="wz-list"><li>Log your weight, food and training in a few seconds.</li>'+
    '<li>Each day it tells you what to do next \u2014 and why.</li><li>It learns how <em>your</em> body responds, and says how sure it is.</li><li>Everything stays on this device.</li></ul>'+
    '<div class="hint">Setup takes about two minutes. You can skip any step and change everything later in Tools.</div>';
  if(st==='about')body='<h2 class="wz-h">About you</h2><div class="hint">Used to estimate how much energy you burn. Only what you want to share.</div>'+
    '<div class="card-title">Units</div>'+_wzChips([['imperial','Pounds and inches'],['metric','Kilograms and centimetres']],b.units,'units')+
    '<div class="card-title">Sex</div>'+_wzChips([['female','Female'],['male','Male'],['','Prefer not to say']],b.sex,'sex')+
    _wzInput('age','Age','number')+(b.units==='metric'?_wzInput('height','Height','number','cm'):('<div class="form-pair">'+_wzInput('heightFt','Height','number','ft')+_wzInput('heightIn','and','number','in')+'</div>'))+
    _wzInput('startWeight','Current weight','number',b.units==='metric'?'kg':'lb');
  if(st==='goal')body='<h2 class="wz-h">Your goal</h2>'+_wzChips([['fat_loss','Lose fat'],['maintenance','Maintain'],['muscle_gain','Build muscle'],['recomposition','Lose fat and build muscle'],['strength','Get stronger'],['general','General fitness']],canonicalGoalType(b.goal)||'','goal')+
    '<div class="hint">'+esc({fat_loss:'A steady loss, protecting muscle.',maintenance:'Hold your weight while training.',muscle_gain:'A slow gain, mostly muscle.',recomposition:'Weight roughly steady while body composition changes.',strength:'Strength first, with weight held steady.',general:'Feel fitter and move better, with no weight target.'}[canonicalGoalType(b.goal)]||'Pick the one that fits best \u2014 you can change it any time.')+'</div>'+
    ((['fat_loss','muscle_gain'].indexOf(canonicalGoalType(b.goal))>=0)?_wzInput('goalWeight','Goal weight (optional)','number',b.units==='metric'?'kg':'lb'):'');
  if(st==='training')body='<h2 class="wz-h">Your training</h2><div class="card-title">Experience</div>'+
    _wzChips([['novice','New to lifting'],['novice-intermediate','Some experience'],['intermediate','1\u20133 years'],['advanced','3 years or more']],b.trainingExperience,'trainingExperience')+
    '<div class="card-title">What you have</div>'+_wzChips(WZ_EQUIP,b.equipment,'equipment',true)+
    '<div class="card-title">My week</div>'+_wzChips([['weekly','Same days each week'],['rotation','Rotating shifts'],['irregular','It changes']],b.scheduleMode||'weekly','scheduleMode')+
    (b.scheduleMode&&b.scheduleMode!=='weekly'?'<div class="hint">'+(b.scheduleMode==='rotation'?'After setup, Plan \u2192 Schedule takes your rotation (2-2-3, DuPont, 4-on-4-off or your own) and what each shift leaves time for.':'After setup, Plan \u2192 Schedule takes the days you are free each fortnight.')+'</div>':
    '<div class="card-title">Days you can train</div>'+_wzChips(WZ_DAYS.map(function(d){return [d,d];}),b.days,'days',true))+
    '<div class="card-title">How long a session can be</div>'+_wzChips(CONSTRAINT_OPTIONS.sessionMinutes.map(function(x){return [String(x[0]),x[1]];}),String(b.sessionMinutes||''),'sessionMinutes')+
    '<div class="hint">Programmes are built from this: only exercises you can do with what you have, at your level.</div>';
  if(st==='food')body='<h2 class="wz-h">Food</h2><div class="hint">So meal suggestions fit how you actually eat.</div>'+
    '<div class="card-title">Cooking</div>'+_wzChips(CONSTRAINT_OPTIONS.cookingTime,b.cookingTime||'','cookingTime')+
    '<div class="card-title">Food budget</div>'+_wzChips(CONSTRAINT_OPTIONS.foodBudget,b.foodBudget||'','foodBudget')+
    '<div class="card-title">Anything you don\u2019t eat</div>'+_wzChips(CONSTRAINT_OPTIONS.dietRestrictions,b.dietRestrictions||[],'dietRestrictions',true);
  /* Weather for a place, offered during setup rather than left to be found (usage review). Optional; never guessed. */
  if(st==='place')body='<h2 class="wz-h">'+uiIcon('pin',{size:22})+' Your place, for weather</h2><div class="hint">Optional. The Today screen then shows the weather, the next hours and 14 days, and air quality. The app never reads your device location; type a town or city.</div>'+
    '<label class="fld"><span>Town or city</span><input id="wxPlace" type="text" autocomplete="off" value="'+attrEsc(b.q||'')+'" data-act="weather.q" data-ev="input" placeholder="e.g. Leeds"></label>'+uiMicBtn('wxPlace')+uiBtn('Search','weather.search',null,'btn-sm btn-secondary')+
    (b.places?b.places.map(function(p,i){return '<button class="lib-row" data-act="weather.pick" data-arg="'+i+'"><span class="lib-name">'+esc(p.label)+'</span></button>';}).join(''):'')+
    (b.searchError?'<div class="hint">'+esc(b.searchError)+' You can set it later: Today \u2192 Set up more, or the palette \u2192 Weather.</div>':'')+
    (weatherLocation()?'<div class="hint">'+uiIcon('check',{size:16})+' Set to '+esc(weatherLocation().label||'your place')+'.</div>':'');
  if(st==='detail')body='<h2 class="wz-h">How much detail?</h2>'+Object.keys(DETAIL_LEVELS).map(function(k){var L=DETAIL_LEVELS[k],on=detailLevel()===k;
    return '<button class="wz-card'+(on?' active':'')+'" data-act="welcome.detail" data-arg="'+k+'" aria-pressed="'+on+'"><span class="wz-card-t">'+esc(L.label)+(k==='casual'?' \u00b7 simplest':'')+'</span><span class="wz-card-d">'+esc(L.desc)+'</span></button>';}).join('')+
    '<div class="hint">Most people start with Casual or Insightful. Switch any time in Tools \u2192 Display.</div>';
  if(st==='look')body='<h2 class="wz-h">Look and feel</h2>'+colorsPicker().split('<div class="card-title" style="margin-top:10px">Background</div>')[0]+
    '<div class="card-title">Text size</div>'+_chipRow([['S','Small'],['M','Medium'],['L','Large'],['XL','Extra large']],DB.settings.textScale||'M','settings.textScale')+
    '<div class="hint">More text options \u2014 typefaces, spacing, weight \u2014 are in Tools \u2192 Text.</div>';
  if(st==='tour')body='<h2 class="wz-h">How it works</h2>'+[
      ['Today','Your one next step, and why. Check it once a day.'],
      ['The + button','Log anything \u2014 weight, food, a session \u2014 in a couple of taps.'],
      ['Progress','How your weight, waist and strength are moving.'],
      ['Train','Today\u2019s session, the exercise library, mobility and your history.'],
      ['Tools','Change anything you set here, back up your data, or see this guide again.']
    ].map(function(x){return '<div class="wz-tour"><b>'+esc(x[0])+'</b><span>'+esc(x[1])+'</span></div>';}).join('')+
    '<div class="hint">Weigh yourself most mornings \u2014 the app works with trends, so a missed day is fine.</div>';
  if(st==='done'){var p=DB.profile;
    body='<h2 class="wz-h">You are set up</h2><ul class="wz-list">'+
      (canonicalGoal().typeLabel?'<li>Goal: '+esc(canonicalGoal().typeLabel.toLowerCase())+'</li>':'')+
      ((p.equipment||[]).length?'<li>Equipment: '+esc([].concat(p.equipment).join(', '))+'</li>':'')+
      ((DB.settings.trainingDays||[]).length?'<li>Training days: '+esc(DB.settings.trainingDays.join(', '))+'</li>':'')+
      '<li>Detail: '+esc(DETAIL_LEVELS[detailLevel()].label)+'</li></ul>'+
      '<div class="hint">Next: set your targets (the app suggests them from what you entered), then choose a training plan built for your equipment and days.</div>';}
  var foot=(_WZ.step>0?uiBtn('Back','welcome.back',null,'btn-secondary'):uiBtn('Try it with example data','welcome.demo',null,'btn-secondary'))+
    (st!=='done'?uiBtn('Skip for now','welcome.skip',null,'btn-ghost'):'')+
    (st==='welcome'?uiBtn('Set up','welcome.next',null,'btn-primary'):(st==='done'?uiBtn('Set my targets','welcome.finish',null,'btn-primary'):uiBtn('Next','welcome.next',null,'btn-primary')));
  return {body:dots+body,foot:foot};};
/* Each step's choices are written when you move on, through the canonical setters. */
function _wzCommit(){var st=WELCOME_STEPS[_WZ.step],b=_WZ.b;
  if(st==='about'){if(b.units&&b.units!==unitPref()){DB.settings.units=b.units;save('settings');applySettings();}
    applyProfileFields({sex:b.sex,age:b.age,height:b.height,heightFt:b.heightFt,heightIn:b.heightIn,startWeight:b.startWeight});}
  if(st==='goal')applyProfileFields({goalType:b.goal,goalWeight:b.goalWeight});
  if(st==='training'){var eq=b.equipment.slice();if(eq.indexOf('barbell')>=0){eq.push('rack');eq.push('bench');}if(eq.indexOf('machine')>=0)eq.push('cable');
    if(eq.indexOf('bodyweight')<0)eq.push('bodyweight');
    applyProfileFields({trainingExperience:b.trainingExperience,equipment:eq.filter(function(x,i){return eq.indexOf(x)===i;})});
    DB.settings.trainingDays=WZ_DAYS.filter(function(d){return b.days.indexOf(d)>=0;});save('settings');
    applyProfileFields({sessionMinutes:b.sessionMinutes});if(b.scheduleMode&&b.scheduleMode!=='weekly')changePlan({kind:'setup',source:'your edit',reason:'Your schedule from setup',expected:'as you set',apply:function(){return setSchedule({mode:b.scheduleMode,preset:b.scheduleMode==='rotation'?'pitman-dn':undefined,anchor:todayISO()});}});
    notePlanChange('constraint change',{reason:'Your training days, equipment or session length changed.'});}
  if(st==='food'){applyProfileFields({cookingTime:b.cookingTime,foodBudget:b.foodBudget,dietRestrictions:b.dietRestrictions});
    notePlanChange('constraint change',{reason:'Your cooking time, food budget or diet restrictions changed.'});}
}
registerAction('nav.welcome',function(step){var n=parseInt(step,10);openWelcome(isNaN(n)?0:Math.max(0,Math.min(WELCOME_STEPS.length-1,n)));});
registerAction('welcome.next',function(){_wzCommit();_WZ.step=Math.min(WELCOME_STEPS.length-1,_WZ.step+1);renderSheet();});
registerAction('welcome.back',function(){_WZ.step=Math.max(0,_WZ.step-1);renderSheet();});
registerAction('welcome.set',function(arg){var i=String(arg).indexOf('|');_WZ.b[String(arg).slice(0,i)]=String(arg).slice(i+1);renderSheet();});
registerAction('welcome.toggle',function(arg){var i=String(arg).indexOf('|'),f=String(arg).slice(0,i),v=String(arg).slice(i+1),L=_WZ.b[f]||[];
  _WZ.b[f]=L.indexOf(v)>=0?L.filter(function(x){return x!==v;}):L.concat([v]);renderSheet();});
registerAction('welcome.field',function(f,ev,el){if(el)_WZ.b[f]=el.value;});
registerAction('welcome.detail',function(k){if(DETAIL_LEVELS[k]){DB.settings.detail=k;save('settings');applySettings();renderSheet();}});
registerAction('welcome.skip',function(){_wzCommit();DB.settings.onboarded=true;save('onboarded');closeSheet();renderAll();toast('You can finish setup any time in Tools \\u2192 Setup guide');});
registerAction('welcome.demo',function(){DB.settings.onboarded=true;closeSheet();loadDemo();renderAll();toast('Example data loaded. Reset it in Tools \\u2192 Demo and reset.');});
registerAction('welcome.finish',function(){_wzCommit();DB.settings.onboarded=true;DB.settings.onboardedAt=nowISO();save('onboarded');closeSheet();renderAll();
  /* The phase executing the goal: the goal type's default phase. */
  var gt=canonicalGoal().type,type=gt?GOAL_TYPES[gt].phases[0]:'maintenance';if(!activePhase())setTimeout(function(){openPhase(null,type);},200);});

/* ---- The four surfaced domains (H0 capability records; H1 brings them into Today and the attention queue) ---- */
function _statusBody(r,emptyTitle){
  if(!r||r.status==='none')return uiEmpty(emptyTitle,esc((r&&r.note)||''),'');
  if(r.status==='insufficient')return uiEmpty('Not enough data yet',esc((r.need||[]).join(', ')),esc(r.note||''));
  return null;
}
SHEETS.recoveryAllocation=function(){var r=recoveryAllocation(),e=_statusBody(r,'Nothing to rank yet');
  return {body:e||('<div class="hint">What is drawing on your recovery right now, largest first. This is an ordering, not a percentage \u2014 recovery is not a measurable tank.</div>'+
    (r.draws||[]).map(function(d,i){return uiRow((i+1)+'. '+esc(d.label),'',{sub:esc(d.detail||'')+' \u00b7 you can change it: '+esc(d.modifiable)+' \u00b7 from '+esc(d.evidence||'')});}).join('')+
    ((r.unknown||[]).length?'<div class="hint">Not known: '+esc(r.unknown.join(', '))+'.</div>':'')+(r.caveat?'<div class="prov">'+esc(r.caveat)+'</div>':'')),
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
SHEETS.motorLearning=function(){var r=motorLearning(),e=_statusBody(r,'Nothing to assess yet');
  return {body:e||('<div class="hint">'+esc(r.note)+' Falling variability between sets usually means a movement is becoming skilled; it is a hint, not a measurement of technique.</div>'+
    r.rows.map(function(x){return uiRow(esc(x.exercise),x.status==='ok'?esc(x.interpretation||x.verdict||x.headline||''):'\u2014',{sub:x.status==='ok'?esc(x.note||x.detail||''):esc((x.need||[]).join(', '))});}).join('')),
    foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
SHEETS.hydration=function(){var r=hydrationContext(),e=_statusBody(r,'Not enough weigh-ins yet');
  return {body:e||(uiRow('Scale reading',r.likelyDistorted?uiPill('likely distorted','attention'):uiPill('looks normal','good'),{sub:esc(r.note||'')})+
    ((r.flags||[]).length?r.flags.map(function(f){return uiRow(esc(f.label||f),'',{sub:esc(f.detail||'')});}).join(''):'')+
    '<div class="prov">'+esc(r.caveat)+'</div>'),foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
/* The supplements sheet is SHEETS.supplements in 90-workout.js (regimen, catalogue, vitamins, guidance, personal tests,
   and everything else logged, from supplementReview). This older view was merged into it. */
registerAction('nav.recoveryAllocation',function(){openSheet('edit',{form:'recoveryAllocation',title:'What is using your recovery',desc:'',buf:{}});});
registerAction('nav.motorLearning',function(){openSheet('edit',{form:'motorLearning',title:'Skill in your lifts',desc:'',buf:{}});});
registerAction('nav.hydration',function(){openSheet('edit',{form:'hydration',title:'Water and the scale',desc:'',buf:{}});});
registerAction('nav.supplements',function(){dispatchAct('supp.open');});
/* ---- execution marks from Today (H1) ---- */
registerAction('exec.variant',function(arg){var i=String(arg).indexOf('|'),item=String(arg).slice(0,i),v=String(arg).slice(i+1);
  if(!PLAN_VARIANTS[v])return;markExecution(todayISO(),item,v==='recovery'?'done':'variant',{variant:v});renderAll();
  toast(PLAN_VARIANTS[v].label+' version: '+PLAN_VARIANTS[v].note);});
registerAction('exec.skip',function(item){markExecution(todayISO(),item,'skipped',{reason:'you chose to skip it today'});renderAll();
  toast('Marked as skipped \u2014 it counts as a choice, not a failure');});
/* ---- food identity (H2) ---- */
registerAction('food.same',function(arg){var i=String(arg).indexOf('|'),cid=String(arg).slice(0,i),ref=String(arg).slice(i+1);var t=foodByRef(ref);
  if(!t){toast('That food is not available offline',{tone:'attention'});return;}markSameFood(cid,t);renderAll();toast('Counted as one food from now on');});
registerAction('food.notSame',function(arg){var i=String(arg).indexOf('|');markDifferentFood(String(arg).slice(0,i),String(arg).slice(i+1));renderAll();toast('Kept as different foods');});
/* ---- LOG AGAIN (H2): a recent or frequent food at its last portion, in one tap, with undo. ---- */
function mealForNow(){var h=new Date().getHours()+new Date().getMinutes()/60;return h<10.5?'breakfast':(h<15?'lunch':(h<21?'dinner':'snacks'));}
registerAction('food.again',function(arg){var p=String(arg).split('|'),ref=p[0]+'|'+p[1],day=p[2]||todayISO();
  var f=recentFoods(50).concat(frequentFoods(50)).filter(function(x){return x.kind+'|'+x.id===ref;})[0];
  if(!f||f.lastQuantity==null){dispatchAct('food.pick',arg);return;}
  try{logFood({food:f,quantity:f.lastQuantity,basis:f.lastBasis||f.basis,date:day,meal:mealForNow()});}
  catch(e){dispatchAct('food.pick',arg);return;}
  _memoInvalidate();renderAll();toast(f.name+' logged \u00b7 '+(f.lastLabel||(fmtNum(f.lastQuantity,0)+' '+(f.lastBasis||'g'))),{undo:true});});
/* ---- adaptations (H3) ---- */
registerAction('adapt.apply',function(id){var _ap=(adaptationProposals().proposals||[]).filter(function(x){return x.id===id;})[0];
  var r=changePlan({kind:'adaptation',source:'adaptation',reason:_ap?_ap.title:'An adaptation you accepted',expected:_ap&&(_ap.expected||_ap.why)||'the outcome the adaptation was proposed for',apply:function(){return applyAdaptation(id);}}).result;if(r.status!=='ok'){toast(r.note||'That suggestion no longer applies',{tone:'attention'});renderAll();return;}
  _memoInvalidate();renderAll();toast('Plan updated to version '+r.version+' \u2014 the reason and evidence are kept with it',{undo:true});});
registerAction('adapt.dismiss',function(id){dismissAdaptation(id);renderAll();toast('Not now \u2014 it may be suggested again in two weeks if the pattern holds');});

/* ---- IMPORT A HEALTH EXPORT (H3), through the import screen ---- */
var _IMPORT={status:'idle'};
function _detectImport(name,head){
  if(/<HealthData|HKQuantityTypeIdentifier|HKCategoryTypeIdentifier/.test(head))return 'apple_health';
  if(/\.csv$/i.test(name)||/,/.test(head.split('\n')[0]||'')){var h=(head.split('\n')[0]||'').toLowerCase();
    if(/weight \(kg\)|weight \(lb\)|fat mass/.test(h))return 'withings';
    if(/steps|calories|activity/.test(h))return 'google_fit';return 'generic_csv';}
  return null;
}
function _readSlices(file,onChunk,onProgress){
  var SZ=8*1024*1024,off=0;
  var next=function(){if(off>=file.size)return Promise.resolve();var blob=file.slice(off,Math.min(file.size,off+SZ));off+=SZ;
    return (blob.text?blob.text():new Promise(function(res){var fr=new FileReader();fr.onload=function(){res(fr.result);};fr.readAsText(blob);}))
      .then(function(t){onChunk(t);if(onProgress)onProgress(Math.min(100,Math.round(off/file.size*100)));return next();});};
  return next();
}
function importFromFile(file){
  _IMPORT={status:'reading',name:file.name,size:file.size,progress:''};
  var headBlob=file.slice(0,4096);
  return (headBlob.text?headBlob.text():Promise.resolve('')).then(function(head){
    var kind=_detectImport(file.name,head);
    if(!kind){_IMPORT={status:'error',note:'This file does not look like a Health export (export.xml) or a CSV of measurements.'};return _IMPORT;}
    var parsed;
    if(kind==='apple_health'){var P=createAppleHealthParser();
      return _readSlices(file,function(t){P.feed(t);},function(pc){_IMPORT.progress=pc+'%';if(_SHEET)renderSheet();}).then(function(){parsed=P.finish();return done(parsed,kind);});}
    return (file.text?file.text():Promise.resolve('')).then(function(t){parsed=parseGenericCSV(t);return done(parsed,kind==='generic_csv'?'generic_csv':kind);});
    function done(parsed,kind){var src=IMPORT_SOURCES[kind]?kind:'generic_csv';
      var pv=importObservations(parsed.rows,src);_IMPORT={status:'preview',name:file.name,kind:kind,source:src,rows:parsed.rows,preview:pv,parseNote:parsed.note};return _IMPORT;}
  });
}
function _importPreviewHtml(){var P=_IMPORT.preview,lbl=(IMPORT_SOURCES[_IMPORT.source]||{}).label||_IMPORT.source;
  var byType=Object.keys(P.byType||{}).map(function(k){return ((OBS_TYPES[k]||{}).label||k)+' '+P.byType[k];}).join(', ');
  return '<div class="card-title" style="margin-top:10px">'+esc(_IMPORT.name)+' \u00b7 '+esc(lbl)+'</div>'+
    uiRow('Would add',P.fresh+' value'+(P.fresh===1?'':'s'),{sub:esc(byType||'nothing new')})+
    (P.duplicates?uiRow('Already imported',String(P.duplicates),{sub:'skipped \u2014 importing the same file twice changes nothing'}):'')+
    ((P.overlapSkipped||[]).length?uiRow('Days already recorded',String(P.overlapSkipped.length),{sub:'day totals skipped so no day is counted twice'}):'')+
    ((P.conflicts||[]).length?uiRow('Disagreements',String(P.conflicts.length),{sub:'both readings kept; the disagreement is reported, not settled silently',tone:'attention'}):'')+
    ((P.rejected||[]).length?uiRow('Refused',String(P.rejected.length),{sub:esc((P.rejected[0]||{}).reason||'')}):'')+
    '<div class="btn-row">'+(P.fresh?uiBtn('Import '+P.fresh+' value'+(P.fresh===1?'':'s'),'import.commit',null,'btn-sm btn-primary'):'')+uiBtn('Choose another file','import.reset',null,'btn-sm btn-ghost')+'</div>';
}
registerAction('import.file',function(a,ev,el){var f=el&&el.files&&el.files[0];if(!f)return;importFromFile(f).then(function(){renderSheet();}).catch(function(e){_q(e,'P1');_IMPORT={status:'error',note:String(e&&e.message||e)};renderSheet();});});
registerAction('import.commit',function(){if(!_IMPORT||!_IMPORT.rows)return;var r=importObservations(_IMPORT.rows,_IMPORT.source,{dryRun:false});
  var n=_IMPORT.preview.fresh;_IMPORT={status:'idle'};_memoInvalidate();closeSheet();renderAll();toast(n+' value'+(n===1?'':'s')+' imported \u2014 each keeps its source and device',{undo:true});});
registerAction('import.reset',function(){_IMPORT={status:'idle'};renderSheet();});
/* ---- Tools: finished work does not keep taking space (usage review) ---- */
var _SELFTEST_SHOW_ALL=false;
registerAction('selftest.clear',function(){_SELFTEST=null;_SELFTEST_SHOW_ALL=false;renderAll();});
registerAction('selftest.showAll',function(){_SELFTEST_SHOW_ALL=true;renderAll();});
registerAction('fold.hide',function(id){DB.settings.hiddenFolds=DB.settings.hiddenFolds||{};DB.settings.hiddenFolds[id]=todayISO();save('settings');renderAll();
  toast('Hidden \u2014 Tools \u2192 Display \u2192 Hidden sections shows it again');});
registerAction('fold.showAll',function(){DB.settings.hiddenFolds={};save('settings');renderAll();toast('Every section is showing again');});
/* ---- attention: snooze, never dismiss for good ---- */
var ATTENTION_SNOOZE_DAYS={action:1,review:3,system:7};
/* The rules, apart from the screen: the action redraws; this does not. */
function snoozeAttention(id){var q=attentionQueue().items.filter(function(i){return i.id===id;})[0];if(!q)return {status:'none'};
  if(q.canSnooze===false)return {status:'refused',note:'This has been snoozed three times; it stays visible for a day'};
  var SZ=DB.settings.attentionSnooze=DB.settings.attentionSnooze||{},z=SZ[id]||{count:0},d=ATTENTION_SNOOZE_DAYS[q.severity]||3;
  var until=new Date(Date.now()+d*86400000).toISOString();SZ[id]={count:(z.count||0)+1,until:until,lastUntil:until};save('settings');
  return {status:'ok',days:d};}
registerAction('attention.snooze',function(id){var r=snoozeAttention(id);if(r.status==='refused'){toast(r.note);return;}if(r.status!=='ok')return;var d=r.days;
  renderAll();if(_SHEET&&_SHEET.opts&&_SHEET.opts.form==='attention'){_SHEET.buf.q=attentionQueue();renderSheet();}
  toast('Snoozed for '+(d===1?'a day':d+' days')+' \u2014 it comes back if it still applies');});
registerAction('photo.todayToggle',function(){DB.settings.showPhotoOnToday=DB.settings.showPhotoOnToday===false;save('settings');renderAll();if(_SHEET&&_SHEET.opts&&_SHEET.opts.form==='photos')renderSheet();
  toast(DB.settings.showPhotoOnToday!==false?'Your latest photo shows on Today':'Today no longer shows a photo');});
/* ---- panels: previous and next, side by side on the left rail ---- */
function tabOrder(){var t=[];[].slice.call(document.querySelectorAll('nav [data-act="nav.tab"]')).forEach(function(b){var a=b.getAttribute('data-arg');if(a&&t.indexOf(a)<0&&b.offsetParent!==null)t.push(a);});return t;}
function flipTab(dir){var t=tabOrder();if(!t.length)return;var i=t.indexOf(_TAB);switchTab(t[(i+dir+t.length)%t.length]);}
registerAction('nav.prevTab',function(){flipTab(-1);});registerAction('nav.nextTab',function(){flipTab(1);});
/* ---- dictation into any text field: one tap, the words land in the field, nothing is logged unseen ---- */
function uiMicBtn(inputId){if(typeof window==='undefined'||!(window.SpeechRecognition||window.webkitSpeechRecognition))return '';
  return '<button type="button" class="mic-btn" data-act="dictate" data-arg="'+attrEsc(inputId)+'" aria-label="Dictate" title="Dictate">'+uiIcon('mic',{size:18})+'</button>';}
var _DICTATE=null;
registerAction('dictate',function(id,ev,btn){var el=document.getElementById(id);if(!el)return;
  var SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){toast('This browser has no speech recognition');return;}
  if(_DICTATE){try{_DICTATE.abort();}catch(e){}_DICTATE=null;}
  var r=new SR();_DICTATE=r;r.lang=navigator.language||'en-US';r.interimResults=true;r.maxAlternatives=1;if(btn)btn.classList.add('on');
  r.onresult=function(e){var t='';for(var i=e.resultIndex||0;i<e.results.length;i++)t+=e.results[i][0].transcript;el.value=t;el.dispatchEvent(new Event('input',{bubbles:true}));};
  r.onerror=function(e){toast(VOICE_ERRORS[e.error]||('Dictation failed ('+e.error+')'),{tone:'attention',ms:7000});};
  r.onend=function(){_DICTATE=null;var b2=document.querySelector('[data-act="dictate"][data-arg="'+id+'"]');if(b2)b2.classList.remove('on');try{el.focus();}catch(e){}};
  try{r.start();}catch(e){toast('Dictation could not start');}});
/* ---- FEATURE GUIDE: every feature pointed to, with whether it is set up (usage review: features were found by accident
   or only through the command search) ---- */
function featureGuide(){var P=DB.settings.photos||[],C=DB.settings.cloud||{},S=typeof scheduleModel==='function'?scheduleModel():{mode:'weekly'};
  var voice=typeof window!=='undefined'&&!!(window.SpeechRecognition||window.webkitSpeechRecognition);
  return [
    {id:'place',icon:'pin',label:'Weather for your place',what:'Conditions, the next hours, 14 days and air quality on Today.',on:!!weatherLocation(),act:'weather.open',cta:'Set a place'},
    {id:'schedule',icon:'calendar',label:'Your schedule',what:'Same days each week, rotating shifts such as 2-2-3, or an irregular week.',on:S.mode!=='weekly'||(DB.settings.trainingDays||[]).length>0,state:S.mode==='rotation'?'rotating shifts':(S.mode==='irregular'?'irregular':null),act:'nav.schedule',cta:'Set it'},
    {id:'workout',icon:'dumbbell',label:'Guided workouts',what:'Today\u2019s session set by set, with a rest timer and swaps.',on:(DB.sessions||[]).some(function(s){return s.source==='workout mode';}),act:'workout.start',cta:'Start one'},
    {id:'voice',icon:'mic',label:'Log by voice',what:'Say "weight 182.4" or "2 eggs for breakfast"; you confirm before it is kept.',on:voice,state:voice?'available':'not in this browser',act:'nav.voice',cta:'Try it',na:!voice},
    {id:'photos',icon:'camera',label:'Progress photos',what:'Private photos, compared side by side; the latest can show on Today.',on:P.length>0,act:'nav.photos',cta:'Add one'},
    {id:'barcode',icon:'barcode',label:'Barcode scanning',what:'Scan or type a barcode; the built-in database first, then Open Food Facts.',on:true,state:'ready',act:'food.scan',cta:'Scan'},
    {id:'sync',icon:'sync',label:'Sync between devices',what:'End-to-end encrypted: the server stores what it cannot read.',on:!!C.enabled,act:'nav.cloud',cta:'Set up'},
    {id:'sources',icon:'sync',label:'Your data sources',what:'Where each part of the record comes from, how sources agree, and which to trust.',on:true,state:'ready',act:'sources.open',cta:'Open'},
    {id:'import',icon:'upload',label:'Import your data',what:'Apple Health exports, smart scales (Withings) and other CSV files.',on:(DB.observations||[]).some(function(o){return o.source==='import';}),act:'nav.import',cta:'Import'},
    {id:'automation',icon:'spark',label:'Shortcuts and automation',what:'One-tap actions ranked for the moment, meal templates, automations and home-screen shortcuts.',on:(DB.settings.templates||[]).length>0||(DB.settings.automations||[]).length>0,act:'automation.open',cta:'Set up'},
    {id:'supplements',icon:'pill',label:'Supplements and vitamins',what:'A regimen with reminders of what is due, vitamins and minerals counted with food, and evidence for each.',on:(DB.settings.supplementStack||[]).length>0,act:'supp.open',cta:'Set up'},
    {id:'experiments',icon:'flask',label:'Experiments',what:'Ready-made tests of one change, sized to your own data.',on:(DB.experiments||[]).length>0,act:'exp.new',cta:'Browse'},
    {id:'charts',icon:'chart',label:'Charts of your data',what:'Every chart type the app can draw, from your own record.',on:true,state:'ready',act:'nav.charts',cta:'Open'}
  ].filter(function(f){return typeof ACTIONS==='undefined'||ACTIONS[f.act];});
}
function renderFeatureRow(f){return '<div class="feat">'+uiIcon(f.icon,{size:22})+'<div class="feat-body"><b>'+esc(f.label)+'</b> '+uiPill(f.state||(f.on?'set up':'not set up'),f.on?'good':'neutral')+
  '<div class="hint">'+esc(f.what)+'</div></div>'+(f.na?'':uiBtn(f.on?'Open':f.cta,'features.go',f.act,'btn-sm '+(f.on?'btn-ghost':'btn-secondary')))+'</div>';}
var REVIEW_ONLY_FEATURES={automation:1,sources:1,physique:1,charts:1,features:1};
function renderSetupMore(){var seen=DB.settings.featureSeen||{},hid=DB.settings.setupHidden||{},F=featureGuide(),todo=F.filter(function(f){return !f.on&&!f.na&&!hid[f.id]&&!(REVIEW_ONLY_FEATURES[f.id]&&seen[f.id]);});if(!todo.length)return '';
  return uiCard({fold:'today-setup',foldOpen:true,hideable:true,hideLabel:'Hide this list',title:'Set up more',sub:todo.length+' feature'+(todo.length===1?'':'s')+' not set up yet',
    body:todo.slice(0,4).map(function(f){return renderFeatureRow(f).replace(/<\/div>$/,uiBtn('Not now','setup.hide',f.id,'btn-sm btn-ghost')+'</div>');}).join('')+'<div class="btn-row">'+uiBtn('Everything this app can do','features.open',null,'btn-sm btn-ghost')+'</div>'});}
registerAction('setup.hide',function(id){DB.settings.setupHidden=Object.assign({},DB.settings.setupHidden||{});DB.settings.setupHidden[id]=todayISO();save('settings');renderAll();toast('Hidden from this list. Everything this app can do still has it.');});
registerAction('features.open',function(){openSheet('edit',{form:'features',title:'Everything this app can do',desc:'',buf:{}});});
SHEETS.features=function(){return {body:featureGuide().map(renderFeatureRow).join(''),foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
/* A feature opened from the guide opened BEHIND it (usage review): the guide closes first, then the feature opens. */
registerAction('features.go',function(act){try{var _f=featureGuide().filter(function(x){return x.act===act;})[0];if(_f){DB.settings.featureSeen=Object.assign({},DB.settings.featureSeen||{});DB.settings.featureSeen[_f.id]=todayISO();}}catch(e){}   /* opened = set up, for features that are a page to review */
if(typeof closeSheet==='function')closeSheet();setTimeout(function(){dispatchAct(act);},30);});
/* Tools layout: any section can be pinned to the top; External server is first by default (usage review). */
function toolsPinned(){var p=DB.settings.toolsPinned;return Array.isArray(p)?p:['tools-server'];}
registerAction('tools.pin',function(id){var p=toolsPinned().slice(),i=p.indexOf(id);if(i>=0)p.splice(i,1);else p.unshift(id);DB.settings.toolsPinned=p;save('settings');renderAll();toast(i>=0?'Unpinned':'Pinned to the top of Tools');});
function applyToolsOrder(){var v=document.getElementById('toolsZone');if(!v)return;v.style.display='flex';v.style.flexDirection='column';
  [].slice.call(v.children).forEach(function(c){c.style.order='';});var p=toolsPinned();
  p.forEach(function(id,i){var d=v.querySelector('[data-fold="'+id+'"]');var host=d?(d.closest('#toolsZone > *')||d):null;if(host&&host.parentElement===v)host.style.order=String(-100+i);else if(d&&d.parentElement===v)d.style.order=String(-100+i);});}
/* the Log page's filter: search, kind, and whether to show corrections and derived entries */
registerAction('log.q',function(a,ev,el){var LF=window._LOG_FILTER||(window._LOG_FILTER={q:'',group:'all',showHidden:false});LF.q=el?el.value:'';var pos=el?el.selectionStart:null;renderAll();
  var inp=document.querySelector('[data-act="log.q"]');if(inp){inp.focus();try{inp.setSelectionRange(pos,pos);}catch(e){}}});
registerAction('log.group',function(g){var LF=window._LOG_FILTER||(window._LOG_FILTER={q:'',group:'all',showHidden:false});LF.group=g;renderAll();});
registerAction('log.hidden',function(){var LF=window._LOG_FILTER||(window._LOG_FILTER={q:'',group:'all',showHidden:false});LF.showHidden=!LF.showHidden;renderAll();});
/* ABOUT: built from the live registries, so its numbers cannot go stale */
SHEETS.about=function(){var v={};try{v=JSON.parse(document.getElementById('appVersion')?document.getElementById('appVersion').textContent:'{}');}catch(e){}
  var n=function(o){return o?Object.keys(o).length:0;},row=function(k,val,sub){return uiRow(esc(k),esc(String(val)),{sub:sub?esc(sub):''});};
  var out='<p>Physique OS is a private, offline-first system for changing your body composition: it records what you observe and do, models what is happening, decides what to change, predicts what will follow, and learns from what actually did.</p>'+
    '<div class="card-title" style="margin-top:10px">This version</div>'+row('Version',APP_NAME+' '+APP_VERSION)+row('Build',typeof BUILD_ID!=='undefined'?BUILD_ID:'\u2014')+
    '<div class="card-title" style="margin-top:10px">What it knows</div>'+row('Models',(typeof MODELS!=='undefined'?MODELS.length:0),'each with its method, assumptions, failure conditions and uncertainty')+
    row('Things you can record',n(OBS_TYPES))+row('Exercises',typeof EXERCISES!=='undefined'?(EXERCISES.length||n(EXERCISES)):'\u2014')+row('Supplements in the catalogue',n(typeof SUPPLEMENT_CATALOGUE!=='undefined'?SUPPLEMENT_CATALOGUE:null))+
    row('Vitamins and minerals tracked',n(typeof MICRONUTRIENTS!=='undefined'?MICRONUTRIENTS:null))+row('Actions',n(ACTIONS))+
    '<div class="card-title" style="margin-top:10px">Your data</div><div class="hint">Everything lives on this device. Sync, if you turn it on, stores only ciphertext the server cannot read; connected services keep their sign-ins encrypted on the server. Nothing is sold or shared.</div>'+
    '<div class="card-title" style="margin-top:10px">How it decides</div><div class="hint">Every number states its evidence: measured, derived, fitted to you, a population prior or a rule of thumb. Forecasts compete and are scored against what happened; changes are judged against the trend before them; your own record outranks population figures.</div>'+
    '<div class="card-title" style="margin-top:10px">Sources</div><div class="hint">Food: USDA FoodData Central and Open Food Facts. Reference intakes: US National Academies. Weather: Open-Meteo. Supplement evidence: NIH Office of Dietary Supplements and ISSN position stands.</div>';
  return {body:out,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
registerAction('profile.eq',function(k){if(!_SHEET||!_SHEET.opts||_SHEET.opts.form!=='profile')return;var b=_SHEET.buf;b.equipment=Array.isArray(b.equipment)?b.equipment:(b._eq||[]).slice();var i=b.equipment.indexOf(k);if(i>=0)b.equipment.splice(i,1);else b.equipment.push(k);renderSheet();});
registerAction('profile.diet',function(k){if(!_SHEET||!_SHEET.opts||_SHEET.opts.form!=='profile')return;var b=_SHEET.buf;b.dietRestrictions=Array.isArray(b.dietRestrictions)?b.dietRestrictions:(b._diet||[]).slice();var i=b.dietRestrictions.indexOf(k);if(i>=0)b.dietRestrictions.splice(i,1);else b.dietRestrictions.push(k);renderSheet();});
registerAction('phase.crit',function(arg){var q=String(arg).split('|'),b=_SHEET.buf;b.criteria=b.criteria||{success:[],stop:[],transition:[]};var L=b.criteria[q[0]],i=L.indexOf(q[1]);if(i>=0)L.splice(i,1);else L.push(q[1]);renderSheet();});
registerAction('phase.suggest',function(){var b=_SHEET.buf,sg=(_SHEET.opts&&_SHEET.opts.suggest)||{};if(sg.cs&&sg.cs.value)b.calorieTarget=sg.cs.value;if(sg.ps)b.proteinTarget=Math.round((sg.ps.lo+sg.ps.hi)/2);
  if(b.calorieTarget)b.fiberTarget=Math.round(14*b.calorieTarget/1000);var w=weightAverages().avg7||currentWeight().value;if(w)b.fatFloor=Math.round(w*0.3);renderSheet();toast('Filled in from your current estimates; adjust anything before saving');});
function scheduleSummary(){var M=typeof scheduleModel==='function'?scheduleModel():{},d=DB.settings.trainingDays||[];
  if(M.mode&&M.mode!=='weekly')return (M.mode==='rotation'?'rotating shifts'+(M.preset?' ('+M.preset+')':''):M.mode)+(M.minutes?' \u00b7 sessions '+(M.minutes.full||'?')+' min, short '+(M.minutes.short||'?')+' min':'');
  return 'weekly'+(d.length?': '+d.join(', '):'')+(M.minutes?' \u00b7 sessions '+(M.minutes.full||'?')+' min':'');}
/* ============================================================================
   STEPPERS AND TIMERS, app-wide. A stepper is \u2212 and + around an ordinary input: each tap changes the input and then
   runs the input's own action, so it goes through the same wiring as typing. A field can still be typed into.
   Timers: countdowns and stopwatches that vibrate when done and write their result into a field when asked.
   ============================================================================ */
var _LAST_NUM=null;
if(typeof document!=='undefined')document.addEventListener('focusin',function(ev){var t=ev.target;if(t&&t.tagName==='INPUT'&&(t.type==='number'||/decimal|numeric/.test(t.getAttribute('inputmode')||'')))_LAST_NUM=t;});
function uiStepper(inputHtml,id,step,min,max,dec){var a=function(sign,label){return '<button type="button" class="st-b" data-act="ui.step" data-arg="'+id+'|'+(sign*step)+'|'+(min==null?'':min)+'|'+(max==null?'':max)+'|'+(dec||0)+'" aria-label="'+label+'">'+(sign<0?'\u2212':'+')+'</button>';};
  return '<div class="stepper">'+a(-1,'less')+inputHtml+a(1,'more')+'</div>';}
registerAction('ui.step',function(arg){var q=String(arg).split('|'),el=q[0]==='@focus'?_LAST_NUM:document.getElementById(q[0]);if(!el)return toast('Tap a number first');
  var v=num(el.value);v=(v==null?0:v)+(+q[1]);if(q[2]!=='')v=Math.max(+q[2],v);if(q[3]!=='')v=Math.min(+q[3],v);var d=+q[4]||0;v=round(v,d);el.value=String(v);
  var act=el.getAttribute('data-act');if(act)dispatchAct(act,el.getAttribute('data-arg'),{type:'input',target:el},el);
  try{el.dispatchEvent(new Event('input',{bubbles:false}));}catch(e){}});
var _TIMERS={};
function _timerText(T){var secs=T.duration!=null?Math.max(0,T.duration-T.elapsed()):T.elapsed();return _fmtClockSafe(secs);}
function _fmtClockSafe(s){s=Math.round(s);var m=Math.floor(s/60),r=s%60;return m+':'+(r<10?'0':'')+r;}
function uiTimer(id,opts){opts=opts||{};var T=_TIMERS[id];var running=T&&T.running;
  return '<div class="ui-timer" role="timer"><span class="t-clock" data-timer="'+id+'">'+(T?_timerText(T):_fmtClockSafe(opts.duration||0))+'</span>'+
    (opts.choices&&!running?opts.choices.map(function(c){return '<button type="button" class="chip sm" data-act="timer.start" data-arg="'+id+'|'+c+'|'+(opts.then||'')+'">'+c+' s</button>';}).join(''):'')+
    (!opts.choices&&!running?'<button type="button" class="chip sm" data-act="timer.start" data-arg="'+id+'|'+(opts.duration||'')+'|'+(opts.then||'')+'">'+(opts.duration?'Start '+opts.duration+' s':'Start')+'</button>':'')+
    (running?'<button type="button" class="chip sm active" data-act="timer.stop" data-arg="'+id+'">Stop</button>':'')+'</div>';}
registerAction('timer.start',function(arg){var q=String(arg).split('|'),id=q[0],dur=q[1]?+q[1]:null,then=q.slice(2).join('|');var t0=Date.now();
  _TIMERS[id]={running:true,duration:dur,then:then||null,start:t0,elapsed:function(){return (Date.now()-t0)/1000;}};if(_SHEET)renderSheet();else renderAll();});
registerAction('timer.stop',function(id){_timerFinish(id,true);});
function _timerFinish(id,stopped){var T=_TIMERS[id];if(!T||!T.running)return;var secs=Math.round(T.duration!=null?Math.min(T.duration,T.elapsed()):T.elapsed());
  T.running=false;var e=T.elapsed();T.elapsed=function(){return e;};
  if(!stopped||T.duration==null){try{navigator.vibrate&&navigator.vibrate([200,80,200]);}catch(err){}}
  if(T.then){var p=T.then.split('|');try{dispatchAct(p[0],p.slice(1).join('|')+'|'+secs);}catch(err){_q(err,'P2');}}
  if(_SHEET)renderSheet();else renderAll();if(!stopped)toast('Time');}
if(typeof setInterval==='function'&&typeof document!=='undefined')setInterval(function(){Object.keys(_TIMERS).forEach(function(id){var T=_TIMERS[id];if(!T.running)return;
    if(T.duration!=null&&T.elapsed()>=T.duration){_timerFinish(id,false);return;}var el=document.querySelector('[data-timer="'+id+'"]');if(el)el.textContent=_timerText(T);});
  var c=document.querySelector('[data-clock="wo"]');if(c&&typeof _WORKOUT!=='undefined'&&_WORKOUT&&_WORKOUT.startedAt)c.textContent=_fmtClockSafe((Date.now()-_WORKOUT.startedAt)/1000)+' elapsed';},500);
/* timer results written where they belong */
registerAction('timer.cardioMinutes',function(arg){var secs=+String(arg).split('|').pop();if(_SHEET&&_SHEET.buf){_SHEET.buf.value=Math.max(1,Math.round(secs/60));renderSheet();}});
registerAction('timer.setSeconds',function(arg){var q=String(arg).split('|'),k=+q[0],secs=+q[q.length-1];if(!_WORKOUT)return;var s=_WORKOUT.exercises[_WORKOUT.current].sets[k];if(s){s.seconds=secs;if(s.reps==null)s.reps=1;_saveDraft();}});
/* an entry logged before portions travelled with it borrows them from the live food */
function _foodForEdit(l){var f=normalizeFood(l.food);if(!(f.portions&&f.portions.length)){try{var live=foodByRef((l.food.source||'')+'|'+(l.food.id||''))||(typeof localFoods==='function'?localFoods().filter(function(x){return x.id===l.food.id;})[0]:null);if(live)f=Object.assign({},f,{portions:normalizeFood(live).portions||[]});}catch(e){}}return f;}
