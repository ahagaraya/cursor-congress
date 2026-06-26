/**
 * Lint Russian ANSWER files for stray English jargon (answer-style.md).
 *
 * Usage:
 *   node congress/scripts/lint-answer.mjs <file.md> [--json] [--strict]
 *   import { lintAnswerText } from './lint-answer.mjs'
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

/** Lowercase tokens always allowed (brands, tech, paths). */
export const ALLOWLIST = new Set([
  'congress', 'cursor', 'node', 'npm', 'json', 'jsonl', 'yaml', 'md',
  'answer', 'skill', 'task', 'tasks', 'router', 'validate', 'swarm',
  'github', 'http', 'https', 'localhost', 'ui', 'api', 'mjs', 'javascript',
  'markdown', 'readme', 'git', 'gitignore', 'pre', 'commit', 'hook', 'hooks',
  'test', 'tests', 'ci', 'cd', 'run', 'init', 'process', 'tick', 'ticks',
  'slug', 'slugs', 'schema', 'schemas', 'brief', 'intake', 'chair',
  'blocking', 'optional', 'research', 'findings', 'proposal',
  'langgraph', 'crewai', 'autogen', 'meta', 'gpt', 'llm', 'llms', 'ai',
  'file', 'bus', 'state', 'manifest', 'manifests', 'plain', 'full', 'gate',
  'wildberries', 'ozon', 'spotify', 'langchain', 'vellum',
]);

/** Jargon flagged per answer-style.md (prefer Russian). */
export const BANNED_JARGON = new Set([
  'gate', 'track', 'approve', 'revise', 'ship', 'retainer', 'runway',
  'compliance', 'lead', 'pitch', 'onboarding', 'stakeholder', 'stakeholders',
  'productized', 'deliverable', 'deliverables', 'roadmap',
  'workflow', 'workflows', 'deploy', 'deployment',
]);

const MIN_SWARM_TURNS_FULL = 3;

export { MIN_SWARM_TURNS_FULL };

const CODE_FENCE = /^```/;
const HEADING = /^#{1,6}\s/;
const TABLE_ROW = /^\|/;
const LIST_MARKER = /^[\s]*[-*] /;
const URL = /https?:\/\//;

function stripInlineCode(line) {
  return line.replace(/`[^`]+`/g, ' ');
}

function isSkippableLine(line, trimmed) {
  if (!trimmed) return true;
  if (CODE_FENCE.test(trimmed)) return true;
  if (HEADING.test(trimmed) && /^[A-Za-z0-9_./-]+$/.test(trimmed.replace(/^#+\s*/, ''))) return true;
  return false;
}

export const COMPOUND_ALLOW = new Set([
  'file-bus', 'peer-routed', 'stop-quorum', 'stop_quorum',
  'advance-tick', 'validate-session', 'new-session', 'answer-style',
  'router.mjs', 'run.mjs', 'router-state.json', 'messages.jsonl',
  'context-manifests', 'meta-context-2026',
]);

function isAllowedWord(word) {
  const w = word.toLowerCase();
  if (COMPOUND_ALLOW.has(w)) return true;
  if (ALLOWLIST.has(w)) return true;
  if (w.length <= 3) return true;
  if (/^\d/.test(w)) return true;
  if (/^[A-Z]{2,}$/.test(word)) return true;
  if (w.includes('/') || w.includes('.') || w.includes('_')) return true;
  return false;
}

/**
 * @param {string} text
 * @param {{ strict?: boolean, reportAll?: boolean }} opts
 * @returns {{ ok: boolean, findings: Array<{line:number,word:string,context:string,severity:string}>, hasErrors: boolean }}
 */
export function lintAnswerText(text, opts = {}) {
  const findings = [];
  const lines = text.split('\n');
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (isSkippableLine(line, trimmed)) continue;
    if (URL.test(line)) continue;

    const prose = stripInlineCode(line);
    const matches = prose.match(/\b[A-Za-z][A-Za-z0-9_.-]*\b/g) || [];

    for (const word of matches) {
      if (isAllowedWord(word)) continue;
      const lower = word.toLowerCase();
      const isBanned = BANNED_JARGON.has(lower);
      if (!isBanned && !opts.reportAll) continue;
      const severity = isBanned || opts.strict ? 'error' : 'warning';
      findings.push({
        line: i + 1,
        word,
        context: trimmed.slice(0, 120),
        severity,
      });
    }
  }

  const hasErrors = findings.some((f) => f.severity === 'error');
  const ok = findings.length === 0;
  return { ok, findings, hasErrors };
}

export function lintAnswerFile(filePath, opts = {}) {
  const path = resolve(filePath);
  if (!existsSync(path)) {
    return { ok: false, findings: [{ line: 0, word: '', context: `File not found: ${path}`, severity: 'error' }], hasErrors: true };
  }
  const text = readFileSync(path, 'utf8');
  return lintAnswerText(text, opts);
}

function main() {
  const argv = process.argv.slice(2);
  const file = argv.find((a) => !a.startsWith('--'));
  const json = argv.includes('--json');
  const strict = argv.includes('--strict');

  if (!file) {
    console.error('Usage: node congress/scripts/lint-answer.mjs <file.md> [--json] [--strict]');
    process.exit(1);
  }

  const result = lintAnswerFile(file, { strict });
  if (json) {
    console.log(JSON.stringify({ file: resolve(file), ...result }, null, 2));
  } else {
    console.log(`\nLint: ${resolve(file)}`);
    if (!result.findings.length) {
      console.log('✅ No stray English detected');
    } else {
      for (const f of result.findings) {
        const icon = f.severity === 'error' ? '❌' : '⚠️';
        console.log(`${icon} L${f.line}: "${f.word}" — ${f.context}`);
      }
    }
  }

  if (result.hasErrors || (strict && result.findings.length)) process.exit(1);
  process.exit(result.findings.length ? 2 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
