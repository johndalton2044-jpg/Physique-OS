/* Finds a Chromium-family browser on Linux, macOS or Windows for the real-browser gate.
 *
 * The gate used to hard-code /opt/google/chrome/chrome, which exists in one environment only. Anywhere else it
 * would crash with an unhelpful error. Order of search: an explicit CHROME_PATH, then the standard install
 * locations for Chrome, Chromium and Edge on each platform, then Playwright's own browser cache. Returns null
 * if nothing is found, and callers treat that as a failure with instructions, never as a pass.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function playwrightCache(){
  const home=os.homedir();
  const roots=process.platform==='darwin'?[path.join(home,'Library','Caches','ms-playwright')]:
    process.platform==='win32'?[path.join(process.env.LOCALAPPDATA||path.join(home,'AppData','Local'),'ms-playwright')]:
    [path.join(home,'.cache','ms-playwright'),'/opt/pw-browsers'];
  if(process.env.PLAYWRIGHT_BROWSERS_PATH)roots.unshift(process.env.PLAYWRIGHT_BROWSERS_PATH);
  const found=[];
  for(const root of roots){
    let dirs=[];try{dirs=fs.readdirSync(root).filter(d=>/^chromium(_headless_shell)?-\d+/.test(d)).sort().reverse();}catch(e){continue;}
    for(const d of dirs){
      const base=path.join(root,d);
      found.push(path.join(base,'chrome-linux','chrome'),path.join(base,'chrome-linux','headless_shell'),
        path.join(base,'chrome-mac','Chromium.app','Contents','MacOS','Chromium'),
        path.join(base,'chrome-win','chrome.exe'));
    }
  }
  return found;
}

export function candidateBrowsers(){
  const pf=process.env.PROGRAMFILES||'C:\\Program Files';
  const pf86=process.env['PROGRAMFILES(X86)']||'C:\\Program Files (x86)';
  const lad=process.env.LOCALAPPDATA||'';
  const byPlatform={
    linux:['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser',
      '/snap/bin/chromium','/opt/google/chrome/chrome','/usr/bin/microsoft-edge'],
    darwin:['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
    win32:[path.join(pf,'Google','Chrome','Application','chrome.exe'),path.join(pf86,'Google','Chrome','Application','chrome.exe'),
      lad?path.join(lad,'Google','Chrome','Application','chrome.exe'):null,
      path.join(pf86,'Microsoft','Edge','Application','msedge.exe'),path.join(pf,'Microsoft','Edge','Application','msedge.exe')]
  };
  return [process.env.CHROME_PATH].concat(byPlatform[process.platform]||byPlatform.linux,playwrightCache()).filter(Boolean);
}

export function findBrowser(){
  for(const p of candidateBrowsers()){
    try{if(fs.statSync(p).isFile())return p;}catch(e){}
  }
  return null;
}

export const BROWSER_HELP=[
  'No Chromium-family browser was found for the real-browser gate.',
  'Either install Google Chrome, Chromium or Microsoft Edge, or run:',
  '    npx playwright install chromium',
  'or point the gate at a browser explicitly:',
  '    CHROME_PATH=/path/to/chrome npm run check',
  'To skip this gate knowingly (the run will be reported as NOT verified in a browser):',
  '    PHYSIQUE_SKIP_BROWSER=1 npm run check'
].join('\n');
