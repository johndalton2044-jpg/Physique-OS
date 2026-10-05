/* ============================================================================
   PHASE CRITERIA as rules the app checks (they were three free-text boxes, shown and never evaluated). Each rule says
   whether it is met, not yet, or cannot be judged, with its evidence. A met stop rule raises an action alert; a met
   success or transition rule a review. Defaults per phase type; any free text stays as the person's note.
   ============================================================================ */
function _phaseWeeks(ph){return ph&&ph.startDate?daysBetween(ph.startDate,todayISO())/7:0;}
function _avgSince(type,from,days){var S=seriesWindow(type,days||7).filter(function(x){return !from||x.date>=from;});return S.length?mean(S.map(function(x){return x.value;})):null;}
function _e1rmChange(ph){var t=typeof _e1rmTop==='function'?_e1rmTop():null;if(!t||t.series.length<4)return null;var S=t.series,base=S.filter(function(x){return x.date>=ph.startDate;}).slice(0,3),last=S.slice(-3);
  if(base.length<2)return null;return {pct:100*(mean(last.map(function(x){return x.value;}))-mean(base.map(function(x){return x.value;})))/mean(base.map(function(x){return x.value;})),lift:t.exercise};}
var PHASE_CRITERIA={
  success:{
    goal_weight:{label:'reach your goal weight',check:function(ph){var G=canonicalGoal(),g=G&&G.activeTargetLb,w=weightAverages().avg7;   /* the goal through its one owner: this phase's milestone */if(!g||!w)return {state:'unknown',why:'needs a goal weight and recent weigh-ins'};
      var met=ph.type==='bulk'?w>=g:w<=g;return {state:met?'met':'not yet',why:'7-day average '+fmtWeight(w)+' against '+fmtWeight(g)};}},
    rate_in_range:{label:'keep the rate in range for 3 of the last 4 weeks',check:function(ph){var R=typeof physiqueRate==='function'?physiqueRate():null;if(!R||R.status!=='ok')return {state:'unknown',why:'needs three weeks of weigh-ins'};
      return {state:R.state==='within the range'?'met':'not yet',why:'now '+R.pctPerWeek+'% a week; range '+R.range.join(' to ')+'%'};}},
    waist_down:{label:'waist down 2 in (5 cm)',check:function(ph){var W=obsOf('waist'),a=W.filter(function(o){return o.date>=ph.startDate;})[0],b=W[W.length-1];if(!a||!b||a===b)return {state:'unknown',why:'needs a waist measurement at the start and since'};
      var d=a.value-b.value;return {state:d>=2?'met':'not yet',why:'down '+fmtLength(d)+' since '+shortDate(a.date)};}},
    strength_held:{label:'strength held (within 5%)',check:function(ph){var c=_e1rmChange(ph);if(!c)return {state:'unknown',why:'needs sessions since the phase began'};return {state:c.pct>=-5?'met':'not yet',why:c.lift+' '+round(c.pct,1)+'% since the start'};}},
    strength_up:{label:'strength up 5%',check:function(ph){var c=_e1rmChange(ph);if(!c)return {state:'unknown',why:'needs sessions since the phase began'};return {state:c.pct>=5?'met':'not yet',why:c.lift+' '+round(c.pct,1)+'% since the start'};}}},
  stop:{
    strength_drop:{label:'strength down 10% or more',check:function(ph){var c=_e1rmChange(ph);if(!c)return {state:'unknown',why:'needs sessions since the phase began'};return {state:c.pct<=-10?'met':'not yet',why:c.lift+' '+round(c.pct,1)+'%'};}},
    too_fast:{label:'losing more than 1% a week',check:function(ph){var R=typeof physiqueRate==='function'?physiqueRate():null;if(!R||R.status!=='ok')return {state:'unknown',why:'needs three weeks of weigh-ins'};return {state:R.pctPerWeek<-1?'met':'not yet',why:R.pctPerWeek+'% a week'};}},
    gaining_fast:{label:'gaining more than 0.5% a week',check:function(ph){var R=typeof physiqueRate==='function'?physiqueRate():null;if(!R||R.status!=='ok')return {state:'unknown',why:'needs three weeks of weigh-ins'};return {state:R.pctPerWeek>0.5?'met':'not yet',why:R.pctPerWeek+'% a week'};}},
    fatigue_high:{label:'fatigue averaging 7 or more for a week',check:function(){var f=_avgSince('fatigue',null,7);if(f==null)return {state:'unknown',why:'needs recovery check-ins'};return {state:f>=7?'met':'not yet',why:'7-day average '+round(f,1)};}},
    too_long:{label:'longer than the most this phase should run',check:function(ph){var max={cut:16,bulk:24,maintenance:52,recomp:20}[ph.type]||16,wk=_phaseWeeks(ph);return {state:wk>max?'met':'not yet',why:round(wk,1)+' of '+max+' weeks'};}}},
  transition:{
    at_goal:{label:'at goal: move to maintenance',check:function(ph){return PHASE_CRITERIA.success.goal_weight.check(ph);}},
    diet_break:{label:'diet break due (10 weeks of cutting)',check:function(ph){var wk=_phaseWeeks(ph);return ph.type!=='cut'?{state:'unknown',why:'for cuts'}:{state:wk>=10?'met':'not yet',why:round(wk,1)+' of 10 weeks'};}},
    plateau:{label:'plateau: 3 weeks without change while on plan',check:function(){var R=typeof physiqueRate==='function'?physiqueRate():null,A=typeof adherenceState==='function'?adherenceState(21):null;
      if(!R||R.status!=='ok')return {state:'unknown',why:'needs three weeks of weigh-ins'};var on=A&&A.overall!=null?A.overall>=80:null;return {state:Math.abs(R.pctPerWeek)<0.1&&on!==false?'met':'not yet',why:R.pctPerWeek+'% a week'+(on!=null?', plan followed '+Math.round(A.overall)+'%':'')};}},
    end_date:{label:'the planned end date',check:function(ph){return !ph.endDate?{state:'unknown',why:'no end date set'}:{state:todayISO()>=ph.endDate?'met':'not yet',why:'ends '+shortDate(ph.endDate)};}}}};
var PHASE_CRITERIA_DEFAULTS={cut:{success:['goal_weight','rate_in_range','strength_held'],stop:['strength_drop','too_fast','fatigue_high','too_long'],transition:['at_goal','diet_break','plateau']},
  bulk:{success:['goal_weight','strength_up'],stop:['gaining_fast','fatigue_high','too_long'],transition:['at_goal','end_date']},
  maintenance:{success:['rate_in_range','strength_held'],stop:['fatigue_high'],transition:['end_date']},recomp:{success:['waist_down','strength_up'],stop:['strength_drop','fatigue_high','too_long'],transition:['plateau','end_date']}};
function phaseCriteria(ph){return (ph&&ph.criteria)||PHASE_CRITERIA_DEFAULTS[(ph&&ph.type)||'cut']||PHASE_CRITERIA_DEFAULTS.cut;}
function phaseCriteriaStatus(ph){ph=ph||activePhase();if(!ph)return {status:'none'};var C=phaseCriteria(ph),out={};
  ['success','stop','transition'].forEach(function(k){out[k]=(C[k]||[]).filter(function(id){return PHASE_CRITERIA[k][id];}).map(function(id){var r;try{r=PHASE_CRITERIA[k][id].check(ph);}catch(e){r={state:'unknown',why:'could not be checked'};}return {id:id,label:PHASE_CRITERIA[k][id].label,state:r.state,why:r.why};});});
  return {status:'ok',phase:ph.id,type:ph.type,success:out.success,stop:out.stop,transition:out.transition,note:[ph.successCriteria,ph.stopCriteria,ph.transitionCriteria].filter(Boolean).join(' \u00b7 ')};}
