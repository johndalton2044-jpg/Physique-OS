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
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

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
function readVault(id){
  if(!validId(id))return null;
  try{return JSON.parse(fs.readFileSync(vaultMetaPath(id),'utf8'));}catch(e){return null;}
}
function writeVault(v){
  fs.mkdirSync(vaultDir(v.id),{recursive:true});
  const tmp=vaultMetaPath(v.id)+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(v));
  fs.renameSync(tmp,vaultMetaPath(v.id));   // atomic: a crash mid-write never leaves a half-vault
}
function appendEvents(id,rows){
  const p=path.join(vaultDir(id),'events.ndjson');
  fs.appendFileSync(p,rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
}
function readEvents(id,since){
  const p=path.join(vaultDir(id),'events.ndjson');
  if(!fs.existsSync(p))return [];
  const out=[];
  for(const line of fs.readFileSync(p,'utf8').split('\n')){
    if(!line)continue;
    let r;try{r=JSON.parse(line);}catch(e){continue;}
    if(since&&r.serverSeq<=since)continue;
    out.push(r);
  }
  return out;
}
function countEvents(id){
  const p=path.join(vaultDir(id),'events.ndjson');
  if(!fs.existsSync(p))return 0;
  let n=0;const s=fs.readFileSync(p,'utf8');
  for(let i=0;i<s.length;i++)if(s[i]==='\n')n++;
  return n;
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
function rateOk(ip){
  const now=Date.now();
  const r=rate.get(ip)||{n:0,reset:now+RATE_WINDOW_MS};
  if(r.reset<now){r.n=0;r.reset=now+RATE_WINDOW_MS;}
  r.n++;rate.set(ip,r);
  return r.n<=RATE_MAX;
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
function vapidKeys(){
  if(process.env.PHYSIQUE_VAPID_JSON){try{return JSON.parse(process.env.PHYSIQUE_VAPID_JSON);}catch(e){log('warn','PHYSIQUE_VAPID_JSON is not valid JSON');}}
  if(fs.existsSync(vapidPath))return JSON.parse(fs.readFileSync(vapidPath,'utf8'));
  const {publicKey,privateKey}=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  const pub=publicKey.export({type:'spki',format:'der'});
  const keys={publicKey:Buffer.from(pub.subarray(pub.length-65)).toString('base64url'),
    privateKeyPem:privateKey.export({type:'pkcs8',format:'pem'}),createdAt:new Date().toISOString()};
  fs.writeFileSync(vapidPath,JSON.stringify(keys));
  log('info','vapid keypair generated; copy '+vapidPath+' into PHYSIQUE_VAPID_JSON to keep push working after the disk is wiped');
  return keys;
}
const VAPID=vapidKeys();
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
async function sendPush(sub,payloadText){
  /* Payload encryption (aes128gcm) is required by the spec for a body. A nudge needs no body, so this sends
     a bodiless push, which is allowed, needs no content encryption, and leaks nothing to the push service. */
  return new Promise(resolve=>{
    let url;try{url=new URL(sub.endpoint);}catch(e){return resolve({ok:false,reason:'bad endpoint'});}
    const req=http.request({protocol:url.protocol,hostname:url.hostname,port:url.port||(url.protocol==='https:'?443:80),
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
    const u='https://api.open-meteo.com/v1/forecast?latitude='+c.lat+'&longitude='+c.lon+'&current='+OM_CURRENT.join(',')+'&hourly='+OM_HOURLY.join(',')+'&daily='+OM_DAILY.join(',')+
      '&past_days='+past+'&forecast_days='+days+'&timezone='+encodeURIComponent(tz)+'&wind_speed_unit=ms&timeformat=iso8601';
    return extCall('open-meteo','open-meteo-forecast',u,null,15*60000);},
  'GET /v1/ext/weather/archive':async(req,body,url)=>{const c=extCoords(url);if(c.err)return c.err;
    const s=url.searchParams.get('start'),e=url.searchParams.get('end'),tz=extTz(url);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(s||'')||!/^\d{4}-\d{2}-\d{2}$/.test(e||'')||e<s)return extErr(400,'invalid_timestamp','start and end dates are required, start first');
    if((Date.parse(e)-Date.parse(s))/86400000>366)return extErr(400,'configuration_error','at most one year per request');
    const u='https://archive-api.open-meteo.com/v1/archive?latitude='+c.lat+'&longitude='+c.lon+'&start_date='+s+'&end_date='+e+'&hourly='+OM_ARCHIVE_HOURLY.join(',')+'&daily='+OM_ARCHIVE_DAILY.join(',')+'&timezone='+encodeURIComponent(tz)+'&wind_speed_unit=ms';
    return extCall('open-meteo','open-meteo-archive',u,null,24*3600000);},
  'GET /v1/ext/weather/air-quality':async(req,body,url)=>{const c=extCoords(url);if(c.err)return c.err;
    const past=extClamp(url.searchParams.get('past_days'),0,92,7),days=extClamp(url.searchParams.get('forecast_days'),1,7,5),tz=extTz(url);
    const u='https://air-quality-api.open-meteo.com/v1/air-quality?latitude='+c.lat+'&longitude='+c.lon+'&current='+OM_AQ.join(',')+'&hourly='+OM_AQ.join(',')+'&past_days='+past+'&forecast_days='+days+'&timezone='+encodeURIComponent(tz);
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
  /* The base address answers with an index, not "no such endpoint": people open it to check the server. */
  'GET /':async()=>({ok:true,service:'physique-os-sync',health:'/v1/health',note:'This is the Physique OS server. The app talks to it; there is nothing to see here.'}),
  'GET /v1':async()=>({ok:true,service:'physique-os-sync',health:'/v1/health'}),
  'GET /v1/health':async()=>({ok:true,service:'physique-os-sync',version:1,ext:EXT_VERSION,epoch:DATA_EPOCH,startedAt:STARTED_AT,storage:STORAGE_NOTE,
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
    const existing=countEvents(v.id);
    if(existing+body.events.length>MAX_EVENTS_PER_VAULT)return {code:507,body:{error:'vault event limit reached'}};
    const rows=[];
    for(const e of body.events){
      if(!e||typeof e.id!=='string'||typeof e.ciphertext!=='string')
        return {code:400,body:{error:'each event needs an id and a ciphertext'}};
      if(e.ciphertext.length>256*1024)return {code:400,body:{error:'event too large'}};
      rows.push({id:e.id,ciphertext:e.ciphertext,iv:String(e.iv||''),device:String(e.device||'').slice(0,64),
        serverSeq:++v.serverSeq,receivedAt:new Date().toISOString()});
    }
    if(rows.length){appendEvents(v.id,rows);writeVault(v);}
    log('info','events appended',{vault:v.id.slice(0,8),count:rows.length,serverSeq:v.serverSeq});
    return {code:200,body:{ok:true,accepted:rows.length,serverSeq:v.serverSeq}};
  },

  'GET /v1/events':async(req,body,url)=>{
    const auth=authFor(req);
    if(!auth)return {code:401,body:{error:'authenticate first'}};
    const v=readVault(auth.vaultId);
    if(!v)return {code:404,body:{error:'no such vault'}};
    const since=+(url.searchParams.get('since')||0);
    const limit=Math.min(5000,+(url.searchParams.get('limit')||5000));
    const all=readEvents(v.id,since);
    const page=all.slice(0,limit);
    return {code:200,body:{events:page,serverSeq:v.serverSeq,epoch:DATA_EPOCH,more:all.length>page.length,
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
    return {code:200,body:{ok:true,sent:results.filter(r=>r.ok).length,attempted:results.length}};
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

const server=http.createServer(async(req,res)=>{
  /* Behind a reverse proxy (Vercel's /api/sync rewrite) every request arrives from the proxy, so a per-socket limit would
     throttle everyone together. With TRUST_PROXY=1 the client address comes from X-Forwarded-For. Only set it behind a
     proxy you run: otherwise a client can choose its own address. */
  const fwd=process.env.TRUST_PROXY==='1'?String(req.headers['x-forwarded-for']||'').split(',')[0].trim():'';
  const ip=fwd||req.socket.remoteAddress||'?';
  if(req.method==='OPTIONS')return json(res,204,{});
  if(!rateOk(ip))return json(res,429,{error:'too many requests'});
  let url;try{url=new URL(req.url,'http://'+(req.headers.host||'localhost'));}catch(e){return json(res,400,{error:'bad url'});}
  const key=req.method+' '+url.pathname;
  const handler=routes[key];
  if(!handler)return json(res,404,{error:'no such endpoint',endpoints:Object.keys(routes)});
  let body={};
  if(req.method==='POST'){
    try{body=await readBody(req);}catch(e){return json(res,413,{error:String(e.message)});}
  }
  try{
    const out=await handler(req,body,url);
    if(out&&out.code)return json(res,out.code,out.body);
    return json(res,200,out);
  }catch(e){
    log('error','handler failed',{route:key,error:String(e&&e.message)});
    return json(res,500,{error:'internal error'});
  }
});

server.listen(PORT,HOST,()=>{
  log('info','listening',{host:HOST,port:PORT,data:DATA,
    note:'put TLS in front of this before it leaves localhost'});
});
export {server};
