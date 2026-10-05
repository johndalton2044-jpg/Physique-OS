/* Run one gate and record its result against the exact build in dist/ (docs/release/gate-results.json).
   The release script can use recorded results instead of rerunning every gate itself \u2014 but only results recorded
   against the identical build hash, and only if every required gate passed. Usage: node tests/gate-record.mjs <gate> */
import {spawnSync} from 'node:child_process';import fs from 'node:fs';import path from 'node:path';
const gate=process.argv[2];if(!gate){console.error('usage: node tests/gate-record.mjs <gate>');process.exit(2);}
const build=JSON.parse(fs.readFileSync(path.join('dist','version.json'),'utf8')).build;
const r=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['run','-s',gate],{encoding:'utf8',maxBuffer:64*1024*1024});
const out=(r.stdout||'')+(r.stderr||'');
const summary=out.split('\n').filter(l=>/passed,|finding\(s\)|all passed|dist verified|failing|within budget|viewports|verified|failed$/.test(l)).slice(-2).join(' \u00b7 ').trim()||out.trim().split('\n').slice(-1)[0]||'';
const after=JSON.parse(fs.readFileSync(path.join('dist','version.json'),'utf8')).build;
const file=path.join('docs','release','gate-results.json');fs.mkdirSync(path.dirname(file),{recursive:true});
let rec={};try{rec=JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){}
if(rec.build!==after)rec={build:after,gates:{}};
/* A gate that rebuilt dist mid-run (build) records against the build it produced; any other change of build voids it. */
/* a skipped gate is not a passed gate (audit R-006): a browser gate exited 0 when jsdom or Playwright were missing */
const skipped=/\bSKIPPED\b/.test(out);
rec.gates[gate]={ok:!skipped&&r.status===0&&(gate==='build'||build===after),skipped,summary:skipped?'SKIPPED \u2014 not verified: '+summary:summary,at:new Date().toISOString()};
fs.writeFileSync(file,JSON.stringify(rec,null,1));
console.log(gate.padEnd(12),rec.gates[gate].ok?'pass':'FAIL',' ',summary.slice(0,120));process.exit(rec.gates[gate].ok?0:1);
