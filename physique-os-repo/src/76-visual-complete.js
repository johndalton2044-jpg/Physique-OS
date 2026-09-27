/* ============================================================================
   REGION: PRESENTATION COMPLETION \u2014 the last declared capabilities
   Everything the visual specification still names with nothing behind it. Same discipline throughout: a
   registry that states what a thing is for and where it fails, and an audit that checks the registry against
   itself rather than trusting that it was filled in carefully.
   ============================================================================ */

/* ---------------- \u00a76 typography roles ---------------- */
var TYPE_ROLES={
  display:{size:19,weight:600,role:'one per screen, at most'},
  title:{size:15,weight:600,role:'card and section headings'},
  body:{size:13,weight:400,role:'the default for prose'},
  bodySmall:{size:11.5,weight:400,role:'secondary prose and sub-rows'},
  annotation:{size:10,weight:400,role:'chart labels and provenance',
    caution:'below about 10px text stops being readable on a phone held at arm\u2019s length'},
  metricLarge:{size:26,weight:600,numeric:'tabular',role:'the single figure a screen is about'},
  metric:{size:15,weight:600,numeric:'tabular',role:'figures in rows'},
  mono:{size:11,weight:400,family:'mono',role:'identifiers, classes and code'}
};
function typeRoleAudit(){
  var issues=[];
  Object.keys(TYPE_ROLES).forEach(function(k){
    var r=TYPE_ROLES[k];
    if(r.size<10&&!r.caution)issues.push(k+': below 10px with no stated caution');
    if(!r.role)issues.push(k+': no declared use');
  });
  return {roles:Object.keys(TYPE_ROLES).length,issues:issues,ok:issues.length===0,
    note:'Each role states what it is for and, where it is small enough to matter, what it costs.'};
}
/* ---------------- \u00a722 uncertainty visualisation ---------------- */
/* Renamed from UNCERTAINTY_STYLES: 89-presentation-governance.js already owns that name for a different
   thing — a map from the KIND of uncertainty to the name of a style. This is the registry of what those
   style names actually render as. Two modules had independently produced half of one idea, and the merge
   check below is what makes them one: every style the map names must exist here. */
var UNCERTAINTY_RENDER_STYLES={
  /* Added by the join: the kind-map named these and nothing defined them, so four of nine uncertainty kinds
     pointed at a style no renderer knew. That is the exact failure the join exists to surface. */
  measurement:{render:'errorBar',opacity:1,
    use:'the spread of a single measurement, where the uncertainty belongs to the instrument rather than the model',
    note:'drawn on the point, not around the line, because it is not a range the value moves through'},
  dashed:{render:'dashed',opacity:0.8,
    use:'parameter uncertainty — the shape is known and its position is not',
    note:'a dashed centre line rather than a band, because the whole line is provisional'},
  'shaded-interval':{render:'shaded',opacity:0.18,
    use:'a forecast or a causal estimate, where the interval widens with distance',
    note:'the same rendering as a band; named separately because the kind of uncertainty differs even where the drawing does not'},
  band:{render:'shaded',opacity:0.18,
    use:'a continuous interval around a line',
    note:'the default \u2014 area reads as range without implying a value anywhere in it'},
  hatched:{render:'hatched',opacity:0.3,
    use:'an interval that must not be mistaken for data',
    note:'diagonal fill survives greyscale and colour blindness where a tint does not'},
  faded:{render:'faded',opacity:0.45,
    use:'the far end of a forecast, where confidence decays with horizon'},
  ghosted:{render:'ghosted',opacity:0.25,
    use:'a value that exists but is not being asserted \u2014 a superseded reading, a replayed future'},
  errorBar:{render:'bars',opacity:1,
    use:'discrete points where a band would imply continuity that is not there'},
  none:{render:'none',opacity:0,
    use:'MEASURED values only',
    caution:'drawing nothing asserts certainty, so this is correct only where the number genuinely is the observation'}
};
function uncertaintyStyleFor(cls,shape){
  if(cls==='MEASURED')return 'none';
  if(cls==='PREDICTIVE')return shape==='point'?'errorBar':'faded';
  if(cls==='PRIOR'||cls==='HEURISTIC')return 'hatched';
  if(cls==='MISSING')return 'ghosted';
  return shape==='point'?'errorBar':'band';
}
/* ---------------- \u00a717/\u00a749 visualization engine and interaction ---------------- */
var VIZ_CAPABILITIES={
  annotation:{use:'marking an event on a series \u2014 a phase start, an intervention',
    rule:'an annotation labels a real record, never a decoration'},
  highlighting:{use:'bringing one series forward without hiding the others',
    rule:'never by changing the highlighted value\u2019s scale'},
  downsampling:{use:'drawing fewer points than the data contains',
    rule:'largest-triangle-three-buckets, which preserves extremes \u2014 naive every-nth sampling deletes the peaks, which are usually the point',
    threshold:400},
  crosshair:{use:'reading a value at a position',rule:'snaps to a real observation, never to an interpolated one'},
  inspection:{use:'opening the record behind a point',rule:'every rendered point must be traceable to its source'},
  brushing:{use:'selecting a range',rule:'selection changes what is shown and never what is computed'}
};
var INTERACTIONS={
  tap:{use:'primary action',target:44},
  longPress:{use:'secondary action',target:44,
    caution:'undiscoverable on its own; never the only route to anything'},
  swipe:{use:'navigation between adjacent views',target:null,
    caution:'collides with the system back gesture at screen edges'},
  pinch:{use:'zoom on a chart',target:null,
    caution:'not available to one-handed use; every pinch action needs a button equivalent'},
  drag:{use:'reordering',target:44},
  scroll:{use:'the primary way through content',target:null}
};
function downsample(points,limit){
  limit=limit||VIZ_CAPABILITIES.downsampling.threshold;
  if(!points||points.length<=limit)return {points:points||[],downsampled:false,
    note:'below the threshold, so every point is drawn'};
  /* Largest-triangle-three-buckets: keeps the shape, including the extremes that naive sampling deletes. */
  var out=[points[0]];
  var every=(points.length-2)/(limit-2);
  var a=0;
  for(var i=0;i<limit-2;i++){
    var rangeStart=Math.floor((i+1)*every)+1;
    var rangeEnd=Math.min(Math.floor((i+2)*every)+1,points.length);
    var avgX=0,avgY=0,n=rangeEnd-rangeStart;
    for(var j=rangeStart;j<rangeEnd;j++){avgX+=j;avgY+=points[j].y;}
    avgX/=Math.max(1,n);avgY/=Math.max(1,n);
    var start=Math.floor(i*every)+1,end=Math.floor((i+1)*every)+1;
    var best=-1,bestArea=-1;
    for(var k=start;k<end&&k<points.length;k++){
      var area=Math.abs((a-avgX)*(points[k].y-points[a].y)-(a-k)*(avgY-points[a].y))/2;
      if(area>bestArea){bestArea=area;best=k;}
    }
    if(best>=0){out.push(points[best]);a=best;}
  }
  out.push(points[points.length-1]);
  return {points:out,downsampled:true,from:points.length,to:out.length,
    note:'Reduced by largest-triangle-three-buckets, which preserves peaks and troughs. Every-nth sampling would delete exactly the extremes a reader is looking for.'};
}
/* ---------------- \u00a740/\u00a741/\u00a746 dashboard, widgets, view registry ---------------- */
var WIDGETS={
  weightTrend:{widgetId:'weightTrend',title:'Weight trend',size:'wide',
    reads:['weight'],permissions:['read:observations'],chart:'line',refresh:'on-change'},
  todayEnergy:{widgetId:'todayEnergy',title:'Energy today',size:'half',
    reads:['calories','tdee'],permissions:['read:foodLogs','read:models'],chart:null,refresh:'on-change'},
  readiness:{widgetId:'readiness',title:'Readiness',size:'half',
    reads:['fatigue','soreness','sleep'],permissions:['read:observations'],chart:'sparkline',refresh:'daily'},
  nextSession:{widgetId:'nextSession',title:'Next session',size:'wide',
    reads:['sessions','program'],permissions:['read:sessions'],chart:null,refresh:'daily'},
  adherence:{widgetId:'adherence',title:'Adherence',size:'half',
    reads:['foodLogs'],permissions:['read:foodLogs'],chart:'bar',refresh:'daily'},
  attention:{widgetId:'attention',title:'Needs attention',size:'wide',
    reads:['domains'],permissions:['read:models'],chart:null,refresh:'on-change'}
};
var DASHBOARD_LAYOUTS={
  default:{label:'Default',widgets:['attention','weightTrend','todayEnergy','readiness']},
  training:{label:'Training',widgets:['nextSession','readiness','attention']},
  nutrition:{label:'Nutrition',widgets:['todayEnergy','adherence','weightTrend']},
  minimal:{label:'Minimal',widgets:['attention']}
};
/* Superseded by the canonical dashboard system in the governance module. Kept as a caller so existing
   references keep working, but it no longer maintains its own widget set: it resolves through the one
   registry. Two dashboard systems had arrived from two branches; this is the reconciliation. */
function dashboardCompose(layoutId){
  if(typeof composeDashboardSpec==='function'){
    var spec=(layoutId&&BUILTIN_DASHBOARDS[layoutId])||currentDashboard();
    var c=composeDashboardSpec(spec);
    if(c.status==='ok')return {status:'ok',layout:spec.id,
      widgets:c.sections.reduce(function(a,s){return a.concat(s.widgets);},[]),missing:[],
      note:'Resolved through the canonical widget registry.'};
  }
  return _legacyDashboardCompose(layoutId);
}
function _legacyDashboardCompose(layoutId){
  var l=DASHBOARD_LAYOUTS[layoutId||(DB.settings&&DB.settings.dashboard)||'default'];
  if(!l)return {status:'unknown-layout'};
  var missing=l.widgets.filter(function(w2){return !WIDGETS[w2];});
  return {status:missing.length?'invalid':'ok',layout:l.label,
    widgets:l.widgets.filter(function(w2){return WIDGETS[w2];}).map(function(w2){return WIDGETS[w2];}),
    missing:missing,
    note:'A layout is a list of widget ids. A widget declares what it reads and what permission that needs, so a layout cannot quietly grant access to something the user did not expect it to read.'};
}
function widgetAudit(){
  var issues=[];
  Object.keys(WIDGETS).forEach(function(k){
    var wd=WIDGETS[k];
    if(wd.widgetId!==k)issues.push(k+': widgetId does not match its key');
    if(!wd.permissions||!wd.permissions.length)issues.push(k+': declares no permissions');
    if(!wd.reads||!wd.reads.length)issues.push(k+': declares nothing it reads');
    if(wd.chart&&typeof CHART_TYPES!=='undefined'&&!CHART_TYPES[wd.chart])
      issues.push(k+': names chart type "'+wd.chart+'" which is not declared');
  });
  Object.keys(DASHBOARD_LAYOUTS).forEach(function(k){
    DASHBOARD_LAYOUTS[k].widgets.forEach(function(w2){
      if(!WIDGETS[w2])issues.push('layout '+k+' references unknown widget '+w2);});
  });
  return {widgets:Object.keys(WIDGETS).length,layouts:Object.keys(DASHBOARD_LAYOUTS).length,
    issues:issues,ok:issues.length===0,
    note:'Every widget declares an id, what it reads, and the permission that reading needs; every layout references widgets that exist.'};
}
/* ---------------- \u00a755 clipping and truncation ---------------- */
function clippingAudit(){
  var findings=[];
  if(typeof document==='undefined')
    return {findings:[],readable:false,inconclusive:true,
      note:'No DOM in this context, so nothing was measured. Reported as inconclusive rather than as a pass.'};
  var els=[].slice.call(document.querySelectorAll('.row,.card,.pill,.btn,.hint'));
  var clipped=0,truncated=0;
  els.forEach(function(el){
    if(el.scrollWidth>el.clientWidth+2){clipped++;
      if(clipped<=3)findings.push('horizontally clipped: '+(el.className||el.tagName)+' \u2014 "'+
        String(el.textContent||'').trim().slice(0,40)+'"');}
    if(el.scrollHeight>el.clientHeight+2)truncated++;
  });
  return {checked:els.length,clipped:clipped,truncated:truncated,
    findings:findings,readable:true,ok:clipped===0,
    note:'Elements whose content is wider than their box. A pill that overflows its container was shipped once in this project and was only noticed from a screenshot.'};
}
/* ---------------- \u00a756 render performance ---------------- */
function renderPerformance(samples){
  samples=samples||[];
  if(!samples.length)return {status:'insufficient',need:['timed renders to measure']};
  var sorted=samples.slice().sort(function(a,b){return a-b;});
  var p50=sorted[Math.floor(sorted.length*0.5)];
  var p95=sorted[Math.floor(sorted.length*0.95)]||sorted[sorted.length-1];
  /* A frame budget is 16.7ms; anything past that drops frames, and past ~100ms feels like a pause. */
  var thrashing=samples.filter(function(x){return x>16.7;}).length;
  return {status:'ok',samples:samples.length,
    medianMs:round(p50,1),p95Ms:round(p95,1),
    latencyBudgetMs:16.7,
    overBudget:thrashing,thrashing:thrashing>samples.length*0.2,
    verdict:p95<=16.7?'every render fits in a frame':
      (p95<=100?'some renders drop frames but nothing feels like a pause':
        'renders past 100ms, which reads as the app hesitating'),
    note:'Render latency against the frame budget. Layout thrashing shows as a long tail rather than a high median, which is why the 95th percentile is the number that matters.'};
}
/* ---------------- \u00a758 three-dimensional rendering ---------------- */
/* THREE_D_POLICY removed in H0: defined but never read (see docs/architecture/presentation-policies.md where it recorded a decision). */
/* ---------------- \u00a724/\u00a725 muscle and movement visualisation ---------------- */
/* ---------------- STEP 13: ONE ANATOMY, KEYED BY THE ONTOLOGY ----------------
   MUSCLE_MAP used to be a private muscle list: traps, rhomboids, lowerBack, obliques, calves. Four of those
   do not exist in the exercise ontology, and the models never emit them — exposureOf() and the fatigue
   model speak the ontology's language (upperback, erectors). So the coverage visual looked for "traps" and
   "rhomboids", found nothing, and reported them as NONE RECORDED while the upper back was being trained
   heavily. It told the person they were neglecting muscles they train.

   There is now one anatomy, keyed by MUSCLE_GROUPS, and every presentation of the body reads it. Each entry
   says where the muscle is drawn; MUSCLE_MAP is the same object, so the old name keeps working. */
var ANATOMY={
  chest:{group:'push',anterior:true,view:'front'},
  delts:{group:'push',anterior:true,view:'front'},
  sidedelts:{group:'push',anterior:true,view:'back'},
  biceps:{group:'pull',anterior:true,view:'front'},
  forearms:{group:'pull',anterior:true,view:'front'},
  abs:{group:'core',anterior:true,view:'front'},
  quads:{group:'legs',anterior:true,view:'front'},
  triceps:{group:'push',anterior:false,view:'back'},
  lats:{group:'pull',anterior:false,view:'back'},
  upperback:{group:'pull',anterior:false,view:'back'},
  erectors:{group:'core',anterior:false,view:'back'},
  glutes:{group:'legs',anterior:false,view:'back'},
  hamstrings:{group:'legs',anterior:false,view:'back'},
  calves:{group:'legs',anterior:false,view:'back'},
  back:{group:'pull',anterior:false,view:'back',aggregateOf:['lats','upperback','erectors']}
};
/* Geometry, kept apart from the anatomy mapping as §27 requires: the shapes a muscle is drawn with are a
   presentation decision and must be replaceable without touching what a muscle IS. No training value
   appears here — load arrives as a data overlay at render time. */
var ANATOMY_GEOMETRY={
  chest:[{cx:44,cy:62,rx:14,ry:9},{cx:76,cy:62,rx:14,ry:9}],
  delts:[{cx:27,cy:52,rx:8,ry:8},{cx:93,cy:52,rx:8,ry:8}],
  sidedelts:[{cx:147,cy:52,rx:7,ry:8},{cx:213,cy:52,rx:7,ry:8}],
  biceps:[{cx:22,cy:80,rx:6,ry:12},{cx:98,cy:80,rx:6,ry:12}],
  forearms:[{cx:18,cy:108,rx:5,ry:13},{cx:102,cy:108,rx:5,ry:13}],
  abs:[{cx:60,cy:92,rx:11,ry:18}],
  quads:[{cx:48,cy:150,rx:10,ry:24},{cx:72,cy:150,rx:10,ry:24}],
  triceps:[{cx:142,cy:80,rx:6,ry:12},{cx:218,cy:80,rx:6,ry:12}],
  lats:[{cx:164,cy:82,rx:10,ry:16},{cx:196,cy:82,rx:10,ry:16}],
  upperback:[{cx:180,cy:58,rx:20,ry:10}],
  erectors:[{cx:174,cy:100,rx:5,ry:14},{cx:186,cy:100,rx:5,ry:14}],
  glutes:[{cx:170,cy:124,rx:11,ry:10},{cx:190,cy:124,rx:11,ry:10}],
  hamstrings:[{cx:168,cy:156,rx:9,ry:20},{cx:192,cy:156,rx:9,ry:20}],
  calves:[{cx:168,cy:198,rx:7,ry:14},{cx:192,cy:198,rx:7,ry:14}],
  back:[]
};
var MUSCLE_MAP=ANATOMY;
function muscleCoverageVisual(days){
  var es=null;try{es=effectiveSets(days||7);}catch(e){}
  if(!es||!es.rows)return {status:'insufficient',need:['logged sessions']};
  var by={};
  es.rows.forEach(function(r){by[r.muscle]=r.effective;});
  /* An aggregate is not a muscle: listing it would show "none recorded" for something that is only ever
     trained through its parts. */
  var rows=Object.keys(MUSCLE_MAP).filter(function(m){return !MUSCLE_MAP[m].aggregateOf;}).map(function(m){
    var v=by[m]||0;
    return {muscle:m,group:MUSCLE_MAP[m].group,anterior:MUSCLE_MAP[m].anterior,
      effective:round(v,1),
      /* "Undertraining" is a comparison against a convention, not a diagnosis. */
      status:v===0?'none recorded':(v<4?'below the usual convention':'within the usual convention')};
  }).sort(function(a,b){return a.effective-b.effective;});
  return {status:'ok',cls:'HEURISTIC',rows:rows,
    untrained:rows.filter(function(r){return r.effective===0;}).map(function(r){return r.muscle;}),
    note:'Effective sets per muscle, grouped and split anterior from posterior so a front-only programme is visible at a glance.',
    caveat:'"Below the convention" compares against a population heuristic of roughly ten sets a week, not against anything measured about you. Undertraining is a word this cannot earn.'};
}
/* MOVEMENT_VISUAL removed in H0: defined but never read (see docs/architecture/presentation-policies.md where it recorded a decision). */
/* ---------------- one audit over the lot ---------------- */
function visualCompleteAudit(){
  var parts={
    typeRoles:typeRoleAudit(),
    widgets:widgetAudit(),
    uncertainty:{styles:Object.keys(UNCERTAINTY_RENDER_STYLES).length,
      issues:Object.keys(UNCERTAINTY_RENDER_STYLES).filter(function(k){
        return !UNCERTAINTY_RENDER_STYLES[k].use;}).map(function(k){return k+': no declared use';})},
    interactions:{count:Object.keys(INTERACTIONS).length,
      issues:Object.keys(INTERACTIONS).filter(function(k){
        var i=INTERACTIONS[k];return i.target!=null&&i.target<44;}).map(function(k){
        return k+': target below 44px';})},
    capabilities:{count:Object.keys(VIZ_CAPABILITIES).length,
      issues:Object.keys(VIZ_CAPABILITIES).filter(function(k){
        return !VIZ_CAPABILITIES[k].rule;}).map(function(k){return k+': no rule';})}
  };
  var all=[];
  Object.keys(parts).forEach(function(k){
    (parts[k].issues||[]).forEach(function(f){all.push({area:k,finding:f});});});
  return {parts:parts,findings:all,ok:all.length===0,cls:'POLICY',
    note:'The last registries the visual specification names, each checked against the rule that makes it worth having.'};
}

/* The join between the two registries, checked rather than assumed. */
function uncertaintyStyleResolution(){
  var unresolved=[],rows=[];
  try{
    Object.keys(UNCERTAINTY_STYLES).forEach(function(kind){
      var name=UNCERTAINTY_STYLES[kind];
      var hit=UNCERTAINTY_RENDER_STYLES[name]||
        Object.keys(UNCERTAINTY_RENDER_STYLES).filter(function(k){
          return UNCERTAINTY_RENDER_STYLES[k].render===name;})[0];
      rows.push({kind:kind,style:name,resolves:!!hit});
      if(!hit)unresolved.push(kind+' \u2192 '+name);
    });
  }catch(e){}
  return {rows:rows,unresolved:unresolved,ok:unresolved.length===0,
    note:'Every uncertainty KIND names a style, and every style must exist in the render registry. Two modules had each built half of this independently; without the join a kind could name a style nothing knows how to draw.',
    caveat:'Resolution means the name exists. Whether the rendering is the right choice for that kind of uncertainty is a design judgement no check settles.'};
}

/* ---------------- STEP 13: THE BODY MAP ----------------
   Drawn from the anatomy above and coloured by the fatigue model, never by its own arithmetic. Three states
   are kept visibly distinct, because conflating them is the error this whole system exists to avoid:
     • a muscle with load — filled, intensity proportional to its share of the highest load;
     • a muscle with none in the window — outlined only, a measured zero;
     • no training record at all — hatched, a GAP, because nothing was measured.
   Colour is never the only channel: every region carries a title, and a text table follows the drawing. */
function bodyMapModel(days){
  days=days||14;
  var fc=null;try{fc=fatigueCompartments(days);}catch(e){}
  var hasRecord=(DB.sessions||[]).some(function(s){return (s.sets||[]).length;});
  if(!hasRecord)return {status:'no-data',cls:'HEURISTIC',days:days,rows:[],
    note:'No training has been recorded, so there is nothing to draw. The map is shown hatched rather than empty, because empty would read as zero load.'};
  var local=(fc&&fc.local)||{};
  var max=0;Object.keys(local).forEach(function(k){if(local[k]>max)max=local[k];});
  var rows=Object.keys(ANATOMY).filter(function(m){return !ANATOMY[m].aggregateOf;}).map(function(m){
    var v=local[m]!=null?local[m]:0;
    return {muscle:m,label:(MUSCLE_GROUPS&&MUSCLE_GROUPS[m])||m,view:ANATOMY[m].view,
      value:round(v,2),share:max?round(v/max,3):0,state:v>0?'loaded':'none'};
  });
  return {status:'ok',cls:(fc&&fc.cls)||'HEURISTIC',days:days,rows:rows,max:round(max,2),
    note:'Local fatigue per muscle over '+days+' days, from the fatigue model, drawn on the anatomy the models themselves use.',
    caveat:'This is an index of accumulated load with exponential decay, not a measurement of tissue state. It says where training has landed, not how recovered a muscle is.'};
}
function renderBodyMap(model){
  model=model||bodyMapModel();
  var W=240,H=230;
  var hatch='<defs><pattern id="bmHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'+
    '<line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" stroke-width="1.2" opacity=".45"/></pattern></defs>';
  /* Silhouettes: a plain outline for each view, so an unloaded muscle still has a body around it. */
  var sil=function(ox){return '<g class="bm-sil" transform="translate('+ox+',0)">'+
    '<circle cx="60" cy="22" r="13"/><rect x="36" y="40" width="48" height="80" rx="16"/>'+
    '<rect x="12" y="44" width="16" height="78" rx="8"/><rect x="92" y="44" width="16" height="78" rx="8"/>'+
    '<rect x="38" y="118" width="20" height="100" rx="9"/><rect x="62" y="118" width="20" height="100" rx="9"/></g>';};
  var byM={};(model.rows||[]).forEach(function(r){byM[r.muscle]=r;});
  var regions='';
  Object.keys(ANATOMY).forEach(function(m){
    var a=ANATOMY[m];if(a.aggregateOf)return;
    var r=byM[m];
    var title=(MUSCLE_GROUPS&&MUSCLE_GROUPS[m]||m)+(model.status!=='ok'?': no record':
      (r&&r.state==='loaded'?': load '+r.value:': none in window'));
    (ANATOMY_GEOMETRY[m]||[]).forEach(function(e){
      var cls='bm-r',style='';
      if(model.status!=='ok'){cls+=' bm-gap';style=' fill="url(#bmHatch)"';}
      else if(r&&r.state==='loaded'){cls+=' bm-load';style=' style="fill-opacity:'+(0.18+0.72*r.share).toFixed(2)+'"';}
      else cls+=' bm-none';
      regions+='<ellipse class="'+cls+'" data-muscle="'+m+'" cx="'+e.cx+'" cy="'+e.cy+'" rx="'+e.rx+'" ry="'+e.ry+'"'+style+
        '><title>'+esc(title)+'</title></ellipse>';
    });
  });
  var svg='<svg class="bodymap" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Where training load has landed, front and back">'+
    hatch+sil(0)+sil(120)+regions+
    '<text class="bm-cap" x="60" y="228" text-anchor="middle">front</text>'+
    '<text class="bm-cap" x="180" y="228" text-anchor="middle">back</text></svg>';
  /* The same information as text, so colour and position are never the only way to read it. */
  var table=model.status!=='ok'?'<div class="hint">'+esc(model.note)+'</div>':
    '<div class="bm-list">'+model.rows.slice().sort(function(a,b){return b.value-a.value;}).map(function(r){
      return uiRow(esc(r.label),r.state==='loaded'?String(r.value):'none',
        {sub:r.view+(r.state==='loaded'?(' \u00b7 '+Math.round(r.share*100)+'% of the highest'):'')});}).join('')+'</div>';
  return {status:model.status,svg:svg,table:table,cls:model.cls};
}
function anatomyAudit(){
  var issues=[];
  Object.keys(MUSCLE_GROUPS||{}).forEach(function(m){if(!ANATOMY[m])issues.push(m+': in the ontology but not drawable');});
  Object.keys(ANATOMY).forEach(function(m){
    if(!(MUSCLE_GROUPS||{})[m])issues.push(m+': drawn but not in the ontology');
    var a=ANATOMY[m];
    if(!a.aggregateOf&&!(ANATOMY_GEOMETRY[m]||[]).length)issues.push(m+': a muscle with no region to draw');
    (a.aggregateOf||[]).forEach(function(p){if(!ANATOMY[p])issues.push(m+': aggregates unknown muscle '+p);});
  });
  /* Every muscle any exercise can load must be drawable, or load would land somewhere invisible. */
  var emitted={};
  (DB.sessions||[]).forEach(function(s){(s.sets||[]).forEach(function(st){
    try{Object.keys(exposureOf(st).muscles||{}).forEach(function(m){emitted[m]=1;});}catch(e){}});});
  Object.keys(emitted).forEach(function(m){if(!ANATOMY[m])issues.push(m+': loaded by training but has no place on the body map');});
  return {muscles:Object.keys(ANATOMY).length,issues:issues,ok:issues.length===0,
    note:'The anatomy must match the ontology exactly, and every muscle training can load must be drawable.'};
}

/* ============================================================================
   STEP 13 (continued): MOVEMENT, MOBILITY, PROGRAM AND NUTRITION RENDERERS
   Built to \u00a728\u2013\u00a730 of the implementation direction. The rule they share: SEMANTICS never live in the
   drawing. A movement is joint positions in a body coordinate system \u2014 origin at the feet, one unit is one
   body height, y up \u2014 which knows nothing about pixels. A separate transform maps it onto a viewBox, and the
   layers (segments, joints, range-of-motion arcs, force vectors, labels, visual state) are drawn
   independently, so a canvas or 3D renderer could replace the SVG without redefining a single movement.
   ============================================================================ */

/* ---------------- the skeleton: joints and segments ----------------
   Every articulating joint is a JOINTS ontology id. head and toe are structural end-points, not joints, and
   are declared as such so the audit can tell them apart from a misspelling. */
var SKELETON_STRUCTURAL=['head','toe'];
var SKELETON_JOINTS=['ankle','knee','hip','lumbar','thoracic','shoulder','cervical','elbow','wrist'];
var SKELETON_SEGMENTS=[['toe','ankle'],['ankle','knee'],['knee','hip'],['hip','lumbar'],['lumbar','thoracic'],
  ['thoracic','shoulder'],['thoracic','cervical'],['cervical','head'],['shoulder','elbow'],['elbow','wrist']];
/* Standing, side view facing right. Every other position is expressed against this. */
var STANDING={toe:[0.08,0],ankle:[0,0.04],knee:[0,0.28],hip:[0,0.52],lumbar:[0,0.60],thoracic:[0,0.72],
  shoulder:[0,0.80],cervical:[0,0.86],head:[0.01,0.93],elbow:[0,0.64],wrist:[0,0.50]};
function _pose(over){var p={};Object.keys(STANDING).forEach(function(k){p[k]=(over&&over[k])||STANDING[k];});return p;}
/* ---------------- movement patterns: every pattern in the exercise library ----------------
   primary: the joint whose angle defines the movement. load: where external load acts, for the force vector.
   rom: 'angle' draws an arc at the primary joint; 'translation' (a shrug) has no arc, only displacement. */
var MOVEMENT_PATTERNS={
  squat:{primary:'knee',load:'shoulder',rom:'angle',start:_pose(),end:_pose({knee:[0.17,0.23],hip:[-0.10,0.27],lumbar:[-0.06,0.35],
    thoracic:[0.02,0.46],shoulder:[0.05,0.53],cervical:[0.08,0.58],head:[0.10,0.64],elbow:[0.13,0.50],wrist:[0.16,0.55]})},
  lunge:{primary:'knee',load:'wrist',rom:'angle',start:_pose(),end:_pose({knee:[0.12,0.14],hip:[0,0.36],lumbar:[0,0.44],
    thoracic:[0,0.56],shoulder:[0,0.64],cervical:[0,0.70],head:[0.01,0.77],elbow:[0,0.48],wrist:[0,0.34]})},
  hinge:{primary:'hip',load:'wrist',rom:'angle',start:_pose(),end:_pose({hip:[-0.08,0.50],knee:[0.04,0.28],lumbar:[-0.02,0.54],
    thoracic:[0.12,0.60],shoulder:[0.22,0.62],cervical:[0.28,0.64],head:[0.32,0.66],elbow:[0.22,0.48],wrist:[0.22,0.36]})},
  'horizontal push':{primary:'shoulder',load:'wrist',rom:'angle',
    start:_pose({elbow:[-0.08,0.72],wrist:[0.02,0.78]}),end:_pose({elbow:[0.12,0.80],wrist:[0.24,0.80]})},
  'incline push':{primary:'shoulder',load:'wrist',rom:'angle',
    start:_pose({elbow:[-0.08,0.74],wrist:[0.02,0.84]}),end:_pose({elbow:[0.10,0.86],wrist:[0.20,0.95]})},
  'vertical push':{primary:'shoulder',load:'wrist',rom:'angle',
    start:_pose({elbow:[0.06,0.74],wrist:[0.04,0.86]}),end:_pose({elbow:[0.02,0.96],wrist:[0.02,1.10]})},
  'vertical pull':{primary:'shoulder',load:'wrist',rom:'angle',
    start:_pose({elbow:[0.02,0.98],wrist:[0.02,1.10]}),end:_pose({elbow:[0.06,0.70],wrist:[0.05,0.84]})},
  'horizontal pull':{primary:'elbow',load:'wrist',rom:'angle',
    start:_pose({elbow:[0.16,0.78],wrist:[0.30,0.78]}),end:_pose({elbow:[-0.10,0.72],wrist:[0.02,0.74]})},
  'elbow flexion':{primary:'elbow',load:'wrist',rom:'angle',
    start:_pose({wrist:[0.04,0.50]}),end:_pose({wrist:[0.06,0.78]})},
  'elbow extension':{primary:'elbow',load:'wrist',rom:'angle',
    start:_pose({elbow:[0.02,0.98],wrist:[-0.06,0.86]}),end:_pose({elbow:[0.02,0.98],wrist:[0.02,1.12]})},
  'knee flexion':{primary:'knee',load:'ankle',rom:'angle',
    start:_pose(),end:_pose({ankle:[-0.20,0.26],toe:[-0.25,0.20]})},
  'knee extension':{primary:'knee',load:'ankle',rom:'angle',
    start:_pose({hip:[0,0.46],knee:[0.24,0.46],ankle:[0.24,0.22],toe:[0.32,0.22],lumbar:[0,0.54],thoracic:[0,0.66],
      shoulder:[0,0.74],cervical:[0,0.80],head:[0.01,0.87],elbow:[0,0.58],wrist:[0.04,0.46]}),
    end:_pose({hip:[0,0.46],knee:[0.24,0.46],ankle:[0.48,0.46],toe:[0.52,0.52],lumbar:[0,0.54],thoracic:[0,0.66],
      shoulder:[0,0.74],cervical:[0,0.80],head:[0.01,0.87],elbow:[0,0.58],wrist:[0.04,0.46]})},
  'plantar flexion':{primary:'ankle',load:'shoulder',rom:'angle',start:_pose(),
    end:_pose({ankle:[0,0.10],knee:[0,0.34],hip:[0,0.58],lumbar:[0,0.66],thoracic:[0,0.78],shoulder:[0,0.86],
      cervical:[0,0.92],head:[0.01,0.99],elbow:[0,0.70],wrist:[0,0.56]})},
  'trunk flexion':{primary:'lumbar',load:'shoulder',rom:'angle',start:_pose(),
    end:_pose({thoracic:[0.08,0.70],shoulder:[0.14,0.76],cervical:[0.18,0.80],head:[0.22,0.85],elbow:[0.16,0.66],wrist:[0.18,0.74]})},
  abduction:{primary:'shoulder',load:'wrist',rom:'angle',start:_pose(),end:_pose({elbow:[0.12,0.78],wrist:[0.24,0.78]}),
    note:'drawn from the side, so shoulder abduction appears as elevation of the arm; a front view would show it as it is'},
  'scapular elevation':{primary:'shoulder',load:'wrist',rom:'translation',start:_pose(),
    end:_pose({shoulder:[0,0.83],elbow:[0,0.67],wrist:[0,0.53]})}
};
/* The two neighbours whose segments define the angle at a joint. */
var JOINT_ANGLE_ARMS={knee:['hip','ankle'],hip:['lumbar','knee'],shoulder:['hip','elbow'],elbow:['shoulder','wrist'],
  ankle:['knee','toe'],lumbar:['hip','thoracic'],thoracic:['lumbar','shoulder']};
function jointAngle(pos,joint){
  var arms=JOINT_ANGLE_ARMS[joint];if(!arms)return null;
  var c=pos[joint],a=pos[arms[0]],b=pos[arms[1]];if(!c||!a||!b)return null;
  var a1=Math.atan2(a[1]-c[1],a[0]-c[0]),a2=Math.atan2(b[1]-c[1],b[0]-c[0]);
  var d=Math.abs(a1-a2)*180/Math.PI;if(d>180)d=360-d;
  return round(d,1);
}
/* ---------------- the coordinate transform: body units to a viewBox ----------------
   One transform for every frame of a movement, fitted to the union of all frames, so start and end are
   drawn at the same scale and a range of motion is not exaggerated by refitting each frame separately. */
function coordinateTransform(frames,W,H,pad){
  pad=pad==null?14:pad;
  var xs=[],ys=[];
  frames.forEach(function(f){Object.keys(f).forEach(function(k){xs.push(f[k][0]);ys.push(f[k][1]);});});
  var minX=Math.min.apply(null,xs),maxX=Math.max.apply(null,xs),minY=Math.min.apply(null,ys),maxY=Math.max.apply(null,ys);
  var s=Math.min((W-2*pad)/Math.max(0.01,maxX-minX),(H-2*pad)/Math.max(0.01,maxY-minY));
  var ox=pad+((W-2*pad)-(maxX-minX)*s)/2-minX*s, oy=H-pad-((H-2*pad)-(maxY-minY)*s)/2+minY*s;
  return {scale:s,map:function(p){return [ox+p[0]*s,oy-p[1]*s];}};
}
/* ---------------- the layered renderer ---------------- */
function renderSkeleton(o){
  o=o||{};var W=o.width||220,H=o.height||220;
  var frames=o.frames||[];
  if(!frames.length)return '';
  var T=coordinateTransform(frames.map(function(f){return f.positions;}),W,H);
  var L={segments:'',joints:'',rom:'',force:'',labels:'',state:''};
  var hot=o.loadedJoints||{};
  frames.forEach(function(f,fi){
    var ghost=f.ghost?' sk-ghost':'';
    SKELETON_SEGMENTS.forEach(function(sg){
      var a=f.positions[sg[0]],b=f.positions[sg[1]];if(!a||!b)return;
      var p=T.map(a),q=T.map(b);
      L.segments+='<line class="sk-seg'+ghost+'" x1="'+p[0].toFixed(1)+'" y1="'+p[1].toFixed(1)+'" x2="'+q[0].toFixed(1)+'" y2="'+q[1].toFixed(1)+'"/>';
    });
    var hd=T.map(f.positions.head);
    L.segments+='<circle class="sk-head'+ghost+'" cx="'+hd[0].toFixed(1)+'" cy="'+hd[1].toFixed(1)+'" r="'+(0.045*T.scale).toFixed(1)+'"/>';
    if(!f.ghost)SKELETON_JOINTS.forEach(function(j){
      var p=T.map(f.positions[j]);
      /* visual state is its own layer: which joints carry load comes from the data, not the drawing */
      var cls='sk-joint'+(hot[j]?' sk-hot':'');
      L.joints+='<circle class="'+cls+'" cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="'+(hot[j]?4.2:2.6)+'">'+
        '<title>'+esc((JOINTS[j]&&JOINTS[j].label)||j)+(hot[j]?' \u2014 loaded':'')+'</title></circle>';
    });
  });
  /* range-of-motion arc, computed from the two frames rather than drawn by hand */
  if(o.primary&&o.rom==='angle'&&frames.length>=2){
    var arms=JOINT_ANGLE_ARMS[o.primary];
    var f0=frames[0].positions,f1=frames[frames.length-1].positions;
    if(arms){
      var c=T.map(f1[o.primary]),r=Math.max(14,0.08*T.scale);
      var ang=function(pos){var a=pos[arms[1]],cc=pos[o.primary];return Math.atan2(-(a[1]-cc[1]),a[0]-cc[0]);};
      var t0=ang(f0),t1=ang(f1);
      var p0=[c[0]+r*Math.cos(t0),c[1]+r*Math.sin(t0)],p1=[c[0]+r*Math.cos(t1),c[1]+r*Math.sin(t1)];
      var sweep=((t1-t0+2*Math.PI)%(2*Math.PI))<Math.PI?1:0;
      L.rom='<path class="sk-rom" d="M '+p0[0].toFixed(1)+' '+p0[1].toFixed(1)+' A '+r.toFixed(1)+' '+r.toFixed(1)+
        ' 0 0 '+sweep+' '+p1[0].toFixed(1)+' '+p1[1].toFixed(1)+'"/>';
    }
  }
  /* force vector: external load acts downward at the load point */
  if(o.load){
    var lp=T.map(frames[frames.length-1].positions[o.load]),len=Math.max(22,0.12*T.scale);
    L.force='<line class="sk-force" x1="'+lp[0].toFixed(1)+'" y1="'+lp[1].toFixed(1)+'" x2="'+lp[0].toFixed(1)+'" y2="'+(lp[1]+len).toFixed(1)+'"/>'+
      '<path class="sk-force-head" d="M '+(lp[0]-4).toFixed(1)+' '+(lp[1]+len-6).toFixed(1)+' L '+lp[0].toFixed(1)+' '+(lp[1]+len).toFixed(1)+' L '+(lp[0]+4).toFixed(1)+' '+(lp[1]+len-6).toFixed(1)+'"/>';
  }
  if(o.label)L.labels='<text class="sk-label" x="'+(W/2)+'" y="'+(H-3)+'" text-anchor="middle">'+esc(o.label)+'</text>';
  return '<svg class="skeleton" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(o.aria||o.label||'movement')+'">'+
    '<g class="sk-l-segments">'+L.segments+'</g><g class="sk-l-rom">'+L.rom+'</g><g class="sk-l-force">'+L.force+'</g>'+
    '<g class="sk-l-joints">'+L.joints+'</g><g class="sk-l-labels">'+L.labels+'</g></svg>';
}
/* ---------------- movement: the model, then the render ---------------- */
function movementModel(pattern,opts){
  opts=opts||{};
  var m=MOVEMENT_PATTERNS[pattern];
  if(!m)return {status:'unknown-pattern',pattern:pattern,
    note:'No movement definition for "'+pattern+'". Every library pattern should have one; this one does not.'};
  var loaded={};
  if(opts.exercise){
    try{var e=exposureOf({exercise:opts.exercise,load:100,reps:8,rir:2});Object.keys(e.joints||{}).forEach(function(j){loaded[j]=e.joints[j];});}catch(x){}
  }
  var a0=jointAngle(m.start,m.primary),a1=jointAngle(m.end,m.primary);
  /* The view follows the pattern's plane (a sideways movement is drawn from the front), and the body follows the exercise
     (lying for a bench press, face down for a push-up, seated for a pulldown). */
  var FF=(typeof FRONT_FRAMES!=='undefined')&&FRONT_FRAMES[pattern],plane=(typeof PATTERN_MECHANICS!=='undefined'&&PATTERN_MECHANICS[pattern]||{}).plane;
  var view=FF&&(plane!=='sagittal'||FF.hold)?'front':'side';   /* any sideways or turning movement that has a front figure */
  var frames=view==='front'?[{name:FF.hold?'hold':'start',positions:FF.start},{name:FF.hold?'hold':'end',positions:FF.end}]:[{name:'start',positions:m.start},{name:'end',positions:m.end}];
  var ex=opts.exercise?(typeof resolveExercise==='function'?resolveExercise(opts.exercise):null):null,orient=typeof exerciseOrientation==='function'?exerciseOrientation(ex?ex.name:opts.exercise):null;
  if(orient&&view==='side')frames=orientFrames(frames,orient);   /* in a front view the posture is named, not drawn */
  if(FF&&FF.hold)frames=frames.slice(0,1);
  return {status:'ok',pattern:pattern,primary:m.primary,load:m.load,rom:m.rom,view:view,orientation:orient?orient.label:null,caption:FF?FF.caption:null,
    frames:frames,
    startAngle:a0,endAngle:a1,rangeDeg:(a0!=null&&a1!=null)?round(Math.abs(a1-a0),1):null,
    loadedJoints:loaded,exercise:opts.exercise||null,cls:'HEURISTIC',
    note:m.note||('A schematic of the '+pattern+' pattern: joint positions in body units, not a measurement of anyone\u2019s technique.'),
    caveat:'Positions are representative. They show what the pattern does, not the range any particular person achieves.'};
}
function renderMovement(model){
  if(!model||model.status!=='ok')return '<div class="hint">'+esc((model&&model.note)||'no movement')+'</div>';
  var front=model.view==='front';
  return renderFramePanels(model.frames,{segments:front?FRONT_SEGMENTS:SKELETON_SEGMENTS,joints:front?FRONT_JOINTS:SKELETON_JOINTS,
    loadedJoints:front?null:model.loadedJoints,label:model.exercise||model.pattern,view:model.view,orientation:model.orientation,caption:model.caption,
    primary:front?null:model.primary,rom:front?null:model.rom,load:front||model.orientation?null:model.load});
}
/* ---------------- mobility (\u00a729): the same skeleton, no second anatomy ---------------- */
var POSE_POSITIONS={
  'downward-dog':{toe:[-0.30,0],ankle:[-0.28,0.03],knee:[-0.20,0.22],hip:[-0.10,0.44],lumbar:[-0.02,0.40],thoracic:[0.08,0.32],
    shoulder:[0.16,0.24],cervical:[0.18,0.18],head:[0.20,0.12],elbow:[0.26,0.13],wrist:[0.34,0.02]},
  'warrior-2':{toe:[0.30,0],ankle:[0.26,0.03],knee:[0.24,0.20],hip:[0,0.34],lumbar:[0,0.42],thoracic:[0,0.54],shoulder:[0,0.62],
    cervical:[0,0.68],head:[0.02,0.75],elbow:[0.16,0.62],wrist:[0.30,0.62]},
  pigeon:{toe:[-0.02,0],ankle:[0.02,0.02],knee:[0.16,0.04],hip:[0,0.14],lumbar:[0,0.22],thoracic:[0.02,0.34],shoulder:[0.03,0.42],
    cervical:[0.04,0.48],head:[0.05,0.55],elbow:[0.05,0.28],wrist:[0.07,0.16]},
  bridge:{toe:[0.34,0],ankle:[0.28,0.02],knee:[0.22,0.18],hip:[0,0.20],lumbar:[-0.10,0.16],thoracic:[-0.20,0.10],shoulder:[-0.28,0.05],
    cervical:[-0.34,0.03],head:[-0.40,0.03],elbow:[-0.16,0.02],wrist:[-0.04,0.01]},
  tree:{toe:[0.08,0],ankle:[0,0.04],knee:[0,0.28],hip:[0,0.52],lumbar:[0,0.60],thoracic:[0,0.72],shoulder:[0,0.80],cervical:[0,0.86],
    head:[0.01,0.93],elbow:[0.02,0.96],wrist:[0.02,1.08]},
  child:{toe:[-0.20,0],ankle:[-0.16,0.02],knee:[0.02,0.02],hip:[-0.14,0.12],lumbar:[-0.06,0.14],thoracic:[0.06,0.12],shoulder:[0.16,0.08],
    cervical:[0.20,0.05],head:[0.24,0.03],elbow:[0.30,0.04],wrist:[0.40,0.02]},
  cobra:{toe:[-0.50,0],ankle:[-0.46,0.02],knee:[-0.28,0.02],hip:[-0.08,0.04],lumbar:[0,0.08],thoracic:[0.08,0.16],shoulder:[0.14,0.24],
    cervical:[0.18,0.30],head:[0.22,0.36],elbow:[0.16,0.12],wrist:[0.16,0.02]},
  chair:{toe:[0.08,0],ankle:[0,0.04],knee:[0.14,0.24],hip:[-0.06,0.36],lumbar:[-0.02,0.44],thoracic:[0.04,0.56],shoulder:[0.08,0.64],
    cervical:[0.10,0.70],head:[0.12,0.76],elbow:[0.14,0.80],wrist:[0.18,0.92]},
  crow:{wrist:[0,0],elbow:[0.02,0.14],shoulder:[0.06,0.26],thoracic:[-0.02,0.30],lumbar:[-0.10,0.30],hip:[-0.14,0.28],knee:[0.04,0.22],
    ankle:[-0.08,0.32],toe:[-0.12,0.36],cervical:[0.12,0.28],head:[0.18,0.26]},
  savasana:{head:[-0.44,0.04],cervical:[-0.38,0.03],shoulder:[-0.32,0.03],thoracic:[-0.24,0.03],lumbar:[-0.12,0.03],hip:[-0.04,0.03],
    knee:[0.20,0.03],ankle:[0.42,0.03],toe:[0.46,0.08],elbow:[-0.18,0.02],wrist:[-0.06,0.02]}
};
function poseModel(poseId,opts){
  opts=opts||{};
  var p=POSES[poseId],pos=POSE_POSITIONS[poseId];
  var _fp=(typeof FRONT_POSES!=='undefined')&&FRONT_POSES[poseId],_fx=(typeof POSE_FIXES!=='undefined')&&POSE_FIXES[poseId];
  if(_fx)pos=_fx.positions;
  if(!p)return {status:'unknown-pose',poseId:poseId};
  if(!pos)return {status:'no-geometry',poseId:poseId,note:'The pose is in the ontology but has no positions to draw.'};
  var targetRegions=[];
  (p.joints||[]).forEach(function(j){var r=JOINTS[j]&&JOINTS[j].region;if(r&&targetRegions.indexOf(r)<0)targetRegions.push(r);});
  var hot={};(p.joints||[]).forEach(function(j){hot[j]=1;});
  return {status:'ok',poseId:poseId,label:p.label,
    targetRegions:targetRegions,joints:p.joints||[],positions:pos,
    constraints:(p.joints||[]).map(function(j){return {joint:j,limits:(JOINTS[j]&&JOINTS[j].limits)||[]};}),
    sequencePosition:opts.sequencePosition!=null?opts.sequencePosition:null,
    duration:opts.duration||(p.hold||null),
    intensity:p.demands?p.demands.range:null,
    regressions:p.regressions||[],progressions:p.progressions||[],
    frames:[{name:p.label,positions:_fp?_fp.positions:pos}],view:_fp?'front':'side',caption:_fp?_fp.caption:(_fx?_fx.caption:null),loadedJoints:hot,cls:'HEURISTIC',
    note:'Drawn through the same skeleton and the same joint ontology as every strength movement \u2014 no separate yoga anatomy.'};
}
function renderPose(model){
  if(!model||model.status!=='ok')return '<div class="hint">'+esc((model&&model.note)||'no pose')+'</div>';
  var front=model.view==='front';
  return renderFramePanels(model.frames,{segments:front?FRONT_SEGMENTS:SKELETON_SEGMENTS,joints:front?FRONT_JOINTS:SKELETON_JOINTS,
    loadedJoints:front?null:model.loadedJoints,label:model.label,view:model.view,caption:model.caption,width:160});
}
function movementAudit(){
  var issues=[];
  SKELETON_JOINTS.forEach(function(j){if(!JOINTS[j])issues.push('skeleton joint "'+j+'" is not in the joint ontology');});
  SKELETON_SEGMENTS.forEach(function(s){s.forEach(function(e){
    if(SKELETON_JOINTS.indexOf(e)<0&&SKELETON_STRUCTURAL.indexOf(e)<0)issues.push('segment end "'+e+'" is neither a joint nor structural');});});
  /* every library pattern must be drawable, so no exercise is invisible */
  /* The first version read EXERCISE_LIBRARY, which does not exist — the library is EXERCISES — so it found
     zero patterns, checked nothing, and passed. A coverage check with nothing to cover must fail, not pass. */
  var pats={};(typeof EXERCISES!=='undefined'?EXERCISES:[]).forEach(function(e){if(e&&e.pattern)pats[e.pattern]=1;});
  if(!Object.keys(pats).length)issues.push('the exercise library yielded no movement patterns, so drawability was not checked at all');
  Object.keys(pats).forEach(function(p){if(!MOVEMENT_PATTERNS[p])issues.push('library pattern "'+p+'" has no movement definition');});
  Object.keys(MOVEMENT_PATTERNS).forEach(function(k){
    var m=MOVEMENT_PATTERNS[k];
    [m.start,m.end].forEach(function(f){Object.keys(STANDING).forEach(function(j){if(!f[j])issues.push(k+': frame missing '+j);});});
    if(m.rom==='angle'&&!JOINT_ANGLE_ARMS[m.primary])issues.push(k+': no angle definition for primary joint '+m.primary);
  });
  Object.keys(POSES).forEach(function(p){
    if(!POSE_POSITIONS[p])issues.push('pose "'+p+'" has no positions');
    else Object.keys(STANDING).forEach(function(j){if(!POSE_POSITIONS[p][j])issues.push(p+': missing '+j);});
  });
  return {patterns:Object.keys(MOVEMENT_PATTERNS).length,libraryPatterns:Object.keys(pats).length,
    poses:Object.keys(POSE_POSITIONS).length,issues:issues,ok:issues.length===0,
    note:'Every skeleton joint is in the joint ontology, every library movement pattern and every pose can be drawn, and every frame is complete.'};
}
/* ---------------- the program (\u00a730): temporal data, read only ----------------
   program \u2192 mesocycle \u2192 microcycle \u2192 session \u2192 exercise \u2192 set. The plan comes from trainingProgram(); what was
   done comes from the session log. Nothing here schedules anything \u2014 the direction forbids a second
   scheduler inside a visual. The current program has no explicit block structure, so the whole window is
   one implicit mesocycle, and that is said rather than invented. */
/* _DOW is the core module's; redeclaring it here was caught by the namespace guard. */
function programStructure(weeks){
  weeks=weeks||4;
  var prog=null;try{prog=trainingProgram();}catch(e){}
  if(!prog||!prog.week)return {status:'no-program',note:'No training program is set.'};
  var today=todayISO();
  var dow=new Date(today+'T12:00:00Z').getUTCDay();
  var monday=addDays(today,-((dow+6)%7));
  var start=addDays(monday,-(weeks-1)*7);
  var byDate={};(DB.sessions||[]).forEach(function(s){(byDate[s.date]=byDate[s.date]||[]).push(s);});
  var micro=[],planned=0,done=0,missed=0,setsPlanned=0,setsDone=0;
  for(var w=0;w<weeks;w++){
    var days=[];
    for(var d=0;d<7;d++){
      var date=addDays(start,w*7+d),dn=_DOW[new Date(date+'T12:00:00Z').getUTCDay()];
      var plan=typeof scheduledPlan==='function'?scheduledPlan(date,prog):(prog.week[dn]||null);   /* weekly, rotating or irregular */
      var exs=plan&&plan.template&&prog.templates?(prog.templates[plan.template]||[]).map(function(t){
        return {name:t[0],sets:t[1],reps:t[2]};}):[];
      var sp=exs.reduce(function(a,e){return a+(+e.sets||0);},0);
      var sess=byDate[date]||[];
      var sd=sess.reduce(function(a,s){return a+(s.sets||[]).length;},0);
      var liftPlanned=plan&&plan.kind==='lift';
      /* A planned lifting day with no session is NOT "missed" on its own: the first version matched by exact
         weekday and reported 12 of 14 sessions missed in a record that trained 13 times in the window — on
         different days. Moving a session is not skipping it. The day-level status only says what happened
         on that day; whether the week was kept is judged per week, below. */
      var status=date>today?'upcoming':(sess.length?(liftPlanned?'done':'done-other-day'):(liftPlanned?'not-on-this-day':(plan?'rest-or-other':'rest')));
      setsDone+=date<=today?sd:0;
      days.push({date:date,dow:dn,planned:plan?{label:plan.label,kind:plan.kind,exercises:exs,sets:sp}:null,
        completed:sess.length?{sessions:sess.length,sets:sd,
          exercises:Object.keys(sess.reduce(function(a,s){(s.sets||[]).forEach(function(st){a[st.exercise]=1;});return a;},{}))}:null,
        status:status});
    }
    /* The week is the unit of adherence: sessions done against sessions planned in the same microcycle, on
       whichever days they fell. Only days already past count, so the current week is not penalised for
       days that have not happened yet. */
    var past=days.filter(function(x){return x.date<=today;});
    var wkPlanned=past.filter(function(x){return x.planned&&x.planned.kind==='lift';}).length;
    var wkDone=past.filter(function(x){return !!x.completed;}).length;
    var wkSetsPlanned=past.reduce(function(a,x){return a+(x.planned&&x.planned.kind==='lift'?x.planned.sets:0);},0);
    planned+=wkPlanned;done+=Math.min(wkDone,wkPlanned);missed+=Math.max(0,wkPlanned-wkDone);setsPlanned+=wkSetsPlanned;
    micro.push({index:w,weekStart:addDays(start,w*7),days:days,sessionsPlanned:wkPlanned,sessionsDone:wkDone,
      onPlannedDay:past.filter(function(x){return x.status==='done';}).length,
      setsDone:days.reduce(function(a,x){return a+(x.completed?x.completed.sets:0);},0)});
  }
  return {status:'ok',program:{id:prog.key,label:prog.label},
    mesocycles:[{id:'current',label:prog.label,implicit:true,microcycles:micro}],
    summary:{sessionsPlanned:planned,sessionsDone:done,sessionsMissed:missed,setsPlanned:setsPlanned,setsDone:setsDone,
      onPlannedDay:micro.reduce(function(a,m){return a+m.onPlannedDay;},0),
      totalSessions:micro.reduce(function(a,m){return a+m.sessionsDone;},0)},
    cls:'MEASURED',
    note:'The plan, and what was actually done, over '+weeks+' weeks. The program has no explicit block structure, so the window is one implicit mesocycle.'};
}
function renderProgram(ps){
  if(!ps||ps.status!=='ok')return '<div class="hint">'+esc((ps&&ps.note)||'no program')+'</div>';
  var micro=ps.mesocycles[0].microcycles;
  var cal='<div class="pg-cal" role="table" aria-label="planned and completed sessions by day"><div class="pg-row pg-head" role="row"><span></span>'+
    ['M','T','W','T','F','S','S'].map(function(d){return '<span role="columnheader">'+d+'</span>';}).join('')+'</div>'+
    micro.map(function(m){
      return '<div class="pg-row" role="row"><span class="pg-wk">'+esc(m.weekStart.slice(5))+'</span>'+m.days.map(function(d){
        var glyph=d.planned?(d.planned.kind==='lift'?'L':(d.planned.kind==='cardio'?'C':'\u00b7')):'\u00b7';
        var title=d.date+': '+(d.planned?d.planned.label:'nothing planned')+' \u2014 '+
          (d.completed?'trained ('+d.completed.sets+' sets)':d.status.replace(/-/g,' '));
        return '<span role="cell" class="pg-cell pg-'+d.status+'" title="'+attrEsc(title)+'" aria-label="'+attrEsc(title)+'">'+glyph+'</span>';
      }).join('')+'</div>';}).join('')+'</div>';
  var s=ps.summary;
  var pvc=uiRow('Sessions','<strong>'+s.sessionsDone+'</strong> of '+s.sessionsPlanned,
      {sub:'counted per week \u00b7 '+s.sessionsMissed+' short \u00b7 '+s.onPlannedDay+' of '+s.totalSessions+
        ' session(s) fell on the planned day'})+
    uiRow('Sets','<strong>'+s.setsDone+'</strong> logged',{sub:s.setsPlanned+' prescribed on planned lifting days'});
  var prog=svgChart({height:110,aria:'sets logged per week',
    series:[{type:'bars',pts:micro.map(function(m,i){return {x:i,y:m.setsDone};})}]});
  return {calendar:cal,plannedVsCompleted:pvc,progression:prog};
}
/* ---------------- nutrition: intake composition, missing days as gaps ---------------- */
function nutritionModel(days){
  days=days||14;
  var rows=[];
  for(var i=days-1;i>=0;i--){
    var date=addDays(todayISO(),-i);
    var n=null;try{n=dayNutrition(date);}catch(e){}
    /* dayNutrition nests its figures under .totals; the first version read n.kcal, which is always
       undefined, so every day read as unlogged. "Logged" is whether anything was entered, not whether the
       total happens to be positive. */
    var t=n&&n.totals||{};
    var itemised=!!(n&&n.items>0);
    /* Intake is recorded two ways: itemised foods, or a daily total entered directly. The first version of
       this read only itemised logs and called ten of fourteen days "not logged" — days whose calorie total
       the energy balance model was using at that moment. A renderer contradicting the model it sits beside
       is worse than no renderer. Itemised wins where present; otherwise the daily totals are used, and each
       macro is only what was actually recorded — an unrecorded macro is unknown, not zero. */
    var ob=function(type){var o=null;try{o=obsOf(type).filter(function(x){return x.date===date;}).slice(-1)[0];}catch(e){}return o?o.value:null;};
    var kcal=itemised?t.kcal:ob('calories');
    var P=itemised?t.protein:ob('protein'),C=itemised?t.carbs:ob('carbs'),F=itemised?t.fat:ob('fat');
    var logged=kcal!=null;
    rows.push({date:date,logged:logged,source:itemised?'itemised':(logged?'daily total':null),
      kcal:logged?round(kcal,0):null,
      protein:P!=null?round(P,0):null,carbs:C!=null?round(C,0):null,fat:F!=null?round(F,0):null,
      macrosComplete:P!=null&&C!=null&&F!=null});
  }
  var L=rows.filter(function(r){return r.logged;});
  return {status:L.length?'ok':'no-data',days:days,rows:rows,loggedDays:L.length,
    itemisedDays:L.filter(function(r){return r.source==='itemised';}).length,
    completeSplitDays:L.filter(function(r){return r.macrosComplete;}).length,
    cls:'MEASURED',
    note:'What was logged, day by day. A day with nothing logged is a gap, not a day of zero intake.'};
}
function renderNutrition(nm){
  if(!nm||nm.status!=='ok')return '<div class="hint">'+esc((nm&&nm.note)||'nothing logged')+'</div>';
  var bars=nm.rows.map(function(r){
    if(!r.logged)return '<div class="nu-row"><span class="nu-d">'+esc(r.date.slice(5))+'</span><span class="nu-gap" aria-label="not logged">not logged</span></div>';
    /* Energy known but the split is not: say so, rather than drawing a bar from partial macros that would
       misrepresent the composition. */
    if(!r.macrosComplete)return '<div class="nu-row" title="'+attrEsc(r.date+': '+r.kcal+' kcal as a '+r.source+(r.protein!=null?(', protein '+r.protein+' g'):''))+'">'+
      '<span class="nu-d">'+esc(r.date.slice(5))+'</span><span class="nu-partial">'+(r.protein!=null?('protein '+r.protein+' g \u00b7 '):'')+
      'split not recorded</span><span class="nu-k">'+r.kcal+'</span></div>';
    var pk=r.protein*4,ck=r.carbs*4,fk=r.fat*9,t=Math.max(1,pk+ck+fk);
    return '<div class="nu-row" title="'+attrEsc(r.date+': '+r.kcal+' kcal, P '+r.protein+' g, C '+r.carbs+' g, F '+r.fat+' g')+'">'+
      '<span class="nu-d">'+esc(r.date.slice(5))+'</span><span class="nu-bar">'+
      '<span class="nu-p" style="width:'+(100*pk/t).toFixed(1)+'%"></span><span class="nu-c" style="width:'+(100*ck/t).toFixed(1)+'%"></span>'+
      '<span class="nu-f" style="width:'+(100*fk/t).toFixed(1)+'%"></span></span><span class="nu-k">'+r.kcal+'</span></div>';
  }).join('');
  var trend=svgChart({height:100,aria:'logged energy per day',
    series:[{type:'line',pts:nm.rows.map(function(r,i){return {x:i,y:r.logged?r.kcal:null};})}]});
  return {composition:'<div class="nu-key"><span class="nu-p"></span>protein <span class="nu-c"></span>carbohydrate <span class="nu-f"></span>fat</div>'+bars,trend:trend};
}

/* ---- THE EXPANDED LIBRARY'S MUSCLES AND PATTERNS ----
   Four muscles the new patterns need, each drawable where it sits: obliques beside the abs, adductors on the inner
   thigh, rear delts behind the shoulder, traps above the upper back. And the twelve patterns the library gained, each
   with frames in the same body units as the rest, so every exercise has a movement to show. */
ANATOMY.obliques={group:'core',anterior:true,view:'front'};
ANATOMY.adductors={group:'legs',anterior:true,view:'front'};
ANATOMY.reardelts={group:'pull',anterior:false,view:'back'};
ANATOMY.traps={group:'pull',anterior:false,view:'back'};
ANATOMY_GEOMETRY.obliques=[{cx:45,cy:96,rx:5,ry:13},{cx:75,cy:96,rx:5,ry:13}];
ANATOMY_GEOMETRY.adductors=[{cx:56,cy:138,rx:3.5,ry:15},{cx:64,cy:138,rx:3.5,ry:15}];
ANATOMY_GEOMETRY.reardelts=[{cx:156,cy:57,rx:6,ry:6},{cx:204,cy:57,rx:6,ry:6}];
ANATOMY_GEOMETRY.traps=[{cx:180,cy:45,rx:15,ry:6}];
var _SUPINE={toe:[0.30,0.0],ankle:[0.22,0.02],knee:[0.12,0.22],hip:[-0.12,0.06],lumbar:[-0.24,0.07],thoracic:[-0.38,0.06],
  shoulder:[-0.50,0.05],cervical:[-0.55,0.06],head:[-0.62,0.07],elbow:[-0.36,0.02],wrist:[-0.24,0.01]};
var _PLANK={toe:[-0.44,0.0],ankle:[-0.40,0.04],knee:[-0.16,0.10],hip:[0.10,0.17],lumbar:[0.22,0.19],thoracic:[0.36,0.21],
  shoulder:[0.50,0.22],cervical:[0.55,0.25],head:[0.62,0.26],elbow:[0.50,0.02],wrist:[0.62,0.02]};
var _HANG=_pose({elbow:[0,1.02],wrist:[0,1.16]});
function _shift(p,dx,dy){var o={};Object.keys(p).forEach(function(k){o[k]=[p[k][0]+dx,p[k][1]+dy];});return o;}
function _with(p,over){var o={};Object.keys(p).forEach(function(k){o[k]=(over&&over[k])||p[k];});return o;}
MOVEMENT_PATTERNS['hip extension']={primary:'hip',load:'hip',rom:'angle',start:_SUPINE,
  end:_with(_SUPINE,{hip:[-0.12,0.22],lumbar:[-0.24,0.18],thoracic:[-0.38,0.12],knee:[0.12,0.27]})};
MOVEMENT_PATTERNS['hip flexion']={primary:'hip',load:'ankle',rom:'angle',start:_HANG,
  end:_with(_HANG,{knee:[0.20,0.52],ankle:[0.24,0.30],toe:[0.31,0.32]})};
MOVEMENT_PATTERNS.carry={primary:'hip',load:'wrist',rom:'translation',start:_pose({elbow:[0,0.64],wrist:[0,0.46]}),
  end:_pose({elbow:[0,0.64],wrist:[0,0.46],knee:[0.06,0.30],ankle:[0.10,0.05],toe:[0.18,0.02]})};
MOVEMENT_PATTERNS.grip={primary:'wrist',load:'wrist',rom:'translation',start:_HANG,end:_with(_HANG,{wrist:[0.01,1.16]})};
MOVEMENT_PATTERNS['anti-extension']={primary:'lumbar',load:'lumbar',rom:'translation',start:_PLANK,end:_with(_PLANK,{hip:[0.10,0.18]})};
MOVEMENT_PATTERNS['anti-lateral flexion']={primary:'lumbar',load:'lumbar',rom:'translation',start:_PLANK,end:_with(_PLANK,{hip:[0.10,0.19]})};
MOVEMENT_PATTERNS['anti-rotation']={primary:'shoulder',load:'wrist',rom:'translation',
  start:_pose({elbow:[0.02,0.66],wrist:[0.08,0.72]}),end:_pose({elbow:[0.16,0.74],wrist:[0.30,0.74]})};
MOVEMENT_PATTERNS.rotation={primary:'thoracic',load:'wrist',rom:'angle',
  start:_pose({elbow:[-0.08,0.92],wrist:[-0.18,1.00],thoracic:[-0.02,0.72]}),
  end:_pose({elbow:[0.12,0.52],wrist:[0.22,0.40],thoracic:[0.03,0.71],shoulder:[0.05,0.79]})};
MOVEMENT_PATTERNS['hip adduction']={primary:'hip',load:'knee',rom:MOVEMENT_PATTERNS.abduction?MOVEMENT_PATTERNS.abduction.rom:'angle',
  start:MOVEMENT_PATTERNS.abduction?MOVEMENT_PATTERNS.abduction.start:_pose(),end:MOVEMENT_PATTERNS.abduction?MOVEMENT_PATTERNS.abduction.end:_pose()};
MOVEMENT_PATTERNS['external rotation']={primary:'shoulder',load:'wrist',rom:'angle',
  start:_pose({elbow:[0,0.64],wrist:[0.16,0.66]}),end:_pose({elbow:[0,0.64],wrist:[0.04,0.68]})};
MOVEMENT_PATTERNS.jump={primary:'knee',load:'hip',rom:'angle',
  start:_pose({knee:[0.10,0.25],hip:[-0.05,0.44],lumbar:[-0.02,0.52],thoracic:[0.03,0.64],shoulder:[0.05,0.72],cervical:[0.07,0.78],head:[0.08,0.85],elbow:[-0.06,0.58],wrist:[-0.12,0.46]}),
  end:_with(_shift(_pose({elbow:[0.02,0.96],wrist:[0.03,1.10]}),0,0.16),{toe:[0.12,0.12]})};
MOVEMENT_PATTERNS.throw={primary:'shoulder',load:'wrist',rom:'angle',
  start:_pose({elbow:[0,1.02],wrist:[0.02,1.16],toe:[0.08,0.0],ankle:[0,0.07]}),
  end:_pose({hip:[-0.06,0.50],lumbar:[-0.01,0.56],thoracic:[0.10,0.64],shoulder:[0.18,0.68],cervical:[0.23,0.70],head:[0.27,0.72],elbow:[0.22,0.42],wrist:[0.24,0.22]})};
