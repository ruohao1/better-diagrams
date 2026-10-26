import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('CLI help explains its commands without requiring a project',()=>{
  const result=spawnSync(process.execPath,['dist/cli.mjs','--help'],{encoding:'utf8'});
  assert.ifError(result.error);assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/check PROJECT/);assert.match(result.stdout,/dev PROJECT/);
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
