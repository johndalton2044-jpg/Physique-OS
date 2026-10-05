/* ============================================================================
   REGION: CLOUD SYNC — the client half of an end-to-end encrypted vault.

   The server (server/server.mjs) is a mailbox that cannot read its mail. Everything that makes that true
   happens here:

     * The RECOVERY PHRASE is the only secret. From it, deterministically:
         vault id      = SHA-256(phrase + "id")     — public, identifies the mailbox
         vault key     = PBKDF2(phrase, salt=SHA-256(phrase+"salt"), 310k) — never leaves this device
       The phrase itself is never transmitted, never stored on the server, and is not recoverable. A service
       that could recover it would be a service that could read the data.
     * Every event is encrypted with AES-GCM under the vault key before upload. The server receives base64
       and a nonce.
     * Each device holds an ECDSA P-256 key pair. Authentication is a signature over a server challenge, so
       there is no password to leak and nothing replayable on the wire.

   WHAT THE SERVER STILL LEARNS, said plainly rather than buried: that a vault exists, how many events it
   holds, their sizes, and when they arrive. That metadata is unavoidable for any sync service and is
   disclosed here rather than glossed over.
   ============================================================================ */
/* A SAME-ORIGIN PATH, not a host. The app ships with connect-src 'self', so an external sync origin is
   blocked by its own policy — and an HTTPS page cannot call http://127.0.0.1 anyway under mixed-content
   rules. The supported deployment is therefore a reverse proxy: /api/sync on the app's own origin, forwarded
   to server/server.mjs. Running the app from localhost for development still works, because there the app's
   origin IS localhost. */
var CLOUD_DEFAULT_URL='/api/sync';
var _cloud={status:'not configured',token:null,tokenExp:0,busy:false,lastError:null};
/* The app can only reach its own site (connect-src 'self'), so a server address on another site — the Render URL typed on a
   second device — fails with a bare "Failed to fetch". It is replaced with /api/sync, which the deployment forwards to
   the server, and the replacement is reported. */
/* Replaced only when the page's own policy does not allow the address: a build made with --sync-origin adds that server
   to connect-src, and it must still be used. (jsdom, the test harness, does not enforce the policy.) */
function _cspAllows(origin){try{if(typeof navigator!=='undefined'&&/jsdom/i.test(navigator.userAgent||''))return true;
  var m=typeof document!=='undefined'&&document.querySelector('meta[http-equiv="Content-Security-Policy"]');if(!m)return true;
  var c=(String(m.getAttribute('content')).match(/connect-src([^;]*)/)||[])[1];if(!c)return true;return c.split(/\s+/).indexOf(origin)>=0;}catch(e){return true;}}
function _sameSiteServerUrl(u){if(!u)return CLOUD_DEFAULT_URL;var s=String(u);if(s.charAt(0)==='/')return s;
  try{var o=new URL(s).origin;if((typeof window!=='undefined'&&window.location&&o===window.location.origin)||_cspAllows(o))return s;}catch(e){}
  _cloud.urlReplaced=s;return CLOUD_DEFAULT_URL;}
function cloudConfig(){
  var s=DB.settings.cloud||{};
  return {url:s.url||CLOUD_DEFAULT_URL,vaultId:s.vaultId||null,enabled:!!s.enabled,
    lastPullSeq:s.lastPullSeq||0,lastSyncAt:s.lastSyncAt||null,pushedIds:s.pushedIds||[]};
}
function cloudState(){
  var c=cloudConfig();
  return {configured:!!c.vaultId,enabled:c.enabled,url:c.url,vaultId:c.vaultId,
    status:_cloud.status,lastError:_cloud.lastError,lastSyncAt:c.lastSyncAt,lastPullSeq:c.lastPullSeq,
    pushedCount:(c.pushedIds||[]).length,localEvents:_EVENTS.length,
    sameOrigin:/^\//.test(c.url||''),
    note:'The server stores ciphertext it cannot read. It does learn that a vault exists, how many events it holds and when they arrive \u2014 that metadata is unavoidable and is stated rather than hidden.',
    deployment:/^\//.test(c.url||'')?'Same-origin path, reverse-proxied to the sync server. This is the supported arrangement: the app ships with connect-src \'self\', so it cannot post your record to anywhere else.':
      'An absolute URL is configured. The shipped Content-Security-Policy allows only the app\'s own origin, so this will be blocked unless the build was made with --sync-origin for exactly this host.'};
}
function _cryptoReady(){return typeof crypto!=='undefined'&&crypto.subtle&&typeof TextEncoder!=='undefined';}
function _b64u(buf){return _b64(buf);}
function _sha256(str){return crypto.subtle.digest('SHA-256',new TextEncoder().encode(str));}
function _hex(buf){return Array.prototype.map.call(new Uint8Array(buf),function(b){return ('0'+b.toString(16)).slice(-2);}).join('');}
/* Deterministic derivation: the same phrase always produces the same vault, on any device, with no server
   involvement. That is what makes recovery possible without the server holding anything. */
function deriveVault(phrase){
  if(!_cryptoReady())return Promise.reject(new Error('sync needs the Web Crypto API, which requires a secure context (https or localhost)'));
  if(!phrase||String(phrase).trim().split(/\s+/).length<6)
    return Promise.reject(new Error('use a recovery phrase of at least six words \u2014 it is the only thing standing between your data and anyone who reaches the server'));
  var p=String(phrase).trim().replace(/\s+/g,' ').toLowerCase();
  return _sha256(p+'|id').then(function(idBuf){
    var vaultId=_hex(idBuf).slice(0,32);
    return _sha256(p+'|salt').then(function(saltBuf){
      return crypto.subtle.importKey('raw',new TextEncoder().encode(p),'PBKDF2',false,['deriveKey'])
        .then(function(base){
          return crypto.subtle.deriveKey({name:'PBKDF2',salt:new Uint8Array(saltBuf),iterations:KDF_ITERATIONS,hash:'SHA-256'},
            base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
        }).then(function(key){return {vaultId:vaultId,key:key};});
    });
  });
}
var _vaultKey=null,_vaultId=null;
function cloudUnlock(phrase){
  return deriveVault(phrase).then(function(v){
    _vaultKey=v.key;_vaultId=v.vaultId;
    DB.settings.cloud=Object.assign({},DB.settings.cloud||{},{vaultId:v.vaultId});
    save('settings');
    _cloud.status='unlocked';
    return {vaultId:v.vaultId};
  });
}
function cloudLocked(){return !_vaultKey;}
/* Device signing key. Generated once, exported as SPKI PEM for the server, private half kept here and
   never exported. */
function deviceKeyPair(){
  if(_deviceKeys)return Promise.resolve(_deviceKeys);
  var stored=DB.settings.deviceKey;
  if(stored&&stored.privateJwk){
    return Promise.all([
      crypto.subtle.importKey('jwk',stored.privateJwk,{name:'ECDSA',namedCurve:'P-256'},false,['sign']),
      Promise.resolve(stored.publicPem)
    ]).then(function(r){_deviceKeys={privateKey:r[0],publicPem:r[1]};return _deviceKeys;});
  }
  return crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']).then(function(kp){
    return Promise.all([
      crypto.subtle.exportKey('jwk',kp.privateKey),
      crypto.subtle.exportKey('spki',kp.publicKey)
    ]).then(function(r){
      var pem='-----BEGIN PUBLIC KEY-----\n'+_b64(r[1]).replace(/(.{64})/g,'$1\n')+'\n-----END PUBLIC KEY-----\n';
      DB.settings.deviceKey={privateJwk:r[0],publicPem:pem};save('settings');
      _deviceKeys={privateKey:kp.privateKey,publicPem:pem};
      return _deviceKeys;
    });
  });
}
var _deviceKeys=null;
function _api(pathname,opts){
  opts=opts||{};
  var c=cloudConfig();
  var headers={'content-type':'application/json'};
  if(_cloud.token&&_cloud.tokenExp>Date.now())headers['authorization']='Bearer '+_cloud.token;
  var base=String(_sameSiteServerUrl(c.url)).replace(/\/$/,'');
  return fetch(base+pathname,{method:opts.method||'GET',headers:headers,cache:'no-store',
    body:opts.body?JSON.stringify(opts.body):undefined})
    .catch(function(){var e=new Error('Could not reach the sync server at '+base+'. It may be waking up (free hosting sleeps when idle \u2014 try again in a minute), or this device is offline.'+(_cloud.urlReplaced?' (The address '+_cloud.urlReplaced+' was replaced by '+CLOUD_DEFAULT_URL+': this app can only reach its own site.)':''));e.status=0;throw e;})
    .then(function(r){var ct=String((r.headers&&r.headers.get&&r.headers.get('content-type'))||'');
      if(!/json/i.test(ct)){var e2=new Error(r.status>=502&&r.status<=504?'The sync server did not answer in time (HTTP '+r.status+'); it may be waking up \u2014 try again in a minute.':'The address '+base+' answered with a web page (HTTP '+r.status+'), not the sync server.');e2.status=r.status;throw e2;}
      return r.json().then(function(j){
      if(!r.ok){var e=new Error(j.error||('HTTP '+r.status));e.status=r.status;e.detail=j;throw e;}
      return j;});});
}
function cloudAuthenticate(){
  if(_cloud.token&&_cloud.tokenExp>Date.now()+5000)return Promise.resolve(_cloud.token);
  var c=cloudConfig();
  if(!c.vaultId)return Promise.reject(new Error('unlock a vault first'));
  return deviceKeyPair().then(function(keys){
    /* A server that lost its data has no vault: this device registers it again (it holds everything registration
       needs), becoming its first trusted device; other devices are re-authorised from here. */
    var challenge=function(retry){return _api('/v1/auth/challenge',{method:'POST',body:{vaultId:c.vaultId,deviceId:deviceId()}}).catch(function(e){
      if(retry&&e&&e.status===404&&c.enabled){return _api('/v1/vault',{method:'POST',body:{vaultId:c.vaultId,deviceId:deviceId(),devicePublicKey:keys.publicPem}}).then(function(){
        _cloud.reRegistered=nowISO();DB.settings.cloud=Object.assign({},DB.settings.cloud||{},{reRegisteredAt:_cloud.reRegistered});return challenge(false);});}
      throw e;});};
    return challenge(true)
      .then(function(ch){
        return crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keys.privateKey,new TextEncoder().encode(ch.nonce));
      })
      .then(function(sigRaw){
        /* WebCrypto emits raw r||s; Node's verifier expects DER, so convert here rather than making the
           server accept two encodings. */
        return _api('/v1/auth/verify',{method:'POST',
          body:{vaultId:c.vaultId,deviceId:deviceId(),signature:_b64(_rawToDer(new Uint8Array(sigRaw)))}});
      })
      .then(function(t){_cloud.token=t.token;_cloud.tokenExp=Date.now()+(t.expiresInMs||600000);_cloud.status='authenticated';return t.token;});
  });
}
function _rawToDer(raw){
  var r=raw.slice(0,32),s=raw.slice(32,64);
  var trim=function(b){var i=0;while(i<b.length-1&&b[i]===0)i++;var out=b.slice(i);
    return (out[0]&0x80)?Uint8Array.from([0].concat(Array.from(out))):out;};
  r=trim(r);s=trim(s);
  var len=2+r.length+2+s.length;
  var der=[0x30,len,0x02,r.length].concat(Array.from(r),[0x02,s.length],Array.from(s));
  return new Uint8Array(der).buffer;
}
function cloudCreateVault(phrase){
  return cloudUnlock(phrase).then(function(v){
    return deviceKeyPair().then(function(keys){
      return _api('/v1/vault',{method:'POST',body:{vaultId:v.vaultId,deviceId:deviceId(),devicePublicKey:keys.publicPem}})
        .then(function(r){
          DB.settings.cloud=Object.assign({},DB.settings.cloud||{},{enabled:true,vaultId:v.vaultId});
          save('settings');_cloud.status='vault created';
          return r;
        })
        .catch(function(e){
          if(e.status===409){
            /* The vault already exists, which is the normal case for a second device. Joining requires a
               device already trusted by that vault to authorise it, so possessing the phrase alone does not
               silently add a device without the user seeing it. */
            _cloud.status='vault exists \u2014 add this device from a device already signed in';
            throw new Error('That vault already exists. Open Sync on a device already signed in and add this one, which is what stops a stolen phrase from silently joining.');
          }
          throw e;
        });
    });
  });
}
function cloudAddThisDevice(){
  return cloudAuthenticate().then(function(){
    return deviceKeyPair().then(function(keys){
      return _api('/v1/vault/device',{method:'POST',body:{deviceId:deviceId(),devicePublicKey:keys.publicPem}});
    });
  });
}
/* ---------- encrypted event exchange ---------- */
/* LARGE EVENTS GO IN PARTS. A record that enters the log from outside it (a restored backup, the demo, a record from a
   build before the log, every compaction) is one snapshot event holding the whole record, about 290 KB for ten weeks.
   The server refuses an event over 256 KB, so the batch holding it failed on every sync and cloud sync never recovered.
   An event larger than CLOUD_PART_BYTES once encoded is now sent as numbered parts. Each part is sealed with its own
   row id as AES-GCM additional data, so a server cannot move a part to another position or another event without the
   decryption failing, and an event is put back together only when every part has arrived and decrypted. */
var CLOUD_PART_BYTES=150000,CLOUD_BATCH_BYTES=1200000,CLOUD_PART_RE=/^(.+)#part-(\d+)-of-(\d+)$/,CLOUD_PART_WAIT_DAYS=7;
function _encryptRow(id,bytes,device,sealed){
  var alg={name:'AES-GCM',iv:crypto.getRandomValues(new Uint8Array(12))};if(sealed)alg.additionalData=new TextEncoder().encode(id);
  return crypto.subtle.encrypt(alg,_vaultKey,bytes).then(function(ct){return {id:id,iv:_b64(alg.iv),ciphertext:_b64(ct),device:device};});
}
/* One event becomes one row, or several when it is large. */
function _encryptEvent(e){
  var bytes=new TextEncoder().encode(JSON.stringify(e));
  if(bytes.length<=CLOUD_PART_BYTES)return _encryptRow(e.id,bytes,e.device,false).then(function(r){return [r];});
  var n=Math.ceil(bytes.length/CLOUD_PART_BYTES),parts=[];
  for(var i=0;i<n;i++)parts.push(_encryptRow(e.id+'#part-'+(i+1)+'-of-'+n,bytes.subarray(i*CLOUD_PART_BYTES,(i+1)*CLOUD_PART_BYTES),e.device,true));
  return Promise.all(parts);
}
function _decryptRow(row){
  var alg={name:'AES-GCM',iv:_unb64(row.iv)};if(CLOUD_PART_RE.test(row.id||''))alg.additionalData=new TextEncoder().encode(row.id);
  return crypto.subtle.decrypt(alg,_vaultKey,_unb64(row.ciphertext)).then(function(pt){return new Uint8Array(pt);})
    .catch(function(){return null;});   // wrong key, damaged or moved row: skip it rather than corrupt the log
}
function _decryptEvent(row){
  return _decryptRow(row).then(function(b){if(!b)return null;try{return JSON.parse(new TextDecoder().decode(b));}catch(e){return null;}});
}
/* Rows back to events. A large event whose parts have not all arrived (or did not decrypt) is held: waitFrom is the
   earliest server position among its parts, and the pull position stays before it so the next sync reads them again.
   After CLOUD_PART_WAIT_DAYS an incomplete event is given up rather than holding every later sync back for ever.
   onServer lists the events the server is known to hold whole, so they are not uploaded again. */
function _assembleRows(rows){
  var whole=[],groups={},onServer=[];
  return Promise.all(rows.map(function(r){
    var m=CLOUD_PART_RE.exec(r.id||'');
    if(!m){if(r.id)onServer.push(r.id);return _decryptEvent(r).then(function(e){if(e)whole.push(e);});}
    var g=groups[m[1]]=groups[m[1]]||{n:+m[3],parts:{},seq:Infinity,at:null};
    g.seq=Math.min(g.seq,r.serverSeq||0);if(r.receivedAt&&(!g.at||r.receivedAt<g.at))g.at=r.receivedAt;
    return _decryptRow(r).then(function(b){if(b)g.parts[m[2]]=b;});
  })).then(function(){
    var waitFrom=null;
    Object.keys(groups).forEach(function(id){var g=groups[id],i;
      for(i=1;i<=g.n;i++)if(!g.parts[i])break;
      if(i<=g.n){if(!g.at||(Date.now()-Date.parse(g.at))/864e5<CLOUD_PART_WAIT_DAYS)waitFrom=waitFrom==null?g.seq:Math.min(waitFrom,g.seq);return;}
      var len=0;for(i=1;i<=g.n;i++)len+=g.parts[i].length;
      var all=new Uint8Array(len),off=0;for(i=1;i<=g.n;i++){all.set(g.parts[i],off);off+=g.parts[i].length;}
      try{var e=JSON.parse(new TextDecoder().decode(all));if(e&&e.id===id){whole.push(e);onServer.push(id);}}catch(err){}});
    return {events:whole,waitFrom:waitFrom,onServer:onServer};
  });
}
/* SYNC, hardened after use on a free host (Render). Three defects made syncing "abnormal": a wiped server was never
   noticed \u2014 the app kept its pull position and its list of events already sent, so it neither re-sent nor re-pulled;
   up to 2,000 events went in one upload against a 2 MB limit, so a long history was refused on every try; and the
   pull ignored "more", so a long history came down only in part. Now the server's data epoch and sequence are checked
   every sync (a change, a missing vault, or a server behind what was already pulled means it lost its data: the app
   re-sends everything and says so), uploads go in batches of 400, pulls follow "more", and a slow first answer is shown
   as the server waking. */
var CLOUD_PUSH_BATCH=400;
function _pullAll(since,acc){acc=acc||{events:[],serverSeq:0,epoch:null};
  return _api('/v1/events?since='+since+'&limit=2000').then(function(page){acc.events=acc.events.concat(page.events||[]);acc.serverSeq=page.serverSeq||0;acc.epoch=page.epoch||null;
    var last=(page.events||[]).reduce(function(a,r){return Math.max(a,r.serverSeq||0);},since);
    return page.more&&last>since?_pullAll(last,acc):acc;});}
function cloudSync(opts){
  opts=opts||{};
  if(cloudLocked())return Promise.reject(new Error('unlock the vault first'));
  if(_cloud.busy)return Promise.resolve({skipped:'a sync is already running'});
  _cloud.busy=true;_cloud.lastError=null;
  var c=cloudConfig(),stored=DB.settings.cloud||{};
  var pushed={},sent=0,received=0,conflicts=0,reset=false,since=c.lastPullSeq||0;
  (c.pushedIds||[]).forEach(function(id){pushed[id]=1;});
  var waking=setTimeout(function(){if(_cloud.busy){_cloud.status='waking';if(typeof renderAll==='function')try{renderAll();}catch(e){}}},8000);
  return cloudAuthenticate().then(function(){return _pullAll(since);}).then(function(page){
    /* A server that lost its data: another epoch, or fewer events than this device has already pulled. */
    if((stored.serverEpoch&&page.epoch&&page.epoch!==stored.serverEpoch)||(since>0&&page.serverSeq<since)){
      reset=true;pushed={};since=0;return _pullAll(0);}
    return page;
  }).then(function(page){
    DB.settings.cloud=Object.assign({},DB.settings.cloud||{},{serverEpoch:page.epoch||stored.serverEpoch||null});
    if(!page.events.length)return {maxSeq:reset?0:(c.lastPullSeq||0),events:[],serverSeq:page.serverSeq};
    return _assembleRows(page.events).then(function(asm){
      /* A pulled event is on the server already. Not counting it as sent uploaded every event received from another
         device straight back, so each device stored its own copy of everyone else's history. */
      asm.onServer.forEach(function(id){pushed[id]=1;});
      var good=asm.events;received=good.length;
      var maxSeq=page.events.reduce(function(a,r){return Math.max(a,r.serverSeq||0);},reset?0:(c.lastPullSeq||0));
      if(asm.waitFrom!=null)maxSeq=Math.min(maxSeq,asm.waitFrom-1);   /* read the waiting parts again next time */
      if(good.length){var merged=mergeEvents(_EVENTS,good);conflicts=merged.conflicts.length;
        if(merged.events.length>_EVENTS.length){pushUndo('merge '+(merged.events.length-_EVENTS.length)+' change(s) from the cloud');adoptMergedEvents(merged);}
        (merged.conflicts||[]).forEach(function(x){_syncState.conflicts.push(x);});}
      return {maxSeq:maxSeq,events:good};});
  }).then(function(pull){
    var toSend=_EVENTS.filter(function(e){return !pushed[e.id];});
    /* Requests are bounded by size as well as count (the server takes a 2 MB body; one part is about 200 KB), and an
       event counts as sent once the request carrying its last part is accepted. */
    var sendBatch=function(k){var chunk=toSend.slice(k,k+CLOUD_PUSH_BATCH);if(!chunk.length)return Promise.resolve();
      return Promise.all(chunk.map(_encryptEvent)).then(function(perEvent){
        var reqs=[],cur=[],size=0;
        perEvent.forEach(function(rows,i){rows.forEach(function(row,j){var b=row.ciphertext.length+row.iv.length+row.id.length+80;
          if(cur.length&&(size+b>CLOUD_BATCH_BYTES||cur.length>=CLOUD_PUSH_BATCH)){reqs.push(cur);cur=[];size=0;}
          cur.push({row:row,done:j===rows.length-1?chunk[i].id:null});size+=b;});});
        if(cur.length)reqs.push(cur);
        var post=function(q){if(q>=reqs.length)return Promise.resolve();
          return _api('/v1/events',{method:'POST',body:{events:reqs[q].map(function(x){return x.row;})}}).then(function(r){
            sent+=(r.accepted!=null?r.accepted:reqs[q].length);reqs[q].forEach(function(x){if(x.done)pushed[x.done]=1;});return post(q+1);});};
        return post(0);
      }).then(function(){return sendBatch(k+CLOUD_PUSH_BATCH);});};
    return sendBatch(0).then(function(){return {pull:pull,sent:sent};});
  }).then(function(res){
    clearTimeout(waking);
    var ids=Object.keys(pushed);if(ids.length>60000)ids=ids.slice(-60000);
    DB.settings.cloud=Object.assign({},DB.settings.cloud||{},{lastPullSeq:res.pull.maxSeq,lastSyncAt:nowISO(),pushedIds:ids,enabled:true,
      lastReset:reset?{at:nowISO(),resent:sent}:((DB.settings.cloud||{}).lastReset||null)});
    save('cloud:sync');_cloud.status='synced';_cloud.busy=false;
    if(typeof auditAppend==='function')auditAppend('cloud.sync',{sent:sent,received:received,conflicts:conflicts,serverReset:reset});
    return {ok:true,sent:sent,received:received,conflicts:conflicts,serverSeq:res.pull.maxSeq,serverReset:reset};
  }).catch(function(e){
    clearTimeout(waking);_cloud.busy=false;_cloud.status='error';
    _cloud.lastError=e&&e.status===404&&/vault/.test(String(e.message))?'The server no longer has this vault \u2014 it probably lost its data (free hosting wipes files on restart). Join again from Tools \u2192 Cloud sync, then sync to re-send this device\u2019s record.':String(e&&e.message||e);
    throw e;
  });
}
function cloudDisable(){
  DB.settings.cloud=Object.assign({},DB.settings.cloud||{},{enabled:false});
  _vaultKey=null;_cloud.token=null;_cloud.status='disabled';save('settings');
  return {ok:true,note:'This device stopped syncing. The vault and its data are untouched; use Delete vault to remove them from the server.'};
}
function cloudDeleteVault(){
  var c=cloudConfig();
  return cloudAuthenticate().then(function(){
    return _api('/v1/vault/delete',{method:'POST',body:{confirm:c.vaultId}});
  }).then(function(r){
    DB.settings.cloud={enabled:false};_vaultKey=null;_cloud.token=null;_cloud.status='vault deleted';
    save('settings');return r;
  });
}
/* ---------- push subscription ----------
   This is the honest answer to "the browser will not run a closed app's code": it will not, but a push
   service can wake it. The push carries no body, so the push service and the sync server both learn only
   that something is waiting. */
function cloudSubscribePush(){
  if(typeof navigator==='undefined'||!navigator.serviceWorker)
    return Promise.reject(new Error('push needs a service worker, which needs a secure context'));
  if(typeof Notification==='undefined')return Promise.reject(new Error('this browser has no notifications'));
  return Notification.requestPermission().then(function(p){
    if(p!=='granted')throw new Error('notification permission was declined');
    return navigator.serviceWorker.ready;
  }).then(function(reg){
    return _api('/v1/health').then(function(h){
      /* A server that regenerated its push keys (a wiped disk) no longer matches the browser's existing subscription:
         "Provided applicationServerKey does not match". The old subscription is dropped and a new one made. */
      var key=_urlB64ToBytes(h.vapidPublicKey);
      return reg.pushManager.getSubscription().then(function(old){
        var same=old&&old.options&&old.options.applicationServerKey&&(function(a,b){a=new Uint8Array(a);if(a.length!==b.length)return false;for(var i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true;})(old.options.applicationServerKey,key);
        if(old&&!same)return old.unsubscribe().then(function(){return reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});});
        return old||reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});});
    });
  }).then(function(sub){
    return cloudAuthenticate().then(function(){
      return _api('/v1/push/subscribe',{method:'POST',body:{subscription:{endpoint:sub.endpoint}}});
    });
  }).then(function(r){
    DB.settings.pushEnabled=true;save('settings');
    return Object.assign({ok:true},r);
  });
}
function _urlB64ToBytes(b64){
  var pad='='.repeat((4-b64.length%4)%4);
  var s=(b64+pad).replace(/-/g,'+').replace(/_/g,'/');
  var raw=atob(s);var out=new Uint8Array(raw.length);
  for(var i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);
  return out;
}
function cloudNotifyOthers(){
  return cloudAuthenticate().then(function(){return _api('/v1/push/notify',{method:'POST',body:{}});});
}
