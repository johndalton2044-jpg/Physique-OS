/* Run one gate and record its result against the exact build in dist/ (docs/release/gate-results.json).
   The release script can use recorded results instead of rerunning every gate itself — but only results recorded
   against the identical build hash, and only if every required gate passed.
     node tests/gate-record.mjs <gate>     one gate
     node tests/gate-record.mjs --all      every release gate in order (the list in tests/gates.mjs); exits non-zero if any
                                           failed, after recording all of them
   Each gate runs under its ceiling (tests/gates.mjs): past it, the gate is stopped and recorded as failed, with the time
   it ran. */
import fs from 'node:fs';import path from 'node:path';
import {GATES,runGate,gateSummary} from './gates.mjs';
const arg=process.argv[2];if(!arg){console.error('usage: node tests/gate-record.mjs <gate> | --all');process.exit(2);}
const file=path.join('docs','release','gate-results.json');
const buildId=()=>JSON.parse(fs.readFileSync(path.join('dist','version.json'),'utf8')).build;
async function record(gate){
  let build=null;try{build=buildId();}catch(e){}
  const r=await runGate(gate);const out=r.out;
  let after=null;try{after=buildId();}catch(e){}
  const summary=gateSummary(out);
  fs.mkdirSync(path.dirname(file),{recursive:true});
  let rec={};try{rec=JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){}
  if(rec.build!==after)rec={build:after,gates:{}};
  /* A gate that rebuilt dist mid-run (build) records against the build it produced; any other change of build voids it. */
  /* a skipped gate is not a passed gate (audit R-006): a browser gate exited 0 when jsdom or Playwright were missing */
  const skipped=/\bSKIPPED\b/.test(out);
  const ok=!skipped&&r.ok&&!!after&&(gate==='build'||build===after);
  rec.gates[gate]={ok,skipped,timedOut:r.timedOut,seconds:r.seconds,ceiling:r.ceiling,
    summary:r.timedOut?'TIMED OUT after '+r.seconds+' s (ceiling '+r.ceiling+' s) — '+summary:(skipped?'SKIPPED — not verified: '+summary:summary),
    at:new Date().toISOString()};
  fs.writeFileSync(file,JSON.stringify(rec,null,1));
  console.log(gate.padEnd(12),ok?'pass':'FAIL',' ',rec.gates[gate].summary.slice(0,120));
  return ok;
}
if(arg==='--all'){
  const failed=[];for(const g of GATES)if(!await record(g))failed.push(g);
  console.log(failed.length?failed.length+' of '+GATES.length+' gates failed: '+failed.join(', '):'all '+GATES.length+' gates passed');
  process.exit(failed.length?1:0);
}
process.exit(await record(arg)?0:1);
