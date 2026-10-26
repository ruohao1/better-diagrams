import {test as base,expect} from '@playwright/test';
import {readFile,readdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {buildStandaloneHtml} from '../../src/html.ts';
import {readProject} from '../../src/project.ts';
import type {ProjectInput} from '../../src/model.ts';

const test=base.extend<{artifactFor:(input:ProjectInput|string)=>Promise<string>}>({
  artifactFor:async({},use)=>{
    const dir=await mkdtemp(join(tmpdir(),'diagram-viewer-'));let n=0;
    try {await use(async input=>{const svg=typeof input==='string',file=join(dir,'diagram-'+n+++(svg?'.svg':'.html'));await writeFile(file,svg?input:buildStandaloneHtml(input,await readFile('dist/viewer.js','utf8')));return pathToFileURL(file).href;});}
    finally {await rm(dir,{recursive:true,force:true});}
  },
});

test('opens offline without a page shell and exports only the active internal view',async({page,context,artifactFor},info)=>{
  const requests:string[]=[];page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});await context.setOffline(true);
  await page.goto(await artifactFor(await readProject('examples/skill-install')));
  await expect(page.locator('h1,.bd-brand,.bd-toolbar,aside')).toHaveCount(0);
  await page.locator('.bd-root-frame .bd-canvas').hover();await page.getByRole('button',{name:'Fit',exact:true}).click();
  await page.getByRole('button',{name:'Verify installed content',exact:true}).click();
  const modal=page.getByRole('dialog');await expect(modal).toBeVisible();
  await expect(modal.getByRole('link',{name:'scripts/setup.py:245'})).toBeVisible();
  await modal.getByRole('button',{name:'Explore internals'}).click();
  await expect(modal.getByRole('button',{name:'Compare fingerprints',exact:true})).toBeVisible();
  await modal.getByRole('button',{name:'Zoom in',exact:true}).click();
  const download=page.waitForEvent('download');await modal.getByRole('button',{name:'Export SVG',exact:true}).click();
  const xml=await readFile((await (await download).path())!,'utf8');
  expect(xml).toContain('data-node-id="fingerprint"');expect(xml).not.toMatch(/foreignObject|bd-modal|bd-controls|data-node-id="install"/);
  await modal.getByRole('button',{name:'Back',exact:true}).click();await expect(modal.getByRole('heading',{name:'Verify installed content',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');await expect(modal).toBeHidden();await expect(page.getByRole('button',{name:'Verify installed content',exact:true})).toBeFocused();
  expect(requests).toEqual([]);await page.screenshot({path:info.outputPath('viewer.png')});
});

test('keeps script-shaped titles, summaries and details as inert text',async({page,artifactFor})=>{
  const input=await readProject('examples/architecture-small');if(input.document.version!==2)throw new Error('Expected typed source');
  const label='<script>unsafe</script>',details='</script><script>globalThis.pwned=true</script>';
  input.document.title=details;input.document.nodes.orders.label=label;input.document.nodes.orders.summary=details;input.document.nodes.orders.details=details;
  await page.goto(await artifactFor(input));await page.locator('.bd-root-frame .bd-canvas').hover();await page.getByRole('button',{name:'Fit',exact:true}).click();
  await page.getByRole('button',{name:label,exact:true}).click();
  await expect(page.getByRole('dialog').getByRole('heading',{name:label,exact:true})).toBeVisible();
  await expect(page.locator('.bd-summary')).toHaveText(details);await expect(page.locator('.bd-description')).toHaveText(details);
  expect(await page.evaluate(()=>Reflect.has(globalThis,'pwned'))).toBe(false);
});

test('uses one modal for two internal levels and restores the root camera and focus',async({page,artifactFor})=>{
  await page.goto(await artifactFor(await readProject('examples/architecture-small')));await page.locator('.bd-root-frame .bd-canvas').hover();await page.getByRole('button',{name:'Fit',exact:true}).click();
  const root=page.locator('.bd-root-frame .bd-canvas svg.diagram'),camera=await root.getAttribute('viewBox');
  await page.getByRole('button',{name:'Order service',exact:true}).click();const modal=page.getByRole('dialog');
  await expect(page.locator('dialog')).toHaveCount(1);await expect(modal.locator('.bd-summary')).toContainText('Validates requests');
  expect(await modal.locator('.bd-description').evaluate(el=>getComputedStyle(el).userSelect)).not.toBe('none');
  await modal.getByRole('button',{name:'Explore internals'}).click();await modal.locator('.bd-canvas').hover();await modal.getByRole('button',{name:'Fit',exact:true}).click();
  await modal.getByRole('button',{name:'Stock client',exact:true}).click();await modal.getByRole('button',{name:'Explore internals'}).click();
  await expect(modal.getByRole('button',{name:'Availability check',exact:true})).toBeVisible();
  await modal.getByRole('button',{name:'Back',exact:true}).click();await expect(modal.getByRole('heading',{name:'Stock client',exact:true})).toBeVisible();
  await modal.getByRole('button',{name:'Back',exact:true}).click();await expect(modal.getByRole('button',{name:'Stock client',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');await expect(root).toHaveAttribute('viewBox',camera!);await expect(page.getByRole('button',{name:'Order service',exact:true})).toBeFocused();
});

test('pans from node and legend text without selecting or opening details',async({page,artifactFor})=>{
  await page.goto(await artifactFor(await readProject('examples/architecture-small')));await page.locator('.bd-root-frame .bd-canvas').hover();await page.getByRole('button',{name:'Fit',exact:true}).click();
  const canvas=page.locator('.bd-root-frame .bd-canvas'),svg=canvas.locator('svg.diagram');
  const before=await svg.getAttribute('viewBox'),text=canvas.locator('[data-node-id="orders"] .node-label').first(),box=(await text.boundingBox())!;
  await page.mouse.move(box.x+10,box.y+8);await page.mouse.down();await page.mouse.move(box.x+90,box.y+50,{steps:8});await page.mouse.up();
  expect(await svg.getAttribute('viewBox')).not.toBe(before);expect(await page.evaluate(()=>getSelection()?.toString())).toBe('');await expect(page.getByRole('dialog')).toHaveCount(0);
  await canvas.focus();const pan=await svg.getAttribute('viewBox');await page.keyboard.press('ArrowRight');expect(await svg.getAttribute('viewBox')).not.toBe(pan);
  const node=canvas.locator('[data-node-id="orders"]');await node.focus();await page.keyboard.press('Enter');
  const modal=page.getByRole('dialog');await modal.getByRole('button',{name:'Explore internals'}).click();await modal.locator('.bd-canvas').hover();await modal.getByRole('button',{name:'Fit',exact:true}).click();
  const internal=modal.locator('svg.diagram'),label=modal.locator('[data-node-id="orders-stock"] .node-label'),b=(await label.boundingBox())!,initial=await internal.getAttribute('viewBox');
  await page.mouse.move(b.x+6,b.y+6);await page.mouse.down();await page.mouse.move(b.x-60,b.y+30,{steps:7});await page.mouse.up();
  expect(await internal.getAttribute('viewBox')).not.toBe(initial);await expect(modal.locator('.bd-details')).toHaveCount(0);expect(await page.evaluate(()=>getSelection()?.toString())).toBe('');
  const legend=modal.locator('[data-legend] .legend-title'),l=(await legend.boundingBox())!;await page.mouse.move(l.x+4,l.y+6);await page.mouse.down();await page.mouse.move(l.x+50,l.y+30,{steps:6});await page.mouse.up();expect(await page.evaluate(()=>getSelection()?.toString())).toBe('');
  await page.keyboard.press('Escape');await node.focus();await page.keyboard.press('Space');await expect(page.getByRole('dialog')).toBeVisible();
});

test('namespaces repeated templates and logos and exports full bounds after pan and zoom',async({page,context,artifactFor})=>{
  const input=await readProject('examples/architecture-small');if(input.document.version!==2)throw new Error('Expected typed source');
  input.document.views.orders.nodeIds.push('database');input.document.nodes.database.logo='service';input.document.nodes.database.template='card';
  input.templates.card='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 252 136"><defs><linearGradient id="c"><stop offset="0" stop-color="#def"/></linearGradient></defs><rect class="node-body" width="252" height="136" fill="url(#c)"/><text class="node-label" x="62" y="36" data-field="label"/></svg>';
  input.themeCss='button{display:none} dialog{display:none}';
  await context.setOffline(true);await page.goto(await artifactFor(input));await page.locator('.bd-root-frame .bd-canvas').hover();await page.getByRole('button',{name:'Fit',exact:true}).click();await page.getByRole('button',{name:'Order service',exact:true}).click();await page.getByRole('button',{name:'Explore internals'}).click();
  const ids=await page.locator('.bd-canvas').evaluateAll(canvases=>canvases.flatMap(c=>[...c.querySelector('.bd-svg-host')!.shadowRoot!.querySelectorAll('[id]')].map(el=>el.id)));
  expect(new Set(ids).size).toBe(ids.length);expect(ids.length).toBeGreaterThan(5);
  const modal=page.getByRole('dialog'),download=async()=>{await modal.locator('.bd-canvas').hover();const pending=page.waitForEvent('download');await modal.getByRole('button',{name:'Export SVG',exact:true}).click();return readFile((await (await pending).path())!,'utf8');};
  const before=await download();await modal.getByRole('button',{name:'Zoom in',exact:true}).click();await modal.locator('.bd-canvas').focus();await page.keyboard.press('ArrowDown');const after=await download();
  expect(after).toBe(before);expect(after).toContain('data-node-id="database"');expect(after).not.toContain('data-node-id="shop"');
  const svgPage=await context.newPage(),requests:string[]=[];svgPage.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  await svgPage.goto(await artifactFor(after));
  expect(await svgPage.locator('[tabindex],[aria-pressed],.bd-modal,.bd-controls,parsererror').count()).toBe(0);
  expect(await svgPage.locator('[data-node-id]').count()).toBe(5);expect(requests).toEqual([]);await svgPage.close();
});

test('loads a real embedded font inside the viewer and its offline SVG export',async({page,context,artifactFor})=>{
  const directory='node_modules/playwright-core/lib/vite/traceViewer',name=(await readdir(directory)).find(name=>/^codicon\..*\.ttf$/.test(name))!;
  const font=(await readFile(join(directory,name))).toString('base64'),input=await readProject('examples/architecture-small');
  input.document.nodes.orders.label='\uea60\uea61';input.themeCss='@font-face{font-family:DiagramProbe;src:url(data:font/ttf;base64,'+font+')} @font-face{font-family:bd-font-1;unicode-range:U+E000-E001;src:url(data:font/ttf;base64,'+font+')} .diagram{--diagram-font:DiagramProbe;font-family:var(--diagram-font)}';
  await context.setOffline(true);await page.goto(await artifactFor(input));
  const loaded=await page.locator('[data-node-id="orders"] .node-label').evaluate(async el=>{const family=getComputedStyle(el).fontFamily;return (await document.fonts.load('15px '+family,'\uea60')).filter(face=>face.status==='loaded').length;});
  expect(loaded).toBeGreaterThan(0);
  await page.locator('.bd-root-frame .bd-canvas').hover();const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Export SVG',exact:true}).click();const xml=await readFile((await (await pending).path())!,'utf8');
  expect(xml).toContain('data:font/ttf;base64,');const exported=await context.newPage();await exported.goto(await artifactFor(xml));
  const exportLoaded=await exported.locator('[data-node-id="orders"] .node-label').evaluate(async el=>(await document.fonts.load('15px '+getComputedStyle(el).fontFamily,'\uea60')).filter(face=>face.status==='loaded').length);
  expect(exportLoaded).toBeGreaterThan(0);await exported.close();
});

test.describe('touch viewport',()=>{
  test.use({hasTouch:true,viewport:{width:390,height:740}});
  test('starts at a readable scale and exposes Fit through its menu',async({page,artifactFor},info)=>{
    await page.goto(await artifactFor(await readProject('examples/architecture-small')));
    const canvas=page.locator('.bd-root-frame .bd-canvas');await expect(canvas.locator('svg.diagram')).toBeVisible();
    const scale=()=>canvas.evaluate(el=>el.clientWidth/el.querySelector('.bd-svg-host')!.shadowRoot!.querySelector('svg')!.viewBox.baseVal.width);
    expect(await scale()).toBeGreaterThanOrEqual(.899);await page.getByRole('button',{name:'Diagram controls',exact:true}).tap();await page.getByRole('button',{name:'Fit',exact:true}).tap();expect(await scale()).toBeLessThan(.9);
    expect(await page.evaluate(()=>document.body.scrollWidth)).toBeLessThanOrEqual(390);await page.screenshot({path:info.outputPath('viewer-touch.png')});
  });
});
