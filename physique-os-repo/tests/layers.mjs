/* LAYER DEPENDENCIES (audit EC-005). Every source file has a declared layer (docs/layers.json: ui, test, boot; anything
   else is engine). Builds the module graph (which file calls functions defined in which) into docs/module-graph.json,
   and fails on an engine \u2192 ui/test call that is not typeof-guarded and not in the reviewed baseline
   (docs/layer-baseline.json, each entry with its reason). The baseline is a ratchet: it may only shrink, and an entry
   that no longer occurs must be removed. */
import fs from 'node:fs';
const L=JSON.parse(fs.readFileSync('docs/layers.json','utf8')),layerOf=f=>L.ui.includes(f)?'ui':L.test.includes(f)?'test':L.boot.includes(f)?'boot':'engine';
const files=fs.readdirSync('src').filter(f=>f.endsWith('.js')).sort(),def={};for(const f of files)for(const m of fs.readFileSync('src/'+f,'utf8').matchAll(/^function ([\w$]+)\(/gm))def[m[1]]=f;
const unknown=Object.values(L).flat().filter(x=>typeof x==='string'&&x.endsWith('.js')&&!files.includes(x));
const graph={},viol=[];
/* comments are not calls: strip them before scanning (a comment naming runSelfTest() counted as a dependency) */
const code=t=>t.replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:'"\\])\/\/[^\n]*/g,'$1');
for(const f of files){const src=code(fs.readFileSync('src/'+f,'utf8'));graph[f]={layer:layerOf(f),calls:{}};
  for(const [n,df] of Object.entries(def)){if(df===f)continue;const e=n.replace(/\$/g,'\\$');if(!new RegExp('(^|[^\\w$.])'+e+'\\(','m').test(src))continue;(graph[f].calls[df]=graph[f].calls[df]||[]).push(n);
    if(layerOf(f)==='engine'&&layerOf(df)!=='engine'&&!new RegExp('typeof '+e+'\\s*===?\\s*[\'"]function').test(src))viol.push(f+' -> '+df+' '+n);}}
fs.writeFileSync('docs/module-graph.json',JSON.stringify(graph,null,1));
const base=fs.existsSync('docs/layer-baseline.json')?JSON.parse(fs.readFileSync('docs/layer-baseline.json','utf8')):{entries:{}};
if(process.argv.includes('--write-baseline')){const e={};viol.forEach(v=>{e[v]=(base.entries[v])||'REVIEW';});fs.writeFileSync('docs/layer-baseline.json',JSON.stringify({note:'engine -> ui/test calls accepted for now, each with its reason; may only shrink',entries:e},null,1));console.log('baseline written: '+viol.length);process.exit(0);}
const fresh=viol.filter(v=>!base.entries[v]),stale=Object.keys(base.entries).filter(v=>viol.indexOf(v)<0),unreasoned=Object.entries(base.entries).filter(([k,r])=>!r||r==='REVIEW').map(([k])=>k);
let failed=0;const line=(ok,m,d)=>{if(!ok)failed++;console.log('  '+(ok?'pass':'FAIL')+'  '+m+(d&&d.length&&!ok?'\n          '+d.join('\n          '):''));};
console.log('  '+files.length+' files ('+files.filter(f=>layerOf(f)==='engine').length+' engine, '+L.ui.length+' ui); engine \u2192 ui/test calls: '+viol.length+' ('+Object.keys(base.entries).length+' in the reviewed baseline)');
line(!unknown.length,'every file named in the layer manifest exists',unknown);
line(!fresh.length,'no new engine \u2192 ui/test call',fresh);
line(!stale.length,'the baseline only lists calls that still happen (remove fixed ones)',stale);
line(!unreasoned.length,'every baselined call has a reason',unreasoned);
console.log(failed?failed+' failed':'all passed');process.exit(failed?1:0);
