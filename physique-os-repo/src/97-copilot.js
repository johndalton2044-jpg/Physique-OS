/* ============================================================================
   REGION: QUERY AND ASSISTANT (catalogue P, Q, R)

   The catalogue draws the boundary and it is the right one:

     "The AI should not be the reasoning engine. The deterministic engine computes; the AI explains.
      Mutations go through registered actions."

   So this file contains three things and deliberately does not contain a fourth:

     Q. A QUESTION LAYER that answers from the record deterministically. No model is involved, and the answer
        carries the same provenance and epistemic class as everything else. This is most of what people
        actually want from "ask your data a question".
     P. A CONTEXT PACKET an external model could consume, plus a CONTRACT it must satisfy, plus a VALIDATOR
        that checks a reply against the facts before it is ever shown.
     R. EVIDENCE LINKING against the citation registry already in the build, including the part usually left
        out: which claims have no citation behind them.

   What is NOT here: a model. None is wired in, none is called, and nothing pretends one is. An adapter can
   be registered; until one is, the assistant answers from the deterministic layer or says it cannot.
   ============================================================================ */

/* ---------------- Q. DETERMINISTIC QUESTION ANSWERING ----------------
   Every answer returns the same shape: a value, its epistemic class, what it rests on, and where to go for
   more. An unanswerable question says what it would need rather than guessing. */
/* H4: questions that the single-topic patterns below answered wrongly or not at all. These come first. */
var _QA_VARS={sleep:/\bsleep/i,hunger:/\bhunger|\bhungry|appetite/i,steps:/\bsteps?\b|walking/i,weight:/\bweight|\bweigh/i,
  calories:/calorie|\bkcal|\beating\b|\bintake/i,protein:/protein/i,cardio:/cardio/i,training:/training|lifting|workouts?/i,stress:/\bstress/i,strength:/strength|stronger/i};
function _qaVarsIn(q){return Object.keys(_QA_VARS).filter(function(k){return _QA_VARS[k].test(q);});}
var QUESTION_PATTERNS_H4=[
  /* A health condition is a clinician's question. Declined with the reason, never guessed at. */
  {id:'medical',re:/\b(kidney|liver|heart|blood pressure|cholesterol|medication|medicine|prescri|drug interaction|pregnan|breastfeed|diabet|thyroid|disease|diagnos|symptom|chest pain|dizz|faint|injur|safe for my|doctor)\b/i,
    answer:function(q){return {status:'declined',reason:'This is a question about a health condition, which needs a clinician who knows your history. The app can show what your records contain, but not judge what is safe for you.',
      act:'nav.supplements',cando:'Your supplement review shows the evidence for what you take, without advice about conditions.'};}},
  /* A calorie figure to eat or diet on is checked against the lowest intake the app will plan to for this person
     (estimated resting energy, or 1,200 / 1,500 kcal, whichever is higher). "Can I eat 800 calories a day?" had no
     answer at all. Below the floor it says so, and that very-low-calorie diets need medical supervision. */
  {id:'intake-floor',re:/\b(\d{3,4})\s*(k?cals?|calories)\b.*\b(a day|per day|daily|diet|eat)|\b(eat|diet|live on|have|stick to)\b.*\b(\d{3,4})\s*(k?cals?|calories)\b/i,
    answer:function(q){var m=q.match(/(\d{3,4})\s*(k?cals?|calories)/i);if(!m)return null;var kc=+m[1];
      var b=bmrPrior(),sex=(prof()||{}).sex,floor=Math.max(b.status==='ok'?b.bmr:0,sex==='female'?1200:1500),fl=roundTo(floor,10);
      var t=tdeeEstimate(),cs=calorieTargetSuggestion();
      /* Two different thresholds, kept apart: the medical line (1,200 / 1,500 kcal) and the app's planning floor (resting
         energy). The first version gave the medical warning to a 252 lb man asking about 2,000 kcal — a moderate deficit. */
      var med=sex==='female'?1200:1500,t0=tdeeEstimate(),defTxt=function(){if(t0.status!=='ok')return '';var d=t0.value-kc;return ' Against your maintenance of about '+fmtNum(roundTo(t0.value,10),0)+' kcal that is a deficit of about '+fmtNum(roundTo(d,10),0)+' kcal, roughly '+fmtSigned(-round(d*7/tissueKcalPerLb(),1),1)+' lb a week.';};
      if(kc<med)return {status:'caution',value:fmtNum(kc,0)+' kcal a day '+(kc<=800?'is a very-low-calorie diet':('is below the minimum generally advised without medical supervision ('+fmtNum(med,0)+' kcal)')),cls:'POLICY',
        basis:'Below about '+fmtNum(med,0)+' kcal a day, a diet needs medical supervision: muscle loss, gallstones and nutrient shortfalls become real risks. The app will not plan below '+fmtNum(fl,0)+' kcal for you.'+
          (cs?(' For your goal it suggests about '+fmtNum(cs.value,0)+' kcal a day.'):''),act:'nav.tab',arg:'plan',cando:'See your plan\u2019s target'};
      if(kc<floor)return {status:'caution',value:fmtNum(kc,0)+' kcal a day is below the app\u2019s planning floor for you ('+fmtNum(fl,0)+' kcal)',cls:'POLICY',
        basis:'The app does not plan below your estimated resting energy use, because deficits that deep raise the risk of losing muscle. This is the app\u2019s own cautious policy, not a medical line.'+defTxt()+
          (cs?(' For your goal it suggests about '+fmtNum(cs.value,0)+' kcal a day.'):''),act:'nav.tab',arg:'plan',cando:'See your plan\u2019s target'};
      if(t.status==='ok'){var def=t.value-kc,rate=def*7/tissueKcalPerLb();
        return {value:fmtNum(kc,0)+' kcal a day is '+(def>0?('a deficit of about '+fmtNum(roundTo(def,10),0)+' kcal'):('about '+fmtNum(roundTo(-def,10),0)+' kcal above maintenance')),cls:t.cls,
          basis:'Against your maintenance of about '+fmtNum(roundTo(t.value,10),0)+' kcal ('+fmtNum(roundTo(t.lo,10),0)+'\u2013'+fmtNum(roundTo(t.hi,10),0)+'), that is roughly '+fmtSigned(-round(rate,1),1)+' lb a week, before water and glycogen shifts.',act:'nav.tab',arg:'plan'};}
      return {status:'unknown',need:['a maintenance estimate']};}},
  /* Protein is its own question: "how much protein should I eat?" matched "eat" and was answered with a meal plan. */
  {id:'protein',re:/\bprotein\b/i,
    answer:function(q){var p=proteinTargetSuggestion();if(!p||p.lo==null)return {status:'unknown',need:['your weight or goal weight']};
      return {value:p.lo+'\u2013'+p.hi+' g a day',cls:p.cls||'PRIOR',basis:'Scaled to your '+p.basis+' ('+fmtWeight(p.anchorLb)+'). Source: '+p.source+'.',act:'nav.tab',arg:'food'};}},
  /* "Why did my weight go up?" \u2014 the commonest question, unanswered. A day-to-day change is compared with this person's
     own scale noise and the 7-day trend; usually the honest answer is water, food volume and sodium, not fat. */
  /* A single day's change only: "why is my weight not dropping" is a plateau question, with its own answer. */
  {id:'weight-day',re:/\bwhy\b.*\b(heavier|lighter)\b|\bwhy\b.*\bweigh\w*\b.*\b(up|jump\w*|spik\w*|gain\w*|increas\w*|higher|more)\b|\bweigh\w*\b.*\b(up|down|jump\w*|spik\w*|drop\w*)\b.*\b(today|yesterday|overnight|this morning)\b/i,
    answer:function(q){if(/\b(not|n't|no longer|stopp\w*|stuck|stall\w*|plateau\w*)\b/i.test(q))return null;var W=obsOf('weight').filter(function(o){return !o.retracted;}).sort(function(a,b){return a.date<b.date?-1:1;});
      if(W.length<2)return {status:'unknown',need:['two weigh-ins']};
      var a=W[W.length-2],b2=W[W.length-1],d=b2.value-a.value,tr=weightTrend(14);
      var noise=tr.status==='ok'?tr.residSd:null,within=noise!=null&&Math.abs(d)<=2*noise;
      return {value:(d>=0?'Up ':'Down ')+fmtWeight(Math.abs(d))+' since '+shortDate(a.date)+(within?' \u2014 within your normal day-to-day swing':' \u2014 more than your normal day-to-day swing'),cls:'DERIVED',
        basis:(noise!=null?('Your scale readings typically swing about \u00b1'+fmtWeight(round(noise,1))+' around the trend. '):'')+
          (tr.status==='ok'?('The 14-day trend is '+fmtSigned(round(tr.slopePerWeek,2),2)+' lb a week. '):'')+
          'One day\u2019s change mostly reflects water, food still in transit, sodium and carbohydrate \u2014 a pound of fat takes about 3,500 kcal of surplus, which one day rarely holds.',act:'nav.tab',arg:'progress'};}},
  /* "Does X affect Y?" is about a RELATIONSHIP. "Does sleep affect my hunger?" matched the sleep pattern and was
     answered with sleep duration — a status, not an answer; the app knows this relationship is not established. */
  /* Any inflection: "is my sleep affecting my weight?" missed \baffect\b and was answered with sleep duration. */
  {id:'relation',re:/\b(does|do|is|are|can|will)\b.*\b(affect\w*|impact\w*|influenc\w*|chang\w*|caus\w*|driv\w*|relat\w*|link\w*|help\w*|matter\w*|mak\w*)\b|\bbetween\b.*\band\b/i,
    answer:function(q){var V=_qaVarsIn(q);if(V.length<2)return null;
      var L=learningSummary(),hit=function(t){return V.every(function(v){return _QA_VARS[v].test(t);});};
      var un=(L.unknown||[]).filter(function(u){return hit(u.text);})[0];
      if(un)return {value:'Not established',cls:'EMPIRICAL',basis:un.prov||'there is not yet enough evidence either way',need:un.need||[],act:'exp.design',arg:V[0],cando:'Test it with an experiment'};
      /* What the app THINKS (an association) is an answer too — said as an association, not a cause. */
      var th=(L.think||[]).concat(L.know||[]).filter(function(t){return hit(t.text);})[0];
      if(th)return {value:'Possibly: '+th.text.charAt(0).toLowerCase()+th.text.slice(1),cls:'EMPIRICAL',basis:(th.prov||'')+(th.conf?('; confidence '+th.conf):'')+
        '. This is an association in your record, not a tested cause \u2014 other things differ on those days too.',act:'exp.design',arg:V[0],cando:'Test whether it is a cause'};
      var K=(personalKnowledge().items||[]).filter(function(i){return hit(i.subject+' '+i.statement);})[0];
      if(K)return {value:K.statement,cls:'EMPIRICAL',basis:K.evidence+'; confidence '+K.decayedConfidence+'; would change if '+K.wouldChange,act:'nav.knowledge'};
      return {value:'Not tested yet',cls:'EMPIRICAL',basis:'Nothing in your record measures how '+V[0]+' and '+V[1]+' relate. A raw correlation would not answer it; a deliberate change would.',act:'exp.design',arg:V[0],cando:'Design a test'};}},
  {id:'plan-change',re:/\bwhy\b.*\bplan\b|\bplan\b.*\bchang/i,
    answer:function(q){var X=explainPlanChange();if(X.status!=='ok')return {status:'unknown',need:['a plan']};
      return {value:X.headline,cls:'DERIVED',basis:(X.reason||'')+(X.evidence&&X.evidence.length?(' Evidence: '+X.evidence.slice(0,3).join('; ')+'.'):''),act:'nav.tab',arg:'plan'};}},
  {id:'stronger',re:/\bstronger\b|\bstrength\b|\bgetting strong/i,
    answer:function(q){var st=strengthTrend();if(st.status!=='ok')return {status:'unknown',need:['at least four sessions of a lift']};
      var per=st.per.filter(function(x){return x.status==='ok';});
      return {value:st.overall.charAt(0).toUpperCase()+st.overall.slice(1),cls:'DERIVED',
        basis:per.map(function(x){return x.exercise+': '+x.direction;}).join('; ')+'. "Improving" means the trend is clear of your session-to-session noise.',act:'nav.tab',arg:'progress'};}},
  {id:'goal-date',re:/\b(reach|hit|get to|make|achieve)\b.*\b(goal|target)\b|\bgoal\b.*\bby\b|\bwhen\b.*\b(goal|target)\b/i,
    answer:function(q){var g=goalTrajectory();if(g.status!=='ok')return {status:'unknown',need:g.need||['a goal weight and at least two weeks of weigh-ins']};
      /* The date ASKED about, when the question names one: "by December" is answered for December, not for the
         deadline in the profile. */
      var MON=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'],mm=q.toLowerCase().match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b(?:\s+(\d{4}))?/);
      var asked=null;if(mm){var mi=MON.indexOf(mm[1]),t0=todayISO(),y=mm[2]?+mm[2]:+t0.slice(0,4);var end=function(y){return new Date(Date.UTC(y,mi+1,0)).toISOString().slice(0,10);};
        asked=end(y);if(!mm[2]&&asked<t0)asked=end(y+1);}
      /* The wording follows the whole projected range, not only its centre: "likely" only if even the latest projection
         is in time, "possibly" if the central one is, "unlikely" if even the earliest is not. */
      var late=g.projectedLatest||null,early=g.projectedEarliest||g.projectedDate;
      var verdict=late&&late<=asked?'Likely by then':(g.projectedDate<=asked?'Possibly by then':(early<=asked?'Unlikely by '+shortDate(asked):'Not by '+shortDate(asked)));
      if(asked)return {value:verdict+' \u2014 projected around '+shortDate(g.projectedDate)+(g.projectedEarliest?(' (earliest '+shortDate(g.projectedEarliest)+')'):''),cls:'PREDICTIVE',
        basis:'At your current trend of '+round(g.trend.slopePerWeek,1)+' lb/week. A projection from your trend, not a promise.',act:'nav.tab',arg:'progress',trace:'forecast'};
      var byTarget=g.deadline?(g.projectedDate<=g.deadline?'on track for your target date':'later than your target date of '+shortDate(g.deadline)):'';
      return {value:'Around '+shortDate(g.projectedDate)+(g.projectedEarliest?(' (earliest '+shortDate(g.projectedEarliest)+')'):''),cls:'PREDICTIVE',
        basis:'At your current trend of '+round(g.trend.slopePerWeek,1)+' lb/week; '+byTarget+(g.requiredRate&&g.deadline?('. Reaching it by then needs '+Math.abs(round(g.requiredRate,1))+' lb/week, which is '+g.requiredVsBand):'')+'. A projection, not a promise.',act:'nav.tab',arg:'progress',trace:'forecast'};}},
  {id:'what-to-eat',re:/\b(what|should)\b.*\b(eat|meal|dinner|lunch|breakfast|snack)\b/i,
    answer:function(q){var pd=planDay(todayISO());if(pd.status!=='ok')return {status:'unknown',need:pd.need||['a calorie target and some foods in your list']};
      var c=pd.candidates[0];return {value:c.label+': '+c.items.slice(0,4).map(function(i){return i.food.name.split(',')[0];}).join(', '),cls:'DERIVED',
        basis:'Built to fit what is left of today\u2019s targets'+(pd.constraints&&pd.constraints.note?(' \u2014 '+pd.constraints.note):'')+'.',act:'nav.tab',arg:'food'};}}
];
var QUESTION_PATTERNS=[
  {id:'weight-now',re:/\b(what|how much).*(weigh|weight)\b|^weight\b/i,
   answer:function(){
     var w=currentWeight();
     if(w.value==null)return {status:'unknown',need:['a weigh-in']};
     return {value:fmtWeight(w.value),cls:'MEASURED',
       basis:'measured '+ageLabel(w.date),trace:'weight_trend',act:'log.type',arg:'weight'};}},
  {id:'trend',re:/\b(trend|losing|gaining|rate)\b/i,
   answer:function(){
     var t=weightTrend(14);
     if(t.status!=='ok')return {status:'unknown',need:t.need||['more weigh-ins']};
     return {value:fmtRate(t.slopePerWeek),cls:'DERIVED',
       basis:t.n+' weigh-ins over 14 days, confidence '+t.confidence,trace:'weight_trend'};}},
  {id:'tdee',re:/\b(tdee|maintenance|burn|expenditure)\b/i,
   answer:function(){
     /* The same figure the interface shows. Answering from a different function than the one on screen
        gives two different maintenance numbers to the same person on the same day. */
     var S=null;try{S=getCurrentState();}catch(e){}
     var t=(S&&S.tdee)||tdeePersonal();
     if(!t||t.status!=='ok')return {status:'unknown',need:(t&&t.need)||['overlapping intake and weight days']};
     return {value:fmtKcal(t.value),cls:t.cls,basis:t.basis||'the same estimate shown on Today',trace:'tdee'};}},
  {id:'deficit',re:/\b(deficit|surplus|energy balance)\b/i,
   answer:function(){
     var e=energyBalance();
     if(e.status!=='ok')return {status:'unknown',need:e.need||['intake and a maintenance estimate']};
     return {value:fmtKcal(e.balance)+'/day',cls:e.cls,basis:'over '+e.n+' logged days',trace:'energy_balance'};}},
  {id:'protein',re:/\b(protein)\b/i,
   answer:function(){
     var s=seriesWindow('protein',7);
     if(!s.length)return {status:'unknown',need:['protein logged']};
     return {value:fmtNum(mean(s.map(function(d){return d.value;})),0)+' g/day',cls:'MEASURED',
       basis:s.length+' of the last 7 days logged',act:'nav.missing'};}},
  {id:'decision',re:/\b(what should i do|should i change|next step|recommend)\b/i,
   answer:function(){
     var d=decide();
     if(!d)return {status:'unknown',need:['enough data for a decision']};
     return {value:d.verb||d.code,cls:'POLICY',basis:(d.why||[]).slice(0,2)
       .map(function(w){return typeof w==='string'?w:(w.text||'');}).join('; '),
       act:'obs.inspectDecision',arg:d.id};}},
  {id:'why-hold',re:/\b(why).*(hold|not chang|no change)\b/i,
   answer:function(){
     var d=decide();
     if(!d)return {status:'unknown',need:['a current decision']};
     return {value:(d.hold||[]).map(function(h){return typeof h==='string'?h:(h.text||'');}).join('; ')||
       (d.lede||'no reason recorded'),cls:'POLICY',basis:'the decision ledger',act:'obs.inspectDecision',arg:d.id};}},
  {id:'sleep',re:/\b(sleep|slept)\b/i,
   answer:function(){
     var s=sleepState();
     if(s.status!=='ok')return {status:'unknown',need:s.need||['nights logged']};
     return {value:fmtNum(s.mean,1)+' h, '+s.consistency,cls:'EMPIRICAL',
       basis:s.nights+' nights'+(s.debtHours>3?(', '+fmtNum(s.debtHours,0)+' h short against '+s.basis):''),
       act:'nav.domains'};}},
  {id:'readiness',re:/\b(readiness|recovered|recovery|how am i)\b/i,
   answer:function(){
     var r=readinessState();
     if(r.status!=='ok')return {status:'unknown',need:r.need||['a few days of ratings']};
     return {value:r.band,cls:'EMPIRICAL',basis:r.parts.length+' signals against your own baseline',act:'nav.domains'};}},
  {id:'missing',re:/\b(missing|what should i log|gaps)\b/i,
   answer:function(){
     var m=missingDataReport();
     var worst=m.rows.filter(function(r){return r.have<r.of;})
       .sort(function(a,b){return (a.have/a.of)-(b.have/b.of);})[0];
     if(!worst)return {value:'nothing important is missing',cls:'DERIVED',basis:'every tracked stream is current'};
     return {value:worst.label+' \u2014 '+worst.have+' of '+worst.of+' days',cls:'MEASURED',
       basis:'limits '+worst.limits,act:'nav.missing'};}},
  {id:'test-next',re:/\b(what should i test|experiment|find out)\b/i,
   answer:function(){
     var o=experimentOpportunities();
     if(!o.best)return {status:'unknown',need:['a runnable question \u2014 all of them are currently blocked']};
     return {value:o.best.question,cls:'DERIVED',
       basis:o.best.grade+' \u00b7 about '+o.best.weeks+' weeks',act:'nav.experiments2'};}},
  {id:'does-x-work',re:/\b(does|did)\b.*\b(work|help|do anything)\b/i,
   answer:function(text){
     var v=Object.keys(typeof RESPONSE_VARS!=='undefined'?RESPONSE_VARS:{})
       .filter(function(k){return new RegExp('\\b'+k,'i').test(text);})[0];
     if(!v)return {status:'unknown',need:['which of '+Object.keys(RESPONSE_VARS||{}).join(', ')+' you mean']};
     var c=causalSupport(v);
     return {value:v+': '+c.grade,cls:'EMPIRICAL',basis:c.why.join('; ')+' \u00b7 next: '+c.next,act:'nav.causal'};}}
];
function askQuestion(text){
  var q=String(text||'').trim();
  if(!q)return {status:'empty'};
  var ALL=QUESTION_PATTERNS_H4.concat(QUESTION_PATTERNS);
  for(var i=0;i<ALL.length;i++){
    var p=ALL[i];
    if(!p.re.test(q))continue;
    var a;
    try{a=p.answer(q);}catch(e){_q(e,'P2');continue;}
    if(!a)continue;
    if(a.status==='declined')return Object.assign({question:q,matched:p.id},a,{note:'Declined rather than answered: '+a.reason});
    if(a.status==='unknown')return {status:'unanswerable',question:q,matched:p.id,
      need:a.need||[],
      note:'The record cannot answer this yet. What it needs is above \u2014 no estimate is offered in place of it.'};
    return Object.assign({status:'ok',question:q,matched:p.id},a,
      {note:'Answered from the record, not from a model. The class and basis are the same ones the rest of the app uses.'});
  }
  return {status:'unmatched',question:q,
    suggestions:['what is my maintenance','am I getting stronger','will I reach my goal','why did my plan change',
      'what should I eat','does sleep affect my hunger','what should I test next'],
    note:'No deterministic answer matches that. Rather than guessing, here is what can be answered.'};
}
/* ---------------- P. CONTEXT PACKET ----------------
   What an external model would be given. Structured, bounded, and free of anything it does not need:
   no identifiers, no free-text notes, no food names, unless explicitly included. A model that cannot see
   the notes cannot leak them. */
function contextPacket(opts){
  opts=opts||{};
  var S=null;try{S=getCurrentState();}catch(e){}
  var pack={
    generatedAt:nowISO(),
    schema:'physique-context/1',
    state:{},
    classes:CLASSES,
    uncertainty:null,
    decision:null,
    domains:[],
    knowledge:[],
    gaps:[],
    actions:[],
    redactions:['record identifiers','free-text notes','food names','dates before the current phase']
  };
  try{
    pack.state={
      weight:S&&S.weight?S.weight.value:null,
      trend:S&&S.trend&&S.trend.status==='ok'?round(S.trend.slopePerWeek,2):null,
      trendConfidence:S&&S.trend?S.trend.confidence:null,
      tdee:S&&S.tdee&&S.tdee.status==='ok'?S.tdee.value:null,
      tdeeClass:S&&S.tdee?S.tdee.cls:null,
      trust:S&&S.trust?S.trust.overall.level:null,
      phase:(activePhase()||{}).type||null,
      week:S&&S.phaseWeek!=null?S.phaseWeek:null};
    var u=uncertaintyChain();
    pack.uncertainty={ceiling:u.ceiling,text:u.text||null};
    var d=decide();
    if(d)pack.decision={code:d.code,verb:d.verb,confidence:d.confidence,
      why:(d.why||[]).map(function(w){return typeof w==='string'?w:(w.text||'');}).slice(0,6)};
    pack.domains=domainSummary().map(function(x){return {id:x.id,status:x.status,headline:x.headline};});
    pack.knowledge=personalKnowledge().items.slice(0,12).map(function(k){
      return {kind:k.kind,subject:k.subject,statement:k.statement,
        confidence:k.decayedConfidence,freshness:k.freshness,context:k.context};});
    pack.gaps=domainGaps().slice(0,8).map(function(g){return {question:g.question,limits:g.limits};});
    /* The ONLY things a model may propose, and every one of them must be DISPATCHABLE. The register also
       contains palette entries that carry their own closure rather than a registered action; offering those
       would let a model propose something the app cannot actually execute. */
    pack.actions=commandRegister()
      .filter(function(c){return c.standalone&&!c.internal&&typeof ACTIONS[c.id]==='function';})
      .map(function(c){return {id:c.id,label:c.label,description:c.description||''};});
  }catch(e){_q(e,'P2');}
  if(opts.includeNotes){
    pack.notes=obsOf('note').slice(-10).map(function(o){return String(o.value).slice(0,160);});
    pack.redactions=pack.redactions.filter(function(r){return r!=='free-text notes';});
  }
  pack.numbers=_packetNumbers(pack);
  return pack;
}
function _packetNumbers(pack){
  var out={};
  var walk=function(v){
    if(v==null)return;
    if(typeof v==='number'&&isFinite(v)){out[_numKey(v)]=1;return;}
    if(typeof v==='string'){
      (v.match(/-?\d+(?:\.\d+)?/g)||[]).forEach(function(n){out[_numKey(parseFloat(n))]=1;});return;}
    if(Array.isArray(v)){v.forEach(walk);return;}
    if(typeof v==='object')Object.keys(v).forEach(function(k){walk(v[k]);});
  };
  walk(pack.state);walk(pack.decision);walk(pack.knowledge);walk(pack.domains);walk(pack.uncertainty);
  /* The goal, model, provenance and evidence context added in step 17 must be citable too. Without these, an
     assistant correctly quoting the goal weight or a model's track record would have its reply rejected as
     containing figures not in the context. */
  walk(pack.goal);walk(pack.models);walk(pack.evidence);
  return Object.keys(out);
}
function _numKey(n){return String(round(n,1));}
/* ---------------- the contract ---------------- */
var ASSISTANT_CONTRACT={
  version:1,
  may:['explain a figure already present in the context',
       'summarise or rephrase what the deterministic engine produced',
       'point at one of the registered actions supplied in the context',
       'say that it does not know'],
  mayNot:['compute a new number',
          'state a figure that is not in the context',
          'recommend a change that is not a registered action',
          'assert a causal claim beyond the grade the record supports',
          'give medical advice or name a clinical condition',
          'write to the record under any circumstance'],
  enforcement:'Every reply is validated against the context before it is shown. A reply containing a figure not present in the context is rejected, not corrected \u2014 a plausible wrong number is worse than no answer.'
};
var _assistantAdapter=null;
function registerAssistant(adapter){
  if(!adapter||typeof adapter.complete!=='function'){
    _q(new Error('an assistant adapter needs a complete(packet, question) function'),'P2');return false;}
  _assistantAdapter=adapter;return true;
}
function assistantState(){
  return {attached:!!_assistantAdapter,
    contract:ASSISTANT_CONTRACT,
    note:_assistantAdapter?'An adapter is attached. Every reply is still validated against the context before display.':
      'No model is attached. Questions are answered from the record by the deterministic layer, which is what answers most of them anyway.'};
}
/* Validation is the part that makes attaching a model defensible. */
function validateAssistantReply(reply,pack){
  var issues=[];
  var text=String(reply&&reply.text||reply||'');
  if(!text.trim())issues.push('empty reply');
  var known={};(pack.numbers||[]).forEach(function(n){known[n]=1;});
  /* Any figure in the reply must already exist in the context. Percentages and small integers are allowed
     through as prose ("three of them"), which is why the threshold is on specificity rather than presence. */
  var invented=[];
  (text.match(/-?\d+(?:\.\d+)?/g)||[]).forEach(function(raw){
    var n=parseFloat(raw);
    if(!isFinite(n))return;
    if(Math.abs(n)<=12&&Number.isInteger(n))return;          // small counts are prose, not claims
    if(known[_numKey(n)])return;
    if(known[_numKey(Math.round(n))])return;
    invented.push(raw);
  });
  if(invented.length)issues.push('figures not present in the context: '+invented.slice(0,5).join(', '));
  /* Any action it names must be registered and offered. */
  var allowed={};(pack.actions||[]).forEach(function(a){allowed[a.id]=1;});
  ((reply&&reply.actions)||[]).forEach(function(a){
    if(!allowed[a])issues.push('proposes an action that was not offered: '+a);});
  /* Stems, with no trailing word boundary: "tendin\b" does not match "tendinitis", which is exactly the
     word the guard exists to catch. */
  if(/\b(diagnos|tendin|tendon|sprain|strain\b|impinge|bursit|arthrit|prescrib|you (probably |likely )?have (a|an) )/i.test(text))
    issues.push('reads as clinical advice');
  if(/\b(proven|proves|definitely causes|guaranteed)\b/i.test(text))
    issues.push('claims certainty beyond what a personal record can support');
  return {ok:issues.length===0,issues:issues,
    note:issues.length?'Rejected rather than corrected. A plausible wrong number is worse than no answer.':'Reply is consistent with the context it was given.'};
}
/* The one entry point. With no adapter it simply answers deterministically, which is the honest default. */
function assistantAsk(question,opts){
  opts=opts||{};
  var deterministic=askQuestion(question);
  if(!_assistantAdapter)
    return Promise.resolve({source:'record',answer:deterministic,
      note:'Answered from the record. No model is attached, and for questions like this one none is needed.'});
  var pack=contextPacket(opts);
  return Promise.resolve(_assistantAdapter.complete(pack,question)).then(function(reply){
    var v=validateAssistantReply(reply,pack);
    if(!v.ok)return {source:'record',answer:deterministic,rejected:v.issues,
      note:'The model\u2019s reply failed validation against the context and was discarded. The deterministic answer is shown instead.'};
    return {source:'assistant',answer:deterministic,explanation:String(reply.text||reply),
      validated:true,note:'Explanation from the attached model, checked against the context. Every figure in it exists in the record.'};
  }).catch(function(e){
    _q(e,'P2');
    return {source:'record',answer:deterministic,error:String(e&&e.message||e),
      note:'The attached model failed. The deterministic answer is unaffected by that, which is the point of the arrangement.'};
  });
}
/* ---------------- R. EVIDENCE LINKING ----------------
   The half of a research assistant that can be built without fetching literature: connect a claim to the
   citation registry already in the build, and \u2014 more usefully \u2014 report which claims have nothing behind
   them. */
function evidenceFor(topic){
  var t=String(topic||'').toLowerCase();
  var hits=(typeof REF_EVIDENCE!=='undefined'?REF_EVIDENCE:[]).filter(function(e){
    return (e.tags||[]).some(function(g){return t.indexOf(String(g).toLowerCase())>=0||String(g).toLowerCase().indexOf(t)>=0;})||
      String(e.summary||'').toLowerCase().indexOf(t)>=0;});
  return {topic:topic,citations:hits.map(function(e){
      return {summary:e.summary,citation:e.citation,unverified:!!e.verify,id:e.id};}),
    count:hits.length,
    note:hits.length?'From the citation registry shipped with the build. Nothing is fetched.':
      'Nothing in the shipped registry covers that. The app does not search the literature and does not pretend to.'};
}
function uncitedClaims(){
  var out=[];
  try{
    var d=decide();
    if(d)(d.why||[]).forEach(function(w){
      var text=typeof w==='string'?w:(w.text||'');
      if(!text)return;
      var cited=(typeof REF_EVIDENCE!=='undefined'?REF_EVIDENCE:[]).some(function(e){
        return (e.tags||[]).some(function(g){return text.toLowerCase().indexOf(String(g).toLowerCase())>=0;});});
      /* A claim about THIS person's record needs no citation; a general claim does. */
      var general=/\b(should|typically|generally|research|studies|known to)\b/i.test(text);
      if(general&&!cited)out.push({claim:text,where:'current decision'});
    });
  }catch(e){_q(e,'P3');}
  return {claims:out,
    note:out.length?'General claims with nothing in the registry behind them. Claims about your own record need no citation; these are not those.':
      'Every general claim in the current decision is backed by the shipped registry.'};
}

/* ============================================================================
   STEP 17: COPILOT ORCHESTRATION
   What existed was sound: a written contract of what an assistant may and may not do, validation that rejects
   any reply containing a figure not in the context, and a deterministic answer underneath. What was missing,
   against the actions list: evidence, provenance, model and goal context; proposals, and validation of them;
   authorization before anything changes the record; explanation traces; and an answer to the question people
   actually ask most, "why is my weight not dropping".
   ============================================================================ */

/* ---- the plateau question ----
   Routed to the plateau diagnosis. If the premise is false \u2014 the weight IS dropping \u2014 the answer says so
   first, rather than inventing a reason for something that is not happening. */
QUESTION_PATTERNS.unshift({id:'plateau',
  re:/\b(not (dropping|losing|moving|going down|changing|getting (lighter|smaller|leaner))|isn'?t (dropping|moving|going down|changing)|stopped (losing|dropping)|stall(ed|ing)?|plateau(ed|ing)?|stuck|no progress)\b/i,
  answer:function(){
    var tr=weightTrend(14),d=diagnose(),p=d.primary||{};
    var falling=tr.status==='ok'&&tr.slopePerWeek<-0.25;
    return {value:falling?('It is dropping: '+fmtRate(tr.slopePerWeek)):(p.title||'No clear cause found'),
      cls:tr.status==='ok'?'DERIVED':'HEURISTIC',
      basis:falling?('the 14-day trend is '+fmtRate(tr.slopePerWeek)+' ('+tr.confidence+' confidence), so the premise does not hold \u2014 '+
        'day-to-day readings can hide a falling trend'):((p.summary||'')+(p.evidence&&p.evidence.length?(' Evidence: '+p.evidence.join('; ')+'.'):'')),
      trace:'weight_trend',act:'nav.diagnose'};}});

/* ---- context: the missing parts ---- */
var _contextPacketCore=contextPacket;
contextPacket=function(opts){
  var p=_contextPacketCore(opts);
  /* goal context */
  var ph=null;try{ph=activePhase();}catch(e){}
  var band=null;try{band=targetRate();}catch(e){}
  /* From the goal model, not a guessed field: the first version read ph.goalWeight, which does not exist — the
     field is goalWeightLb — so the goal context carried null, and a test that cited it "passed" only because
     null is not a number. The fourth field-name mismatch in three steps. */
  var gs=null;try{gs=getCurrentState().goal;}catch(e){}
  p.goal={phase:ph?ph.type:null,
    goalWeight:gs&&gs.status==='ok'?round(gs.goal,1):canonicalGoal().activeTargetLb,goalType:canonicalGoal().typeLabel,
    remaining:gs&&gs.status==='ok'?round(gs.remaining,1):null,deadline:gs&&gs.deadline||null,
    targetRate:band?{lo:band.lo,hi:band.hi}:null};
  /* model context: what each model behind an answer is, and how far it has earned trust */
  p.models=['weight_trend','weight_forecast','tdee_personal','recovery','adherence'].map(function(id){
    var c=null;try{c=modelContract(id);}catch(e){}
    if(!c)return null;
    return {id:id,version:c.version,maturity:c.maturity,
      trackRecord:c.maturityEvidence?c.maturityEvidence.verdict:null};}).filter(Boolean);
  /* provenance context: the run behind each headline figure */
  p.provenance=['weight_trend','tdee_personal'].map(function(id){
    var r=null;try{r=infer({modelId:id});}catch(e){}
    return r&&r.status==='ok'?{model:id,runId:r.runId,asOf:r.asOf}:null;}).filter(Boolean);
  /* evidence context: personal findings, with how current they are */
  var kg=null;try{kg=canonicalKnowledgeGraph();}catch(e){}
  p.evidence=kg?kg.nodes.filter(function(n){return n.type==='finding';}).slice(-6).map(function(n){
    return {finding:n.label,review:n.review&&n.review.state,applicability:n.applicability&&n.applicability.phase};}):[];
  /* The figures an assistant may cite must include the ones just added, or a correct citation would be rejected. */
  p.numbers=_packetNumbers(p);
  return p;
};

/* ---- proposals ---- */
var WRITING_ACTIONS={'decision.apply':1,'phase.edit':1,'gen.apply':1,'plan.adapt':1,'plan.reset':1,'yields.apply':1,'voice.apply':1,'data.restoreApply':1};
function copilotProposals(){
  var out=[];
  var dec=null;try{dec=decide();}catch(e){}
  if(dec&&dec.code&&dec.code!=='HOLD'){
    out.push({id:'prop-decision-'+dec.code,source:'decision engine',action:'decision.apply',writes:true,
      summary:dec.verb,rationale:dec.why||[],evidence:(dec.why||[]).length?['decision:'+dec.code]:[],
      expected:null});
  }
  var o=null;try{o=optimisePlans();}catch(e){}
  if(o&&o.status==='ok'){
    o.frontier.forEach(function(r){
      out.push({id:'prop-plan-'+String(r.name).replace(/[^a-z0-9]+/gi,'-'),source:'optimizer frontier',action:'nav.optimise',writes:false,
        summary:r.name,rationale:['on the Pareto frontier of '+o.feasibility.searched+' plans searched'],
        evidence:['optimizer'],expected:{rate:r.outcome,lo:r.outcomeLo,hi:r.outcomeHi},
        constraints:{withinBand:r.withinBand!==false,feasible:r.feasible!==false}});});
    (o.unresolvedAlternatives||[]).forEach(function(a){
      out.push({id:'prop-alt-'+String(a.plan).replace(/[^a-z0-9]+/gi,'-'),source:'optimizer alternative',action:'nav.optimise',writes:false,
        summary:a.plan+' (a bet on a faster result)',rationale:[a.why],evidence:['optimizer'],
        expected:{rate:a.outcome,lo:a.outcomeRange[0],hi:a.outcomeRange[1]},constraints:{withinBand:true,feasible:true}});});
  }
  return out.map(function(p){return Object.assign(p,{validation:validateProposal(p)});});
}
function validateProposal(p){
  var issues=[];
  if(!p||!p.action)issues.push('no action');
  else if(typeof ACTIONS==='undefined'||!ACTIONS[p.action])issues.push('the action "'+p.action+'" is not registered');
  if(!p.evidence||!p.evidence.length)issues.push('no evidence behind it');
  if(p.expected&&(p.expected.lo==null||p.expected.hi==null))issues.push('an expected outcome without its range');
  if(p.constraints&&(p.constraints.withinBand===false||p.constraints.feasible===false))issues.push('violates a constraint');
  if(p.writes&&!WRITING_ACTIONS[p.action])issues.push('marked as writing, but the action is not a known writing action');
  if(!p.writes&&WRITING_ACTIONS[p.action])issues.push('the action writes to the record but the proposal says it does not');
  return {ok:issues.length===0,issues:issues};
}

/* ---- authorization ----
   Nothing a proposal names is run by the copilot. A writing action becomes a pending authorization that only an
   explicit confirmation can carry out; a review action only opens a view. The adapter receives a copy of the
   context packet, never these functions, so a model cannot confirm on the person's behalf. */
var _PENDING_AUTH={};
function authorizeProposal(p){
  var v=validateProposal(p);
  if(!v.ok)return {status:'refused',issues:v.issues};
  if(!p.writes)return {status:'no-authorization-needed',action:p.action,note:'opens a view; nothing in the record changes'};
  var token='auth-'+sha256(p.id+'|'+nowISO()+'|'+Math.random()).slice(0,12);
  _PENDING_AUTH[token]={proposal:p,createdAt:nowISO()};
  return {status:'pending-confirmation',token:token,summary:p.summary,action:p.action,
    note:'This would change the record. It runs only when you confirm it.'};
}
function confirmAuthorization(token,confirmedBy){
  var a=_PENDING_AUTH[token];
  if(!a)return {status:'unknown-token',note:'No pending authorization with that token \u2014 it may already have been used.'};
  if(confirmedBy!=='person')return {status:'refused',note:'Only the person can confirm a change to the record.'};
  delete _PENDING_AUTH[token];
  emitEvent('copilot.authorized',{proposal:a.proposal.id,action:a.proposal.action,by:'person',requestedAt:a.createdAt});
  dispatchAct(a.proposal.action,a.proposal.arg||null);
  return {status:'executed',action:a.proposal.action};
}

/* ---- explanation traces ---- */
function explainAnswer(answer){
  if(!answer||!answer.trace)return {status:'no-trace',note:'This answer did not come from a registered model.'};
  var modelId=answer.trace;
  var r=null;try{r=infer({modelId:modelId});}catch(e){}
  var c=null;try{c=modelContract(modelId);}catch(e){}
  return {status:'ok',question:answer.question,answer:answer.value,
    model:{id:modelId,version:c&&c.version,maturity:c&&c.maturity,assumptions:c&&c.assumptions},
    run:r&&r.status==='ok'?{runId:r.runId,asOf:r.asOf,versionVector:r.versionVector}:null,
    inputs:r&&r.provenance?r.provenance.nodes.filter(function(n){return n.type==='observation';}).map(function(n){return n.source+' ('+(n.metadata&&n.metadata.count)+' readings)';}):[],
    uncertainty:r&&r.uncertainty?{sources:r.uncertainty.sources.map(function(s){return s.kind;}),calibration:r.uncertainty.calibration.status}:null,
    note:'Which model produced the answer, from which readings, in which run, and how far that model has earned trust.'};
}
