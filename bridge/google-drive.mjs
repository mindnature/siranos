/** Read-only, folder-scoped Google Drive cloud ingestion.
 * Uses restricted Drive read-only OAuth; not a verified public OAuth app yet.
 * The app intentionally LISTS and DOWNLOADS only the user-selected tree.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {configure,sync,dataDirectory} from './core.mjs';
import {cloudConfig,saveCloudConfig,refreshGoogleToken} from './google-auth.mjs';

const ENDPOINT='https://www.googleapis.com/drive/v3';
const CACHE=()=>path.join(dataDirectory(),'google-files');
const MANIFEST=()=>path.join(dataDirectory(),'google-manifest.json');
const MAX_DOWNLOAD=48*1024*1024;
const MAX_FILES=20000;
const EXTENSIONS=new Set(['.txt','.md','.markdown','.csv','.json','.jsonl','.html','.htm','.pdf','.docx']);
const DOC='application/vnd.google-apps.document';
const SHEET='application/vnd.google-apps.spreadsheet';
const FOLDER='application/vnd.google-apps.folder';
const HASH=x=>crypto.createHash('sha256').update(String(x)).digest('hex').slice(0,20);
const safeName=n=>String(n||'untitled').replace(/[\\/\0-\x1f\x7f:*?"<>|]/g,'_').slice(0,120);
export function folderIdFrom(value){let x=String(value||'').trim();let m=x.match(/\/folders\/([a-zA-Z0-9_-]+)/);if(m)x=m[1];if(!/^[A-Za-z0-9_-]{8,128}$/.test(x))throw Error('Provide a valid Google Drive folder URL or ID');return x}
const readManifest=()=>{try{return JSON.parse(fs.readFileSync(MANIFEST(),'utf8'))}catch{return {schema:1,files:{}}}};
function cachePath(root,filename){if(typeof filename!=='string'||!filename||path.basename(filename)!==filename||filename==='.'||filename==='..')throw Error('Unsafe cache filename');return path.join(root,filename)}
async function saveManifest(m){await fsp.mkdir(dataDirectory(),{recursive:true,mode:0o700});const tmp=MANIFEST()+'.tmp';try{await fsp.writeFile(tmp,JSON.stringify(m,null,2),{mode:0o600});await fsp.rename(tmp,MANIFEST())}finally{await fsp.rm(tmp,{force:true}).catch(()=>{})}}
function qualifiedFile(file){if(file.mimeType===DOC)return {ext:'.txt',exportMime:'text/plain'};if(file.mimeType===SHEET)return {ext:'.csv',exportMime:'text/csv'};const ext=path.extname(file.name||'').toLowerCase();if(!EXTENSIONS.has(ext))return null;return {ext,exportMime:null}}
export function remoteFilename(file){const type=qualifiedFile(file);if(!type)return null;const base=safeName(path.basename(file.name||'file',path.extname(file.name||'')));return HASH(file.id)+'-'+base+type.ext}
export function remoteSignature(file){return [file.id,file.mimeType,file.md5Checksum||'',file.modifiedTime||'',file.size||''].join('|')}
function errorText(status){if(status===401)return 'Google authorization expired; reconnect account';if(status===403)return 'Google Drive access denied; inspect OAuth scope and folder permissions';if(status===429)return 'Google Drive quota exceeded';return 'Google Drive request failed ('+status+')'}
async function responseOrThrow(res){if(!res.ok)throw Error(errorText(res.status));return res}
async function boundedBody(res,limit=MAX_DOWNLOAD){const length=Number(res.headers?.get?.('content-length')||0);if(length>limit)throw Error('Remote file exceeds 48MiB limit');if(!res.body){const b=Buffer.from(await res.arrayBuffer());if(b.length>limit)throw Error('Remote file exceeds 48MiB limit');return b}
 const chunks=[];let total=0;for await(const chunk of res.body){total+=chunk.byteLength;if(total>limit){await res.body.cancel?.().catch?.(()=>{});throw Error('Remote file exceeds 48MiB limit')}chunks.push(Buffer.from(chunk))}return Buffer.concat(chunks,total)}
export function driveClient({token,fetchImpl=fetch}={}){
 if(!token)throw Error('Missing scoped OAuth access token');
 async function get(route,params=null){const url=new URL(ENDPOINT+route);if(params)for(const [key,val] of Object.entries(params))if(val!=null)url.searchParams.set(key,String(val));const response=await responseOrThrow(await fetchImpl(url.toString(),{headers:{Authorization:'Bearer '+token},redirect:'error'}));return response}
 return {
  async metadata(id){return (await get('/files/'+encodeURIComponent(id),{fields:'id,name,mimeType,trashed'})).json()},
  async children(folderId){let pageToken='',files=[],pages=0;do{const q="'"+folderId.replaceAll("'","\\'")+"' in parents and trashed = false";const data=await (await get('/files',{q,fields:'nextPageToken,incompleteSearch,files(id,name,mimeType,modifiedTime,size,md5Checksum,trashed)',pageSize:1000,...(pageToken?{pageToken}:{})})).json();if(data.incompleteSearch)throw Error('Google Drive file listing incomplete');files.push(...(data.files||[]));pageToken=data.nextPageToken||'';if(++pages>100||files.length>MAX_FILES)throw Error('Google Drive folder exceeds configured listing limit')}while(pageToken);return files},
  async download(file){const type=qualifiedFile(file);if(!type)return null;let response;
   if(type.exportMime)response=await get('/files/'+encodeURIComponent(file.id)+'/export',{mimeType:type.exportMime});
   else response=await get('/files/'+encodeURIComponent(file.id),{alt:'media'});
   return boundedBody(response)
  }
 }
}
export async function selectGoogleFolder(value,{client=null,token=null}={}){const id=folderIdFrom(value);const accessToken=client?"test-client":token||await refreshGoogleToken();const remote=client||driveClient({token:accessToken});const meta=await remote.metadata(id);if(meta.mimeType!==FOLDER||meta.trashed)throw Error('Selected ID is not an accessible, non-trashed folder');await fsp.mkdir(CACHE(),{recursive:true,mode:0o700});const previous=cloudConfig();if(previous?.folder_id&&previous.folder_id!==id){await fsp.rm(CACHE(),{recursive:true,force:true});await fsp.rm(MANIFEST(),{force:true})}await fsp.mkdir(CACHE(),{recursive:true,mode:0o700});await configure(CACHE());await sync();await saveCloudConfig({schema:1,folder_id:id,folder_name:String(meta.name||'Selected folder').slice(0,120),last_sync:null});return {folderId:id,folderName:meta.name,scope:'selected folder (client-side restriction)',next:'node bridge/cli.mjs google-sync'}}
let lastCheck=0;
export async function syncGoogle({client=null,token=null}={}){
 const c=cloudConfig();if(!c?.folder_id)throw Error('Choose a Google folder first: google-folder <folder URL>');
 const accessToken=client?'test-client':token||await refreshGoogleToken();const remote=client||driveClient({token:accessToken});
 const root=CACHE();await fsp.mkdir(root,{recursive:true,mode:0o700});
 const manifest=readManifest();if(manifest.folderId!==c.folder_id){manifest.files={};manifest.folderId=c.folder_id}
 const seen=new Set(),dirs=[c.folder_id],visitedDirs=new Set();const errors=[],warnings=[];let discovered=0,downloaded=0,unchanged=0,skipped=0;
 // First complete the listing. A listing error must not delete or stale previously indexed files.
 const all=[];while(dirs.length){const id=dirs.shift();if(visitedDirs.has(id))continue;visitedDirs.add(id);if(visitedDirs.size>2000)throw Error('Too many nested folders');const children=await remote.children(id);for(const f of children){if(f.mimeType===FOLDER){dirs.push(f.id);continue;}if(++discovered>MAX_FILES)throw Error('Too many Google Drive files');if(qualifiedFile(f))all.push(f);else skipped++}}
 for(const f of all){seen.add(f.id);const name=remoteFilename(f),sig=remoteSignature(f),dest=cachePath(root,name),old=manifest.files[f.id];if(old?.signature===sig&&old.local===name&&fs.existsSync(dest)){unchanged++;continue}
  if(Number(f.size)>MAX_DOWNLOAD){skipped++;warnings.push({file_id:f.id,reason:'OVER_48_MIB'});const old=manifest.files[f.id];if(old){await fsp.rm(cachePath(root,old.local),{force:true});delete manifest.files[f.id]}continue}
  try{const data=await remote.download(f);if(!data){skipped++;continue}if(data.length>MAX_DOWNLOAD)throw Error('OVER_48_MIB');const temp=dest+'.pending-'+crypto.randomBytes(8).toString('hex');try{await fsp.writeFile(temp,data,{mode:0o600,flag:'wx'});await fsp.rename(temp,dest)}finally{await fsp.rm(temp,{force:true}).catch(()=>{})}
    if(old&&old.local!==name){const p=cachePath(root,old.local);await fsp.rm(p,{force:true})}
    manifest.files[f.id]={signature:sig,local:name,name:f.name,mimeType:f.mimeType,modifiedTime:f.modifiedTime||null};downloaded++;
  }catch(e){errors.push({file_id:f.id,reason:String(e.message||e).slice(0,150)})}
 }
 // On partial download, retain old data and avoid irreversible deletion until a complete pass.
 if(!errors.length){for(const [id,old]of Object.entries(manifest.files)){if(seen.has(id))continue;await fsp.rm(cachePath(root,old.local),{force:true});delete manifest.files[id]}}
 await saveManifest({...manifest,schema:1,folderId:c.folder_id,updatedAt:new Date().toISOString()});
 const indexed=await sync();lastCheck=Date.now();
 await saveCloudConfig({last_sync:new Date(lastCheck).toISOString(),last_errors:errors.length});
 return {folder:c.folder_name,discovered,downloaded,unchanged,skipped,errors:errors.slice(0,20),warnings:warnings.slice(0,20),partial:errors.length>0,indexed};
}
export async function syncGoogleIfDue({minutes=5}={}){if(Date.now()-lastCheck<minutes*60000)return null;if(!cloudConfig()?.folder_id)return null;return syncGoogle()}
