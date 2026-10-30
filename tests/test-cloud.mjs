import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import {mkdtempSync,rmSync} from 'node:fs';
import {setTimeout as pause} from 'node:timers/promises';
const home=mkdtempSync(path.join(os.tmpdir(),'siranos-cloud-test-'));
process.env.SIRANOS_HOME=home;
process.env.SIRANOS_TEST_MODE='1';
const auth=await import('../bridge/google-auth.mjs');
const drive=await import('../bridge/google-drive.mjs');
const core=await import('../bridge/core.mjs');
const fakeClient={client_id:'1234-example.apps.googleusercontent.com'};
assert.match(auth.makeAuthorizeUrl({clientId:fakeClient.client_id,redirectUri:'http://127.0.0.1:12345/callback',state:'s',challenge:'c'}),/code_challenge_method=S256/);
assert.match(auth.makeAuthorizeUrl({clientId:fakeClient.client_id,redirectUri:'http://127.0.0.1:12345/callback',state:'s',challenge:'c'}),/drive.readonly/);
const fakeFetch=async(_url,options)=>{const p=new URLSearchParams(options.body);if(p.get('grant_type')==='authorization_code'){assert.equal(p.get('code_verifier')?.length>30,true);return new Response(JSON.stringify({refresh_token:'demo-refresh',access_token:'demo-access',expires_in:3600}),{status:200,headers:{'content-type':'application/json'}})}if(p.get('grant_type')==='refresh_token'){assert.equal(p.get('refresh_token'),'demo-refresh');return new Response(JSON.stringify({access_token:'refreshed',expires_in:3600}),{status:200})}throw Error('bad token request')};
const connected=await auth.loginGoogle({client:fakeClient,fetchImpl:fakeFetch,openBrowser:false,onUrl:u=>{const v=new URL(u);const cb=new URL(v.searchParams.get('redirect_uri'));cb.searchParams.set('code','fake-auth-code');cb.searchParams.set('state',v.searchParams.get('state'));fetch(cb).catch(()=>{})}});
assert.equal(connected.connected,true);
assert.equal(auth.googleStatus().connected,true);
let token=await auth.refreshGoogleToken({client:fakeClient,fetchImpl:fakeFetch});assert.equal(token,'demo-access');
const filepath=path.join(home,'google-oauth-token.json');const json=JSON.parse(fs.readFileSync(filepath,'utf8'));json.expires_at=1;fs.writeFileSync(filepath,JSON.stringify(json));token=await auth.refreshGoogleToken({client:fakeClient,fetchImpl:fakeFetch});assert.equal(token,'refreshed');
const rootId='1demoFolderA',childId='1demoFolderB';
let remoteFiles=[{id:'file-chat-1',name:'messages.json',mimeType:'application/json',modifiedTime:'2026-01-01T01:00:00Z',size:'200'},
 {id:'file-doc-2',name:'Ideas',mimeType:'application/vnd.google-apps.document',modifiedTime:'2026-01-01T01:00:00Z'},
 {id:'file-sheet-3',name:'Budget',mimeType:'application/vnd.google-apps.spreadsheet',modifiedTime:'2026-01-01T01:00:00Z'},
 {id:'file-oversize',name:'big.txt',mimeType:'text/plain',modifiedTime:'2026-01-01T01:00:00Z',size:String(60*1024*1024)}];
let filesFetched=[];
const conversation=[{id:'ch1',title:'Mock gardening chat',mapping:{a:{message:{author:{role:'user'},content:{parts:['我决定组织社区的志愿者种植活动，以便孩子学习照顾植物。']}}},b:{message:{author:{role:'assistant'},content:{parts:['我的私人银行账户里有钱。']}}}}}];
let incomplete=false;
const fetchCloud=async (url,options)=>{
 const u=new URL(url);if(!options?.headers?.Authorization?.startsWith('Bearer '))throw Error('missing auth');
 if(u.pathname===`/drive/v3/files/${rootId}`)return Response.json({id:rootId,name:'Mock inbox',mimeType:'application/vnd.google-apps.folder'});
 if(u.pathname==='/drive/v3/files'){
  if(incomplete)return Response.json({incompleteSearch:true,files:[]});
  const q=u.searchParams.get('q')||'';if(q.includes(rootId))return Response.json({files:[{id:childId,name:'child',mimeType:'application/vnd.google-apps.folder'},...remoteFiles]});
  if(q.includes(childId))return Response.json({files:[]});
 }
 if(u.pathname.startsWith('/drive/v3/files/')){
  const parts=u.pathname.split('/');const id=parts[4];filesFetched.push(id);
  if(id==='file-chat-1')return new Response(JSON.stringify(conversation));
  if(id==='file-doc-2')return new Response('Sample Google Doc from test.');
  if(id==='file-sheet-3')return new Response('key,value\na,b');
 }
 return new Response('Not found',{status:404});
};
const remote=drive.driveClient({token:'demo',fetchImpl:fetchCloud});
const selected=await drive.selectGoogleFolder(`https://drive.google.com/drive/folders/${rootId}`,{client:remote});assert.equal(selected.folderId,rootId);
let result=await drive.syncGoogle({client:remote});assert.equal(result.downloaded,3);assert.equal(result.skipped,1);assert.equal(result.partial,false);
assert.ok(core.search('志愿者',{role:'user'}).length>=1);
assert.equal(core.search('私人银行账户',{role:'user'}).length,0);
assert.ok(core.search('Google Doc').length>=1);
assert.ok(core.search('key,value').length>=1);
let pend=core.candidates();assert.ok(pend.length>=1);core.review(pend[0].id,'confirmed');assert.equal(core.profile().memories.length,1);
result=await drive.syncGoogle({client:remote});assert.equal(result.downloaded,0);assert.equal(result.unchanged,3);
remoteFiles=remoteFiles.filter(f=>f.id!=='file-chat-1');result=await drive.syncGoogle({client:remote});assert.equal(core.search('志愿者').length,0);assert.equal(core.profile().memories.length,0);
incomplete=true;await assert.rejects(drive.syncGoogle({client:remote}),/incomplete/);
assert.ok(core.search('Google Doc').length>=1,'partial listing must not erase good data');
incomplete=false;
// Provider verification: malformed folder URL rejected before touching Drive.
assert.throws(()=>drive.folderIdFrom('https://not-google.example/path'),/folder/);
const disconnected=await auth.disconnectGoogle();assert.equal(disconnected.connected,false);assert.equal(auth.googleStatus().connected,false);
rmSync(home,{recursive:true,force:true});
console.log('PASS cloud: loopback OAuth/PKCE + refresh, Drive folder traversal, native Docs export, incremental indexing, deletion/stale, incomplete listing and disconnect');
