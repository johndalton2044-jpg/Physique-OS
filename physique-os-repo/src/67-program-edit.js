/* ============================================================================
   REGION: PROGRAM EDITING
   The built-in programs were constants: a fixed week, fixed exercises, fixed set and rep counts. That is
   wrong for the obvious reason — people train around the equipment they have, the days they can, and the
   injuries they are working with — and for a subtler one: a plan you cannot follow produces adherence data
   about the plan rather than about you.

   Editing follows the same rules as every other mutation here:
     * one primitive, so there is a single path and a single event;
     * a change is an EVENT, so a replay of last month shows the program as it stood then;
     * the built-in stays intact underneath, so "reset to the original" is always available;
     * a change never rewrites past sessions, which were performed under the old plan.
   ============================================================================ */
var DAY_KEYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
var DAY_KINDS={lift:'Lifting',cardio:'Cardio',walk:'Walk',rest:'Rest',mobility:'Mobility'};
function customPrograms(){return (DB.settings&&DB.settings.customPrograms)||{};}
function programIsCustom(key){return !!customPrograms()[key];}
function builtInProgram(key){return PROGRAMS[key]||null;}
/* Resolve a program definition: a user copy wins over the built-in of the same key. */
function programDef(key){
  var c=customPrograms()[key];
  if(c)return c;
  return PROGRAMS[key]||PROGRAMS.fullbody3;
}
function programList(){
  var out=[];
  Object.keys(PROGRAMS).forEach(function(k){
    out.push({key:k,label:programDef(k).label,custom:programIsCustom(k),builtIn:true});
  });
  Object.keys(customPrograms()).forEach(function(k){
    if(PROGRAMS[k])return;
    out.push({key:k,label:customPrograms()[k].label,custom:true,builtIn:false});
  });
  return out;
}
/* The single mutation primitive. Everything that edits a program goes through here. */
function saveProgramDef(key,def,opts){
  opts=opts||{};
  if(!key||!def)return null;
  if(!opts.noUndo)pushUndo('edit training plan');
  DB.settings.customPrograms=DB.settings.customPrograms||{};
  var before=DB.settings.customPrograms[key]?JSON.parse(JSON.stringify(DB.settings.customPrograms[key])):null;
  def.updatedAt=nowISO();
  def.basedOn=def.basedOn||(PROGRAMS[key]?key:null);
  DB.settings.customPrograms[key]=def;
  emitEvent('program.customized',{key:key,def:JSON.parse(JSON.stringify(def)),
    change:opts.change||'edited',from:before?'edited again':'first customised'});
  _memoInvalidate();
  if(!opts.noSave)save('program:edit');
  return def;
}
function editableCopy(key){
  var base=programDef(key);
  return JSON.parse(JSON.stringify({label:base.label,days:base.days,templates:base.templates,
    rir:base.rir,why:base.why,acsm:base.acsm||null,basedOn:PROGRAMS[key]?key:(base.basedOn||null)}));
}
function resetProgram(key){
  if(!PROGRAMS[key])return false;
  if(!DB.settings.customPrograms||!DB.settings.customPrograms[key])return false;
  pushUndo('reset training plan');
  delete DB.settings.customPrograms[key];
  emitEvent('program.customized',{key:key,def:null,change:'reset to the built-in plan'});
  _memoInvalidate();save('program:reset');
  return true;
}
/* ---- schedule ---- */
function setProgramDay(key,day,patch){
  if(DAY_KEYS.indexOf(day)<0)return null;
  var def=editableCopy(key);
  def.days=def.days||{};
  if(patch===null){delete def.days[day];}
  else{
    var d=def.days[day]||{};
    Object.keys(patch).forEach(function(k){d[k]=patch[k];});
    if(d.kind==='rest'){delete def.days[day];}
    else def.days[day]=d;
  }
  return saveProgramDef(key,def,{change:'schedule: '+day});
}
function moveProgramDay(key,from,to){
  if(DAY_KEYS.indexOf(from)<0||DAY_KEYS.indexOf(to)<0)return null;
  var def=editableCopy(key);
  if(!def.days[from])return null;
  var moving=def.days[from];
  var displaced=def.days[to]||null;
  def.days[to]=moving;
  if(displaced)def.days[from]=displaced;else delete def.days[from];
  return saveProgramDef(key,def,{change:'moved '+from+' to '+to});
}
/* ---- exercises within a session template ---- */
function templateRows(key,template){
  var def=programDef(key);
  return ((def.templates||{})[template]||[]).map(function(r,i){
    return {index:i,exercise:r[0],sets:r[1],reps:r[2]};
  });
}
function setTemplateRow(key,template,index,patch){
  var def=editableCopy(key);
  var rows=(def.templates&&def.templates[template])||null;
  if(!rows||index<0||index>=rows.length)return null;
  var r=rows[index];
  if(patch===null)rows.splice(index,1);
  else{
    if(patch.exercise!=null)r[0]=String(patch.exercise).slice(0,60);
    if(patch.sets!=null)r[1]=Math.max(1,Math.min(10,Math.round(num(patch.sets)||r[1])));
    if(patch.reps!=null)r[2]=String(patch.reps).slice(0,12);
  }
  return saveProgramDef(key,def,{change:'exercise in '+template});
}
function addTemplateRow(key,template,exercise,sets,reps){
  var def=editableCopy(key);
  def.templates=def.templates||{};
  def.templates[template]=def.templates[template]||[];
  if(def.templates[template].length>=12)return null;
  def.templates[template].push([String(exercise||'New exercise').slice(0,60),
    Math.max(1,Math.min(10,Math.round(num(sets)||3))),String(reps||'8\u201312').slice(0,12)]);
  return saveProgramDef(key,def,{change:'added an exercise to '+template});
}
function moveTemplateRow(key,template,index,delta){
  var def=editableCopy(key);
  var rows=(def.templates&&def.templates[template])||null;
  if(!rows)return null;
  var to=index+delta;
  if(to<0||to>=rows.length)return null;
  var tmp=rows[index];rows[index]=rows[to];rows[to]=tmp;
  return saveProgramDef(key,def,{change:'reordered '+template});
}
/* ---- equipment and situation ----
   Swapping by hand is fine for one exercise. Adapting a whole plan to a hotel gym is not, so the same
   substitution ontology the exercise search uses is applied across every template at once. Anything without
   a known substitute is reported rather than silently dropped: a plan quietly missing its only pulling
   movement is worse than a plan that says it could not find one. */
/* A pull-up bar is required alongside whatever else is listed, not an alternative to it: as an implement, bodyweight
   alone satisfied the pull-up and a band alone the band-assisted pull-up, so either could be prescribed with no bar. */
var EQUIP_ACCESSORY={bench:1,rack:1,box:1,platform:1,bar:1};
function equipPossible(equip,have){
  if(!equip||!equip.length)return true;
  var implements_=equip.filter(function(q){return !EQUIP_ACCESSORY[q];});
  var accessories=equip.filter(function(q){return EQUIP_ACCESSORY[q];});
  var hasImplement=!implements_.length||implements_.some(function(q){return have.indexOf(q)>=0;});
  var hasAccessories=accessories.every(function(q){return have.indexOf(q)>=0;});
  return hasImplement&&hasAccessories;
}
var SITUATIONS={
  home_minimal:{label:'Home, minimal kit',have:['bodyweight','dumbbell','band']},
  hotel:{label:'Hotel gym',have:['bodyweight','dumbbell','machine','cable','bench']},
  barbell_only:{label:'Barbell only',have:['barbell','bodyweight','rack','bench']},
  full_gym:{label:'Full gym',have:['barbell','dumbbell','machine','cable','bodyweight','band','bench','rack']}
};
function adaptProgramTo(key,situationId,opts){
  opts=opts||{};
  var sit=SITUATIONS[situationId];
  if(!sit)return {ok:false,reason:'unknown situation'};
  var def=editableCopy(key);
  var swaps=[],unmatched=[];
  Object.keys(def.templates||{}).forEach(function(t){
    def.templates[t].forEach(function(row,i){
      var name=row[0];
      var ex=null;try{ex=resolveExercise(name);}catch(e){_q(e,'P3');}
      if(!ex)return;                                        // not in the ontology: leave it alone
      /* equipment is a LIST of what an exercise can be done with, so it is possible when ANY of its
         options is available — not when some single value matches. */
      var equip=Array.isArray(ex.equipment)?ex.equipment:(ex.equipment?[ex.equipment]:[]);
      /* The ontology's equipment list mixes two different things: IMPLEMENTS, which are alternatives (a
         lateral raise takes dumbbells or a cable), and ACCESSORIES, which are requirements (a barbell bench
         press needs a bench as well as the bar). Treating the whole list as alternatives calls a bench press
         possible in a room with only a bench; treating it as requirements rejects a lateral raise that only
         ever needed one of the two. So they are separated. */
      var possible=equipPossible(equip,sit.have);
      if(possible||!equip.length)return;
      var alt=null;
      try{
        /* substitutesFor returns {exercise, why} wrappers, already filtered by the equipment passed in. */
        var cand=(substitutesFor(name,sit.have)||[]).map(function(s){return s&&s.exercise?s.exercise:s;})
          .filter(function(se){
            if(!se||!se.name)return false;
            var q=Array.isArray(se.equipment)?se.equipment:(se.equipment?[se.equipment]:[]);
            return q.length&&equipPossible(q,sit.have);
          });
        alt=cand[0]||null;
      }catch(e){_q(e,'P3');}
      if(alt){var newName=alt.name||alt;swaps.push({template:t,from:name,to:newName});row[0]=newName;}
      else unmatched.push({template:t,exercise:name,
        needs:equip.filter(function(q){return !EQUIP_ACCESSORY[q];}).join(' or ')+
          (equip.some(function(q){return EQUIP_ACCESSORY[q];})?(' plus '+equip.filter(function(q){return EQUIP_ACCESSORY[q];}).join(' and ')):'')});
    });
  });
  if(opts.dryRun)return {ok:true,dryRun:true,situation:sit.label,swaps:swaps,unmatched:unmatched,
    note:swaps.length?(swaps.length+' exercise(s) would be swapped'):'nothing needs changing for that setup'};
  if(swaps.length)saveProgramDef(key,def,{change:'adapted to '+sit.label});
  return {ok:true,situation:sit.label,swaps:swaps,unmatched:unmatched,
    note:(swaps.length?(swaps.length+' exercise(s) swapped'):'nothing needed changing')+
      (unmatched.length?('; '+unmatched.length+' had no substitute available with that equipment and were left as they are'):'')};
}
function programDiff(key){
  var base=PROGRAMS[key];var cur=customPrograms()[key];
  if(!base||!cur)return null;
  var out=[];
  DAY_KEYS.forEach(function(d){
    var a=base.days[d],b=cur.days[d];
    if(!a&&!b)return;
    if(!a&&b)out.push({kind:'day',text:d+': added '+(b.label||b.kind)});
    else if(a&&!b)out.push({kind:'day',text:d+': now a rest day (was '+(a.label||a.kind)+')'});
    else if(a.label!==b.label||a.kind!==b.kind||a.template!==b.template)
      out.push({kind:'day',text:d+': '+(a.label||a.kind)+' \u2192 '+(b.label||b.kind)});
  });
  Object.keys(base.templates||{}).forEach(function(t){
    var A=base.templates[t]||[],B=(cur.templates||{})[t]||[];
    var n=Math.max(A.length,B.length);
    for(var i=0;i<n;i++){
      var a=A[i],b=B[i];
      if(a&&!b)out.push({kind:'exercise',text:t+': removed '+a[0]});
      else if(!a&&b)out.push({kind:'exercise',text:t+': added '+b[0]});
      else if(a&&b&&(a[0]!==b[0]||a[1]!==b[1]||a[2]!==b[2]))
        out.push({kind:'exercise',text:t+': '+a[0]+' '+a[1]+'\u00d7'+a[2]+' \u2192 '+b[0]+' '+b[1]+'\u00d7'+b[2]});
    }
  });
  return {key:key,changes:out,basedOn:cur.basedOn||key,updatedAt:cur.updatedAt,
    note:out.length?'Changes from the built-in plan. Past sessions were performed under whichever version was in force then and are not rewritten.':'identical to the built-in plan'};
}

/* ---- PROGRAMME VERSIONS (H2) ----
   What the programme was on any date, what changed and why, and what was done under each version. Switches come from
   settings.programHistory and edits from the program.customized events \u2014 the same sources the replay already uses to
   show the programme as it stood on a past day. */
function programVersions(){
  var out=[];
  (DB.settings.programHistory||[]).forEach(function(h){
    out.push({at:String(h.at),key:h.program,kind:'switched',change:'Switched to '+((PROGRAMS[h.program]||customPrograms()[h.program]||{}).label||h.program)+(h.from?' from '+((PROGRAMS[h.from]||{}).label||h.from):''),source:h.source||null});});
  (typeof _EVENTS!=='undefined'?_EVENTS:[]).forEach(function(e){if(e.type!=='program.customized')return;
    out.push({at:String(e.at),key:e.data.key,kind:e.data.def===null?'reset':'edited',change:e.data.def===null?'Reset to the built-in plan':('Edited: '+(e.data.change||'changes')),source:'you'});});
  out.sort(function(a,b){return a.at<b.at?-1:1;});
  var sessions=(DB.sessions||[]).filter(function(s){return !s.retracted&&!s.supersededBy;});
  out.forEach(function(v,i){v.version=i+1;v.from=v.at.slice(0,10);v.to=i<out.length-1?out[i+1].at.slice(0,10):null;
    var under=sessions.filter(function(s){return s.date>=v.from&&(!v.to||s.date<v.to);});
    v.sessions=under.length;v.sets=under.reduce(function(a,s){return a+(s.sets||[]).length;},0);
    v.label=((PROGRAMS[v.key]||customPrograms()[v.key]||{}).label||v.key);});
  return out;
}
function programAt(date){var V=programVersions().filter(function(v){return v.from<=date;});return V.length?V[V.length-1]:null;}
