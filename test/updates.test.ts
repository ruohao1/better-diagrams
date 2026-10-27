import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,mkdir,writeFile,readFile,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer} from 'node:http';
import {existsSync} from 'node:fs';

const execute=promisify(execFile),checkout=resolve('dist/cli.mjs');
const scripts={postinstall:'node -e "require(\'node:fs\').writeFileSync(\'postinstall-ran\',\'yes\')"'};
async function fixture(prefixFromConfig=false){
  const root=await mkdtemp(join(tmpdir(),'diagram-updates-')),prefix=join(root,'prefix'),pkg=JSON.parse(await readFile('package.json','utf8'));
  let mode='newer',switchLatest=false,requests=0,downloads=0,port=0;
  const archives=new Map<string,{filename:string;integrity:string;shasum:string}>();
  const server=createServer(async(req,res)=>{
    res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');
    const path=decodeURIComponent(req.url??'');
    if(path.startsWith('/tarball/')){
      downloads++;const version=path.split('/').at(-1)!,archive=archives.get(version);if(!archive){res.writeHead(404).end();return;}
      res.setHeader('content-type','application/octet-stream');res.end(await readFile(join(root,archive.filename)));return;
    }
    requests++;
    if(mode==='timeout')return;
    if(!['/@isqrd/better-diagrams','/-/package/@isqrd/better-diagrams/dist-tags'].includes(path) || mode==='missing'){res.writeHead(404).end('{"error":"not_found"}');return;}
    if(mode==='broken'){res.writeHead(503).end('{"error":"unavailable"}');return;}
    const latest=mode==='current'?pkg.version:mode==='older'?'0.0.1':mode==='prerelease'?'99.0.0-beta.1':mode==='malformed'?'not-a-version':switchLatest && requests>1?'100.0.0':'99.0.0';
    if(path.endsWith('/dist-tags')){if(mode==='move-prefix')await writeFile(join(root,'user.npmrc'),'prefix='+join(root,'other-prefix')+'\n');res.end(JSON.stringify({latest}));return;}
    const name=mode==='wrong-name'?'unrelated-package':'@isqrd/better-diagrams',versions:Record<string,unknown>={};
    for(const version of new Set([latest,'99.0.0','100.0.0'])){
      const archive=archives.get(version)??archives.get('99.0.0')!;
      versions[version]={name,version,scripts,hasInstallScript:true,bin:{'better-diagrams':'dist/cli.mjs'},engines:{node:mode==='engine'?'>=999.0.0':'>=22.18.0'},dist:{tarball:`http://127.0.0.1:${port}/tarball/${version}`,integrity:archive.integrity,shasum:archive.shasum}};
    }
    res.end(JSON.stringify({name,'dist-tags':{latest},versions}));
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address && typeof address==='object');
  port=address.port;
  const env={...process.env,npm_config_prefix:prefixFromConfig?undefined:prefix,npm_config_registry:`http://127.0.0.1:${address.port}`,npm_config_cache:join(root,'cache'),npm_config_userconfig:join(root,'user.npmrc'),npm_config_globalconfig:join(root,'global.npmrc'),npm_config_update_notifier:'false',npm_config_prefer_online:'true'};
  try{
    await writeFile(env.npm_config_userconfig,prefixFromConfig?'prefix='+prefix+'\n':'');await writeFile(env.npm_config_globalconfig,'');
    for(const version of [pkg.version,'99.0.0','100.0.0']){
      const source=join(root,version);await mkdir(join(source,'dist'),{recursive:true});
      await writeFile(join(source,'package.json'),JSON.stringify({name:'@isqrd/better-diagrams',version,scripts,bin:{'better-diagrams':'dist/cli.mjs'},files:['dist'],engines:{node:'>=22.18.0'}}));
      if(version===pkg.version)await copyFile(checkout,join(source,'dist/cli.mjs'));
      else await writeFile(join(source,'dist/cli.mjs'),'#!/usr/bin/env node\nprocess.stdout.write('+JSON.stringify(version+'\n')+');\n');
      const packed=await execute('npm',['pack','--json','--pack-destination',root],{cwd:source,env});archives.set(version,Object.values(JSON.parse(packed.stdout))[0] as {filename:string;integrity:string;shasum:string});
    }
    await execute('npm',['install','--global','--ignore-scripts','--offline','--no-audit','--no-fund',join(root,archives.get(pkg.version)!.filename)],{cwd:root,env});
    const binary=join(prefix,'bin/better-diagrams');
    const run=async(args:string[],fromCheckout=false)=>{
      try{const result=await execute(fromCheckout?process.execPath:binary,fromCheckout?[checkout,...args]:args,{cwd:root,env,timeout:20_000});return {status:0,...result};}
      catch(error){const result=error as Error & {code:number;stdout:string;stderr:string};return {status:result.code,stdout:result.stdout,stderr:result.stderr};}
    };
    return {root,pkg,run,setMode:(value:string)=>{mode=value;},switchTag:()=>{switchLatest=true;},requests:()=>requests,downloads:()=>downloads,close:async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(root,{recursive:true,force:true});}};
  }catch(error){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(root,{recursive:true,force:true});throw error;}
}

test('installed update checks distinguish newer, current, older, and unpublished releases',async()=>{
  const f=await fixture();try{
    for(const [mode,latest,available] of [['newer','99.0.0',true],['current',f.pkg.version,false],['older','0.0.1',false],['missing',null,false]] as const){
      f.setMode(mode);const result=await f.run(['update','--check']);assert.equal(result.status,0,result.stderr);const status=JSON.parse(result.stdout);
      assert.equal(status.package,'@isqrd/better-diagrams');assert.equal(status.current,f.pkg.version);assert.equal(status.latest,latest);assert.equal(status.updateAvailable,available);assert.equal(status.published,mode!=='missing');
      if(!available){const kept=await f.run(['update']);assert.equal(kept.status,0,kept.stderr);assert.equal(JSON.parse(kept.stdout).updated,false);}
    }
    assert.equal(f.downloads(),0);assert.equal((await f.run(['--version'])).stdout,f.pkg.version+'\n');
  }finally{await f.close();}
});

test('installed updater installs the checked version when latest changes during installation',async()=>{
  const f=await fixture();try{f.switchTag();const result=await f.run(['update']);assert.equal(result.status,0,result.stderr);const status=JSON.parse(result.stdout);assert.equal(status.updated,true);assert.equal(status.latest,'99.0.0');assert.equal((await f.run(['--version'])).stdout,'99.0.0\n');assert.equal(f.downloads(),1);assert.equal(existsSync(join(f.root,'prefix/lib/node_modules/@isqrd/better-diagrams/postinstall-ran')),false);}finally{await f.close();}
});

test('failed engine checks leave the installed CLI usable',async()=>{
  const f=await fixture();try{f.setMode('engine');const result=await f.run(['update']);assert.equal(result.status,1);assert.match(result.stderr,/EBADENGINE/);assert.equal((await f.run(['--version'])).stdout,f.pkg.version+'\n');}finally{await f.close();}
});

test('updater retains its checked prefix when npm configuration changes',async()=>{
  const f=await fixture(true);try{f.setMode('move-prefix');const result=await f.run(['update']);assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).updated,true);assert.equal((await f.run(['--version'])).stdout,'99.0.0\n');assert.equal(existsSync(join(f.root,'other-prefix/lib/node_modules/@isqrd/better-diagrams')),false);}finally{await f.close();}
});

test('checkout invocations and invalid update arguments preserve the global installation',async()=>{
  const f=await fixture();try{
    const local=await f.run(['update'],true);assert.equal(local.status,1);assert.match(local.stderr,/global installation/);
    for(const args of [['update','extra'],['update','--out','other.html'],['check','some-project','--check']]){const result=await f.run(args);assert.equal(result.status,1);}
    assert.equal(f.requests(),0);assert.equal(f.downloads(),0);assert.equal((await f.run(['--version'])).stdout,f.pkg.version+'\n');
  }finally{await f.close();}
});

test('invalid and unavailable registry metadata never installs a release',async()=>{
  const f=await fixture();try{
    for(const mode of ['wrong-name','malformed','prerelease','broken','timeout']){f.setMode(mode);const result=await f.run(['update']);assert.equal(result.status,1,mode);assert.ok(JSON.parse(result.stderr).error,mode);}
    assert.equal(f.downloads(),0);assert.equal((await f.run(['--version'])).stdout,f.pkg.version+'\n');
  }finally{await f.close();}
});
