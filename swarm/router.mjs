#!/usr/bin/env node
/**
 * Congress Swarm — message bus router / dispatcher helpers.
 *
 * Commands:
 *   init <session-dir>
 *   active <session-dir>
 *   process <session-dir> <role> <turn-json-path>
 *   research-pending <session-dir> [--blocking-only]
 *   research-done <session-dir> <request-id>
 *   advance-tick <session-dir>   — after parallel batch (one tick per wave)
 *   status <session-dir>
 *   activate-optional <session-dir> [role ...]  — add optional commissioners to swarm
 */
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  appendFileSync,
  readdirSync,
  renameSync,
} from 'fs';
import { join, resolve, dirname, basename } from 'path';
import { createHash, randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import {
  CORE_VOTING_ROLES,
  ALL_VOTING_ROLES,
  mergeSwarmRoles,
  getInvokedOptionalRoles,
  getSwarmRolesFromState,
} from '../scripts/lib/roles.mjs';
import { getActiveCoreRoles } from '../scripts/lib/triage.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const DEFAULT_LIMITS = {
  max_ticks: 24,
  max_messages_per_role: 4,
  max_total_messages: 60,
  max_parallel: 4,
  max_research_requests: 20,
  cooldown_same_route: 2,
  stop_quorum: 3,
  stop_confidence_min: 0.75,
};

const PRIORITY_RANK = { high: 0, normal: 1, low: 2 };

function sessionPath(arg) {
  return resolve(arg);
}

function swarmDir(session) {
  return join(session, 'deliberation', 'swarm');
}

function routerPath(session) {
  return join(swarmDir(session), 'router-state.json');
}

function messagesPath(session) {
  return join(swarmDir(session), 'messages.jsonl');
}

function graphPath(session) {
  return join(swarmDir(session), 'graph.json');
}

function eventsPath(session) {
  return join(session, 'deliberation', 'events.jsonl');
}

function statePath(session) {
  return join(session, 'deliberation', 'state.json');
}

function ensureSwarmDirs(session) {
  const dir = swarmDir(session);
  mkdirSync(join(dir, 'turns'), { recursive: true });
  return dir;
}

function readJson(path, fallback = null) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(path, data) {
  const tmp = path + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  renameSync(tmp, path);
}

function writeRouter(session, state) {
  state.updated = new Date().toISOString();
  const path = routerPath(session);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = path + '.tmp';
  writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n');
  renameSync(tmp, path);
}

function readRouter(session) {
  return readJson(routerPath(session));
}

function roster(state) {
  return getSwarmRolesFromState(state);
}

function emptyInbox(roles) {
  const inbox = {};
  for (const r of roles) inbox[r] = [];
  return inbox;
}

function emptyCounters(roles) {
  const by_role = {};
  for (const r of roles) by_role[r] = 0;
  return { total_messages: 0, research_requests: 0, by_role };
}

function ensureRosterEntries(state, roles) {
  for (const r of roles) {
    if (!state.inbox[r]) state.inbox[r] = [];
    if (state.counters.by_role[r] === undefined) state.counters.by_role[r] = 0;
  }
  state.active_roles = [...new Set([...(state.active_roles || []), ...roles])];
}

function normalizeQuery(q) {
  return String(q || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function routeHash(from, to, reason) {
  return createHash('sha256')
    .update(`${from}|${to}|${normalizeQuery(reason)}`)
    .digest('hex')
    .slice(0, 16);
}

function logEvent(session, event) {
  const path = eventsPath(session);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n');
}

function updateSessionState(session, patch) {
  const current = readJson(statePath(session), {
    phase: 'swarm',
    wave: null,
    status: 'idle',
    mode: 'swarm',
    updated: null,
  });
  writeJson(statePath(session), { ...current, mode: 'swarm', ...patch, updated: new Date().toISOString() });
}

function readConflictsSummary(session) {
  const c = readJson(join(session, 'deliberation', 'conflicts.json'), { conflicts: [] });
  if (!c.conflicts?.length) return 'Конфликты Round 1 зафиксированы в deliberation/conflicts.json.';
  return c.conflicts
    .slice(0, 5)
    .map((x) => `- ${x.topic || x.id}: ${x.summary || x.description || ''}`)
    .join('\n');
}

function seedChairMessage(session) {
  const summary = readConflictsSummary(session);
  return {
    from: 'chair',
    message_id: `chair-seed-${randomUUID().slice(0, 8)}`,
    tick: 0,
    priority: 'high',
    summary: 'Роевой диалог: прочитайте Round 1, ответьте и направьте route.next[] нужным коллегам.',
    content: `Round 1 завершён. Ключевые расхождения:\n${summary}\n\nИспользуйте route.next[] и research_requests[] по необходимости.`,
  };
}

function cmdInit(sessionArg) {
  const session = sessionPath(sessionArg);
  ensureSwarmDirs(session);

  const optional = getInvokedOptionalRoles(session);
  const core = getActiveCoreRoles(session);
  const activeRoles = mergeSwarmRoles(core, optional);

  const inbox = emptyInbox(activeRoles);
  const seed = seedChairMessage(session);
  for (const role of activeRoles) {
    inbox[role].push({ ...seed, to: role });
  }

  const state = {
    mode: 'swarm',
    tick: 0,
    status: 'running',
    active_roles: activeRoles,
    optional_roles: optional,
    limits: { ...DEFAULT_LIMITS },
    counters: emptyCounters(activeRoles),
    inbox,
    flags: { developer_spoke_swarm: false, cybersec_spoke_swarm: false },
    route_log: [],
    research_queue: [],
    stop_votes: [],
    stop_reason: null,
    processed_turns: [],
    updated: new Date().toISOString(),
  };

  writeRouter(session, state);
  writeJson(graphPath(session), { nodes: activeRoles.map((id) => ({ id })), edges: [] });

  if (!existsSync(messagesPath(session))) {
    writeFileSync(messagesPath(session), '');
  }

  updateSessionState(session, { phase: 'swarm', wave: 'tick-0', status: 'running' });
  logEvent(session, { type: 'phase', phase: 'swarm', wave: 'tick-0', status: 'started' });
  logEvent(session, {
    type: 'chair',
    role: 'chair',
    text: 'Swarm инициализирован: всем комиссарам разослан стартовый inbox.',
  });

  console.log(
    JSON.stringify({ ok: true, tick: 0, seeded: activeRoles.length, optional_roles: optional })
  );
}

function cmdActivateOptional(sessionArg, rolesArg) {
  const session = sessionPath(sessionArg);
  const state = readRouter(session);
  if (!state) {
    console.error('Router not initialized');
    process.exit(1);
  }
  const valid = rolesArg.filter((r) => ALL_VOTING_ROLES.includes(r) && !CORE_VOTING_ROLES.includes(r));
  if (!valid.length) {
    console.error('Provide optional roles:', 'economist, marketer, product-manager');
    process.exit(1);
  }
  ensureRosterEntries(state, valid);
  const seed = seedChairMessage(session);
  for (const role of valid) {
    if (!state.inbox[role]?.length) {
      state.inbox[role].push({ ...seed, to: role });
    }
  }
  writeRouter(session, state);
  updateGraph(session, state);
  console.log(JSON.stringify({ ok: true, activated: valid, active_roles: roster(state) }));
}

function isCybersecBlocked(state, role) {
  if (role !== 'cybersec') return false;
  if (state.flags.developer_spoke_swarm) return false;
  const inbox = state.inbox.cybersec || [];
  return !inbox.some((m) => m.from === 'developer');
}

function roleUnderCap(state, role) {
  const max = state.limits.max_messages_per_role ?? DEFAULT_LIMITS.max_messages_per_role;
  return (state.counters.by_role[role] || 0) < max;
}

function getActiveRoles(state) {
  const candidates = [];
  for (const role of roster(state)) {
    const inbox = state.inbox[role] || [];
    if (!inbox.length) continue;
    if (!roleUnderCap(state, role)) continue;
    if (isCybersecBlocked(state, role)) continue;
    candidates.push(role);
  }
  return candidates;
}

function detectDeadlock(state) {
  return getActiveRoles(state).length === 0 && !allInboxesEmpty(state);
}

function cmdActive(sessionArg) {
  const session = sessionPath(sessionArg);
  const state = readRouter(session);
  if (!state) {
    console.error('Router not initialized. Run: init');
    process.exit(1);
  }

  if (state.status !== 'running') {
    console.log(JSON.stringify([]));
    return;
  }

  const candidates = [];
  for (const role of roster(state)) {
    const inbox = state.inbox[role] || [];
    if (!inbox.length) continue;
    if (!roleUnderCap(state, role)) continue;
    if (isCybersecBlocked(state, role)) continue;
    const topPriority = inbox.reduce(
      (best, m) => Math.min(best, PRIORITY_RANK[m.priority] ?? 1),
      99
    );
    candidates.push({ role, inbox_count: inbox.length, priority: topPriority });
  }

  candidates.sort((a, b) => a.priority - b.priority || b.inbox_count - a.inbox_count);

  const maxParallel = state.limits.max_parallel ?? DEFAULT_LIMITS.max_parallel;
  const active = candidates.slice(0, maxParallel).map((c) => c.role);

  console.log(JSON.stringify(active));
}

function existingResearchQueries(session) {
  const queries = new Set();
  const reqDir = join(session, 'research', 'requests');
  const findDir = join(session, 'research', 'findings');
  for (const dir of [reqDir, findDir]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
      const j = readJson(join(dir, f));
      if (j?.query) queries.add(normalizeQuery(j.query));
    }
  }
  return queries;
}

function nextResearchId(session) {
  const reqDir = join(session, 'research', 'requests');
  mkdirSync(reqDir, { recursive: true });
  let max = 0;
  if (existsSync(reqDir)) {
    for (const f of readdirSync(reqDir)) {
      const m = f.match(/^req-(\d+)/);
      if (m) max = Math.max(max, Number(m[1]));
    }
  }
  return `req-${String(max + 1).padStart(3, '0')}`;
}

function queueResearch(session, state, role, req) {
  const norm = normalizeQuery(req.query);
  const existing = existingResearchQueries(session);
  if (existing.has(norm)) {
    return { skipped: true, reason: 'duplicate_query', query: req.query };
  }

  const maxR = state.limits.max_research_requests ?? DEFAULT_LIMITS.max_research_requests;
  if (state.counters.research_requests >= maxR) {
    return { skipped: true, reason: 'research_cap', query: req.query };
  }

  const id = nextResearchId(session);
  const request = {
    id,
    requested_by: role,
    query: req.query,
    context: req.reason || '',
    priority: req.priority || 'optional',
    status: 'pending',
    created_at: new Date().toISOString(),
    source: 'swarm',
  };

  mkdirSync(join(session, 'research', 'requests'), { recursive: true });
  writeJson(join(session, 'research', 'requests', `${id}.json`), request);

  state.research_queue.push({ id, priority: request.priority, requested_by: role });
  state.counters.research_requests += 1;

  logEvent(session, {
    type: 'research',
    role: 'researcher',
    text: `${id}: ${req.query} (запросил ${role})`,
  });

  return { id, created: true };
}

function isRouteOnCooldown(state, from, to, reason) {
  const hash = routeHash(from, to, reason);
  const cooldown = state.limits.cooldown_same_route ?? DEFAULT_LIMITS.cooldown_same_route;
  const recent = (state.route_log || []).filter((e) => e.tick >= state.tick - cooldown);
  return recent.some((e) => e.hash === hash);
}

function deliverRoute(session, state, from, route, turn) {
  const to = route.to;
  if (!ALL_VOTING_ROLES.includes(to)) return { dropped: true, reason: 'invalid_role' };
  if (!roster(state).includes(to)) {
    ensureRosterEntries(state, [to]);
  }
  if (to === from) return { dropped: true, reason: 'self_route' };
  if (isRouteOnCooldown(state, from, to, route.reason)) {
    return { dropped: true, reason: 'cooldown' };
  }

  const item = {
    from,
    to,
    message_id: turn.message_id || `msg-${randomUUID().slice(0, 8)}`,
    tick: state.tick,
    priority: route.priority || 'normal',
    reason: route.reason,
    summary: route.reason,
    content: turn.content?.slice(0, 2000) || '',
    in_reply_to: turn.message_id || null,
  };

  state.inbox[to].push(item);

  const edge = {
    from,
    to,
    tick: state.tick,
    reason: route.reason,
    hash: routeHash(from, to, route.reason),
    priority: route.priority || 'normal',
  };
  state.route_log.push(edge);

  logEvent(session, {
    type: 'route',
    role: from,
    reply_to: [to],
    text: route.reason,
    tick: state.tick,
  });

  return { delivered: true, to };
}

function updateGraph(session, state) {
  const edges = (state.route_log || []).map((e) => ({
    from: e.from,
    to: e.to,
    tick: e.tick,
    label: e.reason?.slice(0, 40),
  }));
  writeJson(graphPath(session), { nodes: roster(state).map((id) => ({ id })), edges });
}

function appendMessage(session, turn, role) {
  const line = {
    ts: new Date().toISOString(),
    tick: turn.tick ?? stateTick(session),
    role,
    message_id: turn.message_id || `msg-${randomUUID().slice(0, 8)}`,
    content: turn.content,
    route_next: turn.route?.next || [],
    research_requests: turn.research_requests || [],
    propose_stop: !!turn.propose_stop,
    confidence: turn.confidence,
  };
  appendFileSync(messagesPath(session), JSON.stringify(line) + '\n');

  const replyTo = (turn.replies || []).map((r) => r.to);
  logEvent(session, {
    type: 'message',
    role,
    round: turn.tick,
    wave: `swarm-tick-${turn.tick}`,
    text: turn.content?.slice(0, 500) || '',
    reply_to: replyTo,
  });
}

function stateTick(session) {
  return readRouter(session)?.tick ?? 0;
}

function turnProcessKey(role, turnPath, turn, tick) {
  const file = basename(resolve(turnPath));
  const t = turn.tick ?? tick;
  return `${role}:t${t}:${file}`;
}

function isTurnAlreadyProcessed(state, key, messageId) {
  const list = state.processed_turns || [];
  if (list.some((e) => e.key === key)) return true;
  if (messageId && list.some((e) => e.message_id === messageId)) return true;
  return false;
}

function cmdProcess(sessionArg, role, turnPath, force = false) {
  const session = sessionPath(sessionArg);
  const state = readRouter(session);
  if (!state) {
    console.error('Router not initialized');
    process.exit(1);
  }

  const turn = readJson(resolve(turnPath));
  if (!turn) {
    console.error('Turn file not found:', turnPath);
    process.exit(1);
  }
  if (turn.role !== role) {
    console.error(`Role mismatch: expected ${role}, got ${turn.role}`);
    process.exit(1);
  }

  if (!turn.message_id) turn.message_id = `msg-${randomUUID().slice(0, 8)}`;

  const processKey = turnProcessKey(role, turnPath, turn, state.tick);
  if (isTurnAlreadyProcessed(state, processKey, turn.message_id) && !force) {
    console.error(`Turn already processed: ${processKey} (use --force to override)`);
    process.exit(1);
  }

  const inbox = state.inbox[role] || [];
  if (!inbox.length && !force) {
    console.error(`No inbox messages for ${role}`);
    process.exit(1);
  }
  if (!roleUnderCap(state, role) && !force) {
    console.error(`Role ${role} exceeded message cap`);
    process.exit(1);
  }
  if (isCybersecBlocked(state, role) && !force) {
    console.error(`Cybersec blocked until developer speaks`);
    process.exit(1);
  }

  const maxTotal = state.limits.max_total_messages ?? DEFAULT_LIMITS.max_total_messages;
  if (state.counters.total_messages >= maxTotal) {
    state.status = 'stopped';
    state.stop_reason = 'max_total_messages';
    writeRouter(session, state);
    console.log(JSON.stringify({ ok: false, reason: 'max_total_messages' }));
    return;
  }

  appendMessage(session, turn, role);

  state.counters.total_messages += 1;
  state.counters.by_role[role] = (state.counters.by_role[role] || 0) + 1;

  if (role === 'developer') state.flags.developer_spoke_swarm = true;
  if (role === 'cybersec') state.flags.cybersec_spoke_swarm = true;

  state.inbox[role] = [];

  const routed = [];
  const dropped = [];
  for (const route of turn.route?.next || []) {
    const result = deliverRoute(session, state, role, route, turn);
    if (result.delivered) routed.push(result.to);
    else dropped.push({ to: route.to, reason: result.reason });
  }

  const research = [];
  for (const req of turn.research_requests || []) {
    research.push(queueResearch(session, state, role, req));
  }

  if (turn.propose_stop && (turn.stop_confidence ?? 0) >= (state.limits.stop_confidence_min ?? 0.75)) {
    if (!state.stop_votes.some((v) => v.role === role)) {
      state.stop_votes.push({
        role,
        confidence: turn.stop_confidence,
        tick: state.tick,
      });
    }
  }

  state.batch_processed = (state.batch_processed || 0) + 1;

  state.processed_turns = state.processed_turns || [];
  state.processed_turns.push({
    key: processKey,
    role,
    tick: state.tick,
    turn_file: basename(resolve(turnPath)),
    message_id: turn.message_id,
    at: new Date().toISOString(),
  });

  updateGraph(session, state);

  writeRouter(session, state);

  if (force) {
    logEvent(session, {
      type: 'system',
      role,
      tick: state.tick,
      text: `process --force: ${role} ${processKey}`,
    });
  }

  console.log(
    JSON.stringify({
      ok: true,
      tick: state.tick,
      routed,
      dropped,
      research,
      stop_votes: state.stop_votes.length,
      batch_processed: state.batch_processed,
      forced: force || undefined,
    })
  );
}

function cmdAdvanceTick(sessionArg) {
  const session = sessionPath(sessionArg);
  const state = readRouter(session);
  if (!state) {
    console.error('Router not initialized');
    process.exit(1);
  }

  state.tick += 1;
  state.batch_processed = 0;
  updateSessionState(session, { phase: 'swarm', wave: `tick-${state.tick}`, status: 'running' });

  const maxTicks = state.limits.max_ticks ?? DEFAULT_LIMITS.max_ticks;
  if (state.tick >= maxTicks) {
    state.status = 'stopped';
    state.stop_reason = 'max_ticks';
  }

  if (detectDeadlock(state)) {
    state.status = 'stopped';
    state.stop_reason = 'deadlock';
    logEvent(session, { type: 'system', text: 'Swarm deadlock: active пуст, inbox не пуст' });
  }

  writeRouter(session, state);
  logEvent(session, { type: 'phase', phase: 'swarm', wave: `tick-${state.tick}`, status: 'completed' });
  console.log(JSON.stringify({ ok: true, tick: state.tick, status: state.status, stop_reason: state.stop_reason }));
}

function cmdResearchPending(sessionArg, blockingOnly) {
  const session = sessionPath(sessionArg);
  const reqDir = join(session, 'research', 'requests');
  if (!existsSync(reqDir)) {
    console.log(JSON.stringify([]));
    return;
  }

  const pending = [];
  for (const f of readdirSync(reqDir).filter((x) => x.endsWith('.json'))) {
    const j = readJson(join(reqDir, f));
    if (j?.status === 'pending' || j?.status === 'in_progress') {
      if (blockingOnly && j.priority !== 'blocking') continue;
      pending.push(j);
    }
  }

  pending.sort((a, b) => (a.priority === 'blocking' ? -1 : 1));
  console.log(JSON.stringify(pending));
}

function cmdResearchDone(sessionArg, requestId) {
  const session = sessionPath(sessionArg);
  const state = readRouter(session);
  const reqPath = join(session, 'research', 'requests', `${requestId}.json`);
  const req = readJson(reqPath);
  if (!req) {
    console.error('Request not found:', requestId);
    process.exit(1);
  }

  req.status = 'done';
  req.completed_at = new Date().toISOString();
  writeJson(reqPath, req);

  if (state) {
    state.research_queue = (state.research_queue || []).filter((q) => q.id !== requestId);

    const findingPath = join(session, 'research', 'findings', `${requestId}.json`);
    const finding = readJson(findingPath);
    const summary = finding?.summary?.slice(0, 300) || `Research ${requestId} готов`;

    const requester = req.requested_by;
    if (requester && ALL_VOTING_ROLES.includes(requester)) {
      state.inbox[requester].push({
        from: 'researcher',
        message_id: `research-${requestId}`,
        tick: state.tick,
        priority: 'high',
        reason: `Результат исследования: ${req.query}`,
        summary,
        content: summary,
        finding_id: requestId,
      });
    }

    writeRouter(session, state);
  }

  logEvent(session, {
    type: 'research',
    role: 'researcher',
    text: `${requestId} завершён → доставлено в inbox`,
  });

  console.log(JSON.stringify({ ok: true, id: requestId }));
}

function allInboxesEmpty(state) {
  return roster(state).every((r) => !(state.inbox[r]?.length));
}

function cmdShouldStop(sessionArg) {
  const session = sessionPath(sessionArg);
  const state = readRouter(session);
  if (!state) {
    console.log(JSON.stringify({ stop: true, reason: 'no_router' }));
    return;
  }

  if (state.status === 'stopped' || state.status === 'completed') {
    console.log(JSON.stringify({ stop: true, reason: state.stop_reason || state.status }));
    return;
  }

  const quorum = state.limits.stop_quorum ?? DEFAULT_LIMITS.stop_quorum;
  const minConf = state.limits.stop_confidence_min ?? DEFAULT_LIMITS.stop_confidence_min;
  const votes = (state.stop_votes || []).filter((v) => v.confidence >= minConf);
  const uniqueVoters = new Set(votes.map((v) => v.role));

  if (uniqueVoters.size >= quorum) {
    state.status = 'completed';
    state.stop_reason = 'stop_quorum';
    writeRouter(session, state);
    updateSessionState(session, { phase: 'swarm', status: 'completed' });
    console.log(JSON.stringify({ stop: true, reason: 'stop_quorum', votes: votes.length }));
    return;
  }

  if (state.stop_reason === 'max_ticks' || state.stop_reason === 'max_total_messages') {
    state.status = 'completed';
    writeRouter(session, state);
    console.log(JSON.stringify({ stop: true, reason: state.stop_reason }));
    return;
  }

  const maxTicks = state.limits.max_ticks ?? DEFAULT_LIMITS.max_ticks;
  if (state.tick >= maxTicks) {
    state.status = 'stopped';
    state.stop_reason = 'max_ticks';
    writeRouter(session, state);
    console.log(JSON.stringify({ stop: true, reason: 'max_ticks' }));
    return;
  }

  const pendingBlocking = JSON.parse(execResearchPendingSync(session, true));

  if (detectDeadlock(state)) {
    state.status = 'stopped';
    state.stop_reason = 'deadlock';
    writeRouter(session, state);
    updateSessionState(session, { phase: 'swarm', status: 'stopped' });
    console.log(JSON.stringify({ stop: true, reason: 'deadlock' }));
    return;
  }

  if (allInboxesEmpty(state) && !pendingBlocking.length && state.tick > 0) {
    state.status = 'completed';
    state.stop_reason = 'idle';
    writeRouter(session, state);
    updateSessionState(session, { phase: 'swarm', status: 'completed' });
    console.log(JSON.stringify({ stop: true, reason: 'idle' }));
    return;
  }

  console.log(JSON.stringify({ stop: false, tick: state.tick, stop_votes: uniqueVoters.size }));
}

function execResearchPendingSync(session, blockingOnly) {
  const reqDir = join(session, 'research', 'requests');
  if (!existsSync(reqDir)) return '[]';
  const pending = [];
  for (const f of readdirSync(reqDir).filter((x) => x.endsWith('.json'))) {
    const j = readJson(join(reqDir, f));
    if (j?.status === 'pending' || j?.status === 'in_progress') {
      if (blockingOnly && j.priority !== 'blocking') continue;
      pending.push(j);
    }
  }
  return JSON.stringify(pending);
}

function cmdStatus(sessionArg) {
  const session = sessionPath(sessionArg);
  const state = readRouter(session);
  if (!state) {
    console.log(JSON.stringify({ initialized: false }));
    return;
  }

  const inbox_sizes = {};
  for (const r of roster(state)) inbox_sizes[r] = (state.inbox[r] || []).length;

  console.log(
    JSON.stringify({
      initialized: true,
      tick: state.tick,
      status: state.status,
      stop_reason: state.stop_reason,
      counters: state.counters,
      inbox_sizes,
      stop_votes: state.stop_votes?.length || 0,
      flags: state.flags,
      limits: state.limits,
    })
  );
}

const [cmd, sessionArg, ...rest] = process.argv.slice(2);

if (!cmd || !sessionArg) {
  console.error(`Usage:
  node congress/swarm/router.mjs init <session-dir>
  node congress/swarm/router.mjs active <session-dir>
  node congress/swarm/router.mjs process <session-dir> <role> <turn.json>
  node congress/swarm/router.mjs research-pending <session-dir> [--blocking-only]
  node congress/swarm/router.mjs research-done <session-dir> <request-id>
  node congress/swarm/router.mjs advance-tick <session-dir>
  node congress/swarm/router.mjs should-stop <session-dir>
  node congress/swarm/router.mjs status <session-dir>
  node congress/swarm/router.mjs activate-optional <session-dir> economist marketer ...`);
  process.exit(1);
}

switch (cmd) {
  case 'init':
    cmdInit(sessionArg);
    break;
  case 'active':
    cmdActive(sessionArg);
    break;
  case 'process':
    cmdProcess(sessionArg, rest[0], rest[1], rest.includes('--force'));
    break;
  case 'advance-tick':
    cmdAdvanceTick(sessionArg);
    break;
  case 'research-pending':
    cmdResearchPending(sessionArg, rest.includes('--blocking-only'));
    break;
  case 'research-done':
    cmdResearchDone(sessionArg, rest[0]);
    break;
  case 'should-stop':
    cmdShouldStop(sessionArg);
    break;
  case 'status':
    cmdStatus(sessionArg);
    break;
  case 'activate-optional':
    cmdActivateOptional(sessionArg, rest);
    break;
  default:
    console.error('Unknown command:', cmd);
    process.exit(1);
}
