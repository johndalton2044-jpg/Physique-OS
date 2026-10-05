/* THE PARITY GATE (H2's hard gate). A person can plan, carry out, log, review, edit and replay ordinary training,
   nutrition, activity and recovery without leaving the app \u2014 through the controls, with the common logs held to a tap
   budget, because a dedicated app that takes six taps to log a weigh-in loses to one that takes three. */
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';
import {chromium} from 'playwright-core';
import {findBrowser} from './_browser-path.mjs';
if(process.env.PHYSIQUE_SKIP_BROWSER==='1'){console.log('  SKIPPED  parity \u2014 PHYSIQUE_SKIP_BROWSER=1, NOT verified');process.exit(0);}
const server=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join('dist',u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':/\.js$/.test(f)?'text/javascript':/\.json$/.test(f)?'application/json':'text/html'});r.end(d);});});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/index.html`;
const browser=await chromium.launch({executablePath:findBrowser(),args:['--no-sandbox','--disable-dev-shm-usage']});
const ctx=await browser.newContext({viewport:{width:393,height:852},hasTouch:true,isMobile:true});
const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
let failed=0;const line=(ok,msg,d)=>{if(!ok)failed++;console.log('  '+(ok?'pass':'FAIL')+'  '+msg+(d&&!ok?'  \u2014 '+d:''));};
let taps=0;const tap=async sel=>{taps++;await p.click(sel);await p.waitForTimeout(180);};
const S=(fn,arg)=>p.evaluate(fn,arg);   /* the argument is passed through: dropping it made every before-and-after check compare with undefined */

/* Pinned to the most recent Monday, a lifting day: the gate first ran on a Saturday (a cardio day), found no session
   to run and failed — it had silently depended on the day of the week it was run. */
const _mon=new Date();_mon.setUTCDate(_mon.getUTCDate()-((_mon.getUTCDay()+6)%7));_mon.setUTCHours(12,0,0,0);
await p.clock.setFixedTime(_mon);
await p.goto(url);await p.waitForTimeout(1400);await S(()=>window.dispatchAct('welcome.demo'));await p.waitForTimeout(900);
await S(()=>{window.dispatchAct('settings.detail','insightful');window.switchTab('plan');});await p.waitForTimeout(250);
/* PLAN */
line(await S(()=>document.querySelectorAll('#view-plan .pw-day').length===7&&!!window.currentPlan()),'plan: the plan and its week are shown');
await S(()=>window.switchTab('train'));await p.waitForTimeout(200);
line(await S(()=>window.programVersions().length>=2&&/Programme history/.test(document.getElementById('view-train').textContent)),'plan: the programme history is shown');
/* LOG: a weigh-in from Today's next action, within budget */
await S(()=>window.switchTab('today'));await p.waitForTimeout(200);
const w0=await S(()=>window.obsOf('weight').length);
const nextItem=await S(()=>window.nextAction().item);
if(nextItem==='weigh-in'){taps=0;await tap('#view-today .next-action button');await p.fill('#logBackdrop.show input[type=number], #logBackdrop.show input[inputmode=decimal]','250.2');await tap('#logBackdrop.show .btn-primary');
  line(await S(n=>window.obsOf('weight').length===n+1,w0)&&taps<=2,'log: a weigh-in from Today takes '+taps+' taps (budget 2) plus typing the number');}
else{taps=0;await S(()=>window.dispatchAct('log.open','weight'));taps++;await p.waitForTimeout(200);await p.fill('#logBackdrop.show input[type=number], #logBackdrop.show input[inputmode=decimal]','250.2');await tap('#logBackdrop.show .btn-primary');
  line(await S(n=>window.obsOf('weight').length===n+1,w0)&&taps<=2,'log: a weigh-in takes '+taps+' taps (budget 2) plus typing the number');}
/* LOG: a food eaten often, again, within budget */
taps=0;await tap('[data-act="nav.tab"][data-arg="food"]');
await S(()=>{const d=[...document.querySelectorAll('#view-food details.fold')].find(x=>/Recent, frequent/.test(x.textContent));if(d)d.open=true;});
const f0=await S(()=>window.DB.foodLogs.length);
const hasAgain=await S(()=>!!document.querySelector('#view-food [data-act="food.again"]'));
if(hasAgain)await tap('#view-food [data-act="food.again"]');
line(hasAgain&&await S(n=>window.DB.foodLogs.length===n+1,f0)&&taps<=2,'log: a frequent food logged again in '+taps+' taps (budget 2)',hasAgain?'':'no Log again button');
/* LOG: activity and recovery through the log sheet */
await S(()=>window.dispatchAct('log.open','steps'));await p.waitForTimeout(200);
await p.fill('#logBackdrop.show input[type=number], #logBackdrop.show input[inputmode=numeric]','9100');await tap('#logBackdrop.show .btn-primary');
line(await S(()=>window.obsOf('steps',{from:window.todayISO(),to:window.todayISO()}).some(o=>o.value===9100)),'log: steps are recorded');
/* LOG: a barcode, typed */
await S(()=>window.dispatchAct('food.scan'));await p.waitForTimeout(200);
line(await S(()=>!!document.getElementById('scanManual')),'log: the barcode scanner offers typed entry');await S(()=>window.dispatchAct('scan.close'));
/* CARRY OUT: a workout from Today */
await S(()=>{localStorage.removeItem('physiqueOS_workout_draft');window.switchTab('today');});await p.waitForTimeout(200);
await S(()=>window.dispatchAct('workout.start'));await p.waitForTimeout(250);
const inWorkout=await S(()=>window._SHEET&&window._SHEET.opts&&window._SHEET.opts.form==='workout');
if(inWorkout){await p.fill('#wo-r-0','6');if(!(await S(()=>document.getElementById('wo-l-0').value)))await p.fill('#wo-l-0','100');
  await S(()=>['wo-r-0','wo-l-0'].forEach(id=>document.getElementById(id).dispatchEvent(new Event('input',{bubbles:true}))));
  await tap('button[data-act="workout.setDone"][data-arg="0"]');await S(()=>{window._WORKOUT.current=window._WORKOUT.exercises.length-1;window.renderSheet();});await p.waitForTimeout(120);
  await tap('button[data-act="workout.finish"]');await p.waitForTimeout(600);}
const sess=await S(()=>{const s=window.DB.sessions.slice(-1)[0];return s&&{id:s.id,src:s.source,sets:s.sets.length,summary:/How hard was that/.test(document.getElementById('editBackdrop').textContent)};});
line(inWorkout&&sess&&sess.src==='workout mode'&&sess.summary,'carry out: a workout runs from Today and opens its summary',JSON.stringify(sess));
/* REVIEW */
line(await S(()=>{const w=window.executionWeek();return w.status==='ok'&&w.tally.done>0;}),'review: the week\u2019s execution is read from the plan');
/* EDIT: correct the session; the original is superseded, not overwritten */
await S(()=>window.closeSheet&&window.closeSheet());
const edited=await S(id=>{const s=window.DB.sessions.find(x=>x.id===id);if(!s)return null;const r=window.updateSession(id,{notes:'corrected in the parity gate'});
  const orig=window.DB.sessions.find(x=>x.id===id);return {newId:r&&r.id,superseded:!!(orig&&orig.supersededBy),live:window.DB.sessions.filter(x=>!x.retracted&&!x.supersededBy&&x.notes==='corrected in the parity gate').length};},sess&&sess.id);
line(!!edited&&edited.superseded&&edited.live===1,'edit: a correction supersedes the original and keeps it',JSON.stringify(edited));
/* REPLAY: a day before the programme switch replays under the programme in force then */
const rep=await S(()=>{const V=window.programVersions();if(V.length<2)return null;const d=window.addDays(V[1].from,-3);
  return window.withAsOf(d,()=>({day:d,prog:window.trainingProgram().label,expect:V[0].label}));});
line(!!rep&&rep.prog===rep.expect,'replay: a past day shows the programme in force then',JSON.stringify(rep));
line(errors.length===0,'no errors in the page',errors.slice(0,2).join(' | '));
await browser.close();server.close();
console.log(failed?failed+' failed':'all passed');process.exit(failed?1:0);
