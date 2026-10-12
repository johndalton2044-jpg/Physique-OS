/* ============================================================================
   REGION: RESPONSE · UNCERTAINTY · COUNTERFACTUALS · VALUE OF INFORMATION
   What this person's body actually did when a variable moved, how much confidence the numbers deserve
   once every error source is carried through, and what a proposed change would be expected to do.
   Everything here is pure: nothing mutates the record.
   ============================================================================ */
/* ---- uncertainty propagation: intake coverage → TDEE interval → energy balance → decision confidence ---- */
function uncertaintyChain(){
  return memo('uncertainty:'+asOf(),function(){
    var tdee=tdeePersonal(),tr=weightTrend(14),ad=adherenceState(14),trust=dataTrust();
    var out={cls:'DERIVED',model:'uncertainty_chain',links:[],status:'ok'};
    var cov=ad.nutrition&&ad.nutrition.pct!=null?ad.nutrition.pct/100:null;
    var intakeErrPct=cov==null?null:(cov>=0.9?0.08:(cov>=0.7?0.15:(cov>=0.5?0.25:0.4)));
    out.links.push({step:'intake',value:cov==null?'not logged':fmtNum(cov*100,0)+'% of days logged',error:intakeErrPct==null?null:'\u00b1'+fmtNum(intakeErrPct*100,0)+'%',note:'under-reporting rises as logging coverage falls; this is the dominant error in every energy calculation'});
    if(tdee.status!=='ok'){
      out.status='insufficient';out.need=tdee.need||['more logged intake and weight days'];
      out.links.push({step:'maintenance',value:'not estimated from this record',error:null,note:'a population equation stands in until intake and weight overlap for long enough'});
      /* An unresolved chain still has to state a ceiling. Reporting no ceiling would let a caller read the
         absence as "no constraint" when it means the opposite. */
      out.balance=null;out.relative=null;out.ceiling='low';
      out.text='maintenance is not yet estimated from this record, so no calorie number here is better than a population starting point';
      out.trust=trust.overall;return out;}
    out.links.push({step:'maintenance (TDEE)',value:fmtKcal(tdee.value),error:tdee.lo!=null?('\u00b1'+fmtKcal((tdee.hi-tdee.lo)/2)):null,note:tdee.cls==='CALIBRATED'?'corrected against past forecast error':'fitted to this record'});
    /* slopeSe is already per WEEK (weightTrend multiplies the per-day error by 7); it was multiplied by 7 again here, so
       the scale's error in kcal/day was seven times too large. lb/week \u00d7 kcal/lb \u00f7 7 = kcal/day. */
    var trendErr=tr.status==='ok'&&tr.slopeSe!=null?tr.slopeSe*tissueEnergyDensity().kcalPerLb/7:null;
    out.links.push({step:'weight trend',value:tr.status==='ok'?fmtRate(tr.slopePerWeek):'insufficient',error:trendErr!=null?('\u00b1'+fmtKcal(trendErr)+'/day equivalent'):null,note:'scale noise and a short window widen this; it does not mean the body is changing faster'});
    var half=tdee.lo!=null?(tdee.hi-tdee.lo)/2:tdee.value*0.15;
    var intakeAbs=intakeErrPct!=null&&tdee.value?tdee.value*intakeErrPct:null;
    /* TWO WAYS TO MEASURE THE SAME GAP. Calorie maths (intake minus maintenance) and the scale (the weight trend) are two
       estimates of one energy gap; the trend's error was being ADDED to the calorie error as if it were more noise, so
       extra evidence made the answer look less certain, and "calorie numbers carry low confidence" never cleared — on
       the demo, calorie maths gave about −260 ± 400 kcal/day while the scale showed about −870 ± 160. They are not
       independent either (the personal maintenance estimate is fitted from the same weigh-ins), so they are not pooled:
       the gap is judged by whichever establishes it more precisely, and the text says which. */
    var calcErr=Math.sqrt(Math.pow(half,2)+Math.pow(intakeAbs||0,2));
    var eb=energyBalance();
    var calcBal=eb.status==='ok'?eb.balance:null; // intake minus expenditure: negative is a deficit
    var trendBal=(tr.status==='ok'&&tr.slopePerWeek!=null)?tr.slopePerWeek*tissueEnergyDensity().kcalPerLb/7:null;
    var useTrend=trendBal!=null&&trendErr!=null&&(calcBal==null||trendErr<calcErr);
    var bal=useTrend?trendBal:calcBal,combined=useTrend?trendErr:calcErr;
    out.basis=useTrend?'scale':'calories';
    if(calcBal!=null&&trendBal!=null&&trendErr!=null){var dis=Math.abs(calcBal-trendBal),tol=2*Math.sqrt(calcErr*calcErr+trendErr*trendErr);
      out.agreement={calories:round(calcBal,0),caloriesErr:round(calcErr,0),scale:round(trendBal,0),scaleErr:round(trendErr,0),agree:dis<=tol,
        note:dis<=tol?'calorie maths and the scale agree within their errors':'calorie maths and the scale disagree beyond their errors \u2014 intake may be under- or over-logged'};}
    out.balance=bal!=null?{value:bal,lo:bal-combined,hi:bal+combined}:null;
    out.links.push({step:'energy balance',value:bal!=null?fmtKcal(bal)+'/day':'not computable',error:'\u00b1'+fmtKcal(combined)+'/day',note:'the interval is wider than most apps admit; a 300 kcal deficit with a \u00b1400 kcal interval is not a measured deficit'});
    var rel=bal!=null&&Math.abs(bal)>0?combined/Math.abs(bal):null;
    out.relative=rel;
    out.ceiling=rel==null?'low':(rel<0.4?'high':(rel<0.8?'medium':'low'));
    var via=useTrend?' (established by the scale: the weight trend)':' (from calorie maths)';
    out.text=rel==null?'the energy numbers are not resolved enough to carry a confident decision':(rel<0.4?'the energy gap is larger than its own uncertainty'+via+' \u2014 the numbers can carry a decision':(rel<0.8?'the energy gap and its uncertainty are the same order \u2014 use direction, not magnitude':'the uncertainty exceeds the energy gap \u2014 treat every calorie number as a rough guide'));
    out.trust=trust.overall;
    return out;
  });
}
/* ---- personal response matrix: effect per unit of change, learned from this record's own interventions ---- */
var RESPONSE_VARS={steps:{unit:'1,000 steps/day',scale:1000,metric:'weight trend (lb/week)'},calories:{unit:'100 kcal/day',scale:100,metric:'weight trend (lb/week)'},cardio:{unit:'session/week',scale:1,metric:'weight trend (lb/week)'},training:{unit:'session/week',scale:1,metric:'weight trend (lb/week)'},protein:{unit:'10 g/day',scale:10,metric:'weight trend (lb/week)'}};
function _trendAround(date,days,before){var end=before?addDays(date,-1):addDays(date,days);var start=before?addDays(date,-days):date;var s=dailySeries('weight',end,days);if(s.length<Math.max(5,days*0.4))return null;var pts=s.map(function(d){return {x:d.x,y:d.value};});var ts=theilSen(pts);return ts.slope==null?null:{slopePerWeek:ts.slope*7,n:s.length,from:start,to:end};}
function personalResponse(){
  return memo('response:'+asOf(),function(){
    var rows={};
    var record=function(v,eff,src){if(!RESPONSE_VARS[v])return;(rows[v]=rows[v]||{variable:v,unit:RESPONSE_VARS[v].unit,metric:RESPONSE_VARS[v].metric,samples:[]}).samples.push(Object.assign({},eff,{source:src}));};
    (DB.experiments||[]).forEach(function(e){
      if(!_knownBy(e,asOf())||e.status==='active'||e.status==='abandoned')return;
      var pre=_trendAround(e.startDate,14,true),post=_trendAround(e.startDate,Math.max(14,daysBetween(e.startDate,e.recheckDate)),false);
      if(!pre||!post)return;
      var delta=(num(e.interventionValue)-num(e.baselineValue));if(delta==null||!isFinite(delta)||delta===0)return;
      var units=delta/RESPONSE_VARS[e.variable].scale;
      var conf=(detectConfounders(e)||[]).length;
      record(e.variable,{effect:(post.slopePerWeek-pre.slopePerWeek)/units,before:pre.slopePerWeek,after:post.slopePerWeek,delta:delta,units:units,date:e.startDate,phase:(phaseAt(e.startDate)||{}).type||'none',weightZone:_weightZoneAt(e.startDate),confounders:conf,predicted:e.predLo!=null&&e.predHi!=null?[e.predLo,e.predHi]:null,conclusion:e.conclusion||e.outcome||null},'experiment');
    });
    (DB.interventions||[]).forEach(function(i){
      if(i.experimentId||!_knownBy(i,asOf()))return;if(!RESPONSE_VARS[i.variable])return;
      var pre=_trendAround(i.date,14,true),post=_trendAround(i.date,14,false);if(!pre||!post)return;
      var delta=num(i.to)-num(i.from);if(delta==null||!isFinite(delta)||delta===0)return;
      record(i.variable,{effect:(post.slopePerWeek-pre.slopePerWeek)/(delta/RESPONSE_VARS[i.variable].scale),before:pre.slopePerWeek,after:post.slopePerWeek,delta:delta,units:delta/RESPONSE_VARS[i.variable].scale,date:i.date,phase:(phaseAt(i.date)||{}).type||'none',weightZone:_weightZoneAt(i.date),confounders:0},'intervention');
    });
    var out=Object.keys(rows).map(function(v){
      var r=rows[v];var eff=r.samples.map(function(x){return x.effect;});
      r.n=eff.length;r.effect=median(eff);r.spread=eff.length>1?mad(eff):null;
      r.clean=r.samples.filter(function(x){return !x.confounders;}).length;
      r.cls='EMPIRICAL';
      r.confidence=r.n>=3&&r.clean>=2?'medium':(r.n>=1&&r.clean>=1?'low':'very low');
      r.text=fmtSigned(r.effect,2)+' lb/week per '+r.unit+(r.n>1?(' (median of '+r.n+')'):' (single observation)')+(r.clean<r.n?(' \u00b7 '+(r.n-r.clean)+' confounded'):'');
      r.caution=r.n<3?'too few observations to separate this variable from everything else that moved':null;
      return r;});
    out.sort(function(a,b){return b.n-a.n;});
    return {rows:out,cls:'EMPIRICAL',model:'response_matrix',note:'learned from your own interventions; a population average is not used here'};
  });
}
function _weightZoneAt(date){var s=dailySeries('weight',date,7);if(!s.length)return null;var w=mean(s.map(function(d){return d.value;}));return w>=250?'250+':(w>=230?'230\u2013250':(w>=210?'210\u2013230':(w>=190?'190\u2013210':'<190')));}
function responseFor(variable){return personalResponse().rows.filter(function(r){return r.variable===variable;})[0]||null;}
/* ---- exercise-level response: which lifts respond, at what volume, at what fatigue cost ---- */
function exerciseResponse(days){
  days=days||84;
  return memo('exresp:'+days+':'+asOf(),function(){
    var from=addDays(asOf(),-days);var byEx={};
    sessionsOf({from:from}).forEach(function(s){
      (s.sets||[]).forEach(function(x){
        var k=normExercise(x.exercise);if(!k)return;var e=e1rm(num(x.load),num(x.reps));if(!e)return;
        var b=byEx[k]||(byEx[k]={exercise:k,sessions:{},sets:0,volume:0});
        b.sets++;b.volume+=(num(x.load)||0)*(num(x.reps)||0);
        var d=b.sessions[s.date]||(b.sessions[s.date]={date:s.date,best:0,sets:0,volume:0,rir:[]});
        d.sets++;d.volume+=(num(x.load)||0)*(num(x.reps)||0);if(e.value>d.best)d.best=e.value;if(x.rir!=null)d.rir.push(num(x.rir));
      });
    });
    var rows=Object.keys(byEx).map(function(k){
      var b=byEx[k];var days2=Object.keys(b.sessions).sort().map(function(d){return b.sessions[d];});
      var r={exercise:k,exposures:days2.length,sets:b.sets,volume:Math.round(b.volume),weeklySets:round(b.sets/Math.max(1,days/7),1),cls:'EMPIRICAL',model:'exercise_response'};
      if(days2.length<4){r.status='insufficient';r.need=(4-days2.length)+' more exposures';r.text='not enough exposures to read a response';return r;}
      var pts=days2.map(function(d,i){return {x:daysBetween(days2[0].date,d.date),y:d.best};});
      var ts=theilSen(pts);r.slopePerWeek=ts.slope!=null?ts.slope*7:null;
      var vals=days2.map(function(d){return d.best;});var m=mean(vals),sdv=sd(vals);r.cv=m?sdv/m:null;
      /* The noise a real change must beat is the scatter AROUND the trend, not the spread of all the session bests:
         a progressing lift's spread includes its own progress, so the steeper the progress the larger the "noise" it had
         to exceed — lifts gaining 2.6 lb of estimated max a week were called flat while the strength trend called them
         improving. Residuals from the same Theil–Sen line. */
      if(ts.slope!=null){var ic=(ts.intercept!=null)?ts.intercept:median(pts.map(function(p){return p.y-ts.slope*p.x;}));
        var res=pts.map(function(p){return p.y-(ic+ts.slope*p.x);});r.noiseFloor=res.length>2?sd(res):null;r.residualSd=r.noiseFloor;}
      else r.noiseFloor=r.cv!=null&&m?r.cv*m:null;
      var rirs=days2.reduce(function(a,d){return a.concat(d.rir);},[]);r.meanRir=rirs.length?mean(rirs):null;
      r.status='ok';
      /* Whether the TREND is real is a question about the slope, not about one session: comparing four weeks of trend
         with a single session's scatter asked the wrong question, and every lift the strength trend called improving
         read "flat". The slope moves when it exceeds twice its standard error (residual scatter over the spread of
         the session dates). */
      var xs=pts.map(function(p){return p.x;}),xm=mean(xs),sxx=xs.reduce(function(a,x){return a+(x-xm)*(x-xm);},0);
      r.slopeSePerWeek=(r.noiseFloor!=null&&sxx>0)?r.noiseFloor/Math.sqrt(sxx)*7:null;
      var moves=r.slopePerWeek!=null&&r.slopeSePerWeek!=null&&pts.length>=5&&Math.abs(r.slopePerWeek)>2*r.slopeSePerWeek;
      /* A pill is a label, not a sentence. The full phrase is worth keeping — "flat within your own
         session-to-session noise" says something a bare "flat" does not — so it moves to the explanatory
         line and the pill carries the one word. */
      r.direction=r.slopePerWeek==null?'unknown':(moves?(r.slopePerWeek>0?'progressing':'declining'):'flat');
      r.directionDetail=r.slopePerWeek==null?'no usable slope yet':
        (moves?('a trend clear of your own session-to-session noise'):'no trend yet that is clear of your session-to-session noise');
      r.stimulus=r.weeklySets>=10?'at or above the volume associated with hypertrophy in the ACSM 2026 overview':(r.weeklySets>=4?'below the \u226510 sets/week associated with hypertrophy; adequate for strength maintenance':'minimal exposure');
      r.fatigueCost=r.meanRir==null?null:(r.meanRir<=0.5?'trained close to failure \u2014 ACSM 2026 reports 2\u20133 RIR gives similar hypertrophy with less fatigue':(r.meanRir<=3?'2\u20133 RIR \u2014 matches the ACSM 2026 recommendation':'well short of failure; the stimulus may be light for hypertrophy'));
      r.suggestion=r.direction==='progressing'?('hold the current approach; '+(r.weeklySets<10?'adding a set per week is the lowest-cost next step':'volume is already adequate')):(r.direction==='declining'?'check recovery and protocol before adding volume; a decline during a deficit is a muscle-retention signal':(r.weeklySets<10?'flat with '+r.weeklySets+' sets/week \u2014 the ACSM 2026 lever with the most support is more weekly sets':'flat at adequate volume \u2014 vary load or range of motion rather than adding sets'));
      r.text=k+': '+(r.slopePerWeek!=null?fmtSigned(r.slopePerWeek,1)+' e1RM/week':'no slope')+' over '+days2.length+' exposures, '+r.weeklySets+' sets/week';
      return r;});
    rows.sort(function(a,b){return b.exposures-a.exposures;});
    return {rows:rows,days:days,cls:'EMPIRICAL'};
  });
}
/* W-015: EACH LIFT'S FORECAST, CHECKED ON ITS OWN RECORD (exercise-specific response calibration). The response trend
   above is one line per lift; whether that line forecasts the lift's next session is a question each lift answers for
   itself, because lifts differ in how far they scatter around their trend. Each lift is replayed: at every session
   from its fifth on, its trend is fitted on its sessions in the 84 days before (Theil–Sen, as above), the session is
   forecast, and the miss is scored against the scatter around that fit. The scored misses go through the one
   calibration rule (intervalCalibration, 58-model-competition): the factor that would have made the 80% range hold 80%
   of the time, learned on older forecasts and checked on newer ones. A lift with fewer than ten scored forecasts takes
   the factor from all the person's lifts together; with ten or more, its own factor weighs against that one as n
   against ten, and its weight is reported. */
var LIFT_FORECAST_CONTRACT={id:'lift_forecast',subject:'a lift’s next session',predicate:'is forecast from its own trend, with an 80% range scored against what its earlier sessions did',
  parameters:{history:{value:182,unit:'days',meaning:'the sessions each lift is replayed over'},
    fitWindow:{value:84,unit:'days',meaning:'each forecast is fitted on the lift’s sessions this far back, as the response trend is'},
    minFit:{value:4,unit:'sessions',meaning:'the fewest earlier sessions a forecast is made from'},
    scatterFloor:{value:0.01,unit:'fraction of the forecast',meaning:'the scatter is taken as at least this, so a run of identical sessions does not promise an exact next one'},
    priorWeight:{value:10,unit:'scored forecasts',meaning:'a lift’s own factor weighs against the factor from all its lifts as n against this'}},
  statement:function(v){return 'each lift’s next session is forecast from its trend over '+v.fitWindow+' days (from '+v.minFit+' sessions); its 80% range is scored against its own past sessions and corrected by the factor that would have held, its own once '+v.priorWeight+' are scored, weighed against all its lifts’ as n against '+v.priorWeight;},
  rationale:'lifts differ in how far they scatter around their trend, so one range for all of them is too wide for some and too narrow for others; each is checked on its own record',
  evidenceBasis:[],parameterSource:'chosen by this system; not derived from a study',parameterVersion:'1.0',
  calibrationStatus:'the range is calibrated on the person’s own scored sessions; the parameters are not',validationStatus:HEURISTIC_NOT_VALIDATED,
  applicability:{phases:['any'],population:'adults lifting with logged loads and reps'},
  failureConditions:['a changed variation or equipment logged under the same name','a planned deload or a test day, scored as an ordinary session','loads logged without reps'],
  outcomes:['strength progression']};
/* the fit a forecast for `at` is made from: the lift's sessions in the window before it */
function _liftFit(E,at){var P=LIFT_FORECAST_CONTRACT.parameters,from=addDays(at,-P.fitWindow.value),h=E.filter(function(e){return e.date>=from&&e.date<at;});
  if(h.length<P.minFit.value)return null;
  var pts=h.map(function(e){return {x:daysBetween(h[0].date,e.date),y:e.best};}),ts=theilSen(pts);if(ts.slope==null)return null;
  var res=pts.map(function(p){return p.y-(ts.intercept+ts.slope*p.x);}),m=ts.intercept+ts.slope*daysBetween(h[0].date,at);
  return {mean:m,sd:Math.max(sd(res)||0,P.scatterFloor.value*Math.abs(m)),n:h.length,slopePerWeek:ts.slope*7};}
function liftForecasts(){
  return memo('liftForecasts:'+asOf(),function(){
    var P=LIFT_FORECAST_CONTRACT.parameters,now=asOf(),by={};
    sessionsOf({from:addDays(now,-P.history.value)}).forEach(function(s){(s.sets||[]).forEach(function(x){var k=normExercise(x.exercise);if(!k)return;
      var e=e1rm(num(x.load),num(x.reps));if(!e)return;var b=by[k]||(by[k]={});if(b[s.date]==null||e.value>b[s.date])b[s.date]=e.value;});});
    var all=[],lifts=Object.keys(by).map(function(k){var E=Object.keys(by[k]).sort().map(function(d){return {date:d,best:by[k][d]};}),scored=[];
      E.forEach(function(e,i){var f=_liftFit(E.slice(0,i),e.date);if(f)scored.push({at:e.date,ratio:Math.abs(e.best-f.mean)/f.sd,predicted:f.mean,actual:e.best});});
      all=all.concat(scored);return {exercise:k,E:E,scored:scored};});
    var pooled=intervalCalibration(all),pooledScale=pooled.n>=CALIBRATION_MIN_N?pooled.scale:1;
    var rows=lifts.map(function(L){var E=L.E,last=E[E.length-1],gaps=[];for(var i=Math.max(1,E.length-5);i<E.length;i++)gaps.push(daysBetween(E[i-1].date,E[i].date));
      var gap=Math.max(1,Math.round(median(gaps)||7)),at=addDays(last.date,gap);if(at<now)at=now;
      var f=_liftFit(E,at),c=intervalCalibration(L.scored),own=c.n>=CALIBRATION_MIN_N,w=own?c.n/(c.n+P.priorWeight.value):0,k=w*(own?c.scale:1)+(1-w)*pooledScale;
      var held=L.scored.filter(function(e){return e.ratio<=1.2816;}).length;
      var basis=own?{kind:c.calibrated?'calibrated':'uncalibrated',interval:0.8,heldOnNewer:c.calibratedCoverage!=null?round(c.calibratedCoverage,2):null,n:c.n}:{kind:'rating',scored:c.n,need:CALIBRATION_MIN_N};
      var r={exercise:L.exercise,sessions:E.length,scored:c.n,held:held,coverage:c.coverage!=null?round(c.coverage,2):null,ownScale:own?round(c.scale,3):null,pooledScale:round(pooledScale,3),
        scale:round(k,3),personalWeight:round(w,2),basis:basis,cls:'EMPIRICAL',model:'lift_forecast',policy:LIFT_FORECAST_CONTRACT.id};
      if(!f){r.status='insufficient';r.need=E.length<P.minFit.value?((P.minFit.value-E.length)+' more sessions of it'):('sessions of it in the last '+P.fitWindow.value+' days');
        r.text='not enough recent sessions to forecast the next one';return r;}
      r.status='ok';r.next={date:at,mean:round(f.mean,1),lo:round(f.mean-1.2816*f.sd*k,1),hi:round(f.mean+1.2816*f.sd*k,1),sd:round(f.sd,2),fittedOn:f.n};
      r.text=(c.n?('its uncorrected 80% ranges held '+held+' of '+c.n+' past sessions; '):'')+(own?(confidenceBasisText(basis)+'; the ×'+fmtNum(k,2)+' correction is '+Math.round(w*100)+'% this lift’s own record, the rest from all your lifts'):
        ('a rating, not a probability: '+c.n+' of '+CALIBRATION_MIN_N+' scored sessions to calibrate it on its own'+(pooled.n>=CALIBRATION_MIN_N&&Math.abs(pooledScale-1)>0.005?('; corrected ×'+fmtNum(pooledScale,2)+' from all your lifts ('+pooled.n+' scored)'):'')));
      return r;});
    rows.sort(function(a,b){return b.sessions-a.sessions;});
    return {status:'ok',cls:'EMPIRICAL',rows:rows,scored:all.map(function(e){return {at:e.at,ratio:e.ratio};}),pooled:{n:pooled.n,scale:round(pooledScale,3),inUse:pooled.n>=CALIBRATION_MIN_N,calibrated:pooled.calibrated},
      policy:LIFT_FORECAST_CONTRACT.id,method:LIFT_FORECAST_CONTRACT.statement(heuristicValues(LIFT_FORECAST_CONTRACT))};
  });
}
function liftForecast(exercise){var k=normExercise(exercise);return liftForecasts().rows.filter(function(r){return r.exercise===k;})[0]||null;}
(function(){if(typeof MODELS==='undefined'||_registryTaken(MODELS,'MODELS','lift_forecast'))return;
  MODELS.push({id:'lift_forecast',name:'Each lift’s next session',cls:'EMPIRICAL',version:'1.0',inputs:['session.load|load × reps','session.reps|reps','session.date|session dates','e1rm'],minN:5,
    assumes:['a lift’s recent trend continues to its next session','its scatter around the trend is the same from session to session','the sessions named alike are the same lift'],
    failsWhen:['fewer than four sessions of the lift in 84 days','a changed variation or equipment under the same name','a planned deload or test day'],
    output:'each lift’s next session as an estimated 1RM with an 80% range, scored against its own past sessions, with how often those ranges held and how much of the correction is the lift’s own',
    consumers:['progressionPlan','selfCalibration'],freshnessDays:7,uncertainty:{kind:'80% range from the scatter around each fit, corrected by the lift’s own scored sessions'},fn:'liftForecasts'});})();
/* ---- counterfactual: what a proposed change would be expected to do, using this person's own response ---- */
function counterfactual(changes){
  changes=changes||{};
  var tr=weightTrend(14),tdee=tdeePersonal(),u=uncertaintyChain();
  var base=tr.status==='ok'?tr.slopePerWeek:null;
  var parts=[],kcalDelta=0,unknown=[];
  Object.keys(changes).forEach(function(v){
    var delta=num(changes[v]);if(delta==null||delta===0)return;
    var r=responseFor(v);
    if(r&&r.n>=1){var eff=r.effect*(delta/RESPONSE_VARS[v].scale);parts.push({variable:v,delta:delta,effect:eff,basis:'your own response ('+r.n+' observation'+(r.n===1?'':'s')+', '+r.confidence+' confidence)',cls:'EMPIRICAL'});}
    else{
      /* ONE sign convention: positive kcal means additional daily energy expenditure or reduced intake, and
         therefore a more negative weight trend. Steps used that convention and cardio and training used the
         opposite, so the population fallback told people that ADDING cardio would make them gain — the
         fallback that fires precisely when there is no personal evidence to contradict it. */
      var kcal=v==='steps'?delta*0.045:
        (v==='calories'?-delta:
        (v==='cardio'?delta*250/7:
        (v==='training'?delta*180/7:0)));
      if(kcal){kcalDelta+=kcal;parts.push({variable:v,delta:delta,effect:-kcalToLb(kcal*7).lb,basis:'population estimate (no personal observation for this variable yet)',cls:'PRIOR'});}
      else unknown.push(v);
    }
  });
  var total=parts.reduce(function(a,p){return a+p.effect;},0);
  var proj=base!=null?base+total:null;
  var band=u.status==='ok'&&u.relative!=null?Math.abs(total)*Math.max(0.5,u.relative):Math.abs(total)*0.8;
  return {status:base==null?'insufficient':'ok',cls:parts.every(function(p){return p.cls==='EMPIRICAL';})&&parts.length?'EMPIRICAL':'PRIOR',
    base:base,change:total,projected:proj,lo:proj!=null?proj-band:null,hi:proj!=null?proj+band:null,parts:parts,unknown:unknown,
    text:base==null?'not enough weight history to project a change':('current '+fmtRate(base)+' \u2192 '+fmtRate(proj)+' (range '+fmtRate(proj-band)+' to '+fmtRate(proj+band)+')'),
    caveat:'a projection from your own history, not a promise; the range is wider than the change for variables with one observation'};
}
/* ---- formal value of information: uncertainty reduction × decision impact − burden ---- */
function valueOfInformationFormal(){
  return memo('voi:'+asOf(),function(){
    var trust=dataTrust(),u=uncertaintyChain(),tr=weightTrend(14),bc=bodyComp(),ad=adherenceState(14);
    var items=[];
    var add=function(o){items.push(o);};
    if(tr.status!=='ok'||tr.n<10)add({id:'weight-frequency',ask:'weigh in daily for the next two weeks',reduces:'weight trend interval',reduction:0.5,impact:0.9,burden:0.1,timeToInfo:14,why:'the trend interval is the widest single input to every energy calculation'});
    if(ad.nutrition&&ad.nutrition.pct<70)add({id:'intake-coverage',ask:'log intake on '+(70-Math.round(ad.nutrition.pct))+'% more days',reduces:'intake error, which dominates the TDEE interval',reduction:0.45,impact:0.85,burden:0.35,timeToInfo:14,why:'under-reporting rises sharply below 70% coverage'});
    if(!bc.measured||daysBetween(bc.measured.date,asOf())>60)add({id:'measured-bodyfat',ask:'get one measured body-fat reading (DXA, BodPod or calipers by the same operator)',reduces:'composition uncertainty; unlocks the fat/lean split',reduction:0.7,impact:0.5,burden:0.6,timeToInfo:1,why:'a circumference equation cannot resolve tissue; one anchor makes four months of tape readings interpretable'});
    var wt=obsOf('waist');if(!wt.length||daysBetween(wt[wt.length-1].date,asOf())>10)add({id:'waist',ask:'measure the waist weekly',reduces:'fat-vs-other ambiguity',reduction:0.4,impact:0.6,burden:0.15,timeToInfo:21,why:'waist and weight moving together is the cheapest fat-loss signal available'});
    var st=strengthTrend();if(st.status!=='ok'||st.tracked<2)add({id:'strength-tracking',ask:'log the same two or three main lifts each week',reduces:'muscle-retention uncertainty',reduction:0.55,impact:0.75,burden:0.25,timeToInfo:28,why:'strength is the only muscle-retention proxy available without a lab'});
    var resp=personalResponse().rows;if(!resp.length)add({id:'first-experiment',ask:'run one 14-day single-variable experiment',reduces:'every effect estimate is a population prior until then',reduction:0.6,impact:0.8,burden:0.4,timeToInfo:14,why:'no personal response is known for any variable yet'});
    items.forEach(function(i){i.value=round(i.reduction*i.impact-i.burden*0.5,3);i.cls='DERIVED';i.text=i.ask+' \u2014 cuts '+i.reduces+' (value '+i.value.toFixed(2)+', answer in '+i.timeToInfo+' day'+(i.timeToInfo===1?'':'s')+')';});
    items.sort(function(a,b){return b.value-a.value;});
    return {items:items,cls:'DERIVED',trust:trust.overall,ceiling:u.ceiling,note:'value = uncertainty reduction \u00d7 decision impact \u2212 half the burden; the top item is the cheapest way to make the next decision better'};
  });
}
/* ---- prediction context stamping and calibration by context ---- */
function predictionContext(){
  var ph=activePhase(),tr=weightTrend(14),trust=dataTrust();
  return {phaseType:ph?ph.type:'none',weightZone:_weightZoneAt(asOf()),trust:trust.overall>=70?'high':(trust.overall>=45?'medium':'low'),
    interventionActive:(DB.interventions||[]).some(function(i){return i.status==='active'&&daysBetween(i.date,asOf())<=21;}),
    trendDirection:tr.status==='ok'?tr.direction:'unknown',modelVersion:(modelById('weight_forecast')||{}).version||'1.0'};
}
function calibrationByContext(){
  return memo('calibctx:'+asOf(),function(){
    var scored=(DB.predictions||[]).filter(function(p){return p.status==='scored'&&p.error!=null&&p.context;});
    var cur=predictionContext();
    var match=scored.filter(function(p){return p.context.phaseType===cur.phaseType&&p.context.weightZone===cur.weightZone;});
    var groups={};scored.forEach(function(p){var k=(p.context.phaseType||'none')+' \u00b7 '+(p.context.weightZone||'?');(groups[k]=groups[k]||[]).push(p);});
    var rows=Object.keys(groups).map(function(k){var g=groups[k];var errs=g.map(function(p){return p.error;});/* p.covered, not p.hit: the scorer writes covered and nothing has ever written hit, so this rate was
       always zero — a calibration report saying no forecast ever contained the truth, when 76% did. */
      var hits=g.filter(function(p){return p.covered===true;}).length;
      return {context:k,n:g.length,bias:mean(errs),mae:mean(errs.map(Math.abs)),hitRate:g.length?hits/g.length:null,current:k===((cur.phaseType||'none')+' \u00b7 '+(cur.weightZone||'?'))};});
    rows.sort(function(a,b){return b.n-a.n;});
    return {rows:rows,current:cur,usable:match.length>=3,n:match.length,
      bias:match.length>=3?mean(match.map(function(p){return p.error;})):(scored.length?mean(scored.map(function(p){return p.error;})):null),
      basis:match.length>=3?'calibrated against '+match.length+' forecasts made in this same phase and weight zone':(scored.length?'calibrated against all '+scored.length+' scored forecasts (too few in this exact context)':'no scored forecasts yet'),
      cls:'CALIBRATED'};
  });
}
