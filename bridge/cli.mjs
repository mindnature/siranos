#!/usr/bin/env node
import {configure,sync,search,profile,candidates,review,status} from './core.mjs';
import {loginGoogle,googleStatus,disconnectGoogle,cloudConfig} from './google-auth.mjs';
import {selectGoogleFolder,syncGoogle} from './google-drive.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import fsp from 'node:fs/promises';
import {dataDirectory} from './core.mjs';
const exe=fileURLToPath(new URL('./mcp.mjs',import.meta.url));
const cmd=process.argv[2]||'help';
const flag=n=>{const i=process.argv.indexOf(n);return i>=0?process.argv[i+1]:undefined};
const json=x=>console.log(JSON.stringify(x,null,2));
try{
  if(cmd==='setup'){
    const folder=flag('--folder');if(!folder)throw Error('Usage: node bridge/cli.mjs setup --folder "<Google Drive synced folder>"');
    const result=await configure(folder);json({configured:true,...result,next:['node bridge/cli.mjs sync','node bridge/cli.mjs status','node bridge/cli.mjs integration']});
  }else if(cmd==='sync')json(await sync({force:process.argv.includes('--force')}));
  else if(cmd==='status')json({...status(),google:googleStatus()});
  else if(cmd==='google-status')json(googleStatus());
  else if(cmd==='google-connect')json(await loginGoogle());
  else if(cmd==='google-disconnect')json(await disconnectGoogle());
  else if(cmd==='erase-local-data'){if(!process.argv.includes('--yes-delete-local-index'))throw Error('Refusing destructive operation. Use: erase-local-data --yes-delete-local-index. Source Google Drive files will not be changed.');await fsp.rm(dataDirectory(),{recursive:true,force:true});json({deletedLocalIndex:true,sourceCloudDataUnchanged:true});}
  else if(cmd==='google-folder'){const value=process.argv[3];if(!value)throw Error('Usage: google-folder <Google Drive folder URL or ID>');json(await selectGoogleFolder(value));}
  else if(cmd==='google-sync')json(await syncGoogle());
  else if(cmd==='search'){if(cloudConfig()?.folder_id)await syncGoogle();else await sync();json(search(process.argv.slice(3).join(' ')))}
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

  # Direct Google Drive developer preview (requires publisher OAuth client ID):
  node bridge/cli.mjs google-connect
  node bridge/cli.mjs google-folder <Google Drive folder URL>
  node bridge/cli.mjs google-sync
  node bridge/cli.mjs google-status
  node bridge/cli.mjs google-disconnect
  node bridge/cli.mjs erase-local-data --yes-delete-local-index

Connect Google Drive for desktop and select its synced/mirrored SiranOS folder first.
Direct OAuth stores a restricted-scope Google refresh token privately on this computer; never commit it to GitHub. Public OAuth app verification remains required.`);
  }
}catch(e){console.error('SiranOS:',e.message);process.exitCode=1}
