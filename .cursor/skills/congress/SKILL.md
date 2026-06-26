---
name: congress
description: Multi-agent deliberation commission (8 core + 3 optional + editor + researcher + assistant). Round 1, optional experts, swarm, editor writes article ANSWER. Use for /congress, /council.
argument-hint: [task-slug-or-topic] [--skip-intake] [--no-assistant] [--intake-only]
allowed-tools: [Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, Task, WebSearch, WebFetch]
---

# Congress — deliberation commission (swarm)

**Model:** **Triage (full/lite)** → Intake → Brief → **Round 1** → …

**Перед любым запуском:** спросить пользователя режим (`triage-protocol.md`) → intake-вопросы → только потом комиссия.

**Voting — ядро (8):** critic, architect, pragmatist, tech-lead, developer, lawyer, security, cybersec.

**Voting — опционально (по необходимости):** economist, marketer, product-manager. Вызов: `run optional-roles`, `optional_roles` в assumptions.yaml, `invoke_optional_roles` в opinions, авто-детект из BRIEF.

**Support:** researcher (web), **editor** (пишет ANSWER.md — связная статья), assistant (ANSWER_PLAIN, **last**).

## References

| Doc | Path |
| --- | --- |
| Swarm protocol | `references/swarm-protocol.md` |
| Swarm message schema | `references/swarm-message-schema.json` |
| Router state | `references/router-state-schema.json` |
| Swarm addendum (all commissioners) | `references/commissioner-swarm-addendum.md` |
| Intake | `references/intake-protocol.md` |
| **Triage** | `references/triage-protocol.md` |
| Workspace | `references/workspace-contract.md` |
| **Answer style** | `references/answer-style.md` |
| **Context manifests** | `references/context-manifests/phases.json` |
| **Task prompts** | `references/swarm-task-prompt.md` |
| Synthesis | `references/synthesis-template.md` |
| Research | `research-request-schema.json`, `research-finding-schema.json` |
| Output / proposal | `output-schema.json`, `proposal-schema.json` |
| Personas | `references/commissioners/*.md` |
| Validate | `congress/scripts/validate-session.mjs` |
| **Lint ANSWER** | `congress/scripts/lint-answer.mjs` |
| **Lint prose** | `congress/scripts/lint-prose.mjs` |
| **Roles registry** | `congress/scripts/lib/roles.mjs` |
| **Security** | `congress/docs/security-sessions.md` |
| **Run (orchestrator)** | `congress/scripts/run.mjs` |

## Run — единая точка входа chair

**Обязательно** завершать сессию через validate. Рекомендуемый поток:

```bash
cd congress
npm test                              # router + run helpers
node scripts/new-session.mjs <slug> --question "..."
node scripts/run.mjs sessions/<slug> status
node scripts/run.mjs sessions/<slug> next      # manifest + что делать
# … chair выполняет Task …
node scripts/run.mjs sessions/<slug> advance    # после каждой фазы
node scripts/run.mjs sessions/<slug> swarm-init
node scripts/run.mjs sessions/<slug> swarm-step
node scripts/run.mjs sessions/<slug> swarm-process   # после turn-файлов
node scripts/run.mjs sessions/<slug> validate   # --gate full, exit 0
```

| Команда | Назначение |
| --- | --- |
| `status` | `completed_phases[]`, следующая фаза |
| `next` | manifest reads/writes для текущей фазы |
| `advance` | проверить фазу → записать в state.json |
| `swarm-step` | active roles + пути turn-файлов |
| `swarm-process` | process + advance-tick + should-stop |
| `triage` | режим full/lite + текст для AskUserQuestion |
| `optional-roles` | кого вызвать из economist / marketer / product-manager |
| `validate` | финальный gate full |

Resume: `node congress/scripts/run.mjs <session> status` — продолжить с `next`.

Флаги run: `--skip-intake`, `--no-assistant`, `--warn`, `--json`, `--phase <name>`.

## Sprint 3 — надёжность и качество текста

- **Идемпотентность router:** повторный `process` того же turn-файла отклоняется (`processed_turns[]`); override: `--force`.
- **Lint jargon:** `node congress/scripts/lint-answer.mjs <ANSWER.md>`; встроен в `validate --gate full|answer` (жаргон из answer-style → error).
- **Swarm на gate=full:** &lt;3 ходов в `turns/` → **error**, не warning.
- **Безопасность сессий:** `congress/docs/security-sessions.md` — не синхронизировать `sessions/` в облако.
- **Pre-commit:** `node congress/scripts/install-hooks.mjs`
- **Очистка:** `npm run clean-sessions -- --dry-run --days 30`

## Sprint 4 — CI и проверка схем

- **CI:** GitHub Actions `.github/workflows/congress-test.yml` — `npm test` в `congress/` на push/PR.
- **JSON schema:** `node congress/scripts/validate-schema.mjs <session>` — ajv для `opinions/*.json` и `deliberation/swarm/turns/*.json`.
- **Интеграция:** `validate-session` на gate `r1` и `swarm` отклоняет невалидный JSON (`r1.schema_invalid`, `swarm.schema_invalid`).
- **Версия:** `congress_version` в `deliberation/state.json` при `run status` / `syncStateFromDisk`.
- **`run validate --warn`:** предупреждения validate не блокируют exit code (как `validate-session --warn`).
- **Облако:** `run status` предупреждает, если путь сессии в iCloud/Dropbox/OneDrive — см. `security-sessions.md`.
- **Router audit:** `process --force` пишет событие `system` в `deliberation/events.jsonl`.

## Sprint 5 — редактор и опциональные комиссары

- **Редактор (editor):** отдельная фаза после proposal; пишет `ANSWER.md` — связная статья **плюс сводные таблицы и списки где уместно** (`commissioners/editor.md`), не меняет вердикт proposal.
- **Lint prose:** `node congress/scripts/lint-prose.mjs ANSWER.md`; встроен в `validate --gate full` (списки, доля буллетов).
- **Опциональные роли:** economist, marketer, product-manager — только при `optional-roles` / `optional_roles:` / авто-детекте; фаза `optional_r1`.
- **Swarm:** router `init` подключает опциональных в `active_roles`; поздний вызов: `router.mjs activate-optional <session> <role>`.
- **Исправлен** порядок аргументов `swarm-process` в `run.mjs` (process session role file).

## Sprint 6 — triage (full / lite)

- **Обязательный выбор режима** перед intake: `run triage` → `AskUserQuestion` → `triage.mjs --set full|lite`.
- **full:** 8 комиссаров, рой ≥3 хода.
- **lite:** critic, architect, pragmatist, tech-lead; рой ≥1 ход.
- Документ: `references/triage-protocol.md`.

## Live UI

```bash
node congress/ui/server.mjs   # http://localhost:3747
```

При активной сессии — золотой баннер **«Congress работает»** сверху.

## Индикатор в Cursor

Одноразово: `node congress/scripts/install-cursor-indicator.mjs` — status line внизу агента (`⚖️ Congress · сессия · фаза`) + hook при старте чата.

Автоматически: `congress/.active-session.json`, `congress/ACTIVE.congress.md` (можно закрепить вкладку). Док: `congress/docs/cursor-indicator.md`.

## Demo и quickstart

Публичный пример: `congress/examples/demo-session/` — `npm run validate:demo` в каталоге `congress/`. См. `congress/README.md`.

Log: `phase`, `message`, `route`, `research`, `intake`, `chair`, `system` via `congress/ui/log-event.mjs`.

## Flags

| Flag | Effect |
| --- | --- |
| (default) | Full pipeline after triage |
| `--skip-intake` | Only if no blocking unknowns; **does not skip triage** |
| `--no-assistant` | Skip ANSWER_PLAIN + glossary |
| `--intake-only` | Stop after intake; wait for user to continue |

## Phases (strict order)

### Phase 1 — Setup

Scaffold `congress/sessions/{task-slug}/` from `congress/templates/session/`. Ensure:

```text
deliberation/swarm/
├── router-state.json
├── messages.jsonl
├── turns/
└── graph.json
```

Plus: `intake/`, `opinions/`, `research/`, `glossary/`, `deliberation/events.jsonl`.

### Phase 0 — Triage (**mandatory**)

1. `node congress/scripts/run.mjs congress/sessions/{slug} triage`
2. **AskUserQuestion:** полная (8) или краткая (4) комиссия — см. `triage-protocol.md`
3. `node congress/scripts/triage.mjs congress/sessions/{slug} --set full|lite`
4. Затем intake (уточняющие вопросы)

### Phase 1b — Intake (**before analysis**)

Follow `intake-protocol.md`. **Stop** if blocking questions unanswered (unless `--skip-intake` documented in `assumptions.yaml`).

### Phase 2 — Brief

`BRIEF.md` + `assumptions.yaml`.

### Phase 3 — Round 1 (parallel, 8 Tasks)

Each writes `opinions/{role}.json` per `output-schema.json`. May include `research_requests[]` and `invoke_optional_roles[]`.

### Phase 3a — Optional Round 1 (0–3 Tasks, if needed)

```bash
node congress/scripts/run.mjs congress/sessions/{task-slug} optional-roles
```

Task only for roles listed (economist, marketer, product-manager). Skip if empty.

### Phase 3.5 — Initial research

Collect all `research_requests` from opinions. Dedupe. For each:

1. `research/requests/{id}.json`
2. Researcher Task (WebSearch/WebFetch)
3. `research/findings/{id}.json`
4. `node congress/swarm/router.mjs research-done <session> <id>`

**Blocking** must finish before `router.mjs init`.

### Phase 4 — Merge

`conflicts.json`, `consensus.json`, seed `deliberation/dialogue.md`.

### Phase 4b — Swarm init

```bash
node congress/swarm/router.mjs init congress/sessions/{task-slug}
```

Sets `deliberation/state.json`: `{"phase":"swarm","mode":"swarm",...}`.

### Phase 4c — Swarm loop

Repeat until `node congress/swarm/router.mjs should-stop <session>` → `stop: true`:

```bash
node congress/swarm/router.mjs research-pending <session> --blocking-only
# → Researcher if pending; research-done each id

node congress/swarm/router.mjs active <session>
# → up to 4 roles; Task each commissioner

node congress/swarm/router.mjs process <session> <role> deliberation/swarm/turns/{role}-t{tick}.json
node congress/swarm/router.mjs advance-tick <session>
```

**Router rules:** cybersec after developer; limits in `router-state.json`; `research_requests[]` in turns.

### Phase 4d — Chair

`deliberation/proposal.json` from `messages.jsonl`, conflicts, findings.

### Phase 5 — Editor → ANSWER.md

**Editor Task** (not chair): reads `commissioners/editor.md`, writes **`ANSWER.md`** per `answer-style.md` (prose + tables/lists/emphasis where appropriate). May request `research/requests/*.json` for missing facts.

```bash
node congress/scripts/lint-prose.mjs congress/sessions/{task-slug}/ANSWER.md
node congress/scripts/lint-answer.mjs congress/sessions/{task-slug}/ANSWER.md
```

### Phase 6 — Assistant (**last**)

Unless `--no-assistant`: `glossary/glossary.md` + `ANSWER_PLAIN.md` per `commissioners/assistant.md`.

**Final gate (обязательно):**

```bash
node congress/scripts/run.mjs congress/sessions/{task-slug} validate [--skip-intake] [--no-assistant]
```

Эквивалент: `validate-session.mjs --gate full`. Exit ≠ 0 → не публиковать сессию.

## Swarm turn JSON

Write `deliberation/swarm/turns/{role}-t{tick}.json` per `swarm-message-schema.json`:

- `content`, `route.next[]`, optional `research_requests[]`
- `propose_stop` + `stop_confidence` when ready to end swarm

## Commissioner Task prompt

```text
You are {role}. Read references/commissioners/{role}.md and references/commissioner-swarm-addendum.md.

Session: congress/sessions/{slug}/
Inbox: deliberation/swarm/router-state.json → inbox.{role}
Read: BRIEF, opinions/, research/findings/, conflicts.json, messages.jsonl (last 20 lines)

Write deliberation/swarm/turns/{role}-t{tick}.json only.
Route peers via route.next[]. Request web via research_requests[] — you do not browse.
```

## Resuming

```bash
node congress/scripts/run.mjs congress/sessions/{slug} status
node congress/scripts/run.mjs congress/sessions/{slug} next
```

| State | Action |
| --- | --- |
| No commission_mode | `triage` → AskUserQuestion → `--set` |
| No intake answers | `next` → intake (or `--skip-intake`) |
| Opinions missing (core) | `next` → r1 manifest |
| Optional roles pending | `optional-roles` → optional_r1 |
| Blocking research pending | `next` → research |
| `phase: swarm`, not stopped | `swarm-step` → continue loop |
| No ANSWER.md | `next` → editor |
| ANSWER without ANSWER_PLAIN | `next` → assistant |
| All phases done | `validate` |
