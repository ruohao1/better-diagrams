export type SourceRef = { path: string; line?: number; url?: string };
export type DiagramNode = {
  label: string;
  details: string;
  references?: SourceRef[];
  template?: string;
  data?: Record<string, string>;
  childViewId?: string;
};
export type DiagramEdge = { id: string; source: string; target: string; label?: string };
export type DiagramGroup = { id: string; label: string; nodeIds: string[] };
export type DiagramView = {
  title: string;
  detailLevel: string;
  nodeIds: string[];
  edges: DiagramEdge[];
  groups?: DiagramGroup[];
};
export type DiagramDocument = {
  version: 1;
  title: string;
  purpose: string;
  audience: string;
  rootViewId: string;
  nodes: Record<string, DiagramNode>;
  views: Record<string, DiagramView>;
};
export type ProjectInput = {
  document: DiagramDocument;
  themeCss: string;
  templates: Record<string, string>;
};
export type ProjectSnapshot = ProjectInput & { revision: string; documentRevision: string };

function requireValue(condition: unknown, path: string, message: string): asserts condition {
  if (!condition) throw new Error(path + ': ' + message);
}

function object(value: unknown, path: string, fields?: string[]): Record<string, unknown> {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), path, 'expected an object');
  const result = value as Record<string, unknown>;
  if (fields) for (const key of Object.keys(result)) requireValue(fields.includes(key), path, 'unknown field ' + key);
  return result;
}

function text(value: unknown, path: string, nonempty = false): asserts value is string {
  requireValue(typeof value === 'string' && (!nonempty || value.trim().length > 0), path, 'expected ' + (nonempty ? 'nonempty ' : '') + 'text');
}

function id(value: unknown, path: string): asserts value is string {
  text(value, path);
  requireValue(/^[A-Za-z][A-Za-z0-9_-]*$/.test(value), path, 'invalid identifier');
}

function array(value: unknown, path: string): unknown[] {
  requireValue(Array.isArray(value), path, 'expected an array');
  return value;
}

function members(value: unknown, available: Set<string>, path: string): string[] {
  const values = array(value, path);
  const seen = new Set<string>();
  for (const entry of values) {
    id(entry, path);
    requireValue(available.has(entry), path, 'missing node ' + entry);
    requireValue(!seen.has(entry), path, 'duplicate node ' + entry);
    seen.add(entry);
  }
  return values as string[];
}

export function parseDocument(value: unknown): DiagramDocument {
  const doc = object(value, 'document', ['version', 'title', 'purpose', 'audience', 'rootViewId', 'nodes', 'views']);
  requireValue(doc.version === 1, 'version', 'expected 1');
  for (const key of ['title', 'purpose', 'audience']) text(doc[key], key, true);
  id(doc.rootViewId, 'rootViewId');
  const nodes = object(doc.nodes, 'nodes');
  const views = object(doc.views, 'views');
  const nodeIds = new Set(Object.keys(nodes));
  const viewIds = new Set(Object.keys(views));
  requireValue(viewIds.has(doc.rootViewId), 'rootViewId', 'missing view');
  for (const [nodeId, value] of Object.entries(nodes)) {
    id(nodeId, 'nodes');
    const node = object(value, 'nodes.' + nodeId, ['label', 'details', 'references', 'template', 'data', 'childViewId']);
    text(node.label, nodeId + '.label', true);
    text(node.details, nodeId + '.details');
    if (node.template !== undefined) id(node.template, nodeId + '.template');
    if (node.childViewId !== undefined) {
      id(node.childViewId, nodeId + '.childViewId');
      requireValue(viewIds.has(node.childViewId), nodeId, 'missing internal view');
    }
    if (node.data !== undefined) for (const entry of Object.values(object(node.data, nodeId + '.data'))) text(entry, nodeId + '.data');
    if (node.references !== undefined) for (const entry of array(node.references, nodeId + '.references')) {
      const ref = object(entry, nodeId + '.reference', ['path', 'line', 'url']);
      text(ref.path, 'reference.path', true);
      requireValue(!/^(?:[\\/]|[A-Za-z]:)/.test(ref.path) && !ref.path.split(/[\\/]/).includes('..'), 'reference.path', 'expected repository-relative path');
      if (ref.line !== undefined) requireValue(Number.isSafeInteger(ref.line) && Number(ref.line) > 0, 'reference.line', 'expected a positive integer');
      if (ref.url !== undefined) {
        text(ref.url, 'reference.url');
        const url = new URL(ref.url);
        requireValue(url.protocol === 'https:' || url.protocol === 'http:', 'reference.url', 'expected HTTP(S) URL');
      }
    }
  }
  for (const [viewId, value] of Object.entries(views)) {
    id(viewId, 'views');
    const view = object(value, viewId, ['title', 'detailLevel', 'nodeIds', 'edges', 'groups']);
    text(view.title, viewId + '.title', true);
    text(view.detailLevel, viewId + '.detailLevel', true);
    const selected = new Set(members(view.nodeIds, nodeIds, viewId));
    const edgeIds = new Set<string>();
    for (const entry of array(view.edges, viewId + '.edges')) {
      const edge = object(entry, viewId + '.edge', ['id', 'source', 'target', 'label']);
      id(edge.id, viewId + '.edge.id');
      requireValue(!edgeIds.has(edge.id), viewId, 'duplicate edge identifier'); edgeIds.add(edge.id);
      id(edge.source, 'edge.source'); id(edge.target, 'edge.target');
      requireValue(selected.has(edge.source) && selected.has(edge.target), viewId, 'missing edge endpoint');
      if (edge.label !== undefined) text(edge.label, 'edge.label');
    }
    const grouped = new Set<string>();
    const groupIds = new Set<string>();
    if (view.groups !== undefined) for (const entry of array(view.groups, viewId + '.groups')) {
      const group = object(entry, viewId + '.group', ['id', 'label', 'nodeIds']);
      id(group.id, 'group.id'); text(group.label, 'group.label', true);
      requireValue(!groupIds.has(group.id), viewId, 'duplicate group identifier'); groupIds.add(group.id);
      for (const member of members(group.nodeIds, selected, viewId + '.group')) {
        requireValue(!grouped.has(member), viewId, 'node belongs to multiple groups'); grouped.add(member);
      }
    }
  }
  const document = value as DiagramDocument;
  const visited = new Set<string>();
  const visiting = new Set<string>();
  function visit(viewId: string): void {
    requireValue(!visiting.has(viewId), viewId, 'internal view cycle');
    if (visited.has(viewId)) return;
    visiting.add(viewId);
    for (const nodeId of document.views[viewId].nodeIds) {
      const child = document.nodes[nodeId].childViewId;
      if (child) visit(child);
    }
    visiting.delete(viewId); visited.add(viewId);
  }
  for (const viewId of viewIds) visit(viewId);
  return document;
}
