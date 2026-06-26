#!/usr/bin/env node
/**
 * Cursor status line — shows Congress indicator when a session is active.
 *
 * Install: node congress/scripts/install-cursor-indicator.mjs
 */
import { loadActive, formatStatusLine } from './lib/active-indicator.mjs';

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8').trim();
}

async function main() {
  const input = await readStdin();
  let payload = {};
  if (input) {
    try {
      payload = JSON.parse(input);
    } catch {
      payload = {};
    }
  }
  const out = formatStatusLine(loadActive(), payload);
  if (out) process.stdout.write(out);
}

main();
