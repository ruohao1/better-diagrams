import {compact,inflate,intersects,pathLength,segmentHits,segments} from './geometry.ts';
import type {LayoutScene,Point,Rect,RouteMetrics,SceneEdge,SceneLabel,Segment} from './geometry.ts';

function allowedGroups(scene:LayoutScene,edge:SceneEdge):Set<string> {
  const groups=new Map(scene.groups.map(g=>[g.id,g])),allowed=new Set<string>();
  for(const id of [edge.source,edge.target]){
    let group=scene.nodes.find(n=>n.id===id)?.groupId;
    while(group && !allowed.has(group)){allowed.add(group);group=groups.get(group)?.parentId;}
  }
  return allowed;
}
const sharesEndpoint=(a:SceneEdge,b:SceneEdge):boolean=>[a.source,a.target].some(id=>id===b.source || id===b.target);
function crossing([a,b]:Segment,[c,d]:Segment):boolean {
  if((a.y===b.y)===(c.y===d.y))return false;
  const [h1,h2,v1,v2]=a.y===b.y?[a,b,c,d]:[c,d,a,b];
  return v1.x>Math.min(h1.x,h2.x)+.01 && v1.x<Math.max(h1.x,h2.x)-.01 && h1.y>Math.min(v1.y,v2.y)+.01 && h1.y<Math.max(v1.y,v2.y)-.01;
}
function hides([a,b]:Segment,[c,d]:Segment):boolean {
  if(a.y===b.y && c.y===d.y && Math.abs(a.y-c.y)<.01)return Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x))-Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x))>8;
  if(a.x===b.x && c.x===d.x && Math.abs(a.x-c.x)<.01)return Math.min(Math.max(a.y,b.y),Math.max(c.y,d.y))-Math.max(Math.min(a.y,b.y),Math.min(c.y,d.y))>8;
  return false;
}
export function assessRoutes(scene:LayoutScene):RouteMetrics {
  const metrics:RouteMetrics={overlaps:0,crossings:0,length:0,bends:0};
  for(let i=0;i<scene.nodes.length;i++)for(const other of scene.nodes.slice(i+1))if(intersects(scene.nodes[i],other))metrics.overlaps++;
  const labels=scene.edges.flatMap(edge=>edge.labels);
  for(let i=0;i<labels.length;i++){
    for(const other of labels.slice(i+1))if(intersects(labels[i],other))metrics.overlaps++;
    for(const node of scene.nodes)if(intersects(labels[i],node))metrics.overlaps++;
  }
  for(let i=0;i<scene.edges.length;i++){
    const edge=scene.edges[i],allowed=allowedGroups(scene,edge);
    const obstacles:Rect[]=[...scene.nodes,...scene.groups.filter(g=>!allowed.has(g.id)),...scene.groups.map(g=>g.header)];
    for(const label of edge.labels)for(const box of [...scene.groups.filter(g=>!allowed.has(g.id)),...scene.groups.map(g=>g.header)])if(intersects(label,box))metrics.overlaps++;
    const parts=edge.paths.flatMap(segments);
    for(const path of edge.paths){metrics.length+=pathLength(path);metrics.bends+=Math.max(0,compact(path).length-2);}
    for(const part of parts){
      for(const box of obstacles)if(segmentHits(part,box))metrics.overlaps++;
      for(const label of labels)if(segmentHits(part,label))metrics.overlaps++;
    }
    for(const other of scene.edges.slice(i+1))for(const a of parts)for(const b of other.paths.flatMap(segments)){
      if(crossing(a,b))metrics.crossings++;
      if(!sharesEndpoint(edge,other) && hides(a,b))metrics.overlaps++;
    }
  }
  return metrics;
}
export function compareRoutes(a:RouteMetrics,b:RouteMetrics):number {
  for(const key of ['overlaps','crossings','length','bends'] as const)if(a[key]!==b[key])return a[key]-b[key];
  return 0;
}
function ports(box:Rect){
  return [[box.x+box.width,box.y+box.height/2,1,0],[box.x+box.width/2,box.y,0,-1],[box.x,box.y+box.height/2,-1,0],[box.x+box.width/2,box.y+box.height,0,1]].map(([x,y,dx,dy])=>({point:{x,y},stub:{x:x+16*dx,y:y+16*dy},dx,dy}));
}
function placeLabel(points:Point[],label:SceneLabel,obstacles:Rect[],otherSegments:Segment[]):SceneLabel|undefined {
  for(const [a,b] of segments(points).sort((a,b)=>pathLength(b)-pathLength(a))){
    const horizontal=a.y===b.y,span=Math.abs(horizontal?a.x-b.x:a.y-b.y),extent=horizontal?label.width:label.height;
    if(span<extent+16)continue;
    for(const fraction of [.5,.25,.75])for(const side of [1,-1]){
      const along=Math.min(horizontal?a.x:a.y,horizontal?b.x:b.y)+span*fraction-extent/2;
      if(along<Math.min(horizontal?a.x:a.y,horizontal?b.x:b.y)+8 || along+extent>Math.max(horizontal?a.x:a.y,horizontal?b.x:b.y)-8)continue;
      const box=horizontal?{x:along,y:a.y+(side>0?8:-label.height-8),width:label.width,height:label.height}:{x:a.x+(side>0?8:-label.width-8),y:along,width:label.width,height:label.height};
      if(!obstacles.some(o=>intersects(box,o)) && ![...otherSegments,...segments(points)].some(s=>segmentHits(s,inflate(box,2))))return {...label,...box};
    }
  }
}

// shortcut: try at most two turns; retain ELK routes when obstacle navigation needs more.
export function shortenRoutes(scene:LayoutScene):LayoutScene {
  const result=structuredClone(scene),nodeById=new Map(result.nodes.map(n=>[n.id,n]));
  for(const edge of [...result.edges].sort((a,b)=>pathLength(b.paths[0]??[])-pathLength(a.paths[0]??[]))){
    const sourceNode=nodeById.get(edge.source),targetNode=nodeById.get(edge.target);
    if(!sourceNode || !targetNode || edge.source===edge.target || edge.paths.length!==1 || edge.paths[0].length<=4 || edge.labels.length>1)continue;
    const allowed=allowedGroups(result,edge),others=result.edges.filter(e=>e!==edge);
    const obstacles:Rect[]=[...result.nodes.map(n=>inflate(n,n.id===edge.source || n.id===edge.target?0:10)),...result.groups.filter(g=>!allowed.has(g.id)).map(g=>inflate(g,12)),...result.groups.map(g=>inflate(g.header,6)),...others.flatMap(e=>e.labels).map(l=>inflate(l,6))];
    const otherSegments=others.flatMap(e=>e.paths.flatMap(segments)),unrelated=others.filter(e=>!sharesEndpoint(e,edge)).flatMap(e=>e.paths.flatMap(segments));
    const crosses=(points:Point[])=>segments(points).reduce((sum,a)=>sum+otherSegments.filter(b=>crossing(a,b)).length,0);
    const original=edge.paths[0],originalCrossings=crosses(original);
    let best:{points:Point[];label:SceneLabel|undefined;length:number;crossings:number}={points:original,label:edge.labels[0],length:pathLength(original),crossings:originalCrossings};
    const xs=obstacles.flatMap(b=>[b.x,b.x+b.width]),ys=obstacles.flatMap(b=>[b.y,b.y+b.height]),seen=new Set<string>();
    for(const source of ports(sourceNode))for(const target of ports(targetNode)){
      const a=source.stub,b=target.stub;
      const candidates:Point[][]=[[source.point,a,{x:b.x,y:a.y},b,target.point],[source.point,a,{x:a.x,y:b.y},b,target.point]];
      for(const x of new Set([a.x,b.x,(a.x+b.x)/2,...xs]))candidates.push([source.point,a,{x,y:a.y},{x,y:b.y},b,target.point]);
      for(const y of new Set([a.y,b.y,(a.y+b.y)/2,...ys]))candidates.push([source.point,a,{x:a.x,y},{x:b.x,y},b,target.point]);
      for(const candidate of candidates){
        const points=compact(candidate),distance=pathLength(points);
        if(points.length<2 || points.length>4 || points.length>=compact(original).length || distance>=pathLength(original))continue;
        const first=points[0],next=points[1],last=points.at(-1)!,previous=points.at(-2)!;
        if((next.x-first.x)*source.dx+(next.y-first.y)*source.dy<16 || (last.x-previous.x)*target.dx+(last.y-previous.y)*target.dy>-16)continue;
        const key=points.map(p=>p.x+','+p.y).join(';');if(seen.has(key))continue;seen.add(key);
        const parts=segments(points);
        if(parts.some(s=>obstacles.some(box=>segmentHits(s,box))) || parts.some(s=>unrelated.some(o=>hides(s,o))))continue;
        const count=crosses(points);
        if(count>originalCrossings || count>best.crossings || (count===best.crossings && distance>=best.length))continue;
        const label=edge.labels[0]?placeLabel(points,edge.labels[0],obstacles,otherSegments):undefined;
        if(edge.labels[0] && !label)continue;
        best={points,label,length:distance,crossings:count};
      }
    }
    if(best.points!==original){edge.paths=[best.points];edge.labels=best.label?[best.label]:[];}
  }
  return result;
}

