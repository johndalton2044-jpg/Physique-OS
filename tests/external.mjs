/* EXTERNAL SOURCES, END TO END (integration spec \u00a743). The real server runs in fixture mode (recorded provider responses,
   no network); the built app is served from the same origin, so its connect-src 'self' holds exactly as deployed. The app
   is driven through its controls: a place is searched and picked, the weather arrives through adapter \u2192 ingestion \u2192
   read model \u2192 Today; history loads; a barcode the bundled database lacks is found on Open Food Facts. Then the server
   is restarted with failure fixtures and every failure must reach the app in the spec's error vocabulary. */
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawn} from 'node:child_process';
import {chromium} from 'playwright-core';
import {findBrowser} from './_browser-path.mjs';
if(process.env.PHYSIQUE_SKIP_BROWSER==='1'){console.log('  SKIPPED  external \u2014 PHYSIQUE_SKIP_BROWSER=1, NOT verified');process.exit(0);}
let failed=0;const line=(ok,msg,d)=>{if(!ok)failed++;console.log('  '+(ok?'pass':'FAIL')+'  '+msg+(d&&!ok?'  \u2014 '+d:''));};
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pos-ext-'));
function startServer(fixDir,port,env){const logs=[];const p=spawn(process.execPath,['server/server.mjs'],{env:Object.assign({},process.env,{PORT:String(port),HOST:'127.0.0.1',DATA_DIR:tmp,PHYSIQUE_EXT_FIXTURES:fixDir},env||{}),stdio:['ignore','pipe','pipe']});
  p.stdout.on('data',d=>logs.push(String(d)));p.stderr.on('data',d=>logs.push(String(d)));p.logs=logs;return p;}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function get(port,pth){return new Promise(res=>{http.get({host:'127.0.0.1',port,path:pth},r=>{let b='';r.on('data',c=>b+=c);r.on('end',()=>{try{res({status:r.statusCode,json:JSON.parse(b)});}catch(e){res({status:r.statusCode,json:null});}});}).on('error',()=>res({status:0}));});}
const API=18791,WEB=18792;
let api=startServer(path.resolve('tests/fixtures/ext'),API);await wait(900);
/* the server boundary on its own */
let r=await get(API,'/v1/ext/weather/forecast');line(r.status===400&&r.json.error.category==='configuration_error','the server refuses a weather request with no location (never inferred)',JSON.stringify(r.json));
r=await get(API,'/v1/ext/weather/forecast?lat=95&lon=0');line(r.status===400,'the server refuses an out-of-range location');
r=await get(API,'/v1/ext/sources');line(r.json&&r.json.sources['meteosource'].live===false&&!JSON.stringify(r.json).match(/[A-Za-z0-9]{30,}/),'without a key Meteosource is reported not configured, and no secret appears',JSON.stringify(r.json&&r.json.sources.meteosource));
r=await get(API,'/v1/ext/weather/forecast?lat=40.7128&lon=-74.006&tz=America/New_York');line(r.status===200&&r.json.status==='ok'&&r.json.provider==='open-meteo'&&!!r.json.retrievedAt,'the forecast route returns the provider payload with its retrieval time');
r=await get(API,'/v1/ext/food/off/product?code=12');line(r.status===400,'a malformed barcode is refused');
/* same-origin web server: dist plus /v1 proxied to the API server */
const web=http.createServer((q,res)=>{const u=decodeURIComponent(q.url.split('?')[0]);
  if(u.startsWith('/v1/')){const pr=http.request({host:'127.0.0.1',port:API,path:q.url,method:q.method,headers:q.headers},pres=>{res.writeHead(pres.statusCode,pres.headers);pres.pipe(res);});pr.on('error',()=>{res.writeHead(502);res.end();});q.pipe(pr);return;}
  const f=path.join('dist',u==='/'?'index.html':u);fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':/\.js$/.test(f)?'text/javascript':/\.json$/.test(f)?'application/json':'text/html'});res.end(d);});});
await new Promise(r=>web.listen(WEB,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:findBrowser(),args:['--no-sandbox','--disable-dev-shm-usage']});
const p=await (await browser.newContext({viewport:{width:393,height:852},timezoneId:'America/New_York'})).newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
const S=(fn,a)=>p.evaluate(fn,a);
await p.goto('http://127.0.0.1:'+WEB+'/index.html');await p.waitForTimeout(1400);
await S(o=>{window.dispatchAct('welcome.skip');window.DB.settings.cloud=Object.assign({},window.DB.settings.cloud||{},{url:o});},'http://127.0.0.1:'+WEB);
line(await S(()=>{window.switchTab('today');return !document.querySelector('#view-today .wx-now');}),'with no place set, Today shows no weather');
/* place search and pick, through the sheet's controls */
await S(()=>window.dispatchAct('weather.open'));await p.waitForTimeout(200);
await p.fill('#wxPlace','New York');await S(()=>document.getElementById('wxPlace').dispatchEvent(new Event('input',{bubbles:true})));
await p.click('button[data-act="weather.search"]');await p.waitForTimeout(700);
line(await S(()=>document.querySelectorAll('#editBackdrop [data-act="weather.pick"]').length===2),'place search offers the matching places');
await p.click('#editBackdrop [data-act="weather.pick"][data-arg="0"]');await p.waitForTimeout(1500);
const L=await S(()=>window.weatherLocation());line(!!L&&L.lat===40.71&&L.lon===-74.01&&/New York/.test(L.label),'the picked place is stored rounded to about 1 km',JSON.stringify(L));
const E=await S(()=>{const f=(window.DB.environment||[]).find(b=>b.dataset==='forecast'),a=(window.DB.environment||[]).find(b=>b.dataset==='air-quality');
  return {f:!!f,hours:f&&f.hourly.times.length,days:f&&f.daily.dates.length,kinds:f&&[...new Set(f.daily.kinds)],src:f&&f.source,ret:f&&f.retrievedAt,air:a&&Object.keys(a.current.values).length};});
line(E.f&&E.hours===504&&E.days===21&&E.kinds.includes('recent past')&&E.kinds.includes('forecast')&&E.src==='open-meteo'&&!!E.ret,'the forecast is ingested: 7 past and 14 forecast days, hourly, each labelled, with its source and retrieval time',JSON.stringify(E));
line(E.air===8,'air quality is ingested (PM2.5, PM10, ozone, NO\u2082, SO\u2082, CO and both AQIs)',JSON.stringify(E.air));
await S(()=>{window.closeSheet&&window.closeSheet();window.DB.settings.weatherExpanded=false;window.switchTab('today');});await p.waitForTimeout(300);
/* a glance by default: temperature, condition, today's range and rain, with More to open the rest */
const G=await S(()=>{const c=[...document.querySelectorAll('#view-today .card')].find(x=>window.panelTitle(x)==='Weather');return c?{t:c.textContent.replace(/\s+/g,' '),glance:!!c.querySelector('.wx-glance'),more:!!c.querySelector('[data-act="weather.expand"]')}:null;});
line(!!G&&G.glance&&G.more&&/rain \d+% in the next 6 hours/.test(G.t)&&!/Humidity/.test(G.t),'Today shows a weather glance by default, with More for the rest',G&&G.t.slice(0,160));
await S(()=>window.dispatchAct('weather.expand'));await p.waitForTimeout(200);
const C=await S(()=>{const c=[...document.querySelectorAll('#view-today .card')].find(x=>window.panelTitle(x)==='Weather');return c?{t:c.textContent.replace(/\s+/g,' '),days:c.querySelectorAll('.wx-day').length}:null;});
line(!!C&&/feels like/.test(C.t)&&/Humidity/.test(C.t)&&/gusts/.test(C.t)&&/UV index/.test(C.t)&&/daylight/.test(C.t)&&/AQI/.test(C.t)&&C.days>=12,'Today shows current weather, wind with gusts, UV, sun and daylight, air quality and the next 14 days',C&&C.t.slice(0,200));
/* AUTO-UPDATING: a small request, a silent refresh when stale, none when fresh or switched off, and one on launch */
await S(()=>{window.__urls=[];const f=window.fetch;window.fetch=function(u,o){window.__urls.push(String(u));return f.apply(this,arguments);};});
const age=m=>S(mm=>{window.DB.environment.forEach(b=>{b.retrievedAt=new Date(Date.now()-mm*60000).toISOString();});window._memoInvalidate&&window._memoInvalidate();},m);
const nudge=()=>S(()=>{document.dispatchEvent(new Event('visibilitychange'));});
await age(40);await S(()=>document.querySelectorAll('.toast').forEach(t=>t.remove()));const before=await S(()=>window.DB.environment.find(b=>b.dataset==='forecast').retrievedAt);await nudge();await p.waitForTimeout(1500);
const A=await S(()=>({urls:window.__urls.filter(u=>/weather\/forecast/.test(u)),after:window.DB.environment.find(b=>b.dataset==='forecast').retrievedAt,toast:[...document.querySelectorAll('.toast')].map(t=>t.textContent).join(' | ')}));
line(A.urls.length===1&&/past_hours=24/.test(A.urls[0])&&/forecast_hours=48/.test(A.urls[0])&&/forecast_days=14/.test(A.urls[0]),'refreshes ask for 24 h back and 48 h ahead hourly, and 14 days daily',JSON.stringify(A.urls));
line(A.after!==before&&!/Weather updated/.test(A.toast),'a forecast over 30 minutes old refreshes by itself when the app comes back, without a toast',JSON.stringify({before,after:A.after,toast:A.toast}));
await S(()=>{window.__urls=[];});await nudge();await p.waitForTimeout(800);line(await S(()=>window.__urls.length===0),'a fresh forecast is not fetched again');
await S(()=>{window.DB.settings.weatherAuto=false;window.__urls=[];});await age(40);await nudge();await p.waitForTimeout(800);
line(await S(()=>window.__urls.length===0),'with automatic updates off, nothing refreshes by itself');await S(()=>{window.DB.settings.weatherAuto=true;window.save&&window.save('settings');});
/* a new launch with a stale saved forecast: it shows at once and refreshes in the background */
await age(45);await S(()=>window.save&&window.save('environment'));await p.waitForTimeout(300);const t0=Date.now();await p.reload();
let shownAt=null;for(let i=0;i<60&&shownAt==null;i++){if(await S(()=>!!document.querySelector('#view-today .wx-now')))shownAt=Date.now()-t0;else await p.waitForTimeout(50);}
const L0={shown:shownAt!=null,ms:shownAt};
await p.waitForTimeout(2200);const L1=await S(()=>window.DB.environment.find(b=>b.dataset==='forecast').retrievedAt);
line(L0.shown&&L0.ms<2500,'on launch the saved forecast shows at once (within '+L0.ms+' ms of reloading, before any network answer)',JSON.stringify(L0));
line(Date.now()-Date.parse(L1)<60000,'and a stale one is refreshed in the background right after launch',L1);
/* units follow the person's setting */
const U=await S(()=>{const a=window.fmtEnv('temperature',20),b=window.fmtEnv('windSpeed',10);window.DB.profile.units='metric';window.DB.settings.units='metric';const c=window.fmtEnv('temperature',20),d=window.fmtEnv('windSpeed',10);return [a,b,c,d];});
line(U.some(x=>/\u00b0F|mph/.test(x))&&U.some(x=>/\u00b0C|km\/h/.test(x)),'units follow the setting (\u00b0F and mph, or \u00b0C and km/h)',JSON.stringify(U));
/* history */
await S(()=>window.dispatchAct('weather.history'));await p.waitForTimeout(1200);
line(await S(()=>(window.DB.environment||[]).some(b=>b.dataset==='archive'&&b.daily.kinds.every(k=>k==='historical'))),'history loads, labelled historical');
/* the sheet explains kinds, sources and what the source does not supply */
await S(()=>window.dispatchAct('weather.open'));await p.waitForTimeout(250);
line(await S(()=>{const t=document.getElementById('editBackdrop').textContent;return /Day by day/.test(t)&&/recent past/.test(t)&&/Where this comes from/.test(t)&&/non-commercial/.test(t);}),'the weather sheet shows every day, what each kind means, its source and the terms');
await S(()=>window.closeSheet&&window.closeSheet());
/* Open Food Facts: a barcode the bundled database lacks */
await S(()=>window.dispatchAct('food.scan'));await p.waitForTimeout(200);
await p.fill('#scanManual','5449000000996');await S(()=>document.getElementById('scanManual').dispatchEvent(new Event('input',{bubbles:true})));
await p.click('button[data-act="scan.lookup"]');await p.waitForTimeout(3000);
const O=await S(()=>{const f=window._FOODSHEET&&window._FOODSHEET.picked;return f?{name:f.name,brand:f.brand,basis:f.basis,kcal:f.per100.kcal,src:f.source,id:window.foodIdentity(f),missing:f.provenance&&f.provenance.missing}:null;});
line(!!O&&O.src==='OPEN_FOOD_FACTS'&&O.basis==='ml'&&O.kcal===43&&O.brand==='Coca-Cola'&&O.id==='gtin:05449000000996','a product missing from the bundled database is found on Open Food Facts and resolved by barcode',JSON.stringify(O));
await S(()=>window.closeSheet&&window.closeSheet());
await S(()=>window.dispatchAct('food.scan'));await p.waitForTimeout(150);
await p.fill('#scanManual','0000000000017');await S(()=>document.getElementById('scanManual').dispatchEvent(new Event('input',{bubbles:true})));
await p.click('button[data-act="scan.lookup"]');await p.waitForTimeout(2500);
line(await S(()=>window._SCAN.status==='not found'&&/nor on Open Food Facts|or on Open Food Facts/.test(document.getElementById('editBackdrop').textContent)),'a barcode found in neither says so');
await S(()=>window.dispatchAct('scan.close'));
/* failures reach the app in the spec's vocabulary */
/* wait for the old process to exit and free the port: restarting too early left it answering with the normal fixtures */
await new Promise(r=>{api.once('exit',r);api.kill();});await wait(200);api=startServer(path.resolve('tests/fixtures/ext-errors'),API);await wait(1000);
const health=await get(API,'/v1/ext/sources');line(health.status===200,'the server restarts with failure fixtures');
await S(()=>window.dispatchAct('weather.refresh'));await p.waitForTimeout(1500);
const W=await S(()=>window.DB.settings.weatherSync);line(!!W&&W.state==='failed'&&W.error&&W.error.category==='authorization_denied','a refused request reaches the app as authorization_denied, and the weather already stored stays',JSON.stringify(W&&W.error));
line(await S(()=>(window.DB.environment||[]).some(b=>b.dataset==='forecast')),'existing weather survives a failed refresh');
r=await get(API,'/v1/ext/weather/forecast?lat=40.7&lon=-74&provider=meteosource');line(r.json&&r.json.error&&r.json.error.category==='rate_limited','a rate-limited provider is reported as rate_limited',JSON.stringify(r.json));
api.kill();
line(!api.logs.join('').match(/40\.7|74\.0/),'no coordinates appear in the server log');
line(!fs.readFileSync('dist/index.html','utf8').match(/METEOSOURCE_API_KEY\s*[=:]\s*['"][A-Za-z0-9]/),'no provider key is embedded in the app');
line(errors.length===0,'no errors in the page',errors.slice(0,2).join(' | '));
await browser.close();web.close();fs.rmSync(tmp,{recursive:true,force:true});
console.log(failed?failed+' failed':'all passed');process.exit(failed?1:0);
