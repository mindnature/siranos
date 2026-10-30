/* SiranOS Digital Self: evidence-bound projections from explicitly reviewed memories.
 * No model calls, psychometric labels, or inferred personal facts.
 */
const SiranPersona=(()=>{
  'use strict';
  const GROUPS=[
    {id:'decisions',title:'判断与决定',types:['决策']},
    {id:'goals',title:'目标与计划',types:['目标']},
    {id:'actions',title:'行动与成果（自述）',types:['行动']},
    {id:'reflections',title:'观点与反思',types:['反思']},
    {id:'observations',title:'其他已确认原话（不代表事实核验）',types:['线索']}
  ];
  const normalize=x=>String(x??'').replace(/\s+/gu,' ').trim();
  const validDate=x=>!x?null:Number.isFinite(Date.parse(x))?new Date(x).toISOString():null;
  function project(m){return normalize(m.project)||'未分类';}
  function build(memories=[],meta={}){
    const approved=memories.filter(m=>m&&m.status==='confirmed'&&!m.sourceStale&&!m.reviewNeeded&&
      m.source?.conversationId&&m.source?.sourceHash&&Number.isInteger(m.source?.messageIndex)&&normalize(m.text));
    approved.sort((a,b)=>String(b.eventDate||b.updatedAt||'').localeCompare(String(a.eventDate||a.updatedAt||'')));
    const seen=new Set(),entries=[];
    for(const m of approved){
      const key=project(m)+'|'+normalize(m.text).toLowerCase();if(seen.has(key))continue;seen.add(key);
      entries.push({id:m.id,type:m.type||'未分类',text:normalize(m.text),project:project(m),
        eventDate:validDate(m.eventDate),reviewedAt:validDate(m.updatedAt),evidence:{
          provider:m.source.provider||'unknown',conversationId:m.source.conversationId,
          conversationTitle:m.source.conversationTitle||'',messageIndex:m.source.messageIndex,
          sourceHash:m.source.sourceHash,quote:m.source.quote||''},
        evidenceClass:'user_statement_not_external_verification'});
    }
    const groups=GROUPS.map(g=>({...g,entries:entries.filter(x=>g.types.includes(x.type))}));
    const projects={};for(const m of entries){const k=m.project;(projects[k]??=[]).push(m.id);}
    return {schema:'siranos.digital-self.v1',generatedAt:new Date().toISOString(),
      summary:{approved:entries.length,pending:memories.filter(m=>m?.status==='pending').length,
        stale:memories.filter(m=>m?.sourceStale||m?.reviewNeeded).length,sourceConversations:new Set(entries.map(x=>x.evidence.conversationId)).size},
      groups,projects:Object.entries(projects).map(([name,memoryIds])=>({name,memoryIds})),entries,
      scope:meta.scope||'仅当前浏览器已导入且用户确认的记忆',
      caveat:'所有内容仅为用户在历史聊天中表达且人工审核过的陈述；行动完成、观点正确、项目成果和人格特征均未得到独立核实。当前画像不涵盖未导入聊天。'};
  }
  async function current(){return build(await SiranDB.listMemories());}
  function compact(profile,{maxPerGroup=10}={}){
    const n=Math.max(1,Math.min(30,Number(maxPerGroup)||10));
    const sections=profile.groups.map(g=>({section:g.title,items:g.entries.slice(0,n).map(e=>({
      text:e.text,eventDate:e.eventDate,project:e.project,source:{provider:e.evidence.provider,
        conversationId:e.evidence.conversationId,messageIndex:e.evidence.messageIndex}}))}));
    return {schema:'siranos.context.v1',scope:profile.scope,caveat:profile.caveat,sections};
  }
  return {GROUPS,build,current,compact};
})();
