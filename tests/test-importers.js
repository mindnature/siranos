const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const imp=fs.readFileSync(__dirname+'/../extension/importer.js','utf8');
const store=new Map();
global.SiranDB={get:async id=>structuredClone(store.get(id)),put:async v=>store.set(v.id,structuredClone(v)),putVersion:async v=>{}};
vm.runInThisContext(imp+'\nglobalThis.Importer=SiranImporter;');
const json=JSON.stringify;
(async()=>{
  const fixtures=[
    ['chatgpt', [{id:'cg-1',title:'AI创业',create_time:100,
      mapping:{a:{message:{author:{role:'user'},content:{parts:['如何创业？']},create_time:100}}}}], 'chatgpt:cg-1'],
    ['claude', [{uuid:'cl-1',name:'Claude 教学',created_at:'2026-10-20',
      chat_messages:[{sender:'human',text:'讲课怎么用AI'},{sender:'assistant',content:[{type:'text',text:'教师可以用案例'}]}]}], 'claude:cl-1'],
    ['gemini', [{time:'2026-10-20T08:00:00Z',title:'Prompted 一个研究问题',safeHtmlItem:[{html:'<p>可以从<b>验证器</b>入手</p>'}]}], null],
    ['deepseek', [{id:'ds-1',title:'DeepSeek 推理',mapping:{a:{fragments:[{type:'REQUEST',content:'问题'},{type:'RESPONSE',content:'答案'}]}}}], 'deepseek:ds-1'],
    ['grok', {conversations:[{conversation:{id:'grok-1',title:'Grok 观点'},responses:[{response:{sender:'human',message:'今天热点'}},{response:{sender:'assistant',message:'今日趋势'}}]}]}, 'grok:grok-1']
  ];
  for(const [name,root,key] of fixtures){
    const r=await Importer.parseJSON(json(root),name+'.json');
    assert.equal(r.items.length,1,name);assert.equal(r.items[0].provider,name,name);
    if(key)assert.equal(r.items[0].id,key);
    assert.ok(r.items[0].raw.includes(name==='grok'?'Grok':name==='gemini'?'Prompted':name==='claude'?'讲课':name==='deepseek'?'REQUEST':'如何创业'));
    assert.ok(r.items[0].searchText.length>3,name);
    assert.equal(await Importer.importConversation(r.items[0]),'added');
    assert.equal(await Importer.importConversation(r.items[0]),'unchanged');
  }
  const updated=await Importer.parseJSON(json([{uuid:'cl-1',name:'Claude 教学',chat_messages:[{sender:'assistant',text:'改成阶段测试'}]}]),'claude.json');
  assert.equal(await Importer.importConversation(updated.items[0]),'updated');
  assert.ok(store.get('claude:cl-1').searchText.includes('阶段测试'));
  const bad=[{email:'private@example.org',subscriptions:['secret']}];
  await assert.rejects(Importer.parseJSON(json(bad),'account.json'),/无法识别/);
  const file=new File([json(fixtures[0][1])],'conversations.json');
  const r=await Importer.readFile(file);assert.equal(r.items[0].provider,'chatgpt');
  const textFile=new File(['一段手工反思文本'],'grok_note.md');
  const txt=await Importer.readFile(textFile,()=>{},'grok');assert.equal(txt.items[0].provider,'grok');assert.equal(txt.items[0].kind,'text');
  const zip=await Importer.readFile(new File([fs.readFileSync(__dirname+'/multi-provider-fixture.zip')],'export.zip'));
  assert.equal(zip.items.length,4,'zip contents: cg, claude, Gemini, grok');
  assert.ok(zip.warnings.some(w=>w.includes('其余')));
  console.log('PASS multi-provider parser: 5 providers, zip, dedup, metadata, text integrity, unsafe skip');
})().catch(e=>{console.error(e);process.exitCode=1;});
