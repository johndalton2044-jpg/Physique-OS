/* ============================================================================
   WORKOUT MODE (H2)
   The core of every dedicated training app, and absent here: today's session from the plan, with targets and a
   suggested load for each exercise, sets ticked off as they are done, a rest timer between them, a swap for an exercise
   the gym does not have, and a finish that saves the session through the ordinary path (so the summary, records and
   next-time suggestions follow). The chosen version of the day (reduced, minimum, travel) shapes what is prescribed.
   A draft is kept in local storage while the workout runs, so closing the app does not lose it; it is not part of the
   record until it is finished.
   ============================================================================ */
var WORKOUT_DRAFT_KEY='physiqueOS_workout_draft';
var _WORKOUT=null,_REST=null;
function _restSecondsFor(e){if(!e)return 90;var g=_groupOf?_groupOf(e.pattern):'accessory';return (g==='squat'||g==='hinge'||g==='push'||g==='pull')&&e.compound?150:(g==='core'?60:90);}
function _lastLoad(exName){
  var e=resolveExercise(exName),best=null;
  (DB.sessions||[]).filter(function(s){return !s.retracted&&!s.supersededBy;}).sort(function(a,b){return a.date<b.date?-1:1;}).forEach(function(s){
    (s.sets||[]).forEach(function(st){var r=resolveExercise(st.exercise);if(r&&e&&r.id===e.id&&st.load!=null)best={load:st.load,reps:st.reps,date:s.date};});});
  return best;
}
function _suggestLoad(exName){
  var last=_lastLoad(exName),pf=null;try{pf=progressionFor(exName);}catch(e){}
  if(pf&&pf.status==='ok'&&pf.recommendation&&last){var r=pf.recommendation;
    if(r.change==='add load'&&r.by)return {load:last.load+(+r.by||0),why:'last time '+last.load+', add '+r.by+' \u2014 '+r.why};
    return {load:last.load,why:(r.change==='hold'?'same as last time':r.change)+' \u2014 '+r.why};}
  if(last)return {load:last.load,why:'what you used last time ('+shortDate(last.date)+')'};
  return {load:null,why:'no history yet \u2014 start light and leave 2\u20133 reps in reserve'};
}
function _repTarget(reps){var m=String(reps||'').match(/(\d+)\D+(\d+)/);return m?{lo:+m[1],hi:+m[2]}:(/^\d+$/.test(String(reps))?{lo:+reps,hi:+reps}:{lo:8,hi:12});}
function _travelSwap(name){
  var e=resolveExercise(name);if(!e||e.equipment.indexOf('bodyweight')>=0)return name;
  var alt=EXERCISES.filter(function(x){return x.pattern===e.pattern&&x.equipment.indexOf('bodyweight')>=0&&x.equipment.length===1;})[0];
  return alt?alt.name:name;
}
/* A template that names a "variation" means whichever variation this person does: the exercise of that movement they
   log most often. "Deadlift variation" otherwise resolved to the conventional deadlift, which the demo person never
   does, so the Romanian deadlift history they have was never used to suggest a load. */
function _usualVariation(name){
  if(!/variation/i.test(name))return null;var e=resolveExercise(name);if(!e)return null;var n={};
  (DB.sessions||[]).forEach(function(s){if(s.retracted)return;(s.sets||[]).forEach(function(st){var r=resolveExercise(st.exercise);if(r&&r.pattern===e.pattern)n[r.name]=(n[r.name]||0)+1;});});
  var best=Object.keys(n).sort(function(a,b){return n[b]-n[a];})[0];return best||null;
}
function buildWorkout(date){
  date=date||todayISO();
  var I=intendedFor(date),tr=(I.items||[]).filter(function(x){return x.item==='training';})[0];
  var ps=null;try{ps=programStructure();}catch(e){}
  var day=null;if(ps&&ps.status==='ok')ps.mesocycles.forEach(function(ms){(ms.microcycles||[]).forEach(function(mc){(mc.days||[]).forEach(function(d){if(d.date===date)day=d;});});});
  var planned=day&&day.planned&&day.planned.kind==='lift'?day.planned:null;
  /* the schedule decides the day (including days you chose to train); the structure covers only its current period,
     so a lifting day outside it built an empty "Session" */
  if(!planned){try{var _P=trainingProgram(),_sp=scheduledPlan(date,_P),_rows=_sp&&_sp.kind==='lift'&&_P.templates?_P.templates[_sp.template]:null;
    if(_rows&&_rows.length)planned={label:_sp.label,kind:'lift',exercises:_rows.map(function(r){return Array.isArray(r)?{name:r[0],sets:r[1]||3,reps:r[2]||'8\u201312'}:r;})};}catch(e){}}
  var mk=(DB.executions||[]).filter(function(x){return x.date===date&&x.item==='training';}).slice(-1)[0];
  var variant=mk&&mk.variant?mk.variant:'full';
  var exs=(planned?planned.exercises:[]).map(function(x,i){
    var usual=_usualVariation(x.name),base=usual||x.name;
    var name=variant==='travel'?_travelSwap(base):base,e=resolveExercise(name);
    var sets=x.sets||3;
    if(variant==='reduced')sets=Math.max(1,Math.round(sets*PLAN_VARIANTS.reduced.share));
    if(variant==='minimum')sets=(e&&e.compound)?1:0;
    var s=_suggestLoad(name),rt=_repTarget(x.reps);
    return {name:name,planned:x.name,swappedFrom:(name!==x.name&&!usual)?x.name:null,usualFor:usual?x.name:null,reps:x.reps,repLo:rt.lo,repHi:rt.hi,why:s.why,rest:_restSecondsFor(e),
      cue:e&&e.cues&&e.cues[0]||'',sets:Array.apply(null,{length:sets}).map(function(){return {load:s.load,reps:null,rir:null,done:false};})};
  }).filter(function(x){return x.sets.length>0;});
  return {date:date,label:planned?planned.label:'Session',variant:variant,startedAt:Date.now(),exercises:exs,current:0,
    empty:!planned,planVersion:I.version||null};
}
function _saveDraft(){try{localStorage.setItem(WORKOUT_DRAFT_KEY,JSON.stringify(_WORKOUT));}catch(e){}}
function _loadDraft(){try{var d=JSON.parse(localStorage.getItem(WORKOUT_DRAFT_KEY)||'null');return d&&d.date===todayISO()?d:null;}catch(e){return null;}}
function _clearDraft(){try{localStorage.removeItem(WORKOUT_DRAFT_KEY);}catch(e){}}
function openWorkout(){
  _WORKOUT=_loadDraft()||buildWorkout(todayISO());
  if(_WORKOUT.empty&&!_WORKOUT.exercises.length){closeSheet();dispatchAct('session.new');return;}
  _saveDraft();openSheet('edit',{form:'workout',title:_WORKOUT.label,desc:'',buf:{}});
}
function _fmtClock(s){s=Math.max(0,Math.round(s));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');}
SHEETS.workout=function(){
  var W=_WORKOUT;if(!W)return {body:'',foot:''};
  var ex=W.exercises[W.current],doneSets=W.exercises.reduce(function(a,x){return a+x.sets.filter(function(s){return s.done;}).length;},0),
    total=W.exercises.reduce(function(a,x){return a+x.sets.length;},0);
  var nav='<div class="wo-nav">'+W.exercises.map(function(x,i){var d=x.sets.every(function(s){return s.done;});
    return '<button class="wo-dot'+(i===W.current?' on':'')+(d?' done':'')+'" data-act="workout.goto" data-arg="'+i+'" aria-label="'+attrEsc(x.name)+'">'+(i+1)+'</button>';}).join('')+'</div>';
  var rest=_REST?'<div class="wo-rest" role="timer"><div><b>Rest</b> <span id="woRestClock">'+_fmtClock((_REST.until-Date.now())/1000)+'</span></div>'+
    uiBtn('+30 s','workout.restAdd',null,'btn-sm btn-ghost')+uiBtn('Skip rest','workout.restSkip',null,'btn-sm btn-secondary')+'</div>':'';
  var rows=ex.sets.map(function(s,k){
    return '<div class="wo-set'+(s.done?' done':'')+'"><span class="wo-n">'+(k+1)+'</span>'+
      '<label class="wo-f"><span>lb</span>'+uiStepper('<input id="wo-l-'+k+'" type="number" inputmode="decimal" value="'+(s.load==null?'':s.load)+'" data-act="workout.field" data-arg="'+k+'|load" data-ev="input" aria-label="load for set '+(k+1)+'">','wo-l-'+k+'',(unitPref()==='metric'?2.5:5),0,null,1)+'</label>'+
      '<label class="wo-f"><span>reps</span>'+uiStepper('<input id="wo-r-'+k+'" type="number" inputmode="numeric" value="'+(s.reps==null?'':s.reps)+'" placeholder="'+ex.repLo+'\u2013'+ex.repHi+'" data-act="workout.field" data-arg="'+k+'|reps" data-ev="input" aria-label="reps for set '+(k+1)+'">','wo-r-'+k+'',1,0,100,0)+'</label>'+
      (/plank|hold|hang|carry|wall sit|l-sit|hollow|farmer|suitcase|dead bug/i.test(ex.name)?uiTimer('wo-t-'+k,{choices:[30,45,60,90],then:'timer.setSeconds|'+k})+(s.seconds?'<span class="hint">'+s.seconds+' s</span>':''):'')+
      '<label class="wo-f"><span>in reserve</span>'+uiStepper('<input id="wo-i-'+k+'" type="number" inputmode="numeric" value="'+(s.rir==null?'':s.rir)+'" placeholder="2" data-act="workout.field" data-arg="'+k+'|rir" data-ev="input" aria-label="reps in reserve for set '+(k+1)+'">','wo-i-'+k,1,0,5,0)+'</label>'+
      uiBtn(s.done?'\u2713':'Done','workout.setDone',String(k),'btn-sm '+(s.done?'btn-secondary':'btn-primary'))+'</div>';}).join('');
  var body='<div class="wo-head"><span>'+doneSets+' of '+total+' sets</span><span data-clock="wo">'+_fmtClock((Date.now()-W.startedAt)/1000)+' elapsed'+(W.variant!=='full'?' \u00b7 '+esc(PLAN_VARIANTS[W.variant].label.toLowerCase())+' version':'')+'</span></div>'+nav+rest+
    '<div class="wo-ex"><div class="wo-name">'+esc(ex.name)+(ex.swappedFrom?' <span class="hint">(instead of '+esc(ex.swappedFrom)+')</span>':(ex.usualFor?' <span class="hint">(your usual '+esc(ex.usualFor.toLowerCase())+')</span>':''))+'</div>'+
    '<div class="hint">'+ex.sets.length+' \u00d7 '+esc(String(ex.reps))+' reps \u00b7 '+esc(ex.why)+(ex.cue?' \u00b7 '+esc(ex.cue):'')+'</div>'+rows+
    '<div class="btn-row wrap">'+uiBtn('Add a set','workout.addSet',null,'btn-sm btn-ghost')+uiBtn('Swap exercise','workout.swap',null,'btn-sm btn-ghost')+'</div></div>';
  var last=W.current===W.exercises.length-1;
  return {body:body,foot:(W.current>0?uiBtn('Previous','workout.goto',String(W.current-1),'btn-secondary'):'')+
    (last?uiBtn('Finish workout','workout.finish',null,'btn-primary'):uiBtn('Next exercise','workout.goto',String(W.current+1),'btn-primary'))};
};
function _restTick(){
  if(!_REST)return;var left=(_REST.until-Date.now())/1000,el=document.getElementById('woRestClock');
  if(left<=0){_REST=null;try{if(navigator.vibrate)navigator.vibrate([200,100,200]);}catch(e){}if(_SHEET&&(_SHEET.opts||{}).form==='workout')renderSheet();return;}
  if(el)el.textContent=_fmtClock(left);
  _REST.timer=setTimeout(_restTick,500);
}
function _startRest(seconds){if(_REST&&_REST.timer)clearTimeout(_REST.timer);_REST={until:Date.now()+seconds*1000};_restTick();}
registerAction('workout.start',function(){openWorkout();});
registerAction('workout.field',function(arg,ev,el){if(!_WORKOUT||!el)return;var i=String(arg).split('|'),s=_WORKOUT.exercises[_WORKOUT.current].sets[+i[0]];
  if(!s)return;var v=el.value===''?null:+el.value;s[i[1]]=isNaN(v)?null:v;_saveDraft();});   /* no re-render while typing */
registerAction('workout.setDone',function(k){var ex=_WORKOUT.exercises[_WORKOUT.current],s=ex.sets[+k];if(!s)return;
  if(s.done){s.done=false;}else{if(s.reps==null){toast('Enter the reps first',{tone:'attention'});return;}s.done=true;
    var nx=ex.sets[+k+1];if(nx&&!nx.done){if(nx.load==null)nx.load=s.load;}
    var allDone=ex.sets.every(function(x){return x.done;});_startRest(allDone?Math.min(ex.rest,90):ex.rest);
    if(allDone&&_WORKOUT.current<_WORKOUT.exercises.length-1)toast('Exercise done \u2014 next: '+_WORKOUT.exercises[_WORKOUT.current+1].name);}
  _saveDraft();renderSheet();});
registerAction('workout.goto',function(i){var n=+i;if(!_WORKOUT||isNaN(n)||n<0||n>=_WORKOUT.exercises.length)return;_WORKOUT.current=n;_saveDraft();renderSheet();});
registerAction('workout.addSet',function(){var ex=_WORKOUT.exercises[_WORKOUT.current],l=ex.sets[ex.sets.length-1];ex.sets.push({load:l?l.load:null,reps:null,rir:null,done:false});_saveDraft();renderSheet();});
registerAction('workout.swap',function(){var ex=_WORKOUT.exercises[_WORKOUT.current],e=resolveExercise(ex.name);if(!e)return;
  var have=null;try{have=constraintModel().equipment;}catch(er){}
  var alts=EXERCISES.filter(function(x){return x.pattern===e.pattern&&x.id!==e.id&&(!have||!have.length||equipPossible(x.equipment,have));}).slice(0,8);
  if(!alts.length){toast('No other exercise of this movement fits your equipment');return;}
  _WORKOUT._swapFor=_WORKOUT.current;openSheet('edit',{form:'workoutSwap',title:'Swap '+ex.name,desc:'Same movement, different equipment or difficulty.',buf:{alts:alts.map(function(x){return x.id;})}});});
SHEETS.workoutSwap=function(b){return {body:(b.alts||[]).map(function(id){var x=EXERCISES.filter(function(e){return e.id===id;})[0];
    return '<button class="lib-row" data-act="workout.swapTo" data-arg="'+id+'"><span class="lib-name">'+esc(x.name)+'</span><span class="lib-meta">'+esc(x.equipment.join(', '))+'</span><span class="lib-level">'+esc(x.level)+'</span></button>';}).join(''),
  foot:uiBtn('Back to the workout','workout.resume',null,'btn-secondary')};};
registerAction('workout.swapTo',function(id){var x=EXERCISES.filter(function(e){return e.id===id;})[0],ex=_WORKOUT&&_WORKOUT.exercises[_WORKOUT._swapFor];
  if(x&&ex){ex.swappedFrom=ex.swappedFrom||ex.name;ex.name=x.name;var s=_suggestLoad(x.name);ex.why=s.why;ex.cue=x.cues&&x.cues[0]||'';ex.sets.forEach(function(st){if(!st.done)st.load=s.load;});}
  _saveDraft();openSheet('edit',{form:'workout',title:_WORKOUT.label,desc:'',buf:{}});});
registerAction('workout.resume',function(){if(!_WORKOUT)_WORKOUT=_loadDraft();if(_WORKOUT)openSheet('edit',{form:'workout',title:_WORKOUT.label,desc:'',buf:{}});});
registerAction('workout.restAdd',function(){if(_REST){_REST.until+=30000;_restTick();}});
registerAction('workout.restSkip',function(){if(_REST&&_REST.timer)clearTimeout(_REST.timer);_REST=null;renderSheet();});
registerAction('workout.finish',function(){
  var W=_WORKOUT;if(!W)return;
  var sets=[];W.exercises.forEach(function(x){x.sets.forEach(function(s){if(s.done)sets.push({exercise:x.name,load:s.load==null?0:s.load,reps:s.reps,rir:s.rir,kind:'working'});});});
  if(!sets.length){toast('No sets are marked done yet',{tone:'attention'});return;}
  var mins=Math.max(1,Math.round((Date.now()-W.startedAt)/60000));
  var wx=null;try{wx=weatherContextAt(new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16));}catch(e){}
  var rec=addSession({name:W.label,date:W.date,durationMin:mins,notes:W.variant!=='full'?(PLAN_VARIANTS[W.variant].label+' version'):'',sets:sets,source:'workout mode',context:wx?{weather:wx}:undefined});
  if(_REST&&_REST.timer)clearTimeout(_REST.timer);_REST=null;_clearDraft();_WORKOUT=null;
  _memoInvalidate();closeSheet();renderAll();toast('Workout saved \u00b7 '+sets.length+' sets in '+mins+' min',{undo:true});
  if(rec&&rec.id&&typeof openPostSession==='function')setTimeout(function(){openPostSession(rec.id);},250);
});


/* ============================================================================
   BARCODE SCANNING (H2). The bundled branded database already maps product barcodes to foods (lookupGtin), and typing
   a barcode into the search already worked; what was missing was the camera. Where the browser has a barcode detector
   (Chrome on Android, for example) the camera reads the code; where it has none (Safari on iPhone, currently), the
   sheet says so and takes the number typed in. A code not in the database is said to be not found, and the digits are
   kept for a custom food.
   ============================================================================ */
var _SCAN={stream:null,timer:null,detector:null,status:'idle',code:null};
function barcodeSupport(){return (typeof window!=='undefined'&&'BarcodeDetector' in window)&&!!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia);}
function _stopScan(){try{if(_SCAN.timer)clearTimeout(_SCAN.timer);if(_SCAN.stream)_SCAN.stream.getTracks().forEach(function(t){t.stop();});}catch(e){}_SCAN.stream=null;_SCAN.timer=null;}
function scanFound(code){
  _stopScan();_SCAN.code=code;_SCAN.status='looking up';renderSheet();
  /* Bundled database first; Open Food Facts only when it has no such barcode (integration spec \u00a721). */
  return lookupProductByBarcode(code).then(function(r){
    if(r&&r.status==='ok'){var f=r.food;_SCAN.status='found';closeSheet();openFoodAdd(_FOOD_DAY||todayISO(),f);
      toast('Found: '+f.name+(r.source==='open-food-facts'?' \u00b7 from Open Food Facts'+(f.provenance&&f.provenance.missing.length?(' (no '+f.provenance.missing.join(', ')+' listed)'):''):''));return f;}
    _SCAN.status='not found';_SCAN.offNote=r&&r.error&&r.error.category!=='unsupported_record'?r.error.text:null;renderSheet();return null;
  }).catch(function(e){_q(e,'P2');_SCAN.status='not found';renderSheet();return null;});
}
SHEETS.scan=function(){
  var sup=barcodeSupport(),st=_SCAN.status;
  var body=sup?('<div class="scan-box"><video id="scanVideo" playsinline muted></video><div class="scan-frame"></div></div>'+
      '<div class="hint">'+(st==='looking up'?'Looking up '+esc(_SCAN.code)+'\u2026':'Point the camera at the barcode.')+'</div>'):
    '<div class="hint">This browser cannot read barcodes with the camera (Safari on iPhone cannot yet). Type the number printed under the barcode instead.</div>';
  if(st==='not found')body+='<div class="banner attention"><span class="banner-text">'+esc(_SCAN.code)+' is not in the bundled database'+(_SCAN.offNote?(' (Open Food Facts could not be checked: '+esc(_SCAN.offNote)+')'):' or on Open Food Facts')+'.</span>'+uiBtn('Add it as your own food','scan.custom',_SCAN.code,'btn-sm btn-secondary')+'</div>';
  body+='<label class="fld"><span>Barcode number</span><input id="scanManual" type="text" inputmode="numeric" autocomplete="off" placeholder="e.g. 0049000000443" data-act="scan.typed" data-ev="input"></label>'+uiBtn('Look it up','scan.lookup',null,'btn-sm btn-primary');
  return {body:body,foot:'<button class="btn btn-secondary" data-act="scan.close">Close</button>'};
};
function _startCamera(){
  if(!barcodeSupport())return;
  try{_SCAN.detector=new BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e']});}catch(e){try{_SCAN.detector=new BarcodeDetector();}catch(e2){_SCAN.detector=null;return;}}
  navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'},audio:false}).then(function(stream){
    _SCAN.stream=stream;var v=document.getElementById('scanVideo');if(!v){_stopScan();return;}v.srcObject=stream;try{v.play();}catch(e){}
    var tick=function(){if(!_SCAN.stream)return;_SCAN.detector.detect(v).then(function(codes){
        var c=codes&&codes[0]&&codes[0].rawValue;if(c&&/^\d{6,14}$/.test(c))scanFound(c);else _SCAN.timer=setTimeout(tick,250);})
      .catch(function(){_SCAN.timer=setTimeout(tick,400);});};
    tick();
  }).catch(function(e){_SCAN.status='no camera';renderSheet();toast('The camera could not be opened: '+(e&&e.name||'permission denied'),{tone:'attention'});});
}
registerAction('food.scan',function(){_SCAN.status='idle';_SCAN.code=null;openSheet('edit',{form:'scan',title:'Scan a barcode',desc:'',buf:{}});setTimeout(_startCamera,60);});
registerAction('scan.typed',function(a,ev,el){_SCAN.typed=el?el.value.replace(/\D/g,''):'';});
registerAction('scan.lookup',function(){var c=(_SCAN.typed||'').replace(/\D/g,'');if(c.length<6){toast('Enter the digits printed under the barcode',{tone:'attention'});return;}scanFound(c);});
registerAction('scan.close',function(){_stopScan();closeSheet();});
/* Named scan.custom: registered as food.custom it silently replaced the existing custom-food action everywhere. */
registerAction('scan.custom',function(code){_stopScan();closeSheet();dispatchAct('food.custom');
  if(_SHEET&&_SHEET.buf){_SHEET.buf.gtin=String(code||'');_SHEET.buf.brand=_SHEET.buf.brand||'';renderSheet();}
  toast('Barcode '+code+' kept \u2014 add the values from the label');});
/* The chart catalogue's action lives here, after the action registry: registered in 89-render-complete it threw at
   load and nothing after it loaded (the same trap the workout module first fell into). */
registerAction('nav.charts',function(){openSheet('edit',{form:'chartGallery',title:'Chart catalogue',desc:'',buf:{}});});
/* ---- weather actions (the integration layer is called here, never from presentation) ---- */
function openWeather(){openSheet('edit',{form:'weather',title:'Weather',desc:'',buf:{q:''}});}
registerAction('weather.open',function(){openWeather();});
registerAction('weather.q',function(a,ev,el){if(_SHEET&&_SHEET.buf)_SHEET.buf.q=el?el.value:'';});
registerAction('weather.search',function(){var q=(_SHEET.buf.q||'').trim();if(q.length<2){toast('Type at least two letters of a place');return;}
  searchPlaces(q).then(function(r){if(r.status!=='ok'){_SHEET.buf.searchError=r.error.text;_SHEET.buf.searchDetail=r.error.category+(r.error.stage?' at the '+r.error.stage+' stage':'')+': '+r.error.detail;_SHEET.buf.places=null;}
    else{_SHEET.buf.places=r.places;_SHEET.buf.searchError=r.places.length?null:'No places found';_SHEET.buf.searchDetail=null;}renderSheet();});});
registerAction('weather.pick',function(i){var p=(_SHEET.buf.places||[])[+i];if(!p)return;setWeatherLocation(p);_SHEET.buf.places=null;renderSheet();toast('Weather place set to '+p.label);dispatchAct('weather.refresh');});
registerAction('weather.refresh',function(){toast('Fetching the weather\u2026');refreshEnvironment().then(function(r){renderAll();if(_SHEET&&_SHEET.opts&&_SHEET.opts.form==='weather')renderSheet();
  toast(r.status==='ok'?'Weather updated':((r.error&&r.error.text)||'The weather could not be fetched'),r.status==='ok'?null:{tone:'attention'});});});
registerAction('weather.history',function(){var end=addDays(todayISO(),-6),start=addDays(end,-29);   /* reanalysis lags about five days */
  fetchHistoricalWeather(start,end).then(function(r){renderAll();if(_SHEET&&_SHEET.opts&&_SHEET.opts.form==='weather')renderSheet();toast(r.status==='ok'?'History loaded: '+shortDate(start)+' \u2013 '+shortDate(end):((r.error&&r.error.text)||'History could not be fetched'),r.status==='ok'?null:{tone:'attention'});});});
SHEETS.weather=function(b){
  var L=weatherLocation(),D=environmentDaily(),T=todayISO(),out='';
  out+='<div class="card-title">Place</div>'+(L?uiRow(esc(L.label||'set'),L.lat+', '+L.lon,{sub:'rounded to about 1 km before it leaves this device; the app never reads your device location'}):'<div class="hint">No place set. Weather needs one, and it is never guessed.</div>')+
    '<label class="fld"><span>Search for a place</span><input id="wxPlace" type="text" autocomplete="off" value="'+attrEsc(b.q||'')+'" data-act="weather.q" data-ev="input" placeholder="e.g. Leeds"></label>'+uiMicBtn('wxPlace')+uiBtn('Search','weather.search',null,'btn-sm btn-secondary')+
    (b.places?b.places.map(function(p,i){return '<button class="lib-row" data-act="weather.pick" data-arg="'+i+'"><span class="lib-name">'+esc(p.label)+'</span><span class="lib-meta">'+round(p.lat,2)+', '+round(p.lon,2)+'</span></button>';}).join(''):'')+
    (b.searchError?'<div class="banner attention"><span class="banner-text">'+esc(b.searchError)+'</span>'+uiBtn('Check the connection','diag.server',null,'btn-sm btn-secondary')+'</div>'+
      (b.searchDetail?'<div class="hint">'+esc(b.searchDetail)+'</div>':''):'')+
    (b.diag?renderServerDiagnosis(b.diag):'');
  if(!L)return {body:out,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};
  var N=environmentNow();
  if(N.status==='ok'){out+='<div class="card-title" style="margin-top:12px">Now</div>'+['temperature','apparentTemperature','humidity','vpd','precipitation','cloudCover','windSpeed','windDirection','windGusts','uvIndex','isDay'].map(function(k){
      return uiRow(esc(ENV_VARIABLES[k].label),fmtEnv(k,N.values[k]),N.derived.indexOf(k)>=0?{sub:'derived'}:null);}).join('');
    var aqk=['usAqi','europeanAqi','pm2_5','pm10','ozone','no2','so2','co'].filter(function(k){return N.values[k]!=null;});
    if(aqk.length)out+='<div class="card-title" style="margin-top:12px">Air quality</div>'+aqk.map(function(k){return uiRow(esc(ENV_VARIABLES[k].label),fmtEnv(k,N.values[k]));}).join('')+
      '<div class="hint">Environmental measurements, not a medical assessment. Each AQI is on its own scale.</div>';
    var H=environmentHourly(T).filter(function(h){return h.kind!=='recent past';}).slice(0,12);
    if(H.length)out+='<div class="card-title" style="margin-top:12px">Rest of today</div><div class="table-wrap"><table class="data"><thead><tr><th>time</th><th></th><th>temp</th><th>feels</th><th>rain</th><th>wind</th><th>UV</th></tr></thead><tbody>'+
      H.map(function(h){var cd=weatherCondition(h.values,h.values.isDay);return '<tr><td>'+esc(h.time.slice(11))+'</td><td>'+weatherIcon(h.values,h.values.isDay,18)+(cd?' '+esc(cd.label):'')+'</td><td>'+fmtEnv('temperature',h.values.temperature)+'</td><td>'+fmtEnv('apparentTemperature',h.values.apparentTemperature)+'</td><td>'+fmtEnv('precipitationProbability',h.values.precipitationProbability)+'</td><td>'+fmtEnv('windSpeed',h.values.windSpeed)+'</td><td>'+fmtEnv('uvIndex',h.values.uvIndex)+'</td></tr>';}).join('')+'</tbody></table></div>';}
  if(D.status==='ok'){out+='<div class="card-title" style="margin-top:12px">Day by day</div><div class="table-wrap"><table class="data"><thead><tr><th>day</th><th>kind</th><th></th><th>low\u2013high</th><th>feels</th><th>rain</th><th>ET\u2080</th><th>UV</th><th>wind / gust</th><th>sun</th></tr></thead><tbody>'+
    D.days.map(function(d){var x=d.values;return '<tr'+(d.date===T?' class="wx-today"':'')+'><td>'+esc(shortDate(d.date))+'</td><td>'+esc(d.kind==='recent past'?'past':(d.kind==='historical'?'history':'forecast'))+'</td><td>'+weatherIcon(x,true,18)+'</td><td>'+fmtEnv('temperatureMin',x.temperatureMin)+'\u2013'+fmtEnv('temperatureMax',x.temperatureMax)+'</td>'+
      '<td>'+fmtEnv('apparentTemperatureMin',x.apparentTemperatureMin)+'\u2013'+fmtEnv('apparentTemperatureMax',x.apparentTemperatureMax)+'</td><td>'+fmtEnv('precipitationSum',x.precipitationSum)+(x.precipitationProbabilityMax!=null?' ('+Math.round(x.precipitationProbabilityMax)+'%)':'')+'</td>'+
      '<td>'+fmtEnv('et0Sum',x.et0Sum)+'</td><td>'+fmtEnv('uvIndexMax',x.uvIndexMax)+'</td><td>'+fmtEnv('windSpeedMax',x.windSpeedMax)+' / '+fmtEnv('windGustsMax',x.windGustsMax)+'</td><td>'+esc((x.sunrise||'')+'\u2013'+(x.sunset||''))+(x.daylightHours!=null?' \u00b7 '+fmtEnv('daylightHours',x.daylightHours):'')+'</td></tr>';}).join('')+'</tbody></table></div>';}
  out+='<div class="btn-row">'+uiBtn('Refresh','weather.refresh',null,'btn-sm btn-primary')+uiBtn('Load the last 30 days of history','weather.history',null,'btn-sm btn-secondary')+'</div>'+
    uiRow('Update automatically',weatherAutoEnabled()?'on':'off',{sub:'when the app opens or comes back, and every 30 minutes while open'})+'<div class="btn-row">'+uiBtn(weatherAutoEnabled()?'Turn off':'Turn on','weather.auto',null,'btn-sm btn-ghost')+'</div>';
  var ws=DB.settings.weatherSync||{};
  out+='<div class="card-title" style="margin-top:12px">Where this comes from</div>'+(N.status==='ok'?uiRow('Source',esc(EXTERNAL_SOURCES[N.source].name),{sub:'retrieved '+esc(String(N.retrievedAt).replace('T',' ').slice(0,16))+' UTC'+(ws.state?' \u00b7 last refresh '+esc(ws.state):'')}):'')+
    '<div class="hint">'+Object.keys(ENV_KIND_TEXT).map(function(k){return '<b>'+esc(k)+'</b>: '+esc(ENV_KIND_TEXT[k]);}).join(' \u00b7 ')+'</div>'+
    (N.status==='ok'&&N.unsupported.length?'<div class="hint">Not supplied by this source: '+esc(N.unsupported.map(function(k){return (ENV_VARIABLES[k]||{}).label||k;}).join(', '))+'.</div>':'')+
    (ws.error?'<div class="hint">Last problem: '+esc(ws.error.text||ws.error.category)+' ('+esc(ws.error.category)+(ws.error.stage?', '+esc(ws.error.stage):'')+(ws.error.detail?': '+esc(ws.error.detail):'')+')</div>'+uiBtn('Check the connection','diag.server',null,'btn-sm btn-ghost'):'')+
    '<div class="hint">'+esc((EXTERNAL_SOURCES['open-meteo']||{}).terms||'')+'</div>';
  return {body:out,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};
};

/* ---- SCHEDULE: weekly, rotating shifts, or irregular (usage review) ---- */
function openSchedule(){openSheet('edit',{form:'schedule',title:'Your schedule',desc:'',buf:{}});}
SHEETS.schedule=function(){
  var M=scheduleModel(),chip=function(label,act,arg,on){return uiBtn(label,act,arg,'btn-sm '+(on?'btn-primary':'btn-ghost'));};
  var out='<div class="card-title">My week</div><div class="btn-row wrap">'+chip('Same days each week','sched.mode','weekly',M.mode==='weekly')+chip('Rotating shifts','sched.mode','rotation',M.mode==='rotation')+chip('It changes','sched.mode','irregular',M.mode==='irregular')+'</div>';
  if(M.mode==='weekly'){out+='<div class="card-title" style="margin-top:10px">Days you can train</div><div class="btn-row wrap">'+['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(function(d){return chip(d,'sched.weekday',d,M.weekdays.indexOf(d)>=0);}).join('')+'</div>';}
  if(M.mode==='rotation'){
    out+='<div class="card-title" style="margin-top:10px">Rotation</div>'+Object.keys(ROTATION_PRESETS).map(function(k){var r=ROTATION_PRESETS[k];
      return '<button class="lib-row'+(M.preset===k?' on':'')+'" data-act="sched.preset" data-arg="'+k+'"><span class="lib-name">'+esc(r.label)+'</span><span class="lib-meta">'+esc(r.note||(r.pattern?r.pattern.length+'-day cycle':'tap each day below'))+'</span></button>';}).join('');
    var pat=M.pattern||'';
    out+='<div class="card-title" style="margin-top:10px">The cycle'+(pat?' ('+pat.length+' days)':'')+'</div><div class="hint">Tap a day to change it: D day shift, N night shift, O off, E evening shift.</div><div class="sched-pattern">'+
      pat.split('').map(function(c,i){return '<button class="pat-day sh-'+c+'" data-act="sched.cycleDay" data-arg="'+i+'" aria-label="day '+(i+1)+': '+attrEsc(SHIFT_LABELS[c])+'">'+c+'</button>';}).join('')+'</div>'+
      '<div class="hint" style="margin-top:6px">Training on each day of the cycle (tap to change): auto lets the app place sessions; train or rest is your choice every cycle.</div><div class="sched-pattern">'+
      pat.split('').map(function(c,i){var ch=M.cycleTrain[i]||'auto';return '<button class="pat-day ch-'+ch+'" data-act="sched.cycleTrain" data-arg="'+i+'" aria-label="day '+(i+1)+' training: '+ch+'">'+{auto:'\u00b7',train:'T',rest:'R'}[ch]+'</button>';}).join('')+'</div>'+
      '<div class="btn-row">'+uiBtn('Add a day','sched.addDay',null,'btn-sm btn-ghost')+(pat.length>1?uiBtn('Remove the last day','sched.removeDay',null,'btn-sm btn-ghost'):'')+'</div>'+
      '<label class="fld"><span>The first day of the cycle was</span><input id="schedAnchor" type="date" value="'+attrEsc(M.anchor||'')+'" data-act="sched.anchor" data-ev="change"></label>'+
      '<div class="card-title" style="margin-top:10px">What each shift leaves time for</div>'+['D','N','E','O'].map(function(k){return '<div class="sched-rule"><span>'+esc(SHIFT_LABELS[k])+'</span><div class="btn-row wrap">'+
        SHIFT_RULE_OPTIONS.map(function(o){return chip(o[1],'sched.rule',k+'|'+o[0],M.rules[k]===o[0]);}).join('')+'</div></div>';}).join('')+
      '<div class="card-title" style="margin-top:10px">How long sessions are</div><div class="hint">Two settings: a short session fits around a shift; a full session is for a day with time.</div>'+
      '<div class="sched-rule"><span>A short session lasts</span><div class="btn-row wrap">'+[20,30,45].map(function(m){return chip(m+' min','sched.minutes','short|'+m,M.minutes.short===m);}).join('')+'</div></div>'+
      '<div class="sched-rule"><span>A full session lasts</span><div class="btn-row wrap">'+[45,60,75,90].map(function(m){return chip(m+' min','sched.minutes','full|'+m,M.minutes.full===m);}).join('')+'</div></div>'+
      '<div class="btn-row">'+chip(M.protectAfterNights?'The first day off after nights is kept for sleep':'Sessions can fall the day after nights','sched.protect',null,M.protectAfterNights)+'</div>';}
  if(M.mode==='irregular'){out+='<div class="card-title" style="margin-top:10px">The next 14 days</div><div class="hint">Tap how much time you have each day.</div>'+
    Array.apply(null,{length:14}).map(function(_,i){var d=addDays(todayISO(),i),v=M.available[d]||0;return '<div class="sched-rule"><span>'+esc(dowShort(d)+' '+shortDate(d))+'</span><div class="btn-row wrap">'+
      [0,30,45,60,90].map(function(m){return chip(m?m+' min':'none','sched.avail',d+'|'+m,v===m);}).join('')+'</div></div>';}).join('');}
  out+='<div class="card-title" style="margin-top:12px">Choose any day</div><div class="hint">Tap to cycle: auto \u2192 train \u2192 short \u2192 rest. Your choice beats the automatic placement.</div><div class="sched-choose">'+
    Array.apply(null,{length:14}).map(function(_,i){var d=addDays(todayISO(),i),ch=M.overrides[d]||'auto',pl=null;try{pl=scheduledPlan(d,trainingProgram());}catch(e){}
      return '<button class="pw-day ch-'+ch+(pl?'':' rest')+'" data-act="sched.override" data-arg="'+d+'" aria-label="'+attrEsc(dowShort(d)+' '+shortDate(d)+': '+ch)+'"><b>'+esc(dowShort(d))+' '+esc(d.slice(8))+'</b><span>'+esc(pl?(pl.kind==='lift'?pl.label:'short'):'rest')+'</span><span class="hint">'+(ch==='auto'?'auto':'your choice')+'</span></button>';}).join('')+'</div>';
  out+='<div class="card-title" style="margin-top:12px">Your sessions</div><div class="hint">'+esc(_liftSequence(trainingProgram()).map(function(x){return x.label;}).join(' \u2192 ')||'no sessions yet')+', in this order on your training days.</div><div class="btn-row">'+uiBtn('Edit sessions and exercises','nav.planEdit',null,'btn-sm btn-secondary')+'</div>';
  var A=scheduleAudit();
  out+='<div class="card-title" style="margin-top:12px">Your next 14 days</div>'+(A.ok?'<div class="sched-strip">'+scheduleAhead(14).map(function(x){return '<div class="pw-day'+(x.planned?'':' rest')+'" title="'+attrEsc(x.why)+'"><b>'+esc(dowShort(x.date))+' '+esc(x.date.slice(8))+'</b>'+(x.shift?'<span class="sh sh-'+x.shift+'">'+esc(x.shift)+'</span>':'')+'<span>'+esc(x.planned||'rest')+'</span></div>';}).join('')+'</div>':
    '<div class="hint">'+esc(A.issues.join('; '))+'.</div>');
  return {body:out,foot:'<button class="btn btn-primary" data-act="edit.close">Done</button>'};
};
var _sched=function(o){changePlan({kind:'schedule',source:'your edit',reason:'You changed your schedule',expected:'as you set',apply:function(){return setSchedule(o);}});renderSheet();renderAll();};
registerAction('nav.schedule',function(){openSchedule();});
registerAction('sched.mode',function(m){var o={mode:m};if(m==='rotation'&&!(DB.settings.schedule||{}).pattern){o.preset='pitman-dn';o.anchor=todayISO();}_sched(o);});
registerAction('sched.weekday',function(d){var t=(DB.settings.trainingDays||[]).slice(),i=t.indexOf(d);if(i>=0)t.splice(i,1);else t.push(d);
  DB.settings.trainingDays=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].filter(function(x){return t.indexOf(x)>=0;});_sched({});});
registerAction('sched.preset',function(k){var o={preset:k};if(k==='custom'&&!(DB.settings.schedule||{}).pattern)o.pattern='DDOO';if(!(DB.settings.schedule||{}).anchor)o.anchor=todayISO();_sched(o);});
registerAction('sched.cycleDay',function(i){var p=(scheduleModel().pattern||'').split(''),seq=['D','N','O','E'];i=+i;if(p[i]==null)return;p[i]=seq[(seq.indexOf(p[i])+1)%seq.length];_sched({pattern:p.join(''),preset:'custom'});});
registerAction('sched.addDay',function(){_sched({pattern:(scheduleModel().pattern||'')+'O',preset:'custom'});});
registerAction('sched.removeDay',function(){var p=scheduleModel().pattern||'';_sched({pattern:p.slice(0,-1),preset:'custom'});});
registerAction('sched.anchor',function(a,ev,el){if(el&&isValidISO(el.value))_sched({anchor:el.value});});
registerAction('sched.rule',function(arg){var q=String(arg).split('|'),r={};r[q[0]]=q[1];_sched({rules:r});});
registerAction('sched.minutes',function(arg){var q=String(arg).split('|'),m={};m[q[0]]=+q[1];_sched({minutes:m});});
registerAction('sched.protect',function(){_sched({protectAfterNights:!scheduleModel().protectAfterNights});});
registerAction('sched.avail',function(arg){var q=String(arg).split('|'),a={};a[q[0]]=+q[1];_sched({available:a});});
/* ---- server diagnostics (deployment repair plan \u00a710, \u00a711) ---- */
function renderServerDiagnosis(d){
  if(d==='running')return '<div class="hint">Checking the server\u2026</div>';
  return '<div class="card-title" style="margin-top:10px">Connection check</div>'+d.steps.map(function(x){return uiRow(esc(x.step),x.ok?'ok':'failed',{sub:esc(x.detail||''),tone:x.ok?'good':'attention'});}).join('')+
    '<div class="banner '+(d.code==='OK'?'neutral':'attention')+'"><span class="banner-text">'+esc(d.verdict)+'</span></div>';
}
registerAction('diag.server',function(){var target=_SHEET&&_SHEET.buf?_SHEET.buf:null;if(target){target.diag='running';renderSheet();}
  testExternalServer({probeProvider:true}).then(function(d){DB.settings.lastServerCheck={code:d.code,verdict:d.verdict,at:d.at,steps:d.steps};save('settings');
    if(target&&_SHEET&&_SHEET.buf===target){target.diag=d;renderSheet();}renderAll();toast(d.code==='OK'?'The server works':'Server check: '+d.verdict.slice(0,90),d.code==='OK'?null:{tone:'attention',ms:8000});});});
/* ---- physiology models on screen ---- */
function physiologySummary(){var F=cardioFitnessModel(),H=hydrationBalance(),E=energyAvailability(),D=dietDigestibility(),L=null,sp=supplementEfficacy();
  var lift=((DB.sessions||[]).filter(function(s){return (s.sets||[]).length;}).slice(-1)[0]||{sets:[]}).sets[0];if(lift)L=exerciseLearningCurve(lift.exercise);
  return [
    {icon:'heart',label:'Aerobic fitness',r:F,v:F.status==='ok'?F.headline.estimate+' ml/kg/min':null,sub:F.status==='ok'?('80% range '+F.headline.ci80.join('\u2013')+' \u00b7 '+F.headline.family+' \u00b7 '+F.headline.n+' sessions \u00b7 '+F.headline.backtest.verdict):(F.need||[]).join('; ')},
    {icon:'drop',label:'Hydration today',r:H,v:H.status==='ok'?(H.balanceL>0?'+':'')+H.balanceL+' L':null,sub:H.status==='ok'?(H.verdict+' \u00b7 \u00b1'+H.sd+' L'):(H.need||[]).join('; ')},
    {icon:'bolt',label:'Energy availability',r:E,v:E.status==='ok'?E.ea+' kcal/kg FFM':null,sub:E.status==='ok'?(E.band+' \u00b7 \u00b1'+E.sd+' \u00b7 not a diagnosis'):(E.need||[]).join('; ')},
    {icon:'fork',label:'Protein quality today',r:D,v:D.status==='ok'?D.digestibleProteinG+' g digestible':null,sub:D.status==='ok'?('of '+D.proteinG+' g \u00b7 quality '+D.proteinQuality+(D.unclassifiedFoods?' \u00b7 '+D.unclassifiedFoods+' foods unclassified':'')):(D.need||[]).join('; ')},
    {icon:'brain',label:'Learning'+(L&&L.exercise?' ('+L.exercise+')':''),r:L||{status:'insufficient'},v:L&&L.status==='ok'?L.stage:null,sub:L&&L.status==='ok'?('recent gain '+L.recentGain+'% \u00b7 '+L.sessions+' sessions'):(L&&L.need||['lifting sessions']).join('; ')},
    {icon:'pill',label:'Supplements',r:sp,v:sp.status==='ok'?sp.supplements.filter(function(x){return x.status==='ok';}).length+' tested':null,sub:sp.status==='ok'?sp.supplements.map(function(x){return x.name+': '+(x.verdict||x.status);}).join(' \u00b7 '):(sp.need||[]).join('; ')}];}
function physiologyRows(){return physiologySummary().map(function(x){return '<div class="feat">'+uiIcon(x.icon,{size:22})+'<div class="feat-body"><b>'+esc(x.label)+'</b> '+(x.v?'<span class="num">'+esc(x.v)+'</span> '+uiPill(x.r.cls||'HEURISTIC'):uiPill('needs data','neutral'))+'<div class="hint">'+esc(x.sub||'')+'</div></div></div>';}).join('');}
registerAction('physio.open',function(){openSheet('edit',{form:'physio',title:'Physiology models',desc:'',buf:{}});});
SHEETS.physio=function(){var S=physiologySummary();return {body:S.map(function(x){var r=x.r||{};return '<div class="card-title" style="margin-top:10px">'+uiIcon(x.icon,{size:18})+' '+esc(x.label)+'</div>'+
  (x.v?uiRow('Result',esc(x.v),{sub:esc(x.sub||'')}):'<div class="hint">Needs: '+esc(x.sub||'more data')+'</div>')+(r.method?uiRow('Method',esc(r.method)):'')+(r.limits?'<div class="hint">'+esc(r.limits)+'</div>':'')+(r.wouldChange?'<div class="hint">'+esc(r.wouldChange)+'</div>':'')+
  (x.icon==='heart'&&r.excluded&&r.excluded.length?'<div class="hint">Not used: '+esc(r.excluded.slice(-3).map(function(e){return e.date+' '+e.modality+' ('+e.why+')';}).join('; '))+'</div>':'');}).join('')+
  '<div class="hint" style="margin-top:12px">Visual progress: photos are compared only when view, lighting and time of day match. No body-fat or shape estimate is made from images \u2014 no validated model runs within this app\u2019s privacy design, where images never leave the device.</div>',
  foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
/* ---- SUPPLEMENTS AND VITAMINS on screen ---- */
var GRADE_TEXT={A:'strong',B:'moderate',C:'limited',D:'insufficient'};
function _covBars(cov,keys){return '<div class="cov">'+cov.rows.filter(function(r){return (!keys||keys.indexOf(r.key)>=0)&&(r.judged||r.fromSupplements>0);}).map(function(r){
  var pct=Math.max(0,Math.min(160,r.pct||0)),ulPct=r.ul&&r.target?Math.min(160,Math.round(100*r.ul/r.target)):null;
  return '<div class="cov-row" title="'+attrEsc(r.label+': '+r.avg+' '+r.unit+' a day, '+r.kind+' '+r.target+(r.ul?(', upper limit '+r.ul+' ('+r.ulScope+')'):''))+'"><span class="cov-l">'+esc(r.label)+'</span><span class="cov-bar"><span class="cov-fill'+(r.overUL?' over':(r.pct<67?' low':''))+'" style="width:'+(pct/1.6)+'%"></span><span class="cov-ref" style="left:'+(100/1.6)+'%"></span>'+(ulPct?'<span class="cov-ul" style="left:'+(ulPct/1.6)+'%"></span>':'')+'</span><span class="cov-v">'+(r.pct!=null?r.pct+'%':'\u2014')+'</span></div>';}).join('')+'</div>';}
function supplementsCard(){
  var A=supplementAdherence(14),cov=micronutrientCoverage(7),slot=supplementSlot(),due=supplementsDue(todayISO(),slot),rows='';
  if(A.status==='ok')rows=A.rows.map(function(r){var st=supplementStack().filter(function(x){return x.id===r.id;})[0]||{};
    return '<div class="feat">'+uiIcon('pill',{size:20})+'<div class="feat-body"><b>'+esc(r.label)+'</b> <span class="num">'+esc(r.dose+' '+r.unit)+'</span> <span class="hint">'+esc(SUPP_TIMINGS[st.timing||'any'])+'</span>'+
      '<div class="hint">'+(r.pct!=null?r.pct+'% of due days in 2 weeks ('+r.taken+' of '+r.due+')':'')+'</div></div>'+
      '<button class="chip'+(r.today?' active':'')+'" data-act="supp.toggle" data-arg="'+attrEsc(r.id)+'" aria-pressed="'+(!!r.today)+'">'+(r.today?'taken':'tap to log')+'</button></div>';}).join('');
  var body=(rows||'<div class="hint">No regimen yet. Add what you take, and the app tracks it and counts its vitamins and minerals with your food.</div>')+
    '<div class="btn-row">'+(due.length?uiBtn('Log '+slot+' supplements ('+due.length+')','supp.logStack',slot,'btn-sm btn-primary'):'')+uiBtn(A.status==='ok'?'Regimen and vitamins':'Set up','supp.open',null,'btn-sm btn-secondary')+'</div>';
  if(cov.status==='ok')body+='<div class="card-title" style="margin-top:8px">Vitamins and minerals, last '+cov.days+' days</div>'+_covBars(cov,['vitd','vitc','vitb12','folate','calcium','iron','magnesium','zinc','potassium'])+'<div class="hint">'+esc(cov.verdict)+'</div>';
  return uiCard({title:'Supplements and vitamins',sub:A.status==='ok'?(A.rows.filter(function(r){return r.today;}).length+' of '+A.rows.length+' taken today'):'not set up',body:body});}
registerAction('supp.logStack',function(slot){var r=logSupplementStack(todayISO(),{slot:slot||supplementSlot()});renderAll();toast(r.logged?('Logged '+r.logged+' supplement'+(r.logged===1?'':'s')):'Nothing due now',{undo:!!r.logged});});
registerAction('supp.toggle',function(id){var r=toggleSupplementToday(id);renderAll();if(_SHEET&&_SHEET.opts&&_SHEET.opts.form==='supplements')renderSheet();toast((SUPPLEMENT_CATALOGUE[id]||{label:id}).label+(r.taken?' logged':' removed for today'),{undo:true});});
registerAction('supp.timing',function(arg){var q=String(arg).split('|');setSupplementStack(supplementStack().map(function(s){if(s.id===q[0])s.timing=q[1];return s;}));renderSheet();renderAll();});
registerAction('supp.customOpen',function(){if(_SHEET&&_SHEET.buf){_SHEET.buf.custom={label:'',per:{}};renderSheet();}});
registerAction('supp.customField',function(arg,ev,el){var b=_SHEET&&_SHEET.buf;if(!b||!b.custom||!el)return;if(arg==='label')b.custom.label=el.value;else b.custom.per[arg]=el.value;});
registerAction('supp.customSave',function(){var b=_SHEET.buf,r=saveCustomSupplement(b.custom);if(r.status!=='ok'){toast(r.note);return;}var S=supplementStack().slice();if(!S.some(function(x){return x.id===r.id;}))S.push({id:r.id,when:'daily',timing:'morning'});
  setSupplementStack(S);b.custom=null;renderSheet();renderAll();toast('Saved your product with '+r.nutrients+' nutrient'+(r.nutrients===1?'':'s')+' from its label');});
var LABEL_NUTRIENTS=['vita','vitc','vitd','vite','vitk','thiamin','riboflavin','niacin','vitb6','folate','vitb12','biotin','pantothenic','calcium','iron','iodine','magnesium','zinc','selenium','copper','manganese','chromium','molybdenum','potassium','choline'];
function _customProductForm(c){return '<div class="card-title" style="margin-top:12px">Your product, from its label</div><div class="hint">Amounts per serving, in the units shown. Leave blank what the label does not list.</div>'+
  '<label class="fld"><span>Name</span><input value="'+attrEsc(c.label||'')+'" data-act="supp.customField" data-arg="label" data-ev="input" placeholder="e.g. Brand X Men\u2019s Multi"></label><div class="form-trio">'+
  LABEL_NUTRIENTS.map(function(k){var m=MICRONUTRIENTS[k];return '<label class="fld"><span>'+esc(m.label)+' ('+esc(m.unit)+')</span><input inputmode="decimal" value="'+attrEsc(c.per[k]||'')+'" data-act="supp.customField" data-arg="'+k+'" data-ev="input"></label>';}).join('')+
  '</div><div class="btn-row">'+uiBtn('Save product','supp.customSave',null,'btn-sm btn-primary')+'</div>';}
registerAction('supp.open',function(){openSheet('edit',{form:'supplements',title:'Supplements and vitamins',desc:'',buf:{q:''}});});
registerAction('supp.q',function(a,ev,el){if(_SHEET&&_SHEET.buf)_SHEET.buf.q=el?el.value:'';renderSheet();});
registerAction('supp.add',function(id){var S=supplementStack().slice();if(!S.some(function(s){return s.id===id;}))S.push({id:id,when:'daily'});setSupplementStack(S);renderSheet();renderAll();toast(SUPPLEMENT_CATALOGUE[id].label+' added to your regimen');});
registerAction('supp.remove',function(id){setSupplementStack(supplementStack().filter(function(s){return s.id!==id;}));renderSheet();renderAll();});
registerAction('supp.dose',function(arg,ev,el){var q=String(arg);var S=supplementStack().map(function(s){if(s.id===q&&el&&el.value!==''&&isFinite(+el.value))s.dose=+el.value;return s;});setSupplementStack(S);renderAll();});
registerAction('supp.when',function(arg){var q=String(arg).split('|');setSupplementStack(supplementStack().map(function(s){if(s.id===q[0])s.when=q[1];return s;}));renderSheet();renderAll();});
SHEETS.supplements=function(b){
  var S=supplementStack(),cov=micronutrientCoverage(7),adv=supplementAdvice(),eff=supplementEfficacy(),out='<div class="card-title">Your regimen</div>';
  out+=S.length?S.map(function(s){var c=SUPPLEMENT_CATALOGUE[s.id];return '<div class="feat">'+uiIcon('pill',{size:20})+'<div class="feat-body"><b>'+esc(c.label)+'</b>'+
    '<label class="fld"><span>Dose ('+esc(c.unit)+'; usual '+c.dose[0]+'\u2013'+c.dose[1]+')</span><input inputmode="decimal" value="'+attrEsc(s.dose)+'" data-act="supp.dose" data-arg="'+attrEsc(s.id)+'" data-ev="change"></label>'+
    '<div class="btn-row">'+['daily','training days'].map(function(w){return uiBtn(w,'supp.when',s.id+'|'+w,'btn-sm '+(s.when===w?'btn-primary':'btn-ghost'));}).join('')+uiBtn('Remove','supp.remove',s.id,'btn-sm btn-ghost')+'</div>'+
    '<div class="btn-row wrap">'+Object.keys(SUPP_TIMINGS).map(function(t){return uiBtn(SUPP_TIMINGS[t],'supp.timing',s.id+'|'+t,'btn-sm '+((s.timing||'any')===t?'btn-primary':'btn-ghost'));}).join('')+'</div></div></div>';}).join(''):'<div class="hint">Nothing yet. Add from the list below.</div>';
  out+=b.custom?_customProductForm(b.custom):'<div class="btn-row" style="margin-top:8px">'+uiBtn('Add your own product from its label','supp.customOpen',null,'btn-sm btn-secondary')+'</div>';
  var q=String(b.q||'').toLowerCase();
  out+='<div class="card-title" style="margin-top:12px">Add a supplement <span class="hint">('+Object.keys(SUPPLEMENT_CATALOGUE).length+' in the catalogue)</span></div><label class="fld"><span>Search</span><input id="suppQ" value="'+attrEsc(b.q||'')+'" data-act="supp.q" data-ev="input" placeholder="creatine, vitamin D, magnesium\u2026"></label>'+
    Object.keys(SUPPLEMENT_CATALOGUE).filter(function(id){var c=SUPPLEMENT_CATALOGUE[id];return !q||c.label.toLowerCase().indexOf(q)>=0||c.aliases.some(function(a){return a.indexOf(q)>=0;});}).map(function(id){var c=SUPPLEMENT_CATALOGUE[id],top=c.evidence[0];
      return '<div class="feat"><div class="feat-body"><b>'+esc(c.label)+'</b> '+uiPill('evidence: '+GRADE_TEXT[top[1]]+' for '+top[0],top[1]==='A'?'good':(top[1]==='D'?'neutral':'attention'))+'<div class="hint">'+esc(c.evidence.map(function(e){return e[0]+' ('+GRADE_TEXT[e[1]]+')';}).join(' \u00b7 '))+'</div>'+
        (c.cautions.length?'<div class="hint">'+esc(c.cautions.join(' '))+'</div>':'')+'<div class="prov">'+esc(c.source)+'</div></div>'+(S.some(function(s){return s.id===id;})?uiPill('in regimen','good'):uiBtn('Add','supp.add',id,'btn-sm btn-secondary'))+'</div>';}).join('');
  if(cov.status==='ok')out+='<div class="card-title" style="margin-top:12px">Vitamins and minerals (food + supplements, '+cov.days+' days)</div>'+_covBars(cov)+'<div class="hint">'+esc(cov.verdict)+' Nutrients judged: '+Math.round(cov.completeness*100)+'% of those food data can carry.</div><div class="hint">'+esc(cov.limits)+'</div>';
  if(adv.interactions&&adv.interactions.length)out+='<div class="card-title" style="margin-top:12px">Together, in your regimen</div>'+adv.interactions.map(function(x){return '<div class="banner '+(x.level==='danger'?'negative':(x.level==='note'?'neutral':'attention'))+'"><span class="banner-text">'+esc(x.text)+'</span></div>';}).join('');
  if(adv.items.length)out+='<div class="card-title" style="margin-top:12px">Guidance</div>'+adv.items.map(function(a){return uiRow(esc(a.label),esc(a.kind),{sub:esc(a.note+(a.cautions&&a.cautions.length?' '+a.cautions[0]:''))});}).join('')+'<div class="hint">'+esc(adv.framing||'')+'</div>';
  try{var rv=supplementReview();var inReg={};S.forEach(function(x){inReg[SUPPLEMENT_CATALOGUE[x.id].label.toLowerCase()]=1;});
    var extra=(rv.rows||[]).filter(function(x){var r=resolveSupplement(x.name);return !(r&&r.id&&S.some(function(z){return z.id===r.id;}));});
    if(extra.length)out+='<div class="card-title" style="margin-top:12px">Also logged</div>'+extra.map(function(x){return uiRow(esc(x.name),x.personallyTested?uiPill('you tested it','good'):(x.evidence?uiPill('general evidence','neutral'):uiPill('no evidence entry','attention')),{sub:esc(x.standing||'')});}).join('');}catch(e){_q(e,'P2');}
  if(eff.status==='ok')out+='<div class="card-title" style="margin-top:12px">Does it work for you?</div>'+eff.supplements.map(function(x){return uiRow(esc(x.name),esc(x.verdict||x.status),{sub:esc(x.why||x.outcome||(x.need||''))});}).join('');
  return {body:out,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
registerAction('weather.auto',function(){DB.settings.weatherAuto=!weatherAutoEnabled();save('settings');if(_SHEET)renderSheet();if(weatherAutoEnabled())weatherAutoRefresh('switched on');toast(weatherAutoEnabled()?'Weather updates automatically':'Weather updates only when you refresh');});
registerAction('weather.expand',function(){DB.settings.weatherExpanded=!DB.settings.weatherExpanded;save('settings');renderAll();});
registerAction('sched.override',function(d){var M=scheduleModel(),c=M.overrides[d]||'auto',nx={auto:'train',train:'short',short:'rest',rest:'auto'}[c];_sched({override:{date:d,choice:nx}});});
registerAction('sched.cycleTrain',function(i){var M=scheduleModel(),c=M.cycleTrain[i]||'auto',nx={auto:'train',train:'rest',rest:'auto'}[c];_sched({cycleChoice:{index:+i,choice:nx}});});
/* HYDRATION on the Food tab: today against need in the person's unit, one-tap amounts, sweat, sodium, status */
function hydrationCard(){var H=hydrationModel(todayISO()),wu=waterUnitDefault(),Q=(WATER_QUICK[wu]||[]).slice(0,4);
  var add='<div class="chips">'+Q.map(function(q){return '<button type="button" class="chip" data-act="qa.waterAmt" data-arg="'+q+'|'+wu+'">+'+q+' '+WATER_UNITS[wu].short+'</button>';}).join('')+'</div>';
  if(H.status!=='ok')return uiCard({title:'Hydration',sub:'nothing logged today',body:add+'<div class="btn-row">'+uiBtn('Sweat test','log.open','sweattest','btn-sm btn-ghost')+uiBtn('Urine colour','log.open','urine','btn-sm btn-ghost')+'</div>'});
  var pct=Math.min(100,Math.round(100*H.intakeL/Math.max(0.1,H.needL)));
  var body='<div class="hyd-bar" role="progressbar" aria-valuenow="'+pct+'" aria-valuemin="0" aria-valuemax="100"><span style="width:'+pct+'%"></span></div>'+
    uiRow('Today',fmtWater(H.intakeL)+' of '+fmtWater(H.needL),{sub:esc('drinks '+fmtWater(H.fromDrinksL)+' \u00b7 food '+fmtWater(H.fromFoodL)+(H.foodWaterEstimatedShare>0.5?' (estimated)':'')+' \u00b7 '+H.verdict),rsub:H.remainingL>0?fmtWater(H.remainingL)+' to go':'met'})+add;
  if(H.sessions.length)body+=uiRow('Sweat today',fmtWater(H.sweatL),{sub:esc(H.sessions.map(function(x){return x.modality+' '+x.minutes+' min: '+fmtWater(x.litres)+' ('+x.basis+(x.weather?', '+x.weather:'')+')';}).join('; '))});
  if(H.sodium.note)body+='<div class="hint">'+esc(H.sodium.note)+'</div>';if(H.urine)body+=uiRow('Urine colour',String(H.urine.value),{sub:esc(H.urine.reading)});if(H.morningDrop)body+='<div class="hint">'+esc(H.morningDrop)+'</div>';
  body+='<div class="btn-row">'+uiBtn('Sweat test','log.open','sweattest','btn-sm btn-ghost')+uiBtn('Urine colour','log.open','urine','btn-sm btn-ghost')+'</div><div class="prov">'+esc(H.method)+'</div>';
  return uiCard({title:'Hydration',sub:pct+'% of today\u2019s need',body:body});}
registerAction('qa.waterAmt',function(arg){var q=String(arg).split('|'),L=toLitres(+q[0],q[1]);if(L==null)return;addObservation({type:'water',date:todayISO(),value:round(L,3),source:'manual',meta:{entered:+q[0],unit:q[1],quick:true}});renderAll();toast('+'+q[0]+' '+WATER_UNITS[q[1]].short,{undo:true});});
