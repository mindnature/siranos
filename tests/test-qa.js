const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'../extension'),conversations=new Map(),memories=new Map();
const SiranDB={get:async id=>conversations.get(id),put:async r=>conversations.set(r.id,r),putVersion:async()=>{},
  memory:async id=>memories.get(id),putMemory:async r=>memories.set(r.id,r),listMemories:async()=>[...memories.values()],listAll:async()=>[...conversations.values()],
  forEachConversation:async callback=>{for(const r of conversations.values())callback(r);}};
const chrome={storage:{local:{set:async()=>{}}}};
const ctx={SiranDB,chrome,crypto:globalThis.crypto,TextEncoder,TextDecoder,DecompressionStream,Blob,File,Response,console,Date,setTimeout};
vm.createContext(ctx);
for(const f of ['importer.js','brain.js','persona.js','qa.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx);
vm.runInContext('globalThis.Importer=SiranImporter;globalThis.Brain=SiranBrain;globalThis.QA=SiranQA;globalThis.Persona=SiranPersona',ctx);
(async()=>{
 const record=[{id:'fake-chat-1',title:'公益阅读活动',create_time:1761671111,mapping:{
  a:{message:{author:{role:'user'},create_time:1761671111,content:{parts:['我决定开展社区阅读活动，目标是让参加者一起阅读公共领域图书。']}}},
  b:{message:{author:{role:'assistant'},create_time:1761671112,content:{parts:['我去年收入一千万元，并且研发了航天飞机。']}}},
  c:{message:{author:{role:'user'},create_time:1761671113,content:{parts:['我想先试运行每周一次读书会，观察实际参与情况。']}}}}}];
 const r=await ctx.Importer.parseJSON(JSON.stringify(record),'demo.json');
 await ctx.Importer.importConversation(r.items[0]);
 const q=await ctx.QA.ask('社区阅读活动的目标是什么');
 assert.ok(q.evidence.length>=1,'source-backed retrieval');
 assert.ok(q.evidence.every(x=>x.role==='user'));
 assert.match(q.summary,/社区阅读|参加者/);
 assert.equal(q.coverage.scannedConversations,1);
 const empty=await ctx.QA.ask('航天飞机研发收入一千万元');
 assert.equal(empty.evidence.length,0,'assistant-only inventions excluded');
 const pending=await ctx.Brain.proposeEvidence(q.evidence[0]);
 assert.equal(pending.memory.status,'pending');
 assert.equal((await ctx.Brain.proposeEvidence(q.evidence[0])).created,false,'dedup even when repeated');
 assert.equal((await ctx.Persona.current()).entries.some(x=>x.id===pending.memory.id),false,'pending not profile');
 await ctx.Brain.review(pending.memory.id,'confirmed');
 assert.equal((await ctx.Persona.current()).entries.some(x=>x.id===pending.memory.id),true,'confirmed memory included');
 await ctx.Brain.review(pending.memory.id,'dismissed');
 assert.equal((await ctx.Persona.current()).entries.some(x=>x.id===pending.memory.id),false,'revocation reflected');
 await assert.rejects(ctx.Brain.proposeEvidence({...q.evidence[0],sourceHash:'different'}),/来源已变更/);
 await assert.rejects(ctx.Brain.proposeEvidence({...q.evidence[0],messageIndex:1}),/用户消息/);
 console.log('PASS evidence Q&A: user-only retrieval, provenance, no-evidence handling, source verification, pending/confirmed/revoked flow');
})().catch(e=>{console.error(e);process.exitCode=1;});
