/* ============================================================================
   REGION: DOMAIN CONFORMANCE (plugin pipeline)

   A conformance audit against the project's own pipeline

     domain → ontology → observations → events → state → models → uncertainty →
     decision → intervention → outcome → experiment → knowledge

   found the cognitive loop satisfied end to end globally while NO domain conformed fully. The best managed
   8 of 11, and every single domain failed at the same stage: **decision**. Domains produced proposals and
   nothing consumed them. The pipeline said domain → decision and that arrow did not exist.

   That is the shape of the problem the audit was looking for: the architecture was more rigorous than the
   models inside it, and the gap was systematic rather than scattered.

   Two honest resolutions rather than one, because two different things were missing:

   1. The DECISION arrow was genuinely absent and is built here — domain proposals now reach the decision
      lattice, ranked, with the domain's own priority respected.

   2. Several domains failed EVENTS because they own no mutable state: `activity` derives entirely from step
      observations, and inventing an `activity.changed` event to satisfy a checklist would be ceremony
      pretending to be rigour. Those domains now DECLARE that they derive, which is a different claim from
      having forgotten to persist something, and the auditor accepts a declaration it can verify.
   ============================================================================ */

/* ---------------- the missing vocabularies ----------------
   A domain without an ontology is a domain whose terms mean whatever the reader assumes. */
var SLEEP_QUALITIES={
  restorative:{label:'Restorative',means:'woke feeling recovered'},
  broken:{label:'Broken',means:'slept the hours but woke repeatedly'},
  short:{label:'Short',means:'fewer hours than intended, quality fine'},
  restless:{label:'Restless',means:'long but unrefreshing'},
  unknown:{label:'Not recorded',means:'duration only'}
};
var ACTIVITY_KINDS={
  neat:{label:'Everyday movement',means:'walking, standing, errands \u2014 unplanned',intensity:'low'},
  deliberateWalk:{label:'Deliberate walk',means:'planned, for its own sake',intensity:'low'},
  commute:{label:'Commute',means:'unavoidable and fairly fixed',intensity:'low'},
  occupational:{label:'Work',means:'whatever your job demands of you',intensity:'varies'},
  conditioning:{label:'Conditioning',means:'planned cardiovascular work',intensity:'moderate to high'}
};
var COMPOSITION_METHODS={
  dxa:{label:'DXA',reliability:'high',comparable:'only against other DXA scans'},
  bodpod:{label:'BodPod',reliability:'high',comparable:'only against other BodPod readings'},
  calipers:{label:'Calipers',reliability:'moderate',comparable:'only with the same operator and sites'},
  bia:{label:'Bioimpedance',reliability:'low',comparable:'only at the same hydration and time of day'},
  circumference:{label:'Circumference equation',reliability:'low',comparable:'a population fit, not a measurement'},
  visual:{label:'Visual estimate',reliability:'very low',comparable:'not comparable to anything numeric'}
};
var COST_CATEGORIES={
  food:{label:'Food',recurring:true},supplements:{label:'Supplements',recurring:true},
  gym:{label:'Gym or membership',recurring:true},equipment:{label:'Equipment',recurring:false},
  coaching:{label:'Coaching',recurring:true},testing:{label:'Testing and scans',recurring:false}
};
var SCHEDULE_WINDOWS={
  earlyMorning:{label:'Early morning',before:'work'},midday:{label:'Midday',before:'afternoon'},
  evening:{label:'Evening',before:'sleep'},weekend:{label:'Weekend',before:'nothing fixed'},
  variable:{label:'Variable',before:'depends on the week'}
};
var INVENTORY_CATEGORIES={
  staple:{label:'Food staple',perishable:true},supplement:{label:'Supplement',perishable:true},
  consumable:{label:'Consumable',perishable:false},equipmentPart:{label:'Equipment part',perishable:false}
};
/* ---------------- DOMAIN → DECISION ----------------
   The arrow the audit found missing. Domain proposals reach the decision lattice, and the rules are the same
   ones that govern everything else here: a proposal must carry a reason, it cannot outrank a higher-priority
   domain, and nothing is applied without the person. */
function domainDecisionInputs(){
  var props=[];
  try{props=domainProposals();}catch(e){_q(e,'P2');}
  if(!props.length)return {status:'none',inputs:[],
    note:'No domain is proposing anything, which is the normal case when nothing is out of order.'};
  /* Priority is the domain's own declared priority \u2014 injury at 10 outranks optimisation at 70, because pain
     outranks rate. Confidence breaks ties within a priority. */
  var order={high:0,medium:1,low:2,'very low':3};
  var inputs=props.slice().sort(function(a,b){
    if(a.priority!==b.priority)return a.priority-b.priority;
    return (order[a.confidence]||2)-(order[b.confidence]||2);
  }).map(function(p){
    return {domain:p.domain,domainLabel:p.domainLabel,verb:p.verb,why:p.why,
      priority:p.priority,confidence:p.confidence,cls:p.cls,
      act:p.act,arg:p.arg,reverseIf:p.reverseIf,
      /* Whether this outranks the physique decision, which is the question the lattice needs answered. */
      outranksOptimisation:p.priority<40};
  });
  return {status:'ok',cls:'DERIVED',inputs:inputs,top:inputs[0],
    overriding:inputs.filter(function(i){return i.outranksOptimisation;}),
    note:'Domain proposals ranked by the domain\u2019s own priority. Anything below 40 outranks rate optimisation, because a sore knee or a depressed recovery is a better reason to change course than a trend being slightly off band.',
    caveat:'These are proposals. Nothing here changes the record, and the decision below still states its own reasoning separately.'};
}
/* What the decision surface should show alongside the physique decision. */
function decisionWithDomains(){
  var d=null;try{d=decide();}catch(e){}
  var di=domainDecisionInputs();
  var overriding=di.status==='ok'?di.overriding:[];
  return {decision:d,domainInputs:di.status==='ok'?di.inputs:[],
    overriding:overriding,
    leads:overriding.length?'domain':'physique',
    headline:overriding.length?overriding[0].verb:(d?d.verb:null),
    cls:'POLICY',
    note:overriding.length?
      ('A domain proposal outranks the rate decision here: '+overriding[0].domainLabel+
       ' at priority '+overriding[0].priority+'. The rate decision is still shown, because it has not stopped being true.'):
      'No domain outranks the rate decision, so it leads.',
    caveat:'Two kinds of reasoning shown side by side rather than merged. Merging them would hide which one moved.'};
}
/* ---------------- DERIVATION DECLARATION ----------------
   A domain that owns no mutable state does not need its own events, and saying so is a different claim from
   having forgotten to persist something. */
var DERIVED_DOMAINS={
  activity:'derives entirely from step observations',
  composition:'derives from measurement observations, which carry their own events',
  sleep:'derives from sleep observations, which carry their own events',
  recovery:'derives from the subjective streams and the training record',
  cardio:'derives from cardio observations',
  schedule:'derives from the session log',
  cost:'derives from food prices and the food log'
};
function domainOwnsState(id){return !DERIVED_DOMAINS[id];}
function domainDerivation(id){
  return DERIVED_DOMAINS[id]?
    {derives:true,from:DERIVED_DOMAINS[id],
     note:'This domain persists nothing of its own, so it emits no events. Its inputs are evented where they are recorded.'}:
    {derives:false,note:'This domain owns mutable state and emits its own events.'};
}
/* ---------------- the missing knowledge hooks ----------------
   Each returns what the domain has actually established, or nothing. A hook that always returns an empty
   array is absence wearing the shape of presence, so these only speak when there is something to say. */
function activityKnowledge(){
  var a=null;try{a=activityState();}catch(e){}
  if(!a||a.status!=='ok')return [];
  var out=[{kind:'activity',subject:'your ordinary day',
    statement:fmtNum(a.mean,0)+' steps, '+a.consistency,
    confidence:a.confidence,evidence:a.days+' days',context:'current phase',
    lastValidated:asOf(),transfers:'shifts with season, work and injury; it describes now'}];
  if(Math.abs(a.drift||0)>=800)out.push({kind:'activity',subject:'drift under a deficit',
    statement:'activity moved '+fmtSigned(a.drift,0)+' steps/day over the last week',
    confidence:'low',evidence:a.days+' days',context:'during a deficit',lastValidated:asOf(),
    transfers:'compensation is common in a deficit; whether it is yours specifically needs a clean period to tell'});
  return out;
}
function compositionKnowledge(){
  var c=null;try{c=compositionState();}catch(e){}
  if(!c||c.status!=='ok')return [];
  return (c.offsets||[]).map(function(o){
    return {kind:'composition',subject:o.a+' against '+o.b,
      statement:'reads '+fmtSigned(o.offset,1)+' points differently on overlapping dates',
      confidence:o.n>=3?'medium':'low',evidence:o.n+' overlapping pair(s)',
      context:'method comparison',lastValidated:asOf(),
      transfers:'an offset between methods, not a change in you \u2014 it applies whenever you compare those two'};
  });
}
function costKnowledge(){
  var c=null;try{c=costState();}catch(e){}
  if(!c||c.status!=='ok'||c.perProteinGram==null)return [];
  return [{kind:'cost',subject:'protein cost',
    statement:fmtNum(c.perProteinGram*100,2)+' per 100 g of protein',
    confidence:c.confidence,evidence:c.pricedEntries+' priced entries',
    context:'current shopping habits',lastValidated:asOf(),
    transfers:'prices move and shops differ; this is a snapshot of what you were paying'}];
}
function scheduleKnowledge(){
  var s=null;try{s=scheduleState();}catch(e){}
  if(!s||s.status!=='ok')return [];
  var days=Object.keys(s.byDay||{}).sort(function(a,b){return s.byDay[b]-s.byDay[a];}).slice(0,3);
  if(!days.length)return [];
  return [{kind:'schedule',subject:'when you actually train',
    statement:days.join(', ')+' most often',
    confidence:s.confidence,evidence:s.sessions+' sessions over eight weeks',
    context:'current work pattern',lastValidated:asOf(),
    transfers:'a change of job or season invalidates this entirely'}];
}
function inventoryKnowledge(){
  var il=null;try{il=inventoryLifecycle();}catch(e){}
  if(!il||il.status!=='ok')return [];
  return il.rows.filter(function(r){return r.perDay!=null;}).map(function(r){
    return {kind:'inventory',subject:r.item.label,
      statement:'you get through about '+r.perDay+' '+(r.item.unit||'units')+' a day',
      confidence:'low',evidence:r.basis||'stated rate',context:'current routine',
      lastValidated:asOf(),transfers:'only while the routine holds'};
  });
}
function equipmentKnowledge(){
  var el=null;try{el=equipmentLifecycle();}catch(e){}
  if(!el||el.status!=='ok')return [];
  return el.rows.filter(function(r){return r.costPerUse!=null;}).map(function(r){
    return {kind:'equipment',subject:r.item.label,
      statement:fmtNum(r.costPerUse,2)+' per set so far, over '+r.ageYears+' years',
      confidence:'low',evidence:r.usesLast90+' sets in the last 90 days',
      context:'your own usage',lastValidated:asOf(),
      transfers:'cost per use only falls with more use, so this is a moving figure'};
  });
}
function cardioKnowledge(){
  var c=null;try{c=cardioSessions(28);}catch(e){}
  if(!c||c.status!=='ok')return [];
  var out=[{kind:'cardio',subject:'your usual cardio',
    statement:c.minutesPerWeek+' min/week across '+Object.keys(c.byModality).length+' modality(ies)',
    confidence:'medium',evidence:c.sessions+' sessions',context:'current phase',
    lastValidated:asOf(),transfers:'a description of habit rather than of capacity'}];
  var i=null;try{i=interferenceAnalysis();}catch(e){}
  if(i&&i.status==='ok'&&i.grade!=='unknown')out.push({kind:'cardio',subject:'cardio against strength',
    statement:i.grade+' on '+i.lift,confidence:'low',
    evidence:i.weeks+' weeks compared',context:'within-person weeks',lastValidated:asOf(),
    transfers:'confounded by the deficit; it describes a period rather than a mechanism'});
  return out;
}
/* ---------------- uncertainty where it was missing ---------------- */
function movementConfidence(){
  var d=null;try{d=movementDoseTotals(7);}catch(e){}
  if(!d)return null;
  var log=[];try{log=movementLog({from:addDays(asOf(),-7)});}catch(e){}
  /* Dose is only as good as the intensity ratings behind it, so the share that were rated is the confidence. */
  var rated=log.filter(function(m){return m.intensity!=null;}).length;
  var share=log.length?rated/log.length:0;
  return {records:log.length,rated:rated,
    confidence:log.length>=6&&share>=0.8?'medium':(log.length>=3?'low':'very low'),
    coverage:round(share*100,0),
    note:'Dose is computed from the minutes and intensity you recorded. '+
      (log.length?(rated+' of '+log.length+' sessions carried an intensity'):'nothing logged this week')+
      ', and an unrated session falls back to a default, which is the largest error in these totals.'};
}
function costConfidence(){
  var c=null;try{c=costState();}catch(e){}
  if(!c||c.status!=='ok')return null;
  return {confidence:c.coverage>=70?'medium':(c.coverage>=30?'low':'very low'),
    coverage:c.coverage,
    note:'Only '+c.coverage+'% of logged food carries a price, so every figure here describes that share and not your whole diet.'};
}
function inventoryConfidence(){
  var il=null;try{il=inventoryLifecycle();}catch(e){}
  if(!il||il.status!=='ok')return null;
  var measured=il.rows.filter(function(r){return r.rateSource==='measured';}).length;
  return {items:il.rows.length,measuredRates:measured,
    confidence:measured===il.rows.length&&measured>0?'low':'very low',
    note:'A depletion forecast from a stated dose is arithmetic; one from measured consumption is an estimate. '+
      measured+' of '+il.rows.length+' item(s) have a measured rate.'};
}
