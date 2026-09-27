#!/usr/bin/env node
/* Verify a built dist/ before it is packaged or deployed.
 * Re-reads every file from disk and checks it against BUILD-MANIFEST.json and SHA256SUMS, confirms the
 * required assets exist, confirms index.html only references files that are present, and confirms the food
 * data shards match their own checksum file. Exits non-zero on any mismatch.
 *
 *   node scripts/verify-dist.mjs [--dist ./dist]
 */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';

const args=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,arr)=>(v.startsWith('--')?[...a,[v.slice(2),arr[i+1]]]:a),[]));
const DIST=args.dist||'./dist';
const errs=[],notes=[];
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const must=p=>{if(!fs.existsSync(path.join(DIST,p)))errs.push('missing required file: '+p);return fs.existsSync(path.join(DIST,p));};

if(!fs.existsSync(DIST)){console.error('no dist at '+DIST);process.exit(1);}

/* 1. build manifest: every listed file present, right size, right hash */
if(must('BUILD-MANIFEST.json')){
  const man=JSON.parse(fs.readFileSync(path.join(DIST,'BUILD-MANIFEST.json'),'utf8'));
  for(const f of man.files){
    const p=path.join(DIST,f.file);
    if(!fs.existsSync(p)){errs.push('manifest lists a missing file: '+f.file);continue;}
    const st=fs.statSync(p);
    if(st.size!==f.bytes)errs.push('size mismatch: '+f.file+' (manifest '+f.bytes+', on disk '+st.size+')');
    else if(sha(p)!==f.sha256)errs.push('hash mismatch: '+f.file);
  }
  notes.push(man.files.length+' files in BUILD-MANIFEST, build '+man.build+', schema '+man.schema);
}

/* 2. SHA256SUMS covers everything shipped outside the data directories */
if(must('SHA256SUMS')){
  const lines=fs.readFileSync(path.join(DIST,'SHA256SUMS'),'utf8').split('\n').filter(l=>l&&!l.startsWith('#'));
  const listed=new Set();
  for(const l of lines){
    const [h,f]=l.split(/\s{2,}/);if(!f)continue;listed.add(f);
    const p=path.join(DIST,f);
    if(!fs.existsSync(p)){errs.push('SHA256SUMS lists a missing file: '+f);continue;}
    if(sha(p)!==h)errs.push('SHA256SUMS mismatch: '+f);
  }
  const walk=(dir,base='')=>fs.readdirSync(dir).flatMap(f=>{const p=path.join(dir,f);const rel=base?base+'/'+f:f;return fs.statSync(p).isDirectory()?walk(p,rel):[rel];});
  for(const f of walk(DIST)){
    if(f==='SHA256SUMS'||f.startsWith('data/food/')||f.startsWith('data/supplements/')||f.startsWith('data/reference/'))continue;
    if(!listed.has(f))errs.push('shipped file is not checksummed: '+f);
  }
  notes.push(listed.size+' files checksummed');
}

/* 3. required PWA assets */
['index.html','sw.js','manifest.webmanifest','version.json','icons/favicon.svg','icons/favicon-32.png','icons/favicon-16.png','icons/apple-touch-icon.png','icons/icon-192.png','icons/icon-512.png'].forEach(must);

/* 4. index.html references only files that exist */
if(fs.existsSync(path.join(DIST,'index.html'))){
  const html=fs.readFileSync(path.join(DIST,'index.html'),'utf8');
  for(const m of html.matchAll(/(?:href|src)="\.\/([^"]+)"/g)){
    const ref=m[1].split('?')[0];
    if(/^data\//.test(ref))continue;
    if(!fs.existsSync(path.join(DIST,ref)))errs.push('index.html references a missing asset: '+ref);
  }
  if(/\beval\s*\(|new\s+Function\s*\(/.test(html))errs.push('index.html contains eval or new Function');
  if(/<script[^>]+src=/.test(html))errs.push('index.html loads an external script; this build must be self-contained');
  notes.push('index.html '+Math.round(Buffer.byteLength(html)/1024)+' KB, self-contained');
}

/* 5. service worker parses and its shell exists */
if(fs.existsSync(path.join(DIST,'sw.js'))){
  const sw=fs.readFileSync(path.join(DIST,'sw.js'),'utf8');
  try{new Function(sw);}catch(e){errs.push('sw.js does not parse: '+e.message);}
  const shell=/SHELL\s*=\s*\[([^\]]*)\]/.exec(sw);
  if(shell)for(const raw of shell[1].split(',')){
    const f=raw.trim().replace(/^['"]|['"]$/g,'').replace(/^\.\//,'');
    if(!f||f===''||f==='./')continue;
    if(!fs.existsSync(path.join(DIST,f)))errs.push('service-worker shell references a missing file: '+f);
  }
}

/* 6. manifest.webmanifest parses and its icons exist */
if(fs.existsSync(path.join(DIST,'manifest.webmanifest'))){
  try{const mf=JSON.parse(fs.readFileSync(path.join(DIST,'manifest.webmanifest'),'utf8'));
    (mf.icons||[]).forEach(i=>{const p=i.src.replace(/^\.\//,'');if(!fs.existsSync(path.join(DIST,p)))errs.push('web app manifest icon missing: '+p);});
  }catch(e){errs.push('manifest.webmanifest does not parse: '+e.message);}
}

/* 7. data directories verify against their own checksum files when present */
for(const dir of ['data/food','data/supplements','data/reference','data/food/fndds']){
  const sums=path.join(DIST,dir,'SHA256SUMS');
  if(!fs.existsSync(sums))continue;
  let n=0,bad=0;
  for(const l of fs.readFileSync(sums,'utf8').split('\n')){
    if(!l||l.startsWith('#'))continue;const [h,f]=l.split(/\s{2,}/);if(!f)continue;
    const p=path.join(DIST,dir,f);
    if(!fs.existsSync(p)){errs.push(dir+'/SHA256SUMS lists a missing file: '+f);bad++;continue;}
    if(sha(p)!==h){errs.push(dir+' checksum mismatch: '+f);bad++;}
    n++;
  }
  notes.push(dir+': '+n+' files verified'+(bad?', '+bad+' bad':''));
}

notes.forEach(n=>console.log('  '+n));
if(errs.length){console.error('\nFAILED — '+errs.length+' problem'+(errs.length===1?'':'s')+':');errs.forEach(e=>console.error('  '+e));process.exit(1);}
console.log('\ndist verified.');
