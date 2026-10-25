import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readProject } from '../src/project.ts';

test('reads a project and hashes exact document bytes separately from styles', async () => {
  const project=await readProject('examples/skill-install');
  assert.equal(project.document.title,'Install a local agent skill');
  assert.match(project.revision,/^[a-f0-9]{64}$/);
  const dir=await mkdtemp(join(tmpdir(),'diagram-read-'));
  try {
    await writeFile(join(dir,'diagram.json'),JSON.stringify(project.document));
    const before=await readProject(dir);
    await writeFile(join(dir,'theme.css'),'.node-body { fill: pink; }');
    const after=await readProject(dir);
    assert.equal(after.documentRevision,before.documentRevision);
    assert.notEqual(after.revision,before.revision);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('rejects an asset symlink escaping the project', async () => {
  const dir=await mkdtemp(join(tmpdir(),'diagram-boundary-'));
  try {
    const project=await readProject('examples/skill-install');
    await writeFile(join(dir,'diagram.json'),JSON.stringify(project.document));
    await symlink('/etc/hostname',join(dir,'theme.css'));
    await assert.rejects(readProject(dir),/outside|escape/i);
  } finally {await rm(dir,{recursive:true,force:true});}
});
