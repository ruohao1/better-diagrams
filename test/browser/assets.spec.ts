import {test,expect} from '@playwright/test';
declare global { var DiagramTemplates: typeof import('../../src/browser/templates.ts'); }

test('keeps repeated inert assets local and binds summaries as text',async({page})=>{
  const remoteRequests:string[]=[];page.on('request',r=>{if(/^https?:/.test(r.url()))remoteRequests.push(r.url());});
  await page.setContent('<main></main>');await page.addScriptTag({path:'dist/test/templates.js'});
  const result=await page.evaluate(()=>{
    const template='<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 40 30"><defs><linearGradient id="c"><stop offset="0" stop-color="#abc"/></linearGradient></defs><rect x="10" y="20" width="40" height="30" fill="url(#c)"/><text data-field="summary"/></svg>';
    const first=DiagramTemplates.instantiateNode(template,'root-node-template',{label:'Node',details:'',summary:'<untrusted summary>'});
    const second=DiagramTemplates.instantiateLogo(template,'modal-node-logo');
    document.querySelector('main')!.append(first,second);
    const ids=[...document.querySelectorAll('[id]')].map(el=>el.id);
    const references=[...document.querySelectorAll('[fill]')].map(el=>el.getAttribute('fill')!).filter(v=>v.startsWith('url('));
    return {ids,references,text:first.querySelector('text')!.textContent,viewBox:first.getAttribute('viewBox')};
  });
  expect(new Set(result.ids).size).toBe(result.ids.length);
  for(const ref of result.references)expect(result.ids).toContain(ref.slice(5,-1));
  expect(result.text).toBe('<untrusted summary>');expect(result.viewBox).toBe('0 0 40 30');expect(remoteRequests).toEqual([]);
});

test('rejects active and remote logo content before attaching it',async({page})=>{
  await page.setContent('<main></main>');await page.addScriptTag({path:'dist/test/templates.js'});
  const rejected=await page.evaluate(()=>{
    const parts=['<script>globalThis.pwned=true</script>','<foreignObject/>','<rect onload="alert(1)"/>','<rect fill="url(https://example.invalid/a)"/>','<style>@import "https://example.invalid";</style>'];
    return parts.map(part=>{try{DiagramTemplates.instantiateLogo('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">'+part+'</svg>','bad');return false;}catch{return true;}});
  });
  expect(rejected).toEqual([true,true,true,true,true]);
});
