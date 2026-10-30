/* SiranOS evidence question answering: offline retrieval, NOT generative AI.
 * The response is an extractive evidence brief and never verifies real-world claims.
 */
const SiranQA=(()=>{
 'use strict';
 const STOP=new Set(['什么','为什么','怎么','怎样','如何','哪些','哪个','多少','时候','以前','之前','现在','最近','曾经','有没有','是否','可以','应该','以及','关于','我想','我在','我的','我们','自己','那个','这个','这些','那些','一下','请问','告诉','是否','知道','情况','有关','问题','一下子','能够','然后','当时','过去']);
 const norm=x=>String(x||'').normalize('NFC').toLowerCase().replace(/\s+/gu,' ').trim();
 const isUser=r=>['user','human'].includes(String(r||'').toLowerCase());
 function terms(text){
  const s=norm(text),out=new Set();
  const english=s.match(/[a-z][a-z0-9+#._-]{1,35}/g)||[];
  for(const w of english)if(!STOP.has(w))out.add(w);
  const blocks=s.match(/[\p{Script=Han}]{2,}/gu)||[];
  for(const b of blocks){for(const word of [b,...(b.length>2?Array.from({length:b.length-1},(_,i)=>b.slice(i,i+2)):[])]){
   if(word.length>=2&&word.length<=32&&!STOP.has(word))out.add(word);
  }}
  return [...out];
 }
 const makeDate=d=>{if(d==null||d==='')return null;const n=typeof d==='number'?(d<1e12?d*1000:d):Date.parse(d);return Number.isFinite(n)?new Date(n).toISOString():null;};
 function rank(question, text, title, tokens){
  const hay=norm(text),head=norm(title),hits=[];
  let score=0;
  for(const t of tokens){if(hay.includes(t)){hits.push(t);score+=t.length>=4?3.5:2;}}
  if(hits.length)for(const t of hits)if(head.includes(t))score+=0.3;
  const focus=norm(question).replace(/[\p{P}\p{S}\s]/gu,'');
  if(focus.length>=3&&focus.length<=35&&hay.includes(focus))score+=6;
  if(!hits.length)return {score:0,hits:[]};
  score+=(hits.length/Math.max(tokens.length,1))*4;
  if(hits.length===1&&hits[0].length===2&&tokens.length>=4)score-=1.3;
  return {score,hits};
 }
 function excerpt(text,hits,max=330){
  const s=String(text||'').replace(/\s+/gu,' ').trim();
  const lower=s.toLowerCase();let start=0;
  for(const term of hits.sort((a,b)=>b.length-a.length)){const at=lower.indexOf(term);if(at>=0){start=Math.max(0,at-45);break;}}
  const end=Math.min(s.length,start+max);return (start?'…':'')+s.slice(start,end)+(end<s.length?'…':'');
 }
 function compose(question,rows,scanned){
  const termsFound=new Set(rows.flatMap(r=>r.matchedTerms));
  const certainty=rows.length===0?'no_evidence':termsFound.size<=1?'weak':'retrieved';
  const intro=rows.length===0?'未在已导入的用户发言中找到足够相关的原文。不能由此推断你从未讨论过这个问题。':
   `在已导入资料中找到 ${rows.length} 条相关用户原话，来自 ${new Set(rows.map(x=>x.conversationId)).size} 段会话。以下是原文线索，不是模型生成的确定结论。`;
  const lines=[intro];
  for(let i=0;i<Math.min(5,rows.length);i++){
   const r=rows[i];lines.push(`[${i+1}] ${r.date?r.date.slice(0,10):'日期未知'} · ${r.conversationTitle||'未命名会话'}：${r.excerpt}`);
  }
  return {schema:'siranos.qa.v1',question,mode:'offline_evidence_extractive',certainty,summary:lines.join('\n\n'),evidence:rows,coverage:{scannedConversations:scanned,returned:rows.length,source:'only_user_authored_imported_messages'},caveat:'只扫描已经导入的本地用户发言；相关性是词项匹配，不是语义推理。引用仅证明有人在聊天中这样表述，不证明事件发生、观点正确或最新状态。'};
 }
 async function ask(question,{limit=12,maxPerConversation=3}={}){
  const q=norm(question).slice(0,400),qterms=terms(q);
  if(!q||!qterms.length)return compose(q,[],0);
  if(!SiranDB.forEachConversation)throw new Error('当前本地数据库缺少分页检索支持，请重新加载扩展。');
  const pool=[],cap=Math.max(limit*6,60),max=Math.max(1,Math.min(25,limit));let scanned=0;
  await SiranDB.forEachConversation(record=>{
   scanned++;
   const messages=SiranBrain.msgs(record),title=record.title||'';
   for(let i=0;i<messages.length;i++){
    const m=messages[i];if(!isUser(m.role)||!m.text)continue;
    const p=rank(q,m.text,title,qterms);if(p.score<2.4)continue;
    const row={conversationId:record.id,provider:record.provider||'unknown',conversationTitle:title,messageIndex:i,role:m.role,sourceHash:record.hash,date:makeDate(m.date)||makeDate(record.created),score:p.score,matchedTerms:p.hits,excerpt:excerpt(m.text,p.hits)};
    if(pool.length<cap)pool.push(row);else{
     let worst=0;for(let k=1;k<pool.length;k++)if(pool[k].score<pool[worst].score)worst=k;
     if(row.score>pool[worst].score)pool[worst]=row;
    }
   }
  });
  pool.sort((a,b)=>b.score-a.score||String(b.date||'').localeCompare(String(a.date||'')));
  const counts=new Map(),out=[];
  for(const e of pool){const count=counts.get(e.conversationId)||0;if(count>=maxPerConversation)continue;counts.set(e.conversationId,count+1);out.push(e);if(out.length>=max)break;}
  return compose(q,out,scanned);
 }
 return {ask,terms,compose,rank};
})();
