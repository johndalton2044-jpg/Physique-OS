/* INPUT AUDIT: every input in every sheet, what it feeds, and whether it is connected (from use: "text boxes that don't
   wire to anything"). Each sheet is opened through its own opener on the demo (every quick-log type; the food sheet with
   a food picked). For each input:
     broken  - its action does not exist
     own     - it has its own action (wired through it)
     saved   - it goes through the form setter and the sheet's save path reads it (directly, under the name of a
               function the buffer is handed to, or through a key list read dynamically)
     unwired - it goes through the form setter and nothing that saves the sheet reads it
   Free-text boxes outside names, notes and search are listed as candidates for choices. Broken or unwired fails. */
import fs from 'node:fs';import {JSDOM,VirtualConsole} from 'jsdom';
const dom=new JSDOM(fs.readFileSync('dist/index.html','utf8'),{url:'https://physique.local/app/index.html',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:new VirtualConsole(),
  beforeParse(w){w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.scrollTo=()=>{};w.fetch=undefined;w.HTMLElement.prototype.scrollIntoView=function(){};}});
await new Promise(r=>setTimeout(r,900));const w=dom.window;w.loadDemo();
const __auditFn=function(){
  var forms=Object.keys(SHEETS),openers={},src={};
  Object.keys(ACTIONS).forEach(function(a){try{src['action:'+a]=ACTIONS[a].toString();}catch(e){}});
  Object.keys(window).forEach(function(k){try{if(typeof window[k]==='function'&&/^[a-zA-Z_$][\w$]*$/.test(k)&&k.length<60)src['fn:'+k]=window[k].toString();}catch(e){}});
  forms.forEach(function(f){var re=new RegExp("form:'"+f+"'");Object.keys(src).forEach(function(k){if(re.test(src[k]))(openers[f]=openers[f]||[]).push(k);});});
  var aliases;
  var deep=function(s){var out=s,seen={};(s.match(/\b([a-zA-Z_$][\w$]{2,})\(/g)||[]).forEach(function(m){var n=m.slice(0,-1);if(seen[n]||!src['fn:'+n])return;seen[n]=1;out+='\n'+src['fn:'+n];
      if(s.indexOf(n+'(b)')>=0||s.indexOf(n+'(b,')>=0||s.indexOf(n+'(_SHEET.buf')>=0||s.indexOf(n+'(buf')>=0){var pm=/^function\s*[\w$]*\(\s*([\w$]+)/.exec(src['fn:'+n]);if(pm&&aliases.indexOf(pm[1])<0)aliases.push(pm[1]);}});return out;};
  /* free text that is free by nature: names, notes, searches, colour values, a place, questions, and the research notes of a
     custom experiment or a recorded decision. Anything else typed in is a candidate for choices. */
  var FREE_OK=/^(name|label|title|note|notes|q|query|search|question|hypothesis|reason|why|description|text|message|place|city|pin|passphrase|code|url|address|server|email|objective|successCriteria|prediction|intervention|expected|observed|reasons|verb|rcp_q|libSearch|voiceTyped|expImport|studioHex|stateColor-good|stateColor-attention|stateColor-negative|studioName|studioImport|askInput|labelName|labelText|photoNote|wxPlace|suppQ|fs_q)$/i;
  var NOTE_TYPES={supplement:1,context:1,note:1};   /* the quick log's free field is a note or a catalogue search for these */
  var rows=[],unopened=[],SAVE=/save|apply|create|start|finish|log|add|confirm|done|submit|update|set|use|run|record|import|export|connect/i;
  function collect(f,rootId){var root=document.getElementById(rootId||'editBackdrop')||document.body,saveSrc='';aliases=['b','buf','B'];
    root.querySelectorAll('button[data-act]').forEach(function(b){var a=b.getAttribute('data-act');if(SAVE.test(a)&&src['action:'+a])saveSrc+='\n'+deep(src['action:'+a]);});
    root.querySelectorAll('input,select,textarea').forEach(function(el){var act=el.getAttribute('data-act')||'',arg=el.getAttribute('data-arg')||'',field=arg.split('|')[0],type=el.tagName==='INPUT'?(el.getAttribute('type')||'text'):el.tagName.toLowerCase();
      var free=(type==='text'||type==='search'||type==='textarea')&&!/decimal|numeric/.test(el.getAttribute('inputmode')||'');var st;
      if(!act)st=(el.closest('[data-act]')||type==='hidden'||type==='file')?'own':'no action';
      else if(!ACTIONS[act])st='broken';
      else if(act==='sheet.field'||act==='sheet.scale'){var esc=field.replace(/[$.]/g,'\\$&'),A=aliases.join('|');
        var direct=new RegExp('\\b('+A+'|_SHEET\\.buf)\\.'+esc+'\\b|\\[[\'"]'+esc+'[\'"]\\]').test(saveSrc);
        var dyn=new RegExp('\\b('+A+')\\[[a-zA-Z_$]').test(saveSrc)&&new RegExp('[\'"]'+esc+'[\'"]').test(saveSrc);st=(direct||dyn)?'saved':'unwired';}
      else st='own';
      var noteType=/^log:/.test(f)&&NOTE_TYPES[f.slice(4)];rows.push({sheet:f,field:field||el.id||'',act:act,type:type,status:st,freeText:free&&!noteType&&!FREE_OK.test(field)&&!FREE_OK.test(el.id||'')&&!(f==='session'&&/^\d+$/.test(field))});});}
  var variants={log:LOG_TYPES.map(function(t){return function(){openLog(t[0]);};}),
    foodEdit:[function(){var l=(DB.foodLogs||[]).filter(function(x){return !x.supersededBy&&!x.retracted;})[0];if(l)dispatchAct('food.edit',l.id);}],
    workout:[function(){var P=trainingProgram(),d=null;for(var i=0;i<14;i++){var x=addDays(todayISO(),i),pl=scheduledPlan(x,P);if(pl&&pl.kind==='lift'){d=x;break;}}if(d){_WORKOUT=buildWorkout(d);openSheet('edit',{form:'workout',title:_WORKOUT.label,desc:'',buf:{}});}}],
    attentionItem:[function(){var q=attentionQueue().items.filter(function(i){return !i.act||i.act==='nav.tab';})[0];if(q)dispatchAct('attention.go',q.id);}],
    foodAdd:[function(){dispatchAct('food.add');_FOODSHEET.picked=normalizeFood(seedFoods()[0]);if(typeof prepPortion==='function')prepPortion(_FOODSHEET.picked);renderSheet();}]};
  forms.forEach(function(f){
    if(variants[f]){variants[f].forEach(function(open){try{closeSheet();open();}catch(e){return;}
      /* the quick log is its own kind of sheet, in its own container */
      if(f==='log'){if(_SHEET&&_SHEET.kind==='log'||document.querySelector('#logBackdrop.open,#logBackdrop[aria-hidden="false"]')||(_SHEET&&_SHEET.buf&&_SHEET.buf.type))collect('log:'+_SHEET.buf.type,'logBackdrop');return;}
      if(_SHEET&&_SHEET.opts&&_SHEET.opts.form===f)collect(f);});return;}
    var ops=openers[f]||[],opened=false;
    for(var i=0;i<ops.length&&!opened;i++){try{closeSheet();var k=ops[i];if(k.indexOf('action:')===0)dispatchAct(k.slice(7));else window[k.slice(3)]();opened=!!(_SHEET&&_SHEET.opts&&_SHEET.opts.form===f);}catch(e){}}
    if(!opened){unopened.push(f);return;}collect(f);});
  try{closeSheet();}catch(e){}
  return {rows:rows,unopened:unopened,forms:forms.length};};
const R=w.eval("("+__auditFn.toString()+")()");
const by=s=>R.rows.filter(r=>r.status===s),sheets=[...new Set(R.rows.map(r=>r.sheet))];
const report=['# Input audit','','Every input in every sheet the app can open, and where it goes. Generated by tests/inputs.mjs; do not edit.','',
  '| Status | Count |','|---|---|',...['own','saved','unwired','broken','no action'].map(s=>'| '+s+' | '+by(s).length+' |'),'',
  'Forms covered: '+sheets.length+' (sheets opened: '+(R.forms-R.unopened.length)+' of '+R.forms+(R.unopened.length?'; no opener without arguments: '+R.unopened.join(', '):'')+')','',
  '## Not connected','',...(by('unwired').concat(by('broken'),by('no action')).map(r=>'- **'+r.sheet+'** \u2192 '+r.field+' ('+r.type+', '+r.status+')')),'',
  '## Free-text boxes (candidates for choices)','',...R.rows.filter(r=>r.freeText).map(r=>'- '+r.sheet+' \u2192 '+r.field+' ('+r.status+')'),'',
  '## All inputs','','| Sheet | Field | Type | Status |','|---|---|---|---|',...R.rows.map(r=>'| '+r.sheet+' | '+r.field+' | '+r.type+' | '+r.status+' |')];
fs.mkdirSync('docs/implementation',{recursive:true});fs.writeFileSync('docs/implementation/inputs-report.md',report.join('\n')+'\n');fs.writeFileSync('docs/implementation/inputs-report.json',JSON.stringify(R,null,1));
let failed=0;const line=(ok,msg,d)=>{if(!ok)failed++;console.log('  '+(ok?'pass':'FAIL')+'  '+msg+(d&&!ok?'  \u2014 '+d:''));};
console.log('  '+R.rows.length+' inputs in '+sheets.length+' forms: '+['own','saved','unwired','broken','no action'].map(s=>by(s).length+' '+s).join(', ')+'; '+R.rows.filter(r=>r.freeText).length+' free-text candidates');
line(!by('broken').length,'every input\u2019s action exists',by('broken').map(r=>r.sheet+'.'+r.field).join(', '));
line(!by('unwired').length,'every form field is read by its sheet\u2019s save path',by('unwired').map(r=>r.sheet+'.'+r.field).join(', '));
line(!by('no action').length,'every input has somewhere to go',by('no action').map(r=>r.sheet+'.'+r.field).join(', '));
console.log(failed?failed+' failed':'all passed');w.close();process.exit(failed?1:0);
