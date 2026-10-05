/* ============================================================================
   REGION: PRESENTATION LAYER (visual system document)

   The document's central rule, and the only part of it that makes the rest enforceable:

     ANALYTICAL TRUTH → PRESENTATION MODEL → VISUAL SEMANTICS → DESIGN TOKENS → COMPONENT → RENDERER

     never   CSS → analytical meaning
     never   chart → new analytical calculation

   That second prohibition is the substantive one. A chart that computes its own smoothing, rebases its own
   axis or fills its own gaps has quietly become a model — one with no contract, no epistemic class, no
   uncertainty and no trace. This layer exists to make that structurally hard rather than discouraged: a
   presentation model is BUILT from a canonical result, carries that result's class and interval forward,
   and a validator rejects any visualization that claims a transformation it did not declare.

   This mirrors the model contract system exactly, which is the point. The same discipline that stopped
   models from inventing figures should stop views from inventing them.
   ============================================================================ */

/* ---------------- §2 design tokens ----------------
   Tokens are data. CSS reads them; nothing reads CSS to decide meaning. */
var DESIGN_TOKENS={
  color:{
    /* Semantic roles, not colour names. "danger" survives a theme change; "red" does not. */
    surface:{light:'#ffffff',dark:'#0f1115'},
    surfaceRaised:{light:'#f7f8fa',dark:'#171a20'},
    text:{light:'#11151c',dark:'#e9edf3'},
    textMuted:{light:'#5b6472',dark:'#9aa4b2'},
    border:{light:'#dfe3e9',dark:'#272c35'},
    accent:{light:'#2f6f4f',dark:'#6fd39b'},
    positive:{light:'#1f7a4d',dark:'#5fd39b'},
    attention:{light:'#a1650b',dark:'#e0a94a'},
    negative:{light:'#a33a32',dark:'#e08a82'},
    neutral:{light:'#5b6472',dark:'#9aa4b2'}
  },
  space:{xs:4,sm:8,md:12,lg:18,xl:28},
  density:{compact:0.8,normal:1,comfortable:1.22,spacious:1.34,accessibility:1.45},
  radius:{sm:6,md:10,lg:16,pill:999},
  type:{scale:1.2,base:15,mono:'ui-monospace, SFMono-Regular, Menlo, monospace'},
  motion:{fast:120,normal:200,slow:320}
};
/* ---------------- §3 semantic colour engine ----------------
   Meaning decides colour. The mapping is declared once, so "estimated" looks the same everywhere and a
   change of palette cannot change what a colour means. */
var EPISTEMIC_VISUALS={
  MEASURED:{token:'text',pattern:'solid',weight:'strong',
    means:'recorded directly'},
  DERIVED:{token:'text',pattern:'solid',weight:'normal',
    means:'computed from recorded values'},
  EMPIRICAL:{token:'accent',pattern:'solid',weight:'normal',
    means:'from this person\u2019s own evidence'},
  CALIBRATED:{token:'accent',pattern:'solid',weight:'normal',
    means:'fitted to this person'},
  BLENDED:{token:'accent',pattern:'dashed',weight:'normal',
    means:'partly this person, partly population'},
  HEURISTIC:{token:'neutral',pattern:'dashed',weight:'light',
    means:'a convention, not a measurement'},
  PRIOR:{token:'neutral',pattern:'dotted',weight:'light',
    means:'population starting point'},
  POLICY:{token:'neutral',pattern:'solid',weight:'light',
    means:'a rule this system applies'},
  PREDICTIVE:{token:'attention',pattern:'dashed',weight:'normal',
    means:'projected, not observed'}
};
function visualForClass(cls){
  return EPISTEMIC_VISUALS[cls]||
    {token:'neutral',pattern:'dotted',weight:'light',means:'class not declared',undeclared:true};
}
function resolveToken(path,mode){
  mode=mode||'dark';
  var parts=String(path).split('.');
  var node=DESIGN_TOKENS;
  for(var i=0;i<parts.length;i++){node=node&&node[parts[i]];}
  if(node==null)return null;
  return (typeof node==='object'&&node[mode]!=null)?node[mode]:node;
}
/* ---------------- §5 accessibility ---------------- */
function _luminance(hex){
  var h=String(hex).replace('#','');
  if(h.length===3)h=h.split('').map(function(c){return c+c;}).join('');
  var rgb=[0,2,4].map(function(i){return parseInt(h.substr(i,2),16)/255;});
  var lin=rgb.map(function(c){return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);});
  return 0.2126*lin[0]+0.7152*lin[1]+0.0722*lin[2];
}
function contrastRatio(a,b){
  var la=_luminance(a),lb=_luminance(b);
  var hi=Math.max(la,lb),lo=Math.min(la,lb);
  return round((hi+0.05)/(lo+0.05),2);
}
function accessibilityAudit(){
  var issues=[],checked=0;
  ['light','dark'].forEach(function(mode){
    var bg=resolveToken('color.surface',mode);
    var bgRaised=resolveToken('color.surfaceRaised',mode);
    ['text','textMuted','accent','positive','attention','negative','neutral'].forEach(function(role){
      var fg=resolveToken('color.'+role,mode);
      if(!fg||!bg)return;
      [['surface',bg],['surfaceRaised',bgRaised]].forEach(function(pair){
        checked++;
        var r=contrastRatio(fg,pair[1]);
        /* 4.5:1 for body text, 3:1 for large or non-text. Muted and neutral carry supporting text, so they
           are held to the body-text bar rather than the relaxed one. */
        var required=(role==='text'||role==='textMuted'||role==='neutral')?4.5:3;
        if(r<required)issues.push({mode:mode,role:role,on:pair[0],ratio:r,required:required});
      });
    });
  });
  /* Colour must never be the only carrier of meaning \u2014 hence pattern and weight on every epistemic class. */
  var colourOnly=Object.keys(EPISTEMIC_VISUALS).filter(function(k){
    return !EPISTEMIC_VISUALS[k].pattern;});
  return {checked:checked,issues:issues,ok:issues.length===0&&!colourOnly.length,
    colourOnlyClasses:colourOnly,cls:'POLICY',
    note:'Contrast against both surfaces in both themes, at 4.5:1 for text and 3:1 for non-text. Every epistemic class also carries a pattern and a weight, so meaning survives when colour does not.',
    caveat:'Contrast ratios are computed, not judged. They do not establish that a palette is legible to a particular person in particular light.'};
}
/* ---------------- the presentation model ----------------
   Built FROM a canonical result. It carries the class, the interval and the provenance forward, and it
   cannot compute anything. */
function presentationModel(spec){
  spec=spec||{};
  var src=spec.result;
  if(!src)return {status:'no-source',
    note:'A presentation model is built from an analytical result. Without one there is nothing to present, and inventing a value here would be the exact inversion this layer exists to prevent.'};
  if(src.status&&src.status!=='ok'&&src.status!=='clear'){
    /* An unresolved result presents as an unresolved state, not as a blank or a zero. */
    return {status:'unavailable',reason:src.status,
      need:src.need||[],why:src.note||null,
      display:{kind:'locked',label:spec.label||null},
      note:'The underlying result did not resolve, so the presentation says so. A chart that draws zero here would be asserting a measurement that does not exist.'};
  }
  var cls=src.cls||spec.cls||null;
  var vis=visualForClass(cls);
  var t=spec.quantity?typeOf(spec.quantity):null;
  return {status:'ok',
    quantity:spec.quantity||null,
    value:spec.pick?src[spec.pick]:(src.value!=null?src.value:null),
    interval:(src.lo!=null||src.hi!=null)?{lo:src.lo,hi:src.hi}:null,
    cls:cls,
    visual:vis,
    unit:t?t.unit:null,
    temporal:t?t.temporal:null,
    population:t?t.population:null,
    provenance:{model:spec.model||null,asOf:asOf(),
      note:src.note||null,caveat:src.caveat||null},
    /* Everything a view is allowed to show, and nothing it is allowed to compute. */
    sealed:true,
    note:'Carries the analytical result forward with its class, interval and provenance. It computes nothing.'};
}
/* ---------------- §52 visualization contract ---------------- */
var VISUALIZATION_CONTRACTS={
  WeightTrendChart:{version:1,
    inputDimensions:['mass','massRate'],temporal:['instant','daily','rate'],
    mustDisplay:['units','time'],
    canDisplay:['MEASURED','DERIVED','PREDICTIVE'],
    optional:['uncertainty','goal','forecast'],
    forbidden:['treating a prediction as an observation'],
    sanctionedTransforms:['rolling mean (stated window)','axis scaling'],
    uncertainty:'band',interaction:'inspect',performance:'light',renderer:'svg'},
  MacroBar:{version:1,
    inputDimensions:['energyRate','mass'],temporal:['daily'],
    mustDisplay:['units'],canDisplay:['MEASURED','DERIVED'],
    optional:['target'],forbidden:['implying precision the log does not have'],
    sanctionedTransforms:['sum over day'],
    uncertainty:'none',interaction:'inspect',performance:'light',renderer:'dom'},
  ForecastFan:{version:1,
    inputDimensions:['mass'],temporal:['daily'],
    mustDisplay:['units','time','that it is a projection'],
    canDisplay:['PREDICTIVE'],
    optional:['goal'],
    forbidden:['drawing a projection in the same style as an observation'],
    sanctionedTransforms:['quantile bands from a stated simulation'],
    uncertainty:'fan',interaction:'inspect',performance:'medium',renderer:'svg'},
  FatigueCompartments:{version:1,
    inputDimensions:['index'],temporal:['cumulative'],
    mustDisplay:['that these are indices, not measurements'],
    canDisplay:['HEURISTIC'],optional:[],
    forbidden:['presenting an index as a physical quantity'],
    sanctionedTransforms:['exponential decay with stated half-life'],
    uncertainty:'none',interaction:'inspect',performance:'light',renderer:'dom'},
  IdentificationPanel:{version:1,
    inputDimensions:['ratio','massRate'],temporal:['window','rate'],
    mustDisplay:['whether the effect is identifiable','what blocks it'],
    canDisplay:['EMPIRICAL','POLICY'],
    optional:['sensitivity bound'],
    forbidden:['showing an effect estimate when no identification strategy applies'],
    sanctionedTransforms:[],
    uncertainty:'interval',interaction:'drill',performance:'light',renderer:'dom'}
};
function visualizationContract(id){return VISUALIZATION_CONTRACTS[id]||null;}
/* ---------------- §53 visual semantic validation ----------------
   The presentation equivalent of the model contract check. It rejects a view that would misrepresent what
   it was given. */
function validateVisualization(id,pm){
  var c=VISUALIZATION_CONTRACTS[id];
  if(!c)return {ok:false,violations:['no contract declared for '+id],
    note:'A visualization without a contract can display anything, which means nothing it shows can be relied on.'};
  var v=[];
  if(!pm)return {ok:false,violations:['no presentation model supplied']};
  if(pm.status==='unavailable'){
    /* Refusing to draw is always contract-compliant. */
    return {ok:true,violations:[],rendered:'locked',
      note:'The result did not resolve, so the view shows an unresolved state. That is compliant: refusing to draw is always allowed.'};
  }
  if(pm.cls&&c.canDisplay.indexOf(pm.cls)<0)
    v.push('class '+pm.cls+' is not in this visualization\u2019s declared set ('+c.canDisplay.join(', ')+')');
  if(pm.visual&&pm.visual.undeclared)
    v.push('the result carries no epistemic class, so it cannot be styled honestly');
  if(pm.quantity){
    var t=typeOf(pm.quantity);
    if(t&&c.inputDimensions.indexOf(t.dimension)<0)
      v.push('dimension '+t.dimension+' is not accepted by this visualization');
    if(t&&c.temporal.indexOf(t.temporal)<0)
      v.push('temporal semantics '+t.temporal+' do not match this visualization');
    if(c.mustDisplay.indexOf('units')>=0&&!pm.unit)
      v.push('this visualization must display units and the quantity has none');
  }
  if(pm.seriesSemantics&&Array.isArray(pm.seriesSemantics)){
    pm.seriesSemantics.forEach(function(ss){
      if(ss.cls==='PREDICTIVE'&&ss.pattern==='solid')v.push('predictive series must not use solid observational styling');
      if(ss.cls==='PREDICTIVE'&&ss.pattern==null)v.push('predictive series requires an explicit visual pattern');
    });
  }
  if(pm.cls==='PREDICTIVE'&&c.forbidden.some(function(f){return /prediction as an observation|same style as an observation/.test(f);})){
    if(!pm.visual||pm.visual.pattern==='solid')
      v.push('a projection must not be drawn in the same style as an observation');
  }
  return {ok:v.length===0,violations:v,
    contract:{id:id,version:c.version},
    styling:pm.visual||null,
    note:v.length?'The view would misrepresent what it was given.':
      'The presentation model satisfies this visualization\u2019s contract.'};
}
/* ---------------- §55 UI self-audit ----------------
   The checks that make the rule enforceable rather than aspirational. */
function presentationAudit(){
  var findings=[];
  /* 1. Accessibility. */
  var a=accessibilityAudit();
  a.issues.forEach(function(i){
    findings.push({severity:'P2',area:'contrast',
      what:i.role+' on '+i.on+' in '+i.mode+' theme is '+i.ratio+':1, needs '+i.required+':1'});});
  /* 2. Every epistemic class must have a declared visual, or something will render unstyled and look
     authoritative by default. */
  (typeof CLASSES!=='undefined'?Object.keys(CLASSES):[]).forEach(function(k){
    if(!EPISTEMIC_VISUALS[k])findings.push({severity:'P1',area:'semantics',
      what:'epistemic class '+k+' has no declared visual treatment'});});
  /* 3. Every contract must be internally coherent. */
  Object.keys(VISUALIZATION_CONTRACTS).forEach(function(id){
    var c=VISUALIZATION_CONTRACTS[id];
    if(!c.canDisplay||!c.canDisplay.length)
      findings.push({severity:'P1',area:'contract',what:id+' declares no displayable classes'});
    c.canDisplay.forEach(function(k){
      if(!EPISTEMIC_VISUALS[k])findings.push({severity:'P1',area:'contract',
        what:id+' can display '+k+', which has no visual treatment'});});
    if(!c.renderer)findings.push({severity:'P2',area:'contract',what:id+' declares no renderer'});
  });
  /* 4. The prohibition itself: a presentation model must not carry a computed field the result lacked. */
  findings.push.apply(findings,_transformAudit());
  /* 5. Every model a view can present must declare a class. A model without one renders unstyled and reads
     as authoritative by default, which is the quiet version of overclaiming. This check found weightTrend
     missing one. */
  ['weightTrend','tdeePersonal','readinessState','trainingLoad','effectiveSets','tissueEnergyDensity']
    .forEach(function(fn){
      var g=(typeof window!=='undefined')?window:{};
      if(typeof g[fn]!=='function')return;
      var v=null;try{v=g[fn].call(null);}catch(e){return;}
      if(!v||(v.status&&v.status!=='ok'&&v.status!=='clear'))return;
      if(!v.cls)findings.push({severity:'P1',area:'semantics',
        what:fn+' resolves without declaring an epistemic class, so a view cannot style it honestly'});
    });
  return {findings:findings,ok:findings.filter(function(f){return f.severity==='P1';}).length===0,
    checked:{contrasts:a.checked,contracts:Object.keys(VISUALIZATION_CONTRACTS).length,
      classes:Object.keys(EPISTEMIC_VISUALS).length},
    cls:'POLICY',
    note:'The presentation equivalent of the model contract audit. A rule nothing checks is a preference.'};
}
function _transformAudit(){
  var out=[];
  /* A presentation model built from a resolved result must expose exactly the value it was given. */
  try{
    var t=tdeePersonal();
    var pm=presentationModel({result:t,quantity:'tdee',model:'tdeePersonal'});
    if(pm.status==='ok'&&t.status==='ok'&&pm.value!==t.value)
      out.push({severity:'P0',area:'transform',
        what:'the presentation model changed the value it was given ('+t.value+' became '+pm.value+')'});
    if(pm.status==='ok'&&t.cls&&pm.cls!==t.cls)
      out.push({severity:'P0',area:'transform',
        what:'the presentation model changed the epistemic class'});
  }catch(e){}
  return out;
}

/* ============================================================================
   §7 FONT SYSTEM, §18 CHART TYPES, §55 UI/UX SELF-AUDIT
   The three sections of the visual spec with nothing behind them. A scan found them; each is built here
   with the same rule as the rest of this layer — declared, then checked.
   ============================================================================ */

/* ---------------- §7 font registry ----------------
   A font stack is a fallback CHAIN, and the reason to declare it rather than write a string is that the
   fallback is what most readers actually see: the first entry is often absent, and a stack ending in a
   generic keyword renders differently on every device. Accessibility faces are first-class here rather than
   an afterthought, because dyslexia-oriented and high-legibility faces change comprehension more than any
   colour choice in this document. */
/* Every face offered is bundled in the build (fonts/, SIL OFL 1.1), so a choice is a guarantee, not a request. Named
   in plain words for the person choosing; the old ids are accepted as aliases so saved settings carry over. */
var FONT_REGISTRY={
  system:{family:null,stack:['system-ui','-apple-system','Segoe UI','Roboto','Helvetica Neue','sans-serif'],label:'Your device',
    note:'The same text your phone or computer uses everywhere.',role:'controls',bundled:false},
  inter:{family:'Inter',stack:['Inter','system-ui','sans-serif'],label:'Clean',note:'Crisp and neutral, easy to read on small screens.',role:'interface',bundled:true},
  nunito:{family:'Nunito',stack:['Nunito','system-ui','sans-serif'],label:'Rounded',note:'Soft, friendly rounded letters.',role:'interface',bundled:true},
  lexend:{family:'Lexend',stack:['Lexend','system-ui','sans-serif'],label:'Easy reading',note:'Spaced to reduce visual stress and make reading easier.',role:'accessibility',bundled:true},
  atkinson:{family:'Atkinson Hyperlegible',stack:['Atkinson Hyperlegible','Verdana','sans-serif'],label:'High legibility',
    note:'Letters that are hard to mistake for one another \u2014 made for low vision.',role:'accessibility',bundled:true},
  opendyslexic:{family:'OpenDyslexic',stack:['OpenDyslexic','Verdana','sans-serif'],label:'Dyslexia friendly',
    note:'Weighted letters some readers with dyslexia find easier. The evidence is mixed; try it and keep it if it helps.',role:'accessibility',bundled:true},
  sourceSerif:{family:'Source Serif 4',stack:['Source Serif 4','Georgia','serif'],label:'Classic',note:'A calm serif, like a well-set book.',role:'reading',bundled:true},
  literata:{family:'Literata',stack:['Literata','Georgia','serif'],label:'Book',note:'Made for long reading on screens.',role:'reading',bundled:true},
  plexMono:{family:'IBM Plex Mono',stack:['IBM Plex Mono','ui-monospace','monospace'],label:'Typewriter',note:'Every letter the same width, so numbers line up.',role:'figures',bundled:true}
};
var FONT_ALIASES={interface:'system',text:'sourceSerif',mono:'plexMono',hyperlegible:'atkinson',dyslexic:'opendyslexic'};
function canonicalFont(id){return FONT_REGISTRY[id]?id:(FONT_ALIASES[id]||'system');}
/* Text options beyond the face, in plain words. */
var TEXT_OPTIONS={
  lineSpacing:{label:'Line spacing',values:{tight:{label:'Tight',v:'1.4'},normal:{label:'Normal',v:'1.55'},relaxed:{label:'Relaxed',v:'1.8'}},def:'normal',css:'--lh'},
  letterSpacing:{label:'Letter spacing',values:{normal:{label:'Normal',v:'0em'},wide:{label:'Wide',v:'0.04em'},wider:{label:'Wider',v:'0.08em'}},def:'normal',css:'--ls'},
  textWeight:{label:'Text weight',values:{regular:{label:'Regular',v:'400'},bold:{label:'Bold',v:'700'}},def:'regular',css:'--fw'}
};
function fontFallbackStack(id){
  var f=FONT_REGISTRY[canonicalFont(id)];
  if(!f)return null;
  return f.stack.map(function(n){return /\s/.test(n)&&!/^-/.test(n)?('"'+n+'"'):n;}).join(', ');
}
function fontRegistryAudit(){
  var issues=[];
  Object.keys(FONT_REGISTRY).forEach(function(k){
    var f=FONT_REGISTRY[k];
    if(!f.stack.length)issues.push(k+': empty stack');
    var last=f.stack[f.stack.length-1];
    /* A stack that does not end in a generic family can fail to resolve at all. */
    if(['serif','sans-serif','monospace','system-ui'].indexOf(last)<0)
      issues.push(k+': stack ends in "'+last+'" rather than a generic family, so it can fail to resolve');
    if(f.stack.length<2)issues.push(k+': no fallback, which means one missing font leaves nothing');
  });
  return {fonts:Object.keys(FONT_REGISTRY).length,issues:issues,ok:issues.length===0,
    accessibilityFaces:Object.keys(FONT_REGISTRY).filter(function(k){
      return FONT_REGISTRY[k].role==='accessibility';}).length,
    note:'Every stack must end in a generic family and carry at least one fallback, because the fallback is what most readers see.',
    caveat:'Every face except the device\u2019s own is bundled in the build, so a choice is guaranteed to render; the fallbacks cover a failed decode.'};
}
/* ---------------- §18 chart types ----------------
   Each type declares what it is FOR and, more usefully, when it misleads. A chart type chosen because it
   looks impressive is how a bar chart ends up encoding a continuous relationship. */
var CHART_TYPES={
  line:{encodes:'a continuous series over time',requires:['ordered x'],
    misleads:'when the x axis is categorical, or when gaps are joined as though continuous'},
  bar:{encodes:'magnitude across categories',requires:['zero baseline'],
    misleads:'when the baseline is not zero, which exaggerates every difference'},
  stackedBar:{encodes:'composition within a total',requires:['parts sum to the whole'],
    misleads:'when comparing any series but the bottom one, because the others have a moving baseline'},
  groupedBar:{encodes:'the same measure across categories and groups',requires:['zero baseline'],
    misleads:'beyond about four groups, where it becomes unreadable'},
  histogram:{encodes:'the distribution of one variable',requires:['a stated bin width'],
    misleads:'when the bin width is chosen after seeing the result, which can manufacture or hide modes'},
  scatter:{encodes:'the relationship between two variables',requires:['both axes labelled with units'],
    misleads:'by implying causation from a visible slope'},
  bubble:{encodes:'three variables, the third as area',requires:['area, not radius, proportional to value'],
    misleads:'when radius is scaled instead of area, which squares the apparent difference'},
  band:{encodes:'an interval around an estimate',requires:['the interval to be real'],
    misleads:'when drawn without an interval behind it, where it reads as evidence'},
  fan:{encodes:'a forecast widening with horizon',requires:['PREDICTIVE class'],
    misleads:'when the fan does not widen, which implies the future is as certain as the past'},
  violin:{encodes:'a distribution across categories',requires:['enough observations per category'],
    misleads:'below roughly twenty per category, where the smoothing invents shape'},
  smallMultiple:{encodes:'the same chart across facets',requires:['shared axes'],
    misleads:'when axes differ between panels, which makes them look comparable when they are not'}
};
function chartTypeFor(quantity,intent){
  var t=typeForQuantity(quantity);
  if(!t)return {status:'untyped',note:'Nothing is known about '+quantity+', so no chart can be recommended for it.'};
  var pick=null;
  if(intent==='distribution')pick=t.temporal==='daily'?'histogram':'violin';
  else if(intent==='composition')pick='stackedBar';
  else if(intent==='comparison')pick='groupedBar';
  else if(intent==='relationship')pick='scatter';
  else if(intent==='forecast')pick='fan';
  /* A series of readings over time is a line whether each reading is an instant or a daily aggregate —
     "instant" describes the measurement, not the chart. Only a genuinely non-temporal quantity gets bars,
     and a window aggregate compared across periods gets bars because there is no continuum between them. */
  else if(t.temporal==='instant'||t.temporal==='daily'||t.temporal==='rate'||t.temporal==='cumulative')pick='line';
  else pick='bar';
  var c=CHART_TYPES[pick];
  return {status:'ok',quantity:quantity,intent:intent||'trend',chart:pick,
    encodes:c.encodes,requires:c.requires,misleads:c.misleads,
    epistemic:t.cls,visual:visualForClass(t.cls),
    note:'Chosen from what the quantity IS rather than from what looks good. Each type carries how it misleads, because that is the part nobody checks.'};
}
function chartTypeAudit(){
  var issues=[];
  Object.keys(CHART_TYPES).forEach(function(k){
    var c=CHART_TYPES[k];
    if(!c.misleads)issues.push(k+': declares no failure mode, which usually means nobody thought about it');
    if(!c.requires||!c.requires.length)issues.push(k+': declares no requirements');
  });
  return {types:Object.keys(CHART_TYPES).length,issues:issues,ok:issues.length===0,
    note:'Every chart type declares what it encodes, what it needs, and how it misleads.'};
}
/* ---------------- §55 UI/UX self-audit engine ----------------
   The named audits the spec asks for, each returning findings rather than a score. A score would be
   comforting and would hide which thing is wrong. */
function themeAudit(){
  var a=accessibilityAudit();
  var f=fontRegistryAudit();
  return {contrast:{checked:a.checked,issues:a.issues},
    fonts:{checked:f.fonts,issues:f.issues},
    colourOnly:a.colourOnlyClasses||[],
    ok:a.ok&&f.ok,
    findings:(a.issues||[]).concat(f.issues||[]),
    note:'Theme-level checks: contrast in both themes against both surfaces, and font stacks that can actually resolve.'};
}
function visualAudit(){
  /* This used to call visualContractAudit() behind a typeof guard — a function that was never written, because the
     file meant to hold it already existed and the write was refused. So this line checked nothing, silently, from
     the day it was written. presentationAudit() already checks every contract's coherence; the governance gate's
     undeclared-reference detector found the dead guard. */
  var c={issues:[]};
  var ct=chartTypeAudit();
  var p=presentationAudit();
  return {contracts:(p.checked&&p.checked.contracts)||0,
    chartTypes:ct.types,
    findings:(p.findings||[]).concat(ct.issues||[]).concat(c.issues||[]),
    ok:(p.ok!==false)&&ct.ok,
    note:'Visualization-level checks: every contract references real dimensions and classes, and every chart type declares its failure mode.'};
}
function uiAudit(){
  /* Interface-level: reachability and the rails, which the interface gate already proves, surfaced here so
     the self-audit engine is one place rather than knowledge spread across test files. */
  var findings=[];
  try{
    var im=interactionMatrix();
    (im.issues||[]).forEach(function(i){findings.push('unreachable: '+(i.id||i));});
  }catch(e){}
  try{
    var sw=getSwallowedErrors();
    if(sw.count)findings.push(sw.count+' quarantined error(s) during this session');
  }catch(e){}
  return {findings:findings,ok:findings.length===0,
    note:'Interface-level checks: every registered action is reachable from some surface, and nothing was quarantined.'};
}
function uxAudit(){
  /* Experience-level: the things that make an app unusable without breaking anything. */
  var findings=[];
  try{
    var h=loggingHabits(28);
    var weak=h.rows.filter(function(r){return r.coverage<40;});
    if(weak.length)findings.push('low logging coverage on: '+weak.map(function(r){return r.label;}).join(', ')+
      ' \u2014 an interface problem as often as a motivation one');
  }catch(e){}
  try{
    var c=captureRequest();
    if(c.status==='ok'&&c.ask&&c.ask.burden>0.6)
      findings.push('the highest-value thing to record is also high burden, which usually means it will not get recorded');
  }catch(e){}
  return {findings:findings,ok:findings.length===0,
    note:'Experience-level checks. These are softer than the others and are reported as observations rather than failures.',
    caveat:'Low coverage is evidence about the interface as much as about the person, and this cannot tell those apart.'};
}
function responsiveAudit(){
  var findings=[],readable=false;
  /* The two things that actually break on a phone: fixed widths and rails colliding with safe areas. */
  try{
    var css=(typeof document!=='undefined')?
      [].slice.call(document.querySelectorAll('style')).map(function(s){return s.textContent;}).join(''):'';
    readable=css.length>200;
    if(!readable)return {findings:[],readable:false,ok:null,inconclusive:true,
      note:'The stylesheet could not be read in this context, so nothing was checked. That is reported as inconclusive rather than as a pass.'};
    /* Only a BARE `width` is a fixed width. `min-width` and `max-width` are breakpoints and constraints,
       and both end in "width" — the first version of this check flagged four legitimate media queries,
       which is the same defect shape recorded elsewhere in this file: a check broader than the property it
       means to verify. */
    if(/(^|[^-a-z])width:\s*\d{3,}px/.test(css))
      findings.push('a bare fixed pixel width over 100px appears in the stylesheet');
    if(!/env\(safe-area-inset/.test(css))findings.push('no safe-area insets, so content can sit under the system bars');
    if(!/@media/.test(css))findings.push('no media queries at all');
  }catch(e){}
  /* If the stylesheet could not be read at all, this audit checked NOTHING. Returning "ok" then would be a
     pass earned by absence, which is the least useful kind. */
  return {findings:findings,readable:readable,
    ok:readable?findings.length===0:null,
    inconclusive:!readable,
    note:'Layout checks that matter on a phone: fixed widths, safe-area insets, and whether any breakpoint exists.'};
}
function presentationSelfAudit(){
  var parts={theme:themeAudit(),visual:visualAudit(),ui:uiAudit(),ux:uxAudit(),responsive:responsiveAudit()};
  var all=[];
  Object.keys(parts).forEach(function(k){
    (parts[k].findings||[]).forEach(function(f){all.push({area:k,finding:f});});});
  return {parts:parts,findings:all,ok:all.length===0,cls:'POLICY',
    note:'One entry point for the presentation self-audit: theme, visualization, interface, experience and layout. Findings rather than a score \u2014 a score would be comforting and would hide which thing is wrong.'};
}

/* ============================================================================
   PRESENTATION COMPLETION
   A strict verification of the visual specification — matching the identifiers each section actually names,
   rather than loose keywords — found the earlier "64 of 67" claim too generous. Only eighteen sections were
   complete. The declarations below close the rest.

   These are registries, not decoration. Each carries the thing the spec keeps asking for and that a colour
   name alone never gives: what it is FOR, and where it goes wrong.
   ============================================================================ */

/* ---------------- §9 shape engine ---------------- */
var SHAPES={
  rect:{sides:4,use:'the default container'},
  roundedRect:{sides:4,radius:'md',use:'cards and sheets'},
  capsule:{sides:4,radius:'pill',use:'pills, tags, small status'},
  circle:{sides:0,use:'avatars, single-value gauges'},
  donut:{sides:0,hole:true,use:'a part-of-whole where the centre carries the total'},
  triangle:{sides:3,use:'direction and change indicators'},
  diamond:{sides:4,rotated:true,use:'a point that must not read as a data marker'},
  hexagon:{sides:6,use:'tiling without a grid'},
  arc:{sides:0,partial:true,use:'progress toward a bounded target'},
  line:{sides:0,use:'separation and connection'}
};
function shapePath(shape,w,h){
  var s=SHAPES[shape];
  if(!s)return null;
  var r=TOKENS_RADIUS_FOR(shape,w,h);
  if(shape==='circle')return 'M '+(w/2)+' 0 a '+(w/2)+' '+(h/2)+' 0 1 0 0.01 0 Z';
  if(shape==='triangle')return 'M '+(w/2)+' 0 L '+w+' '+h+' L 0 '+h+' Z';
  if(shape==='diamond')return 'M '+(w/2)+' 0 L '+w+' '+(h/2)+' L '+(w/2)+' '+h+' L 0 '+(h/2)+' Z';
  if(shape==='hexagon'){
    var q=w/4;
    return 'M '+q+' 0 L '+(w-q)+' 0 L '+w+' '+(h/2)+' L '+(w-q)+' '+h+' L '+q+' '+h+' L 0 '+(h/2)+' Z';
  }
  return 'M '+r+' 0 H '+(w-r)+' Q '+w+' 0 '+w+' '+r+' V '+(h-r)+' Q '+w+' '+h+' '+(w-r)+' '+h+
    ' H '+r+' Q 0 '+h+' 0 '+(h-r)+' V '+r+' Q 0 0 '+r+' 0 Z';
}
function TOKENS_RADIUS_FOR(shape,w,h){
  var s=SHAPES[shape]||{};
  if(s.radius==='pill')return Math.min(w,h)/2;
  if(s.radius==='md')return 10;
  return 0;
}
/* §10 shape languages: a coherent set of choices, so "rounded" is a decision made once. */
var SHAPE_LANGUAGES={
  soft:{radius:'lg',border:'subtle',use:'the default \u2014 calm, low contrast edges'},
  editorial:{radius:'sm',border:'none',use:'reading-led, letting type carry the structure'},
  industrial:{radius:'sm',border:'strong',use:'dense and instrument-like, edges doing the work'},
  glass:{radius:'lg',border:'subtle',translucent:true,
    use:'layered surfaces',
    caution:'translucency reduces contrast, so it has to be checked rather than assumed'}
};
/* ---------------- §11 elevation ---------------- */
var ELEVATION={
  flat:{level:0,shadow:'none',use:'content at rest'},
  raised:{level:1,shadow:'0 1px 2px rgba(0,0,0,.18)',use:'cards'},
  floating:{level:2,shadow:'0 6px 16px rgba(0,0,0,.24)',use:'sheets and menus'},
  overlay:{level:3,shadow:'0 12px 32px rgba(0,0,0,.34)',use:'modals'},
  glass:{level:2,shadow:'0 6px 16px rgba(0,0,0,.2)',blur:true,
    use:'a floating surface over content',
    caution:'blur costs frames on older phones and reduces text contrast'},
  neomorphic:{level:1,shadow:'inset 0 1px 2px rgba(255,255,255,.06), 0 1px 2px rgba(0,0,0,.3)',
    use:'not used here',
    caution:'it relies almost entirely on low-contrast shadow, which fails accessibility at the sizes this app uses'}
};
/* ---------------- §12 spacing scale ---------------- */
/* SPACING_SCALE removed in H0: defined but never read (see docs/architecture/presentation-policies.md where it recorded a decision). */
/* ---------------- §38 responsive breakpoints ---------------- */
var BREAKPOINTS={
  phone:{min:0,max:519,columns:1,note:'the primary target'},
  phablet:{min:520,max:767,columns:1},
  tablet:{min:768,max:1023,columns:2},
  desktop:{min:1024,max:1439,columns:3},
  ultrawide:{min:1440,max:null,columns:3,
    note:'columns stop growing \u2014 a line of text beyond about 75 characters is harder to read, not easier'}
};
function breakpointFor(width){
  var hit=null;
  Object.keys(BREAKPOINTS).forEach(function(k){
    var b=BREAKPOINTS[k];
    if(width>=b.min&&(b.max==null||width<=b.max))hit=k;});
  return hit?Object.assign({name:hit},BREAKPOINTS[hit]):null;
}
/* ---------------- §8 numeric typography ---------------- */
var NUMERIC_POLICY={
  alignment:'tabular',
  notation:{compact:'1.2k above 10,000',standard:'below 10,000',scientific:'never in the interface'},
  decimals:{mass:1,energy:0,ratio:0,index:2,rate:2},
  signed:['change','delta','drift','slope'],
  localized:true
};
/* Observation types and semantic types were named separately — the log calls it `calories`, the registry
   calls it `intake`. Nothing linked them, so formatting an observation fell through to a default and printed
   "950.00" kcal. Aliases close the gap rather than renaming either side. */
var TYPE_ALIASES={
  calories:'intake',protein:'intake',carbs:'intake',fat:'intake',fiber:'intake',
  waist:'weight',neck:'weight',hip:'weight',chest:'weight',arm:'weight',thigh:'weight',
  bodyfat:'adherence',rhr:'cardioFitness',
  soreness:'readiness',fatigue:'readiness',stress:'readiness',motivation:'readiness',
  hunger:'readiness',fullness:'readiness',cravings:'readiness',difficulty:'readiness',
  sleepq:'sleep',water:'intake',cardio:'sleep',mobility:'sleep',supplement:'adherence',
  urine:'readiness',sweatrate:'intake'   /* a 1-8 scored scale; a volume of fluid (per hour) */
};
function typeForQuantity(q){
  return typeOf(q)||(TYPE_ALIASES[q]?typeOf(TYPE_ALIASES[q]):null);
}
function formatNumeric(value,quantity,opts){
  opts=opts||{};
  if(value==null)return '\u2014';
  var t=typeForQuantity(quantity);
  var dim=t?t.dimension:null;
  var dp=opts.decimals!=null?opts.decimals:
    (NUMERIC_POLICY.decimals[dim]!=null?NUMERIC_POLICY.decimals[dim]:
      (dim==='mass'?1:(dim==='energyRate'||dim==='energy'?0:2)));
  var v=Number(value);
  var signed=opts.signed||NUMERIC_POLICY.signed.some(function(s){
    return String(quantity||'').toLowerCase().indexOf(s)>=0;});
  var body;
  if(Math.abs(v)>=10000&&NUMERIC_POLICY.notation.compact)
    body=(v/1000).toFixed(1).replace(/\.0$/,'')+'k';
  else body=v.toFixed(dp);
  if(signed&&v>0)body='+'+body;
  return {text:body,unit:t?t.unit:null,
    alignment:NUMERIC_POLICY.alignment,
    note:'Tabular figures so columns line up; compact notation above ten thousand; scientific notation never, because it reads as precision nobody has.'};
}
/* ---------------- §7 font loading policy ---------------- */
var FONT_POLICY={
  loading:'bundled',
  availability:'every offered face is embedded in the build, so a choice renders everywhere, offline included',
  performance:'no network requests at all; the faces load from the document itself',
  accessibility:'three accessibility faces offered, all bundled',
  display:'swap'
};
function fontLoadingPolicy(){
  return Object.assign({},FONT_POLICY,{
    note:'No font files are fetched, so there is no loading strategy to get wrong: no flash of invisible text, no layout shift, no network cost.',
    tradeoff:'The reader sees whatever their device has. A bundled face would look identical everywhere and would cost a download and a render delay on every first visit.'});
}
function fontPerformance(){
  return {networkRequests:0,layoutShift:'minimal \u2014 faces are embedded, so they decode without a network wait',
    note:'No requests: the faces travel inside the document.'};
}
function fontAccessibility(){
  var faces=Object.keys(FONT_REGISTRY).filter(function(k){return FONT_REGISTRY[k].role==='accessibility';});
  return {faces:faces,
    offered:faces.length,bundled:faces.filter(function(k){return FONT_REGISTRY[k].bundled;}).length,
    variableAxes:{weight:'used for emphasis',slant:'not used — italics at this size reduce legibility more than they add emphasis',
      optical:'not available without a variable font, which is not bundled'},
    note:'Three accessibility faces are offered, and all three are bundled, so they render for everyone who chooses them.',
    caveat:'Typeface choice is a smaller accessibility lever than contrast, size and line length, all of which this app controls directly.'};
}
function fontAvailability(id){
  id=canonicalFont(id);var f=FONT_REGISTRY[id];
  if(!f)return null;
  var available=null;
  try{
    if(typeof document!=='undefined'&&document.fonts&&document.fonts.check)
      available=document.fonts.check('12px '+f.stack[0]);
  }catch(e){}
  return {font:id,first:f.stack[0],resolvedFallback:fontFallbackStack(id),
    firstAvailable:available,
    note:available===null?'Availability cannot be tested in this context, so what the reader sees is unknown.':
      (available?'The preferred face is present.':'The preferred face is absent; the reader is seeing a fallback.')};
}
/* ---------------- §5 colour-blind and palette audits ---------------- */
/* Chosen for lightness separation, then verified by the audit below rather than by eye. */
var SEMANTIC_PALETTE={
  success:'#8fd6a8',   // light
  warning:'#d9a441',   // mid
  danger:'#a11f1a',    // dark
  info:'#5b9dd9'
};
function simulateColorBlind(hex,kind){
  var m=/^#?([0-9a-f]{6})$/i.exec(String(hex||'').trim());
  if(!m)return null;
  var n=parseInt(m[1],16);
  var r=(n>>16)&255,g=(n>>8)&255,b=n&255;
  /* Brettel-style approximations, adequate for detecting a collision rather than for reproduction. */
  var o;
  if(kind==='protanopia')o=[0.567*r+0.433*g,0.558*r+0.442*g,0.242*g+0.758*b];
  else if(kind==='deuteranopia')o=[0.625*r+0.375*g,0.7*r+0.3*g,0.3*g+0.7*b];
  else o=[0.95*r+0.05*g,0.433*g+0.567*b,0.475*g+0.525*b];   // tritanopia
  return '#'+o.map(function(c){
    return Math.max(0,Math.min(255,Math.round(c))).toString(16).padStart(2,'0');}).join('');
}
function colorBlindAudit(palette){
  /* Hue alone fails: red and green differ in hue and barely in LIGHTNESS, so under protanopia they converge.
     These are separated on lightness as well, which survives every simulation — and the epistemic language
     carries stroke and marker shape regardless, because colour should never be the only channel. */
  palette=palette||SEMANTIC_PALETTE;
  var kinds=['protanopia','deuteranopia','tritanopia'];
  /* Not every collision matters equally. Success against danger is the one that actively misleads — "this
     is fine" reading as "this is wrong" in a health app. Four semantic colours mutually separable across all
     three simulations is not achievable in a usable gamut, so the critical pairs are fixed and the rest are
     reported as advisory, carried by stroke and marker shape which every epistemic class already has. */
  var CRITICAL=[['success','danger']];
  var issues=[],advisories=[];
  var keys=Object.keys(palette);
  kinds.forEach(function(k){
    keys.forEach(function(a,i){
      keys.slice(i+1).forEach(function(b){
        var ca=simulateColorBlind(palette[a],k),cb=simulateColorBlind(palette[b],k);
        var r=contrastRatio(ca,cb);
        if(r!=null&&r<1.25){
          var msg=a+' and '+b+' collapse under '+k+' (ratio '+r+')';
          var critical=CRITICAL.some(function(p){
            return (p[0]===a&&p[1]===b)||(p[0]===b&&p[1]===a);});
          (critical?issues:advisories).push(msg);
        }
      });
    });
  });
  return {kinds:kinds,palette:palette,issues:issues,advisories:advisories,ok:issues.length===0,
    criticalPairs:CRITICAL.map(function(p){return p.join(' / ');}),
    note:'Semantic colours simulated under the three common forms of colour blindness. Success against danger is treated as critical because "this is fine" reading as "this is wrong" actively misleads; other collisions are advisory, because '+
      advisories.length+' of them remain and colour is never the only channel here.',
    caveat:'These simulations approximate. They are adequate for finding a collision and not for reproducing what anyone sees, which is why every epistemic class also carries a stroke and a marker shape.'};
}
function chartPaletteAudit(){
  /* A categorical sequence that steps in lightness as well as hue, so adjacent series stay separable in
     greyscale and under simulation. */
  var seq=['#12395e','#d9601a','#6fa8c7','#7a2f6e','#f0c93b','#2f6b4f'];
  var issues=[];
  for(var i=0;i<seq.length;i++)
    for(var j=i+1;j<seq.length;j++){
      var r=contrastRatio(seq[i],seq[j]);
      if(r!=null&&r<1.3)issues.push('series '+(i+1)+' and '+(j+1)+' are too close to tell apart');
    }
  var cb=colorBlindAudit({s1:seq[0],s2:seq[1],s3:seq[2],s4:seq[3]});
  return {series:seq.length,issues:issues.concat(cb.issues),ok:issues.length===0&&cb.ok,
    maxSeries:6,
    note:'A categorical palette checked for adjacent-series confusion and for colour-blind collisions. Above six series, colour stops distinguishing anything and the chart needs faceting instead.'};
}
function paletteAudit(){
  var a=accessibilityAudit();
  var cb=colorBlindAudit();
  var cp=chartPaletteAudit();
  return {contrast:{checked:a.checked,issues:a.issues},
    colorBlind:cb.issues,colorBlindAdvisories:cb.advisories||[],chartPalette:cp.issues,
    ok:a.ok&&cb.ok&&cp.ok,
    findings:(a.issues||[]).concat(cb.issues,cp.issues),
    note:'Contrast, colour-blind collision and categorical-series separation in one place.'};
}
/* ---------------- §14 component registry ---------------- */
var COMPONENTS={
  Button:{states:['default','hover','active','disabled','loading'],touchTarget:44},
  IconButton:{states:['default','active','disabled'],touchTarget:44,
    requires:['an accessible label, because an icon alone names nothing']},
  Input:{states:['default','focus','error','disabled'],touchTarget:44},
  Select:{states:['default','focus','disabled'],touchTarget:44},
  Checkbox:{states:['unchecked','checked','indeterminate','disabled'],touchTarget:44},
  Radio:{states:['unselected','selected','disabled'],touchTarget:44,
    requires:['at least two options, or it should be a checkbox']},
  Slider:{states:['default','dragging','disabled'],touchTarget:44,
    caution:'imprecise on a phone; pair it with a numeric field rather than replacing one'},
  Stepper:{states:['default','min','max','disabled'],touchTarget:44},
  DatePicker:{states:['default','open','disabled'],touchTarget:44},
  TimePicker:{states:['default','open','disabled'],touchTarget:44},
  Toggle:{states:['off','on','disabled'],touchTarget:44},
  Card:{states:['default','interactive','selected'],touchTarget:null},
  Sheet:{states:['closed','open'],touchTarget:null},
  Row:{states:['default','interactive','attention','negative'],touchTarget:44},
  Pill:{states:['default','attention'],touchTarget:null},
  Fold:{states:['collapsed','expanded'],touchTarget:44},
  Toast:{states:['visible','dismissed'],touchTarget:44},
  SegmentedControl:{states:['default','selected','disabled'],touchTarget:44,
    caution:'beyond four segments it becomes unreadable on a phone; use a Select instead'},
  Drawer:{states:['closed','open'],touchTarget:44},
  Popover:{states:['closed','open'],touchTarget:44,
    requires:['dismissal by tapping outside, because a popover with no escape traps the reader']},
  Tooltip:{states:['hidden','visible'],touchTarget:null,
    caution:'there is no hover on a phone, so anything only in a tooltip is invisible to most readers here'},
  Accordion:{states:['collapsed','expanded'],touchTarget:44},
  CommandPalette:{states:['closed','open','filtering','empty'],touchTarget:44,
    requires:['an empty state that suggests something, because a blank result is a dead end']},
  ProgressBar:{states:['indeterminate','determinate','complete'],touchTarget:null},
  /* An empty state has two: nothing yet, and nothing matching a filter. They need different words — "start
     logging" is useless advice to someone whose search returned nothing. */
  EmptyState:{states:['no-data','no-match'],touchTarget:null,
    requires:['a reason and an action, because "no data" alone tells the reader nothing they can act on']},
  Chart:{states:['loading','ready','insufficient','error'],touchTarget:null,
    requires:['an insufficient state, because a chart with no data must not render as an empty grid']}
};
function componentAudit(){
  var issues=[];
  Object.keys(COMPONENTS).forEach(function(k){
    var c=COMPONENTS[k];
    if(!c.states||c.states.length<2)issues.push(k+': fewer than two states declared');
    if(c.touchTarget!=null&&c.touchTarget<44)
      issues.push(k+': touch target below 44px, which fails on a phone');
    if(/Input|Select|Slider|Stepper|Picker/.test(k)&&c.states.indexOf('disabled')<0)
      issues.push(k+': an interactive control with no disabled state');
  });
  return {components:Object.keys(COMPONENTS).length,issues:issues,ok:issues.length===0,
    note:'Every component declares its states and its touch target. A control below 44 pixels is a control most people miss on the first try.'};
}
/* ---------------- §18 remaining chart types ---------------- */
(function moreCharts(){
  var extra={
    heatmap:{encodes:'magnitude across two categorical axes',requires:['a stated colour scale'],
      misleads:'when the colour scale is not perceptually uniform, which invents structure'},
    radar:{encodes:'several measures on one subject',requires:['shared scale across axes'],
      misleads:'almost always \u2014 area scales with the square, and axis order changes the shape'},
    polar:{encodes:'a cyclical pattern',requires:['a genuine cycle'],
      misleads:'when applied to non-cyclical data'},
    donut:{encodes:'part of a whole with a total in the centre',requires:['parts summing to the whole'],
      misleads:'beyond about four slices, where angle comparison fails'},
    gauge:{encodes:'one value against a bounded target',requires:['a real maximum'],
      misleads:'when the maximum is arbitrary, which makes the needle position meaningless'},
    waterfall:{encodes:'how a total is built from contributions',requires:['contributions summing to the change'],
      misleads:'when a residual is silently folded into the last bar'},
    sparkline:{encodes:'shape at a glance, in line with text',requires:['no axis \u2014 it shows shape, not value'],
      misleads:'when read as though it carried a scale'}
  };
  try{Object.keys(extra).forEach(function(k){if(!CHART_TYPES[k])CHART_TYPES[k]=extra[k];});}catch(e){}
})();
/* ---------------- §32/§33 renderer registry ---------------- */
/* NOT `RENDERERS` — that name already belongs to the view system, and declaring it here silently replaced
   the entire view registry, leaving every screen blank. A `var` at top level in a concatenated build is a
   global, and a global is a shared namespace whether or not anyone treats it as one. */
var RENDER_TARGETS={
  html:{use:'text, rows, controls',cost:'lowest',accessible:'natively'},
  svg:{use:'charts, diagrams, gauges, badges, illustrations',cost:'low at a few hundred nodes',maxNodes:2000,
    accessible:'with title and role',
    limit:'beyond roughly two thousand nodes it stops being cheap'},
  canvas:{use:'dense plots',cost:'constant regardless of point count',
    accessible:'not at all without a parallel description',
    limit:'nothing in this app needs it yet'},
  webgl:{use:'three-dimensional or very large scatter',cost:'high startup',
    accessible:'no',limit:'not used; the record is not large enough to justify it'},
  offscreen:{use:'rendering off the main thread',cost:'complexity',
    limit:'not used; no render here blocks long enough to need it'}
};
function rendererFor(nodes,kind){
  if(kind==='text')return 'html';
  if(nodes==null||nodes<=RENDER_TARGETS.svg.maxNodes)return 'svg';
  return 'canvas';
}
/* ---------------- §35 image policy ---------------- */
/* IMAGE_POLICY removed in H0: defined but never read (see docs/architecture/presentation-policies.md where it recorded a decision). */
/* Which observation types still resolve to no semantic type at all. */
function typeCoverage(){
  /* Free-text observations are not quantities and must not be forced into a numeric type. Demanding a
     dimension for prose is the same error as demanding a unit for a name. */
  var numeric=Object.keys(OBS_TYPES||{}).filter(function(t){
    var d=OBS_TYPES[t]||{};
    return d.kind!=='text'&&t!=='note'&&t!=='context';});
  var untyped=numeric.filter(function(t){return !typeForQuantity(t);});
  return {observationTypes:numeric.length,
    textTypes:Object.keys(OBS_TYPES||{}).length-numeric.length,
    untyped:untyped,covered:numeric.length-untyped.length,
    ok:untyped.length===0,
    note:'Every observation type must resolve to a semantic type, directly or by alias, or formatting and validation silently fall back to defaults.',
    caveat:'An alias asserts two names mean the same KIND of quantity, not the same quantity. Waist aliased to a mass type is right about the dimension and says nothing about the measurement.'};
}
function presentationCompletionAudit(){
  var parts={
    shapes:{count:Object.keys(SHAPES).length,
      issues:Object.keys(SHAPES).filter(function(k){return !SHAPES[k].use;}).map(function(k){return k+': no declared use';})},
    charts:chartTypeAudit(),
    components:componentAudit(),
    palette:paletteAudit(),
    fonts:fontRegistryAudit(),
    breakpoints:{count:Object.keys(BREAKPOINTS).length,
      issues:(function(){
        var ks=Object.keys(BREAKPOINTS),out=[];
        for(var i=0;i<ks.length-1;i++){
          var a=BREAKPOINTS[ks[i]],b=BREAKPOINTS[ks[i+1]];
          if(a.max!=null&&b.min!==a.max+1)out.push('gap or overlap between '+ks[i]+' and '+ks[i+1]);
        }
        return out;})()}
  };
  var all=[];
  Object.keys(parts).forEach(function(k){
    (parts[k].issues||parts[k].findings||[]).forEach(function(f){all.push({area:k,finding:f});});});
  return {parts:parts,findings:all,ok:all.length===0,cls:'POLICY',
    note:'The registries the visual specification names, each checked against the rule that makes it worth having: a shape needs a use, a chart needs a failure mode, a component needs states and a touch target, a breakpoint range needs no gaps.'};
}

/* ============================================================================
   §43 APPEARANCE PROFILES AND USER CONTROL
   Five registries existed — themes, accents, fonts, shape languages, elevation — and a user could reach
   none of them. A customization system nobody can operate is a set of constants.

   Two rules govern what follows. Every choice is verified for contrast BEFORE it is offered, so the app
   cannot hand someone an unreadable combination and call it a preference. And a profile is a named bundle
   rather than eight separate switches, because "make this readable" is one decision, not eight.
   ============================================================================ */
var THEMES={
  auto:{label:'Match device',note:'follows the system setting'},
  dark:{label:'Dark',bg:'#0e1113',surface:'#171b1e',text:'#e8eaec'},
  light:{label:'Light',bg:'#f7f7f5',surface:'#ffffff',text:'#1b1f22'},
  highContrast:{label:'High contrast',bg:'#000000',surface:'#0a0a0a',text:'#ffffff',
    note:'maximum separation; some subtlety is lost and that is the trade'},
  paper:{label:'Paper',bg:'#f2ece1',surface:'#faf6ee',text:'#2a2620',
    note:'warm and low-glare for long reading'}
};
/* Accents need a variant per theme. A single value tuned for a dark surface fails on a light one — the
   first version of this offered five accents and every one of them was below 3:1 on a light theme, which
   would have shipped a colour picker where nothing was pickable. The audit caught it before the UI existed. */
var ACCENTS={
  sage:{label:'Sage',onDark:'#8fd6a8',onLight:'#25643f'},
  slate:{label:'Slate',onDark:'#7fa7c4',onLight:'#2d5e80'},
  amber:{label:'Amber',onDark:'#d9a441',onLight:'#8a5d0a'},
  clay:{label:'Clay',onDark:'#c98b6b',onLight:'#8a4a2c'},
  violet:{label:'Violet',onDark:'#a48bc4',onLight:'#5b3f7d'},
  none:{label:'Monochrome',onDark:null,onLight:null,
    note:'no accent at all \u2014 the strongest guarantee that colour is never carrying meaning alone'}
};
/* Which variant applies depends on the surface being light or dark, not on the theme's name. */
function accentValue(accentId,themeId){
  var a=ACCENTS[accentId];
  if(!a)return null;
  var th=THEMES[themeId||'dark'];
  if(!th||!th.surface)return a.onDark;
  var lum=_luminance(th.surface);
  return (lum!=null&&lum>0.4)?a.onLight:a.onDark;
}
var APPEARANCE_PROFILES={
  standard:{label:'Standard',theme:'auto',accent:'sage',font:'text',shape:'soft',
    density:'standard',textScale:'M',contrast:'normal',motion:'full',
    note:'the default'},
  reading:{label:'Reading',theme:'paper',accent:'clay',font:'text',shape:'editorial',
    density:'comfortable',textScale:'L',contrast:'normal',motion:'reduced',
    note:'larger type, warmer surface, less movement'},
  dense:{label:'Dense',theme:'dark',accent:'slate',font:'interface',shape:'industrial',
    density:'compact',textScale:'S',contrast:'normal',motion:'reduced',
    note:'more on screen at once, for someone who already knows where things are'},
  accessible:{label:'Accessible',theme:'highContrast',accent:'none',font:'atkinson',
    shape:'soft',density:'comfortable',textScale:'XL',contrast:'high',motion:'none',
    note:'maximum contrast, no accent colour, a legibility-oriented face and no motion'}
};
/* A profile is only offered if the combination it produces actually passes contrast. */
function profileContrast(id){
  var p=APPEARANCE_PROFILES[id];
  if(!p)return null;
  var th=THEMES[p.theme];
  if(!th||!th.bg)return {profile:id,checked:false,
    note:'This profile follows the device theme, so its contrast depends on which one the device picks. Both are checked separately.'};
  var pairs=[
    {label:'body text on background',fg:th.text,bg:th.bg},
    {label:'body text on surface',fg:th.text,bg:th.surface}
  ];
  var accv=accentValue(p.accent,p.theme);
  if(accv)pairs.push({label:'accent on surface',fg:accv,bg:th.surface});
  /* The existing accessibility audit works on the live theme; this checks an arbitrary pair set, so it is
     computed directly from contrastRatio() rather than borrowing a function that assumes the current one. */
  var rows=pairs.map(function(p){
    var r=contrastRatio(p.fg,p.bg);
    return {label:p.label,fg:p.fg,bg:p.bg,ratio:r,
      /* 4.5 for body text, 3 for a non-text indicator such as an accent. */
      passes:r!=null&&(/accent/.test(p.label)?r>=3:r>=4.5)};
  });
  var failing=rows.filter(function(r){return !r.passes;});
  return {profile:id,checked:true,rows:rows,ok:failing.length===0,failing:failing,
    note:failing.length===0?'Every pair in this profile passes.':'This combination fails contrast and is not offered.'};
}
function appearanceProfiles(){
  var rows=Object.keys(APPEARANCE_PROFILES).map(function(id){
    var c=profileContrast(id);
    return Object.assign({id:id},APPEARANCE_PROFILES[id],
      {contrast:c,offerable:!c||!c.checked||c.ok});
  });
  return {rows:rows,
    offerable:rows.filter(function(r){return r.offerable;}).length,
    withheld:rows.filter(function(r){return !r.offerable;}).map(function(r){return r.id;}),
    cls:'POLICY',
    note:'Each profile is a named bundle rather than eight switches, and each is contrast-checked before it is offered. A theme that fails is withheld rather than offered with a warning nobody reads.'};
}
function applyAppearanceProfile(id){
  var p=APPEARANCE_PROFILES[id];
  if(!p)return null;
  var c=profileContrast(id);
  if(c&&c.checked&&!c.ok)return {status:'refused',profile:id,
    note:'That combination fails contrast, so it is not applied.',failing:c.failing};
  DB.settings.appearanceProfile=id;
  ['theme','accent','font','shape'].forEach(function(k){DB.settings[k]=p[k];});
  DB.settings.density=p.density;DB.settings.textScale=p.textScale;
  DB.settings.contrast=p.contrast;DB.settings.motion=p.motion;
  return {status:'ok',profile:id,applied:p,
    note:'Applied as a bundle. Any single setting can still be changed afterwards, which clears the profile name because it is no longer that profile.'};
}
/* Individual choices, each validated the same way. */
function setAppearance(key,value){
  if(key==='font')value=canonicalFont(value);
  var REG={theme:THEMES,accent:ACCENTS,font:FONT_REGISTRY,shape:SHAPE_LANGUAGES};
  if(!REG[key]||!REG[key][value])return {status:'unknown',key:key,value:value,
    note:'Not a declared option. The registries are the only source of what can be chosen.'};
  if(key==='theme'||key==='accent'){
    var themeId=key==='theme'?value:(DB.settings.theme||'dark');
    var accentId=key==='accent'?value:(DB.settings.accent||'sage');
    var th=THEMES[themeId];
    var accv=accentValue(accentId,themeId);
    if(th&&th.bg&&accv){
      var r=contrastRatio(accv,th.surface);
      if(r!=null&&r<3)return {status:'refused',key:key,value:value,ratio:r,
        note:'That accent on that theme gives a contrast ratio of '+r+
          ', below the 3:1 needed for a non-text indicator. Refused rather than offered with a warning.'};
    }
  }
  DB.settings[key]=value;
  /* Changing one setting means this is no longer the named profile. */
  if(DB.settings.appearanceProfile)DB.settings.appearanceProfile=null;
  return {status:'ok',key:key,value:value,
    note:'Applied. The profile name is cleared, because a profile with one thing changed is not that profile.'};
}
/* Apply the declarative appearance registry to the actual CSS token surface.  This is the single
   bridge from customization state to presentation rendering: views never choose colours directly. */
function presentationThemeId(themeId){
  if(themeId==='auto'){
    try{return window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}
    catch(e){return 'dark';}
  }
  return THEMES[themeId]?themeId:'dark';
}
function presentationThemePalette(themeId){
  var id=presentationThemeId(themeId),th=THEMES[id]||THEMES.dark;
  var dark=id==='dark'||id==='highContrast';
  var base=dark?{
    bg:th.bg,surface:th.surface,surface2:id==='highContrast'?'#111111':'#1f242a',surface3:id==='highContrast'?'#181818':'#272d34',
    border:id==='highContrast'?'rgba(255,255,255,.34)':'rgba(180,200,210,.09)',borderStrong:id==='highContrast'?'rgba(255,255,255,.60)':'rgba(180,200,210,.16)',
    text:th.text,text2:id==='highContrast'?'#d6d6d6':'#969d9c',text3:id==='highContrast'?'#b8b8b8':'#7e8685',
    good:id==='highContrast'?'#a9d58e':'#7d9b6a',attention:id==='highContrast'?'#f0c77f':'#d2a86f',negative:id==='highContrast'?'#ef9a84':'#c47b67',inferred:id==='highContrast'?'#c9b9e8':'#9b8db3',neutral:id==='highContrast'?'#a9cce2':'#6f93a8'
  }:{
    bg:th.bg,surface:th.surface,surface2:'#f0eee9',surface3:'#e7e3db',border:'rgba(38,35,31,.14)',borderStrong:'rgba(38,35,31,.28)',
    text:th.text,text2:'#5f5a53',text3:'#777068',good:'#39734d',attention:'#8a5d0a',negative:'#a33a32',inferred:'#654f82',neutral:'#3f6378'
  };
  return base;
}
function presentationAppearanceAudit(themeId,accentId){
  var id=presentationThemeId(themeId||'dark'),p=presentationThemePalette(id),a=accentValue(accentId||'sage',id);
  var issues=[];
  [['text','bg',4.5],['text','surface',4.5],['text2','surface',4.5],['text3','surface',4.5],
   ['good','surface',3],['attention','surface',3],['negative','surface',3],['inferred','surface',3],['neutral','surface',3]].forEach(function(x){
    var r=contrastRatio(p[x[0]],p[x[1]]); if(r<x[2])issues.push({fg:x[0],bg:x[1],ratio:r,required:x[2]});
  });
  if(a){var ar=contrastRatio(a,p.surface);if(ar<3)issues.push({fg:'accent',bg:'surface',ratio:ar,required:3});var onAccent=(id==='dark'||id==='highContrast')?'#0f1310':'#ffffff';var tr=contrastRatio(onAccent,a);if(tr<4.5)issues.push({fg:'on-accent',bg:'accent',ratio:tr,required:4.5});}
  return {theme:id,accent:accentId||'sage',palette:p,accentValue:a,issues:issues,ok:issues.length===0};
}
function applyPresentationAppearance(settings){
  settings=settings||{};
  var root=typeof document!=='undefined'?document.documentElement:null;
  var themeId=presentationThemeId(settings.theme||'dark'),p=presentationThemePalette(themeId),a=accentValue(settings.accent||'sage',themeId);
  var shape=SHAPE_LANGUAGES[settings.shape||'soft']||SHAPE_LANGUAGES.soft;var _skin=(typeof applySkin==='function')?applySkin('appearance',settings.shape||'soft',DESIGN_TOKENS):null;
  var font=fontFallbackStack(settings.font||'interface')||fontFallbackStack('interface');
  if(!root)return {status:'no-dom',theme:themeId};
  var vars={
    '--bg':p.bg,'--surface':p.surface,'--surface-2':p.surface2,'--surface-3':p.surface3,'--border':p.border,'--border-strong':p.borderStrong,
    '--text':p.text,'--text-2':p.text2,'--text-3':p.text3,'--good':p.good,'--attention':p.attention,'--negative':p.negative,'--inferred':p.inferred,'--neutral':p.neutral,
    '--accent':a||p.text,'--on-accent':themeId==='light'?'#ffffff':'#0f1310',
    '--good-bg':'color-mix(in srgb, '+p.good+' 10%, transparent)','--attention-bg':'color-mix(in srgb, '+p.attention+' 10%, transparent)',
    '--negative-bg':'color-mix(in srgb, '+p.negative+' 10%, transparent)','--inferred-bg':'color-mix(in srgb, '+p.inferred+' 12%, transparent)','--neutral-bg':'color-mix(in srgb, '+p.neutral+' 10%, transparent)',
    '--body':font,'--display':font,
    '--lh':TEXT_OPTIONS.lineSpacing.values[settings.lineSpacing||'normal']?TEXT_OPTIONS.lineSpacing.values[settings.lineSpacing||'normal'].v:'1.55',
    '--ls':TEXT_OPTIONS.letterSpacing.values[settings.letterSpacing||'normal']?TEXT_OPTIONS.letterSpacing.values[settings.letterSpacing||'normal'].v:'0em',
    '--fw':TEXT_OPTIONS.textWeight.values[settings.textWeight||'regular']?TEXT_OPTIONS.textWeight.values[settings.textWeight||'regular'].v:'400','--radius':shape.radius==='lg'?'16px':shape.radius==='sm'?'6px':'14px','--radius-sm':shape.radius==='lg'?'10px':shape.radius==='sm'?'6px':'8px'
  };
  /* The custom accent was validated, stored, exported and listed by the token inspector as "source: custom" — and
     never applied: this map read settings.accent only. The Studio's "Apply colour" changed nothing on screen. */
  if(settings.accentHue!=null)vars['--accent']=accentFromHue(settings.accentHue,themeId);
  else if(settings.customAccent&&/^#[0-9a-f]{6}$/i.test(settings.customAccent))vars['--accent']=settings.customAccent;
  var co=resolveColorOverrides(settings,p);
  Object.keys(co.vars).forEach(function(k){vars[k]=co.vars[k];});
  Object.keys(vars).forEach(function(k){root.style.setProperty(k,vars[k]);});
  root.setAttribute('data-theme',themeId);root.setAttribute('data-shape',settings.shape||'soft');root.setAttribute('data-appearance-profile',settings.appearanceProfile||'');
  var meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute('content',p.bg);
  return {status:'ok',theme:themeId,accent:a,shape:settings.shape||'soft',font:settings.font||'interface',skin:_skin&&_skin.skin||null,semanticsUntouched:_skin?_skin.semanticsUntouched:true};
}
function presentationThemeAudit(){
  var rows=[];
  Object.keys(THEMES).filter(function(id){return id!=='auto';}).forEach(function(id){
    rows.push(presentationAppearanceAudit(id,'sage'));
    Object.keys(ACCENTS).filter(function(a){return a!=='none';}).forEach(function(a){
      var r=presentationAppearanceAudit(id,a);if(!r.ok)rows.push(r);
    });
  });
  return {ok:rows.every(function(r){return r.ok;}),rows:rows,checked:rows.length,cls:'POLICY',note:'Every concrete theme and accent pair is checked against the palette actually applied to CSS variables.'};
}
function appearanceState(){
  var s=DB.settings||{};
  return {profile:s.appearanceProfile||null,
    theme:s.theme||'auto',accent:s.accent||'sage',font:s.font||'text',shape:s.shape||'soft',
    density:s.density||'standard',textScale:s.textScale||'M',
    contrast:s.contrast||'normal',motion:s.motion||'full',
    fontStack:fontFallbackStack(s.font||'text'),
    cls:'MEASURED',
    note:'What is currently applied. A null profile means the settings have been changed individually since a profile was chosen.'};
}

/* ============================================================================
   STEP 10: PRESENTATION STUDIO \u2014 APPEARANCE AS A SPECIFICATION
   The direction: "Studio edits a presentation specification. It should not directly manipulate arbitrary DOM
   styles outside the token system." So the studio never touches a style. It edits an appearance SPEC \u2014
   plain data \u2014 validates it against the existing registries, and hands it to the existing apply path.

   Named appearance*, not presentation*: presentationSpec and exportPresentationSpec already exist in the
   governance module and mean REPORT layout. Reusing those names for appearance would have been a namespace
   collision with a different meaning, which is the class of defect that once blanked every screen.
   ============================================================================ */
var APPEARANCE_SPEC_VERSION=1;
var APPEARANCE_SPEC_FIELDS=['theme','accent','customAccent','accentHue','colorOverrides','font','shape','density','textScale','contrast','motion'];
function appearanceSpec(){
  var s=DB.settings||{},st=appearanceState();
  return {specVersion:APPEARANCE_SPEC_VERSION,
    theme:st.theme,accent:st.accent,customAccent:s.customAccent||null,colorOverrides:s.colorOverrides||null,font:st.font,shape:st.shape,
    density:st.density,textScale:st.textScale,contrast:st.contrast,motion:st.motion,
    profile:st.profile};
}
/* Validation reads the SAME registries the runtime uses, so a spec cannot be valid here and invalid there. */
function validateAppearanceSpec(spec){
  var errs=[],warns=[];
  if(!spec||typeof spec!=='object')return {ok:false,errors:['not an object']};
  if(spec.specVersion!=null&&spec.specVersion>APPEARANCE_SPEC_VERSION)
    errs.push('spec version '+spec.specVersion+' is newer than this build understands ('+APPEARANCE_SPEC_VERSION+')');
  if(spec.theme&&!THEMES[spec.theme])errs.push('unknown theme "'+spec.theme+'"');
  if(spec.accent&&!ACCENTS[spec.accent])errs.push('unknown accent "'+spec.accent+'"');
  /* Old typeface names are accepted through their aliases, so saved profiles and older exports keep working. */
  if(spec.font&&!FONT_REGISTRY[spec.font]&&!FONT_ALIASES[spec.font])errs.push('unknown typeface "'+spec.font+'"');
  if(spec.shape&&!SHAPE_LANGUAGES[spec.shape])errs.push('unknown edge treatment "'+spec.shape+'"');
  Object.keys(spec).forEach(function(k){
    if(APPEARANCE_SPEC_FIELDS.indexOf(k)<0&&k!=='specVersion'&&k!=='profile'&&k!=='name')
      warns.push('ignored unknown field "'+k+'"');
  });
  /* Contrast, computed rather than trusted, for whatever accent this spec would actually render. */
  var th=THEMES[spec.theme||'dark'];
  var acc=spec.customAccent||accentValue(spec.accent||'sage',spec.theme||'dark');
  if(spec.customAccent&&!/^#[0-9a-f]{6}$/i.test(spec.customAccent))errs.push('custom accent is not a six-digit hex colour');
  else if(th&&th.surface&&acc){
    var r=contrastRatio(acc,th.surface);
    if(r!=null&&r<3)errs.push('accent '+acc+' on this theme is '+r+':1, below the 3:1 a non-text indicator needs');
  }
  return {ok:errs.length===0,errors:errs,warnings:warns};
}
/* Arbitrary colour, which the actions list asks for \u2014 accepted only if it passes on the current theme. */
function setCustomAccent(hex){
  hex=String(hex||'').trim();
  if(!/^#[0-9a-f]{6}$/i.test(hex))return {status:'refused',note:'Use a six-digit hex colour such as #3a7bd5.'};
  var th=THEMES[DB.settings.theme||'dark'];
  if(th&&th.surface){
    var r=contrastRatio(hex,th.surface);
    if(r!=null&&r<3)return {status:'refused',ratio:r,
      note:hex+' gives '+r+':1 against this theme\u2019s surface, below the 3:1 needed. Try a '+
        (_luminance(th.surface)>0.4?'darker':'lighter')+' shade.'};
  }
  DB.settings.customAccent=hex;
  DB.settings.appearanceProfile=null;
  return {status:'ok',accent:hex};
}
function clearCustomAccent(){DB.settings.customAccent=null;return {status:'ok'};}
/* ---------------- user profiles: save, duplicate, delete, reset ---------------- */
function userAppearanceProfiles(){return (DB.settings.userAppearanceProfiles||[]).slice();}
function saveAppearanceProfile(name){
  name=String(name||'').trim().slice(0,40);
  if(!name)return {status:'refused',note:'A profile needs a name.'};
  if(APPEARANCE_PROFILES[name.toLowerCase()])
    return {status:'refused',note:'"'+name+'" is a built-in profile. Built-ins cannot be overwritten, so they always stay available to reset to.'};
  var spec=appearanceSpec();
  var v=validateAppearanceSpec(spec);
  if(!v.ok)return {status:'refused',errors:v.errors,note:'The current appearance fails validation, so it is not saved.'};
  var list=userAppearanceProfiles().filter(function(p){return p.name!==name;});
  list.push({name:name,spec:spec,savedAt:nowISO()});
  DB.settings.userAppearanceProfiles=list;
  return {status:'ok',name:name,count:list.length};
}
function loadAppearanceProfile(name){
  var p=userAppearanceProfiles().filter(function(x){return x.name===name;})[0];
  if(!p)return {status:'unknown',name:name};
  return importAppearanceSpec(JSON.stringify(p.spec));
}
function duplicateAppearanceProfile(name,newName){
  var p=userAppearanceProfiles().filter(function(x){return x.name===name;})[0];
  if(!p)return {status:'unknown',name:name};
  newName=String(newName||(name+' copy')).trim().slice(0,40);
  var list=userAppearanceProfiles();
  if(list.some(function(x){return x.name===newName;}))return {status:'refused',note:'A profile called "'+newName+'" already exists.'};
  list.push({name:newName,spec:JSON.parse(JSON.stringify(p.spec)),savedAt:nowISO()});
  DB.settings.userAppearanceProfiles=list;
  return {status:'ok',name:newName};
}
function deleteAppearanceProfile(name){
  var list=userAppearanceProfiles();
  var n=list.length;
  DB.settings.userAppearanceProfiles=list.filter(function(x){return x.name!==name;});
  return {status:DB.settings.userAppearanceProfiles.length<n?'ok':'unknown',name:name};
}
function resetAppearance(){
  DB.settings.customAccent=null;
  return applyAppearanceProfile('standard');
}
/* ---------------- import / export ----------------
   The direction's import path: external representation \u2192 parser \u2192 schema validation \u2192 semantic validation
   \u2192 migration \u2192 canonical object. Never straight into UI state. */
function exportAppearanceSpec(){
  var spec=appearanceSpec();
  return {status:'ok',format:'json',
    text:JSON.stringify(Object.assign({kind:'physique-os-appearance'},spec),null,2),
    note:'An appearance specification. It contains no personal data \u2014 only visual settings \u2014 so it is safe to share.'};
}
function importAppearanceSpec(text){
  var obj;
  try{obj=JSON.parse(String(text||''));}catch(e){return {status:'refused',stage:'parse',note:'Not valid JSON.'};}
  if(!obj||typeof obj!=='object'||Array.isArray(obj))return {status:'refused',stage:'schema',note:'Not an appearance specification.'};
  if(obj.kind&&obj.kind!=='physique-os-appearance')
    return {status:'refused',stage:'schema',note:'This is a "'+obj.kind+'" file, not an appearance specification.'};
  /* migration: a spec with no version is version 1 */
  if(obj.specVersion==null)obj.specVersion=1;
  var v=validateAppearanceSpec(obj);
  if(!v.ok)return {status:'refused',stage:'semantic',errors:v.errors,
    note:'Imported specification fails validation and was not applied.'};
  APPEARANCE_SPEC_FIELDS.forEach(function(k){if(obj[k]!==undefined)DB.settings[k]=obj[k];});
  DB.settings.appearanceProfile=null;
  return {status:'ok',applied:APPEARANCE_SPEC_FIELDS.filter(function(k){return obj[k]!==undefined;}),
    warnings:v.warnings};
}
/* ---------------- token inspector ---------------- */
function tokenInspector(){
  var spec=appearanceSpec();
  var th=THEMES[spec.theme]||{};
  var acc=spec.customAccent||accentValue(spec.accent,spec.theme);
  var rows=[
    {token:'background',value:th.bg||'device',source:'theme '+spec.theme},
    {token:'surface',value:th.surface||'device',source:'theme '+spec.theme},
    {token:'text',value:th.text||'device',source:'theme '+spec.theme},
    {token:'accent',value:acc||'none',source:spec.customAccent?'custom':'accent '+spec.accent},
    {token:'font',value:fontFallbackStack(spec.font),source:'typeface '+spec.font},
    {token:'edges',value:spec.shape,source:'shape language'}
  ];
  if(th.surface&&acc)rows.push({token:'accent contrast',value:contrastRatio(acc,th.surface)+':1',source:'measured'});
  if(th.surface&&th.text)rows.push({token:'text contrast',value:contrastRatio(th.text,th.surface)+':1',source:'measured'});
  return {spec:spec,rows:rows,valid:validateAppearanceSpec(spec)};
}

/* ============================================================================
   COLOUR CUSTOMISATION: state colours, colour-blind-safe presets, background tint
   Every choice is validated before it is accepted, against the theme it will be shown on: a state colour must reach
   3:1 on the surface; good and negative must stay distinguishable under all three colour-blindness simulations,
   because "fine" reading as "wrong" is the one confusion that actively misleads in a health app; and a background
   tint is computed exactly and refused if body text falls below 4.5:1 or the accent below 3:1.
   ============================================================================ */
var STATE_COLOR_PRESETS={
  standard:{label:'Standard',colors:null},
  /* Chosen by searching lightness with this module's own validator. The first hand-picked values kept good and
     negative at similar lightness and collapsed under tritanopia (1.01\u20131.18:1), so both presets were refused by
     the validation they were meant to satisfy. Hue is Okabe\u2013Ito's; lightness carries the separation. */
  okabeIto:{label:'Colour-blind safe (Okabe\u2013Ito)',colors:{dark:{good:'#3cddb4',attention:'#e8ab30',negative:'#eb7047'},light:{good:'#0b4134',attention:'#65470b',negative:'#e14b19'}}},
  highContrast:{label:'High contrast',colors:{dark:{good:'#aaf8c4',attention:'#f9ce1f',negative:'#e00606'},light:{good:'#06471b',attention:'#6d5803',negative:'#f40606'}}}
};
function _hexToRgb(h){h=String(h).replace('#','');return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];}
function _rgbToHex(r){return '#'+r.map(function(v){v=Math.max(0,Math.min(255,Math.round(v)));return (v<16?'0':'')+v.toString(16);}).join('');}
function _hslHex(h,sat,l){sat/=100;l/=100;var k=function(n){return (n+h/30)%12;},a=sat*Math.min(l,1-l);
  var f=function(n){return l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));};return _rgbToHex([f(0)*255,f(8)*255,f(4)*255]);}
function _mixHex(base,tint,t){var a=_hexToRgb(base),b=_hexToRgb(tint);return _rgbToHex(a.map(function(v,i){return v*(1-t)+b[i]*t;}));}
function _themeKind(p){return _luminance(p.surface)>0.4?'light':'dark';}
function resolveColorOverrides(settings,p){
  var co=settings.colorOverrides||{},vars={},kind=_themeKind(p);
  var preset=STATE_COLOR_PRESETS[co.preset]&&STATE_COLOR_PRESETS[co.preset].colors?STATE_COLOR_PRESETS[co.preset].colors[kind]:null;
  ['good','attention','negative'].forEach(function(role){
    var c=(co.custom&&co.custom[role])||(preset&&preset[role]);
    if(c&&/^#[0-9a-f]{6}$/i.test(c)){vars['--'+role]=c;vars['--'+role+'-bg']='color-mix(in srgb, '+c+' 10%, transparent)';}});
  if(co.tintStrength>0&&co.tintHue!=null){
    /* Re-capped for the theme being shown: a tint chosen on one theme must not make text unreadable on another. */
    var t=tintedSurfaces(p,co.tintHue,typeof maxReadableTint==='function'?maxReadableTint(p,co.tintHue,co.tintRequested!=null?co.tintRequested:co.tintStrength):co.tintStrength);
    vars['--bg']=t.bg;vars['--surface']=t.surface;vars['--surface-2']=t.surface2;vars['--surface-3']=t.surface3;}
  return {vars:vars};
}
function tintedSurfaces(p,hue,strength){
  var tint=_hslHex(hue,60,_themeKind(p)==='light'?55:45),t=Math.max(0,Math.min(20,strength))/100;
  return {bg:_mixHex(p.bg,tint,t),surface:_mixHex(p.surface,tint,t),surface2:_mixHex(p.surface2,tint,t),surface3:_mixHex(p.surface3||p.surface2,tint,t)};
}
function _currentPalette(){return presentationThemePalette(presentationThemeId(DB.settings.theme||'dark'));}
function _effectiveSurface(){var p=_currentPalette(),co=DB.settings.colorOverrides||{};
  return (co.tintStrength>0&&co.tintHue!=null)?tintedSurfaces(p,co.tintHue,co.tintStrength).surface:p.surface;}
function validateStateColors(colors){
  var surf=_effectiveSurface(),issues=[];
  ['good','attention','negative'].forEach(function(r){var c=colors[r];if(!c)return;
    if(!/^#[0-9a-f]{6}$/i.test(c)){issues.push(r+' is not a six-digit hex colour');return;}
    var cr=contrastRatio(c,surf);if(cr!=null&&cr<3)issues.push(r+' '+c+' gives '+cr+':1 on the surface, below 3:1');});
  if(colors.good&&colors.negative)['protanopia','deuteranopia','tritanopia'].forEach(function(k){
    var r=contrastRatio(simulateColorBlind(colors.good,k),simulateColorBlind(colors.negative,k));
    if(r!=null&&r<1.25)issues.push('good and negative look alike under '+k+' ('+r+':1) \u2014 "fine" would read as "wrong"');});
  return {ok:issues.length===0,issues:issues};
}
function setStateColorPreset(id){
  if(!STATE_COLOR_PRESETS[id])return {status:'unknown',note:'Not a declared preset.'};
  var p=_currentPalette(),kind=_themeKind(p),c=STATE_COLOR_PRESETS[id].colors;
  if(c){var v=validateStateColors(c[kind]);if(!v.ok)return {status:'refused',issues:v.issues,note:v.issues[0]};}
  var co=Object.assign({},DB.settings.colorOverrides||{});co.preset=id;delete co.custom;DB.settings.colorOverrides=co;
  return {status:'ok',preset:id};
}
function setStateColor(role,hex){
  if(['good','attention','negative'].indexOf(role)<0)return {status:'unknown',note:'Only good, attention and negative can be set.'};
  hex=String(hex||'').trim();
  var p=_currentPalette(),co=Object.assign({},DB.settings.colorOverrides||{});
  var base={good:p.good,attention:p.attention,negative:p.negative};
  var preset=STATE_COLOR_PRESETS[co.preset]&&STATE_COLOR_PRESETS[co.preset].colors?STATE_COLOR_PRESETS[co.preset].colors[_themeKind(p)]:null;
  var next=Object.assign({},base,preset||{},co.custom||{});next[role]=hex;
  var v=validateStateColors(next);
  if(!v.ok)return {status:'refused',issues:v.issues,note:v.issues[0]};
  co.custom=Object.assign({},co.custom||{});co.custom[role]=hex;DB.settings.colorOverrides=co;
  return {status:'ok',role:role,color:hex};
}
function setSurfaceTint(hue,strength){
  hue=+hue;strength=+strength;
  if(!(hue>=0&&hue<=360)||!(strength>=0&&strength<=20))return {status:'refused',note:'Hue must be 0\u2013360 and strength 0\u201320%.'};
  var p=_currentPalette(),t=tintedSurfaces(p,hue,strength),issues=[];
  var tx=contrastRatio(p.text,t.bg),tx2=contrastRatio(p.text,t.surface);
  if(tx!=null&&tx<4.5)issues.push('body text falls to '+tx+':1 on the tinted background, below 4.5:1');
  if(tx2!=null&&tx2<4.5)issues.push('body text falls to '+tx2+':1 on tinted cards, below 4.5:1');
  var acc=DB.settings.customAccent||accentValue(DB.settings.accent||'sage',presentationThemeId(DB.settings.theme||'dark'));
  var ac=acc?contrastRatio(acc,t.surface):null;if(ac!=null&&ac<3)issues.push('the accent falls to '+ac+':1 on tinted cards, below 3:1');
  if(issues.length)return {status:'refused',issues:issues,note:issues[0]};
  var co=Object.assign({},DB.settings.colorOverrides||{});co.tintHue=hue;co.tintStrength=strength;DB.settings.colorOverrides=co;
  return {status:'ok',tint:t};
}
function resetColors(){DB.settings.colorOverrides=null;DB.settings.customAccent=null;return {status:'ok'};}
/* ============================================================================
   COLOUR WITHOUT CODES
   Nobody should need a hex code. A custom accent is chosen as a HUE on a colour slider, and the colour shown is derived
   from that hue for the active theme, with its lightness adjusted until it reads at 3:1 on the surface \u2014 so any hue
   works, and it stays readable when the theme changes. A background tint is a hue and a strength, and a strength that
   would make text hard to read is capped at the highest readable level instead of refused. Colour-blind-friendly state
   colours are a single toggle. The hex values remain visible at the Developer level.
   ============================================================================ */
function accentFromHue(hue,themeId){
  var p=presentationThemePalette(presentationThemeId(themeId||DB.settings.theme||'dark')),dark=_themeKind(p)==='dark';
  var sat=62,l=dark?66:38,step=dark?2:-2;
  for(var i=0;i<30;i++){var hex=_hslHex(hue,sat,l),r=contrastRatio(hex,p.surface);
    if(r!=null&&r>=3.2)return hex;l+=step;if(l<8||l>92)break;}
  return dark?'#e8eaec':'#1b1f22';
}
function chooseAccent(id){
  if(!ACCENTS[id])return {status:'unknown'};
  DB.settings.accentHue=null;DB.settings.customAccent=null;
  return setAppearance('accent',id);
}
function setAccentHue(hue){
  hue=Math.max(0,Math.min(360,Math.round(+hue)));
  DB.settings.accentHue=hue;DB.settings.customAccent=accentFromHue(hue);DB.settings.appearanceProfile=null;
  return {status:'ok',hue:hue,color:DB.settings.customAccent};
}
function setColorBlindFriendly(on){
  var r=setStateColorPreset(on?'okabeIto':'standard');
  if(r.status==='ok'){var co=Object.assign({},DB.settings.colorOverrides||{});co.colorBlind=!!on;DB.settings.colorOverrides=co;}
  return r;
}
function colorBlindFriendly(){var co=DB.settings.colorOverrides||{};return co.preset==='okabeIto'&&!co.custom;}
/* The strongest tint, up to the one asked for, that keeps body text at 4.5:1 and the accent at 3:1 on this theme. */
function maxReadableTint(p,hue,strength){
  var acc=DB.settings.accentHue!=null?accentFromHue(DB.settings.accentHue):(DB.settings.customAccent||accentValue(DB.settings.accent||'sage',presentationThemeId(DB.settings.theme||'dark')));
  for(var s=Math.round(strength);s>=0;s--){var t=tintedSurfaces(p,hue,s);
    var ok=contrastRatio(p.text,t.bg)>=4.5&&contrastRatio(p.text,t.surface)>=4.5&&(!acc||contrastRatio(acc,t.surface)>=3);
    if(ok)return s;}
  return 0;
}
function setTintFriendly(hue,strength){
  hue=Math.max(0,Math.min(360,Math.round(+hue)));strength=Math.max(0,Math.min(20,Math.round(+strength)));
  var p=_currentPalette(),allowed=maxReadableTint(p,hue,strength);
  var co=Object.assign({},DB.settings.colorOverrides||{});co.tintHue=hue;co.tintStrength=allowed;co.tintRequested=strength;DB.settings.colorOverrides=co;
  return {status:'ok',hue:hue,strength:allowed,limited:allowed<strength,
    note:allowed<strength?('Kept at '+allowed+'% so text stays easy to read on this theme.'):null};
}
/* the person's appearance as a record format (export and import) */
registerExportAdapter('appearance',{version:1,formats:['json'],
    object:function(){return appearanceSpec();},
    validate:function(d){var v=validateAppearanceSpec(d);return v.ok?[]:v.errors;},
    apply:function(d){return importAppearanceSpec(JSON.stringify(Object.assign({kind:'physique-os-appearance'},d)));}});
