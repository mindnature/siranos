/* SiranOS alpha local evidence-first memory engine.
 * No third-party AI calls. Heuristic candidates require user review.
 */
const SiranBrain=(()=>{
'use strict';
const PROJECTS=['工作与项目','技术与工具','商业与财务目标','创作与兴趣','学习与成长','生活与反思'];
const RULES=[
 {type:'行动',re:/(?:我(?:已经|刚刚|终于|实际)(?:完成|做完|发布|提交|交付|上线|测试|注册|购买|制作)|(?:已经|目前)完成了)/},
 {type:'决策',re:/(?:我(?:决定|选择|确定|打算|准备)(?:要|做|采用|尝试|以)?|最终选定|确定采用)/},
 {type:'目标',re:/(?:我(?:希望|想要|计划|准备|打算)(?:做|实现|开发|研究|创办)?|我的目标|目标是|未来希望)/},
 {type:'反思',re:/(?:我(?:意识到|发现|认为|觉得|认识到|反思|感受到)|我的感受|我学到|这次让我)/},
];
const dateMS=v=>{const t=typeof v==='number'?(v<1e12?v*1000:v):Date.parse(v||'');return Number.isFinite(t)?t:null;};
const iso=v=>{const t=dateMS(v);return t?new Date(t).toISOString():null;};
const norm=x=>String(x||'').replace(/\s+/g,' ').trim();
function msgs(record){try{const c=JSON.parse(record.raw);const p=record.provider||record.id?.split(':')[0];let arr=SiranImporter.toMessages(p,c);if(!arr.length&&record.kind==='text')arr=[{role:'user',text:String(c.content||''),date:record.created??null}];return arr;}catch{return [];}}
function projectOf(record,text=''){const tags=record.topicTags||[];return tags[0]||PROJECTS.find(p=>text.includes(p))||'未分类';}
function splitCandidates(text){const input=String(text||'').replace(/\r/g,'\n');return input.split(/(?<=[。！？!?])|\n+/u).map(norm).filter(s=>s.length>=10&&s.length<=1500).slice(0,60);}
async function digest(s){return SiranImporter.sha256(s);}
async function extract(record){const messages=msgs(record), found=[];
 for(let i=0;i<messages.length;i++){
  const m=messages[i];if(!['user','human'].includes(String(m.role||'').toLowerCase()))continue;
  for(const s of splitCandidates(m.text)){
   const rule=RULES.find(r=>r.re.test(s));if(!rule)continue;
   const quote=s.slice(0,550);
   const hash=await digest(`${record.id}|${record.hash}|${String(i)}|${quote}`);
   found.push({id:'M-'+hash.slice(0,30),type:rule.type,text:quote,project:projectOf(record,s),createdAt:new Date().toISOString(),eventDate:iso(m.date)||iso(record.created)||null,
    status:'pending',source:{conversationId:record.id,provider:record.provider||'other',conversationTitle:record.title,messageIndex:i,sourceHash:record.hash,quote},updatedAt:new Date().toISOString()});
   if(found.length>=80)return found;
  }
 }
 return found;
}
async function onImport(record){const old=await SiranDB.listMemories();let created=0,invalidated=0;
 for(const m of old){if(m.source?.conversationId===record.id&&m.source.sourceHash!==record.hash&&!m.sourceStale){m.sourceStale=true;m.reviewNeeded=true;m.updatedAt=new Date().toISOString();await SiranDB.putMemory(m);invalidated++;}}
 const ids=new Set(old.map(m=>m.id));for(const m of await extract(record)){if(ids.has(m.id))continue;await SiranDB.putMemory(m);ids.add(m.id);created++;}
 if(created||invalidated)await chrome.storage.local.set({brainDirtyAt:new Date().toISOString()});
 return {created,invalidated};}
async function processExisting(progress=()=>{}){const records=await SiranDB.listAll();let created=0,invalidated=0;
 for(let i=0;i<records.length;i++){const r=await onImport(records[i]);created+=r.created;invalidated+=r.invalidated;if(i%10===0){progress(i+1,records.length);await new Promise(r=>setTimeout(r,0));}}
 return {scanned:records.length,created,invalidated};}
async function listMemories({status='all',project='all',limit=600}={}){let all=await SiranDB.listMemories();all=all.filter(m=>(status==='all'||m.status===status)&&(project==='all'||m.project===project));all.sort((a,b)=>(b.eventDate||b.createdAt||'').localeCompare(a.eventDate||a.createdAt||''));return all.slice(0,limit);}
async function review(id,decision){if(!['confirmed','dismissed','pending'].includes(decision))throw new Error('无效的审核状态');const m=await SiranDB.memory(id);if(!m)throw new Error('找不到记忆');
 if(decision==='confirmed'&&m.sourceStale)throw new Error('原始会话已变更，需要人工重新核对证据后才能确认');
 m.status=decision;m.updatedAt=new Date().toISOString();m.reviewNeeded=false;await SiranDB.putMemory(m);await chrome.storage.local.set({brainDirtyAt:new Date().toISOString()});return m;}
async function searchEvidence(query,{provider='all',limit=50}={}){
 const q=norm(query).toLocaleLowerCase();if(!q)return [];
 const records=await SiranDB.listAll(),out=[];
 for(const record of records){if(provider!=='all'&&record.provider!==provider)continue;
 const messages=msgs(record),title=norm(record.title).toLowerCase();
 for(let i=0;i<messages.length;i++){
  const m=messages[i],t=norm(m.text),pos=t.toLowerCase().indexOf(q);if(pos<0&&title.indexOf(q)<0)continue;
  const start=Math.max(0,pos<0?0:pos-75),snip=t.slice(start,start+330);
  out.push({conversationId:record.id,provider:record.provider,conversationTitle:record.title,messageIndex:i,role:m.role||'unknown',date:iso(m.date)||iso(record.created),excerpt:snip,score:pos>=0?3:1,driveId:record.driveId||null,sourceHash:record.hash});
 }
 if(!messages.length&&String(record.searchText||'').toLowerCase().includes(q))out.push({conversationId:record.id,provider:record.provider,conversationTitle:record.title,messageIndex:null,role:'unknown',date:iso(record.created),excerpt:norm(record.searchText).slice(0,330),score:1,driveId:record.driveId||null,sourceHash:record.hash});
 }
 out.sort((a,b)=>b.score-a.score||String(b.date||'').localeCompare(String(a.date||'')));return out.slice(0,limit);
}
async function projectSummary(){const conversations=await SiranDB.listAll(),memories=await SiranDB.listMemories();const out=PROJECTS.concat(['未分类']).map(p=>({name:p,conversations:0,confirmed:0,pending:0,needsReview:0}));
 const map=Object.fromEntries(out.map(x=>[x.name,x]));for(const c of conversations)map[projectOf(c)].conversations++;
 for(const m of memories){const p=map[m.project]||map['未分类'];if(m.status==='confirmed')p.confirmed++;if(m.status==='pending')p.pending++;if(m.sourceStale)p.needsReview++;}
 return out.filter(x=>x.conversations+x.confirmed+x.pending>0);}
async function weeklyReview(days=7){const end=Date.now(),start=end-days*86400000,all=await SiranDB.listAll(),memories=await SiranDB.listMemories();
 const related=all.filter(r=>{const t=dateMS(r.modified??r.created);return t!==null&&t>=start&&t<=end;});
 const confirmed=memories.filter(m=>m.status==='confirmed'&&dateMS(m.eventDate)>=start&&dateMS(m.eventDate)<=end);
 const pending=memories.filter(m=>m.status==='pending'&&dateMS(m.eventDate)>=start&&dateMS(m.eventDate)<=end);
 const projects=await projectSummary();return {days,from:new Date(start).toISOString(),to:new Date(end).toISOString(),conversationCount:related.length,confirmed:confirmed.slice(0,60),pendingCount:pending.length,projectCounts:projects,limitations:'仅基于已导入的记录及可信时间信息；不代表已经访问全部历史聊天。确认记忆是用户审核过的线索，不等于实地成果已核验。'};}
async function snapshot(){return {schema:'siranos.memory.v1',createdAt:new Date().toISOString(),memories:await SiranDB.listMemories()};}
async function importSnapshot(obj){if(obj?.schema!=='siranos.memory.v1'||!Array.isArray(obj.memories))throw new Error('无法识别的记忆快照格式');
 let added=0,skipped=0;for(const m of obj.memories){if(!m.id||!m.source?.conversationId||!['pending','confirmed','dismissed'].includes(m.status)){skipped++;continue;}
 const existing=await SiranDB.memory(m.id);if(existing){skipped++;continue;}await SiranDB.putMemory({...m,status:m.status,sourceStale:!!m.sourceStale});added++;}
 if(added)await chrome.storage.local.set({brainDirtyAt:new Date().toISOString()});return {added,skipped};}
return {PROJECTS,onImport,processExisting,listMemories,review,searchEvidence,projectSummary,weeklyReview,snapshot,importSnapshot,msgs};
})();
