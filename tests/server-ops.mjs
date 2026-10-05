/* SERVER PRODUCTION LAYER (audit S-001, S-003, S-004, S-006, S-009, S-010, S-011, S-012). Backups go to a local mock S3
   that checks what a real bucket would reject: an Authorization header in Signature V4 form, and a declared payload
   hash equal to the hash of the body sent. Signature V4 itself is checked against AWS's published test vector. */
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';import crypto from 'node:crypto';
let failed=0;const line=(ok,msg,d)=>{if(!ok)failed++;console.log('  '+(ok?'pass':'FAIL')+'  '+msg+(d&&!ok?'  \u2014 '+d:''));};
const data=fs.mkdtempSync(path.join(os.homedir(),'pos-ops-'));   /* outside the temp folder, as production requires */
Object.assign(process.env,{PHYSIQUE_SERVER_TEST:'1',DATA_DIR:data});
const S=await import('../server/server.mjs?ops'+Date.now());

/* 1. Signature V4 against AWS's published vector (aws-sig-v4-test-suite, get-vanilla) */
const v=S.sigv4({method:'GET',path:'/',query:{},headers:{Host:'example.amazonaws.com','X-Amz-Date':'20150830T123600Z'},
  payloadHash:'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',region:'us-east-1',service:'service',
  accessKey:'AKIDEXAMPLE',secretKey:'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',amzDate:'20150830T123600Z'});
line(v.authorization==='AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
  'Signature V4 matches AWS\u2019s published test vector (get-vanilla)',v.authorization);

/* 2. production preflight */
const bad=S.productionPreflight({ADMIN_TOKEN:'short'});
line(bad.some(x=>/not declared persistent/.test(x))&&bad.some(x=>/no off-host backups/.test(x))&&bad.some(x=>/ADMIN_TOKEN is shorter/.test(x)),'production refuses undeclared storage, no off-host backups and a short admin token',bad.join(' | '));
const good=S.productionPreflight({PHYSIQUE_PERSISTENT_DATA:'1',BACKUP_S3_ENDPOINT:'http://x',BACKUP_S3_BUCKET:'b',BACKUP_S3_ACCESS_KEY:'a',BACKUP_S3_SECRET_KEY:'s',ADMIN_TOKEN:'x'.repeat(40)});
line(good.length===0,'production accepts declared persistent storage with off-host backups and long tokens',good.join(' | '));

/* 3. request tracing */
const srv=S.server.listen(0);await new Promise(r=>srv.on('listening',r));const base='http://127.0.0.1:'+srv.address().port;
const r1=await fetch(base+'/v1/health',{headers:{'x-request-id':'trace-abc-123'}}),r2=await fetch(base+'/v1/health',{headers:{'x-request-id':'bad id!'}});
line(r1.headers.get('x-request-id')==='trace-abc-123'&&/^[A-Za-z0-9_-]{8,}$/.test(r2.headers.get('x-request-id')||'')&&r2.headers.get('x-request-id')!=='bad id!','a request id is echoed, and an unsafe one replaced');
const h0=await r1.json();line(h0.status==='ok'||h0.status==='degraded','health reports a status',JSON.stringify(h0.status));

/* 4. a mock S3 that checks signatures' form and payload hashes */
const store=new Map(),seen=[];
const s3=http.createServer((req,res)=>{const chunks=[];req.on('data',c=>chunks.push(c));req.on('end',()=>{const body=Buffer.concat(chunks),u=new URL(req.url,'http://x');
  const auth=req.headers.authorization||'',hash=req.headers['x-amz-content-sha256'];seen.push(req.method+' '+u.pathname);
  if(!/^AWS4-HMAC-SHA256 Credential=AK\/\d{8}\/eu-west-1\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/.test(auth)){res.writeHead(403);return res.end('bad signature form');}
  if(hash!==crypto.createHash('sha256').update(body).digest('hex')){res.writeHead(400);return res.end('payload hash mismatch');}
  const key=decodeURIComponent(u.pathname.replace(/^\/bkt\/?/,''));
  if(req.method==='PUT'){store.set(key,body);res.writeHead(200);return res.end();}
  if(req.method==='GET'&&!key){const keys=[...store.keys()].filter(k=>k.startsWith(u.searchParams.get('prefix')||'')).sort();res.writeHead(200,{'content-type':'application/xml'});return res.end('<ListBucketResult>'+keys.map(k=>'<Contents><Key>'+k+'</Key></Contents>').join('')+'</ListBucketResult>');}
  if(req.method==='GET'){if(!store.has(key)){res.writeHead(404);return res.end();}res.writeHead(200);return res.end(store.get(key));}
  if(req.method==='DELETE'){store.delete(key);res.writeHead(204);return res.end();}res.writeHead(405);res.end();});});
s3.listen(0);await new Promise(r=>s3.on('listening',r));
const cfg={BACKUP_S3_ENDPOINT:'http://127.0.0.1:'+s3.address().port,BACKUP_S3_BUCKET:'bkt',BACKUP_S3_REGION:'eu-west-1',BACKUP_S3_ACCESS_KEY:'AK',BACKUP_S3_SECRET_KEY:'SK',BACKUP_KEEP:'2'};
fs.mkdirSync(path.join(data,'vaults','v1'),{recursive:true});fs.writeFileSync(path.join(data,'vaults','v1','meta.json'),JSON.stringify({id:'v1',eventCount:3}));
const b1=await S.runBackup(cfg);
line(b1.status==='ok'&&store.has(b1.key)&&S.METRICS.backup.verified===true,'a backup is stored off-host, read back and verified',JSON.stringify(b1).slice(0,200));
line(fs.existsSync(path.join(data,'last-backup.json'))&&JSON.parse(fs.readFileSync(path.join(data,'last-backup.json'),'utf8')).sha256===b1.sha256,'the verified backup is recorded with its checksum');
await new Promise(r=>setTimeout(r,15));await S.runBackup(cfg);await new Promise(r=>setTimeout(r,15));const b3=await S.runBackup(cfg);
line([...store.keys()].filter(k=>k.startsWith('backups/')).length===2&&!store.has(b1.key),'retention keeps the newest two and deletes the oldest',[...store.keys()].join(', '));
line(S.healthStatus(cfg).reasons.every(r=>!/backup/.test(r)),'health has no backup complaint after a verified backup',S.healthStatus(cfg).reasons.join(' | '));
const bf=await S.runBackup(Object.assign({},cfg,{BACKUP_S3_SECRET_KEY:'SK',BACKUP_S3_ENDPOINT:'http://127.0.0.1:1'}));
line(bf.status==='failed'&&S.healthStatus(cfg).status==='degraded'&&S.healthStatus(cfg).reasons.some(r=>/last backup failed/.test(r)),'a failed backup makes health say degraded, with the reason',S.healthStatus(cfg).reasons.join(' | '));

/* 5. restore: refuses a folder with data in it; restores into an empty one, identical */
let refused=false;try{await S.restoreFromS3('latest',cfg);}catch(e){refused=/not empty/.test(e.message);}
line(refused,'restore refuses to overwrite a data folder that holds data');
const before=fs.readFileSync(path.join(data,'vaults','v1','meta.json'),'utf8');for(const n of fs.readdirSync(data))fs.rmSync(path.join(data,n),{recursive:true,force:true});
const rr=await S.restoreFromS3('latest',cfg);
line(rr.status==='ok'&&rr.key===b3.key&&fs.readFileSync(path.join(data,'vaults','v1','meta.json'),'utf8')===before,'restoring the latest backup into an empty folder reproduces the data',JSON.stringify(rr).slice(0,160));
line(seen.every(x=>/^(PUT|GET|DELETE) \/bkt/.test(x)),'every request went to the bucket, signed');
srv.close();s3.close();fs.rmSync(data,{recursive:true,force:true});
console.log(failed?failed+' failed':'all passed');process.exit(failed?1:0);
