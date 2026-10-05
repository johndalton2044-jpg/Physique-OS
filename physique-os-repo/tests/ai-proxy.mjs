/* AI PROXY (audit AI-001). Each mock provider checks the request as its real API expects it (path, auth header, body
   shape, tool protocol) and answers in its own format, including a tool call; the proxy must translate both ways. */
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';
let failed=0;const line=(ok,msg,d)=>{if(!ok)failed++;console.log('  '+(ok?'pass':'FAIL')+'  '+msg+(d&&!ok?'  \u2014 '+d:''));};
const data=fs.mkdtempSync(path.join(os.tmpdir(),'pos-ai-'));Object.assign(process.env,{PHYSIQUE_SERVER_TEST:'1',DATA_DIR:data});
/* what the server actually writes (it logs to standard output): captured, so the privacy check is not vacuous */
const written=[];const _ow=process.stdout.write.bind(process.stdout),_oe=process.stderr.write.bind(process.stderr);
const startCapture=()=>{process.stdout.write=(c,...a)=>{written.push(String(c));return _ow(c,...a);};process.stderr.write=(c,...a)=>{written.push(String(c));return _oe(c,...a);};};
const stopCapture=()=>{process.stdout.write=_ow;process.stderr.write=_oe;};
const S=await import('../server/server.mjs?ai'+Date.now());
const TOOLS=[{name:'get_state',description:'Read the person\u2019s current state',schema:{type:'object',properties:{part:{type:'string'}},required:['part']}}];
const SECRET='MY-PRIVATE-QUESTION-CONTENT-123';
/* a conversation that has gone once round a tool: user \u2192 assistant tool call \u2192 two tool results */
const convo={system:'You explain.',maxTokens:300,tools:TOOLS,messages:[{role:'user',content:SECRET},{role:'assistant',content:'',toolCalls:[{id:'t1',name:'get_state',input:{part:'goal'}},{id:'t2',name:'get_state',input:{part:'plan'}}]},
  {role:'tool',toolCallId:'t1',name:'get_state',content:'{"goal":"lose fat"}'},{role:'tool',toolCallId:'t2',name:'get_state',content:'{"plan":1}'}]};
const mock=(check,reply)=>{const seen=[];const srv=http.createServer((req,res)=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>{let body={};try{body=JSON.parse(b);}catch(e){}
  const problem=check(req,body);seen.push({path:req.url,headers:req.headers,body,problem});res.writeHead(problem?400:200,{'content-type':'application/json'});res.end(JSON.stringify(problem?{error:{message:problem}}:reply));});});
  return new Promise(r=>srv.listen(0,()=>r({srv,seen,base:'http://127.0.0.1:'+srv.address().port})));};

startCapture();
/* Anthropic */
const A=await mock((req,b)=>{if(req.url!=='/v1/messages')return 'path';if(req.headers['x-api-key']!=='ak')return 'x-api-key';if(req.headers['anthropic-version']!=='2023-06-01')return 'anthropic-version';
  if(b.system!=='You explain.'||b.max_tokens!==300||b.model!=='claude-sonnet-5-5')return 'top-level fields';if(!b.tools||b.tools[0].input_schema.required[0]!=='part')return 'tools';
  const m=b.messages;if(m.length!==3)return 'tool results must merge into one user message: got '+m.length;
  if(!(m[1].role==='assistant'&&m[1].content.filter(c=>c.type==='tool_use').length===2))return 'tool_use blocks';
  if(!(m[2].role==='user'&&m[2].content.length===2&&m[2].content.every(c=>c.type==='tool_result'&&c.tool_use_id)))return 'tool_result blocks';return null;},
  {content:[{type:'text',text:'Checking.'},{type:'tool_use',id:'toolu_1',name:'get_state',input:{part:'phase'}}],stop_reason:'tool_use',usage:{input_tokens:50,output_tokens:9}});
let r=await S.aiComplete(convo,{AI_PROVIDER:'anthropic',AI_MODEL:'claude-sonnet-5-5',AI_API_KEY:'ak',AI_BASE_URL:A.base});
line(!A.seen[0].problem,'Anthropic: the request follows the Messages API (headers, merged tool results)',A.seen[0].problem);
line(r.text==='Checking.'&&r.toolCalls&&r.toolCalls[0].id==='toolu_1'&&r.toolCalls[0].input.part==='phase'&&r.stop==='tool'&&r.usage.input===50,'Anthropic: text and tool call normalised back',JSON.stringify(r));

/* OpenAI, and an OpenAI-compatible local server */
const O=await mock((req,b)=>{if(req.url!=='/v1/chat/completions')return 'path';const local=!req.headers.authorization;if(!local&&req.headers.authorization!=='Bearer ok')return 'bearer';
  if(b.messages[0].role!=='system')return 'system first';const asst=b.messages[2];if(!(asst.tool_calls&&typeof asst.tool_calls[0].function.arguments==='string'))return 'arguments must be a JSON string';
  if(b.messages.filter(m=>m.role==='tool'&&m.tool_call_id).length!==2)return 'tool messages';const want=req.headers['x-test-field']||'max_tokens';void want;if(b.max_tokens!==300&&b.max_completion_tokens!==300)return 'token limit missing';
  if(b.tools[0].type!=='function'||!b.tools[0].function.parameters)return 'tools';return null;},
  {choices:[{message:{content:null,tool_calls:[{id:'call_9',type:'function',function:{name:'get_state',arguments:'{"part":"recovery"}'}}]},finish_reason:'tool_calls'}],usage:{prompt_tokens:40,completion_tokens:7}});
r=await S.aiComplete(convo,{AI_PROVIDER:'openai',AI_MODEL:'some-model',AI_API_KEY:'ok',AI_BASE_URL:O.base,AI_TOKEN_FIELD:'max_completion_tokens'});
line(!O.seen[0].problem,'OpenAI-compatible with a key: Chat Completions format (system first, arguments as a JSON string, tool messages)',O.seen[0].problem);
line(O.seen[0].body.max_completion_tokens===300&&r.toolCalls&&r.toolCalls[0].input.part==='recovery'&&r.stop==='tool','OpenAI: max_completion_tokens as OpenAI\u2019s API wants, and the JSON arguments parsed back',JSON.stringify(r));
r=await S.aiComplete(convo,{AI_PROVIDER:'openai',AI_MODEL:'llama3',AI_BASE_URL:O.base});
line(!O.seen[1].problem&&O.seen[1].body.max_tokens===300&&!('max_completion_tokens' in O.seen[1].body)&&r.stop==='tool','a local OpenAI-compatible server needs no key and gets max_tokens',O.seen[1].problem);
line(S.aiConfig({AI_PROVIDER:'openai',AI_MODEL:'m',AI_API_KEY:'k'}).tokenField==='max_completion_tokens','OpenAI\u2019s own host is given max_completion_tokens by default');

/* Gemini */
const G=await mock((req,b)=>{if(req.url!=='/v1beta/models/gem-model:generateContent')return 'path '+req.url;if(req.headers['x-goog-api-key']!=='gk')return 'x-goog-api-key';
  if(!b.systemInstruction||b.systemInstruction.parts[0].text!=='You explain.')return 'systemInstruction';if(b.generationConfig.maxOutputTokens!==300)return 'maxOutputTokens';
  const c=b.contents;if(c.length!==3||c[1].role!=='model'||c[1].parts.filter(p=>p.functionCall).length!==2)return 'model functionCall turn';
  if(!(c[2].role==='user'&&c[2].parts.length===2&&c[2].parts.every(p=>p.functionResponse&&p.functionResponse.name==='get_state')))return 'functionResponse parts';
  if(!b.tools[0].functionDeclarations[0].parameters)return 'functionDeclarations';return null;},
  {candidates:[{content:{role:'model',parts:[{text:'One moment.'},{functionCall:{name:'get_state',args:{part:'nutrition'}}}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:30,candidatesTokenCount:5}});
r=await S.aiComplete(convo,{AI_PROVIDER:'gemini',AI_MODEL:'gem-model',AI_API_KEY:'gk',AI_BASE_URL:G.base});
line(!G.seen[0].problem,'Gemini: generateContent format (systemInstruction, functionCall and functionResponse parts)',G.seen[0].problem);
line(r.text==='One moment.'&&r.toolCalls&&r.toolCalls[0].name==='get_state'&&r.toolCalls[0].input.part==='nutrition'&&r.toolCalls[0].id&&r.stop==='tool','Gemini: a function call gets an id and is normalised back',JSON.stringify(r));

/* errors, configuration, limits */
const bad=await S.aiComplete(convo,{AI_PROVIDER:'anthropic',AI_MODEL:'claude-sonnet-5-5',AI_API_KEY:'wrong',AI_BASE_URL:A.base});
line(bad.code===502&&/HTTP 400/.test(bad.body.error),'a provider error comes back as 502 with its status, not as a reply',JSON.stringify(bad));
line((await S.aiComplete(convo,{})).code===503,'with no AI configured the proxy says so (503)');
line((await S.aiComplete({messages:[]},{AI_PROVIDER:'anthropic',AI_MODEL:'m',AI_API_KEY:'k',AI_BASE_URL:A.base})).code===400,'an empty conversation is refused');
const srv=S.server.listen(0);await new Promise(x=>srv.on('listening',x));const base='http://127.0.0.1:'+srv.address().port;
const un=await fetch(base+'/v1/ai/complete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(convo)});
line(un.status===401,'the route refuses a request without an unlocked vault (no open relay)');
const st=await (await fetch(base+'/v1/ai/status')).json();line(st.enabled===false&&!('key' in st),'status says whether AI is on, never the key',JSON.stringify(st));
srv.close();[A,O,G].forEach(m=>m.srv.close());
/* privacy: the server log never contains the conversation */
stopCapture();const logText=written.join('');
line(/ai call/.test(logText)&&!logText.includes(SECRET),'the server logs each AI call (sizes and timing) but never the conversation\u2019s content',logText.includes(SECRET)?'content found in the log':'no ai call logged');
fs.rmSync(data,{recursive:true,force:true});console.log(failed?failed+' failed':'all passed');process.exit(failed?1:0);
