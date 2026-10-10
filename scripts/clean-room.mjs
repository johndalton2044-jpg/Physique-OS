/* CLEAN-ROOM BUILD (audit R-004, EC-001; catalogue W-032): proves this repository reproduces its distribution from the
   exact commit. Exports the commit (git archive HEAD) into an empty folder, with no node_modules, no dist and no food data;
   installs dependencies from the lock (npm ci); fetches the food corpus from its locked archive; builds with a fixed
   SOURCE_DATE_EPOCH; builds this tree the same way; and compares every distributed file byte for byte. It records the
   commit and the runtime it ran on. A difference caused by uncommitted changes is named as such: a release is of a commit.
     node scripts/clean-room.mjs [--food <archive path or URL>] [--epoch <unix seconds>] [--worktree]
   Without --food (or FOOD_DATA_URL), the corpus is the one the commit itself carries in data/food; the build checks every
   file of it against data/food.lock.json either way.
   --worktree copies the working tree instead of the commit (for checking uncommitted work; it is not release evidence). */
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import {execSync} from 'node:child_process';
const arg=k=>{const i=process.argv.indexOf(k);return i>=0?process.argv[i+1]:null;};
const food=arg('--food')||process.env.FOOD_DATA_URL||null;
const foodSource=food?(/^https?:/.test(food)?food:path.resolve(food)):null;
const epoch=arg('--epoch')||process.env.SOURCE_DATE_EPOCH||'1790000000';
const room=fs.mkdtempSync(path.join(os.tmpdir(),'physique-clean-'));const here=process.cwd();
const run=(cmd,cwd,env)=>execSync(cmd,{cwd,stdio:['ignore','pipe','pipe'],env:Object.assign({},process.env,env||{}),encoding:'utf8',timeout:600000,maxBuffer:256*1024*1024});
let commit=null;if(!process.argv.includes('--worktree')){try{commit=run('git rev-parse HEAD',here).trim();}catch(e){commit=null;}}
if(commit){
  /* the exact commit, as git stores it: tracked files only, so a build that needs an untracked file fails here */
  run('git archive --format=tar HEAD | tar -x -C '+JSON.stringify(room),here);
}else{
  const SKIP=new Set(['node_modules','dist','release','.git']);
  const copy=(a,b)=>{for(const e of fs.readdirSync(a,{withFileTypes:true})){if(SKIP.has(e.name))continue;const s=path.join(a,e.name),d=path.join(b,e.name);
    if(path.relative(here,s)==='data/food'||/\.tar\.gz$/.test(e.name))continue;if(e.isDirectory()){fs.mkdirSync(d,{recursive:true});copy(s,d);}else fs.copyFileSync(s,d);}};
  copy(here,room);
}
const npmV=(()=>{try{return run('npm -v',here).trim();}catch(e){return '?';}})();
console.log('clean room: '+room+' — '+(commit?'commit '+commit.slice(0,12):'working tree (not release evidence)')+'; node '+process.version+', npm '+npmV+', '+process.platform+'-'+process.arch);
run('npm ci --no-audit --no-fund',room);console.log('  dependencies installed from package-lock.json (npm ci)');
if(foodSource){run('node scripts/food-fetch.mjs --url '+JSON.stringify(foodSource),room);console.log('  food corpus fetched from its locked archive and verified');}
else if(commit&&fs.existsSync(path.join(room,'data/food/manifest.json')))console.log('  food corpus: the one this commit carries in data/food (the build checks each file against the lock)');
else{console.error('clean-room: no food corpus — give --food <archive> or FOOD_DATA_URL'+(commit?'':' (--worktree does not copy data/food)'));process.exit(2);}
run('node build.mjs',room,{SOURCE_DATE_EPOCH:epoch});run('node build.mjs',here,{SOURCE_DATE_EPOCH:epoch});console.log('  both trees built with SOURCE_DATE_EPOCH='+epoch);
const hashes=root=>{const out={};const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else out[path.relative(root,p)]=crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');}};walk(root);return out;};
const A=hashes(path.join(room,'dist')),B=hashes(path.join(here,'dist'));
const diff=[...new Set(Object.keys(A).concat(Object.keys(B)))].filter(f=>A[f]!==B[f]);
const vA=JSON.parse(fs.readFileSync(path.join(room,'dist/version.json'),'utf8')),vB=JSON.parse(fs.readFileSync(path.join(here,'dist/version.json'),'utf8'));
console.log('  '+Object.keys(A).length+' files in the clean build, '+Object.keys(B).length+' in this tree; build '+vA.build+' / '+vB.build+', release '+vA.release+' / '+vB.release);
if(diff.length){
  let why='';if(commit){try{const ch=run('git status --porcelain --untracked-files=no',here).trim();if(ch)why=' — the working tree has uncommitted changes ('+ch.split('\n').length+' file(s)), and a release is of a commit';}catch(e){}}
  console.log('  FAIL  '+diff.length+' file(s) differ: '+diff.slice(0,8).join(', ')+why);process.exit(1);}
console.log('  pass  the clean-room build is byte-identical to this tree’s');fs.rmSync(room,{recursive:true,force:true});
