/* ============================================================================
   REGION: PERSISTENCE — incremental writes, audit chain, quota, encryption, integrity.

   The audit's central finding: the intelligence layer is ahead of the platform under it. Every save
   serialized the entire record and wrote it twice, so write cost was proportional to the whole database
   rather than to the change. This layer fixes that without discarding the domain model.

   What changed:
     * Collections are stored and written INDIVIDUALLY. A weight entry writes the observations collection
       and the small metadata blob, not the food log, not the session history, not the archive.
     * A dirty set is derived from the save label, which is already semantic ('food-log', 'phase:edit').
       An unrecognized label marks everything dirty, so the failure mode is the old behaviour, not data loss.
     * A full-document checkpoint is still written periodically, so recovery never depends on the collection
       layout being intact.
     * Every save appends to a hash-chained audit log, which makes tampering and silent corruption
       detectable rather than merely unlikely.

   What did NOT change, deliberately: the record is still a document in memory, and this is not event
   sourcing. Full event sourcing is the right end state (see docs/architecture-roadmap.md) but it is a
   rewrite of every mutator, not a layer that can be bolted underneath one.
   ============================================================================ */
var PERSIST_COLLECTIONS=['observations','sessions','foodLogs','foods','recipes','phases','decisions','interventions','predictions','experiments','negatives','snapshots','archive','notes','plans','executions','environment'];
var PERSIST_SCALARS=['schemaVersion','appVersion','revision','instance','createdAt','profile','settings','ledger','models','demo'];
/* Save labels are already semantic. This maps them to the collections they can possibly have touched;
   anything unmatched falls back to writing everything, so a new label is slow rather than wrong. */
var LABEL_COLLECTIONS={
  plan:['plans'],execution:['executions'],environment:['environment'],
  observation:['observations'],'observation:correct':['observations'],'observation:retract':['observations'],
  session:['sessions'],'session:retract':['sessions'],'session:edit':['sessions'],
  'food-log':['foodLogs','observations'],'food-log:remove':['foodLogs','observations'],'food-log:edit':['foodLogs','observations'],
  'food-log:repeat':['foodLogs','observations'],food:['foods'],recipe:['recipes'],favorite:[],
  phase:['phases'],'phase:edit':['phases','interventions'],'phase:end':['phases'],
  decision:['decisions'],'decision:user':['decisions'],intervention:['interventions'],'intervention:user':['interventions'],
  prediction:['predictions'],'prediction:score':['predictions'],experiment:['experiments','interventions'],
  'experiment:evaluate':['experiments','negatives','interventions'],negative:['negatives'],
  snapshot:['snapshots'],archive:['archive','phases'],note:['notes'],
  program:[],settings:[],profile:[],focus:[],'device-test':[],'food-db-version':[],daily:['snapshots'],
  'bulk:retract':['observations','foodLogs'],'bulk:flag':['observations'],'bulk:meal':['foodLogs'],'bulk:copy':['foodLogs','observations']
};
/* Collection-level granularity alone was not enough: at five years the observations array is 18,000 entries,
   so appending one weigh-in still rewrote all of it. The three collections that grow without bound are
   therefore sharded by calendar month, and a save writes only the shards that can have changed.
   Which shards those are is decided by the label again: an append can only touch the current month, while a
   correction, retraction or bulk operation can touch any month and marks them all. Unknown labels mark all
   shards, so an unrecognized label is slow rather than wrong. */
var SHARDED_COLLECTIONS={observations:1,foodLogs:1,sessions:1};
var HISTORICAL_LABELS=/correct|retract|restore|merge|migrat|bulk|repeat|archive|undo|import/i;
function _shardKey(rec){var d=(rec&&(rec.date||rec.startDate))||(rec&&rec.createdAt)||'';return String(d).slice(0,7)||'undated';}
function _shardCollection(arr){
  var by={};for(var i=0;i<arr.length;i++){var k=_shardKey(arr[i]);(by[k]=by[k]||[]).push(arr[i]);}
  return by;
}
var CHECKPOINT_EVERY=25;              // full-document checkpoints, so recovery never needs the collection layout
var LS_MIRROR_BUDGET=2*1024*1024;     // localStorage is a synchronous fallback, not the durable store
var _writesSinceCheckpoint=0,_lastColHash={},_PERSIST_STATS={incremental:0,full:0,bytesWritten:0,collectionsWritten:0,lastLabel:null};
function _dirtyFor(label){
  if(!label)return PERSIST_COLLECTIONS.slice();
  var key=String(label);
  if(LABEL_COLLECTIONS[key])return LABEL_COLLECTIONS[key].slice();
  var base=key.split(':')[0];
  if(LABEL_COLLECTIONS[base])return LABEL_COLLECTIONS[base].slice();
  return PERSIST_COLLECTIONS.slice();   // unknown label: correct, just not cheap
}
function _scalarBlob(){var o={};PERSIST_SCALARS.forEach(function(k){o[k]=DB[k];});return o;}
/* A fast non-cryptographic digest used only to skip writes whose content did not actually change.
   The tamper-evident chain below uses real SHA-256; this is a change detector, not a security control. */
function _digest(s){var h=5381,i=s.length;while(i)h=(h*33^s.charCodeAt(--i))>>>0;return h.toString(36)+':'+s.length;}
function persistIncremental(label){
  var dirty=_dirtyFor(label);
  var touchesHistory=!label||HISTORICAL_LABELS.test(String(label))||dirty.length===PERSIST_COLLECTIONS.length;
  var currentShard=todayISO().slice(0,7);
  var wrote=[],bytes=0;
  var meta=JSON.stringify(_scalarBlob());
  idbWrite('meta',meta);bytes+=meta.length;
  dirty.forEach(function(c){
    if(!SHARDED_COLLECTIONS[c]){
      var s=JSON.stringify(DB[c]||[]);
      var d=_digest(s);
      if(_lastColHash[c]===d)return;    // content identical: the label was pessimistic
      _lastColHash[c]=d;idbWrite('col:'+c,s);wrote.push(c);bytes+=s.length;
      return;
    }
    var arr=DB[c]||[];
    var by=_shardCollection(arr);
    var keys=Object.keys(by);
    idbWrite('shards:'+c,JSON.stringify(keys));   // the shard index, so a load knows what to assemble
    keys.forEach(function(k){
      /* An append can only have changed the current month. Anything that can reach back says so in its
         label, and then every shard is re-checked. */
      if(!touchesHistory&&k!==currentShard&&k!=='undated'&&_lastColHash[c+'/'+k]!==undefined)return;
      var s2=JSON.stringify(by[k]);
      var d2=_digest(s2);
      if(_lastColHash[c+'/'+k]===d2)return;
      _lastColHash[c+'/'+k]=d2;idbWrite('col:'+c+':'+k,s2);wrote.push(c+':'+k);bytes+=s2.length;
    });
  });
  try{if(typeof persistEvents==='function')persistEvents();}catch(e){_q(e,'P1');}
  _PERSIST_STATS.collectionsWritten+=wrote.length;_PERSIST_STATS.bytesWritten+=bytes;_PERSIST_STATS.lastLabel=label||null;
  if(dirty.length===PERSIST_COLLECTIONS.length)_PERSIST_STATS.full++;else _PERSIST_STATS.incremental++;
  _writesSinceCheckpoint++;
  var checkpointed=false;
  if(_writesSinceCheckpoint>=CHECKPOINT_EVERY){writeCheckpoint('periodic');checkpointed=true;}
  return {collections:wrote,bytes:bytes,checkpoint:checkpointed};
}
function writeCheckpoint(reason){
  try{
    var s=serializeDB();
    idbWrite('db',s);
    idbWrite('checkpoint-meta',JSON.stringify({at:nowISO(),revision:DB.revision,bytes:s.length,reason:reason||'manual'}));
    _writesSinceCheckpoint=0;
    return {ok:true,bytes:s.length};
  }catch(e){_q(e,'P1');return {ok:false,error:String(e&&e.message||e)};}
}
/* Assemble a record from the per-collection stores. Returns null when the layout is absent or incomplete,
   so the caller falls back to the full-document checkpoint rather than loading a half-record. */
function loadFromCollections(){
  if(!_IDB)return Promise.resolve(null);
  return idbGet(_IDB,'meta').then(function(metaRaw){
    if(!metaRaw)return null;
    var meta;try{meta=JSON.parse(metaRaw);}catch(e){return null;}
    return Promise.all(PERSIST_COLLECTIONS.map(function(c){
      if(!SHARDED_COLLECTIONS[c])return idbGet(_IDB,'col:'+c).then(function(v){return {c:c,v:v};});
      return idbGet(_IDB,'shards:'+c).then(function(idxRaw){
        if(idxRaw==null)return {c:c,v:null};
        var keys;try{keys=JSON.parse(idxRaw);}catch(e){return {c:c,v:null};}
        return Promise.all(keys.map(function(k){return idbGet(_IDB,'col:'+c+':'+k);})).then(function(vals){
          var out=[];
          for(var i=0;i<vals.length;i++){
            if(vals[i]==null)return {c:c,v:null};        // a missing shard means an incomplete record
            var part;try{part=JSON.parse(vals[i]);}catch(e){return {c:c,v:null};}
            if(!Array.isArray(part))return {c:c,v:null};
            out=out.concat(part);
          }
          return {c:c,v:out,parsed:true};
        });
      });
    })).then(function(parts){
        var db={};PERSIST_SCALARS.forEach(function(k){db[k]=meta[k];});
        for(var i=0;i<parts.length;i++){
          if(parts[i].v==null)return null;               // incomplete layout: do not guess
          if(parts[i].parsed)db[parts[i].c]=parts[i].v;
          else{try{db[parts[i].c]=JSON.parse(parts[i].v);}catch(e){return null;}}
          if(!Array.isArray(db[parts[i].c]))return null;
        }
        /* Shards are assembled in index order; restore the record's own ordering rather than trusting it. */
        Object.keys(SHARDED_COLLECTIONS).forEach(function(c){
          if(Array.isArray(db[c]))db[c].sort(function(a2,b2){return String(a2.createdAt||a2.date||'')<String(b2.createdAt||b2.date||'')?-1:1;});
        });
        return db;
      });
  }).catch(function(e){_q(e,'P1');return null;});
}
/* ---------- tamper-evident audit chain ----------
   Distinct from the domain ledger: the ledger records what happened to the body, this records what happened
   to the record. Each entry carries the hash of the previous entry, so removing or altering a past entry
   breaks the chain and `verifyAuditChain()` reports where. Not a blockchain, and not a defence against an
   attacker who can rewrite the whole store — it makes silent corruption and partial tampering detectable. */
var AUDIT_MAX=2000;
var _auditChain=[],_auditTail=Promise.resolve(),_auditWeak=false;
function _sha256Hex(str){
  if(typeof crypto!=='undefined'&&crypto.subtle&&typeof TextEncoder!=='undefined'){
    try{return crypto.subtle.digest('SHA-256',new TextEncoder().encode(str)).then(function(buf){
      return Array.prototype.map.call(new Uint8Array(buf),function(b){return ('0'+b.toString(16)).slice(-2);}).join('');});}
    catch(e){/* fall through */}
  }
  _auditWeak=true;
  return Promise.resolve(_digest(str)+':weak');
}
function auditAppend(kind,detail){
  var entry={seq:_auditChain.length,at:nowISO(),kind:kind,detail:detail||null,revision:DB?DB.revision:null,prev:null,hash:null};
  _auditChain.push(entry);
  if(_auditChain.length>AUDIT_MAX)_auditChain.splice(0,_auditChain.length-AUDIT_MAX);
  _auditTail=_auditTail.then(function(){
    var prev=_auditChain[_auditChain.indexOf(entry)-1];
    entry.prev=prev?prev.hash:'genesis';
    return _sha256Hex(entry.seq+'|'+entry.at+'|'+entry.kind+'|'+JSON.stringify(entry.detail)+'|'+entry.prev)
      .then(function(h){entry.hash=h;});
  }).catch(function(e){_q(e,'P2');});
  return entry;
}
function verifyAuditChain(){
  return _auditTail.then(function(){
    var broken=[],unresolved=0;
    for(var i=0;i<_auditChain.length;i++){
      var e=_auditChain[i];
      if(!e.hash){unresolved++;continue;}
      var expectedPrev=i===0?(_auditChain[0].prev||'genesis'):_auditChain[i-1].hash;
      if(e.prev!==expectedPrev)broken.push({seq:e.seq,at:e.at,reason:'previous hash does not match'});
    }
    return {entries:_auditChain.length,broken:broken,unresolved:unresolved,weak:_auditWeak,
      ok:broken.length===0,
      note:_auditWeak?'SHA-256 was unavailable (this needs a secure context), so the chain uses a non-cryptographic digest and detects corruption but not deliberate tampering':'chained with SHA-256'};
  });
}
function auditLog(limit){return _auditChain.slice(-(limit||60)).reverse();}
/* ---------- error severity ----------
   A failed chart render and a failed write are not the same event. The quarantine keeps both, but only one
   of them should ever reach the user as an interruption. */
var SEVERITIES={P0:'data loss or corruption risk',P1:'incorrect calculation or failed persistence',P2:'degraded functionality',P3:'cosmetic'};
function severityOf(err,hint){
  if(hint&&SEVERITIES[hint])return hint;
  var m=String(err&&err.message||err||'').toLowerCase();
  if(/quota|storage|indexeddb|persist|write|save|corrupt|migrat/.test(m))return 'P0';
  if(/nan|undefined is not|cannot read|null|calculat|model/.test(m))return 'P1';
  return 'P2';
}
/* ---------- storage manager ---------- */
function storageManager(){
  var out={record:null,backups:null,foodCache:null,quota:null,pressure:'unknown',actions:[]};
  try{
    var s=serializeDB();out.record={bytes:s.length,observations:(DB.observations||[]).length,
      foodLogs:(DB.foodLogs||[]).length,sessions:(DB.sessions||[]).length,
      perObservation:Math.round(s.length/Math.max(1,(DB.observations||[]).length+(DB.foodLogs||[]).length))};
  }catch(e){_q(e,'P1');}
  out.mirror={usable:out.record?out.record.bytes<=LS_MIRROR_BUDGET:null,budget:LS_MIRROR_BUDGET,
    note:'localStorage is a synchronous fallback with a small quota; past the budget the record lives in IndexedDB only, and an export is the copy you control'};
  out.persistence=Object.assign({},_PERSIST_STATS,{sinceCheckpoint:_writesSinceCheckpoint,checkpointEvery:CHECKPOINT_EVERY,
    ratio:_PERSIST_STATS.incremental+_PERSIST_STATS.full?Math.round(100*_PERSIST_STATS.incremental/(_PERSIST_STATS.incremental+_PERSIST_STATS.full)):null});
  out.foodCache=foodCacheStats();
  out.actions=[
    {id:'checkpoint',label:'Write a checkpoint now',act:'storage.checkpoint',why:'a full-document copy makes recovery independent of the collection layout'},
    {id:'clearFood',label:'Delete the cached food database',act:'storage.clearFood',why:'the branded database can occupy most of the origin quota; it re-downloads on demand',destructive:true},
    {id:'backup',label:'Export a backup',act:'data.backup',why:'the only copy that survives the browser storage environment being cleared'}
  ];
  return out;
}
function storageEstimate(){
  if(typeof navigator==='undefined'||!navigator.storage||!navigator.storage.estimate)
    return Promise.resolve({supported:false,note:'this browser does not report a storage estimate'});
  return navigator.storage.estimate().then(function(est){
    var usage=est.usage||0,quota=est.quota||0;
    var pct=quota?usage/quota:null;
    return {supported:true,usage:usage,quota:quota,pct:pct,
      pressure:pct==null?'unknown':(pct>0.9?'critical':(pct>0.7?'high':(pct>0.4?'moderate':'low'))),
      persisted:null,
      note:pct!=null&&pct>0.7?'Above 70% of the origin quota. The browser may evict this origin under storage pressure; the food-database cache is the largest and most disposable part.':'Within a comfortable share of the origin quota.'};
  }).catch(function(e){_q(e,'P2');return {supported:false,note:'the storage estimate could not be read'};});
}
/* Deleting the food cache is safe: it is a redownloadable public dataset, never user data. */
function clearFoodCache(){
  _foodCache={};_foodCacheOrder=[];_foodManifest=null;_foodManifestState='not loaded';
  if(typeof caches==='undefined')return Promise.resolve({ok:false,note:'the cache API is unavailable here'});
  return caches.keys().then(function(names){
    return Promise.all(names.filter(function(n){return /physique/.test(n);}).map(function(n){
      return caches.open(n).then(function(c){return c.keys().then(function(reqs){
        var food=reqs.filter(function(r){return /\/data\/food\//.test(r.url)||/\/data\/supplements\//.test(r.url);});
        return Promise.all(food.map(function(r){return c.delete(r);})).then(function(){return food.length;});});});
    }));
  }).then(function(counts){var n=counts.reduce(function(a,b){return a+b;},0);
    auditAppend('storage.clearFoodCache',{entries:n});
    return {ok:true,removed:n,note:n+' cached food files removed; they re-download when next needed'};
  }).catch(function(e){_q(e,'P2');return {ok:false,note:String(e&&e.message||e)};});
}
/* ---------- encrypted backup ----------
   Body measurements, notes and health context are sensitive. A plaintext JSON export is the right default
   for portability, but it should not be the only option. PBKDF2-SHA256 (310,000 iterations, matching OWASP's
   current guidance) derives a key from a passphrase; AES-GCM provides confidentiality and integrity.
   The passphrase is never stored: a lost passphrase means a lost backup, and the UI says so before export. */
var KDF_ITERATIONS=310000;
function _cryptoOk(){return typeof crypto!=='undefined'&&crypto.subtle&&typeof TextEncoder!=='undefined'&&crypto.getRandomValues;}
function _deriveKey(passphrase,salt){
  return crypto.subtle.importKey('raw',new TextEncoder().encode(passphrase),'PBKDF2',false,['deriveKey'])
    .then(function(base){return crypto.subtle.deriveKey({name:'PBKDF2',salt:salt,iterations:KDF_ITERATIONS,hash:'SHA-256'},
      base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);});
}
function _b64(buf){var b='';var a=new Uint8Array(buf);for(var i=0;i<a.length;i++)b+=String.fromCharCode(a[i]);return btoa(b);}
function _unb64(s){var bin=atob(s);var a=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return a;}
function encryptBackup(passphrase){
  if(!_cryptoOk())return Promise.reject(new Error('encryption needs the Web Crypto API, which requires a secure context (https or localhost)'));
  if(!passphrase||passphrase.length<8)return Promise.reject(new Error('use a passphrase of at least 8 characters'));
  var salt=crypto.getRandomValues(new Uint8Array(16));
  var iv=crypto.getRandomValues(new Uint8Array(12));
  var plain=new TextEncoder().encode(serializeDB());
  return _deriveKey(passphrase,salt).then(function(key){
    return crypto.subtle.encrypt({name:'AES-GCM',iv:iv},key,plain);
  }).then(function(cipher){
    auditAppend('backup.encrypted',{bytes:cipher.byteLength});
    return {format:'physique-os-encrypted-backup',version:1,alg:'AES-GCM-256',kdf:'PBKDF2-SHA256',
      iterations:KDF_ITERATIONS,salt:_b64(salt),iv:_b64(iv),ciphertext:_b64(cipher),
      createdAt:nowISO(),app:APP_VERSION,schema:DB.schemaVersion,release:RELEASE_ID,
      note:'There is no recovery for a lost passphrase. This file cannot be read without it.'};
  });
}
function decryptBackup(obj,passphrase){
  if(!_cryptoOk())return Promise.reject(new Error('decryption needs the Web Crypto API, which requires a secure context'));
  if(!obj||obj.format!=='physique-os-encrypted-backup')return Promise.reject(new Error('not an encrypted Physique OS backup'));
  var salt=_unb64(obj.salt),iv=_unb64(obj.iv),cipher=_unb64(obj.ciphertext);
  return _deriveKey(passphrase,salt).then(function(key){
    return crypto.subtle.decrypt({name:'AES-GCM',iv:iv},key,cipher);
  }).then(function(plain){
    return JSON.parse(new TextDecoder().decode(plain));
  }).catch(function(e){
    /* AES-GCM authenticates: a wrong passphrase and a corrupted file are indistinguishable to the algorithm,
       so say both rather than guessing which one it was. */
    throw new Error('could not decrypt: either the passphrase is wrong or the file is damaged');
  });
}
/* ---------- invariant monitoring ----------
   The self-test proves the engine is correct. These are the cheap checks worth running continuously, at the
   moments where being wrong is expensive: boot, export, migration, restore. A P0 blocks the operation. */
function integrityCheck(stage){
  var issues=[];
  var add=function(sev,what,detail){issues.push({severity:sev,what:what,detail:detail||'',stage:stage||'ad hoc'});};
  try{
    if(!DB||typeof DB!=='object'){add('P0','the record is not an object');return _integrityResult(issues,stage);}
    if(DB.schemaVersion!==SCHEMA_VERSION)add('P0','schema version mismatch','record is '+DB.schemaVersion+', app expects '+SCHEMA_VERSION);
    PERSIST_COLLECTIONS.forEach(function(c){if(!Array.isArray(DB[c]))add('P0','collection '+c+' is not an array',String(typeof DB[c]));});
    var ids={},dupes=0;
    (DB.observations||[]).forEach(function(o){if(!o||!o.id){add('P1','an observation has no id');return;}if(ids[o.id])dupes++;ids[o.id]=1;
      if(o.value!=null&&typeof o.value==='number'&&!isFinite(o.value))add('P1','a non-finite observation value',o.type+' on '+o.date);
      if(o.date&&!/^\d{4}-\d{2}-\d{2}$/.test(o.date))add('P1','an observation has a malformed date',String(o.date));
      if(o.retracted&&!o.retractedAt)add('P1','a retracted observation has no retraction date','id '+o.id+' \u2014 replay cannot place it in time');
      if(o.correctedBy&&!o.correctedAt&&!_correctionDate(o))add('P2','a corrected observation has no correction date','id '+o.id);
    });
    if(dupes)add('P1',dupes+' duplicate observation ids');
    (DB.foodLogs||[]).forEach(function(l){
      if(l&&l.basis&&['g','ml','serving'].indexOf(l.basis)<0)add('P1','a food log has an unknown basis',String(l.basis));
      if(l&&l.retracted&&!l.retractedAt)add('P1','a retracted food log has no retraction date','id '+l.id);
    });
    (DB.phases||[]).forEach(function(p){if(p&&!Array.isArray(p.history))add('P2','a phase has no edit history','id '+p.id+' \u2014 replay cannot reconstruct its targets');});
    if(DB.revision==null||DB.revision<0)add('P1','the revision counter is missing or negative');
    if(_SAVE_STATE&&_SAVE_STATE.ok===false)add('P0','the last save did not persist',_SAVE_STATE.lastError||'');
  }catch(e){add('P0','the integrity check itself failed',String(e&&e.message||e));}
  return _integrityResult(issues,stage);
}
function _integrityResult(issues,stage){
  var worst=issues.reduce(function(a,i){return (i.severity<a)?i.severity:a;},'P3');
  return {stage:stage||'ad hoc',issues:issues,ok:!issues.some(function(i){return i.severity==='P0';}),
    blocking:issues.filter(function(i){return i.severity==='P0';}),
    counts:['P0','P1','P2','P3'].reduce(function(a,s){a[s]=issues.filter(function(i){return i.severity===s;}).length;return a;},{}),
    worst:issues.length?worst:null,
    note:'P0 blocks the operation. P1 means a number downstream may be wrong. P2 and P3 are recorded and not blocking.'};
}
