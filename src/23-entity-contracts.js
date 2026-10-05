/* ============================================================================
   CANONICAL ENTITY CONTRACTS (H0)
   Eleven objects carry the product loop: Individual, Goal, Constraint, Phase, Plan, Intervention, Execution,
   Observation, Response, Decision, Adaptation. Before H1 builds on them, each states its identity, lifecycle, owner,
   temporal semantics, provenance, correction and retraction, events, read model, registry and dependency layer, so
   that different modules cannot interpret the same object differently.

   status: 'implemented' \u2014 exists and every named function, event and store is checked against the running code.
           'partial'     \u2014 exists in part; the gap is named and the horizon that closes it.
           'specified'   \u2014 H1/H3 work; names the existing parts it will extend, never a parallel store.
   Every store in the record must belong to a contract or be listed as a supporting store with its reason: no new
   major product object without a contract.
   ============================================================================ */
var ENTITY_CONTRACTS={
  Individual:{status:'implemented',stores:['profile'],identity:'one per record: the record is the individual\u2019s',
    lifecycle:['unset','profiled'],owners:['applyProfileFields'],readModel:'prof',registry:'PROFILE_FIELDS',layer:'observations',
    temporal:'each change is a profile.changed event carrying the whole profile, so replay gives the profile as of any date',
    provenance:'the event log',correction:'a later profile.changed supersedes the earlier; the earlier stays in the log',
    events:['profile.changed']},
  Goal:{status:'implemented',stores:['profile'],identity:'one active goal per individual',
    lifecycle:['none','set','changed'],owners:['applyProfileFields'],readModel:'canonicalGoal',registry:'GOAL_TYPES',layer:'domains',
    temporal:'held in the profile; a phase executes it, and a phase\u2019s weight and date are a milestone, not a second goal',
    provenance:'the event log',correction:'superseded by the next profile.changed',events:['profile.changed']},
  Constraint:{status:'implemented',stores:['profile','settings'],identity:'one set per individual',
    lifecycle:['unset','set'],owners:['applyProfileFields'],readModel:'constraintModel',registry:'CONSTRAINT_OPTIONS',layer:'domains',
    temporal:'current values; changes are profile and settings events, and each plan version keeps the constraints it was built on',
    provenance:'the event log',correction:'superseded by the next change',events:['profile.changed','equipment.changed','settings.changed']},
  Phase:{status:'implemented',stores:['phases'],identity:'uid per phase',
    lifecycle:['active','ended'],owners:['startPhase','endPhase','savePhase'],readModel:'activePhase',registry:'PHASE_TYPES',layer:'domains',
    temporal:'startDate and endDate; phaseAt(date) answers which phase applied on a date, so history is scoped by phase',
    provenance:'the event log',correction:'target changes keep the previous values in the phase\u2019s history',
    events:['phase.started','phase.targetsChanged','phase.ended']},
  Plan:{status:'implemented',stores:['plans'],identity:'uid per version; versions are contiguous and each supersedes the previous',
    lifecycle:['active','superseded'],owners:['createPlanVersion'],readModel:'currentPlan',registry:'PLAN_VARIANTS',layer:'decision',
    temporal:'effectiveFrom per version; the plan as of any date is the last version effective on it',
    provenance:'each version names its sources (canonical goal, phase targets, programme, decision lattice) and its trigger',
    correction:'a change creates a new version with its trigger, evidence and alternatives; no version is rewritten',
    events:['plan.created']},
  Intervention:{status:'implemented',stores:['interventions'],identity:'uid per intervention',
    lifecycle:['proposed','applied','evaluated'],owners:['applyDecisionIntervention','updatePhase','createExperiment'],readModel:'compareIntervention',registry:null,layer:'decision',
    temporal:'dated when applied; evaluated after its window',provenance:'the event log',
    correction:'evaluation is added, never rewritten',events:['intervention.recorded']},
  Execution:{status:'implemented',stores:['sessions','foodLogs','observations','executions'],identity:'per date and plan item',
    lifecycle:['upcoming','in progress','done','partial','skipped','unknown'],owners:['markExecution','addSession','updateSession','retractSession','addObservation','logFood','updateFoodLog','copyFoodLog'],
    readModel:'executionFor',registry:'PLAN_VARIANTS',layer:'observations',
    temporal:'intended from the plan as of the date; done from what was logged that date; a missing log is unknown, never a failure',
    provenance:'the logs and marks it was read from',correction:'logs are superseded or retracted; a later mark overrides an earlier one',
    events:['session.added','session.superseded','session.retracted','food.logged','observation.added','execution.marked']},
  Observation:{status:'implemented',stores:['observations'],identity:'uid per observation',
    lifecycle:['recorded','corrected','retracted','flagged'],owners:['addObservation','correctObservation','retractObservation','syncNutritionObservations','importObservations'],
    readModel:'obsOf',registry:'OBS_TYPES',layer:'observations',
    temporal:'date is what it describes, at is when it was recorded; replay answers as of any date',
    provenance:'source and quality on each record, and the event log',
    correction:'a correction supersedes the original; a retraction hides it without deleting it',
    events:['observation.added','observation.corrected','observation.retracted','observation.flagged']},
  /* stores that were persisted and written with no contract (found by tests/authority.mjs) */
  Experiment:{status:'implemented',stores:['experiments'],identity:'one per experiment (exp id)',lifecycle:['planned','running','evaluated','archived'],owners:['createExperiment'],readModel:'activeExperiments',registry:'EXPERIMENT_TEMPLATES',layer:'decision',
    temporal:'from its start date to its evaluation',provenance:'experiment.created and experiment.revised events',correction:'revisions are new events; the archive keeps evaluated ones',events:['experiment.created','experiment.revised','experiment.evaluated'],existing:['evaluateExperiment'],note:'an experiment is also an Intervention (createExperiment writes both)'},
  NegativeKnowledge:{status:'implemented',stores:['negatives'],identity:'one per recorded non-effect',lifecycle:['recorded'],owners:['addNegative'],readModel:'getNegativeKnowledge',registry:null,layer:'decision',
    temporal:'the date it was recorded',provenance:'negative.recorded events',correction:'append only',events:['negative.recorded'],existing:[],note:'what did not work, kept so it is not suggested again'},
  Recipe:{status:'implemented',stores:['recipes'],identity:'one per recipe id',lifecycle:['saved'],owners:['saveRecipe'],readModel:'recipesOf',registry:null,layer:'nutrition',
    temporal:'versioned by save',provenance:'recipe.saved events',correction:'a later save supersedes',events:['recipe.saved'],existing:[],note:''},
  Food:{status:'implemented',stores:['foods'],identity:'one per user food id (catalogue foods are reference data, not stored here)',lifecycle:['saved'],owners:['saveUserFood'],readModel:'localFoods',registry:null,layer:'nutrition',
    temporal:'versioned by save; logged entries keep their own snapshot',provenance:'the label or source it was entered from',correction:'a later save supersedes; past logs keep their snapshot',events:['food.logged'],existing:['foodSnapshot'],note:''},
  Prediction:{status:'implemented',stores:['predictions'],identity:'one per model, target date and horizon',lifecycle:['stamped','scored'],owners:['stampPredictions'],readModel:'pendingPredictions',registry:'MODELS',layer:'models',
    temporal:'made on one date about a later one',provenance:'prediction.stamped and prediction.scored events',correction:'never rewritten: a score is a new event',events:['prediction.stamped','prediction.scored'],existing:['scorePredictions'],note:''},
  Snapshot:{status:'implemented',stores:['snapshots'],identity:'one per day',lifecycle:['captured'],owners:['captureSnapshot'],readModel:'snapshotsOf',registry:null,layer:'models',
    temporal:'what was known on that day',provenance:'snapshot.captured events',correction:'append only',events:['snapshot.captured'],existing:[],note:''},
  Archive:{status:'implemented',stores:['archive'],identity:'one per archived phase or evaluated experiment',lifecycle:['archived'],owners:['evaluateExperiment','archivePhase'],readModel:'archiveOf',registry:null,layer:'models',
    temporal:'the date it closed',provenance:'experiment.evaluated and phase.ended events',correction:'append only',events:['experiment.evaluated','phase.ended'],existing:[],note:''},
  Source:{status:'implemented',stores:[],identity:'one per data source (manual, import, a connected service)',lifecycle:['connected','syncing','disconnected'],owners:['importObservations'],readModel:'externalSources',registry:null,layer:'sources',
    temporal:'each observation keeps the source it came from',provenance:'source and method on every observation',correction:'disconnecting keeps past data, labelled with its source',events:['record.imported'],existing:[],note:'a source is not a store of its own: it is the provenance carried by observations'},
  IndividualState:{status:'projection',stores:[],identity:'one per person, as of a date',lifecycle:['computed'],owners:[],readModel:'individualState',registry:null,layer:'models',
    temporal:'as of the date asked (asOf)',provenance:'each part names the read model it came from',correction:'never written: corrections go to the entities it reads',events:[],existing:['individualState'],note:'goals, constraints, plan, training, nutrition, activity, recovery, body composition, execution, response, evidence, adaptation (audit A-005); frozen'},
  InterventionLifecycle:{status:'projection',stores:[],identity:'one per intervention',lifecycle:['proposed','accepted','scheduled','attempted','executed','exposed','evaluated','completed','learned'],owners:[],readModel:'interventionLifecycles',registry:null,layer:'decision',
    temporal:'each transition dated by the record that shows it',provenance:'plan versions, executions, observations and Response records',correction:'follows the records it reads',events:[],existing:['interventionLifecycle'],note:'one lifecycle for every domain (audit A-003)'},
  Evidence:{status:'reference',stores:[],identity:'one per cited finding',lifecycle:['reference'],owners:[],readModel:'evidenceFor',registry:null,layer:'reference',
    temporal:'the publication',provenance:'citation',correction:'replaced by a new release',events:[],existing:[],note:'reference data, read only: nothing at run time writes it'},
  Response:{status:'implemented',stores:['responses'],identity:'one per intervention (resp:<intervention id>); a later stage replaces an earlier',
    lifecycle:['pending','provisional','final'],owners:['recordResponses'],readModel:'responsesOf',registry:null,layer:'models',
    temporal:'the before and after windows of its intervention; provisional after 7 days, final after 21',provenance:'response.recorded events carrying the evaluation, its windows and its method',
    correction:'recomputed from the record at the next stage; the earlier stage stays in the event log',events:['response.recorded'],
    existing:['planResponse','responseFor','exerciseResponse','forecastTrackRecord','evaluateResponse'],
    note:'intervention \u2192 adherence \u2192 outcome \u2192 expectation \u2192 effect \u00b1 uncertainty \u2192 what followed; experiments, plan changes, adaptations and supplements alike'},
  LearningCycle:{status:'implemented',stores:['cycles'],identity:'one per ISO week (cycle:<week>)',lifecycle:['recorded'],owners:['runLearningCycle'],readModel:'runLearningCycle',registry:null,layer:'models',
    temporal:'the week it closes',provenance:'cycle.recorded events carrying each stage, the beliefs, what changed and loop health',correction:'a forced rerun in the same week replaces it; earlier weeks stay',events:['cycle.recorded'],
    existing:['loopStages','loopBeliefs','nextTest','loopHealth'],note:'observe \u2192 understand \u2192 decide \u2192 act \u2192 measure \u2192 explain \u2192 learn \u2192 adapt \u2192 predict \u2192 test \u2192 personalize'},
  Decision:{status:'implemented',stores:['decisions'],identity:'uid per decision',
    lifecycle:['recorded','applied','reviewed'],owners:['recordDecision','recordUserDecision'],readModel:'decisionsOf',registry:null,layer:'decision',
    temporal:'dated when recorded, with the state it was made from',provenance:'the event log and the decision\u2019s inputs',
    correction:'a later decision supersedes; none is rewritten',events:['decision.recorded']},
  Adaptation:{status:'implemented',stores:['plans'],identity:'a plan version whose trigger is an adaptation',
    lifecycle:['proposed','accepted','outcome read'],owners:['applyAdaptation'],readModel:'adaptationsOf',registry:null,layer:'decision',
    temporal:'dated with its trigger and the evidence at the time; its outcome is read a week later',provenance:'the plan version and the adherence analysis it came from',
    correction:'an adaptation is reversed by a later one, never erased',events:['plan.created']}
};
/* Stores that belong to no core object, each with the reason. */
var SUPPORTING_STORES={
  schemaVersion:'record metadata',appVersion:'record metadata',createdAt:'record metadata',revision:'record metadata',instance:'record metadata',
  foods:'food reference data, owned by the food domain (userFood.saved)',recipes:'food reference data (recipe.saved)',
  environment:'contextual observations from environmental sources \u2014 re-fetchable context, not personal observations (ingestEnvironmentBatch); a workout copies the weather it was done in into its session',
  predictions:'the forecast ledger (prediction.stamped, prediction.scored)',experiments:'N-of-1 experiments (experiment.*)',
  negatives:'negative knowledge (negative.recorded)',snapshots:'daily analytical snapshots (snapshot.captured)',
  archive:'archived records',notes:'free notes',models:'model state and maturity (model.stage)',
  settings:'preferences and appearance (settings.changed)',ledger:'persistence bookkeeping',demo:'example-data metadata'
};
var ENTITY_STATUSES={implemented:1,partial:1,specified:1,reference:1,projection:1};   /* projection: read-only, composed from other entities' read models */   /* reference: read-only data; no runtime owner may exist */
function entityContractAudit(){
  var g=(typeof window!=='undefined')?window:{};var isFn=function(n){return typeof g[n]==='function';};
  var issues=[],db=(typeof emptyDB==='function')?emptyDB():{};
  var events=(typeof EVENT_TYPES!=='undefined')?EVENT_TYPES:{};
  Object.keys(ENTITY_CONTRACTS).forEach(function(k){var c=ENTITY_CONTRACTS[k];
    if(!ENTITY_STATUSES[c.status])issues.push(k+': unknown status '+c.status);
    ['identity','lifecycle','temporal','provenance','correction','layer','events','stores'].forEach(function(f){if(c[f]==null)issues.push(k+': no '+f);});
    (c.stores||[]).forEach(function(s){if(!(s in db))issues.push(k+': store "'+s+'" is not in the record');});
    (c.events||[]).forEach(function(e){if(!events[e])issues.push(k+': event "'+e+'" is not registered');});
    if(c.status==='projection'){if(c.owners&&c.owners.length)issues.push(k+': a projection names a runtime owner');if(c.stores&&c.stores.length)issues.push(k+': a projection has a store');if(!c.readModel||!isFn(c.readModel))issues.push(k+': read model '+c.readModel+' does not exist');}
    if(c.status==='reference'){if(c.owners&&c.owners.length)issues.push(k+': reference data names a runtime owner');if(!c.readModel||!isFn(c.readModel))issues.push(k+': read model '+c.readModel+' does not exist');}
    if(c.status==='implemented'){
      if(!c.owners||!c.owners.length)issues.push(k+': implemented but names no owner');
      (c.owners||[]).forEach(function(o){if(!isFn(o))issues.push(k+': owner '+o+' does not exist');});
      if(!c.readModel||!isFn(c.readModel))issues.push(k+': read model '+c.readModel+' does not exist');
      if(c.registry&&typeof g[c.registry]==='undefined')issues.push(k+': registry '+c.registry+' does not exist');
    }else if(c.status!=='reference'&&c.status!=='projection'){   /* unfinished work states when it will be done; reference data is not unfinished */
      if(!c.horizon)issues.push(k+': '+c.status+' with no horizon');
      (c.existing||[]).forEach(function(o){if(!isFn(o))issues.push(k+': existing part '+o+' does not exist');});
      if(c.status==='partial'){if(!c.gap)issues.push(k+': partial with no stated gap');if(c.readModel&&!isFn(c.readModel))issues.push(k+': read model missing');}
    }
  });
  /* Every store in the record is owned or explained. */
  var owned={};Object.keys(ENTITY_CONTRACTS).forEach(function(k){(ENTITY_CONTRACTS[k].stores||[]).forEach(function(s){owned[s]=1;});});
  Object.keys(db).forEach(function(s){if(!owned[s]&&!SUPPORTING_STORES[s])issues.push('store "'+s+'" belongs to no contract and is not listed as supporting');});
  Object.keys(SUPPORTING_STORES).forEach(function(s){if(!(s in db))issues.push('supporting store "'+s+'" is not in the record');});
  var by={};Object.keys(ENTITY_CONTRACTS).forEach(function(k){var st=ENTITY_CONTRACTS[k].status;(by[st]=by[st]||[]).push(k);});
  return {ok:issues.length===0,issues:issues,byStatus:by,contracts:Object.keys(ENTITY_CONTRACTS).length};
}
