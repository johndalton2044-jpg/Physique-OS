/* ============================================================================
   REGION: FOOD INTELLIGENCE — USDA FDC as the backbone (Foundation inline; Branded lazy-loaded shards).
   Source provenance and food version travel with every logged item. Historical logs keep the nutrient
   snapshot they were logged with; a database update never rewrites them.

   NUTRIENT BASIS (schema 2). Every food declares the reference quantity its nutrients are stated per:
     basis 'g'       per100 = nutrients per 100 g of edible portion   (Foundation, gram-labelled branded, user foods)
     basis 'ml'      per100 = nutrients per 100 mL                    (branded products whose USDA serving unit is mL)
     basis 'serving' perServing = nutrients per one serving           (recipes with volume ingredients and no mass)
   USDA Branded `foodNutrients` amounts are per 100 g, or per 100 mL when servingSizeUnit is mL. Grams are
   NEVER fabricated from millilitres: a mL-basis food is logged in mL or servings; a mass is only attached
   when a density is known. Every logged quantity records its basis.
   ============================================================================ */
var FOOD_DATA_BASE='./data/food/';
var _foodCache={},_foodCacheOrder=[];var _foodManifest=null,_foodManifestState='not loaded';
/* LRU budget for parsed shards held in memory (the service worker caches files on disk independently). */
var FOOD_CACHE_LIMITS={recs:10,idx:24,gtin:6,other:64};
function _foodCacheClass(rel){return /branded\/recs-/.test(rel)?'recs':(/branded\/idx-/.test(rel)?'idx':(/branded\/gtin-/.test(rel)?'gtin':'other'));}
function _foodCacheStore(rel,val){
  var cls=_foodCacheClass(rel);_foodCache[rel]=val;var i=_foodCacheOrder.indexOf(rel);if(i>=0)_foodCacheOrder.splice(i,1);_foodCacheOrder.push(rel);
  var limit=FOOD_CACHE_LIMITS[cls];var same=_foodCacheOrder.filter(function(k){return _foodCacheClass(k)===cls;});
  while(same.length>limit){var victim=same.shift();delete _foodCache[victim];_foodCacheOrder.splice(_foodCacheOrder.indexOf(victim),1);}
}
function foodCacheStats(){var by={};_foodCacheOrder.forEach(function(k){var c=_foodCacheClass(k);by[c]=(by[c]||0)+1;});return {entries:_foodCacheOrder.length,byClass:by,limits:FOOD_CACHE_LIMITS};}
var FOOD_SOURCES=[
  {id:'FDC_FOUNDATION',name:'USDA FoodData Central \u2014 Foundation Foods',org:'USDA ARS',license:'CC0 1.0 (public domain)',version:FOUNDATION_RELEASE,shipped:'inline',rank:3},
  {id:'FDC_BRANDED',name:'USDA FoodData Central \u2014 Branded Foods',org:'USDA / GS1 / Label Insight',license:'CC0 1.0 (public domain)',version:FOUNDATION_RELEASE,shipped:'lazy shards under ./data/food/branded/',rank:2},
  {id:'USER',name:'User-entered foods and recipes',org:'this record',license:'\u2014',version:'\u2014',shipped:'local',rank:8},
  {id:'NIH_DSLD',name:'NIH Dietary Supplement Label Database',org:'NIH ODS',license:'CC0',version:'adapter installed \u00b7 data not present',shipped:'lazy shards under ./data/supplements/ (scripts/dsld-build.mjs)',rank:5,adapter:true},
  {id:'FDC_FNDDS',name:'USDA FNDDS 2021\u20132023 (survey foods and portions)',org:'USDA ARS',license:'CC0',version:'adapter installed \u00b7 data not present',shipped:'lazy shards under ./data/food/fndds/ (scripts/fndds-build.mjs)',rank:4,adapter:true}
];
function seedFoods(){return memo('seedFoods',function(){return FOUNDATION_SEED.map(function(r){var per=r[3];return {kind:'seed',id:'fdc-'+r[0],fdcId:r[0],name:r[1],category:r[2],basis:'g',per100:per,per100g:per,portions:r[4].map(function(p){return {label:p[0],g:p[1],racc:!!p[2]};}),source:'FDC_FOUNDATION',version:FOUNDATION_RELEASE,energySource:r[5],conversionConfidence:'exact'};});});}
var FOOD_SYNONYMS={yoghurt:'yogurt',chikn:'chicken',brest:'breast',mince:'ground',capsicum:'pepper',courgette:'zucchini',aubergine:'eggplant',prawn:'shrimp',rockmelon:'cantaloupe',oats:'oat',eggs:'egg'};
function _stem(t){if(t.length<=3)return t;if(/(oes|ches|shes|sses|xes)$/.test(t))return t.slice(0,-2);if(/ies$/.test(t))return t.slice(0,-3)+'y';if(/[^s]s$/.test(t))return t.slice(0,-1);return t;}
function foodTokens(s){return String(s||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9%]+/g,' ').split(' ').filter(function(t){return t.length>=2;}).map(function(t){return _stem(FOOD_SYNONYMS[t]||t);});}
/* normalizeFood: any food-shaped object (seed, branded, user, recipe, snapshot from an older schema) → basis-complete */
function normalizeFood(f){
  if(!f||typeof f!=='object')return f;
  if(!f.basis){f.basis=f.per100ml?'ml':(f.perServing&&!f.per100g&&!f.per100?'serving':'g');}
  if(!f.per100&&f.basis!=='serving')f.per100=f.per100g||f.per100ml||{};
  if(f.basis==='g'&&!f.per100g)f.per100g=f.per100;if(f.basis==='ml'&&!f.per100ml)f.per100ml=f.per100;
  if(!f.portions)f.portions=[];
  if(!f.conversionConfidence)f.conversionConfidence=f.basis==='g'?'exact':(f.basis==='ml'?'volume-only':'serving-only');
  return f;
}
function localFoods(){var date=_ASOF;return seedFoods().concat((DB.foods||[]).filter(function(f){return !date||!f.createdAt||f.createdAt.slice(0,10)<=date;}).map(function(f){return normalizeFood(Object.assign({kind:'user',source:'USER'},f));}),(DB.recipes||[]).filter(function(r){return !date||!r.createdAt||r.createdAt.slice(0,10)<=date;}).map(function(r){return recipeAsFood(r);}));}
function foodSearchLocal(q,limit){
  var toks=foodTokens(q);if(!toks.length)return [];
  var res=[];localFoods().forEach(function(f){var name=f.name.toLowerCase();var nt=foodTokens(f.name+' '+(f.category||''));var head=foodTokens(f.name.split(',')[0]);var score=0;toks.forEach(function(t){if(head.indexOf(t)>=0)score+=5;else if(nt.indexOf(t)>=0)score+=3;else if(nt.some(function(x){return x.indexOf(t)===0;}))score+=2;else if(name.indexOf(t)>=0)score+=1;else score-=4;});if(score>0)res.push({f:f,score:score+(f.kind==='user'||f.kind==='recipe'?1:0)-name.length/200-(/,\s*(dried|dry|flour|powder)/i.test(f.name)?1.5:0)});});
  res.sort(function(a,b){return b.score-a.score;});return res.slice(0,limit||30).map(function(x){return x.f;});
}
function loadFoodJSON(rel,opts){
  opts=opts||{};
  if(_foodCache[rel]){var i=_foodCacheOrder.indexOf(rel);if(i>=0){_foodCacheOrder.splice(i,1);_foodCacheOrder.push(rel);}return _foodCache[rel];}
  if(typeof fetch!=='function'){var e=new Error('food database not reachable in this environment');e.availability=true;return Promise.reject(e);}
  /* The manifest is revalidated every time; any 404 is retried once past the browser's cache. A 404 served before the
     database was deployed had been cached as immutable for a year, so the files were there and still "missing". */
  var get=function(mode){return fetch(FOOD_DATA_BASE+rel,{cache:mode});};
  var p=get(rel==='manifest.json'?'no-cache':'default').then(function(r){return r.status===404?get('reload'):r;}).then(function(r){if(!r.ok){var e=new Error('HTTP '+r.status+' for '+rel);e.availability=true;throw e;}return r.json();}).catch(function(e){if(e&&!e.availability&&/fetch|network|Failed/i.test(String(e.message)))e.availability=true;throw e;});
  if(opts.retain===false)return p; // prefetch: warm the service-worker cache, keep nothing in RAM
  _foodCacheStore(rel,p);p.catch(function(){delete _foodCache[rel];var j=_foodCacheOrder.indexOf(rel);if(j>=0)_foodCacheOrder.splice(j,1);});return p;
}
/* A deployment without the bundled database gets one clear state, not a 404 on every lookup. */
var _FOOD_DB_MISSING=false;
function loadFoodManifest(){if(_foodManifest)return Promise.resolve(_foodManifest);if(_FOOD_DB_MISSING)return Promise.reject(new Error('the bundled food database is not part of this deployment'));_foodManifestState='loading';return loadFoodJSON('manifest.json').catch(function(e){if(/404/.test(String(e&&e.message))){_FOOD_DB_MISSING=true;_foodManifestState='missing: the bundled food database is not part of this deployment (search uses your own foods and Open Food Facts)';}throw e;}).then(function(m){_foodManifest=m;_foodManifestState='loaded';try{detectFoodDatabaseChange(m);}catch(e){_q(e);}return m;}).catch(function(e){_foodManifestState='unavailable: '+(e&&e.message||e);throw e;});}
function detectFoodDatabaseChange(m){ // protocol-change detection: a new food database version is a discontinuity for intake comparisons
  var v=m&&m.databaseVersion;if(!v||!DB||!DB.settings)return;var prev=DB.settings.foodDatabaseVersion;
  if(prev&&prev!==v){try{addObservation({type:'context',date:todayISO(),value:'new food database ('+v+', was '+prev+')',source:'system'},{silent:true,noSave:true});}catch(e){_q(e);}}
  if(prev!==v){DB.settings.foodDatabaseVersion=v;save('food-db-version');}
}
function _decodePostings(d){var out=[],acc=0;for(var i=0;i<d.length;i++){acc+=d[i];out.push(acc);}return out;}
function brandedRecord(idx,manifest){var per=manifest.branded.recsPerShard;var shard=Math.floor(idx/per);return loadFoodJSON('branded/recs-'+String(shard).padStart(3,'0')+'.json').then(function(arr){var r=arr[idx-shard*per];return r?brandedToFood(r,manifest,idx):null;});}
function _scaleNutrients(per,f){var out={};Object.keys(per||{}).forEach(function(k){out[k]=per[k]==null?null:round(per[k]*f,2);});return out;}
/* Positional record → food. USDA Branded nutrients are per 100 g, or per 100 mL when the serving unit is mL.
   fieldOrder: fdcId,name,brandOwner,brandName,gtin,categoryIndex,servingSize,servingIsMl,householdServing,kcal,protein,carbs,fat,fiber,sugars,satfat,sodium,discontinued,modifiedYear,versions,energySourceCode */
function brandedToFood(r,manifest,idx){
  var cat=(manifest&&manifest.branded&&manifest.branded.categories[r[5]])||'';var per={kcal:r[9],protein:r[10],carbs:r[11],fat:r[12],fiber:r[13],sugars:r[14],satfat:r[15],sodium:r[16]};
  var isMl=!!r[7];var serving=num(r[6]);if(serving!=null&&serving<=0)serving=null;var unit=isMl?'ml':'g';
  var portions=[];if(serving){var p={label:'1 serving ('+(r[8]||(fmtNum(serving,serving%1?1:0)+' '+unit))+')',serving:true};if(isMl)p.ml=serving;else p.g=serving;portions.push(p);}
  var f={kind:'branded',id:'fdc-'+r[0],fdcId:r[0],idx:idx,name:titleCase(r[1]),brand:r[3]||'',owner:r[2]||'',gtin:r[4],category:cat,
    basis:isMl?'ml':'g',per100:per,servingSize:serving,servingUnit:unit,servingGrams:!isMl&&serving?serving:null,servingMl:isMl&&serving?serving:null,householdServing:r[8]||'',
    perServing:serving?_scaleNutrients(per,serving/100):null,density:null,conversionConfidence:isMl?'volume-only':'exact',
    portions:portions,household:r[8],discontinued:!!r[17],modifiedYear:r[18],versions:r[19],energySource:(manifest&&manifest.branded&&manifest.branded.energySourceCodes[r[20]])||'label',source:'FDC_BRANDED',version:manifest?manifest.databaseVersion:null};
  if(isMl)f.per100ml=per;else f.per100g=per;
  return f;
}
function titleCase(s){return String(s||'').toLowerCase().replace(/(^|\s|[("'-])([a-z])/g,function(m,p,c){return p+c.toUpperCase();});}
function foodSearchBranded(q,limit){
  limit=limit||40;var toks=foodTokens(q);if(!toks.length)return Promise.resolve([]);
  return loadFoodManifest().then(function(m){
    var prefixes=m.branded.idxPrefixes;
    return Promise.all(toks.map(function(t){var pre=t.slice(0,2);if(prefixes.indexOf(pre)<0)return {tok:t,hits:{}};return loadFoodJSON('branded/idx-'+pre.replace(/[^a-z0-9]/g,'_')+'.json').then(function(idx){var hits={};var exact=idx[t];if(exact)_decodePostings(exact).forEach(function(i){hits[i]=3;});var n=0;Object.keys(idx).forEach(function(k){if(k===t||k.indexOf(t)!==0)return;if(n++>400)return;_decodePostings(idx[k]).forEach(function(i){if(!hits[i])hits[i]=1;});});return {tok:t,hits:hits};}).catch(function(e){if(!e||!e.availability)_q(e);return {tok:t,hits:{}};});}))
    .then(function(per){
      var scores={};per[0]&&Object.keys(per[0].hits).forEach(function(i){var ok=true,s=0;per.forEach(function(p){if(!p.hits[i])ok=false;else s+=p.hits[i];});if(ok)scores[i]=s;});
      var ids=Object.keys(scores).map(Number);if(!ids.length)return [];
      ids.sort(function(a,b){return scores[b]-scores[a]||a-b;});
      var top=ids.slice(0,Math.min(limit*3,300));
      return Promise.all(top.map(function(i){return brandedRecord(i,m);})).then(function(foods){
        foods=foods.filter(Boolean).map(function(f){var nt=foodTokens(f.name+' '+f.brand);var s=scores[f.idx]||0;toks.forEach(function(t){if(nt.indexOf(t)>=0)s+=2;});if(f.discontinued)s-=3;if(f.per100.kcal==null)s-=2;if(!f.servingSize)s-=0.5;s+=(f.modifiedYear||2017)>=2023?1:0;s-=f.name.length/120;f._score=s;return f;});
        foods.sort(function(a,b){return b._score-a._score;});return foods.slice(0,limit);
      });
    });
  });
}
function lookupGtin(code){
  var c=String(code||'').replace(/\D/g,'');if(!c)return Promise.resolve(null);
  return loadFoodManifest().then(function(m){var key=c.slice(-2).padStart(2,'0');return loadFoodJSON('branded/gtin-'+key+'.json').then(function(g){var idx=g[c];if(idx==null){var padded=c.padStart(14,'0');idx=g[padded];if(idx==null){var k2=Object.keys(g).filter(function(k){return k.replace(/^0+/,'')===c.replace(/^0+/,'');})[0];idx=k2!=null?g[k2]:null;}}return idx==null?null:brandedRecord(idx,m);});});
}
function prefetchFoodDB(onProgress){
  return loadFoodManifest().then(function(m){var files=m.files.map(function(f){return f.file;});var done=0;var chain=Promise.resolve();files.forEach(function(rel){chain=chain.then(function(){return loadFoodJSON(rel,{retain:false}).catch(_q).then(function(){done++;if(onProgress)onProgress(done,files.length);});});});return chain.then(function(){return {done:done,total:files.length,bytes:m.totalBytes};});});
}
/* ---- portions: every portion resolves to a quantity in the food's own basis before any nutrient math ---- */
var UNIT_G={g:1,gram:1,grams:1,oz:28.3495,ounce:28.3495,ounces:28.3495,lb:453.592,pound:453.592,pounds:453.592,kg:1000};
var UNIT_ML={ml:1,l:1000,cup:240,cups:240,tbsp:15,tablespoon:15,tsp:5,teaspoon:5,floz:29.5735};
function portionResolve(food,amount,unit){
  food=normalizeFood(food);amount=num(amount);if(amount==null||amount<0)return null;
  var out=function(qty,label,approx){var r={qty:qty,basis:food.basis,grams:food.basis==='g'?qty:null,ml:food.basis==='ml'?qty:null,servings:food.basis==='serving'?qty:null,label:label,approx:!!approx,confidence:approx?'approximate':food.conversionConfidence};
    if(food.basis==='ml'&&food.density)r.grams=round(qty*food.density,1);if(food.basis==='g'&&food.density)r.ml=round(qty/food.density,1);return r;};
  var fromPortion=function(p,mult){if(!p)return null;var lab=(mult===1?'':fmtNum(mult,mult%1?2:0)+' \u00d7 ')+p.label;if(food.basis==='serving')return out(mult*(p.servings!=null?p.servings:1),lab);if(food.basis==='ml'){if(p.ml!=null)return out(mult*p.ml,lab);if(p.g!=null&&food.density)return out(mult*p.g/food.density,lab);return null;}if(p.g!=null)return out(mult*p.g,lab);if(p.ml!=null&&food.density)return out(mult*p.ml*food.density,lab);if(p.ml!=null)return out(mult*p.ml,lab+' (volume taken as mass)',true);return null;};
  if(unit==='serving'){var s=(food.portions||[]).filter(function(p){return p.serving||p.racc;})[0]||(food.portions||[])[0];if(!s&&food.basis==='serving')s={label:'1 serving',servings:1};if(!s&&food.perServing&&food.servingGrams)s={label:'1 serving',g:food.servingGrams,serving:true};if(!s&&food.perServing&&food.servingMl)s={label:'1 serving',ml:food.servingMl,serving:true};return fromPortion(s,amount);}
  if(unit&&unit.indexOf('portion:')===0){var lab2=unit.slice(8);var p=(food.portions||[]).filter(function(x){return x.label===lab2;})[0];return fromPortion(p,amount);}
  if(food.basis==='serving')return null; // serving-basis foods only resolve through servings/portions
  if(UNIT_G[unit]!=null){var g=amount*UNIT_G[unit];if(food.basis==='g')return out(g,fmtNum(g,0)+' g');if(food.density)return out(g/food.density,fmtNum(g,0)+' g');return null;} // mass for a mL-basis food needs a density; never invented
  if(UNIT_ML[unit]!=null){var ml=amount*UNIT_ML[unit];if(food.basis==='ml')return out(ml,fmtNum(ml,0)+' mL');if(food.density)return out(ml*food.density,fmtNum(ml,0)+' mL');return out(ml,fmtNum(ml,0)+' mL taken as g (density unknown)',true);}
  return null;
}
/* legacy helper kept for gram-basis callers: returns grams or null; never invents grams for a mL-basis food */
function portionGrams(food,amount,unit){var r=portionResolve(food,amount,unit);return r&&r.grams!=null?r.grams:null;}
function portionOptions(food){
  food=normalizeFood(food);var opts=[];
  (food.portions||[]).forEach(function(p){var q=p.g!=null?fmtNum(p.g,0)+' g':(p.ml!=null?fmtNum(p.ml,0)+' mL':(p.servings!=null?p.servings+' serving':''));opts.push({value:'portion:'+p.label,label:p.label+(q&&p.label.indexOf(q)<0?' ('+q+')':''),approx:false});});
  if(food.basis==='serving'){if(!opts.length)opts.push({value:'serving',label:'serving'});return opts;}
  if(food.basis==='ml'){opts.push({value:'ml',label:'millilitres'},{value:'floz',label:'fl oz'},{value:'cup',label:'cup (240 mL)'},{value:'tbsp',label:'tbsp (15 mL)'},{value:'tsp',label:'tsp (5 mL)'});if(food.density)opts.push({value:'g',label:'grams (via density '+food.density+' g/mL)'});return opts;}
  opts.push({value:'g',label:'grams'},{value:'oz',label:'ounces'});
  if(!(food.portions||[]).some(function(p){return /cup/i.test(p.label);}))opts.push({value:'cup',label:'cup (\u2248240 g, approximate)',approx:true});
  opts.push({value:'tbsp',label:'tbsp (\u224815 g, approximate)',approx:true},{value:'tsp',label:'tsp (\u22485 g, approximate)',approx:true});
  return opts;
}
var NUTRIENT_KEYS=['kcal','protein','carbs','fat','fiber','sugars','satfat','sodium'];
var MICRO_KEYS=['potassium','calcium','iron','cholesterol','magnesium','phosphorus','zinc','vitc','vitd','vita','vitb6','vitb12','folate','thiamin','riboflavin','niacin'];
function foodBasisLabel(food){food=normalizeFood(food);return food.basis==='serving'?'serving':(food.basis==='ml'?'100 mL':'100 g');}
/* nutrientsFor(food, qty): qty is in the food's basis units (g, mL, or servings). Includes micronutrients when the source carries them. */
function nutrientsFor(food,qty){
  food=normalizeFood(food);var out={};qty=num(qty);if(qty==null)qty=0;
  var src=food.basis==='serving'?(food.perServing||{}):(food.per100||{});var f=food.basis==='serving'?qty:qty/100;
  NUTRIENT_KEYS.forEach(function(k){var v=src[k];out[k]=v==null?null:round(v*f,2);});
  MICRO_KEYS.forEach(function(k){var v=src[k];if(v!=null)out[k]=round(v*f,2);});
  return out;
}
function macroConsistency(food){food=normalizeFood(food);var p=food.per100||food.perServing||{};if(p.kcal==null||p.protein==null||p.carbs==null||p.fat==null)return null;var calc=4*p.protein+4*p.carbs+9*p.fat;var diff=calc-p.kcal;return {calc:calc,label:p.kcal,diff:diff,pct:p.kcal?Math.round(100*diff/p.kcal):null,note:Math.abs(diff)>Math.max(25,p.kcal*0.15)?'label energy and 4/4/9 macro energy differ by '+fmtSigned(diff,0)+' kcal per '+foodBasisLabel(food)+' (rounding, fiber or sugar alcohols); the label stays authoritative':null};}
/* ---- recipes: ingredients carry a quantity in their own basis; mass totals only when every ingredient has one ---- */
function _ingQty(i){if(i.quantity!=null&&i.basis)return {qty:num(i.quantity)||0,basis:i.basis};return {qty:num(i.grams)||0,basis:'g'};}
function recipeTotals(r){
  var tot={};NUTRIENT_KEYS.forEach(function(k){tot[k]=0;});var g=0,massKnown=true,mlTotal=0;
  (r.ingredients||[]).forEach(function(i){var q=_ingQty(i);var f=normalizeFood(i.food);var n=nutrientsFor(f,q.qty);NUTRIENT_KEYS.forEach(function(k){if(n[k]!=null)tot[k]+=n[k];});
    if(q.basis==='g')g+=q.qty;else if(q.basis==='ml'&&f.density)g+=q.qty*f.density;else{massKnown=false;if(q.basis==='ml')mlTotal+=q.qty;}});
  var per={};var s=Math.max(1,num(r.servings)||1);NUTRIENT_KEYS.forEach(function(k){per[k]=round(tot[k]/s,1);});
  return {totals:tot,perServing:per,gramsTotal:massKnown?g:null,gramsPerServing:massKnown?g/s:null,massKnown:massKnown,mlUnmassed:mlTotal,servings:s};
}
function recipeAsFood(r){var t=recipeTotals(r);var per100={};if(t.massKnown&&t.gramsTotal){NUTRIENT_KEYS.forEach(function(k){per100[k]=round(t.totals[k]/t.gramsTotal*100,2);});return {kind:'recipe',id:r.id,name:r.name,category:'Recipe',basis:'g',per100:per100,per100g:per100,perServing:t.perServing,servingGrams:round(t.gramsPerServing,1),portions:[{label:'1 serving',g:round(t.gramsPerServing,1),serving:true}],source:'USER',version:r.updatedAt||r.createdAt,recipe:r,conversionConfidence:'exact'};}
  return {kind:'recipe',id:r.id,name:r.name,category:'Recipe',basis:'serving',perServing:t.perServing,portions:[{label:'1 serving',servings:1,serving:true}],source:'USER',version:r.updatedAt||r.createdAt,recipe:r,conversionConfidence:'serving-only',note:'contains volume ingredients without a density; per-serving nutrients only'};}
function saveRecipe(r){pushUndo('save recipe');if(!r.id){r.id=uid('rcp');r.createdAt=nowISO();DB.recipes.push(r);}else{r.updatedAt=nowISO();var i=DB.recipes.findIndex(function(x){return x.id===r.id;});if(i>=0)DB.recipes[i]=r;else DB.recipes.push(r);}emitEvent('recipe.saved',r);save('recipe');_memoInvalidate();return r;}
function saveUserFood(f){normalizeFood(f);pushUndo('save food');if(!f.id){f.id=uid('food');f.createdAt=nowISO();DB.foods.push(f);}else{f.updatedAt=nowISO();var i=DB.foods.findIndex(function(x){return x.id===f.id;});if(i>=0)DB.foods[i]=f;else DB.foods.push(f);}emitEvent('userFood.saved',f);save('food');_memoInvalidate();return f;}
/* ---- meals + food logs ---- */
var MEALS=['breakfast','lunch','dinner','snacks'];
function foodSnapshot(f){f=normalizeFood(f);var snap={kind:f.kind,id:f.id,fdcId:f.fdcId||null,name:f.name,brand:f.brand||'',source:f.source,version:f.version,category:f.category||'',basis:f.basis,per100:JSON.parse(JSON.stringify(f.per100||{})),perServing:f.perServing?JSON.parse(JSON.stringify(f.perServing)):null,servingGrams:f.servingGrams||null,servingMl:f.servingMl||null,density:f.density||null,conversionConfidence:f.conversionConfidence,energySource:f.energySource||null};
  if(f.basis==='g')snap.per100g=snap.per100;if(f.basis==='ml')snap.per100ml=snap.per100;return snap;}
function _qtyLabel(qty,basis){return basis==='serving'?(fmtNum(qty,qty%1?2:0)+' serving'+(qty===1?'':'s')):(fmtNum(qty,qty%1?1:0)+(basis==='ml'?' mL':' g'));}
/* logFood({food, grams}) (gram-basis only), logFood({food, quantity, basis}) or logFood({food, amount, unit}) */
function logFood(o){
  var food=normalizeFood(o.food);var res=null;
  if(o.amount!=null&&o.unit)res=portionResolve(food,o.amount,o.unit);
  else if(o.quantity!=null){var basis=o.basis||food.basis;if(basis!==food.basis)throw new Error('quantity basis '+basis+' does not match the food basis '+food.basis);res={qty:num(o.quantity),basis:basis,grams:basis==='g'?num(o.quantity):null,ml:basis==='ml'?num(o.quantity):null,servings:basis==='serving'?num(o.quantity):null,label:_qtyLabel(num(o.quantity),basis)};}
  else if(o.grams!=null){if(food.basis!=='g')throw new Error('grams cannot be logged for a '+food.basis+'-basis food without a density');res={qty:num(o.grams),basis:'g',grams:num(o.grams),ml:null,servings:null,label:fmtNum(num(o.grams),0)+' g'};}
  if(!res||!res.qty||res.qty<=0)throw new Error('portion resolves to zero '+(food.basis==='serving'?'servings':food.basis));
  var rec={id:uid('fl'),date:o.date||todayISO(),meal:MEALS.indexOf(o.meal)>=0?o.meal:'snacks',food:foodSnapshot(food),quantity:round(res.qty,2),basis:res.basis,grams:res.grams!=null?round(res.grams,1):null,ml:res.ml!=null?round(res.ml,1):null,servings:res.servings!=null?round(res.servings,3):null,portionLabel:o.portionLabel||res.label,approx:!!res.approx,nutrients:nutrientsFor(food,res.qty),createdAt:nowISO(),source:o.source||'manual'};
  if(!o.silent)pushUndo('log food');
  DB.foodLogs.push(rec);emitEvent('food.logged',rec,{at:rec.createdAt});syncNutritionObservations(rec.date);if(!o.noSave)save('food-log');return rec;
}
/* Food logs are a temporal ledger, not a mutable table. A deletion is recorded as a retraction with the date
   it happened; an edit supersedes the old entry with a new one rather than overwriting it. Without this a
   replay of last Tuesday would show today's corrected portion, or nothing at all if the entry was later
   deleted — the record would be rewritten by the present. */
function _foodLogVisible(l,date){
  if(!l)return false;
  if(l.createdAt&&l.createdAt.slice(0,10)>date)return false;
  if(l.retracted){var ra=l.retractedAt;if(!_ASOF||!ra||String(ra).slice(0,10)<=date)return false;}
  if(l.supersededBy){var sa=l.supersededAt;if(!_ASOF||!sa||String(sa).slice(0,10)<=date)return false;}
  return true;
}
function removeFoodLog(id){
  var x=DB.foodLogs.filter(function(f){return f.id===id;})[0];if(!x)return false;
  if(x.retracted)return false;
  pushUndo('remove food');
  x.retracted=true;x.retractedAt=nowISO();emitEvent('food.retracted',{id:id},{at:x.retractedAt});
  syncNutritionObservations(x.date);save('food-log:remove');return true;
}
/* updateFoodLog(id, quantity in the entry's own basis, meal) */
/* updateFoodLog(id, quantity in the entry's own basis, meal) — supersedes rather than overwrites. */
/* Review finding: a meal change used to mutate the record in place, so a replay of a day BEFORE the change
   saw the new meal. updateFoodLog already supersedes correctly, so a meal change simply goes through it. */
function changeMeal(id,meal){
  if(MEALS.indexOf(meal)<0)return null;
  var old=(DB.foodLogs||[]).filter(function(l){return l.id===id;})[0];
  if(!old||old.meal===meal)return null;
  return updateFoodLog(id,null,meal);
}
function updateFoodLog(id,quantity,meal){
  var old=DB.foodLogs.filter(function(f){return f.id===id;})[0];if(!old)return null;
  pushUndo('edit food');
  var q=num(quantity);var basis=old.basis||'g';
  var qty=(q!=null&&q>0)?round(q,2):(old.quantity!=null?old.quantity:old.grams);
  var at=nowISO();
  var rec={id:uid('fl'),date:old.date,meal:meal||old.meal,food:JSON.parse(JSON.stringify(old.food)),
    quantity:qty,basis:basis,grams:basis==='g'?qty:null,ml:basis==='ml'?qty:null,servings:basis==='serving'?qty:null,
    portionLabel:_qtyLabel(qty,basis),approx:!!old.approx,nutrients:nutrientsFor(old.food,qty),
    createdAt:at,source:'edit',supersedes:old.id,
    edit:{of:old.id,at:at,fromQuantity:old.quantity!=null?old.quantity:old.grams,toQuantity:qty,fromMeal:old.meal,toMeal:meal||old.meal}};
  old.supersededBy=rec.id;old.supersededAt=at;
  emitEvent('food.superseded',{of:old.id,record:rec},{at:at});
  DB.foodLogs.push(rec);
  syncNutritionObservations(rec.date);save('food-log:edit');return rec;
}
function foodLogsOn(date){var asof=_ASOF||date;return (DB.foodLogs||[]).filter(function(f){return f.date===date&&_foodLogVisible(f,_ASOF||todayISO());});}
/* full ledger for one day, including superseded and retracted entries, for the history view */
function foodLogHistoryOn(date){return (DB.foodLogs||[]).filter(function(f){return f.date===date;}).sort(function(a,b){return String(a.createdAt)<String(b.createdAt)?-1:1;});}
function dayNutrition(date){var logs=foodLogsOn(date);var tot={};NUTRIENT_KEYS.forEach(function(k){tot[k]=0;});var micro={},microCov={};var byMeal={};MEALS.forEach(function(m){byMeal[m]={items:[],totals:{}};NUTRIENT_KEYS.forEach(function(k){byMeal[m].totals[k]=0;});});
  logs.forEach(function(l){NUTRIENT_KEYS.forEach(function(k){if(l.nutrients[k]!=null){tot[k]+=l.nutrients[k];byMeal[l.meal].totals[k]+=l.nutrients[k];}});MICRO_KEYS.forEach(function(k){if(l.nutrients[k]!=null){micro[k]=(micro[k]||0)+l.nutrients[k];microCov[k]=(microCov[k]||0)+1;}});byMeal[l.meal].items.push(l);});
  return {date:date,items:logs.length,totals:tot,micro:micro,microCoverage:microCov,byMeal:byMeal};}
// The bridge: food logs become nutrition observations (source 'food-log'). Manual quick-log entries for the same day take precedence in aggregation.
var FOODLOG_OBS={kcal:'calories',protein:'protein',carbs:'carbs',fat:'fat',fiber:'fiber'};
var FOODLOG_TYPES={calories:1,protein:1,carbs:1,fat:1,fiber:1}; // declared BEFORE the aggregation override below is installed
function syncNutritionObservations(date){
  var day=dayNutrition(date);
  DB.observations.forEach(function(o){if(o.source==='food-log'&&o.date===date&&!o.retracted){o.retracted=true;o.retractedAt=nowISO();o.retractReason='superseded by recalculation';}});
  _memoInvalidate();
  if(!day.items)return;
  var derived=[];
  Object.keys(FOODLOG_OBS).forEach(function(k){var v=day.totals[k];if(v==null)return;var rec=makeObservation({type:FOODLOG_OBS[k],date:date,value:round(v,0),source:'food-log',quality:'derived',note:day.items+' logged items',meta:{items:day.items}});DB.observations.push(rec);derived.push(rec);});
  emitEvent('nutrition.derived',{date:date,records:derived});
  _memoInvalidate();
}
// aggregation override: within dailySeries for nutrition types, manual beats food-log for the same day
(function(){if(typeof FOODLOG_TYPES!=='object'||!FOODLOG_TYPES)throw new Error('FOODLOG_TYPES must be defined before the aggregation override is installed');var _orig=dailySeries;dailySeries=function(type,asOfDate,days,opts){var out=_orig(type,asOfDate,days,opts);if(!FOODLOG_TYPES[type])return out;return out.map(function(d){var manual=d.obs.filter(function(o){return o.source!=='food-log';});if(!manual.length||manual.length===d.obs.length)return d;var v=manual.reduce(function(s,o){return s+o.value;},0);return {date:d.date,value:v,n:manual.length,obs:manual,x:d.x,override:'manual entry overrides the food log for this day'};});};})();
function recentFoods(limit){var seen={},out=[];_liveFoodLogs().slice().reverse().forEach(function(l){var k=foodIdentity(l.food)||l.food.id;if(seen[k])return;seen[k]=1;out.push(Object.assign({},normalizeFood(l.food),{lastQuantity:l.quantity!=null?l.quantity:l.grams,lastBasis:l.basis||'g',lastGrams:l.grams,lastLabel:l.portionLabel,portions:portionsFromSnapshot(l)}));});return out.slice(0,limit||12);}
function frequentFoods(limit){var c={},ref={};_liveFoodLogs().forEach(function(l){var k=foodIdentity(l.food)||l.food.id;c[k]=(c[k]||0)+1;ref[k]=l;});return Object.keys(c).sort(function(a,b){return c[b]-c[a];}).slice(0,limit||8).map(function(id){var l=ref[id];return Object.assign({},normalizeFood(l.food),{count:c[id],lastQuantity:l.quantity!=null?l.quantity:l.grams,lastBasis:l.basis||'g',lastGrams:l.grams,portions:portionsFromSnapshot(l)});});}
function portionsFromSnapshot(l){var live=localFoods().filter(function(f){return f.id===l.food.id;})[0];if(live)return live.portions;var p={label:l.portionLabel};if((l.basis||'g')==='g')p.g=l.grams;else if(l.basis==='ml')p.ml=l.ml;else p.servings=l.servings;return [p];}
function favorites(){return (DB.settings.favorites||[]).map(normalizeFood);}
function toggleFavorite(food){var favs=DB.settings.favorites||[];var i=favs.findIndex(function(f){return f.id===food.id;});if(i>=0)favs.splice(i,1);else favs.push(foodSnapshot(food));DB.settings.favorites=favs;save('favorite');return i<0;}
function _cloneLog(l,toDate,meal){return {id:uid('fl'),date:toDate,meal:meal||l.meal,food:JSON.parse(JSON.stringify(l.food)),quantity:l.quantity!=null?l.quantity:l.grams,basis:l.basis||'g',grams:l.grams!=null?l.grams:null,ml:l.ml!=null?l.ml:null,servings:l.servings!=null?l.servings:null,portionLabel:l.portionLabel,approx:!!l.approx,nutrients:JSON.parse(JSON.stringify(l.nutrients)),createdAt:nowISO(),source:'repeat'};}
/* recent/frequent lists read the ledger, so a retracted or superseded entry must not resurface as a suggestion */
function _liveFoodLogs(){return (DB.foodLogs||[]).filter(function(l){return !l.retracted&&!l.supersededBy;});}
function repeatDay(fromDate,toDate){var logs=foodLogsOn(fromDate);if(!logs.length)return 0;pushUndo('repeat day');logs.forEach(function(l){var c=_cloneLog(l,toDate);DB.foodLogs.push(c);emitEvent('food.logged',c,{at:c.createdAt});});syncNutritionObservations(toDate);save('food-log:repeat');return logs.length;}
function repeatMeal(fromDate,meal,toDate){var logs=foodLogsOn(fromDate).filter(function(l){return l.meal===meal;});if(!logs.length)return 0;pushUndo('repeat meal');logs.forEach(function(l){var c=_cloneLog(l,toDate,meal);DB.foodLogs.push(c);emitEvent('food.logged',c,{at:c.createdAt});});syncNutritionObservations(toDate);save('food-log:repeat');return logs.length;}
/* ---- reference comparison for a day's intake ---- */
function nutritionReference(day){
  var p=prof();var kg=weightKgNow();var out=[];var ph=activePhase()||{};
  var t=day.totals;
  out.push({label:'Protein',value:fmtG(t.protein,0),ref:ph.proteinTarget?('target \u2265'+fmtG(ph.proteinTarget,0)):(kg?('DGA 2025\u20132030 serving goal 1.2\u20131.6 g/kg = '+fmtG(kg*1.2,0)+'\u2013'+fmtG(kg*1.6,0)+' (official guideline; sports positions run 1.6\u20132.2 g/kg in a deficit)'):'\u2014'),tone:ph.proteinTarget?(t.protein>=ph.proteinTarget*0.9?'good':(t.protein>=ph.proteinTarget*0.7?'attention':'negative')):'neutral',cls:ph.proteinTarget?'target':'reference'});
  out.push({label:'Fiber',value:fmtG(t.fiber,0),ref:'DV 28 g \u00b7 AI '+(p.sex==='female'?'25':'38')+' g \u00b7 14 g per 1,000 kcal',tone:t.fiber>=28?'good':(t.fiber>=20?'attention':'neutral'),cls:'reference'});
  var satPct=t.kcal?Math.round(100*t.satfat*9/t.kcal):null;out.push({label:'Saturated fat',value:fmtG(t.satfat,0)+(satPct!=null?(' \u00b7 '+satPct+'% kcal'):''),ref:'DGA \u226410% of calories',tone:satPct==null?'neutral':(satPct<=10?'good':'attention'),cls:'reference'});
  out.push({label:'Sodium',value:fmtNum(t.sodium,0)+' mg',ref:'DGA <2,300 mg (more if very active)',tone:t.sodium<=2300?'good':(t.sodium<=3000?'attention':'negative'),cls:'reference'});
  out.push({label:'Sugars (total)',value:fmtG(t.sugars,0),ref:'added-sugar limit \u226410 g per meal (DGA); total sugars include fruit and dairy',tone:'neutral',cls:'reference'});
  return out;
}

/* ============================================================================
   \u00a717: NUTRIENT LAYERS
   database value \u2192 consumed \u2192 absorbed \u2192 physiologically available, each with its uncertainty. The first two
   were already kept apart in every log (food.per100 is the database value, nutrients is what the portion
   works out to); the absorbed and available layers are derived here, on demand, and never written back.
   Digestibility and fibre energy are population reference values (PRIOR), stated as such, because they
   cannot be measured for one person.
   ============================================================================ */
var ANIMAL_CATEGORIES=/dairy|egg|poultry|beef|pork|lamb|veal|game|finfish|shellfish|sausage|luncheon|fish|meat/i;
function nutrientLayers(log){
  if(!log||!log.food||!log.food.per100)return {status:'no-reference',note:'This entry has no database record to layer from.'};
  var db=log.food.per100,n=log.nutrients||{};
  /* Portion uncertainty: a weighed portion is close; a serving or a described portion is an estimate. */
  var weighed=log.basis==='g'&&log.grams!=null&&!log.portionLabel;
  var portionRel=weighed?0.05:0.25;
  var animal=ANIMAL_CATEGORIES.test(log.food.category||'');
  var protDig=animal?0.95:0.85;
  var P=n.protein||0,F=n.fat||0,C=n.carbs||0,Fi=n.fiber||0;
  var availCarb=Math.max(0,C-Fi);
  var absorbed={protein:round(P*protDig,1),fat:round(F*0.95,1),availableCarbs:round(availCarb,1),fiber:round(Fi,1)};
  /* Energy the body can use: absorbed macronutrients at their factors, plus ~2 kcal/g from fermented fibre. */
  var availableKcal=4*absorbed.protein+9*absorbed.fat+4*absorbed.availableCarbs+2*Fi;
  return {status:'ok',
    database:{per100:db,source:log.food.source||null,version:log.food.version||null,id:log.food.fdcId||log.food.id,
      cls:'MEASURED',note:'the reference value, never modified'},
    consumed:{nutrients:n,grams:log.grams,portion:weighed?'weighed':'estimated',
      uncertainty:{relative:portionRel,basis:weighed?'weighed portion':'portion estimated from a serving or description'},cls:'DERIVED'},
    absorbed:Object.assign({},absorbed,{digestibility:{protein:protDig,fat:0.95},
      basis:(animal?'animal':'plant or mixed')+'-source protein digestibility, population reference',cls:'PRIOR'}),
    available:{kcal:round(availableKcal,0),labelKcal:n.kcal!=null?round(n.kcal,0):null,
      difference:n.kcal!=null?round(availableKcal-n.kcal,0):null,cls:'PRIOR',
      note:'energy available after digestion, against the label figure, which uses general Atwater factors'},
    uncertainty:{portion:portionRel,absorption:'about \u00b15% around the reference digestibility',
      combined:'the portion estimate dominates unless the food was weighed'}};
}
function dayNutrientLayers(date){
  var logs=foodLogsOn(date);
  if(!logs.length)return {status:'none',date:date,note:'nothing itemised on this day'};
  var L=logs.map(nutrientLayers).filter(function(x){return x.status==='ok';});
  var sum=function(f){return round(L.reduce(function(a,x){return a+(f(x)||0);},0),1);};
  return {status:'ok',date:date,entries:L.length,
    consumed:{kcal:sum(function(x){return x.consumed.nutrients.kcal;}),protein:sum(function(x){return x.consumed.nutrients.protein;})},
    absorbed:{protein:sum(function(x){return x.absorbed.protein;}),fat:sum(function(x){return x.absorbed.fat;})},
    available:{kcal:sum(function(x){return x.available.kcal;})},
    weighedShare:round(L.filter(function(x){return x.consumed.portion==='weighed';}).length/L.length,2),
    note:'Each layer is kept separate: what the database says, what the portion works out to, what is absorbed, and what the body can use.'};
}

/* ---- FOOD ENTITY RESOLUTION (H2, D1 \u00a714) ----
   One food can arrive by several routes: the bundled reference data, a branded product, a custom entry, a recipe. Each
   has a canonical identity \u2014 the product barcode for branded items, the database id for reference foods, and for a
   custom food its own id unless the person has said it is the same as another. Recent and frequent foods and the
   familiarity that meal suggestions use are counted per identity, so one habit is not split across duplicates. Every
   log keeps its own nutrient snapshot, so resolution never changes what was recorded. */
function _normGtin(g){var d=String(g||'').replace(/\D/g,'');return d?d.padStart(14,'0'):null;}
function foodIdentity(f){
  if(!f)return null;
  if(f.kind==='custom'||f.kind==='user'){var own=(DB.foods||[]).filter(function(x){return x.id===f.id;})[0];
    var sa=(own&&own.sameAs)||f.sameAs;if(sa&&sa.identity)return sa.identity;
    var g0=_normGtin(f.gtin||(own&&own.gtin));if(g0)return 'gtin:'+g0;return 'custom:'+f.id;}
  if(f.kind==='recipe')return 'recipe:'+f.id;
  var g=_normGtin(f.gtin);if(g)return 'gtin:'+g;
  if(f.fdcId!=null)return 'fdc:'+f.fdcId;
  return (f.kind||'food')+':'+f.id;
}
function _nameTokens(s){var out={};String(s||'').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').split(/\s+/).forEach(function(w){
  if(w.length>3&&/s$/.test(w)&&!/ss$/.test(w))w=w.slice(0,-1);   /* eggs and egg are one word */
  if(w.length>2&&['raw','plain','the','and','with','commercial','retail'].indexOf(w)<0)out[w]=1;});return Object.keys(out);}
function _jaccard(a,b){var A={},n=0,u=0;a.forEach(function(x){A[x]=1;});var B={};b.forEach(function(x){B[x]=1;});
  Object.keys(A).concat(Object.keys(B).filter(function(x){return !A[x];})).forEach(function(x){u++;if(A[x]&&B[x])n++;});return u?n/u:0;}
/* Two foods are the same entity when they share a barcode, or when their names largely agree AND their nutrition does:
   a shared name alone is not enough ("Greek yogurt" full-fat and non-fat are different foods). */
function sameFood(a,b){
  if(!a||!b)return {same:false};
  var ia=foodIdentity(a),ib=foodIdentity(b);if(ia===ib)return {same:true,reason:'same identity'};
  var ga=_normGtin(a.gtin),gb=_normGtin(b.gtin);if(ga&&gb)return {same:ga===gb,reason:ga===gb?'same barcode':'different barcodes'};
  var pa=a.per100||{},pb=b.per100||{};if(pa.kcal==null||pb.kcal==null||(a.basis||'g')!==(b.basis||'g'))return {same:false,reason:'nutrition not comparable'};
  var j=_jaccard(_nameTokens(a.name),_nameTokens(b.name));
  var close=function(x,y,t){return x!=null&&y!=null&&Math.abs(x-y)<=Math.max(t*Math.max(x,y),1);};
  var nutr=close(pa.kcal,pb.kcal,0.08)&&close(pa.protein||0,pb.protein||0,0.12)&&close(pa.fat||0,pb.fat||0,0.15)&&close(pa.carbs||0,pb.carbs||0,0.15);
  return {same:j>=0.5&&nutr,reason:'name '+Math.round(j*100)+'% alike, nutrition '+(nutr?'matches':'differs'),similarity:j};
}
function foodDuplicates(){
  var mine=(DB.foods||[]).filter(function(f){return !f.retracted&&!f.sameAs;});
  var pool=seedFoods().concat(mine),out=[];
  mine.forEach(function(c){pool.forEach(function(o){if(o===c||o.id===c.id)return;if((c.notSameAs||[]).indexOf(o.kind+'|'+o.id)>=0)return;var r=sameFood(c,o);
    if(r.same&&r.reason!=='same identity')out.push({food:c.id,foodName:c.name,matches:o.kind+'|'+o.id,matchName:o.name,identity:foodIdentity(o),reason:r.reason});});});
  return out;
}
/* Recorded through the ordinary custom-food save: nothing is deleted and no log is rewritten. */
function markSameFood(customId,targetFood){
  var own=(DB.foods||[]).filter(function(x){return x.id===customId;})[0];if(!own||!targetFood)return {status:'refused'};
  own.sameAs={identity:foodIdentity(targetFood),name:targetFood.name,at:nowISO()};saveUserFood(own);_memoInvalidate();
  return {status:'ok',identity:own.sameAs.identity};
}

function markDifferentFood(customId,ref){var own=(DB.foods||[]).filter(function(x){return x.id===customId;})[0];if(!own)return {status:'refused'};
  own.notSameAs=(own.notSameAs||[]).concat([ref]);saveUserFood(own);_memoInvalidate();return {status:'ok'};}
