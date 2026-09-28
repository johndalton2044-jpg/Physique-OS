#!/usr/bin/env node
/* REAL BROWSER GATE
 *
 * Everything here is a check jsdom cannot perform, because jsdom resolves the cascade and does no layout.
 * Every box in it is zero by zero. So for the whole life of this project the geometric claims — touch
 * targets are 44px, the rails align, nothing clips, the page does not scroll sideways — were asserted in
 * CSS and verified nowhere. Two of the bugs actually reported by a human were exactly this class: rails at
 * different heights, and a pill overflowing its container.
 *
 * This runs the built app in headless Chromium at real device sizes and measures.
 *
 *   node tests/browser.mjs [--json] [--keep]
 */
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';

const JSON_ONLY = process.argv.includes('--json');
import {findBrowser,BROWSER_HELP} from './_browser-path.mjs';
if(process.env.PHYSIQUE_SKIP_BROWSER==='1'){
  console.log('  SKIPPED  real-browser gate \u2014 PHYSIQUE_SKIP_BROWSER=1 was set, so layout, touch targets and contrast were NOT verified in a browser');
  process.exit(0);
}
const CHROME = findBrowser();
if(!CHROME){console.error(BROWSER_HELP);process.exit(1);}
console.log('  browser: '+CHROME);
const DIST = path.resolve('dist/index.html');
if(!fs.existsSync(DIST)){console.error('dist/index.html not found — run the build first');process.exit(1);}

/* Real devices rather than round numbers: the 375-wide phone is where things break. */
const VIEWPORTS = [
  {name:'iPhone SE',   width:375, height:667, dpr:2, phone:true},
  {name:'iPhone 15',   width:393, height:852, dpr:3, phone:true},
  {name:'iPhone 15 Pro Max', width:430, height:932, dpr:3, phone:true},
  /* The width at which the reported overlap appeared: wider than a phone, narrower than a tablet, so the
     tab bar neither scrolls far nor has room to spare. Missing sizes are where layout bugs live. */
  {name:'narrow tablet', width:660, height:900, dpr:2, phone:false},
  {name:'iPad',        width:768, height:1024, dpr:2, phone:false},
  {name:'desktop',     width:1280, height:800, dpr:1, phone:false}
];
const TABS = ['today','log','plan','train','food','body','progress','diagnose','experiments','learn','archive','tools'];

const findings = [];
const passes = [];
const add=(sev,area,what,detail)=>findings.push({sev,area,what,detail:detail||''});
const good=(area,what,detail)=>passes.push({area,what,detail:detail||''});

const browser = await chromium.launch({
  executablePath: CHROME,
  args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--force-color-profile=srgb']
});

/* ---------- the measurements, run inside the page ---------- */
const MEASURE = () => {
  const out = {targets:[], clipped:[], offscreen:[], contrast:[], overlaps:[]};
  const vw = window.innerWidth;
  /* Visually-hidden elements are SUPPOSED to be 1x1 and clipped — that is how a skip link is exposed to a
     screen reader without being seen. Counting them as touch-target and clipping failures was the check
     being broader than the property it verifies, which flagged correct accessibility work as a defect. */
  const srOnly = el => {
    const s = getComputedStyle(el);
    if(el.classList && el.classList.contains('sr-only')) return true;
    if(el.closest && el.closest('.sr-only')) return true;
    const r = el.getBoundingClientRect();
    return (r.width<=1 && r.height<=1) || s.clip==='rect(0px, 0px, 0px, 0px)' ||
           s.clipPath==='inset(50%)';
  };
  const visible = el => {
    const s = getComputedStyle(el);
    if(s.display==='none'||s.visibility==='hidden'||parseFloat(s.opacity)===0) return false;
    if(srOnly(el)) return false;
    const r = el.getBoundingClientRect();
    return r.width>0 && r.height>0;
  };
  /* An element inside a deliberately horizontal scroller is not "off screen" — it is scrolled to. */
  const inScroller = el => {
    let n=el.parentElement;
    while(n && n!==document.body){
      const s=getComputedStyle(n);
      if((s.overflowX==='auto'||s.overflowX==='scroll') && n.scrollWidth>n.clientWidth+1) return true;
      n=n.parentElement;
    }
    return false;
  };
  /* TOUCH TARGETS — measured, not declared. */
  document.querySelectorAll('button,a[href],[data-act],input,select,textarea,summary').forEach(el=>{
    if(!visible(el)) return;
    const r = el.getBoundingClientRect();
    /* A control inside another control is not separately tappable; only leaves count. */
    if(el.querySelector('button,[data-act]')) return;
    /* Half a pixel of tolerance: a 44px target laid out at 43.98 is not a defect. */
    if(r.width<43.5||r.height<43.5){
      out.targets.push({
        tag:el.tagName.toLowerCase(),
        act:el.getAttribute('data-act')||null,
        label:(el.textContent||'').trim().slice(0,28),
        w:Math.round(r.width), h:Math.round(r.height)
      });
    }
  });
  /* SIBLING OVERLAP — text wider than its own box spilling visibly into the next element. This is the
     defect a user reported from a screenshot (tab labels running into each other) that the clipping check
     could not see, because nothing was clipped: the text simply overflowed into its neighbour. */
  document.querySelectorAll('.tab,[data-act],button,.pill').forEach(el=>{
    if(!visible(el)) return;
    const s=getComputedStyle(el);
    if(s.overflow==='hidden'||s.textOverflow==='ellipsis') return;
    const r=el.getBoundingClientRect();
    if(el.scrollWidth > Math.ceil(r.width)+1){
      const nxt=el.nextElementSibling;
      if(nxt&&visible(nxt)){
        const n=nxt.getBoundingClientRect();
        if(Math.abs(n.top-r.top)<r.height && r.left+el.scrollWidth > n.left+1)
          out.overlaps.push({text:(el.textContent||'').trim().slice(0,24),
            box:Math.round(r.width),content:el.scrollWidth,
            into:(nxt.textContent||'').trim().slice(0,20)});
      }
    }
  });
  /* CLIPPING — content wider than the box that holds it, with overflow hidden. */
  document.querySelectorAll('*').forEach(el=>{
    if(!visible(el)) return;
    const s = getComputedStyle(el);
    if(s.overflowX!=='hidden'&&s.overflow!=='hidden') return;
    /* Deliberate single-line truncation with an ellipsis is a design decision, not clipping. */
    if(s.textOverflow==='ellipsis') return;
    if(el.scrollWidth > el.clientWidth + 1){
      out.clipped.push({
        tag:el.tagName.toLowerCase(),
        cls:(el.getAttribute&&el.getAttribute('class')||el.tagName.toLowerCase()).slice(0,32),
        text:(el.textContent||'').trim().slice(0,32),
        over:el.scrollWidth-el.clientWidth
      });
    }
  });
  /* HORIZONTAL OVERFLOW — anything sticking out past the viewport. */
  document.querySelectorAll('body *').forEach(el=>{
    if(!visible(el)) return;
    const r = el.getBoundingClientRect();
    if(r.right > vw+1 || r.left < -1){
      const s=getComputedStyle(el);
      if(s.position==='fixed') return;   /* rails are intentionally pinned */
      if(inScroller(el)) return;         /* the tab bar scrolls horizontally by design */
      out.offscreen.push({
        tag:el.tagName.toLowerCase(),
        cls:(el.getAttribute&&el.getAttribute('class')||el.tagName.toLowerCase()).slice(0,32),
        left:Math.round(r.left), right:Math.round(r.right), vw
      });
    }
  });
  /* CONTRAST on the colours actually computed, not the tokens declared. */
  const lum = c => {
    const m=/rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c);
    if(!m) return null;
    const v=[+m[1],+m[2],+m[3]].map(x=>{x/=255;return x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4);});
    return 0.2126*v[0]+0.7152*v[1]+0.0722*v[2];
  };
  const bgOf = el => {
    let n=el;
    while(n && n!==document.documentElement){
      const c=getComputedStyle(n).backgroundColor;
      if(c && !/rgba\(0,\s*0,\s*0,\s*0\)|transparent/.test(c)) return c;
      n=n.parentElement;
    }
    return getComputedStyle(document.body).backgroundColor;
  };
  const sample=[...document.querySelectorAll('p,span,div,button,a,label,td,th')].filter(visible).slice(0,400);
  sample.forEach(el=>{
    if(!el.textContent||!el.textContent.trim()) return;
    if(el.querySelector('*')) return;                 /* leaf text only */
    const s=getComputedStyle(el);
    const lf=lum(s.color), lb=lum(bgOf(el));
    if(lf==null||lb==null) return;
    const ratio=(Math.max(lf,lb)+0.05)/(Math.min(lf,lb)+0.05);
    const size=parseFloat(s.fontSize), bold=parseInt(s.fontWeight,10)>=700;
    const large = size>=24 || (size>=18.66 && bold);
    const need = large?3:4.5;
    if(ratio < need){
      out.contrast.push({
        text:el.textContent.trim().slice(0,30),
        ratio:Math.round(ratio*100)/100, need, size:Math.round(size),
        cls:(el.getAttribute&&el.getAttribute('class')||el.tagName.toLowerCase()).slice(0,28)
      });
    }
  });
  return out;
};

/* ---------- run every viewport ---------- */
for(const vp of VIEWPORTS){
  const ctx = await browser.newContext({
    viewport:{width:vp.width,height:vp.height},
    deviceScaleFactor:vp.dpr,
    hasTouch:vp.phone,
    isMobile:vp.phone,
    reducedMotion:'reduce'
  });
  const page = await ctx.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e&&e.message).slice(0,140)));
  await page.goto('file://'+DIST, {waitUntil:'load'});
  await page.waitForFunction(()=>typeof window.loadDemo==='function', {timeout:20000});
  await page.evaluate(()=>window.loadDemo());
  await page.waitForTimeout(250);

  /* The page itself must not scroll sideways. */
  const doc = await page.evaluate(()=>({
    scrollW:document.documentElement.scrollWidth,
    clientW:document.documentElement.clientWidth
  }));
  if(doc.scrollW > doc.clientW+1)
    add('P1','layout',`the page scrolls sideways on ${vp.name}`,`${doc.scrollW}px of content in ${doc.clientW}px`);

  for(const tab of TABS){
    await page.evaluate(t=>window.switchTab(t), tab);
    await page.waitForTimeout(90);
    const m = await page.evaluate(MEASURE);

    if(m.targets.length){
      const worst=m.targets.slice(0,3).map(t=>`${t.act||t.tag} ${t.w}x${t.h} "${t.label}"`).join('; ');
      add('P1','touch',`${m.targets.length} control(s) under 44px on ${vp.name}/${tab}`,worst);
    }
    if(m.overlaps.length)
      add('P1','overlap',`${m.overlaps.length} element(s) spill text into a neighbour on ${vp.name}/${tab}`,
        m.overlaps.slice(0,3).map(o=>`"${o.text}" ${o.content}px in a ${o.box}px box, into "${o.into}"`).join('; '));
    else if(tab==='today') good('overlap',`no text spills into a neighbour on ${vp.name}`);
    if(m.clipped.length)
      add('P1','clipping',`${m.clipped.length} element(s) clip their content on ${vp.name}/${tab}`,
        m.clipped.slice(0,2).map(c=>`.${c.cls} over by ${c.over}px "${c.text}"`).join('; '));
    if(m.offscreen.length)
      add('P1','layout',`${m.offscreen.length} element(s) extend past the viewport on ${vp.name}/${tab}`,
        m.offscreen.slice(0,2).map(o=>`.${o.cls} right=${o.right} vw=${o.vw}`).join('; '));
    if(m.contrast.length)
      add('P1','contrast',`${m.contrast.length} text run(s) below contrast on ${vp.name}/${tab}`,
        m.contrast.slice(0,2).map(c=>`"${c.text}" ${c.ratio}:1 needs ${c.need}`).join('; '));
  }

  /* SHEETS — the tab sweep never opened a sheet, so every button inside one was unmeasured. The dashboard
     editor puts many small controls on screen at once, which is exactly where undersized targets appear. */
  /* Every sheet with form fields, not only the new ones: the unstyled-input defect lived in four older sheets
     for as long as this gate existed, because it never opened any of them. */
  for(const [act,label,prep] of [['nav.dashboard','dashboard view',null],['nav.dashboard','dashboard editor','dash.edit'],
      ['nav.studio','studio',null],['nav.vizstudio','visualization studio',null],['nav.bodymap','body map',null],['nav.movement','movement',null],['nav.program','program',null],['nav.nutritionviz','nutrition',null],['nav.exports','exports',null],['nav.recoveryAllocation','recoveryAllocation',null],['nav.motorLearning','motorLearning',null],['nav.hydration','hydration',null],['nav.supplements','supplements',null],['nav.welcome','welcome',null],['nav.exlibrary','exlibrary',null],['nav.forecast','forecastFamily',null],['nav.measurement','measurement',null],['nav.recoveryState','recoveryState',null],['nav.internals','internals',null],['nav.ask','ask',null],['injury.add','injury form',null],
      ['nav.label','label scan',null],['nav.yields','yields',null],['nav.substitute','substitute',null]]){
    await page.evaluate(a=>window.dispatchAct(a),act);
    await page.waitForTimeout(120);
    if(prep){await page.evaluate(a=>window.dispatchAct(a),prep);await page.waitForTimeout(120);}
    const m=await page.evaluate(MEASURE);
    if(m.targets.length)
      add('P1','touch',`${m.targets.length} control(s) under 44px in the ${label} on ${vp.name}`,
        m.targets.slice(0,3).map(t=>`${t.act||t.tag} ${t.w}x${t.h} "${t.label}"`).join('; '));
    else good('sheets',`every control in the ${label} is at least 44px on ${vp.name}`);
    if(m.overlaps.length)
      add('P1','overlap',`${m.overlaps.length} element(s) spill text into a neighbour in the ${label} on ${vp.name}`,
        m.overlaps.slice(0,2).map(o=>`"${o.text}" ${o.content}px in ${o.box}px`).join('; '));
    if(m.offscreen.length)
      add('P1','layout',`${m.offscreen.length} element(s) extend past the viewport in the ${label} on ${vp.name}`,
        m.offscreen.slice(0,2).map(o=>`.${o.cls} right=${o.right}`).join('; '));
    await page.evaluate(()=>{const k=new KeyboardEvent('keydown',{key:'Escape',bubbles:true});document.dispatchEvent(k);});
    await page.waitForTimeout(80);
  }
  /* RAIL ALIGNMENT — the bug a human reported, measured rather than asserted. */
  if(vp.phone){
    const rails = await page.evaluate(()=>{
      const l=document.getElementById('railLeft'), r=document.getElementById('railRight');
      if(!l||!r) return null;
      const a=l.getBoundingClientRect(), b=r.getBoundingClientRect();
      return {lb:Math.round(a.bottom), rb:Math.round(b.bottom), lh:Math.round(a.height), rh:Math.round(b.height),
        lvis:getComputedStyle(l).display!=='none', rvis:getComputedStyle(r).display!=='none'};
    });
    if(rails && rails.lvis && rails.rvis){
      /* The right-hand column ends with the + button, below its rail. Matching the two rails' bottom edges left the left
         stack floating about 60 px above + — the misalignment reported in the usage review. The left rail's last
         button is now checked against the centre of +. */
      const al=await page.evaluate(()=>{const h=document.getElementById('homeFab'),p=document.querySelector('.fab:not(.fab-mini)');if(!h||!p)return null;
        const a=h.getBoundingClientRect(),b=p.getBoundingClientRect();return {home:Math.round(a.top+a.height/2),plus:Math.round(b.top+b.height/2)};});
      if(al&&Math.abs(al.home-al.plus)>4)
        add('P1','rails',`the left rail does not end level with the + button on ${vp.name}`,`home centre ${al.home}, + centre ${al.plus}`);
      else good('rails',`the rails align on ${vp.name}`,`both bottom at ${rails.lb}`);
    }
  }
  /* DETAIL LEVEL — every page shows strictly more at each level (checked on one phone, where space matters most). */
  if(vp.name==='iPhone 15'){
    const counts={};
    for(const lvl of ['casual','insightful','developer']){await page.evaluate(l=>window.dispatchAct('settings.detail',l),lvl);await page.waitForTimeout(80);counts[lvl]={};
      for(const t of ['today','progress','food','train','log','tools']){await page.evaluate(x=>window.switchTab(x),t);await page.waitForTimeout(50);
        counts[lvl][t]=await page.evaluate(t=>{const v=document.getElementById('view-'+t);let n=0;if(v)v.querySelectorAll('*').forEach(e=>{if(e.children.length===0&&e.getClientRects().length&&(e.textContent||'').trim())n++;});return n;},t);}}
    await page.evaluate(()=>window.dispatchAct('settings.detail','insightful'));
    /* Never less at a higher level, and always more at Developer than at Casual. "Strictly more at each step" was
       stricter than the intent: a page that is all logging (Log) rightly shows the same at Casual and Insightful. */
    const bad=Object.keys(counts.casual).filter(t=>!(counts.casual[t]<=counts.insightful[t]&&counts.insightful[t]<=counts.developer[t]&&counts.casual[t]<counts.developer[t]));
    if(bad.length)add('P1','detail',`a page shows less at a higher detail level, or no more at Developer than at Casual`,bad.map(t=>t+' '+counts.casual[t]+'/'+counts.insightful[t]+'/'+counts.developer[t]).join('; '));
    else good('detail',`every page shows at least as much at each higher level, and more at Developer`,Object.keys(counts.casual).map(t=>t+' '+counts.casual[t]+'/'+counts.insightful[t]+'/'+counts.developer[t]).join(', '));
  }
  /* NO TEMPLATE LEAKS. A value that failed to render shows as "undefined", "NaN" or "[object Object]"; a label placed
     before its variable was set nearly put "undefined" on every empty tile. No tab may show any of them, at any level. */
  if(vp.name==='iPhone 15'||vp.name==='Desktop'){
    const leaks=[];
    for(const lvl of ['casual','developer']){await page.evaluate(l=>window.dispatchAct('settings.detail',l),lvl);
      for(const t of ['today','log','plan','train','food','body','progress','diagnose','experiments','learn','archive','tools']){
        await page.evaluate(x=>window.switchTab(x),t);await page.waitForTimeout(50);
        const m=await page.evaluate(t=>{const v=document.getElementById('view-'+t);if(!v)return null;const x=(v.innerText||'').match(/\bundefined\b|\bNaN\b|\[object Object\]/);return x?x[0]+' near "'+(v.innerText||'').slice(Math.max(0,x.index-40),x.index+10).replace(/\s+/g,' ')+'"':null;},t);
        if(m)leaks.push(lvl+'/'+t+': '+m);}}
    await page.evaluate(()=>window.dispatchAct('settings.detail','insightful'));
    if(leaks.length)add('P1','leak','a tab shows undefined, NaN or [object Object]',leaks.slice(0,4).join('; '));
    else good('leak','no tab shows undefined, NaN or [object Object] at any level','12 tabs \u00d7 2 levels');
  }
  /* nav.charts — through the command palette, as a person reaches it; the catalogue draws from the record. */
  if(vp.name==='iPhone 15'){
    await page.evaluate(()=>{window.closeSheet&&window.closeSheet();window.dispatchAct('settings.detail','developer');});
    /* Opened the way the other navigation tests open it (openCmdk, #cmdkInput); there is no palette.open action, so the
       first version typed into nothing. */
    const ok=await (async()=>{try{await page.evaluate(()=>window.openCmdk());await page.waitForTimeout(100);
      await page.fill('#cmdkInput','chart catalogue');await page.waitForTimeout(150);await page.keyboard.press('Enter');await page.waitForTimeout(600);
      return await page.evaluate(()=>{const b=document.getElementById('editBackdrop');return !!(b&&b.classList.contains('show')&&/Chart catalogue/.test(b.textContent)&&b.querySelectorAll('svg.chart-svg').length>=20);});}catch(e){return false;}})();
    await page.evaluate(()=>{window.closeSheet&&window.closeSheet();window.dispatchAct('settings.detail','insightful');});
    if(!ok)add('P1','nav','nav.charts: the chart catalogue does not open from the palette with its charts drawn','');else good('nav','nav.charts: palette \u2192 chart catalogue, drawn from the record','nav.charts');
  }
  /* SOURCES: from the palette; removing previews first, and cancelling removes nothing. */
  if(vp.name==='iPhone 15'){const f=[];
    await page.evaluate(()=>{window.closeSheet&&window.closeSheet();window.openCmdk();});await page.waitForTimeout(100);await page.fill('#cmdkInput','your data sources');await page.waitForTimeout(150);await page.keyboard.press('Enter');await page.waitForTimeout(300);
    if(!(await page.evaluate(()=>window._SHEET&&window._SHEET.opts&&window._SHEET.opts.form==='sources'&&typeof window.ACTIONS['sources.open']==='function')))f.push('sources.open does not open from the palette');
    else{const n0=await page.evaluate(()=>window.DB.observations.filter(o=>!o.retracted).length);const btn=await page.$('#editBackdrop [data-act="sources.deletePreview"]');
      if(btn){await btn.click();await page.waitForTimeout(150);if(!(await page.$('#editBackdrop [data-act="sources.deleteConfirm"]')))f.push('removing a source does not preview first');
        await page.click('#editBackdrop [data-act="sources.deleteCancel"]');await page.waitForTimeout(150);if(await page.evaluate(n=>window.DB.observations.filter(o=>!o.retracted).length!==n,n0))f.push('cancelling removed data');}}
    await page.evaluate(()=>window.closeSheet&&window.closeSheet());
    if(f.length)add('P1','sources','the sources screen does not work through its controls',f.join('; '));else good('sources','palette → sources → preview → cancel removes nothing','sources');}
  /* AUTOMATION: Next up on Today, a one-tap chip that writes and can be undone, and the automation sheet from the palette. */
  if(vp.name==='iPhone 15'){const f=[];
    await page.evaluate(()=>{window.closeSheet&&window.closeSheet();window.DB.settings.quickHidden={};window.switchTab('today');window.scrollTo(0,0);});await page.waitForTimeout(200);
    const chips=await page.evaluate(()=>[...document.querySelectorAll('#view-today .qa-chip')].map(c=>c.getAttribute('data-arg')));
    if(chips.includes('water')){const w0=await page.evaluate(()=>window.obsOf('water').length);await page.click('#view-today .qa-chip[data-arg="water"]');await page.waitForTimeout(250);
      if(await page.evaluate(n=>window.obsOf('water').length!==n+1,w0))f.push('the one-tap water chip did not log');}
    await page.evaluate(()=>window.openCmdk());await page.waitForTimeout(100);await page.fill('#cmdkInput','shortcuts and automation');await page.waitForTimeout(150);await page.keyboard.press('Enter');await page.waitForTimeout(300);
    if(!(await page.evaluate(()=>window._SHEET&&window._SHEET.opts&&window._SHEET.opts.form==='automation'&&typeof window.ACTIONS['automation.open']==='function')))f.push('automation.open does not open from the palette');
    await page.evaluate(()=>window.closeSheet&&window.closeSheet());
    /* nav.today, the action the weigh-in automation runs */
    await page.evaluate(()=>{window.switchTab('food');window.dispatchAct('nav.today');});await page.waitForTimeout(150);if(await page.evaluate(()=>window._TAB!=='today'))f.push('nav.today does not open Today');
    if(f.length)add('P1','automation','quick actions or automation do not work through their controls',f.join('; '));else good('automation','Next up on Today, one-tap chip, automation sheet from the palette','automation');}
  /* SUPPLEMENTS AND VITAMINS, through their controls: palette → sheet → add → dose → the Food card. */
  if(vp.name==='iPhone 15'){const f=[];
    await page.evaluate(()=>{window.closeSheet&&window.closeSheet();window.openCmdk();});await page.waitForTimeout(100);
    await page.fill('#cmdkInput','supplements and vitamins');await page.waitForTimeout(150);await page.keyboard.press('Enter');await page.waitForTimeout(350);
    if(!(await page.evaluate(()=>window._SHEET&&window._SHEET.opts&&window._SHEET.opts.form==='supplements'&&typeof window.ACTIONS['supp.open']==='function')))f.push('supp.open does not open from the palette');
    else{const had=await page.evaluate(()=>window.supplementStack().some(s=>s.id==='magnesium'));
      if(!had){await page.click('#editBackdrop [data-act="supp.add"][data-arg="magnesium"]');await page.waitForTimeout(200);}
      const inp=await page.$('#editBackdrop [data-act="supp.dose"][data-arg="magnesium"]');if(inp){await inp.fill('250');await inp.dispatchEvent('change');await page.waitForTimeout(150);}
      const st=await page.evaluate(()=>window.supplementStack().filter(s=>s.id==='magnesium')[0]);if(!st||st.dose!==250)f.push('adding magnesium and setting 250 mg did not stick '+JSON.stringify(st));
      await page.evaluate(()=>{window.closeSheet&&window.closeSheet();window.switchTab('food');});await page.waitForTimeout(200);
      if(!(await page.evaluate(()=>[...document.querySelectorAll('#view-food .card')].some(c=>/Supplements and vitamins/.test(c.textContent)&&/Magnesium/.test(c.textContent)))))f.push('the Food card does not show the regimen');
      await page.evaluate(()=>window.setSupplementStack(window.supplementStack().filter(s=>s.id!=='magnesium')));}
    if(f.length)add('P1','supplements','the supplements and vitamins flow does not work through its controls',f.join('; '));else good('supplements','palette → regimen → dose → Food card','supplements');}
  /* RAILS: the left rail ends level with the + button, flush with its edge; previous/next sit side by side and flip
     panels; the microphone sits above + (usage review). */
  if(vp.name==='iPhone 15'){
    const f=[];await page.evaluate(()=>{window.closeSheet&&window.closeSheet();window.switchTab('today');window.scrollTo(0,0);});await page.waitForTimeout(200);
    const R=await page.evaluate(()=>{const g=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {l:Math.round(r.left),r:Math.round(r.right),t:Math.round(r.top),b:Math.round(r.bottom),cy:Math.round(r.top+r.height/2)};};
      return {plus:g('.fab:not(.fab-mini)'),home:g('#homeFab'),prev:g('#prevFab'),next:g('#nextFab'),mic:g('#voiceFab')};});
    if(!R.plus||!R.home||Math.abs(R.home.cy-R.plus.cy)>4)f.push('the left rail does not end level with the + button '+JSON.stringify([R.home,R.plus]));
    if(R.prev&&R.home&&R.prev.l!==R.home.l)f.push('the left rail buttons are not flush with its edge');
    if(!R.prev||!R.next||Math.abs(R.prev.cy-R.next.cy)>2||R.next.l<=R.prev.r)f.push('previous and next are not side by side');
    if(!R.mic||!R.plus||R.mic.b>R.plus.t||R.plus.t-R.mic.b>24)f.push('the microphone is not directly above the + button');
    if(!(await page.evaluate(()=>document.getElementById('prevFab').getAttribute('data-act')==='nav.prevTab'&&document.getElementById('nextFab').getAttribute('data-act')==='nav.nextTab')))f.push('the pair is not wired to nav.prevTab and nav.nextTab');
    const t0=await page.evaluate(()=>window._TAB);await page.click('#nextFab',{force:true});await page.waitForTimeout(150);const t1=await page.evaluate(()=>window._TAB);
    await page.click('#prevFab',{force:true});await page.waitForTimeout(150);if(t0===t1||await page.evaluate(()=>window._TAB)!==t0)f.push('previous/next do not flip panels');
    if(f.length)add('P1','rails','the side rails are not aligned or do not flip panels',f.join('; '));else good('rails','left rail level with +, previous/next side by side and flipping, microphone above +','usage review');
  }
  /* TODAY SUMMARY, UNDO, TOOLS ORDER (usage review) */
  if(vp.name==='iPhone 15'){const f=[];
    await page.evaluate(()=>{window.closeSheet&&window.closeSheet();window.switchTab('today');window.scrollTo(0,0);});await page.waitForTimeout(200);
    const T=await page.evaluate(()=>{const h=document.querySelector('.today-hero'),w=document.querySelector('[data-fold="today-why"]'),u=document.getElementById('undoFab');
      return {hero:!!h,heroFirst:!!h&&h.getBoundingClientRect().top<(document.getElementById('actionsZone').getBoundingClientRect().top),why:!!w&&!w.open,undo:!!u&&!u.hidden&&getComputedStyle(u).display!=='none',nums:[...document.querySelectorAll('.hero-num b')].filter(b=>b.textContent.trim()!=='\u2014').length};});
    if(!T.hero||!T.heroFirst)f.push('the summary is not at the top of Today');if(!T.why)f.push('the reasoning is not folded');if(!T.undo)f.push('undo is not in the right rail');if(T.nums<2)f.push('the summary shows '+T.nums+' numbers');
    await page.evaluate(()=>window.switchTab('tools'));await page.waitForTimeout(250);
    const first=await page.evaluate(()=>{const v=document.getElementById('toolsZone');const k=[...v.children].filter(c=>c.offsetParent!==null).sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top)[0];return k?(k.getAttribute('data-fold')||((k.querySelector('[data-fold]')||{}).getAttribute||(()=>null)).call(k.querySelector('[data-fold]'),'data-fold')):null;});
    if(first!=='tools-server')f.push('Tools does not start with External server ('+first+')');
    await page.evaluate(()=>{window.switchTab('today');window.dispatchAct('features.open');});await page.waitForTimeout(200);
    await page.evaluate(()=>{const b=[...document.querySelectorAll('#editBackdrop [data-act="features.go"]')].find(x=>x.getAttribute('data-arg')==='nav.schedule');if(b)b.click();});await page.waitForTimeout(300);
    if(!(await page.evaluate(()=>window._SHEET&&window._SHEET.opts&&window._SHEET.opts.form==='schedule')))f.push('a feature opened from the guide did not come to the front');
    await page.evaluate(()=>window.closeSheet&&window.closeSheet());
    if(f.length)add('P1','today','the Today summary, undo, Tools order or the guide misbehave',f.join('; '));else good('today','summary first with folded reasoning, undo present, External server first, guide opens features in front','usage review');}
  /* SCHEDULES, READY-MADE EXPERIMENTS, MOVEMENT PANELS — through their controls. */
  if(vp.name==='iPhone 15'){
    const f=[];
    await page.evaluate(()=>{window.closeSheet&&window.closeSheet();window.openCmdk();});await page.waitForTimeout(100);
    await page.fill('#cmdkInput','your schedule');await page.waitForTimeout(150);await page.keyboard.press('Enter');await page.waitForTimeout(400);
    /* the palette must resolve to nav.schedule, the registered action, not merely to some sheet */
    if(!(await page.evaluate(()=>window._SHEET&&window._SHEET.opts&&window._SHEET.opts.form==='schedule'&&typeof window.ACTIONS['nav.schedule']==='function')))f.push('nav.schedule does not open from the palette');
    else{await page.click('#editBackdrop [data-act="sched.mode"][data-arg="rotation"]');await page.waitForTimeout(200);
      await page.click('#editBackdrop [data-act="sched.preset"][data-arg="pitman-dn"]');await page.waitForTimeout(200);
      const n=await page.evaluate(()=>document.querySelectorAll('#editBackdrop .sched-strip .pw-day').length);if(n!==14)f.push('the rotation preview shows '+n+' days, not 14');
      await page.click('#editBackdrop [data-act="sched.mode"][data-arg="weekly"]');await page.waitForTimeout(150);}
    await page.evaluate(()=>{window.closeSheet&&window.closeSheet();window.dispatchAct('exp.new');});await page.waitForTimeout(250);
    if(await page.evaluate(()=>document.querySelectorAll('#editBackdrop [data-act="exp.fromTemplate"]').length)<5)f.push('"New experiment" does not open the ready-made options');
    await page.evaluate(()=>{window.closeSheet&&window.closeSheet();});
    const panels=await page.evaluate(()=>{const e=window.resolveExercise('Bench press');const d=document.createElement('div');d.innerHTML=window.renderMovement(window.movementModel(e.pattern,{exercise:e.name}));return d.querySelectorAll('.mv-panel').length;});
    if(panels!==2)f.push('a movement drawing has '+panels+' panels, not start and end');
    if(f.length)add('P1','usage','a usage-review feature does not work through its controls',f.join('; '));
    else good('usage','schedule from the palette with a 2-2-3 preview, ready-made experiments, start and end panels','usage review');
  }
  /* TODAY FOLLOWS THE PLAN (H1). The next action is shown; the smaller versions are one tap away behind "Can't do all of
     it?"; choosing one sets it; skipping records a skip and moves the next action on. Exercised with the controls. */
  if(vp.name==='iPhone 15'){
    const fails=[];
    await page.evaluate(()=>{window.closeSheet&&window.closeSheet();window.dispatchAct('settings.detail','casual');window.switchTab('today');});await page.waitForTimeout(250);
    const hasNext=await page.evaluate(()=>!!document.querySelector('#view-today .next-action'));if(!hasNext)fails.push('no next action on Today');
    const tr=await page.evaluate(()=>{const r=window.executionFor(window.todayISO()).rows.find(x=>x.item==='training');return r?r.status:null;});
    if(tr&&tr!=='done'&&tr!=='skipped'){
      await page.click('#view-today details.variant-more > summary');await page.waitForTimeout(120);
      await page.click('#view-today [data-act="exec.variant"][data-arg="training|reduced"]');await page.waitForTimeout(200);
      if(await page.evaluate(()=>window.executionFor(window.todayISO()).rows.find(x=>x.item==='training').variant)!=='reduced')fails.push('choosing Reduced did not set the version');
      await page.click('#view-today details.variant-more > summary');await page.waitForTimeout(120);
      await page.click('#view-today [data-act="exec.skip"][data-arg="training"]');await page.waitForTimeout(200);
      if(await page.evaluate(()=>window.executionFor(window.todayISO()).rows.find(x=>x.item==='training').status)!=='skipped')fails.push('Skip did not record a skip');
      if(await page.evaluate(()=>window.nextAction().item==='training'))fails.push('the next action still points at the skipped session');
    }
    await page.evaluate(()=>window.dispatchAct('settings.detail','insightful'));
    if(fails.length)add('P1','today','Today does not follow the plan the way a person uses it',fails.join('; '));
    else good('today','Today shows the next action, offers the smaller versions one tap away, and records a skip','plan-driven');
  }
  /* WORKOUT MODE AND BARCODE LOOKUP (H2), through their controls. */
  if(vp.name==='iPhone 15'){
    const f=[];
    await page.evaluate(()=>{window.closeSheet&&window.closeSheet();localStorage.removeItem('physiqueOS_workout_draft');window.dispatchAct('workout.start');});await page.waitForTimeout(250);
    if(await page.evaluate(()=>window._SHEET&&window._SHEET.opts&&window._SHEET.opts.form==='workout')){
      await page.fill('#wo-r-0','6');if(!(await page.evaluate(()=>document.getElementById('wo-l-0').value)))await page.fill('#wo-l-0','100');
      await page.evaluate(()=>{['wo-r-0','wo-l-0'].forEach(id=>document.getElementById(id).dispatchEvent(new Event('input',{bubbles:true})));});
      await page.click('button[data-act="workout.setDone"][data-arg="0"]');await page.waitForTimeout(300);
      if(!(await page.evaluate(()=>!!document.getElementById('woRestClock'))))f.push('no rest timer after a set');
      await page.click('button[data-act="workout.restSkip"]');await page.waitForTimeout(150);
      await page.evaluate(()=>{window._WORKOUT.current=window._WORKOUT.exercises.length-1;window.renderSheet();});await page.waitForTimeout(120);
      const n0=await page.evaluate(()=>window.DB.sessions.length);await page.click('button[data-act="workout.finish"]');await page.waitForTimeout(700);
      if(await page.evaluate(n=>window.DB.sessions.length!==n+1||window.DB.sessions.slice(-1)[0].source!=='workout mode',n0))f.push('finishing did not save the session');
      await page.evaluate(()=>{window.closeSheet&&window.closeSheet();const s=window.DB.sessions.slice(-1)[0];window.retractSession&&window.retractSession(s.id,'browser test');});
    }
    await page.evaluate(()=>window.dispatchAct('food.scan'));await page.waitForTimeout(200);
    if(!(await page.evaluate(()=>!!document.getElementById('scanManual'))))f.push('the scanner offers no way to type the number');
    await page.evaluate(()=>{window.dispatchAct('scan.close');});
    if(f.length)add('P1','workout','a workout or barcode path does not work through its controls',f.join('; '));
    else good('workout','a workout runs set by set with a rest timer and saves; the scanner always offers typed entry','H2');
  }
  /* THE KEYBOARD STAYS OPEN (H0). On a phone, replacing the field being typed in closes the keyboard, even if focus is
     restored to the new copy. Every field of the logging and setup sheets is typed into character by character, and
     the focused element must be the same element after every character. The regions that depend on the typing must
     still update, or a field could keep focus only because nothing re-renders. */
  if(vp.name==='iPhone 15'){
    const lost=[],stale=[];
    const sweep=async(label,open,maxFields)=>{
      await page.evaluate(()=>{window.closeSheet&&window.closeSheet();document.querySelectorAll('[data-kb]').forEach(e=>e.removeAttribute('data-kb'));});await page.waitForTimeout(120);
      await page.evaluate(open);await page.waitForTimeout(220);
      const n=await page.evaluate(()=>{const bd=[...document.querySelectorAll('#editBackdrop.show, #logBackdrop.show')];const host=bd[bd.length-1];if(!host)return 0;
        const ins=[...host.querySelectorAll('input, textarea')].filter(i=>i.getClientRects().length&&!/^(hidden|range|checkbox|radio|file|date|time|datetime-local|button)$/.test(i.type));
        ins.forEach((i,k)=>i.setAttribute('data-kb',k));return ins.length;});
      for(let k=0;k<Math.min(n,maxFields||8);k++){const sel='[data-kb="'+k+'"]';if(!(await page.$(sel)))continue;
        const id=await page.evaluate(s=>{const i=document.querySelector(s);return i.id||i.getAttribute('aria-label')||'?';},sel);
        await page.focus(sel);await page.evaluate(s=>{window.__kb=document.querySelector(s);window.__kb.value='';},sel);
        for(const ch of '123'){await page.keyboard.type(ch);await page.waitForTimeout(50);
          if(!(await page.evaluate(()=>document.activeElement===window.__kb&&document.contains(window.__kb)))){lost.push(label+' / '+id);break;}}}};
    await sweep('weight',"window.dispatchAct('log.open','weight')");
    await sweep('food',"window.dispatchAct('log.open','food')");
    await sweep('session',"window.dispatchAct('session.new')");
    await sweep('setup',"window.openWelcome(1)");
    await sweep('profile',"window.dispatchAct('profile.edit')");
    await sweep('phase',"window.dispatchAct('phase.edit')");
    await sweep('exercise library',"window.dispatchAct('nav.exlibrary')",1);
    /* the dependent regions still update */
    await page.evaluate(()=>{window._LIB.q='';window.dispatchAct('nav.exlibrary');});await page.waitForTimeout(150);await page.focus('#libSearch');
    const c0=await page.evaluate(()=>document.querySelector('#editBackdrop .hint').textContent);await page.keyboard.type('glute');await page.waitForTimeout(150);
    const c1=await page.evaluate(()=>document.querySelector('#editBackdrop .hint').textContent);
    if(c0===c1)stale.push('exercise library count did not change while typing');
    if(!(await page.evaluate(()=>document.activeElement&&document.activeElement.id==='libSearch'&&document.activeElement.value==='glute')))stale.push('exercise search lost its text');
    /* The phase form warns when two or more major targets change at once: change the step target, then type a
       calorie target, and the warning must appear while the calorie field still has the keyboard. */
    await page.evaluate(()=>{window.closeSheet&&window.closeSheet();window.switchTab('plan');});await page.waitForTimeout(200);
    await page.click('#view-plan [data-act="phase.edit"]');await page.waitForTimeout(250);   /* the Edit targets button a person taps */
    await page.focus('#f_stepTarget');await page.evaluate(()=>{document.getElementById('f_stepTarget').value='';});await page.keyboard.type('13500');await page.waitForTimeout(120);
    await page.focus('#f_calorieTarget');await page.evaluate(()=>{window.__kb=document.getElementById('f_calorieTarget');window.__kb.value='';});await page.keyboard.type('1500');await page.waitForTimeout(150);
    const warned=await page.evaluate(()=>/major variables change at once/.test(document.getElementById('editBackdrop').textContent));
    const kept=await page.evaluate(()=>document.activeElement===window.__kb&&window.__kb.value==='1500');
    if(!warned)stale.push('the phase form did not warn when two major targets changed');
    if(!kept)stale.push('the calorie field did not keep its keyboard and text while the warning appeared');
    await page.evaluate(()=>{window.closeSheet&&window.closeSheet();window._LIB.q='';});
    if(lost.length)add('P1','keyboard','typing replaces the field being typed in, which closes a phone keyboard',lost.join(', '));
    else good('keyboard','every logging, setup, profile, phase and search field keeps the keyboard while typing','7 sheets');
    if(stale.length)add('P1','keyboard','a region that depends on the typing no longer updates',stale.join('; '));
  }
  /* NAVIGATION BY THE USER'S OWN PATH (H0). Each of these was counted as surfaced with no direct test; nav.section had no
     way in at all. Every one is exercised the way a person reaches it — a click or the palette — never by calling the
     action behind it. */
  if(vp.name==='iPhone 15'){
    const nav=[];const ok=(id,cond,d)=>nav.push({id,ok:!!cond,d:d||''});
    await page.evaluate(()=>{window.dispatchAct('settings.detail','developer');window.closeSheet&&window.closeSheet();});
    /* nav.tab — the tab bar */
    await page.click('[data-act="nav.tab"][data-arg="train"]');await page.waitForTimeout(120);
    ok('nav.tab',await page.evaluate(()=>window._TAB==='train'&&document.getElementById('view-train').getClientRects().length>0));
    /* nav.top — the jump-to-top button that appears after scrolling */
    await page.evaluate(()=>window.scrollTo(0,2400));await page.waitForTimeout(400);
    const upShown=await page.evaluate(()=>{const b=document.getElementById('upFab');return !!b&&!b.hidden&&b.getClientRects().length>0;});
    if(upShown){await page.click('#upFab');await page.waitForTimeout(700);}
    ok('nav.top',upShown&&await page.evaluate(()=>window.scrollY<10),upShown?'':'the button never appeared');
    /* nav.exercise — a row in the exercise library */
    await page.evaluate(()=>{window._LIB.q='';window.dispatchAct('nav.exlibrary');});await page.waitForTimeout(150);
    const exName=await page.evaluate(()=>{const r=document.querySelector('#editBackdrop .lib-row[data-act="nav.exercise"] .lib-name');return r&&r.textContent;});
    await page.click('#editBackdrop .lib-row[data-act="nav.exercise"]');await page.waitForTimeout(150);
    ok('nav.exercise',await page.evaluate(n=>!!document.querySelector('#editBackdrop .ex-anim svg')&&document.getElementById('editBackdrop').textContent.indexOf(n)>=0,exName));
    /* nav.routine — a routine in Mobility */
    await page.evaluate(()=>window.dispatchAct('nav.mobility'));await page.waitForTimeout(150);
    await page.click('#editBackdrop .lib-row[data-act="nav.routine"]');await page.waitForTimeout(150);
    ok('nav.routine',await page.evaluate(()=>document.querySelectorAll('#editBackdrop .mob-step').length>=3));
    await page.evaluate(()=>window.closeSheet&&window.closeSheet());
    /* nav.voi — the command palette, typed and chosen with Enter */
    const palette=async q=>{await page.evaluate(()=>window.openCmdk());await page.waitForTimeout(100);await page.fill('#cmdkInput',q);await page.waitForTimeout(150);await page.keyboard.press('Enter');await page.waitForTimeout(500);};
    await palette('worth measuring');
    /* Smooth scrolling takes time, so each check polls until it holds (up to 2 s) rather than sampling once mid-scroll. */
    const settle=async fn=>{for(let i=0;i<20;i++){if(await page.evaluate(fn))return true;await page.waitForTimeout(100);}return false;};
    ok('nav.voi',await settle(()=>{const e=document.getElementById('fold-learn-voi');if(!e||window._TAB!=='learn')return false;const r=e.getBoundingClientRect();return r.top>=0&&r.top<innerHeight;}));
    /* nav.section — a panel on the current page, found by its title in the palette */
    await page.click('[data-act="nav.tab"][data-arg="tools"]');await page.waitForTimeout(150);await page.evaluate(()=>window.scrollTo(0,0));
    await page.evaluate(()=>window.openCmdk());await page.waitForTimeout(100);await page.fill('#cmdkInput','storage and integrity');await page.waitForTimeout(200);
    const goItem=await page.evaluate(()=>{const it=[...document.querySelectorAll('#cmdkBackdrop .cmdk-item')].find(x=>/Go to: Storage and integrity/.test(x.textContent));if(!it)return false;it.setAttribute('data-test-target','1');return true;});
    if(goItem){await page.click('#cmdkBackdrop .cmdk-item[data-test-target="1"]');await page.waitForTimeout(500);}
    ok('nav.section',goItem&&await settle(()=>{const e=[...document.querySelectorAll('#view-tools .card, #view-tools details.fold')].find(x=>/^Storage and integrity/.test(window.panelTitle(x)));
      if(!e)return false;const r=e.getBoundingClientRect();return r.top>=0&&r.top<innerHeight*0.6;}),goItem?'':'no Go to: entry in the palette');
    await page.evaluate(()=>{window.dispatchAct('settings.detail','insightful');window.scrollTo(0,0);});
    const bad=nav.filter(x=>!x.ok);
    if(bad.length)add('P1','navigation','a navigation path does not work the way a person uses it',bad.map(x=>x.id+(x.d?' ('+x.d+')':'')).join(', '));
    else good('navigation','nav.tab, nav.top, nav.exercise, nav.routine, nav.voi and nav.section each work through the control a person uses','6 paths');
  }
  /* PANEL LEVELS — every panel is shown exactly at the detail levels its classification allows. */
  if(vp.name==='Desktop'||vp.name==='iPhone 15'){
    const wrong=[];
    for(const lvl of ['casual','insightful','developer']){await page.evaluate(l=>window.dispatchAct('settings.detail',l),lvl);await page.waitForTimeout(60);
      for(const t of ['today','log','plan','train','food','body','progress','diagnose','experiments','learn','archive','tools']){
        await page.evaluate(x=>window.switchTab(x),t);await page.waitForTimeout(60);
        const bad=await page.evaluate(([t,lvl])=>{const v=document.getElementById('view-'+t);if(!v||!v.getClientRects().length)return [];const rank={casual:0,insightful:1,developer:2};
          return [...v.querySelectorAll('.card, details.fold')].filter(e=>!e.parentElement.closest('.card, details.fold')).filter(e=>{
            const want=window.panelLevel(window.panelTitle(e));if(!want)return true;return (e.getClientRects().length>0)!==(rank[want]<=rank[lvl]);}).map(e=>lvl+'/'+t+': '+window.panelTitle(e).slice(0,30));},[t,lvl]);
        wrong.push(...bad);}}
    await page.evaluate(()=>window.dispatchAct('settings.detail','insightful'));
    if(wrong.length)add('P1','detail','a panel is shown at the wrong detail level, or has no classification',wrong.slice(0,4).join('; '));
    else good('detail','every panel is shown exactly at the levels its classification allows','99 panels \u00d7 3 levels');
  }
  /* CASUAL READS PLAINLY — no internal classification badges, hex codes, raw record ids or file-format names on the
     pages someone logging and following uses. */
  if(vp.name==='iPhone 15'){
    await page.evaluate(()=>window.dispatchAct('settings.detail','casual'));
    const hits=[];
    for(const t of ['today','log','plan','train','food','body','progress','tools']){await page.evaluate(x=>window.switchTab(x),t);await page.waitForTimeout(60);
      hits.push(...await page.evaluate(t=>{const out=[];const v=document.getElementById('view-'+t);const w=document.createTreeWalker(v,NodeFilter.SHOW_TEXT);let n;
        while((n=w.nextNode())){const el=n.parentElement;if(!el||!el.getClientRects().length)continue;const s=n.textContent.trim();
          if(/^(EMPIRICAL|DERIVED|MEASURED|PREDICTIVE|HEURISTIC|BLENDED|CALIBRATED|PRIOR|POLICY)$/.test(s)||/#[0-9a-f]{6}\b/i.test(s)||/\b(obs|ses|exp|pred|dec)-[a-z0-9]{6,}/.test(s)||/\bJSON\b/.test(s))
            out.push(t+': "'+s.slice(0,40)+'"');}return out;},t));}
    await page.evaluate(()=>window.dispatchAct('settings.detail','insightful'));
    if(hits.length)add('P1','casual','technical text on a page Casual shows',hits.slice(0,4).join('; '));
    else good('casual','Casual pages show no classification badges, hex codes, raw ids or file-format names','8 tabs');
  }
  /* WIDEST TEXT — the widest face at the largest size and spacing must not push any page sideways. A 1fr grid did,
     by up to 144 px, and nothing checked; every page is checked here on the smallest phone. */
  if(vp.name==='iPhone SE'){
    await page.evaluate(()=>{window.dispatchAct('settings.font','opendyslexic');window.dispatchAct('settings.textScale','XL');window.dispatchAct('settings.letterSpacing','wider');});
    const side=[];for(const t of ['today','log','plan','train','food','body','progress','diagnose','experiments','learn','archive','tools']){
      await page.evaluate(x=>window.switchTab(x),t);await page.waitForTimeout(60);
      const w=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);if(w>1)side.push(t+' +'+w+'px');}
    await page.evaluate(()=>{window.dispatchAct('settings.font','system');window.dispatchAct('settings.textScale','M');window.dispatchAct('settings.letterSpacing','normal');});
    if(side.length)add('P1','layout','a page scrolls sideways at the widest text settings',side.join(', '));
    else good('layout','no page scrolls sideways at the widest face, largest size and widest spacing','12 tabs');
  }
  /* CHARTS UNDER RAILS — the "charts clip into the left" report. The floating rails covered a chart's y-axis at
     every width up to 1024 px. Every chart is checked at several scroll positions, on the tabs that carry charts. */
  for(const tab of ['progress','train','today','body']){
    await page.evaluate(t=>window.switchTab(t),tab);await page.waitForTimeout(60);
    const under=await page.evaluate(async()=>{let hits=[];const H=document.documentElement.scrollHeight;
      for(let y=0;y<H;y+=200){window.scrollTo(0,y);await new Promise(r=>requestAnimationFrame(r));
        const rs=['railLeft','railRight'].map(id=>document.getElementById(id)).filter(e=>e&&getComputedStyle(e).display!=='none').map(e=>e.getBoundingClientRect());
        document.querySelectorAll('.card svg.chart,.card svg.chart-svg').forEach(s=>{const b=s.getBoundingClientRect();if(b.width<80||b.bottom<0||b.top>innerHeight)return;
          rs.forEach(rr=>{if(b.left<rr.right&&b.right>rr.left&&b.top<rr.bottom&&b.bottom>rr.top)hits.push(Math.round(b.left)+'..'+Math.round(b.right));});});}
      window.scrollTo(0,0);return hits;});
    if(under.length)add('P1','layout',`a chart sits under a floating rail on ${tab} at ${vp.name}`,under.slice(0,2).join('; '));
  }
  if(errors.length) add('P0','runtime',`uncaught page errors on ${vp.name}`,errors.slice(0,2).join(' | '));
  await ctx.close();
}
await browser.close();

/* ---------- report ---------- */
const P0=findings.filter(f=>f.sev==='P0').length;
const P1=findings.filter(f=>f.sev==='P1').length;
if(JSON_ONLY){
  console.log(JSON.stringify({findings,passes},null,1));
}else{
  const byArea={};
  passes.forEach(p=>{(byArea[p.area]=byArea[p.area]||[]).push(p.what);});
  Object.keys(byArea).sort().forEach(a=>
    console.log(`  ${a.padEnd(12)}${byArea[a].length} check(s)`));
  console.log(`\n${VIEWPORTS.length} viewports \u00d7 ${TABS.length} tabs measured in Chromium`);
  console.log(`${findings.length} finding(s): ${P0} P0, ${P1} P1`);
  findings.slice(0,20).forEach(f=>{
    console.log(`  ${f.sev}  [${f.area}] ${f.what}`);
    if(f.detail) console.log(`        ${f.detail}`);
  });
}
/* P1 findings fail the run too. They are real, visible defects — a clipped bar, an undersized control — and the
   gate used to exit 0 on them, so three of them passed a full check unnoticed. With the build now verified
   elsewhere by its exit code, a finding that does not fail is a finding nobody sees. */
process.exit((P0+P1)>0?1:0);
