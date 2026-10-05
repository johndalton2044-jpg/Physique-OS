/* ============================================================================
   REGION: EPISODES · PERSONAL KNOWLEDGE
   Two additions the audit identified as the largest conceptual gaps in the data model.
   ============================================================================ */
/* ---------- episodes (§150, §151, §167) ----------
   A phase is something you PLAN: a cut, a maintenance block. An episode is something that HAPPENS to you:
   travel, illness, a plateau, a deload, a holiday. Collapsing the two loses the distinction that matters
   most for interpretation, because a planned phase change explains a discontinuity while an unplanned
   episode is the discontinuity.

   Episodes are DERIVED, not another thing to log. They are inferred from data the record already holds —
   context tags, change points, adherence collapses, training gaps — and each states what it was inferred
   from so it can be disagreed with. */
var EPISODE_TYPES={
  travel:{label:'Travel',planned:false,affects:['weight (water, sodium, restaurant food)','steps','sleep','training continuity'],
    interpretation:'weight during travel is mostly water and gut contents; read the week after it, not the week of it'},
  illness:{label:'Illness',planned:false,affects:['appetite','training','weight','recovery'],
    interpretation:'training and intake both fall; a weight drop here is not fat loss and a rebound after is not fat gain'},
  plateau:{label:'Plateau',planned:false,affects:['weight trend'],
    interpretation:'the trend flattened while targets did not change \u2014 the question is whether intake drifted or expenditure fell'},
  deload:{label:'Deload',planned:true,affects:['training volume','fatigue','weight (glycogen and water)'],
    interpretation:'reduced volume usually shows as a small weight drop from glycogen, then a return'},
  vacation:{label:'Break from the plan',planned:false,affects:['intake','training','steps'],
    interpretation:'a deliberate or unplanned pause; adherence numbers describe the pause, not the plan'},
  cut:{label:'Deficit block',planned:true,affects:['weight','recovery','strength'],interpretation:'a planned energy deficit'},
  maintenance:{label:'Maintenance block',planned:true,affects:['weight stability'],interpretation:'a planned hold'},
  gain:{label:'Surplus block',planned:true,affects:['weight','strength'],interpretation:'a planned energy surplus'},
  logging_gap:{label:'Logging gap',planned:false,affects:['every model downstream of the missing stream'],
    interpretation:'the record is silent here; the models widen rather than assume, and so should you'}
};
function detectEpisodes(days){
  days=days||365;
  return memo('episodes:'+days+':'+asOf(),function(){
    var from=addDays(asOf(),-days);var eps=[];
    /* Planned episodes come straight from phases: they were declared, not inferred. */
    (DB.phases||[]).forEach(function(p){
      if(!_knownBy(p,asOf()))return;
      if(p.endDate&&p.endDate<from)return;
      var t=EPISODE_TYPES[p.type]?p.type:'cut';
      eps.push({id:'ep-phase-'+p.id,type:t,planned:true,start:p.startDate,end:p.endDate||null,
        source:'declared phase',evidence:['phase record '+p.id],confidence:'certain',
        label:(EPISODE_TYPES[t]||{}).label||p.type,interpretation:(EPISODE_TYPES[t]||{}).interpretation||''});
    });
    /* Context tags naming a real-world event. */
    obsOf('context',{from:from}).forEach(function(o){
      var v=String(o.value||'').toLowerCase();
      var t=/travel|flight|trip|abroad|vacation|holiday/.test(v)?'travel':
            (/ill|sick|flu|cold|covid|fever/.test(v)?'illness':
            (/deload|back.?off/.test(v)?'deload':null));
      if(!t)return;
      eps.push({id:'ep-ctx-'+o.id,type:t,planned:!!EPISODE_TYPES[t].planned,start:o.date,end:null,
        source:'context tag',evidence:[o.value],confidence:'stated',
        label:EPISODE_TYPES[t].label,interpretation:EPISODE_TYPES[t].interpretation});
    });
    /* Logging gaps: three or more consecutive days with no weight and no food. */
    /* A gap only exists inside the record. The silence before the first entry is not a gap, it is the time
       before you started, and reporting it as one is noise. */
    var firstDay=(DB.observations||[]).filter(function(o){return _visible(o,asOf());}).map(function(o){return o.date;}).sort()[0]||null;
    var gapStart=null,lastDay=null;
    for(var i=days;i>=0;i--){
      var d=addDays(asOf(),-i);
      if(firstDay&&d<firstDay)continue;
      var has=DB.observations.some(function(o){return o.date===d&&_visible(o,asOf());})||foodLogsOn(d).length>0;
      if(!has){if(!gapStart)gapStart=d;lastDay=d;}
      else if(gapStart){
        if(daysBetween(gapStart,lastDay)>=2)eps.push({id:'ep-gap-'+gapStart,type:'logging_gap',planned:false,
          start:gapStart,end:lastDay,source:'inferred from an absence of records',
          evidence:[(daysBetween(gapStart,lastDay)+1)+' consecutive days with nothing logged'],confidence:'certain',
          label:EPISODE_TYPES.logging_gap.label,interpretation:EPISODE_TYPES.logging_gap.interpretation});
        gapStart=null;
      }
    }
    /* Plateaus: a change point flattening the weight trend with no target change to explain it. */
    try{
      changePoints(Math.min(days,120)).items.forEach(function(cp){
        if(cp.stream!=='weight')return;
        if(Math.abs(cp.after)>0.25||Math.abs(cp.before)<0.3)return;
        var explained=(cp.candidates||[]).some(function(c){return c.kind==='intervention'||c.kind==='phase';});
        if(explained)return;
        eps.push({id:'ep-plateau-'+cp.date,type:'plateau',planned:false,start:cp.date,end:null,
          source:'inferred from a change point with no intervention to explain it',
          evidence:[cp.text],confidence:'inferred',
          label:EPISODE_TYPES.plateau.label,interpretation:EPISODE_TYPES.plateau.interpretation});
      });
    }catch(e){_q(e);}
    /* Training interruptions: a fortnight with no session where sessions were previously regular. */
    var sess=sessionsOf({from:from});
    for(var j=1;j<sess.length;j++){
      var gap=daysBetween(sess[j-1].date,sess[j].date);
      if(gap>=14)eps.push({id:'ep-train-'+sess[j-1].date,type:'vacation',planned:false,
        start:sess[j-1].date,end:sess[j].date,source:'inferred from a gap in training',
        evidence:[gap+' days between sessions'],confidence:'inferred',
        label:'Break from training',interpretation:'strength comparisons across this gap are not like for like'});
    }
    eps.sort(function(a,b){return a.start<b.start?1:-1;});
    var seen={};eps=eps.filter(function(e){var k=e.type+e.start;if(seen[k])return false;seen[k]=1;return true;});
    return {episodes:eps,days:days,cls:'DERIVED',
      note:'Episodes are inferred from records you already keep. A planned phase is something you decided; an unplanned episode is something that happened to you, and the difference changes how a discontinuity should be read.'};
  });
}
function episodeAt(date){
  var all=detectEpisodes().episodes;
  return all.filter(function(e){return e.start<=date&&(!e.end||e.end>=date);});
}
/* ---------- personal knowledge (§112, §113, §114, §166) ----------
   What the system has actually learned about this person, with the context it was learned in, and an
   explicit decay: a response measured at 250 lb in a deficit is not automatically true at 200 lb in
   maintenance, and knowledge that has not been revalidated in a year should not be presented as current. */
var KNOWLEDGE_HALFLIFE_DAYS=270;
function _decay(ageDays){return Math.pow(0.5,ageDays/KNOWLEDGE_HALFLIFE_DAYS);}
function personalKnowledge(){
  return memo('knowledge:'+asOf(),function(){
    var items=[];
    var add=function(o){
      var age=o.lastValidated?daysBetween(o.lastValidated,asOf()):null;
      o.ageDays=age;
      o.freshness=age==null?'unknown':(age<=90?'current':(age<=270?'ageing':'stale'));
      /* Decay only ever lowers confidence. The starting values and the thresholds were on two different scales, so a
         "low" claim decayed to 0.31 read back as "medium" — more confident the older it got. One scale now, and the
         decayed level is never above the original. */
      o.decayedConfidence=age==null?o.confidence:decayConfidence(o.confidence,age);
      /* What would change this claim (MK W13): every claim names the evidence that would overturn it. */
      o.wouldChange=o.wouldChange||({response:'a two-week test changing only '+o.subject+' that moves your weight differently',
        measurement:'a new scale, or weighing at a different time of day',training:'no gain, or a drop, across your next four sessions of it',
        energy:'two weeks of logged intake and weigh-ins that disagree with it'}[o.kind]||'new evidence that contradicts it');
      o.testable=o.kind==='response';
      o.revalidate=o.freshness==='stale'?('this has not been tested since '+shortDate(o.lastValidated)+'; a two-week single-variable experiment would confirm or retire it'):null;
      items.push(o);
    };
    /* Measured responses to variables. */
    try{
      personalResponse().rows.forEach(function(r){
        var last=r.samples.map(function(s){return s.date;}).sort().slice(-1)[0]||null;
        var ctx=r.samples.map(function(s){return s.phase+' / '+(s.weightZone||'?');});
        var seen={};ctx=ctx.filter(function(c){if(seen[c])return false;seen[c]=1;return true;});
        add({kind:'response',subject:r.variable,
          statement:fmtSigned(r.effect,2)+' lb/week per '+r.unit,
          confidence:r.confidence,evidence:r.n+' observation'+(r.n===1?'':'s')+(r.clean<r.n?(', '+(r.n-r.clean)+' confounded'):''),
          context:ctx.join('; ')||'unspecified',lastValidated:last,
          transfers:_transferNote(ctx)});
      });
    }catch(e){_q(e);}
    /* Things that did not work: negative knowledge is knowledge. */
    try{
      getNegativeKnowledge().forEach(function(n){
        add({kind:'negative',subject:n.variable||n.intervention,
          statement:'did not produce the expected effect: '+String(n.observed||'').slice(0,110),
          confidence:n.confidence||'low',evidence:'1 evaluated experiment',
          context:n.applicability||'this phase',lastValidated:n.date,transfers:'a null result is the most context-bound kind of finding; it may not hold in another phase or weight zone'});
      });
    }catch(e){_q(e);}
    /* Measurement reliability. */
    try{
      var q=streamQuality('weight',28);
      if(q.n)add({kind:'measurement',subject:'weigh-ins',
        statement:'quality '+fmtNum(q.mean*100,0)+'% over '+q.n+' entries'+(q.low?(', '+q.low+' low'):''),
        confidence:q.level==='high'?'high':'medium',evidence:q.n+' observations',context:'current protocol',
        lastValidated:asOf(),transfers:'protocol-bound: a new scale or a change of time of day resets this'});
      var pb=personalBaselines();
      if(pb.streams.weight&&pb.streams.weight.status==='ok')add({kind:'measurement',subject:'scale noise',
        statement:'day-to-day swing around '+fmtWeight(pb.streams.weight.baseline),
        confidence:'high',evidence:pb.streams.weight.n+' consecutive weigh-ins',context:'current scale and protocol',
        lastValidated:asOf(),transfers:'this is what any real change must exceed to be visible'});
    }catch(e){_q(e);}
    /* Training response per lift. */
    try{
      exerciseResponse().rows.filter(function(r){return r.status==='ok';}).slice(0,6).forEach(function(r){
        add({kind:'training',subject:r.exercise,
          /* "flat at +2.6" contradicted itself; a rise not yet clear of the noise is said as such, with its uncertainty. */
          statement:(r.direction==='flat'&&r.slopePerWeek!=null&&Math.abs(r.slopePerWeek)>=0.5?((r.slopePerWeek>0?'rising':'falling')+', not yet clear of your session-to-session noise ('+fmtSigned(r.slopePerWeek,1)+(r.slopeSePerWeek!=null?' \u00b1 '+round(r.slopeSePerWeek,1):'')+' e1RM/week)'):
            (r.direction+(r.slopePerWeek!=null?(' at '+fmtSigned(r.slopePerWeek,1)+' e1RM/week'):'')))+' on '+r.weeklySets+' sets/week',
          confidence:r.exposures>=8?'medium':'low',evidence:r.exposures+' exposures',
          context:'current program',lastValidated:asOf(),
          transfers:'exercise-specific and program-bound; a new variant restarts this'});
      });
    }catch(e){_q(e);}
    /* Maintenance estimate — the canonical one (tdeeEstimate), as Today, Learn and the assistant state it. This read the
       uncalibrated empirical component, so the knowledge sheet said 2,825 kcal while every other surface said 2,662. */
    try{
      var t=tdeeEstimate();
      if(t.status==='ok')add({kind:'energy',subject:'maintenance',
        statement:'about '+fmtKcal(t.value)+'/day'+(t.lo!=null?(' ('+fmtKcal(t.lo)+'\u2013'+fmtKcal(t.hi)+')'):''),
        confidence:t.confidence||'medium',evidence:t.basis||(t.cls+' estimate'),
        context:(activePhase()||{}).type||'current phase',lastValidated:asOf(),
        transfers:'maintenance moves with body mass and activity; it is not a constant to carry forward'});
    }catch(e){_q(e);}
    var byKind={};items.forEach(function(i){(byKind[i.kind]=byKind[i.kind]||[]).push(i);});
    return {items:items,byKind:byKind,count:items.length,
      current:items.filter(function(i){return i.freshness==='current';}).length,
      stale:items.filter(function(i){return i.freshness==='stale';}).length,
      halfLifeDays:KNOWLEDGE_HALFLIFE_DAYS,cls:'EMPIRICAL',
      note:'What this record has actually established about you, with the context it was learned in. Confidence decays with age because a finding from a different body weight and a different phase is a different finding.'};
  });
}
function _transferNote(contexts){
  if(!contexts||!contexts.length)return 'context unrecorded, so transfer is unknown';
  if(contexts.length>1)return 'observed across '+contexts.length+' contexts, which makes it more likely to generalise';
  return 'observed only in '+contexts[0]+'; it may not hold in another phase or weight zone';
}
/* Knowledge gaps (§111): the questions this record cannot yet answer, and what would answer them. */
function knowledgeGaps(){
  var gaps=[];
  var k=personalKnowledge();
  var known={};k.items.forEach(function(i){if(i.kind==='response')known[i.subject]=i;});
  Object.keys(RESPONSE_VARS).forEach(function(v){
    if(known[v])return;
    gaps.push({question:'How does '+v+' actually affect your rate of change?',
      whyItMatters:'every recommendation about '+v+' currently rests on a population estimate rather than on you',
      have:'no clean observation',uncertainty:'high',
      measurement:'a single-variable change held for the designed duration',
      experiment:designExperiment({variable:v,delta:RESPONSE_VARS[v].scale*2}),
      expectedValue:0.8});
  });
  try{
    var bc=bodyComp();
    if(!bc.measured||daysBetween(bc.measured.date,asOf())>90)
      gaps.push({question:'What is your actual body composition?',
        whyItMatters:'without a measured anchor the app cannot separate fat from lean mass, only report a circumference estimate',
        have:'circumference estimate only',uncertainty:'high',
        measurement:'one DXA, BodPod or same-operator caliper reading',experiment:null,expectedValue:0.5});
  }catch(e){_q(e);}
  k.items.filter(function(i){return i.freshness==='stale';}).forEach(function(i){
    gaps.push({question:'Does "'+i.statement+'" still hold?',
      whyItMatters:'it was established '+ageLabel(i.lastValidated)+' and knowledge decays with context change',
      have:i.evidence,uncertainty:'medium',measurement:'revalidate with a short experiment',experiment:null,expectedValue:0.4});
  });
  gaps.sort(function(a,b){return b.expectedValue-a.expectedValue;});
  return {gaps:gaps,cls:'DERIVED',note:'Each entry is a question the record cannot answer yet, with the measurement that would answer it.'};
}
var CONF_LEVELS=['very low','low','medium','high'],CONF_VALUE={'very low':0.15,low:0.35,medium:0.6,high:0.9};
function decayConfidence(level,ageDays){
  var i0=CONF_LEVELS.indexOf(level);if(i0<0)return level;
  var v=CONF_VALUE[level]*_decay(ageDays),i=0;
  /* A level holds until the decayed value falls below the midpoint to the level beneath it: any decay at all dropped a
     full level when the thresholds sat on the levels themselves (medium became low after 20 days). */
  for(var k=CONF_LEVELS.length-1;k>=1;k--){var mid=(CONF_VALUE[CONF_LEVELS[k]]+CONF_VALUE[CONF_LEVELS[k-1]])/2;if(v>=mid){i=k;break;}}
  return CONF_LEVELS[Math.min(i,i0)];
}
