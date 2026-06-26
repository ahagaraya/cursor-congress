#!/usr/bin/env node
/**
 * Cursor sessionStart hook — remind agent that Congress is running.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ACTIVE = join(process.cwd(), 'congress', '.active-session.json');

function main() {
  try {
    readFileSync(0, 'utf8');
  } catch {}

  if (!existsSync(ACTIVE)) {
    console.log('{}');
    return;
  }

  let active;
  try {
    active = JSON.parse(readFileSync(ACTIVE, 'utf8'));
  } catch {
    console.log('{}');
    return;
  }

  if (!active?.active || active.phase === 'complete') {
    console.log('{}');
    return;
  }

  const msg = [
    '⚖️ CONGRESS АКТИВЕН (индикатор в status line и congress/ACTIVE.congress.md).',
    `Сессия: ${active.slug}`,
    `Фаза: ${active.phase}`,
    `Режим: ${active.mode || '—'}`,
    `Вопрос: ${active.title || '—'}`,
    'Продолжайте оркестрацию комиссии; не прерывайте без явного запроса пользователя.',
  ].join('\n');

  console.log(JSON.stringify({ additional_context: msg }));
}

main();
