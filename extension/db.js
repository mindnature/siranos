/* SiranOS public alpha: local IndexedDB storage. */
const SiranDB=(()=>{
 'use strict';
 const NAME='siranos-public-local-v1',VERSION=3;
 function open(){return new Promise((yes,no)=>{const q=indexedDB.open(NAME,VERSION);q.onupgradeneeded=()=>{
  for(const s of ['conversations','memories','versions'])if(!q.result.objectStoreNames.contains(s))q.result.createObjectStore(s,{keyPath:'id'});
 };q.onsuccess=()=>yes(q.result);q.onerror=()=>no(q.error);q.onblocked=()=>no(new Error('请关闭其他 SiranOS 标签页后刷新。'));});}
 async function transaction(store,mode,fn){const db=await open();try{return await new Promise((yes,no)=>{const tx=db.transaction(store,mode),req=fn(tx.objectStore(store));let data;req.onsuccess=()=>{data=req.result;};req.onerror=()=>no(req.error);tx.oncomplete=()=>yes(data);tx.onerror=()=>no(tx.error);tx.onabort=()=>no(tx.error||new Error('本地数据库事务中断'));});}finally{db.close();}}
 const get=id=>transaction('conversations','readonly',s=>s.get(id));
 const put=x=>transaction('conversations','readwrite',s=>s.put(x));
 const memory=id=>transaction('memories','readonly',s=>s.get(id));
 const putMemory=x=>transaction('memories','readwrite',s=>s.put(x));
 const version=id=>transaction('versions','readonly',s=>s.get(id));
 const putVersion=x=>transaction('versions','readwrite',s=>s.put(x));
 async function all(store){const db=await open();try{return await new Promise((yes,no)=>{const tx=db.transaction(store,'readonly'),r=tx.objectStore(store).getAll();r.onsuccess=()=>yes(r.result);r.onerror=()=>no(r.error);});}finally{db.close();}}
 const listAll=()=>all('conversations'),listMemories=()=>all('memories'),listVersions=()=>all('versions');
 async function stats(){const all=await listAll(),providers={};let pending=0,synced=0,failed=0;
  for(const c of all){const p=c.provider||(c.id?.split(':')[0]||'chatgpt');providers[p]=(providers[p]||0)+1;
   if(c.hash===c.syncedHash)synced++;else pending++;if(c.lastError)failed++;}return {total:all.length,pending,synced,failed,providers};}
 async function nextPending(exclude=[]){const now=Date.now(),skip=new Set(exclude);return (await listAll()).find(v=>!skip.has(v.id)&&v.hash!==v.syncedHash&&(!v.retryAt||v.retryAt<=now))||null;}
 async function search(query,provider='all',limit=80){const q=String(query||'').trim().toLowerCase(),all=await listAll();let hits=all.filter(v=>(provider==='all'||(v.provider||v.id?.split(':')[0])===provider)&&(!q||String(v.title||'').toLowerCase().includes(q)||String(v.searchText||v.raw||'').toLowerCase().includes(q)));
  hits.sort((a,b)=>time(b.modified??b.created)-time(a.modified??a.created));return {total:hits.length,hits:hits.slice(0,limit).map(v=>({id:v.id,provider:v.provider||v.id?.split(':')[0]||'other',kind:v.kind||'conversation',title:v.title,created:v.created,modified:v.modified,messageCount:v.messageCount??null,topicTags:v.topicTags||[],driveId:v.driveId||null,excerpt:excerpt(v.searchText||'',q),synced:v.hash===v.syncedHash,warning:v.warning||''}))};}
 function time(t){if(typeof t==='number')return t<1e12?t*1000:t;const x=Date.parse(t||'');return Number.isFinite(x)?x:0;}
 function excerpt(text,q){if(!text)return '原始结构已保存，尚未识别可检索文字';const i=q?text.toLowerCase().indexOf(q):0,at=Math.max(0,i-65);return text.slice(at,at+260).replace(/\s+/g,' ');}
 return {open,get,put,listAll,stats,nextPending,search,memory,putMemory,listMemories,version,putVersion,listVersions};
})();
