/* ============================================================================
   THE MOVEMENT LIBRARY, EXPANDED
   The library held 33 exercises on 16 patterns and 8 kinds of equipment, with no carries, no core patterns beyond a
   crunch, no jumps or throws, no rotator-cuff work, and no kettlebells, bands, trap bar, landmine, rings or sled. Every
   pattern a training programme uses is now here, across every common kind of equipment, each with a level and plain
   cues, and every exercise sits on a progression ladder where one exists \u2014 the easier and harder versions of the
   same movement, with a plain rule for when to move up or down.

   The original 33 keep their ids, names and aliases, so every logged session and programme still resolves.
   ============================================================================ */
function _X(id,name,pattern,primary,secondary,equipment,o){o=o||{};
  return {id:id,name:name,aliases:o.aliases||[],pattern:pattern,primary:primary,secondary:secondary||[],equipment:equipment,
    compound:o.compound!==false&&(secondary||[]).length>0,fatigue:o.fatigue||'moderate',skill:o.skill||'moderate',level:o.level||'intermediate',
    cues:o.cues||[],unilateral:!!o.unilateral,isometric:!!o.isometric};}
var EXERCISE_ADDITIONS=[
  /* squat and knee-dominant */
  _X('bwsquat','Bodyweight squat','squat',['quads','glutes'],['adductors'],['bodyweight'],{level:'beginner',skill:'low',fatigue:'low',cues:['Sit back and down between your heels','Knees travel over your toes','Stand tall at the top']}),
  _X('boxsquat','Box squat','squat',['quads','glutes'],['hamstrings','adductors'],['barbell','rack','bench'],{level:'beginner',cues:['Sit back until you touch the box','Stay tight; do not relax on the box','Drive up through the whole foot']}),
  _X('frontsquat','Front squat','squat',['quads','glutes'],['abs','upperback'],['barbell','rack'],{level:'advanced',skill:'high',fatigue:'high',cues:['Elbows high, bar on the shoulders','Stay upright on the way down','Push knees out as you rise']}),
  _X('pausesquat','Pause squat','squat',['quads','glutes'],['adductors','erectors'],['barbell','rack'],{level:'advanced',fatigue:'high',cues:['Hold the bottom for two seconds','Stay braced through the pause','Drive up without bouncing']}),
  _X('smithsquat','Smith machine squat','squat',['quads','glutes'],[],['smith'],{level:'beginner',skill:'low',cues:['Feet slightly in front of the bar','Control the lowering','Keep your back against the pad line']}),
  _X('beltsquat','Belt squat','squat',['quads','glutes'],['adductors'],['machine'],{level:'intermediate',skill:'low',cues:['Load hangs from the hips, not the spine','Sit straight down','Drive the floor away']}),
  _X('pistol','Pistol squat','squat',['quads','glutes'],['abs','adductors'],['bodyweight'],{level:'advanced',skill:'high',unilateral:true,cues:['Reach arms forward to balance','Keep the free leg off the floor','Lower slowly under control']}),
  _X('boxpistol','Box pistol','squat',['quads','glutes'],['abs'],['bodyweight','bench'],{level:'intermediate',unilateral:true,cues:['Sit to a box on one leg','Touch lightly, do not rest','Stand without pushing off the other leg']}),
  _X('sissysquat','Sissy squat','knee extension',['quads'],[],['bodyweight'],{level:'advanced',compound:false,cues:['Rise onto your toes','Lean back as knees go forward','Hold something for balance at first']}),
  _X('stepup','Step-up','lunge',['quads','glutes'],['hamstrings'],['dumbbell','bench'],{level:'beginner',unilateral:true,cues:['Whole foot on the box','Push through the top leg only','Lower slowly on the way down']}),
  /* The original library's splitsquat is the Bulgarian and its lunge is the walking lunge; this is the plain version. */
  _X('staticsplitsquat','Split squat','lunge',['quads','glutes'],['adductors'],['bodyweight','dumbbell'],{level:'beginner',unilateral:true,cues:['One foot forward, one back, both on the floor','Lower straight down','Push through the front foot']}),
  _X('reverselunge','Reverse lunge','lunge',['quads','glutes'],['adductors'],['dumbbell'],{level:'beginner',unilateral:true,cues:['Step back, not forward','Back knee lowers toward the floor','Push through the front heel to return']}),
  _X('lateralunge','Lateral lunge','lunge',['adductors','glutes'],['quads'],['dumbbell'],{level:'intermediate',unilateral:true,cues:['Step wide to the side','Sit into the stepping hip','Keep the other leg straight']}),
  _X('deficitlunge','Deficit reverse lunge','lunge',['quads','glutes'],['adductors'],['dumbbell'],{level:'advanced',unilateral:true,cues:['Stand on a low platform','Step back and sink deeper','Keep your chest up']}),
  _X('wallsit','Wall sit','knee extension',['quads'],['glutes'],['bodyweight'],{level:'beginner',isometric:true,compound:false,fatigue:'low',cues:['Back flat against the wall','Thighs parallel to the floor','Breathe steadily and hold']}),
  _X('spanishsquat','Spanish squat','knee extension',['quads'],[],['band'],{level:'intermediate',isometric:true,compound:false,cues:['Band behind the knees, anchored in front','Sit back with shins vertical','Knee-friendly quad work']}),
  _X('sledpush','Sled push','squat',['quads','glutes'],['calves','chest'],['sled'],{level:'intermediate',fatigue:'high',cues:['Arms locked, body at an angle','Short powerful steps','Drive through the balls of the feet']}),
  /* hinge and hip extension */
  _X('kbdeadlift','Kettlebell deadlift','hinge',['glutes','hamstrings'],['erectors','forearms'],['kettlebell'],{level:'beginner',skill:'low',cues:['Push your hips back','Flat back, bell between the feet','Stand up by squeezing your glutes']}),
  _X('trapbardl','Trap bar deadlift','hinge',['glutes','quads','hamstrings'],['erectors','traps','forearms'],['trapbar'],{level:'intermediate',fatigue:'high',cues:['Stand in the middle of the bar','Push the floor away','Lock out with hips and knees together']}),
  _X('sumodl','Sumo deadlift','hinge',['glutes','adductors','quads'],['hamstrings','erectors'],['barbell'],{level:'advanced',fatigue:'high',skill:'high',cues:['Wide stance, toes out','Hands inside the knees','Spread the floor as you pull']}),
  _X('dbrdl','Dumbbell Romanian deadlift','hinge',['hamstrings','glutes'],['erectors'],['dumbbell'],{level:'beginner',cues:['Soft knees, hips back','Weights close to your legs','Stop when your hips stop moving back']}),
  _X('singlelegrdl','Single-leg Romanian deadlift','hinge',['hamstrings','glutes'],['abs'],['dumbbell'],{level:'intermediate',unilateral:true,cues:['Hinge on one leg, the other trails back','Keep hips square to the floor','Move slowly and balanced']}),
  _X('goodmorning','Good morning','hinge',['hamstrings','erectors'],['glutes'],['barbell','rack'],{level:'advanced',skill:'high',cues:['Bar on the upper back','Hips back, back flat','Light weight; this is about position']}),
  _X('kbswing','Kettlebell swing','hinge',['glutes','hamstrings'],['erectors','abs','forearms'],['kettlebell'],{level:'intermediate',skill:'moderate',cues:['It is a hip snap, not a squat','Arms are ropes; hips drive the bell','Stand tall and squeeze at the top']}),
  _X('cablepullthrough','Cable pull-through','hinge',['glutes','hamstrings'],[],['cable'],{level:'beginner',skill:'low',cues:['Face away from the cable','Hips back, then drive them forward','Squeeze your glutes at the end']}),
  _X('glutebridge','Glute bridge','hip extension',['glutes'],['hamstrings'],['bodyweight'],{level:'beginner',skill:'low',fatigue:'low',compound:false,cues:['Lie on your back, feet flat','Push through your heels','Squeeze your glutes at the top']}),
  _X('singlelegbridge','Single-leg glute bridge','hip extension',['glutes'],['hamstrings'],['bodyweight'],{level:'intermediate',unilateral:true,compound:false,cues:['One foot down, the other lifted','Keep your hips level','Pause at the top']}),
  _X('singleleghipthrust','Single-leg hip thrust','hip extension',['glutes'],['hamstrings'],['bench'],{level:'advanced',unilateral:true,compound:false,cues:['Upper back on the bench','One foot planted','Lift until hips are level with your knee']}),
  _X('cablekickback','Cable glute kickback','hip extension',['glutes'],[],['cable'],{level:'beginner',unilateral:true,compound:false,cues:['Slight forward lean','Kick back, not up','Squeeze at the end without arching']}),
  _X('reversehyper','Reverse hyperextension','hip extension',['glutes','erectors'],['hamstrings'],['machine'],{level:'intermediate',compound:false,cues:['Torso on the pad, legs hang','Swing legs up with your glutes','Control the lowering']}),
  _X('nordic','Nordic hamstring curl','knee flexion',['hamstrings'],[],['bodyweight'],{level:'advanced',fatigue:'high',compound:false,cues:['Ankles held, kneel upright','Lower as slowly as you can','Catch yourself with your hands']}),
  _X('slidercurl','Slider leg curl','knee flexion',['hamstrings'],['glutes'],['bodyweight'],{level:'intermediate',compound:false,cues:['Lie on your back, heels on sliders','Lift hips, pull heels in','Keep hips up throughout']}),
  _X('seatedlegcurl','Seated leg curl','knee flexion',['hamstrings'],[],['machine'],{level:'beginner',skill:'low',compound:false,cues:['Knees lined up with the pivot','Curl all the way in','Control the way back']}),
  /* horizontal push */
  _X('wallpushup','Wall push-up','horizontal push',['chest'],['triceps','delts'],['bodyweight'],{level:'beginner',skill:'low',fatigue:'low',cues:['Hands on the wall at shoulder height','Body in a straight line','Chest to the wall and push away']}),
  _X('inclinepushup','Incline push-up','horizontal push',['chest'],['triceps','delts'],['bodyweight','bench'],{level:'beginner',skill:'low',cues:['Hands on a bench or counter','Straight line from head to heels','Lower your chest to the edge']}),
  _X('kneepushup','Knee push-up','horizontal push',['chest'],['triceps','delts'],['bodyweight'],{level:'beginner',skill:'low',cues:['Knees down, hips in line','Elbows about 45 degrees out','Full range, chest near the floor']}),
  _X('deficitpushup','Deficit push-up','horizontal push',['chest'],['triceps','delts'],['bodyweight'],{level:'intermediate',cues:['Hands on plates or handles','Sink lower than your hands','Keep your body rigid']}),
  _X('archerpushup','Archer push-up','horizontal push',['chest','triceps'],['delts'],['bodyweight'],{level:'advanced',skill:'high',cues:['Wide hands, shift to one side','Other arm stays straight','Alternate sides']}),
  _X('ringpushup','Ring push-up','horizontal push',['chest'],['triceps','delts','abs'],['rings'],{level:'advanced',skill:'high',cues:['Rings close to the floor','Keep them from drifting apart','Turn hands out at the top']}),
  _X('declinebench','Decline bench press','horizontal push',['chest'],['triceps'],['barbell','bench'],{level:'intermediate',cues:['Feet locked in','Lower to the lower chest','Press back over the shoulders']}),
  _X('closegripbench','Close-grip bench press','horizontal push',['triceps','chest'],['delts'],['barbell','bench'],{level:'intermediate',cues:['Hands shoulder-width','Elbows close to your sides','Touch the lower chest']}),
  _X('floorpress','Dumbbell floor press','horizontal push',['chest','triceps'],['delts'],['dumbbell'],{level:'beginner',cues:['Lie on the floor','Upper arms touch the floor lightly','Press up and together']}),
  _X('pecfly','Dumbbell fly','horizontal push',['chest'],['delts'],['dumbbell','bench'],{level:'intermediate',compound:false,cues:['Slight bend in the elbows','Open wide like a hug','Stop at a comfortable stretch']}),
  _X('cablefly','Cable fly','horizontal push',['chest'],['delts'],['cable'],{level:'beginner',compound:false,skill:'low',cues:['Step forward, slight lean','Bring hands together in an arc','Squeeze the chest']}),
  _X('pecdeck','Pec deck','horizontal push',['chest'],[],['machine'],{level:'beginner',compound:false,skill:'low',cues:['Seat so handles are at chest height','Bring arms together','Control the opening']}),
  _X('landminepress','Landmine press','incline push',['delts','chest'],['triceps','abs'],['landmine'],{level:'beginner',unilateral:true,cues:['Bar end at your shoulder','Press up and forward','Friendly on the shoulders']}),
  _X('inclinebench','Incline barbell bench press','incline push',['chest','delts'],['triceps'],['barbell','bench'],{level:'intermediate',cues:['Bench at about 30 degrees','Lower to the upper chest','Press straight up']}),
  _X('bandpushup','Band-resisted push-up','horizontal push',['chest'],['triceps','delts'],['band'],{level:'intermediate',cues:['Band across your upper back','Hold the ends under your hands','Push hard at the top']}),
  /* vertical push */
  _X('pikepushup','Pike push-up','vertical push',['delts'],['triceps'],['bodyweight'],{level:'intermediate',cues:['Hips high like an upside-down V','Head goes forward of your hands','Push back up']}),
  _X('handstandpushup','Handstand push-up','vertical push',['delts','triceps'],['upperback'],['bodyweight'],{level:'advanced',skill:'high',fatigue:'high',cues:['Kick up against a wall','Lower your head to a cushion','Press up to straight arms']}),
  _X('seateddbpress','Seated dumbbell shoulder press','vertical push',['delts'],['triceps'],['dumbbell','bench'],{level:'beginner',cues:['Back against the pad','Press up and slightly in','Lower to ear level']}),
  _X('arnoldpress','Arnold press','vertical push',['delts'],['triceps','sidedelts'],['dumbbell'],{level:'intermediate',cues:['Start palms facing you','Rotate as you press','Reverse on the way down']}),
  _X('pushpress','Push press','vertical push',['delts','triceps'],['quads','glutes'],['barbell','rack'],{level:'advanced',skill:'high',fatigue:'high',cues:['Small dip with the knees','Drive the bar with your legs','Finish with the arms']}),
  _X('machineshoulder','Machine shoulder press','vertical push',['delts'],['triceps'],['machine'],{level:'beginner',skill:'low',cues:['Handles at shoulder height','Press without shrugging','Control the lowering']}),
  _X('cablelatraise','Cable lateral raise','abduction',['sidedelts'],[],['cable'],{level:'beginner',compound:false,unilateral:true,cues:['Cable crosses in front of you','Lead with your elbow','Stop at shoulder height']}),
  _X('uprightrow','Upright row','abduction',['sidedelts','traps'],['biceps'],['cable'],{level:'intermediate',compound:true,cues:['Wide grip','Pull elbows up and out','Stop at chest height']}),
  /* vertical pull */
  _X('assistedpullup','Assisted pull-up','vertical pull',['lats'],['biceps','upperback'],['machine'],{level:'beginner',skill:'low',cues:['Knees on the pad','Pull your chest to the bar','Lower all the way']}),
  _X('negativepullup','Negative pull-up','vertical pull',['lats'],['biceps','upperback'],['bar'],{level:'beginner',cues:['Jump to the top position','Lower as slowly as you can','Five seconds down']}),
  _X('bandpullup','Band-assisted pull-up','vertical pull',['lats'],['biceps','upperback'],['bar','band'],{level:'beginner',cues:['Band under a knee or foot','Full hang at the bottom','Chin over the bar']}),
  _X('chinup','Chin-up','vertical pull',['lats','biceps'],['upperback'],['bar'],{level:'intermediate',cues:['Palms facing you','Pull chest toward the bar','Lower to straight arms']}),
  _X('weightedpullup','Weighted pull-up','vertical pull',['lats'],['biceps','upperback','forearms'],['bar'],{level:'advanced',fatigue:'high',cues:['Belt or dumbbell between the feet','Same full range as unweighted','Add weight in small steps']}),
  _X('singlearmpulldown','Single-arm cable pulldown','vertical pull',['lats'],['biceps'],['cable'],{level:'beginner',unilateral:true,cues:['Kneel beside the cable','Pull the elbow to your hip','Feel the stretch at the top']}),
  _X('straightarmpulldown','Straight-arm pulldown','vertical pull',['lats'],['triceps'],['cable'],{level:'beginner',compound:false,cues:['Arms nearly straight','Sweep the bar to your thighs','Keep your ribs down']}),
  _X('ringrow','Ring row','horizontal pull',['upperback','lats'],['biceps','reardelts'],['rings'],{level:'beginner',cues:['Walk your feet forward to make it harder','Body straight','Pull rings to your ribs']}),
  /* horizontal pull */
  _X('invertedrow','Inverted row','horizontal pull',['upperback','lats'],['biceps','reardelts'],['bar'],{level:'beginner',cues:['Hang under a low bar','Body stiff like a plank','Pull your chest to the bar']}),
  _X('chestsupportedrow','Chest-supported row','horizontal pull',['upperback','lats'],['reardelts','biceps'],['dumbbell','bench'],{level:'beginner',skill:'low',cues:['Chest on an incline bench','Pull elbows back','Squeeze your shoulder blades']}),
  _X('sealrow','Seal row','horizontal pull',['upperback','lats'],['reardelts'],['barbell','bench'],{level:'intermediate',cues:['Lie face down on a high bench','Row to the bench','No body swing possible']}),
  _X('pendlayrow','Pendlay row','horizontal pull',['upperback','lats'],['erectors','reardelts'],['barbell'],{level:'advanced',skill:'high',fatigue:'high',cues:['Back flat, parallel to the floor','Row explosively from the floor','Reset each rep']}),
  _X('meadowsrow','Meadows row','horizontal pull',['lats','upperback'],['reardelts','forearms'],['landmine'],{level:'intermediate',unilateral:true,cues:['Stand side-on to the bar end','Pull high to the hip','Stretch at the bottom']}),
  _X('bandrow','Band row','horizontal pull',['upperback'],['biceps','reardelts'],['band'],{level:'beginner',skill:'low',fatigue:'low',cues:['Anchor the band at chest height','Pull to your ribs','Pause with shoulder blades together']}),
  _X('reversefly','Reverse dumbbell fly','horizontal pull',['reardelts'],['upperback'],['dumbbell'],{level:'beginner',compound:false,cues:['Hinge forward','Arms out wide','Lead with the backs of your hands']}),
  _X('bandpullapart','Band pull-apart','horizontal pull',['reardelts','upperback'],[],['band'],{level:'beginner',compound:false,skill:'low',fatigue:'low',cues:['Arms straight in front','Pull the band to your chest','Squeeze and return slowly']}),
  _X('reversepecdeck','Reverse pec deck','horizontal pull',['reardelts'],['upperback'],['machine'],{level:'beginner',compound:false,skill:'low',cues:['Face the pad','Sweep arms back','Stop when arms line up with your body']}),
  /* arms */
  _X('hammercurl','Hammer curl','elbow flexion',['biceps','forearms'],[],['dumbbell'],{level:'beginner',compound:false,skill:'low',cues:['Palms face each other','Elbows stay by your sides','Lower all the way']}),
  _X('inclinecurl','Incline dumbbell curl','elbow flexion',['biceps'],[],['dumbbell','bench'],{level:'intermediate',compound:false,cues:['Lie back on an incline','Arms hang straight down','Curl without moving the elbows']}),
  _X('preachercurl','Preacher curl','elbow flexion',['biceps'],[],['machine'],{level:'beginner',compound:false,skill:'low',cues:['Upper arms flat on the pad','Lower to nearly straight','Curl up without lifting off']}),
  _X('cablecurl','Cable curl','elbow flexion',['biceps'],[],['cable'],{level:'beginner',compound:false,skill:'low',cues:['Stand tall','Constant tension through the range','Squeeze at the top']}),
  _X('bandcurl','Band curl','elbow flexion',['biceps'],[],['band'],{level:'beginner',compound:false,skill:'low',fatigue:'low',cues:['Stand on the band','Curl with elbows still','Slow on the way down']}),
  _X('skullcrusher','Skull crusher','elbow extension',['triceps'],[],['barbell','bench'],{level:'intermediate',compound:false,cues:['Lower the bar toward your forehead','Upper arms stay still','Extend fully']}),
  _X('overheadext','Overhead triceps extension','elbow extension',['triceps'],[],['dumbbell'],{level:'beginner',compound:false,cues:['Dumbbell behind your head','Elbows point up','Extend to straight arms']}),
  _X('benchdip','Bench dip','elbow extension',['triceps'],['chest','delts'],['bench'],{level:'beginner',cues:['Hands on a bench behind you','Lower until elbows are at 90 degrees','Keep close to the bench']}),
  _X('assisteddip','Assisted dip','elbow extension',['triceps','chest'],['delts'],['machine'],{level:'beginner',cues:['Knees on the pad','Lean slightly forward','Lower to a comfortable depth']}),
  _X('weighteddip','Weighted dip','elbow extension',['triceps','chest'],['delts'],['bar'],{level:'advanced',fatigue:'high',cues:['Belt with weight','Same depth as unweighted','Add weight slowly']}),
  _X('diamondpushup','Diamond push-up','elbow extension',['triceps'],['chest'],['bodyweight'],{level:'intermediate',cues:['Hands together under your chest','Elbows brush your sides','Full range']}),
  _X('wristcurl','Wrist curl','grip',['forearms'],[],['dumbbell'],{level:'beginner',compound:false,skill:'low',fatigue:'low',cues:['Forearms on your thighs','Curl the wrist up','Slow and controlled']}),
  _X('deadhang','Dead hang','grip',['forearms','lats'],[],['bar'],{level:'beginner',isometric:true,compound:false,fatigue:'low',cues:['Hang from a bar with straight arms','Relax your shoulders gently','Build up time']}),
  _X('platepinch','Plate pinch','grip',['forearms'],[],['plate'],{level:'intermediate',isometric:true,compound:false,cues:['Pinch two plates smooth-side out','Hold at your side','Build up time']}),
  /* carries */
  _X('farmercarry','Farmer carry','carry',['forearms','traps'],['glutes','abs','upperback'],['dumbbell'],{level:'beginner',skill:'low',cues:['Heavy weights at your sides','Stand tall, short quick steps','Do not let them swing']}),
  _X('suitcasecarry','Suitcase carry','carry',['obliques','forearms'],['abs','glutes'],['dumbbell'],{level:'intermediate',unilateral:true,cues:['One weight on one side','Do not lean toward it','Walk steadily']}),
  _X('overheadcarry','Overhead carry','carry',['delts','abs'],['traps','triceps'],['kettlebell'],{level:'advanced',skill:'high',cues:['Arm locked straight overhead','Ribs down, stand tall','Walk slowly']}),
  _X('rackcarry','Front rack carry','carry',['abs','upperback'],['forearms','delts'],['kettlebell'],{level:'intermediate',cues:['Kettlebells held at your chest','Elbows tucked','Breathe while walking']}),
  _X('sleddrag','Sled drag','carry',['quads','glutes'],['calves','forearms'],['sled'],{level:'beginner',skill:'low',cues:['Walk backward pulling the sled','Stay low','Steady steps']}),
  /* core */
  _X('deadbug','Dead bug','anti-extension',['abs'],['obliques'],['bodyweight'],{level:'beginner',skill:'low',fatigue:'low',compound:false,cues:['Lie on your back, arms and knees up','Lower opposite arm and leg','Keep your lower back pressed down']}),
  _X('kneeplank','Knee plank','anti-extension',['abs'],['obliques'],['bodyweight'],{level:'beginner',isometric:true,compound:false,fatigue:'low',cues:['Forearms and knees down','Straight line shoulders to knees','Breathe and hold']}),
  _X('plank','Plank','anti-extension',['abs'],['obliques','delts'],['bodyweight'],{level:'beginner',isometric:true,compound:false,fatigue:'low',cues:['Forearms under shoulders','Squeeze glutes, ribs down','Straight line head to heels']}),
  _X('rkcplank','Hard-style plank','anti-extension',['abs'],['obliques','glutes'],['bodyweight'],{level:'intermediate',isometric:true,compound:false,cues:['Pull elbows toward toes','Squeeze everything hard','Short holds of 10 to 20 seconds']}),
  _X('abwheel','Ab wheel rollout','anti-extension',['abs'],['lats','obliques'],['wheel'],{level:'advanced',skill:'high',compound:false,cues:['Start on your knees','Roll out only as far as you can keep a flat back','Pull back with your abs']}),
  _X('bodysaw','Body saw','anti-extension',['abs'],['delts'],['bodyweight'],{level:'advanced',compound:false,cues:['Plank with feet on sliders','Rock back and forth from the shoulders','Keep the hips from sagging']}),
  _X('pallofpress','Pallof press','anti-rotation',['obliques','abs'],[],['cable'],{level:'beginner',compound:false,cues:['Stand side-on to the cable','Press straight out from your chest','Do not let it turn you']}),
  _X('bandpallof','Band Pallof press','anti-rotation',['obliques','abs'],[],['band'],{level:'beginner',compound:false,skill:'low',fatigue:'low',cues:['Band anchored at chest height, side-on','Press out and hold','Stay square']}),
  _X('birddog','Bird dog','anti-rotation',['erectors','abs'],['glutes'],['bodyweight'],{level:'beginner',compound:false,skill:'low',fatigue:'low',cues:['On hands and knees','Reach opposite arm and leg','Keep your hips still']}),
  _X('sideplank','Side plank','anti-lateral flexion',['obliques'],['abs','glutes'],['bodyweight'],{level:'beginner',isometric:true,compound:false,fatigue:'low',cues:['Forearm under your shoulder','Hips lifted in a straight line','Hold, then switch sides']}),
  _X('copenhagen','Copenhagen plank','hip adduction',['adductors','obliques'],[],['bench'],{level:'advanced',isometric:true,compound:false,cues:['Side plank with top leg on a bench','Lift the bottom leg','Start with the knee on the bench']}),
  _X('adductormachine','Hip adduction machine','hip adduction',['adductors'],[],['machine'],{level:'beginner',compound:false,skill:'low',cues:['Pads on the inside of your knees','Squeeze together','Open slowly']}),
  _X('cablewoodchop','Cable woodchop','rotation',['obliques'],['abs','delts'],['cable'],{level:'intermediate',compound:false,cues:['Pull high to low across your body','Turn through your hips and chest','Control the return']}),
  _X('russiantwist','Russian twist','rotation',['obliques'],['abs'],['bodyweight'],{level:'beginner',compound:false,cues:['Sit leaning back','Turn shoulders side to side','Keep your chest up']}),
  _X('landminerotation','Landmine rotation','rotation',['obliques'],['delts','abs'],['landmine'],{level:'intermediate',compound:false,cues:['Hold the bar end at arm length','Sweep it side to side','Pivot your back foot']}),
  _X('hangingkneeraise','Hanging knee raise','hip flexion',['abs'],['forearms'],['bar'],{level:'beginner',compound:false,aliases:['knee raise'],cues:['Hang from a bar','Bring knees to your chest','Lower slowly without swinging']}),
  _X('hanginglegraise','Hanging leg raise','hip flexion',['abs'],['forearms','obliques'],['bar'],{level:'intermediate',compound:false,cues:['Hang with straight legs','Lift legs to hip height or higher','No swinging']}),
  _X('toestobar','Toes to bar','hip flexion',['abs'],['lats','forearms'],['bar'],{level:'advanced',skill:'high',compound:false,cues:['Hang and lift your toes to the bar','Use your abs, not momentum','Lower under control']}),
  _X('reversecrunch','Reverse crunch','trunk flexion',['abs'],[],['bodyweight'],{level:'beginner',compound:false,skill:'low',fatigue:'low',cues:['Lie on your back, knees bent','Curl your hips toward your chest','Lower slowly']}),
  _X('cablecrunch','Cable crunch','trunk flexion',['abs'],['obliques'],['cable'],{level:'intermediate',compound:false,cues:['Kneel facing the cable','Curl your ribs toward your hips','Hips stay still']}),
  _X('sidebend','Dumbbell side bend','anti-lateral flexion',['obliques'],[],['dumbbell'],{level:'beginner',compound:false,skill:'low',cues:['Weight in one hand','Bend sideways only','Return using your side muscles']}),
  /* shoulders' small muscles */
  _X('extrotation','Cable external rotation','external rotation',['reardelts'],['upperback'],['cable'],{level:'beginner',compound:false,skill:'low',fatigue:'low',cues:['Elbow at your side, bent 90 degrees','Rotate the hand outward','Light weight, slow']}),
  _X('bandextrotation','Band external rotation','external rotation',['reardelts'],['upperback'],['band'],{level:'beginner',compound:false,skill:'low',fatigue:'low',cues:['Towel under the elbow','Turn the hand away from your body','Slow and light']}),
  _X('ytw','Y-T-W raise','external rotation',['reardelts','upperback'],['traps'],['dumbbell','bench'],{level:'beginner',compound:false,cues:['Chest on an incline bench','Raise light weights in Y, T and W shapes','Thumbs up']}),
  _X('dbshrug','Dumbbell shrug','scapular elevation',['traps'],['forearms'],['dumbbell'],{level:'beginner',compound:false,skill:'low',cues:['Shoulders straight up to your ears','Pause at the top','No rolling']}),
  /* calves */
  _X('seatedcalf','Seated calf raise','plantar flexion',['calves'],[],['machine'],{level:'beginner',compound:false,skill:'low',cues:['Knees under the pad','Full stretch at the bottom','Pause at the top']}),
  _X('singlelegcalf','Single-leg calf raise','plantar flexion',['calves'],[],['bodyweight'],{level:'beginner',compound:false,unilateral:true,cues:['Stand on a step on one foot','Lower your heel fully','Rise as high as you can']}),
  /* power */
  _X('boxjump','Box jump','jump',['quads','glutes'],['calves','hamstrings'],['box'],{level:'intermediate',skill:'moderate',cues:['Swing arms and jump','Land softly, knees bent','Step down, do not jump down']}),
  _X('broadjump','Broad jump','jump',['glutes','quads'],['hamstrings','calves'],['bodyweight'],{level:'intermediate',cues:['Swing and jump forward','Land in a squat','Stick the landing']}),
  _X('squatjump','Squat jump','jump',['quads','glutes'],['calves'],['bodyweight'],{level:'beginner',cues:['Quarter squat then jump','Land softly','Reset between reps']}),
  _X('depthjump','Depth jump','jump',['quads','calves'],['glutes'],['box'],{level:'advanced',skill:'high',fatigue:'high',cues:['Step off a low box','Jump up the instant you land','Only a few reps, fully rested']}),
  _X('medballslam','Medicine ball slam','throw',['lats','abs'],['delts','triceps'],['medball'],{level:'beginner',cues:['Ball overhead, rise on your toes','Slam it down hard','Catch and repeat']}),
  _X('medballchestpass','Medicine ball chest pass','throw',['chest','triceps'],['delts'],['medball'],{level:'beginner',cues:['Ball at your chest','Throw it hard to a wall','Catch with soft arms']}),
  _X('medballrotthrow','Rotational medicine ball throw','throw',['obliques'],['glutes','delts'],['medball'],{level:'intermediate',cues:['Stand side-on to a wall','Turn and throw from the hips','Catch and repeat']})
];
/* Level and cues for the original 33, which had neither. */
var EXERCISE_DETAILS={
  squat:{level:'intermediate',cues:['Bar on your upper back','Sit down between your heels','Drive up through the whole foot']},
  legpress:{level:'beginner',cues:['Feet shoulder-width on the platform','Lower until hips start to tuck','Press without locking the knees hard']},
  hacksquat:{level:'intermediate',cues:['Back against the pad','Sit deep','Drive through your heels']},
  gobletsquat:{level:'beginner',cues:['Hold a dumbbell at your chest','Elbows inside the knees at the bottom','Stay upright']},
  splitsquat:{level:'intermediate',cues:['Rear foot on a bench','Front foot far enough forward','Lower straight down']},
  lunge:{level:'intermediate',cues:['Long step, torso tall','Back knee close to the floor','Keep moving forward smoothly']},
  rdl:{level:'intermediate',cues:['Soft knees, hips back','Bar close to your legs','Stop when hips stop moving back']},
  deadlift:{level:'advanced',cues:['Bar over the middle of your foot','Flat back, push the floor away','Stand up tall; do not lean back']},
  hipthrust:{level:'intermediate',cues:['Upper back on a bench','Bar across your hips','Lift until your body is flat, chin tucked']},
  legcurl:{level:'beginner',cues:['Knees line up with the pivot','Curl fully','Control the way back']},
  legext:{level:'beginner',cues:['Knees line up with the pivot','Straighten fully','Lower slowly']},
  calf:{level:'beginner',cues:['Full stretch at the bottom','Rise as high as you can','Pause at the top']},
  bench:{level:'intermediate',cues:['Shoulder blades pulled back','Lower to your mid-chest','Press up and slightly back']},
  dbbench:{level:'beginner',cues:['Dumbbells over your shoulders','Lower to chest level','Press up together']},
  inclinedb:{level:'beginner',cues:['Bench at about 30 degrees','Lower to the upper chest','Press up']},
  machinepress:{level:'beginner',cues:['Handles at chest height','Press without shrugging','Control the return']},
  cablepress:{level:'beginner',cues:['Step forward, split stance','Press the handles together','Control the return']},
  pushup:{level:'beginner',cues:['Hands under your shoulders','Body in a straight line','Chest to the floor, then push away']},
  ohp:{level:'intermediate',cues:['Bar at the front of your shoulders','Press straight up','Head through at the top']},
  latraise:{level:'beginner',cues:['Slight lean forward','Lead with your elbows','Stop at shoulder height']},
  pulldown:{level:'beginner',cues:['Grip a little wider than shoulders','Pull the bar to your upper chest','Control the way up']},
  pullup:{level:'intermediate',cues:['Hang with straight arms','Pull your chest toward the bar','Lower all the way']},
  cablerow:{level:'beginner',cues:['Sit tall','Pull the handle to your stomach','Let your shoulders stretch forward at the end']},
  dbrow:{level:'beginner',cues:['One hand and knee on a bench','Pull the dumbbell to your hip','Lower fully']},
  bbrow:{level:'intermediate',cues:['Hinge forward, back flat','Pull the bar to your stomach','No jerking']},
  machinerow:{level:'beginner',cues:['Chest on the pad','Pull the elbows back','Squeeze your shoulder blades']},
  facepull:{level:'beginner',cues:['Rope at face height','Pull apart toward your ears','Elbows high']},
  curl:{level:'beginner',cues:['Elbows by your sides','Curl up without swinging','Lower slowly']},
  pressdown:{level:'beginner',cues:['Elbows pinned at your sides','Push down to straight arms','Control the way up']},
  dip:{level:'intermediate',cues:['Lean slightly forward','Lower to a comfortable depth','Press back up']},
  abs:{level:'beginner',cues:['Curl your ribs toward your hips','Slow and controlled','Breathe out as you curl']},
  backext:{level:'beginner',cues:['Hips on the pad','Lower with a flat back','Rise until your body is straight']},
  shrug:{level:'beginner',cues:['Shoulders straight up','Pause at the top','Lower fully']}
};
/* ---- PROGRESSION LADDERS ----
   The easier and harder versions of one movement, easiest first. "Move up" and "move down" are plain rules a person
   can apply without the app; the app suggests them from the sets logged. */
var PROGRESSION_LADDERS={
  pushup:{label:'Push-up',steps:['wallpushup','inclinepushup','kneepushup','pushup','deficitpushup','ringpushup','archerpushup'],
    up:'three sets of 12 with good form',down:'fewer than 5 good reps in a set'},
  pullup:{label:'Pull-up',steps:['invertedrow','negativepullup','bandpullup','chinup','pullup','weightedpullup'],
    up:'three sets of 8 with good form',down:'fewer than 3 good reps in a set'},
  squat:{label:'Squat',steps:['bwsquat','boxsquat','gobletsquat','squat','pausesquat','frontsquat'],
    up:'three sets of 10 at your working weight, form holding',down:'depth or position breaking down'},
  singleleg:{label:'Single-leg squat',steps:['staticsplitsquat','reverselunge','splitsquat','boxpistol','pistol'],
    up:'three sets of 10 each leg, balanced',down:'losing balance or knee caving in'},
  lunge:{label:'Lunge',steps:['stepup','reverselunge','lunge','deficitlunge'],
    up:'three sets of 10 each leg',down:'knee pain or losing balance'},
  hinge:{label:'Hip hinge',steps:['cablepullthrough','kbdeadlift','dbrdl','rdl','trapbardl','deadlift'],
    up:'three sets of 8 with a flat back',down:'your back rounding'},
  bridge:{label:'Hip thrust',steps:['glutebridge','singlelegbridge','hipthrust','singleleghipthrust'],
    up:'three sets of 15 with a pause at the top',down:'feeling it in the lower back instead of the glutes'},
  hamstring:{label:'Hamstring curl',steps:['seatedlegcurl','legcurl','slidercurl','nordic'],
    up:'three sets of 10 controlled',down:'hips dropping or cramping'},
  plank:{label:'Plank',steps:['kneeplank','plank','rkcplank','abwheel','bodysaw'],
    up:'three holds of 45 seconds, or 10 clean rollouts',down:'hips sagging or lower-back ache'},
  sideplank:{label:'Side plank',steps:['sidebend','sideplank','copenhagen'],
    up:'three holds of 30 seconds each side',down:'hips dropping'},
  hanging:{label:'Hanging core',steps:['reversecrunch','hangingkneeraise','hanginglegraise','toestobar'],
    up:'three sets of 10 without swinging',down:'swinging to finish reps'},
  dip:{label:'Dip',steps:['benchdip','assisteddip','dip','weighteddip'],
    up:'three sets of 10 to full depth',down:'shoulder discomfort at depth'},
  overhead:{label:'Overhead press',steps:['pikepushup','seateddbpress','ohp','pushpress','handstandpushup'],
    up:'three sets of 8 with a steady torso',down:'leaning back to finish reps'},
  row:{label:'Row',steps:['bandrow','invertedrow','ringrow','dbrow','bbrow','pendlayrow'],
    up:'three sets of 10 with a pause at the top',down:'jerking the weight up'},
  carry:{label:'Carry',steps:['farmercarry','suitcasecarry','rackcarry','overheadcarry'],
    up:'40 metres without stopping or leaning',down:'leaning, or grip giving out early'},
  jump:{label:'Jump',steps:['squatjump','broadjump','boxjump','depthjump'],
    up:'soft, quiet landings every rep',down:'landing stiff or knees caving in'},
  grip:{label:'Grip',steps:['deadhang','farmercarry','platepinch'],
    up:'a 60-second hang or 40-metre carry',down:'grip giving out before the target muscle'}
};
/* The muscles the new patterns load, in the muscle ontology with the names people know them by. */
MUSCLE_GROUPS.obliques='Obliques';MUSCLE_GROUPS.adductors='Inner thighs';MUSCLE_GROUPS.reardelts='Rear shoulders';MUSCLE_GROUPS.traps='Traps';
EXERCISES.forEach(function(e){var d=EXERCISE_DETAILS[e.id];if(d){e.level=e.level||d.level;e.cues=e.cues&&e.cues.length?e.cues:d.cues;}});
/* The hip thrust is hip extension, not a hinge. */
EXERCISES.forEach(function(e){if(e.id==='hipthrust')e.pattern='hip extension';});
EXERCISE_ADDITIONS.forEach(function(x){if(!EXERCISES.some(function(e){return e.id===x.id;}))EXERCISES.push(x);});
/* An alias that is now another exercise's own name is dropped from the older entry, so the next addition cannot put the
   collision back. */
(function(){var names={};EXERCISES.forEach(function(e){names[normExercise(e.name)]=e.id;});
  EXERCISES.forEach(function(e){e.aliases=(e.aliases||[]).filter(function(a){var o=names[normExercise(a)];return !o||o===e.id;});});})();
function ladderFor(exId){
  var out=[];Object.keys(PROGRESSION_LADDERS).forEach(function(k){var L=PROGRESSION_LADDERS[k],i=L.steps.indexOf(exId);
    if(i>=0)out.push({ladder:k,label:L.label,position:i+1,of:L.steps.length,
      easier:i>0?L.steps[i-1]:null,harder:i<L.steps.length-1?L.steps[i+1]:null,up:L.up,down:L.down});});
  return out;
}
function exerciseLibraryAudit(){
  var issues=[],ids={};
  EXERCISES.forEach(function(e){
    if(ids[e.id])issues.push('duplicate id '+e.id);ids[e.id]=1;
    if(!e.level)issues.push(e.id+': no level');
    if(!e.cues||!e.cues.length)issues.push(e.id+': no cues');
    (e.primary||[]).concat(e.secondary||[]).forEach(function(m){if(typeof ANATOMY!=='undefined'&&!ANATOMY[m])issues.push(e.id+': muscle "'+m+'" is not in the anatomy');});
  });
  Object.keys(PROGRESSION_LADDERS).forEach(function(k){PROGRESSION_LADDERS[k].steps.forEach(function(s){if(!ids[s])issues.push('ladder '+k+' names unknown exercise '+s);});});
  return {exercises:EXERCISES.length,ladders:Object.keys(PROGRESSION_LADDERS).length,issues:issues,ok:issues.length===0};
}

/* ONE PROGRESSION REGISTRY. The ladders merge into the existing PROGRESSIONS: an existing family keeps its own step ids
   (so recorded skill states still resolve), gains a link from each step to its library exercise, and takes the extra
   rungs in order; a ladder with no existing family becomes one. ladderFor() reads PROGRESSIONS only. */
var _LADDER_FAMILY={pushup:'push',pullup:'pull'};
(function(){
  var name=function(id){var e=EXERCISES.filter(function(x){return x.id===id;})[0];return e?e.name:id;};
  Object.keys(PROGRESSION_LADDERS).forEach(function(k){
    var L=PROGRESSION_LADDERS[k],fam=_LADDER_FAMILY[k]||k,old=PROGRESSIONS[fam];
    var oldByEx={};(old&&old.steps||[]).forEach(function(st){var e=resolveExercise(st.label);if(e)oldByEx[e.id]=st;});
    var steps=L.steps.map(function(id,i){var st=oldByEx[id]||{id:id,label:name(id),demand:{strength:i+1,skill:Math.max(1,Math.round((i+1)*0.8))}};st.exerciseId=id;return st;});
    (old&&old.steps||[]).forEach(function(st){if(!st.exerciseId)steps.push(st);});      /* keep rungs with no library exercise, e.g. one-arm progressions */
    var first=EXERCISES.filter(function(x){return x.id===L.steps[0];})[0];
    PROGRESSIONS[fam]={label:(old&&old.label)||L.label,pattern:(old&&old.pattern)||(first&&first.pattern)||null,steps:steps,up:L.up,down:L.down,source:old?'basic, extended':'library'};
  });
})();
ladderFor=function(exId){
  var out=[];Object.keys(PROGRESSIONS).forEach(function(k){var F=PROGRESSIONS[k];var linked=(F.steps||[]).filter(function(s){return s.exerciseId;});
    var i=linked.map(function(s){return s.exerciseId;}).indexOf(exId);
    if(i>=0)out.push({ladder:k,label:F.label,position:i+1,of:linked.length,easier:i>0?linked[i-1].exerciseId:null,harder:i<linked.length-1?linked[i+1].exerciseId:null,
      up:F.up||'the target reps with good form',down:F.down||'form breaking down'});});
  return out;
};

/* ---- THE EXERCISE CATALOGUE, COMPLETED (H2, D1 \u00a78) ----
   Every exercise described in full: plane and axis, joints, how it is loaded, stability, range of motion, setup,
   cautions, and its easier and harder versions. Derived from the movement pattern's mechanics, the equipment and the
   ladders rather than typed out 159 times, so one correction reaches every exercise it applies to. Cautions are general
   cautions, not medical advice. */
var PLANE_AXIS={sagittal:'side-to-side axis',frontal:'front-to-back axis',transverse:'vertical axis',oblique:'diagonal axis',none:'no movement (a hold)'};
var LOAD_MODES={barbell:'free weight',dumbbell:'free weight',kettlebell:'free weight',landmine:'free weight',trapbar:'free weight',plate:'free weight',medball:'free weight',
  cable:'cable',machine:'machine',smith:'machine',sled:'resisted push or drag',band:'elastic',bodyweight:'bodyweight',rings:'bodyweight (unstable)',bar:'bodyweight',wheel:'bodyweight',box:'bodyweight'};
var EXERCISE_CAUTIONS=[
  {id:'overhead',test:function(e,m){return e.pattern==='vertical push'||e.id==='overheadcarry'||e.id==='handstandpushup';},text:'shoulders that hurt when reaching overhead'},
  {id:'spinal',test:function(e,m){return (e.pattern==='hinge'||e.pattern==='squat')&&e.equipment.some(function(q){return /barbell|trapbar/.test(q);})||e.id==='goodmorning';},text:'acute low back pain \u2014 heavy spinal loading'},
  {id:'deepknee',test:function(e,m){return (e.pattern==='squat'||e.pattern==='lunge'||e.pattern==='knee extension')&&(m.rom==='deep'||m.rom==='full'||/pistol|sissy|deficit|bulgarian/.test(e.id));},text:'knees that hurt in deep bending'},
  /* Forearm planks and the body saw rest on the forearms, so they are not wrist-loading; they were listed at first. */
  {id:'wrist',test:function(e,m){return /pushup|frontsquat|dip|handstand|pike|abwheel/.test(e.id);},text:'wrists that hurt bearing weight'},
  {id:'impact',test:function(e,m){return e.pattern==='jump';},text:'joints that hurt on landing, or poor balance'},
  {id:'hanging',test:function(e,m){return /pullup|chinup|hang|toestobar|hanginglegraise|hangingkneeraise/.test(e.id);},text:'shoulders that hurt hanging from a bar'},
  {id:'rotation',test:function(e,m){return e.pattern==='rotation';},text:'back pain made worse by twisting'},
  {id:'grip',test:function(e,m){return e.pattern==='carry'||e.pattern==='grip';},text:'hand or elbow pain when gripping hard'}
];
function exerciseOntology(idOrName){
  var e=EXERCISES.filter(function(x){return x.id===idOrName;})[0]||resolveExercise(idOrName);
  if(!e)return {status:'unknown',note:'not in the exercise catalogue'};
  var m=PATTERN_MECHANICS[e.pattern]||{};
  var modes=[];e.equipment.forEach(function(q){var lm=LOAD_MODES[q];if(lm&&modes.indexOf(lm)<0)modes.push(lm);});
  if(!modes.length)modes.push('bodyweight');
  var stability=m.stability||'moderate';if(e.unilateral&&stability==='high')stability='moderate';else if(e.unilateral&&stability==='moderate')stability='low';
  if(e.equipment.indexOf('rings')>=0)stability='low';
  var lad=ladderFor(e.id)[0]||null,nm=function(id){var x=EXERCISES.filter(function(y){return y.id===id;})[0];return x?x.name:null;};
  return {status:'ok',cls:'PRIOR',id:e.id,name:e.name,pattern:e.pattern,
    plane:m.plane||'sagittal',axis:PLANE_AXIS[m.plane||'sagittal'],joints:(m.joints||[]).slice(),
    loadModes:modes,stability:stability,rom:e.isometric?'isometric':(m.rom||'moderate'),curve:m.curve||null,
    setup:(e.cues||[])[0]||null,cautions:EXERCISE_CAUTIONS.filter(function(c){return c.test(e,m);}).map(function(c){return c.text;}),
    progression:lad?{family:lad.label,step:lad.position,of:lad.of,easier:lad.easier?nm(lad.easier):null,harder:lad.harder?nm(lad.harder):null}:null,
    level:e.level,unilateral:!!e.unilateral,note:'General cautions, not medical advice.'};
}
function exerciseOntologyAudit(){
  var issues=[];EXERCISES.forEach(function(e){var o=exerciseOntology(e.id);
    ['plane','axis','loadModes','stability','rom','setup'].forEach(function(k){if(o[k]==null||(Array.isArray(o[k])&&!o[k].length))issues.push(e.id+': no '+k);});
    if(!o.joints||!o.joints.length)issues.push(e.id+': no joints');});
  return {ok:issues.length===0,issues:issues,exercises:EXERCISES.length};
}
