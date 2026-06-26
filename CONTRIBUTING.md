# Contributing to Congress

## Разработка

```bash
cd congress
npm install
npm test
```

## Новая сессия / demo

1. Завершите сессию: `node scripts/run.mjs sessions/<slug> validate --gate full`
2. Экспорт в examples: `node scripts/export-demo.mjs sessions/<slug> --name <demo-name>`
3. Проверьте отсутствие секретов и `npm run validate:demo`

## Pull requests

- `npm test` и `npm run validate:demo` должны проходить
- Изменения skill — в `.cursor/skills/congress/`
- Не включайте `sessions/` в PR

## Стиль ANSWER

Редактор пишет статью с таблицами и списками где уместно — см. `references/commissioners/editor.md` и `references/answer-style.md` в skill.
