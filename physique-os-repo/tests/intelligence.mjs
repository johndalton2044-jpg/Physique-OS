/* THE INTELLIGENCE GATE (H4). The system individualises over time without claiming certainty it does not have \u2014
   checked on what the person sees: estimates labelled by how personal they are, labels that follow the data in both
   directions, knowledge that only loses confidence with age, and forecasts trusted according to their record. */
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';
import {chromium} from 'playwright-core';
import {findBrowser} from './_browser-path.mjs';
if(process.env.PHYSIQUE_SKIP_BROWSER==='1'){console.log('  SKIPPED  intelligence \u2014 PHYSIQUE_SKIP_BROWSER=1, NOT verified');process.exit(0);}
const server=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join('dist',u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':/\.js$/.test(f)?'text/javascript':/\.json$/.test(f)?'application/json':'text/html'});r.end(d);});});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/index.html`;
const browser=await chromium.launch({executablePath:findBrowser(),args:['--no-sandbox','--disable-dev-shm-usage']});
const p=await (await browser.newContext({viewport:{width:393,height:852}})).newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
let failed=0;const line=(ok,msg,d)=>{if(!ok)failed++;console.log('  '+(ok?'pass':'FAIL')+'  '+msg+(d&&!ok?'  \u2014 '+d:''));};
const S=(fn,arg)=>p.evaluate(fn,arg);
const labels=()=>S(()=>{window._memoInvalidate();window.renderAll();window.switchTab('today');return [...document.querySelectorAll('#view-today .m-plabel')].map(e=>e.textContent);});

await p.goto(url);await p.waitForTimeout(1400);
/* 1. a new person: a starting estimate, said so */
await S(()=>{window.dispatchAct('welcome.skip');window.applyProfileFields({sex:'female',age:36,heightFt:5,heightIn:6,startWeight:172});window.startPhase({type:'cut',startDate:window.todayISO(),calorieTarget:1800});});
const L1=await labels();
line(L1.includes('Starting estimate')&&!L1.includes('From your data'),'a new person\u2019s maintenance estimate is labelled a starting estimate, not theirs',JSON.stringify(L1));
/* 2. weeks of their own data: the labels follow */
await S(()=>window.loadDemo());await p.waitForTimeout(400);
const L2=await labels();
line(L2.includes('From your data')&&(L2.includes('Adjusted to you')||L2.filter(x=>x==='From your data').length>=2),'with weeks of their own data the labels say so',JSON.stringify(L2));
/* 3. recent data stops: out of date, never "yours" */
await S(()=>{window.__keep=window.DB.observations;window.DB.observations=window.__keep.filter(o=>o.date<window.addDays(window.todayISO(),-20));});
const L3=await labels();
line(L3.includes('Out of date')&&!L3.includes('From your data'),'when recent data stops, the estimate says it is out of date',JSON.stringify(L3));
await S(()=>{window.DB.observations=window.__keep;window._memoInvalidate();});
/* 4. knowledge only loses confidence with age */
const K=await S(()=>{const lv=window.CONF_LEVELS;let rises=false;['high','medium','low'].forEach(l=>{let prev=lv.indexOf(l);for(let a=0;a<=720;a+=15){const i=lv.indexOf(window.decayConfidence(l,a));if(i>prev)rises=true;prev=i;}});
  const items=window.personalKnowledge().items;return {rises,anyHigher:items.some(i=>lv.indexOf(i.decayedConfidence)>lv.indexOf(i.confidence)),staleHaveRetest:items.filter(i=>i.freshness==='stale').every(i=>!!i.revalidate)};});
line(!K.rises&&!K.anyHigher,'a claim never becomes more confident as its evidence ages',JSON.stringify(K));
line(K.staleHaveRetest,'every stale claim says how to test it again');
/* 5. forecasts are trusted according to their record, visibly */
const F1=await S(()=>{window.switchTab('today');const c=[...document.querySelectorAll('#view-today .card')].find(x=>/^Forecast/.test(window.panelTitle(x)));return c?[...c.querySelectorAll('.m-plabel')].map(e=>e.textContent):null;});
line(!!F1&&F1.length===1,'the forecast shows how far its record can be trusted',JSON.stringify(F1));
const F2=await S(()=>{const P=window.DB.predictions.filter(p=>p.status!=='pending'&&p.covered!=null).sort((a,b)=>a.dueDate<b.dueDate?-1:1);const m=P.length?P[P.length-1].model:null;
  P.filter(p=>p.model===m).slice(Math.floor(P.filter(p=>p.model===m).length/2)).forEach(p=>p.covered=false);window._memoInvalidate();return window.modelHealth(m);});
line(F2.state==='degraded'&&/less reliable/i.test(F2.label),'a forecast whose recent predictions miss is marked as getting less reliable',JSON.stringify(F2).slice(0,160));
/* 6. claims say what would change them, and a testable one opens the designer on its own variable */
await S(()=>{window.closeSheet&&window.closeSheet();window.dispatchAct('settings.detail','insightful');window.dispatchAct('nav.knowledge');});await p.waitForTimeout(250);
const KS=await S(()=>({would:(document.getElementById('editBackdrop').textContent.match(/Would change if/g)||[]).length,claims:window.personalKnowledge().count,test:!!document.querySelector('#editBackdrop [data-act="exp.design"]')}));
line(KS.would===KS.claims&&KS.claims>0,'every claim says what would change it',JSON.stringify(KS));
if(KS.test){await p.click('#editBackdrop [data-act="exp.design"]');await p.waitForTimeout(250);
  line(await S(()=>window._SHEET&&window._SHEET.buf&&!!window._SHEET.buf.focus),'"Test it" opens the experiment designer on that claim’s variable');}
/* 7. one answer to "is this lift improving?" */
line(await S(()=>{const R={};window.exerciseResponse().rows.forEach(r=>R[String(r.exercise).toLowerCase()]=r);return window.strengthTrend().per.every(x=>x.direction!=='improving'||!R[x.exercise]||R[x.exercise].direction==='progressing');}),
  'a lift called improving is one whose trend is clear of its own noise');
/* 8. the assistant answers the question asked, through its sheet */
const ask=async q=>{await S(()=>{window.closeSheet&&window.closeSheet();window.dispatchAct('nav.ask');});await p.waitForTimeout(200);
  await p.fill('#askInput',q);await p.click('#editBackdrop [data-act="ask.run"]');await p.waitForTimeout(200);
  return S(()=>document.getElementById('editBackdrop').innerText.replace(/\s+/g,' '));};
const a1=await ask('Does sleep affect my hunger?');
line(/Not established/.test(a1)&&!/7\.\d h, steady/.test(a1),'"does sleep affect my hunger" is answered about the relationship, not with sleep duration',a1.slice(0,160));
const a2=await ask('Is creatine safe for my kidneys?');
line(/clinician/.test(a2)&&/Not something to answer here/.test(a2),'a health-condition question is declined on screen with its reason',a2.slice(0,160));
const inj=await S(()=>{window._ASK={status:'ok',question:'q',value:'<b id="inj">x</b>',basis:'',cls:'DERIVED',note:''};window.renderSheet();return !!document.getElementById('inj');});
line(!inj,'an answer is shown as text, never as markup');
/* 8. the assistant answers the question asked and knows its limits */
const QA=await S(()=>{const a=q=>window.askQuestion(q);return {rel:a('is my sleep affecting my weight?').matched,protein:a('how much protein should I eat?').matched,
  day:a('why did my weight go up yesterday?').matched,vlcd:a('can I eat 700 calories a day?').status,med:a('does my thyroid medication affect weight?').status,out:a('what stock should I buy?').status};});
line(QA.rel==='relation'&&QA.protein==='protein'&&QA.day==='weight-day','the assistant answers the question that was asked',JSON.stringify(QA));
line(QA.vlcd==='caution'&&QA.med==='declined'&&QA.out==='unmatched','it cautions on very low intake, declines health-condition questions and does not guess',JSON.stringify(QA));
/* 9. validation: every association carries its placebo check; the prior's weight is stated; every chart type draws */
const V=await S(()=>{window.dispatchAct('settings.detail','insightful');window.switchTab('learn');const t=document.getElementById('view-learn').textContent;
  const C=window.chartCatalogueSummary();return {placebo:/placebo check (passed|failed|not checked)/.test(t)||!window.cardioHungerAssociation||window.cardioHungerAssociation().status!=='ok',assumed:/still carries into this one/.test(t),charts:C.available===C.total};});
line(V.placebo,'every reported association says whether it survived a placebo check',JSON.stringify(V));
line(V.assumed,'how much the maintenance estimate still assumes is stated',JSON.stringify(V));
line(V.charts,'every catalogued chart type can be drawn',JSON.stringify(V));
line(errors.length===0,'no errors in the page',errors.slice(0,2).join(' | '));
await browser.close();server.close();
console.log(failed?failed+' failed':'all passed');process.exit(failed?1:0);
