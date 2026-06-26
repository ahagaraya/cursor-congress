# Congress intake — questions before analysis

Collect **all** missing facts **up front**, before Round 1. Do not run the full commission on critical unknowns and ask the user only at the end.

## Phase 0 — Triage (before intake)

**Mandatory:** user must choose `full` or `lite` commission mode. See **`triage-protocol.md`**.

1. Run `node congress/scripts/run.mjs <session> triage`.
2. `AskUserQuestion` — режим комиссии (полная / краткая).
3. `node congress/scripts/triage.mjs <session> --set full|lite`.

Do not draft intake or start Round 1 until `commission_mode` is set.

## Phase 1b — Intake (mandatory unless `--skip-intake`)

1. Read the user's message and draft `BRIEF.md` (skeleton).
2. List gaps in `assumptions.yaml` → `unknowns`.
3. Write **`intake/questions.yaml`** — every question needed for a useful analysis:

```yaml
blocking: true
asked_at: null
answered_at: null
questions:
  - id: city
    text: "В каком городе планируете запуск?"
    why: "Аренда и зарплаты отличаются в 2–5 раз"
    required: true
  - id: full_time
    text: "Готовы работать в бизнесе full-time?"
    why: "Влияет на срок выхода на выручку"
    required: true
```

4. **Ask the user once** — single `AskUserQuestion` with **all** questions (or one chat message listing every question clearly). Do not split across turns unless the tool limit forces grouping (max questions per form).
5. Write **`intake/answers.yaml`** from user replies.
6. Merge answers into `assumptions.yaml` as `facts`; remove resolved items from `unknowns`.
7. Log `events.jsonl`: `type: intake`, `text`: "Задано N вопросов, получены ответы".
8. **Hard stop:** if `blocking: true` and required questions unanswered — do not start Round 1.

## Who drafts questions

Orchestrator (chair) drafts the list. Optionally one quick Task (`pragmatist` or `lawyer`) to suggest missing questions — but **one user-facing form only**.

## Question quality

- Plain Russian, no jargon without explanation in the question itself.
- Each question: `why` one line — user sees why it matters.
- Mark `required: false` only for nice-to-have.
- Do not ask what the user already stated.

## Flags

| Flag | Effect |
| --- | --- |
| (default) | Intake runs if any `unknowns` remain |
| `--skip-intake` | Skip only when `assumptions.yaml` has no blocking unknowns |
| `--intake-only` | Stop after answers; wait for user to say "continue congress" |

## Resume

If session has `intake/questions.yaml` but no `answers.yaml` → ask questions immediately, do not re-run commission.
