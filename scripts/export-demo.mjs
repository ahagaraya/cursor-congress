#!/usr/bin/env node
/**
 * Export a completed session to congress/examples/<name>/
 *
 * Usage:
 *   node congress/scripts/export-demo.mjs sessions/my-slug --name demo-session
 *   node congress/scripts/export-demo.mjs examples/demo-session --dry-run
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONGRESS_ROOT = resolve(__dirname, '..');
const EXAMPLES = join(CONGRESS_ROOT, 'examples');

function parseArgs(argv) {
  const positional = [];
  let name = 'demo-session';
  let dryRun = false;
  let skipValidate = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--name' && argv[i + 1]) name = argv[++i];
    else if (a === '--dry-run') dryRun = true;
    else if (a === '--skip-validate') skipValidate = true;
    else if (!a.startsWith('--')) positional.push(a);
  }
  return { source: positional[0], name, dryRun, skipValidate };
}

function main() {
  const { source, name, dryRun, skipValidate } = parseArgs(process.argv.slice(2));
  if (!source) {
    console.error(`Usage: node congress/scripts/export-demo.mjs <session-dir> [--name demo-session] [--dry-run]`);
    process.exit(1);
  }

  const src = resolve(source.startsWith('/') ? source : join(CONGRESS_ROOT, source));
  const dest = join(EXAMPLES, name);

  if (!existsSync(join(src, 'BRIEF.md'))) {
    console.error('Not a congress session:', src);
    process.exit(1);
  }

  if (dryRun) {
    console.log(JSON.stringify({ dry_run: true, from: src, to: dest }, null, 2));
    return;
  }

  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  mkdirSync(EXAMPLES, { recursive: true });
  cpSync(src, dest, { recursive: true });

  const demoMeta = join(dest, 'DEMO.md');
  if (!existsSync(demoMeta)) {
    const brief = readFileSync(join(dest, 'BRIEF.md'), 'utf8');
    const q = brief.match(/^## Question\s*\n+(.+)/m)?.[1]?.trim() || name;
    writeFileSync(
      demoMeta,
      `# Demo: ${name}\n\n**Question:** ${q}\n\nExported: ${new Date().toISOString().slice(0, 10)}\n\n\`npm run validate:demo\`\n`
    );
  }

  if (!skipValidate) {
    const validate = join(CONGRESS_ROOT, 'scripts', 'validate-session.mjs');
    execFileSync('node', [validate, dest, '--gate', 'full', '--skip-intake'], {
      cwd: CONGRESS_ROOT,
      stdio: 'inherit',
    });
  }

  console.log(JSON.stringify({ ok: true, exported: dest, name }, null, 2));
}

main();
