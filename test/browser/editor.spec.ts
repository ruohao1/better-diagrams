import { test,expect } from './fixtures.ts';
import { readFile,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readProject } from '../../src/project.ts';
import type { ProjectEvent,LiveSnapshot } from '../../src/protocol.ts';

declare global {
  var DiagramEditor:typeof import('../../src/browser/editor.ts');
  var editorHarness:{emit:(event:ProjectEvent)=>void;failSave:boolean};
}

test('edits typed summaries and keeps the complete versioned draft available in the modal',async({page})=>{
  const input=await readProject('examples/architecture-small');
  await page.setContent('<main id="app"></main>');await page.addScriptTag({path:'dist/test/editor.js'});
  await page.evaluate(async input=>{
    await DiagramEditor.mountEditor(document.getElementById('app')!,{...input,sequence:1},{subscribe:()=>()=>{},save:async()=>{throw new Error('Unexpected save');}});
  },input);
  await expect(page.getByRole('button',{name:'Add node',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Order service',exact:true}).click();
  await expect(page.getByLabel('Label',{exact:true})).toBeEditable();
  await page.getByLabel('Summary',{exact:true}).fill('A complete summary kept in source. '.repeat(10));
  const pending=page.waitForEvent('download');await page.getByRole('dialog').getByRole('button',{name:'Download draft',exact:true}).click();
  const source=JSON.parse(await readFile((await (await pending).path())!,'utf8'));expect(source.version).toBe(2);expect(source.nodes.orders.summary).toBe('A complete summary kept in source. '.repeat(10));
});

test('roundtrips content, nodes and edges while preserving other views and metadata',async({page,session})=>{
  await page.goto(session.url);await page.locator('.bd-root-frame .bd-canvas').hover();await page.getByRole('button',{name:'Fit',exact:true}).click();
  await page.getByRole('button',{name:'Save installation receipt',exact:true}).click();
  await page.getByLabel('Label',{exact:true}).fill('Saved receipt');
  await page.getByLabel('Details',{exact:true}).fill('A browser edit.');
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Saved');
  let saved=await readProject(session.dir);
  expect(saved.document.nodes.receipt.references).toEqual(session.input.document.nodes.receipt.references);
  expect(saved.document.nodes.receipt.data).toEqual(session.input.document.nodes.receipt.data);
  expect(saved.document.nodes.receipt.details).toBe('A browser edit.');
  await page.keyboard.press('Escape');
  await page.getByLabel('New node label',{exact:true}).fill('Notify');
  await page.getByRole('button',{name:'Add node',exact:true}).click();
  const node=page.getByRole('button',{name:'Notify',exact:true});await expect(node).toHaveCount(1);await page.locator('.bd-root-frame .bd-canvas').hover();await page.getByRole('button',{name:'Fit',exact:true}).click();await expect(node).toBeVisible();
  const id=(await node.getAttribute('data-node-id'))!;
  await page.getByLabel('Connection source',{exact:true}).selectOption('receipt');
  await page.getByLabel('Connection target',{exact:true}).selectOption(id);
  await page.getByRole('button',{name:'Add connection',exact:true}).click();
  await page.getByRole('button',{name:'Save changes',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Saved');
  saved=await readProject(session.dir);expect(saved.document.views.overview.edges.some(e=>e.source==='receipt'&&e.target===id)).toBe(true);
  const edge=saved.document.views.overview.edges.find(e=>e.source==='receipt'&&e.target===id)!;
  await page.getByLabel('Existing connection',{exact:true}).selectOption(edge.id);
  await page.getByRole('button',{name:'Remove connection',exact:true}).click();
  await page.getByRole('button',{name:'Save changes',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Saved');
  expect((await readProject(session.dir)).document.views.overview.edges.some(e=>e.id===edge.id)).toBe(false);
  await page.getByRole('button',{name:'Saved receipt',exact:true}).click();
  await page.getByRole('button',{name:'Remove from view',exact:true}).click();
  await page.getByRole('button',{name:'Save changes',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Saved');
  saved=await readProject(session.dir);
  expect(saved.document.views.overview.nodeIds).not.toContain('receipt');
  expect(saved.document.views.verification.nodeIds).toContain('receipt');
  expect(saved.document.views.overview.edges.some(e=>e.source==='receipt'||e.target==='receipt')).toBe(false);
  await page.getByRole('button',{name:'Verify installed content',exact:true}).click();await page.getByRole('button',{name:'Explore internals'}).click();
  await expect(page.getByRole('button',{name:'Saved receipt',exact:true})).toBeVisible();
  await expect(page.getByRole('dialog').getByLabel('Connection source',{exact:true}).locator('option')).toHaveCount(5);
});

test('refreshes clean sources and preserves a dirty draft on external conflict',async({page,session})=>{
  await page.goto(session.url);await page.locator('.bd-root-frame .bd-canvas').hover();await page.getByRole('button',{name:'Fit',exact:true}).click();await expect(page.getByRole('button',{name:'Save changes',exact:true})).toBeVisible();
  const changed=structuredClone(session.input.document);changed.title='Updated from files';
  await writeFile(join(session.dir,'diagram.json'),JSON.stringify(changed));
  await expect(page.getByRole('status')).toHaveText('Updated from files');
  await page.getByRole('button',{name:'Save installation receipt',exact:true}).click();
  await page.getByLabel('Label',{exact:true}).fill('Unsaved draft');
  changed.title='External changes';changed.nodes.receipt.label='From disk';
  await writeFile(join(session.dir,'diagram.json'),JSON.stringify(changed));
  await expect(page.getByRole('status')).toContainText('Conflict');
  await expect(page.getByLabel('Label',{exact:true})).toHaveValue('Unsaved draft');
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download draft',exact:true}).click();
  const download=await downloadPromise;expect(JSON.parse(await readFile((await download.path())!,'utf8')).nodes.receipt.label).toBe('Unsaved draft');
  await page.getByRole('button',{name:'Reload files (discard draft)',exact:true}).click();
  await expect(page.getByLabel('Label',{exact:true})).toHaveValue('From disk');
  expect((await readProject(session.dir)).document.title).toBe('External changes');
});

test('orders source events, preserves style-only drafts, and handles save echoes and rejection',async({page,session})=>{
  await page.setContent('<main id="app"></main>');await page.addScriptTag({path:'dist/test/editor.js'});
  const initial:LiveSnapshot={...session.input,sequence:1};
  await page.evaluate(async initial=>{
    let listener:(event:ProjectEvent)=>void=()=>{};let sequence=10;
    globalThis.editorHarness={emit:event=>listener(event),failSave:false};
    await DiagramEditor.mountEditor(document.getElementById('app')!,initial,{
      subscribe:fn=>{listener=fn;return()=>{};},
      save:async document=>{
        if(editorHarness.failSave)throw {code:'CONFLICT',message:'Source changed'};
        const saved={...initial,document:structuredClone(document),sequence:++sequence,documentRevision:'saved',revision:'saved'};
        listener({type:'snapshot',snapshot:saved});return saved;
      },
    });
  },initial);
  await page.locator('.bd-root-frame .bd-canvas').hover();await page.getByRole('button',{name:'Fit',exact:true}).click();
  await page.getByRole('button',{name:'Save installation receipt',exact:true}).click();
  await page.getByLabel('Label',{exact:true}).fill('Draft label');
  await page.evaluate(initial=>editorHarness.emit({type:'snapshot',snapshot:{...initial,sequence:2,revision:'styled',themeCss:'.node-body{fill:#eef7ff}'}}),initial);
  await expect(page.getByLabel('Label',{exact:true})).toHaveValue('Draft label');
  await page.getByRole('button',{name:'Save changes',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Saved');
  await page.evaluate(initial=>editorHarness.emit({type:'snapshot',snapshot:{...initial,sequence:1}}),initial);
  await expect(page.locator('[data-node-id=receipt]')).toHaveAttribute('aria-label','Draft label');
  await page.getByLabel('Label',{exact:true}).fill('Preserved after rejection');
  await page.evaluate(()=>{editorHarness.failSave=true;});
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Conflict');
  await expect(page.getByLabel('Label',{exact:true})).toHaveValue('Preserved after rejection');
});

test('reports invalid source as a validation error and recovers the live view',async({page,session})=>{
  await page.goto(session.url);await page.locator('.bd-root-frame .bd-canvas').hover();await page.getByRole('button',{name:'Fit',exact:true}).click();await expect(page.getByRole('button',{name:'Select skill',exact:true})).toBeVisible();
  await writeFile(join(session.dir,'diagram.json'),'{broken');
  await expect(page.getByRole('status')).toContainText('Source error:');
  await expect(page.getByRole('status')).not.toContainText('Connection lost');
  await expect(page.getByRole('button',{name:'Select skill',exact:true})).toBeVisible();
  await writeFile(join(session.dir,'diagram.json'),JSON.stringify(session.input.document));
  await expect(page.getByRole('status')).toHaveText('Updated from files');
});

test('keeps newly opened node fields disabled until a pending save finishes',async({page,session})=>{
  let release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/document',async route=>{await pending;await route.continue();});
  try {
    await page.goto(session.url);await page.locator('.bd-root-frame .bd-canvas').hover();await page.getByRole('button',{name:'Fit',exact:true}).click();
    await page.getByRole('button',{name:'Select skill',exact:true}).click();
    await page.getByLabel('Label',{exact:true}).fill('Chosen skill');
    await page.getByRole('button',{name:'Save changes',exact:true}).click();
    await expect(page.getByRole('status')).toHaveText('Saving…');
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Save installation receipt',exact:true}).click();
    await expect(page.getByLabel('Label',{exact:true})).toBeDisabled();
    await expect(page.getByLabel('Details',{exact:true})).toBeDisabled();
    release();await expect(page.getByRole('status')).toHaveText('Saved');
    await page.getByLabel('Label',{exact:true}).fill('Kept after save');
    await page.getByRole('button',{name:'Save changes',exact:true}).click();
    await expect(page.getByRole('status')).toHaveText('Saved');
    const saved=await readProject(session.dir);
    expect(saved.document.nodes.select.label).toBe('Chosen skill');
    expect(saved.document.nodes.receipt.label).toBe('Kept after save');
  } finally {release();}
});

test.describe('typed modal graph editing',()=>{
  test.use({projectPath:'examples/order-flow'});
  test('authors valid steps and typed connections in the internal view without changing the root',async({page,session})=>{
    await page.goto(session.url);await page.locator('.bd-root-frame .bd-canvas').hover();await page.getByRole('button',{name:'Fit',exact:true}).click();
    await page.getByRole('button',{name:'Reserve inventory',exact:true}).click();await page.getByRole('button',{name:'Explore internals'}).click();
    const modal=page.getByRole('dialog');await modal.getByLabel('New node label',{exact:true}).fill('Audit');await modal.getByRole('button',{name:'Add node',exact:true}).click();await expect(modal.locator('[data-node-id="node-1"]')).toHaveCount(1);
    await modal.getByLabel('Connection source',{exact:true}).selectOption('reservation-valid');await modal.getByLabel('Connection target',{exact:true}).selectOption('node-1');await modal.getByRole('button',{name:'Add connection',exact:true}).click();await expect(modal.getByRole('status')).toContainText('decision');
    await modal.getByLabel('Connection source',{exact:true}).selectOption('reservation-write');await modal.getByLabel('Connection target',{exact:true}).selectOption('node-1');
    await modal.getByLabel('Connection kind',{exact:true}).selectOption('branch');await modal.getByLabel('Connection label',{exact:true}).fill('Review');await modal.getByRole('button',{name:'Add connection',exact:true}).click();
    await modal.locator('.bd-canvas').hover();await modal.getByRole('button',{name:'Fit',exact:true}).click();await modal.getByRole('button',{name:'Audit',exact:true}).click();
    await modal.getByLabel('Summary',{exact:true}).fill('An optional audit.');await modal.getByLabel('Details',{exact:true}).fill('Full browser-authored detail.');await modal.getByLabel('Step kind',{exact:true}).selectOption('decision');
    await modal.getByRole('button',{name:'Save changes',exact:true}).click();await expect(modal.getByRole('status')).toHaveText('Saved');
    let saved=await readProject(session.dir);expect(saved.document.version).toBe(2);if(saved.document.version!==2)throw new Error('Expected typed source');
    const view=saved.document.views.reservation;if(view.type!=='flowchart')throw new Error('Expected flowchart');
    expect(view.stepKinds['node-1']).toBe('decision');expect(saved.document.nodes['node-1']).toMatchObject({summary:'An optional audit.',details:'Full browser-authored detail.'});expect(saved.document.views.flow).toEqual(session.input.document.views.flow);
    const edge=view.edges.find(e=>e.target==='node-1')!;expect(edge).toMatchObject({kind:'branch',label:'Review'});
    await modal.getByRole('button',{name:'Back',exact:true}).click();await modal.getByLabel('Existing connection',{exact:true}).selectOption(edge.id);await modal.getByLabel('Connection kind',{exact:true}).selectOption('error');await modal.getByLabel('Connection label',{exact:true}).fill('Audit failed');await modal.getByRole('button',{name:'Update connection',exact:true}).click();
    await modal.getByLabel('Existing connection',{exact:true}).selectOption(view.edges[0].id);await modal.getByLabel('Connection kind',{exact:true}).selectOption('branch');await modal.getByLabel('Connection label',{exact:true}).fill('Enter');await modal.getByRole('button',{name:'Update connection',exact:true}).click();await modal.getByRole('button',{name:'Save changes',exact:true}).click();await expect(modal.getByRole('status')).toHaveText('Saved');
    expect((await readProject(session.dir)).document.views.reservation.edges.map(e=>e.id)).toEqual(view.edges.map(e=>e.id));await modal.getByLabel('Existing connection',{exact:true}).selectOption(edge.id);
    await modal.getByRole('button',{name:'Remove connection',exact:true}).click();await modal.locator('.bd-canvas').hover();await modal.getByRole('button',{name:'Fit',exact:true}).click();await modal.getByRole('button',{name:'Write reservation',exact:true}).click();
    await modal.getByLabel('Step kind',{exact:true}).selectOption('decision');await expect(modal.getByLabel('Step kind',{exact:true})).toHaveValue('action');await expect(modal.getByRole('status')).toContainText('decision');
    await modal.getByRole('button',{name:'Remove from view',exact:true}).click();await modal.getByRole('button',{name:'Save changes',exact:true}).click();await expect(modal.getByRole('status')).toHaveText('Saved');
    saved=await readProject(session.dir);if(saved.document.version!==2)throw new Error('Expected typed source');const after=saved.document.views.reservation;if(after.type!=='flowchart')throw new Error('Expected flowchart');
    expect(after.mainPath).toEqual(['reservation-valid-done']);expect(after.edges.some(e=>e.id===edge.id)).toBe(false);expect(saved.document.nodes['reservation-write']).toEqual(session.input.document.nodes['reservation-write']);
    const ids=await page.locator('[id]').evaluateAll(els=>els.map(el=>el.id));expect(new Set(ids).size).toBe(ids.length);expect(await page.locator('.bd-root-frame').evaluate(el=>el instanceof HTMLElement && el.inert)).toBe(true);
  });

  test('keeps select focus after file refresh and disables new typed fields during a save',async({page,session})=>{
    await page.goto(session.url);await page.locator('.bd-root-frame .bd-canvas').hover();await page.getByRole('button',{name:'Fit',exact:true}).click();await page.getByRole('button',{name:'Reserve inventory',exact:true}).click();
    const modal=page.getByRole('dialog'),kind=modal.getByLabel('Step kind',{exact:true});await kind.focus();await writeFile(join(session.dir,'theme.css'),'.node-body{stroke:#ff0000}');
    await expect(page.locator('[data-node-id=reserve] .node-body')).toHaveCSS('stroke','rgb(255, 0, 0)');await expect(kind).toBeFocused();
    let release!:()=>void;const blocked=new Promise<void>(resolve=>{release=resolve;});await page.route('**/api/document',async route=>{await blocked;await route.continue();});
    try {
      await modal.getByLabel('Label',{exact:true}).fill('Reserve stock');await modal.getByLabel('Summary',{exact:true}).fill('Hold stock for this order.');await modal.getByRole('button',{name:'Save changes',exact:true}).click();await expect(modal.getByRole('status')).toHaveText('Saving…');
      await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Add node',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Order received',exact:true}).click();
      await expect(modal.getByLabel('Summary',{exact:true})).toBeDisabled();await expect(modal.getByLabel('Step kind',{exact:true})).toBeDisabled();await expect(modal.getByRole('button',{name:'Remove from view',exact:true})).toBeDisabled();
      release();await expect(modal.getByRole('status')).toHaveText('Saved');await expect(modal.getByLabel('Summary',{exact:true})).toBeEnabled();expect((await readProject(session.dir)).document.nodes.reserve.label).toBe('Reserve stock');
    } finally {release();}
  });
});

test.describe('typed source refresh',()=>{
  test.use({projectPath:'examples/architecture-small'});
  test('keeps dirty modal text through style/logo errors and offers draft recovery inside the modal',async({page,session})=>{
    await page.goto(session.url);await page.locator('.bd-root-frame .bd-canvas').hover();await page.getByRole('button',{name:'Fit',exact:true}).click();await page.getByRole('button',{name:'Order service',exact:true}).click();
    const modal=page.getByRole('dialog');await modal.getByLabel('Label',{exact:true}).fill('Draft order');await modal.getByLabel('Summary',{exact:true}).fill('A full unsaved summary.');
    const logo=await readFile(join(session.dir,'logos/service.svg'),'utf8');await writeFile(join(session.dir,'theme.css'),'.node-body{fill:#ddffee}');await expect(page.locator('[data-node-id=orders] .node-body')).toHaveCSS('fill','rgb(221, 255, 238)');await expect(modal.getByLabel('Summary',{exact:true})).toBeFocused();
    await writeFile(join(session.dir,'logos/service.svg'),'<svg');await expect(modal.getByRole('alert')).toContainText('SVG');await expect(modal.getByLabel('Summary',{exact:true})).toHaveValue('A full unsaved summary.');await expect(page.locator('[data-node-id=orders]')).toHaveAttribute('aria-label','Draft order');
    await writeFile(join(session.dir,'logos/service.svg'),logo.replace('#4f7cff','#eeaa44'));await expect(modal.getByRole('alert')).toBeHidden();
    const changed=structuredClone(session.input.document);changed.nodes.orders.details='Changed on disk';await writeFile(join(session.dir,'diagram.json'),JSON.stringify(changed));await expect(modal.getByRole('status')).toContainText('Conflict');
    const pending=page.waitForEvent('download');await modal.getByRole('button',{name:'Download draft',exact:true}).click();const draft=JSON.parse(await readFile((await (await pending).path())!,'utf8'));expect(draft.nodes.orders.summary).toBe('A full unsaved summary.');expect(draft.version).toBe(2);
    await modal.getByRole('button',{name:'Reload files (discard draft)',exact:true}).click();await expect(modal.getByLabel('Details',{exact:true})).toHaveValue('Changed on disk');await expect(modal.getByLabel('Label',{exact:true})).toHaveValue('Order service');
  });

  test('trims removed nodes, internal views, and child links to the nearest valid context',async({page,session})=>{
    await page.goto(session.url);await page.locator('.bd-root-frame .bd-canvas').hover();await page.getByRole('button',{name:'Fit',exact:true}).click();await page.getByRole('button',{name:'Order service',exact:true}).click();await page.getByRole('button',{name:'Explore internals'}).click();
    const modal=page.getByRole('dialog');await modal.locator('.bd-canvas').hover();await modal.getByRole('button',{name:'Fit',exact:true}).click();await modal.getByRole('button',{name:'Stock client',exact:true}).click();await modal.getByRole('button',{name:'Explore internals'}).click();await modal.getByRole('button',{name:'Availability check',exact:true}).click();
    const changed=structuredClone(session.input.document);if(changed.version!==2)throw new Error('Expected typed source');const inner=changed.views.inventory;if(inner.type!=='architecture')throw new Error('Expected architecture');inner.nodeIds=inner.nodeIds.filter(id=>id!=='inventory-check');inner.edges=inner.edges.filter(e=>e.source!=='inventory-check'&&e.target!=='inventory-check');delete changed.nodes['inventory-check'];
    await writeFile(join(session.dir,'diagram.json'),JSON.stringify(changed));await expect(modal.locator('.bd-canvas')).toHaveCount(1);await expect(modal.getByLabel('Label',{exact:true})).toHaveCount(0);
    delete changed.views.inventory;delete changed.nodes['orders-stock'].childViewId;await writeFile(join(session.dir,'diagram.json'),JSON.stringify(changed));await expect(modal.getByLabel('Label',{exact:true})).toHaveValue('Stock client');await expect(modal.getByRole('button',{name:'Explore internals'})).toHaveCount(0);
    delete changed.views.orders;delete changed.nodes.orders.childViewId;await writeFile(join(session.dir,'diagram.json'),JSON.stringify(changed));await expect(modal.getByLabel('Label',{exact:true})).toHaveValue('Order service');
    const root=changed.views.small;if(root.type!=='architecture')throw new Error('Expected architecture');root.nodeIds=root.nodeIds.filter(id=>id!=='orders');root.edges=root.edges.filter(e=>e.source!=='orders'&&e.target!=='orders');for(const g of root.groups??[])g.nodeIds=g.nodeIds.filter(id=>id!=='orders');delete changed.nodes.orders;
    await writeFile(join(session.dir,'diagram.json'),JSON.stringify(changed));await expect(modal).toBeHidden();await expect(page.getByRole('status')).toHaveText('Updated from files');
  });
});
