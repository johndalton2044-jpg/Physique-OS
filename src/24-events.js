/* ============================================================================
   REGION: EVENT STORE — the append-only journal the temporal semantics were always implementing by hand.

   Until now the record was a document, and history was reconstructed from mutable arrays carrying
   correctedBy / retractedAt / supersededAt flags. That worked, but it meant temporal correctness depended on
   every future mutator remembering to stamp the right field. An event log inverts that: the events ARE the
   history, and the document is a projection of them.

   The migration is deliberately non-destructive and reversible in effect:
     * Every mutation primitive emits an event describing WHAT HAPPENED, not what the record now looks like.
     * The document remains the working representation, because every model and view reads it.
     * `projectEvents()` rebuilds a document from events alone. The self-test asserts that projecting the log
       reproduces the live record field for field — which is the only honest proof that the log is complete.
     * Replay can therefore run either way: from the document's knowledge dates (fast, unchanged) or from the
       event log (authoritative). They must agree, and a test asserts they do.

   This is what makes operation-level merge possible in 26-sync.js: two tabs or two devices produce two event
   sequences, and merging sequences is well defined where merging document snapshots is not.
   ============================================================================ */
var EVENT_SCHEMA=1;
/* WORKING WINDOW, NOT A LIMIT.
   The previous behaviour spliced the oldest events away once the log passed 50,000 — silent history
   destruction in a system whose stated invariant is that nothing is destroyed. Compaction now follows the
   standard event-sourcing shape instead: when the window fills, the events falling out of it are folded
   into an immutable snapshot event, and the raw events are written to a durable archive that is never
   deleted. Projection is then snapshot + events after it, which reproduces the same record from a bounded
   amount of memory. The archive keeps the original facts for audit and for a full rebuild. */
var _EVENTS=[],_EVENT_SEQ=0,_EVENTS_ENABLED=true;
var EVENT_WINDOW=20000;          // events kept in memory
var EVENT_COMPACT_CHUNK=5000;    // how many are folded away at once
var _archiveMeta={shards:[],archived:0,lastSnapshotAt:null,lastSnapshotSeq:0};
function eventArchiveState(){
  return {working:_EVENTS.length,window:EVENT_WINDOW,archived:_archiveMeta.archived,
    total:_archiveMeta.archived+_EVENTS.length,shards:_archiveMeta.shards.length,
    lastSnapshotAt:_archiveMeta.lastSnapshotAt,lastSnapshotSeq:_archiveMeta.lastSnapshotSeq,
    compacted:_archiveMeta.archived>0,
    healthy:_EVENTS.length<=EVENT_WINDOW,
    note:_archiveMeta.archived?
      ('History before '+localDateOf(_archiveMeta.lastSnapshotAt)+' is folded into a snapshot; the original events are kept in the archive and nothing was deleted.'):
      'The whole history fits in the working window; nothing has been compacted yet.'};
}
/* Fold the oldest events into a snapshot and move the originals to the archive. */
function compactEvents(force){
  if(!force&&_EVENTS.length<=EVENT_WINDOW)return {compacted:0};
  var take=Math.max(EVENT_COMPACT_CHUNK,_EVENTS.length-EVENT_WINDOW);
  if(take>=_EVENTS.length)take=_EVENTS.length-1;
  if(take<1)return {compacted:0};
  var older=_EVENTS.slice(0,take);
  var rest=_EVENTS.slice(take);
  /* State as of the last folded event, built from everything up to that point. */
  var upto=projectEvents(older,{});
  var snap={};
  ['schemaVersion','appVersion','profile','settings','phases','observations','sessions','foodLogs','foods',
   'recipes','decisions','interventions','predictions','experiments','negatives','snapshots','archive','notes']
    .forEach(function(k){if(upto.db[k]!==undefined)snap[k]=upto.db[k];});
  var boundary=older[older.length-1];
  var snapshotEvent={id:uid('ev'),seq:boundary.seq,type:'record.snapshot',at:boundary.at,device:boundary.device,
    schema:EVENT_SCHEMA,compaction:true,
    data:{reason:'compaction of '+older.length+' earlier events',at:boundary.at,
      firstArchived:older[0].at,lastArchived:boundary.at,archivedCount:older.length,record:snap}};
  /* Archive the originals before dropping them from memory. If the archive write fails, keep them: losing
     history to save memory is the wrong trade in every case. */
  var shardKey='archive:'+String(boundary.at).slice(0,7)+':'+boundary.seq;
  var ok=true;
  try{idbWrite(shardKey,JSON.stringify(older));}catch(e){_q(e,'P0');ok=false;}
  if(!ok)return {compacted:0,error:'the archive write failed; no events were dropped'};
  _archiveMeta.shards.push({key:shardKey,count:older.length,from:older[0].at,to:boundary.at});
  _archiveMeta.archived+=older.length;
  _archiveMeta.lastSnapshotAt=boundary.at;_archiveMeta.lastSnapshotSeq=boundary.seq;
  if(DB&&DB.settings)DB.settings.eventArchive={shards:_archiveMeta.shards,archived:_archiveMeta.archived,
    lastSnapshotAt:_archiveMeta.lastSnapshotAt,lastSnapshotSeq:_archiveMeta.lastSnapshotSeq};
  _EVENTS=[snapshotEvent].concat(rest);
  if(typeof auditAppend==='function')auditAppend('events.compacted',{archived:older.length,shard:shardKey});
  return {compacted:older.length,shard:shardKey,working:_EVENTS.length};
}
/* Read the full history back, archive included. Used by the rebuild check and by a full export. */
function loadFullEventHistory(){
  if(!_IDB||!_archiveMeta.shards.length)return Promise.resolve(_EVENTS.slice());
  return Promise.all(_archiveMeta.shards.map(function(s){return idbGet(_IDB,s.key);}))
    .then(function(vals){
      var all=[];
      for(var i=0;i<vals.length;i++){if(vals[i]==null)continue;
        try{all=all.concat(JSON.parse(vals[i]));}catch(e){_q(e,'P1');}}
      /* Drop the compaction snapshots from the working window: the archived originals supersede them. */
      return all.concat(_EVENTS.filter(function(e){return !e.compaction;}));
    }).catch(function(e){_q(e,'P1');return _EVENTS.slice();});
}
/* A device identity, generated once and stored with the record. It is not an account: it exists so that
   events from two browsers can be ordered and deduplicated without a server assigning ids. */
function deviceId(){
  if(DB&&DB.settings&&DB.settings.deviceId)return DB.settings.deviceId;
  var id='dev-'+(typeof crypto!=='undefined'&&crypto.getRandomValues?
    Array.prototype.map.call(crypto.getRandomValues(new Uint8Array(6)),function(b){return ('0'+b.toString(16)).slice(-2);}).join(''):
    Math.random().toString(36).slice(2,14));
  if(DB&&DB.settings){DB.settings.deviceId=id;}
  return id;
}
/* EVENT TYPES. Each names a thing that happened in the world or in the record, never a resulting state.
   `apply` folds the event into a document. Adding a type requires adding its fold, and the contract test
   asserts every emitted type has one. */
var EVENT_TYPES={
  'observation.added':{apply:function(db,e){db.observations.push(JSON.parse(JSON.stringify(e.data)));}},
  'observation.corrected':{apply:function(db,e){
    var old=db.observations.filter(function(o){return o.id===e.data.of;})[0];
    if(old){old.correctedBy=e.data.record.id;old.correctedAt=e.at;
      old.correctionHistory=(old.correctionHistory||[]).concat([{at:e.at,by:e.data.record.id,from:old.value,to:e.data.record.value}]);}
    db.observations.push(JSON.parse(JSON.stringify(e.data.record)));}},
  'observation.retracted':{apply:function(db,e){
    var o=db.observations.filter(function(x){return x.id===e.data.id;})[0];
    if(o){o.retracted=true;o.retractedAt=e.at;o.retractReason=e.data.reason||'';}}},
  'observation.flagged':{apply:function(db,e){
    var o=db.observations.filter(function(x){return x.id===e.data.id;})[0];
    if(o)o.flags=(o.flags||[]).concat([e.data.flag]);}},
  'session.added':{apply:function(db,e){db.sessions.push(JSON.parse(JSON.stringify(e.data)));}},
  'session.retracted':{apply:function(db,e){
    var s=db.sessions.filter(function(x){return x.id===e.data.id;})[0];
    if(s){s.retracted=true;s.retractedAt=e.at;}}},
  'session.superseded':{apply:function(db,e){
    var old=db.sessions.filter(function(x){return x.id===e.data.of;})[0];
    if(old){old.supersededBy=e.data.record.id;old.supersededAt=e.at;}
    db.sessions.push(JSON.parse(JSON.stringify(e.data.record)));}},
  'food.logged':{apply:function(db,e){db.foodLogs.push(JSON.parse(JSON.stringify(e.data)));}},
  'food.superseded':{apply:function(db,e){
    var old=db.foodLogs.filter(function(l){return l.id===e.data.of;})[0];
    if(old){old.supersededBy=e.data.record.id;old.supersededAt=e.at;}
    db.foodLogs.push(JSON.parse(JSON.stringify(e.data.record)));}},
  'food.retracted':{apply:function(db,e){
    var l=db.foodLogs.filter(function(x){return x.id===e.data.id;})[0];
    if(l){l.retracted=true;l.retractedAt=e.at;}}},
  /* DEPRECATED and no longer emitted: this mutated the record in place, so a replay of a day before the
     change saw the new meal. Meal changes now supersede like every other food edit. The fold is retained so
     logs written by earlier builds still project, and nothing new is written through it. */
  'food.mealChanged':{deprecated:true,apply:function(db,e){var l=db.foodLogs.filter(function(x){return x.id===e.data.id;})[0];if(l)l.meal=e.data.meal;}},
  'nutrition.derived':{apply:function(db,e){
    db.observations.forEach(function(o){if(o.source==='food-log'&&o.date===e.data.date&&!o.retracted){o.retracted=true;o.retractedAt=e.at;o.retractReason='superseded by recalculation';}});
    (e.data.records||[]).forEach(function(r){db.observations.push(JSON.parse(JSON.stringify(r)));});}},
  'userFood.saved':{apply:function(db,e){var i=db.foods.findIndex(function(f){return f.id===e.data.id;});
    if(i>=0)db.foods[i]=JSON.parse(JSON.stringify(e.data));else db.foods.push(JSON.parse(JSON.stringify(e.data)));}},
  'recipe.saved':{apply:function(db,e){var i=db.recipes.findIndex(function(r){return r.id===e.data.id;});
    if(i>=0)db.recipes[i]=JSON.parse(JSON.stringify(e.data));else db.recipes.push(JSON.parse(JSON.stringify(e.data)));}},
  'phase.started':{apply:function(db,e){
    (db.phases||[]).forEach(function(x){if(x.status==='active'&&!x.endDate&&x.id!==e.data.id){
      x.history=(x.history||[]).concat([{at:e.at,before:{endDate:x.endDate,status:x.status}}]);
      x.endDate=e.data.priorEnd||x.endDate;x.status='ended';}});
    db.phases.push(JSON.parse(JSON.stringify(e.data)));}},
  'phase.targetsChanged':{apply:function(db,e){
    var p=db.phases.filter(function(x){return x.id===e.data.id;})[0];if(!p)return;
    p.history=(p.history||[]).concat([{at:e.at,before:JSON.parse(JSON.stringify(e.data.before))}]);
    Object.keys(e.data.changed).forEach(function(k){p[k]=e.data.changed[k];});p.updatedAt=e.at;}},
  'phase.ended':{apply:function(db,e){
    var p=db.phases.filter(function(x){return x.id===e.data.id;})[0];if(!p)return;
    p.history=(p.history||[]).concat([{at:e.at,before:{endDate:p.endDate,status:p.status,outcome:p.outcome}}]);
    p.endDate=e.data.endDate;p.status='ended';p.outcome=e.data.outcome||'';}},
  'program.customized':{apply:function(db,e){
    db.settings.customPrograms=db.settings.customPrograms||{};
    if(e.data.def===null)delete db.settings.customPrograms[e.data.key];
    else db.settings.customPrograms[e.data.key]=JSON.parse(JSON.stringify(e.data.def));}},
  'program.changed':{apply:function(db,e){db.settings.program=e.data.to;
    db.settings.programHistory=(db.settings.programHistory||[]).concat([{at:e.at,program:e.data.to,from:e.data.from||null,source:e.data.source||'user'}]);}},
  'intervention.recorded':{apply:function(db,e){db.interventions.push(JSON.parse(JSON.stringify(e.data)));}},
  'decision.recorded':{apply:function(db,e){db.decisions.push(JSON.parse(JSON.stringify(e.data)));}},
  'prediction.stamped':{apply:function(db,e){db.predictions.push(JSON.parse(JSON.stringify(e.data)));}},
  'prediction.scored':{apply:function(db,e){var p=db.predictions.filter(function(x){return x.id===e.data.id;})[0];
    if(p)Object.keys(e.data.result).forEach(function(k){p[k]=e.data.result[k];});}},
  /* §19 revisions are append-only: a revision before results adds to the history; the original fields of an
     experiment with results are never touched — that path creates a new, linked experiment instead. */
  /* A record of who authorized a copilot proposal. The action itself is recorded by its own event; this one
     says it was the person who confirmed it, never the assistant. */
  'copilot.authorized':{apply:function(db,e){db.settings.authorizations=(db.settings.authorizations||[]).concat([
    {proposal:e.data.proposal,action:e.data.action,by:e.data.by,at:e.at}]).slice(-200);}},
  'experiment.revised':{apply:function(db,e){var x=db.experiments.filter(function(y){return y.id===e.data.id;})[0];
    if(!x||x.outcome!=null)return;
    x.revisions=(x.revisions||[]).concat([{version:e.data.version,at:e.at,previous:e.data.previous,changes:e.data.changes,why:e.data.why||''}]);
    Object.keys(e.data.changes||{}).forEach(function(k){x[k]=e.data.changes[k];});
    x.planVersion=e.data.version;x.planHash=e.data.planHash;}},
  'experiment.created':{apply:function(db,e){db.experiments.push(JSON.parse(JSON.stringify(e.data)));}},
  /* a response matures (provisional, then final): the later record replaces the earlier for the same intervention */
  'cycle.recorded':{apply:function(db,e){db.cycles=(db.cycles||[]).filter(function(x){return x.id!==e.data.id;});db.cycles.push(JSON.parse(JSON.stringify(e.data)));}},
  'response.recorded':{apply:function(db,e){db.responses=(db.responses||[]).filter(function(x){return x.id!==e.data.id;});db.responses.push(JSON.parse(JSON.stringify(e.data)));}},
  'experiment.evaluated':{apply:function(db,e){var x=db.experiments.filter(function(y){return y.id===e.data.id;})[0];
    if(x)Object.keys(e.data.result).forEach(function(k){x[k]=e.data.result[k];});}},
  'negative.recorded':{apply:function(db,e){db.negatives.push(JSON.parse(JSON.stringify(e.data)));}},
  'plan.created':{apply:function(db,e){(db.plans=db.plans||[]).push(JSON.parse(JSON.stringify(e.data)));}},
  'execution.marked':{apply:function(db,e){(db.executions=db.executions||[]).push(JSON.parse(JSON.stringify(e.data)));}},
  'snapshot.captured':{apply:function(db,e){db.snapshots.push(JSON.parse(JSON.stringify(e.data)));}},
  'profile.changed':{apply:function(db,e){db.profile=Object.assign(db.profile||{},JSON.parse(JSON.stringify(e.data)));}},
  'settings.changed':{apply:function(db,e){Object.keys(e.data||{}).forEach(function(k){db.settings[k]=e.data[k];});}},
  'inventory.changed':{apply:function(db,e){
    db.settings.inventory=db.settings.inventory||[];
    if(e.data.op==='add')db.settings.inventory.push(JSON.parse(JSON.stringify(e.data.item)));
    else if(e.data.op==='receive'){var iv=db.settings.inventory.filter(function(x){return x.id===e.data.id;})[0];
      if(iv){iv.remaining=(iv.remaining||0)+e.data.amount;
        iv.receipts=(iv.receipts||[]).concat([{at:e.at,amount:e.data.amount,expiresAt:e.data.expiresAt||null}]);
        if(e.data.expiresAt)iv.expiresAt=e.data.expiresAt;}}
    else if(e.data.op==='remove'){var i=db.settings.inventory.filter(function(x){return x.id===e.data.id;})[0];if(i)i.removedAt=e.at;}}},
  'movement.logged':{apply:function(db,e){
    db.settings.movements=(db.settings.movements||[]).concat([JSON.parse(JSON.stringify(e.data))]);}},
  'skill.changed':{apply:function(db,e){
    db.settings.skills=db.settings.skills||{};
    db.settings.skills[e.data.id]={state:e.data.state,at:e.at,note:e.data.note||''};}},
  'model.stage':{apply:function(db,e){
    db.settings.modelLifecycle=db.settings.modelLifecycle||{};
    var d=e.data;
    var prev=db.settings.modelLifecycle[d.id]||null;
    db.settings.modelLifecycle[d.id]={stage:d.stage,since:e.at,previous:d.from||null,why:d.why||'',
      history:((prev&&prev.history)||[]).concat([{stage:d.from||null,until:e.at}]).slice(-10)};}},
  'equipment.changed':{apply:function(db,e){
    db.settings.equipmentItems=db.settings.equipmentItems||[];
    var d=e.data;
    if(d.op==='add')db.settings.equipmentItems.push(JSON.parse(JSON.stringify(d.item)));
    else{var it=db.settings.equipmentItems.filter(function(x){return x.id===d.id;})[0];
      if(!it)return;
      if(d.op==='retire'){it.retiredAt=e.at;it.condition='retired';it.retiredWhy=d.why||'';}
      else if(d.patch)Object.keys(d.patch).forEach(function(k){it[k]=d.patch[k];});}}},
  'userRule.added':{apply:function(db,e){
    db.settings.userRules=(db.settings.userRules||[]).concat([JSON.parse(JSON.stringify(e.data))]);}},
  'userRule.retired':{apply:function(db,e){
    var r=(db.settings.userRules||[]).filter(function(x){return x.id===e.data.id;})[0];
    if(r)r.retiredAt=e.at;}},
  'injury.recorded':{apply:function(db,e){
    db.settings.injuries=(db.settings.injuries||[]).concat([JSON.parse(JSON.stringify(e.data))]);}},
  'injury.resolved':{apply:function(db,e){
    var i=(db.settings.injuries||[]).filter(function(x){return x.id===e.data.id;})[0];
    if(i)i.resolvedAt=e.at;}},
  'record.imported':{apply:function(db,e){/* recorded for provenance; the rows arrive as observation.added */}},
  /* A record can enter the app without passing through the mutators: the demo generator, a restore, or a
     boot from a build that predates the event log. Pretending the log describes such a record would make the
     log a lie. A snapshot is therefore itself an event: the log restarts from a stated baseline, and
     projecting it still reproduces the record exactly. This is the standard way event-sourced systems adopt
     external state, and it keeps the completeness proof honest instead of exempting cases from it. */
  'record.snapshot':{apply:function(db,e){
    var snap=e.data&&e.data.record;if(!snap)return;
    Object.keys(snap).forEach(function(k){db[k]=JSON.parse(JSON.stringify(snap[k]));});}}
};
function emitEvent(type,data,opts){
  if(!_EVENTS_ENABLED)return null;
  if(!EVENT_TYPES[type]){_q(new Error('unknown event type: '+type),'P1');return null;}
  opts=opts||{};
  var e={id:(opts.id||uid('ev')),seq:++_EVENT_SEQ,type:type,at:opts.at||nowISO(),
    device:deviceId(),schema:EVENT_SCHEMA,data:data};
  _EVENTS.push(e);
  if(typeof _automationOnEvent==='function')_automationOnEvent(e);   /* workflow rules: after recording, never during replay (replay does not emit) */
  if(_EVENTS.length>EVENT_WINDOW){try{compactEvents();}catch(err){_q(err,'P0');}}
  if(DB&&DB.ledger)DB.ledger.events=(DB.ledger.events||0)+1;
  return e;
}
/* Restart the log from the current document. Used wherever a record arrives from outside the log. */
function resetEventLog(reason){
  _EVENTS.length=0;_EVENT_SEQ=0;_eventsDirty={};
  var snap={};
  ['schemaVersion','appVersion','profile','settings','phases','observations','sessions','foodLogs','foods',
   'recipes','decisions','interventions','predictions','experiments','negatives','snapshots','archive','notes']
    .forEach(function(k){if(DB[k]!==undefined)snap[k]=JSON.parse(JSON.stringify(DB[k]));});
  emitEvent('record.snapshot',{reason:reason||'record adopted from outside the event log',
    at:nowISO(),counts:{observations:(DB.observations||[]).length,foodLogs:(DB.foodLogs||[]).length,
    sessions:(DB.sessions||[]).length},record:snap});
  return {ok:true,reason:reason||null,events:_EVENTS.length};
}
function eventLog(opts){
  opts=opts||{};var out=_EVENTS;
  if(opts.since)out=out.filter(function(e){return e.at>opts.since;});
  if(opts.type)out=out.filter(function(e){return e.type===opts.type;});
  if(opts.device)out=out.filter(function(e){return e.device===opts.device;});
  return opts.limit?out.slice(-opts.limit):out.slice();
}
function eventStats(){
  var byType={},byDevice={};
  _EVENTS.forEach(function(e){byType[e.type]=(byType[e.type]||0)+1;byDevice[e.device]=(byDevice[e.device]||0)+1;});
  return {count:_EVENTS.length,types:Object.keys(byType).length,byType:byType,byDevice:byDevice,
    first:_EVENTS.length?_EVENTS[0].at:null,last:_EVENTS.length?_EVENTS[_EVENTS.length-1].at:null,
    schema:EVENT_SCHEMA,window:EVENT_WINDOW,archive:eventArchiveState()};
}
/* ---------- projection ----------
   Fold an event sequence into a document. `asOf` truncates by knowledge date, which is what makes replay
   from the log exact rather than reconstructed: an event that had not happened by a date simply is not
   folded in, so there is no flag to interpret and nothing to get wrong. */
/* ---------------- RECONSTRUCTION BOUNDARY ----------------
   A record.snapshot taken when a record is ADOPTED — restored, imported, demo-loaded, or migrated from a
   version that had no event log — is a baseline, not a change. Folding it into a replay of an earlier date
   makes today's profile and settings appear to have been known then. For observations that is harmless,
   because each carries its own date and createdAt. For the profile it is not: a profile has no effective
   date per field, so the replay silently inherits today's height and age, and height feeds BMR feeds
   maintenance feeds the calorie target feeds the decision.

   The honest answer is a boundary. Before the date a record entered the event history, state that has no
   event of its own cannot be reconstructed, and the system should say so rather than substitute the present.
   This is the same rule the rest of the app follows: report what is missing rather than fill the space. */
function recordBaseline(){
  if(typeof _EVENTS==='undefined'||!_EVENTS.length)return {date:null,known:false,reason:'no event history'};
  var sorted=_EVENTS.slice().sort(function(a,b){return String(a.at)<String(b.at)?-1:1;});
  var firstSnap=sorted.filter(function(e){return e.type==='record.snapshot';})[0];
  var firstEvent=sorted[0];
  if(!firstSnap)
    return {date:localDateOf(firstEvent.at),known:true,adopted:false,
      reason:'the event log starts here and nothing was adopted from outside it'};
  /* If ordinary events predate the snapshot, the log genuinely covers that earlier ground. */
  var earlierReal=sorted.filter(function(e){
    return e.type!=='record.snapshot'&&String(e.at)<String(firstSnap.at);})[0];
  if(earlierReal)
    return {date:localDateOf(earlierReal.at),known:true,adopted:false,
      reason:'events predate the adoption snapshot, so history is reconstructable from there'};
  return {date:localDateOf(firstSnap.at),known:true,adopted:true,
    reason:(firstSnap.data&&firstSnap.data.reason)||'this record was adopted into the event history on this date',
    note:'Observations before this date are in the record and remain visible. What cannot be reconstructed is the profile and settings as they stood then — the snapshot carries only their values at adoption.'};
}
/* True for ANY date earlier than the point the log begins, not only for adopted records. Before the first
   event there is no evidence about the profile either way, and returning today's values there is the same
   leak wearing a different hat. */
function beforeBaseline(date){
  var b=recordBaseline();
  return !!(b.date&&date&&String(date)<b.date);
}
function projectEvents(events,opts){
  opts=opts||{};
  var db=opts.base?JSON.parse(JSON.stringify(opts.base)):emptyDB();
  /* A snapshot REPLACES the document, so anything folded after it wins and anything folded before it is
     discarded. Ordering purely by timestamp therefore loses backdated entries: logging yesterday's weigh-in
     produces an event stamped yesterday, which sorts before a snapshot taken today and is wiped by it. The
     app explicitly supports backdating, so this silently lost real records.

     Snapshots act as barriers instead. An event emitted AFTER a snapshot (higher sequence) is folded after
     it whatever its own timestamp says, by lifting its effective sort key to the barrier. Timestamp order is
     preserved everywhere else, so cross-device merge is unaffected. */
  var raw=(events||_EVENTS).slice().sort(function(a,b){return (a.seq||0)-(b.seq||0);});
  var barrier=null;
  raw.forEach(function(e){
    e.__sortAt=(barrier&&String(e.at)<barrier)?barrier:e.at;
    if(e.type==='record.snapshot')barrier=e.at;
  });
  var list=raw.sort(function(a,b){
    var aa=a.__sortAt||a.at,bb=b.__sortAt||b.at;
    if(aa!==bb)return aa<bb?-1:1;
    if(a.device!==b.device)return a.device<b.device?-1:1;   // deterministic tie-break across devices
    return (a.seq||0)-(b.seq||0);
  });
  var applied=0,skipped=0;
  for(var i=0;i<list.length;i++){
    var e=list[i];
    /* A snapshot is a BASELINE, not a change, so it is folded regardless of the as-of date. Excluding it
       because its timestamp is later than the replay date would erase the whole record from the replay:
       a record adopted today (a demo, a restore, a legacy document) carries a snapshot stamped today while
       the records inside it are months old. The temporal filtering of those records happens through their
       own dates, which is where it belongs. */
    /* Replay still uses the event's OWN timestamp: the barrier is about fold order, not about when the
       system knew something. A backdated entry became known when it was entered, which is e.at. */
    if(opts.asOf&&e.type!=='record.snapshot'&&localDateOf(e.at)>opts.asOf){skipped++;continue;}
    var t=EVENT_TYPES[e.type];
    if(!t){skipped++;continue;}
    try{t.apply(db,e);applied++;}catch(err){_q(err,'P1');skipped++;}
  }
  db.schemaVersion=SCHEMA_VERSION;db.appVersion=APP_VERSION;
  return {db:db,applied:applied,skipped:skipped,events:list.length};
}
/* Replay through the event log rather than through the document's knowledge dates. Both paths must agree;
   `replayAgreement()` below is the test that they do. */
function projectAt(date){
  var p=projectEvents(_EVENTS,{asOf:date});
  return p.db;
}
/* Do the two replay mechanisms agree? They can only be compared with ONE visibility predicate applied to
   both documents: in the flag-based record a past record exists but is suppressed by dates, while in a
   projection a record that had not happened simply is not there. Using two differently-worded predicates
   produces false mismatches, which is a bug in the test rather than in either mechanism. */
function _liveAt(db,date){
  var vis=function(x,supKey,supAtKey){
    if(!x)return false;
    if(x.date&&x.date>date)return false;
    if(x.createdAt&&localDateOf(x.createdAt)>date)return false;
    if(x.retracted&&(!x.retractedAt||localDateOf(x.retractedAt)<=date))return false;
    if(supKey&&x[supKey]&&(!x[supAtKey]||String(x[supAtKey]).slice(0,10)<=date))return false;
    return true;
  };
  return {
    observations:(db.observations||[]).filter(function(o){return vis(o,'correctedBy','correctedAt');}).length,
    sessions:(db.sessions||[]).filter(function(x){return vis(x);}).length,
    foodLogs:(db.foodLogs||[]).filter(function(l){return vis(l,'supersededBy','supersededAt');}).length
  };
}
function replayAgreement(date){
  var viaFlags=_liveAt(DB,date);
  var viaEvents=_liveAt(projectAt(date),date);
  var agree=viaFlags.observations===viaEvents.observations&&viaFlags.sessions===viaEvents.sessions&&viaFlags.foodLogs===viaEvents.foodLogs;
  return {date:date,viaFlags:viaFlags,viaEvents:viaEvents,agree:agree,
    note:agree?'both replay mechanisms agree':'the event log is incomplete for at least one mutator'};
}
/* Completeness proof: projecting the whole log must reproduce the live record. Compared on stable content
   rather than key order, because the document is assembled in a different sequence than it is folded. */
function projectionMatchesRecord(){
  var p=projectEvents(_EVENTS);
  var norm=function(arr,keys){return (arr||[]).map(function(x){var o={};keys.forEach(function(k){if(x[k]!==undefined)o[k]=x[k];});return o;})
    .sort(function(a,b){return String(a.id)<String(b.id)?-1:1;});};
  var cmp=[
    ['observations',['id','type','date','value','retracted','correctedBy','source']],
    ['sessions',['id','date','retracted']],
    ['foodLogs',['id','date','meal','quantity','basis','retracted','supersededBy']],
    ['phases',['id','type','startDate','endDate','status','calorieTarget','stepTarget']],
    ['interventions',['id','date','variable','from','to']],
    ['experiments',['id','variable','status','conclusion']],
    ['predictions',['id','subject','status','hit']],
    ['decisions',['id','date','code']],
    ['negatives',['id','date','variable']],
    ['foods',['id','name']],['recipes',['id','name']]
  ];
  var diffs=[];
  cmp.forEach(function(pair){
    var a=JSON.stringify(norm(DB[pair[0]],pair[1]));
    var b=JSON.stringify(norm(p.db[pair[0]],pair[1]));
    if(a!==b)diffs.push({collection:pair[0],record:(DB[pair[0]]||[]).length,projected:(p.db[pair[0]]||[]).length});
  });
  return {ok:diffs.length===0,diffs:diffs,applied:p.applied,skipped:p.skipped,events:_EVENTS.length,
    note:diffs.length?'the event log does not reproduce the record: a mutator is not emitting':'projecting the event log reproduces the record'};
}
/* ---------- merge ----------
   Two event sequences merge by union on event id, ordered by (at, device, seq). This is well defined where
   merging two document snapshots is not: an event is a fact that happened, so the union of two sets of facts
   is the history, and a duplicate id is the same fact seen twice rather than a conflict.
   Genuine conflicts — two devices editing the same target in the same window — are detected and reported,
   never silently resolved by last-writer-wins. */
function mergeEvents(local,remote){
  var byId={},order=[];
  var take=function(list,origin){(list||[]).forEach(function(e){
    if(byId[e.id]){byId[e.id].seen++;return;}
    byId[e.id]={e:e,origin:origin,seen:1};order.push(e.id);});};
  take(local,'local');take(remote,'remote');
  var all=order.map(function(id){return byId[id].e;});
  all.sort(function(a,b){if(a.at!==b.at)return a.at<b.at?-1:1;
    if(a.device!==b.device)return a.device<b.device?-1:1;return (a.seq||0)-(b.seq||0);});
  /* Concurrent edits to the same target: same target id, different devices, within an hour, both mutating. */
  var MUTATING=/corrected|retracted|targetsChanged|superseded|mealChanged|ended|changed|evaluated|scored/;
  var byTarget={},conflicts=[];
  all.forEach(function(e){
    var target=e.data&&(e.data.id||e.data.of);if(!target||!MUTATING.test(e.type))return;
    var prev=byTarget[target];
    if(prev&&prev.device!==e.device&&Math.abs(new Date(e.at)-new Date(prev.at))<3600000){
      conflicts.push({target:target,types:[prev.type,e.type],devices:[prev.device,e.device],
        at:[prev.at,e.at],resolution:'both applied in timestamp order; the later one wins where they set the same field',
        note:'no event was discarded \u2014 the log keeps both, and the projection reflects the ordering'});
    }
    byTarget[target]=e;
  });
  return {events:all,added:all.length-(local||[]).length,duplicates:order.length-all.length+Object.keys(byId).filter(function(k){return byId[k].seen>1;}).length,
    conflicts:conflicts,
    note:'events merge by union on id; a duplicate id is the same fact seen twice, not a conflict'};
}
function adoptMergedEvents(merged){
  _EVENTS=merged.events.slice();
  _EVENT_SEQ=_EVENTS.reduce(function(a,e){return Math.max(a,e.seq||0);},0);
  var p=projectEvents(_EVENTS);
  if(!p.db)return {ok:false};
  var keepSettings=DB.settings,keepProfile=DB.profile,keepRev=DB.revision||0;
  DB=p.db;
  /* The rebuilt record started at revision 0, so after a startup merge the saved record reported revision 0, and the
     next startup's choice between the IndexedDB copy and the older localStorage copy — decided by which revision is
     higher — could pick the stale one and lose every setting since its checkpoint. The revision never goes backwards. */
  DB.revision=Math.max(keepRev,DB.revision||0);
  /* Per-key precedence. This was Object.assign({}, keepSettings, projected), so the PROJECTED settings won — and a
     projection rebuilt from events carries only defaults for anything no event writes. Appearance is not
     event-sourced, so a person's light theme was replaced by the default dark one on every startup sync merge,
     while accent and font survived only because a fresh record has no default for them. That was the "appearance
     does not persist" bug. A projected value equal to the fresh-record default says nothing, so the live value
     wins; a projected value that differs came from events, so it wins. */
  var _defaults=emptyDB().settings,_proj=DB.settings||{},_merged=Object.assign({},keepSettings||{});
  Object.keys(_proj).forEach(function(k){if(JSON.stringify(_proj[k])!==JSON.stringify(_defaults[k]))_merged[k]=_proj[k];});
  DB.settings=_merged;
  DB.profile=Object.assign({},keepProfile,DB.profile||{});
  _memoInvalidate();
  return {ok:true,applied:p.applied,events:_EVENTS.length};
}
/* ---------- durability ----------
   Events are appended to their own IndexedDB shards, keyed by month like the collections, so the log is
   written incrementally rather than rewritten. */
var _eventsDirty={};
function persistEvents(){
  if(typeof _PERSIST_SUSPENDED!=='undefined'&&_PERSIST_SUSPENDED>0)return {shards:0,suspended:true};
  if(!_EVENTS.length)return {shards:0};
  var by={};_EVENTS.forEach(function(e){var k=String(e.at).slice(0,7);(by[k]=by[k]||[]).push(e);});
  var keys=Object.keys(by);var wrote=0;
  idbWrite('events:index',JSON.stringify(keys));
  keys.forEach(function(k){
    var s=JSON.stringify(by[k]);var d=_digest(s);
    if(_eventsDirty[k]===d)return;
    _eventsDirty[k]=d;idbWrite('events:'+k,s);wrote++;
  });
  return {shards:wrote,total:keys.length};
}
function loadEvents(){
  if(!_IDB)return Promise.resolve(null);
  return idbGet(_IDB,'events:index').then(function(raw){
    if(!raw)return null;
    var keys;try{keys=JSON.parse(raw);}catch(e){return null;}
    return Promise.all(keys.map(function(k){return idbGet(_IDB,'events:'+k);})).then(function(vals){
      var out=[];
      for(var i=0;i<vals.length;i++){if(vals[i]==null)continue;
        try{out=out.concat(JSON.parse(vals[i]));}catch(e){_q(e,'P1');}}
      return out;
    });
  }).catch(function(e){_q(e,'P1');return null;});
}
