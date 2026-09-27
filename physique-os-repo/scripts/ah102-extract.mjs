#!/usr/bin/env node
/* USDA Agriculture Handbook 102 — food yield extraction.
 *
 * I previously reported this handbook as not machine-extractable. That was wrong, and the reason is worth
 * recording: I had OCR'd it at 130 DPI, where the numeric columns garble ("77" became "77 | 88 to OB"). At
 * 300 DPI the same columns are legible. The obstacle was resolution, not the document.
 *
 * A wrong yield factor silently misstates every cooked-food entry that uses it, so legibility alone is not
 * enough to justify shipping numbers. This extractor therefore accepts a value only when it survives:
 *
 *   1. TWO INDEPENDENT OCR PASSES that agree exactly. The passes differ in page segmentation mode and in
 *      binarisation, so they fail differently; a digit misread by both in the same way is unlikely, and a
 *      digit misread by one is caught as disagreement rather than averaged into a plausible-looking wrong
 *      number.
 *   2. STRUCTURAL VALIDATION — an item number, a yield percentage, and where a range is present it must
 *      bracket the average. A row whose range does not contain its own mean has been misread.
 *   3. PHYSICAL VALIDATION — yields between 5% and 400%. Cooking loses moisture (a yield below 100%) or
 *      absorbs water, as with dry beans and pasta (above 100%). Nothing outside that band is real.
 *
 * Everything rejected is reported with its reason. The output is deliberately partial and says so: a
 * handbook half-extracted with every value verified is worth more than one fully extracted with silent
 * errors in it.
 *
 *   node scripts/ah102-extract.mjs --pdf ah102.pdf --from 20 --to 40 --out dist/data/reference/yields.json
 */
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import crypto from 'node:crypto';

const args=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,arr)=>(v.startsWith('--')?[...a,[v.slice(2),arr[i+1]]]:a),[]));
const PDF=args.pdf||'/mnt/user-data/uploads/ah102.pdf';
const FROM=+(args.from||6), TO=+(args.to||131);
const DPI=+(args.dpi||300);
const OUT=args.out||'dist/data/reference/yields.json';
const WORK=args.work||'/tmp/ah102-extract';
const REPORT=args.report||'/tmp/ah102-report.json';

if(!fs.existsSync(PDF)){console.error('no such PDF: '+PDF);process.exit(1);}
fs.mkdirSync(WORK,{recursive:true});

const sh=(cmd,a)=>{try{return execFileSync(cmd,a,{encoding:'utf8',maxBuffer:64*1024*1024,timeout:120000});}catch(e){return '';}};

/* A data row looks like:  <item#> <description> <ave> <lo> to <hi> ... 
   The description is prose and OCRs unreliably; the NUMBERS are what must be exact, so parsing is anchored
   on the numeric tail and the description is captured only as a label. */
/* A row in this handbook carries SEVERAL numeric column groups: the yield of the prepared food, and then
   the losses that account for the rest (net losses, drippings, volatiles). They look identical to a regular
   expression — "70 69 to 72" and "30 28 to 31" are the same shape — and picking the wrong one produces a
   number that is plausible, verifiable, internally consistent, and wrong.
   
   This was not hypothetical: an earlier version of this script extracted item 326 as a 30% yield when the
   true figure is 70%, because it locked onto the net-loss column. Both OCR passes agreed, because both read
   the same wrong column. AGREEMENT PROVES OCR FIDELITY, NOT COLUMN SEMANTICS.
   
   So a row is only usable when exactly ONE numeric group can be identified. Anything with several is
   ambiguous and is rejected, because there is no way to tell from the text alone which column is the yield
   without the table geometry that OCR has already discarded. */
const GROUP=/(\d{1,3})\s*[|\]\)]?\s+(\d{1,3})\s*(?:to|-|\u2014)\s*(\d{1,3})/g;
function parseRows(text,page){
  const rows=[];
  for(const line of text.split('\n')){
    const l=line.replace(/\s+/g,' ').trim();
    if(!l)continue;
    const im=/^(\d{1,4})\s+(.+)$/.exec(l);
    if(!im)continue;
    const item=+im[1];
    const rest=im[2];
    GROUP.lastIndex=0;
    const groups=[];let g;
    while((g=GROUP.exec(rest)))groups.push({ave:+g[1],lo:+g[2],hi:+g[3],at:g.index});
    if(groups.length===0){rows.push({item,label:rest.slice(0,60),ave:null,lo:null,hi:null,page,
      ambiguous:false,reason:'no numeric group on this line'});continue;}
    if(groups.length>1){
      rows.push({item,label:rest.slice(0,60),ave:groups[0].ave,lo:groups[0].lo,hi:groups[0].hi,page,
        ambiguous:true,groups:groups.map(x=>x.ave+' ('+x.lo+'\u2013'+x.hi+')'),
        reason:'this line carries '+groups.length+' numeric columns (yield and losses look identical in text); the table geometry needed to tell them apart is lost in OCR'});
      continue;
    }
    /* One clean group is still not enough. When a NEIGHBOURING column garbles ("66 612 tO 77" instead of
       "66 | 61 to 77") the regex stops seeing it, the line looks unambiguous, and the group it does find is
       the LOSS column — which is exactly how item 363 was extracted as a 34% yield when the true figure is
       66%. So any stray two- or three-digit number BEFORE the matched group means a column was missed, and
       the row is rejected. */
    const before=rest.slice(0,groups[0].at);
    if(/\d{2,3}/.test(before)){
      rows.push({item,label:rest.slice(0,60),ave:groups[0].ave,lo:groups[0].lo,hi:groups[0].hi,page,
        ambiguous:true,reason:'a number appears before the matched group ("'+before.replace(/\s+/g,' ').trim().slice(-30)+'"), so an earlier column was misread and the group found is probably the losses rather than the yield'});
      continue;
    }
    rows.push({item,label:before.replace(/[.]{2,}/g,' ').replace(/[|\]]/g,' ').replace(/\s+/g,' ').trim(),
      ave:groups[0].ave,lo:groups[0].lo,hi:groups[0].hi,page,ambiguous:false});
  }
  return rows;
}
function validate(r){
  const reasons=[];
  if(r.ambiguous)reasons.push(r.reason);
  if(r.ave==null)reasons.push(r.reason||'no value');
  if(!(r.item>0&&r.item<10000))reasons.push('item number out of range');
  if(!(r.ave>=5&&r.ave<=400))reasons.push('yield '+r.ave+'% is outside anything physically possible');
  if(r.lo!=null&&r.hi!=null){
    if(r.lo>r.hi)reasons.push('range is inverted');
    else if(!(r.ave>=r.lo-1&&r.ave<=r.hi+1))reasons.push('the average '+r.ave+' is outside its own range '+r.lo+'\u2013'+r.hi);
    if(r.hi-r.lo>80)reasons.push('range is implausibly wide');
  }
  if(!r.label||r.label.length<3)reasons.push('no usable description');
  return reasons;
}

const accepted=[], rejected=[], pageStats=[];
console.log('rendering and reading pages '+FROM+'\u2013'+TO+' at '+DPI+' DPI (two independent passes each)');

for(let p=FROM;p<=TO;p++){
  const base=path.join(WORK,'p'+String(p).padStart(3,'0'));
  if(!fs.existsSync(base+'.pgm')){
    sh('pdftoppm',['-f',String(p),'-l',String(p),'-r',String(DPI),'-gray','-singlefile',PDF,base]);
  }
  if(!fs.existsSync(base+'.pgm')){pageStats.push({page:p,error:'render failed'});continue;}
  /* Pass A: page-as-block, default binarisation. */
  const a=sh('tesseract',[base+'.pgm','-','--psm','6','-c','preserve_interword_spaces=1']);
  /* Pass B: different segmentation AND a different threshold, so the two passes fail in different ways.
     Agreement between them is then meaningful rather than the same error twice. */
  const b=sh('tesseract',[base+'.pgm','-','--psm','4','-c','preserve_interword_spaces=1','-c','thresholding_method=1']);
  const ra=parseRows(a,p), rb=parseRows(b,p);
  const byItemB=new Map(rb.map(r=>[r.item,r]));
  let agreed=0,disagreed=0,invalid=0;
  for(const r of ra){
    const other=byItemB.get(r.item);
    if(!other){rejected.push({...r,reason:'the second pass did not find this row'});disagreed++;continue;}
    if(r.ambiguous||other.ambiguous){rejected.push({...r,reason:r.reason||other.reason});invalid++;continue;}
    if(other.ave!==r.ave||other.lo!==r.lo||other.hi!==r.hi){
      rejected.push({...r,reason:'the two passes disagreed: '+r.ave+'/'+r.lo+'\u2013'+r.hi+' vs '+other.ave+'/'+other.lo+'\u2013'+other.hi});
      disagreed++;continue;
    }
    const bad=validate(r);
    if(bad.length){rejected.push({...r,reason:bad.join('; ')});invalid++;continue;}
    accepted.push(r);agreed++;
  }
  pageStats.push({page:p,passA:ra.length,passB:rb.length,agreed,disagreed,invalid});
  process.stdout.write('  p'+p+': '+agreed+' verified, '+disagreed+' disagreed, '+invalid+' invalid\n');
}

/* Rows are keyed by AH-102 item number, which is what the handbook itself uses to cite a yield. */
const items={};
for(const r of accepted){
  items[String(r.item)]={from:'as listed in AH-102 item '+r.item,to:r.label,
    factor:Math.round(r.ave)/100,range:(r.lo!=null?r.lo+'\u2013'+r.hi+'%':''),page:r.page,
    verification:'two independent OCR passes agreed and the value passed structural and physical validation'};
}
const body={source:'USDA Agriculture Handbook 102, Food Yields Summarized by Different Stages of Preparation',
  version:'AH-102 (OCR extraction)',builtAt:new Date().toISOString(),
  unit:'weight after preparation as a fraction of weight before',
  method:'Rendered at '+DPI+' DPI and read twice with different segmentation and binarisation. A value is kept only where both passes agree exactly and it passes structural and physical validation. Everything else is rejected and listed in the report.',
  coverage:{pagesRead:pageStats.length,pagesRequested:TO-FROM+1,accepted:accepted.length,rejected:rejected.length,
    acceptanceRate:accepted.length+rejected.length?Math.round(100*accepted.length/(accepted.length+rejected.length)):0},
  caveat:'PARTIAL. This covers the pages that were read and only the rows that survived verification. A missing item number means the row was not verifiable, never that its yield is 1.0.',
  items:items,count:Object.keys(items).length};

fs.mkdirSync(path.dirname(OUT),{recursive:true});
fs.writeFileSync(OUT,JSON.stringify(body));
const sumPath=path.join(path.dirname(OUT),'SHA256SUMS');
const existing=fs.existsSync(sumPath)?fs.readFileSync(sumPath,'utf8').split('\n').filter(l=>l&&!/\byields\.json$/.test(l)):[];
existing.push(crypto.createHash('sha256').update(fs.readFileSync(OUT)).digest('hex')+'  '+path.basename(OUT));
fs.writeFileSync(sumPath,existing.filter(Boolean).join('\n')+'\n');

fs.writeFileSync(REPORT,JSON.stringify({pageStats,rejected:rejected.slice(0,400),accepted:accepted.length},null,1));
console.log('\n'+JSON.stringify(body.coverage));
console.log('wrote '+OUT+' ('+body.count+' verified items)');
console.log('rejection detail: '+REPORT);
