/* ============================================================================
   REGION: FURTHER DOMAINS (catalogue D, F, G, H, K, L, M, N)
   Each is a declaration against the registry in 46-domains.js. None of them re-implements uncertainty,
   replay, knowledge decay, the attention queue or value-of-information ranking — that was the point of
   building the registry first, and it is why eight engines fit in one file.

   Every domain here obeys the same two rules: it cannot write, and it may only observe declared types.
   Where a domain has no data it says what it needs rather than producing a number to fill the space.
   ============================================================================ */

/* ---------------- D. RECOVERY / READINESS ----------------
   Readiness from a personal baseline, never an absolute scale. "Fatigue 6" means nothing without knowing
   what your 6 usually is, and a readiness score that ignores that is a horoscope with arithmetic. */
function readinessState(){
  var streams=['fatigue','soreness','stress','motivation','sleep'];
  var pb=null;try{pb=personalBaselines().streams;}catch(e){}
  var parts=[],missing=[];
  streams.forEach(function(t){
    var s=seriesWindow(t,7);
    if(!s.length){missing.push((OBS_TYPES[t]||{}).label||t);return;}
    var latest=s[s.length-1].value;
    /* personalBaselines exposes `baseline` as the CENTRE and `spread` as the dispersion. Reading a
       non-existent `median` made every z null, and a null score was still being labelled "about your
       normal" — a confident statement built from nothing. */
    var hasPb=pb&&pb[t]&&pb[t].status==='ok'&&pb[t].baseline!=null;
    var base=hasPb?pb[t].baseline:mean(s.map(function(d){return d.value;}));
    var spread=hasPb&&pb[t].spread?Math.max(0.4,pb[t].spread):
      Math.max(0.4,(sd(s.map(function(d){return d.value;}))||0.8));
    if(base==null||!isFinite(base)){missing.push((OBS_TYPES[t]||{}).label||t);return;}
    /* z against the person's own middle, signed so that "better" is always positive. */
    var better=(t==='motivation'||t==='sleep')?1:-1;
    parts.push({stream:t,label:(OBS_TYPES[t]||{}).label||t,value:latest,base:round(base,1),
      z:round(better*(latest-base)/spread,2)});
  });
  if(parts.length<2)return {status:'insufficient',need:missing.length?['recent '+missing.slice(0,3).join(', ')]:['a few days of how you feel'],
    headline:'not enough to judge readiness',
    why:'Readiness here is a comparison against your own normal, so it needs a normal to compare against.'};
  var zs=parts.map(function(p){return p.z;}).filter(function(z){return z!=null&&isFinite(z);});
  if(!zs.length)return {status:'insufficient',need:['a longer run of ratings to establish a normal'],
    headline:'not enough to judge readiness',
    why:'Every signal is present but none has a usable baseline yet, so there is nothing to compare today against.'};
  var score=mean(zs);
  /* The interval on a composite reflects how much its signals disagree. */
  var rvar=zs.reduce(function(a2,z){return a2+Math.pow(z-score,2);},0)/Math.max(1,zs.length);
  var rse=Math.sqrt(rvar/Math.max(1,zs.length));
  var band=score>0.5?'better than your normal':(score>-0.5?'about your normal':(score>-1.2?'below your normal':'well below your normal'));
  /* Recovery debt: how many of the last 14 days sat below the personal middle. */
  var debt=0;
  ['fatigue','soreness'].forEach(function(t){
    var s=seriesWindow(t,14);
    if(!s.length)return;
    var base=(pb&&pb[t]&&pb[t].status==='ok')?pb[t].median:mean(s.map(function(d){return d.value;}));
    debt+=s.filter(function(d){return d.value>base;}).length;
  });
  return {status:'ok',cls:'EMPIRICAL',score:round(score,2),lo:round(score-1.96*rse,2),hi:round(score+1.96*rse,2),n:zs.length,agreement:rvar<0.5?'the signals agree':(rvar<1.5?'the signals mostly agree':'the signals disagree'),band:band,parts:parts,
    daysBelowNormal:debt,missing:missing,
    confidence:parts.length>=4?'medium':'low',
    headline:band+(parts.length<4?(' \u00b7 from '+parts.length+' of 5 signals'):''),
    note:'Compared against your own middle for each signal, not against a scale. A 6 out of 10 means nothing until the system knows what your 6 usually is.'};
}
registerDomain({
  id:'recovery',label:'Recovery and readiness',priority:20,ontology:'RECOVERY_INPUTS',derives:true,actions:['nav.recovery2','log.type'],
  observes:['fatigue','soreness','stress','motivation','sleep'],
  state:readinessState,
  findings:function(st){
    if(st.status!=='ok')return [];
    var out=[];
    if(st.score<=-1.2)out.push({text:'every signal you log is '+st.band+' right now',
      cls:'EMPIRICAL',confidence:st.confidence,severity:'attention',
      basis:st.parts.length+' signals against your own baseline'});
    if(st.daysBelowNormal>=10)out.push({text:st.daysBelowNormal+' of the last 28 signal-days sat worse than your own middle',
      cls:'EMPIRICAL',confidence:st.confidence,severity:'attention',basis:'fatigue and soreness'});
    var worst=st.parts.slice().sort(function(a,b){return a.z-b.z;})[0];
    if(worst&&worst.z<=-1)out.push({text:worst.label.toLowerCase()+' is the signal furthest from your normal ('+fmtSigned(worst.z,1)+' of your own spread)',
      cls:'EMPIRICAL',confidence:'low',severity:'info',basis:'personal baseline'});
    return out;
  },
  propose:function(st){
    if(st.status!=='ok'||st.score>-1.2)return [];
    return [{verb:'Take the easier option this week',
      why:['readiness is '+st.band,'a deficit judged against a depressed baseline reads worse than it is, so a change made now would be measured against a moving target'],
      cls:'EMPIRICAL',confidence:'low',priority:18,
      reverseIf:['the signals return to your normal and the numbers still look the same']}];
  },
  gaps:function(st){
    if(st.status==='ok'&&!st.missing.length)return [];
    return [{question:'How do you actually feel, day to day?',
      need:st.missing&&st.missing.length?['recent '+st.missing.slice(0,3).join(', ')]:(st.need||['a few days of ratings']),
      limits:'readiness, and whether a stall is fatigue or energy balance',
      burden:0.2,value:0.6,act:'log.type',arg:'fatigue'}];
  },
  knowledge:function(st){
    if(st.status!=='ok')return [];
    return [{kind:'recovery',subject:'your normal',
      statement:st.parts.map(function(p){return p.label.toLowerCase()+' around '+p.base;}).join(', '),
      confidence:st.confidence,evidence:st.parts.length+' signals',context:'current period',
      lastValidated:asOf(),transfers:'baselines drift with phase and season; this describes now'}];
  }
});

/* ---------------- F. ACTIVITY ----------------
   "More activity" and "more useful activity" are different claims. What can honestly be checked from steps
   alone is consistency and whether activity fell as the deficit ran — the compensation the literature
   describes and that a step count can actually show. */
function activityState(){
  var s=seriesWindow('steps',28);
  if(s.length<7)return {status:'insufficient',need:[(7-s.length)+' more days of steps'],
    headline:'not enough days of activity',why:'Consistency and drift need a couple of weeks before they mean anything.'};
  var vals=s.map(function(d){return d.value;});
  var avg=mean(vals),sdv=sd(vals)||0;
  var target=(activePhase()||{}).stepTarget||null;
  var recent=s.slice(-7),earlier=s.slice(0,Math.max(7,s.length-7));
  var rMean=mean(recent.map(function(d){return d.value;})),eMean=mean(earlier.map(function(d){return d.value;}));
  var drift=rMean-eMean;
  var hit=target?vals.filter(function(v){return v>=target*0.9;}).length/vals.length:null;
  return {status:'ok',cls:'MEASURED',days:s.length,mean:Math.round(avg),sd:Math.round(sdv),
    target:target,hitRate:hit!=null?round(hit*100,0):null,
    drift:Math.round(drift),
    consistency:sdv/Math.max(1,avg)<0.2?'steady':(sdv/Math.max(1,avg)<0.35?'variable':'erratic'),
    confidence:s.length>=21?'medium':'low',
    headline:fmtNum(avg,0)+' steps/day, '+(sdv/Math.max(1,avg)<0.2?'steady':'variable')+
      (Math.abs(drift)>800?(' \u00b7 '+fmtSigned(drift,0)+' over the last week'):''),
    note:'Steps are the only activity this record holds, so this is about volume and consistency. It cannot tell useful activity from restless activity.'};
}
registerDomain({
  id:'activity',label:'Activity',priority:40,ontology:'ACTIVITY_KINDS',derives:true,knowledge:activityKnowledge,actions:['log.type','nav.missing'],
  observes:['steps','cardio'],
  state:activityState,
  findings:function(st){
    if(st.status!=='ok')return [];
    var out=[];
    /* The finding worth having: unintentional compensation while dieting. */
    if(st.drift<=-1200)out.push({text:'activity has drifted down '+fmtNum(Math.abs(st.drift),0)+' steps/day over the last week',
      cls:'MEASURED',confidence:st.confidence,severity:'attention',
      basis:st.days+' days of steps',act:'log.type',arg:'steps'});
    if(st.hitRate!=null&&st.hitRate<60)out.push({text:'the step target is met on '+st.hitRate+'% of days',
      cls:'MEASURED',confidence:'high',severity:'info',basis:'against the phase target'});
    if(st.consistency==='erratic')out.push({text:'activity swings enough day to day that a weekly average hides most of it',
      cls:'MEASURED',confidence:st.confidence,severity:'info',basis:'coefficient of variation above a third'});
    return out;
  },
  propose:function(st){
    if(st.status!=='ok'||st.drift>-1200)return [];
    return [{verb:'Restore activity before cutting calories further',
      why:['activity fell '+fmtNum(Math.abs(st.drift),0)+' steps/day over the last week',
           'a deficit that closed because movement dropped is not a deficit that needs more restriction'],
      cls:'DERIVED',confidence:'low',priority:35,
      reverseIf:['steps return to their earlier level and the trend still stalls']}];
  },
  gaps:function(st){
    if(st.status==='ok')return [];
    return [{question:'How much do you actually move on an ordinary day?',need:st.need||['daily steps'],
      limits:'expenditure, and whether a stall is compensation or intake',burden:0.1,value:0.7,act:'log.type',arg:'steps'}];
  }
});

/* ---------------- G. CARDIO ----------------
   Benefit against recovery cost against interference. The record holds duration; that supports volume and
   consistency, and nothing about intensity distribution, so nothing about intensity is claimed. */
function cardioState(){
  /* One source for cardio. The governance gate found cardioState and cardioSessions coexisting — two systems reading
     cardio separately, which is how they came to disagree 2.5-fold earlier. This summary now takes its sessions
     from cardioSessions, the richer record, and only summarises them. */
  var c2=null;try{c2=cardioSessions(28);}catch(e){}
  var s=(c2&&c2.status==='ok'?c2.rows:[]).map(function(r){return {date:r.date,value:r.minutes||0};});
  var mins=s.reduce(function(a,d){return a+(d.value||0);},0);
  if(!s.length)return {status:'insufficient',need:['cardio sessions logged'],
    headline:'no cardio on record',why:'Nothing here to weigh against its recovery cost.'};
  /* Weeks of CALENDAR, not weeks of cardio days. s holds only the days that had cardio, so s.length/7 made
     eleven sessions over four weeks read as 267 minutes and 7 sessions a week — about 2.5 times the truth.
     Unlike food, where an unlogged day is unknown intake, a day with no cardio logged is a day without cardio,
     so the calendar window is the right divisor here. It is capped at the length of the record, so a new
     person is not divided by weeks before they started. */
  var firstAny=(DB.observations||[]).reduce(function(m,o){return (!m||o.date<m)?o.date:m;},null);
  var span=firstAny?Math.min(28,Math.max(1,daysBetween(firstAny,asOf())+1)):28;
  var weeks=Math.max(1,span/7);
  var perWeek=mins/weeks;
  var sessions=s.filter(function(d){return (d.value||0)>0;}).length;
  var target=(activePhase()||{}).cardioMinutes||null;
  /* Interference is the question people actually have. Compared against the strength trend rather than
     asserted from the literature. */
  var strength=null;try{strength=strengthTrend();}catch(e){}
  return {status:'ok',cls:'MEASURED',days:span,daysWithCardio:s.length,minutesPerWeek:Math.round(perWeek),
    sessions:sessions,sessionsPerWeek:round(sessions/weeks,1),target:target,
    strengthDirection:strength&&strength.status==='ok'?strength.direction:null,
    confidence:s.length>=21?'medium':'low',
    headline:Math.round(perWeek)+' min/week over '+round(sessions/weeks,1)+' sessions',
    note:'Duration only. This record holds no heart rate or pace, so nothing here describes intensity and nothing should be read as describing it.'};
}
registerDomain({
  id:'cardio',label:'Cardio',priority:45,ontology:'CARDIO_MODALITIES',derives:true,knowledge:cardioKnowledge,
  actions:['nav.conditioning','log.type'],
  propose:function(st){
    if(st.status!=='ok')return [];
    var out=[];
    /* The cheapest lever first: move it off lifting days before cutting any of it. */
    try{
      var t=cardioTiming(90);
      if(t.sameDayAsLifting>0&&st.strengthDirection==='falling')
        out.push({verb:'Separate cardio from lifting days before cutting it',
          why:[t.sameDayAsLifting+' of '+t.cardioSessions+' cardio sessions fall on lifting days',
               'strength is falling, and same-day is the arrangement where interference is most plausible'],
          cls:'DERIVED',confidence:'low',priority:44,act:'nav.conditioning',
          reverseIf:['strength recovers with cardio unchanged, which would mean it was never the cardio']});
    }catch(e){}
    if(st.zonedShare!=null&&st.zonedShare<40)
      out.push({verb:'Record how hard your cardio actually is',
        why:[st.zonedShare+'% of sessions carry any intensity',
             'without it nothing here can distinguish easy volume from hard volume'],
        cls:'MEASURED',confidence:'high',priority:48,act:'log.type',arg:'cardio',
        reverseIf:[]});
    return out;
  },
  observes:['cardio'],
  state:cardioState,
  findings:function(st){
    if(st.status!=='ok')return [];
    var out=[];
    if(st.minutesPerWeek>240&&st.strengthDirection==='falling')
      out.push({text:'cardio is '+st.minutesPerWeek+' min/week while strength is falling \u2014 the timing is consistent with interference, and with several other things',
        cls:'DERIVED',confidence:'low',severity:'attention',
        basis:'volume against the strength trend; no intensity data, and no experiment'});
    if(st.target&&st.minutesPerWeek<st.target*0.6)
      out.push({text:'cardio is running at '+Math.round(100*st.minutesPerWeek/st.target)+'% of the planned minutes',
        cls:'MEASURED',confidence:'high',severity:'info',basis:'against the phase plan'});
    return out;
  },
  gaps:function(st){
    return [{question:'Is your cardio helping or costing you?',
      need:['intensity or heart rate, which this record does not hold','a period with cardio held constant while nothing else changes'],
      limits:'any claim about interference rather than coincidence',burden:0.6,value:0.4,act:'exp.design'}];
  }
});

/* ---------------- H. BODY COMPOSITION ----------------
   Triangulation across methods, and the reliability of each. The existing bodyComp() does the estimate; the
   domain adds the part that was missing: how the methods disagree and which one to believe. */
function compositionState(){
  var bc=null;try{bc=bodyComp();}catch(e){}
  if(!bc)return {status:'insufficient',need:['measurements'],headline:'no composition data'};
  var measured=obsOf('bodyfat');
  var methods={};
  measured.forEach(function(o){var m=o.method||'unspecified';(methods[m]=methods[m]||[]).push(o);});
  var names=Object.keys(methods);
  /* Where two methods overlap in time, the offset between them is measurable and worth stating: it is the
     difference between "I gained fat" and "I changed calipers". */
  var offsets=[];
  for(var i=0;i<names.length;i++)for(var j=i+1;j<names.length;j++){
    var a=methods[names[i]],b=methods[names[j]];
    var pairs=[];
    a.forEach(function(x){b.forEach(function(y){
      if(Math.abs(daysBetween(x.date,y.date))<=14)pairs.push(x.value-y.value);});});
    if(pairs.length)offsets.push({a:names[i],b:names[j],n:pairs.length,offset:round(mean(pairs),1)});
  }
  return {status:'ok',cls:bc.estimate&&bc.estimate.status==='ok'?'HEURISTIC':'MEASURED',
    measuredCount:measured.length,methods:names,offsets:offsets,
    hasEstimate:!!(bc.estimate&&bc.estimate.status==='ok'),
    anchored:!!bc.measured,
    confidence:measured.length>=3?'medium':'low',
    headline:measured.length?(measured.length+' measured reading'+(measured.length===1?'':'s')+
      ' across '+names.length+' method'+(names.length===1?'':'s')):'an estimate \u2014 not yet checked against a measurement',
    note:'Methods are not interchangeable. Comparing a caliper reading to a DXA reading measures the methods, not the body.'};
}
registerDomain({
  id:'composition',label:'Body composition',priority:50,ontology:'COMPOSITION_METHODS',derives:true,knowledge:compositionKnowledge,
  actions:['log.type','nav.mobility'],
  propose:function(st){
    if(st.status!=='ok')return [];
    var out=[];
    if(!st.anchored&&st.hasEstimate)
      out.push({verb:'Get one measured body-fat reading',
        why:['the composition figure is a circumference estimate with nothing to anchor it',
             'a single measured reading converts an equation into a calibrated estimate'],
        cls:'HEURISTIC',confidence:'medium',priority:52,act:'log.type',arg:'bodyfat',
        reverseIf:['you stop caring about the fat and lean split, which is a legitimate position']});
    if(st.methods.length>1&&!st.offsets.length)
      out.push({verb:'Take two methods within a fortnight of each other',
        why:[st.methods.length+' methods on record with no overlapping dates',
             'without an overlap they cannot be reconciled and comparing them measures the methods'],
        cls:'DERIVED',confidence:'high',priority:54,act:'log.type',arg:'bodyfat',reverseIf:[]});
    return out;
  },
  observes:['bodyfat','waist','neck','hip','chest','arm','thigh'],
  state:compositionState,
  findings:function(st){
    if(st.status!=='ok')return [];
    var out=[];
    st.offsets.forEach(function(o){
      if(Math.abs(o.offset)>=2)out.push({
        text:o.a+' reads '+fmtSigned(o.offset,1)+' points against '+o.b+' on overlapping dates',
        cls:'EMPIRICAL',confidence:o.n>=3?'medium':'low',severity:'info',
        basis:o.n+' overlapping pair'+(o.n===1?'':'s')+' \u2014 an offset to correct for, not a change in you'});
    });
    if(st.methods.length>1&&!st.offsets.length)out.push({
      text:st.methods.length+' measurement methods with no overlapping dates, so they cannot be reconciled',
      cls:'DERIVED',confidence:'high',severity:'attention',
      basis:'method comparison needs two readings close together in time'});
    if(!st.anchored&&st.hasEstimate)out.push({
      text:'the composition figure is a circumference estimate with nothing measured to anchor it',
      cls:'HEURISTIC',confidence:'high',severity:'info',basis:'no body-fat reading on record'});
    return out;
  },
  gaps:function(st){
    if(st.status==='ok'&&st.anchored&&st.offsets.length)return [];
    return [{question:'Which of your composition numbers should you believe?',
      need:st.methods&&st.methods.length>1?['two readings from different methods within a fortnight of each other']:['one measured body-fat reading'],
      limits:'separating fat change from lean change, and comparing across methods',
      burden:0.5,value:0.6,act:'log.type',arg:'bodyfat'}];
  }
});

/* ---------------- M. COST ----------------
   Economic state in the same decision architecture. A plan nobody can afford is not a better plan, and cost
   per gram of protein is the number that actually changes shopping behaviour. */
function costState(){
  var logs=_liveFoodLogs().filter(function(l){return l.date>=addDays(asOf(),-28);});
  var priced=logs.filter(function(l){return l.food&&l.food.pricePer100!=null;});
  if(!priced.length)return {status:'insufficient',need:['prices on the foods you log most'],
    headline:'no costs on record',
    why:'Cost enters the decision the same way calories do, but only for foods you have priced.',
    logged:logs.length};
  var total=0,protein=0,kcal=0;
  priced.forEach(function(l){
    var grams=l.grams||l.quantity||0;
    total+=(l.food.pricePer100*grams/100);
    protein+=((l.nutrients&&l.nutrients.protein)||0);
    kcal+=((l.nutrients&&l.nutrients.kcal)||0);
  });
  /* Distinct priced days, not daysBetween(priced[0].date, today)+1: the logs are newest-first, so that divisor
     was 1 and several days of spending were reported as one day's cost — the same defect as the absorption
     context, found by searching for the pattern after fixing that one. */
  var pd={};priced.forEach(function(l){pd[l.date]=1;});
  var days=Math.max(1,Object.keys(pd).length);
  var cc=null;try{cc=costConfidence();}catch(e){}
  return {status:'ok',cls:'MEASURED',pricedEntries:priced.length,totalEntries:logs.length,
    uncertaintyNote:cc?cc.note:null,
    coverage:round(100*priced.length/Math.max(1,logs.length),0),
    perDay:round(total/days,2),perProteinGram:protein?round(total/protein,4):null,
    perThousandKcal:kcal?round(total/(kcal/1000),2):null,
    confidence:priced.length>=30?'medium':'low',
    headline:fmtNum(total/days,2)+' per day across priced entries ('+round(100*priced.length/Math.max(1,logs.length),0)+'% of what you log)',
    note:'Only the entries you priced. Extrapolating from a fifth of your food would be a guess with a decimal point on it.'};
}
registerDomain({
  id:'cost',label:'Cost',priority:70,ontology:'COST_CATEGORIES',derives:true,knowledge:costKnowledge,
  actions:['nav.food','nav.substitute'],
  propose:function(st){
    if(st.status!=='ok')return [];
    var out=[];
    if(st.perProteinGram!=null&&st.coverage>=40)
      out.push({verb:'Check whether your protein could be cheaper',
        why:['protein is costing about '+fmtNum(st.perProteinGram*100,2)+' per 100 g',
             'a substitution in the same meal role often changes cost more than it changes the meal'],
        cls:'MEASURED',confidence:st.confidence,priority:72,act:'nav.substitute',
        reverseIf:['the cheaper option is one you will not eat, which makes it more expensive']});
    return out;
  },
  observes:['calories','protein'],
  state:costState,
  findings:function(st){
    if(st.status!=='ok')return [];
    var out=[];
    if(st.coverage<40)out.push({text:'only '+st.coverage+'% of logged food has a price, so any daily figure is partial',
      cls:'MEASURED',confidence:'high',severity:'info',basis:st.pricedEntries+' of '+st.totalEntries+' entries'});
    if(st.perProteinGram!=null)out.push({text:'protein is costing about '+fmtNum(st.perProteinGram*100,2)+' per 100 g',
      cls:'MEASURED',confidence:st.confidence,severity:'info',basis:'priced entries over 28 days'});
    return out;
  },
  gaps:function(st){
    return [{question:'What does your plan actually cost, and where is the protein cheapest?',
      need:st.status==='ok'?['prices on the rest of what you log regularly']:['prices on the foods you log most'],
      limits:'optimising a plan across cost as well as physiology',burden:0.4,value:0.3,act:'nav.food'}];
  }
});

/* ---------------- L. INVENTORY / CONSUMABLES ----------------
   Depletion forecasting from the rate you actually consume, not from a guess at how long a tub lasts. */
function inventoryState(){
  /* Removal is a dated fact: an item removed today was still present last month, and filtering on the bare
     flag erased it from every historical view. */
  var on=asOf();
  var inv=(DB.settings.inventory||[]).filter(function(i){
    if(i.createdAt&&localDateOf(i.createdAt)>on)return false;
    return !i.removedAt||localDateOf(i.removedAt)>on;
  });
  if(!inv.length)return {status:'insufficient',need:['items you want tracked'],
    headline:'nothing tracked',why:'Depletion is forecast from the rate you actually log, so an item needs to exist first.'};
  var rows=inv.map(function(i){
    /* Consumption rate from the log where the item is a food, otherwise from the stated daily dose. */
    var perDay=null,basis='';
    if(i.foodId){
      var used=_liveFoodLogs().filter(function(l){return l.food&&l.food.id===i.foodId&&l.date>=addDays(asOf(),-28);});
      /* Aggregate in the item's OWN basis. Summing `grams` assumed every food is gram-based, so an mL or
         serving item consumed daily totalled zero and its depletion forecast quietly never fired. */
      var itemBasis=i.unit||(used[0]&&used[0].basis)||'g';
      var total=used.reduce(function(a,l){
        if(itemBasis==='g'&&l.grams!=null)return a+l.grams;
        if(l.basis===itemBasis&&l.quantity!=null)return a+l.quantity;
        if(itemBasis==='g'&&l.basis==='ml'&&l.food&&l.food.density&&l.quantity!=null)return a+l.quantity*l.food.density;
        if(l.quantity!=null&&l.basis===itemBasis)return a+l.quantity;
        return a;
      },0);
      var counted=used.filter(function(l){
        return (itemBasis==='g'&&l.grams!=null)||(l.basis===itemBasis&&l.quantity!=null);}).length;
      if(counted>=3){perDay=total/28;basis=counted+' entries over 28 days, in '+itemBasis;}
      else if(used.length>=3)basis='logged '+used.length+' times, but not in '+itemBasis+' \u2014 no rate can be derived';
    }
    if(perDay==null&&i.perDay){perDay=num(i.perDay);basis='the dose you stated';}
    var daysLeft=(perDay&&perDay>0&&i.remaining!=null)?Math.floor(i.remaining/perDay):null;
    return {item:i,perDay:perDay!=null?round(perDay,1):null,basis:basis,
      daysLeft:daysLeft,runsOut:daysLeft!=null?addDays(todayISO(),daysLeft):null};
  });
  var soon=rows.filter(function(r){return r.daysLeft!=null&&r.daysLeft<=10;});
  var ic=null;try{ic=inventoryConfidence();}catch(e){}
  return {status:'ok',cls:'DERIVED',items:rows.length,rows:rows,soon:soon,
    uncertaintyNote:ic?ic.note:null,
    unknown:rows.filter(function(r){return r.perDay==null;}).length,
    confidence:'low',
    headline:rows.length+' tracked'+(soon.length?(' \u00b7 '+soon.length+' running low'):''),
    note:'Forecast from how fast you have actually been getting through it, which is only as good as the logging behind it.'};
}
function addInventoryItem(o){
  o=o||{};
  if(!o.label)return null;
  pushUndo('track an item');
  var rec={id:uid('inv'),label:String(o.label).slice(0,60),remaining:num(o.remaining),
    unit:String(o.unit||'g').slice(0,12),perDay:num(o.perDay),foodId:o.foodId||null,
    createdAt:nowISO(),removedAt:null};
  DB.settings.inventory=(DB.settings.inventory||[]).concat([rec]);
  emitEvent('inventory.changed',{op:'add',item:rec},{at:rec.createdAt});
  _memoInvalidate();save('inventory');
  return rec;
}
registerDomain({
  id:'inventory',label:'Supplies',priority:80,ontology:'INVENTORY_CATEGORIES',knowledge:inventoryKnowledge,
  /* Declaring a stage genuinely inapplicable, with the reason, rather than inventing a token experiment to
     satisfy a checklist. How fast a tub empties is arithmetic; there is no hypothesis to test. */
  experimentable:false,
  experimentableWhy:'depletion is arithmetic over a measured rate — there is no hypothesis about your body to test here, and a token experiment would be ceremony',

  actions:['nav.equipment'],
  propose:function(st){
    if(st.status!=='ok')return [];
    var out=[];
    try{
      var il=inventoryLifecycle();
      if(il.status==='ok'){
        if(il.reorderNow.length)out.push({verb:'Reorder '+il.reorderNow.join(', '),
          why:['these reach zero inside their own lead time'],
          cls:'DERIVED',confidence:'low',priority:82,act:'nav.equipment',reverseIf:[]});
        if(il.expiringFirst.length)out.push({verb:'Use up '+il.expiringFirst.join(', ')+' before buying more',
          why:['these expire before you will finish them','buying more is the wrong response to that'],
          cls:'DERIVED',confidence:'low',priority:81,act:'nav.equipment',reverseIf:[]});
      }
    }catch(e){}
    return out;
  },
  observes:['supplement'],
  state:inventoryState,
  findings:function(st){
    if(st.status!=='ok')return [];
    return st.soon.map(function(r){
      return {text:r.item.label+' runs out in about '+r.daysLeft+' day'+(r.daysLeft===1?'':'s'),
        cls:'DERIVED',confidence:'low',severity:'info',basis:r.basis||'stated rate'};
    });
  },
  gaps:function(st){
    if(st.status!=='ok')return [];
    if(!st.unknown)return [];
    return [{question:'How fast are you getting through '+st.unknown+' tracked item'+(st.unknown===1?'':'s')+'?',
      need:['either a daily amount, or logging the item so the rate can be measured'],
      limits:'any depletion forecast for those items',burden:0.2,value:0.2}];
  }
});

/* ---------------- K. EQUIPMENT ----------------
   Equipment determines which programs are possible at all, which is why it belongs in the loop rather than
   in a settings page: it is a constraint on every training proposal. */
/* The profile stores a SETTING ("commercial gym", "home gym"), not an equipment list, and the ontology
   speaks in implements ("barbell", "rack"). Comparing one against the other produced the worst kind of
   wrong answer: 26 movements declared impossible in a fully equipped gym. The setting is translated into
   the ontology's own vocabulary, and anything unrecognised is treated as unknown rather than as absent —
   claiming you lack equipment you never said you lacked is worse than saying nothing. */
var EQUIPMENT_SETTINGS={
  'commercial gym':['barbell','bench','rack','dumbbell','machine','cable','bodyweight','bar'],
  'full gym':['barbell','bench','rack','dumbbell','machine','cable','bodyweight','bar'],
  'gym':['barbell','bench','rack','dumbbell','machine','cable','bodyweight','bar'],
  'home gym':['barbell','bench','rack','dumbbell','bodyweight'],
  'home':['dumbbell','bodyweight'],
  'minimal':['bodyweight'],
  'bodyweight only':['bodyweight'],
  'dumbbells only':['dumbbell','bodyweight'],
  'barbell only':['barbell','rack','bench','bodyweight']
};
function resolvedEquipment(){
  var raw=DB.profile.equipment;
  var list=Array.isArray(raw)?raw:(raw?[raw]:[]);
  /* The expanded library's equipment too: without these, owning kettlebells or bands changed nothing. */
  var vocab={barbell:1,bench:1,rack:1,dumbbell:1,machine:1,cable:1,bodyweight:1,bar:1,band:1,kettlebell:1,trapbar:1,landmine:1,rings:1,sled:1,box:1,medball:1,smith:1,plate:1,wheel:1};
  var out={},recognised=false;
  list.forEach(function(item){
    var key=String(item||'').toLowerCase().trim();
    if(vocab[key]){out[key]=1;recognised=true;return;}
    var mapped=EQUIPMENT_SETTINGS[key];
    if(mapped){mapped.forEach(function(q){out[q]=1;});recognised=true;return;}
    /* A phrase containing a known implement still counts: "adjustable dumbbells" is dumbbells. */
    Object.keys(vocab).forEach(function(q){if(key.indexOf(q)>=0){out[q]=1;recognised=true;}});
  });
  return {have:Object.keys(out),recognised:recognised,raw:list};
}
function equipmentState(){
  var res=resolvedEquipment();
  var have=res.have;
  if(!res.raw.length)return {status:'insufficient',need:['what equipment you have'],
    headline:'equipment not recorded',
    why:'Without it, every training proposal assumes a full gym.'};
  if(!res.recognised)return {status:'unknown',cls:'MEASURED',raw:res.raw,have:[],impossible:[],
    headline:'equipment recorded as "'+esc(String(res.raw[0]).slice(0,32))+'", which does not map to known implements',
    confidence:'low',
    note:'Rather than guessing that you lack something, this says it cannot tell. Pick a setup in the plan editor to check the plan against it.',
    need:['a recognised setup, or the specific implements you have']};
  var p=trainingProgram();
  var impossible=[];
  Object.keys(p.templates||{}).forEach(function(t){
    (p.templates[t]||[]).forEach(function(row){
      var ex=null;try{ex=resolveExercise(row[0]);}catch(e){}
      if(!ex)return;
      var eq=Array.isArray(ex.equipment)?ex.equipment:(ex.equipment?[ex.equipment]:[]);
      if(eq.length&&!equipPossible(eq,have))impossible.push({exercise:row[0],needs:eq.join(' or '),template:t});
    });
  });
  return {status:'ok',cls:'MEASURED',have:have,impossible:impossible,resolvedFrom:res.raw,
    confidence:'high',
    headline:have.length+' item'+(have.length===1?'':'s')+
      (impossible.length?(' \u00b7 '+impossible.length+' planned movement'+(impossible.length===1?'':'s')+' you cannot do'):' \u00b7 the plan fits'),
    note:'Checked against the equipment each movement declares in the exercise ontology.'};
}
registerDomain({
  id:'equipment',label:'Equipment',priority:60,ontology:'IMPLEMENTS',knowledge:equipmentKnowledge,actions:['nav.equipment','nav.planEdit'],
  observes:['note'],
  state:equipmentState,
  findings:function(st){
    if(st.status!=='ok')return [];
    if(!st.impossible.length)return [];
    return [{text:st.impossible.length+' movement'+(st.impossible.length===1?'':'s')+
      ' in your plan need equipment you have not recorded ('+st.impossible.slice(0,3).map(function(i){return i.exercise;}).join(', ')+')',
      cls:'DERIVED',confidence:'high',severity:'attention',
      basis:'the plan against your recorded equipment',act:'nav.planEdit'}];
  },
  propose:function(st){
    if(st.status!=='ok'||!st.impossible.length)return [];
    return [{verb:'Adapt the plan to the equipment you actually have',
      why:[st.impossible.length+' planned movement(s) are not possible with what is recorded',
           'a plan you cannot perform produces adherence data about the plan rather than about you'],
      cls:'DERIVED',confidence:'high',priority:55,act:'nav.planEdit',
      reverseIf:['you record more equipment, or gain access to a fuller gym']}];
  },
  gaps:function(st){
    if(st.status==='ok')return [];
    return [{question:'What can you actually train with?',need:st.need||['your equipment'],
      limits:'every training recommendation, which otherwise assumes a full gym',
      burden:0.1,value:0.5,act:'profile.edit'}];
  }
});

/* ---------------- N. TIME / SCHEDULE ----------------
   The best plan and the best plan that fits a week are different objects. The record already knows which
   days sessions actually happen on, which is a better guide than what anyone intends. */
function scheduleState(){
  var sess=sessionsOf({from:addDays(asOf(),-56)});
  if(sess.length<6)return {status:'insufficient',need:[(6-sess.length)+' more logged sessions'],
    headline:'not enough sessions to see a pattern',
    why:'Which days you actually train is the only reliable guide to which days you can train.'};
  var byDay={};
  sess.forEach(function(s){
    var d=new Date(s.date+'T12:00:00Z').getUTCDay();
    var key=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d];
    byDay[key]=(byDay[key]||0)+1;
  });
  var p=trainingProgram();
  var planned=Object.keys(p.week||{});
  var actual=Object.keys(byDay).sort(function(a,b){return byDay[b]-byDay[a];});
  var mismatch=planned.filter(function(d){return !byDay[d]||byDay[d]<=1;});
  var unplanned=actual.filter(function(d){return !p.week[d]&&byDay[d]>=3;});
  return {status:'ok',cls:'MEASURED',sessions:sess.length,byDay:byDay,
    planned:planned,mismatch:mismatch,unplanned:unplanned,
    confidence:sess.length>=16?'medium':'low',
    headline:'you train most on '+actual.slice(0,3).join(', ')+
      (mismatch.length?(' \u00b7 '+mismatch.length+' planned day'+(mismatch.length===1?'':'s')+' rarely happen'):''),
    note:'From eight weeks of logged sessions. What you planned and what happened are reported separately rather than averaged.'};
}
registerDomain({
  id:'schedule',label:'Schedule',priority:65,ontology:'SCHEDULE_WINDOWS',derives:true,knowledge:scheduleKnowledge,actions:['nav.planEdit'],
  observes:['context'],
  state:scheduleState,
  findings:function(st){
    if(st.status!=='ok')return [];
    var out=[];
    if(st.mismatch.length)out.push({text:'planned sessions on '+st.mismatch.join(', ')+' rarely happen',
      cls:'MEASURED',confidence:st.confidence,severity:'attention',
      basis:st.sessions+' sessions over eight weeks',act:'nav.planEdit'});
    if(st.unplanned.length)out.push({text:'you train regularly on '+st.unplanned.join(', ')+', which the plan does not schedule',
      cls:'MEASURED',confidence:st.confidence,severity:'info',basis:'your own session log'});
    return out;
  },
  propose:function(st){
    if(st.status!=='ok'||(!st.mismatch.length&&!st.unplanned.length))return [];
    return [{verb:'Move the plan onto the days you actually train',
      why:[st.mismatch.length?('planned sessions on '+st.mismatch.join(', ')+' rarely happen'):'you train on days the plan does not schedule',
           'adherence measured against a schedule that never fitted describes the schedule, not you'],
      cls:'MEASURED',confidence:st.confidence,priority:58,act:'nav.planEdit',
      reverseIf:['your week changes','you start hitting the planned days']}];
  },
  gaps:function(st){
    if(st.status==='ok')return [];
    return [{question:'Which days can you realistically train?',need:st.need||['more logged sessions'],
      limits:'whether missed sessions come from the schedule or from something else about the plan',burden:0.2,value:0.4,act:'session.new'}];
  }
});
