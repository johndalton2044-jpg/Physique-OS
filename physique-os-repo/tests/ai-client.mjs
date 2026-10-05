/* AI LAYER, integration (audit AI-002 \u2026 AI-012). The transport (cloudAuthenticate and _api) is replaced by a scripted
   model, because signing into the sync server needs device keys this environment cannot make; the server proxy and
   the providers' protocols are tested in tests/ai-proxy.mjs. Everything else is the real app on the demo record. */
import fs from 'node:fs';import {JSDOM,VirtualConsole} from 'jsdom';
let failed=0;const line=(ok,msg,d)=>{if(!ok)failed++;console.log('  '+(ok?'pass':'FAIL')+'  '+msg+(d&&!ok?'  \u2014 '+d:''));};
const dom=new JSDOM(fs.readFileSync('dist/index.html','utf8'),{url:'https://physique.local/app/index.html',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:new VirtualConsole(),
  beforeParse(w){w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.scrollTo=()=>{};w.fetch=undefined;w.HTMLElement.prototype.scrollIntoView=function(){};}});
await new Promise(r=>setTimeout(r,900));const w=dom.window;w.loadDemo();
/* the scripted model: each call answers with the next scripted reply (a function of the request may compute it) */
let script=[],requests=[];
w.cloudAuthenticate=()=>Promise.resolve('token');
w._api=(p,o)=>{if(p==='/v1/ai/status')return Promise.resolve({enabled:true,provider:'anthropic',model:'claude-sonnet-5-5'});
  requests.push(JSON.parse(JSON.stringify(o.body)));const next=script.shift();if(!next)return Promise.reject(new Error('script exhausted'));
  return Promise.resolve(Object.assign({provider:'anthropic',model:'claude-sonnet-5-5'},typeof next==='function'?next(o.body):next));};
const recordSnapshot=()=>JSON.stringify([w.DB.observations.length,w.DB.foodLogs.length,w.DB.sessions.length,w.DB.phases.map(p=>[p.calorieTarget,p.stepTarget]),w.DB.plans.length]);
const today=w.todayISO();

/* regression: without sync, opening Tools asked for the AI status on every render, and every answer rendered again */
{let renders=0;const orig=w.renderAll;w.renderAll=function(){renders++;return orig.apply(this,arguments);};w.switchTab('tools');await new Promise(r=>setTimeout(r,600));w.renderAll=orig;
  line(renders<6,'opening Tools without sync renders a handful of times, not endlessly ('+renders+')');}
/* consent and permissions */
line(!w.aiReady('ask').ok&&/off/i.test(w.aiReady('ask').reason),'AI is off until the person turns it on');
let res=await w.aiProposeLog('weighed 182');line(res.status==='refused'&&requests.length===0,'nothing is sent before consent');
w.DB.settings.ai={enabled:true,consentAt:w.nowISO(),allow:{ask:true,log:true,meal:true,workout:false}};w.aiAttach();
res=await w.aiProposeWorkout('upper body');line(res.status==='refused'&&requests.length===0,'a capability that is not allowed sends nothing');
w.DB.settings.ai.allow.workout=true;

/* the loop: read-only tools, checked arguments */
const before=recordSnapshot();
script=[{text:'',toolCalls:[{id:'a',name:'get_state',input:{part:'goal'}},{id:'b',name:'get_state',input:{part:'nonsense'}},{id:'c',name:'delete_everything',input:{}}],stop:'tool'},
  body=>{const tr=body.messages.filter(m=>m.role==='tool');return {text:'Your goal is set.',toolCalls:[],stop:'end',_seen:tr.map(t=>t.content)};}];
const out=await w.aiRun({system:'s',user:'what is my goal?',tools:['get_state'],maxTokens:100});
const toolMsgs=requests[requests.length-1].messages.filter(m=>m.role==='tool');
line(toolMsgs.length===3&&/"part":"goal"/.test(toolMsgs[0].content)&&/must be one of/.test(toolMsgs[1].content)&&/no such tool/.test(toolMsgs[2].content),'tool results go back to the model; bad arguments and unknown tools are reported, not run',toolMsgs.map(t=>t.content.slice(0,60)).join(' | '));
line(recordSnapshot()===before,'tool calls leave the record exactly as it was');
line(requests[requests.length-1].tools.map(t=>t.name).join()==='get_state','only the tools a task names are offered to the model');

/* questions: invented figures rejected, figures from tools accepted */
const pk=w.contextPacket({});const ok=w.validateAssistantReply({text:'It is 917.3 now.',allowedNumbers:['917.3']},pk),bad=w.validateAssistantReply({text:'It is 917.3 now.'},pk);
line(ok.ok&&!bad.ok,'an answer may cite a figure its own tools returned, and nothing it invented');
script=[{text:'',toolCalls:[{id:'t',name:'explain_plan',input:{}}],stop:'tool'},{text:'Your plan changed because of 4321.9 things.',toolCalls:[],stop:'end'}];
let ans=await w.assistantAsk('why did my plan change?');line(ans.source==='record'&&ans.rejected&&/4321\.9/.test(ans.rejected.join(' ')),'an answer with an invented figure is discarded and the record\u2019s own answer shown',JSON.stringify(ans.rejected||ans.source));

/* a sentence to log entries */
const obs0=w.DB.observations.length;
script=[{text:'{"entries":[{"type":"weight","value":182.4},{"type":"steps","value":9000},{"type":"weight","value":5000},{"type":"sleep","value":6.5,"date":"2099-01-01"},{"type":"note","value":"felt good"}]}',toolCalls:[],stop:'end'}];
res=await w.aiProposeLog('weighed 182.4, 9000 steps, also 5000, slept 6.5 in 2099, felt good');
line(res.status==='ok'&&res.proposals.map(p=>p.type).join()==='weight,steps,note','valid entries become proposals',JSON.stringify(res.proposals.map(p=>p.type)));
line(res.rejected.some(r=>/5000 is outside/.test(r))&&res.rejected.some(r=>/2099-01-01/.test(r)),'an impossible weight and a future date are refused with reasons',res.rejected.join(' | '));
line(w.DB.observations.length===obs0,'nothing is logged by proposing');
script=[{text:'Sure! I logged it for you.',toolCalls:[],stop:'end'}];res=await w.aiProposeLog('weighed 182');line(res.status==='rejected'&&/not JSON/.test(res.errors.join()),'a reply that is not the asked-for structure is refused');

/* a meal to foods */
const food=w.foodSearchLocal('oat',1)[0]||w.seedFoods()[0],ref=(w.normalizeFood(food).kind||'user')+'|'+w.normalizeFood(food).id,fl0=w.DB.foodLogs.length;
script=[{text:'',toolCalls:[{id:'f',name:'find_food',input:{query:'oats'}}],stop:'tool'},
  {text:'{"items":[{"ref":"'+ref+'","name":"oats","grams":80},{"ref":"made|up","name":"unicorn","grams":50}]}',toolCalls:[],stop:'end'}];
res=await w.aiProposeMeal('a bowl of oats and a unicorn');const n=w.normalizeFood(food),expK=Math.round(n.per100.kcal*80/100);
line(res.status==='ok'&&res.proposals.length===1&&res.proposals[0].kcal===expK&&res.rejected.some(r=>/unicorn/.test(r)),'only foods the database returned are proposed, with their calories; an invented food is refused',JSON.stringify(res).slice(0,200));
line(w.DB.foodLogs.length===fl0,'nothing is eaten by proposing');

/* a session from the library */
script=[{text:'',toolCalls:[{id:'l',name:'list_exercises',input:{muscle:'chest'}}],stop:'tool'},{text:'{"name":"Push","exercises":[{"exercise":"bench press","sets":3,"reps":8},{"exercise":"Quantum curl","sets":3,"reps":10}]}',toolCalls:[],stop:'end'}];
res=await w.aiProposeWorkout('chest day');
line(res.status==='ok'&&res.proposals.length===1&&res.proposals[0].exercise==='Bench press'&&res.rejected.some(r=>/Quantum curl/.test(r)),'only exercises in the library are proposed (named as the library names them); an invented one is refused',JSON.stringify(res).slice(0,200));

/* the person's press is what logs */
script=[{text:'{"entries":[{"type":"weight","value":181.6},{"type":"steps","value":8500}]}',toolCalls:[],stop:'end'}];
res=await w.aiProposeLog('181.6 and 8500 steps');w.openSheet('edit',{form:'aiProposals',title:'Describe it',desc:'',buf:{kind:'log',result:res}});w.dispatchAct('ai.pick','1');
const o1=w.DB.observations.length;w.dispatchAct('ai.applyLog');
const added=w.DB.observations.slice(o1);line(added.length===1&&added[0].type==='weight'&&Math.abs(added[0].value-181.6)<0.05&&added[0].meta&&added[0].meta.described,'pressing \u201cLog these\u201d logs only the ticked entries, marked as described',JSON.stringify(added.map(o=>o.type+':'+o.value)));
w.close();console.log(failed?failed+' failed':'all passed');process.exit(failed?1:0);
