/* ============================================================================
   ATTACHMENTS (catalogue doc 1, W-004, option B): progress photos as longitudinal records, durable and encrypted.

     photo → attachment id → content hash (SHA-256 of the image bytes) → encrypted local store (AES-GCM under a key
     generated on this device, never exported) → manifest (DB.attachments: id, hash, size, type, what it belongs to,
     when it was made and when it was retracted; synced as events) → encrypted cloud copy (re-encrypted under the vault
     key, in parts; the server stores ciphertext it cannot read) → encrypted backup (the passphrase backup carries the
     images) → restore.

   Images never enter an ordinary event or the record: the record holds the manifest, the bytes live in their own
   store. Which attachments this device holds, has uploaded or failed to upload is this device's working state, kept
   beside the bytes, not in the record and not synced.
   ============================================================================ */
var ATTACHMENT_FORMAT=1,ATTACHMENT_PART_BYTES=150000,ATTACHMENT_MAX_BYTES=8*1024*1024;
var ATTACHMENT_RETRY_MS=[60000,300000,1800000,7200000];   /* a failed upload is retried after 1 min, 5 min, 30 min, then every 2 h */
var _ATT_MEM={};          /* the store where there is no IndexedDB (a test, some private windows): this session only, and said so */
var _ATT_KEY=null,_ATT_STATE=null;
function attachmentsSupported(){return typeof crypto!=='undefined'&&!!crypto.subtle&&typeof crypto.getRandomValues==='function'&&typeof TextEncoder!=='undefined';}
function attachmentStoreKind(){return (typeof _IDB!=='undefined'&&_IDB)?'IndexedDB':'memory (this session only)';}
function _attHex(buf){return Array.prototype.map.call(new Uint8Array(buf),function(b){return ('0'+b.toString(16)).slice(-2);}).join('');}
function attachmentHash(bytes){return crypto.subtle.digest('SHA-256',bytes).then(_attHex);}
function _attGet(key){return (typeof _IDB!=='undefined'&&_IDB)?idbGet(_IDB,key):Promise.resolve(_ATT_MEM.hasOwnProperty(key)?_ATT_MEM[key]:null);}
function _attSet(key,val){if(typeof _IDB!=='undefined'&&_IDB)return idbSet(_IDB,key,val);_ATT_MEM[key]=val;return Promise.resolve(true);}
function _attDel(key){if(typeof _IDB!=='undefined'&&_IDB)return idbDel(_IDB,key);delete _ATT_MEM[key];return Promise.resolve(true);}
function _attKeys(){return ((typeof _IDB!=='undefined'&&_IDB)?idbKeys(_IDB):Promise.resolve(Object.keys(_ATT_MEM))).then(function(k){return k.filter(function(x){return /^att:/.test(String(x));}).map(function(x){return String(x).slice(4);});});}
/* the local key: generated once, not extractable, kept in the browser database beside the bytes it protects */
function attachmentKey(){if(_ATT_KEY)return Promise.resolve(_ATT_KEY);
  return _attGet('attkey:v1').then(function(k){if(k){_ATT_KEY=k;return k;}
    return crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']).then(function(nk){_ATT_KEY=nk;return _attSet('attkey:v1',nk).then(function(){return nk;});});});}
/* base64 without atob/btoa, which a worker or a DOM-free run may not have; RFC 4648, with padding */
var _B64='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function _attB64Enc(a){var s='',i;for(i=0;i+2<a.length;i+=3){var n=(a[i]<<16)|(a[i+1]<<8)|a[i+2];s+=_B64[n>>18&63]+_B64[n>>12&63]+_B64[n>>6&63]+_B64[n&63];}
  if(a.length-i===1){var m=a[i]<<16;s+=_B64[m>>18&63]+_B64[m>>12&63]+'==';}else if(a.length-i===2){var k=(a[i]<<16)|(a[i+1]<<8);s+=_B64[k>>18&63]+_B64[k>>12&63]+_B64[k>>6&63]+'=';}return s;}
function _attB64Dec(s){s=String(s).replace(/[^A-Za-z0-9+\/]/g,'');var out=new Uint8Array(Math.floor(s.length*3/4)),o=0,buf=0,bits=0;
  for(var i=0;i<s.length;i++){buf=(buf<<6)|_B64.indexOf(s[i]);bits+=6;if(bits>=8){bits-=8;out[o++]=(buf>>bits)&255;}}return out.subarray(0,o);}
function _dataUrlBytes(u){var m=/^data:([^;,]+)(;base64)?,(.*)$/.exec(String(u||''));if(!m)return null;
  if(m[2])return {type:m[1],bytes:_attB64Dec(m[3])};var t=decodeURIComponent(m[3]),a=new Uint8Array(t.length);for(var i=0;i<t.length;i++)a[i]=t.charCodeAt(i)&255;return {type:m[1],bytes:a};}
function _bytesDataUrl(type,bytes){return 'data:'+type+';base64,'+_attB64Enc(new Uint8Array(bytes));}

/* ---- the manifest: the record's part (owners: recordAttachment, retractAttachment) ---- */
function attachmentManifest(){return (DB.attachments||[]).filter(function(a){return !a.removedAt;});}
function attachmentById(id){return (DB.attachments||[]).filter(function(a){return a.id===id;})[0]||null;}
function recordAttachment(entry){var e={id:entry.id,kind:entry.kind||'photo',hash:entry.hash,bytes:entry.bytes,type:entry.type,format:ATTACHMENT_FORMAT,
    createdAt:entry.createdAt||nowISO(),ref:entry.ref||null,removedAt:null};
  if(attachmentById(e.id))return attachmentById(e.id);
  DB.attachments=(DB.attachments||[]).concat([e]);emitEvent('attachment.recorded',e);return e;}
function retractAttachment(id,reason){var i=(DB.attachments||[]).map(function(a){return a.id;}).indexOf(id);if(i<0)return null;
  var at=nowISO();DB.attachments[i]=Object.assign({},DB.attachments[i],{removedAt:at,removedReason:reason||'removed'});
  emitEvent('attachment.removed',{id:id,at:at,reason:reason||'removed'});return DB.attachments[i];}

/* ---- this device's working state: what it holds and what it has sent (never in the record) ---- */
function _attState(){if(_ATT_STATE)return Promise.resolve(_ATT_STATE);
  return _attGet('attstate:v1').then(function(s){_ATT_STATE=s&&typeof s==='object'?s:{remote:{}};_ATT_STATE.remote=_ATT_STATE.remote||{};return _ATT_STATE;});}
function _attSaveState(){return _attSet('attstate:v1',JSON.parse(JSON.stringify(_ATT_STATE||{remote:{}})));}
function attachmentRemoteState(id){return (_ATT_STATE&&_ATT_STATE.remote[id])||{state:'not sent'};}

/* ---- the bytes ---- */
function _attEncrypt(key,id,bytes){var iv=crypto.getRandomValues(new Uint8Array(12));
  return crypto.subtle.encrypt({name:'AES-GCM',iv:iv,additionalData:new TextEncoder().encode('att|'+id)},key,bytes).then(function(ct){return {iv:iv,ct:new Uint8Array(ct)};});}
function _attDecrypt(key,id,rec){return crypto.subtle.decrypt({name:'AES-GCM',iv:rec.iv,additionalData:new TextEncoder().encode('att|'+id)},key,rec.ct).then(function(p){return new Uint8Array(p);});}
/* store bytes under an id, checking them against the hash the manifest holds */
function storeAttachmentBytes(id,bytes,type,expectedHash){
  return attachmentHash(bytes).then(function(h){if(expectedHash&&h!==expectedHash)throw new Error('the image does not match its record (hash '+h.slice(0,12)+', expected '+String(expectedHash).slice(0,12)+')');
    return attachmentKey().then(function(key){return _attEncrypt(key,id,bytes);}).then(function(enc){
      return _attSet('att:'+id,{v:ATTACHMENT_FORMAT,iv:enc.iv,ct:enc.ct,hash:h,type:type,bytes:bytes.length}).then(function(){return h;});});});}
/* a new attachment: refuses a duplicate of a live one, and refuses when storage would run out */
function putAttachment(kind,dataUrl,ref,opts){opts=opts||{};
  if(!attachmentsSupported())return Promise.reject(new Error('encrypted storage needs the Web Crypto API, which requires a secure context (https or localhost)'));
  var d=_dataUrlBytes(dataUrl);if(!d)return Promise.reject(new Error('not an image'));
  if(d.bytes.length>ATTACHMENT_MAX_BYTES)return Promise.reject(new Error('the image is larger than '+Math.round(ATTACHMENT_MAX_BYTES/1048576)+' MB'));
  return attachmentHash(d.bytes).then(function(h){
    var dup=attachmentManifest().filter(function(a){return a.hash===h&&a.kind===kind;})[0];
    if(dup&&!opts.allowDuplicate)return {duplicateOf:dup.id,hash:h};
    return attachmentQuotaCheck(d.bytes.length).then(function(q){if(!q.ok)throw new Error(q.note);
      var id=opts.id||('att-'+h.slice(0,12)+'-'+uid('a').slice(-6).toLowerCase().replace(/[^a-z0-9]/g,''));
      return storeAttachmentBytes(id,d.bytes,d.type,h).then(function(){
        var e=recordAttachment({id:id,kind:kind,hash:h,bytes:d.bytes.length,type:d.type,ref:ref||null});
        return _attState().then(function(st){st.remote[id]={state:'pending',attempts:0};return _attSaveState();}).then(function(){return {id:e.id,hash:h,bytes:e.bytes,type:e.type};});});});});}
function readAttachment(id){var m=attachmentById(id);
  return _attGet('att:'+id).then(function(rec){if(!rec)return null;
    return attachmentKey().then(function(key){return _attDecrypt(key,id,rec);}).then(function(bytes){
      return attachmentHash(bytes).then(function(h){var want=(m&&m.hash)||rec.hash;
        if(h!==want){var err=new Error('attachment '+id+' does not match its hash: it was altered');_q(err,'P1');throw err;}
        return _bytesDataUrl(rec.type||(m&&m.type)||'image/jpeg',bytes);});});});}
/* retraction: the manifest keeps the entry, marked removed (a replay of an earlier day still sees it); the bytes go,
   here now and from the vault at the next sync */
function removeAttachment(id,reason){var r=retractAttachment(id,reason);
  return _attDel('att:'+id).then(function(){return _attState();}).then(function(st){var s=st.remote[id];
    st.remote[id]={state:s&&s.state==='uploaded'?'deleting':(s&&s.state==='pending'?'withdrawn':'deleting'),attempts:0};return _attSaveState();}).then(function(){return r;});}
/* quota: an attachment is refused rather than half-written when the browser says there is no room for it */
function attachmentQuotaCheck(bytes){
  var est=(typeof navigator!=='undefined'&&navigator.storage&&typeof navigator.storage.estimate==='function')?navigator.storage.estimate():Promise.resolve(null);
  return Promise.resolve(est).then(function(e){if(!e||!e.quota)return {ok:true,known:false,note:'the browser does not report its storage limit'};
    var need=Math.ceil(bytes*1.1)+4096,free=e.quota-(e.usage||0);
    return {ok:free>need,known:true,usage:e.usage||0,quota:e.quota,free:free,need:need,
      note:free>need?'room for it':'not enough storage on this device: '+Math.round(free/1024)+' KB free, '+Math.round(need/1024)+' KB needed. Free some space, or remove photos you no longer need.'};}).catch(function(){return {ok:true,known:false,note:'storage estimate failed'};});}
/* encryption verification: what is stored is ciphertext, it decrypts to the hash on record, and a changed byte is refused */
function verifyAttachment(id){var m=attachmentById(id);
  return _attGet('att:'+id).then(function(rec){if(!rec)return {id:id,stored:false};
    var ct=new Uint8Array(rec.ct),plainHead=[0xFF,0xD8,0xFF],looksPlain=ct[0]===plainHead[0]&&ct[1]===plainHead[1]&&ct[2]===plainHead[2];
    return attachmentKey().then(function(key){return _attDecrypt(key,id,rec).then(function(b){return attachmentHash(b).then(function(h){
        var t=new Uint8Array(ct);t[Math.floor(t.length/2)]^=0x01;
        return _attDecrypt(key,id,{iv:rec.iv,ct:t}).then(function(){return false;},function(){return true;}).then(function(tamperRefused){
          return {id:id,stored:true,ciphertext:!looksPlain&&ct.length===b.length+16,decrypts:true,hashMatches:!!m&&h===m.hash,tamperRefused:tamperRefused};});});},
      function(){return {id:id,stored:true,decrypts:false};});});});}

/* ---- audit: orphans, missing bytes, duplicates, uploads waiting or failed ---- */
function attachmentAuditOf(manifest,storedIds,photos,remote){
  var live=manifest.filter(function(a){return !a.removedAt;}),liveIds={},have={};live.forEach(function(a){liveIds[a.id]=1;});storedIds.forEach(function(k){have[k]=1;});
  var byHash={};live.forEach(function(a){(byHash[a.kind+'|'+a.hash]=byHash[a.kind+'|'+a.hash]||[]).push(a.id);});
  remote=remote||{};
  var missing=live.filter(function(a){return !have[a.id];}).map(function(a){return {id:a.id,inVault:!!(remote[a.id]&&remote[a.id].state==='uploaded')};});
  var livePhotos=(photos||[]).filter(function(p){return !p.removedAt;});
  return {live:live.length,stored:live.filter(function(a){return have[a.id];}).length,missing:missing,
    orphans:storedIds.filter(function(k){return !liveIds[k];}),
    duplicates:Object.keys(byHash).filter(function(h){return byHash[h].length>1;}).map(function(h){return byHash[h];}),
    photosWithoutImage:livePhotos.filter(function(p){return !p.attachmentId||!liveIds[p.attachmentId];}).map(function(p){return p.id;}),
    pendingUpload:live.filter(function(a){var r=remote[a.id];return !r||r.state==='pending';}).length,
    failedUpload:live.filter(function(a){var r=remote[a.id];return r&&r.state==='failed';}).map(function(a){return {id:a.id,attempts:remote[a.id].attempts,error:remote[a.id].lastError||null};}),
    inVault:live.filter(function(a){var r=remote[a.id];return r&&r.state==='uploaded';}).length};}
function attachmentAudit(){return Promise.all([_attKeys(),_attState()]).then(function(r){
  var a=attachmentAuditOf(DB.attachments||[],r[0],(DB.settings&&DB.settings.photos)||[],r[1].remote);a.store=attachmentStoreKind();return a;});}
/* an orphan (bytes with no live record) is removed only when asked, after the audit names it */
function removeOrphanAttachments(){return attachmentAudit().then(function(a){return Promise.all(a.orphans.map(function(id){return _attDel('att:'+id);})).then(function(){return {removed:a.orphans.length};});});}

/* ---- the encrypted cloud copy: parts under the vault key, uploaded, retried, deleted and restored ---- */
function _attPartsOf(id,bytes){var n=Math.max(1,Math.ceil(bytes.length/ATTACHMENT_PART_BYTES)),out=[];
  for(var i=0;i<n;i++)out.push({part:i+1,of:n,bytes:bytes.subarray(i*ATTACHMENT_PART_BYTES,(i+1)*ATTACHMENT_PART_BYTES)});return out;}
function _attVaultEncrypt(id,p){var iv=crypto.getRandomValues(new Uint8Array(12));
  return crypto.subtle.encrypt({name:'AES-GCM',iv:iv,additionalData:new TextEncoder().encode('att|'+id+'|'+p.part+'|'+p.of)},_vaultKey,p.bytes)
    .then(function(ct){return {id:id,part:p.part,of:p.of,iv:_attB64Enc(iv),ciphertext:_attB64Enc(new Uint8Array(ct))};});}
function _attVaultDecrypt(id,row){return crypto.subtle.decrypt({name:'AES-GCM',iv:_attB64Dec(row.iv),additionalData:new TextEncoder().encode('att|'+id+'|'+row.part+'|'+row.of)},_vaultKey,_attB64Dec(row.ciphertext))
  .then(function(b){return new Uint8Array(b);});}
function _attUpload(id){var m=attachmentById(id);
  return _attGet('att:'+id).then(function(rec){if(!rec)throw new Error('not on this device');
    return attachmentKey().then(function(key){return _attDecrypt(key,id,rec);});}).then(function(bytes){
    var parts=_attPartsOf(id,bytes);var send=function(i){if(i>=parts.length)return Promise.resolve(parts.length);
      return _attVaultEncrypt(id,parts[i]).then(function(row){return _api('/v1/attachments/part',{method:'POST',body:row});}).then(function(){return send(i+1);});};
    return send(0).then(function(n){return {parts:n,bytes:bytes.length,hash:m&&m.hash};});});}
function _attDownload(id){var m=attachmentById(id);
  return _api('/v1/attachments/part?id='+encodeURIComponent(id)+'&part=1',{method:'GET'}).then(function(first){
    var n=first.of||1,rows=[first];var next=function(i){if(i>n)return Promise.resolve();
      return _api('/v1/attachments/part?id='+encodeURIComponent(id)+'&part='+i,{method:'GET'}).then(function(r){rows.push(r);return next(i+1);});};
    return next(2).then(function(){return Promise.all(rows.map(function(r){return _attVaultDecrypt(id,r);}));}).then(function(chunks){
      var len=chunks.reduce(function(a,c){return a+c.length;},0),all=new Uint8Array(len),off=0;chunks.forEach(function(c){all.set(c,off);off+=c.length;});
      return storeAttachmentBytes(id,all,m&&m.type||'image/jpeg',m&&m.hash);});});}
/* after the events: send what is pending (and what failed, once its wait is over), delete what was retracted, fetch what
   this device lacks. Every failure is recorded with its attempt count and the next try, and the next sync resumes it. */
function cloudSyncAttachments(opts){opts=opts||{};
  if(cloudLocked()||!attachmentsSupported())return Promise.resolve({skipped:cloudLocked()?'the vault is locked':'no Web Crypto'});
  var out={uploaded:0,failed:0,deleted:0,downloaded:0,missing:0,waiting:0,errors:[]},now=Date.now();
  return Promise.all([_attState(),_attKeys()]).then(function(r){var st=r[0],have={};r[1].forEach(function(k){have[k]=1;});
    var live=attachmentManifest(),gone=(DB.attachments||[]).filter(function(a){return a.removedAt;});
    var ups=live.filter(function(a){var s=st.remote[a.id];if(!have[a.id])return false;if(!s||s.state==='pending'||s.state==='not sent')return true;
      if(s.state==='failed'){if(opts.force||!s.nextTryAt||s.nextTryAt<=now)return true;out.waiting++;}return false;});
    var dels=gone.filter(function(a){var s=st.remote[a.id];return !s||s.state==='uploaded'||s.state==='deleting';});
    var downs=live.filter(function(a){return !have[a.id];});
    var seq=function(list,fn){return list.reduce(function(p,a){return p.then(function(){return fn(a);});},Promise.resolve());};
    return seq(ups,function(a){return _attUpload(a.id).then(function(){st.remote[a.id]={state:'uploaded',attempts:((st.remote[a.id]||{}).attempts||0)+1,uploadedAt:nowISO()};out.uploaded++;},
        function(e){var k=((st.remote[a.id]||{}).attempts||0)+1;st.remote[a.id]={state:'failed',attempts:k,lastError:String(e&&e.message||e).slice(0,160),
          nextTryAt:now+ATTACHMENT_RETRY_MS[Math.min(k-1,ATTACHMENT_RETRY_MS.length-1)]};out.failed++;out.errors.push(a.id+': '+st.remote[a.id].lastError);});})
      .then(function(){return seq(dels,function(a){return _api('/v1/attachments/delete',{method:'POST',body:{id:a.id}}).then(function(){st.remote[a.id]={state:'deleted',at:nowISO()};out.deleted++;},
        function(e){out.errors.push(a.id+': '+String(e&&e.message||e).slice(0,160));});});})
      .then(function(){return seq(downs,function(a){return _attDownload(a.id).then(function(){st.remote[a.id]={state:'uploaded',attempts:0,restoredAt:nowISO()};out.downloaded++;},
        function(e){out.missing++;out.errors.push(a.id+': '+String(e&&e.message||e).slice(0,160));});});})
      .then(function(){return _attSaveState();}).then(function(){if(typeof auditAppend==='function')auditAppend('cloud.attachments',{uploaded:out.uploaded,failed:out.failed,deleted:out.deleted,downloaded:out.downloaded});return out;});});}

/* ---- backups: the encrypted backup carries the images; restoring one stores them again, checked ---- */
function attachmentsForBackup(){var live=attachmentManifest(),items=[],missing=[];
  return live.reduce(function(p,a){return p.then(function(){return readAttachment(a.id).then(function(u){if(!u){missing.push(a.id);return;}
      var d=_dataUrlBytes(u);items.push({id:a.id,hash:a.hash,type:d.type,bytes:d.bytes.length,data:u.slice(u.indexOf(',')+1)});},function(){missing.push(a.id);});});},Promise.resolve())
    .then(function(){return {items:items,missing:missing,complete:missing.length===0};});}
/* partial restore is reported, not hidden: each image is checked against its hash, and the ones that fail are named */
function restoreAttachmentsFromBackup(list){list=list||[];var out={restored:0,already:0,failed:[]};
  return _attKeys().then(function(keys){var have={};keys.forEach(function(k){have[k]=1;});
    return list.reduce(function(p,it){return p.then(function(){if(have[it.id]){out.already++;return;}
        var d=_dataUrlBytes('data:'+(it.type||'image/jpeg')+';base64,'+(it.data||''));if(!d){out.failed.push({id:it.id,why:'unreadable'});return;}
        return storeAttachmentBytes(it.id,d.bytes,d.type,it.hash).then(function(){out.restored++;},function(e){out.failed.push({id:it.id,why:String(e&&e.message||e)});});});},Promise.resolve());})
    .then(function(){return out;});}
/* what a backup holds of the visual history, accurately (the definition of done of W-004) */
function visualHistoryStatement(o){var n=o.count,inc=o.included||0;
  if(!n)return {count:0,imagesIncluded:0,completeVisualHistory:true,statement:'There are no progress photos, so nothing visual is left out.'};
  if(!o.withImages)return {count:n,imagesIncluded:0,completeVisualHistory:false,statement:'This backup holds the dates and poses of '+n+' progress photo'+(n===1?'':'s')+', not the images. An encrypted backup carries the images too.'};
  return {count:n,imagesIncluded:inc,completeVisualHistory:inc===n,
    statement:inc===n?('This encrypted backup holds all '+n+' progress photo'+(n===1?'':'s')+' with their images: the complete visual history.'):
      ('This encrypted backup holds '+inc+' of '+n+' progress photo images; '+(n-inc)+' '+(n-inc===1?'is':'are')+' not on this device, so the visual history in it is incomplete.')};}
/* erasing everything erases the images too: their bytes, this device's key for them and its transfer state, and any
   image stored before attachments. Undo of an erase brings back the record, not the images (an encrypted backup does). */
function eraseAllAttachments(){var n=0;
  return ((typeof _IDB!=='undefined'&&_IDB)?idbKeys(_IDB):Promise.resolve(Object.keys(_ATT_MEM))).then(function(keys){
    var gone=keys.map(String).filter(function(k){return /^(att:|photo:|attstate:|attkey:)/.test(k);});n=gone.filter(function(k){return /^(att:|photo:)/.test(k);}).length;
    return Promise.all(gone.map(function(k){return _attDel(k);}));}).then(function(){_ATT_KEY=null;_ATT_STATE=null;if(typeof _PHOTO_CACHE!=='undefined')_PHOTO_CACHE={};return {erased:n};});}
/* legacy photos (stored before attachments, as plain images under photo:<id>) move into the encrypted store */
function migrateLegacyPhotos(){if(!attachmentsSupported())return Promise.resolve({moved:0,skipped:'no Web Crypto'});
  var todo=((DB.settings&&DB.settings.photos)||[]).filter(function(p){return !p.removedAt&&!p.attachmentId;}),moved=0;
  return todo.reduce(function(pr,p){return pr.then(function(){return _attGet('photo:'+p.id).then(function(u){if(!u)return;
      return putAttachment('photo',u,{store:'photos',id:p.id},{allowDuplicate:true}).then(function(r){if(!r||!r.id)return;
        linkPhotoAttachment(p.id,r.id,r.hash);moved++;return _attDel('photo:'+p.id);});});});},Promise.resolve())
    .then(function(){if(moved)save('photo');return {moved:moved};});}
