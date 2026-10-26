import type {DiagramDocument} from '../model.ts';
import type {LiveSnapshot,ProjectEvent} from '../protocol.ts';
import {mountViewer} from './viewer.ts';
import type {ViewerHandle} from './viewer.ts';

export type EditorTransport={save(document:DiagramDocument,expectedDocumentRevision:string):Promise<LiveSnapshot>;subscribe(listener:(event:ProjectEvent)=>void):()=>void};
type WriteElement=HTMLButtonElement|HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement;
type GraphForm={label:string;from:string;to:string;remove:string};
type Frame={host:HTMLElement;viewId:string;status:HTMLElement;save:HTMLButtonElement;reload:HTMLButtonElement;graph?:{label:HTMLInputElement;from:HTMLSelectElement;to:HTMLSelectElement;remove:HTMLSelectElement;add:HTMLButtonElement}};

export async function mountEditor(host:HTMLElement,initial:LiveSnapshot,transport:EditorTransport):Promise<{destroy():void}> {
  const root=document.createElement('section');root.className='bd-editor';
  const style=document.createElement('style');style.textContent=`
  .bd-editor{font-family:ui-sans-serif,system-ui,sans-serif}.bd-editor-bar{background:#fff;border-bottom:1px solid #dbe2eb;padding:12px 20px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:13px;color:#425a77}.bd-editor-bar [role=status]{flex:1;min-width:140px}.bd-graph-tools{padding:10px 20px;background:#f0f3f8;border-bottom:1px solid #dbe2eb;display:flex;align-items:end;gap:10px;flex-wrap:wrap;font-size:11px;color:#52647a}.bd-edit-field{display:flex;flex-direction:column;gap:6px;margin-bottom:12px;font-size:12px;font-weight:550;color:#52647a}.bd-graph-tools .bd-edit-field{margin:0}.bd-editor input,.bd-editor textarea,.bd-editor select{font:inherit;color:#243b57;background:white;border:1px solid #b9c8da;border-radius:6px;padding:8px;max-width:100%}.bd-editor textarea{min-height:150px;resize:vertical;width:100%}.bd-editor input:focus,.bd-editor textarea:focus,.bd-editor select:focus{outline:2px solid #9dbbef;outline-offset:1px}.bd-editor [hidden]{display:none!important}
  `;
  const viewHost=document.createElement('div');root.append(style,viewHost);host.append(root);
  let base=initial,draft=structuredClone(initial.document),dirty=false,saving=false,pending:LiveSnapshot|undefined,deferred:LiveSnapshot|undefined,lastSequence=initial.sequence,viewer:ViewerHandle|undefined,statusText='Saved';
  let frames:Frame[]=[],writes:{element:WriteElement;graph:boolean}[]=[];
  const forms=new Map<string,GraphForm>();
  const form=(viewId:string)=>{let state=forms.get(viewId);if(!state){state={label:'',from:'',to:'',remove:''};forms.set(viewId,state);}return state;};
  function say(text:string):void {statusText=text;for(const frame of frames)if(frame.host.isConnected)frame.status.textContent=text;}
  function button(label:string,action:()=>unknown,write?:'draft'|'graph'):HTMLButtonElement {
    const el=document.createElement('button');el.type='button';el.className='bd-button';el.textContent=label;
    el.onclick=()=>{try{Promise.resolve(action()).catch(error=>say(error instanceof Error?error.message:String(error)));}catch(error){say(String(error));}};
    if(write){writes.push({element:el,graph:write==='graph'});el.disabled=saving || (write==='graph' && draft.version!==1);}return el;
  }
  function field<T extends HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>(label:string,input:T,parent:HTMLElement,graph=false):T {
    const wrapper=document.createElement('div');wrapper.className='bd-edit-field';
    input.id='bd-edit-'+parent.dataset.frameKey+'-'+label.toLowerCase().replace(/\W+/g,'-');input.disabled=saving || (graph && draft.version!==1);
    const caption=document.createElement('label');caption.htmlFor=input.id;caption.textContent=label;wrapper.append(caption,input);parent.append(wrapper);writes.push({element:input,graph});return input;
  }
  function syncControls():void {
    frames=frames.filter(frame=>frame.host.isConnected && frame.host.contains(frame.status));writes=writes.filter(write=>write.element.isConnected);
    for(const {element,graph} of writes)element.disabled=saving || (graph && draft.version!==1);
    for(const frame of frames){frame.status.textContent=statusText;frame.save.disabled=saving || !dirty || !!pending;frame.reload.hidden=!pending;
      if(frame.graph)frame.graph.add.disabled=saving || draft.version!==1 || !draft.views[frame.viewId]?.nodeIds.length;
    }
  }
  function choices():void {
    for(const frame of frames){
      const view=draft.views[frame.viewId],graph=frame.graph;if(!view || !graph)continue;const state=form(frame.viewId);
      for(const [select,key] of [[graph.from,'from'],[graph.to,'to']] as const){select.replaceChildren(...view.nodeIds.map(id=>new Option(draft.nodes[id]?.label??id,id)));if(view.nodeIds.includes(state[key]))select.value=state[key];else state[key]=select.value;}
      graph.remove.replaceChildren(...view.edges.map(edge=>new Option((draft.nodes[edge.source]?.label??edge.source)+' → '+(draft.nodes[edge.target]?.label??edge.target),edge.id)));
      if(view.edges.some(edge=>edge.id===state.remove))graph.remove.value=state.remove;else state.remove=graph.remove.value;
    }
  }
  function edited():void {dirty=true;say(pending?'Conflict: source changed. Download your draft before reloading.':'Unsaved changes');syncControls();}
  let rendering:Promise<void>|undefined,previewRequested=false,previewFailed=false;
  function preview():Promise<void> {
    if(!viewer)return Promise.resolve();previewRequested=true;if(rendering)return rendering;
    const run=async()=>{
      while(previewRequested){
        previewRequested=false;const revision=base.revision,serialized=JSON.stringify(draft);
        try {await viewer!.update({...base,document:JSON.parse(serialized)});previewFailed=false;if(statusText.startsWith('Preview error:'))say(dirty?'Unsaved changes':'Saved');}
        catch(error){previewFailed=true;say('Preview error: '+(error instanceof Error?error.message:String(error)));}
        choices();syncControls();
        // Re-render only if source or draft changed while SVG measurement was pending.
        previewRequested=revision!==base.revision || serialized!==JSON.stringify(draft);
      }
    };
    rendering=run().finally(()=>{rendering=undefined;});return rendering;
  }
  async function save():Promise<void> {
    if(saving || !dirty || pending)return;saving=true;syncControls();say('Saving…');const submitted=structuredClone(draft);
    try {
      const saved=await transport.save(submitted,base.documentRevision);base=saved;draft=submitted;dirty=false;pending=undefined;lastSequence=Math.max(lastSequence,saved.sequence);say('Saved');
      if(deferred && deferred.sequence>saved.sequence)await applySnapshot(deferred);
      else {if(deferred?.documentRevision===saved.documentRevision)base=deferred;await preview();}
    } catch(error){
      const code=error && typeof error==='object' && 'code' in error?error.code:'';
      say(code==='CONFLICT'?'Conflict: source changed. Download your draft before reloading.':'Save failed: '+(error instanceof Error?error.message:JSON.stringify(error)));
      if(deferred && deferred.documentRevision!==base.documentRevision)pending=deferred;
    } finally {saving=false;deferred=undefined;syncControls();}
  }
  function download():void {
    const url=URL.createObjectURL(new Blob([JSON.stringify(draft,null,2)+'\n'],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='diagram-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function authoringControls(parent:HTMLElement,viewId:string,mode:'diagram'|'details'):void {
    const bar=document.createElement('div');bar.className='bd-editor-bar';const status=document.createElement('span');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.textContent=statusText;
    const reload=button('Reload files (discard draft)',async()=>{if(saving || !pending)return;base=pending;draft=structuredClone(base.document);dirty=false;pending=undefined;say('Updated from files');await preview();syncControls();},'draft');
    const saveButton=button('Save changes',save),frame:Frame={host:parent,viewId,status,save:saveButton,reload};bar.append(status,saveButton,reload,button('Download draft',download));parent.append(bar);frames.push(frame);
    if(mode==='diagram'){
      const tools=document.createElement('div');tools.className='bd-graph-tools';tools.dataset.frameKey=parent.dataset.frameKey+'-graph';parent.append(tools);const state=form(viewId);
      const label=field('New node label',document.createElement('input'),tools,true);label.value=state.label;label.oninput=()=>{state.label=label.value;};
      tools.append(button('Add node',async()=>{
        if(saving || draft.version!==1)return;const view=draft.views[viewId];if(!view)return;let n=1;while(Object.hasOwn(draft.nodes,'node-'+n))n++;const id='node-'+n;
        draft.nodes[id]={label:label.value.trim()||'New node',details:''};view.nodeIds.push(id);state.label='';label.value='';edited();await preview();
      },'graph'));
      const from=field('Connection source',document.createElement('select'),tools,true),to=field('Connection target',document.createElement('select'),tools,true);
      from.onchange=()=>{state.from=from.value;};to.onchange=()=>{state.to=to.value;};
      const add=button('Add connection',async()=>{
        if(saving || draft.version!==1 || !from.value || !to.value)return;const view=draft.views[viewId];if(!view)return;let n=1;while(view.edges.some(edge=>edge.id==='edge-'+n))n++;
        view.edges.push({id:'edge-'+n,source:from.value,target:to.value});edited();await preview();
      },'graph');tools.append(add);
      const remove=field('Connection to remove',document.createElement('select'),tools,true);remove.onchange=()=>{state.remove=remove.value;};
      tools.append(button('Remove connection',async()=>{if(saving || draft.version!==1 || !remove.value)return;const view=draft.views[viewId];if(!view)return;view.edges=view.edges.filter(edge=>edge.id!==remove.value);edited();await preview();},'graph'));
      frame.graph={label,from,to,remove,add};
    }
    choices();syncControls();
  }
  function details(parent:HTMLElement,nodeId:string,viewId:string):void {
    const node=draft.nodes[nodeId];if(!node){parent.textContent='This node is no longer in the draft.';return;}
    const heading=document.createElement('h2');heading.textContent=node.label;parent.append(heading);
    const label=field('Label',document.createElement('input'),parent);label.value=node.label;
    const description=field('Details',document.createElement('textarea'),parent);description.value=node.details;
    label.oninput=()=>{if(!draft.nodes[nodeId])return;draft.nodes[nodeId].label=label.value;edited();};description.oninput=()=>{if(!draft.nodes[nodeId])return;draft.nodes[nodeId].details=description.value;edited();};
    label.onchange=description.onchange=()=>{void preview();};
    for(const ref of node.references??[]){const row=document.createElement('p'),text=ref.path+(ref.line?':'+ref.line:'');if(ref.url){const a=document.createElement('a');a.href=ref.url;a.textContent=text;a.target='_blank';a.rel='noopener noreferrer';row.append(a);}else row.textContent=text;parent.append(row);}
    parent.append(button('Remove from view',async()=>{
      if(saving || draft.version!==1)return;const view=draft.views[viewId];if(!view)return;view.nodeIds=view.nodeIds.filter(id=>id!==nodeId);view.edges=view.edges.filter(edge=>edge.source!==nodeId && edge.target!==nodeId);for(const group of view.groups??[])group.nodeIds=group.nodeIds.filter(id=>id!==nodeId);edited();await preview();
    },'graph'));syncControls();
  }
  async function applySnapshot(snapshot:LiveSnapshot):Promise<void> {
    if(dirty && snapshot.documentRevision!==base.documentRevision){pending=snapshot;say('Conflict: files changed. Download your draft or reload files.');syncControls();return;}
    base=snapshot;if(!dirty)draft=structuredClone(snapshot.document);await preview();if(!previewFailed && base.sequence===snapshot.sequence)say(dirty?'Unsaved changes':'Updated from files');
  }
  viewer=await mountViewer(viewHost,{...initial,document:draft},{renderDetails:details,renderAuthoringControls:authoringControls,onViewChange:()=>{choices();syncControls();}});
  const unsubscribe=transport.subscribe(event=>{
    if(event.type==='error'){say('Source error: '+event.message);return;}if(event.snapshot.sequence<=lastSequence)return;lastSequence=event.snapshot.sequence;
    if(saving){deferred=event.snapshot;return;}void applySnapshot(event.snapshot).catch(error=>say(String(error)));
  });
  say(draft.version===1?'Saved':'Saved; typed graph editing is not yet available');choices();syncControls();
  const beforeUnload=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',beforeUnload);
  return {destroy:()=>{unsubscribe();viewer?.destroy();window.removeEventListener('beforeunload',beforeUnload);root.remove();}};
}
