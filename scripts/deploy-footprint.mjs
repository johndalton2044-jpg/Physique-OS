/* DEPLOYMENT FOOTPRINT (catalogue doc 1, W-033): what a deployment of this build uploads, stores and sends, measured
   from the built artifact and from a browser, not inferred from the size of dist on disk.

     node scripts/deploy-footprint.mjs              build, measure everything, write docs/deployment-footprint.{json,md}
     node scripts/deploy-footprint.mjs --no-build   measure the dist already built
     (the deploy gate imports measureFirstLoad and cacheRules and holds them to FOOTPRINT_BUDGETS)

   Measured here: the files the host serves (vercel.json: outputDirectory), their sizes raw and compressed, the cache
   header vercel.json gives each one, the build time, and what a browser actually transfers on a first visit, on a first
   food search and on a return visit, from a local server that applies vercel.json's headers and compresses as a CDN
   does. Not measurable here, and said so in the report: the platform's own record of a deployment (its stored size,
   its edge compression level, cold starts and region), which needs the owner's account (`vercel inspect <url>`). */
import fs from 'node:fs';import path from 'node:path';import zlib from 'node:zlib';import http from 'node:http';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const DIST=path.join(ROOT,'dist');
/* what the gate holds a deployment to: each from the first measurement (in the report) with room to grow */
/* what the gate holds a deployment to: each from the first measurement (1.41 MB, 0 bytes, 0.28 MB at build 9a9661b252)
   with room to grow, and well under the 2.87 MB a first visit cost when the page was precached under two names */
export const FOOTPRINT_BUDGETS={firstVisitBytes:1600000,returnVisitBytes:60000,firstSearchBytes:1000000};
/* the compression a CDN applies on the fly: brotli at a moderate quality for clients that accept it (all current
   browsers), gzip otherwise. The levels are this measurement's assumption, stated in the report. */
const BR_QUALITY=5,GZIP_LEVEL=6;

const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
const rel=f=>'/'+path.relative(DIST,f).split(path.sep).join('/');
const TEXT=/\.(html|js|json|md|css|svg|webmanifest|txt)$/;
const br=b=>zlib.brotliCompressSync(b,{params:{[zlib.constants.BROTLI_PARAM_QUALITY]:BR_QUALITY,[zlib.constants.BROTLI_PARAM_SIZE_HINT]:b.length}}).length;
const gz=b=>zlib.gzipSync(b,{level:GZIP_LEVEL}).length;
const group=p=>p.startsWith('/data/food/')?'food corpus':(p.startsWith('/data/')?'reference data':(/\.md$/.test(p)||p.startsWith('/docs/')||p==='/BUILD-MANIFEST.json'?'documents':'app shell'));

/* vercel.json header sources are path-to-regexp patterns: text outside parentheses is literal, a group is a regex */
function sourceRegex(src){let out='',depth=0;for(const ch of src){if(ch==='(')depth++;if(depth>0)out+=ch;else out+=ch.replace(/[.*+?^${}|[\]\\]/g,'\\$&');if(ch===')')depth--;}return new RegExp('^'+out+'$');}
/* every rule whose source matches a path, in file order; when two set the same header, which one applies depends on the
   platform's precedence, so a path with two different values for one header is reported as ambiguous */
export function cacheRules(vj,p){const hits=(vj.headers||[]).filter(h=>sourceRegex(h.source).test(p)).map(h=>({source:h.source,value:(h.headers.find(x=>x.key.toLowerCase()==='cache-control')||{}).value})).filter(h=>h.value);
  const values=[...new Set(hits.map(h=>h.value))];return {rules:hits,cacheControl:values.length===1?values[0]:(values.length?null:'(platform default)'),ambiguous:values.length>1,values};}

/* the cache rules alone, for every file: cheap enough for the gate (no compression) */
export function cacheReport(){const vj=JSON.parse(fs.readFileSync(path.join(ROOT,'vercel.json'),'utf8'));
  const files=walk(DIST).map(rel),of=p=>cacheRules(vj,p).cacheControl;
  return {ambiguous:files.filter(p=>cacheRules(vj,p).ambiguous),index:of('/index.html'),sw:of('/sw.js'),manifest:of('/data/food/manifest.json'),
    shard:of(files.find(p=>/^\/data\/food\/branded\//.test(p))||'/data/food/branded/x.json')};}
export function inventory(){const vj=JSON.parse(fs.readFileSync(path.join(ROOT,'vercel.json'),'utf8'));
  const files=walk(DIST).map(f=>{const p=rel(f),b=fs.readFileSync(f);return {path:p,group:group(p),bytes:b.length,br:TEXT.test(p)?br(b):b.length,gzip:TEXT.test(p)?gz(b):b.length,cache:cacheRules(vj,p)};});
  const sum=(xs,k)=>xs.reduce((a,x)=>a+x[k],0),groups={};
  files.forEach(f=>{const g=groups[f.group]=groups[f.group]||{files:0,bytes:0,br:0,gzip:0};g.files++;g.bytes+=f.bytes;g.br+=f.br;g.gzip+=f.gzip;});
  return {outputDirectory:vj.outputDirectory,buildCommand:vj.buildCommand,files:files.length,bytes:sum(files,'bytes'),br:sum(files,'br'),gzip:sum(files,'gzip'),groups,
    largest:files.slice().sort((a,b)=>b.bytes-a.bytes).slice(0,8).map(f=>({path:f.path,bytes:f.bytes,br:f.br})),
    ambiguous:files.filter(f=>f.cache.ambiguous).map(f=>({path:f.path,values:f.cache.values})),
    cache:Object.fromEntries(['/index.html','/sw.js','/version.json','/data/food/manifest.json','/data/food/foundation.json','/icons/icon.svg'].filter(p=>files.some(f=>f.path===p)).map(p=>[p,files.find(f=>f.path===p).cache.cacheControl]))};}

/* a static host as vercel.json describes it: dist, its headers, on-the-fly compression, and an ETag on every file so a
   revalidation ("no-cache", "must-revalidate") is answered 304 with no body, as static hosts do; it counts the bytes it sends */
export function vercelLikeServer(port){const vj=JSON.parse(fs.readFileSync(path.join(ROOT,'vercel.json'),'utf8')),log=[];
  const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';const f=path.join(DIST,p);
    if(!f.startsWith(DIST)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404,{'content-type':'text/html'});r.end('<!doctype html><title>404: NOT_FOUND</title>');log.push({path:p,status:404,bytes:0});return;}
    let body=fs.readFileSync(f);const etag='"'+crypto.createHash('sha1').update(body).digest('hex').slice(0,20)+'"';
    if(q.headers['if-none-match']===etag){r.writeHead(304,{etag});r.end();log.push({path:p,status:304,bytes:0});return;}
    const h={etag,'content-type':/\.html$/.test(f)?'text/html':/\.js$/.test(f)?'text/javascript':/\.json$/.test(f)?'application/json':/\.svg$/.test(f)?'image/svg+xml':/\.png$/.test(f)?'image/png':/\.webmanifest$/.test(f)?'application/manifest+json':'application/octet-stream'};
    (vj.headers||[]).forEach(rule=>{if(sourceRegex(rule.source).test(p))rule.headers.forEach(x=>{h[x.key]=x.value;});});   /* applied in order; the last wins */
    const ae=String(q.headers['accept-encoding']||'');if(TEXT.test(f)){if(/\bbr\b/.test(ae)){body=zlib.brotliCompressSync(body,{params:{[zlib.constants.BROTLI_PARAM_QUALITY]:BR_QUALITY}});h['content-encoding']='br';}
      else if(/gzip/.test(ae)){body=zlib.gzipSync(body,{level:GZIP_LEVEL});h['content-encoding']='gzip';}}
    h['content-length']=body.length;h.vary='Accept-Encoding';r.writeHead(200,h);r.end(body);log.push({path:p,status:200,bytes:body.length});});
  return new Promise(res=>srv.listen(port,'127.0.0.1',()=>res({srv,log,close:()=>srv.close()})));}

/* what a browser transfers: a first visit (until the app is ready and its service worker has cached the shell), a first
   food search, and a return visit in the same browser */
export async function measureFirstLoad(o){o=o||{};const port=o.port||18890,S=await vercelLikeServer(port);
  const {chromium}=await import('playwright-core');const {findBrowser}=await import('../tests/_browser-path.mjs');
  const browser=await chromium.launch({executablePath:findBrowser(),args:['--no-sandbox','--disable-dev-shm-usage']});
  const ctx=await browser.newContext({viewport:{width:393,height:852}}),page=await ctx.newPage(),t0=Date.now();
  const mark=()=>S.log.length,span=(a,b)=>S.log.slice(a,b),bytes=xs=>xs.reduce((s,x)=>s+x.bytes,0);
  let a=mark();await page.goto('http://127.0.0.1:'+port+'/');
  await page.waitForFunction(()=>typeof window.dispatchAct==='function'&&document.querySelector('[data-act]'),null,{timeout:60000});
  await page.evaluate(async()=>{if(navigator.serviceWorker){await navigator.serviceWorker.ready;}});await page.waitForTimeout(800);
  const readyMs=Date.now()-t0,first=span(a,mark());
  await page.evaluate(()=>{const w=document.querySelector('[data-act="welcome.skip"]');if(w)w.click();});
  a=mark();await page.evaluate(()=>{const b=document.querySelector('button[data-tab="food"]');if(b)b.click();});await page.waitForTimeout(300);
  const el=await page.$('#foodSearch');let searched=false;
  if(el){await el.fill('chicken breast');await page.evaluate(()=>document.getElementById('foodSearch').dispatchEvent(new Event('input',{bubbles:true})));
    await page.waitForFunction(()=>window._FOOD_RESULTS&&window._FOOD_RESULTS.state&&window._FOOD_RESULTS.state!=='loading'&&window._FOOD_RESULTS.state!=='idle',null,{timeout:30000}).catch(()=>{});await page.waitForTimeout(500);searched=true;}
  const search=span(a,mark());
  a=mark();const t1=Date.now();await page.reload();await page.waitForFunction(()=>typeof window.dispatchAct==='function',null,{timeout:60000});await page.waitForTimeout(800);
  const again=span(a,mark()),againMs=Date.now()-t1;
  await browser.close();S.close();
  const sum=xs=>({requests:xs.length,bytes:bytes(xs),revalidated:xs.filter(x=>x.status===304).length,paths:xs.map(x=>x.path+' '+x.status+' '+x.bytes)});
  return {firstVisit:Object.assign(sum(first),{readyMs,foodShards:first.filter(x=>/^\/data\/food\/branded\//.test(x.path)).length}),
    firstSearch:Object.assign(sum(search),{searched,foodShards:search.filter(x=>/^\/data\/food\//.test(x.path)&&x.status===200).length}),
    returnVisit:Object.assign(sum(again),{readyMs:againMs}),compression:'brotli quality '+BR_QUALITY+' (gzip level '+GZIP_LEVEL+' for clients without brotli)'};}

const mb=b=>(b/1048576).toFixed(b<10485760?2:1)+' MB',kb=b=>(b/1024).toFixed(1)+' KB';
function report(R){const I=R.inventory,L=R.load,G=I.groups;
  return ['# Deployment footprint','',
    'Measured by `node scripts/deploy-footprint.mjs` (catalogue doc 1, W-033) on build '+R.build+', '+R.at.slice(0,10)+'. Generated: do not edit by hand.','',
    'What is measured here is the artifact the host serves and what a browser transfers from a server that applies `vercel.json`. What only the platform knows is not: its stored size for the deployment, the compression level its edge uses, cold starts and region. Those need the owner’s account (`vercel inspect <deployment-url>`).','',
    '## What is deployed','',
    'The host runs `'+I.buildCommand+'` and serves `'+I.outputDirectory+'`: '+I.files+' files, '+mb(I.bytes)+' raw, '+mb(I.br)+' with brotli, '+mb(I.gzip)+' with gzip.','',
    '| Part | Files | Raw | Brotli | Gzip |','|---|---|---|---|---|',
    ...Object.keys(G).sort((a,b)=>G[b].bytes-G[a].bytes).map(k=>'| '+k+' | '+G[k].files+' | '+mb(G[k].bytes)+' | '+mb(G[k].br)+' | '+mb(G[k].gzip)+' |'),'',
    'Largest files: '+I.largest.map(f=>'`'+f.path+'` '+mb(f.bytes)+' ('+mb(f.br)+' brotli)').join(', ')+'.','',
    '## Build','',
    R.buildMs!=null?('`node build.mjs` took '+(R.buildMs/1000).toFixed(1)+' s here with the food corpus already present. On the host, `prebuild` first fetches the corpus (`scripts/food-fetch.mjs --if-missing`), whose time depends on the host’s network.'):'Not measured in this run (`--no-build`).','',
    '## Caching','',
    '| Path | Cache-Control |','|---|---|',...Object.keys(I.cache).map(p=>'| `'+p+'` | '+I.cache[p]+' |'),'',
    I.ambiguous.length?('Ambiguous: '+I.ambiguous.map(a=>'`'+a.path+'` ('+a.values.join(' / ')+')').join(', ')+'. Two rules set its Cache-Control; which applies depends on the platform’s precedence.'):'No path is given two different Cache-Control values by `vercel.json`.','',
    '## What a browser transfers','',
    '| Visit | Requests | Bytes | Food shards | Time to ready |','|---|---|---|---|---|',
    '| First visit (app ready, service worker installed) | '+L.firstVisit.requests+' | '+mb(L.firstVisit.bytes)+' | '+L.firstVisit.foodShards+' | '+(L.firstVisit.readyMs/1000).toFixed(1)+' s |',
    '| First food search ("chicken breast") | '+L.firstSearch.requests+' | '+mb(L.firstSearch.bytes)+' | '+L.firstSearch.foodShards+' | |',
    '| Return visit (same browser) | '+L.returnVisit.requests+' | '+kb(L.returnVisit.bytes)+' | | '+(L.returnVisit.readyMs/1000).toFixed(1)+' s |','',
    'Compression assumed: '+L.compression+'. Times are on a local connection and show the app’s own work, not a network’s.','',
    'The food corpus is '+mb(G['food corpus']?G['food corpus'].bytes:0)+' of the deployment and none of it is sent on a first visit: a search fetches only the shards it needs, and the service worker keeps them.','',
    '## Budgets the deploy gate holds','',
    'First visit at most '+mb(FOOTPRINT_BUDGETS.firstVisitBytes)+', a first food search at most '+mb(FOOTPRINT_BUDGETS.firstSearchBytes)+', a return visit at most '+kb(FOOTPRINT_BUDGETS.returnVisitBytes)+'; no food shard on a first visit; no path with two Cache-Control values.',''].join('\n');}

if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  const args=process.argv.slice(2);let buildMs=null;
  if(!args.includes('--no-build')){const t=Date.now(),r=spawnSync(process.execPath,['build.mjs'],{cwd:ROOT,stdio:'ignore'});if(r.status!==0){console.error('the build failed');process.exit(1);}buildMs=Date.now()-t;}
  const v=JSON.parse(fs.readFileSync(path.join(DIST,'version.json'),'utf8'));
  const R={build:v.build,at:new Date().toISOString(),buildMs,inventory:inventory(),load:await measureFirstLoad()};
  fs.writeFileSync(path.join(ROOT,'docs/deployment-footprint.json'),JSON.stringify(R,null,1)+'\n');fs.writeFileSync(path.join(ROOT,'docs/deployment-footprint.md'),report(R));
  console.log(report(R));
}
