import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {access} from 'node:fs/promises';
import {join} from 'node:path';

const execute=promisify(execFile);
export async function npmCommand(platform:string,env:NodeJS.ProcessEnv):Promise<{file:string;args:string[]}>{
  if(platform!=='win32')return {file:'npm',args:[]};
  const key=Object.keys(env).sort().find(key=>key.toLowerCase()==='path');
  for(const entry of (key?env[key]??'':'').split(';').filter(Boolean)){
    const directory=entry.replace(/^"(.*)"$/,'$1'),executable=join(directory,'npm.exe');
    try{await access(executable);return {file:executable,args:[]};}catch{}
    const cli=join(directory,'node_modules/npm/bin/npm-cli.js');
    // Standard npm.cmd shims point to this adjacent module; run Node directly to avoid shell parsing.
    try{await access(join(directory,'npm.cmd'));await access(cli);return {file:process.execPath,args:[cli]};}catch{}
  }
  throw Object.assign(new Error('npm was not found on PATH'),{code:'ENOENT'});
}

export async function runNpm(args:string[],timeout=10_000,maxBuffer=1024*1024):Promise<{stdout:string;stderr:string}>{
  const env={...process.env,npm_config_update_notifier:'false'},command=await npmCommand(process.platform,env);
  return execute(command.file,[...command.args,...args],{timeout,maxBuffer,env,windowsHide:true});
}
