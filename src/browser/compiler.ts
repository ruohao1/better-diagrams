import {normalizeDocument} from '../model.ts';
import type {ConnectionKind,ProjectInput} from '../model.ts';
import defaultTheme from './default-theme.css';
import {scopeId,validateTheme} from './templates.ts';
import {element,prepareNode,textLines,textMetrics,wrapText} from './nodes.ts';
import {layoutCandidates} from './layout.ts';
import {assessRoutes,compareRoutes,shortenRoutes} from './routing.ts';
import type {Rect,ViewMeasurements} from './geometry.ts';

export type Bounds=Rect;
export type CompiledView={viewId:string;svg:SVGSVGElement;bounds:Bounds};
let instance=0;
const connections:Record<ConnectionKind,{name:string;color:string;dash:string}>={
  call:{name:'Call',color:'#687d99',dash:''},data:{name:'Data access',color:'#4e8d80',dash:'3 3'},event:{name:'Event',color:'#9674b7',dash:'8 4'},telemetry:{name:'Telemetry',color:'#9ba6b7',dash:'1 4'},dependency:{name:'Dependency',color:'#7e8496',dash:'4 4'},
  next:{name:'Next step',color:'#5c7395',dash:''},branch:{name:'Branch',color:'#b88062',dash:'6 4'},error:{name:'Error',color:'#ba6873',dash:'6 4'},retry:{name:'Retry',color:'#a581b5',dash:'3 4'},jump:{name:'Jump',color:'#8b7ea4',dash:'8 4'},
};

export async function compileView(input:ProjectInput,viewId:string,host:HTMLElement):Promise<CompiledView> {
  const doc=normalizeDocument(input.document),view=doc.views[viewId];
  if(!view)throw new Error('Missing view: '+viewId);validateTheme(input.themeCss);
  const scope='render-'+(++instance),svg=element('svg',{xmlns:'http://www.w3.org/2000/svg',class:'diagram',role:'group','aria-label':view.title,'data-diagram-type':view.type});
  svg.style.width='100%';svg.style.height='100%';svg.append(element('style',{},defaultTheme+'\n'+input.themeCss));
  const scene=element('g',{'data-scene':''}),graph=element('g',{'data-graph':''});scene.append(graph);svg.append(scene);
  const measure=document.createElement('div');measure.style.cssText='position:absolute;left:-100000px;top:0;visibility:hidden;width:3000px;height:3000px';measure.append(svg);host.append(measure);
  try {
    const nodes=new Map<string,Awaited<ReturnType<typeof prepareNode>>>(),measurements:ViewMeasurements={nodes:{},edgeLabels:{},groupLabels:{}};
    for(const id of view.nodeIds){const prepared=await prepareNode(input,doc,viewId,id,scopeId(scope,id),graph);nodes.set(id,prepared);measurements.nodes[id]=prepared.size;}
    const labelMetrics=new Map<string,Awaited<ReturnType<typeof textMetrics>>>();
    for(const edge of view.edges)if(edge.label){
      const text=element('text',{class:'edge-label'});graph.append(text);const metrics=await textMetrics(text),lines=wrapText(text,edge.label,128);
      textLines(text,lines,0,-metrics.top,metrics.lineHeight);const box=text.getBBox();
      measurements.edgeLabels[edge.id]={width:box.width+14,height:box.height+8,lines};labelMetrics.set(edge.id,metrics);text.remove();
    }
    const headingMetrics=new Map<string,Awaited<ReturnType<typeof textMetrics>>>();
    for(const group of view.groups){
      const text=element('text',{class:'group-label'});graph.append(text);const metrics=await textMetrics(text);text.textContent=group.label;const box=text.getBBox();
      measurements.groupLabels[group.id]={width:box.width,height:box.height};headingMetrics.set(group.id,metrics);text.remove();
    }
    const candidates=await layoutCandidates(doc,viewId,measurements);
    candidates.sort((a,b)=>compareRoutes(assessRoutes(a),assessRoutes(b)));
    const chosen=candidates[0],layout=view.type==='architecture'?shortenRoutes(chosen):chosen;
    const defs=element('defs'),kinds=[...new Set(view.edges.map(e=>e.kind))];svg.prepend(defs);
    for(const kind of kinds){
      const marker=element('marker',{id:scopeId(scope,'arrow',kind),viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:8,markerHeight:8,orient:'auto',markerUnits:'userSpaceOnUse'});
      marker.append(element('path',{class:'arrow','data-kind':kind,d:'M1 1L9 5L1 9z',fill:connections[kind].color}));defs.append(marker);
    }
    for(const group of layout.groups){
      const meta=view.groups.find(g=>g.id===group.id)!,wrapper=element('g',{'data-group-id':group.id});
      wrapper.append(element('rect',{class:'group-body',x:group.x,y:group.y,width:group.width,height:group.height,rx:14,...(group.parentId?{'stroke-dasharray':'4 4'}:{})}),element('text',{class:'group-label',x:group.header.x,y:group.header.y-headingMetrics.get(group.id)!.top},meta.label));graph.append(wrapper);
    }
    for(const edge of layout.edges){
      const token=connections[edge.kind],wrapper=element('g',{'data-edge-id':edge.id,'data-edge-kind':edge.kind});
      for(const points of edge.paths)wrapper.append(element('path',{class:'edge-path',d:points.map((p,i)=>(i?'L':'M')+p.x+' '+p.y).join(' '),stroke:token.color,'stroke-dasharray':token.dash,'marker-end':'url(#'+scopeId(scope,'arrow',edge.kind)+')'}));
      for(const label of edge.labels){
        const text=element('text',{class:'edge-label'}),metrics=labelMetrics.get(edge.id)!;
        wrapper.append(element('rect',{class:'edge-label-background',x:label.x,y:label.y,width:label.width,height:label.height,rx:4}),text);
        textLines(text,label.lines,label.x+7,label.y+4-metrics.top,metrics.lineHeight);
      }
      graph.append(wrapper);
    }
    for(const node of layout.nodes){
      const data=nodes.get(node.id)!,pad=view.legacySizing?8:0;
      const wrapper=element('g',{'data-node-id':node.id,transform:`translate(${node.x+pad-data.bounds.x} ${node.y+pad-data.bounds.y})`,role:'button',tabindex:0,'aria-label':doc.nodes[node.id].label,'aria-pressed':'false'});
      wrapper.append(data.svg,element('title',{},doc.nodes[node.id].label+(doc.nodes[node.id].childViewId?' · Has an internal view':'')));graph.append(wrapper);
    }
    if(view.legend){
      const legend=element('g',{'data-legend':''});scene.prepend(legend);
      legend.append(element('text',{class:'legend-title',x:24,y:28},view.title),element('text',{class:'legend-level',x:24,y:50},view.detailLevel));
      let x=24;
      for(const kind of kinds){
        const token=connections[kind],key=element('text',{class:'legend-key',x:x+36,y:78},token.name);
        legend.append(element('path',{d:`M${x} 74h27`,fill:'none',stroke:token.color,'stroke-width':1.5,'stroke-dasharray':token.dash,'marker-end':'url(#'+scopeId(scope,'arrow',kind)+')'}),key);x+=key.getBBox().width+64;
      }
      if(view.nodeIds.some(id=>doc.nodes[id].childViewId))legend.append(element('text',{class:'legend-key',x,y:78},'↗ Internal view'));
      graph.setAttribute('transform','translate(0 '+(legend.getBBox().y+legend.getBBox().height+32)+')');
    }
    const box=scene.getBBox(),bounds={x:box.x-28,y:box.y-28,width:Math.max(120,box.width+56),height:Math.max(96,box.height+56)};
    svg.setAttribute('viewBox',[bounds.x,bounds.y,bounds.width,bounds.height].join(' '));
    svg.insertBefore(element('rect',{class:'canvas-background',...bounds}),scene);svg.remove();return {viewId,svg,bounds};
  } finally {measure.remove();}
}

export function exportSvg(view:CompiledView):string {
  const svg=view.svg.cloneNode(true) as SVGSVGElement;
  svg.setAttribute('viewBox',[view.bounds.x,view.bounds.y,view.bounds.width,view.bounds.height].join(' '));
  svg.setAttribute('width',String(Math.ceil(view.bounds.width)));svg.setAttribute('height',String(Math.ceil(view.bounds.height)));svg.removeAttribute('style');
  for(const node of svg.querySelectorAll('[tabindex]'))node.removeAttribute('tabindex');
  for(const node of svg.querySelectorAll('[aria-pressed]'))node.removeAttribute('aria-pressed');
  return '<?xml version="1.0" encoding="UTF-8"?>\n'+new XMLSerializer().serializeToString(svg);
}
