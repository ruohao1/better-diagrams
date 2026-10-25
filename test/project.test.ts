import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readProject, saveDocument } from '../src/project.ts';

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

test('saves with a document revision and keeps a bounded recovery copy', async () => {
  const dir=await mkdtemp(join(tmpdir(),'diagram-save-'));
  try {
    const input=await readProject('examples/skill-install');
    const original=JSON.stringify(input.document);await writeFile(join(dir,'diagram.json'),original);
    const before=await readProject(dir);const edited=structuredClone(before.document);edited.nodes.select.label='Updated label';
    const after=await saveDocument(dir,edited,before.documentRevision);
    assert.equal(after.document.nodes.select.label,'Updated label');
    assert.equal(await readFile(join(dir,'.diagram-recovery/previous.json'),'utf8'),original);
    await assert.rejects(saveDocument(dir,before.document,before.documentRevision),/conflict/i);
    assert.equal((await readProject(dir)).documentRevision,after.documentRevision);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('serializes same-base saves and rejects a recovery-directory escape', async () => {
  const dir=await mkdtemp(join(tmpdir(),'diagram-save-race-'));
  const outside=await mkdtemp(join(tmpdir(),'diagram-outside-'));
  try {
    const input=await readProject('examples/skill-install');await writeFile(join(dir,'diagram.json'),JSON.stringify(input.document));
    const before=await readProject(dir);const a=structuredClone(before.document),b=structuredClone(before.document);a.title='First';b.title='Second';
    const results=await Promise.allSettled([saveDocument(dir,a,before.documentRevision),saveDocument(dir,b,before.documentRevision)]);
    assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
    await rm(join(dir,'.diagram-recovery'),{recursive:true});await symlink(outside,join(dir,'.diagram-recovery'));
    const now=await readProject(dir);
    await assert.rejects(saveDocument(dir,a,now.documentRevision),/symlink|escape/i);
    assert.equal((await readProject(dir)).documentRevision,now.documentRevision);
  } finally {await rm(dir,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
});
