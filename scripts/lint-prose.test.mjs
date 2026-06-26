import { test, describe } from 'node:test';
import assert from 'node:assert';
import { lintProse } from './lint-prose.mjs';

describe('lint-prose', () => {
  test('passes article-like text', () => {
    const text = `## Введение\n\n${'Это связный абзац аналитической статьи. '.repeat(80)}\n\n## Вывод\n\n${'Итоговый абзац без списков. '.repeat(40)}`;
    const r = lintProse(text, { checkLength: false });
    assert.equal(r.ok, true);
  });

  test('passes text with summary table and option leads', () => {
    const text = `## Анализ вариантов

Введение одним абзацем о том, что сравниваем три подхода.

**Вариант 1: SQLite.** ${'Связный абзац о первом варианте. '.repeat(15)}

**Вариант 2: PostgreSQL.** ${'Связный абзац о втором варианте. '.repeat(15)}

| Вариант | Сложность | Когда |
| --- | --- | --- |
| SQLite | низкая | MVP |
| PostgreSQL | выше | рост |

Итоговый абзац после таблицы.

## Заключение

${'Финальный вывод связным текстом. '.repeat(30)}`;
    const r = lintProse(text, { checkLength: false });
    assert.equal(r.ok, true);
  });

  test('flags long bullet list', () => {
    const lines = ['## Риски', ''];
    for (let i = 0; i < 12; i++) lines.push(`- пункт ${i}`);
    const r = lintProse(lines.join('\n'), { strict: true, checkLength: false });
    assert.ok(r.findings.some((f) => f.code === 'prose.long_list'));
  });
});
