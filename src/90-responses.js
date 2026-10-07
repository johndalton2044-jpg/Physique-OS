/* Responses on screen (the entity is in 58-response-entity.js; actions and sheets need the registry, defined in 90-actions.js). */
/* ---- on screen ---- */
function _respLabel(r){var v=r.variable,d=r.dose;return (v.charAt(0).toUpperCase()+v.slice(1))+(d!=null?(' '+(d>0?'+':'')+(Math.abs(d)>=100?Math.round(d).toLocaleString():d)+(v==='steps'?' a day':(v==='calories'?' kcal':''))):'')+' ('+r.kind+', '+shortDate(r.start)+')';}
function _respEffect(r){var P=r.primary;if(!P)return '\u2014';return (P.effect>0?'+':'')+P.effect+' \u00b1 '+round(2*P.se,2)+(P.unit?' '+P.unit:'');}
function responsesCard(){var R=responsesOf();if(!R.length)return '';
  return uiFold('learn-responses','What happened because of it',R.length+' change'+(R.length===1?'':'s')+' evaluated',
    R.slice(0,6).map(function(r){return uiRow(esc(_respLabel(r)),esc(_respEffect(r)),{sub:esc(r.verdict+(r.expectation?' \u00b7 '+r.expectation:'')+(r.adherence&&r.adherence.share!=null?' \u00b7 done on '+Math.round(r.adherence.share*100)+'% of days':'')+(r.unintended&&r.unintended.length?' \u00b7 '+r.unintended.map(function(u){return u.text;}).join(', '):'')),rsub:r.stage+' \u00b7 '+r.confidence+' confidence'})+
      '<div class="btn-row">'+uiBtn('Details','responses.open',r.id,'btn-sm btn-ghost')+'</div>';}).join('')+
    '<div class="prov">Each change is compared with the trend before it, continued. Provisional after 7 days, final after 21.</div>'+_howYouRespond());}
function _howYouRespond(){var M=personalResponseModel(),rows=M.rows.filter(function(r){return r.n>0;});if(!rows.length)return '';
  return '<div class="card-title" style="margin-top:10px">How you respond</div>'+rows.map(function(r){var p=r.posterior;
    return uiRow(esc(r.variable+' \u2192 '+r.outcome+', '+r.label),esc((p.mean>0?'+':'')+p.mean+' \u00b1 '+round(2*p.sd,3)+' '+r.unit),{sub:esc('population '+(r.prior.mean>0?'+':'')+r.prior.mean+' \u00b7 '+Math.round(r.personalWeight*100)+'% your own data from '+r.n+' change'+(r.n===1?'':'s')+(r.contextsDiffer?' \u00b7 differs by phase: '+r.contexts.map(function(c){return c.context+' '+c.mean;}).join(', '):''))});}).join('')+
    '<div class="prov">'+esc(M.method)+'. '+esc(M.limits)+'</div>';}
registerAction('responses.open',function(id){openSheet('edit',{form:'response',title:'What happened because of it',desc:'',buf:{id:id}});});
SHEETS.response=function(b){var r=(DB.responses||[]).filter(function(x){return x.id===b.id;})[0];if(!r)return {body:'<div class="hint">That response is no longer in the record.</div>',foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};
  var P=r.primary,out=uiRow('Change',esc(_respLabel(r)))+uiRow('Stage',esc(r.stage),{sub:'evaluated '+esc(String(r.evaluatedAt).slice(0,10))+' \u00b7 version '+(r.version||1)+(r.previous?(', replacing the '+esc(r.previous.stage)+' one ('+esc(r.previous.modelVersion)+(r.previous.effect!=null?', '+r.previous.effect:'')+')'):'')})+uiRow('Verdict',esc(r.verdict),{sub:r.confidence+' confidence'});
  /* the exposure actually received, beside what was planned and what came before (Stage B) */
  var _E=exposuresOf().filter(function(e){return e.id===r.exposureId;})[0];
  if(_E)out+=uiRow('Received',fmtNum(_E.received,_E.received%1?2:0)+' '+esc(_E.unit),{sub:esc([_E.planned!=null?'planned '+fmtNum(_E.planned,0):null,_E.before!=null?fmtNum(_E.before,_E.before%1?2:0)+' before':null,_E.coverage!=null?'logged on '+Math.round(_E.coverage*100)+'% of days':null].filter(Boolean).join('; '))});
  if(r.adherence)out+=uiRow('Carried out',r.adherence.share!=null?Math.round(r.adherence.share*100)+'% of days':'\u2014',{sub:esc(r.adherence.daysMet+' of '+r.adherence.daysLogged+' logged days '+r.adherence.rule)});
  if(P)out+=uiRow(esc(P.quantity)+' before',esc(String(P.before)+(P.unit?' '+P.unit:'')))+uiRow('after',esc(String(P.after)+(P.unit?' '+P.unit:'')))+uiRow('Effect',esc(_respEffect(r)),{sub:esc(P.method)});
  if(r.expected)out+=uiRow('Expected',esc(round(Math.min(r.expected.lo,r.expected.hi),2)+' to '+round(Math.max(r.expected.lo,r.expected.hi),2)+' '+r.expected.unit),{sub:esc(r.expected.basis+' \u00b7 '+(r.expectation||''))});
  if(r.placebo)out+=uiRow('Already under way?',r.placebo.alreadyUnderWay?'yes':'no',{sub:'the same comparison a week earlier: '+r.placebo.effect+' \u00b1 '+round(2*r.placebo.se,2)});
  /* the causal estimates beside it (Stage E): computed now for records judged before they existed */
  var C=r.causal||(P&&typeof responseCausal==='function'?responseCausal(r):null),u=P&&P.unit?' '+P.unit:'';
  if(C){var I=C.interrupted,M=C.matched;
    out+=uiRow('Allowing for carry-over',I&&I.effect!=null?esc((I.effect>0?'+':'')+I.effect+' \u00b1 '+round(2*I.se,2)+u):'\u2014',{sub:esc(I&&I.effect!=null?('interrupted series, '+I.quantity+'; day-to-day carry-over '+I.autocorrelation+' \u00b7 '+I.verdict):'not enough readings either side')});
    out+=uiRow('Against comparable periods',M.status==='ok'?esc((M.estimate>0?'+':'')+M.estimate+' \u00b1 '+round(M.interval95[1]-M.estimate,2)+u):'\u2014',{sub:esc(M.status==='ok'?(M.verdict+'; '+M.periods+' periods without a change moved '+(M.nullMean>0?'+':'')+M.nullMean+' on their own'):(M.need||[]).join('; '))});
    out+=uiRow('Do the estimates agree?',C.agree==null?'\u2014':(C.agree?'yes':'no'),{sub:esc(C.agreement)});}
  /* what would have happened without it (Stage F), day by day, beside what was measured */
  var CF=P&&typeof responseCounterfactual==='function'?responseCounterfactual(r):null;
  if(CF&&CF.status==='ok'){var e=CF.end;
    out+=uiRow('Without the change',esc(fmtNum(e.counterfactual.mean,1)+(CF.unit?' '+CF.unit:'')),{sub:esc(CF.text+'; the change made '+(e.difference.mean>0?'+':'')+e.difference.mean+(CF.unit?' '+CF.unit:'')+' ('+e.difference.lo+' to '+e.difference.hi+') by '+shortDate(e.date)+' \u00b7 '+CF.basis)});
    out+=svgChart({height:120,aria:'what would have happened without the change, beside what was measured',series:[
      {type:'band',uncertaintyType:'forecast',pts:CF.path.map(function(p){return {x:p.x,lo:p.lo,hi:p.hi};})},
      {type:'line',cls:'pred',epistemic:'PREDICTIVE',pts:CF.path.map(function(p){return {x:p.x,y:p.mean};})},
      {type:'dots',pts:CF.before.concat(CF.actual).map(function(p){return {x:p.x,y:p.value};})}],
      xMarkers:[{x:0,label:'change'}]})+chartLegend([['obs','measured'],['pred','without the change (80% band)']]);}
  out+=uiRow('Unintended effects',r.unintended&&r.unintended.length?esc(r.unintended.map(function(u){return u.text+' ('+(u.change>0?'+':'')+u.change+')';}).join(', ')):'none detected');
  if(r.burden)out+=uiRow('Burden',esc(r.burden.note));out+=uiRow('Reversible',esc(r.reversible||'\u2014'));
  if(r.followedBy&&(r.followedBy.planVersions.length||r.followedBy.decisions.length))out+=uiRow('What followed',esc((r.followedBy.planVersions.length?'plan version '+r.followedBy.planVersions.join(', '):'')+(r.followedBy.decisions.length?' \u00b7 '+r.followedBy.decisions.length+' decision(s)':'')));
  return {body:out,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
/* WHAT GETS IN THE WAY: friction per plan item, clear factors first */
function frictionCard(){var M=frictionModel(),rows=M.items.filter(function(i){return i.status==='ok';});if(!rows.length)return '';
  return uiFold('learn-friction','What gets in the way',rows.map(function(i){return i.item+' '+Math.round(i.rate*100)+'%';}).join(' \u00b7 '),
    rows.map(function(i){var f=(i.factors||[]).filter(function(x){return x.oddsRatio<1;}),clear=f.filter(function(x){return x.clear;});
      var txt=!i.factors||!i.factors.length?(i.note||'nothing measurable gets in the way'):(clear.length?clear.map(function(x){return x.label+' (odds \u00d7'+x.oddsRatio+')';}).join(', '):(f.length?'possibly '+f[0].label+' (odds \u00d7'+f[0].oddsRatio+', not clear yet)':'no factor lowers it'));
      return uiRow(esc(i.item),Math.round(i.rate*100)+'% of '+i.n+' days',{sub:esc(txt)});}).join('')+'<div class="prov">'+esc(M.method)+'. '+esc(M.limits)+'</div>');}
/* WHICH FORECAST TO TRUST: the model competitions */
function competitionCard(){var out=[];Object.keys(MODEL_COMPETITIONS).forEach(function(id){var E=evaluateCompetition(id);if(E.status!=='ok')return;var h=E.horizons[E.horizons.length-1];
    out.push('<div class="card-title" style="margin-top:6px">'+esc(E.label)+' ('+h+' days ahead)</div>'+(E.warning?'<div class="hint">'+esc(E.warning)+'</div>':'')+
      E.rows.map(function(r){var m=r.metrics[h],st=E.states[r.candidate]||'EXPERIMENTAL';return uiRow(esc(r.label),m?('\u00b1'+m.mae+' '+E.unit):'\u2014',{sub:esc(m?('bias '+(m.bias>0?'+':'')+m.bias+' \u00b7 80% interval held '+Math.round(m.coverage*100)+'% of the time'+(Math.abs(m.scale-1)>0.05?' ('+(m.scale>1?'widened':'narrowed')+' \u00d7'+m.scale+' to calibrate'+(m.calibratedCoverage!=null?': '+Math.round(m.calibratedCoverage*100)+'% on newer forecasts':'')+')':'')+(m.recentMae!=null?' \u00b7 last 30 days \u00b1'+m.recentMae:'')+' \u00b7 '+m.n+' forecasts'):'too few forecasts to score'),rsub:st.toLowerCase()});}).join('')+
      (E.history.length?'<div class="hint">'+esc(E.history.slice(-2).map(function(c){return c.type+': '+c.to+' ('+c.why+')';}).join('; '))+'</div>':''));});
  /* every model that makes interval predictions, on one rule (Stage H): are its intervals honest? */
  var SC=_safe(function(){return selfCalibration();},{rows:[]});
  if(out.length&&SC.rows.length)out.push('<div class="card-title" style="margin-top:8px">Are the intervals honest?</div>'+SC.rows.map(function(r){return uiRow(esc(r.label),r.coverage!=null?Math.round(r.coverage*100)+'% held':'\u2014',
    {sub:esc((r.n?r.n+' scored against '+r.against+' \u00b7 ':'')+(r.inUse?'widened \u00d7'+r.scale+' \u00b7 ':'')+r.status)});}).join('')+'<div class="prov">'+esc(SC.rule)+'.</div>');
  if(!out.length)return '';
  return uiFold('learn-competition','Which forecast to trust',Object.keys(MODEL_COMPETITIONS).map(function(id){var L=(DB.settings.modelLifecycle||{})[id];return MODEL_COMPETITIONS[id].label.split(' ')[0]+': '+(L?COMPETITION_CANDIDATES[L.primary].label.split(' (')[0]:'not scored');}).join(' \u00b7 '),
    out.join('')+'<div class="prov">Each forecast is replayed every 3 days over the last 90, using only what was known then. A challenger replaces the primary only when clearly better and calibrated; newer is not assumed better.</div>');}
/* THE LEARNING LOOP on Learn */
function loopCard(){var C=runLearningCycle(),tone={ok:'good',attention:'attention',starved:'negative'};
  var body='<div class="loop-stages">'+C.stages.map(function(s){return '<div class="loop-stage st-'+s.status+'" title="'+attrEsc(s.figure)+'"><b>'+esc(s.id)+'</b><span>'+esc(s.figure)+'</span></div>';}).join('')+'</div>';
  body+='<div class="card-title" style="margin-top:8px">What I learned about you this week</div>'+C.learned.map(function(x){return '<div class="hint">\u2022 '+esc(x)+'</div>';}).join('');
  var H=C.health;body+='<div class="card-title" style="margin-top:8px">Is the loop closing?</div>'+uiRow('Changes judged',H.judged!=null?Math.round(H.judged*100)+'% of '+H.interventions:'\u2014',{sub:H.medianDaysToVerdict!=null?'a verdict about '+H.medianDaysToVerdict+' days after a change':''})+
    (C.starved.length?'<div class="hint">Short of data: '+esc(C.starved.join(', '))+'.</div>':'');
  if(C.next&&C.next.status==='ok')body+='<div class="card-title" style="margin-top:8px">Next test</div><div class="feat"><div class="feat-body">'+esc(C.next.why)+'</div>'+uiBtn('Start','exp.fromTemplate',C.next.template,'btn-sm btn-primary')+'</div>';
  /* the portfolio behind it (Stage E): what each lever's test would teach, computed now so it is never stale */
  var PF=_safe(function(){return experimentPortfolio();},{rows:[]}).rows.filter(function(r){return r.eig!=null;});
  if(PF.length>1)body+=PF.slice(0,4).map(function(r){return uiRow(esc(r.variable+' \u2192 '+r.outcome),Math.round(r.narrowing*100)+'% narrower',{sub:esc(r.todo+' for '+Math.round(r.days/7)+' weeks \u00b7 '+r.bits+' bits'+(r.status==='ok'?'':' \u00b7 '+r.status)+(r.conflicted?' \u00b7 its findings disagree':''))});}).join('');
  return uiFold('learn-loop','The learning loop','week '+esc(C.week.split('-W')[1])+' \u00b7 '+C.stages.filter(function(s){return s.status==='ok';}).length+' of '+C.stages.length+' stages working',body+'<div class="prov">observe \u2192 understand \u2192 decide \u2192 act \u2192 measure \u2192 explain \u2192 learn \u2192 adapt \u2192 predict \u2192 test \u2192 personalize, recorded once a week</div>');}
