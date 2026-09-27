/* VOICE CAPTURE (usage review: "the mic starts and nothing happens"). A stand-in recognition engine plays scripted
   sessions through the same events a browser fires; every outcome must be visible, and a heard phrase must reach the
   record only through confirmation. Also: a browser without speech recognition can still type the phrase. */
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';
import {chromium} from 'playwright-core';
import {findBrowser} from './_browser-path.mjs';
if(process.env.PHYSIQUE_SKIP_BROWSER==='1'){console.log('  SKIPPED  voice \u2014 PHYSIQUE_SKIP_BROWSER=1, NOT verified');process.exit(0);}
let failed=0;const line=(ok,msg,d)=>{if(!ok)failed++;console.log('  '+(ok?'pass':'FAIL')+'  '+msg+(d&&!ok?'  \u2014 '+d:''));};
setTimeout(()=>{console.log('  FAIL  the voice test did not finish within 120 s');process.exit(1);},120000).unref();
const server=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join('dist',u==='/'?'index.html':u);
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':/\.js$/.test(f)?'text/javascript':/\.json$/.test(f)?'application/json':'text/html'});r.end(d);});});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/index.html`;
const browser=await chromium.launch({executablePath:findBrowser(),args:['--no-sandbox','--disable-dev-shm-usage']});
/* The stand-in engine: window.__SCRIPT picks the session. */
const FAKE=()=>{class FakeSR{constructor(){this.lang='';this.interimResults=false;this.maxAlternatives=1;window.__lastSR=this;}
  start(){const s=window.__SCRIPT||'phrase',me=this,at=(ms,fn)=>setTimeout(fn,ms);
    const res=(t,fin)=>{const alt=[{transcript:t,confidence:0.9}];alt.isFinal=fin;return {resultIndex:0,results:[alt]};};
    at(20,()=>me.onstart&&me.onstart());
    if(s==='phrase'){at(60,()=>me.onspeechstart&&me.onspeechstart());at(120,()=>me.onresult&&me.onresult(res('weight one',false)));
      at(300,()=>me.onresult&&me.onresult(res('weight 182.4',true)));at(340,()=>me.onend&&me.onend());}
    if(s==='network'){at(80,()=>me.onerror&&me.onerror({error:'network'}));at(100,()=>me.onend&&me.onend());}
    if(s==='silence'){at(150,()=>me.onend&&me.onend());}
    if(s==='nomatch'){at(80,()=>me.onspeechstart&&me.onspeechstart());at(150,()=>me.onnomatch&&me.onnomatch());at(170,()=>me.onend&&me.onend());}}
  stop(){this.onend&&this.onend();}abort(){this.onerror&&this.onerror({error:'aborted'});this.onend&&this.onend();}}
  window.SpeechRecognition=FakeSR;window.webkitSpeechRecognition=FakeSR;};
const session=async(script,fake)=>{const ctx=await browser.newContext({viewport:{width:393,height:852}});if(fake!==false)await ctx.addInitScript(FAKE);
  else await ctx.addInitScript(()=>{delete window.SpeechRecognition;delete window.webkitSpeechRecognition;});
  const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));await p.goto(url);await p.waitForTimeout(1300);
  await p.evaluate(s=>{window.__SCRIPT=s;window.dispatchAct('welcome.skip');window.dispatchAct('nav.voice');},script);await p.waitForTimeout(250);return {p,ctx,errs};};
const text=p=>p.evaluate(()=>document.getElementById('editBackdrop').textContent.replace(/\s+/g,' '));
/* 1. a phrase, heard as it is spoken, understood, confirmed */
let s=await session('phrase');
await s.p.click('#editBackdrop [data-act="voice.start"]');await s.p.waitForTimeout(160);
const mid=await text(s.p);line(/Hearing|Listening/.test(mid),'while listening, the sheet says so (and shows the words as they are heard)',mid.slice(0,120));
await s.p.waitForTimeout(500);const done=await text(s.p);
line(/Heard/.test(done)&&/182\.4/.test(done)&&/Understood as/.test(done),'a finished phrase is shown with what it was understood as',done.slice(0,160));
const w0=await s.p.evaluate(()=>window.obsOf('weight').length);await s.p.click('#editBackdrop [data-act="voice.apply"]');await s.p.waitForTimeout(300);
line(await s.p.evaluate(n=>window.obsOf('weight').length===n+1&&window.obsOf('weight').slice(-1)[0].value>=180,w0),'confirming logs it \u2014 and only then');
line(s.errs.length===0,'no errors in the page',s.errs.join(' | '));await s.ctx.close();
/* 2. a network error is explained */
s=await session('network');await s.p.click('#editBackdrop [data-act="voice.start"]');await s.p.waitForTimeout(400);
line(/needs an internet connection/.test(await text(s.p))&&/Try again/.test(await text(s.p)),'a network failure is explained, with Try again');await s.ctx.close();
/* 3. silence ends visibly, not stuck on "Listening" */
s=await session('silence');await s.p.click('#editBackdrop [data-act="voice.start"]');await s.p.waitForTimeout(500);
const sil=await text(s.p);line(/Nothing was heard/.test(sil)&&!/Listening \u2014 speak now/.test(sil),'a session that ends without speech says so instead of listening forever',sil.slice(0,140));await s.ctx.close();
/* 4. heard but not recognised */
s=await session('nomatch');await s.p.click('#editBackdrop [data-act="voice.start"]');await s.p.waitForTimeout(400);
line(/no words were recognised/.test(await text(s.p)),'something heard but not recognised is said plainly');await s.ctx.close();
/* 5. no speech recognition: type it */
s=await session(null,false);
line(/no speech recognition/.test(await text(s.p)),'a browser without speech recognition says so');
await s.p.fill('#voiceTyped','weight 181.2');await s.p.evaluate(()=>document.getElementById('voiceTyped').dispatchEvent(new Event('input',{bubbles:true})));
await s.p.click('#editBackdrop [data-act="voice.parseTyped"]');await s.p.waitForTimeout(200);
line(/Typed/.test(await text(s.p))&&/Understood as/.test(await text(s.p)),'a typed phrase goes through the same understanding and confirmation');await s.ctx.close();
await browser.close();server.close();
console.log(failed?failed+' failed':'all passed');process.exit(failed?1:0);
