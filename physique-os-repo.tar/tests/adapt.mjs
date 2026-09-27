/* THE ADAPTATION GATE (H3's hard gate). What a person actually does, and how their body responds, causes a plan change
   that can be traced: the pattern is seen, a change is proposed with its evidence and alternatives, the person accepts,
   the plan records it as an adaptation, it is explained, and a week later it reports what happened. Recovery that is
   measurably low shapes today's session. All through the controls. */
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';
import {chromium} from 'playwright-core';
import {findBrowser} from './_browser-path.mjs';
if(process.env.PHYSIQUE_SKIP_BROWSER==='1'){console.log('  SKIPPED  adapt \u2014 PHYSIQUE_SKIP_BROWSER=1, NOT verified');process.exit(0);}
const server=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join('dist',u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':/\.js$/.test(f)?'text/javascript':/\.json$/.test(f)?'application/json':'text/html'});r.end(d);});});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/index.html`;
const browser=await chromium.launch({executablePath:findBrowser(),args:['--no-sandbox','--disable-dev-shm-usage']});
const ctx=await browser.newContext({viewport:{width:393,height:852},hasTouch:true,isMobile:true});
const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
let failed=0;const line=(ok,msg,d)=>{if(!ok)failed++;console.log('  '+(ok?'pass':'FAIL')+'  '+msg+(d&&!ok?'  \u2014 '+d:''));};
const S=(fn,arg)=>p.evaluate(fn,arg);

/* Pinned to the most recent Monday, a lifting day: on a rest day the recovery check passed by skipping. */
const _mon=new Date();_mon.setUTCDate(_mon.getUTCDate()-((_mon.getUTCDay()+6)%7));_mon.setUTCHours(12,0,0,0);
await p.clock.setFixedTime(_mon);
await p.goto(url);await p.waitForTimeout(1400);await S(()=>window.dispatchAct('welcome.demo'));await p.waitForTimeout(900);
await S(()=>window.dispatchAct('settings.detail','insightful'));
/* 1. the pattern is seen, and reaches the attention queue */
const A=await S(()=>{const a=window.adherenceAnalysis();return a.training&&{d:a.training.diagnosis,why:a.training.why};});
line(!!A&&A.d!=='fits'&&A.d!=='not enough recorded','the pattern in four weeks of training is diagnosed',JSON.stringify(A));
line(await S(()=>window.attentionQueue().items.some(i=>/^adapt:/.test(i.id))),'the suggestion reaches the attention queue');
/* 2. proposed with its evidence and alternatives, on the Plan tab */
await S(()=>window.switchTab('plan'));await p.waitForTimeout(250);
const card=await S(()=>{const c=[...document.querySelectorAll('#view-plan .card')].find(x=>/^Suggested changes/.test(window.panelTitle(x)));return c?c.textContent.replace(/\s+/g,' '):null;});
line(!!card&&/Also considered/.test(card)&&/Expected/.test(card)&&/Trade-off/.test(card),'the suggestion shows its evidence, the alternatives, the expected effect and the trade-off',card&&card.slice(0,160));
/* 3. accepted through the control; the plan records an adaptation and the change happens */
const before=await S(()=>({v:window.plansOf().length,prog:window.trainingProgram().key}));
await p.click('#view-plan [data-act="adapt.apply"]');await p.waitForTimeout(500);
const after=await S(()=>{const v=window.plansOf().slice(-1)[0];return {v:window.plansOf().length,prog:window.trainingProgram().key,kind:v.trigger.kind,ev:v.trigger.evidence.length,alts:v.trigger.alternatives.length,adaptation:!!v.adaptation};});
line(after.v===before.v+1&&after.kind==='adaptation'&&after.adaptation&&after.ev>0&&after.alts>0,'accepting creates a plan version recorded as an adaptation, with evidence and alternatives',JSON.stringify(after));
line(after.prog!==before.prog,'the change actually happens (the programme)',before.prog+' \u2192 '+after.prog);
/* 4. explained */
const why=await S(()=>{const c=[...document.querySelectorAll('#view-plan .card')].find(x=>/^Why the plan changed/.test(window.panelTitle(x)));return c?c.textContent.replace(/\s+/g,' '):null;});
line(!!why&&/Adapted to what you actually do/.test(why),'"Why the plan changed" explains it',why&&why.slice(0,140));
/* 5. a week later it reports what happened */
const out=await S(()=>{const v=window.adaptationsOf().slice(-1)[0];const now=window.adaptationOutcome(v.id);const keep=window._NOW_OVERRIDE;window._NOW_OVERRIDE=window.addDays(window.todayISO(),8);window._memoInvalidate();
  const later=window.adaptationOutcome(v.id);window._NOW_OVERRIDE=keep;window._memoInvalidate();return {now:now.status,later:later.status,note:later.note};});
line(out.now==='pending'&&out.later==='ok'&&!!out.note,'the adaptation waits a week, then reports what happened since',JSON.stringify(out));
/* 6. dismissing a suggestion is remembered */
line(await S(()=>{const P=window.adaptationProposals().proposals;if(!P.length)return true;window.dismissAdaptation(P[0].id);return !window.adaptationProposals().proposals.some(x=>x.id===P[0].id);}),'"Not now" is remembered');
/* 7. recovery that is measurably low shapes today's session */
await S(()=>{const t=window.todayISO();[['sleep',4.2],['fatigue',9],['soreness',8],['stress',8]].forEach(([ty,v])=>{try{window.addObservation({type:ty,date:t,value:v},{silent:true});}catch(e){}});window._memoInvalidate();window.switchTab('today');});
await p.waitForTimeout(300);
const rs=await S(()=>{const r=window.recoverySuggestion();const tr=window.intendedFor(window.todayISO()).items.some(x=>x.item==='training');return {tr,rs:!!r,band:window.recoveryLatentState().band,btn:!!document.querySelector('#view-today [data-act="exec.variant"][data-arg="training|reduced"]')};});
if(rs.tr){line(rs.rs&&rs.btn,'low recovery suggests the reduced session on Today, one tap away',JSON.stringify(rs));
  if(rs.btn){await p.click('#view-today [data-act="exec.variant"][data-arg="training|reduced"]');await p.waitForTimeout(200);
    line(await S(()=>window.executionFor(window.todayISO()).rows.find(r=>r.item==='training').variant==='reduced'),'the reduced session is applied with one tap');}}
else line(true,'no training is scheduled today, so there is no session for recovery to shape');
line(errors.length===0,'no errors in the page',errors.slice(0,2).join(' | '));
await browser.close();server.close();
console.log(failed?failed+' failed':'all passed');process.exit(failed?1:0);
