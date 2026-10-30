#!/usr/bin/env node
import {configure,sync,search,profile,candidates,review,status} from './core.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const exe=fileURLToPath(new URL('./mcp.mjs',import.meta.url));
const cmd=process.argv[2]||'help';
const flag=n=>{const i=process.argv.indexOf(n);return i>=0?process.argv[i+1]:undefined};
const json=x=>console.log(JSON.stringify(x,null,2));
try{
  if(cmd==='setup'){
    const folder=flag('--folder');if(!folder)throw Error('Usage: node bridge/cli.mjs setup --folder "<Google Drive synced folder>"');
    const result=await configure(folder);json({configured:true,...result,next:['node bridge/cli.mjs sync','node bridge/cli.mjs status','node bridge/cli.mjs integration']});
  }else if(cmd==='sync')json(await sync({force:process.argv.includes('--force')}));
  else if(cmd==='status')json(status());
  else if(cmd==='search'){await sync();json(search(process.argv.slice(3).join(' ')))}
  else if(cmd==='profile')json(profile());
  else if(cmd==='memories'){json(candidates());}
  else if(cmd==='approve'||cmd==='dismiss'){const id=process.argv[3];if(!id)throw Error('Provide the memory ID from memories');json(review(id,cmd==='approve'?'confirmed':'dismissed'));}
  else if(cmd==='integration'){
    console.log('Codex (run in terminal):');
    console.log('codex mcp add siranos -- node '+JSON.stringify(exe));
    console.log('WorkBuddy (Settings > MCP server > configuration):');
    console.log(JSON.stringify({mcpServers:{siranos:{command:'node',args:[exe]}}},null,2));
    console.log('WorkBuddy user settings are commonly in ~/.workbuddy/mcp.json; back up existing config and MERGE, do not overwrite.');
  }else {
    console.log(`SiranOS Google Drive folder bridge (local-first)

  node bridge/cli.mjs setup --folder "<synced Drive folder>"
  node bridge/cli.mjs sync [--force]
  node bridge/cli.mjs status
  node bridge/cli.mjs search <keywords>
  node bridge/cli.mjs memories
  node bridge/cli.mjs approve <memory-id>
  node bridge/cli.mjs dismiss <memory-id>
  node bridge/cli.mjs profile
  node bridge/cli.mjs integration

Connect Google Drive for desktop and select its synced/mirrored SiranOS folder first.
No cloud OAuth, API key or private credentials are stored by this bridge.`);
  }
}catch(e){console.error('SiranOS:',e.message);process.exitCode=1}
