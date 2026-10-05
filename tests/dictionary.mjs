/* UNIVERSAL DATA DICTIONARY AND ONTOLOGY LOCK (future-architecture §159\u2013161, plan Stage A1\u2013A2). Generated from the
   registries that already exist \u2014 observation types, entity contracts, events, models, semantic types \u2014 never a second
   registry. It fails when:
     \u2022 an observation type lacks its unit, group, consumers or a semantic type, or a model lacks its output;
     \u2022 an event belongs to no entity contract;
     \u2022 a persisted record carries a field the committed dictionary does not describe (schema drift: regenerate with
       --write and describe it);
     \u2022 an id in the ontology (observation types, events, stores, models, exercises) disappears without a migration
       recorded in docs/ontology-migrations.json.
   The ontology version is a hash of its ids, so it cannot be forgotten. */
import fs from 'node:fs';import crypto from 'node:crypto';import {JSDOM,VirtualConsole} from 'jsdom';
const dom=new JSDOM(fs.readFileSync('dist/index.html','utf8'),{url:'https://physique.local/app/index.html',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:new VirtualConsole(),
  beforeParse(w){w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.scrollTo=()=>{};w.fetch=undefined;w.HTMLElement.prototype.scrollIntoView=function(){};}});
await new Promise(r=>setTimeout(r,900));const w=dom.window;w.loadDemo();try{w.recordResponses();w.runLearningCycle();}catch(e){}
const D=JSON.parse(w.eval(`JSON.stringify((function(){
  var sem={};try{(typeCoverage().rows||[]).forEach(function(r){sem[r.type]=r.semantic||r.semanticType||r.resolved||null;});}catch(e){}
  var obs=Object.keys(OBS_TYPES).sort().map(function(k){var t=OBS_TYPES[k],dd=DATA_DICTIONARY[k]||{};return {id:k,label:t.label,unit:t.unit||null,group:t.group||null,min:t.min!=null?t.min:null,max:t.max!=null?t.max:null,
    consumers:t.consumers||[],semantic:(function(){var s=typeof typeForQuantity==='function'?typeForQuantity(k):null;return s?(s.id||s.name||String(s)):((typeof TYPE_ALIASES!=='undefined'&&TYPE_ALIASES[k])||null);})(),meaning:dd.meaning||null,notes:dd.notes||null,text:!!t.text||t.kind==='text'||k==='note'||k==='context'};});
  var owners={};Object.keys(ENTITY_CONTRACTS).forEach(function(n){(ENTITY_CONTRACTS[n].events||[]).forEach(function(e){(owners[e]=owners[e]||[]).push(n);});});
  var events=Object.keys(EVENT_TYPES).sort().map(function(e){return {id:e,entities:owners[e]||[]};});
  var typeOf=function(v){return v===null?'null':Array.isArray(v)?'array':typeof v;};
  var stores={};Object.keys(ENTITY_CONTRACTS).forEach(function(n){(ENTITY_CONTRACTS[n].stores||[]).forEach(function(s){var st=stores[s]=stores[s]||{entities:[],fields:{}};if(st.entities.indexOf(n)<0)st.entities.push(n);
    var v=DB[s],recs=Array.isArray(v)?v:(v&&typeof v==='object'?[v]:[]);recs.forEach(function(r){if(!r||typeof r!=='object')return;Object.keys(r).forEach(function(f){var set=st.fields[f]=st.fields[f]||[];var t=typeOf(r[f]);if(set.indexOf(t)<0)set.push(t);});});});});
  Object.keys(stores).forEach(function(s){var f=stores[s].fields,o={};Object.keys(f).sort().forEach(function(k){o[k]=f[k].sort();});stores[s].fields=o;});
  var models=MODELS.map(function(m){return {id:m.id,cls:m.cls,output:m.output||null,uncertainty:m.uncertainty&&m.uncertainty.kind||m.uncertainty||null,inputs:m.inputs||[]};}).sort(function(a,b){return a.id<b.id?-1:1;});
  var exercises=EXERCISES.map(function(e){return e.id||e.name;}).sort();
  return {obs:obs,events:events,stores:stores,models:models,exercises:exercises,concepts:DATA_DICTIONARY};})())`));
w.close();
const ids={observationTypes:D.obs.map(o=>o.id),events:D.events.map(e=>e.id),stores:Object.keys(D.stores).sort(),models:D.models.map(m=>m.id),exercises:D.exercises};
const ontologyVersion=crypto.createHash('sha256').update(JSON.stringify(ids)).digest('hex').slice(0,12);
const dict={generated:'tests/dictionary.mjs --write',ontologyVersion,observationTypes:D.obs,events:D.events,stores:D.stores,models:D.models,concepts:D.concepts,ontology:ids};
const PATH='docs/data-dictionary.json',MIG='docs/ontology-migrations.json';
const migrations=fs.existsSync(MIG)?JSON.parse(fs.readFileSync(MIG,'utf8')):{note:'an id removed or renamed in the ontology is recorded here: {"kind":"observationTypes","from":"old","to":"new or null (retired)","reason":"..."}',migrations:[]};
if(process.argv.includes('--write')){const prev=fs.existsSync(PATH)?JSON.parse(fs.readFileSync(PATH,'utf8')):null;
  if(prev){for(const k of Object.keys(ids)){const gone=(prev.ontology[k]||[]).filter(x=>!ids[k].includes(x));for(const g of gone)if(!migrations.migrations.some(m=>m.kind===k&&m.from===g)){console.error('refusing to write: '+k+' "'+g+'" disappeared without a migration in '+MIG);process.exit(1);}}}
  fs.writeFileSync(PATH,JSON.stringify(dict,null,1));if(!fs.existsSync(MIG))fs.writeFileSync(MIG,JSON.stringify(migrations,null,1));console.log('dictionary written: ontology '+ontologyVersion);process.exit(0);}
let failed=0;const line=(ok,m,d)=>{if(!ok)failed++;console.log('  '+(ok?'pass':'FAIL')+'  '+m+(d&&d.length&&!ok?'\n          '+d.slice(0,12).join('\n          '):''));};
const committed=fs.existsSync(PATH)?JSON.parse(fs.readFileSync(PATH,'utf8')):null;
console.log('  '+D.obs.length+' observation types, '+D.events.length+' events, '+ids.stores.length+' stores ('+Object.values(D.stores).reduce((a,s)=>a+Object.keys(s.fields).length,0)+' fields), '+D.models.length+' models, '+D.exercises.length+' exercises; ontology '+ontologyVersion);
line(!!committed,'a committed dictionary exists (node tests/dictionary.mjs --write)');
line(D.obs.every(o=>o.text||(o.unit&&o.group&&o.consumers.length&&o.semantic)),'every observation type states its unit, group, consumers and semantic type',D.obs.filter(o=>!(o.text||(o.unit&&o.group&&o.consumers.length&&o.semantic))).map(o=>o.id+': '+['unit','group','consumers','semantic'].filter(k=>k==='consumers'?!o.consumers.length:!o[k]).join(', ')));
line(D.models.every(m=>m.output&&m.cls),'every model states its output and class',D.models.filter(m=>!(m.output&&m.cls)).map(m=>m.id));
line(D.events.every(e=>e.entities.length),'every event belongs to an entity contract',D.events.filter(e=>!e.entities.length).map(e=>e.id));
if(committed){const drift=[];for(const [s,st] of Object.entries(D.stores)){const was=(committed.stores[s]||{fields:{}}).fields;for(const f of Object.keys(st.fields))if(!(f in was))drift.push(s+'.'+f+' ('+st.fields[f].join('|')+')');}
  line(!drift.length,'every persisted field is in the committed dictionary (no silent schema drift)',drift);
  const lost=[];for(const k of Object.keys(ids))for(const g of (committed.ontology[k]||[]))if(!ids[k].includes(g)&&!migrations.migrations.some(m=>m.kind===k&&m.from===g))lost.push(k+': '+g);
  line(!lost.length,'no ontology id disappeared without a recorded migration',lost);
  line(committed.ontologyVersion===ontologyVersion||!lost.length,'the ontology version follows its ids ('+committed.ontologyVersion+' \u2192 '+ontologyVersion+')');}
console.log(failed?failed+' failed':'all passed');process.exit(failed?1:0);
