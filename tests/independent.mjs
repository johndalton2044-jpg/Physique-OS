/* INDEPENDENT VERIFICATION (catalogue doc 2, P0.5): the application must be able to be wrong about itself.
   Every check here takes what the application produced (the bytes it persisted, the events it logged, a number it
   reports, the files it shipped) and recomputes the expectation itself, from first principles written in this file.
   It never calls runSelfTest(), capabilityMatrix(), runVerification(), the governance or maturity reports, or any
   function of the app that reads the store or replays the log. It acts on the app only through its screen: it presses
   the controls a person presses, then reads IndexedDB with the browser's own API.
     node tests/independent.mjs */
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {chromium} from 'playwright-core';
import {findBrowser} from './_browser-path.mjs';
if(process.env.PHYSIQUE_SKIP_BROWSER==='1'){console.log('  SKIPPED  independent — PHYSIQUE_SKIP_BROWSER=1, NOT verified');process.exit(0);}
let failed=0;const line=(ok,msg,d)=>{if(!ok)failed++;console.log('  '+(ok?'pass':'FAIL')+'  '+msg+(d&&!ok?'  — '+String(d).slice(0,240):''));};
setTimeout(()=>{console.log('  FAIL  the independent checks did not finish within 150 s');process.exit(1);},150000).unref();

/* ---------- 1. the shipped files, recomputed in Node ---------- */
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
{const sums=fs.readFileSync('dist/SHA256SUMS','utf8').trim().split('\n').map(l=>{const m=l.match(/^([0-9a-f]{64})\s+\*?(.+)$/);return m?{sum:m[1],file:m[2]}:null;}).filter(Boolean);
  const bad=sums.filter(s=>!fs.existsSync(path.join('dist',s.file))||sha(fs.readFileSync(path.join('dist',s.file)))!==s.sum).map(s=>s.file);
  const listed=new Set(sums.map(s=>s.file));const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.relative('dist',path.join(d,e.name)).split(path.sep).join('/')]);
  const unlisted=walk('dist').filter(f=>f!=='SHA256SUMS'&&!listed.has(f)&&!f.startsWith('data/food/'));
  line(sums.length>0&&!bad.length,'every file dist/SHA256SUMS lists hashes to its listed checksum ('+sums.length+' files)',bad.slice(0,5).join(', '));
  line(!unlisted.length,'no shipped file is left out of the checksum list (the food corpus has its own)',unlisted.slice(0,5).join(', '));
  /* the build identity: SHA-256 over src/ in name order, first ten hex digits, recomputed here */
  const src=fs.readdirSync('src').sort();const h=crypto.createHash('sha256');src.forEach(f=>h.update(fs.readFileSync(path.join('src',f))));
  const mine=h.digest('hex').slice(0,10),v=JSON.parse(fs.readFileSync('dist/version.json','utf8'));
  const meta=(fs.readFileSync('dist/index.html','utf8').match(/<meta name="physique-build" content="([0-9a-f]+)/)||[])[1];
  line(v.build===mine&&meta===mine,'the build identity in version.json and in the page is the hash of src/ recomputed here',JSON.stringify({recomputed:mine,versionJson:v.build,page:meta}));}

/* ---------- 2. the running app, through its screen ---------- */
const WEB=18831;
const web=http.createServer((q,res)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join('dist',u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':/\.js$/.test(f)?'text/javascript':/\.json$/.test(f)?'application/json':'text/html'});res.end(d);});});
await new Promise(r=>web.listen(WEB,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:findBrowser(),args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await (await browser.newContext({viewport:{width:1280,height:900}})).newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:'+WEB+'/index.html');
await page.waitForSelector('[data-act="welcome.skip"]',{timeout:20000});await page.click('[data-act="welcome.skip"]');
/* load the demo record as a person does: Tools, the demo section, Load, confirm */
await page.click('button[data-tab="tools"]');await page.waitForSelector('details[data-fold="tools-demo"] summary');
await page.evaluate(()=>{const d=document.querySelector('details[data-fold="tools-demo"]');if(!d.open)d.querySelector('summary').click();});
const LOAD='details[data-fold="tools-demo"] [data-act="demo.load"]';await page.waitForSelector(LOAD);await page.click(LOAD);
await page.waitForSelector('#confirmOk',{timeout:5000});await page.click('#confirmOk');
/* the persisted store, read with the browser's IndexedDB API alone: every key and value of physique-os/kv */
const readStore=()=>page.evaluate(()=>new Promise((res,rej)=>{const q=indexedDB.open('physique-os');q.onerror=()=>rej(String(q.error));
  q.onsuccess=()=>{const db=q.result;if(!db.objectStoreNames.contains('kv')){db.close();res([]);return;}const st=db.transaction('kv','readonly').objectStore('kv');
    const k=st.getAllKeys(),v=st.getAll();v.onsuccess=()=>{const out=k.result.map((key,i)=>[String(key),typeof v.result[i]==='string'?v.result[i]:JSON.stringify(v.result[i])]);db.close();res(out);};v.onerror=()=>rej(String(v.error));};}));
const parse=s=>{try{return JSON.parse(s);}catch(e){return undefined;}};
/* wait until the store holds the demo's weigh-ins and stops changing (the app writes in the background) */
let store=[],prev='';for(let i=0;i<60;i++){store=await readStore();const sig=store.map(([k,v])=>k+':'+v.length).join('|');
  if(sig===prev&&store.some(([k])=>/^col:observations:/.test(k)))break;prev=sig;await page.waitForTimeout(500);}
const kv=Object.fromEntries(store);
const shards=Object.keys(kv).filter(k=>/^col:observations:/.test(k)).sort();
const persisted=shards.flatMap(k=>{const v=parse(kv[k]);return Array.isArray(v)?v:[];});
line(shards.length>0&&persisted.length>0,'the store holds the observations, as readable JSON in monthly shards ('+persisted.length+' in '+shards.length+' shards)',Object.keys(kv).slice(0,8).join(', '));
/* the app's own record, as it holds it now (the subject being checked, read once) */
const app=await page.evaluate(()=>({ids:window.DB.observations.map(o=>o.id+'|'+o.value+'|'+(o.retracted?1:0)+'|'+(o.correctedBy||'')),today:window.todayISO()}));
const pid=persisted.map(o=>o.id+'|'+o.value+'|'+(o.retracted?1:0)+'|'+(o.correctedBy||''));
const missing=app.ids.filter(x=>!pid.includes(x)),extra=pid.filter(x=>!app.ids.includes(x));
line(!missing.length&&!extra.length,'what the app holds is exactly what it persisted: every observation, its value, retraction and correction',JSON.stringify({missing:missing.slice(0,3),extra:extra.slice(0,3)}));

/* ---------- 3. the event log, replayed by a reducer written here ---------- */
const index=parse(kv['events:index']);
const evKeys=Object.keys(kv).filter(k=>/^events:/.test(k)&&k!=='events:index');
const events=evKeys.flatMap(k=>{const v=parse(kv[k]);return Array.isArray(v)?v:(v&&Array.isArray(v.events)?v.events:[]);});
const revoked=new Set(events.filter(e=>e&&e.type==='events.revoked').flatMap(e=>(e.data&&e.data.ids)||[]));
const order=(a,b)=>(a.at<b.at?-1:a.at>b.at?1:0)||((a.device||'')<(b.device||'')?-1:(a.device||'')>(b.device||'')?1:0)||((a.seq||0)-(b.seq||0));
let obs=[];
for(const e of events.filter(e=>e&&!revoked.has(e.id)).sort(order)){const d=e.data||{};
  if(e.type==='record.snapshot'&&d.record&&Array.isArray(d.record.observations))obs=JSON.parse(JSON.stringify(d.record.observations));
  else if(e.type==='observation.added')obs.push(JSON.parse(JSON.stringify(d)));
  else if(e.type==='observation.corrected'){const o=obs.find(x=>x.id===d.of);if(o)o.correctedBy=d.record.id;obs.push(JSON.parse(JSON.stringify(d.record)));}
  else if(e.type==='observation.retracted'){const o=obs.find(x=>x.id===d.id);if(o)o.retracted=true;}}
const live=list=>list.filter(o=>!o.retracted&&!o.correctedBy);
const key=o=>o.id+'|'+o.type+'|'+o.date+'|'+o.value;
const fromLog=new Set(live(obs).map(key)),fromStore=new Set(live(persisted).map(key));
const onlyLog=[...fromLog].filter(x=>!fromStore.has(x)),onlyStore=[...fromStore].filter(x=>!fromLog.has(x));
line(events.length>0&&!!index,'the event log is in the store with its index ('+events.length+' events)',JSON.stringify({index:!!index,keys:evKeys.length}));
line(fromLog.size>0&&!onlyLog.length&&!onlyStore.length,'replaying the log with a reducer written here gives the same live observations as the persisted record ('+fromLog.size+')',JSON.stringify({onlyLog:onlyLog.slice(0,3),onlyStore:onlyStore.slice(0,3)}));

/* ---------- 4. a model output, recomputed from the persisted weigh-ins ---------- */
/* weight trend: the Theil–Sen slope over the daily means of the last 14 days, per week; off-protocol readings are left
   out while at least 7 on-protocol days remain; fewer than 7 days, or a span under 10, is insufficient */
const addDays=(d,n)=>{const t=new Date(d+'T00:00:00Z');t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10);};
const dayNo=d=>Math.round(Date.parse(d+'T00:00:00Z')/86400000);
const from=addDays(app.today,-13);
const W=live(persisted).filter(o=>o.type==='weight'&&o.date>=from&&o.date<=app.today);
const byDay=(list)=>{const m={};list.forEach(o=>{(m[o.date]=m[o.date]||[]).push(o.value);});return Object.keys(m).sort().map(d=>({d,x:dayNo(d),y:m[d].reduce((a,b)=>a+b,0)/m[d].length}));};
let days=byDay(W);const onp=byDay(W.filter(o=>!(o.meta&&o.meta.protocol==='off')));if(onp.length!==days.length&&onp.length>=7)days=onp;
const median=a=>{const s=a.slice().sort((p,q)=>p-q),n=s.length;return n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2;};
let mineSlope=null;if(days.length>=7&&days[days.length-1].x-days[0].x>=10){const sl=[];for(let i=0;i<days.length;i++)for(let j=i+1;j<days.length;j++)if(days[j].x!==days[i].x)sl.push((days[j].y-days[i].y)/(days[j].x-days[i].x));mineSlope=median(sl)*7;}
const appTrend=await page.evaluate(()=>{const t=window.weightTrend();return {status:t.status,slope:t.slopePerWeek,n:t.n};});
line(mineSlope!=null&&appTrend.status==='ok'&&Math.abs(appTrend.slope-mineSlope)<1e-9&&appTrend.n===days.length,
  'the weight trend the app reports is the Theil–Sen slope recomputed here from the persisted weigh-ins ('+(mineSlope!=null?mineSlope.toFixed(3):'?')+' lb a week over '+days.length+' days)',JSON.stringify({app:appTrend,mine:mineSlope,days:days.length}));

/* ---------- 5. provenance identifies exactly what was persisted ---------- */
/* a model run's observation node is identified by its content: SHA-256 of "type|count|latest date:latest value" over the
   live observations of that type, first twelve hex digits. Recomputed here from the store with Node's own SHA-256. */
const prov=await page.evaluate(()=>{const r=window.infer({modelId:'weight_trend'});const n=((r.provenance&&r.provenance.nodes)||[]).filter(x=>x.type==='observation'&&x.source==='weight')[0];
  return {status:r.status,id:n?n.id:null,count:n&&n.metadata?n.metadata.count:null,latest:n&&n.metadata?n.metadata.latest:null};});
const lw=live(persisted).filter(o=>o.type==='weight'&&o.date<=app.today).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:(String(a.recordedAt||'')<String(b.recordedAt||'')?-1:1));
const lastW=lw[lw.length-1];
const expectId='obs:weight:'+sha('weight|'+lw.length+'|'+(lastW?lastW.date+':'+lastW.value:'none')).slice(0,12);
line(prov.status==='ok'&&prov.id===expectId&&prov.count===lw.length&&prov.latest===(lastW&&lastW.date),
  'the weight trend\u2019s provenance identifies exactly the persisted weigh-ins: its node id is their content hash, recomputed here ('+lw.length+' weigh-ins)',JSON.stringify({app:prov,expected:expectId,count:lw.length}));
line(!errors.length,'no uncaught errors in the page',errors.slice(0,2).join(' | '));
await browser.close();web.close();
console.log(failed?failed+' failed':'all passed');process.exit(failed?1:0);
