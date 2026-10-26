import type { DiagramNode } from '../model.ts';

const NS='http://www.w3.org/2000/svg';
const tags=new Set(['svg','g','rect','circle','ellipse','path','line','polyline','polygon','text','tspan','defs','clipPath','linearGradient','radialGradient','stop','title','desc']);
const attributes=new Set(('id class viewBox width height x y x1 x2 y1 y2 cx cy r rx ry d points transform fill fill-opacity fill-rule stroke stroke-width stroke-linecap stroke-linejoin stroke-opacity stroke-dasharray stroke-dashoffset clip-path clip-rule opacity font-family font-size font-weight font-style letter-spacing text-anchor dominant-baseline dy dx gradientUnits gradientTransform spreadMethod offset stop-color stop-opacity clipPathUnits preserveAspectRatio vector-effect textLength lengthAdjust data-field aria-hidden role href').split(' '));

// shortcut: CSS escapes and image functions are rejected; add a CSS parser if themes need them.
export function validateTheme(css:string):void {
  const clean=css.replace(/\/\*[\s\S]*?\*\//g,'');
  if(/\\|@import|@namespace|https?:|file:|javascript:|blob:|\/\/|\b(?:image-set|image|cross-fade|paint|element)\s*\(/i.test(clean))throw new Error('Stylesheet must use self-contained resources; imports, escapes and remote resources are unsupported');
  for(const match of clean.matchAll(/url\s*\(\s*([^)]*)\)/gi)){
    const value=match[1].trim().replace(/^(['"])(.*)\1$/,'$2');
    if(!/^#[A-Za-z][A-Za-z0-9_-]*$/.test(value) && !/^data:(?:font\/(?:woff2?|ttf|otf)|image\/(?:png|jpeg|gif|webp));base64,[A-Za-z0-9+/=\s]+$/i.test(value))throw new Error('Stylesheet URL must be a local fragment or supported base64 data asset');
  }
  if(/url\s*\(/i.test(clean.replace(/url\s*\([^)]*\)/gi,'')))throw new Error('Invalid stylesheet URL');
}

function parseInertSvg(template: string, scope: string): SVGSVGElement {
  if(/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(template))throw new Error('Unsafe SVG document directive');
  const doc = new DOMParser().parseFromString(template, 'image/svg+xml');
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg') throw new Error('Invalid SVG asset: ' + scope);
  const svg = document.importNode(doc.documentElement, true) as unknown as SVGSVGElement;
  const viewBox=svg.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if(!viewBox || viewBox.length!==4 || !viewBox.every(Number.isFinite) || viewBox[2]<=0 || viewBox[3]<=0)throw new Error('SVG template needs a finite positive viewBox');
  const elements=[svg,...svg.querySelectorAll('*')];
  const ids=new Map<string,string>();
  for(const el of elements){
    if(el.namespaceURI!==NS || !tags.has(el.localName))throw new Error('Unsafe SVG element: '+el.localName);
    for(const attr of [...el.attributes]){
      if(attr.name==='xmlns' && attr.value===NS)continue;
      if(attr.name==='xmlns:xlink' && attr.value==='http://www.w3.org/1999/xlink')continue;
      if(!attributes.has(attr.localName) || attr.localName.toLowerCase().startsWith('on'))throw new Error('Unsafe SVG attribute: '+attr.name);
      if(/\\|https?:|javascript:|file:|data:|\/\//i.test(attr.value))throw new Error('SVG template contains an unsupported remote or active resource');
    }
    const id=el.getAttribute('id');
    if(id){
      if(!/^[A-Za-z][A-Za-z0-9_-]*$/.test(id)||ids.has(id))throw new Error('Invalid or duplicate SVG identifier');
      ids.set(id,scopeId(scope,id));
    }
  }
  const reference=(id:string):string=>{const replacement=ids.get(id);if(!replacement)throw new Error('Missing SVG local reference: '+id);return replacement;};
  for(const el of elements){
    if(el.id)el.id=reference(el.id);
    for(const attr of [...el.attributes]){
      if(attr.localName==='href'){
        if(!/^#[A-Za-z][A-Za-z0-9_-]*$/.test(attr.value))throw new Error('SVG href must be a local reference');
        attr.value='#'+reference(attr.value.slice(1));
      }else if(/url\s*\(/i.test(attr.value)){
        const match=attr.value.match(/^url\(\s*['"]?#([A-Za-z][A-Za-z0-9_-]*)['"]?\s*\)$/i);
        if(!match)throw new Error('SVG template URL must be a local fragment');
        attr.value='url(#'+reference(match[1])+')';
      }
    }
  }
  if(viewBox[0]!==0 || viewBox[1]!==0){const group=document.createElementNS(NS,'g');group.setAttribute('transform','translate('+(-viewBox[0])+','+(-viewBox[1])+')');group.append(...svg.childNodes);svg.append(group);}
  svg.setAttribute('viewBox','0 0 '+viewBox[2]+' '+viewBox[3]);svg.setAttribute('width',String(viewBox[2]));svg.setAttribute('height',String(viewBox[3]));svg.style.overflow='visible';
  return svg;
}

export function scopeId(...parts:string[]):string {return 'bd-'+parts.map(part=>part.length+'-'+part).join('-');}

export function instantiateLogo(template:string,scope:string):SVGSVGElement {return parseInertSvg(template,scope);}

export function instantiateNode(template: string, scope: string, node: DiagramNode): SVGSVGElement {
  const svg=parseInertSvg(template,scope);
  for (const slot of svg.querySelectorAll('[data-field]')) {
    const field = slot.getAttribute('data-field');
    if(!['text','tspan'].includes(slot.localName) || !field || (!['label','summary'].includes(field) && !/^data\.[A-Za-z][A-Za-z0-9_-]*$/.test(field)))throw new Error('Invalid SVG text slot');
    const key=field.slice(5);
    slot.textContent = field === 'label' ? node.label : field === 'summary' ? ('summary' in node ? node.summary : '') : node.data && Object.hasOwn(node.data,key) ? node.data[key] : '';
  }
  return svg;
}
