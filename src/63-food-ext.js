/* ============================================================================
   REGION: FOOD EXTENSIONS — FNDDS + DSLD adapters, retention and yield factors, nutritional adequacy.
   Each adapter is installed here but its data is loaded lazily from ./data/... and is absent unless the
   corresponding build script has been run. Nothing here invents a number: if a table is not present, the
   feature reports "not installed" rather than falling back to a guess.
   ============================================================================ */
var _fndds=null,_fnddsState='not installed',_dsld=null,_dsldState='not installed';
var _refTables={retention:null,yields:null};
function adapterState(){return {fndds:_fnddsState,dsld:_dsldState,retention:_refTables.retention?'loaded':'not installed',yields:_refTables.yields?('loaded ('+_refTables.yields.count+' verified items)'):'not loaded yet'};}
/* ---- USDA FNDDS 2021–2023: survey foods with portion weights (Foods and Beverages + Portions and Weights) ---- */
function loadFndds(){
  if(_fndds)return Promise.resolve(_fndds);
  _fnddsState='loading';
  return loadFoodJSON('fndds/manifest.json').then(function(m){_fndds=m;_fnddsState='loaded ('+m.foods+' survey foods, '+m.version+')';return m;})
    .catch(function(e){_fnddsState='not installed (run scripts/fndds-build.mjs)';throw e;});
}
/* FNDDS records: [foodCode, description, categoryIndex, per100 nutrients..., portions[[portionCode, description, gramWeight]]] */
function fnddsToFood(r,m){
  var per={kcal:r[3],protein:r[4],carbs:r[5],fat:r[6],fiber:r[7],sugars:r[8],satfat:r[9],sodium:r[10],potassium:r[11],calcium:r[12],iron:r[13],cholesterol:r[14]};
  return normalizeFood({kind:'fndds',id:'fndds-'+r[0],foodCode:r[0],name:titleCase(r[1]),category:(m.categories||[])[r[2]]||'',basis:'g',per100:per,per100g:per,
    portions:(r[15]||[]).map(function(p){return {label:p[1],g:p[2],portionCode:p[0]};}),
    source:'FDC_FNDDS',version:m.version,energySource:'FNDDS nutrient values',conversionConfidence:'exact',
    note:'survey food: a national average of how this dish is typically prepared, not a specific product'});
}
function fnddsSearch(q,limit){
  var toks=foodTokens(q);if(!toks.length)return Promise.resolve([]);
  return loadFndds().then(function(m){
    var pre=toks[0].slice(0,2);if((m.idxPrefixes||[]).indexOf(pre)<0)return [];
    return loadFoodJSON('fndds/idx-'+pre.replace(/[^a-z0-9]/g,'_')+'.json').then(function(idx){
      var hits={};toks.forEach(function(t){Object.keys(idx).forEach(function(k){if(k.indexOf(t)!==0)return;(idx[k]||[]).forEach(function(i){hits[i]=(hits[i]||0)+1;});});});
      var ids=Object.keys(hits).map(Number).filter(function(i){return hits[i]>=toks.length;}).slice(0,limit||20);
      if(!ids.length)return [];
      var per=m.recsPerShard||2000;var byShard={};ids.forEach(function(i){(byShard[Math.floor(i/per)]=byShard[Math.floor(i/per)]||[]).push(i);});
      return Promise.all(Object.keys(byShard).map(function(sh){return loadFoodJSON('fndds/recs-'+String(sh).padStart(3,'0')+'.json').then(function(arr){return byShard[sh].map(function(i){var r=arr[i-sh*per];return r?fnddsToFood(r,m):null;});});}))
        .then(function(groups){return groups.reduce(function(a,g){return a.concat(g);},[]).filter(Boolean);});
    });
  }).catch(function(e){if(!e||!e.availability)_q(e);return [];});
}
/* ---- NIH DSLD: supplement labels (per serving by declaration, so basis 'serving') ---- */
function loadDsld(){
  if(_dsld)return Promise.resolve(_dsld);
  _dsldState='loading';
  return loadFoodJSON('../supplements/manifest.json').then(function(m){_dsld=m;_dsldState='loaded ('+m.products+' products, '+m.version+')';return m;})
    .catch(function(e){_dsldState='not installed (run scripts/dsld-build.mjs)';throw e;});
}
function dsldToProduct(r,m){
  return {kind:'supplement',id:'dsld-'+r[0],dsldId:r[0],name:titleCase(r[1]),brand:r[2]||'',form:r[3]||'',servingSize:r[4]||'',
    ingredients:(r[5]||[]).map(function(i){return {name:i[0],amount:i[1],unit:i[2],dvPct:i[3]!=null?i[3]:null};}),
    source:'NIH_DSLD',version:m.version,basis:'serving',
    note:'label declaration, not an assay; third-party verification (USP, NSF, Informed Sport) is what tests the contents'};
}
function dsldSearch(q,limit){
  var toks=foodTokens(q);if(!toks.length)return Promise.resolve([]);
  return loadDsld().then(function(m){
    var pre=toks[0].slice(0,2);if((m.idxPrefixes||[]).indexOf(pre)<0)return [];
    return loadFoodJSON('../supplements/idx-'+pre.replace(/[^a-z0-9]/g,'_')+'.json').then(function(idx){
      var hits={};toks.forEach(function(t){Object.keys(idx).forEach(function(k){if(k.indexOf(t)!==0)return;(idx[k]||[]).forEach(function(i){hits[i]=(hits[i]||0)+1;});});});
      var ids=Object.keys(hits).map(Number).filter(function(i){return hits[i]>=toks.length;}).slice(0,limit||20);
      if(!ids.length)return [];
      var per=m.recsPerShard||1000;var byShard={};ids.forEach(function(i){(byShard[Math.floor(i/per)]=byShard[Math.floor(i/per)]||[]).push(i);});
      return Promise.all(Object.keys(byShard).map(function(sh){return loadFoodJSON('../supplements/recs-'+String(sh).padStart(3,'0')+'.json').then(function(arr){return byShard[sh].map(function(i){var r=arr[i-sh*per];return r?dsldToProduct(r,m):null;});});}))
        .then(function(groups){return groups.reduce(function(a,g){return a.concat(g);},[]).filter(Boolean);});
    });
  }).catch(function(e){if(!e||!e.availability)_q(e);return [];});
}
/* ---- Retention and yield factors ----
   USDA Table of Nutrient Retention Factors (Release 6) gives the percentage of each nutrient retained through a
   cooking method; USDA Agriculture Handbook 102 gives raw→cooked weight yields. Both are lookup tables, not
   formulas — this build ships the mechanism and the loaders, and the tables are installed by
   scripts/reference-build.mjs from the source publications. No factor is guessed: with no table loaded,
   applyRetention and applyYield return the input unchanged and say so.  */
function loadReferenceTable(kind){
  if(_refTables[kind])return Promise.resolve(_refTables[kind]);
  return loadFoodJSON('../reference/'+kind+'.json').then(function(t){_refTables[kind]=t;return t;}).catch(function(e){throw e;});
}
function applyRetention(nutrients,code){
  var t=_refTables.retention;
  if(!t||!t.codes||!t.codes[code])return {nutrients:nutrients,applied:false,note:'retention factors are not installed; nutrient values are as-published for the food as listed (run scripts/reference-build.mjs with USDA Retention Factors Release 6)'};
  var f=t.codes[code];var out={};Object.keys(nutrients||{}).forEach(function(k){var pct=f.factors[k];out[k]=(nutrients[k]==null||pct==null)?nutrients[k]:round(nutrients[k]*pct/100,2);});
  return {nutrients:out,applied:true,code:code,method:f.description,source:t.source,note:'nutrient retention applied for '+f.description+' (USDA Retention Factors '+t.version+')'};
}
function applyYield(grams,code){
  var t=_refTables.yields;
  if(!t||!t.items||!t.items[code])return {grams:grams,applied:false,
    note:t?('AH-102 item '+code+' is not in the extracted table \u2014 that row could not be verified, which is not the same as its yield being 1.0'):
          'yield factors are not loaded yet; enter the weight in the state you actually ate (cooked weight for a cooked food)'};
  var y=t.items[code];
  /* The factor and the percentages travel with the result: a caller that has to look them up separately
     will eventually render one it did not fetch. */
  return {grams:round(grams*y.factor,1),applied:true,code:code,from:y.from,to:y.to,
    factor:y.factor,percent:Math.round(y.factor*100),lossPercent:y.lossPercent,page:y.page,source:t.source,
    note:y.to+' at '+fmtNum(y.factor*100,0)+'% of the raw weight (USDA AH-102 item '+code+', page '+y.page+'; verified against its loss column)'};
}
/* Search the extracted table. Descriptions are OCR output and imperfect, so this returns candidates for a
   person to choose between rather than picking one. */
function findYields(query,limit){
  var t=_refTables.yields;
  if(!t||!t.items)return {status:'not loaded',rows:[]};
  var q=String(query||'').toLowerCase().trim();
  if(!q)return {status:'ok',rows:[]};
  var rows=[];
  Object.keys(t.items).forEach(function(code){
    var y=t.items[code];
    if(String(y.to||'').toLowerCase().indexOf(q)<0)return;
    rows.push({code:code,label:y.to,factor:y.factor,percent:Math.round(y.factor*100),lossPercent:y.lossPercent,page:y.page});
  });
  rows.sort(function(a,b){return a.label.length-b.label.length;});
  return {status:'ok',rows:rows.slice(0,limit||12),total:Object.keys(t.items).length,
    note:'Descriptions are OCR output and often partial. Check the item number against the handbook before relying on one.'};
}
function yieldTableInfo(){
  var t=_refTables.yields;
  if(!t)return {installed:false,note:'not loaded yet; it loads on first use'};
  return {installed:true,count:t.count,source:t.source,version:t.version,caveat:t.caveat,coverage:t.coverage||null,
    note:'Every shipped row was confirmed by checking that its yield and loss sum to about 100. Rows that could not be confirmed were left out.'};
}

/* ---- nutritional adequacy: a 7-day view against DRI/DV, with coverage stated before any verdict ---- */
var ADEQUACY_TARGETS=[
  {key:'fiber',label:'Fiber',unit:'g',basis:'per 1,000 kcal',ref:function(){return 14;},perKcal:true,ref2:'DV 28 g/day',dir:'min'},
  {key:'sodium',label:'Sodium',unit:'mg',ref:function(){return 2300;},dir:'max',ref2:'DGA chronic disease risk reduction intake'},
  {key:'satfat',label:'Saturated fat',unit:'% kcal',ref:function(){return 10;},dir:'max',pctKcal:9,ref2:'DGA \u226410% of calories'},
  {key:'sugars',label:'Total sugars',unit:'g',ref:function(){return null;},dir:'info',ref2:'the DGA limit is on added sugars (<10% of calories); total sugars include fruit and dairy'},
  {key:'potassium',label:'Potassium',unit:'mg',ref:function(){return prof().sex==='female'?2600:3400;},dir:'min',ref2:'AI'},
  {key:'calcium',label:'Calcium',unit:'mg',ref:function(){var a=num(prof().age)||30;return a>=51?(prof().sex==='female'?1200:1000):1000;},dir:'min',ref2:'RDA'},
  {key:'iron',label:'Iron',unit:'mg',ref:function(){return prof().sex==='female'&&(num(prof().age)||30)<51?18:8;},dir:'min',ref2:'RDA'}
];
function nutritionAdequacy(days){
  days=days||7;
  return memo('adequacy:'+days+':'+asOf(),function(){
    var end=asOf();var dates=[];for(var i=days-1;i>=0;i--)dates.push(addDays(end,-i));
    var logged=dates.map(function(d){return dayNutrition(d);}).filter(function(d){return d.items>0;});
    if(!logged.length)return {status:'insufficient',days:days,logged:0,need:'log a day of food to compare intake against reference intakes'};
    var meanKcal=mean(logged.map(function(d){return d.totals.kcal;}));
    var rows=ADEQUACY_TARGETS.map(function(t){
      var vals=logged.map(function(d){return t.key==='potassium'||t.key==='calcium'||t.key==='iron'?(d.micro[t.key]!=null?d.micro[t.key]:null):d.totals[t.key];}).filter(function(v){return v!=null;});
      var cov=logged.length?vals.length/logged.length:0;
      if(!vals.length)return {key:t.key,label:t.label,status:'no data',coverage:0,note:'no logged item carried '+t.label.toLowerCase()+'; USDA Branded records often omit micronutrients'};
      var m=mean(vals);var target=t.ref();
      var val=m,cmp=target;
      if(t.pctKcal&&meanKcal){val=100*m*t.pctKcal/meanKcal;}
      if(t.perKcal&&meanKcal){cmp=target*meanKcal/1000;}
      var verdict='info';
      if(t.dir==='min'&&cmp!=null)verdict=val>=cmp?'meets':(val>=cmp*0.7?'below':'well below');
      if(t.dir==='max'&&cmp!=null)verdict=val<=cmp?'within':(val<=cmp*1.3?'above':'well above');
      return {key:t.key,label:t.label,status:'ok',mean:round(val,val<10?1:0),unit:t.pctKcal?'% kcal':t.unit,target:cmp!=null?round(cmp,cmp<10?1:0):null,ref:t.ref2,dir:t.dir,verdict:verdict,
        coverage:round(cov*100,0),
        note:cov<0.8?('only '+vals.length+' of '+logged.length+' logged days carried this nutrient \u2014 the mean understates intake'):null};
    });
    // per-meal protein distribution (the leucine-threshold argument for spreading protein across meals)
    var kg=weightKgNow();var perMeal=null;
    if(kg){var byMeal={};MEALS.forEach(function(mm){var v=logged.map(function(d){return d.byMeal[mm].totals.protein;}).filter(function(x){return x>0;});byMeal[mm]=v.length?mean(v):0;});
      var threshold=0.3*kg;perMeal={thresholdG:round(threshold,0),meals:MEALS.map(function(mm){return {meal:mm,mean:round(byMeal[mm],0),meets:byMeal[mm]>=threshold};}),
        note:'\u22480.3 g/kg per meal is the intake commonly cited for maximal muscle-protein-synthesis stimulation; total daily protein matters more than distribution'};}
    var fatFloor=null;var meanFat=mean(logged.map(function(d){return d.totals.fat;}));
    if(kg)fatFloor={mean:round(meanFat,0),floor:round(0.5*kg,0),meets:meanFat>=0.5*kg,note:'\u22480.5 g/kg/day is a common practical floor for hormone and fat-soluble-vitamin adequacy in a deficit'};
    return {status:'ok',days:days,logged:logged.length,coverage:round(100*logged.length/days,0),meanKcal:round(meanKcal,0),rows:rows,perMealProtein:perMeal,fatFloor:fatFloor,cls:'DERIVED',
      caveat:logged.length<days?('only '+logged.length+' of the last '+days+' days were logged; unlogged days are unknown, not zero'):null};
  });
}
