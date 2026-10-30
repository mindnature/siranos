/** Install a user-level *daily* check; the workspace cadence controls actual reports. */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {workspace} from './workspace.mjs';
const entry=fileURLToPath(new URL('./cli.mjs',import.meta.url));
const engine=process.execPath;
const powershellQuote=s=>"'"+s.replaceAll("'","''")+"'";
const xml=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
export function schedulePreview(platform=process.platform){
  const description='Check SiranOS inbox daily at 09:00 local time; generate a report only when configured weekly/monthly cadence is due.';
  return {platform,description,command:`${JSON.stringify(engine)} ${JSON.stringify(entry)} tick`,engine,entry};
}
export async function installSchedule({platform=process.platform,run=spawnSync}={}){
  if(!workspace())throw Error('Initialize the SiranOS workspace before registering a scheduled task');
  if(platform==='win32'){
    const script=`$ErrorActionPreference = 'Stop'\n$action = New-ScheduledTaskAction -Execute ${powershellQuote(engine)} -Argument ${powershellQuote('"'+entry+'" tick')}\n$trigger = New-ScheduledTaskTrigger -Daily -At '09:00'\n$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable\nRegister-ScheduledTask -TaskName 'SiranOS Second Brain' -Action $action -Trigger $trigger -Settings $settings -Description 'User local knowledge index and weekly/monthly reports' -Force | Out-Null\nGet-ScheduledTask -TaskName 'SiranOS Second Brain' | Select-Object TaskName,State | ConvertTo-Json -Compress`;
    const cp=run('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{encoding:'utf8',timeout:30000,windowsHide:true});
    if(cp.error||cp.status!==0)throw Error('Windows Task Scheduler registration failed: '+String(cp.stderr||cp.error?.message||cp.status).slice(0,700));
    return {installed:true,platform:'win32',schedule:'daily 09:00 local; report cadence is read from workspace',details:String(cp.stdout||'').trim()};
  }
  if(platform==='linux'){
    const home=os.homedir(),dir=path.join(home,'.config','systemd','user');await fsp.mkdir(dir,{recursive:true,mode:0o700});
    const service=path.join(dir,'siranos-second-brain.service');const timer=path.join(dir,'siranos-second-brain.timer');
    const esc=s=>s.replaceAll('\\','\\\\').replaceAll('"','\\"');
    const serviceText=`[Unit]\nDescription=SiranOS personal local knowledge refresh\n[Service]\nType=oneshot\nExecStart="${esc(engine)}" "${esc(entry)}" tick\n`;
    const timerText=`[Unit]\nDescription=Refresh SiranOS second brain daily\n[Timer]\nOnCalendar=*-*-* 09:00:00\nPersistent=true\nUnit=siranos-second-brain.service\n[Install]\nWantedBy=timers.target\n`;
    for(const [f,contents] of [[service,serviceText],[timer,timerText]]){
      try{const st=await fsp.lstat(f);if(st.isSymbolicLink()||!st.isFile())throw Error('Unsafe timer file: '+f)}catch(e){if(e.code!=='ENOENT')throw e}
      await fsp.writeFile(f,contents,{mode:0o600});
    }
    const command=run('systemctl',['--user','daemon-reload'],{encoding:'utf8',timeout:15000});
    if(command.error||command.status!==0)throw Error('systemctl --user unavailable; timer files created, but not enabled');
    const start=run('systemctl',['--user','enable','--now','siranos-second-brain.timer'],{encoding:'utf8',timeout:15000});
    if(start.error||start.status!==0)throw Error('Timer files created but could not activate systemd user timer: '+String(start.stderr||start.error?.message).slice(0,400));
    return {installed:true,platform:'linux',schedule:'daily 09:00 local; catches up after downtime via systemd Persistent',timer};
  }
  if(platform==='darwin'){
    const directory=path.join(os.homedir(),'Library','LaunchAgents'),file=path.join(directory,'io.siranos.secondbrain.plist');await fsp.mkdir(directory,{recursive:true});
    const contents=`<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>io.siranos.secondbrain</string><key>ProgramArguments</key><array><string>${xml(engine)}</string><string>${xml(entry)}</string><string>tick</string></array><key>StartCalendarInterval</key><dict><key>Hour</key><integer>9</integer><key>Minute</key><integer>0</integer></dict><key>RunAtLoad</key><true/><key>StandardOutPath</key><string>${xml(path.join(os.tmpdir(),'siranos-tick.log'))}</string></dict></plist>\n`;
    await fsp.writeFile(file,contents,{mode:0o600});
    const uid=process.getuid();const r=run('launchctl',['bootstrap','gui/'+uid,file],{encoding:'utf8',timeout:15000});
    // launchctl returns 5 if already loaded; restart via kickstart then.
    if(r.status!==0){const k=run('launchctl',['kickstart','-k','gui/'+uid+'/io.siranos.secondbrain'],{encoding:'utf8',timeout:15000});if(k.status!==0)throw Error('LaunchAgent written, but cannot load; check launchctl privileges and launchctl bootstrap manually');}
    return {installed:true,platform:'darwin',schedule:'daily 09:00 local plus RunAtLoad',file};
  }
  throw Error('Unsupported operating system; run `node bridge/cli.mjs tick` from your own daily scheduler');
}
