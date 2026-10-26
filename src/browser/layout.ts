import ELK from 'elkjs/lib/elk.bundled.js';
import type {ElkNode} from 'elkjs/lib/elk-api.js';
import type {RenderDocument} from '../model.ts';
import type {LayoutScene,ViewMeasurements} from './geometry.ts';

const elk=new ELK();
export async function layoutCandidates(doc:RenderDocument,viewId:string,measurements:ViewMeasurements):Promise<LayoutScene[]> {
  const view=doc.views[viewId],result:LayoutScene[]=[];
  if(view.type!=='architecture')throw new Error('Flowchart rendering is not yet available');
  const directGroup=new Map(view.groups.flatMap(g=>g.nodeIds.map(id=>[id,g.id] as const)));
  for(const direction of ['RIGHT','DOWN'])for(const spacing of [34,48]){
    const children=(parent?:string):ElkNode[]=>[
      ...view.nodeIds.filter(id=>directGroup.get(id)===parent).map(id=>({id:'n-'+id,...measurements.nodes[id]})),
      ...view.groups.filter(g=>g.parentId===parent).map(group=>({id:'g-'+group.id,children:children(group.id),layoutOptions:{'elk.direction':direction,'elk.padding':`[top=${measurements.groupLabels[group.id].height+32},left=20,bottom=20,right=20]`,'elk.nodeSize.constraints':'MINIMUM_SIZE','elk.nodeSize.minimum':`(${Math.ceil(measurements.groupLabels[group.id].width+40)},0)`}})),
    ];
    const graph:ElkNode={id:'root',layoutOptions:{'elk.algorithm':'layered','elk.direction':direction,'elk.edgeRouting':'ORTHOGONAL','elk.hierarchyHandling':'INCLUDE_CHILDREN','elk.spacing.nodeNode':String(spacing),'elk.layered.spacing.nodeNodeBetweenLayers':String(spacing+12),'elk.spacing.edgeNode':'18','elk.spacing.edgeEdge':'14','elk.padding':'[top=24,left=24,bottom=24,right=24]','elk.layered.nodePlacement.favorStraightEdges':'true','elk.randomSeed':'7'},children:children(),edges:view.edges.map(edge=>({id:edge.id,sources:['n-'+edge.source],targets:['n-'+edge.target],labels:edge.label?[{text:edge.label,...measurements.edgeLabels[edge.id]}]:[]}))};
    const layout=view.nodeIds.length||view.groups.length?await elk.layout(graph):graph;
    const scene:LayoutScene={nodes:[],groups:[],edges:[]},positions=new Map([['root',{x:0,y:0}]]);
    const visit=(parent:ElkNode,x=0,y=0):void=>{
      for(const child of parent.children??[]){
        const box={x:x+(child.x??0),y:y+(child.y??0),width:child.width??0,height:child.height??0};positions.set(child.id,box);
        if(child.id.startsWith('g-')){
          const group=view.groups.find(g=>'g-'+g.id===child.id)!;
          scene.groups.push({...box,id:group.id,parentId:group.parentId,header:{x:box.x+20,y:box.y+16,...measurements.groupLabels[group.id]}});
        } else {const id=child.id.slice(2);scene.nodes.push({...box,id,groupId:directGroup.get(id)});}
        visit(child,box.x,box.y);
      }
    };visit(layout);
    const visitEdges=(parent:ElkNode):void=>{
      for(const edge of parent.edges??[]){
        const meta=view.edges.find(e=>e.id===edge.id)!,offset=positions.get(edge.container??parent.id)??{x:0,y:0};
        scene.edges.push({id:edge.id,source:meta.source,target:meta.target,kind:meta.kind,
          paths:(edge.sections??[]).map(s=>[s.startPoint,...(s.bendPoints??[]),s.endPoint].map(p=>({x:p.x+offset.x,y:p.y+offset.y}))),
          labels:(edge.labels??[]).map(l=>({x:(l.x??0)+offset.x,y:(l.y??0)+offset.y,width:l.width??0,height:l.height??0,text:meta.label??'',lines:measurements.edgeLabels[edge.id].lines}))});
      }
      for(const child of parent.children??[])visitEdges(child);
    };visitEdges(layout);result.push(scene);
  }
  return result;
}
