import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {readProject} from '../src/project.ts';
import {buildStandaloneHtml} from '../src/html.ts';

const collector=resolve('scripts/visual-check.mjs');
async function run(file:string,env:NodeJS.ProcessEnv={}){
  const child=spawn(process.execPath,[collector,file],{env:{...process.env,...env},stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);
  const code=await new Promise<number|null>((res,rej)=>{child.once('error',rej);child.once('close',res);});
  return {code,stdout,stderr};
}

test('collector checks a real artifact snapshot and detects failures in hidden views',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'diagram-collector-'));
  try {
    const input=await readProject('examples/architecture-small'),bundle=await readFile('dist/viewer.js','utf8'),file=join(directory,'diagram.html');
    const html=buildStandaloneHtml(input,bundle);await writeFile(file,html);
    let result=await run(file);assert.equal(result.code,0,result.stderr+'\n'+result.stdout);
    let envelope=JSON.parse(result.stdout);
    assert.equal(envelope.status,'passed');assert.equal(envelope.artifactSha256,createHash('sha256').update(html).digest('hex'));
    assert.ok(envelope.browserVersion);assert.deepEqual(envelope.errors,[]);
    assert.equal(envelope.report.views.length,Object.keys(input.document.views).length);
    input.document.nodes['orders-stock'].label='Excessive title '.repeat(100);
    await writeFile(file,buildStandaloneHtml(input,bundle));result=await run(file);assert.equal(result.code,1);
    envelope=JSON.parse(result.stdout);assert.equal(envelope.status,'failed');assert.ok(envelope.report.views.some((v:{error?:unknown})=>v.error));
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('collector distinguishes unavailable browser tooling from invalid artifacts and launch failures',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'diagram-collector-fail-'));
  try {
    const file=join(directory,'invalid.html');await writeFile(file,'<!doctype html><p>No inspection API</p>');
    const missing=await run(file,{PLAYWRIGHT_CHROMIUM_EXECUTABLE:join(directory,'missing-browser')});
    assert.equal(missing.code,2,missing.stdout+missing.stderr);assert.equal(JSON.parse(missing.stdout).status,'skipped');
    const invalid=await run(file);assert.equal(invalid.code,1);assert.match(JSON.parse(invalid.stdout).errors.join(' '),/inspection API/i);
    const launch=await run(file,{PLAYWRIGHT_CHROMIUM_EXECUTABLE:process.execPath});assert.equal(launch.code,1);assert.equal(JSON.parse(launch.stdout).status,'failed');
    const absent=await run(join(directory,'absent.html'));assert.equal(absent.code,1);assert.equal(JSON.parse(absent.stdout).status,'failed');
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('collector fails page errors and blocked network requests instead of reporting a pass',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'diagram-collector-errors-'));
  try {
    const input=await readProject('examples/architecture-small'),bundle=await readFile('dist/viewer.js','utf8'),file=join(directory,'diagram.html');
    await writeFile(file,buildStandaloneHtml(input,bundle+'\nsetTimeout(()=>{throw new Error("page-broke")},0);'));
    const broken=await run(file);assert.equal(broken.code,1);assert.match(JSON.parse(broken.stdout).errors.join(' '),/page-broke/);
    const html=buildStandaloneHtml(input,bundle+'\nfetch("https://example.invalid/blocked").catch(()=>{});').replace("connect-src 'none'","connect-src https:");
    await writeFile(file,html);const remote=await run(file);assert.equal(remote.code,1);assert.match(JSON.parse(remote.stdout).errors.join(' '),/blocked/i);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('collector inspects captured bytes even when the original changes, and removes its snapshot',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'diagram-collector-snapshot-'));
  try {
    const input=await readProject('examples/architecture-small'),bundle=await readFile('dist/viewer.js','utf8'),file=join(directory,'diagram.html');
    const html=buildStandaloneHtml(input,bundle+'\nconst inspectOriginal=window.betterDiagrams.inspect;window.betterDiagrams.inspect=async()=>{await new Promise(r=>setTimeout(r,500));return inspectOriginal();};');
    await writeFile(file,html);
    const pending=run(file,{TMPDIR:directory});
    let found=false;
    for(let i=0;i<100;i++){
      if((await readdir(directory)).some(name=>name.startsWith('better-diagrams-inspection-'))){found=true;break;}
      await new Promise(r=>setTimeout(r,25));
    }
    assert.ok(found,'Collector created its private snapshot');
    await writeFile(file,'<!doctype html><p>New content, no API</p>');
    const result=await pending;assert.equal(result.code,0,result.stdout+result.stderr);
    assert.equal(JSON.parse(result.stdout).artifactSha256,createHash('sha256').update(html).digest('hex'));
    assert.deepEqual((await readdir(directory)).filter(name=>name.startsWith('better-diagrams-inspection-')),[]);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('collector times out a stalled inspection and cleans up the browser and snapshot',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'diagram-collector-timeout-'));
  try {
    const file=join(directory,'stalled.html');
    await writeFile(file,'<!doctype html><script>window.betterDiagrams={inspect:()=>new Promise(()=>{})}</script>');
    const result=await run(file,{TMPDIR:directory});
    assert.equal(result.code,1);assert.match(JSON.parse(result.stdout).errors.join(' '),/timed out/);
    assert.deepEqual((await readdir(directory)).filter(name=>name.startsWith('better-diagrams-inspection-')),[]);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('collector rejects malformed and contradictory reports instead of trusting passed status',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'diagram-collector-report-'));
  try {
    const file=join(directory,'invalid-report.html');
    const valid={schemaVersion:1,sourceSha256:'a'.repeat(64),rendererVersion:'0.1.0',status:'passed',checks:['geometry','all-declared-views'],humanVisualReview:'not-performed',sourceAccuracy:'not-checked',views:[{viewId:'root',status:'passed',metrics:{overlaps:0,crossings:0,length:100,bends:0},findings:[]}]};
    for(const report of [
      {...valid,views:[{...valid.views[0],status:'failed',metrics:null,error:{code:'compile-failed',message:'Cannot render'}}]},
      {...valid,views:[{...valid.views[0],metrics:{...valid.views[0].metrics,overlaps:1}}]},
      {...valid,views:[{...valid.views[0],findings:[{severity:'error'}]}]},
      {...valid,views:[{viewId:'root',status:'passed'}]},
      {...valid,views:[valid.views[0],valid.views[0]]},
    ]){
      await writeFile(file,'<!doctype html><script>window.betterDiagrams={inspect:async()=>('+JSON.stringify(report)+')}</script>');
      const result=await run(file);
      assert.equal(result.code,1,result.stdout);assert.equal(JSON.parse(result.stdout).status,'failed');
      assert.match(JSON.parse(result.stdout).errors.join(' '),/invalid inspection report/i);
    }
  }finally{await rm(directory,{recursive:true,force:true});}
});
