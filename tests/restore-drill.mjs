/* RESTORE DRILL and KEY ROTATION (audit §74 P0, §111 phase 3): back up a live server, restore into a new folder, start a
   server on it under a rotated connection key, prove nothing was lost, rotate, and prove the old key is no longer needed. */
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';
let failed=0;const line=(ok,msg,d)=>{if(!ok)failed++;console.log('  '+(ok?'pass':'FAIL')+'  '+msg+(d&&!ok?'  \u2014 '+d:''));};
setTimeout(()=>{console.log('  FAIL  the restore drill did not finish within 90 s');process.exit(1);},90000).unref();
const A=fs.mkdtempSync(path.join(os.tmpdir(),'pos-drillA-')),B=fs.mkdtempSync(path.join(os.tmpdir(),'pos-drillB-'));
const K1=crypto.randomBytes(32).toString('hex'),K2=crypto.randomBytes(32).toString('hex'),VID=crypto.randomBytes(16).toString('hex');   /* the server's vault id format */
const boot=async(env,tag)=>{for(const k of ['CONNECT_TOKEN_KEY_PREVIOUS'])delete process.env[k];Object.assign(process.env,{PORT:'0',HOST:'127.0.0.1',ADMIN_TOKEN:'adm',METRICS_TOKEN:'met'},env);
  const S=await import('../server/server.mjs?'+tag+Date.now());await new Promise(r=>setTimeout(r,250));return {S,base:'http://127.0.0.1:'+S.server.address().port};};
/* A: a vault, events and an encrypted connection */
let {S,base}=await boot({DATA_DIR:A,CONNECT_TOKEN_KEY:K1},'a');
S.writeVault({id:VID,createdAt:new Date().toISOString(),serverSeq:0,devices:[],pushSubscriptions:[]});
S.appendEvents(S.readVault(VID),Array.from({length:120},(_,i)=>({id:'ev'+i,serverSeq:i+1,ciphertext:'c'+i,iv:''})));const v0=S.readVault(VID);v0.serverSeq=120;v0.eventCount=120;S.writeVault(v0);
S.writeConns(VID,{strava:{sealed:S._sealForDrill({access:'acc-1',refresh:'ref-1',expiresAt:Date.now()+3600000}),userId:'555',connectedAt:new Date().toISOString()}});
const h0=await (await fetch(base+'/v1/health')).json();
line(h0.storageCheck&&h0.storageCheck.writable===true&&Array.isArray(h0.storageCheck.warnings),'health verifies the data folder can be written, and lists warnings',JSON.stringify(h0.storageCheck).slice(0,160));
line((await fetch(base+'/v1/metrics')).status===401,'metrics refuse a request without the token');
const m=await (await fetch(base+'/v1/metrics',{headers:{authorization:'Bearer met'}})).json();
line(m.vaults===1&&m.events===120&&m.dataBytes>0&&typeof m.requests==='object'&&m.push,'metrics report vaults, events, data size, requests and push outcomes',JSON.stringify({v:m.vaults,e:m.events,b:m.dataBytes}));
line((await fetch(base+'/v1/admin/backup')).status===401,'a backup needs the admin token');
const bk=await fetch(base+'/v1/admin/backup',{headers:{authorization:'Bearer adm'}});const buf=Buffer.from(await bk.arrayBuffer());
line(bk.status===200&&/attachment/.test(bk.headers.get('content-disposition')||'')&&buf.length>100,'a backup downloads as an archive',String(bk.status));
S.server.close();
/* B: restore into a new folder, under a rotated key (new K2, previous K1) */
fs.writeFileSync(path.join(B,'..','drill-backup.tgz'),buf);execFileSync('tar',['-xzf',path.join(B,'..','drill-backup.tgz'),'-C',B]);
({S,base}=await boot({DATA_DIR:B,CONNECT_TOKEN_KEY:K2,CONNECT_TOKEN_KEY_PREVIOUS:K1},'b'));
const h1=await (await fetch(base+'/v1/health')).json(),v1=S.readVault(VID);
line(h1.epoch===h0.epoch,'the restored server keeps the data epoch (devices do not think it was wiped)',h0.epoch+' vs '+h1.epoch);
line(h1.vapidPublicKey===h0.vapidPublicKey,'push keys survive the restore (subscriptions keep working)');
line(v1&&v1.serverSeq===120&&S.readEvents(v1,0,1000).rows.length===120,'every event survives the restore',JSON.stringify({seq:v1&&v1.serverSeq}));
line(S._openForDrill(S.readConns(VID).strava.sealed).access==='acc-1','a sign-in sealed under the old key still opens after rotation');
const rot=await (await fetch(base+'/v1/admin/rotate-connect-key',{method:'POST',headers:{authorization:'Bearer adm','content-type':'application/json'},body:'{}'})).json();
line(rot.status==='ok'&&rot.resealed===1&&rot.failed===0,'rotation re-seals every stored sign-in under the new key',JSON.stringify(rot));
S.server.close();
/* C: only the new key */
({S,base}=await boot({DATA_DIR:B,CONNECT_TOKEN_KEY:K2},'c'));
let ok=false;try{ok=S._openForDrill(S.readConns(VID).strava.sealed).access==='acc-1';}catch(e){}line(ok,'after rotation the old key is no longer needed');
S.server.close();fs.rmSync(A,{recursive:true,force:true});fs.rmSync(B,{recursive:true,force:true});
console.log(failed?failed+' failed':'all passed');process.exit(failed?1:0);
