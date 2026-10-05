// Streams FoodData_Central_branded_food_json from stdin (unzip -p), one record per line.
// Reports counts and field coverage so the artifact format is designed from the real data.
import readline from 'node:readline';
const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
let n=0,bad=0,gtin=0,serving=0,energy=0,brandName=0,cat=0,disc=0,label=0,ingredients=0,household=0;
const years={},cats={},units={},dataSources={};
const start=Date.now();
for await (let line of rl){
  line=line.trim();
  if(!line||line==='{"BrandedFoods": ['||line===']}'||line===']'||line==='}')continue;
  if(line.endsWith(','))line=line.slice(0,-1);
  if(!line.startsWith('{'))continue;
  let r;try{r=JSON.parse(line);}catch(e){bad++;continue;}
  n++;
  if(r.gtinUpc)gtin++;
  if(r.servingSize!=null)serving++;
  if(r.brandName)brandName++;
  if(r.brandedFoodCategory){cat++;cats[r.brandedFoodCategory]=(cats[r.brandedFoodCategory]||0)+1;}
  if(r.discontinuedDate)disc++;
  if(r.labelNutrients)label++;
  if(r.ingredients)ingredients++;
  if(r.householdServingFullText)household++;
  units[r.servingSizeUnit||'']=(units[r.servingSizeUnit||'']||0)+1;
  dataSources[r.dataSource||'']=(dataSources[r.dataSource||'']||0)+1;
  const y=(r.modifiedDate||'').split('/').pop();years[y]=(years[y]||0)+1;
  const e=(r.foodNutrients||[]).find(x=>x&&x.nutrient&&x.nutrient.number==='208');
  if(e&&e.amount!=null)energy++;
  if(n%200000===0)process.stderr.write(`${n} records, ${((Date.now()-start)/1000)|0}s\n`);
}
const top=Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,25);
console.log(JSON.stringify({n,bad,gtin,serving,energy,brandName,cat,disc,label,ingredients,household,units,dataSources,years,topCats:top,seconds:((Date.now()-start)/1000)|0},null,1));
