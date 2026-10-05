/* ============================================================================
   PAGE LAYOUT (from use: "allow full reconfiguration and reorganisation of each page \u2026 with hide/show, in tandem with
   the three view types"). One layer for every page: any panel can be hidden or moved, per page, on top of the detail
   preset (a panel the preset hides is shown as such). Applied by the same observer that tags panel levels, after it, so
   every render path is covered; panels are moved only when the order differs, so the observer settles.
   Kept in DB.settings.pageLayout[tab] = {order:[keys], hidden:{key:true}}; a panel's key is its fold id or its title.
   ============================================================================ */
function _panelKey(el){return el.getAttribute('data-fold')||('p:'+String(panelTitle(el)||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,48));}
function pagePanels(tab){var v=typeof document!=='undefined'?document.getElementById('view-'+tab):null;if(!v)return [];
  return [].slice.call(v.querySelectorAll('.card, details.fold')).filter(function(el){return !(el.parentElement&&el.parentElement.closest('.card, details.fold'))&&!el.closest('.page-custom');})
    .map(function(el){return {el:el,key:_panelKey(el),title:panelTitle(el)||'(untitled)',parent:el.parentElement,level:el.getAttribute('data-level')||'casual'};});}
function _pageLayout(tab){var L=(DB.settings.pageLayout||{})[tab];return L||{order:[],hidden:{}};}
var _LAYOUT_BUSY=false;
function applyPageLayout(tab){
  var L=_pageLayout(tab),P=pagePanels(tab);
  P.forEach(function(p){if(L.hidden&&L.hidden[p.key])p.el.setAttribute('data-user-hidden','1');else p.el.removeAttribute('data-user-hidden');});
  if(!L.order||!L.order.length)return;
  var groups=[];P.forEach(function(p){var g=groups.filter(function(x){return x.parent===p.parent;})[0];if(!g)groups.push(g={parent:p.parent,items:[]});g.items.push(p);});
  groups.forEach(function(g){var want=L.order.filter(function(k){return g.items.some(function(p){return p.key===k;});});if(want.length<2)return;
    var now=g.items.map(function(p){return p.key;}).filter(function(k){return want.indexOf(k)>=0;});if(now.join('|')===want.join('|'))return;   /* already right: no moves, so the observer settles */
    var first=g.items.filter(function(p){return want.indexOf(p.key)>=0;})[0].el,marker=document.createComment('layout');g.parent.insertBefore(marker,first);
    want.forEach(function(k){var p=g.items.filter(function(x){return x.key===k;})[0];if(p)g.parent.insertBefore(p.el,marker);});g.parent.removeChild(marker);});
}
function applyPageLayouts(){if(_LAYOUT_BUSY||typeof document==='undefined')return;_LAYOUT_BUSY=true;
  try{[].slice.call(document.querySelectorAll('[id^="view-"]')).forEach(function(v){var tab=v.id.slice(5);applyPageLayout(tab);
    if(!v.querySelector(':scope > .page-custom')){var d=document.createElement('div');d.className='page-custom';d.innerHTML='<button type="button" class="btn btn-ghost btn-sm" data-act="page.customize" data-arg="'+tab+'">Customize this page</button>';v.appendChild(d);}});}
  finally{_LAYOUT_BUSY=false;}}
/* the same observer that tags panel levels: layout after levels, from whatever path rendered */
(function(){if(typeof applyPanelLevels!=='function')return;var _apl=applyPanelLevels;applyPanelLevels=function(root){_apl(root);try{applyPageLayouts();}catch(e){_q(e,'P2');}};})();
function _layoutSave(tab,L){DB.settings.pageLayout=Object.assign({},DB.settings.pageLayout||{});DB.settings.pageLayout[tab]=L;save('settings');applyPageLayout(tab);if(_SHEET&&_SHEET.opts&&_SHEET.opts.form==='pageLayout')renderSheet();}
registerAction('page.customize',function(tab){tab=tab||(typeof _TAB!=='undefined'?_TAB:'today');openSheet('edit',{form:'pageLayout',title:'Customize this page',desc:'',buf:{tab:tab}});});
registerAction('page.toggle',function(arg){var q=String(arg).split('|'),L=JSON.parse(JSON.stringify(_pageLayout(q[0])));L.hidden=L.hidden||{};if(L.hidden[q[1]])delete L.hidden[q[1]];else L.hidden[q[1]]=true;_layoutSave(q[0],L);});
registerAction('page.move',function(arg){var q=String(arg).split('|'),tab=q[0],key=q[1],dir=+q[2],P=pagePanels(tab),me=P.filter(function(p){return p.key===key;})[0];if(!me)return;
  var sib=P.filter(function(p){return p.parent===me.parent;}),i=sib.indexOf(me),j=i+dir;if(j<0||j>=sib.length)return;var keys=sib.map(function(p){return p.key;});var t=keys[i];keys[i]=keys[j];keys[j]=t;
  var L=JSON.parse(JSON.stringify(_pageLayout(tab))),rest=(L.order||[]).filter(function(k){return keys.indexOf(k)<0;});L.order=keys.concat(rest);_layoutSave(tab,L);});
registerAction('page.reset',function(tab){DB.settings.pageLayout=Object.assign({},DB.settings.pageLayout||{});delete DB.settings.pageLayout[tab];save('settings');renderAll();if(_SHEET)renderSheet();toast('This page is back to its default layout');});
SHEETS.pageLayout=function(b){var tab=b.tab,P=pagePanels(tab),L=_pageLayout(tab),det=typeof detailLevel==='function'?detailLevel():'insightful',RANK={casual:0,insightful:1,detailed:2,developer:3};
  var out='<div class="hint">Hide any section, or move it up or down within its part of the page. This sits on top of the view type ('+esc(det)+'): sections that view hides are marked.</div>';
  var lastParent=null;P.forEach(function(p,idx){if(p.parent!==lastParent){out+='<div class="card-title" style="margin-top:8px">'+(lastParent?'Next part of the page':'Top of the page')+'</div>';lastParent=p.parent;}
    var hid=!!(L.hidden&&L.hidden[p.key]),byPreset=(RANK[p.level]||0)>(RANK[det]||1);
    out+='<div class="feat"><div class="feat-body"><b>'+esc(p.title)+'</b>'+(byPreset?' <span class="hint">hidden by the '+esc(det)+' view</span>':'')+'</div>'+
      '<button type="button" class="st-b" data-act="page.move" data-arg="'+attrEsc(tab+'|'+p.key+'|-1')+'" aria-label="move up">\u2191</button><button type="button" class="st-b" data-act="page.move" data-arg="'+attrEsc(tab+'|'+p.key+'|1')+'" aria-label="move down">\u2193</button>'+
      '<button type="button" class="chip'+(hid?'':' active')+'" data-act="page.toggle" data-arg="'+attrEsc(tab+'|'+p.key)+'" aria-pressed="'+(!hid)+'">'+(hid?'hidden':'shown')+'</button></div>';});
  if(!P.length)out+='<div class="hint">Open this page first: its sections are listed as they appear.</div>';
  return {body:out,foot:'<button class="btn btn-ghost" data-act="page.reset" data-arg="'+attrEsc(tab)+'">Reset this page</button><button class="btn btn-secondary" data-act="edit.close">Done</button>'};};
