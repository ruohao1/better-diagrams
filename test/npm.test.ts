import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execute=promisify(execFile);
for(const native of [false,true])test('launches Windows npm '+(native?'executables':'command scripts')+' without parsing arguments as shell code',async()=>{
  const {npmCommand}=await import('../src/npm.ts');
  const root=await mkdtemp(join(tmpdir(),'diagram-npm-launch-')),directory=join(root,'npm & tools');
  try{
    await mkdir(join(directory,'node_modules/npm/bin'),{recursive:true});
    const echo='#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify(process.argv.slice(2)));\n';
    await writeFile(join(directory,'npm.cmd'),'@echo off\r\nexit /b 99\r\n');
    await writeFile(join(directory,'node_modules/npm/bin/npm-cli.js'),echo);
    if(native)await writeFile(join(directory,'npm.exe'),echo,{mode:0o755});
    const command=await npmCommand('win32',{Path:join(root,'absent')+';"'+directory+'"'});
    const result=await execute(command.file,[...command.args,'install','--prefix','C:\\My Tools & More','@isqrd/better-diagrams@0.2.0']);
    assert.deepEqual(JSON.parse(result.stdout),['install','--prefix','C:\\My Tools & More','@isqrd/better-diagrams@0.2.0']);
    if(native)assert.equal(command.file,join(directory,'npm.exe'));
  }finally{await rm(root,{recursive:true,force:true});}
});

test('reports missing Windows npm without starting a shell',async()=>{
  const {npmCommand}=await import('../src/npm.ts');
  await assert.rejects(npmCommand('win32',{Path:''}),{code:'ENOENT'});
});
