/* CLEAN-ROOM BUILD (audit R-004, EC-001): proves this repository reproduces its distribution. Copies the repository with
   no node_modules, no dist and no food data into an empty folder; installs dependencies from the lock (npm ci); fetches
   the food corpus from its locked archive; builds with a fixed SOURCE_DATE_EPOCH; builds this tree the same way; and
   compares every distributed file byte for byte.
     node scripts/clean-room.mjs --food <archive path or URL> [--epoch <unix seconds>] */
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import {execSync} from 'node:child_process';
const arg=k=>{const i=process.argv.indexOf(k);return i>=0?process.argv[i+1]:null;};
const food=arg('--food')||process.env.FOOD_DATA_URL;if(!food){console.error('clean-room: give --food <archive> or FOOD_DATA_URL');process.exit(2);}
const epoch=arg('--epoch')||process.env.SOURCE_DATE_EPOCH||'1790000000';
const room=fs.mkdtempSync(path.join(os.tmpdir(),'physique-clean-'));const here=process.cwd();
const SKIP=new Set(['node_modules','dist','release','.git']);
const copy=(a,b)=>{for(const e of fs.readdirSync(a,{withFileTypes:true})){if(SKIP.has(e.name)||(a===here&&e.name==='data'&&false))continue;const s=path.join(a,e.name),d=path.join(b,e.name);
  if(path.relative(here,s)==='data/food'||/\.tar\.gz$/.test(e.name))continue;if(e.isDirectory()){fs.mkdirSync(d,{recursive:true});copy(s,d);}else fs.copyFileSync(s,d);}};
copy(here,room);
const run=(cmd,cwd,env)=>execSync(cmd,{cwd,stdio:['ignore','pipe','pipe'],env:Object.assign({},process.env,env||{}),encoding:'utf8',timeout:600000});
console.log('clean room: '+room);
run('npm ci --no-audit --no-fund',room);console.log('  dependencies installed from package-lock.json (npm ci)');
run('node scripts/food-fetch.mjs --url '+JSON.stringify(path.resolve(food)),room);console.log('  food corpus fetched from its locked archive and verified');
run('node build.mjs',room,{SOURCE_DATE_EPOCH:epoch});run('node build.mjs',here,{SOURCE_DATE_EPOCH:epoch});console.log('  both trees built with SOURCE_DATE_EPOCH='+epoch);
const hashes=root=>{const out={};const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else out[path.relative(root,p)]=crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');}};walk(root);return out;};
const A=hashes(path.join(room,'dist')),B=hashes(path.join(here,'dist'));
const diff=[...new Set(Object.keys(A).concat(Object.keys(B)))].filter(f=>A[f]!==B[f]);
const vA=JSON.parse(fs.readFileSync(path.join(room,'dist/version.json'),'utf8')),vB=JSON.parse(fs.readFileSync(path.join(here,'dist/version.json'),'utf8'));
console.log('  '+Object.keys(A).length+' files in the clean build, '+Object.keys(B).length+' in this tree; build '+vA.build+' / '+vB.build+', release '+vA.release+' / '+vB.release);
if(diff.length){console.log('  FAIL  '+diff.length+' file(s) differ: '+diff.slice(0,8).join(', '));process.exit(1);}
console.log('  pass  the clean-room build is byte-identical to this tree\u2019s');fs.rmSync(room,{recursive:true,force:true});
