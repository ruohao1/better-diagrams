import type { ProjectInput } from './model.ts';

export function buildStandaloneHtml(input: ProjectInput, viewerJs: string): string {
  return buildPage(input.document.title,input,viewerJs,"'none'");
}

export function buildEditorHtml(editorJs:string,token:string):string {
  return buildPage('Better Diagrams — editor',{token},editorJs,"'self'");
}

function buildPage(pageTitle:string,payload:unknown,bundle:string,connect:string):string {
  const data=JSON.stringify(payload).replaceAll('<','\\u003c');
  const title=pageTitle.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:; font-src data:; connect-src '+connect+'">'+
    '<title>'+title+'</title><style>body{margin:0;background:#f6f7fa}</style></head><body><main id="app"></main>'+
    '<script id="diagram-data" type="application/json">'+data+'</script><script>'+bundle.replace(/<\/script/gi,'<\\/script')+'</script></body></html>';
}
