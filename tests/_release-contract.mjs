/* THE RELEASE CONTRACT (catalogue W-001, W-002), checked by the deploy gate before it builds its stacks:
   - the runtime promised in package.json (engines.node) is no wider than what every locked dependency accepts, computed
     from package-lock.json, so a person on a promised Node gets a complete install;
   - .nvmrc names one exact Node inside that promise, CI installs it, and the gate itself runs on a promised Node;
   - the CI workflow is at the repository root, where GitHub runs it, and runs every release gate (the list in
     tests/gates.mjs), the release check, and keeps the release evidence.
   Version ranges are evaluated here (^, ~, >=, >, <, <=, bare and partial versions, || and space-joined comparators),
   so the check needs no dependency of its own. */
import fs from 'node:fs';
import {GATES} from './gates.mjs';

const V=s=>{const m=String(s).trim().replace(/^v/,'').match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);return m?[+m[1],+(m[2]||0),+(m[3]||0)]:null;};
const cmp=(a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2];
/* one comparator as the interval [lo, hi) it allows; hi null is unbounded */
function comparator(c){
  let m;
  if((m=c.match(/^\^(.+)$/))){const v=V(m[1]);return [v,v[0]>0?[v[0]+1,0,0]:(v[1]>0?[0,v[1]+1,0]:[0,0,v[2]+1])];}
  if((m=c.match(/^~(.+)$/))){const v=V(m[1]);return [v,[v[0],v[1]+1,0]];}
  if((m=c.match(/^>=(.+)$/)))return [V(m[1]),null];
  if((m=c.match(/^>(.+)$/))){const v=V(m[1]);return [[v[0],v[1],v[2]+1],null];}
  if((m=c.match(/^<=(.+)$/))){const v=V(m[1]);return [[0,0,0],[v[0],v[1],v[2]+1]];}
  if((m=c.match(/^<(.+)$/)))return [[0,0,0],V(m[1])];
  const parts=c.replace(/^v/,'').split('.').filter(x=>/^\d+$/.test(x)).length,v=V(c);
  return [v,parts===1?[v[0]+1,0,0]:parts===2?[v[0],v[1]+1,0]:[v[0],v[1],v[2]+1]];
}
export function intervals(range){
  return String(range).split('||').map(alt=>{let lo=[0,0,0],hi=null;
    alt.trim().split(/\s+/).filter(Boolean).forEach(c=>{const [l,h]=comparator(c);if(cmp(l,lo)>0)lo=l;if(h&&(!hi||cmp(h,hi)<0))hi=h;});
    return [lo,hi];}).filter(([lo,hi])=>!hi||cmp(lo,hi)<0);
}
export const satisfies=(v,range)=>{const x=typeof v==='string'?V(v):v;return intervals(range).some(([lo,hi])=>cmp(x,lo)>=0&&(!hi||cmp(x,hi)<0));};
/* is every version `inner` allows also allowed by `outer`? Membership of `outer` changes only at its own boundaries,
   so checking the start of each interval of `inner` and every boundary of `outer` inside it decides it. */
export function subset(inner,outer){
  const bounds=intervals(outer).flatMap(([lo,hi])=>hi?[lo,hi]:[lo]);
  return intervals(inner).every(([lo,hi])=>[lo].concat(bounds.filter(b=>cmp(b,lo)>=0&&(!hi||cmp(b,hi)<0))).every(p=>satisfies(p,outer)));
}

export function releaseContract(line){
  const pkg=JSON.parse(fs.readFileSync('package.json','utf8')),lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
  const promised=pkg.engines&&pkg.engines.node;
  line(!!promised,'package.json promises a Node range (engines.node)',String(promised));
  if(promised){
    const narrower=Object.entries(lock.packages||{}).filter(([k,v])=>k&&v.engines&&typeof v.engines==='object'&&v.engines.node&&!subset(promised,v.engines.node))
      .map(([k,v])=>k.replace(/^.*node_modules\//,'')+' needs '+v.engines.node);
    line(!narrower.length,'every Node that package.json promises is one every locked dependency accepts',narrower.slice(0,4).join('; '));
  }
  const nvm=fs.existsSync('.nvmrc')?fs.readFileSync('.nvmrc','utf8').trim():'';
  line(/^\d+\.\d+\.\d+$/.test(nvm)&&!!promised&&satisfies(nvm,promised),'.nvmrc names one exact Node inside that promise',nvm||'no .nvmrc');
  line(!!promised&&satisfies(process.version,promised),'this gate runs on a promised Node (use the one in .nvmrc)',process.version+' is outside '+promised);
  const ci='.github/workflows/ci.yml',y=fs.existsSync(ci)?fs.readFileSync(ci,'utf8'):'';
  line(!!y,'the CI workflow is at the repository root, where GitHub runs it',ci+' is missing');
  line(!fs.existsSync('data/.github'),'no misplaced workflow copy is left where GitHub ignores it','data/.github exists');
  line(/node-version-file:\s*\.nvmrc/.test(y)&&/\bnpm ci\b/.test(y),'CI installs the Node in .nvmrc and the dependencies from the lock');
  line(/node tests\/gate-record\.mjs --all/.test(y)&&/node tests\/release\.mjs --from-results/.test(y),'CI runs every release gate and then the release check');
  line(/upload-artifact[\s\S]*docs\/release/.test(y),'CI keeps the release evidence');
  /* `npx playwright install` runs the latest playwright CLI, which installs its own browser build, not the one the locked
     playwright-core drives: CI measured the page in a different browser from the one the lock pins */
  line(/npx playwright-core install/.test(y)&&!/npx playwright install/.test(y),'CI installs the browser build the locked playwright-core drives');
  const rel=fs.readFileSync('tests/release.mjs','utf8');
  line(/from '\.\/gates\.mjs'/.test(rel)&&!/const GATES=\[/.test(rel),'the release check reads the gate list CI and the recorder read (tests/gates.mjs)');
  const missing=GATES.filter(g=>!(pkg.scripts&&pkg.scripts[g]));
  line(!missing.length,'every release gate is a script the recorder can run',missing.join(', '));
}
