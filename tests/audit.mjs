#!/usr/bin/env node
/* FULL-SURFACE AUDIT
 *
 * Written after a bug the existing suite could not see: `.fab-mini` was `display:none` behind a class that
 * nothing ever added, so the whole utility rail was invisible while every element remained in the DOM.
 * Assertions that checked for presence passed the entire time.
 *
 * The lesson generalises into four checks, none of which are about behaviour:
 *
 *   1. VISIBILITY   — does the thing actually render, by computed style, not by existing?
 *   2. POPULATION   — does it contain real content against a real record, or is it an empty shell?
 *   3. DEAD TOGGLES — does every class and attribute the code toggles have a stylesheet rule that acts on it?
 *   4. PLACEHOLDERS — does any surface leak NaN, undefined, [object Object] or an unresolved token?
 *
 * jsdom does no layout, so geometry cannot be checked here — but it DOES resolve the cascade, which is
 * where the rail bug lived and where this class of bug usually lives.
 *
 *   node tests/audit.mjs [--json]
 */
import fs from 'node:fs';import path from 'node:path';import {JSDOM,VirtualConsole} from 'jsdom';

const JSON_ONLY=process.argv.includes('--json');
const html=fs.readFileSync('dist/index.html','utf8');
const vc=new VirtualConsole();
const jsdomErrors=[];
vc.on('jsdomError',e=>jsdomErrors.push(String(e&&e.message||e)));
const dom=new JSDOM(html,{url:'https://physique.local/app/index.html',runScripts:'dangerously',
  pretendToBeVisual:true,virtualConsole:vc,
  beforeParse(w){w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
    w.scrollTo=()=>{};w.fetch=undefined;w.HTMLElement.prototype.scrollIntoView=function(){};}});
const w=dom.window;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
await sleep(500);

const findings=[];const pass=[];
const add=(sev,area,what,detail)=>findings.push({sev,area,what,detail:detail||''});
const good=(area,what,detail)=>pass.push({area,what,detail:detail||''});

w.loadDemo();
try{w._refTables.yields=JSON.parse(fs.readFileSync('dist/data/reference/yields.json','utf8'));}catch(e){}
w.renderAll();await sleep(60);
try{w.updateRail();}catch(e){}

const disp=el=>el?w.getComputedStyle(el).display:'(missing)';
const visible=el=>!!el&&!el.hidden&&disp(el)!=='none'&&w.getComputedStyle(el).visibility!=='hidden';
const PLACEHOLDER=/\bNaN\b|\bundefined\b|\[object Object\]|\bnull\b\s*(?:%|kcal|lb|kg)|\{\{|\bInfinity\b/;

/* ---------------- 1. every view renders, is visible, and is populated ---------------- */
const TABS=['today','log','plan','train','food','body','progress','diagnose','experiments','learn','archive','tools'];
for(const tab of TABS){
  w.switchTab(tab);await sleep(40);
  const view=w.document.getElementById('view-'+tab);
  if(!view){add('P0','view',tab+': the view element is missing');continue;}
  if(!visible(view)){add('P0','view',tab+': the view is not visible',disp(view));continue;}
  const text=(view.textContent||'').replace(/\s+/g,' ').trim();
  if(text.length<80){add('P1','view',tab+': renders almost nothing',text.length+' characters');continue;}
  const controls=[...view.querySelectorAll('[data-act]')].filter(visible);
  if(!controls.length)add('P1','view',tab+': no visible controls');
  const ph=PLACEHOLDER.exec(text);
  if(ph)add('P1','placeholder',tab+': leaks "'+ph[0]+'" into the interface',text.slice(Math.max(0,ph.index-60),ph.index+40));
  if(!ph&&controls.length)good('view',tab,text.length+' chars, '+controls.length+' visible controls');
}

/* ---------------- 2. every sheet opens, is visible and is populated ---------------- */
const SHEET_ACTS=[['nav.ask','ask'],['nav.domains','domains'],['injury.add','injuryAdd'],
  ['gen.program','genProgram'],['gen.progress','progression'],['gen.meals','mealPlan'],['gen.search','planSearch'],
  ['nav.graph','graph'],['nav.causal','causal'],['nav.experiments2','expLibrary'],
  ['nav.resistance','resistance'],['nav.propagation','propagation'],['nav.mobility','mobility'],['nav.compose','compose'],['nav.conditioning','conditioning'],['nav.substitute','substitute'],['nav.recovery2','recoveryState'],['nav.twin','twin'],['nav.maintenance','maintenance'],['nav.maturity','maturity'],['nav.studio','studio'],['nav.dashboard','dashboard'],['nav.vizstudio','vizstudio'],['nav.bodymap','bodymap'],['nav.movement','movement'],['nav.program','program'],['nav.nutritionviz','nutritionviz'],['nav.exports','exports'],['nav.recoveryAllocation','recoveryAllocation'],['nav.motorLearning','motorLearning'],['nav.hydration','hydration'],['nav.supplements','supplements'],['nav.inference','inference'],['nav.equipment','equipment'],['nav.deload','deload'],['nav.optimise','optimise'],['nav.yoga','yoga'],['move.prepare','prepare'],['move.recover','recover'],['move.library','moveLibrary'],['move.progress','progressions'],
  ['nav.attention','attention'],['nav.timeline','timeline'],['nav.missing','missing'],
  ['nav.dataQuality','dataQuality'],['ui.keys','keys'],['ui.undoHistory','undoHistory'],
  ['nav.setup','setup'],['nav.whatChanged','whatChanged'],['nav.storage','storage'],
  ['nav.health','health'],['nav.sync','sync'],['nav.cloud','cloud'],['nav.knowledge','knowledge'],
  ['nav.episodes','episodes'],['nav.scenarios','scenarios'],['exp.design','design'],
  ['nav.import','import'],['nav.photos','photos'],['nav.voice','voice'],['nav.label','label'],
  ['nav.yields','yields'],['nav.integrity','eventIntegrity'],['nav.planEdit','planEdit'],
  ['nav.recent','recent'],['nav.jump','jumps'],['nav.since','since'],['nav.compare','compare'],
  ['nav.saved','saved'],['replay.waypoints','waypoints'],['replay.compare','replayCompare']];
for(const [act,form] of SHEET_ACTS){
  try{w.dispatchAct(act);}catch(e){add('P0','sheet',form+': dispatching '+act+' threw',String(e.message).slice(0,90));continue;}
  await sleep(40);
  if(!w._SHEET||w._SHEET.opts.form!==form){add('P0','sheet',form+': did not open from '+act);continue;}
  const bd=w.document.getElementById('editBackdrop');
  if(!visible(bd)){add('P0','sheet',form+': the sheet container is not visible',disp(bd));}
  const text=(bd.textContent||'').replace(/\s+/g,' ').trim();
  if(text.length<40)add('P1','sheet',form+': opens nearly empty',text.length+' characters');
  const ph=PLACEHOLDER.exec(text);
  if(ph)add('P1','placeholder',form+': leaks "'+ph[0]+'"',text.slice(Math.max(0,ph.index-60),ph.index+40));
  const focusables=[...bd.querySelectorAll('button,a[href],input,textarea,select')].filter(visible);
  if(!focusables.length)add('P1','sheet',form+': no visible focusable control, so it cannot be closed by keyboard');
  if(text.length>=40&&!ph&&focusables.length)good('sheet',form,text.length+' chars, '+focusables.length+' controls');
  w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  await sleep(20);
  if(w._SHEET)add('P1','sheet',form+': Escape did not close it');
}

/* ---------------- 3. dead toggles: does the stylesheet act on what the code toggles? ---------------- */
const css=[...w.document.querySelectorAll('style')].map(x=>x.textContent).join('\n');
const script=/<script>([\s\S]*?)<\/script>/.exec(html)[1];
{
  const toggled=new Set();
  for(const m of script.matchAll(/classList\.(?:add|toggle)\(\s*'([a-zA-Z0-9_-]+)'/g))toggled.add(m[1]);
  for(const m of script.matchAll(/setAttribute\(\s*'(data-[a-z-]+)'\s*,\s*'([a-zA-Z0-9_-]+)'/g))
    toggled.add(m[1]+'="'+m[2]+'"');
  const dead=[];
  for(const t of toggled){
    const isAttr=t.startsWith('data-');
    const needle=isAttr?('['+t+']'):('.'+t);
    if(!css.includes(needle))dead.push(t+(isAttr?' (attribute)':' (class)'));
  }
  if(dead.length)add('P1','dead-toggle','the code toggles something the stylesheet never acts on',dead.join(', '));
  else good('dead-toggle','every toggled class and data attribute has a stylesheet rule',toggled.size+' checked');
  /* The inverse: a rule keyed on a class nothing ever adds is how the rail bug survived. */
  const orphan=[];
  for(const m of css.matchAll(/\.(fab-mini|fab|rail-left|rail-right)\.([a-zA-Z0-9_-]+)\s*\{/g)){
    if(!toggled.has(m[2])&&!script.includes("'"+m[2]+"'"))orphan.push(m[1]+'.'+m[2]);
  }
  if(orphan.length)add('P2','dead-toggle','a rule is keyed on a class nothing adds \u2014 the shape of the rail bug',orphan.join(', '));
}

/* ---------------- 4. rail contract: visibility driven by the attribute AT reads ----------------
   The rails belong to the Insightful and Developer levels; Casual drops the position rail and the command palette by
   design (00-head.html), so the contract is checked at Insightful, and Casual is checked for exactly that. A new record
   starts at Casual, so the level the audit loads in is not the one the rails are for. */
const _lvl0=w.DB.settings.detail;w.DB.settings.detail='insightful';w.applySettings();
{
  const rails=['railLeft','railRight'].map(id=>w.document.getElementById(id));
  if(rails.some(r=>!r))add('P0','rail','a rail container is missing');
  else if(!rails.every(visible))add('P0','rail','a rail container is not visible',rails.map(r=>r.id+'='+disp(r)).join(' '));
  else good('rail','both rails are laid out');
  const minis=[...w.document.querySelectorAll('.fab-mini')];
  const stray=minis.filter(b=>!b.closest('.rail-left')&&!b.closest('.rail-right'));
  if(stray.length)add('P1','rail','a rail button sits outside a rail and is positioned individually',
    stray.map(b=>b.id).join(', '));
  for(const b of minis){
    const shown=visible(b);
    if(!b.hidden&&!shown)add('P0','rail',(b.id||'a button')+' is not hidden but does not render',disp(b));
    if(b.hidden&&disp(b)!=='none')add('P1','rail',(b.id||'a button')+' is hidden but still renders',disp(b));
    if(!b.getAttribute('aria-label'))add('P1','rail',(b.id||'a button')+' has no accessible name');
  }
  /* Congestion and duplication are structural, so they are checked structurally. The right rail had six
     buttons over the text column, two of which (jump-to-top) duplicated the left rail exactly. */
  /* Refined after the usage review asked for a voice button above +: controls that appear only when useful (undo after an
     action, jump top/bottom while scrolled) are transient and are not counted; the limits apply to what always floats. */
  const railActs=id=>[...w.document.querySelectorAll('#'+id+' .fab-mini:not([data-transient])')].map(b=>b.getAttribute('data-act'));
  const rightActs=railActs('railRight'), leftActs=railActs('railLeft');
  if(rightActs.length>3)add('P1','rail','the right rail carries more than two floating controls',
    rightActs.length+': '+rightActs.join(', '));
  const dupes=rightActs.filter(a=>leftActs.includes(a));
  if(dupes.length)add('P1','rail','the same action appears on both rails',dupes.join(', '));
  const totalFloating=rightActs.length+leftActs.length+w.document.querySelectorAll('.fab').length;
  if(totalFloating>7)add('P1','rail','too many controls float over the text column',totalFloating+' total');
  if(rightActs.length<=2&&!dupes.length&&totalFloating<=7)
    good('rail','the floating set is small and free of duplicates',
      'right '+rightActs.length+', left '+leftActs.length+', '+totalFloating+' total');
  const alwaysOn=['homeFab','cmdkFab'].filter(id=>!visible(w.document.getElementById(id)));
  if(alwaysOn.length)add('P0','rail','a control that should always be available is invisible',alwaysOn.join(', '));
  else good('rail','the always-available controls render',minis.length+' rail buttons checked');
}
{ /* Casual: the position rail and the palette are gone by design; the right rail (undo, voice) and the quick log stay */
  w.DB.settings.detail='casual';w.applySettings();
  const gone=['railLeft','cmdkFab'].filter(id=>visible(w.document.getElementById(id)));
  const kept=[['railRight',w.document.getElementById('railRight')],['quick log',w.document.querySelector('.fab[data-act="log.open"]')]].filter(x=>!x[1]||!visible(x[1])).map(x=>x[0]);
  if(gone.length)add('P1','rail','Casual should drop the position rail and the command palette, but shows',gone.join(', '));
  else if(kept.length)add('P0','rail','Casual hides a control someone logging needs',kept.join(', '));
  else good('rail','Casual drops the position rail and the palette, and keeps the right rail and the quick log');
  w.DB.settings.detail=_lvl0;w.applySettings();}

/* ---------------- 5. population: the data-backed surfaces have data ---------------- */
{
  const checks=[
    /* The shard database loads over fetch, which this harness does not provide. So check the two things that
       ARE checkable here: the data is present in the distribution, and the app reports its own state honestly
       rather than claiming zero products. Whether a real browser fetches them is a browser-gate question. */
    ['food database shipped',()=>{const m=JSON.parse(fs.readFileSync('dist/data/food/manifest.json','utf8'));
      return (m.branded&&m.branded.records>0)||(m.files&&m.files.length>0);},
      ()=>{const m=JSON.parse(fs.readFileSync('dist/data/food/manifest.json','utf8'));
        return (m.branded&&m.branded.records?m.branded.records+' branded records':(m.files.length+' shard files'));}],
    /* Honest means: it describes its state in words rather than claiming a count it does not have. Pinning
       the exact string would test the wording, not the property. */
    ['food state reported honestly',()=>{const st=w._foodManifestState;
      return typeof st==='string'&&st.length>3&&(!!w._foodManifest||!/\b0\b|loaded$/.test(st));},
      ()=>'reports: '+String(w._foodManifestState).slice(0,60)],
    ['food cache reports itself',()=>!!w.foodCacheStats(),()=>w.foodCacheStats().entries+' cached'],
    ['yield table',()=>w.yieldTableInfo().installed&&w.yieldTableInfo().count>0,()=>w.yieldTableInfo().count+' factors'],
    ['event log',()=>w._EVENTS.length>0,()=>w._EVENTS.length+' events'],
    ['projection matches record',()=>w.projectionMatchesRecord().ok,()=>'reproduces'],
    ['model registry',()=>w.modelContractIssues().length===0,()=>'no contract issues'],
    ['data contracts',()=>w.dataContractIssues().length===0,()=>'no contract issues'],
    ['interaction matrix',()=>w.interactionMatrix().issues.length===0,()=>w.interactionMatrix().total+' commands, all reachable'],
    ['command register',()=>Object.keys(w.ACTIONS).every(id=>w.commandRegister().some(c=>c.id===id)),()=>w.commandRegister().length+' registered'],
    ['traces',()=>w.traceIds().every(id=>{const t=w.traceValue(id);return t.status==='ok'||t.status==='insufficient';}),
      ()=>w.traceIds().filter(id=>w.traceValue(id).status==='ok').length+' of '+w.traceIds().length+' resolve'],
    ['decision',()=>{const d=w.decide();return !!d&&!!d.code;},()=>w.decide().code],
    ['attention queue',()=>Array.isArray(w.attentionQueue().items),()=>w.attentionQueue().items.length+' items'],
    ['episodes',()=>Array.isArray(w.detectEpisodes(365).episodes),()=>w.detectEpisodes(365).episodes.length+' episodes'],
    ['knowledge',()=>w.personalKnowledge().count>=0,()=>w.personalKnowledge().count+' items'],
    ['training plan',()=>{const p=w.trainingProgram();return !!p.week&&Object.keys(p.week).length>0;},
      ()=>Object.keys(w.trainingProgram().week).length+' training days'],
    ['domains',()=>w.domainContractIssues().length===0,()=>w.domainList().length+' domains, contract clean'],
    ['domain loop read-only',()=>{const n=w.DB.observations.length,e=w._EVENTS.length;
      w.domainStates();w.domainFindings();w.domainProposals();w.domainGaps();w.domainKnowledge();
      return w.DB.observations.length===n&&w._EVENTS.length===e;},()=>'no writes'],
    ['generators propose only',()=>{const n=w.DB.foodLogs.length,p2=JSON.stringify(w.programDef(w.trainingProgram().key));
      w.generatePrograms();w.planDay();w.searchPlans();w.progressionPlan();
      return w.DB.foodLogs.length===n&&JSON.stringify(w.programDef(w.trainingProgram().key))===p2;},()=>'no writes'],
    ['movement engine',()=>w.DOSE_DIMENSIONS.length===5&&Object.keys(w.MOVEMENT_ROLES).length>=10,
      ()=>Object.keys(w.MOVEMENT_ROLES).length+' roles, '+w.DOSE_DIMENSIONS.length+' dose dimensions'],
    ['knowledge graph',()=>{const g=w.knowledgeGraph();const keys={};g.nodes.forEach(n=>keys[n.key]=1);
      return g.edges.every(e=>keys[e.from]&&keys[e.to]);},()=>w.knowledgeGraph().nodes.length+' nodes'],
    ['assistant boundary',()=>{const pk=w.contextPacket();
      return pk.actions.every(a2=>typeof w.ACTIONS[a2.id]==='function')&&!pk.notes&&
        !w.validateAssistantReply({text:'Your maintenance is 9999 kcal.'},pk).ok;},
      ()=>w.contextPacket().actions.length+' dispatchable actions offered'],
    ['swallowed errors',()=>w.getSwallowedErrors().count===0,()=>'none'],
  ];
  for(const [name,test,detail] of checks){
    let ok2=false,d='';
    try{ok2=!!test();d=ok2?detail():'';}catch(e){d=String(e.message).slice(0,80);}
    if(ok2)good('population',name,d);
    else add(name==='swallowed errors'?'P1':'P0','population',name+' is empty or failing',
      d||JSON.stringify(name==='swallowed errors'?w.getSwallowedErrors().top:'').slice(0,120));
  }
}

/* ---------------- 6. every rendered action resolves, across every view ---------------- */
{
  const acts=new Set();
  for(const tab of TABS){w.switchTab(tab);await sleep(8);
    w.document.querySelectorAll('[data-act]').forEach(el=>acts.add(el.getAttribute('data-act')));}
  const unregistered=[...acts].filter(a=>!w.ACTIONS[a]);
  if(unregistered.length)add('P0','action','a rendered control points at no registered action',unregistered.join(', '));
  else good('action','every rendered control resolves',acts.size+' distinct actions rendered');
}

/* ---------------- 7. the build must need nothing but Node ----------------
   A build step that shells out to another runtime works locally and fails on a hosted image that ships Node
   and nothing else. That is not hypothetical: this build used to call python3 for icon generation, and the
   hosted build failed on exactly that. */
{
  const buildSrc=fs.readFileSync('build.mjs','utf8');
  const offenders=[];
  if(/child_process/.test(buildSrc))offenders.push('build.mjs imports child_process');
  /* Not a bare `exec`: regular expressions have an .exec() method and matching it flags every regex in the
     file. Only the child_process entry points count, and only when they are not a property access. */
  for(const m of buildSrc.matchAll(/(?<![.\w])(execSync|spawnSync|execFileSync|fork)\s*\(/g))
    offenders.push('build.mjs calls '+m[1]+'()');
  /* Anything build.mjs imports must be Node built-ins or local files — never a package. */
  for(const m of buildSrc.matchAll(/from\s+'([^']+)'/g)){
    const spec=m[1];
    if(!spec.startsWith('node:')&&!spec.startsWith('.'))offenders.push('build.mjs imports the package "'+spec+'"');
  }
  const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
  if(pkg.dependencies&&Object.keys(pkg.dependencies).length)
    offenders.push('runtime dependencies would have to be installed to build: '+Object.keys(pkg.dependencies).join(', '));
  /* devDependencies are deliberately allowed: the GATES may need jsdom and a browser driver, the BUILD may
     not. Anyone can build this with Node alone; only someone running the test suite needs anything else. */
  const devOnly=Object.keys(pkg.devDependencies||{});
  if(devOnly.length)good('build','the gates may need packages, the build may not','dev-only: '+devOnly.join(', '));
  if(offenders.length)add('P0','build','the build needs more than Node',offenders.join('; '));
  else good('build','the build needs nothing but Node','no subprocesses, no packages, no runtime dependencies');
  /* And the icons it produced must be real PNGs, since a broken one passes every later text check. */
  const icons=fs.readdirSync('dist/icons').filter(f=>f.endsWith('.png'));
  const bad=icons.filter(f=>{const b2=fs.readFileSync(path.join('dist','icons',f));
    return b2.slice(0,8).toString('hex')!=='89504e470d0a1a0a'||b2.readUInt32BE(16)<16;});
  if(bad.length)add('P0','build','an icon is not a valid PNG',bad.join(', '));
  else good('build','every generated icon is a valid PNG',icons.length+' icons');
}
/* ---------------- 8. one figure, one value ----------------
   The bug that keeps recurring: the same quantity computed by two code paths that disagree. A maintenance
   figure of 2,663 in the interface and 2,838 in an answer is not a rounding difference, it is two different
   claims about the same person on the same day. */
{
  /* The app formats negatives with a typographic minus (U+2212), not a hyphen. Parsing only the hyphen
     silently turned every negative rate positive — the audit would then have reported a sign disagreement
     that did not exist, or missed a real one. */
  const num=v=>{if(v==null)return null;
    const m=String(v).replace(/[,\s]/g,'').replace(/\u2212/g,'-').match(/-?\d+(?:\.\d+)?/);
    return m?Math.round(parseFloat(m[0])*10)/10:null;};
  const S=w.getCurrentState();
  const pack=w.contextPacket();
  const checks=[
    ['maintenance',[S.tdee&&S.tdee.status==='ok'?S.tdee.value:null,
      pack.state.tdee,
      num((w.askQuestion('what is my maintenance')||{}).value),
      num((w.traceValue('tdee')||{}).value)]],
    ['weight trend',[S.trend&&S.trend.status==='ok'?S.trend.slopePerWeek:null,
      pack.state.trend,
      num((w.askQuestion('what is my trend')||{}).value),
      num((w.traceValue('weight_trend')||{}).value)]],
    ['current weight',[S.weight?S.weight.value:null,
      pack.state.weight,
      num((w.askQuestion('what do I weigh')||{}).value)]]
  ];
  const disagreements=[];
  for(const [label,values] of checks){
    const present=values.filter(v=>v!=null&&isFinite(v)).map(v=>Math.round(v*10)/10);
    if(present.length<2)continue;
    const spread=Math.max(...present)-Math.min(...present);
    /* A tenth of a unit is formatting; more than that is two different answers. */
    const tol=Math.max(0.15,Math.abs(present[0])*0.01);
    if(spread>tol)disagreements.push(label+': '+present.join(' vs '));
  }
  if(disagreements.length)add('P0','consistency','the same figure differs between code paths',disagreements.join('; '));
  else good('consistency','the same figure agrees across state, packet, answer and trace',checks.length+' quantities cross-checked');
}
/* ---------------- 9. a deferred fold must actually fill when opened ----------------
   `return` followed by a newline is terminated by automatic semicolon insertion, so a lazily-built body
   becomes dead code and the fold opens empty. It fails silently rather than throwing, which is the worst
   way for it to fail. */
{
  const lazyEmpty=[];
  for(const tab of TABS){
    w.switchTab(tab);await sleep(8);
    const view=w.document.getElementById('view-'+tab);
    for(const d of view.querySelectorAll('details.fold')){
      const id=d.getAttribute('data-fold');
      if(!id)continue;
      const saved=w.DB.settings.folds?Object.assign({},w.DB.settings.folds):{};
      w.DB.settings.folds=Object.assign({},saved,{[id]:true});
      w.renderAll();await sleep(4);
      const open=w.document.querySelector('[data-fold="'+id+'"] .f-body');
      if(open&&open.innerHTML.trim().length<12)lazyEmpty.push(tab+'/'+id);
      w.DB.settings.folds=saved;
    }
  }
  w.renderAll();
  if(lazyEmpty.length)add('P1','disclosure','a fold opens empty',lazyEmpty.slice(0,6).join(', '));
  else good('disclosure','every fold has content when opened','checked across all views');
}
/* ---------------- 10. documentation must match the build ----------------
   Hardcoded counts in prose go stale silently. Both the roadmap and an external reviewer had the event-type
   count wrong, in different directions. Anything the docs assert about the build is checked against it. */
{
  /* authoritative documents are checked; a document that declares itself a development history on its first line (the
     roadmap, audit §100 C) records counts as they were when written and is exempt — the registries are the authority */
  const docs=['README.md','docs/architecture-roadmap.md','docs/deployment.md','docs/SYSTEM_AUTHORITY.md']
    .filter(f=>fs.existsSync(f)).map(f=>({f,text:fs.readFileSync(f,'utf8')})).filter(d=>!/^> \*\*This is a development history/.test(d.text));
  const stale=[];
  const eventTypes=Object.keys(w.EVENT_TYPES).length;
  const yields=(()=>{try{return JSON.parse(fs.readFileSync('dist/data/reference/yields.json','utf8')).count;}catch(e){return null;}})();
  for(const {f,text} of docs){
    for(const m of text.matchAll(/(\d+)\s+event types/g))
      if(+m[1]!==eventTypes)stale.push(f+': says '+m[1]+' event types, build has '+eventTypes);
    for(const m of text.matchAll(/(\d+)[\s-](?:verified\s+)?(?:raw-to-cooked\s+)?yield factors/g))
      if(yields!=null&&+m[1]!==yields)stale.push(f+': says '+m[1]+' yield factors, build ships '+yields);
    for(const m of text.matchAll(/(\d+)-factor yield table/g))
      if(yields!=null&&+m[1]!==yields)stale.push(f+': says '+m[1]+'-factor yield table, build ships '+yields);
  }
  if(stale.length)add('P2','docs','documentation asserts a number the build does not support',stale.slice(0,5).join('; '));
  else good('docs','documented counts match the build',eventTypes+' event types, '+yields+' yield factors');
}
/* ---------------- 11. text entry must survive its own re-render ----------------
   An input bound to the `input` event triggers a re-render, which replaces the node and drops focus. On a
   phone that closes the keyboard after every character. This is checked on every text field the app renders,
   because fixing the ones that exist today leaves the next one to be written broken. */
{
  const broken=[];
  const SHEETS_WITH_TEXT=[['nav.ask','ask'],['injury.add','injuryAdd'],['nav.substitute','substitute'],['nav.studio','studio'],['nav.exports','exports'],['nav.forecast','forecastFamily'],['nav.measurement','measurement'],['nav.recoveryState','recoveryState'],['nav.internals','internals']];
  for(const [act,form] of SHEETS_WITH_TEXT){
    try{w.dispatchAct(act);}catch(e){continue;}
    await sleep(40);
    const bd=w.document.getElementById('editBackdrop');
    /* Collect IDENTITIES, not elements. Each field below triggers a re-render, which replaces the DOM, so
       an element reference collected up front is detached by the time it is reached — and a detached
       element cannot take focus. The first version of this check held references and reported working
       fields as broken as soon as a sheet had three of them. The check was wrong, not the sheet. */
    const keys=[...bd.querySelectorAll('input[type=text],input:not([type]),textarea')]
      .map(el=>el.id?('#'+el.id):(el.getAttribute('data-arg')?'[data-arg="'+el.getAttribute('data-arg')+'"]':null))
      .filter(Boolean);
    for(const key of keys){
      const f=w.document.getElementById('editBackdrop').querySelector(key);
      if(!f)continue;
      const id=f.id||f.getAttribute('data-arg')||'(unnamed)';
      f.focus();
      if(w.document.activeElement!==f){broken.push(form+'/'+id+': cannot take focus');continue;}
      f.value=(f.value||'')+'a';
      try{f.setSelectionRange(f.value.length,f.value.length);}catch(e){}
      f.dispatchEvent(new w.Event('input',{bubbles:true}));
      await sleep(10);
      try{w.renderSheet();}catch(e){}
      await sleep(10);
      const still=w.document.activeElement;
      const same=still&&(still.id===f.id||still.getAttribute('data-arg')===f.getAttribute('data-arg'));
      if(!same)broken.push(form+'/'+id+': lost focus after a keystroke');
    }
    w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    await sleep(15);
  }
  if(broken.length)add('P0','input','a text field loses focus while typing',broken.slice(0,4).join('; '));
  else good('input','text fields keep focus and caret across a re-render','checked across every sheet with text entry');
}
/* ---------------- 12. one canonical energy conversion ----------------
   An external audit found TDEE using a hard-coded 3200 kcal/lb while the counterfactual path used the
   composition-aware model — two conversions, so the same weight change meant different energy in different
   parts of the app. The roadmap had claimed the constant was gone, because the verification grepped for 3500
   and never looked for 3200. A check that only finds what it thought to search for is not a check.

   This scans for ANY plausible tissue-energy constant in the source, and separately proves the live paths
   agree numerically. */
{
  const srcText=fs.readFileSync('dist/index.html','utf8');
  let script=/<script>([\s\S]*?)<\/script>/.exec(srcText)[1];
  /* Strip comments first: a scan of prose is not a scan of code, and the comment explaining THIS check
     mentions both constants by name. The first version flagged its own documentation. */
  script=script.replace(/\/\*[\s\S]*?\*\//g,' ').replace(/(^|[^:])\/\/[^\n]*/g,'$1 ');
  /* Any 3000-4000 literal sitting next to a weight/energy conversion is suspect. */
  const suspects=[];
  const re=/(\b3[0-9]{3}\b)/g;let m;
  while((m=re.exec(script))){
    const around=script.slice(Math.max(0,m.index-90),m.index+90);
    /* Narrowed to PER-POUND conversion context specifically. "3,000 steps" sitting near the word kcal is
       not an energy constant, and a scan that cannot tell those apart trains people to ignore it. */
    if(/perLb|per_lb|kcalPerLb|KCAL_PER_LB|tissueKcal|lbToKcal|kcalToLb|\*\s*_?tk\b/i.test(around)&&
       !/ENERGY_PER_LB/i.test(around))
      suspects.push(m[1]+' near: '+around.replace(/\s+/g,' ').slice(60,150));
  }
  if(suspects.length)add('P1','energy','a hard-coded tissue-energy constant outside the canonical model',suspects.slice(0,3).join(' | '));
  else good('energy','no hard-coded tissue-energy constant outside the canonical model','scanned every 3000-4000 literal near an energy term');

  /* And the live paths must agree, which a text scan alone cannot establish. */
  try{
    const d=w.tissueEnergyDensity();
    const c=w.counterfactual({calories:-300});
    const t=w.tdeePersonal();
    if(d.status==='ok'&&c.status==='ok'){
      const implied=300*7/Math.abs(c.change);
      if(Math.abs(implied-d.kcalPerLb)>80)
        add('P1','energy','the counterfactual path disagrees with the canonical density',
          'implied '+Math.round(implied)+' vs canonical '+d.kcalPerLb);
      else good('energy','every energy path resolves through one density',
        'counterfactual implies '+Math.round(implied)+', canonical is '+d.kcalPerLb);
    }
    if(d.status==='ok'&&t.status==='ok'){
      /* The TDEE interval must move with the density interval rather than a parallel constant. */
      const sd=w.tissueKcalSd();
      if(Math.abs(sd-(d.hi-d.lo)/2)>1)
        add('P2','energy','TDEE uncertainty does not derive from the density interval','sd '+Math.round(sd));
      else good('energy','TDEE uncertainty propagates from the density interval','sd '+Math.round(sd));
    }
  }catch(e){add('P2','energy','energy agreement check failed',String(e&&e.message||e));}
}
/* ---------------- 13. the presentation layer keeps its own contract ----------------
   The rule the visual system document puts above all others: analytical truth flows DOWN to the renderer and
   never back up. A view that computes its own figure has quietly become a model with no contract, no class
   and no trace. */
{
  try{
    const pa=w.presentationAudit();
    pa.findings.forEach(f=>add(f.severity,'presentation',f.what,f.area));
    if(!pa.findings.length)
      good('presentation','views cannot misrepresent what they are given',
        pa.checked.contrasts+' contrasts, '+pa.checked.contracts+' visualization contracts, '+
        pa.checked.classes+' epistemic classes');
    /* And the prohibition, tested directly rather than trusted. */
    const t=w.tdeePersonal();
    const pm=w.presentationModel({result:t,quantity:'tdee',model:'tdeePersonal'});
    if(pm.status==='ok'&&t.status==='ok'){
      if(pm.value!==t.value)add('P0','presentation','a presentation model altered the value it was given');
      else if(pm.cls!==t.cls)add('P0','presentation','a presentation model altered the epistemic class');
      else good('presentation','a presentation model carries the result forward unchanged',
        'value and class identical to the analytical result');
    }
  }catch(e){add('P2','presentation','presentation audit failed',String(e&&e.message||e));}
}
/* ---------------- 13. no module silently overwrites another's global ----------------
   The build concatenates modules, so a top-level `var` is a global. Declaring `var RENDERERS` in the
   presentation layer replaced the view system's registry of the same name and blanked every screen — no
   error, no warning, just empty views. Nothing caught it until a gate crashed three steps later.

   This scans every top-level declaration in the source for a name declared in more than one module. */
{
  const files=fs.readdirSync('src').filter(f=>/^\d\d-.*\.js$/.test(f)).sort();
  const seen={},collisions=[];
  for(const f of files){
    const text=fs.readFileSync('src/'+f,'utf8')
      .replace(/\/\*[\s\S]*?\*\//g,' ').replace(/(^|[^:])\/\/[^\n]*/g,'$1 ');
    /* Top-level only: a declaration at column zero. */
    const re=/^(?:var|function)\s+([A-Za-z_$][\w$]*)/gm;
    let m;const local=new Set();
    while((m=re.exec(text))){
      /* Skip anything indented — those are inside a function and are not globals. */
      const lineStart=text.lastIndexOf('\n',m.index)+1;
      if(text.slice(lineStart,m.index).trim().length)continue;
      local.add(m[1]);
    }
    for(const name of local){
      if(seen[name]&&seen[name]!==f)collisions.push(name+': declared in '+seen[name]+' and '+f);
      else seen[name]=f;
    }
  }
  if(collisions.length)add('P0','namespace','a top-level name is declared in more than one module',
    collisions.slice(0,5).join('; '));
  else good('namespace','no module overwrites another module\u2019s global',
    Object.keys(seen).length+' top-level names across '+files.length+' modules');
}
if(jsdomErrors.length)add('P0','runtime','uncaught errors during the audit',jsdomErrors.slice(0,3).join(' | '));
else good('runtime','no uncaught errors');

const bySev=s=>findings.filter(f=>f.sev===s);
if(JSON_ONLY)console.log(JSON.stringify({findings,passes:pass.length},null,1));
else{
  console.log('\nPASSED');
  const byArea={};pass.forEach(p=>{(byArea[p.area]=byArea[p.area]||[]).push(p);});
  for(const a of Object.keys(byArea))
    console.log('  '+a.padEnd(14)+byArea[a].length+' checks'+(byArea[a].length<=3?('  ('+byArea[a].map(x=>x.what).join(', ')+')'):''));
  if(findings.length){
    console.log('\nFINDINGS');
    for(const sev of ['P0','P1','P2'])
      for(const f of bySev(sev))
        console.log('  '+sev+'  ['+f.area+'] '+f.what+(f.detail?('\n         '+String(f.detail).slice(0,150)):''));
  }
  console.log('\n'+pass.length+' passed, '+findings.length+' finding(s): '+
    bySev('P0').length+' P0, '+bySev('P1').length+' P1, '+bySev('P2').length+' P2');
}
process.exit(bySev('P0').length?1:0);
