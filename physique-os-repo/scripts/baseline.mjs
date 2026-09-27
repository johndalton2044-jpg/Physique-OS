#!/usr/bin/env node
/* STEP 1: MACHINE-READABLE IMPLEMENTATION BASELINE
 *
 * Generated from the running build, never written by hand. The direction is explicit that governance must
 * read the same registries the runtime uses; an inventory maintained separately is an inventory that
 * drifts. Every file below is overwritten on each run, so it cannot fall out of date without the build
 * noticing.
 *
 *   node scripts/baseline.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import {execSync} from 'node:child_process';
import {JSDOM,VirtualConsole} from 'jsdom';
import {findBrowser} from '../tests/_browser-path.mjs';

const OUT='docs/implementation';
fs.mkdirSync(OUT,{recursive:true});
const version=JSON.parse(fs.readFileSync('dist/version.json','utf8'));
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));

const vc=new VirtualConsole();
const dom=new JSDOM(fs.readFileSync('dist/index.html','utf8'),{url:'https://physique.local/app/index.html',
  runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,
  beforeParse(w){w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
    w.scrollTo=()=>{};w.fetch=undefined;w.HTMLElement.prototype.scrollIntoView=function(){};}});
await new Promise(r=>setTimeout(r,900));
const w=dom.window;w.loadDemo();

/* Which gates exist and whether their dependencies are installed \u2014 recorded, not assumed. */
const has=m=>{try{execSync(`node -e "require('${m}')"`,{stdio:'ignore'});return true;}catch(e){return false;}};
const gates=['engine','test','adversarial','audit','conformance','browser','yields:gate','cloud:e2e','verify']
  .map(g=>({gate:g,declared:!!pkg.scripts[g],inCheckChain:(pkg.scripts.check||'').includes('npm run '+g)}));

const baseline={
  generatedAt:new Date().toISOString(),
  sourceBuildId:version.build,
  releaseId:version.release,
  schemaVersion:version.schema,
  applicationVersion:version.version,
  versionVector:w.versionVector(),
  foodDatabase:{entries:version.food,fndds:version.fndds,dsld:version.dsld},
  sourceCount:version.sources?version.sources.length:null,
  gates,
  dependencies:{
    build:Object.keys(pkg.dependencies||{}),
    gates:Object.keys(pkg.devDependencies||{}),
    installed:Object.fromEntries(Object.keys(pkg.devDependencies||{}).map(m=>[m,has(m)])),
    browser:findBrowser()
  },
  registries:{
    quantities:Object.keys(w.QUANTITY_REGISTRY).length,
    quantitySingleSource:w.quantityRegistryAudit().singleSource,
    models:(w.MODELS||[]).length,
    actions:Object.keys(w.ACTIONS||{}).length,
    capabilities:Object.keys(w.CAPABILITIES).length
  },
  note:'Generated from the running build. Do not edit by hand \u2014 regenerate with node scripts/baseline.mjs.'
};
fs.writeFileSync(path.join(OUT,'baseline.json'),JSON.stringify(baseline,null,2)+'\n');

const cm=w.capabilityMatrix();
fs.writeFileSync(path.join(OUT,'capability-matrix.json'),JSON.stringify({
  generatedAt:baseline.generatedAt,buildId:version.build,
  statuses:w.CAPABILITY_STATUSES,
  capabilities:cm.rows.map(r=>({id:r.id,name:r.id,domain:r.domain,status:r.status,
    sourceFiles:null,registry:r.quantity?'QUANTITY_REGISTRY':null,model:r.sourceFunction,
    view:r.surface,maturity:r.maturity,evidence:r.evidence})),
  detections:cm.detections,
  note:cm.note
},null,2)+'\n');

const g=w.derivationGraph();
const edges=[];
Object.keys(g).forEach(src=>(g[src]||[]).forEach(t=>edges.push({sourceId:src,targetId:t,
  dependencyType:w.OBS_TYPES&&w.OBS_TYPES[src]?'data':'model'})));
fs.writeFileSync(path.join(OUT,'dependency-map.json'),JSON.stringify({
  generatedAt:baseline.generatedAt,buildId:version.build,
  nodes:Object.keys(g).length,edges:edges.length,
  contractDerived:w.contractDerivedEdges().nodes,
  dependencies:edges,
  note:'Built from the model contracts plus a declared fallback. Regenerated on every run.'
},null,2)+'\n');

const logPath=path.join(OUT,'implementation-log.md');
const entry=`\n## ${baseline.generatedAt} \u2014 build ${version.build}\n\n`+
  `- sources: ${baseline.sourceCount}, quantities: ${baseline.registries.quantities} (single source: ${baseline.registries.quantitySingleSource})\n`+
  `- capabilities: ${cm.capabilities} \u2014 `+Object.keys(cm.byStatus).map(s=>`${s} ${cm.byStatus[s].length}`).join(', ')+`\n`+
  `- production-ready: ${cm.detections.productionReady.length}; implemented but unsurfaced: ${cm.detections.implementedButUnsurfaced.join(', ')||'none'}\n`+
  `- dependency graph: ${Object.keys(g).length} nodes, ${edges.length} edges\n`;
const head=fs.existsSync(logPath)?fs.readFileSync(logPath,'utf8'):
  '# Implementation log\n\nAppended by `node scripts/baseline.mjs`. Each entry is generated from the running build.\n';
fs.writeFileSync(logPath,head+entry);

console.log(`baseline written: build ${version.build}, ${baseline.registries.quantities} quantities, `+
  `${cm.capabilities} capabilities (${cm.detections.productionReady.length} production-ready), `+
  `${Object.keys(g).length}-node dependency map`);
