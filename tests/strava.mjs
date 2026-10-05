/* STRAVA, end to end against a simulated Strava: OAuth (client secret, absolute expiry, athlete id), activities by page,
   per-second streams, two workouts on one day, sessions, the steady segment, webhooks (challenge, subscription check,
   delete, deauthorisation), duplicates of hand-logged workouts. */
import http from 'node:http';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import {JSDOM,VirtualConsole} from 'jsdom';
let failed=0;const line=(ok,msg,d)=>{if(!ok)failed++;console.log('  '+(ok?'pass':'FAIL')+'  '+msg+(d&&!ok?'  \u2014 '+d:''));};
setTimeout(()=>{console.log('  FAIL  the Strava test did not finish within 150 s');process.exit(1);},150000).unref();
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pos-strava-'));const DAY=new Date(Date.now()-2*86400000).toISOString().slice(0,10);
/* per-second streams: 5 minutes warming up, then 30 steady minutes at 3.0 m/s and 150 bpm */
const N=35*60,time=[],vel=[],hr=[],grade=[],moving=[];for(let i=0;i<N;i++){time.push(i);const warm=i<300;vel.push(warm?1.5+(i%7)*0.2:3+((i%5)-2)*0.03);hr.push(warm?100+i/10:150+((i%3)-1));grade.push(1);moving.push(true);}
const acts=[{id:111,name:'Morning run',sport_type:'Run',start_date:DAY+'T11:00:00Z',start_date_local:DAY+'T07:00:00Z',moving_time:N,elapsed_time:N+60,distance:5400+900*3,average_heartrate:143,max_heartrate:162,total_elevation_gain:40},
  {id:112,name:'Evening run',sport_type:'Run',start_date:DAY+'T22:00:00Z',start_date_local:DAY+'T18:00:00Z',moving_time:1500,elapsed_time:1600,distance:4600,average_heartrate:139},
  {id:113,name:'Upper body',sport_type:'WeightTraining',start_date:DAY+'T15:00:00Z',start_date_local:DAY+'T11:00:00Z',moving_time:3000,elapsed_time:3300}];
let tokens={},deauth=[];
const mock=http.createServer((q,r)=>{const u=new URL(q.url,'http://x');let body='';q.on('data',c=>body+=c);q.on('end',()=>{const f=Object.fromEntries(new URLSearchParams(body));const send=(c,j)=>{r.writeHead(c,{'content-type':'application/json','x-ratelimit-usage':'3,40'});r.end(JSON.stringify(j));};
  if(u.pathname==='/oauth/authorize')return send(200,{code:'sc-'+crypto.randomBytes(3).toString('hex'),state:u.searchParams.get('state')});
  if(u.pathname==='/oauth/token'){if(f.client_secret!=='ssecret')return send(401,{message:'Bad client secret'});const t='sa-'+crypto.randomBytes(5).toString('hex');tokens[t]=1;
    return send(200,{access_token:t,refresh_token:'sr-'+crypto.randomBytes(5).toString('hex'),expires_at:Math.floor(Date.now()/1000)+21600,athlete:{id:555}});}
  if(u.pathname==='/oauth/deauthorize'){deauth.push(f.access_token);return send(200,{});}
  if(!tokens[(q.headers.authorization||'').replace('Bearer ','')])return send(401,{message:'Authorization Error'});
  if(u.pathname==='/api/v3/athlete/activities')return send(200,u.searchParams.get('page')==='1'?acts:[]);
  const m=/\/api\/v3\/activities\/(\d+)\/streams/.exec(u.pathname);if(m)return send(200,m[1]==='111'?{time:{data:time},velocity_smooth:{data:vel},heartrate:{data:hr},grade_smooth:{data:grade},moving:{data:moving}}:{});
  send(404,{});});});
await new Promise(r=>mock.listen(0,'127.0.0.1',r));
Object.assign(process.env,{PORT:'0',HOST:'127.0.0.1',DATA_DIR:tmp,CONNECT_TOKEN_KEY:crypto.randomBytes(32).toString('hex'),STRAVA_CLIENT_ID:'scid',STRAVA_CLIENT_SECRET:'ssecret',
  STRAVA_VERIFY_TOKEN:'vtok',STRAVA_SUBSCRIPTION_ID:'77',PHYSIQUE_CONNECT_MOCK:'http://127.0.0.1:'+mock.address().port,PHYSIQUE_PUBLIC_URL:'https://app.example'});
const S=await import('../server/server.mjs?s'+Date.now());await new Promise(r=>setTimeout(r,300));
const base='http://127.0.0.1:'+S.server.address().port,VID='vault-strava-0001';S.tokens.set('T1',{vaultId:VID,deviceId:'d',exp:Date.now()+3600000});
const call=(m,p,b)=>fetch(base+p,{method:m,headers:{'content-type':'application/json',authorization:'Bearer T1'},body:b?JSON.stringify(b):undefined,redirect:'manual'});
const st=await (await call('POST','/v1/ext/connect/start',{provider:'strava'})).json();const au=new URL(st.authorizeUrl);
line(au.searchParams.get('scope')==='read,activity:read_all','Strava is asked for activities, including private ones');
const ap=await (await fetch(st.authorizeUrl)).json();const cb=await fetch(base+'/v1/ext/connect/callback?code='+ap.code+'&state='+ap.state,{redirect:'manual'});
line(cb.headers.get('location')==='/?connected=strava'&&S.readConns(VID).strava.userId==='555','sign-in completes and the athlete is recorded, for webhooks');
let sy=await (await call('POST','/v1/ext/connect/sync',{provider:'strava'})).json();
line(sy.status==='ok'&&sy.payload.activities.length===3&&!!sy.payload.activities.find(a=>a.id===111)._streams,'activities arrive with per-second streams for recent workouts',JSON.stringify({n:sy.payload&&sy.payload.activities.length,err:sy.error}));
/* the app */
const dom=new JSDOM(fs.readFileSync('dist/index.html','utf8'),{url:'https://physique.local/app/index.html',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:new VirtualConsole(),beforeParse(w){w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.scrollTo=()=>{};w.fetch=undefined;w.HTMLElement.prototype.scrollIntoView=function(){};}});
await new Promise(r=>setTimeout(r,900));const w=dom.window;w.dispatchAct('welcome.skip');
w.DB.observations.push(w.makeObservation({type:'cardio',date:DAY,value:36,source:'manual',method:'run'}));   /* 36 vs the 35-minute Strava run: within 20% */
let res=w.ingestConnectedPayload('strava',sy.payload,{retrievedAt:sy.retrievedAt});
const runs=()=>w.DB.observations.filter(o=>o.type==='cardio'&&o.meta&&o.meta.importSource==='strava'&&!o.retracted);
line(runs().length===2,'two runs on the same day are both kept (an activity is not a day total)',JSON.stringify(res));
line(res.sessions===1&&w.DB.sessions.some(s=>s.externalId==='strava:activity:113'&&s.name==='Upper body'),'weight training becomes a session, not cardio');
const a=runs().find(o=>o.meta.stravaId==='111');line(a&&a.method==='run'&&a.meta.hr===143&&a.meta.distance===8.1&&a.meta.distanceUnit==='km','each workout keeps its modality, heart rate and distance',JSON.stringify(a&&{m:a.method,hr:a.meta.hr,d:a.meta.distance}));
const sg=a&&a.meta.steady;line(sg&&sg.hr>=149&&sg.hr<=151&&Math.abs(sg.pace-5.56)<0.1&&sg.minutes>=9.9,'the steadiest 10 minutes are found in the streams (warm-up excluded)',JSON.stringify(sg));
const row=w.cardioSessions(7).rows.find(r=>r.externalId==='strava:activity:111');w.DB.settings.hrMax=190;for(let i=0;i<3;i++)w.DB.observations.push(w.makeObservation({type:'rhr',date:w.addDays(w.todayISO(),-i),value:55,source:'manual'}));w._memoInvalidate();
const fo=w.cardioFitnessObservation(w.cardioSessions(7).rows.find(r=>r.externalId==='strava:activity:111'));line(fo.use&&/steadiest 10 minutes/.test(fo.method),'the fitness estimate uses the steady stretch, not the whole-workout average',JSON.stringify(fo).slice(0,160));
line(res.possibleDuplicates===1&&w.possibleDuplicateWorkouts().length===1,'a hand-logged run of about the same length is flagged as a possible duplicate');
res=w.ingestConnectedPayload('strava',sy.payload,{});line(res.added===0&&runs().length===2,'syncing again adds nothing');
/* webhooks */
let wh=await fetch(base+'/v1/ext/webhook?provider=strava&hub.mode=subscribe&hub.challenge=abc&hub.verify_token=vtok');line(wh.status===200&&(await wh.json())['hub.challenge']==='abc','Strava\u2019s subscription handshake is answered');
wh=await fetch(base+'/v1/ext/webhook?provider=strava&hub.mode=subscribe&hub.challenge=abc&hub.verify_token=wrong');line(wh.status===403,'a wrong verify token is refused');
const post=b=>fetch(base+'/v1/ext/webhook?provider=strava',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});
wh=await post({object_type:'activity',object_id:111,aspect_type:'delete',owner_id:555,subscription_id:99});line(wh.status===401,'an event for another subscription is refused (Strava does not sign events)');
wh=await post({object_type:'activity',object_id:111,aspect_type:'delete',owner_id:555,subscription_id:77});line(wh.status===200&&(S.readConns(VID).strava.deleted||[]).includes('111'),'a deletion at Strava is queued for the app');
sy=await (await call('POST','/v1/ext/connect/sync',{provider:'strava'})).json();res=w.ingestConnectedPayload('strava',sy.payload,{});
line(res.retracted===1&&!runs().some(o=>o.meta.stravaId==='111')&&w.DB.observations.some(o=>o.meta&&o.meta.stravaId==='111'&&o.retracted),'the deleted activity is retracted here, and kept in the record as retracted');
wh=await post({object_type:'athlete',object_id:555,aspect_type:'update',updates:{authorized:'false'},owner_id:555,subscription_id:77});
line(wh.status===200&&!S.readConns(VID).strava,'deauthorising at Strava disconnects here too');
S.server.close();mock.close();fs.rmSync(tmp,{recursive:true,force:true});
console.log(failed?failed+' failed':'all passed');process.exit(failed?1:0);
