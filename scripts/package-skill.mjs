import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,rm,lstat} from 'node:fs/promises';
import {resolve} from 'node:path';

const archive=resolve('dist/better-diagrams-skill.zip');
const execute=promisify(execFile),{stdout}=await execute('git',['ls-files','-z','--','skills/diagram-authoring']);
const paths=stdout.split('\0').filter(Boolean),files=paths.map(path=>path.slice('skills/'.length));
for(const name of ['cli.mjs','viewer.js','editor.js'])if(!files.includes('diagram-authoring/bin/'+name))throw new Error('Build and track the complete skill runtime before packaging.');
for(const path of paths){
  const parts=path.split('/');
  for(let end=1;end<parts.length;end++){
    const parent=parts.slice(0,end).join('/');
    if((await lstat(parent)).isSymbolicLink())throw new Error('Skill archive cannot traverse a symbolic link: '+parent);
  }
  if(!(await lstat(path)).isFile())throw new Error('Skill archive requires a regular file: '+path);
}
await mkdir('dist',{recursive:true});
// zip updates existing archives; start fresh so removed skill files cannot survive.
await rm(archive,{force:true});
await execute('zip',['-q','-X',archive,...files],{cwd:resolve('skills')});
process.stdout.write(JSON.stringify({ok:true,archive})+'\n');
