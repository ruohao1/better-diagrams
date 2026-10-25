import { mountViewer } from './viewer.ts';
import type { ProjectInput } from '../model.ts';

const host=document.getElementById('app')!;
try {
  const input=JSON.parse(document.getElementById('diagram-data')!.textContent!) as ProjectInput;
  mountViewer(host,input).catch(error=>{const p=document.createElement('p');p.setAttribute('role','alert');p.textContent=String(error);host.append(p);});
} catch(error) {host.textContent='Unable to load diagram: '+String(error);}
