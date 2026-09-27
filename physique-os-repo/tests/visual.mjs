#!/usr/bin/env node
/* VISUAL REGRESSION AND MODEL REPRODUCIBILITY (\u00a733 regression; final verification items 18 and 20)
 *
 * The demo record is generated relative to today, so every chart changes daily and nothing could be compared
 * run to run. The browser clock is pinned to a fixed date, which makes the whole application deterministic, and
 * then five things are recorded against a committed baseline:
 *
 *   svg        the exact output of each chart type, the body map, a movement and the dashboard (hashed)
 *   tokens     the computed value of every design token
 *   typography colour, font, size, weight and line height of the elements people read
 *   layout     where the landmarks sit on a phone
 *   semantics  counts of the marks that carry meaning \u2014 gaps drawn as gaps, ghosted start frames, uncertainty
 *              bands \u2014 so a chart that still renders but has lost its meaning is caught, which a hash alone
 *              would report only as "changed"
 *
 * Any difference fails. An intended change is acknowledged with `npm run visual:update`, which rewrites the
 * baseline; that is the point of a regression gate.
 *
 * Reproducibility: two independent page loads at the same pinned time must give every registered model the same
 * result and the same run identity.
 *
 *   node tests/visual.mjs [--update]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {chromium} from 'playwright-core';
import {findBrowser,BROWSER_HELP} from './_browser-path.mjs';

const UPDATE=process.argv.includes('--update');
const BASELINE='tests/visual-baseline.json';
const PINNED=new Date('2026-06-15T12:00:00Z');
if(process.env.PHYSIQUE_SKIP_BROWSER==='1'){console.log('  SKIPPED  visual regression and reproducibility \u2014 PHYSIQUE_SKIP_BROWSER=1, NOT verified');process.exit(0);}
const CHROME=findBrowser();if(!CHROME){console.error(BROWSER_HELP);process.exit(1);}
const sha=s=>crypto.createHash('sha256').update(String(s)).digest('hex').slice(0,16);

const browser=await chromium.launch({executablePath:CHROME,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--force-color-profile=srgb','--font-render-hinting=none']});
async function freshPage(){
  const ctx=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:1,reducedMotion:'reduce'});
  const p=await ctx.newPage();
  await p.clock.setFixedTime(PINNED);
  await p.goto('file://'+path.resolve('dist/index.html'));
  await p.waitForFunction(()=>typeof window.loadDemo==='function');
  await p.evaluate(()=>window.loadDemo());
  /* Settle before measuring. Boot schedules its own tab switch 200 ms after load; waiting a fixed 250 ms after the
     demo loaded raced it, so which tab was showing — and where every card sat — varied between runs. The capture
     now outlasts that timer, selects the Today tab itself, clears any toast, and waits for two animation frames. */
  await p.waitForTimeout(450);
  /* Platform jobs — the app-update check, the food-database version fetch — add an attention item when they run and
     fail, and whether they have failed yet depends on network, service-worker support and timing. Here they fail on
     a schedule that varies run to run, so the dashboard's attention count read 8 in some loads and 7 or 6 in others;
     on another machine they might succeed. That is environment, not appearance, and it would make this baseline
     fail anywhere but where it was captured. Job state is set to "completed at the pinned time" before rendering;
     the jobs themselves are exercised by the engine and interface gates. */
  await p.evaluate(t=>{var j={};(window.JOBS||[]).forEach(function(x){j[x.id]={ok:true,at:t,lastText:'pinned for capture'};});
    window.DB.settings.jobs=j;if(window._memoInvalidate)window._memoInvalidate();},PINNED.toISOString());
  await p.evaluate(()=>{window.switchTab('today');const t=document.getElementById('toast');if(t)t.className='toast';});
  await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  return {p,ctx};
}

/* ---------------- capture ---------------- */
const {p,ctx}=await freshPage();
const snap=await p.evaluate(()=>{
  const out={svg:{},semantics:{},tokens:{},typography:{},layout:{}};
  const count=(h,re)=>(h.match(re)||[]).length;
  const charts=['line','histogram','boxPlot','calendarHeatmap','controlChart','band','scatter'];
  charts.forEach(t=>{const v=window.buildVisualization({modelId:'weight_trend',chartType:t,title:'weight'});
    if(v.status!=='ok'){out.svg[t]='NOT RENDERED: '+v.stage;return;}
    out.svg[t]=v.html;
    out.semantics[t]={gaps:count(v.html,/hm-gap/g),bands:count(v.html,/class="band/g),boxes:count(v.html,/bp-box/g),thin:count(v.html,/bp-thin/g),marks:count(v.html,/<(path|rect|circle|line)\b/g)};});
  const bm=window.renderBodyMap(window.bodyMapModel(14));out.svg.bodyMap=bm.svg;
  out.semantics.bodyMap={loaded:count(bm.svg,/bm-load/g),none:count(bm.svg,/bm-none/g),gap:count(bm.svg,/bm-gap/g)};
  const mv=window.renderMovement(window.movementModel('squat'));out.svg.squat=mv;
  out.semantics.squat={ghost:count(mv,/sk-ghost/g),rom:count(mv,/sk-rom/g),force:count(mv,/sk-force/g),hot:count(mv,/sk-hot/g)};
  /* Run ids are removed before hashing: they hash the record's content, so any change to the demo record changes them,
     which made this baseline fail for reasons that are not visual. Their correctness is the reproducibility check's job. */
  const db=window.renderDashboard(window.currentDashboard()).replace(/ \u00b7 run [0-9a-f]{10}/g,'');out.svg.dashboard=db;
  out.semantics.dashboard={tiles:count(db,/w-tile/g),empty:count(db,/w-empty/g)};
  const cs=getComputedStyle(document.documentElement);
  ['--bg','--surface','--surface-2','--text','--text-2','--text-3','--accent','--good','--attention','--negative',
   '--neutral','--border','--border-strong','--ts','--font','--mono','--radius-xs'].forEach(k=>out.tokens[k]=cs.getPropertyValue(k).trim());
  const typo=sel=>{const e=document.querySelector(sel);if(!e)return null;const s=getComputedStyle(e);
    return {color:s.color,bg:s.backgroundColor,font:s.fontFamily.split(',')[0],size:s.fontSize,weight:s.fontWeight,line:s.lineHeight};};
  ['body','.tab','.tab.active','.card-title','.btn-primary','.hint'].forEach(s=>out.typography[s]=typo(s));
  const box=sel=>{const e=document.querySelector(sel);if(!e)return null;const r=e.getBoundingClientRect();
    return [Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height)];};
  ['header','.tabs','#railLeft','#railRight','main .card'].forEach(s=>out.layout[s]=box(s));
  return out;
});
Object.keys(snap.svg).forEach(k=>snap.svg[k]=/^NOT RENDERED/.test(snap.svg[k])?snap.svg[k]:sha(snap.svg[k]));

/* ---------------- reproducibility ---------------- */
const models=await p.evaluate(()=>window.MODELS.map(m=>{const r=window.infer({modelId:m.id});
  return {id:m.id,status:r.status,runId:r.runId,value:JSON.stringify(r.value)};}));
await ctx.close();
const second=await freshPage();
const models2=await second.p.evaluate(()=>window.MODELS.map(m=>{const r=window.infer({modelId:m.id});
  return {id:m.id,status:r.status,runId:r.runId,value:JSON.stringify(r.value)};}));
await second.ctx.close();
await browser.close();
/* Compare what each model COMPUTED. The demo gives each record a random id suffix per load, and some results embed
   the records they used; the first version compared raw JSON, ids included, and reported four models as
   irreproducible when every number and every run identity matched. Record identifiers are removed before
   comparison; nothing computed is. */
const canon=v=>{if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(canon).join(',')+']';
  return '{'+Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}';};
/* Key order is not part of a result: identical content built in a different order must compare equal. */
const stripIds=v=>canon(JSON.parse(JSON.stringify(JSON.parse(v||'null'),(k,x)=>(k==='id'||(typeof x==='string'&&/^[a-z]{2,6}-[a-z0-9]{6,}-[a-z0-9]{2,}(-[a-z0-9]+)?$/.test(x)))?undefined:x)));
const irreproducible=models.filter((m,i)=>{const n=models2[i];return !n||m.runId!==n.runId||stripIds(m.value)!==stripIds(n.value)||m.status!==n.status;}).map(m=>m.id);

/* ---------------- compare ---------------- */
let failed=0;const line=(ok,msg)=>{console.log((ok?'  pass  ':'  FAIL  ')+msg);if(!ok)failed++;};
line(irreproducible.length===0,`every registered model reproduces its result and run identity across independent loads (${models.length} models)`+
  (irreproducible.length?': '+irreproducible.join(', '):''));
if(UPDATE||!fs.existsSync(BASELINE)){
  fs.writeFileSync(BASELINE,JSON.stringify({pinnedTime:PINNED.toISOString(),capturedAt:new Date().toISOString(),snapshot:snap},null,2)+'\n');
  console.log(`  ${UPDATE?'updated':'created'}  visual baseline at ${BASELINE} \u2014 ${Object.keys(snap.svg).length} renders, ${Object.keys(snap.tokens).length} tokens`);
}else{
  const base=JSON.parse(fs.readFileSync(BASELINE,'utf8')).snapshot;
  for(const cat of ['svg','semantics','tokens','typography','layout']){
    const diffs=[];
    const keys=new Set([...Object.keys(base[cat]||{}),...Object.keys(snap[cat]||{})]);
    keys.forEach(k=>{const a=JSON.stringify((base[cat]||{})[k]),b=JSON.stringify((snap[cat]||{})[k]);if(a!==b)diffs.push(k+': '+a+' \u2192 '+b);});
    line(diffs.length===0,`${cat} matches the baseline (${keys.size} checked)`);
    diffs.slice(0,6).forEach(d=>console.log('        '+d.slice(0,180)));
  }
  if(failed)console.log('\n  If these changes are intended, acknowledge them with: npm run visual:update');
}
console.log(`\n${failed?failed+' failed':'all passed'}`);
process.exit(failed?1:0);
