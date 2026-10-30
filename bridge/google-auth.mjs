/** Direct Google Drive OAuth for a desktop/local CLI client.
 * Development preview: publisher must supply an OAuth desktop client ID and
 * obtain Google verification before offering restricted drive.readonly widely.
 * Never put access tokens on stdout, in git, or in MCP responses.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import http from 'node:http';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {dataDirectory} from './core.mjs';

export const DRIVE_SCOPE='https://www.googleapis.com/auth/drive.readonly';
const AUTH='https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN='https://oauth2.googleapis.com/token';
const TOKEN_FILE=()=>path.join(dataDirectory(),'google-oauth-token.json');
const CLOUD_FILE=()=>path.join(dataDirectory(),'google-cloud.json');
const ID_FILE=()=>path.join(path.dirname(fileURLToPath(import.meta.url)),'google-client.json');

const readJson=file=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
async function savePrivate(file,record){await fsp.mkdir(path.dirname(file),{recursive:true,mode:0o700});const tmp=file+'.tmp-'+crypto.randomBytes(8).toString('hex');try{await fsp.writeFile(tmp,JSON.stringify(record,null,2),{mode:0o600});await fsp.rename(tmp,file)}finally{await fsp.rm(tmp,{force:true}).catch(()=>{})}}
export function clientConfig(){const cfg=readJson(ID_FILE())||{};const id=process.env.SIRANOS_GOOGLE_CLIENT_ID||cfg.client_id;const secret=process.env.SIRANOS_GOOGLE_CLIENT_SECRET||cfg.client_secret||undefined;if(!id||!/^\d+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(id))throw Error('Google OAuth desktop client ID not configured. Publisher must distribute a verified client ID; developers can set SIRANOS_GOOGLE_CLIENT_ID.');return {client_id:id,client_secret:secret}}
export function makeAuthorizeUrl({clientId,redirectUri,state,challenge}){const p=new URLSearchParams({client_id:clientId,redirect_uri:redirectUri,response_type:'code',scope:DRIVE_SCOPE,access_type:'offline',prompt:'consent',state,code_challenge:challenge,code_challenge_method:'S256'});return AUTH+'?'+p.toString()}
export function pkce(){const verifier=crypto.randomBytes(40).toString('base64url');const challenge=crypto.createHash('sha256').update(verifier).digest('base64url');return {verifier,challenge,state:crypto.randomBytes(32).toString('base64url')}}
async function parseTokenResponse(response){const body=await response.json().catch(()=>({}));if(!response.ok)throw Error('Google OAuth token request failed ('+response.status+'): '+String(body.error||'unknown').slice(0,120));return body}
export async function redeemCode({code,redirectUri,verifier,client,fetchImpl=fetch}){const p=new URLSearchParams({code,redirect_uri:redirectUri,client_id:client.client_id,code_verifier:verifier,grant_type:'authorization_code'});if(client.client_secret)p.set('client_secret',client.client_secret);return parseTokenResponse(await fetchImpl(TOKEN,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:p.toString()}))}
export async function refreshGoogleToken({client=clientConfig(),fetchImpl=fetch,now=Date.now}={}){const old=readJson(TOKEN_FILE());if(!old?.refresh_token)throw Error('Google account not connected; run google-connect');if(old.access_token&&old.expires_at>now()+120000)return old.access_token;const p=new URLSearchParams({client_id:client.client_id,refresh_token:old.refresh_token,grant_type:'refresh_token'});if(client.client_secret)p.set('client_secret',client.client_secret);const result=await parseTokenResponse(await fetchImpl(TOKEN,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:p.toString()}));const next={...old,access_token:result.access_token,expires_at:now()+Number(result.expires_in||3600)*1000,scope:result.scope||old.scope};await savePrivate(TOKEN_FILE(),next);return next.access_token}
export function cloudConfig(){return readJson(CLOUD_FILE())}
export function googleStatus(){const token=readJson(TOKEN_FILE()),cloud=cloudConfig();return {connected:!!token?.refresh_token,folderId:cloud?.folder_id||null,folderName:cloud?.folder_name||null,lastSync:cloud?.last_sync||null,restrictedScope:DRIVE_SCOPE,oauthClientConfigured:(()=>{try{clientConfig();return true}catch{return false}})(),security:'Tokens stored on this computer, not encrypted at rest; do not share ~/.siranos.'}}
export async function saveCloudConfig(value){await savePrivate(CLOUD_FILE(),{...(cloudConfig()||{}),...value})}
export async function storeTokenForTest(record){if(process.env.SIRANOS_TEST_MODE!=='1')throw Error('Test only');await savePrivate(TOKEN_FILE(),record)}
export async function disconnectGoogle(){await fsp.rm(TOKEN_FILE(),{force:true});await fsp.rm(CLOUD_FILE(),{force:true});return {connected:false,note:'Local token and cloud configuration removed. Revoke SiranOS in Google Account security settings to revoke prior consent. Indexed knowledge and downloaded cache are not deleted by this command.'}}
function launchBrowser(url){try{let cmd,args;if(process.platform==='win32'){cmd='explorer.exe';args=[url]}else if(process.platform==='darwin'){cmd='open';args=[url]}else{cmd='xdg-open';args=[url]}const p=spawn(cmd,args,{detached:true,stdio:'ignore',windowsHide:true});p.on('error',()=>{});p.unref()}catch{}}
export async function loginGoogle({client=clientConfig(),onUrl=console.error,timeoutMs=180000,fetchImpl=fetch,openBrowser=true}={}){
  const {verifier,challenge,state}=pkce();let resolveAuth,rejectAuth;const result=new Promise((resolve,reject)=>{resolveAuth=resolve;rejectAuth=reject});
  const server=http.createServer((req,res)=>{
    try{const url=new URL(req.url||'/', 'http://127.0.0.1');if(url.pathname!=='/callback'){res.writeHead(404);res.end('Not found');return}
      if(url.searchParams.get('state')!==state)throw Error('OAuth state mismatch');
      if(url.searchParams.get('error'))throw Error('Authorization cancelled or denied');
      const code=url.searchParams.get('code');if(!code)throw Error('Missing authorization code');
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'"});res.end('<!doctype html><html><body><h3>SiranOS: Google sign-in completed.</h3><p>Return to your terminal. This local tab may be closed.</p></body></html>');resolveAuth(code);
    }catch(e){res.writeHead(400,{'Content-Type':'text/plain','Cache-Control':'no-store'});res.end('Google sign-in failed. Return to the terminal.');rejectAuth(e)}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
  const redirectUri='http://127.0.0.1:'+server.address().port+'/callback';const u=makeAuthorizeUrl({clientId:client.client_id,redirectUri,state,challenge});
  const timer=setTimeout(()=>rejectAuth(Error('OAuth login timed out')),timeoutMs);timer.unref?.();
  try{onUrl(u);if(openBrowser)launchBrowser(u);const code=await result;const response=await redeemCode({code,redirectUri,verifier,client,fetchImpl});if(!response.refresh_token)throw Error('Google did not return an offline refresh token; revoke prior consent and reconnect');await savePrivate(TOKEN_FILE(),{refresh_token:response.refresh_token,access_token:response.access_token,scope:response.scope||DRIVE_SCOPE,expires_at:Date.now()+Number(response.expires_in||3600)*1000});return {connected:true,scope:DRIVE_SCOPE,note:'OAuth succeeded. Choose a folder with: google-folder <Google Drive folder URL>. Tokens are local and unencrypted at rest.'}}
  finally{clearTimeout(timer);server.close()}
}
