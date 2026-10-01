/* ============================================================================
   RESPONSE, a first-class entity (audit §75\u2013§76, phase 5): what happened BECAUSE of a change.
   Intervention \u2192 execution/adherence \u2192 observed outcome \u2192 model expectation \u2192 actual \u2192 effect \u00b1 uncertainty \u2192
   decision/adaptation, for every kind of intervention, evaluated the same way: before, during, after, and against a
   counterfactual (the trend before the change, continued). Persisted through the event log (response.recorded), so it
   replays and syncs like every other record; recorded as provisional after 7 days and final after 21.
   The per-experiment learner (personalResponse) and the weekly plan response (planResponse) stay as they are; this is
   the canonical object they were partial views of.
   ============================================================================ */
var RESPONSE_OUTCOME={steps:'weight',calories:'weight',cardio:'weight','training days':'weight',protein:'hunger',sleep:'fatigue'};
var RESPONSE_SECONDARY=[['hunger',+1,'hunger rose'],['fatigue',+1,'fatigue rose'],['sleep',-1,'sleep fell'],['e1rm',-1,'strength fell']];
function _rangeSeries(type,from,to){return seriesWindow(type,daysBetween(from,todayISO())+1).filter(function(d){return d.date>=from&&d.date<=to;});}
function _slopePerWeek(S){if(S.length<4)return null;var xs=S.map(function(d){return daysBetween(S[0].date,d.date);}),ys=S.map(function(d){return d.value;}),xm=mean(xs),ym=mean(ys);
  var sxx=xs.reduce(function(a,x){return a+(x-xm)*(x-xm);},0);if(!sxx)return null;var b=xs.reduce(function(a,x,i){return a+(x-xm)*(ys[i]-ym);},0)/sxx;
  var res=ys.map(function(y,i){return y-(ym+b*(xs[i]-xm));}),s2=res.reduce(function(a,r){return a+r*r;},0)/Math.max(1,S.length-2);return {slope:b*7,se:Math.sqrt(s2/sxx)*7,n:S.length};}
function _levelChange(type,B,A){var sb=_rangeSeries(type,B[0],B[1]).map(function(d){return d.value;}),sa=_rangeSeries(type,A[0],A[1]).map(function(d){return d.value;});
  if(sb.length<4||sa.length<4)return null;return {before:mean(sb),after:mean(sa),change:mean(sa)-mean(sb),se:Math.sqrt(sd(sb)*sd(sb)/sb.length+sd(sa)*sd(sa)/sa.length),n:[sb.length,sa.length]};}
function _e1rmSeries(from,to){return (DB.sessions||[]).filter(function(s){return !s.retracted&&s.date>=from&&s.date<=to;}).map(function(s){var best=0;(s.sets||[]).forEach(function(t){var l=t.load||t.weight||0;if(l&&t.reps)best=Math.max(best,l*(1+t.reps/30));});return best?{date:s.date,value:best}:null;}).filter(Boolean);}

/* ---- the interventions: every kind, one shape ---- */
function responseInterventions(){
  var out=[];
  (DB.experiments||[]).filter(function(e){return e.startDate&&e.variable;}).forEach(function(e){
    out.push({id:'exp:'+e.id,kind:'experiment',date:e.startDate,variable:e.variable,from:e.baselineValue,to:e.interventionValue,
      expected:(e.predLo!=null&&e.predHi!=null)?{lo:+e.predLo,hi:+e.predHi,unit:'lb/week',basis:'the prediction stated when the experiment began'}:null,source:{experiment:e.id},reversible:'yes: end the experiment'});});
  plansOf().filter(function(p){return p.version>1&&(p.changes||[]).length;}).forEach(function(p){(p.changes||[]).forEach(function(c){
    var f=String(c.field||c.key||c.path||''),v=/calor/i.test(f)?'calories':(/step/i.test(f)?'steps':(/train|days/i.test(f)?'training days':(/cardio/i.test(f)?'cardio':(/protein/i.test(f)?'protein':null))));if(!v)return;
    var from=c.from!=null?c.from:c.before,to=c.to!=null?c.to:c.after;if(typeof from!=='number'||typeof to!=='number'||from===to)return;
    out.push({id:'plan:'+p.id+':'+v,kind:p.trigger&&p.trigger.kind==='adaptation'?'adaptation':'plan change',date:p.effectiveFrom,variable:v,from:from,to:to,expected:null,source:{planVersion:p.version},reversible:'yes: a later plan version can restore it'});});});
  if(typeof supplementStack==='function')supplementStack().forEach(function(s){var first=(supplementIntakes('0000-01-01',todayISO()).filter(function(x){return x.id===s.id;}).map(function(x){return x.date;}).sort()[0]);
    var c=SUPPLEMENT_CATALOGUE[s.id];if(first&&c&&c.test&&c.test[0])out.push({id:'supp:'+s.id,kind:'supplement',date:first,variable:'supplement: '+c.label,outcome:c.test[0],expected:null,source:{supplement:s.id},reversible:'yes: stop taking it'});});
  return out.sort(function(a,b){return a.date<b.date?-1:1;});
}
/* expectation from population energy arithmetic, when nothing more specific was stated */
function _expectedWeightChange(iv){var kg=typeof _kgNow==='function'?_kgNow():null;
  if(iv.variable==='calories'&&typeof iv.to==='number')return {lo:(iv.to-iv.from)*7/3500*1.3,hi:(iv.to-iv.from)*7/3500*0.7,unit:'lb/week',basis:'energy arithmetic (3,500 kcal per lb), \u00b130%'};
  if(iv.variable==='steps'&&kg&&typeof iv.to==='number'){var k=-(iv.to-iv.from)*0.0005*kg*7/3500;return {lo:k*1.5,hi:k*0.5,unit:'lb/week',basis:'about 0.5 kcal per step per kg, \u00b150%'};}
  return null;}

/* ---- evaluation: before, during, after, and the counterfactual ---- */
function evaluateResponse(iv){
  var d=iv.date,B=[addDays(d,-21),addDays(d,-1)],A=[d,todayISO()<addDays(d,20)?todayISO():addDays(d,20)],afterDays=daysBetween(d,todayISO())+1;
  var rec={id:'resp:'+iv.id,interventionId:iv.id,kind:iv.kind,variable:iv.variable,dose:(typeof iv.to==='number'&&typeof iv.from==='number')?round(iv.to-iv.from,1):null,
    from:iv.from!=null?iv.from:null,to:iv.to!=null?iv.to:null,start:d,windows:{before:B,after:A},stage:afterDays>=21?'final':(afterDays>=7?'provisional':'pending'),
    evaluatedAt:nowISO(),source:iv.source,reversible:iv.reversible,cls:'EMPIRICAL'};
  if(rec.stage==='pending'){rec.verdict='too early: '+afterDays+' of 7 days after the change';return rec;}
  /* execution: was the change carried out? */
  if(typeof iv.to==='number'&&(iv.variable==='calories'||iv.variable==='steps')){var S=_rangeSeries(iv.variable,A[0],A[1]);
    var met=S.filter(function(x){return iv.variable==='calories'?Math.abs(x.value-iv.to)<=0.1*iv.to:x.value>=0.9*iv.to;}).length;
    rec.adherence={daysLogged:S.length,daysMet:met,share:S.length?round(met/S.length,2):null,rule:iv.variable==='calories'?'within 10% of the new target':'at least 90% of the new target'};}
  /* the primary outcome */
  var oc=iv.outcome||RESPONSE_OUTCOME[iv.variable]||null;rec.outcome=oc;
  if(oc==='weight'){var sb=_slopePerWeek(_rangeSeries('weight',B[0],B[1])),sa=_slopePerWeek(_rangeSeries('weight',A[0],A[1]));
    if(sb&&sa){var eff=sa.slope-sb.slope,se=Math.sqrt(sb.se*sb.se+sa.se*sa.se);
      rec.primary={quantity:'weight trend',unit:'lb/week',before:round(sb.slope,2),after:round(sa.slope,2),counterfactual:round(sb.slope,2),effect:round(eff,2),se:round(se,2),n:[sb.n,sa.n],
        method:'the change in the weight trend; the counterfactual is the trend before, continued'};
      /* placebo: the same comparison with the boundary a week earlier, inside the before window */
      var pb=_slopePerWeek(_rangeSeries('weight',addDays(d,-28),addDays(d,-8))),pa=_slopePerWeek(_rangeSeries('weight',addDays(d,-7),addDays(d,-1)));
      if(pb&&pa){var pe=pa.slope-pb.slope,ps=Math.sqrt(pb.se*pb.se+pa.se*pa.se);rec.placebo={effect:round(pe,2),se:round(ps,2),alreadyUnderWay:Math.abs(pe)>2*ps&&pe*eff>0};}}}
  else if(oc){var lc=_levelChange(oc,B,A);if(lc)rec.primary={quantity:oc,before:round(lc.before,2),after:round(lc.after,2),counterfactual:round(lc.before,2),effect:round(lc.change,2),se:round(lc.se,2),n:lc.n,method:'the change in the average level'};}
  /* the model's expectation against what happened */
  /* the expectation: stated when the change began; else this person's own model, leaving this change out (never judged
     against itself); else the population figure */
  var ex=iv.expected||(function(){if(rec.dose!=null&&oc&&typeof predictResponse==='function'){var pr=predictResponse(iv.variable,oc,rec.dose,{excludeId:iv.id});
      if(pr&&pr.n)return {lo:pr.lo,hi:pr.hi,unit:pr.unit,basis:pr.basis};}return oc==='weight'?_expectedWeightChange(iv):null;})();
  if(ex&&rec.primary){rec.expected=ex;var lo=Math.min(ex.lo,ex.hi),hi=Math.max(ex.lo,ex.hi);rec.expectation=rec.primary.effect>=lo-rec.primary.se&&rec.primary.effect<=hi+rec.primary.se?'as expected':(Math.abs(rec.primary.effect)<Math.abs((lo+hi)/2)?'less than expected':'more than expected');}
  /* unintended consequences */
  rec.unintended=[];RESPONSE_SECONDARY.forEach(function(s){if(s[0]===oc)return;var lc=s[0]==='e1rm'?(function(){var b=_e1rmSeries(B[0],B[1]).map(function(x){return x.value;}),a=_e1rmSeries(A[0],A[1]).map(function(x){return x.value;});
      return b.length>=3&&a.length>=3?{change:mean(a)-mean(b),se:Math.sqrt(sd(b)*sd(b)/b.length+sd(a)*sd(a)/a.length)}:null;})():_levelChange(s[0],B,A);
    if(lc&&lc.change*s[1]>0&&Math.abs(lc.change)>2*lc.se)rec.unintended.push({quantity:s[0],change:round(lc.change,2),se:round(lc.se,2),text:s[2]});});
  /* burden: did logging fall away? */
  var logged=function(R){var days={};(DB.observations||[]).forEach(function(o){if(!o.retracted&&o.date>=R[0]&&o.date<=R[1])days[o.date]=1;});return Object.keys(days).length/Math.max(1,daysBetween(R[0],R[1])+1);};
  var lb=logged(B),la=logged(A);rec.burden={loggingBefore:round(lb,2),loggingAfter:round(la,2),note:la<lb-0.2?'logging fell from '+Math.round(lb*100)+'% to '+Math.round(la*100)+'% of days':'logging held steady'};
  /* what followed: decisions and adaptations it led to */
  rec.followedBy={planVersions:plansOf().filter(function(p){return p.effectiveFrom>d&&daysBetween(d,p.effectiveFrom)<=35;}).map(function(p){return p.version;}),
    decisions:(DB.decisions||[]).filter(function(x){var dd=String(x.date||x.at||'').slice(0,10);return dd>d&&daysBetween(d,dd)<=35;}).map(function(x){return x.id;}).slice(0,5)};
  /* verdict and confidence */
  var P=rec.primary;
  if(!P)rec.verdict='no outcome to judge: '+(oc?('too few '+oc+' readings'):'nothing this app measures would show it');
  else{var clear=Math.abs(P.effect)>2*P.se,expDir=ex?Math.sign((ex.lo+ex.hi)/2):null;
    rec.verdict=!clear?'no clear response yet':(expDir&&Math.sign(P.effect)!==expDir?'the opposite of what was expected':'a clear response');
    if(rec.placebo&&rec.placebo.alreadyUnderWay)rec.verdict+=' \u2014 but the change was already under way before it started';}
  rec.confidence=!P?'none':(rec.stage==='final'&&Math.abs(P.effect)>3*P.se&&!(rec.placebo&&rec.placebo.alreadyUnderWay)?'high':(Math.abs(P.effect)>2*P.se?'medium':'low'));
  return rec;
}
/* ---- persistence: recorded when it matures (provisional, then final); replayed from the log ---- */
function recordResponses(){
  DB.responses=DB.responses||[];var n=0;
  responseInterventions().forEach(function(iv){var r=evaluateResponse(iv);if(r.stage==='pending')return;
    var ex=DB.responses.filter(function(x){return x.id===r.id;})[0];if(ex&&(ex.stage===r.stage||ex.stage==='final'))return;
    DB.responses=DB.responses.filter(function(x){return x.id!==r.id;});DB.responses.push(r);emitEvent('response.recorded',r,{at:r.evaluatedAt});n++;});
  if(n)save('responses');return {status:'ok',recorded:n,total:DB.responses.length};
}
function responsesOf(){return (DB.responses||[]).slice().sort(function(a,b){return a.start<b.start?1:-1;});}
(function(){if(typeof MODELS==='undefined'||MODELS.some(function(m){return m.id==='intervention_response';}))return;
  MODELS.push({id:'intervention_response',name:'Intervention response',cls:'EMPIRICAL',version:'1.0',inputs:['weight','hunger','fatigue','sleep','steps','calories'],minN:4,
    assumes:['the trend before the change would have continued without it','nothing else changed at the same time'],
    failsWhen:['another change started at the same time','fewer than four readings on either side','the change was already under way (placebo check)'],
    output:'the effect of an intervention on its outcome, with its standard error, against a counterfactual',consumers:['responsesOf'],freshnessDays:7,uncertainty:{kind:'standard error of the difference in trends'},fn:'evaluateResponse'});})();
