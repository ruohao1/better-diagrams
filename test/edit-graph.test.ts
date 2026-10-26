import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDocument} from '../src/model.ts';
import {removeNodeFromView,removeConnectionFromView,repairMainPath} from '../src/browser/edit-graph.ts';

test('removes a flow step only from its view and repairs dependent memberships',()=>{
  const doc=parseDocument(JSON.parse(readFileSync('examples/order-flow/diagram.json','utf8')));if(doc.version!==2)throw new Error('Expected typed fixture');
  const view=doc.views.reservation;if(view.type!=='flowchart')throw new Error('Expected flowchart');
  const id='reservation-write';doc.nodes[id].data={owner:'test'};doc.nodes[id].logo='local';doc.nodes[id].appearance={border:'#abc'};doc.nodes[id].references=[{path:'test/source.ts',line:1}];
  view.groups=[{id:'outer',label:'Process',nodeIds:[]},{id:'inner',label:'Reservation',parentId:'outer',nodeIds:[id]}];
  const node=structuredClone(doc.nodes[id]),root=structuredClone(doc.views.flow);
  removeNodeFromView(doc,'reservation',id);
  assert.ok(!view.nodeIds.includes(id));assert.ok(!view.edges.some(e=>e.source===id||e.target===id));assert.equal(view.stepKinds[id],undefined);
  assert.deepEqual(view.groups[1].nodeIds,[]);assert.deepEqual(view.mainPath,['reservation-valid-done']);
  assert.deepEqual(doc.nodes[id],node);assert.deepEqual(doc.views.flow,root);assert.doesNotThrow(()=>parseDocument(doc));
});

test('removes a connection and retains the earliest longest surviving main-path run',()=>{
  const doc=parseDocument(JSON.parse(readFileSync('examples/order-flow/diagram.json','utf8')));if(doc.version!==2)throw new Error('Expected typed fixture');
  const view=doc.views.reservation;if(view.type!=='flowchart')throw new Error('Expected flowchart');
  removeConnectionFromView(doc,'reservation','reservation-write-valid');assert.deepEqual(view.mainPath,['reservation-start-write']);assert.doesNotThrow(()=>parseDocument(doc));
  const edges=[{id:'ab',source:'a',target:'b'},{id:'cd',source:'c',target:'d'},{id:'de',source:'d',target:'e'},{id:'ef',source:'e',target:'f'}];
  assert.deepEqual(repairMainPath(['ab','bc','cd','de','ef'],edges),['cd','de','ef']);
  assert.deepEqual(repairMainPath(['ab','bc','cd'],edges),['ab']);assert.deepEqual(repairMainPath([],edges),[]);
});

test('keeps canonical metadata and other legacy views while removing a node',()=>{
  const doc=parseDocument(JSON.parse(readFileSync('examples/skill-install/diagram.json','utf8'))),before=structuredClone(doc);
  removeNodeFromView(doc,'overview','receipt');assert.equal(doc.version,1);assert.deepEqual(doc.nodes.receipt,before.nodes.receipt);assert.deepEqual(doc.views.verification,before.views.verification);assert.doesNotThrow(()=>parseDocument(doc));
});

test('repairs the main path once after removing all incident edges',()=>{
  const doc=parseDocument({version:2,title:'Chain',purpose:'Test path repair',audience:'Tests',rootViewId:'chain',nodes:Object.fromEntries([...'abcdef'].map(id=>[id,{label:id,summary:'',details:''}])),views:{chain:{type:'flowchart',title:'Chain',detailLevel:'Steps',nodeIds:[...'abcdef'],stepKinds:Object.fromEntries([...'abcdef'].map(id=>[id,'action'])),mainPath:['ab','bc','cd','de','ef'],edges:['cd','ab','bc','de','ef'].map(id=>({id,source:id[0],target:id[1],kind:'next'}))}}});
  removeNodeFromView(doc,'chain','c');if(doc.version!==2 || doc.views.chain.type!=='flowchart')throw new Error('Expected typed flow');
  assert.deepEqual(doc.views.chain.mainPath,['de','ef']);assert.doesNotThrow(()=>parseDocument(doc));
});
