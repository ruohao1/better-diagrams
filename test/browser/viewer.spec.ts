import { test, expect } from '@playwright/test';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { buildStandaloneHtml } from '../../src/html.ts';
import { readProject } from '../../src/project.ts';

test('opens offline, exposes details, navigates internals and exports only the active diagram', async ({ page,context }) => {
  const dir=await mkdtemp(join(tmpdir(),'diagram-offline-'));
  try {
    const input=await readProject('examples/skill-install');
    const out=join(dir,'diagram.html');
    await writeFile(out,buildStandaloneHtml(input,await readFile('dist/viewer.js','utf8')));
    const requests:string[]=[];
    page.on('request',request=>{if(/^https?:/.test(request.url()))requests.push(request.url());});
    await context.setOffline(true);
    await page.goto(pathToFileURL(out).href);
    await page.getByRole('button',{name:'Verify installed content',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Verify installed content'})).toBeVisible();
    await expect(page.getByRole('link',{name:'scripts/setup.py:245'})).toBeVisible();
    await page.getByRole('button',{name:'Explore internals'}).click();
    await expect(page.getByRole('button',{name:'Compare fingerprints',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Zoom in',exact:true}).click();
    const downloadPromise=page.waitForEvent('download');
    await page.getByRole('button',{name:'Export SVG',exact:true}).click();
    const download=await downloadPromise;const svg=await readFile((await download.path())!,'utf8');
    expect(svg).toContain('data-node-id="fingerprint"');
    expect(svg).not.toMatch(/toolbar|breadcrumb|details-panel|foreignObject|data-node-id="install"/);
    await page.getByRole('button',{name:'Skill installation',exact:true}).click();
    await expect(page.getByRole('button',{name:'Invoke installer',exact:true})).toBeVisible();
    expect(requests).toEqual([]);
    await page.screenshot({path:'.superpowers/sdd/2026-10-25-diagram-authoring/viewer.png'});
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('keeps script-shaped labels/details as text', async ({ page }) => {
  const dir=await mkdtemp(join(tmpdir(),'diagram-text-'));
  try {
    const input=await readProject('examples/skill-install');
    const label='</script><script>globalThis.pwned=true</script>';
    input.document.nodes.select.label=label;input.document.nodes.select.details=label;
    const out=join(dir,'safe.html');await writeFile(out,buildStandaloneHtml(input,await readFile('dist/viewer.js','utf8')));
    await page.goto(pathToFileURL(out).href);
    await page.getByRole('button',{name:label,exact:true}).click();
    await expect(page.getByRole('heading',{name:label,exact:true})).toBeVisible();
    expect(await page.evaluate(()=>Reflect.has(globalThis,'pwned'))).toBe(false);
  } finally {await rm(dir,{recursive:true,force:true});}
});
