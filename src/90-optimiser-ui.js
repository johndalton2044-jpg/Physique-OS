/* The unified optimiser on the Plan tab (the model is 73-unified-optimiser.js). */
function optimiserCard(){var O=unifiedOptimiser();if(O.status!=='ok'||!O.pareto.length)return '';var R=O.recommended;
  var row=function(r,i){return '<div class="feat"><div class="feat-body"><b>'+esc(r.label)+'</b>'+(i===0?' '+uiPill('suggested','good'):'')+
    '<div class="hint">'+esc((r.effective>0?'+':'')+r.effective+' lb a week expected (\u00b1'+round(2*r.sd,2)+'), allowing for a '+Math.round(r.pAll*100)+'% chance of carrying it all out \u00b7 '+r.minutes+' min a week \u00b7 '+Math.round(r.robustness*100)+'% likely to move the right way')+'</div>'+
    (r.risk.length?'<div class="hint">'+esc(r.risk.join('; '))+'</div>':'')+'</div>'+uiBtn('Use this','opt.apply',String(i),'btn-sm '+(i===0?'btn-primary':'btn-secondary'))+'</div>';};
  var prefs=[['balanced','Balanced'],['effort','Least effort'],['time','Least time'],['fastest','Fastest within range']];
  return uiCard({fold:'plan-options',title:'Options for the next two weeks',sub:R?esc(R.label):'',body:'<div class="hint">To '+esc(O.goal)+': '+O.searched+' combinations weighed, '+O.feasible+' fit your time and the safe range; these are the ones nothing beats on every count.</div>'+
    '<div class="chips">'+prefs.map(function(p){return '<button type="button" class="chip sm'+(O.preference===p[0]?' active':'')+'" data-act="opt.pref" data-arg="'+p[0]+'">'+p[1]+'</button>';}).join('')+'</div>'+
    O.pareto.slice(0,5).map(row).join('')+'<div class="prov">'+esc(O.method)+'. Assumes '+esc(O.assumptions.join('; '))+'. '+esc(O.limits)+'</div>'});}
registerAction('opt.pref',function(p){DB.settings.optimiserPreference=p;save('settings');renderAll();});
registerAction('opt.apply',function(i){var O=unifiedOptimiser(),r=O.pareto[+i];if(!r)return;var res=applyOptimiserChoice(r);renderAll();toast(res.status==='ok'?('Plan updated: '+r.label+'. Its effect will be judged after 7 and 21 days.'):'Could not apply that',{undo:res.status==='ok'});});
