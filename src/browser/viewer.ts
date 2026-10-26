import type {ProjectInput} from '../model.ts';
import {compileView,exportSvg} from './compiler.ts';
import type {CompiledView} from './compiler.ts';
import {mountCanvas} from './canvas.ts';
import type {Camera} from './canvas.ts';

export type ViewerHandle={update(input:ProjectInput):Promise<void>;currentViewId():string;destroy():void};
type Context={mode:'diagram';viewId:string;viaNodeId:string;camera?:Camera}|{mode:'details';viewId:string;nodeId:string};
type CanvasHandle=ReturnType<typeof mountCanvas>;
let viewerInstance=0;
const css=`
.bd-viewer{height:100dvh;display:flex;flex-direction:column;min-width:0;min-height:0;background:#f8f9fb;color:#243b57;font-family:ui-sans-serif,system-ui,sans-serif}.bd-viewer *{box-sizing:border-box}.bd-root-frame{display:flex;flex-direction:column;flex:1;min-height:0;min-width:0}.bd-canvas-host{flex:1;min-height:0;min-width:0;position:relative}.bd-canvas{height:100%;width:100%;position:relative;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none;outline:none}.bd-canvas:focus-visible{box-shadow:inset 0 0 0 2px #88a9df}.bd-svg-host>svg{display:block}.bd-controls{position:absolute;right:14px;top:14px;display:flex;gap:5px;padding:5px;border:1px solid #dce4ed;border-radius:10px;background:#ffffffee;opacity:0;pointer-events:none;transition:opacity .12s}.bd-canvas:hover>.bd-controls,.bd-canvas:focus-within>.bd-controls,.bd-controls-open{opacity:1;pointer-events:auto}.bd-canvas-actions{display:flex;gap:4px;flex-wrap:wrap}.bd-controls-toggle{font-size:20px!important;line-height:16px}.bd-button{font:inherit;font-size:12px;color:#334b68;background:#fff;border:1px solid #d6dfea;border-radius:7px;padding:8px 10px;cursor:pointer}.bd-button:hover{background:#eef4fc}.bd-button:focus-visible{outline:3px solid #93b5f4;outline-offset:2px}.bd-button:disabled{opacity:.5;cursor:default}.bd-modal{width:min(1100px,calc(100vw - 40px));height:min(800px,calc(100dvh - 40px));max-width:none;max-height:none;padding:0;border:1px solid #ced9e7;border-radius:14px;color:inherit;background:#f8f9fb;overflow:hidden}.bd-modal[open]{display:flex;flex-direction:column}.bd-modal::backdrop{background:#172b4659}.bd-modal-header{display:flex;align-items:center;gap:8px;padding:12px 16px;background:white;border-bottom:1px solid #e0e6ef;flex-shrink:0}.bd-modal-title{flex:1;font-size:14px;font-weight:600}.bd-modal-content{display:flex;flex-direction:column;flex:1;min-height:0;min-width:0}.bd-details{overflow:auto;flex:1;padding:24px;background:#fff;user-select:text;-webkit-user-select:text}.bd-details h2{font-size:20px;line-height:1.4;margin:0 0 14px}.bd-summary,.bd-description{font-size:14px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere}.bd-summary{color:#425a77}.bd-description{color:#52647a}.bd-details a{font-size:12px;color:#245dae;overflow-wrap:anywhere}.bd-detail-footer{margin-top:24px;padding-top:18px;border-top:1px solid #e0e6ef}.bd-error{margin:0;padding:12px 16px;color:#9b2838;background:#fff0f2;white-space:pre-wrap;font-size:13px}.bd-viewer [hidden]{display:none!important}
@media(max-width:600px){.bd-modal{width:calc(100vw - 16px);height:calc(100dvh - 16px);border-radius:10px}.bd-modal-header{padding:10px}.bd-details{padding:18px}.bd-controls{right:8px;top:8px;max-width:calc(100% - 16px)}.bd-canvas-actions{max-width:245px}}
@media(hover:none){.bd-controls{opacity:1;pointer-events:auto}.bd-controls:not(.bd-controls-open) .bd-canvas-actions{display:none}}
`;
function ui<K extends keyof HTMLElementTagNameMap>(tag:K,className='',text?:string):HTMLElementTagNameMap[K]{const el=document.createElement(tag);el.className=className;if(text!==undefined)el.textContent=text;return el;}

export async function mountViewer(host:HTMLElement,input:ProjectInput,options:{initialViewId?:string;renderDetails?:(host:HTMLElement,nodeId:string,viewId:string)=>void;onViewChange?:(viewId:string)=>void;renderAuthoringControls?:(host:HTMLElement,viewId:string,mode:'diagram'|'details')=>void}={}):Promise<ViewerHandle> {
  const scope='viewer-'+(++viewerInstance),style=ui('style');style.textContent=css;
  const app=ui('section','bd-viewer'),rootFrame=ui('div','bd-root-frame'),rootControls=ui('div','bd-authoring-controls'),rootCanvas=ui('div','bd-canvas-host');
  rootControls.dataset.frameKey=scope+'-root';rootFrame.append(rootControls,rootCanvas);
  const error=ui('p','bd-error');error.hidden=true;error.setAttribute('role','alert');
  const modal=ui('dialog','bd-modal'),header=ui('header','bd-modal-header'),title=ui('span','bd-modal-title');title.id=scope+'-modal-title';modal.setAttribute('aria-labelledby',title.id);
  const content=ui('div','bd-modal-content'),modalError=ui('p','bd-error');modalError.hidden=true;modalError.setAttribute('role','alert');
  const staging=ui('div');staging.style.cssText='position:absolute;left:-100000px;visibility:hidden';const stage=ui('div');staging.attachShadow({mode:'open'}).append(stage);
  modal.append(header,modalError,content);app.append(error,rootFrame,modal,staging);host.append(style,app);
  let project=input,rootId=options.initialViewId??input.document.rootViewId,history:Context[]=[],cache=new Map<string,Promise<CompiledView>>(),rootHandle:CanvasHandle|undefined,modalHandle:CanvasHandle|undefined,rootNode:string|undefined,destroyed=false,generation=0;
  let queue=Promise.resolve();
  const enqueue=(work:()=>Promise<void>):Promise<void>=>{const result=queue.then(async()=>{if(!destroyed)await work();});queue=result.catch(()=>{});return result;};
  const currentView=()=>history.at(-1)?.viewId??rootId;
  const showError=(reason:unknown)=>{for(const el of [error,modalError])el.textContent=reason instanceof Error?reason.message:String(reason);error.hidden=modal.open;modalError.hidden=!modal.open;};
  const clearError=()=>{error.hidden=true;modalError.hidden=true;};
  const button=(label:string,action:()=>Promise<void>|void)=>{const b=ui('button','bd-button',label);b.type='button';b.onclick=()=>{void enqueue(async()=>{await action();}).catch(showError);};return b;};
  const load=(next:ProjectInput,id:string,map:Map<string,Promise<CompiledView>>):Promise<CompiledView>=>{let result=map.get(id);if(!result){result=compileView(next,id,stage);map.set(id,result);}return result;};
  const download=async(id=currentView())=>{const view=await load(project,id,cache),url=URL.createObjectURL(new Blob([exportSvg(view)],{type:'image/svg+xml'})),a=ui('a');a.href=url;a.download=id+'.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  const capture=()=>{const entry=history.at(-1);if(entry?.mode==='diagram' && modalHandle)entry.camera=modalHandle.getCamera();};
  const notify=()=>options.onViewChange?.(currentView());
  const back=button('Back',async()=>{await navigate(history.slice(0,-1));});
  const exportButton=button('Export SVG',()=>download());
  const close=button('Close',()=>closeModal());header.append(back,title,exportButton,close);
  function closeModal():void {
    capture();history=[];modalHandle?.destroy();modalHandle=undefined;content.replaceChildren();if(modal.open)modal.close();rootFrame.inert=false;rootFrame.removeAttribute('aria-hidden');
    if(!modalError.hidden){error.hidden=false;modalError.hidden=true;}notify();rootHandle?.focus(rootNode);
  }
  modal.addEventListener('cancel',event=>{event.preventDefault();void enqueue(async()=>closeModal()).catch(showError);});
  modal.addEventListener('click',event=>{if(event.target!==modal)return;const b=modal.getBoundingClientRect();if(event.clientX<b.left || event.clientX>b.right || event.clientY<b.top || event.clientY>b.bottom)void enqueue(async()=>closeModal()).catch(showError);});
  const focusState=()=>{const el=document.activeElement;return content.contains(el) && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)?{id:el.id,start:el.selectionStart,end:el.selectionEnd}:undefined;};
  const restore=(state:ReturnType<typeof focusState>)=>{if(!state?.id)return;const el=document.getElementById(state.id);if(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement){el.focus({preventScroll:true});if(state.start!==null && state.end!==null)el.setSelectionRange(state.start,state.end);}};
  function defaultDetails(parent:HTMLElement,nodeId:string):void {
    const node=project.document.nodes[nodeId];parent.append(ui('h2','',node.label));
    if(project.document.version===2 && project.document.nodes[nodeId].summary)parent.append(ui('p','bd-summary',project.document.nodes[nodeId].summary));
    parent.append(ui('p','bd-description',node.details||'No details have been provided.'));
    for(const ref of node.references??[]){const row=ui('p'),label=ref.path+(ref.line?':'+ref.line:'');if(ref.url){const a=ui('a','',label);a.href=ref.url;a.target='_blank';a.rel='noopener noreferrer';row.append(a);}else row.textContent=label;parent.append(row);}
  }
  async function showModal():Promise<void> {
    const entry=history.at(-1);if(!entry){closeModal();return;}
    const focused=focusState();modalHandle?.destroy();modalHandle=undefined;content.replaceChildren();notify();
    rootFrame.inert=true;rootFrame.setAttribute('aria-hidden','true');if(!error.hidden){error.hidden=true;modalError.hidden=false;}
    back.hidden=history.length<2;exportButton.hidden=entry.mode==='diagram';title.textContent=entry.mode==='details'?project.document.nodes[entry.nodeId].label:project.document.views[entry.viewId].title;
    const controls=ui('div','bd-authoring-controls');controls.dataset.frameKey=scope+'-modal-'+entry.viewId+'-'+(entry.mode==='details'?entry.nodeId:'diagram');content.append(controls);options.renderAuthoringControls?.(controls,entry.viewId,entry.mode);
    if(entry.mode==='details'){
      const details=ui('div','bd-details');details.dataset.frameKey=scope+'-details-'+entry.viewId+'-'+entry.nodeId;content.append(details);
      if(options.renderDetails)options.renderDetails(details,entry.nodeId,entry.viewId);else defaultDetails(details,entry.nodeId);
      const node=project.document.nodes[entry.nodeId];
      if(node.childViewId){const footer=ui('div','bd-detail-footer');footer.append(button('Explore internals',()=>navigate([...history,{mode:'diagram',viewId:node.childViewId!,viaNodeId:entry.nodeId}])));details.append(footer);}
      if(!modal.open)modal.showModal();restore(focused);
    } else {
      const canvasHost=ui('div','bd-canvas-host');content.append(canvasHost);if(!modal.open)modal.showModal();
      modalHandle=mountCanvas(canvasHost,await load(project,entry.viewId,cache),{initialCamera:entry.camera,onNode:id=>{void enqueue(()=>openNode(entry.viewId,id)).catch(showError);},onExport:()=>{void enqueue(()=>download(entry.viewId)).catch(showError);}});
    }
  }
  async function navigate(next:Context[]):Promise<void> {
    capture();const entry=next.at(-1);if(entry)await load(project,entry.viewId,cache);
    history=next;await showModal();
  }
  async function openNode(viewId:string,nodeId:string):Promise<void> {
    if(!project.document.views[viewId]?.nodeIds.includes(nodeId))return;
    if(!history.length)rootNode=nodeId;
    await navigate([...history,{mode:'details',viewId,nodeId}]);
  }
  function trim(next:ProjectInput,nextRoot:string):Context[] {
    const valid:Context[]=[];let viewId=nextRoot;
    for(const entry of history){
      if(entry.mode==='details'){
        if(entry.viewId!==viewId || !next.document.views[viewId]?.nodeIds.includes(entry.nodeId) || !Object.hasOwn(next.document.nodes,entry.nodeId))break;
      } else {
        const previous=valid.at(-1);if(previous?.mode!=='details' || previous.nodeId!==entry.viaNodeId || next.document.nodes[previous.nodeId].childViewId!==entry.viewId || !Object.hasOwn(next.document.views,entry.viewId))break;
        viewId=entry.viewId;
      }
      valid.push(entry);
    }
    return valid;
  }
  function update(next:ProjectInput):Promise<void> {
    const version=++generation;
    return enqueue(async()=>{
      if(version!==generation)return;
      const snapshot=structuredClone(next),nextRoot=options.initialViewId && Object.hasOwn(snapshot.document.views,options.initialViewId)?options.initialViewId:snapshot.document.rootViewId;
      const nextHistory=trim(snapshot,nextRoot),prepared=new Map<string,Promise<CompiledView>>();
      const root=await load(snapshot,nextRoot,prepared),active=nextHistory.at(-1)?.viewId;if(active && active!==nextRoot)await load(snapshot,active,prepared);
      if(version!==generation || destroyed)return;
      capture();const camera=rootId===nextRoot?rootHandle?.getCamera():undefined,focused=focusState(),rootChanged=rootId!==nextRoot;
      project=snapshot;rootId=nextRoot;history=nextHistory;cache=prepared;rootHandle?.destroy();notify();
      rootHandle=mountCanvas(rootCanvas,root,{initialCamera:camera,onNode:id=>{void enqueue(()=>openNode(rootId,id)).catch(showError);},onExport:()=>{void enqueue(()=>download(rootId)).catch(showError);}});
      if(!rootControls.childNodes.length || rootChanged){rootControls.replaceChildren();options.renderAuthoringControls?.(rootControls,rootId,'diagram');}
      if(history.length){await showModal();restore(focused);}else if(modal.open)closeModal();clearError();
    }).catch(reason=>{showError(reason);throw reason;});
  }
  try {await update(input);}catch(error){app.remove();style.remove();throw error;}
  return {update,currentViewId:currentView,destroy:()=>{destroyed=true;generation++;rootHandle?.destroy();modalHandle?.destroy();if(modal.open)modal.close();app.remove();style.remove();}};
}
