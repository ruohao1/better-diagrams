import { test as base } from '@playwright/test';
import { mkdtemp,cp,readFile,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startDev } from '../../src/server.ts';
import { readProject } from '../../src/project.ts';
import type { ProjectSnapshot } from '../../src/model.ts';

export const test=base.extend<{session:{dir:string;url:string;input:ProjectSnapshot}}>({
  session:async({},use)=>{
    const dir=await mkdtemp(join(tmpdir(),'diagram-browser-'));
    await cp('examples/skill-install',dir,{recursive:true});
    const server=await startDev(dir,{editorJs:await readFile('dist/editor.js','utf8')});
    try{await use({dir,url:server.url,input:await readProject(dir)});}finally{await server.close();await rm(dir,{recursive:true,force:true});}
  },
});
export { expect } from '@playwright/test';
