/* ============================================================================
   MOBILITY
   Mobility was ten yoga poses and nothing else: no stretch or mobility-drill library, no warm-up for the session in
   front of you, no cool-down for the muscles you just trained, and no routines. This is the library by region, with a
   plain dose and cues for each item, and three ways to use it: a warm-up built from the movement patterns a session
   contains, a cool-down built from the muscles it actually trained, and named routines for everyday needs.
   Items that are also yoga poses reuse the pose drawings.
   ============================================================================ */
var MOBILITY_REGIONS={neck:'Neck',shoulders:'Shoulders',chest:'Chest',upperback:'Upper back',lowerback:'Lower back',hips:'Hips',
  hipflexors:'Front of the hips',glutes:'Glutes',hamstrings:'Hamstrings',quads:'Thighs',innerthigh:'Inner thighs',ankles:'Calves and ankles',wrists:'Wrists and forearms'};
function _M(id,name,type,regions,targets,dose,cues,o){o=o||{};return {id:id,name:name,type:type,regions:regions,targets:targets,dose:dose,cues:cues,
  when:o.when||(type==='stretch'?'cool-down':'warm-up'),level:o.level||'beginner',pose:o.pose||null,seconds:o.seconds||(type==='stretch'?45:40)};}
var MOBILITY_LIBRARY=[
  /* neck */
  _M('neckside','Side neck stretch','stretch',['neck'],['traps'],'30 seconds each side',['Ear toward your shoulder','Opposite shoulder stays down','Breathe slowly']),
  _M('chintuck','Chin tucks','drill',['neck'],[],'10 slow reps',['Glide your chin straight back','Make a double chin','Hold 2 seconds']),
  /* shoulders and chest */
  _M('armcircles','Arm circles','drill',['shoulders'],['delts'],'10 each direction',['Start small, grow larger','Arms straight','Smooth and relaxed']),
  _M('wallslide','Wall slides','drill',['shoulders','upperback'],['upperback'],'10 reps',['Back and arms against a wall','Slide arms up in a Y','Keep contact with the wall']),
  _M('crossbody','Cross-body shoulder stretch','stretch',['shoulders'],['reardelts','delts'],'30 seconds each side',['Pull one arm across your chest','Keep the shoulder down','Relax into it']),
  _M('doorwaychest','Doorway chest stretch','stretch',['chest','shoulders'],['chest','delts'],'30 seconds each side',['Forearm on a doorframe','Step through gently','Feel it across the chest']),
  _M('sleeper','Sleeper stretch','stretch',['shoulders'],['reardelts'],'30 seconds each side',['Lie on your side, arm out in front','Gently press the hand down','Stop before pain'],{level:'intermediate'}),
  _M('overheadlat','Overhead lat stretch','stretch',['shoulders','upperback'],['lats'],'30 seconds each side',['Hold a bar or door frame overhead','Sink your hips back','Feel it down your side']),
  _M('bandpassthrough','Band pass-through','drill',['shoulders','chest'],['delts','chest'],'10 reps',['Wide grip on a band or stick','Arc it over and behind you','Keep arms straight']),
  _M('scappushup','Scapular push-up','drill',['shoulders','upperback'],['upperback'],'10 reps',['Push-up position, arms straight','Let your chest sink between the shoulder blades','Push the floor away']),
  /* upper and lower back */
  _M('catcow','Cat-cow','drill',['upperback','lowerback'],['erectors','abs'],'10 slow reps',['On hands and knees','Round your back up, then let it sag','Move with your breath']),
  _M('threadneedle','Thread the needle','stretch',['upperback','shoulders'],['upperback','reardelts'],'5 slow reps each side',['On hands and knees','Reach one arm under your body','Then open it up to the ceiling'],{when:'anytime'}),
  _M('openbook','Open book','drill',['upperback','chest'],['chest','obliques'],'8 each side',['Lie on your side, knees bent','Open the top arm across to the other side','Follow your hand with your eyes']),
  _M('childpose','Child\u2019s pose','stretch',['lowerback','shoulders'],['lats','erectors'],'60 seconds',['Knees wide, sit back to your heels','Arms long in front','Breathe into your back'],{pose:'child'}),
  _M('cobra','Cobra','stretch',['lowerback','hipflexors'],['abs'],'30 seconds',['Lie face down, hands under shoulders','Press up gently','Keep hips on the floor'],{pose:'cobra'}),
  _M('kneestochest','Knees to chest','stretch',['lowerback'],['erectors','glutes'],'45 seconds',['Lie on your back','Hug your knees in','Rock gently side to side']),
  _M('supinetwist','Lying twist','stretch',['lowerback','glutes'],['obliques','glutes'],'30 seconds each side',['Lie on your back, knees bent','Let both knees fall to one side','Shoulders stay down']),
  /* hips */
  _M('hipcircles','Hip circles','drill',['hips'],['glutes'],'8 each direction',['Stand on one leg, hold something','Draw big circles with the knee','Move slowly']),
  _M('9090','90/90 hip switch','drill',['hips','glutes'],['glutes','adductors'],'8 each side',['Sit with both knees bent at 90 degrees','Rotate the knees side to side','Stay tall']),
  _M('worldsgreatest','World\u2019s greatest stretch','drill',['hips','hipflexors','upperback'],['glutes','hamstrings'],'5 each side',['Step into a long lunge','Elbow to the inside of your foot','Rotate and reach up']),
  _M('pigeon','Pigeon','stretch',['glutes','hips'],['glutes'],'45 seconds each side',['Front shin across, back leg long','Square your hips','Lean forward to deepen'],{pose:'pigeon'}),
  _M('figure4','Figure-four stretch','stretch',['glutes'],['glutes'],'45 seconds each side',['Lie on your back','Ankle over the opposite knee','Pull the bottom leg in']),
  _M('frogstretch','Frog stretch','stretch',['innerthigh','hips'],['adductors'],'45 seconds',['On all fours, knees wide','Sink your hips back','Keep the lower back neutral'],{level:'intermediate'}),
  _M('butterfly','Butterfly stretch','stretch',['innerthigh'],['adductors'],'45 seconds',['Soles of the feet together','Let the knees fall open','Sit tall and lean forward']),
  _M('cossack','Cossack squat','drill',['innerthigh','hips'],['adductors','quads'],'6 each side',['Wide stance','Shift into one bent leg','Other leg straight, toes up'],{level:'intermediate'}),
  /* front of the hips and thighs */
  _M('kneelinghipflexor','Kneeling hip flexor stretch','stretch',['hipflexors','quads'],['quads'],'45 seconds each side',['One knee down, other foot forward','Squeeze the back glute','Shift your hips forward gently']),
  _M('couchstretch','Couch stretch','stretch',['hipflexors','quads'],['quads'],'45 seconds each side',['Back knee against a wall or couch','Front foot forward','Stay upright'],{level:'intermediate'}),
  _M('standingquad','Standing quad stretch','stretch',['quads'],['quads'],'30 seconds each side',['Hold your ankle behind you','Knees together','Push the hip slightly forward']),
  _M('lowlunge','Low lunge','stretch',['hipflexors'],['quads'],'30 seconds each side',['Front knee over the ankle','Back knee down','Lift your chest'],{when:'anytime'}),
  /* hamstrings */
  _M('legswings','Leg swings','drill',['hamstrings','hips'],['hamstrings','quads'],'10 each leg',['Hold something for balance','Swing the leg forward and back','Grow the range gently']),
  _M('inchworm','Inchworm','drill',['hamstrings','shoulders'],['hamstrings','abs'],'6 reps',['Fold forward, hands to the floor','Walk out to a plank','Walk back and stand']),
  _M('standingham','Standing hamstring stretch','stretch',['hamstrings'],['hamstrings'],'30 seconds each side',['Heel on a low step','Hinge forward from the hips','Keep your back flat']),
  _M('supineham','Lying hamstring stretch','stretch',['hamstrings'],['hamstrings'],'45 seconds each side',['Lie on your back','Lift one leg with a strap or towel','Keep the other leg down']),
  _M('downdog','Downward dog','stretch',['hamstrings','ankles','shoulders'],['hamstrings','calves'],'45 seconds',['Hips up and back','Press your chest toward your thighs','Pedal your heels'],{pose:'downward-dog',when:'anytime'}),
  /* calves and ankles */
  _M('anklerocks','Ankle rocks','drill',['ankles'],['calves'],'10 each side',['Half-kneel facing a wall','Drive the knee over the toes','Heel stays down']),
  _M('wallcalf','Wall calf stretch','stretch',['ankles'],['calves'],'30 seconds each side',['Hands on a wall, one leg back','Back heel down, knee straight','Lean in']),
  _M('soleus','Bent-knee calf stretch','stretch',['ankles'],['calves'],'30 seconds each side',['Same as the wall stretch','Bend the back knee','Feel it lower down']),
  /* wrists */
  _M('wristcircles','Wrist circles','drill',['wrists'],['forearms'],'10 each direction',['Interlace your fingers','Roll the wrists in circles','Loose and easy']),
  _M('wristflexor','Wrist flexor stretch','stretch',['wrists'],['forearms'],'30 seconds each side',['Arm straight, palm up','Pull the fingers back gently','Keep the elbow straight']),
  _M('prayerstretch','Prayer stretch','stretch',['wrists'],['forearms'],'30 seconds',['Palms together at your chest','Lower your hands slowly','Keep palms pressed']),
  /* whole body */
  _M('bwsquathold','Deep squat hold','stretch',['hips','ankles','innerthigh'],['adductors','calves'],'45 seconds',['Sit into a deep squat','Elbows push knees out','Hold something if needed'],{when:'anytime'}),
  _M('sunsalute','Sun salutation','drill',['hamstrings','shoulders','hipflexors'],['hamstrings','chest'],'3 slow rounds',['Reach up, fold down','Step back to plank, lower, cobra','Downward dog, then step up'],{level:'intermediate'}),
  _M('savasana','Rest','stretch',['lowerback'],[],'2 minutes',['Lie on your back','Let everything go heavy','Slow breathing'],{pose:'savasana',when:'anytime'})
];
var _MOB={};MOBILITY_LIBRARY.forEach(function(m){_MOB[m.id]=m;});
/* Warm-up drills by pattern group: moving, not held, for the movements in the session ahead. */
var WARMUP_BY_GROUP={squat:['anklerocks','bwsquathold','hipcircles','worldsgreatest'],hinge:['legswings','catcow','inchworm','worldsgreatest'],
  push:['armcircles','bandpassthrough','scappushup','wallslide'],pull:['wallslide','catcow','scappushup','armcircles'],
  core:['catcow','openbook','9090'],carry:['hipcircles','wristcircles','armcircles'],power:['legswings','anklerocks','inchworm','worldsgreatest'],
  accessory:['armcircles','wristcircles','hipcircles']};
/* Cool-down stretches for each muscle the session trained. */
var COOLDOWN_FOR_MUSCLE={chest:['doorwaychest'],delts:['crossbody','doorwaychest'],sidedelts:['crossbody'],reardelts:['crossbody','sleeper'],
  biceps:['doorwaychest','wristflexor'],triceps:['overheadlat'],forearms:['wristflexor','prayerstretch'],lats:['overheadlat','childpose'],
  upperback:['threadneedle','childpose'],traps:['neckside'],erectors:['childpose','kneestochest'],abs:['cobra'],obliques:['supinetwist'],
  quads:['kneelinghipflexor','standingquad'],glutes:['figure4','pigeon'],hamstrings:['supineham','standingham'],adductors:['butterfly','frogstretch'],
  calves:['wallcalf','soleus']};
function _groupOf(pattern){var g=null;Object.keys(PATTERN_GROUPS).forEach(function(k){if(PATTERN_GROUPS[k].indexOf(pattern)>=0)g=k;});return g||'accessory';}
function _pick(ids,max){var seen={},out=[];ids.forEach(function(id){if(!seen[id]&&_MOB[id]&&out.length<max){seen[id]=1;out.push(_MOB[id]);}});return out;}
function _routine(title,items,why){var secs=items.reduce(function(a,m){return a+m.seconds*(/each side/.test(m.dose)?2:1);},0);
  return {title:title,items:items,minutes:Math.max(1,Math.round(secs/60)),why:why};}
function warmUpFor(exerciseNames){
  var groups=[];(exerciseNames||[]).forEach(function(n){var e=resolveExercise(n);if(e){var g=_groupOf(e.pattern);if(groups.indexOf(g)<0)groups.push(g);}});
  if(!groups.length)groups=['squat','push'];
  var ids=[];groups.forEach(function(g){ids=ids.concat((WARMUP_BY_GROUP[g]||[]).slice(0,2));});
  return _routine('Warm-up',_pick(ids,5),'Moving drills for the movements in this session: '+groups.join(', ')+'.');
}
/* Built from the muscles trained, primary first then secondary, and never fewer than three stretches: a chest session
   whose only primary muscle is the chest first produced a one-stretch cool-down. */
function coolDownFor(muscles,secondary){
  var ids=[];(muscles||[]).concat(secondary||[]).forEach(function(m){ids=ids.concat((COOLDOWN_FOR_MUSCLE[m]||[]).slice(0,1));});
  ['childpose','supinetwist','kneestochest'].forEach(function(id){if(_pick(ids,6).length<3)ids.push(id);});
  return _routine('Cool-down',_pick(ids,6),'Held stretches for what you trained'+(muscles&&muscles.length?(': '+muscles.map(function(m){return MUSCLE_GROUPS[m]||m;}).slice(0,5).join(', ')):'')+'.');
}
var MOBILITY_ROUTINES={
  desk:{title:'Desk reset',ids:['chintuck','neckside','doorwaychest','threadneedle','kneelinghipflexor','wristflexor'],why:'For after long sitting: neck, chest, upper back, hips and wrists.'},
  hips:{title:'Hips',ids:['hipcircles','9090','worldsgreatest','pigeon','kneelinghipflexor','butterfly'],why:'Hip range for squats, lunges and everyday movement.'},
  shoulders:{title:'Shoulders',ids:['armcircles','wallslide','bandpassthrough','crossbody','doorwaychest','sleeper'],why:'Shoulder range for pressing and pulling.'},
  back:{title:'Back',ids:['catcow','openbook','threadneedle','childpose','kneestochest','supinetwist'],why:'Gentle movement for a stiff back.'},
  fullbody:{title:'Full body',ids:['catcow','worldsgreatest','inchworm','downdog','pigeon','couchstretch','childpose'],why:'A little of everything, about twelve minutes.'},
  bedtime:{title:'Before bed',ids:['childpose','kneestochest','supinetwist','figure4','supineham','savasana'],why:'Slow, lying-down stretches to wind down.'}
};
function mobilityRoutine(id){var r=MOBILITY_ROUTINES[id];if(!r)return null;return _routine(r.title,_pick(r.ids,10),r.why);}
function mobilityLibraryAudit(){
  var issues=[];
  MOBILITY_LIBRARY.forEach(function(m){if(!m.dose||!m.cues||!m.cues.length)issues.push(m.id+': no dose or cues');
    m.regions.forEach(function(r){if(!MOBILITY_REGIONS[r])issues.push(m.id+': unknown region '+r);});
    m.targets.forEach(function(t){if(typeof MUSCLE_GROUPS!=='undefined'&&!MUSCLE_GROUPS[t])issues.push(m.id+': unknown muscle '+t);});
    if(m.pose&&typeof POSE_POSITIONS!=='undefined'&&!POSE_POSITIONS[m.pose])issues.push(m.id+': pose '+m.pose+' has no drawing');});
  Object.keys(WARMUP_BY_GROUP).concat([]).forEach(function(g){WARMUP_BY_GROUP[g].forEach(function(id){if(!_MOB[id])issues.push('warm-up '+g+' names unknown drill '+id);});});
  Object.keys(COOLDOWN_FOR_MUSCLE).forEach(function(m){COOLDOWN_FOR_MUSCLE[m].forEach(function(id){if(!_MOB[id])issues.push('cool-down for '+m+' names unknown stretch '+id);});});
  Object.keys(MOBILITY_ROUTINES).forEach(function(k){MOBILITY_ROUTINES[k].ids.forEach(function(id){if(!_MOB[id])issues.push('routine '+k+' names unknown item '+id);});});
  Object.keys(MUSCLE_GROUPS).forEach(function(m){if(m!=='back'&&!COOLDOWN_FOR_MUSCLE[m])issues.push('no cool-down for '+m);});
  var regionsCovered={};MOBILITY_LIBRARY.forEach(function(m){m.regions.forEach(function(r){regionsCovered[r]=1;});});
  Object.keys(MOBILITY_REGIONS).forEach(function(r){if(!regionsCovered[r])issues.push('no item for region '+r);});
  return {items:MOBILITY_LIBRARY.length,regions:Object.keys(MOBILITY_REGIONS).length,routines:Object.keys(MOBILITY_ROUTINES).length,issues:issues,ok:issues.length===0};
}

/* ONE LIBRARY. These items join the existing MOVEMENT_LIBRARY in its own shape, so the existing Prepare and Recover
   screens draw on them too, rather than a second library sitting beside the first. */
var _REGION_JOINT={neck:'cervical',shoulders:'shoulder',chest:'shoulder',upperback:'thoracic',lowerback:'lumbar',hips:'hip',hipflexors:'hip',
  glutes:'hip',hamstrings:'hip',quads:'knee',innerthigh:'hip',ankles:'ankle',wrists:'wrist'};
(function(){
  var patternsFor=function(id){var out=[];Object.keys(WARMUP_BY_GROUP).forEach(function(g){if(WARMUP_BY_GROUP[g].indexOf(id)>=0)out=out.concat(PATTERN_GROUPS[g]||[]);});return out;};
  MOBILITY_LIBRARY.forEach(function(m){
    if(MOVEMENT_LIBRARY.some(function(x){return x.id===m.id;}))return;
    var joints=[];m.regions.forEach(function(r){var j=_REGION_JOINT[r];if(j&&joints.indexOf(j)<0)joints.push(j);});
    var secs=m.seconds*(/each side/.test(m.dose)?2:1);
    MOVEMENT_LIBRARY.push({id:m.id,label:m.name,role:m.type==='stretch'?'flexibility':'mobility',
      phase:m.when==='warm-up'?'prepare':(m.when==='cool-down'?'recover':'adapt'),targets:joints,patterns:patternsFor(m.id),
      objective:'range for the '+m.regions.map(function(r){return MOBILITY_REGIONS[r].toLowerCase();}).join(' and '),
      dose:{minutes:Math.round(secs/6)/10,intensity:m.type==='stretch'?2:3},doseText:m.dose,cues:m.cues,expected:m.cues[0],
      evidence:m.type==='stretch'?'held stretching changes tolerated range; how much carries into training is individual':'moving drills change range for the session that follows',
      source:'library'});
  });
})();
