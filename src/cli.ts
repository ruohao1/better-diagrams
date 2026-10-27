import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readProject } from './project.ts';
import { buildStandaloneHtml } from './html.ts';
import { startDev } from './server.ts';
import {checkForUpdate,updateInstallation} from './updates.ts';
import pkg from '../package.json' with {type:'json'};

export async function runCli(argv: string[]): Promise<number> {
  try {
    const {positionals,values}=parseArgs({args:argv,allowPositionals:true,options:{out:{type:'string'},help:{type:'boolean',short:'h'},version:{type:'boolean',short:'v'},check:{type:'boolean'}}});
    const usage='Usage: better-diagrams check PROJECT | build PROJECT --out FILE.html | dev PROJECT | update [--check] | --version';
    if(values.help){process.stdout.write('Better Diagrams\n\n  check PROJECT                  Validate source and asset paths\n  build PROJECT --out FILE.html  Create standalone HTML\n  dev PROJECT                    Start the local live editor\n  --version                      Print the installed version\n  update --check                 Check for a newer stable release\n  update                         Update this npm global installation\n\nExport SVG from the browser viewer or editor.\n');return 0;}
    if(values.version){
      if(positionals.length || values.out!==undefined || values.check)throw new Error(usage);
      process.stdout.write(pkg.version+'\n');return 0;
    }
    if(positionals[0]==='update'){
      if(positionals.length!==1 || values.out!==undefined)throw new Error(usage);
      process.stdout.write(JSON.stringify(await (values.check?checkForUpdate():updateInstallation()))+'\n');return 0;
    }
    const [command,root]=positionals;
    if(values.check || positionals.length!==2 || !['check','build','dev'].includes(command))throw new Error(usage);
    if(command==='dev'){
      const session=await startDev(root,{editorJs:await readFile(new URL('./editor.js',import.meta.url),'utf8')});
      process.stdout.write(JSON.stringify({ok:true,url:session.url})+'\n');
      for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void session.close().catch(error=>{process.stderr.write(String(error)+'\n');process.exitCode=1;});});
      return 0;
    }
    const project=await readProject(root);
    if(command==='check')process.stdout.write(JSON.stringify({ok:true,checked:['document','asset-paths'],revision:project.revision})+'\n');
    else {
      if(!values.out || !values.out.endsWith('.html'))throw new Error('Build requires --out FILE.html');
      const output=resolve(values.out);
      const html=buildStandaloneHtml(project,await readFile(new URL('./viewer.js',import.meta.url),'utf8'));
      await mkdir(dirname(output),{recursive:true});await writeFile(output,html);
      process.stdout.write(JSON.stringify({ok:true,output,rendering:'not-verified'})+'\n');
    }
    return 0;
  } catch(error) {
    process.stderr.write(JSON.stringify({ok:false,error:error instanceof Error?error.message:String(error)})+'\n');return 1;
  }
}

if(process.argv[1] && await realpath(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=await runCli(process.argv.slice(2));
