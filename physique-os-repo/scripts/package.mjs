/* Release packaging, reproducibly (audit §74, §111 phase 2): refuses a build whose recorded gates did not all pass for
   that build; writes dist, the repository and the food corpus as reproducible archives (sorted names, fixed times,
   gzip without a timestamp); checks the food archive against the lock; writes SHA256SUMS for everything it made.
     node scripts/package.mjs [outDir]                                              (default ./release) */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {execSync} from 'node:child_process';
const out=path.resolve(process.argv[2]||'release');fs.mkdirSync(out,{recursive:true});
const v=JSON.parse(fs.readFileSync('dist/version.json','utf8')),g=JSON.parse(fs.readFileSync('docs/release/gate-results.json','utf8'));
if(g.build!==v.build){console.error('package: the recorded gates are for '+g.build+', not this build '+v.build);process.exit(1);}
const bad=Object.entries(g.gates).filter(([k,x])=>!x.ok).map(([k])=>k);if(bad.length){console.error('package: gates not passed: '+bad.join(', '));process.exit(1);}
const TAR="tar --sort=name --mtime='2026-01-01 00:00Z' --owner=0 --group=0 --numeric-owner";
const pack=(name,src,excl)=>{const f=path.join(out,name);execSync(TAR+' '+(excl||[]).map(e=>"--exclude='"+e+"'").join(' ')+' -cf - -C '+src+' . | gzip -n > '+JSON.stringify(f),{stdio:['ignore','ignore','inherit'],shell:'/bin/bash'});return f;};
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const made=[pack('physique-os-dist.tar.gz','dist',['./data/food']),pack('physique-os-repo.tar.gz','.',['./node_modules','./dist/data/food','./data/food','./server-data','./release','*.tar.gz'])];
const foodSrc=fs.existsSync('data/food/SHA256SUMS')?'data/food':(fs.existsSync('dist/data/food/SHA256SUMS')?'dist/data/food':null);
if(foodSrc){const f=pack('physique-os-food-data.tar.gz',foodSrc),lock=JSON.parse(fs.readFileSync('data/food.lock.json','utf8')),h=sha(f);
  if(h!==lock.archive.sha256){console.error('package: the food archive ('+h+') does not match the lock ('+lock.archive.sha256+'); the corpus changed');process.exit(1);}made.push(f);}
fs.copyFileSync('dist/index.html',path.join(out,'physique-os-index.html'));fs.copyFileSync('server/server.mjs',path.join(out,'server.mjs'));made.push(path.join(out,'physique-os-index.html'),path.join(out,'server.mjs'));
fs.writeFileSync(path.join(out,'SHA256SUMS'),made.map(f=>sha(f)+'  '+path.basename(f)).join('\n')+'\n');
console.log('packaged build '+v.build+' into '+out+': '+made.map(f=>path.basename(f)).join(', ')+(foodSrc?' (food archive matches the lock)':' (no food corpus here)'));
