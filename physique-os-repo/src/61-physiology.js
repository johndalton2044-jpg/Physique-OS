/* ============================================================================
   PHYSIOLOGY MODELS (maturity gaps named in the usage review and the work catalogues, P1.1\u2013P1.3).
   Each model states its method, evidence class, uncertainty and what would change it, and is registered in the canonical
   model registry, so it inherits contracts, infer(), provenance and the conformance gate. None is diagnostic.
   ============================================================================ */
function _ageSex(){var p=prof()||{};var age=p.age||(p.birthYear?(new Date().getFullYear()-p.birthYear):null);return {age:age,sex:(p.sex||'').toLowerCase()==='female'?'female':((p.sex||'').toLowerCase()==='male'?'male':null)};}
function _kgNow(){var w=obsOf('weight').slice(-1)[0];return w?w.value*0.45359237:null;}
function _dayValue(type,date){var r=seriesWindow(type,21).filter(function(d){return d.date===date;})[0];return r?r.value:0;}   /* one value per day, by the app's own precedence */
function _median(a){if(!a.length)return null;var s=a.slice().sort(function(x,y){return x-y;}),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;}

/* ---------- P1.1: intensity is labelled by what was actually measured; never invented from duration ---------- */
function cardioIntensityClass(r){
  if(!r)return {cls:'unknown',basis:'nothing'};
  if(r.watts!=null)return {cls:'known',basis:'power'};
  if(r.hr!=null)return {cls:'known',basis:'heart rate'+(r.pace!=null?' and pace':'')};
  if(r.pace!=null)return {cls:'proxy',basis:'pace only (external load, not the body\u2019s response)'};
  if(r.rpe!=null)return {cls:'proxy',basis:'perceived effort'};
  return {cls:'unknown',basis:'duration only \u2014 no intensity is inferred'};
}

/* ---------- P1.2: CARDIO FITNESS AS A LATENT STATE ----------
   Observation: a steady session with heart rate and pace/grade (walking, running) or power (cycling) gives the oxygen
   cost of the work (ACSM metabolic equations) and the heart-rate reserve used (Karvonen); since %HRR \u2248 %VO2R (Swain &
   Leutholtz 1997), VO2max \u2248 3.5 + (VO2 \u2212 3.5) / %HRR. Error of this method is roughly \u00b115%, more when maximum heart
   rate is age-predicted (Tanaka: 208 \u2212 0.7 \u00d7 age, SD \u2248 10 bpm). Excluded, with the reason: intervals (not steady),
   efforts under 40% or above 95% of reserve, sessions under 10 minutes, duration-only sessions, and swimming and rowing
   (no validated equation from these inputs). State: one Kalman filter PER MODALITY FAMILY \u2014 weight-bearing and cycling
   are never pooled (cycling VO2max runs ~10% below treadmill). Prior: FRIEND registry treadmill medians by age and sex
   (cycling \u00d7 0.9), SD 7. Process noise, and decay toward the prior after 14 days without that modality. Backtest:
   each observation is predicted before it is used. */
var FRIEND_VO2={male:[[29,48.0],[39,42.4],[49,37.8],[59,32.6],[69,28.2],[99,24.4]],female:[[29,37.6],[39,30.2],[49,26.7],[59,23.4],[69,20.0],[99,18.3]]};
function _vo2Prior(family){var a=_ageSex(),age=a.age||40,tab=FRIEND_VO2[a.sex||'male'],m=tab.filter(function(r){return age<=r[0];})[0][1];
  if(!a.sex)m=(m+FRIEND_VO2.female.filter(function(r){return age<=r[0];})[0][1])/2;return {mean:family==='cycling'?m*0.9:m,sd:7,basis:'FRIEND registry median for '+(a.sex||'an unspecified sex')+', age '+age+(a.age?'':' (assumed)')+(family==='cycling'?', cycling \u00d7 0.9':'')};}
function _modalityFamily(m){m=String(m||'').toLowerCase();if(/cycl|bike|spin/.test(m))return 'cycling';if(/walk|run|jog|hike|treadmill|incline|stair/.test(m))return 'weight-bearing';return null;}
function _restingHr(){var r=obsOf('rhr').slice(-14).map(function(o){return o.value;});return r.length>=3?{value:_median(r),n:r.length}:null;}
function _maxHr(){var s=DB.settings.hrMax||(prof()||{}).maxHr;if(s)return {value:+s,sd:3,basis:'measured'};var a=_ageSex();if(!a.age)return null;return {value:208-0.7*a.age,sd:10,basis:'age-predicted (Tanaka)'};}
/* THE STEADIEST 10 MINUTES of a workout, from per-second streams: whole-activity averages mix warm-up, stops and the
   cool-down into "average heart rate". Accepted when moving ≥ 95% of the window, speed varies < 8%, heart rate is
   present, and it drifts < 8 bpm across the window. A domain function: the adapter only translates. */
function cardioSteadySegment(st,unit){
  var T=st&&st.time&&st.time.data,V=st&&st.velocity_smooth&&st.velocity_smooth.data,H=st&&st.heartrate&&st.heartrate.data,G=st&&st.grade_smooth&&st.grade_smooth.data,M=st&&st.moving&&st.moving.data;
  if(!T||!V||!H||T.length<60)return null;var best=null,W=600;
  for(var i=0;i<T.length;i+=Math.max(1,Math.floor(T.length/300))){var j=i;while(j<T.length&&T[j]-T[i]<W)j++;if(j>=T.length)break;
    var idx=[];for(var k=i;k<j;k++)idx.push(k);var mov=M?idx.filter(function(k){return M[k];}).length/idx.length:1;if(mov<0.95)continue;
    var v=idx.map(function(k){return V[k];}),h=idx.map(function(k){return H[k];}).filter(function(x){return x>0;});if(h.length<idx.length*0.9)continue;
    var vm=mean(v);if(vm<0.5)continue;var cv=sd(v)/vm;if(cv>=0.08)continue;
    var q=Math.max(1,Math.floor(h.length/10)),drift=Math.abs(mean(h.slice(-q))-mean(h.slice(0,q)));if(drift>=8)continue;
    if(!best||cv<best.cv)best={cv:cv,i:i,j:j,v:vm,h:mean(h),g:G?mean(idx.map(function(k){return G[k]||0;})):null,drift:drift};}
  if(!best)return null;var perUnit=unit==='mi'?1609.34:1000;
  return {minutes:round((T[best.j]-T[best.i])/60,1),hr:Math.round(best.h),speedMs:round(best.v,2),pace:round(perUnit/best.v/60,2),paceUnit:'min per '+(unit==='mi'?'mi':'km'),
    grade:best.g!=null?round(best.g,1):null,speedCv:round(best.cv,3),hrDrift:round(best.drift,1),basis:'the steadiest 10 minutes of the workout, from per-second streams'};
}
function cardioFitnessObservation(r){
  /* a steady stretch from streams is a cleaner reading than the whole workout's averages */
  if(r&&r.steady&&r.steady.hr&&r.steady.pace){r=Object.assign({},r,{hr:r.steady.hr,pace:r.steady.pace,distanceUnit:/mi/.test(r.steady.paceUnit)?'mi':'km',grade:r.steady.grade!=null?r.steady.grade:r.grade,minutes:Math.max(r.minutes||0,r.steady.minutes),_steady:true});}
  var fam=_modalityFamily(r.modality);if(!fam)return {use:false,why:(r.modality||'this modality')+': no validated equation from these inputs'};
  if(/interval|hiit|sprint/i.test(String(r.modality)+' '+String(r.zone&&r.zone.zone||'')))return {use:false,why:'intervals are not steady-state (they inform conditioning capacity)'};
  if((r.minutes||0)<10)return {use:false,why:'under 10 minutes'};
  if(r.hr==null)return {use:false,why:'no heart rate: '+cardioIntensityClass(r).basis};
  var rest=_restingHr(),mx=_maxHr();if(!rest)return {use:false,why:'needs at least 3 resting heart rate readings'};if(!mx)return {use:false,why:'needs age, or a measured maximum heart rate'};
  var hrr=(r.hr-rest.value)/(mx.value-rest.value);if(!(hrr>=0.4&&hrr<=0.95))return {use:false,why:'effort at '+Math.round(hrr*100)+'% of heart-rate reserve (outside 40\u201395%)'};
  var vo2=null,kg=_kgNow();
  if(fam==='cycling'){if(r.watts==null||!kg)return {use:false,why:'cycling needs power and body weight'};vo2=10.8*r.watts/kg+7;}
  else{if(r.pace==null)return {use:false,why:'needs pace (or distance)'};var mPerMin=(r.distanceUnit==='km'?1000:1609.34)/r.pace,g=(r.grade||0)/100,run=mPerMin>134;
    vo2=run?(3.5+0.2*mPerMin+0.9*mPerMin*g):(3.5+0.1*mPerMin+1.8*mPerMin*g);}
  var est=3.5+(vo2-3.5)/hrr,sd=Math.sqrt(Math.pow(0.15*est,2)+Math.pow(est*(mx.sd/(mx.value-rest.value)),2));
  return {use:true,family:fam,date:r.date,estimate:round(est,1),sd:round(sd,1),hrr:round(hrr,2),method:(fam==='cycling'?'ACSM cycling (power)':'ACSM '+(run?'running':'walking')+' (pace, grade)')+' + %HRR; max HR '+mx.basis+(r._steady?'; the steadiest 10 minutes from streams':'')};
}
function cardioFitnessModel(){
  var cs=cardioSessions(84);var rows=cs&&cs.rows?cs.rows:[];var classes={known:0,proxy:0,unknown:0},excluded=[],obs={};
  rows.forEach(function(r){classes[cardioIntensityClass(r).cls]++;var o=cardioFitnessObservation(r);if(!o.use){excluded.push({date:r.date,modality:r.modality,why:o.why});return;}(obs[o.family]=obs[o.family]||[]).push(o);});
  var fams=Object.keys(obs);
  if(!fams.length){var legacy=typeof cardioFitnessState==='function'?cardioFitnessState():null;
    return {status:'insufficient',cls:'EMPIRICAL',classes:classes,excluded:excluded.slice(-6),need:['steady sessions of 10+ minutes with average heart rate and pace or power','3 resting heart rate readings','your age, or a measured maximum heart rate'],
      restingHrProxy:legacy&&legacy.status==='ok'?legacy:null,note:'Cardio minutes are a dose, not a capacity: without heart rate and pace or power there is nothing to estimate fitness from.'};}
  var states=fams.map(function(f){var pr=_vo2Prior(f),m=pr.mean,P=pr.sd*pr.sd,q=0.02,last=null,bt=[];
    obs[f].sort(function(a,b){return a.date<b.date?-1:1;}).forEach(function(o){
      if(last){var gap=daysBetween(last,o.date);P+=q*gap;if(gap>14){var lam=Math.log(2)/90*(gap-14);m=pr.mean+(m-pr.mean)*Math.exp(-lam);}}
      var R=o.sd*o.sd,S=P+R,z=(o.estimate-m)/Math.sqrt(S);bt.push({err:Math.abs(o.estimate-m),within80:Math.abs(z)<=1.2816});
      var K=P/S;m=m+K*(o.estimate-m);P=(1-K)*P;last=o.date;});
    var idle=last?daysBetween(last,todayISO()):0;if(idle>0){P+=q*idle;if(idle>14)m=pr.mean+(m-pr.mean)*Math.exp(-Math.log(2)/90*(idle-14));}
    var sd=Math.sqrt(P),n=obs[f].length,cov=bt.length?bt.filter(function(b){return b.within80;}).length/bt.length:null;
    return {family:f,estimate:round(m,1),sd:round(sd,1),ci80:[round(m-1.2816*sd,1),round(m+1.2816*sd,1)],n:n,lastDate:last,daysSince:idle,decaying:idle>14,prior:pr,
      backtest:{n:bt.length,mae:bt.length?round(bt.reduce(function(a,b){return a+b.err;},0)/bt.length,1):null,coverage80:cov!=null?round(cov,2):null,
        verdict:bt.length<6?'too few observations to judge the model':(cov>=0.65&&cov<=0.95?'intervals are calibrated':'intervals are '+(cov<0.65?'too narrow':'too wide'))}};});
  var head=states.slice().sort(function(a,b){return b.n-a.n;})[0];
  return {status:'ok',cls:'EMPIRICAL',unit:'ml/kg/min (VO2max)',states:states,headline:head,classes:classes,excluded:excluded.slice(-6),
    note:'Estimated separately per modality: '+states.map(function(s){return s.family;}).join(' and ')+'. Walking or running and cycling are not compared with each other.',
    wouldChange:'A laboratory VO2max test or a measured maximum heart rate would narrow this more than anything else.'};
}

/* ---------- P1.3 is conditioningCapacityState (separate from fitness, as specified). ---------- */

/* ---------- HYDRATION BALANCE ----------
   Intake: logged water, plus water in food: about 0.3 ml per kcal (food supplies ~20% of total water in mixed diets,
   EFSA). The first version used 1 ml/kcal — that is the total water REQUIREMENT per kcal spent, not food's water content. Need: EFSA adequate
   total water (2.5 L men, 2.0 L women, 2.25 L unspecified) plus sweat: a base rate rising with exercise intensity
   (\u2248 0.4 L/h at 4 MET, +0.08 L/h per MET) and with heat (+3% per \u00b0C above 20 \u00b0C, from the weather at that hour when
   known). A contextual signal, not a measurement of body water; uncertainty \u00b10.8 L/day. */
function hydrationBalance(date){
  date=date||todayISO();var water=_dayValue('water',date),kcal=_dayValue('calories',date);
  var a=_ageSex(),need=a.sex==='female'?2.0:(a.sex==='male'?2.5:2.25),sweat=0,notes=[];
  var cs=cardioSessions(2);(cs&&cs.rows||[]).filter(function(r){return r.date===date;}).forEach(function(r){var met=(normaliseCardioSession(r).abs||{}).met||(typeof CARDIO_MET_TABLE!=='undefined'&&CARDIO_MET_TABLE[r.modality])||5;
    var t=null;try{var wx=typeof weatherContextAt==='function'?weatherContextAt(date+'T12'):null;t=wx&&wx.temperature;}catch(e){}
    var rate=Math.max(0.2,0.4+0.08*(met-4))*(t!=null&&t>20?1+0.03*(t-20):1);sweat+=rate*(r.minutes||0)/60;if(t!=null)notes.push('session at '+Math.round(t)+' \u00b0C');});
  if(!water&&!kcal)return {status:'insufficient',need:['water intake','food logged'],cls:'HEURISTIC',note:'Nothing logged for '+date+'.'};
  var food=kcal?kcal*0.3/1000:null,intake=water+(food||0),total=need+sweat,bal=intake-total;
  return {status:'ok',cls:'HEURISTIC',date:date,intakeL:round(intake,2),fromDrinksL:round(water,2),fromFoodL:food!=null?round(food,2):null,needL:round(total,2),sweatL:round(sweat,2),balanceL:round(bal,2),sd:0.8,
    verdict:water===0?'no drinks logged \u2014 the balance only counts food':(bal<-0.8?'probably under your needs today':(bal>0.8?'above your estimated needs':'within the uncertainty of your needs')),
    notes:notes,method:'EFSA adequate intake + sweat by intensity and heat; food water \u2248 0.3 ml/kcal',limits:'Contextual, not a measure of body water; thirst and urine colour are better guides day to day.'};
}

/* ---------- SUPPLEMENT PERSONAL EFFICACY (N-of-1) ----------
   For a supplement logged on some days and not others, the outcome it plausibly moves is compared on-days vs off-days,
   with the outcome's trend removed first and a placebo check (the same comparison shifted a week): the tests the
   association engine uses. At least 10 on-days and 10 off-days; unblinded, so expectation effects remain. */
var SUPPLEMENT_OUTCOMES={creatine:['weight','scale water weight (creatine draws water into muscle)'],caffeine:['hunger','appetite'],melatonin:['sleep','sleep duration'],magnesium:['sleep','sleep duration'],
  'fish oil':[null,'no outcome this app measures would show it'],'vitamin d':[null,'no outcome this app measures would show it'],protein:['hunger','appetite'],electrolytes:['weight','scale weight']};
function supplementEfficacy(){
  var sup=DB.observations.filter(function(o){return o.type==='supplement'&&!o.retracted;});if(!sup.length)return {status:'insufficient',cls:'EMPIRICAL',need:['supplements logged on the days you take them'],note:'No supplements are logged.'};
  /* resolved through the catalogue, so "creatine 5 g", "Creatine monohydrate 5 g" and a structured log are one supplement */
  var names={},labels={};supplementIntakes('0000-01-01',todayISO()).forEach(function(x){var k=x.id||String(x.text||'supplement').toLowerCase().trim();labels[k]=x.id?SUPPLEMENT_CATALOGUE[x.id].label:k;(names[k]=names[k]||{})[x.date]=1;});
  var out=Object.keys(names).map(function(k){var cat=typeof SUPPLEMENT_CATALOGUE!=='undefined'?SUPPLEMENT_CATALOGUE[k]:null,map=cat?null:Object.keys(SUPPLEMENT_OUTCOMES).filter(function(s){return k.indexOf(s)>=0;})[0],
      oc=cat?(cat.test||[null,'no outcome this app measures would show it']):(map?SUPPLEMENT_OUTCOMES[map]:[null,'no known outcome to test']);var _lab=labels[k]||k;
    if(!oc[0])return {name:_lab,status:'not testable',why:oc[1]};
    var ser=typeof _detrended==='function'?_detrended(seriesWindow(oc[0],60)):seriesWindow(oc[0],60),on=[],off=[];ser.forEach(function(d){(names[k][d.date]?on:off).push(d.value);});
    if(on.length<10||off.length<10)return {name:_lab,status:'insufficient',outcome:oc[1],have:{on:on.length,off:off.length},need:'10 days on and 10 off within 60 days'};
    var diff=mean(on)-mean(off),se=Math.sqrt(sd(on)*sd(on)/on.length+sd(off)*sd(off)/off.length);
    var shifted=ser.map(function(d){return {date:d.date,value:d.value,on:!!names[k][addDays(d.date,7)]};}),pOn=shifted.filter(function(d){return d.on;}).map(function(d){return d.value;}),pOff=shifted.filter(function(d){return !d.on;}).map(function(d){return d.value;});
    var placebo=pOn.length>=5&&pOff.length>=5?mean(pOn)-mean(pOff):null,clear=Math.abs(diff)>2*se,passes=placebo==null||Math.abs(placebo)<=Math.abs(diff)/2;
    return {name:_lab,status:'ok',outcome:oc[1],difference:round(diff,2),se:round(se,2),placebo:placebo!=null?round(placebo,2):null,
      verdict:!clear?'no clear personal effect':(passes?'a personal effect, clear of noise and the placebo check':'a difference, but it does not survive the placebo check'),n:{on:on.length,off:off.length}};});
  return {status:'ok',cls:'EMPIRICAL',supplements:out,limits:'Unblinded N-of-1: expectation, timing and other changes can all look like an effect.'};
}

/* ---------- ENERGY AVAILABILITY (Loucks) ----------
   EA = (energy intake \u2212 exercise energy expenditure) / fat-free mass, per day, averaged over 7 days. Exercise energy:
   cardio at its MET (net of resting) and lifting at ~5 MET. Fat-free mass needs a body-fat reading: without one EA is
   refused, not guessed. Thresholds (kcal/kg FFM/day): < 30 low, 30\u201345 reduced, \u2265 45 adequate. Not a diagnosis. */
function energyAvailability(){
  var bf=obsOf('bodyfat').slice(-1)[0],kg=_kgNow();
  if(!kg)return {status:'insufficient',cls:'DERIVED',need:['weight']};
  if(!bf)return {status:'insufficient',cls:'DERIVED',need:['a body-fat reading'],note:'Energy availability is per kilogram of fat-free mass; without body fat it would be a guess.'};
  var ffm=kg*(1-bf.value/100),days=[];
  for(var i=1;i<=7;i++){var d=addDays(todayISO(),-i),ei=_dayValue('calories',d);if(!ei)continue;
    var eee=0;(cardioSessions(10).rows||[]).filter(function(r){return r.date===d;}).forEach(function(r){var met=(normaliseCardioSession(r).abs||{}).met||5;eee+=(met-1)*3.5*kg/200*(r.minutes||0);});
    (DB.sessions||[]).filter(function(s){return s.date===d;}).forEach(function(s){eee+=(5-1)*3.5*kg/200*(s.durationMin||45);});
    days.push({date:d,ei:ei,eee:round(eee,0),ea:(ei-eee)/ffm});}
  if(days.length<4)return {status:'insufficient',cls:'DERIVED',need:[(4-days.length)+' more days of logged intake this week']};
  var ea=mean(days.map(function(x){return x.ea;})),sdv=Math.sqrt(Math.pow(0.1*ea,2)+Math.pow(ea*0.05,2));
  return {status:'ok',cls:'DERIVED',ea:round(ea,1),sd:round(sdv,1),unit:'kcal per kg fat-free mass per day',ffmKg:round(ffm,1),days:days,
    band:ea<30?'low':(ea<45?'reduced':'adequate'),note:ea<30?'Low energy availability: sustained, it is linked to hormonal and bone effects. Worth discussing with a clinician if it persists.':(ea<45?'Reduced: common in a deliberate deficit; watch recovery and performance.':'Adequate for normal physiological function.'),
    method:'Loucks: (intake \u2212 exercise energy) / fat-free mass; exercise by MET; body fat from your latest reading',limits:'Not a diagnosis; logged intake and exercise estimates both carry error.'};
}

/* ---------- FOOD DIGESTIBILITY AND PROTEIN QUALITY ----------
   Protein quality by food group (DIAAS-style values after FAO 2013; truncated at 1.0 for scoring), and metabolisable
   energy corrections where Atwater factors overstate it (whole nuts \u2248 \u221220%, high-fibre foods: fibre counted at
   2 kcal/g). Groups come from food names; a food that matches no group is counted at 0.75 and said to be uncertain. */
var PROTEIN_QUALITY=[[/whey|casein|milk|yogh?urt|cheese|skyr|quark/i,1.0,'dairy'],[/egg/i,1.0,'egg'],[/beef|pork|lamb|chicken|turkey|fish|salmon|tuna|cod|shrimp|steak|mince|ham|bacon/i,1.0,'meat or fish'],
  [/soy|tofu|tempeh|edamame/i,0.9,'soy'],[/pea protein/i,0.82,'pea protein'],[/bean|lentil|chickpea|pea\b/i,0.65,'legumes'],[/oat|rice|wheat|bread|pasta|cereal|corn|barley/i,0.5,'grains'],
  [/almond|walnut|peanut|cashew|nut\b|nuts|seed/i,0.45,'nuts and seeds']];
function _foodGroup(name){for(var i=0;i<PROTEIN_QUALITY.length;i++)if(PROTEIN_QUALITY[i][0].test(name))return {q:PROTEIN_QUALITY[i][1],group:PROTEIN_QUALITY[i][2]};return {q:0.75,group:'unclassified'};}
function dietDigestibility(date){
  date=date||todayISO();var L=foodLogsOn(date);   /* the Food screen's entries, with their precomputed nutrients */
  if(!L.length)return {status:'insufficient',cls:'PRIOR',need:['food logged with individual foods']};
  var prot=0,dig=0,kcal=0,adj=0,groups={},unk=0;
  L.forEach(function(e){var f=e.food||{},n=e.nutrients||{},p=n.protein||0,k=n.kcal||0,fib=n.fiber||0,nm=String(f.name||e.name||'');
    var g=_foodGroup(nm);if(g.group==='unclassified')unk++;prot+=p;dig+=p*g.q;kcal+=k;groups[g.group]=(groups[g.group]||0)+p;
    if(/almond|walnut|peanut|cashew|pistachio|nuts\b/i.test(nm))adj-=0.2*k;adj-=2*fib;});
  return {status:'ok',cls:'PRIOR',date:date,proteinG:round(prot,0),digestibleProteinG:round(dig,0),proteinQuality:prot?round(dig/prot,2):null,proteinByGroup:groups,
    kcal:round(kcal,0),metabolisableAdjustmentKcal:round(adj,0),unclassifiedFoods:unk,
    method:'protein quality by food group after FAO 2013 (DIAAS, truncated at 1.0); nuts \u221220% energy; fibre at 2 kcal/g',
    limits:'Group values, not measurements of these foods; unclassified foods count at 0.75.'};
}

/* RECOVERY RESOURCE ALLOCATION is recoveryAllocation() in 89-remaining.js (registered below). */

/* ---------- MOTOR LEARNING: a learning curve per lift ----------
   Practice count against performance: early sessions improve fast and vary more; a slowing rate with falling variability
   marks refinement, then consolidation. Rate from a log-log fit of e1RM gain against session number (the power law of
   practice); variability as the coefficient of variation of e1RM residuals, early half vs late half. */
function exerciseLearningCurve(exercise){
  var s=(DB.sessions||[]).slice().sort(function(a,b){return a.date<b.date?-1:1;}),pts=[];
  s.forEach(function(x){var best=(x.sets||[]).filter(function(t){return t.exercise===exercise&&t.reps>0&&(t.load||t.weight)>0;}).map(function(t){return (t.load||t.weight)*(1+t.reps/30);});if(best.length)pts.push(Math.max.apply(null,best));});
  if(pts.length<8)return {status:'insufficient',exercise:exercise,need:[(8-pts.length)+' more sessions of '+exercise]};
  var gain=pts.map(function(p){return p-pts[0]+1;}),xs=pts.map(function(_,i){return Math.log(i+1);}),ys=gain.map(function(g){return Math.log(Math.max(1,g));}),xm=mean(xs),ym=mean(ys);
  var b=xs.reduce(function(a,x,i){return a+(x-xm)*(ys[i]-ym);},0)/Math.max(1e-9,xs.reduce(function(a,x){return a+(x-xm)*(x-xm);},0));
  var half=Math.floor(pts.length/2),cv=function(a){var m=mean(a);return m?sd(a)/m:0;},resid=function(a){var t=a.map(function(v,i){return v-(a[0]+(a[a.length-1]-a[0])*i/Math.max(1,a.length-1));});return t;};
  var early=cv(pts.slice(0,half).map(function(v,i,a){return v+resid(a)[i]*0;})),late=cv(pts.slice(half));
  var recent=(pts[pts.length-1]-pts[Math.max(0,pts.length-5)])/Math.max(1,pts[Math.max(0,pts.length-5)]);
  var stage=recent>0.05&&early>late?'acquisition':(recent>0.01?'refinement':'consolidation');
  return {status:'ok',cls:'DERIVED',exercise:exercise,sessions:pts.length,learningRate:round(b,2),variabilityEarly:round(early,3),variabilityLate:round(late,3),recentGain:round(recent*100,1),stage:stage,
    method:'power law of practice (log-log fit of e1RM gain on session number) and early vs late variability',limits:'Load lifted stands in for skill; technique itself is not measured.'};
}

/* ---------- VISUAL PROGRESS: comparisons are only as good as their conditions ----------
   Two photos are comparable when the view, lighting and framing match. Computer-vision diagnosis (body fat or shape from
   an image) is not done: no validated model runs within this app's privacy design, where images never leave the device,
   and an unvalidated estimate would be worse than none. */
function photoComparisonValidity(a,b){
  if(!a||!b)return {status:'insufficient',need:['two photos']};var issues=[];
  if(a.view!==b.view)issues.push('different views ('+a.view+' vs '+b.view+')');
  if(a.lighting&&b.lighting&&a.lighting!==b.lighting)issues.push('different lighting');
  var ta=String(a.at||'').slice(11,13),tb=String(b.at||'').slice(11,13);if(ta&&tb&&Math.abs(+ta-+tb)>4)issues.push('taken at different times of day (hydration and food change the look)');
  return {status:'ok',comparable:!issues.length,issues:issues,note:issues.length?'Differences may come from conditions, not change.':'Same view and conditions: a fair visual comparison.',
    limits:'Visual comparison only. No body-fat or shape estimate is made from images.'};
}

/* ---- registration in the canonical model registry (each inherits contracts, infer(), provenance, the gate) ---- */
(function(){if(typeof MODELS==='undefined')return;[
  {id:'cardio_fitness_latent',name:'Cardio fitness (latent state)',cls:'EMPIRICAL',version:'1.0',inputs:['cardio','rhr','weight'],minN:1,assumes:['%HRR tracks %VO2 reserve in steady exercise','ACSM equations hold for the modality'],failsWhen:['intervals','beta blockers or other heart-rate modifiers','no heart rate'],output:'VO2max per modality family, with uncertainty',consumers:['physiologySummary'],freshnessDays:28,uncertainty:{kind:'kalman posterior'},fn:'cardioFitnessModel'},
  {id:'hydration_balance',name:'Hydration balance',cls:'HEURISTIC',version:'1.0',inputs:['water','calories','cardio'],minN:1,assumes:['EFSA adequate intake','sweat scales with intensity and heat'],failsWhen:['very hot or humid climates beyond the scaling','illness'],output:'daily water balance (L)',consumers:['physiologySummary'],freshnessDays:1,uncertainty:{kind:'fixed',sd:0.8},fn:'hydrationBalance'},
  {id:'supplement_efficacy',name:'Supplement personal efficacy',cls:'EMPIRICAL',version:'1.0',inputs:['supplement'],minN:20,assumes:['on and off days otherwise comparable'],failsWhen:['unblinded expectation','supplements with slow effects'],output:'on-vs-off difference per supplement',consumers:['physiologySummary'],freshnessDays:60,uncertainty:{kind:'standard error'},fn:'supplementEfficacy'},
  {id:'energy_availability',name:'Energy availability',cls:'DERIVED',version:'1.0',inputs:['calories','weight','bodyfat','cardio'],minN:4,assumes:['logged intake is complete','MET estimates of exercise'],failsWhen:['no body-fat reading'],output:'kcal per kg fat-free mass per day',consumers:['physiologySummary'],freshnessDays:7,uncertainty:{kind:'propagated'},fn:'energyAvailability'},
  {id:'diet_digestibility',name:'Protein quality and digestibility',cls:'PRIOR',version:'1.0',inputs:['calories'],minN:1,assumes:['food-group values represent these foods'],failsWhen:['unclassified foods'],output:'digestible protein (g) and energy adjustment',consumers:['physiologySummary'],freshnessDays:1,uncertainty:{kind:'group values'},fn:'dietDigestibility'},
  {id:'recovery_allocation',name:'Recovery resource allocation',cls:'HEURISTIC',version:'1.0',inputs:['sleep','steps','cardio'],minN:7,assumes:['relative costs of lifting, cardio and steps'],failsWhen:['illness','unlogged training'],output:'weekly recovery budget and its split',consumers:['physiologySummary'],freshnessDays:7,uncertainty:{kind:'relative units'},fn:'recoveryAllocation'}
].forEach(function(m){if(!MODELS.some(function(x){return x.id===m.id;}))MODELS.push(m);});})();
