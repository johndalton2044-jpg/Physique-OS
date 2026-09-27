#!/usr/bin/env node
/* FNDDS 2021–2023 → sharded JSON for the offline adapter.
 *
 * Input: the "At A Glance" CSV exports from FoodData Central / FNDDS, placed in one directory:
 *   fndds-foods.csv      Food code, Main food description, WWEIA Category description
 *   fndds-nutrients.csv  Food code, Nutrient code, Nutrient value      (per 100 g of edible portion)
 *   fndds-portions.csv   Food code, Portion code, Portion description, Portion weight (g)
 * Column names are matched case-insensitively and by substring, because USDA varies the exact headers
 * between releases. If a required column is missing the script names it and stops rather than guessing.
 *
 * Output (into dist/data/food/fndds/): manifest.json, recs-NNN.json, idx-XX.json, SHA256SUMS
 *
 *   node scripts/fndds-build.mjs --in ./fndds-csv --out ./dist/data/food/fndds --version "FNDDS 2021-2023"
 *
 * Nutrient codes follow the FNDDS/SR convention: 208 energy (kcal), 203 protein, 205 carbohydrate,
 * 204 total fat, 291 fiber, 269 total sugars, 606 saturated fat, 307 sodium, 306 potassium, 301 calcium,
 * 303 iron, 601 cholesterol. Anything else is ignored: this app only stores what it actually uses.
 */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';

const args=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,arr)=>(v.startsWith('--')?[...a,[v.slice(2),arr[i+1]]]:a),[]));
const IN=args.in||'./fndds-csv', OUT=args.out||'./dist/data/food/fndds', VERSION=args.version||'FNDDS 2021-2023';
const RECS_PER_SHARD=+(args.shard||2000);

const NUTRIENTS={208:'kcal',203:'protein',205:'carbs',204:'fat',291:'fiber',269:'sugars',606:'satfat',307:'sodium',306:'potassium',301:'calcium',303:'iron',601:'cholesterol'};
const ORDER=['kcal','protein','carbs','fat','fiber','sugars','satfat','sodium','potassium','calcium','iron','cholesterol'];

/* RFC-4180 CSV: quoted fields, doubled quotes, embedded newlines. USDA exports contain all three. */
function parseCSV(text){
  const rows=[];let row=[],field='',q=false;
  for(let i=0;i<text.length;i++){const c=text[i];
    if(q){ if(c==='"'){ if(text[i+1]==='"'){field+='"';i++;} else q=false; } else field+=c; }
    else if(c==='"')q=true;
    else if(c===','){row.push(field);field='';}
    else if(c==='\n'){row.push(field);field='';if(row.length>1||row[0]!=='')rows.push(row);row=[];}
    else if(c!=='\r')field+=c;
  }
  if(field||row.length){row.push(field);rows.push(row);}
  return rows;
}
function readTable(file,required){
  const p=path.join(IN,file);
  if(!fs.existsSync(p))throw new Error('missing input: '+p);
  const rows=parseCSV(fs.readFileSync(p,'utf8'));
  if(rows.length<2)throw new Error(file+' has no data rows');
  const header=rows[0].map(h=>h.trim().toLowerCase());
  const col={};
  for(const [key,patterns] of Object.entries(required)){
    const idx=header.findIndex(h=>patterns.some(pt=>h.includes(pt)));
    if(idx<0)throw new Error(file+': cannot find a column for "'+key+'" (looked for '+patterns.join(' / ')+'). Headers present: '+header.join(', '));
    col[key]=idx;
  }
  return {rows:rows.slice(1),col};
}
const num=v=>{const n=parseFloat(String(v).replace(/[, ]/g,''));return isFinite(n)?n:null;};

console.log('reading FNDDS CSVs from '+IN);
const foods=readTable('fndds-foods.csv',{code:['food code'],desc:['main food description','food description'],cat:['wweia','category description']});
const nuts=readTable('fndds-nutrients.csv',{code:['food code'],nut:['nutrient code'],val:['nutrient value']});
const ports=readTable('fndds-portions.csv',{code:['food code'],pcode:['portion code','subcode'],pdesc:['portion description'],weight:['portion weight']});

const byCode=new Map();const categories=[];const catIndex=new Map();
for(const r of foods.rows){
  const code=String(r[foods.col.code]).trim();if(!code)continue;
  const cat=String(r[foods.col.cat]||'').trim();
  if(!catIndex.has(cat)){catIndex.set(cat,categories.length);categories.push(cat);}
  byCode.set(code,{code:code,desc:String(r[foods.col.desc]||'').trim(),cat:catIndex.get(cat),per:{},portions:[]});
}
console.log('  '+byCode.size+' survey foods, '+categories.length+' WWEIA categories');

let nutHits=0;
for(const r of nuts.rows){
  const f=byCode.get(String(r[nuts.col.code]).trim());if(!f)continue;
  const key=NUTRIENTS[String(r[nuts.col.nut]).trim()];if(!key)continue;
  const v=num(r[nuts.col.val]);if(v==null)continue;
  f.per[key]=v;nutHits++;
}
console.log('  '+nutHits+' nutrient values mapped');

let portHits=0;
for(const r of ports.rows){
  const f=byCode.get(String(r[ports.col.code]).trim());if(!f)continue;
  const g=num(r[ports.col.weight]);if(g==null||g<=0)continue;
  f.portions.push([String(r[ports.col.pcode]||'').trim(),String(r[ports.col.pdesc]||'').trim(),Math.round(g*10)/10]);
  portHits++;
}
console.log('  '+portHits+' portion weights mapped');

/* Drop foods with no energy value: a food that cannot answer "how many calories" is noise in a search list. */
const list=[...byCode.values()].filter(f=>f.per.kcal!=null).sort((a,b)=>a.desc.localeCompare(b.desc));
console.log('  '+list.length+' foods carry an energy value and will be shipped');

const recs=list.map(f=>[f.code,f.desc,f.cat,...ORDER.map(k=>f.per[k]!=null?f.per[k]:null),f.portions.slice(0,12)]);

/* token index: same stemming rules as the app's foodTokens, so a search that works in the app works here */
const SYN={yoghurt:'yogurt',chikn:'chicken',brest:'breast',mince:'ground',oats:'oat',eggs:'egg'};
const stem=t=>{if(t.length<=3)return t;if(/(oes|ches|shes|sses|xes)$/.test(t))return t.slice(0,-2);if(/ies$/.test(t))return t.slice(0,-3)+'y';if(/[^s]s$/.test(t))return t.slice(0,-1);return t;};
const tokens=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9%]+/g,' ').split(' ').filter(t=>t.length>=2).map(t=>stem(SYN[t]||t));

const idx={};
recs.forEach((r,i)=>{for(const t of new Set(tokens(r[1]))){const pre=t.slice(0,2).replace(/[^a-z0-9]/g,'_');(idx[pre]=idx[pre]||{});(idx[pre][t]=idx[pre][t]||[]).push(i);}});

fs.mkdirSync(OUT,{recursive:true});
for(const f of fs.readdirSync(OUT))if(/^(recs-|idx-|manifest\.json|SHA256SUMS)/.test(f))fs.unlinkSync(path.join(OUT,f));

const files=[];
const write=(name,obj)=>{const body=JSON.stringify(obj);fs.writeFileSync(path.join(OUT,name),body);files.push({file:name,bytes:Buffer.byteLength(body)});};
for(let i=0;i*RECS_PER_SHARD<recs.length;i++)write('recs-'+String(i).padStart(3,'0')+'.json',recs.slice(i*RECS_PER_SHARD,(i+1)*RECS_PER_SHARD));
for(const pre of Object.keys(idx))write('idx-'+pre+'.json',idx[pre]);

const manifest={source:'USDA FNDDS (Food and Nutrient Database for Dietary Studies)',version:VERSION,license:'CC0 1.0 (public domain)',
  builtAt:new Date().toISOString(),foods:recs.length,categories:categories,recsPerShard:RECS_PER_SHARD,
  idxPrefixes:Object.keys(idx),fieldOrder:['foodCode','description','categoryIndex',...ORDER,'portions'],
  portionFieldOrder:['portionCode','description','gramWeight'],
  basis:'per 100 g of edible portion',
  note:'Survey foods describe how a dish is typically prepared nationally. They are not brand-specific and their portions are national averages.',
  files:files,totalBytes:files.reduce((a,f)=>a+f.bytes,0)};
const mBody=JSON.stringify(manifest);fs.writeFileSync(path.join(OUT,'manifest.json'),mBody);

const sums=[...files.map(f=>f.file),'manifest.json'].map(f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(OUT,f))).digest('hex')+'  '+f).join('\n')+'\n';
fs.writeFileSync(path.join(OUT,'SHA256SUMS'),sums);

console.log(JSON.stringify({out:OUT,foods:recs.length,shards:files.length,MB:+(manifest.totalBytes/1048576).toFixed(1)}));
