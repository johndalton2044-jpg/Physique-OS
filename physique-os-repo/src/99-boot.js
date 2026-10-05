/* ============================================================================
   REGION: BOOT — deterministic startup. localStorage mirror paints first; IndexedDB is adopted when ready.
   ============================================================================ */
var _BOOTED=false,_BOOT_SOURCE=null,_INTEGRITY_HOLD=null;
/* An offline app has no cron. The scheduler (JOBS) owns the periodic work and records what each run did;
   this wrapper keeps the once-a-day snapshot/backup and hands everything else to runDueJobs. */
function dailyJobs(){try{
  var today=todayISO();var last=DB.settings.lastDailyJobs;
  try{runDueJobs();}catch(e){_q(e);}
  if(last===today)return;
  captureSnapshot();DB.settings.lastDailyJobs=today;save('daily');
  if(!DB.settings.lastAutoBackupAt||localDateOf(DB.settings.lastAutoBackupAt)!==today){writeAutoBackup();DB.settings.lastAutoBackupAt=nowISO();}
}catch(e){_q(e);}}
/* Every record that has a phase has a plan; records from before H1 adopt one once, saying so. */
function _ensurePlanAfterBoot(){if(typeof ensurePlan==='function'){try{var had=(DB.plans||[]).length;var p=ensurePlan();if(p&&!had){_memoInvalidate();renderAll();}}catch(e){_q(e,'P1');}}}
function firstRun(){_ensurePlanAfterBoot();if(DB.settings.onboarded||DB.observations.length||DB.phases.length)return;setTimeout(function(){
  /* Re-check the premise at display time: the welcome says "load the demo", and it used to appear even if
     the demo had loaded in the 200ms before it fired — then stayed six seconds telling the person to do
     what they had just done. */
  if(DB.settings.onboarded||DB.observations.length||DB.phases.length)return;
  switchTab('today');_WELCOME_SHOWN=true;
  /* A guided setup instead of a six-second toast; onboarded is set when it is finished or skipped. */
  if(typeof openWelcome==='function')openWelcome(0);
  else toast('Welcome. Set up a profile, or load the demo to see the system with ten weeks of data.',{ms:6000});},200);}
/* dismissWelcome() and its state live in 80-ui.js beside toast(), so they exist in every context that
   can show or clear a toast — including the DOM-free engine run, which does not load this file. */
/* NO SILENT LOSS. If the last save before closing claimed a later revision than any stored copy holds, those saves did
   not reach storage (the phone may have killed the app mid-write). Nothing can bring them back, but the person is told,
   and the record notes it. */
var _UNSAVED_AT_CLOSE=null;
function unsavedAtClose(){return _UNSAVED_AT_CLOSE;}
function _reportLostSaves(metaRev,loadedRev){
  /* Compared with the revision AS LOADED: startup saves before reconciliation finishes, and comparing with the live
     revision let those saves hide the shortfall. */
  try{var have=loadedRev!=null?loadedRev:(DB.revision||0);if(!metaRev||metaRev<=have)return null;
    var n=metaRev-have;
    /* Kept outside the record: the event merge that follows reconciliation rebuilds the record, bookkeeping included. */
    _UNSAVED_AT_CLOSE={detectedAt:nowISO(),lastClaimed:metaRev,recovered:have,missing:n};
    setTimeout(function(){toast('Your last '+(n===1?'change':n+' changes')+' before the app closed may not have been saved. Please check your most recent entries.',{tone:'attention',ms:9000});},400);
    return _UNSAVED_AT_CLOSE;
  }catch(e){_q(e,'P1');return null;}
}
function boot(){
  if(_BOOTED)return;_BOOTED=true;
  /* The last revision any save claimed, read before this session writes anything. */
  var _bootMetaRev=0;try{var _bm=JSON.parse(localStorage.getItem(LS_META)||'null');_bootMetaRev=(_bm&&_bm.revision)||0;}catch(e){}
  var loaded=loadDB();DB=loaded.db;_BOOT_SOURCE=loaded.source;
  var _bootLoadedRev=DB.revision||0;   /* before any startup save moves it */
  if(/localStorage/.test(String(loaded.source))&&typeof _MIRROR_REV!=='undefined')_MIRROR_REV=DB.revision||0;   /* the mirror is current as loaded */
  /* Boot integrity gate: a P0 here means the record in memory is not safe to write back over the durable
     copy, so saving is suspended until the user has exported. Reporting it and continuing to write would
     turn a detectable problem into a permanent one. */
  try{var ic=integrityCheck('boot');
    if(!ic.ok){_INTEGRITY_HOLD=ic;
      setTimeout(function(){toast('The record failed an integrity check on load: '+ic.blocking[0].what+'. Export a backup before making changes.',{ms:12000,tone:'negative'});},600);}
  }catch(e){_q(e,'P0');}
  if(_SCHEMA_REJECTION)setTimeout(function(){toast('A stored record could not be opened: '+_SCHEMA_REJECTION.reason+'. The raw copy is preserved \u2014 see Tools \u2192 Data.',{ms:9000,tone:'negative'});},400);
  applySettings();installDispatcher();installHotkeys();installScrollWatch();installContextMenus();
  try{initSync();}catch(e){_q(e,'P2');}   // cross-tab convergence by event merge, not snapshot adoption
  /* Prefer the per-collection layout when it is complete and newer; fall back silently to the checkpoint. */
  /* Reconcile BEFORE anything is written: read the stored copy, adopt it if it is newer, and only then release the
     queued writes — which, if the stored copy won, were made from the stale mirror and are discarded. The adopted
     record's settings are applied too: the first version swapped the record in and re-rendered, but appearance had
     already been applied from the stale mirror and was never re-applied. */
  var _release=function(){_IDB_RECONCILING=false;_idbFlush();};
  /* Test-only: ?test-reconcile-delay=ms delays reconciliation, so the ordering against the event merge can be
     exercised deterministically instead of by luck. Ignored unless the parameter is present. */
  var _rcDelay=(function(){var m=/[?&]test-reconcile-delay=(\d+)/.exec((location&&location.search)||'');return m?Math.min(5000,+m[1]):0;})();
  /* ORDER. Reconciliation and the event merge were two independent chains. When the merge finished first it merged the
     event log into the quick-start mirror — which holds the theme but not every appearance setting — kept the higher
     revision, and reconciliation then declined the stored copy as not newer: settings came back as defaults. It
     appeared only under load, twice in thirteen full checks; delaying reconciliation made it happen every time. The
     merge now waits for reconciliation, on every path. */
  var _reconcileDone,_RECONCILED=new Promise(function(r){_reconcileDone=r;});
  initDurableStorage({reconcile:true}).then(function(){return _rcDelay?new Promise(function(r){setTimeout(r,_rcDelay);}):null;}).then(function(){
    return loadFromCollections().then(function(fromCols){
      if(fromCols){
        var m=migrate(fromCols);
        if(m.ok&&(m.db.revision||0)>(DB.revision||0)){
          _IDB_QUEUE.length=0;                     /* stale writes derived from the older mirror */
          var _adoptedRev=m.db.revision||0;
          DB=m.db;_BOOT_SOURCE='IndexedDB collections';_memoInvalidate();
          _reportLostSaves(_bootMetaRev,_adoptedRev);
          applySettings();renderAll();
          _release();
          save('boot:reconciled');                 /* bring the mirror up to date with the record that won */
          firstRun();
          return;
        }
      }
      _reportLostSaves(_bootMetaRev,_bootLoadedRev);_release();firstRun();
    });
  }).catch(function(e){_IDB_RECONCILING=false;_q(e,'P1');firstRun();}).then(function(){_reconcileDone();},function(){_reconcileDone();});
  document.documentElement.setAttribute('data-focus',focusMode()?'on':'off');
  try{if(typeof watchPanelLevels==='function')watchPanelLevels();}catch(e){_q(e,'P2');}
  try{applyLayout();window.addEventListener('resize',function(){applyLayout();},{passive:true});}catch(e){_q(e,'P3');}
  window.addEventListener('hashchange',function(){var t=location.hash.replace('#','');if(t&&document.getElementById('view-'+t)&&t!==_TAB)switchTab(t);});
  var start=location.hash.replace('#','');switchTab(document.getElementById('view-'+start)?start:'today');
  if(typeof handleLaunchShortcut==='function')setTimeout(handleLaunchShortcut,300);
  if(typeof handleConnectReturn==='function')setTimeout(handleConnectReturn,400);
  makeDelegatedControlsFocusable();
  onSave(function(){_memoInvalidate();});
  /* Durable startup, in order of authority:
       1. load the persisted event log, so anything another tab wrote is available as facts rather than as a
          rival snapshot;
       2. merge it into whatever this session already has — union, never adoption, so no unsaved work is lost;
       3. only if there is no event log at all, fall back to adopting the durable document snapshot, which is
          the pre-event-sourcing path and still correct for records written by an older build. */
  initDurableStorage().then(function(){return _RECONCILED;}).then(function(){
    return loadEvents().then(function(stored){
      if(stored&&stored.length){
        var merged=mergeEvents(_EVENTS,stored);
        var before=_EVENTS.length;
        if(merged.events.length>before){
          var r=adoptMergedEvents(merged);
          if(r.ok){_memoInvalidate();applySettings();renderAll();
            if(merged.conflicts.length&&typeof toast==='function')
              setTimeout(function(){toast(merged.conflicts.length+' concurrent edit'+(merged.conflicts.length===1?'':'s')+' from another tab were merged \u2014 review them in Tools',{ms:8000,tone:'attention'});},900);}
        }
        return false;
      }
      /* A record from a build that predates the log gets a genesis snapshot, so the log describes it from
         the first moment this build touches it. */
      return Promise.resolve(adoptDurableCopy()).then(function(ad){try{resetEventLog('record loaded from a build without an event log');}catch(e){_q(e,'P1');}return ad;});
    });
  }).then(function(adopted){if(adopted){_memoInvalidate();applySettings();renderAll();}dailyJobs();
    /* anything that saves runs only after the record has loaded: run earlier on a slow device, a save wrote a partly loaded
       record over the stored one (the learning cycle at 2.5 s lost data under delayed storage; responses and the weather
       refresh had the same exposure) */
    try{if(typeof recordResponses==='function')recordResponses();}catch(e){_q(e,'P2');}
    try{if(typeof runLearningCycle==='function')runLearningCycle();}catch(e){_q(e,'P2');}
    try{if(typeof startWeatherAuto==='function')startWeatherAuto();}catch(e){_q(e,'P2');}
    try{if(typeof aiAttach==='function')aiAttach();}catch(e){_q(e,'P2');}   /* the model, only if the person turned it on */
    renderAll();})
   .catch(function(e){_q(e,'P1');dailyJobs();});
  try{watchOtherTabs();}catch(e){_q(e);}
  storageEstimate().then(function(est){_STORAGE_EST=est;}).catch(_q);
  window.addEventListener('online',function(){renderAll();});window.addEventListener('offline',function(){renderAll();});
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible'){dailyJobs();renderAll();}});
  registerServiceWorker();
  /* firstRun runs once the stored record has been reconciled (above): run here, it read the quick-start mirror, which may
     predate finishing setup, and showed the setup again after it had been completed. */
  try{loadFoodManifest().then(function(){if(_TAB==='food'||_TAB==='tools')renderAll();}).catch(function(){});}catch(e){}
}
if(typeof document!=='undefined'&&document.readyState!=='loading')boot();else if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',boot);
