import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseDocument } from '../src/model.ts';

const fixture = JSON.parse(readFileSync(new URL('../examples/skill-install/diagram.json', import.meta.url), 'utf8'));
const copy = () => structuredClone(fixture);

test('accepts install flow with a shared node and internal view', () => {
  assert.equal(parseDocument(fixture).rootViewId, 'overview');
  assert.equal(parseDocument(fixture).views.overview.nodeIds.length, 7);
});

test('rejects missing edge endpoints', () => {
  const input = copy(); input.views.overview.edges[0].target = 'missing';
  assert.throws(() => parseDocument(input), /missing/i);
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
