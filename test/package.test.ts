import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,mkdtemp,rm,mkdir,copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { parseDocument } from '../src/model.ts';

test('plugin identity matches the package and its skill example is valid',async()=>{
  const plugin=JSON.parse(await readFile('plugin.json','utf8')),pkg=JSON.parse(await readFile('package.json','utf8'));
  assert.equal(plugin.name,pkg.name.split('/').at(-1));assert.equal(plugin.version,pkg.version);
  const skill=await readFile('skills/diagram-authoring/SKILL.md','utf8');assert.match(skill,/^---\nname: diagram-authoring\n/);
  parseDocument(JSON.parse(await readFile('skills/diagram-authoring/assets/minimal-diagram.json','utf8')));
});

test('packed CLI installs offline outside the checkout and builds a working offline viewer',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'diagram-package-'));
  const run=(command:string,args:string[],cwd=dir)=>{const result=spawnSync(command,args,{cwd,encoding:'utf8',timeout:60_000});assert.ifError(result.error);assert.equal(result.status,0,result.stderr);return result;};
  try {
    const packed=run('npm',['pack','--json','--pack-destination',dir],process.cwd());
    const meta=JSON.parse(packed.stdout)[0];const files:string[]=meta.files.map((file:{path:string})=>file.path);
    for(const path of ['dist/cli.mjs','dist/viewer.js','dist/editor.js','dist/licenses/elkjs-LICENSE.md','dist/licenses/semver-LICENSE','plugin.json','CHANGELOG.md','skills/diagram-authoring/SKILL.md'])assert.ok(files.includes(path),path);
    assert.ok(!files.some(path=>path.startsWith('dist/test/')||path.startsWith('docs/')||path.startsWith('src/')||path.startsWith('test/')||path.startsWith('node_modules/')||path.includes('.prototype.')));
    const prefix=join(dir,'prefix');run('npm',['install','--global','--prefix',prefix,'--ignore-scripts','--offline',join(dir,meta.filename)]);
    const binary=join(prefix,'bin/better-diagrams'),installed=join(prefix,'lib/node_modules/@isqrd/better-diagrams'),starter=join(dir,'starter');await mkdir(starter);await copyFile(join(installed,'skills/diagram-authoring/assets/minimal-diagram.json'),join(starter,'diagram.json'));
    const browser=await chromium.launch({headless:true,executablePath:existsSync('/usr/bin/google-chrome')?'/usr/bin/google-chrome':undefined,args:['--no-sandbox']});
    try {
      const context=await browser.newContext({offline:true});
      for(const item of [
        {name:'skill-install',node:'Verify installed content',internal:'Compare fingerprints',fixed:false},
        {name:'architecture-small',node:'Order service',internal:'Request validator',fixed:true},
        {name:'order-flow',node:'Reserve inventory',internal:'Write reservation',fixed:false},
        {name:'starter',node:'Storage function',internal:'Write to Map',fixed:true},
      ]){
        const project=item.name==='starter'?starter:join(installed,'examples',item.name),checked=run(binary,['check',project]);assert.equal(JSON.parse(checked.stdout).ok,true);
        const artifact=join(dir,item.name+'.html'),built=run(binary,['build',project,'--out',artifact]);assert.equal(JSON.parse(built.stdout).rendering,'not-verified');
        const page=await context.newPage(),requests:string[]=[],errors:string[]=[];page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});page.on('pageerror',e=>errors.push(String(e)));await page.goto(pathToFileURL(artifact).href);await page.locator('.bd-root-frame .bd-canvas').hover();await page.getByRole('button',{name:'Fit',exact:true}).click();
        if(item.fixed)assert.equal(await page.locator('[data-node-id] .node-body').first().getAttribute('width'),'252','The packaged starter must use fixed architecture cards');
        if(item.name==='architecture-small')assert.equal(await page.locator('[data-logo]').count(),1);
        await page.getByRole('button',{name:item.node,exact:true}).click();assert.equal(await page.getByRole('dialog').getByRole('heading',{name:item.node,exact:true}).isVisible(),true);
        await page.getByRole('button',{name:'Explore internals'}).click();const modal=page.getByRole('dialog');await modal.locator('.bd-canvas').hover();await modal.getByRole('button',{name:'Fit',exact:true}).click();await modal.getByRole('button',{name:item.internal,exact:true}).waitFor();
        const pending=page.waitForEvent('download');await modal.getByRole('button',{name:'Export SVG',exact:true}).click();const xml=await readFile((await (await pending).path())!,'utf8');assert.match(xml,/<svg/);assert.ok(!xml.includes('bd-modal'));assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);await page.close();
      }
    } finally {await browser.close();}
  } finally {await rm(dir,{recursive:true,force:true});}
});
