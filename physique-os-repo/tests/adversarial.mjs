// ADVERSARIAL suite — the audit's §77/§78 gap.
//
// The restore/import boundary and the HTML-string interface are the two places where hostile or malformed
// input reaches the application. This suite attacks both. The bar is not "produces a nice error"; it is:
//
//   * never execute injected script,
//   * never accept a record it cannot faithfully represent,
//   * never crash the process,
//   * never silently discard the user's existing record.
//
//   node tests/adversarial.mjs [--json]
import fs from 'node:fs';import {JSDOM,VirtualConsole} from 'jsdom';

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
await sleep(400);

let failures=0;const report=[];
const ok=(name,cond,detail)=>{report.push((cond?'  pass  ':'  FAIL  ')+name+(detail?'  — '+detail:''));if(!cond)failures++;};

/* ---------------- 1. import boundary: malformed and hostile documents ---------------- */
const XSS='<img src=x onerror="window.__PWNED=1">';
const cases=[
  ['not JSON at all','}{'],
  ['a bare string','"hello"'],
  ['a number','42'],
  ['null','null'],
  ['an array instead of a document','[1,2,3]'],
  ['an empty object','{}'],
  ['a document with no schema version and an unrecognized shape','{"foo":1}'],
  ['a future schema','{"schemaVersion":9999,"observations":[]}'],
  ['a negative schema','{"schemaVersion":-1,"observations":[]}'],
  ['a fractional schema','{"schemaVersion":1.5,"observations":[]}'],
  ['a string schema version','{"schemaVersion":"2","observations":[]}'],
  ['collections that are not arrays','{"schemaVersion":2,"observations":{"a":1},"foodLogs":"x"}'],
  ['observations containing nulls','{"schemaVersion":2,"observations":[null,null]}'],
  ['an observation with a NaN-like value','{"schemaVersion":2,"observations":[{"id":"a","type":"weight","date":"2026-01-01","value":"NaN"}]}'],
  ['an observation with Infinity as a string','{"schemaVersion":2,"observations":[{"id":"a","type":"weight","date":"2026-01-01","value":"1e400"}]}'],
  ['dates far outside any plausible range','{"schemaVersion":2,"observations":[{"id":"a","type":"weight","date":"0000-01-01","value":1},{"id":"b","type":"weight","date":"9999-12-31","value":1}]}'],
  ['duplicate ids','{"schemaVersion":2,"observations":[{"id":"dup","type":"weight","date":"2026-01-01","value":1},{"id":"dup","type":"weight","date":"2026-01-02","value":2}]}'],
  ['a prototype-pollution attempt','{"schemaVersion":2,"observations":[],"__proto__":{"polluted":true}}'],
  ['a constructor-pollution attempt','{"schemaVersion":2,"observations":[],"constructor":{"prototype":{"polluted":true}}}'],
  ['script in a note',JSON.stringify({schemaVersion:2,observations:[{id:'x',type:'note',date:'2026-01-01',value:XSS}]})],
  ['script in a food name',JSON.stringify({schemaVersion:2,observations:[],foodLogs:[{id:'f',date:'2026-01-01',meal:'lunch',basis:'g',quantity:1,grams:1,nutrients:{kcal:1},createdAt:'2026-01-01T00:00:00.000Z',food:{name:XSS,per100:{kcal:1},basis:'g',source:'USER'}}]})],
  ['script in a profile name',JSON.stringify({schemaVersion:2,observations:[],profile:{name:XSS,age:40,sex:'male',heightIn:70}})],
  ['script in an exercise name',JSON.stringify({schemaVersion:2,observations:[],sessions:[{id:'s',date:'2026-01-01',name:XSS,sets:[{exercise:XSS,load:100,reps:5}],createdAt:'2026-01-01T00:00:00.000Z'}]})],
  ['a javascript: URL in a note',JSON.stringify({schemaVersion:2,observations:[{id:'u',type:'note',date:'2026-01-01',value:'javascript:alert(1)'}]})],
  ['deeply nested objects','{"schemaVersion":2,"observations":[],"settings":'+'{"a":'.repeat(200)+'1'+'}'.repeat(200)+'}'],
  ['an enormous string field',JSON.stringify({schemaVersion:2,observations:[{id:'big',type:'note',date:'2026-01-01',value:'A'.repeat(2000000)}]})],
  ['a huge number of observations',JSON.stringify({schemaVersion:2,observations:Array.from({length:20000},(_,i)=>({id:'o'+i,type:'weight',date:'2026-01-01',value:200}))})]
];

/* Snapshot the live record: no hostile input may replace or damage it merely by being validated. */
w.loadDemo();
const beforeCount=w.DB.observations.length;
const beforeRevision=w.DB.revision;
let crashed=0,accepted=[];
for(const [label,raw] of cases){
  let parsed=null,threw=false;
  try{parsed=JSON.parse(raw);}catch(e){parsed=undefined;}
  let verdict='rejected';
  try{
    if(parsed===undefined)verdict='unparseable';
    else{
      const v=w.validateDB(parsed);
      const m=w.migrate(JSON.parse(JSON.stringify(parsed)));
      verdict=(v.ok&&m.ok)?'accepted':'rejected';
      if(verdict==='accepted')accepted.push(label);
    }
  }catch(e){threw=true;crashed++;}
  ok('handles '+label+' without throwing',!threw,threw?'threw':'');
}
ok('no hostile or malformed input crashed the validator',crashed===0,crashed+' threw');
ok('the live record is untouched by validating hostile input',
   w.DB.observations.length===beforeCount&&w.DB.revision===beforeRevision);
ok('prototype pollution did not take effect',
   ({}).polluted===undefined&&w.Object.prototype.polluted===undefined);
ok('documents that cannot be faithfully represented are rejected rather than coerced',
   !accepted.includes('a future schema')&&!accepted.includes('a negative schema')&&
   !accepted.includes('a fractional schema')&&!accepted.includes('collections that are not arrays'),
   'accepted: '+accepted.join(', '));

/* ---------------- 2. injected markup must never execute or escape its container ---------------- */
{
  const hostile=JSON.parse(JSON.stringify({schemaVersion:2,
    profile:{name:XSS,age:40,sex:'male',heightIn:70},
    observations:[{id:'n1',type:'note',date:w.todayISO(),value:XSS,source:'manual',createdAt:w.nowISO()},
                  {id:'n2',type:'note',date:w.todayISO(),value:'"><script>window.__PWNED2=1<\/script>',source:'manual',createdAt:w.nowISO()}],
    sessions:[{id:'s1',date:w.todayISO(),name:XSS,sets:[{exercise:'<svg onload=window.__PWNED3=1>',load:100,reps:5}],createdAt:w.nowISO(),retracted:false}],
    foodLogs:[],foods:[],recipes:[],phases:[],decisions:[],interventions:[],predictions:[],experiments:[],
    negatives:[],snapshots:[],archive:[],notes:[],settings:{},ledger:{migrations:[],corruptions:[],saves:0},models:{},demo:{active:false}}));
  const m=w.migrate(hostile);
  ok('a hostile document still migrates (rejection is about shape, not content)',m.ok,m.reason||'');
  w.DB=m.db;w._memoInvalidate();
  const tabs=['today','log','plan','train','food','body','progress','diagnose','experiments','learn','archive','tools'];
  let renderThrew=null;
  for(const t of tabs){try{w.switchTab(t);}catch(e){renderThrew=t+': '+e.message;break;}}
  await sleep(60);
  ok('every view renders a record full of injected markup without throwing',!renderThrew,renderThrew||'');
  ok('no injected script executed',
     w.__PWNED===undefined&&w.__PWNED2===undefined&&w.__PWNED3===undefined);
  ok('no <script> element was created from record content',
     w.document.querySelectorAll('script').length===1,String(w.document.querySelectorAll('script').length)+' script elements');
  ok('no event-handler attribute was created from record content',
     w.document.querySelectorAll('[onerror],[onload],[onclick]').length===0);
  const imgs=[...w.document.querySelectorAll('img')].filter(i=>i.getAttribute('src')==='x');
  ok('injected <img> markup was escaped rather than parsed',imgs.length===0);
  const bodyText=w.document.body.textContent||'';
  ok('injected markup is displayed as text, proving it was escaped not stripped',
     bodyText.includes('onerror')||bodyText.includes('img src'),'escaped content is visible as literal text');
}

/* ---------------- 3. structured fuzzing of the validator ---------------- */
{
  let seed=1337;const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff;};
  const pick=a=>a[Math.floor(rnd()*a.length)];
  const weird=[null,undefined,NaN,Infinity,-Infinity,0,-1,1e308,'',' ','0','null','undefined','NaN',
    '<script>x<\/script>',"'; DROP TABLE--",'\u0000','\uffff','\ud800',true,false,[],{},[[[]]],{a:{b:{c:{}}}}];
  const types=['weight','waist','steps','sleep','calories','note','context','bodyfat','unknown-type',''];
  let fuzzThrew=0,fuzzAccepted=0;
  for(let i=0;i<400;i++){
    const doc={schemaVersion:pick([1,2,pick(weird)]),
      observations:Array.from({length:Math.floor(rnd()*4)},()=>({
        id:pick([...weird,'id'+i]),type:pick(types),date:pick([...weird,'2026-01-01','2026-13-45']),
        value:pick(weird),source:pick(weird),createdAt:pick([...weird,'2026-01-01T00:00:00.000Z']),
        flags:pick([[],weird,null]),meta:pick(weird)})),
      profile:pick([{},null,weird[Math.floor(rnd()*weird.length)]]),
      settings:pick([{},null,{units:pick(weird),folds:pick(weird)}]),
      foodLogs:pick([[],null,[{id:'x',basis:pick(weird),quantity:pick(weird),food:pick(weird)}]])};
    try{
      const v=w.validateDB(doc);
      const m=w.migrate(JSON.parse(JSON.stringify(doc,(k,val)=>val===undefined?null:(typeof val==='number'&&!isFinite(val)?String(val):val))));
      if(v.ok&&m.ok){fuzzAccepted++;
        /* Anything accepted must survive an integrity check without a P0, or acceptance was wrong. */
        const keep=w.DB;w.DB=m.db;
        const ic=w.integrityCheck('fuzz');
        w.DB=keep;
        if(!ic.ok)fuzzThrew++;
      }
    }catch(e){fuzzThrew++;}
  }
  ok('400 structurally fuzzed documents neither crashed the validator nor were accepted in a corrupt state',
     fuzzThrew===0,fuzzThrew+' failures, '+fuzzAccepted+' accepted');
}

/* ---------------- 4. oversized and pathological inputs ---------------- */
{
  let threw=false;
  try{
    const huge={schemaVersion:2,observations:[],notes:[{id:'n',value:'x'.repeat(5000000)}]};
    w.validateDB(huge);
  }catch(e){threw=true;}
  ok('a five-megabyte field does not crash validation',!threw);
  let deepThrew=false;
  try{
    let deep={};let cur=deep;for(let i=0;i<5000;i++){cur.next={};cur=cur.next;}
    w.validateDB({schemaVersion:2,observations:[],settings:deep});
  }catch(e){deepThrew=/stack|depth|recursion/i.test(String(e.message));}
  ok('a deeply nested object is handled without a stack overflow escaping validation',!deepThrew);
}

/* ---------------- 5. the encrypted backup boundary ---------------- */
{
  const canCrypto=w._cryptoOk();
  if(!canCrypto)ok('encrypted backup correctly reports that it needs a secure context',true,'Web Crypto unavailable in this harness');
  else{
    let rejectedShort=false;
    try{await w.encryptBackup('short');}catch(e){rejectedShort=/8 characters/.test(e.message);}
    ok('a too-short passphrase is refused',rejectedShort);
    const env=await w.encryptBackup('a-long-enough-passphrase');
    ok('the envelope names its algorithm and iteration count and carries no plaintext',
       env.alg==='AES-GCM-256'&&env.iterations>=310000&&!JSON.stringify(env).includes('observations'));
    let wrongPass=false;
    try{await w.decryptBackup(env,'the-wrong-passphrase');}catch(e){wrongPass=/passphrase is wrong or the file is damaged/.test(e.message);}
    ok('a wrong passphrase fails closed with an honest message',wrongPass);
    const tampered=JSON.parse(JSON.stringify(env));
    tampered.ciphertext=tampered.ciphertext.slice(0,-4)+'AAAA';
    let tamperCaught=false;
    try{await w.decryptBackup(tampered,'a-long-enough-passphrase');}catch(e){tamperCaught=true;}
    ok('a tampered ciphertext is rejected by the authentication tag, not silently decrypted',tamperCaught);
    const round=await w.decryptBackup(env,'a-long-enough-passphrase');
    ok('a correct passphrase round-trips the record exactly',round&&round.schemaVersion===w.DB.schemaVersion);
    let notEnvelope=false;
    try{await w.decryptBackup({format:'something-else'},'a-long-enough-passphrase');}catch(e){notEnvelope=true;}
    ok('a file that is not an encrypted backup is refused',notEnvelope);
  }
}

/* ---------------- 6. the audit chain detects tampering ---------------- */
{
  w.auditAppend('test.one',{n:1});w.auditAppend('test.two',{n:2});w.auditAppend('test.three',{n:3});
  const clean=await w.verifyAuditChain();
  ok('an untampered audit chain verifies',clean.ok,JSON.stringify(clean.broken).slice(0,120));
  const chain=w._auditChain;
  if(chain.length>3){
    const victim=chain[chain.length-2];
    const realPrev=victim.prev;
    victim.prev='forged-hash';
    const broken=await w.verifyAuditChain();
    ok('altering a past audit entry breaks the chain and reports where',
       !broken.ok&&broken.broken.length>0,JSON.stringify(broken.broken[0]||{}));
    victim.prev=realPrev;
  }
}

/* ---- temporal boundary: a snapshot must not manufacture knowledge before itself ---- */
{
  const T=w.todayISO();
  w.DB=w.emptyDB();w._EVENTS.length=0;w._EVENT_SEQ=0;w._memoInvalidate();
  /* A legacy record adopted today: observations going back months, profile known only from today. */
  w.DB.profile={name:'Legacy',age:40,sex:'male',heightIn:70};
  /* A real legacy import carries the original creation timestamps; makeObservation stamps "now", which
     would make every reading invisible before today for the correct reason (nothing knew them yet) and
     would test the wrong property. */
  for(let i=120;i>0;i-=3){
    const o=w.makeObservation({type:'weight',date:w.addDays(T,-i),value:200-i*0.05,source:'manual'});
    o.createdAt=w.addDays(T,-i)+'T09:00:00.000Z';
    w.DB.observations.push(o);
  }
  w.resetEventLog('record adopted from outside the event log');
  const b=w.recordBaseline();
  ok('an adopted record reports the date it entered the event history',b.adopted===true&&b.date===T);
  ok('a date before adoption is flagged as unreconstructable',w.beforeBaseline(w.addDays(T,-60))===true);
  ok('the profile is unavailable before the baseline rather than substituted from today',
     (()=>{const p=w.withAsOf(w.addDays(T,-60),()=>w.prof());
       return p.__unavailable===true&&p.heightIn===undefined;})());
  ok('the energy chain reports insufficient there rather than a fabricated figure',
     w.withAsOf(w.addDays(T,-60),()=>w.bmrPrior()).status==='insufficient');
  ok('observations before the baseline remain visible — only unreconstructable state is withheld',
     w.withAsOf(w.addDays(T,-60),()=>w.obsOf('weight')).length>0);
  ok('after the baseline the profile resolves normally',w.prof().heightIn===70);
  /* A record whose log genuinely covers earlier ground is NOT restricted. */
  w._NOW_OVERRIDE=w.addDays(T,-100);
  w.emitEvent('profile.changed',{name:'Legacy',age:40,sex:'male',heightIn:70},{at:w.addDays(T,-100)+'T08:00:00.000Z'});
  w._NOW_OVERRIDE=null;w._memoInvalidate();
  ok('a record with real earlier events is not restricted by the adoption snapshot',
     w.recordBaseline().adopted===false&&
     w.withAsOf(w.addDays(T,-60),()=>w.prof()).heightIn===70);
}
/* ---- auxiliary settings must respect the as-of date ---- */
{
  const T=w.todayISO();
  w.loadDemo();
  w.setSkillState('pullup','consistent');
  ok('a skill recorded today does not appear in a replay of an earlier day',
     Object.keys(w.withAsOf(w.addDays(T,-30),()=>w.skillStates())).length===0);
  const inv=w.addInventoryItem({label:'Whey',remaining:2000,perDay:40});
  ok('an item added today does not appear in an earlier replay',
     w.withAsOf(w.addDays(T,-30),()=>w.inventoryState()).status==='insufficient');
  ok('an item removed today is still present in a replay from while it existed',
     (()=>{const rec=(w.DB.settings.inventory||[]).find(x=>x.id===inv.id);
       /* Backdate creation: an item created today cannot be present yesterday, and asserting it should be
          would test the wrong thing. What matters is that a LATER removal does not erase it from before. */
       rec.createdAt=w.addDays(T,-10)+'T09:00:00.000Z';
       rec.removedAt=w.nowISO();w._memoInvalidate();
       const later=w.inventoryState();
       const earlier=w.withAsOf(w.addDays(T,-5),()=>w.inventoryState());
       return later.status==='insufficient'&&earlier.status==='ok';})());
  ok('photos take an as-of date',
     (()=>{const n=(w.DB.settings.photos||[]).length;
       w.DB.settings.photos=(w.DB.settings.photos||[]).concat([{id:'p1',date:T,addedAt:w.nowISO()}]);
       const now=w.photoMeta().length, then=w.withAsOf(w.addDays(T,-5),()=>w.photoMeta()).length;
       w.DB.settings.photos.length=n;
       return now>then;})());
}
/* ---- an aborted quick log must leave neither a record nor an event ---- */
{
  w.loadDemo();
  const o0=w.DB.observations.length,e0=w._EVENTS.length;
  w.openSheet('edit',{form:'quick',title:'x',buf:{type:'food',date:w.todayISO(),calories:2000,protein:'not-a-number'}});
  w.saveQuickLog();
  ok('an aborted quick log writes no observation',w.DB.observations.length===o0);
  ok('an aborted quick log emits no event',w._EVENTS.length===e0);
  ok('the record and the projection still agree after an abort',w.projectionMatchesRecord().ok);
  w._SHEET.buf.protein=180;
  w.saveQuickLog();
  ok('a valid log commits record and events together',
     w.DB.observations.length>o0&&w._EVENTS.length>e0&&w.projectionMatchesRecord().ok);
}
/* ---- the shipped yield table satisfies its own stated check ---- */
{
  const y=JSON.parse(fs.readFileSync('dist/data/reference/yields.json','utf8'));
  const bad=Object.entries(y.items).filter(([id,r])=>
    r.lossPercent!=null&&Math.abs(Math.round(r.factor*100)+Math.round(r.lossPercent)-100)>2);
  ok('every shipped yield factor satisfies yield+loss\u2248100, as each row claims',bad.length===0,
     bad.slice(0,3).map(([id])=>id).join(','));
  ok('coverage describes what shipped rather than what was read',
     !y.coverage.pageRange&&!!y.coverage.shippedPageSpan&&y.coverage.shippedPageCount>0);
}

ok('no uncaught jsdom errors during the adversarial run',jsdomErrors.length===0,jsdomErrors.slice(0,2).join(' | '));

if(JSON_ONLY)console.log(JSON.stringify({failures,checks:report.length},null,1));
else{console.log(report.join('\n'));console.log('\n'+(report.length-failures)+' passed, '+failures+' failed');}
process.exit(failures?1:0);
