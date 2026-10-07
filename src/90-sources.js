/* ============================================================================
   SOURCES (integration spec: source identity, deduplication across providers, reliability, deletion).
   Found by test: steps from an iPhone (9,000) and a Fitbit (11,000) on one day were ADDED to 20,000 \u2014 summed types
   were summed across sources, and every import counted as the one source "import", so the provider was lost. Device
   totals (steps, sleep) measured by two sources are one quantity measured twice: one is chosen \u2014 your preferred source
   for the type, else the most complete record \u2014 and the others are kept as alternatives, never discarded. Intake logs
   and cardio sessions are left summed: two logged drinks are two drinks, and two workouts may be two workouts.
   ============================================================================ */
var DEVICE_TOTAL_TYPES={steps:1,sleep:1};
/* sourceKeyOf moved to 65-import.js (engine layer) */
var PROVIDER_NAMES={'apple-health':'Apple Health',applehealth:'Apple Health',fitbit:'Fitbit',withings:'Withings',garmin:'Garmin',oura:'Oura',whoop:'WHOOP','google-fit':'Google Fit','health-connect':'Health Connect',polar:'Polar',strava:'Strava',csv:'CSV file',myfitnesspal:'MyFitnessPal',cronometer:'Cronometer'};
/* _prettyId moved to 65-import.js (engine layer) */
/* sourceLabel moved to 65-import.js (engine layer) */
function sourcePreference(type){return (DB.settings.sourcePreference||{})[type]||null;}
function setSourcePreference(type,key){DB.settings.sourcePreference=Object.assign({},DB.settings.sourcePreference||{});if(key)DB.settings.sourcePreference[type]=key;else delete DB.settings.sourcePreference[type];_memoInvalidate();save('settings');return {status:'ok'};}
/* One day's total for a device-measured type: per-source sums, then one source chosen. */
function pickDayTotal(type,obs){
  var per={};obs.forEach(function(o){var k=sourceKeyOf(o);per[k]=(per[k]||0)+o.value;});var keys=Object.keys(per);
  if(keys.length<2)return {value:keys.length?per[keys[0]]:0,chosen:keys[0]||null,alternatives:[],rule:'one source'};
  var pref=sourcePreference(type),chosen=pref&&per[pref]!=null?pref:keys.sort(function(a,b){return per[b]-per[a];})[0];
  return {value:per[chosen],chosen:chosen,alternatives:keys.filter(function(k){return k!==chosen;}).map(function(k){return {source:k,value:per[k]};}),
    rule:pref&&per[pref]!=null?'your preferred source for '+type:'the most complete record (sources undercount far more often than they overcount)'};
}

/* ---- the overview: what each source contributes, since when, how recently, and how well it agrees ---- */
function sourcesOverview(){
  var S={};(DB.observations||[]).forEach(function(o){if(o.retracted||o.correctedBy)return;var k=sourceKeyOf(o),s=S[k]||(S[k]={key:k,label:sourceLabel(k),count:0,types:{},first:o.date,last:o.date,lastAt:null});
    s.count++;s.types[o.type]=(s.types[o.type]||0)+1;if(o.date<s.first)s.first=o.date;if(o.date>s.last)s.last=o.date;var at=o.createdAt||o.at;if(at&&(!s.lastAt||at>s.lastAt))s.lastAt=at;});
  /* agreement on overlapping days with any other source, per type */
  Object.keys(S).forEach(function(k){var s=S[k],agree=[];Object.keys(s.types).forEach(function(t){var byDay={};(DB.observations||[]).forEach(function(o){if(o.type!==t||o.retracted||o.correctedBy)return;var kk=sourceKeyOf(o);(byDay[o.date]=byDay[o.date]||{})[kk]=((byDay[o.date]||{})[kk]||0)+o.value;});
      var diffs=[];Object.keys(byDay).forEach(function(d){var row=byDay[d];if(row[k]==null)return;Object.keys(row).forEach(function(o2){if(o2!==k&&row[o2])diffs.push(Math.abs(row[k]-row[o2])/Math.max(1e-9,Math.abs(row[o2])));});});
      if(diffs.length>=3)agree.push({type:t,days:diffs.length,medianDifferencePct:round(100*_medianOf(diffs),1)});});
    s.agreement=agree;
    /* its part in the fusion, per measured type (Stage G) */
    s.fusion=Object.keys(s.types).filter(function(t){return !SUM_TYPES[t]&&t!=='bodyfat';}).map(function(t){var SP=_sourceParams(t),p=SP.params[k];if(SP.keys.length<2||!p)return null;
      var W=0;SP.keys.forEach(function(x){var n=SP.params[x].noise;if(n)W+=1/(n*n);});return {type:t,reference:p.reference,bias:p.bias!=null?round(p.bias,2):null,overlap:p.overlap,noise:p.noise!=null?round(p.noise,2):null,share:p.noise&&W?round(1/(p.noise*p.noise)/W,2):null};}).filter(Boolean);
    s.kind=(k.indexOf('import:')===0||(typeof WEARABLE_PROVIDERS!=='undefined'&&WEARABLE_PROVIDERS[k])||(typeof IMPORT_SOURCES!=='undefined'&&IMPORT_SOURCES[k]))?'import':(k==='manual'?'you':(k==='food-log'?'derived':(k==='demo'?'demo':'other')));
    s.deletable=s.kind!=='derived';});
  var ext=[];try{var ws=DB.settings.weatherSync;if(ws)ext.push({key:'open-meteo',label:'Weather ('+((EXTERNAL_SOURCES[DB.settings.weatherProvider||'open-meteo']||{}).name||'Open-Meteo')+')',kind:'connected',lastAt:ws.lastSuccess,state:ws.state,error:ws.error&&ws.error.text,manage:'weather.open'});
    var c=DB.settings.cloud||{};if(c.enabled)ext.push({key:'cloud',label:'Sync server',kind:'connected',lastAt:c.lastSyncAt,state:'enabled',manage:'nav.cloud'});}catch(e){}
  return {status:'ok',sources:Object.keys(S).map(function(k){return S[k];}).sort(function(a,b){return b.count-a.count;}),connections:ext,preferences:DB.settings.sourcePreference||{},
    note:'Deleting a source retracts what it contributed: it leaves the record as corrections do, can be undone, and is kept in the audit log.'};
}
/* ---- delete what a source contributed: preview first; retraction, not erasure ---- */
function deleteSourceData(key,opts){opts=opts||{};if(key==='food-log')return {status:'refused',note:'Food-log totals are derived from your food entries; delete the entries instead.'};
  var list=(DB.observations||[]).filter(function(o){return !o.retracted&&!o.correctedBy&&sourceKeyOf(o)===key;});
  var byType={};list.forEach(function(o){byType[o.type]=(byType[o.type]||0)+1;});
  if(opts.preview||!list.length)return {status:list.length?'preview':'nothing',count:list.length,byType:byType,label:sourceLabel(key)};
  pushUndo('delete data from '+sourceLabel(key));list.forEach(function(o){retractObservation(o.id,'source deleted: '+sourceLabel(key));});
  if(DB.settings.sourcePreference){Object.keys(DB.settings.sourcePreference).forEach(function(t){if(DB.settings.sourcePreference[t]===key)delete DB.settings.sourcePreference[t];});}
  if(typeof auditAppend==='function')auditAppend('source.deleted',{source:key,count:list.length});_memoInvalidate();save('source:delete');
  return {status:'ok',count:list.length,byType:byType,label:sourceLabel(key)};}

/* ---- on screen ---- */
registerAction('sources.open',function(){openSheet('edit',{form:'sources',title:'Your data sources',desc:'',buf:{}});if(typeof loadConnectedServices==='function')loadConnectedServices();});
registerAction('sources.prefer',function(arg){var q=String(arg).split('|');setSourcePreference(q[0],q[1]==='auto'?null:q[1]);renderSheet();renderAll();});
registerAction('sources.deletePreview',function(key){_SHEET.buf.confirmDelete=deleteSourceData(key,{preview:true});_SHEET.buf.confirmKey=key;renderSheet();});
registerAction('sources.deleteConfirm',function(key){var r=deleteSourceData(key);_SHEET.buf.confirmDelete=null;renderSheet();renderAll();toast(r.status==='ok'?('Removed '+r.count+' entries from '+r.label):(r.note||'Nothing to remove'),{undo:r.status==='ok'});});
registerAction('sources.deleteCancel',function(){_SHEET.buf.confirmDelete=null;renderSheet();});
SHEETS.sources=function(b){var O=sourcesOverview(),out='';
  if(b.confirmDelete&&b.confirmDelete.status==='preview'){var c=b.confirmDelete;out+='<div class="banner attention"><span class="banner-text">Remove '+c.count+' entries from '+esc(c.label)+' ('+esc(Object.keys(c.byType).map(function(t){return c.byType[t]+' '+t;}).join(', '))+')? They are retracted like corrections, and Undo brings them back.</span>'+
    uiBtn('Remove them','sources.deleteConfirm',b.confirmKey,'btn-sm btn-primary')+uiBtn('Cancel','sources.deleteCancel',null,'btn-sm btn-ghost')+'</div>';}
  out+='<div class="card-title">Where your record comes from</div>'+O.sources.map(function(s){return '<div class="feat"><div class="feat-body"><b>'+esc(s.label)+'</b> '+uiPill(s.kind,'neutral')+
    '<div class="hint">'+s.count+' entries \u00b7 '+esc(Object.keys(s.types).slice(0,5).map(function(t){return t+' '+s.types[t];}).join(', '))+(Object.keys(s.types).length>5?'\u2026':'')+' \u00b7 '+esc(shortDate(s.first))+' \u2013 '+esc(shortDate(s.last))+'</div>'+
    (s.agreement.length?'<div class="hint">Agreement with other sources: '+esc(s.agreement.map(function(a){return a.type+' typically '+a.medianDifferencePct+'% apart over '+a.days+' shared days';}).join('; '))+'</div>':'')+
    (s.fusion&&s.fusion.length?'<div class="hint">Combined with the others: '+esc(s.fusion.map(function(f){return f.type+(f.reference?' (the reference)':(f.bias!=null?' corrected by '+(f.bias>0?'\u2212':'+')+Math.abs(f.bias)+' from '+f.overlap+' shared days':' not yet corrected (too few shared days)'))+(f.noise!=null?', day-to-day noise '+f.noise:'')+(f.share!=null?', about '+Math.round(f.share*100)+'% of the weight':'');}).join('; '))+'</div>':'')+'</div>'+
    (s.deletable?uiBtn('Remove its data','sources.deletePreview',s.key,'btn-sm btn-ghost'):'')+'</div>';}).join('');
  try{out+=renderConnectedServices(b);}catch(e){_q(e,'P2');}
  if(O.connections.length)out+='<div class="card-title" style="margin-top:12px">Connections</div>'+O.connections.map(function(c){return uiRow(esc(c.label),esc(c.state||''),{sub:(c.lastAt?'last updated '+esc(String(c.lastAt).replace('T',' ').slice(0,16)):'')+(c.error?' \u00b7 '+esc(c.error):'')})+'<div class="btn-row">'+uiBtn('Manage',c.manage,null,'btn-sm btn-ghost')+'</div>';}).join('');
  out+='<div class="card-title" style="margin-top:12px">When two sources measure the same day</div><div class="hint">Steps and sleep from two devices are one quantity measured twice: one source is used. Choose which, or leave it to the most complete record.</div>'+
    Object.keys(DEVICE_TOTAL_TYPES).map(function(t){var keys=O.sources.filter(function(s){return s.types[t];}).map(function(s){return s.key;}),cur=O.preferences[t]||'auto';
      return '<div class="sched-rule"><span>'+esc(t)+'</span><div class="btn-row wrap">'+['auto'].concat(keys).map(function(k){return uiBtn(k==='auto'?'Most complete':sourceLabel(k),'sources.prefer',t+'|'+k,'btn-sm '+(cur===k?'btn-primary':'btn-ghost'));}).join('')+'</div></div>';}).join('')+
    (function(){var F=Object.keys(OBS_TYPES).filter(function(t){return !SUM_TYPES[t]&&t!=='bodyfat'&&O.sources.filter(function(s){return s.types[t];}).length>=2;});if(!F.length)return '';
      return '<div class="hint" style="margin-top:8px">Other measurements from two sources are combined: each put on one reference scale, then weighted by how steady each source is and how well each reading was taken. Choose the reference, or leave it to the source with the most readings.</div>'+
        F.map(function(t){var keys=O.sources.filter(function(s){return s.types[t];}).map(function(s){return s.key;}),cur=O.preferences[t]||'auto';
          return '<div class="sched-rule"><span>'+esc(t)+'</span><div class="btn-row wrap">'+['auto'].concat(keys).map(function(k){return uiBtn(k==='auto'?'Most readings':sourceLabel(k),'sources.prefer',t+'|'+k,'btn-sm '+(cur===k?'btn-primary':'btn-ghost'));}).join('')+'</div></div>';}).join('');})()+
    '<div class="hint" style="margin-top:8px">'+esc(O.note)+'</div>';
  return {body:out,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
