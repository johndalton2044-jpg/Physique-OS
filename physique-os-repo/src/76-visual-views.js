/* ============================================================================
   MOVEMENT DRAWINGS, AUDITED (usage review: "many are difficult to discern")
   Looking at every figure found four causes: start and end frames were overlaid; movements to the side (the frontal
   plane) were drawn side-on, so the moving arm or leg sat on the torso line and vanished (lateral raise, shrug, hip
   adduction, external rotation, side plank, tree, warrior II); one figure served every exercise in a pattern, so a bench
   press was drawn standing and a pull-up and a pulldown were identical; and crow and pigeon were drawn wrongly.
   Now: start and end are side by side at one scale; a front-view figure with both arms and both legs is chosen from the
   pattern's declared plane; each exercise carries its body orientation (lying, face down, inclined, seated, hanging);
   crow and pigeon are redrawn; and movementVisualAudit() checks every figure.
   ============================================================================ */
var FRONT_JOINTS=['head','neck','shL','shR','elL','elR','wrL','wrR','pelvis','hipL','hipR','knL','knR','anL','anR'];
var FRONT_SEGMENTS=[['head','neck'],['neck','shL'],['neck','shR'],['shL','elL'],['elL','wrL'],['shR','elR'],['elR','wrR'],['neck','pelvis'],
  ['pelvis','hipL'],['pelvis','hipR'],['hipL','knL'],['knL','anL'],['hipR','knR'],['knR','anR']];
var FRONT_BASE={head:[0,0.93],neck:[0,0.86],shL:[-0.12,0.8],shR:[0.12,0.8],elL:[-0.14,0.64],elR:[0.14,0.64],wrL:[-0.15,0.5],wrR:[0.15,0.5],
  pelvis:[0,0.54],hipL:[-0.07,0.52],hipR:[0.07,0.52],knL:[-0.075,0.28],knR:[0.075,0.28],anL:[-0.08,0.04],anR:[0.08,0.04]};
function _fb(over){var o={};Object.keys(FRONT_BASE).forEach(function(k){o[k]=(over&&over[k])||FRONT_BASE[k].slice();});return o;}
function _rot(pos,centre,deg){var r=deg*Math.PI/180,c=Math.cos(r),s=Math.sin(r),o={};Object.keys(pos).forEach(function(k){var x=pos[k][0]-centre[0],y=pos[k][1]-centre[1];o[k]=[round(centre[0]+x*c-y*s,3),round(centre[1]+x*s+y*c,3)];});return o;}
var _sidePlank=(function(){var p=_rot(_fb(),[0,0.04],-70);var sh=p.shL;p.elL=[sh[0],0.04];p.wrL=[sh[0]+0.16,0.04];p.elR=[p.shR[0]+0.02,p.shR[1]+0.12];p.wrR=[p.shR[0]+0.04,p.shR[1]+0.26];return p;})();
var FRONT_FRAMES={
  'abduction':{start:_fb(),end:_fb({elL:[-0.28,0.8],wrL:[-0.44,0.8],elR:[0.28,0.8],wrR:[0.44,0.8]}),caption:'arms rise out to the sides'},
  'hip adduction':{start:_fb({knL:[-0.15,0.29],anL:[-0.24,0.05],knR:[0.15,0.29],anR:[0.24,0.05]}),end:_fb(),caption:'legs draw together against resistance'},
  'scapular elevation':{start:_fb(),end:_fb({shL:[-0.12,0.87],shR:[0.12,0.87],elL:[-0.14,0.71],elR:[0.14,0.71],wrL:[-0.15,0.57],wrR:[0.15,0.57]}),caption:'shoulders rise towards the ears (the rise is drawn larger than life so it can be seen)'},
  'external rotation':{start:_fb({elL:[-0.14,0.64],wrL:[-0.03,0.66],elR:[0.14,0.64],wrR:[0.03,0.66]}),end:_fb({elL:[-0.14,0.64],wrL:[-0.32,0.66],elR:[0.14,0.64],wrR:[0.32,0.66]}),caption:'elbows stay at the sides; forearms swing outwards'},
  'anti-lateral flexion':{start:_sidePlank,end:_sidePlank,hold:true,caption:'a side plank: the body stays straight, hips up'},
  /* Overhead pressing and pulling move in the frontal plane: side-on, the arm sat in front of the head and torso. */
  'vertical push':{start:_fb({elL:[-0.24,0.74],wrL:[-0.2,0.88],elR:[0.24,0.74],wrR:[0.2,0.88]}),end:_fb({elL:[-0.2,1.0],wrL:[-0.16,1.16],elR:[0.2,1.0],wrR:[0.16,1.16]}),caption:'hands press from the shoulders to overhead'},
  'vertical pull':{start:_fb({elL:[-0.24,1.0],wrL:[-0.3,1.16],elR:[0.24,1.0],wrR:[0.3,1.16]}),end:_fb({elL:[-0.24,0.7],wrL:[-0.2,0.86],elR:[0.24,0.7],wrR:[0.2,0.86]}),caption:'hands pull from overhead down to the shoulders'}
};
var FRONT_POSES={
  'tree':{positions:_fb({knL:[-0.24,0.36],anL:[-0.02,0.36],elL:[-0.09,0.99],wrL:[-0.01,1.08],elR:[0.09,0.99],wrR:[0.01,1.08]}),caption:'standing on one leg; the other foot on the inner thigh, knee out'},
  'warrior-2':{positions:(function(){var p=_fb();Object.keys(p).forEach(function(k){if(!/^an|^kn/.test(k))p[k]=[p[k][0],p[k][1]-0.1];});
    p.anL=[-0.36,0.04];p.knL=[-0.33,0.24];p.anR=[0.36,0.04];p.knR=[0.22,0.22];p.elL=[-0.3,0.7];p.wrL=[-0.46,0.7];p.elR=[0.3,0.7];p.wrR=[0.46,0.7];return p;})(),
    caption:'a wide stance, front knee bent over the ankle, arms level'}
};
/* Side-view poses that were drawn wrongly. */
var POSE_FIXES={
  'crow':{positions:{toe:[0.07,0.2],ankle:[0.12,0.16],knee:[0.3,0.22],hip:[0.1,0.4],lumbar:[0.18,0.38],thoracic:[0.3,0.34],shoulder:[0.42,0.3],cervical:[0.48,0.33],head:[0.55,0.32],elbow:[0.33,0.18],wrist:[0.35,0]},
    caption:'hands on the floor, knees resting on the upper arms, feet lifted'},
  'pigeon':{positions:{toe:[-0.62,0],ankle:[-0.56,0.02],knee:[-0.28,0.03],hip:[0,0.18],lumbar:[0,0.28],thoracic:[0,0.42],shoulder:[0.01,0.5],cervical:[0.01,0.57],head:[0.02,0.64],elbow:[0.06,0.26],wrist:[0.1,0.02]},
    caption:'the back leg extended behind; the front leg is folded underneath, out of sight from this side'}
};
/* Body orientation per exercise, from its name: most exercises in a pattern share one figure, but not one posture. */
/* Anticlockwise rotation turns the front of a right-facing figure upward: lying on your back is +90, face down −90. The
   first version had every sign reversed — a bench press pushing into the floor and a push-up pushing at the ceiling — and
   the audit now checks the direction of the push. */
var ORIENTATION_RULES=[
  {id:'incline',test:/incline/i,rotate:45,label:'on an incline bench'},
  {id:'decline',test:/decline/i,rotate:100,label:'on a decline bench'},
  {id:'supine',test:/bench press|floor press|chest fly|pullover|skull ?crusher|lying triceps|glute bridge|hip thrust|dead ?bug|bench$/i,rotate:90,label:'lying on your back'},
  {id:'prone',test:/push-?up|plank(?!.*side)|mountain climber|bear crawl/i,rotate:-90,label:'face down'},
  {id:'seated',test:/seated|pulldown|leg extension|machine row|cable row|seated calf|leg press/i,seated:true,label:'seated'},
  {id:'hanging',test:/pull-?up|chin-?up|hanging/i,label:'hanging from a bar'}
];
function exerciseOrientation(name){var n=String(name||'');for(var i=0;i<ORIENTATION_RULES.length;i++)if(ORIENTATION_RULES[i].test.test(n))return ORIENTATION_RULES[i];return null;}
function _seat(pos){var p={};Object.keys(pos).forEach(function(k){p[k]=pos[k].slice();});var h=p.hip;p.knee=[h[0]+0.24,h[1]];p.ankle=[h[0]+0.26,h[1]-0.24];p.toe=[h[0]+0.33,h[1]-0.24];return p;}
function orientFrames(frames,orient){if(!orient||(!orient.rotate&&!orient.seated))return frames;
  return frames.map(function(f){var pos=f.positions;if(orient.seated)pos=_seat(pos);if(orient.rotate)pos=_rot(pos,pos.hip,orient.rotate);return Object.assign({},f,{positions:pos});});}
/* Start and end side by side, at one scale (the overlay made both hard to read). */
function renderFramePanels(frames,o){
  o=o||{};var segs=o.segments||SKELETON_SEGMENTS,joints=o.joints||SKELETON_JOINTS,W=o.width||130,H=o.height||150,hot=o.loadedJoints||{};
  var T=coordinateTransform(frames.map(function(f){return f.positions;}),W,H,14);
  /* The floor sits at the figure's lowest point: at y=0 a rotated figure (a push-up) floated above it. */
  var minY=Infinity;frames.forEach(function(f){Object.keys(f.positions).forEach(function(k){minY=Math.min(minY,f.positions[k][1]);});});
  var panel=function(f,i){var sg='',jt='',rom='',force='',last=i===frames.length-1&&frames.length>1;
    segs.forEach(function(g){var a=f.positions[g[0]],b=f.positions[g[1]];if(!a||!b)return;var p=T.map(a),q=T.map(b);
      sg+='<line class="sk-seg" x1="'+p[0].toFixed(1)+'" y1="'+p[1].toFixed(1)+'" x2="'+q[0].toFixed(1)+'" y2="'+q[1].toFixed(1)+'"/>';});
    var hd=T.map(f.positions.head);sg+='<circle class="sk-head" cx="'+hd[0].toFixed(1)+'" cy="'+hd[1].toFixed(1)+'" r="'+(0.045*T.scale).toFixed(1)+'"/>';
    var fy=(T.map([0,minY])[1]+2).toFixed(1);sg+='<line class="sk-floor" x1="4" x2="'+(W-4)+'" y1="'+fy+'" y2="'+fy+'"/>';
    joints.forEach(function(j){var q=f.positions[j];if(!q||j==='head')return;var p=T.map(q),on=hot[j]||hot[String(j).replace(/[LR]$/,'')];
      jt+='<circle class="sk-joint'+(on?' sk-hot':'')+'" cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="'+(on?3.8:2.4)+'"><title>'+esc(j)+(on?' \u2014 loaded':'')+'</title></circle>';});
    /* the range of motion and the load, on the end panel (side views, where the angle is in the drawing's plane) */
    if(last&&o.primary&&o.rom==='angle'&&typeof JOINT_ANGLE_ARMS!=='undefined'&&JOINT_ANGLE_ARMS[o.primary]&&f.positions[o.primary]){
      var arms=JOINT_ANGLE_ARMS[o.primary],f0=frames[0].positions,c=T.map(f.positions[o.primary]),r=Math.max(12,0.08*T.scale);
      var ang=function(pos){var a=pos[arms[1]],cc=pos[o.primary];return Math.atan2(-(a[1]-cc[1]),a[0]-cc[0]);};
      if(f0[arms[1]]&&f0[o.primary]){var t0=ang(f0),t1=ang(f.positions),sw=((t1-t0+2*Math.PI)%(2*Math.PI))<Math.PI?1:0;
        rom='<path class="sk-rom" d="M '+(c[0]+r*Math.cos(t0)).toFixed(1)+' '+(c[1]+r*Math.sin(t0)).toFixed(1)+' A '+r.toFixed(1)+' '+r.toFixed(1)+' 0 0 '+sw+' '+(c[0]+r*Math.cos(t1)).toFixed(1)+' '+(c[1]+r*Math.sin(t1)).toFixed(1)+'"/>';}}
    if(last&&o.load&&f.positions[o.load]){var lp=T.map(f.positions[o.load]),len=Math.max(18,0.1*T.scale);
      force='<line class="sk-force" x1="'+lp[0].toFixed(1)+'" y1="'+lp[1].toFixed(1)+'" x2="'+lp[0].toFixed(1)+'" y2="'+(lp[1]+len).toFixed(1)+'"/><path class="sk-force-head" d="M '+(lp[0]-4).toFixed(1)+' '+(lp[1]+len-6).toFixed(1)+' L '+lp[0].toFixed(1)+' '+(lp[1]+len).toFixed(1)+' L '+(lp[0]+4).toFixed(1)+' '+(lp[1]+len-6).toFixed(1)+'"/>';}
    return '<div class="mv-panel"><div class="mv-cap">'+esc(f.name||(i===0?'start':'end'))+'</div><svg class="skeleton" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc((o.label||'movement')+', '+(f.name||''))+'">'+
      '<g class="sk-l-segments">'+sg+'</g><g class="sk-l-rom">'+rom+'</g><g class="sk-l-force">'+force+'</g><g class="sk-l-joints">'+jt+'</g><g class="sk-l-labels"></g></svg></div>';};
  var out='<div class="mv-panels">'+frames.map(panel).join(frames.length>1?'<div class="mv-arrow" aria-hidden="true">\u2192</div>':'')+'</div>';
  if(o.caption||o.view==='front'||o.orientation)out+='<div class="hint mv-note">'+esc([o.view==='front'?'Seen from the front':null,o.orientation?o.orientation:null,o.caption||null].filter(Boolean).join(' \u00b7 '))+'</div>';
  return out;
}
/* The audit: every figure's view matches its plane, start and end differ visibly unless the movement is a hold, no moving
   limb sits on the torso line, and every exercise resolves to a figure. */
function movementVisualAudit(){
  var issues=[],checked=0;
  Object.keys(MOVEMENT_PATTERNS).forEach(function(k){var m=movementModel(k);checked++;if(m.status!=='ok'){issues.push(k+': no figure');return;}
    var plane=(PATTERN_MECHANICS[k]||{}).plane;if(plane==='frontal'&&m.view!=='front')issues.push(k+': a frontal-plane movement drawn side-on');
    var f0=m.frames[0].positions,f1=m.frames[m.frames.length-1].positions,move=0;Object.keys(f1).forEach(function(j){if(f0[j]){var dx=f1[j][0]-f0[j][0],dy=f1[j][1]-f0[j][1];move=Math.max(move,Math.sqrt(dx*dx+dy*dy));}});
    var hold=(FRONT_FRAMES[k]&&FRONT_FRAMES[k].hold)||/^anti-|grip|carry/.test(k);
    if(!hold&&move<0.06)issues.push(k+': start and end barely differ ('+round(move,3)+' body units)');
    if(m.view!=='front'&&!hold&&(m.primary==='shoulder'||m.primary==='elbow')){var w=f1.wrist,sh=f1.shoulder,hp=f1.hip;if(w&&sh&&hp){var cross=Math.abs((hp[0]-sh[0])*(sh[1]-w[1])-(sh[0]-w[0])*(hp[1]-sh[1]))/Math.max(0.001,Math.hypot(hp[0]-sh[0],hp[1]-sh[1]));
      if(cross<0.03&&move<0.12)issues.push(k+': the moving arm sits on the torso line');}}});
  /* Direction: a press lying on the back pushes up, away from the floor; a push-up pushes down, into it. */
  [['Bench press',1],['Push-up',-1]].forEach(function(t){var e=resolveExercise(t[0]);if(!e)return;var m=movementModel(e.pattern,{exercise:e.name});if(m.view!=='side')return;
    var f0=m.frames[0].positions,f1=m.frames[m.frames.length-1].positions,dy=f1.wrist[1]-f0.wrist[1];
    if(dy*t[1]<=0)issues.push(t[0]+': the push goes the wrong way ('+(dy>0?'up':'down')+')');});
  Object.keys(POSES).forEach(function(k){var m=poseModel(k);checked++;if(m.status!=='ok')issues.push('pose '+k+': no figure');});
  var unresolved=EXERCISES.filter(function(e){return !MOVEMENT_PATTERNS[e.pattern];}).map(function(e){return e.id;});
  if(unresolved.length)issues.push(unresolved.length+' exercises have no figure: '+unresolved.slice(0,4).join(', '));
  return {ok:!issues.length,issues:issues,checked:checked,exercises:EXERCISES.length};
}
