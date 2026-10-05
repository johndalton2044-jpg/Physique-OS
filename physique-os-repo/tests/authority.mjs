/* AUTHORITY MAP AND STATE-OWNERSHIP LINT (audit EC-004, A-001, A-006). Builds the machine-readable map of every entity:
   its stores, its declared mutators (ENTITY_CONTRACTS.owners), the functions that actually write each store (a static
   scan attributing every write to its enclosing function or registered action), its read model and events. Fails when
   a store is written outside its declared owners and the named system mutators (event replay, migration, load,
   restore), or when a persisted store has no contract. Writes docs/authority.json. No browser needed.
   Limitation, stated: the scan sees writes to the store (push, splice, assignment, index assignment); it does not see a
   field set on an entity object fetched from the store (for example a retraction flag). */
import fs from 'node:fs';import vm from 'node:vm';
const ctx={console};vm.createContext(ctx);vm.runInContext(fs.readFileSync('src/23-entity-contracts.js','utf8'),ctx);const C=ctx.ENTITY_CONTRACTS;
const SYSTEM=new Set(['adoptMergedEvents','replayEvents','applyEventLog','migrate','loadDB','hydrate','action:data.restoreApply','action:data.reset','resetAll','wipeAll']);
const EXCLUDE=/95-selftest|70-demo|71-fixtures/;
const STORES=['profile','observations','sessions','phases','plans','foodLogs','executions','responses','cycles','decisions','experiments','interventions','negatives','notes','recipes','foods','predictions','snapshots','archive'];
const writers={};
for(const f of fs.readdirSync('src').filter(f=>f.endsWith('.js')&&!EXCLUDE.test(f)).sort()){let at='(top level)';
  fs.readFileSync('src/'+f,'utf8').split('\n').forEach((l,i)=>{const fm=/^function ([\w$]+)\(/.exec(l),am=/^registerAction\('([\w.]+)'/.exec(l);if(fm)at=fm[1];if(am)at='action:'+am[1];
    for(const s of STORES){if(new RegExp('DB\\.'+s+'(\\.(push|splice|unshift|pop|shift)\\(|\\s*=[^=]|\\[[^\\]]+\\]\\s*=[^=])').test(l)){((writers[s]=writers[s]||{})[at]=writers[s][at]||[]).push(f+':'+(i+1));}}});}
const owners={},contractOf={};for(const [name,c] of Object.entries(C))for(const s of c.stores||[]){(owners[s]=owners[s]||new Set());(c.owners||[]).forEach(o=>owners[s].add(o));(contractOf[s]=contractOf[s]||[]).push(name);}
const map={generated:'tests/authority.mjs',entities:Object.fromEntries(Object.entries(C).map(([n,c])=>[n,{stores:c.stores,owners:c.owners,readModel:c.readModel||null,events:c.events||[],temporal:c.temporal||null,layer:c.layer||null}])),stores:{}},violations=[],uncontracted=[];
for(const s of STORES){const w=Object.keys(writers[s]||{});if(!w.length&&!contractOf[s])continue;
  map.stores[s]={contracts:contractOf[s]||[],owners:[...(owners[s]||[])],writers:Object.fromEntries(w.map(k=>[k,writers[s][k]]))};
  if(w.length&&!contractOf[s])uncontracted.push(s+' (written by '+w.join(', ')+')');
  w.filter(k=>!SYSTEM.has(k)&&!(owners[s]&&owners[s].has(k.replace(/^action:/,'')))).forEach(k=>violations.push(s+' written by '+k+' ('+writers[s][k].join(', ')+'), not a declared owner'));}
/* THE PLAN AUTHORITY (audit A-004): a call to an underlying plan mutator must sit inside a changePlan(...) call, or inside
   a composite mutator (itself only reached through changePlan). Spans are found by matching brackets, skipping strings. */
const PLAN_MUTATORS=['updatePhase','setSchedule','setProgram','startPhase','endPhase','applyAdaptation','applyDecisionIntervention'];
const stripComments=t=>t.replace(/\/\*[\s\S]*?\*\//g,m=>m.replace(/[^\n]/g,' ')).replace(/(^|[^:'"\\])\/\/[^\n]*/g,(m,a)=>a+' '.repeat(m.length-a.length));
const spansOf=(code,name)=>{const out=[];let i=-1;while((i=code.indexOf(name+'(',i+1))>=0){if(/[\w$.]/.test(code[i-1]||''))continue;let d=0,q=null;
  for(let j=i+name.length;j<code.length;j++){const ch=code[j];if(q){if(ch==='\\'){j++;continue;}if(ch===q)q=null;continue;}if(ch==="'"||ch==='"'||ch==='`'){q=ch;continue;}if(ch==='(')d++;else if(ch===')'){d--;if(!d){out.push([i,j]);break;}}}}return out;};
const planViolations=[];
for(const f of fs.readdirSync('src').filter(f=>f.endsWith('.js')&&!EXCLUDE.test(f))){const code=stripComments(fs.readFileSync('src/'+f,'utf8'));
  const allowed=spansOf(code,'changePlan');
  /* composite mutators and the mutators themselves: their bodies are the internals of a plan change */
  for(const m of PLAN_MUTATORS.concat(['changePlan'])){const re=new RegExp('^function '+m+'\\(','m'),k=code.search(re);if(k>=0){const end=code.indexOf('\n}\n',k);allowed.push([k,end<0?code.length:end]);}}
  for(const m of PLAN_MUTATORS){let i=-1;while((i=code.indexOf(m+'(',i+1))>=0){if(/[\w$.]/.test(code[i-1]||''))continue;if(code.slice(Math.max(0,i-9),i)==='function ')continue;
    if(!allowed.some(([a,b])=>i>a&&i<b)){const ln=code.slice(0,i).split('\n').length;planViolations.push(f+':'+ln+' calls '+m+' outside changePlan');}}}}
/* NO DIRECT MUTATION BY AI (audit AI-012): the AI layer may call no owner of any store, no plan mutator, no command
   dispatch and no save, and may not write the record. Its results are proposals; a person's press makes them real. */
const aiViolations=[];{const AI_FILES=['97-ai.js'];const forbidden=new Set([].concat(...Object.values(C).map(c=>c.owners||[]),PLAN_MUTATORS,['dispatchAct','save','pushUndo','emitEvent','changePlan']));
  for(const f of AI_FILES){if(!fs.existsSync('src/'+f))continue;const code=stripComments(fs.readFileSync('src/'+f,'utf8'));
    for(const fn of forbidden){const re=new RegExp('(^|[^\\w$.])'+fn.replace(/\$/g,'\\$')+'\\(','m');const m=code.match(re);if(m)aiViolations.push(f+' calls '+fn);}
    if(/DB\.\w+\s*(=[^=]|\.(push|splice|unshift)\()/.test(code))aiViolations.push(f+' writes the record directly');}}
fs.writeFileSync('docs/authority.json',JSON.stringify(map,null,1));
let failed=0;const line=(ok,m,d)=>{if(!ok)failed++;console.log('  '+(ok?'pass':'FAIL')+'  '+m+(d&&!ok?'\n          '+d.join('\n          '):''));};
console.log('  '+Object.keys(C).length+' entity contracts; '+Object.keys(map.stores).length+' stores mapped; docs/authority.json written');
line(!uncontracted.length,'every written store has an entity contract',uncontracted);
line(!violations.length,'every store is written only by its declared owners or a system mutator',violations);
line(!planViolations.length,'every user-facing plan change goes through changePlan (the plan authority)',planViolations);
line(!aiViolations.length,'the AI layer changes nothing itself: no mutator, no dispatch, no save, no write (audit AI-012)',aiViolations);
console.log(failed?failed+' failed':'all passed');process.exit(failed?1:0);
