import type {ProjectInput} from '../model.ts';
import {parseDocument} from '../model.ts';
import {compileView} from './compiler.ts';
import type {GeometryFinding,RouteMetrics} from './geometry.ts';

export type ViewReport={
  viewId:string;status:'passed'|'failed';metrics:RouteMetrics|null;findings:GeometryFinding[];
  error?:{code:'compile-failed';message:string};
};
export type DiagramReport={
  schemaVersion:1;sourceSha256:string;rendererVersion:string;status:'passed'|'failed';
  checks:['geometry','all-declared-views'];views:ViewReport[];
  humanVisualReview:'not-performed';sourceAccuracy:'not-checked';
};

export async function inspectProject(input:ProjectInput,host:HTMLElement,identity:{sourceSha256:string;rendererVersion:string}):Promise<DiagramReport> {
  const viewIds=Object.keys(parseDocument(input.document).views);
  const container=document.createElement('div'),stage=document.createElement('div');
  container.dataset.inspectionHost='';container.style.cssText='position:absolute;left:-100000px;visibility:hidden';
  container.attachShadow({mode:'open'}).append(stage);host.append(container);
  const views:ViewReport[]=[];
  try {
    for(const viewId of viewIds){
      try {
        const compiled=await compileView(input,viewId,stage,{inspect:true});
        const {metrics,findings}=compiled.inspection!;
        views.push({viewId,status:findings.some(f=>f.severity==='error')?'failed':'passed',metrics,findings});
      } catch(error) {
        views.push({viewId,status:'failed',metrics:null,findings:[],error:{code:'compile-failed',message:error instanceof Error?error.message:String(error)}});
      }
    }
    return {schemaVersion:1,...identity,status:views.some(v=>v.status==='failed')?'failed':'passed',checks:['geometry','all-declared-views'],views,humanVisualReview:'not-performed',sourceAccuracy:'not-checked'};
  } finally {container.remove();}
}
