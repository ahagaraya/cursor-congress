import { test, describe } from 'node:test';
import assert from 'node:assert';
import { lintAnswerText } from './lint-answer.mjs';

describe('lint-answer', () => {
  test('allows Russian prose without flags', () => {
    const r = lintAnswerText('Комиссия рекомендует проверку полноты перед публикацией.');
    assert.equal(r.findings.length, 0);
  });

  test('flags banned jargon', () => {
    const r = lintAnswerText('Нужен stakeholder mapping до pitch инвесторам.');
    assert.ok(r.findings.some((f) => f.word.toLowerCase() === 'stakeholder'));
    assert.ok(r.hasErrors);
  });

  test('allows path-like tokens in backticks', () => {
    const r = lintAnswerText('См. `congress/scripts/validate-session.mjs` для проверки.');
    assert.equal(r.findings.length, 0);
  });

  test('skips code fences', () => {
    const r = lintAnswerText('Текст\n```\nconst stakeholder = true;\n```\nЕщё текст.');
    assert.equal(r.findings.length, 0);
  });
});
