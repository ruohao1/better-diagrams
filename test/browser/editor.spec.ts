import { test,expect } from './fixtures.ts';
import { readFile,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readProject } from '../../src/project.ts';
import type { ProjectEvent,LiveSnapshot } from '../../src/protocol.ts';

declare global {
  var DiagramEditor:typeof import('../../src/browser/editor.ts');
  var editorHarness:{emit:(event:ProjectEvent)=>void;failSave:boolean};
}

test('guards typed graph mutations until typed authoring is available',async({page})=>{
  const document=JSON.parse(await readFile('examples/architecture-small/diagram.json','utf8'));
  await page.setContent('<main id="app"></main>');await page.addScriptTag({path:'dist/test/editor.js'});
  await page.evaluate(async document=>{
    await DiagramEditor.mountEditor(window.document.getElementById('app')!,{document,themeCss:'',templates:{},revision:'test',documentRevision:'test',sequence:1},{subscribe:()=>()=>{},save:async()=>{throw new Error('Unexpected save');}});
  },document);
  await expect(page.getByRole('button',{name:'Add node',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Add connection',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Order service',exact:true}).click();
  await expect(page.getByLabel('Label',{exact:true})).toBeEditable();
  await expect(page.getByRole('button',{name:'Remove from view',exact:true})).toBeDisabled();
});

test('roundtrips content, nodes and edges while preserving other views and metadata',async({page,session})=>{
  await page.goto(session.url);
  await page.getByRole('button',{name:'Save installation receipt',exact:true}).click();
  await page.getByLabel('Label',{exact:true}).fill('Saved receipt');
  await page.getByLabel('Details',{exact:true}).fill('A browser edit.');
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Saved');
  let saved=await readProject(session.dir);
  expect(saved.document.nodes.receipt.references).toEqual(session.input.document.nodes.receipt.references);
  expect(saved.document.nodes.receipt.data).toEqual(session.input.document.nodes.receipt.data);
  expect(saved.document.nodes.receipt.details).toBe('A browser edit.');
  await page.getByLabel('New node label',{exact:true}).fill('Notify');
  await page.getByRole('button',{name:'Add node',exact:true}).click();
  const node=page.getByRole('button',{name:'Notify',exact:true});await expect(node).toBeVisible();
  const id=(await node.getAttribute('data-node-id'))!;
  await page.getByLabel('Connection source',{exact:true}).selectOption('receipt');
  await page.getByLabel('Connection target',{exact:true}).selectOption(id);
  await page.getByRole('button',{name:'Add connection',exact:true}).click();
  await page.getByRole('button',{name:'Save changes',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Saved');
  saved=await readProject(session.dir);expect(saved.document.views.overview.edges.some(e=>e.source==='receipt'&&e.target===id)).toBe(true);
  const edge=saved.document.views.overview.edges.find(e=>e.source==='receipt'&&e.target===id)!;
  await page.getByLabel('Connection to remove',{exact:true}).selectOption(edge.id);
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
  await expect(page.getByLabel('Connection source',{exact:true}).locator('option')).toHaveCount(5);
});

test('refreshes clean sources and preserves a dirty draft on external conflict',async({page,session})=>{
  await page.goto(session.url);await expect(page.getByRole('button',{name:'Save changes',exact:true})).toBeVisible();
  const changed=structuredClone(session.input.document);changed.title='Updated from files';
  await writeFile(join(session.dir,'diagram.json'),JSON.stringify(changed));
  await expect(page.getByRole('heading',{name:'Updated from files',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Save installation receipt',exact:true}).click();
  await page.getByLabel('Label',{exact:true}).fill('Unsaved draft');
  changed.title='External changes';changed.nodes.receipt.label='From disk';
  await writeFile(join(session.dir,'diagram.json'),JSON.stringify(changed));
  await expect(page.getByRole('status')).toContainText('Conflict');
  await expect(page.getByLabel('Label',{exact:true})).toHaveValue('Unsaved draft');
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download draft',exact:true}).click();
  const download=await downloadPromise;expect(JSON.parse(await readFile((await download.path())!,'utf8')).nodes.receipt.label).toBe('Unsaved draft');
  await page.getByRole('button',{name:'Reload files (discard draft)',exact:true}).click();
  await expect(page.getByRole('heading',{name:'External changes',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'From disk',exact:true})).toBeVisible();
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
  await page.getByRole('button',{name:'Save installation receipt',exact:true}).click();
  await page.getByLabel('Label',{exact:true}).fill('Draft label');
  await page.evaluate(initial=>editorHarness.emit({type:'snapshot',snapshot:{...initial,sequence:2,revision:'styled',themeCss:'.node-body{fill:#eef7ff}'}}),initial);
  await expect(page.getByLabel('Label',{exact:true})).toHaveValue('Draft label');
  await page.getByRole('button',{name:'Save changes',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Saved');
  await page.evaluate(initial=>editorHarness.emit({type:'snapshot',snapshot:{...initial,sequence:1}}),initial);
  await expect(page.getByRole('button',{name:'Draft label',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Draft label',exact:true}).click();
  await page.getByLabel('Label',{exact:true}).fill('Preserved after rejection');
  await page.evaluate(()=>{editorHarness.failSave=true;});
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Conflict');
  await expect(page.getByLabel('Label',{exact:true})).toHaveValue('Preserved after rejection');
});

test('reports invalid source as a validation error and recovers the live view',async({page,session})=>{
  await page.goto(session.url);await expect(page.getByRole('button',{name:'Select skill',exact:true})).toBeVisible();
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
    await page.goto(session.url);
    await page.getByRole('button',{name:'Select skill',exact:true}).click();
    await page.getByLabel('Label',{exact:true}).fill('Chosen skill');
    await page.getByRole('button',{name:'Save changes',exact:true}).click();
    await expect(page.getByRole('status')).toHaveText('Saving…');
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
