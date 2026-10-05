/* ============================================================================
   REGION: CATALOGUE COMPLETION (§3.1, §3.12, §26, §28, §43, §89, §103)

   The last uncovered sub-features, found by scanning every bullet in the catalogue against the source rather
   than by sampling. Four were genuinely absent — equipment acquisition and retirement, inventory
   replenishment, knowledge replication, and selectorized machine types — and the rest were present but thin.

   One judgement runs through the knowledge parts. A finding that contradicts an earlier one is not a
   correction: it is either a real change in the person, a difference in context, or evidence that neither
   observation was solid. Overwriting the old with the new would destroy exactly the information needed to
   tell those apart, so both are kept and the conflict is reported as a conflict.
   ============================================================================ */

/* ---------------- §28 EQUIPMENT LIFECYCLE ---------------- */
var EQUIPMENT_CONDITIONS={
  new:{label:'New',usable:true},good:{label:'Good',usable:true},
  worn:{label:'Worn',usable:true,note:'still usable, worth watching'},
  needsService:{label:'Needs service',usable:false,note:'unsafe or unusable until seen to'},
  retired:{label:'Retired',usable:false}
};
function equipmentItems(){
  var on=asOf();
  return (DB.settings.equipmentItems||[]).filter(function(e){
    if(e.acquiredAt&&localDateOf(e.acquiredAt)>on)return false;
    return !e.retiredAt||localDateOf(e.retiredAt)>on;
  });
}
function addEquipment(o){
  o=o||{};
  if(!o.label)return null;
  pushUndo('add equipment');
  var rec={id:uid('eq'),label:String(o.label).slice(0,60),
    implement:o.implement||null,                       // maps onto the resistance IMPLEMENTS vocabulary
    acquiredAt:o.acquiredAt||nowISO(),cost:num(o.cost),
    condition:EQUIPMENT_CONDITIONS[o.condition]?o.condition:'good',
    servicedAt:o.servicedAt||null,serviceEveryDays:num(o.serviceEveryDays),
    expectedLifeYears:num(o.expectedLifeYears),
    retiredAt:null,createdAt:nowISO()};
  DB.settings.equipmentItems=(DB.settings.equipmentItems||[]).concat([rec]);
  emitEvent('equipment.changed',{op:'add',item:rec},{at:rec.createdAt});
  _memoInvalidate();save('equipment');
  return rec;
}
function updateEquipment(id,patch){
  var e=(DB.settings.equipmentItems||[]).filter(function(x){return x.id===id;})[0];
  if(!e)return null;
  pushUndo('update equipment');
  ['condition','servicedAt','serviceEveryDays','expectedLifeYears','cost','implement'].forEach(function(k){
    if(patch[k]!==undefined)e[k]=patch[k];});
  emitEvent('equipment.changed',{op:'update',id:id,patch:patch});
  _memoInvalidate();save('equipment:update');
  return e;
}
function retireEquipment(id,why){
  var e=(DB.settings.equipmentItems||[]).filter(function(x){return x.id===id;})[0];
  if(!e||e.retiredAt)return false;
  pushUndo('retire equipment');
  e.retiredAt=nowISO();e.retiredWhy=String(why||'').slice(0,120);e.condition='retired';
  emitEvent('equipment.changed',{op:'retire',id:id,why:e.retiredWhy},{at:e.retiredAt});
  _memoInvalidate();save('equipment:retire');
  return true;
}
function equipmentLifecycle(){
  var items=equipmentItems();
  if(!items.length)return {status:'insufficient',need:['equipment recorded individually'],
    note:'The profile knows what kind of setup you train in; this tracks the individual items, which is what wears out and what limits a plan.'};
  var rows=items.map(function(e){
    var ageDays=daysBetween(localDateOf(e.acquiredAt),asOf());
    var serviceDue=(e.serviceEveryDays&&e.servicedAt)?
      daysBetween(localDateOf(e.servicedAt),asOf())>=e.serviceEveryDays:
      (e.serviceEveryDays?ageDays>=e.serviceEveryDays:false);
    /* Usage from the record, not from a guess: sets performed on movements this implement can do. */
    var uses=0;
    if(e.implement){
      sessionsOf({from:addDays(asOf(),-90)}).forEach(function(s){
        (s.sets||[]).forEach(function(st){
          var ex=null;try{ex=resolveExercise(st.exercise);}catch(err){}
          if(ex&&(ex.equipment||[]).indexOf(e.implement)>=0)uses++;});});
    }
    var lifeUsed=e.expectedLifeYears?round(ageDays/(e.expectedLifeYears*365)*100,0):null;
    return {item:e,ageDays:ageDays,ageYears:round(ageDays/365,1),
      condition:e.condition,usable:(EQUIPMENT_CONDITIONS[e.condition]||{}).usable!==false,
      serviceDue:serviceDue,usesLast90:uses,
      lifeUsedPct:lifeUsed,
      replacementDue:lifeUsed!=null&&lifeUsed>=90,
      costPerUse:(e.cost&&uses)?round(e.cost/Math.max(1,uses),2):null};
  });
  return {status:'ok',cls:'MEASURED',rows:rows,
    unusable:rows.filter(function(r){return !r.usable;}).map(function(r){return r.item.label;}),
    serviceDue:rows.filter(function(r){return r.serviceDue;}).map(function(r){return r.item.label;}),
    note:'Acquisition, condition, service interval and expected life for each item, with usage counted from your own sessions. Cost per use is only meaningful once something has been used.',
    caveat:'Expected life is whatever you entered. Nothing here knows how hard you are on your equipment.'};
}
/* Compatibility: what a new item would actually unlock, answered before it is bought. */
function equipmentCompatibility(implement){
  if(!IMPLEMENTS[implement])return {status:'unknown',note:'not an implement this system knows'};
  var have=[];try{have=resolvedEquipment().have;}catch(e){}
  var withIt=have.concat([implement]);
  var unlocked=[],alreadyPossible=0;
  Object.keys(EXERCISES||{}).forEach(function(k){
    var ex=EXERCISES[k];if(!ex||!ex.equipment)return;
    var eq=Array.isArray(ex.equipment)?ex.equipment:[ex.equipment];
    var before=equipPossible(eq,have),after=equipPossible(eq,withIt);
    if(before)alreadyPossible++;
    else if(after)unlocked.push(ex.name);
  });
  return {status:'ok',cls:'DERIVED',implement:implement,label:IMPLEMENTS[implement].label,
    unlocks:unlocked,count:unlocked.length,alreadyPossible:alreadyPossible,
    verdict:unlocked.length?(unlocked.length+' movement(s) become possible: '+unlocked.slice(0,5).join(', ')):
      'nothing in the exercise list becomes possible that is not already',
    note:'What this implement would add to what you can already do, counted against the ontology rather than guessed. It says nothing about whether those movements are ones you want.'};
}
/* §3.1: machine subtypes, which change the resistance profile and the stability demand. */
var MACHINE_TYPES={
  selectorized:{label:'Selectorized (pin-loaded)',curve:'even',stability:'high',
    note:'a fixed cam and a pin; load increments are coarse and the path is decided for you'},
  plateLoadedMachine:{label:'Plate-loaded machine',curve:'variable',stability:'high',
    note:'cam design decides where it is hardest, and the two sides load independently'},
  specialized:{label:'Specialised apparatus',curve:'variable',stability:'high',
    note:'purpose-built for one movement; loads do not compare to anything else'},
  smithMachine:{label:'Smith machine',curve:'even',stability:'high',
    note:'a fixed bar path; loads are not comparable to a free bar'}
};
/* ---------------- §26 INVENTORY LIFECYCLE ---------------- */
function receiveInventory(id,amount,opts){
  opts=opts||{};
  var i=(DB.settings.inventory||[]).filter(function(x){return x.id===id;})[0];
  if(!i||num(amount)==null)return null;
  pushUndo('receive stock');
  i.remaining=(num(i.remaining)||0)+num(amount);
  i.receipts=(i.receipts||[]).concat([{at:nowISO(),amount:num(amount),
    cost:num(opts.cost),expiresAt:opts.expiresAt||null}]);
  if(opts.expiresAt)i.expiresAt=opts.expiresAt;
  emitEvent('inventory.changed',{op:'receive',id:id,amount:num(amount),expiresAt:opts.expiresAt||null});
  _memoInvalidate();save('inventory:receive');
  return i;
}
function inventoryLifecycle(){
  var st=inventoryState();
  if(st.status!=='ok')return st;
  var rows=st.rows.map(function(r){
    var i=r.item;
    var expiresIn=i.expiresAt?daysBetween(asOf(),localDateOf(i.expiresAt)):null;
    /* Replenish before it runs out, not when it has: lead time is the point. */
    var lead=num(i.leadTimeDays)!=null?num(i.leadTimeDays):3;
    var reorderIn=(r.daysLeft!=null)?r.daysLeft-lead:null;
    return Object.assign({},r,{
      expiresInDays:expiresIn,
      expiringFirst:expiresIn!=null&&r.daysLeft!=null&&expiresIn<r.daysLeft,
      leadTimeDays:lead,
      reorderInDays:reorderIn,
      reorderNow:reorderIn!=null&&reorderIn<=0,
      receipts:(i.receipts||[]).length});
  });
  return {status:'ok',cls:'DERIVED',rows:rows,
    reorderNow:rows.filter(function(r){return r.reorderNow;}).map(function(r){return r.item.label;}),
    expiringFirst:rows.filter(function(r){return r.expiringFirst;}).map(function(r){return r.item.label;}),
    note:'Depletion, expiry and reorder point together. An item that expires before you finish it is a different problem from one that runs out, and buying more of it is the wrong response.',
    caveat:'Reorder timing assumes the lead time you entered, defaulting to three days.'};
}
/* ---------------- §43/§89 REPLICATION AND CONTRADICTION ---------------- */
function knowledgeReplication(subject){
  /* How many independent occasions support a finding, which is what distinguishes a result from a fluke. */
  var exps=(DB.experiments||[]).filter(function(e){
    return e.status==='complete'&&(!subject||e.variable===subject);});
  var byVar={};
  exps.forEach(function(e){
    byVar[e.variable]=byVar[e.variable]||{runs:[]};
    byVar[e.variable].runs.push({id:e.id,date:e.startDate,conclusion:e.conclusion,
      direction:/increase|improv|help|faster/i.test(String(e.conclusion))?'positive':
        (/decrease|worse|slow|no effect|did not/i.test(String(e.conclusion))?'negative':'unclear')});
  });
  var rows=Object.keys(byVar).map(function(v){
    var runs=byVar[v].runs;
    var dirs=runs.map(function(r){return r.direction;}).filter(function(d){return d!=='unclear';});
    var pos=dirs.filter(function(d){return d==='positive';}).length;
    var neg=dirs.length-pos;
    var replicated=dirs.length>=2&&(pos===0||neg===0);
    var contradicted=pos>0&&neg>0;
    return {variable:v,runs:runs.length,directions:{positive:pos,negative:neg,unclear:runs.length-dirs.length},
      replicated:replicated,contradicted:contradicted,
      status:contradicted?'contradicted':(replicated?'replicated':(runs.length>=1?'single run':'none')),
      note:contradicted?'The same change produced opposite conclusions on different occasions. That is information, not an error \u2014 it usually means context differed or neither run was clean.':
        (replicated?'More than one independent run agreed.':'One run. A single result is a result, not a finding.')};
  });
  return {rows:rows,
    replicated:rows.filter(function(r){return r.replicated;}).length,
    contradicted:rows.filter(function(r){return r.contradicted;}).length,
    cls:'EMPIRICAL',
    note:'Replication is what separates a finding from a fluke, and contradiction is kept rather than resolved \u2014 overwriting the older result would destroy the evidence needed to tell a real change from a bad measurement.'};
}
function knowledgeContradictions(){
  var out=[];
  var rep=knowledgeReplication();
  rep.rows.filter(function(r){return r.contradicted;}).forEach(function(r){
    var ctx=null;try{ctx=currentContext();}catch(e){}
    out.push({kind:'experiment',subject:r.variable,
      detail:r.directions.positive+' run(s) found an effect and '+r.directions.negative+' did not',
      resolution:'neither is discarded; the context each ran in is the thing to compare',
      context:ctx});
  });
  /* A user rule contradicted by the record is reported to the person, not overridden. */
  try{
    userRules().forEach(function(rule){
      var v=Object.keys(typeof RESPONSE_VARS!=='undefined'?RESPONSE_VARS:{})
        .filter(function(k){return new RegExp('\\b'+k,'i').test(rule.statement);})[0];
      if(!v)return;
      var c=causalSupport(v);
      if(c.grade==='contradicted')out.push({kind:'rule',subject:rule.statement,
        detail:'your record grades '+v+' as contradicted',
        resolution:'your rule stands as your own observation; you have access to things the record does not'});
    });
  }catch(e){_q(e,'P3');}
  return {rows:out,count:out.length,cls:'DERIVED',
    note:out.length?'Conflicts are surfaced rather than silently resolved.':'Nothing in the record contradicts anything else in it.'};
}
/* ---------------- §3.12 DELOAD AND AUTOREGULATION ---------------- */
function deloadCheck(){
  var signals=[],load=null,rec=null;
  try{load=trainingLoad();}catch(e){}
  try{rec=unifiedRecovery();}catch(e){}
  if(load&&load.status==='ok'&&load.ratio>1.5)
    signals.push({signal:'load is '+load.ratio+'\u00d7 your own chronic average',weight:2});
  if(rec&&rec.status==='ok'&&rec.score<=-1.2)
    signals.push({signal:'recovery is '+rec.band,weight:2});
  try{
    var st=strengthTrend();
    if(st&&st.status==='ok'&&st.slopePerWeek<0)
      signals.push({signal:'strength is falling at '+fmtSigned(st.slopePerWeek,1)+'/week',weight:2});
  }catch(e){}
  try{
    var sore=seriesWindow('soreness',14);
    if(sore.length>=7&&mean(sore.slice(-7).map(function(d){return d.value;}))>mean(sore.slice(0,7).map(function(d){return d.value;}))+1.5)
      signals.push({signal:'soreness has risen through the fortnight',weight:1});
  }catch(e){}
  var score=signals.reduce(function(a,s){return a+s.weight;},0);
  return {status:'ok',cls:'POLICY',signals:signals,score:score,
    recommend:score>=4,
    verdict:score>=4?'Several signals point the same way, which is the case for an easier week.':
      (score>=2?'One signal is elevated. Worth watching rather than acting on.':'Nothing suggests a deload.'),
    protocol:score>=4?{load:'keep the weights, halve the sets',duration:'one week',
      why:'reducing volume while keeping intensity preserves the training stimulus you have built while letting fatigue fall'}:null,
    note:'A deload triggered by a calendar is a rest week you may not need; one triggered by a single bad day is a habit. This asks for several signals pointing the same way.'};
}
function autoregulate(exercise,todayEffort){
  var pr=progressionFor(exercise);
  if(pr.status!=='ok')return pr;
  var rec=null;try{rec=unifiedRecovery();}catch(e){}
  var rir=num(todayEffort);
  /* Adjust today against what was planned, from how the first working set actually felt. */
  var adjust=null;
  if(rir!=null){
    if(rir>=4)adjust={change:'add load, the planned weight is too light today',by:'5\u201310%'};
    else if(rir<=0)adjust={change:'reduce load, you are at or past failure on the first set',by:'5\u201310%'};
    else adjust={change:'proceed as planned',by:null};
  }
  var brake=(rec&&rec.status==='ok'&&rec.score<=-1.2)?
    'recovery is '+rec.band+', so today is a day to hold rather than push':null;
  return {status:'ok',cls:'POLICY',exercise:exercise,
    planned:pr.recommendation,todayEffort:rir,adjustment:brake?{change:'hold',by:null}:adjust,
    brake:brake,
    note:'Autoregulation adjusts today against how today actually feels, which is different from progression, which decides where next week starts. Both are shown so the reason for a change is never ambiguous.'};
}
/* ---------------- §103 REFERENCE LICENSING ----------------
   Every shipped table declares where it came from and under what terms, so a number can be traced to a
   source and a licence rather than appearing anonymously. */
var REFERENCE_LICENCES={
  'AH-102':{source:'USDA Agriculture Handbook 102',terms:'US Government work, public domain',
    url:'https://www.ars.usda.gov/',note:'extracted by OCR here; errors in extraction are ours, not the source\u2019s'},
  'FDC':{source:'USDA FoodData Central',terms:'public domain',url:'https://fdc.nal.usda.gov/'},
  'compendium':{source:'Compendium of Physical Activities',terms:'free for non-commercial use, cite the authors',
    url:'https://pacompendium.com/'}
};
function referenceLicensing(){
  return {tables:Object.keys(REFERENCE_LICENCES).map(function(k){
      return Object.assign({id:k},REFERENCE_LICENCES[k]);}),
    note:'Shipped reference data with its source and terms. Anything without a licence entry is not shipped.'};
}
