import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { ProjectInput } from '../../src/model.ts';

declare global { var DiagramCompiler: typeof import('../../src/browser/compiler.ts'); }
const fixture = JSON.parse(readFileSync('examples/skill-install/diagram.json', 'utf8'));
const input: ProjectInput = { document: fixture, themeCss: '', templates: {}, logos:{} };

test.beforeEach(async ({ page }) => {
  await page.setContent('<main id="stage" style="width:1400px;height:850px"></main>');
  await page.addScriptTag({ path: 'dist/test/compiler.js' });
});

test('lays out grouped nodes, cross-group routes and full export bounds', async ({ page }) => {
  const result = await page.evaluate(async (input) => {
    const host = document.getElementById('stage')!;
    const view = await DiagramCompiler.compileView(input, 'overview', host);
    host.append(view.svg);
    const boxes = [...view.svg.querySelectorAll<SVGGElement>('[data-node-id]')].map(node => {
      const b = node.getBoundingClientRect(); return { id: node.dataset.nodeId, x: b.x, y: b.y, right: b.right, bottom: b.bottom };
    });
    const overlaps: string[] = [];
    for (let i=0;i<boxes.length;i++) for (let j=i+1;j<boxes.length;j++) {
      const a=boxes[i], b=boxes[j];
      if (a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y) overlaps.push(a.id+' '+b.id);
    }
    const outside = [...view.svg.querySelectorAll<SVGGraphicsElement>('[data-node-id], [data-edge-id], [data-group-id]')].filter(el => {
      const b=el.getBBox(), m=el.getCTM()!, root=view.svg.getCTM()!.inverse();
      return [[b.x,b.y],[b.x+b.width,b.y+b.height]].some(([x,y])=>{
        const p=new DOMPoint(x,y).matrixTransform(m).matrixTransform(root);
        return p.x < view.bounds.x || p.y < view.bounds.y || p.x > view.bounds.x+view.bounds.width || p.y > view.bounds.y+view.bounds.height;
      });
    }).length;
    const lines = [...view.svg.querySelectorAll('[data-node-id="inventory"] tspan')].map(el => el.textContent).join(' ');
    return { ids: boxes.map(b=>b.id), overlaps, outside, lines, svg: DiagramCompiler.exportSvg(view), edgeCount:view.svg.querySelectorAll('[data-edge-id]').length };
  }, input);
  expect(result.ids.sort()).toEqual(fixture.views.overview.nodeIds.slice().sort());
  expect(result.overlaps).toEqual([]);
  expect(result.outside).toBe(0);
  expect(result.edgeCount).toBe(6);
  expect(result.lines).toBe(fixture.nodes.inventory.label);
  expect(result.svg).not.toMatch(/foreignObject|NaN|Infinity|toolbar/);
  await page.screenshot({ path: '.superpowers/sdd/2026-10-25-diagram-authoring/layout.png' });
});

test('handles cycles, disconnected nodes, long Unicode labels and an empty view', async ({ page }) => {
  const changed = structuredClone(input);
  if(changed.document.version!==1)throw new Error('Expected legacy fixture');
  changed.document.nodes.select.label = 'Une longue étiquette 日本語 — 🧭 '.repeat(4);
  changed.document.nodes.isolated = { label: 'Disconnected', details: 'No connections.' };
  changed.document.views.overview.nodeIds.push('isolated');
  changed.document.views.overview.edges.push({ id:'retry',source:'receipt',target:'select' });
  changed.document.views.empty = { title:'Empty',detailLevel:'Overview',nodeIds:[],edges:[] };
  const result = await page.evaluate(async input => {
    const host=document.getElementById('stage')!;
    const view=await DiagramCompiler.compileView(input,'overview',host);host.append(view.svg);
    const empty=await DiagramCompiler.compileView(input,'empty',host);
    return { svg:DiagramCompiler.exportSvg(view), label:view.svg.querySelector('[data-node-id="select"]')?.getAttribute('aria-label'), empty:empty.bounds };
  },changed);
  expect(result.svg).not.toMatch(/NaN|Infinity/);
  expect(result.label).toBe(changed.document.nodes.select.label);
  expect(result.empty.width).toBeGreaterThan(0);
  expect(result.empty.height).toBeGreaterThan(0);
});

test('reserves actual geometry for Unicode, themed edge labels and group headings',async({page})=>{
  const result=await page.evaluate(async()=>{
    const host=document.getElementById('stage')!;
    const problems:string[]=[];
    for(const [name,label,themeCss,groupLabel] of [
      ['unicode','日本語'.repeat(12),'',''],
      ['theme','A very wide connection','.edge-label{font-size:36px}',''],
      ['group','calls','.group-label{font-size:36px}','A long group heading — 日本語 '.repeat(8)],
    ]){
      const input={document:{version:1 as const,title:'Measured labels',purpose:'Keep text clear of nodes.',audience:'Maintainers',rootViewId:'overview',nodes:{a:{label:'Source',details:''},b:{label:'Destination',details:''}},views:{overview:{title:'Overview',detailLevel:'Components',nodeIds:['a','b'],edges:[{id:'call',source:'a',target:'b',label}],groups:groupLabel?[{id:'group',label:groupLabel,nodeIds:['a']}]:[]}}},themeCss,templates:{},logos:{}};
      const view=await DiagramCompiler.compileView(input,'overview',host);host.replaceChildren(view.svg);
      const edge=view.svg.querySelector<SVGTextElement>('.edge-label')!.getBoundingClientRect();
      for(const node of view.svg.querySelectorAll<SVGRectElement>('.node-body')){
        const box=node.getBoundingClientRect();
        if(edge.left<box.right && edge.right>box.left && edge.top<box.bottom && edge.bottom>box.top)problems.push(name+': edge overlaps node');
      }
      if(groupLabel){
        const heading=view.svg.querySelector<SVGTextElement>('.group-label')!.getBoundingClientRect();
        const group=view.svg.querySelector<SVGRectElement>('.group-body')!.getBoundingClientRect();
        const node=view.svg.querySelector<SVGRectElement>('[data-node-id="a"] .node-body')!.getBoundingClientRect();
        if(heading.left<group.left || heading.right>group.right || heading.top<group.top || heading.bottom>group.bottom)problems.push(name+': heading outside group');
        if(heading.bottom>node.top)problems.push(name+': heading overlaps child');
      }
    }
    return problems;
  });
  expect(result).toEqual([]);
});
