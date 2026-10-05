/* ============================================================================
   CONNECTED SERVICES (the app side of server/server.mjs's connections). Sign-in happens at the provider and the sign-in
   details stay on the server, encrypted, tied to this person's vault. The app asks the server to sync a window, passes
   the provider's JSON through the provider's adapter (WEARABLE_PROVIDERS) into importObservations \u2014 which records the
   provider as the source, drops records it already has (external ids) and fills gaps without counting a day twice.
   ============================================================================ */
function ingestConnectedPayload(p,payload,meta){var W=typeof WEARABLE_PROVIDERS!=='undefined'?WEARABLE_PROVIDERS[p]:null;if(!W)return {status:'refused',note:'no adapter for '+p};
  var rows;try{rows=W.adapt(payload||{});}catch(e){return {status:'error',error:{category:'malformed_payload',detail:String(e&&e.message)}};}
  var extra={retracted:0,superseded:0,sessions:0,possibleDuplicates:0};
  var byExt=function(ext){return (DB.observations||[]).filter(function(o){return !o.retracted&&!o.correctedBy&&o.meta&&o.meta.externalId===ext;})[0];};
  /* deleted at the provider: retracted here, like any correction */
  ((payload&&payload.deleted)||[]).forEach(function(id){var ext=p+':activity:'+id,o=byExt(ext);if(o){retractObservation(o.id,'deleted at '+W.label);extra.retracted++;}
    (DB.sessions||[]).filter(function(x){return x.externalId===ext&&!x.retracted;}).forEach(function(x){retractSession(x.id);extra.retracted++;});});
  /* edited at the provider: the old record is retracted and the new one imported (supersession, not a silent rewrite) */
  rows.forEach(function(r){var o=r.externalId&&byExt(r.externalId);if(!o)return;var m=o.meta||{};
    if(o.value!==r.value||o.method!==(r.method||o.method)||(r.meta&&(m.hr!==r.meta.hr||m.distance!==r.meta.distance||m.sportType!==r.meta.sportType))){retractObservation(o.id,'updated at '+W.label);extra.superseded++;}});
  if(W.adaptSessions){W.adaptSessions(payload||{}).forEach(function(x){if((DB.sessions||[]).some(function(s){return s.externalId===x.externalId&&!s.retracted;}))return;var rec=addSession(x);if(rec){rec.externalId=x.externalId;extra.sessions++;}});}
  var r=importObservations(rows,p,{dryRun:false})||{};meta=meta||{};
  /* a workout logged by hand and the same workout from the provider: flagged for the person, not silently double-counted */
  rows.forEach(function(row){if(row.type!=='cardio')return;var o=byExt(row.externalId);if(!o)return;
    var manual=(DB.observations||[]).filter(function(x){return x.type==='cardio'&&x.date===o.date&&!x.retracted&&!x.correctedBy&&x.source==='manual'&&Math.abs(x.value-o.value)<=0.2*Math.max(x.value,o.value);})[0];
    if(manual&&!(o.meta&&o.meta.possibleDuplicateOf)){o.meta=Object.assign({},o.meta,{possibleDuplicateOf:manual.id});extra.possibleDuplicates++;}});
  if(extra.possibleDuplicates)save('connect:duplicates');   /* imports preview by default; a sync the person started writes */
  DB.settings.sourceSync=Object.assign({},DB.settings.sourceSync||{});DB.settings.sourceSync[p]={lastSuccess:meta.retrievedAt||nowISO(),window:meta.window||null,rows:rows.length,added:r.added!=null?r.added:(r.imported||0)};save('settings');
  return Object.assign({status:'ok',rows:rows.length,added:r.added!=null?r.added:(r.imported!=null?r.imported:0),skipped:r.duplicates||r.skipped||0,overlap:(r.overlapSkipped||[]).length},extra);}
/* possible duplicates, for the attention queue: keep either one with a tap */
function possibleDuplicateWorkouts(){return (DB.observations||[]).filter(function(o){return o.type==='cardio'&&!o.retracted&&!o.correctedBy&&o.meta&&o.meta.possibleDuplicateOf;}).map(function(o){
  var m=(DB.observations||[]).filter(function(x){return x.id===o.meta.possibleDuplicateOf&&!x.retracted&&!x.correctedBy;})[0];return m?{imported:o,manual:m}:null;}).filter(Boolean);}
registerAction('dup.keepImported',function(id){var d=possibleDuplicateWorkouts().filter(function(x){return x.imported.id===id;})[0];if(!d)return;retractObservation(d.manual.id,'duplicate of an imported workout');d.imported.meta=Object.assign({},d.imported.meta,{possibleDuplicateOf:null});save('dup');renderAll();toast('Kept the '+(sourceLabel(sourceKeyOf(d.imported)))+' workout',{undo:true});});
registerAction('dup.keepBoth',function(id){var o=(DB.observations||[]).filter(function(x){return x.id===id;})[0];if(!o)return;o.meta=Object.assign({},o.meta,{possibleDuplicateOf:null,confirmedDistinct:true});save('dup');renderAll();toast('Kept both: they were different workouts');});
function _connectReady(){var c=typeof cloudConfig==='function'?cloudConfig():{};return !!(c&&c.enabled&&c.vaultId);}
function loadConnectedServices(){if(!_SHEET||!_SHEET.buf)return;var buf=_SHEET.buf;if(!_connectReady()){buf.services={status:'no-vault'};renderSheet();return;}
  buf.services={status:'loading'};cloudAuthenticate().then(function(){return _api('/v1/ext/connect/providers');}).then(function(r){buf.services=r;if(_SHEET&&_SHEET.buf===buf)renderSheet();},function(e){buf.services={status:'error',text:String(e&&e.message||e)};if(_SHEET&&_SHEET.buf===buf)renderSheet();});}
function renderConnectedServices(b){var S=b.services,out='<div class="card-title" style="margin-top:12px">Connected services</div>';
  if(!S||S.status==='loading')return out+'<div class="hint">Checking the server\u2026</div>';
  if(S.status==='no-vault')return out+'<div class="hint">Connections belong to your encrypted vault, so the server can keep each service\u2019s sign-in for you. Set up sync first (Tools \u2192 Cloud sync).</div>';
  if(S.status==='error')return out+'<div class="hint">'+esc(S.text)+'</div>';
  if(!S.tokenCustody)out+='<div class="hint">The server has no CONNECT_TOKEN_KEY, so it cannot keep sign-ins safely: connections are off.</div>';
  return out+S.providers.map(function(p){var sync=(DB.settings.sourceSync||{})[p.id];return '<div class="feat">'+uiIcon(p.id==='oura'?'heart':(p.id==='withings'?'scale':(p.id==='strava'?'run':'stopwatch')),{size:20})+'<div class="feat-body"><b>'+esc(p.label)+'</b> '+
    uiPill(p.connected?(p.pending?'new data waiting':'connected'):(p.configured?'not connected':'not available'),p.connected?'good':'neutral')+
    '<div class="hint">'+(p.connected?('last synced '+esc(p.lastSync?String(p.lastSync).replace('T',' ').slice(0,16):'never')+(sync?' \u00b7 '+sync.added+' new of '+sync.rows:'')):(p.configured?'Sign in at '+esc(p.label)+' to connect.':'Needs '+esc(p.needs||'setting up on the server')+'.'))+'</div></div>'+
    (p.connected?uiBtn('Sync','connect.sync',p.id,'btn-sm btn-secondary')+uiBtn('Disconnect','connect.revoke',p.id,'btn-sm btn-ghost'):(p.configured?uiBtn('Connect','connect.start',p.id,'btn-sm btn-primary'):''))+'</div>';}).join('');}
registerAction('connect.start',function(p){cloudAuthenticate().then(function(){return _api('/v1/ext/connect/start',{method:'POST',body:{provider:p,returnTo:window.location.pathname}});})
  .then(function(r){if(r&&r.authorizeUrl)window.location.href=r.authorizeUrl;else toast('Could not start the sign-in');},function(e){toast(String(e&&e.message||e),{tone:'attention',ms:8000});});});
function connectSync(p){toast('Syncing '+(WEARABLE_PROVIDERS[p]||{label:p}).label+'\u2026');
  return cloudAuthenticate().then(function(){return _api('/v1/ext/connect/sync',{method:'POST',body:{provider:p}});}).then(function(r){
    var res=ingestConnectedPayload(p,r.payload,{retrievedAt:r.retrievedAt,window:r.window});if(res.possibleDuplicates)toast(res.possibleDuplicates+' workout'+(res.possibleDuplicates===1?'':'s')+' may duplicate one you logged: see Today',{tone:'attention',ms:7000});renderAll();if(_SHEET&&_SHEET.opts&&_SHEET.opts.form==='sources')loadConnectedServices();
    toast(res.status==='ok'?((WEARABLE_PROVIDERS[p]||{label:p}).label+': '+res.added+' new entr'+(res.added===1?'y':'ies')+(r.backfill?' (the last 30 days)':'')):'The sync could not be read',{tone:res.status==='ok'?null:'attention'});return res;},
    function(e){toast(String(e&&e.message||e),{tone:'attention',ms:8000});});}
registerAction('connect.sync',function(p){connectSync(p);});
registerAction('connect.revoke',function(p){if(!_SHEET||!_SHEET.buf)return;_SHEET.buf.revoking=p;cloudAuthenticate().then(function(){return _api('/v1/ext/connect/revoke',{method:'POST',body:{provider:p}});}).then(function(){
  loadConnectedServices();toast((WEARABLE_PROVIDERS[p]||{label:p}).label+' disconnected. Its data stays unless you remove it below.');},function(e){toast(String(e&&e.message||e),{tone:'attention'});});});
/* back from the provider's sign-in: ?connected=fitbit or ?connect_error=... */
function handleConnectReturn(){try{var q=window.location.search||'',m=/[?&]connected=([a-z]+)/.exec(q),e=/[?&]connect_error=([a-z_]+)/.exec(q);if(!m&&!e)return;
  if(window.history&&window.history.replaceState)window.history.replaceState(null,'',window.location.pathname+window.location.hash);
  if(m){toast((WEARABLE_PROVIDERS[m[1]]||{label:m[1]}).label+' connected. Fetching the last 30 days\u2026');connectSync(m[1]);}
  else toast('The connection did not complete: '+e[1].replace(/_/g,' '),{tone:'attention',ms:8000});}catch(err){_q(err,'P2');}}
