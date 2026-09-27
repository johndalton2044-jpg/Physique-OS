/* ============================================================================
   REGION: RESISTANCE DEPTH (catalogue §3.1–§3.12)

   The catalogue's own rule governs the shape of this:

     DOMAIN → ONTOLOGY → OBSERVATIONS → EVENTS → STATE → MODEL → UNCERTAINTY → DECISION

   so this is not twelve features. It is one ontology with models layered on it, and every model reports the
   same way everything else in this app reports: with an epistemic class, and with the things it cannot know
   stated rather than papered over.

   The honesty problem specific to resistance training is worth naming up front, because it decides how much
   of this can be believed. Almost every quantity here is derived from three numbers a person typed — load,
   reps, and a subjective effort rating. Estimated 1RM is a formula fitted to populations. "Effective sets"
   is a modelling convention, not a measurement of tissue. Fatigue is an accounting scheme, not a biopsy.
   Each carries the class that reflects that, and none is dressed as MEASURED.
   ============================================================================ */

/* ---------------- §3.1 IMPLEMENTS ----------------
   The existing ontology declares equipment for availability checks. Implements are a different question:
   what the resistance DOES across a range, which is what the curve model needs. */
var IMPLEMENTS={
  barbell:{label:'Barbell',curve:'even',stability:'moderate',loadable:'fine',note:'both limbs share one bar, so a strong side can carry a weak one'},
  dumbbell:{label:'Dumbbell',curve:'variable',stability:'low',loadable:'coarse',note:'each limb works independently and the jumps between weights are large'},
  kettlebell:{label:'Kettlebell',curve:'variable',stability:'low',loadable:'coarse',note:'the offset handle changes the moment arm through the range'},
  machine:{label:'Machine',curve:'even',stability:'high',loadable:'coarse',note:'the path is fixed, so stability demand is low and effort is easier to rate'},
  cable:{label:'Cable',curve:'even',stability:'moderate',loadable:'fine',note:'tension is roughly constant through the range'},
  smith:{label:'Smith machine',curve:'even',stability:'high',loadable:'fine',note:'a fixed bar path; loads are not comparable to a free bar'},
  plateLoaded:{label:'Plate-loaded',curve:'variable',stability:'high',loadable:'coarse',note:'cam design decides where it is hardest'},
  band:{label:'Band',curve:'shortened',stability:'low',loadable:'unmeasured',note:'tension rises as the band stretches, so it is hardest where the muscle is shortest \u2014 and the load is not a number'},
  chain:{label:'Chain',curve:'shortened',stability:'moderate',loadable:'coarse',note:'links lift off the floor through the range, adding load toward lockout'},
  bodyweight:{label:'Bodyweight',curve:'variable',stability:'low',loadable:'leverage',note:'leverage is the load; progression comes from position, not from plates'},
  weightedBodyweight:{label:'Weighted bodyweight',curve:'variable',stability:'low',loadable:'fine',note:'bodyweight plus added load, so the total moved is not the number on the belt'}
};
/* ---------------- §3.2 BIOMECHANICS ----------------
   Declared per movement pattern, overridden per exercise where the exercise genuinely differs. Pattern-level
   defaults mean a new exercise inherits sensible biomechanics instead of arriving blank. */
var PATTERN_MECHANICS={
  'squat':{plane:'sagittal',joints:['hip','knee','ankle'],force:'vertical',stability:'moderate',
    lengthened:'bottom',shortened:'top',sticking:'just above parallel',curve:'lengthened',rom:'deep'},
  'hinge':{plane:'sagittal',joints:['hip','knee'],force:'vertical',stability:'moderate',
    lengthened:'bottom',shortened:'lockout',sticking:'off the floor or mid-shin',curve:'lengthened',rom:'moderate'},
  'lunge':{plane:'sagittal',joints:['hip','knee','ankle'],force:'vertical',stability:'low',
    lengthened:'bottom',shortened:'top',sticking:'bottom third',curve:'lengthened',rom:'deep'},
  'horizontal push':{plane:'transverse',joints:['shoulder','elbow'],force:'horizontal',stability:'moderate',
    lengthened:'chest',shortened:'lockout',sticking:'just off the chest',curve:'lengthened',rom:'moderate'},
  'incline push':{plane:'oblique',joints:['shoulder','elbow'],force:'oblique',stability:'moderate',
    lengthened:'bottom',shortened:'lockout',sticking:'lower third',curve:'lengthened',rom:'moderate'},
  'vertical push':{plane:'frontal',joints:['shoulder','elbow'],force:'vertical',stability:'low',
    lengthened:'bottom',shortened:'overhead',sticking:'eye level',curve:'midrange',rom:'moderate'},
  'vertical pull':{plane:'frontal',joints:['shoulder','elbow'],force:'vertical',stability:'moderate',
    lengthened:'hang',shortened:'chin over bar',sticking:'mid pull',curve:'lengthened',rom:'full'},
  'horizontal pull':{plane:'transverse',joints:['shoulder','elbow'],force:'horizontal',stability:'moderate',
    lengthened:'arms extended',shortened:'bar to torso',sticking:'final third',curve:'shortened',rom:'moderate'},
  'knee extension':{plane:'sagittal',joints:['knee'],force:'rotational',stability:'high',
    lengthened:'bottom',shortened:'lockout',sticking:'mid range',curve:'shortened',rom:'full'},
  'knee flexion':{plane:'sagittal',joints:['knee'],force:'rotational',stability:'high',
    lengthened:'straight leg',shortened:'heel to glute',sticking:'mid range',curve:'midrange',rom:'full'},
  'elbow flexion':{plane:'sagittal',joints:['elbow'],force:'rotational',stability:'moderate',
    lengthened:'arm extended',shortened:'full flexion',sticking:'mid range',curve:'midrange',rom:'full'},
  'elbow extension':{plane:'sagittal',joints:['elbow'],force:'rotational',stability:'moderate',
    lengthened:'behind the head',shortened:'lockout',sticking:'mid range',curve:'lengthened',rom:'full'},
  'abduction':{plane:'frontal',joints:['shoulder'],force:'rotational',stability:'low',
    lengthened:'arms down',shortened:'arms level',sticking:'upper third',curve:'shortened',rom:'moderate'},
  'plantar flexion':{plane:'sagittal',joints:['ankle'],force:'vertical',stability:'high',
    lengthened:'heel below',shortened:'top',sticking:'top',curve:'lengthened',rom:'full'},
  'trunk flexion':{plane:'sagittal',joints:['spine'],force:'rotational',stability:'low',
    lengthened:'extended',shortened:'flexed',sticking:'mid range',curve:'midrange',rom:'moderate'},
  'scapular elevation':{plane:'frontal',joints:['scapula'],force:'vertical',stability:'high',
    lengthened:'bottom',shortened:'top',sticking:'top',curve:'shortened',rom:'short'},
  'carry':{plane:'none',joints:['whole body'],force:'vertical',stability:'low',
    lengthened:'n/a',shortened:'n/a',sticking:'n/a',curve:'even',rom:'isometric'}
};
/* Exercise-level overrides, only where the exercise really departs from its pattern. */
/* Keyed by the ontology's own ids. Guessed keys ('hip-thrust' for 'hipthrust') silently never match, and a
   biomechanics override that never fires is worse than none — it reads as covered. */
var EXERCISE_MECHANICS={
  'rdl':{rom:'moderate',sticking:'mid-shin',note:'stopped short of the floor by design, so range is a choice rather than a limit'},
  'hipthrust':{curve:'shortened',lengthened:'bottom',shortened:'lockout',sticking:'lockout',
    note:'hardest where the glutes are shortest, which is the opposite of a squat'},
  'latraise':{curve:'shortened',note:'the moment arm is longest at the top, which is where it is hardest'},
  'legcurl':{curve:'midrange'},
  'calf':{curve:'lengthened'}
};
/* Every override key must name a real exercise, checked at load rather than trusted. */
(function(){
  try{
    Object.keys(EXERCISE_MECHANICS).forEach(function(k){
      if(typeof EXERCISES!=='undefined'&&!Object.keys(EXERCISES).some(function(i){return EXERCISES[i]&&EXERCISES[i].id===k;}))
        _q(new Error('biomechanics override for unknown exercise id: '+k),'P2');
    });
  }catch(e){}
})();
function exerciseBiomechanics(name){
  var e=null;try{e=resolveExercise(name);}catch(err){}
  if(!e)return {status:'unknown',note:'not in the exercise ontology, so nothing can be said about how it loads'};
  var base=PATTERN_MECHANICS[e.pattern]||{};
  var over=EXERCISE_MECHANICS[e.id]||{};
  var eq=Array.isArray(e.equipment)?e.equipment:[];
  /* The implement modifies the curve: a band on a pattern that is otherwise lengthened-biased is not. */
  var impl=null;
  ['band','chain','cable','machine','smith','dumbbell','barbell','bodyweight'].forEach(function(k){
    if(!impl&&eq.indexOf(k)>=0)impl=k;});
  var implData=impl?IMPLEMENTS[impl]:null;
  var curve=over.curve||base.curve||'even';
  var curveSource='the movement pattern';
  if(implData&&(impl==='band'||impl==='chain')){curve=implData.curve;curveSource='the implement, which overrides the pattern';}
  else if(over.curve)curveSource='this exercise specifically';
  return Object.assign({status:'ok',cls:'PRIOR',exercise:e.name,id:e.id,pattern:e.pattern},base,over,{
    implement:impl,implementNote:implData?implData.note:null,
    stability:implData?implData.stability:(over.stability||base.stability),
    curve:curve,curveSource:curveSource,
    note:'Declared from the movement pattern and the implement, not measured from you. Where you are actually weakest in a lift is individual and this does not know it.'});
}
/* ---------------- §3.3 RESISTANCE CURVE ---------------- */
var CURVE_CLASSES={
  lengthened:{label:'Lengthened-biased',meaning:'hardest where the muscle is longest',
    where:'the bottom of the movement'},
  shortened:{label:'Shortened-biased',meaning:'hardest where the muscle is shortest',
    where:'the top of the movement'},
  midrange:{label:'Midrange-biased',meaning:'hardest in the middle',where:'mid range'},
  even:{label:'Even',meaning:'roughly constant tension through the range',where:'throughout'},
  variable:{label:'Variable',meaning:'depends on the implement and the path',where:'not fixed'}
};
function resistanceProfile(name){
  var b=exerciseBiomechanics(name);
  if(b.status!=='ok')return b;
  var c=CURVE_CLASSES[b.curve]||CURVE_CLASSES.even;
  return {status:'ok',cls:'PRIOR',exercise:b.exercise,curve:b.curve,
    label:c.label,meaning:c.meaning,hardestAt:c.where,
    lengthenedAt:b.lengthened,shortenedAt:b.shortened,stickingRegion:b.sticking,
    source:b.curveSource,
    note:'A description of where the resistance is highest, taken from the pattern and implement. It is a starting assumption, not a measurement, and the evidence that lengthened-biased work is better for growth is suggestive rather than settled.'};
}
/* Coverage: is a muscle only ever trained where it is short? That is answerable from the plan. */
function curveCoverage(days){
  var from=addDays(asOf(),-(days||28));
  var byMuscle={};
  sessionsOf({from:from}).forEach(function(s){
    (s.sets||[]).forEach(function(st){
      var e=null;try{e=resolveExercise(st.exercise);}catch(err){}
      if(!e)return;
      var b=exerciseBiomechanics(st.exercise);
      (e.primary||[]).forEach(function(m){
        byMuscle[m]=byMuscle[m]||{lengthened:0,shortened:0,midrange:0,even:0,variable:0,total:0};
        byMuscle[m][b.curve]=(byMuscle[m][b.curve]||0)+1;
        byMuscle[m].total++;
      });
    });
  });
  var rows=Object.keys(byMuscle).map(function(m){
    var c=byMuscle[m];
    var onlyShort=c.total>=6&&c.lengthened===0&&c.shortened>0;
    return {muscle:m,counts:c,total:c.total,onlyShortened:onlyShort,
      note:onlyShort?'every set for this muscle is shortened-biased; nothing loads it near full stretch':null};
  }).sort(function(a,b2){return b2.total-a.total;});
  return {rows:rows,cls:'DERIVED',days:days||28,
    note:'Counted from the exercises you actually performed and the curve each is assumed to have. Whether lengthened-biased work matters as much as is currently claimed is not settled, so this reports the imbalance rather than prescribing a fix.'};
}
/* ---------------- §3.4 SET ONTOLOGY ----------------
   A set's KIND decides what it counts toward. Counting a warm-up single as a working set is how volume
   totals become meaningless. */
var SET_KINDS={
  warmup:{label:'Warm-up',volume:false,stimulus:0,fatigue:0.05,note:'preparation; counts toward neither volume nor strength'},
  ramp:{label:'Ramp',volume:false,stimulus:0.05,fatigue:0.1},
  technique:{label:'Technique',volume:false,stimulus:0.1,fatigue:0.1},
  activation:{label:'Activation',volume:false,stimulus:0.1,fatigue:0.05},
  top:{label:'Top set',volume:true,stimulus:1,fatigue:1,note:'the heaviest working set'},
  working:{label:'Working',volume:true,stimulus:1,fatigue:0.9},
  backoff:{label:'Back-off',volume:true,stimulus:0.9,fatigue:0.7},
  volume:{label:'Volume',volume:true,stimulus:0.9,fatigue:0.8},
  strength:{label:'Strength',volume:true,stimulus:0.7,fatigue:1.1,note:'low reps, high load: more neural cost per unit of growth stimulus'},
  hypertrophy:{label:'Hypertrophy',volume:true,stimulus:1,fatigue:0.9},
  endurance:{label:'Endurance',volume:true,stimulus:0.6,fatigue:0.7},
  amrap:{label:'AMRAP',volume:true,stimulus:1.1,fatigue:1.3},
  failure:{label:'To failure',volume:true,stimulus:1.1,fatigue:1.5,note:'more stimulus per set and disproportionately more fatigue'},
  overload:{label:'Overload',volume:true,stimulus:0.8,fatigue:1.4},
  drop:{label:'Drop set',volume:true,stimulus:1.2,fatigue:1.5},
  restPause:{label:'Rest-pause',volume:true,stimulus:1.2,fatigue:1.4},
  myoRep:{label:'Myo-rep',volume:true,stimulus:1.2,fatigue:1.3},
  cluster:{label:'Cluster',volume:true,stimulus:1,fatigue:1.1},
  giant:{label:'Giant set',volume:true,stimulus:1,fatigue:1.3},
  superset:{label:'Superset',volume:true,stimulus:1,fatigue:1.1}
};
function setKind(st){
  if(st&&st.kind&&SET_KINDS[st.kind])return st.kind;
  /* Inference where it was not recorded, stated as inference. A set at high RIR early in an exercise looks
     like a warm-up; this is a guess and the caller is told so. */
  if(st&&st.rir!=null&&st.rir>=5)return 'warmup';
  return 'working';
}
function setKindInferred(st){return !(st&&st.kind&&SET_KINDS[st.kind]);}
/* ---------------- §3.5 EFFORT ----------------
   RPE and RIR are the same axis from opposite ends, and both are subjective. The conversion is exact; the
   underlying rating is not, and that is where the uncertainty belongs. */
function effortOf(st){
  var rir=null,source=null;
  if(st.rir!=null){rir=num(st.rir);source='RIR';}
  else if(st.rpe!=null){rir=10-num(st.rpe);source='RPE';}
  else if(st.failure){rir=0;source='recorded as failure';}
  if(rir==null)return {status:'unknown',note:'no effort recorded, so this set cannot be placed on the effort axis'};
  var kind=st.failureKind||null;
  return {status:'ok',cls:'MEASURED',rir:rir,rpe:round(10-rir,1),source:source,
    failureKind:kind,
    /* Subjective ratings are least reliable far from failure: people are poor at telling 4 from 6 reps in
       reserve and good at telling 0 from 2. */
    reliability:rir<=2?'good':(rir<=4?'moderate':'poor'),
    uncertaintyReps:rir<=2?1:(rir<=4?1.5:2.5),
    note:'A rating, not a measurement. Estimates far from failure are the least reliable, which is why the interval widens as reps in reserve rise.'};
}
/* ---------------- §3.6 ROM ---------------- */
var ROM_KINDS={
  full:{label:'Full range',factor:1},
  lengthenedPartial:{label:'Lengthened partial',factor:0.85,note:'partial range in the stretched position'},
  shortenedPartial:{label:'Shortened partial',factor:0.6,note:'partial range where the muscle is short'},
  partial:{label:'Partial',factor:0.7},
  extended:{label:'Extended range',factor:1.1,note:'deficit or extended-range work'}
};
function romOf(st){
  var k=(st&&st.rom&&ROM_KINDS[st.rom])?st.rom:'full';
  return Object.assign({kind:k,inferred:!(st&&st.rom)},ROM_KINDS[k]);
}
/* ---------------- §3.7 TEMPO ---------------- */
function parseTempo(t){
  if(!t)return null;
  var m=String(t).trim().match(/^(\d+)\s*[-/:]\s*(\d+)\s*[-/:]\s*(\d+|X|x)\s*(?:[-/:]\s*(\d+))?$/);
  if(!m)return null;
  var conc=/x/i.test(m[3])?1:+m[3];
  return {eccentric:+m[1],pauseBottom:+m[2],concentric:conc,pauseTop:m[4]!=null?+m[4]:0,
    explosive:/x/i.test(m[3]),
    perRep:(+m[1])+(+m[2])+conc+(m[4]!=null?+m[4]:0)};
}
function timeUnderTension(st){
  var t=parseTempo(st&&st.tempo);
  if(!t||!st.reps)return {status:'unknown',need:['a tempo on the set'],
    note:'Without a recorded tempo, time under tension cannot be computed, and assuming a default would invent the number.'};
  return {status:'ok',cls:'DERIVED',seconds:round(t.perRep*st.reps,0),perRep:t.perRep,tempo:t,
    note:'Computed from the tempo you recorded. It assumes you held the tempo, which nobody does exactly.'};
}
/* ---------------- §3.8 STRENGTH ----------------
   Epley for e1RM, which is a population formula and degrades badly above about ten reps. Rep-maxes are
   inverted from the same formula and carry the same caveat. */
function e1rmFrom(load,reps,rir){
  if(load==null||reps==null)return null;
  var effReps=reps+(rir!=null?rir:0);
  if(effReps<=0)return null;
  if(effReps>15)return null;   // the formula stops meaning much here
  return load*(1+effReps/30);
}
function repMax(name,n,opts){
  opts=opts||{};
  var days=opts.days||60;
  var sets=[];
  sessionsOf({from:addDays(asOf(),-days)}).forEach(function(s){
    (s.sets||[]).forEach(function(st){
      if(st.exercise!==name||!st.load||!st.reps)return;
      if(!SET_KINDS[setKind(st)].volume)return;
      var e=e1rmFrom(st.load,st.reps,st.rir);
      if(e!=null)sets.push({e1rm:e,date:s.date,reps:st.reps,rir:st.rir});
    });
  });
  if(!sets.length)return {status:'insufficient',need:['working sets of '+name+' with load and reps recorded']};
  var best=sets.sort(function(a,b){return b.e1rm-a.e1rm;})[0];
  if(n>15)return {status:'out-of-range',
    note:'Rep-max estimates above fifteen reps are not meaningful from this formula; endurance at that range is a different quality.'};
  var est=best.e1rm/(1+n/30);
  /* The interval comes from the effort rating behind the best set, because that is the dominant error. */
  var eff=best.rir!=null?effortOf({rir:best.rir}):null;
  var repErr=eff&&eff.status==='ok'?eff.uncertaintyReps:2;
  var lo=best.e1rm*(1-repErr/30)/(1+n/30), hi=best.e1rm*(1+repErr/30)/(1+n/30);
  return {status:'ok',cls:'DERIVED',exercise:name,n:n,
    estimate:round(est,1),lo:round(lo,1),hi:round(hi,1),
    fromSet:{load:best.load,reps:best.reps,rir:best.rir,date:best.date},
    sets:sets.length,
    note:'Inverted from your best estimated one-rep max using a population formula. The interval reflects how uncertain the effort rating behind it was, which is the largest source of error here \u2014 not the only one.'};
}
function strengthNormalised(name,opts){
  var rm=repMax(name,1,opts);
  if(rm.status!=='ok')return rm;
  var w=currentWeight();
  var b=exerciseBiomechanics(name);
  var impl=b.status==='ok'?b.implement:null;
  return {status:'ok',cls:'DERIVED',exercise:name,
    absolute:rm.estimate,
    perBodyweight:w.value?round(rm.estimate/w.value,2):null,
    implement:impl,
    comparable:impl&&impl!=='smith'&&impl!=='machine',
    note:(impl==='smith'||impl==='machine')?
      'Loads on a fixed-path implement are not comparable to free-weight loads, and normalising by bodyweight does not make them so.':
      'Relative to bodyweight, which is the comparison that survives weight change during a cut.'};
}
/* ---------------- §3.9 HYPERTROPHY: EFFECTIVE SETS ----------------
   "Effective sets" is a modelling convention with a contested evidence base. It is implemented because
   counting raw sets is worse, and it is labelled HEURISTIC because that is what it is. */
function effectiveSets(days,opts){
  opts=opts||{};
  var from=addDays(asOf(),-(days||7));
  var byMuscle={};
  var inferredKinds=0,missingEffort=0,total=0;
  sessionsOf({from:from}).forEach(function(s){
    (s.sets||[]).forEach(function(st){
      var e=null;try{e=resolveExercise(st.exercise);}catch(err){}
      if(!e)return;
      total++;
      var kind=setKind(st);
      if(setKindInferred(st))inferredKinds++;
      var K=SET_KINDS[kind];
      if(!K.volume)return;
      var eff=effortOf(st);
      if(eff.status!=='ok')missingEffort++;
      /* Sets far from failure contribute less. The curve is a convention: full credit at 0-2 RIR, falling
         away beyond that, nothing past 6. */
      var effortFactor=eff.status==='ok'?(eff.rir<=2?1:(eff.rir<=4?0.7:(eff.rir<=6?0.35:0))):0.6;
      var rom=romOf(st);
      var credit=K.stimulus*effortFactor*rom.factor;
      (e.primary||[]).forEach(function(m){
        byMuscle[m]=byMuscle[m]||{direct:0,indirect:0,effective:0,raw:0};
        byMuscle[m].direct++;byMuscle[m].raw++;byMuscle[m].effective+=credit;
      });
      (e.secondary||[]).forEach(function(m){
        byMuscle[m]=byMuscle[m]||{direct:0,indirect:0,effective:0,raw:0};
        byMuscle[m].indirect++;byMuscle[m].raw+=0.5;byMuscle[m].effective+=credit*0.5;
      });
    });
  });
  var rows=Object.keys(byMuscle).map(function(m){
    var c=byMuscle[m];
    return {muscle:m,direct:c.direct,indirect:c.indirect,
      raw:round(c.raw,1),effective:round(c.effective,1)};
  }).sort(function(a,b){return b.effective-a.effective;});
  return {rows:rows,days:days||7,cls:'HEURISTIC',
    setsConsidered:total,inferredKinds:inferredKinds,missingEffort:missingEffort,
    confidence:(inferredKinds>total*0.5||missingEffort>total*0.5)?'low':'moderate',
    note:'An indirect set counts half and a set far from failure counts less. Those weightings are a convention rather than a measurement \u2014 "effective sets" is a useful accounting device whose evidence base is still contested. Raw counts are shown beside it so you can disagree with the weighting.',
    caveat:(inferredKinds?inferredKinds+' of '+total+' sets had no recorded kind and were inferred. ':'')+
      (missingEffort?missingEffort+' had no effort rating.':'')||null};
}
/* ---------------- §3.10 FATIGUE ----------------
   An accounting scheme, explicitly. Nothing here measures fatigue; it tallies exposure and says so. */
function resistanceFatigue(days){
  var from=addDays(asOf(),-(days||7));
  var local={},systemic=0,connective={},technical=0,sessions=0;
  sessionsOf({from:from}).forEach(function(s){
    sessions++;
    (s.sets||[]).forEach(function(st){
      var e=null;try{e=resolveExercise(st.exercise);}catch(err){}
      if(!e)return;
      var K=SET_KINDS[setKind(st)];
      var eff=effortOf(st);
      var hard=eff.status==='ok'&&eff.rir<=1;
      var cost=K.fatigue*(hard?1.3:1);
      (e.primary||[]).forEach(function(m){local[m]=round((local[m]||0)+cost,2);});
      (e.secondary||[]).forEach(function(m){local[m]=round((local[m]||0)+cost*0.4,2);});
      /* Compound lifts carry systemic cost beyond the muscles they train. */
      if(e.compound)systemic=round(systemic+cost*(e.fatigue==='high'?1.2:(e.fatigue==='moderate'?0.8:0.5)),2);
      var b=exerciseBiomechanics(st.exercise);
      (b.joints||[]).forEach(function(j){connective[j]=round((connective[j]||0)+cost*0.5,2);});
      if(hard&&K.stimulus>=1)technical=round(technical+0.2,2);
    });
  });
  var top=Object.keys(local).sort(function(a,b){return local[b]-local[a];}).slice(0,5);
  return {days:days||7,sessions:sessions,cls:'HEURISTIC',
    local:local,systemic:systemic,connective:connective,technical:technical,
    highest:top.map(function(m){return {muscle:m,load:local[m]};}),
    note:'An accounting of exposure, not a measurement of fatigue. Nothing here is sampled from your body: it adds up sets, weights them by how hard and how compound they were, and reports the total. Compare it against how you actually feel \u2014 where the two disagree, believe yourself.'};
}
/* ---------------- §3.12 PROGRESSION SCHEMES ----------------
   Each scheme states the rule it applies and the condition that must hold. The engine picks the scheme that
   suits the set kind and the recorded effort, and says which it used and why. */
var PROGRESSION_SCHEMES={
  linear:{label:'Linear',applies:'early training, or a lift moving every session',
    rule:function(ctx){return {change:'add load',by:ctx.compound?5:2.5,unit:'lb',
      why:'the last session met the target reps at the prescribed effort'};}},
  doubleProgression:{label:'Double progression',applies:'a rep range rather than a fixed target',
    rule:function(ctx){
      return ctx.repsAtTopOfRange?
        {change:'add load and return to the bottom of the range',by:ctx.compound?5:2.5,unit:'lb',
         why:'you reached the top of the rep range'}:
        {change:'add a rep',by:1,unit:'rep',why:'still inside the rep range'};}},
  rirProgression:{label:'RIR progression',applies:'autoregulated work',
    rule:function(ctx){
      return ctx.rir>ctx.targetRir?
        {change:'add load',by:ctx.compound?5:2.5,unit:'lb',
         why:'you finished with '+ctx.rir+' reps in reserve against a target of '+ctx.targetRir}:
        {change:'hold',by:0,unit:'',why:'effort is already at the target'};}},
  topBackoff:{label:'Top set and back-off',applies:'one heavy set followed by volume',
    rule:function(ctx){return {change:'add load to the top set only',by:ctx.compound?5:2.5,unit:'lb',
      why:'back-off volume stays where it is so only one variable moves'};}}
};
function progressionFor(exercise,opts){
  opts=opts||{};
  var days=opts.days||28;
  var sets=[];
  sessionsOf({from:addDays(asOf(),-days)}).forEach(function(s){
    (s.sets||[]).forEach(function(st){
      if(st.exercise!==exercise)return;
      if(!SET_KINDS[setKind(st)].volume)return;
      sets.push({date:s.date,load:st.load,reps:st.reps,rir:st.rir,kind:setKind(st)});
    });
  });
  if(sets.length<3)return {status:'insufficient',exercise:exercise,
    need:[(3-sets.length)+' more working sets of this lift'],
    note:'A progression rule applied to two sets is arithmetic, not programming.'};
  sets.sort(function(a,b){return a.date<b.date?-1:1;});
  var last=sets[sets.length-1];
  var e=null;try{e=resolveExercise(exercise);}catch(err){}
  var compound=!!(e&&e.compound);
  var targetRir=opts.targetRir!=null?opts.targetRir:2;
  /* Scheme selection is stated rather than hidden. */
  var scheme='doubleProgression',why='a rep range is the usual default';
  if(last.rir!=null){scheme='rirProgression';why='your sets carry effort ratings, so effort is the lever that can be autoregulated';}
  if(sets.some(function(s2){return s2.kind==='top';})){scheme='topBackoff';why='this lift is run as a top set with back-off volume';}
  var ctx={compound:compound,rir:last.rir,targetRir:targetRir,
    repsAtTopOfRange:last.reps!=null&&last.reps>=(opts.repHigh||12)};
  var rec=PROGRESSION_SCHEMES[scheme].rule(ctx);
  /* A global brake: no scheme outranks a falling trend or a depressed baseline. */
  var brake=null;
  try{
    var r=readinessState();
    if(r.status==='ok'&&r.score<=-1.2)brake='readiness is '+r.band;
  }catch(err){}
  return {status:'ok',cls:'POLICY',exercise:exercise,scheme:scheme,
    schemeLabel:PROGRESSION_SCHEMES[scheme].label,schemeWhy:why,
    recommendation:brake?{change:'hold',by:0,unit:'',why:brake}:rec,
    lastSet:last,sets:sets.length,brake:brake,
    note:'A rule, not a prediction. Progression schemes are operating conventions \u2014 they encode how to decide, not what your body will do.'};
}

/* Mechanics for the patterns the library gained in step 26. Eleven of the twelve had none, so their exercises reported
   "ok" with no plane, joints or loading curve \u2014 found in H0 when a test that claimed to check overrides turned out to
   check the global error count instead. Same vocabulary as above; 'wrist' is in the joint ontology. Jumps and throws
   are ballistic: the curve names where force peaks, not a smooth resistance profile. All PRIOR, as the rest are. */
Object.assign(PATTERN_MECHANICS,{
  'hip extension':{plane:'sagittal',joints:['hip'],force:'horizontal',stability:'high',lengthened:'bottom, hips low',shortened:'top, hips fully extended',sticking:'lockout',curve:'shortened',rom:'short'},
  'hip flexion':{plane:'sagittal',joints:['hip','spine'],force:'vertical',stability:'low',lengthened:'legs hanging',shortened:'knees or feet up',sticking:'the top',curve:'shortened',rom:'moderate'},
  grip:{plane:'none',joints:['wrist','elbow'],force:'vertical',stability:'high',lengthened:'fingers opening',shortened:'fist closed',sticking:'late in the hold',curve:'even',rom:'isometric'},
  'anti-extension':{plane:'sagittal',joints:['spine','hip','shoulder'],force:'vertical',stability:'moderate',lengthened:'hips sagging',shortened:'neutral held',sticking:'holding position as fatigue builds',curve:'even',rom:'isometric'},
  'anti-rotation':{plane:'transverse',joints:['spine','hip'],force:'rotational',stability:'moderate',lengthened:'arms extended',shortened:'hands at chest',sticking:'arms fully out',curve:'lengthened',rom:'isometric'},
  'anti-lateral flexion':{plane:'frontal',joints:['spine','hip'],force:'vertical',stability:'moderate',lengthened:'hips dropping',shortened:'hips level',sticking:'holding position as fatigue builds',curve:'even',rom:'isometric'},
  'hip adduction':{plane:'frontal',joints:['hip'],force:'horizontal',stability:'high',lengthened:'legs apart',shortened:'legs together',sticking:'legs together',curve:'shortened',rom:'moderate'},
  rotation:{plane:'transverse',joints:['spine','hip','shoulder'],force:'rotational',stability:'moderate',lengthened:'turned away',shortened:'turned through',sticking:'mid-turn',curve:'midrange',rom:'moderate'},
  'external rotation':{plane:'transverse',joints:['shoulder'],force:'horizontal',stability:'high',lengthened:'hand across the body',shortened:'hand rotated out',sticking:'end of the rotation',curve:'shortened',rom:'short'},
  jump:{plane:'sagittal',joints:['hip','knee','ankle'],force:'vertical',stability:'moderate',lengthened:'the dip before take-off',shortened:'take-off',sticking:'none \u2014 ballistic',curve:'lengthened',rom:'moderate'},
  'throw':{plane:'sagittal',joints:['shoulder','spine','hip'],force:'oblique',stability:'moderate',lengthened:'wind-up',shortened:'release',sticking:'none \u2014 ballistic',curve:'midrange',rom:'full'}
});
