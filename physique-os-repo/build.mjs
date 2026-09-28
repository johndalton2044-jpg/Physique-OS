// PHYSIQUE OS build: src/ → dist/ (single-file index.html + PWA shell + data). No bundler, no minifier, no eval.
/* Node only. No child processes, no second language runtime, no native modules — so this builds on any
   image that can run `node`, which is what a hosted build gives you. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import vm from 'node:vm';
const ROOT=process.cwd();const SRC=path.join(ROOT,'src'),DIST=path.join(ROOT,'dist');
fs.mkdirSync(DIST,{recursive:true});fs.mkdirSync(path.join(DIST,'icons'),{recursive:true});fs.mkdirSync(path.join(DIST,'data','reference'),{recursive:true});
const files=fs.readdirSync(SRC).sort();
/* BUNDLED FONTS. The typeface setting named faces most devices do not have (Atkinson Hyperlegible, OpenDyslexic) and
   never loaded them, and a separate web-font setting fetched other faces from Google, which fails offline and only
   applied after a reload. Every offered face is now embedded here, from open-licence files in fonts/ (SIL OFL 1.1,
   licences alongside), so a choice works everywhere — offline, in a file preview, with no network at all. */
const FONT_FAMILIES={'atkinson-hyperlegible':'Atkinson Hyperlegible','ibm-plex-mono':'IBM Plex Mono','inter':'Inter','lexend':'Lexend',
  'literata':'Literata','nunito':'Nunito','opendyslexic':'OpenDyslexic','source-serif-4':'Source Serif 4'};
const FONT_DIR=path.join(path.dirname(SRC),'fonts');
const fontFaces=fs.existsSync(FONT_DIR)?fs.readdirSync(FONT_DIR).filter(f=>/-latin-(400|700)-normal\.woff2$/.test(f)).sort().map(f=>{
  const m=f.match(/^(.*)-latin-(400|700)-normal\.woff2$/);const fam=FONT_FAMILIES[m[1]];if(!fam)throw new Error('font file with no family mapping: '+f);
  const b64=fs.readFileSync(path.join(FONT_DIR,f)).toString('base64');
  return "@font-face{font-family:'"+fam+"';font-style:normal;font-weight:"+m[2]+";font-display:swap;src:url(data:font/woff2;base64,"+b64+") format('woff2')}";}).join('\n'):'';
const head=fs.readFileSync(path.join(SRC,'00-head.html'),'utf8').replace('/*__FONT_FACES__*/',fontFaces);const body=fs.readFileSync(path.join(SRC,'01-body.html'),'utf8');
const js=files.filter(f=>/^\d\d-.*\.js$/.test(f));
/* A source file that does not match the include pattern is SILENTLY dropped from the build, which is how a
   whole module can be written, saved, and never run. Fail loudly instead. */
const strayJs=files.filter(f=>f.endsWith('.js')&&!/^\d\d-.*\.js$/.test(f));
if(strayJs.length){
  console.error('BUILD REFUSED: src/ contains .js file(s) the include pattern would silently drop:');
  strayJs.forEach(f=>console.error('  src/'+f+'  (expected NN-name.js, two digits then a dash)'));
  process.exit(1);
}
const CORE=fs.readFileSync(path.join(SRC,'10-core.js'),'utf8');const APP_VERSION=/APP_VERSION='([^']+)'/.exec(CORE)[1];const SCHEMA_VERSION=+/SCHEMA_VERSION=(\d+)/.exec(CORE)[1];
const buildTime=new Date().toISOString();
/* ---- build identity ----
   BUILD_ID hashes src/ alone, which answers "is the application code the same". It does NOT answer "is the
   distribution the same", because the output also depends on build.mjs, the generator scripts, the reference
   data, and the package configuration. Two builds could share a BUILD_ID and differ on disk.
   RELEASE_ID therefore hashes every material build input, and it — not BUILD_ID — names the service-worker
   cache, so a change to the build pipeline invalidates the cache the way a source change does. */
const srcHash=crypto.createHash('sha256');files.forEach(f=>srcHash.update(fs.readFileSync(path.join(SRC,f))));
const BUILD_ID=srcHash.digest('hex').slice(0,10);
const inputSet=[];
const hashInput=(rel)=>{const abs=path.join(ROOT,rel);if(!fs.existsSync(abs))return;
  const st=fs.statSync(abs);
  if(st.isDirectory()){for(const f of fs.readdirSync(abs).sort())hashInput(path.join(rel,f));return;}
  inputSet.push({file:rel,bytes:st.size,sha256:crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex')});};
['src','build.mjs','package.json','scripts','data/reference','tests'].forEach(r=>hashInput(r));
/* the food database is an input too, but it is 93 MB — its own manifest already carries a content hash of
   every shard, so the manifest's identity stands in for the corpus rather than re-reading it here */
/* THE FOOD DATABASE (\u2248100 MB) is not produced by this build: scripts/food-build.mjs downloads and shards the USDA sources.
   A deployment built from the repository had none (every lookup 404ed on data/food/manifest.json). It is kept in the
   repository at data/food/ and copied here; without it the build warns, and in production mode it fails. */
{const srcFood=path.join('data','food'),dstFood=path.join(DIST,'data','food');
  if(!fs.existsSync(path.join(dstFood,'manifest.json'))&&fs.existsSync(path.join(srcFood,'manifest.json'))){fs.mkdirSync(path.dirname(dstFood),{recursive:true});fs.cpSync(srcFood,dstFood,{recursive:true});console.log('food database copied from data/food');}
  /* Reproducibility: the corpus must be exactly the one data/food.lock.json declares, file by file. */
  const lockP=path.join('data','food.lock.json');
  if(fs.existsSync(lockP)&&fs.existsSync(path.join(dstFood,'SHA256SUMS'))){const lock=JSON.parse(fs.readFileSync(lockP,'utf8'));
    const sums=fs.readFileSync(path.join(dstFood,'SHA256SUMS'));const h=crypto.createHash('sha256').update(sums).digest('hex');
    if(h!==lock.sumsSha256){console.error('FOOD DATA: SHA256SUMS does not match data/food.lock.json ('+lock.databaseVersion+'): a different corpus');process.exit(1);}
    let bad=0;for(const ln of sums.toString('utf8').split('\n')){const m=ln.match(/^([a-f0-9]{64})\s+(.+)$/);if(!m)continue;const f=path.join(dstFood,m[2]);
      if(!fs.existsSync(f)||crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')!==m[1]){bad++;if(bad<4)console.error('FOOD DATA: '+m[2]+' is missing or altered');}}
    if(bad){console.error('FOOD DATA: '+bad+' file(s) do not match the declared corpus');process.exit(1);}
    console.log('food data verified: '+lock.databaseVersion+', '+lock.files+' files');}
  if(!fs.existsSync(path.join(dstFood,'manifest.json'))){const m='the bundled food database is missing (no data/food/manifest.json): food search and barcode lookups will only reach Open Food Facts. Extract physique-os-food-data.tar.gz into data/food/.';
    if(process.env.SYNC_DEPLOYMENT_MODE==='reverse-proxy'){console.error('DEPLOYMENT: '+m);process.exit(1);}console.warn('WARNING: '+m);}}
const foodManifestForId=path.join(DIST,'data','food','manifest.json');
if(fs.existsSync(foodManifestForId)){const m=JSON.parse(fs.readFileSync(foodManifestForId,'utf8'));
  inputSet.push({file:'data/food/manifest.json (database identity)',bytes:0,sha256:crypto.createHash('sha256').update(String(m.databaseVersion)+':'+String(m.totalBytes)+':'+String((m.files||[]).length)).digest('hex')});}
const releaseHash=crypto.createHash('sha256');
inputSet.forEach(i=>releaseHash.update(i.file+':'+i.sha256+'\n'));
const RELEASE_ID=releaseHash.digest('hex').slice(0,12);
let script='';
for(const f of js){const code=fs.readFileSync(path.join(SRC,f),'utf8');if(/<\/script/i.test(code))throw new Error(f+' contains </script>');script+='\n/* ===== SOURCE: '+f+' ===== */\n'+code+'\n';}
script=script.replace(/__BUILD_ID__/g,BUILD_ID).replace(/__RELEASE_ID__/g,RELEASE_ID).replace(/__BUILD_TIME__/g,buildTime);
/* ---- SHIPPING TRANSFORM ----
   The shipped file crossed 2 MiB during step 11 and inline file previews stopped running it. The source keeps
   every comment; the SHIPPED script drops whole-line comments and indentation, which is 12% of the bytes and
   none of the behaviour. Three guards keep this from ever changing what the code does:
     1. A comment is only removed if it occupies whole lines, and its body may not contain a closing marker \u2014
        otherwise a line holding a short comment followed by code, then another comment below it, could be
        matched as one span and the code between them deleted. (This note cannot quote such a line: the
        closing marker would end this very comment — which is exactly how its first draft broke the build.)
     2. Indentation is only stripped if no string literal spans lines (a template literal could), because
        leading whitespace inside such a string is content, not layout.
     3. The result is compiled with Node's own parser before it is written, so a transform that broke the
        syntax fails the build rather than shipping a dead page.
   The SOURCE markers are kept: they cost almost nothing and attribute every line of the shipped file. */
const SHIP={before:Buffer.byteLength(script,'utf8')};
{
  const noComm=script.replace(/\/\*[\s\S]*?\*\//g,'');
  const multiLineTemplates=(noComm.match(/`[^`]*`/g)||[]).filter(l=>l.includes('\n')).length;
  let out=script.replace(/^[ \t]*\/\*(?! ===== SOURCE:)(?:(?!\*\/)[\s\S])*\*\/[ \t]*\n/gm,'');
  out=out.replace(/^[ \t]*\/\/[^\n]*\n/gm,'');
  if(!multiLineTemplates)out=out.replace(/^[ \t]+/gm,'');
  out=out.replace(/\n{2,}/g,'\n');
  try{new vm.Script(out,{filename:'shipped-bundle.js'});}
  catch(e){throw new Error('shipping transform produced invalid JavaScript \u2014 refusing to ship: '+e.message);}
  script=out;
  SHIP.after=Buffer.byteLength(script,'utf8');SHIP.indentStripped=!multiLineTemplates;SHIP.multiLineTemplates=multiLineTemplates;
}
const forbidden=[/\beval\s*\(/,/new\s+Function\s*\(/,/document\.write\s*\(/];
for(const re of forbidden){const m=re.exec(script);if(m)throw new Error('forbidden construct in bundle: '+m[0]);}
/* ---- declaration-order guards: values a wrapper closes over must be assigned before the wrapper is installed ---- */
const iDecl=script.indexOf('var FOODLOG_TYPES=');const iWrap=script.indexOf('var _orig=dailySeries;dailySeries=function');
if(iDecl<0||iWrap<0||iDecl>iWrap)throw new Error('FOODLOG_TYPES must be assigned before the dailySeries aggregation override is installed');
/* ---- settings must target <html>: the stylesheet selects html[data-contrast|data-motion|data-density] ---- */
if(/document\.body\.setAttribute\('data-(contrast|motion|density)'/.test(script))throw new Error('applySettings must set data-* attributes on document.documentElement, not body');
/* ---- mutation-path audit (catalogue §177) ----
   Protected state may only be changed through an approved primitive. Two mutation paths for one thing is
   how the phase editor and the decision engine came to write different history, and how a program change
   came to bypass its own log. This is a build-time check so a second path cannot be introduced quietly.
   Each rule names the field, the primitives allowed to write it, and the files those primitives live in. */
const MUTATION_RULES=[
  /* Two files CONSTRUCT records rather than mutate a live one, which is a different operation: the migration
     assembles a record from an older document, and the demo generator fabricates one from nothing. Neither
     has a live record to preserve history for, and both hand off to the normal path afterwards — migration
     writes its ledger entry, the generator calls resetEventLog(). They are allowed by name, not by accident. */
  {label:'phase targets',pattern:/\b(?:ph|phase|p)\.(calorieTarget|proteinTarget|stepTarget|cardioSessions|cardioMinutes|trainingSessions)\s*=(?!=)/g,
   allow:['30-observations.js','70-demo.js'],primitive:'updatePhase()'},
  {label:'training program',pattern:/DB\.settings\.program\s*=(?!=)/g,
   allow:['30-observations.js','95-selftest.js'],primitive:'setProgram()'},
  {label:'program definitions',pattern:/DB\.settings\.customPrograms\s*\[[^\]]+\]\s*=(?!=)/g,
   allow:['67-program-edit.js','24-events.js'],primitive:'saveProgramDef()'},   // the self-test establishes a baseline in order to test setProgram itself
  /* The self-test deliberately constructs damaged and edge-case records to check that the system rejects
     or handles them. It is exempt by name so the audit stays meaningful for production paths. */
  {label:'observation retraction',pattern:/\.retracted\s*=\s*true/g,
   allow:['30-observations.js','62-food.js','94-navigation.js','24-events.js','95-selftest.js'],primitive:'retractObservation() / removeFoodLog() / bulkRun()'},
  {label:'food log quantity',pattern:/\bl\.(quantity|grams|ml|servings)\s*=(?!=)/g,
   allow:['62-food.js','20-schema-storage.js'],primitive:'updateFoodLog()'},
  {label:'profile',pattern:/DB\.profile\s*=(?!=)/g,
   allow:['20-schema-storage.js','24-events.js','26-sync.js','99-boot.js','90-actions.js','95-selftest.js'],primitive:'saveProfile()'}
];
{
  const violations=[];
  for(const f of files.filter(x=>x.endsWith('.js'))){
    const body=fs.readFileSync(path.join(SRC,f),'utf8');
    for(const rule of MUTATION_RULES){
      if(rule.allow.includes(f))continue;
      rule.pattern.lastIndex=0;
      let m;
      while((m=rule.pattern.exec(body))){
        const line=body.slice(0,m.index).split('\n').length;
        violations.push(f+':'+line+' writes '+rule.label+' directly \u2014 use '+rule.primitive);
      }
    }
  }
  if(violations.length)throw new Error('mutation-path audit failed:\n  '+violations.join('\n  '));
}
/* ---- touch-target certification: primary controls must declare a 44px minimum hit area in the stylesheet ---- */
for(const sel of ['.btn','.tab','.hdr-btn','.fab','.day-strip button','.scale-row button','.food-item','.list-item[data-act]','.chip']){const re=new RegExp(sel.replace(/[.\[\]]/g,'\\$&')+'[^{]*\\{[^}]*min-height:\\s*44px');if(!re.test(head))throw new Error('touch-target rule missing (min-height:44px) for '+sel);}
/* ---- Content Security Policy ----
   The application is one inline script, so the policy pins that script by SHA-256 hash rather than allowing
   inline script generally: an injected <script> cannot match the hash and will not execute.
   style-src needs 'unsafe-inline' because the interface uses style="" attributes throughout; that is a real
   and stated limitation, not an oversight. connect-src stays 'self' since the app fetches only its own data
   shards. font-src allows only this document and embedded data: fonts — every face is bundled, nothing is fetched. */
const scriptHash=crypto.createHash('sha256').update(Buffer.from('\n'+script+'\n','utf8')).digest('base64');
/* connect-src is 'self' by design: the app should not be able to post the record anywhere it likes.
   That makes the default sync endpoint a SAME-ORIGIN PATH (/api/sync), reverse-proxied to the server, which
   is both the cleanest deployment and the only one that works under this policy without loosening it.
   A deployment that genuinely needs a separate origin passes it at build time and takes the trade knowingly:
     node build.mjs --sync-origin https://sync.example.com                                                */
const syncOrigin=(process.argv.includes('--sync-origin')?process.argv[process.argv.indexOf('--sync-origin')+1]:'')||'';
const connectSrc=["'self'"].concat(syncOrigin?[syncOrigin]:[]).join(' ');
const CSP=["default-src 'none'","script-src 'sha256-"+scriptHash+"'","style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:","img-src 'self' data: blob:","connect-src "+connectSrc,"manifest-src 'self'",
  "worker-src 'self'","base-uri 'none'","form-action 'none'","frame-ancestors 'none'","object-src 'none'"].join('; ');
const html=head.replace('</head>','<meta http-equiv="Content-Security-Policy" content="'+CSP+'">\n<meta name="physique-build" content="'+BUILD_ID+' '+buildTime+'">\n<meta name="physique-release" content="'+RELEASE_ID+'">\n</head>')+body+'\n<script>\n'+script+'\n</script>\n</body>\n</html>\n';
fs.writeFileSync(path.join(DIST,'index.html'),html);
/* ---- service worker: versioned cache, precache shell, cache-first data shards, network-first HTML ---- */
const sw=`/* PHYSIQUE OS service worker — generated by build.mjs. Version ${APP_VERSION}+${BUILD_ID} */
var VERSION='physique-os-${APP_VERSION}-${RELEASE_ID}'; /* release identity, not source identity: a change to the build pipeline or reference data must also invalidate the cache */
var SHELL=['./','./index.html','./manifest.webmanifest','./icons/icon.svg','./icons/favicon.svg','./icons/favicon-32.png','./icons/favicon-16.png','./icons/icon-192.png','./icons/icon-512.png','./icons/maskable-512.png','./icons/apple-touch-icon.png','./data/reference/compendium-2024.json'];
self.addEventListener('install',function(e){e.waitUntil(caches.open(VERSION).then(function(c){return Promise.all(SHELL.map(function(u){return c.add(u).catch(function(){});}));}));});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(keys){return Promise.all(keys.filter(function(k){return k!==VERSION&&k.indexOf('physique-os-')===0;}).map(function(k){return caches.delete(k);}));}).then(function(){return self.clients.claim();}));});
self.addEventListener('message',function(e){if(e.data&&e.data.type==='SKIP_WAITING')self.skipWaiting();});
/* Push: the honest answer to "a browser will not run a closed app's code". It will not, but a push service
   can wake this worker. The push carries NO BODY by design, so neither the push service nor the sync server
   learns anything about the user — only that something is waiting. */
self.addEventListener('push',function(e){
  e.waitUntil(self.registration.showNotification('Physique OS',{
    body:'Something is waiting to sync. Open the app to merge it.',
    tag:'physique-sync',icon:'./icons/icon-192.png',badge:'./icons/favicon-32.png',
    data:{at:Date.now()}}));
});
self.addEventListener('notificationclick',function(e){
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(function(list){
    for(var i=0;i<list.length;i++){if('focus' in list[i])return list[i].focus();}
    if(self.clients.openWindow)return self.clients.openWindow('./');
  }));
});
/* Periodic background sync where the browser offers it (Chromium only, and only for installed apps).
   Where it does not exist nothing breaks: the scheduler still runs its jobs when the app is opened. */
self.addEventListener('periodicsync',function(e){
  if(e.tag==='physique-refresh')e.waitUntil(self.registration.showNotification('Physique OS',{
    body:'Daily check is ready. Open to score forecasts and evaluate experiments.',
    tag:'physique-daily',icon:'./icons/icon-192.png'}));
});
self.addEventListener('fetch',function(e){
  var req=e.request;if(req.method!=='GET')return;var url=new URL(req.url);if(url.origin!==location.origin)return;
  /* The server path is never cached: cache-first here served the first forecast forever and could replay stale sync pulls. */
  if(url.pathname.indexOf('/api/')>=0||url.pathname.indexOf('/v1/')>=0)return;
  var isData=url.pathname.indexOf('/data/')>=0;var isHTML=req.mode==='navigate'||/\\/$|index\\.html$/.test(url.pathname);
  if(isData){e.respondWith(caches.open(VERSION).then(function(c){return c.match(req).then(function(hit){if(hit)return hit;return fetch(req).then(function(res){if(res&&res.ok)c.put(req,res.clone());return res;});});}));return;}
  if(isHTML){e.respondWith(fetch(req).then(function(res){if(res&&res.ok)caches.open(VERSION).then(function(c){c.put(req,res.clone());});return res;}).catch(function(){return caches.match(req).then(function(hit){return hit||caches.match('./index.html');});}));return;}
  e.respondWith(caches.match(req).then(function(hit){return hit||fetch(req).then(function(res){if(res&&res.ok)caches.open(VERSION).then(function(c){c.put(req,res.clone());});return res;});}));
});
`;
fs.writeFileSync(path.join(DIST,'sw.js'),sw);
/* ---- manifest ---- */
/* home-screen shortcuts: long-press the icon; each opens an allow-listed quick action */
const MANIFEST_SHORTCUTS=[['Weigh in','weigh-in'],['Log supplements','supplements'],['+0.5 L water','water'],['Start workout','workout']].map(([n,id])=>({name:n,short_name:n,url:'./?do='+id,icons:[{src:'./icons/icon-192.png',sizes:'192x192',type:'image/png'}]}));
const manifest={shortcuts:MANIFEST_SHORTCUTS,name:'Physique OS',short_name:'Physique',description:'Offline-first adaptive body-composition operating system: observe, model, decide, predict, learn.',start_url:'./',scope:'./',display:'standalone',orientation:'portrait',background_color:'#101216',theme_color:'#101216',lang:'en',categories:['health','fitness','productivity'],icons:[{src:'icons/icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any'},{src:'icons/icon-192.png',sizes:'192x192',type:'image/png'},{src:'icons/icon-512.png',sizes:'512x512',type:'image/png'},{src:'icons/maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}]};
fs.writeFileSync(path.join(DIST,'manifest.webmanifest'),JSON.stringify(manifest,null,1));
/* ---- icons: SVG mark + PNG rasters via PIL ---- */
const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#101216"/><circle cx="256" cy="256" r="150" fill="none" stroke="#8fbc8f" stroke-width="18"/><path d="M150 300 L215 235 L262 282 L362 182" fill="none" stroke="#e4e7e4" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/><circle cx="362" cy="182" r="20" fill="#9b8db3"/></svg>`;
fs.writeFileSync(path.join(DIST,'icons','icon.svg'),svg);
fs.writeFileSync(path.join(DIST,'icons','favicon.svg'),svg); // index.html declares favicon.svg / favicon-32.png / favicon-16.png
/* Icons are rasterised in Node (scripts/icons.mjs). This used to shell out to python3 with Pillow, which
   works on a developer machine and fails on any CI image that ships Node and nothing else — which is how
   the hosted build broke. The build must depend on nothing but Node. */
{
  const {drawIcon}=await import('./scripts/icons.mjs');
  const write=(name,buf)=>fs.writeFileSync(path.join(DIST,'icons',name),buf);
  for(const n of [16,32,180,192,512])write('icon-'+n+'.png',drawIcon(n));
  write('maskable-512.png',drawIcon(512,{maskable:true}));
  fs.renameSync(path.join(DIST,'icons','icon-180.png'),path.join(DIST,'icons','apple-touch-icon.png'));
  fs.copyFileSync(path.join(DIST,'icons','icon-32.png'),path.join(DIST,'icons','favicon-32.png'));
  fs.copyFileSync(path.join(DIST,'icons','icon-16.png'),path.join(DIST,'icons','favicon-16.png'));
  /* A PNG that is not a PNG would sail through every later check, so verify the signature and dimensions
     that were actually written rather than trusting the encoder. */
  for(const f of fs.readdirSync(path.join(DIST,'icons')).filter(x=>x.endsWith('.png'))){
    const b=fs.readFileSync(path.join(DIST,'icons',f));
    const sig=b.slice(0,8).toString('hex');
    if(sig!=='89504e470d0a1a0a')throw new Error('icon '+f+' is not a PNG');
    const w=b.readUInt32BE(16), h=b.readUInt32BE(20);
    if(!w||w!==h)throw new Error('icon '+f+' has bad dimensions '+w+'x'+h);
    if(b.length<200)throw new Error('icon '+f+' is suspiciously small ('+b.length+' bytes)');
  }
  console.log('icons ok');
}
/* ---- data: reference json ---- */
fs.copyFileSync(path.join(ROOT,'data','reference','compendium-2024.json'),path.join(DIST,'data','reference','compendium-2024.json'));
/* ---- docs: shipped alongside the app so an offline copy carries its own instructions ---- */
fs.mkdirSync(path.join(DIST,'docs'),{recursive:true});
for(const d of ['README.md','ARCHITECTURE.md'])if(fs.existsSync(path.join(ROOT,d)))fs.copyFileSync(path.join(ROOT,d),path.join(DIST,d));
if(fs.existsSync(path.join(ROOT,'docs')))for(const d of fs.readdirSync(path.join(ROOT,'docs')))if(d.endsWith('.md'))fs.copyFileSync(path.join(ROOT,'docs',d),path.join(DIST,'docs',d));
/* ---- version + docs + checksums ----
   Order matters: write every artifact, then BUILD-MANIFEST.json (which lists everything but itself and SHA256SUMS),
   then SHA256SUMS over everything including the manifest, then re-read and verify both. Nothing is modified after. */
const foodManifestPath=path.join(DIST,'data','food','manifest.json');const foodInfo=fs.existsSync(foodManifestPath)?JSON.parse(fs.readFileSync(foodManifestPath,'utf8')):null;
const fnddsManifestPath=path.join(DIST,'data','food','fndds','manifest.json');const fnddsInfo=fs.existsSync(fnddsManifestPath)?JSON.parse(fs.readFileSync(fnddsManifestPath,'utf8')):null;
const dsldManifestPath=path.join(DIST,'data','supplements','manifest.json');const dsldInfo=fs.existsSync(dsldManifestPath)?JSON.parse(fs.readFileSync(dsldManifestPath,'utf8')):null;
/* ---- DEPLOYMENT CONTRACT (deployment repair plan §8, §18). The client is a static site; weather, online food lookups
   and cloud sync need server/server.mjs, a separate long-running Node service reached at /api/sync through a rewrite.
   Copying server.mjs into dist does not run it. The contract is recorded here (no secrets), DEPLOYMENT.md and a
   vercel.json template go into dist for anyone deploying dist on its own, and with SYNC_DEPLOYMENT_MODE=reverse-proxy
   the build fails unless vercel.json forwards /api/sync to a real HTTPS server. ---- */
/* One set of headers for every deployment path. The food manifest revalidates and other data files are cached for a day
   and revalidated: shard names are not content-hashed, so "immutable" was wrong \u2014 and it made a 404 served before
   the database was deployed stick in browsers for a year. */
const DATA_HEADERS=[{source:'/(index.html|sw.js|version.json)',headers:[{key:'Cache-Control',value:'no-cache'}]},{source:'/api/(.*)',headers:[{key:'Cache-Control',value:'no-store'}]},
  {source:'/data/food/manifest.json',headers:[{key:'Cache-Control',value:'no-cache'}]},{source:'/data/(.*)',headers:[{key:'Cache-Control',value:'public, max-age=86400, must-revalidate'}]},
  {source:'/(.*)',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'no-referrer'},{key:'Permissions-Policy',value:'geolocation=(), microphone=(self), camera=(self)'}]}];
const DEPLOY={client:'static',server:'external',syncPath:'/api/sync',proxyRequired:true,serverEntry:'server/server.mjs',
  healthCheck:'/api/sync/v1/health',requiresServer:['weather','online food lookups','cloud sync']};
function syncRewriteOf(vj){const r=(vj&&vj.rewrites||[]).find(x=>/^\/api\/sync\/?(:path\*|\(\.\*\))?/.test(String(x.source||'')));return r?r.destination:null;}
function validSyncOrigin(u){try{const x=new URL(String(u).replace(/\/:path\*$|\/\$1$/,''));
  if(x.protocol!=='https:')return 'the server origin must be https';if(/^(localhost|127\.|0\.0\.0\.0|\[?::1\]?$)/.test(x.hostname))return 'the server origin cannot be localhost — on Vercel that is Vercel itself';
  if(/REPLACE|example\.com$/i.test(x.hostname))return 'the server origin is still the template placeholder';return null;}catch(e){return 'the server origin is not a URL';}}
{let vj=null;try{vj=JSON.parse(fs.readFileSync('vercel.json','utf8'));}catch(e){}
  const dest=syncRewriteOf(vj),bad=dest?validSyncOrigin(dest):'vercel.json has no /api/sync rewrite';
  DEPLOY.rewriteConfigured=!bad;
  /* On Vercel the server is required: a build without a working rewrite FAILS unless it is opted out deliberately. It only
     warned unless SYNC_DEPLOYMENT_MODE was set, so a production deploy could ship a broken route. */
  if(bad&&(process.env.SYNC_DEPLOYMENT_MODE==='reverse-proxy'||(process.env.VERCEL&&process.env.PHYSIQUE_ALLOW_NO_SERVER!=='1'))){console.error('DEPLOYMENT: '+bad+'. Run: node scripts/configure-deploy.mjs --sync-origin https://your-sync-server  (or set PHYSIQUE_ALLOW_NO_SERVER=1 to deploy without weather, online food lookups and sync)');process.exit(1);}
  /* dist is self-contained: with a valid rewrite it carries its own vercel.json. */
  if(!bad){fs.writeFileSync(path.join(DIST,'vercel.json'),JSON.stringify({rewrites:vj.rewrites.filter(r=>String(r.source).startsWith('/api/sync')),headers:DATA_HEADERS},null,2)+'\n');}
  if(!DEPLOY.rewriteConfigured&&process.env.VERCEL)console.warn('WARNING: this Vercel build has no working /api/sync rewrite ('+bad+'): weather, online food lookups and cloud sync will not work. See DEPLOYMENT.md.');}
fs.writeFileSync(path.join(DIST,'DEPLOYMENT.md'),`# Deploying Physique OS

This folder is a **static site**. Weather, online food lookups (Open Food Facts) and cloud sync need a separate
**Physique OS server** (\`server/server.mjs\` in the repository), reached from the app at **\`/api/sync\`**.

Copying \`server.mjs\` into this folder does **not** run it: a static host serves it as a file.

## 1. Run the server on a Node host
It needs a long-running Node process, persistent storage and HTTPS (for example Render, Fly.io, Railway, or your own VM).

    HOST=0.0.0.0
    PORT=<the port your host gives you>
    DATA_DIR=<a persistent volume>
    TRUST_PROXY=1                          # behind Vercel: rate limits apply per person, not to Vercel as a whole
    PHYSIQUE_CONTACT=you@example.org       # identifies the app to Open Food Facts
    METEOSOURCE_API_KEY=<optional secret>  # only for the Meteosource provider; never put it in the app

    node server/server.mjs

Check it: \`https://YOUR-SERVER/v1/health\` should answer \`{"ok":true,"service":"physique-os-sync",...}\`.

## 2. Forward /api/sync to it
Deploying the repository (recommended): run \`node scripts/configure-deploy.mjs --sync-origin https://YOUR-SERVER\`,
commit \`vercel.json\`, and set \`SYNC_DEPLOYMENT_MODE=reverse-proxy\` in Vercel so a missing rewrite fails the build.

Deploying this folder on its own: copy \`vercel.json.template\` to \`vercel.json\` and replace the placeholder with your
server's https origin. Never use localhost or 127.0.0.1 — on Vercel those mean Vercel itself.

## 3. Check it
\`https://YOUR-APP/api/sync/v1/health\` must return the same JSON as above (a web page means the rewrite is missing).
In the app: Tools → External server → Test external server names the layer that fails.
`);
fs.writeFileSync(path.join(DIST,'vercel.json.template'),JSON.stringify({rewrites:[{source:'/api/sync/:path*',destination:'https://REPLACE-WITH-YOUR-SYNC-SERVER/:path*'}],headers:DATA_HEADERS},null,2)+'\n');
fs.writeFileSync(path.join(DIST,'version.json'),JSON.stringify({app:'Physique OS',version:APP_VERSION,schema:SCHEMA_VERSION,build:BUILD_ID,release:RELEASE_ID,deployment:DEPLOY,cacheName:'physique-os-'+APP_VERSION+'-'+RELEASE_ID,builtAt:buildTime,sources:js,buildInputs:inputSet.length,food:foodInfo?{databaseVersion:foodInfo.databaseVersion,branded:foodInfo.branded?foodInfo.branded.records:0,foundation:foodInfo.foundation.count,totalBytes:foodInfo.totalBytes}:null,fndds:fnddsInfo?{version:fnddsInfo.version,foods:fnddsInfo.foods}:null,dsld:dsldInfo?{version:dsldInfo.version,products:dsldInfo.products}:null},null,1));
const walk=(dir,base='')=>fs.readdirSync(dir).flatMap(f=>{const p=path.join(dir,f);const rel=base?base+'/'+f:f;return fs.statSync(p).isDirectory()?walk(p,rel):[rel];});
const isData=f=>f.startsWith('data/food/')||f.startsWith('data/supplements/');
const listed=()=>walk(DIST).filter(f=>f!=='SHA256SUMS'&&f!=='BUILD-MANIFEST.json'&&!isData(f));
const manifestFiles=listed().map(f=>({file:f,bytes:fs.statSync(path.join(DIST,f)).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(DIST,f))).digest('hex')}));
fs.writeFileSync(path.join(DIST,'BUILD-MANIFEST.json'),JSON.stringify({build:BUILD_ID,release:RELEASE_ID,builtAt:buildTime,version:APP_VERSION,schema:SCHEMA_VERSION,deployment:DEPLOY,inputs:inputSet,files:manifestFiles,indexBytes:Buffer.byteLength(html),scriptLines:script.split('\n').length,components:{
    client:manifestFiles.map(f=>f.file),
    food:{path:'data/food/',checksums:fs.existsSync(path.join(DIST,'data','food','SHA256SUMS'))?'data/food/SHA256SUMS':null,
      shards:fs.existsSync(path.join(DIST,'data','food'))?walk(path.join(DIST,'data','food')).length:0},
    reference:{path:'data/reference/',checksums:fs.existsSync(path.join(DIST,'data','reference','SHA256SUMS'))?'data/reference/SHA256SUMS':null,
      tables:fs.existsSync(path.join(DIST,'data','reference'))?walk(path.join(DIST,'data','reference')).filter(f=>f.endsWith('.json')):[]},
    server:{included:false,where:'server/server.mjs in the repository archive, not in this client distribution'}},
  note:'SHA256SUMS lists only hash and path, so sha256sum -c works directly. It covers every client file plus this manifest; data shards carry their own checksum files, named under components.'},null,1));
const sumFiles=listed().concat(['BUILD-MANIFEST.json']);
const sums=sumFiles.map(f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(DIST,f))).digest('hex')+'  '+f).join('\n')+'\n';
/* SHA256SUMS is machine-parseable: nothing but `hash␠␠path` lines, so `sha256sum -c SHA256SUMS` works
   without a reader having to strip commentary. Anything that needs saying belongs in the manifest. */
fs.writeFileSync(path.join(DIST,'SHA256SUMS'),sums);
/* verify: re-read from disk and check every recorded hash and size */
const verify=()=>{const errs=[];const man=JSON.parse(fs.readFileSync(path.join(DIST,'BUILD-MANIFEST.json'),'utf8'));
  for(const f of man.files){const p=path.join(DIST,f.file);if(!fs.existsSync(p)){errs.push('missing '+f.file);continue;}const buf=fs.readFileSync(p);if(buf.length!==f.bytes)errs.push('size mismatch '+f.file);if(crypto.createHash('sha256').update(buf).digest('hex')!==f.sha256)errs.push('hash mismatch '+f.file);}
  fs.readFileSync(path.join(DIST,'SHA256SUMS'),'utf8').split('\n').filter(l=>l&&!l.startsWith('#')).forEach(l=>{const [h,f]=l.split(/\s{2,}/);const p=path.join(DIST,f);if(!fs.existsSync(p)){errs.push('SHA256SUMS lists missing file '+f);return;}if(crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')!==h)errs.push('SHA256SUMS mismatch '+f);});
  const onDisk=listed().concat(['BUILD-MANIFEST.json']);const inSums=fs.readFileSync(path.join(DIST,'SHA256SUMS'),'utf8').split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>l.split(/\s{2,}/)[1]);onDisk.forEach(f=>{if(inSums.indexOf(f)<0)errs.push('file not checksummed: '+f);});
  for(const f of ['icons/favicon.svg','icons/favicon-32.png','icons/favicon-16.png','icons/apple-touch-icon.png','manifest.webmanifest','sw.js'])if(!fs.existsSync(path.join(DIST,f)))errs.push('required asset missing: '+f);
  const hrefs=[...html.matchAll(/href="\.\/([^"]+)"/g)].map(m=>m[1]).filter(h=>/^(icons|manifest)/.test(h));hrefs.forEach(h=>{if(!fs.existsSync(path.join(DIST,h)))errs.push('index.html references a missing asset: '+h);});
  /* The CSP pins the script by hash, so a mismatch means the shipped page would refuse to run its own code. */
  const shipped=fs.readFileSync(path.join(DIST,'index.html'),'utf8');
  const cspMeta=/content="([^"]*script-src[^"]*)"/.exec(shipped);
  if(!cspMeta)errs.push('index.html has no Content-Security-Policy');
  else{
    const declared=/'sha256-([^']+)'/.exec(cspMeta[1]);
    const inline=/<script>([\s\S]*?)<\/script>/.exec(shipped);
    if(!declared||!inline)errs.push('CSP script hash could not be checked');
    else{const actual=crypto.createHash('sha256').update(Buffer.from(inline[1],'utf8')).digest('base64');
      if(actual!==declared[1])errs.push('CSP script-src hash does not match the shipped inline script \u2014 the page would refuse to execute');}
  }
  return errs;};
const verr=verify();if(verr.length)throw new Error('dist verification failed:\n  '+verr.join('\n  '));
console.log(JSON.stringify({build:BUILD_ID,release:RELEASE_ID,inputs:inputSet.length,version:APP_VERSION,schema:SCHEMA_VERSION,indexKB:Math.round(Buffer.byteLength(html)/1024),scriptLines:script.split('\n').length,sources:js.length,files:sumFiles.length,verified:true,food:foodInfo?foodInfo.branded.records:'none',fndds:fnddsInfo?fnddsInfo.foods:'none',dsld:dsldInfo?dsldInfo.products:'none'}));
