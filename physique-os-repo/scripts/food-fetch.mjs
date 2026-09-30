/* Fetches the food corpus deterministically (audit §74, §111 phase 2), in plain Node (no tar program): downloads the
   archive, checks it against the lock (the reproducible archive, or an earlier one of identical content), extracts it,
   and checks the per-file checksum list against sumsSha256. The build then verifies every file against that list.
     node scripts/food-fetch.mjs [--url <archive url or file>] [--if-missing]
   The URL comes from --url, FOOD_DATA_URL, or archive.url in data/food.lock.json. With --if-missing (the npm prebuild
   step) it does nothing when the corpus is present or no URL is configured. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import zlib from 'node:zlib';
const lock=JSON.parse(fs.readFileSync('data/food.lock.json','utf8'));const ifMissing=process.argv.includes('--if-missing');
const present=fs.existsSync('data/food/manifest.json')||fs.existsSync('dist/data/food/manifest.json');
const i=process.argv.indexOf('--url'),url=i>=0?process.argv[i+1]:(process.env.FOOD_DATA_URL||lock.archive.url);
if(ifMissing&&(present||!url)){process.exit(0);}
if(!url){console.error('food-fetch: no archive URL (pass --url, set FOOD_DATA_URL, or set archive.url in data/food.lock.json)');process.exit(2);}
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
let buf;if(/^https?:/.test(url)){const r=await fetch(url);if(!r.ok){console.error('food-fetch: download failed, HTTP '+r.status);process.exit(1);}buf=Buffer.from(await r.arrayBuffer());}else buf=fs.readFileSync(url);
const h=sha(buf),accepted=[lock.archive.sha256].concat((lock.acceptedArchives||[]).map(a=>a.sha256));
if(!accepted.includes(h)){console.error('food-fetch: checksum '+h+' is not an archive the lock accepts ('+lock.databaseVersion+')');process.exit(1);}
/* a minimal ustar reader: regular files and directories, with the prefix field for long paths */
const tar=zlib.gunzipSync(buf),dest=path.resolve('data/food');fs.rmSync(dest,{recursive:true,force:true});fs.mkdirSync(dest,{recursive:true});
const str=(o,n)=>tar.subarray(o,o+n).toString('utf8').replace(/\0.*$/s,'');let off=0,files=0;
while(off+512<=tar.length){const name=str(off,100);if(!name)break;const size=parseInt(str(off+124,12).trim()||'0',8),type=String.fromCharCode(tar[off+156]||48),prefix=str(off+345,155);
  const rel=(prefix?prefix+'/':'')+name,target=path.resolve(dest,rel);
  if(!target.startsWith(dest)){console.error('food-fetch: refusing a path outside the folder: '+rel);process.exit(1);}
  if(type==='5')fs.mkdirSync(target,{recursive:true});else if(type==='0'||type==='\0'){fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,tar.subarray(off+512,off+512+size));files++;}
  off+=512+Math.ceil(size/512)*512;}
const sums=sha(fs.readFileSync(path.join(dest,'SHA256SUMS')));if(sums!==lock.sumsSha256){console.error('food-fetch: the extracted checksum list does not match the lock');process.exit(1);}
console.log('food data '+lock.databaseVersion+' fetched ('+files+' files): archive and checksum list verified; the build verifies each file');
