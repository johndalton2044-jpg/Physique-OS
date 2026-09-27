// PERFORMANCE harness — the audit's §75/§76 gap: correctness was tested, scaling was not.
//
// Builds synthetic records at 1, 5 and 10 years of daily use and measures the operations whose cost was
// suspected of being proportional to the whole database rather than to the change. Prints a table and fails
// if a budget is exceeded, so a scaling regression breaks the build rather than being discovered by a user
// with four years of history.
//
//   node tests/perf.mjs [--years 1,5,10] [--json]
//
// The budgets below are deliberately generous: they exist to catch order-of-magnitude regressions, not to
// pin exact timings, which vary by machine. A budget that fails intermittently on identical code is worse
// than no budget at all.
import fs from 'node:fs';import vm from 'node:vm';

const JSON_ONLY=process.argv.includes('--json');
const yearsArg=(process.argv.find(a=>a.startsWith('--years='))||'').split('=')[1];
const YEARS=(yearsArg?yearsArg.split(','):['1','5','10']).map(Number);

const files=fs.readdirSync('src').filter(f=>f.endsWith('.js')&&f!=='99-boot.js').sort();
const code=files.map(f=>fs.readFileSync('src/'+f,'utf8')).join('\n');
const store={};
const ctx={console,setTimeout,clearTimeout,setInterval,clearInterval,Date,Math,JSON,performance,fetch:undefined,
  localStorage:{getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];},key:i=>Object.keys(store)[i]??null,get length(){return Object.keys(store).length;}},
  navigator:{onLine:true},document:undefined,indexedDB:undefined,addEventListener(){},removeEventListener(){}};
ctx.globalThis=ctx;ctx.window=ctx;ctx.self=ctx;
vm.createContext(ctx);
vm.runInContext(code,ctx,{filename:'engine.js'});
const run=e=>vm.runInContext(e,ctx);

/* Build a record with `days` of realistic daily use: weight, intake, steps, sleep, recovery ratings,
   four food entries a day, four sessions a week, plus corrections, retractions and phase changes so the
   temporal machinery is exercised rather than bypassed. */
function build(days){
  return run(`(function(){
    var days=${days};
    DB=emptyDB();
    DB.profile={name:'Perf',age:40,sex:'male',heightIn:70};
    var start=addDays(todayISO(),-(days-1));
    var seed=42;var rnd=function(){seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff;};
    var w=250;
    var ph={id:'ph-perf',type:'cut',startDate:start,endDate:null,status:'active',calorieTarget:2400,
      proteinTarget:200,stepTarget:9000,trainingSessions:4,createdAt:start+'T00:00:00.000Z',history:[]};
    DB.phases.push(ph);
    var foods=seedFoods().slice(0,20);
    for(var i=0;i<days;i++){
      var d=addDays(start,i);var stamp=d+'T07:00:00.000Z';
      w-=0.0035*(1+rnd()*0.6);
      DB.observations.push(makeObservation({type:'weight',date:d,value:round(w+(rnd()-0.5)*1.6,1),source:'manual',createdAt:stamp}));
      DB.observations.push(makeObservation({type:'steps',date:d,value:Math.round(7000+rnd()*6000),source:'manual',createdAt:stamp}));
      DB.observations.push(makeObservation({type:'sleep',date:d,value:round(6.4+rnd()*2,1),source:'manual',createdAt:stamp}));
      DB.observations.push(makeObservation({type:'fatigue',date:d,value:Math.round(2+rnd()*5),source:'manual',createdAt:stamp}));
      DB.observations.push(makeObservation({type:'hunger',date:d,value:Math.round(2+rnd()*5),source:'manual',createdAt:stamp}));
      if(i%7===0)DB.observations.push(makeObservation({type:'waist',date:d,value:round(40-i*0.004,1),source:'manual',createdAt:stamp}));
      for(var m=0;m<4;m++){
        var f=foods[Math.floor(rnd()*foods.length)];var g=Math.round(80+rnd()*220);
        DB.foodLogs.push({id:uid('fl'),date:d,meal:MEALS[m],food:foodSnapshot(f),quantity:g,basis:'g',grams:g,ml:null,servings:null,
          portionLabel:g+' g',nutrients:nutrientsFor(f,g),createdAt:d+'T12:00:00.000Z',source:'perf'});
      }
      var day=dayNutrition(d);
      ['kcal','protein','carbs','fat','fiber'].forEach(function(k){
        var v=day.totals[k];if(v==null)return;
        DB.observations.push(makeObservation({type:FOODLOG_OBS[k],date:d,value:round(v,0),source:'food-log',quality:'derived',createdAt:d+'T23:00:00.000Z'}));
      });
      if(i%2===0&&i%7!==6){
        var sets=[];['Back squat','Bench press','Barbell row'].forEach(function(ex){
          for(var k2=0;k2<3;k2++)sets.push({exercise:ex,load:Math.round(150+i*0.1),reps:6+Math.round(rnd()*3),rir:2});});
        DB.sessions.push({id:uid('sess'),date:d,name:'Session',sets:sets,durationMin:58,source:'perf',createdAt:stamp,phaseId:ph.id,retracted:false});
      }
      /* temporal machinery: a correction every 30 days, a retraction every 45, a target edit every 90 */
      if(i>0&&i%30===0){var prev=DB.observations.filter(function(o){return o.type==='weight'&&o.date===addDays(d,-1);})[0];
        if(prev){prev.correctedBy='c'+i;prev.correctedAt=stamp;
          DB.observations.push(makeObservation({type:'weight',date:addDays(d,-1),value:round(prev.value-0.4,1),source:'manual',createdAt:stamp,supersedes:prev.id}));}}
      if(i>0&&i%45===0){var vict=DB.observations.filter(function(o){return o.type==='steps'&&o.date===d;})[0];
        if(vict){vict.retracted=true;vict.retractedAt=stamp;}}
      if(i>0&&i%90===0){ph.history.push({at:stamp,before:{calorieTarget:ph.calorieTarget}});ph.calorieTarget-=50;
        DB.interventions.push({id:uid('iv'),date:d,createdAt:stamp,variable:'calories',from:ph.calorieTarget+50,to:ph.calorieTarget,status:'active',phaseId:ph.id});}
      if(i%14===0){DB.predictions.push({id:uid('pred'),subject:'weight14',madeAt:stamp,dueDate:addDays(d,14),
        point:w,lo:w-2,hi:w+2,status:i<days-20?'scored':'pending',actual:i<days-20?w-0.5:null,error:i<days-20?-0.5:null,hit:true,
        scoredAt:i<days-20?addDays(d,14)+'T07:00:00.000Z':null,context:{phaseType:'cut',weightZone:'230\\u2013250',trust:'high',modelVersion:'1.0'}});}
    }
    _memoInvalidate();
    return {observations:DB.observations.length,foodLogs:DB.foodLogs.length,sessions:DB.sessions.length,
      predictions:DB.predictions.length,bytes:serializeDB().length};
  })()`);
}
const time=(label,expr,iterations)=>{
  const n=iterations||1;
  run('_memoInvalidate();');
  const t0=process.hrtime.bigint();
  for(let i=0;i<n;i++)run(expr);
  const t1=process.hrtime.bigint();
  return {label,ms:Number(t1-t0)/1e6/n};
};
/* Budgets in milliseconds per operation at 10 years of daily use. Anything here that regresses by an order
   of magnitude is a scaling defect, which is exactly what these exist to catch. */
const BUDGETS={'serialize (whole record)':900,'incremental save':250,'full save':1200,'weight trend':350,
  'current state':1800,'decide':2200,'replay 1 year back':2500,'timeline 90d':1500,'dayNutrition':120,
  'personal baselines':2200,'change points':2600,'search':900,'integrity check':900,'migrate':1800};
const results=[];let failures=0;
for(const years of YEARS){
  const days=Math.round(years*365);
  const built=build(days);
  const row={years,days,...built,ops:{}};
  const ops=[
    time('serialize (whole record)','serializeDB()',3),
    time('incremental save','persistIncremental("observation:weight")',5),
    time('full save','persistIncremental("unmapped-label-forces-all")',3),
    time('weight trend','weightTrend(14)',5),
    time('current state','getCurrentState()',2),
    time('decide','decide()',2),
    time('replay 1 year back','withAsOf(addDays(todayISO(),-330),function(){return getCurrentState();})',1),
    time('timeline 90d','timeline({days:90})',2),
    time('dayNutrition','dayNutrition(todayISO())',10),
    time('personal baselines','personalBaselines()',2),
    time('change points','changePoints()',1),
    time('search','searchAll("chicken")',3),
    time('integrity check','integrityCheck("perf")',3),
    time('migrate','migrate(JSON.parse(serializeDB()))',1)
  ];
  ops.forEach(o=>{
    row.ops[o.label]=+o.ms.toFixed(1);
    if(years===Math.max(...YEARS)&&BUDGETS[o.label]!=null&&o.ms>BUDGETS[o.label]){
      failures++;row.ops[o.label]=String(row.ops[o.label])+' OVER('+BUDGETS[o.label]+')';
    }
  });
  results.push(row);
}
if(JSON_ONLY){console.log(JSON.stringify({results,failures},null,1));}
else{
  const labels=Object.keys(results[0].ops);
  console.log('\nrecord size');
  results.forEach(r=>console.log('  '+String(r.years+'y').padEnd(5)+String(r.observations).padStart(7)+' obs  '+
    String(r.foodLogs).padStart(6)+' food  '+String(r.sessions).padStart(5)+' sessions  '+
    (r.bytes/1048576).toFixed(1).padStart(6)+' MB'));
  console.log('\nmilliseconds per operation');
  console.log('  '+'operation'.padEnd(26)+results.map(r=>String(r.years+'y').padStart(10)).join('')+'   budget');
  labels.forEach(l=>{
    console.log('  '+l.padEnd(26)+results.map(r=>String(r.ops[l]).padStart(10)).join('')+'   '+(BUDGETS[l]!=null?BUDGETS[l]:'\u2014'));
  });
  const worst=results[results.length-1];
  const incr=parseFloat(worst.ops['incremental save']),full=parseFloat(worst.ops['full save']);
  console.log('\n  incremental vs whole-record write at '+worst.years+'y: '+incr.toFixed(1)+' ms vs '+full.toFixed(1)+' ms'+
    (full>0?(' \u2014 '+(full/Math.max(incr,0.01)).toFixed(1)+'\u00d7 cheaper'):''));
  console.log('\n'+(failures?failures+' operation(s) over budget':'all operations within budget'));
}
process.exit(failures?1:0);
