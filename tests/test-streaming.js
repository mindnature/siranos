const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const base=path.join(__dirname,'../extension');
const ctx={crypto:globalThis.crypto,TextEncoder,TextDecoder,Blob,File,ReadableStream,Response,DecompressionStream,console,Date};
vm.createContext(ctx);
for(const n of ['importer.js','streaming.js'])vm.runInContext(fs.readFileSync(path.join(base,n),'utf8'),ctx);
vm.runInContext('globalThis.Importer=SiranImporter;globalThis.Streamer=SiranStreaming;',ctx);
(async()=>{
 const items=Array.from({length:31},(_,i)=>({id:'synthetic-'+i,conversation_id:'synthetic-'+i,title:'Synthetic discussion '+i,create_time:1761671111,mapping:{
  a:{message:{author:{role:'user'},content:{parts:['我决定参与模拟读书活动 '+i+'，并记录结果。']},create_time:1761671111}},
  b:{message:{author:{role:'assistant'},content:{parts:['测试数据只用于产品校验。']},create_time:1761671112}}
 }}));
 items[0].mapping.a.message.content.parts[0] += ' 扩展文字文本和转义字符\\\"' + '测试内容'.repeat(50000);
 const arr=JSON.stringify(items);
 for(const [name,body] of [['conversations-000.json',arr],['chat.html','<html><head></head><body><script>\n var jsonData = '+arr+';\n var assetsJson = []; </script></body></html>']]){
  const found=[];const result=await ctx.Streamer.importFile(new File([body],name),item=>found.push(item));
  assert.equal(result.items,items.length);assert.equal(found.length,items.length);
  assert.ok(found.every(x=>x.provider==='chatgpt'));
  assert.equal(result.mode,'streaming');
 }
 await assert.rejects(ctx.Streamer.importFile(new File(['<html>bad</html>'],'chat.html'),()=>{}),/jsonData/);
 await assert.rejects(ctx.Streamer.importFile(new File(['[{"id": 1}'],'broken.json'),()=>{}),/缺少会话数组末尾/);
 const ctrl=new AbortController();ctrl.abort();await assert.rejects(ctx.Streamer.importFile(new File([arr],'abort.json'),()=>{},()=>{},{signal:ctrl.signal}),/取消/);
 console.log('PASS streaming importer: JSON arrays, embedded ChatGPT chat.html, per-record callbacks, truncation and cancel');
})().catch(e=>{console.error(e);process.exitCode=1;});
