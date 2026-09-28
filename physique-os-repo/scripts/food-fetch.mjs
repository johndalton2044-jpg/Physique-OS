/* Fetches the food corpus deterministically: downloads the release archive, checks its SHA-256 against data/food.lock.json,
   and extracts it into data/food. The build then verifies every file against the lock.
     node scripts/food-fetch.mjs --url https://github.com/<you>/<repo>/releases/download/<tag>/physique-os-food-data.tar.gz */
import fs from 'node:fs';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';
const i=process.argv.indexOf('--url'),url=i>=0?process.argv[i+1]:process.env.FOOD_DATA_URL;
if(!url){console.error('usage: node scripts/food-fetch.mjs --url <archive url>   (or set FOOD_DATA_URL)');process.exit(2);}
const lock=JSON.parse(fs.readFileSync('data/food.lock.json','utf8'));
const r=await fetch(url);if(!r.ok){console.error('download failed: HTTP '+r.status);process.exit(1);}
const buf=Buffer.from(await r.arrayBuffer()),h=crypto.createHash('sha256').update(buf).digest('hex');
if(h!==lock.archive.sha256){console.error('checksum mismatch: got '+h+', the lock declares '+lock.archive.sha256+' ('+lock.databaseVersion+')');process.exit(1);}
fs.mkdirSync('data/food',{recursive:true});fs.writeFileSync('data/food.tar.gz',buf);execFileSync('tar',['-xzf','data/food.tar.gz','-C','data/food']);fs.rmSync('data/food.tar.gz');
console.log('food data '+lock.databaseVersion+' fetched and checked; the build verifies each file');
