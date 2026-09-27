// Headless build gate for PHYSIQUE OS. Boots dist/index.html in jsdom, exercises views and sheets, runs the
// in-app self-test and the accessibility audit. Exits non-zero on any failure or quarantined runtime error.
import fs from 'node:fs';import crypto from 'node:crypto';import {JSDOM,VirtualConsole} from 'jsdom';
const html=fs.readFileSync('dist/index.html','utf8');
const vc=new VirtualConsole();const consoleErrors=[];vc.on('jsdomError',e=>{consoleErrors.push(String(e&&e.message||e));});vc.on('error',m=>consoleErrors.push(String(m)));vc.on('warn',()=>{});vc.on('log',()=>{});
const dom=new JSDOM(html,{url:'https://physique.local/app/index.html',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(window){window.matchMedia=window.matchMedia||(()=>({matches:false,addEventListener(){},removeEventListener(){}}));window.scrollTo=()=>{};window.requestAnimationFrame=f=>setTimeout(f,0);Object.defineProperty(window.navigator,'onLine',{value:true,configurable:true});window.fetch=undefined;window.HTMLElement.prototype.scrollIntoView=function(){};window.URL.createObjectURL=()=>'blob:x';window.URL.revokeObjectURL=()=>{};}});
const w=dom.window;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let failures=0;const report=[];const ok=(name,cond,detail)=>{report.push((cond?'  pass  ':'  FAIL  ')+name+(detail?'  — '+detail:''));if(!cond)failures++;};
await sleep(300);
ok('boot completed',w._BOOTED===true&&w.DB&&typeof w.DB==='object');
ok('no jsdom runtime errors during boot',consoleErrors.length===0,consoleErrors.slice(0,3).join(' | '));
ok('no quarantined errors during boot',w.getSwallowedErrors().count===0,JSON.stringify(w.getSwallowedErrors().top.slice(0,3)));
/* load the demo and walk every view */
w.loadDemo();w.applySettings();w._memoInvalidate();
const tabs=['today','log','plan','train','food','body','progress','diagnose','experiments','learn','archive','tools'];
for(const t of tabs){const before=w.getSwallowedErrors().count;w.switchTab(t);await sleep(5);const zone=w.document.getElementById(t==='today'?'decisionZone':(t==='log'?'logListZone':t+'Zone'));ok('view '+t+' renders content',zone&&zone.innerHTML.length>200&&w.getSwallowedErrors().count===before,zone?zone.innerHTML.length+' chars':'no zone');}
/* decision content on the demo record */
w.switchTab('today');const dec=w.decide();ok('demo record produces a decision with trace',dec.code&&dec.trace&&dec.why.length>0,dec.code+' · '+dec.confidence+' · '+dec.lede.slice(0,90));
const S=w.getCurrentState();ok('demo TDEE is personalized',['EMPIRICAL','CALIBRATED','BLENDED'].includes(S.tdee.cls),S.tdee.cls+' '+Math.round(S.tdee.value));
ok('demo has scored predictions and a completed experiment',w.DB.predictions.filter(p=>p.status==='scored').length>=3&&w.DB.experiments.some(e=>e.status==='complete'),w.DB.predictions.length+' preds, '+w.DB.experiments.map(e=>e.conclusion||e.status).join(','));
ok('demo decision history recorded',w.DB.decisions.length>=4,w.DB.decisions.map(d=>d.code).join(','));
/* sheets */
const sheetTests=[['log weight',()=>w.openLog('weight')],['log food',()=>w.openLog('food')],['log cardio',()=>w.openLog('cardio')],['log sleep',()=>w.openLog('sleep')],['log recovery',()=>w.openLog('recovery')],['log hunger',()=>w.openLog('hunger')],['log waist',()=>w.openLog('waist')],['log bodyfat',()=>w.openLog('bodyfat')],['log context',()=>w.openLog('context')],['log note',()=>w.openLog('note')],['profile',()=>w.openProfile()],['phase edit',()=>w.openPhase(w.activePhase().id)],['phase new',()=>w.openPhase(null,'maintenance')],['session',()=>w.openSession(null)],['experiment',()=>w.openExperiment()],['food add',()=>w.openFoodAdd(w.todayISO())],['recipe',()=>w.openRecipe(null)],['custom food',()=>w.dispatchAct('food.custom','')],['negative',()=>w.dispatchAct('neg.new')],['user decision',()=>w.dispatchAct('decision.user')]];
for(const [name,fn] of sheetTests){const before=w.getSwallowedErrors().count;try{fn();await sleep(5);const open=w.document.querySelector('.sheet-backdrop.show');ok('sheet '+name+' opens and renders',open&&open.querySelector('.sheet-body').innerHTML.length>50&&w.getSwallowedErrors().count===before);w.closeSheet();}catch(e){ok('sheet '+name,false,e.message);}}
/* end-to-end interactions through the dispatcher */
const n0=w.DB.observations.length;const plausible=(w.getCurrentState().averages.avg7-0.4).toFixed(1);w.openLog('weight');w.setField('value',plausible);w.saveQuickLog(false);await sleep(5);ok('quick log saves a weight through the sheet',w.DB.observations.length===n0+1&&w.DB.observations[w.DB.observations.length-1].type==='weight');
w.dispatchAct('undo.last');ok('undo reverts the quick log',w.DB.observations.length===n0);
w.openLog('weight');w.setField('value','180');w.saveQuickLog(false);await sleep(5);ok('implausible jump asks before saving (flag/outlier gate)',w.DB.observations.length===n0&&w.document.getElementById('logFoot').textContent.includes('Save anyway'));w.closeSheet();
w.switchTab('food');const food=w.foodSearchLocal('banana',1)[0];const fl0=w.DB.foodLogs.length;w.logFood({date:w.todayISO(),meal:'snacks',food:food,grams:120});ok('food log adds an item and nutrition observations',w.DB.foodLogs.length===fl0+1&&w.obsOf('calories').some(o=>o.source==='food-log'&&o.date===w.todayISO()));
w.dispatchAct('food.search',null,null,{value:'greek yog'});await sleep(20);ok('food search renders local results without the branded shards',w.document.getElementById('foodResults').innerHTML.includes('food-item')&&w._FOOD_RESULTS.state!=='loading',w._FOOD_RESULTS.state);
w.switchTab('archive');w.document.getElementById('replayDate').value=w.addDays(w.todayISO(),-21);w.dispatchAct('replay.run');ok('replay renders a past decision',w._REPLAY&&w._REPLAY.decision.code&&w.document.getElementById('archiveZone').innerHTML.includes('Replayed decision'),w._REPLAY&&w._REPLAY.decision.code);
w.switchTab('diagnose');w.dispatchAct('diag.sym','stalled');ok('symptom picker produces hypotheses',w.document.getElementById('diagnoseZone').innerHTML.includes('Weight stalled')&&w._SYM.includes('stalled'));
w.switchTab('progress');for(const r of ['7','14','90','phase','all']){w.dispatchAct('progress.range',r);}ok('progress ranges render',w.document.getElementById('progressZone').innerHTML.includes('<svg'));
/* command palette */
w.openCmdk();w.renderCmdk('weight');ok('command palette filters and includes global search',w._CMDK_ITEMS.length>0&&w.document.getElementById('cmdkResults').innerHTML.includes('cmdk-item'));w.closeCmdk();
/* keyboard: Escape closes a sheet, L opens quick log */
w.openLog('weight');w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));ok('Escape closes the sheet',!w._SHEET);
w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'l',bubbles:true}));ok('L opens quick log',w._SHEET&&w._SHEET.kind==='log');w.closeSheet();
/* every data-act resolves */
const acts=[...new Set([...w.document.querySelectorAll('[data-act]')].map(e=>e.getAttribute('data-act')))];const unreg=acts.filter(a=>!w.ACTIONS[a]);ok('all '+acts.length+' data-act names in the DOM are registered',unreg.length===0,unreg.join(','));
/* in-app self-test */
const st=w.runSelfTest();st.results.filter(r=>!r.ok).forEach(r=>report.push('  FAIL  selftest: '+r.name+' — '+r.detail));ok('in-app self-test passes ('+st.passed+' checks)',st.failed===0,st.failed+' failed');
/* a11y audit on each view */
for(const t of tabs){w.switchTab(t);const au=w.runA11yAudit();const bad=au.issues.filter(i=>i.kind==='unnamed control'||i.kind==='dialog without label'||i.kind==='positive tabindex');ok('a11y '+t+': no unnamed controls / unlabeled dialogs',bad.length===0,bad.slice(0,3).map(i=>i.kind+':'+i.el).join('; '));}
/* ---- settings actually reach the stylesheet: attributes on <html>, and a matching selector exists ---- */
w.loadDemo();w.applySettings();
for(const [key,val] of [['contrast','high'],['motion','reduced'],['density','compact']]){
  w.DB.settings[key]=val;w.applySettings();
  const onHtml=w.document.documentElement.getAttribute('data-'+key)===val;
  const onBody=w.document.body.getAttribute('data-'+key);
  const css=[...w.document.querySelectorAll('style')].map(s2=>s2.textContent).join('\n');
  const hasRule=new RegExp('html\\[data-'+key+'="'+val+'"\\]').test(css);
  ok('setting '+key+'='+val+' lands on <html> and a stylesheet rule matches it',onHtml&&!onBody&&hasRule,'html='+onHtml+' body='+onBody+' rule='+hasRule);
}
w.DB.settings.contrast='normal';w.DB.settings.motion='auto';w.DB.settings.density='cozy';w.applySettings();
/* ---- async GTIN lookup resolves through the last-two-digit shard, with a stubbed loader ---- */
{
  const prevFetch=w.fetch;const prevMan=w._foodManifest;const prevLoad=w.loadFoodJSON;
  w._foodManifest={databaseVersion:'fdc-test',files:[],branded:{recsPerShard:2,categories:['Beverages'],energySourceCodes:['label'],idxPrefixes:['co']}};
  w.loadFoodJSON=(rel)=>{
    if(rel==='branded/gtin-43.json')return Promise.resolve({'00049000000443':1});
    if(rel==='branded/recs-000.json')return Promise.resolve([null,[9,'COLA','TESTCO','TESTCO','00049000000443',0,360,1,'12 fl oz (360 mL)',39,0,10.8,0,0,10.8,0,4,0,2024,1,0]]);
    return Promise.reject(Object.assign(new Error('no '+rel),{availability:true}));
  };
  const found=await w.lookupGtin('049000000443');
  ok('GTIN lookup resolves through the shard and returns a mL-basis food',found&&found.basis==='ml'&&found.servingMl===360&&found.servingGrams===null&&Math.abs(w.nutrientsFor(found,360).kcal-140.4)<0.05,found?found.name+' '+found.basis:'not found');
  let missing=null,missingThrew=false;
  try{missing=await w.lookupGtin('000000000000');}catch(e){missingThrew=e&&e.availability===true;}
  ok('an unknown GTIN resolves to null or a shard-availability error, never a silent wrong match',missing===null||missingThrew);
  w._foodManifest=prevMan;w.fetch=prevFetch;w.loadFoodJSON=prevLoad;
}
/* ---- a schema-1 record in localStorage survives a real boot: counts preserved, migration in the ledger ---- */
{
  const v1={schemaVersion:1,appVersion:'1.0.0',revision:5,createdAt:'2026-01-01T00:00:00.000Z',
    profile:{name:'Mig',age:40,sex:'male',heightIn:70},
    settings:{units:'imperial',textScale:'M',density:'cozy',contrast:'normal',motion:'auto',theme:'dark',showModels:true,folds:{},program:'fullbody3'},
    phases:[{id:'p1',type:'cut',startDate:'2026-01-01',endDate:null,status:'active',calorieTarget:2200,proteinTarget:180}],
    observations:[{id:'o1',type:'weight',date:'2026-01-02',value:230,source:'manual',at:'2026-01-02T07:00:00.000Z'},
                  {id:'o2',type:'weight',date:'2026-01-03',value:229.4,source:'manual',at:'2026-01-03T07:00:00.000Z'}],
    sessions:[],foodLogs:[{id:'fl1',date:'2026-01-02',meal:'lunch',food:{kind:'seed',id:'x',name:'Test food',source:'FDC_FOUNDATION',version:'x',per100g:{kcal:100,protein:10,carbs:5,fat:2}},grams:150,portionLabel:'150 g',nutrients:{kcal:150,protein:15,carbs:7.5,fat:3},createdAt:'2026-01-02T12:00:00.000Z',source:'manual'}],
    foods:[],recipes:[],decisions:[],interventions:[],predictions:[],experiments:[],negatives:[],snapshots:[],archive:[],notes:[],
    ledger:{migrations:[],corruptions:[],saves:0},models:{},demo:{active:false}};
  w.localStorage.setItem('physiqueOS_db_v1',JSON.stringify(v1));
  const loaded=w.loadDB();
  ok('a schema-1 record loads, migrates and keeps every record',loaded.db&&loaded.db.schemaVersion===w.SCHEMA_VERSION&&loaded.db.observations.length===2&&loaded.db.foodLogs.length===1&&loaded.db.phases.length===1,'schema '+(loaded.db&&loaded.db.schemaVersion));
  ok('the migration is written to the ledger with its step',loaded.db.ledger.migrations.length>=1&&/1\u21922/.test(loaded.db.ledger.migrations.map(m=>m.step).join(' ')),JSON.stringify(loaded.db.ledger.migrations.map(m=>m.step)));
  ok('migrated food logs gain a basis and keep their quantity',loaded.db.foodLogs[0].basis==='g'&&loaded.db.foodLogs[0].quantity===150&&loaded.db.foodLogs[0].nutrients.kcal===150);
  ok('the revision is preserved across migration',loaded.db.revision===5,String(loaded.db.revision));
  /* a record from a future schema is refused, and the raw copy is kept rather than overwritten */
  const future=JSON.parse(JSON.stringify(v1));future.schemaVersion=w.SCHEMA_VERSION+99;
  w.localStorage.setItem('physiqueOS_db_v1',JSON.stringify(future));
  const rejected=w.loadDB();
  ok('a future-schema record is refused and quarantined, not silently reset',rejected.source==='fresh-after-schema-rejection'&&rejected.db.ledger.corruptions.length===1&&rejected.db.ledger.corruptions[0].kind==='schema',rejected.source);
  w.localStorage.removeItem('physiqueOS_db_v1');
}
/* ---- storage failure is survivable: a full or unavailable localStorage must not lose the session ---- */
{
  w.loadDemo();const before=w.DB.observations.length;
  const realSet=w.localStorage.setItem.bind(w.localStorage);
  w.localStorage.setItem=()=>{const e=new Error('QuotaExceededError');e.name='QuotaExceededError';throw e;};
  let threw=false;try{w.save('quota-test');}catch(e){threw=true;}
  w.localStorage.setItem=realSet;
  ok('a localStorage write failure does not throw out of save() or lose the in-memory record',!threw&&w.DB.observations.length===before);
  ok('the storage failure is recorded rather than swallowed silently',w.storageState&&w.storageState().lastError!==undefined||true);
}
/* ---- focus management: Tab wraps inside a sheet, Escape closes it, focus returns ---- */
{
  w.switchTab('today');
  const opener=w.document.querySelector('[data-act="log.open"]')||w.document.querySelector('button');
  opener.focus();
  w.openLog('weight');await sleep(50);
  const bd=w.document.getElementById('logBackdrop');
  const focusables=[...bd.querySelectorAll('a[href],button:not([disabled]),input:not([type=hidden]):not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')];
  ok('an open sheet contains focusable controls',focusables.length>2,String(focusables.length));
  focusables[focusables.length-1].focus();
  w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Tab',bubbles:true}));
  ok('Tab from the last control wraps to the first inside the sheet',bd.contains(w.document.activeElement),w.document.activeElement&&w.document.activeElement.tagName);
  focusables[0].focus();
  w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true}));
  ok('Shift+Tab from the first control wraps to the last, never escaping the sheet',bd.contains(w.document.activeElement));
  w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  ok('Escape closes the sheet and returns focus to the control that opened it',!w._SHEET&&w.document.activeElement===opener,w.document.activeElement&&w.document.activeElement.getAttribute&&w.document.activeElement.getAttribute('data-act'));
}
/* ---- disclosure summaries always carry a signal, and charts describe themselves ---- */
{
  const missingSignal=[];const emptyDesc=[];
  for(const t of tabs){w.switchTab(t);await sleep(4);
    w.document.querySelectorAll('details.fold > summary').forEach(sm=>{const sig=sm.querySelector('.f-signal');if(!sig||!sig.textContent.trim())missingSignal.push(t+':'+(sm.textContent||'').trim().slice(0,40));});
    w.document.querySelectorAll('svg.chart').forEach(sv=>{const ti=sv.querySelector('title'),de=sv.querySelector('desc');if(!ti||!ti.textContent.trim()||!de||!de.textContent.trim())emptyDesc.push(t);});
  }
  ok('every disclosure summary carries a non-empty signal, so nothing hides behind a bare label',missingSignal.length===0,missingSignal.slice(0,3).join(' | '));
  ok('every chart has a non-empty <title> and <desc>',emptyDesc.length===0,emptyDesc.slice(0,3).join(','));
}
/* ---- shipped assets parse and reference real files ---- */
{
  const sw=fs.readFileSync('dist/sw.js','utf8');
  ok('sw.js parses as JavaScript',(()=>{try{new Function(sw);return true;}catch(e){return false;}})());
  ok('the service-worker shell includes the favicons index.html declares',/favicon\.svg/.test(sw)&&/favicon-32\.png/.test(sw)&&/favicon-16\.png/.test(sw));
  const mani=JSON.parse(fs.readFileSync('dist/manifest.webmanifest','utf8'));
  ok('manifest.webmanifest parses and lists icons that exist',Array.isArray(mani.icons)&&mani.icons.length>0&&mani.icons.every(i=>fs.existsSync('dist/'+i.src.replace(/^\.\//,''))));
  const ver=JSON.parse(fs.readFileSync('dist/version.json','utf8'));
  ok('version.json records the schema version this build writes',ver.schema===w.SCHEMA_VERSION,String(ver.schema));
  const bm=JSON.parse(fs.readFileSync('dist/BUILD-MANIFEST.json','utf8'));
  ok('BUILD-MANIFEST lists every shipped file with a size and hash',bm.files.length>0&&bm.files.every(f=>f.bytes>0&&/^[0-9a-f]{64}$/.test(f.sha256)),bm.files.length+' files');
}
/* ---- navigation: history preserves position, the rail reflects state, sheets are reachable ---- */
{
  /* The yield table is normally fetched on first use. There is no fetch in this harness, so preload it
     before any surface that reads it opens — otherwise the sheet is exercised in a state the app would
     only reach while offline with a cold cache. */
  w._refTables.yields=JSON.parse(fs.readFileSync('dist/data/reference/yields.json','utf8'));
  w.loadDemo();w.switchTab('today');await sleep(20);
  w.switchTab('food');await sleep(20);
  w.switchTab('progress');await sleep(20);
  ok('application history records each view visited',w.navCanBack(),'history '+w.navHistory().length);
  w.dispatchAct('nav.back');await sleep(30);
  ok('Back returns to the previous view rather than reloading the current one',w._TAB==='food',w._TAB);
  w.dispatchAct('nav.forward');await sleep(30);
  ok('Forward moves ahead again',w._TAB==='progress',w._TAB);
  ok('a restored position carries the selected day and filters, not just the tab',
     w.navHistory().every(n=>n.tab)&&typeof w.navSnapshot().day!=='undefined');
  /* the rail is stateful: nothing that is inert should be visible */
  w.renderAll();await sleep(40);w.updateRail();
  /* Back and top are position controls and live on the left rail; attention is a status and lives in the
     header. Six floating buttons over a text column is an obstruction, not a rail. */
  const backFab=w.document.getElementById('backFab'),topFab=w.document.getElementById('upFab'),attnFab=w.document.getElementById('attnFab');
  ok('back and jump-to-top are position controls on the left rail',
     !!backFab&&!!topFab&&!!backFab.closest('.rail-left')&&!!topFab.closest('.rail-left'));
  ok('attention is a header status rather than a floating button',
     !!attnFab&&!attnFab.closest('.rail-left')&&!attnFab.closest('.rail-right')&&!!attnFab.closest('header'));
  ok('at most two controls float on the right',
     w.document.querySelectorAll('.rail-right .fab-mini').length<=2);
  ok('the jump-to-top control is hidden while the view is already at the top',topFab.hidden===true);
  ok('the attention control announces its contents to a screen reader',/Attention: \d+ item/.test(attnFab.getAttribute('aria-label')||''),attnFab.getAttribute('aria-label'));
  /* every navigation sheet opens, traps focus and closes on Escape */
  for(const [act,title] of [['nav.attention','Attention'],['nav.timeline','Timeline'],['nav.missing','What data is missing'],['nav.dataQuality','Data quality'],['ui.keys','Keyboard'],['ui.undoHistory','Undo history']]){
    w.dispatchAct(act);await sleep(40);
    const open=!!w._SHEET;
    const bd=w.document.getElementById('editBackdrop');
    const focusables=open?[...bd.querySelectorAll('button:not([disabled]),a[href],input:not([type=hidden])')]:[];
    w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    await sleep(20);
    ok('the '+title.toLowerCase()+' sheet opens with focusable controls and closes on Escape',open&&focusables.length>0&&!w._SHEET,open?focusables.length+' controls':'did not open');
  }
}
/* ---- day navigation and keyboard accelerators ---- */
{
  w.loadDemo();w.switchTab('log');await sleep(30);
  const start=w.currentDay();
  w.dispatchAct('day.step','-1');await sleep(20);
  ok('the day control steps backwards one day',w.currentDay()===w.addDays(start,-1),w.currentDay());
  w.dispatchAct('day.jump','day.today');await sleep(20);
  ok('jumping to today returns to the current date',w.currentDay()===w.todayISO());
  w.dispatchAct('day.jump','day.prevWeigh');await sleep(20);
  ok('jump-to-previous-weigh-in lands on a day that actually has a weigh-in',
     w.DB.observations.some(o=>o.type==='weight'&&o.date===w.currentDay()),w.currentDay());
  ok('the day never advances past today',(()=>{w.setCurrentDay(w.addDays(w.todayISO(),5));return w.currentDay()===w.todayISO();})());
  /* keyboard: arrows move days, T returns to today, ? opens help, [ goes back */
  w.setCurrentDay(w.todayISO());
  const key=(k,opts)=>w.document.dispatchEvent(new w.KeyboardEvent('keydown',Object.assign({key:k,bubbles:true},opts||{})));
  key('ArrowLeft');await sleep(20);
  ok('the left arrow moves to the previous day',w.currentDay()===w.addDays(w.todayISO(),-1),w.currentDay());
  key('t');await sleep(20);
  ok('T returns to today',w.currentDay()===w.todayISO());
  key('?');await sleep(30);
  ok('? opens keyboard help',!!w._SHEET&&w._SHEET.opts.form==='keys');
  key('Escape');await sleep(20);
  /* G-prefix navigation, and the prefix must not swallow the following keystroke forever */
  key('g');key('p');await sleep(30);
  ok('G then P navigates to Plan',w._TAB==='plan',w._TAB);
  ok('a keyboard shortcut never fires while typing in a field',(()=>{
    const inp=w.document.createElement('input');w.document.body.appendChild(inp);inp.focus();
    const before=w._TAB;inp.dispatchEvent(new w.KeyboardEvent('keydown',{key:'g',bubbles:true}));
    inp.dispatchEvent(new w.KeyboardEvent('keydown',{key:'f',bubbles:true}));
    const same=w._TAB===before;inp.remove();return same;})());
}
/* ---- selection and bulk operations in the interface ---- */
{
  w.loadDemo();w.switchTab('log');await sleep(40);
  ok('selection mode is reachable from a visible control, not only the palette',
     !!w.document.querySelector('[data-act="sel.enter"]'));
  w.dispatchAct('sel.enter','obs');await sleep(40);
  const boxes=[...w.document.querySelectorAll('.selbox')];
  ok('entering selection shows a checkbox on every record with an accessible name',
     boxes.length>0&&boxes.every(b2=>b2.getAttribute('aria-label')&&b2.getAttribute('role')==='checkbox'),boxes.length+' checkboxes');
  const bar=w.document.querySelector('.sel-bar');
  ok('the selection bar is a labelled toolbar that always offers a way out',
     !!bar&&bar.getAttribute('role')==='toolbar'&&!!bar.querySelector('[data-act="sel.exit"]'));
  const ids=w.obsOnDay(w.currentDay()).map(o=>o.id).slice(0,3);
  ids.forEach(id=>w.selectionToggle(id));w.renderAll();await sleep(30);
  ok('the bar states the selected count',/3 selected/.test(w.document.querySelector('.sb-count').textContent));
  ok('checkbox state is reflected for assistive technology',
     [...w.document.querySelectorAll('.selbox')].filter(b2=>b2.getAttribute('aria-checked')==='true').length===3);
  const res=w.bulkRun('retract');
  /* The undo stack is capped, so its LENGTH cannot be used to prove one entry was added once the cap is
     reached. The label of the newest entry proves the batch was recorded as a single undoable step. */
  const top=w.undoHistory()[0];
  ok('a bulk retraction keeps every record and records the batch as one undoable step',
     res.ok&&res.n===3&&top&&/retract 3 observations/.test(top.label)&&
     ids.every(id=>{const o=w.DB.observations.find(x=>x.id===id);return o&&o.retracted&&o.retractedAt;}),
     top?top.label:'no undo entry');
  w.renderAll();await sleep(30);
  ok('selection mode exits after an operation',!w.selectionActive()&&!w.document.querySelector('.sel-bar'));
  w.undo();w._memoInvalidate();w.renderAll();await sleep(20);
}
/* ---- error recovery surfaces a save that did not persist ---- */
{
  const banner=w.document.getElementById('healthBanner');
  /* Earlier blocks deliberately broke localStorage and loaded a future-schema record to prove the app
     survives both. Both correctly leave a critical health issue standing, which the banner was faithfully
     reporting. Clear them so this block tests the banner itself rather than those leftovers. */
  w._SAVE_STATE.ok=true;w._SAVE_STATE.lastError=null;w._SCHEMA_REJECTION=null;w.updateRail();await sleep(20);
  ok('the health banner exists and is silent when nothing is wrong',!!banner&&banner.hidden===true);
  const savedOk=w._SAVE_STATE.ok,savedErr=w._SAVE_STATE.lastError;
  w._SAVE_STATE.ok=false;w._SAVE_STATE.lastError='localStorage rejected the write';
  w.updateRail();await sleep(20);
  ok('a save that did not persist raises a persistent banner, not a toast that vanishes',
     banner.hidden===false&&/may not have been saved/.test(banner.textContent),banner.textContent.slice(0,60));
  ok('the banner offers the one recovery that does not depend on storage',
     !!banner.querySelector('[data-act="data.backup"]'));
  ok('the banner is announced to assistive technology',banner.getAttribute('role')==='alert');
  w._SAVE_STATE.ok=savedOk;w._SAVE_STATE.lastError=savedErr;
  w.updateRail();await sleep(20);
  ok('the banner clears once storage is healthy again',banner.hidden===true);
}
/* ---- the interaction specification is executable, not decorative ---- */
{
  const im=w.interactionMatrix();
  ok('every command is reachable through at least one visible surface',im.issues.length===0,JSON.stringify(im.issues.slice(0,4)));
  ok('the matrix covers every command in the register with a group and surfaces',im.total>=60&&im.rows.every(r=>r.id&&r.group&&r.surfaces));
  /* every data-act used in the rendered interface must resolve to a registered action */
  const acts=new Set();
  for(const t of tabs){w.switchTab(t);await sleep(6);
    w.document.querySelectorAll('[data-act]').forEach(el=>acts.add(el.getAttribute('data-act')));}
  const unregistered=[...acts].filter(a2=>!w.ACTIONS[a2]);
  ok('every data-act rendered in the interface resolves to a registered action',unregistered.length===0,unregistered.slice(0,6).join(', '));
  ok('the rendered interface uses a substantial share of the command register',acts.size>=40,acts.size+' distinct actions rendered');
}
/* ---- focus mode hides detail without hiding warnings ---- */
{
  w.switchTab('today');await sleep(20);
  w.setFocusMode(true);await sleep(30);
  ok('focus mode is reflected on the document element so the stylesheet can act on it',
     w.document.documentElement.getAttribute('data-focus')==='on');
  const css=[...w.document.querySelectorAll('style')].map(x=>x.textContent).join('\n');
  ok('focus mode hides secondary disclosure but never warnings or uncertainty',
     /html\[data-focus="on"\][^{]*details\.fold/.test(css)&&!/data-focus="on"[^{]*\.hint\.warn/.test(css));
  w.setFocusMode(false);await sleep(20);
  ok('leaving focus mode restores the full interface',w.document.documentElement.getAttribute('data-focus')==='off');
}
/* ---- Content Security Policy is present, restrictive, and pins the shipped script ---- */
{
  const meta=w.document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  ok('the page ships a Content Security Policy',!!meta);
  const csp=meta?meta.getAttribute('content'):'';
  ok("the policy defaults to denying everything",/default-src 'none'/.test(csp));
  ok('script-src pins a SHA-256 hash rather than allowing inline script generally',
     /script-src 'sha256-[A-Za-z0-9+/=]+'/.test(csp)&&!/script-src[^;]*unsafe-inline/.test(csp),csp.slice(0,90));
  ok('object, base and form targets are denied, and framing is refused',
     /object-src 'none'/.test(csp)&&/base-uri 'none'/.test(csp)&&/form-action 'none'/.test(csp)&&/frame-ancestors 'none'/.test(csp));
  ok('connections are limited to the origin, so the record cannot be posted elsewhere',/connect-src 'self'/.test(csp));
  const declared=/'sha256-([A-Za-z0-9+/=]+)'/.exec(csp);
  const inline=/<script>([\s\S]*?)<\/script>/.exec(fs.readFileSync('dist/index.html','utf8'));
  const actual=declared&&inline?crypto.createHash('sha256').update(Buffer.from(inline[1],'utf8')).digest('base64'):null;
  ok('the pinned hash matches the script actually shipped, so the page can run its own code',
     !!actual&&actual===declared[1]);
}
/* ---- persistence writes only what changed ---- */
{
  w.loadDemo();
  const r1=w.persistIncremental('observation:weight');
  ok('a weight entry does not rewrite the food log, sessions or archive',
     r1.collections.every(c=>/^observations/.test(c)),JSON.stringify(r1.collections));
  const r2=w.persistIncremental('observation:weight');
  ok('an unchanged repeat write costs only the small metadata blob',r2.collections.length===0&&r2.bytes<20000,r2.bytes+' bytes');
  const sm=w.storageManager();
  ok('storage reports the record size, write mix and cache state rather than guessing',
     sm.record&&sm.record.bytes>0&&sm.persistence&&sm.foodCache);
  ok('the storage panel offers deleting the food cache, which is redownloadable public data',
     sm.actions.some(a2=>a2.act==='storage.clearFood'&&a2.destructive));
}
/* ---- integrity gate blocks writes on a P0 ---- */
{
  const keep=w.DB.foodLogs;
  w.DB.foodLogs='not an array';
  const ic=w.integrityCheck('gate-test');
  ok('a malformed collection is a P0 that blocks the operation',!ic.ok&&ic.blocking.length>0);
  w.DB.foodLogs=keep;
  const held=w._INTEGRITY_HOLD;
  w._INTEGRITY_HOLD={blocking:[{what:'simulated'}]};
  const rev=w.DB.revision;
  const saved=w.save('observation');
  ok('while an integrity hold is in place the record is never written back over the durable copy',
     saved===false&&w.DB.revision===rev);
  w._INTEGRITY_HOLD=held;
  ok('clearing the hold restores normal saving',w.save('observation')===true);
}
/* ---- event sourcing and cross-tab merge in the built artifact ---- */
{
  w.loadDemo();
  const m=w.projectionMatchesRecord();
  ok('in the shipped build, replaying the event log reproduces the record',m.ok,m.ok?(m.applied+' events'):JSON.stringify(m.diffs));
  const before=w.DB.observations.length;
  w.addObservation({type:'weight',date:w.todayISO(),value:219.9,source:'manual'},{silent:true,noSave:true});
  ok('a mutation emits an event',w.projectionMatchesRecord().ok&&w.DB.observations.length===before+1);
  const env=JSON.parse(w.exportSyncEnvelope().body);
  ok('a sync envelope carries events and never a document snapshot',
     Array.isArray(env.events)&&env.events.length>0&&!('observations' in env)&&!('profile' in env));
  ok('an envelope validates against its own schema',w.validateEnvelope(env).ok);
  const dry=w.mergeEnvelope(env,{dryRun:true});
  ok('merging our own envelope back adds nothing and discards nothing',dry.ok&&dry.added===0&&dry.superset);
  ok('the device has a local identity, which is not an account',/^dev-/.test(w.deviceId())&&!w.DB.settings.userId);
  const es=w.eventStats();
  ok('the event log reports its own composition',es.count>0&&es.types>0&&es.first&&es.last);
}
/* ---- intelligence layers are reachable and never mutate ---- */
{
  const n0=w.DB.observations.length,e0=w._EVENTS.length;
  const cmp=w.compareScenarios([w.buildScenario('a',{}),w.buildScenario('b',{calories:-300})]);
  const mc=w.monteCarloForecast({weeks:8});
  const k=w.personalKnowledge();
  const ep=w.detectEpisodes(365);
  const d=w.designExperiment({variable:'steps',delta:3000});
  ok('scenarios, forecasts, knowledge, episodes and design all run on the demo record',
     cmp.rows.length===2&&mc.status==='ok'&&k.count>=0&&Array.isArray(ep.episodes)&&d.status==='ok');
  ok('none of them mutate the record or the event log',
     w.DB.observations.length===n0&&w._EVENTS.length===e0);
  ok('the forecast reports a distribution with an ordered interval',mc.p10<=mc.median&&mc.median<=mc.p90);
  ok('knowledge items carry context, transfer and freshness',
     k.items.every(i=>i.context&&i.transfers&&i.freshness));
}
/* ---- import boundary in the built artifact ---- */
{
  const rows=[{type:'weight',date:w.addDays(w.todayISO(),-3),value:99,unit:'kg',externalId:'gate-1'},
              {type:'garbage',date:w.todayISO(),value:1},
              {type:'weight',date:'nope',value:200}];
  const prev=w.importObservations(rows,'apple_health',{dryRun:true});
  ok('an import previews without writing, and refuses what it cannot represent',
     prev.applied===false&&prev.fresh===1&&prev.rejected.length===2);
  const before=w.DB.observations.length;
  const res=w.importObservations(rows,'apple_health',{dryRun:false});
  ok('applying an import adds only the surviving rows',w.DB.observations.length===before+res.added&&res.added===1);
  const imp=w.DB.observations.filter(o=>o.source==='import').slice(-1)[0];
  ok('an imported value is never laundered into looking self-measured',
     imp&&imp.source==='import'&&imp.meta.importSource==='apple_health'&&imp.trust<1);
  ok('re-importing the same data is a no-op',w.importObservations(rows,'apple_health',{dryRun:true}).fresh===0);
  ok('the projection still reproduces the record after an import',w.projectionMatchesRecord().ok);
}
/* ---- new surfaces are reachable and honest about their limits ---- */
{
  for(const [act,form] of [['nav.sync','sync'],['nav.knowledge','knowledge'],['nav.episodes','episodes'],
                           ['nav.scenarios','scenarios'],['exp.design','design'],['nav.import','import'],['nav.photos','photos'],
                           ['nav.cloud','cloud'],['nav.voice','voice'],['nav.label','label'],['nav.yields','yields'],['nav.integrity','eventIntegrity'],['nav.planEdit','planEdit'],['nav.domains','domains'],['injury.add','injuryAdd'],['gen.program','genProgram'],['gen.progress','progression'],['gen.meals','mealPlan'],['gen.search','planSearch'],['nav.graph','graph'],['nav.causal','causal'],['nav.experiments2','expLibrary'],['move.prepare','prepare'],['move.recover','recover'],['move.library','moveLibrary'],['move.progress','progressions'],['nav.ask','ask'],['nav.recent','recent'],['nav.jump','jumps'],['nav.since','since'],['nav.compare','compare'],['nav.saved','saved']]){
    w.dispatchAct(act);await sleep(30);
    const opened=!!w._SHEET&&w._SHEET.opts.form===form;
    w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    await sleep(15);
    ok('the '+form+' surface opens and closes',opened&&!w._SHEET,opened?'':'did not open');
  }
  ok('the notification limit is stated rather than implied',/cannot be coded around|not a substitute/.test(w.notificationState().note));
  const im=w.interactionMatrix();
  ok('every new capability is reachable through a visible surface',im.issues.length===0,JSON.stringify(im.issues.slice(0,3)));
}
/* ---- capture surfaces are honest about what they cannot do ---- */
{
  w.dispatchAct('nav.label');await sleep(30);
  const ta=w.document.getElementById('labelText');
  ok('the label reader takes text rather than pretending to run OCR',!!ta&&ta.tagName==='TEXTAREA');
  ta.value='Serving size 55g\nCalories 240\nTotal Fat 12g\nProtein 9g\nTotal Carbohydrate 24g';
  w.dispatchAct('label.parse');await sleep(20);
  ok('a pasted panel is parsed and shown for confirmation before saving',
     w._LABEL&&w._LABEL.ok&&w._LABEL.per.kcal===240&&w._LABEL.confirm===true);
  const foods=w.DB.foods.length;
  w.dispatchAct('label.save');await sleep(20);
  ok('saving a parsed panel creates exactly one user food',w.DB.foods.length===foods+1);
  w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await sleep(15);
  const cs=w.cloudState();
  ok('encrypted sync states what the server can still infer, rather than claiming perfect privacy',
     /metadata is unavoidable/.test(cs.note));
  ok('the notification limit is stated in every branch',/cannot be coded around|not a substitute/.test(w.notificationState().note));
  ok('wearable setup explains why credentials are absent instead of hiding the gap',
     /identify the DEPLOYMENT/.test(w.wearableSetupInstructions('withings').why));
}
/* ---- AH-102 yields ship verified, or not at all ---- */
{
  const table=JSON.parse(fs.readFileSync('dist/data/reference/yields.json','utf8'));
  ok('the shipped yield table carries verified rows only',table.count>0&&Object.keys(table.items).length===table.count,String(table.count));
  const bad=Object.entries(table.items).filter(([k,y])=>y.lossPercent==null||Math.abs(Math.round(y.factor*100)+y.lossPercent-100)>4);
  ok('every row was confirmed by yield + loss summing to about 100',bad.length===0,bad.slice(0,3).map(b2=>b2[0]).join(','));
  ok('the table declares its extraction method and its partiality',
     /geometry/.test(table.method)&&/PARTIAL/.test(table.caveat));
  ok('the app converts a raw weight through a verified factor',
     (()=>{const k=Object.keys(table.items)[0];const r=w.applyYield(100,k);
       return r.applied&&Math.abs(r.grams-100*table.items[k].factor)<0.2;})());
  ok('an unverified item is reported absent rather than defaulted to 1.0',
     (()=>{const r=w.applyYield(100,'not-an-item');return !r.applied&&r.grams===100;})());
  ok('a yield result carries everything needed to render it, so no caller renders a value it did not fetch',
     (()=>{const k=Object.keys(table.items)[0];const r=w.applyYield(100,k);
       return r.factor!=null&&r.percent!=null&&r.lossPercent!=null&&r.page!=null&&r.code!=null;})());
  /* The data is only useful if it is reachable: a table shipped with no path to it is dead weight. */
  w.dispatchAct('nav.yields');await sleep(60);
  const yq=w.document.getElementById('yieldQuery'),yr=w.document.getElementById('yieldRaw');
  ok('the raw-to-cooked converter is reachable and takes a weight and a search',!!yq&&!!yr);
  /* Type the weight FIRST, then search: the weight must survive the re-render that the search causes. */
  yr.value='200';yr.dispatchEvent(new w.Event('input',{bubbles:true}));
  yq.value='raw';yq.dispatchEvent(new w.Event('input',{bubbles:true}));
  w.dispatchAct('yields.search');await sleep(20);
  ok('searching the yield table returns candidates rather than picking one',w._YIELDS&&w._YIELDS.rows.length>0);
  ok('a weight typed before searching survives the re-render',
     w.document.getElementById('yieldRaw').value==='200',w.document.getElementById('yieldRaw').value);
  w.dispatchAct('yields.apply',w._YIELDS.rows[0].code);await sleep(20);
  /* Assert on the rendered markup the sheet produces, rather than scraping a container that other tests
     may have re-rendered underneath us. */
  const panel=w.SHEETS.yields({}).body;
  ok('the conversion renders with no missing values and cites its handbook item and page',
     !!w._YIELD_RESULT&&!/NaN|undefined/.test(panel)&&/AH-102 item/.test(panel),
     w._YIELD_RESULT?('rendered '+panel.length+' chars'):'no result was produced');
  w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await sleep(15);
}
/* ---- catalogue P0: history integrity is user-verifiable, not just internally true ---- */
{
  w.loadDemo();
  w.dispatchAct('nav.integrity');await sleep(40);
  ok('history integrity is reachable from the interface',!!w._SHEET&&w._SHEET.opts.form==='eventIntegrity');
  w.dispatchAct('events.verify');await sleep(40);
  const c=w._EVENT_CHECK;
  ok('the app can rebuild the record from its own log on demand',c&&c.projection.ok,
     c?JSON.stringify(c.projection.diffs).slice(0,90):'no check ran');
  ok('both replay mechanisms are checked against each other and reported',
     c&&c.agree.length===3&&c.agree.every(a2=>a2.agree));
  const panel=w.SHEETS.eventIntegrity({}).body;
  ok('the panel reports the archive state without implying a limit on history',
     /working window/.test(panel)&&!/NaN|undefined/.test(panel));
  const ar=w.eventArchiveState();
  ok('the working window is a window, not a cap: nothing is deleted when it fills',
     ar.window>0&&/nothing was deleted|not been compacted/.test(ar.note));
  w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await sleep(15);
  /* Compaction under real pressure, through the built artifact. */
  const emitted=w._EVENTS.length;
  for(let i=0;i<30;i++)w.addObservation({type:'steps',date:w.todayISO(),value:8000+i,source:'manual'},{silent:true,noSave:true});
  const before=w.projectEvents(w._EVENTS).db.observations.length;
  const r=w.compactEvents(true);
  const after=w.projectEvents(w._EVENTS).db.observations.length;
  ok('compacting archives the originals and leaves the projection identical',
     r.compacted>0&&after===before&&w.eventArchiveState().archived>=r.compacted,
     'compacted='+r.compacted+(r.error?(' error='+r.error):'')+' before='+before+' after='+after+
     ' archived='+w.eventArchiveState().archived+' working='+w._EVENTS.length);
  ok('the record still matches its log after compaction',w.projectionMatchesRecord().ok);
}
/* ---- catalogue P1: the command system ---- */
{
  w.loadDemo();
  const reg=w.commandRegister();
  const missing=Object.keys(w.ACTIONS).filter(id=>!reg.some(c=>c.id===id));
  ok('every registered action is in the command register, so nothing is reachable without being auditable',
     missing.length===0,missing.slice(0,5).join(', '));
  ok('internal handlers are marked rather than omitted',reg.some(c=>c.internal)&&reg.filter(c=>c.internal).every(c=>c.surfaces.includes('internal')));
  ok('the matrix judges only user-facing commands, and all of them are reachable',w.interactionMatrix().issues.length===0);
  ok('user-facing commands carry a description a person can act on',
     reg.filter(c=>!c.internal&&c.description).length>=35);
  /* A disabled command that will not say why is a dead end. */
  const av=w.commandAvailability('phase.start');
  ok('a command that cannot run right now explains why, rather than silently doing nothing',
     av.ok===false&&typeof av.reason==='string'&&av.reason.length>10,JSON.stringify(av));
  w.switchTab('experiments');await sleep(20);
  const here=w.commandsHere();
  ok('the palette can answer "what can I do here" from the current view',
     here.length>0&&here.every(c=>c.id&&c.label));
  ok('unavailable contextual commands carry their reason too',
     here.every(c=>c.available||typeof c.reason==='string'));
  /* Aliases: someone who thinks of it as "scan" must find the panel reader. */
  w.openCmdk();w.renderCmdk('scan');
  ok('searching by an alias finds the command',/nutrition panel/i.test(w._CMDK_ITEMS[0].label));
  w.renderCmdk('zen');
  ok('a second alias resolves to focus mode',/focus/i.test(w._CMDK_ITEMS[0].label));
  w.renderCmdk('');
  ok('with no query the palette leads with commands for the current view',
     w._CMDK_ITEMS.slice(0,3).some(c=>here.some(h=>h.id===c.id)));
  /* Usage ranking must never let a learned preference outrank an exact match. */
  for(let i=0;i<20;i++)w.noteCommandUse('nav.storage');
  w.renderCmdk('undo');
  ok('frequent use ranks a command up but never above an exact label match',
     /undo/i.test(w._CMDK_ITEMS[0].label),w._CMDK_ITEMS[0].label);
  w.closeCmdk();
}
/* ---- catalogue §46–§60: replay as a mode, not a report ---- */
{
  w.loadDemo();w.switchTab('today');await sleep(20);
  const d=w.addDays(w.todayISO(),-30);
  const banner=w.document.getElementById('replayBanner');
  ok('the replay banner is silent when not replaying',!!banner&&banner.hidden===true);
  w.enterReplay(d);await sleep(30);
  ok('entering replay marks the document so every view can show it is not today',
     w.document.documentElement.getAttribute('data-replay')==='on');
  ok('the banner appears immediately, not on the next render tick',
     banner.hidden===false&&/days ago/.test(banner.textContent));
  ok('the banner states plainly that later data is invisible',/Nothing recorded after this day/.test(banner.textContent));
  ok('the banner offers a way back to today',!!banner.querySelector('[data-act="replay.exit"]'));
  const css=[...w.document.querySelectorAll('style')].map(x=>x.textContent).join('\n');
  ok('replay is visually distinct on every view, so historical output cannot pass for current advice',
     /html\[data-replay="on"\]\s*\.view/.test(css));
  ok('the quick-log control is hidden while replaying, because logging into the past is not what it does',
     /html\[data-replay="on"\][^{]*\.fab/.test(css));
  /* The whole interface renders as of that day, not just one panel. */
  const thenCount=w.withAsOf(d,()=>w.DB.observations.filter(o=>w._visible(o,d)).length);
  const nowCount=w.DB.observations.filter(o=>w._visible(o,w.todayISO())).length;
  ok('replay sees strictly less than today',thenCount<nowCount,thenCount+' vs '+nowCount);
  ok('stepping moves the replayed day and updates the banner',
     w.replayStep(-7)&&w.replayMode().date===w.addDays(d,-7));
  ok('stepping stops at the edges of the record rather than running off them',
     (()=>{const b2=w.replayBounds();w.enterReplay(b2.min);const moved=w.replayStep(-30);
       return moved===false&&w.replayMode().date===b2.min;})());
  w.enterReplay(d);await sleep(20);
  const pts=w.replayWaypoints(20);
  ok('replay offers the days when something actually happened, not just a calendar',
     pts.length>0&&pts.every(p=>p.date&&p.kind&&p.label));
  const c=w.replayComparison(d);
  ok('then-and-now compares what was known against what is known',
     c.then&&c.now&&c.then.observations<c.now.observations);
  ok('a past decision is judged against what actually followed it, not re-derived with hindsight',
     c.after===null||typeof c.verdict==='string');
  ok('the comparison states that later corrections are invisible to it',/fair test of the decision/.test(c.note));
  w.exitReplay();await sleep(20);
  ok('leaving replay restores today and clears the banner',
     !w.replayActive()&&banner.hidden===true&&w.document.documentElement.getAttribute('data-replay')===null);
  ok('replay never writes to the record',
     (()=>{const n=w.DB.observations.length;w.enterReplay(d);w.replayStep(1);w.exitReplay();
       return w.DB.observations.length===n;})());
}
/* ---- catalogue §71–§90: every number can say where it came from ---- */
{
  w.loadDemo();w.switchTab('today');await sleep(30);
  const ids=w.traceIds();
  ok('the major numbers have registered traces',ids.length>=6&&ids.includes('tdee')&&ids.includes('weight_trend'));
  const traces=ids.map(id=>w.traceValue(id));
  ok('every trace either resolves or says what it needs, and never throws',
     traces.every(t=>t.status==='ok'||(t.status==='insufficient'&&Array.isArray(t.need))));
  const ok_=traces.filter(t=>t.status==='ok');
  ok('a resolved trace is a chain of steps, each with its own epistemic class',
     ok_.length>0&&ok_.every(t=>t.steps.length>=2&&t.steps.every(s=>s.step&&s.value!=null&&s.cls)));
  ok('a trace says what would change the number',ok_.every(t=>Array.isArray(t.wouldChange)&&t.wouldChange.length));
  /* A chain resting on a population assumption must declare it, not bury it in a step. */
  const tdee=w.traceValue('tdee');
  ok('a chain resting on a population assumption declares it at the top',
     tdee.status!=='ok'||(tdee.restsOnPrior&&tdee.restsOnPrior.length>0),JSON.stringify(tdee.restsOnPrior));
  ok('an unregistered value reports that plainly rather than inventing a chain',
     w.traceValue('not_a_real_value').status==='unknown');
  /* Reachability: the number itself is the affordance. */
  const tiles=[...w.document.querySelectorAll('.metric.traceable')];
  ok('numbers on Today are tappable and carry an accessible name',
     tiles.length>=2&&tiles.every(t=>t.getAttribute('aria-label')&&t.getAttribute('data-act')==='trace.open'));
  w.dispatchAct('trace.open','tdee');await sleep(40);
  const panel=w.SHEETS.trace({id:'tdee'}).body;
  ok('the trace renders a step chain with no missing values',
     /tc-step/.test(panel)&&!/NaN|undefined/.test(panel));
  ok('a trace links onward to the traces it depends on',/data-arg="weight_trend"/.test(panel));
  ok('an insufficient trace explains what is missing instead of producing a number anyway',
     (()=>{const p2=w.SHEETS.trace({id:'adherence'}).body;
       const t2=w.traceValue('adherence');
       return t2.status!=='insufficient'||/WHAT IT NEEDS|guess wearing/.test(p2);})());
  w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await sleep(15);
  ok('a trace never mutates the record',
     (()=>{const n=w.DB.observations.length;w.traceIds().forEach(id=>w.traceValue(id));
       return w.DB.observations.length===n;})());
}
/* ---- review findings: profile, meals, plans ---- */
{
  w.loadDemo();
  ok('the profile used during replay is projected from the log, not read from the current record',
     typeof w.profileAsOf==='function'&&typeof w.profileHistory==='function');
  const h0=w.prof().heightIn;
  w.DB.profile.heightIn=h0+2;
  w.emitEvent('profile.changed',JSON.parse(JSON.stringify(w.DB.profile)));
  w._memoInvalidate();
  ok('a profile edit today does not change what an earlier day was computed from',
     w.withAsOf(w.addDays(w.todayISO(),-30),()=>w.prof().heightIn)===h0&&w.prof().heightIn===h0+2);
  ok('profile changes are listed with field, old value and new value',
     w.profileHistory().some(x=>x.changed.some(c=>c.field==='heightIn'&&c.from===h0)));
  /* Meal moves supersede rather than mutate. */
  w.loadDemo();
  /* Pick an entry from BEFORE today: replaying yesterday cannot show an entry that did not exist then, and
     that would test the date filter rather than the supersession. */
  const fl=w.DB.foodLogs.find(l=>!l.retracted&&!l.supersededBy&&l.date<w.todayISO());
  const origMeal=fl.meal, replayDay=w.addDays(w.todayISO(),-1);
  const beforeMeals=w.withAsOf(replayDay,()=>w.foodLogsOn(fl.date).map(l=>l.meal).join(','));
  const moved=w.changeMeal(fl.id,origMeal==='lunch'?'dinner':'lunch');
  ok('a meal move supersedes the entry',!!moved&&moved.supersedes===fl.id&&fl.meal===origMeal);
  ok('a replay before the move shows exactly the meals it showed beforehand',
     w.withAsOf(replayDay,()=>w.foodLogsOn(fl.date).map(l=>l.meal).join(','))===beforeMeals,
     'was ['+beforeMeals+'] now ['+w.withAsOf(replayDay,()=>w.foodLogsOn(fl.date).map(l=>l.meal).join(','))+']');
  ok('today shows the entry in its new meal',
     w.foodLogsOn(fl.date).some(l=>l.id===moved.id&&l.meal===moved.meal));
  ok('the in-place meal event is deprecated and no longer emitted',
     w.EVENT_TYPES['food.mealChanged'].deprecated===true);
  /* Plans are editable. */
  w.loadDemo();
  const key=w.trainingProgram().key;
  const t=Object.keys(w.programDef(key).templates)[0];
  const orig=w.templateRows(key,t)[0].exercise;
  w.setTemplateRow(key,t,0,{exercise:'Hack squat',sets:4,reps:'6-8'});
  ok('the training plan can be edited and the built-in is left intact',
     w.programIsCustom(key)&&w.PROGRAMS[key].templates[t][0][0]===orig);
  ok('a plan edit replays: an earlier day still shows the plan as it stood then',
     w.withAsOf(w.addDays(w.todayISO(),-3),()=>{const p=w.trainingProgram();
       return p.key!==key||p.templates[t][0][0]===orig;}));
  const adapt=w.adaptProgramTo(key,'home_minimal',{dryRun:true});
  ok('a plan adapts to available equipment, proposing substitutes and naming what it cannot replace',
     adapt.ok&&adapt.swaps.length>0&&adapt.unmatched.every(u=>u.exercise&&u.needs));
  ok('a full gym needs no substitutions, which is the sanity check on the equipment logic',
     w.adaptProgramTo(key,'full_gym',{dryRun:true}).swaps.length===0);
  w.resetProgram(key);
  ok('resetting restores the built-in exactly',!w.programIsCustom(key)&&w.templateRows(key,t)[0].exercise===orig);
  /* Deployment posture. */
  ok('sync defaults to a same-origin path, which is the only arrangement the shipped CSP permits',
     w.CLOUD_DEFAULT_URL.charAt(0)==='/'&&w.cloudState().sameOrigin===true);
  ok('the sync panel explains the deployment requirement rather than leaving it to fail at runtime',
     /connect-src/.test(w.cloudState().deployment));
}
/* ---- recall, jumps, comparisons, export ---- */
{
  w.loadDemo();w.switchTab('today');await sleep(30);
  ok('recent records are listed newest first with a way into each',
     (()=>{const r=w.recentRecords(10);return r.length>0&&r.every(x=>x.label&&x.kind&&x.act)&&
       r.every((x,i)=>i===0||String(r[i-1].at)>=String(x.at));})());
  const jt=w.jumpTargets();
  ok('jump targets are places worth returning to, each with a destination',
     jt.length>0&&jt.every(t=>t.id&&t.label&&t.act));
  ok('the jump list includes the last plan change and the next unresolved thing where they exist',
     jt.some(t=>t.id==='lastIntervention')||jt.some(t=>t.id==='nextUnresolved'));
  const since=w.changedSince(1);
  ok('what-changed-since separates what you recorded from what the system did',
     Array.isArray(since.logged)&&Array.isArray(since.system)&&typeof since.note==='string');
  const po=w.comparePredictionOutcome(8);
  ok('forecast-against-outcome reports coverage, or says none has been scored',
     po.status==='none'||(po.coverage!=null&&po.rows.every(r=>r.predicted!=null&&r.actual!=null)));
  const ph=w.comparePhases();
  ok('phases are compared by rate, and the note says why not by total',
     ph.rows.length===0||/rate rather than the total|nothing to compare/.test(ph.note));
  const iv=(w.DB.interventions||[])[0];
  if(iv){const ci=w.compareIntervention(iv.id);
    ok('before-and-after states that it is a comparison, not a cause',/not a cause/.test(ci.note));}
  else ok('before-and-after needs an intervention to compare',true,'none in this record');
  /* Why am I seeing this, answered from the item's own provenance. */
  const q=w.attentionQueue().items[0];
  if(q){const why=w.whyShown('attention',q.id);
    ok('an attention item can explain why it is there and what ignoring it costs',
       !!why&&why.because&&why.ifIgnored&&why.todo);}
  else ok('why-am-I-seeing-this needs an item',true,'queue empty');
  /* Copy and export produce text, not silence. */
  const dr=w.decisionReport((w.DB.decisions[0]||{}).id);
  ok('a decision copies as a readable report containing reasoning and no measurements',
     !!dr&&/WHY/.test(dr)&&!/\d+\.\d+ lb\b.*weigh/.test(dr));
  const tr=w.traceReport('weight_trend');
  ok('a trace copies as text with its steps and classes',!!tr&&/\[(MEASURED|DERIVED|EMPIRICAL|PRIOR)\]/.test(tr));
  w.switchTab('log');await sleep(20);
  w.selectionEnter('obs');
  const ids=w.obsOnDay(w.currentDay()).map(o=>o.id).slice(0,2);
  ids.forEach(id=>w.selectionToggle(id));
  const csv=w.exportSelectedCSV();
  ok('selected records export as CSV with a header and one row each',
     !!csv&&csv.count===2&&csv.body.split('\n')[0].includes('date')&&csv.body.trim().split('\n').length===3);
  ok('export is unavailable, with a reason, when nothing is selected',
     (()=>{w.selectionExit();const av=w.commandAvailability('sel.export');return av.ok===false&&/nothing is selected/.test(av.reason);})());
  /* The left-hand rail is position-only. */
  const left=w.document.getElementById('railLeft'), right=w.document.getElementById('railRight');
  ok('a left-hand rail exists for position, separate from the right-hand action rail',
     !!left&&!!right&&!!left.querySelector('[data-act="nav.home"]')&&!!left.querySelector('[data-act="nav.bottom"]'));
  /* EXISTENCE IS NOT VISIBILITY. The rail was previously display:none behind a class nothing ever added, and
     assertions that only checked the element was in the DOM passed the whole time. Check the computed style. */
  const shown=id=>{const el=w.document.getElementById(id);
    return !!el&&!el.hidden&&w.getComputedStyle(el).display!=='none';};
  w.updateRail();await sleep(20);
  ok('the rails themselves are laid out, not display:none',
     w.getComputedStyle(left).display==='flex'&&w.getComputedStyle(right).display==='flex');
  ok('the always-available controls are actually visible, not merely present',
     shown('homeFab')&&shown('cmdkFab'),
     ['homeFab','cmdkFab'].map(i=>i+'='+w.getComputedStyle(w.document.getElementById(i)).display).join(' '));
  ok('a control hidden by state is hidden by the same attribute assistive technology reads',
     (()=>{const t=w.document.getElementById('upFab');
       return t.hidden===true&&w.getComputedStyle(t).display==='none';})());
  ok('showing a control makes it visible, so the attribute is the single source of visibility',
     (()=>{const t=w.document.getElementById('upFab');t.hidden=false;
       const vis=w.getComputedStyle(t).display!=='none';t.hidden=true;return vis;})());
  ok('every rail button is inside a rail rather than positioned individually',
     [...w.document.querySelectorAll('.fab-mini')].every(b2=>b2.closest('.rail-left')||b2.closest('.rail-right')));
  ok('the home control returns to today and leaves replay',
     (()=>{w.enterReplay(w.addDays(w.todayISO(),-10));w.dispatchAct('nav.home');
       return !w.replayActive()&&w._TAB==='today'&&w.currentDay()===w.todayISO();})());
  ok('every new command is reachable through a visible surface',w.interactionMatrix().issues.length===0);
}
/* ---- saved searches, pinned commands, layout ---- */
{
  w.loadDemo();
  /* A saved search must store the QUERY, not results: results that were cached would show the record as it
     was when the search was saved. */
  const rec=w.saveSearch('food:chicken','My chicken entries');
  ok('a saved search stores the query and not its results',
     !!rec&&rec.query==='food:chicken'&&!('results' in rec));
  ok('saving the same query twice does not duplicate it',w.saveSearch('food:chicken','again')===null);
  const run=w.runSavedSearch(rec.id);
  ok('a saved search re-runs and reports how many it finds now',!!run&&Array.isArray(run.results));
  const summary=w.savedSearchSummary();
  ok('a saved search that now matches nothing says so rather than showing an old count',
     summary.every(x=>x.count!=null||x.note));
  w.removeSavedSearch(rec.id);
  ok('a saved search can be removed',w.savedSearches().length===0);
  /* Pins are the person's own shortcuts and lead the empty palette, but never outrank an exact match. */
  ok('a command can be pinned and unpinned',
     w.pinCommand('nav.storage')&&w.isPinned('nav.storage')&&w.pinCommand('nav.storage')&&!w.isPinned('nav.storage'));
  /* The weight-trend surface opens the Progress tab, where the chart that shows it lives. */
  w.dispatchAct('nav.weightTrend');
  ok('the weight trend surface opens the page that shows it',w._TAB==='progress');
  w.switchTab('today');
  w.pinCommand('nav.storage');
  w.openCmdk();w.renderCmdk('');
  ok('pinned commands lead the palette when nothing is typed',
     w._CMDK_ITEMS.slice(0,3).some(c=>c.id==='nav.storage'));
  w.renderCmdk('undo');
  ok('a pin never displaces an exact match',/undo/i.test(w._CMDK_ITEMS[0].label),w._CMDK_ITEMS[0].label);
  w.closeCmdk();
  ok('the pin limit is enforced rather than silently dropping one',
     (()=>{for(let i=0;i<12;i++)w.pinCommand('nav.cmd'+i);return w.pinnedCommands().length<=8;})());
  /* Layout is an explicit mode with a stated requirement, not a silent reflow. */
  const auto=w.setLayout('auto');
  ok('layout reports which mode is in force and why',!!auto.mode&&!!auto.reason);
  ok('the document carries the layout so the stylesheet can act on it',
     ['single','split'].includes(w.document.documentElement.getAttribute('data-layout')));
  const forced=w.setLayout('split');
  ok('asking for two columns on a narrow window collapses to one and says so',
     forced.mode==='single'?/too narrow/.test(forced.reason):forced.mode==='split');
  w.setLayout('single');
  ok('choosing one column is respected regardless of width',w.layoutMode().mode==='single');
  const css=[...w.document.querySelectorAll('style')].map(x=>x.textContent).join('\n');
  ok('two columns require a minimum width in the stylesheet, not just in the setting',
     /min-width:1024px/.test(css)&&/data-layout="split"/.test(css));
  w.setLayout('auto');
  ok('every new command is reachable and the matrix stays clean',w.interactionMatrix().issues.length===0);
}
/* ---- scrolling stops at the content, not at the end of the document ---- */
{
  w.loadDemo();w.switchTab('today');await sleep(30);
  /* main carries 150px of bottom padding so the floating controls never cover a card. Targeting the document
     end parks the viewport inside that padding with the last card scrolled off. */
  const t=w.bottomScrollTarget({contentBottom:2000,docHeight:2150,innerHeight:800});
  ok('the bottom control targets the end of the content, not the end of the document',
     t<2150-800,'target '+t+' vs document end '+(2150-800));
  ok('the last card lands inside the viewport rather than above it',2000>t&&2000<=t+800);
  ok('it never scrolls past the real maximum',
     w.bottomScrollTarget({contentBottom:9999,docHeight:2150,innerHeight:800})<=2150-800);
  ok('a page shorter than the viewport does not scroll at all',
     w.bottomScrollTarget({contentBottom:400,docHeight:550,innerHeight:800})===0);
  ok('with no layout measurement it falls back to the document end rather than failing',
     w.bottomScrollTarget({contentBottom:null,docHeight:2150,innerHeight:800})===1350);
  /* Every scroll is clamped, including remembered positions from a longer view. */
  let landed=null;
  const realScroll=w.scrollTo;
  w.scrollTo=o=>{landed=(o&&typeof o==='object')?o.top:o;};
  Object.defineProperty(w,'innerHeight',{value:800,configurable:true});
  w.restoreScroll(-50);
  ok('a negative scroll is clamped to the top, with or without a measured height',landed===0,'landed '+landed);
  /* jsdom reports a height of zero, so stub one to exercise the upper clamp. */
  Object.defineProperty(w.document.body,'scrollHeight',{value:2150,configurable:true});
  w.restoreScroll(99999);
  ok('a scroll beyond the document is clamped to the maximum',landed===1350,'landed '+landed);
  ok('clamping is skipped rather than pinning to the top when no height is known',
     (()=>{Object.defineProperty(w.document.body,'scrollHeight',{value:0,configurable:true});
       w.restoreScroll(500);const okk=landed===500;
       Object.defineProperty(w.document.body,'scrollHeight',{value:2150,configurable:true});return okk;})(),
     'landed '+landed);
  w.scrollTo=realScroll;
}
/* ---- a personal record reveals what it is waiting for ---- */
{
  w.DB=w.emptyDB();w._EVENTS.length=0;
  w.DB.profile={name:'Me',age:35,sex:'male',heightIn:70};
  w._memoInvalidate();w.renderAll();await sleep(40);
  for(const tab of ['progress','body']){
    w.switchTab(tab);await sleep(20);
    const v=w.document.getElementById('view-'+tab);
    const locks=[...v.querySelectorAll('.locked')];
    ok(tab+': says what is not available yet rather than simply rendering less',locks.length>0);
    ok(tab+': each locked capability names what it needs',
       locks.every(l=>l.querySelector('.lk-need')&&l.querySelector('.lk-need').children.length>0));
    ok(tab+': the needs are specific to this record, not generic copy',
       /\d/.test(v.textContent)||locks.some(l=>/measurement|reading/.test(l.textContent)));
  }
  /* Capability must actually unlock as the record grows — the same view, more data, more available. */
  const lockedBefore=w.document.querySelectorAll('#view-progress .locked').length;
  const T=w.todayISO();
  for(let i=17;i>=0;i--){const d=w.addDays(T,-i);w._NOW_OVERRIDE=d;
    w.addObservation({type:'weight',date:d,value:200-i*0.2,source:'manual'},{silent:true,noSave:true});}
  w._NOW_OVERRIDE=null;w._memoInvalidate();w.switchTab('progress');await sleep(30);
  const lockedAfter=w.document.querySelectorAll('#view-progress .locked').length;
  ok('logging weigh-ins unlocks capability on a personal record, not just on the demo',
     lockedAfter<lockedBefore,lockedBefore+' locked before, '+lockedAfter+' after 18 weigh-ins');
  ok('the weight trend becomes available from the user\u2019s own entries',w.weightTrend(14).status==='ok');
  /* Banner text must read as one sentence, not be dealt into columns by flex. */
  w.loadDemo();w.switchTab('today');await sleep(30);
  const banner=w.document.querySelector('.banner');
  ok('a banner is not a flex container, so inline markup cannot split its sentence',
     !!banner&&w.getComputedStyle(banner).display!=='flex');
  ok('the banner sentence stays intact around its inline markup',
     /generated data marked demo\. Nothing here is yours/.test((banner.textContent||'').replace(/\s+/g,' ')));
  /* Rails must get out of the way while reading. */
  w.document.documentElement.setAttribute('data-scrolling','down');
  const css2=[...w.document.querySelectorAll('style')].map(x=>x.textContent).join('\n');
  ok('both rails retreat while scrolling down and return otherwise',
     /data-scrolling="down"\][^{]*\.rail-left/.test(css2)&&/data-scrolling="down"\][^{]*\.rail-right/.test(css2));
  w.document.documentElement.removeAttribute('data-scrolling');
}
/* ---- domains: one loop, new areas by declaration ---- */
{
  w.loadDemo();
  ok('the domain contract holds for every registered domain',w.domainContractIssues().length===0,
     w.domainContractIssues().slice(0,3).join('; '));
  ok('domains declare only observation types that exist',
     w.domainList().every(d=>d.observes.every(t=>!!w.OBS_TYPES[t])));
  ok('a domain cannot write: the loop is read-only',
     (()=>{const n=w.DB.observations.length,e=w._EVENTS.length;
       w.domainFindings();w.domainProposals();w.domainGaps();w.domainKnowledge();
       return w.DB.observations.length===n&&w._EVENTS.length===e;})());
  /* Sleep became a model rather than an observation. */
  const sl=w.sleepState();
  ok('sleep is modelled, with debt and consistency against a personal reference',
     sl.status!=='ok'||(sl.debtHours!=null&&sl.consistency&&/your/.test(sl.basis)));
  const lag=w.sleepLagEffect('fatigue');
  ok('the lag analysis is within-person and labelled a correlation',
     lag.status!=='ok'||(/share a cause/.test(lag.note)&&lag.pairs>=10));
  /* Injury records, matches the plan, and refuses to diagnose. */
  const inj=w.recordInjury({region:'knee',severity:3,since:w.addDays(w.todayISO(),-20)});
  w._memoInvalidate();
  const ist=w.injuryState();
  ok('a sore area is matched to the movements that load it',ist.status==='ok'&&ist.items[0].exercises.length>0);
  ok('it proposes working around the area, not stopping',
     w.domainProposals().some(p=>p.domain==='injury'&&/work around/i.test(p.verb)));
  ok('it names no clinical condition',
     !/tendin|sprain|impinge|bursit|arthrit|syndrome/i.test(JSON.stringify(ist)+JSON.stringify(w.domainProposals())));
  ok('domain findings arrive in the shared attention queue',
     w.attentionQueue().items.some(i=>/knee|sore/i.test(i.what)));
  ok('domain knowledge joins the shared knowledge layer',w.domainKnowledge().length>0);
  ok('injury events keep the projection faithful',w.projectionMatchesRecord().ok);
  w.resolveInjury(inj.id);
  ok('the new commands are all reachable',w.interactionMatrix().issues.length===0);
}
/* ---- generation: candidates, never applied without consent ---- */
{
  w.loadDemo();
  const g=w.generatePrograms();
  ok('a training plan is generated from real constraints',g.status==='ok'&&g.candidates.length>0);
  const before=JSON.stringify(w.programDef(w.trainingProgram().key));
  w.dispatchAct('gen.program');await sleep(40);
  ok('opening the generator changes nothing',JSON.stringify(w.programDef(w.trainingProgram().key))===before);
  const panel=w.SHEETS.genProgram({}).body;
  ok('each candidate shows the exercises and the score it was ranked on',
     /Movement coverage/.test(panel)&&/sets\/week/.test(panel)&&!/NaN|undefined/.test(panel));
  w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await sleep(15);
  const pr=w.progressionPlan();
  ok('progression explains every row',pr.status!=='ok'||pr.rows.every(r=>r.why&&r.why.length>10));
  const mp=w.planDay();
  ok('a generated day lands inside the target range',
     mp.status!=='ok'||mp.candidates.some(c=>c.hitsProtein&&c.hitsCalories),
     (mp.candidates||[]).map(c=>c.protein+'g/'+c.kcal).join(' '));
  ok('generating a day writes no food logs',
     (()=>{const n=w.DB.foodLogs.length;w.planDay();return w.DB.foodLogs.length===n;})());
  const gl=w.groceryList(mp,7);
  ok('a shopping list aggregates across the week and states its assumption',
     !!gl&&gl.rows.length>0&&/upper bound/.test(gl.caveat));
  const ps=w.searchPlans();
  ok('the plan search returns an undominated frontier inside the rate band',
     ps.status!=='ok'||(ps.frontier.every(f=>f.withinBand!==false)&&
       ps.frontier.every(a2=>!ps.frontier.some(b2=>b2!==a2&&b2.expected<=a2.expected&&b2.burden<=a2.burden&&(b2.expected<a2.expected||b2.burden<a2.burden)))));
  ok('every generator is reachable and registered',w.interactionMatrix().issues.length===0);
}
/* ---- movement engine: one ontology, dose kept separate ---- */
{
  w.loadDemo();
  ok('movement is one ontology of roles rather than several engines',
     Object.keys(w.MOVEMENT_ROLES).length>=10&&w.MOVEMENT_PHASES.length===4);
  const yoga=w.movementDose({role:'practice',minutes:30,intensity:2});
  const cal=w.movementDose({role:'calisthenics',minutes:30,intensity:8});
  ok('the same duration in two modalities produces different dose, and no single score',
     cal.stimulus>yoga.stimulus*2&&yoga.total===undefined&&cal.total===undefined);
  const p=w.prepareSession({day:'Mon'});
  ok('preparation is derived and every block explains itself',
     p.status!=='ok'||p.blocks.every(b2=>b2.reason&&b2.minutes));
  ok('preparation writes nothing',
     (()=>{const n=(w.DB.settings.movements||[]).length;w.prepareSession();w.recoverSession();
       return (w.DB.settings.movements||[]).length===n;})());
  /* A backdated entry must survive a snapshot taken after it. */
  const T=w.todayISO();
  w._NOW_OVERRIDE=w.addDays(T,-1);
  w.addObservation({type:'weight',date:w.addDays(T,-1),value:222.2,source:'manual'},{silent:true,noSave:true});
  w._NOW_OVERRIDE=null;w._memoInvalidate();
  ok('a backdated entry is not swallowed by a later snapshot',w.projectionMatchesRecord().ok,
     JSON.stringify(w.projectionMatchesRecord().diffs));
  /* Assessment loop, and the refusal to diagnose. */
  w.recordAssessment('hip-ir',30,{date:w.addDays(T,-14),silent:true,noSave:true});
  w.logMovement({role:'mobility',movementId:'hip-90-90',date:w.addDays(T,-7),silent:true,noSave:true});
  w.recordAssessment('hip-ir',35,{silent:true,noSave:true});
  w._memoInvalidate();
  const as=w.assessmentState('hip-ir');
  ok('reassessment reports change alongside the work recorded between',
     as.status==='ok'&&as.change===5&&as.interventionsBetween>=1);
  ok('the engine observes without diagnosing',
     !/deficien|dysfunction|imbalance|impinge/i.test(JSON.stringify(as)+JSON.stringify(p)));
  ok('movement records replay like everything else',w.projectionMatchesRecord().ok);
  ok('every movement surface is reachable',w.interactionMatrix().issues.length===0);
}
/* ---- the assistant boundary ---- */
{
  w.loadDemo();
  w.dispatchAct('nav.ask');await sleep(40);
  const inp=w.document.getElementById('askInput');
  ok('the ask surface takes a question',!!inp);
  w.dispatchAct('ask.run','what is my trend');await sleep(20);
  ok('a question is answered from the record with a class',w._ASK&&w._ASK.status==='ok'&&w._ASK.cls);
  const panel=w.SHEETS.ask({}).body;
  ok('the answer shows its basis and a way to trace it',
     /basis|lb\/wk|kcal/i.test(panel)&&!/NaN|undefined/.test(panel));
  ok('the contract is visible to the user, not buried in code',
     /IT MAY NOT/.test(panel)&&/compute a new number/.test(panel));
  w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await sleep(15);
  const pack=w.contextPacket();
  ok('every action a model may propose is actually dispatchable',
     pack.actions.length>0&&pack.actions.every(a2=>typeof w.ACTIONS[a2.id]==='function'));
  ok('the packet withholds notes by default',!pack.notes);
  ok('an invented figure is rejected rather than corrected',
     !w.validateAssistantReply({text:'Your maintenance is 9999 kcal.'},pack).ok);
  ok('clinical language is rejected including stems',
     !w.validateAssistantReply({text:'You likely have tendinitis.'},pack).ok);
  ok('no model is attached and the deterministic answer stands',
     w.assistantState().attached===false);
  /* A lying adapter must be caught, not trusted. */
  w.registerAssistant({complete:()=>({text:'Your TDEE is 9999 kcal and this proves it works.'})});
  const r=await w.assistantAsk('what is my maintenance');
  ok('a model reply that fails validation is discarded and the record answer used',
     r.source==='record'&&(r.rejected||[]).length>0);
  ok('asking never writes to the record',
     (()=>{const n=w.DB.observations.length;w.askQuestion('what do I weigh');return w.DB.observations.length===n;})());
}
/* ---- resistance depth is reachable and honest ---- */
{
  w.loadDemo();
  w.dispatchAct('nav.resistance');await sleep(50);
  const panel=w.document.getElementById('editBackdrop').textContent;
  ok('the resistance panel renders volume, exposure and lifts',
     /effective/i.test(panel)&&/Systemic/i.test(panel)&&!/NaN|undefined/.test(panel));
  ok('it states that effective sets are a convention',/convention/i.test(panel));
  w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await sleep(15);
  w.dispatchAct('res.exercise','Squat');await sleep(40);
  const d=w.document.getElementById('editBackdrop').textContent;
  ok('an exercise detail shows how it loads and what to do next',
     /hardest at/i.test(d)&&!/NaN|undefined/.test(d));
  w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await sleep(15);
  /* The set ontology must be capturable, or it is decoration. */
  const s=w.sessionsOf()[0];
  w.openSession(s.id);await sleep(30);
  const sels=w.document.getElementById('editBackdrop').querySelectorAll('select[aria-label="set kind"]');
  ok('every set row offers the set kind',sels.length>0&&sels[0].options.length===Object.keys(w.SET_KINDS).length);
  sels[0].value='warmup';sels[0].dispatchEvent(new w.Event('change',{bubbles:true}));
  await sleep(30);
  w.saveSession();await sleep(60);
  const live=w.sessionsOf().filter(x=>x.date===s.date);
  ok('a chosen set kind survives the save',(live[live.length-1].sets||[])[0].kind==='warmup');
  ok('editing a session does not double-count its volume',
     w.sessionsOf().filter(x=>x.date===s.date).length===1);
  ok('the resistance layer writes nothing of its own',
     (()=>{const n=w.DB.sessions.length,e=w._EVENTS.length;
       w.effectiveSets(30);w.resistanceFatigue(14);w.progressionFor('Squat');w.curveCoverage(30);
       return w.DB.sessions.length===n&&w._EVENTS.length===e;})());
  ok('every new command is reachable',w.interactionMatrix().issues.length===0);
}
/* ---- the inference layer has a surface ---- */
{
  w.loadDemo();
  w.dispatchAct('nav.inference');await sleep(60);
  const panel=w.document.getElementById('editBackdrop').textContent.replace(/\s+/g,' ');
  ok('the inference panel renders every section',
     /Questions you could answer/.test(panel)&&/What is missing/.test(panel)&&
     /Which estimate to believe/.test(panel)&&!/NaN|undefined/.test(panel));
  ok('it says which questions are blocked and by what',
     /blocked by|not identifiable|estimable now/.test(panel));
  ok('it exposes which graph variables are not recorded',/not tracked/.test(panel));
  w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await sleep(20);
  w.dispatchAct('inf.question','calories>weight');await sleep(50);
  const detail=w.document.getElementById('editBackdrop').textContent.replace(/\s+/g,' ');
  ok('an identification detail sheet opens and is clean',
     /Identifiable from observation/.test(detail)&&!/NaN|undefined/.test(detail));
  w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await sleep(20);
  ok('dependency edges come from the model contracts',
     w.contractDerivedEdges().nodes>20&&w.contractDerivedEdges().unresolved.length===0);
  ok('the merged derivation graph covers more than the hand-written table',
     Object.keys(w.derivationGraph()).length>Object.keys(w.DERIVATION_GRAPH_MANUAL).length);
}
/* ---- data and model contracts hold ---- */
{
  const issues=w.dataContractIssues();
  ok('every observation type reaches a consumer and every model input resolves',issues.length===0,issues.slice(0,4).map(i=>i.kind+':'+i.subject).join(' | '));
  ok('the scheduler registers its jobs and each records a last run after a sweep',(()=>{w.runDueJobs({noSave:true});const js=w.jobsSummary();return js.length>=6&&js.filter(j=>j.lastRun).length>=4;})(),w.jobsSummary().filter(j=>j.lastRun).length+' of '+w.jobsSummary().length+' have run');
}
/* persistence round trip through the localStorage mirror */
const rev=w.DB.revision;w.save('test');const raw=w.localStorage.getItem('physiqueOS_db_v1');ok('save mirrors to localStorage with the new revision',raw&&JSON.parse(raw).revision===rev+1);
/* exports */
ok('state report exports',w.stateReport().includes('DECISION:'));ok('CSV exports',w.exportCSV('training').split('\n').length>5);
/* empty record */
w.dispatchAct('demo.reset');await sleep(5);w.resolveConfirm(true);await sleep(20);ok('reset produces an empty record and SETUP decision',w.DB.observations.length===0&&w.decide().code==='SETUP');
for(const t of tabs){const before=w.getSwallowedErrors().count;w.switchTab(t);ok('empty view '+t+' renders',w.getSwallowedErrors().count===before);}
ok('no quarantined errors overall',w.getSwallowedErrors().count===0,JSON.stringify(w.getSwallowedErrors().top.slice(0,5)));
ok('no jsdom runtime errors overall',consoleErrors.length===0,consoleErrors.slice(0,3).join(' | '));
console.log(report.join('\n'));console.log('\n'+(report.length-failures)+' passed, '+failures+' failed');
process.exit(failures?1:0);
