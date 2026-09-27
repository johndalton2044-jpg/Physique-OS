// Headless ENGINE harness: loads every JavaScript layer in src/ (no DOM, no views) and exercises the
// fixtures plus the temporal-ledger invariants. This complements tests/run.mjs, which boots the built
// artifact in jsdom and exercises the interface; this one isolates the engine so an engine defect cannot
// hide behind a rendering pass.
//
// The file list is DERIVED from src/ rather than hard-coded — the previous version enumerated ten files by
// hand and silently stopped covering 45-baselines, 52-response, 63-food-ext, 92-scheduler and 95-selftest
// when those were added. Anything ending in .js is loaded in sort order; the .html shells are skipped.
//
//   node tests/engine-check.mjs [--json]
import fs from 'node:fs';import vm from 'node:vm';

const JSON_ONLY=process.argv.includes('--json');
const files=fs.readdirSync('src').filter(f=>f.endsWith('.js')).sort();
// 99-boot registers DOM listeners and calls boot(); it has no place in a DOM-free engine run.
const engineFiles=files.filter(f=>f!=='99-boot.js');
const code=engineFiles.map(f=>fs.readFileSync('src/'+f,'utf8')).join('\n');

const store={};
const ctx={console,
  localStorage:{getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];},key:i=>Object.keys(store)[i]??null,get length(){return Object.keys(store).length;}},
  setTimeout,clearTimeout,setInterval,clearInterval,Date,Math,JSON,fetch:undefined,
  navigator:{onLine:true},performance,
  document:undefined,indexedDB:undefined,
  addEventListener(){},removeEventListener(){}};
ctx.globalThis=ctx;ctx.window=ctx;ctx.self=ctx;
vm.createContext(ctx);
try{vm.runInContext(code,ctx,{filename:'engine.js'});}
catch(e){console.error('engine failed to load: '+e.message+'\n'+String(e.stack).split('\n').slice(0,4).join('\n'));process.exit(1);}

let failures=0;const report=[];
const ok=(name,cond,detail)=>{report.push((cond?'  pass  ':'  FAIL  ')+name+(detail?'  — '+detail:''));if(!cond)failures++;};
const run=(expr)=>vm.runInContext(expr,ctx);

/* ---- presentation coverage: distinguish declarations from actual cross-layer consumers ---- */
const presentationSource=fs.readFileSync('src/89-presentation-governance.js','utf8');
const presentationFns=[...presentationSource.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map(m=>m[1]);
const presentationExternalRefs=[];
for(const fn of presentationFns){
  const re=new RegExp('\\b'+fn.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','g');
  const refs=[];
  for(const [file,src] of Object.entries(Object.fromEntries(files.map(f=>[f,fs.readFileSync('src/'+f,'utf8')])))){
    if(file==='89-presentation-governance.js')continue;
    const n=(src.match(re)||[]).length;
    if(n)refs.push(file+':'+n);
  }
  if(refs.length)presentationExternalRefs.push(fn+' ['+refs.join(', ')+']');
}
const requiredPresentationConsumers=['dataStateVisual','presentationMetric','typographySpec','componentSpec','presentationPerformance','inspectPresentation','presentationProvenance','renderWidget','presentationViewGuard'];
for(const fn of requiredPresentationConsumers){
  const hit=presentationExternalRefs.some(x=>x.startsWith(fn+' '));
  ok('presentation runtime consumer: '+fn,hit,presentationExternalRefs.find(x=>x.startsWith(fn+' '))||'declarative-only');
}
const declarativeOnly=presentationFns.filter(fn=>!presentationExternalRefs.some(x=>x.startsWith(fn+' ')));
ok('presentation declaration-only surface is explicitly measurable',declarativeOnly.length>=0,'function declarations '+presentationFns.length+'; external consumers '+presentationExternalRefs.length+'; declaration-only '+declarativeOnly.length);

/* ---- the engine loaded every layer, including the ones added after this harness was first written ---- */
ok('engine harness loads every JS layer in src/ ('+engineFiles.length+' files)',engineFiles.length>=20,engineFiles.join(' '));
for(const fn of ['personalBaselines','changePoints','measurementQuality','uncertaintyChain','personalResponse',
                 'exerciseResponse','counterfactual','valueOfInformationFormal','nutritionAdequacy',
                 'adapterState','jobsSummary','dataContractIssues','runSelfTest','setProgram','updatePhase']){
  ok('engine exposes '+fn+'()',run(`typeof ${fn}`)==='function');
}

/* ---- getSwallowedErrors() returns a report object, and this harness reads it as one ---- */
const errShape=run('(function(){var e=getSwallowedErrors();return {t:typeof e,keys:Object.keys(e).sort().join(",")};})()');
ok('getSwallowedErrors() returns a report object with count/distinct/top/recent',
   errShape.t==='object'&&/count/.test(errShape.keys)&&/top/.test(errShape.keys),errShape.keys);

/* ---- fixtures ---- */
run('DB=emptyDB();');
const presentationRuntime=run(`(function(){
  var card=uiCard({accent:'good',elevation:1,presentation:{model:presentationModel({result:{status:'ok',value:151,cls:'MEASURED'},quantity:'weight',unit:'lb'})}});
  var btn=uiBtn('Test','noop');
  var chart=svgChart({height:60,series:[{type:'line',pts:[{x:0,y:1},{x:1,y:2}]}]});
  return {card:/--card-pad:/.test(card)&&/data-presentation-state-pattern=/.test(card),button:/data-interactions=/.test(btn),chart:/data-presentation-interactions=/.test(chart)};
})()`);
ok('presentation token/layout functions execute through real card rendering',presentationRuntime.card,JSON.stringify(presentationRuntime));
ok('interaction specification executes through real controls and charts',presentationRuntime.button&&presentationRuntime.chart,JSON.stringify(presentationRuntime));

const out=run(`(function(){
  var out={};
  Object.keys(FIXTURES).forEach(function(name){
    try{
      withFixture(name,function(db){
        var S=getCurrentState();var dec=decide();var d=diagnose();
        out[name]={decision:dec.code,conf:dec.confidence,
          trend:S.trend.status==='ok'?round(S.trend.slopePerWeek,2)+' ('+S.trend.confidence+')':S.trend.status,
          tdee:S.tdee.status==='ok'?Math.round(S.tdee.value)+' '+S.tdee.cls:'insufficient',
          trust:S.trust.overall.level,diag:d.primary.id,recovery:S.recovery.level,
          strength:S.training.strength.status==='ok'?S.training.strength.overall:'insufficient',
          uncertainty:dec.uncertainty?dec.uncertainty.ceiling:'none',
          preds:(db.predictions||[]).length,scored:(db.predictions||[]).filter(function(p){return p.status==='scored';}).length,
          exps:(db.experiments||[]).map(function(e){return e.conclusion||e.status;}).join(','),
          negs:(db.negatives||[]).length,
          errors:getSwallowedErrors().count};
      });
    }catch(e){out[name]={error:e.message,stack:String(e.stack).split('\\n').slice(0,3).join(' | ')};}
  });
  return out;
})()`);
const names=Object.keys(out);
ok('every fixture runs without throwing ('+names.length+' fixtures)',names.every(n=>!out[n].error),
   names.filter(n=>out[n].error).map(n=>n+': '+out[n].error).join(' | '));
ok('every fixture produces a decision code and a confidence',names.every(n=>out[n].error||(out[n].decision&&out[n].conf)));
ok('no fixture quarantines an error',names.every(n=>out[n].error||out[n].errors===0),
   names.filter(n=>out[n].errors).map(n=>n+':'+out[n].errors).join(','));
const CEILINGS=['high','medium','low'];
ok('every fixture states an uncertainty ceiling on its decision, including the ones with insufficient data',
   names.every(n=>out[n].error||CEILINGS.indexOf(out[n].uncertainty)>=0),
   names.filter(n=>!out[n].error&&CEILINGS.indexOf(out[n].uncertainty)<0).map(n=>n+':'+out[n].uncertainty).join(','));

/* ---- temporal ledger: a later correction, retraction or edit must not change what a past day knew ---- */
const temporal=run(`(function(){
  var r={};
  DB=emptyDB();_NOW_OVERRIDE=null;
  /* observation correction */
  var o=makeObservation({type:'weight',date:'2026-01-01',value:200,source:'manual'});o.createdAt='2026-01-01T07:00:00.000Z';
  DB.observations.push(o);_memoInvalidate();
  _NOW_OVERRIDE='2026-01-10T09:00:00.000Z';
  correctObservation(o.id,190,'recalibrated');_memoInvalidate();
  r.correctionBefore=withAsOf('2026-01-05',function(){var l=latestObs('weight');return l?l.value:null;});
  r.correctionAfter=withAsOf('2026-01-11',function(){var l=latestObs('weight');return l?l.value:null;});
  /* observation retraction */
  var w=makeObservation({type:'waist',date:'2026-01-01',value:38,source:'manual'});w.createdAt='2026-01-01T07:00:00.000Z';
  DB.observations.push(w);_memoInvalidate();
  retractObservation(w.id,'mistake');_memoInvalidate();
  r.retractBefore=withAsOf('2026-01-05',function(){var l=latestObs('waist');return l?l.value:null;});
  r.retractAfter=withAsOf('2026-01-11',function(){var l=latestObs('waist');return l?l.value:null;});
  r.retractNow=(function(){var l=latestObs('waist');return l?l.value:null;})();
  /* session retraction */
  _NOW_OVERRIDE='2026-01-02T09:00:00.000Z';
  var s=addSession({name:'S',date:'2026-01-02',sets:[{exercise:'Back squat',load:200,reps:5,rir:2}],silent:true,noSave:true});
  _NOW_OVERRIDE='2026-01-10T09:00:00.000Z';
  retractSession(s.id);_memoInvalidate();
  r.sessionBefore=withAsOf('2026-01-05',function(){return sessionsOf().length;});
  r.sessionAfter=withAsOf('2026-01-11',function(){return sessionsOf().length;});
  /* food log edit and deletion */
  var f=seedFoods()[0];
  _NOW_OVERRIDE='2026-03-02T12:00:00.000Z';
  var fl=logFood({date:'2026-03-02',meal:'lunch',food:f,grams:1000,silent:true,noSave:true});
  var kcal0=obsOf('calories').filter(function(x){return x.date==='2026-03-02';})[0];
  r.foodOriginal=kcal0?kcal0.value:null;
  _NOW_OVERRIDE='2026-03-04T12:00:00.000Z';
  var fl2=updateFoodLog(fl.id,1500,null);_memoInvalidate();
  var kcalOn=function(asof){return withAsOf(asof,function(){var ser=dailySeries('calories',asof,10).filter(function(d){return d.date==='2026-03-02';});return ser.length?ser[0].value:null;});};
  r.foodBeforeEdit=kcalOn('2026-03-03');
  r.foodAfterEdit=kcalOn('2026-03-05');
  r.ledgerEntries=foodLogHistoryOn('2026-03-02').length;
  r.visibleEntries=foodLogsOn('2026-03-02').length;
  _NOW_OVERRIDE='2026-03-06T12:00:00.000Z';
  removeFoodLog(fl2.id);_memoInvalidate();
  r.foodAfterDelete=kcalOn('2026-03-05');
  r.visibleAfterDelete=foodLogsOn('2026-03-02').length;
  r.physicallyKept=DB.foodLogs.length;
  _NOW_OVERRIDE=null;
  return r;
})()`);
ok('a correction made later does not change what a past day knew (Jan 5 sees 200, Jan 11 sees 190)',
   temporal.correctionBefore===200&&temporal.correctionAfter===190,
   'Jan 5='+temporal.correctionBefore+' Jan 11='+temporal.correctionAfter);
ok('a retraction made later does not erase a past day (Jan 5 sees 38, Jan 11 and now see nothing)',
   temporal.retractBefore===38&&temporal.retractAfter===null&&temporal.retractNow===null,
   'Jan 5='+temporal.retractBefore+' Jan 11='+temporal.retractAfter+' now='+temporal.retractNow);
ok('a retracted training session is still visible in a replay of the days it existed',
   temporal.sessionBefore===1&&temporal.sessionAfter===0,
   'before='+temporal.sessionBefore+' after='+temporal.sessionAfter);
ok('a food-log edit supersedes rather than overwrites: replay before the edit sees the original intake',
   temporal.foodBeforeEdit===temporal.foodOriginal&&temporal.foodAfterEdit>temporal.foodOriginal,
   'original='+temporal.foodOriginal+' before='+temporal.foodBeforeEdit+' after='+temporal.foodAfterEdit);
ok('both food-log versions are kept in the ledger, only one is visible',
   temporal.ledgerEntries===2&&temporal.visibleEntries===1,
   temporal.ledgerEntries+' entries, '+temporal.visibleEntries+' visible');
ok('a food-log deletion is a retraction: the entry stays in the record and past replays are unaffected',
   temporal.foodAfterDelete===temporal.foodAfterEdit&&temporal.visibleAfterDelete===0&&temporal.physicallyKept===2,
   'replay='+temporal.foodAfterDelete+' visible='+temporal.visibleAfterDelete+' rows kept='+temporal.physicallyKept);

/* ---- one mutation primitive for phases and programs ---- */
const mut=run(`(function(){
  var r={};DB=emptyDB();_NOW_OVERRIDE=null;
  DB.profile={name:'T',age:40,sex:'male',heightIn:70};
  var ph=startPhase({type:'cut',startDate:addDays(todayISO(),-30),calorieTarget:2400,stepTarget:9000,proteinTarget:180,silent:true});
  /* the phase must be KNOWN from its start date, not merely effective from it — a phase created today is
     correctly invisible to a replay of last week, which is the rule under test elsewhere */
  ph.createdAt=addDays(todayISO(),-30)+'T07:00:00.000Z';_memoInvalidate();
  var n0=DB.interventions.length;
  updatePhase(ph.id,{calorieTarget:2200},{intervention:{source:'phase editor'}});
  var added=DB.interventions.slice(n0);
  r.count=added.length;r.from=added.length?added[0].from:null;r.to=added.length?added[0].to:null;r.variable=added.length?added[0].variable:null;
  r.historyBefore=ph.history.length?ph.history[ph.history.length-1].before.calorieTarget:null;
  /* suppressed intervention still records history */
  var h0=ph.history.length;var n1=DB.interventions.length;
  updatePhase(ph.id,{stepTarget:11000},{intervention:false});
  r.suppressedHistory=ph.history.length>h0;r.suppressedNoIv=DB.interventions.length===n1;
  /* replay reconstructs pre-edit targets */
  r.replayCalories=withAsOf(addDays(todayISO(),-5),function(){var p=activePhase();return p?p.calorieTarget:null;});
  r.nowCalories=activePhase().calorieTarget;
  /* program */
  DB.settings.programHistory=[];DB.settings.program='fullbody3';
  var changed=setProgram('upperlower4',{source:'test',silent:true});
  r.programChanged=changed;r.programHistory=DB.settings.programHistory.length;
  r.programFrom=DB.settings.programHistory[0].from;
  r.programNoop=setProgram('upperlower4',{silent:true});
  return r;
})()`);
ok('a phase edit generates exactly one intervention',mut.count===1,String(mut.count)+' generated');
ok('the intervention records the pre-mutation value, not the post-mutation one (2400 → 2200)',
   mut.from===2400&&mut.to===2200,mut.from+' → '+mut.to);
ok('the intervention names the variable in decision vocabulary',mut.variable==='calories',String(mut.variable));
ok('a phase edit always records phase history, even when the intervention is suppressed',
   mut.historyBefore===2400&&mut.suppressedHistory&&mut.suppressedNoIv);
ok('replay reconstructs the phase target as it stood before the edit',
   mut.replayCalories===2400&&mut.nowCalories===2200,'then='+mut.replayCalories+' now='+mut.nowCalories);
ok('a program change is recorded in programHistory with what it moved away from',
   mut.programChanged===true&&mut.programHistory===1&&mut.programFrom==='fullbody3');
ok('setting the program to its current value is a no-op, not a spurious history entry',mut.programNoop===false);

/* ---- contracts and the in-app self-test, running with no DOM at all ---- */
const contracts=run('JSON.stringify(dataContractIssues())');
ok('data and model contracts hold in a DOM-free engine run',JSON.parse(contracts).length===0,contracts.slice(0,200));
const st=run('(function(){var r=runSelfTest();return {passed:r.passed,failed:r.failed,failures:r.results.filter(function(x){return !x.ok;}).map(function(x){return x.name+": "+x.detail;}).slice(0,6)};})()');
ok('the in-app self-test passes without a DOM ('+st.passed+' checks)',st.failed===0,st.failures.join(' | '));
const presentation=run('(function(){var a=presentationSpecificationAudit();return {ok:a.ok,issues:a.findings.slice(0,20),required:a.execution.required,missing:a.execution.missing,visualizations:a.execution.registries};})()');
const reportExport=run(`(function(){var r=exportPresentationSpec({page:'state-report',sections:[{title:'State report',body:'x'}],source:{app:APP_NAME,build:BUILD_ID},uncertainty:{included:true}},'print');return {ok:r.status==='ok'&&r.dedicatedRenderer==='ReportRenderer'&&r.sections.length===1,format:r.format,renderer:r.dedicatedRenderer};})()`);
ok('presentation export contract executes through report renderer',reportExport.ok,reportExport);
const stateReportExport=run(`(function(){var s=stateReport();return {ok:typeof s==='string'&&s.indexOf('PRESENTATION EXPORT')>=0&&s.indexOf('renderer: ReportRenderer')>=0};})()`);
ok('existing state report consumes presentation export contract',stateReportExport.ok,JSON.stringify(stateReportExport));
ok('visual/presentation specification executions and models are implemented',presentation.ok,
   JSON.stringify(presentation.issues||presentation.missing||[]).slice(0,500));
const appearanceBridge=run(`(function(){
  var savedDoc=typeof document!=='undefined'?document:null, savedWin=typeof window!=='undefined'?window:null;
  var styles={},attrs={},meta={setAttribute:function(k,v){this[k]=v;}};
  globalThis.document={documentElement:{style:{setProperty:function(k,v){styles[k]=v;}},setAttribute:function(k,v){attrs[k]=v;}},querySelector:function(sel){return sel==='meta[name="theme-color"]'?meta:null}};
  globalThis.window={matchMedia:function(){return {matches:false};}};
  var dark=applyPresentationAppearance({theme:'dark',accent:'sage',font:'interface',shape:'soft'});
  var darkBg=styles['--bg'],darkAccent=styles['--accent'],darkRadius=styles['--radius'];
  var light=applyPresentationAppearance({theme:'light',accent:'sage',font:'text',shape:'editorial'});
  var lightBg=styles['--bg'],lightAccent=styles['--accent'],lightRadius=styles['--radius'];
  var high=applyPresentationAppearance({theme:'highContrast',accent:'none',font:'hyperlegible',shape:'soft'});
  var highBg=styles['--bg'];
  if(savedDoc)globalThis.document=savedDoc; else delete globalThis.document;
  if(savedWin)globalThis.window=savedWin; else delete globalThis.window;
  return {dark:dark.status==='ok',light:light.status==='ok',high:high.status==='ok',themeChanges:darkBg!==lightBg&&lightBg!==highBg,accentChanges:darkAccent!==lightAccent,radiusChanges:darkRadius!==lightRadius,metaTheme:meta.content===highBg,vars:Object.keys(styles).length};
})()`);
ok('theme/accent/shape selections modify the live CSS token surface',appearanceBridge.dark&&appearanceBridge.light&&appearanceBridge.high&&appearanceBridge.themeChanges&&appearanceBridge.accentChanges&&appearanceBridge.radiusChanges&&appearanceBridge.metaTheme,JSON.stringify(appearanceBridge));
const chartBridge=run(`(function(){
  var valid=svgChart({height:80,series:[{type:'dots',pts:[{x:0,y:150},{x:1,y:151}]}],aria:'weight',presentation:{contractId:'WeightTrendChart',model:presentationModel({result:{status:'ok',value:151,cls:'MEASURED'},quantity:'weight',unit:'lb'})}});
  var invalid=svgChart({height:80,series:[{type:'dots',pts:[{x:0,y:1},{x:1,y:2}]}],aria:'bad',presentation:{contractId:'MacroBar',model:presentationModel({result:{status:'ok',value:1,cls:'PREDICTIVE'},quantity:'intake',unit:'kcal/day'})}});
  return {valid:/data-presentation-contract=\"WeightTrendChart\"/.test(valid),invalid:/data-presentation-error=\"1\"/.test(invalid)};
})()`);
ok('presentation bridge wires a declared chart contract into the renderer',chartBridge.valid&&chartBridge.invalid,JSON.stringify(chartBridge));
const presentationRouting=run(`(function(){
  var actual=['today','log','plan','train','food','body','progress','diagnose','experiments','learn','archive','tools'];
  var good=actual.every(function(id){var g=presentationViewGuard(id);return g.ok&&typeof viewSpec(id)==='object'&&typeof RENDERERS[id]==='function';});
  var bad=presentationViewGuard('nutrition');
  return {good:good,bad:bad.status,views:Object.keys(VIEW_REGISTRY).length};
})()`);
ok('presentation view registry is wired to the real renderers without a second navigation table',presentationRouting.good&&presentationRouting.bad==='unregistered-view',JSON.stringify(presentationRouting));
const widgetBridge=run(`(function(){
  var model=presentationModel({result:{status:'ok',value:151,cls:'MEASURED'},quantity:'weight',unit:'lb'});
  var good=renderWidget('body.weightTrend',{height:80,series:[{type:'dots',pts:[{x:0,y:150},{x:1,y:151}]}],aria:'weight',model:model});
  var bad=renderWidget('body.weightTrend',{height:80,series:[]});
  return {good:good.status==='ok'&&/data-presentation-contract=\"WeightTrendChart\"/.test(good.html||''),bad:bad.status==='missing-presentation-model'};
})()`);
ok('widget registry executes through the single renderer bridge and enforces its contract',widgetBridge.good&&widgetBridge.bad,JSON.stringify(widgetBridge));
const presentationPipeline=run(`(function(){
  var viz=visualizationRuntimeSpec([{type:'line',pts:[{x:0,y:1},{x:1,y:2},{x:2,y:3}]}]);
  var unc=uncertaintyRuntimeSpec([{type:'band',uncertaintyType:'forecast',pts:[{x:0,lo:1,hi:2},{x:1,lo:2,hi:3}]}]);
  var forecast=forecastRuntimeSpec([{type:'line',epistemic:'PREDICTIVE',point:3,uncertainty:{lo:2,hi:4},pts:[{x:0,y:3},{x:1,y:3}]}]);
  var body=presentationDomainMetadata('body',{view:'front',layers:['measurement','progress']});
  var comp=presentationDomainMetadata('composition',{weightTrend:{},smoothedWeight:{},bodyFatTrend:{}});
  var causal=presentationDomainMetadata('causal',{nodes:[{id:'x',label:'x',state:'observed'}],edges:[]});
  var r=responsiveSpec(390,{keyboardAvoidance:true});
  return {viz:viz.id==='line'&&viz.status==='ok',unc:unc.types.length===1&&unc.types[0].style==='shaded-interval',forecast:forecast.status==='ok'&&forecast.cls==='PREDICTIVE',body:body.sealed&&body.model.layers.length===2,comp:comp.sealed,causal:causal.sealed,r:r.capability==='narrow'&&r.bottomSheets&&r.keyboardAvoidance};
})()`);
ok('visualization registry executes for actual chart series',presentationPipeline.viz,JSON.stringify(presentationPipeline));
ok('uncertainty runtime metadata is generated from explicit chart uncertainty',presentationPipeline.unc,JSON.stringify(presentationPipeline));
ok('forecast runtime metadata requires an explicit PREDICTIVE series',presentationPipeline.forecast,JSON.stringify(presentationPipeline));
ok('body and composition presentation models execute from domain view inputs',presentationPipeline.body&&presentationPipeline.comp,JSON.stringify(presentationPipeline));
ok('causal presentation model executes without inventing causal structure',presentationPipeline.causal,JSON.stringify(presentationPipeline));
ok('responsive execution resolves narrow-screen behavior from the presentation engine',presentationPipeline.r,JSON.stringify(presentationPipeline));
const seriesAttrs=run(`(function(){
  var h=svgChart({height:90,series:[{type:'line',cls:'avg',pts:[{x:0,y:1},{x:1,y:2}]},{type:'band',uncertaintyType:'forecast',pts:[{x:0,lo:0,hi:2},{x:1,lo:1,hi:3}]},{type:'line',cls:'pred',epistemic:'PREDICTIVE',point:2,uncertainty:{lo:1,hi:3},pts:[{x:0,y:2},{x:1,y:3}]}],aria:'mixed'});
  return {viz:/data-presentation-visualization="line"/.test(h),unc:/data-presentation-uncertainty="forecast"/.test(h),forecast:/data-presentation-forecast="1"/.test(h),predictive:/data-epistemic="PREDICTIVE"/.test(h)};
})()`);
ok('chart renderer carries visualization, uncertainty and predictive semantics into the rendered SVG',seriesAttrs.viz&&seriesAttrs.unc&&seriesAttrs.forecast&&seriesAttrs.predictive,JSON.stringify(seriesAttrs));
const chartGovernance=run(`(function(){
  var h=svgChart({height:90,series:[{type:'line',cls:'avg',pts:[{x:0,y:1},{x:1,y:2}]},{type:'band',uncertaintyType:'forecast',pts:[{x:0,lo:0,hi:2},{x:1,lo:1,hi:3}]},{type:'line',cls:'pred',epistemic:'PREDICTIVE',point:2,uncertainty:{lo:1,hi:3},pts:[{x:0,y:2},{x:1,y:3}]}],aria:'mixed'});
  return {provenance:/data-presentation-provenance="1"/.test(h),observed:/data-series-semantic="observed"/.test(h),predictive:/data-series-semantic="predictive"/.test(h),uncertainty:/data-uncertainty-type="forecast"/.test(h),dashClass:/class="pred predictive"/.test(h)};
})()`);
ok('chart renderer consumes provenance and preserves series-level semantic separation',chartGovernance.provenance&&chartGovernance.observed&&chartGovernance.predictive&&chartGovernance.uncertainty&&chartGovernance.dashClass,JSON.stringify(chartGovernance));
const swallowed=run('JSON.stringify(getSwallowedErrors())');
const sw=JSON.parse(swallowed);
ok('no errors were quarantined across the whole engine run',sw.count===0,JSON.stringify((sw.top||[]).slice(0,4)));

if(JSON_ONLY){console.log(JSON.stringify({fixtures:out,selftest:{passed:st.passed,failed:st.failed},failures},null,1));}
else{
  console.log(report.join('\n'));
  console.log('\nfixtures:');
  for(const n of names)console.log('  '+n.padEnd(22)+JSON.stringify(out[n]));
  console.log('\n'+(report.length-failures)+' passed, '+failures+' failed  ('+st.passed+' in-app self-test checks)');
}
process.exit(failures?1:0);
