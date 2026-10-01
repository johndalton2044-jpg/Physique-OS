/* ============================================================================
   PERSONAL RESPONSE MODEL (audit §77, phase 6): intervention \u00d7 person \u00d7 context \u00d7 dose \u00d7 duration \u00d7 adherence \u00d7
   outcome \u00d7 uncertainty. For each intervention\u2013outcome pair, a population prior per unit of dose is updated by this
   person's own Response records (normal\u2013normal): each response's effect per unit of dose actually carried out, weighted
   by its standard error; provisional responses count half. The result is "what this change does for you", with how
   much of it rests on your own data. The bridge from adaptive rules to personalised adaptation.
   ============================================================================ */
/* priors per unit of dose (per day, sustained), with a relative SD; null mean = no population figure (centred on zero, wide) */
function RESPONSE_PRIORS(){var kg=typeof _kgNow==='function'?(_kgNow()||90):90;return {
  'calories\u2192weight':{perUnit:7/3500,sdAbs:0.3*7/3500,scale:100,label:'per 100 kcal a day',unit:'lb/week',basis:'energy arithmetic: about 3,500 kcal per lb'},
  'steps\u2192weight':{perUnit:-0.0005*kg*7/3500,sdAbs:0.5*0.0005*kg*7/3500,scale:1000,label:'per 1,000 steps a day',unit:'lb/week',basis:'about 0.5 kcal per step per kg of body weight'},
  'training days\u2192weight':{perUnit:0,sdAbs:0.3,scale:1,label:'per training day a week',unit:'lb/week',basis:'no reliable population figure: centred on no effect'},
  'protein\u2192hunger':{perUnit:0,sdAbs:0.03,scale:20,label:'per 20 g of protein a day',unit:'hunger points',basis:'no reliable population figure: centred on no effect'}};}
function _respKey(r){return r.variable+'\u2192'+(r.outcome||'?');}
function _respContext(r){var ph=(DB.phases||[]).filter(function(p){return p.startDate<=r.start&&(!p.endDate||p.endDate>=r.start);})[0];return ph?ph.type:'unknown';}
/* one response \u2192 an estimate per unit of dose carried out */
function _perUnit(r){var P=r.primary;if(!P||r.dose==null||!r.dose||P.se==null||r.stage==='pending')return null;
  var s=r.adherence&&r.adherence.share!=null?Math.max(0.3,r.adherence.share):1;   /* a change done on 60% of days delivered 60% of the dose */
  var y=P.effect/(r.dose*s),se=Math.abs(P.se/(r.dose*s))*(r.stage==='provisional'?Math.SQRT2:1);   /* provisional counts half (variance doubled) */
  return {id:r.id,y:y,se:Math.max(se,1e-9),stage:r.stage,context:_respContext(r),start:r.start,adherence:s};}
function _posterior(prior,obs){var pm=prior?prior.perUnit:0,pv=prior?prior.sdAbs*prior.sdAbs:1;
  var prec=1/pv,num=pm/pv;obs.forEach(function(o){prec+=1/(o.se*o.se);num+=o.y/(o.se*o.se);});
  var dataPrec=obs.reduce(function(a,o){return a+1/(o.se*o.se);},0);return {mean:num/prec,sd:Math.sqrt(1/prec),personalWeight:dataPrec/prec};}
function personalResponseModel(opts){opts=opts||{};var PR=RESPONSE_PRIORS(),by={};
  (DB.responses||[]).forEach(function(r){if(opts.excludeId&&(r.id===opts.excludeId||r.interventionId===opts.excludeId))return;var u=_perUnit(r);if(!u)return;(by[_respKey(r)]=by[_respKey(r)]||[]).push(u);});
  var keys=Object.keys(PR).concat(Object.keys(by).filter(function(k){return !PR[k];}));
  var rows=keys.map(function(k){var prior=PR[k]||{perUnit:0,sdAbs:null,scale:1,label:'per unit',unit:'',basis:'no population figure'},obs=by[k]||[];
    if(prior.sdAbs==null){var spread=obs.length?Math.max.apply(null,obs.map(function(o){return Math.abs(o.y)+2*o.se;})):1;prior=Object.assign({},prior,{sdAbs:spread*2});}   /* wide, scaled to the data */
    var post=_posterior(prior,obs),sc=prior.scale;
    var ctx={};obs.forEach(function(o){(ctx[o.context]=ctx[o.context]||[]).push(o);});
    var contexts=Object.keys(ctx).filter(function(c){return ctx[c].length>=2;}).map(function(c){var p=_posterior(prior,ctx[c]);return {context:c,n:ctx[c].length,mean:round(p.mean*sc,3),sd:round(p.sd*sc,3)};});
    var differs=contexts.length>=2&&contexts.some(function(a){return contexts.some(function(b){return a!==b&&Math.abs(a.mean-b.mean)>2*Math.sqrt(a.sd*a.sd+b.sd*b.sd);});});
    return {key:k,variable:k.split('\u2192')[0],outcome:k.split('\u2192')[1],label:prior.label,unit:prior.unit,n:obs.length,finals:obs.filter(function(o){return o.stage==='final';}).length,
      prior:{mean:round(prior.perUnit*sc,3),sd:round(prior.sdAbs*sc,3),basis:prior.basis},
      personal:obs.length?{mean:round(obs.reduce(function(a,o){return a+o.y/(o.se*o.se);},0)/obs.reduce(function(a,o){return a+1/(o.se*o.se);},0)*sc,3)}:null,
      posterior:{mean:round(post.mean*sc,3),sd:round(post.sd*sc,3)},personalWeight:round(post.personalWeight,2),contexts:contexts,contextsDiffer:differs,
      verdict:!obs.length?'no personal data yet: the population figure':(post.personalWeight>=0.5?'mostly your own data':'still mostly the population figure')};});
  return {status:'ok',cls:'EMPIRICAL',rows:rows,responses:(DB.responses||[]).length,method:'normal\u2013normal update of a population prior per unit of dose by your Response records; adherence-adjusted; provisional responses count half',
    limits:'Assumes the effect scales with dose and is steady over time; context splits need at least two responses each.'};}
/* what a change of this size is expected to do for this person */
function predictResponse(variable,outcome,dose,opts){opts=opts||{};var M=personalResponseModel({excludeId:opts.excludeId}),row=M.rows.filter(function(r){return r.variable===variable&&r.outcome===outcome;})[0];
  if(!row||dose==null)return null;var c=opts.context&&row.contexts.filter(function(x){return x.context===opts.context;})[0],src=c||row.posterior,per=dose/(RESPONSE_PRIORS()[row.key]?RESPONSE_PRIORS()[row.key].scale:1);
  var m=src.mean*per,s=Math.abs(src.sd*per);return {mean:round(m,3),lo:round(m-2*s,3),hi:round(m+2*s,3),unit:row.unit,n:row.n,personalWeight:row.personalWeight,
    basis:row.n?('your '+row.n+' earlier response'+(row.n===1?'':'s')+' with the population figure ('+Math.round(row.personalWeight*100)+'% yours)'+(c?', in '+c:'')):row.prior.basis};}
(function(){if(typeof MODELS==='undefined'||MODELS.some(function(m){return m.id==='personal_response';}))return;
  MODELS.push({id:'personal_response',name:'Personal response model',cls:'EMPIRICAL',version:'1.0',inputs:['weight','hunger','steps','calories'],minN:1,
    assumes:['the effect scales with dose','the effect is steady over time','responses are independent'],failsWhen:['fewer than one response per change','a change that interacts with another at the same time'],
    output:'the expected effect of a change for this person, per unit of dose, with its uncertainty and how much rests on their own data',consumers:['predictResponse','evaluateResponse'],freshnessDays:7,
    uncertainty:{kind:'posterior standard deviation'},fn:'personalResponseModel'});})();
