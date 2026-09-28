/* ============================================================================
   ICONS (usage review: "visuals and icons should be integrated build wide, within the style and theme of the app and
   similar to the movement and mobility types"). One set of line icons drawn like the movement figures \u2014 strokes only,
   round ends, currentColor \u2014 so they take the theme, the accent and high-contrast settings with them. uiIcon(name)
   returns inline SVG with a text title; an unknown name draws nothing rather than a broken image.
   ============================================================================ */
var ICONS={
  sun:'<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.3M12 19.2v2.3M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.3M19.2 12h2.3M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/>',
  moon:'<path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1z"/>',
  cloud:'<path d="M7 18.5h10.2a4 4 0 0 0 .5-8 5.6 5.6 0 0 0-10.8 1.4A3.3 3.3 0 0 0 7 18.5z"/>',
  sunCloud:'<circle cx="8.5" cy="8" r="3"/><path d="M8.5 2.6v1.3M3.2 8H4.5M4.8 4.3l.9.9M12.2 4.3l-.9.9"/><path d="M9 19h9a3.4 3.4 0 0 0 .4-6.8 4.8 4.8 0 0 0-9.2 1.2A2.8 2.8 0 0 0 9 19z"/>',
  moonCloud:'<path d="M11.8 6.8A4.4 4.4 0 0 1 6.3 3a4.4 4.4 0 1 0 5.5 3.8z"/><path d="M9 19h9a3.4 3.4 0 0 0 .4-6.8 4.8 4.8 0 0 0-9.2 1.2A2.8 2.8 0 0 0 9 19z"/>',
  fog:'<path d="M4 9h16M3 13h18M5 17h14M8 5h8"/>',
  drizzle:'<path d="M7 14.5h10.2a4 4 0 0 0 .5-8 5.6 5.6 0 0 0-10.8 1.4A3.3 3.3 0 0 0 7 14.5z"/><path d="M8.5 18v1M12 18.5v1M15.5 18v1"/>',
  rain:'<path d="M7 13.5h10.2a4 4 0 0 0 .5-8 5.6 5.6 0 0 0-10.8 1.4A3.3 3.3 0 0 0 7 13.5z"/><path d="M8.5 16.5l-1 3M12 16.5l-1 3M15.5 16.5l-1 3"/>',
  heavyRain:'<path d="M7 12.5h10.2a4 4 0 0 0 .5-8 5.6 5.6 0 0 0-10.8 1.4A3.3 3.3 0 0 0 7 12.5z"/><path d="M7.5 15l-1.5 5M11 15l-1.5 5M14.5 15l-1.5 5M18 15l-1.5 5"/>',
  snow:'<path d="M7 13.5h10.2a4 4 0 0 0 .5-8 5.6 5.6 0 0 0-10.8 1.4A3.3 3.3 0 0 0 7 13.5z"/><path d="M9 17.5l.01 0M12 19.5l.01 0M15 17.5l.01 0M10.5 20.5l.01 0M13.5 16.5l.01 0" stroke-width="2.6"/>',
  sleet:'<path d="M7 13.5h10.2a4 4 0 0 0 .5-8 5.6 5.6 0 0 0-10.8 1.4A3.3 3.3 0 0 0 7 13.5z"/><path d="M8.5 16.5l-1 3M15.5 16.5l-1 3"/><path d="M12 18.5l.01 0" stroke-width="2.6"/>',
  thunder:'<path d="M7 13.5h10.2a4 4 0 0 0 .5-8 5.6 5.6 0 0 0-10.8 1.4A3.3 3.3 0 0 0 7 13.5z"/><path d="M12.5 14.5l-2.5 4h3l-2 3.5"/>',
  wind:'<path d="M3 9h11a2.5 2.5 0 1 0-2.5-2.5M3 13h15a2.5 2.5 0 1 1-2.5 2.5M3 17h8"/>',
  drop:'<path d="M12 3.5c3 4 5.5 7 5.5 10a5.5 5.5 0 0 1-11 0c0-3 2.5-6 5.5-10z"/>',
  sunrise:'<path d="M5 17a7 7 0 0 1 14 0M3 20h18M12 3v5M9 6l3-3 3 3"/>',
  sunset:'<path d="M5 17a7 7 0 0 1 14 0M3 20h18M12 8V3M9 5l3 3 3-3"/>',
  uv:'<circle cx="12" cy="12" r="3.2"/><path d="M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4"/>',
  air:'<path d="M4 8h9a2.5 2.5 0 1 0-2.5-2.5M4 12h13M4 16h9a2.5 2.5 0 1 1-2.5 2.5"/>',
  thermometer:'<path d="M10 14.8V5a2 2 0 1 1 4 0v9.8a3.6 3.6 0 1 1-4 0z"/><path d="M12 9v6.5"/>',
  mic:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>',
  camera:'<path d="M4 8h3l1.5-2.5h7L17 8h3v11H4z"/><circle cx="12" cy="13.2" r="3.4"/>',
  pin:'<path d="M12 21s6.5-6 6.5-11a6.5 6.5 0 0 0-13 0c0 5 6.5 11 6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  calendar:'<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  flask:'<path d="M9.5 3h5M10.5 3v6L5 18.5A1.7 1.7 0 0 0 6.5 21h11a1.7 1.7 0 0 0 1.5-2.5L13.5 9V3M7.5 15h9"/>',
  dumbbell:'<path d="M3.5 9.5v5M6.5 7.5v9M17.5 7.5v9M20.5 9.5v5M6.5 12h11"/>',
  barcode:'<path d="M4 6v12M7 6v12M10 6v9M12.5 6v12M15.5 6v9M18 6v12M20 6v12"/>',
  sync:'<path d="M5 12a7 7 0 0 1 12-4.9L19 9M19 5v4h-4M19 12a7 7 0 0 1-12 4.9L5 15M5 19v-4h4"/>',
  upload:'<path d="M12 16V4M7.5 8.5 12 4l4.5 4.5M5 20h14"/>',
  chart:'<path d="M4 20V4M4 20h16M8 16l3.5-5 3 3L19 7"/>',
  spark:'<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.4 2.4M15.3 15.3l2.4 2.4M6.3 17.7l2.4-2.4M15.3 8.7l2.4-2.4"/>',
  check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  heart:'<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/><path d="M5.5 12h3l1.5-2.5 2 4 1.5-2.5h5"/>',
  bolt:'<path d="M13 3 5.5 13.5H12L11 21l7.5-10.5H12z"/>',
  pill:'<rect x="3.5" y="9" width="17" height="6" rx="3" transform="rotate(-35 12 12)"/><path d="M9.5 8.5l5 7"/>',
  bed:'<path d="M3 18V7M3 13h18v5M21 18v-3a3 3 0 0 0-3-3h-7v1"/><circle cx="7" cy="10.5" r="1.8"/>',
  stopwatch:'<circle cx="12" cy="13.5" r="7"/><path d="M12 13.5V10M10 3h4M18.5 7l1.3-1.3"/>',
  scale:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 9.5a5 5 0 0 1 7 0L12 12z"/>',
  fork:'<path d="M7 3v7a2 2 0 0 0 4 0V3M9 10v11M16 3c-1.7 1.4-2.5 3.4-2.5 6v3H16v9"/>',
  walk:'<circle cx="13" cy="4.5" r="1.8"/><path d="M11 21l2-6-2.5-2.5L12 8l3 3 3 1M9.5 12.5 8 16M12 8l-3 2-1.5 3"/>',
  run:'<circle cx="15" cy="4.5" r="1.8"/><path d="M5 21l4-4 2 1 2-4M9 11l3-3 3 2 3 1M13 14l3 3v4"/>',
  bike:'<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-7h5l3 7M10 9l3 7M13.5 5.5h2"/>',
  brain:'<path d="M9 4.5a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 2V4.5zM15 4.5a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 2V4.5z"/>',
  lungs:'<path d="M12 4v8M12 12c-1.5 1-3 1.5-3 1.5M12 12c1.5 1 3 1.5 3 1.5M8.5 7C6 8 4 12 4 16a3 3 0 0 0 5 2V9M15.5 7c2.5 1 4.5 5 4.5 9a3 3 0 0 1-5 2V9"/>',
  trend:'<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
  chevronLeft:'<path d="M14.5 5.5 8 12l6.5 6.5"/>',chevronRight:'<path d="M9.5 5.5 16 12l-6.5 6.5"/>'
};
function uiIcon(name,o){o=o||{};var p=ICONS[name];if(!p)return '';var s=o.size||20;
  return '<svg class="ic'+(o.cls?' '+o.cls:'')+'" width="'+s+'" height="'+s+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="'+(o.weight||1.8)+'" stroke-linecap="round" stroke-linejoin="round"'+
    (o.title?' role="img" aria-label="'+attrEsc(o.title)+'"><title>'+esc(o.title)+'</title>':' aria-hidden="true">')+p+'</svg>';}

/* ---- WEATHER CONDITIONS: one canonical code (WMO 4677, as Open-Meteo reports it); other providers map onto it ---- */
var WEATHER_CONDITIONS={0:['Clear','sun','moon'],1:['Mostly clear','sunCloud','moonCloud'],2:['Partly cloudy','sunCloud','moonCloud'],3:['Overcast','cloud','cloud'],
  45:['Fog','fog','fog'],48:['Freezing fog','fog','fog'],51:['Light drizzle','drizzle','drizzle'],53:['Drizzle','drizzle','drizzle'],55:['Heavy drizzle','drizzle','drizzle'],
  56:['Freezing drizzle','sleet','sleet'],57:['Freezing drizzle','sleet','sleet'],61:['Light rain','rain','rain'],63:['Rain','rain','rain'],65:['Heavy rain','heavyRain','heavyRain'],
  66:['Freezing rain','sleet','sleet'],67:['Freezing rain','sleet','sleet'],71:['Light snow','snow','snow'],73:['Snow','snow','snow'],75:['Heavy snow','snow','snow'],77:['Snow grains','snow','snow'],
  80:['Showers','rain','rain'],81:['Showers','rain','rain'],82:['Heavy showers','heavyRain','heavyRain'],85:['Snow showers','snow','snow'],86:['Heavy snow showers','snow','snow'],
  95:['Thunderstorm','thunder','thunder'],96:['Thunderstorm with hail','thunder','thunder'],99:['Thunderstorm with hail','thunder','thunder']};
/* Without a code, a condition is derived from precipitation and cloud cover \u2014 and said to be derived. */
function conditionCodeFrom(v){if(!v)return null;var pr=v.precipitation!=null?v.precipitation:v.precipitationSum,cc=v.cloudCover;
  if(pr!=null&&pr>=0.1){var cold=v.temperature!=null&&v.temperature<=0;return cold?73:(pr>=4?65:(pr>=1?63:61));}
  if(cc==null)return null;return cc<15?0:(cc<40?1:(cc<75?2:3));}
function weatherCondition(v,isDay){var code=v&&v.weatherCode!=null?v.weatherCode:null,derived=false;if(code==null){code=conditionCodeFrom(v);derived=code!=null;}
  if(code==null||!WEATHER_CONDITIONS[code])return null;var c=WEATHER_CONDITIONS[code],day=isDay==null?(v&&v.isDay!=null?!!v.isDay:true):!!isDay;
  return {code:code,label:c[0],icon:day?c[1]:c[2],derived:derived};}
function weatherIcon(v,isDay,size){var c=weatherCondition(v,isDay);return c?uiIcon(c.icon,{size:size||22,title:c.label+(c.derived?' (from cloud cover and rain)':''),cls:'wx-ic'}):'';}
/* Meteosource names its conditions; each maps to the nearest canonical code. */
var METEOSOURCE_CODES={clear:0,sunny:0,mostly_sunny:1,mostly_clear:1,partly_sunny:2,partly_clear:2,mostly_cloudy:3,cloudy:3,overcast:3,overcast_with_low_clouds:3,fog:45,
  light_rain:61,rain:63,psbl_rain:80,rain_shower:81,tstorm:95,tstorm_shower:95,psbl_tstorm:95,light_snow:71,snow:73,psbl_snow:85,snow_shower:86,rain_snow:66,psbl_rain_snow:66,freezing_rain:66,psbl_freezing_rain:66,hail:96};
