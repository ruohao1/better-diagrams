import {readFile,realpath} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import semver from 'semver';
import pkg from '../package.json' with {type:'json'};
import {runNpm} from './npm.ts';

async function npm(args:string[],timeout=10_000):Promise<string>{
  try{return (await runNpm(args,timeout)).stdout.trim();}
  catch(error){
    const failure=error as Error & {stdout?:string;code?:string;killed?:boolean};
    let code=failure.killed?'ETIMEDOUT':failure.code==='ENOENT'?'ENOENT':'FAILED';
    try{const value=JSON.parse(failure.stdout??'').error?.code;if(typeof value==='string' && /^[A-Z0-9_]+$/.test(value))code=value;}catch{}
    throw Object.assign(new Error('npm '+args[0]+' failed ('+code+').'),{code});
  }
}

interface UpdateStatus {ok:true;package:string;current:string;latest:string|null;published:boolean;updateAvailable:boolean;updated?:boolean}
export async function checkForUpdate():Promise<UpdateStatus>{
  const network=['--json','--fetch-retries=0','--fetch-timeout=5000'];
  let tags;
  try{tags=await npm(['dist-tag','ls',pkg.name,...network]);}
  catch(error){
    if(error instanceof Error && 'code' in error && error.code==='E404')return {ok:true,package:pkg.name,current:pkg.version,latest:null,published:false,updateAvailable:false};
    throw error;
  }
  // npm 10 and 12 print tag rows even with --json.
  const latest=tags.split('\n').find(line=>line.startsWith('latest: '))?.slice(8).trim();
  if(typeof latest!=='string' || semver.valid(latest)!==latest || semver.prerelease(latest)!==null)throw new Error('Invalid stable release metadata for '+pkg.name);
  const result=JSON.parse(await npm(['view',pkg.name+'@'+latest,'name','version',...network]));
  const metadata=Array.isArray(result) && result.length===1?result[0]:result;
  if(!metadata || metadata.name!==pkg.name || metadata.version!==latest)throw new Error('Invalid stable release metadata for '+pkg.name);
  return {ok:true,package:pkg.name,current:pkg.version,latest:metadata.version,published:true,updateAvailable:semver.gt(metadata.version,pkg.version)};
}

export async function updateInstallation():Promise<UpdateStatus>{
  const prefix=await npm(['prefix','--global']);
  const globalRoot=await npm(['root','--global','--prefix',prefix]),installedRoot=resolve(globalRoot,pkg.name);
  const ownRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  let matches=false;
  try{matches=await realpath(installedRoot)===await realpath(ownRoot);}catch{}
  if(!matches)throw new Error('This copy is not the current npm global installation. Update it through its owning installer, or install '+pkg.name+' globally with npm.');
  const status=await checkForUpdate();
  if(!status.updateAvailable)return {...status,updated:false};
  await npm(['install','--global','--prefix',prefix,'--engine-strict','--force=false','--ignore-scripts','--no-audit','--no-fund','--json',pkg.name+'@'+status.latest],120_000);
  const installed=JSON.parse(await readFile(resolve(installedRoot,'package.json'),'utf8'));
  if(installed.name!==pkg.name || installed.version!==status.latest)throw new Error('npm finished, but the installed version could not be verified');
  return {...status,updated:true};
}
