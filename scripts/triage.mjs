#!/usr/bin/env node
/**
 * Congress triage — set or suggest full vs lite commission mode.
 *
 * Usage:
 *   node congress/scripts/triage.mjs <session-dir> [--json]
 *   node congress/scripts/triage.mjs <session-dir> --set full|lite
 *   node congress/scripts/triage.mjs <session-dir> --prompt
 */
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  getCommissionMode,
  suggestCommissionMode,
  setCommissionMode,
  formatTriagePrompt,
  COMMISSION_MODES,
} from './lib/triage.mjs';

function main() {
  const session = process.argv[2];
  if (!session) {
    console.error(
      `Usage: node congress/scripts/triage.mjs <session-dir> [--set full|lite] [--prompt] [--json]`
    );
    process.exit(1);
  }

  const setIdx = process.argv.indexOf('--set');
  if (setIdx >= 0 && process.argv[setIdx + 1]) {
    const mode = process.argv[setIdx + 1];
    if (!COMMISSION_MODES.includes(mode)) {
      console.error(`Mode must be: ${COMMISSION_MODES.join(', ')}`);
      process.exit(1);
    }
    const result = setCommissionMode(session, mode);
    if (process.argv.includes('--json')) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`✅ commission_mode: ${mode}`);
    }
    process.exit(0);
  }

  const data = {
    session: resolve(session),
    current: getCommissionMode(session),
    suggestion: suggestCommissionMode(session),
    prompt: formatTriagePrompt(session),
  };

  if (process.argv.includes('--prompt')) {
    console.log(JSON.stringify(data.prompt, null, 2));
    process.exit(0);
  }

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(data, null, 2));
    process.exit(0);
  }

  console.log(`\nCongress triage — ${data.session}`);
  console.log(`Текущий режим: ${data.current ?? '(не выбран — спросите пользователя)'}`);
  console.log(
    `Рекомендация: ${data.suggestion.suggested} (~${Math.round(data.suggestion.confidence * 100)}%)`
  );
  console.log('\nРежимы:');
  console.log('  full — 8 комиссаров, полный рой, длинная статья');
  console.log('  lite — 4 комиссара (critic, architect, pragmatist, tech-lead), короче');
  console.log('\nЗаписать: node congress/scripts/triage.mjs <session> --set full|lite');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
