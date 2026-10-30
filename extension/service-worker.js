importScripts('db.js','importer.js','brain.js');
const API='https://www.googleapis.com/drive/v3';
const UPLOAD='https://www.googleapis.com/upload/drive/v3';
const FOLDER_NAME='SiranOS Private Chat Backups'; // stored folder IDs remain local to each browser profile
const INDEX_NAME='conversations-index.v1.json'; // SiranOS public-alpha index
const BRAIN_NAME='siranos-memory.v1.json';
let working=false;
const now=()=>new Date().toISOString();
async function token(){const r=await chrome.identity.getAuthToken({interactive:false});
  if(!(r?.token||typeof r==='string'))throw new Error('请先在插件页面连接 Google。');return r.token||r;}
async function apiFetch(url,options={}){
  // Only use the Google Drive API/upload host. No third-party network calls.
  const u=new URL(url);if(u.protocol!=='https:'||u.hostname!=='www.googleapis.com')throw new Error('拒绝非 Google 官方 API 地址');
  const t=await token();const r=await fetch(url,{...options,headers:{...(options.headers||{}),Authorization:`Bearer ${t}`}});
  if(r.status===401){await chrome.identity.removeCachedAuthToken({token:t});throw new Error('Google 授权已失效，请在插件中重新连接。');}
  return r;
}
async function responseJSON(r){const body=await r.text();if(!r.ok)throw new Error(`Google Drive HTTP ${r.status}: ${body.slice(0,350)}`);return body?JSON.parse(body):{};}
async function ensureFolder(){
  const {folderId}=await chrome.storage.local.get('folderId');
  if(folderId){const r=await apiFetch(`${API}/files/${encodeURIComponent(folderId)}?fields=id,trashed,mimeType`);
    if(r.ok){const f=await r.json();if(!f.trashed&&f.mimeType==='application/vnd.google-apps.folder')return folderId;}}
  const q=`name = '${FOLDER_NAME.replace(/'/g,"\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const data=await responseJSON(await apiFetch(`${API}/files?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id,name)&pageSize=100`));
  let id=data.files?.[0]?.id;
  if(!id){const d=await responseJSON(await apiFetch(`${API}/files?fields=id,name`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:FOLDER_NAME,mimeType:'application/vnd.google-apps.folder'})}));id=d.id;}
  if(!id)throw new Error('Google 未返回备份目录 ID');
  await chrome.storage.local.set({folderId:id});return id;
}
function filename(r){const p=r.provider||r.id?.split(':')[0]||'chatgpt';
  const safe=String(r.title||'会话').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,65).trim()||'会话';
  const id=String(r.sourceId||r.id).slice(0,76).replace(/[^a-zA-Z0-9_-]/g,'_');
  return `${p}__${safe}__${id}.json`;
}
async function makeSession(r,folderId,size){
  const editing=!!r.driveId;
  const url=editing?`${UPLOAD}/files/${encodeURIComponent(r.driveId)}?uploadType=resumable&fields=id,name,webViewLink`:
    `${UPLOAD}/files?uploadType=resumable&fields=id,name,webViewLink`;
  const meta=editing?{name:filename(r),description:`${r.provider||'ChatGPT'} 会话/活动原始导出；个人备份`}:
    {name:filename(r),mimeType:'application/json',parents:[folderId],description:`${r.provider||'ChatGPT'} 会话/活动原始导出；个人备份`};
  const resp=await apiFetch(url,{method:editing?'PATCH':'POST',headers:{'Content-Type':'application/json; charset=UTF-8','X-Upload-Content-Type':'application/json','X-Upload-Content-Length':String(size)},body:JSON.stringify(meta)});
  if(!resp.ok)throw new Error(`创建上传会话失败 HTTP ${resp.status}: ${(await resp.text()).slice(0,250)}`);
  const location=resp.headers.get('Location');if(!location||!location.startsWith('https://www.googleapis.com/'))throw new Error('未取得可信的 Google 上传会话地址');
  return location;
}
async function preserve(r){const newer=await SiranDB.get(r.id);if(newer?.hash!==r.hash)return;
  newer.uploadSession=r.uploadSession;newer.uploadHash=r.uploadHash;newer.offset=r.offset;await SiranDB.put(newer);}
async function markComplete(r,result){if(!result.id)throw new Error('Google 未返回上传文件 ID。');
  const newer=await SiranDB.get(r.id);if(!newer)return;
  newer.driveId=result.id;newer.syncedHash=r.hash;newer.lastError=null;newer.retryAt=0;newer.attempts=0;
  newer.uploadSession=null;newer.uploadHash=null;newer.offset=0;newer.syncedAt=now();await SiranDB.put(newer);}
async function transfer(session,blob,startOffset=0,onProgress=async()=>{}){
  let offset=startOffset;const size=blob.size,chunkSize=1024*1024;
  if(size===0)throw new Error('空文件不能同步');
  while(offset<size){const end=Math.min(offset+chunkSize,size)-1;
    const resp=await apiFetch(session,{method:'PUT',headers:{'Content-Type':'application/json','Content-Range':`bytes ${offset}-${end}/${size}`},body:blob.slice(offset,end+1)});
    if(resp.status===308){const m=/bytes=0-(\d+)/i.exec(resp.headers.get('Range')||'');const next=m?Number(m[1])+1:end+1;
      if(next<=offset)throw new Error('上传进度未推进，请重试');offset=next;await onProgress(offset);
    }else if(resp.ok){return await resp.json();}
    else throw new Error(`上传失败 HTTP ${resp.status}: ${(await resp.text()).slice(0,250)}`);
  }
  // Upload may be complete server-side but the final response was lost.
  const verify=await apiFetch(session,{method:'PUT',headers:{'Content-Range':`bytes */${size}`}});
  if(verify.ok)return await verify.json();
  throw new Error(`Google 尚未确认上传完成：HTTP ${verify.status}`);
}
async function uploadOne(r,folderId){const blob=new Blob([r.raw],{type:'application/json'}),size=blob.size;
  if(!r.uploadSession||r.uploadHash!==r.hash){r.uploadSession=await makeSession(r,folderId,size);r.uploadHash=r.hash;r.offset=0;await preserve(r);}
  else {
    const probe=await apiFetch(r.uploadSession,{method:'PUT',headers:{'Content-Range':`bytes */${size}`}});
    if(probe.ok){await markComplete(r,await probe.json());return;}
    if(probe.status===308){const range=/bytes=0-(\d+)/i.exec(probe.headers.get('Range')||'');r.offset=range?Number(range[1])+1:0;await preserve(r);}
    else if([404,410].includes(probe.status)){r.uploadSession=await makeSession(r,folderId,size);r.offset=0;r.uploadHash=r.hash;await preserve(r);}
    else throw new Error(`查询上传进度失败 HTTP ${probe.status}`);
  }
  const result=await transfer(r.uploadSession,blob,r.offset,async offset=>{r.offset=offset;await preserve(r);});
  await markComplete(r,result);
}
async function jsonIndexPayload(){const records=await SiranDB.listAll();
  const entries=records.filter(r=>r.hash===r.syncedHash&&r.driveId).map(r=>({id:r.id,source:r.provider||r.id.split(':')[0],
    kind:r.kind||'conversation',title:r.title,created:r.created??null,modified:r.modified??null,
    message_count:r.messageCount??null,topic_tags:r.topicTags||[],sha256:r.hash,drive_file_id:r.driveId,filename:filename(r),
    note:r.warning||null})).sort((a,b)=>a.id.localeCompare(b.id));
  return JSON.stringify({schema:'siranos.index.v1',description:'Private multi-AI chat source index. Raw content lives in separate files.',count:entries.length,entries});
}
async function sha256(text){const bytes=new TextEncoder().encode(text),hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function uploadIndex(folderId){
  const body=await jsonIndexPayload(),hash=await sha256(body),{indexHash,indexId}=await chrome.storage.local.get(['indexHash','indexId']);
  if(hash===indexHash&&indexId)return {skipped:true};
  const blob=new Blob([body],{type:'application/json'}),edit=!!indexId;
  const url=edit?`${UPLOAD}/files/${encodeURIComponent(indexId)}?uploadType=resumable&fields=id`:
    `${UPLOAD}/files?uploadType=resumable&fields=id`;
  const metadata=edit?{name:INDEX_NAME}:{name:INDEX_NAME,parents:[folderId],mimeType:'application/json'};
  const resp=await apiFetch(url,{method:edit?'PATCH':'POST',headers:{'Content-Type':'application/json','X-Upload-Content-Type':'application/json','X-Upload-Content-Length':String(blob.size)},body:JSON.stringify(metadata)});
  if(!resp.ok)throw new Error(`创建索引上传失败 HTTP ${resp.status}`);
  const session=resp.headers.get('Location');if(!session?.startsWith('https://www.googleapis.com/'))throw new Error('索引上传会话无效');
  const result=await transfer(session,blob);if(!result.id)throw new Error('索引上传后 Google 未返回 ID');
  await chrome.storage.local.set({indexHash:hash,indexId:result.id,indexUpdatedAt:now()});return {count:JSON.parse(body).count};
}
async function uploadBrain(folderId){
  const body=JSON.stringify({schema:'siranos.memory.v1',createdAt:now(),memories:await SiranDB.listMemories()});
  // Date in the payload changes every time; use content-only hash to skip unchanged data.
  const content=await SiranDB.listMemories(),hash=await sha256(JSON.stringify(content));
  const st=await chrome.storage.local.get(['brainHash','brainFileId']);
  if(st.brainHash===hash&&st.brainFileId)return {skipped:true};
  let existing=st.brainFileId||null;
  if(!existing){const found=(await folderFiles(folderId)).find(f=>f.name===BRAIN_NAME);existing=found?.id||null;}
  const meta=existing?{name:BRAIN_NAME}:{name:BRAIN_NAME,parents:[folderId],mimeType:'application/json'};
  const blob=new Blob([body],{type:'application/json'});
  const r=await apiFetch(existing?`${UPLOAD}/files/${encodeURIComponent(existing)}?uploadType=resumable&fields=id`:`${UPLOAD}/files?uploadType=resumable&fields=id`,
    {method:existing?'PATCH':'POST',headers:{'Content-Type':'application/json','X-Upload-Content-Type':'application/json','X-Upload-Content-Length':String(blob.size)},body:JSON.stringify(meta)});
  if(!r.ok)throw new Error('创建记忆云端备份失败 HTTP '+r.status);
  const session=r.headers.get('Location');if(!session?.startsWith('https://www.googleapis.com/'))throw new Error('记忆云端备份会话地址无效');
  const result=await transfer(session,blob);if(!result.id)throw new Error('Google 未返回记忆备份 ID');
  await chrome.storage.local.set({brainFileId:result.id,brainHash:hash,brainCloudAt:now()});return {count:content.length};
}
async function folderFiles(folderId){let pageToken='',out=[];
  do{const q=`'${folderId.replace(/'/g,"\\'")}' in parents and trashed = false`;
    const u=`${API}/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent('nextPageToken,files(id,name,mimeType)')}&pageSize=1000`+(pageToken?'&pageToken='+encodeURIComponent(pageToken):'');
    const r=await responseJSON(await apiFetch(u));out.push(...(r.files||[]));pageToken=r.nextPageToken||'';
  }while(pageToken&&out.length<10000);
  return out;
}
async function fileText(id){const r=await apiFetch(`${API}/files/${encodeURIComponent(id)}?alt=media`);
 if(!r.ok)throw new Error(`无法读取 Google 文件 ${id}：HTTP ${r.status}`);return await r.text();}
async function restoreCloud(limit=18){
 const folderId=await ensureFolder(),files=await folderFiles(folderId);
 const idx=files.find(f=>f.name===INDEX_NAME);
 if(!idx)return {error:'未找到云端聊天索引，可能尚未完成聊天首次同步。'};
 await chrome.storage.local.set({indexId:idx.id,folderId});
 const json=JSON.parse(await fileText(idx.id));if(!Array.isArray(json.entries))throw new Error('云端索引格式无法识别');
 const current=await chrome.storage.local.get(['restoreIndexId','restorePosition']);
 let pos=current.restoreIndexId===idx.id?Number(current.restorePosition||0):0,stats={added:0,unchanged:0,conflict:0,failed:0};
 const entries=json.entries;
 for(let n=0;pos<entries.length&&n<limit;pos++,n++){
  const entry=entries[pos];try{
   if(!entry.id||!entry.drive_file_id||!entry.sha256)throw new Error('索引条目字段不完整');
   const existing=await SiranDB.get(entry.id);
   if(existing){if(existing.hash===entry.sha256){stats.unchanged++;continue;}stats.conflict++;continue;}
   const raw=await fileText(entry.drive_file_id),hash=await sha256(raw);
   if(hash!==entry.sha256)throw new Error('原文 SHA-256 与云端索引不符');
   const c=JSON.parse(raw),provider=entry.source||entry.id.split(':')[0],messages=SiranImporter.toMessages(provider,c);
   const restored={id:entry.id,provider,kind:entry.kind||'conversation',sourceId:entry.id.slice(provider.length+1),
    title:entry.title||'会话',created:entry.created??null,modified:entry.modified??null,raw,hash,
    searchText:(entry.title+'\n'+messages.map(m=>m.text).filter(Boolean).join('\n')).slice(0,2000000),
    topicTags:entry.topic_tags||[],messageCount:entry.message_count??messages.length,
    warning:entry.note||'',driveId:entry.drive_file_id,syncedHash:hash,lastError:null,receivedAt:now()};
   await SiranDB.put(restored);stats.added++;
  }catch(e){stats.failed++;stats.lastError=String(e.message||e).slice(0,200);}
 }
 await chrome.storage.local.set({restoreIndexId:idx.id,restorePosition:pos});
 let memories=null;if(pos===entries.length){const brain=files.find(f=>f.name===BRAIN_NAME);
  if(brain){try{const b=JSON.parse(await fileText(brain.id));if(b.schema==='siranos.memory.v1'&&Array.isArray(b.memories)){
    let added=0;for(const m of b.memories){if(!m.id||!m.source?.conversationId||await SiranDB.memory(m.id))continue;
      const local=await SiranDB.get(m.source.conversationId);await SiranDB.putMemory({...m,sourceStale:!local||local.hash!==m.source.sourceHash});added++;}memories={added};
    await chrome.storage.local.set({brainFileId:brain.id});}
   }catch(e){memories={error:String(e.message||e)};}}
 }
 return {total:entries.length,position:pos,remaining:entries.length-pos,stats,memories};
}
async function sync(){
  if(working)return {busy:true};const {syncEnabled}=await chrome.storage.local.get('syncEnabled');if(!syncEnabled)return {disabled:true};
  working=true;let completed=0,failed=0;let lastMessage='';
  try{
    const folderId=await ensureFolder(),seen=[];
    for(let i=0;i<6;i++){
      const r=await SiranDB.nextPending(seen);if(!r)break;seen.push(r.id);
      try{await uploadOne(r,folderId);completed++;}
      catch(e){failed++;lastMessage=String(e.message||e);const newest=await SiranDB.get(r.id);
        if(newest?.hash===r.hash){newest.attempts=(newest.attempts||0)+1;
          newest.retryAt=Date.now()+Math.min(3600000,60000*Math.pow(2,Math.min(newest.attempts-1,6)));
          newest.lastError=lastMessage.slice(0,400);await SiranDB.put(newest);}}
    }
    const stats=await SiranDB.stats();let indexResult=null;
    if(stats.pending===0&&stats.synced>0){try{indexResult=await uploadIndex(folderId);}catch(e){lastMessage='索引未同步：'+String(e.message||e);}}
    let brainResult=null;if(stats.pending===0){try{brainResult=await uploadBrain(folderId);}catch(e){lastMessage='记忆云端备份未同步：'+String(e.message||e);}}
    await chrome.storage.local.set({lastSync:now(),lastError:lastMessage||null});
    return {completed,failed,folderId,index:indexResult,brain:brainResult,error:lastMessage||null};
  }catch(e){lastMessage=String(e.message||e);await chrome.storage.local.set({lastError:lastMessage.slice(0,400)});return {completed,failed,error:lastMessage};}
  finally{working=false;}
}
function ensureAlarm(){chrome.alarms.create('siran-sync',{periodInMinutes:1});}
chrome.runtime.onInstalled.addListener(async()=>{ensureAlarm();const {syncEnabled}=await chrome.storage.local.get('syncEnabled');if(syncEnabled===undefined)await chrome.storage.local.set({syncEnabled:false});});
chrome.runtime.onStartup.addListener(ensureAlarm);
chrome.alarms.onAlarm.addListener(e=>{if(e.name==='siran-sync')sync();});
chrome.action.onClicked.addListener(()=>chrome.runtime.openOptionsPage());
chrome.runtime.onMessage.addListener((msg,sender,respond)=>{
  if(msg?.type==='SYNC'){sync().then(respond).catch(e=>respond({error:String(e)}));return true;}
  if(msg?.type==='RESTORE'){restoreCloud().then(respond).catch(e=>respond({error:String(e.message||e)}));return true;}
  if(msg?.type==='STATUS'){Promise.all([SiranDB.stats(),chrome.storage.local.get(['folderId','lastSync','lastError','syncEnabled','indexUpdatedAt','brainCloudAt'])])
    .then(([stats,settings])=>respond({stats,...settings})).catch(e=>respond({error:String(e)}));return true;}
});
