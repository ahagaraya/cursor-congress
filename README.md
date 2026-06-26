# Congress

Мультиагентная «комиссия» для [Cursor](https://cursor.com): intake → Round 1 (8 ролей) → рой → редактор пишет **ANSWER.md** → ассистент → `validate`.

Skill: `.cursor/skills/congress/` в этом репозитории.

## Быстрый старт (~15 минут)

### 1. Требования

- [Cursor](https://cursor.com) с **Agent** (нужны subagent / Task)
- **Node.js** 18+

### 2. Установка

```bash
git clone <url-репозитория>
cd .   # или ваш путь к congress/
npm install
```

Опционально — индикатор «Congress работает» в Cursor:

```bash
npm run install-cursor-indicator
```

### 3. Посмотреть demo

```bash
npm run validate:demo
```

Откройте [`examples/demo-session/ANSWER.md`](examples/demo-session/ANSWER.md) — готовый отчёт комиссии.

Live UI (опционально):

```bash
npm run ui
# http://127.0.0.1:3747
```

### 4. Запустить свою сессию

В чате Cursor Agent (репозиторий открыт как workspace):

> Установи congress и запусти конгресс на: «ваш вопрос»

Или вручную:

```bash
node scripts/new-session.mjs 2026-my-topic --question "Ваш вопрос"
node scripts/run.mjs sessions/2026-my-topic triage
# AskUserQuestion: full или lite → triage.mjs --set full|lite
# intake → opinions → swarm → editor → assistant
node scripts/run.mjs sessions/2026-my-topic validate --skip-intake
```

Подробности: `.cursor/skills/congress/SKILL.md`.

## Структура

| Путь | Назначение |
| --- | --- |
| `scripts/run.mjs` | Оркестратор фаз |
| `swarm/router.mjs` | Роевой диалог |
| `scripts/validate-session.mjs` | Финальные ворота |
| `examples/demo-session/` | Публичный пример (в git) |
| `sessions/` | Ваши сессии (**в gitignore**) |

## Команды

```bash
npm test              # unit-тесты
npm run validate:demo # проверка demo-session
npm run new-session   # новая сессия
npm run ui            # живой UI
```

## Документация

- [`docs/cursor-indicator.md`](docs/cursor-indicator.md) — индикатор в Cursor
- [`docs/security-sessions.md`](docs/security-sessions.md) — не синхронизировать `sessions/` в облако
- [`examples/README.md`](examples/README.md) — примеры
- [`swarm/README.md`](swarm/README.md) — router CLI

## Лицензия

[MIT](LICENSE) — ядро Congress. Отчёты `ANSWER.md` в сессиях — аналитический материал ИИ, не профессиональная консультация (см. disclaimer в шаблоне).
