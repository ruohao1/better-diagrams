import type {ConnectionKind} from '../model.ts';

export type Point={x:number;y:number};
export type Size={width:number;height:number};
export type Rect=Point & Size;
export type SceneNode=Rect & {id:string;groupId?:string};
export type SceneGroup=Rect & {id:string;parentId?:string;header:Rect};
export type SceneLabel=Rect & {text:string;lines:string[]};
export type SceneEdge={id:string;source:string;target:string;kind:ConnectionKind;paths:Point[][];labels:SceneLabel[]};
export type LayoutScene={nodes:SceneNode[];groups:SceneGroup[];edges:SceneEdge[]};
export type ViewMeasurements={nodes:Record<string,Size>;edgeLabels:Record<string,Size & {lines:string[]}>;groupLabels:Record<string,Size>};
export type RouteMetrics={overlaps:number;crossings:number;length:number;bends:number};
export type Segment=readonly [Point,Point];

export const inflate=(box:Rect,gap:number):Rect=>({x:box.x-gap,y:box.y-gap,width:box.width+2*gap,height:box.height+2*gap});
export const intersects=(a:Rect,b:Rect):boolean=>a.x+.01<b.x+b.width && a.x+a.width>b.x+.01 && a.y+.01<b.y+b.height && a.y+a.height>b.y+.01;
export const segments=(points:readonly Point[]):Segment[]=>points.slice(1).map((p,i)=>[points[i],p] as const).filter(([a,b])=>a.x!==b.x || a.y!==b.y);
export const pathLength=(points:readonly Point[]):number=>segments(points).reduce((sum,[a,b])=>sum+Math.abs(a.x-b.x)+Math.abs(a.y-b.y),0);

export function segmentHits([a,b]:Segment,box:Rect):boolean {
  return a.x===b.x
    ? a.x>box.x+.01 && a.x<box.x+box.width-.01 && Math.max(a.y,b.y)>box.y+.01 && Math.min(a.y,b.y)<box.y+box.height-.01
    : a.y>box.y+.01 && a.y<box.y+box.height-.01 && Math.max(a.x,b.x)>box.x+.01 && Math.min(a.x,b.x)<box.x+box.width-.01;
}

export function compact(points:readonly Point[]):Point[] {
  const result:Point[]=[];
  for(const point of points){
    const last=result.at(-1);if(last?.x===point.x && last.y===point.y)continue;
    while(result.length>1){
      const a=result.at(-2)!,b=result.at(-1)!;
      if(((a.x===b.x && b.x===point.x)||(a.y===b.y && b.y===point.y)) && (b.x-a.x)*(point.x-b.x)+(b.y-a.y)*(point.y-b.y)>=0)result.pop();else break;
    }
    result.push({...point});
  }
  return result;
}
