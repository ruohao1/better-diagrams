import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,mkdtemp,rm,mkdir,copyFile,cp,writeFile,symlink } from 'node:fs/promises';
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

test('the skill folder alone builds a working offline viewer outside the checkout',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'diagram skill '));
  try {
    const skill=join(dir,'diagram-authoring'),project=join(dir,'project'),artifact=join(dir,'diagram.html');
    await cp('skills/diagram-authoring',skill,{recursive:true});await mkdir(project);
    await copyFile(join(skill,'assets/minimal-diagram.json'),join(project,'diagram.json'));
    const cli=join(skill,'bin/cli.mjs');
    const run=(args:string[])=>{const result=spawnSync(process.execPath,[cli,...args],{cwd:project,encoding:'utf8',timeout:10_000,env:{...process.env,npm_config_registry:'http://127.0.0.1:1'}});assert.ifError(result.error);assert.equal(result.status,0,result.stderr);return result;};
    assert.equal(run(['--version']).stdout,JSON.parse(await readFile('package.json','utf8')).version+'\n');
    assert.equal(JSON.parse(run(['check',project]).stdout).ok,true);
    assert.equal(JSON.parse(run(['build',project,'--out',artifact]).stdout).rendering,'not-verified');
    const browser=await chromium.launch({headless:true,executablePath:existsSync('/usr/bin/google-chrome')?'/usr/bin/google-chrome':undefined,args:['--no-sandbox']});
    try {
      const context=await browser.newContext({offline:true}),page=await context.newPage(),requests:string[]=[],errors:string[]=[];
      page.on('request',request=>{if(/^https?:/.test(request.url()))requests.push(request.url());});page.on('pageerror',error=>errors.push(String(error)));
      await page.goto(pathToFileURL(artifact).href);await page.locator('.bd-root-frame .bd-canvas').hover();await page.getByRole('button',{name:'Fit',exact:true}).click();
      await page.getByRole('button',{name:'Storage function',exact:true}).click();await page.getByRole('button',{name:'Explore internals'}).click();
      await page.getByRole('dialog').getByRole('button',{name:'Write to Map',exact:true}).waitFor();
      assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);
    }finally{await browser.close();}
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('packed CLI installs offline outside the checkout and builds a working offline viewer',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'diagram-package-'));
  const run=(command:string,args:string[],cwd=dir)=>{const result=spawnSync(command,args,{cwd,encoding:'utf8',timeout:60_000});assert.ifError(result.error);assert.equal(result.status,0,result.stderr);return result;};
  try {
    const packed=run('npm',['pack','--json','--pack-destination',dir],process.cwd());
    const meta=Object.values(JSON.parse(packed.stdout))[0] as {filename:string;files:{path:string}[]};const files=meta.files.map(file=>file.path);
    for(const path of ['dist/cli.mjs','dist/viewer.js','dist/editor.js','dist/licenses/elkjs-LICENSE.md','dist/licenses/semver-LICENSE','plugin.json','CHANGELOG.md','skills/diagram-authoring/SKILL.md','skills/diagram-authoring/bin/cli.mjs','skills/diagram-authoring/bin/viewer.js','skills/diagram-authoring/bin/editor.js','skills/diagram-authoring/licenses/elkjs-LICENSE.md','skills/diagram-authoring/licenses/semver-LICENSE'])assert.ok(files.includes(path),path);
    assert.ok(!files.some(path=>path.startsWith('dist/test/')||path.startsWith('docs/')||path.startsWith('src/')||path.startsWith('test/')||path.startsWith('node_modules/')||path.includes('.prototype.')));
    const prefix=join(dir,'prefix');run('npm',['install','--global','--prefix',prefix,'--ignore-scripts','--offline',join(dir,meta.filename)]);
    const binary=join(prefix,'bin/better-diagrams'),installed=join(prefix,'lib/node_modules/@isqrd/better-diagrams'),starter=join(dir,'starter');await mkdir(starter);await copyFile(join(installed,'skills/diagram-authoring/assets/minimal-diagram.json'),join(starter,'diagram.json'));
    assert.equal(run(binary,['--version']).stdout,JSON.parse(await readFile(join(installed,'package.json'),'utf8')).version+'\n');
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
        const page=await context.newPage(),requests:string[]=[],errors:string[]=[];page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});page.on('pageerror',e=>errors.push(String(e)));await page.goto(pathToFileURL(artifact).href);
        try{await page.locator('.bd-root-frame .bd-canvas').hover();}
        catch(error){const body=await page.locator('body').innerText({timeout:2000}).catch(()=>'<unavailable>');throw new Error('Packaged '+item.name+' startup failed: '+JSON.stringify({browser:browser.version(),errors,body:body.slice(0,2000)}),{cause:error});}
        await page.getByRole('button',{name:'Fit',exact:true}).click();
        if(item.fixed)assert.equal(await page.locator('[data-node-id] .node-body').first().getAttribute('width'),'252','The packaged starter must use fixed architecture cards');
        if(item.name==='architecture-small')assert.equal(await page.locator('[data-logo]').count(),1);
        await page.getByRole('button',{name:item.node,exact:true}).click();assert.equal(await page.getByRole('dialog').getByRole('heading',{name:item.node,exact:true}).isVisible(),true);
        await page.getByRole('button',{name:'Explore internals'}).click();const modal=page.getByRole('dialog');await modal.locator('.bd-canvas').hover();await modal.getByRole('button',{name:'Fit',exact:true}).click();await modal.getByRole('button',{name:item.internal,exact:true}).waitFor();
        const pending=page.waitForEvent('download');await modal.getByRole('button',{name:'Export SVG',exact:true}).click();const xml=await readFile((await (await pending).path())!,'utf8');assert.match(xml,/<svg/);assert.ok(!xml.includes('bd-modal'));assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);await page.close();
      }
    } finally {await browser.close();}
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('the skill ZIP replaces older contents and runs after extraction',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'diagram-skill-zip-')),archive=join(dir,'dist/better-diagrams-skill.zip'),script=resolve('scripts/package-skill.mjs');
  const run=(command:string,args:string[],cwd=dir)=>{const result=spawnSync(command,args,{cwd,encoding:'utf8',timeout:30_000});assert.ifError(result.error);assert.equal(result.status,0,result.stderr);return result;};
  try {
    await cp('skills/diagram-authoring',join(dir,'skills/diagram-authoring'),{recursive:true});
    run('git',['init','--quiet']);run('git',['add','skills']);
    await writeFile(join(dir,'skills/diagram-authoring/private-local.txt'),'Untracked local files must not be distributed.');
    await mkdir(join(dir,'dist'));
    await writeFile(join(dir,'stale.txt'),'This file must not survive archive replacement.');run('zip',['-q',archive,'stale.txt']);
    run(process.execPath,[script]);
    const entries=run('unzip',['-Z1',archive]).stdout.trim().split('\n');
    for(const path of ['SKILL.md','bin/cli.mjs','bin/viewer.js','bin/editor.js','licenses/elkjs-LICENSE.md','licenses/semver-LICENSE','references/source-format.md','assets/minimal-diagram.json'])assert.ok(entries.includes('diagram-authoring/'+path),path);
    assert.ok(entries.every(path=>path.startsWith('diagram-authoring/')));assert.ok(!entries.some(path=>/node_modules|(^|\/)src\/|(^|\/)test\/|stale\.txt|private-local\.txt/.test(path)));
    run('unzip',['-q',archive,'-d',dir]);
    const skill=join(dir,'diagram-authoring'),cli=join(skill,'bin/cli.mjs'),project=join(dir,'project');await mkdir(project);await copyFile(join(skill,'assets/minimal-diagram.json'),join(project,'diagram.json'));
    assert.equal(run(process.execPath,[cli,'--version']).stdout,JSON.parse(await readFile('package.json','utf8')).version+'\n');
    assert.equal(JSON.parse(run(process.execPath,[cli,'check',project]).stdout).ok,true);
    assert.equal(JSON.parse(run(process.execPath,[cli,'build',project,'--out',join(dir,'diagram.html')]).stdout).ok,true);
    run('git',['rm','--cached','--quiet','skills/diagram-authoring/bin/editor.js']);
    const incomplete=spawnSync(process.execPath,[script],{cwd:dir,encoding:'utf8'});assert.notEqual(incomplete.status,0);assert.match(incomplete.stderr,/complete skill runtime/);run('git',['add','skills/diagram-authoring/bin/editor.js']);
    const sourceSkill=join(dir,'skills/diagram-authoring/SKILL.md');await rm(sourceSkill);await symlink(join(dir,'stale.txt'),sourceSkill);
    const rejected=spawnSync(process.execPath,[script],{cwd:dir,encoding:'utf8'});assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/regular file/);
    await rm(sourceSkill);await copyFile('skills/diagram-authoring/SKILL.md',sourceSkill);
    const outside=join(dir,'outside-assets');await cp(join(dir,'skills/diagram-authoring/assets'),outside,{recursive:true});await rm(join(dir,'skills/diagram-authoring/assets'),{recursive:true});await symlink(outside,join(dir,'skills/diagram-authoring/assets'),'dir');
    const ancestor=spawnSync(process.execPath,[script],{cwd:dir,encoding:'utf8'});assert.notEqual(ancestor.status,0);assert.match(ancestor.stderr,/symbolic link/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
