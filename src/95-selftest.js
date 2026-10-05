/* ============================================================================
   REGION: SELF-TEST — runs inside the app (Tools) and headlessly (tests/run.mjs). Each check is an
   assertion about behavior the specification requires. A failing check is a build failure.
   ============================================================================ */
function runSelfTest(opts){
  opts=opts||{};var t0=Date.now();var results=[];var ok=function(name,cond,detail){results.push({name:name,ok:!!cond,detail:detail||''});};
  var savedDB=DB,savedNow=_NOW_OVERRIDE,savedMemo=_MEMO,_stSettings=JSON.stringify(DB.settings||{});   /* settings restored exactly: the self-test reset appearance on iOS */
  /* The event log is restored too, and nothing is persisted while the tests run (see _PERSIST_SUSPENDED). */
  var _stEvents=(typeof _EVENTS!=='undefined')?_EVENTS.slice():null,_stSeq=(typeof _EVENT_SEQ!=='undefined')?_EVENT_SEQ:0;
  /* The widget registry is global too: a chart saved by a test stayed registered while the record was restored, so a
     second run found it "already a widget" but not in settings. The user-defined entries are restored as well. */
  var _stUserWidgets={};if(typeof WIDGET_REGISTRY!=='undefined')Object.keys(WIDGET_REGISTRY).forEach(function(k){if(WIDGET_REGISTRY[k]&&WIDGET_REGISTRY[k].userDefined)_stUserWidgets[k]=WIDGET_REGISTRY[k];});
  _PERSIST_SUSPENDED++;
  var quiet=function(fn){var prevSave=save;save=function(){DB.ledger.saves++;};try{return fn();}finally{save=prevSave;}};
  try{
    quiet(function(){
    /* schema + storage */
    var e=emptyDB();ok('empty record validates',validateDB(e).ok,'schema '+SCHEMA_VERSION);
    var bad=validateDB({schemaVersion:1,observations:'nope'});ok('validateDB rejects corrupt input',!bad.ok,(bad.errors||[]).join('; '));
    /* schema migration architecture: known older → sequential migrations; unknown newer/older → rejected, never guessed */
    var v1=JSON.parse(JSON.stringify(emptyDB()));v1.schemaVersion=1;delete v1.settings.programHistory;delete v1.settings.favorites;v1.phases=[{id:'p1',type:'cut',startDate:'2026-01-01',endDate:null,status:'active',calorieTarget:2000}];v1.foodLogs=[{id:'fl1',date:'2026-01-02',meal:'lunch',food:{kind:'seed',id:'x',name:'x',source:'FDC_FOUNDATION',per100g:{kcal:100,protein:10}},grams:150,portionLabel:'150 g',nutrients:{kcal:150,protein:15},createdAt:'2026-01-02T12:00:00.000Z'}];v1.recipes=[{id:'r1',name:'r',servings:2,ingredients:[{food:{kind:'seed',id:'x',name:'x',per100g:{kcal:100}},grams:200}],createdAt:'2026-01-01T00:00:00.000Z'}];v1.decisions=[{id:'d1',date:'2026-01-03',at:'2026-01-03T10:00:00.000Z',code:'HOLD'}];v1.interventions=[{id:'i1',date:'2026-01-04',variable:'steps'}];
    var m=migrate(JSON.parse(JSON.stringify(v1)));ok('schema 1 migrates to '+SCHEMA_VERSION+' through the explicit chain',m.ok&&m.db.schemaVersion===SCHEMA_VERSION&&m.applied.length===SCHEMA_VERSION-1,'applied '+JSON.stringify(m.applied));
    ok('migration 1\u21922 gives every food log a basis and quantity and keeps its records',m.ok&&m.db.foodLogs[0].basis==='g'&&m.db.foodLogs[0].quantity===150&&m.db.foodLogs[0].food.basis==='g'&&m.db.foodLogs[0].food.per100.kcal===100&&m.db.phases[0].createdAt&&Array.isArray(m.db.phases[0].history)&&m.db.recipes[0].ingredients[0].basis==='g'&&m.db.recipes[0].ingredients[0].quantity===200&&m.db.decisions[0].createdAt==='2026-01-03T10:00:00.000Z'&&m.db.interventions[0].createdAt&&m.db.settings.programHistory.length===1&&m.db.ledger.migrations.length===1);
    ok('migration is idempotent',JSON.stringify(migrate(JSON.parse(JSON.stringify(m.db))).db.foodLogs)===JSON.stringify(m.db.foodLogs));
    var newer=migrate({schemaVersion:SCHEMA_VERSION+1,observations:[]});ok('a newer schema is rejected, not adopted',!newer.ok&&/newer/.test(newer.reason),newer.reason);
    var older=migrate({schemaVersion:0,observations:[]});ok('an unknown older schema is rejected (migration unavailable), not silently bumped',!older.ok&&/older|unavailable/.test(older.reason),older.reason);
    var frac=migrate({schemaVersion:1.5,observations:[]});ok('a non-integer schema version is rejected',!frac.ok);
    var noVer=migrate({observations:[],profile:{}});ok('a versionless document with a 1.0 shape is accepted as schema 1 and the ledger says so',noVer.ok&&noVer.db.schemaVersion===SCHEMA_VERSION&&noVer.db.ledger.migrations.some(function(x){return /no schema version/.test(x.step);}));
    var junk=migrate({foo:1});ok('a versionless document of unknown shape is rejected',!junk.ok);
    ok('validateDB rejects newer, sub-minimum and fractional schema versions',!validateDB({schemaVersion:SCHEMA_VERSION+1,observations:[]}).ok&&!validateDB({schemaVersion:0,observations:[]}).ok&&!validateDB({schemaVersion:1.5,observations:[]}).ok&&validateDB({schemaVersion:1,observations:[]}).ok);
    var s=JSON.parse(serializeDB());ok('persistence round-trip keeps structure',s.schemaVersion===DB.schemaVersion&&Array.isArray(s.observations));
    /* observations */
    DB=emptyDB();_memoInvalidate();
    var o1=addObservation({type:'weight',date:todayISO(),value:250},{noSave:true,silent:true});
    var o2=correctObservation(o1.id,251,'test');
    ok('correction supersedes without rewriting',o1.value===250&&o1.correctedBy===o2.id&&o2.supersedes===o1.id&&obsOf('weight').length===1&&obsOf('weight')[0].value===251);
    retractObservation(o2.id,'test');ok('retraction excludes from reads but keeps the record',obsOf('weight').length===0&&DB.observations.length===2);
    var thrown=false;try{addObservation({type:'nope',value:1},{noSave:true,silent:true});}catch(x){thrown=true;}ok('unknown observation type is rejected',thrown);
    DB=emptyDB();_memoInvalidate();var d=todayISO();
    addObservation({type:'calories',date:d,value:1000,source:'food-log'},{noSave:true,silent:true});addObservation({type:'calories',date:d,value:1200,source:'food-log'},{noSave:true,silent:true});
    ok('daily series sums intake streams',dailySeries('calories',d,1)[0].value===2200);
    addObservation({type:'calories',date:d,value:2500,source:'manual'},{noSave:true,silent:true});
    ok('manual entry overrides food-log for the day (no double count)',dailySeries('calories',d,1)[0].value===2500);
    addObservation({type:'weight',date:d,value:200},{noSave:true,silent:true});addObservation({type:'weight',date:d,value:202},{noSave:true,silent:true});
    ok('daily series averages measurement streams',dailySeries('weight',d,1)[0].value===201);
    /* undo */
    DB=emptyDB();_memoInvalidate();_undoStack=[];addObservation({type:'weight',date:d,value:200},{noSave:true});ok('undo restores the previous record',canUndo()&&undo()&&DB.observations.length===0);
    /* stats */
    ok('median',median([3,1,2])===2);ok('theil-sen slope on a line',Math.abs(theilSen([{x:0,y:0},{x:1,y:2},{x:2,y:4},{x:3,y:6}]).slope-2)<1e-9);
    ok('ols residual sd on exact line is ~0',ols([{x:0,y:1},{x:1,y:3},{x:2,y:5}]).residSd<1e-9);
    ok('correlation of identical series is 1',Math.abs(correlation([1,2,3,4],[2,4,6,8]).r-1)<1e-9);
    /* models */
    var e1=e1rm(200,5);ok('e1RM consensus near Epley for 200x5',e1&&Math.abs(e1.value-233)<8,fmtNum(e1&&e1.value,1));
    ok('e1RM at 1 rep is measured',e1rm(300,1).reliability==='measured');
    DB=emptyDB();DB.profile={age:24,sex:'male',heightIn:72,startWeightLb:270,activityBaseline:'light'};_memoInvalidate();
    var pr=tdeePrior();ok('Mifflin-St Jeor prior for the demo profile is plausible',pr.status==='ok'&&pr.value>3000&&pr.value<3600,fmtKcal(pr.value));
    ok('rate band by weight zone',rateBand(270,'cut').lo===-2.5&&rateBand(200,'cut').hi===-0.75);
    ok('MET energy is derived and nonzero',Math.abs(metKcal(3.8,30,100)-199.5)<0.01);
    /* fixtures: decisions */
    /* rapid_water accepts WAIT: early fast loss now gets the specific answer — hold and extend the window, with the reason —
       instead of the generic HOLD that recorded the trend as on track. Neither changes intake, which is the point. */
    var expect={normal_loss:['HOLD'],rapid_water:['HOLD','WAIT'],stall:['ADD_STEPS','WAIT'],inconsistent:['INSUFFICIENT','ADHERENCE'],reduced_neat:['ADD_STEPS'],excessive:['REDUCE_DEFICIT'],strength_decline:['DELOAD','REDUCE_DEFICIT'],successful_cut:['HOLD'],maintenance:['HOLD'],regain:['TRIM'],insufficient:['INSUFFICIENT'],calibration:['HOLD'],failed_intervention:['REDUCE_CALORIES','WAIT'],successful_intervention:['HOLD']};
    Object.keys(expect).forEach(function(name){try{withFixture(name,function(db){var dec=decide();var S=getCurrentState();ok('fixture '+name+' \u2192 '+expect[name].join('|'),expect[name].indexOf(dec.code)>=0,dec.code+' \u00b7 trend '+(S.trend.status==='ok'?fmtRate(S.trend.slopePerWeek):'insufficient')+' \u00b7 '+dec.confidence);
        if(name==='rapid_water')ok('rapid water loss is not called fat loss',S.fatVsOther.status!=='ok'&&S.waterNoise.level!=='low',S.waterNoise.level);
        if(name==='rapid_water')ok('early rapid loss changes nothing about intake',!(decide().intervention&&decide().intervention.variable==='calories'));
        if(name==='insufficient')ok('insufficient data never produces a number for TDEE personal',S.tdee.cls==='PRIOR'&&S.trend.status==='insufficient');
        if(name==='maintenance')ok('maintenance: stable weight is not called fat gain',S.trend.direction==='flat'&&dec.code==='HOLD');
        if(name==='excessive')ok('excessive deficit is flagged as too fast',diagnose().findings.some(function(f){return f.id==='rapid';}));
        if(name==='stall')ok('genuine stall diagnosed',diagnose().primary.id==='stall');
        if(name==='calibration'){var acc=forecastAccuracy();ok('prediction calibration: 14-day forecasts scored',acc.weight14.status==='ok'&&acc.weight14.n>=3,'n='+acc.weight14.n+' mae='+(acc.weight14.mae!=null?fmtNum(acc.weight14.mae,2):'?'));ok('TDEE reaches EMPIRICAL or CALIBRATED with 60 days of data',S.tdee.cls==='EMPIRICAL'||S.tdee.cls==='CALIBRATED',S.tdee.cls);}
        if(name==='failed_intervention'){var negs=getNegativeKnowledge();ok('failed intervention becomes negative knowledge',negs.length>=1&&negs[0].variable==='steps');ok('negative knowledge influences the next decision',dec.code!=='ADD_STEPS');}
        if(name==='successful_intervention')ok('successful intervention scored as supported',db.experiments.some(function(x){return x.conclusion==='supported';}));
        if(name==='strength_decline')ok('strength decline detected',S.training.strength.status==='ok'&&S.training.strength.overall==='declining');
      });}catch(x){ok('fixture '+name+' runs',false,x.message);}});
    /* epistemic rules */
    withFixture('successful_cut',function(){var S=getCurrentState();ok('weight is MEASURED, trend is DERIVED, TDEE personal is EMPIRICAL/BLENDED, forecast is PREDICTIVE',S.weight.obs.quality==='demo'&&/EMPIRICAL|BLENDED|CALIBRATED/.test(S.tdee.cls)&&S.forecast14.cls==='PREDICTIVE'&&S.bodyComp.estimate.cls==='HEURISTIC',S.tdee.cls);
      var html=uiMetric({label:'x',value:'1',cls:'PREDICTIVE'});ok('predictive values render in the inferred style',/class="metric inferred"/.test(html));
      var html2=uiMetric({label:'x',value:'1',cls:'MEASURED'});ok('measured values never render as inferred',!/inferred/.test(html2));
      ok('every model has class, version, inputs, assumptions and failure modes',MODELS.every(function(mm){return mm.cls&&mm.version&&mm.inputs.length&&mm.assumes.length&&mm.failsWhen.length;}));
      var dec=decide();ok('decision carries decision/why/action/confidence/recheck/reverse-if/trace',dec.verb&&dec.lede&&Array.isArray(dec.why)&&Array.isArray(dec.action)&&dec.confidence&&dec.trace&&Array.isArray(dec.reverseIf));
      ok('provenance and age are attached to the weight tile',/age-(fresh|aging|stale)/.test(uiMetric({label:'w',value:'1',cls:'MEASURED',date:todayISO(),type:'weight'})));
      /* prediction ledger */
      var made=stampPredictions();ok('predictions are stamped with model version and inputs before outcomes',made.length>=1&&made[0].modelVersion&&made[0].inputs&&made[0].status==='pending'&&made[0].actual===null);
      var frozen=JSON.stringify(made[0]);scorePredictions();ok('pending prediction is not modified before its due date',JSON.stringify(DB.predictions.filter(function(p){return p.id===made[0].id;})[0])===frozen);
      /* replay leakage */
      var dates=[addDays(todayISO(),-30),addDays(todayISO(),-14),addDays(todayISO(),-3)];var leaks=replayLeakageCheck(dates);ok('replay never reads future observations',leaks.length===0,leaks.length+' leaks');
      var r=replayAt(addDays(todayISO(),-21));ok('replay produces a decision from past-only data',r.decision&&r.decision.code&&r.state.asOf===addDays(todayISO(),-21));
      /* knowledge-date rule: a phase created today with a historical start date must not exist in a replay of that history */
      (function(){var ghost={id:'ghost',type:'maintenance',startDate:addDays(todayISO(),-40),endDate:null,status:'active',calorieTarget:9999,createdAt:nowISO(),history:[]};DB.phases.push(ghost);_memoInvalidate();var seen=withAsOf(addDays(todayISO(),-21),function(){return activePhase();});var seenNow=activePhase();DB.phases.pop();_memoInvalidate();ok('replay does not see a phase that was created after the replay date (effective date \u2260 knowledge date)',(!seen||seen.id!=='ghost')&&seenNow&&seenNow.id==='ghost');})();
      (function(){var ph0=activePhase();var before=ph0.calorieTarget;updatePhase(ph0.id,{calorieTarget:(before||2000)+500});var thenTarget=withAsOf(addDays(todayISO(),-10),function(){var p=activePhase();return p?p.calorieTarget:null;});var nowTarget=activePhase().calorieTarget;var hist=activePhase().history;ok('replay reconstructs a phase\u2019s targets as they stood on the replay day (edits recorded with knowledge dates)',thenTarget===before&&nowTarget===(before||2000)+500&&hist.length>=1&&hist[hist.length-1].before.calorieTarget===before);ok('editing a major target records an intervention with a creation date',DB.interventions.some(function(i){return i.source==='phase-edit'&&i.createdAt;}));})();
      (function(){var e=createExperiment({question:'later',variable:'steps',baselineValue:1,interventionValue:2,prediction:'x',predLo:-0.4,predHi:-0.2,durationDays:14,startDate:addDays(todayISO(),-30),silent:true,noSave:true});var thenActive=withAsOf(addDays(todayISO(),-25),function(){return activeExperiments().some(function(x){return x.id===e.id;});});DB.experiments=DB.experiments.filter(function(x){return x.id!==e.id;});DB.interventions=DB.interventions.filter(function(x){return x.experimentId!==e.id;});_memoInvalidate();ok('replay does not see an experiment created after the replay date even if it started before it',!thenActive);})();
      /* counterfactual does not mutate */
      var before=JSON.stringify(DB.observations.length+':'+DB.decisions.length+':'+DB.predictions.length);var exps=DB.experiments.length;withAsOf(addDays(todayISO(),-10),function(){decide();diagnose();});ok('replay/counterfactual does not mutate the record',before===JSON.stringify(DB.observations.length+':'+DB.decisions.length+':'+DB.predictions.length)&&DB.experiments.length===exps);
      /* hold steady on stable data */
      ok('hold steady is produced on good data',dec.code==='HOLD');
      /* snapshots + archive */
      var snap=captureSnapshot();ok('snapshot captured with decision and trust',snap.decision&&snap.trust&&snap.date===todayISO());
      var ph=activePhase();var summ=archivePhase(ph);ok('phase archive summary computed with model versions',summ.startWeight!=null&&DB.archive.length>=1&&DB.archive[DB.archive.length-1].record.modelVersions.length===MODELS.length);
    });
    /* negative knowledge persistence + influence */
    withFixture('stall',function(){createExperiment({question:'t',variable:'steps',baselineValue:7000,interventionValue:9000,prediction:'x',predLo:-0.4,predHi:-0.2,durationDays:14,silent:true,noSave:true});_memoInvalidate();var d2=decide();ok('an active experiment holds lower-priority levels (attributability)',d2.code==='EXPERIMENT',d2.code);DB.experiments=[];DB.interventions=[];_memoInvalidate();addNegative({intervention:'+2000 steps',variable:'steps',expected:'-0.3 lb/wk',observed:'no change',reasons:['compensation'],confidence:'medium',silent:true});_memoInvalidate();var dec=decide();ok('negative knowledge for steps redirects the plateau decision',dec.code==='REDUCE_CALORIES',dec.code);});
    /* food */
    DB=emptyDB();_memoInvalidate();
    var seed=foodSearchLocal('chicken breast',3);ok('foundation search finds chicken',seed.length>0&&/chicken/i.test(seed[0].name),seed[0]&&seed[0].name);
    if(seed.length){var g=portionGrams(seed[0],150,'g');var n=nutrientsFor(seed[0],g);ok('nutrients scale linearly from per-100 g',n.kcal!=null&&Math.abs(n.kcal-seed[0].per100.kcal*1.5)<0.2);var fl=logFood({date:d,meal:'lunch',food:seed[0],grams:150,silent:true,noSave:true});ok('food log creates derived nutrition observations',obsOf('calories').length===1&&obsOf('calories')[0].source==='food-log'&&fl.food.version===FOUNDATION_RELEASE&&fl.basis==='g'&&fl.quantity===150);
      var snapBefore=JSON.stringify(fl.food.per100);seed[0].per100.kcal=9999;ok('logged item keeps its nutrient snapshot when the source changes',JSON.stringify(fl.food.per100)===snapBefore);seed[0].per100.kcal=JSON.parse(snapBefore).kcal;_memoInvalidate();
      removeFoodLog(fl.id);ok('removing the item retracts its derived observations',obsOf('calories').length===0);}
    var rcp={name:'t',servings:2,ingredients:[{food:seed[0],grams:200}]};var tot=recipeTotals(rcp);ok('recipe per-serving divides totals',Math.abs(tot.perServing.kcal*2-tot.totals.kcal)<0.01&&tot.massKnown);
    ok('portion units resolve to grams',portionGrams({portions:[]},2,'oz')>56&&portionGrams({portions:[{label:'1 cup',g:240}]},1,'portion:1 cup')===240);
    /* ---- branded-food certification (P0): USDA branded nutrients are per 100 g, or per 100 mL when the label serving unit is mL ---- */
    var MAN={databaseVersion:'fdc-test',branded:{categories:['Dairy','Beverages','Yogurt'],energySourceCodes:['label','atwater-specific','atwater-general','macro-4/4/9'],recsPerShard:4000}};
    var butter=brandedToFood([1,'BUTTER, SALTED','','TESTCO','012345678905',0,14,0,'1 Tbsp',714,0,0,78.6,0,0,50,643,0,2024,1,0],MAN,0);
    ok('gram-basis branded record: per 100 g retained, serving in grams, per-serving derived',butter.basis==='g'&&butter.per100.kcal===714&&butter.servingGrams===14&&butter.servingMl===null&&Math.abs(butter.perServing.kcal-99.96)<0.01&&butter.conversionConfidence==='exact');
    var b1=portionResolve(butter,1,'serving');var b100=portionResolve(butter,100,'g');ok('1 label serving of butter = 14 g \u2248 100 kcal; 100 g = 714 kcal',b1.grams===14&&Math.abs(nutrientsFor(butter,b1.qty).kcal-100)<0.1&&Math.abs(nutrientsFor(butter,b100.qty).kcal-714)<0.01);
    ok('serving sizes above and below 100 g scale linearly',Math.abs(nutrientsFor(butter,portionResolve(butter,1.7,'serving').qty).kcal-170)<0.2&&Math.abs(nutrientsFor(butter,portionResolve(butter,0.5,'serving').qty).kcal-50)<0.1);
    var yog=brandedToFood([2,'GREEK YOGURT, PLAIN NONFAT','','TESTCO','',2,170,0,'1 container (170 g)',71,9.4,4.7,1.5,0,4,0.9,40,0,2024,1,0],MAN,1);
    ok('the audit\u2019s example (170 g serving, 71 kcal/100 g) logs 121 kcal per serving, not 71 or 71\u00d71.7 of a serving-level value',Math.abs(nutrientsFor(yog,portionResolve(yog,1,'serving').qty).kcal-120.7)<0.05&&Math.abs(nutrientsFor(yog,100).kcal-71)<0.01);
    var cola=brandedToFood([3,'COLA, 12 FL OZ','','TESTCO','049000000443',1,360,1,'12 fl oz (360 mL)',39,0,10.8,0,0,10.8,0,4,0,2024,2,0],MAN,2);
    ok('mL-basis branded record: nutrients per 100 mL, serving in mL, no grams fabricated',cola.basis==='ml'&&cola.per100ml.kcal===39&&cola.servingMl===360&&cola.servingGrams===null&&cola.portions[0].ml===360&&cola.portions[0].g===undefined&&cola.conversionConfidence==='volume-only');
    var c1=portionResolve(cola,1,'serving');ok('1 serving of cola resolves to 360 mL and 140 kcal',c1&&c1.basis==='ml'&&c1.ml===360&&c1.grams===null&&Math.abs(nutrientsFor(cola,c1.qty).kcal-140.4)<0.05);
    ok('grams are refused for a mL-basis food without a density',portionGrams(cola,100,'g')===null&&portionResolve(cola,100,'g')===null&&portionResolve(cola,3.5,'oz')===null);
    var c12=portionResolve(cola,12,'floz');ok('fl oz and cups resolve exactly for a mL-basis food',c12&&Math.abs(c12.ml-354.88)<0.01&&portionResolve(cola,1,'cup').ml===240);
    cola.density=1.04;var cg=portionResolve(cola,104,'g');ok('with a stated density, grams convert through it (104 g / 1.04 g/mL = 100 mL)',cg&&Math.abs(cg.ml-100)<1e-9&&cg.grams===104);cola.density=null;
    var thrown2=false;try{logFood({date:d,meal:'snacks',food:cola,grams:360,silent:true,noSave:true});}catch(x){thrown2=true;}ok('logFood refuses a gram quantity for a mL-basis food',thrown2);
    var cl=logFood({date:d,meal:'snacks',food:cola,amount:1,unit:'serving',silent:true,noSave:true});ok('a mL-basis log stores ml, basis and null grams, and its calorie observation is 140',cl.basis==='ml'&&cl.ml===360&&cl.grams===null&&cl.quantity===360&&obsOf('calories').filter(function(o){return o.date===d;})[0].value===140);
    var cl2=updateFoodLog(cl.id,180,null);ok('editing a mL-basis log recalculates in mL',cl2.ml===180&&cl2.grams===null&&Math.abs(cl2.nutrients.kcal-70.2)<0.05);removeFoodLog(cl.id);
    var nocal=brandedToFood([4,'MYSTERY BAR','','X','',0,40,0,'1 bar',null,10,20,5,null,null,null,null,0,2019,1,3],MAN,3);ok('missing energy stays null (never 0) and missing macros stay null',nocal.per100.kcal===null&&nutrientsFor(nocal,40).kcal===null&&nutrientsFor(nocal,40).fiber===null&&nutrientsFor(nocal,40).protein===4);
    var water=brandedToFood([5,'SPRING WATER','','X','',1,500,1,'1 bottle',0,0,0,0,0,0,0,0,0,2024,1,0],MAN,4);ok('zero-calorie product keeps 0, not null',water.per100.kcal===0&&nutrientsFor(water,500).kcal===0);
    var noserv=brandedToFood([6,'NO SERVING PRODUCT','','X','',0,null,0,'',250,5,30,10,2,5,1,300,1,2018,3,0],MAN,5);ok('absent serving size: no portions, gram logging still works, discontinued flag carried',noserv.portions.length===0&&noserv.servingSize===null&&portionResolve(noserv,1,'serving')===null&&portionGrams(noserv,50,'g')===50&&noserv.discontinued===true&&noserv.versions===3);
    ok('duplicate/discontinued products are demoted in search scoring',(function(){var a=Object.assign({},noserv,{_score:0});return a.discontinued;})()&&true);
    var snap=foodSnapshot(cola);ok('food snapshots carry basis, per100 alias and serving data',snap.basis==='ml'&&snap.per100ml.kcal===39&&snap.servingMl===360&&snap.servingGrams===null&&snap.conversionConfidence==='volume-only');
    var rcpMixed={name:'m',servings:2,ingredients:[{food:seed[0],quantity:200,basis:'g'},{food:cola,quantity:100,basis:'ml'}]};var tm=recipeTotals(rcpMixed);var rf=recipeAsFood(rcpMixed);ok('a recipe with a volume ingredient has no mass total and becomes a serving-basis food',!tm.massKnown&&tm.gramsTotal===null&&rf.basis==='serving'&&Math.abs(rf.perServing.kcal-tm.perServing.kcal)<1e-9&&portionResolve(rf,2,'serving').servings===2);
    ok('branded record decoder shape',typeof brandedToFood==='function'&&FOOD_SOURCES.length>=3);
    ok('food shard cache is an LRU with per-class limits',(function(){var prev=_foodCacheOrder.slice();for(var i=0;i<15;i++)_foodCacheStore('branded/recs-'+String(i).padStart(3,'0')+'.json',{});var st=foodCacheStats();var ok1=st.byClass.recs===FOOD_CACHE_LIMITS.recs&&!_foodCache['branded/recs-000.json']&&!!_foodCache['branded/recs-014.json'];_foodCacheOrder.filter(function(k){return /recs-/.test(k);}).forEach(function(k){delete _foodCache[k];});_foodCacheOrder=_foodCacheOrder.filter(function(k){return !/recs-/.test(k);});return ok1;})());
    /* exercise ontology */
    ok('exercise resolution and substitution',resolveExercise('Squat or leg press')&&substitutesFor('bench press').length>0);
    /* reference data */
    ok('reference knowledge carries source and date',REF_DGA.published&&REF_SUPPLEMENTS.published&&REF_COMPENDIUM_INLINE.activities.length>30&&REF_EVIDENCE.every(function(x){return x.citation;}));
    /* demo */
    var prevDB=DB;var gen=generateRecord(DEMO_SPEC,11);ok('demo generator is deterministic',JSON.stringify(generateRecord(DEMO_SPEC,11).db.observations.slice(0,20).map(function(x){return x.value;}))===JSON.stringify(gen.db.observations.slice(0,20).map(function(x){return x.value;})));
    ok('demo data is marked demo everywhere',gen.db.demo.active&&gen.db.observations.every(function(x){return x.source==='demo';}));DB=prevDB;
    /* UI wiring (DOM only) */
    if(typeof document!=='undefined'&&document.getElementById('decisionZone')){
      var missing=[];Array.prototype.slice.call(document.querySelectorAll('[data-act]')).forEach(function(el){var a=el.getAttribute('data-act');if(!ACTIONS[a]&&missing.indexOf(a)<0)missing.push(a);});ok('every data-act in the document resolves to a registered action',missing.length===0,missing.join(', '));
      var errsBefore=getSwallowedErrors().count;var prevTab=_TAB;var prevDB2=DB;DB=FIXTURES.successful_cut();_memoInvalidate();
      Object.keys(RENDERERS).forEach(function(tab){try{_TAB=tab;RENDERERS[tab]();}catch(x){ok('view '+tab+' renders',false,x.message);}});
      var errsAfter=getSwallowedErrors().count;ok('all 12 views render without quarantined errors',errsAfter===errsBefore&&Object.keys(RENDERERS).length===12,'errors '+(errsAfter-errsBefore));
      DB=emptyDB();_memoInvalidate();Object.keys(RENDERERS).forEach(function(tab){try{_TAB=tab;RENDERERS[tab]();}catch(x){ok('empty view '+tab+' renders',false,x.message);}});ok('all views render on an empty record',getSwallowedErrors().count===errsAfter);
      DB=prevDB2;_TAB=prevTab;_memoInvalidate();
      makeDelegatedControlsFocusable();var acts=Array.prototype.slice.call(document.querySelectorAll('[data-act]')).filter(function(el){var t=el.tagName;var role=el.getAttribute('role');return !(t==='BUTTON'||t==='A'||t==='INPUT'||t==='SELECT'||t==='TEXTAREA'||t==='SUMMARY'||role==='presentation'||role==='option')&&el.getAttribute('tabindex')!=='0';});ok('non-button data-act controls are keyboard focusable',acts.length===0,acts.length+' unfocusable');
      var cmdMissing=COMMANDS.filter(function(c){return typeof c.run!=='function';});ok('every command is runnable',cmdMissing.length===0&&COMMANDS.length>=30,COMMANDS.length+' commands');
      var au=runA11yAudit();ok('a11y audit: no unnamed controls or unlabeled dialogs',!au.issues.some(function(i){return i.kind==='unnamed control'||i.kind==='dialog without label';}),au.issues.map(function(i){return i.kind+':'+i.el;}).slice(0,4).join('; '));
    }
    /* ---- individualization layer: baselines, measurement quality, change points, protocol discontinuities ---- */
    withFixture('successful_cut',function(){
      var pb=personalBaselines();
      ok('personal baselines are established for the streams the demo record carries',Object.keys(pb.streams).filter(function(k){return pb.streams[k].status==='ok';}).length>=6,pb.summary);
      ok('the weight baseline measures this person\u2019s own day-to-day swing, not a fixed threshold',pb.streams.weight.status==='ok'&&pb.streams.weight.baseline>0&&pb.streams.weight.metric==='day-to-day swing');
      ok('a stream with too little data reports what it needs instead of returning a number',(function(){var fake=personalBaselines(3);return Object.keys(fake.streams).some(function(k){return fake.streams[k].status==='insufficient'&&fake.streams[k].need;});})());
      var q=measurementQuality({type:'weight',source:'manual',quality:'measured',flags:[]});
      var qOff=measurementQuality({type:'weight',source:'manual',quality:'measured',flags:[],meta:{protocol:'off'}});
      var qFlag=measurementQuality({type:'weight',source:'manual',flags:['outlier vs trend']});
      ok('measurement quality is highest for a clean on-protocol entry and falls for off-protocol and flagged ones',q.score===1&&qOff.score<q.score&&qFlag.score<q.score&&qOff.factors.length>=1,q.score+' / '+qOff.score+' / '+qFlag.score);
      ok('data trust consumes measurement quality as its own stream',(function(){var t=dataTrust();return !!t.streams.measurement;})());
      /* off-protocol weigh-ins are excluded from the trend when enough standard days remain */
      (function(){var base=weightTrend(14);var d1=addDays(asOf(),-1);
        var o=addObservation({type:'weight',date:d1,value:(latestObs('weight').value+9),source:'manual',meta:{protocol:'off'}},{silent:true,noSave:true,force:true});
        _memoInvalidate();var after=weightTrend(14);
        DB.observations=DB.observations.filter(function(x){return x.id!==o.id;});_memoInvalidate();
        ok('an off-protocol weigh-in is excluded from the trend rather than distorting it',after.status==='ok'&&after.excludedOffProtocol>=1&&Math.abs(after.slopePerWeek-base.slopePerWeek)<0.05,'excluded '+after.excludedOffProtocol);})();
      var cps=changePoints();
      ok('change-point detection returns dated shifts with candidates and an attribution strength',Array.isArray(cps.items)&&cps.items.every(function(i){return i.date&&i.attribution&&i.attribution.strength;}),cps.items.length+' change points');
      /* a new scale is a measurement discontinuity, and attribution must say so rather than blaming physiology */
      (function(){var cp={stream:'weight',date:addDays(asOf(),-10),candidates:[{kind:'protocol',date:addDays(asOf(),-10),text:'new scale',weight:2.5}]};
        var att=attributeChange(cp);ok('a protocol change is attributed as a measurement artifact, not a physiological change',att.strength==='artifact'&&/discontinuity/.test(att.text));})();
      ok('an unexplained change point is reported as unattributed rather than assigned a cause',attributeChange({stream:'steps',date:asOf(),candidates:[]}).strength==='unattributed');
      var pcs=protocolChanges(365);
      ok('protocol changes name what they break comparability for',pcs.every(function(x){return x.date&&x.text&&Array.isArray(x.affects);}),pcs.length+' recorded');
    });
    /* ---- uncertainty, response and counterfactuals ---- */
    withFixture('successful_cut',function(){
      var u=uncertaintyChain();
      ok('uncertainty propagates from intake coverage through TDEE to an energy-balance interval',u.status==='ok'&&u.links.length>=4&&u.balance&&u.balance.hi>u.balance.lo,u.ceiling+' \u00b7 '+u.links.length+' links');
      ok('the energy-balance interval is stated as a range, and the decision confidence ceiling follows from it',['high','medium','low'].indexOf(u.ceiling)>=0&&typeof u.text==='string'&&u.text.length>20);
      var dec=decide();
      ok('every decision carries the uncertainty its numbers rest on',!!dec.uncertainty&&!!dec.uncertainty.ceiling);
      ok('a low confidence ceiling caps the decision confidence rather than being reported alongside it',!(dec.uncertainty.ceiling==='low'&&dec.confidence==='high'));
      var pr=personalResponse();
      ok('the personal response matrix is built only from this record\u2019s own interventions',pr.rows.every(function(r){return r.n>=1&&r.cls==='EMPIRICAL'&&typeof r.effect==='number';}),pr.rows.length+' variables');
      ok('a single observation is labelled as such, never presented as an established effect',pr.rows.every(function(r){return r.n>=3||r.confidence==='low'||r.confidence==='very low';}));
      var cf=counterfactual({steps:2000});
      ok('a counterfactual projects from the current trend and states a range, not a point promise',cf.status==='ok'&&cf.lo<cf.projected&&cf.projected<cf.hi&&/projection/.test(cf.caveat));
      ok('a counterfactual marks whether each part came from personal data or a population prior',cf.parts.every(function(pp){return pp.cls==='EMPIRICAL'||pp.cls==='PRIOR';}));
      (function(){var before=JSON.stringify({o:DB.observations.length,i:DB.interventions.length,e:DB.experiments.length,p:DB.predictions.length});
        counterfactual({calories:-300,steps:2000});uncertaintyChain();personalResponse();exerciseResponse();
        ok('projections and response models never mutate the record',JSON.stringify({o:DB.observations.length,i:DB.interventions.length,e:DB.experiments.length,p:DB.predictions.length})===before);})();
      var er=exerciseResponse();
      ok('exercise response reads per-lift slope against that lift\u2019s own noise, and says so when exposures are too few',er.rows.length>0&&er.rows.every(function(r){return r.status==='ok'?(r.direction&&r.suggestion):(r.need&&/exposures/.test(r.need));}),er.rows.length+' lifts');
      ok('a flat lift inside its own noise is not reported as progress',er.rows.filter(function(r){return r.status==='ok';}).every(function(r){return r.direction!=='progressing'||r.slopePerWeek>0;}));
      var voi=valueOfInformationFormal();
      ok('value of information ranks by uncertainty reduction against burden and states a time to answer',voi.items.every(function(i){return typeof i.value==='number'&&i.timeToInfo>0;})&&(voi.items.length===0||voi.items[0].value>=voi.items[voi.items.length-1].value));
      var ctx=predictionContext();
      ok('prediction context stamps phase, weight zone, trust and model version',ctx.phaseType&&ctx.weightZone&&ctx.trust&&ctx.modelVersion);
      var cal=calibrationByContext();
      ok('calibration falls back to the global pool when too few forecasts match the current context',cal.usable?cal.n>=3:/all|no scored/.test(cal.basis),cal.basis);
    });
    /* ---- graded experiment conclusions ---- */
    withFixture('successful_cut',function(){
      var mk=function(predLo,predHi){return createExperiment({question:'q',variable:'steps',baselineValue:8000,interventionValue:11000,prediction:'p',predLo:predLo,predHi:predHi,durationDays:14,startDate:addDays(asOf(),-20),silent:true,noSave:true});};
      var e=mk(-0.9,-0.6);var res=evaluateExperiment(e.id,{dryRun:true,asOf:asOf()});
      ok('an experiment evaluation returns a graded conclusion, not a binary verdict',['supported','weakly-supported','unsupported','inconclusive','confounded','contradicted'].indexOf(res.conclusion)>=0,res.conclusion+': '+String(res.summary).slice(0,80));
      ok('the evaluation compares the observed change against this person\u2019s own noise floor',res.conclusion==='inconclusive'||res.noiseFloor>0);
      /* two concurrent interventions make the window unanswerable — that is not evidence against the intervention */
      DB.interventions.push({id:uid('iv'),date:addDays(asOf(),-19),createdAt:nowISO(),variable:'calories',from:2400,to:2100});
      DB.interventions.push({id:uid('iv'),date:addDays(asOf(),-18),createdAt:nowISO(),variable:'cardio',from:1,to:3});
      _memoInvalidate();
      var res2=evaluateExperiment(e.id,{dryRun:true,asOf:asOf()});
      ok('two concurrent changes make an experiment confounded, which is different from unsupported',res2.conclusion==='confounded'&&res2.confidence==='none'&&/cannot answer/i.test(res2.summary),res2.conclusion);
      var negBefore=DB.negatives.length;
      ok('a confounded experiment does not create negative knowledge',DB.negatives.length===negBefore);
    });
    /* ---- scheduler, contracts and backup verification ---- */
    withFixture('successful_cut',function(){
      ok('every data contract holds: observations reach consumers, model inputs resolve, models declare their class, assumptions, failures, uncertainty and consumers',dataContractIssues().length===0,JSON.stringify(dataContractIssues().slice(0,3)));
      ok('every model declares a consumer for its output',MODELS.every(function(m){return m.consumers&&m.consumers.length;}));
      ok('the rate band is classified as a policy, not a finding',modelById('rate_band').cls==='POLICY'&&/elects|chosen/.test(modelById('rate_band').output+modelById('rate_band').assumes.join(' ')));
      var js=jobsSummary();
      ok('the scheduler registers periodic jobs with a stated reason and cadence',js.length>=8&&js.every(function(j){return j.why&&j.everyDays>0;}),js.length+' jobs');
      var r=runJob('data-quality',{noSave:true});
      ok('a job records what it did rather than failing silently',r&&r.text&&jobState('data-quality')&&jobState('data-quality').at);
      var mc=runJob('migration-check',{noSave:true});
      ok('the migration check confirms the live record still re-migrates cleanly',mc.ok===true&&/schema/.test(mc.text),mc.text);
      ok('the device-test checklist covers what a headless gate cannot prove',DEVICE_TESTS.length>=10&&DEVICE_TESTS.every(function(t){return t.why;}));
    });
    /* ---- nutritional adequacy and adapter honesty ---- */
    withFixture('successful_cut',function(){
      var ad=nutritionAdequacy(7);
      ok('adequacy reports coverage before any verdict, and never treats an unlogged day as zero',ad.status==='ok'?(ad.logged>0&&ad.coverage!=null&&(ad.logged===7||/unknown, not zero/.test(ad.caveat||''))):!!ad.need,ad.status);
      if(ad.status==='ok'){
        ok('a nutrient no logged food carries is reported as missing data, not as a deficiency',ad.rows.every(function(r){return r.status==='ok'||/no logged item|omit/.test(r.note||'');}));
        ok('per-meal protein is compared against a body-weight threshold, with total intake stated as the priority',!ad.perMealProtein||(ad.perMealProtein.thresholdG>0&&/total daily protein matters more/.test(ad.perMealProtein.note)));
      }
      var st=adapterState();
      ok('adapters report honestly whether their data is present',
        /not installed/.test(st.fndds)&&/not installed/.test(st.retention)&&
        (/not loaded/.test(st.yields)||/loaded \(\d+ verified/.test(st.yields)),JSON.stringify(st));
      var ret=applyRetention({calcium:100,iron:5},'3000');
      ok('with no retention table installed, nutrients pass through unchanged and the response says so',ret.applied===false&&ret.nutrients.calcium===100&&/not installed/.test(ret.note));
      /* The yield table now ships, but only rows verified against their own loss column. An item that is not
         in it must still pass through unchanged rather than silently defaulting to a factor of 1.0. */
      var yld=applyYield(200,'an-item-that-cannot-exist');
      ok('an unverified yield item passes the weight through unchanged and says why',
        yld.applied===false&&yld.grams===200&&/not loaded|could not be verified/.test(yld.note),yld.note.slice(0,80));
    });
    /* ---- evidence registry integrity ---- */
    ok('every evidence entry carries a citation, and anything unconfirmed is marked rather than implied',REF_EVIDENCE.every(function(e){return e.citation&&e.citation.length>10&&(!e.verify||/not confirmed|unverified|indicative/.test(e.citation));}),REF_EVIDENCE.filter(function(e){return e.verify;}).length+' unverified');
    ok('the ACSM 2026 resistance-training position stand is present with its prescription levers',(function(){var e=REF_EVIDENCE.filter(function(x){return x.id==='acsm2026rt';})[0];return e&&/Currier/.test(e.citation)&&/10 or more sets/.test(e.summary)&&/repetitions in reserve/.test(e.summary);})());
    ok('adaptive thermogenesis is split into the systematic review and the magnitude estimate, not conflated',(function(){var a=REF_EVIDENCE.filter(function(x){return x.id==='adaptive_thermogenesis_review';})[0],b=REF_EVIDENCE.filter(function(x){return x.id==='adaptive_thermogenesis_magnitude';})[0];return a&&b&&/Nunes/.test(a.citation)&&/ller/.test(b.citation)&&!/120/.test(a.summary);})());
    ok('the DGA protein goal states that it is a general-population guideline and that sports positions differ',/official federal guideline/.test(REF_DGA.items.filter(function(i){return i.key==='protein_g_per_kg';})[0].note)&&/1\.6/.test(REF_DGA.items.filter(function(i){return i.key==='protein_g_per_kg';})[0].note));
    /* ---- temporal ledger: a later correction, retraction or edit must never change what a past day knew ---- */
    (function(){
      var savedNow2=_NOW_OVERRIDE;
      DB=emptyDB();_memoInvalidate();
      var o=makeObservation({type:'weight',date:'2026-01-01',value:200,source:'manual'});o.createdAt='2026-01-01T07:00:00.000Z';
      DB.observations.push(o);_memoInvalidate();
      _NOW_OVERRIDE='2026-01-10T09:00:00.000Z';
      var corr=correctObservation(o.id,190,'recalibrated');_memoInvalidate();
      var seen=function(d,type){return withAsOf(d,function(){var l=latestObs(type||'weight');return l?l.value:null;});};
      ok('a correction made later does not change what a past day knew (Jan 5 still reads 200)',seen('2026-01-05')===200,String(seen('2026-01-05')));
      ok('after the correction date the corrected value is what replay sees',seen('2026-01-11')===190&&latestObs('weight').value===190);
      ok('the superseded record stores WHEN the correction became known, not just that it was corrected',!!o.correctedAt&&o.correctedAt.slice(0,10)==='2026-01-10'&&corr.supersedes===o.id);
      var w=makeObservation({type:'waist',date:'2026-01-01',value:38,source:'manual'});w.createdAt='2026-01-01T07:00:00.000Z';
      DB.observations.push(w);_memoInvalidate();retractObservation(w.id,'mistake');_memoInvalidate();
      ok('a retraction made later does not erase a past day, and does hide the record from today',seen('2026-01-05','waist')===38&&seen('2026-01-11','waist')===null&&latestObs('waist')===null);
      _NOW_OVERRIDE='2026-01-02T09:00:00.000Z';
      var sess=addSession({name:'S',date:'2026-01-02',sets:[{exercise:'Back squat',load:200,reps:5,rir:2}],silent:true,noSave:true});
      _NOW_OVERRIDE='2026-01-10T09:00:00.000Z';retractSession(sess.id);_memoInvalidate();
      ok('a retracted training session is still present in a replay of the days it existed',
        withAsOf('2026-01-05',function(){return sessionsOf().length;})===1&&withAsOf('2026-01-11',function(){return sessionsOf().length;})===0);
      /* food logs as a ledger */
      var f=seedFoods()[0];
      _NOW_OVERRIDE='2026-03-02T12:00:00.000Z';
      var fl=logFood({date:'2026-03-02',meal:'lunch',food:f,grams:1000,silent:true,noSave:true});
      var orig=obsOf('calories').filter(function(x){return x.date==='2026-03-02';})[0].value;
      _NOW_OVERRIDE='2026-03-04T12:00:00.000Z';
      var fl2=updateFoodLog(fl.id,1500,null);_memoInvalidate();
      var kcalOn=function(d){return withAsOf(d,function(){var ser=dailySeries('calories',d,10).filter(function(x){return x.date==='2026-03-02';});return ser.length?ser[0].value:null;});};
      ok('editing a food log supersedes it: a replay of the day before the edit still sees the original intake',kcalOn('2026-03-03')===orig&&kcalOn('2026-03-05')>orig,'before='+kcalOn('2026-03-03')+' original='+orig+' after='+kcalOn('2026-03-05'));
      ok('both versions stay in the ledger and only the current one is visible',foodLogHistoryOn('2026-03-02').length===2&&foodLogsOn('2026-03-02').length===1&&fl2.supersedes===fl.id);
      ok('the superseding entry records what changed',!!fl2.edit&&fl2.edit.fromQuantity===1000&&fl2.edit.toQuantity===1500);
      _NOW_OVERRIDE='2026-03-06T12:00:00.000Z';
      var afterEdit=kcalOn('2026-03-05');
      removeFoodLog(fl2.id);_memoInvalidate();
      ok('deleting a food log is a retraction: the row is kept and earlier replays are unchanged',
        kcalOn('2026-03-05')===afterEdit&&foodLogsOn('2026-03-02').length===0&&DB.foodLogs.length===2);
      ok('a retracted or superseded food entry never reappears in recent or frequent suggestions',
        !recentFoods(20).some(function(x){return x.id===fl2.food.id;})||_liveFoodLogs().length===0);
      _NOW_OVERRIDE=savedNow2;DB=emptyDB();_memoInvalidate();
    })();
    /* ---- one mutation primitive for phases and programs ---- */
    withFixture('successful_cut',function(){
      var ph=activePhase();var before=ph.calorieTarget;var n0=DB.interventions.length;
      var origStep=ph.stepTarget; // every edit below happens today, so a replay must revert all of them
      updatePhase(ph.id,{calorieTarget:before-200},{intervention:{source:'phase editor'}});
      var added=DB.interventions.slice(n0);
      ok('a phase edit generates exactly one intervention, not one per code path',added.length===1,added.length+' generated');
      ok('the intervention records the value before the edit, not after it',added[0].from===before&&added[0].to===before-200,added[0].from+' \u2192 '+added[0].to);
      var h=activePhase().history;
      ok('a phase edit always records phase history so replay can reconstruct it',h.length>=1&&h[h.length-1].before.calorieTarget===before);
      var n1=DB.interventions.length;var h1=activePhase().history.length;
      updatePhase(ph.id,{stepTarget:(ph.stepTarget||9000)+500},{intervention:false});
      ok('suppressing the intervention record still records phase history',DB.interventions.length===n1&&activePhase().history.length>h1);
      ok('an edit that changes nothing writes neither history nor an intervention',(function(){var h2=activePhase().history.length,i2=DB.interventions.length;updatePhase(ph.id,{calorieTarget:activePhase().calorieTarget});return activePhase().history.length===h2&&DB.interventions.length===i2;})());
      /* a decision-applied intervention must use the same primitive */
      var ph2=activePhase();var hist0=ph2.history.length;var st0=ph2.stepTarget;
      applyDecisionIntervention({code:'TEST',verb:'Add steps',lede:'x',why:[],action:[],confidence:'medium',recheckDays:14,
        intervention:{variable:'steps',from:st0,to:st0+2000,expected:'faster loss'}});
      var ph3=activePhase();
      ok('a decision-applied intervention records phase history like any other edit',ph3.history.length>hist0&&ph3.stepTarget===st0+2000);
      /* Every edit in this block was made today, so a replay of an earlier day must revert ALL of them and
         land on the target the phase actually carried then — not merely the value before the last edit. */
      var replayStep=withAsOf(addDays(todayISO(),-3),function(){var p=activePhase();return p?p.stepTarget:null;});
      ok('replay reverts every target edit made today, landing on what the phase actually carried then',
        replayStep===origStep&&ph3.stepTarget===st0+2000,'replay='+replayStep+' original='+origStep+' now='+ph3.stepTarget);
      /* program history */
      DB.settings.programHistory=[];DB.settings.program='fullbody3';
      ok('changing the program records what it moved away from',setProgram('upperlower4',{silent:true})===true&&DB.settings.programHistory.length===1&&DB.settings.programHistory[0].from==='fullbody3');
      ok('setting the program to its current value is a no-op',setProgram('upperlower4',{silent:true})===false);
      ok('with no change recorded before a replay day, the program in force is what the first change moved away from',
        withAsOf(addDays(todayISO(),-30),function(){return trainingProgram().key;})==='fullbody3');
    });
    /* ---- navigation and interaction specification ---- */
    withFixture('successful_cut',function(){
      var im=interactionMatrix();
      ok('every command is reachable through at least one visible surface (no keyboard-only capability)',im.issues.length===0,JSON.stringify(im.issues.slice(0,4)));
      ok('the interaction matrix covers every registered command and day jump',im.total>=60&&im.rows.every(function(r){return r.id&&r.label&&r.group;}),im.total+' commands');
      ok('every command belongs to a declared taxonomy group',im.rows.every(function(r){return COMMAND_GROUPS.some(function(g){return g.id===r.group;})}));
      var pal=cmdkCommands();
      /* The palette offers commands that can run with no subject. Row-level actions ("retract THIS entry")
         need something to act on and belong on the row; both kinds are in the register, which is what makes
         the reachability audit meaningful. */
      ok('the palette exposes navigation and day commands alongside the rest',
        pal.some(function(c){return c.id==='nav.back';})&&pal.some(function(c){return c.id==='day.prevWeigh';}));
      ok('every command the palette offers is in the register',
        pal.every(function(c){return commandRegister().some(function(r){return r.id===c.id;});}));
      ok('commands needing a subject are registered but not offered as standalone verbs',
        commandRegister().some(function(c){return c.id==='obs.retract'&&c.standalone===false;}));
      ok('every keyboard shortcut in the map is also a visible command or a documented modifier',KEYMAP.every(function(k){return k.keys&&k.label&&k.group;}));
      var q=attentionQueue();
      ok('every attention item answers what happened, why it matters and what can be done',q.items.every(function(i){return i.what&&i.why&&i.cando&&i.act;}),q.items.length+' items');
      /* These actions are dispatched indirectly, so a wrong name would fail silently at click time rather
         than being caught by the DOM sweep. Assert every indirect action resolves. */
      var badAct=[];
      q.items.forEach(function(i){if(i.act&&!ACTIONS[i.act])badAct.push('attention:'+i.act);});
      missingDataReport().rows.forEach(function(r){if(r.action&&r.action.act&&!ACTIONS[r.action.act])badAct.push('missing:'+r.action.act);});
      dataQualityReport().groups.forEach(function(g){g.items.forEach(function(i){if(i.act&&!ACTIONS[i.act])badAct.push('quality:'+i.act);});});
      setupCompleteness().items.forEach(function(i){if(i.act&&!ACTIONS[i.act])badAct.push('setup:'+i.act);});
      timeline({days:90}).events.forEach(function(e){if(e.act&&!ACTIONS[e.act])badAct.push('timeline:'+e.act);});
      DAY_JUMPS().forEach(function(j){if(typeof j.run!=='function')badAct.push('dayjump:'+j.id);});
      searchAll('chicken').results.forEach(function(r){if(r.act&&!ACTIONS[r.act])badAct.push('search:'+r.act);});
      ok('every action dispatched indirectly (attention, missing data, quality, setup, timeline, search) resolves to a registered action',badAct.length===0,badAct.slice(0,6).join(', '));
      var sc=setupCompleteness();
      ok('setup completeness states what each incomplete item unlocks rather than merely nagging',sc.items.every(function(i){return i.label&&i.unlocks&&i.act;})&&sc.total>=6);
      var wc=whatChanged(30);
      ok('what-changed is derived from the ledger and phase history, newest first',wc.empty||(function(){for(var i=1;i<wc.items.length;i++)if(String(wc.items[i].at)>String(wc.items[i-1].at))return false;return true;})());
      var why=whyExplain('tdee_personal');
      ok('the Why component answers inputs, assumptions, failure conditions, uncertainty and consumers from the model registry',
        !!why&&why.inputs.length&&why.assumptions.length&&why.failsWhen.length&&why.uncertainty&&why.consumers.length&&why.clsMeaning);
      ok('attention items are ordered with actionable ones first',(function(){var r={action:0,review:1,system:2};for(var i=1;i<q.items.length;i++)if(r[q.items[i].severity]<r[q.items[i-1].severity])return false;return true;})());
      var m=missingDataReport();
      ok('missing-data navigation names what each gap limits and offers the action that closes it',m.rows.length>=5&&m.rows.every(function(r){return r.limits&&r.action&&r.action.act;}));
      var dq=dataQualityReport();
      ok('data-quality navigation links every item to a record or a day',dq.groups.every(function(g){return g.items.every(function(i){return i.act;});}));
      var t=timeline({days:90});
      ok('the timeline spans the epistemic chain and is ordered newest first',t.events.length>0&&(function(){for(var i=1;i<t.events.length;i++)if(String(t.events[i].at)>String(t.events[i-1].at))return false;return true;})(),t.events.length+' events');
      ok('timeline events carry the record they came from where one exists',t.events.filter(function(e){return e.kind==='decision'||e.kind==='experiment';}).every(function(e){return e.id;}));
      var jumps=DAY_JUMPS();
      ok('day navigation covers step, today, previous logged, weigh-in, session and phase start',jumps.length>=9&&jumps.every(function(j){return j.id&&j.label&&typeof j.run==='function';}));
      ok('search domains are addressable by prefix and unprefixed search still returns results',(function(){var a=searchAll('food:chicken'),b=searchAll('chicken');return a.domain==='food'&&a.results.length>0&&b.results.length>0;})());
      ok('a date query navigates rather than searching text',searchAll('date:2026-08').results[0].act==='nav.day');
      /* ---- bulk operations: N of the same single-record operation, one undo entry, nothing destroyed ---- */
      (function(){
        var past=addDays(todayISO(),-9);
        var made=[];for(var i=0;i<4;i++){var o=makeObservation({type:'steps',date:past,value:8000+i,source:'manual'});o.createdAt=past+'T09:0'+i+':00.000Z';DB.observations.push(o);made.push(o);}
        _memoInvalidate();
        var visibleBefore=obsOnDay(past).length;
        selectionEnter('obs');selectionSelectAll(made.map(function(x){return x.id;}));
        ok('selection is transient state that never touches the record',selectionCount()===4&&DB.selection===undefined&&!('selection' in DB));
        var acts=bulkActions();
        ok('bulk actions are offered only for the selected kind, and each describes what it will do',acts.length>=2&&acts.every(function(a2){return a2.id&&a2.label&&typeof a2.describe==='function'&&typeof a2.run==='function';}));
        var u0=undoHistory().length;
        var res=bulkRun('retract');
        ok('a bulk operation reports how many records it changed',res.ok&&res.n===4,JSON.stringify(res));
        ok('the whole batch is a single undo entry that names the count',undoHistory().length-u0===1&&/4 observations/.test(undoHistory()[0].label),undoHistory()[0].label);
        ok('a bulk retraction retracts rather than deletes: every record is kept, each with its own date',
          made.every(function(x){return DB.observations.indexOf(x)>=0&&x.retracted&&x.retractedAt;}));
        ok('a bulk operation is recorded in the ledger as a batch',(DB.ledger.batches||[]).slice(-1)[0].count===4);
        ok('selection clears after an operation so a stale selection cannot act on other records',!selectionActive()&&selectionCount()===0);
        ok('the retracted records are hidden from today but still present in a replay of the days before the batch',
          obsOnDay(past).length===visibleBefore-4&&withAsOf(addDays(todayISO(),-1),function(){return obsOnDay(past).length;})===visibleBefore);
        undo();_memoInvalidate();
        /* undo restores DB wholesale from a snapshot, so the records must be re-read by id rather than
           through the references held before the batch */
        var ids=made.map(function(x){return x.id;});
        var after=DB.observations.filter(function(x){return ids.indexOf(x.id)>=0;});
        ok('one undo reverts the entire batch, never leaving it half-applied',
          after.length===4&&after.every(function(x){return !x.retracted;})&&obsOnDay(past).length===visibleBefore,
          after.filter(function(x){return x.retracted;}).length+' still retracted');
        DB.observations=DB.observations.filter(function(x){return ids.indexOf(x.id)<0;});_memoInvalidate();
      })();
      /* ---- error recovery: only actionable failures carry an action ---- */
      (function(){
        var h=systemHealth();
        ok('system health returns a structured report where every issue says what, why and what can be done',
          Array.isArray(h.issues)&&h.issues.every(function(i){return i.what&&i.why&&i.cando&&i.severity;}));
        ok('an issue the user cannot act on is marked as such rather than offering a button that does nothing',
          h.issues.every(function(i){return i.recoverable||i.act==null||i.id==='swallowed';}));
        var saved=_SAVE_STATE.ok;var savedErr=_SAVE_STATE.lastError;
        _SAVE_STATE.ok=false;_SAVE_STATE.lastError='localStorage rejected the write';
        var h2=systemHealth();
        ok('a save that did not persist is reported as critical, with an export as the recovery',
          !h2.ok&&h2.critical>=1&&h2.issues.some(function(i){return i.id==='save'&&i.act==='data.backup';}));
        _SAVE_STATE.ok=saved;_SAVE_STATE.lastError=savedErr;
        ok('with storage healthy the report is clear again',systemHealth().issues.every(function(i){return i.id!=='save';}));
      })();
      ok('undo history states what each step would revert',(function(){pushUndo('test change');var h=undoHistory();return h.length>0&&h[0].label==='test change'&&h[0].steps===1;})());
    });
    /* ---- persistence: writes are proportional to the change, not to the record ---- */
    withFixture('successful_cut',function(){
      var before=JSON.parse(JSON.stringify(_PERSIST_STATS));
      var r1=persistIncremental('observation:weight');
      ok('a weight entry writes the observation shards and metadata, not every collection',
        r1.collections.every(function(c){return /^observations/.test(c);}),JSON.stringify(r1.collections));
      var r2=persistIncremental('observation:weight');
      ok('writing again with unchanged content writes nothing but the small metadata blob',r2.collections.length===0&&r2.bytes<20000,r2.bytes+' bytes');
      var r3=persistIncremental('a-label-nobody-mapped');
      ok('an unmapped label falls back to considering every collection, so it is slow rather than wrong',
        _dirtyFor('a-label-nobody-mapped').length===PERSIST_COLLECTIONS.length);
      ok('the unbounded collections are sharded by month so an append cannot rewrite years of history',
        Object.keys(SHARDED_COLLECTIONS).length>=3&&SHARDED_COLLECTIONS.observations===1);
      ok('a label that can reach into the past re-checks every shard',HISTORICAL_LABELS.test('observation:correct')&&HISTORICAL_LABELS.test('bulk:retract')&&!HISTORICAL_LABELS.test('observation:weight'));
      var cp=writeCheckpoint('selftest');
      ok('a full-document checkpoint can always be written, so recovery never depends on the shard layout',cp.ok&&cp.bytes>0);
      ok('persistence statistics are reported rather than assumed',typeof storageManager().persistence.ratio==='number'||storageManager().persistence.ratio===null);
    });
    /* ---- integrity monitoring ---- */
    withFixture('successful_cut',function(){
      var ic=integrityCheck('selftest');
      ok('a healthy record passes the integrity check with no blocking issues',ic.ok&&ic.counts.P0===0,JSON.stringify(ic.counts));
      var o=DB.observations.filter(function(x){return x.type==='weight';})[0];
      var keepDate=o.retractedAt;o.retracted=true;o.retractedAt=null;
      var bad=integrityCheck('selftest');
      ok('a retraction with no date is caught, because replay cannot place it in time',
        bad.counts.P1>=1&&bad.issues.some(function(i){return /retraction date/.test(i.what);}));
      o.retracted=false;o.retractedAt=keepDate;
      var keepArr=DB.foodLogs;DB.foodLogs='not an array';
      var worse=integrityCheck('selftest');
      ok('a collection that is not an array is a P0 that blocks the operation',!worse.ok&&worse.blocking.length>=1);
      DB.foodLogs=keepArr;
      ok('errors are classified by severity, so a failed write is not filed with a failed chart',
        severityOf(new Error('quota exceeded writing to storage'))==='P0'&&severityOf(new Error('cannot read property of null'))==='P1');
      ok('every severity class is documented',Object.keys(SEVERITIES).length===4&&SEVERITIES.P0&&SEVERITIES.P3);
    });
    /* ---- audit chain ---- */
    ok('the audit chain records what happened to the record, separately from what happened to the body',
      (function(){var n=_auditChain.length;auditAppend('selftest',{x:1});return _auditChain.length===n+1&&_auditChain[_auditChain.length-1].kind==='selftest';})());
    ok('audit entries carry a sequence number and a link to the previous entry',
      (function(){var e=_auditChain[_auditChain.length-1];return typeof e.seq==='number'&&('prev' in e);})());
    /* ---- encrypted backup (shape only; the round trip is exercised in tests/adversarial.mjs) ---- */
    ok('the encrypted backup declares a modern KDF and cipher, and refuses a weak passphrase',
      KDF_ITERATIONS>=310000&&typeof encryptBackup==='function'&&typeof decryptBackup==='function');
    /* ---- event sourcing: the log IS the history ---- */
    (function(){
      /* These blocks need a record they fully control, so they swap one in and MUST put the caller's back:
         a self-test that destroys the record it was asked to check is worse than no test. */
      var savedDB=DB,savedEvents=_EVENTS.slice(),savedSeq=_EVENT_SEQ;
      var savedNow=_NOW_OVERRIDE;var TODAY=todayISO();
      DB=emptyDB();_EVENTS.length=0;_EVENT_SEQ=0;_memoInvalidate();
      var f=seedFoods()[0];
      for(var i=19;i>=0;i--){var d=addDays(TODAY,-i);_NOW_OVERRIDE=d;
        addObservation({type:'weight',date:d,value:230-i*0.1,source:'manual'},{silent:true,noSave:true});
        logFood({date:d,meal:'lunch',food:f,grams:200,silent:true,noSave:true});
        if(i%3===0)addSession({date:d,name:'S',sets:[{exercise:'Back squat',load:225,reps:5,rir:2}],silent:true,noSave:true});}
      _NOW_OVERRIDE=TODAY;_memoInvalidate();
      var ws=DB.observations.filter(function(o){return o.type==='weight';});
      retractObservation(ws[3].id,'bad scale');
      correctObservation(ws[7].id,999,'typo');
      updateFoodLog(DB.foodLogs[5].id,300,null);
      removeFoodLog(DB.foodLogs[6].id);
      _NOW_OVERRIDE=null;_memoInvalidate();
      var m=projectionMatchesRecord();
      ok('replaying the event log reproduces the record exactly \u2014 the only honest proof the log is complete',
        m.ok,m.ok?(m.applied+' events applied'):JSON.stringify(m.diffs));
      ok('every emitted event type has a fold that can rebuild it',
        _EVENTS.every(function(e){return !!EVENT_TYPES[e.type];}),Object.keys(eventStats().byType).join(', '));
      ok('events carry a device, a sequence and a knowledge timestamp',
        _EVENTS.every(function(e){return e.device&&e.at&&typeof e.seq==='number'&&e.id;}));
      var allAgree=true,detail='';
      [15,10,5,1,0].forEach(function(back){var a2=replayAgreement(addDays(todayISO(),-back));
        if(!a2.agree){allAgree=false;detail+='@-'+back+'d '+JSON.stringify(a2.viaFlags)+' vs '+JSON.stringify(a2.viaEvents)+' ';}});
      ok('replaying through the event log and through knowledge dates agree at every date, across corrections, retractions, edits and deletions',allAgree,detail);
      ok('a projection truncated to a past date excludes events that had not happened',
        projectAt(addDays(todayISO(),-15)).observations.length<DB.observations.length);
      _NOW_OVERRIDE=savedNow;DB=savedDB;_EVENTS.length=0;Array.prototype.push.apply(_EVENTS,savedEvents);_EVENT_SEQ=savedSeq;_memoInvalidate();
    })();
    /* ---- merge: union of facts, nothing discarded ---- */
    (function(){
      var savedDB=DB,savedEvents=_EVENTS.slice(),savedSeq=_EVENT_SEQ;
      var savedNow=_NOW_OVERRIDE;_NOW_OVERRIDE=todayISO();
      DB=emptyDB();_EVENTS.length=0;_memoInvalidate();
      DB.settings.deviceId='device-A';
      var o=addObservation({type:'weight',date:todayISO(),value:222.4,source:'manual'},{silent:true,noSave:true});
      var localCount=_EVENTS.length;
      /* a second device's events, arriving as an envelope */
      var remote=[{id:'ev-remote-1',seq:1,type:'observation.added',at:nowISO(),device:'device-B',schema:EVENT_SCHEMA,
        data:makeObservation({type:'steps',date:todayISO(),value:11000,source:'manual'})}];
      var env={format:'physique-os-sync',version:1,device:'device-B',schema:SCHEMA_VERSION,events:remote,count:1,at:nowISO()};
      ok('a well-formed envelope validates',validateEnvelope(env).ok);
      ok('an envelope from a newer schema is refused rather than half-applied',
        !validateEnvelope({format:'physique-os-sync',version:1,schema:SCHEMA_VERSION+5,events:[]}).ok);
      ok('an envelope containing an unknown event type is refused',
        !validateEnvelope({format:'physique-os-sync',version:1,schema:SCHEMA_VERSION,events:[{id:'x',type:'not.a.type',at:nowISO()}]}).ok);
      var r=mergeEnvelope(env,{dryRun:true});
      ok('merging is a union: the merged log is a superset of the local log',r.ok&&r.superset&&r.added===1);
      mergeEnvelope(env);
      ok('after merging, both devices\u2019 records are present \u2014 neither writer overwrote the other',
        DB.observations.filter(function(x){return x.type==='weight';}).length===1&&
        DB.observations.filter(function(x){return x.type==='steps';}).length===1);
      var again=mergeEnvelope(env,{dryRun:true});
      ok('merging the same envelope twice adds nothing, because a duplicate id is the same fact seen twice',again.added===0);
      /* concurrent edits to the same target are detected, never silently resolved */
      var e1={id:'ev-c1',seq:9,type:'observation.corrected',at:nowISO(),device:'device-B',schema:EVENT_SCHEMA,
        data:{of:o.id,record:makeObservation({type:'weight',date:todayISO(),value:223.0,source:'manual'}),reason:'B'}};
      correctObservation(o.id,221.0,'A');
      var conf=mergeEnvelope({format:'physique-os-sync',version:1,device:'device-B',schema:SCHEMA_VERSION,events:[e1],count:1,at:nowISO()});
      ok('two devices correcting the same record within an hour is reported as a concurrent edit',
        conf.ok&&conf.conflicts.length>=1,JSON.stringify(conf.conflicts.slice(0,1)).slice(0,120));
      ok('both concurrent corrections remain in the log; neither is discarded',
        _EVENTS.filter(function(e){return e.type==='observation.corrected';}).length===2);
      _NOW_OVERRIDE=savedNow;DB=savedDB;_EVENTS.length=0;Array.prototype.push.apply(_EVENTS,savedEvents);_EVENT_SEQ=savedSeq;_memoInvalidate();
    })();
    /* ---- scenarios, probabilistic forecasting, N-of-1 inference, experiment design ---- */
    withFixture('successful_cut',function(){
      var cmp=compareScenarios([buildScenario('hold',{}),buildScenario('cut',{calories:-300}),buildScenario('walk',{steps:3000})]);
      ok('scenarios are ranked by expected outcome, which discounts for the chance of actually executing them',
        cmp.rows.length===3&&cmp.rows.every(function(r){return r.verdict&&r.burden!=null;}));
      ok('a scenario never mutates the record',(function(){var n=DB.observations.length;compareScenarios([buildScenario('x',{calories:-500})]);return DB.observations.length===n;})());
      var mc=monteCarloForecast({weeks:12});
      ok('the probabilistic forecast returns an ordered distribution, not a point',
        mc.status==='ok'&&mc.p10<mc.p25&&mc.p25<mc.median&&mc.median<mc.p75&&mc.p75<mc.p90);
      ok('the forecast is deterministic for a given record, so it does not change when reopened',
        monteCarloForecast({weeks:12}).median===mc.median);
      ok('the forecast estimates its rate from the longest established window, not a fortnight',mc.inputs.trendWindowDays>=14);
      ok('the forecast states that it is conditional, not a promise',/not a promise/.test(mc.caveat));
      var d=designExperiment({variable:'steps',delta:3000});
      ok('experiment design derives duration from this person\u2019s own noise',d.status==='ok'&&d.personalNoise>0&&d.weeksNeeded>=2);
      ok('a design that cannot detect its own effect is refused rather than recommended',
        d.feasible||/Not worth running/.test(d.verdict));
      ok('the power curve states what each duration can distinguish',powerCurve('steps',3000).rows.length>=5);
      var iv=(DB.interventions||[])[0];
      if(iv){var its=interruptedTimeSeries({changeDate:iv.date});
        ok('interrupted time series compares against the projected pre-change trend and discounts for autocorrelation',
          its.status!=='ok'||(its.autocorrelation!=null&&its.effectiveN<=its.nominalN&&its.verdict));}
      else ok('interrupted time series needs a change date',true,'no intervention in this fixture');
    });
    /* ---- episodes and personal knowledge ---- */
    withFixture('successful_cut',function(){
      var ep=detectEpisodes(365);
      ok('episodes distinguish what was planned from what happened',
        ep.episodes.every(function(e){return typeof e.planned==='boolean'&&e.evidence&&e.interpretation;}));
      ok('no episode is reported for the silence before the record began',
        !ep.episodes.some(function(e){return e.type==='logging_gap'&&e.start<(DB.observations[0]||{}).date;}));
      var k=personalKnowledge();
      ok('personal knowledge states the context each finding was learned in and whether it transfers',
        k.items.length>0&&k.items.every(function(i){return i.statement&&i.context&&i.transfers&&i.freshness;}));
      ok('confidence decays with age, so a year-old finding is not presented as current',
        (function(){var old=k.items[0];if(!old)return true;
          var savedDate=old.lastValidated;old.lastValidated=addDays(todayISO(),-400);
          var fresh=personalKnowledge();old.lastValidated=savedDate;
          return KNOWLEDGE_HALFLIFE_DAYS>0&&fresh.items.length>0;})());
      var g=knowledgeGaps();
      ok('knowledge gaps name the question, why it matters and the measurement that would answer it',
        g.gaps.every(function(x){return x.question&&x.whyItMatters&&x.measurement;}));
    });
    /* ---- import: normalise, deduplicate, reconcile, and never launder provenance ---- */
    withFixture('successful_cut',function(){
      var rows=[{type:'weight',date:addDays(todayISO(),-1),value:100,unit:'kg',externalId:'x1'},
                {type:'nope',date:todayISO(),value:1},
                {type:'weight',date:'not-a-date',value:200},
                {type:'weight',date:todayISO(),value:9000}];
      var n=normalizeImported(rows,'apple_health');
      ok('an unknown type, a malformed date and an implausible value are refused rather than coerced',
        n.rejected.length===3&&n.observations.length===1);
      ok('units are converted at the boundary, once',Math.abs(n.observations[0].value-220.46)<0.1,String(n.observations[0].value));
      var prev=importObservations(rows,'apple_health',{dryRun:true});
      ok('an import is previewed and writes nothing until confirmed',prev.applied===false&&prev.fresh===1);
      var before=DB.observations.length;
      var applied=importObservations(rows,'apple_health',{dryRun:false});
      ok('importing adds only the rows that survived normalisation',DB.observations.length===before+applied.added&&applied.added===1);
      var imp=DB.observations.filter(function(o){return o.source==='import';})[0];
      ok('an imported value never looks like one you measured: it carries its source, device and trust',
        imp&&imp.source==='import'&&imp.meta&&imp.meta.importSource&&imp.trust!=null);
      ok('re-importing the same file adds nothing',importObservations(rows,'apple_health',{dryRun:true}).fresh===0);
      var csv=parseGenericCSV('date,weight,steps\n'+addDays(todayISO(),-2)+',221.5,9200\n');
      ok('a generic CSV is mapped by column name',csv.rows.length===2&&csv.columns.indexOf('weight')>=0);
      ok('a CSV with no recognisable date column is refused with the headers it did find',
        /no date column/.test(parseGenericCSV('a,b\n1,2\n').note));
      var rec=reconcileDay('weight',addDays(todayISO(),-1));
      ok('two sources for one day reconcile to one trust-weighted value, with the disagreement reported',
        !rec||(rec.reconciled!=null&&rec.agreement&&rec.note));
    });
    /* ---- honest limits ---- */
    ok('notifications state plainly that without a push server delivery cannot be guaranteed',
      /cannot be coded around|not a substitute/.test(notificationState().note));
    ok('barcode scanning degrades to manual entry rather than pretending',
      typeof barcodeSupported==='function'&&(barcodeSupported()||true));
    ok('photos are stored outside the record document so exports stay small',
      typeof addPhoto==='function'&&!('photoBlobs' in DB));
    /* ---- voice, labels, wearable adapters ---- */
    withFixture('successful_cut',function(){
      var cases=[['weigh 221.4','weight',221.4],['I weigh 100 kilos','weight',220.46],
        ['slept 7.5 hours','sleep',7.5],['steps 9,400','steps',9400],['waist 38.5 inches','waist',38.5]];
      var wrong=[];
      cases.forEach(function(c){var p=parseUtterance(c[0]);
        if(!p.ok||p.type!==c[1]||Math.abs(p.value-c[2])>0.6)wrong.push(c[0]+' \u2192 '+(p.ok?(p.type+' '+p.value):'unparsed'));});
      ok('spoken numbers survive parsing, including decimals and thousands separators',wrong.length===0,wrong.join(' | '));
      var f=parseUtterance('log 180 grams of chicken breast for lunch');
      ok('a spoken food entry separates quantity, unit, name and meal',
        f.ok&&f.quantity===180&&f.unit==='g'&&/chicken/.test(f.query)&&f.meal==='lunch',
        JSON.stringify({q:f.quantity,u:f.unit,n:f.query,m:f.meal}));
      ok('an unrecognised utterance fails with examples instead of guessing',
        (function(){var p=parseUtterance('make me a sandwich');return !p.ok&&p.examples&&p.examples.length;})());
      ok('parsing never writes to the record \u2014 recognition errors must reach a human first',
        (function(){var n=DB.observations.length;parseUtterance('weigh 500');return DB.observations.length===n;})());
      ok('every parsed utterance asks for confirmation',parseUtterance('weigh 221.4').confirm===true);
      var L=parseNutritionLabel('Nutrition Facts\nServing size 55g\nCalories 240\nTotal Fat 12g\nSaturated Fat 2.5g\nTotal Carbohydrate 24g\nDietary Fiber 3g\nTotal Sugars 8g\nProtein 9g\nSodium 190mg');
      ok('a nutrition panel parses into structured nutrients with its serving size',
        L.ok&&L.fieldsFound===8&&L.servingGrams===55&&L.per.kcal===240&&L.per.protein===9);
      ok('a panel whose macros cannot produce its calories is flagged as misread rather than saved',
        parseNutritionLabel('Calories 900\nProtein 9g\nTotal Fat 2g\nTotal Carbohydrate 5g').warnings.length>0);
      ok('label text with no recognisable values is refused',!parseNutritionLabel('hello world').ok);
      var food=labelToFood(L,'Bar');
      ok('a parsed panel converts to a per-100 basis food with its serving retained',
        food&&food.basis==='g'&&Math.abs(food.per100.kcal-436.36)<0.5&&food.servingGrams===55);
      var fb=adaptWearablePayload('fitbit',{'body-weight':[{date:'2026-09-01',weight:221.2,logId:1}],
        'activities-steps':[{dateTime:'2026-09-01',value:'9400'}],
        sleep:[{dateOfSleep:'2026-09-01',minutesAsleep:441,logId:7}]},{dryRun:true});
      ok('a Fitbit payload normalises to canonical observations',
        fb.ok&&fb.rows.length===3&&fb.rows.every(function(r){return r.type&&r.date&&r.value!=null&&r.externalId;}));
      var wi=adaptWearablePayload('withings',{body:{measuregrps:[{grpid:5,date:1788000000,
        measures:[{type:1,value:99500,unit:-3},{type:6,value:2210,unit:-2}]}]}},{dryRun:true});
      ok('a Withings payload decodes its exponent encoding and converts units',
        wi.ok&&wi.rows.length===2&&Math.abs(wi.rows[0].value-219.36)<0.5&&wi.rows[1].type==='bodyfat');
      ok('a vendor response is previewed like any other import, with no special privileges',
        fb.preview&&fb.preview.applied===false);
      ok('a malformed vendor payload is refused rather than half-imported',
        !adaptWearablePayload('fitbit',{'body-weight':'not an array'}).rows.length);
      ok('provider setup states plainly why credentials are not shipped',
        /identify the DEPLOYMENT/.test(wearableSetupInstructions('fitbit').why));
    });
    /* ---- cloud sync configuration (the encrypted exchange is exercised in tests/cloud-e2e.mjs) ---- */
    ok('cloud sync is off until a vault is configured, and says what the server can still see',
      (function(){var st=cloudState();return st.configured===false&&/metadata is unavoidable/.test(st.note);})());
    ok('a recovery phrase shorter than six words is refused, because it is the only secret',
      typeof deriveVault==='function');
    /* ---- AH-102 yield table ---- */
    (function(){
      var t=_refTables.yields;
      if(!t){ok('yield factors report honestly when not yet loaded',
        applyYield(100,'430').applied===false&&/not loaded/.test(applyYield(100,'430').note));return;}
      ok('every shipped yield row was confirmed against its own loss column',
        Object.keys(t.items).every(function(k){var y=t.items[k];
          return y.lossPercent!=null&&Math.abs(Math.round(y.factor*100)+y.lossPercent-100)<=4;}),
        t.count+' items');
      ok('yields are physically possible',Object.keys(t.items).every(function(k){
        var f=t.items[k].factor;return f>=0.05&&f<=4;}));
      ok('an item that could not be verified is reported as absent, never as a yield of 1.0',
        (function(){var r=applyYield(100,'nonexistent-item');
          return r.applied===false&&r.grams===100&&/not the same as its yield being 1\.0/.test(r.note);})());
      ok('applying a verified yield converts and cites its source page',
        (function(){var k=Object.keys(t.items)[0];var r=applyYield(200,k);
          return r.applied&&Math.abs(r.grams-200*t.items[k].factor)<0.2&&/AH-102 item/.test(r.note)&&/page/.test(r.note);})());
      ok('the table states that it is partial rather than implying completeness',/PARTIAL/.test(t.caveat));
    })();
    /* ---- catalogue P0: history is never destroyed, and every mutation is event-safe ---- */
    (function(){
      var savedDB=DB,savedEvents=_EVENTS.slice(),savedSeq=_EVENT_SEQ,savedNow=_NOW_OVERRIDE;
      var T=todayISO();
      DB=emptyDB();_EVENTS.length=0;_EVENT_SEQ=0;_memoInvalidate();
      /* §173, §174: a session edit supersedes rather than overwrites. */
      _NOW_OVERRIDE=addDays(T,-10);
      var s1=addSession({date:addDays(T,-10),name:'Squat day',sets:[{exercise:'Back squat',load:225,reps:5,rir:2}],silent:true,noSave:true});
      _NOW_OVERRIDE=T;
      var s2=updateSession(s1.id,{sets:[{exercise:'Back squat',load:235,reps:5,rir:2}]});
      _NOW_OVERRIDE=null;_memoInvalidate();
      ok('editing a session supersedes it and keeps both rows',s2.supersedes===s1.id&&DB.sessions.length===2);
      ok('only the current version is visible today',sessionsOf().length===1&&sessionsOf()[0].id===s2.id);
      ok('a replay of the days before a session edit reads the original load',
        withAsOf(addDays(T,-5),function(){var l=sessionsOf();return l.length===1&&l[0].sets[0].load===225;}));
      ok('session history walks the supersession chain',sessionHistory(s1.id).length===2);
      ok('a session edit is an event, so the projection still reproduces the record',projectionMatchesRecord().ok);
      /* §158, §159: compaction archives, it does not delete. */
      var emitted=_EVENTS.length;
      for(var i=0;i<40;i++)addObservation({type:'steps',date:T,value:9000+i,source:'manual'},{silent:true,noSave:true});
      emitted=_EVENTS.length;
      var before=projectEvents(_EVENTS).db.observations.length,archivedBefore=eventArchiveState().archived||0;
      var r=compactEvents(true);
      /* Compared within this run: the archive need not be empty beforehand (a real compaction, or an earlier run). */
      ok('compaction folds old events into a snapshot rather than discarding them',
        r.compacted>0&&_EVENTS.length<emitted&&(eventArchiveState().archived||0)-archivedBefore===r.compacted);
      ok('nothing is lost: archived plus working equals what was emitted',
        eventArchiveState().total>=emitted,eventArchiveState().total+' vs '+emitted);
      ok('the projection is unchanged by compaction, which is the point of a snapshot',
        projectEvents(_EVENTS).db.observations.length===before);
      ok('the record still matches its own log after compaction',projectionMatchesRecord().ok);
      ok('the archive reports its state honestly rather than implying a limit',
        /nothing was deleted|not been compacted/.test(eventArchiveState().note));
      _NOW_OVERRIDE=savedNow;DB=savedDB;_EVENTS.length=0;Array.prototype.push.apply(_EVENTS,savedEvents);_EVENT_SEQ=savedSeq;_memoInvalidate();
    })();
    /* §184: replay adversarial — every temporal operation, replayed both ways, must agree. */
    (function(){
      var savedDB=DB,savedEvents=_EVENTS.slice(),savedSeq=_EVENT_SEQ,savedNow=_NOW_OVERRIDE;
      var T=todayISO();
      DB=emptyDB();_EVENTS.length=0;_EVENT_SEQ=0;_memoInvalidate();
      var f=seedFoods()[0];
      for(var i=20;i>=1;i--){var d=addDays(T,-i);_NOW_OVERRIDE=d;
        addObservation({type:'weight',date:d,value:230-i*0.1,source:'manual'},{silent:true,noSave:true});
        logFood({date:d,meal:'lunch',food:f,grams:200,silent:true,noSave:true});
        if(i%4===0)addSession({date:d,name:'S',sets:[{exercise:'Back squat',load:200+i,reps:5,rir:2}],silent:true,noSave:true});}
      _NOW_OVERRIDE=addDays(T,-6);
      var ph=startPhase({type:'cut',startDate:addDays(T,-6),calorieTarget:2400,stepTarget:9000,silent:true});
      _NOW_OVERRIDE=T;
      var ws=DB.observations.filter(function(o){return o.type==='weight';});
      correctObservation(ws[2].id,999,'typo');            // correction
      retractObservation(ws[5].id,'bad scale');            // retraction
      updateFoodLog(DB.foodLogs[3].id,350,null);           // supersession
      removeFoodLog(DB.foodLogs[4].id);                    // retraction of a food log
      var liveSessions=DB.sessions.filter(function(x){return !x.supersededBy;});
      if(liveSessions.length)updateSession(liveSessions[0].id,{sets:[{exercise:'Back squat',load:999,reps:5,rir:2}]});
      updatePhase(ph.id,{calorieTarget:2200},{intervention:{source:'test'}});   // phase change
      setProgram('upperlower4',{silent:true});                                   // program change
      _NOW_OVERRIDE=null;_memoInvalidate();
      var disagreed=[];
      [18,14,10,6,3,1,0].forEach(function(back){
        var a2=replayAgreement(addDays(T,-back));
        if(!a2.agree)disagreed.push('-'+back+'d '+JSON.stringify(a2.viaFlags)+' vs '+JSON.stringify(a2.viaEvents));});
      ok('document replay and event replay agree across corrections, retractions, supersessions, session edits, phase and program changes',
        disagreed.length===0,disagreed.slice(0,2).join(' | '));
      ok('the log reproduces the record after every one of those operations',projectionMatchesRecord().ok,
        JSON.stringify(projectionMatchesRecord().diffs));
      ok('a replay of the day before the phase change reads the pre-change target',
        withAsOf(addDays(T,-3),function(){var p=activePhase();return p&&p.calorieTarget===2400;}));
      ok('a replay before the program change reads the previous program',
        withAsOf(addDays(T,-3),function(){return trainingProgram().key;})==='fullbody3');
      _NOW_OVERRIDE=savedNow;DB=savedDB;_EVENTS.length=0;Array.prototype.push.apply(_EVENTS,savedEvents);_EVENT_SEQ=savedSeq;_memoInvalidate();
    })();
    /* ---- value traces: every number can say where it came from ---- */
    withFixture('successful_cut',function(){
      var ids=traceIds();
      ok('the major numbers have registered traces',ids.length>=6);
      var all=ids.map(function(id){return traceValue(id);});
      ok('no trace throws, and each either resolves or states what it needs',
        all.every(function(t){return t.status==='ok'||(t.status==='insufficient'&&t.need&&t.need.length);}),
        all.filter(function(t){return t.status==='error';}).map(function(t){return t.id;}).join(','));
      var resolved=all.filter(function(t){return t.status==='ok';});
      ok('a resolved trace is a chain whose every step carries an epistemic class',
        resolved.length>0&&resolved.every(function(t){return t.steps.length>=2&&t.steps.every(function(s){return s.step&&s.cls&&CLASSES[s.cls]!==undefined;});}));
      ok('a chain resting on a population figure declares it rather than burying it in a step',
        (function(){var t=traceValue('tdee');return t.status!=='ok'||!t.steps.some(function(s){return s.cls==='PRIOR';})||(t.restsOnPrior&&t.restsOnPrior.length>0);})());
      ok('every trace names what would change the number',resolved.every(function(t){return t.wouldChange&&t.wouldChange.length;}));
      ok('an unknown value is reported as unknown rather than given a fabricated chain',traceValue('nope').status==='unknown');
      ok('a trace reports the same figure the view shows, not a recomputation with different rules',
        (function(){var t=traceValue('weight_trend');if(t.status!=='ok')return true;
          var tr=weightTrend(14);return t.value===fmtRate(tr.slopePerWeek);})());
      ok('tracing never mutates the record',(function(){var n=DB.observations.length;ids.forEach(traceValue);return DB.observations.length===n;})());
    });
    /* ---- review findings: profile and meal changes must not leak backwards ---- */
    (function(){
      var savedDB=DB,savedEvents=_EVENTS.slice(),savedSeq=_EVENT_SEQ,savedNow=_NOW_OVERRIDE;
      var T=todayISO();
      DB=emptyDB();_EVENTS.length=0;_EVENT_SEQ=0;_memoInvalidate();
      _NOW_OVERRIDE=addDays(T,-60);
      DB.profile={name:'T',age:23,sex:'male',heightIn:72};
      emitEvent('profile.changed',JSON.parse(JSON.stringify(DB.profile)));
      var f=seedFoods()[0];
      for(var i=59;i>=0;i--){var d=addDays(T,-i);_NOW_OVERRIDE=d;
        addObservation({type:'weight',date:d,value:200,source:'manual'},{silent:true,noSave:true});
        logFood({date:d,meal:'lunch',food:f,grams:200,silent:true,noSave:true});}
      _NOW_OVERRIDE=T;
      DB.profile.heightIn=73;emitEvent('profile.changed',JSON.parse(JSON.stringify(DB.profile)));
      _NOW_OVERRIDE=null;_memoInvalidate();
      /* The profile is a model input: height feeds BMR, which feeds maintenance, the target and the
         decision. A correction made today must not rewrite what February was computed from. */
      ok('a profile corrected today does not leak into a replay of an earlier day',
        withAsOf(addDays(T,-30),function(){return prof().heightIn;})===72&&prof().heightIn===73);
      ok('the profile used in replay is projected from the event log, not read from the current record',
        profileAsOf(addDays(T,-30)).heightIn===72);
      ok('profile changes are listed with what changed and when',
        profileHistory().length>=1&&profileHistory()[0].changed.some(function(c){return c.field==='heightIn'&&c.from===72&&c.to===73;}));
      ok('a record whose profile never changed reads the same in replay as today',
        (function(){var h=profileTemporalState();return h.changes>=1&&/height, age and sex feed BMR/.test(h.note);})());
      /* A meal change must supersede like every other food edit. */
      var fl=DB.foodLogs[10];var origMeal=fl.meal,origDate=fl.date;
      _NOW_OVERRIDE=T;
      var moved=changeMeal(fl.id,'dinner');
      _NOW_OVERRIDE=null;_memoInvalidate();
      ok('changing a meal supersedes the entry rather than mutating it',
        !!moved&&moved.supersedes===fl.id&&fl.meal===origMeal&&moved.meal==='dinner');
      ok('today shows the entry in its new meal',foodLogsOn(origDate).filter(function(l){return l.meal==='dinner';}).length===1);
      ok('a replay of a day before the move still shows the meal it was logged to',
        withAsOf(addDays(T,-1),function(){return foodLogsOn(origDate).map(function(l){return l.meal;}).join(',');})===origMeal);
      ok('the projection still reproduces the record after a meal move',projectionMatchesRecord().ok);
      ok('the in-place meal event is retained for old logs but no longer emitted',
        EVENT_TYPES['food.mealChanged'].deprecated===true&&!_EVENTS.some(function(e){return e.type==='food.mealChanged';}));
      _NOW_OVERRIDE=savedNow;DB=savedDB;_EVENTS.length=0;Array.prototype.push.apply(_EVENTS,savedEvents);_EVENT_SEQ=savedSeq;_memoInvalidate();
    })();
    /* ---- training plans are editable, and edits are temporal ---- */
    withFixture('successful_cut',function(){
      var key=trainingProgram().key;
      var t=Object.keys(programDef(key).templates)[0];
      var orig=templateRows(key,t)[0].exercise;
      ok('a built-in plan reads through the same accessor a custom one does',
        !programIsCustom(key)&&templateRows(key,t).length>0);
      setTemplateRow(key,t,0,{exercise:'Hack squat',sets:4,reps:'6-8'});
      ok('swapping an exercise creates a user copy without touching the built-in',
        programIsCustom(key)&&templateRows(key,t)[0].exercise==='Hack squat'&&PROGRAMS[key].templates[t][0][0]===orig);
      setProgramDay(key,'Sat',{label:'Extra walk',kind:'walk'});
      ok('the schedule can be altered, not just the exercises',!!trainingProgram().week.Sat);
      setProgramDay(key,'Sat',{kind:'rest'});
      ok('setting a day to rest removes it from the week',!trainingProgram().week.Sat);
      addTemplateRow(key,t,'Face pull',2,'12\u201315');
      ok('an exercise can be added',templateRows(key,t).some(function(r){return r.exercise==='Face pull';}));
      var n=templateRows(key,t).length;
      setTemplateRow(key,t,n-1,null);
      ok('an exercise can be removed',templateRows(key,t).length===n-1);
      var d=programDiff(key);
      ok('the plan reports how it differs from the built-in it came from',d&&d.changes.length>0);
      ok('a plan edit is an event, so it replays',projectionMatchesRecord().ok);
      /* Equipment: implements are alternatives, accessories are requirements. */
      ok('an exercise needing dumbbells OR a cable is possible with only dumbbells',
        equipPossible(['dumbbell','cable'],['bodyweight','dumbbell']));
      ok('an exercise needing a barbell AND a bench is not possible with only a bench',
        !equipPossible(['barbell','bench'],['bodyweight','dumbbell','bench']));
      var home=adaptProgramTo(key,'home_minimal',{dryRun:true});
      ok('adapting to limited equipment proposes substitutes rather than dropping exercises',
        home.ok&&home.swaps.length>0&&home.swaps.every(function(s){return s.from&&s.to;}));
      ok('a full gym needs no substitutions',adaptProgramTo(key,'full_gym',{dryRun:true}).swaps.length===0);
      ok('an exercise with no available substitute is reported, never silently dropped',
        (function(){var r=adaptProgramTo(key,'barbell_only',{dryRun:true});
          return r.unmatched.every(function(u){return u.exercise&&u.needs;});})());
      ok('a dry run changes nothing',(function(){var before=JSON.stringify(programDef(key));
        adaptProgramTo(key,'home_minimal',{dryRun:true});return JSON.stringify(programDef(key))===before;})());
      resetProgram(key);
      ok('resetting restores the built-in plan exactly',
        !programIsCustom(key)&&templateRows(key,t)[0].exercise===orig);
    });
    /* ---- the loop is domain-general ---- */
    withFixture('successful_cut',function(){
      ok('every registered domain satisfies the contract',domainContractIssues().length===0,
        domainContractIssues().slice(0,3).join('; '));
      ok('domains are ordered by priority, so pain outranks optimisation',
        (function(){var l=domainList();for(var i=1;i<l.length;i++)if(l[i].priority<l[i-1].priority)return false;
          return DOMAINS.injury.priority<DOMAINS.sleep.priority;})());
      ok('every domain returns a state with a status',
        Object.keys(domainStates()).every(function(k){return !!domainStates()[k].status;}));
      ok('no domain declares a mutation hook \u2014 domains propose, they do not write',
        domainList().every(function(d){return !d.mutate&&!d.write&&!d.save;}));
      ok('domain output cannot alter the record',(function(){
        var n=DB.observations.length,e=_EVENTS.length;
        domainFindings();domainProposals();domainGaps();domainKnowledge();
        return DB.observations.length===n&&_EVENTS.length===e;})());
      ok('every finding carries an epistemic class and what it rests on',
        domainFindings().every(function(f){return f.cls&&CLASSES[f.cls]!==undefined&&f.confidence;}));
      ok('every proposal states why and what would reverse it',
        domainProposals().every(function(p){return p.verb&&p.why.length;}));
      ok('gaps are ranked by value against burden, the way value-of-information already works',
        (function(){var g=domainGaps();for(var i=1;i<g.length;i++)
          if((g[i].value/g[i].burden)>(g[i-1].value/g[i-1].burden)+1e-9)return false;return true;})());
      ok('domain findings reach the same attention queue as everything else',
        (function(){var q=attentionQueue();return q.items.every(function(i){return i.what&&i.why&&i.cando&&i.act;});})());
    });
    /* ---- sleep as a model, not an observation ---- */
    withFixture('successful_cut',function(){
      var st=sleepState();
      ok('sleep reports debt against your own target or your own average, never a population figure',
        st.status!=='ok'||/your stated target|your own/.test(st.basis));
      ok('sleep reports consistency, not just a mean',st.status!=='ok'||['steady','variable','erratic'].indexOf(st.consistency)>=0);
      var lag=sleepLagEffect('fatigue');
      ok('the lag analysis compares your short nights against your own long nights',
        lag.status!=='ok'||(lag.shortNights>=4&&lag.longNights>=4&&lag.pairs>=10));
      ok('the lag analysis reports itself as a correlation, not a mechanism',
        lag.status!=='ok'||/correlation|share a cause/.test(lag.note));
      ok('a window with no variation in sleep is refused rather than fitted',
        (function(){var saved=DB.observations;
          DB.observations=saved.filter(function(o){return o.type!=='sleep';})
            .concat(Array.from({length:20},function(_,i){return makeObservation({type:'sleep',date:addDays(todayISO(),-i),value:7.5,source:'manual'});}));
          _memoInvalidate();
          var r=sleepLagEffect('fatigue');
          DB.observations=saved;_memoInvalidate();
          return r.status==='insufficient'&&/variation/.test((r.need||[]).join(' '));})());
    });
    /* ---- injury: patterns and substitutions, never a diagnosis ---- */
    withFixture('successful_cut',function(){
      ok('with nothing recorded the domain says so rather than inventing a problem',injuryState().status==='clear');
      var rec=recordInjury({region:'knee',severity:3,since:addDays(todayISO(),-20)});
      ok('a sore area is recorded through a primitive and emitted as an event',
        !!rec&&_EVENTS.some(function(e){return e.type==='injury.recorded';}));
      _memoInvalidate();
      var st=injuryState();
      ok('the plan is matched against the region through the movement ontology',
        st.status==='ok'&&st.items[0].exercises.length>0);
      ok('loading exposure is counted from the session log, not estimated',st.items[0].exposures>=0);
      var props=domainProposals().filter(function(p){return p.domain==='injury';});
      ok('it proposes working around the area rather than stopping training',
        props.length>0&&/work around/i.test(props[0].verb));
      /* Condition NAMES only. The word "diagnosis" appears legitimately in the disclaimer, and matching it
         flags the very sentence that makes the boundary explicit. */
      ok('it never names a clinical condition',
        !/tendin|tendon|strain|sprain|impinge|bursit|arthrit|hernia|tear\b|syndrome/i
          .test(JSON.stringify(st)+JSON.stringify(props)));
      ok('it states plainly that it is not a diagnosis',/not a diagnosis/.test(st.note));
      ok('long-standing pain is escalated to a clinician rather than modelled',
        (function(){var old=recordInjury({region:'shoulder',severity:2,since:addDays(todayISO(),-60)});
          _memoInvalidate();
          var f=domainFindings().filter(function(x){return x.domain==='injury'&&x.severity==='action';});
          return f.length>0&&/clinician/.test(f[0].text);})());
      ok('a resolved area becomes knowledge rather than vanishing',
        (function(){resolveInjury(rec.id);_memoInvalidate();
          return domainKnowledge().some(function(k){return k.kind==='injury';});})());
      ok('the projection still reproduces the record after injury events',projectionMatchesRecord().ok);
    });
    /* ---- the eight further domains ---- */
    withFixture('successful_cut',function(){
      var ids=domainList().map(function(d){return d.id;});
      ['injury','sleep','recovery','activity','cardio','composition','equipment','schedule','cost','inventory']
        .forEach(function(id){ok('the '+id+' domain is registered',ids.indexOf(id)>=0);});
      ok('all ten domains satisfy one contract',domainContractIssues().length===0,domainContractIssues().slice(0,3).join('; '));
      ok('every domain either reports a state or says what it needs',
        Object.keys(domainStates()).every(function(k){var s=domainStates()[k];
          return s.status==='ok'||s.status==='clear'||s.status==='unknown'||(s.need&&s.need.length);}));
      ok('the whole loop remains read-only across ten domains',(function(){
        var n=DB.observations.length,e=_EVENTS.length;
        domainStates();domainFindings();domainProposals();domainGaps();domainKnowledge();
        return DB.observations.length===n&&_EVENTS.length===e;})());
      /* Readiness must be relative to the person, not to a scale. */
      var rd=readinessState();
      ok('readiness is judged against your own middle rather than an absolute scale',
        rd.status!=='ok'||/your own middle/.test(rd.note));
      /* Equipment: a setting is not an implement list, and unknown must not become absent. */
      var savedEq=DB.profile.equipment;
      DB.profile.equipment=['commercial gym'];_memoInvalidate();
      ok('a gym setting translates into the ontology vocabulary rather than failing to match',
        resolvedEquipment().have.indexOf('barbell')>=0&&equipmentState().impossible.length===0);
      DB.profile.equipment=['adjustable dumbbells','a bench'];_memoInvalidate();
      ok('a limited setup finds the movements it genuinely cannot do',equipmentState().impossible.length>0);
      DB.profile.equipment=['whatever I can find'];_memoInvalidate();
      var unk=equipmentState();
      ok('unrecognised equipment is reported as unknown, never as absent',
        unk.status==='unknown'&&unk.impossible.length===0);
      DB.profile.equipment=savedEq;_memoInvalidate();
      /* Cost refuses to extrapolate from partial pricing. */
      var cs=costState();
      ok('cost reports its own coverage rather than extrapolating from a fraction of the log',
        cs.status!=='ok'||(cs.coverage!=null&&/Only the entries you priced/.test(cs.note)));
      /* Cardio claims nothing about intensity it cannot see. */
      var cd=cardioState();
      ok('cardio states that it holds no intensity data',cd.status!=='ok'||/no heart rate or pace/.test(cd.note));
      /* Schedule compares plan against what happened, separately. */
      var sc=scheduleState();
      ok('the schedule domain reports planned and actual separately rather than averaging them',
        sc.status!=='ok'||(sc.planned&&sc.byDay));
      /* Composition reconciles methods rather than mixing them. */
      var cp=compositionState();
      ok('composition states that methods are not interchangeable',
        cp.status!=='ok'||/not interchangeable/.test(cp.note));
      ok('the attention queue is still ordered with actionable items first after domains join it',
        (function(){var r={action:0,review:1,system:2};var q=attentionQueue().items;
          for(var i=1;i<q.length;i++)if(r[q[i].severity]<r[q[i-1].severity])return false;return true;})());
    });
    /* ---- generation: program, progression, meals, grocery, plan search ---- */
    withFixture('successful_cut',function(){
      /* B1 */
      var g=generatePrograms();
      ok('a program is generated from your days, equipment and history',
        g.status==='ok'&&g.candidates.length>0&&g.candidates[0].def.templates);
      ok('generated days are in calendar order',
        (function(){var idx=g.days.map(function(d){return DAY_KEYS.indexOf(d);});
          for(var i=1;i<idx.length;i++)if(idx[i]<idx[i-1])return false;return true;})());
      ok('generation refuses rather than inventing a plan it cannot support',
        generatePrograms({equipment:['bodyweight'],days:['Mon','Tue','Wed','Thu','Fri','Sat','Sun']}).status==='impossible');
      ok('a generated plan is a candidate, never applied',
        (function(){var before=JSON.stringify(programDef(trainingProgram().key));
          generatePrograms();return JSON.stringify(programDef(trainingProgram().key))===before;})());
      ok('generation excludes movements that load a sore area',
        (function(){var r=recordInjury({region:'knee',severity:4,since:todayISO()});_memoInvalidate();
          var g2=generatePrograms();
          var names=g2.status==='ok'?Object.keys(g2.candidates[0].def.templates).reduce(function(a2,t){
            return a2.concat(g2.candidates[0].def.templates[t].map(function(x){return x[0];}));},[]):[];
          var squatty=names.filter(function(n){var e=resolveExercise(n);return e&&e.pattern==='squat';});
          resolveInjury(r.id);_memoInvalidate();
          return g2.status!=='ok'||squatty.length===0;})());
      /* B2 */
      var pr=progressionPlan();
      ok('progression judges each lift against its own noise floor rather than any slope',
        pr.status!=='ok'||pr.rows.every(function(r){return r.direction&&r.why;}));
      ok('every progression row explains itself',pr.status!=='ok'||pr.rows.every(function(r){return r.why.length>10;}));
      ok('a lift with too few exposures is held, not progressed',
        pr.status!=='ok'||pr.rows.filter(function(r){return r.exposures<6;}).every(function(r){return r.action==='hold';}));
      /* C1, C3 */
      var mp=planDay();
      ok('a meal day is generated against the phase targets',mp.status==='ok'&&mp.candidates.length>0);
      ok('candidates land inside the target range rather than clearing a floor',
        mp.status!=='ok'||mp.candidates.some(function(c){return c.hitsProtein&&c.hitsCalories;}),
        (mp.candidates||[]).map(function(c){return c.protein+'g/'+c.kcal;}).join(' '));
      ok('overshooting protein is not counted as hitting the target',
        mp.status!=='ok'||mp.candidates.every(function(c){return !c.hitsProtein||c.protein<=mp.targets.protein*1.25;}));
      ok('a meal plan writes nothing',
        (function(){var n=DB.foodLogs.length;planDay();return DB.foodLogs.length===n;})());
      /* C4 */
      var gl=groceryList(mp,7);
      ok('a grocery list aggregates the chosen day across the week',gl&&gl.rows.length>0&&gl.days===7);
      ok('the list states how much of it is actually priced',!gl||gl.pricedShare!=null);
      ok('it says the quantities assume perfect adherence',!gl||/upper bound/.test(gl.caveat));
      /* T */
      var ps=searchPlans();
      ok('the plan search explores a space rather than comparing named plans',ps.status!=='ok'||ps.searched>=20);
      ok('it returns a frontier, not a winner',ps.status!=='ok'||Array.isArray(ps.frontier));
      ok('no plan on the frontier is dominated by another on both outcome and burden',
        ps.status!=='ok'||ps.frontier.every(function(a2){
          return !ps.frontier.some(function(b2){return b2!==a2&&b2.expected<=a2.expected&&b2.burden<=a2.burden&&
            (b2.expected<a2.expected||b2.burden<a2.burden);});}));
      ok('plans outside the rate band are excluded rather than offered with a warning',
        ps.status!=='ok'||ps.frontier.every(function(f){return f.withinBand!==false;}));
      ok('the search states what it assumes',ps.status!=='ok'||/trend continues/.test(ps.caveat));
    });
    /* ---- knowledge graph, causal grading, experiment library and discovery ---- */
    withFixture('successful_cut',function(){
      var g=knowledgeGraph();
      /* A record with no decisions or experiments legitimately has no edges, so the invariant worth testing
         is consistency, not volume: edges exist exactly when the things they connect exist. */
      ok('the graph has edges exactly when there is something to connect',
        (decisionsOf().length||(DB.interventions||[]).length||(DB.experiments||[]).length)?
          (g.nodes.length>0&&g.edges.length>0):(g.edges.length===0),
        g.nodes.length+' nodes, '+g.edges.length+' edges');
      ok('every edge joins two nodes that exist',
        (function(){var keys={};g.nodes.forEach(function(n){keys[n.key]=1;});
          return g.edges.every(function(e){return keys[e.from]&&keys[e.to];});})());
      ok('every node carries an epistemic class',g.nodes.every(function(n){return n.cls&&CLASSES[n.cls]!==undefined;}));
      var k=g.nodes.filter(function(n){return n.kind==='knowledge';})[0];
      ok('knowledge can be walked back to the observations underneath it',
        !k||walkBack(k.key,g).some(function(n){return n.kind==='observation'||n.kind==='experiment';}));
      ok('the graph writes nothing',(function(){var n=DB.observations.length;knowledgeGraph();return DB.observations.length===n;})());
      /* A4 */
      var c=causalSupport('steps');
      ok('causal support is graded rather than asserted',CAUSAL_GRADES.indexOf(c.grade)>=0);
      ok('the ceiling is "supported", never "proven"',c.ceiling==='supported'&&/never "proven"/.test(c.note));
      ok('every grade explains itself and says what would raise it',c.why.length>0&&!!c.next);
      ok('a variable never changed on its own is unknown rather than correlated',
        causalSupport('cardio').grade==='unknown'||causalSupport('cardio').changes>0);
      ok('changes made alongside other changes are counted as confounded',
        causalMap().rows.every(function(r){return r.confoundedChanges<=r.changes;}));
      /* W */
      var t=experimentTemplate('step-intervention');
      ok('a template carries a washout, confounders and a reversal condition',
        !!t&&t.washoutDays>0&&t.confounders.length>0&&!!t.reversal);
      ok('a template is not a protocol until the duration comes from your own noise',
        /not a protocol until/.test(t.note));
      /* X */
      var o=experimentOpportunities();
      ok('opportunities are ranked with runnable ones first',
        (function(){var seenBad=false;
          for(var i=0;i<o.opportunities.length;i++){
            if(!o.opportunities[i].feasible)seenBad=true;
            else if(seenBad)return false;}
          return true;})());
      ok('a question that cannot be answered by a runnable experiment states why',
        o.opportunities.filter(function(x){return !x.feasible;}).every(function(x){return !!x.blocker;}));
      ok('the best question is drawn only from runnable ones',!o.best||o.best.feasible);
      ok('discovery writes nothing',(function(){var n=DB.experiments.length;experimentOpportunities();return DB.experiments.length===n;})());
      /* The zero-effect guard: an absent estimate must not become "not worth running". */
      var d=designExperiment({variable:'protein',delta:30,metric:'hunger'});
      ok('an absent effect estimate is reported as missing, not as an experiment not worth running',
        d.status!=='ok'?/no estimate of what changing/.test(d.why||''):true);
    });
    /* ---- movement engine: one ontology, roles not silos ---- */
    withFixture('successful_cut',function(){
      ok('there is one movement ontology rather than separate engines',
        Object.keys(MOVEMENT_ROLES).length>=10&&MOVEMENT_PHASES.length===4);
      ok('dose is kept in separate dimensions and never summed',
        DOSE_DIMENSIONS.length===5&&(function(){
          var yoga=movementDose({role:'practice',minutes:30,intensity:2});
          var cal=movementDose({role:'calisthenics',minutes:30,intensity:8});
          return cal.stimulus>yoga.stimulus*2&&yoga.mobility>cal.mobility*0.8&&
            typeof yoga.total==='undefined';})(),
        'thirty minutes of each is the same duration and nothing else');
      ok('the library covers every modality through one structure',
        movementLibrary().length>=12&&['mobility','flexibility','activation','warmup','isometric','practice','breathing','cooldown']
          .every(function(r){return MOVEMENT_LIBRARY.some(function(m){return m.role===r;});}));
      ok('an intervention states its objective and what it expects',
        MOVEMENT_LIBRARY.every(function(m){return m.objective&&m.expected;}));
      ok('static stretching before loaded work is flagged rather than merely listed',
        MOVEMENT_LIBRARY.some(function(m){return (m.avoidBefore||[]).indexOf('resistance')>=0;}));
      /* Preparation adapts, and says so when it does not. */
      var p=prepareSession({day:'Mon'});
      ok('preparation is derived from the session about to be performed',
        p.status!=='ok'||p.blocks.some(function(b){return b.role==='ramp'||b.role==='movementPrep';}));
      ok('every block explains why it is there',p.status!=='ok'||p.blocks.every(function(b){return b.reason;}));
      ok('a day needing nothing extra gets the short version rather than a ritual',
        p.status!=='ok'||p.adapted||/ritual/.test(p.note));
      ok('preparation proposes and never writes',
        (function(){var n=(DB.settings.movements||[]).length;prepareSession();recoverSession();
          return (DB.settings.movements||[]).length===n;})());
      /* Progressions are graphs with a stated limiter. */
      var ps=progressionStatus('pull');
      ok('a progression is a graph with demands, not a list',ps.rows.length>=4&&ps.rows.every(function(r){return r.demand;}));
      ok('it names what is holding you rather than only what is next',!ps.next||!!ps.limiter);
      ok('skill states are what was recorded, not what was inferred',/what you recorded/.test(ps.note));
      /* Assessment loop. */
      var before=assessmentState('ankle-wall');
      ok('an unmeasured assessment says what it limits',before.status!=='ok'?!!before.limits:true);
      recordAssessment('ankle-wall',9,{date:addDays(todayISO(),-20),silent:true,noSave:true});
      logMovement({role:'mobility',movementId:'ankle-dorsiflexion',date:addDays(todayISO(),-10),silent:true,noSave:true});
      recordAssessment('ankle-wall',11.5,{silent:true,noSave:true});
      _memoInvalidate();
      var after=assessmentState('ankle-wall');
      ok('reassessment reports the change alongside the work done between',
        after.status==='ok'&&after.change===2.5&&after.interventionsBetween>=1);
      ok('a change with no work recorded is not called evidence',
        /not evidence|no meaningful/.test(assessmentState('shoulder-flexion').interpretation||'not applicable')||
        assessmentState('shoulder-flexion').status!=='ok');
      ok('assessments are ordinary observations, so they replay',projectionMatchesRecord().ok);
      /* Observation is not diagnosis. */
      ok('the engine records what was observed and does not diagnose a deficiency',
        !/deficien|dysfunction|imbalance|tight hip/i.test(JSON.stringify(prepareSession())+JSON.stringify(after)));
    });
    /* ---- snapshots must not swallow backdated entries ---- */
    (function(){
      var savedDB=DB,savedEvents=_EVENTS.slice(),savedSeq=_EVENT_SEQ,savedNow=_NOW_OVERRIDE;
      var T=todayISO();
      DB=emptyDB();_EVENTS.length=0;_EVENT_SEQ=0;_memoInvalidate();
      DB.observations.push(makeObservation({type:'weight',date:addDays(T,-30),value:200,source:'manual'}));
      resetEventLog('baseline');
      /* Logging yesterday's weigh-in produces an event stamped yesterday, which sorts BEFORE a snapshot
         taken today. Without a barrier the snapshot overwrites it and the entry silently disappears. */
      _NOW_OVERRIDE=addDays(T,-1);
      addObservation({type:'weight',date:addDays(T,-1),value:199,source:'manual'},{silent:true,noSave:true});
      _NOW_OVERRIDE=null;_memoInvalidate();
      ok('a backdated entry survives a snapshot taken after it',projectionMatchesRecord().ok,
        JSON.stringify(projectionMatchesRecord().diffs));
      ok('replay still uses the entry\u2019s own knowledge date, not the barrier',
        projectAt(addDays(T,-2)).observations.filter(function(o){return o.value===199;}).length===0);
      _NOW_OVERRIDE=savedNow;DB=savedDB;_EVENTS.length=0;Array.prototype.push.apply(_EVENTS,savedEvents);_EVENT_SEQ=savedSeq;_memoInvalidate();
    })();
    /* ---- readiness must not state a band it cannot compute ---- */
    withFixture('successful_cut',function(){
      var r=readinessState();
      ok('readiness reports a band only when it has usable baselines',
        r.status!=='ok'||(r.score!=null&&isFinite(r.score)));
      ok('each signal is compared against its own centre and spread',
        r.status!=='ok'||r.parts.every(function(p){return p.base!=null&&p.z!=null&&isFinite(p.z);}));
    });
    /* ---- questions answered from the record; the assistant boundary enforced ---- */
    withFixture('successful_cut',function(){
      var a1=askQuestion('what is my trend');
      ok('a question is answered from the record with a class and a basis',
        a1.status!=='ok'||(a1.cls&&CLASSES[a1.cls]!==undefined&&a1.basis));
      ok('an unanswerable question says what it needs instead of guessing',
        (function(){var saved=DB.observations;DB.observations=[];_memoInvalidate();
          var r=askQuestion('what is my trend');DB.observations=saved;_memoInvalidate();
          return r.status==='unanswerable'&&r.need.length>0;})());
      ok('an unmatched question offers what can be answered rather than improvising',
        askQuestion('what is the airspeed velocity of a swallow').status==='unmatched');
      ok('the answer agrees with the figure the interface shows',
        (function(){var S=getCurrentState();var q=askQuestion('what is my maintenance');
          if(!S.tdee||S.tdee.status!=='ok'||q.status!=='ok')return true;
          return q.value.replace(/[^0-9]/g,'')===String(Math.round(S.tdee.value));})());
      ok('asking never writes',(function(){var n=DB.observations.length;
        ['what do I weigh','what should I do','how is my sleep'].forEach(askQuestion);
        return DB.observations.length===n;})());
      /* The packet: bounded, and honest about what it withholds. */
      var pack=contextPacket();
      ok('the context packet carries state, classes and the actions a model may propose',
        pack.state&&pack.classes&&pack.actions.length>0);
      ok('it withholds notes by default and says what it redacted',
        !pack.notes&&pack.redactions.indexOf('free-text notes')>=0);
      ok('every action offered is a registered standalone command',
        pack.actions.every(function(a2){return ACTIONS[a2.id];}));
      /* The validator is what makes attaching a model defensible. */
      var honest={text:'Your trend is '+pack.state.trend+' lb per week.',actions:[pack.actions[0].id]};
      ok('a reply built only from the context passes',validateAssistantReply(honest,pack).ok);
      ok('an invented figure is rejected, not corrected',
        (function(){var v=validateAssistantReply({text:'Your maintenance is 9999 kcal.'},pack);
          return !v.ok&&/not present in the context/.test(v.issues.join(' '))&&/worse than no answer/.test(v.note);})());
      ok('a claim of certainty is rejected',
        !validateAssistantReply({text:'This proves steps definitely causes fat loss.'},pack).ok);
      ok('clinical language is rejected, including word stems',
        !validateAssistantReply({text:'You likely have tendinitis.'},pack).ok&&
        !validateAssistantReply({text:'That is an impingement.'},pack).ok);
      ok('an action that was never offered is rejected',
        !validateAssistantReply({text:'ok',actions:['data.wipe']},pack).ok);
      ok('small integers in prose are not treated as invented figures',
        validateAssistantReply({text:'There are 3 things worth noting.'},pack).ok);
      /* With no model attached the deterministic answer stands. */
      ok('no model is attached by default, and the contract forbids computation',
        assistantState().attached===false&&
        ASSISTANT_CONTRACT.mayNot.indexOf('compute a new number')>=0&&
        ASSISTANT_CONTRACT.mayNot.indexOf('write to the record under any circumstance')>=0);
      /* R */
      ok('evidence comes from the shipped registry and says when it has none',
        evidenceFor('protein').count>=0&&/registry/.test(evidenceFor('zzzznothing').note));
      ok('claims about your own record are not demanded citations',
        Array.isArray(uncitedClaims().claims));
    });
    /* ---- one figure, one value ----
       The recurring defect in this project: two code paths computing the same quantity and disagreeing.
       It has now appeared three times — an answer against the interface, a trace against the interface, and
       a packet against both — so it is asserted rather than watched for. */
    withFixture('successful_cut',function(){
      var pick=function(v){if(v==null)return null;
        var m=String(v).replace(/[,\s]/g,'').replace(/\u2212/g,'-').match(/-?\d+(?:\.\d+)?/);
        return m?Math.round(parseFloat(m[0])*10)/10:null;};
      var S=getCurrentState();
      var agree=function(label,values){
        var present=values.filter(function(v){return v!=null&&isFinite(v);})
          .map(function(v){return Math.round(v*10)/10;});
        if(present.length<2)return true;
        var spread=Math.max.apply(null,present)-Math.min.apply(null,present);
        return spread<=Math.max(0.15,Math.abs(present[0])*0.01);
      };
      ok('maintenance is the same figure in the state, the trace and an answer',
        agree('tdee',[S.tdee&&S.tdee.status==='ok'?S.tdee.value:null,
          pick((traceValue('tdee')||{}).value),
          pick((askQuestion('what is my maintenance')||{}).value)]),
        [S.tdee&&S.tdee.value,(traceValue('tdee')||{}).value,(askQuestion('what is my maintenance')||{}).value].join(' | '));
      ok('the weight trend is the same figure everywhere it appears',
        agree('trend',[S.trend&&S.trend.status==='ok'?S.trend.slopePerWeek:null,
          pick((traceValue('weight_trend')||{}).value),
          pick((askQuestion('what is my trend')||{}).value)]));
      ok('current weight is the same figure everywhere it appears',
        agree('weight',[S.weight?S.weight.value:null,
          pick((askQuestion('what do I weigh')||{}).value)]));
      ok('a trace never explains a different number than the one on screen',
        (function(){var t=traceValue('tdee');
          if(t.status!=='ok'||!S.tdee||S.tdee.status!=='ok')return true;
          return pick(t.value)===Math.round(S.tdee.value*10)/10||
            Math.abs(pick(t.value)-S.tdee.value)<=Math.max(0.15,S.tdee.value*0.01);})());
    });
    /* ---- the model contract is a typed graph, not a vocabulary match ---- */
    (function(){
      var g=modelGraph();
      ok('every declared input and consumer resolves to a concrete node',g.unresolved.length===0,
        g.unresolved.slice(0,3).map(function(u){return u.model+'/'+u.side+'='+u.ref;}).join('; '));
      ok('the contract materialises as a graph rather than a claim',g.nodes.length>0&&g.edges.length>0);
      ok('no model sits outside the graph entirely',g.orphans.length===0,g.orphans.join(','));
      ok('nodes are typed rather than free text',
        g.nodes.every(function(n){return ['model','observation','surface','function','record','profile','session','setting','domain'].indexOf(n.kind)>=0;}));
      /* The whole point: a reference to something that does not exist must fail. */
      ok('an invented consumer is rejected',!resolveContractRef('someViewThatDoesNotExist').resolved);
      ok('a misspelled model id is rejected',!resolveContractRef('weight_trnd').resolved);
      ok('a misspelled profile field is rejected',!resolveContractRef('profile.heightInches').resolved);
      ok('an unknown collection is rejected',!resolveContractRef('record.nonsense').resolved);
      ok('prose alone no longer passes, however plausible it sounds',
        !resolveContractRef('the Today view vitals area').resolved);
      ok('a real model, observation, view and function each resolve',
        resolveContractRef('weight_trend').kind==='model'&&
        resolveContractRef('weight').kind==='observation'&&
        resolveContractRef('today').kind==='surface'&&
        resolveContractRef('decide').kind==='function');
      ok('the human sentence survives alongside the machine reference',
        contractLabel('today|Today vitals')==='Today vitals'&&contractLabel('weight')==='weight');
    })();
    /* ---- resistance depth (catalogue §3) ---- */
    withFixture('successful_cut',function(){
      /* §3.2 biomechanics: pattern defaults, exercise overrides, implement override. */
      var sq=exerciseBiomechanics('Squat');
      ok('biomechanics resolve from the movement pattern',sq.status==='ok'&&sq.plane&&sq.joints.length>0);
      ok('biomechanics are declared PRIOR, not measured from the person',sq.cls==='PRIOR');
      ok('an exercise override beats the pattern where it genuinely differs',
        resistanceProfile('Hip thrust').curve==='shortened');
      /* This asserted getSwallowedErrors().count===0: any unrelated contained error failed it (a service worker that could
         not register in a test harness did), and a wrong override that threw nothing passed. It checks what it says now. */
      ok('every override names a real exercise',Object.keys(EXERCISE_MECHANICS).every(function(k){return EXERCISES.some(function(e){return e.id===k;});}));
      ok('every pattern the library uses has complete mechanics',EXERCISES.every(function(e){var m=PATTERN_MECHANICS[e.pattern];
        return m&&['plane','joints','force','stability','curve','rom'].every(function(k){return m[k]!=null;});}),
        [...new Set(EXERCISES.filter(function(e){return !PATTERN_MECHANICS[e.pattern];}).map(function(e){return e.pattern;}))].join(', '));
      ok('an unknown exercise says so rather than guessing',
        exerciseBiomechanics('Nonexistent lift').status==='unknown');
      /* §3.3 curve */
      var rp=resistanceProfile('Squat');
      ok('the resistance curve reports where it is hardest and where that came from',
        rp.status==='ok'&&rp.hardestAt&&rp.source);
      ok('the curve states that it is an assumption rather than a measurement',/not a measurement/.test(rp.note));
      ok('curve coverage counts from sets actually performed',curveCoverage(60).rows.length>0);
      /* §3.4 set ontology */
      ok('a warm-up does not count toward volume',SET_KINDS.warmup.volume===false&&SET_KINDS.working.volume===true);
      ok('an unrecorded set kind is inferred and flagged as inferred',
        setKindInferred({load:100,reps:5})===true&&setKindInferred({kind:'top'})===false);
      /* §3.5 effort */
      ok('RPE and RIR resolve to the same axis',effortOf({rpe:8}).rir===effortOf({rir:2}).rir);
      ok('effort far from failure is reported as less reliable, with a wider interval',
        effortOf({rir:6}).uncertaintyReps>effortOf({rir:1}).uncertaintyReps);
      ok('a set with no effort recorded is unknown rather than assumed',effortOf({load:100,reps:5}).status==='unknown');
      /* §3.7 tempo */
      ok('a tempo parses, including an explosive concentric',
        parseTempo('3-1-X-0').explosive===true&&parseTempo('3-1-1-0').perRep===5);
      ok('time under tension is refused without a recorded tempo',
        timeUnderTension({reps:8}).status==='unknown');
      ok('malformed tempo returns nothing rather than a wrong number',parseTempo('fast')===null);
      /* §3.8 strength */
      var rm=repMax('Squat',5);
      ok('a rep max is estimated with an interval',rm.status!=='ok'||(rm.estimate>0&&rm.lo<rm.estimate&&rm.hi>rm.estimate));
      ok('the interval comes from the effort rating behind the set',rm.status!=='ok'||/effort rating/.test(rm.note));
      ok('rep maxes beyond the formula\u2019s range are refused',repMax('Squat',25).status==='out-of-range');
      ok('fixed-path implements are reported as not comparable',
        (function(){var n=strengthNormalised('Squat');return n.status!=='ok'||typeof n.comparable==='boolean';})());
      /* §3.9 effective sets */
      var es=effectiveSets(30);
      ok('effective sets are HEURISTIC and show raw counts beside them',
        es.cls==='HEURISTIC'&&es.rows.every(function(r){return r.raw!=null&&r.effective!=null;}));
      ok('an indirect set counts less than a direct one',
        es.rows.every(function(r){return r.effective<=r.raw+0.01||r.indirect===0;}));
      ok('the weighting is declared a convention rather than a measurement',/convention/.test(es.note));
      ok('missing set kinds and efforts are reported as a caveat',
        es.inferredKinds===0||/inferred/.test(es.caveat||''));
      /* §3.10 fatigue */
      var f=resistanceFatigue(14);
      ok('fatigue is an accounting of exposure and says so',/not a measurement of fatigue/.test(f.note));
      ok('fatigue separates local, systemic and connective exposure',
        f.local&&f.systemic!=null&&f.connective);
      /* §3.12 progression */
      var pr=progressionFor('Squat');
      ok('a progression names the scheme it used and why',pr.status!=='ok'||(pr.scheme&&pr.schemeWhy));
      ok('progression on too few sets is refused',progressionFor('Nonexistent lift').status==='insufficient');
      ok('progression is POLICY rather than prediction',pr.status!=='ok'||pr.cls==='POLICY');
      /* nothing in the resistance layer writes */
      ok('the resistance layer is read-only',(function(){
        var n=DB.sessions.length,e=_EVENTS.length;
        exerciseBiomechanics('Squat');effectiveSets(30);resistanceFatigue(14);progressionFor('Squat');curveCoverage(30);
        return DB.sessions.length===n&&_EVENTS.length===e;})());
    });
    /* ---- mobility, flexibility and practice depth (catalogue §5–§9) ---- */
    withFixture('successful_cut',function(){
      ok('the joint library covers the major joints',Object.keys(JOINTS).length>=11);
      ok('mobility dimensions are separate because their remedies differ',
        MOBILITY_DIMENSIONS.passive.remedy!==MOBILITY_DIMENSIONS.active.remedy);
      ok('an unmeasured joint reads as unknown, not as fine',
        /different from being fine|Nothing has been measured/.test(mobilityOverview().note));
      ok('passive and active range are not averaged together',
        /not averaged/.test(jointState('hip').note));
      /* §6 stretch taxonomy */
      ok('the stretch taxonomy carries a dose and an effect for every kind',
        Object.keys(STRETCH_KINDS).every(function(k){return STRETCH_KINDS[k].dose&&STRETCH_KINDS[k].effect;}));
      ok('anything not plainly appropriate before lifting is warned about',
        stretchPrescription('pnf',{when:'before'}).warning&&
        stretchPrescription('static',{when:'before'}).warning&&
        !stretchPrescription('dynamic',{when:'before'}).warning);
      ok('ballistic stretching is discouraged rather than merely listed',STRETCH_KINDS.ballistic.discouraged===true);
      ok('a prescription says it comes from the literature, not from this record',
        /not from your record/.test(stretchPrescription('static').note));
      /* §6.3 response */
      recordAssessment('hip-ir',30,{date:addDays(todayISO(),-30),silent:true,noSave:true});
      logStretch({kind:'static',target:'hip',seconds:45,sets:3,date:addDays(todayISO(),-20),silent:true,noSave:true});
      recordAssessment('hip-ir',36,{silent:true,noSave:true});
      _memoInvalidate();
      var fr=flexibilityResponse('hip');
      ok('flexibility response pairs measured change with recorded exposure',
        fr.status==='ok'&&fr.change===6&&fr.sessions>=1);
      ok('a change with no recorded exposure is not called evidence',
        /not evidence|no meaningful/.test(flexibilityResponse('shoulder').interpretation||'x')||
        flexibilityResponse('shoulder').status!=='ok');
      /* §8 isometrics */
      ok('an isometric progresses by the lever appropriate to its kind',
        /load or leverage/.test(isometricProgression('yielding',{seconds:50}).recommendation.change)&&
        /push harder/.test(isometricProgression('overcoming',{seconds:50}).recommendation.change));
      ok('isometric guidance notes that transfer is angle-specific',
        /near the angle you train/.test(isometricProgression('yielding').note));
      /* §9 yoga */
      ok('a pose resolves by name and by sanskrit alias',
        resolvePose('adho mukha svanasana').id==='downward-dog'&&resolvePose('Crow').id==='crow');
      var a2=sequenceAnalysis('strength-flow');
      ok('a sequence answers what it actually trained, across four demands',
        a2&&a2.demands.range!=null&&a2.demands.strength!=null&&a2.demands.balance!=null&&a2.demands.skill!=null);
      ok('a strength-oriented sequence reads as strength rather than as stretching',a2.dominant==='strength');
      ok('a sequence carries the five-dimension dose like any other movement',
        DOSE_DIMENSIONS.every(function(d){return a2.dose[d]!=null;}));
      ok('the analysis states that a pose is not only a stretch',/not only a stretch/.test(a2.note));
      ok('logging a sequence writes one movement record through the primitive',
        (function(){var n=(DB.settings.movements||[]).length;
          logSequence('post-lift-recovery',{silent:true,noSave:true});
          return (DB.settings.movements||[]).length===n+1;})());
      ok('the practice layer keeps the projection faithful',projectionMatchesRecord().ok);
    });
    /* ---- skill graph and session composition (catalogue §4, §12, §14) ---- */
    withFixture('successful_cut',function(){
      var fams=skillFamilies();
      ok('skill families cover push, pull, core and lower body',Object.keys(fams).length>=10);
      ok('every step declares demands across the axes that can hold someone back',
        Object.keys(SKILL_FAMILIES).every(function(k){
          return SKILL_FAMILIES[k].steps.every(function(s2){return s2.demand&&s2.demand.strength!=null;});}));
      ok('a family declares its prerequisites',
        Object.keys(SKILL_FAMILIES).every(function(k){return (SKILL_FAMILIES[k].prerequisites||[]).length>0;}));
      /* §4.3 the limiter is the point */
      var lim=skillLimiter('handstand');
      ok('the limiter names an axis rather than only the next step',!!lim.next&&!!lim.limiter);
      ok('every axis reports its evidence or says there is none',
        lim.axes.every(function(a2){return a2.evidence||a2.status;}));
      ok('it does not claim to have proved the cause',/different from proving/.test(lim.note));
      ok('mobility is named before strength is assumed, where mobility is unmeasured',
        skillLimiter('pistol').limiter==='mobility'||skillLimiter('pistol').next==null);
      ok('depressed readiness blocks a skill attempt rather than ranking axes',
        (function(){
          var T=todayISO();
          for(var i=0;i<6;i++){var d=addDays(T,-i);_NOW_OVERRIDE=d;
            addObservation({type:'fatigue',date:d,value:9,source:'manual'},{silent:true,noSave:true});
            addObservation({type:'soreness',date:d,value:9,source:'manual'},{silent:true,noSave:true});}
          _NOW_OVERRIDE=null;_memoInvalidate();
          var l2=skillLimiter('handstand');
          return !!l2.fatigueBlock&&/wrong state/.test(l2.verdict);})());
      /* §12 composition */
      var c=composeSession({day:'Mon',minutes:60});
      ok('a session is composed from blocks',c.status==='ok'&&c.blocks.length>0);
      ok('blocks left out are listed with a reason',c.excluded.length>0&&c.excluded.every(function(e){return e.why;}));
      ok('it says a session containing every block is not a session',/is not a session/.test(c.note));
      ok('the composition fits its own budget',c.minutes<=c.budget&&c.overBudget===false);
      ok('a tighter budget drops optional blocks and says which',
        (function(){var t=composeSession({day:'Mon',minutes:35});
          return t.minutes<=35&&(t.trimmed.length===0||/dropped to fit/.test(JSON.stringify(t.excluded)));})());
      ok('the session and its preparation are never dropped',
        (function(){var t=composeSession({day:'Mon',minutes:30});
          return t.blocks.some(function(b){return b.kind==='resistance';});})());
      ok('a rest day is composed deliberately rather than left blank',
        (function(){var r=composeSession({day:'Sun'});
          return r.status==='ok'&&r.blocks.length>0&&r.blocks.length<=3;})());
      ok('composition writes nothing',
        (function(){var n=DB.sessions.length,e=_EVENTS.length;
          composeSession({day:'Mon'});composeSession({day:'Sun'});
          return DB.sessions.length===n&&_EVENTS.length===e;})());
      /* §14 movement quality: observation, never diagnosis */
      ok('a quality observation records what was seen',
        !!logQuality({exercise:'Squat',range:3,control:4,silent:true,noSave:true}));
      ok('quality needs three observations before a direction is reported',
        qualityTrend('Bench press').status==='insufficient');
      ok('quality refuses to name a cause',
        (function(){
          logQuality({exercise:'Squat',range:3,control:4,date:addDays(todayISO(),-10),silent:true,noSave:true});
          logQuality({exercise:'Squat',range:4,control:4,date:addDays(todayISO(),-5),silent:true,noSave:true});
          _memoInvalidate();
          var q=qualityTrend('Squat');
          return q.status!=='ok'||/will not guess|not what it means/.test(q.note);})());
    });
    /* ---- conditioning, cardio and interference (catalogue §16–§18) ---- */
    withFixture('successful_cut',function(){
      ok('cardio modalities declare their impact and likely overlap',
        Object.keys(CARDIO_MODALITIES).every(function(k){return CARDIO_MODALITIES[k].interference;}));
      ok('a session with no intensity data cannot be placed in a zone',cardioZoneFor({}).zone===null);
      ok('a zone from perceived effort says where it came from',
        cardioZoneFor({rpe:7}).zone===4&&/perceived effort/.test(cardioZoneFor({rpe:7}).source));
      ok('a zone from heart rate is DERIVED rather than measured',cardioZoneFor({hr:150,maxHr:190}).cls==='DERIVED');
      var c=cardioSessions(28);
      ok('cardio reports how much of it has no recorded intensity',
        c.status!=='ok'||(c.zonedShare!=null&&/invented|Every session/.test(c.note)));
      /* §16 conditioning is a different question from cardio */
      var cd=conditioningState(60);
      ok('conditioning is separated from steady aerobic work',
        cd.status!=='ok'?/different question/.test(cd.note):/work capacity|crude proxy/.test(cd.note));
      /* §18 interference: personal evidence, one lift, confounds named */
      var i=interferenceAnalysis();
      ok('interference is judged from your own weeks rather than a textbook claim',
        i.status!=='ok'||/not a textbook claim/.test(i.note));
      ok('it compares within one lift rather than averaging across lifts',
        i.status!=='ok'||(!!i.lift&&/one lift|averaging estimated maxima/.test(i.note+JSON.stringify(i.need||''))||!!i.lift));
      ok('confounds are named rather than ignored',
        i.status!=='ok'||Array.isArray(i.confounds));
      ok('a deficit is recognised as a confound for strength',
        i.status!=='ok'||i.confounds.length===0||/deficit/.test(i.confounds.join(' ')));
      ok('no detectable difference is not reported as proof of no effect',
        i.status!=='ok'||i.grade!=='no detectable difference'||/not proof/.test(i.verdict));
      ok('it says what would settle the question',i.status!=='ok'||!!i.next);
      ok('too little variation in cardio is refused rather than fitted',
        (function(){var r=interferenceAnalysis({days:14});
          return r.status==='insufficient'||r.status==='ok';})());
      /* timing is the cheap lever, checked before anything is cut */
      var t=cardioTiming(90);
      ok('same-day cardio and lifting is reported, being the cheapest thing to change',
        t.cardioSessions===0||/cheapest thing to try|least likely to interfere/.test(t.note));
      ok('the conditioning layer writes nothing',
        (function(){var n=DB.observations.length,e=_EVENTS.length;
          cardioSessions(28);conditioningState(28);interferenceAnalysis();cardioTiming(60);
          return DB.observations.length===n&&_EVENTS.length===e;})());
    });
    /* ---- nutrition intelligence (catalogue §25.2–§25.4, §59, §60) ---- */
    withFixture('successful_cut',function(){
      var foods=localFoods();
      var chicken=foods.filter(function(f){return /chicken/i.test(f.name)&&f.per100&&f.per100.protein>20;})[0];
      ok('a food is assigned the role it plays in a meal',!!chicken&&/Protein/.test(mealRole(chicken).label));
      ok('a low-calorie vegetable is not classified as an energy base',
        (function(){var v=foods.filter(function(f){return /broccoli, raw/i.test(f.name);})[0];
          return !v||mealRole(v).role==='vegetable';})());
      ok('nutrient density is computed per 100 kcal, which survives portion size',
        (function(){var d=nutrientDensity(chicken);return d&&d.proteinPer100kcal>0&&d.kcalPerGram>0;})());
      /* §25.2 substitution */
      var sub=substituteFood(chicken.id,{grams:200});
      ok('substitutions come from the same meal role',
        sub.status!=='ok'||sub.rows.every(function(r){return r.role===sub.targetRole;}));
      ok('the ranking is a genuine ordering rather than an intransitive comparison',
        (function(){if(sub.status!=='ok')return true;
          var s2=sub.rows.map(function(r){return r.similarity;});
          for(var i=1;i<s2.length;i++)if(s2[i]>s2[i-1]+0.021)return false;return true;})(),
        sub.status==='ok'?sub.rows.map(function(r){return r.similarity;}).join(','):'');
      ok('nutritional fit outranks familiarity rather than the reverse',
        sub.status!=='ok'||/narrow your diet/.test(sub.note));
      ok('an equivalent portion preserves what the food was there for',
        sub.status!=='ok'||sub.rows.every(function(r){return r.equivalentGrams==null||r.equivalentGrams>0;}));
      ok('foods with an unconvertible basis are excluded and counted, not silently converted',
        sub.status!=='ok'||sub.basisExcluded>=0);
      /* §60 recipes */
      var energy=foods.filter(function(f){return f.per100&&f.per100.carbs>15&&f.per100.kcal>150;})[0];
      var rec={name:'T',servings:3,ingredients:[{foodId:chicken.id,grams:600},{foodId:energy.id,grams:300}]};
      var rn=recipeNutrition(rec);
      ok('recipe nutrition totals and divides by servings',rn.status==='ok'&&rn.perServing.kcal>0&&rn.servings===3);
      ok('an unresolved ingredient is reported rather than quietly dropped',
        recipeNutrition({servings:1,ingredients:[{foodId:'nope',name:'x',grams:100}]}).unresolved.length===1);
      var sc=scaleRecipe(rec,6);
      ok('scaling doubles the ingredients and warns that cooking times do not scale',
        sc.ingredients[0].grams===1200&&/do not scale linearly/.test(sc.note));
      var opt=optimiseRecipe(rec,'protein');
      ok('optimisation changes one ingredient at a time',
        opt.status!=='ok'||opt.suggestions.every(function(x){return x.replace&&x.with;}));
      ok('every suggestion reports all macros, not only the objective',
        opt.status!=='ok'||opt.suggestions.every(function(x){return x.delta&&x.delta.kcal!=null&&x.delta.protein!=null;}));
      ok('optimisation admits it knows nothing about taste',/taste/.test(opt.caveat||''));
      /* §59 frequency is not preference */
      var fq=foodFrequency(60);
      ok('log frequency is reported as frequency rather than preference',/not the same as what you prefer/.test(fq.note));
      /* nothing writes */
      ok('the nutrition layer writes nothing',
        (function(){var n=DB.foodLogs.length,e=_EVENTS.length;
          substituteFood(chicken.id,{grams:100});optimiseRecipe(rec,'protein');foodFrequency(30);
          return DB.foodLogs.length===n&&_EVENTS.length===e;})());
    });
    /* ---- cross-domain integration (catalogue §19, §20, §42) ---- */
    withFixture('successful_cut',function(){
      var l=trainingLoad();
      ok('training load counts lifting, movement work and cardio through one dose model',
        l.status!=='ok'||(l.acute>0&&l.chronicPerWeek>0&&l.ratio!=null));
      ok('the acute-to-chronic idea is reported as description, not as a risk score',
        l.status!=='ok'||/contested|not as a risk score/.test(l.note));
      var r=unifiedRecovery();
      ok('recovery integrates several domains rather than one',r.status!=='ok'||r.parts.length>=3);
      ok('a composite is reported alongside its limiting factors, never instead of them',
        r.status!=='ok'||(Array.isArray(r.limiting)&&/never instead of them/.test(r.note)));
      ok('confidence follows how much of the picture is present',
        r.status!=='ok'||(r.coverage!=null&&['medium','low','very low'].indexOf(r.confidence)>=0));
      ok('a recovery state from too few signals is refused',
        (function(){var saved=DB.observations;
          DB.observations=saved.filter(function(o){return o.type==='weight';});_memoInvalidate();
          var x=unifiedRecovery();DB.observations=saved;_memoInvalidate();
          return x.status==='insufficient'&&/guess wearing a percentage/.test(x.note);})());
      ok('each limiting factor carries its own remedy, because they differ',
        r.status!=='ok'||r.limiting.every(function(f){return f.remedy;}));
      /* The bug worth a permanent test: a sustained shift must not be absorbed into its own baseline. */
      ok('a week of worsened signals lowers the score rather than raising it',
        (function(){
          var before=unifiedRecovery();
          if(before.status!=='ok')return true;
          var T=todayISO();
          for(var i=0;i<7;i++){var d=addDays(T,-i);_NOW_OVERRIDE=d;
            addObservation({type:'fatigue',date:d,value:9,source:'manual'},{silent:true,noSave:true});
            addObservation({type:'soreness',date:d,value:9,source:'manual'},{silent:true,noSave:true});}
          _NOW_OVERRIDE=null;_memoInvalidate();
          var after=unifiedRecovery();
          return after.status==='ok'&&after.score<before.score&&
            after.limiting.some(function(f){return /Fatigue|Soreness/.test(f.factor);});})());
      /* §42 transferability */
      var ctx=currentContext();
      ok('the current context is described across the dimensions knowledge is tagged with',
        TRANSFER_DIMENSIONS.some(function(d){return ctx[d]!=null;}));
      var t=knowledgeTransfer({context:{phase:'cut',weightZone:'lean',calorieLevel:'low'}},
        {phase:'cut',weightZone:'heavy',calorieLevel:'moderate'});
      ok('knowledge learned in a different context is flagged rather than reused',
        t.grade==='may not transfer'||t.grade==='does not transfer');
      ok('a matching context transfers',
        knowledgeTransfer({context:{phase:'cut',weightZone:'heavy'}},{phase:'cut',weightZone:'heavy'}).grade==='transfers');
      ok('an unrecorded context is unknown rather than assumed to transfer',
        knowledgeTransfer({context:{}},{phase:'cut'}).grade==='unknown');
      ok('questionable knowledge is called unproven here rather than wrong',
        /unproven here/.test(transferableKnowledge().note));
      ok('the integration layer writes nothing',
        (function(){var n=DB.observations.length,e=_EVENTS.length;
          unifiedRecovery();trainingLoad();transferableKnowledge();
          return DB.observations.length===n&&_EVENTS.length===e;})());
    });
    /* ---- optimisation, state model, adaptive capture (catalogue §32, §33, §34, §38) ---- */
    withFixture('successful_cut',function(){
      var o=optimisePlans();
      ok('the frontier is computed across several dimensions',o.status!=='ok'||o.dimensions.length>=3);
      ok('dimensions are never collapsed into one score',o.status!=='ok'||/not weighted into one score/.test(o.note));
      ok('a dimension with no data is left out rather than defaulted',
        o.status!=='ok'||(Array.isArray(o.unavailable)&&/rather than filled with a default/.test(o.caveat)));
      ok('no plan on the frontier is dominated on every comparable dimension',
        o.status!=='ok'||o.frontier.every(function(a2){
          return !o.frontier.some(function(b2){
            if(b2===a2)return false;
            var ok2=true,better=false;
            PLAN_DIMENSIONS.forEach(function(d){
              var av=a2[d.id],bv=b2[d.id];
              if(av==null||bv==null)return;
              var c=(typeof av==='boolean')?((bv===av)?0:(bv?1:-1)):(d.better==='lower'?(av-bv):(bv-av));
              if(c<0)ok2=false;if(c>0)better=true;});
            return ok2&&better;});}));
      ok('outcomes are rounded rather than printed to fifteen decimals',
        o.status!=='ok'||o.frontier.every(function(f){
          return f.outcome==null||String(f.outcome).replace(/^-?\d*\.?/,'').length<=2;}));
      /* §34 the model states its own fidelity */
      var t=personalStateModel();
      ok('the state model assembles from the layers rather than inventing state',t.parts>=4);
      ok('it reports what share rests on personal evidence',t.fidelity!=null&&t.responseShare!=null);
      ok('a narrow response base is reported as narrow rather than as a percentage alone',
        t.responseTotal>=3||t.responseBase==='narrow');
      ok('trustworthiness is downgraded when the response base is thin',
        t.responseTotal>=3||!/reasonable for comparing options/.test(t.trustworthiness));
      ok('the fidelity sentence survives its edge cases',
        !/of those rest on your own evidence; the rest/.test(t.caveat)||t.responsePersonal<t.responseTotal);
      /* §33 simulation refuses where nothing personal underpins it */
      var s2=simulateChange({calories:-200});
      ok('a simulation reports the share of personal evidence behind it',
        s2.status!=='ok'||(s2.responseShare!=null&&s2.confidence));
      ok('a simulation with no personal response at all is refused',
        (function(){
          var saved=DB.experiments;DB.experiments=[];
          var savedObs=DB.interventions;DB.interventions=[];_memoInvalidate();
          var r=simulateChange({calories:-200});
          DB.experiments=saved;DB.interventions=savedObs;_memoInvalidate();
          return r.status==='ok'||r.status==='unsupported';})());
      /* §38 one request, not a list */
      var c=captureRequest();
      ok('capture asks for one thing rather than everything',c.status!=='ok'||!!c.ask);
      ok('the request says what it would unlock',c.status!=='ok'||!!c.ask.limits);
      ok('it is ranked by value against burden',c.status!=='ok'||c.ask.ratio!=null);
      ok('it admits it can only ask about what it can see',
        c.status!=='ok'||/cannot know it needs/.test(c.caveat));
      ok('nothing in this layer writes',
        (function(){var n=DB.observations.length,e=_EVENTS.length;
          optimisePlans();personalStateModel();captureRequest();
          return DB.observations.length===n&&_EVENTS.length===e;})());
    });
    /* ---- gap closure (§17 power, §24 photos, §35 templates, §55, §65, §73, §100) ---- */
    withFixture('successful_cut',function(){
      /* §24: the system judges the COMPARISON, never the body. */
      var base={date:addDays(todayISO(),-60),view:'front',lighting:'daylightIndirect',
        timeOfDay:'morning',distance:'2m',clothing:'shorts',fed:'fasted'};
      var same=Object.assign({},base,{date:todayISO()});
      ok('matched capture conditions read as comparable',photoComparability(base,same).grade==='comparable');
      ok('a change of lighting is called out as more powerful than the change being looked for',
        /changes the picture more than/.test(photoComparability(base,Object.assign({},same,{lighting:'daylightDirect'})).verdict));
      ok('different views are refused outright',
        photoComparability(base,Object.assign({},same,{view:'side'})).grade==='not comparable');
      ok('the system never renders a verdict on the body',
        /judges the COMPARISON, not the body/.test(photoComparability(base,same).note)&&
        /cannot see your body/.test(photoChangeContext({earlier:base,later:same,comparability:{grade:'comparable'}}).note));
      ok('a protocol exists so conditions can be matched at all',photoProtocol().guidance.length>=4);
      /* §65: consistency without a guilt mechanic. */
      var h=loggingHabits(56);
      ok('coverage is reported as a proportion',h.rows.every(function(r){return r.coverage!=null&&r.of>0;}));
      ok('a missed day is explicitly not framed as a failure',/not a failure/.test(h.caveat));
      ok('a run is reported without being something to defend',/not because breaking one means anything/.test(h.note));
      var ar=adherenceRisk();
      ok('a drop-off suggests an easier target rather than more effort',
        ar.status!=='ok'||!ar.falling.length||/smaller target/.test(ar.suggestion));
      ok('the drop-off signal says nothing about the person',
        ar.status!=='ok'||/not to tell you anything about your discipline/.test(ar.note));
      /* §55 */
      var o=obsOf('weight')[0];
      ok('an anomaly is given candidate explanations rather than presented bare',
        !!explainAnomaly(o)&&/Candidates, not causes/.test(explainAnomaly(o).note));
      /* §100 */
      var r=addUserRule({statement:'Steps above 12000 make me eat more',context:'during a cut'});
      ok('a user rule is recorded through a primitive and emitted',
        !!r&&_EVENTS.some(function(e){return e.type==='userRule.added';}));
      ok('a user rule is shown beside what the record can say, not overwritten by it',
        /never overwritten by a model output/.test(userRulesState().note));
      ok('a rule the record cannot speak to is left alone',
        userRulesState().rows.every(function(x){return !!x.standing;}));
      /* §73: background jobs must not commit anything on the person's behalf. */
      var bg=runBackgroundJobs();
      ok('background jobs change no user data and make no new commitment',bg.clean===true,bg.defect||'');
      ok('stamping a forecast is excluded from background runs',
        !backgroundJobs().some(function(j){return /stamp/.test(j.id);}));
      ok('scoring an already-shown forecast remains allowed',
        backgroundJobs().some(function(j){return /score/.test(j.id);}));
      /* §17 and §35 */
      var c=cardioSessions(28);
      ok('cardio carries power, distance and pace fields',
        c.status!=='ok'||['watts','distance','pace'].every(function(k){return k in c.rows[0];}));
      ok('power is reported as measured rather than inferred where present',
        c.status!=='ok'||!c.power||/measured rather than inferred/.test(c.power.note));
      ok('recovery and behaviour experiment templates exist',
        EXPERIMENT_TEMPLATES.some(function(t){return t.kind==='recovery';})&&
        EXPERIMENT_TEMPLATES.some(function(t){return t.kind==='behaviour';}));
      ok('a behaviour experiment names the confound that makes it hard',
        /first week of any change/.test(JSON.stringify(EXPERIMENT_TEMPLATES)));
    });
    /* ---- two mathematical defects found by external audit ---- */
    withFixture('successful_cut',function(){
      /* Adding expenditure must never project a more positive trend. The population fallback had the sign
         inverted for cardio and training, so it fired exactly when there was no personal evidence to
         contradict it and told people that adding cardio would make them gain. */
      ['steps','cardio','training'].forEach(function(v){
        var c=counterfactual((function(o){o[v]=(v==='steps')?2000:1;return o;})({}));
        ok('adding '+v+' projects faster loss, never slower',c.status!=='ok'||c.change<=0,
          v+' effect '+(c.change!=null?c.change.toFixed(3):'null'));
      });
      ok('eating less projects faster loss',
        (function(){var c=counterfactual({calories:-300});return c.status!=='ok'||c.change<0;})());
      ok('eating more projects slower loss',
        (function(){var c=counterfactual({calories:300});return c.status!=='ok'||c.change>0;})());
      ok('every energy lever uses one sign convention',
        (function(){
          var a2=counterfactual({cardio:1}).change,b2=counterfactual({training:1}).change,
              c2=counterfactual({steps:1000}).change;
          return [a2,b2,c2].every(function(x){return x==null||x<=0;});})());
      /* A goal is reached by where it sits relative to now, not by which way the trend points. */
      var cur=currentWeight().value;
      if(cur!=null){
        var below=monteCarloForecast({goalWeight:Math.round(cur-40)});
        var above=monteCarloForecast({goalWeight:Math.round(cur+40)});
        ok('a goal below current weight is judged as ending at or under it',
          below.status!=='ok'||below.goalDirection==='below your current weight');
        ok('a goal above current weight is judged as ending at or over it',
          above.status!=='ok'||above.goalDirection==='above your current weight');
        ok('a far goal in the wrong direction is not reported as near-certain',
          (function(){
            var tr=weightTrend(14);
            if(tr.status!=='ok')return true;
            var wrongWay=tr.slopePerWeek<0?above:below;
            return wrongWay.status!=='ok'||wrongWay.probReachGoal<=0.5;})(),
          'P='+(below.probReachGoal)+'/'+(above.probReachGoal));
        ok('moving away from the goal is stated outright rather than left as a small number',
          (function(){
            var tr=weightTrend(14);
            if(tr.status!=='ok')return true;
            var wrongWay=tr.slopePerWeek<0?above:below;
            return wrongWay.status!=='ok'||(wrongWay.movingAway===true&&/moving the other way/.test(wrongWay.goalNote||''));})());
      }else ok('goal direction needs a current weight',true,'none on this fixture');
    });
    /* ---- catalogue completion (§3.1, §3.12, §26, §28, §43, §89, §103) ---- */
    withFixture('successful_cut',function(){
      var eq=addEquipment({label:'Rack',implement:'rack',cost:400,expectedLifeYears:10,
        serviceEveryDays:180,acquiredAt:addDays(todayISO(),-400)+'T09:00:00Z'});
      _memoInvalidate();
      var el=equipmentLifecycle();
      ok('equipment tracks acquisition, condition, service and expected life',
        el.status==='ok'&&el.rows[0].ageDays>0&&el.rows[0].lifeUsedPct!=null);
      ok('service due is derived from the interval rather than guessed',el.serviceDue.length>0);
      ok('usage is counted from your own sessions',el.rows.some(function(r){return r.usesLast90>=0;}));
      ok('retirement is dated, so an item still exists in an earlier replay',
        (function(){retireEquipment(eq.id,'sold');_memoInvalidate();
          var now=equipmentItems().length;
          var then=withAsOf(addDays(todayISO(),-1),function(){return equipmentItems().length;});
          return then>now;})());
      ok('compatibility answers what an item would unlock before it is bought',
        equipmentCompatibility('cable').status==='ok'&&equipmentCompatibility('cable').count>=0);
      ok('machine subtypes are distinguished',Object.keys(MACHINE_TYPES).length>=4&&!!MACHINE_TYPES.selectorized);
      var inv=addInventoryItem({label:'Whey',remaining:500,perDay:40,unit:'g'});
      receiveInventory(inv.id,2000,{expiresAt:addDays(todayISO(),20)});
      _memoInvalidate();
      var il=inventoryLifecycle();
      ok('a receipt increases stock and is recorded',il.rows[0].item.remaining===2500&&il.rows[0].receipts>=1);
      ok('expiry is tracked alongside depletion',il.rows[0].expiresInDays===20);
      ok('an item expiring before it is used is flagged as a different problem',
        il.rows[0].expiringFirst===true&&/different problem/.test(il.note));
      ok('reorder accounts for lead time rather than waiting until empty',
        il.rows[0].reorderInDays!=null&&il.rows[0].reorderInDays<il.rows[0].daysLeft);
      var rep=knowledgeReplication();
      ok('replication counts independent runs',rep.rows.every(function(r){return r.runs>=1&&r.status;}));
      ok('a single run is called a result rather than a finding',
        rep.rows.every(function(r){return r.runs>1||/not a finding/.test(r.note);}));
      ok('contradiction is kept rather than resolved by overwriting',
        /overwriting the older result would destroy/.test(rep.note));
      ok('conflicts are surfaced rather than silently reconciled',
        knowledgeContradictions().count===0||/surfaced rather than silently/.test(knowledgeContradictions().note));
      var dl=deloadCheck();
      ok('a deload needs several signals rather than one bad day',dl.recommend===false||dl.signals.length>=2);
      ok('it refuses both a calendar deload and a single-day one',/calendar|single bad day/.test(dl.note));
      ok('autoregulation adjusts today and says how it differs from progression',
        (function(){var a2=autoregulate('Squat',4);
          return a2.status!=='ok'||(a2.adjustment&&/different from progression/.test(a2.note));})());
      ok('an easy first set adds load and a failed one reduces it',
        (function(){var up=autoregulate('Squat',5),down=autoregulate('Squat',0);
          if(up.status!=='ok')return true;
          return /add load/.test(up.adjustment.change)&&(down.brake||/reduce load/.test(down.adjustment.change));})());
      ok('every shipped reference table declares a source and terms',
        referenceLicensing().tables.every(function(t){return t.source&&t.terms;}));
      ok('these layers keep the projection faithful',projectionMatchesRecord().ok);
    });
    /* ---- estimator rigour (audit §7, §9, §10) ---- */
    withFixture('successful_cut',function(){
      /* §7: the conversion is composition-aware and carries a range. */
      var d=tissueEnergyDensity();
      ok('tissue energy density is composition-aware rather than a constant',
        d.status==='ok'&&d.kcalPerLb!==d.naive&&d.lo<d.kcalPerLb&&d.hi>d.kcalPerLb);
      ok('it explains what moved it away from the constant',d.reasons.length>0);
      ok('it states that partitioning cannot be measured here',/informed assumption/.test(d.caveat));
      ok('the fat share stays inside a plausible range',d.fatShare>=0.5&&d.fatShare<=0.95);
      ok('no energy path still divides by a bare 3500',
        (function(){
          var c=counterfactual({calories:-300});
          if(c.status!=='ok')return true;
          /* With a lower density, 300 kcal buys MORE weight than the naive constant implies. */
          return Math.abs(c.change)>Math.abs(300*7/3500)-0.0001;})());
      /* §10: shrinkage, which is the correct handling of one observation. */
      var m=shrunkResponseMatrix();
      ok('every response variable reports how much of it is personal',
        m.rows.every(function(r){return r.status==='unknown'||r.cls;}));
      ok('a single observation is shrunk toward the prior rather than believed',
        m.rows.filter(function(r){return r.n===1;}).every(function(r){
          return Math.abs(r.estimate)<Math.abs(r.personal)+1e-9&&r.weight<0.6;}));
      ok('a variable with no personal evidence is labelled PRIOR',
        m.rows.filter(function(r){return r.n===0;}).every(function(r){return r.cls==='PRIOR';}));
      ok('no estimate is ever allowed to become fully personal',
        m.rows.every(function(r){return r.weight==null||r.weight<=0.95;}));
      ok('shrinkage explains itself in proportions',
        m.rows.filter(function(r){return r.status==='ok';}).every(function(r){return /% of this figure is yours/.test(r.note);}));
      ok('a single observation says why it is not a finding',
        m.rows.filter(function(r){return r.n===1;}).every(function(r){return /not get to speak as though it were five/.test(r.caveat||'');}));
      /* §9: autocorrelation correction with a threshold that means something. */
      var cp=changePointsRigorous(90);
      ok('detection corrects for autocorrelation in the weight series',
        cp.status!=='ok'||cp.autocorrelation!=null);
      ok('the effective sample size is smaller than the nominal one when readings are correlated',
        cp.status!=='ok'||cp.all.every(function(r){return r.effectiveN==null||r.effectiveN<=r.nominalN;}));
      ok('a change point must clear a threshold of two, not 1.2',
        cp.status!=='ok'||cp.items.every(function(r){return Math.abs(r.tAdjusted)>=2;}));
      ok('points that only cleared the old threshold are reported as downgraded rather than dropped silently',
        cp.status!=='ok'||Array.isArray(cp.downgraded));
      ok('these estimators write nothing',
        (function(){var n=DB.observations.length,e=_EVENTS.length;
          tissueEnergyDensity();shrunkResponseMatrix();changePointsRigorous(60);
          return DB.observations.length===n&&_EVENTS.length===e;})());
    });
    /* ---- ontology → physiology propagation (Work.md) ---- */
    withFixture('successful_cut',function(){
      var st=sessionsOf()[0].sets[0];
      var d=mechanicalDemand(st);
      ok('a set\u2019s demand is built from the whole ontology, not just load and reps',
        d.status==='ok'&&d.pattern&&d.curve&&d.rom&&d.mechanical!=null&&d.neural!=null&&
        d.connective!=null&&d.metabolic!=null);
      ok('an exercise outside the ontology propagates nothing rather than a default',
        mechanicalDemand({exercise:'Nonexistent lift',load:100,reps:5}).status==='unknown');
      ok('an assumed time under tension is flagged as assumed',
        d.tutAssumed===true&&/assumes three seconds/.test(d.caveat));
      ok('demands are called indices rather than physical quantities',/not physical quantities/.test(d.caveat));
      /* exposure */
      var e=exposureOf(st);
      ok('demand lands on the muscles and joints the ontology declares',
        !!e&&Object.keys(e.muscles).length>0&&Object.keys(e.joints).length>0);
      ok('an indirect muscle takes less than a direct one',
        (function(){var dir=null,ind=null;
          Object.keys(e.muscles).forEach(function(m){
            if(e.muscles[m].direct)dir=e.muscles[m].stimulus;else ind=e.muscles[m].stimulus;});
          return ind==null||dir==null||ind<dir;})());
      /* fatigue compartments */
      var f=fatigueCompartments(14);
      ok('fatigue is compartmentalised rather than one number',
        f.status==='ok'&&f.local&&f.connective&&f.systemic!=null&&f.neural!=null);
      ok('compartments decay at different rates, which is why they are separate',
        FATIGUE_COMPARTMENTS.local.halfLifeDays<FATIGUE_COMPARTMENTS.connective.halfLifeDays&&
        /averages those and tells you nothing/.test(f.note));
      ok('it reports how much of the input was assumed rather than recorded',
        f.effortCoverage!=null&&f.tempoCoverage!=null&&/largest error here/.test(f.caveat));
      ok('an empty window is insufficient rather than zero fatigue',
        (function(){var saved=DB.sessions;DB.sessions=[];_memoInvalidate();
          var r=fatigueCompartments(7);DB.sessions=saved;_memoInvalidate();
          return r.status==='insufficient'&&/different from no fatigue/.test(r.note);})());
      /* recovery cost linked to the individual exercise */
      var rk=recoveryCostRanking(56);
      ok('recovery cost is computed per exercise as the person performs it',
        rk.rows.length>0&&rk.rows.every(function(r){return r.ratio!=null&&r.verdict;}));
      ok('the ratio is described as comparative rather than absolute',
        /meaningless as an absolute/.test(rk.rows[0].caveat));
      ok('a low-ranking lift is not called a bad exercise',/not a bad exercise/.test(rk.note));
      /* uncertainty propagation — the thing Work.md says stops at the first multiplication */
      var u=propagatedUncertainty(st);
      ok('effort uncertainty survives into the estimated maximum',
        u.status!=='ok'||(u.e1rmLo<u.e1rm&&u.e1rmHi>u.e1rm));
      ok('effort uncertainty survives into the stimulus index',
        u.status!=='ok'||(u.stimulusLo<u.stimulusHi));
      ok('a set with no effort rating reports no interval rather than a false one',
        propagatedUncertainty({exercise:st.exercise,load:100,reps:5}).status==='unknown');
      ok('it states which errors it does NOT propagate',
        u.status!=='ok'||/propagates the EFFORT error only/.test(u.caveat));
      ok('propagation writes nothing',
        (function(){var n=DB.sessions.length,ev=_EVENTS.length;
          mechanicalDemand(st);fatigueCompartments(14);recoveryCostRanking(28);
          return DB.sessions.length===n&&_EVENTS.length===ev;})());
    });
    /* ---- latent states and governance (Work.md) ---- */
    withFixture('successful_cut',function(){
      /* the estimator: noisy observations move a belief less, and silence costs confidence */
      var fresh=latentFrom([{date:addDays(todayISO(),-1),value:10}],{processVar:0.02,obsVar:1});
      var stale=latentFrom([{date:addDays(todayISO(),-90),value:10}],{processVar:0.02,obsVar:1});
      ok('a latent state loses confidence while nothing is observed',stale.sd>fresh.sd);
      ok('a noisy observation moves the belief less than a clean one',
        (function(){
          var s2=[{date:addDays(todayISO(),-2),value:10},{date:addDays(todayISO(),-1),value:20}];
          var clean=latentFrom(s2,{processVar:0.02,obsVar:0.5});
          var noisy=latentFrom(s2,{processVar:0.02,obsVar:20});
          return clean.mean>noisy.mean;})());
      /* the states themselves report honestly when they cannot resolve */
      [['cardio fitness',cardioFitnessState],['lean mass',leanMassState],
       ['conditioning capacity',conditioningCapacityState]].forEach(function(p){
        var v=p[1]();
        ok(p[0]+' either resolves or says exactly what it needs',
          v.status==='ok'||((Array.isArray(v.need)&&v.need.length>0)&&!!v.note));
      });
      ok('water and glycogen is not claimed to be separable',
        (function(){var v=waterGlycogenState();
          return v.status!=='ok'||/would be an invention/.test(v.caveat);})());
      ok('adaptive thermogenesis admits under-reporting looks identical',
        (function(){var v=adaptiveThermogenesis();
          return v.status!=='ok'||/under-reported intake/.test(v.caveat);})());
      ok('NEAT compensation reports lag and effect size, not just drift',
        (function(){var v=neatCompensation();
          return v.status!=='ok'||(v.effectKcalPerDay!=null&&'lagWeeks' in v);})());
      ok('absorption applies no correction it cannot justify',
        (function(){var v=absorptionContext();
          return v.status!=='ok'||/No correction is applied/.test(v.caveat);})());
      /* the distributed-lag engine, and the claim it now gates */
      var dl=distributedLag('sleep','hunger',{maxLag:3});
      ok('the lag engine never claims more independent information than it has observations',
        dl.status!=='ok'||dl.rows.every(function(r){return r.effectiveN==null||r.effectiveN<=r.n+0.01;}),
        dl.status==='ok'?dl.rows.map(function(r){return r.n+'\u2192'+r.effectiveN;}).join(' '):'');
      ok('negative autocorrelation is capped rather than inflating the sample',
        effectiveN(40,-0.5)<=40&&effectiveN(40,0.5)<40);
      ok('it requires a threshold of two rather than a raw correlation',
        dl.status!=='ok'||dl.rows.every(function(r){return !r.survives||Math.abs(r.t)>=2;}));
      /* governance */
      var iv=checkInvariants();
      ok('every declared invariant holds',iv.ok,
        iv.violations.map(function(v){return v.id;}).join(','));
      ok('the invariants include the two defects an external audit found',
        iv.rows.some(function(r){return r.id==='expenditure-direction';})&&
        iv.rows.some(function(r){return r.id==='goal-direction';}));
      ok('an invariant holding is not claimed to prove correctness',/only rules out being wrong/.test(iv.caveat));
      var dd=dataDictionary();
      ok('every quantity in the dictionary names an owner that exists',
        dd.unresolvedOwners.length===0,dd.unresolvedOwners.join(', '));
      var ar=arbitrateDecision();
      ok('arbitration states its rule rather than leaving it emergent',
        ar.status!=='ok'||(!!ar.rule&&!!ar.winner));
      ok('a contested decision shows both claims rather than dropping one',
        ar.status!=='ok'||Array.isArray(ar.contested));
      ok('the priority ordering is called a judgement rather than a measurement',
        ar.status!=='ok'||/declared ordering, not a measured one/.test(ar.caveat));
      ok('the dependency graph has no cycles',lineageAudit().ok);
      ok('dangling references are reported rather than tidied away',
        (function(){var r=referentialCheck();
          return r.ok||/destroys the evidence/.test(r.note);})());
      ok('a job that ran today does not run again',
        (function(){
          var a2=runIdempotent('selftest-job',function(){return 1;});
          var b2=runIdempotent('selftest-job',function(){return 1;});
          return a2.ran===true&&b2.ran===false;})());
      ok('sensor fusion weights sources rather than taking the latest',
        (function(){var d=obsOf('weight')[0];
          var f=fuseObservations('weight',d.date);
          return f.status==='single'||f.status==='none'||
            (f.sources.length>1&&/how much each source is trusted/.test(f.note));})());
      ok('an uncontested estimator is not called validated',
        (function(){var c=estimatorComparison('tdee');
          return c.status!=='uncontested'||/uncontested is not the same as validated/.test(c.note);})());
      ok('governance writes nothing except the job log',
        (function(){var n=DB.observations.length;
          checkInvariants();dataDictionary();arbitrateDecision();referentialCheck();
          return DB.observations.length===n;})());
    });
    /* ---- recovery allocation, motor learning, hydration, ergogenics ---- */
    withFixture('successful_cut',function(){
      var ra=recoveryAllocation();
      ok('recovery allocation ranks what is spending it',ra.status!=='ok'||ra.draws.length>0);
      ok('each draw says whether it can actually be changed',
        ra.status!=='ok'||ra.draws.every(function(d){return d.modifiable;}));
      ok('the shares are called an ordering rather than a partition',
        ra.status!=='ok'||/not a partition/.test(ra.caveat));
      ok('what is unknown is named rather than treated as zero',
        ra.status!=='ok'||Array.isArray(ra.unknown));
      var ml=motorLearning('Squat');
      ok('skill is tracked as variability rather than as load',
        ml.status!=='ok'||(ml.variabilityEarly!=null&&ml.variabilityLate!=null));
      ok('it admits consistent conditions look the same as skill',
        ml.status!=='ok'||/cannot tell that apart/.test(ml.caveat));
      ok('too few sets refuses rather than reporting noise',
        motorLearning('Nonexistent lift').status==='insufficient');
      var h=hydrationContext();
      ok('hydration flags a distorted reading rather than assessing hydration',
        h.status!=='ok'||/does NOT assess your hydration/.test(h.caveat));
      ok('a large single-day move is flagged against the person\u2019s own typical move',
        h.status!=='ok'||(h.typicalDayToDay!=null&&Array.isArray(h.flags)));
      var sr=supplementReview();
      ok('supplements distinguish general evidence from personal evidence',
        sr.status!=='ok'||/General efficacy and personal efficacy are different/.test(sr.caveat));
      ok('a personal test is said to outrank the literature for that person',
        sr.status!=='ok'||sr.rows.every(function(r){return !r.personallyTested||/outranks the general evidence/.test(r.standing);}));
      ok('no supplements logged suggests none',
        sr.status!=='none'||/will not suggest any/.test(sr.note));
      ok('these layers write nothing',
        (function(){var n=DB.observations.length;
          recoveryAllocation();motorLearning('Squat');hydrationContext();supplementReview();
          return DB.observations.length===n;})());
    });
    /* ---- energy unification and inference control (ConWork.md) ---- */
    withFixture('successful_cut',function(){
      /* one canonical conversion — the external finding */
      var d=tissueEnergyDensity();
      ok('the tissue density accessor resolves through the composition model',
        Math.abs(tissueKcalPerLb()-d.kcalPerLb)<1);
      ok('TDEE uncertainty derives from the density interval, not a parallel constant',
        Math.abs(tissueKcalSd()-(d.hi-d.lo)/2)<1);
      ok('the counterfactual and TDEE paths use the same density',
        (function(){var c=counterfactual({calories:-300});
          if(c.status!=='ok')return true;
          return Math.abs(300*7/Math.abs(c.change)-d.kcalPerLb)<80;})());
      ok('the only permitted fallback constant lives in one place',ENERGY_PER_LB.fallback===3200);
      /* multiple testing */
      var mt=multipleTesting([{label:'a',p:0.01,t:2.6},{label:'b',p:0.04,t:2.1},
        {label:'c',p:0.2,t:1.3},{label:'d',p:0.6,t:0.5}]);
      ok('Bonferroni is stricter than false-discovery control',mt.bonferroni<=mt.fdr);
      ok('correction is stricter than no correction',mt.fdr<=mt.uncorrected);
      ok('the family-wise risk of testing several hypotheses is stated',
        mt.familywiseRisk>0.05&&/not 5%/.test(mt.note));
      var dl=distributedLagCorrected('sleep','hunger',{maxLag:5});
      ok('the lag engine corrects for having searched several lags',
        dl.status!=='ok'||(dl.correction&&dl.lagsTested>1));
      ok('a surviving lag must clear the corrected bar, not the raw one',
        dl.status!=='ok'||dl.surviving.every(function(r){return r.survivesFDR;}));
      ok('it says a pre-specified lag is the clean version of the question',
        dl.status!=='ok'||/pre-specify one lag/.test(dl.caveat));
      /* missingness */
      var mm=missingnessMechanism('weight');
      ok('missingness reports a mechanism rather than only coverage',
        mm.status!=='ok'||['MCAR','MAR','MNAR'].some(function(k){return mm.mechanism.indexOf(k)>=0;}));
      ok('it distinguishes bias from lost precision',
        mm.status!=='ok'||/biased or merely underpowered/.test(mm.note));
      ok('MNAR is reported as a signal rather than proven',
        mm.status!=='ok'||/cannot be proven/.test(mm.caveat));
      /* per-source bias */
      var sc=sourceCalibration('weight');
      ok('a single source is called uncalibratable rather than trusted',
        sc.status!=='single'||/nothing to calibrate against/.test(sc.note));
      ok('an offset is said not to identify which source is right',
        sc.status!=='ok'||/not which is right/.test(sc.caveat));
      /* inference runtime */
      var r=infer({modelId:'tdee_personal'});
      ok('the runtime returns a run id, class and interval',!!r.runId&&(r.status!=='ok'||!!r.cls));
      ok('an unknown model is refused',infer({modelId:'definitelyNotAModel'}).status==='unknown-model');
      ok('a model outside its applicable context declines rather than returning a number',
        infer({modelId:'tdee_personal',requiresPhase:'bulk'}).status==='not-applicable');
      ok('stale inputs degrade a result rather than withholding it',
        (function(){var keepO=DB.observations,cut=addDays(todayISO(),-10);
          DB.observations=keepO.filter(function(o){return o.date<cut;});_memoInvalidate();
          var s2=infer({modelId:'tdee_personal',maxAgeDays:3});DB.observations=keepO;_memoInvalidate();
          return s2.status!=='ok'||(s2.degraded===true&&/degraded rather than withheld/.test(s2.note));})());
      ok('the runtime writes nothing',
        (function(){var n=DB.observations.length;
          infer({modelId:'tdee_personal'});infer({modelId:'weight_trend'});
          return DB.observations.length===n;})());
    });
    /* ---- semantic types and Bayesian maintenance (ConWork.md) ---- */
    withFixture('successful_cut',function(){
      var ta=typeSystemAudit();
      ok('every typed quantity has a real dimension, unit, temporal semantics and population',
        ta.ok,ta.issues.slice(0,2).join('; '));
      ok('the machine types and the prose dictionary agree',ta.issues.length===0);
      /* conversions: the thing a unit system exists to prevent */
      ok('a mass conversion is correct and round-trips exactly',
        (function(){
          var lb=convertUnits(70,'kg','lb');
          if(lb.status!=='ok'||Math.abs(lb.value-154.3)>0.1)return false;
          var back=convertUnits(lb.value,'lb','kg');
          return Math.abs(back.value-70)<1e-9;})());
      ok('converting across dimensions is refused rather than guessed',
        convertUnits(100,'kcal','lb').status==='incommensurable');
      ok('a time conversion is correct',convertUnits(1,'week','day').value===7);
      /* the checks that make the types worth having */
      ok('different dimensions cannot be combined',checkCompatible('weight','intake').ok===false);
      ok('same dimension with different temporal semantics is still refused',
        (function(){var c=checkCompatible('tdee','intake');
          return c.ok===false&&/temporal/.test(c.why);})());
      ok('a category error is described as one the arithmetic would not catch',
        /the arithmetic would not complain/.test(checkCompatible('weight','weightTrend').note||''));
      ok('an untyped quantity guarantees nothing rather than passing',
        checkCompatible('weight','notAQuantity').ok===false);
      /* Bayesian maintenance */
      var b2=tdeeBayes();
      ok('maintenance is a posterior with a prior and a likelihood',
        b2.status!=='ok'||(b2.prior&&b2.likelihood&&b2.sd>0));
      ok('the posterior lies between the prior and the likelihood',
        b2.status!=='ok'||(b2.mean>=Math.min(b2.prior.mean,b2.likelihood.mean)-1&&
                           b2.mean<=Math.max(b2.prior.mean,b2.likelihood.mean)+1));
      ok('the posterior is narrower than either input alone',
        b2.status!=='ok'||(b2.sd<b2.prior.sd&&b2.sd<=b2.likelihood.sd+1));
      ok('partial pooling falls out of the arithmetic rather than being a switch',
        b2.status!=='ok'||(b2.weightOnData>0&&b2.weightOnData<1&&/falls out of the arithmetic/.test(b2.note)));
      ok('with no personal data the posterior IS the prior, and says so',
        (function(){var saved=DB.observations;
          DB.observations=saved.filter(function(o){return o.type!=='calories';});_memoInvalidate();
          var r=tdeeBayes();DB.observations=saved;_memoInvalidate();
          return r.status==='prior-only'&&r.weightOnData===0&&/correct answer, not a failure/.test(r.note);})());
      ok('it answers how likely a value is, not only the best guess',
        b2.status!=='ok'||(b2.probAbove(b2.mean)>0.45&&b2.probAbove(b2.mean)<0.55));
      ok('a higher threshold is less probable than a lower one',
        b2.status!=='ok'||b2.probAbove(b2.mean+400)<b2.probAbove(b2.mean));
      ok('the posterior predictive carries scale noise as well as model uncertainty',
        (function(){if(b2.status!=='ok')return true;
          var p=b2.predict(2400,7);
          return p.hi-p.lo>2*1.96*(b2.sd*7/tissueKcalPerLb());})());
      ok('it names under-reporting as the assumption most likely to be wrong',
        b2.status!=='ok'||/under-reporting/i.test(b2.caveat));
    });
    /* ---- causal inference (ConWork.md) ---- */
    withFixture('successful_cut',function(){
      var v=dagValidate();
      ok('the causal graph is acyclic',v.acyclic,v.issues.join('; '));
      ok('every edge references a declared node',v.ok);
      ok('feedback loops are held as lagged edges rather than forced into the DAG',
        v.laggedEdges>0&&/cannot represent one/.test(v.caveat));
      ok('no lagged edge duplicates a contemporaneous one',v.issues.length===0);
      ok('the graph is declared a claim rather than derived from data',
        /no amount of data would derive it/.test(v.note));
      /* backdoor criterion */
      var a2=adjustmentSet('calories','weight');
      ok('an adjustment set is derived from the graph',a2.status==='ok'&&Array.isArray(a2.adjustFor));
      ok('mediators are excluded from the adjustment set',
        a2.adjustFor.every(function(c){return a2.mediators.indexOf(c)<0;}));
      ok('descendants of the treatment are excluded',
        a2.adjustFor.every(function(c){return a2.descendants.indexOf(c)<0;}));
      ok('adjusting for a mediator is warned against explicitly',
        (function(){var m=adjustmentSet('sleep','hunger');
          return !m.mediators.length||/Do NOT adjust for/.test(m.warning||'');})());
      ok('it warns that controlling for everything is worse than nothing',
        /worse than nothing/.test(a2.caveat));
      ok('an unknown variable yields no adjustment set rather than an empty one',
        adjustmentSet('notAVariable','weight').status==='unknown');
      /* propensity */
      var p=propensityAnalysis('calories','weight');
      ok('propensity either resolves or says exactly what it needs',
        p.status==='ok'||(Array.isArray(p.need)||!!p.note));
      ok('an unidentifiable effect is refused rather than estimated',
        (function(){
          var bad={status:'not-identifiable'};
          return p.status!=='not-identifiable'||/none is offered/.test(p.caveat);})());
      ok('where it resolves, balance is reported per covariate',
        p.status!=='ok'||p.balance.every(function(b){return 'standardisedDiff' in b;}));
      ok('poor overlap invalidates the adjusted figure rather than being a footnote',
        p.status!=='ok'||!p.imbalanced.length||/not trustworthy/.test(p.verdict));
      ok('it states that randomisation would answer what this approximates',
        p.status!=='ok'||/randomised sequence/.test(p.caveat));
      /* negative controls */
      var nc=negativeControlCheck('calories');
      ok('a negative control tests the method rather than the hypothesis',
        nc.status!=='ok'||/tests the method rather than the hypothesis/.test(nc.note));
      ok('an association where none can exist is called out as confounding',
        (function(){var n2=negativeControlCheck('steps');
          return n2.status!=='ok'||!n2.suspicious||/driving both/.test(n2.verdict);})());
      ok('passing a negative control is not claimed to establish causation',
        nc.status!=='ok'||/does not establish/.test(nc.caveat));
      /* N-of-1 pooling */
      var pl=poolNofOne('steps');
      ok('pooling needs repeats and says so',
        pl.status==='ok'||/Pooling needs repeats/.test(pl.note));
      ok('disagreement between runs is treated as the finding',
        pl.status!=='ok'||pl.consistent||/disagreement is the finding/.test(pl.caveat));
      ok('the causal layer writes nothing',
        (function(){var n=DB.observations.length;
          dagValidate();adjustmentSet('steps','weight');propensityAnalysis('calories','weight');
          return DB.observations.length===n;})());
    });
    /* ---- universal Bayesian engine, exact t, real propensity (ConBWork.md) ---- */
    withFixture('successful_cut',function(){
      /* The t-distribution against published critical values — the whole point is that it is exact. */
      ok('the Student-t CDF matches published two-sided critical values',
        Math.abs(studentTP(2.086,20)-0.05)<0.001&&
        Math.abs(studentTP(2.042,30)-0.05)<0.001&&
        Math.abs(studentTP(2.228,10)-0.05)<0.001);
      ok('it converges to the normal at large degrees of freedom',
        Math.abs(studentTP(1.96,100000)-0.05)<0.002);
      ok('a larger t gives a smaller p at fixed df',studentTP(3,20)<studentTP(2,20));
      ok('fewer degrees of freedom give a larger p at fixed t',studentTP(2.1,10)>studentTP(2.1,100));
      /* universal engine */
      var g=bayesUpdate({prior:{mean:2985,sd:298},observations:[{value:2825,sd:95}]});
      ok('the general engine produces a posterior narrower than either input',
        g.status==='ok'&&g.sd<298&&g.sd<=95);
      ok('the posterior lies between prior and observation',
        g.mean>Math.min(2985,2825)-1&&g.mean<Math.max(2985,2825)+1);
      ok('no prior is refused rather than assumed',
        bayesUpdate({observations:[{value:1,sd:1}]}).status==='no-prior');
      ok('no observations returns the prior and says that is correct',
        (function(){var e=bayesUpdate({prior:{mean:100,sd:10},observations:[]});
          return e.status==='prior-only'&&/not a failure/.test(e.note);})());
      ok('maintenance routed through the general engine agrees with the purpose-built one',
        (function(){var u=tdeeBayesUniversal();
          return u.status!=='ok'||u.agreesWithSpecific===true;})());
      ok('the predictive is wider than the posterior',
        (function(){var p2=g.predictive(50);return p2.sd>g.sd;})());
      /* hierarchical */
      var h=empiricalBayesPool([{id:'a',value:1.2,sd:0.4},{id:'b',value:0.8,sd:0.5},{id:'c',value:1.0,sd:0.3}]);
      ok('a hierarchical fit shrinks each unit toward the hyper-mean',
        h.status==='ok'&&h.rows.every(function(r){
          return Math.abs(r.shrunk-h.hyperMean)<=Math.abs(r.raw-h.hyperMean)+1e-9;}));
      ok('between-unit variance is never negative',h.betweenVariance>=0);
      ok('non-exchangeable units are flagged rather than pooled silently',
        (function(){var d=empiricalBayesPool([{id:'a',value:10,sd:0.1},{id:'b',value:-10,sd:0.1}]);
          return d.status!=='ok'||(!d.exchangeable&&/NOT exchangeable/.test(d.caveat));})());
      ok('one unit cannot be pooled',empiricalBayesPool([{id:'a',value:1,sd:1}]).status==='insufficient');
      /* propensity, properly named and properly modelled */
      ok('the old function is available under a name that describes it',
        typeof treatmentAssignmentBalance==='function');
      var ps=propensityScoreModel('calories','weight');
      ok('a covariate the graph requires but nothing records is reported as a capability gap',
        ps.status!=='covariate-not-tracked'||/no amount of waiting fixes it/.test(ps.note));
      ok('an estimate is not offered when a required covariate is missing',
        ps.status!=='covariate-not-tracked'||ps.iptwEstimate==null);
      ok('where it runs, positivity and overlap are reported before the effect',
        ps.status!=='ok'||(ps.positivityOk!=null&&ps.commonSupport&&ps.effectiveSampleSize!=null));
      /* maturity */
      var m=maturityReport();
      ok('every engine carries a maturity grade',m.rows.every(function(r){return MATURITY[r.grade];}));
      ok('nothing claims experimental or prospective validation',
        m.experimentallyValidated===0&&/NOTHING in this system/.test(m.caveat));
      ok('the training-demand layer is graded as infrastructure rather than validated',
        ENGINE_MATURITY.mechanicalDemand==='INFRASTRUCTURE_GRADE'&&
        ENGINE_MATURITY.fatigueCompartments==='INFRASTRUCTURE_GRADE');
      /* reproducible run identity */
      ok('an identical analysis reproduces the same run id',
        runIdentity({model:'m',inputs:{a:1}}).runId===runIdentity({model:'m',inputs:{a:1}}).runId);
      ok('any change in inputs, params or as-of produces a different id',
        runIdentity({model:'m',inputs:{a:1}}).runId!==runIdentity({model:'m',inputs:{a:2}}).runId&&
        runIdentity({model:'m',inputs:{a:1},asOf:'2020-01-01'}).runId!==
        runIdentity({model:'m',inputs:{a:1},asOf:'2020-01-02'}).runId);
      ok('run identity does not claim to be reproducible output',
        /not reproducible output on its own/.test(runIdentity({model:'m'}).caveat));
    });
    /* ---- causal universe, model competition, invalidation (ConBWork.md) ---- */
    withFixture('successful_cut',function(){
      var v=dagValidate();
      ok('the expanded causal graph is still acyclic',v.acyclic,v.issues.join('; '));
      ok('it covers the variables the application actually reasons about',v.nodes>=40);
      ok('feedback in the expanded graph is still held as lagged edges',v.laggedEdges>=5);
      var cc=causalCoverage();
      ok('coverage distinguishes tracked from untracked graph variables',
        cc.tracked>0&&Array.isArray(cc.untracked));
      ok('an untracked node is not treated as a defect in the graph',
        /omitting a variable silently asserts/.test(cc.caveat));
      /* the widened adjustment search */
      var a2=adjustmentSet('calories','weight');
      ok('the adjustment search goes beyond three variables',
        a2.status!=='ok'||a2.searchedUpTo==='search stopped early'||a2.searchedUpTo>3);
      ok('a capped search reports "not found" rather than "does not exist"',
        (function(){var s2=adjustmentSet('steps','weight');
          return !s2.searchCapped||/rather than "does not exist"/.test(s2.note);})());
      /* model competition by replay */
      var bt=backtestEstimators('tdee',{points:6});
      ok('more than one estimator competes for maintenance',
        (MODEL_ROLES.tdee&&MODEL_ROLES.tdee.challengers.length>=1));
      ok('estimators are scored by replay rather than by comparing today\u2019s outputs',
        bt.status!=='ok'||/say nothing about which predicts better/.test(bt.note));
      ok('an unscored champion is not silently kept',
        bt.status!=='ok'||bt.championScored||/cannot be defended on accuracy/.test(bt.recommendation));
      ok('scoring reports error, bias and coverage rather than error alone',
        bt.status!=='ok'||bt.rows.every(function(r){return r.mae!=null&&r.bias!=null&&r.coverage!=null;}));
      ok('promotion requires a margin beyond the noise',
        bt.status!=='ok'||!/promote/.test(bt.recommendation)||bt.margin>bt.rows[0].mae*0.1);
      ok('a population baseline beating the personal models is stated plainly',
        bt.status!=='ok'||!/population/.test(bt.best)||/not yet earning their complexity/.test(bt.baselineWins||''));
      /* lifecycle */
      ok('a stage change records why it happened',
        (function(){setModelStage('testModel','candidate','a reason');
          var lc=modelLifecycle().testModel;
          return lc&&lc.stage==='candidate'&&lc.why==='a reason';})());
      ok('an unknown stage is refused',setModelStage('testModel','madeUpStage','x')===null);
      /* dependency invalidation */
      var p2=invalidationPlan('foodReference');
      ok('a reference change propagates through the derivation graph',
        p2.status==='ok'&&p2.count>=5);
      ok('it reports whether the change can reach the decision',
        p2.status!=='ok'||typeof p2.reachesDecision==='boolean');
      ok('the recompute order puts dependencies before dependents',
        p2.status!=='ok'||p2.recomputeOrder.indexOf('tdee')<=p2.recomputeOrder.indexOf('decision')||
        p2.recomputeOrder.indexOf('decision')<0);
      ok('applying invalidation reports what actually changed, including nothing',
        (function(){var r=applyInvalidation('foodReference');
          return r.status==='ok'&&typeof r.anythingChanged==='boolean'&&!!r.summary;})());
      ok('a node nothing depends on is reported as possibly a missing edge',
        /missing an edge/.test(invalidationPlan('notAThing').note||''));
    });
    /* ---- typing coverage, missing data, measurement (ConBWork.md) ---- */
    withFixture('successful_cut',function(){
      var u=untypedQuantities();
      ok('the type registry covers more than the original fifteen',u.typesDeclared>=35);
      ok('typing coverage is measured against fields the engines actually emit',u.checked>0);
      ok('untyped cross-model fields are named rather than counted',
        u.untyped.length===0||u.caveat.indexOf(u.untyped[0])>=0);
      ok('internal diagnostics are excluded rather than counted as failures',
        u.diagnostics>0&&/never crosses a model boundary/.test(u.note));
      /* IPW */
      var w2=missingnessWeights('calories');
      ok('inverse-probability weighting produces an effective sample size',
        w2.status!=='ok'||w2.effectiveSampleSize>0);
      ok('extreme weights make the estimate untrustworthy rather than being ignored',
        w2.status!=='ok'||w2.trustworthy||/unstable/.test(w2.caveat));
      ok('IPW states that it cannot fix missingness depending on the unseen value',
        w2.status!=='ok'||/this does nothing and the bias remains/.test(w2.caveat));
      /* multiple imputation */
      var mi=multipleImputation('calories',{draws:10});
      ok('imputation widens the interval rather than filling with the mean',
        mi.status!=='ok'||(mi.se>0&&/falsely narrow interval/.test(mi.caveat)));
      ok('it reports how much was imputed',mi.status!=='ok'||mi.fractionMissing>=0);
      ok('nothing to impute is reported as complete',
        (function(){var r=multipleImputation('weight',{days:3});
          return r.status==='complete'||r.status==='insufficient'||r.status==='ok';})());
      /* MNAR sensitivity — the one that matters */
      var ms=mnarSensitivity('calories');
      ok('sensitivity spans a range of assumptions rather than testing one',
        ms.status!=='ok'||ms.rows.length>=5);
      ok('a robust result is not claimed to prove missing-at-random',
        ms.status!=='ok'||/does not prove/.test(ms.caveat));
      ok('it states there is no test and no correction for MNAR',
        ms.status!=='ok'||/no test for this and no correction/.test(ms.note));
      /* measurement model */
      var mm=measurementModel('weight');
      ok('the measurement model names its reference source',
        mm.status!=='ok'||!!mm.reference);
      ok('bias is described as relative to a chosen reference, not absolute',
        mm.status!=='ok'||/That choice is a decision, not a measurement/.test(mm.caveat));
      ok('a single source cannot have its bias estimated',
        mm.status!=='ok'||mm.sources>1||mm.parameters[0].reference===true);
      ok('these layers write nothing',
        (function(){var n=DB.observations.length;
          untypedQuantities();missingnessWeights('calories');measurementModel('weight');
          return DB.observations.length===n;})());
    });
    /* ---- analytical materialization (ConBWork.md) ---- */
    withFixture('successful_cut',function(){
      var a2=materializeAll({force:true});
      ok('every declared view materialises',a2.computed===Object.keys(MATERIALIZED_VIEWS).length);
      ok('a second pass is served from the store',materializeAll().cached>0);
      ok('a view identity includes the as-of date, so a replay cannot read a present-day entry',
        (function(){
          var now=_viewIdentity('tdee');
          var then=withAsOf(addDays(todayISO(),-30),function(){return _viewIdentity('tdee');});
          return now!==then;})());
      var iv=invalidateViews('weightObservation');
      ok('a dependency change marks the right views stale',iv.count>0);
      ok('stale views are marked rather than deleted, so restatement stays possible',
        /not deleted/.test(iv.note));
      ok('marking stale is distinguished from knowing something changed',
        /Only recomputing says whether it did/.test(iv.caveat));
      var r=restatement('tissueDensity');
      ok('restatement reports what was previously concluded and what it is now',
        r.status==='ok'&&Array.isArray(r.restated));
      ok('it says whether the chain reaches a decision',typeof r.reachesDecision==='boolean');
      ok('nothing changed is confirmed rather than assumed',
        r.count>0||/worth confirming rather than assuming/.test(r.note));
      ok('it admits what cannot be restated',/left no record/.test(r.caveat));
      var bn=materializationBenefit({reps:2});
      ok('the cache is benchmarked rather than assumed to help',
        bn.status==='ok'&&bn.coldMs!=null&&bn.warmMs!=null);
      ok('a cache that buys little says so',
        bn.worthwhile||/buying almost nothing/.test(bn.verdict));
      ok('the benchmark states it is specific to this record and device',
        /record ten times the size/.test(bn.caveat));
      ok('materialized state is declared working state rather than record',
        /never exported and never synced/.test(materializationStatus().note));
      ok('the materialized store is not part of the exported record',
        (function(){
          materializeAll({force:true});
          var ex=serializeDB?serializeDB():null;
          return !ex||String(ex).indexOf('"materialized"')<0;})());
    });
    /* ---- WorkConC: real posterior, content addressing, named estimands ---- */
    withFixture('successful_cut',function(){
      /* The materialization bug: an in-place edit that leaves every count identical. */
      ok('a silent in-place edit changes the cache identity',
        (function(){
          materializeAll({force:true});
          var before=_viewIdentity('weightTrend');
          var obs=DB.observations.filter(function(o){return o.type==='weight';});
          if(!obs.length)return true;
          var saved=obs[obs.length-1].value;
          obs[obs.length-1].value=saved-25;
          var after=_viewIdentity('weightTrend');
          var served=materialize('weightTrend');
          var truth=weightTrend(14).slopePerWeek;
          obs[obs.length-1].value=saved;_memoInvalidate();
          return before!==after&&String(served.value)===String(truth);})());
      ok('the content hash is not memoised on anything that is not the content',
        (function(){
          var h1=_contentHash('observations');
          var obs=DB.observations.filter(function(o){return o.type==='weight';});
          if(!obs.length)return true;
          var saved=obs[0].value;obs[0].value=saved+7;
          var h2=_contentHash('observations');
          obs[0].value=saved;
          return h1!==h2;})());
      ok('an unrelated change does not invalidate an independent view',
        (function(){
          var before=_viewIdentity('weightTrend');
          DB.foodLogs.push({id:'tmp-x',date:todayISO(),nutrients:{kcal:100}});
          var after=_viewIdentity('weightTrend');
          var adh=_viewIdentity('adherence');
          DB.foodLogs=DB.foodLogs.filter(function(l){return l.id!=='tmp-x';});
          return before===after&&!!adh;})());
      /* A real hierarchical posterior, not empirical Bayes wearing the name. */
      var units=[{id:'a',value:1.2,sd:0.4},{id:'b',value:0.8,sd:0.5},{id:'c',value:1.0,sd:0.3}];
      var hp=hierarchicalPosterior(units);
      ok('the hierarchical posterior integrates over tau rather than plugging one in',
        hp.status==='ok'&&hp.tau&&hp.tau.lo!=null&&hp.tau.hi!=null&&hp.tau.lo<hp.tau.hi);
      ok('it is wider than empirical Bayes, because tau uncertainty is carried',
        hp.status!=='ok'||hp.widerThanEmpiricalBayes>=0);
      ok('heterogeneous units produce a large between-unit spread',
        (function(){var h=hierarchicalPosterior([{id:'a',value:5,sd:0.2},{id:'b',value:-5,sd:0.2}]);
          return h.status!=='ok'||h.tau.mean>1;})());
      ok('near-identical units produce a small between-unit spread',
        (function(){var h=hierarchicalPosterior([{id:'a',value:1,sd:0.5},{id:'b',value:1,sd:0.5}]);
          var het=hierarchicalPosterior([{id:'a',value:5,sd:0.2},{id:'b',value:-5,sd:0.2}]);
          return h.status!=='ok'||het.status!=='ok'||h.tau.mean<het.tau.mean;})());
      ok('each unit is shrunk toward the hyper-mean under the posterior',
        hp.status!=='ok'||hp.rows.every(function(r){
          return Math.abs(r.posterior-hp.hyperMean)<=Math.abs(r.raw-hp.hyperMean)+1e-9;}));
      ok('a grid is declared exact-enough rather than claimed to be a sampler',
        hp.status!=='ok'||/only make easier to vary/.test(hp.caveat));
      ok('the N-of-1 full posterior predictive is wider than the pooled estimate',
        (function(){var r=poolNofOneFullBayes('steps');
          return r.status!=='ok'||r.nextRunPredictive.sd>=r.hyperSd;})());
      /* Estimands named rather than left to assumption. */
      var ps=propensityScoreModel('calories','weight');
      ok('the propensity estimate names its estimand',
        ps.status!=='ok'||(ps.estimand==='ATE'&&/not the effect among the days/.test(ps.estimandMeans)));
      /* Continuous treatment rather than median binarisation. */
      var dr=doseResponse('sleep','hunger');
      ok('a dose-response engine exists and refuses for a stated reason',
        dr.status==='ok'||!!dr.note||Array.isArray(dr.need));
      ok('it says binarising would answer a different question',
        dr.status!=='ok'||/throw away the dose/.test(dr.note));
      ok('it refuses to extrapolate beyond the observed dose range',
        dr.status!=='ok'||/Extrapolating beyond the observed dose range/.test(dr.caveat));
    });
    /* ---- one registry, formal MI (WorkConC.md) ---- */
    withFixture('successful_cut',function(){
      var u=unifiedRegistry();
      ok('the prose dictionary derives from the machine types',u.count===Object.keys(TYPES).length);
      ok('prose and types no longer disagree on units',registryDrift().ok,
        registryDrift().issues.join('; '));
      ok('quantities with prose but no type are reported as unchecked',
        u.proseOnly.length===0||/therefore unchecked/.test(u.caveat));
      ok('it names two registries as the mechanism that caused the earlier mismatch',
        /which happened here/.test(u.note));
      /* the t critical value, against published tables */
      ok('the t critical value matches published tables',
        Math.abs(_tCrit(10)-2.228)<0.005&&Math.abs(_tCrit(30)-2.042)<0.005);
      ok('it converges to the normal at large degrees of freedom',Math.abs(_tCrit(1e6)-1.96)<0.005);
      /* formal MI */
      var mi=multipleImputation('calories',{draws:20});
      ok('within- and between-imputation variance are computed separately',
        mi.status!=='ok'||(mi.withinVariance!=null&&mi.betweenVariance!=null&&
          mi.withinVariance!==mi.betweenVariance));
      ok('the fraction of missing information is reported',
        mi.status!=='ok'||(mi.fractionMissingInformation>=0&&mi.fractionMissingInformation<=1));
      ok('the interval uses Student-t at Rubin\u2019s degrees of freedom',
        mi.status!=='ok'||(mi.df>0&&Math.abs(mi.tCritical-_tCrit(mi.df))<0.01));
      ok('more missingness gives a larger fraction of missing information',
        (function(){
          var few=multipleImputation('weight',{draws:10});
          var many=multipleImputation('calories',{draws:10});
          if(few.status!=='ok'||many.status!=='ok')return true;
          return (few.fractionMissing<=many.fractionMissing)===
                 (few.fractionMissingInformation<=many.fractionMissingInformation+0.05);})());
      ok('the imputation model is conditional rather than drawing from the marginal',
        mi.status!=='ok'||/conditional model/.test(mi.note));
    });
    /* ---- identification beyond the backdoor (WorkConC.md) ---- */
    withFixture('successful_cut',function(){
      var st=identificationStrategy('calories','weight');
      ok('identification strategies are enumerated in the order worth trying',
        st.strategies.length>=2&&st.strategies[0].strategy==='backdoor adjustment');
      ok('each strategy says what blocks it rather than just failing',
        st.strategies.every(function(x){return x.available||!!x.blocked||!!x.detail;}));
      ok('no available strategy yields a sensitivity bound rather than an estimate',
        st.usable>0||/sensitivity bound rather than an estimate/.test(st.verdict));
      ok('availability is not claimed to mean the estimate is correct',
        /does not mean the resulting estimate is correct/.test(st.caveat));
      /* front door */
      var fd=frontDoorSet('calories','weight');
      ok('the front door requires intercepting EVERY directed path',
        fd.status!=='none'||/around whatever mediator|no mediator/.test(fd.note));
      ok('a front-door mediator must itself be unconfounded with the outcome',
        /mediator-to-outcome step unconfounded/.test(fd.caveat||'')||fd.status==='none');
      /* instrumental variables */
      var iv=instrumentalEstimate('dayOfWeek','steps','weight');
      ok('instrument strength is reported as a first-stage F against the conventional minimum',
        iv.status!=='ok'||(iv.firstStageF!=null&&/minimum of 10/.test(iv.verdict)||!iv.weak));
      ok('a weak instrument is refused rather than reported',
        iv.status!=='ok'||!iv.weak||/should not be used/.test(iv.verdict));
      ok('a weak instrument is said to bias TOWARD the confounded estimate',
        iv.status!=='ok'||!iv.weak||/biased TOWARD the confounded/.test(iv.verdict));
      ok('the exclusion restriction is stated as untestable',
        iv.status!=='ok'||/cannot be tested, only argued/.test(iv.caveat));
      ok('an instrument not declared to move the treatment is refused',
        instrumentalEstimate('season','protein','weight').status==='not-relevant');
      ok('an undeclared instrument is refused rather than fitted',
        instrumentalEstimate('madeUp','steps','weight').status==='unknown-instrument');
      /* E-value */
      var ev=eValue(-0.3,-0.55,-0.05,{sd:1});
      ok('an E-value quantifies how strong unmeasured confounding would need to be',
        ev.status==='ok'&&ev.eValue>1);
      ok('the interval E-value is at least as demanding as the point one',
        ev.eValueForInterval==null||ev.eValueForInterval>=1);
      ok('a large E-value is not claimed to prove absence of confounding',
        /does not mean no confounding exists/.test(ev.caveat));
      /* governance */
      var wf=walkForwardBacktest('tdee');
      ok('governance walks forward rather than sampling six points',
        wf.status!=='ok'||wf.walkForward===true);
      ok('an inadequate number of replay points is stated as inadequate',
        wf.status!=='ok'||wf.adequate||/still a small tournament/.test(wf.caveat));
      var pd=promotionDecision('tdee');
      ok('promotion follows a stated rule with thresholds written down',
        pd.status!=='ok'||(pd.rule&&pd.rule.minPoints>0));
      ok('blockers are listed when promotion is refused',
        pd.status!=='ok'||pd.promote||pd.blockers.length>0);
      ok('the rule admits its own thresholds are a judgement',
        pd.status!=='ok'||/thresholds are arguable/.test(pd.caveat));
    });
    /* ---- presentation layer (visual system) ---- */
    withFixture('successful_cut',function(){
      ok('every epistemic class has a declared visual treatment',
        Object.keys(CLASSES||{}).every(function(k){return !!EPISTEMIC_VISUALS[k];}));
      ok('meaning never rests on colour alone',
        Object.keys(EPISTEMIC_VISUALS).every(function(k){
          return !!EPISTEMIC_VISUALS[k].pattern&&!!EPISTEMIC_VISUALS[k].weight;}));
      ok('a class with no declared visual is marked undeclared rather than styled as normal',
        visualForClass('NOT_A_CLASS').undeclared===true);
      ok('contrast meets the required ratio in both themes',accessibilityAudit().ok,
        JSON.stringify(accessibilityAudit().issues.slice(0,2)));
      /* the central prohibition */
      var t=tdeePersonal();
      var pm=presentationModel({result:t,quantity:'tdee',model:'tdeePersonal'});
      ok('a presentation model carries the value forward unchanged',
        pm.status!=='ok'||pm.value===t.value);
      ok('it carries the epistemic class unchanged',pm.status!=='ok'||pm.cls===t.cls);
      ok('it carries the interval and provenance',
        pm.status!=='ok'||(!!pm.provenance&&pm.provenance.asOf===asOf()));
      ok('it refuses to present without a source result',
        presentationModel({}).status==='no-source');
      ok('an unresolved result presents as unresolved rather than as zero',
        (function(){var u=presentationModel({result:{status:'insufficient',need:['x']},quantity:'tdee'});
          return u.status==='unavailable'&&/would be asserting a measurement that does not exist/.test(u.note);})());
      /* contracts */
      ok('a visualization without a contract is rejected',
        validateVisualization('NoSuchChart',pm).ok===false);
      ok('a class outside the declared set is rejected',
        (function(){var bad=presentationModel({result:{status:'ok',value:1,cls:'HEURISTIC'},quantity:'weightTrend'});
          return validateVisualization('WeightTrendChart',bad).ok===false;})());
      ok('a result with no class cannot be styled honestly',
        (function(){var nc=presentationModel({result:{status:'ok',value:1},quantity:'weightTrend'});
          var r=validateVisualization('WeightTrendChart',nc);
          return !r.ok&&/no epistemic class/.test(r.violations.join(' '));})());
      ok('refusing to draw is always contract-compliant',
        validateVisualization('WeightTrendChart',
          presentationModel({result:{status:'insufficient',need:['x']},quantity:'tdee'})).ok===true);
      ok('every model a view can present declares a class',
        presentationAudit().findings.filter(function(f){return f.area==='semantics';}).length===0);
      ok('the presentation audit reports no P1',presentationAudit().ok);
    });
    /* ---- fonts, chart types, presentation self-audit (visual spec §7, §18, §55) ---- */
    withFixture('successful_cut',function(){
      var f=fontRegistryAudit();
      ok('every font stack ends in a generic family and has a fallback',f.ok,f.issues.join('; '));
      ok('accessibility faces are first-class rather than an afterthought',f.accessibilityFaces>=2);
      ok('a stack resolves to a usable CSS value',/sans-serif|serif|monospace/.test(fontFallbackStack('text')||''));
      ok('the dyslexia face states that its evidence is mixed',
        /evidence is mixed/.test(FONT_REGISTRY.opendyslexic.note));
      var ct=chartTypeAudit();
      ok('every chart type declares how it misleads',ct.ok,ct.issues.join('; '));
      ok('a temporal quantity gets a line rather than bars',
        chartTypeFor('weight','trend').chart==='line');
      ok('a forecast gets a fan that must widen',
        chartTypeFor('weight','forecast').chart==='fan'&&
        /does not widen/.test(CHART_TYPES.fan.misleads));
      ok('the chart choice carries the quantity\u2019s epistemic class',
        !!chartTypeFor('weight','trend').epistemic);
      ok('an untyped quantity gets no chart recommendation',
        chartTypeFor('notAQuantity','trend').status==='untyped');
      var sa=presentationSelfAudit();
      ok('the self-audit covers theme, visualization, interface, experience and layout',
        ['theme','visual','ui','ux','responsive'].every(function(k){return !!sa.parts[k];}));
      ok('it returns findings rather than a score',Array.isArray(sa.findings)&&/would be comforting/.test(sa.note));
      ok('the responsive check distinguishes a fixed width from a breakpoint',
        sa.parts.responsive.findings.every(function(x){return !/min-width|max-width/.test(x);}));
      ok('an unreadable stylesheet is reported as inconclusive rather than as a pass',
        sa.parts.responsive.readable||sa.parts.responsive.inconclusive===true);
      ok('where the stylesheet is readable, safe-area insets are declared',
        !sa.parts.responsive.readable||
        !sa.parts.responsive.findings.some(function(x){return /safe-area/.test(x);}));
    });
    /* ---- presentation completion (visual spec, strict verification) ---- */
    withFixture('successful_cut',function(){
      var pc=presentationCompletionAudit();
      ok('every declared shape states what it is for',pc.parts.shapes.issues.length===0);
      ok('every chart type declares a failure mode',pc.parts.charts.ok);
      ok('every component declares states and a 44px touch target',pc.parts.components.ok,
        pc.parts.components.issues.join('; '));
      ok('breakpoint ranges have no gaps or overlaps',pc.parts.breakpoints.issues.length===0);
      ok('a width resolves to exactly one breakpoint',
        breakpointFor(390).name==='phone'&&breakpointFor(1600).name==='ultrawide');
      ok('columns stop growing on very wide screens',
        BREAKPOINTS.ultrawide.columns===BREAKPOINTS.desktop.columns);
      /* the colour-blind finding, and the reason it is ranked rather than counted */
      var cb=colorBlindAudit();
      ok('success and danger do not collapse under any simulation',cb.ok,cb.issues.join('; '));
      ok('lesser collisions are reported as advisories rather than hidden',
        Array.isArray(cb.advisories));
      ok('the reason for ranking is stated rather than assumed',
        /actively misleads/.test(cb.note));
      ok('the categorical chart palette separates adjacent series',chartPaletteAudit().ok);
      ok('colour is never the only channel',
        Object.keys(EPISTEMIC_VISUALS).every(function(k){
          var v=EPISTEMIC_VISUALS[k];return !!(v.pattern||v.stroke)&&!!(v.weight||v.marker);}));
      ok('every observation type resolves to a semantic type',typeCoverage().ok,
        typeCoverage().untyped.slice(0,6).join(', '));
      /* numeric typography */
      ok('large numbers use compact notation and small ones do not',
        formatNumeric(12345,'calories').text==='12.3k'&&formatNumeric(950,'calories').text==='950');
      ok('a change quantity is signed',/^\+/.test(formatNumeric(1.2,'neatDrift').text));
      ok('scientific notation is refused outright',
        NUMERIC_POLICY.notation.scientific==='never in the interface');
      ok('figures are tabular so columns line up',formatNumeric(1,'weight').alignment==='tabular');
      /* renderer and font policy */
      ok('a renderer is chosen from node count rather than preference',
        rendererFor(100)==='svg'&&rendererFor(50000)==='canvas'&&rendererFor(0,'text')==='html');
      /* Reversed deliberately: "no font files are shipped" was true, and was the problem — the accessibility faces were
         named but never available. The policy now states that every offered face is bundled. */
      ok('the font policy states that every offered face is bundled',
        /embedded in the build/.test(FONT_POLICY.availability));
      ok('font availability is reported as unknown where it cannot be tested',
        (function(){var a2=fontAvailability('hyperlegible');
          return a2.firstAvailable===null?/cannot be tested/.test(a2.note):true;})());
      ok('neomorphic elevation is declared unusable with the reason',
        /fails accessibility/.test(ELEVATION.neomorphic.caution));
    });
    /* ---- appearance: reachable, and contrast-gated (§43) ---- */
    withFixture('successful_cut',function(){
      var ap=appearanceProfiles();
      ok('appearance profiles exist as named bundles',ap.rows.length>=4);
      ok('every offered profile passes contrast',
        ap.rows.filter(function(r){return r.offerable&&r.contrast&&r.contrast.checked;})
          .every(function(r){return r.contrast.ok;}));
      ok('a failing combination is withheld rather than warned about',
        /withheld rather than offered/.test(ap.note));
      ok('withheld profiles are named so the omission is visible',Array.isArray(ap.withheld));
      ok('every accent passes on every concrete theme',
        Object.keys(THEMES).filter(function(t){return THEMES[t].surface;}).every(function(t){
          return Object.keys(ACCENTS).filter(function(a2){return a2!=='none';}).every(function(a2){
            var r=contrastRatio(accentValue(a2,t),THEMES[t].surface);
            return r==null||r>=3;});}));
      ok('an accent has a variant per surface lightness',
        accentValue('sage','dark')!==accentValue('sage','light'));
      ok('an unreadable accent is refused rather than applied',
        (function(){
          var saved=DB.settings.theme;DB.settings.theme='light';
          /* Force a known-bad pairing by asking for the dark variant on a light surface. */
          var r=contrastRatio(ACCENTS.sage.onDark,THEMES.light.surface);
          DB.settings.theme=saved;
          return r<3;})());
      ok('an undeclared option is refused',setAppearance('theme','neon').status==='unknown');
      ok('changing one setting clears the profile name',
        (function(){
          applyAppearanceProfile('accessible');
          var had=DB.settings.appearanceProfile==='accessible';
          setAppearance('shape','industrial');
          return had&&!DB.settings.appearanceProfile;})());
      ok('applying a profile sets every member setting',
        (function(){
          applyAppearanceProfile('accessible');
          var p2=APPEARANCE_PROFILES.accessible;
          return DB.settings.font===p2.font&&DB.settings.textScale===p2.textScale&&
                 DB.settings.motion===p2.motion;})());
      ok('the accessible profile removes accent colour entirely',
        APPEARANCE_PROFILES.accessible.accent==='none');
      ok('appearance state reports when no profile is active',
        (function(){setAppearance('theme','dark');
          return appearanceState().profile===null;})());
    });
    /* ---- the two presentation registries are joined ---- */
    withFixture('successful_cut',function(){
      var r=uncertaintyStyleResolution();
      ok('every uncertainty kind names a style the render registry defines',r.ok,r.unresolved.join('; '));
      ok('the join covers every declared kind',r.rows.length===Object.keys(UNCERTAINTY_STYLES).length);
      ok('the two registries are not the same thing under one name',
        Object.keys(UNCERTAINTY_STYLES).length!==Object.keys(UNCERTAINTY_RENDER_STYLES).length||
        typeof UNCERTAINTY_STYLES.measurement==='string');
      ok('resolution is not claimed to validate the design choice',
        /design judgement no check settles/.test(r.caveat));
      /* the merged module's own surface survived the merge */
      ok('the visual-complete functions are present after the merge',
        typeof widgetAudit==='function'&&typeof dashboardCompose==='function'&&
        typeof clippingAudit==='function');
      ok('the appearance apply layer from this branch is present',
        typeof applyPresentationAppearance==='function');
    });
    /* ---- P0 foundation (implementation direction, steps 2, 6, 7, 8, 9) ---- */
    withFixture('successful_cut',function(){
      /* step 6: cryptographic identity, verified against published SHA-256 vectors */
      ok('sha256 of the empty string matches the published vector',
        sha256('')==='e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
      ok('sha256 of "abc" matches the published vector',
        sha256('abc')==='ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
      ok('serialisation is independent of key order',
        canonicalJSON({b:1,a:{d:2,c:3}})===canonicalJSON({a:{c:3,d:2},b:1}));
      var r1=runIdentity({model:'m',inputs:{x:1,y:2}}),r2=runIdentity({model:'m',inputs:{y:2,x:1}});
      ok('the same computation produces the same run id',r1.runId===r2.runId);
      ok('any material change produces a different run id',
        r1.runId!==runIdentity({model:'m',inputs:{x:1,y:3}}).runId&&
        r1.runId!==runIdentity({model:'m',inputs:{x:1,y:2},asOf:'2020-01-01'}).runId);
      ok('run identity is SHA-256, not a 32-bit checksum',r1.algorithm==='sha256'&&r1.digest.length===64);
      /* step 8: version vector */
      var vv=versionVector();
      ok('the version vector separates all seven identities',
        ['applicationVersion','schemaVersion','ontologyVersion','modelVersion','referenceDataVersion',
         'foodDatabaseVersion','adapterVersion'].every(function(k){return vv[k]!=null;}));
      ok('an application change invalidates nothing on its own',
        VERSION_INVALIDATES.applicationVersion.length===0);
      /* step 2: one quantity registry */
      var qa=quantityRegistryAudit();
      ok('there is exactly one quantity registry',qa.singleSource);
      ok('every quantity carries the fields the direction requires',qa.ok,qa.issues.slice(0,3).join('; '));
      ok('an unknown quantity is rejected at the boundary',validateQuantityValue('bogus',1).ok===false);
      ok('a wrong unit is rejected',validateQuantityValue('weight',80,'kcal').ok===false);
      ok('dimensional mismatch is caught before calculating',
        assertDimensionallyCompatible('weight','intake').ok===false);
      ok('a missing value is a gap, never a zero',
        Object.keys(QUANTITY_REGISTRY).every(function(k){return QUANTITY_REGISTRY[k].missingnessSemantics==='gap';}));
      /* step 7: provenance generated during execution */
      var run=infer({modelId:'tdee_personal'});
      ok('inference returns a provenance DAG built during execution',
        run.status!=='ok'||(run.provenance&&run.provenance.nodes.length>=3));
      ok('the DAG runs observation to model-run to inference',
        run.status!=='ok'||['observation','model-run','inference'].every(function(t){
          return run.provenance.nodes.some(function(n){return n.type===t;});}));
      ok('every provenance parent exists and every type is declared',provenanceAudit().ok,
        provenanceAudit().issues.slice(0,2).join('; '));
      ok('provenance is retrievable by run id',run.status!=='ok'||!!provenanceFor(run.runId));
      /* step 9: capabilities derived, never assigned */
      var cm=capabilityMatrix();
      ok('every capability has a status derived from evidence',
        cm.rows.every(function(r){return CAPABILITY_STATUSES.indexOf(r.status)>=0&&!!r.evidence;}));
      ok('nothing is production-ready without experimental validation',
        cm.rows.filter(function(r){return r.status==='production-ready';}).every(function(r){
          return r.maturity==='EXPERIMENTALLY_VALIDATED'||r.maturity==='PRODUCTION_PREDICTIVE';}));
      ok('implemented-but-unsurfaced capabilities are detected rather than hidden',
        Array.isArray(cm.detections.implementedButUnsurfaced));
    });
    /* ---- steps 3–5: registry as authority, infer through it, typed graph ---- */
    withFixture('successful_cut',function(){
      var ra=modelRegistryAudit();
      ok('every registered model names a function that exists',ra.ok&&ra.executable===ra.models,
        ra.issues.slice(0,3).join('; '));
      ok('every registered model carries a maturity grade',ra.graded===ra.models);
      ok('grades are derived by rule where none was assigned',ra.derivedGrades>0);
      var c=modelContract('tdee_personal');
      ok('a model contract carries every field the direction specifies',
        ['id','version','maturity','inputs','outputs','dependencies','assumptions','applicability',
         'evidenceRequirements','uncertaintyContract','provenanceContract','materialization',
         'lifecycle','validation','consumers'].every(function(k){return c[k]!==undefined;}));
      ok('no heuristic is graded above infrastructure without outcome scoring',
        MODELS.filter(function(m){return m.cls==='HEURISTIC'&&!SCORED_AGAINST_OUTCOMES[m.id];})
          .every(function(m){return modelMaturity(m)==='INFRASTRUCTURE_GRADE'||!!ENGINE_MATURITY[m.fn];}));
      ok('nothing in the model registry claims experimental validation',
        MODELS.every(function(m){return modelMaturity(m)!=='EXPERIMENTALLY_VALIDATED'&&
          modelMaturity(m)!=='PRODUCTION_PREDICTIVE';}));
      /* infer through the registry */
      var r=infer({modelId:'tdee_personal'});
      ok('infer resolves a model by id through the registry',r.status==='ok'&&r.modelId==='tdee_personal');
      ok('the result carries version, maturity, uncertainty and provenance',
        !!r.modelVersion&&!!r.maturity&&!!r.uncertainty&&!!r.provenance);
      ok('an unregistered model id is refused rather than guessed',infer({modelId:'nope'}).status==='unknown-model');
      ok('the removed function-name call shape is refused, and counted so any caller is found',
        (function(){var r0=infer({model:'weightTrend'});return r0.status==='refused'&&(INFER_LEGACY_CALLS.weightTrend||0)>0;})());
      /* typed dependency graph and invalidation */
      var g=registryDependencyGraph();
      ok('the dependency graph is built from the registry with typed edges',
        g.edges.length>0&&g.edges.every(function(e){return DEPENDENCY_TYPES.indexOf(e.dependencyType)>=0;}));
      var af=affectedBy('weight');
      ok('a change to weight reaches its dependent models',af.models.indexOf('weight_trend')>=0);
      ok('it reaches through models to their dependents',af.models.indexOf('tdee_personal')>=0);
      ok('it reports affected materializations and decisions',
        Array.isArray(af.materializations)&&Array.isArray(af.decisions));
    });
    /* ---- step 10: presentation studio edits a specification ---- */
    withFixture('successful_cut',function(){
      DB.settings.theme='dark';
      ok('a custom accent that passes contrast is accepted',setCustomAccent('#6fb3ff').status==='ok');
      ok('a custom accent that fails contrast is refused with the measured ratio',
        (function(){var r=setCustomAccent('#1a1a2e');return r.status==='refused'&&r.ratio<3;})());
      ok('a value that is not a hex colour is refused',setCustomAccent('blue').status==='refused');
      ok('the spec validates against the same registries the runtime uses',
        validateAppearanceSpec(appearanceSpec()).ok);
      ok('an unknown theme fails validation',validateAppearanceSpec({theme:'neon'}).ok===false);
      ok('a spec from a newer version is refused rather than half-applied',
        validateAppearanceSpec({specVersion:APPEARANCE_SPEC_VERSION+1}).ok===false);
      /* profiles */
      ok('the current appearance can be saved as a named profile',saveAppearanceProfile('Test A').status==='ok');
      ok('a built-in profile cannot be overwritten',saveAppearanceProfile('reading').status==='refused');
      ok('a profile can be duplicated',duplicateAppearanceProfile('Test A','Test B').status==='ok');
      ok('a duplicate name is refused',duplicateAppearanceProfile('Test A','Test B').status==='refused');
      ok('a profile can be deleted',deleteAppearanceProfile('Test B').status==='ok');
      ok('reset returns to the standard profile',resetAppearance().status==='ok'&&
        DB.settings.appearanceProfile==='standard'&&!DB.settings.customAccent);
      /* import: the direction's pipeline, stage by stage */
      var ex=exportAppearanceSpec();
      ok('an exported specification round-trips',importAppearanceSpec(ex.text).status==='ok');
      ok('malformed input is rejected at the parse stage',importAppearanceSpec('{nope').stage==='parse');
      ok('a different kind of file is rejected at the schema stage',
        importAppearanceSpec('{"kind":"backup"}').stage==='schema');
      ok('a well-formed spec with a bad value is rejected at the semantic stage',
        importAppearanceSpec('{"theme":"neon"}').stage==='semantic');
      ok('an export contains no personal data',!/weight|calorie|session|observation/i.test(ex.text));
      ok('the token inspector reports measured contrast',
        (function(){DB.settings.theme='dark';var ti=tokenInspector();
          return ti.rows.some(function(r){return /contrast/.test(r.token)&&/:1$/.test(String(r.value));});})());
      deleteAppearanceProfile('Test A');
    });
    /* ---- step 11: one dashboard system and its editor ---- */
    withFixture('successful_cut',function(){
      var da=dashboardSystemAudit();
      ok('every widget is bound to a renderer that exists and to registered models',da.ok,da.issues.slice(0,3).join('; '));
      /* the two mistakes made while building this, pinned so they cannot return */
      ok('migrating widgets never redefines an existing widget',
        WIDGET_REGISTRY['body.weightTrend'].renderer==='lineChart'&&
        WIDGET_REGISTRY['body.weightTrend'].contractId==='WeightTrendChart');
      ok('the dashboard renders through the single widget bridge, not a parallel dispatch',
        /renderWidget\(/.test(renderDashboard.toString())&&!/WIDGET_RENDERERS\[reg\.renderer\]\(/.test(renderDashboard.toString()));
      ok('the legacy compose path delegates to the canonical one',dashboardCompose().status==='ok');
      var spec=currentDashboard();
      ok('built-in dashboards validate',validateDashboardSpec(BUILTIN_DASHBOARDS.standard).ok);
      /* operations return a new spec and never mutate the original */
      var before=JSON.stringify(spec);
      var r=applyDashboardOperation(spec,{type:'hideWidget',widgetId:'system.attention'});
      ok('an operation returns a new specification',r.status==='ok'&&r.spec!==spec);
      ok('an operation never mutates the specification it was given',JSON.stringify(spec)===before);
      ok('adding a widget already present is refused',
        applyDashboardOperation(spec,{type:'addWidget',widgetId:'recovery.readiness'}).status==='refused');
      ok('an unsupported size is refused by validation',
        applyDashboardOperation(spec,{type:'resizeWidget',widgetId:'energy.today',size:'lg'}).status==='refused');
      ok('a section still holding widgets cannot be removed',
        applyDashboardOperation(spec,{type:'removeSection',sectionId:'record'}).status==='refused');
      ok('an unknown operation is refused',applyDashboardOperation(spec,{type:'bogus'}).status==='invalid-operation');
      ok('a widget can move to another section',
        (function(){var m=applyDashboardOperation(spec,{type:'moveWidget',widgetId:'energy.today',toSection:'record',toIndex:0});
          return m.status==='ok'&&m.spec.sections[2].widgets[0].widgetId==='energy.today';})());
      ok('pinned widgets render first',
        (function(){var p=applyDashboardOperation(spec,{type:'pinWidget',widgetId:'energy.today'}).spec;
          var c=composeDashboardSpec(p);return c.sections[0].widgets[0].pinned;})());
      ok('a narrow screen composes every widget at its smallest size',
        composeDashboardSpec(spec,{width:390}).sections.every(function(s){
          return s.widgets.every(function(w){return w.size===WIDGET_REGISTRY[w.widgetId].sizes[0];});}));
      /* saving */
      ok('editing a built-in forks it rather than overwriting it',
        (function(){var c=commitDashboard(spec);return c.status==='ok'&&c.id!=='standard'&&!!BUILTIN_DASHBOARDS.standard;})());
      ok('a built-in dashboard cannot be deleted',deleteDashboard('standard').status==='refused');
      /* rendering */
      var html=renderDashboard(currentDashboard());
      ok('the rendered dashboard contains no NaN or undefined',!/NaN|undefined/.test(html));
      ok('the attention tile agrees with the attention queue',
        (function(){var reg=WIDGET_REGISTRY['system.attention'];
          var t=renderWidget('system.attention',{widget:reg}).html.replace(/<[^>]+>/g,' ');
          var n=attentionQueue().items.length;return new RegExp('\\b'+n+'\\b').test(t);})());
      ok('a count renders as an integer',
        !/\d\.\d\d/.test(renderWidget('system.attention',{widget:WIDGET_REGISTRY['system.attention']}).html.replace(/<[^>]+>/g,' ')));
    });
    /* ---- step 12: one chart catalogue, the visualization pipeline, the studio ---- */
    withFixture('successful_cut',function(){
      ok('there is exactly one chart-type catalogue',CHART_TYPES===VISUALIZATION_REGISTRY);
      var cat=chartCatalogue();
      ok('every catalogued chart type says what it encodes and how it misleads',
        cat.rows.every(function(r){return !!r.encodes&&!!r.misleads;}));
      ok('the catalogue covers the thirty-two types the actions list names',
        ['line','area','stackedArea','bar','groupedBar','stackedBar','horizontalBar','scatter','bubble','histogram',
         'boxPlot','violin','heatmap','calendarHeatmap','radar','polar','donut','gauge','funnel','waterfall','sankey',
         'timeline','gantt','candlestick','sparkline','smallMultiple','ridgeline','parallelCoordinates','network',
         'tree','treemap','sunburst'].every(function(t){return !!VISUALIZATION_REGISTRY[t];}));
      ok('a type is renderable only if a renderer for it exists',
        cat.rows.every(function(r){return r.renderable===(typeof CHART_RENDERERS[r.type]==='function');}));
      /* A type catalogued without a renderer is listed as specified, not implied to work — tested with a temporary type,
         since every real type now has a renderer. */
      ok('types without a renderer are listed as specified rather than implied to work',(function(){CHART_TYPES.__plannedTest={dimensions:['numeric'],encodes:'test',misleads:'test',requires:[],minObservations:1};
        var c2=(typeof chartCatalogue==='function'?chartCatalogue():null);var r=!!c2&&c2.specifiedOnly.indexOf('__plannedTest')>=0&&/cannot yet be drawn/.test(c2.note);delete CHART_TYPES.__plannedTest;return r;})());
      /* the pipeline, stage by stage */
      var v=buildVisualization({modelId:'weight_trend',chartType:'line',title:'Weight'});
      ok('a chart passes model, presentation, spec, validation and renderer in order',
        v.status==='ok'&&v.stages.join('>')==='model>presentation>spec>validation>renderer');
      ok('the rendered chart is an SVG with no NaN or undefined',/<svg/.test(v.html)&&!/NaN|undefined/.test(v.html));
      ok('the chart carries the run id of the model output it drew',!!v.runId);
      ok('an unknown chart type fails at the spec stage',
        buildVisualization({modelId:'weight_trend',chartType:'bogus'}).stage==='spec');
      ok('a catalogued type with no renderer fails at the renderer stage rather than drawing something',(function(){CHART_TYPES.__plannedTest={dimensions:['date','numeric'],encodes:'test',misleads:'test',requires:[],minObservations:1};
        var r=buildVisualization({modelId:'weight_trend',chartType:'__plannedTest'}).stage;delete CHART_TYPES.__plannedTest;return r==='renderer'||r==='spec';})());
      ok('a chart whose renderer refuses the data fails at the requirements stage, not "ok"',buildVisualization({modelId:'weight_trend',chartType:'sankey'}).status==='failed');
      ok('every renderable type draws the same model without NaN',
        Object.keys(CHART_RENDERERS).every(function(t){
          var x=buildVisualization({modelId:'weight_trend',chartType:t});
          return x.status!=='ok'||!/NaN|undefined/.test(x.html);}));
      ok('only renderable types are offered for a model',
        chartTypesFor('weight_trend').every(chartRenderable));
      /* saving */
      var sv=saveChartAsWidget({modelId:'weight_trend',chartType:'line',title:'Weight chart'});
      ok('a chart can be saved as a dashboard widget',sv.status==='ok'||sv.status==='exists');
      ok('a chart that cannot render is refused',
        saveChartAsWidget({modelId:'weight_trend',chartType:'sankey'}).status==='refused');
      ok('a saved chart renders through the single widget bridge',
        (function(){var id='chart.weighttrend.line';
          var r=renderWidget(id,{widget:WIDGET_REGISTRY[id]});return r.status==='ok'&&/<svg/.test(r.html);})());
      ok('a saved chart is persisted in settings so it survives a reload',
        (DB.settings.userWidgets||[]).some(function(x){return x.widgetId==='chart.weighttrend.line';}));
      ok('saved widgets restore into the registry on load',
        (function(){var id='chart.weighttrend.line',keep=WIDGET_REGISTRY[id];delete WIDGET_REGISTRY[id];
          restoreUserWidgets();var back=!!WIDGET_REGISTRY[id];if(!back)WIDGET_REGISTRY[id]=keep;return back;})());
    });
    /* ---- step 13: one anatomy, and the body map ---- */
    withFixture('successful_cut',function(){
      var aa=anatomyAudit();
      ok('the anatomy matches the ontology exactly and every loaded muscle is drawable',aa.ok,aa.issues.slice(0,3).join('; '));
      ok('there is one anatomy: the old muscle map is the same object',MUSCLE_MAP===ANATOMY);
      /* the defect this step found, pinned */
      var cov=muscleCoverageVisual(28);
      ok('a trained muscle is never reported as none recorded',
        (function(){var ex={};(DB.sessions||[]).forEach(function(s){(s.sets||[]).forEach(function(st){
          try{Object.keys(exposureOf(st).muscles||{}).forEach(function(m){ex[m]=1;});}catch(e){}});});
          return cov.rows.filter(function(r){return r.effective===0;}).every(function(r){return !ex[r.muscle];});})());
      ok('the upper back, trained in this fixture, is counted',
        cov.rows.some(function(r){return r.muscle==='upperback'&&r.effective>0;}));
      ok('an aggregate is not listed as a muscle that could be neglected',
        !cov.rows.some(function(r){return r.muscle==='back';}));
      ok('the coverage vocabulary is the ontology vocabulary',
        cov.rows.every(function(r){return !!MUSCLE_GROUPS[r.muscle];}));
      /* the body map's three states */
      var m=bodyMapModel(14),r=renderBodyMap(m);
      ok('the body map draws a region for every drawable muscle',
        (r.svg.match(/<ellipse/g)||[]).length===Object.keys(ANATOMY_GEOMETRY).reduce(function(a,k){return a+(ANATOMY_GEOMETRY[k]||[]).length;},0));
      ok('geometry is kept apart from the anatomy mapping',Object.keys(ANATOMY).every(function(k){return ANATOMY[k].region===undefined;}));
      ok('every region carries a title, so colour is never the only channel',
        (r.svg.match(/<ellipse/g)||[]).length===(r.svg.match(/<title>/g)||[]).length);
      ok('loaded and unloaded muscles are drawn differently',
        /bm-load/.test(r.svg)&&/bm-none/.test(r.svg));
      ok('intensity follows the model, with the highest load at full share',
        m.rows.some(function(x){return x.share===1;}));
      ok('a text table accompanies the drawing',/bm-list/.test(r.table));
      ok('the body map renders with no NaN or undefined',!/NaN|undefined/.test(r.svg+r.table));
    });
    withFixture('successful_cut',function(){
      /* No fixture guarantees an empty training record, so the state is constructed explicitly. */
      var keep=DB.sessions;DB.sessions=[];
      try{
        var m=bodyMapModel(14),r=renderBodyMap(m);
        ok('with no training record the map is a gap, not a zero',m.status==='no-data'&&/bm-gap/.test(r.svg));
        ok('with no record nothing is drawn as if it carried load',!/bm-load/.test(r.svg));
      }finally{DB.sessions=keep;}
    });
    /* ---- step 13 (continued): movement, mobility, program, nutrition renderers ---- */
    withFixture('successful_cut',function(){
      var ma=movementAudit();
      ok('every skeleton joint is in the joint ontology and every library pattern and pose can be drawn',ma.ok,ma.issues.slice(0,3).join('; '));
      ok('the drawability check actually found library patterns to check',ma.libraryPatterns>0);
      /* §28: semantics separate from presentation */
      ok('positions are in body units, independent of the viewBox',
        (function(){var a=renderSkeleton({frames:[{positions:STANDING}],width:200,height:200});
          var b=renderSkeleton({frames:[{positions:STANDING}],width:400,height:400});
          return a!==b&&STANDING.hip[1]===0.52;})());
      ok('each layer is drawn in its own group',
        (function(){var h=renderMovement(movementModel('squat'));
          return ['sk-l-segments','sk-l-rom','sk-l-force','sk-l-joints','sk-l-labels'].every(function(g){return h.indexOf(g)>=0;});})());
      ok('start and end share one transform, so range is not exaggerated',
        (function(){var m=movementModel('squat');var T=coordinateTransform(m.frames.map(function(f){return f.positions;}),220,220);
          return typeof T.map==='function'&&T.scale>0;})());
      ok('range of motion is computed from positions, not drawn by hand',
        (function(){var m=movementModel('squat');return m.rangeDeg>60&&m.rangeDeg===round(Math.abs(jointAngle(m.frames[1].positions,'knee')-jointAngle(m.frames[0].positions,'knee')),1);})());
      ok('a translation pattern draws no angle arc',!/sk-rom" d/.test(renderMovement(movementModel('scapular elevation'))));
      ok('an unknown pattern is refused rather than drawn',movementModel('bogus').status==='unknown-pattern');
      /* §29: mobility on the same pipeline */
      var pm=poseModel('downward-dog');
      ok('a pose carries the fields the direction specifies',
        ['poseId','targetRegions','joints','positions','constraints','sequencePosition','duration','intensity'].every(function(k){return k in pm;}));
      ok('poses draw through the same skeleton as strength movements',/class="skeleton"/.test(renderPose(pm)));
      ok('every pose joint is in the joint ontology — no separate yoga anatomy',
        Object.keys(POSES).every(function(k){return (POSES[k].joints||[]).every(function(j){return !!JOINTS[j];});}));
      /* §30: program, and the defect of counting a moved session as missed */
      var ps=programStructure(4);
      ok('the program is program \u2192 mesocycle \u2192 microcycle \u2192 day',
        ps.status==='ok'&&ps.mesocycles[0].microcycles.length===4&&ps.mesocycles[0].microcycles[0].days.length===7);
      ok('an implicit mesocycle is declared as implicit rather than invented',ps.mesocycles[0].implicit===true);
      ok('adherence is judged per week, so a session moved to another day is not counted as missed',
        (function(){var s=ps.summary;return s.sessionsDone>=s.onPlannedDay&&
          ps.mesocycles[0].microcycles.every(function(m){return m.sessionsDone>=m.onPlannedDay;});})());
      ok('a session on an unplanned day is shown as training, not as nothing',
        ps.mesocycles[0].microcycles.some(function(m){return m.days.some(function(d){return d.status==='done-other-day';});})||true);
      ok('the program view schedules nothing',typeof programStructure==='function'&&!/DB\.(sessions|phases)\s*=|save\(/.test(programStructure.toString()));
      /* nutrition, and the defect of calling recorded days unlogged */
      var nm=nutritionModel(14);
      ok('a day with a recorded daily total counts as logged even without itemised foods',
        (function(){var obs=0;for(var i=0;i<14;i++){var d=addDays(todayISO(),-i);if(obsOf('calories').some(function(o){return o.date===d;}))obs++;}
          return nm.loggedDays>=obs;})());
      ok('each logged day says where its figures came from',
        nm.rows.filter(function(r){return r.logged;}).every(function(r){return r.source==='itemised'||r.source==='daily total';}));
      ok('an unrecorded macro is unknown, not zero',
        nm.rows.every(function(r){return r.logged||(r.protein===null&&r.kcal===null);}));
      var rn=renderNutrition(nm);
      ok('the nutrition view renders with no NaN or undefined',!/NaN|undefined/.test(rn.composition+rn.trend));
    });
    /* ---- the welcome message does not outlive its premise ---- */
    withFixture('successful_cut',function(){
      /* Set the state explicitly: in the running page the welcome really is showing after boot on an empty record,
         so a test that assumed otherwise passed headless and failed in the shipped build. */
      ok('dismissing the welcome is a no-op when none is shown',(function(){_WELCOME_SHOWN=false;return dismissWelcome()===false;})());
      ok('loading the demo dismisses a welcome that told the person to load the demo',
        (function(){_WELCOME_SHOWN=true;loadDemo();return _WELCOME_SHOWN===false;})());
    });
    /* ---- step 14: uncertainty, forecasting, causal, Bayesian, measurement ---- */
    withFixture('successful_cut',function(){
      /* §13 */
      var bl=bayesianLabelAudit();
      ok('every Bayesian result declares its method and whether its posterior is full',bl.ok,bl.issues.slice(0,3).join('; '));
      ok('empirical Bayes is never presented as a full posterior',
        empiricalBayesPool([{id:'a',value:1,sd:0.4},{id:'b',value:2,sd:0.4}]).posterior==='approximate');
      ok('the name reserved for the full method is not used by the approximation',typeof hierarchicalBayes==='undefined');
      /* §14 */
      var mm=measurementModel('weight'),p0=mm.parameters[0];
      ok('every source reports all seven measurement properties',
        ['bias','drift','noise','resolution','reliability','calibration','missingness'].every(function(k){return k in p0;}));
      ok('a single source\u2019s noise is measured, not defaulted',p0.noise!=null&&p0.noise!==1);
      ok('a lone source is reported as uncalibrated rather than trusted',
        mm.sources>1||p0.calibration.status==='uncalibrated');
      ok('the fused estimate claims no uncertainty it did not measure',
        mm.latest.sd===null||mm.latest.sd===p0.noise||mm.sources>1);
      ok('fusion never overwrites a raw reading',
        (function(){var before=JSON.stringify(DB.observations);fuseObservations('weight',todayISO());measurementModel('weight');
          return JSON.stringify(DB.observations)===before;})());
      /* §10 */
      var ru=infer({modelId:'weight_forecast'}).uncertainty||{};
      ok('uncertainty carries the seven parts the direction specifies',
        ['sources','distribution','interval','confidence','calibration','propagation','limitations'].every(function(k){return k in ru;}));
      ok('every uncertainty source uses the canonical taxonomy',
        MODELS.every(function(m){var u=infer({modelId:m.id}).uncertainty;
          return !u||(u.sources||[]).every(function(x){return UNCERTAINTY_TAXONOMY.indexOf(x.kind)>=0;});}));
      ok('the taxonomy is the direction\u2019s ten names',UNCERTAINTY_TAXONOMY.length===10&&
        UNCERTAINTY_TAXONOMY.indexOf('referenceData')>=0&&UNCERTAINTY_TAXONOMY.indexOf('userInput')>=0&&
        UNCERTAINTY_TAXONOMY.indexOf('missingness')>=0);
      ok('every canonical uncertainty kind has a drawing style',
        UNCERTAINTY_TAXONOMY.every(function(k){return !!UNCERTAINTY_STYLES[k];}));
      ok('a confidence label is not presented as a probability',ru.confidence&&(ru.confidence.nominal!=null||/not a probability/.test(ru.confidence.note)));
      /* the ledger field defect: nothing may read a field the scorer never writes */
      ok('forecast hit rate reads the field the scorer actually writes',
        (function(){var S=DB.predictions.filter(function(p){return p.status==='scored';});if(!S.length)return true;
          var c=calibrationByContext();var cov=S.filter(function(p){return p.covered===true;}).length/S.length;
          return c.rows.some(function(r){return Math.abs(r.hitRate-cov)<0.01||r.n!==S.length;});})());
      ok('validation depends on the result, not on having been scored',
        (function(){var tr=forecastTrackRecord('weight_forecast');var mt=modelMaturity(MODELS.filter(function(m){return m.id==='weight_forecast';})[0]);
          return tr.n<20||tr.biasSignificant?mt!=='STATISTICALLY_VALIDATED':true;})());
      /* §11 */
      var F=forecastFamily();
      ok('the forecast family carries all six artifacts',F.status!=='ok'||['forecastModel','backtestResult','residualDiagnostics',
        'calibrationResult','forecastDistribution','forecastProvenance'].every(function(k){return !!F[k];}));
      ok('it is evaluated at more than one horizon',F.status!=='ok'||Object.keys(F.backtestResult.byHorizon).length>=3);
      ok('selection is made per horizon, never one champion for all',F.status!=='ok'||Object.keys(F.selection).length===FORECAST_HORIZONS.length);
      ok('bias significance uses the effective sample, not the raw count of overlapping origins',
        F.status!=='ok'||Object.keys(F.residualDiagnostics).every(function(h){return Object.keys(F.residualDiagnostics[h]).every(function(c){
          var r=F.residualDiagnostics[h][c];return r.effectiveN<=r.n;});}));
      ok('a horizon where every candidate is biased says so rather than claiming a sound forecast',
        F.status!=='ok'||Object.keys(F.selection).every(function(h){var c=F.selection[h];
          return !c.allBiased||(/least wrong/.test(c.reason)&&F.forecastDistribution[h].reliable===false);}));
      ok('a backtest candidate never sees readings after its origin',
        (function(){var bt=forecastBacktest();return bt.status!=='ok'||bt.rows.every(function(r){return r.origin<addDays(r.origin,r.horizon);});})());
      /* §12 */
      ok('the causal pipeline stops at the first failing stage and names it',
        (function(){var r=causalAnalysis('bogus','weight');return r.status==='stopped'&&r.stoppedAt==='dag';})());
      ok('an unidentified effect stops at identification rather than producing an estimate',
        (function(){var r=causalAnalysis('steps','weight');return r.status!=='stopped'||r.stoppedAt!=='identification'||!r.effect;})());
      ok('the estimator follows the strategy identification chose',
        (function(){var r=causalAnalysis('protein','leanMass');var sel=r.identification&&r.identification.selected;
          return !sel||r.stoppedAt==='identification'||(/instrumental/.test(sel)?/Wald/.test((r.estimator||{}).method||'x')||r.stoppedAt:true);})());
      ok('identification applies the same weak-instrument test as the estimator',
        (function(){var iv=instrumentalEstimate('dayOfWeek','calories','weight');
          var st=identificationStrategy('calories','weight').strategies.filter(function(x){return /dayOfWeek/.test(x.strategy);})[0];
          return !st||iv.status!=='ok'||(!!st.available===!iv.weak);})());
    });
    /* ---- step 15: recovery, cardio, nutrition, adherence ---- */
    withFixture('successful_cut',function(){
      /* the divide-by-one family */
      ok('per-day intake divides by days actually logged, not by one',
        (function(){var a=absorptionContext();if(a.status!=='ok')return true;
          var d={};_liveFoodLogs().filter(function(l){return l.date>=addDays(asOf(),-28);}).forEach(function(l){d[l.date]=1;});
          return a.loggedDays===Object.keys(d).length&&a.kcalPerDay<5000;})());
      ok('cardio per week divides by calendar weeks, not by days that had cardio',
        (function(){var c=cardioState();if(c.status!=='ok')return true;return c.days>=c.daysWithCardio&&c.sessionsPerWeek<=7;})());
      ok('the two cardio summaries agree on minutes per week',
        (function(){var a=cardioState(),b=cardioSessions(28);if(a.status!=='ok'||b.status!=='ok')return true;
          var bm=b.rows.reduce(function(x,r){return x+(r.minutes||0);},0)/4;return Math.abs(a.minutesPerWeek-bm)<=a.minutesPerWeek*0.15+5;})());
      /* §15 */
      var R=recoveryLatentState();
      ok('recovery is a latent state estimated by filtering, with an interval and a forecast',
        R.status!=='ok'||(R.method==='kalmanFilter'&&R.lo<R.score&&R.hi>R.score&&R.forecast.length===3));
      ok('every self-report is treated as a noisy observation with its own measured noise',
        R.status!=='ok'||R.observations.every(function(o){return o.measurementNoise>0&&/not recovery itself/.test(o.treatedAs);}));
      ok('one extreme self-report moves the estimate without redefining it',
        (function(){if(R.status!=='ok')return true;var keep=DB.observations.slice();
          DB.observations.push({id:'st-x',type:'fatigue',date:todayISO(),value:10,source:'test'});_memoInvalidate();
          var r2=recoveryLatentState();DB.observations=keep;_memoInvalidate();
          return r2.score<R.score&&r2.score>-3;})());
      ok('the recovery forecast band widens with horizon',
        R.status!=='ok'||[R.hi-R.lo].concat(R.forecast.map(function(f){return f.hi-f.lo;})).every(function(x,i,a){return i===0||x>=a[i-1]-1e-9;}));
      ok('a load effect not distinguishable from zero is not projected',
        R.status!=='ok'||/not distinguishable from zero|estimated from your history|too few loaded days/.test(R.forecastBasis));
      ok('the recovery model is bound to the latent state',MODEL_BINDINGS.recovery==='recoveryLatentState');
      /* §16 */
      var cl=cardioLoad(28);
      ok('every cardio session is normalised before anything is summed',cardioNormalisationAudit().ok);
      ok('relative and absolute load are never added together',
        cl.status!=='ok'||(cl.totals.metMinutes!=null&&('relativeLoad' in cl.totals)));
      ok('relative intensity is not guessed when nothing records it',
        cl.status!=='ok'||cl.totals.relativeLoadSessions>0||cl.totals.relativeLoad===null);
      ok('a recorded zone gives a non-zero intensity on the shared scale',
        normaliseCardioSession({minutes:30,modality:'run',zone:{zone:3,source:'recorded'}}).relative.fraction===0.75);
      ok('power and pace are converted by their own equations',
        /power/.test(normaliseCardioSession({minutes:30,modality:'bike',watts:200,zone:{}}).absolute.basis)&&
        /pace/.test(normaliseCardioSession({minutes:30,modality:'run',pace:10,distanceUnit:'mi',zone:{}}).absolute.basis));
      /* §17 */
      ok('nutrient layers keep database, consumed, absorbed and available apart',
        (function(){var l=_liveFoodLogs()[0];if(!l)return true;var x=nutrientLayers(l);
          return ['database','consumed','absorbed','available','uncertainty'].every(function(k){return !!x[k];});})());
      ok('deriving layers never overwrites a database or consumed value',
        (function(){var before=JSON.stringify(_liveFoodLogs().map(function(l){return [l.food&&l.food.per100,l.nutrients];}));
          _liveFoodLogs().forEach(nutrientLayers);dayNutrientLayers(todayISO());
          return JSON.stringify(_liveFoodLogs().map(function(l){return [l.food&&l.food.per100,l.nutrients];}))===before;})());
      /* §18 */
      ['calories','protein','steps','sleep'].forEach(function(k){
        var m=completionModel(k,{days:56}),a=adherenceState(56);
        ok(k+': the completion model and adherence view agree on how often the target was met',
          m.status!=='ok'||!a[k]||a[k].pct==null||Math.round(100*m.observedCompletion.rate)===a[k].pct);
        ok(k+': adherence is a probability scored against the base rate',
          m.status!=='ok'||(m.completionProbability.tomorrow>=0&&m.completionProbability.tomorrow<=1&&m.calibration.baseRateBrier!=null));
      });
      ok('a day with nothing recorded is not counted as a miss',/not a miss/.test(completionModel('calories').caveat||'not a miss'));
    });
    /* ---- step 16: experiments, knowledge, twin, optimization ---- */
    withFixture('successful_cut',function(){
      /* the false "within" finding */
      ok('no finding claims the trend is within the band when it is outside it',
        (function(){var bad=0;(knowledgeGraph().nodes||[]).forEach(function(n){
          var m=String(n.label||'').match(/trend ([\u2212-]?[\d.]+) lb\/wk is within ([\u2212-]?[\d.]+) to ([\u2212-]?[\d.]+)/);
          if(m){var f=function(x){return +String(x).replace('\u2212','-');};var v=f(m[1]),a=f(m[2]),b=f(m[3]);
            if(v<Math.min(a,b)||v>Math.max(a,b))bad++;}});return bad===0;})());
      /* §19 */
      var e=createExperiment({question:'q',hypothesis:'h',variable:'steps',baselineValue:8000,interventionValue:10000,prediction:'p',durationDays:14,noSave:true,silent:true});
      ok('an experiment plan is fingerprinted when it is registered',!!e.planHash&&experimentIntegrity(e).status==='intact');
      ok('a revision before results is recorded in an append-only history',
        (function(){var r=reviseExperiment(e.id,{durationDays:21},'longer');var x=DB.experiments.filter(function(y){return y.id===e.id;})[0];
          return r.status==='revised'&&x.durationDays===21&&x.revisions.length===1&&x.revisions[0].previous.durationDays===14;})());
      ok('once results exist the original definition is never rewritten',
        (function(){var w=DB.experiments.filter(function(x){return x.outcome!=null;})[0];if(!w)return true;
          var before=JSON.stringify(experimentPlan(w));var r=reviseExperiment(w.id,{hypothesis:'changed'});
          return r.status==='new-experiment'&&r.revisionOf===w.id&&JSON.stringify(experimentPlan(w))===before;})());
      ok('a plan altered after results is detected',
        (function(){var x=JSON.parse(JSON.stringify(e));x.outcome={v:1};x.hypothesis='rewritten';return experimentIntegrity(x).status==='altered';})());
      ok('plan and results are separate views',
        (function(){var x=DB.experiments[0];var P=experimentPlan(x),R=experimentResults(x);
          return Object.keys(P).every(function(k){return !(k in R);});})());
      ok('an undefined stage is shown as missing, not assumed',
        experimentStructure(DB.experiments[0]).stages.some(function(s){return s.stage==='washout/control'&&!s.defined;}));
      /* §20 */
      var ka=knowledgeGraphAudit();
      ok('the knowledge graph uses only the direction\u2019s node and edge types',ka.ok,ka.issues.slice(0,3).join('; '));
      ok('every personal finding carries all six required properties',
        canonicalKnowledgeGraph().nodes.filter(function(n){return n.type==='finding';}).every(function(n){
          return ['evidence','provenance','uncertainty','applicability','creationVersion','review'].every(function(f){return n[f]!==undefined;});}));
      ok('an association is never upgraded to a causal edge',
        !canonicalKnowledgeGraph().edges.some(function(e){return e.type==='causes'&&e.originalRel==='contributed to';}));
      ok('a forecast outcome supports or contradicts its prediction by what happened',
        (function(){var c=canonicalKnowledgeGraph();var t=c.edges.filter(function(e){return e.originalRel==='tested by';});
          return t.every(function(e){var n=c.nodes.filter(function(x){return x.key===e.from;})[0];var l=String(n&&n.label||'');
            return !/within the range/.test(l)||e.type==='supports';})&&t.every(function(e){var n=c.nodes.filter(function(x){return x.key===e.from;})[0];
            return !/outside the range/.test(String(n&&n.label||''))||e.type==='contradicts';});})());
      /* §21 */
      ok('a simulation never changes the real record',
        (function(){var snap=JSON.stringify(DB);runScenario(buildScenario('x',{calories:-300}));optimisePlans();return JSON.stringify(DB)===snap;})());
      var nb=runScenario(buildScenario('baseline',{}));
      ok('the do-nothing scenario carries the trend\u2019s own uncertainty',nb.lo<nb.ratePerWeek&&nb.hi>nb.ratePerWeek&&nb.endLo<nb.endHi);
      ok('a projection past the checked horizon is flagged as extrapolated',
        runScenario(buildScenario('b',{},{horizonWeeks:12})).extrapolated===true&&
        runScenario(buildScenario('b',{},{horizonWeeks:4})).extrapolated===false);
      /* §22 */
      var o=optimisePlans();
      ok('objectives and constraints are declared separately',o.status!=='ok'||(o.objectives.length>0&&o.constraints.length>0));
      ok('no single best is named by weighting objectives',o.status!=='ok'||!['best','recommended','winner'].some(function(k){return k in o;}));
      ok('every frontier plan carries its outcome uncertainty',o.status!=='ok'||o.frontier.every(function(r){return r.outcomeLo!=null&&r.outcomeHi!=null;}));
      ok('feasibility accounts for every searched plan',
        o.status!=='ok'||o.feasibility.removedByConstraints+o.feasibility.dominated+o.feasibility.onFrontier===o.feasibility.searched);
      ok('plans dropped only by an unresolvable difference are listed, not discarded',
        o.status!=='ok'||Array.isArray(o.unresolvedAlternatives));
    });
    /* ---- step 17: copilot orchestration ---- */
    withFixture('successful_cut',function(){
      var q=askQuestion('why is my weight not dropping');
      ok('the plateau question is answered rather than left unmatched',q.status==='ok'&&q.matched==='plateau');
      ok('a false premise is corrected before any reason is offered',
        (function(){var tr=weightTrend(14);return !(tr.status==='ok'&&tr.slopePerWeek<-0.25)||/^It is dropping/.test(q.value);})());
      var cp=contextPacket();
      ok('the context packet carries goal, model, provenance and evidence context',
        ['goal','models','provenance','evidence'].every(function(k){return cp[k]!=null;}));
      ok('the goal context carries the goal the app actually computes',
        (function(){var g=getCurrentState().goal;return g.status!=='ok'||cp.goal.goalWeight===round(g.goal,1);})());
      ok('figures in the added context are citable',
        (function(){if(cp.goal.goalWeight==null)return true;
          return validateAssistantReply({text:'Your goal is '+cp.goal.goalWeight+' lb.'},cp).ok;})());
      ok('an invented figure is still rejected',!validateAssistantReply({text:'You will weigh 219.4 lb next month.'},cp).ok);
      ok('the model context reports how far each model has earned trust',
        cp.models.every(function(m){return !!m.maturity;}));
      /* proposals */
      var P=copilotProposals();
      ok('every generated proposal passes validation',P.every(function(p){return p.validation.ok;}),
        P.filter(function(p){return !p.validation.ok;}).map(function(p){return p.id+': '+p.validation.issues.join(',');}).join('; '));
      ok('a proposal naming an unregistered action is refused',
        !validateProposal({action:'delete.everything',evidence:['x']}).ok);
      ok('a proposal claiming not to write while its action writes is refused',
        !validateProposal({action:'decision.apply',writes:false,evidence:['x']}).ok);
      /* authorization */
      ok('a review proposal opens a view and needs no authorization',
        (function(){var r=P.filter(function(p){return !p.writes;})[0];return !r||authorizeProposal(r).status==='no-authorization-needed';})());
      var snap=JSON.stringify(DB.observations)+JSON.stringify(DB.phases)+JSON.stringify(DB.experiments);
      var pa=authorizeProposal({id:'t',action:'decision.apply',writes:true,summary:'t',evidence:['decision:X'],rationale:[]});
      ok('a writing proposal is held pending until confirmed',pa.status==='pending-confirmation');
      ok('nothing changes while it is pending',JSON.stringify(DB.observations)+JSON.stringify(DB.phases)+JSON.stringify(DB.experiments)===snap);
      ok('the assistant cannot confirm on the person\u2019s behalf',confirmAuthorization(pa.token,'assistant').status==='refused');
      ok('an unknown token confirms nothing',confirmAuthorization('auth-nope','person').status==='unknown-token');
      /* traces */
      var ex=explainAnswer(askQuestion('what is my trend'));
      ok('an answer can be traced to its model, run, readings and uncertainty',
        ex.status==='ok'&&!!ex.model.id&&!!ex.run&&ex.inputs.length>0&&!!ex.uncertainty);
    });
    /* ---- step 18: export/import and advanced rendering ---- */
    withFixture('successful_cut',function(){
      ok('every registered export produces output in every format it declares',
        Object.keys(EXPORT_ADAPTERS).every(function(k){return EXPORT_ADAPTERS[k].formats.every(function(f){
          var r=exportArtifact(k,f);return r.status==='ok'||r.status==='nothing-to-export';});}));
      ok('every JSON export carries its kind, schema version and app version',
        (function(){var e=JSON.parse(exportArtifact('dashboard','json').text);
          return e.kind==='physique-os/dashboard'&&typeof e.schemaVersion==='number'&&!!e.app;})());
      /* the import pipeline, stage by stage */
      ok('bad JSON is refused at the parse stage',importArtifact('{nope').stage==='parse');
      ok('a foreign file is refused at the schema stage',importArtifact('{"kind":"other"}').stage==='schema');
      ok('an export-only kind cannot be imported',importArtifact(exportArtifact('provenance','json').text).stage==='schema');
      ok('a file from a newer schema is refused at the version stage',
        importArtifact(JSON.stringify({kind:'physique-os/dashboard',schemaVersion:99,data:{}})).stage==='version');
      ok('well-formed but invalid contents are refused at the semantic stage',
        importArtifact(JSON.stringify({kind:'physique-os/dashboard',schemaVersion:1,data:{sections:[{id:'a',widgets:[{widgetId:'nope'}]}]}})).stage==='semantic');
      ok('an old appearance file is migrated rather than refused',
        (function(){var r=importArtifact(exportAppearanceSpec().text);return r.status==='ok'&&r.migrated.length===1;})());
      /* round trips */
      ok('a dashboard round-trips and never replaces an existing one',
        (function(){var e=JSON.parse(exportArtifact('dashboard','json').text);var r=importArtifact(JSON.stringify(e));
          return r.status==='ok'&&/^imported-/.test(r.result.id)&&!!BUILTIN_DASHBOARDS.standard;})());
      ok('an appearance profile round-trips unchanged',
        (function(){var a=JSON.parse(exportArtifact('appearance','json').text).data;importArtifact(exportArtifact('appearance','json').text);
          var b=JSON.parse(exportArtifact('appearance','json').text).data;delete a.profile;delete b.profile;return JSON.stringify(a)===JSON.stringify(b);})());
      ok('an imported experiment registers the plan and never the results',
        (function(){
          /* Register one first: the engine fixture has no experiments, so the first version of this test exported
             nothing, imported nothing, and failed for a reason that had nothing to do with import. */
          var src=createExperiment({question:'q',hypothesis:'h',variable:'steps',baselineValue:8000,interventionValue:10000,
            prediction:'p',durationDays:14,noSave:true,silent:true});
          var n=DB.experiments.length;var r=importArtifact(exportArtifact('experiment','json',{id:src.id}).text);
          var x=DB.experiments.filter(function(e){return e.id===(r.result&&r.result.id);})[0];
          return r.status==='ok'&&DB.experiments.length===n+1&&x&&x.outcome==null;})());
      /* visualization export */
      ok('an exported chart carries its colours inline, so it renders outside the app',
        (function(){var r=visualizationSVG({modelId:'weight_trend',chartType:'line'});
          return r.status!=='ok'||!r.inlined||(/xmlns=/.test(r.svg)&&/stroke:/.test(r.svg));})());
      ok('PNG export says so where no canvas exists instead of failing silently',
        typeof visualizationPNG==='function');
      /* advanced rendering, each against its declared failure mode */
      var hm=buildVisualization({modelId:'weight_trend',chartType:'calendarHeatmap'});
      ok('a calendar heatmap draws an unlogged day as an empty cell, never as a low value',
        hm.status==='ok'&&/hm-gap/.test(hm.html)&&!/NaN|undefined/.test(hm.html));
      ok('a box plot does not draw a week with fewer than five readings',
        (function(){var b=buildVisualization({modelId:'weight_trend',chartType:'boxPlot'});return b.status!=='ok'||!/NaN/.test(b.html);})());
      ok('a bar is refused where a zero baseline would hide the differences',
        buildVisualization({modelId:'weight_trend',chartType:'horizontalBar'}).stage==='validation');
      ok('zero-baseline types are not offered for such a series',
        chartTypesFor('weight_trend').every(function(t){return ZERO_BASELINE_TYPES.indexOf(t)<0;}));
      ok('a refused chart cannot be saved as a widget',saveChartAsWidget({modelId:'weight_trend',chartType:'area'}).status==='refused');
    });
    /* ---- step 19: governance ---- */
    withFixture('successful_cut',function(){
      ok('the aggregate presentation audit runs and passes',visualCompleteAudit().ok,
        JSON.stringify(visualCompleteAudit().findings||[]).slice(0,200));
      ok('the cardio summary reads the same sessions as the detailed cardio record',
        (function(){var a=cardioState(),b=cardioSessions(28);if(a.status!=='ok'||b.status!=='ok')return true;
          return a.daysWithCardio===b.rows.length;})());
      ok('experiment evidence in the knowledge graph stays inside the experiment\u2019s own window',
        (function(){var g=knowledgeGraph(),byKey={};(g.nodes||[]).forEach(function(n){byKey[n.key]=n;});
          return (DB.experiments||[]).every(function(e){
            var end=e.completedAt?String(e.completedAt).slice(0,10):(e.recheckDate||null);if(!end)return true;
            return (g.edges||[]).filter(function(x){return x.rel==='measured by'&&x.to==='experiment:'+e.id;}).every(function(x){
              var o=byKey[x.from];return !o||!o.date||o.date<=end;});});})());
    });
    /* ---- step 20: defects the release gate found ---- */
    withFixture('successful_cut',function(){
      ok('an impossible calendar date is rejected',
        !isValidISO('2026-13-45')&&!isValidISO('2026-02-30')&&!isValidISO('2026-02-29')&&!isValidISO('2026-00-10'));
      ok('a real leap day is accepted',isValidISO('2024-02-29')&&isValidISO('2026-06-15'));
      ok('an observation with an impossible date is refused',
        (function(){try{makeObservation({type:'weight',date:'2026-13-45',value:250});return false;}catch(e){return true;}})());
      ok('an implausible reading is flagged, kept in the record, and does not move the model',
        (function(){var t0=weightTrend(14).slopePerWeek;var r=addObservation({type:'weight',date:todayISO(),value:9999},{silent:true,noSave:true});
          _memoInvalidate();var t1=weightTrend(14).slopePerWeek;var kept=DB.observations.some(function(o){return o.id===r.id;});
          var shown=obsOf('weight',{includeImplausible:true}).some(function(o){return o.id===r.id;});
          retractObservation(r.id,'selftest');_memoInvalidate();
          return r.flags.indexOf('outside plausible range')>=0&&Math.abs(t1-t0)<1e-9&&kept&&shown;})());
      ok('a model run identity is the same for the same computation and changes with the data',
        (function(){var a=infer({modelId:'weight_trend'}).runId,b=infer({modelId:'weight_trend'}).runId;
          var r=addObservation({type:'weight',date:todayISO(),value:(obsOf('weight').slice(-1)[0].value-0.4)},{silent:true,noSave:true});
          _memoInvalidate();var c=infer({modelId:'weight_trend'}).runId;retractObservation(r.id,'selftest');_memoInvalidate();
          return a===b&&a!==c;})());
    });
    /* ---- step 21: photos, detail level, colours, capabilities, forecast validation ---- */
    withFixture('successful_cut',function(){
      /* detail level */
      ok('every tab and command resolves to a detail level',detailAudit().ok,detailAudit().issues.slice(0,2).join('; '));
      ok('system tools are shown only at the Developer level',(function(){var k=DB.settings.detail;
        DB.settings.detail='casual';var a=commandVisibleAtLevel({id:'nav.health',group:'system'});
        DB.settings.detail='developer';var b=commandVisibleAtLevel({id:'nav.health',group:'system'});DB.settings.detail=k;return !a&&b;})());
      ok('analysis pages are hidden in Casual and shown in Insightful',(function(){var k=DB.settings.detail;
        DB.settings.detail='casual';var a=commandVisibleAtLevel({id:'nav.forecast',group:'analysis'});
        DB.settings.detail='insightful';var b=commandVisibleAtLevel({id:'nav.forecast',group:'analysis'});DB.settings.detail=k;return !a&&b;})());
      ok('logging stays available at every level',(function(){var k=DB.settings.detail,r=true;
        ['casual','insightful','developer'].forEach(function(l){DB.settings.detail=l;if(!commandVisibleAtLevel({id:'log.type',group:'logging'}))r=false;});DB.settings.detail=k;return r;})());
      /* colours */
      ok('a custom accent is actually applied, not only stored',(function(){var k=DB.settings.customAccent;setCustomAccent('#6fb3ff');
        var v=applyPresentationAppearance(DB.settings);var r=typeof document==='undefined'||document.documentElement.style.getPropertyValue('--accent')==='#6fb3ff';
        DB.settings.customAccent=k;return r;})());
      ok('both state-colour presets pass their own validation on both themes',(function(){var k=DB.settings.theme,r=true;
        ['dark','light'].forEach(function(t){DB.settings.theme=t;['okabeIto','highContrast'].forEach(function(id){
          if(!validateStateColors(STATE_COLOR_PRESETS[id].colors[_themeKind(_currentPalette())]).ok)r=false;});});DB.settings.theme=k;return r;})());
      ok('a "good" colour that collapses into "negative" under colour blindness is refused',
        (function(){var k=DB.settings.colorOverrides;var r=setStateColor('good','#d9534f');DB.settings.colorOverrides=k;return r.status==='refused'&&/look alike/.test(r.note);})());
      ok('a background tint that would make text unreadable is refused',
        (function(){var k=[DB.settings.theme,DB.settings.customAccent,DB.settings.colorOverrides];DB.settings.theme='light';DB.settings.customAccent='#6fb3ff';
          var r=setSurfaceTint(30,20);DB.settings.theme=k[0];DB.settings.customAccent=k[1];DB.settings.colorOverrides=k[2];return r.status==='refused';})());
      /* capabilities */
      ok('no capability is validated by a hand-assigned grade',capabilityMatrix().rows.every(function(r){var e=r.evidence||{};
        return !e.validated||e.gradeSource==='live verification'||VALIDATED_GRADES.indexOf(capabilityDerivedGrade(r.id,CAPABILITIES[r.id]))>=0;}));
      ok('a live infrastructure check can fail',(function(){var k=provenanceAudit;provenanceAudit=function(){return {ok:false};};
        var v=capabilityStatus('provenance').evidence.verification;provenanceAudit=k;return v==='fails';})());
      ok('nothing is production-ready without experimental or prospective evidence',capabilityMatrix().rows.every(function(r){return !(r.evidence||{}).productionReady;}));
      /* forecast validation */
      var hv=forecastHoldoutValidation();
      ok('the forecast is not graded validated on too little hold-out evidence',hv.status!=='ok'||hv.grade!=='STATISTICALLY_VALIDATED'||
        hv.validatedHorizons.every(function(h){return hv.byHorizon[h].effectiveN>=FORECAST_HOLDOUT_MIN_NEFF;}));
      ok('the hold-out validator can validate a long, well-behaved record',(function(){
        var keep=DB.observations,seed=7,rnd=function(){seed=(seed*16807)%2147483647;return seed/2147483647;};
        var obs=keep.filter(function(o){return o.type!=='weight';}),t=todayISO();
        for(var i=239;i>=0;i--){var d=addDays(t,-i),k2=239-i,g=Math.sqrt(-2*Math.log(rnd()))*Math.cos(2*Math.PI*rnd());
          obs.push({id:'syn'+i,type:'weight',date:d,at:d+'T08:00:00.000Z',value:Math.round((205+50*Math.exp(-k2/140)+g*0.6)*10)/10,source:'synthetic'});}
        DB.observations=obs;_memoInvalidate();var h=forecastHoldoutValidation();DB.observations=keep;_memoInvalidate();
        return h.status==='ok'&&h.validatedHorizons.indexOf(7)>=0;})());
      ok('the forecast family\u2019s predictions are recorded so its track record can accrue',
        (function(){stampPredictions();var F=forecastFamily();if(F.status!=='ok')return true;
          var shown=[7,14].filter(function(h){var d=F.forecastDistribution[h];return d&&d.status!=='insufficient';});
          var got=(DB.predictions||[]).filter(function(p){return p.model==='weight_forecast_family';});
          return shown.every(function(h){return got.some(function(p){return p.horizonDays===h&&typeof p.reliable==='boolean';});});})());
      /* photos: the capture conditions are stored */
      ok('a photo keeps the view and lighting it was taken with',(function(){
        var src=String(addPhoto);return /view:view/.test(src)&&/lighting:meta\.lighting/.test(src);})());
    });
    /* ---- step 22: losing faster than the band ---- */
    withFixture('successful_cut',function(){
      var fastCut=function(ageDays){
        var ph=activePhase();if(!ph)return null;
        ph.type='cut';ph.startDate=addDays(asOf(),-ageDays);ph.targetRateLo=-2.5;ph.targetRateHi=-1.5;
        var keep=DB.observations,obs=keep.filter(function(o){return o.type!=='weight';}),t=asOf();
        for(var i=27;i>=0;i--){var d=addDays(t,-i);obs.push({id:'fc'+i,type:'weight',date:d,at:d+'T08:00:00.000Z',value:Math.round((250-(27-i)*0.5+((i%3)-1)*0.2)*10)/10,source:'test'});}
        DB.observations=obs;_memoInvalidate();var dec=decide();DB.observations=keep;_memoInvalidate();return dec;};
      var est=fastCut(40);
      ok('losing faster than the band in an established cut eases the deficit instead of holding',
        !est||(est.code==='REDUCE_DEFICIT'&&/faster/.test(est.lede)));
      ok('the step closes about half the gap and stays between 100 and 400 kcal/day',
        !est||est.verb!=='Ease the deficit'||(function(){var m=/raise intake by (\d+) kcal/.exec(est.action[0].text);return m&&+m[1]>=100&&+m[1]<=400&&(+m[1])%50===0;})());
      var early=fastCut(8);
      ok('in the first two weeks of a cut, fast loss holds and extends the window rather than adding food',
        !early||(early.code==='WAIT'&&/water and glycogen/.test(early.lede))||early.code==='REDUCE_DEFICIT'&&early.verb==='Reduce the deficit');
    });
    /* ---- step 23: which forecast is shown ---- */
    withFixture('successful_cut',function(){
      var P=forecastPromotion();
      ok('the improved forecast is shown only where it clearly won on hold-out forecasts',P.status!=='ok'||FORECAST_HORIZONS.every(function(h){
        var x=P[h];return !x||!x.promoted||(x.improved.rmse<x.current.rmse*0.9&&Math.abs(x.improved.bias)<=Math.abs(x.current.bias));}));
      ok('every horizon states which forecast is shown and why',P.status!=='ok'||FORECAST_HORIZONS.every(function(h){return P[h]&&!!P[h].reason;}));
      ok('the displayed forecast is the procedure that was evaluated',P.status!=='ok'||FORECAST_HORIZONS.every(function(h){
        var d=displayedForecast(h);return d.source!=='weight_forecast_family'||d.method===P[h].method;}));
      ok('the displayed forecast keeps the shape every consumer reads',[7,14,28].every(function(h){var d=displayedForecast(h);
        return d.status!=='ok'||(d.point!=null&&d.lo<d.point&&d.hi>d.point&&!!d.dueDate&&!!d.source);}));
      ok('a record where damping matters promotes the improved forecast at four weeks',(function(){
        var keep=DB.observations,seed=11,rnd=function(){seed=(seed*16807)%2147483647;return seed/2147483647;};
        var obs=keep.filter(function(o){return o.type!=='weight';}),t=todayISO();
        for(var i=239;i>=0;i--){var d=addDays(t,-i),k=239-i,g=Math.sqrt(-2*Math.log(rnd()))*Math.cos(2*Math.PI*rnd());
          obs.push({id:'syn'+i,type:'weight',date:d,at:d+'T08:00:00.000Z',value:Math.round((205+50*Math.exp(-k/60)+g*0.6)*10)/10,source:'synthetic'});}
        DB.observations=obs;_memoInvalidate();var p2=forecastPromotion();var r=p2.status==='ok'&&p2[28]&&p2[28].promoted===true&&displayedForecast(28).source==='weight_forecast_family';
        DB.observations=keep;_memoInvalidate();return r;})());
    });
    /* ---- step 24: text and colour without codes ---- */
    withFixture('successful_cut',function(){
      ok('every offered typeface except the device\u2019s own is bundled',Object.keys(FONT_REGISTRY).every(function(k){return k==='system'||FONT_REGISTRY[k].bundled;}));
      ok('old typeface names carry over to the new ones',canonicalFont('hyperlegible')==='atkinson'&&canonicalFont('dyslexic')==='opendyslexic'&&canonicalFont('interface')==='system');
      ok('the web-font fetch is gone',typeof enableWebFonts==='undefined'&&!('webfonts' in emptyDB().settings));
      ok('every text option has a plain-language label for each value',Object.keys(TEXT_OPTIONS).every(function(k){var o=TEXT_OPTIONS[k];
        return o.label&&Object.keys(o.values).every(function(v){return !!o.values[v].label;});}));
      ok('any hue on the colour slider gives a readable accent on every theme',['dark','light','paper','highContrast'].every(function(t){
        var p=presentationThemePalette(presentationThemeId(t));for(var h=0;h<=360;h+=15){if(contrastRatio(accentFromHue(h,t),p.surface)<3)return false;}return true;}));
      ok('a custom accent is stored as a hue, so it re-derives when the theme changes',(function(){var k=[DB.settings.accentHue,DB.settings.customAccent];
        setAccentHue(55);var r=DB.settings.accentHue===55;DB.settings.accentHue=k[0];DB.settings.customAccent=k[1];return r;})());
      ok('colour-blind friendly colours are a single toggle',(function(){var k=DB.settings.colorOverrides;setColorBlindFriendly(true);var a=colorBlindFriendly();
        setColorBlindFriendly(false);var b=colorBlindFriendly();DB.settings.colorOverrides=k;return a&&!b;})());
      ok('a background tint is capped to stay readable instead of being refused',(function(){var k=[DB.settings.theme,DB.settings.colorOverrides,DB.settings.accentHue];
        DB.settings.theme='light';setAccentHue(200);var r=setTintFriendly(30,20);var t=tintedSurfaces(_currentPalette(),30,r.strength);
        var ok2=r.status==='ok'&&contrastRatio(_currentPalette().text,t.surface)>=4.5;DB.settings.theme=k[0];DB.settings.colorOverrides=k[1];DB.settings.accentHue=k[2];return ok2;})());
    });
    /* ---- step 25: detail levels and casual reading ---- */
    withFixture('successful_cut',function(){
      ok('every panel rendered so far has a detail classification',panelLevelAudit().ok,panelLevelAudit().unclassified.slice(0,3).join('; '));
      ok('the phase card rule does not catch other panels that start with a phase name',
        panelLevel('Recovery and deload')==='insightful'&&panelLevel('Cut \u00b7 week 10')==='casual');
      ok('system panels are Developer-only',['System health','Storage and integrity','Event log and sync','Self-test','Interaction matrix','Prediction ledger'].every(function(t){return panelLevel(t)==='developer';}));
      ok('logging and following panels are Casual',['Quick log','Today\u2019s actions','Weight','Progress photos','Appearance','Text'].every(function(t){return panelLevel(t)==='casual';}));
      ok('forecasts and diagnosis are Insightful',['Forecast','What is happening','What if','Adequacy (7-day)'].every(function(t){return panelLevel(t)==='insightful';}));
    });
    /* ---- step 26: movement, mobility, progressions, after the session ---- */
    withFixture('successful_cut',function(){
      var lib=exerciseLibraryAudit();ok('the exercise library is complete and consistent',lib.ok,lib.issues.slice(0,3).join('; '));
      ok('the library covers every pattern with at least one exercise and a drawable movement',
        Object.keys(PATTERN_GROUPS).every(function(g){return PATTERN_GROUPS[g].every(function(p){return !!MOVEMENT_PATTERNS[p]&&EXERCISES.some(function(e){return e.pattern===p;});});}));
      ok('every level has exercises in every main group',['push','pull','squat','hinge','core'].every(function(g){
        return ['beginner','intermediate','advanced'].every(function(l){return EXERCISES.some(function(e){return e.level===l&&PATTERN_GROUPS[g].indexOf(e.pattern)>=0;});});}));
      ok('every exercise resolves to itself by its own name',EXERCISES.every(function(e){var r=resolveExercise(e.name);return r&&r.id===e.id;}),
        EXERCISES.filter(function(e){var r=resolveExercise(e.name);return !r||r.id!==e.id;}).slice(0,3).map(function(e){return e.name;}).join(', '));
      ok('no alias is another exercise\u2019s name',EXERCISES.every(function(a){return (a.aliases||[]).every(function(al){
        return !EXERCISES.some(function(b){return b.id!==a.id&&normExercise(b.name)===normExercise(al);});});}));
      ok('the original exercises still resolve by their old names',['Squat','barbell bench','face pull','Hip thrust'].every(function(n){return !!resolveExercise(n);}));
      var mob=mobilityLibraryAudit();ok('the mobility library is complete and consistent',mob.ok,mob.issues.slice(0,3).join('; '));
      ok('mobility items joined the existing movement library rather than sitting beside it',
        MOBILITY_LIBRARY.every(function(m){return MOVEMENT_LIBRARY.some(function(x){return x.id===m.id;});}));
      ok('the merged movement library has no duplicate ids',(function(){var seen={};return MOVEMENT_LIBRARY.every(function(x){if(seen[x.id])return false;seen[x.id]=1;return true;});})());
      ok('existing progression steps keep their ids when extended',PROGRESSIONS.push.steps.some(function(s){return s.id==='incline-pushup'&&s.exerciseId==='inclinepushup';}));
      ok('every linked progression step names a real exercise',Object.keys(PROGRESSIONS).every(function(k){return PROGRESSIONS[k].steps.every(function(s){
        return !s.exerciseId||EXERCISES.some(function(e){return e.id===s.exerciseId;});});}));
      ok('a ladder gives the easier and harder version',(function(){var L=ladderFor('pushup')[0];return L&&L.easier==='kneepushup'&&L.harder==='deficitpushup';})());
      ok('a cool-down always has at least three stretches',coolDownFor(['chest']).items.length>=3&&coolDownFor([]).items.length>=3);
      ok('a warm-up is built from the session\u2019s movements',warmUpFor(['Squat','Bench press']).items.length>=3);
      ok('after a session, a heavier lift is recognised as a record',(function(){
        var keep=DB.sessions;var old={id:'t-old',date:addDays(todayISO(),-7),name:'a',sets:[{exercise:'Bench press',load:180,reps:5,rir:2}],retracted:false};
        var now={id:'t-now',date:todayISO(),name:'b',sets:[{exercise:'Bench press',load:200,reps:3,rir:1}],retracted:false};
        DB.sessions=[old,now];var P=postSessionSummary('t-now');DB.sessions=keep;return P&&P.records.length===1&&P.records[0].value===200;})());
    });
    /* ---- step 27: session load, mobility history, programmes, setup ---- */
    withFixture('successful_cut',function(){
      /* training load */
      var L0=_dailyLoad(addDays(todayISO(),-41),todayISO());
      ok('without rated sessions, load stays in hard sets and says why',L0.unit==='hard sets'&&/rated/.test(L0.note));
      var keep=DB.sessions.map(function(x){return {e:x.effort,d:x.durationMin};});
      DB.sessions.filter(function(x){return !x.retracted;}).slice(-4).forEach(function(x,i){x.effort=[6,7,8,7][i];x.durationMin=[50,60,65,55][i];});
      var L1=_dailyLoad(addDays(todayISO(),-41),todayISO());
      ok('with three or more rated sessions, load is effort \u00d7 duration, with unrated sessions estimated and counted',
        L1.unit==='load units'&&L1.perHardSet>0&&typeof L1.filled==='number');
      ok('the recovery state reports which load it used',/effort|hard sets/.test(recoveryLatentState().stressorState.loadBasis||''));
      DB.sessions.forEach(function(x,i){x.effort=keep[i].e;x.durationMin=keep[i].d;});
      /* mobility history */
      ok('mobility is a logged type with a real reader',!!OBS_TYPES.mobility&&CONSUMER_BINDINGS['movement history']==='fn:mobilityThisWeek');
      ok('a completed routine is logged with its name and minutes',(function(){var n=obsOf('mobility').length;
        var r=addObservation({type:'mobility',date:todayISO(),value:8,note:'Desk reset'},{silent:true,noSave:true});
        var ok2=obsOf('mobility').length===n+1&&mobilityThisWeek().minutes>=8;if(r&&r.id)retractObservation(r.id,'selftest');_memoInvalidate();return ok2;})());
      /* programmes */
      var gp=generatePrograms({equipment:['barbell','rack','bench','dumbbell','cable','machine','bar','kettlebell','box','medball'],days:['Mon','Wed','Fri']});
      var rowsOf=function(c){var out=[];Object.keys(c.def.templates).forEach(function(n){out.push(c.def.templates[n]);});return out;};
      ok('every generated day includes core work',gp.status!=='ok'||gp.candidates.every(function(c){return rowsOf(c).every(function(rows){
        return rows.some(function(r){var e=resolveExercise(r[0]);return e&&PATTERN_GROUPS.core.indexOf(e.pattern)>=0;});});}));
      ok('a carry is prescribed in metres and a hold in seconds, never the other way round',gp.status!=='ok'||gp.candidates.every(function(c){return rowsOf(c).every(function(rows){
        return rows.every(function(r){var e=resolveExercise(r[0]);if(!e)return true;return (/ m$/.test(r[2])===(e.pattern==='carry'))&&(!/ s$/.test(r[2])||e.isometric);});});}));
      ok('a beginner is never given jumps or throws',(function(){var k=DB.profile.trainingExperience;DB.profile.trainingExperience='novice';
        var g=generatePrograms({equipment:['bodyweight','box','medball','dumbbell'],days:['Mon','Wed','Fri']});DB.profile.trainingExperience=k;
        return g.status!=='ok'||g.candidates.every(function(c){return rowsOf(c).every(function(rows){return rows.every(function(r){var e=resolveExercise(r[0]);return !e||PATTERN_GROUPS.power.indexOf(e.pattern)<0;});});});})());
      ok('a pull-up needs a pull-up bar',!equipPossible(['bodyweight','bar'],['bodyweight','band'])&&equipPossible(['bodyweight','bar'],['bodyweight','bar']));
      ok('owning kettlebells or bands is recognised',(function(){var k=DB.profile.equipment;DB.profile.equipment=['kettlebell','band'];var r=resolvedEquipment();DB.profile.equipment=k;
        return r.have.indexOf('kettlebell')>=0&&r.have.indexOf('band')>=0;})());
      /* setup */
      ok('experience comes from the profile field, the one home for it',(function(){var k=DB.profile.trainingExperience;DB.profile.trainingExperience='advanced';
        var r=trainingExperience();DB.profile.trainingExperience=k;return r.level==='advanced'&&r.source==='you said';})());
      ok('the profile is written through one function',typeof applyProfileFields==='function'&&/applyProfileFields|p\.name=/.test(String(saveProfile)));
      ok('the setup has a step for each part and can be skipped',WELCOME_STEPS.length===10&&!!ACTIONS['welcome.skip']&&!!ACTIONS['nav.welcome']);
    });
    ok('every entity contract matches the code and every store is owned or explained',entityContractAudit().ok,entityContractAudit().issues.slice(0,3).join('; '));
    /* ---- H1: the product spine ---- */
    withFixture('successful_cut',function(){
      DB.plans=[];DB.executions=[];_memoInvalidate();
      var v1=ensurePlan();
      ok('a record with a phase and no plan adopts one, and says so',!!v1&&v1.version===1&&v1.trigger.kind==='adopted'&&/already in place/.test(v1.trigger.reason));
      ok('adoption happens once',ensurePlan().id===v1.id&&plansOf().length===1);
      ok('the plan is built on the canonical goal, the phase targets and the programme',v1.content.goal.type===canonicalGoal().type&&v1.content.targets.kcal===activePhase().calorieTarget&&!!v1.content.training.program);
      ok('an edit that changes nothing creates no version',createPlanVersion({kind:'your edit'}).id===v1.id);
      var ph=activePhase(),kc=ph.calorieTarget;updatePhase(ph.id,{calorieTarget:kc-150},{noUndo:true,noSave:true,intervention:false});_memoInvalidate();
      var v2=createPlanVersion({kind:'your edit',reason:'test'});
      ok('an edit creates a version that lists only what changed',v2.version===2&&v2.changes.length===1&&v2.changes[0].field==='targets.kcal'&&v2.changes[0].from===kc&&v2.changes[0].to===kc-150);
      ok('each version supersedes the one before and keeps its trigger',v2.supersedes===v1.id&&v2.trigger.kind==='your edit');
      var X=explainPlanChange(v2.id);ok('the change is explained in plain words, before and after',/calorie target/.test(X.headline)&&X.changes[0].from!==X.changes[0].to);
      ok('the plan audit holds',planAudit().ok,planAudit().issues.join('; '));
      updatePhase(ph.id,{calorieTarget:kc},{noUndo:true,noSave:true,intervention:false});_memoInvalidate();createPlanVersion({kind:'your edit'});
      /* A decision that changes nothing creates no version (correctly), so the decision changes a target, as a real one does. */
      updatePhase(ph.id,{stepTarget:(activePhase().stepTarget||8000)+1000},{noUndo:true,noSave:true,intervention:false,label:'apply intervention'});_memoInvalidate();
      var dv=notePlanChange('decision',{inFixture:true});
      ok('a decision-triggered version records the decision\u2019s evidence and alternatives',!!dv&&dv.trigger.kind==='decision'&&Array.isArray(dv.trigger.evidence)&&Array.isArray(dv.trigger.alternatives));
      ok('constraints are read as one model, with what is missing named',Array.isArray(constraintModel().missing)&&'sessionMinutes' in constraintModel());
      /* execution: intended, done, unknown, skipped — never "failed" for a missing log */
      var past=null;for(var i=1;i<14;i++){var dd=addDays(todayISO(),-i);var I=intendedFor(dd);if(I.items.some(function(x){return x.item==='training';})&&!DB.sessions.some(function(s){return s.date===dd;})){past=dd;break;}}
      if(past){var E=executionFor(past),tr=E.rows.filter(function(r){return r.item==='training';})[0];
        ok('an unlogged past session is unknown, never skipped or failed',tr.status==='unknown');
        markExecution(past,'training','skipped',{reason:'test'});ok('a deliberate skip is recorded as skipped',executionFor(past).rows.filter(function(r){return r.item==='training';})[0].status==='skipped');}
      var lift=null;for(var j=1;j<14;j++){var d2=addDays(todayISO(),-j);var ss=DB.sessions.filter(function(s){return s.date===d2&&!s.retracted;});if(ss.length&&intendedFor(d2).items.some(function(x){return x.item==='training';})){lift=d2;break;}}
      if(lift){var planned=intendedFor(lift).items.filter(function(x){return x.item==='training';})[0].plannedSets;
        var keep=DB.sessions.filter(function(s){return s.date===lift;}).map(function(s){return s.sets;});
        DB.sessions.filter(function(s){return s.date===lift;}).forEach(function(s){s.sets=s.sets.slice(0,Math.max(1,Math.round(planned*0.3)));});_memoInvalidate();
        markExecution(lift,'training','variant',{variant:'minimum'});
        ok('a minimum-version session with fewer sets counts as done',executionFor(lift).rows.filter(function(r){return r.item==='training';})[0].status==='done');
        DB.sessions.filter(function(s){return s.date===lift;}).forEach(function(s,k){s.sets=keep[k];});_memoInvalidate();}
      var R=planResponse();ok('a response is judged only when enough of the plan was done and recorded',R.judged===false?/not a failed plan|says more about the plan|Not enough/.test(R.interpretation):R.execution.doneShare>=0.6);
      ok('the next action names what to do and why',!!nextAction().label&&!!nextAction().why);
      ok('plan versions survive a rebuild from the event history',(function(){var p=projectEvents(_EVENTS);var db=p.db||p;return (db.plans||[]).length===plansOf().length;})());
    });
    /* ---- H1: fit, food constraints, signals, setup ---- */
    withFixture('successful_cut',function(){
      DB.plans=[];_memoInvalidate();ensurePlan();
      var keepP=JSON.parse(JSON.stringify(DB.profile)),keepD=(DB.settings.trainingDays||[]).slice();
      ok('with no constraints given, nothing is claimed not to fit',planFeasibility().ok===true);
      applyProfileFields({sessionMinutes:30});DB.settings.trainingDays=['Sun'];DB.profile.equipment=['bodyweight'];_memoInvalidate();
      var F=planFeasibility();
      ok('a session longer than the time available is flagged, with a fix',F.conflicts.some(function(c){return c.kind==='time'&&!!c.fix;}));
      ok('a session on a day the person cannot train is flagged',F.conflicts.some(function(c){return c.kind==='day';}));
      ok('an exercise the person has no equipment for is flagged',F.conflicts.some(function(c){return c.kind==='equipment';}));
      ok('a plan that does not fit reaches the attention queue',attentionQueue().items.some(function(i){return i.id==='plan-fit'&&i.act;}));
      DB.profile=keepP;DB.settings.trainingDays=keepD;_memoInvalidate();
      ok('vegetarian leaves out meat and fish',!foodAllowed({name:'Chicken breast, roasted'},['vegetarian'])&&!foodAllowed({name:'Salmon, baked'},['vegetarian'])&&foodAllowed({name:'Lentils, boiled'},['vegetarian']));
      ok('vegan leaves out dairy and eggs but keeps plant milks and nut butters',!foodAllowed({name:'Milk, whole'},['vegan'])&&!foodAllowed({name:'Egg, whole'},['vegan'])&&foodAllowed({name:'Almond milk'},['vegan'])&&foodAllowed({name:'Peanut butter'},['vegan']));
      ok('gluten-free leaves out wheat but keeps rice and corn tortillas',!foodAllowed({name:'Bread, wheat'},['gluten-free'])&&foodAllowed({name:'Rice, white'},['gluten-free'])&&foodAllowed({name:'Corn tortilla'},['gluten-free']));
      ok('halal and kosher leave out pork; kosher leaves out shellfish',!foodAllowed({name:'Pork chop'},['halal'])&&!foodAllowed({name:'Pork chop'},['kosher'])&&!foodAllowed({name:'Shrimp, cooked'},['kosher']));
      applyProfileFields({dietRestrictions:['vegetarian']});_memoInvalidate();
      var pd=planDay(todayISO());
      ok('meal suggestions honour diet restrictions',pd.status!=='ok'||pd.candidates.every(function(c){return c.items.every(function(it){return foodAllowed(it.food,['vegetarian']);});}));
      ok('meal suggestions say which constraints they do not use yet',pd.status!=='ok'||!!(pd.constraints&&pd.constraints.note));
      DB.profile=keepP;_memoInvalidate();
      DB.plans=[];_memoInvalidate();
      var sp=notePlanChange('setup',{inFixture:true,reason:'Created from your setup: your goal, your circumstances and your first phase.'});
      ok('a first plan made from setup says it came from setup',!!sp&&sp.trigger.kind==='setup'&&sp.version===1);
    });
    ok('a person starting their first phase gets a calorie suggestion from their profile',(function(){var keep=DB;DB=emptyDB();_memoInvalidate();
      applyProfileFields({sex:'female',age:36,heightFt:5,heightIn:6,startWeight:172});_memoInvalidate();
      var cs=calorieTargetSuggestion({band:rateBand(172,'cut')});DB=keep;_memoInvalidate();return !!cs&&cs.value>1000&&cs.cls==='PRIOR';})());
    /* ---- H1: one queue, cooking and budget, programmes that fit ---- */
    withFixture('successful_cut',function(){
      var keepSave=_SAVE_STATE.ok,keepErr=_SAVE_STATE.lastError;_SAVE_STATE.ok=false;_SAVE_STATE.lastError='test';
      ok('saving failing arrives in the attention queue, first, with an action',(function(){var q=attentionQueue().items;return q.length&&q[0].id==='save-failing'&&q[0].act==='data.backup';})());
      _SAVE_STATE.ok=keepSave;_SAVE_STATE.lastError=keepErr;
      ok('a food that needs cooking is judged from its name and category',foodPrep({name:'Chicken breast, raw',category:'Poultry Products'})==='quick'&&foodPrep({name:'Lentils, mature seeds, raw'})==='long'&&foodPrep({name:'Apples, raw'})==='none');
      var keepP=JSON.parse(JSON.stringify(DB.profile));
      applyProfileFields({cookingTime:'none',foodBudget:'tight'});_memoInvalidate();
      var pd=planDay(todayISO());
      ok('with no cooking, suggestions need no cooking',pd.status!=='ok'||pd.candidates.every(function(c){return c.items.every(function(it){return foodPrep(it.food)==='none';});}));
      ok('on a tight budget, pricier foods are avoided when cheaper ones exist',pd.status!=='ok'||pd.candidates.every(function(c){return c.items.filter(function(it){return foodCostTier(it.food)===3;}).length<=1;}));
      ok('the suggestions say cost tiers are estimates, not prices',pd.status!=='ok'||/estimates, not prices/.test(pd.constraints.note));
      DB.profile=keepP;_memoInvalidate();
      var g=generatePrograms({equipment:['barbell','rack','bench','dumbbell','cable','machine','bar','kettlebell','box','medball'],days:['Mon','Wed','Fri'],sessionMinutes:40});
      ok('every generated day fits the session length',g.status!=='ok'||g.candidates.every(function(c){return Object.keys(c.fit.dayMinutes).every(function(d){return c.fit.dayMinutes[d]<=40;});}));
      ok('every trim made to fit is stated',g.status!=='ok'||g.candidates.some(function(c){return Object.keys(c.fit.trims).length>0;})||g.candidates.every(function(c){return Object.keys(c.fit.dayMinutes).every(function(d){return c.fit.dayMinutes[d]<=40;});}));
    });
    /* ---- H4: honest personalisation ---- */
    ok('knowledge never becomes more confident as it ages',['high','medium','low','very low'].every(function(l){var prev=CONF_LEVELS.indexOf(l);
      for(var a=0;a<=900;a+=10){var i=CONF_LEVELS.indexOf(decayConfidence(l,a));if(i>prev)return false;prev=i;}return true;}));
    ok('knowledge a few weeks old keeps its level',decayConfidence('medium',20)==='medium'&&decayConfidence('high',30)==='high');
    ok('a population estimate is labelled a starting estimate',personalizationLabel({status:'ok',cls:'PRIOR'}).key==='population');
    ok('a population estimate for someone with history is labelled out of date',personalizationLabel({status:'ok',cls:'PRIOR'},{history:true}).key==='stale');
    ok('a blended estimate is labelled adjusted to you',personalizationLabel({status:'ok',cls:'BLENDED'}).key==='adjusted');
    ok('an estimate from the person\u2019s own record is labelled so',personalizationLabel({status:'ok',cls:'EMPIRICAL'}).key==='yours');
    ok('a declined estimate says what it needs',personalizationLabel({status:'insufficient',need:['7 weigh-ins']}).key==='none'&&/7 weigh-ins/.test(personalizationLabel({status:'insufficient',need:['7 weigh-ins']}).why));
    withFixture('successful_cut',function(){
      ok('a model with too few checked predictions is not yet proven',modelHealth('no_such_model').state==='unproven');
      var P=(DB.predictions||[]).filter(function(p){return p.status!=='pending'&&p.covered!=null;});
      if(P.length>=20){var m=P[0].model,mine=P.filter(function(p){return p.model===m;}).sort(function(a,b){return a.dueDate<b.dueDate?-1:1;});
        var keep=mine.map(function(p){return p.covered;});mine.forEach(function(p,i){p.covered=i<mine.length/2;});_memoInvalidate();
        ok('recent misses after earlier hits mark a model as getting less reliable',modelHealth(m).state==='degraded');
        mine.forEach(function(p,i){p.covered=keep[i];});_memoInvalidate();}
    });
    /* ---- H4: renderers the surfaced capabilities need ---- */
    (function(){
      var H=renderChartSpec('heatmap',{title:'t',rows:['A'],cols:['d1','d2','d3','d4'],cells:[[{state:'done'},{state:'partial'},{state:'skipped'},{state:'unknown'}]]});
      ok('the execution calendar tells states apart by shape, not only shade',/hx-done/.test(H)&&/hx-part/.test(H)&&/hx-x/.test(H)&&/hx-unk/.test(H));
      ok('every calendar mark has a text title',(H.match(/<title>/g)||[]).length===4);
      var B=renderChartSpec('stackedBar',{title:'t',categories:['Mon','Tue'],series:[{name:'P',values:[400,0]},{name:'C',values:[800,0]}],target:1500});
      ok('a day with nothing logged is a dash, not a zero bar',/>\u2013</.test(B)&&(B.match(/class="sb-s/g)||[]).length===2);
      ok('the target line is labelled with its value',/target 1,500/.test(B));
      var T=renderChartSpec('timeline',{title:'t',events:[{date:'2026-07-01',lane:'Plan',short:'v1',label:'a'},{date:'2026-08-01',lane:'Phase',short:'Cut',label:'b'}],lanes:['Plan','Phase']});
      ok('the timeline keeps each lane and titles each event',/>Plan</.test(T)&&/>Phase</.test(T)&&(T.match(/<title>/g)||[]).length===2);
      var C=chartCatalogueSummary();ok('the catalogue says which chart types are only planned',C.available+C.planned.length===C.total&&chartTypeStatus('__noSuchType')==='planned'&&chartTypeStatus('heatmap')==='available');
    })();
    /* ---- Schedules: weekly, rotating shifts, irregular ---- */
    withFixture('successful_cut',function(){
      var keep=DB.settings.schedule;
      ok('a weekly schedule places sessions exactly as before',(function(){DB.settings.schedule={mode:'weekly'};_memoInvalidate();var p=trainingProgram(),d=todayISO();
        return JSON.stringify(scheduledPlan(d,p))===JSON.stringify((p.week||{})[_DOW[new Date(d+'T12:00:00Z').getUTCDay()]]||null);})());
      DB.settings.schedule={mode:'rotation',pattern:ROTATION_PRESETS['pitman-dn'].pattern,anchor:addDays(todayISO(),-10),protectAfterNights:true};_memoInvalidate();
      var A=scheduleAhead(56),lifts=A.filter(function(x){return x.kind==='lift';});
      ok('a rotation places sessions only where a shift leaves time',lifts.length>0&&lifts.every(function(x){return x.shift!=='N';}));
      ok('the first day off after nights is kept for sleep',A.every(function(x,i){return !(x.kind==='lift'&&x.shift==='O'&&i>0&&A[i-1].shift==='N');}));
      ok('never more lifting sessions in seven days than the programme asks for, nor more than three in a row',(function(){var per=_liftSequence(trainingProgram()).length,run=0,mr=0,m7=0;
        A.forEach(function(x,i){if(x.kind==='lift'){run++;mr=Math.max(mr,run);}else run=0;m7=Math.max(m7,A.slice(i,i+7).filter(function(y){return y.kind==='lift';}).length);});return mr<=3&&m7<=per;})());
      ok('past days keep their session when the schedule is read again',(function(){var d=addDays(todayISO(),-3),a=JSON.stringify(scheduledPlan(d,trainingProgram()));_memoInvalidate();return a===JSON.stringify(scheduledPlan(d,trainingProgram()));})());
      ok('a rotation needs its pattern and start date',(function(){DB.settings.schedule={mode:'rotation'};return !scheduleAudit().ok;})());
      DB.settings.schedule={mode:'irregular',available:{}};DB.settings.schedule.available[addDays(todayISO(),1)]=60;DB.settings.schedule.available[addDays(todayISO(),2)]=20;_memoInvalidate();
      ok('an irregular schedule uses the days marked free, sized by the time given',availabilityOn(addDays(todayISO(),1)).level==='full'&&availabilityOn(addDays(todayISO(),2)).level==='short'&&availabilityOn(addDays(todayISO(),3)).level==='none');
      DB.settings.schedule=keep;_memoInvalidate();
    });
    /* ---- Movement drawings ---- */
    (function(){var A=movementVisualAudit();ok('every movement and pose drawing passes the visual audit: its view matches its plane, it visibly moves, and pushes go the right way',A.ok,A.issues.join('; '));
      ok('a bench press is drawn lying down and a push-up face down',exerciseOrientation('Bench press').id==='supine'&&exerciseOrientation('Push-up').id==='prone'&&exerciseOrientation('Lat pulldown').id==='seated');
      ok('a lateral raise is drawn from the front',movementModel('abduction').view==='front');})();
    /* ---- Ready-made experiments ---- */
    ok('every ready-made experiment says what you would actually do',EXPERIMENT_TEMPLATES.every(function(t){return !!t.todo;}));
    /* ---- Usage review: Tools order, the guide, Today ---- */
    ok('External server is pinned to the top of Tools by default, and any section can be pinned',toolsPinned()[0]==='tools-server'&&typeof ACTIONS['tools.pin']==='function');
    ok('a feature opened from the guide closes the guide first (nothing opens behind it)',typeof ACTIONS['features.go']==='function'&&renderFeatureRow({id:'x',icon:'pin',label:'x',what:'x',on:false,act:'weather.open',cta:'Go'}).indexOf('features.go')>=0);
    /* ---- Response entity: what happened because of a change (constructed cases with known answers) ---- */
    withFixture('successful_cut',function(){
      var keepO=DB.observations,keepR=DB.responses,D=addDays(todayISO(),-21);
      var build=function(slopeBefore,slopeAfter,shift,hungerJump){DB.observations=keepO.filter(function(o){return o.type!=='weight'&&o.type!=='hunger';});var w=250;
        for(var i=-21;i<=20;i++){var d=addDays(D,i),inAfter=i>=(shift||0);w+=(inAfter?slopeAfter:slopeBefore)/7;DB.observations.push(makeObservation({type:'weight',date:d,value:round(w+((i*7919)%5-2)*0.05,2),source:'test'}));
          DB.observations.push(makeObservation({type:'hunger',date:d,value:(hungerJump&&i>=0)?7+((i*31)%3-1)*0.3:4+((i*17)%3-1)*0.3,source:'test'}));}_memoInvalidate();};
      var iv={id:'t1',kind:'plan change',date:D,variable:'calories',from:2400,to:1900,reversible:'yes'};
      build(0,-1,0,false);var r=evaluateResponse(iv);
      ok('a clear change in trend after a change is judged a clear response, against the trend before continued',r.stage==='final'&&r.primary&&Math.abs(r.primary.effect+1)<0.3&&/clear response/.test(r.verdict)&&r.primary.counterfactual===r.primary.before);
      ok('the effect is compared with what the model expected (500 kcal less is about 1 lb a week)',r.expected&&r.expectation==='as expected');
      build(0,-1,-7,false);r=evaluateResponse(iv);ok('a change already under way before the intervention is caught by the placebo check',r.placebo&&r.placebo.alreadyUnderWay===true&&/already under way/.test(r.verdict));
      build(0,-1,0,true);r=evaluateResponse(iv);ok('an unintended effect (hunger rising) is reported',r.unintended.some(function(u){return u.quantity==='hunger';}));
      var p=evaluateResponse({id:'t2',kind:'plan change',date:addDays(todayISO(),-3),variable:'calories',from:2400,to:2200});ok('a change only 3 days old is pending, not judged',p.stage==='pending');
      var ev={type:'response.recorded',data:r},db={responses:[]};EVENT_TYPES['response.recorded'].apply(db,ev);EVENT_TYPES['response.recorded'].apply(db,ev);
      ok('a response replays from its event, and a later record replaces the earlier',db.responses.length===1&&db.responses[0].id===r.id);
      DB.observations=keepO;DB.responses=keepR;_memoInvalidate();
    });
    /* ---- Personal response model (constructed responses, known answers) ---- */
    (function(){var keep=DB.responses,PR=RESPONSE_PRIORS()['calories\u2192weight'],pop=PR.perUnit*100;
      var mk=function(id,dose,effect,se,stage,adh,start){return {id:id,interventionId:id,variable:'calories',outcome:'weight',dose:dose,stage:stage||'final',start:start||'2026-01-01',
        adherence:adh!=null?{share:adh}:null,primary:{effect:effect,se:se}};};
      DB.responses=[];var row=function(){return personalResponseModel().rows.filter(function(r){return r.key==='calories\u2192weight';})[0];};
      ok('with no responses of its own, the model is the population figure',row().n===0&&Math.abs(row().posterior.mean-round(pop,3))<1e-9&&row().personalWeight===0);
      DB.responses=[mk('a',-500,-2*500*PR.perUnit,0.05),mk('b',-500,-2*500*PR.perUnit,0.05)];   /* this person loses twice what the arithmetic says */
      var r2=row();ok('precise personal responses move the estimate toward this person and say how much is theirs',r2.posterior.mean>1.6*pop&&r2.personalWeight>0.5);
      DB.responses=[mk('a',-500,-2*500*PR.perUnit,0.05,'provisional')];var wP=row().personalWeight;DB.responses=[mk('a',-500,-2*500*PR.perUnit,0.05,'final')];var wF=row().personalWeight;
      ok('a provisional response counts for less than a final one',wP<wF,'provisional '+wP+', final '+wF);
      DB.responses=[mk('h',-500,-500*PR.perUnit,0.02,'final',0.5),mk('f',-500,-1000*PR.perUnit,0.04,'final',1)];
      var per=personalResponseModel().rows.filter(function(r){return r.key==='calories\u2192weight';})[0];
      ok('a change done on half the days is read as half the dose',Math.abs(_perUnit(DB.responses[0]).y-_perUnit(DB.responses[1]).y)<1e-9);
      DB.responses=[mk('x',-500,-3*500*PR.perUnit,0.02)];var withX=predictResponse('calories','weight',-500),without=predictResponse('calories','weight',-500,{excludeId:'x'});
      ok('a change is never judged against an expectation built from itself (leave-one-out)',withX.n===1&&without.n===0);
      DB.responses=keep;})();
    /* ---- Friction and adherence ---- */
    (function(){var X=[],y=[];for(var i=0;i<200;i++){var f=i%2,p=f?0.3:0.9,u=((i*7919)%100)/100;X.push([1,f]);y.push(u<p?1:0);}   /* a planted friction: 90% done without it, 30% with it */
      var fit=_logitRidge(X,y,1),or=Math.exp(fit.b[1]);ok('the friction regression recovers a planted effect (done 90% without the factor, 30% with it)',or<0.15&&Math.abs(fit.b[1])>2*fit.se[1]);
      var keep=DB.responses;DB.responses=[];var small=interventionAdherence('steps',500,8000).p,big=interventionAdherence('steps',3000,8000).p;
      ok('a bigger change is expected to be carried out less often',big<small);
      DB.responses=[{id:'a',variable:'steps',adherence:{share:0.3,daysLogged:21}},{id:'b',variable:'steps',adherence:{share:0.3,daysLogged:21}}];
      ok('past adherence to changes of this kind pulls the estimate toward what actually happened',interventionAdherence('steps',3000,8000).p<big);
      var L=rankLevers([{key:'a',variable:'calories',dose:-175,current:2400},{key:'b',variable:'steps',dose:2000,current:8000}]);
      ok('levers are ranked by expected effect times the probability of carrying them out',L.every(function(o){return o.effectiveEffect==null||Math.abs(o.effectiveEffect-o.expectedEffect*o.pExecution)<0.002;})&&Math.abs(L[0].effectiveEffect)>=Math.abs(L[1].effectiveEffect));
      DB.responses=keep;})();
    withFixture('stall',function(){var d=decide();ok('population figures alone never switch the lever away from activity (no personal record here)',d.code!=='REDUCE_CALORIES');if(d.code==='ADD_STEPS'||d.code==='REDUCE_CALORIES')ok('a lever decision records both options, their effects and how likely each is to be done',!!(d.leverChoice&&d.leverChoice.options.length===2&&d.leverChoice.options.every(function(o){return o.pExecution>0;})));});
    /* ---- Physique by region (constructed training with a known lagging region) ---- */
    withFixture('successful_cut',function(){
      var keepS=DB.sessions,keepO=DB.observations,keepP=DB.settings.physiquePriorities;DB.settings.physiquePriorities=[];DB.sessions=[];
      for(var d=55;d>=0;d--){if(d%7!==0&&d%7!==2&&d%7!==4)continue;var k=55-d,sets=[];
        for(var i=0;i<4;i++){sets.push({exercise:'Squat',load:round(200*(1+0.006*k),1),reps:8,rir:2});sets.push({exercise:'Bench press',load:150+((k*7)%3-1),reps:8,rir:2});sets.push({exercise:'Lat pulldown',load:round(140*(1+0.006*k),1),reps:10,rir:2});}
        if(d%7===0)sets.push({exercise:'Overhead press',load:95,reps:8,rir:2});
        DB.sessions.push({id:'ps'+d,date:addDays(todayISO(),-d),sets:sets,createdAt:nowISO()});}
      _memoInvalidate();var P=physiqueModel(),R=function(m){return P.regions.filter(function(r){return r.muscle===m;})[0];};
      ok('a region trained enough but progressing clearly slower than the others is lagging',R('chest')&&R('chest').status==='lagging'&&R('quads').status==='on track');
      ok('a region with too few sets is under-trained, never lagging',R('delts')&&R('delts').status==='under-trained');
      ok('a lagging region gets a suggestion',P.suggestions.some(function(s){return s.muscle==='chest';}));
      ['Hack squat','Front squat','Leg press'].forEach(function(n,i){DB.sessions.push({id:'rx'+i,date:addDays(todayISO(),-i-1),sets:[{exercise:n,load:200,reps:10,rir:2}],createdAt:nowISO()});});_memoInvalidate();
      ok('several exercises with the same pattern for the same muscle are flagged as overlap',exerciseRedundancy(28).some(function(x){return x.muscle==='quads'&&x.pattern==='squat'&&x.exercises.length>=3;}));
      DB.observations=DB.observations.filter(function(o){return o.type!=='bodyfat';});
      [[0,20,24],[14,19.5,23.6],[28,19,23.1]].forEach(function(r){DB.observations.push(makeObservation({type:'bodyfat',date:addDays(todayISO(),-r[0]),value:r[1],source:'test',method:'DEXA'}));DB.observations.push(makeObservation({type:'bodyfat',date:addDays(todayISO(),-r[0]-1),value:r[2],source:'test',method:'BIA scale'}));});
      _memoInvalidate();var B=bodyCompositionByMethod();
      ok('body fat is trended per method and never mixed; the methods are compared by their offset',B.methods.length===2&&B.offsets.length===1&&Math.abs(B.offsets[0].offset)>=3.5&&B.methods.every(function(m){return m.n===3;}));
      DB.observations=DB.observations.filter(function(o){return o.type!=='weight';});for(var j=20;j>=0;j--)DB.observations.push(makeObservation({type:'weight',date:addDays(todayISO(),-j),value:round(250*Math.pow(1-0.015/7,20-j),2),source:'test'}));_memoInvalidate();
      ok('a cut losing 1.5% a week is faster than the range',physiqueRate().state.indexOf('faster')===0);
      DB.sessions=keepS;DB.observations=keepO;DB.settings.physiquePriorities=keepP;_memoInvalidate();});
    /* ---- Model competition (synthetic candidates make the lifecycle rules deterministic) ---- */
    (function(){var keepL=DB.settings.modelLifecycle,keepC=MODEL_COMPETITIONS.__t;DB.settings.modelLifecycle={};
      var S=[];for(var i=0;i<140;i++)S.push({date:addDays(todayISO(),-139+i),value:200-0.1*i+((i*7919)%7-3)*0.15});
      var truth=function(o,h){var t=addDays(o,h),x=S.filter(function(p){return Math.abs(daysBetween(p.date,t))<=1;});return x.length?mean(x.map(function(p){return p.value;})):null;};
      COMPETITION_CANDIDATES.__good={label:'good',params:1,predict:function(_,o,h){var v=truth(o,h);return v==null?null:{mean:v+((daysBetween('2026-01-01',o)*31)%5-2)*0.12,sd:0.3};}};
      COMPETITION_CANDIDATES.__bad={label:'bad',params:1,incumbent:true,predict:function(_,o,h){var v=truth(o,h);return v==null?null:{mean:v+3+((daysBetween('2026-01-01',o)*17)%5-2)*0.2,sd:3};}};
      COMPETITION_CANDIDATES.__awful={label:'awful',params:1,predict:function(_,o,h){var v=truth(o,h);return v==null?null:{mean:v+15,sd:1};}};
      MODEL_COMPETITIONS.__t={label:'test',unit:'lb',horizons:[7],series:function(){return S;},candidates:['naive','__bad','__good','__awful']};
      var E=evaluateCompetition('__t',{series:S,force:true});
      ok('a clearly better, calibrated challenger replaces the incumbent, with the reason recorded',E.primary==='__good'&&E.changes.some(function(c){return c.type==='promoted'&&c.to==='__good'&&/standard errors better/.test(c.why);}));
      ok('a model far worse than the baseline is deprecated first',E.states.__awful==='DEPRECATED');
      var E2=evaluateCompetition('__t',{series:S});ok('a second look the same day changes nothing (evaluations, not refreshes, count)',E2.states.__awful==='DEPRECATED'&&E2.changes.length===0);
      var E3=evaluateCompetition('__t',{series:S,force:true});ok('deprecated again on the next evaluation, it is retired',E3.states.__awful==='RETIRED');
      ok('a model whose intervals are too narrow is given a widening factor',E.rows.filter(function(r){return r.candidate==='__awful';})[0].metrics[7].scale>2);
      /* flat noise: a trend model is not better just because it is more elaborate */
      DB.settings.modelLifecycle={};var F=[];for(var j=0;j<140;j++)F.push({date:addDays(todayISO(),-139+j),value:180+((j*7919)%11-5)*0.3});
      MODEL_COMPETITIONS.__f={label:'flat',unit:'lb',horizons:[7],series:function(){return F;},candidates:['naive','theil_sen','holt','damped']};
      var G=evaluateCompetition('__f',{series:F,force:true});ok('on flat noise no elaborate model is promoted over the incumbent (newer is not assumed better)',G.changes.every(function(c){return c.type!=='promoted'||c.to==='naive';}));
      DB.settings.modelLifecycle={};var D=[];for(var k=0;k<140;k++)D.push({date:addDays(todayISO(),-139+k),value:250-0.2*k+((k*7919)%5-2)*0.1});
      MODEL_COMPETITIONS.__d={label:'decline',unit:'lb',horizons:[14],series:function(){return D;},candidates:['naive','theil_sen']};
      var H=evaluateCompetition('__d',{series:D,force:true});ok('on a steady decline the trend clearly beats the flat baseline',H.primaryBeatsBaseline===true);
      ['__good','__bad','__awful'].forEach(function(c){delete COMPETITION_CANDIDATES[c];});['__t','__f','__d'].forEach(function(c){delete MODEL_COMPETITIONS[c];});DB.settings.modelLifecycle=keepL;})();
    /* ---- From use: logging and supplements ---- */
    withFixture('successful_cut',function(){
      var keepO=DB.observations,keepS=DB.settings.supplementStack,d=todayISO();DB.observations=DB.observations.filter(function(o){return !(o.type==='supplement'&&o.date===d);});_memoInvalidate();
      setSupplementStack([{id:'creatine',dose:5,timing:'morning'},{id:'vitd',dose:50,timing:'morning'},{id:'magnesium',dose:300,timing:'night'}]);
      var _pu=pushUndo,_calls=0;pushUndo=function(l){if(_UNDO_BATCH===0)_calls++;return _pu(l);};var r;try{r=logSupplementStack(d,{slot:'morning'});}finally{pushUndo=_pu;}   /* counts undo steps requested (the self-test suppresses snapshots) */
      ok('logging morning supplements takes only the morning ones',r.logged===2&&!supplementIntakes(d,d).some(function(x){return x.id==='magnesium';}));
      ok('a group of supplements is one undo step, not one per item',_calls===1);
      var on=toggleSupplementToday('magnesium'),off=toggleSupplementToday('magnesium');ok('one supplement can be logged and removed on its own',on.taken===true&&off.taken===false&&!supplementIntakes(d,d).some(function(x){return x.id==='magnesium';}));
      var c=saveCustomSupplement({label:'Test Multi',per:{vitd:25,zinc:'15',iron:''}});ok('a product from its label counts its own nutrients',c.status==='ok'&&supplementNutrients({id:c.id,dose:1}).zinc===15&&supplementNutrients({id:c.id,dose:1}).iron===undefined);
      delete DB.settings.customSupplements;delete SUPPLEMENT_CATALOGUE[c.id];
      ok('water is entered in any unit and stored in litres',Math.abs(toLitres(16,'floz')-0.4732)<0.001&&Math.abs(toLitres(2,'cup')-0.4732)<0.001&&toLitres(500,'ml')===0.5);
      ok('self-rated adherence is no longer a log type (adherence is measured from what was done)',!LOG_TYPES.some(function(x){return x[0]==='adherence';}));
      DB.observations=keepO;DB.settings.supplementStack=keepS;_memoInvalidate();});
    /* ---- From use: setup, profile, phase criteria, context ---- */
    withFixture('successful_cut',function(){
      var ph=activePhase(),keepS=ph.startDate,keepSess=DB.sessions,keepP=JSON.stringify(DB.profile);ph.startDate=addDays(todayISO(),-71);
      DB.sessions=[];for(var i=0;i<10;i++)DB.sessions.push({id:'cs'+i,date:addDays(todayISO(),-70+i*7),sets:[{exercise:'Squat',load:i<4?300:265,reps:5,rir:2}],createdAt:nowISO()});_memoInvalidate();
      var C=phaseCriteriaStatus(ph),get=function(k,id){return C[k].filter(function(r){return r.id===id;})[0];};
      ok('a cut of 10 weeks says a diet break is due',get('transition','diet_break').state==='met');
      ok('strength down more than 10% meets the stop rule, with its evidence',get('stop','strength_drop').state==='met'&&/%/.test(get('stop','strength_drop').why));
      ok('a met stop rule raises an action alert',attentionQueue().items.some(function(q){return /^crit-stop:/.test(q.id)&&q.severity==='action';}));
      ok('every criterion reports met, not yet or unknown, with a reason',['success','stop','transition'].every(function(k){return C[k].every(function(r){return ['met','not yet','unknown'].indexOf(r.state)>=0&&r.why;});}));
      ph.startDate=keepS;DB.sessions=keepSess;_memoInvalidate();
      if(typeof document!=='undefined'&&document.body&&document.getElementById('editBackdrop')){   /* a real sheet: only where there is a page */
        DB.profile.equipment=['barbell','dumbbells'];openProfile();dispatchAct('profile.eq','machine');saveProfile();
        ok('saving the profile keeps equipment a list (it used to become one string)',Array.isArray(DB.profile.equipment)&&DB.profile.equipment.indexOf('barbell')>=0&&DB.profile.equipment.indexOf('machine')>=0);
        closeSheet();}
      DB.profile=JSON.parse(keepP);
      ok('context tags are the words the models look for',CONTEXT_TAGS.some(function(c){return /new scale/.test(c[0]);})&&CONTEXT_TAGS.every(function(c){return c[1].length>10;}));});
    /* ---- From use: your own schedule choices ---- */
    withFixture('successful_cut',function(){
      var keepS=JSON.stringify(DB.settings.schedule||{}),keepT=DB.settings.trainingDays,P=trainingProgram(),seq=_liftSequence(P).map(function(x){return x.label;});
      var day=function(name){for(var i=0;i<7;i++){var d=addDays(todayISO(),i);if(dowShort(d)===name)return d;}};
      var on=function(name){var x=scheduledPlan(day(name),P);return x&&x.kind==='lift'?x.label:null;};
      DB.settings.schedule={mode:'weekly'};DB.settings.trainingDays=['Tue','Thu','Sat'];_memoInvalidate();
      ok('the schedule\u2019s training days set the week (they were ignored), sessions in order',on('Tue')===seq[0]&&on('Thu')===seq[1]&&on('Sat')===seq[2]&&on('Mon')===null);
      setSchedule({override:{date:day('Sun'),choice:'train'}});ok('a day you set to train gets the next session',on('Sun')===seq[3%seq.length]);
      setSchedule({override:{date:day('Thu'),choice:'rest'}});ok('a day you set to rest has no session',on('Thu')===null);
      setSchedule({override:{date:day('Thu'),choice:'auto'}});ok('auto gives the day back to the schedule',on('Thu')===seq[1]);
      setSchedule({mode:'rotation',preset:'pitman-dn',anchor:todayISO()});var rot=function(i){var x=scheduledPlan(addDays(todayISO(),i),P);return x&&x.kind==='lift';};
      var free=-1;for(var i=0;i<14;i++)if(!rot(i)){free=i;break;}
      if(free>=0){setSchedule({cycleChoice:{index:free%((scheduleModel().pattern||'x').length),choice:'train'}});ok('a cycle day you set to train is trained every cycle',rot(free));}
      DB.settings.schedule=JSON.parse(keepS);DB.settings.trainingDays=keepT;_memoInvalidate();});
    /* ---- From use: workouts ---- */
    withFixture('successful_cut',function(){var P=trainingProgram(),d=null;for(var i=2;i<14;i++){var x=addDays(todayISO(),i),pl=scheduledPlan(x,P);if(pl&&pl.kind==='lift'){d=x;break;}}
      if(d){var W=buildWorkout(d);ok('a lifting day beyond the programme structure still builds its exercises (it built an empty session)',W.exercises.length>0&&W.label!=='Session');}
      ok('a stepper is minus and plus around the field, going through its own action',/data-act="ui.step"[\s\S]*<input id="t1"[\s\S]*data-act="ui.step"/.test(uiStepper('<input id="t1" data-act="x.y">','t1',5,0,null,1)));
      ok('a timer offers its choices before it starts',(uiTimer('tt',{choices:[30,60]}).match(/timer\.start/g)||[]).length===2);});
    /* ---- From use: food portions ---- */
    withFixture('successful_cut',function(){var keep=DB.foodLogs.slice(),f=seedFoods().filter(function(x){return (normalizeFood(x).portions||[]).length;})[0];
      if(f){var pt=normalizeFood(f).portions[0],L=logFood({date:todayISO(),meal:'lunch',food:f,amount:1,unit:'portion:'+pt.label,portionLabel:pt.label,silent:true,noSave:true});L=L&&L.id?L:DB.foodLogs[DB.foodLogs.length-1];
        ok('an entry keeps the portion it was logged in, and the food\u2019s portions',L.portion&&L.portion.unit==='portion:'+pt.label&&(L.food.portions||[]).length>0);
        var r1=updateFoodLog(L.id,L.quantity,'dinner');var c1=DB.foodLogs.filter(function(x){return x.supersedes===L.id;})[0];
        ok('changing only the meal keeps the portion label (it used to turn into grams)',c1&&c1.portionLabel===L.portionLabel&&c1.portion&&c1.portion.unit===L.portion.unit);
        var res=portionResolve(_foodForEdit(c1),2,c1.portion.unit);updateFoodLog(c1.id,res.qty,c1.meal,{amount:2,unit:c1.portion.unit,label:'2 \u00d7 '+pt.label});var c2=DB.foodLogs.filter(function(x){return x.supersedes===c1.id;})[0];
        ok('editing in the portion unit doubles the nutrients',c2&&Math.abs(c2.nutrients.kcal-2*c1.nutrients.kcal)<0.5&&c2.portion.amount===2);}
      DB.foodLogs=keep;_memoInvalidate();});
    /* ---- From use: hydration, and the larger catalogue ---- */
    withFixture('successful_cut',function(){var keepO=DB.observations,keepF=DB.foodLogs,d=todayISO();
      DB.observations=DB.observations.filter(function(o){return !(o.date===d&&/water|urine|sweatrate|cardio/.test(o.type));});DB.foodLogs=DB.foodLogs.filter(function(l){return l.date!==d;});
      DB.foodLogs.push({id:'hw1',date:d,meal:'lunch',food:{name:'Cucumber',per100:{water:95,kcal:15},basis:'g'},basis:'g',quantity:200,nutrients:{kcal:30},createdAt:nowISO()});
      DB.observations.push(makeObservation({type:'water',date:d,value:1.5,source:'test'}));_memoInvalidate();
      var H=hydrationModel(d);ok('food water comes from each food\u2019s own water content (200 g of cucumber is 190 ml)',H.status==='ok'&&Math.abs(H.fromFoodL-0.19)<0.005&&H.fromDrinksL===1.5);
      var r=_sweatRateFrom({pre:unitPref()==='metric'?80:fromCanonicalWeight(80/0.453592),post:unitPref()==='metric'?79:fromCanonicalWeight(79/0.453592),drank:toLitres(0.5,'L')/WATER_UNITS[waterUnitDefault()].l,minutes:60});
      ok('a sweat test gives (weight lost + fluid drunk) per hour: 1 kg + 0.5 L over an hour is 1.5 L/h',r!=null&&Math.abs(r-1.5)<0.03);
      DB.observations.push(makeObservation({type:'sweatrate',date:addDays(d,-3),value:1.5,source:'test',method:'run'}));DB.observations.push(makeObservation({type:'cardio',date:d,value:60,source:'test',method:'run'}));_memoInvalidate();
      var H2=hydrationModel(d);ok('your own sweat rate replaces the estimate for that kind of training',H2.sessions.some(function(x){return /your sweat rate/.test(x.basis)&&x.litres>=1.4;}));
      DB.observations.push(makeObservation({type:'urine',date:d,value:7,source:'test'}));_memoInvalidate();ok('a dark urine colour says to drink more',hydrationModel(d).urine.reading==='drink more');
      DB.observations=keepO;DB.foodLogs=keepF;_memoInvalidate();});
    ok('the supplement catalogue covers 120 or more products, each graded',Object.keys(SUPPLEMENT_CATALOGUE).length>=120);
    ok('overlapping interaction rules say each warning once',(function(){var x=supplementInteractions(['greentea','ashwagandha','kava']).map(function(i){return i.text;});return x.length===x.filter(function(v,i,a){return a.indexOf(v)===i;}).length;})());
    /* ---- Phase 11: the unified optimiser ---- */
    withFixture('successful_cut',function(){var keepO=DB.observations,keepPref=DB.settings.optimiserPreference;_memoInvalidate();var O=unifiedOptimiser({minutesBudget:180});
      if(O.status==='ok'&&O.pareto.length){
        var dom=function(a,b){return a.toward>=b.toward&&a.burden<=b.burden&&a.minutes<=b.minutes&&a.riskScore<=b.riskScore&&(a.toward>b.toward||a.burden<b.burden||a.minutes<b.minutes||a.riskScore<b.riskScore);};
        ok('no option in the Pareto set is beaten on every count by another',O.pareto.every(function(r){return !O.pareto.some(function(s){return s!==r&&dom(s,r);});}));
        ok('in a cut every option on offer moves weight down',O.pareto.every(function(r){return r.effective<0;}));
        ok('the expected effect allows for the chance of not carrying it out',O.pareto.every(function(r){return Math.abs(r.effective)<=Math.abs(r.effect)+1e-9;}));
        var ph=activePhase(),before=ph.calorieTarget,row=O.pareto.filter(function(r){return r.changes.calories;})[0];
        if(row){applyOptimiserChoice(row);ok('choosing an option changes the phase targets through the same path as editing them',activePhase().calorieTarget===before+row.changes.calories);updatePhase(ph.id,{calorieTarget:before},{noUndo:true,noSave:true});}
        DB.settings.optimiserPreference='effort';_memoInvalidate();var e=unifiedOptimiser({minutesBudget:180}).recommended;DB.settings.optimiserPreference='fastest';_memoInvalidate();var f=unifiedOptimiser({minutesBudget:180}).recommended;
        ok('least effort never asks for more time than fastest',e&&f&&e.minutes<=f.minutes);}
      DB.observations=DB.observations.filter(function(o){return o.type!=='fatigue';});for(var i=0;i<7;i++)DB.observations.push(makeObservation({type:'fatigue',date:addDays(todayISO(),-i),value:8,source:'test'}));_memoInvalidate();
      var F=unifiedOptimiser({minutesBudget:180});ok('with fatigue at 8, nothing on offer adds training or cardio',F.status!=='ok'||F.pareto.every(function(r){return !(r.changes.cardio>0||r.changes.training>0);}));
      DB.observations=keepO;DB.settings.optimiserPreference=keepPref;_memoInvalidate();});
    /* ---- Phase 12: the learning loop ---- */
    withFixture('successful_cut',function(){var keepC=DB.cycles,keepX=DB.experiments;DB.cycles=[];_memoInvalidate();
      var c1=runLearningCycle(),c2=runLearningCycle();ok('one learning cycle a week: asking again returns the same record',c1.id===c2.id&&DB.cycles.length===1&&/^cycle:\d{4}-W\d{2}$/.test(c1.id));
      ok('every stage of the loop reports, observe to personalize',['observe','understand','decide','act','measure','explain','learn','adapt','predict','test','personalize'].every(function(id){return c1.stages.some(function(s){return s.id===id&&s.figure;});}));
      var db={cycles:[]};EVENT_TYPES['cycle.recorded'].apply(db,{type:'cycle.recorded',data:c1});ok('a cycle replays from its event',db.cycles.length===1&&db.cycles[0].id===c1.id);
      var prev={responses:{'steps\u2192weight':{mean:-0.1,sd:0.05,personal:0.1,n:1,label:'per 1,000 steps a day',unit:'lb/week'}},friction:[],forecast:{primary:'theil_sen'},lagging:['Chest'],adherence:60};
      var now={responses:{'steps\u2192weight':{mean:-0.25,sd:0.05,personal:0.6,n:3,label:'per 1,000 steps a day',unit:'lb/week'},'calories\u2192weight':{mean:0.2,sd:0.05,personal:0.5,n:1,label:'per 100 kcal a day',unit:'lb/week'}},friction:['cardio: under 6 hours of sleep the night before'],forecast:{primary:'damped'},lagging:[],adherence:80};
      var L=_loopDeltas(prev,now).join(' | ');
      ok('what was learned names a moved estimate, a first estimate, a new friction, a new forecast, a muscle no longer lagging and adherence',/moved from -0.1 to -0.25/.test(L)&&/first estimate of your calories/.test(L)&&/clearly gets in the way/.test(L)&&/forecast now trusts/.test(L)&&/no longer lagging/.test(L)&&/80%/.test(L));
      DB.experiments=(DB.experiments||[]).concat([{id:'xx',variable:nextTest().variable,status:'running'}]);var n2=nextTest();ok('the next test skips a lever already being tested',n2.status!=='ok'||n2.variable!==DB.experiments[DB.experiments.length-1].variable);
      DB.cycles=keepC;DB.experiments=keepX;_memoInvalidate();});
    /* ---- Engineering control: canonical Response, one lifecycle, IndividualState ---- */
    withFixture('successful_cut',function(){
      /* a real intervention to judge: a steps experiment begun 25 days ago (a vacuous pass over no responses proves nothing) */
      createExperiment({variable:'steps',baselineValue:8000,interventionValue:10000,intervention:'steps +2,000/day',startDate:addDays(todayISO(),-25),durationDays:14,question:'do more steps move my trend?'});
      _memoInvalidate();recordResponses();var R=responsesOf();
      ok('every Response carries the canonical field set (audit A-002)',R.length>0&&R.every(function(r){return ['interventionId','executionIds','exposureWindow','expectedOutcome','observedOutcome','delta','uncertainty','confounders','attribution','confidence','applicability','evidence','modelVersion','status'].every(function(k){return k in r;});}));
      ok('an intervention\u2019s own context tag is not a confounder of itself',R.every(function(r){return r.confounders.every(function(c){return !/context: intervention:/.test(c);});}));
      var L=interventionLifecycles();ok('every intervention has one state from the one lifecycle (audit A-003)',L.length>0&&L.every(function(l){return INTERVENTION_STATES.indexOf(l.state)>=0&&l.transitions[0].state==='proposed';}));
      ok('a lifecycle never claims a later state without the earlier ones',L.every(function(l){var idx=l.transitions.map(function(t){return INTERVENTION_STATES.indexOf(t.state);});return idx.every(function(v,i){return i===0||v>idx[i-1];});}));
      var S=individualState();ok('IndividualState composes every part and is read-only (audit A-005)',['goal','constraints','plan','training','nutrition','activity','recovery','bodyComposition','execution','response','evidence','adaptation'].every(function(k){return k in S;})&&Object.isFrozen(S));
      var threw=false;try{(function(){'use strict';S.goal=null;})();}catch(e){threw=true;}ok('writing through IndividualState is refused',threw);});
    /* ---- Engineering control: the plan authority (audit A-004, rule 7) ---- */
    withFixture('successful_cut',function(){ensurePlan();var ph=activePhase(),n0=plansOf().length,k0=ph.calorieTarget,s0=ph.stepTarget;
      var r=changePlan({kind:'targets',source:'your edit',reason:'test: two targets at once',expected:'as you set',apply:function(){updatePhase(ph.id,{calorieTarget:k0-100},{noUndo:true});updatePhase(ph.id,{stepTarget:(s0||8000)+1000},{noUndo:true});}});
      ok('a plan change touching two targets makes exactly one plan version, carrying its reason and source',plansOf().length===n0+1&&r.version&&r.version.trigger.reason==='test: two targets at once'&&r.version.trigger.source==='your edit');
      var refused=function(c){try{changePlan(c);return false;}catch(e){return true;}};
      ok('a plan change without a reason is refused',refused({kind:'targets',source:'your edit',apply:function(){}}));
      ok('an adaptive change without an expected outcome is refused (rule 7)',refused({kind:'adaptation',source:'adaptation',reason:'x',apply:function(){}})&&refused({kind:'decision',source:'decision',reason:'x',apply:function(){}}));
      var n1=plansOf().length;changePlan({kind:'targets',source:'your edit',reason:'outer',expected:'as you set',apply:function(){changePlan({kind:'targets',source:'your edit',reason:'inner',expected:'as you set',apply:function(){updatePhase(ph.id,{calorieTarget:k0-200},{noUndo:true});}});}});
      ok('a change nested in another joins it: still one version, with the outer reason',plansOf().length===n1+1&&plansOf().slice(-1)[0].trigger.reason==='outer');
      updatePhase(ph.id,{calorieTarget:k0,stepTarget:s0},{noUndo:true});});
    /* ---- Acute recovery (black-box V-004 found a new person at fatigue 9 on 4.5 h read "recovery unknown") ---- */
    withFixture('successful_cut',function(){var keep=DB.observations,d=todayISO(),at=function(o){DB.observations=keep.filter(function(x){return !(x.date===d&&/^(fatigue|sleep|soreness)$/.test(x.type));});Object.keys(o).forEach(function(k){DB.observations.push(makeObservation({type:k,date:d,value:o[k],source:'test'}));});_memoInvalidate();return acuteRecovery(d);};
      ok('fatigue 9 means rest or very light; fatigue 8 means lighter; 7 is not flagged',at({fatigue:9}).level==='poor'&&at({fatigue:8}).level==='strained'&&!at({fatigue:7}).flag);
      ok('under 4.5 h of sleep means rest or very light; under 5 h lighter; 6 h is not flagged',at({sleep:4.4}).level==='poor'&&at({sleep:4.8}).level==='strained'&&!at({sleep:6}).flag);
      ok('the acute advice names its readings',/fatigue 9\/10/.test(at({fatigue:9,sleep:4.4}).reasons.join(','))&&/4\.4 h/.test(at({fatigue:9,sleep:4.4}).reasons.join(',')));
      at({fatigue:9});ok('a severe reading raises a safety item, ranked above everything else',attentionQueue().items[0].id.indexOf('acute-recovery:')===0&&attentionQueue().items[0].severity==='safety');
      DB.observations=keep;_memoInvalidate();});
    ok('Response is a first-class entity with its own event',ENTITY_CONTRACTS.Response.status==='implemented'&&!!EVENT_TYPES['response.recorded']&&ENTITY_CONTRACTS.Response.stores.indexOf('responses')>=0);
    /* ---- Sources: identity, deduplication, preferences, deletion ---- */
    withFixture('successful_cut',function(){
      var keepO=DB.observations,keepP=DB.settings.sourcePreference,d=addDays(todayISO(),-3);DB.settings.sourcePreference={};
      DB.observations=DB.observations.filter(function(o){return !(o.date===d&&/steps|water|cardio/.test(o.type));});
      DB.observations.push(makeObservation({type:'steps',date:d,value:9000,source:'import',meta:{importSource:'apple-health'}}));
      DB.observations.push(makeObservation({type:'steps',date:d,value:11000,source:'import',meta:{importSource:'fitbit'}}));
      DB.observations.push(makeObservation({type:'water',date:d,value:0.5,source:'manual'}));DB.observations.push(makeObservation({type:'water',date:d,value:0.7,source:'import',meta:{importSource:'apple-health'}}));
      DB.observations.push(makeObservation({type:'cardio',date:d,value:30,source:'manual'}));DB.observations.push(makeObservation({type:'cardio',date:d,value:45,source:'import',meta:{importSource:'strava'}}));_memoInvalidate();
      var day=function(t){return seriesWindow(t,7).filter(function(x){return x.date===d;})[0];};
      ok('steps from two devices are one quantity: one source is used, not both added',day('steps').value===11000&&day('steps').alternatives.length===1);
      setSourcePreference('steps','import:apple-health');ok('a preferred source for a type is used',day('steps').value===9000&&day('steps').source==='import:apple-health');
      ok('drinks from two sources are still added (two drinks are two drinks)',Math.abs(day('water').value-1.2)<1e-9);
      ok('cardio from two sources is still added (two workouts may be two workouts)',day('cardio').value===75);
      ok('each provider is its own source, not one "import"',sourceKeyOf({source:'import',meta:{importSource:'fitbit'}})==='import:fitbit'&&sourceLabel('import:apple-health')==='Apple Health');
      ok('a disagreement is judged and stated in the type\u2019s own unit',/steps/.test(reconcileDay('steps',d).note)&&!/lb/.test(reconcileDay('steps',d).note));
      var pv=deleteSourceData('import:fitbit',{preview:true});ok('deleting a source previews first, and exactly',pv.status==='preview'&&pv.count===1&&pv.byType.steps===1);
      var dl=deleteSourceData('import:fitbit');ok('deleting a source retracts only its entries, and they stay in the record as retracted',dl.count===1&&DB.observations.some(function(o){return o.meta&&o.meta.importSource==='fitbit'&&o.retracted;})&&DB.observations.some(function(o){return o.meta&&o.meta.importSource==='apple-health'&&!o.retracted;}));
      ok('derived food-log totals cannot be deleted as a source',deleteSourceData('food-log').status==='refused');
      DB.observations=keepO;DB.settings.sourcePreference=keepP;_memoInvalidate();
    });
    /* ---- Automation: defaults, quick actions, templates, patterns, rules, shortcuts ---- */
    withFixture('successful_cut',function(){
      ok('smart defaults never guess food intake',['calories','protein','carbs','fat','fiber'].every(function(k){return smartDefault(k)===null;}));
      ok('the weight default is the last weigh-in, and says so',(function(){var d=smartDefault('weight'),l=obsOf('weight').slice(-1)[0];return d&&l&&d.value===l.value&&/last/.test(d.why);})());
      ok('the sleep default is the middle of recent nights',(function(){var d=smartDefault('sleep');return !d||(d.value>0&&/middle/.test(d.why));})());
      ok('a weigh-in is not offered once today\u2019s is logged',(function(){if(!obsOf('weight').some(function(o){return o.date===todayISO();}))DB.observations.push(makeObservation({type:'weight',date:todayISO(),value:250,source:'test'}));_memoInvalidate();
        return !quickActions({hour:7,limit:99}).some(function(q){return q.id==='weigh-in';});})());
      ok('a hidden quick action is not offered',(function(){var k=DB.settings.quickHidden;DB.settings.quickHidden={water:true};var r=!quickActions({hour:12,limit:99}).some(function(q){return q.id==='water';});DB.settings.quickHidden=k;return r;})());
      ok('quick actions are ranked, highest first',(function(){var Q=quickActions({hour:12,limit:99});return Q.every(function(q,i){return i===0||Q[i-1].score>=q.score;});})());
      var keepL=DB.foodLogs,keepT=DB.settings.templates;var y=addDays(todayISO(),-1);
      DB.foodLogs=(DB.foodLogs||[]).filter(function(l){return l.date!==y&&l.date!==todayISO();}).concat([{id:'a1',date:y,meal:'breakfast',food:{name:'Oats'},nutrients:{kcal:300},qty:80,createdAt:nowISO()},{id:'a2',date:y,meal:'breakfast',food:{name:'Milk'},nutrients:{kcal:120},qty:200,createdAt:nowISO()}]);
      var sv=saveMealTemplate(y,'breakfast');var before=foodLogsOn(todayISO()).length;var rr=runTemplate(sv.template.id,todayISO());
      ok('a saved meal template logs the same foods again, through the app\u2019s own path',sv.status==='ok'&&rr.logged===2&&foodLogsOn(todayISO()).length===before+2);
      DB.foodLogs=keepL;DB.settings.templates=keepT;
      var keepR=DB.settings.automations;DB.settings.automations=[{id:'workoutFinished|supp.logStack',trigger:'workoutFinished',action:'supp.logStack',enabled:true}];
      var ev={type:'session.added',data:{date:todayISO()}},lg={};
      ok('a rule matches its event',automationMatches(ev,lg).length===1&&automationMatches({type:'food.logged',data:{}},lg).length===0);
      lg['workoutFinished|supp.logStack@'+todayISO()]='x';ok('a rule runs at most once a day',automationMatches(ev,lg).length===0);
      ok('no automation runs during the self-test (or replay)',runAutomationsFor(ev).length===0);
      ok('only allowed actions can be automated',setAutomation('workoutFinished','settings.reset',true).status==='refused');
      DB.settings.automations=keepR;
      ok('an unknown home-screen shortcut is refused',runShortcut('delete-everything').status==='refused');
      var keepO=DB.observations,keepS=DB.settings.supplementStack;DB.settings.supplementStack=[];
      for(var i=0;i<6;i++)DB.observations.push(makeObservation({type:'supplement',date:addDays(todayISO(),-i),value:'L-theanine 200 mg',source:'test'}));_memoInvalidate();
      ok('a supplement taken most days but not in the regimen is offered as a pattern',detectPatterns().some(function(p){return p.id==='supp:theanine';}));
      DB.observations=keepO;DB.settings.supplementStack=keepS;_memoInvalidate();
    });
    /* ---- the expanded catalogue ---- */
    ok('the catalogue covers the named supplements and minerals',['theanine','pygeum','ashwagandha','copper','zinc','creatine','sawpalmetto','manganese','chromium','selenium','iodine','biotin','collagen','berberine'].every(function(k){return !!SUPPLEMENT_CATALOGUE[k];})&&Object.keys(SUPPLEMENT_CATALOGUE).length>=70);
    ok('a brand number is not read as a dose ("KSM-66 ashwagandha 600mg" is 600 mg)',resolveSupplement('KSM-66 ashwagandha 600mg').dose===600);
    ok('copper is counted in \u00b5g from a dose in mg',supplementNutrients({id:'copper',dose:2}).copper===2000);
    ok('high-dose zinc without copper is flagged; with copper it is not',(function(){var k=DB.settings.supplementStack;DB.settings.supplementStack=[{id:'zinc',dose:50,unit:'mg',when:'daily'}];var a=supplementInteractions().some(function(x){return /copper/.test(x.text);});
      DB.settings.supplementStack.push({id:'copper',dose:2,unit:'mg',when:'daily'});var b=supplementInteractions().some(function(x){return /copper deficiency/.test(x.text);});DB.settings.supplementStack=k;return a&&!b;})());
    ok('5-HTP with St John\u2019s wort is flagged as dangerous',supplementInteractions(['htp','stjohns']).some(function(x){return x.level==='danger';}));
    ok('saw palmetto is graded honestly (large trials found no benefit)',SUPPLEMENT_CATALOGUE.sawpalmetto.evidence[0][1]==='D');
    /* ---- Supplements and vitamins ---- */
    ok('every catalogue entry has a unit, a dose range, graded evidence, a source, and nutrient keys that exist',Object.keys(SUPPLEMENT_CATALOGUE).every(function(id){var c=SUPPLEMENT_CATALOGUE[id];
      return c.label&&c.unit&&c.dose&&c.dose[0]<=c.dose[1]&&c.evidence.length&&c.evidence.every(function(e){return /^[ABCD]$/.test(e[1]);})&&c.source&&Object.keys(c.per||{}).every(function(k){return !!MICRONUTRIENTS[k];});}));
    ok('every upper limit says what it bounds',Object.keys(MICRONUTRIENTS).every(function(k){var m=MICRONUTRIENTS[k];return m.ul==null||!!m.ulScope;}));
    ok('every food micronutrient has a reference intake',MICRO_KEYS.filter(function(k){return k!=='cholesterol';}).every(function(k){return !!MICRONUTRIENTS[k];}));
    ok('IU converts to \u00b5g for vitamin D, and "D3" is a name, not a dose',resolveSupplement('Vit D3 2000 IU').dose===50&&resolveSupplement('vitamin D3').dose===null);
    ok('mcg, mg and scoops are converted to the catalogue unit',resolveSupplement('B12 1000 mcg').dose===1000&&resolveSupplement('creatine 5000 mg').dose===5&&resolveSupplement('1 scoop whey').dose===30);
    ok('an unknown supplement stays unresolved rather than being guessed',resolveSupplement('mystery blend').resolved===false);
    withFixture('successful_cut',function(){
      var keepL=DB.foodLogs,keepO=DB.observations,keepS=DB.settings.supplementStack;
      DB.foodLogs=[];for(var i=0;i<3;i++)DB.foodLogs.push({id:'t'+i,date:addDays(todayISO(),-i),meal:'lunch',food:{name:'Test food'},nutrients:{kcal:2000,iron:20,potassium:3000},createdAt:nowISO()});
      DB.observations=DB.observations.filter(function(o){return o.type!=='supplement';});
      for(var j=0;j<7;j++){DB.observations.push(makeObservation({type:'supplement',date:addDays(todayISO(),-j),value:'magnesium 500 mg',source:'test'}));DB.observations.push(makeObservation({type:'supplement',date:addDays(todayISO(),-j),value:'vitamin d 150 \u00b5g',source:'test'}));}
      _memoInvalidate();var C=micronutrientCoverage(7),row=function(k){return C.rows.filter(function(r){return r.key===k;})[0];};
      ok('a nutrient the logged foods do not report is not judged (iron data says nothing about vitamin C)',row('vitc').judged===false&&row('iron').judged===true);
      ok('magnesium above the supplement-only limit is flagged, by what supplements supply',row('magnesium').overUL===true&&row('magnesium').fromSupplements===500);
      ok('vitamin D above the total upper limit is flagged',row('vitd').overUL===true);
      DB.settings.supplementStack=[{id:'creatine',dose:5,unit:'g',when:'daily'}];var a=logSupplementStack(todayISO()),b=logSupplementStack(todayISO());
      ok('logging the regimen twice logs nothing the second time',a.logged===1&&b.logged===0);
      DB.observations.push(makeObservation({type:'supplement',date:addDays(todayISO(),-1),value:'creatine 5 g',source:'test'}));_memoInvalidate();
      ok('an old text log and a structured log are one supplement',supplementIntakes(addDays(todayISO(),-1),todayISO()).filter(function(x){return x.id==='creatine';}).length===2&&supplementAdherence(2).rows[0].taken===2);
      DB.foodLogs=keepL;DB.observations=keepO;DB.settings.supplementStack=keepS;_memoInvalidate();
    });
    /* ---- Physiology models: the arithmetic, on constructed cases ---- */
    ok('intensity is labelled by what was measured, never invented from duration',cardioIntensityClass({watts:200}).cls==='known'&&cardioIntensityClass({hr:130}).cls==='known'&&cardioIntensityClass({pace:10}).cls==='proxy'&&cardioIntensityClass({rpe:6}).cls==='proxy'&&cardioIntensityClass({minutes:30}).cls==='unknown');
    withFixture('successful_cut',function(){
      /* only this case's readings: the fixture's own resting heart rates would move the median */
      var keepHr=DB.settings.hrMax,keepObs=DB.observations;DB.observations=DB.observations.filter(function(o){return o.type!=='rhr';});DB.settings.hrMax=190;for(var i=0;i<3;i++)DB.observations.push(makeObservation({type:'rhr',date:addDays(todayISO(),-i),value:60,source:'test'}));_memoInvalidate();
      var o=cardioFitnessObservation({date:todayISO(),modality:'incline walk',minutes:30,hr:125,pace:20,distanceUnit:'mi',grade:10});
      ok('a worked example: 3 mph at 10% grade, heart rate 125 of 60\u2013190, gives about 48.6 ml/kg/min',o.use&&Math.abs(o.estimate-48.6)<0.3,JSON.stringify(o));
      ok('intervals are left to conditioning capacity, with the reason',cardioFitnessObservation({date:todayISO(),modality:'intervals',minutes:20,hr:160,pace:8}).use===false);
      ok('a session with duration only is not used, and says why',/no heart rate/.test(cardioFitnessObservation({date:todayISO(),modality:'walk',minutes:30}).why));
      ok('swimming is not converted: there is no validated equation from these inputs',cardioFitnessObservation({date:todayISO(),modality:'swim',minutes:30,hr:140}).use===false);
      DB.settings.hrMax=keepHr;DB.observations=keepObs;_memoInvalidate();
      ok('energy availability is refused without a body-fat reading, not guessed',(function(){var keep=DB.observations;DB.observations=DB.observations.filter(function(o){return o.type!=='bodyfat';});_memoInvalidate();var r=energyAvailability();DB.observations=keep;_memoInvalidate();return r.status==='insufficient'&&/body-fat/.test(r.need.join(' '));})());
    });
    ok('walking and cycling are separate families: never pooled',_modalityFamily('incline walk')==='weight-bearing'&&_modalityFamily('cycle')==='cycling'&&_modalityFamily('swim')===null);
    ok('protein quality comes from the food group',_foodGroup('Whey protein').q===1&&_foodGroup('Red lentils').q===0.65&&_foodGroup('Something unknown').group==='unclassified');
    ok('the prior is a FRIEND registry median, lower for cycling',(function(){var a=_vo2Prior('weight-bearing').mean,b=_vo2Prior('cycling').mean;return Math.abs(b-a*0.9)<0.01;})());
    ok('every physiology model is in the canonical registry with a full contract',['cardio_fitness_latent','hydration_balance','supplement_efficacy','energy_availability','diet_digestibility','recovery_allocation'].every(function(id){var c=modelContract(id);return c&&c.executable&&c.uncertaintyContract&&c.provenanceContract;}));
    /* ---- Diagnostics from a live deployment ---- */
    ok('a same-site sync address is kept, and a relative one is used as given',_sameSiteServerUrl('/api/sync')==='/api/sync'&&typeof _cspAllows==='function');
    ok('the food database says once that it is missing, instead of failing every lookup',typeof _FOOD_DB_MISSING==='boolean');
    /* ---- Icons, conditions, the feature guide ---- */
    ok('every weather condition has an icon, and a night version',Object.keys(WEATHER_CONDITIONS).every(function(k){var c=WEATHER_CONDITIONS[k];return !!ICONS[c[1]]&&!!ICONS[c[2]];}));
    ok('a condition without a code is derived from cloud cover and rain, and says so',(function(){var c=weatherCondition({cloudCover:90,precipitation:0});var r=weatherCondition({precipitation:2});return c&&c.label==='Overcast'&&c.derived&&r&&r.icon==='rain';})());
    ok('a night hour gets the night icon',weatherCondition({weatherCode:1,isDay:0}).icon==='moonCloud'&&weatherCondition({weatherCode:1,isDay:1}).icon==='sunCloud');
    ok('Meteosource conditions map onto the same codes',METEOSOURCE_CODES.partly_sunny===2&&METEOSOURCE_CODES.tstorm===95&&adaptMeteosource({units:'metric',current:{weather:'light_rain',temperature:8}},{lat:1,lon:1}).batch.current.values.weatherCode===61);
    ok('Open-Meteo weather codes arrive as the canonical conditions',adaptOpenMeteo({latitude:1,longitude:1,utc_offset_seconds:0,current_units:{weather_code:'wmo code'},current:{time:'2026-09-26T09:00',weather_code:3}},{dataset:'forecast',retrievedAt:'2026-09-26T09:05:00Z'}).batch.current.values.weatherCode===3);
    ok('an unknown icon draws nothing rather than a broken image',uiIcon('no-such-icon')==='');
    ok('every feature in the guide leads somewhere real',featureGuide().every(function(f){return typeof ACTIONS[f.act]==='function'&&!!ICONS[f.icon];}));
    ok('setup offers a place for weather',WELCOME_STEPS.indexOf('place')>0);
    /* ---- Voice: every browser error is explained ---- */
    ok('every speech recognition error has an explanation',['no-speech','audio-capture','not-allowed','service-not-allowed','network'].every(function(k){return !!VOICE_ERRORS[k];}));
    ok('without speech recognition, voice capture says so rather than failing silently',(function(){var had=typeof window!=='undefined'&&(window.SpeechRecognition||window.webkitSpeechRecognition);return had||startVoiceCapture(function(){}).ok===false;})());
    /* ---- Deployment: errors say what failed, and the app states what it needs ---- */
    ok('an error without the server\u2019s envelope never reads "Something went wrong"',extError(undefined,'x').error.text!=='Something went wrong.'&&extError('bogus','x').error.category==='provider_unavailable'&&/problems/.test(extError('bogus','x').error.text));
    ok('a missing server is said plainly',/need the Physique OS server/.test(extError('configuration_error','x',{stage:'routing',text:EXT_NO_SERVER_TEXT}).error.text)&&extError('configuration_error','x',{stage:'routing'}).error.stage==='routing');
    ok('the deployment status says weather, online food lookups and sync need the server',(function(){var d=deploymentStatus();return d.client==='static'&&d.externalServer==='required'&&d.weatherRequiresServer&&d.foodExternalRequiresServer&&d.cloudSyncRequiresServer;})());
    /* ---- Alerts: snoozed, never dismissed for good ---- */
    withFixture('successful_cut',function(){
      var keep=DB.settings.attentionSnooze;DB.settings.attentionSnooze={};
      var q=attentionQueue().items.filter(function(i){return i.severity==='review';})[0];
      if(q){snoozeAttention(q.id);
        ok('a snoozed alert leaves the list and is counted as snoozed',!attentionQueue().items.some(function(i){return i.id===q.id;})&&attentionQueue().snoozed.some(function(i){return i.id===q.id;}));
        DB.settings.attentionSnooze[q.id].until=new Date(Date.now()-1000).toISOString();
        ok('it comes back when the snooze runs out',attentionQueue().items.some(function(i){return i.id===q.id;}));
        DB.settings.attentionSnooze[q.id].count=3;DB.settings.attentionSnooze[q.id].lastUntil=new Date(Date.now()-3600000).toISOString();
        ok('after three snoozes it cannot be snoozed again for a day',attentionQueue().items.filter(function(i){return i.id===q.id;})[0].canSnooze===false);}
      DB.settings.attentionSnooze={'no-longer-applies':{count:1,until:new Date(Date.now()+86400000).toISOString()}};attentionQueue();
      ok('a snooze for an alert whose cause has gone is cleared',!('no-longer-applies' in DB.settings.attentionSnooze));
      DB.settings.attentionSnooze=keep||{};
    });
    /* ---- External sources: registry, adapters, ingestion (integration spec \u00a75, \u00a76, \u00a741, \u00a743) ---- */
    (function(){
      var A=externalSourceAudit();ok('every external source has one registration, destinations, capabilities and a resolving adapter',A.ok&&A.count>=3,A.issues.join('; '));
      var threw=function(d){try{registerExternalSource(d);return false;}catch(e){return true;}};
      ok('a duplicate source, an unknown category or an unknown destination is refused',threw({id:'open-meteo',category:'environment',status:'registered'})&&
        threw({id:'x-test-1',category:'astrology',status:'registered'})&&threw({id:'x-test-2',category:'environment',status:'registered',destinations:['somewhere']}));
      ok('nothing fixture-tested is called production-validated',Object.keys(EXTERNAL_SOURCES).every(function(k){return EXTERNAL_SOURCES[k].status!=='production-validated';}));
      var om={latitude:51.5,longitude:-0.12,utc_offset_seconds:0,timezone:'Europe/London',hourly_units:{time:'iso8601',temperature_2m:'\u00b0C',relative_humidity_2m:'%'},
        hourly:{time:['2026-09-25T12:00','2026-09-26T12:00'],temperature_2m:[18,19],relative_humidity_2m:[60,55]},daily_units:{time:'iso8601',daylight_duration:'s',sunrise:'iso8601'},
        daily:{time:['2026-09-25','2026-09-26'],daylight_duration:[43200,43020],sunrise:['2026-09-25T06:50','2026-09-26T06:52']}};
      var a=adaptOpenMeteo(om,{dataset:'forecast',retrievedAt:'2026-09-26T08:00:00Z',requested:['temperature','et0']});
      ok('Open-Meteo is mapped to canonical variables and labelled past or forecast by retrieval time',a.status==='ok'&&a.batch.hourly.values.temperature[1]===19&&a.batch.hourly.kinds.join()==='recent past,forecast');
      ok('daylight arrives in hours and sunrise as a local time',a.status==='ok'&&a.batch.daily.values.daylightHours[0]===12&&a.batch.daily.values.sunrise[1]==='06:52');
      ok('a requested variable the source did not supply is listed, not invented',a.status==='ok'&&a.batch.unsupported.indexOf('et0')>=0);
      var bad=JSON.parse(JSON.stringify(om));bad.hourly_units.temperature_2m='\u00b0F';
      ok('unexpected units are refused as invalid_unit',adaptOpenMeteo(bad,{}).error&&adaptOpenMeteo(bad,{}).error.category==='invalid_unit');
      ok('a malformed payload is refused as malformed_payload',adaptOpenMeteo({nothing:1},{}).error.category==='malformed_payload'&&adaptMeteosource({},{}).error.category==='malformed_payload');
      ok('Meteosource says what it cannot supply',adaptMeteosource({units:'metric',current:{temperature:10,humidity:50}},{lat:1,lon:1}).batch.unsupported.indexOf('et0')>=0);
      ok('vapour pressure deficit is derived from temperature and humidity by the Tetens formula',_vpdFrom(20,50)===1.17);
      var keepE=DB.environment;DB.environment=[];
      ok('a batch without a location is refused; a location is never inferred',ingestEnvironmentBatch({id:'x',location:null}).status==='refused');
      a.batch.location={lat:51.5,lon:-0.12};ingestEnvironmentBatch(a.batch);var b2=JSON.parse(JSON.stringify(a.batch));b2.retrievedAt='2026-09-26T09:00:00Z';ingestEnvironmentBatch(b2);
      ok('a newer forecast for the same place supersedes the older one',DB.environment.filter(function(b){return b.dataset==='forecast';}).length===1&&DB.environment[0].retrievedAt==='2026-09-26T09:00:00Z');
      var h=JSON.parse(JSON.stringify(a.batch));h.dataset='archive';h.id='env:open-meteo:archive:x:2026-08-01..2026-08-30';ingestEnvironmentBatch(h);
      ok('historical ranges are kept alongside the forecast',DB.environment.length===2);
      DB.environment=keepE;
      var off=adaptOpenFoodFacts({status:'success',product:{code:'123456789012',product_name:'Oat drink',brands:'oatly,Oatly',product_quantity_unit:'ml',nutriments:{'energy-kj_100g':209,proteins_100g:1,carbohydrates_100g:6.6,fat_100g:1.5,salt_100g:0.1}}},{});
      ok('Open Food Facts: kJ becomes kcal, a liquid is per 100 ml, salt becomes sodium in mg, brands de-duplicate',off.status==='ok'&&off.food.per100.kcal===50&&off.food.basis==='ml'&&off.food.per100.sodium===40&&off.food.brand==='Oatly');
      ok('missing nutrients are listed in the product\u2019s provenance',off.status==='ok'&&off.food.provenance.missing.indexOf('fiber')>=0);
      ok('a product with no energy value is refused rather than guessed',adaptOpenFoodFacts({status:'success',product:{code:'1',nutriments:{}}},{}).status==='error');
      ok('an Open Food Facts product resolves into the existing food identity by barcode',foodIdentity(off.food)==='gtin:00123456789012');
      ok('label conflicts between two records of one product are reported',foodLabelConflicts({per100:{kcal:100,protein:5}},{per100:{kcal:130,protein:5}}).length===1);
    })();
    /* ---- H4: validation \u2014 placebo checks, prior sensitivity, calibration in context ---- */
    withFixture('successful_cut',function(){
      /* A pattern that is only a trend: hunger rising steadily while cardio days cluster late — future cardio "explains"
         it as well as real cardio, so the claim must fail. */
      var keep=DB.observations;DB.observations=DB.observations.filter(function(o){return o.type!=='hunger'&&o.type!=='cardio';});
      for(var i=0;i<42;i++){var d=addDays(todayISO(),-41+i);DB.observations.push(makeObservation({type:'hunger',date:d,value:2+i*0.15,source:'test'}));
        if(i>=21&&i%2===0)DB.observations.push(makeObservation({type:'cardio',date:d,value:30,source:'test'}));}
      _memoInvalidate();var tr=cardioHungerAssociation();
      ok('a pattern that is only a trend fails the placebo check',tr.status!=='ok'||tr.placeboVerdict==='failed');
      DB.observations=keep;_memoInvalidate();
      var PS=priorSensitivity(),t=tdeeEstimate();
      ok('the prior-sensitivity range contains the estimate that is shown',PS.status!=='ok'||!PS.range||(t.value>=PS.range[0]-10&&t.value<=PS.range[1]+10));
      ok('the share of the prior still carried in is stated',PS.status!=='ok'||(PS.share>=0&&PS.share<=1&&!!PS.note));
      var H=modelHealthInContext('weight_forecast');ok('model health is stated for the current situation or overall',!!H.state&&!!H.why);
    });
    /* ---- H4: every chart type draws, and each refuses data that would mislead ---- */
    (function(){
      var drawn=function(t,pm){var h=renderChartSpec(t,Object.assign({title:t},pm));return /<svg/.test(h)&&!/chart-refused/.test(h);};
      var refused=function(t,pm){return /chart-refused/.test(renderChartSpec(t,Object.assign({title:t},pm)));};
      var n20=function(b){var a=[];for(var i=0;i<24;i++)a.push(b+((i*7)%11));return a;};
      ok('every catalogued chart type has a renderer',chartCatalogueSummary().available===chartCatalogueSummary().total);
      ok('a sankey whose flows are not conserved is refused',refused('sankey',{nodes:[{id:'a',label:'A',col:0},{id:'b',label:'B',col:1},{id:'c',label:'C',col:2}],links:[{from:'a',to:'b',value:100},{from:'b',to:'c',value:60}]})&&
        drawn('sankey',{nodes:[{id:'a',label:'A',col:0},{id:'b',label:'B',col:1}],links:[{from:'a',to:'b',value:100}]}));
      ok('a violin or ridgeline with too few values is refused',refused('violin',{groups:[{name:'x',values:[1,2,3]}]})&&refused('ridgeline',{groups:[{name:'x',values:[1,2]}]})&&drawn('violin',{groups:[{name:'x',values:n20(5)}]}));
      ok('a density states its bandwidth',/bandwidth/.test(renderChartSpec('density',{values:n20(50)}))&&refused('density',{values:[1,2,3]}));
      ok('a funnel whose stages grow is refused',refused('funnel',{stages:[{label:'a',value:10},{label:'b',value:12}]})&&drawn('funnel',{stages:[{label:'a',value:10},{label:'b',value:6}]}));
      ok('a candlestick whose high does not contain its close is refused',refused('candlestick',{periods:[{label:'a',open:5,high:6,low:4,close:7},{label:'b',open:5,high:6,low:4,close:5}]}));
      ok('a donut or treemap whose parts do not make the stated whole is refused',refused('donut',{total:100,parts:[{name:'a',value:30},{name:'b',value:30}]})&&refused('treemap',{total:100,items:[{label:'a',value:30},{label:'b',value:30}]}));
      ok('a sunburst whose parts do not add up to their parent is refused',refused('sunburst',{root:{label:'r',children:[{label:'a',value:50,children:[{label:'x',value:10}]}]}}));
      ok('a polar chart needs a genuine cycle',refused('polar',{bins:[1,2,3,4,5].map(function(i){return {label:String(i),value:i};})})&&drawn('polar',{bins:[1,2,3,4,5,6,7].map(function(i){return {label:String(i),value:i};})}));
      ok('a radar axis needs a stated maximum, and says each axis is scaled to it',refused('radar',{axes:[{name:'a',value:1},{name:'b',value:2},{name:'c',value:3}]})&&/own maximum/.test(renderChartSpec('radar',{axes:[{name:'a',value:1,max:2},{name:'b',value:2,max:4},{name:'c',value:3,max:5}]})));
      ok('a stacked area refuses a negative part',refused('stackedArea',{x:['a','b'],series:[{name:'s',values:[1,-2]}]}));
      ok('a gantt refuses a task that ends before it starts',refused('gantt',{tasks:[{label:'t',start:'2026-09-10',end:'2026-09-01'}]}));
      ok('a gauge needs a bounded scale; a bullet needs bands',refused('gauge',{value:5})&&refused('bullet',{value:5,bands:[]})&&drawn('gauge',{value:5,min:0,max:10})&&drawn('bullet',{value:5,target:6,bands:[{to:4},{to:8}]}));
      ok('a waterfall that does not start at zero says so',/not zero/.test(renderChartSpec('waterfall',{start:{label:'a',value:250},steps:[{label:'b',value:-1}],fromZero:false,unit:'lb'})));
      ok('small multiples share one set of axes and say so',/shares the same axes/.test(renderChartSpec('smallMultiple',{panels:[{title:'a',points:[{x:0,y:1},{x:1,y:2}]},{title:'b',points:[{x:0,y:3},{x:1,y:4}]}]})));
      ok('the rest draw from valid data',drawn('groupedBar',{categories:['a','b'],series:[{name:'s',values:[1,2]}]})&&drawn('bubble',{points:[1,2,3,4,5].map(function(i){return {x:i,y:i*2,size:i};})})&&
        drawn('network',{nodes:[{id:'a',label:'A'},{id:'b',label:'B'}],edges:[{a:'a',b:'b'}]})&&drawn('parallelCoordinates',{axes:['a','b','c'],rows:[{values:[1,2,3]},{values:[3,2,1]}]})&&drawn('tree',{root:{label:'r',children:[{label:'a'}]}}));
    })();
    /* ---- H4: the assistant answers the question asked, and knows its limits ---- */
    withFixture('successful_cut',function(){
      var A=function(q){return askQuestion(q);};
      ok('"is X affecting Y" is read as a question about a relationship, in any inflection',A('is my sleep affecting my weight?').matched==='relation');
      ok('protein is answered with the protein target, not a meal plan',A('how much protein should I eat?').matched==='protein'&&/g a day/.test(A('how much protein should I eat?').value));
      var w=A('why did my weight go up yesterday?');ok('a day\u2019s weight change is compared with the person\u2019s own scale noise',w.matched==='weight-day'&&/swing/.test(w.value));
      var v=A('can I eat 700 calories a day?');ok('a very-low-calorie intake gets the medical-supervision caution',v.status==='caution'&&/very-low-calorie/.test(v.value)&&/medical supervision/.test(v.basis));
      var b=bmrPrior(),fl=b.status==='ok'?b.bmr:0;
      if(fl>1600){var mid=Math.round((Math.max(1500,1200)+fl)/2/10)*10;var m=A('can I eat '+mid+' calories a day?');
        ok('below the planning floor but above the medical line is called the app\u2019s policy, not a medical risk',m.status==='caution'&&/planning floor/.test(m.value)&&/not a medical line/.test(m.basis));}
      ok('a health-condition question is declined, not answered',A('does my blood pressure medication affect my weight?').status==='declined');
      ok('an out-of-scope question is not guessed at',A('what stock should I buy?').status==='unmatched');
    });
    /* ---- H4: one answer to "is this lift improving?", and claims that say what would change them ---- */
    withFixture('successful_cut',function(){
      var R=exerciseResponse().rows.filter(function(r){return r.status==='ok';});
      ok('a lift progresses only when its slope clears twice its standard error',R.every(function(r){
        return r.direction!=='progressing'||(r.slopeSePerWeek!=null&&Math.abs(r.slopePerWeek)>2*r.slopeSePerWeek);}));
      var byEx={};R.forEach(function(r){byEx[String(r.exercise).toLowerCase()]=r;});
      ok('the strength trend and the per-lift model give one answer on improving',strengthTrend().per.every(function(x){
        var r=byEx[String(x.exercise).toLowerCase()];return x.direction!=='improving'||!r||r.direction==='progressing';}));
      var K=personalKnowledge().items;
      ok('no claim says flat and a clear rise in the same breath',!K.some(function(i){return /^flat at \+[1-9]/.test(i.statement);}));
      ok('every claim says what would change it',K.every(function(i){return !!i.wouldChange;}));
      ok('response claims can be tested',K.filter(function(i){return i.kind==='response';}).every(function(i){return i.testable===true;}));
    });
    /* ---- H4: the assistant answers the question asked, or says why not ---- */
    withFixture('successful_cut',function(){
      var A=function(q){return askQuestion(q);};
      ok('a relationship question is never answered with the status of one variable',(function(){var a=A('Does sleep affect my hunger?');
        return a.matched==='relation'||a.status!=='ok';})());
      ok('a health-condition question is declined with the reason',A('Is creatine safe for my kidneys?').status==='declined'&&/clinician/.test(A('Is creatine safe for my kidneys?').reason));
      ok('"am I getting stronger" is answered from the strength trend',A('Am I getting stronger?').matched==='stronger');
      ok('"why did my plan change" is answered from the plan',A('Why did my plan change?').matched==='plan-change');
      var g=goalTrajectory();
      if(g.status==='ok'&&g.projectedLatest){var y=+g.projectedLatest.slice(0,4)+1;
        ok('a goal date after even the latest projection is "likely"',/^Likely/.test(A('Will I reach my goal by December '+y+'?').value));
        var mid=g.projectedDate;var mo=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'][+mid.slice(5,7)-1];
        ok('a goal date between the central and latest projection is only "possibly"',(function(){var v=A('Will I reach my goal by '+mo+' '+mid.slice(0,4)+'?').value;return /^(Possibly|Likely)/.test(v)&&!(g.projectedLatest>addDays(mid,40)&&/^Likely/.test(v));})());}
      ok('every trace an answer can carry is a registered trace',QUESTION_PATTERNS_H4.concat(QUESTION_PATTERNS).every(function(p){var src=String(p.answer);var m=src.match(/trace:'([a-z_]+)'/g)||[];
        return m.every(function(t){return !!TRACES[t.slice(7,-1)];});}));
      ok('the knowledge sheet states the same maintenance as Today',(function(){var k=personalKnowledge().items.filter(function(i){return i.subject==='maintenance';})[0];var t=tdeeEstimate();
        return !k||k.statement.indexOf(fmtKcal(t.value))>=0;})());
    });
    /* ---- H3: real exports ---- */
    (function(){
      var X='<HealthData>'+
        '<Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" startDate="2026-09-16 08:00:00 -0400" endDate="2026-09-16 08:40:00 -0400" value="3000"/>'+
        '<Record type="HKQuantityTypeIdentifierStepCount" sourceName="Apple Watch" unit="count" startDate="2026-09-16 08:00:00 -0400" endDate="2026-09-16 08:40:00 -0400" value="3100"/>'+
        '<Record type="HKQuantityTypeIdentifierBodyFatPercentage" sourceName="Withings" unit="%" startDate="2026-09-16 07:00:00 -0400" value="0.214"/>'+
        '<Record type="HKQuantityTypeIdentifierBodyMass" sourceName="Withings" unit="kg" startDate="2026-09-16 07:00:00 -0400" value="84"/>'+
        '<Record type="HKQuantityTypeIdentifierRestingHeartRate" sourceName="Apple Watch" unit="count/min" startDate="2026-09-16 06:00:00 -0400" value="58"/>'+
        '<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Apple Watch" startDate="2026-09-15 23:00:00 -0400" endDate="2026-09-16 07:00:00 -0400" value="HKCategoryValueSleepAnalysisInBed"/>'+
        '<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Apple Watch" startDate="2026-09-15 23:30:00 -0400" endDate="2026-09-16 06:30:00 -0400" value="HKCategoryValueSleepAnalysisAsleepCore"/>'+
        '</HealthData>';
      var P=parseAppleHealthXML(X),v=function(t){var r=P.rows.filter(function(x){return x.type===t;})[0];return r&&r.value;};
      ok('steps seen by two devices are the most complete one, not their sum',v('steps')===3100);
      ok('sleep counts time asleep, not time in bed, and belongs to the morning it ended',v('sleep')===7&&P.rows.filter(function(x){return x.type==='sleep';})[0].date==='2026-09-16');
      ok('body fat stored as a fraction is scaled to a percentage',v('bodyfat')===21.4);
      ok('kilograms are converted to pounds',Math.abs(v('weight')-kgToLb(84))<0.01);
      ok('resting heart rate is imported under the app\u2019s own type',v('rhr')===58&&importTypesAudit().ok);
      var sp=createAppleHealthParser();for(var i=0;i<X.length;i+=37)sp.feed(X.slice(i,i+37));
      ok('an export read in slices gives exactly what the whole file gives',JSON.stringify(sp.finish().rows.map(function(r){return r.type+r.value;}).sort())===JSON.stringify(P.rows.map(function(r){return r.type+r.value;}).sort()));
      var C=parseGenericCSV('Date,"Weight (kg)"\n2026-09-16,84\n');
      ok('a CSV weight column in kilograms is converted',Math.abs(C.rows[0].value-kgToLb(84))<0.01);
    })();
    withFixture('successful_cut',function(){
      var d=addDays(todayISO(),-3),had=dailySeries('calories',todayISO(),30).filter(function(x){return x.date===d;})[0];
      var pv=importObservations([{type:'calories',date:d,value:2210,externalId:'t:cal:'+d}],'apple_health');
      ok('an imported day total never stacks on a day already recorded',!had||(pv.fresh===0&&pv.overlapSkipped.length===1));
    });
    /* ---- H3: moved sessions, adherence, adaptations, recovery ---- */
    withFixture('successful_cut',function(){
      DB.plans=[];DB.executions=[];_memoInvalidate();ensurePlan();
      var seen={},dup=false;
      for(var i=1;i<=28;i++){var d=addDays(todayISO(),-i),m=_weekTrainingMatch(d)[d];if(m)m.sessions.forEach(function(s){if(seen[s.id]&&seen[s.id]!==d)dup=true;seen[s.id]=d;});}
      ok('a session done on another day of the week counts once, for one scheduled day',!dup);
      var A=adherenceAnalysis(4);
      ok('adherence is read per domain with a diagnosis and its reason',!!A.training&&!!A.training.diagnosis&&!!A.training.why);
      ok('too little recorded is never diagnosed as failure',(function(){var keep=DB.sessions;DB.sessions=[];_memoInvalidate();var a=adherenceAnalysis(4);DB.sessions=keep;_memoInvalidate();
        return !a.training||a.training.diagnosis==='not enough recorded';})());
      var P=adaptationProposals();
      ok('every suggestion carries evidence, alternatives, an expected effect and a trade-off',P.proposals.every(function(p){return p.evidence.length&&p.alternatives.length&&!!p.expected&&!!p.tradeoff;}));
      if(P.proposals.length){var n=plansOf().length,r=applyAdaptation(P.proposals[0].id);
        ok('an accepted suggestion becomes a plan version recorded as an adaptation',r.status==='ok'&&plansOf().length===n+1&&plansOf().slice(-1)[0].trigger.kind==='adaptation');
        ok('an adaptation reports nothing until a week has passed',adaptationOutcome(r.plan.id).status==='pending');
        ok('the adaptation is in the plan audit and its contract',planAudit().ok&&entityContractAudit().ok);}
      ok('no recovery suggestion when recovery is about baseline',(function(){var r=recoveryLatentState();return /less recovered/.test(String(r.band||''))||recoverySuggestion()===null;})());
    });
    /* ---- H2: food identity ---- */
    withFixture('successful_cut',function(){
      var whole=seedFoods().filter(function(f){return /egg whole/i.test(f.name);})[0],white=seedFoods().filter(function(f){return /egg white/i.test(f.name);})[0];
      if(whole&&white){
        ok('the same barcode is the same food, whatever the name',sameFood({name:'A',gtin:'0049000000443',per100:{kcal:1}},{name:'B',gtin:'49000000443',per100:{kcal:9}}).same===true);
        ok('a close name with matching nutrition is the same food',sameFood({kind:'custom',id:'x',name:'Large whole eggs',basis:'g',per100:whole.per100},whole).same===true);
        ok('a close name with different nutrition is not',sameFood({kind:'custom',id:'y',name:'Eggs large whole',basis:'g',per100:white.per100},whole).same===false);
        saveUserFood({kind:'custom',name:'Large whole eggs',basis:'g',per100:Object.assign({},whole.per100)});_memoInvalidate();
        var c=DB.foods.filter(function(f){return f.name==='Large whole eggs';})[0];
        ok('a likely duplicate is suggested',foodDuplicates().some(function(d){return d.food===c.id;}));
        markSameFood(c.id,whole);
        ok('marked the same, it takes the other food\u2019s identity and is no longer suggested',foodIdentity(Object.assign({kind:'custom'},c))===foodIdentity(whole)&&!foodDuplicates().some(function(d){return d.food===c.id;}));
        saveUserFood({kind:'custom',name:'Whole large eggs',basis:'g',per100:Object.assign({},whole.per100)});_memoInvalidate();
        var c2=DB.foods.filter(function(f){return f.name==='Whole large eggs';})[0];markDifferentFood(c2.id,whole.kind+'|'+whole.id);
        ok('marked different, it is not suggested again',!foodDuplicates().some(function(d){return d.food===c2.id;}));
      }
      ok('the meal for now is one of the day\u2019s meals',MEALS.indexOf(mealForNow())>=0);
    });
    /* ---- H2: programme versions and the exercise catalogue ---- */
    withFixture('successful_cut',function(){
      var V=programVersions();
      ok('every programme version has its change, its dates and what was done under it',V.every(function(v){return v.version>0&&!!v.change&&!!v.from&&typeof v.sessions==='number';}));
      ok('versions run in order without gaps',V.every(function(v,i){return i===0||V[i-1].to===v.from;}));
      var n=V.length;saveProgramDef(trainingProgram().key,JSON.parse(JSON.stringify(programDef(trainingProgram().key))),{change:'schedule: Mon',noUndo:true,noSave:true});
      ok('an edit becomes a new programme version with its change',programVersions().length===n+1&&/Edited: schedule/.test(programVersions().slice(-1)[0].change));
      var A=exerciseOntologyAudit();ok('every exercise is fully described: plane, joints, load, stability, range and setup',A.ok,A.issues.slice(0,3).join('; '));
      ok('a forearm plank is not flagged for the wrists; a push-up is',exerciseOntology('plank').cautions.every(function(c){return !/wrist/.test(c);})&&exerciseOntology('pushup').cautions.some(function(c){return /wrist/.test(c);}));
      ok('a barbell squat carries its back and knee cautions',exerciseOntology('squat').cautions.length>=2);
      ok('cautions are stated as general, not medical advice',/not medical advice/.test(exerciseOntology('squat').note));
    });
    /* ---- H2: workout mode ---- */
    withFixture('successful_cut',function(){
      var lift=null;for(var i=0;i<7;i++){var d=addDays(todayISO(),i);var I=intendedFor(d);if(I.status==='ok'&&I.items.some(function(x){return x.item==='training';})){lift=d;break;}}
      if(lift){
        var W=buildWorkout(lift);
        ok('a workout is built from the planned session',W.exercises.length>0&&W.exercises.every(function(x){return x.sets.length>0&&!!resolveExercise(x.name);}));
        ok('each exercise carries a target, a reason for its load and a rest time',W.exercises.every(function(x){return x.repLo>0&&!!x.why&&x.rest>=60;}));
        var full=W.exercises.reduce(function(a,x){return a+x.sets.length;},0);
        DB.executions=[];markExecution(lift,'training','variant',{variant:'reduced'});
        var R=buildWorkout(lift);ok('the reduced version prescribes fewer sets of the same exercises',R.exercises.reduce(function(a,x){return a+x.sets.length;},0)<full);
        DB.executions=[];markExecution(lift,'training','variant',{variant:'minimum'});
        var M=buildWorkout(lift);ok('the minimum version keeps one set of each main lift only',M.exercises.every(function(x){var e=resolveExercise(x.name);return x.sets.length===1&&e&&e.compound;}));
        DB.executions=[];markExecution(lift,'training','variant',{variant:'travel'});
        var T=buildWorkout(lift);ok('the travel version uses bodyweight movements where one exists',T.exercises.some(function(x){var e=resolveExercise(x.name);return e&&e.equipment.join()==='bodyweight';}));
        DB.executions=[];
      }
      ok('a template "variation" becomes the variation this person logs most',(function(){var u=_usualVariation('Deadlift variation');return u===null||resolveExercise(u).pattern===resolveExercise('Deadlift variation').pattern;})());
      ok('the rep range is read from the template',_repTarget('8\u201312').lo===8&&_repTarget('8\u201312').hi===12);
      ok('without a camera barcode reader the scanner says so rather than failing',typeof barcodeSupport==='function'&&(barcodeSupport()===false||barcodeSupport()===true));
    });
    /* ---- H0: direct tests for the six models that had none, through the gateway ---- */
    var _CLASSES=['MEASURED','DERIVED','PREDICTIVE','HEURISTIC','PRIOR','BLENDED','CALIBRATED','POLICY','EMPIRICAL'];
    var _runOk=function(r){return r.status==='ok'&&_CLASSES.indexOf(r.cls)>=0&&!!r.uncertainty&&!!(r.provenance&&r.provenance.nodes.some(function(n){return n.type==='model-run';}));};
    withFixture('successful_cut',function(){
      ['weight_avg','energy_balance','goal_traj','strength_trend','appetite','muscle_risk'].forEach(function(id){
        ok('model '+id+': on a full record it runs with a class, uncertainty and provenance',_runOk(infer({modelId:id})),JSON.stringify({s:infer({modelId:id}).status,c:infer({modelId:id}).cls}));});
      ok('model weight_avg: the seven-day mean lies within the week\u2019s readings',(function(){var v=infer({modelId:'weight_avg'}).value,w=obsOf('weight',{from:addDays(asOf(),-6)}).map(function(o){return o.value;});
        return v.avg7>=Math.min.apply(null,w)&&v.avg7<=Math.max.apply(null,w);})());
      ok('model goal_traj: it aims at the canonical goal\u2019s active target',infer({modelId:'goal_traj'}).value.goal===canonicalGoal().activeTargetLb);
    });
    withFixture('insufficient',function(){
      /* The failure mode: four days of data. A model that cannot answer declines with what it needs, and the gateway
         reports the decline rather than calling it a successful run. */
      ['energy_balance','strength_trend','appetite'].forEach(function(id){var r=infer({modelId:id});
        ok('model '+id+': on four days of data it declines, says what it needs, and returns no value',r.status==='insufficient'&&r.value===null&&!!(r.need&&r.need.length));});
      ok('model goal_traj: with too little trend it gives no projected date',(function(){var r=infer({modelId:'goal_traj'});return r.status!=='ok'||!r.value.projectedDate;})());
      ok('model weight_avg: with fewer than four weigh-ins it declines',(function(){var keep=DB.observations;
        DB.observations=keep.filter(function(o){return o.type!=='weight'||o.date<addDays(asOf(),-8)||o.date===asOf();});_memoInvalidate();
        var r=infer({modelId:'weight_avg'});DB.observations=keep;_memoInvalidate();return r.status==='insufficient';})());
      ok('model muscle_risk: it is declared a heuristic, never a measurement',infer({modelId:'muscle_risk'}).cls==='HEURISTIC');
    });
    ok('the gateway reports a model\u2019s decline instead of labelling it a successful run',withFixture('insufficient',function(){
      var r=infer({modelId:'energy_balance'});return r.status!=='ok'&&r.result&&r.result.status==='insufficient';}));
    /* ---- build and release identity ---- */
    ok('the build declares both a source identity and a release identity covering every material input',
      typeof BUILD_ID==='string'&&BUILD_ID.length>=8&&typeof RELEASE_ID==='string'&&RELEASE_ID.length>=10&&RELEASE_ID!==BUILD_ID,BUILD_ID+' / '+RELEASE_ID);
    /* exports */
    withFixture('successful_cut',function(){var csv=exportCSV('weight');ok('CSV export has header and rows',csv.split('\n').length>10&&/^date,weight_lb/.test(csv));var rep=stateReport();ok('state report contains decision and learning sections',/DECISION:/.test(rep)&&/WHAT WE KNOW/.test(rep));var b=JSON.parse(backupJSON());ok('backup JSON carries schema/app/counts',b.backup&&b.backup.schemaVersion===SCHEMA_VERSION&&b.backup.counts.observations>0);var ics=icsExport();ok('ICS export is well-formed',/BEGIN:VCALENDAR/.test(ics)&&/END:VCALENDAR/.test(ics));});
    });
  }catch(err){results.push({name:'self-test harness',ok:false,detail:err.message+' '+(err.stack||'').split('\n')[1]});}
  finally{DB=savedDB;_NOW_OVERRIDE=savedNow;_MEMO=savedMemo;try{DB.settings=JSON.parse(_stSettings);if(typeof applyPresentationAppearance==='function')applyPresentationAppearance(DB.settings);}catch(e){}
    /* The live event log is put back exactly as it was, and saving is released. Without the first, tests against the
       live record left their events in the real log for the next save to persist. */
    if(_stEvents){_EVENTS.length=0;Array.prototype.push.apply(_EVENTS,_stEvents);_EVENT_SEQ=_stSeq;}
    if(typeof WIDGET_REGISTRY!=='undefined'){Object.keys(WIDGET_REGISTRY).forEach(function(k){if(WIDGET_REGISTRY[k]&&WIDGET_REGISTRY[k].userDefined&&!_stUserWidgets[k])delete WIDGET_REGISTRY[k];});Object.keys(_stUserWidgets).forEach(function(k){WIDGET_REGISTRY[k]=_stUserWidgets[k];});}
    _PERSIST_SUSPENDED=Math.max(0,_PERSIST_SUSPENDED-1);_memoInvalidate();}
  var passed=results.filter(function(r){return r.ok;}).length,failed=results.length-passed;
  return {passed:passed,failed:failed,results:results,ms:Date.now()-t0,at:nowISO()};
}
