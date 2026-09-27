/* ============================================================================
   EXTERNAL SOURCES (integration spec \u00a74\u2013\u00a79, \u00a719\u2013\u00a722, \u00a732, \u00a741)
   One registry for every external source, the canonical environmental variables, pure provider adapters, and the
   canonical ingestion of what they produce. Providers terminate at the adapter boundary: nothing past it knows what
   Open-Meteo, Meteosource or Open Food Facts call anything.

   Transport runs through this app's own server (/v1/ext/...), never straight to a provider: the app's
   Content-Security-Policy is connect-src 'self' so it cannot post the record elsewhere, the Meteosource key must stay
   off the public client, and Open Food Facts asks for an app User-Agent a browser cannot set. With no server, these
   sources are "unavailable" and nothing else is affected.
   ============================================================================ */
var EXT_ADAPTER_VERSION='1.0.0';
var EXT_MATURITY=['planned','registered','fixture-tested','integration-tested','live-capable','production-validated','deprecated'];
var EXT_CATEGORIES=['health platform','wearable','file import','environment','food reference','evidence','geospatial','ai provider'];
var EXT_DESTINATIONS=['observations','sessions','context observations','food entities','evidence'];
var EXTERNAL_SOURCES={};
function registerExternalSource(d){
  if(!d||!d.id)throw new Error('an external source needs an id');
  if(EXTERNAL_SOURCES[d.id])throw new Error('external source registered twice: '+d.id);
  if(EXT_CATEGORIES.indexOf(d.category)<0)throw new Error('unknown category for '+d.id+': '+d.category);
  (d.destinations||[]).forEach(function(x){if(EXT_DESTINATIONS.indexOf(x)<0)throw new Error('unknown destination for '+d.id+': '+x);});
  if(EXT_MATURITY.indexOf(d.status)<0)throw new Error('unknown maturity for '+d.id+': '+d.status);
  EXTERNAL_SOURCES[d.id]=d;return d;
}
registerExternalSource({id:'open-meteo',name:'Open-Meteo',category:'environment',status:'fixture-tested',destinations:['context observations'],
  capabilities:['current','hourly','daily','forecast up to 16 days','recent past up to 92 days','historical (ERA5 reanalysis)','air quality','place search'],
  transports:['server /v1/ext/weather/*'],authentication:{kind:'none',custody:'none'},
  provenancePolicy:'each batch keeps the source, dataset, location (rounded to ~1 km), retrieval time and adapter version; each value is labelled current, forecast, recent past or historical',
  identityPolicy:'a batch is identified by source, dataset and location; a newer forecast supersedes an older forecast; historical ranges are kept',
  syncPolicy:'on request, at most once per 15 minutes (server cache)',retentionPolicy:'re-fetchable context; the latest batch per source, dataset and location is kept',
  terms:'free API for non-commercial use; commercial use needs an Open-Meteo subscription',version:EXT_ADAPTER_VERSION,adapter:'adaptOpenMeteo'});
registerExternalSource({id:'meteosource',name:'Meteosource',category:'environment',status:'fixture-tested',destinations:['context observations'],
  capabilities:['current','hourly','daily'],transports:['server /v1/ext/weather/forecast?provider=meteosource'],
  authentication:{kind:'api key',custody:'server (METEOSOURCE_API_KEY)'},
  provenancePolicy:'as Open-Meteo',identityPolicy:'as Open-Meteo',syncPolicy:'on request, at most once per 15 minutes',retentionPolicy:'as Open-Meteo',
  unsupported:['evapotranspiration','vapour pressure deficit (derived from temperature and humidity instead, and labelled so)','historical (needs the paid time_machine endpoint)','air quality (a separate endpoint)'],
  version:EXT_ADAPTER_VERSION,adapter:'adaptMeteosource'});
registerExternalSource({id:'open-food-facts',name:'Open Food Facts',category:'food reference',status:'fixture-tested',destinations:['food entities'],
  capabilities:['barcode product lookup (API v3, read-only)'],transports:['server /v1/ext/food/off/product'],
  authentication:{kind:'none; identified by a Physique OS User-Agent set by the server',custody:'none'},
  provenancePolicy:'the product keeps its barcode, source, retrieval time, the product\u2019s last-modified time and adapter version, and lists missing nutrients',
  identityPolicy:'resolved by barcode into the existing food identity (gtin:...); the bundled database wins where both have the product, and differences are reported',
  syncPolicy:'on lookup; a looked-up product lives only in what is logged or kept, never in a second food database',retentionPolicy:'none beyond logs and kept foods',
  version:EXT_ADAPTER_VERSION,adapter:'adaptOpenFoodFacts'});
/* The file-import sources and wearable providers were registered in their own tables; they are indexed here so every
   external source is discoverable in one place (integration spec \u00a75), without moving their definitions. */
function externalSources(){
  var out={};Object.keys(EXTERNAL_SOURCES).forEach(function(k){out[k]=EXTERNAL_SOURCES[k];});
  if(typeof IMPORT_SOURCES!=='undefined')Object.keys(IMPORT_SOURCES).forEach(function(k){if(k==='manual')return;out['file:'+k]={id:'file:'+k,name:IMPORT_SOURCES[k].label,category:'file import',status:'integration-tested',destinations:['observations'],capabilities:['file import'],authentication:{kind:'none',custody:'none'}};});
  if(typeof WEARABLE_PROVIDERS!=='undefined')Object.keys(WEARABLE_PROVIDERS).forEach(function(k){out['wearable:'+k]={id:'wearable:'+k,name:WEARABLE_PROVIDERS[k].label,category:'wearable',status:'fixture-tested',destinations:['observations'],capabilities:['api adapter'],authentication:{kind:WEARABLE_PROVIDERS[k].auth,custody:'server or native (not wired)'}};});
  return out;
}
function externalSourceAudit(){
  var S=externalSources(),issues=[];Object.keys(S).forEach(function(k){var d=S[k];
    if(!d.destinations||!d.destinations.length)issues.push(k+': no canonical destination');
    if(!d.capabilities||!d.capabilities.length)issues.push(k+': no capabilities');
    if(d.status==='production-validated'&&!d.productionEvidence)issues.push(k+': called production-validated without evidence');
    if(d.adapter&&typeof window[d.adapter]!=='function'&&typeof globalThis[d.adapter]!=='function')issues.push(k+': adapter '+d.adapter+' does not resolve');});
  return {ok:!issues.length,issues:issues,count:Object.keys(S).length};
}

/* ---- the error taxonomy (spec \u00a741): the UI never needs provider-specific error knowledge ---- */
var EXT_ERRORS=['authentication_required','authorization_denied','rate_limited','network_unavailable','provider_unavailable','malformed_payload',
  'unsupported_record','invalid_unit','invalid_timestamp','conflict','partial_sync','source_deleted','configuration_error'];
var EXT_ERROR_TEXT={network_unavailable:'The server could not reach the source.',provider_unavailable:'The source is having problems; try again later.',
  rate_limited:'The source is limiting requests; try again in a little while.',authorization_denied:'The source refused this server\u2019s credentials.',
  configuration_error:'This needs setting up first.',malformed_payload:'The source sent something unreadable.',unsupported_record:'The source has no such record.',
  authentication_required:'Sign-in is required.',invalid_timestamp:'Those dates are not valid.'};
/* The text is looked up by the MAPPED category. It was looked up by the raw one, so any response without the server's
   error envelope (a static host's HTML 404, an older server's bare {error}) became "Something went wrong." — what a
   person saw when setting a weather place on a deployment with no server attached. */
function extError(category,detail,meta){var cat=EXT_ERRORS.indexOf(category)>=0?category:'provider_unavailable';meta=meta||{};
  var text=meta.text||EXT_ERROR_TEXT[cat]||'The request failed.';
  return {status:'error',error:{category:cat,detail:detail||'',text:text,stage:meta.stage||null,http:meta.http||null}};}
function extServerBase(){try{var c=cloudConfig();return c&&c.url?String(c.url).replace(/\/$/,''):null;}catch(e){return null;}}
/* Every failure is classified by what actually came back, so routing, server, provider and input failures no longer
   collapse into one message (deployment repair plan \u00a710):
     a web page instead of JSON      \u2192 routing: nothing (or the wrong thing) answers at the server path \u2014 no rewrite, or no server
     a proxy error page (502\u2013504)   \u2192 routing: the rewrite exists but the server behind it is not answering
     a JSON 404                      \u2192 server: the server lacks this route (an older version)
     a failed fetch                  \u2192 network: the address could not be reached
     the server's own error envelope \u2192 its category (provider unavailable, rate limited, and so on) */
var EXT_NO_SERVER_TEXT='Weather and online food lookups need the Physique OS server, and none is answering for this app.';
function extRequest(pathQuery){
  var base=extServerBase();if(!base||typeof fetch!=='function')return Promise.resolve(extError('configuration_error','no Physique OS server is configured, so external sources are unavailable here',{stage:'configuration',text:EXT_NO_SERVER_TEXT}));
  return fetch(base+pathQuery,{headers:{accept:'application/json'},cache:'no-store'}).then(function(r){
    var ct=String((r.headers&&r.headers.get&&r.headers.get('content-type'))||'');
    if(!/json/i.test(ct)){
      if(r.status>=502&&r.status<=504)return extError('network_unavailable','the address '+base+' is forwarded, but the server behind it is not answering (HTTP '+r.status+')',{stage:'routing',http:r.status,text:'The Physique OS server is not answering right now.'});
      return extError('configuration_error','the address '+base+' answered with a web page (HTTP '+r.status+'), not the Physique OS server \u2014 the deployment has no rewrite from '+base+' to a running server',{stage:'routing',http:r.status,text:EXT_NO_SERVER_TEXT});}
    return r.json().then(function(j){
      if(j&&j.status==='error'&&j.error&&j.error.category)return extError(j.error.category,j.error.detail,{stage:'server',http:r.status});
      if(!r.ok){
        if(r.status===404)return extError('configuration_error','the server at '+base+' has no '+pathQuery.split('?')[0]+' route \u2014 it may be an older version',{stage:'server',http:404,text:'The Physique OS server is an older version without this feature.'});
        if(r.status===429)return extError('rate_limited','the server is limiting requests',{stage:'server',http:429});
        if(r.status>=500)return extError('provider_unavailable','the server returned '+r.status,{stage:'server',http:r.status});
        return extError('configuration_error',String((j&&j.error)||('HTTP '+r.status)),{stage:'server',http:r.status});}
      return j;},function(){return extError('malformed_payload','the server sent a response that could not be read',{stage:'server',http:r.status});});
  },function(){return extError('network_unavailable','the address '+base+' could not be reached',{stage:'network',text:'The Physique OS server could not be reached.'});});
}
/* ---- DEPLOYMENT: what this app needs from its deployment, and a test of each layer (plan \u00a711, \u00a715) ---- */
function deploymentStatus(){var base=extServerBase();
  return {client:'static',externalServer:'required',syncEndpoint:base,proxyRequired:!!base&&base.charAt(0)==='/',
    weatherRequiresServer:true,foodExternalRequiresServer:true,cloudSyncRequiresServer:true,
    note:'The app is a static site. Weather, online food lookups and cloud sync need the Physique OS server, reached at '+(base||'(none)')+(base&&base.charAt(0)==='/'?' on this same site through a rewrite.':'.')};}
function _rawGet(pathQuery){var base=extServerBase();if(!base)return Promise.resolve({ok:false,reason:'no server path configured'});
  return fetch(base+pathQuery,{headers:{accept:'application/json'},cache:'no-store'}).then(function(r){var ct=String((r.headers&&r.headers.get&&r.headers.get('content-type'))||'');
    if(!/json/i.test(ct))return {ok:false,http:r.status,html:true};return r.json().then(function(j){return {ok:r.ok,http:r.status,json:j};},function(){return {ok:false,http:r.status,unreadable:true};});},
    function(){return {ok:false,network:true};});}
/* The layers in order, stopping at the first that fails, so the answer names the broken one:
   A no server configured \u00b7 B the rewrite is missing \u00b7 C the server is down \u00b7 D the provider is unavailable \u00b7 E the provider sent bad data. */
function testExternalServer(opts){
  opts=opts||{};var steps=[],base=extServerBase(),done=function(verdict,code){return {verdict:verdict,code:code,steps:steps,base:base,at:nowISO()};};
  if(!base)return Promise.resolve(done('No server address is configured for this app.','A'));
  return _rawGet('/v1/health').then(function(h){
    steps.push({step:'server health ('+base+'/v1/health)',ok:!!(h.ok&&h.json&&h.json.ok),detail:h.network?'could not be reached':(h.html?'a web page came back (HTTP '+h.http+'), not the server':(h.json?('HTTP '+h.http+' \u00b7 '+(h.json.service||'')):('HTTP '+h.http)))});
    if(h.network)return done('The address '+base+' could not be reached at all.','C');
    if(h.html&&h.http>=502&&h.http<=504)return done('The rewrite is there, but the server behind it is not answering (HTTP '+h.http+').','C');
    if(h.html)return done('Nothing at '+base+' is the Physique OS server \u2014 this deployment has no rewrite to a running server. Deploy server/server.mjs to a Node host and add the /api/sync rewrite (see DEPLOYMENT.md).','B');
    if(!h.ok)return done('The server answered HTTP '+h.http+' to its health check.','C');
    return _rawGet('/v1/ext/sources').then(function(sx){
      steps.push({step:'external sources on the server',ok:!!(sx.ok&&sx.json&&sx.json.status==='ok'),detail:sx.ok?Object.keys((sx.json&&sx.json.sources)||{}).map(function(k){return k+(sx.json.sources[k].live?'':' (not configured)');}).join(', '):('HTTP '+sx.http+' \u2014 an older server without /v1/ext')});
      if(!sx.ok)return done('The server is running but is an older version without weather and food routes. Update server/server.mjs.','C');
      if(!opts.probeProvider)return done('The server is reachable and offers its external sources.','OK');
      return extRequest('/v1/ext/geocode?name=London').then(function(g){var ok=g.status==='ok'&&g.payload&&Array.isArray(g.payload.results);
        steps.push({step:'a place search through the server (Open-Meteo)',ok:ok,detail:ok?(g.payload.results.length+' places'):((g.error&&(g.error.category+': '+g.error.detail))||'failed')});
        if(ok)return done('Everything works: the server reaches the weather provider.','OK');
        return done(g.error&&g.error.category==='malformed_payload'?'The provider sent something unreadable.':'The server is fine, but it could not reach the weather provider: '+((g.error&&g.error.detail)||'unknown')+'.',g.error&&g.error.category==='malformed_payload'?'E':'D');});
    });
  });
}

/* ---- the canonical environmental variables: stored metric; converted for display only ---- */
var ENV_VARIABLES={
  temperature:{label:'Temperature',unit:'\u00b0C',res:['current','hourly']},apparentTemperature:{label:'Feels like',unit:'\u00b0C',res:['current','hourly']},
  humidity:{label:'Humidity',unit:'%',res:['current','hourly']},precipitation:{label:'Precipitation',unit:'mm',res:['current','hourly']},
  precipitationProbability:{label:'Chance of precipitation',unit:'%',res:['hourly']},cloudCover:{label:'Cloud cover',unit:'%',res:['current','hourly']},
  et0:{label:'Evapotranspiration (ET\u2080)',unit:'mm',res:['hourly']},vpd:{label:'Vapour pressure deficit',unit:'kPa',res:['hourly']},
  windSpeed:{label:'Wind speed',unit:'m/s',res:['current','hourly']},windDirection:{label:'Wind direction',unit:'\u00b0',res:['current','hourly']},
  windGusts:{label:'Wind gusts',unit:'m/s',res:['current','hourly']},uvIndex:{label:'UV index',unit:'',res:['current','hourly']},
  isDay:{label:'Day or night',unit:'',res:['current','hourly']},
  temperatureMax:{label:'Highest temperature',unit:'\u00b0C',res:['daily']},temperatureMin:{label:'Lowest temperature',unit:'\u00b0C',res:['daily']},
  apparentTemperatureMax:{label:'Highest feels-like',unit:'\u00b0C',res:['daily']},apparentTemperatureMin:{label:'Lowest feels-like',unit:'\u00b0C',res:['daily']},
  precipitationSum:{label:'Precipitation total',unit:'mm',res:['daily']},precipitationProbabilityMax:{label:'Highest chance of precipitation',unit:'%',res:['daily']},
  et0Sum:{label:'Evapotranspiration total',unit:'mm',res:['daily']},sunrise:{label:'Sunrise',unit:'time',res:['daily']},sunset:{label:'Sunset',unit:'time',res:['daily']},
  daylightHours:{label:'Daylight',unit:'h',res:['daily']},uvIndexMax:{label:'Highest UV index',unit:'',res:['daily']},
  windSpeedMax:{label:'Strongest wind',unit:'m/s',res:['daily']},windGustsMax:{label:'Strongest gust',unit:'m/s',res:['daily']},windDirectionDominant:{label:'Main wind direction',unit:'\u00b0',res:['daily']},
  pm2_5:{label:'PM2.5',unit:'\u00b5g/m\u00b3',res:['current','hourly'],air:true},pm10:{label:'PM10',unit:'\u00b5g/m\u00b3',res:['current','hourly'],air:true},
  ozone:{label:'Ozone',unit:'\u00b5g/m\u00b3',res:['current','hourly'],air:true},no2:{label:'Nitrogen dioxide',unit:'\u00b5g/m\u00b3',res:['current','hourly'],air:true},
  so2:{label:'Sulphur dioxide',unit:'\u00b5g/m\u00b3',res:['current','hourly'],air:true},co:{label:'Carbon monoxide',unit:'\u00b5g/m\u00b3',res:['current','hourly'],air:true},
  europeanAqi:{label:'European AQI',unit:'',res:['current','hourly'],air:true},usAqi:{label:'US AQI',unit:'',res:['current','hourly'],air:true}
};
var _OM_MAP={temperature_2m:'temperature',relative_humidity_2m:'humidity',apparent_temperature:'apparentTemperature',is_day:'isDay',precipitation:'precipitation',
  precipitation_probability:'precipitationProbability',cloud_cover:'cloudCover',et0_fao_evapotranspiration:'et0',vapour_pressure_deficit:'vpd',wind_speed_10m:'windSpeed',
  wind_direction_10m:'windDirection',wind_gusts_10m:'windGusts',uv_index:'uvIndex',pm2_5:'pm2_5',pm10:'pm10',ozone:'ozone',nitrogen_dioxide:'no2',sulphur_dioxide:'so2',
  carbon_monoxide:'co',european_aqi:'europeanAqi',us_aqi:'usAqi'};
var _OM_DAILY_MAP={temperature_2m_max:'temperatureMax',temperature_2m_min:'temperatureMin',apparent_temperature_max:'apparentTemperatureMax',apparent_temperature_min:'apparentTemperatureMin',
  precipitation_sum:'precipitationSum',precipitation_probability_max:'precipitationProbabilityMax',et0_fao_evapotranspiration:'et0Sum',sunrise:'sunrise',sunset:'sunset',
  daylight_duration:'daylightHours',uv_index_max:'uvIndexMax',wind_speed_10m_max:'windSpeedMax',wind_gusts_10m_max:'windGustsMax',wind_direction_10m_dominant:'windDirectionDominant'};
var _OM_UNITS={'\u00b0C':'\u00b0C','%':'%','mm':'mm','kPa':'kPa','m/s':'m/s','\u00b0':'\u00b0','':'','iso8601':'time','s':'s','\u03bcg/m\u00b3':'\u00b5g/m\u00b3','\u00b5g/m\u00b3':'\u00b5g/m\u00b3','EAQI':'','USAQI':''};
function _envKind(dataset,localTime,retrievedLocal){if(dataset==='archive')return 'historical';return localTime<retrievedLocal?'recent past':'forecast';}
function _localNow(retrievedAt,offsetSec){var t=Date.parse(retrievedAt)+(offsetSec||0)*1000;return new Date(t).toISOString().slice(0,16);}

/* ---- ADAPTER: Open-Meteo (forecast, archive, air quality) \u2014 parsing and unit mapping only ---- */
function adaptOpenMeteo(payload,meta){
  meta=meta||{};var p=payload||{};
  if(typeof p!=='object'||(!p.hourly&&!p.daily&&!p.current))return extError('malformed_payload','no current, hourly or daily section');
  var off=typeof p.utc_offset_seconds==='number'?p.utc_offset_seconds:0,dataset=meta.dataset||'forecast',retrievedAt=meta.retrievedAt||nowISO();
  var nowLocal=_localNow(retrievedAt,off),badUnits=[];
  var checkUnits=function(units,map){Object.keys(units||{}).forEach(function(k){if(k==='time'||k==='interval'||!map[k])return;var u=units[k];if(_OM_UNITS[u]==null)badUnits.push(k+' in '+u);});};
  checkUnits(p.hourly_units,_OM_MAP);checkUnits(p.current_units,_OM_MAP);checkUnits(p.daily_units,_OM_DAILY_MAP);
  if(badUnits.length)return extError('invalid_unit','unexpected units: '+badUnits.join(', '));
  var batch={id:'env:open-meteo:'+dataset+':'+round(p.latitude,2)+','+round(p.longitude,2)+(dataset==='archive'&&p.daily&&p.daily.time?(':'+p.daily.time[0]+'..'+p.daily.time[p.daily.time.length-1]):''),
    source:'open-meteo',dataset:dataset,location:{lat:round(p.latitude,2),lon:round(p.longitude,2),label:meta.label||null},timezone:p.timezone||'UTC',utcOffsetSeconds:off,
    retrievedAt:retrievedAt,adapterVersion:EXT_ADAPTER_VERSION,current:null,hourly:null,daily:null,unsupported:[],unknownFields:[]};
  if(p.current){var cv={};Object.keys(p.current).forEach(function(k){if(k==='time'||k==='interval')return;var id=_OM_MAP[k];if(!id){batch.unknownFields.push(k);return;}cv[id]=p.current[k];});
    batch.current={time:p.current.time,kind:'current',values:cv};}
  if(p.hourly&&p.hourly.time){var hv={};Object.keys(p.hourly).forEach(function(k){if(k==='time')return;var id=_OM_MAP[k];if(!id){batch.unknownFields.push(k);return;}
      if(p.hourly[k].length!==p.hourly.time.length)throw new Error('ragged');hv[id]=p.hourly[k].slice();});
    batch.hourly={times:p.hourly.time.slice(),kinds:p.hourly.time.map(function(t){return _envKind(dataset,t,nowLocal);}),values:hv};}
  if(p.daily&&p.daily.time){var dv={};Object.keys(p.daily).forEach(function(k){if(k==='time')return;var id=_OM_DAILY_MAP[k];if(!id){batch.unknownFields.push(k);return;}
      var arr=p.daily[k].slice();if(id==='daylightHours')arr=arr.map(function(s){return s==null?null:round(s/3600,2);});   /* seconds \u2192 hours */
      if(id==='sunrise'||id==='sunset')arr=arr.map(function(s){return s?String(s).slice(11,16):null;});
      dv[id]=arr;});
    batch.daily={dates:p.daily.time.slice(),kinds:p.daily.time.map(function(d){return dataset==='archive'?'historical':(d<nowLocal.slice(0,10)?'recent past':'forecast');}),values:dv};}
  var provided={};['current','hourly','daily'].forEach(function(r){if(batch[r])Object.keys(batch[r].values).forEach(function(v){provided[v]=1;});});
  (meta.requested||[]).forEach(function(v){if(!provided[v])batch.unsupported.push(v);});
  return {status:'ok',batch:batch};
}
/* ---- ADAPTER: Meteosource /point (metric units requested, UTC timezone) ---- */
function adaptMeteosource(payload,meta){
  meta=meta||{};var p=payload||{};if(!p.current&&!p.hourly&&!p.daily)return extError('malformed_payload','no current, hourly or daily section');
  if(p.units&&p.units!=='metric')return extError('invalid_unit','expected metric units, got '+p.units);
  var num2=function(x){return typeof x==='number'?x:null;},retrievedAt=meta.retrievedAt||nowISO();
  var lat=meta.lat!=null?meta.lat:parseFloat(p.lat)*(/S/.test(String(p.lat))?-1:1),lon=meta.lon!=null?meta.lon:parseFloat(p.lon)*(/W/.test(String(p.lon))?-1:1);
  var nowUtc=retrievedAt.slice(0,16);
  var batch={id:'env:meteosource:forecast:'+round(lat,2)+','+round(lon,2),source:'meteosource',dataset:'forecast',location:{lat:round(lat,2),lon:round(lon,2),label:meta.label||null},
    timezone:'UTC',utcOffsetSeconds:0,retrievedAt:retrievedAt,adapterVersion:EXT_ADAPTER_VERSION,current:null,hourly:null,daily:null,
    unsupported:['et0','et0Sum','uvIndexMax','windGustsMax','apparentTemperatureMax','apparentTemperatureMin','precipitationProbabilityMax'],derived:[],unknownFields:[]};
  var one=function(x){var w=x.wind||{},pr=x.precipitation||{},cc=x.cloud_cover;
    return {temperature:num2(x.temperature),apparentTemperature:num2(x.feels_like),humidity:num2(x.humidity),precipitation:num2(pr.total),
      cloudCover:typeof cc==='object'&&cc?num2(cc.total):num2(cc),windSpeed:num2(w.speed),windDirection:num2(w.angle),windGusts:num2(w.gusts),uvIndex:num2(x.uv_index),
      precipitationProbability:x.probability?num2(x.probability.precipitation):null};};
  if(p.current)batch.current={time:nowUtc,kind:'current',values:one(p.current)};
  var H=(p.hourly&&p.hourly.data)||[];
  if(H.length){var hv={};var rows=H.map(one);Object.keys(rows[0]).forEach(function(k){hv[k]=rows.map(function(r){return r[k];});});
    batch.hourly={times:H.map(function(h){return String(h.date).slice(0,16);}),kinds:H.map(function(h){return String(h.date).slice(0,16)<nowUtc?'recent past':'forecast';}),values:hv};}
  var Dd=(p.daily&&p.daily.data)||[];
  if(Dd.length){var dv={temperatureMax:[],temperatureMin:[],precipitationSum:[],windSpeedMax:[],windDirectionDominant:[],sunrise:[],sunset:[],daylightHours:[]};
    Dd.forEach(function(d){var a=d.all_day||{},s=(d.astro&&d.astro.sun)||{};dv.temperatureMax.push(num2(a.temperature_max));dv.temperatureMin.push(num2(a.temperature_min));
      dv.precipitationSum.push(a.precipitation?num2(a.precipitation.total):null);dv.windSpeedMax.push(a.wind?num2(a.wind.speed):null);dv.windDirectionDominant.push(a.wind?num2(a.wind.angle):null);
      dv.sunrise.push(s.rise?String(s.rise).slice(11,16):null);dv.sunset.push(s.set?String(s.set).slice(11,16):null);
      dv.daylightHours.push(s.rise&&s.set?round((Date.parse(s.set+'Z')-Date.parse(s.rise+'Z'))/3600000,2):null);});
    batch.daily={dates:Dd.map(function(d){return d.day;}),kinds:Dd.map(function(d){return d.day<nowUtc.slice(0,10)?'recent past':'forecast';}),values:dv};}
  return {status:'ok',batch:batch};
}

/* ---- CANONICAL INGESTION. Weather is re-fetchable context, so it is a supporting store rather than the event log: a
   forecast refresh is tens of kilobytes. A newer forecast supersedes an older one for the same source, dataset and
   location; historical ranges are kept. What a workout records about its weather goes into its own session. ---- */
function ingestEnvironmentBatch(batch){
  if(!batch||!batch.id)return {status:'refused',note:'not a batch'};
  if(!batch.location||batch.location.lat==null||batch.location.lon==null)return {status:'refused',note:'a batch without a location is refused; a location is never inferred'};
  DB.environment=(DB.environment||[]).filter(function(b){return b.id!==batch.id;});
  DB.environment.push(batch);
  var hist=DB.environment.filter(function(b){return b.dataset==='archive';});if(hist.length>12){var drop=hist.slice(0,hist.length-12).map(function(b){return b.id;});DB.environment=DB.environment.filter(function(b){return drop.indexOf(b.id)<0;});}
  _memoInvalidate();save('environment');
  return {status:'ok',id:batch.id,superseded:true};
}

/* ---- READ MODELS ---- */
function _envBatches(dataset,loc){loc=loc||weatherLocation();return (DB.environment||[]).filter(function(b){return (!dataset||b.dataset===dataset)&&(!loc||(b.location.lat===round(loc.lat,2)&&b.location.lon===round(loc.lon,2)));})
  .sort(function(a,b){return a.retrievedAt<b.retrievedAt?1:-1;});}
function _vpdFrom(tC,rh){if(tC==null||rh==null)return null;var es=0.6108*Math.exp(17.27*tC/(tC+237.3));return round(es*(1-rh/100),2);}   /* Tetens; kPa */
function environmentNow(){
  var b=_envBatches('forecast')[0];if(!b)return {status:'none',note:weatherLocation()?'No weather yet \u2014 refresh to fetch it.':'Set a place to add weather context.'};
  var aq=_envBatches('air-quality')[0],v=Object.assign({},b.current?b.current.values:{}),derived=[];
  if(v.vpd==null&&v.temperature!=null&&v.humidity!=null){v.vpd=_vpdFrom(v.temperature,v.humidity);derived.push('vpd');}
  if(v.isDay==null){var d=environmentDaily().days.filter(function(x){return x.date===todayISO();})[0];var hm=new Date().toTimeString().slice(0,5);
    if(d&&d.values.sunrise&&d.values.sunset){v.isDay=hm>=d.values.sunrise&&hm<d.values.sunset?1:0;derived.push('isDay');}}
  if(aq&&aq.current)Object.keys(aq.current.values).forEach(function(k){v[k]=aq.current.values[k];});
  var ageMin=Math.round((Date.now()-Date.parse(b.retrievedAt))/60000);
  return {status:'ok',cls:'MEASURED',values:v,derived:derived,source:b.source,retrievedAt:b.retrievedAt,ageMinutes:ageMin,stale:ageMin>180,
    location:b.location,airSource:aq?aq.source:null,unsupported:b.unsupported||[]};
}
function environmentDaily(){
  var days={},put=function(b){if(!b.daily)return;b.daily.dates.forEach(function(d,i){if(days[d]&&days[d].retrievedAt>b.retrievedAt)return;
    var vals={};Object.keys(b.daily.values).forEach(function(k){vals[k]=b.daily.values[k][i];});days[d]={date:d,kind:b.daily.kinds[i],values:vals,source:b.source,retrievedAt:b.retrievedAt};});};
  _envBatches('archive').slice().reverse().forEach(put);_envBatches('forecast').slice().reverse().forEach(put);
  return {status:Object.keys(days).length?'ok':'none',days:Object.keys(days).sort().map(function(k){return days[k];})};
}
function environmentHourly(dateLocal){
  var b=_envBatches('forecast')[0];if(!b||!b.hourly)return [];var aq=_envBatches('air-quality')[0];
  return b.hourly.times.map(function(t,i){if(dateLocal&&t.slice(0,10)!==dateLocal)return null;var v={};Object.keys(b.hourly.values).forEach(function(k){v[k]=b.hourly.values[k][i];});
    if(v.vpd==null&&v.temperature!=null&&v.humidity!=null)v.vpd=_vpdFrom(v.temperature,v.humidity);
    if(aq&&aq.hourly){var j=aq.hourly.times.indexOf(t);if(j>=0)Object.keys(aq.hourly.values).forEach(function(k){v[k]=aq.hourly.values[k][j];});}
    return {time:t,kind:b.hourly.kinds[i],values:v};}).filter(Boolean);
}
/* The weather a workout was done in, copied into the session so it outlives the re-fetchable context. */
function weatherContextAt(localTime){
  var H=environmentHourly();if(!H.length)return null;var t=String(localTime).slice(0,13);
  var h=H.filter(function(x){return x.time.slice(0,13)===t;})[0];if(!h)return null;var b=_envBatches('forecast')[0];
  return {temperature:h.values.temperature,apparentTemperature:h.values.apparentTemperature,humidity:h.values.humidity,windSpeed:h.values.windSpeed,uvIndex:h.values.uvIndex,
    precipitation:h.values.precipitation,time:h.time,kind:h.kind,source:b.source,retrievedAt:b.retrievedAt};
}

/* ---- LOCATION: a canonical input, set by the person, never inferred (spec \u00a719) ---- */
function weatherLocation(){var l=DB.settings.weatherLocation;return l&&l.lat!=null&&l.lon!=null?l:null;}
function setWeatherLocation(o){if(!o||!isFinite(o.lat)||!isFinite(o.lon))return {status:'refused'};
  DB.settings.weatherLocation={lat:round(+o.lat,2),lon:round(+o.lon,2),label:String(o.label||'').slice(0,80),timezone:o.timezone||null,setAt:nowISO()};save('settings');return {status:'ok'};}
function _deviceTz(){try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';}catch(e){return 'UTC';}}

/* ---- TRANSPORT + INGESTION, as one refresh ---- */
var ENV_REQUESTED=Object.keys(ENV_VARIABLES).filter(function(k){return !ENV_VARIABLES[k].air;});
function refreshEnvironment(opts){
  opts=opts||{};var L=weatherLocation();if(!L)return Promise.resolve(extError('configuration_error','set a place first; a location is never inferred'));
  var provider=opts.provider||(DB.settings.weatherProvider||'open-meteo'),tz=L.timezone||_deviceTz();
  var q='lat='+L.lat+'&lon='+L.lon+'&tz='+encodeURIComponent(tz);
  var jobs=[extRequest('/v1/ext/weather/forecast?'+q+'&provider='+provider+'&past_days=7&forecast_days=14').then(function(r){
      if(r.status!=='ok')return r;var a=provider==='meteosource'?adaptMeteosource(r.payload,{retrievedAt:r.retrievedAt,lat:L.lat,lon:L.lon,label:L.label}):
        adaptOpenMeteo(r.payload,{dataset:'forecast',retrievedAt:r.retrievedAt,label:L.label,requested:ENV_REQUESTED.filter(function(v){return ENV_VARIABLES[v].res.indexOf('daily')<0||true;})});
      if(a.status!=='ok')return a;a.batch.location={lat:L.lat,lon:L.lon,label:L.label};a.batch.id=a.batch.id.replace(/:[-0-9.]+,[-0-9.]+/,':'+L.lat+','+L.lon);return ingestEnvironmentBatch(a.batch);}),
    extRequest('/v1/ext/weather/air-quality?'+q+'&past_days=7&forecast_days=5').then(function(r){
      if(r.status!=='ok')return r;var a=adaptOpenMeteo(r.payload,{dataset:'air-quality',retrievedAt:r.retrievedAt,label:L.label});if(a.status!=='ok')return a;
      a.batch.location={lat:L.lat,lon:L.lon,label:L.label};a.batch.id='env:open-meteo:air-quality:'+L.lat+','+L.lon;return ingestEnvironmentBatch(a.batch);})];
  return Promise.all(jobs).then(function(rs){DB.settings.weatherSync={lastAttempt:nowISO(),lastSuccess:rs[0].status==='ok'?nowISO():((DB.settings.weatherSync||{}).lastSuccess||null),
      state:rs.every(function(r){return r.status==='ok';})?'synced':(rs.some(function(r){return r.status==='ok';})?'partial':'failed'),
      error:(rs.filter(function(r){return r.status!=='ok';})[0]||{}).error||null};save('settings');return {status:rs[0].status,results:rs};});
}
function fetchHistoricalWeather(start,end){
  var L=weatherLocation();if(!L)return Promise.resolve(extError('configuration_error','set a place first'));
  return extRequest('/v1/ext/weather/archive?lat='+L.lat+'&lon='+L.lon+'&tz='+encodeURIComponent(L.timezone||_deviceTz())+'&start='+start+'&end='+end).then(function(r){
    if(r.status!=='ok')return r;var a=adaptOpenMeteo(r.payload,{dataset:'archive',retrievedAt:r.retrievedAt,label:L.label});if(a.status!=='ok')return a;
    a.batch.location={lat:L.lat,lon:L.lon,label:L.label};a.batch.id='env:open-meteo:archive:'+L.lat+','+L.lon+':'+start+'..'+end;return ingestEnvironmentBatch(a.batch);});
}
function searchPlaces(name){return extRequest('/v1/ext/geocode?name='+encodeURIComponent(name)).then(function(r){
  if(r.status!=='ok')return r;return {status:'ok',places:((r.payload&&r.payload.results)||[]).map(function(x){return {label:[x.name,x.admin1,x.country].filter(Boolean).join(', '),lat:x.latitude,lon:x.longitude,timezone:x.timezone};})};});}

/* ============================================================================
   OPEN FOOD FACTS (spec \u00a721): a secondary product source behind the bundled database. A product found there is
   normalised into the existing food shape and resolved by barcode into the existing food identity \u2014 there is no second
   food database. Where the bundled database also has the product, it wins and differences are reported.
   ============================================================================ */
/* Duplicate spellings of one brand collapse to one, preferring the properly capitalised form ("Coca-Cola" over "coca-cola"). */
function _offBrand(b){var parts=String(b||'').split(',').map(function(x){return x.trim();}).filter(Boolean),best={},order=[];
  parts.forEach(function(x){var k=x.toLowerCase().replace(/[^a-z0-9]/g,'');if(!(k in best)){best[k]=x;order.push(k);}else if(/[A-Z]/.test(x)&&!/[A-Z]/.test(best[k]))best[k]=x;});
  return order.map(function(k){return best[k];}).join(', ');}
function adaptOpenFoodFacts(payload,meta){
  meta=meta||{};var p=payload||{};
  if(p.status==='failure'||(p.result&&p.result.id==='product_not_found'))return extError('unsupported_record','Open Food Facts has no product with that barcode');
  if(!p.product)return extError('malformed_payload','no product in the response');
  var P=p.product,N=P.nutriments||{},num=function(x){var v=typeof x==='string'?parseFloat(x):x;return typeof v==='number'&&isFinite(v)?v:null;};
  var liquid=/^(ml|cl|l)$/i.test(String(P.product_quantity_unit||''))||/\bml\b|\bcl\b|\bl\b/i.test(String(P.quantity||''));
  var kcal=num(N['energy-kcal_100g']);var fromKj=false;if(kcal==null&&num(N['energy-kj_100g'])!=null){kcal=round(num(N['energy-kj_100g'])/4.184,1);fromKj=true;}
  var per={kcal:kcal,protein:num(N.proteins_100g),carbs:num(N.carbohydrates_100g),fat:num(N.fat_100g),fiber:num(N.fiber_100g),sugars:num(N.sugars_100g),satfat:num(N['saturated-fat_100g']),
    sodium:num(N.sodium_100g)!=null?round(num(N.sodium_100g)*1000,1):(num(N.salt_100g)!=null?round(num(N.salt_100g)/2.5*1000,1):null)};   /* g \u2192 mg; salt \u2192 sodium \u00f7 2.5 */
  var missing=Object.keys(per).filter(function(k){return per[k]==null;});
  if(per.kcal==null)return extError('unsupported_record','the product has no energy value per 100 '+(liquid?'ml':'g'));
  var sq=num(P.serving_quantity),portions=sq?[{label:String(P.serving_size||(sq+(liquid?' ml':' g'))),grams:sq}]:[];
  var code=String(P.code||p.code||'').replace(/\D/g,'');
  return {status:'ok',food:{kind:'branded',id:'off-'+code,gtin:code,name:String(P.product_name||P.generic_name||('Product '+code)).trim(),brand:_offBrand(P.brands),
    basis:liquid?'ml':'g',per100:per,portions:portions,source:'OPEN_FOOD_FACTS',version:P.last_modified_t?new Date(P.last_modified_t*1000).toISOString().slice(0,10):null,
    category:(P.categories_tags||[]).slice(-1)[0]||null,
    provenance:{source:'open-food-facts',externalId:code,retrievedAt:meta.retrievedAt||nowISO(),adapterVersion:EXT_ADAPTER_VERSION,
      missing:missing,energyFromKj:fromKj,warnings:(p.warnings||[]).length,note:missing.length?('Open Food Facts lists no '+missing.join(', ')+' for this product'):null}}};
}
/* The label conflicts between the bundled record and Open Food Facts for the same barcode (reported, not merged). */
function foodLabelConflicts(a,b){var out=[];['kcal','protein','carbs','fat'].forEach(function(k){var x=(a.per100||{})[k],y=(b.per100||{})[k];
  if(x!=null&&y!=null&&Math.abs(x-y)>Math.max(1,0.1*Math.max(x,y)))out.push({nutrient:k,bundled:x,openFoodFacts:y});});return out;}
/* Bundled first; Open Food Facts only when the bundled database has no such barcode. */
function lookupProductByBarcode(code){
  return lookupGtin(code).then(function(f){if(f)return {status:'ok',food:f,source:'bundled'};
    return extRequest('/v1/ext/food/off/product?code='+String(code).replace(/\D/g,'')).then(function(r){
      if(r.status!=='ok')return r;var a=adaptOpenFoodFacts(r.payload,{retrievedAt:r.retrievedAt});if(a.status!=='ok')return a;
      if(typeof _foodCatalog!=='undefined')_foodCatalog['branded|'+a.food.id]=a.food;
      return {status:'ok',food:a.food,source:'open-food-facts'};});});
}


/* ============================================================================
   WEATHER: presentation (reads the canonical environment only; never calls a provider)
   ============================================================================ */
function _envImperial(){return typeof unitPref==='function'&&unitPref()!=='metric';}
function fmtEnv(id,v){
  if(v==null)return '\u2014';var imp=_envImperial();
  if(id==='sunrise'||id==='sunset')return String(v);
  if(id==='isDay')return v?'day':'night';
  if(/^temperature|^apparentTemperature/.test(id))return imp?Math.round(v*9/5+32)+'\u00b0F':round(v,1)+'\u00b0C';
  if(/^wind(Speed|Gusts)/.test(id))return imp?round(v*2.237,0)+' mph':round(v*3.6,0)+' km/h';
  if(/^windDirection/.test(id)){var dirs=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];return dirs[Math.round(((v%360)+360)%360/22.5)%16]+' ('+Math.round(v)+'\u00b0)';}
  if(/^precipitation(Sum)?$/.test(id)||/^et0/.test(id))return imp?round(v/25.4,2)+' in':round(v,1)+' mm';
  if(/Probability/.test(id)||id==='humidity'||id==='cloudCover')return Math.round(v)+'%';
  if(id==='vpd')return round(v,2)+' kPa';if(id==='daylightHours'){var h=Math.floor(v),m=Math.round((v-h)*60);return h+' h '+String(m).padStart(2,'0')+' min';}
  if(/Aqi$/.test(id))return String(Math.round(v));if(/^uvIndex/.test(id))return String(round(v,1));
  var u=(ENV_VARIABLES[id]||{}).unit;return round(v,1)+(u?' '+u:'');
}
var ENV_KIND_TEXT={current:'now',forecast:'forecast','recent past':'recent past (model analysis, not a station reading)',historical:'historical (reanalysis)'};
function renderWeatherCard(){
  var L=weatherLocation();if(!L)return '';
  var N=environmentNow(),D=environmentDaily();
  if(N.status!=='ok')return uiCard({title:'Weather',sub:esc(L.label||'your place'),body:'<div class="hint">'+esc(N.note)+'</div><div class="btn-row">'+uiBtn('Get the weather','weather.refresh',null,'btn-sm btn-primary')+uiBtn('Details','weather.open',null,'btn-sm btn-ghost')+'</div>'});
  var v=N.values,T=todayISO(),today=(D.days||[]).filter(function(d){return d.date===T;})[0],fc=(D.days||[]).filter(function(d){return d.date>=T;}).slice(0,14);
  var top='<div class="wx-now"><div class="wx-temp">'+fmtEnv('temperature',v.temperature)+'</div><div class="hint">feels like '+fmtEnv('apparentTemperature',v.apparentTemperature)+' \u00b7 '+fmtEnv('isDay',v.isDay)+(N.derived.indexOf('isDay')>=0?' (from sunrise and sunset)':'')+'</div></div>';
  var rows=uiRow('Humidity',fmtEnv('humidity',v.humidity),{sub:v.vpd!=null?('vapour pressure deficit '+fmtEnv('vpd',v.vpd)+(N.derived.indexOf('vpd')>=0?' (derived from temperature and humidity)':'')):''})+
    uiRow('Wind',fmtEnv('windSpeed',v.windSpeed)+' '+(v.windDirection!=null?fmtEnv('windDirection',v.windDirection).split(' ')[0]:''),{sub:'gusts '+fmtEnv('windGusts',v.windGusts)})+
    uiRow('UV index',fmtEnv('uvIndex',v.uvIndex))+(today?uiRow('Sun',fmtEnv('sunrise',today.values.sunrise)+' \u2013 '+fmtEnv('sunset',today.values.sunset),{sub:'daylight '+fmtEnv('daylightHours',today.values.daylightHours)}):'')+
    (v.usAqi!=null||v.europeanAqi!=null?uiRow('Air quality',v.usAqi!=null?('US AQI '+fmtEnv('usAqi',v.usAqi)):('European AQI '+fmtEnv('europeanAqi',v.europeanAqi)),{sub:'PM2.5 '+fmtEnv('pm2_5',v.pm2_5)}):'');
  var strip='<div class="wx-strip">'+fc.map(function(d){return '<div class="wx-day"><b>'+esc(dowShort(d.date))+'</b><span>'+fmtEnv('temperatureMax',d.values.temperatureMax)+'</span><span class="hint">'+fmtEnv('temperatureMin',d.values.temperatureMin)+'</span>'+
    (d.values.precipitationSum?'<span class="hint">'+fmtEnv('precipitationSum',d.values.precipitationSum)+'</span>':'')+'</div>';}).join('')+'</div>';
  return uiCard({title:'Weather',sub:esc(L.label||'your place')+' \u00b7 '+esc(EXTERNAL_SOURCES[N.source]?EXTERNAL_SOURCES[N.source].name:N.source)+' \u00b7 '+(N.ageMinutes<60?N.ageMinutes+' min ago':Math.round(N.ageMinutes/60)+' h ago')+(N.stale?' (out of date)':''),
    body:top+rows+'<div class="card-title" style="margin-top:8px">Next 14 days</div>'+strip+'<div class="btn-row">'+uiBtn('Details','weather.open',null,'btn-sm btn-secondary')+uiBtn('Refresh','weather.refresh',null,'btn-sm btn-ghost')+'</div>'});
}
/* SHEETS.weather lives in 90-workout.js: SHEETS is defined in 85-log-sheet.js, after this file, and assigning to it here
   threw at load — the load-order trap, a third time. Governance now fails any top-level use of a registry before its definition. */
