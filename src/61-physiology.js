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
/* AEROBIC-CAPACITY TREND (Stage D; TRANSITION item 3). The filter below gives the level; this gives its direction: a
   weighted regression of each session's VO2max estimate on time (weights 1/sd\u00b2, the scatter beyond those errors
   inflating the standard error), in ml/kg/min a month, with a prior centred on no change (SD 1.5 a month), because
   fitness moves slowly: a training block raises VO2max by a few ml/kg/min over two to three months in someone who was
   untrained (Milanovi\u0107 et al. 2015, meta-analysis). At least four sessions spanning three weeks. Observations are
   {date, estimate, sd}, one modality family at a time, never mixed. */
var VO2_TREND_PRIOR={mean:0,sd:1.5,source:'endurance training raises VO2max by a few ml/kg/min over two to three months in untrained people (Milanovi\u0107 et al. 2015)'};
function vo2Trend(obs){
  obs=(obs||[]).filter(function(o){return o&&o.estimate!=null&&o.sd>0;}).sort(function(a,b){return a.date<b.date?-1:1;});
  if(obs.length<4)return {status:'insufficient',need:'4 sessions with heart rate and pace or power',n:obs.length};
  var t0=obs[0].date,xs=obs.map(function(o){return daysBetween(t0,o.date)/30;});if((xs[xs.length-1]-xs[0])*30<21)return {status:'insufficient',need:'sessions spread over at least three weeks',n:obs.length};
  var W=0,mx=0,my=0;obs.forEach(function(o,i){var w=1/(o.sd*o.sd);W+=w;mx+=w*xs[i];my+=w*o.estimate;});mx/=W;my/=W;
  var sxx=0,sxy=0;obs.forEach(function(o,i){var w=1/(o.sd*o.sd);sxx+=w*(xs[i]-mx)*(xs[i]-mx);sxy+=w*(xs[i]-mx)*(o.estimate-my);});
  var b=sxy/sxx,chi=0;obs.forEach(function(o,i){var e=o.estimate-my-b*(xs[i]-mx);chi+=e*e/(o.sd*o.sd);});
  var se=Math.sqrt(Math.max(1,chi/(obs.length-2))/sxx),pv=VO2_TREND_PRIOR.sd*VO2_TREND_PRIOR.sd,vp=1/(1/pv+1/(se*se)),mp=vp*(VO2_TREND_PRIOR.mean/pv+b/(se*se)),pw=Math.max(0,Math.min(1,1-vp/pv));
  var sdp=Math.sqrt(vp),lo=mp-2*sdp,hi=mp+2*sdp;
  return {status:'ok',perMonth:round(mp,2),sd:round(sdp,2),interval:[round(lo,2),round(hi,2)],personalWeight:round(pw,2),n:obs.length,
    reading:pw<0.2?'not enough sessions yet to see a direction; fitness is assumed steady':(lo>0?'rising, about '+round(mp,1)+' ml/kg/min a month':(hi<0?'falling, about '+round(-mp,1)+' ml/kg/min a month':'no clear change'))};
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
      var R=o.sd*o.sd,S=P+R,z=(o.estimate-m)/Math.sqrt(S);bt.push({err:Math.abs(o.estimate-m),within80:Math.abs(z)<=1.2816,at:o.date,ratio:Math.abs(z)});
      var K=P/S;m=m+K*(o.estimate-m);P=(1-K)*P;last=o.date;});
    var idle=last?daysBetween(last,todayISO()):0;if(idle>0){P+=q*idle;if(idle>14)m=pr.mean+(m-pr.mean)*Math.exp(-Math.log(2)/90*(idle-14));}
    var sd0=Math.sqrt(P),n=obs[f].length,cov=bt.length?bt.filter(function(b){return b.within80;}).length/bt.length:null;
    /* self-calibration (Stage H): the interval widened or narrowed by the factor its own one-step-ahead record supports,
       once it has ten scored predictions (intervalCalibration, the competition's rule) */
    var IC=intervalCalibration(bt),k=IC.n>=CALIBRATION_MIN_N?IC.scale:1,sd=sd0*k;
    return {family:f,estimate:round(m,1),sd:round(sd,1),ci80:[round(m-1.2816*sd,1),round(m+1.2816*sd,1)],n:n,lastDate:last,daysSince:idle,decaying:idle>14,prior:pr,trend:vo2Trend(obs[f]),
      calibration:{n:IC.n,scale:round(k,2),calibratedCoverage:IC.calibratedCoverage!=null?round(IC.calibratedCoverage,2):null,applied:IC.n>=CALIBRATION_MIN_N},scored:bt.map(function(b){return {at:b.at,ratio:b.ratio};}),
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
/* HYDRATION, matured. Intake: drinks logged as water, plus the water in what was eaten and drunk as food, from each food's
   own water content (FoodData Central carries it; entries without it fall back to 0.3 ml/kcal). Needs: EFSA's adequate
   intake of total water (2.5 L men, 2.0 L women), plus sweat: each session by intensity, scaled by the weather at the
   time (temperature above 20 \u00b0C, humidity above 60%), or by the person's own sweat rate from a sweat test. Sodium lost
   in sweat (about 0.9 g/L) is set against what was eaten. Status: urine colour, and a morning weight drop of more than
   1% after a heavy-sweat day. */
function _foodWaterL(date){var L=foodLogsOn(date),ml=0,estimated=0;L.forEach(function(l){var per=(l.food&&l.food.per100)||{},q=l.quantity!=null?l.quantity:(l.grams||0);
    if(per.water!=null&&(l.basis==='g'||l.basis==='ml'))ml+=per.water*q/100;else{var k=(l.nutrients||{}).kcal||0;ml+=0.3*k;estimated+=0.3*k;}});
  return {litres:ml/1000,estimatedShare:ml?estimated/ml:0,items:L.length};}
function personalSweatRate(modality){var S=obsOf('sweatrate').filter(function(o){return !modality||o.method===modality||!o.method;}).slice(-5);return S.length?{rate:mean(S.map(function(o){return o.value;})),n:S.length}:null;}
function hydrationModel(date){
  date=date||todayISO();var water=_dayValue('water',date)||0,fw=_foodWaterL(date),a=_ageSex(),base=a.sex==='female'?2.0:(a.sex==='male'?2.5:2.25),sweat=0,sessions=[],sodiumLoss=0;
  var add=function(minutes,met,modality,at){var wx=null;try{wx=typeof weatherContextAt==='function'?weatherContextAt(at||date+'T12'):null;}catch(e){}var t=wx&&wx.temperature,h=wx&&wx.humidity;
    var own=personalSweatRate(modality),rate=own?own.rate:Math.max(0.2,0.4+0.08*((met||5)-4));
    var heat=(t!=null&&t>20?1+0.03*(t-20):1)*(h!=null&&h>60?1+0.005*(h-60):1),L=rate*heat*(minutes||0)/60;sweat+=L;sodiumLoss+=L*0.9;
    sessions.push({modality:modality,minutes:minutes,litres:round(L,2),basis:own?'your sweat rate ('+round(own.rate,2)+' L/h from '+own.n+' test'+(own.n===1?'':'s')+')':'estimated from intensity',weather:t!=null?Math.round(t)+' \u00b0C'+(h!=null?', '+Math.round(h)+'% humidity':''):null});};
  var cs=cardioSessions(2);(cs&&cs.rows||[]).filter(function(r){return r.date===date;}).forEach(function(r){var met=(normaliseCardioSession(r).abs||{}).met||(typeof CARDIO_MET_TABLE!=='undefined'&&CARDIO_MET_TABLE[r.modality])||5;add(r.minutes,met,r.modality);});
  (DB.sessions||[]).filter(function(x){return x.date===date&&!x.retracted;}).forEach(function(x){add(x.durationMin||Math.max(30,(x.sets||[]).length*3),5,'lifting');});
  if(!water&&!fw.items)return {status:'insufficient',cls:'HEURISTIC',need:['drinks or food logged'],note:'Nothing logged for '+date+'.'};
  var intake=water+fw.litres,need=base+sweat,bal=intake-need,uc=_dayValue('urine',date);
  var sod=(dayNutrition(date).totals||{}).sodium;
  var prev=seriesWindow('weight',3).filter(function(x){return x.date===addDays(date,-1)||x.date===date;}),drop=prev.length===2?(prev[0].value-prev[1].value)/prev[0].value:null;
  var kg=typeof _kgNow==='function'?_kgNow():null;
  return {status:'ok',cls:'HEURISTIC',date:date,intakeL:round(intake,2),fromDrinksL:round(water,2),fromFoodL:round(fw.litres,2),foodWaterEstimatedShare:round(fw.estimatedShare,2),
    baseL:base,sweatL:round(sweat,2),needL:round(need,2),balanceL:round(bal,2),remainingL:round(Math.max(0,need-intake),2),sd:0.6,sessions:sessions,
    sodium:{lostMg:Math.round(sodiumLoss*1000),eatenMg:sod!=null?Math.round(sod):null,note:sodiumLoss>1&&sod!=null&&sod<1500?'heavy sweating on a low-sodium day: consider salting food or an electrolyte drink':null},
    urine:uc!=null?{value:uc,reading:uc<=3?'well hydrated':(uc<=5?'could drink a little more':'drink more')}:null,
    morningDrop:drop!=null&&drop>0.01&&sweat>1?'your weight fell '+round(drop*100,1)+'% overnight after a heavy-sweat day: much of that is water':null,
    training:kg?{before:'about '+Math.round(5*kg)+'\u2013'+Math.round(7*kg)+' ml in the 4 hours before training',after:'replace 125\u2013150% of what you lose (about 1.25\u20131.5 L per kg lost)'}:null,
    verdict:water===0?'no drinks logged: only the water in food is counted':(bal<-0.6?'probably under your needs today':(bal>0.6?'above your estimated needs':'within the uncertainty of your needs')),
    method:'EFSA adequate intake of total water + sweat by intensity, temperature and humidity (or your measured sweat rate); food water from each food\u2019s content',
    limits:'An estimate of balance, not a measure of body water; thirst and urine colour are better guides from day to day.'};
}
/* earlier name, kept for its consumers */
function hydrationBalance(date){return hydrationModel(date);}

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
  {id:'cardio_fitness_latent',name:'Cardio fitness (latent state)',cls:'EMPIRICAL',version:'1.0',inputs:['cardio','rhr','weight'],minN:1,assumes:['%HRR tracks %VO2 reserve in steady exercise','ACSM equations hold for the modality'],failsWhen:['intervals','beta blockers or other heart-rate modifiers','no heart rate'],output:'VO2max per modality family, with uncertainty, and its trend a month with an interval',consumers:['physiologySummary','capabilityVector'],freshnessDays:28,uncertainty:{kind:'kalman posterior'},fn:'cardioFitnessModel'},
  {id:'hydration_balance',name:'Hydration balance',cls:'HEURISTIC',version:'1.0',inputs:['water','calories','cardio'],minN:1,assumes:['EFSA adequate intake','sweat scales with intensity and heat'],failsWhen:['very hot or humid climates beyond the scaling','illness'],output:'daily water balance (L)',consumers:['physiologySummary'],freshnessDays:1,uncertainty:{kind:'fixed',sd:0.8},fn:'hydrationBalance'},
  {id:'supplement_efficacy',name:'Supplement personal efficacy',cls:'EMPIRICAL',version:'1.0',inputs:['supplement'],minN:20,assumes:['on and off days otherwise comparable'],failsWhen:['unblinded expectation','supplements with slow effects'],output:'on-vs-off difference per supplement',consumers:['physiologySummary'],freshnessDays:60,uncertainty:{kind:'standard error'},fn:'supplementEfficacy'},
  {id:'energy_availability',name:'Energy availability',cls:'DERIVED',version:'1.0',inputs:['calories','weight','bodyfat','cardio'],minN:4,assumes:['logged intake is complete','MET estimates of exercise'],failsWhen:['no body-fat reading'],output:'kcal per kg fat-free mass per day',consumers:['physiologySummary'],freshnessDays:7,uncertainty:{kind:'propagated'},fn:'energyAvailability'},
  {id:'diet_digestibility',name:'Protein quality and digestibility',cls:'PRIOR',version:'1.0',inputs:['calories'],minN:1,assumes:['food-group values represent these foods'],failsWhen:['unclassified foods'],output:'digestible protein (g) and energy adjustment',consumers:['physiologySummary'],freshnessDays:1,uncertainty:{kind:'group values'},fn:'dietDigestibility'},
  {id:'recovery_allocation',name:'Recovery resource allocation',cls:'HEURISTIC',version:'1.0',inputs:['sleep','steps','cardio'],minN:7,assumes:['relative costs of lifting, cardio and steps'],failsWhen:['illness','unlogged training'],output:'weekly recovery budget and its split',consumers:['physiologySummary'],freshnessDays:7,uncertainty:{kind:'relative units'},fn:'recoveryAllocation'}
].forEach(function(m){if(!MODELS.some(function(x){return x.id===m.id;}))MODELS.push(m);});})();
/* ============================================================================
   PERSONAL SLEEP RESPONSE (Stage D). Each night's sleep (dated the morning it ended) paired with the same day's
   fatigue, hunger, steps and training performance; the slope per hour above or below the person's median sleep, with
   a prior from population evidence (normal-normal posterior; personal weight as elsewhere). At least 14 paired days
   per outcome, and sleep that varies (SD 0.3 h or more). Limits, stated: an association within one person, not proof
   of cause; a late night can come from the same busy day that raises fatigue.
   ============================================================================ */
var SLEEP_OUTCOMES=[
  {key:'fatigue',label:'fatigue',unit:'points (1\u201310)',prior:{mean:-0.4,sd:0.4},source:'sleep loss raises fatigue (Watson et al. 2015)'},
  {key:'hunger',label:'hunger',unit:'points (1\u201310)',prior:{mean:-0.3,sd:0.4},source:'sleep restriction raises appetite (Spiegel et al. 2004)'},
  {key:'performance',label:'training performance',unit:'% of the recent best',prior:{mean:1,sd:1.5},source:'small, inconsistent effects on strength (Fullagar et al. 2015)'},
  {key:'steps',label:'steps',unit:'steps',prior:{mean:200,sd:500},source:'weak evidence; the prior is close to no effect'}];
function _sessionPerformance(){var out={},best={};
  sessionsOf({from:addDays(todayISO(),-365)}).slice().sort(function(a,b){return a.date<b.date?-1:1;}).forEach(function(s){var day=[];
    (s.sets||[]).forEach(function(x){var e=e1rm(num(x.load),num(x.reps));if(!e)return;var k=String(x.exercise||'').toLowerCase(),hist=(best[k]||[]).filter(function(h){return daysBetween(h.date,s.date)<=30&&h.date<s.date;});
      if(hist.length){var mx=Math.max.apply(null,hist.map(function(h){return h.v;}));day.push(100*(e.value-mx)/mx);}(best[k]=best[k]||[]).push({date:s.date,v:e.value});});
    if(day.length)out[s.date]=mean(day);});
  return out;}
function personalSleepResponse(series){
  var sleep={};(series&&series.sleep||obsOf('sleep').filter(function(o){return !o.retracted;}).map(function(o){return {date:o.date,value:o.value};})).forEach(function(o){sleep[o.date]=o.value;});
  var days=Object.keys(sleep);if(days.length<14)return {status:'insufficient',need:'14 nights of sleep logged',n:days.length};
  var vals=days.map(function(d){return sleep[d];}).sort(function(a,b){return a-b;}),med=vals[Math.floor(vals.length/2)];
  var perf=series&&series.performance||_sessionPerformance();
  var outcomes=SLEEP_OUTCOMES.map(function(O){var src={};
    /* performance is a map of date to % of the recent best; the other outcomes are lists of {date, value} */
    if(O.key==='performance')src=perf;
    else if(series&&Array.isArray(series[O.key]))series[O.key].forEach(function(o){src[o.date]=o.value;});
    else obsOf(O.key).filter(function(o){return !o.retracted;}).forEach(function(o){src[o.date]=o.value;});
    var pairs=days.filter(function(d){return src[d]!=null;}).map(function(d){return {x:sleep[d]-med,y:src[d]};});
    if(pairs.length<14)return {key:O.key,label:O.label,status:'insufficient',need:'14 days with both sleep and '+O.label,n:pairs.length};
    var mx=mean(pairs.map(function(p){return p.x;})),my=mean(pairs.map(function(p){return p.y;})),sxx=0,sxy=0;pairs.forEach(function(p){sxx+=(p.x-mx)*(p.x-mx);sxy+=(p.x-mx)*(p.y-my);});
    if(Math.sqrt(sxx/pairs.length)<0.3)return {key:O.key,label:O.label,status:'insufficient',need:'sleep that varies by more than a few minutes',n:pairs.length};
    var b=sxy/sxx,res=0;pairs.forEach(function(p){var e=p.y-my-b*(p.x-mx);res+=e*e;});var se=Math.sqrt(res/(pairs.length-2)/sxx);
    var vp=1/(1/(O.prior.sd*O.prior.sd)+1/(se*se)),mp=vp*(O.prior.mean/(O.prior.sd*O.prior.sd)+b/(se*se)),pw=Math.max(0,Math.min(1,1-vp/(O.prior.sd*O.prior.sd)));
    var lo=mp-2*Math.sqrt(vp),hi=mp+2*Math.sqrt(vp),dir=lo>0?'more':(hi<0?'less':null);
    return {key:O.key,label:O.label,status:'ok',perHour:round(mp,2),interval:[round(lo,2),round(hi,2)],unit:O.unit,personalWeight:round(pw,2),n:pairs.length,source:O.source,
      reading:pw<0.2?'not enough of your own data yet for '+O.label+'; the population evidence is used ('+O.source+')':(dir?'each extra hour above your usual goes with '+Math.abs(round(mp,O.key==='steps'?0:1))+' '+(O.key==='steps'?'steps':(O.key==='performance'?'percentage points':'points'))+' '+dir+' '+O.label:'no clear link between your sleep and '+O.label+' so far')};});
  return {status:'ok',cls:'EMPIRICAL',medianSleep:med,nights:days.length,outcomes:outcomes,limits:'an association within one person, not proof of cause: a late night can come from the same busy day that raises fatigue'};}
(function(){if(typeof MODELS==='undefined'||MODELS.some(function(m){return m.id==='personal_sleep_response';}))return;
  MODELS.push({id:'personal_sleep_response',name:'Personal sleep response',cls:'EMPIRICAL',version:'1.0',inputs:['sleep','fatigue','hunger','steps'],minN:14,
    assumes:['a night\u2019s sleep acts on the same day\u2019s fatigue, hunger, steps and training','the relationship is roughly linear around the person\u2019s usual sleep'],
    failsWhen:['sleep that hardly varies','a common cause driving both sleep and the outcome'],
    output:'per outcome, the change per extra hour of sleep above the person\u2019s usual, with its interval and how much is their own data',consumers:['marginalReturns'],freshnessDays:14,uncertainty:{kind:'posterior interval per outcome'},fn:'personalSleepResponse'});})();
