import { execFileSync } from 'node:child_process';
import { constants } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const safeExamples = new Set(['.env.example', '.env.sample']);
const providerNames = [
  ['OPENAI', 'API', 'KEY'].join('_'),
  ['GROQ', 'API', 'KEY'].join('_'),
  ['ANTHROPIC', 'API', 'KEY'].join('_'),
];
const assignment = new RegExp(
  `(?:${providerNames.join('|')})["']?\\s*(?:=|:)\\s*["']?(?!\\$\\{|<|your-|test-|example|placeholder)[A-Za-z0-9_./+=-]{16,}`,
  'i',
);
const rules = [
  ['github-token', new RegExp(`\\b(?:${['gh', '[pousr]', '_'].join('')}[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\\b`)],
  ['provider-token', new RegExp(`\\b(?:${['sk', '-'].join('')}[A-Za-z0-9_-]{20,}|${['gsk', '_'].join('')}[A-Za-z0-9]{20,})\\b`)],
  ['private-key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['secret-assignment', assignment],
  ['public-provider-secret-name', /EXPO_PUBLIC_(?:OPENAI|GROQ|ANTHROPIC)_API_KEY/],
];

function secretFilename(name) {
  if (!name || safeExamples.has(name)) return false;
  return name === '.env' || name.startsWith('.env.');
}

async function fileEntry(path) {
  const absolute = resolve(root, path);
  let handle;
  try {
    handle = await open(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch (error) {
    if (['ELOOP', 'ENOENT'].includes(error?.code)) return null;
    throw error;
  }
  try {
    if (!(await handle.stat()).isFile()) return null;
    return { path: path.replaceAll('\\', '/'), content: (await handle.readFile()).toString('latin1') };
  } finally {
    await handle.close();
  }
}

async function collect(path) {
  const absolute = resolve(root, path);
  let metadata;
  try { metadata = await lstat(absolute); } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  if (metadata.isSymbolicLink()) return [];
  if (metadata.isFile()) return [await fileEntry(relative(root, absolute))].filter(Boolean);
  if (!metadata.isDirectory()) return [];
  const nested = await Promise.all((await readdir(absolute)).sort().map((child) => collect(relative(root, resolve(absolute, child)))));
  return nested.flat();
}

const args = process.argv.slice(2);
const entries = [];
if (args.includes('--tracked')) {
  for (const path of execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean).sort()) {
    const entry = await fileEntry(path);
    if (entry) entries.push(entry);
  }
}
const pathsIndex = args.indexOf('--paths');
if (pathsIndex >= 0) {
  for (const path of args.slice(pathsIndex + 1)) entries.push(...await collect(path));
}
if (!args.includes('--tracked') && pathsIndex < 0) throw new Error('Usage: scan-secrets.mjs --tracked [--paths path ...]');

const findings = [];
for (const entry of new Map(entries.map((item) => [item.path, item])).values()) {
  const name = entry.path.split('/').at(-1);
  if (secretFilename(name)) findings.push({ path: entry.path, rule: 'secret-file' });
  for (const [rule, pattern] of rules) {
    pattern.lastIndex = 0;
    if (pattern.test(entry.content)) findings.push({ path: entry.path, rule });
  }
}

if (findings.length) {
  console.error(`Secret scan failed. Candidate values are redacted.\n${findings.sort((a, b) => a.path.localeCompare(b.path)).map(({ path, rule }) => `- ${path} [${rule}]`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Secret scan passed for ${entries.length} files.`);
}
