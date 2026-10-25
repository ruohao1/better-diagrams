import { readFile, readdir, realpath, lstat, mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { watch, lstatSync } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, relative, sep, isAbsolute } from 'node:path';
import { parseDocument } from './model.ts';
import type { ProjectSnapshot, DiagramDocument } from './model.ts';

export const digest = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');

export async function containedPath(root: string, name: string): Promise<string> {
  const canonicalRoot=await realpath(root), target=await realpath(resolve(canonicalRoot,name));
  const rel=relative(canonicalRoot,target);
  if (isAbsolute(rel) || rel === '..' || rel.startsWith('..'+sep) || resolve(canonicalRoot,rel)!==target) throw new Error('Asset escapes outside project: '+name);
  return target;
}

function failure(code:string,message:string):Error & {code:string} {return Object.assign(new Error(message),{code});}
const saves=new Map<string,Promise<unknown>>();

async function replaceFile(path:string,data:string|Uint8Array,mode=0o600):Promise<void> {
  const temp=path+'.'+randomUUID()+'.tmp';
  try {await writeFile(temp,data,{flag:'wx',mode,flush:true});await rename(temp,path);}
  finally {await unlink(temp).catch(()=>{});}
}

export async function saveDocument(root:string,document:DiagramDocument,expectedDocumentRevision:string):Promise<ProjectSnapshot> {
  try {parseDocument(document);}catch(error){throw failure('INVALID_DOCUMENT',error instanceof Error?error.message:String(error));}
  root=await realpath(root);
  const previous=saves.get(root) ?? Promise.resolve();
  const operation=previous.catch(()=>{}).then(async()=>{
    const path=resolve(root,'diagram.json'),stat=await lstat(path);
    if(stat.isSymbolicLink())throw failure('FORBIDDEN','Refusing a document symlink');
    await containedPath(root,'diagram.json');
    const before=await readFile(path);
    if(digest(before)!==expectedDocumentRevision)throw failure('CONFLICT','Source conflict: files changed since this draft was loaded');
    const recovery=resolve(root,'.diagram-recovery');
    try {if((await lstat(recovery)).isSymbolicLink())throw failure('FORBIDDEN','Refusing a recovery-directory symlink escape');}
    catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    await mkdir(recovery,{recursive:true});await containedPath(root,'.diagram-recovery');
    const backup=resolve(recovery,'previous.json');
    try {if((await lstat(backup)).isSymbolicLink())throw failure('FORBIDDEN','Refusing a recovery-file symlink escape');}
    catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    await replaceFile(backup,before);
    if(digest(await readFile(path))!==expectedDocumentRevision)throw failure('CONFLICT','Source conflict: files changed during save');
    // Revision checks are optimistic; uncoordinated external writers do not share this queue.
    await replaceFile(path,JSON.stringify(document,null,2)+'\n',stat.mode & 0o777);
    return readProject(root);
  });
  saves.set(root,operation);
  try{return await operation;}finally{if(saves.get(root)===operation)saves.delete(root);}
}

export function watchProject(root:string,onChange:(error?:Error)=>void):()=>void {
  let timer:ReturnType<typeof setTimeout>|undefined;
  let templates:FSWatcher|undefined;
  const changed=()=>{clearTimeout(timer);timer=setTimeout(()=>onChange(),40);};
  const attachTemplates=()=>{
    templates?.close();templates=undefined;
    try {
      const path=resolve(root,'templates');
      if(lstatSync(path).isSymbolicLink())throw new Error('Refusing to watch a template-directory symlink');
      templates=watch(path,(_event,name)=>{if(!name || /^[A-Za-z][A-Za-z0-9_-]*\.svg$/.test(name.toString()))changed();});
      templates.on('error',error=>onChange(error));
    } catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')onChange(error as Error);}
  };
  // Watch directories: recursive file handles can follow the old inode after an editor's atomic save.
  const watcher=watch(root,(_event,filename)=>{
    const name=filename?.toString().replaceAll('\\','/');
    if(!name || name==='templates')attachTemplates();
    if(!name || ['diagram.json','theme.css','templates'].includes(name))changed();
  });
  attachTemplates();
  watcher.on('error',error=>onChange(error));
  return ()=>{clearTimeout(timer);watcher.close();templates?.close();};
}

export async function readProject(root: string): Promise<ProjectSnapshot> {
  const files: [string,string][]=[];
  const read=async(name:string):Promise<{text:string;hash:string}>=>{
    const bytes=await readFile(await containedPath(root,name));
    const hash=digest(bytes);files.push([name,hash]);
    return {text:new TextDecoder('utf-8',{fatal:true}).decode(bytes),hash};
  };
  const source=await read('diagram.json');
  const document=parseDocument(JSON.parse(source.text));
  let themeCss='';
  try {themeCss=(await read('theme.css')).text;} catch(error) {if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  const templates:Record<string,string>=Object.create(null);
  let names:string[]=[];
  try { names=await readdir(await containedPath(root,'templates')); } catch(error) {if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  for (const name of names.sort()) {
    if(!name.endsWith('.svg'))continue;
    const id=name.slice(0,-4);
    if(!/^[A-Za-z][A-Za-z0-9_-]*$/.test(id))throw new Error('Invalid template filename: '+name);
    templates[id]=(await read('templates/'+name)).text;
  }
  return {document,themeCss,templates,documentRevision:source.hash,revision:digest(JSON.stringify(files.sort(([a],[b])=>a.localeCompare(b))))};
}
