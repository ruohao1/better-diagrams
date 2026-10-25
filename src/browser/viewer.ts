import type { ProjectInput } from '../model.ts';
import { compileView, exportSvg } from './compiler.ts';
import type { CompiledView } from './compiler.ts';

export type ViewerHandle = { update(input:ProjectInput):Promise<void>;currentViewId():string;destroy():void };
const css = `
.bd-app{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#1c2d46;background:#f6f7fa;min-height:100vh;box-sizing:border-box;padding:28px 32px}
.bd-app *{box-sizing:border-box}.bd-brand{font-size:11px;letter-spacing:2px;font-weight:750;color:#516680;margin-bottom:14px}.bd-title{font-size:28px;letter-spacing:-.7px;margin:0 0 8px;line-height:1.2}.bd-purpose{max-width:900px;color:#52647a;line-height:1.6;margin:0 0 8px;font-size:14px}.bd-audience{font-size:12px;color:#718298;margin:0 0 22px}.bd-nav{display:flex;gap:8px;align-items:center;flex-wrap:wrap;min-height:32px}.bd-button{font:inherit;font-size:12px;font-weight:550;color:#334b68;background:#fff;border:1px solid #d6dfea;border-radius:7px;padding:8px 12px;cursor:pointer}.bd-button:hover{background:#eff4fb;border-color:#9eb4cf}.bd-button:focus-visible{outline:3px solid #93b5f4;outline-offset:2px}.bd-button:disabled{opacity:.5;cursor:default}.bd-toolbar{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:16px 0 12px}.bd-actions{display:flex;gap:6px}.bd-level{font-size:11px;font-weight:600;color:#45648c;background:#e9eff9;border:1px solid #d7e2f2;padding:6px 10px;border-radius:999px}.bd-workspace{display:grid;grid-template-columns:minmax(0,1fr);gap:16px}.bd-workspace:has(.bd-details:not([hidden])){grid-template-columns:minmax(0,1fr) 320px}.bd-canvas{height:max(460px,calc(100vh - 250px));border:1px solid #dbe2eb;border-radius:14px;overflow:hidden;background:#f8f9fb;min-width:0}.bd-details{background:white;border:1px solid #dbe2eb;border-radius:14px;padding:24px;overflow:auto;max-height:calc(100vh - 250px)}.bd-details h2{font-size:18px;line-height:1.4;margin:16px 0 12px;letter-spacing:-.3px}.bd-description{font-size:14px;line-height:1.7;white-space:pre-wrap;color:#4d6077}.bd-details a{font-size:12px;color:#245dae;overflow-wrap:anywhere;line-height:1.8}.bd-detail-footer{margin-top:24px;padding-top:20px;border-top:1px solid #e8edf4}.bd-note{font-size:11px;text-transform:uppercase;letter-spacing:1.4px;color:#7c8ba0;margin:24px 0 8px}.bd-error{color:#9b2838;background:#fff0f2;border:1px solid #f1c5cc;padding:12px;border-radius:8px;font-size:13px;white-space:pre-wrap}.bd-empty{font-size:14px;color:#6a7c92}.bd-app [hidden]{display:none!important}
@media(max-width:850px){.bd-app{padding:20px 16px}.bd-workspace:has(.bd-details:not([hidden])){grid-template-columns:1fr}.bd-details{max-height:none}.bd-canvas{height:480px}.bd-title{font-size:24px}}
`;

function ui<K extends keyof HTMLElementTagNameMap>(tag:K,className:string,text?:string):HTMLElementTagNameMap[K] {
  const el=document.createElement(tag);el.className=className;if(text!==undefined)el.textContent=text;return el;
}

export async function mountViewer(host:HTMLElement,input:ProjectInput,options:{initialViewId?:string;renderDetails?:(host:HTMLElement,nodeId:string)=>void;onViewChange?:(viewId:string)=>void}={}):Promise<ViewerHandle> {
  const style=ui('style','');style.textContent=css;
  const app=ui('section','bd-app');
  const title=ui('h1','bd-title'),purpose=ui('p','bd-purpose'),audience=ui('p','bd-audience');
  app.append(ui('div','bd-brand','BETTER DIAGRAMS'),title,purpose,audience);
  const nav=ui('nav','bd-nav');nav.setAttribute('aria-label','Diagram views');
  const toolbar=ui('div','bd-toolbar'),level=ui('span','bd-level'),actions=ui('div','bd-actions');
  toolbar.append(level,actions);
  const workspace=ui('div','bd-workspace'),canvasHost=ui('div','bd-canvas'),details=ui('aside','bd-details');details.hidden=true;
  const shadow=canvasHost.attachShadow({mode:'open'}),canvas=ui('div','');canvas.style.cssText='width:100%;height:100%;position:relative';shadow.append(canvas);
  workspace.append(canvasHost,details);
  const error=ui('p','bd-error');error.hidden=true;error.setAttribute('role','alert');
  app.append(nav,toolbar,error,workspace);host.append(style,app);
  let project=input, path=[options.initialViewId ?? input.document.rootViewId],selected:string|undefined,compiled:CompiledView|undefined,generation=0,destroyed=false;
  const showError=(reason:unknown)=>{error.textContent=reason instanceof Error?reason.message:String(reason);error.hidden=false;};
  function button(label:string,action:()=>unknown):HTMLButtonElement {
    const el=ui('button','bd-button',label);el.type='button';el.onclick=()=>{try{Promise.resolve(action()).catch(showError);}catch(reason){showError(reason);}};return el;
  }
  function zoom(factor:number):void {
    if(!compiled)return;const v=compiled.svg.viewBox.baseVal;
    const width=v.width*factor,height=v.height*factor;
    if(width<compiled.bounds.width/10 || width>compiled.bounds.width*10)return;
    compiled.svg.setAttribute('viewBox',[v.x+(v.width-width)/2,v.y+(v.height-height)/2,width,height].join(' '));
  }
  actions.append(button('Fit',()=>{if(compiled)compiled.svg.setAttribute('viewBox',Object.values(compiled.bounds).join(' '));}),button('Zoom out',()=>zoom(1.25)),button('Zoom in',()=>zoom(.8)),button('Export SVG',()=>{
    if(!compiled)return;const url=URL.createObjectURL(new Blob([exportSvg(compiled)],{type:'image/svg+xml'}));
    const a=document.createElement('a');a.href=url;a.download=compiled.viewId+'.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }));
  function renderDetails():void {
    details.replaceChildren();details.hidden=!selected;
    for(const node of compiled?.svg.querySelectorAll('[data-node-id]') ?? [])node.setAttribute('aria-pressed',String(node.getAttribute('data-node-id')===selected));
    if(!selected)return;
    const node=project.document.nodes[selected];if(!node){selected=undefined;details.hidden=true;return;}
    details.append(button('Close details',()=>{selected=undefined;renderDetails();}));
    const content=ui('div','');details.append(content);
    if(options.renderDetails)options.renderDetails(content,selected);
    else {
      content.append(ui('h2','',node.label),ui('p','bd-description',node.details || 'No details have been provided.'));
      if(node.references?.length){content.append(ui('p','bd-note','Source references'));const list=ui('div','');
        for(const ref of node.references){const row=ui('div','');const text=ref.path+(ref.line?':'+ref.line:'');
          if(ref.url){const link=ui('a','',text);link.href=ref.url;link.target='_blank';link.rel='noopener noreferrer';row.append(link);}else row.textContent=text;list.append(row);
        }content.append(list);
      }
    }
    if(node.childViewId){const footer=ui('div','bd-detail-footer');footer.append(button('Explore internals',async()=>{path.push(node.childViewId!);selected=undefined;await render(project);}));details.append(footer);}
  }
  async function render(next:ProjectInput):Promise<void> {
    const version=++generation;
    const nextPath=path.filter(id=>Object.hasOwn(next.document.views,id));
    if(!nextPath.length)nextPath.push(next.document.rootViewId);
    try {
      const result=await compileView(next,nextPath.at(-1)!,canvas);
      if(destroyed || version!==generation)return;
      project=next;path=nextPath;compiled=result;error.hidden=true;
      title.textContent=next.document.title;purpose.textContent=next.document.purpose;audience.textContent='For '+next.document.audience;
      level.textContent=next.document.views[result.viewId].detailLevel;
      nav.replaceChildren(...path.map((id,index)=>button(next.document.views[id].title,async()=>{path=path.slice(0,index+1);selected=undefined;await render(project);})));
      canvas.replaceChildren(result.svg);
      if(selected && !next.document.views[result.viewId].nodeIds.includes(selected))selected=undefined;
      const activate=(event:Event)=>{
        const node=event.target instanceof Element?event.target.closest<SVGGElement>('[data-node-id]'):null;
        if(node){selected=node.dataset.nodeId;renderDetails();}
      };
      result.svg.addEventListener('click',activate);
      result.svg.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();activate(event);}});
      result.svg.addEventListener('wheel',event=>{event.preventDefault();zoom(event.deltaY>0?1.1:1/1.1);},{passive:false});
      let drag:{x:number;y:number;view:number[]}|undefined;
      result.svg.addEventListener('pointerdown',event=>{if((event.target as Element).closest('[data-node-id]'))return;const v=result.svg.viewBox.baseVal;drag={x:event.clientX,y:event.clientY,view:[v.x,v.y,v.width,v.height]};result.svg.setPointerCapture(event.pointerId);});
      result.svg.addEventListener('pointermove',event=>{if(!drag)return;const rect=result.svg.getBoundingClientRect(),scale=Math.max(drag.view[2]/rect.width,drag.view[3]/rect.height);result.svg.setAttribute('viewBox',[drag.view[0]-(event.clientX-drag.x)*scale,drag.view[1]-(event.clientY-drag.y)*scale,drag.view[2],drag.view[3]].join(' '));});
      result.svg.addEventListener('pointerup',()=>{drag=undefined;});result.svg.addEventListener('pointercancel',()=>{drag=undefined;});
      renderDetails();
      options.onViewChange?.(result.viewId);
    } catch(reason){if(version===generation)showError(reason);throw reason;}
  }
  await render(input);
  return {update:render,currentViewId:()=>path.at(-1)!,destroy:()=>{destroyed=true;generation++;style.remove();app.remove();}};
}
