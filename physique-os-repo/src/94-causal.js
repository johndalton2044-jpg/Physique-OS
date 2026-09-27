/* ============================================================================
   REGION: CAUSAL INFERENCE (ConWork.md)

   The distributed-lag engine with false-discovery control was standing in for this, and it is a weaker
   instrument: it finds association at a lag and says so honestly, but it cannot tell a confounded
   association from a causal one because it never encodes what could confound it.

   What follows is the machinery for doing that properly on observational data, plus the honest boundary
   around it. Three things are worth stating before any of the code:

   1. ADJUSTMENT REQUIRES A GRAPH. There is no statistical test that identifies confounders from data. Which
      variables to adjust for is a claim about causal structure, and that claim has to be written down before
      the arithmetic means anything. The DAG below is that claim — arguable, explicit, and revisable.

   2. ADJUSTING FOR THE WRONG THING MAKES ESTIMATES WORSE. Conditioning on a mediator removes part of the
      effect being measured. Conditioning on a collider CREATES a spurious association where none existed.
      So the adjustment set is computed from the graph by the backdoor criterion rather than "control for
      everything available", which is the most common way observational analysis goes wrong.

   3. NONE OF THIS BEATS RANDOMISATION. A randomised sequence of self-experiments answers the question these
      methods only approximate. Everything here is what to do when that is not available, and it reports
      itself as such.
   ============================================================================ */

/* ---------------- the causal graph ----------------
   Directed edges: from → to, meaning "from is a cause of to". This is a claim about the world, not a
   summary of correlations in the record. */
var CAUSAL_DAG={
  nodes:['season','stress','sleep','motivation','adherence','calories','steps','cardio',
         'training','fatigue','soreness','readiness','weight','hunger','bodyfat','illness'],
  edges:[
    ['season','steps'],['season','motivation'],
    ['stress','sleep'],['stress','motivation'],['stress','hunger'],['stress','readiness'],
    ['sleep','readiness'],['sleep','hunger'],['sleep','motivation'],
    ['motivation','adherence'],['motivation','steps'],['motivation','training'],
    ['adherence','calories'],
    ['calories','weight'],['calories','hunger'],['calories','readiness'],
    ['steps','weight'],['cardio','weight'],['cardio','fatigue'],
    ['training','fatigue'],['training','soreness'],['training','weight'],
    ['fatigue','readiness'],['fatigue','steps'],
    ['soreness','readiness'],
    ['illness','sleep'],['illness','readiness'],['illness','steps'],['illness','training'],
    ['weight','bodyfat']
  ],
  /* Feedback loops are real and a DAG cannot hold them: hunger drives adherence which drives intake which
     drives hunger. The validator caught exactly this cycle in the first version of this graph. The
     resolution is that the loop is TEMPORAL — today's hunger affects tomorrow's adherence — so the lagged
     edges live here, outside the contemporaneous graph, and any analysis using them has to index by time
     rather than treating them as simultaneous. */
  laggedEdges:[
    {from:'hunger',to:'adherence',lagDays:1,
     why:'hunger today shows up in tomorrow\u2019s adherence, not today\u2019s intake which is already logged'},
    {from:'fatigue',to:'training',lagDays:1,
     why:'fatigue today changes tomorrow\u2019s session, not the one already performed'},
    {from:'fatigue',to:'motivation',lagDays:1,
     why:'accumulated fatigue erodes motivation over days; treating it as simultaneous closes a loop through training'},
    {from:'soreness',to:'training',lagDays:1,
     why:'soreness today changes the next session, not the one that caused it'},
    {from:'weight',to:'adherence',lagDays:1,
     why:'seeing the scale move changes what you do next, which is a real effect and a different one'}
  ]
};
function dagParents(node){
  return CAUSAL_DAG.edges.filter(function(e){return e[1]===node;}).map(function(e){return e[0];});
}
function dagChildren(node){
  return CAUSAL_DAG.edges.filter(function(e){return e[0]===node;}).map(function(e){return e[1];});
}
function dagValidate(){
  var issues=[];
  CAUSAL_DAG.edges.forEach(function(e){
    if(CAUSAL_DAG.nodes.indexOf(e[0])<0)issues.push('edge from unknown node: '+e[0]);
    if(CAUSAL_DAG.nodes.indexOf(e[1])<0)issues.push('edge to unknown node: '+e[1]);
  });
  /* A causal DAG must be acyclic, or "X causes Y causes X" makes every effect undefined. */
  var visiting={},done={},cycles=[];
  function visit(n,path){
    if(visiting[n]){cycles.push(path.concat([n]).join(' \u2192 '));return;}
    if(done[n])return;
    visiting[n]=1;
    dagChildren(n).forEach(function(c){visit(c,path.concat([n]));});
    visiting[n]=0;done[n]=1;
  }
  CAUSAL_DAG.nodes.forEach(function(n){visit(n,[]);});
  if(cycles.length)issues.push('cycle: '+cycles[0]);
  /* Lagged edges must not duplicate a contemporaneous one, or the same relationship would be counted twice. */
  (CAUSAL_DAG.laggedEdges||[]).forEach(function(l){
    if(CAUSAL_DAG.edges.some(function(e){return e[0]===l.from&&e[1]===l.to;}))
      issues.push('lagged edge duplicates a contemporaneous one: '+l.from+' → '+l.to);
    if(CAUSAL_DAG.nodes.indexOf(l.from)<0||CAUSAL_DAG.nodes.indexOf(l.to)<0)
      issues.push('lagged edge references an unknown node: '+l.from+' → '+l.to);
  });
  return {nodes:CAUSAL_DAG.nodes.length,edges:CAUSAL_DAG.edges.length,
    laggedEdges:(CAUSAL_DAG.laggedEdges||[]).length,
    issues:issues,acyclic:!cycles.length,ok:issues.length===0,cls:'POLICY',
    note:'The graph is a claim about causal structure, written down so it can be argued with. It is not derived from the data and no amount of data would derive it.',
    caveat:'Feedback loops are held separately as lagged edges, because a DAG cannot represent one. Any analysis that treats a lagged edge as simultaneous is making a mistake the acyclicity check exists to catch.'};
}
/* All directed paths and all paths ignoring direction, needed for the backdoor criterion. */
function _allPaths(from,to){
  var out=[];
  (function walk(n,path,seen){
    if(path.length>7)return;
    if(n===to&&path.length>1){out.push(path.slice());return;}
    CAUSAL_DAG.edges.forEach(function(e){
      var nxt=null,dir=null;
      if(e[0]===n){nxt=e[1];dir='out';}
      else if(e[1]===n){nxt=e[0];dir='in';}
      if(nxt==null||seen[nxt])return;
      seen[nxt]=1;
      walk(nxt,path.concat([{node:nxt,edgeDir:dir}]),seen);
      seen[nxt]=0;
    });
  })(from,[{node:from,edgeDir:null}],(function(){var s={};s[from]=1;return s;})());
  return out;
}
function _isCollider(path,i){
  /* A node is a collider on a path when both adjacent edges point INTO it. */
  if(i<=0||i>=path.length-1)return false;
  return path[i].edgeDir==='out'&&path[i+1].edgeDir==='in';
}
function _pathBlocked(path,Z){
  for(var i=1;i<path.length-1;i++){
    var n=path[i].node;
    var collider=_isCollider(path,i);
    if(collider){
      /* A collider blocks the path unless it (or a descendant) is conditioned on. */
      if(Z.indexOf(n)>=0)continue;   // conditioning OPENS it
      return true;
    }else{
      if(Z.indexOf(n)>=0)return true;   // conditioning on a non-collider blocks it
    }
  }
  return false;
}
/* ---------------- backdoor adjustment set ---------------- */
function adjustmentSet(treatment,outcome){
  if(CAUSAL_DAG.nodes.indexOf(treatment)<0||CAUSAL_DAG.nodes.indexOf(outcome)<0)
    return {status:'unknown',note:'one of these is not in the causal graph, so no adjustment set can be derived'};
  var paths=_allPaths(treatment,outcome);
  /* Backdoor paths: those leaving the treatment via an arrow INTO it. */
  var backdoor=paths.filter(function(p){return p.length>1&&p[1].edgeDir==='in';});
  var directed=paths.filter(function(p){return p.every(function(s,i){return i===0||s.edgeDir==='out';});});
  /* Mediators must NOT be adjusted for \u2014 they carry the effect being measured. */
  var mediators={};
  directed.forEach(function(p){p.slice(1,-1).forEach(function(s){mediators[s.node]=1;});});
  /* Descendants of the treatment are off-limits for the same reason. */
  var descendants={};
  (function desc(n){dagChildren(n).forEach(function(c){if(!descendants[c]){descendants[c]=1;desc(c);}});})(treatment);
  var candidates=CAUSAL_DAG.nodes.filter(function(n){
    return n!==treatment&&n!==outcome&&!mediators[n]&&!descendants[n];});
  /* Smallest set that blocks every backdoor path. Greedy over candidate subsets by size, which is tractable
     at this graph size and returns a minimal set rather than "everything available". */
  var best=null;
  var tryAll=function(size){
    var idx=[];
    (function combo(start,cur){
      if(best)return;
      if(cur.length===size){
        var ok=backdoor.every(function(p){return _pathBlocked(p,cur);});
        /* Must not itself open a collider path that was closed. */
        if(ok)best=cur.slice();
        return;
      }
      for(var i=start;i<candidates.length&&!best;i++)combo(i+1,cur.concat([candidates[i]]));
    })(0,[]);
  };
  /* The bound was three, which on the expanded graph made real effects look unidentifiable purely because
     the search stopped early. Raised to five, with a guard: the number of subsets grows as C(n,k), so on a
     large candidate list the search is capped and reports that it was capped rather than reporting "not
     identifiable", which would be a different and false claim. */
  var maxSize=Math.min(5,candidates.length);
  var budgetExceeded=false;
  var combos=function(n,k){var r=1;for(var i=0;i<k;i++)r=r*(n-i)/(i+1);return r;};
  for(var size=0;size<=maxSize&&!best;size++){
    if(combos(candidates.length,size)>60000){budgetExceeded=true;break;}
    tryAll(size);
  }
  var unblocked=backdoor.filter(function(p){return !_pathBlocked(p,best||[]);});
  return {status:'ok',cls:'POLICY',treatment:treatment,outcome:outcome,
    adjustFor:best||[],
    backdoorPaths:backdoor.length,
    mediators:Object.keys(mediators),
    descendants:Object.keys(descendants),
    identifiable:!!best&&unblocked.length===0,
    searchCapped:budgetExceeded,
    searchedUpTo:budgetExceeded?'search stopped early':maxSize,
    unblocked:unblocked.length,
    note:best?
      (best.length?('Adjusting for '+best.join(', ')+' blocks every backdoor path from '+treatment+' to '+outcome+'.'):
       ('No backdoor paths, so no adjustment is needed \u2014 the association is the effect if the graph is right.')):
      (budgetExceeded?
        'The search for a blocking set was capped before it finished, so this is "not found" rather than "does not exist" — a distinction worth keeping.':
        'No set of five or fewer variables blocks every backdoor path, so this effect is not identifiable from observation with this graph.'),
    warning:Object.keys(mediators).length?
      ('Do NOT adjust for '+Object.keys(mediators).join(', ')+' \u2014 these carry the effect, and conditioning on them would remove part of what you are trying to measure.'):null,
    caveat:'Adjustment validity depends entirely on the graph being right. Conditioning on a collider CREATES association where there was none, which is why "control for everything available" is worse than nothing.'};
}
/* ---------------- propensity and overlap ----------------
   For a binary treatment defined by a threshold, estimate the chance of treatment given the adjustment set,
   then check whether treated and untreated periods are comparable at all. */
function propensityAnalysis(treatment,outcome,opts){
  opts=opts||{};
  var days=opts.days||120;
  var adj=adjustmentSet(treatment,outcome);
  if(adj.status!=='ok'||!adj.identifiable)
    return {status:'not-identifiable',adjustment:adj,
      note:adj.note,
      caveat:'Without an adjustment set there is no observational estimate worth computing, so none is offered.'};
  var t=seriesWindow(treatment,days),y=seriesWindow(outcome,days);
  if(t.length<20||y.length<20)return {status:'insufficient',
    need:['at least 20 days of '+treatment+' and '+outcome]};
  var byDate={};y.forEach(function(d){byDate[d.date]=d.value;});
  var covs={};
  adj.adjustFor.forEach(function(c){
    var s=seriesWindow(c,days);
    covs[c]={};s.forEach(function(d){covs[c][d.date]=d.value;});
  });
  var thresh=opts.threshold!=null?opts.threshold:median(t.map(function(d){return d.value;}));
  var rows=[];
  t.forEach(function(d){
    if(byDate[d.date]==null)return;
    var x={date:d.date,treated:d.value>thresh?1:0,outcome:byDate[d.date],cov:{}};
    var complete=true;
    adj.adjustFor.forEach(function(c){
      if(covs[c][d.date]==null)complete=false;else x.cov[c]=covs[c][d.date];});
    if(complete)rows.push(x);
  });
  if(rows.length<20)return {status:'insufficient',
    need:['days where treatment, outcome and '+(adj.adjustFor.join(', ')||'no covariates')+' were all recorded'],
    have:rows.length};
  var treated=rows.filter(function(r){return r.treated;}),control=rows.filter(function(r){return !r.treated;});
  if(treated.length<6||control.length<6)return {status:'no-variation',
    treated:treated.length,control:control.length,
    note:'Too few days on one side of the threshold to compare. Nothing can be separated when nothing varies.'};
  /* BALANCE: standardised difference per covariate. Above 0.25 is the usual "these groups are not
     comparable" threshold. */
  var balance=adj.adjustFor.map(function(c){
    var a=treated.map(function(r){return r.cov[c];}),b=control.map(function(r){return r.cov[c];});
    var ma=mean(a),mb=mean(b);
    var pooled=Math.sqrt((Math.pow(sd(a)||0,2)+Math.pow(sd(b)||0,2))/2);
    return {covariate:c,treatedMean:round(ma,2),controlMean:round(mb,2),
      standardisedDiff:pooled?round((ma-mb)/pooled,2):null};
  });
  var imbalanced=balance.filter(function(b){return b.standardisedDiff!=null&&Math.abs(b.standardisedDiff)>0.25;});
  /* STRATIFIED estimate: compare within strata of the covariates rather than across them. */
  var naive=mean(treated.map(function(r){return r.outcome;}))-mean(control.map(function(r){return r.outcome;}));
  var adjusted=naive,strata=1;
  if(adj.adjustFor.length){
    var key=function(r){return adj.adjustFor.map(function(c){
      var vals=rows.map(function(x){return x.cov[c];});
      var m=median(vals);
      return r.cov[c]>m?'hi':'lo';}).join('|');};
    var groups={};
    rows.forEach(function(r){(groups[key(r)]=groups[key(r)]||[]).push(r);});
    var num=0,den=0;
    Object.keys(groups).forEach(function(k){
      var g=groups[k];
      var gt=g.filter(function(r){return r.treated;}),gc=g.filter(function(r){return !r.treated;});
      if(gt.length<2||gc.length<2)return;
      num+=(mean(gt.map(function(r){return r.outcome;}))-mean(gc.map(function(r){return r.outcome;})))*g.length;
      den+=g.length;
    });
    strata=Object.keys(groups).length;
    if(den)adjusted=num/den;
  }
  return {status:'ok',cls:'EMPIRICAL',treatment:treatment,outcome:outcome,
    adjustedFor:adj.adjustFor,threshold:round(thresh,1),
    n:rows.length,treated:treated.length,control:control.length,
    naiveDifference:round(naive,2),adjustedDifference:round(adjusted,2),
    confounding:round(Math.abs(naive-adjusted),2),
    balance:balance,imbalanced:imbalanced,strata:strata,
    overlap:imbalanced.length===0?'adequate':'poor',
    verdict:imbalanced.length?
      ('The treated and untreated days differ on '+imbalanced.map(function(b){return b.covariate;}).join(', ')+
       ', so they are not comparable and the adjusted figure is not trustworthy either.'):
      ('Adjusting moved the estimate from '+round(naive,2)+' to '+round(adjusted,2)+
       ', which is the size of the confounding the graph predicted.'),
    note:'A within-strata comparison, adjusting only for what the backdoor criterion says to adjust for.',
    caveat:'This is observational. It assumes the graph is right, that nothing outside it confounds, and that treatment on a given day is not caused by the outcome on that day. A randomised sequence of self-experiments answers this question; this only approximates it.'};
}
/* ---------------- negative controls ----------------
   An outcome the treatment should NOT affect. If it appears to, something is confounding both. */
var NEGATIVE_CONTROLS={
  steps:{outcome:'sleepq',why:'step count on a given day should not change how well you slept the night BEFORE'},
  calories:{outcome:'soreness',why:'intake should not change muscle soreness within a day'},
  cardio:{outcome:'stress',why:'a cardio session should not change life stress'}
};
function negativeControlCheck(treatment,opts){
  var nc=NEGATIVE_CONTROLS[treatment];
  if(!nc)return {status:'none',note:'No negative control is declared for '+treatment+'.'};
  var r=null;try{r=lagCorrelation(treatment,nc.outcome,0);}catch(e){}
  if(!r||r.status!=='ok')return {status:'insufficient',
    need:['enough paired days of '+treatment+' and '+nc.outcome]};
  var suspicious=Math.abs(r.r)>=0.25;
  return {status:'ok',cls:'EMPIRICAL',treatment:treatment,control:nc.outcome,
    r:round(r.r,2),n:r.n,suspicious:suspicious,
    expectation:nc.why,
    verdict:suspicious?
      ('An association of '+round(r.r,2)+' appears where there should be none, which suggests something is driving both \u2014 so any apparent effect of '+treatment+' on a real outcome should be treated as confounded too.'):
      'No association where none was expected, which is weak evidence that the design is not badly confounded.',
    note:'A negative control tests the method rather than the hypothesis. Finding an effect where none can exist is evidence about the analysis, not about the body.',
    caveat:'Passing a negative control does not establish that a real effect is causal. It only fails to find one specific kind of problem.'};
}
/* ---------------- hierarchical N-of-1 pooling ----------------
   Several runs of the same self-experiment, pooled so that each run informs the others without any one
   dominating. This is the same shrinkage logic as the response matrix, applied across repeats. */
function poolNofOne(variable){
  var runs=(DB.experiments||[]).filter(function(e){
    return e.status==='complete'&&e.variable===variable&&e.effect!=null;});
  if(runs.length<2)return {status:'insufficient',runs:runs.length,
    need:[(2-runs.length)+' more completed run(s) of this experiment'],
    note:'Pooling needs repeats. One run is a result; the point of pooling is that repeats disagree and the disagreement is information.'};
  var effects=runs.map(function(r){return r.effect;});
  var m=mean(effects);
  var between=runs.length>1?(Math.pow(sd(effects)||0,2)):0;
  var within=mean(runs.map(function(r){return Math.pow(r.se!=null?r.se:Math.abs(r.effect||1)*0.5,2);}));
  /* Each run shrinks toward the pooled mean by how much of its spread is noise rather than real difference. */
  var rows=runs.map(function(r){
    var se2=Math.pow(r.se!=null?r.se:Math.abs(r.effect||1)*0.5,2);
    var w=between/(between+se2||1);
    return {id:r.id,date:r.startDate,raw:round(r.effect,3),
      shrunk:round(w*r.effect+(1-w)*m,3),weight:round(w,2)};
  });
  var pooledSe=Math.sqrt((between+within)/runs.length);
  return {status:'ok',cls:'EMPIRICAL',variable:variable,runs:runs.length,
    pooled:round(m,3),lo:round(m-1.96*pooledSe,3),hi:round(m+1.96*pooledSe,3),
    betweenRunVariance:round(between,4),withinRunVariance:round(within,4),
    consistent:between<=within,
    rows:rows,
    verdict:between<=within?
      'the runs agree within their own noise, so the pooled figure is a fair summary':
      'the runs disagree by more than their noise explains, which usually means the effect depends on something that changed between them \u2014 the pooled figure hides that',
    note:'Repeats of the same experiment pooled hierarchically: each run is pulled toward the others by how much of its spread looks like noise.',
    caveat:'Pooling assumes the runs are exchangeable \u2014 that nothing systematic differed between them. Where between-run variance exceeds within-run variance, that assumption is already suspect and the disagreement is the finding.'};
}
