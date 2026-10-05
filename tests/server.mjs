/* SERVER HARDENING (review of server/server.mjs): push delivery over HTTPS, the push-key startup invariant, retiring dead
   subscriptions, recovering a vault from its ledger after a crash between append and metadata, a torn last line, bounded
   indexed reads, and the proxy boundary of the rate limit. The server is loaded without listening. */
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import https from 'node:https';import http from 'node:http';import crypto from 'node:crypto';import {execSync} from 'node:child_process';
let failed=0;const line=(ok,msg,d)=>{if(!ok)failed++;console.log('  '+(ok?'pass':'FAIL')+'  '+msg+(d&&!ok?'  \u2014 '+d:''));};
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pos-srv-'));
/* a real P-256 pair in web-push's format */
const kp=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'});const jw=kp.privateKey.export({format:'jwk'});
const PUB=Buffer.concat([Buffer.from([4]),Buffer.from(jw.x,'base64url'),Buffer.from(jw.y,'base64url')]).toString('base64url'),PRIV=jw.d;
Object.assign(process.env,{PHYSIQUE_SERVER_TEST:'1',DATA_DIR:tmp,LEDGER_INDEX_IDS:'8',VAPID_PUBLIC_KEY:PUB,VAPID_PRIVATE_KEY:PRIV,NODE_TLS_REJECT_UNAUTHORIZED:'0'});
const S=await import('../server/server.mjs?'+Date.now());
/* 1. the push-key invariant */
line(S.vapidKeys().publicKey===PUB&&/BEGIN PRIVATE KEY/.test(S.vapidKeys().privateKeyPem),'web-push format keys (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY) are accepted and converted');
const other=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}).privateKey.export({format:'jwk'}).d;
let threw=null;try{S.normaliseVapid(PUB,other,null,'test');}catch(e){threw=e.message;}line(/does not belong|does not parse/.test(threw||''),'a private key that does not match the public key is refused',threw);
threw=null;try{S.normaliseVapid('not-a-key',PRIV,null,'test');}catch(e){threw=e.message;}line(/uncompressed P-256/.test(threw||''),'a malformed public key is refused',threw);
threw=null;process.env.VAPID_PUBLIC_KEY='';process.env.VAPID_PRIVATE_KEY='';process.env.PHYSIQUE_VAPID_JSON='{not json';try{S.vapidKeys();}catch(e){threw=e.message;}
line(/not valid JSON/.test(threw||''),'malformed PHYSIQUE_VAPID_JSON stops startup instead of generating new keys',threw);
process.env.PHYSIQUE_VAPID_JSON=JSON.stringify({publicKey:PUB,privateKey:PRIV});line(S.vapidKeys().publicKey===PUB,'PHYSIQUE_VAPID_JSON in web-push format is accepted');
delete process.env.PHYSIQUE_VAPID_JSON;
/* 2. push delivery over HTTPS, to a local HTTPS push service */
execSync(`openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -keyout ${tmp}/k.pem -out ${tmp}/c.pem -days 1 -subj /CN=localhost 2>/dev/null`);
let got=null;const pushSvc=https.createServer({key:fs.readFileSync(tmp+'/k.pem'),cert:fs.readFileSync(tmp+'/c.pem')},(q,r)=>{got={method:q.method,auth:q.headers.authorization||'',ttl:q.headers.ttl};r.writeHead(q.url.includes('gone')?410:201);r.end();});
await new Promise(r=>pushSvc.listen(0,'127.0.0.1',r));const port=pushSvc.address().port;
const ok=await S.sendPush({endpoint:`https://127.0.0.1:${port}/push/abc`});
line(ok.ok===true&&got&&got.method==='POST'&&/^vapid t=.+, k=/.test(got.auth),'a push reaches an HTTPS push service, signed with VAPID',JSON.stringify({ok,got}));
const gone=await S.sendPush({endpoint:`https://127.0.0.1:${port}/push/gone`});line(gone.status===410,'the push service\u2019s "gone" answer is reported',JSON.stringify(gone));
pushSvc.close();
/* 3. dead subscriptions are retired */
const v0={pushSubscriptions:[{endpoint:'a'},{endpoint:'b'},{endpoint:'c',failures:4}]};
const removed=S.retireSubscriptions(v0,[{endpoint:'a'},{endpoint:'b'},{endpoint:'c'}],[{ok:true},{ok:false,status:410},{ok:false,status:500}]);
line(removed===2&&v0.pushSubscriptions.length===1&&v0.pushSubscriptions[0].endpoint==='a','a 410 removes a subscription at once, and a fifth failure in a row removes it too',JSON.stringify(v0));
/* 4. recovery from the ledger after a crash between append and metadata */
const id=crypto.randomBytes(16).toString('hex');   /* the server's vault id format: 32 hex */const vault={id,serverSeq:0,devices:[],createdAt:new Date().toISOString()};S.writeVault(vault);
const rows=n=>Array.from({length:n},(_,i)=>({id:'e'+(vault.serverSeq+i+1),ciphertext:'x',iv:'',serverSeq:vault.serverSeq+i+1}));
S.appendEvents(vault,rows(3));   /* the ledger is written ... and the process "dies" before writeVault */
const rec=S.readVault(id);line(rec.serverSeq===3&&rec.eventCount===3,'a vault is recovered from its ledger after a crash between append and metadata',JSON.stringify({seq:rec.serverSeq,count:rec.eventCount}));
/* 5. a torn last line is fenced off */
fs.appendFileSync(path.join(tmp,'vaults',id,'events.ndjson'),'{"id":"torn","cipher');
const v1=S.readVault(id);v1.serverSeq=3;S.appendEvents(v1,[{id:'e4',ciphertext:'x',iv:'',serverSeq:4}]);v1.serverSeq=4;S.writeVault(v1);
const all=S.readEvents(S.readVault(id),0,100).rows.map(r=>r.serverSeq);line(JSON.stringify(all)==='[1,2,3,4]','a torn line from a crash mid-append is skipped, and the next append is not glued to it',JSON.stringify(all));
/* 6. bounded, indexed reads */
const v2=S.readVault(id);let seq=v2.serverSeq;const big=Array.from({length:1200},()=>({id:'b'+(++seq),ciphertext:'x',iv:'',serverSeq:seq}));S.appendEvents(v2,big);v2.serverSeq=seq;S.writeVault(v2);
const v3=S.readVault(id);const p1=S.readEvents(v3,0,500),p2=S.readEvents(v3,1000,500);
line(p1.rows.length===500&&p1.more===true,'a page stops at its limit and says there is more',JSON.stringify({n:p1.rows.length,more:p1.more}));
line(p2.rows.length===204&&p2.rows[0].serverSeq===1001&&p2.more===false,'reading from the middle starts where it should and ends cleanly',JSON.stringify({n:p2.rows.length,first:p2.rows[0]&&p2.rows[0].serverSeq,more:p2.more}));
line(Object.keys(v3.offsets||{}).length>=2&&v3.eventCount===1204,'the vault keeps an offset index and a count, so reads need not scan the file',JSON.stringify({offsets:Object.keys(v3.offsets||{}),count:v3.eventCount}));
/* 7. the proxy boundary: a per-socket ceiling that a forged forwarded address cannot escape */
let n=0;for(let i=0;i<30;i++)if(S.rateOk('sock:test',25))n++;line(n===25,'the socket limit holds whatever addresses are forwarded through it');
/* 8. event ids are idempotent: a re-send is acknowledged and not stored again. Each encryption draws a fresh IV, so a
      re-sent event arrives as different bytes — the id decides, and the first stored copy stands. */
{const vid=crypto.randomBytes(16).toString('hex');S.writeVault({id:vid,serverSeq:0,devices:[],createdAt:new Date().toISOString()});
  const tok='t-'+crypto.randomBytes(8).toString('hex');S.tokens.set(tok,{vaultId:vid,deviceId:'d1',exp:Date.now()+60000});
  const srv=S.server.listen(0,'127.0.0.1');await new Promise(r=>srv.on('listening',r));const base='http://127.0.0.1:'+srv.address().port;
  const post=evs=>fetch(base+'/v1/events',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+tok},body:JSON.stringify({events:evs})}).then(r=>r.json());
  const ev=id=>({id,ciphertext:'ct-'+id+'-'+crypto.randomBytes(6).toString('hex'),iv:'iv',device:'d1'});
  const ledger=()=>S.readEvents(S.readVault(vid),0,1000).rows;
  const first=ev('x1');const a=await post([first,ev('x2'),ev('x1')]);
  line(a.accepted===2&&a.duplicates===1&&a.serverSeq===2,'an id repeated within one batch is stored once',JSON.stringify(a));
  const b=await post([ev('x1'),ev('x2'),ev('x3')]);
  line(b.accepted===1&&b.duplicates===2&&b.serverSeq===3,'a re-sent id is acknowledged and not stored again, though its ciphertext differs',JSON.stringify(b));
  const L=ledger();
  line(L.map(r=>r.id).join()==='x1,x2,x3'&&S.readVault(vid).eventCount===3,'the ledger holds each id once and the count matches it',JSON.stringify({ids:L.map(r=>r.id),count:S.readVault(vid).eventCount}));
  line(L[0].ciphertext===first.ciphertext,'the first copy stored for an id stands');
  const p=path.join(tmp,'vaults',vid,'events.ndjson');
  fs.appendFileSync(p,JSON.stringify({id:'x9',ciphertext:'c',iv:'',serverSeq:4})+'\n');
  const c=await post([ev('x9'),ev('x4')]);
  line(c.accepted===1&&c.duplicates===1&&c.serverSeq===5,'an id written to the ledger outside this process is still recognised',JSON.stringify(c));
  fs.appendFileSync(p,'{"id":"x6","cipher');
  const d=await post([ev('x6')]);
  line(d.accepted===1&&ledger().filter(r=>r.id==='x6').length===1,'an id in a torn last line is not claimed, so its re-send is stored',JSON.stringify(d));
  const long=await fetch(base+'/v1/events',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+tok},body:JSON.stringify({events:[ev('y'.repeat(300))]})});
  line(long.status===400,'an event id longer than any client makes is refused',String(long.status));
  /* the id index is bounded by ids held (8 in this test): a second vault pushes the first out, and the first still
     recognises its ids afterwards, read again from its ledger */
  const vid2=crypto.randomBytes(16).toString('hex');S.writeVault({id:vid2,serverSeq:0,devices:[],createdAt:new Date().toISOString()});
  const tok2='t-'+crypto.randomBytes(8).toString('hex');S.tokens.set(tok2,{vaultId:vid2,deviceId:'d2',exp:Date.now()+60000});
  const post2=evs=>fetch(base+'/v1/events',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+tok2},body:JSON.stringify({events:evs})}).then(r=>r.json());
  await post2([ev('z1'),ev('z2'),ev('z3')]);const held=S.ledgerIndexSize();
  line(held.vaults===1&&held.ids===3,'the id index drops the least recently used vault once it holds more ids than its budget',JSON.stringify(held));
  const again=await post([ev('x1'),ev('x9'),ev('x6')]);
  line(again.accepted===0&&again.duplicates===3,'a vault dropped from the index still recognises its ids',JSON.stringify(again));
  srv.close();}
fs.rmSync(tmp,{recursive:true,force:true});
console.log(failed?failed+' failed':'all passed');process.exit(failed?1:0);
