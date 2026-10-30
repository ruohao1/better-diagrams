import test from 'node:test';
import assert from 'node:assert/strict';
import {assessRoutes} from '../src/browser/routing.ts';
import type {GeometryFinding,LayoutScene,SceneEdge} from '../src/browser/geometry.ts';

const edge=(id:string,points:number[][]):SceneEdge=>({id,source:id+'-from',target:id+'-to',kind:'call',paths:[points.map(([x,y])=>({x,y}))],labels:[]});
const inspect=(scene:LayoutScene)=>{
  const findings:GeometryFinding[]=[];
  const metrics=assessRoutes(scene,finding=>findings.push(finding));
  assert.deepEqual(metrics,assessRoutes(scene));
  return {metrics,findings};
};

test('reports both owners of overlaps and deduplicates repeated segment hits',()=>{
  const scene:LayoutScene={nodes:[{id:'a',x:0,y:0,width:20,height:20},{id:'b',x:10,y:10,width:20,height:20}],groups:[],edges:[edge('request',[[-10,5],[10,5],[10,15],[40,15]])]};
  scene.edges[0].labels=[{x:25,y:25,width:10,height:10,text:'label',lines:['label']}];
  const {metrics,findings}=inspect(scene);
  assert.ok(metrics.overlaps>findings.length);
  const subjects=findings.map(f=>f.subjects.map(s=>s.kind+':'+s.id).sort().join(','));
  assert.ok(subjects.includes('node:a,node:b'));
  assert.ok(subjects.includes('edge-label:request,node:b'));
  assert.equal(subjects.filter(s=>s==='edge:request,node:a').length,1);
  assert.ok(findings.every(f=>f.severity==='error' && f.message && f.suggestion));
});

test('identifies crossing edges as a warning and retains allowed shared trunks',()=>{
  const scene:LayoutScene={nodes:[],groups:[],edges:[edge('a',[[0,0],[100,0]]),edge('b',[[50,-20],[50,20]])]};
  const {findings}=inspect(scene);
  assert.equal(findings.length,1);
  assert.equal(findings[0].code,'edge-crossing');assert.equal(findings[0].severity,'warning');
  assert.deepEqual(findings[0].subjects,[{kind:'edge',id:'a'},{kind:'edge',id:'b'}]);
  scene.edges[1]=edge('b',[[20,0],[120,0]]);
  assert.equal(inspect(scene).findings[0].severity,'error');
  scene.edges[1].source=scene.edges[0].source;
  assert.deepEqual(inspect(scene).findings,[]);
});

test('permits ancestor boundaries but reports their headers and label owners',()=>{
  const scene:LayoutScene={nodes:[{id:'a-from',groupId:'inside',x:10,y:30,width:20,height:20}],groups:[
    {id:'outer',x:0,y:0,width:100,height:100,header:{x:0,y:0,width:100,height:10}},
    {id:'inside',parentId:'outer',x:5,y:20,width:80,height:70,header:{x:5,y:20,width:80,height:8}},
  ],edges:[edge('a',[[30,40],[120,40]])]};
  assert.deepEqual(inspect(scene).findings,[]);
  scene.edges[0].labels=[{x:50,y:22,width:10,height:6,text:'in header',lines:[]}];
  const finding=inspect(scene).findings.find(f=>f.subjects.some(s=>s.kind==='group-header'))!;
  assert.deepEqual(finding.subjects,[{kind:'edge-label',id:'a',index:0},{kind:'group-header',id:'inside'}]);
});

test('warns on per-path stretch without dividing by zero or treating loops as detours',()=>{
  const scene:LayoutScene={nodes:[],groups:[],edges:[edge('detour',[[0,0],[0,101],[100,101],[100,0]])]};
  let findings=inspect(scene).findings;
  assert.equal(findings.length,1);assert.equal(findings[0].code,'route-stretch');
  assert.equal(findings[0].measured,3.02);assert.equal(findings[0].limit,3);assert.equal(findings[0].severity,'warning');
  scene.edges[0].paths[0]=[{x:0,y:0},{x:0,y:100},{x:100,y:100},{x:100,y:0}];
  assert.deepEqual(inspect(scene).findings,[]);
  scene.edges[0].paths.push([{x:1000,y:1000},{x:1000,y:1101},{x:1100,y:1101},{x:1100,y:1000}]);
  findings=inspect(scene).findings;assert.equal(findings.length,1);assert.equal(findings[0].subjects[0].pathIndex,1);
  scene.edges[0].target=scene.edges[0].source;assert.deepEqual(inspect(scene).findings,[]);
  scene.edges[0]=edge('zero',[[0,0],[50,0],[50,50],[0,50],[0,0]]);assert.deepEqual(inspect(scene).findings,[]);
});

test('warns on small internal segments, excluding endpoint and redundant segments',()=>{
  for(const [length,count] of [[7,1],[8,0],[9,0]]){
    const scene:LayoutScene={nodes:[],groups:[],edges:[edge('jog',[[0,0],[30,0],[30,length],[60,length]])]};
    const findings=inspect(scene).findings;
    assert.equal(findings.length,count);
    if(count){assert.equal(findings[0].code,'short-segment');assert.equal(findings[0].measured,7);assert.equal(findings[0].limit,8);}
  }
  assert.deepEqual(inspect({nodes:[],groups:[],edges:[edge('ends',[[0,0],[2,0],[2,0],[20,0],[20,40],[22,40]])]}).findings,[]);
});
