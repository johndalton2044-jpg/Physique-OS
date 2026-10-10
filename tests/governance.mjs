#!/usr/bin/env node
/* GOVERNANCE GATE (\u00a734)
 *
 * Governance reads the same registries the runtime uses, and its reports are generated from code, never kept by
 * hand. Each detector below corresponds to a family of defect this project actually shipped and then found by
 * hand \u2014 the point of automating them is that the next instance is caught without anyone looking:
 *
 *   field read that nothing ever writes   p.hit, ph.sleepTarget, ph.goalWeight, n.kcal \u2014 each read undefined
 *                                         silently and produced a false statement
 *   reference to a name that is declared  EXERCISE_LIBRARY behind a typeof guard, so an audit checked nothing
 *     nowhere                             and passed
 *   duplicate systems                     cardioState / cardioSessions, two dashboards, two chart catalogues
 *   registries and audits nobody reads    a check that exists and never checks
 *   the ten \u00a734 detections               models without version, provenance or uncertainty, and the rest
 *
 * HARD findings fail the run. SOFT findings are reported and tracked for drift against the previous report.
 *
 *   node tests/governance.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import {JSDOM,VirtualConsole} from 'jsdom';

const HARD=[],SOFT=[],PASS=[];
const hard=(cat,msg,items)=>HARD.push({cat,msg,items:items||[]});
const soft=(cat,msg,items)=>SOFT.push({cat,msg,items:items||[]});
const pass=(cat,msg)=>PASS.push({cat,msg});

/* ---------------- code metadata ---------------- */
const SRC='src';
const files=fs.readdirSync(SRC).filter(f=>/^\d\d-.*\.js$/.test(f)).sort();
const stripComments=t=>t.replace(/\/\*[\s\S]*?\*\//g,' ').replace(/(^|[^:\\'"])\/\/[^\n]*/g,'$1');
const code={};files.forEach(f=>code[f]=stripComments(fs.readFileSync(path.join(SRC,f),'utf8')));
const all=Object.values(code).join('\n');
const tests=fs.readdirSync('tests').filter(f=>f.endsWith('.mjs')).map(f=>fs.readFileSync(path.join('tests',f),'utf8')).join('\n')+
  (code['95-selftest.js']||'');
const declared=new Set();
for(const f of files){const re=/^(?:var|function)\s+([A-Za-z_$][\w$]*)/gm;let m;while((m=re.exec(code[f])))declared.add(m[1]);}
/* Top-level declarations only, kept separate: the duplicate-system and orphan-registry checks compare SYSTEMS, and
   widening this set with every assigned name made the duplicate check report 48 pairs of local variables (r / r2,
   s / s2) — a refinement to one detector that broke another. */
const topLevel=new Set(declared);
/* Names that exist only because code assigns them — contextPacket=function..., or an implicit global such as
   _SW_UPDATE set inside a function. They are real; the defect is a name that is never assigned at all. */
for(const m of all.matchAll(/(?:^|[^.\w$])([A-Za-z_$][\w$]*)\s*=(?!=)/g))declared.add(m[1]);

/* S1 \u2014 typeof NAME where NAME is declared nowhere: the EXERCISE_LIBRARY family. */
const BUILTINS=new Set(('window document navigator crypto Image indexedDB localStorage sessionStorage process require module '+
  'structuredClone queueMicrotask requestAnimationFrame cancelAnimationFrame Intl URL TextEncoder TextDecoder fetch Blob File '+
  'FileReader Worker ServiceWorker caches Notification BroadcastChannel XMLSerializer DOMParser getComputedStyle performance '+
  'setTimeout clearTimeout setInterval clearInterval Promise Symbol Map Set WeakMap WeakSet WeakRef Proxy Reflect globalThis self matchMedia '+
  'ResizeObserver IntersectionObserver MutationObserver AbortController CompressionStream DecompressionStream '+
  'SpeechRecognition webkitSpeechRecognition OffscreenCanvas createImageBitmap PublicKeyCredential define exports '+
  'Uint8Array ArrayBuffer TextEncoderStream WebAssembly HTMLElement Event CustomEvent KeyboardEvent MouseEvent console this BarcodeDetector').split(/\s+/));
const typeofRefs=new Map();
/* A typeof guard on a LOCAL name — a parameter, a var, a catch binding — is ordinary. The first version counted
   those as undeclared and reported 51 findings, nearly all false: a check broader than the property it verifies,
   the defect shape this project keeps recording, this time in its own governance. Only names declared nowhere in
   the file AND nowhere at top level are reported. */
const locallyDeclared=(src,n)=>new RegExp('\\b(?:var|let|const)\\s+(?:[\\w$]+\\s*(?:=[^,;]*)?,\\s*)*'+n+'\\b').test(src)||
  new RegExp('function\\s*[\\w$]*\\s*\\([^)]*\\b'+n+'\\b').test(src)||new RegExp('catch\\s*\\(\\s*'+n+'\\s*\\)').test(src)||
  new RegExp('\\bfor\\s*\\(\\s*(?:var\\s+)?'+n+'\\b').test(src);
for(const f of files){for(const m of code[f].matchAll(/typeof\s+([A-Za-z_$][\w$]*)/g)){
  const n=m[1];if(BUILTINS.has(n)||declared.has(n)||locallyDeclared(code[f],n))continue;
  if(!typeofRefs.has(n))typeofRefs.set(n,new Set());typeofRefs.get(n).add(f);}}
/* Names a typeof guard legitimately probes because another build or platform may define them. */
/* Names a guard probes because something outside the bundle may set them: build stamps, debug flags, platform APIs. */
const OPTIONAL_EXTERNAL=new Set(['BUILD_ID','RELEASE_ID','BUILD_TIME','FOOD_DB_VERSION','webkitAudioContext','AudioContext','EyeDropper','PX_DEBUG','_INTEGRITY_HOLD']);
/* Names a test deliberately asserts do NOT exist — the misleading hierarchicalBayes, renamed in step 14. */
const INTENTIONALLY_ABSENT=new Set(['hierarchicalBayes','enableWebFonts']);   /* removed in steps 14 and 24; tests assert they stay gone */
const undeclared=[...typeofRefs.entries()].filter(([n])=>!OPTIONAL_EXTERNAL.has(n)&&!INTENTIONALLY_ABSENT.has(n));
if(undeclared.length)hard('undeclared-reference','a typeof guard probes a name that no module declares \u2014 whatever it guards can never run',
  undeclared.map(([n,fs2])=>n+' (in '+[...fs2].join(', ')+')'));
else pass('undeclared-reference','every typeof guard probes a name some module declares');

/* S2 \u2014 duplicate systems by name: X alongside X2 / XV2 / X_v2 / XLegacy. */
const dupPairs=[];
for(const n of topLevel){const m=n.match(/^(.+?)(?:2|V2|_v2|Legacy|Old)$/);if(m&&topLevel.has(m[1]))dupPairs.push(m[1]+' / '+n);}
if(dupPairs.length)soft('duplicate-system','names that suggest two versions of one system still coexist',dupPairs);
else pass('duplicate-system','no name pairs suggesting a second version of a system');

/* S2f \u2014 A FUNCTION DECLARED TWICE. A later top-level declaration silently replaces an earlier one: H1's weekly
   responseFor(endDate) replaced the existing responseFor(variable), and the experiment designer, asking for the response
   to steps, received a week and sized nothing. Every top-level function name must be declared once. */
const fnDecl={};
for(const f of files){for(const m of code[f].matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)){(fnDecl[m[1]]=fnDecl[m[1]]||[]).push(f);}}
const fnClash=Object.keys(fnDecl).filter(k=>fnDecl[k].length>1).map(k=>k+' ('+fnDecl[k].join(', ')+')');
fnClash.length?hard('function-declared-twice','top-level functions declared more than once \u2014 the later silently replaces the earlier',fnClash):pass('function-declared-twice','every top-level function is declared once');
/* S2g \u2014 AN ACTION REGISTERED TWICE. registerAction keeps the last registration, so a second one silently replaces the
   first everywhere it is used: the barcode scanner's food.custom replaced the existing custom-food action. */
const actDecl={};
for(const f of files){for(const m of code[f].matchAll(/registerAction\(\s*'([^']+)'\s*,/g)){(actDecl[m[1]]=actDecl[m[1]]||[]).push(f);}}
const actClash=Object.keys(actDecl).filter(k=>actDecl[k].length>1).map(k=>k+' ('+actDecl[k].join(', ')+')');
actClash.length?hard('action-registered-twice','actions registered more than once \u2014 the later silently replaces the earlier',actClash):pass('action-registered-twice','every action is registered once');
/* S2h \u2014 A CHART TYPE DRAWN WITHOUT A RENDERER. 25 of 37 catalogued types had no renderer and the catalogue did not say
   they were only planned. Every type a surface draws through the one bridge must have a renderer. */
const renderers=new Set();for(const f of files){for(const m of code[f].matchAll(/CHART_RENDERERS\.([A-Za-z]+)\s*=/g))renderers.add(m[1]);
  const obj=code[f].match(/var CHART_RENDERERS=\{([\s\S]*?)\n\};/);if(obj)for(const m of obj[1].matchAll(/^\s{2}([A-Za-z]+):function/gm))renderers.add(m[1]);}
const drawn=[];for(const f of files){for(const m of code[f].matchAll(/renderChartSpec\(\s*'([A-Za-z]+)'/g))if(!renderers.has(m[1]))drawn.push(m[1]+' ('+f+')');}
drawn.length?hard('chart-without-renderer','a surface draws a chart type that has no renderer',drawn):pass('chart-without-renderer','every chart type a surface draws has a renderer ('+renderers.size+' renderers)');
/* S2i \u2014 REGISTERING AN ACTION BEFORE THE REGISTRY EXISTS. The bundle is one script in file order, so a top-level
   registerAction() in a file that loads before registerAction is defined throws at load and nothing after it loads. It
   happened twice (the workout module, the chart catalogue); now it fails the build. */
/* Widened after the third occurrence (SHEETS.weather assigned in a file loading before SHEETS exists): any top-level use of a
   registry — registerAction(), SHEETS.x=, CHART_RENDERERS.x=, WIDGET_REGISTRY[...]= — before the file that defines it. */
const REGS=[['registerAction',/^function registerAction\(/m,/^registerAction\(/m],['SHEETS',/^var SHEETS\s*=/m,/^SHEETS\.[A-Za-z_$]+\s*=/m],
  ['CHART_RENDERERS',/^var CHART_RENDERERS\s*=/m,/^CHART_RENDERERS\.[A-Za-z_$]+\s*=/m],['WIDGET_REGISTRY',/^var WIDGET_REGISTRY\s*=/m,/^WIDGET_REGISTRY\[/m]];
const early=[];for(const [name,def,use] of REGS){const df=files.find(f=>def.test(code[f]));if(!df)continue;files.filter(f=>f<df&&use.test(code[f])).forEach(f=>early.push(name+' used in '+f+' before '+df));}
/* Release metadata is derived, never hand-written: a literal "25 models" in the release evidence drifted from the registry
   (audit §3, §100). Any hand-written count of models, quantities, capabilities or actions in release tooling fails. */
{const offenders=[];for(const f of ['tests/release.mjs','scripts/baseline.mjs','scripts/verify-dist.mjs']){if(!fs.existsSync(f))continue;const t=fs.readFileSync(f,'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
    (t.match(/['"`][^'"`\n]*\b\d+\s+(models|quantities|capabilities|actions|executable)\b[^'"`\n]*['"`]/g)||[]).forEach(m=>offenders.push(f+': '+m.slice(0,60)));}
  offenders.length?hard('hard-coded-count','a count is written by hand in release tooling instead of derived from a registry',offenders):pass('hard-coded-count','release counts are derived from the registries');}
/* SYSTEM_AUTHORITY.md names the source of truth for every subsystem; each named symbol must exist in the build */
{const auth=fs.existsSync('docs/SYSTEM_AUTHORITY.md')?fs.readFileSync('docs/SYSTEM_AUTHORITY.md','utf8'):'';const bundle=fs.existsSync('dist/index.html')?fs.readFileSync('dist/index.html','utf8'):'';
  const syms=[...auth.matchAll(/`([A-Za-z_$][\w$]*)`/g)].map(m=>m[1]).filter((v,i,a)=>a.indexOf(v)===i),missing=syms.filter(x=>!new RegExp('\\b'+x.replace(/\$/g,'\\$')+'\\b').test(bundle));
  !auth?hard('system-authority','docs/SYSTEM_AUTHORITY.md is missing',[]):(missing.length?hard('system-authority','SYSTEM_AUTHORITY.md names symbols that do not exist in the build',missing):pass('system-authority','every authority named in SYSTEM_AUTHORITY.md exists in the build ('+syms.length+')'));}
early.length?hard('action-before-registry','a registry is used at load time before the file that defines it',early):pass('action-before-registry','no file uses a registry before the file that defines it');
/* S2c \u2014 GOAL OWNERSHIP (hard gate, H0). The goal had several owners: trajectory took the phase's weight first, the protein
   suggestion only the profile's, scenarios and the copilot their own fallbacks. canonicalGoal() is the one reader;
   the editors that write the goal are the only other places allowed to touch the fields. */
const GOAL_OWNERS=['canonicalGoal','canonicalGoalType','applyProfileFields','saveProfile','openProfile','openPhase','savePhase','startPhase','openWelcome','_wzCommit','emptyDB','migrate'];
const stripFns=(src)=>{let out=src;for(const fn of GOAL_OWNERS){let k;const re=new RegExp('function '+fn+'\\s*\\(');
  while((k=out.search(re))>=0){const b=out.indexOf('{',k);let d=0,j=b;for(;j<out.length;j++){if(out[j]==='{')d++;else if(out[j]==='}'){d--;if(!d)break;}}out=out.slice(0,k)+out.slice(j+1);}}return out;};
const goalReads=[];
for(const f of files){if(/95-selftest|20-schema-storage|24-events/.test(f))continue;
  const src=stripFns(code[f]).replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g,"''");
  const m=src.match(/\.\s*(goalWeightLb|goalType)\b/g);if(m)goalReads.push(f+' ('+m.length+')');}
goalReads.length?hard('goal-ownership','the goal is read directly outside canonicalGoal() and its editors',goalReads):pass('goal-ownership','every goal read goes through canonicalGoal()');
/* ONE ENERGY DENSITY (catalogue W-003). Arithmetic with a kcal-per-lb or kcal-per-kg literal anywhere but the one service
   (tissueEnergyDensity, 79-rigour.js) is a second, silent energy-density assumption. It happened twice: 3,200 survived a
   fix that was verified by searching for 3,500, and 3,500 then survived in three consumers. Comments and strings are
   removed first, keeping line numbers (prose quoting 3,500 is not arithmetic); decimals, and 3600 (seconds in an hour),
   are not densities. The self-tests are exempt: they set known densities on purpose. */
{const codeOnly=t=>{let out='',i=0;const n=t.length;while(i<n){const c=t[i],d=t[i+1];
    if(c==='/'&&d==='*'){const k=t.indexOf('*/',i+2),e=k<0?n:k+2;out+=t.slice(i,e).replace(/[^\n]/g,' ');i=e;continue;}
    if(c==='/'&&d==='/'){const k=t.indexOf('\n',i);i=k<0?n:k;continue;}
    if(c==="'"||c==='"'||c==='`'){let k=i+1;while(k<n&&t[k]!==c){if(t[k]==='\\')k++;k++;}out+=c+t.slice(i+1,k).replace(/[^\n]/g,' ')+c;i=k+1;continue;}
    out+=c;i++;}return out;};
  const lits=[];for(const f of files){if(f==='79-rigour.js'||f==='95-selftest.js')continue;
    codeOnly(fs.readFileSync(path.join(SRC,f),'utf8')).split('\n').forEach((l,i)=>{const re=/(?:[\/*]\s*(\d{4})(?![\d.]))|(?:(?<![\d.\w])(\d{4})\s*[\/*])/g;let m;
      while((m=re.exec(l))){const v=+(m[1]||m[2]);if((v>=3000&&v<=3999&&v!==3600)||(v>=7000&&v<=7999))lits.push(f+':'+(i+1)+' '+v);}});}
  lits.length?hard('energy-density-literal','arithmetic with an energy-density literal outside the one service (tissueEnergyDensity, 79-rigour.js): use tissueKcalPerLb(), kcalToLb() or energyDensityRef()',lits)
    :pass('energy-density-literal','every kcal-per-lb conversion goes through the one energy-density service');}
/* S2b \u2014 a sheet defined twice. Two SHEETS.recoveryState and two SHEETS.mobility definitions each silently replaced
   one with the other; neither was noticed until the second screen failed to open. A later definition is allowed only as
   a WRAPPER \u2014 it must first capture the one it expands (var base=SHEETS.x). */
const sheetDefs={};
for(const f of files){for(const m of code[f].matchAll(/SHEETS\.([A-Za-z]+)\s*=\s*function/g)){(sheetDefs[m[1]]=sheetDefs[m[1]]||[]).push(f);}}
const sheetClash=Object.keys(sheetDefs).filter(k=>sheetDefs[k].length>1&&!new RegExp('=\\s*SHEETS\\.'+k+'\\s*;').test(all)).map(k=>k+' ('+sheetDefs[k].join(', ')+')');
sheetClash.length?hard('sheet-defined-twice','sheets defined more than once without the later one wrapping the earlier',sheetClash):pass('sheet-defined-twice','no sheet is silently redefined');
/* S3 \u2014 registries nobody reads: an UPPER_CASE registry referenced only where it is declared. */
const orphanRegistries=[];
for(const n of topLevel){if(!/^[A-Z][A-Z0-9_]{3,}$/.test(n))continue;
  const hits=(all.match(new RegExp('\\b'+n+'\\b','g'))||[]).length;if(hits<=1)orphanRegistries.push(n);}
/* Classified, with a reason, rather than given a dummy consumer (H0). Anything unread and unclassified is still reported;
   anything classified that has since gained a reader, or no longer exists, is reported too, so the table cannot rot. */
const REGISTRY_CLASSIFICATION={
  BUILD_TIME:{class:'metadata',reason:'stamped into the bundle by the build; the build\u2019s identity check reads the stamped value, not this name'}
};
const unexplained=orphanRegistries.filter(n=>!REGISTRY_CLASSIFICATION[n]);
const staleClass=Object.keys(REGISTRY_CLASSIFICATION).filter(n=>orphanRegistries.indexOf(n)<0);
if(unexplained.length)soft('registry-without-consumer','registries declared, never read and not classified',unexplained);
else pass('registry-without-consumer','every registry is read somewhere or classified with a reason ('+Object.keys(REGISTRY_CLASSIFICATION).length+' classified)');
if(staleClass.length)hard('registry-classification-stale','a classified registry is now read or no longer exists \u2014 remove its classification',staleClass);

/* S4 \u2014 audits nobody runs. */
const audits=[...topLevel].filter(n=>/Audit$/.test(n));
const unrunAudits=audits.filter(n=>{const uses=(all.match(new RegExp('\\b'+n+'\\(','g'))||[]).length+(tests.match(new RegExp('\\b'+n+'\\b','g'))||[]).length;return uses<=1;});
if(unrunAudits.length)hard('audit-never-run','audit functions that no gate and no other code ever calls \u2014 checks that never check',unrunAudits);
else pass('audit-never-run',audits.length+' audit functions, every one invoked');

/* ---------------- runtime: the same registries the app uses ---------------- */
const vc=new VirtualConsole();const errs=[];vc.on('jsdomError',e=>errs.push(String(e&&e.message).slice(0,160)));
const dom=new JSDOM(fs.readFileSync('dist/index.html','utf8'),{url:'https://physique.local/app/index.html',
  runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,
  beforeParse(w){w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.scrollTo=()=>{};
    w.fetch=undefined;w.HTMLElement.prototype.scrollIntoView=function(){};}});
await new Promise(r=>setTimeout(r,1000));
const w=dom.window;w.loadDemo();
/* S2e \u2014 THE CATALOGUE, GENERATED (H0, MK W32). Hand-written catalogues drifted: a module header called four implemented
   domains absent for several builds. This catalogue is produced from the running registries on every run, so it cannot
   disagree with the code, and the drift against the previous run is written beside it for review. */
try{
  const cat={generatedFrom:'the running registries',build:(()=>{try{return JSON.parse(fs.readFileSync(path.join(process.cwd(),'dist','version.json'),'utf8')).build;}catch(e){return null;}})(),
    models:w.MODELS.map(m=>({id:m.id,cls:m.cls||null,fn:m.fn})).sort((a,b)=>a.id<b.id?-1:1),
    capabilities:Object.keys(w.CAPABILITIES).sort().map(id=>{const c=w.capabilityStatus(id);return {id,met:Object.keys(c.evidence||{}).filter(k=>c.evidence[k]===true),grade:c.grade||null};}),
    entities:Object.keys(w.ENTITY_CONTRACTS).map(k=>({entity:k,status:w.ENTITY_CONTRACTS[k].status,horizon:w.ENTITY_CONTRACTS[k].horizon||null})),
    commands:w.commandRegister().map(c=>({id:c.id,level:w.commandLevel(c.id,c.group)})).sort((a,b)=>a.id<b.id?-1:1),
    sheets:Object.keys(w.SHEETS).sort(),events:Object.keys(w.EVENT_TYPES).sort(),observationTypes:Object.keys(w.OBS_TYPES).sort(),
    library:{exercises:w.EXERCISES.length,patterns:Object.keys(w.MOVEMENT_PATTERNS).length,ladders:Object.keys(w.PROGRESSIONS).length,mobility:w.MOBILITY_LIBRARY.length,routines:Object.keys(w.MOBILITY_ROUTINES).length},
    panels:w.PANEL_LEVEL_RULES.length};
  const dir=path.join(process.cwd(),'docs','implementation');fs.mkdirSync(dir,{recursive:true});
  const prevPath=path.join(dir,'catalogue.json');let prev=null;try{prev=JSON.parse(fs.readFileSync(prevPath,'utf8'));}catch(e){}
  const ids=(arr,k)=>new Set((arr||[]).map(x=>typeof x==='string'?x:x[k]));
  const drift=[];
  if(prev){for(const [key,k] of [['models','id'],['capabilities','id'],['entities','entity'],['commands','id'],['sheets',null],['events',null],['observationTypes',null]]){
    const a0=ids(prev[key],k),a1=ids(cat[key],k);[...a1].filter(x=>!a0.has(x)).forEach(x=>drift.push('added '+key.replace(/s$/,'')+': '+x));[...a0].filter(x=>!a1.has(x)).forEach(x=>drift.push('removed '+key.replace(/s$/,'')+': '+x));}
    (cat.entities||[]).forEach(e=>{const o=(prev.entities||[]).find(x=>x.entity===e.entity);if(o&&o.status!==e.status)drift.push('entity '+e.entity+': '+o.status+' \u2192 '+e.status);});
    (cat.capabilities||[]).forEach(c=>{const o=(prev.capabilities||[]).find(x=>x.id===c.id);if(o&&o.met.length!==c.met.length)drift.push('capability '+c.id+': '+o.met.length+' \u2192 '+c.met.length+' criteria met');});
    Object.keys(cat.library).forEach(k=>{if(prev.library&&prev.library[k]!==cat.library[k])drift.push('library '+k+': '+prev.library[k]+' \u2192 '+cat.library[k]);});}
  fs.writeFileSync(prevPath,JSON.stringify(cat,null,1));
  const md=['# Catalogue (generated)','','Produced from the running registries on every governance run. Do not edit by hand.','',
    '| | count |','|---|---|','| models | '+cat.models.length+' |','| capabilities | '+cat.capabilities.length+' |','| entity contracts | '+cat.entities.length+' |','| commands | '+cat.commands.length+' |',
    '| sheets | '+cat.sheets.length+' |','| event types | '+cat.events.length+' |','| observation types | '+cat.observationTypes.length+' |','| exercises | '+cat.library.exercises+' |','| movement patterns | '+cat.library.patterns+' |',
    '| progression families | '+cat.library.ladders+' |','| mobility items | '+cat.library.mobility+' |','| classified panels (rules) | '+cat.panels+' |','',
    '## Entity contracts','',...cat.entities.map(e=>'- **'+e.entity+'**: '+e.status+(e.horizon?(' ('+e.horizon+')'):'')),'',
    '## Capabilities','',...cat.capabilities.map(c=>'- '+c.id+': '+c.met.length+'/5 ('+c.met.join(', ')+')'),'',
    '## Drift since the previous run','',...(prev?(drift.length?drift.map(d=>'- '+d):['- none']):['- first run: no previous catalogue'])];
  fs.writeFileSync(path.join(dir,'catalogue.md'),md.join('\n')+'\n');
  pass('catalogue','catalogue generated from the running registries'+(prev?(' \u2014 '+drift.length+' change(s) since the previous run'):' (first run)'));
}catch(e){hard('catalogue','the catalogue could not be generated from the running registries',[String(e.message)]);}
/* S2d \u2014 ENTITY CONTRACTS (hard gate, H0). Every core object's contract is checked against the running code, and every
   store in the record must belong to a contract or be listed as supporting: no new major product object without one. */
try{const ec=w.entityContractAudit();ec.ok?pass('entity-contracts','all '+ec.contracts+' entity contracts hold, and every store in the record is owned or explained'):
  hard('entity-contracts','an entity contract does not match the code, or a store has no owner',ec.issues);}
catch(e){hard('entity-contracts','the entity contract audit could not run',[String(e.message)]);}

/* R1 \u2014 every model: version, provenance, uncertainty. */
const noVersion=[],noProv=[],noUnc=[];
for(const m of w.MODELS){
  const r=w.infer({modelId:m.id});
  if(!m.version)noVersion.push(m.id);
  if(r.status==='ok'){
    if(!r.provenance||!r.provenance.nodes||!r.provenance.nodes.length)noProv.push(m.id);
    const u=r.uncertainty||{};
    const missing=['sources','distribution','interval','confidence','calibration','propagation','limitations'].filter(k=>!(k in u));
    if(missing.length)noUnc.push(m.id+' (missing '+missing.join(', ')+')');
  }
}
noVersion.length?hard('model-without-version','models with no version',noVersion):pass('model-without-version',w.MODELS.length+' models, each versioned');
noProv.length?hard('model-without-provenance','models whose results carry no provenance',noProv):pass('model-without-provenance','every model result carries provenance');
noUnc.length?hard('model-without-uncertainty','models whose results lack parts of the uncertainty contract',noUnc):pass('model-without-uncertainty','every model result carries the full uncertainty contract');

/* R2 \u2014 registered but unimplemented. */
const ra=w.modelRegistryAudit();const cm=w.capabilityMatrix();
const unimpl=ra.issues.concat(cm.detections.registeredButUnimplemented.map(x=>'capability '+x));
unimpl.length?hard('registered-but-unimplemented','registry entries with nothing behind them',unimpl):pass('registered-but-unimplemented','every registry entry resolves to an implementation');

/* R3 \u2014 implemented but unsurfaced. */
cm.detections.implementedButUnsurfaced.length?soft('implemented-but-unsurfaced','capabilities no view or action exposes',cm.detections.implementedButUnsurfaced):
  pass('implemented-but-unsurfaced','every capability is surfaced');

/* R4 \u2014 surfaced but untested: a navigable action no gate ever exercises. */
const navs=Object.keys(w.ACTIONS).filter(a=>/^nav\./.test(a));
const untested=navs.filter(a=>!tests.includes("'"+a+"'")&&!tests.includes('"'+a+'"'));
untested.length?soft('surfaced-but-untested','navigable surfaces no gate opens',untested):pass('surfaced-but-untested','every navigable surface is exercised by a gate');

/* R5 \u2014 consumer without registry entry. */
const models=new Set(w.MODELS.map(m=>m.id));const dangling=[];
Object.keys(w.WIDGET_REGISTRY).forEach(k=>(w.WIDGET_REGISTRY[k].modelDependencies||[]).forEach(d=>{if(!models.has(d))dangling.push('widget '+k+' \u2192 model '+d);}));
Object.keys(w.MODEL_BINDINGS).forEach(k=>{if(!models.has(k))dangling.push('binding '+k+' names no registered model');});
Object.keys(w.BUILTIN_DASHBOARDS).forEach(k=>w.BUILTIN_DASHBOARDS[k].sections.forEach(s=>s.widgets.forEach(p=>{if(!w.WIDGET_REGISTRY[p.widgetId])dangling.push('dashboard '+k+' \u2192 widget '+p.widgetId);})));
Object.keys(w.CAPABILITIES).forEach(k=>{const c=w.CAPABILITIES[k];if(c.action&&!w.ACTIONS[c.action])dangling.push('capability '+k+' \u2192 action '+c.action);});
dangling.length?hard('consumer-without-registry-entry','references to registry entries that do not exist',dangling):pass('consumer-without-registry-entry','every reference resolves to a registry entry');

/* R6 \u2014 view without canonical model. */
const modelless=Object.keys(w.WIDGET_REGISTRY).filter(k=>{const x=w.WIDGET_REGISTRY[k];
  return !(x.modelDependencies&&x.modelDependencies.length)&&!x.source&&!x.contractId&&!x.chartModel;});
modelless.length?soft('view-without-canonical-model','widgets that read no registered model',modelless):pass('view-without-canonical-model','every widget reads a registered model or a declared source');

/* R7 \u2014 unused model: a registered model whose function nothing outside the registry calls. */
const unused=w.MODELS.filter(m=>{const fn=w.MODEL_BINDINGS[m.id];if(!fn)return false;
  const calls=(all.match(new RegExp('\\b'+fn+'\\(','g'))||[]).length;return calls<=1&&!all.includes("'"+m.id+"'");}).map(m=>m.id);
unused.length?soft('unused-model','registered models nothing uses',unused):pass('unused-model','every registered model has a consumer');

/* R8 \u2014 missing test: a registered model no test names. */
const noTest=w.MODELS.filter(m=>!tests.includes(m.id)&&!tests.includes(w.MODEL_BINDINGS[m.id]||'~none~')).map(m=>m.id);
noTest.length?soft('missing-test','registered models no test names',noTest):pass('missing-test','every registered model is named by a test');

/* R9 \u2014 fields read that nothing ever writes. Each record is wrapped in a recording proxy and the whole app is
   exercised over the demo record; a key read on a record type where no record of that type ever held it is
   reported. This is the detector for p.hit and its relatives. */
const COLLECTIONS=['predictions','experiments','phases','sessions','decisions','interventions'];
/* Fields held by a fixture count as covered: fixtures exist precisely to exercise what the demo does not. */
const fixturePresent={};
try{const fx=w.FIXTURES.corrections_and_outcomes();for(const c of COLLECTIONS){fixturePresent[c]=new Set();(fx[c]||[]).forEach(r=>r&&typeof r==='object'&&Object.keys(r).forEach(k=>fixturePresent[c].add(k)));}}catch(e){console.log('  note  fixture could not be built: '+e.message);}
const present={},readMissing={};
const wrap=(name,rec)=>{Object.keys(rec).forEach(k=>present[name].add(k));
  return new Proxy(rec,{get(t,k){if(typeof k==='string'&&!(k in t)&&!/^(toJSON|then|constructor|valueOf|toString|inspect|nodeType|length|\$\$typeof)$/.test(k))
    (readMissing[name][k]=(readMissing[name][k]||0)+1);return t[k];}});};
for(const c of COLLECTIONS){present[c]=new Set();readMissing[c]={};
  if(Array.isArray(w.DB[c]))w.DB[c]=w.DB[c].map(r=>r&&typeof r==='object'?wrap(c,r):r);}
w._memoInvalidate&&w._memoInvalidate();
const exercise=[()=>['today','log','plan','train','food','body','progress','diagnose','experiments','learn','archive','tools'].forEach(t=>w.switchTab(t)),
  ()=>w.MODELS.forEach(m=>w.infer({modelId:m.id})),()=>w.knowledgeGraph(),()=>w.canonicalKnowledgeGraph(),()=>w.calibrationByContext(),
  ()=>w.contextPacket(),()=>w.copilotProposals(),()=>w.optimisePlans(),()=>w.forecastFamily(),()=>w.programStructure(8),
  ()=>w.DB.experiments.forEach(e=>w.experimentStructure(e)),()=>w.decide(),()=>w.diagnose(),()=>w.forecastTrackRecord('weight_forecast')];
exercise.forEach(f=>{try{f();}catch(e){}});
/* Optional fields: legitimately absent on some records by design, declared here with the reason. */
const OPTIONAL={predictions:['actual','error','absError','covered','scoredAt','actualBasis','outcome'],
  experiments:['outcome','conclusion','confidence','confounders','completedAt','revisions','revisionOf','planHash','planVersion','intervention','metric','successCriteria'],
  phases:['endDate','goalWeightLb','notes','targetDate'],sessions:['retracted','note','duration'],
  decisions:['user','note','outcome'],interventions:['endedAt','outcome']};
/* A field absent from THIS data may still be written by code the demo never exercised — a session correction, a
   phase ending. The first version reported those. The defect is a field NO code writes: that is what p.hit was.
   So a missing read is reported only if nothing in the source ever assigns that name. */
const hasWriter=n=>new RegExp('\\.'+n+'\\s*=[^=]|[{,]\\s*'+n+'\\s*:|\\[[\'"]'+n+'[\'"]\\]\\s*=[^=]').test(all);
const neverWritten=[],optionalByData=[];
for(const c of COLLECTIONS){for(const k of Object.keys(readMissing[c])){
  if(present[c].has(k)||(fixturePresent[c]&&fixturePresent[c].has(k))||(OPTIONAL[c]||[]).includes(k))continue;
  (hasWriter(k)?optionalByData:neverWritten).push(c+'.'+k+' (read '+readMissing[c][k]+'\u00d7)');}}
/* The detector is checked against the defect it exists for: 'hit' has no writer, 'covered' has one. */
if(hasWriter('hit')||!hasWriter('covered'))hard('governance-self-check','the never-written detector no longer tells a field with no writer from one with a writer');
if(optionalByData.length)soft('field-absent-in-this-data','fields some code writes, but no record in this data holds \u2014 not a defect, recorded so the demo\u2019s coverage is visible',optionalByData);
neverWritten.length?hard('field-read-never-written','fields read on a record type that no record of that type has ever held',neverWritten):
  pass('field-read-never-written','every field read on a stored record exists on some record of its type');
if(errs.length)hard('runtime','uncaught errors while governing',errs.slice(0,5));

/* ---------------- drift, and the generated report ---------------- */
const OUT='docs/implementation';fs.mkdirSync(OUT,{recursive:true});
const reportPath=path.join(OUT,'governance-report.json');
const prev=fs.existsSync(reportPath)?JSON.parse(fs.readFileSync(reportPath,'utf8')):null;
const counts=o=>Object.fromEntries(o.map(x=>[x.cat,x.items.length]));
const now={hard:counts(HARD),soft:counts(SOFT)};
const drift=[];
if(prev&&prev.counts){for(const [k,v] of Object.entries(now.soft)){const was=(prev.counts.soft||{})[k]||0;if(v>was)drift.push(k+': '+was+' \u2192 '+v);}}
if(drift.length)soft('architecture-drift','soft findings that grew since the previous governance report',drift);
const version=JSON.parse(fs.readFileSync('dist/version.json','utf8'));
const report={generatedAt:new Date().toISOString(),build:version.build,counts:now,hard:HARD,soft:SOFT,pass:PASS,
  note:'Generated from code metadata and the runtime registries by tests/governance.mjs. Do not edit by hand.'};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
const md=['# Governance report','',`Build ${version.build} \u00b7 generated ${report.generatedAt}`,'',
  `**${HARD.length} hard** (fail the build) \u00b7 **${SOFT.length} soft** (tracked) \u00b7 **${PASS.length} passing**`,''].concat(
  HARD.concat(SOFT).map(f=>`## ${f.cat}\n\n${f.msg}\n\n`+f.items.slice(0,40).map(i=>'- '+i).join('\n')+(f.items.length>40?`\n- \u2026and ${f.items.length-40} more`:'')+'\n'),
  ['## Passing','',...PASS.map(p=>`- **${p.cat}** \u2014 ${p.msg}`),'']).join('\n');
fs.writeFileSync(path.join(OUT,'governance-report.md'),md);

/* ---------------- output ---------------- */
PASS.forEach(p=>console.log(`  pass  [${p.cat}] ${p.msg}`));
SOFT.forEach(f=>{console.log(`  note  [${f.cat}] ${f.msg}: ${f.items.length}`);f.items.slice(0,6).forEach(i=>console.log('          '+i));});
HARD.forEach(f=>{console.log(`  FAIL  [${f.cat}] ${f.msg}: ${f.items.length}`);f.items.slice(0,8).forEach(i=>console.log('          '+i));});
console.log(`\n${PASS.length} passing, ${SOFT.length} tracked, ${HARD.length} failing \u2014 report written to ${OUT}/governance-report.{json,md}`);
process.exit(HARD.length?1:0);
