import { build } from 'esbuild';
import { existsSync } from 'node:fs';
import {mkdir,copyFile} from 'node:fs/promises';

await mkdir('dist/licenses',{recursive:true});
await copyFile('node_modules/elkjs/LICENSE.md','dist/licenses/elkjs-LICENSE.md');
await copyFile('node_modules/semver/LICENSE','dist/licenses/semver-LICENSE');

const common = { bundle: true, sourcemap: false, legalComments: 'inline', loader: { '.svg': 'text', '.css': 'text' } };
await build({ ...common, entryPoints: ['src/browser/compiler.ts'], outfile: 'dist/test/compiler.js', format: 'iife', globalName: 'DiagramCompiler', platform: 'browser' });
await build({ ...common, entryPoints: ['src/browser/templates.ts'], outfile: 'dist/test/templates.js', format: 'iife', globalName: 'DiagramTemplates', platform: 'browser' });
if (existsSync('src/browser/editor.ts')) await build({ ...common, entryPoints: ['src/browser/editor.ts'], outfile: 'dist/test/editor.js', format: 'iife', globalName: 'DiagramEditor', platform: 'browser' });
for (const name of ['viewer', 'editor']) {
  const entry = 'src/browser/' + name + '-entry.ts';
  if (existsSync(entry)) await build({ ...common, entryPoints: [entry], outfile: 'dist/' + name + '.js', format: 'iife', platform: 'browser', minify: true });
}
if (existsSync('src/cli.ts')) await build({ ...common, entryPoints: ['src/cli.ts'], outfile: 'dist/cli.mjs', format: 'esm', platform: 'node', target: 'node22', banner: { js: '#!/usr/bin/env node' } });
