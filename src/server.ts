import { createServer } from 'node:http';
import type { ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readProject,saveDocument,watchProject } from './project.ts';
import { buildEditorHtml } from './html.ts';
import type { LiveSnapshot,ProjectEvent } from './protocol.ts';
import type { ProjectSnapshot } from './model.ts';

const limit=2*1024*1024;
const problem=(code:string,message:string)=>Object.assign(new Error(message),{code});

export async function startDev(root:string,options:{port?:number;editorJs:string}):Promise<{url:string;close():Promise<void>}> {
  let current:LiveSnapshot={...await readProject(root),sequence:1},url='',hadError=false;
  const token=randomBytes(24).toString('hex');
  const clients=new Set<ServerResponse>();
  let pending=Promise.resolve();
  function enqueue<T>(operation:()=>Promise<T>):Promise<T> {const next=pending.then(operation);pending=next.then(()=>{},()=>{});return next;}
  function send(event:ProjectEvent):void {for(const client of clients)client.write('event: '+event.type+'\ndata: '+JSON.stringify(event)+'\n\n');}
  function publish(snapshot:ProjectSnapshot):LiveSnapshot {
    if(snapshot.revision!==current.revision || hadError){current={...snapshot,sequence:current.sequence+1};hadError=false;send({type:'snapshot',snapshot:current});}
    return current;
  }
  const server=createServer(async(req,res)=>{
    const json=(status:number,data:unknown)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data));};
    try {
      if(req.headers.host!==new URL(url).host || (req.headers.origin && req.headers.origin!==url))throw problem('FORBIDDEN','Request origin is not this authoring session');
      const path=new URL(req.url ?? '/',url).pathname;
      if(req.method==='GET' && path==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(buildEditorHtml(options.editorJs,token));return;}
      if(req.method==='GET' && path==='/api/project'){json(200,current);return;}
      if(req.method==='GET' && path==='/api/events'){
        res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache','connection':'keep-alive'});
        clients.add(res);res.write('event: snapshot\ndata: '+JSON.stringify({type:'snapshot',snapshot:current})+'\n\n');
        req.on('close',()=>clients.delete(res));return;
      }
      if(req.method==='PUT' && path==='/api/document'){
        if(req.headers['x-diagram-token']!==token)throw problem('FORBIDDEN','Missing authoring session token');
        if(!req.headers['content-type']?.startsWith('application/json'))throw problem('BAD_REQUEST','Expected application/json');
        if(Number(req.headers['content-length'] ?? 0)>limit){req.resume();throw problem('BODY_TOO_LARGE','Document exceeds 2 MiB');}
        const chunks:Buffer[]=[];let size=0;
        await new Promise<void>((resolve,reject)=>{req.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size<=limit)chunks.push(chunk);});req.on('end',resolve);req.on('error',reject);req.on('aborted',()=>reject(problem('BAD_REQUEST','Request aborted')));});
        if(size>limit)throw problem('BODY_TOO_LARGE','Document exceeds 2 MiB');
        let body:any;
        try {body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw problem('BAD_REQUEST','Invalid JSON request');}
        if(!body || typeof body!=='object' || typeof body.expectedDocumentRevision!=='string' || Object.keys(body).some(key=>!['document','expectedDocumentRevision'].includes(key)))throw problem('BAD_REQUEST','Expected document and expectedDocumentRevision');
        const saved=await enqueue(async()=>publish(await saveDocument(root,body.document,body.expectedDocumentRevision)));
        json(200,saved);return;
      }
      json(404,{error:{code:'BAD_REQUEST',message:'Unknown endpoint'}});
    } catch(error) {
      if(res.headersSent){res.end();return;}
      const code=error && typeof error==='object' && 'code' in error?String(error.code):'IO_ERROR';
      const status:Record<string,number>={CONFLICT:409,INVALID_DOCUMENT:422,FORBIDDEN:403,BODY_TOO_LARGE:413,BAD_REQUEST:400};
      json(status[code] ?? 500,{error:{code:status[code]?code:'IO_ERROR',message:error instanceof Error?error.message:String(error)}});
    }
  });
  server.requestTimeout=10_000;
  const unwatch=watchProject(root,error=>{
    void enqueue(async()=>{if(error)throw error;publish(await readProject(root));}).catch(reason=>{hadError=true;send({type:'error',message:reason instanceof Error?reason.message:String(reason)});});
  });
  try {await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(options.port ?? 0,'127.0.0.1',resolve);});}
  catch(error){unwatch();throw error;}
  const address=server.address();if(!address || typeof address==='string')throw new Error('Unable to start local server');
  url='http://127.0.0.1:'+address.port;
  return {url,close:async()=>{unwatch();await pending;for(const client of clients)client.end();await new Promise<void>((resolve,reject)=>{
    server.close(error=>error?reject(error):resolve());
    // An accepted socket can still be waiting for headers or a new SSE request.
    server.closeAllConnections();
  });}};
}
