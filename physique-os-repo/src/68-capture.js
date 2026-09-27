/* ============================================================================
   REGION: CAPTURE — voice, labels, and vendor API shapes.

   Three things the audit listed as needing hardware or credentials. Each splits into a part that needs them
   and a part that does not, and the part that does not is where the actual difficulty lives:

     * Voice: the microphone needs the Web Speech API. Turning "log 180 grams of chicken breast" into a
       structured entry needs a parser, which is pure and fully testable without a microphone.
     * Nutrition labels: reading pixels needs OCR. Turning label TEXT into structured nutrients needs a
       parser — and on iOS the text can come from Live Text with no OCR engine shipped at all.
     * Wearables: the OAuth handshake needs credentials. Normalising each vendor's response shape into the
       canonical schema needs adapters, which are testable against recorded fixtures.

   So the untestable parts are thin wrappers, and everything underneath them is exercised by the suite.
   ============================================================================ */
/* ---------- voice ---------- */
function voiceAvailable(){return typeof window!=='undefined'&&(window.SpeechRecognition||window.webkitSpeechRecognition);}
var VOICE_NUMBERS={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,
  eleven:11,twelve:12,fifteen:15,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,
  ninety:90,hundred:100,'a':1,'an':1,half:0.5,quarter:0.25};
var VOICE_UNITS={gram:'g',grams:'g','g':'g',gramme:'g',grammes:'g',kilogram:'kg',kilograms:'kg',kg:'kg',
  ounce:'oz',ounces:'oz',oz:'oz',pound:'lb',pounds:'lb',lb:'lb',lbs:'lb',
  millilitre:'ml',millilitres:'ml',milliliter:'ml',milliliters:'ml',ml:'ml',
  cup:'cup',cups:'cup',tablespoon:'tbsp',tablespoons:'tbsp',tbsp:'tbsp',
  teaspoon:'tsp',teaspoons:'tsp',tsp:'tsp',serving:'serving',servings:'serving',
  'fluid ounce':'floz','fl oz':'floz'};
function _voiceNumber(tok){
  if(tok==null)return null;
  var n=parseFloat(String(tok).replace(/,/g,''));
  if(isFinite(n))return n;
  return VOICE_NUMBERS[String(tok).toLowerCase()]!=null?VOICE_NUMBERS[String(tok).toLowerCase()]:null;
}
/* Parse an utterance into an INTENT, never straight into a mutation. Voice recognition mishears; a spoken
   number that lands in the record unseen is a silent corruption, so everything here produces a proposal the
   user confirms. */
function parseUtterance(text){
  var raw=String(text||'').trim();
  if(!raw)return {ok:false,reason:'nothing was said'};
  /* Strip punctuation, but never a period or comma sitting between digits: doing so turns 221.4 into
     "221 4" and silently logs 221. A decimal point lost in normalisation is a wrong number in the record. */
  var t=' '+raw.toLowerCase()
    .replace(/(\d),(\d{3})(?!\d)/g,'$1$2')      // 9,400 is nine thousand four hundred, not nine point four
    .replace(/(\d)\.(\d)/g,'$1\u0001$2')        // protect a genuine decimal point before stripping punctuation
    .replace(/[.,!?;:]/g,' ')
    .replace(/\u0001/g,'.')
    .replace(/\s+/g,' ')+' ';
  var out={ok:false,transcript:raw,confirm:true};
  var m;
  /* weight: "log my weight 221.4" / "weigh in at 221 pounds" / "I weigh 100 kilos" */
  if((m=/\b(?:weigh(?:t|ed|s|-in)?|weighing)\b[^0-9]{0,18}([0-9]+(?:\.[0-9]+)?)\s*(kilograms?|kilos?|kg|pounds?|lbs?|lb)?/.exec(t))){
    var v=parseFloat(m[1]);var unit=(m[2]||'').replace(/s$/,'');
    if(/kil|kg/.test(unit))v=kgToLb(v);
    return {ok:true,intent:'observation',type:'weight',value:round(v,1),unit:'lb',
      transcript:raw,confirm:true,say:'Log weight '+fmtWeight(round(v,1))+'?'};
  }
  /* simple numeric observations */
  var simple=[['steps',/\b(?:steps?|walked)\b[^0-9]{0,18}([0-9][0-9,\.]*)\s*(k|thousand)?/],
    ['sleep',/\b(?:slept|sleep)\b[^0-9]{0,18}([0-9]+(?:\.[0-9]+)?)\s*(hours?|hrs?|h)?/],
    ['waist',/\bwaist\b[^0-9]{0,18}([0-9]+(?:\.[0-9]+)?)\s*(cm|centimet\w*|in|inch\w*)?/],
    ['fatigue',/\bfatigue\b[^0-9]{0,18}([0-9]+(?:\.[0-9]+)?)/],
    ['hunger',/\bhunger\b[^0-9]{0,18}([0-9]+(?:\.[0-9]+)?)/],
    ['soreness',/\bsore(?:ness)?\b[^0-9]{0,18}([0-9]+(?:\.[0-9]+)?)/],
    ['stress',/\bstress\b[^0-9]{0,18}([0-9]+(?:\.[0-9]+)?)/]];
  for(var i=0;i<simple.length;i++){
    if((m=simple[i][1].exec(t))){
      var val=parseFloat(String(m[1]).replace(/,/g,''));
      if(simple[i][0]==='steps'&&/k|thousand/.test(m[2]||''))val*=1000;
      if(simple[i][0]==='waist'&&/cm|centim/.test(m[2]||''))val=cmToIn(val);
      if(!OBS_TYPES[simple[i][0]])continue;
      return {ok:true,intent:'observation',type:simple[i][0],value:round(val,2),
        transcript:raw,confirm:true,say:'Log '+(OBS_TYPES[simple[i][0]].label||simple[i][0])+' '+round(val,2)+'?'};
    }
  }
  /* food: "log 180 grams of chicken breast", "two servings of oatmeal for breakfast" */
  /* The unit must be matched from a closed list, or a lazy wildcard swallows it into the food name and
     "180 grams of chicken" becomes a request for a food called "grams of chicken". */
  var UNIT_RE='grams?|g|kilograms?|kg|ounces?|oz|pounds?|lbs?|lb|millilitres?|milliliters?|ml|cups?|tablespoons?|tbsp|teaspoons?|tsp|servings?|fl\\s?oz';
  var foodRe=new RegExp('\\b(?:log|ate|eat|had|add)\\b\\s+(?:([0-9]+(?:\\.[0-9]+)?|a|an|half|one|two|three|four|five|six|seven|eight|nine|ten)\\s*)?(?:('+UNIT_RE+')\\s+)?(?:of\\s+)?([a-z][a-z \'\\-]{2,40}?)\\s*(?:for\\s+(breakfast|lunch|dinner|snacks?))?\\s*$');
  if((m=foodRe.exec(t))){
    var qty=_voiceNumber(m[1]);
    var unitWord=(m[2]||'').trim();
    var unit=VOICE_UNITS[unitWord]||VOICE_UNITS[unitWord.replace(/s$/,'')]||VOICE_UNITS[unitWord.replace(/\s+/g,' ')]||null;
    var food=(m[3]||'').trim();
    /* MEALS are breakfast, lunch, dinner, snacks. Only "snack" needs pluralising; blanket-appending an "s"
       turned "lunch" into "lunchs" and silently dropped the meal. */
    var meal=m[4]?(m[4]==='snack'?'snacks':m[4]):null;
    if(food&&food.length>2){
      var matches=[];try{matches=foodSearchLocal(food,5);}catch(e){_q(e);}
      return {ok:true,intent:'food',query:food,quantity:qty,unit:unit||(qty!=null&&!unitWord?'serving':unit),
        meal:(meal&&MEALS.indexOf(meal)>=0)?meal:null,candidates:matches.map(function(f){return {id:f.id,name:f.name};}),
        transcript:raw,confirm:true,
        say:matches.length?('Log '+(qty!=null?qty+' ':'')+(unit||'')+' '+matches[0].name+'?'):('No local match for "'+food+'" \u2014 search the database?'),
        note:matches.length?null:'nothing matched locally; the branded database needs a text search'};
    }
  }
  /* note */
  if((m=/\b(?:note|remember|log a note)\b\s+(.{3,200})$/.exec(t)))
    return {ok:true,intent:'observation',type:'note',value:m[1].trim(),transcript:raw,confirm:true,
      say:'Save that note?'};
  return {ok:false,transcript:raw,reason:'that did not match anything I can log',
    examples:['weigh 221.4','log 180 grams of chicken breast for lunch','slept 7 and a half hours','steps 9400','note travelling this week']};
}
/* Apply a parsed intent. Separate from parsing, and never called automatically: recognition errors must
   reach a human before they reach the record. */
function applyUtterance(intent,opts){
  opts=opts||{};
  if(!intent||!intent.ok)return {ok:false,reason:'nothing to apply'};
  if(intent.intent==='observation'){
    var rec=addObservation({type:intent.type,date:opts.date||todayISO(),value:intent.value,source:'voice',
      note:'dictated: "'+String(intent.transcript).slice(0,120)+'"'},{silent:opts.silent,noSave:opts.noSave});
    return {ok:true,kind:'observation',record:rec};
  }
  if(intent.intent==='food'){
    var id=opts.foodId||(intent.candidates&&intent.candidates[0]&&intent.candidates[0].id);
    if(!id)return {ok:false,reason:'no food was chosen'};
    var food=localFoods().filter(function(f){return f.id===id;})[0];
    if(!food)return {ok:false,reason:'that food is no longer available'};
    var amount=intent.quantity!=null?intent.quantity:1;
    var unit=intent.unit||'serving';
    var rec2=logFood({date:opts.date||todayISO(),meal:intent.meal||'snacks',food:food,amount:amount,unit:unit,
      source:'voice',silent:opts.silent,noSave:opts.noSave});
    return {ok:true,kind:'food',record:rec2};
  }
  return {ok:false,reason:'unknown intent'};
}
/* VOICE CAPTURE as a state machine (usage review: "the mic starts and nothing happens"). Four defects did that: an error
   reached the sheet as {ok:false} with no transcript and rendered nothing; a recognition that ended without a result
   left "Listening\u2026" on screen for good; the recognition object lived in a local variable, which Chrome may collect
   mid-session so that no event ever arrives; and with interim results off nothing showed until the very end. Now the
   object is held, every stage reports (starting, listening, the words as they are heard, heard, ended), every browser
   error is explained with what to do, and a safety timer stops a session that never ends. */
var _VOICE_REC=null,_VOICE_TIMER=null;
var VOICE_ERRORS={
  'no-speech':'Nothing was heard. Tap Start and speak straight away.',
  'audio-capture':'No sound reached the browser from a microphone. Check which microphone the device is using.',
  'not-allowed':'Microphone access is blocked for this site. Allow it in the browser\u2019s site settings.',
  'service-not-allowed':'This browser does not allow speech recognition here. On iPhone it may not work in an app added to the home screen \u2014 open the app in Safari, or type it below.',
  'network':'Speech recognition needs an internet connection: the browser sends the audio to its speech service (Google, in Chrome) to recognise it.',
  'aborted':'Listening stopped.',
  'language-not-supported':'Speech recognition does not support this device\u2019s language.',
  'bad-grammar':'Speech recognition could not start.'
};
function stopVoiceCapture(){try{if(_VOICE_REC)_VOICE_REC.abort();}catch(e){}_VOICE_REC=null;if(_VOICE_TIMER){clearTimeout(_VOICE_TIMER);_VOICE_TIMER=null;}}
function startVoiceCapture(onUpdate){
  var SR=(typeof window!=='undefined')&&(window.SpeechRecognition||window.webkitSpeechRecognition);
  if(!SR)return {ok:false,reason:'This browser has no speech recognition; type it below instead.'};
  stopVoiceCapture();
  try{
    var r=new SR(),finalDone=false,heardAny=false;_VOICE_REC=r;   /* held: a collected recognition fires nothing */
    r.lang=(typeof navigator!=='undefined'&&navigator.language)||'en-US';
    r.interimResults=true;r.maxAlternatives=3;r.continuous=false;
    var bump=function(){if(_VOICE_TIMER)clearTimeout(_VOICE_TIMER);_VOICE_TIMER=setTimeout(function(){if(!finalDone){try{r.stop();}catch(e){}
      setTimeout(function(){if(!finalDone){finalDone=true;_VOICE_REC=null;onUpdate({phase:'ended',heardAny:heardAny,reason:heardAny?'Listening stopped before a whole phrase was recognised.':'Nothing was heard.'});}},1500);}},12000);};
    r.onstart=function(){bump();onUpdate({phase:'listening'});};
    r.onspeechstart=function(){heardAny=true;bump();onUpdate({phase:'hearing',interim:''});};
    r.onresult=function(ev){bump();var interim='',fin=null;
      for(var i=ev.resultIndex||0;i<ev.results.length;i++){var res=ev.results[i];if(res.isFinal){fin=res;}else interim+=res[0].transcript;}
      if(!fin){heardAny=true;onUpdate({phase:'hearing',interim:interim});return;}
      var alts=[];for(var k=0;k<fin.length&&k<3;k++)alts.push(fin[k].transcript);
      var parsed=parseUtterance(alts[0]);
      /* recognition ranks by acoustics, not by meaning: try the alternatives before giving up */
      if(!parsed.ok)for(var j=1;j<alts.length;j++){var p2=parseUtterance(alts[j]);if(p2.ok){parsed=p2;break;}}
      parsed.alternatives=alts;parsed.phase='heard';finalDone=true;onUpdate(parsed);};
    r.onnomatch=function(){finalDone=true;onUpdate({phase:'ended',heardAny:true,reason:'Something was heard, but no words were recognised. Try again a little closer to the microphone.'});};
    r.onerror=function(ev){var code=ev&&ev.error||'unknown';if(code==='aborted'&&finalDone)return;finalDone=true;
      onUpdate({phase:'error',code:code,reason:VOICE_ERRORS[code]||('Speech recognition failed ('+code+').')});};
    r.onend=function(){if(_VOICE_TIMER){clearTimeout(_VOICE_TIMER);_VOICE_TIMER=null;}_VOICE_REC=null;
      if(!finalDone){finalDone=true;onUpdate({phase:'ended',heardAny:heardAny,reason:heardAny?'Listening ended before a phrase was recognised.':'Nothing was heard. Tap Start and speak straight away.'});}};
    r.start();bump();onUpdate({phase:'starting'});
    return {ok:true,stop:stopVoiceCapture};
  }catch(e){_VOICE_REC=null;return {ok:false,reason:'Speech recognition could not start: '+String(e&&e.message||e)};}
}
/* ---------- nutrition label parsing ----------
   Text in, structured nutrients out. The text can come from anywhere: an OCR engine, the platform's Live
   Text, or a paste. No OCR engine is bundled, because a multi-megabyte opaque dependency inside a
   hash-pinned single file is a worse trade than accepting text from the system that already does it well. */
var LABEL_FIELDS=[
  {key:'kcal',pat:/(?:calories|energy|kcal)\D{0,12}(\d{1,4})/i,unit:'kcal'},
  {key:'protein',pat:/protein\D{0,12}(\d{1,3}(?:\.\d)?)\s*g/i,unit:'g'},
  {key:'carbs',pat:/(?:total\s+)?carbohydrate\D{0,12}(\d{1,3}(?:\.\d)?)\s*g/i,unit:'g'},
  {key:'fat',pat:/(?:total\s+)?fat\D{0,12}(\d{1,3}(?:\.\d)?)\s*g/i,unit:'g'},
  {key:'satfat',pat:/saturated\D{0,14}(\d{1,3}(?:\.\d)?)\s*g/i,unit:'g'},
  {key:'fiber',pat:/(?:dietary\s+)?fib(?:re|er)\D{0,12}(\d{1,3}(?:\.\d)?)\s*g/i,unit:'g'},
  {key:'sugars',pat:/(?:total\s+)?sugars?\D{0,12}(\d{1,3}(?:\.\d)?)\s*g/i,unit:'g'},
  {key:'sodium',pat:/sodium\D{0,12}(\d{1,5})\s*mg/i,unit:'mg'}
];
function parseNutritionLabel(text){
  var t=String(text||'').replace(/\u00a0/g,' ');
  if(!t.trim())return {ok:false,reason:'no text'};
  var per={},found=0;
  LABEL_FIELDS.forEach(function(f){
    var m=f.pat.exec(t);
    if(m){var v=parseFloat(m[1]);if(isFinite(v)){per[f.key]=v;found++;}}
  });
  /* Serving size, and whether the panel is per 100 g (common outside the US) or per serving. */
  var basis='serving',servingG=null,servingMl=null;
  var m100=/per\s*100\s*(g|ml)/i.exec(t);
  if(m100)basis=m100[1].toLowerCase()==='ml'?'ml':'g';
  var ms=/serving size\D{0,20}?(\d{1,4}(?:\.\d)?)\s*(g|ml|oz)/i.exec(t);
  if(ms){var sv=parseFloat(ms[1]);var su=ms[2].toLowerCase();
    if(su==='oz')sv=sv*28.3495;
    if(su==='ml')servingMl=sv;else servingG=sv;}
  if(found===0)return {ok:false,reason:'no nutrition values were recognised in that text',
    hint:'the panel text needs lines like "Calories 240" and "Protein 9g"'};
  /* Sanity: a label whose macros cannot produce its stated calories has been misread. Say so rather than
     saving a plausible-looking wrong food. */
  var warnings=[];
  if(per.kcal!=null&&per.protein!=null&&per.carbs!=null&&per.fat!=null){
    var calc=4*per.protein+4*per.carbs+9*per.fat;
    if(Math.abs(calc-per.kcal)>Math.max(40,per.kcal*0.25))
      warnings.push('the macros imply about '+Math.round(calc)+' kcal but the panel says '+per.kcal+' \u2014 one of the numbers was probably misread');
  }
  ['protein','carbs','fat','fiber','satfat','sugars'].forEach(function(k){
    if(per[k]!=null&&per[k]>100)warnings.push(k+' reads '+per[k]+' g, which is impossible per serving or per 100 g');
  });
  if(per.kcal!=null&&per.kcal>1500)warnings.push('energy reads '+per.kcal+' kcal, which is implausible for one panel');
  return {ok:true,per:per,fieldsFound:found,basis:basis,servingGrams:servingG,servingMl:servingMl,
    warnings:warnings,confirm:true,
    note:'Parsed from text, not verified. Check it against the packet before saving \u2014 a misread digit becomes a wrong food you will keep logging.'};
}
function labelToFood(parsed,name){
  if(!parsed||!parsed.ok)return null;
  var basis=parsed.basis==='ml'?'ml':'g';
  var per=parsed.per;
  var f={name:String(name||'Scanned product').slice(0,80),category:'My foods',basis:basis,source:'USER',
    version:todayISO(),energySource:'label'};
  if(parsed.basis==='serving'&&(parsed.servingGrams||parsed.servingMl)){
    var size=parsed.servingGrams||parsed.servingMl;
    var scale=100/size;var p100={};
    Object.keys(per).forEach(function(k){p100[k]=round(per[k]*scale,2);});
    f.per100=p100;f.basis=parsed.servingMl?'ml':'g';
    if(parsed.servingGrams)f.servingGrams=parsed.servingGrams;else f.servingMl=parsed.servingMl;
    f.perServing=JSON.parse(JSON.stringify(per));
    f.portions=[{label:'1 serving',serving:true}];
    if(parsed.servingGrams)f.portions[0].g=parsed.servingGrams;else f.portions[0].ml=parsed.servingMl;
  }else{
    f.per100=JSON.parse(JSON.stringify(per));
    if(parsed.servingGrams){f.servingGrams=parsed.servingGrams;f.portions=[{label:'1 serving',g:parsed.servingGrams,serving:true}];}
  }
  return normalizeFood(f);
}
/* ---------- wearable API response adapters ----------
   The OAuth handshake needs client credentials that only the person deploying this can supply, so it is a
   thin documented wrapper. The part worth writing and testing is the adapter: each vendor returns a
   different shape, and every one must arrive as the same canonical observation. These are exercised against
   recorded response fixtures in the test suite. */
var WEARABLE_PROVIDERS={
  fitbit:{label:'Fitbit',auth:'oauth2-pkce',authorizeUrl:'https://www.fitbit.com/oauth2/authorize',
    tokenUrl:'https://api.fitbit.com/oauth2/token',scopes:['weight','activity','sleep','nutrition'],
    needs:['a client id from dev.fitbit.com','a registered redirect URI'],
    adapt:function(json){
      var out=[];
      (json['body-weight']||json.weight||[]).forEach(function(r){
        out.push({type:'weight',date:String(r.date||r.dateTime||'').slice(0,10),
          value:r.weight!=null?r.weight:num(r.value),unit:'lb',externalId:'fitbit:weight:'+(r.logId||r.date||r.dateTime)});});
      (json['activities-steps']||[]).forEach(function(r){
        out.push({type:'steps',date:String(r.dateTime||'').slice(0,10),value:num(r.value),unit:'count',
          externalId:'fitbit:steps:'+r.dateTime});});
      (json.sleep||[]).forEach(function(r){
        out.push({type:'sleep',date:String(r.dateOfSleep||'').slice(0,10),
          value:r.minutesAsleep!=null?round(r.minutesAsleep/60,2):null,unit:'hr',
          externalId:'fitbit:sleep:'+(r.logId||r.dateOfSleep)});});
      return out.filter(function(x){return x.date&&x.value!=null;});
    }},
  withings:{label:'Withings',auth:'oauth2',authorizeUrl:'https://account.withings.com/oauth2_user/authorize2',
    tokenUrl:'https://wbsapi.withings.net/v2/oauth2',scopes:['user.metrics'],
    needs:['a client id and secret from the Withings developer portal'],
    adapt:function(json){
      var out=[];var groups=(json.body&&json.body.measuregrps)||[];
      groups.forEach(function(g){
        var date=new Date((g.date||0)*1000).toISOString().slice(0,10);
        (g.measures||[]).forEach(function(m){
          var value=m.value*Math.pow(10,m.unit);
          if(m.type===1)out.push({type:'weight',date:date,value:round(kgToLb(value),2),unit:'lb',externalId:'withings:'+g.grpid+':w'});
          if(m.type===6)out.push({type:'bodyfat',date:date,value:round(value,2),unit:'%',externalId:'withings:'+g.grpid+':bf'});
        });
      });
      return out;
    }},
  oura:{label:'Oura',auth:'oauth2',authorizeUrl:'https://cloud.ouraring.com/oauth/authorize',
    tokenUrl:'https://api.ouraring.com/oauth/token',scopes:['daily'],
    needs:['a personal access token or a registered OAuth client'],
    adapt:function(json){
      var out=[];
      (json.data||[]).forEach(function(r){
        if(r.total_sleep_duration!=null)out.push({type:'sleep',date:String(r.day||'').slice(0,10),
          value:round(r.total_sleep_duration/3600,2),unit:'hr',externalId:'oura:sleep:'+r.id});
        if(r.steps!=null)out.push({type:'steps',date:String(r.day||'').slice(0,10),value:r.steps,unit:'count',
          externalId:'oura:steps:'+r.id});
      });
      return out.filter(function(x){return x.date;});
    }}
};
/* Run a vendor payload through the adapter and then the same import pipeline everything else uses, so an
   API response gets no privileges a file would not. */
function adaptWearablePayload(providerId,json,opts){
  var p=WEARABLE_PROVIDERS[providerId];
  /* Always return the same shape, including on refusal. A function that omits a field when it fails forces
     every caller to guard, and the one that forgets crashes on `.rows.length`. */
  if(!p)return {ok:false,reason:'unknown provider: '+providerId,rows:[],preview:null};
  var rows;
  try{rows=p.adapt(json)||[];}catch(e){return {ok:false,rows:[],preview:null,
    reason:'the response did not match the expected shape: '+String(e&&e.message)};}
  if(!Array.isArray(rows))return {ok:false,rows:[],preview:null,reason:'the adapter did not produce a list'};
  if(!rows.length)return {ok:true,rows:[],preview:null,note:'the response contained no measurements this app tracks'};
  var preview=importObservations(rows,'generic_csv',{dryRun:(opts&&opts.dryRun)!==false});
  return {ok:true,provider:providerId,rows:rows,preview:preview,
    note:'A vendor response is normalised, deduplicated and previewed exactly like a file import \u2014 an API gets no privileges a file would not.'};
}
function wearableSetupInstructions(providerId){
  var p=WEARABLE_PROVIDERS[providerId];
  if(!p)return null;
  return {provider:p.label,auth:p.auth,scopes:p.scopes,needs:p.needs,
    authorizeUrl:p.authorizeUrl,tokenUrl:p.tokenUrl,
    status:'adapter implemented; credentials are not shipped',
    why:'A client id and secret identify the DEPLOYMENT, not the user. They cannot be bundled into a public single-file app without publishing them, so they are supplied by whoever runs it.',
    alternative:'Until then, every one of these vendors exports a file, and file import is fully implemented.'};
}
