#!/usr/bin/env node
/* USDA nutrient-retention factors and food-yield factors → JSON for the offline adapter.
 *
 *   node scripts/reference-build.mjs --retention ./retention.csv --yields ./yields.csv --out ./dist/data/reference
 *
 * Neither table ships with this build, and neither is guessed. Both are lookup tables published by USDA:
 *
 *   Retention — USDA Table of Nutrient Retention Factors, Release 6 (2007). Each row is a 4-digit retention
 *   code with a cooking-method description and the percentage of each nutrient retained. Expected columns:
 *     Retention Code, Food Group, Cooking Method, then one column per nutrient (calcium, iron, magnesium,
 *     phosphorus, potassium, sodium, zinc, vitamin C, thiamin, riboflavin, niacin, B6, folate, B12, vitamin A).
 *
 *   Yields — USDA Agriculture Handbook 102, "Food Yields Summarized by Different Stages of Preparation".
 *   Expected columns: Item, Description before preparation, Description after preparation, Yield percent,
 *   Range. AH-102 ships as a scanned document with no text layer; OCR of its tables is not reliable enough
 *   to use for nutrition arithmetic, so this script takes a transcribed CSV rather than doing OCR itself.
 *   A wrong yield factor silently misstates every cooked-food entry, which is worse than having none.
 *
 * With no table installed, applyRetention() and applyYield() in the app return their input unchanged and
 * say that the factors are not installed. That is the intended fallback.
 */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';

const args=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,arr)=>(v.startsWith('--')?[...a,[v.slice(2),arr[i+1]]]:a),[]));
const OUT=args.out||'./dist/data/reference';
const num=v=>{const n=parseFloat(String(v).replace(/[, %]/g,''));return isFinite(n)?n:null;};
function parseCSV(text){const rows=[];let row=[],f='',q=false;
  for(let i=0;i<text.length;i++){const c=text[i];
    if(q){if(c==='"'){if(text[i+1]==='"'){f+='"';i++;}else q=false;}else f+=c;}
    else if(c==='"')q=true;else if(c===','){row.push(f);f='';}
    else if(c==='\n'){row.push(f);f='';if(row.length>1||row[0]!=='')rows.push(row);row=[];}
    else if(c!=='\r')f+=c;}
  if(f||row.length){row.push(f);rows.push(row);}return rows;}

/* app-side nutrient keys → the header text USDA uses for that nutrient */
const NUT_COLS={calcium:['calcium'],iron:['iron'],magnesium:['magnesium'],phosphorus:['phosphorus'],potassium:['potassium'],
  sodium:['sodium'],zinc:['zinc'],copper:['copper'],vitc:['vitamin c','ascorbic'],thiamin:['thiamin'],riboflavin:['riboflavin'],
  niacin:['niacin'],vitb6:['b6','pyridoxine'],folate:['folate','folacin'],vitb12:['b12'],vita:['vitamin a','retinol']};

fs.mkdirSync(OUT,{recursive:true});
const written=[];

if(args.retention){
  const rows=parseCSV(fs.readFileSync(args.retention,'utf8'));
  const header=rows[0].map(h=>h.trim().toLowerCase());
  const iCode=header.findIndex(h=>h.includes('retention code')||h==='code');
  const iDesc=header.findIndex(h=>h.includes('cooking method')||h.includes('description'));
  if(iCode<0||iDesc<0)throw new Error('retention CSV needs a retention-code column and a cooking-method column; headers: '+header.join(', '));
  const map={};
  for(const [key,pats] of Object.entries(NUT_COLS)){const i=header.findIndex(h=>pats.some(p=>h.includes(p)));if(i>=0)map[key]=i;}
  const codes={};let n=0;
  for(const r of rows.slice(1)){
    const code=String(r[iCode]||'').trim();if(!/^\d{3,4}$/.test(code))continue;
    const factors={};for(const [key,i] of Object.entries(map)){const v=num(r[i]);if(v!=null&&v>=0&&v<=200)factors[key]=v;}
    if(!Object.keys(factors).length)continue;
    codes[code]={description:String(r[iDesc]||'').trim(),factors:factors};n++;
  }
  const body=JSON.stringify({source:'USDA Table of Nutrient Retention Factors, Release 6 (2007)',version:args.retentionVersion||'Release 6',
    builtAt:new Date().toISOString(),unit:'percent of the nutrient retained through the stated cooking method',
    nutrients:Object.keys(map),codes:codes,count:n,
    note:'Retention factors describe nutrient loss in cooking. They do not describe weight change — that is the yield table.'});
  fs.writeFileSync(path.join(OUT,'retention.json'),body);written.push('retention.json');
  console.log('retention: '+n+' codes, '+Object.keys(map).length+' nutrients');
}

if(args.yields){
  const rows=parseCSV(fs.readFileSync(args.yields,'utf8'));
  const header=rows[0].map(h=>h.trim().toLowerCase());
  const iItem=header.findIndex(h=>h.includes('item'));
  const iFrom=header.findIndex(h=>h.includes('before'));
  const iTo=header.findIndex(h=>h.includes('after'));
  const iPct=header.findIndex(h=>h.includes('yield')||h.includes('percent')||h.includes('ave'));
  const iRange=header.findIndex(h=>h.includes('range'));
  if(iItem<0||iPct<0)throw new Error('yields CSV needs an item column and a yield-percent column; headers: '+header.join(', '));
  const items={};let n=0;
  for(const r of rows.slice(1)){
    const item=String(r[iItem]||'').trim();const pct=num(r[iPct]);
    if(!item||pct==null||pct<=0||pct>400)continue;
    items[item]={from:iFrom>=0?String(r[iFrom]||'').trim():'',to:iTo>=0?String(r[iTo]||'').trim():'',
      factor:Math.round(pct)/100,range:iRange>=0?String(r[iRange]||'').trim():''};n++;
  }
  const body=JSON.stringify({source:'USDA Agriculture Handbook 102, Food Yields Summarized by Different Stages of Preparation',
    version:args.yieldsVersion||'AH-102',builtAt:new Date().toISOString(),
    unit:'weight after preparation as a fraction of weight before',items:items,count:n,
    note:'Yields describe weight change in preparation (moisture loss, trimming, drained solids). Values above 1.0 are gains, as with soaked and boiled dry beans.'});
  fs.writeFileSync(path.join(OUT,'yields.json'),body);written.push('yields.json');
  console.log('yields: '+n+' items');
}

if(!written.length){
  console.log('nothing to build. Pass --retention <csv> and/or --yields <csv>.');
  console.log('Both tables are USDA publications; transcribe them to CSV first (AH-102 is a scan with no text layer,');
  console.log('and OCR of its columns is not accurate enough to use for nutrition arithmetic).');
  process.exit(0);
}
const sums=written.map(f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(OUT,f))).digest('hex')+'  '+f).join('\n')+'\n';
fs.writeFileSync(path.join(OUT,'SHA256SUMS'),sums);
console.log(JSON.stringify({out:OUT,files:written}));
