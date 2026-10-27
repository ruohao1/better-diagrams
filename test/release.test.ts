import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer} from 'node:http';

const execute=promisify(execFile),script=resolve('scripts/release.mjs');
async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'diagram-release-'));
  const pkg={name:'@isqrd/better-diagrams',version:'0.1.0',private:false,files:['cli.cjs'],bin:{'better-diagrams':'cli.cjs'}};
  await writeFile(join(root,'package.json'),JSON.stringify(pkg));
  await writeFile(join(root,'package-lock.json'),JSON.stringify({name:pkg.name,version:'0.1.0',packages:{'':{name:pkg.name,version:'0.1.0'}}}));
  await writeFile(join(root,'plugin.json'),JSON.stringify({name:'better-diagrams',version:'0.1.0'}));
  await writeFile(join(root,'CHANGELOG.md'),'# Changelog\n\n## Unreleased\n\n- Future work.\n\n## [0.1.0]\n\n### Added\n\n- Initial compiler.\n\n## [0.0.1]\n\n- Old work.\n');
  await writeFile(join(root,'cli.cjs'),'#!/usr/bin/env node\nconsole.log("0.1.0");\n');
  return root;
}
async function run(root:string,args:string[]){
  try{const result=await execute(process.execPath,[script,...args],{cwd:root,timeout:20_000});return {status:0,...result};}
  catch(error){const result=error as Error & {code:number;stdout:string;stderr:string};return {status:result.code,stdout:result.stdout,stderr:result.stderr};}
}

test('release validation extracts only the tagged version notes',async()=>{
  const root=await fixture();try{const result=await run(root,['notes','v0.1.0']);assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'### Added\n\n- Initial compiler.\n');}finally{await rm(root,{recursive:true,force:true});}
});

test('release validation rejects divergent versions and missing release notes',async()=>{
  for(const change of ['tag','lock','lock-root','plugin','notes','prerelease','private']){
    const root=await fixture();try{
      if(change==='notes')await writeFile(join(root,'CHANGELOG.md'),'## Unreleased\n- Nothing versioned.\n');
      else if(change!=='tag'){
        const filename=change.startsWith('lock')?'package-lock.json':change==='plugin'?'plugin.json':'package.json',path=join(root,filename),data=JSON.parse(await readFile(path,'utf8'));
        if(change==='lock-root')data.packages[''].version='0.2.0';else if(change==='private')data.private=true;else data.version=change==='prerelease'?'0.1.0-beta.1':'0.2.0';await writeFile(path,JSON.stringify(data));
      }
      const result=await run(root,['notes',change==='tag'?'v0.2.0':change==='prerelease'?'v0.1.0-beta.1':'v0.1.0']);assert.equal(result.status,1,change);assert.ok(result.stderr.trim(),change);
    }finally{await rm(root,{recursive:true,force:true});}
  }
});

test('publication reuses identical releases and rejects changed artifacts or registry failures',async()=>{
  const root=await fixture();let mode='missing';const publications:Record<string,unknown>[]=[];
  const server=createServer(async(req,res)=>{
    res.setHeader('content-type','application/json');
    if(mode==='broken'){res.writeHead(503).end('{"error":"unavailable"}');return;}
    if(req.method==='PUT'){let body='';for await(const chunk of req)body+=chunk;publications.push(JSON.parse(body));res.end('{"ok":true}');return;}
    if(mode==='missing'){res.writeHead(404).end('{"error":"not_found"}');return;}
    const [pack]=JSON.parse(await readFile(join(root,'pack.json'),'utf8'));
    res.end(JSON.stringify({name:'@isqrd/better-diagrams','dist-tags':{latest:'0.1.0'},versions:{'0.1.0':{name:'@isqrd/better-diagrams',version:'0.1.0',dist:{integrity:mode==='same'?pack.integrity:'sha512-different'}}}}));
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address && typeof address==='object');
  try{
    await writeFile(join(root,'.npmrc'),`registry=http://127.0.0.1:${address.port}\n//127.0.0.1:${address.port}/:_authToken=fixture-token\ncache=${join(root,'npm-cache')}\nupdate-notifier=false\n`);
    const packed=await execute('npm',['pack','--json','--pack-destination',root],{cwd:root});await writeFile(join(root,'pack.json'),packed.stdout);
    const published=await run(root,['publish','pack.json']);assert.equal(published.status,0,published.stderr);assert.equal(JSON.parse(published.stdout).published,true);assert.equal(publications.length,1);assert.equal(publications[0].name,'@isqrd/better-diagrams');
    mode='same';const reused=await run(root,['publish','pack.json']);assert.equal(reused.status,0,reused.stderr);assert.equal(JSON.parse(reused.stdout).published,false);assert.equal(publications.length,1);
    for(const failure of ['different','broken']){mode=failure;const result=await run(root,['publish','pack.json']);assert.equal(result.status,1,result.stdout);assert.equal(publications.length,1);}
    mode='missing';const [pack]=JSON.parse(packed.stdout);await writeFile(join(root,pack.filename),'changed archive');const tampered=await run(root,['publish','pack.json']);assert.equal(tampered.status,1);assert.match(tampered.stderr,/integrity/i);assert.equal(publications.length,1);
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(root,{recursive:true,force:true});}
});
