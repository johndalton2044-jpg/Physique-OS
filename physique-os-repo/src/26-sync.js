/* ============================================================================
   REGION: SYNC — operation-level merge across tabs and devices.

   The previous behaviour was last-writer adoption: a tab noticing a newer revision reloaded it, which could
   discard the other tab's unsaved work. For a system whose stated philosophy is "nothing is destroyed" that
   was an inconsistency at the concurrent-edit layer, and it could not be fixed while the unit of exchange was
   a document snapshot — two snapshots have no defined merge.

   With an event log the unit of exchange is a fact that happened, and merging is well defined:
     * union by event id (a duplicate id is the same fact seen twice, never a conflict),
     * total order by (timestamp, device, sequence) so every participant converges on the same ordering,
     * genuine concurrent edits to the same target are DETECTED and surfaced, never silently resolved.

   There is no server here and this file does not pretend otherwise. What exists is the client half: a
   transport interface, a working BroadcastChannel transport for tabs on one device, and a file transport for
   moving a signed envelope between devices by hand. A network transport would implement the same three
   methods; nothing above this layer would change.
   ============================================================================ */
var SYNC_ENVELOPE_VERSION=1;
var _syncTransport=null,_syncState={status:'idle',lastSync:null,peers:{},conflicts:[],merges:0,received:0,sent:0};
function syncState(){return JSON.parse(JSON.stringify(_syncState));}

/* ---------- envelope ----------
   What crosses a transport: events plus enough identity to order and verify them. Never a document. */
function buildEnvelope(opts){
  opts=opts||{};
  var events=eventLog({since:opts.since});
  return {format:'physique-os-sync',version:SYNC_ENVELOPE_VERSION,
    device:deviceId(),instance:DB.instance||null,schema:SCHEMA_VERSION,app:APP_VERSION,release:RELEASE_ID,
    at:nowISO(),since:opts.since||null,count:events.length,events:events,
    note:'events only \u2014 a document snapshot cannot be merged, a set of facts can'};
}
function validateEnvelope(env){
  if(!env||typeof env!=='object')return {ok:false,reason:'not an object'};
  if(env.format!=='physique-os-sync')return {ok:false,reason:'not a Physique OS sync envelope'};
  if(env.version>SYNC_ENVELOPE_VERSION)return {ok:false,reason:'envelope version '+env.version+' is newer than this build understands'};
  if(env.schema>SCHEMA_VERSION)return {ok:false,reason:'the sending device is on schema '+env.schema+'; update this one before merging'};
  if(!Array.isArray(env.events))return {ok:false,reason:'no event list'};
  var bad=env.events.filter(function(e){return !e||!e.id||!e.type||!e.at||!EVENT_TYPES[e.type];});
  if(bad.length)return {ok:false,reason:bad.length+' event(s) are malformed or of an unknown type',
    detail:bad.slice(0,3).map(function(e){return (e&&e.type)||'(no type)';})};
  return {ok:true,events:env.events.length,device:env.device};
}
/* ---------- merge ----------
   Applies an envelope to the local log. Nothing is discarded: the local log after a merge is a superset of
   the local log before it, which is asserted by the self-test. */
function mergeEnvelope(env,opts){
  opts=opts||{};
  var v=validateEnvelope(env);
  if(!v.ok){_syncState.status='rejected: '+v.reason;return {ok:false,reason:v.reason,detail:v.detail};}
  var beforeIds={};_EVENTS.forEach(function(e){beforeIds[e.id]=1;});
  var beforeCount=_EVENTS.length;
  var merged=mergeEvents(_EVENTS,env.events);
  var newOnes=merged.events.filter(function(e){return !beforeIds[e.id];});
  if(!opts.dryRun){
    pushUndo('merge '+newOnes.length+' change'+(newOnes.length===1?'':'s')+' from '+(env.device||'another device'));
    var adopted=adoptMergedEvents(merged);
    if(!adopted.ok){_syncState.status='merge failed';return {ok:false,reason:'the merged log did not project'};}
    _syncState.merges++;_syncState.received+=newOnes.length;
    _syncState.peers[env.device]={at:nowISO(),events:env.count};
    _syncState.conflicts=merged.conflicts;
    _syncState.lastSync=nowISO();_syncState.status='merged';
    if(typeof auditAppend==='function')auditAppend('sync.merged',{from:env.device,added:newOnes.length,conflicts:merged.conflicts.length});
    save('sync:merge');
  }
  return {ok:true,added:newOnes.length,before:beforeCount,after:merged.events.length,
    conflicts:merged.conflicts,superset:merged.events.length>=beforeCount,
    note:newOnes.length?(newOnes.length+' change'+(newOnes.length===1?'':'s')+' merged in'):'already up to date'};
}
/* ---------- transports ----------
   Three methods: send(envelope), onReceive(handler), close(). Anything implementing them can carry sync. */
function BroadcastTransport(){
  var ch=null;
  try{ch=(typeof BroadcastChannel!=='undefined')?new BroadcastChannel('physique-os-sync'):null;}catch(e){_q(e,'P2');}
  return {
    id:'broadcast',available:!!ch,
    send:function(env){if(!ch)return false;try{ch.postMessage(env);_syncState.sent++;return true;}catch(e){_q(e,'P2');return false;}},
    onReceive:function(fn){if(!ch)return;ch.onmessage=function(ev){try{fn(ev.data);}catch(e){_q(e,'P2');}};},
    close:function(){try{if(ch)ch.close();}catch(e){}}
  };
}
/* Manual transport: export an envelope, carry it however you like, import it on the other device. This is
   the honest offline answer to multi-device sync without a server. */
function exportSyncEnvelope(since){
  var env=buildEnvelope({since:since||null});
  return {name:'physique-sync-'+deviceId()+'-'+todayISO()+'.json',body:JSON.stringify(env),env:env};
}
function importSyncEnvelope(text){
  var env;try{env=JSON.parse(text);}catch(e){return {ok:false,reason:'the file is not valid JSON'};}
  return mergeEnvelope(env);
}
function initSync(){
  if(_syncTransport)return _syncTransport;
  _syncTransport=BroadcastTransport();
  if(!_syncTransport.available){_syncState.status='no transport (BroadcastChannel unavailable)';return _syncTransport;}
  _syncState.status='listening';
  _syncTransport.onReceive(function(env){
    if(!env||env.device===deviceId())return;    // our own broadcast
    if(env.request==='full'){pushSync();return;}
    var r=mergeEnvelope(env);
    if(r.ok&&r.added){_memoInvalidate();if(typeof renderAll==='function')renderAll();
      if(typeof toast==='function')toast(r.added+' change'+(r.added===1?'':'s')+' merged from another tab'+(r.conflicts.length?(' \u00b7 '+r.conflicts.length+' concurrent edit'+(r.conflicts.length===1?'':'s')+' to review'):''),{ms:6000});}
  });
  /* Announce on save so other tabs converge without polling. */
  onSave(function(){pushSync();});
  pushSync();
  return _syncTransport;
}
var _pushTimer=null;
function pushSync(){
  if(!_syncTransport||!_syncTransport.available)return false;
  clearTimeout(_pushTimer);
  _pushTimer=setTimeout(function(){try{_syncTransport.send(buildEnvelope({}));}catch(e){_q(e,'P2');}},250);
  return true;
}
/* ---------- conflicts ----------
   A conflict is not an error and does not block anything: both events are in the log and the projection
   reflects their order. It is surfaced so a human can decide whether the outcome is what they wanted. */
function syncConflicts(){
  return _syncState.conflicts.map(function(c){
    return {target:c.target,what:'Two devices changed the same record within an hour',
      detail:c.types.join(' and ')+' from '+c.devices.join(' and '),
      when:c.at.map(function(t){return String(t).slice(0,16).replace('T',' ');}).join(' and '),
      resolution:c.resolution,note:c.note};
  });
}
function clearSyncConflicts(){_syncState.conflicts=[];}
