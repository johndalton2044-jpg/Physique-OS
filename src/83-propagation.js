/* ============================================================================
   REGION: ONTOLOGY → PHYSIOLOGY PROPAGATION (Work.md)

   Work.md states its own thesis better than a summary would:

     "The ontology is ahead of the physiological model."
     "information exists → information is classified → information is not fully operationalized."

   The exercise ontology already carries pattern, muscles, equipment, skill, ROM, stability, biomechanics,
   resistance curve, set type, RIR/RPE, tempo, load and reps. Downstream, almost everything collapsed back to
   sets, load, reps and e1RM. The chain the document asks for is:

     exercise mechanics → joint/muscle exposure → mechanical demand → stimulus → fatigue
                        → recovery cost → adaptation

   That chain is built here, once, so the engines above it stop re-deriving thin versions of it. Four things
   it deliberately does NOT do:

     * It does not claim to measure stimulus. Stimulus here is a weighted exposure index, and it says so.
     * It does not compartmentalise fatigue further than the record can support: local, systemic, connective
       and neural, no finer, because nothing in a phone app distinguishes below that.
     * It does not convert stimulus into predicted hypertrophy. The literature does not support a per-person
       dose-response curve at this resolution, and a number there would be invention.
     * It propagates UNCERTAINTY, not just point values. An RIR rating of 5 carries ±2.5 reps, and that has
       to survive into the fatigue figure rather than being dropped at the first multiplication.
   ============================================================================ */

/* ---------------- mechanical demand per set ----------------
   Everything the ontology knows about a set, combined into the demands that actually differ between
   exercises. Each component is named so the result can be argued with. */
function mechanicalDemand(set,opts){
  opts=opts||{};
  var ex=null;try{ex=resolveExercise(set.exercise);}catch(e){}
  if(!ex)return {status:'unknown',exercise:set.exercise,
    note:'not in the exercise ontology, so nothing can be propagated from it'};
  var bio=exerciseBiomechanics(set.exercise);
  var kind=SET_KINDS[setKind(set)]||SET_KINDS.working;
  var eff=effortOf(set);
  var rom=romOf(set);
  var tempo=parseTempo(set.tempo);
  var reps=num(set.reps)||0;
  var load=num(set.load);
  /* Time under tension where a tempo was recorded; otherwise the reps alone, flagged as assumed. */
  var tut=tempo?tempo.perRep*reps:(reps*3);
  var tutAssumed=!tempo;
  /* MECHANICAL: how much force-time the set demanded. Load matters, but so does range and tempo \u2014 the same
     load through half the range is not the same demand. */
  var mech=(load?Math.min(2,load/100):0.6)*rom.factor*(1+Math.min(1,tut/60))*0.5;
  /* NEURAL: coordination, stability and skill. This is what makes a heavy free-weight single costly in a way
     a machine set at the same relative load is not. */
  var stabilityCost={high:0.2,moderate:0.5,low:0.9}[bio.stability||'moderate'];
  var skillCost={low:0.2,moderate:0.5,high:0.9}[ex.skill||'moderate'];
  var neural=(stabilityCost+skillCost)/2*(eff.status==='ok'&&eff.rir<=1?1.3:1);
  /* CONNECTIVE: end-range loading and long muscle lengths are where tendon and joint stress concentrate. */
  var connective=(bio.curve==='lengthened'?0.8:(bio.curve==='shortened'?0.4:0.6))*
    (rom.kind==='extended'?1.3:(rom.kind==='lengthenedPartial'?1.1:1))*
    (load?Math.min(1.5,load/150):0.5);
  /* METABOLIC: reps and time under tension rather than load. */
  var metabolic=Math.min(1.5,(reps/12)*(1+Math.min(1,tut/80)));
  return {status:'ok',exercise:ex.name,pattern:ex.pattern,
    setKind:setKind(set),kindInferred:setKindInferred(set),
    mechanical:round(mech,3),neural:round(neural,3),
    connective:round(connective,3),metabolic:round(metabolic,3),
    tut:Math.round(tut),tutAssumed:tutAssumed,
    rom:rom.kind,romFactor:rom.factor,curve:bio.curve,
    effort:eff.status==='ok'?{rir:eff.rir,reliability:eff.reliability,uncertaintyReps:eff.uncertaintyReps}:null,
    stimulusWeight:kind.stimulus,fatigueWeight:kind.fatigue,counts:kind.volume,
    cls:'DERIVED',
    note:'The demands the ontology can distinguish, combined per set. Mechanical is force-time, neural is coordination and stability, connective is end-range and tendon stress, metabolic is reps and time under tension.',
    caveat:(tutAssumed?'No tempo recorded, so time under tension assumes three seconds a rep. ':'')+
      (eff.status!=='ok'?'No effort rating, so the neural cost is the unweighted default. ':'')+
      'These are indices for comparing sets against each other, not physical quantities.'};
}
/* ---------------- joint and muscle exposure ----------------
   Where the demand actually lands. Primary muscles take full credit, secondary half, and the joints the
   movement pattern declares take the connective share. */
function exposureOf(set){
  var d=mechanicalDemand(set);
  if(d.status!=='ok')return null;
  var ex=resolveExercise(set.exercise);
  var bio=exerciseBiomechanics(set.exercise);
  var muscles={},joints={};
  var stim=d.mechanical*d.stimulusWeight*(d.effort?(d.effort.rir<=2?1:(d.effort.rir<=4?0.7:0.35)):0.6);
  (ex.primary||[]).forEach(function(m){muscles[m]={stimulus:round(stim,3),direct:true};});
  (ex.secondary||[]).forEach(function(m){
    if(!muscles[m])muscles[m]={stimulus:round(stim*0.5,3),direct:false};});
  (bio.joints||[]).forEach(function(j){joints[j]=round(d.connective,3);});
  return {muscles:muscles,joints:joints,demand:d,
    systemic:round((ex.compound?1:0.35)*d.mechanical*d.fatigueWeight,3),
    neural:round(d.neural*d.fatigueWeight,3)};
}
/* ---------------- §fatigue compartments ----------------
   Work.md asks for fatigue to stop being one number. Four compartments, because those are the ones the
   record can distinguish \u2014 and they decay at different rates, which is the whole reason to separate them. */
var FATIGUE_COMPARTMENTS={
  local:{label:'Local muscular',halfLifeDays:2,note:'the muscle you trained; recovers fastest'},
  systemic:{label:'Systemic',halfLifeDays:4,note:'whole-body cost of compound work and deficit'},
  connective:{label:'Connective',halfLifeDays:7,note:'tendon and joint; the slowest and the one people ignore'},
  neural:{label:'Neural',halfLifeDays:3,note:'coordination and drive, which is why heavy singles cost more than they look'}
};
function fatigueCompartments(days){
  days=days||14;
  var from=addDays(asOf(),-(days-1));
  var local={},joints={},systemic=0,neural=0;
  var sets=0,withEffort=0,withTempo=0,unresolved=0;
  sessionsOf({from:from}).forEach(function(s){
    var age=daysBetween(s.date,asOf());
    (s.sets||[]).forEach(function(st){
      sets++;
      var e=exposureOf(st);
      if(!e){unresolved++;return;}
      if(e.demand.effort)withEffort++;
      if(!e.demand.tutAssumed)withTempo++;
      /* Exponential decay by compartment: a set eight days ago still counts against connective and barely
         against local, which is the point of separating them. */
      var decay=function(hl){return Math.pow(0.5,age/hl);};
      Object.keys(e.muscles).forEach(function(m){
        local[m]=round((local[m]||0)+e.muscles[m].stimulus*decay(FATIGUE_COMPARTMENTS.local.halfLifeDays),3);});
      Object.keys(e.joints).forEach(function(j){
        joints[j]=round((joints[j]||0)+e.joints[j]*decay(FATIGUE_COMPARTMENTS.connective.halfLifeDays),3);});
      systemic=round(systemic+e.systemic*decay(FATIGUE_COMPARTMENTS.systemic.halfLifeDays),3);
      neural=round(neural+e.neural*decay(FATIGUE_COMPARTMENTS.neural.halfLifeDays),3);
    });
  });
  if(!sets)return {status:'insufficient',need:['logged sessions in this window'],
    note:'Nothing logged, which is different from no fatigue.'};
  var coverage=round(100*withEffort/sets,0);
  return {status:'ok',cls:'HEURISTIC',days:days,sets:sets,
    local:local,connective:joints,systemic:systemic,neural:neural,
    highestLocal:Object.keys(local).sort(function(a,b){return local[b]-local[a];}).slice(0,4)
      .map(function(m){return {muscle:m,load:local[m]};}),
    highestConnective:Object.keys(joints).sort(function(a,b){return joints[b]-joints[a];}).slice(0,3)
      .map(function(j){return {joint:j,load:joints[j]};}),
    effortCoverage:coverage,tempoCoverage:round(100*withTempo/sets,0),
    unresolved:unresolved,
    confidence:coverage>=70?'low':'very low',
    note:'Four compartments decaying at different rates, which is why they are separate: local muscular clears in days, connective in a week or more. A single fatigue number averages those and tells you nothing about which one is limiting you.',
    caveat:'An accounting of exposure, not a measurement. '+coverage+'% of sets carried an effort rating and '+
      round(100*withTempo/sets,0)+'% a tempo; the rest fell back to defaults, which is the largest error here. '+
      (unresolved?(unresolved+' set(s) named exercises outside the ontology and were skipped.'):'')};
}
/* ---------------- recovery cost per exercise ----------------
   Work.md: recovery cost is not linked to individual exercise response. It is now, and the link is the
   propagation chain rather than a separate table. */
function exerciseRecoveryCost(name,days){
  days=days||56;
  var from=addDays(asOf(),-(days-1));
  var rows=[],demands=[];
  sessionsOf({from:from}).forEach(function(s){
    (s.sets||[]).forEach(function(st){
      if(st.exercise!==name)return;
      var d=mechanicalDemand(st);
      if(d.status==='ok')demands.push(d);
    });
  });
  if(!demands.length)return {status:'insufficient',need:['logged sets of '+name]};
  var avg=function(k){return round(mean(demands.map(function(d){return d[k];})),3);};
  /* Total cost weights the compartments by how long they take to clear, so a connective-heavy lift costs
     more per unit of stimulus than a metabolic one. */
  var cost=avg('mechanical')*0.3+avg('neural')*0.3+avg('connective')*0.3+avg('metabolic')*0.1;
  var stim=avg('mechanical')*0.6+avg('metabolic')*0.4;
  return {status:'ok',cls:'HEURISTIC',exercise:name,sets:demands.length,
    mechanical:avg('mechanical'),neural:avg('neural'),
    connective:avg('connective'),metabolic:avg('metabolic'),
    recoveryCost:round(cost,3),stimulusIndex:round(stim,3),
    ratio:cost?round(stim/cost,2):null,
    verdict:cost?((stim/cost)>=1.2?'gives more stimulus than it costs':
      ((stim/cost)>=0.8?'roughly even':'costs more than it gives, for you, as currently performed')):null,
    note:'Stimulus against cost for this lift as YOU perform it \u2014 the range you use, the tempo, the effort you take it to. The same exercise performed differently lands differently.',
    caveat:'Both sides are indices built from the ontology, not measurements. The ratio is useful for comparing one lift against another in your own programme and meaningless as an absolute.'};
}
function recoveryCostRanking(days){
  var names={};
  sessionsOf({from:addDays(asOf(),-(days||56))}).forEach(function(s){
    (s.sets||[]).forEach(function(st){if(st.exercise)names[st.exercise]=1;});});
  var rows=Object.keys(names).map(function(n){return exerciseRecoveryCost(n,days);})
    .filter(function(r){return r.status==='ok';})
    .sort(function(a,b){return (b.ratio||0)-(a.ratio||0);});
  return {rows:rows,
    best:rows[0]||null,worst:rows[rows.length-1]||null,
    cls:'HEURISTIC',
    note:'Your lifts ranked by stimulus against recovery cost, as you actually perform them. A lift low in this list is not a bad exercise \u2014 it is one you are currently taking more out of than you are putting in.'};
}
/* ---------------- uncertainty propagation ----------------
   Work.md: RIR/RPE uncertainty is not propagated into training-response uncertainty. An effort rating of 5
   carries \u00b12.5 reps, and that has to survive the multiplication rather than being dropped at it. */
function propagatedUncertainty(set){
  var d=mechanicalDemand(set);
  if(d.status!=='ok')return null;
  if(!d.effort)return {status:'unknown',
    note:'No effort rating, so there is no interval to propagate \u2014 the demand figures are point values with unstated error.'};
  var repErr=d.effort.uncertaintyReps;
  var reps=num(set.reps)||0;
  /* An error of \u00b1repErr reps at this effort translates into a proportional error in effective reps, which
     carries through the stimulus weighting linearly. */
  var frac=reps?repErr/(reps+d.effort.rir):0.3;
  var e1=e1rmFrom(set.load,set.reps,d.effort.rir);
  var e1Lo=e1rmFrom(set.load,set.reps,Math.max(0,d.effort.rir-repErr));
  var e1Hi=e1rmFrom(set.load,set.reps,d.effort.rir+repErr);
  return {status:'ok',cls:'DERIVED',
    effortReliability:d.effort.reliability,repError:repErr,
    fractionalError:round(frac,3),
    e1rm:e1!=null?round(e1,1):null,
    e1rmLo:e1Lo!=null?round(e1Lo,1):null,e1rmHi:e1Hi!=null?round(e1Hi,1):null,
    stimulusLo:round(d.mechanical*(1-frac),3),stimulusHi:round(d.mechanical*(1+frac),3),
    note:'The interval on an estimated maximum and on the stimulus index, both traced back to how uncertain the effort rating behind them was. Ratings far from failure are the least reliable, which is why the interval widens with reps in reserve.',
    caveat:'This propagates the EFFORT error only. Load and rep counts are treated as exact, which they nearly are, and the formula itself carries error this does not attempt to quantify.'};
}
