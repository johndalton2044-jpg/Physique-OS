/* TIME ZONES. The release checks run in UTC, where a timestamp's date and the local date always agree; a device in the
   US evening or east of UTC+12 disagrees, and that hid entries logged after 8 pm Eastern from "today" until
   midnight (found on a phone in the US). The full self-test runs at awkward local hours in three zones. */
import {chromium} from 'playwright-core';import path from 'node:path';import {findBrowser} from './_browser-path.mjs';
if(process.env.PHYSIQUE_SKIP_BROWSER==='1'){console.log('  SKIPPED  timezones \u2014 PHYSIQUE_SKIP_BROWSER=1, NOT verified');process.exit(0);}
let failed=0;const line=(ok,msg,d)=>{if(!ok)failed++;console.log('  '+(ok?'pass':'FAIL')+'  '+msg+(d&&!ok?'  \u2014 '+d:''));};
setTimeout(()=>{console.log('  FAIL  the time-zone test did not finish within 280 s');process.exit(1);},280000).unref();
const b=await chromium.launch({executablePath:findBrowser(),args:['--no-sandbox','--disable-dev-shm-usage']});
for(const [tz,iso,label] of [['America/New_York','2026-09-28T01:30:00Z','9:30 pm in New York (UTC is already tomorrow)'],['Pacific/Kiritimati','2026-09-27T11:00:00Z','1 am in Kiritimati, UTC+14 (UTC is still yesterday)'],['Pacific/Pago_Pago','2026-09-28T09:30:00Z','10:30 pm in Pago Pago, UTC\u221211']]){
  const ctx=await b.newContext({timezoneId:tz});const p=await ctx.newPage();await p.clock.setFixedTime(new Date(iso));
  await p.goto('file://'+path.resolve('dist/index.html'));await p.waitForFunction(()=>typeof window.loadDemo==='function');await p.evaluate(()=>window.loadDemo());
  const r=await p.evaluate(()=>{const o=window.runSelfTest({quiet:true});return {passed:o.passed,failed:o.failed,which:(o.results||o.checks||[]).filter(x=>!x.ok).slice(0,3).map(x=>String(x.name||x.label).slice(0,80))};});
  line(r.failed===0&&r.passed>1400,'the full self-test passes at '+label+' ('+r.passed+' checks)',JSON.stringify(r.which));
  const v=await p.evaluate(()=>{window.addObservation({type:'water',date:window.todayISO(),value:0.3,source:'manual'});return (window.seriesWindow('water',1)[0]||{}).obs.some(o=>o.value===0.3);});
  line(v,'something logged now is part of today at '+label);await ctx.close();}
await b.close();console.log(failed?failed+' failed':'all passed');process.exit(failed?1:0);
