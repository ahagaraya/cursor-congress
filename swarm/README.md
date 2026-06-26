# Congress Swarm Router

Message bus for peer-routed deliberation after fixed Round 1.

See `.cursor/skills/congress/SKILL.md` for the full pipeline.

## Commands

```bash
node congress/swarm/router.mjs init congress/sessions/{task-slug}
node congress/swarm/router.mjs active congress/sessions/{task-slug}
node congress/swarm/router.mjs process congress/sessions/{task-slug} lawyer deliberation/swarm/turns/lawyer-t2.json
node congress/swarm/router.mjs advance-tick congress/sessions/{task-slug}
node congress/swarm/router.mjs research-pending congress/sessions/{task-slug} --blocking-only
node congress/swarm/router.mjs research-done congress/sessions/{task-slug} req-004
node congress/swarm/router.mjs should-stop congress/sessions/{task-slug}
node congress/swarm/router.mjs status congress/sessions/{task-slug}
node congress/swarm/router.mjs activate-optional congress/sessions/{task-slug} economist
```

**Idempotency:** повторный `process` одного turn-файла отклоняется (см. `processed_turns[]` в router-state). Override: `--force`.

`init` подключает опциональных комиссаров из `optional_roles` / авто-детекта BRIEF. Поздний вызов — `activate-optional`.

## Orchestrator

```bash
cd congress
npm test
node scripts/run.mjs sessions/{task-slug} status
node scripts/run.mjs sessions/{task-slug} validate --skip-intake
```

## Validate & lint

```bash
node congress/scripts/validate-session.mjs congress/sessions/{task-slug} --gate full
node congress/scripts/lint-answer.mjs congress/sessions/{task-slug}/ANSWER.md
node congress/scripts/lint-prose.mjs congress/sessions/{task-slug}/ANSWER.md
node congress/scripts/run.mjs congress/sessions/{task-slug} optional-roles
```

На `gate=full`: менее трёх swarm-ходов — ошибка; жаргон — error; тяжёлые списки в ANSWER — error (`lint-prose`).

## Security

`congress/docs/security-sessions.md` — не коммитить и не синхронизировать `sessions/` в облако.

Invoke: `/congress {topic}`
