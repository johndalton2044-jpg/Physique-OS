/* THE INTEGRATION GATE (H3). One real source proven end to end before more are added: a Health export and a scale CSV,
   chosen through the import screen's file picker, previewed, committed, reconciled with what was logged by hand, safe to
   import twice, and seen to drive the models and the plan. */
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {chromium} from 'playwright-core';
import {findBrowser} from './_browser-path.mjs';
if(process.env.PHYSIQUE_SKIP_BROWSER==='1'){console.log('  SKIPPED  integration \u2014 PHYSIQUE_SKIP_BROWSER=1, NOT verified');process.exit(0);}
/* A 35-day export: kg weights trending down, intake, steps seen by BOTH iPhone and Apple Watch, sleep stages with an
   In-bed span, resting heart rate. Dated to end yesterday. */
const iso=d=>d.toISOString().slice(0,10);const day0=new Date(Date.now()-35*86400000);
const recs=[];const R=(t,src,unit,val,d,h)=>recs.push(`<Record type="${t}" sourceName="${src}" unit="${unit}" startDate="${d} ${h} -0400" endDate="${d} ${h} -0400" value="${val}"/>`);
for(let i=0;i<35;i++){const d=iso(new Date(day0.getTime()+i*86400000)),n=iso(new Date(day0.getTime()+(i+1)*86400000));
  R('HKQuantityTypeIdentifierBodyMass','Withings','kg',(90-i*0.07+((i*7)%5-2)*0.12).toFixed(2),d,'07:05:00');
  for(const [src,k] of [['iPhone',1],['Apple Watch',1.05]])for(const [h,s] of [['08:00:00',2600],['12:00:00',3100],['18:00:00',2800]])R('HKQuantityTypeIdentifierStepCount',src,'count',Math.round(s*k),d,h);
  R('HKQuantityTypeIdentifierDietaryEnergyConsumed','MyFitnessPal','kcal',2150+((i*13)%7)*20,d,'20:30:00');
  R('HKQuantityTypeIdentifierRestingHeartRate','Apple Watch','count/min',57+(i%4),d,'06:00:00');
  recs.push(`<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Apple Watch" startDate="${d} 23:00:00 -0400" endDate="${n} 06:40:00 -0400" value="HKCategoryValueSleepAnalysisInBed"/>`);
  recs.push(`<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Apple Watch" startDate="${d} 23:20:00 -0400" endDate="${n} 06:20:00 -0400" value="HKCategoryValueSleepAnalysisAsleepCore"/>`);}
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pos-int-'));const xmlPath=path.join(tmp,'export.xml');
fs.writeFileSync(xmlPath,`<?xml version="1.0" encoding="UTF-8"?>\n<HealthData locale="en_US">\n${recs.join('\n')}\n</HealthData>\n`);
const csvPath=path.join(tmp,'withings.csv');const cd=iso(new Date(Date.now()-86400000*40));
fs.writeFileSync(csvPath,'Date,"Weight (kg)","Fat mass (kg)"\n"'+cd+' 07:05:12","91.20","19.1"\n');
const midDay=iso(new Date(day0.getTime()+17*86400000));

const server=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join('dist',u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':/\.js$/.test(f)?'text/javascript':/\.json$/.test(f)?'application/json':'text/html'});r.end(d);});});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/index.html`;
const browser=await chromium.launch({executablePath:findBrowser(),args:['--no-sandbox','--disable-dev-shm-usage']});
const p=await (await browser.newContext({viewport:{width:393,height:852}})).newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
let failed=0;const line=(ok,msg,d)=>{if(!ok)failed++;console.log('  '+(ok?'pass':'FAIL')+'  '+msg+(d&&!ok?'  \u2014 '+d:''));};
const S=(fn,arg)=>p.evaluate(fn,arg);

await p.goto(url);await p.waitForTimeout(1400);await S(()=>window.dispatchAct('welcome.skip'));await p.waitForTimeout(300);
await S(()=>window.applyProfileFields({sex:'male',age:34,heightFt:5,heightIn:11,startWeight:198}));
/* a day logged by hand before the import */
await S(d=>window.addObservation({type:'calories',date:d,value:2600,source:'manual'},{silent:true}),midDay);
/* through the import screen's picker */
await S(()=>window.dispatchAct('nav.import'));await p.waitForTimeout(250);
line(await S(()=>!!document.querySelector('#editBackdrop input[type=file]#importFile')),'the import screen has a real file picker');
await p.setInputFiles('#importFile',xmlPath);await p.waitForTimeout(1500);
const pv=await S(()=>{const P=window._IMPORT&&window._IMPORT.preview;return P&&{fresh:P.fresh,byType:P.byType,skipped:(P.overlapSkipped||[]).length,refused:(P.rejected||[]).length,kind:window._IMPORT.kind,shown:/Would add/.test(document.getElementById('editBackdrop').textContent)};});
line(!!pv&&pv.kind==='apple_health'&&pv.shown&&pv.fresh>0,'the Health export is recognised and previewed before anything is written',JSON.stringify(pv));
line(!!pv&&pv.refused===0,'nothing in the export is refused',JSON.stringify(pv&&pv.refused));
line(!!pv&&pv.skipped===1,'the day already logged by hand is skipped for calories, and reported',JSON.stringify(pv&&pv.skipped));
await p.click('#editBackdrop [data-act="import.commit"]');await p.waitForTimeout(500);
/* Read as of today: an imported value is recorded today, so as of its own date it was not yet known (replay is right). */
const got=await S(d=>{const o=window.DB.observations.filter(x=>x.meta&&x.meta.importSource==='apple_health');
  const day=t=>{const r=window.dailySeries(t,window.todayISO(),60).find(x=>x.date===d);return r&&r.value;};
  const rhr=window.obsOf('rhr',{from:d,to:d})[0],st=o.find(x=>x.type==='steps');
  return {n:o.length,steps:day('steps'),sleep:day('sleep'),cal:day('calories'),rhr:rhr&&rhr.value,device:st&&st.meta.device,trust:st&&st.meta.trust};},midDay);
line(got.n>=100,'the export is committed',JSON.stringify(got.n));
line(got.device==='Apple Watch'&&got.trust>0,'each imported value keeps its source, device and trust weight',JSON.stringify({device:got.device,trust:got.trust}));
line(got.steps>8000&&got.steps<9500,'steps are the watch\u2019s count, not both devices added',JSON.stringify(got.steps));
line(Math.abs(got.sleep-7)<0.05,'sleep is the time asleep (7.0 h), not time in bed (7.7 h)',JSON.stringify(got.sleep));
line(got.cal===2600,'the hand-logged day keeps its own calories',JSON.stringify(got.cal));
line(got.rhr>=57&&got.rhr<=60,'resting heart rate is imported',JSON.stringify(got.rhr));
/* twice */
await S(()=>window.dispatchAct('nav.import'));await p.waitForTimeout(200);await p.setInputFiles('#importFile',xmlPath);await p.waitForTimeout(1500);
line(await S(()=>window._IMPORT.preview&&window._IMPORT.preview.fresh===0&&window._IMPORT.preview.duplicates>0),'importing the same file again adds nothing');
/* a scale CSV in kilograms */
await S(()=>window.dispatchAct('import.reset'));await p.setInputFiles('#importFile',csvPath);await p.waitForTimeout(800);
await p.click('#editBackdrop [data-act="import.commit"]').catch(()=>{});await p.waitForTimeout(400);
const csvW=await S(d=>{const o=window.obsOf('weight',{from:d,to:d})[0];return o&&o.value;},cd);
line(csvW>200&&csvW<202,'a scale CSV in kilograms is converted (91.2 kg = 201.1 lb)',JSON.stringify(csvW));
/* influence: the models and the plan run on the imported data */
const inf=await S(()=>{const wt=window.weightTrend(28),td=window.infer({modelId:'tdee_personal'});
  const ph=window.startPhase({type:'cut',startDate:window.todayISO(),calorieTarget:1900,proteinTarget:170});
  const pl=window.currentPlan();return {trend:wt.status,slope:wt.slopePerWeek,tdee:td.status,tdeeCls:td.cls,plan:!!pl,planGoal:pl&&pl.content.targets.kcal};});
line(inf.trend==='ok'&&inf.slope<0,'the weight trend is computed from the imported weigh-ins',JSON.stringify(inf));
line(inf.tdee==='ok','the personal maintenance estimate runs on imported intake and weight',JSON.stringify(inf));
line(inf.plan&&inf.planGoal===1900,'a plan built afterwards runs on it',JSON.stringify(inf));
line(errors.length===0,'no errors in the page',errors.slice(0,2).join(' | '));
await browser.close();server.close();fs.rmSync(tmp,{recursive:true,force:true});
console.log(failed?failed+' failed':'all passed');process.exit(failed?1:0);
