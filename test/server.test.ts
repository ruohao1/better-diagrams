import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rename, rm, mkdir, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readProject } from '../src/project.ts';
import { startDev } from '../src/server.ts';

test('server streams replacements/errors, saves safely and rejects foreign or oversized writes', async () => {
  const dir=await mkdtemp(join(tmpdir(),'diagram-server-'));
  const input=await readProject('examples/skill-install');await cp('examples/skill-install/templates',join(dir,'templates'),{recursive:true});await writeFile(join(dir,'diagram.json'),JSON.stringify(input.document));
  const server=await startDev(dir,{port:0,editorJs:''});
  const controller=new AbortController();
  try {
    const html=await (await fetch(server.url)).text();
    const payload=JSON.parse(html.match(/<script id="diagram-data" type="application\/json">([^<]*)<\/script>/)![1]);
    const headers={'content-type':'application/json','origin':server.url,'x-diagram-token':payload.token};
    const before=await (await fetch(server.url+'/api/project')).json();
    const stream=await fetch(server.url+'/api/events',{signal:controller.signal});const reader=stream.body!.getReader();let buffer='';
    async function until(predicate:(data:any)=>boolean,stage:string):Promise<any> {
      const timeout=AbortSignal.timeout(5000);
      const observed:string[]=[];
      while(!timeout.aborted){
        const read=await Promise.race([reader.read(),new Promise<never>((_,reject)=>timeout.addEventListener('abort',()=>reject(new Error('SSE timeout at '+stage+': '+observed.join(', '))),{once:true}))]);
        if(read.done)throw new Error('SSE closed');buffer+=new TextDecoder().decode(read.value);
        let end:number;
        while((end=buffer.indexOf('\n\n'))>=0){const event=buffer.slice(0,end);buffer=buffer.slice(end+2);const dataLine=event.split('\n').find(line=>line.startsWith('data:'));if(dataLine){const data=JSON.parse(dataLine.slice(5));observed.push(data.type+':'+(data.snapshot?.document.title ?? data.message));if(predicate(data))return data;}}
      }throw new Error('SSE timeout');
    }
    await until(data=>data.type==='snapshot','initial');
    await mkdir(join(dir,'logos'));
    await writeFile(join(dir,'logos/service.svg'),'<svg viewBox="0 0 16 16"/>');
    const logoAdded=await until(data=>data.snapshot?.logos?.service,'logo directory creation');
    assert.equal(logoAdded.snapshot.documentRevision,before.documentRevision);
    await writeFile(join(dir,'logos/replacement.tmp'),'<svg viewBox="0 0 32 32"/>');
    await rename(join(dir,'logos/replacement.tmp'),join(dir,'logos/service.svg'));
    const logoChanged=await until(data=>data.snapshot?.logos?.service?.includes('32'),'atomic logo replacement');
    assert.ok(logoChanged.snapshot.sequence>logoAdded.snapshot.sequence);
    await rm(join(dir,'logos/service.svg'));
    const logoRemoved=await until(data=>data.snapshot?.logos && !data.snapshot.logos.service,'logo deletion');
    assert.ok(logoRemoved.snapshot.sequence>logoChanged.snapshot.sequence);
    const changed=structuredClone(input.document);changed.title='Changed externally';
    await writeFile(join(dir,'replacement.json'),JSON.stringify(changed));await rename(join(dir,'replacement.json'),join(dir,'diagram.json'));
    const event=await until(data=>data.snapshot?.document.title==='Changed externally','replacement');assert.ok(event.snapshot.sequence>before.sequence);
    const externalBytes=await readFile(join(dir,'diagram.json'),'utf8');
    const stale=await fetch(server.url+'/api/document',{method:'PUT',headers,body:JSON.stringify({document:input.document,expectedDocumentRevision:before.documentRevision})});
    assert.equal(stale.status,409);assert.equal(await readFile(join(dir,'diagram.json'),'utf8'),externalBytes);
    const foreign=await fetch(server.url+'/api/document',{method:'PUT',headers:{...headers,origin:'https://example.invalid'},body:'{}'});assert.equal(foreign.status,403);
    const missingToken=await fetch(server.url+'/api/document',{method:'PUT',headers:{'content-type':'application/json'},body:'{}'});assert.equal(missingToken.status,403);
    const huge=await fetch(server.url+'/api/document',{method:'PUT',headers,body:' '.repeat(2*1024*1024+1)});assert.equal(huge.status,413);
    await writeFile(join(dir,'diagram.json'),'{broken');await until(data=>data.type==='error','invalid source');
    assert.equal((await (await fetch(server.url+'/api/project')).json()).document.title,'Changed externally');
    await writeFile(join(dir,'diagram.json'),externalBytes);await until(data=>data.snapshot?.document.title==='Changed externally','recovery');
    const current=await (await fetch(server.url+'/api/project')).json();changed.title='Saved from browser';
    const saved=await fetch(server.url+'/api/document',{method:'PUT',headers,body:JSON.stringify({document:changed,expectedDocumentRevision:current.documentRevision})});
    assert.equal(saved.status,200);assert.equal((await readProject(dir)).document.title,'Saved from browser');
    await reader.cancel();
  } finally {controller.abort();await server.close();await rm(dir,{recursive:true,force:true});}
});
