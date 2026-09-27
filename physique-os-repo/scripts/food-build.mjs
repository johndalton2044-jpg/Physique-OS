// PHYSIQUE OS — food database build pipeline
// Usage:
//   node scripts/food-build.mjs --foundation raw/FoodData_Central_foundation_food_json_2026-04-30.json \
//        --branded-zip /path/FoodData_Central_branded_food_json_2026-04-30.zip --out dist/data/food
// Raw USDA files are build inputs only; they are never committed or shipped.
// Output (versioned, checksummed, lazy-loadable, service-worker cacheable):
//   manifest.json                 sources, counts, shard geometry, checksums
//   foundation.json               363 Foundation foods with per-100 g nutrients + portions
//   branded/recs-NNN.json         positional compact records, RECS_PER_SHARD each, sorted by category/name
//   branded/idx-XX.json           inverted index for tokens starting with XX → delta-encoded postings
//   branded/gtin-NN.json          barcode index sharded by the last two GTIN digits → record index
//   ../../src/data-foundation.js  inline seed embedded in index.html so generic foods work with no data folder
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';

const args=Object.fromEntries(process.argv.slice(2).reduce((a,x,i,arr)=>{if(x.startsWith('--'))a.push([x.slice(2),arr[i+1]]);return a;},[]));
const FOUNDATION=args.foundation||'raw/FoodData_Central_foundation_food_json_2026-04-30.json';
const BRANDED_ZIP=args['branded-zip']||null;
const OUT=args.out||'dist/data/food';
const RELEASE=args.release||'2026-04-30';
const RECS_PER_SHARD=4000;
fs.mkdirSync(path.join(OUT,'branded'),{recursive:true});

/* ---- nutrient mapping: USDA nutrient number → canonical key (per 100 g) ---- */
const NUT={ '203':'protein','204':'fat','205':'carbs','291':'fiber','269.3':'sugars','269':'sugars','606':'satfat','605':'transfat','307':'sodium','601':'cholesterol','306':'potassium','301':'calcium','303':'iron','304':'magnesium','305':'phosphorus','309':'zinc','401':'vitc','328':'vitd','320':'vita','415':'vitb6','418':'vitb12','417':'folate','404':'thiamin','405':'riboflavin','406':'niacin','645':'mufa','646':'pufa','255':'water' };
const MACRO_KEYS=['kcal','protein','carbs','fat','fiber','sugars','satfat','sodium'];
function nutrientsOf(fn){
  const out={};let kcal=null,atwS=null,atwG=null,fiberAOAC=null;
  (fn||[]).forEach(n=>{ if(!n||!n.nutrient||n.amount==null)return; const num=String(n.nutrient.number); const v=+n.amount; if(!isFinite(v))return;
    if(num==='208'&&n.nutrient.unitName==='kcal')kcal=v; else if(num==='958')atwS=v; else if(num==='957')atwG=v; else if(num==='293')fiberAOAC=v; else if(NUT[num]&&out[NUT[num]]==null)out[NUT[num]]=v; });
  if(out.fiber==null&&fiberAOAC!=null)out.fiber=fiberAOAC; // AOAC 2011.25 total dietary fiber when the classic 291 assay is absent
  let energySource='label';
  if(kcal==null&&atwS!=null){kcal=atwS;energySource='atwater-specific';}
  if(kcal==null&&atwG!=null){kcal=atwG;energySource='atwater-general';}
  if(kcal==null&&(out.protein!=null||out.carbs!=null||out.fat!=null)){kcal=4*(out.protein||0)+4*(out.carbs||0)+9*(out.fat||0);energySource='macro-4/4/9';}
  if(kcal!=null)out.kcal=Math.round(kcal*10)/10;
  return {n:out,energySource};
}
function sha256(buf){return crypto.createHash('sha256').update(buf).digest('hex');}
function writeJSON(rel,obj){const p=path.join(OUT,rel);const s=JSON.stringify(obj);fs.writeFileSync(p,s);return {file:rel,bytes:Buffer.byteLength(s),sha256:sha256(s)};}
const files=[];

/* ---- Foundation ---- */
const fdRaw=JSON.parse(fs.readFileSync(FOUNDATION,'utf8'));
const fdList=(fdRaw.FoundationFoods||[]).filter(f=>f&&typeof f==='object'&&f.description);
const foundation=fdList.map(f=>{
  const {n,energySource}=nutrientsOf(f.foodNutrients);
  const portions=(f.foodPortions||[]).filter(p=>p&&p.gramWeight>0).map(p=>({label:[p.amount,(p.measureUnit&&p.measureUnit.name)||'',p.modifier||''].filter(x=>x!==''&&x!=null).join(' ').replace(/\s+/g,' ').trim()||(p.portionDescription||'portion'),g:Math.round(p.gramWeight*100)/100,racc:((p.measureUnit&&p.measureUnit.name)==='RACC')}));
  return {id:'fdc-'+f.fdcId,fdcId:f.fdcId,name:f.description,category:(f.foodCategory&&f.foodCategory.description)||'',source:'FDC_FOUNDATION',version:RELEASE,published:f.publicationDate||null,energySource,per100g:n,portions};
}).filter(f=>f.per100g.kcal!=null||f.per100g.protein!=null);
files.push(writeJSON('foundation.json',{source:'USDA FoodData Central — Foundation Foods',release:RELEASE,license:'CC0 1.0 (public domain)',count:foundation.length,foods:foundation}));
// inline seed for the app: compact, macros + key micros + portions
const seed=foundation.map(f=>{const n=f.per100g;const pick={};['kcal','protein','carbs','fat','fiber','sugars','satfat','sodium','potassium','calcium','iron','cholesterol'].forEach(k=>{if(n[k]!=null)pick[k]=Math.round(n[k]*100)/100;});return [f.fdcId,f.name,f.category,pick,f.portions.map(p=>[p.label,p.g,p.racc?1:0]),f.energySource];});
fs.mkdirSync('src',{recursive:true});
fs.writeFileSync('src/60-data-foundation.js','/* ============================================================================\n   REGION: DATA — USDA FoodData Central Foundation Foods (release '+RELEASE+', CC0). Generated by scripts/food-build.mjs.\n   Per-100 g values. Format: [fdcId, name, category, {nutrients}, [[portionLabel, grams, isRACC]...], energySource]\n   ============================================================================ */\nvar FOUNDATION_RELEASE=\''+RELEASE+'\';\nvar FOUNDATION_SEED='+JSON.stringify(seed)+';\n');

/* ---- Branded (streamed from the zip; never extracted) ---- */
async function buildBranded(){
  if(!BRANDED_ZIP){console.log('no --branded-zip given; skipping branded build');return null;}
  const child=spawn('unzip',['-p',BRANDED_ZIP],{stdio:['ignore','pipe','inherit']});
  const rl=readline.createInterface({input:child.stdout,crlfDelay:Infinity});
  const byGtin=new Map();let n=0,skipped=0,noEnergy=0;
  const parseDate=s=>{if(!s)return 0;const m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);return m?(+m[3])*10000+(+m[1])*100+(+m[2]):0;};
  for await (let line of rl){
    line=line.trim();if(!line.startsWith('{'))continue;if(line.endsWith(','))line=line.slice(0,-1);
    let r;try{r=JSON.parse(line);}catch(e){skipped++;continue;}
    n++;
    const {n:nu,energySource}=nutrientsOf(r.foodNutrients);
    if(nu.kcal==null){noEnergy++;}
    const unit=String(r.servingSizeUnit||'g').toUpperCase();
    const isMl=unit==='ML'||unit==='MLT';
    const gtin=String(r.gtinUpc||'').replace(/\D/g,'');
    const rec={
      fdcId:r.fdcId,name:String(r.description||'').trim(),owner:String(r.brandOwner||'').trim(),brand:String(r.brandName||'').trim(),gtin,
      cat:String(r.brandedFoodCategory||'').trim(),serving:r.servingSize!=null?+r.servingSize:null,servingUnit:isMl?'ml':'g',household:String(r.householdServingFullText||'').trim(),
      kcal:nu.kcal!=null?Math.round(nu.kcal):null,protein:rd(nu.protein),carbs:rd(nu.carbs),fat:rd(nu.fat),fiber:rd(nu.fiber),sugars:rd(nu.sugars),satfat:rd(nu.satfat),sodium:nu.sodium!=null?Math.round(nu.sodium):null,
      disc:r.discontinuedDate?1:0,modified:parseDate(r.modifiedDate),energySource,ingredients:String(r.ingredients||'').slice(0,400)
    };
    if(!rec.name)continue;
    const prev=byGtin.get(gtin||('nogtin-'+r.fdcId));
    if(prev){prev.versions=(prev.versions||1)+1;if(rec.modified>prev.modified){rec.versions=prev.versions;byGtin.set(gtin||('nogtin-'+r.fdcId),rec);}}
    else byGtin.set(gtin||('nogtin-'+r.fdcId),rec);
    if(n%100000===0)process.stderr.write('  branded '+n+'\n');
  }
  function rd(v){return v==null?null:Math.round(v*10)/10;}
  const recs=[...byGtin.values()];
  recs.sort((a,b)=>(a.cat||'~').localeCompare(b.cat||'~')||a.name.localeCompare(b.name));
  // positional record: [fdcId,name,owner,brand,gtin,cat,serving,servingUnit,household,kcal,protein,carbs,fat,fiber,sugars,satfat,sodium,disc,modifiedYear,versions,energySourceCode]
  const ES={label:0,'atwater-specific':1,'atwater-general':2,'macro-4/4/9':3};
  const cats=[...new Set(recs.map(r=>r.cat))].sort();const catIdx=new Map(cats.map((c,i)=>[c,i]));
  const shards=[];
  for(let i=0;i<recs.length;i+=RECS_PER_SHARD){
    const slice=recs.slice(i,i+RECS_PER_SHARD).map(r=>[r.fdcId,r.name,r.owner,r.brand,r.gtin,catIdx.get(r.cat),r.serving,r.servingUnit==='ml'?1:0,r.household,r.kcal,r.protein,r.carbs,r.fat,r.fiber,r.sugars,r.satfat,r.sodium,r.disc,Math.floor(r.modified/10000)||null,r.versions||1,ES[r.energySource]]);
    const name='branded/recs-'+String(i/RECS_PER_SHARD).padStart(3,'0')+'.json';
    files.push(writeJSON(name,slice));shards.push(name);
  }
  // inverted index: token → postings (record index), delta-encoded
  const STOP=new Set(['the','and','with','for','of','in','a','an','or','to','by','on','at','per','oz','g','lb','ct','pk','pack','count']);
  const tok=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9%]+/g,' ').split(' ').filter(t=>t.length>=2&&!STOP.has(t));
  const post=new Map();
  recs.forEach((r,i)=>{const seen=new Set();[...tok(r.name),...tok(r.brand),...tok(r.owner)].forEach(t=>{if(seen.has(t))return;seen.add(t);let a=post.get(t);if(!a){a=[];post.set(t,a);}a.push(i);});});
  const byPrefix=new Map();
  for(const [t,arr] of post){const pre=t.slice(0,2);if(!byPrefix.has(pre))byPrefix.set(pre,{});let last=0;const d=arr.map(i=>{const v=i-last;last=i;return v;});byPrefix.get(pre)[t]=d;}
  const idxShards=[];
  for(const [pre,obj] of byPrefix){const safe=pre.replace(/[^a-z0-9]/g,'_');const name='branded/idx-'+safe+'.json';files.push(writeJSON(name,obj));idxShards.push(pre);}
  // gtin index by last two digits
  const gt={};recs.forEach((r,i)=>{if(!r.gtin)return;const k=r.gtin.slice(-2).padStart(2,'0');(gt[k]=gt[k]||{})[r.gtin]=i;});
  const gtinShards=[];for(const k of Object.keys(gt).sort()){const name='branded/gtin-'+k+'.json';files.push(writeJSON(name,gt[k]));gtinShards.push(k);}
  return {records:recs.length,rawRecords:n,skipped,noEnergy,dedupedVersions:n-recs.length,recsPerShard:RECS_PER_SHARD,recShards:shards.length,idxPrefixes:idxShards.sort(),gtinShards,categories:cats,fieldOrder:['fdcId','name','brandOwner','brandName','gtin','categoryIndex','servingSize','servingIsMl','householdServing','kcal','protein','carbs','fat','fiber','sugars','satfat','sodium','discontinued','modifiedYear','versions','energySourceCode'],energySourceCodes:['label','atwater-specific','atwater-general','macro-4/4/9']};
}
const branded=await buildBranded();
const manifest={
  app:'Physique OS food database',databaseVersion:'fdc-'+RELEASE,generatedAt:new Date().toISOString(),
  sources:[
    {id:'FDC_FOUNDATION',name:'USDA FoodData Central — Foundation Foods',organization:'USDA Agricultural Research Service',license:'CC0 1.0',release:RELEASE,url:'https://fdc.nal.usda.gov/download-datasets',count:foundation.length,authority:'analytical; generic minimally processed foods'},
    branded?{id:'FDC_BRANDED',name:'USDA FoodData Central — Branded Foods',organization:'USDA / GS1 / Label Insight partnership',license:'CC0 1.0',release:RELEASE,url:'https://fdc.nal.usda.gov/download-datasets',count:branded.records,authority:'manufacturer label data; monthly API updates, six-monthly snapshots'}:null
  ].filter(Boolean),
  foundation:{count:foundation.length,file:'foundation.json'},
  branded:branded||null,
  files:files.map(f=>({file:f.file,bytes:f.bytes,sha256:f.sha256})),
  totalBytes:files.reduce((s,f)=>s+f.bytes,0)
};
fs.writeFileSync(path.join(OUT,'manifest.json'),JSON.stringify(manifest,null,1));
fs.writeFileSync(path.join(OUT,'SHA256SUMS'),files.map(f=>f.sha256+'  '+f.file).join('\n')+'\n');
console.log(JSON.stringify({foundation:foundation.length,branded:branded&&{records:branded.records,raw:branded.rawRecords,noEnergy:branded.noEnergy,recShards:branded.recShards,idxPrefixes:branded.idxPrefixes.length,gtinShards:branded.gtinShards.length},totalMB:Math.round(manifest.totalBytes/1048576*10)/10,files:files.length},null,1));
