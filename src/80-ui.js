/* ============================================================================
   REGION: UI PRIMITIVES — state is the truth, the DOM is a render target. Every number carries its
   epistemic class, provenance and age. Folds carry a signal in their summary.
   ============================================================================ */
var _TAB='today';
function h(strings){var out='';for(var i=0;i<strings.length;i++){out+=strings[i];if(i<arguments.length-1){var v=arguments[i+1];out+=(v==null?'':v);}}return out;}
/* A card with `fold` renders as a collapsible section, remembering its state like every other fold (H4 usage review:
   the Tools tab was ten always-open cards and a long self-test report). */
function uiCard(o){
  if(o&&o.fold&&typeof uiFold==='function'){var f=o.fold;var oo=Object.assign({},o);delete oo.fold;
    return uiFold(f,oo.title||'',oo.sub||'',function(){return oo.body||'';},{open:!!oo.foldOpen,hideable:!!oo.hideable,hideLabel:oo.hideLabel});}
  o=o||{};
  var pm=null;
  if(o.presentation&&o.presentation.model){
    pm={status:'ok',kind:o.presentation.kind||'generic',model:o.presentation.model,sealed:o.presentation.model.sealed!==false};
  }else if(o.presentation&&typeof presentationDomainMetadata==='function'){
    pm=presentationDomainMetadata(o.presentation.kind,o.presentation.spec||{});
  }
  var pp=(pm&&typeof presentationProvenance==='function')?presentationProvenance({
    semantic:pm.model&&pm.model.cls||null,
    modelContract:o.presentation&&(o.presentation.contractId||o.presentation.kind)||null,
    themeToken:o.presentation&&o.presentation.themeToken||'card',
    theme:(typeof DB!=='undefined'&&DB.settings&&DB.settings.theme)||null,
    skin:(typeof DB!=='undefined'&&DB.settings&&DB.settings.shape)||null,
    renderer:'dom'
  }):null;
  var pu=(pm&&pm.model&&typeof uncertaintyPresentationModel==='function')?uncertaintyPresentationModel({
    types:(pm.model.uncertainty&&pm.model.uncertainty.types)||o.presentation.uncertaintyTypes||[]
  }):null;
  var stateVisual=(typeof presentationSemantic==='function')?presentationSemantic({
    cls:pm&&pm.model&&pm.model.cls,state:pm&&pm.model&&pm.model.state
  }):null;
  var density=(typeof DB!=='undefined'&&DB.settings&&DB.settings.density)||'normal';
  var pad=(typeof spacingValue==='function')?spacingValue(4,density==='cozy'?'normal':density):16;
  var border=(typeof borderSpec==='function')?borderSpec(o.border||'subtle'):{width:1};
  var elevation=(typeof elevationSpec==='function')?elevationSpec(o.elevation||0):{token:'none'};
  var semanticColor=(o.accent&&typeof resolveSemanticColor==='function')?resolveSemanticColor(o.accent,(typeof DB!=='undefined'&&DB.settings&&DB.settings.theme)||'dark'):null;
  var attrs=pm?` data-presentation-domain="${attrEsc(pm.kind)}" data-presentation-sealed="${pm.sealed?'1':'0'}"`:'';
  if(pp&&pp.status==='ok')attrs+=' data-presentation-provenance="1"';
  if(pu&&pu.types&&pu.types.length)attrs+=` data-presentation-uncertainty="${attrEsc(pu.types.map(function(x){return x.type;}).join(','))}"`;
  if(stateVisual)attrs+=` data-presentation-state-pattern="${attrEsc(stateVisual.state.pattern)}"`;
  var style=`--card-pad:${pad}px;--card-border-width:${border.width}px;--card-shadow:${attrEsc(String(elevation.token||'none'))};`;
  if(semanticColor)style+=`--card-semantic-color:${attrEsc(String(semanticColor))};`;
  var head=o.title?`<div class="card-head"><div class="card-title">${o.title}</div>${o.sub?`<div class="card-sub">${o.sub}</div>`:''}</div>`:'';
  /* Developer detail on every card: what the architecture knows about it. A card with no presentation contract says
     so — which is the useful thing for a developer to see. Hidden below the Developer level by the .dev rule. */
  var devLine='<div class="dev">card '+esc(o.id||o.title||'untitled')+' \u00b7 '+(pm?('domain '+esc(pm.kind)+(pm.sealed?' (sealed)':'')):'no presentation contract')+
    ' \u00b7 provenance '+(pp&&pp.status==='ok'?'attached':'none')+' \u00b7 uncertainty '+(pu&&pu.types&&pu.types.length?esc(pu.types.map(function(x){return x.type;}).join(', ')):'none')+
    ' \u00b7 as of '+esc(typeof asOf==='function'?asOf():'')+'</div>';
  return `<div class="card${o.accent?` accent-${o.accent}`:''}${o.cls?` ${o.cls}`:''}"${o.id?` id="${o.id}"`:''}${attrs} style="${style}">${head}${o.body||''}${devLine}</div>`;
}
function uiRow(l,r,o){o=o||{};return '<div class="row'+(o.tight?' tight':'')+'"><div class="l">'+l+(o.sub?'<small>'+o.sub+'</small>':'')+'</div><div class="r'+(o.tone?' '+o.tone:'')+'">'+r+(o.rsub?'<small>'+o.rsub+'</small>':'')+'</div></div>';}
function uiPill(text,tone){return '<span class="pill'+(tone?' '+tone:'')+'">'+text+'</span>';}
function clsMark(cls){if(!cls)return '';var c=String(cls).toLowerCase();var short={measured:'MEASURED',derived:'DERIVED',heuristic:'HEURISTIC',prior:'PRIOR',empirical:'EMPIRICAL',calibrated:'CALIBRATED',predictive:'PREDICTIVE',blended:'PRIOR+EMPIRICAL',reference:'REFERENCE',inferred:'INFERRED','empirical-population':'POPULATION'};return '<span class="cls-mark '+c.replace(/[^a-z]/g,'')+'" title="'+attrEsc(CLASSES[cls.toUpperCase()]||'')+'">'+(short[c]||c.toUpperCase())+'</span>';}
function ageSpan(iso){if(!iso)return '<span class="age-stale">undated</span>';var f=freshness('generic',iso);return '<span class="age-'+f.state+'">'+ageLabel(iso)+'</span>';}
function uiProv(parts){return '<div class="prov">'+parts.filter(Boolean).join(' \u00b7 ')+'</div>';}
/* metric tile: label, value, unit, class, source, age; empty tiles say what is missing */
function uiMetric(o){
  o=o||{};
  /* The personalisation label, visible at every detail level: how personal this estimate is, in words. */
  var _pl=o.personal?'<div class="m-plabel '+(o.personal.tone||'neutral')+'" title="'+attrEsc(o.personal.why||'')+'">'+esc(o.personal.label)+'</div>':'';
  if(o.value==null||o.value==='—'){
    var emptyState=typeof dataStateVisual==='function'?dataStateVisual(o.state||'MISSING'):{pattern:'empty',label:'Missing'};
    return '<div class="metric empty"'+(o.cls?' '+o.cls:'')+' data-state="'+attrEsc(o.state||'MISSING')+'" data-state-pattern="'+attrEsc(emptyState.pattern||'empty')+'"><div class="m-label"><span>'+o.label+'</span></div><div class="m-value">'+(o.emptyText||'no data')+'</div>'+_pl+'<div class="m-prov">'+(o.need||'')+'</div></div>';
  }
  var inferred=/predict|heuristic|prior|empirical|calibrated|blended/i.test(o.cls||'');
  var stale=o.date&&freshness(o.type||'generic',o.date).state==='stale';
  var state=o.state||(stale?'STALE':(inferred?'ESTIMATED':'VALID'));
  var stateVisual=typeof dataStateVisual==='function'?dataStateVisual(state):{pattern:'solid',label:state};
  /* Use the presentation metric contract for numeric values without changing the analytical value itself.
     Existing formatted strings remain untouched; presentation owns formatting, not calculation. */
  var pm=(typeof presentationMetric==='function'&&typeof o.value==='number')?presentationMetric(o.value,{quantity:o.type,unit:o.unit,cls:o.cls}):null;
  var displayValue=pm&&pm.text!=null?pm.text:o.value;
  var typeSpec=(typeof typographySpec==='function')?typographySpec('numeric','normal'):null;
  /* A metric with a registered trace becomes the way into it. The number itself is the affordance, because
     that is what a person is looking at when they wonder where it came from. */
  var traceAttrs=o.trace?(' data-act="trace.open" data-arg="'+attrEsc(o.trace)+'" role="button" tabindex="0" aria-label="'+attrEsc(String(o.label).replace(/<[^>]*>/g,''))+': where this number comes from"') :'';
  var component=(typeof componentSpec==='function')?componentSpec('Metric','default',{state:state,cls:o.cls||null}):null;
  return '<div class="metric'+(inferred?' inferred':'')+(stale?' stale':'')+(o.trace?' traceable':'')+'"'+traceAttrs+' data-state="'+attrEsc(state)+'" data-state-pattern="'+attrEsc(stateVisual.pattern||'solid')+'"'+(typeSpec?' data-typography="numeric"':'')+(component&&component.status==='ok'?' data-component="Metric"':'')+'><div class="m-label"><span>'+o.label+'</span>'+(o.badge?'<span>'+o.badge+'</span>':'')+'</div><div class="m-value">'+displayValue+(o.unit?'<span class="unit">'+o.unit+'</span>':'')+'</div>'+_pl+'<div class="m-prov">'+[o.cls?'<span class="cls '+String(o.cls).toLowerCase().replace(/[^a-z]/g,'')+'">'+String(o.cls).toUpperCase().replace('BLENDED','PRIOR+EMP')+'</span>':'',o.source||'',o.date?'<span class="age-'+freshness(o.type||'generic',o.date).state+'">'+ageLabel(o.date)+'</span>':'',o.conf?('conf '+o.conf):'',stateVisual.label||''].filter(Boolean).join(' · ')+'</div></div>';
}

/* Defence in depth for the fold signal. Callers are expected to escape record-derived text, but the signal
   is a one-line summary assembled inline in dozens of places, which makes it the easiest spot to forget.
   Anything reaching here that still contains a tag or an event-handler attribute is escaped rather than
   trusted: a caller that legitimately wants markup passes opts.signalHtml and says so explicitly. */
function _safeSignal(sig,allowHtml){
  var s2=sig==null?'':String(sig);
  if(allowHtml)return s2;
  return /<[a-z!\/]/i.test(s2)||/\son[a-z]+\s*=/i.test(s2)?esc(s2):s2;
}
/* A closed fold does not build its body. Passing a function defers the work until it is actually opened,
   which matters because collapsed disclosure was emitting tens of kilobytes of DOM nobody had asked to see:
   the Tools view alone shipped 87 KB of markup, 66 KB of it inside folds that were all shut. */
/* Each fold carries id="fold-<id>" as well as data-fold. Only data-fold was set, so nav.voi’s scroll to fold-learn-voi
   never found its target: What is worth measuring next opened Learn and never reached the panel. */
function uiFold(id,title,signal,body,opts){opts=opts||{};
  /* A finished section can be hidden; Tools \u2192 Display shows how many are hidden and restores them. */
  if(opts.hideable&&DB.settings.hiddenFolds&&DB.settings.hiddenFolds[id])return '';
  if(/^tools-/.test(id)&&typeof toolsPinned==='function'){var _pb=body;var _pinned=toolsPinned().indexOf(id)>=0;body=function(){var inner=typeof _pb==='function'?_pb():(_pb||'');return inner+'<div class="btn-row">'+uiBtn(_pinned?'Unpin from the top':'Pin to the top','tools.pin',id,'btn-sm btn-ghost')+'</div>';};}
  if(opts.hideable){var _b=body;body=function(){var inner=typeof _b==='function'?_b():(_b||'');return inner+'<div class="btn-row">'+uiBtn(opts.hideLabel||'Hide this section','fold.hide',id,'btn-sm btn-ghost')+'</div>';};}
  signal=_safeSignal(signal,opts.signalHtml);var _open=DB.settings.folds&&DB.settings.folds[id]!=null?!!DB.settings.folds[id]:!!opts.open;var _lazy=(typeof body==='function');if(_lazy)body=_open?body():'';var open=_open;return '<details id="fold-'+id+'" class="fold'+(opts.urgent?' urgent':'')+'" data-fold="'+id+'"'+(_lazy&&!_open?' data-lazy="1"':'')+''+(open?' open':'')+'><summary data-act="ui.fold" data-arg="'+id+'"><span class="f-title">'+title+'</span><span class="f-signal'+(opts.tone?' '+opts.tone:'')+'">'+(signal||'')+'</span><span class="f-chev">\u203a</span></summary><div class="f-body">'+body+'</div></details>';}
/* Every banner wraps its message, so inline markup inside the sentence cannot become a flex item. */
function uiBanner(tone,message,btn){
  return '<div class="banner '+(tone||'neutral')+'"><span class="banner-text">'+message+'</span>'+(btn||'')+'</div>';
}
/* A capability that is not available yet should SAY SO, with what it needs and the way to provide it. A view
   that simply renders less looks broken, and it leaves a person unable to tell the difference between "this
   app cannot do that" and "this app cannot do that YET, for you, because of one missing measurement". */
function uiLocked(title,need,opts){
  opts=opts||{};
  var items=(need||[]).filter(Boolean);
  return '<div class="locked">'+
    '<div class="lk-head">'+esc(title)+'<span class="lk-tag">not yet</span></div>'+
    (items.length?('<ul class="lk-need">'+items.map(function(n){
      return '<li>'+esc(typeof n==='string'?n:(n.text||''))+'</li>';}).join('')+'</ul>'):'')+
    (opts.why?'<div class="lk-why">'+esc(opts.why)+'</div>':'')+
    (opts.act?('<div class="btn-row">'+uiBtn(opts.actLabel||'Add what it needs',opts.act,opts.arg||null,'btn-sm btn-secondary')+'</div>'):'')+
  '</div>';
}
function uiEmpty(title,body,btn){return '<div class="empty"><b>'+title+'</b>'+body+(btn?'<div>'+btn+'</div>':'')+'</div>';}
function uiBtn(label,act,arg,cls,extra){var ix=(typeof interactionSpec==='function')?interactionSpec('button',['click','focus','keyboard']):null;var ia=ix&&ix.interactions.length?' data-interactions="'+attrEsc(ix.interactions.join(','))+'"':'';return '<button class="btn '+(cls||'btn-secondary')+'" data-act="'+act+'"'+(arg!=null?' data-arg="'+attrEsc(String(arg))+'"':'')+ia+(extra||'')+'>'+label+'</button>';}
function confPill(c){return uiPill('conf '+(c||'\u2014'),confTone(c));}
function tonePill(level,map){var t=(map||{})[level]||'neutral';return uiPill(level,t);}
function sectionH(title,count){return '<h3 class="section-h">'+title+(count!=null?'<span class="count">'+count+'</span>':'')+'</h3>';}
function progressBar(pct,tone){return '<div class="progress-bar"><i class="'+(tone||'')+'" style="width:'+clamp(pct||0,0,100)+'%"></i></div>';}
function kv(pairs){return '<dl class="kv">'+pairs.map(function(p){return '<dt>'+p[0]+'</dt><dd>'+p[1]+'</dd>';}).join('')+'</dl>';}
/* ---- SVG chart: observed dots, averaged line, trend dashed, predicted dotted + band; grid + axes ---- */
var _CHART_SEQ=0;
function svgChart(o){
  o=o||{};
  /* Presentation bridge: callers may provide an explicit visualization contract + presentation model.
     The chart renderer never invents analytical semantics; it only validates and carries declared semantics
     into the rendered surface. Legacy charts without an explicit contract remain renderable while wiring
     proceeds incrementally. */
  var _presentation=null;
  if(o.presentation){
    try{
      if(typeof validateVisualization!=='function')return '<div class=\"empty\">Presentation contract unavailable.</div>';
      _presentation=validateVisualization(o.presentation.contractId,o.presentation.model);
      if(!_presentation.ok)return '<div class=\"empty\" data-presentation-error=\"1\">'+esc((_presentation.violations||[]).join('; '))+'</div>';
    }catch(e){return '<div class=\"empty\" data-presentation-error=\"1\">Presentation validation failed.</div>';}
  }
  var W=o.width||640,H=o.height||200,pl=46,pr=12,pt=12,pb=22;
  var series=(o.series||[]).filter(function(s){return s&&s.pts&&s.pts.length;});
  var xs=[],ys=[];series.forEach(function(s){s.pts.forEach(function(p){if(p.x!=null)xs.push(p.x);if(p.y!=null)ys.push(p.y);if(p.lo!=null)ys.push(p.lo);if(p.hi!=null)ys.push(p.hi);});});
  if(o.yLines)o.yLines.forEach(function(l){ys.push(l.y);});
  if(!xs.length||!ys.length)return '<div class="empty">'+(o.emptyText||'Not enough observations to draw yet.')+'</div>';
  var xmin=Math.min.apply(null,xs),xmax=Math.max.apply(null,xs);if(xmax===xmin)xmax=xmin+1;
  /* Bars are centred on their x position, and the first and last positions sit on the plot's edges, so those two
     bars were drawn half outside the chart and clipped — the current week in the program chart showed at half
     width, which reads as half the training. With any bar series, the x-range is padded by half a slot each side
     so every bar is drawn whole. The real-browser gate caught it as a bar extending past the chart. */
  if(series.some(function(s){return s.type==='bars';})){xmin-=0.5;xmax+=0.5;}
  var ymin=Math.min.apply(null,ys),ymax=Math.max.apply(null,ys);var pad=(ymax-ymin)*0.12||1;ymin-=pad;ymax+=pad;if(o.yMin!=null)ymin=Math.min(ymin,o.yMin);if(o.zeroBase)ymin=0;
  var X=function(x){return pl+(x-xmin)/(xmax-xmin)*(W-pl-pr);},Y=function(y){return pt+(1-(y-ymin)/(ymax-ymin))*(H-pt-pb);};
  /* accessibility: a chart is an image to a screen reader unless it says what it shows. <title> names it,
     <desc> states the range and direction, and a visually hidden table carries the actual numbers. */
  var _chartId='ch'+(++_CHART_SEQ);
  var primary=series.filter(function(x){return x.type!=='band';})[0]||series[0];
  var pv=(primary&&primary.pts||[]).filter(function(p){return p.y!=null;});
  var desc='';
  if(pv.length){var first=pv[0].y,last=pv[pv.length-1].y;var dir=last>first?'rising':(last<first?'falling':'flat');
    desc=pv.length+' points, '+(o.yFmt?o.yFmt(first):fmtNum(first,1))+' to '+(o.yFmt?o.yFmt(last):fmtNum(last,1))+', '+dir+'; range '+(o.yFmt?o.yFmt(ymin):fmtNum(ymin,1))+' to '+(o.yFmt?o.yFmt(ymax):fmtNum(ymax,1))+'.';}
  var _pAttrs='';
  var _perf=(typeof presentationPerformance==='function')?presentationPerformance(series.reduce(function(n,s){return n+(s.pts?s.pts.length:0);},0)):null;
  if(_presentation){
    _pAttrs=' data-presentation-contract="'+attrEsc(o.presentation.contractId)+'" data-epistemic="'+attrEsc((_presentation.styling&&_presentation.styling.pattern)||'declared')+'"';
  }
  if(_perf)_pAttrs+=' data-presentation-performance="'+attrEsc(_perf.class)+'" data-presentation-renderer="'+attrEsc(_perf.renderer)+'"';var _ix=(typeof visualizationInteractionSpec==='function')?visualizationInteractionSpec(['hover','tap','zoom','pan','rangeSelect','seriesToggle','eventSelection','dataPointInspection']):null;if(_ix&&_ix.interactions.length)_pAttrs+=' data-presentation-interactions="'+attrEsc(_ix.interactions.join(','))+'"';
  var _vis=(typeof visualizationRuntimeSpec==='function')?visualizationRuntimeSpec(series):null;
  var _unc=(typeof uncertaintyRuntimeSpec==='function')?uncertaintyRuntimeSpec(series):null;
  var _forecast=(typeof forecastRuntimeSpec==='function')?forecastRuntimeSpec(series):null;
  var _pp=(typeof presentationProvenance==='function')?presentationProvenance({semantic:_presentation&&_presentation.styling?_presentation.styling.pattern:null,modelContract:o.presentation&&o.presentation.contractId||null,themeToken:'chart',theme:(typeof DB!=='undefined'&&DB.settings&&DB.settings.theme)||null,skin:(typeof DB!=='undefined'&&DB.settings&&DB.settings.shape)||null,renderer:_perf&&_perf.renderer||'svg'}):null;
  var _inspect=(typeof inspectPresentation==='function')?inspectPresentation({label:o.aria||o.title||'chart',data:series.map(function(s){return {type:s.type||'line',epistemic:s.epistemic||'OBSERVED',uncertaintyType:s.uncertaintyType||null,points:(s.pts||[]).length};}),model:o.presentation&&o.presentation.model||null,uncertainty:_unc,contract:o.presentation&&o.presentation.contractId||null,visual:{type:_vis&&_vis.id||null,renderer:_perf&&_perf.renderer||'svg'}}):null;
  if(_vis)_pAttrs+=' data-presentation-visualization="'+attrEsc(_vis.id)+'" data-presentation-visualization-status="'+attrEsc(_vis.status)+'"';
  if(_unc&&_unc.types&&_unc.types.length)_pAttrs+=' data-presentation-uncertainty="'+attrEsc(_unc.types.map(function(x){return x.type;}).join(','))+'"';
  if(_forecast&&_forecast.status==='ok')_pAttrs+=' data-presentation-forecast="1"';
  if(_pp&&_pp.status==='ok')_pAttrs+=' data-presentation-provenance="1"';
  if(_inspect&&_inspect.status==='ok')_pAttrs+=' data-presentation-inspectable="1"';
  var out='<svg class="chart"'+_pAttrs+' viewBox="0 0 '+W+' '+H+'" role="img" aria-labelledby="'+_chartId+'t '+_chartId+'d" preserveAspectRatio="none" style="aspect-ratio:'+W+'/'+H+'">'+
    '<title id="'+_chartId+'t">'+esc(o.aria||o.title||'chart')+'</title><desc id="'+_chartId+'d">'+esc(desc||'no plotted values')+'</desc>';
  var ticks=4;for(var i=0;i<=ticks;i++){var yv=ymin+(ymax-ymin)*i/ticks;out+='<line class="grid" x1="'+pl+'" x2="'+(W-pr)+'" y1="'+Y(yv).toFixed(1)+'" y2="'+Y(yv).toFixed(1)+'"/><text class="axis" x="'+(pl-6)+'" y="'+(Y(yv)+3).toFixed(1)+'" text-anchor="end">'+(o.yFmt?o.yFmt(yv):fmtNum(yv,0))+'</text>';}
  (o.xLabels||[]).forEach(function(l){out+='<text class="axis" x="'+X(l.x).toFixed(1)+'" y="'+(H-6)+'" text-anchor="middle">'+esc(l.label)+'</text>';});
  (o.yLines||[]).forEach(function(l){out+='<line class="'+(l.cls||'target')+'" x1="'+pl+'" x2="'+(W-pr)+'" y1="'+Y(l.y).toFixed(1)+'" y2="'+Y(l.y).toFixed(1)+'"/>';});
  (o.xMarkers||[]).forEach(function(m){out+='<line class="marker" x1="'+X(m.x).toFixed(1)+'" x2="'+X(m.x).toFixed(1)+'" y1="'+pt+'" y2="'+(H-pb)+'"/>'+(m.label?'<text class="axis" x="'+(X(m.x)+3).toFixed(1)+'" y="'+(pt+9)+'">'+esc(m.label)+'</text>':'');});
  series.forEach(function(s){
    var _ep=s.epistemic||null;
    var _u=s.uncertaintyType||null;
    var _sem=_ep==='PREDICTIVE'?'predictive':(_ep||'observed');
    var _sa=' data-series-semantic="'+attrEsc(_sem)+'"'+(_ep?' data-epistemic="'+attrEsc(_ep)+'"':'')+(_u?' data-uncertainty-type="'+attrEsc(_u)+'"':'');
    if(s.type==='band'){var up=s.pts.filter(function(p){return p.hi!=null;}).map(function(p){return X(p.x).toFixed(1)+','+Y(p.hi).toFixed(1);});var lo=s.pts.filter(function(p){return p.lo!=null;}).map(function(p){return X(p.x).toFixed(1)+','+Y(p.lo).toFixed(1);}).reverse();if(up.length&&lo.length)out+='<polygon class="band'+(_u?' uncertainty-'+attrEsc(_u):'')+'"'+_sa+' points="'+up.concat(lo).join(' ')+'"/>'; }
    else if(s.type==='bars'){var bw=Math.max(2,(W-pl-pr)/Math.max(1,(xmax-xmin))*0.7);s.pts.forEach(function(p){if(p.y==null)return;var y=Y(p.y),y0=Y(Math.max(ymin,0));out+='<rect class="bar'+(p.cls?' '+p.cls:'')+(_ep==='PREDICTIVE'?' predictive':'')+'"'+_sa+' x="'+(X(p.x)-bw/2).toFixed(1)+'" y="'+Math.min(y,y0).toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+Math.abs(y0-y).toFixed(1)+'"/>';});}
    else if(s.type==='dots'){s.pts.forEach(function(p){if(p.y==null)return;out+='<circle class="obs'+(p.cls?' '+p.cls:'')+(_ep==='PREDICTIVE'?' predictive':'')+'"'+_sa+' cx="'+X(p.x).toFixed(1)+'" cy="'+Y(p.y).toFixed(1)+'" r="'+(s.r||2.4)+'"/>';});}
    else{var d='';s.pts.forEach(function(p,i){if(p.y==null)return;d+=(i===0||!s.pts[i-1]||s.pts[i-1].y==null?'M':'L')+X(p.x).toFixed(1)+' '+Y(p.y).toFixed(1)+' ';});var _sc=s.cls||'avg';if(_ep==='PREDICTIVE')_sc+=' predictive';out+='<path class="'+_sc+'"'+_sa+' d="'+d.trim()+'"/>'; }
  });
  out+='</svg>';
  /* the numbers themselves, for anyone who cannot read the shape */
  if(pv.length&&pv.length<=60){var labels={};(o.xLabels||[]).forEach(function(l){labels[l.x]=l.label;});
    out+='<div class="sr-only"><table><caption>'+esc(o.aria||o.title||'chart')+' \u2014 data</caption><tbody>'+
      pv.map(function(p){return '<tr><th scope="row">'+esc(String(labels[p.x]!=null?labels[p.x]:p.x))+'</th><td>'+esc(o.yFmt?o.yFmt(p.y):fmtNum(p.y,2))+'</td></tr>';}).join('')+'</tbody></table></div>';}
  return out;
}
function chartLegend(items){return '<div class="legend">'+items.map(function(i){return '<span class="lg-'+i[0]+'">'+i[1]+'</span>';}).join('')+'</div>';}
function xLabelsFor(dates,n){var out=[];if(!dates.length)return out;var step=Math.max(1,Math.floor(dates.length/(n||5)));for(var i=0;i<dates.length;i+=step)out.push({x:dates[i].x,label:shortDate(dates[i].date)});return out;}
/* ---- toast / announce ---- */
var _toastT=null;
var _WELCOME_SHOWN=false;
/* A message whose premise no longer holds must not outlive it. */
function dismissWelcome(){
  if(!_WELCOME_SHOWN)return false;
  var t=(typeof document!=='undefined')&&document.getElementById('toast');
  if(t&&/Welcome\. Set up a profile/.test(t.textContent))t.className='toast';
  _WELCOME_SHOWN=false;return true;
}
function toast(msg,opts){opts=opts||{};var t=document.getElementById('toast');if(!t)return;t.innerHTML=msg+(opts.undo?' <button class="link" data-act="undo.last">Undo</button>':'');t.className='toast show'+(opts.tone?' '+opts.tone:'');clearTimeout(_toastT);_toastT=setTimeout(function(){t.className='toast';},opts.ms||3200);announce(msg.replace(/<[^>]+>/g,''));}
function announce(text){if(typeof document==='undefined'||!document.getElementById)return;var a=document.getElementById('a11yAnnouncer');if(a){a.textContent='';setTimeout(function(){a.textContent=text;},30);}}
/* ---------------- FOCUS PRESERVATION ACROSS RE-RENDER ----------------
   Replacing innerHTML destroys the focused node, so a field bound to the `input` event lost focus after the
   first character and the on-screen keyboard closed. Typing a word meant tapping the field again for every
   letter, which makes the app effectively unusable for text.

   Fixing each offending action one at a time would leave the next one to be written broken, so focus and
   caret are preserved around EVERY re-render. An element is re-found by its own identity — id, or the
   data-act/data-arg pair it is addressed by everywhere else in this codebase — and its selection restored. */
function _focusSignature(el){
  if(!el||el===document.body)return null;
  var tag=el.tagName;
  if(tag!=='INPUT'&&tag!=='TEXTAREA'&&tag!=='SELECT')return null;
  return {id:el.id||null,
    act:el.getAttribute('data-act'),arg:el.getAttribute('data-arg'),
    type:el.getAttribute('type'),
    /* Selection only exists on text-like inputs; reading it on a date or number throws in some browsers. */
    start:(function(){try{return el.selectionStart;}catch(e){return null;}})(),
    end:(function(){try{return el.selectionEnd;}catch(e){return null;}})()};
}
function _restoreFocus(sig){
  if(!sig)return;
  var el=null;
  if(sig.id)el=document.getElementById(sig.id);
  if(!el&&sig.act){
    var sel='[data-act="'+sig.act.replace(/"/g,'')+'"]'+
      (sig.arg!=null?'[data-arg="'+String(sig.arg).replace(/"/g,'')+'"]':'');
    try{el=document.querySelector(sel);}catch(e){el=null;}
  }
  if(!el||el===document.activeElement)return;
  try{
    el.focus({preventScroll:true});
    if(sig.start!=null&&el.setSelectionRange&&/^(text|search|tel|url|password|)$/.test(sig.type||''))
      el.setSelectionRange(sig.start,sig.end!=null?sig.end:sig.start);
  }catch(e){}
}
/* Every re-render goes through here, so nothing has to remember to do this. */
function _preservingFocus(fn){
  var sig=_focusSignature(document.activeElement);
  var r=fn();
  if(sig)_restoreFocus(sig);
  return r;
}
function setHTML(id,html){
  var el=document.getElementById(id);
  if(!el)return;
  var sig=el.contains(document.activeElement)?_focusSignature(document.activeElement):null;
  el.innerHTML=html;
  if(sig)_restoreFocus(sig);
}

/* ============================================================================
   UPDATE IN PLACE, NEVER REPLACING THE FOCUSED FIELD.
   Re-rendering a sheet replaced its whole body, and then restored focus to the new copy of the field being typed in.
   On a desktop that is invisible; on a phone the field that had the keyboard is gone, so the keyboard closes after
   every character. Found in H0 by typing character by character and checking the focused element survives: the phase
   form's targets, the food portion amount and the exercise search all failed. When a field in the region has focus,
   the new markup is merged into the existing nodes instead: changed text and attributes are updated, new elements
   inserted, stale ones removed \u2014 and the focused element is never replaced, moved or given a new value.
   ============================================================================ */
function _sameKind(a,b){
  if(a.nodeType!==b.nodeType)return false;
  if(a.nodeType!==1)return true;
  if(a.tagName!==b.tagName)return false;
  var ia=a.getAttribute('id'),ib=b.getAttribute('id');if((ia||ib)&&ia!==ib)return false;
  if(a.tagName==='INPUT'&&a.type!==b.getAttribute('type')&&b.getAttribute('type'))return false;
  return true;
}
function _morphNode(o,n,focused){
  if(o.nodeType===3||o.nodeType===8){if(o.nodeValue!==n.nodeValue)o.nodeValue=n.nodeValue;return;}
  if(o.nodeType!==1)return;
  var isF=(o===focused);
  var i,a;
  for(i=o.attributes.length-1;i>=0;i--){a=o.attributes[i].name;if(!n.hasAttribute(a)&&!(isF&&a==='value'))o.removeAttribute(a);}
  for(i=0;i<n.attributes.length;i++){a=n.attributes[i];if(isF&&a.name==='value')continue;if(o.getAttribute(a.name)!==a.value)o.setAttribute(a.name,a.value);}
  if((o.tagName==='INPUT'||o.tagName==='TEXTAREA'||o.tagName==='SELECT')&&!isF){
    var nv=n.tagName==='TEXTAREA'?n.textContent:n.getAttribute('value');if(o.tagName!=='SELECT'&&nv!=null&&o.value!==nv)o.value=nv;
    if(o.tagName==='TEXTAREA')return;
  }
  if(isF&&o.tagName==='TEXTAREA')return;
  _morphChildren(o,n,focused);
}
function _morphChildren(op,np,focused){
  var o=op.firstChild,n=np.firstChild;
  while(n){var nextN=n.nextSibling;
    if(!o){op.appendChild(n);}
    else if(_sameKind(o,n)){_morphNode(o,n,focused);o=o.nextSibling;}
    else if(focused&&o.contains&&o.contains(focused)){op.insertBefore(n,o);}   /* never remove the branch holding focus */
    else{var nx=o.nextSibling;op.replaceChild(n,o);o=nx;}
    n=nextN;}
  while(o){var nx2=o.nextSibling;if(!(focused&&o.contains&&o.contains(focused)))op.removeChild(o);o=nx2;}
}
function setHTMLKeepingFocus(el,html){
  var f=document.activeElement;
  var editing=f&&el.contains(f)&&(f.tagName==='TEXTAREA'||(f.tagName==='INPUT'&&!/^(button|checkbox|radio|range|file|submit)$/.test(f.type)));
  if(!editing){el.innerHTML=html;return;}
  var tpl=document.createElement('div');tpl.innerHTML=html;_morphChildren(el,tpl,f);
}
