/* ============================================================================
   REGION: SCHEMA — one versioned document with named collections. Not one unstructured blob:
   every collection has a declared shape (see validateDB) and a migration chain.
   ============================================================================ */
var OBS_TYPES={
  weight:{label:'Body weight',unit:'lb',group:'body',consumers:['weight trend','7/14-day average','TDEE','forecast','goal trajectory','rate of loss'],min:50,max:700,step:0.1},
  waist:{label:'Waist',unit:'in',group:'body',consumers:['waist trend','body-composition estimate','stall diagnosis','fat vs other mass'],min:15,max:80,step:0.1},
  neck:{label:'Neck',unit:'in',group:'body',consumers:['body-composition estimate (circumference model)'],min:8,max:30,step:0.1},
  hip:{label:'Hip',unit:'in',group:'body',consumers:['body-composition estimate (circumference model, female)'],min:20,max:90,step:0.1},
  chest:{label:'Chest',unit:'in',group:'body',consumers:['measurement trend'],min:20,max:80,step:0.1},
  arm:{label:'Upper arm',unit:'in',group:'body',consumers:['measurement trend','lean-mass indicator'],min:6,max:30,step:0.1},
  thigh:{label:'Thigh',unit:'in',group:'body',consumers:['measurement trend','lean-mass indicator'],min:10,max:45,step:0.1},
  bodyfat:{label:'Body fat',unit:'%',group:'body',consumers:['composition estimate cross-check'],min:2,max:70,step:0.1,methods:['DEXA','BIA scale','calipers','Bod Pod','hydrostatic','visual estimate','other']},
  rhr:{label:'Resting heart rate',unit:'bpm',group:'body',consumers:['fitness indicator','recovery signal'],min:30,max:140,step:1},
  calories:{label:'Calories',unit:'kcal',group:'nutrition',consumers:['TDEE','energy balance','calorie adherence','deficit estimate'],min:0,max:15000,step:1},
  protein:{label:'Protein',unit:'g',group:'nutrition',consumers:['protein adherence','muscle-retention risk'],min:0,max:600,step:1},
  carbs:{label:'Carbohydrate',unit:'g',group:'nutrition',consumers:['macro summary','water-noise context'],min:0,max:1500,step:1},
  fat:{label:'Dietary fat',unit:'g',group:'nutrition',consumers:['macro summary','fat floor check'],min:0,max:500,step:1},
  fiber:{label:'Fiber',unit:'g',group:'nutrition',consumers:['fiber adequacy','satiety intervention'],min:0,max:200,step:1},
  water:{label:'Water',unit:'L',group:'nutrition',consumers:['hydration context'],min:0,max:15,step:0.1},
  urine:{label:'Urine colour',unit:'1\u20138',group:'recovery',consumers:['hydration_balance'],min:1,max:8,step:1},
  sweatrate:{label:'Sweat rate',unit:'L/h',group:'activity',consumers:['hydration_balance'],min:0,max:4,step:0.05},
  adherence:{label:'Plan adherence',unit:'%',group:'nutrition',consumers:['adherence confidence','model error vs execution error'],min:0,max:100,step:1},
  hunger:{label:'Hunger',unit:'/10',group:'appetite',consumers:['appetite burden','diet sustainability','over-aggressive check'],min:0,max:10,step:1},
  fullness:{label:'Fullness',unit:'/10',group:'appetite',consumers:['satiety efficiency'],min:0,max:10,step:1},
  cravings:{label:'Cravings',unit:'/10',group:'appetite',consumers:['overeating risk'],min:0,max:10,step:1},
  difficulty:{label:'Diet difficulty',unit:'/10',group:'appetite',consumers:['diet sustainability'],min:0,max:10,step:1},
  steps:{label:'Steps',unit:'steps',group:'activity',consumers:['step baseline','NEAT trend','activity target','TDEE context'],min:0,max:80000,step:1},
  cardio:{label:'Cardio',unit:'min',group:'activity',consumers:['cardio load','recovery interference','activity adherence'],min:0,max:600,step:1,modalities:['incline walk','walk','cycle','elliptical','swim','row','jog','stairs','other']},
  /* Completed mobility routines, in minutes, with the routine's name in the note — so they appear in the history. */
  mobility:{label:'Mobility',unit:'min',group:'activity',consumers:['movement history'],min:1,max:180,step:1},
  sleep:{label:'Sleep',unit:'h',group:'recovery',consumers:['recovery state','appetite context','over-aggressive check'],min:0,max:16,step:0.1},
  sleepq:{label:'Sleep quality',unit:'/10',group:'recovery',consumers:['recovery state'],min:0,max:10,step:1},
  fatigue:{label:'Fatigue',unit:'/10',group:'recovery',consumers:['recovery state','deload candidate','over-aggressive check'],min:0,max:10,step:1},
  stress:{label:'Stress',unit:'/10',group:'recovery',consumers:['recovery state'],min:0,max:10,step:1},
  soreness:{label:'Soreness',unit:'/10',group:'recovery',consumers:['recovery state','water-noise context'],min:0,max:10,step:1},
  motivation:{label:'Motivation',unit:'/10',group:'recovery',consumers:['adherence risk'],min:0,max:10,step:1},
  supplement:{label:'Supplement',unit:'',group:'supplement',consumers:['supplement adherence','creatine water-weight context'],text:true},
  note:{label:'Observation note',unit:'',group:'note',consumers:['replay narrative','search'],text:true},
  context:{label:'Context tag',unit:'',group:'note',consumers:['interpretation context (travel, illness, new scale)'],text:true,tags:['travel','illness','holiday','high stress','new scale','new program','deload','injury','high sodium','high carbs','poor sleep','alcohol']}
};
var PHASE_TYPES={
  cut:{label:'Cut',objective:'Reduce fat mass while preserving lean tissue and performance.'},
  recomp:{label:'Recomposition',objective:'Hold weight roughly stable while waist falls and strength rises.'},
  lean_gain:{label:'Lean gain',objective:'Add muscle with a small, controlled surplus.'},
  maintenance:{label:'Maintenance',objective:'Find and hold the individual maintenance range; protect against regain.'},
  diet_break:{label:'Diet break',objective:'Planned return to estimated maintenance to restore appetite, recovery and adherence.'},
  transition:{label:'Transition',objective:'Move intake toward maintenance gradually after a cut.'},
  recovery:{label:'Recovery / deload',objective:'Reduce training load to restore performance and recovery.'},
  goal_complete:{label:'Goal complete',objective:'Goal reached; review and choose the next objective.'}
};
function emptyDB(){
  return {
    schemaVersion:SCHEMA_VERSION,appVersion:APP_VERSION,createdAt:nowISO(),revision:0,instance:uid('inst'),
    profile:{name:'',age:null,sex:'',heightIn:null,startWeightLb:null,goalWeightLb:null,goalType:'',targetDate:'',trainingExperience:'',activityBaseline:'',dietPreference:'',equipment:'',schedule:'',sleepTargetH:null,createdAt:nowISO(),updatedAt:null},
    phases:[],observations:[],sessions:[],foodLogs:[],foods:[],recipes:[],
    decisions:[],interventions:[],predictions:[],experiments:[],negatives:[],snapshots:[],archive:[],notes:[],plans:[],executions:[],responses:[],cycles:[],environment:[],
    models:{calibration:{},versions:{}},
    settings:{units:'imperial',detail:'insightful',textScale:'M',density:'cozy',contrast:'normal',motion:'auto',theme:'dark',showModels:true,lineSpacing:'normal',letterSpacing:'normal',textWeight:'regular',folds:{},lastBackupAt:null,onboarded:false,program:'fullbody3',programHistory:[],foodDatabaseVersion:null,favorites:[],deviceTests:{},jobs:{}},
    ledger:{migrations:[],saves:0,lastSaveAt:null,corruptions:[]},
    demo:{active:false,generatedAt:null,scenario:null}
  };
}
/* Migrations: SCHEMA n → n+1. Never just bump the number. Each step is idempotent and non-destructive.
   Rules: known older schema → sequential migrations → current; unknown newer → rejected; unknown older
   (below SCHEMA_MIN_KNOWN, non-integer) → rejected as "migration unavailable"; a document with no version
   is accepted as schema 1 only when its collection shape matches a 1.0 record, and the ledger says so. */
var MIGRATIONS=[
  {from:1,to:2,note:'food basis (g / mL / serving) on foods and logs; knowledge dates (createdAt) and edit history on phases, decisions, interventions, negatives; program history',fn:function(db){
    var iso=function(d){return d?(String(d).length>10?String(d):String(d)+'T00:00:00.000Z'):null;};
    (db.foodLogs||[]).forEach(function(l){if(!l.basis){l.basis='g';l.quantity=l.grams!=null?l.grams:l.quantity;l.ml=null;l.servings=null;}if(l.food&&typeof l.food==='object'){if(!l.food.basis)l.food.basis='g';if(!l.food.per100)l.food.per100=l.food.per100g||{};if(!l.food.per100g)l.food.per100g=l.food.per100;if(!l.food.conversionConfidence)l.food.conversionConfidence='exact';}});
    (db.foods||[]).forEach(function(f){if(!f.basis)f.basis='g';if(!f.per100)f.per100=f.per100g||{};if(!f.per100g&&f.basis==='g')f.per100g=f.per100;if(!f.conversionConfidence)f.conversionConfidence='exact';});
    (db.recipes||[]).forEach(function(r){(r.ingredients||[]).forEach(function(i){if(!i.basis){i.basis='g';i.quantity=i.grams!=null?i.grams:0;}if(i.food&&!i.food.basis){i.food.basis='g';i.food.per100=i.food.per100g||{};}});});
    (db.phases||[]).forEach(function(p){if(!p.createdAt)p.createdAt=iso(p.startDate);if(!Array.isArray(p.history))p.history=[];});
    (db.interventions||[]).forEach(function(i){if(!i.createdAt)i.createdAt=iso(i.date);});
    (db.decisions||[]).forEach(function(d){if(!d.createdAt)d.createdAt=d.at||iso(d.date);});
    (db.negatives||[]).forEach(function(n){if(!n.createdAt)n.createdAt=n.at||iso(n.date);});
    (db.experiments||[]).forEach(function(e){if(!e.createdAt)e.createdAt=iso(e.startDate);});
    (db.notes||[]).forEach(function(n){if(n&&!n.createdAt)n.createdAt=n.at||iso(n.date);});
    if(db.settings){if(!Array.isArray(db.settings.programHistory))db.settings.programHistory=[{at:db.createdAt||iso(todayISO()),program:db.settings.program||'fullbody3'}];if(!Array.isArray(db.settings.favorites))db.settings.favorites=[];(db.settings.favorites||[]).forEach(function(f){if(!f.basis){f.basis='g';f.per100=f.per100g||{};}});if(db.settings.foodDatabaseVersion===undefined)db.settings.foodDatabaseVersion=null;if(!db.settings.deviceTests)db.settings.deviceTests={};if(!db.settings.jobs)db.settings.jobs={};}
    return db;
  }}
];
function _looksLikeV1(db){return db&&typeof db==='object'&&!Array.isArray(db)&&Array.isArray(db.observations)&&(db.profile==null||typeof db.profile==='object');}
function migrate(db){
  var applied=[];
  if(!db||typeof db!=='object'||Array.isArray(db))return {ok:false,reason:'not a Physique OS document',db:null,applied:[]};
  var v=db.schemaVersion;var note=null;
  if(v==null){if(_looksLikeV1(db)){v=1;note='document carried no schema version; accepted as schema 1 from its shape';}else return {ok:false,reason:'no schema version and the document shape is not recognized',db:null,applied:[]};}
  if(typeof v!=='number'||!isFinite(v)||v!==Math.floor(v))return {ok:false,reason:'schema version '+String(v)+' is not an integer',db:null,applied:[]};
  if(v>SCHEMA_VERSION)return {ok:false,reason:'schema version '+v+' is newer than this app supports ('+SCHEMA_VERSION+'); update the app before opening this record',db:null,applied:[]};
  if(v<SCHEMA_MIN_KNOWN)return {ok:false,reason:'schema version '+v+' is older than any migration this app knows ('+SCHEMA_MIN_KNOWN+'); migration unavailable',db:null,applied:[]};
  while(v<SCHEMA_VERSION){var m=MIGRATIONS.filter(function(x){return x.from===v;})[0];if(!m)return {ok:false,reason:'no migration path from schema '+v+' to '+SCHEMA_VERSION,db:null,applied:applied};
    try{db=m.fn(db)||db;}catch(e){_q(e);return {ok:false,reason:'migration '+m.from+'\u2192'+m.to+' failed: '+(e&&e.message||e),db:null,applied:applied};}
    db.schemaVersion=m.to;v=m.to;applied.push(m.from+'\u2192'+m.to+' '+m.note);}
  // structural backfill for collections a same-version document may lack (partial exports, older minor builds)
  var fresh=emptyDB();
  Object.keys(fresh).forEach(function(k){if(db[k]===undefined)db[k]=fresh[k];});
  /* every persisted collection (PERSIST_COLLECTIONS, 22-persistence.js): a hand list here missed plans, executions and environment */
  PERSIST_COLLECTIONS.forEach(function(k){if(!Array.isArray(db[k]))db[k]=[];});
  if(!db.settings||typeof db.settings!=='object')db.settings=fresh.settings;
  Object.keys(fresh.settings).forEach(function(k){if(db.settings[k]===undefined)db.settings[k]=fresh.settings[k];});
  if(!db.profile||typeof db.profile!=='object')db.profile=fresh.profile;
  if(!db.ledger||typeof db.ledger!=='object')db.ledger=fresh.ledger;
  if(!db.models||typeof db.models!=='object')db.models=fresh.models;
  if(!db.demo||typeof db.demo!=='object')db.demo=fresh.demo;
  db.schemaVersion=SCHEMA_VERSION;db.appVersion=APP_VERSION;
  if(note)applied.unshift(note);
  if(applied.length){db.ledger.migrations=(db.ledger.migrations||[]).concat(applied.map(function(a){return {at:nowISO(),step:a};}));}
  return {ok:true,db:db,applied:applied};
}
/* Validation for restore/import: reject malformed input, never execute imported content. */
function validateDB(obj){
  var errors=[],warnings=[],counts={};
  if(!obj||typeof obj!=='object'||Array.isArray(obj)){return {ok:false,errors:['Not a Physique OS document'],warnings:[],counts:{}};}
  if(obj.app&&obj.app!==APP_NAME)warnings.push('Document was written by "'+obj.app+'"');
  if(obj.schemaVersion!=null&&(typeof obj.schemaVersion!=='number'||obj.schemaVersion!==Math.floor(obj.schemaVersion)))errors.push('Schema version '+obj.schemaVersion+' is not an integer');
  else if(obj.schemaVersion!=null&&obj.schemaVersion>SCHEMA_VERSION)errors.push('Schema version '+obj.schemaVersion+' is newer than this app supports ('+SCHEMA_VERSION+')');
  else if(obj.schemaVersion!=null&&obj.schemaVersion<SCHEMA_MIN_KNOWN)errors.push('Schema version '+obj.schemaVersion+' is older than any migration this app knows; migration unavailable');
  else if(obj.schemaVersion==null&&!_looksLikeV1(obj))errors.push('Document carries no schema version and its shape is not recognized');
  var lists=PERSIST_COLLECTIONS;
  lists.forEach(function(k){if(obj[k]!=null&&!Array.isArray(obj[k]))errors.push(k+' must be a list');else counts[k]=(obj[k]||[]).length;});
  var seen={};var L=function(k){return Array.isArray(obj[k])?obj[k]:[];};
  L('observations').forEach(function(o,i){
    if(!o||typeof o!=='object'){errors.push('observation #'+i+' malformed');return;}
    if(!o.type||!OBS_TYPES[o.type])warnings.push('observation #'+i+' has unknown type "'+o.type+'"');
    if(!isValidISO(o.date))errors.push('observation #'+i+' has an invalid date');
    else if(daysBetween(todayISO(),o.date)>1)warnings.push('observation #'+i+' is dated in the future ('+o.date+')');
    if(o.id){if(seen[o.id])errors.push('duplicate observation id '+o.id);seen[o.id]=1;}
    var t=OBS_TYPES[o.type];
    if(t&&!t.text){var v=num(o.value);if(v==null)errors.push('observation #'+i+' ('+o.type+') has a non-numeric value');else if(v<t.min||v>t.max)warnings.push('observation #'+i+' ('+o.type+'='+v+') is outside the plausible range');}
  });
  L('predictions').forEach(function(p,i){if(!p||!p.madeAt||!p.dueDate)errors.push('prediction #'+i+' lacks madeAt/dueDate');});
  L('sessions').forEach(function(s,i){if(!s||!isValidISO(s.date))errors.push('session #'+i+' has an invalid date');if(s&&!Array.isArray(s.sets))errors.push('session #'+i+' lacks sets');});
  if(obj.profile&&typeof obj.profile!=='object')errors.push('profile malformed');
  return {ok:!errors.length,errors:errors,warnings:warnings,counts:counts};
}

/* ============================================================================
   REGION: STORAGE — IndexedDB is authoritative; localStorage mirrors for the synchronous first paint.
   Writes go to both. If the mirror is full or evicted, IndexedDB carries on. Reads are synchronous
   from the in-memory document; the boot path adopts the durable copy if it is newer.
   ============================================================================ */
var IDB_NAME='physique-os',IDB_STORE='kv',IDB_VERSION=1;
var LS_KEY='physiqueOS_db_v1',LS_META='physiqueOS_meta_v1';
var DB=null;var _SCHEMA_REJECTION=null;
var _IDB=null,_IDB_READY=false,_IDB_QUEUE=[],_IDB_STATE='not started',_IDB_LAST_ERROR=null;
var _SAVE_STATE={ok:true,lastError:null,lastAt:null,failures:0};
function idbAvailable(){try{return !!(globalThis.indexedDB&&typeof globalThis.indexedDB.open==='function');}catch(e){return false;}}
function openDb(){
  return new Promise(function(resolve,reject){
    if(!idbAvailable())return reject(new Error('IndexedDB unavailable'));
    var req;try{req=indexedDB.open(IDB_NAME,IDB_VERSION);}catch(e){return reject(e);}
    req.onupgradeneeded=function(){try{var db=req.result;if(!db.objectStoreNames.contains(IDB_STORE))db.createObjectStore(IDB_STORE);}catch(e){}};
    req.onsuccess=function(){resolve(req.result);};
    req.onerror=function(){reject(req.error||new Error('open failed'));};
    req.onblocked=function(){reject(new Error('IndexedDB blocked by another tab'));};
  });
}
function idbGet(db,key){return new Promise(function(res,rej){try{var r=db.transaction(IDB_STORE,'readonly').objectStore(IDB_STORE).get(key);r.onsuccess=function(){res(r.result===undefined?null:r.result);};r.onerror=function(){rej(r.error);};}catch(e){rej(e);}});}
function idbSet(db,key,val){return new Promise(function(res,rej){try{var r=db.transaction(IDB_STORE,'readwrite').objectStore(IDB_STORE).put(val,key);r.onsuccess=function(){res(true);};r.onerror=function(){rej(r.error);};}catch(e){rej(e);}});}
function idbDel(db,key){return new Promise(function(res,rej){try{var r=db.transaction(IDB_STORE,'readwrite').objectStore(IDB_STORE).delete(key);r.onsuccess=function(){res(true);};r.onerror=function(){rej(r.error);};}catch(e){rej(e);}});}
function idbKeys(db){return new Promise(function(res,rej){try{var r=db.transaction(IDB_STORE,'readonly').objectStore(IDB_STORE).getAllKeys();r.onsuccess=function(){res(r.result||[]);};r.onerror=function(){rej(r.error);};}catch(e){rej(e);}});}
function idbStatus(){return {state:_IDB_STATE,ready:_IDB_READY,queued:_IDB_QUEUE.length,durable:_IDB_READY?'IndexedDB':'localStorage only',lastError:_IDB_LAST_ERROR};}
var _idbTimer=null;
/* While startup reconciles the stored copies, queued writes are held. See initDurableStorage. */
var _IDB_RECONCILING=false;
function _idbFlush(){
  if(!_IDB_READY||!_IDB||_IDB_RECONCILING)return;
  var pending=_IDB_QUEUE.splice(0,_IDB_QUEUE.length);
  var last={};pending.forEach(function(j){last[j.key]=j.val;}); // collapse bursts: one durable write per key
  Object.keys(last).forEach(function(k){_IDB_INFLIGHT++;idbSet(_IDB,k,last[k]).then(function(){_IDB_INFLIGHT=Math.max(0,_IDB_INFLIGHT-1);_SAVE_STATE.ok=true;_SAVE_STATE.lastAt=nowISO();}).catch(function(err){_IDB_INFLIGHT=Math.max(0,_IDB_INFLIGHT-1);_IDB_LAST_ERROR=String(err&&err.message||err);_SAVE_STATE.failures++;_q(err);});});
}
/* PERSISTENCE SUSPENSION. Raised by withFixture() and runSelfTest(), lowered when they finish. While it is raised nothing
   reaches durable storage by any path. Running the in-app self-test changed the stored record — 884 observations came
   back as 912 after a reload — because tests against the live record appended events to the real event log, and the
   next ordinary save persisted them. */
var _PERSIST_SUSPENDED=0;
function persistenceSuspended(){return _PERSIST_SUSPENDED>0;}
/* DURABILITY WINDOW (H0). Outside checkpoints save() skipped the localStorage mirror and recorded it as "unchanged since
   the last mirrored checkpoint" — it was not: the record had just changed — while IndexedDB writes are debounced 150 ms
   and committed asynchronously. For that window, longer on a slow phone, the latest change existed only in memory:
   under a throttled CPU a weight logged just before closing was gone after reopening. A save now also writes the
   mirror synchronously whenever IndexedDB was not fully durable when it began, and the mirror is flushed when the page
   is hidden or closed. The meta key records which revision each copy holds, so a loss that still happens is reported. */
var _IDB_INFLIGHT=0,_MIRROR_REV=0;
function idbDurable(){return !!(_IDB_READY&&!_IDB_RECONCILING&&_IDB_QUEUE.length===0&&_IDB_INFLIGHT===0);}
function idbWrite(key,val){if(_PERSIST_SUSPENDED>0)return;_IDB_QUEUE.push({key:key,val:val});if(_IDB_READY){clearTimeout(_idbTimer);_idbTimer=setTimeout(_idbFlush,150);}}
function initDurableStorage(opts){
  if(!idbAvailable()){_IDB_STATE='unavailable \u2014 localStorage only';return Promise.resolve(idbStatus());}
  _IDB_STATE='opening';
  /* DATA LOSS, found through a lost appearance setting. Startup loads the localStorage mirror first, and that mirror is
     only rewritten at checkpoints, so it can be many revisions behind IndexedDB. Startup then saved, the writes queued
     because IndexedDB was not open yet, and this line FLUSHED THAT QUEUE AS SOON AS IT OPENED — writing the stale
     record over the newer one — before boot read IndexedDB to see whether it held something newer. It then read
     back the stale copy it had just written. Every change since the last checkpoint was destroyed by reopening
     the app: a revision-66 record came back at revision 8. With opts.reconcile the queue is held until the caller
     has compared the stored copies and decided which one wins. */
  return openDb().then(function(db){_IDB=db;_IDB_READY=true;_IDB_STATE='ready';
    if(opts&&opts.reconcile)_IDB_RECONCILING=true;else _idbFlush();return idbStatus();})
    .catch(function(err){_IDB_STATE='failed: '+String(err&&err.message||err);_IDB_LAST_ERROR=_IDB_STATE;_q(err);return idbStatus();});
}
/* Per-device working state is excluded from export. The materialized analytics store is a cache: exporting
   it would carry one device's stale conclusions into another device's record, and a cache that travels is a
   cache that goes stale in two places. Listed explicitly so the exclusion is visible rather than implied. */
var EXPORT_EXCLUDED_SETTINGS=['materialized','jobRuns'];
function serializeDB(){
  return JSON.stringify(DB,function(k,v){
    if(this===DB.settings&&EXPORT_EXCLUDED_SETTINGS.indexOf(k)>=0)return undefined;
    return v;
  });
}
function _lsGet(k){try{return localStorage.getItem(k);}catch(e){return null;}}
function _lsSet(k,v){try{localStorage.setItem(k,v);return true;}catch(e){return false;}}
function loadDB(){
  var raw=_lsGet(LS_KEY);
  if(raw){
    try{var obj=JSON.parse(raw);if(obj&&typeof obj==='object'){var m=migrate(obj);if(m.ok)return {db:m.db,source:'localStorage',applied:m.applied};
        var kept=emptyDB();kept.ledger.corruptions.push({at:nowISO(),where:'localStorage',bytes:raw.length,kind:'schema',note:'record rejected: '+m.reason+'; raw copy preserved in IndexedDB under rejected-<time>'});try{idbWrite('rejected-'+Date.now(),raw);}catch(x){}_SCHEMA_REJECTION={reason:m.reason,bytes:raw.length};return {db:kept,source:'fresh-after-schema-rejection',applied:[]};}}
    catch(e){_q(e);var fresh=emptyDB();fresh.ledger.corruptions.push({at:nowISO(),where:'localStorage',bytes:raw.length,kind:'parse',note:'unparseable; raw copy preserved under physiqueOS_corrupt'});try{idbWrite('corrupt-'+Date.now(),raw);}catch(x){}return {db:fresh,source:'fresh-after-corruption',applied:[]};}
  }
  return {db:emptyDB(),source:'fresh',applied:[]};
}
var _saveListeners=[];
function onSave(fn){_saveListeners.push(fn);}
/* Writes only what changed (see 22-persistence.js). The full-document path remains as a periodic checkpoint
   and as the localStorage mirror, so recovery never depends on the incremental layout being intact. */
function save(label){
  if(typeof _PERSIST_SUSPENDED!=='undefined'&&_PERSIST_SUSPENDED>0)return true;   /* inside a test or fixture */
  /* A record that failed the boot integrity check is never written back over the durable copy. */
  if(typeof _INTEGRITY_HOLD!=='undefined'&&_INTEGRITY_HOLD){_SAVE_STATE.ok=false;_SAVE_STATE.lastError='saving is suspended: the record failed an integrity check on load';return false;}
  var _wasDurable=idbDurable();
  try{
    DB.revision=(DB.revision||0)+1;DB.ledger.saves=(DB.ledger.saves||0)+1;DB.ledger.lastSaveAt=nowISO();DB.appVersion=APP_VERSION;
    var inc=null;
    if(typeof persistIncremental==='function'){try{inc=persistIncremental(label);}catch(e){_q(e,'P0');}}
    /* The localStorage mirror stays synchronous and whole-document, because its purpose is to survive an
       IndexedDB failure. Past the budget it cannot hold the record at all, and saying so is better than
       silently truncating: IndexedDB is authoritative and the export is the copy the user controls. */
    var s=null,mirrored=false;
    if(!inc||_writesSinceCheckpoint===0||!_IDB_READY||!_wasDurable){s=serializeDB();}
    if(s!=null&&s.length<=LS_MIRROR_BUDGET){mirrored=_lsSet(LS_KEY,s);if(mirrored)_MIRROR_REV=DB.revision;}
    else if(s!=null){_lsSet(LS_KEY,'');mirrored=false;}
    else mirrored=true; // IndexedDB was durable when this save began; its own write is queued behind it
    _lsSet(LS_META,JSON.stringify({revision:DB.revision,mirrorRevision:_MIRROR_REV,instance:DB.instance,at:DB.ledger.lastSaveAt}));
    if(s!=null&&(!inc||inc.checkpoint))idbWrite('db',s);
    if(typeof auditAppend==='function')auditAppend('save',{label:label||null,collections:inc?inc.collections:'all',bytes:inc?inc.bytes:(s?s.length:null)});
    if(!mirrored&&!_IDB_READY){_SAVE_STATE.ok=false;_SAVE_STATE.lastError='localStorage rejected the write and IndexedDB is not ready';}
    else{_SAVE_STATE.ok=true;_SAVE_STATE.lastError=null;_SAVE_STATE.lastAt=DB.ledger.lastSaveAt;}
    _memoInvalidate();
    _saveListeners.forEach(function(f){try{f(label);}catch(e){_q(e);}});
    return true;
  }catch(e){_q(e,'P0');_SAVE_STATE.ok=false;_SAVE_STATE.lastError=String(e&&e.message||e);return false;}
}
function adoptDurableCopy(){
  if(!_IDB)return Promise.resolve(false);
  return idbGet(_IDB,'db').then(function(v){
    if(!v)return false;
    var mirror=_lsGet(LS_KEY);
    if(mirror===v)return false;
    try{var obj=JSON.parse(v);if(!obj||typeof obj!=='object')return false;
      if(DB&&(obj.revision||0)<=(DB.revision||0)&&mirror)return false; // mirror is newer or equal
      var m=migrate(obj);if(!m.ok){_q(new Error('durable copy rejected: '+m.reason));return false;}DB=m.db;_lsSet(LS_KEY,v);_memoInvalidate();return true;
    }catch(e){_q(e);return false;}
  }).catch(function(e){_q(e);return false;});
}
function writeAutoBackup(){ // daily durable snapshot for corruption recovery
  try{if(!_IDB_READY)return;var key='autobackup-'+todayISO();idbWrite(key,serializeDB());
    idbKeys(_IDB).then(function(keys){keys.filter(function(k){return /^autobackup-/.test(k);}).sort().slice(0,-7).forEach(function(k){idbDel(_IDB,k).catch(_q);});}).catch(_q);
  }catch(e){_q(e);}
}
function listAutoBackups(){if(!_IDB)return Promise.resolve([]);return idbKeys(_IDB).then(function(keys){return keys.filter(function(k){return /^autobackup-/.test(k);}).sort().reverse();}).catch(function(e){_q(e);return [];});}
/* The richer storageEstimate() in 22-persistence.js is the one that survives concatenation, so this thin
   version was dead code that merely looked like a definition. Removed rather than renamed: two functions
   answering one question is how they drift apart. */
/* multi-tab: another tab saved a newer revision → reload the document rather than overwrite it */
function watchOtherTabs(){
  try{window.addEventListener('storage',function(ev){
    if(ev.key!==LS_META||!ev.newValue)return;
    try{var meta=JSON.parse(ev.newValue);if(meta.instance===DB.instance)return;if((meta.revision||0)>(DB.revision||0)){var l=loadDB();DB=l.db;_memoInvalidate();if(typeof renderAll==='function')renderAll(true);if(typeof toast==='function')toast('Reloaded changes saved in another tab');}}catch(e){_q(e);}
  });}catch(e){_q(e);}
}

/* ============================================================================
   REGION: UNDO — reversible mutations via document snapshots. Operates on state, never the DOM.
   ============================================================================ */
var _undoStack=[],UNDO_MAX=30;
/* UNDO BATCH: a group action (a quick log of several values, logging a set of supplements) records ONE undo step;
   entries inside it do not record their own — undo used to remove them one at a time, each a full snapshot */
var _UNDO_BATCH=0;
function undoBatch(label,fn){pushUndo(label);_UNDO_BATCH++;try{return fn();}finally{_UNDO_BATCH--;}}
function pushUndo(label){if(_UNDO_BATCH>0)return;try{_undoStack.push({label:label||'change',at:nowISO(),snap:serializeDB(),mark:(typeof undoMark==='function')?undoMark():null});if(_undoStack.length>UNDO_MAX)_undoStack.shift();}catch(e){_q(e);}}
function canUndo(){return _undoStack.length>0;}
function undoLabel(){return _undoStack.length?_undoStack[_undoStack.length-1].label:null;}
function undo(){
  var u=_undoStack.pop();if(!u)return null;
  try{var obj=JSON.parse(u.snap);var m=migrate(obj);if(!m.ok)throw new Error('undo snapshot rejected: '+m.reason);var keepRev=DB.revision;DB=m.db;DB.revision=keepRev;
    if(typeof undoInLog==='function')undoInLog(u.mark,u.label);   /* the undo is recorded in the log, or a restart brings the change back */
    save('undo');return u.label;}catch(e){_q(e);return null;}
}
function clearUndo(){_undoStack=[];}

/* memo cache for derived state: invalidated on every save or "today" change */
var _MEMO={};function _memoInvalidate(){_MEMO={};}
function memo(key,fn){if(Object.prototype.hasOwnProperty.call(_MEMO,key))return _MEMO[key];var v=fn();_MEMO[key]=v;return v;}

/* Flush the mirror synchronously when the page is hidden or closed and the mirror is behind the record. */
function flushMirrorIfBehind(reason){
  try{if(typeof _PERSIST_SUSPENDED!=='undefined'&&_PERSIST_SUSPENDED>0)return false;
    if(!DB||(DB.revision||0)<=_MIRROR_REV)return false;
    var s=serializeDB();if(s.length>LS_MIRROR_BUDGET)return false;
    if(_lsSet(LS_KEY,s)){_MIRROR_REV=DB.revision;_lsSet(LS_META,JSON.stringify({revision:DB.revision,mirrorRevision:_MIRROR_REV,instance:DB.instance,at:DB.ledger.lastSaveAt,flushedOn:reason}));return true;}
  }catch(e){_q(e,'P1');}
  return false;
}
if(typeof window!=='undefined'&&window.addEventListener)window.addEventListener('pagehide',function(){flushMirrorIfBehind('pagehide');});
if(typeof document!=='undefined'&&document&&document.addEventListener)document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')flushMirrorIfBehind('hidden');});
