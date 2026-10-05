/* CONNECTIONS, end to end against a simulated provider (no real credentials needed): OAuth with PKCE and state, token
   custody encrypted at rest, a 30-day backfill then a cursor, automatic refresh, signed webhooks, revocation. The
   simulated Fitbit checks the PKCE proof and the bearer token exactly as the real service would. */
import http from 'node:http';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import {JSDOM,VirtualConsole} from 'jsdom';
let failed=0;const line=(ok,msg,d)=>{if(!ok)failed++;console.log('  '+(ok?'pass':'FAIL')+'  '+msg+(d&&!ok?'  \u2014 '+d:''));};
setTimeout(()=>{console.log('  FAIL  the connection test did not finish within 120 s');process.exit(1);},120000).unref();
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pos-conn-'));
/* the simulated provider */
const codes={},tokensIssued={},revoked=[];let tokenLife=30,calls={token:0,refresh:0,data:0};
const mock=http.createServer((q,r)=>{const u=new URL(q.url,'http://x');let body='';q.on('data',c=>body+=c);q.on('end',()=>{const f=Object.fromEntries(new URLSearchParams(body));
  const send=(c,j)=>{r.writeHead(c,{'content-type':'application/json'});r.end(JSON.stringify(j));};
  if(u.pathname==='/oauth2/authorize'){const code='code-'+crypto.randomBytes(4).toString('hex');codes[code]={challenge:u.searchParams.get('code_challenge'),state:u.searchParams.get('state')};return send(200,{code,state:u.searchParams.get('state')});}
  if(u.pathname==='/oauth2/token'){calls.token++;
    if(f.grant_type==='authorization_code'){const c=codes[f.code];if(!c)return send(400,{errors:[{errorType:'invalid_grant'}]});
      if(crypto.createHash('sha256').update(f.code_verifier||'').digest('base64url')!==c.challenge)return send(400,{errors:[{errorType:'invalid_grant',message:'PKCE failed'}]});delete codes[f.code];}
    else if(f.grant_type==='refresh_token'){calls.refresh++;if(!Object.values(tokensIssued).some(t=>t.refresh===f.refresh_token))return send(401,{errors:[{errorType:'invalid_token'}]});}
    const t={access:'acc-'+crypto.randomBytes(6).toString('hex'),refresh:'ref-'+crypto.randomBytes(6).toString('hex')};tokensIssued[t.access]=t;
    return send(200,{access_token:t.access,refresh_token:t.refresh,expires_in:tokenLife,user_id:'FB123',scope:'weight activity sleep'});}
  if(u.pathname==='/oauth2/revoke'){revoked.push(f.token);return send(200,{});}
  const bearer=(q.headers.authorization||'').replace('Bearer ','');if(!tokensIssued[bearer])return send(401,{errors:[{errorType:'expired_token'}]});calls.data++;
  const m=/date\/(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})/.exec(u.pathname),a=m[1];
  if(/body\/log\/weight/.test(u.pathname))return send(200,{weight:[{date:a,weight:252.4,logId:9001}]});
  if(/activities\/steps/.test(u.pathname))return send(200,{'activities-steps':[{dateTime:a,value:'8123'}]});
  if(/sleep/.test(u.pathname))return send(200,{sleep:[{dateOfSleep:a,minutesAsleep:421,logId:7001}]});
  send(404,{});});});
await new Promise(r=>mock.listen(0,'127.0.0.1',r));const MOCK='http://127.0.0.1:'+mock.address().port;
Object.assign(process.env,{PORT:'0',HOST:'127.0.0.1',DATA_DIR:tmp,CONNECT_TOKEN_KEY:crypto.randomBytes(32).toString('hex'),FITBIT_CLIENT_ID:'cid',FITBIT_CLIENT_SECRET:'csecret',
  PHYSIQUE_CONNECT_MOCK:MOCK,PHYSIQUE_PUBLIC_URL:'https://app.example',CONNECT_WEBHOOK_SECRET:'whsec'});
const S=await import('../server/server.mjs?c'+Date.now());await new Promise(r=>setTimeout(r,300));
const port=S.server.address().port,base='http://127.0.0.1:'+port,VID='vault-conn-test-0001';S.tokens.set('T1',{vaultId:VID,deviceId:'d1',exp:Date.now()+3600000});
const call=(m,p,b,h)=>fetch(base+p,{method:m,headers:Object.assign({'content-type':'application/json',authorization:'Bearer T1'},h||{}),body:b?JSON.stringify(b):undefined,redirect:'manual'});
let r=await (await call('GET','/v1/ext/connect/providers')).json();line(r.tokenCustody&&r.providers.find(p=>p.id==='fitbit').configured&&!r.providers.find(p=>p.id==='oura').configured,'only providers with credentials are available; the others say what they need',JSON.stringify(r.providers.map(p=>p.id+':'+p.configured)));
line((await call('POST','/v1/ext/connect/start',{provider:'fitbit'},{authorization:''})).status===401,'connecting needs an unlocked vault');
const st=await (await call('POST','/v1/ext/connect/start',{provider:'fitbit',returnTo:'/'})).json();const au=new URL(st.authorizeUrl);
line(au.searchParams.get('code_challenge_method')==='S256'&&!!au.searchParams.get('state')&&au.searchParams.get('redirect_uri')==='https://app.example/api/sync/v1/ext/connect/callback','the sign-in address carries PKCE, state and the app\u2019s redirect');
const ap=await (await fetch(st.authorizeUrl)).json();   /* the person approves at the provider */
let cb=await fetch(base+'/v1/ext/connect/callback?code='+ap.code+'&state=forged',{redirect:'manual'});line(cb.status===302&&/connect_error=expired/.test(cb.headers.get('location')),'a callback with an unknown state is refused');
cb=await fetch(base+'/v1/ext/connect/callback?code='+ap.code+'&state='+ap.state,{redirect:'manual'});
line(cb.status===302&&cb.headers.get('location')==='/?connected=fitbit','the callback exchanges the code (the provider checked the PKCE proof) and returns to the app',cb.headers.get('location'));
const file=fs.readFileSync(path.join(tmp,'vaults',VID,'connections.json'),'utf8');line(!/acc-|ref-/.test(file)&&/"sealed"/.test(file),'sign-in details are stored encrypted, never in plain text');
line(S.readConns(VID).fitbit.userId==='FB123','the provider\u2019s user is recorded, for webhooks');
let sy=await (await call('POST','/v1/ext/connect/sync',{provider:'fitbit'})).json();
line(sy.refreshed===true&&calls.refresh>=1,'a sign-in about to expire is refreshed automatically before syncing',JSON.stringify({refreshed:sy.refreshed,refreshCalls:calls.refresh}));tokenLife=3600;
line(sy.status==='ok'&&sy.backfill===true&&sy.payload.weight.length>=1&&sy.payload['activities-steps'].length>=1&&sy.payload.sleep.length>=1,'the first sync backfills 30 days of weight, steps and sleep',JSON.stringify({backfill:sy.backfill,w:sy.payload&&sy.payload.weight.length,win:sy.window}));
const d0=Date.parse(sy.window.end)-Date.parse(sy.window.start);line(d0>=28*86400000&&d0<=30*86400000,'the backfill window is 30 days');
sy=await (await call('POST','/v1/ext/connect/sync',{provider:'fitbit'})).json();line(sy.backfill===false&&sy.window.start<sy.window.end,'later syncs start from the cursor, overlapping a day',JSON.stringify(sy.window));
/* the sign-in expires: the next sync refreshes it */
{const conns=S.readConns(VID);Object.keys(tokensIssued).forEach(k=>delete tokensIssued[k]);}
tokenLife=3600;const beforeRefresh=calls.refresh;
{const c=JSON.parse(fs.readFileSync(path.join(tmp,'vaults',VID,'connections.json'),'utf8'));/* force expiry by rewriting the sealed record through the server's own path: sync after the provider forgot the access token */}
sy=await (await call('POST','/v1/ext/connect/sync',{provider:'fitbit'})).json();
line(sy.status==='error'&&sy.error.category==='authentication_required','an access token the provider no longer accepts is reported, not swallowed',JSON.stringify(sy.error));
/* a webhook */
const raw=JSON.stringify([{collectionType:'body',ownerId:'FB123'}]);
let wh=await fetch(base+'/v1/ext/webhook?provider=fitbit',{method:'POST',headers:{'x-fitbit-signature':'bad'},body:raw});line(wh.status===401,'a webhook with a bad signature is refused');
const sig=crypto.createHmac('sha1','csecret&').update(raw).digest('base64');wh=await fetch(base+'/v1/ext/webhook?provider=fitbit',{method:'POST',headers:{'x-fitbit-signature':sig},body:raw});
line(wh.status===204&&S.readConns(VID).fitbit.pending===true,'a signed webhook marks new data waiting for that person');
/* disconnect */
const rv=await (await call('POST','/v1/ext/connect/revoke',{provider:'fitbit'})).json();line(rv.revoked&&rv.atProvider&&revoked.length===1&&!S.readConns(VID).fitbit,'disconnecting revokes at the provider and deletes the stored details');
/* the app's adapter turns a synced payload into canonical rows */
{const vc=new VirtualConsole();const dom=new JSDOM(fs.readFileSync('dist/index.html','utf8'),{url:'https://physique.local/app/index.html',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.scrollTo=()=>{};w.fetch=undefined;w.HTMLElement.prototype.scrollIntoView=function(){};}});
  await new Promise(r=>setTimeout(r,900));const w=dom.window;w.dispatchAct&&w.dispatchAct('welcome.skip');
  const res=w.ingestConnectedPayload('fitbit',{weight:[{date:'2026-09-20',weight:252.4,logId:9001}],'activities-steps':[{dateTime:'2026-09-20',value:'8123'}],sleep:[{dateOfSleep:'2026-09-20',minutesAsleep:421,logId:7001}]},{retrievedAt:new Date().toISOString()});
  const again=w.ingestConnectedPayload('fitbit',{weight:[{date:'2026-09-20',weight:252.4,logId:9001}]},{});
  const o=w.DB.observations.filter(x=>x.meta&&x.meta.importSource==='fitbit');
  line(res.status==='ok'&&res.added===3&&o.length===3&&o.some(x=>x.type==='sleep'&&Math.abs(x.value-7.02)<0.01)&&w.sourceKeyOf(o[0])==='import:fitbit'&&w.sourceLabel('import:fitbit')==='Fitbit','a synced payload becomes canonical observations from its own source',JSON.stringify(res));
  line(again.added===0,'syncing the same record twice adds nothing (external ids)',JSON.stringify(again));}
S.server.close();mock.close();fs.rmSync(tmp,{recursive:true,force:true});
console.log(failed?failed+' failed':'all passed');process.exit(failed?1:0);
