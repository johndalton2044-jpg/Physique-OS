#!/usr/bin/env node
/* A static server for dist/, with the headers a real deployment should set.
 * Exists because the app needs an ORIGIN: opened as a file it has no food database, no service worker and no
 * persistent storage, and that looks like a broken app rather than a missing web server.
 *   npm run serve            → http://127.0.0.1:8123
 */
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';

const PORT=+(process.argv.find((a,i)=>process.argv[i-1]==='--port')||8123);
const ROOT=path.resolve(process.argv.find((a,i)=>process.argv[i-1]==='--root')||'dist');
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json',
  '.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8'};

if(!fs.existsSync(path.join(ROOT,'index.html'))){
  console.error('no index.html in '+ROOT+' — run `npm run build` first');process.exit(1);
}
http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split('?')[0]);
  if(p==='/')p='/index.html';
  /* Never serve outside the root, whatever the request says. */
  const file=path.join(ROOT,path.normalize(p).replace(/^(\.\.[/\\])+/,''));
  if(!file.startsWith(ROOT)){res.writeHead(403).end('forbidden');return;}
  fs.readFile(file,(err,body)=>{
    if(err){res.writeHead(404,{'content-type':'text/plain'}).end('not found: '+p+
      '\n\nThis is a static site, not an SPA router — /data/ must return real files.');return;}
    const ext=path.extname(file).toLowerCase();
    const headers={'content-type':TYPES[ext]||'application/octet-stream'};
    /* Data shards are keyed to the release, so they cache hard; the shell must not, or an update never lands. */
    if(p.startsWith('/data/'))headers['cache-control']='public, max-age=31536000, immutable';
    else if(p==='/index.html'||p==='/sw.js')headers['cache-control']='no-cache';
    res.writeHead(200,headers).end(body);
  });
}).listen(PORT,'127.0.0.1',()=>{
  console.log('Physique OS at http://127.0.0.1:'+PORT);
  console.log('  localhost counts as a secure context, so the service worker, offline mode and encryption all work.');
  console.log('  Serving '+ROOT);
});
