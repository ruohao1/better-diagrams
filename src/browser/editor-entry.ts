import { mountEditor } from './editor.ts';
import type { ProjectEvent } from '../protocol.ts';

async function start():Promise<void> {
  const token=JSON.parse(document.getElementById('diagram-data')!.textContent!).token;
  const response=await fetch('/api/project');if(!response.ok)throw new Error('Unable to read project');
  const initial=await response.json();
  await mountEditor(document.getElementById('app')!,initial,{
    save:async(document,expectedDocumentRevision)=>{
      const response=await fetch('/api/document',{method:'PUT',headers:{'content-type':'application/json','x-diagram-token':token},body:JSON.stringify({document,expectedDocumentRevision})});
      const result=await response.json();if(!response.ok)throw result.error;return result;
    },
    subscribe:listener=>{
      const events=new EventSource('/api/events');
      for(const type of ['snapshot','error'])events.addEventListener(type,event=>{if(event instanceof MessageEvent)listener(JSON.parse(event.data) as ProjectEvent);});
      events.onerror=event=>{if(!(event instanceof MessageEvent))listener({type:'error',message:'Connection lost; reconnecting. Your draft is retained.'});};
      return()=>events.close();
    },
  });
}
start().catch(error=>{document.getElementById('app')!.textContent='Unable to open editor: '+String(error);});
