#!/usr/bin/env node
/**
 * Remove old Congress session directories (optional TTL hygiene).
 *
 * Usage:
 *   node congress/scripts/clean-sessions.mjs [--days 30] [--dry-run]
 *
 * Never deletes sessions referenced by CONGRESS_KEEP_SLUGS env (comma-separated).
 */
import { readdirSync, statSync, rmSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SESSIONS = join(__dirname, '..', 'sessions');

function parseArgs(argv) {
  let days = 30;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--days' && argv[i + 1]) days = parseInt(argv[++i], 10);
    else if (argv[i] === '--dry-run') dryRun = true;
  }
  return { days, dryRun };
}

function main() {
  const { days, dryRun } = parseArgs(process.argv.slice(2));
  if (!existsSync(SESSIONS)) {
    console.log(JSON.stringify({ ok: true, removed: [], dryRun }));
    return;
  }

  const keep = new Set(
    (process.env.CONGRESS_KEEP_SLUGS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const removed = [];
  const skipped = [];

  for (const slug of readdirSync(SESSIONS)) {
    if (slug.startsWith('.')) continue;
    const path = join(SESSIONS, slug);
    let st;
    try {
      st = statSync(path);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    if (keep.has(slug)) {
      skipped.push({ slug, reason: 'keep list' });
      continue;
    }
    if (st.mtimeMs > cutoff) {
      skipped.push({ slug, reason: 'too recent' });
      continue;
    }
    if (!dryRun) rmSync(path, { recursive: true, force: true });
    removed.push(slug);
  }

  console.log(
    JSON.stringify(
      { ok: true, dryRun, days, removed, skipped_count: skipped.length },
      null,
      2
    )
  );
}

main();
