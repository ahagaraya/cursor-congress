# Orchestration pipeline

Congress uses a **peer-routed swarm** after independent Round 1.

See **`swarm-protocol.md`** for the full flow:

1. Intake → Brief
2. Round 1 — 8 parallel opinions
3. Research (on commissioner requests)
4. `router.mjs init` → swarm loop (peer `route.next[]`)
5. proposal → ANSWER → Assistant

Router CLI: `congress/swarm/router.mjs`  
Orchestrator: `congress/scripts/run.mjs`  
Validate: `congress/scripts/validate-session.mjs`
