# Congress — examples

Готовые сессии для изучения и CI. В отличие от `sessions/`, каталог **коммитится в git**.

## demo-session

**Вопрос:** SQLite vs PostgreSQL для MVP соло-разработчика (с персональными данными).

- Режим: **full** (8 комиссаров, рой ≥9 ходов)
- Статус: `validate --gate full` ✅
- См. [`demo-session/DEMO.md`](demo-session/DEMO.md) и [`demo-session/ANSWER.md`](demo-session/ANSWER.md)

```bash
cd congress
npm run validate:demo
```

## Как добавить свой demo

1. Завершите сессию в `sessions/<slug>/` через `run validate`.
2. Экспорт: `node scripts/export-demo.mjs sessions/<slug> --name my-demo`
3. Убедитесь, что нет ПДн, секретов и абсолютных путей.
4. `npm run validate:demo` (или путь к новому примеру).
