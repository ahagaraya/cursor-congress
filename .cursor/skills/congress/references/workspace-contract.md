# Congress workspace contract

```text
congress/sessions/{task-slug}/
├── BRIEF.md
├── assumptions.yaml
├── intake/
│   ├── questions.yaml
│   └── answers.yaml
├── opinions/               # Round 1: 8 core + optional (economist, marketer, product-manager)
├── research/
│   ├── requests/
│   └── findings/
├── glossary/
│   └── glossary.md
├── ANSWER.md
├── ANSWER_PLAIN.md
├── deliberation/
│   ├── events.jsonl
│   ├── state.json          # phase: swarm, mode: swarm
│   ├── dialogue.md
│   ├── proposal.json
│   ├── conflicts.json
│   ├── consensus.json
│   └── swarm/
│       ├── router-state.json
│       ├── messages.jsonl
│       ├── graph.json
│       └── turns/
└── synthesis/draft.md
```

## Order of operations

1. **Intake** — questions → answers (blocking)
2. Round 1 — 8 parallel opinions (core)
3. **Optional R1** — economist / marketer / product-manager if `optional-roles` says so
4. **Research** — blocking requests from opinions (+ editor later)
5. Merge — conflicts, consensus
6. **`router.mjs init`** → swarm (includes optional roles if invoked)
7. proposal.json
8. **Editor** — `ANSWER.md` (article prose, `commissioners/editor.md`)
9. **Assistant** — glossary + ANSWER_PLAIN

## Completion gate

- `intake/answers.yaml` (or documented `--skip-intake`)
- Eight core `opinions/*.json` (+ optional if invoked)
- Blocking research done
- `deliberation/swarm/router-state.json` → `status: completed` or `stopped`
- `proposal.json` + `ANSWER.md` (editor phase; `lint-prose` + `lint-answer`)
- `ANSWER_PLAIN.md` + `glossary/` (unless `--no-assistant`)
- `node congress/scripts/validate-session.mjs <session> --gate full` exits 0

## Artifacts (swarm)

| Path | Purpose |
| --- | --- |
| `deliberation/swarm/turns/{role}-t{tick}.json` | Commissioner turn per tick |
| `deliberation/swarm/messages.jsonl` | Message transcript |
| `deliberation/swarm/router-state.json` | Inbox, counters, route log |
| `deliberation/swarm/graph.json` | Routing graph for UI |
