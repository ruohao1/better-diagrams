import {test,expect} from '@playwright/test';
import {readProject} from '../../src/project.ts';
import type {ProjectInput} from '../../src/model.ts';
import {assessRoutes} from '../../src/browser/routing.ts';
import type {LayoutScene} from '../../src/browser/geometry.ts';

test.beforeEach(async({page})=>{
  await page.setContent('<main id="stage" style="width:1400px;height:850px"></main>');
  await page.addScriptTag({path:'dist/test/compiler.js'});
});

test('renders fixed cards, local logos, nested boundaries, and a used-kinds legend',async({page},info)=>{
  const input=await readProject('examples/architecture-small');
  const result=await page.evaluate(async input=>{
    const view=await DiagramCompiler.compileView(input,'small',document.getElementById('stage')!);document.getElementById('stage')!.append(view.svg);
    const nodeSizes=[...view.svg.querySelectorAll<SVGRectElement>('[data-node-id] .node-body')].map(r=>r.getAttribute('width')+'x'+r.getAttribute('height'));
    const outside:string[]=[];
    for(const node of view.svg.querySelectorAll('[data-node-id]')){
      const b=node.querySelector('.node-body')!.getBoundingClientRect();
      for(const text of node.querySelectorAll('.node-label,.node-summary')){const t=text.getBoundingClientRect();if(t.left<b.left || t.right>b.right+.1 || t.top<b.top || t.bottom>b.bottom+.1)outside.push(node.getAttribute('data-node-id')!);}
    }
    const logo=view.svg.querySelector('[data-node-id="orders"] [data-logo]')?.getBoundingClientRect();
    const node=view.svg.querySelector('[data-node-id="orders"] .node-body')!.getBoundingClientRect();
    const platform=view.svg.querySelector<SVGRectElement>('[data-group-id="platform"] .group-body')!;
    const children=[...view.svg.querySelectorAll<SVGRectElement>('[data-group-id="application"] .group-body,[data-group-id="data"] .group-body')];
    return {nodeSizes,outside,logo:!!logo && logo.left>node.left && logo.top>node.top && logo.right<node.left+node.width/2,
      nested:children.every(c=>c.x.baseVal.value>platform.x.baseVal.value && c.x.baseVal.value+c.width.baseVal.value<platform.x.baseVal.value+platform.width.baseVal.value),
      legend:view.svg.querySelector('[data-legend]')?.textContent,xml:DiagramCompiler.exportSvg(view)};
  },input);
  expect(new Set(result.nodeSizes).size).toBe(1);expect(result.nodeSizes[0]).toBe('252x136');
  expect(result.outside).toEqual([]);expect(result.logo).toBe(true);expect(result.nested).toBe(true);
  expect(result.legend).toContain('Order platform');expect(result.legend).toContain('System overview');
  expect(result.legend).toContain('Event');expect(result.legend).not.toContain('Telemetry');
  expect(result.xml).not.toMatch(/NaN|Infinity|foreignObject/);
  await page.screenshot({path:info.outputPath('architecture-small.png')});
});

test('keeps summary overflow inside fixed presets and omits disabled legends',async({page})=>{
  const input:ProjectInput=await readProject('examples/architecture-small');
  const result=await page.evaluate(async input=>{
    if(input.document.version!==2)throw new Error('Expected typed fixture');
    input.document.nodes.orders.summary='A long summary with Unicode 日本語 and 🧭. '.repeat(30);
    const original=input.document.nodes.orders.summary,view=input.document.views.small;
    if(view.type!=='architecture')throw new Error('Expected architecture');view.legend=false;
    const sizes:string[]=[],summaries:string[]=[];
    for(const preset of ['compact','standard','large'] as const){view.nodeSize=preset;const compiled=await DiagramCompiler.compileView(input,'small',document.getElementById('stage')!);const r=compiled.svg.querySelector('[data-node-id="orders"] .node-body')!;sizes.push(r.getAttribute('width')+'x'+r.getAttribute('height'));summaries.push(compiled.svg.querySelector('[data-node-id="orders"] .node-summary')!.textContent!);if(compiled.svg.querySelector('[data-legend]'))throw new Error('Disabled legend present');}
    input.document.views.empty={type:'architecture',title:'Empty',detailLevel:'Overview',nodeIds:[],edges:[]};
    const empty=await DiagramCompiler.compileView(input,'empty',document.getElementById('stage')!);
    return {sizes,summaries,unchanged:input.document.nodes.orders.summary===original,empty:empty.bounds};
  },input);
  expect(result.sizes).toEqual(['224x128','252x136','288x152']);
  expect(result.summaries.every(s=>s.endsWith('…'))).toBe(true);expect(result.unchanged).toBe(true);expect(result.empty.width).toBeGreaterThan(0);
});

test('rejects overflowing titles and custom geometry instead of shrinking text',async({page})=>{
  const input=await readProject('examples/architecture-small');
  const errors=await page.evaluate(async input=>{
    const errors:string[]=[];
    for(const mode of ['title','font','template','template-font']){
      const changed=structuredClone(input);
      if(mode==='title')changed.document.nodes.orders.label='日本語🧭 '.repeat(100);
      if(mode==='font')changed.themeCss='.node-label{font-size:90px}';
      if(mode==='template'){changed.document.nodes.orders.template='overflow';changed.templates.overflow='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="200" height="100"/></svg>';}
      if(mode==='template-font'){changed.document.nodes.orders.template='tiny-text';changed.templates['tiny-text']='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><rect width="1000" height="1000"/><text x="10" y="60" font-size="20">Tiny</text></svg>';}
      try{await DiagramCompiler.compileView(changed,'small',document.getElementById('stage')!);errors.push('accepted');}catch(e){errors.push(String(e));}
    }
    return errors;
  },input);
  expect(errors).not.toContain('accepted');for(const error of errors)expect(error).toMatch(/orders|shop/);
  expect(errors[0]).toContain('standard');
});

test('retains logos, appearance, and the internal-view indicator on fixed custom cards',async({page})=>{
  const input=await readProject('examples/architecture-small');
  if(input.document.version!==2)throw new Error('Expected typed fixture');
  input.document.nodes.orders.template='card';input.document.nodes.orders.appearance={background:'#e7f6ef',border:'#468975'};
  input.templates.card='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 252 136"><rect class="node-body" width="252" height="136"/><text class="node-label" x="62" y="36" data-field="label"/></svg>';
  const result=await page.evaluate(async input=>{
    const view=await DiagramCompiler.compileView(input,'small',document.getElementById('stage')!);document.getElementById('stage')!.append(view.svg);
    const node=view.svg.querySelector('[data-node-id="orders"]')!;
    return {logo:!!node.querySelector('[data-logo]'),indicator:!!node.querySelector('[data-internal-indicator]'),fill:getComputedStyle(node.querySelector('.node-body')!).fill};
  },input);
  expect(result.logo).toBe(true);expect(result.indicator).toBe(true);expect(result.fill).toBe('rgb(231, 246, 239)');
});

test('shortens the dense connection and exports all measured content',async({page},info)=>{
  const input=await readProject('examples/architecture-dense');
  const result=await page.evaluate(async input=>{
    const view=await DiagramCompiler.compileView(input,'dense',document.getElementById('stage')!);document.getElementById('stage')!.append(view.svg);
    const paths=[...view.svg.querySelectorAll<SVGPathElement>('[data-edge-id="orders-bus"] .edge-path')].map(p=>p.getAttribute('d')!);
    const numbers=paths[0].match(/-?\d+(?:\.\d+)?/g)!.map(Number);let length=0;
    for(let i=2;i<numbers.length;i+=2)length+=Math.abs(numbers[i]-numbers[i-2])+Math.abs(numbers[i+1]-numbers[i-1]);
    const worker=view.svg.querySelector<SVGRectElement>('[data-group-id="workers"] .group-body')!,x=worker.x.baseVal.value,y=worker.y.baseVal.value,w=worker.width.baseVal.value,h=worker.height.baseVal.value;
    const hits=Array.from({length:numbers.length/2-1},(_,i)=>{const [ax,ay,bx,by]=numbers.slice(i*2,i*2+4);return ax===bx?ax>x && ax<x+w && Math.max(ay,by)>y && Math.min(ay,by)<y+h:ay>y && ay<y+h && Math.max(ax,bx)>x && Math.min(ax,bx)<x+w;}).some(Boolean);
    const content=view.svg.querySelector<SVGGElement>('[data-scene]')!.getBBox();
    if(input.document.version!==2)throw new Error('Expected typed fixture');
    const source=input.document.views.dense;
    const rect=(el:Element)=>({x:Number(el.getAttribute('x')??0),y:Number(el.getAttribute('y')??0),width:Number(el.getAttribute('width')),height:Number(el.getAttribute('height'))});
    const scene:LayoutScene={
      nodes:[...view.svg.querySelectorAll<SVGGElement>('[data-node-id]')].map(el=>{
        const id=el.dataset.nodeId!,m=el.transform.baseVal.consolidate()!.matrix,box=rect(el.querySelector('.node-body')!);
        return {...box,id,x:box.x+m.e,y:box.y+m.f,groupId:source.groups?.find(g=>g.nodeIds.includes(id))?.id};
      }),
      groups:[...view.svg.querySelectorAll('[data-group-id]')].map(el=>{
        const id=el.getAttribute('data-group-id')!,b=el.querySelector<SVGTextElement>('.group-label')!.getBBox();
        return {...rect(el.querySelector('.group-body')!),id,parentId:source.groups?.find(g=>g.id===id)?.parentId,header:{x:b.x,y:b.y,width:b.width,height:b.height}};
      }),
      edges:[...view.svg.querySelectorAll('[data-edge-id]')].map(el=>{
        const id=el.getAttribute('data-edge-id')!,meta=source.edges.find(e=>e.id===id)!;
        return {...meta,paths:[...el.querySelectorAll<SVGPathElement>('.edge-path')].map(p=>{const n=p.getAttribute('d')!.match(/-?\d+(?:\.\d+)?/g)!.map(Number);return Array.from({length:n.length/2},(_,i)=>({x:n[i*2],y:n[i*2+1]}));}),labels:[...el.querySelectorAll('.edge-label-background')].map(b=>({...rect(b),text:meta.label??'',lines:[]}))};
      }),
    };
    return {length,turns:numbers.length/2-2,hits,nodeCount:view.svg.querySelectorAll('[data-node-id]').length,summary:view.svg.querySelector('[data-node-id="orders"] .node-summary')!.textContent,
      scene,inside:content.x>=view.bounds.x && content.y>=view.bounds.y && content.x+content.width<=view.bounds.x+view.bounds.width && content.y+content.height<=view.bounds.y+view.bounds.height,xml:DiagramCompiler.exportSvg(view)};
  },input);
  expect(result.nodeCount).toBe(18);expect(result.turns).toBeLessThanOrEqual(2);expect(result.length).toBeLessThan(1500);expect(result.hits).toBe(false);expect(result.inside).toBe(true);expect(result.summary).toMatch(/…$/);expect(result.xml).toContain('Order accepted');
  expect(assessRoutes(result.scene).overlaps).toBe(0);
  await page.screenshot({path:info.outputPath('architecture-dense.png')});
});
