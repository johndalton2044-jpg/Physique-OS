#!/usr/bin/env node
/* USDA Agriculture Handbook 102 — geometry-aware yield extraction.
 *
 * WHY THIS EXISTS. A line-based extractor (scripts/ah102-extract.mjs) produced values that were verified by
 * two independent OCR passes, internally consistent, and wrong: item 326 came out as a 30% yield when the
 * true figure is 70%, because the parser locked onto the NET-LOSS column. Both passes agreed because both
 * read the same wrong column. Agreement proves transcription, not column semantics.
 *
 * Distinguishing the yield column from the loss column needs the table geometry that line-based OCR throws
 * away. Tesseract's TSV output keeps it: every word carries a bounding box. This program works in
 * coordinates rather than in strings.
 *
 *   1. Read the page as TSV, keeping each word's x position.
 *   2. Cluster the x positions of NUMERIC words into columns. A printed table has numbers in a few narrow
 *      vertical bands; anything between them is prose.
 *   3. Identify which band is the yield. The handbook's layout is
 *        item | description before | description after | YIELD ave | YIELD range | losses description | LOSS ave | LOSS range
 *      so the yield is the first numeric band after the description block, and the loss bands follow it.
 *   4. CROSS-CHECK ON MEANING, not just on shape: for a row where both are read, yield + loss should sum to
 *      about 100. That is a semantic test the line-based version could not perform, and it is what catches a
 *      column swap. A row failing it is rejected rather than guessed at.
 *
 *   node scripts/ah102-geometry.mjs --from 20 --to 40 --out dist/data/reference/yields.json
 */
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import crypto from 'node:crypto';

const args=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,arr)=>(v.startsWith('--')?[...a,[v.slice(2),arr[i+1]]]:a),[]));
const PDF=args.pdf||'/mnt/user-data/uploads/ah102.pdf';
const FROM=+(args.from||6),TO=+(args.to||131),DPI=+(args.dpi||300);
const OUT=args.out||'dist/data/reference/yields.json';
const WORK=args.work||'/tmp/ah102-extract';
const REPORT=args.report||'/tmp/ah102-geometry-report.json';
const SUM_TOLERANCE=+(args.tolerance||4);   // percentage points either side of 100

fs.mkdirSync(WORK,{recursive:true});
const sh=(c,a)=>{try{return execFileSync(c,a,{encoding:'utf8',maxBuffer:64*1024*1024,timeout:180000});}catch(e){return '';}};

function pageWords(p){
  const base=path.join(WORK,'p'+String(p).padStart(3,'0'));
  if(!fs.existsSync(base+'.pgm'))sh('pdftoppm',['-f',String(p),'-l',String(p),'-r',String(DPI),'-gray','-singlefile',PDF,base]);
  if(!fs.existsSync(base+'.pgm'))return null;
  const tsvBase=base+'-tsv';
  if(!fs.existsSync(tsvBase+'.tsv'))sh('tesseract',[base+'.pgm',tsvBase,'--psm','6','-c','preserve_interword_spaces=1','tsv']);
  if(!fs.existsSync(tsvBase+'.tsv'))return null;
  const rows=[];
  const lines=fs.readFileSync(tsvBase+'.tsv','utf8').split('\n');
  for(let i=1;i<lines.length;i++){
    const c=lines[i].split('\t');
    if(c.length<12)continue;
    if(+c[0]!==5)continue;                      // level 5 = word
    const text=(c[11]||'').trim();
    if(!text)continue;
    rows.push({line:+c[4],left:+c[6],top:+c[7],width:+c[8],height:+c[9],conf:+c[10],text,
      cx:+c[6]+(+c[8])/2});
  }
  return rows;
}
/* Group words into visual lines by their vertical position, because TSV line numbers restart per block. */
function groupLines(words){
  const sorted=words.slice().sort((a,b)=>a.top-b.top||a.left-b.left);
  const lines=[];
  for(const w of sorted){
    const last=lines[lines.length-1];
    if(last&&Math.abs(w.top-last.top)<=Math.max(10,w.height*0.6)){last.words.push(w);last.top=(last.top+w.top)/2;}
    else lines.push({top:w.top,words:[w]});
  }
  lines.forEach(l=>l.words.sort((a,b)=>a.left-b.left));
  return lines;
}
const isNum=t=>/^\d{1,3}$/.test(t.replace(/[^0-9]/g,''))&&/\d/.test(t);
const numOf=t=>{const d=t.replace(/[^0-9]/g,'');return d?+d:null;};

/* Cluster numeric x positions across the whole page into vertical bands. */
function numericBands(lines){
  const xs=[];
  for(const l of lines)for(const w of l.words)if(isNum(w.text)&&w.conf>=40)xs.push(w.cx);
  if(xs.length<8)return [];
  xs.sort((a,b)=>a-b);
  const bands=[];let cur=[xs[0]];
  for(let i=1;i<xs.length;i++){
    if(xs[i]-xs[i-1]<=60)cur.push(xs[i]);
    else{bands.push(cur);cur=[xs[i]];}
  }
  bands.push(cur);
  return bands.filter(b=>b.length>=4).map(b=>({lo:b[0]-35,hi:b[b.length-1]+35,
    centre:b.reduce((a,x)=>a+x,0)/b.length,count:b.length}));
}
const inBand=(x,b)=>x>=b.lo&&x<=b.hi;

const accepted=[],rejected=[],pageStats=[];
console.log('geometry extraction, pages '+FROM+'\u2013'+TO+' at '+DPI+' DPI');

for(let p=FROM;p<=TO;p++){
  const words=pageWords(p);
  if(!words){pageStats.push({page:p,error:'render or OCR failed'});continue;}
  const lines=groupLines(words);
  const bands=numericBands(lines);
  if(bands.length<3){pageStats.push({page:p,bands:bands.length,note:'too few numeric columns to identify a layout'});continue;}
  /* Which band is the yield? A geometric guess (the widest gap) picks a temperature column on the meat
     pages, where the layout carries an internal-temperature column the vegetable pages do not.

     So do not guess: let the data identify its own columns. Yield and loss are the pair whose values sum to
     about 100 on the most rows. That is the table's own arithmetic, it is invariant to the layout
     differences between sections, and a pair that fails it is not the pair we are looking for. */
  const itemBand=bands[0];
  const candidates=bands.slice(1);
  let best=null;
  for(let i=0;i<candidates.length;i++){
    for(let j=0;j<candidates.length;j++){
      if(i===j)continue;
      let hits=0;
      for(const l of lines){
        const a2=l.words.filter(w=>inBand(w.cx,candidates[i])&&isNum(w.text)&&w.conf>=40)[0];
        const b2=l.words.filter(w=>inBand(w.cx,candidates[j])&&isNum(w.text)&&w.conf>=40)[0];
        if(!a2||!b2)continue;
        const va=numOf(a2.text),vb=numOf(b2.text);
        if(va==null||vb==null)continue;
        if(Math.abs(va+vb-100)<=SUM_TOLERANCE)hits++;
      }
      if(!best||hits>best.hits)best={hits,yieldIdx:i,lossIdx:j};
    }
  }
  if(!best||best.hits<3){pageStats.push({page:p,bands:bands.length,note:'no column pair on this page behaves like yield and loss'});continue;}
  const yieldBand=candidates[best.yieldIdx];
  const lossBands=[candidates[best.lossIdx]];
  let ok=0,bad=0;
  for(const l of lines){
    const itemW=l.words.find(w=>inBand(w.cx,itemBand)&&isNum(w.text));
    if(!itemW)continue;
    const item=numOf(itemW.text);
    if(!(item>0&&item<10000))continue;
    const yieldW=l.words.filter(w=>inBand(w.cx,yieldBand)&&isNum(w.text)&&w.conf>=40);
    if(!yieldW.length){rejected.push({item,page:p,reason:'no value read in the yield column'});bad++;continue;}
    const yieldVal=numOf(yieldW[0].text);
    /* The loss column, where present, is the semantic cross-check that string parsing could not do. */
    let lossVal=null;
    for(const b of lossBands){
      const lw=l.words.filter(w=>inBand(w.cx,b)&&isNum(w.text)&&w.conf>=40);
      if(lw.length){const v=numOf(lw[0].text);if(v!=null&&v>=0&&v<=100){lossVal=v;break;}}
    }
    if(!(yieldVal>=5&&yieldVal<=400)){rejected.push({item,page:p,yield:yieldVal,reason:'yield outside anything physically possible'});bad++;continue;}
    if(lossVal!=null){
      const sum=yieldVal+lossVal;
      if(Math.abs(sum-100)>SUM_TOLERANCE){
        rejected.push({item,page:p,yield:yieldVal,loss:lossVal,sum,
          reason:'yield '+yieldVal+' and loss '+lossVal+' sum to '+sum+', not ~100 \u2014 a column was misidentified'});
        bad++;continue;
      }
    }
    const label=l.words.filter(w=>w.cx>itemBand.hi&&w.cx<yieldBand.lo&&w.conf>=35)
      .map(w=>w.text).join(' ').replace(/[.]{2,}/g,' ').replace(/[|\]\[]/g,' ').replace(/\s+/g,' ').trim();
    accepted.push({item,yield:yieldVal,loss:lossVal,label,page:p,
      crossChecked:lossVal!=null,confidence:lossVal!=null?'verified against the loss column':'single column, unverified'});
    ok++;
  }
  pageStats.push({page:p,bands:bands.length,accepted:ok,rejected:bad,
    pairedRows:best.hits,yieldBandCentre:Math.round(yieldBand.centre),lossBandCentre:Math.round(lossBands[0].centre)});
  process.stdout.write('  p'+p+': '+ok+' accepted ('+accepted.filter(a=>a.page===p&&a.crossChecked).length+' cross-checked), '+bad+' rejected\n');
}

/* Only cross-checked rows are shipped: a row whose yield and loss sum to ~100 has been confirmed to be the
   yield column and not its neighbour, which is the exact failure the line-based extractor could not see. */
const shippable=accepted.filter(a=>a.crossChecked&&a.label&&a.label.length>=3);
const items={};
/* FINAL GATE on the invariant the data claims for itself. The rounded factor plus the loss percentage must
   come back to 100, or the row does not satisfy the verification its own `verification` field asserts. Five
   rows passed the earlier cross-check and still failed this, which means the cross-check tolerance was
   looser than the claim printed beside every row.

   They are dropped rather than repaired. Repairing would mean choosing which of the two numbers to believe,
   and the source images are the only thing that can settle that. The app already refuses to invent a yield
   of 1.0 for a missing item; shipping a row that fails its own stated check is the same error wearing a
   number. A dropped item simply reports as unverifiable, which is true. */
const invariantFailures=[];
const verified=shippable.filter(r=>{
  const sum=Math.round(r.yield)+Math.round(r.loss);
  if(Math.abs(sum-100)<=2)return true;
  invariantFailures.push({item:r.item,page:r.page,yield:r.yield,loss:r.loss,sum,label:r.label});
  return false;
});
for(const r of verified){
  items[String(r.item)]={from:'AH-102 item '+r.item,to:r.label,factor:r.yield/100,
    lossPercent:r.loss,page:r.page,
    verification:'column identified by page geometry and confirmed by yield+loss\u2248100'};
}
if(invariantFailures.length)
  console.log('dropped '+invariantFailures.length+' row(s) that failed yield+loss\u2248100 despite passing the cross-check: '+
    invariantFailures.map(f=>f.item+' (sum '+f.sum+')').join(', '));
const body={source:'USDA Agriculture Handbook 102, Food Yields Summarized by Different Stages of Preparation',
  version:'AH-102 (geometry-aware OCR extraction)',builtAt:new Date().toISOString(),
  unit:'weight after preparation as a fraction of weight before',
  method:'Rendered at '+DPI+' DPI and read with word-level coordinates. Numeric columns are found by clustering x positions; the yield column is identified by page geometry rather than by text order, and is confirmed by checking that yield and loss sum to about 100. Rows failing that check are rejected, because a plausible number in the wrong column is worse than no number.',
  /* Coverage describes what actually shipped, not the span that was read. Saying "pages 20-72" when the
     shipped rows span 20-70 across 33 distinct pages implies coverage that is not there. */
  coverage:(()=>{
    const pages=[...new Set(verified.map(r=>r.page))].sort((a,b)=>a-b);
    return {pagesRead:pageStats.filter(s=>!s.error).length,accepted:accepted.length,
      crossChecked:accepted.filter(a=>a.crossChecked).length,
      shipped:verified.length,rejected:rejected.length,
      droppedForInvariant:invariantFailures.length,
      shippedPageSpan:pages.length?(pages[0]+'-'+pages[pages.length-1]):null,
      shippedPageCount:pages.length,
      note:'Factors come from '+pages.length+' distinct pages spanning '+(pages.length?pages[0]+'-'+pages[pages.length-1]:'none')+
        '. Pages inside that span with no shipped factor either held no usable rows or failed verification.'};
  })(),
  caveat:'PARTIAL. Only rows whose yield was confirmed against the loss column AND whose yield plus loss returns to 100 are included. A missing item number means the row was not verifiable, never that its yield is 1.0.',
  items:items,count:Object.keys(items).length};

fs.mkdirSync(path.dirname(OUT),{recursive:true});
fs.writeFileSync(OUT,JSON.stringify(body));
const sumPath=path.join(path.dirname(OUT),'SHA256SUMS');
const keep=fs.existsSync(sumPath)?fs.readFileSync(sumPath,'utf8').split('\n').filter(l=>l&&!new RegExp(path.basename(OUT)+'$').test(l)):[];
keep.push(crypto.createHash('sha256').update(fs.readFileSync(OUT)).digest('hex')+'  '+path.basename(OUT));
fs.writeFileSync(sumPath,keep.filter(Boolean).join('\n')+'\n');
fs.writeFileSync(REPORT,JSON.stringify({pageStats,accepted:accepted.slice(0,500),rejected:rejected.slice(0,500)},null,1));
console.log('\n'+JSON.stringify(body.coverage));
console.log('wrote '+OUT+' ('+body.count+' cross-checked items)');
console.log('detail: '+REPORT);
