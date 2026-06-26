#!/usr/bin/env node
/**
 * Assemble a standalone cursor-congress repo (no NEEDS paths, no sessions).
 *
 * Usage: node congress/scripts/prepare-github-repo.mjs [output-dir]
 * Default output: ../cursor-congress (sibling of congress/ in NEEDS)
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync, statSync } from 'fs';
import { join, resolve, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONGRESS = resolve(__dirname, '..');
const NEEDS_ROOT = resolve(CONGRESS, '..');
const SKILL_SRC = join(NEEDS_ROOT, '.cursor', 'skills', 'congress');
const WORKFLOW_SRC = join(NEEDS_ROOT, '.github', 'workflows', 'congress-test.yml');

const SKIP_DIRS = new Set(['node_modules', 'sessions', '.git']);
const SKIP_FILES = new Set(['.active-session.json', 'ACTIVE.congress.md', 'package-lock.json']);

function copyTree(src, dest, rel = '') {
  if (!existsSync(src)) return;
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    if (SKIP_DIRS.has(name) || SKIP_FILES.has(name)) continue;
    const s = join(src, name);
    const d = join(dest, name);
    const st = statSync(s);
    if (st.isDirectory()) copyTree(s, d, join(rel, name));
    else cpSync(s, d);
  }
}

function patchWorkflow(text) {
  return text
    .replace(/congress\/\*\*/g, '**')
    .replace(/'congress\/\*\*'/g, "'**'")
    .replace(/\.cursor\/skills\/congress\/\*\*/g, '.cursor/skills/congress/**')
    .replace(/working-directory: congress\n/g, '');
}

function patchReadme(text) {
  return text
    .replace(/NEEDS\/congress/g, '.')
    .replace(/cd NEEDS\/congress/g, 'cd cursor-congress')
    .replace(/Skill и персоны: `\.cursor\/skills\/congress\/` \(в корне репозитория NEEDS\)\./, 'Skill: `.cursor/skills/congress/` в этом репозитории.')
    .replace(/git clone <url-репозитория>\ncd NEEDS\/congress   # или ваш путь к congress\//, 'git clone https://github.com/<you>/cursor-congress.git\ncd cursor-congress');
}

function main() {
  const out = resolve(process.argv[2] || join(NEEDS_ROOT, 'cursor-congress'));
  if (existsSync(out)) rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  copyTree(CONGRESS, out);

  const skillDest = join(out, '.cursor', 'skills', 'congress');
  if (existsSync(SKILL_SRC)) {
    mkdirSync(dirname(skillDest), { recursive: true });
    cpSync(SKILL_SRC, skillDest, { recursive: true });
  }

  const wfDest = join(out, '.github', 'workflows', 'congress-test.yml');
  if (existsSync(WORKFLOW_SRC)) {
    mkdirSync(dirname(wfDest), { recursive: true });
    writeFileSync(wfDest, patchWorkflow(readFileSync(WORKFLOW_SRC, 'utf8')));
  }

  writeFileSync(
    join(out, '.gitignore'),
    `# dependencies
node_modules/

# local sessions (never publish)
sessions/*
!sessions/.gitkeep

# runtime markers
.active-session.json
ACTIVE.congress.md

# OS
.DS_Store
`
  );

  writeFileSync(join(out, 'README.md'), patchReadme(readFileSync(join(out, 'README.md'), 'utf8')));

  console.log(JSON.stringify({ ok: true, path: out, relative: relative(NEEDS_ROOT, out) }, null, 2));
}

main();
