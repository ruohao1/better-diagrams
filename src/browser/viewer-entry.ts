import { mountViewer } from './viewer.ts';
import type { ProjectInput } from '../model.ts';
import {inspectProject} from './inspection.ts';
import type {DiagramReport} from './inspection.ts';
import pkg from '../../package.json' with {type:'json'};

declare global {interface Window {betterDiagrams:{inspect():Promise<DiagramReport>}}}

const host=document.getElementById('app')!;
const payload=document.getElementById('diagram-data')!.textContent!;
let inspection:Promise<DiagramReport>|undefined;
window.betterDiagrams={inspect:()=>inspection??=(async()=>{
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload));
  const sourceSha256=Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('');
  return inspectProject(JSON.parse(payload) as ProjectInput,host,{sourceSha256,rendererVersion:pkg.version});
})()};
try {
  const input=JSON.parse(payload) as ProjectInput;
  mountViewer(host,input).catch(error=>{const p=document.createElement('p');p.setAttribute('role','alert');p.textContent=String(error);host.append(p);});
} catch(error) {host.textContent='Unable to load diagram: '+String(error);}
