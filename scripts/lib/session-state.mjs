/**
 * Congress session phase detection and state.json checkpointing.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, renameSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { getCongressVersion } from './congress-version.mjs';
import {
  CORE_VOTING_ROLES,
  getInvokedOptionalRoles,
} from './roles.mjs';
import { getCommissionMode, getActiveCoreRoles } from './triage.mjs';
import { syncActiveFromSession } from './active-indicator.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONGRESS_ROOT = resolve(__dirname, '../..');
const VALIDATE = join(CONGRESS_ROOT, 'scripts', 'validate-session.mjs');

export const PHASE_ORDER = [
  'setup',
  'triage',
  'intake',
  'brief',
  'r1',
  'optional_r1',
  'research',
  'merge',
  'swarm_init',
  'swarm',
  'proposal',
  'editor',
  'assistant',
  'validate',
];

const ALL_ROLES = CORE_VOTING_ROLES;

function readText(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

function readJson(path, fallback = null) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

export function statePath(session) {
  return join(resolve(session), 'deliberation', 'state.json');
}

export function loadState(session) {
  const defaults = {
    phase: 'setup',
    wave: null,
    status: 'idle',
    mode: 'swarm',
    completed_phases: [],
    updated: null,
  };
  return { ...defaults, ...readJson(statePath(session), defaults) };
}

export function saveState(session, patch) {
  const path = statePath(session);
  mkdirSync(dirname(path), { recursive: true });
  const current = loadState(session);
  const next = {
    ...current,
    ...patch,
    updated: new Date().toISOString(),
  };
  const tmp = path + '.tmp';
  writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n');
  renameSync(tmp, path);
  try {
    syncActiveFromSession(session);
  } catch {}
  return next;
}

export function markPhase(session, phase) {
  const state = loadState(session);
  const completed = new Set(state.completed_phases || []);
  completed.add(phase);
  return saveState(session, {
    completed_phases: [...completed],
    phase: phase === 'validate' ? 'complete' : phase,
    status: phase === 'validate' ? 'completed' : state.status,
  });
}

function listOpinionRoles(session) {
  const dir = join(session, 'opinions');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => readJson(join(dir, f))?.role || f.replace('.json', ''));
}

function intakeSkipped(session, opts) {
  const assumptions = readText(join(session, 'assumptions.yaml'));
  return (
    opts.skipIntake ||
    /skip_intake:\s*true/i.test(assumptions) ||
    /skip_intake_reason:/i.test(assumptions)
  );
}

function blockingResearchPending(session) {
  const reqDir = join(session, 'research', 'requests');
  if (!existsSync(reqDir)) return false;
  for (const f of readdirSync(reqDir).filter((x) => x.endsWith('.json'))) {
    const req = readJson(join(reqDir, f));
    if (!req || req.priority !== 'blocking') continue;
    if (req.status === 'done') continue;
    const id = req.id || f.replace('.json', '');
    if (!existsSync(join(session, 'research', 'findings', `${id}.json`))) return true;
  }
  return false;
}

function collectResearchRequestsFromOpinions(session) {
  const dir = join(session, 'opinions');
  if (!existsSync(dir)) return [];
  const reqs = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const j = readJson(join(dir, f));
    for (const r of j?.research_requests || []) {
      if (r.priority === 'blocking') reqs.push(r);
    }
  }
  return reqs;
}

export function checkPhase(sessionArg, phase, opts = {}) {
  const session = resolve(sessionArg);
  const missing = [];

  switch (phase) {
    case 'setup': {
      for (const p of ['BRIEF.md', 'assumptions.yaml', 'deliberation/swarm/turns']) {
        if (!existsSync(join(session, p))) missing.push(p);
      }
      break;
    }
    case 'triage': {
      if (!getCommissionMode(session)) {
        missing.push('commission_mode не выбран — спросите пользователя (full|lite) и: triage.mjs --set');
      }
      break;
    }
    case 'intake': {
      if (!existsSync(join(session, 'intake', 'answers.yaml'))) {
        if (!intakeSkipped(session, opts)) missing.push('intake/answers.yaml (или skip_intake в assumptions)');
      }
      break;
    }
    case 'brief': {
      const brief = readText(join(session, 'BRIEF.md'));
      if (!brief.includes('## Question') || brief.includes('_(заполнит оркестратор')) {
        missing.push('BRIEF.md: заполните Question и Context');
      }
      break;
    }
    case 'r1': {
      const present = new Set(listOpinionRoles(session));
      const core = getActiveCoreRoles(session);
      const absent = core.filter((r) => !present.has(r));
      if (absent.length) missing.push(`opinions (ядро ${getCommissionMode(session) || 'full'}): ${absent.join(', ')}`);
      break;
    }
    case 'optional_r1': {
      const invoked = getInvokedOptionalRoles(session);
      if (!invoked.length) break;
      const present = new Set(listOpinionRoles(session));
      const absent = invoked.filter((r) => !present.has(r));
      if (absent.length) {
        missing.push(`opinions (опциональные): ${absent.join(', ')} — см. commissioners/{role}.md`);
      }
      break;
    }
    case 'research': {
      const blocking = collectResearchRequestsFromOpinions(session);
      if (blocking.length && blockingResearchPending(session)) {
        missing.push('blocking research не завершён');
      }
      break;
    }
    case 'merge': {
      const c = readJson(join(session, 'deliberation', 'conflicts.json'));
      if (!c?.conflicts?.length) missing.push('deliberation/conflicts.json');
      const s = readJson(join(session, 'deliberation', 'consensus.json'));
      if (!s?.consensus?.length) missing.push('deliberation/consensus.json');
      break;
    }
    case 'swarm_init': {
      const rs = readJson(join(session, 'deliberation', 'swarm', 'router-state.json'));
      if (!rs?.inbox) missing.push('router not initialized');
      break;
    }
    case 'swarm': {
      const rs = readJson(join(session, 'deliberation', 'swarm', 'router-state.json'));
      if (!['completed', 'stopped'].includes(rs?.status)) {
        missing.push(`swarm status: ${rs?.status ?? 'missing'}`);
      }
      break;
    }
    case 'proposal': {
      const p = readJson(join(session, 'deliberation', 'proposal.json'));
      if (!p?.evolved_solution && !p?.verdict) missing.push('deliberation/proposal.json');
      break;
    }
    case 'editor': {
      if (!existsSync(join(session, 'ANSWER.md'))) missing.push('ANSWER.md (фаза editor)');
      break;
    }
    case 'answer': {
      if (!existsSync(join(session, 'ANSWER.md'))) missing.push('ANSWER.md');
      break;
    }
    case 'assistant': {
      if (opts.noAssistant) break;
      if (!existsSync(join(session, 'ANSWER_PLAIN.md'))) missing.push('ANSWER_PLAIN.md');
      break;
    }
    case 'validate': {
      try {
        const args = [
          VALIDATE,
          session,
          '--gate',
          'full',
          '--json',
          ...(opts.skipIntake ? ['--skip-intake'] : []),
          ...(opts.noAssistant ? ['--no-assistant'] : []),
        ];
        const out = execFileSync('node', args, { encoding: 'utf8' });
        const result = JSON.parse(out);
        if (!result.ok) {
          for (const e of result.errors || []) missing.push(e.message);
        }
      } catch (e) {
        if (e.status) {
          try {
            const result = JSON.parse(e.stdout || '{}');
            for (const err of result.errors || []) missing.push(err.message);
          } catch {
            missing.push('validate failed');
          }
        } else {
          missing.push(String(e.message));
        }
      }
      break;
    }
    default:
      missing.push(`unknown phase: ${phase}`);
  }

  return { ok: missing.length === 0, phase, missing };
}

export function detectCompletedPhases(sessionArg, opts = {}) {
  const completed = [];
  for (const phase of PHASE_ORDER) {
    if (phase === 'assistant' && opts.noAssistant) {
      completed.push(phase);
      continue;
    }
    if (phase === 'optional_r1' && !getInvokedOptionalRoles(sessionArg).length) {
      completed.push(phase);
      continue;
    }
    if (phase === 'triage' && getCommissionMode(sessionArg)) {
      completed.push(phase);
      continue;
    }
    if (phase === 'intake' && intakeSkipped(sessionArg, opts)) {
      completed.push(phase);
      continue;
    }
    const { ok } = checkPhase(sessionArg, phase, opts);
    if (ok) completed.push(phase);
    else break;
  }
  return completed;
}

export function nextIncompletePhase(sessionArg, opts = {}) {
  for (const phase of PHASE_ORDER) {
    if (phase === 'assistant' && opts.noAssistant) continue;
    if (phase === 'optional_r1' && !getInvokedOptionalRoles(sessionArg).length) continue;
    const { ok } = checkPhase(sessionArg, phase, opts);
    if (!ok) return phase;
  }
  return null;
}

export function syncStateFromDisk(sessionArg, opts = {}) {
  const session = resolve(sessionArg);
  const completed = detectCompletedPhases(session, opts);
  const next = nextIncompletePhase(session, opts);
  return saveState(session, {
    completed_phases: completed,
    phase: next ?? 'complete',
    status: next ? 'in_progress' : 'completed',
    congress_version: getCongressVersion(),
  });
}
