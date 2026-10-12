/* ============================================================================
   REGION: EXERCISE ONTOLOGY — structured exercises → patterns → muscles, with a substitution graph.
   Reference knowledge (REFERENCE class); the user's sessions are the observations.
   ============================================================================ */
var MUSCLE_GROUPS={chest:'Chest',back:'Back',lats:'Lats',upperback:'Upper back',delts:'Shoulders',sidedelts:'Side delts',biceps:'Biceps',triceps:'Triceps',quads:'Quads',hamstrings:'Hamstrings',glutes:'Glutes',calves:'Calves',abs:'Abdominals',erectors:'Spinal erectors',forearms:'Forearms'};
var EXERCISES=[
  {id:'squat',name:'Squat',aliases:['back squat','barbell squat','squat or leg press'],pattern:'squat',primary:['quads','glutes'],secondary:['hamstrings','erectors','abs'],equipment:['barbell','rack'],compound:true,fatigue:'high',skill:'moderate'},
  {id:'legpress',name:'Leg press',aliases:['leg press'],pattern:'squat',primary:['quads','glutes'],secondary:['hamstrings'],equipment:['machine'],compound:true,fatigue:'moderate',skill:'low'},
  {id:'hacksquat',name:'Hack squat',aliases:[],pattern:'squat',primary:['quads'],secondary:['glutes'],equipment:['machine'],compound:true,fatigue:'moderate',skill:'low'},
  {id:'gobletsquat',name:'Goblet squat',aliases:[],pattern:'squat',primary:['quads','glutes'],secondary:['abs'],equipment:['dumbbell'],compound:true,fatigue:'moderate',skill:'low'},
  {id:'splitsquat',name:'Bulgarian split squat',aliases:['split squat','rear-foot elevated split squat'],pattern:'lunge',primary:['quads','glutes'],secondary:['hamstrings'],equipment:['dumbbell','bench'],compound:true,unilateral:true,fatigue:'moderate',skill:'moderate'},
  {id:'lunge',name:'Walking lunge',aliases:['lunge'],pattern:'lunge',primary:['quads','glutes'],secondary:['hamstrings'],equipment:['dumbbell','bodyweight'],compound:true,unilateral:true,fatigue:'moderate',skill:'low'},
  {id:'rdl',name:'Romanian deadlift',aliases:['rdl','romanian dl'],pattern:'hinge',primary:['hamstrings','glutes'],secondary:['erectors','forearms'],equipment:['barbell','dumbbell'],compound:true,fatigue:'moderate',skill:'moderate'},
  {id:'deadlift',name:'Deadlift',aliases:['conventional deadlift','deadlift variation','trap bar deadlift'],pattern:'hinge',primary:['glutes','hamstrings','erectors'],secondary:['quads','upperback','forearms'],equipment:['barbell'],compound:true,fatigue:'high',skill:'high'},
  {id:'hipthrust',name:'Hip thrust',aliases:['barbell hip thrust','glute bridge'],pattern:'hinge',primary:['glutes'],secondary:['hamstrings'],equipment:['barbell','bench'],compound:true,fatigue:'low',skill:'low'},
  {id:'legcurl',name:'Leg curl',aliases:['lying leg curl','seated leg curl','hamstring curl'],pattern:'knee flexion',primary:['hamstrings'],secondary:[],equipment:['machine'],compound:false,fatigue:'low',skill:'low'},
  {id:'legext',name:'Leg extension',aliases:['leg extensions'],pattern:'knee extension',primary:['quads'],secondary:[],equipment:['machine'],compound:false,fatigue:'low',skill:'low'},
  {id:'calf',name:'Calf raise',aliases:['standing calf raise','seated calf raise','calf raises'],pattern:'plantar flexion',primary:['calves'],secondary:[],equipment:['machine','bodyweight'],compound:false,fatigue:'low',skill:'low'},
  {id:'bench',name:'Bench press',aliases:['barbell bench','flat bench','bench press or machine press','bench'],pattern:'horizontal push',primary:['chest'],secondary:['delts','triceps'],equipment:['barbell','bench'],compound:true,fatigue:'moderate',skill:'moderate'},
  {id:'dbbench',name:'Dumbbell bench press',aliases:['db bench','dumbbell press','db press'],pattern:'horizontal push',primary:['chest'],secondary:['delts','triceps'],equipment:['dumbbell','bench'],compound:true,fatigue:'moderate',skill:'low'},
  {id:'inclinedb',name:'Incline DB press',aliases:['incline dumbbell press','incline press','incline bench'],pattern:'incline push',primary:['chest','delts'],secondary:['triceps'],equipment:['dumbbell','bench'],compound:true,fatigue:'moderate',skill:'low'},
  {id:'machinepress',name:'Machine chest press',aliases:['chest press','machine or db chest press','machine press'],pattern:'horizontal push',primary:['chest'],secondary:['delts','triceps'],equipment:['machine'],compound:true,fatigue:'low',skill:'low'},
  {id:'cablepress',name:'Cable press',aliases:['cable chest press','cable fly','cable flye'],pattern:'horizontal push',primary:['chest'],secondary:['delts'],equipment:['cable'],compound:true,fatigue:'low',skill:'low'},
  {id:'pushup',name:'Push-up',aliases:['pushup','push ups'],pattern:'horizontal push',primary:['chest'],secondary:['delts','triceps','abs'],equipment:['bodyweight'],compound:true,fatigue:'low',skill:'low'},
  {id:'ohp',name:'Overhead press',aliases:['shoulder press','military press','barbell press','db shoulder press'],pattern:'vertical push',primary:['delts'],secondary:['triceps','upperback'],equipment:['barbell','dumbbell'],compound:true,fatigue:'moderate',skill:'moderate'},
  {id:'latraise',name:'Lateral raise',aliases:['side raise','db lateral raise','lateral raises'],pattern:'abduction',primary:['sidedelts'],secondary:[],equipment:['dumbbell','cable'],compound:false,fatigue:'low',skill:'low'},
  {id:'pulldown',name:'Lat pulldown',aliases:['pulldown','lat pull down','pull-up or lat pulldown'],pattern:'vertical pull',primary:['lats'],secondary:['biceps','upperback'],equipment:['cable'],compound:true,fatigue:'low',skill:'low'},
  {id:'pullup',name:'Pull-up',aliases:['pullup','chin-up','chin up','pull ups'],pattern:'vertical pull',primary:['lats'],secondary:['biceps','upperback'],equipment:['bodyweight','bar'],compound:true,fatigue:'moderate',skill:'moderate'},
  {id:'cablerow',name:'Seated cable row',aliases:['cable row','seated row','row'],pattern:'horizontal pull',primary:['upperback','lats'],secondary:['biceps'],equipment:['cable'],compound:true,fatigue:'low',skill:'low'},
  {id:'dbrow',name:'Dumbbell row',aliases:['db row','one-arm row','single arm row'],pattern:'horizontal pull',primary:['lats','upperback'],secondary:['biceps'],equipment:['dumbbell','bench'],compound:true,unilateral:true,fatigue:'low',skill:'low'},
  {id:'bbrow',name:'Barbell row',aliases:['bent over row','pendlay row'],pattern:'horizontal pull',primary:['upperback','lats'],secondary:['biceps','erectors'],equipment:['barbell'],compound:true,fatigue:'moderate',skill:'moderate'},
  {id:'machinerow',name:'Machine row',aliases:['chest supported row','t-bar row'],pattern:'horizontal pull',primary:['upperback','lats'],secondary:['biceps'],equipment:['machine'],compound:true,fatigue:'low',skill:'low'},
  {id:'facepull',name:'Face pull',aliases:['rear delt fly','reverse fly'],pattern:'horizontal pull',primary:['upperback','delts'],secondary:[],equipment:['cable'],compound:false,fatigue:'low',skill:'low'},
  {id:'curl',name:'Biceps curl',aliases:['curl','cable curl','db curl','dumbbell curl','barbell curl','hammer curl'],pattern:'elbow flexion',primary:['biceps'],secondary:['forearms'],equipment:['dumbbell','cable','barbell'],compound:false,fatigue:'low',skill:'low'},
  {id:'pressdown',name:'Triceps pressdown',aliases:['tricep pushdown','pushdown','rope pressdown','triceps extension','tricep extension','overhead extension','skullcrusher'],pattern:'elbow extension',primary:['triceps'],secondary:[],equipment:['cable','dumbbell'],compound:false,fatigue:'low',skill:'low'},
  {id:'dip',name:'Dip',aliases:['dips'],pattern:'vertical push',primary:['chest','triceps'],secondary:['delts'],equipment:['bodyweight'],compound:true,fatigue:'moderate',skill:'moderate'},
  {id:'abs',name:'Abdominal movement',aliases:['abs','crunch','cable crunch','plank','leg raise','hanging leg raise','ab wheel'],pattern:'trunk flexion',primary:['abs'],secondary:[],equipment:['bodyweight','cable'],compound:false,fatigue:'low',skill:'low'},
  {id:'backext',name:'Back extension',aliases:['hyperextension','45 degree back extension'],pattern:'hinge',primary:['erectors','glutes'],secondary:['hamstrings'],equipment:['bench'],compound:false,fatigue:'low',skill:'low'},
  {id:'shrug',name:'Shrug',aliases:['db shrug','barbell shrug'],pattern:'scapular elevation',primary:['upperback'],secondary:['forearms'],equipment:['dumbbell','barbell'],compound:false,fatigue:'low',skill:'low'}
];
/* An exact name wins over an alias. When the library held 33 entries, the originals carried catch-all aliases for
   their variants ("plank" on Abdominal movement, "chin-up" on Pull-up); once each variant became its own exercise, a
   name-or-alias search returned whichever came first, and 14 exercises resolved to an older one — a logged plank
   counted as abdominal work, a chin-up as a pull-up. */
function resolveExercise(name){var k=normExercise(name);if(!k)return null;
  var exact=EXERCISES.filter(function(e){return normExercise(e.name)===k||normExercise(e.id)===k;})[0];if(exact)return exact;
  var direct=EXERCISES.filter(function(e){return e.aliases.some(function(a){return normExercise(a)===k;});})[0];if(direct)return direct;var fuzzy=EXERCISES.filter(function(e){return k.indexOf(normExercise(e.name))>=0||e.aliases.some(function(a){return k.indexOf(normExercise(a))>=0||normExercise(a).indexOf(k)>=0;});})[0];return fuzzy||null;}
function substitutesFor(name,equipment){var e=resolveExercise(name);if(!e)return [];return EXERCISES.filter(function(x){if(x.id===e.id)return false;var sharePattern=x.pattern===e.pattern;var shareMuscle=x.primary.some(function(m){return e.primary.indexOf(m)>=0;});if(!sharePattern&&!shareMuscle)return false;if(equipment&&equipment.length&&!x.equipment.some(function(q){return equipment.indexOf(q)>=0;}))return false;return true;}).map(function(x){return {exercise:x,why:(x.pattern===e.pattern?'same movement pattern':'same primary muscle')+' \u00b7 '+x.equipment.join('/')+' \u00b7 fatigue '+x.fatigue};}).sort(function(a,b){return (a.exercise.pattern===e.pattern?0:1)-(b.exercise.pattern===e.pattern?0:1);}).slice(0,5);}
/* W-015: WHAT TO START A SUBSTITUTE AT. Two exercises for the same muscles are not the same load: no ratio between them
   is validated, so none is invented. The person's own record of the substitute decides (its last top set, a little
   lighter after a long gap); without one, the advice is a load with reps in reserve, lighter still when the substitute
   is more technical than the lift it replaces. */
var SUBSTITUTION_CONTRACT={id:'substitution_start',subject:'a substitute exercise',predicate:'is started at',
  parameters:{gapWeeks:{value:8,unit:'weeks',meaning:'after this long without the exercise, start below its last load'},
    gapFactor:{value:0.9,unit:'fraction of the last top set',meaning:'the load to start at after a gap'},
    reserve:{value:3,unit:'reps in reserve',meaning:'with no record of the exercise, a first load you could lift at least this many more reps with'}},
  statement:function(v){return 'a substitute starts at your own last top set ('+Math.round(v.gapFactor*100)+'% of it after '+v.gapWeeks+' weeks away), or, with no record, at '+v.reserve+'+ reps in reserve';},
  rationale:'loads do not carry between exercises by any validated ratio; the person’s own record of the substitute is the only figure that does',
  evidenceBasis:[],parameterSource:'chosen by this system',parameterVersion:'1.0',calibrationStatus:'not calibrated',validationStatus:HEURISTIC_NOT_VALIDATED,
  applicability:{phases:['any'],population:'adults lifting with logged loads'},failureConditions:['a different variation logged under the same name'],outcomes:['a safe first session on the substitute']};
var SKILL_RANK={low:0,moderate:1,high:2};
function substitutionStart(fromName,toName){var P=SUBSTITUTION_CONTRACT.parameters,from=resolveExercise(fromName),to=resolveExercise(toName);
  if(!to)return {status:'unknown',text:'not in the exercise library'};
  var last=null;sessionsOf({from:addDays(asOf(),-180)}).forEach(function(se){(se.sets||[]).forEach(function(x){var e=resolveExercise(x.exercise);if(!e||e.id!==to.id||x.load==null||x.reps==null)return;
    if(!last||se.date>last.date||(se.date===last.date&&x.load>last.load))last={date:se.date,load:+x.load,reps:+x.reps,rir:x.rir!=null?+x.rir:null};});});
  var harder=from&&SKILL_RANK[to.skill]>SKILL_RANK[from.skill];
  if(!last)return {status:'new',exercise:to.name,policy:SUBSTITUTION_CONTRACT.id,harder:!!harder,
    text:'no '+to.name.toLowerCase()+' in the last six months: start with a load you could lift '+P.reserve.value+' or more reps more with, and build from that session'+(harder?'; it is more technical than '+from.name.toLowerCase()+', so start lighter still':'')};
  var weeks=Math.floor(daysBetween(last.date,asOf())/7),gap=weeks>=P.gapWeeks.value,load=gap?Math.round(last.load*P.gapFactor.value/2.5)*2.5:last.load;
  return {status:'own',exercise:to.name,policy:SUBSTITUTION_CONTRACT.id,last:last,weeksAgo:weeks,start:{load:load,reps:last.reps},
    text:'your last '+to.name.toLowerCase()+' was '+fmtNum(last.load,1)+' × '+last.reps+' on '+shortDate(last.date)+(gap?': after '+weeks+' weeks, start at about '+fmtNum(load,1)+' × '+last.reps:': start there')};}
function weeklyMuscleSets(days){days=days||7;var sess=sessionsOf({from:addDays(asOf(),-(days-1))});var out={};sess.forEach(function(s){(s.sets||[]).forEach(function(x){var e=resolveExercise(x.exercise);if(!e)return;e.primary.forEach(function(m){out[m]=(out[m]||0)+1;});e.secondary.forEach(function(m){out[m]=(out[m]||0)+0.5;});});});return Object.keys(out).map(function(m){return {muscle:MUSCLE_GROUPS[m]||m,sets:round(out[m],1)};}).sort(function(a,b){return b.sets-a.sets;});}
function movementCoverage(days){var sess=sessionsOf({from:addDays(asOf(),-(days||7)+1)});var pats={};sess.forEach(function(s){(s.sets||[]).forEach(function(x){var e=resolveExercise(x.exercise);if(e)pats[e.pattern]=(pats[e.pattern]||0)+1;});});var core=['squat','hinge','horizontal push','vertical push','horizontal pull','vertical pull'];return core.map(function(p){return {pattern:p,sets:pats[p]||0,covered:!!pats[p]};});}
/* ---- supplements: decision tree, not a stack ---- */
function supplementGuidance(){
  var S=getCurrentState();var out=[];var pr=S.adherence.protein;
  out.push({name:'Creatine monohydrate',tier:'high-evidence',role:'performance aid',advice:'3\u20135 g/day, every day, no cycling. Reason: training capacity \u2192 strength \u2192 lean-mass retention. Not a fat burner. Expect a small water-weight rise the model will treat as noise.',source:'NIH ODS 2024; ISSN 2017'});
  out.push({name:'Protein powder',tier:pr&&pr.pct<80?'useful now':'only if needed',role:'nutritional gap',advice:pr?(pr.pct<80?('protein reached target on '+pr.pct+'% of days (avg '+fmtG(pr.mean,0)+' vs '+fmtG(pr.target,0)+'): a scoop closes the gap on short days'):'food is meeting the target on '+pr.pct+'% of days; no supplement needed'):'log protein for a week to see whether a gap exists',source:'AND/DoC/ACSM 2016; ISSN 2017'});
  var caf=S.recovery.sleep&&S.recovery.sleep.mean<S.recovery.target-0.5;
  out.push({name:'Caffeine',tier:'conditional',role:'performance aid',advice:'Optional 100\u2013200 mg 15\u201360 min before training. '+(caf?'Sleep is below target: move caffeine earlier or skip it; sleep loss costs more than caffeine gives.':'Keep it early enough not to touch sleep.'),source:'NIH ODS 2024; ISSN 2010'});
  out.push({name:'Vitamin D',tier:'medical',role:'nutritional/clinical',advice:'Only on a measured deficiency with clinician guidance. Not a fat-loss agent.',source:'NIH ODS 2024'});
  out.push({name:'Omega-3',tier:'conditional',role:'nutritional',advice:'Prefer two servings of fatty fish per week; supplement only if fish intake is inadequate. Not a fat-loss agent.',source:'AHA guidance; NIH ODS'});
  out.push({name:'Fat burners, BCAA/EAA, testosterone boosters, detoxes',tier:'avoid',role:'fat-loss claim',advice:'Not part of this system. Little evidence, adulteration risk, and they do not solve energy balance or adherence.',source:'NIH ODS 2024'});
  return out;
}
