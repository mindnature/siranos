'use strict';
const $=id=>document.getElementById(id),N=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!=null)el.textContent=String(text);return el;};
const displayTime=v=>{if(!v)return '日期未知';const d=new Date(typeof v==='number'&&v<1e12?v*1000:v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString('zh-CN');};
const send=type=>chrome.runtime.sendMessage({type});
const message=(id,text)=>{$(id).textContent=String(text);};
let reviewMd='';let busy=false;let importAbort=null;
$('cancelImport').addEventListener('click',()=>{if(importAbort)importAbort.abort();});
function goto(view){document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x.id===`view-${view}`));document.querySelectorAll('.nav').forEach(x=>x.classList.toggle('active',x.dataset.view===view));
 const titles={dashboard:'总览',import:'导入与备份',search:'原文检索',qa:'向历史提问',memories:'长期记忆',projects:'知识项目',persona:'数字人格',review:'七日复盘',settings:'设置与恢复'};
 $('pageTitle').textContent=titles[view]||'个人知识库';location.hash=view;
 if(view==='memories')renderMemories();if(view==='projects')renderProjects();if(view==='persona')renderPersona();if(view==='dashboard')renderDashboard();if(view==='settings')renderSettings();}
document.querySelectorAll('[data-view],[data-go]').forEach(b=>b.addEventListener('click',()=>goto(b.dataset.view||b.dataset.go)));
async function refresh(){try{const s=await send('STATUS'),stats=s.stats||{total:0,synced:0,pending:0,failed:0,providers:{}};
 $('statTotal').textContent=stats.total;$('statSynced').textContent=stats.synced;
 $('driveStatus').textContent=s.folderId?'Google Drive 已配置':'Google Drive 未连接';$('sideState').textContent=s.folderId?'已连接私有云盘':'本地优先 · 待连接';
 $('auto').checked=!!s.syncEnabled;$('folder').disabled=!s.folderId;$('folder').dataset.id=s.folderId||'';
 $('last').textContent='最近同步：'+(s.lastSync?displayTime(s.lastSync):'尚无');message('cloudError',s.lastError||'');
 $('importCloudChip').textContent=s.folderId?'已建立云端目录':'未建立云端目录';
 const mem=await SiranDB.listMemories();$('statPending').textContent=mem.filter(m=>m.status==='pending').length;
 $('statConfirmed').textContent=mem.filter(m=>m.status==='confirmed').length;
 return {stats,mem,s};
 }catch(e){$('driveStatus').textContent='本地状态异常';message('cloudError',e.message||String(e));return null;}}
async function sync(){const r=await send('SYNC');if(r.error)throw new Error(r.error);return r;}
$('quickSync').addEventListener('click',async()=>{try{$('quickSync').disabled=true;await sync();await refresh();}catch(e){alert('同步失败：'+e.message);}finally{$('quickSync').disabled=false;}});
$('auth').addEventListener('click',async()=>{try{$('auth').disabled=true;const r=await chrome.identity.getAuthToken({interactive:true});if(!(r?.token||typeof r==='string'))throw new Error('Google 登录授权未返回令牌');
 await chrome.storage.local.set({syncEnabled:true});const x=await sync();message('progress',x.error||'Google Drive 已连接，云端目录已建立');await refresh();
 }catch(e){message('progress','授权或目录连接失败：'+String(e.message||e));}finally{$('auth').disabled=false;}});
$('sync').addEventListener('click',async()=>{try{message('progress','正在同步，短时间内可能只处理部分记录……');const r=await sync();message('progress',`本轮上传成功 ${r.completed||0}，失败 ${r.failed||0}；记忆快照：${r.brain?.count??(r.brain?.skipped?'无变更':'未更新')}。`);await refresh();}catch(e){message('progress','同步失败：'+String(e.message||e));}});
$('auto').addEventListener('change',async e=>{await chrome.storage.local.set({syncEnabled:e.target.checked});if(e.target.checked){try{await sync();}catch{}}await refresh();});
$('folder').addEventListener('click',()=>{const id=$('folder').dataset.id;if(id)chrome.tabs.create({url:`https://drive.google.com/drive/u/0/folders/${encodeURIComponent(id)}`});});
$('consent').addEventListener('change',()=>{$('importBtn').disabled=!$('consent').checked;});
$('importBtn').addEventListener('click',async()=>{const files=[...$('file').files];if(!files.length){message('progress','请先选择导出文件');return;}
 if(busy)return;busy=true;importAbort=new AbortController();$('cancelImport').disabled=false;$('importBtn').disabled=true;const totals={added:0,updated:0,unchanged:0,failed:0,memories:0,invalidated:0},notes=[];
 try{for(const file of files){message('progress','正在解析：'+file.name);try{
  let count=0;
  const accept=async item=>{try{const state=await SiranImporter.importConversation(item);totals[state]++;
    if(state!=='unchanged'){const x=await SiranBrain.onImport(item);totals.memories+=x.created;totals.invalidated+=x.invalidated;}
   }catch(e){totals.failed++;notes.push(`${item.title}: ${String(e.message||e).slice(0,180)}`);}
   count++;if(count%25===0){message('progress',`${file.name}：已处理 ${count} 条`);await new Promise(r=>setTimeout(r,0));}};
  const ext=file.name.split('.').at(-1).toLowerCase();
  if(ext==='html'||(ext==='json'&&file.size>100*1024*1024)){
    const result=await SiranStreaming.importFile(file,accept,t=>message('progress',t),{signal:importAbort.signal,hint:$('provider').value,onWarning:w=>{if(notes.length<150)notes.push(String(w));}});
    notes.push(`流式导入：扫描 ${result.items} 个对象、可识别 ${result.recognized} 条；附件和媒体未导入。`);
  }else{
    const data=await SiranImporter.readFile(file,t=>message('progress',t),$('provider').value);notes.push(...data.warnings);
    for(const item of data.items)await accept(item);
  }
 }catch(e){totals.failed++;notes.push(file.name+'：'+String(e.message||e));}}
 message('warnings',notes.length?notes.join('\n'):'未发现明确解析错误，仍需与原始导出数量核对。');
 let cloud='';const st=await chrome.storage.local.get('syncEnabled');if(st.syncEnabled){try{const r=await sync();cloud=`；本轮云端成功 ${r.completed||0} 条`;if(r.error)cloud+='，异常：'+r.error;}catch(e){cloud='；云端同步待重试：'+e.message;}}
 message('progress',`完成：新增 ${totals.added}，更新 ${totals.updated}，去重 ${totals.unchanged}，失败 ${totals.failed}。新增记忆候选 ${totals.memories}，来源变更待复核 ${totals.invalidated}${cloud}。`);
 await refresh();
 }finally{busy=false;importAbort=null;$('cancelImport').disabled=true;$('importBtn').disabled=!$('consent').checked;}});
$('rebuild').addEventListener('click',async()=>{if(busy)return;busy=true;$('rebuild').disabled=true;try{const r=await SiranBrain.processExisting((i,total)=>message('progress',`扫描旧记录 ${i}/${total}…`));message('progress',`已扫描 ${r.scanned} 条，新增候选 ${r.created} 条，需复核 ${r.invalidated} 条。`);await refresh();}catch(e){message('progress','补建失败：'+String(e.message||e));}finally{busy=false;$('rebuild').disabled=false;}});
async function openSource(conversationId,index,quote=''){const rec=await SiranDB.get(conversationId);if(!rec){alert('无法找到原始会话。可能尚未恢复本地数据。');return;}
 const msgs=SiranBrain.msgs(rec);const m=index==null?null:msgs[index];$('dialogTitle').textContent=rec.title||'原始资料';
 $('dialogMeta').textContent=`${rec.provider||''} · ${rec.id} · 消息 ${index==null?'未知':index+1}/${msgs.length} · ${m?displayTime(m.date):displayTime(rec.created)}`;
 $('dialogBody').textContent=m?`角色：${m.role||'未知'}\n\n${String(m.text||'（未取得文本）').slice(0,100000)}`:(quote||rec.raw.slice(0,100000));
 $('sourceDialog').showModal();}
$('dialogClose').addEventListener('click',()=>$('sourceDialog').close());
function sourceLink(r,index,quote){const b=N('button','','查看对应原话 →');b.addEventListener('click',()=>openSource(r,index,quote));return b;}
async function search(){const query=$('query').value.trim();if(!query){message('searchCount','请先输入关键词');return;}
 const rows=await SiranBrain.searchEvidence(query,{provider:$('searchProvider').value,limit:60});message('searchCount',`找到 ${rows.length} 个消息命中（最多展示60条）。`);
 const root=$('results');root.replaceChildren();if(!rows.length){root.append(N('p','hint','未在已导入的资料中找到匹配消息。这不等于历史上从未讨论过。'));return;}
 for(const r of rows){const box=N('article','source-hit'),h=N('h4','',r.conversationTitle||'未命名会话');const meta=N('div','meta',`${r.provider} · ${r.role} · ${displayTime(r.date)} · 消息位置 ${r.messageIndex==null?'未知':r.messageIndex+1}`),body=N('p','',r.excerpt);box.append(h,meta,body,sourceLink(r.conversationId,r.messageIndex,r.excerpt));root.append(box);}}
// Offline, source-linked question answering. No LLM, no network request.
async function askHistory(){const q=$('qaQuestion').value.trim();if(!q){message('qaSummary','请输入一个关于历史资料的问题。');return;}
 const btn=$('qaAsk');btn.disabled=true;message('qaSummary','正在本地扫描已导入的用户发言…');$('qaEvidence').replaceChildren();
 try{const r=await SiranQA.ask(q);message('qaSummary',r.summary);message('qaCaveat',`${r.caveat} 本次实际检查会话：${r.coverage.scannedConversations}。`);
  for(const [i,e] of r.evidence.entries()){
   const card=N('article','source-hit'),head=N('h4','',`证据 ${i+1} · ${e.conversationTitle||'未命名会话'}`),meta=N('p','meta',`${e.provider} · ${displayTime(e.date)} · 消息 ${e.messageIndex+1}`),p=N('p','',e.excerpt),buttons=N('div','buttons');
   const view=N('button','btn secondary','查看完整原话');view.addEventListener('click',()=>openSource(e.conversationId,e.messageIndex,e.excerpt));
   const pending=N('button','btn primary','加入记忆审核');pending.addEventListener('click',async()=>{pending.disabled=true;
    try{const result=await SiranBrain.proposeEvidence(e);pending.textContent=result.created?'已加入待审核':'该原话已经有审核记录';await refresh();}
    catch(err){pending.disabled=false;alert('加入失败：'+String(err.message||err));}});
   buttons.append(view,pending);card.append(head,meta,p,buttons);$('qaEvidence').append(card);
  }
 }catch(e){message('qaSummary','本地问答失败：'+String(e.message||e));}finally{btn.disabled=false;}}
$('qaAsk').addEventListener('click',askHistory);
$('qaQuestion').addEventListener('keydown',e=>{if(e.key==='Enter')askHistory();});
$('search').addEventListener('click',search);$('query').addEventListener('keydown',e=>{if(e.key==='Enter')search();});
for(const id of ['memoryStatus','memoryProject'])$(id).addEventListener('change',renderMemories);
$('refreshMemory').addEventListener('click',renderMemories);
async function renderMemories(){const current=$('memoryProject').value;
 const select=$('memoryProject');select.replaceChildren();select.add(new Option('全部主题','all'));for(const p of SiranBrain.PROJECTS.concat(['未分类']))select.add(new Option(p,p));select.value=SiranBrain.PROJECTS.concat(['未分类','all']).includes(current)?current:'all';
 const records=await SiranBrain.listMemories({status:$('memoryStatus').value,project:select.value,limit:500});message('memoryCount',`显示 ${records.length} 条。只有人工确认后才视为长期记忆。`);
 const box=$('memoryList');box.replaceChildren();if(!records.length){box.append(N('p','hint','暂无符合条件的记忆。导入资料或扫描旧数据后可生成候选。'));return;}
 for(const m of records){const card=N('article','memory-card'),head=N('div','head');head.append(N('span','chip',m.type),N('span','chip',m.project));if(m.sourceStale)head.append(N('span','badge-warn','来源已更新 · 待复核'));
 const para=N('p','',m.text),meta=N('p','meta',`${m.source?.provider||''} · ${displayTime(m.eventDate)} · ${m.source?.conversationTitle||''}`),buttons=N('div','buttons');
 if(m.status!=='confirmed'){const a=N('button','btn primary','确认记忆');a.disabled=!!m.sourceStale;a.title=m.sourceStale?'原始会话发生变化，需要先核对后重新生成候选':'';
  a.addEventListener('click',async()=>{try{await SiranBrain.review(m.id,'confirmed');await refresh();await renderMemories();}catch(e){alert(e.message);}});buttons.append(a);}
 if(m.status!=='dismissed'){const a=N('button','btn secondary','忽略');a.addEventListener('click',async()=>{await SiranBrain.review(m.id,'dismissed');await refresh();await renderMemories();});buttons.append(a);}
 if(m.status!=='pending'){const a=N('button','btn secondary','改回待确认');a.addEventListener('click',async()=>{await SiranBrain.review(m.id,'pending');await refresh();await renderMemories();});buttons.append(a);}
 const link=N('button','btn secondary','查看证据');link.addEventListener('click',()=>openSource(m.source.conversationId,m.source.messageIndex,m.source.quote));buttons.append(link);
 card.append(head,para,meta,buttons);box.append(card);}
}
async function renderProjects(){const projects=await SiranBrain.projectSummary(),box=$('projectCards');box.replaceChildren();if(!projects.length){box.append(N('p','hint','导入聊天后自动建立项目关联。'));return;}
 for(const p of projects){const c=N('article','project-card'),h=N('h3','',p.name),desc=N('p','hint','按内容标签自动归类，项目进度仍以真实行动和证据为准。'),n=N('div','numbers');
 n.append(N('span','',`会话 ${p.conversations}`),N('span','',`确认记忆 ${p.confirmed}`),N('span','',`待审核 ${p.pending}`));c.append(h,desc,n);box.append(c);}}
async function renderDashboard(){const p=await SiranBrain.projectSummary(),m=await SiranBrain.listMemories({status:'pending',limit:4}),box=$('dashboardProjects'),mb=$('dashboardMemories');box.replaceChildren();mb.replaceChildren();
 if(!p.length)box.append(N('p','hint','导入聊天后展示关联的项目主题。'));
 for(const x of p.slice(0,6)){const row=N('div','project-line');row.append(N('b','',x.name),N('small','',`${x.conversations} 条会话 · ${x.confirmed} 条确认记忆`));box.append(row);}
 if(!m.length)mb.append(N('p','hint','目前没有待审核记忆。'));
 for(const x of m){const row=N('div','record'),tag=N('span','tag',x.type),quote=N('p','',x.text.slice(0,125));row.append(tag,N('span','',x.project),quote);mb.append(row);}}
async function renderPersona(){
 const profile=await SiranPersona.current(),stats=$('personaStats'),root=$('personaGroups');stats.replaceChildren();root.replaceChildren();
 for(const [k,v] of [['人工确认且证据有效',profile.summary.approved],['尚待确认',profile.summary.pending],['来源变化需复核',profile.summary.stale],['有据可查的会话',profile.summary.sourceConversations]])stats.append(N('div','',`${k}：${v}`));
 const ids=profile.groups.filter(g=>g.entries.length);
 if(!ids.length){root.append(N('p','hint','暂无有完整证据的已确认记忆。先导入聊天，然后在“长期记忆审核”中确认原话。'));return;}
 for(const g of ids){const panel=N('section','panel'),head=N('div','section-head'),h=N('h3','',g.title),small=N('span','chip',`${g.entries.length} 条`);head.append(h,small);panel.append(head);
  for(const m of g.entries.slice(0,24)){const card=N('article','memory-card'),p=N('p','',m.text),meta=N('p','meta',`${m.project} · ${displayTime(m.eventDate)} · ${m.evidence.provider} · ${m.evidence.conversationTitle}`);card.append(p,meta,sourceLink(m.evidence.conversationId,m.evidence.messageIndex,m.text));panel.append(card);}
  if(g.entries.length>24)panel.append(N('p','hint',`本组显示前24条，剩余 ${g.entries.length-24} 条可在导出的 JSON 查看。`));root.append(panel);}
}
$('personaRefresh').addEventListener('click',renderPersona);
$('personaExport').addEventListener('click',async()=>downloadFile('SiranOS-Digital-Self.json',JSON.stringify(await SiranPersona.current(),null,2)));
$('contextExport').addEventListener('click',async()=>downloadFile('SiranOS-AI-Context.json',JSON.stringify(SiranPersona.compact(await SiranPersona.current()),null,2)));
$('runReview').addEventListener('click',runReview);
async function runReview(){const r=await SiranBrain.weeklyReview(7);const lines=[`# 七日证据复盘`, `时间：${displayTime(r.from)} 至 ${displayTime(r.to)}`,`已导入并具有本周时间戳的记录：${r.conversationCount} 条`,`本周用户审核确认的记忆：${r.confirmed.length} 条`,`本周待确认候选：${r.pendingCount} 条`, '', '## 已确认的线索'];
 if(!r.confirmed.length)lines.push('暂无带有效日期的已确认记忆。');for(const m of r.confirmed)lines.push(`- [${m.type}] ${m.text}（${m.source?.provider||'未知'} / ${m.source?.conversationTitle||'未命名'} / 消息 ${Number(m.source?.messageIndex??0)+1}）`);
 lines.push('','## 关联项目');for(const p of r.projectCounts)lines.push(`- ${p.name}：${p.conversations} 条会话；${p.confirmed} 条确认记忆；${p.pending} 条待审核`);
 lines.push('','## 限制',r.limitations);reviewMd=lines.join('\n');message('reviewContent',reviewMd);}
function downloadFile(name,content,mime='application/json'){const url=URL.createObjectURL(new Blob([content],{type:mime}));const a=N('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
$('exportReview').addEventListener('click',async()=>{if(!reviewMd)await runReview();downloadFile('SiranOS-7日复盘.md',reviewMd,'text/markdown');});
async function renderSettings(){const [stats,mem,versions,info]=await Promise.all([SiranDB.stats(),SiranDB.listMemories(),SiranDB.listVersions(),send('STATUS')]);
 const root=$('statusBlock');root.replaceChildren();const cells=[['本地原始会话',stats.total],['已上传原文',stats.synced],['待上传',stats.pending],['记忆总量',mem.length],['会话历史版本',versions.length],['最近记忆云端同步',info.brainCloudAt?displayTime(info.brainCloudAt):'尚未同步']];for(const [k,v] of cells)root.append(N('div','',`${k}：${v}`));}
$('exportIndex').addEventListener('click',async()=>{const x=await SiranDB.listAll();downloadFile('SiranOS-聊天索引.json',JSON.stringify({schema:'siranos.index.v1',entries:x.map(r=>({id:r.id,provider:r.provider,title:r.title,created:r.created,modified:r.modified,hash:r.hash,driveId:r.driveId,topicTags:r.topicTags}))},null,2));});
$('exportMemories').addEventListener('click',async()=>downloadFile('SiranOS-记忆快照.json',JSON.stringify(await SiranBrain.snapshot(),null,2)));
$('restoreMemories').addEventListener('click',async()=>{const f=$('memoryFile').files[0];if(!f){alert('请先选择记忆 JSON 文件');return;}try{const r=await SiranBrain.importSnapshot(JSON.parse(await f.text()));alert(`成功新增 ${r.added} 条记忆；跳过 ${r.skipped} 条。`);await refresh();}catch(e){alert('恢复失败：'+String(e.message||e));}});
$('restoreCloud').addEventListener('click',async()=>{if(busy)return;busy=true;$('restoreCloud').disabled=true;try{message('restoreLog','正在读取 Google Drive 云端索引与原文…');const r=await send('RESTORE');if(r.error)throw new Error(r.error);
 message('restoreLog',`云端共 ${r.total} 条；已扫描 ${r.position}；剩余 ${r.remaining}。\n本批新增 ${r.stats.added}，一致去重 ${r.stats.unchanged}，版本冲突 ${r.stats.conflict}，失败 ${r.stats.failed}。\n记忆恢复：${JSON.stringify(r.memories||'等待最后一批')}`);await refresh();
 }catch(e){message('restoreLog','恢复失败：'+String(e.message||e));}finally{busy=false;$('restoreCloud').disabled=false;}});
refresh().then(()=>{const initial=location.hash.slice(1);goto(['dashboard','import','search','qa','memories','projects','persona','review','settings'].includes(initial)?initial:'dashboard');}).catch(e=>console.warn('SiranOS start error',e));
