/* ============================================================================
   REGION: VALUE TRACES (catalogue §71–§90)
   Every number the interface shows should be able to answer: where did you come from?

   The model registry already declares inputs, assumptions, failure conditions and uncertainty. A trace walks
   that declaration for one number and resolves it against the actual record, so the answer is what produced
   THIS value on THIS day rather than a description of the method in general.

   Two rules that keep traces honest:
     * A trace never recomputes with different rules to explain itself. It reports the same call the view
       made, so an explanation cannot disagree with the thing it explains.
     * Every step carries its own epistemic class. A chain that ends in PRIOR is a chain resting on a
       population assumption, and that must be visible at the step where it enters, not just at the end.
   ============================================================================ */
var TRACES={
  weight_trend:{
    label:'Weight trend',model:'weight_trend',
    run:function(){
      var tr=weightTrend(14);
      if(tr.status!=='ok')return {status:'insufficient',need:tr.need||['more weigh-ins'],
        why:'A trend needs enough weigh-ins inside the window to separate a direction from day-to-day noise.'};
      var pb=null;try{pb=personalBaselines().streams.weight;}catch(e){}
      var steps=[
        {step:'weigh-ins used',value:tr.n+' of the last 14 days',cls:'MEASURED',
         detail:tr.excludedOffProtocol?(tr.excludedOffProtocol+' off-protocol reading(s) excluded'):'all readings on protocol',
         act:'nav.dataQuality'},
        {step:'your own scale noise',value:pb&&pb.status==='ok'?fmtWeight(pb.baseline)+' day to day':'not yet established',
         cls:'EMPIRICAL',detail:'a change smaller than this is not visible above the noise'},
        {step:'line fitted',value:fmtRate(tr.slopePerWeek),cls:'DERIVED',
         detail:'Theil\u2013Sen slope, which ignores a few extreme readings rather than being dragged by them'},
        {step:'uncertainty',value:tr.slopeSe!=null?('\u00b1'+fmtRate(tr.slopeSe*7*1.96)+' at 95%'):'not computed',
         cls:'DERIVED',detail:'from the spread of readings around the fitted line'},
        {step:'confidence reported',value:esc(tr.confidence||'\u2014'),cls:'DERIVED',
         detail:'lowered when the window is short, the readings are few, or the spread is wide'}
      ];
      return {status:'ok',value:fmtRate(tr.slopePerWeek),cls:'DERIVED',steps:steps,
        wouldChange:['more consecutive weigh-ins','a protocol change that makes past readings comparable again'],
        model:modelById('weight_trend')};
    }},
  tdee:{
    label:'Maintenance (TDEE)',model:'tdee_personal',
    run:function(){
      /* The SAME figure the interface shows. tdeePersonal() is one input to it; the displayed value may be
         calibrated on top of that. A trace explaining 2,838 beside a headline of 2,663 is precisely the
         disagreement a trace exists to make impossible. */
      var S=null;try{S=getCurrentState();}catch(e){}
      var t=(S&&S.tdee&&S.tdee.status==='ok')?S.tdee:tdeePersonal();
      if(t.status!=='ok')return {status:'insufficient',need:t.need||['overlapping intake and weight days'],
        why:'A personal maintenance figure needs logged intake and weight over the same period; until then a population equation stands in and is labelled PRIOR.'};
      var ad=adherenceState(14);
      var tr=weightTrend(14);
      var steps=[
        {step:'intake logged',value:ad.nutrition&&ad.nutrition.pct!=null?(fmtNum(ad.nutrition.pct,0)+'% of days'):'unknown',
         cls:'MEASURED',detail:'under-reporting rises as coverage falls, and this is the largest error in the chain',act:'nav.missing'},
        {step:'weight change over the window',value:tr.status==='ok'?fmtRate(tr.slopePerWeek):'not established',cls:'DERIVED',
         detail:'the direction the energy balance has to explain',trace:'weight_trend'},
        {step:'energy per pound assumed',value:'3,500 kcal',cls:'PRIOR',
         detail:'a population figure for mixed tissue; real tissue varies, which is part of the interval below'},
        {step:'fitted maintenance',value:fmtKcal(t.value),cls:t.cls,
         detail:t.basis||'intake minus the energy the weight change accounts for'},
        {step:'interval',value:t.lo!=null?(fmtKcal(t.lo)+'\u2013'+fmtKcal(t.hi)):'not computed',cls:'DERIVED',
         detail:'combines trend error, tissue-density spread and logging error'}
      ];
      if(t.cls==='CALIBRATED')steps.push({step:'calibration',value:'applied',cls:'CALIBRATED',
        detail:'corrected by comparing past forecasts against what happened',act:'nav.integrity'});
      return {status:'ok',value:fmtKcal(t.value),cls:t.cls,steps:steps,
        wouldChange:['logging intake on more days','a longer run of weigh-ins at a steady intake'],
        model:modelById('tdee_personal')};
    }},
  energy_balance:{
    label:'Energy balance',model:'energy_balance',
    run:function(){
      var eb=energyBalance();
      if(eb.status!=='ok')return {status:'insufficient',need:eb.need||['intake and a maintenance estimate'],
        why:'An energy balance is intake minus maintenance; both have to exist first.'};
      var u=uncertaintyChain();
      return {status:'ok',value:fmtKcal(eb.balance)+'/day',cls:eb.cls,
        steps:[
          {step:'mean intake',value:fmtKcal(eb.intake),cls:'MEASURED',detail:'over '+eb.n+' logged days',act:'nav.missing'},
          {step:'maintenance',value:fmtKcal(eb.tdee.value),cls:eb.tdee.cls,detail:'estimated, not measured',trace:'tdee'},
          {step:'difference',value:fmtKcal(eb.balance)+'/day',cls:'DERIVED',detail:'negative is a deficit'},
          {step:'interval',value:u.balance?(fmtKcal(u.balance.lo)+' to '+fmtKcal(u.balance.hi)):'not computed',
           cls:'DERIVED',detail:u.text||''}
        ],
        wouldChange:['more complete intake logging','a narrower maintenance interval'],
        model:modelById('energy_balance')};
    }},
  bodyfat:{
    label:'Body-fat estimate',model:'bodycomp_circ',
    run:function(){
      var bc=bodyComp();
      if(!bc.estimate||bc.estimate.status!=='ok')return {status:'insufficient',
        need:(bc.estimate&&bc.estimate.need)||['a waist and neck measurement'],
        why:'The circumference equation needs the measurements it takes as inputs.'};
      var e=bc.estimate;
      return {status:'ok',value:fmtPct(e.lo,0)+'\u2013'+fmtPct(e.hi,0),cls:'HEURISTIC',
        steps:[
          {step:'waist',value:fmtLength(e.waist.value),cls:'MEASURED',detail:'measured '+ageLabel(e.waist.date),act:'nav.dataQuality'},
          {step:'neck',value:fmtLength(e.neck.value),cls:'MEASURED',detail:'measured '+ageLabel(e.neck.date)},
          {step:'equation applied',value:fmtPct(e.bf,1),cls:'HEURISTIC',
           detail:'U.S. Navy circumference equation \u2014 a population fit, not a measurement of you'},
          {step:'range shown',value:fmtPct(e.lo,0)+'\u2013'+fmtPct(e.hi,0),cls:'HEURISTIC',
           detail:'\u00b13\u20134 points, which is the equation\u2019s error on an individual'},
          {step:'fat and lean mass',value:e.massAnchored?'split out':'not split out',cls:'HEURISTIC',
           detail:e.anchorNote||''}
        ],
        wouldChange:['one measured body-fat reading to anchor it','measuring at the same landmark and tension each time'],
        model:modelById('bodycomp_circ')};
    }},
  adherence:{
    label:'Adherence',model:'adherence',
    run:function(){
      var ad=adherenceState(14);
      if(ad.overall==null)return {status:'insufficient',need:['logged days to compare against targets'],
        why:'Adherence compares what was logged against the targets of the active phase.'};
      var steps=[];
      ['nutrition','protein','steps','training'].forEach(function(k){
        var s=ad[k];if(!s||s.pct==null)return;
        steps.push({step:k,value:fmtNum(s.pct,0)+'%',cls:'MEASURED',detail:s.detail||('over the last 14 days')});
      });
      steps.push({step:'reported overall',value:fmtNum(ad.overall,0)+'%',cls:'DERIVED',
        detail:'the streams are kept separate above, because one collapsed number hides which part slipped'});
      return {status:'ok',value:fmtNum(ad.overall,0)+'%',cls:'DERIVED',steps:steps,
        wouldChange:['logging on more days','targets that match what you are actually doing'],
        model:modelById('adherence')};
    }},
  forecast:{
    label:'Forecast',model:'weight_forecast',
    run:function(){
      var f=null;try{f=weightForecast(14);}catch(e){}
      if(!f||f.status!=='ok')return {status:'insufficient',need:['an established weight trend'],
        why:'A forecast extends the trend; without a trend there is nothing to extend.'};
      var cal=null;try{cal=calibrationByContext();}catch(e){}
      return {status:'ok',value:(f.lo!=null?fmtWeight(f.lo,{bare:true})+'\u2013'+fmtWeight(f.hi):fmtWeight(f.point)),cls:'PREDICTIVE',
        steps:[
          {step:'starting point',value:fmtWeight(f.base),cls:'DERIVED',detail:'the smoothed average, not the last reading'},
          {step:'trend extended',value:fmtRate(f.trend.slopePerWeek),cls:'DERIVED',detail:'assumes nothing else changes',trace:'weight_trend'},
          {step:'interval',value:f.lo!=null?(fmtWeight(f.lo,{bare:true})+'\u2013'+fmtWeight(f.hi)):'not computed',cls:'PREDICTIVE',
           detail:'from the slope error and your own scale noise'},
          {step:'calibration',value:cal&&cal.bias!=null?('bias '+fmtSigned(cal.bias,2)):'no scored forecasts yet',
           cls:'CALIBRATED',detail:cal?cal.basis:'',act:'nav.integrity'}
        ],
        wouldChange:['more weigh-ins','anything that changes intake or activity, which the forecast cannot know about'],
        model:modelById('weight_forecast')};
    }},
  rate_band:{
    label:'Rate band',model:'rate_band',
    run:function(){
      var b=targetRate();
      if(!b)return {status:'insufficient',need:['a current weight and an active phase'],
        why:'The band is chosen from the weight zone and the phase type.'};
      return {status:'ok',value:fmtRateRange(b.lo,b.hi),cls:b.cls||'POLICY',
        steps:[
          {step:'source',value:esc(b.source||''),cls:b.cls||'POLICY',
           detail:b.source==='user target'?'you set this':'chosen by this system for the current weight zone'},
          {step:'why a band at all',value:'0.5\u20131% of body weight per week',cls:'POLICY',
           detail:'faster loss costs more lean tissue; the boundaries are an operating choice, not a measured threshold'}
        ],
        wouldChange:['setting your own target rate on the phase','a change in body weight, which moves the zone'],
        model:modelById('rate_band')};
    }}
};
function traceValue(id){
  var t=TRACES[id];
  if(!t)return {status:'unknown',id:id,note:'no trace is registered for this value'};
  var out;
  try{out=t.run();}catch(e){_q(e,'P2');return {status:'error',id:id,note:'the trace could not be built: '+(e&&e.message)};}
  out.id=id;out.label=t.label;
  /* Where a chain rests on a population assumption, say so at the top rather than only at the step. */
  var priors=(out.steps||[]).filter(function(s){return s.cls==='PRIOR';});
  out.restsOnPrior=priors.length?priors.map(function(s){return s.step;}):null;
  return out;
}
function traceIds(){return Object.keys(TRACES);}
