import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,unlinkSync,readFileSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync,spawn} from 'node:child_process';
import {once} from 'node:events';
const root=mkdtempSync(path.join(os.tmpdir(),'siranos-test-'));
const home=path.join(root,'private-home'),inbox=path.join(root,'drive-simulated');mkdirSync(inbox);
process.env.SIRANOS_HOME=home;
const b=await import('../bridge/core.mjs');
const file=path.join(inbox,'chats.json');
const conv=[{id:'demo',title:'Fictional garden chat',mapping:{
  a:{message:{author:{role:'user'},content:{parts:['我决定在社区花园开展一次种植体验，并和志愿者一起完成活动。']}}},
  b:{message:{author:{role:'assistant'},content:{parts:['我有500万元存款，我的投资建议是立即购买股票。']}}},
  c:{message:{author:{role:'user'},content:{parts:['我的目标是帮助居民学习基础浇水知识，并让他们独立照顾植物。']}}}
}}];
writeFileSync(file,JSON.stringify(conv));writeFileSync(path.join(inbox,'reference.md'),'# Garden guide\nCommunity garden planting timetable: Sunday afternoon.\n');
const cfg=await b.configure(inbox);assert.equal(cfg.sourceFolder,inbox);
let result=await b.sync();assert.equal(result.indexed,2);assert.equal(result.skipped,0);
let matches=b.search('社区花园');assert.ok(matches.length>=1);assert.equal(matches[0].role,'user');
assert.ok(b.search('我有500万元存款',{role:'user'}).length===0,'assistant must not be treated as user');
assert.ok(b.search('种植体验',{role:'user'}).every(x=>x.role==='user'));
assert.ok(b.evidence(matches[0].evidence_id)?.text.includes('种植体验'));
const pending=b.candidates();assert.equal(pending.length,2);
assert.equal(b.profile().memories.length,0);
b.review(pending[0].id,'confirmed');assert.equal(b.profile().memories.length,1);
result=await b.sync();assert.equal(result.unchanged,2);
// Simulate a chat export replacement; previously approved source must go stale.
conv[0].mapping.a.message.content.parts[0]='我决定改为线上举办社区花园交流活动，不再进行线下种植。';
writeFileSync(file,JSON.stringify(conv));result=await b.sync();assert.equal(result.indexed,1);
assert.equal(b.profile().memories.length,0);
assert.ok(b.candidates().length>=1);
// A removed file must no longer appear in search.
unlinkSync(path.join(inbox,'reference.md'));await b.sync();assert.equal(b.search('timetable').length,0);
// Protect source folder outside symlink boundaries.
try {const {symlinkSync}=await import('node:fs');symlinkSync(path.join(root,'outside-secret.txt'),path.join(inbox,'shortcut.txt'));writeFileSync(path.join(root,'outside-secret.txt'),'DO NOT READ PERSONAL SECRET');await b.sync();assert.equal(b.search('DO NOT READ PERSONAL SECRET').length,0)}catch(e){if(e.code!=='EPERM'&&e.code!=='EACCES')throw e}
assert.equal(b.status().docs,1);
console.log('PASS: local Drive-folder indexing, role-scoped evidence, reviewed profile, stale source, removed source, symlink boundary');
// Minimal real stdio JSON-RPC handshake, with no cloud network.
const proc=spawn(process.execPath,['--no-warnings',new URL('../bridge/mcp.mjs',import.meta.url).pathname],{env:{...process.env,SIRANOS_HOME:home},stdio:['pipe','pipe','pipe']});
const pendingResponses=new Map();let buffer='';
proc.stdout.on('data',chunk=>{buffer+=chunk.toString();while(buffer.includes('\n')){const idx=buffer.indexOf('\n'),line=buffer.slice(0,idx);buffer=buffer.slice(idx+1);if(!line.trim())continue;const obj=JSON.parse(line);pendingResponses.get(obj.id)?.(obj);pendingResponses.delete(obj.id)}});
async function call(id,method,params={}){return await Promise.race([new Promise(resolve=>{pendingResponses.set(id,resolve);proc.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n')}),new Promise((_,reject)=>setTimeout(()=>reject(new Error('MCP response timeout')),8000))])}
let z=await call(1,'initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'test',version:'1'}});assert.equal(z.result.serverInfo.name,'siranos-local-second-brain');
z=await call(2,'tools/list');assert.ok(z.result.tools.some(t=>t.name==='siranos_search'));
z=await call(3,'tools/call',{name:'siranos_search',arguments:{query:'社区花园'}});assert.ok(JSON.parse(z.result.content[0].text).results.length>=1);
z=await call(4,'tools/call',{name:'siranos_profile',arguments:{}});assert.equal(JSON.parse(z.result.content[0].text).memories.length,0);
proc.stdin.end();proc.kill();
rmSync(root,{recursive:true,force:true});
console.log('PASS: MCP initialize, tools/list, search tool, profile tool; no external services');
