import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessRoutes,compareRoutes,shortenRoutes} from '../src/browser/routing.ts';
import type {LayoutScene,SceneEdge} from '../src/browser/geometry.ts';

const dense=():LayoutScene=>JSON.parse(readFileSync('test/fixtures/routing/dense-feedback.json','utf8'));

test('shortens the reported detour to two turns without crossing the worker boundary',()=>{
  const before=dense(),original=structuredClone(before),after=shortenRoutes(before),edge=after.edges[0];
  assert.ok(edge.paths[0].length-2<=2);
  assert.ok(assessRoutes(after).length<1500);
  assert.ok(assessRoutes(after).length<assessRoutes(before).length);
  assert.equal(assessRoutes(after).overlaps,0);
  assert.ok(assessRoutes(after).crossings<=assessRoutes(before).crossings);
  assert.equal(edge.labels[0].text,'Order accepted');
  assert.deepEqual(before,original);
  assert.equal(edge.paths[0][0].x,1074);
  assert.equal(edge.paths[0].at(-1)!.x,902);
  assert.ok(edge.paths[0].some(p=>p.x>=1242));
});

test('retains blocked routes and labels that have no clear segment',()=>{
  const blocked=dense();blocked.groups.push({id:'barrier',x:810,y:1310,width:276,height:160,header:{x:810,y:1310,width:276,height:20}});
  assert.deepEqual(shortenRoutes(blocked),blocked);
  const label=dense();label.edges[0].labels[0].width=10000;label.edges[0].labels[0].height=10000;
  assert.deepEqual(shortenRoutes(label),label);
});

test('retains self loops and multi-section routes',()=>{
  for(const mode of ['loop','sections']){
    const scene=dense();if(mode==='loop')scene.edges[0].target='orders';else scene.edges[0].paths.push([{x:0,y:0},{x:0,y:10}]);
    assert.deepEqual(shortenRoutes(scene),scene);
  }
});

test('routes around a heading rather than shortening through it',()=>{
  const scene=dense();scene.groups[0].header={x:1230,y:1170,width:500,height:20};
  const after=shortenRoutes(scene);
  assert.equal(assessRoutes(after).overlaps,0);
  assert.ok(after.edges[0].paths[0].some(p=>p.x<=382));
});

const edge=(id:string,source:string,target:string,points:number[][]):SceneEdge=>({id,source,target,kind:'call',paths:[points.map(([x,y])=>({x,y}))],labels:[]});
test('distinguishes real crossings, unrelated collinear hiding, and shared trunks',()=>{
  const scene:LayoutScene={nodes:[],groups:[],edges:[edge('first','a','b',[[0,0],[0,0],[100,0]]),edge('second','c','d',[[20,0],[120,0]])]};
  assert.equal(assessRoutes(scene).overlaps,1);
  scene.edges[1].source='a';assert.equal(assessRoutes(scene).overlaps,0);
  scene.edges[1]=edge('second','c','d',[[50,-20],[50,20]]);
  assert.equal(assessRoutes(scene).crossings,1);assert.equal(assessRoutes(scene).length,140);
  assert.equal(assessRoutes(scene).bends,0);
});

test('counts labels and headings as obstacles and preserves ranking priorities',()=>{
  const scene=dense();scene.edges[0].labels[0]={x:830,y:1330,width:100,height:20,text:'Bad label',lines:['Bad label']};
  assert.ok(assessRoutes(scene).overlaps>0);
  const base={overlaps:0,crossings:2,length:100,bends:5};
  assert.ok(compareRoutes(base,{overlaps:1,crossings:0,length:1,bends:0})<0);
  assert.ok(compareRoutes(base,{...base,crossings:3,length:1})<0);
  assert.ok(compareRoutes(base,{...base,length:101,bends:0})<0);
  assert.ok(compareRoutes(base,{...base,bends:6})<0);
  assert.deepEqual(assessRoutes({nodes:[],groups:[],edges:[]}),{overlaps:0,crossings:0,length:0,bends:0});
});
