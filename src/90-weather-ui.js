/* Weather on Today: the rendering moved out of 66-external.js (an engine file must not render interface). */

/* moved from 66-external.js: an engine function that lived in an interface file */
function renderWeatherCard(){
  var L=weatherLocation();if(!L)return '';
  var N=environmentNow(),D=environmentDaily();
  if(N.status!=='ok')return uiCard({title:'Weather',sub:esc(L.label||'your place'),body:'<div class="hint">'+(weatherUpdating()?'Fetching the weather\u2026':esc(N.note))+'</div><div class="btn-row">'+uiBtn('Get the weather','weather.refresh',null,'btn-sm btn-primary')+uiBtn('Details','weather.open',null,'btn-sm btn-ghost')+'</div>'});
  var v=N.values,T=todayISO(),today=(D.days||[]).filter(function(d){return d.date===T;})[0],fc=(D.days||[]).filter(function(d){return d.date>=T;}).slice(0,14);
  var cond=weatherCondition(v,v.isDay);
  var top='<div class="wx-now">'+weatherIcon(v,v.isDay,44)+'<div><div class="wx-temp">'+fmtEnv('temperature',v.temperature)+'</div><div class="wx-cond">'+esc(cond?cond.label:'')+(cond&&cond.derived?' <span class="hint">(from cloud cover and rain)</span>':'')+'</div>'+
    '<div class="hint">feels like '+fmtEnv('apparentTemperature',v.apparentTemperature)+' \u00b7 '+fmtEnv('isDay',v.isDay)+(N.derived.indexOf('isDay')>=0?' (from sunrise and sunset)':'')+'</div></div></div>'+
    '<div class="wx-facts">'+[['drop','Rain now',fmtEnv('precipitation',v.precipitation)],['cloud','Cloud cover',fmtEnv('cloudCover',v.cloudCover)],['wind','Wind',fmtEnv('windSpeed',v.windSpeed)],['uv','UV',fmtEnv('uvIndex',v.uvIndex)]]
      .map(function(f){return '<div class="wx-fact">'+uiIcon(f[0],{size:18})+'<span class="hint">'+esc(f[1])+'</span><b>'+esc(f[2])+'</b></div>';}).join('')+'</div>';
  var HH=environmentHourly().filter(function(h){return h.kind==='forecast';}).slice(0,12);
  var hourly=HH.length?'<div class="card-title" style="margin-top:8px">Next hours</div><div class="wx-strip">'+HH.map(function(h){return '<div class="wx-day"><b>'+esc(h.time.slice(11,16))+'</b>'+weatherIcon(h.values,h.values.isDay,22)+
      '<span>'+fmtEnv('temperature',h.values.temperature)+'</span><span class="hint">'+(h.values.precipitationProbability!=null?uiIcon('drop',{size:11})+Math.round(h.values.precipitationProbability)+'%':'')+'</span></div>';}).join('')+'</div>':'';
  var rows=uiRow('Humidity',fmtEnv('humidity',v.humidity),{sub:v.vpd!=null?('vapour pressure deficit '+fmtEnv('vpd',v.vpd)+(N.derived.indexOf('vpd')>=0?' (derived from temperature and humidity)':'')):''})+
    uiRow('Wind',fmtEnv('windSpeed',v.windSpeed)+' '+(v.windDirection!=null?fmtEnv('windDirection',v.windDirection).split(' ')[0]:''),{sub:'gusts '+fmtEnv('windGusts',v.windGusts)})+
    uiRow('UV index',fmtEnv('uvIndex',v.uvIndex))+(today?uiRow('Sun',fmtEnv('sunrise',today.values.sunrise)+' \u2013 '+fmtEnv('sunset',today.values.sunset),{sub:'daylight '+fmtEnv('daylightHours',today.values.daylightHours)}):'')+
    (v.usAqi!=null||v.europeanAqi!=null?uiRow('Air quality',v.usAqi!=null?('US AQI '+fmtEnv('usAqi',v.usAqi)):('European AQI '+fmtEnv('europeanAqi',v.europeanAqi)),{sub:'PM2.5 '+fmtEnv('pm2_5',v.pm2_5)}):'');
  var strip='<div class="wx-strip">'+fc.map(function(d){return '<div class="wx-day"><b>'+esc(dowShort(d.date))+'</b>'+weatherIcon(d.values,true,22)+'<span>'+fmtEnv('temperatureMax',d.values.temperatureMax)+'</span><span class="hint">'+fmtEnv('temperatureMin',d.values.temperatureMin)+'</span>'+
    '<span class="hint">'+(d.values.precipitationSum?fmtEnv('precipitationSum',d.values.precipitationSum):'\u00a0')+(d.values.precipitationProbabilityMax!=null?' '+Math.round(d.values.precipitationProbabilityMax)+'%':'')+'</span></div>';}).join('')+'</div>';
  return uiCard({title:'Weather',sub:esc(L.label||'your place')+' \u00b7 '+esc(EXTERNAL_SOURCES[N.source]?EXTERNAL_SOURCES[N.source].name:N.source)+' \u00b7 '+(N.ageMinutes<60?N.ageMinutes+' min ago':Math.round(N.ageMinutes/60)+' h ago')+(weatherUpdating()?' \u00b7 updating\u2026':(N.stale?' (out of date)':'')),
    /* a glance by default (now, today's range and rain, the next hours); More opens the full card; the choice is kept */
    body:(DB.settings.weatherExpanded?top+hourly+rows+'<div class="card-title" style="margin-top:8px">Next 14 days</div>'+strip:_weatherGlance(v,today,HH))+
      '<div class="btn-row">'+uiBtn(DB.settings.weatherExpanded?'Less':'More','weather.expand',null,'btn-sm btn-ghost')+uiBtn('Details','weather.open',null,'btn-sm btn-secondary')+uiBtn('Refresh','weather.refresh',null,'btn-sm btn-ghost')+'</div>'});
}

/* moved from 66-external.js: an engine function that lived in an interface file */
function _weatherGlance(v,today,HH){var cond=weatherCondition(v,v.isDay),rainP=HH.slice(0,6).reduce(function(m,h){return Math.max(m,h.values.precipitationProbability||0);},0);
  return '<div class="wx-now wx-glance">'+weatherIcon(v,v.isDay,36)+'<div><div class="wx-temp">'+fmtEnv('temperature',v.temperature)+' <span class="hint">'+esc(cond.label||'')+'</span></div>'+
    '<div class="hint">'+(today?('today '+fmtEnv('temperatureMin',today.values.temperatureMin)+' \u2013 '+fmtEnv('temperatureMax',today.values.temperatureMax)+' \u00b7 '):'')+'rain '+Math.round(rainP)+'% in the next 6 hours'+(v.uvIndex!=null?' \u00b7 UV '+fmtNum(v.uvIndex,0):'')+'</div></div></div>'+
    (HH.length?'<div class="wx-strip">'+HH.slice(0,6).map(function(h){return '<div class="wx-day"><b>'+esc(String(h.time||h.at||'').slice(11,13))+'</b>'+weatherIcon(h.values,true,18)+'<span>'+fmtEnv('temperature',h.values.temperature)+'</span></div>';}).join('')+'</div>':'');}
