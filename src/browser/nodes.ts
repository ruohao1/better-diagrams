import type {ProjectInput,RenderDocument} from '../model.ts';
import type {Rect,Size} from './geometry.ts';
import defaultNode from './default-node.svg';
import {instantiateLogo,instantiateNode,scopeId} from './templates.ts';

const NS='http://www.w3.org/2000/svg';
export function element<K extends keyof SVGElementTagNameMap>(tag:K,attributes:Record<string,string|number>={},text?:string):SVGElementTagNameMap[K] {
  const node=document.createElementNS(NS,tag);
  for(const [key,value] of Object.entries(attributes))node.setAttribute(key,String(value));
  if(text!==undefined)node.textContent=text;
  return node;
}
export function wrapText(text:SVGTextElement,value:string,width:number):string[] {
  const lines:string[]=[];let line='';
  const fits=(value:string)=>{text.textContent=value;return text.getComputedTextLength()<=width;};
  for(const word of value.trim().split(/\s+/).filter(Boolean)){
    if(line && !fits(line+' '+word)){lines.push(line);line='';}
    if(fits(word)){line+=(line?' ':'')+word;continue;}
    for(const {segment} of new Intl.Segmenter().segment(word)){
      if(line && !fits(line+segment)){lines.push(line);line='';}line+=segment;
    }
  }
  if(line)lines.push(line);text.textContent='';return lines;
}
export async function textMetrics(text:SVGTextElement):Promise<{height:number;top:number;lineHeight:number}> {
  text.textContent='Mg';text.getBBox();await document.fonts.ready;
  const box=text.getBBox();return {height:box.height,top:box.y,lineHeight:parseFloat(getComputedStyle(text).fontSize)*1.4};
}
export function textLines(text:SVGTextElement,lines:readonly string[],x:number,baseline:number,lineHeight:number):void {
  text.replaceChildren(...lines.map((line,index)=>element('tspan',{x,y:baseline+index*lineHeight},line)));
}
function within(box:Rect,width:number,height:number):boolean {
  return box.x>=-.1 && box.y>=-.1 && box.x+box.width<=width+.1 && box.y+box.height<=height+.1;
}

export async function prepareNode(input:ProjectInput,doc:RenderDocument,viewId:string,nodeId:string,scope:string,stage:SVGElement):Promise<{svg:SVGSVGElement;bounds:Rect;size:Size}> {
  const node=doc.nodes[nodeId],view=doc.views[viewId],name=node.template??'default',custom=Object.hasOwn(input.templates,name);
  if(!custom && name!=='default')throw new Error('Unknown template: '+name);
  const presets={compact:{width:224,height:128},standard:{width:252,height:136},large:{width:288,height:152}};
  const size=presets[view.nodeSize];
  const fail=(message:string):never=>{throw new Error(nodeId+' ('+view.nodeSize+'): '+message);};
  let svg=view.legacySizing || custom ? instantiateNode(custom?input.templates[name]:defaultNode,scopeId(scope,'template'),node) : element('svg',{viewBox:`0 0 ${size.width} ${size.height}`,width:size.width,height:size.height});
  stage.append(svg);
  try {
    if(view.legacySizing){
      svg.getBBox();await document.fonts.ready;
      if(!custom){
        const text=svg.querySelector<SVGTextElement>('.node-label')!,rect=svg.querySelector<SVGRectElement>('.node-body')!;
        const lines=wrapText(text,node.label,184),lineHeight=parseFloat(getComputedStyle(text).fontSize)*1.45,height=Math.max(84,lines.length*lineHeight+36);
        textLines(text,lines,20,(height-(lines.length-1)*lineHeight)/2+lineHeight/3,lineHeight);
        rect.setAttribute('height',String(height));svg.setAttribute('viewBox','0 0 224 '+height);svg.setAttribute('height',String(height));
      }
      const box=svg.getBBox();
      if(!Number.isFinite(box.width+box.height)||box.width<=0||box.height<=0)fail('SVG template has no visible geometry');
      return {svg,bounds:box,size:{width:box.width+16,height:box.height+16}};
    }
    if(view.type!=='architecture')fail('Flowchart rendering is not yet available');
    if(custom){
      svg.getBBox();await document.fonts.ready;
      const box=svg.getBBox(),vb=svg.viewBox.baseVal;
      if(!within(box,vb.width,vb.height) || box.width<=0 || box.height<=0)fail('Custom template geometry or text exceeds its viewBox');
      const scale=Math.min(size.width/vb.width,size.height/vb.height);
      for(const text of svg.querySelectorAll('text'))if(parseFloat(getComputedStyle(text).fontSize)*scale<12)fail('Custom template text is smaller than 12 units at the selected preset');
      svg.setAttribute('width',String(size.width));svg.setAttribute('height',String(size.height));svg.style.overflow='hidden';
      const outer=element('svg',{viewBox:`0 0 ${size.width} ${size.height}`,width:size.width,height:size.height});outer.append(svg);stage.append(outer);svg=outer;
    } else {
      svg.append(element('rect',{class:'node-body',width:size.width,height:size.height,rx:11}));
    }
    const body=svg.querySelector<SVGGraphicsElement>('.node-body');
    if(node.appearance && !body)fail('Appearance requires a .node-body element in the custom template');
    if(node.appearance?.background)body!.style.fill=node.appearance.background;
    if(node.appearance?.border)body!.style.stroke=node.appearance.border;
    if(node.logo){
      if(!Object.hasOwn(input.logos,node.logo))fail('Unknown logo: '+node.logo);
      const logo=instantiateLogo(input.logos[node.logo],scopeId(scope,'logo'));logo.setAttribute('data-logo','');svg.append(logo);
      const box=logo.getBBox(),vb=logo.viewBox.baseVal;
      if(!within(box,vb.width,vb.height)||box.width<=0||box.height<=0)fail('Logo geometry exceeds its viewBox');
      for(const [key,value] of Object.entries({x:16,y:16,width:32,height:32}))logo.setAttribute(key,String(value));logo.style.overflow='hidden';
    }
    if(!custom){
      const title=element('text',{class:'node-label'});svg.append(title);
      const metrics=await textMetrics(title),x=node.logo?62:16,width=size.width-x-16-(node.childViewId?22:0),lines=wrapText(title,node.label,width);
      if(lines.length>2 || metrics.height+(lines.length-1)*metrics.lineHeight>42)fail('Title does not fit; use a concise title or a larger preset');
      textLines(title,lines,x,16-metrics.top,metrics.lineHeight);
      if(title.getBBox().width>width+.1)fail('Title does not fit the selected preset');
      const top=16+Math.max(32,metrics.height+(lines.length-1)*metrics.lineHeight)+14;
      const summary=element('text',{class:'node-summary'});svg.append(summary);
      const sm=await textMetrics(summary),summaryLines=wrapText(summary,node.summary,size.width-32);
      const maxLines=Math.min(3,Math.floor((size.height-16-top-sm.height)/sm.lineHeight)+1);
      if(node.summary && maxLines<1)fail('Summary font does not fit the selected preset');
      if(summaryLines.length>maxLines){
        summaryLines.length=maxLines;const parts=[...new Intl.Segmenter().segment(summaryLines.at(-1)!)].map(p=>p.segment);
        while(parts.length){summary.textContent=parts.join('').trimEnd()+'…';if(summary.getComputedTextLength()<=size.width-32)break;parts.pop();}
        summaryLines[maxLines-1]=parts.join('').trimEnd()+'…';
      }
      textLines(summary,summaryLines,16,top-sm.top,sm.lineHeight);
    }
    if(node.childViewId){
      const mark=element('g',{'data-internal-indicator':'','aria-hidden':'true'}),x=size.width-30;
      mark.append(element('rect',{x,y:16,width:17,height:17,rx:5,fill:'#fff',stroke:'#c7d4e5'}),element('path',{d:`M${x+5} 28l7-7m-6 0h6v6`,fill:'none',stroke:'#6883aa','stroke-width':1.3}));svg.append(mark);
    }
    if(!within(svg.getBBox(),size.width,size.height))fail('Node text or geometry exceeds the selected preset');
    return {svg,bounds:{x:0,y:0,...size},size};
  } finally {svg.remove();}
}
