import type { DiagramDocument } from '../model.ts';
import type { LiveSnapshot,ProjectEvent } from '../protocol.ts';
import { mountViewer } from './viewer.ts';
import type { ViewerHandle } from './viewer.ts';

export type EditorTransport={save(document:DiagramDocument,expectedDocumentRevision:string):Promise<LiveSnapshot>;subscribe(listener:(event:ProjectEvent)=>void):()=>void};

export async function mountEditor(host:HTMLElement,initial:LiveSnapshot,transport:EditorTransport):Promise<{destroy():void}> {
  const root=document.createElement('section');root.className='bd-editor';
  const style=document.createElement('style');style.textContent=`
  .bd-editor{font-family:ui-sans-serif,system-ui,sans-serif}.bd-editor-bar{background:#fff;border-bottom:1px solid #dbe2eb;padding:14px 32px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;font-size:13px;color:#425a77}.bd-editor-bar [role=status]{flex:1;min-width:160px}.bd-graph-tools{padding:12px 32px;background:#f0f3f8;border-bottom:1px solid #dbe2eb;display:flex;align-items:end;gap:10px;flex-wrap:wrap;font-size:11px;color:#52647a}.bd-edit-field{display:flex;flex-direction:column;gap:6px;margin-bottom:12px;font-size:12px;font-weight:550;color:#52647a}.bd-graph-tools .bd-edit-field{margin:0}.bd-editor input,.bd-editor textarea,.bd-editor select{font:inherit;color:#243b57;background:white;border:1px solid #b9c8da;border-radius:6px;padding:8px;max-width:100%}.bd-editor textarea{min-height:150px;resize:vertical;width:100%}.bd-editor input:focus,.bd-editor textarea:focus,.bd-editor select:focus{outline:2px solid #9dbbef;outline-offset:1px}.bd-editor .bd-canvas{height:max(420px,calc(100vh - 430px))}.bd-editor .bd-details{max-height:max(420px,calc(100vh - 430px))}.bd-editor-bar button,.bd-graph-tools button{font:inherit;font-size:12px;padding:8px 12px;border:1px solid #bdcde0;border-radius:6px;background:white;color:#294d7b;cursor:pointer}.bd-editor button:disabled{opacity:.5;cursor:default}.bd-editor [hidden]{display:none!important}
  `;
  const bar=document.createElement('div');bar.className='bd-editor-bar';
  const status=document.createElement('span');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const tools=document.createElement('div');tools.className='bd-graph-tools';
  const viewHost=document.createElement('div');root.append(style,bar,tools,viewHost);host.append(root);
  let base=initial,draft=structuredClone(initial.document),dirty=false,saving=false,pending:LiveSnapshot|undefined,deferred:LiveSnapshot|undefined,lastSequence=initial.sequence,viewId=initial.document.rootViewId,viewer:ViewerHandle|undefined;
  const controls:HTMLButtonElement[]=[];
  function say(text:string):void {status.textContent=text;}
  function button(label:string,action:()=>unknown,write=false):HTMLButtonElement {
    const el=document.createElement('button');el.type='button';el.textContent=label;el.className='bd-button';
    el.onclick=()=>{try{Promise.resolve(action()).catch(error=>say(error instanceof Error?error.message:String(error)));}catch(error){say(String(error));}};
    if(write)controls.push(el);return el;
  }
  function field<T extends HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>(label:string,input:T,parent:HTMLElement):T {
    const wrapper=document.createElement('div');wrapper.className='bd-edit-field';
    input.disabled=saving;
    input.id='bd-edit-'+label.toLowerCase().replace(/\W+/g,'-');
    const caption=document.createElement('label');caption.htmlFor=input.id;caption.textContent=label;
    wrapper.append(caption,input);parent.append(wrapper);return input;
  }
  const save=button('Save changes',async()=>{
    if(saving || !dirty || pending)return;
    saving=true;syncControls();say('Saving…');
    const submitted=structuredClone(draft);
    try {
      const saved=await transport.save(submitted,base.documentRevision);
      base=saved;draft=submitted;dirty=false;pending=undefined;lastSequence=Math.max(lastSequence,saved.sequence);say('Saved');
      if(deferred && deferred.sequence>saved.sequence)await applySnapshot(deferred);
      else {if(deferred?.documentRevision===saved.documentRevision)base=deferred;await preview();}
    } catch(error) {
      const code=error && typeof error==='object' && 'code' in error?error.code:'';
      say(code==='CONFLICT'?'Conflict: source changed. Download your draft before reloading.':'Save failed: '+(error instanceof Error?error.message:JSON.stringify(error)));
      if(deferred && deferred.documentRevision!==base.documentRevision)pending=deferred;
    } finally {saving=false;deferred=undefined;syncControls();}
  });
  const reload=button('Reload files (discard draft)',async()=>{if(!pending)return;base=pending;draft=structuredClone(base.document);dirty=false;pending=undefined;say('Updated from files');await preview();syncControls();});
  const download=button('Download draft',()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(draft,null,2)+'\n'],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='diagram-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  bar.append(status,save,reload,download);
  const newLabel=field('New node label',document.createElement('input'),tools);
  const addNode=button('Add node',async()=>{
    if(saving || draft.version!==1)return;let n=1;while(Object.hasOwn(draft.nodes,'node-'+n))n++;
    const id='node-'+n;draft.nodes[id]={label:newLabel.value.trim()||'New node',details:''};draft.views[viewId].nodeIds.push(id);newLabel.value='';edited();await preview();
  },true);tools.append(addNode);
  const from=field('Connection source',document.createElement('select'),tools),to=field('Connection target',document.createElement('select'),tools);
  const addEdge=button('Add connection',async()=>{
    if(saving || draft.version!==1 || !from.value || !to.value)return;
    const view=draft.views[viewId];let n=1;while(view.edges.some(edge=>edge.id==='edge-'+n))n++;
    view.edges.push({id:'edge-'+n,source:from.value,target:to.value});edited();await preview();
  },true);tools.append(addEdge);
  const edgeToRemove=field('Connection to remove',document.createElement('select'),tools);
  tools.append(button('Remove connection',async()=>{if(saving || draft.version!==1 || !edgeToRemove.value)return;draft.views[viewId].edges=draft.views[viewId].edges.filter(edge=>edge.id!==edgeToRemove.value);edited();await preview();},true));
  function syncControls():void {
    save.disabled=saving || !dirty || !!pending;reload.hidden=!pending;
    for(const el of root.querySelectorAll<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>('input,textarea,select'))el.disabled=saving;
    for(const el of controls)if(el.isConnected)el.disabled=saving || draft.version!==1;
    addEdge.disabled=saving || draft.version!==1 || !draft.views[viewId]?.nodeIds.length;
  }
  function choices():void {
    const view=draft.views[viewId];if(!view)return;
    for(const select of [from,to]){const previous=select.value;select.replaceChildren(...view.nodeIds.map(id=>new Option(draft.nodes[id].label,id)));if(view.nodeIds.includes(previous))select.value=previous;}
    const previous=edgeToRemove.value;edgeToRemove.replaceChildren(...view.edges.map(edge=>new Option(draft.nodes[edge.source].label+' → '+draft.nodes[edge.target].label,edge.id)));
    if(view.edges.some(edge=>edge.id===previous))edgeToRemove.value=previous;
  }
  function edited():void {dirty=true;say(pending?'Conflict: source changed. Download your draft before reloading.':'Unsaved changes');syncControls();}
  let rendering:Promise<void>|undefined;
  let previewRequested=false;
  let previewFailed=false;
  function preview():Promise<void> {
    if(!viewer)return Promise.resolve();
    previewRequested=true;
    if(rendering)return rendering;
    const run=async()=>{
      while(previewRequested){
        previewRequested=false;
        const revision=base.revision,serialized=JSON.stringify(draft);
        try{await viewer!.update({...base,document:JSON.parse(serialized)});previewFailed=false;if(status.textContent?.startsWith('Preview error:'))say(dirty?'Unsaved changes':'Saved');}
        catch(error){previewFailed=true;say('Preview error: '+(error instanceof Error?error.message:String(error)));}
        choices();syncControls();
        // DOM replacement can emit change again; rerender only if source or draft actually changed.
        previewRequested=revision!==base.revision || serialized!==JSON.stringify(draft);
      }
    };
    rendering=run().finally(()=>{rendering=undefined;});return rendering;
  }
  function details(parent:HTMLElement,nodeId:string):void {
    const node=draft.nodes[nodeId];const heading=document.createElement('h2');heading.textContent=node.label;parent.append(heading);
    const label=field('Label',document.createElement('input'),parent);label.value=node.label;
    const description=field('Details',document.createElement('textarea'),parent);description.value=node.details;
    label.oninput=()=>{draft.nodes[nodeId].label=label.value;edited();};description.oninput=()=>{draft.nodes[nodeId].details=description.value;edited();};
    label.onchange=description.onchange=()=>{void preview();};
    for(const ref of node.references ?? []){const row=document.createElement('p'),text=ref.path+(ref.line?':'+ref.line:'');if(ref.url){const a=document.createElement('a');a.href=ref.url;a.textContent=text;a.target='_blank';a.rel='noopener noreferrer';row.append(a);}else row.textContent=text;parent.append(row);}
    const remove=button('Remove from view',async()=>{
      if(saving || draft.version!==1)return;const view=draft.views[viewId];view.nodeIds=view.nodeIds.filter(id=>id!==nodeId);view.edges=view.edges.filter(edge=>edge.source!==nodeId && edge.target!==nodeId);
      for(const group of view.groups ?? [])group.nodeIds=group.nodeIds.filter(id=>id!==nodeId);edited();await preview();
    });remove.disabled=saving || draft.version!==1;parent.append(remove);
  }
  async function applySnapshot(snapshot:LiveSnapshot):Promise<void> {
    if(dirty && snapshot.documentRevision!==base.documentRevision){pending=snapshot;say('Conflict: files changed. Download your draft or reload files.');syncControls();return;}
    base=snapshot;if(!dirty)draft=structuredClone(snapshot.document);
    await preview();if(!previewFailed && base.sequence===snapshot.sequence)say(dirty?'Unsaved changes':'Updated from files');
  }
  viewer=await mountViewer(viewHost,{...initial,document:draft},{renderDetails:details,onViewChange:id=>{viewId=id;choices();syncControls();}});
  const unsubscribe=transport.subscribe(event=>{
    if(event.type==='error'){say('Source error: '+event.message);return;}
    if(event.snapshot.sequence<=lastSequence)return;lastSequence=event.snapshot.sequence;
    if(saving){deferred=event.snapshot;return;}
    void applySnapshot(event.snapshot).catch(error=>say(String(error)));
  });
  say(draft.version===1?'Saved':'Saved; typed graph editing is not yet available');choices();syncControls();
  const beforeUnload=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',beforeUnload);
  return {destroy:()=>{unsubscribe();viewer?.destroy();window.removeEventListener('beforeunload',beforeUnload);root.remove();}};
}
