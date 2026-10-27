import {test,expect} from '@playwright/test';
import {readProject} from '../../src/project.ts';

test.beforeEach(async({page})=>{
  await page.setContent('<main id="stage" style="width:1400px;height:850px"></main>');await page.addScriptTag({path:'dist/test/compiler.js'});
});

test('the shipped flowchart fits wider fallback fonts',async({page})=>{
  const input=await readProject('examples/order-flow');input.themeCss+='\n.diagram { font-family: monospace; }';
  const labels=await page.evaluate(async input=>{
    const labels:string[]=[];
    for(const viewId of Object.keys(input.document.views)){
      const view=await DiagramCompiler.compileView(input,viewId,document.getElementById('stage')!);
      labels.push(...[...view.svg.querySelectorAll('[data-node-id]')].map(node=>node.getAttribute('aria-label')!));
    }
    return labels;
  },input);
  expect(labels.sort()).toEqual(Object.values(input.document.nodes).map(node=>node.label).sort());
});

for(const direction of ['down','right'] as const)test('keeps the declared '+direction+' main path straight and retry clear',async({page},info)=>{
  const input=await readProject('examples/order-flow');
  const result=await page.evaluate(async({input,direction})=>{
    if(input.document.version!==2)throw new Error('Expected typed source');const source=input.document.views.flow;if(source.type!=='flowchart')throw new Error('Expected flowchart');source.direction=direction;
    const original=JSON.stringify(source.mainPath),view=await DiagramCompiler.compileView(input,'flow',document.getElementById('stage')!);document.getElementById('stage')!.append(view.svg);
    const boxes=new Map([...view.svg.querySelectorAll<SVGGElement>('[data-node-id]')].map(el=>{const m=el.transform.baseVal.consolidate()!.matrix,body=el.querySelector<SVGGraphicsElement>('.node-body')!,b=body.getBBox();return [el.dataset.nodeId!,{x:m.e+b.x,y:m.f+b.y,width:b.width,height:b.height,tag:body.localName,rx:body.getAttribute('rx')}];}));
    const ids=[source.edges.find(e=>e.id===source.mainPath[0])!.source,...source.mainPath.map(id=>source.edges.find(e=>e.id===id)!.target)];
    const centers=ids.map(id=>{const b=boxes.get(id)!;return direction==='down'?b.x+b.width/2:b.y+b.height/2;});
    const retry=view.svg.querySelector('[data-edge-id="wait-stock"] .edge-path')!.getAttribute('d')!.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    const hits=(b:{x:number;y:number;width:number;height:number})=>Array.from({length:retry.length/2-1},(_,i)=>{const [ax,ay,bx,by]=retry.slice(i*2,i*2+4);return ax===bx?ax>b.x+.01 && ax<b.x+b.width-.01 && Math.max(ay,by)>b.y+.01 && Math.min(ay,by)<b.y+b.height-.01:ay>b.y+.01 && ay<b.y+b.height-.01 && Math.max(ax,bx)>b.x+.01 && Math.min(ax,bx)<b.x+b.width-.01;}).some(Boolean);
    const outside:string[]=[];
    for(const id of ['stock','paid']){const el=view.svg.querySelector('[data-node-id="'+id+'"]')!,b=el.querySelector<SVGGraphicsElement>('.node-body')!.getBBox();for(const t of el.querySelectorAll<SVGTSpanElement>('.node-label tspan')){const r=t.getBBox();for(const [x,y] of [[r.x,r.y],[r.x+r.width,r.y],[r.x,r.y+r.height],[r.x+r.width,r.y+r.height]])if(Math.abs((x-b.width/2)/(b.width/2))+Math.abs((y-b.height/2)/(b.height/2))>1.001)outside.push(id);}}
    return {spread:Math.max(...centers)-Math.min(...centers),unchanged:JSON.stringify(source.mainPath)===original,boxes:Object.fromEntries(boxes),retryHits:[...boxes.values()].some(hits),outside,normalLabels:[...view.svg.querySelectorAll('[data-edge-kind="next"] .edge-label')].map(e=>e.textContent),labels:[...view.svg.querySelectorAll('.edge-label')].map(e=>e.textContent),bounds:view.bounds};
  },{input,direction});
  expect(result.spread).toBeLessThanOrEqual(1);expect(result.unchanged).toBe(true);expect(result.retryHits).toBe(false);expect(result.outside).toEqual([]);expect(result.normalLabels).toEqual([]);
  expect(result.boxes.stock).toMatchObject({width:174,height:108,tag:'polygon'});expect(result.boxes.reserve).toMatchObject({width:222,height:84,tag:'rect'});expect(result.boxes.start).toMatchObject({width:154,height:48,tag:'rect',rx:'24'});
  expect(result.labels).toContain('Yes');expect(result.labels).toContain('No');expect(result.labels).toContain('Retry');
  await page.screenshot({path:info.outputPath('flow-'+direction+'.png')});
});

test('supports labeled errors and jumps, fragments, empty views, and clear title errors',async({page})=>{
  const input=await readProject('examples/order-flow');
  const result=await page.evaluate(async input=>{
    if(input.document.version!==2)throw new Error('Expected typed source');const source=input.document.views.flow;if(source.type!=='flowchart')throw new Error('Expected flowchart');
    source.edges.find(e=>e.id==='stock-wait')!.kind='jump';source.edges.find(e=>e.id==='paid-declined')!.kind='error';
    input.document.nodes.isolated={label:'Disconnected',summary:'',details:''};source.nodeIds.push('isolated');source.stepKinds.isolated='action';
    const host=document.getElementById('stage')!,view=await DiagramCompiler.compileView(input,'flow',host);
    input.document.views.empty={type:'flowchart',title:'Empty',detailLevel:'Steps',nodeIds:[],edges:[],mainPath:[],stepKinds:{}};
    const empty=await DiagramCompiler.compileView(input,'empty',host);
    input.document.nodes.start.label='日本語🧭 '.repeat(100);let error='';try{await DiagramCompiler.compileView(input,'flow',host);}catch(e){error=String(e);}
    return {jump:view.svg.querySelector('[data-edge-kind="jump"] .edge-label')?.textContent,errorLabel:view.svg.querySelector('[data-edge-kind="error"] .edge-label')?.textContent,isolated:!!view.svg.querySelector('[data-node-id="isolated"]'),empty:empty.bounds,error};
  },input);
  expect(result.jump).toBe('No');expect(result.errorLabel).toBe('No');expect(result.isolated).toBe(true);expect(result.empty.width).toBeGreaterThan(0);expect(result.error).toMatch(/start.*Title/);
});
