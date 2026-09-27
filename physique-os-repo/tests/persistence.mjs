#!/usr/bin/env node
/* PERSISTENCE GATE
 *
 * Nothing tested closing and reopening the app, and two defects lived there. Startup flushed stale queued writes
 * over the newer IndexedDB record before reading it, so every change since the last localStorage checkpoint was
 * lost on reopen. And the startup sync merge let a projection's DEFAULT settings override the person's, so a light
 * theme came back dark while accent and font survived. Both surfaced as "appearance changes do not persist".
 *
 * This serves the build over HTTP (the real storage origin), changes appearance and logs data, closes the page,
 * and reopens it three times against the same storage. Everything must come back, and must be shown, not only
 * stored.
 *
 *   node tests/persistence.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {findBrowser,BROWSER_HELP} from './_browser-path.mjs';

if(process.env.PHYSIQUE_SKIP_BROWSER==='1'){console.log('  SKIPPED  persistence \u2014 PHYSIQUE_SKIP_BROWSER=1, NOT verified');process.exit(0);}
const CHROME=findBrowser();if(!CHROME){console.error(BROWSER_HELP);process.exit(1);}
const server=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join('dist',u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'content-type':/\.html$/.test(f)?'text/html':(/\.js$/.test(f)?'text/javascript':'application/octet-stream')});r.end(d);});});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
/* Run twice: once as is, and once with reconciliation delayed so the event merge is guaranteed to finish first. The
   ordering bug appeared only under load (2 of 13 full checks); the delayed run makes it deterministic. */
const DELAYED=process.argv.includes('--delayed');
/* --throttle=N slows the CPU N times: the durability window only showed under load, where a weight logged just before
   closing was lost. */
const THROTTLE=+((process.argv.find(a=>/^--throttle=/.test(a))||'').split('=')[1]||0);
const url=`http://127.0.0.1:${server.address().port}/index.html`+(DELAYED?'?test-reconcile-delay=600':'');
const browser=await chromium.launch({executablePath:CHROME,args:['--no-sandbox','--disable-dev-shm-usage']});
const ctx=await browser.newContext({viewport:{width:393,height:852}});
let failed=0;const line=(ok,msg)=>{console.log((ok?'  pass  ':'  FAIL  ')+msg);if(!ok)failed++;};

const newPage=async()=>{const pg=await ctx.newPage();if(THROTTLE){const c=await ctx.newCDPSession(pg);await c.send('Emulation.setCPUThrottlingRate',{rate:THROTTLE});}return pg;};
let p=await newPage();await p.goto(url);await p.waitForFunction(()=>typeof window.loadDemo==='function');
await p.evaluate(()=>window.loadDemo());await p.waitForTimeout(300);
const want=await p.evaluate(()=>{
  ['theme:light','accent:violet','font:hyperlegible','shape:sharp'].forEach(x=>{const [k,v]=x.split(':');window.dispatchAct('settings.'+k,v);});
  window.dispatchAct('settings.textScale','L');window.dispatchAct('settings.density','compact');window.dispatchAct('settings.detail','developer');
  window.setCustomAccent('#6fb3ff');window.setStateColorPreset('okabeIto');window.save('settings');
  window.addObservation({type:'weight',date:window.todayISO(),value:249.4,note:'persistence-gate'});window.save('observation');
  const s=window.DB.settings;return {theme:s.theme,accent:s.accent,font:s.font,shape:s.shape,textScale:s.textScale,density:s.density,detail:s.detail,customAccent:s.customAccent,preset:(s.colorOverrides||{}).preset};});
await p.waitForTimeout(800);let lastRev=await p.evaluate(()=>window.DB.revision||0);
console.log('        before close: '+JSON.stringify(await p.evaluate(()=>({src:window._BOOT_SOURCE,rev:window.DB.revision,events:(window._EVENTS||[]).length,
  saveOk:window._SAVE_STATE&&window._SAVE_STATE.ok,saveErr:window._SAVE_STATE&&window._SAVE_STATE.lastError,reconciling:window._IDB_RECONCILING,suspended:window._PERSIST_SUSPENDED}))));
await p.close();

for(let k=1;k<=3;k++){
  p=await newPage();await p.goto(url);await p.waitForTimeout(1800);
  const got=await p.evaluate(()=>{const s=window.DB.settings;return {theme:s.theme,accent:s.accent,font:s.font,shape:s.shape,textScale:s.textScale,density:s.density,detail:s.detail,customAccent:s.customAccent,preset:(s.colorOverrides||{}).preset,
    shown:document.documentElement.getAttribute('data-theme'),logged:window.DB.observations.some(o=>o.note==='persistence-gate')};});
  const lost=Object.keys(want).filter(x=>want[x]!==got[x]);
  /* Diagnostics whenever settings are lost: this failed only inside the full check, so the evidence is captured there. */
  if(lost.length){const d=await p.evaluate(()=>({src:window._BOOT_SOURCE,rev:window.DB.revision,events:(window._EVENTS||[]).length,
      settingsEvents:(window._EVENTS||[]).filter(e=>/settings/.test(e.type)).length,settingsKeys:Object.keys(window.DB.settings||{}).length,
      swallowed:window.getSwallowedErrors().top.map(t=>t.message.slice(0,120)),
      lsBytes:(()=>{let n=0;for(const k of Object.keys(localStorage))n+=(localStorage.getItem(k)||'').length;return n;})(),
      lsKeys:Object.keys(localStorage),reconciling:window._IDB_RECONCILING}));
    console.log('        diagnostics: '+JSON.stringify(d));}
  line(lost.length===0,`reopen ${k}: every appearance setting is kept`+(lost.length?' \u2014 lost '+lost.map(x=>x+' ('+want[x]+' \u2192 '+got[x]+')').join(', '):''));
  line(got.shown===want.theme,`reopen ${k}: the kept theme is the one shown`);
  line(got.logged,`reopen ${k}: data logged before closing is still there`);
  /* The root cause of a timing-dependent loss: a startup merge reset the revision to 0, so which stored copy won the next
     startup depended on luck. Asserted directly rather than waiting for the symptom. */
  const rev=await p.evaluate(()=>window.DB.revision||0);
  line(rev>=lastRev,`reopen ${k}: the record's revision did not go backwards (${lastRev} \u2192 ${rev})`);lastRev=rev;
  await p.close();
}
/* A loss that still happens is reported, never silent: claim a later revision than any stored copy holds, reopen,
   and the record must note the shortfall. */
if(!THROTTLE&&!DELAYED){
  /* Simulated before the app's own code runs; bumped from a running page, the close-time flush rightly rewrote it. */
  const pr=await newPage();
  await pr.addInitScript(()=>{try{const m=JSON.parse(localStorage.getItem('physiqueOS_meta_v1'));if(m&&!sessionStorage.getItem('bumped')){m.revision=(m.revision||0)+3;localStorage.setItem('physiqueOS_meta_v1',JSON.stringify(m));sessionStorage.setItem('bumped','1');}}catch(e){}});
  await pr.goto(url);await pr.waitForTimeout(1800);
  const u=await pr.evaluate(()=>window.unsavedAtClose());
  line(!!u&&u.missing>=1,'a save that never reached storage is detected and reported on reopening'+(u?' ('+u.missing+' missing)':''));await pr.close();
}
await browser.close();server.close();
console.log(`\n${failed?failed+' failed':'all passed'}`);
process.exit(failed?1:0);
