/* ============================================================================
   REGION: INTEGRATION — bringing outside data in without letting it corrupt the record.

   No wearable API is called here and none can be: those need platform credentials and a native context.
   What CAN be built without them is the part that actually determines whether external data is safe to
   accept, and it is the part most apps get wrong:

     * a canonical schema every source is normalised into, designed before any source exists;
     * deduplication, because the same weigh-in arriving from a scale app and a health platform is one fact;
     * source reconciliation, because three devices reporting 178.4, 178.6 and 179.0 is not three observations;
     * provenance, so an imported value never becomes indistinguishable from one you measured.

   File-based importers are implemented in full, because a file needs no credentials: Apple Health export XML,
   Google Takeout / Fitbit CSV, and a generic CSV mapper. An API transport would feed the same pipeline.
   ============================================================================ */
var IMPORT_SOURCES={
  apple_health:{label:'Apple Health export',format:'xml',trust:0.9,note:'the export.xml inside the Health app\u2019s export archive'},
  google_fit:{label:'Google Takeout / Fitbit CSV',format:'csv',trust:0.85,note:'daily aggregate CSV exports'},
  withings:{label:'Withings / smart scale CSV',format:'csv',trust:0.95,note:'per-measurement exports; usually the most accurate weight source'},
  generic_csv:{label:'Generic CSV',format:'csv',trust:0.7,note:'you map the columns'},
  manual:{label:'Entered by hand',format:null,trust:1,note:'what you measured yourself'}
};
/* Canonical observation: every importer produces THIS, never a record shape. Normalisation happens once,
   at the boundary, so nothing downstream needs to know a source existed. */
function canonicalObservation(o){
  return {type:o.type,date:o.date,value:num(o.value),unit:o.unit||null,
    at:o.at||null,source:o.source||'import',sourceDetail:o.sourceDetail||null,
    device:o.device||null,externalId:o.externalId||null,
    trust:o.trust!=null?o.trust:(IMPORT_SOURCES[o.source]||{}).trust||0.7};
}
var IMPORT_UNITS={
  kg:{to:'weight',f:function(v){return kgToLb(v);}},lb:{to:'weight',f:function(v){return v;}},
  cm:{to:'length',f:function(v){return cmToIn(v);}},in:{to:'length',f:function(v){return v;}},
  count:{to:'raw',f:function(v){return v;}},min:{to:'raw',f:function(v){return v;}},
  hr:{to:'raw',f:function(v){return v;}},'%':{to:'raw',f:function(v){return v;}}
};
function normalizeImported(rows,sourceId){
  var out=[],rejected=[];
  (rows||[]).forEach(function(r){
    var type=r.type,value=num(r.value);
    if(!type||value==null||!isValidISO(r.date)){rejected.push({row:r,reason:'missing type, value or a valid date'});return;}
    if(!OBS_TYPES[type]){rejected.push({row:r,reason:'unknown observation type: '+type});return;}
    var u=IMPORT_UNITS[r.unit];
    if(u&&(type==='weight'||['waist','neck','hip','chest','arm','thigh'].indexOf(type)>=0))value=u.f(value);
    var t=OBS_TYPES[type];
    if(!t.text&&(value<t.min*0.5||value>t.max*2)){rejected.push({row:r,reason:'value far outside the plausible range for '+type});return;}
    out.push(canonicalObservation({type:type,date:r.date,value:round(value,2),unit:r.unit,at:r.at,
      source:sourceId,sourceDetail:r.sourceDetail||(IMPORT_SOURCES[sourceId]||{}).label,device:r.device,externalId:r.externalId}));
    /* the row's own method and metadata travel with it (a workout's modality, heart rate, distance) — they were dropped */
    out[out.length-1].method=r.method||null;out[out.length-1].rowMeta=r.meta||null;
  });
  return {observations:out,rejected:rejected,
    note:rejected.length?(rejected.length+' row(s) were refused rather than coerced'):'every row normalised cleanly'};
}
/* ---------- deduplication (§123) ----------
   The same fact arriving twice is one fact. Matching is by external id first (authoritative), then by
   (type, date, near-identical value), which catches the same weigh-in arriving via two paths. */
function dedupeImported(canon){
  /* Note and context observations carry text, not numbers, so the key must not assume a number. */
  var _k=function(type,date,value){return type+'|'+date+'|'+(typeof value==='number'?value.toFixed(2):String(value==null?'':value).slice(0,40));};
  var existingExt={},existingKey={};
  (DB.observations||[]).forEach(function(o){
    if(o.externalId)existingExt[o.externalId]=o;
    existingKey[_k(o.type,o.date,o.value)]=o;
  });
  var fresh=[],dupes=[],withinBatch={};
  canon.forEach(function(c){
    if(c.externalId&&existingExt[c.externalId]){dupes.push({obs:c,reason:'already imported (same external id)'});return;}
    var key=_k(c.type,c.date,c.value);
    if(existingKey[key]){dupes.push({obs:c,reason:'an identical value for that day is already recorded'});return;}
    if(withinBatch[key]){dupes.push({obs:c,reason:'duplicated within this import'});return;}
    /* Near-duplicates: same type and day, value within the noise of the measurement itself. */
    var near=(DB.observations||[]).filter(function(o){return o.type===c.type&&o.date===c.date&&!o.retracted;});
    if(near.length&&c.type==='weight'&&near.some(function(o){return typeof o.value==='number'&&Math.abs(o.value-c.value)<0.15;})){
      dupes.push({obs:c,reason:'within scale noise of an existing entry for that day'});return;}
    withinBatch[key]=1;fresh.push(c);
  });
  return {fresh:fresh,duplicates:dupes,
    note:dupes.length?(dupes.length+' duplicate(s) skipped \u2014 the same measurement arriving twice is one measurement'):'no duplicates'};
}
/* ---------- source reconciliation (§124, §118) ----------
   Three sources reporting a weight for one day is one weight with disagreement, not three observations.
   The reconciled value is trust-weighted; the disagreement is reported rather than hidden, because a
   persistent gap between two sources is itself information about one of them. */
function reconcileDay(type,date){
  var obs=(DB.observations||[]).filter(function(o){return o.type===type&&o.date===date&&_visible(o,asOf());});
  if(obs.length<2)return null;
  var weighted=0,wsum=0;
  obs.forEach(function(o){
    var t=o.trust!=null?o.trust:(o.source==='manual'?1:((IMPORT_SOURCES[o.source]||{}).trust||0.7));
    weighted+=o.value*t;wsum+=t;
  });
  var vals=obs.map(function(o){return o.value;});
  var spread=Math.max.apply(null,vals)-Math.min.apply(null,vals),mid=Math.abs(mean(vals))||1;
  /* judged in the type's own terms: weight keeps its absolute pounds; everything else by relative spread. The first
     version used weight's thresholds and formatter for every type ("steps disagree by 2,000.0 lb"). */
  var isW=type==='weight',rel=spread/mid,agreement=isW?(spread<0.3?'close':(spread<1?'moderate':'poor')):(rel<0.02?'close':(rel<0.08?'moderate':'poor'));
  var unit=((typeof OBS_TYPES!=='undefined'&&OBS_TYPES[type])||{}).unit||'',shown=isW?fmtWeight(spread):(fmtNum(spread,spread>=100?0:1)+(unit?' '+unit:''));
  return {type:type,date:date,sources:obs.map(function(o){return {source:typeof sourceKeyOf==='function'?sourceKeyOf(o):o.source,value:o.value,trust:o.trust!=null?o.trust:1};}),
    reconciled:round(weighted/wsum,2),spread:round(spread,2),relativeSpread:round(rel,3),
    agreement:agreement,
    note:agreement==='poor'?'These sources disagree by '+shown+'. That is a measurement difference, not a change in you \u2014 choose one source and keep it.':'sources agree within normal measurement noise'};
}
function sourceReliability(type,days){
  days=days||90;var from=addDays(asOf(),-days);
  var bySource={};
  var dates={};
  (DB.observations||[]).forEach(function(o){if(o.type!==type||o.date<from||!_visible(o,asOf()))return;(dates[o.date]=dates[o.date]||[]).push(o);});
  Object.keys(dates).forEach(function(d){
    var list=dates[d];if(list.length<2)return;
    var ref=list.filter(function(o){return o.source==='manual';})[0]||list[0];
    list.forEach(function(o){
      if(o===ref)return;
      var s=bySource[o.source]=bySource[o.source]||{source:o.source,n:0,bias:0,absSum:0};
      s.n++;s.bias+=(o.value-ref.value);s.absSum+=Math.abs(o.value-ref.value);
    });
  });
  var rows=Object.keys(bySource).map(function(k){var s=bySource[k];
    return {source:k,n:s.n,bias:round(s.bias/s.n,2),meanAbs:round(s.absSum/s.n,2),
      note:Math.abs(s.bias/s.n)>0.4?('reads '+fmtSigned(s.bias/s.n,1)+' lb against your reference source consistently \u2014 that offset can be corrected for'):'agrees with your reference source'};});
  return {type:type,rows:rows,days:days,cls:'EMPIRICAL',
    note:rows.length?'Learned from days where two sources both reported.':'no overlapping days yet, so no reliability can be estimated'};
}
/* ---------- file importers ---------- */
/* Real Health exports, as found (H3). Proven against a realistic export (tests/fixtures), which showed:
   \u2022 steps recorded by both the iPhone and an Apple Watch for the same walks were summed \u2014 every walk counted twice
     (17,136 read for a true ~8,700); dietary energy written by two food apps likewise (4,420 for 2,210). Sums are now
     kept per source, and each day takes the most complete single source, as the Health app itself shows it;
   \u2022 sleep was never imported: sleep is a category record, and parseFloat("HKCategoryValueSleepAnalysisAsleepCore") is
     NaN, so every night was skipped. Asleep stages (never In bed or Awake) are timed from their start and end, with
     their offsets, and each night belongs to the morning it ended;
   \u2022 body fat arrives as a fraction (0.214) and its declared scale was never applied, so it read as 0.21%;
   \u2022 dietary energy in kJ is converted. */
function _ahkTime(s){var m=String(s||'').match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-])(\d{2})(\d{2})$/);
  return m?Date.parse(m[1]+'T'+m[2]+m[3]+m[4]+':'+m[5]):Date.parse(String(s||'').replace(' ','T'));}
var AHK_ASLEEP=/SleepAnalysis(Asleep|AsleepCore|AsleepDeep|AsleepREM|AsleepUnspecified)$/;
/* Incremental: an export can be hundreds of megabytes, so it is read in slices and each slice's complete records are
   fed here; a record cut by a slice boundary is carried into the next. */
function createAppleHealthParser(){
  var state={rows:[],agg:{},seen:{},carry:''};
  return {feed:function(chunk){var text=state.carry+chunk,cut=text.lastIndexOf('/>');
      if(cut<0){state.carry=text;return;}state.carry=text.slice(cut+2);_ahkParseInto(text.slice(0,cut+2),state);},
    finish:function(){if(state.carry)_ahkParseInto(state.carry,state);return _ahkFinish(state);}};
}
function parseAppleHealthXML(text,opts){var p=createAppleHealthParser();p.feed(String(text||''));return p.finish();}
function _ahkParseInto(text,state){
  var map={HKQuantityTypeIdentifierBodyMass:{type:'weight',unit:'lb'},
    HKQuantityTypeIdentifierBodyFatPercentage:{type:'bodyfat',unit:'%',scale:100},
    HKQuantityTypeIdentifierStepCount:{type:'steps',unit:'count',aggregate:'sum'},
    HKCategoryTypeIdentifierSleepAnalysis:{type:'sleep',unit:'hr',aggregate:'sum',category:true},
    HKQuantityTypeIdentifierRestingHeartRate:{type:'rhr',unit:'count'},   /* the app\u2019s type is rhr; restingHR was refused from every source */
    HKQuantityTypeIdentifierDietaryEnergyConsumed:{type:'calories',unit:'count',aggregate:'sum'},
    HKQuantityTypeIdentifierWaistCircumference:{type:'waist',unit:'in'}};
  var rows=state.rows,agg=state.agg,seen=state.seen;
  var re=/<Record\s([^>]*)\/?>/g,m;
  while((m=re.exec(text))){
    var attrs={},ar=/(\w+)="([^"]*)"/g,a;
    while((a=ar.exec(m[1])))attrs[a[1]]=a[2];
    var def=map[attrs.type];if(!def)continue;
    var src=attrs.sourceName||'unknown source',v,date;
    if(def.category){
      if(!AHK_ASLEEP.test(String(attrs.value||'')))continue;          /* in bed and awake are not sleep */
      var t0=_ahkTime(attrs.startDate),t1=_ahkTime(attrs.endDate);if(!isFinite(t0)||!isFinite(t1)||t1<=t0)continue;
      v=(t1-t0)/3600000;date=String(attrs.endDate||'').slice(0,10);   /* the night belongs to the morning it ended */
    }else{
      date=String(attrs.startDate||'').slice(0,10);v=parseFloat(attrs.value);if(!isFinite(v))continue;
      var unit=(attrs.unit||'').toLowerCase();
      if(def.type==='weight'&&unit==='kg')v=kgToLb(v);
      if(def.type==='weight'&&unit==='g')v=kgToLb(v/1000);
      if(def.type==='waist'&&unit==='cm')v=cmToIn(v);
      if(def.type==='calories'&&unit==='kj')v=v/4.184;
      if(def.scale&&v<=1)v=v*def.scale;                                /* 0.214 means 21.4% */
    }
    if(!isValidISO(date))continue;
    if(def.aggregate==='sum'){var k=def.type+'|'+date+'|'+src;agg[k]=(agg[k]||0)+v;continue;}
    var ek='ahk:'+def.type+':'+date+':'+attrs.startDate+':'+src;if(seen[ek])continue;seen[ek]=1;
    rows.push({type:def.type,date:date,value:round(v,3),unit:null,at:attrs.startDate,device:src,externalId:ek});
  }
}
function _ahkFinish(state){var rows=state.rows,agg=state.agg;
  /* Per day, the most complete single source \u2014 not the sum of devices that saw the same activity. */
  var best={};Object.keys(agg).forEach(function(k){var p=k.split('|'),dk=p[0]+'|'+p[1];
    if(!best[dk]||agg[k]>best[dk].v)best[dk]={v:agg[k],src:p[2],n:(best[dk]?best[dk].n:0)+1};else best[dk].n++;});
  Object.keys(best).forEach(function(dk){var p=dk.split('|'),b=best[dk];
    rows.push({type:p[0],date:p[1],value:round(b.v,2),unit:null,device:b.src,externalId:'ahk:'+p[0]+':'+p[1],
      note:b.n>1?('the most complete of '+b.n+' sources that day ('+b.src+'), not their sum'):null});});
  return {rows:rows,source:'apple_health',
    note:rows.length?(rows.length+' records read from the Health export'):'no recognised records found \u2014 this should be the export.xml from the Health app archive'};
}
function parseGenericCSV(text,mapping){
  mapping=mapping||{};
  var lines=String(text||'').split(/\r?\n/).filter(function(l){return l.trim();});
  if(lines.length<2)return {rows:[],source:'generic_csv',note:'no data rows'};
  var head=lines[0].split(',').map(function(h){return h.trim().toLowerCase().replace(/^"|"$/g,'');});
  var col=function(names){for(var i=0;i<head.length;i++)for(var j=0;j<names.length;j++)if(head[i].indexOf(names[j])>=0)return i;return -1;};
  var iDate=mapping.date!=null?mapping.date:col(['date','day','time']);
  if(iDate<0)return {rows:[],source:'generic_csv',note:'no date column found; headers were: '+head.join(', ')};
  var fields=[['weight',['weight','mass']],['steps',['steps']],['sleep',['sleep','asleep']],
    ['calories',['calorie','kcal','energy']],['protein',['protein']],['bodyfat',['fat %','body fat','bodyfat']],
    ['waist',['waist']],['rhr',['resting heart','resting hr','rhr']]];
  var found=fields.map(function(f){return {type:f[0],idx:mapping[f[0]]!=null?mapping[f[0]]:col(f[1])};}).filter(function(f){return f.idx>=0;});
  if(!found.length)return {rows:[],source:'generic_csv',note:'no recognised measurement columns; headers were: '+head.join(', ')};
  /* Units read from each column's header. A Withings "Weight (kg)" column was read as pounds — 84 kg imported as 84 lb.
     A weight column with no unit follows the person's unit setting, and the import says so. */
  var assumed=[];
  found.forEach(function(f){var h=head[f.idx];
    if(f.type==='weight'){f.conv=/\bkg\b|\(kg\)|kilogram/.test(h)?'kg':(/\blb|\(lb\)|pound/.test(h)?'lb':(mapping.unit||null));
      if(!f.conv){f.conv=unitPref()==='metric'?'kg':'lb';assumed.push('weight in '+(f.conv==='kg'?'kilograms':'pounds')+' (no unit in the header; your unit setting)');}}
    if(f.type==='waist')f.conv=/\bcm\b|\(cm\)/.test(h)?'cm':'in';
    if(f.type==='calories'&&/\bkj\b|\(kj\)|kilojoule/.test(h))f.conv='kj';});
  var rows=[];
  for(var i=1;i<lines.length;i++){
    var cells=lines[i].split(',').map(function(c){return c.trim().replace(/^"|"$/g,'');});
    var date=String(cells[iDate]||'').slice(0,10);
    if(!isValidISO(date))continue;
    found.forEach(function(f){
      var v=parseFloat(cells[f.idx]);if(!isFinite(v))return;
      if(f.conv==='kg')v=kgToLb(v);else if(f.conv==='cm')v=cmToIn(v);else if(f.conv==='kj')v=v/4.184;
      rows.push({type:f.type,date:date,value:round(v,3),unit:null,externalId:'csv:'+f.type+':'+date});
    });
  }
  /* columns keeps its original shape (type names); the units read from the headers are reported separately. */
  var conversions={};found.forEach(function(f){if(f.conv)conversions[f.type]=f.conv;});
  return {rows:rows,source:'generic_csv',columns:found.map(function(f){return f.type;}),conversions:conversions,assumed:assumed,
    note:rows.length+' values read from '+found.length+' recognised column(s)'+(assumed.length?'; assumed '+assumed.join('; '):'')};
}
/* The whole pipeline, as a dry run by default: nothing is written until the user has seen what would be. */
function importObservations(rows,sourceId,opts){
  opts=opts||{};
  var norm=normalizeImported(rows,sourceId);
  var dd=dedupeImported(norm.observations);
  /* RECONCILIATION (H3). Summed quantities — calories, steps, sleep — are added up per day, so an imported day total on
     top of the food log's would count the day twice. Where a day is already recorded, it keeps its record and the import
     skips that day, saying so; the import fills gaps. Averaged measurements (weight, body fat, resting heart rate) keep
     both readings, because the measurement model combines them, and any real disagreement is reported. */
  var overlapSkipped=[];
  dd.fresh=dd.fresh.filter(function(c){
    if(!SUM_TYPES[c.type])return true;
    if(c.externalId&&/:activity:/.test(String(c.externalId)))return true;   /* one activity is not a day total: two workouts on a day both count */
    var ex=(DB.observations||[]).filter(function(o){return o.type===c.type&&o.date===c.date&&_visible(o,asOf());});
    if(ex.length){overlapSkipped.push({type:c.type,date:c.date,existing:ex.reduce(function(a,o){return a+(o.value||0);},0),incoming:c.value,
      existingSource:ex[0].source,note:'already recorded for that day; adding would count the day twice'});return false;}
    return true;});
  var preview={source:sourceId,total:(rows||[]).length,normalised:norm.observations.length,overlapSkipped:overlapSkipped,
    rejected:norm.rejected,duplicates:dd.duplicates.length,fresh:dd.fresh.length,
    byType:{},dateRange:null,conflicts:[]};
  dd.fresh.forEach(function(c){preview.byType[c.type]=(preview.byType[c.type]||0)+1;});
  var dates=dd.fresh.map(function(c){return c.date;}).sort();
  if(dates.length)preview.dateRange=[dates[0],dates[dates.length-1]];
  /* Days where the import disagrees with something already recorded. */
  var byDay={};dd.fresh.forEach(function(c){byDay[c.type+'|'+c.date]=c;});
  Object.keys(byDay).forEach(function(k){
    var c=byDay[k];
    var existing=(DB.observations||[]).filter(function(o){return o.type===c.type&&o.date===c.date&&_visible(o,asOf());});
    var TOL={weight:0.5,bodyfat:1,restingHR:3,waist:0.25};
    if(existing.length&&TOL[c.type]&&existing.some(function(o){return typeof o.value==='number'&&Math.abs(o.value-c.value)>=TOL[c.type];}))
      preview.conflicts.push({type:c.type,date:c.date,existing:existing[0].value,incoming:c.value,
        existingSource:existing[0].source,note:'both will be kept; reconciliation reports the disagreement rather than picking silently'});
  });
  if(opts.dryRun!==false)return Object.assign(preview,{applied:false,
    note:'Nothing was written. '+preview.fresh+' new value(s) would be added'+(preview.duplicates?(', '+preview.duplicates+' duplicate(s) skipped'):'')+(overlapSkipped.length?(', '+overlapSkipped.length+' day total(s) skipped because the day is already recorded'):'')+(preview.rejected.length?(', '+preview.rejected.length+' row(s) refused'):'')+'.'});
  pushUndo('import '+dd.fresh.length+' observations from '+((IMPORT_SOURCES[sourceId]||{}).label||sourceId));
  var added=0;
  dd.fresh.forEach(function(c){
    try{
      var rec=makeObservation({type:c.type,date:c.date,value:c.value,source:'import',method:c.method||undefined,
        note:(IMPORT_SOURCES[sourceId]||{}).label||sourceId,
        meta:Object.assign({},c.rowMeta||{},{importSource:sourceId,device:c.device||null,externalId:c.externalId||null,trust:c.trust})});
      rec.externalId=c.externalId||null;rec.trust=c.trust;
      DB.observations.push(rec);emitEvent('observation.added',rec,{at:rec.createdAt});added++;
    }catch(e){_q(e,'P1');}
  });
  emitEvent('record.imported',{source:sourceId,count:added});
  _memoInvalidate();save('import');
  if(typeof auditAppend==='function')auditAppend('import',{source:sourceId,added:added,duplicates:dd.duplicates.length});
  return Object.assign(preview,{applied:true,added:added,note:added+' value(s) imported, each tagged with where it came from'});
}
/* ---------- barcode (§13) ----------
   The BarcodeDetector API where the browser has it, manual entry where it does not. No third-party scanning
   library: a large opaque dependency inside a CSP-pinned single file is a worse trade than typing digits. */
function barcodeSupported(){return typeof BarcodeDetector!=='undefined';}
function scanBarcode(videoEl){
  if(!barcodeSupported())return Promise.reject(new Error('this browser has no barcode detector; enter the number instead'));
  try{
    var det=new BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e']});
    return det.detect(videoEl).then(function(codes){
      if(!codes||!codes.length)return null;
      return String(codes[0].rawValue||'').replace(/\D/g,'');
    });
  }catch(e){return Promise.reject(e);}
}
/* ---------- photo vault (§21) ----------
   Photos live in IndexedDB as blobs, never in the record document: they would bloat every save and every
   export. The record holds only metadata, so a backup stays small and a photo is never accidentally shared
   by exporting a record. */
var PHOTO_POSES=[{id:'front',label:'Front relaxed'},{id:'side',label:'Side relaxed'},{id:'back',label:'Back relaxed'}];
/* Photos take an as-of date like every other read: one added today must not appear in a replay of an
   earlier day, and one deleted today must not vanish from one. */
function photoMeta(){
  var on=asOf();
  return (DB.settings.photos||[]).filter(function(p){
    if(p.date>on)return false;
    if(p.addedAt&&localDateOf(p.addedAt)>on)return false;
    if(p.removedAt&&localDateOf(p.removedAt)<=on)return false;
    return true;
  }).slice().sort(function(a,b){return a.date<b.date?1:-1;});
}
function addPhoto(file,meta){
  meta=meta||{};
  /* Capture conditions travel with the photo, because a comparison is only worth making when they match. */
  if(meta.view&&typeof PHOTO_VIEWS!=='undefined'&&!PHOTO_VIEWS[meta.view])delete meta.view;
  if(meta.lighting&&typeof LIGHTING_KINDS!=='undefined'&&!LIGHTING_KINDS[meta.lighting])meta.lighting='mixed';
  if(!file)return Promise.reject(new Error('no file'));
  if(!/^image\//.test(file.type||''))return Promise.reject(new Error('that is not an image'));
  var id='photo-'+uid('p');
  /* Downscaled on the device before it is stored. A phone camera easily exceeds the old 8 MB limit, which refused
     the photo outright, and a full-resolution image costs storage without helping a comparison. Where no canvas
     exists the original is kept, under the old limit. */
  return downscaleImage(file,PHOTO_MAX_EDGE,0.85).then(function(img){
    if(!img.scaled&&file.size>8*1024*1024)throw new Error('image is larger than 8 MB and cannot be resized here; photograph at a lower resolution');
    idbWrite('photo:'+id,img.dataUrl);
    /* Held in memory as well: the durable write is debounced, and the gallery asked for the image before it landed,
       so a photo just taken showed as "not found on this device" until the sheet was reopened. */
    _PHOTO_CACHE[id]=img.dataUrl;
    /* The capture conditions are stored. The first version validated view and lighting and then left them out of the
       record, so no two photos could ever be checked for a fair comparison — the thing they are validated for. */
    var view=meta.view||meta.pose||'front';
    DB.settings.photos=(DB.settings.photos||[]).concat([{id:id,date:meta.date||todayISO(),pose:view,view:view,
      lighting:meta.lighting||'mixed',weight:meta.weight!=null?meta.weight:(currentWeight().value),
      bytes:img.bytes,originalBytes:file.size,width:img.width,height:img.height,at:nowISO(),
      note:String(meta.note||'').slice(0,200),source:meta.source||'library'}]);
    save('photo');
    if(typeof auditAppend==='function')auditAppend('photo.added',{id:id,bytes:img.bytes});
    return {id:id,bytes:img.bytes,originalBytes:file.size,scaled:img.scaled,width:img.width,height:img.height};
  });
}
var PHOTO_MAX_EDGE=1600;
function downscaleImage(file,maxEdge,quality){
  var readAsDataUrl=function(){return new Promise(function(res,rej){var fr=new FileReader();
    fr.onload=function(){res(fr.result);};fr.onerror=function(){rej(new Error('the image could not be read'));};fr.readAsDataURL(file);});};
  var canCanvas=typeof document!=='undefined'&&typeof Image!=='undefined'&&(function(){try{return !!document.createElement('canvas').getContext('2d');}catch(e){return false;}})();
  if(!canCanvas)return readAsDataUrl().then(function(u){return {dataUrl:u,bytes:file.size,scaled:false,width:null,height:null};});
  return readAsDataUrl().then(function(src){return new Promise(function(res,rej){
    var im=new Image();
    im.onload=function(){try{
      var w=im.naturalWidth,h=im.naturalHeight,k=Math.min(1,maxEdge/Math.max(w,h));
      var c=document.createElement('canvas');c.width=Math.round(w*k);c.height=Math.round(h*k);
      c.getContext('2d').drawImage(im,0,0,c.width,c.height);   /* browsers apply EXIF orientation to decoded images */
      var out=c.toDataURL('image/jpeg',quality);
      res({dataUrl:out,bytes:Math.round((out.length-out.indexOf(',')-1)*3/4),scaled:true,width:c.width,height:c.height});
    }catch(e){rej(e);}};
    im.onerror=function(){rej(new Error('the image could not be decoded'));};
    im.src=src;});});
}
var _PHOTO_CACHE={};
function loadPhoto(id){if(_PHOTO_CACHE[id])return Promise.resolve(_PHOTO_CACHE[id]);if(!_IDB)return Promise.resolve(null);return idbGet(_IDB,'photo:'+id);}
function deletePhoto(id){
  delete _PHOTO_CACHE[id];
  DB.settings.photos=(DB.settings.photos||[]).filter(function(p){return p.id!==id;});
  try{idbWrite('photo:'+id,'');}catch(e){_q(e,'P2');}
  save('photo:delete');return true;
}
/* Renamed from photoPairs(): the version in 75-gaps.js takes options and adds comparability, and shadowed
   this one entirely. This one pairs by pose for the gallery, which is a different job and now says so. */
function photoPosePairs(){
  /* Same pose, furthest apart in time, for an honest comparison rather than a flattering one. */
  var by={};photoMeta().forEach(function(p){(by[p.pose]=by[p.pose]||[]).push(p);});
  return Object.keys(by).map(function(pose){
    var list=by[pose].slice().sort(function(a,b){return a.date<b.date?-1:1;});
    if(list.length<2)return null;
    var first=list[0],last=list[list.length-1];
    return {pose:pose,label:(PHOTO_POSES.filter(function(x){return x.id===pose;})[0]||{}).label||pose,
      from:first,to:last,days:daysBetween(first.date,last.date),
      weightChange:(first.weight!=null&&last.weight!=null)?round(last.weight-first.weight,1):null};
  }).filter(Boolean);
}
/* ---------- local notifications (§11) ----------
   No push server, and none is claimed. What a browser CAN do is show a notification while it is open, and
   schedule one through the service worker when the page is closing. This is honest about the limit: it is a
   reminder while you have the app, not a guarantee it will reach you. */
function notificationsAvailable(){return typeof Notification!=='undefined';}
function notificationState(){
  if(!notificationsAvailable())return {supported:false,permission:'unavailable',
    note:'This browser does not expose notifications to a web app. Even where it does, without a push server delivery cannot be guaranteed once the app has been closed \u2014 that limitation is real and cannot be coded around.'};
  return {supported:true,permission:Notification.permission,
    note:Notification.permission==='granted'?
      'Reminders can be shown while the app is open or recently used. Without a push server there is no guarantee one arrives when the app has been closed for days \u2014 that limitation is real and cannot be coded around.':
      'Reminders are off. They can be shown while the app is open; they are not a substitute for a push service.'};
}
function requestNotifications(){
  if(!notificationsAvailable())return Promise.resolve('unavailable');
  return Notification.requestPermission().then(function(p){
    DB.settings.notifications=(p==='granted');save('settings');return p;});
}
function notify(title,body,tag){
  if(!notificationsAvailable()||Notification.permission!=='granted')return false;
  try{new Notification(title,{body:body,tag:tag||'physique',icon:'./icons/icon-192.png'});return true;}
  catch(e){_q(e,'P2');return false;}
}
/* Reminders are evaluated when the app runs, and each says why it fired. */
function dueReminders(){
  var out=[];
  try{
    var w=latestObs('weight');
    if(!w||daysBetween(w.date,todayISO())>=2)out.push({id:'weigh',title:'Weigh-in due',
      body:w?('Last weigh-in was '+ageLabel(w.date)+'. The trend interval widens with every missed day.'):'No weigh-in recorded yet.'});
    experimentsDue().forEach(function(e){out.push({id:'exp-'+e.id,title:'Experiment ready to evaluate',
      body:(e.intervention||e.variable)+' reached its recheck date.'});});
    var last=DB.settings.lastBackupAt;
    if(!last||daysBetween(last.slice(0,10),todayISO())>21)out.push({id:'backup',title:'Backup is overdue',
      body:'The export is the only copy of your record you control.'});
  }catch(e){_q(e,'P2');}
  return out;
}
function fireDueReminders(){
  if(!DB.settings.notifications)return {fired:0,reason:'reminders are off'};
  var due=dueReminders();var fired=0;
  var sent=DB.settings.remindersSent||{};
  due.forEach(function(r){
    if(sent[r.id]===todayISO())return;      // once per day per reminder, never a stream
    if(notify(r.title,r.body,r.id)){sent[r.id]=todayISO();fired++;}
  });
  DB.settings.remindersSent=sent;
  if(fired)save('reminders');
  return {fired:fired,due:due.length};
}

/* ============================================================================
   STEP 18: ONE EXPORT/IMPORT REGISTRY (\u00a732)
     export: canonical object \u2192 export adapter \u2192 format
     import: external representation \u2192 parser \u2192 schema validation \u2192 version/migration \u2192 semantic validation \u2192
             canonical object
   Exports were scattered \u2014 backup JSON, a CSV exporter, a calendar file, an appearance export, a report
   exporter \u2014 each with its own shape and none with a version check, and seven things on the actions list had no
   export at all. Every export now carries the same envelope, and every import passes the same stages and reports
   which one stopped it. An import is applied only through the canonical functions that own each object, never
   into interface state.
   ============================================================================ */
var EXPORT_ENVELOPE_PREFIX='physique-os/';
function _envelope(kind,version,data){
  return {kind:EXPORT_ENVELOPE_PREFIX+kind,schemaVersion:version,
    app:{version:(typeof APP_VERSION!=='undefined')?APP_VERSION:null,build:(typeof BUILD_ID!=='undefined')?BUILD_ID:null},
    exportedAt:nowISO(),data:data};
}
function _md(rows,header){
  var esc2=function(v){return String(v==null?'':v).replace(/\|/g,'\\|');};
  return '| '+header.map(esc2).join(' | ')+' |\n|'+header.map(function(){return '---';}).join('|')+'|\n'+
    rows.map(function(r){return '| '+r.map(esc2).join(' | ')+' |';}).join('\n')+'\n';
}
/* a layer above registers its own formats here: the record module calls what is registered, and never names them */
function registerExportAdapter(name,adapter){EXPORT_ADAPTERS[name]=adapter;}
var EXPORT_ADAPTERS={
  /* dashboard, appearance and visualizationPreset are registered by the presentation layer (registerExportAdapter):
     the record module no longer names presentation functions */
  experiment:{version:1,formats:['json','md'],
    object:function(o){var ex=(o&&o.id)?(DB.experiments||[]).filter(function(x){return x.id===o.id;})[0]:(DB.experiments||[])[0];
      return ex?experimentStructure(ex):null;},
    toMarkdown:function(s){return '# Experiment '+s.id+'\n\nPlan version '+s.planVersion+' \u00b7 integrity: '+s.integrity.status+'\n\n'+
      _md(s.stages.map(function(x){return [x.stage,x.defined?x.value:('\u2014 '+(x.note||''))];}),['stage','value']);},
    validate:function(d){var e=[];if(!d||!d.plan)return ['no plan'];
      if(!d.plan.variable)e.push('the plan names no variable');if(!d.plan.hypothesis&&!d.plan.question)e.push('the plan has no hypothesis');return e;},
    /* The plan is registered as a new experiment; results are NOT imported. Results come from this record, and
       importing another record's outcome as this person's would be a false finding. */
    apply:function(d){var ex=createExperiment(Object.assign({},d.plan,{silent:true}));
      return {status:'ok',id:ex.id,note:'The plan was registered as a new experiment. Results are never imported \u2014 they will come from this record.'};}},
  program:{version:1,formats:['json','md','csv'],
    object:function(o){return programStructure((o&&o.weeks)||4);},
    rows:function(ps){var r=[];ps.mesocycles[0].microcycles.forEach(function(m){m.days.forEach(function(d){
      r.push([d.date,d.dow,d.planned?d.planned.label:'',d.planned?d.planned.sets:'',d.completed?d.completed.sets:'',d.status]);});});return r;},
    header:['date','day','planned','planned_sets','sets_done','status']},
  provenance:{version:1,formats:['json'],
    object:function(){var out={};['weight_trend','tdee_personal','weight_forecast','recovery'].forEach(function(id){
      var r=null;try{r=infer({modelId:id});}catch(e){}
      if(r&&r.status==='ok')out[id]={runId:r.runId,asOf:r.asOf,versionVector:r.versionVector,dag:r.provenance};});return out;}},
  data:{version:1,formats:['csv','json','md'],
    object:function(o){return exportCSV((o&&o.kind)||'weight');},
    rawObject:function(o){var k=(o&&o.kind)||'weight';return (DB.observations||[]).filter(function(x){return !x.retracted&&(k==='weight'?x.type==='weight':true);});}}
};
function exportArtifact(kind,format,opts){
  var a=EXPORT_ADAPTERS[kind];
  if(!a)return {status:'unknown-kind',kind:kind};
  format=format||a.formats[0];
  if(a.formats.indexOf(format)<0)return {status:'unsupported-format',kind:kind,format:format,supported:a.formats};
  if(kind==='data'&&format==='csv')return {status:'ok',format:'csv',text:a.object(opts)};
  var obj=kind==='data'?a.rawObject(opts):a.object(opts);
  if(obj==null)return {status:'nothing-to-export',kind:kind};
  if(format==='json')return {status:'ok',format:'json',text:JSON.stringify(_envelope(kind,a.version,obj),null,2)};
  if(format==='md'){
    if(a.toMarkdown)return {status:'ok',format:'md',text:a.toMarkdown(obj)};
    if(a.rows)return {status:'ok',format:'md',text:_md(a.rows(obj),a.header)};
    if(kind==='data')return {status:'ok',format:'md',text:_md(obj.map(function(x){return [x.date,x.type,x.value,x.source||''];}),['date','type','value','source'])};
  }
  if(format==='csv'&&a.rows)return {status:'ok',format:'csv',text:toCSV(a.rows(obj),a.header)};
  return {status:'unsupported-format',kind:kind,format:format};
}
/* Migrations between schema versions, per kind. Version 0 means a file made before envelopes existed. */
var IMPORT_MIGRATIONS={
  appearance:{0:function(raw){var d=Object.assign({},raw);delete d.kind;return d;}}
};
function importArtifact(text){
  var obj;
  try{obj=JSON.parse(String(text||''));}catch(e){return {status:'refused',stage:'parse',note:'Not valid JSON.'};}
  if(!obj||typeof obj!=='object'||Array.isArray(obj))return {status:'refused',stage:'schema',note:'Not an export from this app.'};
  /* A pre-envelope appearance file is recognised and migrated rather than refused. */
  if(obj.kind==='physique-os-appearance'&&obj.schemaVersion==null)obj={kind:EXPORT_ENVELOPE_PREFIX+'appearance',schemaVersion:0,data:obj};
  if(typeof obj.kind!=='string'||obj.kind.indexOf(EXPORT_ENVELOPE_PREFIX)!==0)
    return {status:'refused',stage:'schema',note:'This is not a Physique OS export.'};
  var kind=obj.kind.slice(EXPORT_ENVELOPE_PREFIX.length),a=EXPORT_ADAPTERS[kind];
  if(!a)return {status:'refused',stage:'schema',note:'Unknown export kind "'+kind+'".'};
  if(!a.apply)return {status:'refused',stage:'schema',note:'A '+kind+' export is a read-only representation and cannot be imported.'};
  if(typeof obj.schemaVersion!=='number'||!('data' in obj))return {status:'refused',stage:'schema',note:'The export envelope is incomplete.'};
  /* version compatibility */
  if(obj.schemaVersion>a.version)return {status:'refused',stage:'version',
    note:'This file was made by a newer version of the app (schema '+obj.schemaVersion+'; this build reads up to '+a.version+'). It is refused rather than half-read.'};
  var data=obj.data,migrated=[];
  for(var v=obj.schemaVersion;v<a.version;v++){
    var m=IMPORT_MIGRATIONS[kind]&&IMPORT_MIGRATIONS[kind][v];
    if(!m)return {status:'refused',stage:'version',note:'No migration from '+kind+' schema '+v+' to '+(v+1)+'.'};
    data=m(data);migrated.push(v+'\u2192'+(v+1));
  }
  var errs=a.validate?a.validate(data):[];
  if(errs.length)return {status:'refused',stage:'semantic',errors:errs,note:'The file is well formed but its contents fail validation, so nothing was applied.'};
  var res=a.apply(data);
  return {status:(res&&res.status==='refused')?'refused':'ok',stage:'canonical',kind:kind,migrated:migrated,result:res,
    appVersionNote:(obj.app&&obj.app.version&&typeof APP_VERSION!=='undefined'&&obj.app.version!==APP_VERSION)?
      ('made by app '+obj.app.version+', read by '+APP_VERSION):null};
}
/* ---- visualization export ----
   A chart's colours come from CSS custom properties that exist only inside the app, so an SVG copied out as-is
   renders with invisible lines. Export inlines each element's computed presentation properties. PNG is drawn
   from that SVG where a canvas exists, which is to say in a browser. */
/* visualizationSVG moved to 89-presentation-governance.js (engine layer) */
/* visualizationPNG moved to 89-presentation-governance.js (engine layer) */
/* Every type an importer can emit must be a registered observation type: resting heart rate was emitted as restingHR,
   which does not exist, so every reading from every source was refused. */
var IMPORT_EMITS=['weight','bodyfat','steps','sleep','rhr','calories','waist','protein'];
function importTypesAudit(){var bad=IMPORT_EMITS.filter(function(t){return !OBS_TYPES[t];});return {ok:!bad.length,unknown:bad};}

/* moved from 90-sources.js: an engine function that lived in an interface file */
function sourceKeyOf(o){var m=o&&o.meta||{};if(m.importSource)return 'import:'+m.importSource;if(m.provider)return 'provider:'+m.provider;if(m.device)return 'device:'+m.device;return (o&&o.source)||'unknown';}

/* moved from 90-sources.js: an engine function that lived in an interface file */
function sourceLabel(key){var k=String(key);if(k.indexOf('import:')===0){var id=k.slice(7);return ((typeof IMPORT_SOURCES!=='undefined'&&IMPORT_SOURCES[id])||{}).label||_prettyId(id);}
  if(k.indexOf('provider:')===0||k.indexOf('device:')===0)return _prettyId(k.split(':').slice(1).join(':'));
  var fixed={manual:'You (typed in)',demo:'Demo record','food-log':'Food log (totals)',test:'Test',import:'An import'}[k];if(fixed)return fixed;
  /* a bare provider or import id is the source itself (normalizeImported sets source to it) */
  if(typeof IMPORT_SOURCES!=='undefined'&&IMPORT_SOURCES[k]&&IMPORT_SOURCES[k].label)return IMPORT_SOURCES[k].label;
  if(typeof WEARABLE_PROVIDERS!=='undefined'&&WEARABLE_PROVIDERS[k])return WEARABLE_PROVIDERS[k].label;
  return PROVIDER_NAMES[k]||k;}

/* moved from 90-actions.js: an engine function that lived in an interface file */
function toCSV(rows,header){return [header].concat(rows).map(function(r){return r.map(csvEscape).join(',');}).join('\n')+'\n';}

/* moved from 90-sources.js: an engine function that lived in an interface file */
function _prettyId(id){return PROVIDER_NAMES[id]||String(id).replace(/[-_]+/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase();});}

/* moved from 90-actions.js: an engine function that lived in an interface file */
function exportCSV(kind){
  var rows=[],header=[];var obs=DB.observations.filter(function(o){return !o.retracted;});
  if(kind==='weight'){header=['date','weight_lb','method','source','quality','flags','note','id'];rows=obs.filter(function(o){return o.type==='weight';}).map(function(o){return [o.date,o.value,o.method,o.source,o.quality,(o.flags||[]).join('; '),o.note,o.id];});}
  else if(kind==='nutrition'){header=['date','type','value','unit','source','quality','note'];rows=obs.filter(function(o){return /calories|protein|carbs|fat|fiber|water|adherence|hunger|fullness|cravings|difficulty/.test(o.type);}).map(function(o){return [o.date,o.type,o.value,o.unit,o.source,o.quality,o.note];});}
  else if(kind==='activity'){header=['date','type','value','unit','method','source'];rows=obs.filter(function(o){return /steps|cardio|sleep|sleepq|fatigue|stress|soreness|motivation/.test(o.type);}).map(function(o){return [o.date,o.type,o.value,o.unit,o.method,o.source];});}
  else if(kind==='training'){header=['date','session','exercise','load_lb','reps','rir','e1rm'];DB.sessions.filter(function(s){return !s.retracted;}).forEach(function(s){(s.sets||[]).forEach(function(x){var e=e1rm(x.load,x.reps);rows.push([s.date,s.name,x.exercise,x.load,x.reps,x.rir,e?round(e.value,1):'']);});});}
  else if(kind==='measurements'){header=['date','type','value','unit','method'];rows=obs.filter(function(o){return /waist|neck|hip|chest|arm|thigh|bodyfat|rhr/.test(o.type);}).map(function(o){return [o.date,o.type,o.value,o.unit,o.method];});}
  else if(kind==='predictions'){header=['made','subject','due','point','lo','hi','confidence','actual','error','covered','status','model_version'];rows=DB.predictions.map(function(p){return [p.madeAt,p.subject,p.dueDate,p.point,p.lo,p.hi,p.confidence,p.actual,p.error,p.covered,p.status,p.modelVersion];});}
  else if(kind==='decisions'){header=['date','source','code','verb','confidence','recheck','rules'];rows=DB.decisions.map(function(d){return [d.date,d.source,d.code,d.verb,d.confidence,d.recheckDate,d.rulesVersion];});}
  else if(kind==='experiments'){header=['start','recheck','variable','from','to','prediction','pred_lo','pred_hi','conclusion','confidence','observed'];rows=DB.experiments.map(function(e){return [e.startDate,e.recheckDate,e.variable,e.baselineValue,e.interventionValue,e.prediction,e.predLo,e.predHi,e.conclusion,e.confidence,e.outcome?e.outcome.observed:''];});}
  else if(kind==='observations'){header=['date','type','value','unit','method','source','quality','phase','flags','retracted','supersedes','id'];rows=DB.observations.map(function(o){return [o.date,o.type,o.value,o.unit,o.method,o.source,o.quality,o.phaseId,(o.flags||[]).join('; '),o.retracted?1:0,o.supersedes,o.id];});}
  return toCSV(rows,header);
}
