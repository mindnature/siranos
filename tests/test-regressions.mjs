import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'siranos-051-regressions-'));
process.env.SIRANOS_HOME=path.join(tmp,'nondefault-config');
const b=await import('../bridge/core.mjs');
const w=await import('../bridge/workspace.mjs');
const s=await import('../bridge/scheduler.mjs');
try {
  const root=path.join(tmp,'knowledge');
  const initial=await w.initWorkspace({root,frequency:'monthly'});
  assert.equal((await w.initWorkspace()).frequency,'monthly','Reinit without options preserves cadence AND custom root');
  assert.equal((await w.initWorkspace({root})).frequency,'monthly');
  assert.equal(w.workspaceStatus().root,root);
  const chat=path.join(initial.inbox,'sample.json');
  const msg='我决定在虚构的社区花园举办一次志愿者活动，为邻居做一份完整的计划。';
  const source=(message=msg)=>JSON.stringify([{title:'Fictional plan',messages:[{role:'user',text:message}]}]);
  fs.writeFileSync(chat,source());
  await w.refreshWorkspace({now:new Date(2026,9,1,9)});
  const item=b.candidates()[0];assert.ok(item);
  b.review(item.id,'confirmed');
  assert.equal(b.profile().memories.length,1);
  // Invalid JSON should never erase the last good snapshot and approval.
  fs.writeFileSync(chat,'{ invalid-json');
  let scanned=await b.sync();
  assert.ok(scanned.errors.some(x=>x.file==='sample.json'));
  assert.equal(b.search('志愿者').length,0,'Unparseable file is not trusted as current evidence');
  assert.equal(b.profile().memories.length,0,'Temporarily unavailable evidence is withheld');
  fs.writeFileSync(chat,source());
  await b.sync();
  assert.equal(b.profile().memories.length,1,'Byte-identical restore retains original human decision');
  // Deliberate deletion requires re-review, rather than silently restoring consent.
  fs.unlinkSync(chat);await b.sync();assert.equal(b.profile().memories.length,0);
  fs.writeFileSync(chat,source());await b.sync();
  assert.equal(b.profile().memories.length,0);
  assert.ok(b.candidates().some(x=>x.id===item.id),'Re-import original hash allows re-approval');
  b.review(item.id,'confirmed');assert.equal(b.profile().memories.length,1);
  // Same size and mtime must not suppress content updates.
  const note=path.join(initial.inbox,'reference.md');
  fs.writeFileSync(note,'Unique reference key: ALPHA');
  await b.sync();
  const before=fs.statSync(note);
  fs.writeFileSync(note,'Unique reference key: BRAVO');
  fs.utimesSync(note,before.atime,before.mtime);
  const same=await b.sync();
  assert.ok(same.indexed>=1,'Actual hash must take precedence over size and mtime');
  assert.equal(b.search('ALPHA').length,0);
  assert.ok(b.search('BRAVO').length>0);
  // 105 confirmed statements must remain in a complete export.
  const many=path.join(initial.inbox,'many.json');
  fs.writeFileSync(many,JSON.stringify([{title:'Fictional many',messages:Array.from({length:105},(_,i)=>({role:'user',text:`我决定建立第${i}个虚构知识清单，以便长期保存模拟资料并进行测试。`}))}]));
  await b.sync();
  for(const m of b.candidates(100))b.review(m.id,'confirmed');
  for(const m of b.candidates(100))b.review(m.id,'confirmed');
  const full=b.profile();
  assert.equal(full.memories.length,106,'Complete default profile must not silently omit older entries');
  assert.equal(full.total,106);
  const pg=b.profile({limit:15,offset:100});
  assert.equal(pg.memories.length,6);assert.equal(pg.total,106);assert.equal(pg.hasMore,false);
  const pg1=b.profile({limit:15});assert.equal(pg1.hasMore,true);
  await w.setFrequency('weekly');
  await w.refreshWorkspace({now:new Date(2026,9,26,9)});
  await w.setFrequency('monthly');
  await w.refreshWorkspace({now:new Date(2026,10,2,9)});
  assert.equal(w.latestOverview('latest').file,'2026-11.md','Latest is based on generation time not lexicographic key');
  assert.ok(fs.readFileSync(path.join(root,w.FOLDERS.persona,'digital-self.md'),'utf8').includes('数字人格'));
  assert.ok(fs.readFileSync(path.join(root,w.FOLDERS.context,'AI-context.md'),'utf8').includes('106'));
  // Escape attempts through symlinked report OR other curated sections are rejected.
  const outside=path.join(tmp,'private-notes.txt');fs.writeFileSync(outside,'PRIVATE_TEST_ONLY_52783');
  try {
    fs.symlinkSync(outside,path.join(root,w.FOLDERS.reviews,'2099-W99.md'));
    assert.throws(()=>w.latestOverview('latest'),/Unsafe|Knowledge file|ELOOP/);
    fs.unlinkSync(path.join(root,w.FOLDERS.reviews,'2099-W99.md'));
    fs.rmSync(path.join(root,w.FOLDERS.persona,'digital-self.md'));
    fs.symlinkSync(outside,path.join(root,w.FOLDERS.persona,'digital-self.md'));
    assert.throws(()=>w.latestOverview('profile'),/Unsafe|Knowledge file|ELOOP/);
    fs.unlinkSync(path.join(root,w.FOLDERS.persona,'digital-self.md'));
    await w.refreshWorkspace({now:new Date(2026,10,3,9)});
  }catch(e){if(!['EPERM','EACCES','ENOTSUP'].includes(e.code))throw e}
  // An OS task launched without custom SIRANOS_HOME must still use its owner folder.
  const preview=s.schedulePreview();
  assert.ok(preview.command.includes('nondefault-config'));
  assert.ok(preview.command.includes('scheduled-run.mjs'));
  assert.ok(preview.command.includes('tick'));
  const call=spawnSync(process.execPath,[new URL('../bridge/scheduled-run.mjs',import.meta.url).pathname,'--home',process.env.SIRANOS_HOME,'tick'],{encoding:'utf8',env:{...process.env,SIRANOS_HOME:''}});
  assert.equal(call.status,0,'Scheduler wrapper runs with custom SIRANOS_HOME: '+call.stderr);
  assert.equal(JSON.parse(call.stdout).root,root);
  let script='';
  await s.installSchedule({platform:'win32',run:(cmd,args)=>{script=Buffer.from(args.at(-1),'base64').toString('utf16le');return {status:0,stdout:'ok'};}});
  assert.ok(script.includes('nondefault-config'),'Windows task must preserve data directory');
  assert.ok(script.includes('scheduled-run.mjs'),'Windows task calls portable wrapper');
  console.log('PASS 0.5.1: parsed file restoration, deletion/re-review, content-hash scan, 106 approved records, pagination, chronological reports, symlink isolation, reinit preference, scheduler custom home');
}finally{await fsp.rm(tmp,{recursive:true,force:true});}
