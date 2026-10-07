/* ============================================================================
   REGION: UNIVERSAL BAYESIAN ENGINE AND PROPER PROPENSITY MODELLING (ConBWork.md)

   Four corrections, each replacing something that worked with something that is right.

   1. The Bayesian machinery was written once for maintenance. It is a general shape and is now general.
   2. `_pFromT` used a normal approximation. At n=20 that understates a p-value by enough to change a
      conclusion, and the whole point of the correction layer is not changing conclusions by accident.
   3. `propensityAnalysis` did not estimate propensity scores. It thresholded a continuous treatment and
      compared strata, which is treatment-assignment balance — a useful diagnostic wearing the wrong name.
   4. N-of-1 pooling used shrinkage weights rather than a hierarchical posterior.
   ============================================================================ */

/* ---------------- exact Student-t CDF ----------------
   Via the regularised incomplete beta function. The normal approximation is fine at n=200 and wrong where
   it matters here, which is n=20 to 40. */
function _logGamma(x){
  var c=[76.18009172947146,-86.50532032941677,24.01409824083091,
         -1.231739572450155,0.1208650973866179e-2,-0.5395239384953e-5];
  var y=x,t=x+5.5;
  t-=(x+0.5)*Math.log(t);
  var s=1.000000000190015;
  for(var j=0;j<6;j++)s+=c[j]/++y;
  return -t+Math.log(2.5066282746310005*s/x);
}
function _betacf(a,b,x){
  var MAXIT=200,EPS=3e-12,FPMIN=1e-300;
  var qab=a+b,qap=a+1,qam=a-1;
  var c=1,d=1-qab*x/qap;
  if(Math.abs(d)<FPMIN)d=FPMIN;
  d=1/d;var h=d;
  for(var m=1;m<=MAXIT;m++){
    var m2=2*m;
    var aa=m*(b-m)*x/((qam+m2)*(a+m2));
    d=1+aa*d;if(Math.abs(d)<FPMIN)d=FPMIN;
    c=1+aa/c;if(Math.abs(c)<FPMIN)c=FPMIN;
    d=1/d;h*=d*c;
    aa=-(a+m)*(qab+m)*x/((a+m2)*(qap+m2));
    d=1+aa*d;if(Math.abs(d)<FPMIN)d=FPMIN;
    c=1+aa/c;if(Math.abs(c)<FPMIN)c=FPMIN;
    d=1/d;
    var del=d*c;h*=del;
    if(Math.abs(del-1)<EPS)break;
  }
  return h;
}
function betaIncomplete(a,b,x){
  if(x<=0)return 0;
  if(x>=1)return 1;
  var bt=Math.exp(_logGamma(a+b)-_logGamma(a)-_logGamma(b)+a*Math.log(x)+b*Math.log(1-x));
  return x<(a+1)/(a+b+2)?bt*_betacf(a,b,x)/a:1-bt*_betacf(b,a,1-x)/b;
}
function studentTP(t,df){
  /* Two-sided p from a t statistic with df degrees of freedom \u2014 exact, not approximated. */
  if(t==null||df==null||!isFinite(t)||df<1)return null;
  var x=df/(df+t*t);
  return Math.max(0,Math.min(1,betaIncomplete(df/2,0.5,x)));
}
/* ---------------- universal Bayesian engine ----------------
   One conjugate-normal engine, reusable by any quantity that can state a prior and a likelihood. The
   maintenance model becomes one caller rather than the implementation. */
function bayesUpdate(spec){
  spec=spec||{};
  var pm=spec.prior&&spec.prior.mean,ps=spec.prior&&spec.prior.sd;
  if(pm==null||!ps)return {status:'no-prior',method:'conjugateNormal',
    note:'A posterior needs a prior. A model with no prior is not Bayesian, it is a point estimate with extra steps.'};
  var obs=spec.observations||[];
  if(!obs.length)return {status:'prior-only',cls:'PRIOR',method:'conjugateNormal',posterior:'full',
    mean:pm,sd:ps,lo:pm-1.96*ps,hi:pm+1.96*ps,n:0,weightOnData:0,
    note:'No observations, so the posterior IS the prior. That is the correct answer before evidence arrives, not a failure.'};
  /* Precision-weighted combination; precisions add, which is why more data narrows the belief. */
  var priorPrec=1/(ps*ps);
  var num=pm*priorPrec,den=priorPrec;
  obs.forEach(function(o){
    var sd2=o.sd!=null&&o.sd>0?o.sd:(spec.defaultObsSd||1);
    var prec=1/(sd2*sd2);
    num+=o.value*prec;den+=prec;
  });
  var mean=num/den,sd=Math.sqrt(1/den);
  var dataPrec=den-priorPrec;
  return {status:'ok',cls:dataPrec/den>=0.6?'EMPIRICAL':'BLENDED',method:'conjugateNormal',posterior:'full',
    assumptions:['normal likelihood','observation variances known, not estimated','normal prior'],
    mean:mean,sd:sd,lo:mean-1.96*sd,hi:mean+1.96*sd,
    n:obs.length,weightOnData:round(dataPrec/den,3),
    prior:{mean:pm,sd:ps},
    pooling:Math.round(dataPrec/den*100)+'% of this comes from the observations and '+
      Math.round(priorPrec/den*100)+'% from the prior',
    probAbove:function(x){return round(1-0.5*(1+_erf((x-mean)/(sd*Math.SQRT2))),3);},
    predictive:function(extraSd){
      var tot=Math.sqrt(sd*sd+Math.pow(extraSd||0,2));
      return {mean:mean,sd:tot,lo:mean-1.96*tot,hi:mean+1.96*tot,
        note:'Carries the uncertainty in the parameter AND the noise in a future observation. Using the posterior alone would be narrower than the truth.'};
    },
    note:'Conjugate normal update. Partial pooling falls out of the precision arithmetic rather than being a switch anyone throws.'};
}
/* A hierarchical prior: pool across units so each informs the others without any one dominating. */
/* §13: "never expose an approximation as a full posterior." This function was called hierarchicalBayes — the
   very name the direction reserves for the FULL method — while doing empirical Bayes: it estimates the
   between-unit variance once, by method of moments, and conditions on that point estimate. Every interval
   it reports is therefore too narrow, because the uncertainty in that variance is discarded. It is now named
   for what it is, and every output says so. The full method is hierarchicalPosterior(). */
function empiricalBayesPool(units,opts){
  opts=opts||{};
  if(!units||units.length<2)return {status:'insufficient',method:'empiricalBayes',posterior:'approximate',units:(units||[]).length,
    need:['at least two units to pool across'],
    note:'Hierarchy needs repeats. With one unit there is nothing to borrow strength from.'};
  var ys=units.map(function(u){return u.value;});
  var ses=units.map(function(u){return u.sd!=null&&u.sd>0?u.sd:(opts.defaultSd||1);});
  var grand=mean(ys);
  var withinVar=mean(ses.map(function(s){return s*s;}));
  var totalVar=Math.pow(sd(ys)||0,2);
  /* Method-of-moments estimate of between-unit variance \u2014 negative means the units agree within their own
     noise, and the honest read of that is zero rather than a negative variance. */
  var tau2=Math.max(0,totalVar-withinVar);
  var rows=units.map(function(u,i){
    var se2=ses[i]*ses[i];
    var shrink=tau2/(tau2+se2);
    return {id:u.id,raw:round(u.value,3),sd:round(ses[i],3),
      shrunk:round(shrink*u.value+(1-shrink)*grand,3),
      weight:round(shrink,3)};
  });
  var hyperSd=Math.sqrt((tau2+withinVar)/units.length);
  return {status:'ok',cls:'EMPIRICAL',method:'empiricalBayes',posterior:'approximate',
    approximation:'between-unit variance estimated by method of moments and plugged in; its own uncertainty is ignored, so intervals are too narrow',
    units:units.length,
    hyperMean:round(grand,3),hyperSd:round(hyperSd,3),
    lo:round(grand-1.96*hyperSd,3),hi:round(grand+1.96*hyperSd,3),
    betweenVariance:round(tau2,4),withinVariance:round(withinVar,4),
    exchangeable:tau2<=withinVar,
    rows:rows,
    note:'Empirical Bayes: a hyperprior fitted from the units themselves, with each unit shrunk toward it. An approximation \u2014 for the full posterior, see hierarchicalPosterior().',
    caveat:tau2>withinVar?
      'Between-unit variance exceeds within-unit noise, so the units are probably NOT exchangeable \u2014 something systematic differed between them, and the pooled figure hides it.':
      'The units agree within their own noise, so pooling is fair.'};
}
/* ---------------- an actual hierarchical posterior ----------------
   `hierarchicalBayes` estimates between-unit variance by method of moments and shrinks. That is empirical
   Bayes: defensible, widely used, and NOT a posterior. It conditions on a point estimate of tau and so
   reports intervals narrower than the truth, because the uncertainty in tau itself is thrown away.

   This integrates over tau on a grid instead. A grid is exact enough at one dimension and needs no sampler:
   for each tau, the conditional posterior for the hyper-mean is available in closed form, and the marginal
   is the weighted mixture over tau. What comes out is wider than the empirical-Bayes answer, and that extra
   width is the honest part. */
function hierarchicalPosterior(units,opts){
  opts=opts||{};
  if(!units||units.length<2)return {status:'insufficient',method:'hierarchicalBayes',posterior:'full',units:(units||[]).length,
    need:['at least two units'],
    note:'A hierarchy needs repeats. With one unit there is nothing to borrow strength from and no tau to estimate.'};
  var ys=units.map(function(u){return u.value;});
  var ses=units.map(function(u){return u.sd!=null&&u.sd>0?u.sd:(opts.defaultSd||1);});
  var spread=sd(ys)||Math.abs(mean(ys))*0.5||1;
  /* Grid over tau (between-unit SD), from "units are identical" to "units share almost nothing". */
  var TAU_N=opts.grid||80;
  var tauMax=Math.max(spread*4,Math.max.apply(null,ses)*4,1e-6);
  var grid=[];
  for(var i=0;i<TAU_N;i++)grid.push(tauMax*(i+0.5)/TAU_N);
  /* Half-Cauchy hyperprior on tau, scaled to the observed spread — the standard weakly-informative choice,
     which pulls toward zero without forbidding large heterogeneity. */
  var scale=Math.max(spread,1e-6);
  var logs=grid.map(function(tau){
    /* Marginal likelihood of the data given tau, integrating the hyper-mean out analytically. */
    var prec=0,wsum=0,ll=0;
    ys.forEach(function(y,k){
      var v=ses[k]*ses[k]+tau*tau;
      prec+=1/v;wsum+=y/v;
    });
    var mhat=wsum/prec;
    ys.forEach(function(y,k){
      var v=ses[k]*ses[k]+tau*tau;
      ll+=-0.5*(Math.log(2*Math.PI*v)+Math.pow(y-mhat,2)/v);
    });
    ll+=0.5*Math.log(2*Math.PI/prec);            // integrating out the hyper-mean
    ll+=Math.log(2/(Math.PI*scale*(1+Math.pow(tau/scale,2))));   // half-Cauchy prior
    return {tau:tau,ll:ll,mhat:mhat,prec:prec};
  });
  var maxLL=Math.max.apply(null,logs.map(function(x){return x.ll;}));
  var ws=logs.map(function(x){return Math.exp(x.ll-maxLL);});
  var wTot=ws.reduce(function(a,b){return a+b;},0);
  ws=ws.map(function(x){return x/wTot;});
  /* Marginal posterior for the hyper-mean: a mixture of normals across the tau grid. */
  var mMean=0;
  logs.forEach(function(x,k){mMean+=ws[k]*x.mhat;});
  var mVar=0;
  logs.forEach(function(x,k){
    var condVar=1/x.prec;
    mVar+=ws[k]*(condVar+Math.pow(x.mhat-mMean,2));   // law of total variance
  });
  var mSd=Math.sqrt(mVar);
  /* Posterior for tau itself, which empirical Bayes replaces with a single number. */
  var tauMean=0;logs.forEach(function(x,k){tauMean+=ws[k]*x.tau;});
  var cum=0,tauLo=null,tauHi=null;
  for(var g=0;g<logs.length;g++){
    cum+=ws[g];
    if(tauLo===null&&cum>=0.025)tauLo=logs[g].tau;
    if(tauHi===null&&cum>=0.975)tauHi=logs[g].tau;
  }
  /* Each unit's posterior, shrunk by the tau-averaged weight rather than a single plug-in tau. */
  /* and its standard deviation (law of total variance over the grid): given tau, the unit's variance is w2 times its own
     plus the hyper-mean's (1/prec) carried by its weight (1-w2) squared; the spread of the conditional means adds the rest.
     Hierarchical personalisation (Stage E) needs it to judge a pooled unit against the others. */
  var rows=units.map(function(u,k){
    var num=0,sq=0;
    logs.forEach(function(x,gi){
      var w2=(x.tau*x.tau)/(x.tau*x.tau+ses[k]*ses[k]),m=w2*u.value+(1-w2)*x.mhat,v=w2*ses[k]*ses[k]+(1-w2)*(1-w2)/x.prec;
      num+=ws[gi]*m;sq+=ws[gi]*(v+m*m);
    });
    return {id:u.id,raw:round(u.value,3),sd:round(ses[k],3),posterior:round(num,3),posteriorSd:round(Math.sqrt(Math.max(0,sq-num*num)),3)};
  });
  /* Empirical Bayes for comparison, so the cost of the plug-in is visible rather than argued. */
  var eb=empiricalBayesPool(units,opts);
  return {status:'ok',cls:'EMPIRICAL',method:'hierarchicalBayes',posterior:'full',computation:'grid integration over tau (80 points), half-Cauchy hyperprior',
    units:units.length,
    hyperMean:round(mMean,3),hyperSd:round(mSd,3),
    lo:round(mMean-1.96*mSd,3),hi:round(mMean+1.96*mSd,3),
    tau:{mean:round(tauMean,3),lo:tauLo!=null?round(tauLo,3):null,hi:tauHi!=null?round(tauHi,3):null},
    rows:rows,gridPoints:TAU_N,
    empiricalBayesComparison:eb.status==='ok'?{method:'empiricalBayes',posterior:'approximate',hyperMean:eb.hyperMean,hyperSd:eb.hyperSd}:null,
    widerThanEmpiricalBayes:eb.status==='ok'?round(mSd-eb.hyperSd,4):null,
    note:'Integrated over the between-unit standard deviation on a grid, with a half-Cauchy hyperprior, rather than conditioning on a point estimate of it. The interval is wider than the empirical-Bayes one because the uncertainty in tau is carried rather than discarded.',
    caveat:'A grid is exact enough in one dimension and this is one dimension. It still assumes the units are exchangeable and that both the unit likelihoods and the hyper-mean are normal — assumptions a sampler would not remove, only make easier to vary.'};
}
function poolNofOneFullBayes(variable,opts){
  var runs=(DB.experiments||[]).filter(function(e){
    return e.status==='complete'&&e.variable===variable&&e.effect!=null;});
  if(runs.length<2)return {status:'insufficient',method:'hierarchicalBayes',posterior:'full',runs:runs.length,
    need:[(2-runs.length)+' more completed run(s)'],
    note:'A hierarchical posterior needs repeats.'};
  var h=hierarchicalPosterior(runs.map(function(r){
    return {id:r.id,value:r.effect,sd:r.se!=null?r.se:Math.abs(r.effect||1)*0.5};}),opts);
  if(h.status!=='ok')return h;
  /* Predictive for a NEW run: hyper-mean uncertainty PLUS between-run spread PLUS that run's own noise. */
  var predSd=Math.sqrt(Math.pow(h.hyperSd,2)+Math.pow(h.tau.mean,2));
  return Object.assign({},h,{variable:variable,runs:runs.length,
    nextRunPredictive:{mean:h.hyperMean,sd:round(predSd,3),
      lo:round(h.hyperMean-1.96*predSd,3),hi:round(h.hyperMean+1.96*predSd,3),
      note:'What a new run should produce, carrying the uncertainty in the underlying effect AND the spread between runs. Wider than the pooled estimate, and it should be.'},
    note:'A full hierarchical posterior for repeated N-of-1 runs, integrating over between-run heterogeneity rather than plugging in an estimate of it.'});
}
/* Maintenance, rewritten as a caller of the general engine rather than its own implementation. */
function tdeeBayesUniversal(opts){
  opts=opts||{};
  var b=tdeeBayes(opts);
  if(b.status!=='ok'&&b.status!=='prior-only')return b;
  var spec={prior:{mean:b.prior?b.prior.mean:b.mean,sd:b.prior?b.prior.sd:b.sd},
    observations:b.likelihood?[{value:b.likelihood.mean,sd:b.likelihood.sd}]:[]};
  var g=bayesUpdate(spec);
  return Object.assign({},g,{quantity:'tdee',
    agreesWithSpecific:g.status==='ok'&&b.status==='ok'?Math.abs(g.mean-b.mean)<1:null,
    note:'Maintenance computed through the general engine. It agrees with the purpose-built version, which is the point \u2014 the general engine is the implementation now, not a second opinion.'});
}
/* ---------------- honest renaming ----------------
   The old function did treatment-assignment balance. It keeps doing that under a name that says so. */
function treatmentAssignmentBalance(treatment,outcome,opts){
  return propensityAnalysis(treatment,outcome,opts);
}
/* ---------------- a real propensity-score model ----------------
   Logistic regression of treatment on covariates, fitted by gradient ascent on the log-likelihood, then
   inverse-probability weighting with stabilisation and trimming. */
function _logistic(X,y,opts){
  opts=opts||{};
  var iters=opts.iters||400,lr=opts.lr||0.08;
  var p=X[0].length;
  var beta=new Array(p).fill(0);
  for(var it=0;it<iters;it++){
    var grad=new Array(p).fill(0);
    for(var i=0;i<X.length;i++){
      var z=0;for(var j=0;j<p;j++)z+=beta[j]*X[i][j];
      var pi=1/(1+Math.exp(-z));
      var err=y[i]-pi;
      for(var j2=0;j2<p;j2++)grad[j2]+=err*X[i][j2];
    }
    /* Mild ridge penalty keeps the fit from diverging when a covariate separates the classes. */
    for(var j3=0;j3<p;j3++)beta[j3]+=lr*(grad[j3]/X.length-0.01*beta[j3]);
  }
  return beta;
}
function propensityScoreModel(treatment,outcome,opts){
  opts=opts||{};
  var days=opts.days||120;
  var adj=adjustmentSet(treatment,outcome);
  if(adj.status!=='ok'||!adj.identifiable)
    return {status:'not-identifiable',adjustment:adj,note:adj.note,
      caveat:'Without an adjustment set there is nothing to model treatment assignment on that would make the estimate mean anything.'};
  var t=seriesWindow(treatment,days),y=seriesWindow(outcome,days);
  var byY={};y.forEach(function(d){byY[d.date]=d.value;});
  var covs={};
  adj.adjustFor.forEach(function(c){
    var s=seriesWindow(c,days);covs[c]={};s.forEach(function(d){covs[c][d.date]=d.value;});});
  var thresh=opts.threshold!=null?opts.threshold:median(t.map(function(d){return d.value;}));
  var rows=[];
  t.forEach(function(d){
    if(byY[d.date]==null)return;
    var cv=[1],ok=true;
    adj.adjustFor.forEach(function(c){
      if(covs[c][d.date]==null)ok=false;else cv.push(covs[c][d.date]);});
    if(ok)rows.push({date:d.date,T:d.value>thresh?1:0,Y:byY[d.date],X:cv});
  });
  if(rows.length<25){
    /* Distinguish "not enough days" from "a required covariate is not tracked at all". The second is a
       capability gap the person can act on; the first is just time. The graph can demand adjustment for
       something this app never records, and saying so is more useful than reporting insufficiency. */
    var untracked=adj.adjustFor.filter(function(c){
      return !OBS_TYPES[c]||seriesWindow(c,days).length===0;});
    if(untracked.length)return {status:'covariate-not-tracked',
      untracked:untracked,adjustedFor:adj.adjustFor,have:rows.length,
      need:untracked.map(function(c){return 'a record of '+c;}),
      note:'The causal graph says this effect can only be identified by adjusting for '+untracked.join(', ')+
        ', and '+(untracked.length>1?'those are':'that is')+' not tracked. This is a gap in what is recorded rather than a shortage of days — no amount of waiting fixes it.',
      caveat:'An estimate that skipped the missing covariate would be confounded by exactly the thing the graph identified. Reporting nothing is the correct output.'};
    return {status:'insufficient',have:rows.length,
      need:['at least 25 days where treatment, outcome and '+(adj.adjustFor.join(', ')||'covariates')+' were all recorded'],
      note:'A treatment-assignment model fitted to fewer than about 25 observations will fit the noise.'};}
  /* Standardise covariates so the fit is numerically stable. */
  var p=rows[0].X.length;
  var mu=[],sg=[];
  for(var j=1;j<p;j++){
    var col=rows.map(function(r){return r.X[j];});
    mu[j]=mean(col);sg[j]=sd(col)||1;
    rows.forEach(function(r){r.X[j]=(r.X[j]-mu[j])/sg[j];});
  }
  var beta=_logistic(rows.map(function(r){return r.X;}),rows.map(function(r){return r.T;}),opts);
  rows.forEach(function(r){
    var z=0;for(var j2=0;j2<p;j2++)z+=beta[j2]*r.X[j2];
    r.ps=1/(1+Math.exp(-z));
  });
  var treated=rows.filter(function(r){return r.T;}),control=rows.filter(function(r){return !r.T;});
  if(treated.length<8||control.length<8)return {status:'no-variation',
    treated:treated.length,control:control.length,
    note:'Too few on one side of the threshold to model assignment at all.'};
  /* POSITIVITY: every unit must have a real chance of either condition. Scores near 0 or 1 mean that fails. */
  var psAll=rows.map(function(r){return r.ps;});
  var minPs=Math.min.apply(null,psAll),maxPs=Math.max.apply(null,psAll);
  var violations=rows.filter(function(r){return r.ps<0.05||r.ps>0.95;}).length;
  /* OVERLAP: the common support region. */
  var tMin=Math.min.apply(null,treated.map(function(r){return r.ps;}));
  var tMax=Math.max.apply(null,treated.map(function(r){return r.ps;}));
  var cMin=Math.min.apply(null,control.map(function(r){return r.ps;}));
  var cMax=Math.max.apply(null,control.map(function(r){return r.ps;}));
  var lo=Math.max(tMin,cMin),hi=Math.min(tMax,cMax);
  var trimmed=rows.filter(function(r){return r.ps>=Math.max(lo,0.05)&&r.ps<=Math.min(hi,0.95);});
  /* STABILISED weights: the marginal probability over the conditional one, which keeps the variance finite. */
  var pT=treated.length/rows.length;
  trimmed.forEach(function(r){
    r.w=r.T?(pT/Math.max(1e-6,r.ps)):((1-pT)/Math.max(1e-6,1-r.ps));
  });
  var wt=trimmed.filter(function(r){return r.T;}),wc=trimmed.filter(function(r){return !r.T;});
  if(!wt.length||!wc.length)return {status:'no-overlap',
    note:'After trimming to the region where both conditions actually occur, one side is empty. These periods are not comparable.'};
  var wmean=function(rs){
    var n=rs.reduce(function(a,r){return a+r.w;},0);
    return n?rs.reduce(function(a,r){return a+r.w*r.Y;},0)/n:null;};
  var att=wmean(wt)-wmean(wc);
  var naive=mean(treated.map(function(r){return r.Y;}))-mean(control.map(function(r){return r.Y;}));
  /* BALANCE AFTER WEIGHTING \u2014 the check that says whether the weighting did its job. */
  var balanceAfter=adj.adjustFor.map(function(c,k){
    var idx=k+1;
    var wm=function(rs){var n=rs.reduce(function(a,r){return a+r.w;},0);
      return n?rs.reduce(function(a,r){return a+r.w*r.X[idx];},0)/n:0;};
    var a2=wm(wt),b2=wm(wc);
    var pooled=Math.sqrt((Math.pow(sd(wt.map(function(r){return r.X[idx];}))||0,2)+
                          Math.pow(sd(wc.map(function(r){return r.X[idx];}))||0,2))/2);
    return {covariate:c,standardisedDiff:pooled?round((a2-b2)/pooled,3):null};
  });
  var stillImbalanced=balanceAfter.filter(function(b){
    return b.standardisedDiff!=null&&Math.abs(b.standardisedDiff)>0.1;});
  /* An effective sample size from the weights: highly variable weights mean fewer effective observations. */
  var sumW=trimmed.reduce(function(a,r){return a+r.w;},0);
  var sumW2=trimmed.reduce(function(a,r){return a+r.w*r.w;},0);
  var essW=sumW2?round(sumW*sumW/sumW2,1):null;
  return {status:'ok',cls:'EMPIRICAL',treatment:treatment,outcome:outcome,
    adjustedFor:adj.adjustFor,threshold:round(thresh,1),
    n:rows.length,trimmed:trimmed.length,dropped:rows.length-trimmed.length,
    treated:treated.length,control:control.length,
    propensityRange:{min:round(minPs,3),max:round(maxPs,3)},
    commonSupport:{lo:round(lo,3),hi:round(hi,3)},
    positivityViolations:violations,
    positivityOk:violations===0,
    effectiveSampleSize:essW,
    /* The estimand, named. Stabilised IPTW over the full trimmed sample targets the ATE — the average
       effect across all days — not the ATT, which is the effect among treated days only and needs
       treatment-odds weighting instead. It was labelled `iptwEstimate`, which names the METHOD and leaves
       the reader to assume the quantity. */
    estimand:'ATE',
    estimandMeans:'the average effect across all days in the trimmed sample, not the effect among the days that happened to be treated',
    ateEstimate:round(att,3),
    iptwEstimate:round(att,3),   // kept for callers; same number, worse name
    naiveDifference:round(naive,3),
    balanceAfterWeighting:balanceAfter,stillImbalanced:stillImbalanced,
    verdict:violations>rows.length*0.1?
      'More than a tenth of days had almost no chance of the other condition, so positivity fails and this estimate should not be used.':
      (stillImbalanced.length?
        ('Weighting did not balance '+stillImbalanced.map(function(b){return b.covariate;}).join(', ')+
         ', so the estimate is still confounded on those.'):
        ('Inverse-probability weighting moves the estimate from '+round(naive,3)+' to '+round(att,3)+
         ', on an effective sample of about '+essW+' days.')),
    note:'A genuine propensity model: treatment assignment fitted by logistic regression on the adjustment set, then stabilised inverse-probability weighting with trimming to common support. The estimand is the ATE.',
    caveat:'Every assumption still has to hold \u2014 the graph is right, nothing unmeasured confounds, and treatment on a day is not caused by that day\u2019s outcome. Weighting corrects for what was measured and can do nothing about what was not.'};
}
/* ---------------- continuous treatment ----------------
   Binarising at the median answers "high versus low", not "what does one more unit do". For a continuous
   exposure the second is the question people actually have, and a generalised propensity score gives it
   without throwing away the dose. */
function doseResponse(treatment,outcome,opts){
  opts=opts||{};
  var days=opts.days||120;
  var adj=adjustmentSet(treatment,outcome);
  if(adj.status!=='ok'||!adj.identifiable)
    return {status:'not-identifiable',adjustment:adj,note:adj.note};
  var t=seriesWindow(treatment,days),y=seriesWindow(outcome,days);
  var byY={};y.forEach(function(d){byY[d.date]=d.value;});
  var covs={};
  adj.adjustFor.forEach(function(c){
    var s2=seriesWindow(c,days);covs[c]={};s2.forEach(function(d){covs[c][d.date]=d.value;});});
  var rows=[];
  t.forEach(function(d){
    if(byY[d.date]==null)return;
    var cv=[],ok=true;
    adj.adjustFor.forEach(function(c){
      if(covs[c][d.date]==null)ok=false;else cv.push(covs[c][d.date]);});
    if(ok)rows.push({date:d.date,T:d.value,Y:byY[d.date],X:cv});
  });
  if(rows.length<25){
    var untracked=adj.adjustFor.filter(function(c){
      return !OBS_TYPES[c]||seriesWindow(c,days).length===0;});
    if(untracked.length)return {status:'covariate-not-tracked',untracked:untracked,
      need:untracked.map(function(c){return 'a record of '+c;}),
      note:'The graph requires adjusting for '+untracked.join(', ')+', which is not tracked.'};
    return {status:'insufficient',have:rows.length,need:['at least 25 complete days']};
  }
  /* Generalised propensity score: model the DOSE given covariates, then condition on it so that comparing
     doses is comparing like with like. */
  var k=adj.adjustFor.length;
  var means=[],sds=[];
  for(var j=0;j<k;j++){
    var col=rows.map(function(r){return r.X[j];});
    means[j]=mean(col);sds[j]=sd(col)||1;
  }
  var tm=mean(rows.map(function(r){return r.T;})),tsd=sd(rows.map(function(r){return r.T;}))||1;
  /* Linear model of dose on covariates, fitted by least squares via normal equations on standardised X. */
  var beta=new Array(k+1).fill(0);
  for(var it=0;it<300;it++){
    var grad=new Array(k+1).fill(0);
    rows.forEach(function(r){
      var pred=beta[0];
      for(var j2=0;j2<k;j2++)pred+=beta[j2+1]*((r.X[j2]-means[j2])/sds[j2]);
      var e=(r.T-tm)/tsd-pred;
      grad[0]+=e;
      for(var j3=0;j3<k;j3++)grad[j3+1]+=e*((r.X[j3]-means[j3])/sds[j3]);
    });
    for(var j4=0;j4<=k;j4++)beta[j4]+=0.05*grad[j4]/rows.length;
  }
  rows.forEach(function(r){
    var pred=beta[0];
    for(var j5=0;j5<k;j5++)pred+=beta[j5+1]*((r.X[j5]-means[j5])/sds[j5]);
    r.gps=pred;                       // expected dose given covariates
    r.resid=(r.T-tm)/tsd-pred;        // dose beyond what the covariates explain
  });
  /* The dose-response slope: regress outcome on the RESIDUALISED dose, which is the part of the exposure not
     explained by confounders. */
  var mr=mean(rows.map(function(r){return r.resid;})),my=mean(rows.map(function(r){return r.Y;}));
  var cov2=mean(rows.map(function(r){return (r.resid-mr)*(r.Y-my);}));
  var vr=mean(rows.map(function(r){return Math.pow(r.resid-mr,2);}));
  var slopeStd=vr?cov2/vr:null;
  var slopePerUnit=slopeStd!=null?slopeStd/tsd:null;
  /* Curve over the observed dose range, so non-linearity is visible rather than assumed away. */
  var qs=[0.1,0.3,0.5,0.7,0.9].map(function(q){
    var sorted=rows.map(function(r){return r.T;}).sort(function(a2,b2){return a2-b2;});
    return sorted[Math.min(sorted.length-1,Math.floor(q*sorted.length))];
  });
  var curve=qs.map(function(dose){
    var near=rows.filter(function(r){return Math.abs(r.T-dose)<=tsd*0.5;});
    return {dose:round(dose,1),n:near.length,
      outcome:near.length>=3?round(mean(near.map(function(r){return r.Y;})),3):null};
  });
  var resSd=Math.sqrt(Math.max(0,mean(rows.map(function(r){return Math.pow(r.Y-my,2);}))-
    (slopeStd!=null?slopeStd*slopeStd*vr:0)));
  var se=vr&&rows.length>2?resSd/Math.sqrt(vr*rows.length):null;
  return {status:'ok',cls:'EMPIRICAL',treatment:treatment,outcome:outcome,
    estimand:'dose-response slope',
    adjustedFor:adj.adjustFor,n:rows.length,
    slopePerUnit:slopePerUnit!=null?round(slopePerUnit,5):null,
    se:se!=null?round(se/tsd,5):null,
    lo:(slopePerUnit!=null&&se!=null)?round(slopePerUnit-1.96*se/tsd,5):null,
    hi:(slopePerUnit!=null&&se!=null)?round(slopePerUnit+1.96*se/tsd,5):null,
    curve:curve,doseRange:{min:round(Math.min.apply(null,rows.map(function(r){return r.T;})),1),
      max:round(Math.max.apply(null,rows.map(function(r){return r.T;})),1)},
    note:'A dose-response slope from a generalised propensity score: the dose is modelled on the covariates, and the outcome regressed on the part of the dose those covariates do NOT explain. Binarising at the median would answer "high versus low" instead, and throw away the dose.',
    caveat:'The slope is linear by construction; the curve is shown so departures from that are visible rather than assumed away. Extrapolating beyond the observed dose range is not supported by anything here.'};
}
/* ---------------- capability maturity ----------------
   Every engine carries how far it has actually been validated, so "it runs" is never mistaken for "it is
   right". The grades are deliberately hard to climb: nothing here reaches the top two, and saying so is the
   point. */
var MATURITY={
  INFRASTRUCTURE_GRADE:{rank:1,means:'the plumbing works and is tested; says nothing about whether the model is right'},
  OPERATIONAL_ANALYTICAL:{rank:2,means:'produces sensible output on real data with stated uncertainty'},
  STATISTICALLY_VALIDATED:{rank:3,means:'its uncertainty has been checked against outcomes — calibration, coverage'},
  EXPERIMENTALLY_VALIDATED:{rank:4,means:'its claims have been tested by controlled experiment on this person'},
  PRODUCTION_PREDICTIVE:{rank:5,means:'predicts prospectively at stated accuracy over a sustained period'}
};
var ENGINE_MATURITY={
  eventSourcing:'INFRASTRUCTURE_GRADE',sync:'INFRASTRUCTURE_GRADE',
  foodDatabase:'INFRASTRUCTURE_GRADE',replay:'INFRASTRUCTURE_GRADE',
  weightTrend:'OPERATIONAL_ANALYTICAL',tdeeBayes:'OPERATIONAL_ANALYTICAL',
  forecasting:'STATISTICALLY_VALIDATED',
  readiness:'OPERATIONAL_ANALYTICAL',unifiedRecovery:'OPERATIONAL_ANALYTICAL',
  effectiveSets:'INFRASTRUCTURE_GRADE',fatigueCompartments:'INFRASTRUCTURE_GRADE',
  mechanicalDemand:'INFRASTRUCTURE_GRADE',recoveryCost:'INFRASTRUCTURE_GRADE',
  recoveryAllocation:'INFRASTRUCTURE_GRADE',
  causalInference:'OPERATIONAL_ANALYTICAL',distributedLag:'OPERATIONAL_ANALYTICAL',
  shrinkage:'OPERATIONAL_ANALYTICAL',tissueDensity:'OPERATIONAL_ANALYTICAL',
  personalResponse:'OPERATIONAL_ANALYTICAL',movementEngine:'INFRASTRUCTURE_GRADE'
};
function maturityReport(){
  var rows=Object.keys(ENGINE_MATURITY).map(function(k){
    var g=ENGINE_MATURITY[k];
    return {engine:k,grade:g,rank:MATURITY[g].rank,means:MATURITY[g].means};
  }).sort(function(a,b){return b.rank-a.rank;});
  var byGrade={};
  rows.forEach(function(r){(byGrade[r.grade]=byGrade[r.grade]||[]).push(r.engine);});
  var top=rows.filter(function(r){return r.rank>=4;});
  return {rows:rows,byGrade:byGrade,engines:rows.length,
    experimentallyValidated:top.length,
    cls:'POLICY',
    note:'How far each engine has actually been validated. "Infrastructure grade" means the plumbing is tested and says nothing about whether the model is right — which is where most of the training-demand layer sits, correctly.',
    caveat:top.length?null:
      'NOTHING in this system is experimentally or prospectively validated. Every engine is at best statistically checked against its own record. That is the honest ceiling for an app that has never run a controlled trial, and it should stay visible rather than being something a user has to infer.'};
}
/* ---------------- reproducible run identity ----------------
   A run id was an execution counter. Two identical analyses got different ids and two different ones could
   not be told apart. A run identity is a hash of everything that determines the output. */
function _hash(str){
  /* FNV-1a, 32-bit — enough to distinguish runs, not a security primitive and not claimed to be. */
  var h=2166136261;
  for(var i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}
  return (h>>>0).toString(16).padStart(8,'0');
}
/* ---------------- STEP 6: STRONG RUN IDENTITY ----------------
   The direction is explicit: "do not use FNV-1a as the final content identity." FNV-1a is a fast 32-bit
   checksum — fine for spotting that two strings differ, useless as an identity, because at 32 bits two
   different computations collide after roughly 77,000 runs by the birthday bound. Run identity is now
   SHA-256 over a deterministically serialised descriptor. Synchronous and dependency-free, because every
   caller here is synchronous and WebCrypto is not. */
function sha256(msg){
  function rr(n,x){return (x>>>n)|(x<<(32-n));}
  var K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  var H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  /* UTF-8 encode, so a non-ASCII input hashes the same as it would anywhere else. */
  var bytes=[],str=unescape(encodeURIComponent(String(msg)));
  for(var i=0;i<str.length;i++)bytes.push(str.charCodeAt(i));
  var bitLen=bytes.length*8;
  bytes.push(0x80);
  while((bytes.length%64)!==56)bytes.push(0);
  var hi=Math.floor(bitLen/0x100000000),lo=bitLen>>>0;
  [hi>>>24,(hi>>>16)&255,(hi>>>8)&255,hi&255,lo>>>24,(lo>>>16)&255,(lo>>>8)&255,lo&255]
    .forEach(function(b){bytes.push(b);});
  for(var off=0;off<bytes.length;off+=64){
    var W=new Array(64);
    for(var t=0;t<16;t++)W[t]=(bytes[off+t*4]<<24)|(bytes[off+t*4+1]<<16)|(bytes[off+t*4+2]<<8)|bytes[off+t*4+3];
    for(t=16;t<64;t++){
      var s0=rr(7,W[t-15])^rr(18,W[t-15])^(W[t-15]>>>3);
      var s1=rr(17,W[t-2])^rr(19,W[t-2])^(W[t-2]>>>10);
      W[t]=(W[t-16]+s0+W[t-7]+s1)|0;
    }
    var a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
    for(t=0;t<64;t++){
      var S1=rr(6,e)^rr(11,e)^rr(25,e),ch=(e&f)^(~e&g);
      var t1=(h+S1+ch+K[t]+W[t])|0;
      var S0=rr(2,a)^rr(13,a)^rr(22,a),mj=(a&b)^(a&c)^(b&c);
      var t2=(S0+mj)|0;
      h=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;
    }
    H[0]=(H[0]+a)|0;H[1]=(H[1]+b)|0;H[2]=(H[2]+c)|0;H[3]=(H[3]+d)|0;
    H[4]=(H[4]+e)|0;H[5]=(H[5]+f)|0;H[6]=(H[6]+g)|0;H[7]=(H[7]+h)|0;
  }
  return H.map(function(x){return (x>>>0).toString(16).padStart(8,'0');}).join('');
}
/* Deterministic serialisation: keys sorted at every depth, so {a,b} and {b,a} hash identically. A run
   identity built on JSON.stringify would change with property insertion order, which is not a change in
   the computation. */
function canonicalJSON(v){
  if(v===null||typeof v!=='object')return JSON.stringify(v===undefined?null:v);
  if(Array.isArray(v))return '['+v.map(canonicalJSON).join(',')+']';
  return '{'+Object.keys(v).sort().filter(function(k){return v[k]!==undefined;})
    .map(function(k){return JSON.stringify(k)+':'+canonicalJSON(v[k]);}).join(',')+'}';
}
/* ---------------- STEP 8: VERSION VECTOR ----------------
   Seven identities that were one. An application change does not imply a model change; a food-database
   change invalidates food-dependent calculations and nothing else. Collapsing them into a build number
   meant every release invalidated everything, which is the same as invalidating nothing precisely. */
var MODEL_VERSIONS={};
function versionVector(modelId){
  return {
    applicationVersion:(typeof APP_VERSION!=='undefined')?APP_VERSION:'unknown',
    schemaVersion:(typeof SCHEMA_VERSION!=='undefined')?SCHEMA_VERSION:0,
    ontologyVersion:ONTOLOGY_VERSION,
    modelVersion:(modelId&&MODEL_VERSIONS[modelId])||(modelId&&ENGINE_MATURITY&&ENGINE_MATURITY[modelId]?'1':'1'),
    referenceDataVersion:REFERENCE_DATA_VERSION,
    foodDatabaseVersion:(typeof FOOD_DB_VERSION!=='undefined')?FOOD_DB_VERSION:'fdc-2026-04',
    adapterVersion:ADAPTER_VERSION
  };
}
var ONTOLOGY_VERSION='2026.09.1';
var REFERENCE_DATA_VERSION='ah102-537/fdc-354';
var ADAPTER_VERSION='1';
/* What each kind of version change invalidates — the rules the direction states, made executable. */
var VERSION_INVALIDATES={
  applicationVersion:[],
  schemaVersion:['all-materialised'],
  ontologyVersion:['semantic-migration-check'],
  modelVersion:['that-model-and-its-dependents'],
  referenceDataVersion:['reference-dependent'],
  foodDatabaseVersion:['food-dependent'],
  adapterVersion:['affected-imports']
};
function runIdentity(spec){
  spec=spec||{};
  var vv=versionVector(spec.model);
  var descriptor={
    modelId:spec.model||null,
    modelVersion:spec.modelVersion||vv.modelVersion,
    schemaVersion:vv.schemaVersion,
    ontologyVersion:vv.ontologyVersion,
    referenceDataVersion:spec.referenceVersion||vv.referenceDataVersion,
    foodDatabaseVersion:vv.foodDatabaseVersion,
    adapterVersion:vv.adapterVersion,
    canonicalizedInputs:spec.inputs||{},
    dependencyVersions:(spec.dependencies||[]).slice().sort(),
    configuration:spec.params||{},
    seed:spec.seed!=null?spec.seed:null,
    asOf:spec.asOf||asOf()
  };
  var canonical=canonicalJSON(descriptor);
  var digest=sha256(canonical);
  return {runId:digest.slice(0,16),digest:digest,algorithm:'sha256',
    descriptor:descriptor,canonical:canonical,versionVector:vv,
    components:descriptor,
    note:'SHA-256 over a key-sorted serialisation of everything that determines the output \u2014 model and its version, schema, ontology, reference data, food database, adapter, inputs, dependency versions, configuration and as-of date.',
    caveat:'A reproducible identity makes a difference DETECTABLE; it is not reproducible output on its own \u2014 that also needs the model to be deterministic, which is asserted separately.'};
}
/* Hierarchical N-of-1, as an actual posterior rather than shrinkage weights. */
function poolNofOneBayes(variable){
  var runs=(DB.experiments||[]).filter(function(e){
    return e.status==='complete'&&e.variable===variable&&e.effect!=null;});
  if(runs.length<2)return {status:'insufficient',method:'empiricalBayes',posterior:'approximate',runs:runs.length,
    need:[(2-runs.length)+' more completed run(s)'],
    note:'A hierarchical model needs repeats. One run has nothing to borrow strength from.'};
  var h=empiricalBayesPool(runs.map(function(r){
    return {id:r.id,value:r.effect,sd:r.se!=null?r.se:Math.abs(r.effect||1)*0.5};}));
  if(h.status!=='ok')return h;
  /* The predictive for a NEW run, which is what someone deciding whether to repeat actually wants. */
  var predSd=Math.sqrt(Math.pow(h.hyperSd,2)+h.betweenVariance+h.withinVariance);
  return Object.assign({},h,{variable:variable,runs:runs.length,
    nextRunPredictive:{mean:h.hyperMean,sd:round(predSd,3),
      lo:round(h.hyperMean-1.96*predSd,3),hi:round(h.hyperMean+1.96*predSd,3),
      note:'What a NEW run should be expected to produce, carrying both the uncertainty in the underlying effect and the variability between runs. It is wider than the pooled estimate, and should be.'},
    note:'Empirical Bayes, not a full posterior: the between-run variance is estimated once and plugged in, so the predictive is narrower than the truth. poolNofOneFullBayes() integrates over it.'});
}

/* §13 audit: every Bayesian result names its method and whether its posterior is full or approximate, and
   empirical Bayes can never claim to be full. Run against real calls rather than declarations, so a function
   that forgets to label one of its return paths is caught. */
var BAYES_METHODS={conjugateNormal:'full',hierarchicalBayes:'full',empiricalBayes:'approximate'};
function bayesianLabelAudit(){
  var u=[{id:'a',value:1.2,sd:0.4},{id:'b',value:0.8,sd:0.5},{id:'c',value:1.0,sd:0.3}];
  var cases=[
    ['bayesUpdate ok',bayesUpdate({prior:{mean:0,sd:1},observations:[{value:1,sd:1}]})],
    ['bayesUpdate prior-only',bayesUpdate({prior:{mean:0,sd:1},observations:[]})],
    ['empiricalBayesPool ok',empiricalBayesPool(u)],
    ['empiricalBayesPool insufficient',empiricalBayesPool([u[0]])],
    ['hierarchicalPosterior ok',hierarchicalPosterior(u)],
    ['hierarchicalPosterior insufficient',hierarchicalPosterior([u[0]])],
    ['poolNofOneBayes',poolNofOneBayes('__none__')],
    ['poolNofOneFullBayes',poolNofOneFullBayes('__none__')],
    ['tdeeBayes',tdeeBayes()]
  ];
  var issues=[];
  cases.forEach(function(c){
    var r=c[1]||{};
    if(r.status==='no-prior')return;
    if(!r.method)issues.push(c[0]+': no method declared');
    else if(!BAYES_METHODS[r.method])issues.push(c[0]+': unknown method "'+r.method+'"');
    if(!r.posterior)issues.push(c[0]+': does not say whether its posterior is full or approximate');
    if(r.method&&BAYES_METHODS[r.method]&&r.posterior&&r.posterior!==BAYES_METHODS[r.method])
      issues.push(c[0]+': '+r.method+' presented as a '+r.posterior+' posterior');
  });
  return {checked:cases.length,issues:issues,ok:issues.length===0,
    note:'An approximation must never be presented as a full posterior. Empirical Bayes is approximate by construction, because it conditions on a point estimate of the between-unit variance.'};
}