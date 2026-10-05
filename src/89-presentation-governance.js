/* ============================================================================
   PRESENTATION GOVERNANCE / EXECUTION LAYER
   Implements the executable contracts and presentation models named by the
   Visual / Presentation / Customization specification.

   Boundary:
     canonical analytical result -> presentation model -> visual semantics
       -> tokens -> component/visualization -> renderer

   This module deliberately performs no analytical inference. Presentation
   models may validate, classify, and carry analytical fields forward; they do
   not calculate new analytical values.
   ============================================================================ */

/* ---- §1 presentation engine registry ------------------------------------- */
var PRESENTATION_ENGINE={
  id:'physique.presentation',
  version:1,
  boundary:'canonical-data → analytical-result → presentation-model → visual-semantics → tokens → renderer',
  subsystems:[
    'designSystem','themeEngine','colorEngine','typographyEngine','shapeEngine',
    'spacingEngine','layoutEngine','componentSystem','renderingEngine',
    'visualizationEngine','chartEngine','diagramEngine','bodyVisualization',
    'movementVisualization','progressVisualization','timelineVisualization',
    'spatialVisualization','animationEngine','interactionEngine',
    'responsiveEngine','accessibilityEngine','personalizationEngine',
    'appearanceProfiles','customizationEngine','uiStateEngine','uxFlowEngine',
    'densityEngine','dashboardComposer','widgetSystem','viewRegistry',
    'visualizationRegistry','exportRenderEngine','presentationDiagnostics'
  ],
  forbidden:['css → analytical meaning','chart → unsanctioned analytical calculation']
};

/* ---- §2 complete token vocabulary ---------------------------------------- */
Object.assign(DESIGN_TOKENS,{
  color:Object.assign(DESIGN_TOKENS.color,{
    success:{light:'#176b43',dark:'#63d29b'},
    warning:{light:'#8a5a00',dark:'#e3ad4f'},
    danger:{light:'#9b2f2f',dark:'#e68b86'},
    info:{light:'#245f86',dark:'#79b6e0'},
    measurement:{light:'#1f5f8b',dark:'#72b8e5'},
    derived:{light:'#5a4d8c',dark:'#b7a5e8'},
    predicted:{light:'#8a5a00',dark:'#e3ad4f'},
    assumed:{light:'#5d6570',dark:'#aab2bd'},
    estimated:{light:'#6c4d8d',dark:'#bba4dd'},
    observed:{light:'#11151c',dark:'#e9edf3'},
    inferred:{light:'#725d2e',dark:'#d7bc72'},
    uncertain:{light:'#6a6470',dark:'#b7afbf'},
    stale:{light:'#72777e',dark:'#9da3aa'},
    missing:{light:'#767b82',dark:'#a1a7ae'},
    conflicted:{light:'#8b3c28',dark:'#e39a7c'},
    semantic:{light:'#374151',dark:'#c8d0da'}
  }),
  typography:{
    display:{size:32,lineHeight:1.1,weight:700,tracking:-0.02},
    headline:{size:24,lineHeight:1.2,weight:700,tracking:-0.015},
    title:{size:20,lineHeight:1.25,weight:650,tracking:-0.01},
    subtitle:{size:16,lineHeight:1.35,weight:600,tracking:0},
    body:{size:15,lineHeight:1.5,weight:400,tracking:0},
    bodySmall:{size:13,lineHeight:1.4,weight:400,tracking:0},
    label:{size:12,lineHeight:1.25,weight:600,tracking:0.02},
    caption:{size:11,lineHeight:1.3,weight:400,tracking:0.02},
    metric:{size:22,lineHeight:1.1,weight:650,tracking:-0.015},
    metricLarge:{size:36,lineHeight:1.0,weight:700,tracking:-0.025},
    numeric:{size:15,lineHeight:1.2,weight:600,tracking:0,fontFeatureSettings:'tnum'},
    code:{size:13,lineHeight:1.4,weight:400,tracking:0,fontFeatureSettings:'tnum'},
    technical:{size:12,lineHeight:1.35,weight:500,tracking:0,fontFeatureSettings:'tnum'},
    annotation:{size:11,lineHeight:1.3,weight:400,tracking:0.01}
  },
  spacing:{
    0:0,1:1,2:2,3:4,4:6,6:8,8:12,12:16,16:20,20:24,24:32,32:40,40:48,48:64,64:80
  },
  radius:{none:0,xs:4,sm:6,md:10,lg:16,xl:24,full:999},
  elevation:{0:'none',1:'subtle',2:'raised',3:'floating',modal:'modal',floating:'floating'},
  opacity:{disabled:0.45,muted:0.68,overlay:0.72},
  sizing:{touchTarget:44,iconSm:16,iconMd:20,iconLg:24},
  animation:{
    duration:{instant:0,fast:120,normal:200,slow:320},
    easing:{standard:'cubic-bezier(.2,.0,.2,1)',enter:'cubic-bezier(.0,0,.2,1)',exit:'cubic-bezier(.4,0,1,1)',emphasis:'cubic-bezier(.2,.8,.2,1)'}
  },
  density:{compact:0.82,normal:1,comfortable:1.16,spacious:1.32,accessibility:1.45},
  zIndex:{base:0,sticky:10,dropdown:20,modal:30,toast:40},
  componentStates:['default','hover','focus','active','pressed','selected','checked','disabled','loading','error','warning','success','readonly','invalid','stale','missing']
});

/* ---- §3 universal data-state visual language ----------------------------- */
var DATA_STATE_VISUALS={
  VALID:{token:'success',pattern:'solid',opacity:1,label:'Valid'},
  PARTIAL:{token:'warning',pattern:'striped',opacity:1,label:'Partial'},
  MISSING:{token:'missing',pattern:'empty',opacity:.75,label:'Missing'},
  STALE:{token:'stale',pattern:'dashed',opacity:.72,label:'Stale'},
  CONFLICTED:{token:'conflicted',pattern:'crosshatch',opacity:1,label:'Conflicted'},
  QUARANTINED:{token:'danger',pattern:'crosshatch',opacity:.85,label:'Quarantined'},
  ESTIMATED:{token:'estimated',pattern:'dashed',opacity:.9,label:'Estimated'},
  PREDICTED:{token:'predicted',pattern:'dashed',opacity:.9,label:'Predicted'},
  LOW_CONFIDENCE:{token:'uncertain',pattern:'faded',opacity:.58,label:'Low confidence'},
  HIGH_CONFIDENCE:{token:'success',pattern:'solid',opacity:1,label:'High confidence'},
  SUPERSEDED:{token:'stale',pattern:'double',opacity:.62,label:'Superseded'},
  RETRACTED:{token:'danger',pattern:'strike',opacity:.55,label:'Retracted'},
  RESTATED:{token:'info',pattern:'double',opacity:1,label:'Restated'}
};
function dataStateVisual(state){
  var k=String(state||'MISSING').toUpperCase();
  return DATA_STATE_VISUALS[k]||DATA_STATE_VISUALS.MISSING;
}
function presentationSemantic(value){
  var cls=value&&value.cls;
  var state=value&&value.state;
  return {epistemic:visualForClass(cls),state:dataStateVisual(state||'VALID')};
}

/* ---- §4 semantic/domain palettes ----------------------------------------- */
Object.assign(SEMANTIC_PALETTE,{
  success:'success',warning:'warning',danger:'danger',info:'info',
  measured:'measurement',derived:'derived',predicted:'predicted',
  uncertain:'uncertain',observed:'observed',inferred:'inferred',
  estimated:'estimated',stale:'stale',missing:'missing',conflicted:'conflicted'
});
/* DOMAIN_COLOR_KEYS removed in H0: its only reader was DOMAIN_PALETTE, itself never read. */
/* DOMAIN_PALETTE removed in H0: defined but never read (see docs/architecture/presentation-policies.md where it recorded a decision). */
function resolveSemanticColor(key,mode){
  var role=SEMANTIC_PALETTE[String(key||'').toLowerCase()]||key;
  return resolveToken('color.'+role,mode||'dark')||null;
}

/* ---- §6 typography / numeric execution ----------------------------------- */
/* NUMERIC_TYPOGRAPHY removed in H0: defined but never read (see docs/architecture/presentation-policies.md where it recorded a decision). */
function typographySpec(role,mode){
  var t=DESIGN_TOKENS.typography[role]||DESIGN_TOKENS.typography.body;
  return Object.assign({role:role||'body',mode:mode||'normal'},t,
    {fontFamily:fontFallbackStack((DB&&DB.settings&&DB.settings.font)||'interface')});
}
function presentationMetric(value,opts){
  opts=opts||{};
  if(value==null||Number.isNaN(Number(value)))return {text:'—',value:null,state:opts.state||'MISSING'};
  var text;
  if(typeof formatNumeric==='function'){
    try{text=formatNumeric(value,opts.quantity||opts.type||null,opts.decimals);}
    catch(e){text=String(value);}
  }else{
    text=Number(value).toLocaleString(undefined,{maximumFractionDigits:opts.decimals==null?2:opts.decimals});
  }
  return {text:text,value:value,unit:opts.unit||null,state:opts.state||'VALID',
    epistemic:opts.cls?visualForClass(opts.cls):null,typography:'numeric'};
}

/* ---- §9/10/11/12 shape, border, elevation, spacing ---------------------- */
var BORDER_TOKENS={none:0,subtle:1,standard:1,strong:2,focus:2,semantic:2};
/* SPACING_ENGINE removed in H0: defined but never read (see docs/architecture/presentation-policies.md where it recorded a decision). */
function spacingValue(step,density){
  var base=DESIGN_TOKENS.spacing[step];
  if(base==null)base=Number(step)||0;
  var mult=DESIGN_TOKENS.density[density||'normal']||1;
  return Math.round(base*mult);
}
function borderSpec(kind){
  return {kind:kind||'subtle',width:BORDER_TOKENS[kind||'subtle']||0};
}
function elevationSpec(level){
  return {level:level||0,token:DESIGN_TOKENS.elevation[level||0]||'none'};
}

/* ---- §13 density / §38 responsive ---------------------------------------- */
var DENSITY_ENGINE={
  values:['compact','normal','comfortable','spacious','accessibility'],
  multiplier:function(d){return DESIGN_TOKENS.density[d]||1;}
};
var RESPONSIVE_ENGINE={
  capabilities:['narrow','compact','standard','wide','ultrawide'],
  breakpoints:BREAKPOINTS,
  capability:function(width){
    width=Number(width);
    if(!Number.isFinite(width))return 'standard';
    var ks=Object.keys(BREAKPOINTS),map={phone:'narrow',phablet:'compact',tablet:'standard',desktop:'wide',ultrawide:'ultrawide'};
    for(var i=0;i<ks.length;i++){var b=BREAKPOINTS[ks[i]];if((b.min==null||width>=b.min)&&(b.max==null||width<=b.max))return map[ks[i]]||ks[i];}
    return width<480?'narrow':width<768?'compact':width<1200?'standard':width<1800?'wide':'ultrawide';
  }
};
function responsiveSpec(width,opts){
  opts=opts||{};var cap=RESPONSIVE_ENGINE.capability(width);
  return {capability:cap,width:Number(width)||null,
    safeArea:opts.safeArea!==false,keyboardAvoidance:opts.keyboardAvoidance!==false,
    touchTarget:Math.max(44,Number(opts.touchTarget)||44),
    bottomSheets:cap==='narrow'||cap==='compact',
    mobileNavigation:cap==='narrow'||cap==='compact',
    chartInteraction:cap==='narrow'||cap==='compact'?['tap','scrub','pinch','pan']:['hover','tap','scrub','zoom','pan']};
}

/* ---- §15 component registry completion ----------------------------------- */
var PRESENTATION_COMPONENTS=Object.assign({},COMPONENTS,{
  Metric:{states:['default','loading','empty','error','selected'],touchTarget:null,requires:['epistemic-state','provenance']},
  Table:{states:['default','loading','empty','error','selected'],touchTarget:44},
  Tree:{states:['collapsed','expanded','loading','empty'],touchTarget:44},
  Timeline:{states:['default','loading','empty','selected'],touchTarget:44},
  Avatar:{states:['default','loading','missing'],touchTarget:44},
  Banner:{states:['info','warning','danger','success'],touchTarget:null},
  Badge:{states:['default','attention'],touchTarget:null},
  Chip:{states:['default','selected','disabled'],touchTarget:44},
  LoadingState:{states:['loading'],touchTarget:null},
  ErrorState:{states:['error'],touchTarget:null}
});
function componentSpec(id,state,props){
  var c=PRESENTATION_COMPONENTS[id];
  if(!c)return {status:'unknown',id:id};
  var s=state||c.states[0];
  return {status:c.states.indexOf(s)>=0?'ok':'invalid-state',id:id,state:s,
    touchTarget:c.touchTarget,requires:c.requires||[],caution:c.caution||null,props:props||{}};
}

/* ---- §17/18/52 visualization registry ----------------------------------- */
var VISUALIZATION_REGISTRY={
  line:{dimensions:['temporal','numeric'],renderer:'svg',minObservations:2},
  area:{dimensions:['temporal','numeric'],renderer:'svg',minObservations:2},
  bar:{dimensions:['categorical','numeric'],renderer:'svg',minObservations:1},
  stackedBar:{dimensions:['categorical','numeric','group'],renderer:'svg',minObservations:2},
  groupedBar:{dimensions:['categorical','numeric','group'],renderer:'svg',minObservations:2},
  histogram:{dimensions:['numeric'],renderer:'svg',minObservations:10},
  scatter:{dimensions:['numeric','numeric'],renderer:'svg',minObservations:5},
  bubble:{dimensions:['numeric','numeric','numeric'],renderer:'svg',minObservations:5},
  boxPlot:{dimensions:['categorical','numeric'],renderer:'svg',minObservations:10},
  violin:{dimensions:['categorical','numeric'],renderer:'svg',minObservations:20},
  density:{dimensions:['numeric'],renderer:'svg',minObservations:20},
  heatmap:{dimensions:['categorical','categorical','numeric'],renderer:'svg',minObservations:4},
  calendarHeatmap:{dimensions:['date','numeric'],renderer:'svg',minObservations:7},
  radar:{dimensions:['categorical','numeric'],renderer:'svg',minObservations:3},
  polar:{dimensions:['cyclic','numeric'],renderer:'svg',minObservations:3},
  donut:{dimensions:['categorical','numeric'],renderer:'svg',minObservations:2},
  gauge:{dimensions:['numeric','boundedTarget'],renderer:'svg',minObservations:1},
  bullet:{dimensions:['numeric','target','range'],renderer:'svg',minObservations:1},
  waterfall:{dimensions:['orderedContribution','numeric'],renderer:'svg',minObservations:2},
  sankey:{dimensions:['flow','node'],renderer:'svg',minObservations:2},
  network:{dimensions:['node','edge'],renderer:'svg',minObservations:1},
  timeline:{dimensions:['date','event'],renderer:'svg',minObservations:1},
  gantt:{dimensions:['date','duration','category'],renderer:'svg',minObservations:1},
  sparkline:{dimensions:['ordered','numeric'],renderer:'svg',minObservations:2},
  ridgeline:{dimensions:['category','distribution'],renderer:'svg',minObservations:20},
  candlestick:{dimensions:['orderedState','numeric'],renderer:'svg',minObservations:2},
  controlChart:{dimensions:['ordered','numeric','controlLimits'],renderer:'svg',minObservations:10},
  fan:{dimensions:['temporal','distribution'],renderer:'svg',minObservations:2}
};
function registerVisualization(id,contract){
  if(!id||!contract)return {status:'invalid'};
  if(VISUALIZATION_REGISTRY[id]&&!contract.replace)return {status:'exists',id:id};
  var c=Object.assign({},contract);delete c.replace;VISUALIZATION_REGISTRY[id]=c;
  return {status:'ok',id:id};
}
function visualizationRuntimeSpec(series){
  series=Array.isArray(series)?series:[];
  var primary=series.find(function(s){return s&&s.type&&s.type!=='band';})||series[0]||{};
  var id=primary.type==='bars'?'bar':(primary.type==='dots'?'scatter':(primary.type==='line'?'line':(primary.type==='band'?'area':'line')));
  var rows=[];series.forEach(function(s){(s&&s.pts||[]).forEach(function(pt){if(pt&&pt.x!=null&&pt.y!=null)rows.push(pt);else if(pt&&(pt.lo!=null||pt.hi!=null))rows.push({x:pt.x,y:pt.hi!=null?pt.hi:pt.lo});});});
  var dims=id==='scatter'?['numeric','numeric']:(id==='bar'?['categorical','numeric']:['temporal','numeric']);
  var spec=visualizationSpec(id,{rows:rows,dimensions:dims});
  return {id:id,status:spec.status,renderer:spec.renderer,observations:spec.observations,minObservations:spec.minObservations,missingDimensions:spec.missingDimensions};
}
function uncertaintyRuntimeSpec(series){
  series=Array.isArray(series)?series:[];
  var types=[];
  series.forEach(function(s){if(s&&s.uncertaintyType)types.push(s.uncertaintyType);});
  if(series.some(function(s){return s&&s.type==='band';})&&types.indexOf('forecast')<0)types.push('forecast');
  return uncertaintyPresentationModel({types:types});
}
function forecastRuntimeSpec(series){
  series=Array.isArray(series)?series:[];
  var predictive=series.filter(function(s){return s&&s.epistemic==='PREDICTIVE';});
  if(!predictive.length)return {status:'unavailable',reason:'no-explicit-predictive-series'};
  return forecastPresentationModel({status:'ok',forecastMean:predictive[0].point||null,uncertainty:predictive[0].uncertainty||null,cls:'PREDICTIVE'});
}
function presentationDomainMetadata(kind,spec){
  spec=spec||{};
  var model=null;
  if(kind==='composition')model=compositionPresentationModel(spec);
  else if(kind==='body')model=bodyPresentationModel(spec);
  else if(kind==='movement')model=movementPresentationModel(spec);
  else if(kind==='exercise')model=exerciseMechanicsPresentationModel(spec);
  else if(kind==='causal')model=causalPresentationModel(spec);
  else if(kind==='uncertainty')model=uncertaintyPresentationModel(spec);
  else if(kind==='provenance')model=provenancePresentationModel(spec);
  return {kind:kind,model:model,status:model&&model.status||'ok',sealed:!!(model&&model.sealed)};
}
function visualizationSpec(id,input){
  var c=VISUALIZATION_REGISTRY[id];
  if(!c)return {status:'unknown',id:id};
  input=input||{};
  var rows=Array.isArray(input)?input:(input.rows||[]);
  var dims=input.dimensions||[];
  var min=c.minObservations||0;
  var sufficient=rows.length>=min;
  var missing=c.dimensions.filter(function(d){return dims.indexOf(d)<0;});
  return {status:sufficient&&missing.length===0?'ok':'insufficient',id:id,renderer:c.renderer,
    requiredDimensions:c.dimensions,missingDimensions:missing,observations:rows.length,minObservations:min};
}

/* ---- §19 forecast model: presentation only -------------------------------- */
function forecastPresentationModel(spec){
  spec=spec||{};
  var r=spec.result||spec;
  if(!r)return {status:'unavailable',reason:'no-source'};
  return {status:r.status&&r.status!=='ok'?'unavailable':'ok',
    historical:r.historical||r.observed||null,estimated:r.estimated||null,
    mean:r.forecastMean!=null?r.forecastMean:(r.point!=null?r.point:null),
    intervals:{p50:r.p50||null,p80:r.p80||null,p95:r.p95||null},
    actual:r.actual||null,revision:r.revision||null,
    cls:r.cls||'PREDICTIVE',uncertainty:r.uncertainty||r.interval||null,
    projection:true,sealed:true};
}
function validateForecastPresentation(pm){
  var v=[];
  if(!pm||pm.status!=='ok')return {ok:true,violations:[],rendered:'locked'};
  if(!pm.projection)v.push('forecast is not marked as a projection');
  if(pm.cls!=='PREDICTIVE')v.push('forecast must carry PREDICTIVE epistemic class');
  if(pm.uncertainty==null&&pm.intervals.p50==null&&pm.intervals.p80==null&&pm.intervals.p95==null)
    v.push('forecast has no uncertainty representation');
  return {ok:v.length===0,violations:v};
}

/* ---- §20 causal presentation model --------------------------------------- */
var CAUSAL_NODE_STATES=['observed','latent','measured','estimated','assumed','confounded','adjusted','identified','not identified'];
function causalPresentationModel(spec){
  spec=spec||{};
  return {status:'ok',nodes:(spec.nodes||[]).map(function(n){
      return {id:n.id,label:n.label,state:CAUSAL_NODE_STATES.indexOf(n.state)>=0?n.state:'not identified'};}),
    edges:(spec.edges||[]).map(function(e){return {from:e.from,to:e.to,lag:e.lag||null,effect:e.effect||null,interval:e.interval||null};}),
    confounders:spec.confounders||[],colliders:spec.colliders||[],instruments:spec.instruments||[],
    adjustmentSets:spec.adjustmentSets||[],sealed:true};
}

/* ---- §21 provenance / §22 uncertainty ------------------------------------ */
function provenancePresentationModel(spec){
  spec=spec||{};
  return {status:'ok',chain:(spec.chain||[]).map(function(x){
      return {kind:x.kind,id:x.id,label:x.label,source:x.source||null,asOf:x.asOf||null,cls:x.cls||null};}),
    terminal:spec.terminal||null,sealed:true};
}
/* §10: ONE UNCERTAINTY TAXONOMY. Four places named uncertainty kinds and none used the direction's names: this
   list said 'reference-data' and 'missing-data', the model contract and the quantity registry said
   'reference-data', and nothing anywhere could express 'userInput'. The same drift as the muscle names in
   step 13. The direction's ten are canonical; the old spellings are accepted as aliases on the way in so
   nothing stored breaks, and every canonical kind has a drawing. */
var UNCERTAINTY_TAXONOMY=['measurement','sampling','parameter','model','structural','missingness','forecast',
  'causal','referenceData','userInput'];
var UNCERTAINTY_ALIASES={'reference-data':'referenceData','missing-data':'missingness'};
/* canonicalUncertainty moved to 91-inference.js (engine layer) */
var UNCERTAINTY_TYPES=UNCERTAINTY_TAXONOMY;   // the same list, not a copy
var UNCERTAINTY_STYLES={
  measurement:'measurement',sampling:'hatched',model:'hatched',parameter:'dashed',
  forecast:'shaded-interval',causal:'shaded-interval',referenceData:'faded',
  missingness:'ghosted',structural:'ghosted',
  /* A value the person typed as an estimate ("about 2,400 kcal") is uncertain in a way no model produced;
     it is drawn faded, like reference data, because both are inputs taken on trust rather than measured. */
  userInput:'faded'
};
function uncertaintyPresentationModel(spec){
  spec=spec||{};
  var types=(spec.types||[]).filter(function(t){return UNCERTAINTY_TYPES.indexOf(t)>=0;});
  return {status:'ok',types:types.map(function(t){return {type:t,style:UNCERTAINTY_STYLES[t]};}),
    interval:spec.interval||null,confidence:spec.confidence==null?null:spec.confidence,
    label:spec.label||null,sealed:true};
}

/* ---- §23-26 body / movement / mechanics --------------------------------- */
var BODY_VIEWS=['full','front','back','side','left','right','lateral','oblique','custom'];
var BODY_LAYERS=['muscleGroups','jointMap','painSoreness','mobility','fatigue','trainingVolume','strength','measurement','progress'];
/* MUSCLE_MAPPINGS removed in H0: defined but never read (see docs/architecture/presentation-policies.md where it recorded a decision). */
function bodyPresentationModel(spec){
  spec=spec||{};
  var view=BODY_VIEWS.indexOf(spec.view)>=0?spec.view:'full';
  var layers=(spec.layers||[]).filter(function(x){return BODY_LAYERS.indexOf(x)>=0;});
  return {status:'ok',view:view,layers:layers,muscles:spec.muscles||[],overlay:spec.overlay||null,
    mappings:spec.mappings||{},observation:spec.observation||null,sealed:true};
}
var MOVEMENT_FIELDS=['start','end','rom','jointAngles','tempo','direction','forceVector','load','stability','balance','plane','axis'];
function movementPresentationModel(spec){
  spec=spec||{};
  var movement={};MOVEMENT_FIELDS.forEach(function(k){if(spec[k]!=null)movement[k]=spec[k];});
  return {status:'ok',movement:movement,renderer:spec.renderer||'anatomical',sequences:spec.sequences||[],
    sealed:true};
}
function exerciseMechanicsPresentationModel(spec){
  spec=spec||{};
  var fields=['joint','lever','axis','resistanceVector','momentArm','forceVector','rom','loadPath'];
  var mechanics={};fields.forEach(function(k){if(spec[k]!=null)mechanics[k]=spec[k];});
  return {status:'ok',mechanics:mechanics,sealed:true};
}

/* ---- §27-31 session/program/nutrition/composition/photo ----------------- */
function sessionPresentationModel(spec){
  spec=spec||{};
  var blocks=['WARMUP','PREP','POWER','PRIMARY','SECONDARY','ACCESSORY','CONDITIONING','COOLDOWN'];
  return {status:'ok',blocks:(spec.blocks||[]).map(function(b){
      return {phase:String(b.phase||'').toUpperCase(),duration:b.duration||null,volume:b.volume||null,
        intensity:b.intensity||null,fatigue:b.fatigue||null,rest:b.rest||null,purpose:b.purpose||null,
        order:blocks.indexOf(String(b.phase||'').toUpperCase())};
    }).sort(function(a,b){return a.order-b.order;}),sealed:true};
}
function programPresentationModel(spec){
  spec=spec||{};
  return {status:'ok',mesocycle:spec.mesocycle||null,weeks:spec.weeks||[],
    overlays:{fatigue:spec.fatigue||null,volume:spec.volume||null,intensity:spec.intensity||null,
      strength:spec.strength||null,recovery:spec.recovery||null,bodyweight:spec.bodyweight||null,
      energyAvailability:spec.energyAvailability||null},sealed:true};
}
function nutritionPresentationModel(spec){
  spec=spec||{};
  return {status:'ok',calories:spec.calories||null,macros:spec.macros||null,
    micronutrients:spec.micronutrients||null,mealTiming:spec.mealTiming||null,
    proteinDistribution:spec.proteinDistribution||null,fiber:spec.fiber||null,
    foodDensity:spec.foodDensity||null,foodQuality:spec.foodQuality||null,inventory:spec.inventory||null,
    cost:spec.cost||null,adequacy:spec.adequacy||null,deficits:spec.deficits||null,
    surpluses:spec.surpluses||null,sealed:true};
}
function compositionPresentationModel(spec){
  spec=spec||{};
  return {status:'ok',weightTrend:spec.weightTrend||null,smoothedWeight:spec.smoothedWeight||null,
    bodyFatTrend:spec.bodyFatTrend||null,leanMassEstimate:spec.leanMassEstimate||null,
    waterResidual:spec.waterResidual||null,energyBalance:spec.energyBalance||null,TDEE:spec.TDEE||null,
    deficit:spec.deficit||null,rateOfLoss:spec.rateOfLoss||null,forecast:spec.forecast||null,
    lines:{measured:spec.measured||[],derived:spec.derived||[],predicted:spec.predicted||[]},
    semanticSeparation:{measured:'solid',derived:'dashed',predicted:'dotted'},sealed:true};
}
function photoProgressPresentationModel(spec){
  spec=spec||{};
  return {status:'ok',photos:spec.photos||[],metadata:{
      pose:spec.pose||null,lighting:spec.lighting||null,cameraDistance:spec.cameraDistance||null,
      angle:spec.angle||null,crop:spec.crop||null,alignment:spec.alignment||null},
    comparison:spec.comparison||null,privacy:spec.privacy||'local-only',
    distinction:{visualObservation:true,measurement:false,inference:false},sealed:true};
}

/* ---- §41/42 dashboard/widget execution ----------------------------------- */
var WIDGET_REGISTRY={};
function registerWidget(spec){
  spec=spec||{};
  if(!spec.widgetId)return {status:'invalid',reason:'widgetId required'};
  var required=['version','data','renderer','sizes'];
  var missing=required.filter(function(k){return spec[k]==null;});
  if(missing.length)return {status:'invalid',widgetId:spec.widgetId,missing:missing};
  WIDGET_REGISTRY[spec.widgetId]=Object.assign({},spec);
  return {status:'ok',widgetId:spec.widgetId};
}
function widgetSpec(id){return WIDGET_REGISTRY[id]||null;}
/* A widget is executable only when its registered renderer and presentation contract can be resolved.
   This is the single widget -> renderer bridge; view code should not grow parallel widget dispatch tables. */
var WIDGET_RENDERERS={lineChart:function(o){return typeof svgChart==='function'?svgChart(o||{}):'<div class=\"empty\">Chart renderer unavailable.</div>';}};
function renderWidget(id,context){
  context=context||{};var spec=widgetSpec(id);
  if(!spec)return {status:'unknown-widget',widgetId:id};
  var renderer=WIDGET_RENDERERS[spec.renderer];
  if(typeof renderer!=='function')return {status:'renderer-unavailable',widgetId:id,renderer:spec.renderer};
  var model=context.model||context.presentationModel||null;
  if(spec.contractId){
    if(!model)return {status:'missing-presentation-model',widgetId:id,contractId:spec.contractId};
    var checked=typeof validateVisualization==='function'?validateVisualization(spec.contractId,model):{ok:false,violations:['presentation validator unavailable']};
    if(!checked.ok)return {status:'invalid-presentation',widgetId:id,contractId:spec.contractId,violations:checked.violations||[]};
  }
  var opts=Object.assign({},context);delete opts.model;delete opts.presentationModel;
  if(spec.contractId)opts.presentation={contractId:spec.contractId,model:model};
  delete opts.widgetId;
  var html=renderer(opts);
  /* Developer detail for every model-backed widget: which model, which version, how mature, and the run behind the
     value. Hidden below the Developer level by the .dev rule, so it costs nothing elsewhere. */
  var dev=(spec.modelDependencies||[]).map(function(mid){
    var c=null,r=null;try{c=modelContract(mid);r=infer({modelId:mid});}catch(e){}
    return c?(mid+' v'+c.version+' \u00b7 '+String(c.maturity||'').toLowerCase().replace(/_/g,' ')+(r&&r.runId?' \u00b7 run '+String(r.runId).slice(0,10):'')):null;}).filter(Boolean);
  if(dev.length&&typeof html==='string')html=html.replace(/<\/div>\s*$/,'<div class="dev">'+dev.map(esc).join('<br>')+'</div></div>');
  return {status:'ok',widgetId:id,html:html,renderer:spec.renderer,contractId:spec.contractId||null};
}
function composeDashboard(widgets,layout){
  widgets=widgets||[];layout=layout||{};
  var missing=widgets.filter(function(id){return !WIDGET_REGISTRY[id];});
  return {status:missing.length?'invalid':'ok',widgets:widgets.slice(),layout:layout,missing:missing,
    serializable:true};
}
function applyLayoutOperation(layout,op){
  layout=Object.assign({},layout||{});op=op||{};
  var allowed=['move','resize','collapse','expand','pin','hide','duplicate','group','stack','split'];
  if(allowed.indexOf(op.type)<0)return {status:'invalid-operation',layout:layout};
  var id=op.widgetId;if(!id)return {status:'invalid',layout:layout};
  var row=Object.assign({},layout[id]||{widgetId:id});
  if(op.type==='move'||op.type==='resize')Object.assign(row,op.value||{});
  else if(op.type==='collapse'||op.type==='expand')row.collapsed=op.type==='collapse';
  else if(op.type==='pin')row.pinned=true;
  else if(op.type==='hide')row.hidden=true;
  else if(op.type==='duplicate')row.duplicateOf=id;
  else row.container=op.value||op.type;
  layout[id]=row;
  return {status:'ok',layout:layout};
}

/* ---- §46/47 view/navigation registry ------------------------------------ */
var VIEW_REGISTRY={};
function registerView(spec){
  spec=spec||{};var req=['viewId','route','title','domain'];
  var missing=req.filter(function(k){return spec[k]==null;});
  if(missing.length)return {status:'invalid',missing:missing};
  VIEW_REGISTRY[spec.viewId]=Object.assign({
    permissions:[],dataDependencies:[],modelDependencies:[],widgets:[],
    layout:null,responsiveRules:{},keyboardShortcuts:[],accessibility:{},analytics:null
  },spec);
  return {status:'ok',viewId:spec.viewId};
}
function viewSpec(id){return VIEW_REGISTRY[id]||null;}
function navigationModel(spec){
  spec=spec||{};
  var views=spec.views||Object.keys(VIEW_REGISTRY);
  return {status:'ok',order:views.slice(),pinned:(spec.pinned||[]).filter(function(id){return views.indexOf(id)>=0;}),
    hidden:(spec.hidden||[]).filter(function(id){return views.indexOf(id)>=0;}),
    favorites:(spec.favorites||[]).filter(function(id){return views.indexOf(id)>=0;}),
    shortcuts:spec.shortcuts||{}};
}

/* ---- §48/49 interaction execution ---------------------------------------- */
var INTERACTION_PRIMITIVES=['click','tap','doubleTap','longPress','drag','drop','swipe','pinch','zoom','hover','focus','keyboard','wheel','scrub','select','multiSelect'];
var VISUALIZATION_INTERACTIONS=['hover','tap','scrub','zoom','pan','rangeSelect','seriesToggle','eventSelection','annotation','comparison','crosshair','dataPointInspection'];
function interactionSpec(component,available){
  var a=(available||[]).filter(function(x){return INTERACTION_PRIMITIVES.indexOf(x)>=0;});
  return {component:component,interactions:a,keyboardRequired:a.indexOf('keyboard')>=0};
}
function visualizationInteractionSpec(available){
  return {interactions:(available||[]).filter(function(x){return VISUALIZATION_INTERACTIONS.indexOf(x)>=0;}),
    exposesData:true,inspectable:true};
}

/* ---- §50/51 inspect + presentation provenance --------------------------- */
function inspectPresentation(spec){
  spec=spec||{};
  return {status:'ok',what:spec.label||spec.what||null,source:spec.source||null,
    data:spec.data||null,model:spec.model||null,calculatedAt:spec.calculatedAt||spec.asOf||null,
    uncertainty:spec.uncertainty||null,assumptions:spec.assumptions||[],
    visual:spec.visual||null,contract:spec.contract||null,sealed:true};
}
function presentationProvenance(spec){
  spec=spec||{};
  return {status:'ok',semantic:spec.semantic||null,threshold:spec.threshold||null,
    modelContract:spec.modelContract||null,themeToken:spec.themeToken||null,
    theme:spec.theme||null,skin:spec.skin||null,renderer:spec.renderer||null,sealed:true};
}

/* ---- §54-57 governance / performance / export --------------------------- */
/* PERFORMANCE_CLASSES removed in H0: defined but never read (see docs/architecture/presentation-policies.md where it recorded a decision). */
function presentationPerformance(nodes){
  nodes=Math.max(0,Number(nodes)||0);
  var cls=nodes<=500?'LIGHT':nodes<=2000?'MEDIUM':nodes<=10000?'HEAVY':'VERY_HEAVY';
  return {nodes:nodes,class:cls,renderer:cls==='VERY_HEAVY'?'webgl':(cls==='HEAVY'?'canvas':'svg')};
}
/* ANIMATION_POLICY removed in H0: defined but never read (see docs/architecture/presentation-policies.md where it recorded a decision). */
function animationPolicy(request,reduced){
  request=request||{};var r=!!reduced;
  if(r)return Object.assign({},request,{duration:0,easing:'linear',motion:'static-or-fade'});
  return Object.assign({duration:'normal',easing:'standard',motion:'animated'},request);
}
function exportPresentationSpec(spec,format){
  spec=spec||{};format=String(format||'json').toLowerCase();
  var allowed=['pdf','print','image','svg','csv','json'];
  if(allowed.indexOf(format)<0)return {status:'unsupported',format:format};
  return {status:'ok',format:format,page:spec.page||null,sections:spec.sections||[],
    figures:spec.figures||[],captions:spec.captions||[],legends:spec.legends||[],
    footnotes:spec.footnotes||[],source:spec.source||null,uncertainty:spec.uncertainty||null,
    provenance:spec.provenance||null,dedicatedRenderer:'ReportRenderer'};
}
/* REPORT_RENDERER removed in H0: defined but never read (see docs/architecture/presentation-policies.md where it recorded a decision). */
/* ADVANCED_RENDERERS removed in H0: defined but never read (see docs/architecture/presentation-policies.md where it recorded a decision). */
/* SKIN_SYSTEM removed in H0: defined but never read (see docs/architecture/presentation-policies.md where it recorded a decision). */
function applySkin(component,skin,tokens){
  return {component:component,skin:skin||null,tokens:tokens||DESIGN_TOKENS,semanticsUntouched:true};
}

/* ---- §43/44/45 personalization ------------------------------------------ */
var UX_PERSONALIZATION_KEYS=['preferredDashboard','frequentlyUsedCommands','favoriteMetrics','preferredChartTypes','defaultTimeRanges','defaultTrainingView','defaultNutritionView','density','theme','navigationOrder'];
function personalizationModel(spec){
  spec=spec||{};var out={};
  UX_PERSONALIZATION_KEYS.forEach(function(k){if(spec[k]!=null)out[k]=spec[k];});
  return {status:'ok',preferences:out,sensitivePhysiologyInference:false,sealed:true};
}

/* ---- presentation diagnostics / strict verification --------------------- */
var PRESENTATION_REQUIRED_EXECUTIONS=[
  'presentationModel','dataStateVisual','presentationMetric','typographySpec',
  'responsiveSpec','componentSpec','visualizationSpec','forecastPresentationModel',
  'causalPresentationModel','provenancePresentationModel','uncertaintyPresentationModel',
  'bodyPresentationModel','movementPresentationModel','exerciseMechanicsPresentationModel',
  'sessionPresentationModel','programPresentationModel','nutritionPresentationModel',
  'compositionPresentationModel','photoProgressPresentationModel','registerWidget',
  'composeDashboard','renderWidget','applyLayoutOperation','registerView','navigationModel','presentationViewGuard',
  'interactionSpec','visualizationInteractionSpec','inspectPresentation',
  'presentationProvenance','presentationPerformance','animationPolicy',
  'exportPresentationSpec','applySkin','personalizationModel'
];
function presentationExecutionAudit(){
  var missing=PRESENTATION_REQUIRED_EXECUTIONS.filter(function(name){return typeof globalThis[name]!=='function';});
  var registries=[
    ['engine',PRESENTATION_ENGINE.subsystems.length],
    ['dataStates',Object.keys(DATA_STATE_VISUALS).length],
    ['visualizations',Object.keys(VISUALIZATION_REGISTRY).length],
    ['components',Object.keys(PRESENTATION_COMPONENTS).length],
    ['widgets',Object.keys(WIDGET_REGISTRY).length],
    ['views',Object.keys(VIEW_REGISTRY).length]
  ];
  var issues=missing.map(function(x){return 'missing execution '+x;});
  if(Object.keys(VISUALIZATION_REGISTRY).length<28)issues.push('visualization registry is incomplete');
  if(Object.keys(DATA_STATE_VISUALS).length<13)issues.push('data-state visual language is incomplete');
  if(PRESENTATION_ENGINE.forbidden.indexOf('chart → unsanctioned analytical calculation')<0)issues.push('analytical/presentation boundary not declared');
  return {ok:issues.length===0,missing:missing,issues:issues,registries:registries,
    required:PRESENTATION_REQUIRED_EXECUTIONS.length,cls:'POLICY',
    note:'Strict executable coverage of the Visual / Presentation / Customization specification. This checks that named execution surfaces exist; domain analytical truth remains outside this layer.'};
}
function presentationSpecificationAudit(){
  var base=typeof presentationSelfAudit==='function'?presentationSelfAudit():{findings:[],ok:true};
  var completion=typeof presentationCompletionAudit==='function'?presentationCompletionAudit():{findings:[],ok:true};
  var exec=presentationExecutionAudit();
  var theme=typeof presentationThemeAudit==='function'?presentationThemeAudit():{ok:true,rows:[]};
  var all=(base.findings||[]).concat(completion.findings||[]).concat(exec.issues||[]).concat(theme.ok?[]:theme.rows.filter(function(r){return !r.ok;}));
  return {ok:exec.ok&&base.ok!==false&&completion.ok!==false&&all.length===0,
    execution:exec,base:base,completion:completion,theme:theme,findings:all,cls:'POLICY'};
}

/* Register executable presentation surfaces against the application's real view/render registry.
   This intentionally follows RENDERERS rather than inventing a second navigation taxonomy. */
registerWidget({widgetId:'body.weightTrend',version:'1.0',data:['weight','date'],modelDependencies:[],renderer:'lineChart',contractId:'WeightTrendChart',sizes:['sm','md','lg'],refresh:'materialized'});
[
  ['today','/today','Today','core'],['log','/log','Log','core'],['plan','/plan','Plan','training'],
  ['train','/train','Train','training'],['food','/food','Food','nutrition'],['body','/body','Body','body'],
  ['progress','/progress','Progress','body'],['diagnose','/diagnose','Diagnose','knowledge'],
  ['experiments','/experiments','Experiments','knowledge'],['learn','/learn','Learn','knowledge'],
  ['archive','/archive','Archive','core'],['tools','/tools','Tools','system']
].forEach(function(v){registerView({viewId:v[0],route:v[1],title:v[2],domain:v[3]});});
function presentationViewGuard(id){
  var spec=viewSpec(id),renderer=(typeof RENDERERS!=='undefined'&&RENDERERS)?RENDERERS[id]:null;
  if(!spec)return {ok:false,status:'unregistered-view',viewId:id};
  if(typeof renderer!=='function')return {ok:false,status:'renderer-missing',viewId:id};
  return {ok:true,status:'ok',viewId:id,spec:spec};
}

/* ============================================================================
   STEP 11: ONE DASHBOARD SYSTEM, AND AN EDITOR FOR IT
   Two dashboard systems had arrived here from two branches and neither knew about the other:
   WIDGETS + DASHBOARD_LAYOUTS + dashboardCompose() in the visual-complete module, and WIDGET_REGISTRY +
   composeDashboard() + applyLayoutOperation() here. Zero overlapping widget ids. Neither was rendered by
   any view. The direction forbids exactly this ("do not solve an integration problem by duplicating an
   existing subsystem"), so WIDGET_REGISTRY \u2014 the richer schema, and the one renderWidget() reads \u2014 is
   canonical, the other six widgets are migrated into it, and the older functions become thin callers.

   A dashboard is DATA, in the shape the direction specifies: sections holding widget placements. Every
   edit is an operation that returns a NEW specification, validated before it is accepted. The renderer
   reads the specification and nothing else.
   ============================================================================ */
(function migrateWidgets(){
  /* Each widget names the canonical MODEL it depends on, not a function, so the dependency graph and the
     capability matrix can see it. */
  var MIGRATED={
    /* NOT body.weightTrend: that id already exists as a contract-validated line chart. The first version of
       this migration merged over it, replaced its renderer with a metric tile, and broke a widget that
       worked — which the engine gate caught. A migration adds; it never redefines an existing entry. */
    'body.weightRate':{title:'Weight trend',kind:'metric',model:'weight_trend',field:'slopePerWeek',
      unit:'lb/week',signed:true,sizes:['sm','md','lg'],defaultSize:'md'},
    'energy.today':{title:'Energy today',kind:'metric',model:'energy_balance',field:'balance',
      unit:'kcal/day',signed:true,sizes:['sm','md'],defaultSize:'sm'},
    'recovery.readiness':{title:'Readiness',kind:'metric',model:'recovery',field:'score',
      unit:'z',signed:true,sizes:['sm','md'],defaultSize:'sm'},
    'training.nextSession':{title:'Next session',kind:'text',source:'nextSessionText',
      sizes:['md','lg'],defaultSize:'md'},
    'nutrition.adherence':{title:'Adherence',kind:'metric',model:'adherence',field:'overall',
      unit:'%',sizes:['sm','md'],defaultSize:'sm'},
    'system.attention':{title:'Needs attention',kind:'count',source:'attentionCount',
      sizes:['sm','md'],defaultSize:'sm'},
    'energy.maintenance':{title:'Maintenance',kind:'metric',model:'tdee_personal',field:'value',
      unit:'kcal/day',sizes:['sm','md'],defaultSize:'sm'}
  };
  Object.keys(MIGRATED).forEach(function(id){
    /* Refuse to redefine: an id that already exists keeps its existing definition untouched. */
    if(WIDGET_REGISTRY[id])return;
    var m=MIGRATED[id],prior={};
    WIDGET_REGISTRY[id]=Object.assign({},prior,m,{
      widgetId:id,version:prior.version||'1.0',
      modelDependencies:m.model?[m.model]:[],
      renderer:m.kind==='metric'?'metricTile':(m.kind==='count'?'countTile':(m.kind==='text'?'textTile':prior.renderer)),
      contractId:prior.contractId||null
    });
  });
})();
/* The older short-id registry becomes a VIEW onto the canonical one, so there is one source. */
var WIDGET_LEGACY_IDS={weightTrend:'body.weightRate',todayEnergy:'energy.today',readiness:'recovery.readiness',
  nextSession:'training.nextSession',adherence:'nutrition.adherence',attention:'system.attention'};
/* ---------------- renderers: read canonical models, never compute ---------------- */
function _widgetValue(w){
  if(w.model){
    var r=null;try{r=infer({modelId:w.model});}catch(e){}
    if(!r||r.status!=='ok'||!r.value)return {status:'insufficient',note:'not enough data yet'};
    var v=r.value[w.field];
    if(v==null||!isFinite(v))return {status:'insufficient',note:'no value'};
    return {status:'ok',value:v,lo:r.value.lo,hi:r.value.hi,cls:r.value.cls||r.cls,runId:r.runId};
  }
  if(w.source==='attentionCount'){
    /* attentionQueue() returns {items, counts}, not an array, so reading .length on it gave undefined and the
       tile rendered NaN. Read the same field the header badge reads, so the two cannot show different
       numbers — a dashboard contradicting the header is worse than one that shows nothing. */
    var q=null;try{q=attentionQueue();}catch(e){}
    var n=q&&Array.isArray(q.items)?q.items.length:(Array.isArray(q)?q.length:null);
    if(n==null)return {status:'insufficient',note:'attention queue unavailable'};
    return {status:'ok',value:n,cls:'MEASURED'};
  }
  if(w.source==='nextSessionText'){
    var t=null;try{var p=trainingProgram();var d=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(todayISO()+'T12:00:00Z').getUTCDay()];
      t=p&&p.week&&p.week[d]?p.week[d].label:'Rest day';}catch(e){}
    return t?{status:'ok',text:t,cls:'POLICY'}:{status:'insufficient',note:'no program'};
  }
  return {status:'insufficient'};
}
function _fmtWidget(w,v){
  if(v.text)return esc(v.text);
  /* A count is an integer. With no unit it fell through to two decimal places and would have read "5.00". */
  var dp=w.kind==='count'?0:(w.unit==='kcal/day'?0:(w.unit==='%'||w.unit==='z'?(w.unit==='z'?2:0):2));
  var s=Number(v.value).toFixed(dp);
  if(w.signed&&v.value>0)s='+'+s;
  return esc(s)+(w.unit&&w.unit!=='z'?' <small>'+esc(w.unit)+'</small>':'');
}
WIDGET_RENDERERS.metricTile=function(o){
  var w=o.widget,v=_widgetValue(w);
  if(v.status!=='ok')return '<div class="w-tile w-empty"><div class="w-t">'+esc(w.title)+'</div>'+
    '<div class="w-v w-gap" aria-label="no data">\u2014</div><div class="w-s">'+esc(v.note||'no data')+'</div></div>';
  var band=(v.lo!=null&&v.hi!=null)?('<div class="w-s">'+esc(Number(v.lo).toFixed(0))+' to '+esc(Number(v.hi).toFixed(0))+'</div>'):'';
  return '<div class="w-tile"><div class="w-t">'+esc(w.title)+'</div><div class="w-v">'+_fmtWidget(w,v)+'</div>'+
    band+'<div class="w-s">'+(typeof clsMark==='function'?clsMark(v.cls):esc(v.cls||''))+'</div></div>';
};
WIDGET_RENDERERS.countTile=WIDGET_RENDERERS.metricTile;
WIDGET_RENDERERS.textTile=function(o){
  var w=o.widget,v=_widgetValue(w);
  return '<div class="w-tile"><div class="w-t">'+esc(w.title)+'</div><div class="w-v w-text">'+
    (v.status==='ok'?esc(v.text):'\u2014')+'</div></div>';
};
/* ---------------- the specification ---------------- */
var DASHBOARD_SPEC_VERSION=1;
var BUILTIN_DASHBOARDS={
  standard:{id:'standard',version:1,profile:'standard',builtin:true,sections:[
    {id:'today',title:'Today',widgets:[
      {widgetId:'body.weightRate',size:'md',visible:true,pinned:true},
      {widgetId:'energy.maintenance',size:'sm',visible:true},
      {widgetId:'energy.today',size:'sm',visible:true}]},
    {id:'recovery',title:'Recovery and training',widgets:[
      {widgetId:'recovery.readiness',size:'sm',visible:true},
      {widgetId:'training.nextSession',size:'md',visible:true}]},
    {id:'record',title:'Record',widgets:[
      {widgetId:'nutrition.adherence',size:'sm',visible:true},
      {widgetId:'system.attention',size:'sm',visible:true}]}]},
  minimal:{id:'minimal',version:1,profile:'minimal',builtin:true,sections:[
    {id:'main',title:'At a glance',widgets:[
      {widgetId:'body.weightRate',size:'md',visible:true,pinned:true},
      {widgetId:'system.attention',size:'sm',visible:true}]}]}
};
function _cloneSpec(s){return JSON.parse(JSON.stringify(s));}
/* A dashboard saved before a widget was renamed names the old id; validation rejected it as unknown, so the dashboard
   failed to load. Old ids are mapped through WIDGET_LEGACY_IDS first, and the mapping is reported. */
function migrateDashboardSpec(spec){
  var migrated=[];if(!spec||!Array.isArray(spec.sections))return {spec:spec,migrated:migrated};
  spec.sections.forEach(function(sec){(sec.widgets||[]).forEach(function(p){var n=WIDGET_LEGACY_IDS[p.widgetId];
    if(n&&!WIDGET_REGISTRY[p.widgetId]){migrated.push(p.widgetId+' \u2192 '+n);p.widgetId=n;}});});
  return {spec:spec,migrated:migrated};
}
function validateDashboardSpec(spec){
  var _mg=migrateDashboardSpec(spec);spec=_mg.spec;
  var errs=[];
  if(!spec||!Array.isArray(spec.sections))return {ok:false,errors:['no sections array']};
  var seen={},secIds={};
  spec.sections.forEach(function(sec,i){
    if(!sec.id)errs.push('section '+i+' has no id');
    if(secIds[sec.id])errs.push('duplicate section id "'+sec.id+'"');secIds[sec.id]=1;
    (sec.widgets||[]).forEach(function(p){
      var w=WIDGET_REGISTRY[p.widgetId];
      if(!w){errs.push('unknown widget "'+p.widgetId+'"');return;}
      if(seen[p.widgetId])errs.push('"'+p.widgetId+'" appears twice');seen[p.widgetId]=1;
      if(p.size&&w.sizes&&w.sizes.indexOf(p.size)<0)
        errs.push(p.widgetId+' does not support size "'+p.size+'" (supports '+w.sizes.join(', ')+')');
    });
  });
  return {ok:errs.length===0,errors:errs};
}
/* ---------------- operations ----------------
   The direction's operations \u2014 moveWidget, resizeWidget, addWidget, removeWidget, groupWidget,
   ungroupWidget \u2014 plus hide/show, pin/unpin and section create/move. Every operation returns a NEW spec
   and is validated; a spec is never mutated in place, so an invalid edit leaves the original untouched. */
var DASHBOARD_OPERATIONS=['moveWidget','resizeWidget','addWidget','removeWidget','groupWidget','ungroupWidget',
  'hideWidget','showWidget','pinWidget','unpinWidget','addSection','moveSection','removeSection','renameSection'];
function _locate(spec,widgetId){
  for(var i=0;i<spec.sections.length;i++){
    var ws=spec.sections[i].widgets||[];
    for(var j=0;j<ws.length;j++)if(ws[j].widgetId===widgetId)return {s:i,w:j};
  }
  return null;
}
function applyDashboardOperation(spec,op){
  op=op||{};
  if(DASHBOARD_OPERATIONS.indexOf(op.type)<0)
    return {status:'invalid-operation',spec:spec,note:'Unknown operation "'+op.type+'".'};
  var s=_cloneSpec(spec);
  var at=op.widgetId?_locate(s,op.widgetId):null;
  var secIdx=function(id){for(var i=0;i<s.sections.length;i++)if(s.sections[i].id===id)return i;return -1;};
  switch(op.type){
    case 'addWidget':
      if(at)return {status:'refused',spec:spec,note:op.widgetId+' is already on this dashboard.'};
      if(!WIDGET_REGISTRY[op.widgetId])return {status:'refused',spec:spec,note:'No widget called "'+op.widgetId+'".'};
      var si=op.sectionId?secIdx(op.sectionId):0;
      if(si<0)return {status:'refused',spec:spec,note:'No section "'+op.sectionId+'".'};
      s.sections[si].widgets.push({widgetId:op.widgetId,
        size:op.size||WIDGET_REGISTRY[op.widgetId].defaultSize||'sm',visible:true});
      break;
    case 'removeWidget':
      if(!at)return {status:'refused',spec:spec,note:op.widgetId+' is not on this dashboard.'};
      s.sections[at.s].widgets.splice(at.w,1);break;
    case 'moveWidget':{
      if(!at)return {status:'refused',spec:spec,note:op.widgetId+' is not on this dashboard.'};
      var item=s.sections[at.s].widgets.splice(at.w,1)[0];
      var ti=op.toSection?secIdx(op.toSection):at.s;
      if(ti<0)return {status:'refused',spec:spec,note:'No section "'+op.toSection+'".'};
      var idx=Math.max(0,Math.min(op.toIndex!=null?op.toIndex:s.sections[ti].widgets.length,s.sections[ti].widgets.length));
      s.sections[ti].widgets.splice(idx,0,item);break;}
    case 'resizeWidget':
      if(!at)return {status:'refused',spec:spec,note:op.widgetId+' is not on this dashboard.'};
      s.sections[at.s].widgets[at.w].size=op.size;break;
    case 'hideWidget':case 'showWidget':
      if(!at)return {status:'refused',spec:spec,note:op.widgetId+' is not on this dashboard.'};
      s.sections[at.s].widgets[at.w].visible=op.type==='showWidget';break;
    case 'pinWidget':case 'unpinWidget':
      if(!at)return {status:'refused',spec:spec,note:op.widgetId+' is not on this dashboard.'};
      s.sections[at.s].widgets[at.w].pinned=op.type==='pinWidget';break;
    case 'groupWidget':
      if(!at)return {status:'refused',spec:spec,note:op.widgetId+' is not on this dashboard.'};
      s.sections[at.s].widgets[at.w].group=op.group||'group';break;
    case 'ungroupWidget':
      if(!at)return {status:'refused',spec:spec,note:op.widgetId+' is not on this dashboard.'};
      delete s.sections[at.s].widgets[at.w].group;break;
    case 'addSection':
      if(secIdx(op.sectionId)>=0)return {status:'refused',spec:spec,note:'Section "'+op.sectionId+'" already exists.'};
      s.sections.push({id:op.sectionId,title:op.title||op.sectionId,widgets:[]});break;
    case 'removeSection':{
      var ri=secIdx(op.sectionId);
      if(ri<0)return {status:'refused',spec:spec,note:'No section "'+op.sectionId+'".'};
      if(s.sections[ri].widgets.length)return {status:'refused',spec:spec,
        note:'Section "'+op.sectionId+'" still holds widgets. Move or remove them first, so nothing disappears by accident.'};
      s.sections.splice(ri,1);break;}
    case 'moveSection':{
      var mi=secIdx(op.sectionId);
      if(mi<0)return {status:'refused',spec:spec,note:'No section "'+op.sectionId+'".'};
      var sec=s.sections.splice(mi,1)[0];
      s.sections.splice(Math.max(0,Math.min(op.toIndex,s.sections.length)),0,sec);break;}
    case 'renameSection':{
      var ni=secIdx(op.sectionId);
      if(ni<0)return {status:'refused',spec:spec,note:'No section "'+op.sectionId+'".'};
      s.sections[ni].title=String(op.title||'').slice(0,40)||s.sections[ni].title;break;}
  }
  var v=validateDashboardSpec(s);
  if(!v.ok)return {status:'refused',spec:spec,errors:v.errors,note:'The edit would produce an invalid dashboard: '+v.errors[0]};
  s.builtin=false;
  return {status:'ok',spec:s,operation:op.type};
}
/* ---------------- compose: the one path from spec to render model ---------------- */
function composeDashboardSpec(spec,opts){
  opts=opts||{};
  var v=validateDashboardSpec(spec);
  if(!v.ok)return {status:'invalid',errors:v.errors};
  /* Narrow screens get one column and every widget at its smallest supported size: responsive editing
     is a property of the composition, not a second layout to maintain. */
  var narrow=(opts.width||0)>0&&opts.width<520;
  var sections=spec.sections.map(function(sec){
    var ws=(sec.widgets||[]).filter(function(p){return p.visible!==false||opts.editing;})
      .slice().sort(function(a,b){return (b.pinned?1:0)-(a.pinned?1:0);})
      .map(function(p){
        var w=WIDGET_REGISTRY[p.widgetId];
        return {widgetId:p.widgetId,title:w.title||p.widgetId,
          size:narrow?(w.sizes?w.sizes[0]:'sm'):(p.size||w.defaultSize||'sm'),
          visible:p.visible!==false,pinned:!!p.pinned,group:p.group||null,
          modelDependencies:w.modelDependencies||[]};
      });
    return {id:sec.id,title:sec.title,widgets:ws};
  });
  return {status:'ok',id:spec.id,sections:sections,narrow:narrow,
    widgetCount:sections.reduce(function(a,s){return a+s.widgets.length;},0)};
}
function renderDashboard(spec,opts){
  var c=composeDashboardSpec(spec,opts);
  if(c.status!=='ok')return '<div class="hint warn">'+esc((c.errors||['invalid'])[0])+'</div>';
  return c.sections.map(function(sec){
    return '<div class="dash-section"><div class="card-title">'+esc(sec.title)+'</div><div class="dash-grid'+
      (c.narrow?' dash-narrow':'')+'">'+sec.widgets.map(function(w){
        /* Through renderWidget(), the single widget-to-renderer bridge, so every tile gets the same
           contract validation as any other widget. The first version of this dispatched to the renderers
           directly — a parallel dispatch table, which the bridge exists to prevent. A widget the bridge
           declines is shown as declined, with the reason, rather than rendered anyway. */
        var reg=WIDGET_REGISTRY[w.widgetId];
        var rr=renderWidget(w.widgetId,{widget:reg});
        var html=rr.status==='ok'?rr.html:
          '<div class="w-tile w-empty"><div class="w-t">'+esc(w.title)+'</div>'+
          '<div class="w-v w-gap">\u2014</div><div class="w-s">'+esc(rr.status.replace(/-/g,' '))+'</div></div>';
        return '<div class="dash-cell dash-'+esc(w.size)+(w.visible?'':' dash-hidden')+'" data-widget="'+esc(w.widgetId)+'">'+html+'</div>';
      }).join('')+'</div></div>';
  }).join('');
}
/* ---------------- saved dashboards ---------------- */
function currentDashboard(){
  var id=DB.settings.dashboardId||'standard';
  var saved=(DB.settings.dashboards||[]).filter(function(d){return d.id===id;})[0];
  return _cloneSpec(saved||BUILTIN_DASHBOARDS[id]||BUILTIN_DASHBOARDS.standard);
}
function listDashboards(){
  return Object.keys(BUILTIN_DASHBOARDS).map(function(k){return {id:k,builtin:true};})
    .concat((DB.settings.dashboards||[]).map(function(d){return {id:d.id,builtin:false};}));
}
function commitDashboard(spec){
  var v=validateDashboardSpec(spec);
  if(!v.ok)return {status:'refused',errors:v.errors};
  /* Editing a built-in forks it rather than overwriting it, so a built-in is always there to go back to. */
  var id=spec.builtin||BUILTIN_DASHBOARDS[spec.id]?(spec.id+'-custom'):spec.id;
  var s=_cloneSpec(spec);s.id=id;s.builtin=false;s.version=DASHBOARD_SPEC_VERSION;
  DB.settings.dashboards=(DB.settings.dashboards||[]).filter(function(d){return d.id!==id;}).concat([s]);
  DB.settings.dashboardId=id;
  return {status:'ok',id:id};
}
function duplicateDashboard(id,newId){
  var src=(DB.settings.dashboards||[]).filter(function(d){return d.id===id;})[0]||BUILTIN_DASHBOARDS[id];
  if(!src)return {status:'unknown',id:id};
  newId=String(newId||(id+'-copy')).replace(/[^a-z0-9-]/gi,'-').slice(0,32);
  if(BUILTIN_DASHBOARDS[newId]||(DB.settings.dashboards||[]).some(function(d){return d.id===newId;}))
    return {status:'refused',note:'"'+newId+'" already exists.'};
  var s=_cloneSpec(src);s.id=newId;s.builtin=false;
  DB.settings.dashboards=(DB.settings.dashboards||[]).concat([s]);
  return {status:'ok',id:newId};
}
function deleteDashboard(id){
  if(BUILTIN_DASHBOARDS[id])return {status:'refused',note:'Built-in dashboards cannot be deleted.'};
  var n=(DB.settings.dashboards||[]).length;
  DB.settings.dashboards=(DB.settings.dashboards||[]).filter(function(d){return d.id!==id;});
  if(DB.settings.dashboardId===id)DB.settings.dashboardId='standard';
  return {status:(DB.settings.dashboards.length<n)?'ok':'unknown',id:id};
}
/* The older compose path now delegates, so there is one way from spec to widgets. */
function dashboardSystemAudit(){
  var issues=[];
  Object.keys(BUILTIN_DASHBOARDS).forEach(function(k){
    var v=validateDashboardSpec(BUILTIN_DASHBOARDS[k]);
    if(!v.ok)issues.push('built-in "'+k+'": '+v.errors[0]);
  });
  Object.keys(WIDGET_REGISTRY).forEach(function(id){
    var w=WIDGET_REGISTRY[id];
    if(!WIDGET_RENDERERS[w.renderer])issues.push(id+': renderer "'+w.renderer+'" does not exist');
    (w.modelDependencies||[]).forEach(function(m){
      if(!(MODELS||[]).some(function(x){return x.id===m;}))issues.push(id+': depends on unregistered model "'+m+'"');
    });
  });
  return {widgets:Object.keys(WIDGET_REGISTRY).length,dashboards:Object.keys(BUILTIN_DASHBOARDS).length,
    issues:issues,ok:issues.length===0,
    note:'One widget registry, every widget bound to a renderer that exists and to models that are registered.'};
}

/* ============================================================================
   STEP 12: ONE CHART CATALOGUE, THE VISUALIZATION PIPELINE, AND A STUDIO ON TOP
   Two catalogues of chart TYPES had arrived from two branches: CHART_TYPES (18 types, each saying what it
   encodes, what it needs and how it misleads) and VISUALIZATION_REGISTRY (28 types, each saying its data
   dimensions, renderer and minimum observations). Sixteen in common, neither aware of the other.
   VISUALIZATION_CONTRACTS is different in kind \u2014 contracts for particular uses \u2014 and stays separate.

   The two type catalogues become one object. CHART_TYPES is not a copy of it: it is the same reference, as
   QUANTITY_REGISTRY and TYPES are, so the names cannot disagree.

   The direction's pipeline, and the rule that governs it:
     model output \u2192 presentation model \u2192 visualization spec \u2192 contract validation \u2192 renderer
   A chart type is only RENDERABLE if a renderer for it exists. The catalogue lists thirty-seven types and
   says plainly which can be drawn, rather than implying they all work.
   ============================================================================ */
(function unifyChartCatalogue(){
  /* Fold the semantic fields in; add what either side lacked. */
  Object.keys(CHART_TYPES).forEach(function(k){
    VISUALIZATION_REGISTRY[k]=Object.assign({},VISUALIZATION_REGISTRY[k]||{},CHART_TYPES[k]);
  });
  var ADD={
    area:{encodes:'a quantity accumulating over time, with the area below it meaningful',requires:['a zero baseline'],
      misleads:'when the baseline is not zero, which makes the filled area meaningless'},
    stackedArea:{encodes:'how a total over time divides into parts',requires:['parts that sum to the total'],
      misleads:'for every series but the bottom one, which has a moving baseline',dimensions:['temporal','numeric'],minObservations:2},
    horizontalBar:{encodes:'magnitude across categories with long labels',requires:['a zero baseline'],
      misleads:'when sorted by something other than the value, which hides the ranking',dimensions:['categorical','numeric'],minObservations:1},
    boxPlot:{encodes:'a distribution through its quartiles',requires:['enough observations per group'],
      misleads:'by hiding a bimodal distribution inside one box'},
    density:{encodes:'the shape of a distribution',requires:['a stated bandwidth'],
      misleads:'when the bandwidth is chosen after seeing the result'},
    calendarHeatmap:{encodes:'a daily quantity across weeks',requires:['one value per day'],
      misleads:'when missing days are coloured as zero rather than left blank'},
    bullet:{encodes:'one value against a target and bands',requires:['a real target'],
      misleads:'when the bands are arbitrary'},
    sankey:{encodes:'flow between stages',requires:['flows that are conserved'],
      misleads:'when flows are not conserved, which a sankey cannot show'},
    network:{encodes:'relationships between entities',requires:['meaningful edges'],
      misleads:'by implying the layout position means something'},
    timeline:{encodes:'events in order',requires:['dated events'],misleads:'when the scale is not linear in time'},
    gantt:{encodes:'durations and overlap',requires:['start and end times'],misleads:'when durations are estimated but drawn as known'},
    ridgeline:{encodes:'how a distribution shifts across groups',requires:['a shared axis'],
      misleads:'when overlap hides a distribution behind another'},
    candlestick:{encodes:'open, high, low and close per period',requires:['all four values'],
      misleads:'when applied to anything that is not a range per period'},
    controlChart:{encodes:'a process against its own control limits',requires:['a stable baseline period'],
      misleads:'when the limits are computed from an unstable period'},
    funnel:{encodes:'attrition through ordered stages',requires:['stages that are genuinely sequential'],
      misleads:'when stages are not a subset of the previous stage',dimensions:['categorical','numeric'],minObservations:2},
    parallelCoordinates:{encodes:'many variables per observation',requires:['comparable scales or normalisation'],
      misleads:'because axis order changes every pattern',dimensions:['numeric'],minObservations:5},
    tree:{encodes:'a hierarchy',requires:['a real parent for every node'],misleads:'rarely, when the hierarchy is real',
      dimensions:['hierarchical'],minObservations:1},
    treemap:{encodes:'part of a whole within a hierarchy',requires:['sizes that sum up the hierarchy'],
      misleads:'because area comparison is weak for similar sizes',dimensions:['hierarchical','numeric'],minObservations:1},
    sunburst:{encodes:'a hierarchy as rings',requires:['sizes that sum up the hierarchy'],
      misleads:'because outer rings are exaggerated by their radius',dimensions:['hierarchical','numeric'],minObservations:1}
  };
  Object.keys(ADD).forEach(function(k){
    VISUALIZATION_REGISTRY[k]=Object.assign({},VISUALIZATION_REGISTRY[k]||{},ADD[k]);
  });
  CHART_TYPES=VISUALIZATION_REGISTRY;   // one catalogue, two names during migration, zero copies
})();
/* ---------------- renderers: only what can actually be drawn ----------------
   svgChart draws four series kinds \u2014 line, band, bars and dots. Every renderer here composes those; a type
   with no entry is catalogued and contracted but NOT drawable, and says so. */
function _pts(pm){return (pm.points||[]).map(function(p,i){return {x:i,y:p.value,lo:p.lo,hi:p.hi};});}
var CHART_RENDERERS={
  line:function(pm){return svgChart({height:pm.height||140,aria:pm.title,
    series:[{type:'line',epistemic:pm.cls,pts:_pts(pm)}].concat(pm.showUncertainty&&_pts(pm).some(function(p){return p.lo!=null;})?
      [{type:'band',pts:_pts(pm)}]:[])});},
  area:function(pm){return svgChart({height:pm.height||140,aria:pm.title,
    series:[{type:'band',pts:_pts(pm).map(function(p){return {x:p.x,y:p.y,lo:0,hi:p.y};})},{type:'line',epistemic:pm.cls,pts:_pts(pm)}]});},
  bar:function(pm){return svgChart({height:pm.height||140,aria:pm.title,series:[{type:'bars',epistemic:pm.cls,pts:_pts(pm)}]});},
  scatter:function(pm){return svgChart({height:pm.height||140,aria:pm.title,series:[{type:'dots',epistemic:pm.cls,pts:_pts(pm)}]});},
  band:function(pm){return svgChart({height:pm.height||140,aria:pm.title,
    series:[{type:'band',pts:_pts(pm)},{type:'line',epistemic:pm.cls,pts:_pts(pm)}]});},
  fan:function(pm){return CHART_RENDERERS.band(pm);},
  sparkline:function(pm){return svgChart({height:44,aria:pm.title,series:[{type:'line',epistemic:pm.cls,pts:_pts(pm)}]});},
  histogram:function(pm){
    /* Binning is a presentation transform the catalogue sanctions (bin-for-histogram); the bin width is
       stated in the model rather than chosen after seeing the result. */
    var vals=(pm.points||[]).map(function(p){return p.value;}).filter(function(v){return v!=null&&isFinite(v);});
    if(!vals.length)return '';
    var lo=Math.min.apply(null,vals),hi=Math.max.apply(null,vals),bins=pm.bins||8,w=(hi-lo)/bins||1;
    var counts=new Array(bins).fill(0);
    vals.forEach(function(v){counts[Math.min(bins-1,Math.floor((v-lo)/w))]++;});
    return svgChart({height:pm.height||140,aria:pm.title+' distribution',
      series:[{type:'bars',pts:counts.map(function(c,i){return {x:i,y:c};})}]});},
  controlChart:function(pm){
    var vals=(pm.points||[]).map(function(p){return p.value;}).filter(function(v){return v!=null;});
    var m=vals.length?vals.reduce(function(a,b){return a+b;},0)/vals.length:0;
    var sd2=vals.length>1?Math.sqrt(vals.reduce(function(a,b){return a+(b-m)*(b-m);},0)/(vals.length-1)):0;
    return svgChart({height:pm.height||140,aria:pm.title+' against control limits',
      series:[{type:'band',pts:_pts(pm).map(function(p){return {x:p.x,y:m,lo:m-3*sd2,hi:m+3*sd2};})},
        {type:'line',epistemic:pm.cls,pts:_pts(pm)}]});}
};
function chartRenderable(type){return typeof CHART_RENDERERS[type]==='function';}
function chartCatalogue(){
  var rows=Object.keys(VISUALIZATION_REGISTRY).map(function(k){
    var c=VISUALIZATION_REGISTRY[k];
    return {type:k,encodes:c.encodes||null,misleads:c.misleads||null,requires:c.requires||[],
      dimensions:c.dimensions||[],minObservations:c.minObservations||0,renderable:chartRenderable(k),
      status:chartRenderable(k)?'renderable':'specified'};
  });
  return {types:rows.length,rows:rows,
    renderable:rows.filter(function(r){return r.renderable;}).length,
    specifiedOnly:rows.filter(function(r){return !r.renderable;}).map(function(r){return r.type;}),
    note:'Every catalogued chart type with what it encodes and how it misleads. A type is renderable only if a renderer for it exists; the rest are specified and contracted but cannot yet be drawn, and are listed as such rather than implied to work.'};
}
/* ---------------- the pipeline ---------------- */
function buildVisualization(o){
  o=o||{};
  var stages=[];
  /* 1. model output, through the gateway */
  var r=infer({modelId:o.modelId});
  if(!r||r.status!=='ok')return {status:'failed',stage:'model',stages:stages,
    note:'The model returned no usable output'+(r&&r.status?(' ('+r.status+')'):'')+'.'};
  stages.push('model');
  /* 2. presentation model: select a series, never compute a new analytical quantity */
  var series=o.series?o.series(r.value):_defaultSeries(o.modelId,r.value);
  if(!series||!series.length)return {status:'failed',stage:'presentation',stages:stages,
    note:'The model output has no series to plot.'};
  var pm={title:o.title||o.modelId,cls:r.cls||r.maturity,points:series,
    showUncertainty:o.showUncertainty!==false,height:o.height,bins:o.bins,
    runId:r.runId,modelId:o.modelId,modelVersion:r.modelVersion};
  stages.push('presentation');
  /* 3. spec + 4. validation, against the catalogue */
  var c=VISUALIZATION_REGISTRY[o.chartType];
  if(!c)return {status:'failed',stage:'spec',stages:stages,note:'Unknown chart type "'+o.chartType+'".'};
  stages.push('spec');
  if(c.minObservations&&series.length<c.minObservations)
    return {status:'failed',stage:'validation',stages:stages,
      note:o.chartType+' needs at least '+c.minObservations+' observations; this series has '+series.length+'.'};
  /* A bar needs a zero baseline, and on a series that sits far from zero — body weight, say — that baseline
     draws 255.5 and 256.9 as identical bars. Subtracting the trend to fix it would compute a new analytical
     quantity in the presentation layer, which is not allowed. So bars are refused where the baseline would hide
     the variation, decided from the data rather than the model's name. */
  if(ZERO_BASELINE_TYPES.indexOf(o.chartType)>=0&&_zeroBaselineHides(series))
    return {status:'failed',stage:'validation',stages:stages,
      note:o.chartType+' needs a zero baseline, and these values sit so far from zero that the differences would be invisible — a line or box plot shows them honestly.'};
  if(!chartRenderable(o.chartType))
    return {status:'failed',stage:'renderer',stages:stages.concat(['validation']),
      note:o.chartType+' is catalogued but has no renderer yet, so it cannot be drawn.'};
  stages.push('validation');
  /* 5. render, through the one bridge */
  var html=renderChartSpec(o.chartType,pm);
  stages.push('renderer');
  /* A renderer that refuses the data (a weight trend is not a flow) must fail the pipeline, not return "ok" wrapped
     around a refusal — before every type had a renderer this was hidden by failing earlier, at the renderer stage. */
  if(/chart-refused/.test(html))return {status:'failed',stage:'requirements',stages:stages.concat(['requirements']),
    note:String(html).replace(/<[^>]+>/g,'').trim()};
  return {status:'ok',stages:stages,chartType:o.chartType,presentationModel:pm,html:html,
    runId:r.runId,provenance:r.provenance};
}
function renderChartSpec(type,pm){
  /* The single chart bridge: nothing else calls a CHART_RENDERERS entry directly. */
  if(!chartRenderable(type))return '<div class="hint">'+esc(type)+' cannot be drawn yet.</div>';
  return CHART_RENDERERS[type](pm);
}
/* A series from a model output: the model's own daily points where it has them, otherwise its history. */
function _defaultSeries(modelId,v){
  var map={weight_trend:'weight',weight_avg:'weight',adherence:'adherence',recovery:'readiness'};
  var obsType={weight_trend:'weight',weight_avg:'weight',tdee_personal:'calories',energy_balance:'calories',
    recovery:'fatigue',adherence:'adherence'}[modelId];
  if(v&&Array.isArray(v.series))return v.series.map(function(p){return {date:p.date,value:p.value,lo:p.lo,hi:p.hi};});
  if(obsType){
    var s=[];try{s=seriesWindow(obsType,56);}catch(e){}
    return s.map(function(d){return {date:d.date,value:d.value};});
  }
  return [];
}
/* Chart types that fit a model, derived from its output quantity rather than offered wholesale. */
/* Area fills from zero too — its own catalogue entry says it misleads when the baseline is not zero. */
var ZERO_BASELINE_TYPES=['bar','horizontalBar','groupedBar','stackedBar','area','stackedArea'];
function _zeroBaselineHides(points){
  var v=(points||[]).map(function(p){return p.value;}).filter(function(x){return x!=null&&isFinite(x);});
  if(v.length<2)return false;
  var mn=Math.min.apply(null,v),mx=Math.max.apply(null,v);
  return mn>0&&mn>0.5*mx;          /* the smallest value is more than half the largest: bars would look alike */
}
function chartTypesFor(modelId){
  var c=modelContract(modelId);
  if(!c)return [];
  var temporal=/trend|avg|forecast|baseline|recovery|adherence|energy|tdee/.test(modelId);
  var pts=[];try{var r0=infer({modelId:modelId});pts=r0&&r0.status==='ok'?_defaultSeries(modelId,r0.value):[];}catch(e){}
  var hides=_zeroBaselineHides(pts);
  return Object.keys(VISUALIZATION_REGISTRY).filter(function(k){
    if(!chartRenderable(k))return false;
    if(hides&&ZERO_BASELINE_TYPES.indexOf(k)>=0)return false;
    var d=VISUALIZATION_REGISTRY[k].dimensions||[];
    /* The weekday profile and the weekly box plot are derived from a daily series, so they fit temporal models
       even though their own axes are categorical. */
    return temporal?(d.length===0||d.indexOf('temporal')>=0||['histogram','controlChart','scatter','calendarHeatmap','boxPlot','horizontalBar'].indexOf(k)>=0):true;
  });
}
/* ---------------- saving a chart as a dashboard widget ---------------- */
WIDGET_RENDERERS.chartTile=function(o){
  var w=o.widget;
  var v=buildVisualization({modelId:w.chartModel,chartType:w.chartType,title:w.title,height:110});
  if(v.status!=='ok')return '<div class="w-tile w-empty"><div class="w-t">'+esc(w.title)+'</div>'+
    '<div class="w-s">'+esc(v.note)+'</div></div>';
  return '<div class="w-tile"><div class="w-t">'+esc(w.title)+'</div>'+v.html+'</div>';
};
function saveChartAsWidget(o){
  var v=buildVisualization(o);
  if(v.status!=='ok')return {status:'refused',note:'Only a chart that renders can be saved: '+v.note};
  var id='chart.'+String(o.modelId).replace(/[^a-z0-9]/gi,'')+'.'+o.chartType;
  /* Already a widget: make sure it is also persisted. A widget in the registry but not in settings is lost on reload —
     which is what a second self-test run on a device found. */
  if(WIDGET_REGISTRY[id]){if(!(DB.settings.userWidgets||[]).some(function(x){return x.widgetId===id;}))
      DB.settings.userWidgets=(DB.settings.userWidgets||[]).concat([WIDGET_REGISTRY[id]]);
    return {status:'exists',widgetId:id,note:'That chart is already a widget.'};}
  WIDGET_REGISTRY[id]={widgetId:id,version:'1.0',title:o.title||(o.modelId+' '+o.chartType),kind:'chart',
    renderer:'chartTile',chartModel:o.modelId,chartType:o.chartType,modelDependencies:[o.modelId],
    sizes:['md','lg'],defaultSize:'md',contractId:null,userDefined:true};
  DB.settings.userWidgets=(DB.settings.userWidgets||[]).filter(function(x){return x.widgetId!==id;})
    .concat([WIDGET_REGISTRY[id]]);
  return {status:'ok',widgetId:id};
}
/* User widgets persist in settings and are restored into the one registry on load. */
function restoreUserWidgets(){
  (DB.settings&&DB.settings.userWidgets||[]).forEach(function(w){
    if(!WIDGET_REGISTRY[w.widgetId])WIDGET_REGISTRY[w.widgetId]=w;});
}

/* ============================================================================
   STEP 18: ADVANCED RENDERING
   Three of the catalogued-but-undrawable chart types, chosen because they fit data the app actually holds, each
   written against the failure mode its own catalogue entry declares:
     calendarHeatmap \u2014 "misleads when missing days are coloured as zero": an unlogged day is an empty cell
     boxPlot         \u2014 "hides a bimodal distribution" and needs enough per group: a week with fewer than five
                       readings is not drawn, and the gap is labelled
     horizontalBar   \u2014 "misleads when sorted by something other than the value": always sorted by value
   Native SVG styled by class, so the export path inlines their colours like any other chart.
   ============================================================================ */
function _dated(pm){return (pm.points||[]).filter(function(p){return p.date&&p.value!=null&&isFinite(p.value);});}
CHART_RENDERERS.calendarHeatmap=function(pm){
  var pts=_dated(pm);if(!pts.length)return '';
  var by={};pts.forEach(function(p){by[p.date]=p.value;});
  var vals=pts.map(function(p){return p.value;}),lo=Math.min.apply(null,vals),hi=Math.max.apply(null,vals);
  var last=pts[pts.length-1].date,first=pts[0].date;
  var dow=function(d){return (new Date(d+'T12:00:00Z').getUTCDay()+6)%7;};   // Monday = 0
  var start=addDays(first,-dow(first)),weeks=Math.ceil((daysBetween(start,last)+1)/7);
  var cell=14,gap=3,W=weeks*(cell+gap)+30,H=7*(cell+gap)+18,out='';
  for(var w=0;w<weeks;w++)for(var d=0;d<7;d++){
    var date=addDays(start,w*7+d);if(date>last||date<first)continue;   /* before the record began is not "not logged" */
    var x=30+w*(cell+gap),y=4+d*(cell+gap),v=by[date];
    if(v==null){out+='<rect class="hm-gap" x="'+x+'" y="'+y+'" width="'+cell+'" height="'+cell+'" rx="2"><title>'+date+': not logged</title></rect>';continue;}
    var t=hi>lo?(v-lo)/(hi-lo):0.5;
    out+='<rect class="hm-cell" x="'+x+'" y="'+y+'" width="'+cell+'" height="'+cell+'" rx="2" style="fill-opacity:'+(0.15+0.85*t).toFixed(2)+'"><title>'+date+': '+round(v,1)+'</title></rect>';
  }
  ['M','','W','','F','','S'].forEach(function(l,i){if(l)out+='<text class="hm-lab" x="4" y="'+(4+i*(cell+gap)+cell-3)+'">'+l+'</text>';});
  return '<svg class="chart-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(pm.title||'daily values')+' by day; empty cells were not logged">'+out+'</svg>';
};
CHART_RENDERERS.boxPlot=function(pm){
  var pts=_dated(pm);if(!pts.length)return '';
  var weeks={};pts.forEach(function(p){var d=(new Date(p.date+'T12:00:00Z').getUTCDay()+6)%7;var k=addDays(p.date,-d);(weeks[k]=weeks[k]||[]).push(p.value);});
  var keys=Object.keys(weeks).sort(),all=pts.map(function(p){return p.value;});
  var lo=Math.min.apply(null,all),hi=Math.max.apply(null,all);if(hi===lo){hi+=1;lo-=1;}
  var W=Math.max(200,keys.length*46+40),H=150,pad=18,Y=function(v){return pad+(1-(v-lo)/(hi-lo))*(H-2*pad);};
  var q=function(a,f){var s=a.slice().sort(function(x,y){return x-y;}),i=(s.length-1)*f,b=Math.floor(i);return s[b]+(s[Math.min(s.length-1,b+1)]-s[b])*(i-b);};
  var out='';
  keys.forEach(function(k,i){
    var a=weeks[k],x=40+i*46;
    if(a.length<5){out+='<text class="bp-thin" x="'+(x+10)+'" y="'+(H/2)+'" text-anchor="middle">n='+a.length+'</text>';return;}
    var q1=q(a,0.25),md=q(a,0.5),q3=q(a,0.75),mn=Math.min.apply(null,a),mx=Math.max.apply(null,a);
    out+='<line class="bp-whisker" x1="'+(x+10)+'" x2="'+(x+10)+'" y1="'+Y(mx).toFixed(1)+'" y2="'+Y(mn).toFixed(1)+'"/>'+
      '<rect class="bp-box" x="'+x+'" y="'+Y(q3).toFixed(1)+'" width="20" height="'+Math.max(1,Y(q1)-Y(q3)).toFixed(1)+'"><title>week of '+k+': median '+round(md,1)+', n='+a.length+'</title></rect>'+
      '<line class="bp-median" x1="'+x+'" x2="'+(x+20)+'" y1="'+Y(md).toFixed(1)+'" y2="'+Y(md).toFixed(1)+'"/>';
  });
  out+='<text class="hm-lab" x="4" y="'+(pad+4)+'">'+round(hi,1)+'</text><text class="hm-lab" x="4" y="'+(H-pad)+'">'+round(lo,1)+'</text>';
  return '<svg class="chart-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(pm.title||'values')+' by week; weeks with fewer than five readings are not drawn">'+out+'</svg>';
};
CHART_RENDERERS.horizontalBar=function(pm){
  var pts=_dated(pm);if(!pts.length)return '';
  var names=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],g={};
  pts.forEach(function(p){var d=(new Date(p.date+'T12:00:00Z').getUTCDay()+6)%7;(g[d]=g[d]||[]).push(p.value);});
  var rows=Object.keys(g).map(function(d){return {label:names[d],v:mean(g[d]),n:g[d].length};})
    .sort(function(a,b){return b.v-a.v;});           /* sorted by the value, as the catalogue requires */
  var mx=Math.max.apply(null,rows.map(function(r){return Math.abs(r.v);}))||1,W=320,bh=16,H=rows.length*(bh+6)+6,out='';
  rows.forEach(function(r,i){var y=4+i*(bh+6),w=Math.max(1,(W-110)*Math.abs(r.v)/mx);
    out+='<text class="hm-lab" x="4" y="'+(y+12)+'">'+r.label+'</text><rect class="hb-bar" x="40" y="'+y+'" width="'+w.toFixed(1)+'" height="'+bh+'" rx="3"><title>'+r.label+': '+round(r.v,1)+' (n='+r.n+')</title></rect>'+
      '<text class="hm-lab" x="'+(44+w).toFixed(1)+'" y="'+(y+12)+'">'+round(r.v,1)+'</text>';});
  return '<svg class="chart-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="average '+esc(pm.title||'value')+' by weekday, highest first">'+out+'</svg>';
};

/* ---- THREE RENDERERS THE SURFACED CAPABILITIES NEED (H4) ----
   Of 37 catalogued chart types, 25 had no renderer. Nothing chose them, but the catalogue did not say they were only
   planned. These three are drawn because a surfaced capability needs them: the execution calendar (heatmap), the plan's
   history (timeline) and the week's calories by macro (stackedBar). States are told apart by shape as well as shade,
   and every mark has a text title. */
CHART_RENDERERS.heatmap=function(pm){
  var rows=pm.rows||[],cols=pm.cols||[],cells=pm.cells||[];if(!rows.length||!cols.length)return '';
  var cw=Math.max(8,Math.min(16,Math.floor(300/cols.length))),gap=2,lw=64,W=lw+cols.length*(cw+gap),H=rows.length*(cw+gap)+16,out='';
  rows.forEach(function(r,ri){out+='<text class="hm-lab" x="0" y="'+(ri*(cw+gap)+cw-2)+'">'+esc(r)+'</text>';
    cols.forEach(function(c,ci){var v=(cells[ri]||[])[ci];if(!v||!v.state)return;var x=lw+ci*(cw+gap),y=ri*(cw+gap),t='<title>'+esc(c+' \u00b7 '+r+': '+(v.text||v.state))+'</title>';
      if(v.state==='done')out+='<rect class="hx-done" x="'+x+'" y="'+y+'" width="'+cw+'" height="'+cw+'" rx="2">'+t+'</rect>';
      else if(v.state==='partial')out+='<rect class="hx-part" x="'+x+'" y="'+y+'" width="'+cw+'" height="'+cw+'" rx="2">'+t+'</rect><rect class="hx-done" x="'+x+'" y="'+(y+cw/2)+'" width="'+cw+'" height="'+(cw/2)+'" rx="1"/>';
      else if(v.state==='skipped')out+='<rect class="hx-out" x="'+(x+0.5)+'" y="'+(y+0.5)+'" width="'+(cw-1)+'" height="'+(cw-1)+'" rx="2">'+t+'</rect><path class="hx-x" d="M'+(x+3)+' '+(y+3)+'L'+(x+cw-3)+' '+(y+cw-3)+'M'+(x+cw-3)+' '+(y+3)+'L'+(x+3)+' '+(y+cw-3)+'"/>';
      else if(v.state==='unknown')out+='<rect class="hx-unk" x="'+(x+0.5)+'" y="'+(y+0.5)+'" width="'+(cw-1)+'" height="'+(cw-1)+'" rx="2">'+t+'</rect>';
      else if(v.state==='upcoming')out+='<rect class="hx-up" x="'+(x+0.5)+'" y="'+(y+0.5)+'" width="'+(cw-1)+'" height="'+(cw-1)+'" rx="2">'+t+'</rect>';});});
  /* The last mark is anchored at its end: anchored at its start, "today" ran past the edge and read "to". */
  (pm.colMarks||[]).forEach(function(m){var last=m.i>=cols.length-1;out+='<text class="hm-lab" x="'+(lw+m.i*(cw+gap)+(last?cw:0))+'" y="'+(H-2)+'"'+(last?' text-anchor="end"':'')+'>'+esc(m.label)+'</text>';});
  return '<svg class="chart-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(pm.title||'calendar')+'">'+out+'</svg>'+
    '<div class="hx-key"><span><i class="k-done"></i>done</span><span><i class="k-part"></i>partly</span><span><i class="k-skip">\u00d7</i>skipped</span><span><i class="k-unk"></i>not recorded</span></div>';
};
CHART_RENDERERS.timeline=function(pm){
  var ev=(pm.events||[]).filter(function(e){return isValidISO(e.date);}).sort(function(a,b){return a.date<b.date?-1:1;});if(!ev.length)return '';
  var lanes=pm.lanes||ev.map(function(e){return e.lane||'events';}).filter(function(v,i,a){return a.indexOf(v)===i;});
  var d0=ev[0].date,d1=pm.to||ev[ev.length-1].date,span=Math.max(1,daysBetween(d0,d1)),lw=70,W=340,lh=34,H=lanes.length*lh+18,out='';
  var X=function(d){return lw+(W-lw-8)*daysBetween(d0,d)/span;};
  lanes.forEach(function(l,li){var y=li*lh+14;out+='<text class="hm-lab" x="0" y="'+(y+4)+'">'+esc(l)+'</text><line class="tl-axis" x1="'+lw+'" x2="'+(W-8)+'" y1="'+y+'" y2="'+y+'"/>';
    var lastX=-99,alt=0;ev.filter(function(e){return (e.lane||'events')===l;}).forEach(function(e){var x=X(e.date);alt=(x-lastX<46)?1-alt:0;lastX=x;
      out+='<circle class="tl-dot" cx="'+x.toFixed(1)+'" cy="'+y+'" r="4"><title>'+esc(shortDate(e.date)+': '+e.label)+'</title></circle>'+
        '<text class="tl-lab" x="'+x.toFixed(1)+'" y="'+(y+(alt?-8:14))+'" text-anchor="middle">'+esc(e.short||'')+'</text>';});});
  out+='<text class="hm-lab" x="'+lw+'" y="'+(H-1)+'">'+esc(shortDate(d0))+'</text><text class="hm-lab" x="'+(W-8)+'" y="'+(H-1)+'" text-anchor="end">'+esc(shortDate(d1))+'</text>';
  return '<svg class="chart-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(pm.title||'timeline')+'">'+out+'</svg>';
};
CHART_RENDERERS.stackedBar=function(pm){
  var cats=pm.categories||[],S=pm.series||[];if(!cats.length||!S.length)return '';
  var tot=cats.map(function(c,i){return S.reduce(function(a,s){return a+(s.values[i]||0);},0);}),mx=Math.max.apply(null,tot.concat([pm.target||0,1]));
  var W=320,H=150,pad=28,bw=Math.min(28,(W-pad)/cats.length-6),out='';
  cats.forEach(function(c,i){var x=pad+i*((W-pad)/cats.length)+3,y=H-18;
    S.forEach(function(s,si){var v=s.values[i]||0,h=(H-30)*v/mx;y-=h;if(v>0)out+='<rect class="sb-s'+si+'" x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+h.toFixed(1)+'"><title>'+esc(c+' \u00b7 '+s.name+': '+fmtNum(v,0)+(pm.unit?' '+pm.unit:''))+'</title></rect>';});
    if(!tot[i])out+='<text class="hm-lab" x="'+(x+bw/2)+'" y="'+(H-22)+'" text-anchor="middle">\u2013</text>';
    out+='<text class="hm-lab" x="'+(x+bw/2)+'" y="'+(H-4)+'" text-anchor="middle">'+esc(c)+'</text>';});
  /* The label sits above its line, with its value; beside it, it collided with the line's start. */
  if(pm.target){var ty=H-18-(H-30)*pm.target/mx;out+='<line class="sb-target" x1="'+pad+'" x2="'+W+'" y1="'+ty.toFixed(1)+'" y2="'+ty.toFixed(1)+'"/><text class="hm-lab" x="'+W+'" y="'+(ty-3).toFixed(1)+'" text-anchor="end">'+esc((pm.targetLabel||'target')+' '+fmtNum(pm.target,0))+'</text>';}
  return '<svg class="chart-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(pm.title||'stacked bars')+'">'+out+'</svg>'+
    '<div class="hx-key">'+S.map(function(s,si){return '<span><i class="k-sb'+si+'"></i>'+esc(s.name)+'</span>';}).join('')+'</div>';
};
/* Available or planned, from whether a renderer exists \u2014 the catalogue says which. */
function chartTypeStatus(k){return chartRenderable(k)?'available':'planned';}
function chartCatalogueSummary(){var ks=Object.keys(CHART_TYPES);var av=ks.filter(chartRenderable);return {total:ks.length,available:av.length,planned:ks.filter(function(k){return !chartRenderable(k);})};}

/* moved from 65-import.js: an engine function that lived in an interface file */
function visualizationSVG(opts){
  var v=buildVisualization(opts||{});
  if(v.status!=='ok')return {status:'refused',stage:v.stage,note:v.note};
  if(typeof document==='undefined')return {status:'ok',svg:v.html,inlined:false};
  var host=document.createElement('div');host.style.cssText='position:absolute;left:-10000px;top:0;width:640px';
  host.innerHTML=v.html;document.body.appendChild(host);
  var svg=host.querySelector('svg');
  if(!svg){document.body.removeChild(host);return {status:'refused',stage:'renderer',note:'no SVG produced'};}
  [svg].concat([].slice.call(svg.querySelectorAll('*'))).forEach(function(el){
    var cs=getComputedStyle(el),st=[];
    _SVG_INLINE.forEach(function(p){var val=cs.getPropertyValue(p);if(val&&val!=='normal'&&val!=='auto')st.push(p+':'+val);});
    if(st.length)el.setAttribute('style',st.join(';')+';'+(el.getAttribute('style')||''));
  });
  svg.setAttribute('xmlns','http://www.w3.org/2000/svg');
  var vb=(svg.getAttribute('viewBox')||'0 0 640 160').split(/\s+/);
  svg.setAttribute('width',vb[2]);svg.setAttribute('height',vb[3]);
  var bg=getComputedStyle(document.body).backgroundColor;
  var out=new XMLSerializer().serializeToString(svg).replace('>','><rect width="100%" height="100%" fill="'+bg+'"/>');
  document.body.removeChild(host);
  return {status:'ok',svg:out,inlined:true,runId:v.runId,
    note:'Colours and strokes are written into the file, so it looks the same outside the app.'};
}

/* moved from 65-import.js: an engine function that lived in an interface file */
function visualizationPNG(opts){
  var s=visualizationSVG(opts);
  if(s.status!=='ok')return Promise.resolve(s);
  if(typeof Image==='undefined'||typeof document==='undefined'||!document.createElement('canvas').getContext)
    return Promise.resolve({status:'unsupported',note:'PNG needs a canvas, which this environment does not have. The SVG export works everywhere.'});
  return new Promise(function(resolve){
    var img=new Image(),scale=2;
    img.onload=function(){try{
      var c=document.createElement('canvas');c.width=img.width*scale;c.height=img.height*scale;
      var g=c.getContext('2d');if(!g){resolve({status:'unsupported',note:'no 2D canvas'});return;}
      g.scale(scale,scale);g.drawImage(img,0,0);resolve({status:'ok',png:c.toDataURL('image/png'),width:c.width,height:c.height});
    }catch(e){resolve({status:'failed',note:String(e&&e.message||e)});}};
    img.onerror=function(){resolve({status:'failed',note:'the SVG could not be rasterised'});};
    img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(s.svg);
  });
}
var _SVG_INLINE=['fill','fill-opacity','stroke','stroke-width','stroke-opacity','stroke-dasharray','opacity','font-size','font-family','font-weight','text-anchor'];
/* dashboards and saved chart presets as record formats (export and import) */
registerExportAdapter('dashboard',{version:1,formats:['json'],
    object:function(o){return currentDashboard();},
    validate:function(d){var v=validateDashboardSpec(d);return v.ok?[]:v.errors;},
    /* Imported under its own id so it can never silently replace a dashboard already here. */
    apply:function(d){var c=JSON.parse(JSON.stringify(d));c.id='imported-'+String(d.id||'dashboard').replace(/[^a-z0-9-]/gi,'-').slice(0,24);
      c.builtin=false;var r=commitDashboard(c);return {status:r.status,id:r.id};}});
registerExportAdapter('visualizationPreset',{version:1,formats:['json'],
    object:function(){return Object.keys(WIDGET_REGISTRY).filter(function(k){return WIDGET_REGISTRY[k].userDefined;})
      .map(function(k){var w=WIDGET_REGISTRY[k];return {modelId:w.chartModel,chartType:w.chartType,title:w.title};});},
    validate:function(d){var e=[];if(!Array.isArray(d))return ['presets must be a list'];
      d.forEach(function(p,i){if(!modelContract(p.modelId))e.push('preset '+i+': unknown model "'+p.modelId+'"');
        else if(!chartRenderable(p.chartType))e.push('preset '+i+': "'+p.chartType+'" cannot be drawn');});return e;},
    apply:function(d){var out=d.map(function(p){return saveChartAsWidget(p).status;});return {status:'ok',results:out};}});
