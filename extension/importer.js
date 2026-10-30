/* SiranOS public alpha — local-only multi-provider import and search projection.
 * Original conversation objects are stored verbatim as structured JSON values;
 * normalized message text is ONLY a derivative search index, never a replacement.
 */
const SiranImporter = (() => {
  'use strict';
  const decoder=new TextDecoder('utf-8'), encoder=new TextEncoder();
  const norm=v=>String(v??'').normalize('NFC');
  const isObj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const arr=v=>Array.isArray(v)?v:[];
  async function sha256(v){const b=await crypto.subtle.digest('SHA-256',encoder.encode(String(v)));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
  function scalarText(value){
    if(typeof value==='string')return value;
    if(Array.isArray(value))return value.map(scalarText).filter(Boolean).join('\n');
    if(!isObj(value))return '';
    if(typeof value.text==='string')return value.text;
    if(typeof value.content==='string')return value.content;
    if(typeof value.message==='string')return value.message;
    if(Array.isArray(value.parts))return scalarText(value.parts);
    if(Array.isArray(value.content))return scalarText(value.content);
    if(typeof value.html==='string')return value.html.replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&amp;/gi,'&');
    return '';
  }
  function toMessages(provider,c){
    if(provider==='chatgpt') {
      if(isObj(c.mapping)) return Object.values(c.mapping).map(n=>n?.message).filter(Boolean).sort((a,b)=>(Number(a.create_time)||0)-(Number(b.create_time)||0)).map(m=>({role:m.author?.role||'',text:scalarText(m.content),date:m.create_time??null}));
      return arr(c.messages).map(m=>({role:m.role||m.author||'',text:scalarText(m.text??m.content??m.message),date:m.created_at??m.create_time??null}));
    }
    if(provider==='claude')return arr(c.chat_messages).map(m=>({role:m.sender||'',text:scalarText(m.content)||scalarText(m.text),date:m.created_at||null}));
    if(provider==='gemini')return [{role:'activity',text:[norm(c.title||''),...arr(c.safeHtmlItem).map(scalarText)].filter(Boolean).join('\n'),date:c.time||null}];
    if(provider==='grok')return arr(c.responses).map(r=>r.response||r).map(m=>({role:m.sender||m.role||'',text:scalarText(m.message??m.content??m.text),date:m.create_time||null}));
    if(provider==='deepseek'){
      if(Array.isArray(c.messages))return c.messages.map(m=>({role:m.role||m.sender||m.type||'',text:scalarText(m.content??m.text??m.message??m.fragments),date:m.created_at||null}));
      if(isObj(c.mapping))return Object.values(c.mapping).flatMap(n=>{
        const v=n?.message||n; if(Array.isArray(v?.fragments))return v.fragments.map(f=>({role:f.type||f.role||'',text:scalarText(f),date:f.create_time||null}));
        return [{role:v?.role||v?.type||'',text:scalarText(v?.content??v?.text??v?.message),date:v?.create_time||null}];
      });
      if(Array.isArray(c.fragments))return c.fragments.map(f=>({role:f.type||'',text:scalarText(f),date:f.time||null}));
    }
    if(Array.isArray(c.messages))return c.messages.map(m=>({role:m.role||m.sender||'',text:scalarText(m.text??m.content??m.message),date:m.created_at||null}));
    return [];
  }
  function detectConversation(c,hint='auto') {
    if(!isObj(c))return null;
    if(isObj(c.mapping)&&Object.values(c.mapping).some(v=>Array.isArray(v?.fragments)||Array.isArray(v?.message?.fragments)))return 'deepseek';
    if(isObj(c.mapping)&&(c.id||c.conversation_id)&&!Array.isArray(c.fragments))return 'chatgpt';
    if(Array.isArray(c.chat_messages))return 'claude';
    if(isObj(c.conversation)&&Array.isArray(c.responses))return 'grok';
    if(Array.isArray(c.safeHtmlItem)||(/^Prompted\b/i.test(c.title||'')&&('time' in c)))return 'gemini';
    if(Array.isArray(c.fragments)||isObj(c.mapping)&&Object.values(c.mapping).some(v=>Array.isArray(v?.fragments)))return 'deepseek';
    if(Array.isArray(c.messages)&&hint!=='auto')return hint;
    if(Array.isArray(c.messages)&&(c.id||c.conversation_id))return 'other';
    if(hint!=='auto'&&['chatgpt','claude','deepseek','grok','gemini'].includes(hint)&&
       (Array.isArray(c.messages)||isObj(c.mapping)||Array.isArray(c.responses)))return hint;
    return null;
  }
  function arraysFromRoot(root){
    if(Array.isArray(root))return [root];
    if(!isObj(root))return [];
    const pools=[root,root.data,root.export_data,root.grok,root.payload].filter(isObj);
    const out=[];
    for(const p of pools)for(const k of ['conversations','chats','chat_history','chatHistory','threads','history','activities','items']){
      if(Array.isArray(p[k]))out.push(p[k]);
    }
    if(!out.length)out.push([root]);
    return out;
  }
  function hasExportSignal(c,p){
    if(p==='chatgpt')return !!(c.mapping||c.messages);
    if(p==='claude')return Array.isArray(c.chat_messages);
    if(p==='gemini')return 'safeHtmlItem' in c||(/^Prompted\b/i.test(c.title||'')&&'time' in c);
    if(p==='grok')return !!(c.conversation&&c.responses);
    if(p==='deepseek')return !!(c.fragments||c.mapping||c.messages);
    return Array.isArray(c.messages);
  }
  // Explainable local keyword taxonomy, not an LLM summary or judgement.
  function classifyTopics(text){
    const rules=[
      ['科研与教学',/(科研|论文|研究设计|高校|教师|教育|课堂|教学|数学|实验|research|paper|academic)/i],
      ['AI与软件开发',/(agent|大模型|编程|codex|模型|接口|mcp|人工智能|软件|app|github|api|workflow|代码)/i],
      ['商业与创业',/(创业|销售|变现|客户|营销|商业|收入|盈利|公司|business|startup|revenue)/i],
      ['艺术与创作',/(手作|绘画|剪纸|插画|纽扣|图像|画风|艺术|设计|视频|craft|art|design)/i],
      ['阅读与学习',/(读书|阅读|学习|笔记|课程|知识|书籍|reading|learn|book)/i],
      ['生活与反思',/(人生|经历|日记|感受|反思|家庭|生活|价值观|成长|life|journal)/i]
    ];
    return rules.filter(([,re])=>re.test(text)).map(([name])=>name).slice(0,5);
  }
  async function makeItem(provider,c,sourceLabel) {
    const raw=JSON.stringify(c);
    const contentHash=await sha256(raw);
    const meta=provider==='grok'?(c.conversation||{}):c;
    const identity=meta.uuid||meta.id||meta.conversation_id||meta.conversationId||meta.chat_id||meta.chatId||null;
    // Gemini activity has no stable conversation ID: store one event at a time.
    const sourceId=identity?norm(identity):provider==='gemini'?
      'activity-'+(await sha256(`${norm(c.time||c.timestamp||'')}|${norm(c.title||'')}|${norm(c.url||'')}|${contentHash}`)).slice(0,32):
      'hash-'+contentHash.slice(0,32);
    const msgs=toMessages(provider,c);
    const title=norm(meta.title||meta.name||(provider==='gemini'?c.title:'')||`${provider} ${sourceId.slice(0,8)}`).slice(0,180);
    const messageText=msgs.map(m=>m.text).filter(Boolean).join('\n');
    const warning=provider==='gemini'?'Google Takeout 活动条目不包含可靠的完整会话分组；仅保存原始事件。':
      !msgs.length?'未识别到可搜索消息文本，原始结构照常保留。':'';
    return {id:`${provider}:${sourceId}`,sourceId,provider,kind:provider==='gemini'?'activity':'conversation',
      title,created:meta.created_at??meta.create_time??meta.time??null,
      modified:meta.updated_at??meta.update_time??meta.time??null,
      raw,hash:contentHash,searchText:`${title}\n${messageText}`.slice(0,2000000),
      messageCount:msgs.length,sourceLabel,warning,topicTags:classifyTopics(`${title}\n${messageText}`)};
  }
  async function parseJSON(text,label,hint='auto') {
    let root;
    try {root=JSON.parse(text);}catch(e){throw new Error(`文件 ${label} 不是有效 JSON：${e.message}`);}
    const pools=arraysFromRoot(root), items=[], warnings=[];
    let rejected=0;
    for(const group of pools)for(const c of group){
      if(!isObj(c)){rejected++;continue;}
      let provider=detectConversation(c,hint);
      if(!provider&&hint==='gemini'&&('time' in c)&&('title' in c))provider='gemini';
      if(!provider||!hasExportSignal(c,provider)){rejected++;continue;}
      items.push(await makeItem(provider,c,label));
    }
    // If one export contains nested collections of the same data, deduplicate by id.
    const byId=new Map(items.map(i=>[i.id,i]));
    if(rejected)warnings.push(`跳过 ${rejected} 个无法确认为聊天的数据对象；不会上传账号信息、设置或付款数据。`);
    if([...byId.values()].some(i=>i.provider==='gemini'))warnings.push('Gemini Takeout 通常只有活动条目，无法可靠恢复原始聊天会话的分组或缺失的回答。');
    if(!byId.size)throw new Error(`无法识别 ${label} 中的聊天记录。请确认来源或选择正确的平台；不会把未知账号数据当作聊天上传。`);
    return {items:[...byId.values()],warnings};
  }
  function findEnd(view){const min=Math.max(0,view.byteLength-65557);for(let i=view.byteLength-22;i>=min;i--)if(view.getUint32(i,true)===0x06054b50)return i;throw new Error('ZIP 中未找到有效中央目录。');}
  function entries(bytes){
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),pos=findEnd(view);
    const total=view.getUint16(pos+10,true),size=view.getUint32(pos+12,true),offset=view.getUint32(pos+16,true);
    if(total===65535||size===0xffffffff||offset===0xffffffff)throw new Error('不支持 ZIP64；请在电脑上解压后选择聊天 JSON 文件。');
    if(total>10000)throw new Error('ZIP 文件数量过多；请先在电脑上解压聊天 JSON。');
    let p=offset;const out=[];
    for(let i=0;i<total;i++){
      if(p+46>bytes.length||view.getUint32(p,true)!==0x02014b50)throw new Error('ZIP 中央目录损坏。');
      const method=view.getUint16(p+10,true),flags=view.getUint16(p+8,true),packed=view.getUint32(p+20,true),unpacked=view.getUint32(p+24,true);
      const n=view.getUint16(p+28,true),extra=view.getUint16(p+30,true),comment=view.getUint16(p+32,true),local=view.getUint32(p+42,true);
      if(p+46+n+extra+comment>bytes.length)throw new Error('ZIP 路径信息不完整。');
      const name=decoder.decode(bytes.subarray(p+46,p+46+n));
      out.push({name,method,flags,packed,unpacked,local});p+=46+n+extra+comment;
    }
    return out;
  }
  async function unzipEntry(bytes,e){
    if(e.flags&1)throw new Error('不支持加密 ZIP。');
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    if(e.local+30>bytes.length||view.getUint32(e.local,true)!==0x04034b50)throw new Error('ZIP 文件头损坏');
    const start=e.local+30+view.getUint16(e.local+26,true)+view.getUint16(e.local+28,true);
    if(e.unpacked>150*1024*1024)throw new Error('单个聊天 JSON 超过 150MB，请在本地拆分后导入。');
    if(start+e.packed>bytes.length)throw new Error('ZIP 压缩数据不完整');
    const raw=bytes.subarray(start,start+e.packed);
    if(e.method===0)return decoder.decode(raw);
    if(e.method!==8)throw new Error('不支持此 ZIP 压缩算法：'+e.method);
    const buf=await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
    if(buf.byteLength>Math.max(e.unpacked+1024,1024*1024*1024))throw new Error('ZIP 解压大小异常');
    return decoder.decode(buf);
  }
  function validZipJSONPath(name){
    const b=name.replace(/\\/g,'/').split('/').at(-1)||'';
    return /^(conversations?(?:[._-]\d+)?|chat[_-]?history|prod-grok-backend|MyActivity|conversation[_-]?export|chat[_-]?export)\.json$/i.test(b) ||
      /(?:gemini apps|chatgpt|claude|deepseek|grok)/i.test(name)&&/\.json$/i.test(b)&&!/(users|projects|billing|profile|account|settings|auth|tokens)/i.test(b);
  }
  async function readFile(file, onProgress=()=>{}, hint='auto'){
    const warnings=[], out=[], ext=(file.name.split('.').at(-1)||'').toLowerCase();
    if(ext==='zip'){
      if(file.size>180*1024*1024)throw new Error('ZIP 超过180MB或使用ZIP64：当前原型不支持整包读取。请先解压并选择 conversations-000.json 等聊天分片；不要导入超大压缩包。');
      const bytes=new Uint8Array(await file.arrayBuffer());
      const all=entries(bytes), selected=all.filter(e=>validZipJSONPath(e.name)&&!e.name.includes('__MACOSX'));
      if(!selected.length)throw new Error('ZIP 中未找到可识别的聊天 JSON。Gemini 请在 Takeout 选择 My Activity → Gemini Apps → JSON。');
      for(let i=0;i<selected.length;i++){
        onProgress(`读取 ZIP：${i+1}/${selected.length}（${selected[i].name}）`);
        try{
          const r=await parseJSON(await unzipEntry(bytes,selected[i]),selected[i].name,hint);
          out.push(...r.items);warnings.push(...r.warnings);
        }catch(e){warnings.push(`${selected[i].name}：${e.message}`);}
      }
      if(all.length>selected.length)warnings.push(`ZIP 其余 ${all.length-selected.length} 个文件未读取/上传（可能包括附件、个人资料等）。`);
    }else if(ext==='json'){
      if(file.size>180*1024*1024)throw new Error('单个 JSON 超过180MB，请先在本地拆成较小的聊天文件再导入。');
      const r=await parseJSON(await file.text(),file.name,hint);out.push(...r.items);warnings.push(...r.warnings);
    }else if(['md','txt'].includes(ext)){
      const content=await file.text(),provider=hint==='auto'?'other':hint;
      if(!content.trim())throw new Error('文本文件为空。');
      const payload={format:ext,original_filename:file.name,content};
      const raw=JSON.stringify(payload),hash=await sha256(raw);
      const sourceId='text-'+(await sha256(file.name)).slice(0,32);
      out.push({id:`${provider}:${sourceId}`,provider,sourceId,kind:'text',title:file.name,created:null,modified:null,
        raw,hash,searchText:content.slice(0,2000000),messageCount:0,sourceLabel:file.name,
        warning:'文本没有可验证的逐条消息角色及时间戳。',topicTags:classifyTopics(content)});
    }else throw new Error('仅支持 ZIP / JSON / Markdown / TXT，不自动抓取聊天网页。');
    const dedup=new Map(out.map(v=>[v.id,v]));
    if(!dedup.size)throw new Error(warnings[0]||'没有可识别的聊天记录；未导入任何数据。');
    return {items:[...dedup.values()],warnings};
  }
  async function importConversation(item) {
    if(!item?.id||!item.raw||!item.hash)throw new Error('导入记录缺失必要字段。');
    const prev=await SiranDB.get(item.id);
    if(prev?.hash===item.hash)return 'unchanged';
    if(prev?.raw&&prev.hash!==item.hash)await SiranDB.putVersion({id:`${item.id}::${prev.hash}`,conversationId:item.id,hash:prev.hash,raw:prev.raw,archivedAt:new Date().toISOString()});
    await SiranDB.put({...prev,...item,driveId:prev?.driveId||null,syncedHash:prev?.syncedHash||null,
      uploadSession:null,uploadHash:null,offset:0,lastError:null,retryAt:0,attempts:0,
      receivedAt:new Date().toISOString()});
    return prev?'updated':'added';
  }
  return {readFile,parseJSON,importConversation,sha256,toMessages};
})();
