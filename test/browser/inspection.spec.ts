import {test,expect} from '@playwright/test';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {readProject} from '../../src/project.ts';
import {buildStandaloneHtml} from '../../src/html.ts';
import type {ProjectInput} from '../../src/model.ts';

let directory:string;
test.beforeEach(async()=>{directory=await mkdtemp(join(tmpdir(),'diagram-inspection-'));});
test.afterEach(async()=>{await rm(directory,{recursive:true,force:true});});
async function artifact(input:ProjectInput){
  const path=join(directory,'diagram.html');
  await writeFile(path,buildStandaloneHtml(input,await readFile('dist/viewer.js','utf8')));
  return pathToFileURL(path).href;
}

test('inspects all declared views and reports bad children without changing the open diagram',async({page})=>{
  const input=await readProject('examples/architecture-small');
  if(input.document.version!==2)throw new Error('Expected typed input');
  input.document.nodes.orphan={label:'Too wide '.repeat(50),summary:'Hidden',details:''};
  input.document.views.orphan={type:'architecture',title:'Unreachable',detailLevel:'Detail',nodeIds:['orphan'],edges:[]};
  input.document.views.empty={type:'architecture',title:'Empty',detailLevel:'Overview',nodeIds:[],edges:[]};
  const requests:string[]=[];page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  await page.goto(await artifact(input));await expect(page.locator('[data-node-id="orders"]')).toBeVisible();
  await page.locator('[data-node-id="orders"]').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const before=await page.evaluate(()=>({camera:document.querySelector('.bd-svg-host')!.shadowRoot!.querySelector('svg')!.getAttribute('viewBox'),focus:document.activeElement?.outerHTML,title:document.querySelector('.bd-modal-title')!.textContent}));
  const apiAvailable=await page.evaluate(()=>typeof window.betterDiagrams?.inspect==='function');
  expect(apiAvailable).toBe(true);
  const report=await page.evaluate(()=>window.betterDiagrams.inspect());
  const after=await page.evaluate(()=>({camera:document.querySelector('.bd-svg-host')!.shadowRoot!.querySelector('svg')!.getAttribute('viewBox'),focus:document.activeElement?.outerHTML,title:document.querySelector('.bd-modal-title')!.textContent}));
  expect(after).toEqual(before);expect(requests).toEqual([]);
  expect(report.views.map(v=>v.viewId)).toEqual(Object.keys(input.document.views));
  expect(report.status).toBe('failed');expect(report.humanVisualReview).toBe('not-performed');expect(report.sourceAccuracy).toBe('not-checked');
  expect(report.views.find(v=>v.viewId==='orphan')).toMatchObject({status:'failed',metrics:null,error:{code:'compile-failed'}});
  expect(report.views.find(v=>v.viewId==='empty')).toMatchObject({status:'passed',metrics:{overlaps:0,crossings:0,length:0,bends:0},findings:[]});
  expect(report.views.find(v=>v.viewId==='small')!.findings.filter(f=>f.severity==='error')).toEqual([]);
  const payload=await page.locator('#diagram-data').textContent();
  expect(report.sourceSha256).toBe(createHash('sha256').update(payload!).digest('hex'));
  expect(report.rendererVersion).toBe(JSON.parse(await readFile('package.json','utf8')).version);
  expect(await page.evaluate(async()=>{const a=await window.betterDiagrams.inspect(),b=await window.betterDiagrams.inspect();return a===b;})).toBe(true);
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await expect(page.locator('[data-node-id="orders"]')).toBeFocused();
});

test('keeps inspection available when the root fails and binds reports to original embedded data',async({page})=>{
  const input=await readProject('examples/architecture-small');input.document.nodes.orders.label='Too wide '.repeat(50);
  await page.goto(await artifact(input));await expect(page.getByRole('alert')).toContainText('orders');
  expect(await page.evaluate(()=>typeof window.betterDiagrams?.inspect)).toBe('function');
  const payload=await page.locator('#diagram-data').textContent();
  await page.evaluate(()=>{document.getElementById('diagram-data')!.textContent='{}';});
  const report=await page.evaluate(()=>window.betterDiagrams.inspect());
  expect(report.status).toBe('failed');expect(report.views.find(v=>v.viewId==='small')!.error?.message).toContain('orders');
  expect(report.sourceSha256).toBe(createHash('sha256').update(payload!).digest('hex'));
  expect(await page.locator('[data-inspection-host]').count()).toBe(0);
});

test('rejects invalid source instead of passing an empty inspection',async({page})=>{
  const input=await readProject('examples/architecture-small');input.document.views={};
  await page.goto(await artifact(input));
  const outcome=await page.evaluate(async()=>{try{return (await window.betterDiagrams.inspect()).status;}catch(error){return String(error);}});
  expect(outcome).not.toBe('passed');expect(outcome).toContain('rootViewId');
});
