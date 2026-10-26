import {parseDocument} from '../model.ts';
import type {ArchitectureEdgeKind,DiagramDocument,DiagramEdgeV1,FlowEdgeKind,FlowStepKind} from '../model.ts';
import {removeConnectionFromView,removeNodeFromView} from './edit-graph.ts';
import type {LiveSnapshot,ProjectEvent} from '../protocol.ts';
import {mountViewer} from './viewer.ts';
import type {ViewerHandle} from './viewer.ts';

export type EditorTransport={save(document:DiagramDocument,expectedDocumentRevision:string):Promise<LiveSnapshot>;subscribe(listener:(event:ProjectEvent)=>void):()=>void};
type WriteElement=HTMLButtonElement|HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement;
type GraphForm={label:string;from:string;to:string;remove:string;kind:string;connectionLabel:string};
type Frame={host:HTMLElement;viewId:string;status:HTMLElement;save:HTMLButtonElement;reload:HTMLButtonElement;graph?:{label:HTMLInputElement;from:HTMLSelectElement;to:HTMLSelectElement;remove:HTMLSelectElement;kind:HTMLSelectElement;connectionLabel:HTMLInputElement;add:HTMLButtonElement;update:HTMLButtonElement}};
const architectureKinds:ArchitectureEdgeKind[]=['call','data','event','telemetry','dependency'];
const flowKinds:FlowEdgeKind[]=['next','branch','error','retry','jump'];
const stepKinds:FlowStepKind[]=['action','decision','start','end'];
function putEdge<T extends DiagramEdgeV1>(edges:T[],edge:T):void {const index=edges.findIndex(e=>e.id===edge.id);if(index<0)edges.push(edge);else edges[index]=edge;}

export async function mountEditor(host:HTMLElement,initial:LiveSnapshot,transport:EditorTransport):Promise<{destroy():void}> {
  const root=document.createElement('section');root.className='bd-editor';
  const style=document.createElement('style');style.textContent=`
  .bd-editor{font-family:ui-sans-serif,system-ui,sans-serif}.bd-editor-bar{background:#fff;border-bottom:1px solid #dbe2eb;padding:12px 20px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:13px;color:#425a77}.bd-editor-bar [role=status]{flex:1;min-width:140px}.bd-graph-tools{padding:10px 20px;background:#f0f3f8;border-bottom:1px solid #dbe2eb;display:flex;align-items:end;gap:10px;flex-wrap:wrap;font-size:11px;color:#52647a}.bd-edit-field{display:flex;flex-direction:column;gap:6px;margin-bottom:12px;font-size:12px;font-weight:550;color:#52647a}.bd-graph-tools .bd-edit-field{margin:0}.bd-editor input,.bd-editor textarea,.bd-editor select{font:inherit;color:#243b57;background:white;border:1px solid #b9c8da;border-radius:6px;padding:8px;max-width:100%}.bd-editor textarea{min-height:150px;resize:vertical;width:100%}.bd-editor input:focus,.bd-editor textarea:focus,.bd-editor select:focus{outline:2px solid #9dbbef;outline-offset:1px}.bd-editor [hidden]{display:none!important}
  `;
  const viewHost=document.createElement('div');root.append(style,viewHost);host.append(root);
  let base=initial,draft=structuredClone(initial.document),dirty=false,saving=false,pending:LiveSnapshot|undefined,deferred:LiveSnapshot|undefined,lastSequence=initial.sequence,viewer:ViewerHandle|undefined,statusText='Saved';
  let frames:Frame[]=[],writes:WriteElement[]=[];
  const forms=new Map<string,GraphForm>();
  const form=(viewId:string)=>{let state=forms.get(viewId);if(!state){state={label:'',from:'',to:'',remove:'',kind:'',connectionLabel:''};forms.set(viewId,state);}return state;};
  function say(text:string):void {statusText=text;for(const frame of frames)if(frame.host.isConnected)frame.status.textContent=text;}
  function button(label:string,action:()=>unknown,write=false):HTMLButtonElement {
    const el=document.createElement('button');el.type='button';el.className='bd-button';el.textContent=label;
    el.onclick=()=>{try{Promise.resolve(action()).catch(error=>say(error instanceof Error?error.message:String(error)));}catch(error){say(String(error));}};
    if(write){writes.push(el);el.disabled=saving;}return el;
  }
  function field<T extends HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>(label:string,input:T,parent:HTMLElement):T {
    const wrapper=document.createElement('div');wrapper.className='bd-edit-field';
    input.id='bd-edit-'+parent.dataset.frameKey+'-'+label.toLowerCase().replace(/\W+/g,'-');input.disabled=saving;
    const caption=document.createElement('label');caption.htmlFor=input.id;caption.textContent=label;wrapper.append(caption,input);parent.append(wrapper);writes.push(input);return input;
  }
  function syncControls():void {
    frames=frames.filter(frame=>frame.host.isConnected && frame.host.contains(frame.status));writes=writes.filter(element=>element.isConnected);
    for(const element of writes){const owner=element.closest<HTMLElement>('[data-edit-view]'),view=owner?draft.views[owner.dataset.editView!]:undefined,node=owner?.dataset.editNode;
      element.disabled=saving || (!!owner && (!view || (!!node && (!Object.hasOwn(draft.nodes,node)||!view.nodeIds.includes(node)))));
    }
    for(const frame of frames){frame.status.textContent=statusText;frame.save.disabled=saving || !dirty || !!pending;frame.reload.hidden=!pending;
      if(frame.graph){frame.graph.add.disabled=saving || !draft.views[frame.viewId]?.nodeIds.length;frame.graph.update.disabled=saving || !form(frame.viewId).remove;
        const view=draft.version===2?draft.views[frame.viewId]:undefined;frame.graph.connectionLabel.disabled=saving || (view?.type==='flowchart' && frame.graph.kind.value==='next');}
    }
  }
  function choices():void {
    for(const frame of frames){
      const view=draft.views[frame.viewId],graph=frame.graph;if(!view || !graph)continue;const state=form(frame.viewId);
      const typed=draft.version===2?draft.views[frame.viewId]:undefined,kinds=typed?.type==='flowchart'?flowKinds:architectureKinds;
      graph.kind.parentElement!.hidden=draft.version===1;graph.kind.replaceChildren(...kinds.map(kind=>new Option(kind,kind)));if(kinds.some(kind=>kind===state.kind))graph.kind.value=state.kind;else state.kind=graph.kind.value;
      for(const [select,key] of [[graph.from,'from'],[graph.to,'to']] as const){select.replaceChildren(...view.nodeIds.map(id=>new Option(draft.nodes[id]?.label??id,id)));if(view.nodeIds.includes(state[key]))select.value=state[key];else state[key]=select.value;}
      graph.remove.replaceChildren(new Option('Choose a connection',''),...view.edges.map(edge=>new Option((draft.nodes[edge.source]?.label??edge.source)+' → '+(draft.nodes[edge.target]?.label??edge.target),edge.id)));
      if(view.edges.some(edge=>edge.id===state.remove))graph.remove.value=state.remove;else {state.remove='';graph.remove.value='';}
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
      await preview();
      while(deferred){const latest=deferred;deferred=undefined;if(latest.sequence>base.sequence)await applySnapshot(latest);}
    } catch(error){
      const code=error && typeof error==='object' && 'code' in error?error.code:'';
      say(code==='CONFLICT'?'Conflict: source changed. Download your draft before reloading.':'Save failed: '+(error instanceof Error?error.message:JSON.stringify(error)));
      if(deferred && deferred.documentRevision!==base.documentRevision)pending=deferred;
    } finally {saving=false;deferred=undefined;syncControls();}
  }
  function download():void {
    const url=URL.createObjectURL(new Blob([JSON.stringify(draft,null,2)+'\n'],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='diagram-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function editConnection(viewId:string,graph:NonNullable<Frame['graph']>,existing?:string):Promise<void> {
    if(saving || !graph.from.value || !graph.to.value)return;const next=structuredClone(draft),view=next.views[viewId];if(!view)return;
    let n=1;while(view.edges.some(edge=>edge.id==='edge-'+n))n++;const id=existing??'edge-'+n,base={id,source:graph.from.value,target:graph.to.value},label=graph.connectionLabel.value.trim();
    if(existing && !view.edges.some(edge=>edge.id===existing))throw new Error('Choose an existing connection');
    if(next.version===1){const v=next.views[viewId],edge={...base,...(label?{label}:{})};putEdge(v.edges,edge);}
    else {
      const v=next.views[viewId];
      if(v.type==='architecture'){const kind=architectureKinds.find(k=>k===graph.kind.value);if(!kind)throw new Error('Choose a connection kind');putEdge(v.edges,{...base,kind,label});}
      else {const kind=flowKinds.find(k=>k===graph.kind.value);if(!kind)throw new Error('Choose a connection kind');putEdge(v.edges,kind==='next'?{...base,kind}:{...base,kind,label});}
    }
    parseDocument(next);draft=next;form(viewId).remove=id;edited();await preview();
  }
  function authoringControls(parent:HTMLElement,viewId:string,mode:'diagram'|'details'):void {
    const bar=document.createElement('div');bar.className='bd-editor-bar';const status=document.createElement('span');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.textContent=statusText;
    const reload=button('Reload files (discard draft)',async()=>{if(saving || !pending)return;base=pending;draft=structuredClone(base.document);dirty=false;pending=undefined;say('Updated from files');await preview();syncControls();},true);
    const saveButton=button('Save changes',save),frame:Frame={host:parent,viewId,status,save:saveButton,reload};bar.append(status,saveButton,reload,button('Download draft',download));parent.append(bar);frames.push(frame);
    if(mode==='diagram'){
      const tools=document.createElement('div');tools.className='bd-graph-tools';tools.dataset.frameKey=parent.dataset.frameKey+'-graph';tools.dataset.editView=viewId;parent.append(tools);const state=form(viewId);
      const label=field('New node label',document.createElement('input'),tools);label.value=state.label;label.oninput=()=>{state.label=label.value;};
      tools.append(button('Add node',async()=>{
        if(saving)return;const view=draft.views[viewId];if(!view)return;let n=1;while(Object.hasOwn(draft.nodes,'node-'+n))n++;const id='node-'+n,node={label:label.value.trim()||'New node',details:''};
        if(draft.version===1)draft.nodes[id]=node;else {draft.nodes[id]={...node,summary:''};const v=draft.views[viewId];if(v.type==='flowchart')v.stepKinds[id]='action';}
        view.nodeIds.push(id);state.label='';label.value='';edited();await preview();
      },true));
      const from=field('Connection source',document.createElement('select'),tools),to=field('Connection target',document.createElement('select'),tools);
      from.onchange=()=>{state.from=from.value;};to.onchange=()=>{state.to=to.value;};
      const kind=field('Connection kind',document.createElement('select'),tools),connectionLabel=field('Connection label',document.createElement('input'),tools);connectionLabel.value=state.connectionLabel;
      connectionLabel.oninput=()=>{state.connectionLabel=connectionLabel.value;};kind.onchange=()=>{state.kind=kind.value;if(kind.value==='next'){state.connectionLabel='';connectionLabel.value='';}syncControls();};
      const add=button('Add connection',()=>editConnection(viewId,frame.graph!),true);tools.append(add);
      const remove=field('Existing connection',document.createElement('select'),tools);remove.onchange=()=>{
        state.remove=remove.value;const edge=draft.views[viewId]?.edges.find(e=>e.id===remove.value);if(edge){state.from=from.value=edge.source;state.to=to.value=edge.target;state.connectionLabel=connectionLabel.value=edge.label??'';
          if(draft.version===2){const typed=draft.views[viewId].edges.find(e=>e.id===edge.id)!;state.kind=kind.value=typed.kind;}}
        syncControls();
      };
      const update=button('Update connection',()=>{if(state.remove)return editConnection(viewId,frame.graph!,state.remove);},true);tools.append(update);
      tools.append(button('Remove connection',async()=>{if(saving || !remove.value || !draft.views[viewId])return;removeConnectionFromView(draft,viewId,remove.value);state.remove='';edited();await preview();},true));
      frame.graph={label,from,to,remove,kind,connectionLabel,add,update};
    }
    choices();syncControls();
  }
  function details(parent:HTMLElement,nodeId:string,viewId:string):void {
    const node=draft.nodes[nodeId];if(!node || !draft.views[viewId]?.nodeIds.includes(nodeId)){parent.textContent='This node is no longer in the draft view.';return;}parent.dataset.editView=viewId;parent.dataset.editNode=nodeId;
    const heading=document.createElement('h2');heading.textContent=node.label;parent.append(heading);
    const label=field('Label',document.createElement('input'),parent);label.value=node.label;
    const description=field('Details',document.createElement('textarea'),parent);description.value=node.details;
    label.oninput=()=>{if(!draft.nodes[nodeId])return;draft.nodes[nodeId].label=label.value;edited();};description.oninput=()=>{if(!draft.nodes[nodeId])return;draft.nodes[nodeId].details=description.value;edited();};
    label.onchange=description.onchange=()=>{void preview();};
    if(draft.version===2){
      const summary=field('Summary',document.createElement('textarea'),parent);summary.value=draft.nodes[nodeId].summary;summary.oninput=()=>{if(draft.version!==2 || !draft.nodes[nodeId])return;draft.nodes[nodeId].summary=summary.value;edited();};summary.onchange=()=>{void preview();};
      const view=draft.views[viewId];if(view.type==='flowchart'){
        const kind=field('Step kind',document.createElement('select'),parent);kind.replaceChildren(...stepKinds.map(k=>new Option(k,k)));kind.value=view.stepKinds[nodeId];
        kind.onchange=()=>{void (async()=>{if(saving || draft.version!==2)return;const next=structuredClone(draft),v=next.views[viewId],value=stepKinds.find(k=>k===kind.value);if(v.type!=='flowchart'||!value)return;const before=v.stepKinds[nodeId];v.stepKinds[nodeId]=value;
          try{parseDocument(next);}catch(error){kind.value=before;say(String(error));return;}draft=next;edited();await preview();})().catch(error=>say(String(error)));};
      }
    }
    for(const ref of node.references??[]){const row=document.createElement('p'),text=ref.path+(ref.line?':'+ref.line:'');if(ref.url){const a=document.createElement('a');a.href=ref.url;a.textContent=text;a.target='_blank';a.rel='noopener noreferrer';row.append(a);}else row.textContent=text;parent.append(row);}
    parent.append(button('Remove from view',async()=>{
      if(saving || !draft.views[viewId])return;removeNodeFromView(draft,viewId,nodeId);edited();await preview();
    },true));syncControls();
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
  say('Saved');choices();syncControls();
  const beforeUnload=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',beforeUnload);
  return {destroy:()=>{unsubscribe();viewer?.destroy();window.removeEventListener('beforeunload',beforeUnload);root.remove();}};
}
