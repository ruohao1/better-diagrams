import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode } from 'elkjs/lib/elk-api.js';
import { parseDocument } from '../model.ts';
import type { ProjectInput } from '../model.ts';
import defaultNode from './default-node.svg';
import defaultTheme from './default-theme.css';
import { instantiateNode } from './templates.ts';

const NS = 'http://www.w3.org/2000/svg';
export type Bounds = { x: number; y: number; width: number; height: number };
export type CompiledView = { viewId: string; svg: SVGSVGElement; bounds: Bounds };
const elk = new ELK();

function element<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number> = {}, text?: string): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

function wrapLabel(svg: SVGSVGElement, label: string): void {
  const text = svg.querySelector<SVGTextElement>('.node-label');
  const rect = svg.querySelector<SVGRectElement>('.node-body');
  if (!text || !rect) return;
  const lines: string[] = [];
  let line = '';
  for (const word of label.split(/\s+/)) {
    text.textContent = line ? line + ' ' + word : word;
    if (line && text.getComputedTextLength() > 184) { lines.push(line); line = ''; }
    text.textContent = word;
    if (text.getComputedTextLength() <= 184) { line = line ? line + ' ' + word : word; continue; }
    for (const segment of new Intl.Segmenter().segment(word)) {
      text.textContent = line + segment.segment;
      if (line && text.getComputedTextLength() > 184) { lines.push(line); line = segment.segment; }
      else line += segment.segment;
    }
  }
  lines.push(line);
  const lineHeight = parseFloat(getComputedStyle(text).fontSize) * 1.45;
  const height = Math.max(84, lines.length * lineHeight + 36);
  text.replaceChildren(...lines.map((line, index) => element('tspan', { x: 20, y: (height - (lines.length - 1) * lineHeight) / 2 + lineHeight / 3 + index * lineHeight }, line)));
  rect.setAttribute('height', String(height));
  svg.setAttribute('viewBox', '0 0 224 ' + height);
  svg.setAttribute('width', '224'); svg.setAttribute('height', String(height));
}

export async function compileView(input: ProjectInput, viewId: string, host: HTMLElement): Promise<CompiledView> {
  const doc = parseDocument(input.document);
  const view = doc.views[viewId];
  if (!view) throw new Error('Missing view: ' + viewId);
  const svg = element('svg', { xmlns: NS, class: 'diagram', role: 'img', 'aria-label': view.title });
  svg.style.width = '100%'; svg.style.height = '100%';
  svg.append(element('style', {}, defaultTheme + '\n' + input.themeCss));
  const scene = element('g', { 'data-scene': '' }); svg.append(scene);
  const measure = document.createElement('div');
  measure.style.cssText = 'position:absolute;left:-100000px;top:0;visibility:hidden;width:2000px;height:2000px';
  measure.append(svg); host.append(measure);
  try {
    await document.fonts.ready;
    const measured = new Map<string, { content: SVGSVGElement; box: DOMRect; width: number; height: number }>();
    for (const nodeId of view.nodeIds) {
      const node = doc.nodes[nodeId];
      if (node.template && node.template !== 'default') throw new Error('Unknown template: ' + node.template);
      const content = instantiateNode(defaultNode, nodeId, node);
      scene.append(content); wrapLabel(content, node.label);
      const box = content.getBBox();
      measured.set(nodeId, { content, box, width: box.width + 16, height: box.height + 16 });
      content.remove();
    }
    const groupMembers = new Set((view.groups ?? []).flatMap(group => group.nodeIds));
    const makeNode = (id: string): ElkNode => ({ id: 'n-' + id, width: measured.get(id)!.width, height: measured.get(id)!.height });
    const graph: ElkNode = {
      id: 'root',
      layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT', 'elk.edgeRouting': 'ORTHOGONAL', 'elk.hierarchyHandling': 'INCLUDE_CHILDREN', 'elk.spacing.nodeNode': '36', 'elk.layered.spacing.nodeNodeBetweenLayers': '56', 'elk.padding': '[top=20,left=20,bottom=20,right=20]' },
      children: [
        ...(view.groups ?? []).filter(group => group.nodeIds.length).map(group => ({ id: 'g-' + group.id, children: group.nodeIds.map(makeNode), layoutOptions: { 'elk.padding': '[top=46,left=20,bottom=20,right=20]' } })),
        ...view.nodeIds.filter(id => !groupMembers.has(id)).map(makeNode),
      ],
      edges: view.edges.map(edge => ({ id: edge.id, sources: ['n-' + edge.source], targets: ['n-' + edge.target], labels: edge.label ? [{ text: edge.label, width: edge.label.length * 8 + 8, height: 20 }] : [] })),
    };
    const layout = view.nodeIds.length ? await elk.layout(graph) : graph;
    const positions = new Map<string, { x: number; y: number }>([['root', { x: 0, y: 0 }]]);
    const drawNodes = (parent: ElkNode, offsetX = 0, offsetY = 0): void => {
      for (const child of parent.children ?? []) {
        const x = offsetX + (child.x ?? 0), y = offsetY + (child.y ?? 0);
        positions.set(child.id, { x, y });
        if (child.id.startsWith('g-')) {
          const group = view.groups!.find(group => 'g-' + group.id === child.id)!;
          const wrapper = element('g', { 'data-group-id': group.id, transform: 'translate(' + x + ',' + y + ')' });
          wrapper.append(element('rect', { class: 'group-body', rx: 18, width: child.width ?? 0, height: child.height ?? 0 }), element('text', { class: 'group-label', x: 20, y: 27 }, group.label));
          scene.append(wrapper); drawNodes(child, x, y);
        } else {
          const id = child.id.slice(2), data = measured.get(id)!;
          const wrapper = element('g', { 'data-node-id': id, transform: 'translate(' + (x + 8 - data.box.x) + ',' + (y + 8 - data.box.y) + ')', role: 'button', tabindex: 0, 'aria-label': doc.nodes[id].label, 'aria-pressed': 'false' });
          wrapper.append(data.content); scene.append(wrapper);
        }
      }
    };
    drawNodes(layout);
    const defs = element('defs');
    const markerId = 'arrow-' + viewId;
    const marker = element('marker', { id: markerId, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
    marker.append(element('path', { class: 'arrow', d: 'M 0 0 L 10 5 L 0 10 z' })); defs.append(marker); svg.prepend(defs);
    const drawEdges = (parent: ElkNode): void => {
      for (const edge of parent.edges ?? []) {
        const offset = positions.get(edge.container ?? parent.id) ?? { x: 0, y: 0 };
        const wrapper = element('g', { 'data-edge-id': edge.id, transform: 'translate(' + offset.x + ',' + offset.y + ')' });
        for (const section of edge.sections ?? []) {
          const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
          wrapper.append(element('path', { class: 'edge-path', d: points.map((p, i) => (i ? 'L' : 'M') + p.x + ' ' + p.y).join(' '), 'marker-end': 'url(#' + markerId + ')' }));
        }
        for (const label of edge.labels ?? []) wrapper.append(element('text', { class: 'edge-label', x: label.x ?? 0, y: (label.y ?? 0) + 14 }, label.text ?? ''));
        scene.append(wrapper);
      }
      for (const child of parent.children ?? []) drawEdges(child);
    };
    drawEdges(layout);
    const box = scene.getBBox();
    const bounds = { x: box.x - 28, y: box.y - 28, width: Math.max(120, box.width + 56), height: Math.max(96, box.height + 56) };
    svg.setAttribute('viewBox', [bounds.x, bounds.y, bounds.width, bounds.height].join(' '));
    svg.insertBefore(element('rect', { class: 'canvas-background', ...bounds }), scene);
    svg.remove();
    return { viewId, svg, bounds };
  } finally { measure.remove(); }
}

export function exportSvg(view: CompiledView): string {
  const svg = view.svg.cloneNode(true) as SVGSVGElement;
  svg.setAttribute('viewBox', [view.bounds.x, view.bounds.y, view.bounds.width, view.bounds.height].join(' '));
  svg.setAttribute('width', String(view.bounds.width)); svg.setAttribute('height', String(view.bounds.height));
  svg.style.removeProperty('width'); svg.style.removeProperty('height');
  for (const node of svg.querySelectorAll('[tabindex]')) { node.removeAttribute('tabindex'); node.removeAttribute('aria-pressed'); }
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(svg);
}
