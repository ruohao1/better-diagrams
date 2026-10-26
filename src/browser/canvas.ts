import type {CompiledView} from './compiler.ts';

export type Camera={x:number;y:number;scale:number};
export function mountCanvas(host:HTMLElement,view:CompiledView,options:{onNode(nodeId:string):void;onExport():void;initialCamera?:Camera}):{getCamera():Camera;focus(nodeId?:string):void;destroy():void} {
  const root=document.createElement('div');root.className='bd-canvas';root.tabIndex=0;root.setAttribute('aria-label','Diagram canvas');
  const svgHost=document.createElement('div');svgHost.className='bd-svg-host';svgHost.style.cssText='width:100%;height:100%';const shadow=svgHost.attachShadow({mode:'open'});shadow.append(view.svg);root.append(svgHost);
  const menu=document.createElement('div');menu.className='bd-controls';
  const toggle=document.createElement('button');toggle.type='button';toggle.className='bd-button bd-controls-toggle';toggle.textContent='⋯';toggle.setAttribute('aria-label','Diagram controls');toggle.setAttribute('aria-expanded','false');
  const actions=document.createElement('div');actions.className='bd-canvas-actions';menu.append(toggle,actions);root.append(menu);host.append(root);
  const events=new AbortController(),signal=events.signal;
  const size=()=>{const b=root.getBoundingClientRect();return {width:Math.max(1,b.width),height:Math.max(1,b.height)};};
  const initial=(fit=false):Camera=>{
    const {width,height}=size(),b=view.bounds,fitScale=Math.min(width/b.width,height/b.height),scale=fit?fitScale:Math.min(1,Math.max(.9,fitScale));
    return {x:b.x-Math.max(0,(width/scale-b.width)/2),y:b.y-Math.max(0,(height/scale-b.height)/2),scale};
  };
  let camera=options.initialCamera?{...options.initialCamera}:initial();
  const apply=()=>{const s=size();view.svg.setAttribute('viewBox',[camera.x,camera.y,s.width/camera.scale,s.height/camera.scale].join(' '));};
  const zoom=(factor:number,x=size().width/2,y=size().height/2)=>{
    const wx=camera.x+x/camera.scale,wy=camera.y+y/camera.scale,scale=Math.max(.02,Math.min(8,camera.scale*factor));camera={x:wx-x/scale,y:wy-y/scale,scale};apply();
  };
  const button=(label:string,action:()=>void)=>{const b=document.createElement('button');b.type='button';b.className='bd-button';b.textContent=label;b.addEventListener('click',action,{signal});actions.append(b);};
  button('Zoom out',()=>zoom(1/1.2));button('Zoom in',()=>zoom(1.2));button('Fit',()=>{camera=initial(true);apply();});button('Readable',()=>{camera=initial();apply();});button('Export SVG',options.onExport);
  toggle.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));menu.classList.toggle('bd-controls-open',open);},{signal});
  let drag:{id:number;x:number;y:number;camera:Camera;moved:boolean}|undefined,suppressClick=false;
  view.svg.addEventListener('pointerdown',event=>{
    if(event.button!==0 || !event.isPrimary)return;suppressClick=false;drag={id:event.pointerId,x:event.clientX,y:event.clientY,camera:{...camera},moved:false};
  },{signal});
  view.svg.addEventListener('pointermove',event=>{
    if(!drag || event.pointerId!==drag.id)return;
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
    if(!drag.moved && Math.hypot(dx,dy)<4)return;
    if(!drag.moved){drag.moved=true;view.svg.setPointerCapture(event.pointerId);}
    camera={x:drag.camera.x-dx/drag.camera.scale,y:drag.camera.y-dy/drag.camera.scale,scale:drag.camera.scale};apply();event.preventDefault();
  },{signal});
  view.svg.addEventListener('pointerup',event=>{if(!drag || drag.id!==event.pointerId)return;suppressClick=drag.moved;drag=undefined;if(view.svg.hasPointerCapture(event.pointerId))view.svg.releasePointerCapture(event.pointerId);},{signal});
  view.svg.addEventListener('pointercancel',()=>{drag=undefined;suppressClick=false;},{signal});
  view.svg.addEventListener('lostpointercapture',()=>{drag=undefined;},{signal});
  const activate=(event:Event)=>{const node=event.target instanceof Element?event.target.closest<SVGGElement>('[data-node-id]'):null;if(node?.dataset.nodeId)options.onNode(node.dataset.nodeId);};
  view.svg.addEventListener('click',event=>{if(suppressClick){suppressClick=false;event.preventDefault();event.stopPropagation();return;}activate(event);},{signal});
  view.svg.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();activate(event);}},{signal});
  view.svg.addEventListener('wheel',event=>{event.preventDefault();const b=root.getBoundingClientRect();zoom(event.deltaY>0?1/1.1:1.1,event.clientX-b.x,event.clientY-b.y);},{signal,passive:false});
  root.addEventListener('keydown',event=>{
    if(event.target!==root)return;const delta:Record<string,[number,number]>={ArrowLeft:[-40,0],ArrowRight:[40,0],ArrowUp:[0,-40],ArrowDown:[0,40]};
    const direction=delta[event.key];if(direction){event.preventDefault();camera.x+=direction[0]/camera.scale;camera.y+=direction[1]/camera.scale;apply();}
  },{signal});
  const observer=new ResizeObserver(apply);observer.observe(root);apply();
  return {getCamera:()=>({...camera}),focus:(id?:string)=>{
    const node=id?[...view.svg.querySelectorAll<SVGGElement>('[data-node-id]')].find(n=>n.dataset.nodeId===id):undefined;(node??root).focus({preventScroll:true});
  },destroy:()=>{events.abort();observer.disconnect();root.remove();}};
}
