import {spawn} from 'node:child_process';

/* THE RELEASE GATES, in order: the one list the release check (tests/release.mjs), the gate recorder
   (tests/gate-record.mjs --all) and CI (.github/workflows/ci.yml) read, so a gate cannot be added to one and missed by
   another.

   Each gate has a runtime ceiling in seconds. A gate that runs past its ceiling is stopped and recorded as failed: a
   timeout is a failure, not an indefinite process. The ceilings are about two and a half times the time each gate took
   on the release machine (Node 22.23.3), never under 60 s, so a slower CI runner fits and a hung gate does not.
   `reproducible` needs the food archive (PHYSIQUE_FOOD_ARCHIVE, or FOOD_DATA_URL in CI). */
export const GATE_CEILINGS={
  build:180,authority:60,layers:60,maturity:60,dictionary:60,engine:240,test:240,adversarial:60,audit:120,
  conformance:60,governance:60,shipped:120,browser:420,visual:120,persistence:180,spine:60,parity:60,adapt:60,
  integration:60,intelligence:60,external:90,deploy:240,voice:60,direction:60,server:120,timezones:180,connect:60,
  inputs:60,blackbox:90,ai:60,reproducible:600,perf:120,'cloud:e2e':120,'yields:gate':60,baseline:60,verify:60
};
export const GATES=Object.keys(GATE_CEILINGS);

/* the lines a gate's output is summarised by (its pass/fail counts) */
export function gateSummary(out){
  return out.split('\n').filter(l=>/passed,|finding\(s\)|all passed|dist verified|failing|within budget|viewports|verified|failed$/.test(l)).slice(-2).join(' · ').trim()||out.trim().split('\n').slice(-1)[0]||'';
}
/* Run one gate as `npm run -s <gate>` in its own process group, so a gate past its ceiling is stopped together with
   everything it started (servers, browsers). Resolves {ok, code, timedOut, ceiling, seconds, out}. */
export function runGate(gate,opts){
  opts=opts||{};const ceiling=opts.ceiling||GATE_CEILINGS[gate]||600;const group=process.platform!=='win32';
  return new Promise(resolve=>{
    const t0=Date.now();let out='',done=false,timedOut=false;
    const finish=(code)=>{if(done)return;done=true;clearTimeout(timer);clearTimeout(grace);
      resolve({ok:!timedOut&&code===0,code,timedOut,ceiling,seconds:Math.round((Date.now()-t0)/100)/10,out});};
    const c=spawn(group?'npm':'npm.cmd',['run','-s',gate],{detached:group,env:process.env});
    c.stdout.on('data',d=>{out+=d;});c.stderr.on('data',d=>{out+=d;});
    let grace=null;
    const timer=setTimeout(()=>{timedOut=true;try{group?process.kill(-c.pid,'SIGKILL'):c.kill('SIGKILL');}catch(e){}
      /* a process that escaped the group may hold the output open: stop waiting for it */
      grace=setTimeout(()=>finish(null),5000);},ceiling*1000);
    c.on('close',code=>finish(code));
    c.on('error',e=>{out+=String(e&&e.message||e);finish(null);});
  });
}
