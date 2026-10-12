/* ============================================================================
   REGION: MOBILITY, FLEXIBILITY AND PRACTICE DEPTH (catalogue §5–§9)

   This extends the movement engine in 49-movement.js rather than sitting beside it. The roles, phases and
   five-dimension dose already exist; what was missing is the depth underneath them — joints, the difference
   between range you have and range you can use, a stretch taxonomy with real dosage, and poses and sequences
   that make a yoga session analysable instead of "yoga, 30 min".

   Two distinctions the catalogue insists on, and both change what can honestly be claimed:

     FLEXIBILITY ≠ MOBILITY. Passive range is what a joint permits when something else moves it. Active range
     is what you can produce yourself. The gap between them is the interesting number, and it is the one that
     tells you whether stretching or strengthening is the lever.

     A POSE IS NOT A STRETCH. Yoga sessions carry strength, balance and skill demands as well as range, which
     is why the dose model has five dimensions and why "what did this session actually train" is answerable.
   ============================================================================ */

/* ---------------- §5.1 JOINT LIBRARY ---------------- */
var JOINTS={
  ankle:{label:'Ankle',actions:['dorsiflexion','plantarflexion','inversion','eversion'],
    limits:['squat depth','lunge position'],region:'ankle'},
  knee:{label:'Knee',actions:['flexion','extension'],limits:['squat depth','kneeling positions'],region:'knee'},
  hip:{label:'Hip',actions:['flexion','extension','internal rotation','external rotation','abduction','adduction'],
    limits:['squat depth','hinge range','split positions'],region:'hip'},
  pelvis:{label:'Pelvis',actions:['anterior tilt','posterior tilt'],limits:['hinge mechanics'],region:'lowBack'},
  lumbar:{label:'Lumbar spine',actions:['flexion','extension','rotation'],limits:['bracing','hinge'],region:'lowBack'},
  thoracic:{label:'Thoracic spine',actions:['extension','rotation'],limits:['overhead position','pressing'],region:'shoulder'},
  scapula:{label:'Scapula',actions:['elevation','depression','protraction','retraction','upward rotation'],
    limits:['overhead position','pulling'],region:'shoulder'},
  shoulder:{label:'Shoulder',actions:['flexion','extension','abduction','internal rotation','external rotation'],
    limits:['overhead position','bench setup'],region:'shoulder'},
  elbow:{label:'Elbow',actions:['flexion','extension','pronation','supination'],limits:['front rack','pressing'],region:'elbow'},
  wrist:{label:'Wrist',actions:['flexion','extension','deviation'],limits:['front rack','push-up position','handstand'],region:'wrist'},
  cervical:{label:'Neck',actions:['flexion','extension','rotation','side bend'],limits:['bracing','overhead'],region:'neck'}
};
/* ---------------- §5.2 MOBILITY DIMENSIONS ----------------
   The dimensions are separate because they have different remedies. Passive range short of active range
   means the range exists and cannot be produced — a strength problem at length, not a stretching problem. */
var MOBILITY_DIMENSIONS={
  passive:{label:'Passive range',means:'range when something else moves the joint',remedy:'stretching and tissue work'},
  active:{label:'Active range',means:'range you can produce yourself',remedy:'strength at length, and practice'},
  endRange:{label:'End-range strength',means:'force you can produce at the edge of range',remedy:'loaded end-range work'},
  control:{label:'Control',means:'moving through the range deliberately',remedy:'slow, deliberate practice'},
  stability:{label:'Stability',means:'holding a position under load',remedy:'isometric and anti-movement work'},
  symmetry:{label:'Symmetry',means:'left against right',remedy:'unilateral work on the lesser side'},
  consistency:{label:'Consistency',means:'how much a measurement varies day to day',remedy:'a fixed protocol'}
};
function jointState(jointId){
  var j=JOINTS[jointId];
  if(!j)return null;
  var tests=ASSESSMENTS.filter(function(a){return a.region===j.region;});
  var rows=tests.map(function(t){return assessmentState(t.id);}).filter(Boolean);
  var measured=rows.filter(function(r){return r.status==='ok';});
  /* Active-versus-passive is only answerable where both were recorded. Where only one exists, say which. */
  var byMode={};
  measured.forEach(function(r){
    var h=assessmentHistory(r.assessment.id);
    var last=h[h.length-1];
    byMode[(last&&last.mode)||'unspecified']=r.latest;
  });
  var gap=(byMode.passive!=null&&byMode.active!=null)?round(byMode.passive-byMode.active,1):null;
  return {joint:jointId,label:j.label,actions:j.actions,limits:j.limits,
    assessments:rows,measured:measured.length,
    passive:byMode.passive!=null?byMode.passive:null,active:byMode.active!=null?byMode.active:null,
    activePassiveGap:gap,
    interpretation:gap==null?
      (measured.length?'only one mode has been measured, so the range you HAVE cannot be told apart from the range you can USE':
        'never measured'):
      (gap>=8?'a large gap: the range exists but you cannot produce it, which is strength at length rather than tightness':
       (gap>=3?'a modest gap between available and usable range':'available and usable range are close')),
    cls:'MEASURED',
    note:'Passive range is what the joint permits; active range is what you can produce. They have different remedies, so they are not averaged.'};
}
function mobilityOverview(){
  var rows=Object.keys(JOINTS).map(jointState).filter(Boolean);
  var measured=rows.filter(function(r){return r.measured>0;});
  return {rows:rows,measured:measured.length,total:rows.length,n:measured.length,cls:'MEASURED',
    unmeasured:rows.filter(function(r){return !r.measured;}).map(function(r){return r.label;}),
    cls:'MEASURED',
    note:measured.length?('Measured joints only. The rest are unknown, which is different from being fine.'):
      'Nothing has been measured. A mobility claim without a baseline is a feeling.'};
}
/* ---------------- §6.1 STRETCH TAXONOMY ----------------
   Each kind declares what it is understood to do and, where the evidence is thin, says so. */
var STRETCH_KINDS={
  static:{label:'Static',how:'hold at the end of range',dose:{seconds:30,sets:2},
    effect:'increases tolerated range, mostly by changing what you tolerate rather than by lengthening tissue',
    beforeLifting:'a long hold immediately before heavy work is associated with a small acute strength decrement'},
  dynamic:{label:'Dynamic',how:'move through the range repeatedly',dose:{reps:10,sets:2},
    effect:'prepares movement without the acute cost of long static holds',beforeLifting:'appropriate'},
  active:{label:'Active',how:'hold position using your own muscles',dose:{seconds:10,sets:3},
    effect:'builds range you can produce rather than only tolerate',beforeLifting:'appropriate'},
  passive:{label:'Passive',how:'external force holds the position',dose:{seconds:45,sets:2},
    effect:'available range only',beforeLifting:'better after'},
  assisted:{label:'Assisted',how:'a partner or strap applies the force',dose:{seconds:30,sets:2},
    effect:'available range, with more force than you can apply alone',beforeLifting:'better after'},
  loaded:{label:'Loaded',how:'resistance at length',dose:{reps:8,sets:3},
    effect:'range plus strength at the lengthened position',beforeLifting:'counts as training, not as a warm-up'},
  pnf:{label:'PNF',how:'contract, relax, move deeper',dose:{seconds:30,sets:3},
    effect:'often the largest acute range change of these methods',beforeLifting:'better after'},
  contractRelax:{label:'Contract-relax',how:'isometric then relax into range',dose:{seconds:20,sets:3},
    effect:'similar to PNF',beforeLifting:'better after'},
  isometricStretch:{label:'Isometric at length',how:'hold force at the end of range',dose:{seconds:20,sets:3},
    effect:'end-range strength as well as range',beforeLifting:'counts as training'},
  ballistic:{label:'Ballistic',how:'bouncing at end range',dose:{reps:10,sets:1},
    effect:'not recommended by this system: the injury argument against it outweighs an unclear benefit',
    beforeLifting:'not recommended',discouraged:true},
  endRange:{label:'End-range work',how:'strength at the edge of available range',dose:{reps:8,sets:3},
    effect:'converts available range into usable range',beforeLifting:'counts as training'}
};
function stretchPrescription(kind,opts){
  opts=opts||{};
  var k=STRETCH_KINDS[kind];
  if(!k)return {status:'unknown',note:'not a stretch kind this system knows'};
  var when=opts.when||'standalone';
  var warn=null;
  /* Anything whose guidance is not plainly "appropriate" warrants a warning when it is placed before
     lifting. Matching only a few phrases let "better after" pass as fine, which is the opposite of what it
     says. */
  if(when==='before'&&!/^appropriate$/i.test(String(k.beforeLifting).trim()))warn=k.beforeLifting;
  if(k.discouraged)warn=k.effect;
  return {status:'ok',cls:'PRIOR',kind:kind,label:k.label,how:k.how,
    dose:k.dose,effect:k.effect,when:when,warning:warn,
    note:'A starting dose from the general literature, not from your record. Whether it changes anything for you is testable and untested.'};
}
/* §6.2 dosage: recorded on the movement record itself, so it replays like everything else. */
function logStretch(o){
  o=o||{};
  if(!STRETCH_KINDS[o.kind])return null;
  var role=(o.kind==='dynamic')?'mobility':'flexibility';
  return logMovement({role:role,movementId:o.movementId||null,
    label:(STRETCH_KINDS[o.kind].label)+(o.target?(' \u00b7 '+o.target):''),
    date:o.date,minutes:o.minutes||Math.max(1,Math.round(((o.seconds||30)*(o.sets||2))/60)),
    intensity:o.intensity!=null?o.intensity:4,
    targets:o.target?[o.target]:[],
    note:(o.side?('side: '+o.side+'. '):'')+(o.when?('done '+o.when+'. '):'')+(o.note||''),
    silent:o.silent,noSave:o.noSave});
}
/* §6.3 flexibility response: exposure against measured range, reusing the assessment loop. */
function flexibilityResponse(region,opts){
  opts=opts||{};
  var days=opts.days||90;
  var tests=ASSESSMENTS.filter(function(a){return a.region===region;});
  if(!tests.length)return {status:'insufficient',need:['a standard assessment for that region']};
  var st=assessmentState(tests[0].id);
  if(st.status!=='ok'||st.measurements<2)
    return {status:'insufficient',need:['at least two measurements of '+tests[0].label],
      note:'A response needs a before and an after. One measurement is a baseline.'};
  var exposure=movementLog({from:addDays(asOf(),-days)}).filter(function(m){
    return (m.targets||[]).indexOf(region)>=0&&(m.role==='flexibility'||m.role==='mobility');});
  var minutes=exposure.reduce(function(a,m){return a+(m.minutes||0);},0);
  return {status:'ok',cls:'EMPIRICAL',region:region,test:tests[0].label,
    baseline:st.baseline,latest:st.latest,change:st.change,unit:tests[0].unit,
    sessions:exposure.length,minutes:minutes,daysSpanned:st.daysSpanned,
    perSession:exposure.length?round((st.change||0)/exposure.length,2):null,
    interpretation:exposure.length===0?
      'the measurement changed with no recorded work on that region, so it is not evidence that anything worked':
      (Math.abs(st.change||0)<1?'no meaningful change across '+exposure.length+' session(s)':
       fmtSigned(st.change,1)+' '+tests[0].unit+' across '+exposure.length+' session(s) and '+minutes+' minutes'),
    note:'Your own exposure against your own measurements. Nobody randomised this, and range measured on different days varies for reasons that have nothing to do with training \u2014 which is why consistency of protocol matters more than the number.'};
}
/* ---------------- §7 DYNAMIC QUALITIES / §8 ISOMETRIC QUALITIES ----------------
   The catalogue asks these be tracked. They are qualities OF a movement record rather than new record types,
   which keeps one ledger instead of three. */
/* DYNAMIC_QUALITIES removed in H0: defined but never read (see docs/architecture/presentation-policies.md where it recorded a decision). */
var ISOMETRIC_KINDS={
  yielding:{label:'Yielding',means:'resisting a load that would otherwise move you',progress:'duration, then load'},
  overcoming:{label:'Overcoming',means:'pushing against something immovable',progress:'intent and joint angle, not duration'},
  positional:{label:'Positional hold',means:'holding a shape',progress:'duration, then leverage'},
  endRangeHold:{label:'End-range hold',means:'holding at the edge of range',progress:'duration, then range'},
  pause:{label:'Pause in a lift',means:'a hold inside a rep',progress:'pause length, then load'}
};
function isometricProgression(kind,current){
  var k=ISOMETRIC_KINDS[kind];
  if(!k)return {status:'unknown'};
  current=current||{};
  /* The lever is the first clause of the declared progression; matching it by keyword rather than by exact
     equality, because "intent and joint angle" is one lever expressed in several words. */
  var first=k.progress.split(',')[0].trim();
  var lever=/duration/i.test(first)?'duration':(/intent|angle/i.test(first)?'intent':first);
  var rec;
  if(lever==='duration'){
    var s=num(current.seconds)||20;
    rec=s>=45?{change:'add load or leverage instead',why:'past about 45 seconds a hold trains endurance more than strength'}:
      {change:'add 5 seconds',why:'still inside the range where duration is the useful lever'};
  }else if(lever==='intent'){
    rec={change:'keep the duration short and push harder',why:'an overcoming isometric progresses by intent and joint angle, not by lasting longer'};
  }else rec={change:'increase '+lever,why:'the first lever for this kind'};
  return {status:'ok',cls:'POLICY',kind:kind,label:k.label,means:k.means,
    recommendation:rec,
    note:'Isometric strength transfers most strongly near the angle you train, so progressing the angle matters as much as progressing the load.'};
}
/* ---------------- §9.1 POSE DATABASE ---------------- */
var POSES={
  'downward-dog':{label:'Downward dog',aliases:['adho mukha svanasana','down dog'],category:'mobility',
    joints:['shoulder','thoracic','hip','ankle'],demands:{range:0.7,strength:0.3,balance:0.2,skill:0.2},
    breathing:'steady',difficulty:1,regressions:['puppy pose'],progressions:['three-legged dog']},
  'warrior-2':{label:'Warrior II',aliases:['virabhadrasana ii'],category:'strength',
    joints:['hip','knee','shoulder'],demands:{range:0.5,strength:0.6,balance:0.3,skill:0.3},
    breathing:'steady',difficulty:2,regressions:['short stance'],progressions:['extended side angle']},
  'pigeon':{label:'Pigeon',aliases:['eka pada rajakapotasana'],category:'flexibility',
    joints:['hip','lumbar'],demands:{range:0.9,strength:0.1,balance:0.1,skill:0.2},
    breathing:'long exhale',difficulty:2,regressions:['figure-four on the back'],progressions:['king pigeon']},
  'bridge':{label:'Bridge',aliases:['setu bandha'],category:'strength',
    joints:['hip','thoracic'],demands:{range:0.5,strength:0.5,balance:0.1,skill:0.1},
    breathing:'steady',difficulty:1,regressions:[],progressions:['wheel']},
  'tree':{label:'Tree',aliases:['vrksasana'],category:'balance',
    joints:['hip','ankle'],demands:{range:0.4,strength:0.3,balance:0.8,skill:0.4},
    breathing:'steady',difficulty:1,regressions:['toe on the floor'],progressions:['eyes closed']},
  'child':{label:'Child\u2019s pose',aliases:['balasana'],category:'recovery',
    joints:['hip','lumbar','shoulder'],demands:{range:0.5,strength:0,balance:0,skill:0},
    breathing:'long exhale',difficulty:1,regressions:['knees wide'],progressions:[]},
  'cobra':{label:'Cobra',aliases:['bhujangasana'],category:'mobility',
    joints:['thoracic','lumbar','shoulder'],demands:{range:0.6,strength:0.3,balance:0.1,skill:0.2},
    breathing:'steady',difficulty:1,regressions:['sphinx'],progressions:['upward dog']},
  'chair':{label:'Chair',aliases:['utkatasana'],category:'strength',
    joints:['ankle','knee','hip','shoulder'],demands:{range:0.5,strength:0.7,balance:0.3,skill:0.2},
    breathing:'steady',difficulty:2,regressions:['hands on thighs'],progressions:['chair twist']},
  'crow':{label:'Crow',aliases:['bakasana'],category:'skill',
    joints:['wrist','shoulder','hip'],demands:{range:0.4,strength:0.8,balance:0.8,skill:0.9},
    breathing:'held briefly',difficulty:4,regressions:['knees on triceps, toes down'],progressions:['side crow']},
  'savasana':{label:'Savasana',aliases:['corpse'],category:'recovery',
    joints:[],demands:{range:0,strength:0,balance:0,skill:0},
    breathing:'quiet',difficulty:1,regressions:[],progressions:[]}
};
function resolvePose(name){
  var q=String(name||'').toLowerCase().trim();
  if(!q)return null;
  if(POSES[q])return Object.assign({id:q},POSES[q]);
  var hit=Object.keys(POSES).filter(function(k){
    var p=POSES[k];
    return p.label.toLowerCase()===q||(p.aliases||[]).some(function(a){return a.toLowerCase()===q;});
  })[0];
  if(hit)return Object.assign({id:hit},POSES[hit]);
  var loose=Object.keys(POSES).filter(function(k){
    return POSES[k].label.toLowerCase().indexOf(q)>=0||k.indexOf(q)>=0;})[0];
  return loose?Object.assign({id:loose},POSES[loose]):null;
}
/* ---------------- §9.2 SEQUENCES / §9.3 STYLES ---------------- */
var YOGA_STYLES={
  restorative:{label:'Restorative',intensity:1,objective:'perceived recovery',holds:'long'},
  gentle:{label:'Gentle',intensity:2,objective:'easy movement',holds:'moderate'},
  mobility:{label:'Mobility-oriented',intensity:4,objective:'range',holds:'moderate'},
  strength:{label:'Strength-oriented',intensity:6,objective:'strength and control',holds:'short'},
  flow:{label:'Flow',intensity:5,objective:'continuous movement',holds:'brief'},
  vigorous:{label:'Vigorous',intensity:7,objective:'conditioning as well as movement',holds:'brief'},
  breath:{label:'Breath-focused',intensity:1,objective:'down-regulation',holds:'n/a'}
};
var SEQUENCES={
  'morning-mobility':{label:'Morning mobility',style:'mobility',
    poses:['child','cobra','downward-dog','warrior-2','tree'],holdSeconds:40},
  'post-lift-recovery':{label:'After lifting',style:'restorative',
    poses:['child','pigeon','bridge','savasana'],holdSeconds:60},
  'strength-flow':{label:'Strength flow',style:'strength',
    poses:['chair','warrior-2','downward-dog','crow','bridge'],holdSeconds:30}
};
/* "What did this session actually train?" — the question the catalogue says a sequence should answer. */
function sequenceAnalysis(id){
  var seq=SEQUENCES[id];
  if(!seq)return null;
  var poses=seq.poses.map(resolvePose).filter(Boolean);
  var totals={range:0,strength:0,balance:0,skill:0};
  var joints={};
  poses.forEach(function(p){
    Object.keys(totals).forEach(function(k){totals[k]+=(p.demands[k]||0);});
    (p.joints||[]).forEach(function(j){joints[j]=(joints[j]||0)+1;});
  });
  var n=poses.length||1;
  Object.keys(totals).forEach(function(k){totals[k]=round(totals[k]/n,2);});
  var style=YOGA_STYLES[seq.style]||{};
  var minutes=Math.round(poses.length*seq.holdSeconds/60)+3;
  var dominant=Object.keys(totals).sort(function(a,b){return totals[b]-totals[a];})[0];
  return {id:id,label:seq.label,style:seq.style,styleLabel:style.label,
    poses:poses.map(function(p){return {id:p.id,label:p.label,category:p.category,difficulty:p.difficulty};}),
    demands:totals,dominant:dominant,joints:joints,minutes:minutes,
    dose:movementDose({role:'practice',minutes:minutes,intensity:style.intensity||4}),
    cls:'PRIOR',
    trains:'mostly '+dominant+(totals.strength>=0.4?', with real strength demand':'')+
      (totals.balance>=0.4?' and a balance component':''),
    note:'Demands are declared per pose, so this describes the sequence rather than your experience of it. A pose is not only a stretch \u2014 which is why this reports four demands rather than calling the whole thing flexibility work.'};
}
function logSequence(id,opts){
  opts=opts||{};
  var a=sequenceAnalysis(id);
  if(!a)return null;
  return logMovement({role:'practice',label:a.label,date:opts.date,
    minutes:opts.minutes||a.minutes,intensity:(YOGA_STYLES[a.style]||{}).intensity||4,
    targets:Object.keys(a.joints).map(function(j){return (JOINTS[j]||{}).region;}).filter(Boolean),
    note:'sequence: '+id,silent:opts.silent,noSave:opts.noSave});
}
/* §9.4 yoga response: reuses the cross-modality machinery, with the same warning attached. */
function yogaResponse(metric,opts){
  return crossModalityEffect('practice',metric||'fatigue',opts);
}
/* ---------------- W-016: A MOBILITY RECOMMENDATION THAT EXPLAINS ITSELF ----------------
   The catalogue's rule: build mobility only where it is tied to measurable adaptation, and let a recommendation say the
   limitation, the quality of the measurement, the intervention chosen, the change expected, when to retest, what was
   observed and how uncertain it is. Every part is read from what exists: the two field tests that have a response model
   (one series each, whether the quick log or an assessment recorded it), the joint's active-against-passive gap, the
   stretch kinds, the mobility response (a population prior and the person's own slope), and the mobility minutes logged. */
var MOBILITY_TESTS={
  kneewall:{label:'knee-to-wall',unit:'cm',assessment:'ankle-wall',joint:'ankle',region:'ankles',limits:'squat depth and lunge position',
    error:{value:1,basis:'knee-to-wall repeats to about a centimetre (Bennell et al. 1998)'}},
  sitreach:{label:'sit-and-reach',unit:'cm',assessment:'sit-reach',joint:'lumbar',region:'hamstrings',limits:'the hinge',error:null}};
var MOBILITY_REFERENCE_CONTRACT={id:'mobility_reference',subject:'a measured range',predicate:'is treated as limiting below',
  parameters:{kneewall:{value:10,unit:'cm knee-to-wall',meaning:'below this, the ankle is treated as limiting squat depth and lunge position'},
    sitreach:{value:0,unit:'cm past the feet',meaning:'short of the feet, the hamstrings and lower back are treated as limiting the hinge'},
    asymmetry:{value:2,unit:'test errors',meaning:'a left-right difference larger than this many test errors is treated as real'},
    lost:{value:2,unit:'test errors',meaning:'a fall from your own best of the last six months larger than this many test errors is treated as lost range'}},
  statement:function(v){return 'a knee-to-wall below '+v.kneewall+' cm, or a sit-and-reach short of the feet, is treated as a limitation';},
  rationale:'working references this system uses to decide what to work on first, not targets: range beyond what a movement needs is not the aim',
  evidenceBasis:['thomas2018stretch','bennell1998ktw'],parameterSource:'chosen by this system; not derived from a study',
  parameterVersion:'1.0',calibrationStatus:'not calibrated to this person',validationStatus:HEURISTIC_NOT_VALIDATED,
  applicability:{phases:['any'],population:'adults without an injury in the region'},failureConditions:['an injury in the region','a test done without the protocol'],
  outcomes:['range of motion']};
var MOBILITY_REMEDY={symmetry:{dimension:'symmetry',stretch:'static'},active:{dimension:'active',stretch:'endRange'},
  passive:{dimension:'passive',stretch:'static'},lost:{dimension:'passive',stretch:'static'}};
var MOBILITY_LIMITATION_ORDER=['symmetry','active','passive','lost'];
/* one series per test: the field test and the assessment that measures the same thing */
function _mobilitySeries(type){var T=MOBILITY_TESTS[type];
  var a=obsOf(type).filter(function(o){return !o.retracted;}).map(function(o){var m=o.meta||{};return {date:o.date,value:o.value,side:m.side||null,source:'field test',obs:o};});
  var b=(T.assessment?assessmentHistory(T.assessment):[]).map(function(h){return {date:h.date,value:+h.value,side:h.side||null,source:'assessment'};});
  return a.concat(b).filter(function(x){return isFinite(x.value);}).sort(function(x,y){return x.date<y.date?-1:(x.date>y.date?1:0);});}
/* the test's own error: from the person's repeats within a week when there are two or more pairs, else the published figure */
function _mobilityError(type,S){var d=[];
  for(var i=1;i<S.length;i++)if(S[i].side===S[i-1].side&&daysBetween(S[i-1].date,S[i].date)<=7)d.push(S[i].value-S[i-1].value);
  if(d.length>=2)return {value:round(Math.sqrt(d.reduce(function(a,x){return a+x*x;},0)/d.length)/Math.SQRT2,2),basis:'your own repeats within a week ('+d.length+' pairs)',own:true};
  var T=MOBILITY_TESTS[type];return T.error?{value:T.error.value,basis:T.error.basis,own:false}:{value:null,basis:'not known until the test is repeated within a week',own:false};}
function _mobilityLimitation(type,S,err){var T=MOBILITY_TESTS[type],P=MOBILITY_REFERENCE_CONTRACT.parameters,e=err.value,last=S[S.length-1];
  var L=null,R=null;for(var i=S.length-1;i>=0&&daysBetween(S[i].date,last.date)<=14;i--){if(S[i].side==='left'&&!L)L=S[i];if(S[i].side==='right'&&!R)R=S[i];}
  if(L&&R&&e!=null&&Math.abs(L.value-R.value)>P.asymmetry.value*e){var lo=L.value<R.value?L:R,gap=Math.abs(L.value-R.value);
    return {kind:'symmetry',test:type,side:lo.side,size:round(gap,1),errors:round(gap/e,1),
      text:'your '+lo.side+' side reaches '+fmtNum(gap,1)+' '+T.unit+' less than the other on the '+T.label+', more than '+P.asymmetry.value+' test errors'};}
  var js=jointState(T.joint);
  if(js&&js.activePassiveGap!=null&&js.activePassiveGap>=3)return {kind:'active',test:type,size:js.activePassiveGap,errors:null,
    text:'at the '+js.label.toLowerCase()+', the range you can produce is '+fmtNum(js.activePassiveGap,1)+' short of the range you have: strength at length, not tightness'};
  var ref=P[type]?P[type].value:null;
  if(ref!=null&&last.value<ref)return {kind:'passive',test:type,size:round(ref-last.value,1),errors:e?round((ref-last.value)/e,1):null,
    text:'your '+T.label+' of '+fmtNum(last.value,1)+' '+T.unit+' is '+fmtNum(ref-last.value,1)+' '+T.unit+' short of the '+ref+' '+T.unit+' this system works to, which limits '+T.limits};
  var same=S.filter(function(x){return x.side===last.side&&daysBetween(x.date,last.date)<=180;}),best=Math.max.apply(null,same.map(function(x){return x.value;}));
  if(e!=null&&best-last.value>P.lost.value*e)return {kind:'lost',test:type,size:round(best-last.value,1),errors:round((best-last.value)/e,1),
    text:'your '+T.label+' is '+fmtNum(best-last.value,1)+' '+T.unit+' below your own best of the last six months, more than '+P.lost.value+' test errors'};
  return null;}
function mobilityRecommendation(){
  return memo('mobilityRecommendation:'+asOf(),function(){
    var C=CAPACITY_RESPONSES.mobility,cr=capacityResponse('mobility'),checked=[],cands=[];
    Object.keys(MOBILITY_TESTS).forEach(function(type){var S=_mobilitySeries(type);if(!S.length)return;var err=_mobilityError(type,S);checked.push({test:type,series:S,error:err});
      var lim=_mobilityLimitation(type,S,err);if(lim)cands.push({lim:lim,series:S,error:err});});
    if(!checked.length)return {status:'insufficient',need:['a knee-to-wall or sit-and-reach test in the quick log'],
      note:'A mobility recommendation needs a measurement to start from: without one it would be a feeling.'};
    var measurement=function(type,S,err){var T=MOBILITY_TESTS[type],last=S[S.length-1],q=last.obs&&typeof measurementQuality==='function'?measurementQuality(last.obs):null;
      return {test:type,readings:S.length,error:err,quality:q?q.level:null,
        text:S.length+' '+T.label+' reading'+(S.length===1?'':'s')+'; the test’s error is '+(err.value!=null?fmtNum(err.value,1)+' '+T.unit+' ('+err.basis+')':err.basis)+(q?'; latest reading '+q.level+' quality':'')};};
    if(!cands.length)return {status:'none',cls:'MEASURED',checked:checked.map(function(c){return measurement(c.test,c.series,c.error);}),
      text:'every measured range meets its working reference, with no left-right difference and no lost range the tests can show',
      note:'Nothing to work on that the record can show. Testing both sides, or active as well as passive range, would show more.'};
    cands.sort(function(a,b){var o=MOBILITY_LIMITATION_ORDER.indexOf(a.lim.kind)-MOBILITY_LIMITATION_ORDER.indexOf(b.lim.kind);return o||((b.lim.errors||b.lim.size)-(a.lim.errors||a.lim.size));});
    var c=cands[0],L=c.lim,type=L.test,T=MOBILITY_TESTS[type],S=c.series,e=c.error.value,last=S[S.length-1];
    var R=MOBILITY_REMEDY[L.kind],D=MOBILITY_DIMENSIONS[R.dimension],K=STRETCH_KINDS[R.stretch];
    var now=_doseBefore(C,asOf()),target=Math.round(now)+C.dose.scale;
    var ex=(typeof MOBILITY_LIBRARY!=='undefined'?MOBILITY_LIBRARY:[]).filter(function(m){return m.regions.indexOf(T.region)>=0&&(R.stretch!=='static'||m.type==='stretch');}).slice(0,3).map(function(m){return m.name;});
    var how=(ASSESSMENTS.filter(function(a){return a.id===T.assessment;})[0]||{}).how||T.label;
    /* the change expected from 30 more minutes a week: the response per 30 minutes a week, the person's own where it is fitted */
    var t=(cr.tests||[]).filter(function(x){return x.type===type;})[0]||{},fitted=t.status==='ok';
    var per=fitted?t.perUnit:t.prior.mean,sdv=fitted?t.sd:t.prior.sd,pw=fitted?t.personalWeight:0;
    var expected={value:round(per,2),lo:round(per-2*sdv,2),hi:round(per+2*sdv,2),unit:T.unit,weeks:4,personalWeight:pw,
      basis:fitted?('your own '+T.label+' tests against your mobility minutes, '+Math.round(pw*100)+'% of the weight'):('the population figure: your own response is not fitted yet ('+t.need+')')};
    expected.text=fmtSigned(expected.value,1)+' '+T.unit+' after four weeks of '+target+' minutes a week ('+fmtSigned(expected.lo,1)+' to '+fmtSigned(expected.hi,1)+'), from '+expected.basis;
    var separable=e!=null?Math.abs(expected.value)>2*e:null;
    var retest={after:addDays(last.date,28),minutesPerWeek:Math.round(0.8*target),
      protocol:['the same test: '+how,'the same side'+(L.side?' ('+L.side+')':''),'the same warm-up and time of day'],
      text:'retest on '+shortDate(addDays(last.date,28))+' or later, after at least '+Math.round(0.8*target)+' minutes a week of the work: the same test, the same side'+(L.side?' ('+L.side+')':'')+', the same warm-up and time of day'};
    /* what the record already shows: the latest reading against one three or more weeks before it, beside what the
       response predicts for the change in mobility minutes between them */
    var prev=S.filter(function(x){return x.side===last.side&&daysBetween(x.date,last.date)>=21;}).slice(-1)[0],observed;
    if(!prev)observed={status:'not yet',text:'no earlier '+T.label+' three or more weeks before the latest, so there is nothing to compare yet'};
    else{var dPrev=_doseBefore(C,prev.date),dLast=_doseBefore(C,last.date),u=(dLast-dPrev)/C.dose.scale,ch=round(last.value-prev.value,1);
      var plo=Math.min((per-2*sdv)*u,(per+2*sdv)*u),phi=Math.max((per-2*sdv)*u,(per+2*sdv)*u);
      var st=ch<plo?'less than expected':(ch>phi?'more than expected':'as expected');
      observed={status:st,from:prev.value,to:last.value,change:ch,minutesBefore:Math.round(dPrev),minutesSince:Math.round(dLast),predicted:[round(plo,2),round(phi,2)],
        text:'from '+fmtNum(prev.value,1)+' to '+fmtNum(last.value,1)+' '+T.unit+' ('+fmtSigned(ch,1)+') while your mobility work went from '+Math.round(dPrev)+' to '+Math.round(dLast)+' minutes a week; the response predicts '+fmtSigned(plo,1)+' to '+fmtSigned(phi,1)+': '+st};}
    var uncertainty={interval:[expected.lo,expected.hi],personalWeight:pw,error:e,separable:separable,
      text:(pw<0.2?'The expected change is the population figure; your tests only hint so far. ':'The expected change is '+Math.round(pw*100)+'% your own tests. ')+
        (e==null?'The test’s own error is unknown until it is repeated within a week. ':(separable?'It is more than twice the test’s error, so one retest can show it. ':'It is within twice the test’s error ('+fmtNum(e,1)+' '+T.unit+'), so one retest cannot separate it from repeating the test. '))+cr.limits};
    return {status:'ok',cls:'EMPIRICAL',test:type,
      limitation:L,
      measurement:measurement(type,S,c.error),
      intervention:{dimension:D.label,remedy:D.remedy,stretch:K.label,how:K.how,dose:K.dose,minutesPerWeek:target,side:L.side||null,exercises:ex,why:K.effect,
        text:K.label.toLowerCase()+' work ('+D.remedy+')'+(L.side?' on the '+L.side+' side first':'')+', '+target+' minutes a week'+(ex.length?': '+ex.join(', '):'')},
      expectedChange:expected,retest:retest,observedResponse:observed,uncertainty:uncertainty,
      policy:MOBILITY_REFERENCE_CONTRACT.id,others:cands.slice(1).map(function(o){return o.lim.text;}),
      note:'One limitation at a time, so a retest can say whether the work changed it.'};
  });
}
