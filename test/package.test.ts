import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,mkdtemp,rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { parseDocument } from '../src/model.ts';

test('plugin identity matches the package and its skill example is valid',async()=>{
  const plugin=JSON.parse(await readFile('plugin.json','utf8')),pkg=JSON.parse(await readFile('package.json','utf8'));
  assert.equal(plugin.name,pkg.name);assert.equal(plugin.version,pkg.version);
  const skill=await readFile('skills/diagram-authoring/SKILL.md','utf8');assert.match(skill,/^---\nname: diagram-authoring\n/);
  parseDocument(JSON.parse(await readFile('skills/diagram-authoring/assets/minimal-diagram.json','utf8')));
});

test('packed CLI installs offline outside the checkout and builds a working offline viewer',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'diagram-package-'));
  const run=(command:string,args:string[],cwd=dir)=>{const result=spawnSync(command,args,{cwd,encoding:'utf8',timeout:60_000});assert.ifError(result.error);assert.equal(result.status,0,result.stderr);return result;};
  try {
    const packed=run('npm',['pack','--json','--pack-destination',dir],process.cwd());
    const meta=JSON.parse(packed.stdout)[0];const files:string[]=meta.files.map((file:{path:string})=>file.path);
    for(const path of ['dist/cli.mjs','dist/viewer.js','dist/editor.js','plugin.json','skills/diagram-authoring/SKILL.md'])assert.ok(files.includes(path),path);
    assert.ok(!files.some(path=>path.startsWith('dist/test/')||path.startsWith('docs/superpowers/')||path.startsWith('node_modules/')));
    const prefix=join(dir,'prefix');run('npm',['install','--global','--prefix',prefix,'--ignore-scripts','--offline',join(dir,meta.filename)]);
    const binary=join(prefix,'bin/better-diagrams');const project=resolve('examples/skill-install');
    const checked=run(binary,['check',project]);assert.equal(JSON.parse(checked.stdout).ok,true);
    const artifact=join(dir,'diagram.html');run(binary,['build',project,'--out',artifact]);
    const browser=await chromium.launch({headless:true,executablePath:existsSync('/usr/bin/google-chrome')?'/usr/bin/google-chrome':undefined,args:['--no-sandbox']});
    try {
      const context=await browser.newContext({offline:true});const page=await context.newPage();await page.goto(pathToFileURL(artifact).href);await page.locator('.bd-root-frame .bd-canvas').hover();await page.getByRole('button',{name:'Fit',exact:true}).click();
      await page.getByRole('button',{name:'Verify installed content',exact:true}).click();
      assert.equal(await page.getByRole('heading',{name:'Verify installed content',exact:true}).isVisible(),true);
      await page.getByRole('button',{name:'Explore internals'}).click();await page.getByRole('button',{name:'Compare fingerprints',exact:true}).waitFor();
    } finally {await browser.close();}
  } finally {await rm(dir,{recursive:true,force:true});}
});
