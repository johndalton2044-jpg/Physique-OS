/* The AI layer's interface (the layer itself is 97-ai.js). Everything it produces is a proposal: the buttons here,
   pressed by the person, are the only way any of it reaches the record, and they use the ordinary paths. */
function aiToolsCard(){var s=aiSettings(),st=_AI_STATUS;if(!st&&!_AI_STATUS_PENDING)aiServerStatus().then(function(r){if(r&&typeof renderAll==='function')renderAll();});   /* asks once; the answer is cached, so this redraw does not ask again */
  var server=!st?'checking your sync server\u2026':(st.enabled?'your sync server uses '+st.provider+(st.model?' ('+st.model+')':'')+(st.local?', a model on its own network':''):'not available: '+(st.reason||'your sync server has no AI configured (AI_PROVIDER, AI_MODEL, AI_API_KEY)'));
  var body='<div class="hint">Optional. A model can explain your record, turn a sentence into log entries, a meal into foods, or suggest a session. It reads only what its tools show it, and changes nothing: you confirm everything it suggests.</div>'+
    uiRow('Model',esc(server))+uiRow('Status',s.enabled?'on since '+shortDate(String(s.consentAt).slice(0,10)):'off');
  if(s.enabled)body+=Object.keys(AI_CAPABILITIES).map(function(k){return '<div class="feat"><div class="feat-body">'+esc(AI_CAPABILITIES[k])+'</div><button type="button" class="chip'+(s.allow[k]?' active':'')+'" data-act="ai.allow" data-arg="'+k+'" aria-pressed="'+!!s.allow[k]+'">'+(s.allow[k]?'allowed':'off')+'</button></div>';}).join('');
  body+='<div class="btn-row">'+(s.enabled?uiBtn('Turn off','ai.off',null,'btn-sm btn-ghost'):uiBtn('Turn on\u2026','ai.consent',null,'btn-sm btn-secondary'+(st&&st.enabled?'':' disabled')))+'</div>';
  return uiCard({fold:'tools-ai',title:'AI assistant',sub:s.enabled?'on':'off',body:body});}
SHEETS.aiConsent=function(){var st=_AI_STATUS||{};return {body:'<p>When you use it, this app sends to your sync server, which passes on to <b>'+esc(st.provider||'the configured provider')+'</b>'+(st.model?' ('+esc(st.model)+')':'')+':</p>'+
  '<ul><li>what you type (a question, a sentence to log, a meal, the session you want);</li><li>what the model asks to read through its tools: parts of your current state (goal, plan, recent averages), why the plan is what it is, the adaptations on offer, cited evidence, and food and exercise search results.</li></ul>'+
  '<p>It never sends your full history, photos or notes. It cannot change your record: anything it suggests waits for you. The provider\u2019s own terms govern what they keep. You can turn it off at any time.</p>',
  foot:'<button class="btn btn-secondary" data-act="edit.close">Not now</button><button class="btn btn-primary" data-act="ai.enable">Turn on</button>'};};
SHEETS.aiProposals=function(b){var R=b.result||{},kind=b.kind,P=R.proposals||[];b.pick=b.pick||P.map(function(){return true;});
  var out=R.status!=='ok'?'<div class="banner attention">'+esc(R.note||('The model\u2019s answer could not be used: '+(R.errors||[]).join('; ')))+'</div>':
    (P.length?'<div class="hint">'+(kind==='workout'?'A suggested session from your own exercise library. It opens in the session logger for you to adjust and save.':'Nothing is saved until you press the button. Untick anything that is wrong.')+'</div>':'<div class="hint">Nothing in that could be used.</div>')+
    (kind==='workout'?'<div class="card-title">'+esc(R.name||'')+'</div>':'')+
    P.map(function(p,i){var lab=kind==='log'?p.label:(kind==='meal'?p.name+' \u00b7 '+p.grams+' g'+(p.kcal!=null?' \u00b7 '+p.kcal+' kcal':''):p.exercise+' \u00b7 '+p.sets+' \u00d7 '+p.reps);
      return kind==='workout'?uiRow(esc(lab),''):'<div class="feat"><div class="feat-body">'+esc(lab)+'</div><button type="button" class="chip'+(b.pick[i]?' active':'')+'" data-act="ai.pick" data-arg="'+i+'" aria-pressed="'+!!b.pick[i]+'">'+(b.pick[i]?'yes':'no')+'</button></div>';}).join('')+
    ((R.rejected||[]).length?'<div class="hint" style="margin-top:8px">Left out: '+esc(R.rejected.join('; '))+'</div>':'')+(R.source?'<div class="prov">suggested by '+esc(R.source)+', checked against your record</div>':'');
  var go=R.status==='ok'&&P.length?(kind==='workout'?'<button class="btn btn-primary" data-act="ai.applyWorkout">Open in the session logger</button>':'<button class="btn btn-primary" data-act="'+(kind==='log'?'ai.applyLog':'ai.applyMeal')+'">'+(kind==='log'?'Log these':'Log this meal')+'</button>'):'';
  return {body:out,foot:'<button class="btn btn-secondary" data-act="edit.close">Cancel</button>'+go};};
function _aiAsk(kind,title,label,fn){var r=aiReady(kind);if(!r.ok){toast(r.reason);return;}
  promptDialog({title:title,label:label}).then(function(text){if(!text||!String(text).trim())return;toast('Asking the model\u2026');
    fn(String(text).trim()).then(function(res){openSheet('edit',{form:'aiProposals',title:title,desc:'',buf:{kind:kind,result:res}});},
      function(e){openSheet('edit',{form:'aiProposals',title:title,desc:'',buf:{kind:kind,result:{status:'error',note:'The model could not be reached: '+String(e&&e.message||e)}}});});});}
registerAction('ai.consent',function(){aiServerStatus(true).then(function(st){if(!st.enabled){toast('Your sync server has no AI configured');return;}openSheet('edit',{form:'aiConsent',title:'Turn on the AI assistant?',desc:'',buf:{}});});});
registerAction('ai.enable',function(){DB.settings.ai=Object.assign({},DB.settings.ai||{},{enabled:true,consentAt:nowISO(),provider:(_AI_STATUS||{}).provider||null});save('settings');aiAttach();closeSheet();renderAll();toast('AI assistant on');});
registerAction('ai.off',function(){DB.settings.ai=Object.assign({},DB.settings.ai||{},{enabled:false});save('settings');aiAttach();renderAll();toast('AI assistant off');});
registerAction('ai.allow',function(k){var a=Object.assign({},DB.settings.ai||{});a.allow=Object.assign({},aiSettings().allow);a.allow[k]=!a.allow[k];DB.settings.ai=a;save('settings');aiAttach();renderAll();});
registerAction('ai.log',function(){_aiAsk('log','Describe it','For example: weighed 182.4, slept six and a half hours, 9,000 steps',aiProposeLog);});
registerAction('ai.meal',function(){_aiAsk('meal','Describe a meal','For example: two eggs, a slice of toast with butter, a coffee with milk',aiProposeMeal);});
registerAction('ai.workout',function(){_aiAsk('workout','Suggest a session','For example: 45 minutes, upper body, no barbell',aiProposeWorkout);});
registerAction('ai.pick',function(i){var b=_SHEET.buf;b.pick[+i]=!b.pick[+i];renderSheet();});
/* the person's press: through the ordinary owners */
registerAction('ai.applyLog',function(){var b=_SHEET.buf,P=b.result.proposals,n=0;pushUndo('log from a description');
  P.forEach(function(p,i){if(!b.pick[i])return;addObservation({type:p.type,date:p.date,value:p.value,source:'manual',method:'described',meta:{described:true}});n++;});
  _memoInvalidate();closeSheet();renderAll();toast('Logged '+plural(n,'entry','entries'),{undo:true});});
registerAction('ai.applyMeal',function(){var b=_SHEET.buf,P=b.result.proposals,n=0,meal=(typeof mealForNow==='function'?mealForNow():'snacks');
  P.forEach(function(p,i){if(!b.pick[i])return;var f=foodByRef(p.ref);if(!f)return;logFood({date:todayISO(),meal:meal,food:f,amount:p.grams,unit:'g',portionLabel:p.grams+' g'});n++;});
  _memoInvalidate();closeSheet();renderAll();toast('Logged '+plural(n,'food'),{undo:true});});
registerAction('ai.applyWorkout',function(){var R=_SHEET.buf.result;closeSheet();openSession();var b=_SHEET.buf;b.name=R.name||b.name;
  b.sets=[];R.proposals.forEach(function(p){for(var k=0;k<p.sets;k++)b.sets.push({exercise:p.exercise,load:'',reps:p.reps,rir:''});});renderSheet();toast('Add the loads, then save');});
