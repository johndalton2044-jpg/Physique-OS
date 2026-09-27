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
const A=mk('A'),B=mk('B');
await new Promise(r=>setTimeout(r,600));
for(const w of [A,B]){w.DB=w.emptyDB();w._EVENTS.length=0;w.DB.settings.cloud={url:URL_};w._memoInvalidate();}
A.DB.settings.deviceId='device-A';B.DB.settings.deviceId='device-B';
const PHRASE='correct horse battery staple orange window';

console.log('--- A creates the vault ---');
const created=await A.cloudCreateVault(PHRASE);
console.log('vault created:',JSON.stringify(created).slice(0,80));
console.log('vault id is derived, not assigned:',created.vaultId===(await A.deriveVault(PHRASE)).vaultId);

console.log('--- A logs data and syncs up ---');
A._NOW_OVERRIDE=A.todayISO();
A.addObservation({type:'weight',date:A.todayISO(),value:221.4,source:'manual'},{silent:true,noSave:true});
A.addObservation({type:'steps',date:A.todayISO(),value:9400,source:'manual'},{silent:true,noSave:true});
const up=await A.cloudSync();
console.log('A sync:',JSON.stringify(up));

console.log('--- the server cannot read any of it ---');
const raw=fs.readFileSync(DATA+'/vaults/'+created.vaultId+'/events.ndjson','utf8');
console.log('stored rows:',raw.trim().split('\n').length);
console.log('plaintext leaks (weight/221.4/steps):',/weight|221\.4|steps/.test(raw));
console.log('sample row:',raw.trim().split('\n')[0].slice(0,110)+'...');

console.log('--- B joins with the same phrase ---');
await B.cloudUnlock(PHRASE);
// B must be authorised by A, which is what stops a stolen phrase silently joining
let joinBlocked=false;
try{await B.cloudAuthenticate();}catch(e){joinBlocked=/not registered/.test(String(e.message))||e.status===401;}
console.log('unknown device refused until authorised:',joinBlocked);
const bKeys=await B.deviceKeyPair();
const tok=await (async()=>{await A.cloudAuthenticate();return A._cloud.token;})();
const res=await fetch(URL_+'/v1/vault/device',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+tok},
  body:JSON.stringify({deviceId:'device-B',devicePublicKey:bKeys.publicPem})});
console.log('A authorises B:',res.status);

console.log('--- B pulls and decrypts ---');
const down=await B.cloudSync();
console.log('B sync:',JSON.stringify(down));
console.log('B now sees weight:',B.obsOf('weight').length,'steps:',B.obsOf('steps').length);
console.log('B decrypted the actual value:',B.obsOf('weight')[0]?.value);

console.log('--- concurrent edits converge without loss ---');
B._NOW_OVERRIDE=B.todayISO();
B.addObservation({type:'sleep',date:B.todayISO(),value:7.4,source:'manual'},{silent:true,noSave:true});
A.addObservation({type:'waist',date:A.todayISO(),value:38.2,source:'manual'},{silent:true,noSave:true});
await B.cloudSync();await A.cloudSync();await B.cloudSync();
console.log('A has waist+sleep:',A.obsOf('waist').length===1&&A.obsOf('sleep').length===1);
console.log('B has waist+sleep:',B.obsOf('waist').length===1&&B.obsOf('sleep').length===1);
console.log('A projection valid:',A.projectionMatchesRecord().ok,'| B projection valid:',B.projectionMatchesRecord().ok);

console.log('--- a wrong phrase derives a different vault and cannot decrypt ---');
const wrong=await A.deriveVault('totally different words entirely here now');
console.log('different vault id:',wrong.vaultId!==created.vaultId);

console.log('--- vault deletion is total ---');
const del=await A.cloudDeleteVault();
console.log('deleted:',JSON.stringify(del),'| dir gone:',!fs.existsSync(DATA+'/vaults/'+created.vaultId));

console.log('--- server log is incapable of carrying payloads ---');
console.log('log mentions a weight or a value:',/221\.4|weight|ciphertext/.test(serverLog));
console.log('log lines:',serverLog.trim().split('\n').length);
stop();
