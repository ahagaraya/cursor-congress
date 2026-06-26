# Swarm Task prompt template

Use for every commissioner Task in Round 1 and swarm ticks.

**Context manifests:** `.cursor/skills/congress/references/context-manifests/phases.json`  
**Runner:** `node congress/scripts/run.mjs <session> manifest <phase>` — печатает reads/writes для фазы.

---

## Round 1

```text
You are {ROLE}. Read ONLY these files (context manifest — phase r1):
- congress/sessions/{slug}/BRIEF.md
- congress/sessions/{slug}/assumptions.yaml
- .cursor/skills/congress/references/commissioners/{role}.md
- .cursor/skills/congress/references/output-schema.json

Do NOT read other opinions/*.json — Round 1 is independent.

Write ONLY: congress/sessions/{slug}/opinions/{role}.json
Valid JSON per output-schema.json. May include research_requests[].

Do not chat. Do not summarize in chat.
```

After all 8 files exist:
```bash
node congress/scripts/run.mjs congress/sessions/{slug} check --phase r1
node congress/scripts/run.mjs congress/sessions/{slug} optional-roles
# if optional roles listed → Task each → opinions/{role}.json
node congress/scripts/run.mjs congress/sessions/{slug} advance
```

---

## Optional Round 1

```text
You are {ROLE} (economist | marketer | product-manager). Optional commissioner — invoked only when needed.

Read ONLY:
- congress/sessions/{slug}/BRIEF.md
- congress/sessions/{slug}/assumptions.yaml
- .cursor/skills/congress/references/commissioners/{role}.md
- .cursor/skills/congress/references/output-schema.json

Write ONLY: congress/sessions/{slug}/opinions/{role}.json
Independent — do not read other opinions in Round 1.
```

---

## Editor (phase editor)

```text
You are the editor. Read commissioners/editor.md and answer-style.md.

Read: proposal.json, opinions/, swarm messages.jsonl, research/findings/, BRIEF.md

Write ONLY: congress/sessions/{slug}/ANSWER.md — full article in Russian prose, not bullet lists.
Do not change proposal verdict. May add research/requests/*.json if facts missing (chair runs Researcher).

Do not write ANSWER_PLAIN.md.
```

---

## Swarm tick {tick}

```text
You are {ROLE}. Read ONLY these files (context manifest — phase swarm):
- congress/sessions/{slug}/BRIEF.md
- congress/sessions/{slug}/deliberation/conflicts.json
- congress/sessions/{slug}/opinions/*.json
- congress/sessions/{slug}/research/findings/*.json
- congress/sessions/{slug}/deliberation/swarm/router-state.json  → inbox.{role}
- congress/sessions/{slug}/deliberation/swarm/messages.jsonl (last 20 lines)
- .cursor/skills/congress/references/commissioners/{role}.md
- .cursor/skills/congress/references/commissioner-swarm-addendum.md
- .cursor/skills/congress/references/swarm-message-schema.json

Write ONLY: congress/sessions/{slug}/deliberation/swarm/turns/{role}-t{tick}.json

Include route.next[] (≥1 peer unless propose_stop).
May include research_requests[] — you do not browse the web.
propose_stop + stop_confidence (≥0.75) when ready to end swarm.

Do not chat.
```

Chair loop:
```bash
node congress/scripts/run.mjs congress/sessions/{slug} swarm-step
# → Task each active role
node congress/scripts/run.mjs congress/sessions/{slug} swarm-process
# repeat until should-stop
node congress/scripts/run.mjs congress/sessions/{slug} advance --phase swarm
```

---

## Researcher (phase research)

```text
Read: research/requests/{id}.json, BRIEF.md
Write: research/findings/{id}.json
Then chair runs: node congress/swarm/router.mjs research-done <session> <id>
```

---

## Assistant (phase assistant)

```text
Read: ANSWER.md, commissioners/assistant.md, answer-style.md
Write: ANSWER_PLAIN.md, glossary/glossary.md
Do not shorten — rephrase for plain Russian.
```

---

## Full session workflow

```bash
node congress/scripts/new-session.mjs <slug> --question "..."
node congress/scripts/run.mjs congress/sessions/<slug> status
node congress/scripts/run.mjs congress/sessions/<slug> next    # repeat: do work → advance
node congress/scripts/run.mjs congress/sessions/<slug> validate
```
