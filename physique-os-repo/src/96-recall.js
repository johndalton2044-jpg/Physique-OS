/* ============================================================================
   REGION: RECALL, JUMPS AND COMPARISONS
   The remaining UX list, built on what already exists rather than as new subsystems.

   The organising idea: most questions people actually ask are comparisons ("is this better than last time?")
   or navigation ("take me to the thing that changed"). Both are cheap once the record is a ledger, and both
   are useless if they invent a difference where the data cannot support one — so every comparison here
   states what it is comparing and refuses when the two sides are not comparable.
   ============================================================================ */
/* ---------- recent records (§2, §84) ---------- */
function recentRecords(limit){
  limit=limit||12;
  var out=[];
  (DB.observations||[]).filter(function(o){return _visible(o,asOf());})
    .slice(-40).forEach(function(o){
      out.push({kind:'observation',id:o.id,at:o.createdAt||o.at,date:o.date,
        label:((OBS_TYPES[o.type]||{}).label||o.type)+' '+(o.value!=null?String(o.value):''),
        act:'obs.inspect',arg:o.id});});
  _liveFoodLogs().slice(-20).forEach(function(l){
    out.push({kind:'food',id:l.id,at:l.createdAt,date:l.date,
      label:(l.food&&l.food.name?l.food.name:'food')+' \u00b7 '+(l.portionLabel||''),act:'nav.day',arg:l.date});});
  sessionsOf().slice(-10).forEach(function(s){
    out.push({kind:'session',id:s.id,at:s.createdAt,date:s.date,
      label:(s.name||'Session')+' \u00b7 '+((s.sets||[]).length)+' sets',act:'session.open',arg:s.id});});
  out.sort(function(a,b){return String(a.at)<String(b.at)?1:-1;});
  return out.slice(0,limit);
}
/* ---------- jump targets (§4, §5, §6) ---------- */
function jumpTargets(){
  var t=[];
  var lastIv=(DB.interventions||[]).filter(function(i){return _knownBy(i,asOf());})
    .sort(function(a,b){return a.date<b.date?1:-1;})[0];
  if(lastIv)t.push({id:'lastIntervention',label:'Last change to the plan',
    detail:lastIv.variable+(lastIv.from!=null?(' '+lastIv.from+' \u2192 '+lastIv.to):'')+' \u00b7 '+ageLabel(lastIv.date),
    date:lastIv.date,act:'nav.day',arg:lastIv.date});
  var lastPred=(DB.predictions||[]).filter(function(p){return p.status==='scored';})
    .sort(function(a,b){return String(a.scoredAt)<String(b.scoredAt)?1:-1;})[0];
  if(lastPred)t.push({id:'lastPrediction',label:'Last scored forecast',
    detail:(lastPred.covered?'within range':'outside range')+' by '+fmtWeight(Math.abs(lastPred.error||0))+' \u00b7 '+ageLabel(localDateOf(lastPred.scoredAt)),
    date:String(lastPred.dueDate||'').slice(0,10),act:'nav.voi'});
  try{
    var q=attentionQueue();
    var first=q.items.filter(function(i){return i.severity==='action';})[0]||q.items[0];
    if(first)t.push({id:'nextUnresolved',label:'Next thing waiting on you',detail:first.what,
      act:'attention.go',arg:first.id});
  }catch(e){_q(e,'P3');}
  var ph=activePhase();
  if(ph)t.push({id:'phaseStart',label:'Start of this phase',detail:phaseLabel(ph)+' \u00b7 '+ageLabel(ph.startDate),
    date:ph.startDate,act:'nav.day',arg:ph.startDate});
  try{
    var cp=changePoints(120).items[0];
    if(cp)t.push({id:'lastChangePoint',label:'Last detected shift',detail:cp.text,date:cp.date,act:'nav.day',arg:cp.date});
  }catch(e){_q(e,'P3');}
  var lastPos=navHistory()[1];
  if(lastPos)t.push({id:'lastPlace',label:'Back to where I was',detail:lastPos.tab+(lastPos.day?(' \u00b7 '+shortDate(lastPos.day)):''),act:'nav.back'});
  return t;
}
/* ---------- what changed since yesterday (§7) ---------- */
function changedSince(days){
  days=days==null?1:days;
  var since=addDays(asOf(),-days);
  var out={since:since,days:days,logged:[],system:[],nothing:false};
  (DB.observations||[]).forEach(function(o){
    if(!_visible(o,asOf()))return;
    var known=String(o.createdAt||o.at||'').slice(0,10);
    if(known<=since)return;
    out.logged.push({label:((OBS_TYPES[o.type]||{}).label||o.type)+' '+(o.value!=null?String(o.value):''),
      date:o.date,act:'obs.inspect',arg:o.id});
  });
  try{whatChanged(Math.max(days,1)).items.forEach(function(i){
    if(localDateOf(i.at)<=since)return;
    out.system.push({label:i.what,detail:i.reason,kind:i.kind});});}catch(e){_q(e,'P3');}
  out.nothing=!out.logged.length&&!out.system.length;
  out.note=out.nothing?('Nothing was recorded or decided in the last '+days+' day'+(days===1?'':'s')+'.'):
    (out.logged.length+' entr'+(out.logged.length===1?'y':'ies')+' logged, '+out.system.length+' change'+(out.system.length===1?'':'s')+' by the system.');
  return out;
}
/* ---------- why am I seeing this (§9) ----------
   Answered from the item's own provenance, so it cannot drift from the thing it explains. */
function whyShown(kind,id){
  if(kind==='attention'){
    var q=attentionQueue().items.filter(function(i){return i.id===id;})[0];
    if(q)return {what:q.what,because:q.why,ifIgnored:q.severity==='action'?
      'The thing it is waiting on stays unresolved, and any number downstream of it keeps the uncertainty it has now.':
      'Nothing breaks; it stays here until it is dealt with or stops applying.',
      todo:q.cando,act:q.act,arg:q.arg};
  }
  if(kind==='decision'){
    var d=(DB.decisions||[]).filter(function(x){return x.id===id;})[0];
    if(d)return {what:d.verb||d.code,because:(d.why||[]).map(function(w){return typeof w==='string'?w:w.text;}).join('; '),
      ifIgnored:'The recommendation stays open; it is rechecked'+(d.recheckDays?(' after '+d.recheckDays+' days'):' on the next review')+'.',
      todo:'Inspect the evidence behind it',act:'obs.inspectDecision',arg:d.id};
  }
  return null;
}
/* ---------- comparisons (§11–§14) ---------- */
function comparePredictionOutcome(limit){
  var rows=(DB.predictions||[]).filter(function(p){return p.status==='scored';})
    .sort(function(a,b){return String(a.scoredAt)<String(b.scoredAt)?1:-1;}).slice(0,limit||10)
    .map(function(p){
      return {made:String(p.madeAt||'').slice(0,10),due:p.dueDate,
        predicted:p.point,range:(p.lo!=null?[p.lo,p.hi]:null),actual:p.actual,
        error:p.error,covered:p.covered,
        context:p.context?(p.context.phaseType+' \u00b7 '+(p.context.weightZone||'')):'',
        basis:p.actualBasis||''};
    });
  if(!rows.length)return {rows:[],status:'none',note:'No forecast has been scored yet. A forecast is scored when its date arrives and there is a weigh-in to compare against.'};
  var covered=rows.filter(function(r){return r.covered;}).length;
  var bias=mean(rows.map(function(r){return r.error;}).filter(function(x){return x!=null;}));
  return {rows:rows,status:'ok',coverage:round(100*covered/rows.length,0),bias:bias!=null?round(bias,2):null,
    note:'Coverage is how often the actual value fell inside the stated range. A well-calibrated interval is right about as often as it claims \u2014 far above as well as far below is a problem.'};
}
function comparePhases(){
  var done=(DB.phases||[]).filter(function(p){return p.endDate&&_knownBy(p,asOf());});
  var rows=done.concat(activePhase()?[activePhase()]:[]).map(function(p){
    var s=dailySeries('weight',p.endDate||asOf(),Math.max(7,daysBetween(p.startDate,p.endDate||asOf())+1))
      .filter(function(d){return d.date>=p.startDate;});
    var wks=Math.max(1,daysBetween(p.startDate,p.endDate||asOf())/7);
    var rate=null;
    if(s.length>=6){var ts=theilSen(s.map(function(d){return {x:d.x,y:d.value};}));if(ts.slope!=null)rate=ts.slope*7;}
    return {id:p.id,label:phaseLabel(p),type:p.type,start:p.startDate,end:p.endDate||null,
      weeks:round(wks,1),rate:rate!=null?round(rate,2):null,
      startWeight:s.length?s[0].value:null,endWeight:s.length?s[s.length-1].value:null,
      target:p.calorieTarget,active:!p.endDate,n:s.length};
  });
  return {rows:rows,note:rows.length>1?'Phases differ in length and starting weight, so compare the rate rather than the total.':
    'Only one phase is on record; there is nothing to compare it against yet.'};
}
function compareIntervention(id){
  var iv=(DB.interventions||[]).filter(function(x){return x.id===id;})[0];
  if(!iv)return null;
  var its=null;
  try{its=interruptedTimeSeries({changeDate:iv.date,preDays:28,postDays:28});}catch(e){_q(e,'P2');}
  var before=dailySeries('weight',addDays(iv.date,-1),28);
  var after=dailySeries('weight',addDays(iv.date,28),28).filter(function(d){return d.date>=iv.date;});
  var rate=function(s){if(s.length<6)return null;var t=theilSen(s.map(function(d){return {x:d.x,y:d.value};}));return t.slope!=null?round(t.slope*7,2):null;};
  return {intervention:{variable:iv.variable,from:iv.from,to:iv.to,date:iv.date,expected:iv.expected||null},
    before:{rate:rate(before),days:before.length},after:{rate:rate(after),days:after.length},
    analysis:its&&its.status==='ok'?{levelShift:its.levelShift,verdict:its.verdict,
      effectiveN:its.effectiveN,nominalN:its.nominalN,autocorrelation:its.autocorrelation}:null,
    note:'Before-and-after is a comparison, not a cause. The analysis below measures the change against the trend that was already running and discounts for how little independent information consecutive days carry.'};
}
/* ---------- copy and export (§16–§19) ---------- */
function decisionReport(id){
  var d=(DB.decisions||[]).filter(function(x){return x.id===id;})[0]||decisionsOf()[0];
  if(!d)return null;
  var L=[];
  L.push('PHYSIQUE OS \u2014 decision');
  L.push(longDate(d.date)+'  ('+(d.code||'')+')');
  L.push('');
  L.push(d.verb||d.code||'');
  if(d.lede)L.push(d.lede);
  L.push('');
  L.push('Confidence: '+(d.confidence||'not stated'));
  if(d.uncertainty&&d.uncertainty.text)L.push('Numbers behind it: '+d.uncertainty.text);
  var block=function(title,arr){
    if(!arr||!arr.length)return;
    L.push('');L.push(title);
    arr.forEach(function(w){L.push('  \u2022 '+(typeof w==='string'?w:(w.text||'')));});
  };
  block('WHY',d.why);
  block('WHAT TO DO',d.action);
  block('WHAT WOULD CHANGE IT',d.reverseIf);
  if(d.recheckDays)L.push('\nRecheck after '+d.recheckDays+' days ('+shortDate(addDays(d.date,d.recheckDays))+').');
  L.push('');
  L.push('Reconstructed from what had been recorded by '+longDate(d.date)+'. It contains no measurements, only the reasoning.');
  return L.join('\n');
}
function traceReport(id){
  var t=traceValue(id);
  if(!t||t.status==='unknown')return null;
  var L=['PHYSIQUE OS \u2014 '+(t.label||id)];
  if(t.status==='insufficient'){
    L.push('');L.push('Not established.');L.push(t.why||'');
    L.push('');L.push('Needs:');(t.need||[]).forEach(function(n){L.push('  \u2022 '+n);});
    return L.join('\n');
  }
  L.push(String(t.value).replace(/<[^>]*>/g,'')+'   ['+t.cls+']');
  L.push('');
  t.steps.forEach(function(s){
    L.push('  '+s.step+': '+String(s.value).replace(/<[^>]*>/g,'')+'  ['+s.cls+']');
    if(s.detail)L.push('      '+s.detail);
  });
  if(t.restsOnPrior)L.push('\nRests on a population assumption at: '+t.restsOnPrior.join(', ')+'.');
  L.push('');L.push('What would change it:');
  (t.wouldChange||[]).forEach(function(x){L.push('  \u2022 '+x);});
  return L.join('\n');
}
function exportSelectedCSV(){
  var recs=selectionRecords();
  if(!recs.length)return null;
  var kind=selectionKind();
  var rows,head;
  if(kind==='food'){
    head=['date','meal','food','quantity','basis','kcal','protein','carbs','fat'];
    rows=recs.map(function(l){return [l.date,l.meal,(l.food&&l.food.name)||'',l.quantity,l.basis,
      (l.nutrients&&l.nutrients.kcal)||'',(l.nutrients&&l.nutrients.protein)||'',
      (l.nutrients&&l.nutrients.carbs)||'',(l.nutrients&&l.nutrients.fat)||''];});
  }else{
    head=['date','type','value','unit','source','quality','recorded','retracted'];
    rows=recs.map(function(o){var t=OBS_TYPES[o.type]||{};
      return [o.date,o.type,o.value,t.unit||'',o.source||'',o.quality||'',
        String(o.createdAt||'').slice(0,10),o.retracted?'yes':''];});
  }
  var esc2=function(v){var s=String(v==null?'':v);return /[",\n]/.test(s)?('"'+s.replace(/"/g,'""')+'"'):s;};
  return {name:'physique-'+kind+'-'+todayISO()+'.csv',
    body:[head.join(',')].concat(rows.map(function(r){return r.map(esc2).join(',');})).join('\n')+'\n',
    count:recs.length};
}
function copyText(text){
  if(!text)return Promise.resolve(false);
  if(typeof navigator!=='undefined'&&navigator.clipboard&&navigator.clipboard.writeText)
    return navigator.clipboard.writeText(text).then(function(){return true;}).catch(function(){return false;});
  return Promise.resolve(false);
}

/* ---------- saved searches (§86) and pinned commands (§85, §322) ----------
   Both are the same idea: a person's own shortcuts into a system that is too large to hold in mind. Both are
   stored in settings rather than the record, because they are preferences about reading the record, not
   facts about the body \u2014 the distinction the review asked to be formalised.

   A saved search stores the QUERY, never its results. Results are re-run each time, so a saved search cannot
   quietly go stale and show a picture of the record as it was when the search was saved. */
function savedSearches(){return (DB.settings&&DB.settings.savedSearches)||[];}
function saveSearch(query,name){
  var q=String(query||'').trim();
  if(!q)return null;
  var list=savedSearches().slice();
  if(list.some(function(s){return s.query===q;}))return null;
  if(list.length>=20)list.shift();
  var rec={id:uid('ss'),name:String(name||q).slice(0,60),query:q,at:nowISO()};
  list.push(rec);
  DB.settings.savedSearches=list;
  save('settings');
  return rec;
}
function removeSavedSearch(id){
  var list=savedSearches().filter(function(s){return s.id!==id;});
  DB.settings.savedSearches=list;save('settings');return true;
}
/* Run a saved search and report how many it finds NOW, which is the only count worth showing. */
function runSavedSearch(id){
  var s=savedSearches().filter(function(x){return x.id===id;})[0];
  if(!s)return null;
  var r;try{r=searchAll(s.query);}catch(e){_q(e,'P2');return null;}
  return {saved:s,results:r.results||[],domain:r.domain||null,count:(r.results||[]).length};
}
function savedSearchSummary(){
  return savedSearches().map(function(s){
    var n=null;
    try{n=(searchAll(s.query).results||[]).length;}catch(e){}
    return {id:s.id,name:s.name,query:s.query,count:n,
      note:n===0?'nothing matches this now':null};
  });
}
function pinnedCommands(){return (DB.settings&&DB.settings.pinnedCommands)||[];}
function pinCommand(id){
  if(!id)return false;
  var list=pinnedCommands().slice();
  var i=list.indexOf(id);
  if(i>=0)list.splice(i,1);
  else{if(list.length>=8)return false;list.push(id);}
  DB.settings.pinnedCommands=list;save('settings');
  return true;
}
function isPinned(id){return pinnedCommands().indexOf(id)>=0;}
/* ---------- layout mode (§43, §194, §195) ----------
   A second column is only useful when there is room for it AND a natural pairing to put in it. Rather than a
   breakpoint that silently reflows, this is an explicit mode with a stated requirement, so a narrow screen is
   never left with two half-columns and nothing readable in either. */
function layoutMode(){
  var pref=(DB.settings&&DB.settings.layout)||'auto';
  var wide=(typeof window!=='undefined')&&window.innerWidth>=1024;
  if(pref==='single')return {mode:'single',reason:'you chose a single column'};
  if(pref==='split'&&!wide)return {mode:'single',reason:'the window is too narrow for two columns; it will split again at 1024px'};
  if(pref==='split')return {mode:'split',reason:'you chose two columns'};
  return {mode:wide?'split':'single',reason:wide?'the window is wide enough for two columns':'a single column fits this width'};
}
function setLayout(pref){
  DB.settings.layout=pref;save('settings');
  applyLayout();
  return layoutMode();
}
function applyLayout(){
  if(typeof document==='undefined')return;
  var m=layoutMode();
  document.documentElement.setAttribute('data-layout',m.mode);
  applyRailInsets();
}
/* The thumb rails float over the content column, fixed near the bottom edge. Anything that scrolls beneath them is
   covered, and a chart's first 37 px — its y-axis labels — sat under the left rail at every width up to 1024 px: the
   "charts clip into the left" report. The rails' intrusion into the content column is measured, and charts are inset
   by exactly that much on that side. It is recomputed whenever layout changes, so it is zero when the rails are
   hidden, at wide widths where the column clears them, and under any text size or density that moves them. */
function applyRailInsets(){
  if(typeof document==='undefined')return;
  var main=document.querySelector('main');if(!main)return;
  var mr=main.getBoundingClientRect(),cs=getComputedStyle(main);
  var innerL=mr.left+(parseFloat(cs.paddingLeft)||0),innerR=mr.right-(parseFloat(cs.paddingRight)||0);
  /* Untransformed geometry. The rails shrink and fade by transform while scrolling, and getBoundingClientRect measures
     that shrunken state: an inset computed mid-scroll was too small once the rails grew back (239 px, then 264 px for
     the same layout). offsetLeft/offsetWidth ignore transforms, so the inset is for the rails at full size. Opacity is
     not a reason to skip a rail — a faded rail comes back. */
  var rail=function(id){var el=document.getElementById(id);if(!el)return null;var s=getComputedStyle(el);
    if(s.display==='none'||s.visibility==='hidden')return null;
    var w=el.offsetWidth;if(!w)return null;var l=el.offsetLeft;return {left:l,right:l+w,width:w};};
  var L=rail('railLeft'),R=rail('railRight'),gap=6;
  /* Measured from a real card's content edge. The first version assumed 18 px of card padding; cards have about 7,
     so charts were inset 11 px too little and the rails still covered 5 px of each side. */
  /* A VISIBLE card. querySelector('main .card') returned the first card in the document, often one in a hidden tab
     with a zero-size box, so the inset depended on which hidden card came first: 43/43 px in one state, 61/0 px in
     another — and a right inset of 0 puts the chart under the right rail. */
  /* The WORST case across every visible card: cards differ in padding, and measuring only the first one left charts
     in a card with less padding a few pixels under the wider left rail (the previous/next pair). */
  var cards=document.querySelectorAll('main .card'),seen=false,minL=Infinity,maxR=-Infinity;
  for(var ci=0;ci<cards.length;ci++){var cd=cards[ci];if(!(cd.offsetWidth>0&&cd.getClientRects().length))continue;seen=true;
    var cr=cd.getBoundingClientRect(),ccs=getComputedStyle(cd);
    minL=Math.min(minL,cr.left+(parseFloat(ccs.paddingLeft)||0)+(parseFloat(ccs.borderLeftWidth)||0));
    maxR=Math.max(maxR,cr.right-(parseFloat(ccs.paddingRight)||0)-(parseFloat(ccs.borderRightWidth)||0));}
  if(seen){innerL=minL;innerR=maxR;}
  var insetL=L?Math.max(0,Math.ceil(L.right+gap-innerL)):0;
  var insetR=R?Math.max(0,Math.ceil(innerR-(R.left-gap))):0;
  var root=document.documentElement.style;
  root.setProperty('--rail-inset-l',insetL+'px');root.setProperty('--rail-inset-r',insetR+'px');
}
