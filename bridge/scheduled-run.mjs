#!/usr/bin/env node
/** OS task trampoline: set the data location before core modules are imported. */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const args=process.argv.slice(2);
if(args.length!==3||args[0]!=='--home'||!args[1]||args[2]!=='tick')throw Error('Expected --home <absolute-directory>');
if(!path.isAbsolute(args[1]))throw Error('SIRANOS_HOME must be absolute');
process.env.SIRANOS_HOME=args[1];
process.argv=[process.execPath,fileURLToPath(new URL('./cli.mjs',import.meta.url)),'tick'];
await import('./cli.mjs');
