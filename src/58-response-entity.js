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
  /* converted through the one energy-density service; the result names the model and version it was converted under */
  var D=(iv.variable==='calories'||iv.variable==='steps')?energyDensityRef():null,kl=D?D.kcalPerLb:null;
  if(iv.variable==='calories'&&typeof iv.to==='number')return {lo:(iv.to-iv.from)*7/kl*1.3,hi:(iv.to-iv.from)*7/kl*0.7,unit:'lb/week',basis:'energy arithmetic ('+kl.toLocaleString()+' kcal per lb of scale weight), \u00b130%',density:D};
  if(iv.variable==='steps'&&kg&&typeof iv.to==='number'){var k=-(iv.to-iv.from)*0.0005*kg*7/kl;return {lo:k*1.5,hi:k*0.5,unit:'lb/week',basis:'about 0.5 kcal per step per kg, at '+kl.toLocaleString()+' kcal per lb, \u00b150%',density:D};}
  return null;}

/* ---- evaluation: before, during, after, and the counterfactual ---- */
function evaluateResponse(iv){return canonicalResponse(_evaluateResponseCore(iv),iv);}
function _evaluateResponseCore(iv){
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
      if(pr&&pr.n)return {lo:pr.lo,hi:pr.hi,mean:pr.mean,unit:pr.unit,basis:pr.basis,source:'personal_response'};}   /* source: scored for self-calibration */return oc==='weight'?_expectedWeightChange(iv):null;})();
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
  /* causal estimates beside the before/after one (Stage E, 94-causal.js): reported, never substituted for it */
  if(P&&typeof responseCausal==='function'){try{rec.causal=responseCausal(rec);}catch(e){_q(e,'P2');}}
  return rec;
}
/* ---- persistence: recorded when it matures (provisional, then final); replayed from the log ---- */
function recordResponses(){
  DB.responses=DB.responses||[];DB.exposures=DB.exposures||[];DB.outcomes=DB.outcomes||[];var n=0;
  responseInterventions().forEach(function(iv){var r=evaluateResponse(iv);if(r.stage==='pending')return;
    /* KNOWLEDGE VERSIONING (Stage E; TRANSITION item 7): a finding is derived again when it matures (provisional, then
       final) or when the method that derives it changes (RESPONSE_MODEL_VERSION). Each derivation is a new version that
       names the one it replaced; the earlier one stays in the event log. */
    var ex=DB.responses.filter(function(x){return x.id===r.id;})[0];if(ex&&ex.modelVersion===RESPONSE_MODEL_VERSION&&(ex.stage===r.stage||ex.stage==='final'))return;
    r.version=ex?(ex.version||1)+1:1;if(ex)r.previous={version:ex.version||1,stage:ex.stage,modelVersion:ex.modelVersion||'response-1.0',effect:ex.primary?ex.primary.effect:null,se:ex.primary?ex.primary.se:null,evaluatedAt:ex.evaluatedAt||null};
    /* Stage B (future plan items 12, 13, 15): the exposure received and the outcome measured are their own records,
       and the Response refers to them and to the plan version it judges */
    var E=exposureFor(iv,r),O=outcomeFrom(iv,r);
    if(E){DB.exposures=DB.exposures.filter(function(x){return x.id!==E.id;});DB.exposures.push(E);emitEvent('exposure.recorded',E,{at:r.evaluatedAt});r.exposureId=E.id;}
    if(O){DB.outcomes=DB.outcomes.filter(function(x){return x.id!==O.id;});DB.outcomes.push(O);emitEvent('outcome.recorded',O,{at:r.evaluatedAt});r.outcomeId=O.id;}
    r.planVersionId=planVersionAt(iv.start);
    DB.responses=DB.responses.filter(function(x){return x.id!==r.id;});DB.responses.push(r);emitEvent('response.recorded',r,{at:r.evaluatedAt});n++;});
  if(n)save('responses');return {status:'ok',recorded:n,total:DB.responses.length};
}
/* ---- EXPOSURE: the dose actually received in the window after a change, beside the dose before it ---- */
function _dailyMean(type,from,to){var S=_rangeSeries(type,from,to);return S.length?{mean:mean(S.map(function(x){return x.value;})),days:S.length}:null;}
function _exposureMeasure(variable,from,to){var span=Math.max(1,daysBetween(from,to)+1);
  if(variable==='calories'||variable==='steps'||variable==='protein'||variable==='sleep'){var m=_dailyMean(variable,from,to);
    return m?{received:round(m.mean,variable==='sleep'?1:0),unit:{calories:'kcal a day',steps:'steps a day',protein:'g a day',sleep:'hours a night'}[variable],coverage:round(m.days/span,2)}:null;}
  if(variable==='cardio'){var c=obsOf('cardio').filter(function(o){return o.date>=from&&o.date<=to;});return {received:round(c.reduce(function(a,o){return a+(o.value||0);},0)/(span/7),0),unit:'minutes a week',coverage:null};}
  if(variable==='training days'||variable==='training'){var ss=(DB.sessions||[]).filter(function(x){return !x.retracted&&x.date>=from&&x.date<=to;});
    return {received:round(ss.reduce(function(a,x){return a+(x.sets||[]).length;},0)/(span/7),1),unit:'sets a week',sessions:ss.length,coverage:null};}
  if(/^supplement: /.test(variable)){var name=variable.slice(12).toLowerCase(),days={};obsOf('supplement').forEach(function(o){if(o.date>=from&&o.date<=to&&String(o.value).toLowerCase().indexOf(name.split(' ')[0])>=0)days[o.date]=1;});
    return {received:round(Object.keys(days).length/span,2),unit:'share of days taken',coverage:null};}
  return null;}
function exposureFor(iv,r){var A=r.windows&&r.windows.after,B=r.windows&&r.windows.before;if(!A)return null;var after=_exposureMeasure(iv.variable,A[0],A[1]);if(!after)return null;
  var before=B?_exposureMeasure(iv.variable,B[0],B[1]):null;
  return {id:'expo:'+iv.id+':'+r.stage,interventionId:iv.id,responseId:r.id,variable:iv.variable,window:[A[0],A[1]],stage:r.stage,
    planned:typeof iv.to==='number'?iv.to:null,received:after.received,unit:after.unit,coverage:after.coverage,before:before?before.received:null,
    adherence:r.adherence?r.adherence.share:null,recordedAt:r.evaluatedAt,method:'measured from the record in the window after the change'};}
/* ---- OUTCOME: what was measured to change, its own record so more than one intervention can share it ---- */
function outcomeFrom(iv,r){var P=r.primary;if(!P)return null;
  return {id:'out:'+iv.id+':'+r.stage,responseId:r.id,quantity:P.quantity,unit:P.unit||null,window:r.windows.after,baselineWindow:r.windows.before,
    before:P.before,after:P.after,effect:P.effect,se:P.se,n:P.n,method:P.method,stage:r.stage,recordedAt:r.evaluatedAt};}
/* ---- the plan version a change was judged under ---- */
function planVersionAt(date){var P=plansOf().filter(function(p){return p.effectiveFrom<=date;});return P.length?P[P.length-1].id:null;}
function exposuresOf(){return (DB.exposures||[]).slice();}
function outcomesOf(){return (DB.outcomes||[]).slice();}
function responsesOf(){return (DB.responses||[]).slice().sort(function(a,b){return a.start<b.start?1:-1;});}
(function(){if(typeof MODELS==='undefined'||_registryTaken(MODELS,'MODELS','intervention_response'))return;
  MODELS.push({id:'intervention_response',name:'Intervention response',cls:'EMPIRICAL',version:'1.0',inputs:['weight','hunger','fatigue','sleep','steps','calories'],minN:4,
    assumes:['the trend before the change would have continued without it','nothing else changed at the same time'],
    failsWhen:['another change started at the same time','fewer than four readings on either side','the change was already under way (placebo check)','the record is too short for four matched periods (that estimate is then omitted)'],
    output:'the effect of an intervention on its outcome, with its standard error, against a counterfactual; beside it the interrupted series (allowing for carry-over) and the matched-periods estimate; and the day-by-day path without the change',consumers:['responsesOf','responseCounterfactual'],freshnessDays:7,uncertainty:{kind:'standard error of the difference in trends'},fn:'evaluateResponse'});})();
/* ============================================================================
   CANONICAL RESPONSE (audit A-002): every Response record carries the canonical field set explicitly, whatever produced
   the intervention (plan change, experiment, adaptation, supplement, optimiser choice), pending records included.
   ============================================================================ */
/* 1.2: each record carries its causal estimates beside the before/after one (Stage E) */
var RESPONSE_MODEL_VERSION='response-1.2';
function canonicalResponse(r,iv){if(!r)return r;var A=r.windows&&r.windows.after,P=r.primary||null,today=todayISO();
  /* what kind of claim this response supports (catalogue W-010): responsive, unless the explicit causal pathway holds */
  try{var ec=responseEpistemicClass(r);r.epistemicClass=ec.cls;r.epistemicBasis=ec.basis;}catch(e){_q(e,'P2');}
  r.exposureWindow=A?{from:A[0],to:A[1],days:Math.max(0,daysBetween(A[0],A[1]<today?A[1]:today)+1)}:null;
  r.executionIds=A?(DB.executions||[]).filter(function(x){return x.date>=A[0]&&x.date<=A[1]&&(!r.variable||!x.item||x.item===r.variable||x.item==='nutrition'&&r.variable==='calories'||x.item==='steps'&&r.variable==='steps');}).map(function(x){return x.id;}):[];
  r.expectedOutcome=r.expected?{mean:r.expected.mean,lo:r.expected.lo,hi:r.expected.hi,basis:r.expected.basis||null,unit:P&&P.unit||null}:null;
  r.observedOutcome=P?{quantity:P.quantity,before:P.before,after:P.after,unit:P.unit||null,n:P.n}:null;
  r.delta=P?P.effect:null;
  r.uncertainty=P?{se:P.se,interval95:[round(P.effect-2*P.se,2),round(P.effect+2*P.se,2)]}:null;
  /* context in the window, except the tag that records this intervention itself (it is not a confounder of itself) */
  var ctx=A?obsOf('context').filter(function(o){return o.date>=A[0]&&o.date<=A[1]&&!/^intervention:/i.test(String(o.value));}).map(function(o){return String(o.value);}):[];
  r.confounders=[].concat(r.placebo&&r.placebo.alreadyUnderWay?['the change was already under way before it started']:[],ctx.map(function(c){return 'context: '+c;}),
    (r.unintended||[]).filter(function(u){return u.flag;}).map(function(u){return 'also changed: '+u.quantity;}),
    A&&typeof regimeChangesIn==='function'?regimeChangesIn(A[0],A[1]).map(function(x){return 'regime change: '+x;}):[],r.adherence&&r.adherence.share!=null&&r.adherence.share<0.5?['carried out on only '+Math.round(r.adherence.share*100)+'% of days']:[]);
  r.attribution=!P?'nothing to attribute':(r.placebo&&r.placebo.alreadyUnderWay?'a trend already under way, not the change':(Math.abs(P.effect)>2*P.se&&!(r.adherence&&r.adherence.share!=null&&r.adherence.share<0.5)?'the change':'uncertain'));
  var ph=null;try{ph=activePhase(r.start);}catch(e){}r.applicability={phase:ph?ph.type:null,conditions:ctx,note:'what this says about you applies to a '+(ph?ph.type:'similar')+' phase under similar conditions'};
  r.evidence=[].concat(P?[{kind:P.quantity,method:P.method,n:P.n}]:[],r.placebo?[{kind:'placebo check',effect:r.placebo.effect,se:r.placebo.se}]:[],r.expectedOutcome?[{kind:'expectation',basis:r.expectedOutcome.basis}]:[],
    r.causal?(r.causal.estimates||[]).slice(1).map(function(e){return {kind:e.method,effect:e.effect,se:e.se};}):[]);
  r.modelVersion=RESPONSE_MODEL_VERSION;r.status=r.stage;r.confidence=r.confidence||'none';return r;}
/* ============================================================================
   ONE INTERVENTION LIFECYCLE (audit A-003), for every domain: proposed \u2192 accepted \u2192 scheduled \u2192 attempted \u2192 executed \u2192
   exposed \u2192 evaluated \u2192 completed \u2192 learned. A projection from existing records, never a second store.
   ============================================================================ */
var INTERVENTION_STATES=['proposed','accepted','scheduled','attempted','executed','exposed','evaluated','completed','learned'];
function interventionLifecycle(iv){var today=todayISO(),R=responsesOf().filter(function(r){return r.interventionId===iv.id;})[0]||null,t=[];
  var reach=function(state,at,evidence){t.push({state:state,at:at||null,evidence:evidence});};
  reach('proposed',iv.proposedAt||iv.start,iv.source||'recorded');
  reach('accepted',iv.start,'applied to the plan');
  if(iv.start<=today)reach('scheduled',iv.start,'in effect from '+iv.start);
  var S=iv.variable?seriesWindow(iv.variable,Math.max(1,daysBetween(iv.start,today)+1)).filter(function(x){return x.date>=iv.start;}):[];
  if(S.length||(R&&R.executionIds&&R.executionIds.length))reach('attempted',S.length?S[0].date:null,S.length+' day'+(S.length===1?'':'s')+' logged since');
  var share=R&&R.adherence?R.adherence.share:null;if(share!=null?share>=0.5:S.length>=3)reach('executed',null,share!=null?'carried out on '+Math.round(share*100)+'% of days':'logged on '+S.length+' days');
  if(daysBetween(iv.start,today)>=7)reach('exposed',addDays(iv.start,7),'a week of exposure');
  if(R&&(R.stage==='provisional'||R.stage==='final'))reach('evaluated',String(R.evaluatedAt||'').slice(0,10),'provisional verdict: '+R.verdict);
  if(R&&R.stage==='final')reach('completed',String(R.evaluatedAt||'').slice(0,10),'final verdict: '+R.verdict);
  if(R&&R.stage==='final'){var M=_safeLearned(R);if(M)reach('learned',null,M);}
  var reached=t.map(function(x){return x.state;}),state=INTERVENTION_STATES.filter(function(s){return reached.indexOf(s)>=0;}).slice(-1)[0];
  return {id:iv.id,kind:iv.kind,variable:iv.variable,state:state,transitions:t,next:INTERVENTION_STATES[INTERVENTION_STATES.indexOf(state)+1]||null};}
function _safeLearned(R){try{var M=personalResponseModel(),row=M.rows.filter(function(x){return x.variable===R.variable&&x.n>0;})[0];return row?'in the personal response model ('+Math.round(row.personalWeight*100)+'% your own data)':null;}catch(e){return null;}}
function interventionLifecycles(){return responseInterventions().map(interventionLifecycle);}
/* ============================================================================
   INDIVIDUAL STATE (audit A-005): one read-only projection of the person, composed from each domain's own read model.
   Frozen: nothing may write through it.
   ============================================================================ */
function individualState(){var g=function(f,d){try{return f();}catch(e){return d;}};
  var st={asOf:asOf(),goal:g(canonicalGoal,null),constraints:g(constraintModel,null),plan:g(function(){var p=currentPlan();return p?{id:p.id,version:p.version,effectiveFrom:p.effectiveFrom}:null;},null),phase:g(activePhase,null),
    training:g(function(){var ps=programStructure();return {program:(trainingProgram()||{}).label||null,status:ps.status};},null),nutrition:g(function(){var d=dayNutrition(todayISO());return {today:d.totals||null};},null),
    activity:g(function(){var s=seriesWindow('steps',7);return {stepsAvg7:s.length?Math.round(mean(s.map(function(x){return x.value;}))):null};},null),
    recovery:g(function(){return {fatigueAvg7:(function(v){return v.length?round(mean(v),1):null;})(seriesWindow('fatigue',7).map(function(x){return x.value;}))};},null),
    bodyComposition:g(function(){var r=physiqueRate();return {rate:r.status==='ok'?{pctPerWeek:r.pctPerWeek,range:r.range}:null};},null),
    execution:g(function(){return adherenceState(14);},null),response:g(function(){return personalResponseModel().rows.filter(function(r){return r.n>0;}).map(function(r){return {key:r.key,mean:r.posterior.mean,personal:r.personalWeight};});},[]),
    evidence:g(function(){return {responses:responsesOf().length,final:responsesOf().filter(function(r){return r.stage==='final';}).length};},null),
    adaptation:g(function(){return {planVersions:plansOf().length,interventions:interventionLifecycles().map(function(l){return {id:l.id,state:l.state};})};},null),
    /* Stage B: values with uncertainty and freshness, capabilities, and the regimes in force */
    vector:g(stateVector,null),capability:g(capabilityVector,null),regimes:g(function(){return currentRegimes();},[])};
  return _deepFreeze(st);}
function _deepFreeze(o){if(o&&typeof o==='object'&&!Object.isFrozen(o)){Object.freeze(o);Object.keys(o).forEach(function(k){_deepFreeze(o[k]);});}return o;}
