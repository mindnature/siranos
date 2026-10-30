const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const raw=JSON.stringify({id:'c1',title:'多平台测试',text:'x'.repeat(1400000)});
const rec={id:'claude:c1',provider:'claude',sourceId:'c1',title:'多平台测试',raw,hash:'h1',syncedHash:null,
  driveId:null,uploadSession:null,uploadHash:null,offset:0};
const map=new Map([[rec.id,rec]]),cfg={syncEnabled:true};
const SiranDB={get:async k=>structuredClone(map.get(k)),put:async r=>map.set(r.id,structuredClone(r)),
  nextPending:async (exclude=[])=>[...map.values()].filter(v=>v.hash!==v.syncedHash&&!exclude.includes(v.id))[0],
  listAll:async()=>[...map.values()].map(v=>structuredClone(v)),listMemories:async()=>[{id:'M-test',status:'pending',text:'我决定整理演示活动记录',source:{conversationId:'claude:c1',sourceHash:'h1'}}],stats:async()=>({total:1,synced:rec.hash===map.get(rec.id).syncedHash?1:0,pending:map.get(rec.id).syncedHash===rec.hash?0:1,failed:0})};
const ev={addListener:()=>{}},chrome={identity:{getAuthToken:async()=>({token:'test'}),removeCachedAuthToken:async()=>{}},
  storage:{local:{get:async names=>Object.fromEntries((Array.isArray(names)?names:[names]).map(k=>[k,cfg[k]])),set:async ob=>Object.assign(cfg,ob)}},
  alarms:{create:()=>{},onAlarm:ev},runtime:{onInstalled:ev,onStartup:ev,onMessage:ev,openOptionsPage:()=>{}},action:{onClicked:ev}};
const binary={},uploads={},segments=[];let sid=0;
async function fetch(url,opt={}){
  assert.equal(opt.headers?.Authorization,'Bearer test');const method=opt.method||'GET';
  if(url.includes('files?q='))return new Response(JSON.stringify({files:[]}),{status:200});
  if(method==='POST'&&url.includes('files?fields=id,name'))return Response.json({id:'folder-1'});
  if((method==='POST'||method==='PATCH')&&url.includes('uploadType=resumable')){
    const id='upload-'+(++sid);const meta=JSON.parse(opt.body);uploads[id]={meta,parts:[],size:0,len:+opt.headers['X-Upload-Content-Length']};
    return new Response('',{status:200,headers:{Location:'https://www.googleapis.com/'+id}});
  }
  if(url.match(/https:\/\/www\.googleapis\.com\/upload-\d+/)&&method==='PUT'){
    const id=url.slice(url.lastIndexOf('/')+1),st=uploads[id];const range=opt.headers['Content-Range'];
    if(range.startsWith('bytes */'))return st.size===st.len?Response.json({id:st.meta.name==='conversations-index.v1.json'?'index-1':'raw-1'}):new Response('',{status:308,headers:{Range:'bytes=0-'+Math.max(0,st.size-1)}});
    const part=new Uint8Array(await opt.body.arrayBuffer());const match=/bytes (\d+)-(\d+)\/(\d+)/.exec(range);assert.equal(+match[1],st.size);
    st.parts.push(part);st.size+=part.byteLength;segments.push({id,range});if(st.size<st.len)return new Response('',{status:308,headers:{Range:`bytes=0-${st.size-1}`}});
    assert.equal(st.size,st.len);binary[st.meta.name||'unknown']=new TextDecoder().decode(Buffer.concat(st.parts.map(x=>Buffer.from(x))));return Response.json({id:st.meta.name==='conversations-index.v1.json'?'index-1':'raw-1'});
  }
  throw new Error(`unexpected ${method} ${url}`);
}
const ctx={SiranDB,chrome,fetch,importScripts:()=>{},Blob,Response,URL,TextEncoder,crypto:globalThis.crypto,encodeURIComponent,console};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/../extension/service-worker.js','utf8')+'\nglobalThis.runSync=sync;',ctx);
ctx.runSync().then(r=>{console.log('mock result',r,'binary keys',Object.keys(binary),'cfg',cfg);assert.equal(r.completed,1);assert.equal(map.get(rec.id).syncedHash,rec.hash);
  assert.ok(Object.values(binary).includes(raw),'original raw intact');assert.ok(binary['conversations-index.v1.json'].includes('claude:c1'));
  assert.ok(binary['siranos-memory.v1.json'].includes('M-test'),'memory snapshot cloud-uploaded');
  assert.ok(segments.length>=3,'raw content chunked');
  console.log('PASS Drive sync+index: original raw preserved, resumable chunks, index uploaded');
}).catch(e=>{console.error(e);process.exitCode=1;});
