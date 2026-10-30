#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const ROOT=path.resolve(import.meta.dirname,'..');
const tracked=['README.md','SECURITY.md','LICENSE','.gitignore','package.json'];
for(const dir of ['docs','examples','extension','tests','bridge','.github/workflows']) {
  const walk=p=>{for(const name of fs.readdirSync(p)){const full=path.join(p,name);if(fs.statSync(full).isDirectory())walk(full);else if(!name.endsWith('.zip'))tracked.push(path.relative(ROOT,full));}};
  walk(path.join(ROOT,dir));
}
const disallowed=[
  [/李思然|广州华立学院|广州华立|人生实验室|思然\s*LifeOS|Siran\s+LifeOS/ig,'private legacy identity'],
  [/https?:\/\/(?:docs|drive)\.google\.com\/(?:document\/d|drive\/folders|file\/d)\/[A-Za-z0-9_-]+/ig,'personal Drive document reference'],
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{25,}|ya29\.[A-Za-z0-9_-]{20,}/g,'credential'],
  [/\b[A-Z]:\\Users\\[^\\\s]+|\/Users\/[^\/\s]+/g,'local personal path'],
];
let errors=[];
for(const rel of tracked){let s=fs.readFileSync(path.join(ROOT,rel),'utf8');if(rel==='scripts/privacy-check.mjs')continue;for(const [re,label] of disallowed){if(re.test(s))errors.push(`${rel}: ${label}`);re.lastIndex=0;}}
const fixture='tests/multi-provider-fixture.zip';const data=fs.readFileSync(path.join(ROOT,fixture));if(data.length>10000)errors.push(`${fixture}: unexpectedly large`);
if(errors.length){console.error('Privacy check failed:\n'+errors.join('\n'));process.exitCode=1;}else console.log(`Privacy check OK: ${tracked.length} text files; synthetic ZIP size ${data.length} bytes. Commit metadata requires a separate Git history audit.`);
