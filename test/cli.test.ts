import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('CLI help explains its commands without requiring a project',()=>{
  const result=spawnSync(process.execPath,['dist/cli.mjs','--help'],{encoding:'utf8'});
  assert.ifError(result.error);assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/check PROJECT/);assert.match(result.stdout,/dev PROJECT/);
});

test('CLI reports the embedded package version without a project or registry',async()=>{
  const pkg=JSON.parse(await readFile('package.json','utf8'));
  const result=spawnSync(process.execPath,['dist/cli.mjs','--version'],{encoding:'utf8',env:{...process.env,npm_config_registry:'http://127.0.0.1:1'}});
  assert.ifError(result.error);assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,pkg.version+'\n');assert.equal(result.stderr,'');
});

test('CLI checks source and builds a self-contained artifact', async () => {
  const dir=await mkdtemp(join(tmpdir(),'diagram-cli-'));
  try {
    for(const name of ['skill-install','architecture-small','order-flow']){
      const checked=spawnSync(process.execPath,['dist/cli.mjs','check','examples/'+name],{encoding:'utf8'});assert.ifError(checked.error);assert.equal(checked.status,0,checked.stderr);assert.equal(JSON.parse(checked.stdout).ok,true);
      const out=join(dir,name+'.html'),built=spawnSync(process.execPath,['dist/cli.mjs','build','examples/'+name,'--out',out],{encoding:'utf8'});assert.ifError(built.error);assert.equal(built.status,0,built.stderr);assert.equal(JSON.parse(built.stdout).rendering,'not-verified');assert.match(await readFile(out,'utf8'),/diagram-data/);
    }
    const invalid=spawnSync(process.execPath,['dist/cli.mjs','check',dir],{encoding:'utf8'});
    assert.ifError(invalid.error);
    assert.equal(invalid.status,1);
    assert.equal(JSON.parse(invalid.stderr).ok,false);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('CLI reports endpoint repair hints without changing source or writing an artifact', async () => {
  const dir=await mkdtemp(join(tmpdir(),'diagram-cli-invalid-'));
  try {
    const document=JSON.parse(await readFile('skills/diagram-authoring/assets/minimal-diagram.json','utf8'));
    document.nodes.worker={label:'Worker',summary:'Sends notifications.',details:''};
    document.views.overview.edges[0].target='worker';
    const source=JSON.stringify(document),path=join(dir,'diagram.json'),out=join(dir,'diagram.html');
    await writeFile(path,source);
    for(const args of [['check',dir],['build',dir,'--out',out]]){
      const result=spawnSync(process.execPath,['dist/cli.mjs',...args],{encoding:'utf8'});
      assert.ifError(result.error);assert.equal(result.status,1);assert.equal(result.stdout,'');
      const error=JSON.parse(result.stderr);assert.equal(error.ok,false);
      assert.match(error.error,/overview.*save.*target.*worker/);
      assert.match(error.error,/not in this view.*views.overview.nodeIds/);
    }
    assert.equal(await readFile(path,'utf8'),source);
    await assert.rejects(readFile(out),{code:'ENOENT'});
  } finally {await rm(dir,{recursive:true,force:true});}
});
