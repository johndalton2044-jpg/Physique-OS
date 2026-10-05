/* ============================================================================
   REGION: NUTRITION INTELLIGENCE (catalogue §25.2–§25.4, §59, §60)

   The existing food layer is strong on provenance and basis: it knows the difference between grams,
   millilitres and servings, and it refuses to fabricate mass from volume. What it lacked is the layer above
   that — substituting one food for another while preserving what the meal was FOR, scaling and costing a
   recipe, and reconciling a shopping list against what is already in the cupboard.

   The honesty problem here is preference. A log tells you what somebody ate, which is a function of habit,
   convenience, price and what was in the fridge. Calling that "preference" and optimising against it would
   quietly narrow someone's diet to whatever they happened to eat most in the last two months. So frequency
   is reported as frequency, and every substitution ranks nutritional fit first and familiarity second.
   ============================================================================ */

/* ---------------- §25.2 / §59 SIMILARITY AND SUBSTITUTION ----------------
   Meal role is what a food is FOR: a protein anchor, an energy base, a vegetable, a fat. Substituting a
   protein anchor with something of similar calories but a quarter of the protein preserves the arithmetic
   and destroys the meal. */
var MEAL_ROLES={
  protein:{label:'Protein anchor',test:function(p){return p.kcal&&(p.protein*4/p.kcal)>=0.4;}},
  leanProtein:{label:'Lean protein',test:function(p){return p.kcal&&(p.protein*4/p.kcal)>=0.55&&(p.fat*9/p.kcal)<0.25;}},
  /* An energy base has to actually carry energy. Without the floor, a boiled vegetable at 28 kcal per 100 g
     is mostly carbohydrate by share and was being classified as a starch. */
  energy:{label:'Energy base',test:function(p){return p.kcal>=100&&(p.carbs*4/p.kcal)>=0.55;}},
  fat:{label:'Fat source',test:function(p){return p.kcal&&(p.fat*9/p.kcal)>=0.6;}},
  vegetable:{label:'Vegetable',test:function(p){
    return p.kcal!=null&&p.kcal<=60&&((p.fiber||0)>=1.5||((p.fat||0)*9/Math.max(1,p.kcal))<0.3);}},
  fruit:{label:'Fruit',test:function(p){return p.kcal!=null&&p.kcal<=100&&(p.sugars||0)>=6&&(p.protein||0)<3;}},
  mixed:{label:'Mixed dish',test:function(){return true;}}
};
function mealRole(food){
  var p=(food&&food.per100)||{};
  if(p.kcal==null)return {role:'mixed',label:MEAL_ROLES.mixed.label,confident:false,
    note:'no energy value recorded, so its role cannot be inferred'};
  var order=['leanProtein','protein','fat','vegetable','fruit','energy','mixed'];
  for(var i=0;i<order.length;i++){
    if(MEAL_ROLES[order[i]].test(p))
      return {role:order[i],label:MEAL_ROLES[order[i]].label,confident:order[i]!=='mixed',
        note:order[i]==='mixed'?'does not fall clearly into one role':null};
  }
  return {role:'mixed',label:MEAL_ROLES.mixed.label,confident:false};
}
/* Nutritional distance per 100 kcal, because that is the comparison that survives portion size. */
function nutrientDensity(food){
  var p=(food&&food.per100)||{};
  if(!p.kcal)return null;
  var k=p.kcal/100;
  return {proteinPer100kcal:round((p.protein||0)/k,1),
    fiberPer100kcal:round((p.fiber||0)/k,1),
    fatPer100kcal:round((p.fat||0)/k,1),
    carbsPer100kcal:round((p.carbs||0)/k,1),
    sodiumPer100kcal:p.sodium!=null?round(p.sodium/k,0):null,
    kcalPerGram:round(p.kcal/100,2)};
}
function foodSimilarity(a,b){
  var pa=nutrientDensity(a),pb=nutrientDensity(b);
  if(!pa||!pb)return null;
  /* Weighted on what actually defines a food's job in a meal. Protein density dominates because that is
     what a substitution most often has to preserve. */
  var d=Math.abs(pa.proteinPer100kcal-pb.proteinPer100kcal)*0.045+
        Math.abs(pa.fatPer100kcal-pb.fatPer100kcal)*0.02+
        Math.abs(pa.carbsPer100kcal-pb.carbsPer100kcal)*0.012+
        Math.abs(pa.fiberPer100kcal-pb.fiberPer100kcal)*0.012+
        Math.abs(pa.kcalPerGram-pb.kcalPerGram)*0.18;
  return round(Math.max(0,1-d),3);
}
function _logFrequency(days){
  var freq={},from=addDays(asOf(),-(days||60));
  _liveFoodLogs().filter(function(l){return l.date>=from;}).forEach(function(l){
    if(l.food&&l.food.id)freq[l.food.id]=(freq[l.food.id]||0)+1;});
  return freq;
}
function substituteFood(foodId,opts){
  opts=opts||{};
  var all=localFoods();
  var target=all.filter(function(f){return f.id===foodId;})[0];
  if(!target)return {status:'unknown',note:'that food is not in your list'};
  var role=mealRole(target);
  var freq=_logFrequency(60);
  /* Basis matters: a millilitre food cannot stand in for a gram food without a density, and the food layer
     already refuses to invent one. Rather than silently converting, mismatched-basis foods are excluded and
     the exclusion is reported. */
  var basisExcluded=0;
  var rows=all.filter(function(f){
    if(f.id===foodId)return false;
    if(!f.per100||f.per100.kcal==null)return false;
    if(f.basis!==target.basis&&!(f.density||target.density)){basisExcluded++;return false;}
    if(opts.sameRole!==false&&mealRole(f).role!==role.role)return false;
    return true;
  }).map(function(f){
    var sim=foodSimilarity(target,f);
    return {food:f,similarity:sim,role:mealRole(f).label,
      familiar:freq[f.id]||0,density:nutrientDensity(f)};
  }).filter(function(r){return r.similarity!=null;});
  /* Nutritional fit FIRST, familiarity as a tie-break. Ranking by what someone eats most would narrow the
     diet to their existing habits, which is the opposite of a useful substitution. */
  /* Bucket, then sort. Comparing "within a tolerance, prefer the familiar one" is INTRANSITIVE — A ties B
     and B ties C while A and C do not, which makes the result of a sort undefined and produced a list whose
     printed scores ran 0.965, 0.960, 0.969. Rounding similarity into bands first gives a genuine ordering:
     fit decides the band, familiarity orders within it. */
  rows.forEach(function(r){r.band=Math.round(r.similarity*50);});   // 0.02-wide bands
  rows.sort(function(a,b){
    if(a.band!==b.band)return b.band-a.band;
    if(a.familiar!==b.familiar)return b.familiar-a.familiar;
    return b.similarity-a.similarity;
  });
  var top=rows.slice(0,opts.limit||6);
  if(!top.length)return {status:'none',target:target.name,role:role.label,
    basisExcluded:basisExcluded,
    note:'Nothing in your food list fills the same role. Widening the search beyond the role would return foods that match the calories and not the point of the meal.'};
  return {status:'ok',cls:'DERIVED',target:target.name,targetRole:role.label,
    targetDensity:nutrientDensity(target),
    rows:top.map(function(r){
      return {id:r.food.id,name:r.food.name,similarity:r.similarity,role:r.role,
        familiar:r.familiar,
        proteinPer100kcal:r.density.proteinPer100kcal,
        /* The portion that preserves the thing the food was there for. */
        equivalentGrams:opts.grams?(function(){
          var keep=opts.preserve||(role.role==='protein'||role.role==='leanProtein'?'protein':'kcal');
          var tp=target.per100[keep]||0,fp=r.food.per100[keep]||0;
          if(!fp)return null;
          return Math.round(opts.grams*tp/fp/5)*5;
        })():null};}),
    basisExcluded:basisExcluded,
    note:'Ranked by nutritional fit within the same meal role, with what you already eat used only to break near-ties. Ranking by familiarity first would narrow your diet to your existing habits.',
    caveat:(basisExcluded?(basisExcluded+' food(s) were excluded for having a different measurement basis with no density to convert it. '):'')+
      'Similarity is computed per 100 kcal, which is the comparison that survives portion size. It knows nothing about taste, texture or what you can cook.'};
}
/* ---------------- §60 RECIPES ---------------- */
function recipeNutrition(recipe){
  if(!recipe||!recipe.ingredients||!recipe.ingredients.length)
    return {status:'insufficient',need:['ingredients']};
  var total={kcal:0,protein:0,carbs:0,fat:0,fiber:0},unresolved=[],cost=0,priced=0;
  recipe.ingredients.forEach(function(ing){
    var f=localFoods().filter(function(x){return x.id===ing.foodId;})[0];
    if(!f||!f.per100){unresolved.push(ing.name||ing.foodId);return;}
    var g=num(ing.grams)||0;
    Object.keys(total).forEach(function(k){total[k]+=((f.per100[k]||0)*g/100);});
    if(f.pricePer100!=null){cost+=f.pricePer100*g/100;priced++;}
  });
  var servings=Math.max(1,num(recipe.servings)||1);
  var per={};Object.keys(total).forEach(function(k){per[k]=round(total[k]/servings,1);});
  return {status:'ok',cls:'DERIVED',
    total:Object.keys(total).reduce(function(a,k){a[k]=round(total[k],1);return a;},{}),
    perServing:per,servings:servings,
    cost:priced?round(cost,2):null,costPerServing:priced?round(cost/servings,2):null,
    pricedIngredients:priced,totalIngredients:recipe.ingredients.length,
    unresolved:unresolved,
    note:unresolved.length?(unresolved.length+' ingredient(s) are not in your food list, so the totals below are incomplete and are not adjusted to pretend otherwise.'):
      'Computed from your food list at the quantities given.'};
}
function scaleRecipe(recipe,servings){
  if(!recipe)return null;
  var from=Math.max(1,num(recipe.servings)||1);
  var to=Math.max(1,num(servings)||from);
  var k=to/from;
  return Object.assign({},recipe,{servings:to,
    ingredients:(recipe.ingredients||[]).map(function(i){
      return Object.assign({},i,{grams:round((num(i.grams)||0)*k,0)});}),
    scaledFrom:from,
    note:k!==1?('Scaled '+(k>1?'up':'down')+' from '+from+' servings. Cooking times do not scale linearly and this does not adjust them.'):null});
}
/* §25.3 optimisation: change one ingredient at a time, toward a stated objective, and show the trade. */
function optimiseRecipe(recipe,objective){
  objective=objective||'protein';
  var base=recipeNutrition(recipe);
  if(base.status!=='ok')return base;
  var suggestions=[];
  (recipe.ingredients||[]).forEach(function(ing){
    var sub=substituteFood(ing.foodId,{grams:num(ing.grams)||0});
    if(sub.status!=='ok')return;
    sub.rows.slice(0,3).forEach(function(r){
      var f=localFoods().filter(function(x){return x.id===r.id;})[0];
      var orig=localFoods().filter(function(x){return x.id===ing.foodId;})[0];
      if(!f||!orig)return;
      var g=r.equivalentGrams||num(ing.grams)||0;
      var delta={};
      ['kcal','protein','carbs','fat','fiber'].forEach(function(k){
        delta[k]=round(((f.per100[k]||0)*g/100)-((orig.per100[k]||0)*(num(ing.grams)||0)/100),1);});
      var gain=objective==='protein'?delta.protein:
        (objective==='calories'?-delta.kcal:(objective==='fiber'?delta.fiber:
         (objective==='cost'&&f.pricePer100!=null&&orig.pricePer100!=null?
           -(f.pricePer100*g/100-orig.pricePer100*(num(ing.grams)||0)/100):0)));
      if(gain>0)suggestions.push({replace:orig.name,with:f.name,grams:g,gain:round(gain,1),
        objective:objective,delta:delta,similarity:r.similarity});
    });
  });
  suggestions.sort(function(a,b){return b.gain-a.gain;});
  return {status:'ok',cls:'DERIVED',objective:objective,base:base,
    suggestions:suggestions.slice(0,6),
    note:'One ingredient at a time, so the effect of a change is attributable. Each row shows what every macro does, not only the one being optimised \u2014 an optimisation that reports only its objective hides what it cost.',
    caveat:'Nothing here knows how the dish tastes, whether the substitution cooks the same way, or whether you would eat it.'};
}
/* ---------------- §25.4 GROCERY AGAINST INVENTORY ---------------- */
function groceryAgainstInventory(plan,days){
  var list=groceryList(plan,days||7);
  if(!list)return null;
  var inv=(DB.settings.inventory||[]).filter(function(i){return !i.removedAt;});
  var rows=list.rows.map(function(r){
    var have=inv.filter(function(i){
      return i.foodId&&plan.candidates[0].items.some(function(it){
        return it.food.name===r.name&&it.food.id===i.foodId;});})[0];
    var stock=have?(num(have.remaining)||0):0;
    var need=Math.max(0,r.grams-stock);
    return {name:r.name,needed:r.grams,inStock:stock,toBuy:Math.round(need),
      covered:stock>=r.grams,cost:r.cost};
  });
  var buying=rows.filter(function(r){return r.toBuy>0;});
  return {days:days||7,rows:rows,buying:buying.length,covered:rows.length-buying.length,
    cls:'DERIVED',
    note:rows.some(function(r){return r.inStock>0;})?
      'Quantities reduced by what your tracked inventory says you already have.':
      'Nothing in your tracked inventory matches this plan, so the full quantities are listed.',
    caveat:list.caveat};
}
/* §59 preference: reported as frequency, because that is what it is. */
function foodFrequency(days){
  days=days||60;
  var freq=_logFrequency(days);
  var all=localFoods();
  var rows=Object.keys(freq).map(function(id){
    var f=all.filter(function(x){return x.id===id;})[0];
    if(!f)return null;
    return {id:id,name:f.name,times:freq[id],role:mealRole(f).label,
      density:nutrientDensity(f)};
  }).filter(Boolean).sort(function(a,b){return b.times-a.times;});
  return {days:days,rows:rows.slice(0,20),distinct:rows.length,cls:'MEASURED',
    note:'How often you logged each food, which is not the same as what you prefer. Habit, price, convenience and what was in the fridge all live in this number, so it is used to break ties between substitutions rather than to choose them.'};
}
