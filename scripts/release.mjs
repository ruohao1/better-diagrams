import {readFile} from 'node:fs/promises';
import {resolve,dirname,basename} from 'node:path';
import {createHash} from 'node:crypto';
import semver from 'semver';
import {runNpm} from '../src/npm.ts';

const json=async path=>JSON.parse(await readFile(path,'utf8'));
function require(condition,message){if(!condition)throw new Error(message);}
async function release(tag){
  const [pkg,lock,plugin,changelog]=await Promise.all([json('package.json'),json('package-lock.json'),json('plugin.json'),readFile('CHANGELOG.md','utf8')]);
  require(pkg.name==='@isqrd/better-diagrams' && pkg.private!==true,'Expected a publishable @isqrd/better-diagrams package');
  require(semver.valid(pkg.version)===pkg.version && semver.prerelease(pkg.version)===null,'Stable releases require a valid non-prerelease version');
  require(tag==='v'+pkg.version,'Release tag must match v'+pkg.version);
  require(lock.name===pkg.name && lock.version===pkg.version && lock.packages?.['']?.name===pkg.name && lock.packages[''].version===pkg.version,'Lockfile version/name must match the package');
  require(plugin.name==='better-diagrams' && plugin.version===pkg.version,'Plugin version/name must match the package');
  const lines=changelog.split(/\r?\n/),start=lines.findIndex(line=>line==='## ['+pkg.version+']' || line.startsWith('## ['+pkg.version+'] - '));
  require(start>=0,'Missing changelog notes for '+pkg.version);
  const end=lines.findIndex((line,index)=>index>start && line.startsWith('## ')),notes=lines.slice(start+1,end<0?undefined:end).join('\n').trim();
  require(notes.length>0,'Release notes must not be empty');
  return {name:pkg.name,version:pkg.version,notes};
}
async function publish(packFile){
  const pkg=await json('package.json'),info=await release('v'+pkg.version),packs=Object.values(await json(packFile));
  require(packs.length===1,'Expected exactly one packed artifact');
  const [pack]=packs;
  require(pack?.name===info.name && pack.version===info.version && typeof pack.filename==='string' && basename(pack.filename)===pack.filename,'Packed artifact must match the release');
  const artifact=resolve(dirname(packFile),pack.filename),integrity='sha512-'+createHash('sha512').update(await readFile(artifact)).digest('base64');
  require(pack.integrity===integrity,'Packed artifact integrity does not match its bytes');
  let remote;
  try{
    const result=await runNpm(['view',info.name+'@'+info.version,'dist.integrity','--json','--fetch-retries=0','--fetch-timeout=5000'],10_000,64*1024);
    const value=JSON.parse(result.stdout);
    require(!Array.isArray(value) || value.length===1,'Expected exactly one published integrity value');
    remote=Array.isArray(value)?value[0]:value;
  }catch(error){
    let code;try{code=JSON.parse(error.stdout).error?.code;}catch{}
    if(code!=='E404')throw new Error('Cannot verify the existing npm release; publication stopped', {cause:error});
  }
  require(remote===undefined || remote===integrity,'Published version has different integrity; choose a new version');
  if(remote===undefined)await runNpm(['publish',artifact,'--access','public','--ignore-scripts'],120_000);
  process.stdout.write(JSON.stringify({ok:true,package:info.name,version:info.version,published:remote===undefined})+'\n');
}
try{
  const [command,argument,...extra]=process.argv.slice(2);
  require(argument && extra.length===0 && ['notes','publish'].includes(command),'Usage: node scripts/release.mjs notes TAG | publish PACK_JSON');
  if(command==='notes')process.stdout.write((await release(argument)).notes+'\n');else await publish(argument);
}catch(error){process.stderr.write((error instanceof Error?error.message:String(error))+'\n');process.exitCode=1;}
