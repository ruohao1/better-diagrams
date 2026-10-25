import { mountViewer } from './viewer.ts';
import type { ProjectEvent } from '../protocol.ts';

async function start():Promise<void> {
  const initial=await (await fetch('/api/project')).json();
  const viewer=await mountViewer(document.getElementById('app')!,initial);
  const events=new EventSource('/api/events');
  events.addEventListener('snapshot',event=>{const message=JSON.parse((event as MessageEvent).data) as ProjectEvent;if(message.type==='snapshot')void viewer.update(message.snapshot).catch(()=>{});});
}
start().catch(error=>{document.getElementById('app')!.textContent='Unable to open editor: '+String(error);});
