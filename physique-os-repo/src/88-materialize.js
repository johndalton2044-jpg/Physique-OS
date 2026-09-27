/* ============================================================================
   REGION: ANALYTICAL MATERIALIZATION (ConBWork.md)

   The canonical policy the document asks for:

     raw event log → historical projection → analytical materialization → dependency invalidation

   The first two exist. This adds the third and wires it to the fourth.

   A note on why this is built with a benchmark attached. A cache that is never measured is a bet that
   recomputation is expensive, and on a record of this size that bet may simply be wrong — in which case the
   cache costs storage, adds a staleness failure mode, and buys nothing. So `materializationBenefit()` times
   both paths and reports whether the layer is earning its keep. If it is not, that is a finding about this
   architecture rather than a reason to hide the measurement.

   The part that is unambiguously worth having regardless of speed is RESTATEMENT: when a correction changes
   an input, every historical analytical output derived from the old value is now wrong, and the system
   should be able to say which ones and by how much. Without materialization there is no record of what was
   previously concluded, so nothing can be restated — only silently recomputed.
   ============================================================================ */

var MATERIALIZED_VIEWS={
  tdee:{fn:'tdeePersonal',dependsOn:['dailyIntake','weightTrend','tissueDensity'],pick:'value'},
  weightTrend:{fn:'weightTrend',args:[14],dependsOn:['weightObservation'],pick:'slopePerWeek'},
  energyBalance:{fn:'energyBalance',dependsOn:['dailyIntake','tdee'],pick:'balance'},
  readiness:{fn:'readinessState',dependsOn:['fatigue'],pick:'score'},
  unifiedRecovery:{fn:'unifiedRecovery',dependsOn:['readiness','trainingLoad'],pick:'score'},
  trainingLoad:{fn:'trainingLoad',dependsOn:['sessionLog'],pick:'ratio'},
  adherence:{fn:'adherenceState',args:[14],dependsOn:['dailyIntake'],pick:'overall'}
};
function _materialStore(){
  DB.settings.materialized=DB.settings.materialized||{};
  return DB.settings.materialized;
}
/* ---------------- content addressing ----------------
   The identity used record COUNTS. Correcting a weight from 200 to 190 leaves every count identical, so the
   identity was unchanged and the cache served the old answer — reproduced as −1.74 against a true −2.10.
   Counting rows tells you how many there are, not what they say.

   Identity is now a hash of the actual content that feeds each view, so the same data gives the same
   identity and changed data gives a different one, without every mutation having to remember to invalidate
   anything. Manual invalidation still exists and still helps; it is no longer what correctness depends on. */
function _contentHash(kind){
  /* Computed from the content every time, NOT memoised on an event counter. The first version of this fix
     cached the hash keyed on _EVENTS.length, which reintroduced exactly the bug it was meant to close: an
     in-place edit emits no event, so the counter did not move, so the stale hash was returned and the stale
     value served. A content hash memoised on something that is not the content is not a content hash.

     The cost is a string build over the record on each call. The benchmark says the whole cache saves about
     six milliseconds, so correctness plainly outranks it here. */
  var p={};
  {
    /* Hash the fields that actually enter a calculation — not ids or timestamps, which change without
       changing any answer. */
    p.observations=_hash((DB.observations||[]).map(function(o){
      return o.type+':'+o.date+':'+o.value+':'+(o.removedAt||'')+':'+(o.supersededBy||'');}).join('|'));
    p.sessions=_hash((DB.sessions||[]).map(function(s2){
      return s2.date+':'+(s2.sets||[]).map(function(st){
        return st.exercise+','+st.load+','+st.reps+','+st.rir+','+(st.kind||'');}).join(';');}).join('|'));
    p.foodLogs=_hash((DB.foodLogs||[]).map(function(l){
      var n=l.nutrients||{};return l.date+':'+(n.kcal||0)+','+(n.protein||0)+','+(n.carbs||0)+','+(n.fat||0);}).join('|'));
    p.phases=_hash((DB.phases||[]).map(function(x){
      return x.type+':'+x.startDate+':'+(x.endDate||'')+':'+(x.calorieTarget||'');}).join('|'));
    p.profile=_hash(JSON.stringify(prof()||{}));
    p.reference=_hash(String(typeof BUILD_ID!=='undefined'?BUILD_ID:'')+':'+
      String((DB.settings&&DB.settings.foodOverrides)?Object.keys(DB.settings.foodOverrides).length:0));
  }
  return kind?p[kind]:_hash(Object.keys(p).sort().map(function(k){return k+'='+p[k];}).join('|'));
}
/* Which content each view's answer can actually depend on. Hashing everything would make every view
   invalidate on every change, which is correct but throws away the whole point of caching. */
var VIEW_CONTENT={
  tdee:['observations','foodLogs','phases','profile','reference'],
  weightTrend:['observations'],
  energyBalance:['observations','foodLogs','phases','profile','reference'],
  readiness:['observations'],
  unifiedRecovery:['observations','sessions','phases'],
  trainingLoad:['sessions','observations'],
  adherence:['foodLogs','phases','observations']
};
function _viewIdentity(name){
  var v=MATERIALIZED_VIEWS[name];
  if(!v)return null;
  var kinds=VIEW_CONTENT[name]||['observations','sessions','foodLogs','phases','profile','reference'];
  var content={};
  kinds.forEach(function(k){content[k]=_contentHash(k);});
  /* As-of is in there because a replay must never read a present-day cache entry. */
  return runIdentity({model:v.fn,asOf:asOf(),
    inputs:{args:v.args||[],content:content},
    params:{view:name},
    dependencies:v.dependsOn}).runId;
}
function materialize(name,opts){
  opts=opts||{};
  var v=MATERIALIZED_VIEWS[name];
  if(!v)return {status:'unknown-view',name:name};
  var g=(typeof window!=='undefined')?window:{};
  if(typeof g[v.fn]!=='function')return {status:'no-model',name:name,fn:v.fn};
  var store=_materialStore();
  var id=_viewIdentity(name);
  var hit=store[name];
  if(!opts.force&&hit&&hit.identity===id&&!hit.stale)
    return {status:'cached',name:name,value:hit.value,identity:id,
      computedAt:hit.computedAt,
      note:'Served from the materialized store: nothing it depends on has changed since it was computed.'};
  var out=null;try{out=g[v.fn].apply(null,v.args||[]);}catch(e){
    return {status:'error',name:name,error:String(e&&e.message||e)};}
  var val=out&&v.pick!=null?out[v.pick]:out;
  var prev=hit?hit.value:null;
  store[name]={identity:id,value:val,computedAt:nowISO(),asOf:asOf(),
    stale:false,previous:prev,
    changed:prev!=null&&String(prev)!==String(val)};
  return {status:'computed',name:name,value:val,identity:id,
    previous:prev,changed:store[name].changed,
    note:prev!=null&&store[name].changed?
      ('Recomputed and CHANGED from '+prev+' to '+val+'. Anything that read the old value is now out of date.'):
      'Recomputed.'};
}
function materializeAll(opts){
  var rows=Object.keys(MATERIALIZED_VIEWS).map(function(n){return materialize(n,opts);});
  return {rows:rows,
    computed:rows.filter(function(r){return r.status==='computed';}).length,
    cached:rows.filter(function(r){return r.status==='cached';}).length,
    changed:rows.filter(function(r){return r.changed;}).map(function(r){return r.name;}),
    cls:'DERIVED',
    note:'Every materialized view brought up to date, with which of them actually changed.'};
}
/* ---------------- invalidation, wired ---------------- */
function invalidateViews(changedNode){
  var plan=invalidationPlan(changedNode);
  var store=_materialStore();
  var marked=[];
  var affected=(plan.status==='ok')?plan.affected:[];
  Object.keys(MATERIALIZED_VIEWS).forEach(function(n){
    var v=MATERIALIZED_VIEWS[n];
    var touched=(v.dependsOn||[]).some(function(d){return d===changedNode||affected.indexOf(d)>=0;})||
                affected.indexOf(n)>=0;
    if(touched&&store[n]){store[n].stale=true;marked.push(n);}
  });
  return {changed:changedNode,invalidated:marked,count:marked.length,
    downstream:affected,cls:'DERIVED',
    note:marked.length?
      ('Marked stale: '+marked.join(', ')+'. They are not deleted, because the previous value is what makes restatement possible.'):
      'No materialized view depends on that.',
    caveat:'Marking stale says a value MIGHT have changed. Only recomputing says whether it did.'};
}
/* ---------------- restatement ----------------
   The part worth having regardless of speed: say what was previously concluded, what it is now, and whether
   the difference would have changed a decision. */
function restatement(changedNode){
  var before={};
  Object.keys(MATERIALIZED_VIEWS).forEach(function(n){
    var s=_materialStore()[n];
    if(s)before[n]=s.value;});
  var inv=invalidateViews(changedNode);
  var after=materializeAll({force:true});
  var rows=[];
  Object.keys(MATERIALIZED_VIEWS).forEach(function(n){
    var s=_materialStore()[n];
    if(!s||before[n]===undefined)return;
    if(String(before[n])===String(s.value))return;
    rows.push({view:n,was:before[n],now:s.value,
      delta:(typeof before[n]==='number'&&typeof s.value==='number')?round(s.value-before[n],3):null});
  });
  /* Does the restatement reach a decision? That is the question that decides whether it needs telling. */
  var reaches=inv.downstream.indexOf('decision')>=0;
  return {status:'ok',cls:'DERIVED',changed:changedNode,
    invalidated:inv.invalidated,restated:rows,count:rows.length,
    reachesDecision:reaches,
    note:rows.length?
      (rows.length+' previously-reported figure(s) changed. '+
       (reaches?'This chain reaches the decision, so a conclusion you were shown may no longer hold.':
        'This does not reach the decision.')):
      'Nothing previously reported changed, so nothing needs restating \u2014 which is worth confirming rather than assuming.',
    caveat:'Restatement only covers quantities that were materialized. Anything computed on the fly and shown once left no record, so it cannot be restated and may still be stale in someone\u2019s memory.'};
}
/* ---------------- does the cache earn its keep? ----------------
   Measured rather than assumed. A cache that is never benchmarked is a bet that recomputation is expensive. */
function materializationBenefit(opts){
  opts=opts||{};
  var reps=opts.reps||3;
  var names=Object.keys(MATERIALIZED_VIEWS);
  var t0=Date.now();
  for(var i=0;i<reps;i++)names.forEach(function(n){materialize(n,{force:true});});
  var coldMs=(Date.now()-t0)/reps;
  materializeAll();
  var t1=Date.now();
  for(var j=0;j<reps;j++)names.forEach(function(n){materialize(n);});
  var warmMs=(Date.now()-t1)/reps;
  var saved=coldMs-warmMs;
  var store=_materialStore();
  var bytes=JSON.stringify(store).length;
  return {status:'ok',cls:'MEASURED',
    views:names.length,reps:reps,
    coldMs:round(coldMs,1),warmMs:round(warmMs,1),
    savedMs:round(saved,1),
    speedup:warmMs>0?round(coldMs/warmMs,1):null,
    storeBytes:bytes,
    worthwhile:saved>=8,
    verdict:saved>=8?
      ('Recomputing every view costs about '+round(coldMs,1)+' ms against '+round(warmMs,1)+
       ' ms from the store, so the layer is earning its keep.'):
      ('Recomputing every view costs about '+round(coldMs,1)+' ms and the store saves roughly '+
       round(saved,1)+' ms. On a record this size the cache is buying almost nothing, and it adds a staleness failure mode that recomputation does not have.'),
    note:'Timed rather than assumed. The value of materialization here is restatement \u2014 knowing what was previously concluded \u2014 more than speed.',
    caveat:'Measured on this record on this device. A record ten times the size would change the answer, which is the case the layer exists for.'};
}
/* Materialized state is per-device working state rather than record, so it is excluded from export and
   never synced \u2014 a cache that travels between devices is a cache that goes stale in two places. */
function materializationStatus(){
  var store=_materialStore();
  var rows=Object.keys(MATERIALIZED_VIEWS).map(function(n){
    var s=store[n];
    return {view:n,present:!!s,stale:s?!!s.stale:null,
      value:s?s.value:null,computedAt:s?s.computedAt:null,
      asOf:s?s.asOf:null,
      validForNow:s?(s.identity===_viewIdentity(n)&&!s.stale):false};
  });
  return {rows:rows,
    materialized:rows.filter(function(r){return r.present;}).length,
    stale:rows.filter(function(r){return r.stale;}).length,
    valid:rows.filter(function(r){return r.validForNow;}).length,
    cls:'MEASURED',
    note:'Working state for this device, not part of the record. It is never exported and never synced, because a cache that travels between devices goes stale in two places instead of one.'};
}
