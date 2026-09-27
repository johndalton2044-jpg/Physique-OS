#!/usr/bin/env node
/* NIH Dietary Supplement Label Database → sharded JSON for the offline adapter.
 *
 * Input: a DSLD bulk export directory containing either
 *   dsld-products.json   an array of label objects from the DSLD API/bulk download, or
 *   dsld-products.csv    the tabular export (DSLD ID, Product Name, Brand Name, Physical Form, Serving Size)
 *   dsld-ingredients.csv DSLD ID, Ingredient Name, Quantity, Unit, Percent Daily Value
 *
 * Output (into dist/data/supplements/): manifest.json, recs-NNN.json, idx-XX.json, SHA256SUMS
 *
 *   node scripts/dsld-build.mjs --in ./dsld-export --out ./dist/data/supplements
 *
 * What this data is: the manufacturer's declared label, transcribed. It is not an assay. Two products with
 * identical labels can differ in what is actually in the bottle; only third-party testing (USP, NSF,
 * Informed Sport) speaks to that. The app states this wherever a DSLD record is shown.
 */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';

const args=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,arr)=>(v.startsWith('--')?[...a,[v.slice(2),arr[i+1]]]:a),[]));
const IN=args.in||'./dsld-export', OUT=args.out||'./dist/data/supplements', VERSION=args.version||('DSLD export '+new Date().toISOString().slice(0,10));
const RECS_PER_SHARD=+(args.shard||1000);

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
function table(file,required){
  const p=path.join(IN,file);if(!fs.existsSync(p))return null;
  const rows=parseCSV(fs.readFileSync(p,'utf8'));if(rows.length<2)return null;
  const header=rows[0].map(h=>h.trim().toLowerCase());const col={};
  for(const [key,pats] of Object.entries(required)){
    const i=header.findIndex(h=>pats.some(pt=>h.includes(pt)));
    if(i<0)throw new Error(file+': no column for "'+key+'" (looked for '+pats.join(' / ')+'); headers: '+header.join(', '));
    col[key]=i;}
  return {rows:rows.slice(1),col};
}
const num=v=>{const n=parseFloat(String(v).replace(/[, ]/g,''));return isFinite(n)?n:null;};

let products=[];
const jsonPath=path.join(IN,'dsld-products.json');
if(fs.existsSync(jsonPath)){
  const raw=JSON.parse(fs.readFileSync(jsonPath,'utf8'));
  const arr=Array.isArray(raw)?raw:(raw.hits||raw.products||raw.data||[]);
  products=arr.map(p=>({
    id:String(p.dsldId||p.id||p.DSLD_ID||''),
    name:String(p.fullName||p.productName||p.name||'').trim(),
    brand:String(p.brandName||p.brand||'').trim(),
    form:String(p.physicalForm||p.form||'').trim(),
    serving:String(p.servingSize||p.netContents||'').trim(),
    ingredients:(p.ingredientRows||p.ingredients||[]).map(i=>[String(i.name||i.ingredientName||'').trim(),num(i.quantity!=null?i.quantity:(i.amount!=null?i.amount:null)),String(i.unit||i.uom||'').trim(),num(i.dvPercent!=null?i.dvPercent:i.percentDailyValue)])
  })).filter(p=>p.id&&p.name);
}else{
  const prod=table('dsld-products.csv',{id:['dsld id','id'],name:['product name','full name'],brand:['brand'],form:['physical form','form'],serving:['serving size','net contents']});
  if(!prod)throw new Error('no input found: expected '+jsonPath+' or '+path.join(IN,'dsld-products.csv'));
  const ing=table('dsld-ingredients.csv',{id:['dsld id','id'],name:['ingredient'],qty:['quantity','amount'],unit:['unit','uom'],dv:['daily value','dv']});
  const byId=new Map();
  for(const r of prod.rows){const id=String(r[prod.col.id]).trim();if(!id)continue;
    byId.set(id,{id:id,name:String(r[prod.col.name]||'').trim(),brand:String(r[prod.col.brand]||'').trim(),form:String(r[prod.col.form]||'').trim(),serving:String(r[prod.col.serving]||'').trim(),ingredients:[]});}
  if(ing)for(const r of ing.rows){const p=byId.get(String(r[ing.col.id]).trim());if(!p)continue;
    p.ingredients.push([String(r[ing.col.name]||'').trim(),num(r[ing.col.qty]),String(r[ing.col.unit]||'').trim(),num(r[ing.col.dv])]);}
  products=[...byId.values()].filter(p=>p.name);
}
console.log('  '+products.length+' supplement labels');

products.sort((a,b)=>a.name.localeCompare(b.name));
const recs=products.map(p=>[p.id,p.name,p.brand,p.form,p.serving,p.ingredients.slice(0,60)]);

const stem=t=>{if(t.length<=3)return t;if(/ies$/.test(t))return t.slice(0,-3)+'y';if(/[^s]s$/.test(t))return t.slice(0,-1);return t;};
const tokens=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9%]+/g,' ').split(' ').filter(t=>t.length>=2).map(stem);
const idx={};
recs.forEach((r,i)=>{for(const t of new Set(tokens(r[1]+' '+r[2]))){const pre=t.slice(0,2).replace(/[^a-z0-9]/g,'_');(idx[pre]=idx[pre]||{});(idx[pre][t]=idx[pre][t]||[]).push(i);}});

fs.mkdirSync(OUT,{recursive:true});
for(const f of fs.readdirSync(OUT))if(/^(recs-|idx-|manifest\.json|SHA256SUMS)/.test(f))fs.unlinkSync(path.join(OUT,f));
const files=[];
const write=(name,obj)=>{const body=JSON.stringify(obj);fs.writeFileSync(path.join(OUT,name),body);files.push({file:name,bytes:Buffer.byteLength(body)});};
for(let i=0;i*RECS_PER_SHARD<recs.length;i++)write('recs-'+String(i).padStart(3,'0')+'.json',recs.slice(i*RECS_PER_SHARD,(i+1)*RECS_PER_SHARD));
for(const pre of Object.keys(idx))write('idx-'+pre+'.json',idx[pre]);

const manifest={source:'NIH Office of Dietary Supplements — Dietary Supplement Label Database',version:VERSION,license:'public domain',
  builtAt:new Date().toISOString(),products:recs.length,recsPerShard:RECS_PER_SHARD,idxPrefixes:Object.keys(idx),
  fieldOrder:['dsldId','name','brand','physicalForm','servingSize','ingredients'],
  ingredientFieldOrder:['name','quantity','unit','percentDailyValue'],
  basis:'per labelled serving',
  note:'Label declarations as printed by the manufacturer. Not an assay of contents. Third-party certification (USP, NSF, Informed Sport) is what tests what is actually in the product.',
  files:files,totalBytes:files.reduce((a,f)=>a+f.bytes,0)};
fs.writeFileSync(path.join(OUT,'manifest.json'),JSON.stringify(manifest));
const sums=[...files.map(f=>f.file),'manifest.json'].map(f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(OUT,f))).digest('hex')+'  '+f).join('\n')+'\n';
fs.writeFileSync(path.join(OUT,'SHA256SUMS'),sums);
console.log(JSON.stringify({out:OUT,products:recs.length,shards:files.length,MB:+(manifest.totalBytes/1048576).toFixed(1)}));
