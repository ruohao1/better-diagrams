import { readFile, readdir, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, sep } from 'node:path';
import { parseDocument } from './model.ts';
import type { ProjectSnapshot } from './model.ts';

export const digest = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');

export async function containedPath(root: string, name: string): Promise<string> {
  const canonicalRoot=await realpath(root), target=await realpath(resolve(canonicalRoot,name));
  const rel=relative(canonicalRoot,target);
  if (rel === '..' || rel.startsWith('..'+sep) || resolve(canonicalRoot,rel)!==target) throw new Error('Asset escapes outside project: '+name);
  return target;
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
