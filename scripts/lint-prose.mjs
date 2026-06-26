#!/usr/bin/env node
/**
 * Lint ANSWER prose structure — discourage bullet-heavy output.
 */
import { readFileSync } from 'fs';

const MAX_CONSECUTIVE_LIST_LINES = 7;
const MIN_WORDS_ARTICLE = 1200;

export function lintProse(text, opts = {}) {
  const lines = (text || '').split('\n');
  const findings = [];
  let consecutiveList = 0;
  let inFence = false;
  let listLineCount = 0;
  let proseLineCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      inFence = !inFence;
      consecutiveList = 0;
      continue;
    }
    if (inFence || !trimmed) {
      consecutiveList = 0;
      continue;
    }
    if (/^#{1,6}\s/.test(trimmed)) {
      consecutiveList = 0;
      continue;
    }
    const isList = /^[\s]*[-*] |^[\s]*\d+\.\s/.test(line);
    if (isList) {
      listLineCount++;
      consecutiveList++;
      if (consecutiveList > MAX_CONSECUTIVE_LIST_LINES) {
        findings.push({
          severity: opts.strict ? 'error' : 'warning',
          code: 'prose.long_list',
          line: i + 1,
          message: `Подряд ${consecutiveList} строк списка (ориентир ≤${MAX_CONSECUTIVE_LIST_LINES})`,
        });
        consecutiveList = 0;
      }
    } else if (trimmed.length > 40 && !trimmed.startsWith('|')) {
      proseLineCount++;
      consecutiveList = 0;
    }
  }

  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words < MIN_WORDS_ARTICLE && opts.checkLength !== false) {
    findings.push({
      severity: 'warning',
      code: 'prose.short',
      line: 1,
      message: `Короткий текст для статьи: ~${words} слов (ориентир ≥${MIN_WORDS_ARTICLE})`,
    });
  }

  const listRatio = listLineCount / Math.max(1, listLineCount + proseLineCount);
  if (listRatio > 0.45) {
    findings.push({
      severity: opts.strict ? 'error' : 'warning',
      code: 'prose.list_heavy',
      line: 1,
      message: `Слишком много списков: ${Math.round(listRatio * 100)}% строк — нужна связная проза`,
    });
  }

  return { ok: findings.filter((f) => f.severity === 'error').length === 0, findings, words };
}

export function lintAnswerProseFile(path, opts = {}) {
  const text = readFileSync(path, 'utf8');
  return lintProse(text, opts);
}

function main() {
  const path = process.argv[2];
  const strict = process.argv.includes('--strict');
  if (!path) {
    console.error('Usage: node congress/scripts/lint-prose.mjs <ANSWER.md> [--strict]');
    process.exit(1);
  }
  const r = lintAnswerProseFile(path, { strict });
  for (const f of r.findings) {
    console.log(`${f.severity === 'error' ? '❌' : '⚠️'} L${f.line}: [${f.code}] ${f.message}`);
  }
  if (r.ok) console.log(`✅ Prose OK (~${r.words} words)`);
  process.exit(r.ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  main();
}
