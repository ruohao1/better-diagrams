import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {readProject} from '../../src/project.ts';

declare global {var DiagramExport:typeof import('../../src/browser/export.ts');}
const svg=(bounds:string)=>'<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+bounds+'"><rect x="-4" y="7" width="1000000000" height="1000000000" fill="#d50068"/></svg>';

test.beforeAll(async()=>{await build({entryPoints:['src/browser/export.ts'],outfile:'dist/test/export.js',bundle:true,format:'iife',globalName:'DiagramExport',platform:'browser'});});
test.beforeEach(async({page,context})=>{
  await context.setOffline(true);
  await page.setContent('<meta http-equiv="Content-Security-Policy" content="default-src \'none\';script-src \'unsafe-inline\';style-src \'unsafe-inline\';img-src data:;font-src data:;connect-src \'none\'"><style>body{margin:0}svg.diagram{display:block}</style><main id="stage"></main>');
  await page.addScriptTag({content:await readFile('dist/test/export.js','utf8')});
});

test('encodes PNG at twice the diagram bounds and preserves its viewBox origin',async({page})=>{
  const result=await page.evaluate(async source=>{
    const blob=await DiagramExport.exportPng(source),bytes=new Uint8Array(await blob.arrayBuffer()),bitmap=await createImageBitmap(blob);
    const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
    const context=canvas.getContext('2d')!;context.drawImage(bitmap,0,0);
    const result={type:blob.type,signature:[...bytes.slice(0,8)],width:bitmap.width,height:bitmap.height,pixel:[...context.getImageData(10,5,1,1).data]};bitmap.close();return result;
  },svg('-4 7 10.75 5.25'));
  expect(result).toEqual({type:'image/png',signature:[137,80,78,71,13,10,26,10],width:21,height:10,pixel:[213,0,104,255]});
});

test('bounds decoder and canvas dimensions for large, narrow, and subpixel diagrams',async({page})=>{
  const result=await page.evaluate(async()=>{
    const decode=HTMLImageElement.prototype.decode,decoded:{width:string|null;height:string|null;viewBox:string|null}[]=[];
    HTMLImageElement.prototype.decode=function(){
      const source=new DOMParser().parseFromString(decodeURIComponent(this.src.slice(this.src.indexOf(',')+1)),'image/svg+xml').documentElement;
      decoded.push({width:source.getAttribute('width'),height:source.getAttribute('height'),viewBox:source.getAttribute('viewBox')});return decode.call(this);
    };
    const sizes=[];
    for(const bounds of ['0 0 10000 10000','0 0 1000000000 1','0 0 1 1000000000','0 0 .1 .2']){
      const blob=await DiagramExport.exportPng('<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+bounds+'"/>'),image=await createImageBitmap(blob);
      sizes.push([image.width,image.height]);image.close();
    }
    return {sizes,decoded};
  });
  expect(result.sizes).toEqual([[4096,4096],[8192,1],[1,8192],[1,1]]);
  expect(result.decoded).toEqual([
    {width:'4096',height:'4096',viewBox:'0 0 10000 10000'},
    {width:'8192',height:'1',viewBox:'0 0 1000000000 1'},
    {width:'1',height:'8192',viewBox:'0 0 1 1000000000'},
    {width:'1',height:'1',viewBox:'0 0 .1 .2'},
  ]);
});

test('rejects malformed SVG and invalid bounds before decoding',async({page})=>{
  const result=await page.evaluate(async()=>{
    let decoded=0;HTMLImageElement.prototype.decode=async function(){decoded++;};
    const results=[];
    const sources=['<svg','<html/>',...['','0 0 0 1','0 0 1 -1','0 0 Infinity 2','NaN 0 1 2','0 0 1','0 0 1 2 3'].map(bounds=>'<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+bounds+'"/>')];
    for(const source of sources){try{await DiagramExport.exportPng(source);results.push('accepted');}catch(error){results.push(String(error));}}
    return {results,decoded};
  });
  expect(result.results).toHaveLength(9);for(const error of result.results)expect(error).toMatch(/SVG|bounds/);expect(result.decoded).toBe(0);
});

for(const failure of ['decode','allocation','context','draw','null blob','encode'])test('releases raster resources and can retry after '+failure+' failure',async({page})=>{
  const result=await page.evaluate(async({failure,source})=>{
    const images:HTMLImageElement[]=[],canvases=new Set<HTMLCanvasElement>();let fail=true;
    const decode=HTMLImageElement.prototype.decode,getContext=HTMLCanvasElement.prototype.getContext,draw=CanvasRenderingContext2D.prototype.drawImage,toBlob=HTMLCanvasElement.prototype.toBlob;
    const width=Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype,'width')!;
    HTMLImageElement.prototype.decode=function(){images.push(this);return fail && failure==='decode'?Promise.reject(new Error('decode failed')):decode.call(this);};
    Object.defineProperty(HTMLCanvasElement.prototype,'width',{...width,set(this:HTMLCanvasElement,value:number){canvases.add(this);if(fail && failure==='allocation' && value)throw new Error('allocation failed');width.set!.call(this,value);}});
    Object.defineProperty(HTMLCanvasElement.prototype,'getContext',{value:function(this:HTMLCanvasElement,...args:unknown[]){return fail && failure==='context'?null:Reflect.apply(getContext,this,args);}});
    Object.defineProperty(CanvasRenderingContext2D.prototype,'drawImage',{value:function(this:CanvasRenderingContext2D,...args:unknown[]){if(fail && failure==='draw')throw new Error('draw failed');return Reflect.apply(draw,this,args);}});
    HTMLCanvasElement.prototype.toBlob=function(callback,...args){if(fail && failure==='null blob'){callback(null);return;}if(fail && failure==='encode')throw new Error('encode failed');toBlob.call(this,callback,...args);};
    let error='';try{await DiagramExport.exportPng(source);}catch(reason){error=String(reason);}
    const released={images:images.map(image=>image.getAttribute('src')),canvases:[...canvases].map(canvas=>[canvas.width,canvas.height])};
    fail=false;const blob=await DiagramExport.exportPng(source);
    return {error,released,retried:blob.type,allReleased:images.every(image=>!image.hasAttribute('src')) && [...canvases].every(canvas=>canvas.width===0 && canvas.height===0)};
  },{failure,source:svg('0 0 10 10')});
  expect(result.error).not.toBe('');expect(result.released.images).toEqual([null]);
  expect(result.released.canvases.every(size=>size[0]===0 && size[1]===0)).toBe(true);
  expect(result.retried).toBe('image/png');expect(result.allReleased).toBe(true);
});

test('preserves real embedded glyphs, Unicode, logo, theme, local gradient and clipping pixels',async({page},info)=>{
  const directory='node_modules/playwright-core/lib/vite/traceViewer',name=(await readdir(directory)).find(name=>/^codicon\..*\.ttf$/.test(name))!;
  const font=(await readFile(join(directory,name))).toString('base64'),input=await readProject('examples/architecture-small');
  if(input.document.version!==2)throw new Error('Expected typed source');
  Object.assign(input.document.views.small,{nodeIds:['orders'],edges:[],groups:[],legend:false});
  Object.assign(input.document.nodes.orders,{label:'\uea60\uea61',summary:'Café Δ →',template:'probe',appearance:{background:'#e7f6ef',border:'#0d725e'}});
  delete input.document.nodes.orders.childViewId;
  input.templates.probe='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 252 136"><defs><linearGradient id="color"><stop offset="0" stop-color="#ff8f00"/><stop offset="1" stop-color="#7b1fa2"/></linearGradient><clipPath id="clip"><path d="M20 94H232V120H46Z"/></clipPath></defs><rect class="node-body" width="252" height="136" rx="12"/><text class="node-label" x="64" y="46" data-field="label"/><text class="node-summary" x="20" y="76" data-field="summary"/><rect class="probe-gradient" x="20" y="94" width="212" height="26" fill="url(#color)" clip-path="url(#clip)"/><circle class="probe-variable" cx="226" cy="66" r="8"/></svg>';
  input.themeCss='@font-face{font-family:DiagramProbe;src:url(data:font/ttf;base64,'+font+')} @font-face{font-family:bd-font-1;unicode-range:U+E000-E001;src:url(data:font/ttf;base64,'+font+')} .diagram{--diagram-font:DiagramProbe;--probe-ink:#2636d9;--probe-canvas:#f8edff;--probe-variable:#d50068;font-family:var(--diagram-font)} .canvas-background{fill:var(--probe-canvas)} .node-label{font-size:32px;font-weight:400;fill:var(--probe-ink)} .node-summary{font-size:16px} .probe-variable{fill:var(--probe-variable)}';
  const remote:string[]=[];page.on('request',request=>{if(/^https?:/.test(request.url()))remote.push(request.url());});
  await page.addScriptTag({content:await readFile('dist/test/compiler.js','utf8')});
  const rendered=await page.evaluate(async input=>{
    const view=await DiagramCompiler.compileView(input,'small',document.querySelector<HTMLElement>('#stage')!);
    view.svg.style.width=Math.floor(view.bounds.width*2)+'px';view.svg.style.height=Math.floor(view.bounds.height*2)+'px';document.querySelector('#stage')!.append(view.svg);
    const label=view.svg.querySelector('.node-label')!,loaded=(await document.fonts.load('32px '+getComputedStyle(label).fontFamily,'\uea60\uea61')).length;
    const regions=Object.fromEntries(Object.entries({glyph:'.node-label',unicode:'.node-summary',logo:'[data-logo]',gradient:'.probe-gradient',cssVariable:'.probe-variable'}).map(([name,selector])=>{const r=view.svg.querySelector(selector)!.getBoundingClientRect();return [name,{x:Math.floor(r.x),y:Math.floor(r.y),width:Math.ceil(r.width),height:Math.ceil(r.height)}];}));
    const blob=await DiagramExport.exportPng(DiagramCompiler.exportSvg(view));
    const png=await new Promise<string>(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.readAsDataURL(blob);});
    return {loaded,regions,png};
  },input);
  expect(rendered.loaded).toBeGreaterThan(0);
  const live=await page.locator('svg.diagram').screenshot({path:info.outputPath('live-svg.png')});
  await page.locator('.node-label').evaluate(el=>(el as SVGElement).style.setProperty('font-family','MissingExportFont','important'));
  const fallback=await page.locator('svg.diagram').screenshot({path:info.outputPath('missing-font-control.png')});
  const metrics=await page.evaluate(async({live,fallback,png,regions})=>{
    const pixels=async(source:string)=>{const image=new Image();image.src=source;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const context=canvas.getContext('2d')!;context.drawImage(image,0,0);return {width:canvas.width,data:context.getImageData(0,0,canvas.width,canvas.height).data};};
    const reference=await pixels(live),native=await pixels(png),missing=await pixels(fallback);
    const results:Record<string,{changed:number;ink:number;missingDifference:number;max:number}>= {};
    for(const [name,r] of Object.entries(regions)){
      let changed=0,ink=0,missingDifference=0,max=0;
      for(let y=r.y;y<r.y+r.height;y++)for(let x=r.x;x<r.x+r.width;x++){
        const i=(y*reference.width+x)*4;let delta=0,missingDelta=0;
        for(let c=0;c<4;c++){delta=Math.max(delta,Math.abs(reference.data[i+c]-native.data[i+c]));missingDelta=Math.max(missingDelta,Math.abs(reference.data[i+c]-missing.data[i+c]));}
        if(delta>20)changed++;max=Math.max(max,delta);if(missingDelta>20)missingDifference++;
        if(reference.data[i+2]>140 && reference.data[i]<120 && reference.data[i+1]<130)ink++;
      }
      results[name]={changed,ink,missingDifference,max};
    }
    const sample=(x:number,y:number)=>[...native.data.slice((y*native.width+x)*4,(y*native.width+x)*4+4)];
    return {regions:results,colors:{background:sample(0,0),appearance:sample(300,200),border:sample(56,200),variable:sample(508,188)}};
  },{live:'data:image/png;base64,'+live.toString('base64'),fallback:'data:image/png;base64,'+fallback.toString('base64'),png:rendered.png,regions:rendered.regions});
  await info.attach('native-png',{body:Buffer.from(rendered.png.split(',')[1],'base64'),contentType:'image/png'});
  expect(metrics.regions.glyph.ink).toBeGreaterThan(100);expect(metrics.regions.glyph.missingDifference).toBeGreaterThan(100);expect(metrics.regions.glyph.changed).toBe(0);
  for(const name of ['logo','gradient','cssVariable'])expect(metrics.regions[name].changed,name).toBe(0);
  // SVG image text antialiasing differs from document text; missing or substituted glyphs exceed this bound.
  expect(metrics.regions.unicode.max).toBeLessThan(80);expect(remote).toEqual([]);
  expect(metrics.colors).toEqual({background:[248,237,255,255],appearance:[231,246,239,255],border:[13,114,94,255],variable:[213,0,104,255]});
});
