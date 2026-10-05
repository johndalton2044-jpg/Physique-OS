#!/usr/bin/env node
/* Applies the invariant gate to an already-built yields.json, so the shipped table satisfies the check that
 * every row's own `verification` field asserts. Same rule as scripts/ah102-geometry.mjs; this exists so the
 * artifact can be brought in line without a multi-hour re-OCR, since the gate is a pure function of the rows.
 *   node scripts/yields-gate.mjs [--check]
 * --check exits non-zero instead of rewriting, for use as a build gate.
 */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
/* the controlled input in data/reference, never the distribution (a gate that wrote into dist made it unreproducible) */
const OUT=path.resolve(process.env.YIELDS_PATH||'data/reference/yields.json');
const CHECK=process.argv.includes('--check');
if(!fs.existsSync(OUT)){console.error('yields gate: '+OUT+' is missing; it is a controlled input of the build');process.exit(1);}
const y=JSON.parse(fs.readFileSync(OUT,'utf8'));
const failures=[];
const kept={};
for(const [id,r] of Object.entries(y.items||{})){
  const sum=Math.round(r.factor*100)+Math.round(r.lossPercent);
  if(r.lossPercent==null||Math.abs(sum-100)<=2)kept[id]=r;
  else failures.push({item:id,page:r.page,factor:r.factor,loss:r.lossPercent,sum});
}
if(CHECK){
  if(failures.length){
    console.error('yields gate FAILED: '+failures.length+' row(s) violate yield+loss\u2248100 while claiming it');
    failures.forEach(f=>console.error('  item '+f.item+' p'+f.page+': '+Math.round(f.factor*100)+'% + '+f.loss+'% = '+f.sum));
    process.exit(1);
  }
  console.log('yields gate: '+Object.keys(y.items).length+' rows, all satisfy yield+loss\u2248100');
  process.exit(0);
}
if(!failures.length){console.log('nothing to drop; all rows already satisfy the invariant');process.exit(0);}
const pages=[...new Set(Object.values(kept).map(r=>r.page))].sort((a,b)=>a-b);
y.items=kept;
y.count=Object.keys(kept).length;
y.coverage=Object.assign({},y.coverage,{
  shipped:y.count,
  droppedForInvariant:failures.length,
  shippedPageSpan:pages.length?(pages[0]+'-'+pages[pages.length-1]):null,
  shippedPageCount:pages.length,
  note:'Factors come from '+pages.length+' distinct pages spanning '+(pages[0]+'-'+pages[pages.length-1])+
    '. Pages inside that span with no shipped factor either held no usable rows or failed verification.'});
delete y.coverage.pageRange;
y.caveat='PARTIAL. Only rows whose yield was confirmed against the loss column AND whose yield plus loss returns to 100 are included. '+
  failures.length+' row(s) passed the cross-check but failed that arithmetic and were dropped rather than repaired: choosing which of the two numbers to believe needs the source images. '+
  'A missing item number means the row was not verifiable, never that its yield is 1.0.';
fs.writeFileSync(OUT,JSON.stringify(y));
const dir=path.dirname(OUT), sumPath=path.join(dir,'SHA256SUMS');
const keep=fs.existsSync(sumPath)?fs.readFileSync(sumPath,'utf8').split('\n').filter(l=>l&&!l.endsWith(path.basename(OUT))):[];
keep.push(crypto.createHash('sha256').update(fs.readFileSync(OUT)).digest('hex')+'  '+path.basename(OUT));
fs.writeFileSync(sumPath,keep.filter(Boolean).join('\n')+'\n');
console.log('dropped '+failures.length+' row(s): '+failures.map(f=>f.item+' (sum '+f.sum+')').join(', '));
console.log('shipped '+y.count+' factors across '+pages.length+' pages, span '+y.coverage.shippedPageSpan);
