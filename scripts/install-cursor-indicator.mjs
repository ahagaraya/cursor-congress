#!/usr/bin/env node
/**
 * Install Congress indicator for Cursor:
 * - status line command in ~/.cursor/cli-config.json
 * - project hook sessionStart (injects context when Congress is active)
 *
 * Usage: node congress/scripts/install-cursor-indicator.mjs
 */
import { readFileSync, writeFileSync, existsSync, chmodSync, mkdirSync, copyFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONGRESS_ROOT = resolve(__dirname, '..');
const REPO_ROOT = resolve(CONGRESS_ROOT, '..');
const STATUSLINE = join(CONGRESS_ROOT, 'scripts', 'cursor-statusline.mjs');
const HOOK_SCRIPT = join(REPO_ROOT, '.cursor', 'hooks', 'congress-session-start.mjs');
const HOOKS_JSON = join(REPO_ROOT, '.cursor', 'hooks.json');
const CLI_CONFIG = join(homedir(), '.cursor', 'cli-config.json');

function readJson(path, fallback = {}) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function installStatusLine() {
  mkdirSync(dirname(CLI_CONFIG), { recursive: true });
  const config = readJson(CLI_CONFIG, {});
  const command = `node "${STATUSLINE}"`;
  const prev = config.statusLine?.command;
  config.statusLine = {
    type: 'command',
    command,
    padding: 0,
  };
  writeFileSync(CLI_CONFIG, `${JSON.stringify(config, null, 2)}\n`);
  chmodSync(STATUSLINE, 0o755);
  return { cli_config: CLI_CONFIG, command, replaced: prev && prev !== command ? prev : null };
}

function installProjectHook() {
  mkdirSync(dirname(HOOK_SCRIPT), { recursive: true });
  const hookSrc = join(__dirname, 'hooks', 'congress-session-start.mjs');
  copyFileSync(hookSrc, HOOK_SCRIPT);
  chmodSync(HOOK_SCRIPT, 0o755);

  const hooks = readJson(HOOKS_JSON, { version: 1, hooks: {} });
  hooks.version = 1;
  hooks.hooks = hooks.hooks || {};
  const entry = { command: '.cursor/hooks/congress-session-start.mjs' };
  const list = hooks.hooks.sessionStart || [];
  const exists = list.some((h) => h.command === entry.command);
  if (!exists) {
    hooks.hooks.sessionStart = [...list, entry];
  }
  mkdirSync(dirname(HOOKS_JSON), { recursive: true });
  writeFileSync(HOOKS_JSON, `${JSON.stringify(hooks, null, 2)}\n`);
  return { hooks_json: HOOKS_JSON, hook: HOOK_SCRIPT };
}

function main() {
  const statusLine = installStatusLine();
  const hook = installProjectHook();
  console.log(
    JSON.stringify(
      {
        ok: true,
        status_line: statusLine,
        hook,
        docs: 'congress/docs/cursor-indicator.md',
        hint: 'Перезапустите Cursor Agent или откройте новый чат. Status line — внизу агента.',
      },
      null,
      2
    )
  );
}

main();
