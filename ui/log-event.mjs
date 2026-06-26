#!/usr/bin/env node
/**
 * Append an event to congress session log (for live UI).
 * Usage:
 *   node log-event.mjs <session-dir> phase <phase> <wave> started|completed
 *   node log-event.mjs <session-dir> message <role> <round> <wave> "<text>" [reply_to=comma,separated]
 */
import { appendFileSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';

const [sessionDir, kind, ...rest] = process.argv.slice(2);
if (!sessionDir || !kind) {
  console.error('Usage: log-event.mjs <session-dir> phase|message|chair|system|intake|research|route ...');
  process.exit(1);
}

const dir = resolve(sessionDir);
const logPath = join(dir, 'deliberation', 'events.jsonl');
mkdirSync(join(dir, 'deliberation'), { recursive: true });

const ts = new Date().toISOString();
let event;

if (kind === 'phase') {
  const [phase, wave, status] = rest;
  event = { ts, type: 'phase', phase, wave, status };
} else if (kind === 'message') {
  const [role, round, wave, text, replyRaw] = rest;
  const reply_to = replyRaw?.startsWith('reply_to=')
    ? replyRaw.slice(9).split(',').filter(Boolean)
    : [];
  event = { ts, type: 'message', role, round: Number(round), wave, text, reply_to };
} else if (kind === 'chair') {
  const [text] = rest;
  event = { ts, type: 'chair', role: 'chair', text };
} else if (kind === 'system') {
  const [text] = rest;
  event = { ts, type: 'system', text };
} else if (kind === 'intake') {
  const [text] = rest;
  event = { ts, type: 'intake', text };
} else if (kind === 'research') {
  const [text] = rest;
  event = { ts, type: 'research', role: 'researcher', text };
} else if (kind === 'route') {
  const [from, to, text] = rest;
  event = { ts, type: 'route', role: from, reply_to: [to], text };
} else {
  console.error('Unknown kind:', kind);
  process.exit(1);
}

appendFileSync(logPath, JSON.stringify(event) + '\n');
console.log(JSON.stringify(event));
