const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync(__dirname+'/../extension/importer.js','utf8');
const context={crypto:globalThis.crypto,TextEncoder,TextDecoder,Blob,Response,DecompressionStream,File,console};
vm.createContext(context);vm.runInContext(src+';globalThis.I=SiranImporter',context);
(async()=>{
 const huge={name:'GPT.zip',size:5_000_000_000,arrayBuffer:async()=>{throw new Error('should never read huge zip!');}};
 await assert.rejects(context.I.readFile(huge),/ZIP 超过180MB/);
 const tooBigJSON={name:'conversations.json',size:190*1024*1024,text:async()=>{throw new Error('should never read huge json');}};
 await assert.rejects(context.I.readFile(tooBigJSON),/JSON 超过180MB/);
 console.log('PASS import guard: oversized archives rejected before memory allocation');
})().catch(e=>{console.error(e);process.exitCode=1;});
