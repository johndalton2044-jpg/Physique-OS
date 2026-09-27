/* ============================================================================
   REGION: CROSS-DOMAIN INTEGRATION (catalogue §19, §20, §22, §42)

   Every domain until now answered its own question. This is the layer that answers the question none of them
   can alone: given sleep, soreness, fatigue, motivation, appetite, activity, performance and accumulated
   training load together — what state is this person in, how confident can that be, and what is limiting it?

   The temptation in a recovery score is to produce a single number, because a single number feels like an
   answer. It is the wrong output here for two reasons. It hides WHICH signal is low, and the remedies differ
   entirely: sleep debt, a deficit, accumulated load and low motivation all depress the same composite and
   none responds to the same intervention. So the composite exists, and it is reported alongside the limiting
   factors rather than instead of them.

   The second discipline: confidence comes from how much of the picture is actually present. A recovery state
   built from two of nine signals is a guess wearing a percentage, and it says so.
   ============================================================================ */

/* ---------------- §19/§20 UNIFIED RECOVERY ----------------
   Nine inputs, each drawn from the domain that owns it, each contributing only when it has evidence. */
var RECOVERY_INPUTS=[
  {id:'sleep',label:'Sleep',weight:1.2,better:'more'},
  {id:'fatigue',label:'Fatigue',weight:1.2,better:'less'},
  {id:'soreness',label:'Soreness',weight:1,better:'less'},
  {id:'stress',label:'Stress',weight:0.9,better:'less'},
  {id:'motivation',label:'Motivation',weight:0.7,better:'more'},
  {id:'hunger',label:'Appetite',weight:0.6,better:'less'},
  {id:'performance',label:'Performance',weight:1.1,better:'more'},
  {id:'activity',label:'Activity',weight:0.5,better:'more'},
  {id:'load',label:'Training load',weight:1.1,better:'less'}
];
function unifiedRecovery(){
  var pb=null;try{pb=personalBaselines().streams;}catch(e){}
  var parts=[],missing=[];
  /* Subjective streams, each against the person's own middle. */
  ['sleep','fatigue','soreness','stress','motivation','hunger'].forEach(function(t){
    var s=seriesWindow(t,7);
    if(!s.length){missing.push(t);return;}
    var latest=s[s.length-1].value;
    /* The baseline must NOT come from the same days being judged. Falling back to the mean of the recent
       window meant a sustained shift was absorbed into its own reference: a week of fatigue at nine made the
       baseline nine, the deviation zero, and the composite went UP. The fallback uses a longer window with
       the recent days excluded, and where that is not available the signal is dropped rather than compared
       against itself. */
    var has=pb&&pb[t]&&pb[t].status==='ok'&&pb[t].baseline!=null;
    var base=null,spread=null;
    if(has){base=pb[t].baseline;spread=pb[t].spread?Math.max(0.4,pb[t].spread):null;}
    else{
      var long=seriesWindow(t,42);
      var older=long.slice(0,Math.max(0,long.length-7));
      if(older.length>=5){
        base=mean(older.map(function(d){return d.value;}));
        spread=sd(older.map(function(d){return d.value;}))||null;
      }
    }
    if(base==null||!isFinite(base)){missing.push(t);return;}
    spread=Math.max(0.4,spread||0.8);
    var def=RECOVERY_INPUTS.filter(function(r){return r.id===t;})[0];
    var sign=def.better==='more'?1:-1;
    /* Clamped, so one extreme reading cannot dominate a composite of nine. */
    var z=Math.max(-3,Math.min(3,sign*(latest-base)/spread));
    parts.push({id:t,label:def.label,weight:def.weight,value:latest,base:round(base,1),
      z:round(z,2),source:has?'your own baseline':'your longer history, excluding this week'});
  });
  /* Performance: the strength trend, which is objective and lives in the resistance layer. */
  try{
    var st=strengthTrend();
    if(st&&st.status==='ok'&&st.slopePerWeek!=null){
      var z=Math.max(-3,Math.min(3,st.slopePerWeek/Math.max(0.5,Math.abs(st.noiseFloor||1))));
      parts.push({id:'performance',label:'Performance',weight:1.1,value:round(st.slopePerWeek,2),
        base:0,z:round(z,2),source:'your strength trend'});
    }else missing.push('performance');
  }catch(e){missing.push('performance');}
  /* Activity: drift against the person's own recent average. */
  try{
    var a=activityState();
    if(a.status==='ok'&&a.drift!=null){
      parts.push({id:'activity',label:'Activity',weight:0.5,value:a.mean,base:a.mean-a.drift,
        z:round(Math.max(-3,Math.min(3,a.drift/Math.max(500,a.sd||800))),2),source:'step drift'});
    }else missing.push('activity');
  }catch(e){missing.push('activity');}
  /* Accumulated load: the dose accounting, inverted because more load is less recovery. */
  var load=null;
  try{
    load=trainingLoad();
    if(load.status==='ok'&&load.ratio!=null){
      /* A ratio near 1 is neutral; well above it is load outrunning what you are used to. */
      parts.push({id:'load',label:'Training load',weight:1.1,value:load.ratio,base:1,
        z:round(Math.max(-3,Math.min(3,-(load.ratio-1)*3)),2),source:'acute against chronic load'});
    }else missing.push('load');
  }catch(e){missing.push('load');}

  var coverage=parts.length/RECOVERY_INPUTS.length;
  if(parts.length<3)return {status:'insufficient',
    need:['at least three of: '+RECOVERY_INPUTS.map(function(r){return r.label.toLowerCase();}).join(', ')],
    have:parts.length,missing:missing,
    note:'A recovery state assembled from one or two signals is a guess wearing a percentage.'};
  var wsum=parts.reduce(function(a2,p){return a2+p.weight;},0);
  var score=parts.reduce(function(a2,p){return a2+p.z*p.weight;},0)/wsum;
  /* The interval on a composite comes from how much its parts DISAGREE. Eight signals all saying the same
     thing is a different claim from three pulling in opposite directions, and a single number reported
     without that distinction hides which of the two you are looking at. */
  var wvar=parts.reduce(function(a2,p){return a2+p.weight*Math.pow(p.z-score,2);},0)/wsum;
  var se=Math.sqrt(wvar/Math.max(1,parts.length));
  var lo=round(score-1.96*se,2),hi=round(score+1.96*se,2);
  var agreement=wvar<0.5?'the signals agree':(wvar<1.5?'the signals mostly agree':'the signals disagree with each other');
  var band=score>0.5?'better than your normal':
    (score>-0.5?'about your normal':(score>-1.2?'below your normal':'well below your normal'));
  /* Limiting factors: the signals actually dragging, in order, each with its own remedy. */
  var limiting=parts.filter(function(p){return p.z<=-0.7;})
    .sort(function(a2,b2){return (a2.z*a2.weight)-(b2.z*b2.weight);})
    .map(function(p){
      return {factor:p.label,z:p.z,source:p.source,
        remedy:({sleep:'sleep is the lever, and nothing else moves until it does',
          fatigue:'reduce load or take an easier week',
          soreness:'reduce volume on what is sore rather than everything',
          stress:'outside training, and training will not fix it',
          motivation:'often downstream of the others rather than a cause',
          hunger:'usually the deficit rather than the training',
          performance:'the output, not an input \u2014 look at what is above it',
          activity:'restore movement before cutting intake further',
          load:'load has outrun what you are conditioned for'})[p.id]||null};
    });
  return {status:'ok',cls:'EMPIRICAL',
    score:round(score,2),lo:lo,hi:hi,se:round(se,3),n:parts.length,
    agreement:agreement,spread:round(wvar,2),
    band:band,parts:parts,missing:missing,
    coverage:round(coverage*100,0),
    confidence:coverage>=0.7?'medium':(coverage>=0.45?'low':'very low'),
    limiting:limiting,
    load:load&&load.status==='ok'?load:null,
    recommendation:limiting.length?limiting[0].remedy:'nothing is dragging; train as planned',
    intervalNote:'The interval widens when the signals disagree: '+agreement+'. A composite without one cannot tell you whether everything points the same way or whether it is an average of opposites.',
    note:'A composite reported ALONGSIDE its limiting factors, never instead of them. Sleep debt, a deficit, accumulated load and low motivation all depress the same number and none of them responds to the same thing.',
    caveat:'Built from '+parts.length+' of '+RECOVERY_INPUTS.length+' signals'+
      (missing.length?(' \u2014 missing '+missing.join(', ')):'')+
      '. Confidence follows coverage, because a picture with holes in it is a picture with holes in it.'};
}
/* ---------------- INTEGRATED TRAINING LOAD ----------------
   Acute against chronic, across every modality rather than lifting alone — which is the point of having one
   dose model with five dimensions. */
function trainingLoad(opts){
  opts=opts||{};
  var acuteDays=opts.acuteDays||7, chronicDays=opts.chronicDays||28;
  var dayLoad=function(from,to){
    var total=0;
    sessionsOf({from:from,to:to}).forEach(function(s){
      (s.sets||[]).forEach(function(st){
        var K=SET_KINDS[setKind(st)];
        if(!K||!K.volume)return;
        var eff=effortOf(st);
        total+=K.fatigue*(eff.status==='ok'&&eff.rir<=1?1.3:1);
      });
    });
    try{
      movementLog({from:from,to:to}).forEach(function(m){total+=(m.dose&&m.dose.fatigue)||0;});
    }catch(e){}
    try{
      obsOf('cardio',{from:from}).filter(function(o){return !to||o.date<=to;})
        .forEach(function(o){total+=(o.value||0)/20;});
    }catch(e){}
    return total;
  };
  var acute=dayLoad(addDays(asOf(),-(acuteDays-1)));
  var chronicTotal=dayLoad(addDays(asOf(),-(chronicDays-1)));
  var chronicPerWeek=chronicTotal/(chronicDays/7);
  if(chronicPerWeek<=0)return {status:'insufficient',need:['training logged over several weeks'],
    note:'A load ratio needs a baseline to compare against.'};
  var ratio=acute/chronicPerWeek;
  return {status:'ok',cls:'HEURISTIC',
    acute:round(acute,1),chronicPerWeek:round(chronicPerWeek,1),ratio:round(ratio,2),
    band:ratio<0.8?'below what you are used to':(ratio<=1.3?'in line with what you are used to':
      (ratio<=1.5?'above what you are used to':'well above what you are used to')),
    weeks:round(chronicDays/7,0),
    note:'Acute load against your own chronic average, counting lifting, movement work and cardio through one dose model. The acute-to-chronic idea is a useful framing whose predictive value for injury is contested \u2014 it is reported as a description of what changed, not as a risk score.'};
}
/* ---------------- §42 KNOWLEDGE TRANSFERABILITY ----------------
   Whether something learned in one context still applies in another. The catalogue asks for this and it is
   the right question: "increasing steps helped during a 190 lb cut" is not "increasing steps helps". */
var TRANSFER_DIMENSIONS=['phase','weightZone','calorieLevel','trainingVolume','sleepState'];
function currentContext(){
  var ph=activePhase()||{};
  var w=currentWeight();
  var sl=null;try{sl=sleepState();}catch(e){}
  var load=null;try{load=trainingLoad();}catch(e){}
  return {phase:ph.type||null,
    weightZone:w.value!=null?(w.value>=230?'heavy':(w.value>=190?'middle':'lean')):null,
    calorieLevel:ph.calorieTarget!=null?(ph.calorieTarget>=2800?'high':(ph.calorieTarget>=2200?'moderate':'low')):null,
    trainingVolume:load&&load.status==='ok'?load.band:null,
    sleepState:sl&&sl.status==='ok'?sl.consistency:null};
}
function knowledgeTransfer(item,toContext){
  toContext=toContext||currentContext();
  var from=(item&&item.contextTags)||item&&item.context||{};
  if(typeof from==='string')from={phase:from};
  var matches=[],differs=[],unknown=[];
  TRANSFER_DIMENSIONS.forEach(function(d){
    var a=from[d],b=toContext[d];
    if(a==null||b==null){unknown.push(d);return;}
    if(a===b)matches.push(d);else differs.push({dimension:d,then:a,now:b});
  });
  var known=matches.length+differs.length;
  var score=known?matches.length/known:0;
  var grade=!known?'unknown':
    (score>=0.8?'transfers':(score>=0.5?'probably transfers':(score>0?'may not transfer':'does not transfer')));
  return {grade:grade,matches:matches,differs:differs,unknown:unknown,
    known:known,score:round(score,2),cls:'DERIVED',
    verdict:!known?'the context it was learned in was not recorded, so whether it still applies cannot be judged':
      (differs.length?('learned under different '+differs.map(function(d){return d.dimension;}).join(' and ')+
        ' \u2014 '+differs.map(function(d){return d.dimension+' was '+d.then+', now '+d.now;}).join('; ')):
        'the context it was learned in matches your situation now'),
    note:'Something learned during a heavy cut is not automatically true during a lean maintenance. This compares the context it was learned in against the one you are in, which is a check on applicability \u2014 not a re-test of whether it was true.'};
}
function transferableKnowledge(){
  var ctx=currentContext();
  var items=[];
  try{items=personalKnowledge().items||[];}catch(e){}
  var rows=items.map(function(k){
    return Object.assign({},k,{transfer:knowledgeTransfer(k,ctx)});
  });
  return {context:ctx,rows:rows,
    transfers:rows.filter(function(r){return r.transfer.grade==='transfers'||r.transfer.grade==='probably transfers';}).length,
    questionable:rows.filter(function(r){return r.transfer.grade==='may not transfer'||r.transfer.grade==='does not transfer';}).length,
    unknown:rows.filter(function(r){return r.transfer.grade==='unknown';}).length,
    cls:'DERIVED',
    note:'Your situation now, against the situation each thing was learned in. Knowledge that may not transfer is not wrong \u2014 it is unproven here.'};
}
