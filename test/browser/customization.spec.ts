import { test,expect } from './fixtures.ts';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ProjectInput } from '../../src/model.ts';
import { readProject } from '../../src/project.ts';
import { buildStandaloneHtml } from '../../src/html.ts';

const template='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 100"><defs><linearGradient id="color"><stop offset="0" stop-color="#f1f7ff"/><stop offset="1" stop-color="#dceaff"/></linearGradient><clipPath id="clip"><rect width="240" height="100" rx="20"/></clipPath></defs><rect class="node-body" width="240" height="100" rx="20" fill="url(#color)" clip-path="url(#clip)"/><text class="node-label" x="18" y="43" data-field="label"/><text x="18" y="74" data-field="data.status"/></svg>';

test.describe('search updates',()=>{
  test.use({projectPath:'examples/architecture-small'});
  test('rebuilds search after accepted file changes and retains it after an invalid update',async({page,session})=>{
    await page.goto(session.url);const canvas=page.locator('.bd-root-frame .bd-canvas');await canvas.hover();
    const open=async()=>canvas.getByRole('button',{name:'Search',exact:true}).click();await open();
    const query=canvas.getByRole('searchbox',{name:'Search nodes'});await query.fill('orders');
    await writeFile(join(session.dir,'diagram.json'),'{');await expect(page.locator('.bd-root-frame .bd-editor-bar [role="status"]')).toContainText('JSON');
    await expect(query).toHaveValue('orders');await expect(canvas.locator('.bd-search-results').getByRole('button',{name:'Order service (orders)',exact:true})).toBeVisible();
    const next=structuredClone(session.input.document);next.nodes.orders.label='Purchase service';next.views.small.nodeIds=next.views.small.nodeIds.filter(id=>id!=='admin');next.views.small.edges=next.views.small.edges.filter(edge=>edge.source!=='admin');
    await writeFile(join(session.dir,'diagram.json'),JSON.stringify(next));await expect(canvas.locator('[data-node-id="orders"]')).toHaveAttribute('aria-label','Purchase service');
    await expect(query).toBeHidden();await open();await query.fill('Order service');await expect(canvas.getByRole('status')).toHaveText('No matching nodes.');
    await query.fill('admin');await expect(canvas.getByRole('status')).toHaveText('No matching nodes.');
    await query.fill('Purchase');await query.press('Enter');await page.keyboard.press('Enter');const modal=page.getByRole('dialog');await modal.getByRole('button',{name:'Explore internals'}).click();await modal.locator('.bd-canvas').hover();
    await modal.getByRole('button',{name:'Search',exact:true}).click();await modal.getByRole('searchbox',{name:'Search nodes'}).fill('stock');
    delete next.nodes.orders.childViewId;delete next.views.orders;await writeFile(join(session.dir,'diagram.json'),JSON.stringify(next));
    await expect(modal.getByLabel('Label',{exact:true})).toHaveValue('Purchase service');await expect(modal.getByRole('searchbox',{name:'Search nodes'})).toHaveCount(0);await expect(modal.getByRole('button',{name:'Explore internals'})).toHaveCount(0);
    await modal.getByRole('button',{name:'Close',exact:true}).click();await open();await query.fill('orders-stock');await expect(canvas.getByRole('status')).toHaveText('No matching nodes.');
  });
});

test('instantiates inert SVG components with escaped text and unique local identifiers',async({page,session})=>{
  await page.setContent('<main id="stage"></main>');await page.addScriptTag({path:'dist/test/compiler.js'});
  const input:ProjectInput=structuredClone(session.input);input.templates={service:template};
  input.document.nodes.select.template='service';input.document.nodes.inventory.template='service';
  input.document.nodes.select.data={status:'<unsafe>'};
  const result=await page.evaluate(async input=>{
    const view=await DiagramCompiler.compileView(input,'overview',document.getElementById('stage')!);
    const ids=[...view.svg.querySelectorAll('[id]')].map(el=>el.id);
    return {ids,xml:DiagramCompiler.exportSvg(view)};
  },input);
  expect(new Set(result.ids).size).toBe(result.ids.length);
  expect(result.xml).toContain('&lt;unsafe&gt;');expect(result.xml).not.toContain('foreignObject');
});

test('keeps hyphenated node and template identifier pairs distinct',async({page,session})=>{
  await page.setContent('<main id="stage"></main>');await page.addScriptTag({path:'dist/test/compiler.js'});
  const input:ProjectInput=structuredClone(session.input);
  input.templates={first:template.replace('id="color"','id="c"').replaceAll('#color','#c'),second:template.replace('id="color"','id="b-c"').replaceAll('#color','#b-c')};
  input.document.nodes['a-b']={label:'First',details:'',template:'first'};
  input.document.nodes.a={label:'Second',details:'',template:'second'};
  input.document.views.collision={title:'Distinct identifiers',detailLevel:'Components',nodeIds:['a-b','a'],edges:[]};
  const ids=await page.evaluate(async input=>{
    const view=await DiagramCompiler.compileView(input,'collision',document.getElementById('stage')!);
    const exported=new DOMParser().parseFromString(DiagramCompiler.exportSvg(view),'image/svg+xml');
    return [...exported.querySelectorAll('[id]')].map(el=>el.id);
  },input);
  expect(new Set(ids).size).toBe(ids.length);
});

test('rejects active templates and non-self-contained stylesheet resources',async({page,session})=>{
  await page.setContent('<main id="stage"></main>');await page.addScriptTag({path:'dist/test/compiler.js'});
  await page.route(/^https?:/,route=>route.abort());
  const bad=[template.replace('</svg>','<script>globalThis.pwned=true</script></svg>'),template.replace('</svg>','<foreignObject/></svg>'),template.replace('<rect class=','<rect onload="alert(1)" class='),template.replace('url(#color)','url(https://example.invalid/image.svg)'),template.replace('viewBox="0 0 240 100"','viewBox="0 0 0 0"')];
  const results=await page.evaluate(async({input,bad})=>{
    const errors:string[]=[];
    for(const svg of bad){const changed=structuredClone(input);changed.document.nodes.select.template='service';changed.templates={service:svg};try{await DiagramCompiler.compileView(changed,'overview',document.getElementById('stage')!);errors.push('accepted');}catch(error){errors.push(String(error));}}
    for(const themeCss of ['@import "https://example.invalid/style.css";','.node-body{fill:url(https://example.invalid/a.svg)}','.node-body{fill:u\\72l(https://example.invalid/a.svg)}']){
      try{await DiagramCompiler.compileView({...input,themeCss},'overview',document.getElementById('stage')!);errors.push('accepted');}catch(error){errors.push(String(error));}
    }
    return {errors,executed:Reflect.has(globalThis,'pwned')};
  },{input:session.input,bad});
  expect(results.errors).not.toContain('accepted');expect(results.executed).toBe(false);
});

test('updates templates and geometry live without erasing an unsaved browser draft',async({page,session},info)=>{
  await page.goto(session.url);await page.locator('.bd-root-frame .bd-canvas').hover();await page.getByRole('button',{name:'Fit',exact:true}).click();await expect(page.getByRole('button',{name:'Select skill',exact:true})).toBeVisible();
  await mkdir(join(session.dir,'templates'),{recursive:true});await writeFile(join(session.dir,'templates/service.svg'),template);
  const changed=structuredClone(session.input.document);changed.nodes.select.template='service';changed.nodes.fingerprint.template='service';
  await writeFile(join(session.dir,'diagram.json'),JSON.stringify(changed));
  await expect(page.locator('[data-node-id="select"] .node-body')).toHaveAttribute('rx','20');
  await page.getByRole('button',{name:'Select skill',exact:true}).click();
  await page.getByLabel('Label',{exact:true}).fill('Unsaved styled node');
  await writeFile(join(session.dir,'theme.css'),'.node-label{font-size:26px}.node-body{fill:#e8f5ff}');
  await expect(page.locator('[data-node-id="select"] .node-label')).toHaveCSS('font-size','26px');
  await expect(page.getByLabel('Label',{exact:true})).toHaveValue('Unsaved styled node');
  await expect(page.getByLabel('Label',{exact:true})).toBeFocused();
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export SVG',exact:true}).click();
  const download=await downloadPromise;const xml=await readFile((await download.path())!,'utf8');
  expect(xml).toContain('Unsaved styled node');expect(xml).toContain('26px');expect(xml).not.toMatch(/foreignObject|bd-editor-bar|bd-details/);
  await writeFile(join(session.dir,'templates/service.svg'),'<svg');
  await expect(page.getByRole('alert')).toContainText('SVG');
  await expect(page.locator('[data-node-id=select]')).toHaveAttribute('aria-label','Unsaved styled node');
  await writeFile(join(session.dir,'templates/service.svg'),template);
  await expect(page.getByRole('alert')).toBeHidden();
  await expect(page.getByRole('status')).toHaveText('Unsaved changes');
  await page.screenshot({path:info.outputPath('custom-editor.png')});
  const artifact=join(session.dir,'offline.html');
  await writeFile(artifact,buildStandaloneHtml(await readProject(session.dir),await readFile('dist/viewer.js','utf8')));
  const offline=await page.context().newPage();const requests:string[]=[];
  offline.on('request',request=>{if(/^https?:/.test(request.url()))requests.push(request.url());});
  await offline.route(/^https?:/,route=>route.abort());await offline.goto(pathToFileURL(artifact).href);await offline.locator('.bd-root-frame .bd-canvas').hover();await offline.getByRole('button',{name:'Fit',exact:true}).click();
  await offline.getByRole('button',{name:'Verify installed content',exact:true}).click();await offline.getByRole('button',{name:'Explore internals'}).click();
  await expect(offline.locator('[data-node-id="fingerprint"] .node-body')).toHaveAttribute('rx','20');
  await offline.getByRole('dialog').locator('.bd-canvas').hover();await offline.getByRole('button',{name:'Zoom in',exact:true}).click();
  const internalDownload=offline.waitForEvent('download');await offline.getByRole('button',{name:'Export SVG',exact:true}).click();
  const internal=await readFile((await (await internalDownload).path())!,'utf8');
  expect(internal).toContain('data-node-id="fingerprint"');expect(internal).not.toContain('data-node-id="install"');expect(requests).toEqual([]);
  await offline.screenshot({path:info.outputPath('custom-internals.png')});await offline.close();
});
