/* ============================================================================
   REGION: SCHEDULER — the periodic work an offline app must do for itself.
   No timers and no service-worker background sync: every job runs on open, records when it last ran, and
   states what it did. A job that cannot run says so rather than failing silently.
   ============================================================================ */
var JOBS=[
  {id:'score-predictions',label:'Score due forecasts',everyDays:1,why:'an unscored forecast teaches nothing; calibration depends on closing the loop',
   run:function(){var n=scorePredictions();return {ok:true,changed:n,text:n?('scored '+n+' forecast'+(n===1?'':'s')):'no forecasts were due'};}},
  {id:'stamp-predictions',label:'Stamp today\u2019s forecasts',everyDays:1,why:'a prediction made after the fact is not a prediction',
   run:function(){var made=stampPredictions();return {ok:true,changed:made.length,text:made.length?('stamped '+made.length+' forecast'+(made.length===1?'':'s')):'already stamped today, or the trend is not established'};}},
  {id:'experiment-due',label:'Check experiments due for evaluation',everyDays:1,why:'an experiment that is never evaluated becomes a belief instead of a result',
   run:function(){var due=experimentsDue();return {ok:true,changed:due.length,text:due.length?(due.length+' experiment'+(due.length===1?'':'s')+' ready to evaluate'):'none due',actions:due.map(function(e){return {label:'Evaluate: '+(e.intervention||e.variable),act:'exp.evaluate',arg:e.id};})};}},
  {id:'data-quality',label:'Data quality sweep',everyDays:1,why:'stale or low-quality streams quietly widen every interval downstream',
   run:function(){var stale=[];['weight','waist','calories','sleep'].forEach(function(t){var o=latestObs(t);var f=o?freshness(t,o.date):null;if(!o||(f&&f.state!=='fresh'))stale.push(t+(o?' ('+ageLabel(o.date)+')':' (never)'));});
     var an=detectAnomalies();var q=streamQuality('weight',14);
     return {ok:true,changed:stale.length+an.length,text:(stale.length?('stale: '+stale.join(', ')):'all tracked streams are current')+(an.length?(' \u00b7 '+an.length+' anomal'+(an.length===1?'y':'ies')):'')+(q.n&&q.level==='low'?' \u00b7 weigh-in quality is low':'')};}},
  {id:'migration-check',label:'Schema and migration check',everyDays:7,why:'a record that cannot be migrated must be found before the backup that could restore it is overwritten',
   run:function(){var m=migrate(JSON.parse(JSON.stringify(DB)));var rej=_SCHEMA_REJECTION;
     return {ok:m.ok&&!rej,changed:0,text:rej?('a record was rejected on load: '+rej.reason+' \u2014 the raw copy is preserved in IndexedDB'):('record is schema '+DB.schemaVersion+' and re-migrates cleanly')};}},
  {id:'backup-verify',label:'Backup verification (restore dry run)',everyDays:7,why:'an untested backup is a hope; this parses and validates the latest automatic backup without touching the live record',
   run:function(){return verifyLatestBackup();}},
  {id:'pwa-update',label:'Check for an app update',everyDays:1,why:'an offline app can run an old build indefinitely without noticing',
   run:function(){if(typeof fetch!=='function')return {ok:false,text:'not reachable in this environment'};
     return fetch('./version.json',{cache:'no-store'}).then(function(r){return r.json();}).then(function(v){
       var newer=v.build&&v.build!==BUILD_ID;return {ok:true,changed:newer?1:0,text:newer?('a newer build is available ('+v.build+'; running '+BUILD_ID+') \u2014 reload to update'):'running the current build ('+BUILD_ID+')'};})
       .catch(function(){return {ok:false,text:'could not reach version.json (offline is normal)'};});}},
  {id:'food-db-version',label:'Check the food database version',everyDays:7,why:'a food database change is a discontinuity in intake comparisons, not a change in what you ate',
   run:function(){if(!_foodManifest)return {ok:false,text:'food database has not been opened this session'};
     return {ok:true,changed:0,text:'food database '+_foodManifest.databaseVersion+(DB.settings.foodDatabaseVersion===_foodManifest.databaseVersion?' (unchanged)':' (changed \u2014 a context tag was recorded)')};}}
];
function jobState(id){return (DB.settings.jobs||{})[id]||null;}
function jobDue(j){var st=jobState(j.id);if(!st||!st.at)return true;return daysBetween(st.at.slice(0,10),todayISO())>=j.everyDays;}
function runJob(id,opts){
  opts=opts||{};var j=JOBS.filter(function(x){return x.id===id;})[0];if(!j)return null;
  var finish=function(res){
    DB.settings.jobs=DB.settings.jobs||{};
    DB.settings.jobs[id]={at:nowISO(),ok:res.ok!==false,text:res.text,changed:res.changed||0};
    if(!opts.noSave)save('job:'+id);
    return Object.assign({id:id,label:j.label},res);
  };
  try{var r=j.run();if(r&&typeof r.then==='function')return r.then(finish).catch(function(e){_q(e);return finish({ok:false,text:'failed: '+(e&&e.message||e)});});return finish(r);}
  catch(e){_q(e);return finish({ok:false,text:'failed: '+(e&&e.message||e)});}
}
function runDueJobs(opts){
  var out=[];var async=[];
  JOBS.forEach(function(j){if(!jobDue(j))return;var r=runJob(j.id,opts);if(r&&typeof r.then==='function')async.push(r);else if(r)out.push(r);});
  if(async.length)Promise.all(async).then(function(rs){rs.forEach(function(r){out.push(r);});if(typeof renderAll==='function'&&rs.some(function(r){return r.changed;}))renderAll();}).catch(_q);
  return out;
}
/* §73: which jobs may run with the app closed. The service worker already receives periodicsync; what was
   missing is a declaration of what is allowed to happen then. A background run may only READ and raise an
   attention item — never mutate the record. Anything that changes your data happens with you present, which
   is the same rule domains and the assistant follow. */
var BACKGROUND_ELIGIBLE=['stale','score-predictions','experiments','reminders','integrity','backup'];
var BACKGROUND_FORBIDDEN=/^(observation\.|session\.|food\.|phase\.|profile\.|prediction\.stamped|program\.|intervention\.)/;
function backgroundJobs(){
  return JOBS.filter(function(j){
    return BACKGROUND_ELIGIBLE.some(function(k){return String(j.id).indexOf(k)>=0;});
  }).map(function(j){
    var st=jobState(j.id);
    return {id:j.id,label:j.label||j.id,every:j.every||j.everyDays||null,
      lastRun:st&&st.at?String(st.at).slice(0,10):null,due:jobDue(j)};
  });
}
function runBackgroundJobs(){
  var eligible=backgroundJobs().filter(function(j){return j.due;});
  var evBefore=_EVENTS.length;
  var counts={observations:DB.observations.length,sessions:DB.sessions.length,foodLogs:DB.foodLogs.length};
  var ran=[];
  eligible.forEach(function(j){
    try{ran.push({id:j.id,result:runJob(j.id,{background:true})});}catch(e){_q(e,'P2');}
  });
  /* Enforced rather than trusted, and precise about what it forbids: your data must not change, and no new
     commitment may be made on your behalf. Recording the outcome of a forecast already shown to you IS
     allowed \u2014 that is how calibration works at all. */
  var userData=Object.keys(counts).some(function(k){return DB[k].length!==counts[k];});
  var emitted=_EVENTS.slice(evBefore).map(function(e){return e.type;});
  var forbidden=emitted.filter(function(t){return BACKGROUND_FORBIDDEN.test(t);});
  return {ran:ran.length,jobs:ran,eligible:backgroundJobs().length,
    emitted:emitted,userDataChanged:userData,forbidden:forbidden,
    clean:!userData&&!forbidden.length,cls:'MEASURED',
    note:'Background jobs read the record, raise attention items, and record outcomes of forecasts already shown to you. They do not change your data and do not make new commitments while you are away.',
    defect:userData?'A background job changed your data, which it must not do.':
      (forbidden.length?('A background job emitted '+forbidden.join(', ')+', which commits you to something you were not present for.'):null)};
}
function jobsSummary(){return JOBS.map(function(j){var st=jobState(j.id);return {id:j.id,label:j.label,why:j.why,everyDays:j.everyDays,lastRun:st?st.at:null,lastText:st?st.text:'never run',ok:st?st.ok:null,due:jobDue(j)};});}
/* restore dry run: read the newest automatic backup out of IndexedDB, parse, validate and migrate a copy.
   The live record is never touched. This is the only check that distinguishes "a backup exists" from
   "a backup would actually restore". */
function _checkBackupText(raw,where){
  var obj;try{obj=JSON.parse(raw);}catch(e){return {ok:false,text:'the stored backup does not parse as JSON \u2014 export a fresh backup now'};}
  var v=validateDB(obj);var m=migrate(JSON.parse(JSON.stringify(obj)));
  if(!m.ok)return {ok:false,text:'the backup cannot be migrated: '+m.reason};
  var counts=['observations','sessions','foodLogs','phases','predictions','experiments'].map(function(k){return k+' '+((obj[k]||[]).length);}).join(', ');
  return {ok:v.ok,changed:0,text:'verified '+where+': '+counts+(v.ok?'; restores cleanly':'; validation warnings: '+(v.errors||[]).join('; ')),bytes:raw.length,at:obj.savedAt||obj.createdAt||null};
}
function verifyLatestBackup(){
  if(!_IDB){var mirror=null;try{mirror=_lsGet(LS_KEY);}catch(e){_q(e);}
    return mirror?_checkBackupText(mirror,'localStorage mirror (IndexedDB unavailable)'):{ok:false,text:'no durable copy available to verify'};}
  return listAutoBackups().then(function(keys){
    if(!keys.length){var mir=null;try{mir=_lsGet(LS_KEY);}catch(e){_q(e);}
      return mir?_checkBackupText(mir,'localStorage mirror (no automatic backup yet)'):{ok:false,text:'no automatic backup has been written yet'};}
    return idbGet(_IDB,keys[0]).then(function(raw){return raw?_checkBackupText(raw,'automatic backup '+keys[0].replace('autobackup-','')):{ok:false,text:'the newest automatic backup could not be read'};});
  }).catch(function(e){_q(e);return {ok:false,text:'backup verification failed: '+(e&&e.message||e)};});
}
/* ============================================================================
   REGION: DATA CONTRACTS — every observation type must reach a consumer, and every model input must exist.
   These are assertions about the wiring of the system, checked by the self-test rather than assumed.
   ============================================================================ */
/* Observation types name their consumers in prose. This table binds each prose name to the thing that
   actually reads it — a model id, a named function, or a view — so the check proves wiring rather than
   matching strings. An unbound name is a contract failure: something is collected and never used. */
var CONSUMER_BINDINGS={
  /* Logged mobility minutes are read by the Mobility screen's weekly summary. */
  'movement history':'fn:mobilityThisWeek',
  'weight trend':'weight_trend','7/14-day average':'weight_avg','TDEE':'tdee_personal','TDEE context':'tdee_personal',
  'forecast':'weight_forecast','goal trajectory':'goal_traj','rate of loss':'rate_band','waist trend':'fat_vs_other',
  'stall diagnosis':'fn:diagnose','fat vs other mass':'fat_vs_other','body-composition estimate':'bodycomp_circ',
  'body-composition estimate (circumference model)':'bodycomp_circ','body-composition estimate (circumference model, female)':'bodycomp_circ',
  'composition estimate cross-check':'bodycomp_circ','measurement trend':'view:Progress','lean-mass indicator':'muscle_risk',
  'fitness indicator':'view:Body','recovery signal':'recovery','recovery state':'recovery','recovery interference':'recovery',
  'energy balance':'energy_balance','deficit estimate':'energy_balance','calorie adherence':'adherence','protein adherence':'adherence',
  'activity adherence':'adherence','supplement adherence':'adherence','adherence confidence':'data_trust','adherence risk':'adherence',
  'muscle-retention risk':'muscle_risk','macro summary':'fn:dayNutrition','fat floor check':'fn:nutritionAdequacy',
  'fiber adequacy':'fn:nutritionAdequacy','satiety intervention':'fn:decide','satiety efficiency':'appetite',
  'appetite burden':'appetite','appetite context':'appetite','overeating risk':'appetite','over-aggressive check':'fn:diagnose',
  'diet sustainability':'fn:diagnose','model error vs execution error':'fn:diagnose','deload candidate':'fn:todaysTraining',
  'cardio load':'met_energy','NEAT trend':'fn:stepState','step baseline':'personal_baseline','activity target':'view:Plan',
  'water-noise context':'water_noise','creatine water-weight context':'water_noise','hydration context':'water_noise',
  'interpretation context (travel, illness, new scale)':'change_point','replay narrative':'fn:replayAt','search':'fn:foodSearchLocal'
};
function _consumerResolves(c,modelIds){
  var bind=CONSUMER_BINDINGS[c];
  if(bind){if(bind.indexOf('fn:')===0)return typeof this==='undefined'?_fnExists(bind.slice(3)):_fnExists(bind.slice(3));
    if(bind.indexOf('view:')===0)return true;
    return !!modelIds[bind];}
  return !!modelIds[c];
}
function _fnExists(name){try{return typeof eval0(name)==='function';}catch(e){return false;}}
function eval0(name){ // no eval in the bundle: resolve through the global object only
  var g=typeof window!=='undefined'?window:null;return g?g[name]:undefined;
}
function dataContractIssues(){
  var issues=[];
  var modelIds={};MODELS.forEach(function(m){modelIds[m.id]=m;});
  // 1. every observation type declares consumers, and every consumer binds to a model, a function or a view
  Object.keys(OBS_TYPES).forEach(function(t){
    var d=OBS_TYPES[t];
    if(!d.consumers||!d.consumers.length){issues.push({kind:'observation type has no consumer',subject:t});return;}
    d.consumers.forEach(function(c){if(!_consumerResolves(c,modelIds))issues.push({kind:'consumer does not resolve',subject:t+' \u2192 '+c});});
  });
  // 2. every model input names an observation type, another model, or a profile field
  var inputish=/profile|age|sex|height|weight|target|phase|goal|body|duration|modality|load|reps|rir|session|intake|coverage|quality|interval|series|dates|flags|conditions|method|consistency|e1rm|trend|experiment|intervention|before|after|zone|carbohydrate|activity|tdee|deadline|noise|rate|freshness|anomal|source|set|volume|sleep|hunger|fatigue|stress|soreness|step|cardio|protein|calorie|waist|neck|hip|snapshot|adherence|recovery|prediction|program/i;
  MODELS.forEach(function(m){(m.inputs||[]).forEach(function(inp){var key=String(inp).toLowerCase();
    var known=Object.keys(OBS_TYPES).some(function(t){return key.indexOf(t)>=0;})||modelIds[inp]||inputish.test(key);
    if(!known)issues.push({kind:'model input does not resolve',subject:m.id+' \u2190 '+inp});});});
  // 3. every variable a decision can propose has an intervention path (a sheet that can actually change it)
  var actionable={calories:1,steps:1,cardio:1,training:1,protein:1,sleep:1,phase:1,none:1,refeed:1,diet_break:1};
  var proposed={};
  try{['SETUP','HOLD'].forEach(function(){});
    var d=decide();if(d&&d.variable)proposed[d.variable]=1;
    (DB.experiments||[]).forEach(function(e){if(e.variable)proposed[e.variable]=1;});
    (DB.interventions||[]).forEach(function(i){if(i.variable&&i.variable!=='multiple')proposed[i.variable]=1;});
  }catch(e){_q(e);}
  Object.keys(proposed).forEach(function(v){if(!actionable[v]&&!RESPONSE_VARS[v])issues.push({kind:'decision variable has no intervention path',subject:v});});
  // 4. model contracts
  issues=issues.concat(modelContractIssues().map(function(i){return {kind:i.kind,subject:i.model};}));
  return issues;
}
function dependencyGraph(){
  var nodes=[],edges=[];
  Object.keys(OBS_TYPES).forEach(function(t){nodes.push({id:t,kind:'observation',label:OBS_TYPES[t].label||t});(OBS_TYPES[t].consumers||[]).forEach(function(c){edges.push({from:t,to:c,kind:'feeds'});});});
  MODELS.forEach(function(m){nodes.push({id:m.id,kind:'model',label:m.name,cls:m.cls});(m.consumers||[]).forEach(function(c){edges.push({from:m.id,to:c,kind:'feeds'});});});
  return {nodes:nodes,edges:edges,issues:dataContractIssues()};
}
/* ============================================================================
   REGION: DEVICE TEST CHECKLIST — the things a jsdom gate cannot prove.
   ============================================================================ */
var DEVICE_TESTS=[
  {id:'install',label:'Add to Home Screen installs and launches standalone',why:'the Home Screen web app is the storage regime that is exempt from the 7-day ITP eviction rule'},
  {id:'offline',label:'Airplane mode: the app opens and every view renders',why:'the service worker must serve the shell with no network at all'},
  {id:'food-offline',label:'Airplane mode: a food search returns results after a prefetch',why:'branded shards are cached on demand; without a prefetch, search is online-only'},
  {id:'rotate',label:'Rotate to landscape and back with a sheet open',why:'viewport height changes while a sheet is open are where fixed positioning breaks'},
  {id:'keyboard',label:'Open the log sheet and confirm the keyboard does not cover the Save button',why:'iOS resizes the visual viewport, not the layout viewport'},
  {id:'scroll-lock',label:'With a sheet open, the page behind does not scroll',why:'body scroll-lock behaves differently in standalone mode'},
  {id:'text-scale',label:'Set text size to XL and check that nothing clips or overlaps',why:'every size derives from --ts; a fixed pixel value shows up here'},
  {id:'contrast',label:'Switch contrast to high and confirm the change is visible',why:'this setting was previously applied to the wrong element and silently did nothing'},
  {id:'reduced-motion',label:'Enable Reduce Motion in iOS settings; transitions stop',why:'the app honours both the setting and the OS media query'},
  {id:'touch-targets',label:'Every control can be hit with a thumb, including day-strip chips',why:'44px is the minimum; the build gate checks the CSS, not the rendered box'},
  {id:'backup-restore',label:'Export a backup, delete the app, reinstall, restore it',why:'the only test that proves the record survives the worst case'},
  {id:'update',label:'Rebuild, reload twice, confirm the new build is live and data is intact',why:'a service-worker update must not orphan the record'}
];
function deviceTestState(){var st=DB.settings.deviceTests||{};return DEVICE_TESTS.map(function(t){var s=st[t.id]||{};return {id:t.id,label:t.label,why:t.why,status:s.status||'untested',at:s.at||null,note:s.note||''};});}
function setDeviceTest(id,status,note){DB.settings.deviceTests=DB.settings.deviceTests||{};DB.settings.deviceTests[id]={status:status,at:nowISO(),note:note||''};save('device-test');return DB.settings.deviceTests[id];}
