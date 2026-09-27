/* Writes the /api/sync rewrite into vercel.json, pointing at your running Physique OS server, after checking the address
   (deployment repair plan §6, §8). The app then reaches the server on its own origin, so its connect-src 'self' holds.
     node scripts/configure-deploy.mjs --sync-origin https://sync.example.org
     node scripts/configure-deploy.mjs --check            (exits 1 unless a valid rewrite is present) */
import fs from 'node:fs';
const args=process.argv.slice(2),get=k=>{const i=args.indexOf(k);return i>=0?args[i+1]:null;};
const vj=JSON.parse(fs.readFileSync('vercel.json','utf8'));
function problem(u){let x;try{x=new URL(u);}catch(e){return 'not a URL';}
  if(x.protocol!=='https:')return 'it must be https';
  if(/^(localhost|127\.|0\.0\.0\.0|\[?::1\]?$)/.test(x.hostname))return 'localhost means Vercel itself there, not your server';
  if(/REPLACE|example\.(com|org)$/i.test(x.hostname))return 'it is still a placeholder';
  if(x.pathname!=='/'||x.search||x.hash)return 'give the origin only (no path, query or #)';return null;}
const cur=(vj.rewrites||[]).find(r=>String(r.source).startsWith('/api/sync'));
if(args.includes('--check')){const d=cur&&String(cur.destination).replace(/\/:path\*$/,'');const p=d?problem(d):'no /api/sync rewrite';
  console.log(p?('NOT READY: '+p):('ready: /api/sync → '+d));process.exit(p?1:0);}
const origin=get('--sync-origin');if(!origin){console.error('usage: node scripts/configure-deploy.mjs --sync-origin https://your-sync-server');process.exit(2);}
const p=problem(origin);if(p){console.error('refused: '+origin+' — '+p);process.exit(1);}
const o=new URL(origin).origin;vj.rewrites=(vj.rewrites||[]).filter(r=>!String(r.source).startsWith('/api/sync'));
vj.rewrites.unshift({source:'/api/sync/:path*',destination:o+'/:path*'});
vj.headers=vj.headers||[];if(!vj.headers.some(h=>h.source==='/api/(.*)'))vj.headers.unshift({source:'/api/(.*)',headers:[{key:'Cache-Control',value:'no-store'}]});
fs.writeFileSync('vercel.json',JSON.stringify(vj,null,2)+'\n');
console.log('vercel.json: /api/sync → '+o+'\nNext: commit vercel.json, set SYNC_DEPLOYMENT_MODE=reverse-proxy in Vercel, redeploy, then open '+'<your app>/api/sync/v1/health');
