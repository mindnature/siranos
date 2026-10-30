const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.join(__dirname,'..','extension'),files=new Map(),mem=new Map(),versions=new Map(),config={};
const SiranDB={get:async id=>files.get(id),put:async r=>{files.set(r.id,structuredClone(r));},putVersion:async r=>versions.set(r.id,structuredClone(r)),listVersions:async()=>[...versions.values()],listAll:async()=>[...files.values()],memory:async id=>mem.get(id),putMemory:async r=>mem.set(r.id,structuredClone(r)),listMemories:async()=>[...mem.values()]};
const chrome={storage:{local:{get:async()=>config,set:async x=>Object.assign(config,x)}}};
const ctx={SiranDB,chrome,crypto:globalThis.crypto,TextEncoder,TextDecoder,DecompressionStream,Blob,File,Response,console,setTimeout,Date};
vm.createContext(ctx);for(const f of ['importer.js','brain.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx);vm.runInContext('globalThis.Importer=SiranImporter;globalThis.Brain=SiranBrain',ctx);
(async()=>{
  const mk=(more='')=>[{id:'chat-1',title:'创业与人生',create_time:1761760000,
    mapping:{
      a:{message:{author:{role:'user'},content:{parts:['我决定开发自己的AI第二大脑，目标是保存所有聊天原文。']},create_time:1761760000}},
      b:{message:{author:{role:'assistant'},content:{parts:['我认为你应该投资公司。']},create_time:1761760001}},
      c:{message:{author:{role:'user'},content:{parts:['我已经完成 Google Drive 授权配置。'+more]},create_time:1761760002}}
    }
  }];
  const parsed=await ctx.Importer.parseJSON(JSON.stringify(mk()),'conversations.json');assert.equal(parsed.items.length,1);
  assert.equal(await ctx.Importer.importConversation(parsed.items[0]),'added');
  const added=await ctx.Brain.onImport(parsed.items[0]);assert.equal(added.created,2,'only user candidate messages');
  const found=await ctx.Brain.searchEvidence('Google Drive');assert.equal(found.length,1);assert.equal(found[0].role,'user');
  assert.equal((await ctx.Brain.listMemories()).length,2);
  const first=(await ctx.Brain.listMemories())[0];assert.equal((await ctx.Brain.review(first.id,'confirmed')).status,'confirmed');
  const revised=await ctx.Importer.parseJSON(JSON.stringify(mk(' 改成正式版。')),'conversations.json');
  assert.equal(await ctx.Importer.importConversation(revised.items[0]),'updated');assert.equal(versions.size,1,'previous raw version preserved');
  const upd=await ctx.Brain.onImport(revised.items[0]);assert.ok(upd.invalidated>=1,'stale evidence found');
  assert.equal((await ctx.SiranDB.memory(first.id)).sourceStale,true);
  assert.ok((await ctx.Brain.listMemories()).length>2);
  await assert.rejects(ctx.Brain.review(first.id,'confirmed'),/原始会话已变更/);
  const snap=await ctx.Brain.snapshot();assert.equal(snap.schema,'siran.lifeos.brain.v3');
  const summary=await ctx.Brain.projectSummary();assert.ok(summary.length>=1);
  const review=await ctx.Brain.weeklyReview(7);assert.ok(review.limitations.includes('仅基于'));
  const restore=await ctx.Brain.importSnapshot(snap);assert.equal(restore.added,0,'snapshot dedup');
  assert.equal(await ctx.Importer.importConversation(revised.items[0]),'unchanged');
  console.log('PASS local core: ChatGPT import, role filtering, evidence search, reviewed memory, versioning, stale review, projects, 7-day report, snapshot dedup');
})().catch(e=>{console.error(e);process.exitCode=1;});
