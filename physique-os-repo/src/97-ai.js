/* ============================================================================
   AI LAYER (audit AI-001 \u2026 AI-012). An interface over the stable system, never a second engine:
   \u2022 the model is reached only through the app's own server (the content-security policy lets the app post nowhere
     else), where the provider key lives; nothing is sent until the person turns AI on and consents (AI-005);
   \u2022 tools are read-only views of the record (AI-002), each with a schema its arguments are checked against;
   \u2022 every structured output is validated against its schema and the record's own limits before it is shown (AI-004);
   \u2022 the results are PROPOSALS: logging, eating or training happens only when the person presses the button, through
     the ordinary interface paths (AI-012, enforced by tests/authority.mjs: this file may call no mutator).
   ============================================================================ */
var AI_CAPABILITIES={ask:'Answer questions about your record',log:'Turn a sentence into log entries',meal:'Turn a meal description into foods',workout:'Suggest a session from your exercise library'};
function aiSettings(){var a=DB.settings.ai||{};return {enabled:!!a.enabled,consentAt:a.consentAt||null,allow:Object.assign({ask:true,log:false,meal:false,workout:false},a.allow||{})};}
/* every answer is cached, failures included, for five minutes: an uncached “not available” made each render ask again,
   and each answer render again — an endless loop for anyone without sync */
var _AI_STATUS=null,_AI_STATUS_AT=0,_AI_STATUS_PENDING=null;
function aiServerStatus(force){if(_AI_STATUS&&!force&&Date.now()-_AI_STATUS_AT<300000)return Promise.resolve(_AI_STATUS);if(_AI_STATUS_PENDING)return _AI_STATUS_PENDING;
  var done=function(s){_AI_STATUS=s;_AI_STATUS_AT=Date.now();_AI_STATUS_PENDING=null;return s;};
  if(!cloudConfig().enabled)return Promise.resolve(done({enabled:false,reason:'sync is not set up, and AI goes through your sync server'}));
  _AI_STATUS_PENDING=_api('/v1/ai/status').then(done,function(e){return done({enabled:false,reason:String(e&&e.message||e)});});return _AI_STATUS_PENDING;}
function aiReady(cap){var s=aiSettings();if(!s.enabled||!s.consentAt)return {ok:false,reason:'AI is off. Turn it on in Tools \u2192 AI assistant.'};if(cap&&!s.allow[cap])return {ok:false,reason:'This use of AI is not allowed in Tools \u2192 AI assistant.'};return {ok:true};}

/* ---- AI-004: a small JSON-schema check (the subset the tools and outputs use) ---- */
function aiCheck(schema,v,at){at=at||'';var e=[];if(!schema)return e;
  if(schema.enum&&schema.enum.indexOf(v)<0)return [at+' must be one of '+schema.enum.join(', ')];
  var t=schema.type;if(t==='object'){if(!v||typeof v!=='object'||Array.isArray(v))return [at+' must be an object'];(schema.required||[]).forEach(function(k){if(v[k]==null)e.push(at+'.'+k+' is required');});
    Object.keys(schema.properties||{}).forEach(function(k){if(v[k]!=null)e=e.concat(aiCheck(schema.properties[k],v[k],at+'.'+k));});}
  else if(t==='array'){if(!Array.isArray(v))return [at+' must be a list'];if(schema.maxItems&&v.length>schema.maxItems)e.push(at+' has more than '+schema.maxItems+' items');v.forEach(function(x,i){e=e.concat(aiCheck(schema.items,x,at+'['+i+']'));});}
  else if(t==='number'){if(typeof v!=='number'||!isFinite(v))return [at+' must be a number'];if(schema.minimum!=null&&v<schema.minimum)e.push(at+' is below '+schema.minimum);if(schema.maximum!=null&&v>schema.maximum)e.push(at+' is above '+schema.maximum);}
  else if(t==='string'){if(typeof v!=='string')return [at+' must be text'];if(schema.maxLength&&v.length>schema.maxLength)e.push(at+' is too long');if(schema.pattern&&!new RegExp(schema.pattern).test(v))e.push(at+' is not in the expected form');}
  return e;}

/* ---- AI-002: read-only tools ---- */
var _AI_TRUNC=function(o){var s=JSON.stringify(o);return s.length>4000?s.slice(0,4000)+'\u2026':s;};
var AI_TOOLS={
  get_state:{description:'Read one part of the person\u2019s current state (a read-only projection of the record).',
    schema:{type:'object',properties:{part:{type:'string',enum:['goal','constraints','plan','phase','training','nutrition','activity','recovery','bodyComposition','execution','response','evidence','adaptation']}},required:['part']},
    run:function(a){var s=individualState();return {asOf:s.asOf,part:a.part,value:s[a.part]};}},
  explain_plan:{description:'Why the current plan is what it is: its version, what changed, the reason and the expected outcome.',schema:{type:'object',properties:{}},
    run:function(){var p=currentPlan();if(!p)return {plan:null};return {version:p.version,since:p.effectiveFrom,changes:(p.changes||[]).slice(0,8),reason:p.trigger&&p.trigger.reason,expected:p.trigger&&p.trigger.expected,source:p.trigger&&p.trigger.source};}},
  explain_adaptation:{description:'The adaptations the app currently proposes, each with its reason and expected effect.',schema:{type:'object',properties:{}},
    run:function(){var A=adaptationProposals();return {proposals:(A.proposals||[]).slice(0,5).map(function(x){return {id:x.id,title:x.title,why:x.why||null,expected:x.expected||null};})};}},
  get_evidence:{description:'The published evidence the app cites on a topic.',schema:{type:'object',properties:{topic:{type:'string',maxLength:60}},required:['topic']},
    run:function(a){return {topic:a.topic,evidence:(evidenceFor(a.topic)||[]).slice(0,5)};}},
  find_food:{description:'Search the food database and the person\u2019s own foods.',schema:{type:'object',properties:{query:{type:'string',maxLength:60}},required:['query']},
    run:function(a){return {results:foodSearchLocal(a.query,6).map(function(f){var n=normalizeFood(f);return {ref:(n.kind||'user')+'|'+n.id,name:n.name,per100:n.per100&&{kcal:n.per100.kcal,protein:n.per100.protein},basis:n.basis};})};}},
  list_exercises:{description:'Exercises in the person\u2019s library, optionally for one muscle.',schema:{type:'object',properties:{muscle:{type:'string',maxLength:30}}},
    run:function(a){return {exercises:EXERCISES.filter(function(e){return !a.muscle||(e.primary||[]).concat(e.secondary||[]).some(function(m){return String(m).toLowerCase().indexOf(String(a.muscle).toLowerCase())>=0;});}).slice(0,40).map(function(e){return e.name;})};}}};
function aiToolDefs(names){return names.map(function(n){return {name:n,description:AI_TOOLS[n].description,schema:AI_TOOLS[n].schema};});}

/* ---- the one loop, for every provider (the server normalises them) ---- */
function aiRun(o){var msgs=[{role:'user',content:o.user}],steps=0,toolNumbers=[],trace=[];
  var call=function(){return cloudAuthenticate().then(function(){return _api('/v1/ai/complete',{method:'POST',body:{system:o.system,messages:msgs,tools:aiToolDefs(o.tools||[]),maxTokens:o.maxTokens||800}});});};
  var turn=function(){steps++;return call().then(function(r){
    if(!r.toolCalls||!r.toolCalls.length||steps>=(o.maxSteps||5))return {text:r.text||'',toolNumbers:toolNumbers,trace:trace,provider:r.provider,model:r.model};
    msgs.push({role:'assistant',content:r.text||'',toolCalls:r.toolCalls});
    r.toolCalls.forEach(function(tc){var T=AI_TOOLS[tc.name],out;
      if(!T||(o.tools||[]).indexOf(tc.name)<0)out={error:'no such tool'};else{var bad=aiCheck(T.schema,tc.input||{},'arguments');out=bad.length?{error:bad.join('; ')}:(function(){try{return T.run(tc.input||{});}catch(e){return {error:String(e.message||e)};}})();}
      var s=_AI_TRUNC(out);(s.match(/-?\d+(?:\.\d+)?/g)||[]).forEach(function(n){toolNumbers.push(String(round(parseFloat(n),1)));});trace.push({tool:tc.name,input:tc.input,ok:!out.error});
      msgs.push({role:'tool',toolCallId:tc.id,name:tc.name,content:s});});
    return turn();});};
  return turn();}
function _aiJSON(text){var m=String(text||'').match(/[\[{][\s\S]*[\]}]/);if(!m)return null;try{return JSON.parse(m[0]);}catch(e){return null;}}
var AI_SYSTEM_BASE='You are the explanation layer of Physique OS, a personal training and nutrition record. Use the tools to read the record; never invent a number. You cannot change the record: the person does that. Do not give medical advice or name clinical conditions. Be brief.';

/* ---- AI-006/007/011: questions, through the existing contract and validation ---- */
var AI_ASSISTANT_ADAPTER={complete:function(pack,question){return aiRun({system:AI_SYSTEM_BASE+' Answer from the record only. Contract: '+ASSISTANT_CONTRACT.mayNot.join('; ')+'. Context: '+JSON.stringify(pack).slice(0,6000),
  user:question,tools:['get_state','explain_plan','explain_adaptation','get_evidence'],maxTokens:600}).then(function(r){return {text:r.text,allowedNumbers:r.toolNumbers,trace:r.trace};});}};
function aiAttach(){var s=aiSettings();if(s.enabled&&s.consentAt&&s.allow.ask)registerAssistant(AI_ASSISTANT_ADAPTER);else if(typeof _assistantAdapter!=='undefined'&&_assistantAdapter===AI_ASSISTANT_ADAPTER)_assistantAdapter=null;}

/* ---- AI-008: a sentence \u2192 proposed log entries ---- */
var AI_LOG_TYPES=['weight','waist','steps','sleep','fatigue','soreness','stress','hunger','water','cardio','note'];
var AI_LOG_SCHEMA={type:'object',properties:{entries:{type:'array',maxItems:8,items:{type:'object',properties:{type:{type:'string',enum:AI_LOG_TYPES},value:{},date:{type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$'},note:{type:'string',maxLength:200}},required:['type','value']}}},required:['entries']};
function aiProposeLog(text){var r=aiReady('log');if(!r.ok)return Promise.resolve({status:'refused',note:r.reason});
  return aiRun({system:AI_SYSTEM_BASE+' Turn the person\u2019s sentence into log entries. Reply with JSON only: {"entries":[{"type":one of '+AI_LOG_TYPES.join('|')+',"value":number (text for note),"date":"YYYY-MM-DD" if not today}]}. Weight in '+(unitPref()==='metric'?'kg':'lb')+', sleep in hours, water in litres, cardio in minutes, ratings 1\u201310. Today is '+todayISO()+'. If nothing can be logged, return {"entries":[]}.',
    user:text,tools:[],maxTokens:400}).then(function(res){var j=_aiJSON(res.text),errs=j?aiCheck(AI_LOG_SCHEMA,j,'reply'):['the reply was not JSON'];if(errs.length)return {status:'rejected',errors:errs};
    var out=[],rej=[];j.entries.forEach(function(e,i){var d=e.date||todayISO(),T=OBS_TYPES[e.type]||{},v=e.type==='note'?String(e.value):num(e.value);
      if(d>todayISO()||daysBetween(d,todayISO())>14){rej.push('entry '+(i+1)+': the date '+d+' is not within the last two weeks');return;}
      if(e.type!=='note'){if(v==null){rej.push('entry '+(i+1)+': '+e.type+' needs a number');return;}var canon=e.type==='weight'?toCanonicalWeight(v):v;
        if((T.min!=null&&canon<T.min)||(T.max!=null&&canon>T.max)){rej.push('entry '+(i+1)+': '+v+' is outside what '+(T.label||e.type)+' can be');return;}v=canon;}
      out.push({type:e.type,value:v,date:d,label:(T.label||e.type)+': '+(e.type==='weight'?fmtWeight(v):(e.type==='note'?'\u201c'+v+'\u201d':v+(T.unit?' '+T.unit:'')))+(d!==todayISO()?' ('+shortDate(d)+')':'')});});
    return {status:'ok',proposals:out,rejected:rej,source:res.provider+' '+res.model};});}

/* ---- AI-009: a meal \u2192 foods from the database ---- */
var AI_MEAL_SCHEMA={type:'object',properties:{items:{type:'array',maxItems:12,items:{type:'object',properties:{ref:{type:'string',maxLength:80},name:{type:'string',maxLength:80},grams:{type:'number',minimum:1,maximum:3000}},required:['ref','grams']}}},required:['items']};
function aiProposeMeal(text){var r=aiReady('meal');if(!r.ok)return Promise.resolve({status:'refused',note:r.reason});
  return aiRun({system:AI_SYSTEM_BASE+' Turn the meal into foods from the database. Use find_food for each item and use only refs it returns. Estimate grams. Reply with JSON only: {"items":[{"ref":"<ref from find_food>","name":"...","grams":number}]}.',
    user:text,tools:['find_food'],maxTokens:700,maxSteps:6}).then(function(res){var j=_aiJSON(res.text),errs=j?aiCheck(AI_MEAL_SCHEMA,j,'reply'):['the reply was not JSON'];if(errs.length)return {status:'rejected',errors:errs};
    var out=[],rej=[];j.items.forEach(function(it,i){var f=foodByRef(it.ref);if(!f){rej.push('item '+(i+1)+': '+(it.name||it.ref)+' is not a food in the database');return;}var n=normalizeFood(f);
      var kcal=n.per100&&n.per100.kcal!=null?Math.round(n.per100.kcal*it.grams/100):null;out.push({ref:it.ref,name:n.name,grams:Math.round(it.grams),kcal:kcal});});
    return {status:'ok',proposals:out,rejected:rej,source:res.provider+' '+res.model};});}

/* ---- AI-010: a session from the person's own exercise library ---- */
var AI_WORKOUT_SCHEMA={type:'object',properties:{name:{type:'string',maxLength:60},exercises:{type:'array',maxItems:10,items:{type:'object',properties:{exercise:{type:'string',maxLength:80},sets:{type:'number',minimum:1,maximum:10},reps:{type:'number',minimum:1,maximum:30}},required:['exercise','sets','reps']}}},required:['exercises']};
function aiProposeWorkout(request){var r=aiReady('workout');if(!r.ok)return Promise.resolve({status:'refused',note:r.reason});
  return aiRun({system:AI_SYSTEM_BASE+' Suggest one training session. Use list_exercises and use only exercise names it returns. Consider get_state recovery. Reply with JSON only: {"name":"...","exercises":[{"exercise":"<exact name>","sets":n,"reps":n}]}.',
    user:request,tools:['list_exercises','get_state'],maxTokens:700,maxSteps:5}).then(function(res){var j=_aiJSON(res.text),errs=j?aiCheck(AI_WORKOUT_SCHEMA,j,'reply'):['the reply was not JSON'];if(errs.length)return {status:'rejected',errors:errs};
    var names={};EXERCISES.forEach(function(e){names[e.name.toLowerCase()]=e.name;});var out=[],rej=[];
    j.exercises.forEach(function(x,i){var n=names[String(x.exercise).toLowerCase()];if(!n){rej.push('exercise '+(i+1)+': \u201c'+x.exercise+'\u201d is not in your library');return;}out.push({exercise:n,sets:Math.round(x.sets),reps:Math.round(x.reps)});});
    return {status:'ok',name:j.name||'Suggested session',proposals:out,rejected:rej,source:res.provider+' '+res.model};});}
