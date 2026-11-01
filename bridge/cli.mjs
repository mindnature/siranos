#!/usr/bin/env node
import {configure,sync,search,profile,candidates,review,status} from './core.mjs';
import {loginGoogle,googleStatus,disconnectGoogle,cloudConfig} from './google-auth.mjs';
import {selectGoogleFolder,syncGoogle} from './google-drive.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import fsp from 'node:fs/promises';
import {dataDirectory} from './core.mjs';
import {initWorkspace,setFrequency,refreshWorkspace,workspaceStatus,latestOverview,defaultRoot} from './workspace.mjs';
import {installSchedule,schedulePreview} from './scheduler.mjs';
const exe=fileURLToPath(new URL('./mcp.mjs',import.meta.url));
const cmd=process.argv[2]||'help';
const flag=n=>{const i=process.argv.indexOf(n);return i>=0?process.argv[i+1]:undefined};
const json=x=>console.log(JSON.stringify(x,null,2));
const cliQuote=s=>'"'+s.replaceAll('\"','')+'"';
try{
  if(cmd==='init'){
    const frequency=flag('--frequency');
    const result=await initWorkspace({root:flag('--root'),frequency});
    json(result);
    if(process.argv.includes('--install-schedule'))json(await installSchedule());
  }else if(cmd==='tick')json(await refreshWorkspace({force:process.argv.includes('--force'),manualReport:process.argv.includes('--report-now')}));
  else if(cmd==='frequency')json(await setFrequency(process.argv[3]||''));
  else if(cmd==='schedule-preview')json(schedulePreview());
  else if(cmd==='schedule-install')json(await installSchedule());
  else if(cmd==='workspace-status')json(workspaceStatus());
  else if(cmd==='overview')json(latestOverview(process.argv[3]||'latest'));
  else if(cmd==='setup'){
    const folder=flag('--folder');if(!folder)throw Error('Usage: node bridge/cli.mjs setup --folder "<Google Drive synced folder>"');
    const result=await configure(folder);json({configured:true,...result,next:['node bridge/cli.mjs sync','node bridge/cli.mjs status','node bridge/cli.mjs integration']});
  }else if(cmd==='sync')json(await sync({force:process.argv.includes('--force')}));
  else if(cmd==='status')json({...status(),workspace:workspaceStatus(),google:googleStatus()});
  else if(cmd==='google-status')json(googleStatus());
  else if(cmd==='google-connect')json(await loginGoogle());
  else if(cmd==='google-disconnect')json(await disconnectGoogle());
  else if(cmd==='erase-local-data'){if(!process.argv.includes('--yes-delete-local-index'))throw Error('Refusing destructive operation. Use: erase-local-data --yes-delete-local-index. Source Google Drive files will not be changed.');await fsp.rm(dataDirectory(),{recursive:true,force:true});json({deletedLocalIndex:true,sourceCloudDataUnchanged:true});}
  else if(cmd==='google-folder'){const value=process.argv[3];if(!value)throw Error('Usage: google-folder <Google Drive folder URL or ID>');json(await selectGoogleFolder(value));}
  else if(cmd==='google-sync')json(await syncGoogle());
  else if(cmd==='search'){if(cloudConfig()?.folder_id)await syncGoogle();else await sync();json(search(process.argv.slice(3).join(' ')))}
  else if(cmd==='profile')json(profile());
  else if(cmd==='memories'){json(candidates());}
  else if(cmd==='approve'||cmd==='dismiss'){const id=process.argv[3];if(!id)throw Error('Provide the memory ID from memories');const result=review(id,cmd==='approve'?'confirmed':'dismissed');json(result);if(workspaceStatus().configured)json({workspaceUpdated:await refreshWorkspace()});}
  else if(cmd==='integration'){
    console.log('Codex (run in terminal):');
    console.log('codex mcp add siranos -- node '+cliQuote(exe));
    console.log('WorkBuddy (Settings > MCP server > configuration):');
    console.log(JSON.stringify({mcpServers:{siranos:{command:'node',args:[exe]}}},null,2));
    console.log('WorkBuddy user settings are commonly in ~/.workbuddy/mcp.json; back up existing config and MERGE, do not overwrite.');
  }else {
    console.log(`SiranOS local-first second brain (Node.js >=22)

  node bridge/cli.mjs init [--root "<local folder>"] [--frequency weekly|monthly|manual]
  node bridge/cli.mjs tick [--report-now]         # incremental scan, curated files and due report
  node bridge/cli.mjs frequency weekly|monthly|manual
  node bridge/cli.mjs schedule-install            # install user-level daily 09:00 OS task
  node bridge/cli.mjs workspace-status

  # Optional older Drive-for-desktop folder mode:
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

For new users, init creates a local Documents/SiranOS folder. Google Drive is entirely optional.
Direct OAuth stores a restricted-scope Google refresh token privately on this computer; never commit it to GitHub. Public OAuth app verification remains required.`);
  }
}catch(e){console.error('SiranOS:',e.message);process.exitCode=1}
