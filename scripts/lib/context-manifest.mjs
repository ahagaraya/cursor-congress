/**
 * Load Congress context manifests for chair Task prompts.
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = resolve(__dirname, '../../..');
const MANIFEST_PATH = join(
  WORKSPACE_ROOT,
  '.cursor/skills/congress/references/context-manifests/phases.json'
);

let _cache = null;

export function loadManifests() {
  if (_cache) return _cache;
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(`Manifest not found: ${MANIFEST_PATH}`);
  }
  _cache = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  return _cache;
}

export function getPhaseManifest(phase) {
  const m = loadManifests();
  const entry = m.phases?.[phase];
  if (!entry) throw new Error(`Unknown phase in manifest: ${phase}`);
  return { ...entry, id: phase };
}

export function expandPaths(paths, vars = {}) {
  return (paths || []).map((p) => {
    let out = p;
    for (const [k, v] of Object.entries(vars)) {
      out = out.replaceAll(`{${k}}`, v);
    }
    return out;
  });
}

export function formatManifestForChair(phase, vars = {}) {
  const entry = getPhaseManifest(phase);
  const lines = [
    `# ${entry.label} (${phase})`,
    '',
  ];

  const reads = expandPaths(entry.reads || entry.reads_per_role, vars);
  if (reads.length) {
    lines.push('## Читать', ...reads.map((r) => `- ${r}`), '');
  }

  const writes = expandPaths(entry.writes || entry.writes_per_role, vars);
  if (writes.length) {
    lines.push('## Писать', ...writes.map((w) => `- ${w}`), '');
  }

  if (entry.skill_refs?.length) {
    lines.push('## Навык', ...entry.skill_refs.map((r) => `- ${r}`), '');
  }

  if (entry.chair) lines.push('## Chair', entry.chair, '');
  if (entry.automated_command) {
    lines.push('## Автоматически', entry.automated_command.replace('<session>', vars.session || '<session>'), '');
  }
  if (entry.chair_loop) {
    lines.push('## Цикл', ...entry.chair_loop.map((s) => `- ${s}`), '');
  }
  if (entry.parallel_tasks) {
    lines.push(`## Параллельных Task: ${entry.parallel_tasks}`, '');
  }

  return lines.join('\n');
}

export function allPhasesOrdered() {
  const m = loadManifests();
  return Object.entries(m.phases)
    .filter(([, p]) => !p.deprecated)
    .map(([id, p]) => ({ id, order: p.order ?? 99, label: p.label }))
    .sort((a, b) => a.order - b.order);
}
