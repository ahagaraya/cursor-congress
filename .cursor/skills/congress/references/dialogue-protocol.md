# Dialogue protocol (swarm)

Commissioners debate via **message bus** after independent Round 1 opinions.

Full spec: `swarm-protocol.md`

## Flow

1. Chair: `router.mjs init` — seed inbox for all 8 roles
2. Loop: `active` → commissioner Tasks → `process` turn JSON
3. Each turn: `content`, `replies[]`, `route.next[]`, optional `research_requests[]`
4. Stop: `should-stop` (quorum, limits, idle) → Chair writes `proposal.json`

## Artifacts

| Path | Purpose |
| --- | --- |
| `deliberation/swarm/router-state.json` | Inbox, counters, route_log |
| `deliberation/swarm/messages.jsonl` | Transcript |
| `deliberation/swarm/turns/{role}-t{tick}.json` | Per-turn output |
| `deliberation/swarm/graph.json` | UI routing graph |
| `deliberation/dialogue.md` | Human-readable summary (chair maintains) |

## Logging

```bash
node congress/ui/log-event.mjs <session> route lawyer architect "причина маршрута"
node congress/ui/log-event.mjs <session> message lawyer 2 swarm-tick-3 "текст" reply_to=architect
node congress/ui/log-event.mjs <session> phase swarm tick-3 completed
```

Update `deliberation/state.json`:

```json
{"phase":"swarm","wave":"tick-3","status":"running","mode":"swarm","updated":"ISO"}
```

## Mid-swarm research

If a turn includes `research_requests` with `blocking`, orchestrator runs Researcher **before next tick**, then `research-done`.

## Commissioner prompt

Always include `commissioner-swarm-addendum.md` + role persona + inbox slice + findings.
