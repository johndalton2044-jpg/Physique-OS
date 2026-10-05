/* ============================================================================
   AUTOMATION: quick actions, one-tap actions, smart defaults, carry-forward, templates, pattern-based suggestions,
   contextual and predictive actions, workflow rules and shortcuts \u2014 one layer over the app's existing actions.
   Rules it keeps: nothing writes unseen (every automatic write is announced, undoable and audited); automation only
   runs actions from a small allow-list of safe, reversible ones; smart defaults are suggestions edited before saving and
   never guess food intake; patterns become suggestions a person accepts, never silent changes; nothing runs during
   replay, import or the self-test.
   ============================================================================ */
function _hourNow(){return (typeof _NOW_OVERRIDE!=='undefined'&&_NOW_OVERRIDE)?new Date(_NOW_OVERRIDE).getHours():new Date().getHours();}
function _loggedToday(type){return obsOf(type).some(function(o){return o.date===todayISO();});}

/* ---- SMART DEFAULTS: what to prefill, from this person's own entries, with the reason ---- */
function smartDefault(type){
  var last=function(n){return obsOf(type).slice(-n).map(function(o){return o.value;});};
  if(type==='weight'){var v=last(1);return v.length?{value:v[0],why:'your last weigh-in'}:null;}
  if(type==='sleep'||type==='rhr'){var s=last(14);return s.length>=3?{value:round(_medianOf(s),type==='sleep'?1:0),why:'the middle of your last '+s.length+' entries'}:null;}
  if(type==='water')return {value:0.5,why:'a glass or bottle; adjust if yours differs'};
  if(type==='cardio'){var c=obsOf('cardio').slice(-10);if(c.length<3)return null;var mins=_modeOf(c.map(function(o){return o.value;})),mod=_modeOf(c.map(function(o){return o.method||'walk';}));
    return {value:mins,meta:{modality:mod},why:'your usual '+mod+' of '+mins+' minutes'};}
  if(type==='steps')return null;
  if(/^(calories|protein|carbs|fat|fiber)$/.test(type))return null;   /* intake is never guessed */
  return null;
}
/* _medianOf moved to 10-core.js (engine layer) */
function _modeOf(a){var c={},best=null;a.forEach(function(x){c[x]=(c[x]||0)+1;if(best==null||c[x]>c[best])best=x;});return best;}

/* ---- QUICK ACTIONS: each knows when it is useful (context) and whether one tap finishes it ---- */
var QUICK_ACTIONS={
  'weigh-in':{label:'Weigh in',icon:'scale',act:'log.open',arg:'weight',oneTap:false,when:function(c){return _loggedToday('weight')?null:{score:c.hour<11?0.9:0.4,why:c.hour<11?'mornings are your weigh-in time':'no weigh-in today'};}},
  'supplements':{label:'Log supplements',icon:'pill',act:'supp.logStack',oneTap:true,when:function(){var A=typeof supplementAdherence==='function'?supplementAdherence(1):null;if(!A||A.status!=='ok')return null;var due=A.rows.filter(function(r){return !r.today&&r.due>0;});return due.length?{score:0.7,why:due.length+' due today'}:null;}},
  'water':{label:'+0.5 L water',icon:'drop',act:'qa.water',oneTap:true,when:function(c){return c.hour>=8&&c.hour<=21?{score:0.3,why:'a quick way to keep the hydration count'}:null;}},
  'workout':{label:'Today\u2019s workout',icon:'dumbbell',act:'workout.start',oneTap:false,when:function(){var p=typeof scheduledPlan==='function'&&typeof trainingProgram==='function'?scheduledPlan(todayISO(),trainingProgram()):null;
    var done=(DB.sessions||[]).some(function(s){return s.date===todayISO()&&!s.retracted;});return p&&p.kind==='lift'&&!done?{score:0.8,why:p.label+' is planned today'}:null;}},
  'repeat-meal':{label:'Same as yesterday',icon:'fork',act:'qa.repeatMeal',oneTap:true,when:function(c){var meal=c.hour<10?'breakfast':(c.hour<15?'lunch':(c.hour<21?'dinner':'snacks'));
    var y=foodLogsOn(addDays(todayISO(),-1)).filter(function(l){return l.meal===meal;}),t=foodLogsOn(todayISO()).filter(function(l){return l.meal===meal;});
    return y.length&&!t.length?{score:0.6,why:'yesterday\u2019s '+meal+' ('+y.length+' item'+(y.length===1?'':'s')+')',label:'Yesterday\u2019s '+meal}:null;}},
  'sleep':{label:'Log sleep',icon:'bed',act:'log.open',arg:'sleep',oneTap:false,when:function(c){return !_loggedToday('sleep')&&c.hour<13?{score:0.5,why:'last night is not logged'}:null;}},
  'cardio':{label:'Log cardio',icon:'heart',act:'log.open',arg:'cardio',oneTap:false,when:function(c){var d=smartDefault('cardio');return d&&c.hour>=15?{score:0.25,why:d.why}:null;}},
  'weather':{label:'Weather',icon:'sun',act:'weather.open',oneTap:false,when:function(c){return typeof weatherLocation==='function'&&weatherLocation()&&c.hour<10?{score:0.2,why:'before you head out'}:null;}}
};
/* ---- PREDICTIVE RANKING: context score blended with how often this person uses the action at this hour ---- */
function _actionStats(){return DB.settings.actionStats||(DB.settings.actionStats={});}
function recordActionUse(id){if(!QUICK_ACTIONS[id]&&!/^tpl:/.test(id))return;var S=_actionStats(),s=S[id]||(S[id]={h:new Array(24).fill(0),n:0});s.h[_hourNow()]++;s.n++;}
function quickActions(opts){opts=opts||{};var ctx={hour:opts.hour!=null?opts.hour:_hourNow(),tab:typeof _TAB!=='undefined'?_TAB:null},S=_actionStats(),out=[];
  var hidden=DB.settings.quickHidden||{};
  Object.keys(QUICK_ACTIONS).forEach(function(id){if(hidden[id])return;var q=QUICK_ACTIONS[id],w=q.when(ctx);if(!w)return;
    var st=S[id],use=st&&st.n?(st.h[ctx.hour]+st.h[(ctx.hour+23)%24]+st.h[(ctx.hour+1)%24]+1)/(st.n+8):1/8;   /* Laplace-smoothed use near this hour */
    out.push({id:id,label:w.label||q.label,icon:q.icon,act:q.act,arg:q.arg,oneTap:q.oneTap,why:w.why,score:round(0.7*w.score+0.3*Math.min(1,use*3),3),usedHere:st?st.h[ctx.hour]:0});});
  (DB.settings.templates||[]).forEach(function(t){out.push({id:'tpl:'+t.id,label:t.name,icon:t.kind==='meal'?'fork':'spark',act:'tpl.run',arg:t.id,oneTap:true,why:'your template',score:0.35+0.3*Math.min(1,((S['tpl:'+t.id]||{}).n||0)/10)});});
  return out.sort(function(a,b){return b.score-a.score;}).slice(0,opts.limit||4);
}
registerAction('qa.water',function(){addObservation({type:'water',date:todayISO(),value:0.5,source:'manual',meta:{quick:true}});recordActionUse('water');renderAll();toast('+0.5 L water',{undo:true});});
registerAction('qa.repeatMeal',function(){var h=_hourNow(),meal=h<10?'breakfast':(h<15?'lunch':(h<21?'dinner':'snacks'));var n=repeatMeal(addDays(todayISO(),-1),meal,todayISO());recordActionUse('repeat-meal');renderAll();
  toast(n?('Logged yesterday\u2019s '+meal+' ('+n+' item'+(n===1?'':'s')+')'):'Nothing to repeat',{undo:!!n});});
registerAction('qa.run',function(id){var q=quickActions({limit:99}).filter(function(x){return x.id===id;})[0];if(!q)return;recordActionUse(id.replace(/^tpl:/,'tpl:'));dispatchAct(q.act,q.arg||null);});

/* ---- TEMPLATES: a meal, or a sequence of one-tap actions, replayed through the app's own paths ---- */
function saveMealTemplate(date,meal,name){var logs=foodLogsOn(date).filter(function(l){return l.meal===meal;});if(!logs.length)return {status:'refused',note:'nothing logged for that meal'};
  var t={id:uid('tpl'),kind:'meal',name:name||(meal.charAt(0).toUpperCase()+meal.slice(1)+' ('+shortDate(date)+')'),meal:meal,items:JSON.parse(JSON.stringify(logs)),createdAt:nowISO()};
  DB.settings.templates=(DB.settings.templates||[]).concat([t]);save('settings');return {status:'ok',template:t};}
var TEMPLATE_STEPS={'supp.logStack':'Log supplements','qa.water':'+0.5 L water','workout.start':'Start the workout','weather.open':'Show the weather','nav.tab':'Open a tab'};
function saveActionTemplate(name,steps){steps=(steps||[]).filter(function(s){return TEMPLATE_STEPS[s.act];});if(!steps.length)return {status:'refused',note:'no allowed steps'};
  var t={id:uid('tpl'),kind:'actions',name:name,steps:steps,createdAt:nowISO()};DB.settings.templates=(DB.settings.templates||[]).concat([t]);save('settings');return {status:'ok',template:t};}
function runTemplate(id,date){var t=(DB.settings.templates||[]).filter(function(x){return x.id===id;})[0];if(!t)return {status:'none'};date=date||todayISO();
  if(t.kind==='meal'){pushUndo('template: '+t.name);t.items.forEach(function(l){copyFoodLog(l,date,t.meal);});syncNutritionObservations(date);save('food-log:template');return {status:'ok',logged:t.items.length};}
  var ran=0;t.steps.forEach(function(s){if(TEMPLATE_STEPS[s.act]){dispatchAct(s.act,s.arg||null);ran++;}});return {status:'ok',ran:ran};}
registerAction('tpl.run',function(id){var r=runTemplate(id);recordActionUse('tpl:'+id);renderAll();toast(r.status==='ok'?(r.logged!=null?('Logged '+r.logged+' item'+(r.logged===1?'':'s')):'Done'):'That template is gone',{undo:r.logged>0});});
registerAction('tpl.delete',function(id){DB.settings.templates=(DB.settings.templates||[]).filter(function(t){return t.id!==id;});save('settings');renderAll();if(_SHEET)renderSheet();});
registerAction('tpl.saveMeal',function(arg){var q=String(arg).split('|');var r=saveMealTemplate(q[0],q[1]);if(_SHEET)renderSheet();renderAll();toast(r.status==='ok'?('Saved \u201c'+r.template.name+'\u201d'):r.note);});

/* ---- PATTERNS: habits the record shows, offered as suggestions to accept ---- */
function detectPatterns(){
  var out=[],dismissed=DB.settings.patternsDismissed||{};
  ['breakfast','lunch','dinner','snacks'].forEach(function(meal){var sig={},days=0;for(var i=1;i<=7;i++){var d=addDays(todayISO(),-i),L=foodLogsOn(d).filter(function(l){return l.meal===meal;});if(!L.length)continue;days++;
      var k=L.map(function(l){return typeof foodIdentity==='function'?foodIdentity(l.food):(l.food&&l.food.name);}).sort().join('+');(sig[k]=sig[k]||[]).push(d);}
    Object.keys(sig).forEach(function(k){if(sig[k].length>=4&&!(DB.settings.templates||[]).some(function(t){return t.kind==='meal'&&t.meal===meal;})){var id='meal:'+meal;if(!dismissed[id])
      out.push({id:id,kind:'meal-template',text:'You had the same '+meal+' on '+sig[k].length+' of the last 7 days.',offer:'Save it as a one-tap template',act:'tpl.saveMeal',arg:sig[k][0]+'|'+meal});}});});
  if(typeof supplementIntakes==='function'){var inStack={};(DB.settings.supplementStack||[]).forEach(function(s){inStack[s.id]=1;});var cnt={};
    supplementIntakes(addDays(todayISO(),-6),todayISO()).forEach(function(x){if(x.id&&!inStack[x.id]){cnt[x.id]=cnt[x.id]||{};cnt[x.id][x.date]=1;}});
    Object.keys(cnt).forEach(function(id){var n=Object.keys(cnt[id]).length;if(n>=5&&!dismissed['supp:'+id])out.push({id:'supp:'+id,kind:'regimen',text:'You logged '+SUPPLEMENT_CATALOGUE[id].label+' on '+n+' of the last 7 days.',offer:'Add it to your regimen',act:'supp.add',arg:id});});}
  var w=obsOf('weight').slice(-14),early=w.filter(function(o){var h=o.at?new Date(o.at).getHours():null;return h!=null&&h<10;}).length;
  if(w.length>=7&&early/w.length>=0.8&&!(DB.settings.automations||[]).some(function(r){return r.trigger==='weighIn'&&r.enabled;})&&!dismissed['rule:weighIn'])
    out.push({id:'rule:weighIn',kind:'workflow',text:'You weigh in in the morning on '+Math.round(100*early/w.length)+'% of days.',offer:'After weighing in, show today\u2019s plan',act:'rule.enable',arg:'weighIn|nav.today'});
  return out;
}
registerAction('pattern.accept',function(id){var p=detectPatterns().filter(function(x){return x.id===id;})[0];if(!p)return;dispatchAct(p.act,p.arg);if(_SHEET)renderSheet();renderAll();});
registerAction('pattern.dismiss',function(id){DB.settings.patternsDismissed=Object.assign({},DB.settings.patternsDismissed||{});DB.settings.patternsDismissed[id]=todayISO();save('settings');if(_SHEET)renderSheet();renderAll();});

/* ---- WORKFLOW RULES: when something happens, run one allowed action \u2014 once per rule per day, announced, undoable ---- */
var AUTOMATION_TRIGGERS={workoutFinished:{label:'After a workout is logged',event:'session.added'},weighIn:{label:'After weighing in',event:'observation.added',test:function(e){return e.data&&e.data.type==='weight';}},
  firstMeal:{label:'On the first meal of the day',event:'food.logged',test:function(e){return foodLogsOn(e.data&&e.data.date||todayISO()).length===1;}}};
var AUTOMATION_ACTIONS={'supp.logStack':'log the supplements due','nav.today':'show today\u2019s plan','qa.water':'add 0.5 L of water'};
var AUTOMATION_PRESETS=[{trigger:'workoutFinished',action:'supp.logStack'},{trigger:'firstMeal',action:'supp.logStack'},{trigger:'weighIn',action:'nav.today'}];
function _ruleId(t,a){return t+'|'+a;}
function setAutomation(trigger,action,enabled){if(!AUTOMATION_TRIGGERS[trigger]||!AUTOMATION_ACTIONS[action])return {status:'refused'};var id=_ruleId(trigger,action);
  DB.settings.automations=(DB.settings.automations||[]).filter(function(r){return r.id!==id;}).concat(enabled?[{id:id,trigger:trigger,action:action,enabled:true}]:[]);save('settings');return {status:'ok'};}
var _AUTOMATING=false;
/* Pure matching (testable): the enabled rules this event triggers that have not run today. */
function automationMatches(e,log){log=log||{};return (DB.settings.automations||[]).filter(function(r){if(!r.enabled)return false;var T=AUTOMATION_TRIGGERS[r.trigger];
  return !!T&&T.event===e.type&&(!T.test||T.test(e))&&!log[r.id+'@'+todayISO()];});}
function runAutomationsFor(e){
  if(_AUTOMATING||!e||(typeof _PERSIST_SUSPENDED!=='undefined'&&_PERSIST_SUSPENDED>0))return [];
  var ran=[],log=DB.settings.automationLog||(DB.settings.automationLog={});
  automationMatches(e,log).forEach(function(r){var T=AUTOMATION_TRIGGERS[r.trigger],key=r.id+'@'+todayISO();
    log[key]=nowISO();_AUTOMATING=true;try{dispatchAct(r.action,null);ran.push(r.id);if(typeof auditAppend==='function')auditAppend('automation.ran',{rule:r.id});}finally{_AUTOMATING=false;}
    toast('Automatic: '+AUTOMATION_ACTIONS[r.action]+' ('+T.label.toLowerCase()+')',{undo:r.action!=='nav.today'});});
  Object.keys(log).forEach(function(k){if(k.split('@')[1]<addDays(todayISO(),-14))delete log[k];});
  return ran;
}
function _automationOnEvent(e){if(typeof setTimeout==='function')setTimeout(function(){try{runAutomationsFor(e);}catch(err){_q(err,'P2');}},0);}
registerAction('rule.enable',function(arg){var q=String(arg).split('|');setAutomation(q[0],q[1],true);if(_SHEET)renderSheet();renderAll();toast('Automation on: '+AUTOMATION_TRIGGERS[q[0]].label.toLowerCase()+', '+AUTOMATION_ACTIONS[q[1]]);});
registerAction('rule.toggle',function(arg){var q=String(arg).split('|'),on=(DB.settings.automations||[]).some(function(r){return r.id===_ruleId(q[0],q[1])&&r.enabled;});setAutomation(q[0],q[1],!on);if(_SHEET)renderSheet();});
registerAction('nav.today',function(){switchTab('today');});

/* ---- SHORTCUTS: home-screen shortcuts (?do=...) and Alt+1\u20134 for the top quick actions; an allow-list only ---- */
var SHORTCUT_ACTIONS={'weigh-in':1,'supplements':1,'water':1,'workout':1,'repeat-meal':1,'sleep':1};
function runShortcut(id){if(!SHORTCUT_ACTIONS[id])return {status:'refused',note:'not an allowed shortcut'};var q=QUICK_ACTIONS[id];recordActionUse(id);dispatchAct(q.act,q.arg||null);return {status:'ok'};}
function handleLaunchShortcut(){try{var m=/[?&]do=([a-z-]+)/.exec(window.location.search||'');if(!m)return;var r=runShortcut(m[1]);
  if(window.history&&window.history.replaceState)window.history.replaceState(null,'',window.location.pathname+window.location.hash);if(r.status!=='ok')toast('That shortcut is not available');}catch(e){_q(e,'P2');}}
if(typeof document!=='undefined')document.addEventListener('keydown',function(ev){if(!ev.altKey||ev.ctrlKey||ev.metaKey)return;var n=+ev.key;if(!(n>=1&&n<=4))return;
  var t=ev.target;if(t&&/INPUT|TEXTAREA|SELECT/.test(t.tagName))return;var q=quickActions()[n-1];if(q){ev.preventDefault();dispatchAct('qa.run',q.id);}});

/* ---- ON SCREEN: "Next up" on Today, and the Automation sheet ---- */
function renderNextUp(){var Q=quickActions();if(!Q.length)return '';
  return '<div class="next-up" role="group" aria-label="Next up">'+Q.map(function(q,i){return '<button class="qa-chip" data-act="qa.run" data-arg="'+attrEsc(q.id)+'" title="'+attrEsc(q.why+(i<4?' \u00b7 Alt+'+(i+1):''))+'">'+uiIcon(q.icon,{size:18})+'<span>'+esc(q.label)+'</span>'+(q.oneTap?'':'<span class="qa-more" aria-hidden="true">\u2026</span>')+'</button>';}).join('')+'</div>';}
registerAction('automation.open',function(){openSheet('edit',{form:'automation',title:'Shortcuts and automation',desc:'',buf:{}});});
registerAction('qa.hide',function(id){DB.settings.quickHidden=Object.assign({},DB.settings.quickHidden||{});if(DB.settings.quickHidden[id])delete DB.settings.quickHidden[id];else DB.settings.quickHidden[id]=true;save('settings');renderSheet();renderAll();});
SHEETS.automation=function(){
  var P=detectPatterns(),T=DB.settings.templates||[],R=DB.settings.automations||[],hid=DB.settings.quickHidden||{},out='';
  if(P.length)out+='<div class="card-title">Noticed in your record</div>'+P.map(function(p){return '<div class="feat">'+uiIcon('spark',{size:20})+'<div class="feat-body">'+esc(p.text)+'<div class="btn-row">'+uiBtn(p.offer,'pattern.accept',p.id,'btn-sm btn-primary')+uiBtn('Not useful','pattern.dismiss',p.id,'btn-sm btn-ghost')+'</div></div></div>';}).join('');
  out+='<div class="card-title" style="margin-top:10px">Quick actions</div><div class="hint">Shown on Today when they fit the moment, ranked by when you use them. Alt+1\u20134 runs the top four.</div>'+
    Object.keys(QUICK_ACTIONS).map(function(id){var q=QUICK_ACTIONS[id];return uiRow(uiIcon(q.icon,{size:16})+' '+esc(q.label),q.oneTap?'one tap':'opens a form',{sub:SHORTCUT_ACTIONS[id]?'home-screen shortcut: ?do='+id:''})+'<div class="btn-row">'+uiBtn(hid[id]?'Show on Today':'Hide from Today','qa.hide',id,'btn-sm btn-ghost')+'</div>';}).join('');
  out+='<div class="card-title" style="margin-top:10px">Templates</div>'+(T.length?T.map(function(t){return uiRow(esc(t.name),t.kind==='meal'?(t.items.length+' foods'):(t.steps.length+' steps'))+'<div class="btn-row">'+uiBtn('Run','tpl.run',t.id,'btn-sm btn-secondary')+uiBtn('Delete','tpl.delete',t.id,'btn-sm btn-ghost')+'</div>';}).join(''):'<div class="hint">None yet.</div>')+
    '<div class="btn-row">'+['breakfast','lunch','dinner'].filter(function(m){return foodLogsOn(addDays(todayISO(),-1)).some(function(l){return l.meal===m;});}).map(function(m){return uiBtn('Save yesterday\u2019s '+m,'tpl.saveMeal',addDays(todayISO(),-1)+'|'+m,'btn-sm btn-ghost');}).join('')+'</div>';
  out+='<div class="card-title" style="margin-top:10px">Automations</div><div class="hint">Each runs at most once a day, says what it did, and can be undone.</div>'+
    AUTOMATION_PRESETS.map(function(p){var on=R.some(function(r){return r.id===_ruleId(p.trigger,p.action)&&r.enabled;});return uiRow(esc(AUTOMATION_TRIGGERS[p.trigger].label),esc(AUTOMATION_ACTIONS[p.action]),{})+'<div class="btn-row">'+uiBtn(on?'On \u2014 turn off':'Turn on','rule.toggle',p.trigger+'|'+p.action,'btn-sm '+(on?'btn-primary':'btn-ghost'))+'</div>';}).join('');
  out+='<div class="card-title" style="margin-top:10px">Smart defaults</div><div class="hint">Forms start from your own recent entries (last weight, usual sleep, usual cardio), labelled as suggestions to edit. Food intake is never guessed.</div>';
  return {body:out,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};
};
