import type {DiagramDocument,DiagramEdgeV1} from '../model.ts';

export function repairMainPath(path:readonly string[],edges:readonly DiagramEdgeV1[]):string[] {
  const byId=new Map(edges.map(edge=>[edge.id,edge]));let best:string[]=[],run:string[]=[],target:string|undefined;
  const finish=()=>{if(run.length>best.length)best=[...run];run=[];target=undefined;};
  for(const id of path){
    const edge=byId.get(id);if(!edge){finish();continue;}
    if(run.length && edge.source!==target)finish();run.push(id);target=edge.target;
  }
  finish();return best;
}
export function removeConnectionFromView(document:DiagramDocument,viewId:string,edgeId:string):void {
  if(!Object.hasOwn(document.views,viewId))throw new Error('Missing view: '+viewId);
  if(document.version===1){const view=document.views[viewId];view.edges=view.edges.filter(e=>e.id!==edgeId);}
  else {const view=document.views[viewId];if(view.type==='flowchart'){view.edges=view.edges.filter(e=>e.id!==edgeId);view.mainPath=repairMainPath(view.mainPath,view.edges);}else view.edges=view.edges.filter(e=>e.id!==edgeId);}
}
export function removeNodeFromView(document:DiagramDocument,viewId:string,nodeId:string):void {
  if(!Object.hasOwn(document.views,viewId))throw new Error('Missing view: '+viewId);
  const view=document.views[viewId];view.nodeIds=view.nodeIds.filter(id=>id!==nodeId);for(const group of view.groups??[])group.nodeIds=group.nodeIds.filter(id=>id!==nodeId);
  if(document.version===1){const current=document.views[viewId];current.edges=current.edges.filter(e=>e.source!==nodeId && e.target!==nodeId);}
  else {const current=document.views[viewId];if(current.type==='flowchart'){
    current.edges=current.edges.filter(e=>e.source!==nodeId && e.target!==nodeId);current.mainPath=repairMainPath(current.mainPath,current.edges);delete current.stepKinds[nodeId];
  }else current.edges=current.edges.filter(e=>e.source!==nodeId && e.target!==nodeId);}
}
