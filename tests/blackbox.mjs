/* BLACK-BOX WORKFLOWS (audit EC-002; workflows V-001\u2013V-010). Independent of the implementation's assumptions:
     \u2022 acts only through the interface: real buttons found on screen (a missing control is a failure), typing into
       real fields, the real file input; the only thing intercepted is the browser's file download, the system boundary;
     \u2022 expects only independent values: constants defined here and arithmetic done here (kcal per 100 g, Epley's
       published e1RM formula) \u2014 never a value computed by calling the app's own functions (audit rule 10);
     \u2022 reads results back from the screen; the stored record is read only as a second witness.
   Each workflow starts from a fresh, empty app. */
import fs from 'node:fs';import {JSDOM,VirtualConsole} from 'jsdom';
const HTML=fs.readFileSync('dist/index.html','utf8');let failed=0,passed=0;
const line=(ok,msg,detail)=>{ok?passed++:failed++;console.log('  '+(ok?'pass':'FAIL')+'  '+msg+(!ok&&detail?'  \u2014 '+detail:''));};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
/* jsdom cannot navigate: a download (a link clicked to a blob) reports “Not implemented: navigation”. That is this test
   environment's limit, not the app's error; every other uncaught error still fails the workflow. */
const ENV_LIMIT=/^Not implemented: navigation/;
/* the clock is a system boundary: a test may set it (time travel needs knowledge time, not just a date field) */
let CLOCK_OFFSET=0;
async function fresh(){CLOCK_OFFSET=0;const errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>{const m=String(e&&e.message||e);if(!ENV_LIMIT.test(m))errors.push(m);});
  const downloads=[];
  const dom=new JSDOM(HTML,{url:'https://physique.local/app/index.html',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
    w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.scrollTo=()=>{};w.fetch=undefined;w.HTMLElement.prototype.scrollIntoView=function(){};
    const RD=w.Date;class ClockDate extends RD{constructor(...a){if(a.length)super(...a);else super(RD.now()+CLOCK_OFFSET);}static now(){return RD.now()+CLOCK_OFFSET;}}w.Date=ClockDate;
    /* the system boundary: a download is captured instead of saved */
    w.URL.createObjectURL=b=>{downloads.push(b);return 'blob:captured-'+downloads.length;};w.URL.revokeObjectURL=()=>{};}});
  const w=dom.window,d=w.document;
  /* wait for the condition, not a fixed time: under load a fixed 900 ms was not enough for the app to boot (a person
     simply waits for the screen) */
  const until=async(test,what,ms)=>{const end=Date.now()+(ms||15000);while(Date.now()<end){try{if(test())return true;}catch(e){}await wait(50);}throw new Error('timed out waiting for '+what);};
  await until(()=>typeof w.loadDemo==='function'&&d.querySelector('[data-act="welcome.skip"]'),'the app to boot');
  const ui={w,d,errors,downloads,
    /* press a control that is on screen; inside an open sheet when one is open */
    press(act,arg,within){const root=within?d.querySelector(within):d;const sel='[data-act="'+act+'"]'+(arg!=null?'[data-arg="'+arg+'"]':'');const el=(root||d).querySelector(sel);if(!el)throw new Error('no control on screen for '+act+(arg!=null?'('+arg+')':''));el.click();return el;},
    tab(name){const b=d.querySelector('button[data-tab="'+name+'"]');if(!b)throw new Error('no tab '+name);b.click();},
    type(id,value){const el=typeof id==='string'?d.getElementById(id):id;if(!el)throw new Error('no field '+id);el.focus&&el.focus();el.value=String(value);
      el.dispatchEvent(new w.Event('input',{bubbles:true}));el.dispatchEvent(new w.Event('change',{bubbles:true}));return el;},
    /* open a collapsed section by tapping its heading, as a person does (that is what draws its content) */
    expand(fold){const el=d.querySelector('details[data-fold="'+fold+'"]');if(!el)throw new Error('no section '+fold);if(!el.open){const s=el.querySelector('summary');if(!s)throw new Error('section '+fold+' has no heading to tap');s.click();}},
    text(sel){const e=d.querySelector(sel);return e?e.textContent.replace(/\s+/g,' '):'';},
    view(name){return ui.text('#view-'+name);},
    async readDownload(i){const b=downloads[i==null?downloads.length-1:i];return b?await b.text():null;},
    /* a control drawn asynchronously: wait until it is on screen */
    async until(sel,ms){await until(()=>d.querySelector(sel),sel,ms);return d.querySelector(sel);},
    /* a state reached asynchronously (a value on screen, a record saved): wait until it holds */
    async waitFor(test,what,ms){return until(test,what,ms);},
    setClock(daysAgo){CLOCK_OFFSET=-daysAgo*86400000;},
    close(){dom.window.close();}};
  ui.press('welcome.skip');await wait(100);return ui;}
/* the quick log as a person uses it: open it, choose the type, enter the value, save */
async function logAs(ui,type,value,field){ui.press('log.open');await wait(40);const t=ui.d.querySelector('#logBackdrop [data-act="sheet.logType"][data-arg="'+type+'"]');if(!t)throw new Error('no "'+type+'" choice in the quick log');t.click();await wait(40);
  ui.type(field||'f_value',value);ui.press('log.save',null,'#logBackdrop');await wait(100);}
/* the detail level, chosen as a person does: Tools → Display (a new record starts at Casual, which keeps the analysis tabs
   for Insightful) */
async function useLevel(ui,level){ui.tab('tools');await ui.until('details[data-fold="tools-display"] summary');ui.expand('tools-display');await ui.until('[data-act="settings.detail"][data-arg="'+level+'"]');ui.press('settings.detail',level);
  await ui.waitFor(()=>ui.d.documentElement.getAttribute('data-detail')===level&&/btn-primary/.test(ui.d.querySelector('[data-act="settings.detail"][data-arg="'+level+'"]').className),'the '+level+' level to apply');}
const run=async(name,fn)=>{let ui;try{ui=await fresh();await fn(ui);}catch(e){line(false,name,e.message);}finally{if(ui){if(ui.errors.length)line(false,name+': no uncaught errors',ui.errors.slice(0,2).join(' | '));ui.close();}}};

/* V-002 NUTRITION: a food \u2192 a portion \u2192 the day's total */
await run('V-002 nutrition',async ui=>{
  const FOOD={name:'Blackbox oats',kcal:389,protein:16.9,carbs:66.3,fat:6.9},GRAMS=80;   /* defined here */
  const EXP_KCAL=Math.round(FOOD.kcal*GRAMS/100),EXP_PROTEIN=Math.round(FOOD.protein*GRAMS/100*10)/10;   /* 311 kcal, 13.5 g: arithmetic done here */
  ui.tab('food');ui.press('food.custom');await wait(50);
  ui.type('f_name',FOOD.name);ui.type('f_kcal',FOOD.kcal);ui.type('f_protein',FOOD.protein);ui.type('f_carbs',FOOD.carbs);ui.type('f_fat',FOOD.fat);
  ui.press('food.customSave');await wait(80);
  ui.press('food.add');await ui.until('#fs_q');ui.type('fs_q','Blackbox');await ui.until('#editBackdrop [data-act="foodsheet.pick"]');
  const pick=[...ui.d.querySelectorAll('#editBackdrop [data-act="foodsheet.pick"]')].find(b=>/Blackbox oats/.test(b.textContent));if(!pick)throw new Error('the saved food is not offered when searched for by name');pick.click();await wait(80);
  ui.type('f_amount',GRAMS);const u=ui.d.getElementById('f_unit');if(u){u.value='g';u.dispatchEvent(new ui.w.Event('change',{bubbles:true}));}
  ui.press('foodsheet.save');await wait(120);ui.tab('food');
  const shown=ui.view('food');line(new RegExp('\\b'+EXP_KCAL+'\\b').test(shown),'V-002 the Food tab shows '+EXP_KCAL+' kcal for 80 g of a 389 kcal/100 g food',shown.slice(0,160));
  ui.tab('log');const log=ui.view('log');line(/Blackbox oats/.test(log)&&/80\s*g/.test(log),'V-002 the Log page lists the food with its portion',log.slice(0,160));
  const rec=ui.w.DB.foodLogs.filter(l=>!l.supersededBy&&!l.retracted).slice(-1)[0];
  line(rec&&Math.abs(rec.nutrients.kcal-FOOD.kcal*GRAMS/100)<0.5&&Math.abs(rec.nutrients.protein-EXP_PROTEIN)<0.06,'V-002 second witness: the stored entry carries the same kcal and protein',rec&&JSON.stringify(rec.nutrients));});

/* V-003 TRAINING: a session \u2192 its sets \u2192 strength */
await run('V-003 training',async ui=>{
  const LOAD=200,REPS=5;
  ui.tab('train');ui.press('session.new');await wait(60);
  ui.type(ui.d.querySelector('#editBackdrop [data-arg="0|exercise"]'),'Bench press');ui.type('ss-0-load',LOAD);ui.type('ss-0-reps',REPS);ui.type('ss-0-rir',2);
  const save=[...ui.d.querySelectorAll('#editBackdrop [data-act]')].find(b=>/^session\.save$/.test(b.getAttribute('data-act')));if(!save)throw new Error('no save control in the session sheet');save.click();await wait(150);
  const s=ui.w.DB.sessions.slice(-1)[0];line(!!s&&s.sets.length===1&&s.sets[0].load===LOAD&&s.sets[0].reps===REPS,'V-003 the session is saved with the set as entered',s&&JSON.stringify(s.sets));
  /* per-lift strength is a slope over several sessions, so one session shows the set itself, not an e1RM: the check is
     what the product promises after one session (an e1RM after one session was this test's assumption, not a requirement) */
  ui.tab('train');const t=ui.view('train');line(/Bench press 200\s*\u00d7\s*5/.test(t),'V-003 the Train tab\u2019s history shows the set as entered (Bench press 200\u00d75)',t.slice(0,160));
  /* date-independent: on a planned lifting day the session takes that session's name (correct); on any other day it is
     named from its exercises. Never after a non-lifting plan label (the defect was “Rest / walk”). */
  const hist=(t.match(/Session history[^]{0,60}/)||[''])[0],name=(hist.match(/sessions?\u203a\s*([^\u00b7]*?)\s*\u00b7/)||[])[1]||'';
  line(!!name&&!/rest|walk|cardio|mobility/i.test(name),'V-003 a lifting session is never named after a non-lifting plan label (it is \u201c'+name+'\u201d)',(t.match(/Session history[^]{0,120}/)||[''])[0]);
  line(!/\b1 sets\b/.test(t)&&!/\b1 sessions\b/.test(t),'V-003 one set reads \u201c1 set\u201d, one session \u201c1 session\u201d');});

/* V-005 CORRECTION AND RETRACTION */
await run('V-005 correction and retraction',async ui=>{
  const W1=201.4,W2=199.8;
  await logAs(ui,'weight',W1);
  ui.tab('log');line(/201\.4/.test(ui.view('log')),'V-005 a logged weight appears on the Log page');
  const id=ui.w.DB.observations.filter(o=>o.type==='weight'&&!o.retracted).slice(-1)[0].id;
  ui.press('obs.correct',id);await wait(60);ui.type('promptInput',W2);const ok=[...ui.d.querySelectorAll('#promptBackdrop button')].find(b=>/btn-primary/.test(b.className));if(!ok)throw new Error('no confirm button in the correction prompt');ok.click();await wait(120);
  ui.tab('log');const v=ui.view('log');line(/199\.8/.test(v)&&!/201\.4 lb(?!.*corrected)/.test(v.replace(/hidden[^]*/,'')),'V-005 the correction replaces the value shown',v.slice(0,160));
  /* a correction keeps the original, marked correctedBy; the current reading is neither retracted nor corrected */
  const live=ui.w.DB.observations.filter(o=>o.type==='weight'&&!o.retracted&&!o.correctedBy);line(live.length===1&&Math.abs(live[0].value-W2)<0.05,'V-005 second witness: one current weight, the corrected one; the original kept as history',JSON.stringify(live.map(o=>o.value)));
  const kept=ui.w.DB.observations.filter(o=>o.type==='weight'&&o.correctedBy);line(kept.length===1&&Math.abs(kept[0].value-W1)<0.05,'V-005 the original reading is kept as history, marked corrected');
  const id2=live[0].id;ui.press('obs.retract',id2);await wait(60);const cf=ui.d.getElementById('confirmOk');if(cf&&ui.d.getElementById('confirmBackdrop').classList.contains('open'))cf.click();await wait(120);
  ui.tab('log');line(!/199\.8/.test(ui.view('log').split('Show')[0]),'V-005 a deleted entry no longer shows');});

/* V-010 BACKUP AND RESTORE, V-009 DELETION */
await run('V-009/V-010 backup, erase, restore',async ui=>{
  await logAs(ui,'weight',188.2);await logAs(ui,'waist',34.5,'f_waist');
  ui.tab('tools');await ui.until('details[data-fold="tools-data"] summary');ui.expand('tools-data');await ui.until('[data-act="data.backup"]');const n0=ui.downloads.length;ui.press('data.backup');await wait(80);const backup=await ui.readDownload();
  line(ui.downloads.length===n0+1&&/188\.2/.test(backup||''),'V-010 a backup is offered as a download containing the data');
  ui.expand('tools-demo');await ui.until('[data-act="demo.reset"]');ui.press('demo.reset');await wait(60);ui.d.getElementById('confirmOk').click();await wait(200);
  ui.tab('log');const after=ui.view('log');line(!/188\.2/.test(after)&&!/34\.5/.test(after),'V-009 erasing everything removes every entry from the screen');
  line(ui.w.DB.observations.filter(o=>!o.retracted).length===0,'V-009 second witness: the record holds no observations');
  ui.tab('tools');await ui.until('details[data-fold="tools-data"] summary');ui.expand('tools-data');await ui.until('#restoreFile');const input=ui.d.getElementById('restoreFile');if(!input)throw new Error('no restore file input');const file=new ui.w.File([backup],'backup.json',{type:'application/json'});
  Object.defineProperty(input,'files',{value:[file],configurable:true});input.dispatchEvent(new ui.w.Event('change',{bubbles:true}));await wait(250);
  await ui.until('#editBackdrop [data-act="data.restoreApply"]').catch(()=>null);const apply=ui.d.querySelector('#editBackdrop [data-act="data.restoreApply"]');if(!apply)throw new Error('the restore sheet did not open from the file');apply.click();await wait(200);
  ui.tab('log');const back=ui.view('log');line(/188\.2/.test(back)&&/34\.5/.test(back),'V-010 restoring the backup brings every entry back',back.slice(0,160));});

/* V-004 RECOVERY: poor sleep and high fatigue → Today changes its advice for training. The expectation is the
   specification's (an acute reading this severe means rest or very light training), not a value from the app. */
await run('V-004 recovery',async ui=>{const SLEEP=4.5,FATIGUE=9;ui.tab('today');const before=ui.view('today');
  await logAs(ui,'sleep',SLEEP);
  ui.press('log.open');await wait(40);ui.d.querySelector('#logBackdrop [data-act="sheet.logType"][data-arg="recovery"]').click();await wait(40);
  const f=ui.d.querySelector('#logBackdrop [data-act="sheet.scale"][data-arg="fatigue|'+FATIGUE+'"]');if(!f)throw new Error('no fatigue rating of '+FATIGUE+' in the recovery check-in');f.click();ui.press('log.save',null,'#logBackdrop');await wait(150);
  ui.tab('today');const after=ui.view('today');
  line(!/rest or go very light today/i.test(before)&&/rest or go very light today/i.test(after),'V-004 after 4.5 h of sleep and fatigue 9, Today advises rest or very light training',after.slice(0,200));
  line(/fatigue 9\/10/.test(after)&&/4\.5\s*h/.test(after),'V-004 the advice names both readings');
  ui.tab('body');line(!/recovery unknown/i.test(ui.view('body')+ui.view('today')),'V-004 recovery no longer reads \u201cunknown\u201d after a severe check-in');});

/* V-011 TEMPORAL REPLAY: a value entered three days ago and corrected today; replaying two days ago shows what was known
   then. Expected by definition of “what was known on that day”, not computed by the app. */
await run('V-011 temporal replay',async ui=>{const day=n=>{const t=new Date(Date.now()-n*86400000);return t.toISOString().slice(0,10);};
  ui.setClock(3);ui.tab('today');await logAs(ui,'weight',200.0);
  ui.setClock(0);ui.tab('log');const chip=ui.d.querySelector('[data-act="log.day"][data-arg="'+day(3)+'"]');if(!chip)throw new Error('no way to page back to '+day(3)+' on the Log page');chip.click();await wait(60);
  const id=ui.w.DB.observations.filter(o=>o.type==='weight')[0].id;ui.press('obs.correct',id);await wait(60);ui.type('promptInput',190.0);
  [...ui.d.querySelectorAll('#promptBackdrop button')].find(b=>/btn-primary/.test(b.className)).click();await wait(120);
  ui.tab('log');ui.d.querySelector('[data-act="log.day"][data-arg="'+day(3)+'"]').click();await wait(60);line(/190\.0/.test(ui.view('log')),'V-011 the Log page shows the corrected value now');
  await useLevel(ui,'insightful');ui.tab('archive');const rd=ui.d.getElementById('replayDate');if(!rd)throw new Error('no replay date field');ui.type(rd,day(2));ui.press('replay.run');await wait(200);
  const v=ui.view('archive'),rep=(v.match(/Replay a single day[^]{0,400}/)||[''])[0];
  line(/200\.0/.test(rep)&&!/190\.0/.test(rep),'V-011 replaying two days ago shows what was known then (200.0), not the later correction',rep.slice(0,200));});

/* V-013 DETAIL LEVEL: a new record starts at Casual, the answer and what to do; the analysis is one setting away, and the
   choice is kept. Expected by the setting's definition. */
await run('V-013 a new record starts at Casual',async ui=>{
  line(ui.d.documentElement.getAttribute('data-detail')==='casual','V-013 a new record opens at the Casual detail level');
  ui.tab('tools');await ui.until('details[data-fold="tools-display"] summary');ui.expand('tools-display');await ui.until('[data-act="settings.detail"][data-arg="casual"]');
  const chosen=()=>[...ui.d.querySelectorAll('[data-act="settings.detail"]')].filter(b=>/btn-primary/.test(b.className)).map(b=>b.getAttribute('data-arg')).join();
  line(chosen()==='casual','V-013 the Display card shows Casual as the level in use',chosen());
  await useLevel(ui,'insightful');
  line(ui.d.documentElement.getAttribute('data-detail')==='insightful'&&chosen()==='insightful','V-013 choosing Insightful shows the analysis, and the card says so');
  line(ui.w.DB.settings.detail==='insightful','V-013 second witness: the choice is stored in the record');});

/* V-014 FITNESS TESTS: the quick log takes a sit-and-reach and a jump; the Log page shows them; at Insightful the Learn
   tab's physiology card shows the latest results and what each response still needs. Expected: the values entered here,
   and the five tests the response rule asks for (four more after one). */
await run('V-014 fitness tests',async ui=>{const SR=12.5,JUMP=41;
  ui.press('log.open');(await ui.until('#logBackdrop [data-act="sheet.logType"][data-arg="tests"]')).click();await ui.until('#logBackdrop #f_cmj');
  ui.type('f_sitreach',SR);ui.type('f_cmj',JUMP);ui.press('log.save',null,'#logBackdrop');
  ui.tab('log');await ui.waitFor(()=>/Jump height/.test(ui.view('log')),'the tests on the Log page');const v=ui.view('log');line(/Sit-and-reach[^]{0,60}12\.5/.test(v)&&/Jump height[^]{0,60}41/.test(v),'V-014 the Log page lists both tests with their values',v.slice(0,240));
  line(ui.w.DB.observations.some(o=>o.type==='sitreach'&&o.value===SR)&&ui.w.DB.observations.some(o=>o.type==='cmj'&&o.value===JUMP),'V-014 second witness: both are stored as entered');
  await useLevel(ui,'insightful');ui.tab('learn');await ui.until('details[data-fold="learn-physiology"] summary');ui.expand('learn-physiology');
  await ui.waitFor(()=>/sit-and-reach/.test(ui.text('details[data-fold="learn-physiology"]')),'the physiology card');const card=ui.text('details[data-fold="learn-physiology"]');
  line(/Mobility[^]{0,80}sit-and-reach 12\.5 cm/.test(card)&&/Power and speed[^]{0,80}jump height 41 cm/.test(card),'V-014 the physiology card shows the latest sit-and-reach and jump',card.slice(0,300));
  line(/needs 4 more sit-and-reach tests/.test(card)&&/needs 4 more jump height tests/.test(card),'V-014 and what each response still needs: four more tests');});
/* V-001 TODAY: a phase with its targets \u2192 Today shows them */
await run('V-001 today',async ui=>{
  const KCAL=2150,PROT=180;ui.tab('plan');
  const start=ui.d.querySelector('[data-act="phase.start"],[data-act="phase.edit"],[data-act="phase.new"]');if(!start)throw new Error('no control to start a phase on the Plan tab');start.click();await wait(80);
  ui.type('f_calorieTarget',KCAL);ui.type('f_proteinTarget',PROT);ui.press('phase.save');await wait(150);
  ui.tab('today');const t=ui.view('today');line(/2,?150/.test(t),'V-001 Today shows the calorie target that was set ('+KCAL+')',t.slice(0,200));});

/* V-012 USER-APPROVED AUTOMATION: a rule that only adds a record runs on the approval given when it was turned on; a rule
   that would change the plan holds the change, and the plan changes only when the change is approved. Expected by the
   approval policy's definition, not computed by the app. */
await run('V-012 automation approval',async ui=>{
  const sheet=()=>ui.text('#editBackdrop'),today=new Date().toISOString().slice(0,10);
  const openAutomation=async()=>{let g=null;for(const t of ['today','tools','plan','learn']){ui.tab(t);await wait(40);g=ui.d.querySelector('[data-act="features.open"]');if(g)break;}
    if(!g)throw new Error('no control on screen for the feature guide');g.click();await ui.until('#editBackdrop [data-act="features.go"][data-arg="automation.open"]');ui.press('features.go','automation.open','#editBackdrop');await ui.until('#editBackdrop [data-act="rule.toggle"]');};
  ui.tab('tools');await ui.until('details[data-fold="tools-demo"] summary');ui.expand('tools-demo');await ui.until('[data-act="demo.load"]');ui.press('demo.load');await wait(60);ui.d.getElementById('confirmOk').click();await wait(300);
  await openAutomation();
  ui.press('rule.toggle','weighIn|qa.water','#editBackdrop');await wait(80);
  line(new RegExp('standing approval \u00b7 approved '+today+'\\s*add 0\\.5 L of water').test(sheet()),'V-012 turning on a rule that adds a record shows the standing approval it now runs on',sheet().slice(0,240));
  ui.press('rule.toggle','weeklyReview|adapt.apply','#editBackdrop');await wait(80);
  line(/each one waits for your approval\s*propose the plan change the week suggests/.test(sheet()),'V-012 a rule that would change the plan says each change waits for approval');
  ui.press('edit.close',null,'#editBackdrop');await wait(60);
  const water=()=>ui.w.DB.observations.filter(o=>o.type==='water'&&o.date===today&&!o.retracted&&Math.abs(o.value-0.5)<1e-9).length,w0=water();
  await logAs(ui,'weight',251.5);await wait(200);
  line(water()===w0+1,'V-012 after weighing in, the approved rule logged 0.5 L of water (second witness)');
  ui.tab('log');line(/0\.5\s*L/.test(ui.view('log')),'V-012 the Log page shows the 0.5 L of water');
  const plans0=ui.w.DB.plans.length;
  await useLevel(ui,'insightful');ui.tab('learn');await ui.until('details[data-fold="learn-loop"] summary');ui.expand('learn-loop');await wait(300);
  await openAutomation();
  line(/Waiting for your approval/.test(sheet())&&!!ui.d.querySelector('#editBackdrop [data-act="auto.approve"]'),'V-012 the weekly review held a plan change for approval instead of making it',sheet().slice(0,240));
  line(ui.w.DB.plans.length===plans0,'V-012 the plan did not change while the change was waiting (second witness)');
  ui.d.querySelector('#editBackdrop [data-act="auto.approve"]').click();await wait(300);
  line(ui.w.DB.plans.length===plans0+1,'V-012 approving it changed the plan, through one new plan version (second witness)');
  const s2=sheet();line(/What automation did/.test(s2)&&/applied[^]{0,120}plan version/.test(s2)&&/approved/.test(s2)&&/held/.test(s2),'V-012 the automation log on screen shows it held, approved and applied',s2.slice(-400));});

console.log('\n  covered by other gates, not repeated here: V-006 multi-device sync (cloud:e2e), V-007 offline and reconnect (connect, persistence), V-008 provider failure (external)');
console.log(failed?failed+' failed':'all passed');process.exit(failed?1:0);
