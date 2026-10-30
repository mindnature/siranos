/* Memory-bounded streaming of official ChatGPT conversations JSON arrays and chat.html embedded var jsonData.
 * Processes one complete conversation at a time. Does not stream ZIP64 or attachments.
 */
const SiranStreaming=(()=>{
 'use strict';
 const MARKER='var jsonData =', MAX_HEADER=8192, MAX_OBJECT=64*1024*1024;
 async function importFile(file,onItem,progress=()=>{}, {signal=null,hint='auto',onWarning=()=>{}}={}){
  const ext=(file.name.split('.').pop()||'').toLowerCase();
  if(!['json','html'].includes(ext))throw new Error('流式导入仅支持 JSON 数组或 ChatGPT chat.html。');
  const reader=file.stream().getReader(),decoder=new TextDecoder('utf-8');
  let mode=ext==='html'?'marker':'start',seek='',depth=0,quoted=false,escape=false,part='',segmentStart=-1,items=0,recognized=0,failed=0,bytes=0,finished=false;
  const emit=async raw=>{
   let obj;try{obj=JSON.parse(raw);}catch(e){failed++;onWarning(`第 ${items+1} 条会话 JSON 无效：${String(e.message).slice(0,150)}`);return;}
   items++;
   let parsed;try{parsed=await SiranImporter.parseJSON(JSON.stringify([obj]),`${file.name}#${items}`,hint);}catch(e){failed++;onWarning(`第 ${items} 条结构无法识别：${String(e.message).slice(0,150)}`);return;}
   for(const item of parsed.items){await onItem(item);recognized++;}
   for(const w of parsed.warnings)onWarning(w);
  };
  const chunk=async data=>{
   let s=data,i=0;
   if(mode==='marker'){
    seek+=s;
    let at=seek.indexOf(MARKER);
    if(at<0){if(seek.length>MAX_HEADER)throw new Error('没有找到 ChatGPT chat.html 中的 jsonData；不支持任意网页 HTML。');return;}
    s=seek.slice(at+MARKER.length);seek='';mode='start';
   }
   if(mode==='start'){
    while(i<s.length&&/\s/.test(s[i]))i++;
    if(i===s.length)return;
    if(s[i]!=='[')throw new Error('当前仅支持官方会话 JSON 数组（以 [ 开头），不支持其他 JSON 根格式的流式导入。');
    i++;mode='array';
   }
   for(;i<s.length;i++){
    if(mode==='done')break;
    const ch=s[i];
    if(segmentStart<0){
     if(ch===']'){finished=true;mode='done';break;}
     if(ch===','||/\s/.test(ch))continue;
     if(ch!=='{')throw new Error('会话数组仅支持对象元素，遇到非对象值。');
     segmentStart=i;depth=0;quoted=false;escape=false;
    }
    if(quoted){if(escape)escape=false;else if(ch==='\\')escape=true;else if(ch==='"')quoted=false;}
    else{if(ch==='"')quoted=true;else if(ch==='{'||ch==='[')depth++;else if(ch==='}'||ch===']')depth--;}
    if(depth<0)throw new Error('JSON 嵌套结构错误。');
    if(depth===0&&!quoted){
     part+=s.slice(segmentStart,i+1);
     if(part.length>MAX_OBJECT)throw new Error('单个会话超过64MiB安全上限，需先单独拆分这段会话。');
     await emit(part);part='';segmentStart=-1;
    }
   }
   if(segmentStart>=0){part+=s.slice(segmentStart);if(part.length>MAX_OBJECT)throw new Error('单个会话超过64MiB安全上限。');}
  };
  try{
   while(true){if(signal?.aborted)throw new Error('导入已取消。');const r=await reader.read();if(r.done)break;
    bytes+=r.value?.byteLength||0;await chunk(decoder.decode(r.value,{stream:true}));
    if(items%10===0||finished)progress(`流式扫描 ${Math.floor(bytes/1048576)} / ${Math.ceil(file.size/1048576)} MiB；记录 ${items}，有效 ${recognized}，跳过 ${failed}`);
    if(finished)break;
   }
   if(!finished)await chunk(decoder.decode());
   if(!finished&&mode==='marker')throw new Error('没有找到 ChatGPT chat.html 中的 jsonData；不支持任意网页 HTML。');
   if(!finished)throw new Error('导入未完成：文件缺少会话数组末尾，可能已损坏。');
   return {items,recognized,failed,bytesRead:bytes,mode:'streaming',warning:'只索引文字会话。此导入不包含图片、附件或其他媒体；保留完整原始导出文件作备份。'};
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 }
 return {importFile};
})();
