#!/usr/bin/env node
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

function validReport(report) {
  const text=value=>typeof value==='string' && value.length>0;
  const count=value=>Number.isSafeInteger(value) && value>=0;
  const number=value=>typeof value==='number' && Number.isFinite(value) && value>=0;
  const id=value=>typeof value==='string' && /^[A-Za-z][A-Za-z0-9_-]*$/.test(value);
  if(report?.schemaVersion!==1 || !text(report.rendererVersion) || typeof report.sourceSha256!=='string' || !/^[a-f0-9]{64}$/.test(report.sourceSha256)
    || JSON.stringify(report.checks)!=='["geometry","all-declared-views"]' || report.humanVisualReview!=='not-performed' || report.sourceAccuracy!=='not-checked'
    || !Array.isArray(report.views) || !report.views.length)return false;
  const ids=new Set();let failed=false;
  for(const view of report.views){
    if(!view || !id(view.viewId) || ids.has(view.viewId) || !Array.isArray(view.findings))return false;
    ids.add(view.viewId);
    for(const finding of view.findings){
      if(!finding || !['geometry-overlap','edge-crossing','route-stretch','short-segment'].includes(finding.code)
        || finding.severity!==(finding.code==='geometry-overlap'?'error':'warning') || !text(finding.message) || !text(finding.suggestion)
        || !Array.isArray(finding.subjects) || !finding.subjects.length
        || finding.subjects.some(s=>!s || !['node','edge','edge-label','group','group-header'].includes(s.kind) || !id(s.id) || (s.index!==undefined && !count(s.index)) || (s.pathIndex!==undefined && !count(s.pathIndex)))
        || (finding.measured!==undefined && !number(finding.measured)) || (finding.limit!==undefined && !number(finding.limit)))return false;
    }
    let viewFailed;
    if(view.metrics===null){
      if(view.error?.code!=='compile-failed' || !text(view.error.message) || view.findings.length)return false;
      viewFailed=true;
    }else{
      const m=view.metrics;
      if(!m || !count(m.overlaps) || !count(m.crossings) || !number(m.length) || !count(m.bends) || view.error!==undefined)return false;
      viewFailed=view.findings.some(f=>f.severity==='error');
      if(viewFailed!==(m.overlaps>0))return false;
    }
    if(view.status!==(viewFailed?'failed':'passed'))return false;
    failed ||= viewFailed;
  }
  return report.status===(failed?'failed':'passed');
}

const result={status:'failed',artifactSha256:null,browserVersion:null,report:null,errors:[]};
let browser,directory,timer;
try {
  if(process.argv.length!==3)throw new Error('Usage: node scripts/visual-check.mjs ARTIFACT.html');
  const bytes=await readFile(process.argv[2]);
  result.artifactSha256=createHash('sha256').update(bytes).digest('hex');
  let chromium;
  try {({chromium}=await import('@playwright/test'));}
  catch(error){
    if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;
    result.status='skipped';throw new Error('Playwright is unavailable. Use the repository development installation or host browser automation.');
  }
  const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync('/usr/bin/google-chrome')?'/usr/bin/google-chrome':chromium.executablePath());
  if(!existsSync(executablePath)){result.status='skipped';throw new Error('Chromium is unavailable. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to an existing browser.');}
  directory=await mkdtemp(join(tmpdir(),'better-diagrams-inspection-'));
  const snapshot=join(directory,'diagram.html');await writeFile(snapshot,bytes);
  browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox'],timeout:30_000});
  result.browserVersion=browser.version();
  const context=await browser.newContext({serviceWorkers:'block'});
  await context.route(/^https?:/,route=>{result.errors.push('Blocked network request: '+route.request().url());return route.abort();});
  const page=await context.newPage();
  page.on('pageerror',error=>result.errors.push(error.message));
  await page.goto(pathToFileURL(snapshot).href,{timeout:30_000,waitUntil:'load'});
  if(!await page.evaluate(()=>typeof window.betterDiagrams?.inspect==='function'))throw new Error('Artifact does not expose the Better Diagrams inspection API. Rebuild it with the current compiler.');
  const report=await Promise.race([
    page.evaluate(()=>window.betterDiagrams.inspect()),
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Diagram inspection timed out after 30000 ms.')),30_000);}),
  ]);
  if(!validReport(report))throw new Error('Artifact returned an invalid inspection report.');
  result.report=report;
  result.status=report.status==='passed' && result.errors.length===0?'passed':'failed';
} catch(error) {result.errors.push(error instanceof Error?error.message:String(error));}
finally {
  clearTimeout(timer);
  try {await browser?.close();}catch(error){result.status='failed';result.errors.push('Unable to close browser: '+String(error));}
  try {if(directory)await rm(directory,{recursive:true,force:true});}catch(error){result.status='failed';result.errors.push('Unable to remove inspection snapshot: '+String(error));}
}
process.stdout.write(JSON.stringify(result)+'\n');
process.exitCode=result.status==='passed'?0:result.status==='skipped'?2:1;
