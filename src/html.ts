import type { ProjectInput } from './model.ts';

export function buildStandaloneHtml(input: ProjectInput, viewerJs: string): string {
  const data=JSON.stringify(input).replaceAll('<','\\u003c');
  const title=input.document.title.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:; font-src data:; connect-src \'none\'">'+
    '<title>'+title+'</title><style>body{margin:0;background:#f6f7fa}</style></head><body><main id="app"></main>'+
    '<script id="diagram-data" type="application/json">'+data+'</script><script>'+viewerJs.replace(/<\/script/gi,'<\\/script')+'</script></body></html>';
}
