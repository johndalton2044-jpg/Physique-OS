import path from 'node:path';
import os from 'node:os';
// End-to-end: two independent clients sync a record through the real server, encrypted.
import fs from 'node:fs';import {JSDOM,VirtualConsole} from 'jsdom';import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
/* The test owns the server's lifetime: it starts one on a scratch data directory and kills it at the end,
   so the result never depends on something already running. */
/* os.tmpdir(), not /tmp: /tmp does not exist on Windows. */
const DATA=path.join(os.tmpdir(),'physique-sync-e2e');
fs.rmSync(DATA,{recursive:true,force:true});
const srv=spawn(process.execPath,['server/server.mjs','--port','8791','--data',DATA],{stdio:['ignore','pipe','pipe']});
let serverLog='';srv.stdout.on('data',d=>{serverLog+=d;});srv.stderr.on('data',d=>{serverLog+=d;});
const stop=()=>{try{srv.kill();}catch(e){}};
process.on('exit',stop);process.on('uncaughtException',e=>{console.error(e);stop();process.exit(1);});
await new Promise(r=>setTimeout(r,900));
const html=fs.readFileSync('dist/index.html','utf8');
const PORT=8791, URL_='http://127.0.0.1:'+PORT;
/* Every result below fails the gate when it does not hold; this test used to print them and exit 0 regardless. */
let failures=0;const expect=(label,cond,detail)=>{console.log(label+':',cond,cond?'':(detail||''));if(!cond)failures++;};
function mk(name){
  const vc=new VirtualConsole();vc.on('jsdomError',e=>console.log(name+' ERR:',String(e&&e.message).slice(0,160)));
  const dom=new JSDOM(html,{url:'https://localhost/app/index.html',runScripts:'dangerously',pretendToBeVisual:true,
    virtualConsole:vc,beforeParse(w){
      w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
      w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};
      /* jsdom exposes crypto as a getter-only property, so define over it. */
      Object.defineProperty(w,'crypto',{value:crypto.webcrypto,configurable:true,writable:true});
      w.fetch=(u,o)=>fetch(u,o);                        // node fetch reaches localhost
      w.atob=s=>Buffer.from(s,'base64').toString('binary');
      w.btoa=s=>Buffer.from(s,'binary').toString('base64');
      w.BroadcastChannel=undefined;
    }});
  return dom.window;
}
const A=mk('A'),B=mk('B');globalThis.__windows=(globalThis.__windows||[]).concat([A,B]);
await new Promise(r=>setTimeout(r,600));
for(const w of [A,B]){w.DB=w.emptyDB();w._EVENTS.length=0;w.DB.settings.cloud={url:URL_};w._memoInvalidate();}
A.DB.settings.deviceId='device-A';B.DB.settings.deviceId='device-B';
const PHRASE='correct horse battery staple orange window';

console.log('--- A creates the vault ---');
const created=await A.cloudCreateVault(PHRASE);
console.log('vault created:',JSON.stringify(created).slice(0,80));
expect('vault id is derived, not assigned',created.vaultId===(await A.deriveVault(PHRASE)).vaultId);

console.log('--- A logs data and syncs up ---');
A._NOW_OVERRIDE=A.todayISO();
A.addObservation({type:'weight',date:A.todayISO(),value:221.4,source:'manual'},{silent:true,noSave:true});
A.addObservation({type:'steps',date:A.todayISO(),value:9400,source:'manual'},{silent:true,noSave:true});
const up=await A.cloudSync();
console.log('A sync:',JSON.stringify(up));

console.log('--- the server cannot read any of it ---');
const raw=fs.readFileSync(DATA+'/vaults/'+created.vaultId+'/events.ndjson','utf8');
console.log('stored rows:',raw.trim().split('\n').length);
expect('the stored rows carry no plaintext (weight / 221.4 / steps)',!/weight|221\.4|steps/.test(raw));
console.log('sample row:',raw.trim().split('\n')[0].slice(0,110)+'...');

console.log('--- B joins with the same phrase ---');
await B.cloudUnlock(PHRASE);
// B must be authorised by A, which is what stops a stolen phrase silently joining
let joinBlocked=false;
try{await B.cloudAuthenticate();}catch(e){joinBlocked=/not registered/.test(String(e.message))||e.status===401;}
expect('unknown device refused until authorised',joinBlocked);
const bKeys=await B.deviceKeyPair();
const tok=await (async()=>{await A.cloudAuthenticate();return A._cloud.token;})();
const res=await fetch(URL_+'/v1/vault/device',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+tok},
  body:JSON.stringify({deviceId:'device-B',devicePublicKey:bKeys.publicPem})});
expect('A authorises B',res.status===201,String(res.status));

console.log('--- B pulls and decrypts ---');
const down=await B.cloudSync();
console.log('B sync:',JSON.stringify(down));
expect('B now sees the weight and the steps',B.obsOf('weight').length===1&&B.obsOf('steps').length===1,JSON.stringify({weight:B.obsOf('weight').length,steps:B.obsOf('steps').length}));
expect('B decrypted the actual value',B.obsOf('weight')[0]?.value===221.4,String(B.obsOf('weight')[0]?.value));

console.log('--- concurrent edits converge without loss ---');
B._NOW_OVERRIDE=B.todayISO();
B.addObservation({type:'sleep',date:B.todayISO(),value:7.4,source:'manual'},{silent:true,noSave:true});
A.addObservation({type:'waist',date:A.todayISO(),value:38.2,source:'manual'},{silent:true,noSave:true});
await B.cloudSync();await A.cloudSync();await B.cloudSync();
expect('A has waist+sleep',A.obsOf('waist').length===1&&A.obsOf('sleep').length===1);
expect('B has waist+sleep',B.obsOf('waist').length===1&&B.obsOf('sleep').length===1);
expect('both projections reproduce their records',A.projectionMatchesRecord().ok&&B.projectionMatchesRecord().ok);

console.log('--- each event is stored once, however often it is sent ---');
/* These two fail the gate when false (the lines above only print). Before event ids were idempotent, B uploaded A's
   events straight back after pulling them, and a device that lost its list of sent ids stored its history again. */
const ledgerIds=()=>fs.readFileSync(DATA+'/vaults/'+created.vaultId+'/events.ndjson','utf8').trim().split('\n').map(l=>JSON.parse(l).id);
{const ids=ledgerIds();expect('the ledger holds each event id once',new Set(ids).size===ids.length,ids.length+' rows, '+new Set(ids).size+' ids');
  const rowsBefore=ids.length;A.DB.settings.cloud.pushedIds=[];const resent=await A.cloudSync();
  expect('a device that lost its sent list re-sends without adding rows',resent.sent===0&&ledgerIds().length===rowsBefore,
    JSON.stringify({sent:resent.sent,rows:ledgerIds().length,before:rowsBefore}));}

console.log('--- progress photos: encrypted here, copied encrypted to the vault, restored on another device (W-004 option B) ---');
/* A photo of about 400 KB (three parts) made here, byte by byte. Every expectation is about those bytes: the same bytes
   come back on another device, the server's copy does not contain them, and a changed byte is refused. */
{const JPEG=Buffer.concat([Buffer.from([0xFF,0xD8,0xFF,0xE0,0x00,0x10]),Buffer.from('JFIF-e2e-photo-'+'x'.repeat(400000)),Buffer.from([0xFF,0xD9])]);
  const asUrl=b=>'data:image/jpeg;base64,'+b.toString('base64');
  const added=await A.addPhoto(new A.File([JPEG],'front.jpg',{type:'image/jpeg'}),{view:'front',lighting:'mixed'});
  expect('A stores the photo as an encrypted attachment',!!added.attachmentId&&added.encrypted===true,JSON.stringify(added));
  const vf=await A.verifyAttachment(added.attachmentId);
  expect('what A holds is ciphertext that decrypts to the hash on record, and a changed byte is refused',!!(vf.ciphertext&&vf.decrypts&&vf.hashMatches&&vf.tamperRefused),JSON.stringify(vf));
  expect('and it reads back as exactly the bytes taken',(await A.loadPhoto(added.id))===asUrl(JPEG));
  let dup=null;await A.addPhoto(new A.File([JPEG],'again.jpg',{type:'image/jpeg'}),{view:'front'}).catch(e=>{dup=e.message;});
  expect('the same photo again is refused as a duplicate',/already in your record/.test(dup||''),dup);
  /* failed upload recovery: the first attempt fails at the network; the failure is kept with its attempt count, and the retry sends it */
  const realFetch=A.fetch;let failOnce=true;A.fetch=(u,o)=>{if(failOnce&&/attachments\/part/.test(String(u))){failOnce=false;return Promise.reject(new Error('network down'));}return realFetch(u,o);};
  const s1=await A.cloudSync();A.fetch=realFetch;
  const st1=A.attachmentRemoteState(added.attachmentId);
  expect('an upload that fails is kept as failed, with its attempt and a time to retry, not lost',s1.attachments&&s1.attachments.failed===1&&st1.state==='failed'&&st1.attempts===1&&st1.nextTryAt>Date.now(),JSON.stringify({a:s1.attachments,st1}));
  const s2=await A.cloudSyncAttachments({force:true});
  expect('the retry uploads it',s2.uploaded===1&&A.attachmentRemoteState(added.attachmentId).state==='uploaded',JSON.stringify(s2));
  const adir=DATA+'/vaults/'+created.vaultId+'/attachments/'+added.attachmentId,held=fs.readdirSync(adir).map(f=>fs.readFileSync(adir+'/'+f,'utf8')).join('');
  expect('the vault holds the image in three parts, ciphertext only',fs.readdirSync(adir).length===3&&!/JFIF|e2e-photo/.test(held)&&!held.includes(JPEG.subarray(6,60).toString('base64')),fs.readdirSync(adir).join());
  const sb=await B.cloudSync(),bimg=await B.loadPhoto(added.id);
  expect('B receives the photo and fetches its image: the same bytes',sb.attachments&&sb.attachments.downloaded===1&&bimg===asUrl(JPEG),JSON.stringify(sb.attachments));
  /* a lost phone: a new device with only the phrase, authorised by A */
  const C=mk('C');globalThis.__windows.push(C);await new Promise(r=>setTimeout(r,600));
  C.DB=C.emptyDB();C._EVENTS.length=0;C.DB.settings.cloud={url:URL_};C.DB.settings.deviceId='device-C';C._memoInvalidate();
  await C.cloudUnlock(PHRASE);const cKeys=await C.deviceKeyPair();await A.cloudAuthenticate();
  await fetch(URL_+'/v1/vault/device',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+A._cloud.token},body:JSON.stringify({deviceId:'device-C',devicePublicKey:cKeys.publicPem})});
  await C.cloudSync();
  expect('a lost device: a new one with the phrase restores the photo and its image',C.livePhotos().some(p=>p.id===added.id)&&(await C.loadPhoto(added.id))===asUrl(JPEG));
  /* retraction reaches the vault and the other devices */
  A.deletePhoto(added.id);await new Promise(r=>setTimeout(r,50));await A.cloudSync();await B.cloudSync();
  const ab=await B.attachmentAudit();
  expect('removing the photo on A deletes its image from the vault and from B, and B keeps it marked removed',!fs.existsSync(adir)&&!B.livePhotos().some(p=>p.id===added.id)&&B.DB.settings.photos.some(p=>p.id===added.id&&p.removedAt)&&ab.stored===0&&ab.orphans.length===1,JSON.stringify(ab));
  /* B still held the bytes of the removed photo: the audit calls them an orphan, and removing orphans clears them */
  expect('an image left without a live record is reported as an orphan and can be cleared',(await B.removeOrphanAttachments()).removed===1&&(await B.attachmentAudit()).orphans.length===0);
  /* an encrypted backup carries the images; a restore checks each one, and one that was altered is named, not stored */
  const P2=Buffer.concat([Buffer.from([0xFF,0xD8,0xFF]),Buffer.from('second-photo-'+'y'.repeat(2000))]),P3=Buffer.concat([Buffer.from([0xFF,0xD8,0xFF]),Buffer.from('third-photo-'+'z'.repeat(2000))]);
  const r2=await A.addPhoto(new A.File([P2],'p2.jpg',{type:'image/jpeg'}),{view:'side'}),r3=await A.addPhoto(new A.File([P3],'p3.jpg',{type:'image/jpeg'}),{view:'back'});
  const B1=await A.attachmentsForBackup();
  expect('the backup gathers both live images, and no others',B1.items.length===2&&B1.complete&&B1.items.map(i=>i.id).sort().join()===[r2.attachmentId,r3.attachmentId].sort().join());
  const env=await A.encryptBackup('backup passphrase one',{attachments:B1.items});
  expect('the encrypted backup does not carry the images in the clear',!JSON.stringify(env).includes(P2.subarray(3,40).toString('base64'))&&!/second-photo/.test(JSON.stringify(env)));
  const D=mk('D');globalThis.__windows.push(D);await new Promise(r=>setTimeout(r,600));D.DB=D.emptyDB();D._EVENTS.length=0;D._memoInvalidate();
  const plain=await D.decryptBackup(env,'backup passphrase one');const atts=plain.backupAttachments;delete plain.backupAttachments;
  D.DB=D.migrate(plain).db;D._memoInvalidate();
  const bad=atts.map(x=>x.id===r3.attachmentId?Object.assign({},x,{data:Buffer.from('altered').toString('base64')}):x);
  const rr=await D.restoreAttachmentsFromBackup(bad);
  expect('a restore stores each image that matches its record and names the one that does not: a partial restore, reported',rr.restored===1&&rr.failed.length===1&&rr.failed[0].id===r3.attachmentId&&/does not match/.test(rr.failed[0].why),JSON.stringify(rr));
  expect('the restored image is the one taken',(await D.loadPhoto(r2.id))===asUrl(P2)&&(await D.loadPhoto(r3.id))===null);
  const da=await D.attachmentAudit();
  expect('and the audit says which image the restore could not bring back',da.missing.length===1&&da.missing[0].id===r3.attachmentId,JSON.stringify(da));
  /* quota: when the browser reports no room, a new image is refused rather than half-written */
  Object.defineProperty(D.navigator,'storage',{value:{estimate:()=>Promise.resolve({usage:999000,quota:1000000})},configurable:true});
  let qe=null;await D.putAttachment('photo',asUrl(Buffer.concat([Buffer.from([0xFF,0xD8,0xFF]),Buffer.from('q'.repeat(5000))])),null).catch(e=>{qe=e.message;});
  expect('with too little storage left, a new image is refused and says how much is free and needed',/not enough storage/.test(qe||'')&&/KB free/.test(qe||''),qe);
  A.deletePhoto(r2.id);A.deletePhoto(r3.id);await new Promise(r=>setTimeout(r,50));await A.cloudSync();}

console.log('--- a large record (a restored backup, the demo, a compaction) syncs in parts ---');
/* The restore restarts the log from one snapshot event holding the whole record, larger than the server takes for one
   event, so before parts it failed every sync. A server that moves a part cannot make it decrypt in its new place. */
{const gen=A.FIXTURES.successful_cut();A.mergeRecordCollections(gen);A.resetEventLog('record restored from a backup');
  const snapBytes=JSON.stringify(A._EVENTS.filter(e=>e.type==='record.snapshot')[0]).length;
  const up=await A.cloudSync().catch(e=>({err:String(e.message||e)}));
  const parts=fs.readFileSync(DATA+'/vaults/'+created.vaultId+'/events.ndjson','utf8').trim().split('\n').map(l=>JSON.parse(l)).filter(r=>/#part-\d+-of-\d+$/.test(r.id));
  expect('a record larger than one event allows is sent without error, in parts',!up.err&&parts.length>1,JSON.stringify({err:up.err,parts:parts.length,snapshotBytes:snapBytes}));
  const file=DATA+'/vaults/'+created.vaultId+'/events.ndjson',original=fs.readFileSync(file,'utf8');
  const swapped=original.replace(parts[0].id,'@@SWAP@@').replace(parts[1].id,parts[0].id).replace('@@SWAP@@',parts[1].id);
  fs.writeFileSync(file,swapped);
  const before=B.obsOf('weight').length;await B.cloudSync();
  expect('parts a server has moved do not decrypt, so the event is held instead of corrupting the record',B.obsOf('weight').length===before,B.obsOf('weight').length+' vs '+before);
  fs.writeFileSync(file,original);await B.cloudSync();
  expect('the held event arrives whole at the next sync once its parts are in place',
    B.DB.observations.length===A.DB.observations.length&&B.obsOf('weight').length===A.obsOf('weight').length,
    JSON.stringify({b:B.DB.observations.length,a:A.DB.observations.length}));}

console.log('--- the server loses its data (a free host restarting with an empty disk) ---');
{const before=A._EVENTS.length;srv.kill();await new Promise(r=>setTimeout(r,500));fs.rmSync(DATA,{recursive:true,force:true});
  const srv2=spawn(process.execPath,['server/server.mjs','--port','8791','--data',DATA],{stdio:['ignore','pipe','pipe']});srv2.stdout.on('data',d=>{serverLog+=d;});
  process.on('exit',()=>{try{srv2.kill();}catch(e){}});await new Promise(r=>setTimeout(r,900));
  A._cloud.token=null;const again=await A.cloudSync().catch(e=>({err:String(e.message||e)}));
  expect('reset detected and everything re-sent',again.serverReset===true&&again.sent>=before,JSON.stringify({reset:again.serverReset,sent:again.sent,had:before,err:again.err}));
  const second=await A.cloudSync();expect('the next sync is quiet again',second.sent===0&&second.serverReset===false,JSON.stringify(second));
  globalThis.__srv2=srv2;}
console.log('--- the base address answers with an index, not "no such endpoint" ---');
{const r=await fetch('http://127.0.0.1:8791/');const j=await r.json();expect('base address is friendly',r.status===200&&j.ok===true&&!j.error);}
console.log('--- a wrong phrase derives a different vault and cannot decrypt ---');
const wrong=await A.deriveVault('totally different words entirely here now');
expect('a wrong phrase derives a different vault',wrong.vaultId!==created.vaultId);

console.log('--- vault deletion is total ---');
const del=await A.cloudDeleteVault();
expect('vault deletion removes the vault and its folder',del.deleted===true&&!fs.existsSync(DATA+'/vaults/'+created.vaultId),JSON.stringify(del));

console.log('--- server log is incapable of carrying payloads ---');
expect('the server log mentions no weight, value or ciphertext',!/221\.4|weight|ciphertext/.test(serverLog));
console.log('log lines:',serverLog.trim().split('\n').length);
/* close every simulated window: an app that keeps timers (the weather auto-updater) would otherwise hold Node open */
for(const w of (globalThis.__windows||[])){try{w.close();}catch(e){}}
stop();try{globalThis.__srv2&&globalThis.__srv2.kill();}catch(e){}
process.exitCode=failures?1:0;setTimeout(()=>process.exit(),200).unref();
