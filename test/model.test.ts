import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseDocument } from '../src/model.ts';
import * as model from '../src/model.ts';

const fixture = JSON.parse(readFileSync(new URL('../examples/skill-install/diagram.json', import.meta.url), 'utf8'));
const copy = () => structuredClone(fixture);

test('accepts install flow with a shared node and internal view', () => {
  assert.equal(parseDocument(fixture).rootViewId, 'overview');
  assert.equal(parseDocument(fixture).views.overview.nodeIds.length, 7);
});

test('rejects duplicate membership in nodes and groups', () => {
  const input = copy(); input.views.overview.nodeIds.push('select');
  assert.throws(() => parseDocument(input), /duplicate/i);
  const grouped = copy(); grouped.views.overview.groups[1].nodeIds.push('select');
  assert.throws(() => parseDocument(grouped), /group/i);
});

test('rejects cycles in internal views', () => {
  const input = copy(); input.nodes.receipt.childViewId = 'overview';
  assert.throws(() => parseDocument(input), /view.*cycle/i);
});

test('accepts directed cycles and self edges', () => {
  const input = copy();
  input.views.overview.edges.push({ id: 'retry', source: 'receipt', target: 'select' });
  input.views.overview.edges.push({ id: 'self', source: 'select', target: 'select' });
  assert.doesNotThrow(() => parseDocument(input));
});

test('accepts empty views', () => {
  const input = copy(); input.views.empty = { title: 'Empty', detailLevel: 'Overview', nodeIds: [], edges: [] };
  assert.doesNotThrow(() => parseDocument(input));
});

test('rejects unknown fields instead of dropping metadata', () => {
  const input = copy(); input.nodes.select.coordinates = { x: 0, y: 0 };
  assert.throws(() => parseDocument(input), /unknown/i);
});

test('rejects malformed values, versions, IDs and references', () => {
  for (const input of [null, [], {}, { ...copy(), version: 2 }]) {
    assert.throws(() => parseDocument(input));
  }
  for (const mutate of [
    (input: typeof fixture) => { input.nodes.select.label = 42; },
    (input: typeof fixture) => { input.rootViewId = 'missing'; },
    (input: typeof fixture) => { input.nodes.select.childViewId = 'missing'; },
    (input: typeof fixture) => { input.nodes['bad id'] = input.nodes.select; },
    (input: typeof fixture) => { input.nodes.select.references[0].url = 'javascript:alert(1)'; },
    (input: typeof fixture) => { input.nodes.select.references[0].line = 0; },
    (input: typeof fixture) => { input.nodes.select.references[0].path = '../secret'; },
    (input: typeof fixture) => { input.views.overview.edges.push(input.views.overview.edges[0]); },
  ]) {
    const input = copy(); mutate(input); assert.throws(() => parseDocument(input));
  }
});

test('preserves custom data and script-shaped text as plain source data', () => {
  const input = copy(); input.nodes.receipt.data.extra = '</script><script>alert(1)</script>';
  assert.deepEqual(parseDocument(input), input);
});

const architecture = () => JSON.parse(readFileSync('examples/architecture-small/diagram.json', 'utf8'));
const flowchart = () => JSON.parse(readFileSync('examples/order-flow/diagram.json', 'utf8'));

for (const [family, create] of [['v1', copy], ['architecture', architecture], ['flowchart', flowchart]] as const) {
  for (const side of ['source', 'target'] as const) {
    for (const defined of [false, true]) {
      test(`${family}: identifies ${defined ? 'unselected' : 'undefined'} ${side} nodes and explains the repair`, () => {
        const input = create(), viewId = input.rootViewId, view = input.views[viewId];
        if (family === 'flowchart') view.mainPath = [];
        const node = { label: 'Worker', details: '', ...(input.version === 2 ? { summary: '' } : {}) };
        if (defined) input.nodes.worker = node;
        const edge = view.edges[0]; edge[side] = 'worker';

        assert.throws(() => parseDocument(input), error => {
          assert.ok(error instanceof Error);
          for (const context of [viewId, edge.id, side, 'worker']) assert.ok(error.message.includes(context), error.message);
          assert.match(error.message, defined ? /not in this view/ : /not defined/);
          assert.ok(error.message.includes(`views.${viewId}.nodeIds`), error.message);
          if (defined) assert.doesNotMatch(error.message, /Define/);
          else assert.match(error.message, /Define.*nodes/);
          if (family === 'flowchart') assert.ok(error.message.includes(`views.${viewId}.stepKinds`), error.message);
          return true;
        });

        input.nodes.worker = node;
        view.nodeIds.push('worker');
        if (family === 'flowchart') view.stepKinds.worker = 'action';
        assert.doesNotThrow(() => parseDocument(input));
      });
    }
  }
}

test('reports the source first when both edge endpoints are missing', () => {
  const input = architecture(), edge = input.views.small.edges[0];
  edge.source = 'absent-source'; edge.target = 'absent-target';
  assert.throws(() => parseDocument(input), error => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /source.*absent-source/);
    assert.doesNotMatch(error.message, /absent-target/);
    return true;
  });
});

test('validates both endpoint identifiers before checking node membership', () => {
  const input = architecture(), edge = input.views.small.edges[0];
  edge.source = 'absent-source'; edge.target = 'invalid id';
  assert.throws(() => parseDocument(input), /target.*invalid identifier/);
});

test('does not treat inherited object properties as defined endpoint nodes', () => {
  const input = architecture(); input.views.small.edges[0].target = 'constructor';
  assert.throws(() => parseDocument(input), /constructor.*not defined/);
});

test('accepts typed views and per-view roles for shared canonical nodes', () => {
  const input = architecture();
  input.views.workflow = { type:'flowchart', title:'Shared flow', detailLevel:'Steps', nodeIds:['orders','database'],
    stepKinds:{orders:'start',database:'end'}, edges:[{id:'next',source:'orders',target:'database',kind:'next'}], mainPath:['next'] };
  assert.equal(parseDocument(input), input);
  assert.equal(parseDocument(flowchart()).version, 2);
  input.views.empty = { type:'flowchart',title:'Empty',detailLevel:'Steps',nodeIds:[],edges:[],stepKinds:{},mainPath:[] };
  assert.doesNotThrow(() => parseDocument(input));
});

test('normalizes without upgrading source', () => {
  assert.equal(typeof model.normalizeDocument, 'function');
  const legacy = copy(), original = structuredClone(legacy);
  const rendered = model.normalizeDocument(parseDocument(legacy));
  assert.equal(rendered.views.overview.legacySizing, true);
  assert.equal(rendered.nodes.select.summary, '');
  assert.equal(rendered.views.overview.type, 'architecture');
  assert.deepEqual(legacy, original);
  rendered.nodes.select.label = 'Render-only edit';
  assert.deepEqual(legacy, original);
  const current = model.normalizeDocument(parseDocument(architecture()));
  assert.equal(current.views.small.legacySizing, false);
  assert.equal(current.views.small.nodeSize, 'standard');
  assert.equal(current.views.small.legend, true);
  assert.equal(model.normalizeDocument(parseDocument(flowchart())).views.flow.direction, 'down');
});

test('rejects invalid typed sources at the source boundary', () => {
  const mutations: [string,(input:any)=>void][] = [
    ['unsupported family',d=>{d.views.small.type='sequence';}],
    ['unsupported kind',d=>{d.views.small.edges[0].kind='magic';}],
    ['empty label',d=>{d.views.small.edges[0].label=' ';}],
    ['missing summary',d=>{delete d.nodes.orders.summary;}],
    ['unknown property',d=>{d.views.small.position={x:0};}],
    ['unsafe color',d=>{d.nodes.orders.appearance={background:'url(https://example.com)'};}],
    ['unsafe logo',d=>{d.nodes.orders.logo='../outside';}],
    ['orphan parent',d=>{d.views.small.groups[0].parentId='missing';}],
    ['parent cycle',d=>{d.views.small.groups[0].parentId='application';}],
  ];
  for(const [name,mutate] of mutations){const d=architecture();mutate(d);assert.throws(()=>parseDocument(d),Error,name);}
  for(const [name,mutate] of [
    ['orphan role',(d:any)=>{d.views.flow.stepKinds.absent='action';}],
    ['missing role',(d:any)=>{delete d.views.flow.stepKinds.stock;}],
    ['unknown role',(d:any)=>{d.views.flow.stepKinds.stock='fork';}],
    ['missing outcome',(d:any)=>{delete d.views.flow.edges[1].label;}],
    ['labeled next',(d:any)=>{d.views.flow.edges[0].label='Next';}],
    ['decision next',(d:any)=>{d.views.flow.edges[1].kind='next';delete d.views.flow.edges[1].label;}],
    ['missing main path',(d:any)=>{delete d.views.flow.mainPath;}],
    ['unknown path edge',(d:any)=>{d.views.flow.mainPath=['absent'];}],
    ['broken chain',(d:any)=>{d.views.flow.mainPath=['start-stock','paid-done'];}],
    ['repeated path',(d:any)=>{d.views.flow.mainPath=['stock-wait','wait-stock'];}],
  ] as [string,(d:any)=>void][]){const d=flowchart();mutate(d);assert.throws(()=>parseDocument(d),Error,name);}
  const valid=architecture();valid.nodes.orders.appearance={background:'#abc',border:'#12345678'};
  assert.doesNotThrow(()=>parseDocument(valid));
});

test('rejects non-string enum values without coercing source arrays',()=>{
  for(const [family,mutate] of [
    ['architecture',(d:any)=>{d.views.small.type=['architecture'];}],
    ['architecture',(d:any)=>{d.views.small.nodeSize=['standard'];}],
    ['architecture',(d:any)=>{d.views.small.edges[0].kind=['call'];}],
    ['flowchart',(d:any)=>{d.views.flow.stepKinds.stock=['decision'];}],
    ['flowchart',(d:any)=>{d.views.flow.edges[0].kind=['next'];}],
    ['flowchart',(d:any)=>{d.views.flow.direction=['down'];}],
    ['flowchart',(d:any)=>{d.views.flow.stepKinds.stock=['decision'];d.views.flow.edges[1].kind='next';delete d.views.flow.edges[1].label;}],
  ] as [string,(d:any)=>void][]){const source=family==='architecture'?architecture():flowchart();mutate(source);assert.throws(()=>parseDocument(source));}
});
