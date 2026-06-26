#!/usr/bin/env node
/**
 * Congress session runner — phase checklist, resume, swarm helpers, final validate.
 *
 * Chair still runs LLM Tasks in Cursor; this script enforces order and automates router/validate.
 *
 * Usage:
 *   node congress/scripts/run.mjs <session-dir> [command] [options]
 *
 * Commands (default: status):
 *   status          — progress + completed_phases (sync from disk)
 *   next            — next incomplete phase + context manifest
 *   advance         — if current phase complete, mark and show next
 *   check           — check specific or next phase only
 *   manifest <phase>— print context manifest for phase
 *   swarm-step      — research-pending + active roles + tick info
 *   swarm-process   — process existing turn files for active roles, advance-tick, should-stop
 *   swarm-init      — router init
 *   validate        — validate-session --gate full (blocks on failure)
 *   optional-roles  — list optional commissioners to invoke for this session
 *   triage          — suggest full|lite + текст для AskUserQuestion
 *
 * Options:
 *   --skip-intake
 *   --no-assistant
 *   --phase <name>  — with check/advance/manifest
 *   --json
 *   --warn          — with validate: exit 0 on warnings only
 *   --mark <phase>  — force mark phase complete in state.json
 */
import { existsSync, readdirSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import {
  PHASE_ORDER,
  loadState,
  saveState,
  markPhase,
  checkPhase,
  nextIncompletePhase,
  syncStateFromDisk,
} from './lib/session-state.mjs';
import { formatManifestForChair, getPhaseManifest, allPhasesOrdered } from './lib/context-manifest.mjs';
import { cloudPathWarning } from './lib/cloud-path.mjs';
import { getCongressVersion } from './lib/congress-version.mjs';
import {
  getInvokedOptionalRoles,
  detectOptionalRolesFromText,
  readSessionTexts,
} from './lib/roles.mjs';
import {
  getCommissionMode,
  formatTriagePrompt,
  setCommissionMode,
  suggestCommissionMode,
} from './lib/triage.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONGRESS_ROOT = join(__dirname, '..');
const ROUTER = join(CONGRESS_ROOT, 'swarm', 'router.mjs');
const VALIDATE = join(CONGRESS_ROOT, 'scripts', 'validate-session.mjs');

function parseArgs(argv) {
  const positional = [];
  const opts = {
    command: 'status',
    skipIntake: false,
    noAssistant: false,
    json: false,
    phase: null,
    mark: null,
    warn: false,
  };

  const COMMANDS = new Set([
    'status',
    'next',
    'advance',
    'check',
    'manifest',
    'swarm-step',
    'swarm-process',
    'swarm-init',
    'validate',
    'optional-roles',
    'triage',
  ]);

  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a === '--skip-intake') opts.skipIntake = true;
    else if (a === '--no-assistant') opts.noAssistant = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--warn') opts.warn = true;
    else if (a === '--phase' && argv[i + 1]) {
      opts.phase = argv[++i];
    } else if (a === '--mark' && argv[i + 1]) {
      opts.mark = argv[++i];
    } else if (!a.startsWith('--')) {
      if (!positional.length) {
        positional.push(a);
      } else if (COMMANDS.has(a)) {
        opts.command = a;
        if (a === 'manifest' && argv[i + 1] && !argv[i + 1].startsWith('--')) {
          opts.phase = argv[++i];
        }
      } else if (opts.command === 'manifest' && !opts.phase) {
        opts.phase = a;
      } else {
        positional.push(a);
      }
    }
    i++;
  }

  return { sessionDir: positional[0], opts };
}

function routerJson(session, cmd, ...args) {
  const out = execFileSync('node', [ROUTER, cmd, session, ...args], { encoding: 'utf8' });
  return JSON.parse(out.trim());
}

function slugFromSession(session) {
  return session.split(/[/\\]/).filter(Boolean).pop();
}

function printOrJson(opts, data) {
  if (opts.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  if (data.title) console.log(`\n${data.title}`);
  if (data.lines) for (const line of data.lines) console.log(line);
}

function cmdStatus(session, opts) {
  const state = syncStateFromDisk(session, opts);
  const next = nextIncompletePhase(session, opts);
  const phases = allPhasesOrdered();

  const cloudWarn = cloudPathWarning(session);
  const lines = [
    `Session: ${session}`,
    `Congress: v${state.congress_version || getCongressVersion()} | Mode: ${state.commission_mode || getCommissionMode(session) || '(triage не пройден)'}`,
    `Phase: ${state.phase} | Status: ${state.status}`,
    `Completed: ${(state.completed_phases || []).join(' → ') || '(none)'}`,
    `Next: ${next ?? '— all done —'}`,
    '',
    'Progress:',
  ];

  for (const p of phases) {
    if (p.id === 'assistant' && opts.noAssistant) {
      lines.push(`  [skip] ${p.id} — ${p.label}`);
      continue;
    }
    const done = (state.completed_phases || []).includes(p.id);
    const marker = done ? '✓' : p.id === next ? '→' : ' ';
    lines.push(`  [${marker}] ${p.id} — ${p.label}`);
  }

  if (next) {
    lines.push('', 'Run: node congress/scripts/run.mjs <session> next');
  }
  if (cloudWarn) {
    lines.push('', `⚠️  ${cloudWarn}`);
  }

  printOrJson(opts, { title: 'Congress run — status', lines, state, next, cloud_warning: cloudWarn });
  return { state, next };
}

function cmdNext(session, opts) {
  const next = opts.phase || nextIncompletePhase(session, opts);
  if (!next) {
    printOrJson(opts, { title: 'Congress run', lines: ['All phases complete.'] });
    return { next: null };
  }

  const check = checkPhase(session, next, opts);
  const manifest = formatManifestForChair(next, {
    slug: slugFromSession(session),
    session,
    role: '{role}',
    tick: loadRouterTick(session),
  });

  const lines = [
    `Next phase: ${next}`,
    check.ok ? 'Status: ready to mark complete' : `Status: incomplete — ${check.missing.join('; ')}`,
    '',
    manifest,
  ];

  printOrJson(opts, { title: 'Congress run — next', lines, phase: next, check, manifest });
  return { next, check };
}

function loadRouterTick(session) {
  try {
    const s = routerJson(session, 'status');
    return s.tick ?? 0;
  } catch {
    return 0;
  }
}

function cmdAdvance(session, opts) {
  const phase = opts.phase || nextIncompletePhase(session, opts);
  if (!phase) {
    printOrJson(opts, { lines: ['Nothing to advance — session complete.'] });
    return { advanced: false };
  }

  const check = checkPhase(session, phase, opts);
  if (!check.ok) {
    printOrJson(opts, {
      title: 'Congress run — advance blocked',
      lines: [`Phase "${phase}" not complete:`, ...check.missing.map((m) => `  • ${m}`), '', 'Fix items, then run advance again.'],
    });
    process.exit(1);
  }

  markPhase(session, phase);

  if (phase === 'swarm_init') {
    saveState(session, { phase: 'swarm', wave: 'tick-0', status: 'running' });
  }

  const next = nextIncompletePhase(session, opts);
  syncStateFromDisk(session, opts);

  const lines = [`Marked complete: ${phase}`, `Next: ${next ?? 'validate only / done'}`];
  if (next) {
    lines.push('', 'Run: node congress/scripts/run.mjs <session> next');
  }

  printOrJson(opts, { title: 'Congress run — advanced', lines, completed: phase, next });
  return { advanced: true, completed: phase, next };
}

function cmdCheck(session, opts) {
  const phase = opts.phase || nextIncompletePhase(session, opts);
  if (!phase) {
    printOrJson(opts, { lines: ['All phases complete.'] });
    return { ok: true };
  }
  const check = checkPhase(session, phase, opts);
  printOrJson(opts, {
    title: `Congress run — check ${phase}`,
    lines: check.ok ? [`Phase "${phase}" OK`] : [`Phase "${phase}" incomplete:`, ...check.missing.map((m) => `  • ${m}`)],
    ...check,
  });
  if (!check.ok) process.exit(1);
  return check;
}

function cmdManifest(session, opts) {
  const phase = opts.phase || nextIncompletePhase(session, opts);
  if (!phase) {
    console.error('No phase specified');
    process.exit(1);
  }
  const text = formatManifestForChair(phase, {
    slug: slugFromSession(session),
    session,
    role: '{role}',
    tick: loadRouterTick(session),
  });
  if (opts.json) {
    console.log(JSON.stringify({ phase, manifest: getPhaseManifest(phase), text }, null, 2));
  } else {
    console.log(text);
  }
}

function cmdSwarmInit(session, opts) {
  const result = routerJson(session, 'init');
  saveState(session, { phase: 'swarm', wave: 'tick-0', status: 'running', mode: 'swarm' });
  printOrJson(opts, {
    title: 'Swarm initialized',
    lines: [`tick: ${result.tick}`, `seeded: ${result.seeded}`],
    result,
  });
  return result;
}

function cmdSwarmStep(session, opts) {
  let pending = [];
  try {
    const out = execFileSync('node', [ROUTER, 'research-pending', session, '--blocking-only'], {
      encoding: 'utf8',
    });
    pending = JSON.parse(out.trim());
  } catch {
    pending = [];
  }

  const status = routerJson(session, 'status');
  const active = routerJson(session, 'active');
  const tick = status.tick ?? 0;

  const lines = [
    `Swarm tick: ${tick} | status: ${status.status}`,
    `Stop votes: ${status.stop_votes ?? 0}`,
    '',
  ];

  if (pending.length) {
    lines.push('Blocking research pending:', ...pending.map((p) => `  • ${p.id}: ${p.query}`), '');
  }

  if (!active.length) {
    lines.push('No active roles (inbox empty or swarm stopped).');
    lines.push('Run: node congress/swarm/router.mjs should-stop', session);
  } else {
    lines.push(`Active roles (${active.length}): ${active.join(', ')}`);
    lines.push('');
    for (const role of active) {
      lines.push(`  Task ${role} → deliberation/swarm/turns/${role}-t${tick}.json`);
    }
    lines.push('', 'After Tasks: node congress/scripts/run.mjs <session> swarm-process');
  }

  printOrJson(opts, { title: 'Congress swarm-step', lines, tick, active, pending, status });
  return { tick, active, pending };
}

function cmdSwarmProcess(session, opts) {
  const active = routerJson(session, 'active');
  if (!active.length) {
    const stop = routerJson(session, 'should-stop');
    printOrJson(opts, {
      title: 'Swarm process',
      lines: [`No active roles. should-stop: ${stop.stop} (${stop.reason || '—'})`],
      stop,
    });
    if (stop.stop) {
      markPhase(session, 'swarm');
      syncStateFromDisk(session, opts);
    }
    return { processed: [], stop };
  }

  const tick = loadRouterTick(session);
  const turnsDir = join(session, 'deliberation', 'swarm', 'turns');
  const processed = [];
  const skipped = [];

  for (const role of active) {
    const turnPath = join(turnsDir, `${role}-t${tick}.json`);
    if (!existsSync(turnPath)) {
      skipped.push({ role, reason: 'turn file missing', path: turnPath });
      continue;
    }
    const result = routerJson(session, 'process', role, turnPath);
    processed.push({ role, ...result });
  }

  if (processed.length) {
    routerJson(session, 'advance-tick');
  }

  const stop = routerJson(session, 'should-stop');

  const lines = [
    `Processed: ${processed.map((p) => p.role).join(', ') || '(none)'}`,
    ...(skipped.length ? ['Skipped:', ...skipped.map((s) => `  • ${s.role}: ${s.reason}`)] : []),
    `should-stop: ${stop.stop}${stop.reason ? ` (${stop.reason})` : ''}`,
  ];

  if (stop.stop) {
    markPhase(session, 'swarm');
    syncStateFromDisk(session, opts);
    lines.push('', 'Swarm complete. Next: node congress/scripts/run.mjs <session> next');
  } else if (processed.length) {
    lines.push('', 'Continue: node congress/scripts/run.mjs <session> swarm-step');
  }

  printOrJson(opts, { title: 'Congress swarm-process', lines, processed, skipped, stop });
  return { processed, skipped, stop };
}

function cmdTriage(session, opts) {
  const current = getCommissionMode(session);
  const prompt = formatTriagePrompt(session);
  const suggestion = suggestCommissionMode(session);

  const lines = [
    `Session: ${session}`,
    `Режим: ${current ?? 'не выбран — обязательно спросить пользователя'}`,
    `Рекомендация: ${suggestion.suggested}`,
    '',
    'Спросите пользователя (AskUserQuestion):',
    `  • ${prompt.ask_user.questions[0].prompt}`,
    `— full: ${suggestion.labels.full.summary}`,
    `— lite: ${suggestion.labels.lite.summary}`,
    '',
    'После ответа:',
    '  node congress/scripts/triage.mjs <session> --set full|lite',
    '',
    'Затем intake (уточняющие вопросы) — см. intake-protocol.md',
  ];

  printOrJson(opts, {
    title: 'Congress — triage (режим комиссии)',
    lines,
    current,
    suggestion,
    prompt: prompt.ask_user,
  });
  return { current, suggestion, prompt };
}

function cmdOptionalRoles(session, opts) {
  const invoked = getInvokedOptionalRoles(session);
  const { brief, assumptions } = readSessionTexts(session);
  const suggested = detectOptionalRolesFromText(`${brief}\n${assumptions}`);

  const lines = [
    `Session: ${session}`,
    '',
    invoked.length
      ? `Вызвать (optional_r1): ${invoked.join(', ')}`
      : 'Опциональные роли не требуются — фаза optional_r1 пропускается.',
    '',
    'Доступные опциональные комиссары: economist, marketer, product-manager',
    'Задать вручную: optional_roles: [economist] в assumptions.yaml',
    'Исключить авто-детект: optional_roles_skip: [marketer]',
    '',
    'Подсказки авто-детекта:',
    ...(suggested.length
      ? suggested.map((s) => `  • ${s.role} — ${s.reason}`)
      : ['  (нет)']),
    '',
    'После opinions: node congress/scripts/run.mjs <session> advance --phase optional_r1',
  ];

  printOrJson(opts, {
    title: 'Congress — optional roles',
    lines,
    invoked,
    suggested,
  });
  return { invoked, suggested };
}

function cmdValidate(session, opts) {
  const args = [
    VALIDATE,
    session,
    '--gate',
    'full',
    ...(opts.skipIntake ? ['--skip-intake'] : []),
    ...(opts.noAssistant ? ['--no-assistant'] : []),
    ...(opts.warn ? ['--warn'] : []),
  ];
  if (opts.json) args.push('--json');

  try {
    const out = execFileSync('node', args, { encoding: 'utf8', stdio: opts.json ? 'pipe' : 'inherit' });
    if (opts.json) console.log(out);
    markPhase(session, 'validate');
    syncStateFromDisk(session, opts);
    if (!opts.json) console.log('\n✅ validate --gate full passed');
    return { ok: true };
  } catch (e) {
    if (opts.json && e.stdout) console.log(e.stdout);
    process.exit(e.status || 1);
  }
}

function cmdMark(session, opts) {
  if (!opts.mark || !PHASE_ORDER.includes(opts.mark)) {
    console.error(`--mark requires phase: ${PHASE_ORDER.join(', ')}`);
    process.exit(1);
  }
  markPhase(session, opts.mark);
  printOrJson(opts, { lines: [`Force-marked: ${opts.mark}`] });
}

function main() {
  const { sessionDir, opts } = parseArgs(process.argv.slice(2));

  if (!sessionDir) {
    console.error(`Usage: node congress/scripts/run.mjs <session-dir> [status|next|advance|check|manifest|swarm-init|swarm-step|swarm-process|validate|optional-roles|triage] [options]

Options: --skip-intake --no-assistant --warn --phase <name> --mark <phase> --json`);
    process.exit(1);
  }

  const session = resolve(sessionDir);
  if (!existsSync(session)) {
    console.error('Session not found:', session);
    process.exit(1);
  }

  if (opts.mark) {
    cmdMark(session, opts);
    return;
  }

  switch (opts.command) {
    case 'status':
      cmdStatus(session, opts);
      break;
    case 'next':
      cmdNext(session, opts);
      break;
    case 'advance':
      cmdAdvance(session, opts);
      break;
    case 'check':
      cmdCheck(session, opts);
      break;
    case 'manifest':
      cmdManifest(session, opts);
      break;
    case 'swarm-init':
      cmdSwarmInit(session, opts);
      break;
    case 'swarm-step':
      cmdSwarmStep(session, opts);
      break;
    case 'swarm-process':
      cmdSwarmProcess(session, opts);
      break;
    case 'validate':
      cmdValidate(session, opts);
      break;
    case 'optional-roles':
      cmdOptionalRoles(session, opts);
      break;
    case 'triage':
      cmdTriage(session, opts);
      break;
    default:
      console.error('Unknown command:', opts.command);
      process.exit(1);
  }
}

main();
