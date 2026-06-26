# Congress Swarm — hybrid protocol

Round 1 is **fixed** (8 parallel independent opinions). Everything after is **peer-routed** via a message bus. The orchestrator is a **dispatcher** with guardrails, not a wave script.

## Roles

| Role | Swarm behavior |
| --- | --- |
| 8 core commissioners | Read inbox → write turn → `route.next[]` + optional `research_requests[]` |
| 3 optional (economist, marketer, product-manager) | Same, if invoked before `init` or via `activate-optional` |
| researcher | Invoked by orchestrator when any agent requests; never in `route.next[]` |
| chair | Seeds swarm, runs router, writes `proposal.json` |
| editor | After proposal — writes `ANSWER.md` as article (`commissioners/editor.md`) |
| assistant | Last — plain language (`ANSWER_PLAIN.md`) |

## Message bus

State lives in `deliberation/swarm/router-state.json`:

- `inbox.{role}[]` — pending messages for that commissioner
- `counters` — per-role and global message counts
- `route_log[]` — edges for UI graph
- `research_queue[]` — pending research ids
- `stop_votes[]` — agents proposing end of swarm

Append-only transcript: `deliberation/swarm/messages.jsonl`

Per-turn artifacts: `deliberation/swarm/turns/{role}-t{tick}.json`

## Commissioner turn flow

1. Chair runs `router.mjs active` → list of roles with non-empty inbox under limits
2. Orchestrator launches up to `max_parallel` Tasks (default 4)
3. Each agent reads inbox + recent `messages.jsonl` + `research/findings/`
4. Agent writes turn JSON with:
   - `content` — main statement
   - `replies[]` — structured responses to peers
   - `route.next[]` — **who should speak next** (`to`, `reason`, `priority`)
   - `research_requests[]` — **web research** (any agent, any tick)
   - `propose_stop` + `stop_confidence` — optional end signal
5. Chair runs `router.mjs process <session> <role> <turn-file>`
6. Router: deliver routes, queue research, log events, bump tick

## Routing rules

### Allowed targets in `route.next[]`

`critic`, `architect`, `pragmatist`, `tech-lead`, `developer`, `lawyer`, `security`, `cybersec`

**Not** `researcher` — use `research_requests[]` instead.

### Hard constraints

| Rule | Enforcement |
| --- | --- |
| Cybersec after developer | `cybersec` excluded from `active` until `developer` has ≥1 processed swarm turn |
| Per-role cap | Default 4 messages per commissioner |
| Global cap | Default 60 total swarm messages |
| Tick cap | Default 24 ticks |
| Research cap | Default 20 requests per session |
| Anti-loop | Same `(from,to,reason)` within 2 ticks → dropped |

### Priority

`route.next[].priority`: `high` | `normal` | `low`. High inbox items processed first when picking `active` batch.

## Research (any agent)

Any commissioner may add in Round 1 opinion **or** any swarm turn:

```json
"research_requests": [
  {
    "query": "конкретный вопрос",
    "priority": "blocking",
    "reason": "зачем нужно"
  }
]
```

On `process`:

1. Router dedupes by normalized query against `research/requests/` and `research/findings/`
2. Creates `research/requests/{id}.json` with `requested_by: {role}`
3. Adds to `research_queue`

**Before next swarm tick**, orchestrator must complete all `blocking` pending research:

- Task Researcher with WebSearch/WebFetch
- Write `research/findings/{id}.json`
- `router.mjs research-done <session> <id>`
- Broadcast finding to commissioners who requested it (inbox injection)

`optional` research: run when no blocking pending and between ticks if budget remains.

## Stop conditions

Swarm ends when **any** of:

1. **Quorum stop:** ≥3 distinct commissioners with `propose_stop: true` and `stop_confidence ≥ 0.75`
2. **Tick limit** reached
3. **Total message limit** reached
4. **Idle:** all inboxes empty, no pending blocking research, and no routes in last tick
5. Chair **force-stop** after `should-stop` recommends (log reason)

After stop → Chair writes `proposal.json` → `ANSWER.md` → Assistant.

## Dispatcher loop (pseudocode)

```
init(session)
while not should_stop(session):
  pending = research_pending_blocking(session)
  if pending: run_researcher(pending); continue

  roles = active(session)  # max 4
  if roles.empty() and not idle: force_stop("deadlock"); break

  parallel_for role in roles:
    turn = run_commissioner_task(role)
    process(session, role, turn)

  log phase swarm tick-N completed
```

## Live logging

```bash
node congress/ui/log-event.mjs <session> route lawyer architect "сроки регистрации ИП"
node congress/ui/log-event.mjs <session> message lawyer 2 swarm-tick-3 "текст" reply_to=architect
node congress/ui/log-event.mjs <session> research "req-004: УСН лимиты 2026 (lawyer)"
```

Router `process` also appends `route` events when logging is enabled.

## Entry points

`/congress` and `/congress-swarm` use this protocol (same pipeline).
