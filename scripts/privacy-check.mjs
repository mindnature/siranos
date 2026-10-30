#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const files = ['README.md', 'SECURITY.md', 'LICENSE', '.gitignore', 'package.json'];
for (const dir of ['docs', 'examples', 'extension', 'tests', '.github/workflows']) {
  function walk(current) {
    for (const name of fs.readdirSync(current)) {
      const full = path.join(current, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (!name.endsWith('.zip')) files.push(path.relative(root, full));
    }
  }
  walk(path.join(root, dir));
}
const patterns = [
  {name:'legacy identity',re:/李思然|广州华立学院|广州华立|人生实验室|思然\s*LifeOS|Siran\s+LifeOS/ig},
  {name:'private Drive link',re:/https?:\/\/(?:docs|drive)\.google\.com\/(?:document\/d|drive\/folders|file\/d)\/[A-Za-z0-9_-]+/ig},
  {name:'secret',re:/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{25,}|ya29\.[A-Za-z0-9_-]{20,}/g},
  {name:'personal computer path',re:/\b[A-Z]:\\Users\\[^\\\s]+|\/Users\/[^\/\s]+/g}
];
const issues = [];
for (const rel of files) {
  const data = fs.readFileSync(path.join(root, rel), 'utf8');
  for (const rule of patterns) {
    if (rule.re.test(data)) issues.push(rel + ': ' + rule.name);
    rule.re.lastIndex = 0;
  }
  const emails = data.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [];
  for (const e of emails) {
    if (!/@(?:example\.(?:com|org|net)|users\.noreply\.github\.com)$/i.test(e)) issues.push(rel + ': non-demo email address');
  }
}
const bin = fs.readFileSync(path.join(root, 'tests/multi-provider-fixture.zip'));
if (bin.length !== 1135 || bin[0] !== 0x50 || bin[1] !== 0x4b) issues.push('Unexpected ZIP fixture content/size');
if (issues.length) {
  console.error('Privacy check failed:\n' + issues.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Privacy check OK: ' + files.length + ' text files, synthetic ZIP metadata; Git commit metadata still requires review.');
}
