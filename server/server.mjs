#!/usr/bin/env node
/* ============================================================================
   PHYSIQUE OS SYNC SERVER
   Zero dependencies. Node's own http and crypto only, so the whole trust surface is readable in one file
   and it installs anywhere Node runs.

   THE SECURITY POSTURE, STATED PLAINLY

   This server is a dumb encrypted mailbox. It stores ciphertext and it cannot read it.

     * Events are encrypted on the client with a vault key derived from a recovery phrase the server never
       receives. The server sees a base64 blob, its length, and when it arrived. Not a weight, not a meal.
     * There are no passwords and no email addresses. An account is a vault id plus a set of device public
       keys. Authentication is a signature over a server-issued challenge, so nothing replayable crosses the
       wire and there is no password database to leak.
     * A compromised server discloses: which vaults exist, how many events each holds, and their timing.
       That metadata is real and is documented rather than hidden. It cannot disclose health data.
     * Recovery is the phrase. If it is lost the data is unrecoverable, by construction. A server that could
       recover it would be a server that could read it.

   WHAT THIS IS NOT: it is not hardened for hostile public deployment as written. It has request limits,
   body caps, timing-safe comparisons and no dynamic evaluation, but it has no TLS termination (put it
   behind a reverse proxy), no DDoS mitigation, and no operational monitoring. `docs/server-operations.md`
   says exactly what running it responsibly requires.

     node server/server.mjs --port 8787 --data ./server-data
   ============================================================================ */
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import os from 'node:os';

const args=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,arr)=>(v.startsWith('--')?[...a,[v.slice(2),arr[i+1]]]:a),[]));
const PORT=+(args.port||process.env.PORT||8787);
const HOST=args.host||process.env.HOST||'127.0.0.1';
const DATA=path.resolve(args.data||process.env.DATA_DIR||'./server-data');
const MAX_BODY=+(args.maxBody||2*1024*1024);          // one sync batch
const MAX_EVENTS_PER_VAULT=+(args.maxEvents||200000);
const TOKEN_TTL_MS=30*60*1000;
const CHALLENGE_TTL_MS=2*60*1000;
const RATE_WINDOW_MS=60*1000, RATE_MAX=120;

fs.mkdirSync(DATA,{recursive:true});
/* THE DATA EPOCH. A random id written when the data folder is new. On a host whose disk does not persist (Render's free
   plan wipes files on every restart, and a sleeping instance restarts when woken) the epoch changes, and the app sees
   that the server lost its data and re-sends everything, instead of believing it is in sync. */
const EPOCH_FILE=path.join(DATA,'epoch.json');
let DATA_EPOCH;try{DATA_EPOCH=JSON.parse(fs.readFileSync(EPOCH_FILE,'utf8')).epoch;}catch(e){DATA_EPOCH=null;}
if(!DATA_EPOCH){DATA_EPOCH=crypto.randomBytes(9).toString('base64url');fs.writeFileSync(EPOCH_FILE,JSON.stringify({epoch:DATA_EPOCH,createdAt:new Date().toISOString()}));}
const STARTED_AT=new Date().toISOString();
const STORAGE_NOTE=process.env.PHYSIQUE_PERSISTENT_DATA==='1'?'declared persistent':(process.env.RENDER?'probably NOT persistent: Render free instances lose their files on every restart; attach a persistent disk and set PHYSIQUE_PERSISTENT_DATA=1':'unknown');
fs.mkdirSync(path.join(DATA,'vaults'),{recursive:true});

const log=(level,msg,extra)=>{
  /* Structured, and deliberately incapable of logging payloads: a log line that can contain user data is a
     second copy of the database with worse access control. */
  const line={at:new Date().toISOString(),level,msg,...(extra||{})};
  if(line.body)delete line.body;
  console.log(JSON.stringify(line));
};

/* ---------- storage ---------- */
const vaultDir=id=>path.join(DATA,'vaults',id);
const vaultMetaPath=id=>path.join(vaultDir(id),'vault.json');
const validId=id=>typeof id==='string'&&/^[a-f0-9]{32}$/.test(id);
/* THE LEDGER IS AUTHORITATIVE. events.ndjson rows carry their serverSeq; vault.json is written after the append. A crash
   between the two left events the metadata did not know about, so reading a vault reconciles it with the ledger's tail
   (and a torn last line from a crash mid-append is skipped and fenced off by a newline before the next append).
   An offset index (every 500th event) and a maintained count keep reads from scanning the whole file. */
const IDX_EVERY=500;
function eventsPath(id){return path.join(vaultDir(id),'events.ndjson');}
function _tailRows(p,maxBytes){const st=fs.statSync(p);const n=Math.min(st.size,maxBytes);const buf=Buffer.alloc(n);const fd=fs.openSync(p,'r');
  try{fs.readSync(fd,buf,0,n,st.size-n);}finally{fs.closeSync(fd);}
  const lines=buf.toString('utf8').split('\n');const rows=[];for(const l of lines){if(!l)continue;try{rows.push(JSON.parse(l));}catch(e){}}return {rows,size:st.size,endsWithNewline:buf.length===0||buf[buf.length-1]===10};}
function readVault(id){
  if(!validId(id))return null;
  let v;try{v=JSON.parse(fs.readFileSync(vaultMetaPath(id),'utf8'));}catch(e){return null;}
  const p=eventsPath(id);
  if(fs.existsSync(p)){const t=_tailRows(p,256*1024);const last=t.rows.length?t.rows[t.rows.length-1].serverSeq||0:0;
    if(last>(v.serverSeq||0)){log('warn','vault recovered from its ledger',{vault:id.slice(0,8),from:v.serverSeq||0,to:last});
      v.serverSeq=last;v.eventCount=countEventsSlow(id);v.offsets=rebuildOffsets(id);writeVault(v);}
    if(v.eventCount==null){v.eventCount=countEventsSlow(id);v.offsets=rebuildOffsets(id);writeVault(v);}}
  return v;
}
function writeVault(v){
  fs.mkdirSync(vaultDir(v.id),{recursive:true});
  const tmp=vaultMetaPath(v.id)+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(v));
  fs.renameSync(tmp,vaultMetaPath(v.id));   // atomic: a crash mid-write never leaves a half-vault
}
function appendEvents(v,rows){
  const p=eventsPath(v.id);let size=fs.existsSync(p)?fs.statSync(p).size:0;
  let prefix='';if(size>0){const t=_tailRows(p,1);if(!t.endsWithNewline)prefix='\n';}   // fence off a torn line
  size+=Buffer.byteLength(prefix);v.offsets=v.offsets||{};
  const parts=rows.map(r=>{const line=JSON.stringify(r)+'\n';if(r.serverSeq%IDX_EVERY===1)v.offsets[r.serverSeq]=size;size+=Buffer.byteLength(line);return line;});
  fs.appendFileSync(p,prefix+parts.join(''));
  v.eventCount=(v.eventCount||0)+rows.length;
}
function countEventsSlow(id){const p=eventsPath(id);if(!fs.existsSync(p))return 0;let n=0;
  for(const line of fs.readFileSync(p,'utf8').split('\n')){if(!line)continue;try{JSON.parse(line);n++;}catch(e){}}return n;}
function rebuildOffsets(id){const p=eventsPath(id),out={};if(!fs.existsSync(p))return out;let off=0;
  for(const line of fs.readFileSync(p,'utf8').split('\n')){const len=Buffer.byteLength(line)+1;if(line){try{const r=JSON.parse(line);if(r.serverSeq%IDX_EVERY===1)out[r.serverSeq]=off;}catch(e){}}off+=len;}return out;}
/* Bounded read: seek to the nearest indexed event at or before since+1, read forward in chunks, stop at the limit. */
function readEvents(v,since,limit){
  const p=eventsPath(v.id);if(!fs.existsSync(p))return {rows:[],more:false};
  let start=0;const keys=Object.keys(v.offsets||{}).map(Number).filter(k=>k<=since+1).sort((a,b)=>b-a);if(keys.length)start=v.offsets[keys[0]];
  const fd=fs.openSync(p,'r'),size=fs.statSync(p).size,out=[];let pos=start,rest='',more=false;
  try{while(pos<size){const n=Math.min(1<<20,size-pos),buf=Buffer.alloc(n);fs.readSync(fd,buf,0,n,pos);pos+=n;
      const lines=(rest+buf.toString('utf8')).split('\n');rest=lines.pop();
      for(const l of lines){if(!l)continue;let r;try{r=JSON.parse(l);}catch(e){continue;}if(r.serverSeq<=since)continue;if(out.length>=limit){more=true;break;}out.push(r);}
      if(more)break;}
    if(!more&&rest){try{const r=JSON.parse(rest);if(r.serverSeq>since){if(out.length>=limit)more=true;else out.push(r);}}catch(e){}}}
  finally{fs.closeSync(fd);}
  return {rows:out,more};
}

/* ---------- auth: signature over a server challenge, no passwords anywhere ---------- */
const challenges=new Map(), tokens=new Map(), rate=new Map();
function issueChallenge(vaultId,deviceId){
  const nonce=crypto.randomBytes(32).toString('base64');
  const key=vaultId+':'+deviceId;
  challenges.set(key,{nonce,exp:Date.now()+CHALLENGE_TTL_MS});
  return nonce;
}
function verifySignature(publicKeyPem,data,signatureB64){
  try{
    const v=crypto.createVerify('SHA256');
    v.update(data);v.end();
    return v.verify(publicKeyPem,Buffer.from(signatureB64,'base64'));
  }catch(e){return false;}
}
function issueToken(vaultId,deviceId){
  const t=crypto.randomBytes(32).toString('base64url');
  tokens.set(t,{vaultId,deviceId,exp:Date.now()+TOKEN_TTL_MS});
  return t;
}
function authFor(req){
  const h=req.headers['authorization']||'';
  const m=/^Bearer\s+(.+)$/.exec(h);
  if(!m)return null;
  const rec=tokens.get(m[1]);
  if(!rec)return null;
  if(rec.exp<Date.now()){tokens.delete(m[1]);return null;}
  return rec;
}
function rateOk(ip,max){
  const now=Date.now();
  const r=rate.get(ip)||{n:0,reset:now+RATE_WINDOW_MS};
  if(r.reset<now){r.n=0;r.reset=now+RATE_WINDOW_MS;}
  r.n++;rate.set(ip,r);
  return r.n<=(max||RATE_MAX);
}
setInterval(()=>{
  const now=Date.now();
  for(const [k,v] of challenges)if(v.exp<now)challenges.delete(k);
  for(const [k,v] of tokens)if(v.exp<now)tokens.delete(k);
  for(const [k,v] of rate)if(v.reset<now)rate.delete(k);
},60*1000).unref();

/* ---------- Web Push (VAPID) ----------
   This is the honest answer to "the browser will not run a closed app's code": it will not, but a push
   service will wake it. The payload carries no health data — only a nudge to open and sync — because the
   push service is a third party and the whole point of the encryption above is that third parties see
   nothing. */
const vapidPath=path.join(DATA,'vapid.json');
/* Push keys survive a wiped disk only if they live outside it: PHYSIQUE_VAPID_JSON holds the JSON of vapid.json. Keys
   regenerated after a wipe no longer match the browsers' subscriptions. */
/* CONFIGURED KEYS ARE AN INVARIANT. Accepted: VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY (web-push's format: base64url raw keys),
   or PHYSIQUE_VAPID_JSON holding {publicKey, privateKeyPem} (this server's) or {publicKey, privateKey} (web-push's).
   Configured but unreadable, or a private key that does not produce the given public key, stops the server: falling
   back would generate new keys and silently break every existing subscription. */
function normaliseVapid(pub,priv,privPem,source){
  const fail=m=>{throw new Error('push keys from '+source+': '+m);};
  if(!pub)fail('publicKey is missing');if(!priv&&!privPem)fail('privateKey or privateKeyPem is missing');
  const P=Buffer.from(String(pub),'base64url');if(P.length!==65||P[0]!==4)fail('publicKey is not an uncompressed P-256 point (65 bytes, base64url)');
  let key;try{key=privPem?crypto.createPrivateKey(privPem):crypto.createPrivateKey({format:'jwk',key:{kty:'EC',crv:'P-256',d:String(priv),x:P.subarray(1,33).toString('base64url'),y:P.subarray(33).toString('base64url')}});}
  catch(e){fail('the private key does not parse ('+e.message+')');}
  /* Node trusts the public point supplied with a JWK and does not recompute it from d, so comparing public keys proves
     nothing. A signature made with the private key must verify under the configured public key. */
  let pubKey;try{pubKey=crypto.createPublicKey({format:'jwk',key:{kty:'EC',crv:'P-256',x:P.subarray(1,33).toString('base64url'),y:P.subarray(33).toString('base64url')}});}catch(e){fail('the public key does not parse');}
  const probe=Buffer.from('physique-os vapid pair check');let sig;try{sig=crypto.sign('sha256',probe,key);}catch(e){fail('the private key cannot sign ('+e.message+')');}
  if(!crypto.verify('sha256',probe,pubKey,sig))fail('the private key does not belong to the public key');
  return {publicKey:String(pub),privateKeyPem:key.export({type:'pkcs8',format:'pem'}),source};
}
function vapidKeys(){
  if(process.env.VAPID_PUBLIC_KEY||process.env.VAPID_PRIVATE_KEY)return normaliseVapid(process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY,null,'VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY');
  if(process.env.PHYSIQUE_VAPID_JSON){let j;try{j=JSON.parse(process.env.PHYSIQUE_VAPID_JSON);}catch(e){throw new Error('push keys from PHYSIQUE_VAPID_JSON: not valid JSON');}
    return normaliseVapid(j.publicKey,j.privateKey,j.privateKeyPem,'PHYSIQUE_VAPID_JSON');}
  if(fs.existsSync(vapidPath))return JSON.parse(fs.readFileSync(vapidPath,'utf8'));
  const {publicKey,privateKey}=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  const pub=publicKey.export({type:'spki',format:'der'});
  const keys={publicKey:Buffer.from(pub.subarray(pub.length-65)).toString('base64url'),
    privateKeyPem:privateKey.export({type:'pkcs8',format:'pem'}),createdAt:new Date().toISOString()};
  fs.writeFileSync(vapidPath,JSON.stringify(keys));
  log('info','vapid keypair generated; copy '+vapidPath+' into PHYSIQUE_VAPID_JSON to keep push working after the disk is wiped');
  return keys;
}
let VAPID;try{VAPID=vapidKeys();}catch(e){console.error('STARTUP REFUSED: '+e.message);if(process.env.PHYSIQUE_SERVER_TEST==='1')throw e;process.exit(1);}
function vapidAuthHeader(endpoint,subject){
  const url=new URL(endpoint);
  const header=Buffer.from(JSON.stringify({typ:'JWT',alg:'ES256'})).toString('base64url');
  const claims=Buffer.from(JSON.stringify({aud:url.origin,exp:Math.floor(Date.now()/1000)+12*3600,sub:subject||'mailto:admin@localhost'})).toString('base64url');
  const signer=crypto.createSign('SHA256');
  signer.update(header+'.'+claims);signer.end();
  const der=signer.sign(crypto.createPrivateKey(VAPID.privateKeyPem));
  /* Web Push needs the raw 64-byte r||s, not the DER wrapper Node emits. */
  const raw=derToRaw(der);
  return 'vapid t='+header+'.'+claims+'.'+raw.toString('base64url')+', k='+VAPID.publicKey;
}
function derToRaw(der){
  let off=2;if(der[1]&0x80)off=2+(der[1]&0x7f);
  const readInt=()=>{const len=der[off+1];let start=off+2,l=len;
    while(der[start]===0&&l>32){start++;l--;}
    const buf=Buffer.alloc(32);Buffer.from(der.subarray(start,start+l)).copy(buf,32-l);off=off+2+len;return buf;};
  const r=readInt(),s=readInt();
  return Buffer.concat([r,s]);
}
function retireSubscriptions(v,subs,results){let removed=0;subs.forEach((s,i)=>{const r=results[i];const rec=(v.pushSubscriptions||[]).find(x=>x.endpoint===s.endpoint);if(!rec)return;
  if(r.ok){rec.failures=0;return;}
  if(r.status===404||r.status===410){v.pushSubscriptions=v.pushSubscriptions.filter(x=>x!==rec);removed++;return;}
  rec.failures=(rec.failures||0)+1;if(rec.failures>=5){v.pushSubscriptions=v.pushSubscriptions.filter(x=>x!==rec);removed++;}});return removed;}
async function sendPush(sub,payloadText){
  /* Payload encryption (aes128gcm) is required by the spec for a body. A nudge needs no body, so this sends
     a bodiless push, which is allowed, needs no content encryption, and leaks nothing to the push service. */
  return new Promise(resolve=>{
    let url;try{url=new URL(sub.endpoint);}catch(e){return resolve({ok:false,reason:'bad endpoint'});}
    /* https endpoints need https.request: http.request rejects the https protocol, so every real push failed. */
    const transport=url.protocol==='https:'?https:http;
    const req=transport.request({protocol:url.protocol,hostname:url.hostname,port:url.port||(url.protocol==='https:'?443:80),
      path:url.pathname+url.search,method:'POST',
      headers:{'TTL':'86400','Authorization':vapidAuthHeader(sub.endpoint),'Content-Length':0}},
      res=>{res.resume();resolve({ok:res.statusCode<300,status:res.statusCode});});
    req.on('error',e=>resolve({ok:false,reason:String(e.message)}));
    req.end();
  });
}

/* ---------- HTTP ---------- */
const json=(res,code,obj)=>{
  const body=JSON.stringify(obj);
  res.writeHead(code,{'content-type':'application/json',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'referrer-policy':'no-referrer',
    'access-control-allow-origin':args.cors||'*',
    'access-control-allow-headers':'authorization,content-type',
    'access-control-allow-methods':'GET,POST,OPTIONS'});
  res.end(body);
};
function readBody(req){
  return new Promise((resolve,reject)=>{
    let size=0;const chunks=[];
    req.on('data',c=>{size+=c.length;if(size>MAX_BODY){reject(new Error('body too large'));req.destroy();return;}chunks.push(c);});
    req.on('end',()=>{
      if(!chunks.length)return resolve({});
      try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch(e){reject(new Error('invalid JSON'));}
    });
    req.on('error',reject);
  });
}

/* ============================================================================
   EXTERNAL INTEGRATION BOUNDARY (integration spec §32). Provider calls happen here, not in the app: the app's
   Content-Security-Policy is connect-src 'self' (it cannot post a record anywhere else), the Meteosource key must not
   reach the public client (§3.7), and Open Food Facts asks for an app User-Agent that browsers cannot set. These routes
   are read-only transports: they validate input, call the provider, and return the provider payload with retrieval
   metadata. They do not normalise, resolve or decide (§32, §46) \u2014 the app's adapters do that through the canonical
   ingestion path. Coordinates and keys are never logged. Caching is a read optimisation only (§34).
   PHYSIQUE_EXT_FIXTURES=<dir> answers from recorded provider responses, for tests without network access.
   ============================================================================ */
const EXT_VERSION='1.0.0';
const EXT_UA='PhysiqueOS/'+EXT_VERSION+' ('+(process.env.PHYSIQUE_CONTACT||'contact not configured')+')';
const EXT_FIX=process.env.PHYSIQUE_EXT_FIXTURES?path.resolve(process.env.PHYSIQUE_EXT_FIXTURES):null;
const EXT_CACHE=new Map();const EXT_CACHE_MAX=500;
const OM_CURRENT=['weather_code','temperature_2m','relative_humidity_2m','apparent_temperature','is_day','precipitation','cloud_cover','wind_speed_10m','wind_direction_10m','wind_gusts_10m','uv_index'];
const OM_HOURLY=['weather_code','temperature_2m','relative_humidity_2m','apparent_temperature','precipitation','precipitation_probability','cloud_cover','et0_fao_evapotranspiration','vapour_pressure_deficit','wind_speed_10m','wind_direction_10m','wind_gusts_10m','uv_index','is_day'];
const OM_DAILY=['weather_code','temperature_2m_max','temperature_2m_min','apparent_temperature_max','apparent_temperature_min','precipitation_sum','precipitation_probability_max','et0_fao_evapotranspiration','sunrise','sunset','daylight_duration','uv_index_max','wind_speed_10m_max','wind_gusts_10m_max','wind_direction_10m_dominant'];
const OM_ARCHIVE_HOURLY=['weather_code','temperature_2m','relative_humidity_2m','apparent_temperature','precipitation','cloud_cover','et0_fao_evapotranspiration','vapour_pressure_deficit','wind_speed_10m','wind_direction_10m','wind_gusts_10m','is_day'];
const OM_ARCHIVE_DAILY=['weather_code','temperature_2m_max','temperature_2m_min','apparent_temperature_max','apparent_temperature_min','precipitation_sum','et0_fao_evapotranspiration','sunrise','sunset','daylight_duration','wind_speed_10m_max','wind_gusts_10m_max','wind_direction_10m_dominant'];
const OM_AQ=['pm2_5','pm10','ozone','nitrogen_dioxide','sulphur_dioxide','carbon_monoxide','european_aqi','us_aqi'];
function extErr(code,category,detail){return {code,body:{status:'error',error:{category,detail}}};}
function extCoords(url){const lat=+url.searchParams.get('lat'),lon=+url.searchParams.get('lon');
  if(!url.searchParams.has('lat')||!url.searchParams.has('lon'))return {err:extErr(400,'configuration_error','lat and lon are required; a location is never inferred')};
  if(!isFinite(lat)||!isFinite(lon)||lat<-90||lat>90||lon<-180||lon>180)return {err:extErr(400,'configuration_error','lat/lon out of range')};
  return {lat:Math.round(lat*100)/100,lon:Math.round(lon*100)/100};}   /* ~1 km: enough for weather, not a street address */
function extTz(url){const tz=String(url.searchParams.get('tz')||'UTC');return /^[A-Za-z_]+(\/[A-Za-z_+\-0-9]+){0,2}$/.test(tz)||tz==='UTC'?tz:'UTC';}
function extClamp(v,lo,hi,d){v=parseInt(v,10);return isFinite(v)?Math.max(lo,Math.min(hi,v)):d;}
async function extCall(provider,fixtureName,urlStr,headers,ttlMs){
  const cacheKey=provider+' '+urlStr;const hit=EXT_CACHE.get(cacheKey);
  if(hit&&Date.now()-hit.at<ttlMs)return {status:'ok',provider,retrievedAt:hit.retrievedAt,cached:true,payload:hit.payload};
  let payload,retrievedAt=new Date().toISOString();
  if(EXT_FIX){const f=path.join(EXT_FIX,fixtureName+'.json');
    if(!fs.existsSync(f))return extErr(404,'unsupported_record','no fixture '+fixtureName);
    payload=JSON.parse(fs.readFileSync(f,'utf8'));if(payload&&payload.__status){const st=payload.__status;return extErr(st,st===429?'rate_limited':(st===401||st===403?'authorization_denied':'provider_unavailable'),'fixture status '+st);}}
  else{let r;try{const ctl=new AbortController();const t=setTimeout(()=>ctl.abort(),10000);
      r=await fetch(urlStr,{headers:Object.assign({'accept':'application/json','user-agent':EXT_UA},headers||{}),signal:ctl.signal});clearTimeout(t);}
    catch(e){return extErr(502,'network_unavailable','the provider could not be reached');}
    if(r.status===429)return extErr(429,'rate_limited','the provider is rate-limiting requests');
    if(r.status===401||r.status===403)return extErr(502,'authorization_denied','the provider refused the credentials');
    if(r.status>=500)return extErr(502,'provider_unavailable','the provider returned '+r.status);
    try{payload=await r.json();}catch(e){return extErr(502,'malformed_payload','the provider returned something that is not JSON');}
    if(r.status===404&&provider!=='open-food-facts')return extErr(404,'unsupported_record','the provider has no such record');}
  if(EXT_CACHE.size>=EXT_CACHE_MAX)EXT_CACHE.delete(EXT_CACHE.keys().next().value);
  EXT_CACHE.set(cacheKey,{at:Date.now(),retrievedAt,payload});
  return {status:'ok',provider,retrievedAt,cached:false,payload};
}

/* ============================================================================
   CONNECTIONS: wearables and health platforms over OAuth (integration spec: token custody, cursors, backfill,
   revocation, webhooks). Sign-in details never reach the app: they are kept here, encrypted at rest (AES-256-GCM with
   CONNECT_TOKEN_KEY), per vault, and refreshed when they expire. A provider is available only when its credentials are
   set (FITBIT_CLIENT_ID, WITHINGS_CLIENT_ID and _SECRET, OURA_CLIENT_ID and _SECRET). The server fetches the provider's
   JSON for a date window and returns it; the app's adapters normalise it (providers terminate at the adapter
   boundary). PHYSIQUE_CONNECT_MOCK=<origin> points every provider address at a local simulated provider for tests.
   ============================================================================ */
const CONNECT_KEY=(()=>{const k=process.env.CONNECT_TOKEN_KEY;if(!k)return null;const b=/^[0-9a-f]{64}$/i.test(k)?Buffer.from(k,'hex'):Buffer.from(k,'base64');
  if(b.length!==32){console.error('CONNECTIONS: CONNECT_TOKEN_KEY must be 32 bytes (64 hex characters or base64)');process.exit(1);}return b;})();
const CONNECT_MOCK=process.env.PHYSIQUE_CONNECT_MOCK||null;
const PUBLIC_URL=(process.env.PHYSIQUE_PUBLIC_URL||'').replace(/\/$/,'');
function _pUrl(u){if(!CONNECT_MOCK)return u;const x=new URL(u);return CONNECT_MOCK.replace(/\/$/,'')+x.pathname+x.search;}
const CONNECT_PROVIDERS={
  fitbit:{label:'Fitbit',pkce:true,authorize:'https://www.fitbit.com/oauth2/authorize',token:'https://api.fitbit.com/oauth2/token',revoke:'https://api.fitbit.com/oauth2/revoke',
    scopes:'weight activity sleep',id:'FITBIT_CLIENT_ID',secret:'FITBIT_CLIENT_SECRET',maxDays:31},
  withings:{label:'Withings',pkce:false,authorize:'https://account.withings.com/oauth2_user/authorize2',token:'https://wbsapi.withings.net/v2/oauth2',
    scopes:'user.metrics',id:'WITHINGS_CLIENT_ID',secret:'WITHINGS_CLIENT_SECRET',secretRequired:true,maxDays:90},
  strava:{label:'Strava',pkce:false,authorize:'https://www.strava.com/oauth/authorize',token:'https://www.strava.com/oauth/token',deauthorize:'https://www.strava.com/oauth/deauthorize',
    scopes:'read,activity:read_all',id:'STRAVA_CLIENT_ID',secret:'STRAVA_CLIENT_SECRET',secretRequired:true,maxDays:3650,streamsPerSync:15},
  oura:{label:'Oura',pkce:false,authorize:'https://cloud.ouraring.com/oauth/authorize',token:'https://api.ouraring.com/oauth/token',
    scopes:'daily',id:'OURA_CLIENT_ID',secret:'OURA_CLIENT_SECRET',secretRequired:true,maxDays:90}
};
function connectConfigured(p){const c=CONNECT_PROVIDERS[p];return !!(c&&CONNECT_KEY&&process.env[c.id]&&(!c.secretRequired||process.env[c.secret]));}
function _seal(obj){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',CONNECT_KEY,iv);const data=Buffer.concat([c.update(JSON.stringify(obj),'utf8'),c.final()]);
  return {iv:iv.toString('base64'),tag:c.getAuthTag().toString('base64'),data:data.toString('base64')};}
/* ROTATION: with CONNECT_TOKEN_KEY_PREVIOUS set, a sign-in sealed under the old key still opens; it is re-sealed under the
   new key when next used, or all at once through POST /v1/admin/rotate-connect-key. Remove the old key afterwards. */
const CONNECT_KEY_PREV=(()=>{const k=process.env.CONNECT_TOKEN_KEY_PREVIOUS;if(!k)return null;const b=/^[0-9a-f]{64}$/i.test(k)?Buffer.from(k,'hex'):Buffer.from(k,'base64');return b.length===32?b:null;})();
function _openWith(key,e){const d=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(e.iv,'base64'));d.setAuthTag(Buffer.from(e.tag,'base64'));return JSON.parse(Buffer.concat([d.update(Buffer.from(e.data,'base64')),d.final()]).toString('utf8'));}
function _open(e){try{return _openWith(CONNECT_KEY,e);}catch(err){if(CONNECT_KEY_PREV){const v=_openWith(CONNECT_KEY_PREV,e);Object.defineProperty(v,'__oldKey',{value:true});return v;}throw err;}}
function rotateConnectKeys(){let resealed=0,failed=0;const vd=path.join(DATA,'vaults');if(!fs.existsSync(vd))return {resealed,failed};
  for(const id of fs.readdirSync(vd)){const conns=readConns(id);let changed=false;for(const p of Object.keys(conns)){const c=conns[p];if(!c||!c.sealed)continue;
    try{const t=_open(c.sealed);if(t.__oldKey){c.sealed=_seal({access:t.access,refresh:t.refresh,expiresAt:t.expiresAt});changed=true;resealed++;}}catch(e){failed++;}}
    if(changed)writeConns(id,conns);}
  return {resealed,failed};}
const connPath=id=>path.join(vaultDir(id),'connections.json'),CONN_INDEX=path.join(DATA,'connect-index.json');
function readConns(id){try{return JSON.parse(fs.readFileSync(connPath(id),'utf8'));}catch(e){return {};}}
function writeConns(id,c){fs.mkdirSync(vaultDir(id),{recursive:true});fs.writeFileSync(connPath(id)+'.tmp',JSON.stringify(c));fs.renameSync(connPath(id)+'.tmp',connPath(id));}
function readConnIndex(){try{return JSON.parse(fs.readFileSync(CONN_INDEX,'utf8'));}catch(e){return {};}}
function writeConnIndex(x){fs.writeFileSync(CONN_INDEX+'.tmp',JSON.stringify(x));fs.renameSync(CONN_INDEX+'.tmp',CONN_INDEX);}
const PENDING_AUTH=new Map();   /* state \u2192 {vaultId, provider, verifier, returnTo, at}; ten minutes */
function _form(o){return Object.keys(o).filter(k=>o[k]!=null).map(k=>encodeURIComponent(k)+'='+encodeURIComponent(o[k])).join('&');}
async function _post(url,form,headers){const r=await fetch(_pUrl(url),{method:'POST',headers:Object.assign({'content-type':'application/x-www-form-urlencoded','accept':'application/json','user-agent':EXT_UA},headers||{}),body:_form(form)});
  let j=null;try{j=await r.json();}catch(e){}return {status:r.status,json:j};}
function _basic(p){const c=CONNECT_PROVIDERS[p],sec=process.env[c.secret];return sec?{authorization:'Basic '+Buffer.from(process.env[c.id]+':'+sec).toString('base64')}:{};}
function _redirectUri(){return (PUBLIC_URL||'')+'/api/sync/v1/ext/connect/callback';}
async function _exchange(p,params){const c=CONNECT_PROVIDERS[p];
  if(p==='withings'){const r=await _post(c.token,Object.assign({action:'requesttoken',client_id:process.env[c.id],client_secret:process.env[c.secret]},params));
    const b=r.json&&r.json.body;if(!b||r.json.status!==0)return {error:'provider_unavailable',detail:'Withings token request failed'};return {access_token:b.access_token,refresh_token:b.refresh_token,expires_in:b.expires_in,user_id:String(b.userid||'')};}
  if(p==='strava'){const r=await _post(c.token,Object.assign({client_id:process.env[c.id],client_secret:process.env[c.secret]},params));
    if(r.status===400||r.status===401)return {error:'authorization_denied',detail:(r.json&&r.json.message)||('HTTP '+r.status)};if(!r.json||!r.json.access_token)return {error:'provider_unavailable',detail:'no token in the response'};
    /* Strava gives an absolute expiry (expires_at) and the athlete: the athlete id links webhooks to this vault */
    return {access_token:r.json.access_token,refresh_token:r.json.refresh_token,expires_in:r.json.expires_at?Math.max(0,r.json.expires_at-Math.floor(Date.now()/1000)):r.json.expires_in,user_id:r.json.athlete&&r.json.athlete.id!=null?String(r.json.athlete.id):null};}
  const r=await _post(c.token,Object.assign({client_id:process.env[c.id]},p==='oura'?{client_secret:process.env[c.secret]}:{},params),p==='fitbit'?_basic(p):{});
  if(r.status===401||r.status===400)return {error:'authorization_denied',detail:(r.json&&(r.json.error||r.json.errors&&r.json.errors[0]&&r.json.errors[0].errorType))||('HTTP '+r.status)};
  if(!r.json||!r.json.access_token)return {error:'provider_unavailable',detail:'no token in the response'};return r.json;}
function _store(vaultId,p,tok){const conns=readConns(vaultId),prev=conns[p]||{};
  const rec={access:tok.access_token,refresh:tok.refresh_token||(prev.sealed?_open(prev.sealed).refresh:null),expiresAt:Date.now()+1000*(+tok.expires_in||3600)};
  conns[p]=Object.assign({},prev,{sealed:_seal(rec),userId:tok.user_id||prev.userId||null,connectedAt:prev.connectedAt||new Date().toISOString(),refreshedAt:new Date().toISOString(),pending:prev.pending||false});
  writeConns(vaultId,conns);if(conns[p].userId){const ix=readConnIndex();ix[p+':'+conns[p].userId]=vaultId;writeConnIndex(ix);}return conns[p];}
async function _accessToken(vaultId,p){const conns=readConns(vaultId),c=conns[p];if(!c||!c.sealed)return {error:'authentication_required',detail:'not connected'};
  let t=_open(c.sealed);if(t.__oldKey){c.sealed=_seal({access:t.access,refresh:t.refresh,expiresAt:t.expiresAt});writeConns(vaultId,conns);}   /* re-sealed under the new key */
  if(t.expiresAt-60000>Date.now())return {token:t.access};
  if(!t.refresh)return {error:'authentication_required',detail:'the sign-in expired; connect again'};
  const nt=await _exchange(p,{grant_type:'refresh_token',refresh_token:t.refresh});if(nt.error)return nt;_store(vaultId,p,nt);return {token:nt.access_token,refreshed:true};}
function _day(d){return d.toISOString().slice(0,10);}
async function _get(url,token){const r=await fetch(_pUrl(url),{headers:{authorization:'Bearer '+token,accept:'application/json','user-agent':EXT_UA}});let j=null;try{j=await r.json();}catch(e){}return {status:r.status,json:j};}
async function _fetchWindow(p,token,start,end){
  if(p==='fitbit'){const out={weight:[],'activities-steps':[],sleep:[]};let s=new Date(start+'T00:00:00Z');const e=new Date(end+'T00:00:00Z');
    while(s<=e){const t=new Date(Math.min(e.getTime(),s.getTime()+30*86400000)),a=_day(s),b=_day(t);
      const w=await _get('https://api.fitbit.com/1/user/-/body/log/weight/date/'+a+'/'+b+'.json',token),st=await _get('https://api.fitbit.com/1/user/-/activities/steps/date/'+a+'/'+b+'.json',token),sl=await _get('https://api.fitbit.com/1.2/user/-/sleep/date/'+a+'/'+b+'.json',token);
      for(const r of [w,st,sl])if(r.status===401)return {error:'authentication_required'};else if(r.status===429)return {error:'rate_limited'};else if(r.status>=500)return {error:'provider_unavailable'};
      out.weight=out.weight.concat((w.json&&w.json.weight)||[]);out['activities-steps']=out['activities-steps'].concat((st.json&&st.json['activities-steps'])||[]);out.sleep=out.sleep.concat((sl.json&&sl.json.sleep)||[]);s=new Date(t.getTime()+86400000);}
    return {payload:out};}
  if(p==='withings'){const r=await _post('https://wbsapi.withings.net/measure',{action:'getmeas',meastypes:'1,6',category:1,startdate:Math.floor(Date.parse(start+'T00:00:00Z')/1000),enddate:Math.floor(Date.parse(end+'T23:59:59Z')/1000)},{authorization:'Bearer '+token});
    if(!r.json||r.json.status!==0)return {error:r.json&&r.json.status===401?'authentication_required':'provider_unavailable'};return {payload:{body:{measuregrps:(r.json.body&&r.json.body.measuregrps)||[]}}};}
  if(p==='oura'){const q='?start_date='+start+'&end_date='+end,a=await _get('https://api.ouraring.com/v2/usercollection/daily_activity'+q,token),sl=await _get('https://api.ouraring.com/v2/usercollection/sleep'+q,token);
    for(const r of [a,sl])if(r.status===401)return {error:'authentication_required'};else if(r.status>=400)return {error:r.status===429?'rate_limited':'provider_unavailable'};
    return {payload:{data:((a.json&&a.json.data)||[]).concat((sl.json&&sl.json.data)||[])}};}
  if(p==='strava'){
    /* Activities in the window, page by page; per-second streams for the newest few (rate limits: ~100 requests per 15
       minutes by default). Pending deletions from webhooks are handed back so the app can retract them. */
    const after=Math.floor(Date.parse(start+'T00:00:00Z')/1000),before=Math.floor(Date.parse(end+'T23:59:59Z')/1000)+86400;let acts=[],usage=null;
    for(let page=1;page<=5;page++){const r=await fetch(_pUrl('https://www.strava.com/api/v3/athlete/activities?after='+after+'&before='+before+'&per_page=100&page='+page),{headers:{authorization:'Bearer '+token,accept:'application/json','user-agent':EXT_UA}});
      usage=r.headers.get('x-ratelimit-usage')||usage;if(r.status===401)return {error:'authentication_required'};if(r.status===429)return {error:'rate_limited',detail:'Strava rate limit reached (usage '+(usage||'?')+'); try again in 15 minutes'};if(r.status>=400)return {error:'provider_unavailable'};
      const j=await r.json();if(!Array.isArray(j)||!j.length)break;acts=acts.concat(j);if(j.length<100)break;}
    const budget=CONNECT_PROVIDERS.strava.streamsPerSync;acts.sort((a,b)=>String(b.start_date).localeCompare(String(a.start_date)));
    for(const a of acts.slice(0,budget)){if(!(a.moving_time>=600))continue;
      const r=await fetch(_pUrl('https://www.strava.com/api/v3/activities/'+a.id+'/streams?keys=time,heartrate,velocity_smooth,grade_smooth,watts,moving&key_by_type=true'),{headers:{authorization:'Bearer '+token,accept:'application/json','user-agent':EXT_UA}});
      if(r.status===429)break;if(r.ok){try{a._streams=await r.json();}catch(e){}}}
    return {payload:{activities:acts,rateLimitUsage:usage}};}
  return {error:'unsupported_record'};
}
/* ============================================================================
   OPERATIONS (audit §63\u2013§69, §111 phase 3): storage verified, metrics, backup, key rotation.
   ============================================================================ */
const METRICS={startedAt:Date.now(),requests:{},errors:0,errorsByRoute:{},recentErrors:[],rateLimited:0,push:{sent:0,failed:0,removed:0},backup:{configured:false,lastAt:null,ok:null,verified:null,bytes:null,key:null,error:null}};
function _dirBytes(d){let n=0;try{for(const f of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,f.name);n+=f.isDirectory()?_dirBytes(p):fs.statSync(p).size;}}catch(e){}return n;}
function storageStatus(){let free=null,total=null,writable=false;try{const st=fs.statfsSync(DATA);free=st.bavail*st.bsize;total=st.blocks*st.bsize;}catch(e){}
  try{const f=path.join(DATA,'.probe-'+process.pid);fs.writeFileSync(f,'ok');writable=fs.readFileSync(f,'utf8')==='ok';fs.unlinkSync(f);}catch(e){}
  const warnings=[];if(!writable)warnings.push('the data folder cannot be written');
  /* absolute first: a percentage of a large disk flagged 7.8 GB free as low for a server holding megabytes */
  if(free!=null&&(free<200*1048576||(free<1024*1048576&&total&&free/total<0.1)))warnings.push('disk space low: '+Math.round(free/1048576)+' MB free');
  let near=0;try{for(const id of fs.readdirSync(path.join(DATA,'vaults'))){const v=readVault(id);if(v&&(v.eventCount||0)>0.9*MAX_EVENTS_PER_VAULT)near++;}}catch(e){}
  if(near)warnings.push(near+' vault(s) above 90% of the event limit');
  if(/NOT persistent/.test(STORAGE_NOTE))warnings.push('storage is probably not persistent (a free Render instance loses its files on restart)');
  return {writable,freeBytes:free,totalBytes:total,persistence:STORAGE_NOTE,epoch:DATA_EPOCH,warnings};}
function _bearerIs(req,envName){const want=process.env[envName];if(!want)return false;const got=(/^Bearer\s+(.+)$/.exec(req.headers['authorization']||'')||[])[1]||'';
  const a=Buffer.from(got),b=Buffer.from(want);return a.length===b.length&&crypto.timingSafeEqual(a,b);}
const opsRoutes={
  'GET /v1/metrics':async(req)=>{if(!process.env.METRICS_TOKEN)return {code:404,body:{error:'metrics are off (set METRICS_TOKEN)'}};if(!_bearerIs(req,'METRICS_TOKEN'))return {code:401,body:{error:'unauthorized'}};
    let vaults=0,events=0;try{for(const id of fs.readdirSync(path.join(DATA,'vaults'))){const v=readVault(id);if(v){vaults++;events+=v.eventCount||0;}}}catch(e){}
    return {service:'physique-os-sync',uptimeSeconds:Math.round((Date.now()-METRICS.startedAt)/1000),epoch:DATA_EPOCH,requests:METRICS.requests,errors:METRICS.errors,rateLimited:METRICS.rateLimited,
      push:METRICS.push,vaults,events,dataBytes:_dirBytes(DATA),storage:storageStatus(),errorsByRoute:METRICS.errorsByRoute,recentErrors:METRICS.recentErrors,backup:METRICS.backup,health:healthStatus()};},
  'GET /v1/admin/backup':async(req)=>{if(!process.env.ADMIN_TOKEN)return {code:404,body:{error:'admin is off (set ADMIN_TOKEN)'}};if(!_bearerIs(req,'ADMIN_TOKEN'))return {code:401,body:{error:'unauthorized'}};
    const f=path.join(os.tmpdir(),'physique-backup-'+DATA_EPOCH+'-'+Date.now()+'.tar.gz');execFileSync('tar',['-czf',f,'-C',DATA,'--exclude=./.probe-*','.']);
    log('info','backup taken',{bytes:fs.statSync(f).size});return {file:f,type:'application/gzip',name:'physique-backup-'+new Date().toISOString().slice(0,10)+'-'+DATA_EPOCH+'.tar.gz'};},
  'POST /v1/admin/rotate-connect-key':async(req)=>{if(!process.env.ADMIN_TOKEN)return {code:404,body:{error:'admin is off'}};if(!_bearerIs(req,'ADMIN_TOKEN'))return {code:401,body:{error:'unauthorized'}};
    if(!CONNECT_KEY)return extErr(503,'configuration_error','no CONNECT_TOKEN_KEY');const r=rotateConnectKeys();log('info','connection keys rotated',r);return Object.assign({status:'ok'},r);}
};
const connectRoutes={
  'GET /v1/ext/connect/providers':async(req)=>{const auth=authFor(req);const conns=auth?readConns(auth.vaultId):{};
    return {status:'ok',tokenCustody:!!CONNECT_KEY,providers:Object.keys(CONNECT_PROVIDERS).map(p=>({id:p,label:CONNECT_PROVIDERS[p].label,configured:connectConfigured(p),connected:!!(conns[p]&&conns[p].sealed),
      lastSync:conns[p]&&conns[p].lastSync||null,cursor:conns[p]&&conns[p].cursor||null,pending:!!(conns[p]&&conns[p].pending),
      needs:connectConfigured(p)?null:(!CONNECT_KEY?'CONNECT_TOKEN_KEY on the server':CONNECT_PROVIDERS[p].id+(CONNECT_PROVIDERS[p].secretRequired?' and '+CONNECT_PROVIDERS[p].secret:'')+' on the server')}))};},
  'POST /v1/ext/connect/start':async(req,body)=>{const auth=authFor(req);if(!auth)return {code:401,body:{status:'error',error:{category:'authentication_required',detail:'unlock your vault first'}}};
    const p=body&&body.provider,c=CONNECT_PROVIDERS[p];if(!c)return extErr(400,'configuration_error','unknown provider');if(!connectConfigured(p))return extErr(503,'configuration_error',p+' is not configured on this server');
    const state=crypto.randomBytes(18).toString('base64url'),verifier=c.pkce?crypto.randomBytes(32).toString('base64url'):null;
    const rt=String(body.returnTo||'/');PENDING_AUTH.set(state,{vaultId:auth.vaultId,provider:p,verifier,returnTo:rt.charAt(0)==='/'?rt:'/',at:Date.now()});
    for(const [k,v] of PENDING_AUTH)if(Date.now()-v.at>600000)PENDING_AUTH.delete(k);
    const q={response_type:'code',client_id:process.env[c.id],redirect_uri:_redirectUri(),scope:c.scopes,state};
    if(verifier){q.code_challenge=crypto.createHash('sha256').update(verifier).digest('base64url');q.code_challenge_method='S256';}
    return {status:'ok',authorizeUrl:_pUrl(c.authorize)+'?'+_form(q)};},
  'GET /v1/ext/connect/callback':async(req,body,url)=>{const st=PENDING_AUTH.get(url.searchParams.get('state')||'');
    if(!st)return {redirect:'/?connect_error=expired'};PENDING_AUTH.delete(url.searchParams.get('state'));
    if(url.searchParams.get('error'))return {redirect:st.returnTo+'?connect_error='+encodeURIComponent(url.searchParams.get('error'))};
    const tok=await _exchange(st.provider,{grant_type:'authorization_code',code:url.searchParams.get('code')||'',redirect_uri:_redirectUri(),code_verifier:st.verifier||undefined});
    if(tok.error)return {redirect:st.returnTo+'?connect_error='+tok.error};_store(st.vaultId,st.provider,tok);log('info','provider connected',{provider:st.provider});
    return {redirect:st.returnTo+'?connected='+st.provider};},
  'POST /v1/ext/connect/sync':async(req,body)=>{const auth=authFor(req);if(!auth)return {code:401,body:{status:'error',error:{category:'authentication_required',detail:'unlock your vault first'}}};
    const p=body&&body.provider;if(!CONNECT_PROVIDERS[p])return extErr(400,'configuration_error','unknown provider');
    const at=await _accessToken(auth.vaultId,p);if(at.error)return extErr(at.error==='authentication_required'?401:502,at.error,at.detail||'');
    const conns=readConns(auth.vaultId),c=conns[p],today=_day(new Date()),cur=c.cursor;
    const start=cur?_day(new Date(Date.parse(cur+'T00:00:00Z')-86400000)):_day(new Date(Date.now()-29*86400000));   /* backfill 30 days, then a one-day overlap for late data */
    const w=await _fetchWindow(p,at.token,start,today);if(w.error)return extErr(w.error==='authentication_required'?401:502,w.error,'');
    if(p==='strava'){w.payload.deleted=(c.deleted||[]).slice();c.deleted=[];}
    c.cursor=today;c.lastSync=new Date().toISOString();c.pending=false;writeConns(auth.vaultId,conns);
    return {status:'ok',provider:p,window:{start,end:today},backfill:!cur,refreshed:!!at.refreshed,retrievedAt:c.lastSync,payload:w.payload};},
  'POST /v1/ext/connect/revoke':async(req,body)=>{const auth=authFor(req);if(!auth)return {code:401,body:{status:'error',error:{category:'authentication_required'}}};
    const p=body&&body.provider,conns=readConns(auth.vaultId),c=conns[p];if(!c)return {status:'ok',revoked:false,note:'not connected'};
    let atProvider=false;try{if(c.sealed){const t=_open(c.sealed);if(CONNECT_PROVIDERS[p].revoke){const r=await _post(CONNECT_PROVIDERS[p].revoke,{token:t.access},_basic(p));atProvider=r.status<300;}
      else if(CONNECT_PROVIDERS[p].deauthorize){const r=await _post(CONNECT_PROVIDERS[p].deauthorize,{access_token:t.access});atProvider=r.status<300;}}}catch(e){}
    if(c.userId){const ix=readConnIndex();delete ix[p+':'+c.userId];writeConnIndex(ix);}delete conns[p];writeConns(auth.vaultId,conns);log('info','provider disconnected',{provider:p});
    return {status:'ok',revoked:true,atProvider};},
  /* Providers announce new data; only a verified notification marks "new data waiting". No data arrives this way. */
  'GET /v1/ext/webhook':async(req,body,url)=>{
    /* Strava's subscription handshake: echo the challenge when the verify token matches */
    if(url.searchParams.get('provider')==='strava'||url.searchParams.get('hub.mode')){const t=url.searchParams.get('hub.verify_token');
      if(url.searchParams.get('hub.mode')==='subscribe'&&process.env.STRAVA_VERIFY_TOKEN&&t===process.env.STRAVA_VERIFY_TOKEN)return {code:200,body:{'hub.challenge':url.searchParams.get('hub.challenge')}};
      return {code:403,body:{error:'verify token does not match'}};}
    const v=url.searchParams.get('verify');if(v&&process.env.FITBIT_SUBSCRIBER_VERIFY&&v===process.env.FITBIT_SUBSCRIBER_VERIFY)return {code:204,body:''};return {code:404,body:{error:'not verified'}};},
  'POST /v1/ext/webhook':async(req,body,url)=>{const p=url.searchParams.get('provider'),raw=body&&body.__raw||'';if(!CONNECT_PROVIDERS[p])return {code:404,body:{error:'unknown provider'}};
    if(p==='strava'){
      /* Strava does not sign events: an event is accepted only for this server's subscription and a known athlete */
      let ev;try{ev=JSON.parse(raw);}catch(e){return {code:400,body:{error:'bad payload'}};}
      if(!process.env.STRAVA_SUBSCRIPTION_ID||String(ev.subscription_id)!==String(process.env.STRAVA_SUBSCRIPTION_ID)){log('warn','strava event for another subscription rejected');return {code:401,body:{error:'unknown subscription'}};}
      const ix=readConnIndex(),vid=ix['strava:'+String(ev.owner_id)];if(!vid)return {code:200,body:{ok:true,ignored:'unknown athlete'}};
      const conns=readConns(vid),c=conns.strava;if(!c)return {code:200,body:{ok:true}};
      if(ev.object_type==='athlete'&&ev.updates&&String(ev.updates.authorized)==='false'){delete conns.strava;delete ix['strava:'+String(ev.owner_id)];writeConns(vid,conns);writeConnIndex(ix);log('info','strava deauthorised by the athlete');return {code:200,body:{ok:true}};}
      if(ev.object_type==='activity'){if(ev.aspect_type==='delete'){c.deleted=(c.deleted||[]).concat([String(ev.object_id)]).slice(-500);}else{c.pending=true;if(ev.aspect_type==='update')c.cursor=null;}writeConns(vid,conns);}
      return {code:200,body:{ok:true}};}
    let ok=false;if(p==='fitbit'&&process.env.FITBIT_CLIENT_SECRET){const sig=crypto.createHmac('sha1',process.env.FITBIT_CLIENT_SECRET+'&').update(raw).digest('base64');ok=sig===req.headers['x-fitbit-signature'];}
    else if(process.env.CONNECT_WEBHOOK_SECRET){const sig=crypto.createHmac('sha256',process.env.CONNECT_WEBHOOK_SECRET).update(raw).digest('hex');ok=sig===req.headers['x-physique-signature'];}
    if(!ok){log('warn','webhook signature rejected',{provider:p});return {code:401,body:{error:'bad signature'}};}
    let items=[];try{const j=JSON.parse(raw);items=Array.isArray(j)?j:[j];}catch(e){return {code:400,body:{error:'bad payload'}};}
    const ix=readConnIndex();let marked=0;items.forEach(n=>{const uid=String(n.ownerId||n.userid||n.user_id||'');const vid=ix[p+':'+uid];if(!vid)return;const conns=readConns(vid);if(conns[p]){conns[p].pending=true;writeConns(vid,conns);marked++;}});
    return {code:204,body:''};}
};
const extRoutes={
  'GET /v1/ext/sources':async()=>({status:'ok',adapterVersion:EXT_VERSION,fixtures:!!EXT_FIX,sources:{
    'open-meteo':{live:true,capabilities:['current','hourly','daily','forecast-16d','past-92d','historical','air-quality','geocoding'],auth:'none',terms:'free API for non-commercial use; commercial use needs an Open-Meteo subscription'},
    'meteosource':{live:!!process.env.METEOSOURCE_API_KEY,capabilities:['current','hourly','daily'],auth:'api key held by this server',
      note:process.env.METEOSOURCE_API_KEY?'configured':'not configured: set METEOSOURCE_API_KEY (and METEOSOURCE_TIER) on the server'},
    'open-food-facts':{live:true,capabilities:['barcode-product'],auth:'none (identified by User-Agent)',userAgentConfigured:!!process.env.PHYSIQUE_CONTACT}}}),
  'GET /v1/ext/weather/forecast':async(req,body,url)=>{const c=extCoords(url);if(c.err)return c.err;
    const provider=url.searchParams.get('provider')||'open-meteo',tz=extTz(url);
    if(provider==='meteosource'){const key=process.env.METEOSOURCE_API_KEY;if(!key&&!EXT_FIX)return extErr(503,'configuration_error','Meteosource needs METEOSOURCE_API_KEY on the server');
      const tier=/^[a-z]+$/.test(process.env.METEOSOURCE_TIER||'')?process.env.METEOSOURCE_TIER:'free';
      const u='https://www.meteosource.com/api/v1/'+tier+'/point?lat='+c.lat+'&lon='+c.lon+'&sections=current,hourly,daily&timezone=UTC&language=en&units=metric';
      return extCall('meteosource','meteosource-point',u,{'x-api-key':key||''},15*60000);}
    const past=extClamp(url.searchParams.get('past_days'),0,92,7),days=extClamp(url.searchParams.get('forecast_days'),1,16,14);
    /* hourly rows can be limited while daily ranges stay (Open-Meteo past_hours/forecast_hours): ~7x smaller refreshes */
    const hrs=(url.searchParams.has('past_hours')?'&past_hours='+extClamp(url.searchParams.get('past_hours'),0,2208,24):'')+(url.searchParams.has('forecast_hours')?'&forecast_hours='+extClamp(url.searchParams.get('forecast_hours'),1,384,48):'');
    const u='https://api.open-meteo.com/v1/forecast?latitude='+c.lat+'&longitude='+c.lon+'&current='+OM_CURRENT.join(',')+'&hourly='+OM_HOURLY.join(',')+'&daily='+OM_DAILY.join(',')+
      '&past_days='+past+'&forecast_days='+days+hrs+'&timezone='+encodeURIComponent(tz)+'&wind_speed_unit=ms&timeformat=iso8601';
    return extCall('open-meteo','open-meteo-forecast',u,null,15*60000);},
  'GET /v1/ext/weather/archive':async(req,body,url)=>{const c=extCoords(url);if(c.err)return c.err;
    const s=url.searchParams.get('start'),e=url.searchParams.get('end'),tz=extTz(url);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(s||'')||!/^\d{4}-\d{2}-\d{2}$/.test(e||'')||e<s)return extErr(400,'invalid_timestamp','start and end dates are required, start first');
    if((Date.parse(e)-Date.parse(s))/86400000>366)return extErr(400,'configuration_error','at most one year per request');
    const u='https://archive-api.open-meteo.com/v1/archive?latitude='+c.lat+'&longitude='+c.lon+'&start_date='+s+'&end_date='+e+'&hourly='+OM_ARCHIVE_HOURLY.join(',')+'&daily='+OM_ARCHIVE_DAILY.join(',')+'&timezone='+encodeURIComponent(tz)+'&wind_speed_unit=ms';
    return extCall('open-meteo','open-meteo-archive',u,null,24*3600000);},
  'GET /v1/ext/weather/air-quality':async(req,body,url)=>{const c=extCoords(url);if(c.err)return c.err;
    const past=extClamp(url.searchParams.get('past_days'),0,92,7),days=extClamp(url.searchParams.get('forecast_days'),1,7,5),tz=extTz(url);
    const hrs=(url.searchParams.has('past_hours')?'&past_hours='+extClamp(url.searchParams.get('past_hours'),0,2208,24):'')+(url.searchParams.has('forecast_hours')?'&forecast_hours='+extClamp(url.searchParams.get('forecast_hours'),1,168,48):'');
    const u='https://air-quality-api.open-meteo.com/v1/air-quality?latitude='+c.lat+'&longitude='+c.lon+'&current='+OM_AQ.join(',')+'&hourly='+OM_AQ.join(',')+'&past_days='+past+'&forecast_days='+days+hrs+'&timezone='+encodeURIComponent(tz);
    return extCall('open-meteo','open-meteo-air-quality',u,null,30*60000);},
  'GET /v1/ext/geocode':async(req,body,url)=>{const q=String(url.searchParams.get('name')||'').trim();if(q.length<2||q.length>80)return extErr(400,'configuration_error','a place name of 2 to 80 characters');
    return extCall('open-meteo','geocode','https://geocoding-api.open-meteo.com/v1/search?name='+encodeURIComponent(q)+'&count=5&language=en&format=json',null,7*24*3600000);},
  'GET /v1/ext/food/off/product':async(req,body,url)=>{const code=String(url.searchParams.get('code')||'').replace(/\D/g,'');
    if(code.length<6||code.length>14)return extErr(400,'configuration_error','a barcode of 6 to 14 digits');
    const fields='code,product_name,generic_name,brands,quantity,serving_size,serving_quantity,nutriments,nutrition_data_per,product_quantity,product_quantity_unit,categories_tags,lang,last_modified_t';
    return extCall('open-food-facts','off-product-'+code,'https://world.openfoodfacts.org/api/v3/product/'+code+'?fields='+fields,null,24*3600000);}
};

const routes={
  ...extRoutes,
  ...connectRoutes,
  ...opsRoutes,
  /* The base address answers with an index, not "no such endpoint": people open it to check the server. */
  'GET /':async()=>({ok:true,service:'physique-os-sync',health:'/v1/health',note:'This is the Physique OS server. The app talks to it; there is nothing to see here.'}),
  'GET /v1':async()=>({ok:true,service:'physique-os-sync',health:'/v1/health'}),
  'GET /v1/ai/status':async()=>{const c=aiConfig();return {enabled:!!c,provider:c?c.provider:null,model:c?c.model:null,local:c?c.local:false};},
  'POST /v1/ai/complete':async(req,body)=>{const auth=authFor(req);if(!auth)return {code:401,body:{error:'unlock your vault first'}};
    const now=Date.now(),w=(_AI_RATE.get(auth.vaultId)||[]).filter(t=>now-t<60000);if(w.length>=+(process.env.AI_RATE_PER_MINUTE||20))return {code:429,body:{error:'too many AI requests; wait a minute'}};
    w.push(now);_AI_RATE.set(auth.vaultId,w);return aiComplete(body);},
  'GET /v1/health':async()=>({ok:true,status:healthStatus().status,degraded:healthStatus().reasons,service:'physique-os-sync',version:1,ext:EXT_VERSION,epoch:DATA_EPOCH,startedAt:STARTED_AT,storage:STORAGE_NOTE,storageCheck:storageStatus(),
    vaults:fs.readdirSync(path.join(DATA,'vaults')).length,
    vapidPublicKey:VAPID.publicKey,
    note:'this server stores ciphertext it cannot read'}),

  /* Create a vault. The client sends a vault id it derived from its recovery phrase and the public key of
     the device creating it. No secret ever reaches the server. */
  'POST /v1/vault':async(req,body)=>{
    if(!validId(body.vaultId))return {code:400,body:{error:'vaultId must be 32 hex characters'}};
    if(typeof body.devicePublicKey!=='string'||body.devicePublicKey.length>2000)return {code:400,body:{error:'devicePublicKey required'}};
    if(readVault(body.vaultId))return {code:409,body:{error:'a vault with that id already exists',
      hint:'the id is derived from your recovery phrase; if this is your vault, register this device instead'}};
    const v={id:body.vaultId,createdAt:new Date().toISOString(),serverSeq:0,
      devices:[{id:String(body.deviceId||'').slice(0,64),publicKey:body.devicePublicKey,addedAt:new Date().toISOString()}],
      pushSubscriptions:[]};
    writeVault(v);
    log('info','vault created',{vault:body.vaultId.slice(0,8)});
    return {code:201,body:{ok:true,vaultId:v.id,devices:1}};
  },

  /* Add a device to an existing vault. Must be signed by a device already trusted by that vault, so
     possessing the vault id alone is not enough to join it. */
  'POST /v1/vault/device':async(req,body)=>{
    const auth=authFor(req);
    if(!auth)return {code:401,body:{error:'authenticate first'}};
    const v=readVault(auth.vaultId);
    if(!v)return {code:404,body:{error:'no such vault'}};
    if(v.devices.length>=20)return {code:400,body:{error:'device limit reached'}};
    if(typeof body.devicePublicKey!=='string')return {code:400,body:{error:'devicePublicKey required'}};
    if(v.devices.some(d=>d.publicKey===body.devicePublicKey))return {code:200,body:{ok:true,already:true}};
    v.devices.push({id:String(body.deviceId||'').slice(0,64),publicKey:body.devicePublicKey,addedAt:new Date().toISOString()});
    writeVault(v);
    log('info','device added',{vault:v.id.slice(0,8),devices:v.devices.length});
    return {code:201,body:{ok:true,devices:v.devices.length}};
  },

  'POST /v1/auth/challenge':async(req,body)=>{
    if(!validId(body.vaultId))return {code:400,body:{error:'vaultId required'}};
    const v=readVault(body.vaultId);
    if(!v)return {code:404,body:{error:'no such vault'}};
    return {code:200,body:{nonce:issueChallenge(body.vaultId,String(body.deviceId||'')),expiresInMs:CHALLENGE_TTL_MS}};
  },

  'POST /v1/auth/verify':async(req,body)=>{
    if(!validId(body.vaultId))return {code:400,body:{error:'vaultId required'}};
    const v=readVault(body.vaultId);
    if(!v)return {code:404,body:{error:'no such vault'}};
    const key=body.vaultId+':'+String(body.deviceId||'');
    const ch=challenges.get(key);
    if(!ch||ch.exp<Date.now())return {code:401,body:{error:'no live challenge; request one first'}};
    const dev=v.devices.find(d=>d.id===String(body.deviceId||''));
    if(!dev)return {code:401,body:{error:'this device is not registered to that vault'}};
    if(!verifySignature(dev.publicKey,ch.nonce,String(body.signature||'')))
      return {code:401,body:{error:'signature did not verify'}};
    challenges.delete(key);                              // single use, so a captured nonce is worthless
    log('info','device authenticated',{vault:v.id.slice(0,8)});
    return {code:200,body:{token:issueToken(v.id,dev.id),expiresInMs:TOKEN_TTL_MS}};
  },

  /* Append encrypted events. The server assigns a monotonic sequence so clients can pull incrementally.
     It never inspects, reorders or merges: merge is the client's job, on plaintext it alone can read. */
  'POST /v1/events':async(req,body)=>{
    const auth=authFor(req);
    if(!auth)return {code:401,body:{error:'authenticate first'}};
    const v=readVault(auth.vaultId);
    if(!v)return {code:404,body:{error:'no such vault'}};
    if(!Array.isArray(body.events))return {code:400,body:{error:'events must be an array'}};
    if(body.events.length>5000)return {code:400,body:{error:'batch too large'}};
    const existing=v.eventCount||0;
    if(existing+body.events.length>MAX_EVENTS_PER_VAULT)return {code:507,body:{error:'vault event limit reached'}};
    const rows=[];
    for(const e of body.events){
      if(!e||typeof e.id!=='string'||typeof e.ciphertext!=='string')
        return {code:400,body:{error:'each event needs an id and a ciphertext'}};
      if(e.ciphertext.length>256*1024)return {code:400,body:{error:'event too large'}};
      rows.push({id:e.id,ciphertext:e.ciphertext,iv:String(e.iv||''),device:String(e.device||'').slice(0,64),
        serverSeq:++v.serverSeq,receivedAt:new Date().toISOString()});
    }
    if(rows.length){appendEvents(v,rows);writeVault(v);}   /* the ledger first; the metadata is recoverable from it */
    log('info','events appended',{vault:v.id.slice(0,8),count:rows.length,serverSeq:v.serverSeq});
    return {code:200,body:{ok:true,accepted:rows.length,serverSeq:v.serverSeq}};
  },

  'GET /v1/events':async(req,body,url)=>{
    const auth=authFor(req);
    if(!auth)return {code:401,body:{error:'authenticate first'}};
    const v=readVault(auth.vaultId);
    if(!v)return {code:404,body:{error:'no such vault'}};
    const since=+(url.searchParams.get('since')||0);
    const limit=Math.max(1,Math.min(5000,+(url.searchParams.get('limit')||2000)));
    const page=readEvents(v,since,limit);
    return {code:200,body:{events:page.rows,serverSeq:v.serverSeq,epoch:DATA_EPOCH,more:page.more,
      note:'ciphertext only; this server cannot read these'}};
  },

  'POST /v1/push/subscribe':async(req,body)=>{
    const auth=authFor(req);
    if(!auth)return {code:401,body:{error:'authenticate first'}};
    const v=readVault(auth.vaultId);
    if(!v)return {code:404,body:{error:'no such vault'}};
    if(!body.subscription||typeof body.subscription.endpoint!=='string')
      return {code:400,body:{error:'a push subscription is required'}};
    v.pushSubscriptions=(v.pushSubscriptions||[]).filter(s=>s.endpoint!==body.subscription.endpoint);
    v.pushSubscriptions.push({endpoint:body.subscription.endpoint,device:auth.deviceId,addedAt:new Date().toISOString()});
    if(v.pushSubscriptions.length>20)v.pushSubscriptions=v.pushSubscriptions.slice(-20);
    writeVault(v);
    return {code:201,body:{ok:true,subscriptions:v.pushSubscriptions.length,
      note:'pushes carry no body, so the push service learns only that something is waiting'}};
  },

  /* Nudge a vault's other devices. Bodiless, so nothing about the user crosses a third party. */
  'POST /v1/push/notify':async(req,body)=>{
    const auth=authFor(req);
    if(!auth)return {code:401,body:{error:'authenticate first'}};
    const v=readVault(auth.vaultId);
    if(!v)return {code:404,body:{error:'no such vault'}};
    const subs=(v.pushSubscriptions||[]).filter(s=>s.device!==auth.deviceId);
    const results=await Promise.all(subs.map(s=>sendPush(s)));
    /* A subscription the push service says is gone (404, 410) is removed; others are retired after 5 failures in a row. */
    const removed=retireSubscriptions(v,subs,results);
    if(subs.length)writeVault(v);
    METRICS.push.sent+=results.filter(r=>r.ok).length;METRICS.push.failed+=results.filter(r=>!r.ok).length;METRICS.push.removed+=(+removed||0);
    return {code:200,body:{ok:true,sent:results.filter(r=>r.ok).length,attempted:results.length,removed}};
  },

  /* Delete everything. Immediate and total, because a service holding health data that cannot be left is
     not a service, it is a trap. */
  'POST /v1/vault/delete':async(req,body)=>{
    const auth=authFor(req);
    if(!auth)return {code:401,body:{error:'authenticate first'}};
    const v=readVault(auth.vaultId);
    if(!v)return {code:404,body:{error:'no such vault'}};
    if(body.confirm!==v.id)return {code:400,body:{error:'send confirm with the vault id to delete it'}};
    fs.rmSync(vaultDir(v.id),{recursive:true,force:true});
    log('info','vault deleted',{vault:v.id.slice(0,8)});
    return {code:200,body:{ok:true,deleted:true}};
  }
};

/* ============================================================================
   PRODUCTION DURABILITY (audit S-001, S-003, S-004, S-006, S-011, S-012).
   \u2022 PHYSIQUE_PRODUCTION=1 refuses to start on storage not declared persistent, on a data folder in the temp folder,
     without off-host backups, or with a short admin or metrics token: a production server must not run on a disk that a
     restart wipes with nothing elsewhere.
   \u2022 Off-host backups to any S3-compatible bucket (BACKUP_S3_ENDPOINT, _BUCKET, _REGION, _ACCESS_KEY, _SECRET_KEY), signed
     with AWS Signature V4 written here (checked against AWS's published test vector), every BACKUP_INTERVAL_HOURS
     (default 24); each backup is read back and its checksum and contents verified; BACKUP_KEEP (default 14) are kept.
   \u2022 node server.mjs --restore-from-s3 <key|latest> restores into an empty data folder after verifying the checksum.
   \u2022 /v1/health says degraded, with reasons, when backups are stale or failing or storage is not persistent.
   ============================================================================ */
function productionPreflight(env){env=env||process.env;const p=[];
  if(env.PHYSIQUE_PERSISTENT_DATA!=='1')p.push('storage is not declared persistent: mount a persistent disk and set PHYSIQUE_PERSISTENT_DATA=1');
  const rel=path.relative(os.tmpdir(),DATA);if(!rel.startsWith('..')&&!path.isAbsolute(rel))p.push('the data folder is inside the temp folder ('+DATA+')');
  if(!env.BACKUP_S3_BUCKET||!env.BACKUP_S3_ENDPOINT||!env.BACKUP_S3_ACCESS_KEY||!env.BACKUP_S3_SECRET_KEY)p.push('no off-host backups: set BACKUP_S3_ENDPOINT, BACKUP_S3_BUCKET, BACKUP_S3_ACCESS_KEY and BACKUP_S3_SECRET_KEY');
  ['ADMIN_TOKEN','METRICS_TOKEN'].forEach(k=>{if(env[k]&&env[k].length<32)p.push(k+' is shorter than 32 characters');});
  return p;}
/* AWS Signature Version 4 (no SDK). sigv4() is pure, so it is tested against AWS's published vectors. */
const _hmac=(k,d)=>crypto.createHmac('sha256',k).update(d).digest(),_sha=d=>crypto.createHash('sha256').update(d).digest('hex');
function sigv4({method,path:uri,query,headers,payloadHash,region,service,accessKey,secretKey,amzDate}){
  const date=amzDate.slice(0,8),names=Object.keys(headers).map(h=>h.toLowerCase()).sort();
  const canonHeaders=names.map(n=>n+':'+String(headers[Object.keys(headers).find(h=>h.toLowerCase()===n)]).trim().replace(/\s+/g,' ')+'\n').join('');
  const signed=names.join(';'),canonQuery=Object.keys(query||{}).sort().map(k=>encodeURIComponent(k)+'='+encodeURIComponent(query[k])).join('&');
  const creq=[method,uri,canonQuery,canonHeaders,signed,payloadHash].join('\n'),scope=date+'/'+region+'/'+service+'/aws4_request';
  const sts=['AWS4-HMAC-SHA256',amzDate,scope,_sha(creq)].join('\n');
  const kSig=_hmac(_hmac(_hmac(_hmac('AWS4'+secretKey,date),region),service),'aws4_request');
  return {authorization:'AWS4-HMAC-SHA256 Credential='+accessKey+'/'+scope+', SignedHeaders='+signed+', Signature='+crypto.createHmac('sha256',kSig).update(sts).digest('hex'),signedHeaders:signed};}
const _s3cfg=env=>{env=env||process.env;return env.BACKUP_S3_BUCKET&&env.BACKUP_S3_ENDPOINT?{endpoint:env.BACKUP_S3_ENDPOINT.replace(/\/$/,''),bucket:env.BACKUP_S3_BUCKET,region:env.BACKUP_S3_REGION||'us-east-1',accessKey:env.BACKUP_S3_ACCESS_KEY||'',secretKey:env.BACKUP_S3_SECRET_KEY||''}:null;};
async function s3Request(cfg,method,key,body,query){const u=new URL(cfg.endpoint);const uri='/'+[cfg.bucket].concat(key?String(key).split('/'):[]).map(encodeURIComponent).join('/');
  const amzDate=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,''),payloadHash=_sha(body||'');
  const headers={host:u.host,'x-amz-content-sha256':payloadHash,'x-amz-date':amzDate};
  const {authorization}=sigv4({method,path:uri,query,headers,payloadHash,region:cfg.region,service:'s3',accessKey:cfg.accessKey,secretKey:cfg.secretKey,amzDate});
  const qs=Object.keys(query||{}).sort().map(k=>encodeURIComponent(k)+'='+encodeURIComponent(query[k])).join('&');
  const r=await fetch(cfg.endpoint+uri+(qs?'?'+qs:''),{method,headers:Object.assign({},headers,{authorization}),body:body||undefined});
  const buf=Buffer.from(await r.arrayBuffer());if(!r.ok&&r.status!==204)throw new Error('S3 '+method+' '+(key||'')+' failed: HTTP '+r.status+' '+buf.toString('utf8').slice(0,160));return buf;}
async function runBackup(env){env=env||process.env;const cfg=_s3cfg(env);METRICS.backup.configured=!!cfg;if(!cfg)return {status:'not configured'};
  const f=path.join(os.tmpdir(),'physique-backup-'+DATA_EPOCH+'-'+Date.now()+'.tar.gz');
  try{execFileSync('tar',['-czf',f,'-C',DATA,'--exclude=./.probe-*','.']);const buf=fs.readFileSync(f),sum=_sha(buf);
    const key='backups/'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+DATA_EPOCH+'.tar.gz';
    await s3Request(cfg,'PUT',key,buf);
    /* verified, not assumed: read it back, compare the checksum, and list what it holds */
    const back=await s3Request(cfg,'GET',key);if(_sha(back)!==sum)throw new Error('the uploaded backup does not match what was sent');
    const vf=f+'.verify';fs.writeFileSync(vf,back);const list=execFileSync('tar',['-tzf',vf],{encoding:'utf8'});fs.unlinkSync(vf);
    if(!/epoch\.json/.test(list))throw new Error('the backup does not contain the data folder');
    await fs.promises.writeFile(path.join(DATA,'last-backup.json'),JSON.stringify({key,sha256:sum,bytes:buf.length,at:new Date().toISOString()}));
    const keep=+(env.BACKUP_KEEP||14);let pruned=0;
    try{const xml=(await s3Request(cfg,'GET','',null,{'list-type':'2',prefix:'backups/'})).toString('utf8');const keys=[...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map(m=>m[1]).sort();
      for(const k of keys.slice(0,Math.max(0,keys.length-keep))){await s3Request(cfg,'DELETE',k);pruned++;}}catch(e){log('warn','backup retention failed',{error:String(e.message)});}
    Object.assign(METRICS.backup,{lastAt:new Date().toISOString(),ok:true,verified:true,bytes:buf.length,key,sha256:sum,error:null,pruned});log('info','backup stored and verified',{key,bytes:buf.length,pruned});
    return {status:'ok',key,sha256:sum,bytes:buf.length,pruned};}
  catch(e){Object.assign(METRICS.backup,{lastAt:new Date().toISOString(),ok:false,verified:false,error:String(e.message).slice(0,200)});log('error','backup failed',{error:String(e.message)});return {status:'failed',error:String(e.message)};}
  finally{try{fs.unlinkSync(f);}catch(e){}}}
async function restoreFromS3(which,env,opts){env=env||process.env;opts=opts||{};const cfg=_s3cfg(env);if(!cfg)throw new Error('restore needs BACKUP_S3_* settings');
  const existing=fs.existsSync(DATA)?fs.readdirSync(DATA).filter(n=>!/^\.probe-|^epoch\.json$/.test(n)):[];if(existing.length&&!opts.force)throw new Error('the data folder is not empty ('+existing.slice(0,3).join(', ')+'); restore refuses to overwrite without --force');
  let key=which;if(!key||key==='latest'){const xml=(await s3Request(cfg,'GET','',null,{'list-type':'2',prefix:'backups/'})).toString('utf8');key=[...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map(m=>m[1]).sort().pop();if(!key)throw new Error('no backups in the bucket');}
  const buf=await s3Request(cfg,'GET',key),f=path.join(os.tmpdir(),'physique-restore-'+Date.now()+'.tar.gz');fs.writeFileSync(f,buf);
  try{const list=execFileSync('tar',['-tzf',f],{encoding:'utf8'});if(!/epoch\.json/.test(list))throw new Error('that object is not a Physique OS backup');fs.mkdirSync(DATA,{recursive:true});execFileSync('tar',['-xzf',f,'-C',DATA]);}finally{try{fs.unlinkSync(f);}catch(e){}}
  return {status:'ok',key,sha256:_sha(buf),bytes:buf.length};}
function healthStatus(env){env=env||process.env;const reasons=[],st=storageStatus(),hours=+(env.BACKUP_INTERVAL_HOURS||24);
  if(!st.writable)reasons.push('the data folder cannot be written');(st.warnings||[]).forEach(w=>reasons.push(w));
  const cfg=_s3cfg(env);if(cfg){const b=METRICS.backup;let last=b.lastAt;try{last=last||JSON.parse(fs.readFileSync(path.join(DATA,'last-backup.json'),'utf8')).at;}catch(e){}
    if(b.ok===false)reasons.push('the last backup failed: '+b.error);else if(!last||(Date.now()-Date.parse(last))>2*hours*3600e3)reasons.push('no verified backup in the last '+(2*hours)+' hours');}
  else if(env.PHYSIQUE_PRODUCTION==='1')reasons.push('no off-host backups are configured');
  return {status:reasons.length?'degraded':'ok',reasons};}
/* ============================================================================
   AI PROXY (audit AI-001). The app's content-security policy lets it talk only to its own origin, so it can never post
   the record anywhere else; model calls therefore come through here, and the provider key stays on the server.
   One normalised request \u2014 {system, messages, tools, maxTokens}, messages being user / assistant (with toolCalls) /
   tool (toolCallId, name, content) \u2014 is translated for Anthropic, OpenAI (and any OpenAI-compatible local server:
   Ollama, LM Studio) or Gemini, and the reply normalised back to {text, toolCalls, stop}. Prompt and reply content are
   never logged. Configure: AI_PROVIDER (anthropic | openai | gemini), AI_MODEL, AI_API_KEY, AI_BASE_URL (optional).
   ============================================================================ */
const AI_DEFAULT_BASE={anthropic:'https://api.anthropic.com',openai:'https://api.openai.com',gemini:'https://generativelanguage.googleapis.com'};
function aiConfig(env){env=env||process.env;const p=env.AI_PROVIDER;if(!p||!AI_DEFAULT_BASE[p])return null;const base=(env.AI_BASE_URL||AI_DEFAULT_BASE[p]).replace(/\/$/,'');
  if(!env.AI_MODEL)return null;if(!env.AI_API_KEY&&!(p==='openai'&&env.AI_BASE_URL))return null;   /* a local OpenAI-compatible server may need no key */
  /* OpenAI's own API wants max_completion_tokens; other OpenAI-compatible servers (local, gateways) want max_tokens.
     Decided by the host, not by whether a base URL was set; AI_TOKEN_FIELD overrides. */
  const official=/^https:\/\/api\.openai\.com$/.test(base);
  return {provider:p,model:env.AI_MODEL,key:env.AI_API_KEY||'',base,local:p==='openai'&&!official,tokenField:env.AI_TOKEN_FIELD||(official?'max_completion_tokens':'max_tokens')};}
const aiTranslate={
  anthropic:{request(c,r){const msgs=[];for(const m of r.messages){if(m.role==='tool'){const block={type:'tool_result',tool_use_id:m.toolCallId,content:String(m.content)};
        const last=msgs[msgs.length-1];if(last&&last.role==='user'&&Array.isArray(last.content)&&last.content.every(b=>b.type==='tool_result'))last.content.push(block);else msgs.push({role:'user',content:[block]});}
      else if(m.role==='assistant'&&m.toolCalls&&m.toolCalls.length)msgs.push({role:'assistant',content:(m.content?[{type:'text',text:m.content}]:[]).concat(m.toolCalls.map(t=>({type:'tool_use',id:t.id,name:t.name,input:t.input||{}})))});
      else msgs.push({role:m.role,content:String(m.content)});}
    return {url:c.base+'/v1/messages',headers:{'content-type':'application/json','x-api-key':c.key,'anthropic-version':'2023-06-01'},
      body:{model:c.model,max_tokens:r.maxTokens||1024,system:r.system||undefined,messages:msgs,tools:(r.tools||[]).length?r.tools.map(t=>({name:t.name,description:t.description,input_schema:t.schema})):undefined}};},
    response(j){const parts=j.content||[];return {text:parts.filter(b=>b.type==='text').map(b=>b.text).join(''),toolCalls:parts.filter(b=>b.type==='tool_use').map(b=>({id:b.id,name:b.name,input:b.input||{}})),
      stop:j.stop_reason==='tool_use'?'tool':(j.stop_reason==='max_tokens'?'length':'end'),usage:j.usage?{input:j.usage.input_tokens,output:j.usage.output_tokens}:null};}},
  openai:{request(c,r){const msgs=[];if(r.system)msgs.push({role:'system',content:r.system});
      for(const m of r.messages){if(m.role==='tool')msgs.push({role:'tool',tool_call_id:m.toolCallId,content:String(m.content)});
        else if(m.role==='assistant'&&m.toolCalls&&m.toolCalls.length)msgs.push({role:'assistant',content:m.content||null,tool_calls:m.toolCalls.map(t=>({id:t.id,type:'function',function:{name:t.name,arguments:JSON.stringify(t.input||{})}}))});
        else msgs.push({role:m.role,content:String(m.content)});}
      const body={model:c.model,messages:msgs};body[c.tokenField||'max_tokens']=r.maxTokens||1024;
      if((r.tools||[]).length)body.tools=r.tools.map(t=>({type:'function',function:{name:t.name,description:t.description,parameters:t.schema}}));
      return {url:c.base+'/v1/chat/completions',headers:Object.assign({'content-type':'application/json'},c.key?{authorization:'Bearer '+c.key}:{}),body};},
    response(j){const ch=(j.choices||[])[0]||{},m=ch.message||{};return {text:m.content||'',toolCalls:(m.tool_calls||[]).map(t=>{let input={};try{input=JSON.parse(t.function&&t.function.arguments||'{}');}catch(e){input={__unparsed:String(t.function&&t.function.arguments)};}return {id:t.id,name:t.function&&t.function.name,input};}),
      stop:ch.finish_reason==='tool_calls'?'tool':(ch.finish_reason==='length'?'length':'end'),usage:j.usage?{input:j.usage.prompt_tokens,output:j.usage.completion_tokens}:null};}},
  gemini:{request(c,r){const contents=[];for(const m of r.messages){if(m.role==='tool'){const part={functionResponse:{name:m.name,response:{content:String(m.content)}}};const last=contents[contents.length-1];
        if(last&&last.role==='user'&&last.parts.every(p=>p.functionResponse))last.parts.push(part);else contents.push({role:'user',parts:[part]});}
      else if(m.role==='assistant')contents.push({role:'model',parts:(m.content?[{text:m.content}]:[]).concat((m.toolCalls||[]).map(t=>({functionCall:{name:t.name,args:t.input||{}}})))});
      else contents.push({role:'user',parts:[{text:String(m.content)}]});}
      const body={contents,generationConfig:{maxOutputTokens:r.maxTokens||1024}};if(r.system)body.systemInstruction={parts:[{text:r.system}]};
      if((r.tools||[]).length)body.tools=[{functionDeclarations:r.tools.map(t=>({name:t.name,description:t.description,parameters:t.schema}))}];
      return {url:c.base+'/v1beta/models/'+encodeURIComponent(c.model)+':generateContent',headers:{'content-type':'application/json','x-goog-api-key':c.key},body};},
    response(j){const cand=(j.candidates||[])[0]||{},parts=(cand.content&&cand.content.parts)||[];const calls=parts.filter(p=>p.functionCall).map((p,i)=>({id:'call_'+i+'_'+p.functionCall.name,name:p.functionCall.name,input:p.functionCall.args||{}}));
      return {text:parts.filter(p=>typeof p.text==='string').map(p=>p.text).join(''),toolCalls:calls,stop:calls.length?'tool':(cand.finishReason==='MAX_TOKENS'?'length':'end'),usage:j.usageMetadata?{input:j.usageMetadata.promptTokenCount,output:j.usageMetadata.candidatesTokenCount}:null};}}};
function _aiRequestOk(r){if(!r||!Array.isArray(r.messages)||!r.messages.length||r.messages.length>40)return 'messages: 1 to 40';
  const size=JSON.stringify(r).length;if(size>120000)return 'request too large';if((r.tools||[]).length>16)return 'at most 16 tools';
  for(const m of r.messages)if(['user','assistant','tool'].indexOf(m.role)<0)return 'unknown role '+m.role;return null;}
const _AI_RATE=new Map();
async function aiComplete(r,env){const c=aiConfig(env);if(!c)return {code:503,body:{error:'AI is not configured on this server (AI_PROVIDER, AI_MODEL, AI_API_KEY)'}};
  const bad=_aiRequestOk(r);if(bad)return {code:400,body:{error:bad}};const T=aiTranslate[c.provider],q=T.request(c,r),t0=Date.now();
  const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),+(env&&env.AI_TIMEOUT_MS||process.env.AI_TIMEOUT_MS||60000));
  try{const resp=await fetch(q.url,{method:'POST',headers:q.headers,body:JSON.stringify(q.body),signal:ac.signal});const j=await resp.json().catch(()=>({}));
    if(!resp.ok){log('warn','ai provider error',{provider:c.provider,status:resp.status,ms:Date.now()-t0});return {code:502,body:{error:'the model provider returned HTTP '+resp.status,detail:String((j.error&&(j.error.message||j.error))||'').slice(0,200)}};}
    const out=T.response(j);log('info','ai call',{provider:c.provider,model:c.model,ms:Date.now()-t0,tools:out.toolCalls.length,usage:out.usage});   /* sizes and timing only, never content */
    return Object.assign({provider:c.provider,model:c.model},out);}
  catch(e){return {code:504,body:{error:e.name==='AbortError'?'the model provider timed out':'the model provider could not be reached'}};}finally{clearTimeout(timer);}}
const server=http.createServer(async(req,res)=>{
  /* Behind a reverse proxy (Vercel's /api/sync rewrite) every request arrives from the proxy, so a per-socket limit would
     throttle everyone together. With TRUST_PROXY=1 the client address comes from X-Forwarded-For. Only set it behind a
     proxy you run: otherwise a client can choose its own address. */
  const fwd=process.env.TRUST_PROXY==='1'?String(req.headers['x-forwarded-for']||'').split(',')[0].trim():'';
  const sock=req.socket.remoteAddress||'?',ip=fwd||sock;
  /* The connecting socket is limited as well (with a ceiling fit for a proxy carrying many people), so a forged
     X-Forwarded-For can only share out one socket's allowance, never escape the limit. */
  if(fwd&&!rateOk('sock:'+sock,RATE_MAX*(+process.env.PROXY_RATE_FACTOR||20)))return json(res,429,{error:'too many requests'});
  if(req.method==='OPTIONS')return json(res,204,{});
  if(!rateOk(ip)){METRICS.rateLimited++;return json(res,429,{error:'too many requests'});}
  let url;try{url=new URL(req.url,'http://'+(req.headers.host||'localhost'));}catch(e){return json(res,400,{error:'bad url'});}
  const key=req.method+' '+url.pathname;
  const handler=routes[key];
  /* request tracing (audit S-009): a caller's id is kept if it is safe, otherwise one is made; echoed and logged */
  const rid=/^[A-Za-z0-9_-]{8,64}$/.test(String(req.headers['x-request-id']||''))?String(req.headers['x-request-id']):crypto.randomBytes(9).toString('base64url');
  res.setHeader('x-request-id',rid);req._rid=rid;
  res.on('finish',()=>{const k=(handler?key:'unknown')+' '+res.statusCode;METRICS.requests[k]=(METRICS.requests[k]||0)+1;if(res.statusCode>=500){METRICS.errors++;METRICS.errorsByRoute[k]=(METRICS.errorsByRoute[k]||0)+1;}});
  if(!handler)return json(res,404,{error:'no such endpoint',endpoints:Object.keys(routes)});
  let body={};
  if(key==='POST /v1/ext/webhook'){   /* signatures cover the exact bytes: the raw body is kept */
    const chunks=[];let size=0;await new Promise((ok,no)=>{req.on('data',c=>{size+=c.length;if(size<=MAX_BODY)chunks.push(c);});req.on('end',ok);req.on('error',no);});body={__raw:Buffer.concat(chunks).toString('utf8')};
  }else if(req.method==='POST'){
    try{body=await readBody(req);}catch(e){return json(res,413,{error:String(e.message)});}
  }
  try{
    const out=await handler(req,body,url);
    if(out&&out.file){res.writeHead(200,{'content-type':out.type||'application/octet-stream','content-disposition':'attachment; filename="'+(out.name||'download')+'"','cache-control':'no-store'});
      const rs=fs.createReadStream(out.file);rs.pipe(res);rs.on('close',()=>{try{fs.unlinkSync(out.file);}catch(e){}});return;}
    if(out&&out.redirect){res.writeHead(302,{location:out.redirect,'cache-control':'no-store'});return res.end();}   /* the sign-in callback returns to the app */
    if(out&&out.code===204){res.writeHead(204);return res.end();}
    if(out&&out.code)return json(res,out.code,out.body);
    return json(res,200,out);
  }catch(e){
    log('error','handler failed',{route:key,error:String(e&&e.message),requestId:rid});
    /* error aggregation (audit S-010): the latest failures with their route and request id */
    METRICS.recentErrors.push({at:new Date().toISOString(),route:key,error:String(e&&e.message).slice(0,200),requestId:rid});if(METRICS.recentErrors.length>20)METRICS.recentErrors.shift();
    return json(res,500,{error:'internal error'});
  }
});

const _restoreArg=process.argv.indexOf('--restore-from-s3');
if(process.env.PHYSIQUE_SERVER_TEST!=='1'&&_restoreArg>=0){restoreFromS3(process.argv[_restoreArg+1],process.env,{force:process.argv.includes('--force')}).then(r=>{log('info','restored',r);process.exit(0);},e=>{log('error','restore failed',{error:String(e.message)});process.exit(1);});}
else if(process.env.PHYSIQUE_SERVER_TEST!=='1'&&process.env.PHYSIQUE_PRODUCTION==='1'&&productionPreflight().length){productionPreflight().forEach(x=>log('error','production preflight: '+x));log('error','refusing to start in production mode');process.exit(1);}
else if(process.env.PHYSIQUE_SERVER_TEST!=='1'&&_s3cfg()){const h=+(process.env.BACKUP_INTERVAL_HOURS||24);setTimeout(()=>runBackup(),60e3).unref();setInterval(()=>runBackup(),h*3600e3).unref();}
if(process.env.PHYSIQUE_SERVER_TEST!=='1'&&_restoreArg<0)server.listen(PORT,HOST,()=>{
  log('info','listening',{host:HOST,port:PORT,data:DATA,
    note:'put TLS in front of this before it leaves localhost'});
});
export {server};
/* for tests: load with PHYSIQUE_SERVER_TEST=1 (nothing listens) */
export {aiConfig,aiTranslate,aiComplete,productionPreflight,sigv4,runBackup,restoreFromS3,healthStatus,METRICS,sendPush,retireSubscriptions,normaliseVapid,vapidKeys,readVault,writeVault,appendEvents,readEvents,rateOk,tokens,readConns,writeConns,storageStatus,rotateConnectKeys};
export const _sealForDrill=o=>_seal(o),_openForDrill=e=>_open(e);
