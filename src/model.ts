export type SourceRef = { path: string; line?: number; url?: string };
export type DiagramNodeV1 = {
  label: string;
  details: string;
  references?: SourceRef[];
  template?: string;
  data?: Record<string, string>;
  childViewId?: string;
};
export type DiagramEdgeV1 = { id: string; source: string; target: string; label?: string };
export type DiagramGroupV1 = { id: string; label: string; nodeIds: string[] };
export type DiagramViewV1 = {
  title: string;
  detailLevel: string;
  nodeIds: string[];
  edges: DiagramEdgeV1[];
  groups?: DiagramGroupV1[];
};
export type DiagramDocumentV1 = {
  version: 1;
  title: string;
  purpose: string;
  audience: string;
  rootViewId: string;
  nodes: Record<string, DiagramNodeV1>;
  views: Record<string, DiagramViewV1>;
};
export type DiagramType = 'architecture' | 'flowchart';
export type NodeSizePreset = 'compact' | 'standard' | 'large';
export type FlowStepKind = 'action' | 'decision' | 'start' | 'end';
export type FlowDirection = 'down' | 'right';
export type ArchitectureEdgeKind = 'call' | 'data' | 'event' | 'telemetry' | 'dependency';
export type FlowEdgeKind = 'next' | 'branch' | 'error' | 'retry' | 'jump';
export type ConnectionKind = ArchitectureEdgeKind | FlowEdgeKind;
export type NodeAppearance = { background?: string; border?: string };
export type DiagramNodeV2 = DiagramNodeV1 & { summary: string; logo?: string; appearance?: NodeAppearance };
export type DiagramGroupV2 = DiagramGroupV1 & { parentId?: string };
export type ArchitectureEdge = DiagramEdgeV1 & { kind: ArchitectureEdgeKind; label: string };
export type FlowchartEdge = DiagramEdgeV1 & (
  | { kind: 'next'; label?: never }
  | { kind: Exclude<FlowEdgeKind, 'next'>; label: string }
);
type ViewBaseV2 = Omit<DiagramViewV1, 'edges' | 'groups'> & { groups?: DiagramGroupV2[]; legend?: boolean };
export type DiagramViewV2 = ViewBaseV2 & (
  | { type: 'architecture'; edges: ArchitectureEdge[]; nodeSize?: NodeSizePreset }
  | { type: 'flowchart'; edges: FlowchartEdge[]; stepKinds: Record<string, FlowStepKind>; mainPath: string[]; direction?: FlowDirection }
);
export type DiagramDocumentV2 = Omit<DiagramDocumentV1, 'version' | 'nodes' | 'views'> & {
  version: 2; nodes: Record<string, DiagramNodeV2>; views: Record<string, DiagramViewV2>;
};
export type DiagramDocument = DiagramDocumentV1 | DiagramDocumentV2;
export type DiagramNode = DiagramNodeV1 | DiagramNodeV2;
export type DiagramEdge = DiagramEdgeV1 | ArchitectureEdge | FlowchartEdge;
export type DiagramGroup = DiagramGroupV1 | DiagramGroupV2;
export type DiagramView = DiagramViewV1 | DiagramViewV2;
export type RenderNode = DiagramNodeV2;
export type RenderEdge = DiagramEdgeV1 & { kind: ConnectionKind };
export type RenderView = Omit<DiagramViewV1, 'edges' | 'groups'> & {
  type: DiagramType; edges: RenderEdge[]; groups: DiagramGroupV2[];
  legend: boolean; nodeSize: NodeSizePreset; direction: 'auto' | FlowDirection;
  stepKinds: Record<string, FlowStepKind>; mainPath: string[]; legacySizing: boolean;
};
export type RenderDocument = Omit<DiagramDocumentV1, 'version' | 'nodes' | 'views'> & {
  nodes: Record<string, RenderNode>; views: Record<string, RenderView>;
};
export type ProjectInput = {
  document: DiagramDocument;
  themeCss: string;
  templates: Record<string, string>;
  logos: Record<string, string>;
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
  requireValue(doc.version === 1 || doc.version === 2, 'version', 'expected 1 or 2');
  const typed = doc.version === 2;
  for (const key of ['title', 'purpose', 'audience']) text(doc[key], key, true);
  id(doc.rootViewId, 'rootViewId');
  const nodes = object(doc.nodes, 'nodes');
  const views = object(doc.views, 'views');
  const nodeIds = new Set(Object.keys(nodes));
  const viewIds = new Set(Object.keys(views));
  requireValue(viewIds.has(doc.rootViewId), 'rootViewId', 'missing view');
  for (const [nodeId, value] of Object.entries(nodes)) {
    id(nodeId, 'nodes');
    const node = object(value, 'nodes.' + nodeId, ['label', 'details', 'references', 'template', 'data', 'childViewId', ...(typed ? ['summary','logo','appearance'] : [])]);
    text(node.label, nodeId + '.label', true);
    text(node.details, nodeId + '.details');
    if (typed) {
      text(node.summary, nodeId + '.summary');
      if (node.logo !== undefined) id(node.logo, nodeId + '.logo');
      if (node.appearance !== undefined) for (const color of Object.values(object(node.appearance, nodeId + '.appearance', ['background','border']))) {
        requireValue(typeof color === 'string' && /^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.test(color), nodeId + '.appearance', 'expected a hex color');
      }
    }
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
    const raw = object(value, viewId);
    if (typed) requireValue(raw.type === 'architecture' || raw.type === 'flowchart', viewId + '.type', 'expected architecture or flowchart');
    const flow = typed && raw.type === 'flowchart';
    const view = object(value, viewId, ['title', 'detailLevel', 'nodeIds', 'edges', 'groups', ...(typed ? ['type','legend', ...(flow ? ['stepKinds','mainPath','direction'] : ['nodeSize'])] : [])]);
    text(view.title, viewId + '.title', true);
    text(view.detailLevel, viewId + '.detailLevel', true);
    const selected = new Set(members(view.nodeIds, nodeIds, viewId));
    if (typed && view.legend !== undefined) requireValue(typeof view.legend === 'boolean', viewId + '.legend', 'expected boolean');
    if (typed && !flow && view.nodeSize !== undefined) requireValue(typeof view.nodeSize === 'string' && ['compact','standard','large'].includes(view.nodeSize), viewId + '.nodeSize', 'unknown node size');
    let roles: Record<string, unknown> = {};
    if (flow) {
      roles = object(view.stepKinds, viewId + '.stepKinds');
      requireValue(Object.keys(roles).length === selected.size && Object.keys(roles).every(key => selected.has(key)), viewId, 'step kinds must match view membership');
      for (const role of Object.values(roles)) requireValue(typeof role === 'string' && ['action','decision','start','end'].includes(role), viewId, 'unknown step kind');
      if (view.direction !== undefined) requireValue(view.direction === 'down' || view.direction === 'right', viewId, 'unknown direction');
    }
    const edgeIds = new Set<string>();
    for (const entry of array(view.edges, viewId + '.edges')) {
      const edge = object(entry, viewId + '.edge', ['id', 'source', 'target', 'label', ...(typed ? ['kind'] : [])]);
      id(edge.id, viewId + '.edge.id');
      requireValue(!edgeIds.has(edge.id), viewId, 'duplicate edge identifier'); edgeIds.add(edge.id);
      id(edge.source, 'edge.source'); id(edge.target, 'edge.target');
      requireValue(selected.has(edge.source) && selected.has(edge.target), viewId, 'missing edge endpoint');
      if (edge.label !== undefined) text(edge.label, 'edge.label');
      if (typed) {
        requireValue(typeof edge.kind === 'string' && (flow ? ['next','branch','error','retry','jump'] : ['call','data','event','telemetry','dependency']).includes(edge.kind), viewId, 'unknown connection kind');
        if (flow && edge.kind === 'next') {
          requireValue(edge.label === undefined, viewId, 'next connections must be unlabeled');
          requireValue(roles[edge.source] !== 'decision', viewId, 'decision connections require labeled outcomes');
        } else text(edge.label, viewId + '.edge.label', true);
      }
    }
    if (flow) {
      const path = array(view.mainPath, viewId + '.mainPath');
      const edges = new Map((view.edges as DiagramEdgeV1[]).map(edge => [edge.id, edge]));
      const seen = new Set<string>();
      let target: string | undefined;
      for (const entry of path) {
        id(entry, viewId + '.mainPath');
        const edge = edges.get(entry);
        requireValue(edge, viewId, 'missing main path edge');
        requireValue(target === undefined || target === edge.source, viewId, 'main path must be contiguous');
        if (target === undefined) seen.add(edge.source);
        requireValue(!seen.has(edge.target), viewId, 'main path must not repeat nodes');
        seen.add(edge.target);target = edge.target;
      }
    }
    const grouped = new Set<string>();
    const groupIds = new Set<string>();
    if (view.groups !== undefined) for (const entry of array(view.groups, viewId + '.groups')) {
      const group = object(entry, viewId + '.group', ['id', 'label', 'nodeIds', ...(typed ? ['parentId'] : [])]);
      id(group.id, 'group.id'); text(group.label, 'group.label', true);
      requireValue(!groupIds.has(group.id), viewId, 'duplicate group identifier'); groupIds.add(group.id);
      if (typed && group.parentId !== undefined) id(group.parentId, viewId + '.group.parentId');
      for (const member of members(group.nodeIds, selected, viewId + '.group')) {
        requireValue(!grouped.has(member), viewId, 'node belongs to multiple groups'); grouped.add(member);
      }
    }
    if (typed) {
      const groups = new Map(((view.groups ?? []) as DiagramGroupV2[]).map(group => [group.id, group]));
      for (const group of groups.values()) {
        const seen = new Set<string>([group.id]);
        let parent = group.parentId;
        while (parent !== undefined) {
          requireValue(groups.has(parent), viewId, 'missing parent group');
          requireValue(!seen.has(parent), viewId, 'group parent cycle');
          seen.add(parent);parent = groups.get(parent)!.parentId;
        }
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

export function normalizeDocument(document: DiagramDocument): RenderDocument {
  const source = structuredClone(parseDocument(document));
  const { version, nodes, views, ...metadata } = source;
  return { ...metadata,
    nodes: Object.fromEntries(Object.entries(nodes).map(([id,node]) => [id, { summary:'', ...node }])),
    views: Object.fromEntries(Object.entries(views).map(([id,view]): [string,RenderView] => {
      const current = source.version === 2 ? source.views[id] : undefined;
      const flow = current?.type === 'flowchart' ? current : undefined;
      return [id, { ...view, type: current?.type ?? 'architecture',
        edges: current ? current.edges.map(edge => ({ ...edge })) : view.edges.map(edge => ({ ...edge, kind:'call' })),
        groups: view.groups ?? [], legend: current?.legend !== false,
        nodeSize: current?.type === 'architecture' ? current.nodeSize ?? 'standard' : 'standard',
        direction: flow?.direction ?? (flow ? 'down' : 'auto'),
        stepKinds: flow?.stepKinds ?? {}, mainPath: flow?.mainPath ?? [], legacySizing: version === 1 }];
    })),
  };
}
