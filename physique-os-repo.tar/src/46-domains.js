/* ============================================================================
   REGION: DOMAIN REGISTRY — the loop, made domain-general.

   The expansion catalogue proposes twenty-six engines. Building twenty-six of anything by hand produces
   twenty-six slightly different conventions, and the catalogue's own closing argument says why that is the
   wrong move:

     OBSERVATIONS → STATE → MODELS → UNCERTAINTY → DIAGNOSIS → DECISION → INTERVENTION
                  → EXPERIMENT → OUTCOME → PERSONAL KNOWLEDGE → NEXT DECISION

     "The domain currently surrounding that loop is primarily physique. But the loop itself is
      domain-general."

   So this registers DOMAINS against that loop rather than adding engines beside it. A domain declares what
   it observes, what it can conclude, what it would advise and what it cannot yet answer; the loop runs it.
   Adding sleep, injury, cardio, cost or inventory then costs a declaration instead of a subsystem, and every
   one of them inherits — without asking — the epistemic classes, uncertainty discipline, temporal replay,
   knowledge decay, attention queue and value-of-information machinery that already exist.

   A domain may NOT mutate the record. It returns findings and proposals; the existing mutation primitives
   and the user decide. That is the catalogue's own rule ("do not allow arbitrary direct mutation", "AI should
   produce a proposal, then a registered action") applied to every domain, including the ones I write.
   ============================================================================ */
var DOMAINS={};
var DOMAIN_ORDER=[];
/* The contract. Every field is required except the optional hooks, and registration fails loudly rather
   than producing a domain that silently contributes nothing. */
function registerDomain(def){
  var required=['id','label','observes','state'];
  var missing=required.filter(function(k){return def[k]==null;});
  if(missing.length){_q(new Error('domain '+(def&&def.id||'?')+' is missing: '+missing.join(', ')),'P1');return null;}
  if(DOMAINS[def.id]){_q(new Error('domain '+def.id+' is already registered'),'P1');return null;}
  def.priority=def.priority!=null?def.priority:50;
  DOMAINS[def.id]=def;
  DOMAIN_ORDER=Object.keys(DOMAINS).sort(function(a,b){return DOMAINS[a].priority-DOMAINS[b].priority;});
  return def;
}
function domainList(){return DOMAIN_ORDER.map(function(id){return DOMAINS[id];});}
/* ---- the loop, run across every domain ---- */
function domainStates(){
  return memo('domainStates:'+asOf(),function(){
    var out={};
    domainList().forEach(function(d){
      try{out[d.id]=d.state();}
      catch(e){_q(e,'P1');out[d.id]={status:'error',reason:String(e&&e.message||e)};}
    });
    return out;
  });
}
function domainFindings(){
  var states=domainStates(),out=[];
  domainList().forEach(function(d){
    if(!d.findings)return;
    try{
      (d.findings(states[d.id])||[]).forEach(function(f){
        /* Every finding carries its domain, its class and what it rests on. A finding without a class is
           an opinion wearing the typography of a measurement. */
        out.push({domain:d.id,domainLabel:d.label,text:f.text,cls:f.cls||'DERIVED',
          confidence:f.confidence||'low',basis:f.basis||'',severity:f.severity||'info',
          act:f.act||null,arg:f.arg||null});
      });
    }catch(e){_q(e,'P1');}
  });
  return out;
}
/* Proposals, never mutations. A domain says what it would advise; the decision lattice decides whether it
   outranks anything, and the user applies it through the ordinary registered action. */
function domainProposals(){
  var states=domainStates(),out=[];
  domainList().forEach(function(d){
    if(!d.propose)return;
    try{
      (d.propose(states[d.id])||[]).forEach(function(p){
        out.push({domain:d.id,domainLabel:d.label,verb:p.verb,why:p.why||[],
          cls:p.cls||'DERIVED',confidence:p.confidence||'low',priority:p.priority!=null?p.priority:d.priority,
          act:p.act||null,arg:p.arg||null,reverseIf:p.reverseIf||[],
          applies:p.applies!==false});
      });
    }catch(e){_q(e,'P1');}
  });
  out.sort(function(a,b){return a.priority-b.priority;});
  return out;
}
/* What each domain cannot answer yet, and what would let it. Feeds the same value-of-information machinery
   the physique domain already uses, so a new domain gets it for nothing. */
function domainGaps(){
  var states=domainStates(),out=[];
  domainList().forEach(function(d){
    if(!d.gaps)return;
    try{
      (d.gaps(states[d.id])||[]).forEach(function(g){
        out.push({domain:d.id,domainLabel:d.label,question:g.question,
          need:g.need||[],limits:g.limits||'',burden:g.burden!=null?g.burden:0.5,
          value:g.value!=null?g.value:0.5,act:g.act||null,arg:g.arg||null});
      });
    }catch(e){_q(e,'P1');}
  });
  /* Ranked the way the catalogue asks: uncertainty reduction times decision impact, over burden. */
  out.sort(function(a,b){return (b.value/Math.max(0.1,b.burden))-(a.value/Math.max(0.1,a.burden));});
  return out;
}
function domainKnowledge(){
  var states=domainStates(),out=[];
  domainList().forEach(function(d){
    if(!d.knowledge)return;
    try{(d.knowledge(states[d.id])||[]).forEach(function(k){
      out.push(Object.assign({domain:d.id,domainLabel:d.label},k));});}catch(e){_q(e,'P1');}
  });
  return out;
}
/* The contract test, run by the self-test: a domain that declares an observation type that does not exist
   would silently never fire, which is the failure mode hardest to notice. */
function domainContractIssues(){
  var issues=[];
  domainList().forEach(function(d){
    if(!d.id||!d.label)issues.push('a domain is missing an id or label');
    (d.observes||[]).forEach(function(t){
      if(!OBS_TYPES[t])issues.push(d.id+' observes "'+t+'", which is not a declared observation type');
    });
    if(typeof d.state!=='function')issues.push(d.id+' has no state function');
    var st;
    try{st=d.state();}catch(e){issues.push(d.id+' threw while computing state: '+(e&&e.message));}
    if(st&&!st.status)issues.push(d.id+' returned a state with no status');
    ['findings','propose','gaps','knowledge'].forEach(function(h){
      if(d[h]!=null&&typeof d[h]!=='function')issues.push(d.id+'.'+h+' is not a function');
    });
    /* A domain must not write. Checked by shape rather than by trust: if it declares a mutator, say so. */
    if(d.mutate||d.write||d.save)issues.push(d.id+' declares a mutation hook; domains propose, they do not write');
  });
  return issues;
}
function domainSummary(){
  var states=domainStates();
  return domainList().map(function(d){
    var s=states[d.id]||{};
    return {id:d.id,label:d.label,status:s.status||'unknown',
      headline:s.headline||null,cls:s.cls||null,confidence:s.confidence||null,
      observes:d.observes,
      findings:domainFindings().filter(function(f){return f.domain===d.id;}).length,
      gaps:domainGaps().filter(function(g){return g.domain===d.id;}).length};
  });
}
