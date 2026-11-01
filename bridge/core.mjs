/** SiranOS Drive-folder bridge: user-selected local folder, local-only SQLite. */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {inflateRawSync} from 'node:zlib';

const HOME = process.env.SIRANOS_HOME ? path.resolve(process.env.SIRANOS_HOME) : path.join(os.homedir(), '.siranos');
const CONFIG = path.join(HOME, 'config.json');
const DBPATH = path.join(HOME, 'knowledge.sqlite');
const MAX_FILE = 48 * 1024 * 1024; // Reject oversized file before allocating memory.
const MAX_FILES = 20000;
const EXT = new Set(['.txt','.md','.markdown','.csv','.json','.jsonl','.html','.htm','.pdf','.docx']);
const SKIP = new Set(['.git','node_modules','.cache','.trash','System Volume Information']);
let db;

export const dataDirectory = () => HOME;
export async function configure(folder) {
  const real = await fsp.realpath(path.resolve(folder));
  const stat = await fsp.stat(real);
  if (!stat.isDirectory()) throw new Error('Selected path is not a directory');
  await fsp.mkdir(HOME, {recursive:true,mode:0o700});
  await fsp.writeFile(CONFIG, JSON.stringify({schema:1,sourceFolder:real,createdAt:new Date().toISOString()},null,2),{mode:0o600});
  return {sourceFolder:real,configPath:CONFIG};
}
export function configuration() {
  if (!fs.existsSync(CONFIG)) throw new Error('Not configured. Run: node bridge/cli.mjs setup --folder "<Google Drive synced folder>"');
  const v=JSON.parse(fs.readFileSync(CONFIG,'utf8'));
  if (v.schema!==1 || !path.isAbsolute(v.sourceFolder)) throw new Error('Invalid config');
  return v;
}
export function database() {
  if (db) return db;
  fs.mkdirSync(HOME,{recursive:true,mode:0o700});
  db=new DatabaseSync(DBPATH);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=2500; PRAGMA foreign_keys=ON;');
  db.exec(`CREATE TABLE IF NOT EXISTS documents (
    path TEXT PRIMARY KEY, hash TEXT NOT NULL, mtime INTEGER NOT NULL, size INTEGER NOT NULL,
    indexed_at TEXT NOT NULL, chunks_count INTEGER NOT NULL DEFAULT 0, error TEXT
  );
  CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY, source_path TEXT NOT NULL, ordinal INTEGER NOT NULL,
    text TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'document', title TEXT NOT NULL,
    line_start INTEGER, line_end INTEGER, event_time TEXT,
    FOREIGN KEY(source_path) REFERENCES documents(path) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS chunks_file_idx ON chunks(source_path);
  CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY, source_id TEXT NOT NULL, excerpt TEXT NOT NULL,
    kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
    source_hash TEXT NOT NULL, created_at TEXT NOT NULL, approved_at TEXT
  );
  CREATE INDEX IF NOT EXISTS memories_status_idx ON memories(status);
  CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(chunk_id UNINDEXED, text, tokenize='trigram');
  CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
  return db;
}
const digest=data=>crypto.createHash('sha256').update(data).digest('hex');
const quote=text=>String(text??'').replace(/\s+/g,' ').trim();
const maxText=(s,len=900)=>s.length>len?s.slice(0,len)+'…':s;
function roleOf(s){s=String(s||'').toLowerCase();if(['user','human'].includes(s))return 'user';if(['assistant','ai','model','gpt','bot'].includes(s))return 'assistant';return 'document';}
function extractContent(v){
  if(typeof v==='string')return v;
  if(Array.isArray(v))return v.map(extractContent).filter(Boolean).join('\n');
  if(v && typeof v==='object'){
    if(Array.isArray(v.parts))return extractContent(v.parts);
    if(Array.isArray(v.content))return extractContent(v.content);
    if(v.text!=null)return extractContent(v.text);
    if(v.message!=null)return extractContent(v.message);
  }
  return '';
}
function rowsFromConversation(c, rel){
  const title=String(c.title||c.name||c.subject||path.basename(rel)).slice(0,180);
  let msgs=[];
  if(c.mapping && typeof c.mapping==='object'){
    msgs=Object.values(c.mapping).map(x=>x?.message??x).filter(x=>x&&typeof x==='object');
  }else if(Array.isArray(c.chat_messages)) msgs=c.chat_messages;
  else if(Array.isArray(c.messages)) msgs=c.messages;
  else if(Array.isArray(c.responses)) msgs=c.responses;
  const out=[];
  for(const m of msgs){
    const author=m.author?.role||m.author||m.role||m.sender||m.type;
    const body=quote(extractContent(m.content??m.text??m.message??m));
    if(!body)continue;
    out.push({title,role:roleOf(author),text:body,eventTime:String(m.create_time||m.created_at||m.date||'')});
  }
  return out;
}
function chunkText(input, title,role='document'){
  const lines=input.replace(/\r\n/g,'\n').split('\n');
  const out=[];let acc='',begin=1;
  const flush=end=>{if(acc.trim()){out.push({title,role,text:acc.trim(),lineStart:begin,lineEnd:end});acc='';}};
  for(let i=0;i<lines.length;i++){
    let l=lines[i];
    if(l.length>1900){flush(i);for(let off=0;off<l.length;off+=1400)out.push({title,role,text:l.slice(off,off+1400),lineStart:i+1,lineEnd:i+1});begin=i+2;continue;}
    if(acc.length+l.length>1500){flush(i);begin=i+1;}
    if(!acc)begin=i+1;
    acc+=l+'\n';
  }
  flush(lines.length);return out;
}
function stripMarkup(html){return html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,' ').replace(/<\/?(?:p|div|h[1-6]|li|pre|blockquote|br|tr)\b[^>]*>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'");}
function parseText(data, rel){
  const ext=path.extname(rel).toLowerCase(),title=path.basename(rel);
  const text=data.toString('utf8');
  if(ext==='.json'||ext==='.jsonl'){
    let parsed;
    if(ext==='.jsonl'){
      parsed=text.split(/\r?\n/).filter(Boolean).map((line,i)=>{try{return JSON.parse(line)}catch{throw new Error('Bad JSONL at line '+(i+1))}});
    }else parsed=JSON.parse(text);
    const arr=Array.isArray(parsed)?parsed:Array.isArray(parsed.conversations)?parsed.conversations:[parsed];
    const extracted=arr.flatMap(c=>rowsFromConversation(c,rel));
    if(extracted.length)return extracted;
    return chunkText(JSON.stringify(parsed,null,2),title);
  }
  if(ext==='.html'||ext==='.htm'){
    // Supports an embedded JSON data block when present; otherwise plain HTML text.
    const m=text.match(/<script\s+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script\s*>/i);
    if(m){try{const c=JSON.parse(m[1]);const a=(Array.isArray(c)?c:[c]).flatMap(x=>rowsFromConversation(x,rel));if(a.length)return a}catch{}}
    return chunkText(stripMarkup(text),title);
  }
  return chunkText(text,title);
}
function docxText(bytes){
  const min=Math.max(0,bytes.length-65557);let end=-1;
  for(let i=bytes.length-22;i>=min;i--){if(bytes.readUInt32LE(i)===0x06054b50){end=i;break}}
  if(end<0)throw Error('DOCX ZIP directory missing');
  const total=bytes.readUInt16LE(end+10),offset=bytes.readUInt32LE(end+16);
  let pos=offset,xml=null;
  for(let i=0;i<total;i++){
    if(bytes.readUInt32LE(pos)!==0x02014b50)throw Error('Invalid DOCX central directory');
    const method=bytes.readUInt16LE(pos+10),packed=bytes.readUInt32LE(pos+20),plain=bytes.readUInt32LE(pos+24);
    const nameLength=bytes.readUInt16LE(pos+28),extra=bytes.readUInt16LE(pos+30),comment=bytes.readUInt16LE(pos+32);
    const local=bytes.readUInt32LE(pos+42),filename=bytes.subarray(pos+46,pos+46+nameLength).toString('utf8');
    pos+=46+nameLength+extra+comment;
    if(filename!=='word/document.xml')continue;
    if(plain>MAX_FILE||packed>MAX_FILE||bytes.readUInt32LE(local)!==0x04034b50)throw Error('Unsafe DOCX entry');
    const bodyStart=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28);
    const data=bytes.subarray(bodyStart,bodyStart+packed);
    const content=method===8?inflateRawSync(data,{maxOutputLength:MAX_FILE}):method===0?data:null;
    if(!content||content.length>MAX_FILE)throw Error('Unsupported DOCX compression');
    xml=content.toString('utf8');break;
  }
  if(!xml)throw Error('DOCX body missing');
  const lines=xml.replace(/<\/w:p>/gi,'\n').replace(/<w:tab\s*\/>/gi,'\t').replace(/<w:br\s*\/>/gi,'\n');
  return lines.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
}
function pdfText(full){
  const r=spawnSync('pdftotext',['-layout','-enc','UTF-8',full,'-'],{encoding:'utf8',timeout:30000,maxBuffer:MAX_FILE});
  if(r.error || r.status!==0)throw new Error('PDF requires local pdftotext/Poppler; no PDF data indexed');
  return r.stdout;
}
async function walk(root){
  const files=[];const errors=[];const stack=[{dir:root,depth:0}];
  while(stack.length){
    const {dir,depth}=stack.pop();
    let names;
    try{names=await fsp.readdir(dir,{withFileTypes:true})}catch(e){errors.push({file:path.relative(root,dir),reason:e.code||'READ_FAILED'});continue}
    for(const ent of names){
      if(ent.name.startsWith('.')||SKIP.has(ent.name)||ent.isSymbolicLink())continue;
      const p=path.join(dir,ent.name);
      if(ent.isDirectory()&&depth<12){stack.push({dir:p,depth:depth+1});continue;}
      if(!ent.isFile()||!EXT.has(path.extname(ent.name).toLowerCase()))continue;
      if(files.length>=MAX_FILES){errors.push({file:'',reason:'FILE_COUNT_LIMIT'});return {files,errors,complete:false}}
      files.push(p);
    }
  }
  return {files,errors,complete:errors.length===0};
}
const safeRel=(root,full)=>{const rel=path.relative(root,full).split(path.sep).join('/');if(rel.startsWith('..')||path.isAbsolute(rel)||!rel)throw new Error('Source outside configured folder');return rel};
function generateMemories(rows,rel,hash){
  const candidates=[];const re=/(?:我(?:想|希望|计划|打算|决定|选择|喜欢|偏好|认为|觉得|已经|完成|正在)|我的(?:目标|偏好|计划|观点)|I (?:want|prefer|plan|decided|like|believe|have|will))/i;
  rows.forEach((r,idx)=>{
    if(r.role!=='user')return;
    let text=quote(r.text);if(text.length>1200)text=text.slice(0,1200);
    if(text.length<12||!re.test(text))return;
    const sourceId=digest(rel+':'+idx+':'+r.text);
    const id=digest('memory:'+sourceId);
    const kind=/目标|希望|计划|打算|want|plan/i.test(text)?'goal':/决定|选择|decided/i.test(text)?'decision':/喜欢|偏好|prefer|like/i.test(text)?'preference':'reflection';
    candidates.push({id,sourceId,excerpt:text,kind,sourceHash:hash});
  });return candidates;
}
let lastSync=0;
export async function sync({force=false}={}){
  const {sourceFolder}=configuration();
  const root=await fsp.realpath(sourceFolder);
  const d=database();
  const listing=await walk(root);
  let indexed=0,unchanged=0,skipped=0,memoriesAdded=0;
  const errors=[...listing.errors],seen=new Set();
  function invalidate(rel){
    const rows=d.prepare('SELECT id FROM chunks WHERE source_path=?').all(rel);
    if(!rows.length)return;
    d.exec('BEGIN IMMEDIATE');
    try{
      d.prepare("UPDATE memories SET status='stale' WHERE source_id IN (SELECT id FROM chunks WHERE source_path=?)").run(rel);
      for(const row of rows)d.prepare('DELETE FROM chunks_fts WHERE chunk_id=?').run(row.id);
      d.prepare('DELETE FROM documents WHERE path=?').run(rel);
      d.exec('COMMIT');
    }catch(e){d.exec('ROLLBACK');throw e}
  }
  function markTemporarilyUnavailable(rel,reason){
    // Retain the last successfully parsed snapshot and approval decision.
    // Queries suppress documents with an error until successful revalidation.
    d.prepare('UPDATE documents SET error=? WHERE path=?').run(reason,rel);
  }
  for(const full of listing.files){
    const rel=safeRel(root,full);seen.add(rel);
    let st;
    try{st=await fsp.stat(full)}catch(e){errors.push({file:rel,reason:e.code});continue}
    if(st.size>MAX_FILE){skipped++;errors.push({file:rel,reason:'OVER_48_MIB'});markTemporarilyUnavailable(rel,'OVER_48_MIB');continue}
    // Verify a content hash even when size and mtime are unchanged: cloud sync,
    // deterministic file builds and restored mtimes otherwise hide updates.
    const old=d.prepare('SELECT hash,mtime,size,error FROM documents WHERE path=?').get(rel);
    let data;
    try{data=await fsp.readFile(full)}catch(e){const reason=maxText(String(e.message||e),100);skipped++;errors.push({file:rel,reason});markTemporarilyUnavailable(rel,reason);continue}
    // Hash first; re-parse expensive PDF / DOCX files only when their bytes change.
    const hash=digest(data);
    const actual=d.prepare('SELECT hash FROM documents WHERE path=?').get(rel);
    if(actual?.hash===hash){
      d.prepare('UPDATE documents SET mtime=?,size=?,error=NULL WHERE path=?').run(Math.floor(st.mtimeMs),st.size,rel);
      // Old stale entries (e.g. deleted/re-imported in pre-0.5.1 builds) can be
      // reviewed again. Never silently restore an approval after true deletion.
      d.prepare("UPDATE memories SET status='pending',approved_at=NULL WHERE status='stale' AND source_hash=? AND source_id IN (SELECT id FROM chunks WHERE source_path=?)").run(hash,rel);
      unchanged++;continue;
    }
    let rows;
    try{
      rows=path.extname(full).toLowerCase()==='.pdf'?chunkText(pdfText(full),path.basename(rel)):path.extname(full).toLowerCase()==='.docx'?chunkText(docxText(data),path.basename(rel)):parseText(data,rel);
    }catch(e){const reason=maxText(String(e.message||e),100);skipped++;errors.push({file:rel,reason});markTemporarilyUnavailable(rel,reason);continue}
    d.exec('BEGIN IMMEDIATE');
    try{
      d.prepare("UPDATE memories SET status='stale' WHERE source_id IN (SELECT id FROM chunks WHERE source_path=?) AND source_hash<>?").run(rel,hash);
      const previous=d.prepare('SELECT id FROM chunks WHERE source_path=?').all(rel);
      for(const c of previous)d.prepare('DELETE FROM chunks_fts WHERE chunk_id=?').run(c.id);
      d.prepare('DELETE FROM chunks WHERE source_path=?').run(rel);
      d.prepare(`INSERT OR REPLACE INTO documents(path,hash,mtime,size,indexed_at,chunks_count,error) VALUES(?,?,?,?,?,?,NULL)`)
        .run(rel,hash,Math.floor(st.mtimeMs),st.size,new Date().toISOString(),rows.length);
      const put=d.prepare(`INSERT INTO chunks(id,source_path,ordinal,text,role,title,line_start,line_end,event_time) VALUES(?,?,?,?,?,?,?,?,?)`);
      const putFts=d.prepare('INSERT INTO chunks_fts(chunk_id,text) VALUES(?,?)');
      rows.slice(0,30000).forEach((r,i)=>{const id=digest(rel+':'+i+':'+r.text);put.run(id,rel,i,r.text,r.role||'document',r.title||path.basename(rel),r.lineStart??null,r.lineEnd??null,r.eventTime||null);putFts.run(id,r.text)});
      const putMem=d.prepare(`INSERT INTO memories(id,source_id,excerpt,kind,status,source_hash,created_at) VALUES(?,?,?,?,'pending',?,?) ON CONFLICT(id) DO UPDATE SET source_hash=excluded.source_hash, status='pending', approved_at=NULL WHERE memories.source_hash<>excluded.source_hash OR memories.status='stale'`);
      for(const x of generateMemories(rows,rel,hash)){const res=putMem.run(x.id,x.sourceId,x.excerpt,x.kind,hash,new Date().toISOString());memoriesAdded+=Number(res.changes)}
      d.exec('COMMIT');indexed++;
    }catch(e){d.exec('ROLLBACK');errors.push({file:rel,reason:maxText(String(e.message||e),100)})}
  }
  // Do not prune a store after a partial/unreadable source scan.
  if(listing.complete){
    const old=d.prepare('SELECT path FROM documents').all();
    for(const row of old){if(seen.has(row.path))continue;
      const ids=d.prepare('SELECT id FROM chunks WHERE source_path=?').all(row.path);
      for(const c of ids)d.prepare('DELETE FROM chunks_fts WHERE chunk_id=?').run(c.id);
      d.prepare("UPDATE memories SET status='stale' WHERE source_id IN (SELECT id FROM chunks WHERE source_path=?)").run(row.path);
      d.prepare('DELETE FROM documents WHERE path=?').run(row.path);
    }
  }
  lastSync=Date.now();
  d.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('last_sync',?)").run(new Date(lastSync).toISOString());
  return {indexed,unchanged,skipped,memoriesAdded,seen:seen.size,partial:!listing.complete,errors:errors.slice(0,40)};
}
export async function syncIfDue(){if(Date.now()-lastSync>60000)return sync();return null}
const cleanQuery=q=>String(q||'').trim().slice(0,200);
export function search(query,{limit=8,role='all'}={}){
  const d=database(),q=cleanQuery(query),n=Math.max(1,Math.min(30,Number(limit)||8));if(!q)return [];
  let rows=[];
  const words=q.toLowerCase().match(/[\p{Script=Han}]{2,}|[a-z0-9_]{3,}/gu)||[];
  const triples=[...new Set(words.flatMap(w=>w.length<3?[]:Array.from({length:Math.min(w.length-2,8)},(_,i)=>w.slice(i,i+3))))].slice(0,14);
  if(triples.length){
    const fts=triples.map(x=>'"'+x.replaceAll('"','')+'"').join(' OR ');
    try{
      rows=d.prepare(`SELECT c.*, bm25(chunks_fts) AS rank FROM chunks_fts JOIN chunks c ON c.id=chunks_fts.chunk_id WHERE chunks_fts MATCH ? AND (?='all' OR c.role=?) AND EXISTS (SELECT 1 FROM documents d WHERE d.path=c.source_path AND d.error IS NULL) ORDER BY rank ASC LIMIT ?`).all(fts,role,role,n*5);
    }catch{/* fallback below */}
  }
  if(!rows.length){
    const escaped=q.replaceAll('%','\\%').replaceAll('_','\\_');
    rows=d.prepare(`SELECT * FROM chunks WHERE text LIKE ? ESCAPE '\\' AND (?='all' OR role=?) AND EXISTS (SELECT 1 FROM documents d WHERE d.path=chunks.source_path AND d.error IS NULL) LIMIT ?`).all('%'+escaped+'%',role,role,n*5);
  }
  const queryWords=words.length?words:[q];
  rows.sort((a,b)=>{
    const rank=x=>queryWords.reduce((sum,w)=>sum+(x.text.toLowerCase().includes(w)?2:0),0)+(x.role==='user'?0.25:0);
    return rank(b)-rank(a);
  });
  return rows.slice(0,n).map(x=>({evidence_id:x.id,source:x.source_path,title:x.title,role:x.role,line_start:x.line_start,line_end:x.line_end,date:x.event_time||null,quote:maxText(x.text,1100)}));
}
export function evidence(id){const r=database().prepare('SELECT c.* FROM chunks c JOIN documents d ON d.path=c.source_path WHERE c.id=? AND d.error IS NULL').get(String(id));return r?{evidence_id:r.id,source:r.source_path,title:r.title,role:r.role,line_start:r.line_start,line_end:r.line_end,text:maxText(r.text,9000),event_time:r.event_time}:null}
export function candidates(limit=30){return database().prepare("SELECT id,excerpt,kind,status,created_at FROM memories WHERE status='pending' ORDER BY created_at DESC LIMIT ?").all(Math.max(1,Math.min(100,Number(limit)||30)))}
export function review(id,action){if(!['confirmed','dismissed'].includes(action))throw Error('Invalid review action');const d=database();const row=d.prepare('SELECT * FROM memories WHERE id=?').get(String(id));if(!row||row.status==='stale')throw Error('Memory not found or source stale');const matched=d.prepare('SELECT d.hash FROM chunks c JOIN documents d ON d.path=c.source_path WHERE c.id=? AND d.error IS NULL').get(row.source_id);if(!matched||matched.hash!==row.source_hash)throw Error('Source changed; cannot confirm');d.prepare('UPDATE memories SET status=?,approved_at=? WHERE id=?').run(action,new Date().toISOString(),id);return {id,status:action}}
export function profile({limit=null,offset=0}={}){
  const d=database();
  const where="FROM memories m JOIN chunks c ON c.id=m.source_id JOIN documents d ON d.path=c.source_path WHERE m.status='confirmed' AND m.source_hash=d.hash AND d.error IS NULL";
  const total=d.prepare('SELECT COUNT(*) AS n '+where).get().n;
  const start=Math.max(0,Number(offset)||0);
  const pageSize=limit==null?null:Math.max(1,Math.min(500,Number(limit)||100));
  const sql='SELECT m.id,m.excerpt,m.kind,c.source_path,c.id evidence_id '+where+' ORDER BY m.approved_at DESC,m.id ASC'+(pageSize==null?'':' LIMIT ? OFFSET ?');
  const memories=pageSize==null?d.prepare(sql).all():d.prepare(sql).all(pageSize,start);
  return {status:'human_reviewed_statements_not_independently_verified',memories,total,offset:start,returned:memories.length,hasMore:pageSize!=null&&start+memories.length<total,pending:d.prepare("SELECT COUNT(*) n FROM memories WHERE status='pending'").get().n};
}
export function status(){const d=database();const counts=d.prepare('SELECT (SELECT COUNT(*) FROM documents) docs,(SELECT COUNT(*) FROM chunks) chunks,(SELECT COUNT(*) FROM memories WHERE status=\'confirmed\') confirmed,(SELECT COUNT(*) FROM memories WHERE status=\'pending\') pending').get();return {...counts,dataLocation:HOME,sourceFolder:configuration().sourceFolder,lastSync:d.prepare("SELECT value FROM settings WHERE key='last_sync'").get()?.value||null,limits:{maxFileMiB:48,formats:[...EXT]}}}
