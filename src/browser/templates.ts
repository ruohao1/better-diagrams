import type { DiagramNode } from '../model.ts';

export function instantiateNode(template: string, nodeId: string, node: DiagramNode): SVGSVGElement {
  const doc = new DOMParser().parseFromString(template, 'image/svg+xml');
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg') throw new Error('Invalid SVG node template: ' + nodeId);
  const svg = document.importNode(doc.documentElement, true) as unknown as SVGSVGElement;
  for (const slot of svg.querySelectorAll('[data-field]')) {
    const field = slot.getAttribute('data-field');
    slot.textContent = field === 'label' ? node.label : field?.startsWith('data.') ? node.data?.[field.slice(5)] ?? '' : '';
  }
  return svg;
}
