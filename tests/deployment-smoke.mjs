/* DEPLOYMENT SMOKE TEST (deployment repair plan §12).
   Against a real deployment:   node tests/deployment-smoke.mjs --app https://YOUR-APP [--sync https://YOUR-SERVER]
     1 server health directly · 2 health through the /api/sync rewrite · 3 place search · 4 forecast · 5 air quality
   Locally (a gate):            node tests/deployment-smoke.mjs --local
     builds three production-shaped stacks \u2014 a static site with no server (the reported failure), a static site with the
     rewrite to a running server, and a rewrite to a dead server \u2014 and drives the app through each. */
import {releaseContract} from './_release-contract.mjs';import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawn} from 'node:child_process';
const args=process.argv.slice(2),arg=k=>{const i=args.indexOf(k);return i>=0?args[i+1]:null;};
let failed=0;const line=(ok,msg,d)=>{if(!ok)failed++;console.log('  '+(ok?'pass':'FAIL')+'  '+msg+(d&&!ok?'  \u2014 '+d:''));};
setTimeout(()=>{console.log('  FAIL  the smoke test did not finish within 170 s');process.exit(1);},170000).unref();
async function getJSON(u){try{const r=await fetch(u,{headers:{accept:'application/json'}});const ct=r.headers.get('content-type')||'';
  return {status:r.status,json:/json/.test(ct)?await r.json():null,html:!/json/.test(ct)};}catch(e){return {status:0,err:String(e.message||e)};}}
async function remote(app,sync){
  console.log('Deployment smoke test: '+app+(sync?' (server '+sync+')':''));
  if(sync){const h=await getJSON(sync+'/v1/health');line(h.status===200&&h.json&&h.json.ok,'1 the server answers its health check directly',JSON.stringify(h).slice(0,160));}
  const h2=await getJSON(app+'/api/sync/v1/health');
  line(h2.status===200&&h2.json&&h2.json.ok&&h2.json.service==='physique-os-sync','2 the app reaches the server through /api/sync',h2.html?'a web page came back (HTTP '+h2.status+'): the /api/sync rewrite is missing or points nowhere':JSON.stringify(h2).slice(0,160));
  const g=await getJSON(app+'/api/sync/v1/ext/geocode?name=Norfolk');const place=g.json&&g.json.payload&&g.json.payload.results&&g.json.payload.results[0];
  line(!!place,'3 a place search works (Norfolk)',JSON.stringify(g).slice(0,160));
  if(place){const q='lat='+place.latitude+'&lon='+place.longitude+'&tz='+encodeURIComponent(place.timezone||'UTC');
    const f=await getJSON(app+'/api/sync/v1/ext/weather/forecast?'+q+'&past_days=7&forecast_days=14');
    line(f.json&&f.json.status==='ok'&&f.json.provider==='open-meteo'&&f.json.payload&&f.json.payload.current&&f.json.payload.hourly&&f.json.payload.daily,'4 the forecast arrives with current, hourly and daily',JSON.stringify(f).slice(0,160));
    const a=await getJSON(app+'/api/sync/v1/ext/weather/air-quality?'+q);line(a.json&&a.json.status==='ok','5 air quality arrives',JSON.stringify(a).slice(0,160));}
  await certify(app,{build:arg('--build'),metricsToken:arg('--metrics-token')||process.env.METRICS_TOKEN,out:arg('--certificate')});
}
/* DEPLOYMENT CERTIFICATION (audit §87, §111 phase 4): every layer of a live deployment, with a certificate of the results. */
async function certify(app,o){o=o||{};const R=[],rec=(layer,ok,detail)=>{R.push({layer,ok:!!ok,detail:String(detail||'').slice(0,200)});line(ok,'certify: '+layer,detail);};
  const v=await getJSON(app+'/version.json');rec('app build',v.json&&v.json.build&&(!o.build||v.json.build===o.build),v.json?('live build '+v.json.build+(o.build?' (expected '+o.build+')':'')):'no version.json');
  const h=await getJSON(app+'/api/sync/v1/health');const sc=h.json&&h.json.storageCheck;
  rec('server through the rewrite',h.json&&h.json.ok,h.json?('epoch '+h.json.epoch):'HTTP '+h.status);
  rec('server storage',sc&&sc.writable&&!sc.warnings.length,sc?(sc.warnings.join('; ')||'writable, no warnings'):'no storage check (older server)');
  rec('push keys',h.json&&typeof h.json.vapidPublicKey==='string'&&h.json.vapidPublicKey.length>60,'VAPID public key '+(h.json&&h.json.vapidPublicKey?'present':'missing'));
  const man=await getJSON(app+'/data/food/manifest.json');let shardOk=false,shardDetail='no manifest';
  if(man.json){try{const sums=await (await fetch(app+'/data/food/SHA256SUMS',{cache:'no-store'})).text(),first=sums.split('\n').find(l=>/\.json$/.test(l.trim())&&!/manifest/.test(l));
    const [hash,name]=first.trim().split(/\s+/);const buf=Buffer.from(await (await fetch(app+'/data/food/'+name.replace(/^\.\//,''),{cache:'no-store'})).arrayBuffer());
    const got=(await import('node:crypto')).createHash('sha256').update(buf).digest('hex');shardOk=got===hash;shardDetail=name+(shardOk?' matches its checksum':' does NOT match its checksum');}catch(e){shardDetail='could not check a shard: '+e.message;}}
  rec('food database',man.json&&shardOk,man.json?('manifest '+(man.json.databaseVersion||'')+'; '+shardDetail):'manifest.json: HTTP '+man.status);
  const off=await getJSON(app+'/api/sync/v1/ext/food/off/product?code=3017624010701');rec('Open Food Facts lookup',off.json&&(off.json.status==='ok'||(off.json.error&&off.json.error.category==='unsupported_record')),off.json?(off.json.status||off.json.error.category):'HTTP '+off.status);
  const cp=await getJSON(app+'/api/sync/v1/ext/connect/providers');rec('connected services endpoint',cp.json&&Array.isArray(cp.json.providers),cp.json?(cp.json.providers.filter(p=>p.configured).map(p=>p.id).join(', ')||'none configured')+(cp.json.tokenCustody?'; sign-ins encrypted':'; no CONNECT_TOKEN_KEY'):'HTTP '+cp.status);
  if(o.metricsToken){const m=await fetch(app+'/api/sync/v1/metrics',{headers:{authorization:'Bearer '+o.metricsToken}});let mj=null;try{mj=await m.json();}catch(e){}rec('server metrics',m.status===200&&mj&&mj.uptimeSeconds>=0,mj?('up '+mj.uptimeSeconds+' s, '+mj.vaults+' vaults'):'HTTP '+m.status);}
  const cert={certificate:'Physique OS deployment',app,at:new Date().toISOString(),passed:R.every(r=>r.ok),layers:R};
  if(o.out){fs.writeFileSync(o.out,JSON.stringify(cert,null,2));console.log('certificate written to '+o.out);}
  return cert;}
async function local(){
  /* the release contract: runtime, lock and CI (catalogue W-001, W-002) */
  releaseContract(line);
  /* The host builds the app and serves dist, never the repository root: without these Vercel looked for a "public"
     folder after the build and refused to deploy ("No Output Directory named public"). */
  {const vj=JSON.parse(fs.readFileSync('vercel.json','utf8'));
    line(vj.outputDirectory==='dist'&&/\bnpm run build\b|\bnode build\.mjs\b/.test(vj.buildCommand||''),'vercel.json tells the host to run the build and serve dist',JSON.stringify({buildCommand:vj.buildCommand,outputDirectory:vj.outputDirectory}));
    line(fs.existsSync('dist/index.html'),'the build put the app in dist');}
  const {chromium}=await import('playwright-core');const {findBrowser}=await import('./_browser-path.mjs');
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pos-deploy-'));const API=18801,wait=ms=>new Promise(r=>setTimeout(r,ms));
  const api=spawn(process.execPath,['server/server.mjs'],{env:Object.assign({},process.env,{PORT:String(API),HOST:'127.0.0.1',DATA_DIR:tmp,TRUST_PROXY:'1',METRICS_TOKEN:'met',PHYSIQUE_EXT_FIXTURES:path.resolve('tests/fixtures/ext')}),stdio:'ignore'});
  await wait(900);
  /* a static host: files from dist, and for anything missing its own HTML 404 page (as Vercel serves) */
  const site=(port,rewriteTo)=>new Promise(res=>{const s=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);
    if(rewriteTo!==undefined&&u.startsWith('/api/sync/')){const pr=http.request({host:'127.0.0.1',port:rewriteTo,path:q.url.replace('/api/sync',''),method:q.method,headers:Object.assign({},q.headers,{'x-forwarded-for':'203.0.113.7'})},p=>{r.writeHead(p.statusCode,p.headers);p.pipe(r);});
      pr.on('error',()=>{r.writeHead(502,{'content-type':'text/html'});r.end('<html><body>502: DNS_HOSTNAME_RESOLVED_PRIVATE / bad gateway</body></html>');});q.pipe(pr);return;}
    const f=path.join('dist',u==='/'?'index.html':u);fs.readFile(f,(e,d)=>{if(e){r.writeHead(404,{'content-type':'text/html'});r.end('<!doctype html><title>404: NOT_FOUND</title><h1>404</h1>');return;}
      r.writeHead(200,{'Content-Type':/\.js$/.test(f)?'text/javascript':/\.json$/.test(f)?'application/json':/\.html$/.test(f)?'text/html':'application/octet-stream'});r.end(d);});});
    s.listen(port,'127.0.0.1',()=>res(s));});
  const staticOnly=await site(18802),proxied=await site(18803,API),deadProxy=await site(18804,18899);
  const browser=await chromium.launch({executablePath:findBrowser(),args:['--no-sandbox','--disable-dev-shm-usage']});
  const run=async(port,fn)=>{const ctx=await browser.newContext({viewport:{width:393,height:852}});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
    await p.goto('http://127.0.0.1:'+port+'/index.html');await p.waitForTimeout(1400);await p.evaluate(()=>window.dispatchAct('welcome.skip'));const r=await fn(p);await ctx.close();return {r,errs};};
  const searchAndCheck=async p=>{await p.evaluate(()=>window.dispatchAct('weather.open'));await p.waitForTimeout(200);await p.fill('#wxPlace','Norfolk');
    await p.evaluate(()=>document.getElementById('wxPlace').dispatchEvent(new Event('input',{bubbles:true})));await p.click('button[data-act="weather.search"]');await p.waitForTimeout(900);
    const shown=await p.evaluate(()=>document.getElementById('editBackdrop').textContent);const d=await p.evaluate(()=>window.testExternalServer({probeProvider:true}));return {shown,d};};
  /* 1. the reported failure: a static site with no server behind /api/sync */
  let o=await run(18802,searchAndCheck);
  line(!/Something went wrong/.test(o.r.shown)&&/need the Physique OS server/.test(o.r.shown),'with no server attached, the place search says the server is missing (not "Something went wrong")',o.r.shown.slice(0,160));
  line(o.r.d.code==='B'&&/no rewrite/.test(o.r.d.verdict),'the connection check names the missing rewrite',JSON.stringify(o.r.d).slice(0,200));
  /* 2. a correct deployment */
  const h=await getJSON('http://127.0.0.1:18803/api/sync/v1/health');line(h.status===200&&h.json&&h.json.ok&&h.json.ext,'health through the /api/sync rewrite',JSON.stringify(h).slice(0,120));
  o=await run(18803,async p=>{const c=await searchAndCheck(p);await p.click('#editBackdrop [data-act="weather.pick"][data-arg="0"]');await p.waitForTimeout(1500);
    const e=await p.evaluate(()=>(window.DB.environment||[]).map(b=>b.dataset));
    /* the service worker must not cache /api: stop answering and a repeat must fail, not replay a copy */
    await p.evaluate(async()=>{if(navigator.serviceWorker){await navigator.serviceWorker.ready;}});await p.reload();await p.waitForTimeout(1500);
    const again1=await p.evaluate(()=>fetch('/api/sync/v1/ext/sources').then(r=>r.status).catch(()=>0));return Object.assign(c,{e,again1,sw:await p.evaluate(()=>!!(navigator.serviceWorker&&navigator.serviceWorker.controller))});});
  line(o.r.d.code==='OK','with the rewrite and server, the connection check passes every layer',JSON.stringify(o.r.d).slice(0,200));
  line(o.r.e.includes('forecast')&&o.r.e.includes('air-quality'),'picking a place loads the forecast and air quality',JSON.stringify(o.r.e));
  { const cert=await certify('http://127.0.0.1:18803',{metricsToken:'met'});line(cert.passed,'the certificate passes for a correct deployment',JSON.stringify(cert.layers.filter(l=>!l.ok)));}
  api.kill('SIGKILL');await wait(400);
  const again2=await (async()=>{const ctx=await browser.newContext();const p=await ctx.newPage();await p.goto('http://127.0.0.1:18803/index.html');await p.waitForTimeout(1200);
    const s=await p.evaluate(()=>fetch('/api/sync/v1/ext/sources').then(r=>r.status).catch(()=>0));await ctx.close();return s;})();
  line(o.r.again1===200&&again2!==200,'the service worker does not serve /api/sync from a cache: with the server stopped the request fails',JSON.stringify({before:o.r.again1,after:again2,swActive:o.r.sw}));
  line(fs.readFileSync('dist/sw.js','utf8').includes("indexOf('/api/')>=0"),'the service worker source bypasses /api/');
  /* 3. a rewrite to a server that is not running */
  o=await run(18804,async p=>p.evaluate(()=>window.testExternalServer({probeProvider:true})));
  line(o.r.code==='C','a rewrite to a stopped server is named as the server not answering',JSON.stringify(o.r).slice(0,200));
  await browser.close();[staticOnly,proxied,deadProxy].forEach(s=>s.close());fs.rmSync(tmp,{recursive:true,force:true});
}
if(args.includes('--local'))await local();
else{const app=arg('--app');if(!app){console.error('usage: node tests/deployment-smoke.mjs --app https://YOUR-APP [--sync https://YOUR-SERVER]  |  --local');process.exit(2);}
  await remote(app.replace(/\/$/,''),arg('--sync')&&arg('--sync').replace(/\/$/,''));}
console.log(failed?failed+' failed':'all passed');process.exit(failed?1:0);
