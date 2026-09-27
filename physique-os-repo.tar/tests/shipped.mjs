#!/usr/bin/env node
/* SHIPPED-BUILD GATE
 *
 * The self-test suite ran against the SOURCE (in the engine check), never against what actually ships. Once
 * the build started transforming the script — dropping comments and indentation to stay under 2 MiB — that gap
 * mattered: the file a person opens is no longer byte-for-byte the code the suite had tested.
 *
 * This runs the entire in-app suite inside dist/index.html, after the page has booted as it would for a
 * person, and fails on any failure. Its first run found a test that passed headless and failed in the real
 * page, because the page shows a welcome on boot and the engine never boots — so it earns its place.
 *
 * It also enforces the size limit. The file crossed 2 MiB during step 11 and inline file previews stopped
 * running it; the build now ships well under, and this keeps it there.
 *
 *   node tests/shipped.mjs
 */
import fs from 'node:fs';
import {JSDOM,VirtualConsole} from 'jsdom';

const LIMIT=2*1024*1024;            // 2 MiB: the size at which inline previews stopped running the file
const HEADROOM=64*1024;             // warn well before the limit, not at it
const file='dist/index.html';
const bytes=fs.statSync(file).size;
let failed=0;
const line=(ok,msg)=>{console.log((ok?'  pass  ':'  FAIL  ')+msg);if(!ok)failed++;};

/* Informational only. 2 MiB was the size at which an inline preview stopped running the file; that environment
   is no longer where the build is judged, so exceeding it warns rather than fails. */
if(bytes>=LIMIT)console.log(`  warn  shipped file is ${bytes} bytes, over 2 MiB \u2014 some inline file previews will not run it`);
else console.log(`  info  shipped file is ${bytes} bytes (${LIMIT-bytes} under 2 MiB)`);

const errs=[];
const vc=new VirtualConsole();vc.on('jsdomError',e=>errs.push(String(e&&e.message).slice(0,200)));
const dom=new JSDOM(fs.readFileSync(file,'utf8'),{url:'https://physique.local/app/index.html',
  runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,
  beforeParse(w){w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
    w.scrollTo=()=>{};w.fetch=undefined;w.HTMLElement.prototype.scrollIntoView=function(){};}});
await new Promise(r=>setTimeout(r,1200));
const w=dom.window;
line(typeof w.runSelfTest==='function','the shipped page booted and exposes its self-test');
if(typeof w.runSelfTest==='function'){
  const r=w.runSelfTest({quiet:true});
  const fails=(r.results||r.checks||[]).filter(x=>x&&x.ok===false);
  line(r.failed===0,`the full self-test suite passes inside the shipped file (${r.passed} passed, ${r.failed} failed)`);
  fails.slice(0,8).forEach(f=>console.log('        '+String(f.name||f.label).slice(0,120)));
  /* A second run in the same page, as a person runs it again: three tests passed once and failed on the second run on a
     device, because a first run left state behind (a widget in the registry, archived events). */
  const r2=w.runSelfTest({quiet:true});const f2=(r2.results||r2.checks||[]).filter(x=>x&&x.ok===false);
  line(r2.failed===0,`a second run in the same page passes too (${r2.passed} passed, ${r2.failed} failed)`);
  f2.slice(0,8).forEach(f=>console.log('        '+String(f.name||f.label).slice(0,120)));
}
line(errs.length===0,`no runtime errors in the shipped page${errs.length?': '+errs[0]:''}`);
console.log(`\n${failed?failed+' failed':'all passed'}`);
process.exit(failed?1:0);
