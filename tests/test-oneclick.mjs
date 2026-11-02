import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ps=fs.readFileSync(path.join(root,'Install-SiranOS.ps1'),'utf8').replace(/^\uFEFF/,'');
const cmd=fs.readFileSync(path.join(root,'Install-SiranOS.cmd'),'utf8');
const cases=[
  ['per-user app path', /LocalApplicationData[\s\S]*?Programs\\SiranOS/],
  ['separate local data', /SiranOS\\state-0\.5\.1/],
  ['workspace initialization', /'init','--root'/],
  ['initial sync', /'tick'/],
  ['official node URL', /https:\/\/nodejs\.org\/dist/],
  ['checksummed runtime', /Get-FileHash -Algorithm SHA256/],
  ['prevent overwriting existing app', /Unknown existing app directory/],
  ['avoid overwriting knowledge', /An existing SiranOS folder was detected/],
  ['MCP named server', /mcp add siranos --env/],
  ['MCP uses dedicated env', /SIRANOS_HOME=\$state/],
  ['MCP does not replace existing', /Codex already has a server named siranos/],
  ['scheduled task opt-in', /Type YES to enable/],
  ['fails on CLI error', /if \(\$LASTEXITCODE -ne 0\)/],
  ['installer launcher', /Install-SiranOS\.ps1/]
];
for(const [label,regex] of cases){assert.match(label==='installer launcher'?cmd:ps,regex,label)}
assert.ok(fs.existsSync(path.join(root,'bridge','cli.mjs')),'CLI exists');
assert.ok(fs.existsSync(path.join(root,'bridge','mcp.mjs')),'MCP server exists');
console.log('Windows one-click installer static contract OK:',cases.length,'checks. Real Windows E2E remains required.');
