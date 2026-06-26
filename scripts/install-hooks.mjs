#!/usr/bin/env node
/**
 * Install Congress git hooks into repository .git/hooks/
 *
 * Usage: node congress/scripts/install-hooks.mjs
 */
import { copyFileSync, chmodSync, existsSync, mkdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK_SRC = join(__dirname, 'hooks', 'pre-commit');

function findGitRoot(start) {
  let dir = resolve(start);
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function main() {
  const root = findGitRoot(join(__dirname, '..', '..'));
  if (!root) {
    console.error('Not a git repository — cannot install hooks.');
    console.error('Copy manually: congress/scripts/hooks/pre-commit → .git/hooks/pre-commit');
    process.exit(1);
  }

  const hooksDir = join(root, '.git', 'hooks');
  mkdirSync(hooksDir, { recursive: true });
  const dest = join(hooksDir, 'pre-commit');

  copyFileSync(HOOK_SRC, dest);
  chmodSync(dest, 0o755);

  console.log(JSON.stringify({ ok: true, installed: dest, git_root: root }));
}

main();
