/** Public local-first knowledge workspace. No cloud account and no LLM required. */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {configure,configuration,sync,profile,status,database,dataDirectory} from './core.mjs';

export const FOLDERS = Object.freeze({
  inbox:'01_资料收件箱',sources:'02_原始资料',memories:'03_长期记忆',persona:'04_数字人格',projects:'05_项目档案',reviews:'06_定期复盘',context:'07_AI共享上下文',internal:'.siranos'
});
const SETTINGS=()=>path.join(dataDirectory(),'workspace.json');
export const defaultRoot=()=>path.join(os.homedir(),'Documents','SiranOS');
const nowISO=d=>d.toISOString();
const ensureSchedule=f=>{if(!['weekly','monthly','manual'].includes(f))throw new Error('Update frequency must be weekly, monthly or manual');return f};
const safeOneLine=s=>String(s??'').replace(/[\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').trim();
const safeMd=s=>safeOneLine(s).replaceAll('\\','\\\\').replaceAll('|','\\|').replaceAll('`','\\`').replaceAll('<','&lt;').replaceAll('>','&gt;').slice(0,1400);
const atomic=async (dest,content)=>{
  const dir=path.dirname(dest);const st=await fsp.lstat(dir);if(!st.isDirectory()||st.isSymbolicLink())throw Error('Unsafe output directory');
  try{const prior=await fsp.readFile(dest,'utf8');if(prior===content)return false;}catch(e){if(e.code!=='ENOENT')throw e}
  try{const st=await fsp.lstat(dest);if(st.isSymbolicLink()||!st.isFile())throw Error('Refusing to overwrite non-file or symlink: '+path.basename(dest))}catch(e){if(e.code!=='ENOENT')throw e}
  const temp=path.join(dir,'.siranos-'+crypto.randomBytes(9).toString('hex')+'.tmp');
  try{await fsp.writeFile(temp,content,{flag:'wx',mode:0o600});await fsp.rename(temp,dest);}finally{await fsp.rm(temp,{force:true}).catch(()=>{})}
  return true;
};
async function safeFolder(root,name){
  const target=path.join(root,name);
  try{const st=await fsp.lstat(target);if(st.isSymbolicLink()||!st.isDirectory())throw Error('Unsafe workspace folder: '+name)}catch(e){if(e.code==='ENOENT')await fsp.mkdir(target,{mode:0o700});else throw e}
  return target;
}
function readJSON(file){try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch(e){if(e.code==='ENOENT')return null;throw e}}
export function workspace(){
  const x=readJSON(SETTINGS());if(!x)return null;
  if(x.schema!==1||!path.isAbsolute(x.root)||!ensureSchedule(x.frequency))throw Error('Invalid SiranOS workspace configuration');
  return x;
}
export async function initWorkspace({root,frequency}={}){
  const prev=workspace();
  const effectiveFrequency=ensureSchedule(frequency??prev?.frequency??'weekly');
  const absolute=path.resolve(root??prev?.root??defaultRoot());
  // An existing user workspace must never be replaced silently.
  if(prev&&path.resolve(prev.root)!==absolute)throw Error('A workspace already exists. Use its original folder; data migration must be explicit.');
  await fsp.mkdir(absolute,{recursive:true,mode:0o700});
  const base=await fsp.realpath(absolute);
  if(prev&&prev.root!==base)throw Error('Workspace path resolves to a different directory');
  for(const name of Object.values(FOLDERS))await safeFolder(base,name);
  const inbox=path.join(base,FOLDERS.inbox);
  let cfg=null;try{cfg=configuration()}catch(e){if(!/Not configured/.test(String(e.message)))throw e}
  if(cfg&&path.resolve(cfg.sourceFolder)!==inbox)throw Error('Existing source folder is configured. Refusing to replace it automatically. Use separate SIRANOS_HOME or migrate explicitly.');
  if(!cfg)await configure(inbox);
  const state=prev||{schema:1,root:base,createdAt:nowISO(new Date()),frequency:effectiveFrequency};
  state.frequency=effectiveFrequency;
  await fsp.mkdir(dataDirectory(),{recursive:true,mode:0o700});
  await atomic(SETTINGS(),JSON.stringify(state,null,2)+'\n');
  const readme=path.join(base,'README-使用说明.txt');
  if(!fs.existsSync(readme))await atomic(readme,'将你自己拥有或有权处理的聊天导出、笔记和知识文件放入此处。\n运行 siranos tick 或等待已安装的定时任务。\n注意：SiranOS 不会自动验证 AI 生成的叙述；个人记忆必须人工审核。\n');
  return {root:base,inbox,frequency:effectiveFrequency,store:dataDirectory(),next:['node bridge/cli.mjs tick','node bridge/cli.mjs schedule-install','node bridge/cli.mjs integration']};
}
export async function setFrequency(frequency){
  const s=workspace();if(!s)throw Error('Run init first');s.frequency=ensureSchedule(frequency);
  await atomic(SETTINGS(),JSON.stringify(s,null,2)+'\n');return {frequency:s.frequency,root:s.root};
}
export function period(now=new Date(),frequency='weekly'){
  ensureSchedule(frequency);
  if(frequency==='manual')return {key:'manual-'+nowISO(now).slice(0,10),label:'手动更新'};
  const y=now.getFullYear(),m=now.getMonth()+1,d=now.getDate();
  if(frequency==='monthly')return {key:`${y}-${String(m).padStart(2,'0')}`,label:'月度更新'};
  const utc=new Date(Date.UTC(y,m-1,d));utc.setUTCDate(utc.getUTCDate()+4-(utc.getUTCDay()||7));
  const year=utc.getUTCFullYear();const begin=new Date(Date.UTC(year,0,1));const week=Math.ceil((((utc-begin)/86400000)+1)/7);
  return {key:`${year}-W${String(week).padStart(2,'0')}`,label:'每周更新'};
}
function snapshot(){return database().prepare('SELECT path,hash,size,indexed_at,chunks_count FROM documents ORDER BY path').all();}
function diff(previous,rows){
  const old=new Map((previous||[]).map(x=>[x.path,x.hash]));const next=new Map(rows.map(x=>[x.path,x.hash]));
  const added=[],changed=[],deleted=[];
  for(const [p,h] of next){if(!old.has(p))added.push(p);else if(old.get(p)!==h)changed.push(p)}
  for(const p of old.keys())if(!next.has(p))deleted.push(p);
  return {added,changed,deleted};
}
function citeMemory(m){const source=safeMd(m.source_path),id=safeOneLine(m.evidence_id);return `> ${safeMd(m.excerpt)}\n\n来源：\`${source}\` · 证据ID：\`${id}\` · 类别：${safeMd(m.kind)}\n`}
function heading(name,date){return `# ${name}\n\n生成时间：${nowISO(date)}\n\n说明：内容仅据已索引资料及人工确认的记忆；用户自述不代表外部事实已核实。\n`}
const groupNames={goal:'目标',decision:'决定',preference:'偏好',reflection:'反思'};
function memoryText(p,date){const xs=p.memories||[];return heading('长期记忆（已人工确认）',date)+`\n已确认 ${xs.length} 条；待审核 ${p.pending} 条。未经审核的内容不会作为长期事实输出。\n\n`+(xs.length?xs.map(citeMemory).join('\n---\n\n'):'暂无已确认记忆。使用 `node bridge/cli.mjs memories` 查看候选，再使用 `approve <id>` 确认。\n')}
function personaText(p,date){const xs=p.memories||[];let s=heading('数字人格 · 来源可追溯的个人陈述',date)+ '\n这是经用户确认的历史陈述集合，不是人格诊断。旧观点可能已经变化，请检查时间与原话。\n';for(const [key,title] of Object.entries(groupNames)){const ms=xs.filter(x=>x.kind===key);s+=`\n## ${title}（${ms.length}）\n\n`+(ms.length?ms.map(citeMemory).join('\n'):'暂无已确认记录。\n')}return s}
function projectsText(p,date){const xs=(p.memories||[]).filter(m=>['goal','decision'].includes(m.kind));return heading('项目与目标线索',date)+'\n本页不是项目完成情况证明。下面仅列出经人工确认的目标或决定；项目名称、负责人及进度需要后续单独登记。\n\n'+(xs.length?xs.map(citeMemory).join('\n'):'尚无已确认的项目或目标线索。\n')}
function contextText(p,date){const ms=(p.memories||[]).slice(0,60);return heading('授权 AI 使用的最小上下文（本地生成）',date)+`\n本文件为精简视图：展示最近 ${ms.length} / ${p.memories?.length||0} 条已批准记忆；完整记录参见 03_长期记忆。\n`+'\n**安全提醒：此文件包含私人陈述。只有你主动配置 MCP 或明确共享时才允许 AI 客户端读取。不要上传到公开 GitHub。**\n\n'+(ms.length?ms.map(x=>`- [${safeMd(x.kind)}] ${safeMd(x.excerpt)} （证据ID：${safeOneLine(x.evidence_id)}）`).join('\n')+'\n':'暂无已确认记忆。\n')}
function reportText({p,date,periodKey,updates,previousDate,syncResult,docCount}){
  const max=80;
  const x=heading(`第二大脑 · ${periodKey} 增量复盘`,date)+`\n分析窗口：${previousDate||'首次建立快照'} 至 ${nowISO(date)}。本报告按**实际扫描与快照差异**编写，不推断未记录的活动。\n\n`+
  `本次扫描：新增或更新索引 ${syncResult.indexed}，未变更 ${syncResult.unchanged}，跳过 ${syncResult.skipped}，资料总数 ${docCount}。\n`+
  `记忆：确认 ${p.memories.length} 条，待审核 ${p.pending} 条。${syncResult.partial||syncResult.errors?.length?'\n⚠ 部分资料扫描失败，结果可能不完整，暂不宣称全部资料已覆盖。':''}\n`;
  let out=x;
  for(const [kind,title] of [['added','新增资料'],['changed','更新资料'],['deleted','移除资料']]){
    const items=updates[kind];out+=`\n## ${title}（${items.length}）\n\n`+(items.length?items.slice(0,max).map(v=>'- `'+safeMd(v)+'`').join('\n')+'\n':'无。\n');if(items.length>max)out+=`其余 ${items.length-max} 项省略。\n`;
  }
  out+='\n## 已确认的长期记忆\n\n'+(p.memories.length?p.memories.slice(0,20).map(citeMemory).join('\n'):'暂无已确认条目。\n');
  out+='\n## 下一步审核\n\n使用 `node bridge/cli.mjs memories` 查看待审候选；新的决定或价值判断不会未经确认写入人格档案。\n';
  return out;
}
function requireIntactFolders(root){
  for(const name of Object.values(FOLDERS)){const item=path.join(root,name);const st=fs.lstatSync(item);if(st.isSymbolicLink()||!st.isDirectory())throw Error('Workspace directory is missing or unsafe: '+name)}
}
const REPORT_LIMIT=2*1024*1024;
function secureTextFile(root,folder,name){
  const dir=path.join(root,folder);
  const target=path.join(dir,name);
  const flags=fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0);
  // A directory symlink is already rejected by requireIntactFolders.
  // Do not follow a report-file symlink even if the destination is readable.
  const st=fs.lstatSync(target);
  if(st.isSymbolicLink()||!st.isFile()||st.size>REPORT_LIMIT)throw Error('Unsafe or oversized knowledge file: '+name);
  const fd=fs.openSync(target,flags);
  try{const actual=fs.fstatSync(fd);if(!actual.isFile()||actual.size>REPORT_LIMIT||actual.dev!==st.dev||actual.ino!==st.ino)throw Error('Knowledge file changed during open: '+name);
    return fs.readFileSync(fd,'utf8');
  }finally{fs.closeSync(fd)}
}
function generatedTime(root,folder,name){
  const body=secureTextFile(root,folder,name);
  const match=body.slice(0,1000).match(/生成时间：([^\n]+)/);
  const time=match?Date.parse(match[1]):NaN;
  if(Number.isFinite(time))return time;
  return fs.statSync(path.join(root,folder,name)).mtimeMs;
}
export async function refreshWorkspace({force=false,now=new Date(),manualReport=false}={}){
  const config=workspace();if(!config)throw Error('Run node bridge/cli.mjs init first');
  const root=await fsp.realpath(config.root);if(root!==config.root)throw Error('Workspace was moved or replaced');
  requireIntactFolders(root);
  const base=path.join(root,FOLDERS.internal);
  const reportStatePath=path.join(base,'report-state.json');
  const previous=readJSON(reportStatePath)||{schema:1,documents:[],lastReportAt:null};
  const result=await sync({force});
  const docs=snapshot(),p=profile(),changed=diff(previous.documents,docs);
  await atomic(path.join(root,FOLDERS.sources,'manifest.json'),JSON.stringify({schema:1,generatedAt:nowISO(now),notice:'Paths are relative to user inbox. Original user files are not moved or uploaded.',documents:docs},null,2)+'\n');
  await atomic(path.join(root,FOLDERS.memories,'long-term-memory.md'),memoryText(p,now));
  await atomic(path.join(root,FOLDERS.persona,'digital-self.md'),personaText(p,now));
  await atomic(path.join(root,FOLDERS.projects,'projects.md'),projectsText(p,now));
  await atomic(path.join(root,FOLDERS.context,'AI-context.md'),contextText(p,now));
  const cadence=manualReport?'manual':config.frequency;
  const current=period(now,cadence);
  const reportFile=path.join(root,FOLDERS.reviews,`${current.key}.md`);
  const shouldReport=manualReport||config.frequency!=='manual'&&!fs.existsSync(reportFile);
  let report=null;
  // Only advance the report baseline after a complete, non-error scan.
  if(shouldReport && !result.partial && !result.errors.length){
    if(manualReport&&fs.existsSync(reportFile))throw Error('Manual report already exists for this date; avoid overwriting prior history');
    await atomic(reportFile,reportText({p,date:now,periodKey:current.key,updates:changed,previousDate:previous.lastReportAt,syncResult:result,docCount:docs.length}));
    await atomic(reportStatePath,JSON.stringify({schema:1,lastReportAt:nowISO(now),documents:docs},null,2)+'\n');
    report=reportFile;
  }
  return {root,frequency:config.frequency,report,reportDue:shouldReport,reportSkipped:shouldReport&&!report,changed:{added:changed.added.length,modified:changed.changed.length,removed:changed.deleted.length},docs:docs.length,approved:p.memories.length,pending:p.pending,scan:result};
}
export function workspaceStatus(){const x=workspace();if(!x)return {configured:false};const s=readJSON(path.join(x.root,FOLDERS.internal,'report-state.json'));return {configured:true,root:x.root,inbox:path.join(x.root,FOLDERS.inbox),frequency:x.frequency,lastReportAt:s?.lastReportAt||null};}
export function latestOverview(section='latest'){
  const x=workspace();if(!x)throw Error('Workspace not initialized');
  requireIntactFolders(x.root);
  const allowed={profile:path.join(FOLDERS.persona,'digital-self.md'),projects:path.join(FOLDERS.projects,'projects.md'),memories:path.join(FOLDERS.memories,'long-term-memory.md')};
  if(section==='latest'){
    const files=fs.readdirSync(path.join(x.root,FOLDERS.reviews)).filter(f=>/^\d{4}-(?:W\d{2}|\d{2})\.md$|^manual-\d{4}-\d{2}-\d{2}\.md$/.test(f));
    if(!files.length)return {section:'latest',available:false,text:'No periodic report yet; run tick.'};
    // Chronological generation time, NOT lexical order: W44 sorts after 11.
    const ranked=files.map(file=>({file,at:generatedTime(x.root,FOLDERS.reviews,file)})).sort((a,b)=>b.at-a.at||b.file.localeCompare(a.file));
    const file=ranked[0].file;return {section:'latest',file,text:secureTextFile(x.root,FOLDERS.reviews,file).slice(0,18000)};
  }
  if(!Object.hasOwn(allowed,section))throw Error('Unsupported section');
  const file=path.join(x.root,allowed[section]);return {section,available:fs.existsSync(file),text:fs.existsSync(file)?secureTextFile(x.root,path.dirname(allowed[section]),path.basename(allowed[section])).slice(0,18000):''};
}
