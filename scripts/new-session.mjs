#!/usr/bin/env node
/**
 * Create a new Congress session from template.
 * Usage: node congress/scripts/new-session.mjs <slug> [--question "текст вопроса"]
 */
import { cpSync, mkdirSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TEMPLATE = join(ROOT, 'templates', 'session');
const SESSIONS = join(ROOT, 'sessions');

const [slug, ...rest] = process.argv.slice(2);
if (!slug || slug.startsWith('--')) {
  console.error('Usage: node congress/scripts/new-session.mjs <slug> [--question "..."]');
  process.exit(1);
}

if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
  console.error('Slug: только a-z, 0-9, дефис; начинается с буквы/цифры');
  process.exit(1);
}

let question = '';
const qIdx = rest.indexOf('--question');
if (qIdx >= 0 && rest[qIdx + 1]) question = rest[qIdx + 1];

const dest = join(SESSIONS, slug);
if (existsSync(dest)) {
  console.error('Session exists:', dest);
  process.exit(1);
}

cpSync(TEMPLATE, dest, { recursive: true });
mkdirSync(join(dest, 'opinions'), { recursive: true });
mkdirSync(join(dest, 'research', 'requests'), { recursive: true });
mkdirSync(join(dest, 'research', 'findings'), { recursive: true });
mkdirSync(join(dest, 'deliberation', 'swarm', 'turns'), { recursive: true });
writeFileSync(join(dest, 'deliberation', 'events.jsonl'), '');
writeFileSync(
  join(dest, 'deliberation', 'state.json'),
  JSON.stringify(
    {
      phase: 'setup',
      wave: null,
      status: 'idle',
      mode: 'swarm',
      completed_phases: [],
      updated: new Date().toISOString(),
    },
    null,
    2
  ) + '\n'
);

if (question) {
  const brief = `# Brief

## Question

${question}

## Context

_(заполнит оркестратор после intake)_

## Success criteria

1. Развёрнутое исследовательское заключение на русском
2. Рекомендация с обоснованием
3. Риски и план действий

## Out of scope

_(уточнить в intake)_
`;
  writeFileSync(join(dest, 'BRIEF.md'), brief);
}

console.log(JSON.stringify({ ok: true, slug, path: dest }));
