/* ============================================================================
   REGION: SLEEP AND INJURY DOMAINS
   Both registered through the domain contract in 46-domains.js rather than built beside the loop. Each one
   observes, concludes, proposes and declares what it cannot answer — and inherits epistemic classes,
   uncertainty, replay, knowledge decay and the attention queue without asking for any of them.
   ============================================================================ */

/* ---------------- E. SLEEP ----------------
   The catalogue asks for sleep to stop being an observation and become a model: debt, consistency, and the
   lagged relationship to next-day performance and appetite.

   The inference worth having is "when your sleep drops below YOUR baseline, what happens the next day" —
   which is a within-person comparison against a personal baseline, not a comparison against eight hours.
   The honest difficulty is that this is observational: nobody randomises their own sleep, so a correlation
   here is a correlation. Every output says so. */
var SLEEP_DEBT_WINDOW=14;
function sleepState(){
  var s=seriesWindow('sleep',SLEEP_DEBT_WINDOW);
  if(s.length<5)return {status:'insufficient',need:[(5-s.length)+' more nights logged'],
    headline:'not enough nights to model sleep',
    why:'Debt and consistency are measured against your own average, which needs a handful of nights before it means anything.'};
  var vals=s.map(function(d){return d.value;});
  var avg=mean(vals), sdv=sd(vals)||0;
  var target=(prof().sleepTargetH!=null?prof().sleepTargetH:((activePhase()||{}).sleepTarget||null));
  /* Debt against the person's own target where they set one, otherwise against their own average, never
     against a population figure presented as a requirement. */
  /* "Debt" means a shortfall against a defined requirement. Measured against a person's own average it is
     not debt in any physiological sense — half your nights are below your average by definition. The word
     is reserved for a stated target and the honest label is used otherwise. */
  var hasTarget=target!=null;
  var basis=hasTarget?'your stated target of '+fmtNum(target,1)+' h':'your own '+s.length+'-night average';
  var ref=target!=null?target:avg;
  var debt=vals.reduce(function(a,v){return a+Math.max(0,ref-v);},0);
  var pb=null;try{pb=personalBaselines().streams.sleep;}catch(e){}
  var short=vals.filter(function(v){return v<ref-1;}).length;
  return {status:'ok',cls:'EMPIRICAL',
    nights:s.length,mean:round(avg,2),sd:round(sdv,2),
    target:target,basis:basis,hasTarget:hasTarget,
    shortfallLabel:hasTarget?'sleep debt':'shortfall against your own average',
    debtHours:round(debt,1),
    consistency:sdv<=0.6?'steady':(sdv<=1.2?'variable':'erratic'),
    shortNights:short,
    baseline:pb&&pb.status==='ok'?round(pb.baseline,2):null,
    confidence:s.length>=12?'medium':'low',
    headline:fmtNum(avg,1)+' h average, '+(sdv<=0.6?'steady':(sdv<=1.2?'variable':'erratic'))+
      (debt>3?(' \u00b7 '+fmtNum(debt,0)+' h below '+(hasTarget?'your target':'your own average')+' over '+s.length+' nights'):''),
    note:hasTarget?'Measured against the target you set.':
      'Measured against your own average, which is not sleep debt: half your nights fall below your average by definition. Set a target and this becomes a real shortfall figure.'};
}
/* Lag analysis: does a short night show up the next day? Compared within-person, and reported as a
   correlation with its own sample size rather than as a mechanism. */
function sleepLagEffect(type,opts){
  opts=opts||{};
  var days=opts.days||60;
  var sleep=seriesWindow('sleep',days);
  var other=seriesWindow(type,days);
  if(sleep.length<12||other.length<12)return {status:'insufficient',
    need:['at least 12 nights with '+((OBS_TYPES[type]||{}).label||type)+' logged the following day']};
  var byDate={};other.forEach(function(d){byDate[d.date]=d.value;});
  var pairs=[];
  sleep.forEach(function(d){
    var next=byDate[addDays(d.date,1)];
    if(next!=null)pairs.push({sleep:d.value,next:next,date:d.date});
  });
  if(pairs.length<10)return {status:'insufficient',need:[(10-pairs.length)+' more nights followed by a logged '+((OBS_TYPES[type]||{}).label||type)]};
  var sm=mean(pairs.map(function(p){return p.sleep;}));
  var low=pairs.filter(function(p){return p.sleep<sm-0.5;});
  var high=pairs.filter(function(p){return p.sleep>sm+0.5;});
  if(low.length<4||high.length<4)return {status:'insufficient',
    need:['more variation in your sleep than this window contains'],
    why:'With every night about the same length there is nothing to compare.'};
  var lowMean=mean(low.map(function(p){return p.next;}));
  var highMean=mean(high.map(function(p){return p.next;}));
  var diff=lowMean-highMean;
  var pooled=Math.sqrt((Math.pow(sd(low.map(function(p){return p.next;}))||0,2)+
                        Math.pow(sd(high.map(function(p){return p.next;}))||0,2))/2);
  var d=pooled?diff/pooled:null;
  return {status:'ok',cls:'EMPIRICAL',type:type,pairs:pairs.length,
    shortNights:low.length,longNights:high.length,
    afterShort:round(lowMean,2),afterLong:round(highMean,2),difference:round(diff,2),
    standardised:d!=null?round(d,2):null,
    meaningful:d!=null&&Math.abs(d)>=0.5,
    note:'Your own short nights against your own long nights, comparing the following day. Nobody randomises their own sleep, so this is a correlation \u2014 a short night and a hard day often share a cause.',
    confidence:pairs.length>=25&&d!=null&&Math.abs(d)>=0.5?'medium':'low'};
}
registerDomain({
  id:'sleep',label:'Sleep',priority:30,ontology:'SLEEP_QUALITIES',derives:true,actions:['log.type','nav.domains'],
  observes:['sleep','fatigue','hunger'],
  state:sleepState,
  findings:function(st){
    if(st.status!=='ok')return [];
    var out=[];
    if(st.debtHours>=7&&st.hasTarget)out.push({text:fmtNum(st.debtHours,0)+' h of accumulated sleep debt against '+st.basis,
      cls:'EMPIRICAL',confidence:st.confidence,severity:'attention',
      basis:st.nights+' nights',act:'log.type',arg:'sleep'});
    if(st.consistency==='erratic')out.push({text:'bedtimes and wake times vary enough that one night says little about the next ('+fmtNum(st.sd,1)+' h spread)',
      cls:'EMPIRICAL',confidence:st.confidence,severity:'info',basis:st.nights+' nights'});
    ['fatigue','hunger'].forEach(function(t){
      var lag=sleepLagEffect(t);
      if(lag.status==='ok'&&lag.meaningful)
        out.push({text:'after your shorter nights, next-day '+((OBS_TYPES[t]||{}).label||t).toLowerCase()+
          ' runs '+fmtSigned(lag.difference,1)+' ('+lag.pairs+' paired days)',
          cls:'EMPIRICAL',confidence:lag.confidence,severity:'info',
          basis:lag.shortNights+' short against '+lag.longNights+' long nights'});
    });
    return out;
  },
  propose:function(st){
    if(st.status!=='ok')return [];
    var out=[];
    /* Deliberately modest. Sleep advice from a body-composition app should not become a sleep clinic, and
       the only thing this can honestly say is what its own record supports. */
    if(st.debtHours>=10&&st.hasTarget&&st.confidence!=='low')
      out.push({verb:'Recover sleep before changing anything else',
        why:['a '+fmtNum(st.debtHours,0)+' h shortfall over '+st.nights+' nights against '+st.basis,
             'recovery, appetite and training performance all read worse under a shortfall, so a change made now would be judged against a moving baseline'],
        cls:'EMPIRICAL',confidence:'low',priority:25,
        reverseIf:['the shortfall closes and the numbers still look the same, which would mean sleep was not the cause']});
    return out;
  },
  gaps:function(st){
    var out=[];
    if(st.status!=='ok')out.push({question:'What is your normal sleep, and does a short night cost you anything?',
      need:st.need||['nightly sleep logged'],limits:'recovery interpretation and the appetite context',
      burden:0.3,value:0.6,act:'log.type',arg:'sleep'});
    else{
      var lag=sleepLagEffect('fatigue');
      if(lag.status!=='ok')out.push({question:'Does a short night actually show up in how you feel the next day?',
        need:lag.need||['more paired nights'],limits:'whether sleep is worth intervening on for you specifically',
        burden:0.3,value:0.5,act:'log.type',arg:'fatigue'});
    }
    return out;
  },
  knowledge:function(st){
    if(st.status!=='ok')return [];
    var out=[{kind:'sleep',subject:'your normal night',statement:fmtNum(st.mean,1)+' h, '+st.consistency,
      confidence:st.confidence,evidence:st.nights+' nights',context:'current period',
      lastValidated:asOf(),transfers:'shifts with season, work and children; it is a description of now, not a constant'}];
    ['fatigue','hunger'].forEach(function(t){
      var lag=sleepLagEffect(t);
      if(lag.status==='ok'&&lag.meaningful)out.push({kind:'sleep',subject:'short night \u2192 next-day '+t,
        statement:fmtSigned(lag.difference,1)+' on your own scale',confidence:lag.confidence,
        evidence:lag.pairs+' paired days',context:'within-person comparison',lastValidated:asOf(),
        transfers:'observational \u2014 a short night and a hard day often share a cause, so this is association, not mechanism'});
    });
    return out;
  }
});

/* ---------------- J. INJURY / PAIN / LOAD ----------------
   The catalogue calls this "a major missing domain", and is explicit about the boundary: detect patterns and
   recommend training modifications, never diagnose. So this domain records where it hurts, what it happened
   around, and which exercises load that region \u2014 and proposes substitutions from the exercise ontology.

   It will not name a condition, grade a severity medically, or estimate a healing time. It says which
   movements load the region, what the record shows about exposure, and when something has gone on long
   enough that a person should be assessed by somebody qualified. */
var BODY_REGIONS={
  shoulder:{label:'Shoulder',patterns:['horizontal push','vertical push','vertical pull'],
    muscles:['front delts','side delts','rear delts','chest']},
  elbow:{label:'Elbow',patterns:['horizontal push','vertical push','horizontal pull'],muscles:['triceps','biceps']},
  wrist:{label:'Wrist or hand',patterns:['horizontal push','vertical push','carry'],muscles:['forearms']},
  lowBack:{label:'Lower back',patterns:['hinge','squat','carry'],muscles:['lower back','glutes','hamstrings']},
  hip:{label:'Hip',patterns:['squat','hinge','lunge'],muscles:['glutes','quads','hamstrings']},
  knee:{label:'Knee',patterns:['squat','lunge'],muscles:['quads','hamstrings','calves']},
  ankle:{label:'Ankle or foot',patterns:['squat','lunge','carry'],muscles:['calves']},
  neck:{label:'Neck',patterns:['vertical push','carry'],muscles:['traps']}
};
function injuries(){return (DB.settings.injuries||[]).filter(function(i){return _knownBy(i,asOf());});}
function activeInjuries(){
  return injuries().filter(function(i){return !i.resolvedAt||localDateOf(i.resolvedAt)>asOf();});
}
/* The mutation primitive. Domains propose; this is the registered path a user's confirmation runs through. */
function recordInjury(o){
  o=o||{};
  if(!BODY_REGIONS[o.region])return null;
  pushUndo('record a sore area');
  var rec={id:uid('inj'),region:o.region,since:o.since||todayISO(),createdAt:nowISO(),
    severity:Math.max(1,Math.min(5,Math.round(num(o.severity)||2))),
    note:String(o.note||'').slice(0,240),
    aggravators:(o.aggravators||[]).slice(0,8),resolvedAt:null};
  DB.settings.injuries=(DB.settings.injuries||[]).concat([rec]);
  emitEvent('injury.recorded',rec,{at:rec.createdAt});
  _memoInvalidate();save('injury');
  return rec;
}
function resolveInjury(id){
  var rec=(DB.settings.injuries||[]).filter(function(i){return i.id===id;})[0];
  if(!rec||rec.resolvedAt)return false;
  pushUndo('mark a sore area resolved');
  rec.resolvedAt=nowISO();
  emitEvent('injury.resolved',{id:id},{at:rec.resolvedAt});
  _memoInvalidate();save('injury:resolve');
  return true;
}
/* Which exercises in the plan load a region, via the movement patterns the ontology already declares. */
function exercisesLoading(region){
  var r=BODY_REGIONS[region];
  if(!r)return [];
  var out=[],seen={};
  var p=trainingProgram();
  Object.keys(p.templates||{}).forEach(function(t){
    (p.templates[t]||[]).forEach(function(row){
      var name=row[0];if(seen[name])return;
      var ex=null;try{ex=resolveExercise(name);}catch(e){}
      if(!ex)return;
      var loads=(r.patterns.indexOf(ex.pattern)>=0)||
        (ex.muscles||[]).some(function(m){return r.muscles.indexOf(m)>=0;});
      if(loads){seen[name]=1;out.push({exercise:name,template:t,pattern:ex.pattern});}
    });
  });
  return out;
}
function injuryState(){
  var act=activeInjuries();
  if(!act.length)return {status:'clear',cls:'MEASURED',headline:'nothing sore on record',
    all:injuries().length,note:'Areas you record here are matched against the movements in your plan.'};
  var worst=act.slice().sort(function(a,b){return b.severity-a.severity;})[0];
  var loaded=act.map(function(i){
    return {injury:i,region:BODY_REGIONS[i.region],
      days:daysBetween(i.since,asOf()),
      exercises:exercisesLoading(i.region),
      exposures:(function(){
        var n=0;
        sessionsOf({from:i.since}).forEach(function(s){
          (s.sets||[]).forEach(function(set){
            var ex=null;try{ex=resolveExercise(set.exercise);}catch(e){}
            if(!ex)return;
            var r=BODY_REGIONS[i.region];
            if((r.patterns.indexOf(ex.pattern)>=0)||(ex.muscles||[]).some(function(m){return r.muscles.indexOf(m)>=0;}))n++;
          });
        });
        return n;
      })()};
  });
  return {status:'ok',cls:'MEASURED',active:act.length,items:loaded,worst:worst,
    longest:Math.max.apply(null,loaded.map(function(l){return l.days;})),
    headline:act.length+' area'+(act.length===1?'':'s')+' sore \u00b7 '+
      (BODY_REGIONS[worst.region]||{}).label+' at '+worst.severity+'/5',
    confidence:'high',
    note:'This is what you told it and what your plan loads. It is not a diagnosis and cannot be one.'};
}
registerDomain({
  id:'injury',label:'Sore areas and load',priority:10,ontology:'BODY_REGIONS',actions:['injury.add','nav.planEdit'],   // ahead of optimisation: pain outranks rate
  observes:['soreness','fatigue'],
  state:injuryState,
  findings:function(st){
    if(st.status!=='ok')return [];
    var out=[];
    st.items.forEach(function(l){
      if(l.exercises.length)out.push({
        text:(l.region.label)+': '+l.exercises.length+' movement'+(l.exercises.length===1?'':'s')+
          ' in your plan load it ('+l.exercises.slice(0,3).map(function(e){return e.exercise;}).join(', ')+
          (l.exercises.length>3?', \u2026':'')+')',
        cls:'DERIVED',confidence:'medium',severity:'attention',
        basis:'movement patterns declared by the exercise ontology',act:'injury.review',arg:l.injury.id});
      if(l.exposures>0&&l.days>=14)out.push({
        text:l.region.label+' has been sore '+l.days+' days with '+l.exposures+' loading sets logged since',
        cls:'MEASURED',confidence:'high',severity:'attention',basis:'your own session log'});
      /* The one thing this domain will say about the world outside the record. */
      if(l.days>=42)out.push({
        text:l.region.label+' has been sore for '+Math.round(l.days/7)+' weeks \u2014 long enough to be looked at by a clinician',
        cls:'POLICY',confidence:'high',severity:'action',
        basis:'duration alone; this app cannot assess what is wrong and will not try'});
    });
    return out;
  },
  propose:function(st){
    if(st.status!=='ok')return [];
    var out=[];
    st.items.forEach(function(l){
      if(!l.exercises.length)return;
      if(l.injury.severity>=3||l.days>=14){
        /* Substitutions come from the same ontology the plan editor uses, so a swap is a real alternative
           rather than a suggestion to stop training. */
        var subs=[];
        l.exercises.slice(0,4).forEach(function(e){
          try{
            var alt=(substitutesFor(e.exercise)||[]).map(function(s){return s.exercise||s;})
              .filter(function(x){
                if(!x||!x.name)return false;
                return !(l.region.patterns.indexOf(x.pattern)>=0)&&
                  !(x.muscles||[]).some(function(m){return l.region.muscles.indexOf(m)>=0;});
              })[0];
            if(alt)subs.push({from:e.exercise,to:alt.name});
          }catch(err){_q(err,'P3');}
        });
        out.push({verb:'Work around your '+l.region.label.toLowerCase(),
          why:[l.region.label+' sore '+l.days+' days at '+l.injury.severity+'/5',
               l.exercises.length+' movement(s) in the plan load it',
               subs.length?('substitutes that avoid the region: '+subs.map(function(s){return s.from+' \u2192 '+s.to;}).join('; ')):
                 'no substitute in the ontology avoids that region \u2014 reducing load or range may be the only option'],
          cls:'DERIVED',confidence:'low',priority:8,
          act:subs.length?'nav.planEdit':null,
          reverseIf:['the soreness settles','a clinician clears the movement']});
      }
    });
    return out;
  },
  gaps:function(st){
    if(st.status==='clear')return [{question:'Is anything sore that the plan should work around?',
      need:['a sore area recorded, if you have one'],limits:'whether training recommendations account for pain at all',
      burden:0.1,value:0.4,act:'injury.add'}];
    return st.items.filter(function(l){return !l.injury.aggravators.length;}).map(function(l){
      return {question:'What specifically aggravates your '+l.region.label.toLowerCase()+'?',
        need:['the movements that provoke it'],limits:'how precisely a substitution can be targeted',
        burden:0.2,value:0.5,act:'injury.review',arg:l.injury.id};
    });
  },
  knowledge:function(st){
    return injuries().filter(function(i){return i.resolvedAt;}).slice(-6).map(function(i){
      return {kind:'injury',subject:(BODY_REGIONS[i.region]||{}).label||i.region,
        statement:'settled after '+daysBetween(i.since,localDateOf(i.resolvedAt))+' days',
        confidence:'low',evidence:'one episode',context:'what you were doing at the time',
        lastValidated:localDateOf(i.resolvedAt),
        transfers:'one episode is a data point, not a pattern; a recurrence in the same region is the thing worth noticing'};
    });
  }
});
