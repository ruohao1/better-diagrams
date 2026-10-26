type LoadedFamily={name:string;ready:Promise<void>};
// shortcut: cache distinct font definitions for this document; add eviction for frequent font-asset replacement.
const families=new Map<string,LoadedFamily>(),scopes=new WeakMap<SVGElement,Map<string,string>>();
let nextFamily=0;
const familyKey=(value:string)=>value.trim().replace(/^(['"])(.*)\1$/,'$2').toLowerCase();

export async function installFonts(css:string,root:SVGSVGElement):Promise<string> {
  const sheet=new CSSStyleSheet();sheet.replaceSync(css);
  const groups=new Map<string,CSSFontFaceRule[]>();
  const visit=(rules:CSSRuleList):void=>{
    for(const rule of rules){
      if(rule instanceof CSSFontFaceRule){const family=familyKey(rule.style.getPropertyValue('font-family'));if(!family)throw new Error('Font face needs a family');const list=groups.get(family)??[];list.push(rule);groups.set(family,list);}
      else if('cssRules' in rule)visit((rule as CSSGroupingRule).cssRules);
    }
  };visit(sheet.cssRules);
  if(!groups.size)return css;
  const names=new Map<string,string>();
  for(const [family,rules] of groups){
    const key=JSON.stringify([...groups.keys()].sort())+rules.map(rule=>rule.cssText).join('\n');let loaded=families.get(key);
    if(!loaded){
      let name:string;do{name='bd-font-'+(++nextFamily);}while(groups.has(name));
      const faces=rules.map(rule=>{const s=rule.style;return new FontFace(name,s.getPropertyValue('src'),{
        style:s.getPropertyValue('font-style')||'normal',weight:s.getPropertyValue('font-weight')||'normal',stretch:s.getPropertyValue('font-stretch')||'normal',
        unicodeRange:s.getPropertyValue('unicode-range')||'U+0-10FFFF',featureSettings:s.getPropertyValue('font-feature-settings')||'normal',variationSettings:s.getPropertyValue('font-variation-settings')||'normal',
      });});
      loaded={name,ready:Promise.all(faces.map(face=>face.load())).then(()=>{for(const face of faces)document.fonts.add(face);}).catch(error=>{throw new Error('Unable to load font '+family+': '+String(error));})};families.set(key,loaded);
    }
    await loaded.ready;names.set(family,loaded.name);
    for(const rule of rules)rule.style.setProperty('font-family',loaded.name);
  }
  scopes.set(root,names);return [...sheet.cssRules].map(rule=>rule.cssText).join('\n');
}

export function applyFonts(element:SVGElement):void {
  let owner:Element|null=element,names:Map<string,string>|undefined;
  while(owner && !names){if(owner instanceof SVGElement)names=scopes.get(owner);owner=owner.parentElement;}
  if(!names)return;
  const texts:SVGElement[]=[...element.querySelectorAll<SVGElement>('text,tspan')];if(element.localName==='text'||element.localName==='tspan')texts.unshift(element);
  for(const text of texts){
    const current=getComputedStyle(text).fontFamily;
    const parts=current.match(/(?:[^,"']|"[^"]*"|'[^']*')+/g)??[];
    const replaced=parts.map(part=>names!.get(familyKey(part))??part.trim()).join(', ');
    if(replaced!==current)text.style.setProperty('font-family',replaced,'important');
  }
}
