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
/* ---------------- matched periods (Stage E; TRANSITION item 6) ----------------
   A Response compares the trend after a change with the trend before it, continued. Trends move on their own: a
   steep loss slows, a stall gives way, a bad week of sleep is followed by a better one (regression to the mean). Matched
   periods measure how much of that happens when nothing was changed: the same comparison, with the same windows, at
   other dates in this person's own record that fall on the same weekday (so weekly rhythms cancel), in the same kind of
   phase, with no change of any kind in the windows or in the three weeks before them and no new phase, context period
   or training break, and that start from a similar trend: within half the spread of all such periods, or, where that is
   narrower, within twice the standard error of the difference between two such trends (matching finer than the
   measurement can tell apart is matching on noise). The Response's
   effect minus their average is the matched estimate; their spread is its noise, and that spread already carries the
   day-to-day carry-over the textbook standard error ignores. Four periods at least; fewer is reported, never padded.
   With so few, their spread is itself uncertain, so "clear" and the interval use Student's t on k-1 degrees of freedom
   (3.18 at four periods), not the normal 2; and the spread is never taken below the before/after estimate's own standard
   error, because four periods can agree closely by chance while carry-over only ever adds noise. */
var MATCHED_MIN=4;
function _contrastAt(oc,c,lenB,lenA){var B=[addDays(c,-lenB),addDays(c,-1)],A=[c,addDays(c,lenA-1)];
  if(oc==='weight'){var sb=_slopePerWeek(_rangeSeries('weight',B[0],B[1])),sa=_slopePerWeek(_rangeSeries('weight',A[0],A[1]));return sb&&sa?{date:c,before:sb.slope,beforeSe:sb.se,effect:sa.slope-sb.slope}:null;}
  var lc=_levelChange(oc,B,A);return lc?{date:c,before:lc.before,beforeSe:lc.se/Math.SQRT2,effect:lc.change}:null;}
function matchedPeriods(R){
  var P=R&&R.primary,oc=R&&R.outcome,d=R&&R.start,W=R&&R.windows;
  if(!P||!oc||!d||!W||!W.before||!W.after)return {status:'insufficient',need:['a judged response with a measured outcome']};
  if(!OBS_TYPES[oc])return {status:'insufficient',need:[oc+' is not a daily measure, so there are no periods to match']};
  var lenB=daysBetween(W.before[0],W.before[1])+1,lenA=daysBetween(W.after[0],W.after[1])+1,today=todayISO();
  var first=obsOf(oc).map(function(o){return o.date;}).sort()[0];if(!first)return {status:'insufficient',need:['readings of '+oc]};
  var changes=responseInterventions().map(function(i){return i.date;}).concat([d]);
  var R0=typeof regimes==='function'?regimes().filter(function(g){return g.kind!=='trend break';}):[];
  var ptype=function(x){var ph=null;try{ph=activePhase(x);}catch(e){}return ph?ph.type:null;},pd=ptype(d);
  var cands=[];
  for(var k=-1;;k--){var c=addDays(d,7*k);if(addDays(c,-lenB)<first)break;cands.push(c);}
  for(k=1;;k++){c=addDays(d,7*k);if(addDays(c,lenA-1)>today)break;cands.push(c);}
  var rows=cands.filter(function(c){var from=addDays(c,-lenB-21),to=addDays(c,lenA-1);
      return !changes.some(function(x){return x>=from&&x<=to;})&&
        !R0.some(function(g){return (g.from>addDays(c,-lenB)&&g.from<=to)||(g.to&&g.to>=addDays(c,-lenB)&&g.to<to);})&&ptype(c)===pd;})
    .map(function(c){return _contrastAt(oc,c,lenB,lenA);}).filter(Boolean);
  var phaseText=pd?('a '+pd+' phase'):'no phase';
  if(rows.length<MATCHED_MIN)return {status:'insufficient',candidates:rows.length,
    need:[(MATCHED_MIN-rows.length)+' more stretch'+(MATCHED_MIN-rows.length===1?'':'es')+' of about '+Math.round((lenB+lenA+21)/7)+' weeks with no change, in '+phaseText]};
  var caliper=Math.max(0.5*(sd(rows.map(function(r){return r.before;}))||0),2*Math.SQRT2*(median(rows.map(function(r){return r.beforeSe;}))||0));
  var M=rows.filter(function(r){return Math.abs(r.before-P.before)<=caliper+1e-9;});
  if(M.length<MATCHED_MIN)return {status:'insufficient',candidates:rows.length,matched:M.length,caliper:round(caliper,3),
    need:['only '+M.length+' of '+rows.length+' periods without a change started from a trend like this one; '+MATCHED_MIN+' are needed']};
  var nulls=M.map(function(r){return r.effect;}),m0=mean(nulls),s0=sd(nulls)||0,est=P.effect-m0,se=Math.max(s0,P.se||0)*Math.sqrt(1+1/M.length),tc=_tCrit(M.length-1);
  var share=(nulls.filter(function(x){return Math.abs(x-m0)>=Math.abs(P.effect-m0);}).length+1)/(M.length+1);
  var clear=se>0&&Math.abs(est)>tc*se;
  return {status:'ok',cls:'EMPIRICAL',model:'matched_periods',periods:M.length,candidates:rows.length,caliper:round(caliper,3),dates:M.map(function(r){return r.date;}),
    nullMean:round(m0,2),nullSd:round(s0,2),estimate:round(est,2),se:round(se,2),tCritical:round(tc,2),interval95:[round(est-tc*se,2),round(est+tc*se,2)],share:round(share,2),unit:P.unit||null,clear:clear,
    verdict:clear?'larger than the change comparable periods without one show':'within what comparable periods without a change show',
    method:'the same comparison at '+M.length+' dates in your record with no change, in '+phaseText+', starting from a similar trend; the effect minus their average, with their spread as its noise',
    caveat:'Matched periods rule out drift and regression to the mean, not a cause that arrived with the change (an illness, a holiday). It is still one person, without randomisation.'};
}
/* The causal estimates of one Response, beside its before/after estimate: the interrupted series (the change in rate
   for weight, in level otherwise, with standard errors allowing for carry-over) and the matched periods. */
function responseCausal(R){
  var P=R&&R.primary;if(!P||!R.outcome)return null;
  var its=null;try{its=interruptedTimeSeries({type:R.outcome,changeDate:R.start,before:R.windows.before,after:R.windows.after});}catch(e){}
  var rate=R.outcome==='weight',I=its&&its.status==='ok'?{effect:rate?its.slopeChangePerWeek:its.levelShift,se:rate?its.slopeChangeSe:its.levelShiftSe,autocorrelation:its.autocorrelation,
      quantity:rate?'change in rate':'change in level'}:null;
  var mp=matchedPeriods(R),E=[{method:'before and after',effect:P.effect,se:P.se}];
  if(I)E.push({method:'interrupted series',effect:round(I.effect,2),se:round(I.se,2)});
  if(mp.status==='ok')E.push({method:'matched periods',effect:mp.estimate,se:mp.se,clear:mp.clear});
  E.forEach(function(e){if(e.clear==null)e.clear=e.se>0&&Math.abs(e.effect)>2*e.se;});
  var clearOnes=E.filter(function(e){return e.clear;}),signs=clearOnes.map(function(e){return Math.sign(e.effect);});
  var agree=E.length<2?null:((clearOnes.length===0||clearOnes.length===E.length)&&signs.every(function(s){return s===signs[0];}));
  return {interrupted:I?Object.assign({},I,{effect:round(I.effect,2),se:round(I.se,2),verdict:its.verdict}):{status:its?its.status:'not computed',need:its&&its.need||null},
    matched:mp,estimates:E,agree:agree,
    agreement:agree==null?'only the before/after estimate is available':(agree?('the '+E.length+' estimates agree: '+(clearOnes.length?'a clear change':'no clear change')):
      ('the estimates disagree: '+clearOnes.map(function(e){return e.method;}).join(' and ')+' see'+(clearOnes.length===1?'s':'')+' a clear change, '+
        E.filter(function(e){return !e.clear;}).map(function(e){return e.method;}).join(' and ')+' do'+(E.length-clearOnes.length===1?'es':'')+' not'))};
}
/* Deliberate changes to a lever, pooled: each final Response's matched estimate per unit of the change (the lever's
   own scale, e.g. per 1,000 steps a day), combined by inverse variance. The identification strategy that rests on
   changes the person made at a date rather than on day-to-day association. */
function deliberateChangeEffect(treatment,outcome){
  var sc=(typeof RESPONSE_VARS!=='undefined'&&RESPONSE_VARS[treatment])?RESPONSE_VARS[treatment]:{scale:1,unit:'unit'};
  var rows=responsesOf().filter(function(r){return r.variable===treatment&&r.outcome===outcome&&r.stage==='final'&&r.dose;}).map(function(r){var m=matchedPeriods(r);
    /* the standard error each change carries is its t interval's half-width over 1.96, so few matched periods widen it */
    return m.status==='ok'&&m.se>0?{id:r.id,start:r.start,perUnit:m.estimate/(r.dose/sc.scale),se:m.se*m.tCritical/1.96/Math.abs(r.dose/sc.scale)}:null;}).filter(Boolean);
  if(!rows.length)return {status:'insufficient',need:['a final response to a change in '+treatment+' with matched periods behind it']};
  var W=0,S=0;rows.forEach(function(r){var w=1/(r.se*r.se);W+=w;S+=w*r.perUnit;});var est=S/W,se=Math.sqrt(1/W);
  return {status:'ok',cls:'EMPIRICAL',treatment:treatment,outcome:outcome,n:rows.length,per:sc.unit,estimate:round(est,3),se:round(se,3),lo:round(est-1.96*se,3),hi:round(est+1.96*se,3),rows:rows};
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
