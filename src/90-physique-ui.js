/* Physique on screen (the model is 64-physique.js). */
function _statusTone(s){return s==='on track'?'good':(s==='lagging'||s==='under-trained'?'attention':'neutral');}
function physiqueCard(){var P=physiqueModel(),R=P.regions.filter(function(r){return r.sets>0||r.priority;}).slice(0,8);if(!R.length)return '';
  var body=R.map(function(r){return uiRow(esc(r.label)+(r.priority?' '+uiPill('priority','attention'):''),r.sets+' sets/wk',{sub:esc((r.strength?('strength '+(r.strength.pctPerMonth>0?'+':'')+r.strength.pctPerMonth+'%/month \u00b7 '):'')+r.why),rsub:r.status});}).join('');
  try{var BC=bodyCompositionState();if(BC.status==='ok')body+=uiRow('Fat and lean',(BC.fatRate.mean>0?'+':'')+BC.fatRate.mean+' / '+(BC.leanRate.mean>0?'+':'')+BC.leanRate.mean+' lb a week',
    {sub:esc(BC.reading),rsub:Math.round(BC.measuredShare*100)+'% measured'});}catch(e){_q(e,'P2');}
  if(P.rate.status==='ok')body+=uiRow('Rate of change',(P.rate.pctPerWeek>0?'+':'')+P.rate.pctPerWeek+'% a week',{sub:esc(P.rate.phase+': '+P.rate.state),rsub:'range '+P.rate.range.join(' to ')+'%'});
  if(P.suggestions.length)body+='<div class="hint">'+esc(P.suggestions.slice(0,2).map(function(s){return s.text;}).join('; '))+'.</div>';
  return uiCard({title:'Physique',sub:R.filter(function(r){return r.status==='lagging';}).length?'a region is lagging':(physiquePriorities().length?'priorities: '+physiquePriorities().map(function(m){return MUSCLE_GROUPS[m];}).join(', '):'by region'),
    body:body+'<div class="btn-row">'+uiBtn('Priorities and detail','physique.open',null,'btn-sm btn-secondary')+'</div>'});}
registerAction('physique.open',function(){openSheet('edit',{form:'physique',title:'Physique by region',desc:'',buf:{}});});
registerAction('physique.priority',function(m){var P=physiquePriorities().slice(),i=P.indexOf(m);if(i>=0)P.splice(i,1);else{if(P.length>=3){toast('Up to three priorities: remove one first');return;}P.push(m);}
  DB.settings.physiquePriorities=P;save('settings');renderSheet();renderAll();});
SHEETS.physique=function(){var P=physiqueModel(),pri=physiquePriorities(),out='<div class="card-title">Priorities (up to three)</div><div class="btn-row wrap">'+
  Object.keys(MUSCLE_GROUPS).map(function(m){return uiBtn(MUSCLE_GROUPS[m],'physique.priority',m,'btn-sm '+(pri.indexOf(m)>=0?'btn-primary':'btn-ghost'));}).join('')+'</div>';
  out+='<div class="card-title" style="margin-top:10px">By region (last four weeks)</div>'+P.regions.map(function(r){return uiRow(esc(r.label),uiPill(r.status,_statusTone(r.status)),{sub:esc(r.sets+' sets/wk, '+r.frequency+'\u00d7 a week'+(r.strength?' \u00b7 strength '+r.strength.pctPerMonth+' \u00b1 '+round(2*r.strength.se,1)+'%/month':'')+(r.size&&r.size.perMonth!=null?' \u00b7 '+r.size.measure+' '+r.size.perMonth+'/month':'')+' \u00b7 '+r.why)});}).join('');
  if(P.suggestions.length)out+='<div class="card-title" style="margin-top:10px">Where to add or take sets</div>'+P.suggestions.map(function(s){return uiRow(esc(s.text),'',{sub:esc(s.why)});}).join('');
  if(P.redundancy.length)out+='<div class="card-title" style="margin-top:10px">Overlap</div>'+P.redundancy.map(function(x){return uiRow(esc(x.note),'',{sub:esc(x.exercises.join(', '))});}).join('');
  if(P.rate.status==='ok')out+='<div class="card-title" style="margin-top:10px">Rate of change</div>'+uiRow(esc(P.rate.phase),(P.rate.pctPerWeek>0?'+':'')+P.rate.pctPerWeek+'% a week',{sub:esc(P.rate.state+' \u00b7 '+P.rate.basis)});
  var B=P.bodyComposition;if(B.methods.length)out+='<div class="card-title" style="margin-top:10px">Body fat, by method</div>'+B.methods.map(function(m){return uiRow(esc(m.method),m.latest+'%',{sub:esc(m.n+' readings \u00b7 '+(m.trendPerMonth!=null?m.trendPerMonth+' points/month':'no trend yet')+(m.leanPerMonth!=null?' \u00b7 lean '+m.leanPerMonth+'/month':'')+' \u00b7 '+m.note)});}).join('')+
    (B.offsets.length?'<div class="hint">'+esc(B.offsets.map(function(o){return o.between.join(' vs ')+': '+o.offset+' points apart on '+o.pairs+' near dates';}).join('; '))+'</div>':'')+
    (B.unspecified?'<div class="hint">Some readings do not say how they were measured. Choose the method when logging, so each is compared only with its own kind.</div>':'')+'<div class="prov">'+esc(B.rule)+'</div>';
  out+='<div class="prov">'+esc(P.range.source)+'. '+esc(P.limits)+'</div>';
  return {body:out,foot:'<button class="btn btn-secondary" data-act="edit.close">Close</button>'};};
