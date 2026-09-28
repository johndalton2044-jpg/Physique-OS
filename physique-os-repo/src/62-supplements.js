/* ============================================================================
   SUPPLEMENTS AND VITAMINS, at the maturity of the food domain.
   Layers, as food has them: a reference (intakes and upper limits), a canonical catalogue with entity resolution, logging
   with doses and units, a regimen with adherence, combined intake from food and supplements, evidence-graded guidance,
   and personal efficacy (supplementEfficacy, now driven by this catalogue). Units match FoodData Central (vitamin D and
   B12 in \u00b5g, vitamin A in \u00b5g RAE, folate in \u00b5g DFE, the rest mostly mg), so food and supplements add up.
   Nothing here prescribes: doses are label ranges from the evidence, and where testing matters it says to test.
   ============================================================================ */

/* ---- REFERENCE INTAKES (NASEM Dietary Reference Intakes, adults). rda: [male, female] or a single value, with the
   over-50 changes that matter; ul: the tolerable upper intake level and whether it bounds TOTAL intake or supplements
   only (magnesium, folic acid, niacin and vitamin E are supplement-only limits). ---- */
var MICRONUTRIENTS={
  vitd:{label:'Vitamin D',unit:'\u00b5g',rda:[15,15],over70:20,ul:100,ulScope:'total',foodData:true},
  vitc:{label:'Vitamin C',unit:'mg',rda:[90,75],ul:2000,ulScope:'total',foodData:true},
  vita:{label:'Vitamin A',unit:'\u00b5g RAE',rda:[900,700],ul:3000,ulScope:'preformed vitamin A (retinol)',foodData:true},
  vitb6:{label:'Vitamin B6',unit:'mg',rda:[1.3,1.3],over50:[1.7,1.5],ul:100,ulScope:'total',foodData:true},
  vitb12:{label:'Vitamin B12',unit:'\u00b5g',rda:[2.4,2.4],ul:null,foodData:true},
  folate:{label:'Folate',unit:'\u00b5g DFE',rda:[400,400],ul:1000,ulScope:'supplements and fortified foods (folic acid)',foodData:true},
  thiamin:{label:'Thiamin (B1)',unit:'mg',rda:[1.2,1.1],ul:null,foodData:true},
  riboflavin:{label:'Riboflavin (B2)',unit:'mg',rda:[1.3,1.1],ul:null,foodData:true},
  niacin:{label:'Niacin (B3)',unit:'mg',rda:[16,14],ul:35,ulScope:'supplements and fortified foods',foodData:true},
  calcium:{label:'Calcium',unit:'mg',rda:[1000,1000],over50:[1000,1200],over70:1200,ul:2500,ulOver50:2000,ulScope:'total',foodData:true},
  iron:{label:'Iron',unit:'mg',rda:[8,18],over50:[8,8],ul:45,ulScope:'total',foodData:true},
  magnesium:{label:'Magnesium',unit:'mg',rda:[420,320],ul:350,ulScope:'supplements only',foodData:true},
  zinc:{label:'Zinc',unit:'mg',rda:[11,8],ul:40,ulScope:'total',foodData:true},
  potassium:{label:'Potassium',unit:'mg',rda:[3400,2600],ai:true,ul:null,foodData:true},
  phosphorus:{label:'Phosphorus',unit:'mg',rda:[700,700],ul:4000,ulScope:'total',foodData:true},
  vite:{label:'Vitamin E',unit:'mg',rda:[15,15],ul:1000,ulScope:'supplements only',foodData:false},
  vitk:{label:'Vitamin K',unit:'\u00b5g',rda:[120,90],ai:true,ul:null,foodData:false},
  iodine:{label:'Iodine',unit:'\u00b5g',rda:[150,150],ul:1100,ulScope:'total',foodData:false},
  selenium:{label:'Selenium',unit:'\u00b5g',rda:[55,55],ul:400,ulScope:'total',foodData:false}
};
function micronutrientTarget(key){var m=MICRONUTRIENTS[key];if(!m)return null;var a=(typeof _ageSex==='function'?_ageSex():{age:null,sex:null}),age=a.age||40,i=a.sex==='female'?1:0;
  var rda=(age>70&&m.over70)?m.over70:((age>50&&m.over50)?m.over50[a.sex?i:0]:(a.sex?m.rda[i]:(m.rda[0]+m.rda[1])/2));
  var ul=m.ul==null?null:((age>50&&m.ulOver50)?m.ulOver50:m.ul);
  return {key:key,label:m.label,unit:m.unit,target:rda,kind:m.ai?'AI':'RDA',ul:ul,ulScope:m.ulScope||null,basis:a.sex?(a.sex+', '+(a.age?('age '+a.age):'age assumed 40')):'an average of male and female values (sex not set)'};}

/* ---- THE CATALOGUE. dose in the unit given; per: nutrient content per ONE unit of dose (e.g. vitamin D3 per \u00b5g);
   evidence: grade per outcome \u2014 A strong and consistent, B moderate, C limited, D insufficient \u2014 from NIH ODS (2024)
   and the ISSN position stands; test: the outcome this app can check personally. ---- */
var SUPPLEMENT_CATALOGUE={
  creatine:{label:'Creatine monohydrate',aliases:['creatine','creatine monohydrate','creapure'],unit:'g',dose:[3,5],
    evidence:[['strength and power in repeated high-intensity efforts','A'],['lean mass gain alongside training','A'],['endurance performance','D']],
    cautions:['Expect 0.5\u20132 kg of water weight in the first weeks: the scale moves, fat does not.','Kidney disease: ask a clinician first.'],test:['weight','water weight on the scale'],source:'NIH ODS 2024; ISSN 2017'},
  caffeine:{label:'Caffeine',aliases:['caffeine','pre-workout','preworkout','coffee pill','no-doz'],unit:'mg',dose:[100,400],perKg:[3,6],
    evidence:[['endurance and intermittent performance','A'],['strength','B']],cautions:['Up to about 400 mg a day is reasonably safe for healthy adults.','Within 6 hours of bed it shortens and lightens sleep.','Pregnancy, heart rhythm problems, anxiety: ask a clinician.'],test:['sleep','sleep duration'],source:'NIH ODS 2024; ISSN 2021'},
  protein:{label:'Protein powder (whey, casein, plant)',aliases:['whey','casein','protein powder','protein shake','pea protein','isolate'],unit:'g',dose:[20,40],food:{proteinPerG:0.8,kcalPerG:4},
    evidence:[['reaching a protein target','A'],['strength or size beyond reaching the target','D']],cautions:['It is food: it counts toward protein and calories.'],test:['hunger','appetite'],source:'NIH ODS 2024; ISSN 2017'},
  vitd:{label:'Vitamin D3',aliases:['vitamin d','vitamin d3','vit d','vit d3','d3','cholecalciferol'],unit:'\u00b5g',altUnits:{IU:0.025},dose:[25,100],per:{vitd:1},
    evidence:[['correcting a measured deficiency','A'],['performance or body composition','D']],cautions:['Above 100 \u00b5g (4,000 IU) a day is over the upper limit.','A blood test (25-OH vitamin D) says whether you need it.'],test:null,source:'NASEM DRI; NIH ODS'},
  multivitamin:{label:'Multivitamin (typical label)',aliases:['multivitamin','multi','multi-vitamin','one a day'],unit:'tablet',dose:[1,1],
    per:{vitd:25,vitc:90,vita:900,vitb6:2,vitb12:6,folate:400,thiamin:1.2,riboflavin:1.3,niacin:16,calcium:200,iron:8,magnesium:50,zinc:11,vite:15,vitk:80,iodine:150,selenium:55},typical:true,
    evidence:[['filling gaps in a restricted diet','B'],['preventing disease in the well-fed','D']],cautions:['Contents vary by product: these are typical label amounts. Add your own product for exact values.'],test:null,source:'NIH ODS'},
  magnesium:{label:'Magnesium',aliases:['magnesium','mag','magnesium glycinate','magnesium citrate','magnesium oxide','magnesium threonate'],unit:'mg',dose:[200,350],per:{magnesium:1},
    evidence:[['correcting low intake','A'],['sleep quality','C'],['performance','D']],cautions:['More than 350 mg a day from supplements often upsets the gut.','Kidney disease: ask a clinician.'],test:['sleep','sleep duration'],source:'NASEM DRI; NIH ODS'},
  omega3:{label:'Omega-3 (fish or algal oil)',aliases:['fish oil','omega 3','omega-3','epa','dha','krill oil','algal oil'],unit:'g EPA+DHA',dose:[1,2],
    evidence:[['lowering triglycerides','A'],['recovery or performance','C']],cautions:['On blood thinners: ask a clinician first.'],test:null,source:'NIH ODS 2024'},
  iron:{label:'Iron',aliases:['iron','ferrous sulfate','ferrous sulphate','ferrous bisglycinate'],unit:'mg',dose:[8,18],per:{iron:1},
    evidence:[['correcting a measured deficiency','A'],['performance without deficiency','D']],cautions:['Take iron only after a blood test: excess iron is harmful.','Coffee, tea and calcium reduce its absorption.'],test:null,source:'NASEM DRI; NIH ODS'},
  zinc:{label:'Zinc',aliases:['zinc','zinc picolinate','zinc gluconate'],unit:'mg',dose:[8,25],per:{zinc:1},evidence:[['correcting low intake','A'],['immune or hormonal benefit when not deficient','D']],cautions:['Above 40 mg a day can cause copper deficiency.'],test:null,source:'NASEM DRI'},
  vitc:{label:'Vitamin C',aliases:['vitamin c','vit c','ascorbic acid'],unit:'mg',dose:[75,500],per:{vitc:1},evidence:[['correcting low intake','A'],['preventing colds','C']],cautions:['High doses around training may blunt some adaptations.'],test:null,source:'NASEM DRI; NIH ODS'},
  b12:{label:'Vitamin B12',aliases:['b12','vitamin b12','cobalamin','methylcobalamin','cyanocobalamin'],unit:'\u00b5g',dose:[5,250],per:{vitb12:1},evidence:[['preventing deficiency on a vegan diet','A']],cautions:[],test:null,source:'NASEM DRI; NIH ODS'},
  calcium:{label:'Calcium',aliases:['calcium','calcium carbonate','calcium citrate'],unit:'mg',dose:[200,600],per:{calcium:1},evidence:[['reaching intake when the diet is low','A']],cautions:['Take separately from iron.'],test:null,source:'NASEM DRI'},
  folic:{label:'Folic acid',aliases:['folic acid','folate','methylfolate'],unit:'\u00b5g',dose:[400,400],per:{folate:1.7},evidence:[['before and in early pregnancy','A']],cautions:['1 \u00b5g of folic acid counts as 1.7 \u00b5g DFE.'],test:null,source:'NASEM DRI'},
  electrolytes:{label:'Electrolytes',aliases:['electrolytes','electrolyte','lmnt','nuun','salt tabs'],unit:'serving',dose:[1,2],food:{sodiumPerUnit:500,potassiumPerUnit:200},evidence:[['long sweaty sessions','B']],cautions:['Counts toward sodium.'],test:['weight','scale weight'],source:'ACSM fluid position'},
  betaalanine:{label:'Beta-alanine',aliases:['beta-alanine','beta alanine','carnosyn'],unit:'g',dose:[3.2,6.4],evidence:[['efforts of 1\u20134 minutes','B'],['strength','D']],cautions:['Tingling skin (paraesthesia) is harmless; split doses reduce it.'],test:null,source:'ISSN 2015; NIH ODS 2024'},
  bicarbonate:{label:'Sodium bicarbonate',aliases:['sodium bicarbonate','bicarb','baking soda'],unit:'g',dose:[15,25],perKg:[0.2,0.3],evidence:[['high-intensity efforts of 1\u201310 minutes','B']],cautions:['Often causes gut distress; very high sodium.'],test:null,source:'ISSN 2021; NIH ODS 2024'},
  nitrate:{label:'Dietary nitrate (beetroot)',aliases:['beetroot','beet juice','nitrate','beet'],unit:'mmol',dose:[6,13],evidence:[['endurance efficiency','B']],cautions:['Harmless pink urine.'],test:null,source:'NIH ODS 2024'},
  melatonin:{label:'Melatonin',aliases:['melatonin'],unit:'mg',dose:[0.5,3],evidence:[['falling asleep faster, jet lag','B']],cautions:['Prescription-only in some countries; ask a clinician for regular use.'],test:['sleep','sleep duration'],source:'NIH NCCIH'}
};
/* ---- ENTITY RESOLUTION: free text \u2192 catalogue entry, dose, unit (canonical). Old text-only logs resolve too. ---- */
function resolveSupplement(text){
  var t=String(text||'').toLowerCase().trim();if(!t)return null;
  var best=null;Object.keys(SUPPLEMENT_CATALOGUE).forEach(function(id){SUPPLEMENT_CATALOGUE[id].aliases.forEach(function(a){if(t.indexOf(a)>=0&&(!best||a.length>best.alias.length))best={id:id,alias:a};});});
  if(!best)return {id:null,text:text,resolved:false};
  /* numbers glued to a letter (D3, B12) are names, not doses; a number with a unit wins over a bare one */
  var c=SUPPLEMENT_CATALOGUE[best.id],re=/(\d+(?:\.\d+)?)\s*(iu|mcg|\u00b5g|ug|mg|g|kg|tablets?|caps?(?:ules)?|scoops?|servings?|mmol)?/gi,mm,cands=[];
  while((mm=re.exec(t))){var prev=mm.index>0?t.charAt(mm.index-1):'';if(/[a-z]/i.test(prev))continue;cands.push(mm);}
  var m=cands.filter(function(x){return !!x[2];})[0]||cands[cands.length-1]||null,dose=null,unit=c.unit,note=null;
  if(m){dose=parseFloat(m[1]);var u=(m[2]||'').toLowerCase();
    if(u==='iu'&&c.altUnits&&c.altUnits.IU){dose=dose*c.altUnits.IU;note=m[1]+' IU = '+round(dose,1)+' '+c.unit;}
    else if((u==='mcg'||u==='ug'||u==='\u00b5g')&&c.unit==='mg')dose=dose/1000;
    else if(u==='mg'&&c.unit==='g')dose=dose/1000;
    else if(u==='g'&&c.unit==='mg')dose=dose*1000;
    else if(/scoop/.test(u)&&c.unit==='g')dose=dose*30;}
  return {id:best.id,label:c.label,dose:dose,unit:unit,resolved:true,note:note};
}
function supplementIntakes(from,to){
  return DB.observations.filter(function(o){return o.type==='supplement'&&!o.retracted&&o.date>=from&&o.date<=to;}).map(function(o){
    var m=o.meta||{};if(m.supplementId)return {date:o.date,id:m.supplementId,dose:m.dose!=null?+m.dose:null,unit:m.unit||null,obsId:o.id};
    var r=resolveSupplement(o.value||o.note||'');return {date:o.date,id:r&&r.id,dose:r&&r.dose,unit:r&&r.unit,obsId:o.id,text:o.value};});}
/* nutrient contributions of one intake */
function supplementNutrients(x){var c=x&&x.id?SUPPLEMENT_CATALOGUE[x.id]:null,out={};if(!c)return out;var d=x.dose!=null?x.dose:c.dose[0];
  Object.keys(c.per||{}).forEach(function(k){out[k]=(out[k]||0)+c.per[k]*d;});
  if(c.food){if(c.food.proteinPerG)out.protein=c.food.proteinPerG*d;if(c.food.sodiumPerUnit)out.sodium=c.food.sodiumPerUnit*d;if(c.food.potassiumPerUnit)out.potassium=c.food.potassiumPerUnit*d;}
  return out;}

/* ---- THE REGIMEN (stack) and adherence ---- */
function supplementStack(){return (DB.settings.supplementStack||[]).filter(function(s){return SUPPLEMENT_CATALOGUE[s.id];});}
function setSupplementStack(list){DB.settings.supplementStack=list.filter(function(s){return SUPPLEMENT_CATALOGUE[s.id];}).map(function(s){return {id:s.id,dose:s.dose!=null?+s.dose:SUPPLEMENT_CATALOGUE[s.id].dose[0],unit:SUPPLEMENT_CATALOGUE[s.id].unit,when:s.when||'daily'};});save('settings');return {status:'ok'};}
/* a training day is whatever the schedule places a lifting session on — weekly, rotating shifts or irregular */
function _stackDue(s,date){if(s.when==='training days'){var p=typeof scheduledPlan==='function'&&typeof trainingProgram==='function'?scheduledPlan(date,trainingProgram()):null;return !!(p&&p.kind==='lift');}return true;}
function supplementAdherence(days){days=days||14;var S=supplementStack();if(!S.length)return {status:'none',note:'No regimen set.'};
  var from=addDays(todayISO(),-(days-1)),taken=supplementIntakes(from,todayISO()),rows=S.map(function(s){var due=0,hit=0;
    for(var i=0;i<days;i++){var d=addDays(todayISO(),-i);if(!_stackDue(s,d))continue;due++;if(taken.some(function(t){return t.date===d&&t.id===s.id;}))hit++;}
    return {id:s.id,label:SUPPLEMENT_CATALOGUE[s.id].label,dose:s.dose,unit:s.unit,when:s.when,due:due,taken:hit,pct:due?Math.round(100*hit/due):null,today:taken.some(function(t){return t.date===todayISO()&&t.id===s.id;})};});
  return {status:'ok',cls:'DERIVED',days:days,rows:rows,overall:rows.reduce(function(a,r){return a+r.taken;},0)/Math.max(1,rows.reduce(function(a,r){return a+r.due;},0))};}
function logSupplementStack(date){date=date||todayISO();var already=supplementIntakes(date,date),n=0;
  supplementStack().forEach(function(s){if(!_stackDue(s,date)||already.some(function(t){return t.id===s.id;}))return;
    addObservation({type:'supplement',date:date,value:SUPPLEMENT_CATALOGUE[s.id].label+' '+s.dose+' '+s.unit,source:'manual',meta:{supplementId:s.id,dose:s.dose,unit:s.unit,fromStack:true}});n++;});
  return {status:'ok',logged:n};}

/* ---- MICRONUTRIENT COVERAGE: food + supplements, 7 days, against reference intakes and upper limits ----
   Refused, not guessed, when most logged food carries no vitamin data (branded foods often do not): a "shortfall"
   would then only mean "unrecorded". Upper limits are checked against the scope they apply to. */
function micronutrientCoverage(days){
  days=days||7;var from=addDays(todayISO(),-(days-1)),logs=[];for(var di=0;di<days;di++){logs=logs.concat(foodLogsOn(addDays(todayISO(),-di)));}   /* the Food screen's own entries, edits and retractions applied */
  /* food is averaged over days with food logged, supplements over the window: mixing them diluted food several-fold */
  /* completeness is PER NUTRIENT: the share of logged energy from foods that report that nutrient. A food carrying iron
     but no vitamin C value said nothing about vitamin C, and was read as zero ("0% vitamin C" meant "no data"). */
  var tot={},sup={},kAll=0,kWithK={},daysSeen={},foodDays={};
  logs.forEach(function(e){daysSeen[e.date]=1;foodDays[e.date]=1;var n=e.nutrients||{};
    kAll+=n.kcal||0;Object.keys(MICRONUTRIENTS).forEach(function(k){if(n[k]!=null)kWithK[k]=(kWithK[k]||0)+(n.kcal||0);});
    Object.keys(MICRONUTRIENTS).forEach(function(k){if(n[k]!=null)tot[k]=(tot[k]||0)+n[k];});});
  var food={};Object.keys(tot).forEach(function(k){food[k]=tot[k];});
  supplementIntakes(from,todayISO()).forEach(function(x){daysSeen[x.date]=1;var n=supplementNutrients(x);Object.keys(n).forEach(function(k){if(MICRONUTRIENTS[k]){tot[k]=(tot[k]||0)+n[k];sup[k]=(sup[k]||0)+n[k];}});});
  var nd=Object.keys(daysSeen).length,nf=Object.keys(foodDays).length;if(!nd)return {status:'insufficient',cls:'DERIVED',need:['food or supplements logged this week']};
  var compK=function(k){return kAll?(kWithK[k]||0)/kAll:0;},enoughFood=nf>=3,rows=Object.keys(MICRONUTRIENTS).map(function(k){var completeness=compK(k);var T=micronutrientTarget(k),sAvg=(sup[k]||0)/days,avg=(nf?(food[k]||0)/nf:0)+sAvg,m=MICRONUTRIENTS[k];
    var ulBase=T.ul==null?null:(m.ulScope==='total'?avg:sAvg),over=T.ul!=null&&ulBase>T.ul;
    return {key:k,label:T.label,unit:T.unit,avg:round(avg,m.unit==='mg'&&avg>=100?0:1),fromSupplements:round(sAvg,1),target:T.target,kind:T.kind,pct:T.target?Math.round(100*avg/T.target):null,ul:T.ul,ulScope:T.ulScope,overUL:over,
      completeness:round(completeness,2),judged:m.foodData?(completeness>=0.6&&enoughFood):sAvg>0,why:m.foodData?(!enoughFood?'fewer than 3 days of food logged':(completeness<0.6?'no data in most of the foods you logged':null)):(sAvg>0?'from supplements only (food data does not carry it)':'food data does not carry it')};});
  var judgedFood=rows.filter(function(r){return MICRONUTRIENTS[r.key].foodData&&r.judged;}),unjudged=rows.filter(function(r){return MICRONUTRIENTS[r.key].foodData&&!r.judged;}),completeness=judgedFood.length/Math.max(1,judgedFood.length+unjudged.length);
  var low=rows.filter(function(r){return r.judged&&r.pct!=null&&r.pct<67&&MICRONUTRIENTS[r.key].foodData;}),overs=rows.filter(function(r){return r.overUL;});
  return {status:'ok',cls:'DERIVED',days:days,foodDays:nf,completeness:round(completeness,2),rows:rows,low:low.map(function(r){return r.key;}),overUL:overs.map(function(r){return r.key;}),
    unjudged:unjudged.map(function(r){return r.key;}),
    verdict:!enoughFood?('Food is logged on '+nf+' day'+(nf===1?'':'s')+' this week: at least 3 are needed to judge gaps from food. Upper limits from supplements are still checked.'):(!judgedFood.length?'The foods logged this week carry no vitamin or mineral data, so gaps cannot be judged from food. Upper limits from supplements are still checked.':
      (overs.length?('Above the upper limit: '+overs.map(function(r){return r.label;}).join(', ')+'.'):(low.length?('Below two-thirds of the reference on average: '+low.map(function(r){return r.label;}).join(', ')+'.'):'Reference intakes met or close on average.')+(unjudged.length?(' Not judged (no data in the foods logged): '+unjudged.map(function(r){return r.label;}).join(', ')+'.'):''))),
    method:'NASEM reference intakes by age and sex; 7-day average of food (FoodData Central values) plus supplements (catalogue content)',limits:'Reference intakes are for populations; a shortfall in the record is not a deficiency in you. Blood tests measure status.'};
}

/* ---- EVIDENCE-GRADED GUIDANCE from the catalogue, the regimen and the diet ---- */
function supplementAdvice(){
  var S=supplementStack(),ids=S.map(function(s){return s.id;}),diet=(prof()||{}).dietRestrictions||(DB.settings.constraints||{}).dietRestrictions||[],out=[],cov=micronutrientCoverage(7);
  S.forEach(function(s){var c=SUPPLEMENT_CATALOGUE[s.id],d=s.dose;var inRange=d>=c.dose[0]*0.8&&d<=c.dose[1]*1.25;
    out.push({id:s.id,label:c.label,kind:'in your regimen',evidence:c.evidence,dose:d+' '+c.unit,note:inRange?'Within the usual range ('+c.dose[0]+'\u2013'+c.dose[1]+' '+c.unit+').':('Outside the usual range ('+c.dose[0]+'\u2013'+c.dose[1]+' '+c.unit+').'),cautions:c.cautions,source:c.source});});
  if((Array.isArray(diet)?diet:[diet]).indexOf('vegan')>=0&&ids.indexOf('b12')<0&&ids.indexOf('multivitamin')<0)out.push({id:'b12',label:'Vitamin B12',kind:'worth considering',evidence:SUPPLEMENT_CATALOGUE.b12.evidence,note:'A vegan diet has almost no B12: a supplement or fortified foods are needed.',cautions:[],source:SUPPLEMENT_CATALOGUE.b12.source});
  if(ids.indexOf('creatine')<0)out.push({id:'creatine',label:'Creatine monohydrate',kind:'worth considering',evidence:SUPPLEMENT_CATALOGUE.creatine.evidence,note:'The most consistently supported supplement for strength training.',cautions:SUPPLEMENT_CATALOGUE.creatine.cautions,source:SUPPLEMENT_CATALOGUE.creatine.source});
  if(cov.status==='ok'&&cov.low.indexOf('vitd')>=0&&ids.indexOf('vitd')<0)out.push({id:'vitd',label:'Vitamin D',kind:'test first',evidence:SUPPLEMENT_CATALOGUE.vitd.evidence,note:'Food rarely supplies enough; a blood test tells you whether to supplement.',cautions:SUPPLEMENT_CATALOGUE.vitd.cautions,source:SUPPLEMENT_CATALOGUE.vitd.source});
  if(cov.status==='ok'&&cov.low.indexOf('iron')>=0)out.push({id:'iron',label:'Iron',kind:'test first',evidence:SUPPLEMENT_CATALOGUE.iron.evidence,note:'Low iron in the record: check with a blood test before taking any.',cautions:SUPPLEMENT_CATALOGUE.iron.cautions,source:SUPPLEMENT_CATALOGUE.iron.source});
  return {status:'ok',cls:'POLICY',items:out,interactions:supplementInteractions(),framing:typeof REF_SUPPLEMENTS!=='undefined'?REF_SUPPLEMENTS.framing:''};
}


/* ============================================================================
   EXPANSION: more micronutrients, about 50 more supplements, and interactions. Grades stay honest where the evidence is
   weak or negative (saw palmetto failed large trials; pygeum rests on older, small ones), and the cautions that matter
   most \u2014 liver injury, lab-test interference, drug and serotonin interactions \u2014 are carried with each entry.
   ============================================================================ */
Object.assign(MICRONUTRIENTS,{
  copper:{label:'Copper',unit:'\u00b5g',rda:[900,900],ul:10000,ulScope:'total',foodData:false},
  manganese:{label:'Manganese',unit:'mg',rda:[2.3,1.8],ai:true,ul:11,ulScope:'total',foodData:false},
  chromium:{label:'Chromium',unit:'\u00b5g',rda:[35,25],ai:true,ul:null,foodData:false},
  biotin:{label:'Biotin',unit:'\u00b5g',rda:[30,30],ai:true,ul:null,foodData:false},
  pantothenic:{label:'Pantothenic acid (B5)',unit:'mg',rda:[5,5],ai:true,ul:null,foodData:false},
  choline:{label:'Choline',unit:'mg',rda:[550,425],ai:true,ul:3500,ulScope:'total',foodData:false},
  molybdenum:{label:'Molybdenum',unit:'\u00b5g',rda:[45,45],ul:2000,ulScope:'total',foodData:false}
});
function _S(label,aliases,unit,dose,evidence,cautions,source,extra){return Object.assign({label:label,aliases:aliases,unit:unit,dose:dose,evidence:evidence,cautions:cautions||[],test:null,source:source||'NIH ODS'},extra||{});}
Object.assign(SUPPLEMENT_CATALOGUE,{
  /* vitamins */
  vita:_S('Vitamin A (retinol)',['vitamin a','retinol','retinyl'],'\u00b5g RAE',[300,900],[['correcting a deficiency','A'],['benefit when not deficient','D']],['Preformed vitamin A above 3,000 \u00b5g a day is over the upper limit; avoid high doses in pregnancy.'],'NASEM DRI',{per:{vita:1}}),
  vite:_S('Vitamin E',['vitamin e','tocopherol'],'mg',[15,100],[['correcting a deficiency (rare)','A'],['heart disease or cancer prevention','D']],['High doses raise bleeding risk, especially with blood thinners.'],'NASEM DRI; NIH ODS',{per:{vite:1}}),
  vitk1:_S('Vitamin K1',['vitamin k','vitamin k1','phylloquinone'],'\u00b5g',[90,120],[['correcting low intake','A']],['On warfarin: keep vitamin K steady and tell your clinician.'],'NASEM DRI',{per:{vitk:1}}),
  vitk2:_S('Vitamin K2 (MK-7)',['vitamin k2','k2','mk-7','mk7','menaquinone'],'\u00b5g',[90,200],[['bone density','C'],['arterial calcification','D']],['On warfarin: ask your clinician before taking it.'],'NIH ODS',{per:{vitk:1}}),
  bcomplex:_S('B-complex (typical label)',['b complex','b-complex','vitamin b complex','b-50'],'tablet',[1,1],[['filling gaps in a restricted diet','B'],['energy when not deficient','D']],['Contents vary: these are typical label amounts.','Bright yellow urine is riboflavin, and harmless.'],'NIH ODS',{typical:true,per:{thiamin:50,riboflavin:50,niacin:50,vitb6:50,folate:680,vitb12:50,biotin:50,pantothenic:50}}),
  thiamin:_S('Thiamin (B1)',['thiamin','thiamine','b1','benfotiamine'],'mg',[1.2,100],[['correcting a deficiency','A']],[],'NASEM DRI',{per:{thiamin:1}}),
  riboflavin:_S('Riboflavin (B2)',['riboflavin','b2'],'mg',[1.3,400],[['correcting a deficiency','A'],['migraine prevention at 400 mg','B']],[],'NASEM DRI; AAN',{per:{riboflavin:1}}),
  niacin:_S('Niacin (B3)',['niacin','nicotinic acid','b3','niacinamide','nicotinamide'],'mg',[14,35],[['correcting a deficiency','A'],['raising HDL (no fewer heart events in large trials)','D']],['Flushing is common; high doses can harm the liver. Above 35 mg from supplements is over the upper limit.'],'NASEM DRI; AIM-HIGH, HPS2-THRIVE',{per:{niacin:1}}),
  b6:_S('Vitamin B6',['vitamin b6','b6','pyridoxine','p5p'],'mg',[1.3,25],[['correcting a deficiency','A']],['Long-term high doses can cause nerve damage; the upper limit is 100 mg (lower in Europe).'],'NASEM DRI; EFSA',{per:{vitb6:1}}),
  biotin:_S('Biotin',['biotin','vitamin h','b7'],'\u00b5g',[30,10000],[['correcting a deficiency (rare)','A'],['hair, skin and nails without deficiency','D']],['Biotin distorts many blood tests (thyroid, troponin and others): tell your clinician before any test.'],'FDA safety communication; NIH ODS',{per:{biotin:1}}),
  b5:_S('Pantothenic acid (B5)',['pantothenic acid','b5','pantethine'],'mg',[5,500],[['correcting a deficiency (very rare)','A'],['acne or cholesterol','D']],[],'NIH ODS',{per:{pantothenic:1}}),
  choline:_S('Choline',['choline','choline bitartrate','citicoline'],'mg',[250,550],[['reaching intake (low in many diets)','B']],['Above 3,500 mg a day: fishy body odour and low blood pressure.'],'NASEM DRI',{per:{choline:1}}),
  /* minerals */
  copper:_S('Copper',['copper','copper gluconate','copper bisglycinate'],'mg',[0.9,2],[['correcting low intake, or balancing high-dose zinc','A']],['Above 10 mg a day is over the upper limit.'],'NASEM DRI',{per:{copper:1000}}),
  manganese:_S('Manganese',['manganese'],'mg',[1.8,5],[['correcting low intake (rare)','A'],['benefit otherwise','D']],['Above 11 mg a day is over the upper limit.'],'NASEM DRI',{per:{manganese:1}}),
  chromium:_S('Chromium',['chromium','chromium picolinate'],'\u00b5g',[25,1000],[['blood sugar control','C'],['body composition','D']],['On diabetes medicine: it may add to its effect.'],'NIH ODS',{per:{chromium:1}}),
  selenium:_S('Selenium',['selenium','selenomethionine'],'\u00b5g',[55,200],[['correcting low intake','A'],['cancer prevention','D']],['Above 400 \u00b5g a day is over the upper limit; brazil nuts alone can exceed it.'],'NASEM DRI',{per:{selenium:1}}),
  iodine:_S('Iodine',['iodine','potassium iodide','kelp'],'\u00b5g',[150,150],[['correcting low intake','A']],['Thyroid conditions: ask a clinician; kelp products vary wildly in dose.'],'NASEM DRI',{per:{iodine:1}}),
  potassium:_S('Potassium',['potassium','potassium citrate','potassium chloride'],'mg',[99,99],[['reaching intake','B']],['Kidney disease or blood-pressure medicines (ACE inhibitors, some diuretics): ask a clinician.'],'NASEM DRI',{per:{potassium:1}}),
  molybdenum:_S('Molybdenum',['molybdenum'],'\u00b5g',[45,45],[['correcting a deficiency (very rare)','A']],[],'NASEM DRI',{per:{molybdenum:1}}),
  boron:_S('Boron',['boron'],'mg',[1,3],[['testosterone or bone','D']],['Above 20 mg a day is over the upper limit.'],'NASEM DRI'),
  zma:_S('ZMA (zinc, magnesium, B6)',['zma'],'serving',[1,1],[['sleep or testosterone when not deficient','D']],['A serving holds about 30 mg of zinc: with other zinc, watch the 40 mg upper limit and copper.'],'NIH ODS',{per:{zinc:30,magnesium:450,vitb6:10.5}}),
  /* performance and body composition */
  citrulline:_S('Citrulline malate',['citrulline','l-citrulline','citrulline malate'],'g',[6,8],[['repetitions in resistance training','C'],['endurance','D']],[],'ISSN; NIH ODS 2024'),
  arginine:_S('Arginine',['arginine','l-arginine'],'g',[3,6],[['performance','D']],['Gut upset at higher doses.'],'NIH ODS 2024'),
  glutamine:_S('Glutamine',['glutamine','l-glutamine'],'g',[5,10],[['performance or muscle gain','D']],[],'NIH ODS 2024'),
  bcaa:_S('BCAA',['bcaa','bcaas','branched chain amino acids','leucine'],'g',[5,10],[['muscle gain when protein is adequate','D']],['Whole protein supplies the same amino acids plus the rest.'],'ISSN 2017; NIH ODS 2024'),
  eaa:_S('Essential amino acids',['eaa','eaas','essential amino acids'],'g',[10,15],[['muscle protein synthesis on low-protein days','C']],[],'ISSN 2017'),
  hmb:_S('HMB',['hmb','beta-hydroxy beta-methylbutyrate'],'g',[3,3],[['strength in untrained people starting out','C'],['trained lifters','D']],[],'ISSN 2013; NIH ODS 2024'),
  taurine:_S('Taurine',['taurine'],'g',[1,3],[['performance','C']],[],'NIH ODS 2024'),
  carnitine:_S('L-carnitine',['carnitine','l-carnitine','acetyl-l-carnitine','alcar'],'g',[1,3],[['fat loss','D'],['recovery','C']],['High doses raise TMAO; fishy odour.'],'NIH ODS 2024'),
  sodiumcitrate:_S('Sodium citrate',['sodium citrate'],'g',[20,35],[['high-intensity efforts','C']],['Very high sodium; gut distress.'],'NIH ODS 2024'),
  /* recovery, joints, general health */
  coq10:_S('Coenzyme Q10',['coq10','coenzyme q10','ubiquinol','ubiquinone'],'mg',[100,300],[['statin-related muscle aches','C'],['performance','D']],['May lower the effect of warfarin.'],'NIH NCCIH'),
  collagen:_S('Collagen peptides',['collagen','collagen peptides','gelatin'],'g',[10,15],[['joint pain','C'],['tendon collagen with vitamin C before loading','C']],['It is protein, but incomplete: it does not count toward muscle-building protein targets.'],'NIH NCCIH'),
  glucosamine:_S('Glucosamine',['glucosamine','glucosamine sulfate'],'mg',[1500,1500],[['knee osteoarthritis pain','C']],['Shellfish allergy; may raise the effect of warfarin.'],'NIH NCCIH'),
  chondroitin:_S('Chondroitin',['chondroitin'],'mg',[800,1200],[['osteoarthritis pain','C']],['May raise the effect of warfarin.'],'NIH NCCIH'),
  curcumin:_S('Turmeric / curcumin',['turmeric','curcumin','meriva'],'mg',[500,1500],[['joint pain','C'],['recovery','C']],['Reports of liver injury, often with absorption enhancers (piperine); gallstones; blood thinners.'],'NIH NCCIH; LiverTox'),
  ginger:_S('Ginger',['ginger'],'g',[1,2],[['nausea','B'],['muscle soreness','C']],['Blood thinners: ask your clinician.'],'NIH NCCIH'),
  probiotic:_S('Probiotic',['probiotic','probiotics','lactobacillus','bifidobacterium'],'serving',[1,1],[['antibiotic-associated diarrhoea','B'],['general health','D']],['Effects depend on the strain; weakened immune systems: ask a clinician.'],'NIH NCCIH'),
  psyllium:_S('Psyllium fibre',['psyllium','metamucil','ispaghula','fibre supplement','fiber supplement'],'g',[5,10],[['lowering LDL cholesterol','A'],['regularity','A'],['fullness','C']],['Take with plenty of water, and apart from medicines by 2 hours.'],'FDA health claim; NIH NCCIH',{food:{kcalPerG:0}}),
  lutein:_S('Lutein and zeaxanthin',['lutein','zeaxanthin','areds'],'mg',[10,10],[['slowing advanced macular degeneration (AREDS2 formula)','B']],[],'AREDS2'),
  tartcherry:_S('Tart cherry',['tart cherry','montmorency'],'serving',[1,2],[['recovery after hard sessions','C'],['sleep','C']],['Juice concentrate carries sugar and calories.'],'NIH ODS 2024'),
  spirulina:_S('Spirulina',['spirulina','chlorella'],'g',[1,5],[['health or performance','D']],['Contamination (microcystins) in some products; autoimmune conditions.'],'NIH NCCIH'),
  inositol:_S('Myo-inositol',['inositol','myo-inositol'],'g',[2,4],[['insulin resistance in PCOS','B']],[],'NIH NCCIH'),
  nac:_S('N-acetylcysteine',['nac','n-acetylcysteine','n-acetyl cysteine'],'mg',[600,1200],[['performance','D']],['High-dose antioxidants may blunt training adaptations.'],'NIH ODS 2024'),
  /* sleep, stress and focus */
  theanine:_S('L-theanine',['theanine','l-theanine','suntheanine'],'mg',[100,200],[['calm focus with caffeine','B'],['sleep quality','C']],[],'NIH NCCIH',{test:['sleep','sleep duration']}),
  ashwagandha:_S('Ashwagandha',['ashwagandha','withania','ksm-66','sensoril'],'mg',[300,600],[['stress and anxiety scores','B'],['sleep','C'],['strength','C']],['Rare liver injury; thyroid conditions or thyroid medicine; pregnancy; sedatives. Stop and see a clinician if you notice yellowing skin or dark urine.'],'NIH NCCIH; LiverTox',{test:['sleep','sleep duration']}),
  rhodiola:_S('Rhodiola rosea',['rhodiola','rhodiola rosea','golden root'],'mg',[200,600],[['fatigue under stress','C']],['Bipolar disorder: may trigger mania.'],'NIH NCCIH'),
  glycine:_S('Glycine',['glycine'],'g',[3,3],[['sleep quality','C']],[],'NIH NCCIH',{test:['sleep','sleep duration']}),
  valerian:_S('Valerian',['valerian','valerian root'],'mg',[300,600],[['sleep','C']],['Adds to sedatives and alcohol; do not drive if drowsy.'],'NIH NCCIH',{test:['sleep','sleep duration']}),
  htp:_S('5-HTP',['5-htp','5htp','hydroxytryptophan'],'mg',[50,300],[['mood or appetite','D']],['With antidepressants (SSRIs, SNRIs, MAOIs), triptans or St John\u2019s wort: risk of serotonin syndrome. Do not combine without a clinician.'],'NIH NCCIH'),
  stjohns:_S('St John\u2019s wort',['st john','st johns wort','hypericum'],'mg',[300,900],[['mild to moderate depression','B']],['Interacts with many medicines \u2014 contraceptives, antidepressants, warfarin, HIV and transplant drugs. Do not take without a clinician.'],'NIH NCCIH'),
  alphagpc:_S('Alpha-GPC',['alpha-gpc','alpha gpc','glycerophosphocholine'],'mg',[300,600],[['power output','C'],['cognition','D']],[],'NIH ODS 2024',{per:{choline:0.4}}),
  lionsmane:_S('Lion\u2019s mane',['lions mane','lion\'s mane','hericium'],'mg',[500,3000],[['cognition','D']],[],'NIH NCCIH'),
  cordyceps:_S('Cordyceps',['cordyceps'],'g',[1,3],[['endurance','D']],[],'NIH ODS 2024'),
  /* hormonal and prostate claims: honest grades, careful cautions */
  pygeum:_S('Pygeum africanum',['pygeum','african plum','prunus africana'],'mg',[100,200],[['urinary symptoms of an enlarged prostate','C']],['Small, older trials. New urinary symptoms need a clinician first: other causes must be ruled out.'],'Cochrane review; NIH NCCIH'),
  sawpalmetto:_S('Saw palmetto',['saw palmetto','serenoa'],'mg',[320,320],[['urinary symptoms of an enlarged prostate','D']],['Large trials found it no better than placebo. See a clinician for urinary symptoms.'],'Cochrane review; CAMUS trial'),
  tongkat:_S('Tongkat ali',['tongkat','tongkat ali','eurycoma','longjack'],'mg',[200,400],[['testosterone in men with low levels','C']],['Products vary and some are contaminated with heavy metals.'],'NIH NCCIH'),
  fenugreek:_S('Fenugreek',['fenugreek','testofen'],'mg',[500,600],[['testosterone or strength','C'],['blood sugar','C']],['May add to diabetes medicine and blood thinners; pregnancy.'],'NIH NCCIH'),
  dhea:_S('DHEA',['dhea','dehydroepiandrosterone'],'mg',[25,50],[['body composition or strength','D']],['A hormone: prescription-only in several countries and banned in sport (WADA). Hormone-sensitive conditions: do not take.'],'NIH NCCIH; WADA'),
  /* weight-loss claims, with the warnings that matter */
  berberine:_S('Berberine',['berberine'],'mg',[500,1500],[['blood sugar control','B'],['weight loss','C']],['Interacts with many medicines (metformin and other diabetes drugs, drugs processed by CYP enzymes); pregnancy.'],'NIH NCCIH'),
  greentea:_S('Green tea extract (EGCG)',['green tea extract','egcg','green tea'],'mg',[250,500],[['fat loss','D']],['Liver injury has been reported; EFSA advises against 800 mg EGCG a day or more, and against taking it fasted.'],'EFSA 2018; LiverTox'),
  yohimbine:_S('Yohimbine',['yohimbine','yohimbe'],'mg',[5,10],[['fat loss','D']],['Raises blood pressure and heart rate; anxiety. Heart conditions: do not take. Restricted in some countries.'],'NIH NCCIH'),
  cla:_S('CLA',['cla','conjugated linoleic acid'],'g',[3,4],[['fat loss','D']],['Gut upset; may worsen insulin sensitivity.'],'NIH ODS')
});
/* INTERACTIONS among what is in the regimen (or logged this week). Medicines are not tracked here, so medicine cautions
   stay with each supplement as "if you take \u2026". */
var SUPPLEMENT_INTERACTIONS=[
  {all:['zinc'],test:function(S){var z=S.zinc||0;return z>25&&!S.copper;},level:'caution',text:'High-dose zinc without copper can cause copper deficiency: consider 1\u20132 mg of copper, or less zinc.'},
  {all:['zma'],test:function(S){return (S.zinc||0)>25&&!S.copper;},level:'caution',text:'ZMA supplies about 30 mg of zinc: over time, add copper or reduce zinc.'},
  {all:['iron','calcium'],level:'timing',text:'Calcium reduces iron absorption: take them at least 2 hours apart.'},
  {all:['iron','coffee'],level:'timing',text:'Coffee and tea reduce iron absorption.'},
  {all:['caffeine','theanine'],level:'note',text:'Caffeine with L-theanine is a common pairing; the calm-focus evidence is moderate.'},
  {all:['htp','stjohns'],level:'danger',text:'5-HTP with St John\u2019s wort risks serotonin syndrome. Do not combine.'},
  {any:['omega3','curcumin','ginger','vite','glucosamine','chondroitin'],min:2,level:'caution',text:'Several of these add to bleeding risk: take care with blood thinners or before surgery.'},
  {any:['greentea','ashwagandha','curcumin','niacin'],min:2,level:'caution',text:'More than one supplement with reports of liver injury: watch for yellowing skin or dark urine.'},
  {all:['yohimbine','caffeine'],level:'caution',text:'Yohimbine with caffeine stacks increases in heart rate and blood pressure.'},
  {any:['melatonin','valerian','glycine','ashwagandha'],min:2,level:'note',text:'Several sleep aids together: start one at a time to know which helps.'},
  {all:['biotin'],level:'caution',text:'Biotin distorts many blood tests: stop it 2\u20133 days before a test, or tell the lab.'},
  {any:['vitk1','vitk2'],min:1,level:'caution',text:'Vitamin K changes how warfarin works: keep it steady and tell your clinician.'}
];
function supplementInteractions(ids){
  var set={},doses={};(ids||supplementStack().map(function(s){return s.id;})).forEach(function(i){set[i]=1;});
  supplementStack().forEach(function(s){var c=SUPPLEMENT_CATALOGUE[s.id];if(!c)return;var n=supplementNutrients({id:s.id,dose:s.dose});Object.keys(n).forEach(function(k){doses[k]=(doses[k]||0)+n[k];});});
  if(set.zinc||set.zma)doses.zinc=doses.zinc||0;if(set.copper)doses.copper=doses.copper||1;
  return SUPPLEMENT_INTERACTIONS.filter(function(r){if(r.all&&!r.all.every(function(i){return set[i]||(i==='coffee'&&set.caffeine);}))return false;
    if(r.any&&r.any.filter(function(i){return set[i];}).length<(r.min||1))return false;return r.test?r.test(doses):true;}).map(function(r){return {level:r.level,text:r.text};});
}

/* ---- registration ---- */
(function(){if(typeof MODELS==='undefined')return;[
  {id:'micronutrient_coverage',name:'Micronutrient coverage',cls:'DERIVED',version:'1.0',inputs:['calories','supplement'],minN:1,assumes:['food micronutrient values are complete where present','catalogue content matches the product'],failsWhen:['most logged food lacks vitamin data','products that differ from typical labels'],output:'7-day intake vs reference intakes and upper limits',consumers:['supplementsCard'],freshnessDays:7,uncertainty:{kind:'data completeness'},fn:'micronutrientCoverage'},
  {id:'supplement_adherence',name:'Supplement adherence',cls:'DERIVED',version:'1.0',inputs:['supplement'],minN:1,assumes:['a logged dose was taken'],failsWhen:['doses taken but not logged'],output:'taken vs due, per supplement',consumers:['supplementsCard'],freshnessDays:14,uncertainty:{kind:'count'},fn:'supplementAdherence'}
].forEach(function(m){if(!MODELS.some(function(x){return x.id===m.id;}))MODELS.push(m);});})();
