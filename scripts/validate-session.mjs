#!/usr/bin/env node
/**
 * Congress session completion validator.
 *
 * Usage:
 *   node congress/scripts/validate-session.mjs <session-dir> [options]
 *
 * Gates (--gate):
 *   intake      — intake answers or documented skip
 *   r1          — Round 1 opinions
 *   research    — blocking research done
 *   swarm         — swarm router completed
 *   proposal    — deliberation/proposal.json
 *   answer      — ready to write/read ANSWER (main gate)
 *   full        — entire session including assistant
 *
 * Options:
 *   --no-assistant    skip ANSWER_PLAIN + glossary
 *   --skip-intake     allow assumptions skip_intake_reason
 *   --warn            exit 0 with warnings printed
 *   --no-lint         skip English jargon lint on ANSWER
 *   --lint-all        warn on any stray Latin words (not only banned jargon)
 *   --json            machine-readable output only
 *
 * Exit: 0 ok | 1 errors | 2 warnings only (with --warn)
 */
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { lintAnswerFile } from './lint-answer.mjs';
import { lintProse } from './lint-prose.mjs';
import { validateSessionOpinions, validateSessionSwarmTurns } from './lib/validate-schema.mjs';
import {
  CORE_VOTING_ROLES,
  getInvokedOptionalRoles,
} from './lib/roles.mjs';
import { getCommissionMode, getActiveCoreRoles, minSwarmTurnsForMode } from './lib/triage.mjs';

const MIN_SWARM_TURNS_FULL = 3;

const ESCALATION = [
  { tag: /legal|юрид|право|налог|152-фз|договор/i, role: 'lawyer', label: 'право/налоги' },
  { tag: /security|безопасност|операцион|sla|краж/i, role: 'security', label: 'операционная безопасность' },
  { tag: /infra|инфра|кибер|cyber|пдн|152/i, role: 'cybersec', label: 'кибербезопасность/ПДн' },
];

const GATES = ['intake', 'r1', 'research', 'swarm', 'proposal', 'answer', 'full'];

function parseArgs(argv) {
  const positional = [];
  const opts = {
    gate: 'answer',
    noAssistant: false,
    skipIntake: false,
    warn: false,
    json: false,
    noLint: false,
    lintAll: false,
  };
  for (const a of argv) {
    if (a === '--no-assistant') opts.noAssistant = true;
    else if (a === '--skip-intake') opts.skipIntake = true;
    else if (a === '--warn') opts.warn = true;
    else if (a === '--no-lint') opts.noLint = true;
    else if (a === '--lint-all') opts.lintAll = true;
    else if (a === '--json') opts.json = true;
    else if (a.startsWith('--gate=')) opts.gate = a.slice(7);
    else if (a === '--gate') continue;
    else if (!a.startsWith('--')) positional.push(a);
    else if (GATES.includes(a.replace(/^--/, ''))) opts.gate = a.replace(/^--/, '');
  }
  if (argv.includes('--gate')) {
    const i = argv.indexOf('--gate');
    if (argv[i + 1] && GATES.includes(argv[i + 1])) opts.gate = argv[i + 1];
  }
  return { sessionDir: positional[0], opts };
}

function readText(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function wordCount(text) {
  return (text || '').trim().split(/\s+/).filter(Boolean).length;
}

function listOpinions(session) {
  const dir = join(session, 'opinions');
  if (!existsSync(dir)) return { files: [], roles: [] };
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  const roles = [];
  for (const f of files) {
    const j = readJson(join(dir, f));
    if (j?.role) roles.push(j.role);
    else roles.push(f.replace('.json', ''));
  }
  return { files, roles: [...new Set(roles)] };
}

function requiredRoles(session, _opts, briefText) {
  const mode = getCommissionMode(session) || 'full';
  let roles = [...getActiveCoreRoles(session)];
  const extra = [];
  for (const rule of ESCALATION) {
    if (rule.tag.test(briefText || '') && !roles.includes(rule.role)) {
      roles.push(rule.role);
      extra.push({ role: rule.role, reason: rule.label });
    }
  }
  const optional = getInvokedOptionalRoles(session);
  for (const r of optional) {
    if (!roles.includes(r)) {
      roles.push(r);
      extra.push({ role: r, reason: 'опциональный комиссар' });
    }
  }
  return { roles: [...new Set(roles)], escalated: extra, optional, commission_mode: mode };
}

function checkTriage(session, errors) {
  if (!getCommissionMode(session)) {
    errors.push({
      code: 'triage.missing_mode',
      message:
        'Не выбран commission_mode (full|lite). Спросите пользователя и: node congress/scripts/triage.mjs <session> --set full|lite',
    });
  }
}

function checkIntake(session, opts, errors, warnings) {
  const answers = join(session, 'intake', 'answers.yaml');
  const questions = join(session, 'intake', 'questions.yaml');
  const assumptions = readText(join(session, 'assumptions.yaml')) || '';

  if (existsSync(answers)) return;

  const skipOk =
    opts.skipIntake ||
    /skip_intake:\s*true/i.test(assumptions) ||
    /skip_intake_reason:/i.test(assumptions);

  if (skipOk) {
    if (!existsSync(questions) && !/skip_intake_reason:/i.test(assumptions)) {
      warnings.push({
        code: 'intake.skip_undocumented',
        message: 'Intake пропущен, но нет skip_intake_reason в assumptions.yaml',
      });
    }
    return;
  }

  errors.push({
    code: 'intake.missing_answers',
    message: 'Нет intake/answers.yaml. Проведите intake или укажите skip_intake_reason в assumptions.yaml + флаг --skip-intake',
  });
}

function checkR1(session, opts, errors, warnings, info) {
  const brief = readText(join(session, 'BRIEF.md')) || '';
  const { roles: required, escalated, optional } = requiredRoles(session, opts, brief);
  const { roles: present, files } = listOpinions(session);

  info.required_roles = required;
  info.present_roles = present;
  info.opinion_files = files.length;
  if (escalated.length) info.escalated_roles = escalated;
  if (optional?.length) info.optional_roles = optional;

  const missing = required.filter((r) => !present.includes(r));
  if (missing.length) {
    errors.push({
      code: 'r1.missing_opinions',
      message: `Нет мнений для ролей: ${missing.join(', ')} (${present.length}/${required.length})`,
      missing,
    });
  }

  for (const f of files) {
    const j = readJson(join(session, 'opinions', f));
    if (!j) {
      errors.push({ code: 'r1.invalid_json', message: `Битый JSON: opinions/${f}` });
      continue;
    }
    for (const field of ['role', 'position', 'confidence', 'key_points', 'risks']) {
      if (j[field] === undefined) {
        warnings.push({
          code: 'r1.schema_incomplete',
          message: `opinions/${f}: нет поля ${field}`,
        });
      }
    }
  }

  if (present.length < getActiveCoreRoles(session).length) {
    const mode = getCommissionMode(session) || 'full';
    warnings.push({
      code: 'r1.partial_commission',
      message: `Ядро комиссии (${mode}): ${present.filter((r) => getActiveCoreRoles(session).includes(r)).length}/${getActiveCoreRoles(session).length} мнений`,
    });
  }

  const schema = validateSessionOpinions(session);
  if (!schema.ok) {
    for (const e of schema.errors) {
      errors.push({
        code: 'r1.schema_invalid',
        message: `${e.file}: ${e.message}`,
        file: e.file,
      });
    }
  }
  info.opinions_schema_checked = schema.checked;
}

function checkResearch(session, errors, warnings) {
  const reqDir = join(session, 'research', 'requests');
  if (!existsSync(reqDir)) return;

  for (const f of readdirSync(reqDir).filter((x) => x.endsWith('.json'))) {
    const req = readJson(join(reqDir, f));
    if (!req) continue;
    if (req.priority !== 'blocking') continue;
    if (req.status === 'done') continue;

    const finding = join(session, 'research', 'findings', `${req.id || f.replace('.json', '')}.json`);
    if (existsSync(finding)) continue;

    errors.push({
      code: 'research.blocking_pending',
      message: `Blocking research не завершён: ${req.id || f} — ${req.query || ''}`,
      id: req.id,
    });
  }
}

function checkSwarm(session, errors, warnings, opts, info) {
  const rs = readJson(join(session, 'deliberation', 'swarm', 'router-state.json'));
  if (!rs) {
    errors.push({ code: 'swarm.not_initialized', message: 'Нет deliberation/swarm/router-state.json — выполните router.mjs init' });
    return;
  }
  if (!['completed', 'stopped'].includes(rs.status)) {
    errors.push({
      code: 'swarm.not_finished',
      message: `Swarm status: ${rs.status} (нужен completed или stopped; tick=${rs.tick ?? '?'})`,
    });
    return;
  }
  const turnsDir = join(session, 'deliberation', 'swarm', 'turns');
  if (existsSync(turnsDir)) {
    const turns = readdirSync(turnsDir).filter((f) => f.endsWith('.json'));
    const mode = getCommissionMode(session) || 'full';
    const minTurns = minSwarmTurnsForMode(mode);
    if (turns.length < minTurns) {
      const item = {
        code: 'swarm.few_turns',
        message: `Мало ходов роевого обсуждения: ${turns.length} (нужно ≥${minTurns} для mode=${mode})`,
      };
      if (opts.gate === 'full') errors.push(item);
      else warnings.push({ ...item, message: `Мало ходов роевого обсуждения: ${turns.length} (ориентир ≥${minTurns})` });
    }

    const schema = validateSessionSwarmTurns(session);
    if (!schema.ok) {
      for (const e of schema.errors) {
        errors.push({
          code: 'swarm.schema_invalid',
          message: `${e.file}: ${e.message}`,
          file: e.file,
        });
      }
    }
    info.turns_schema_checked = schema.checked;
  }
}

function lintAnswerFiles(session, opts, errors, warnings) {
  if (opts.noLint) return;

  const files = ['ANSWER.md'];
  if (opts.gate === 'full' && !opts.noAssistant) files.push('ANSWER_PLAIN.md');

  for (const name of files) {
    const path = join(session, name);
    if (!existsSync(path)) continue;
    const result = lintAnswerFile(path, { strict: false, reportAll: opts.lintAll });
    for (const f of result.findings) {
      const msg = `${name} L${f.line}: «${f.word}» — ${f.context.slice(0, 80)}`;
      if (f.severity === 'error') {
        errors.push({ code: 'answer.english_jargon', message: msg, word: f.word, line: f.line });
      } else {
        warnings.push({ code: 'answer.english_maybe', message: msg, word: f.word, line: f.line });
      }
    }
  }
}

function checkProposal(session, errors) {
  const p = readJson(join(session, 'deliberation', 'proposal.json'));
  if (!p) {
    errors.push({ code: 'proposal.missing', message: 'Нет deliberation/proposal.json' });
    return;
  }
  if (!p.evolved_solution && !p.verdict) {
    errors.push({ code: 'proposal.incomplete', message: 'proposal.json без evolved_solution / verdict' });
  }
}

function lintProseAnswer(session, opts, errors, warnings) {
  if (opts.noLint) return;
  const path = join(session, 'ANSWER.md');
  if (!existsSync(path)) return;
  const text = readText(path);
  const result = lintProse(text, { strict: opts.gate === 'full' });
  for (const f of result.findings) {
    const msg = `ANSWER.md L${f.line}: ${f.message}`;
    if (f.severity === 'error') {
      errors.push({ code: 'answer.prose_structure', message: msg });
    } else {
      warnings.push({ code: 'answer.prose_structure', message: msg });
    }
  }
}

function checkEditor(session, opts, errors, warnings) {
  const answerPath = join(session, 'ANSWER.md');
  if (!existsSync(answerPath)) {
    errors.push({
      code: 'editor.missing_answer',
      message: 'Нет ANSWER.md — фаза editor: Task редактора по commissioners/editor.md',
    });
    return;
  }
  if (opts.gate === 'full' || opts.gate === 'answer') {
    lintProseAnswer(session, opts, errors, warnings);
  }
}

function checkAnswer(session, opts, errors, warnings, info) {
  const answerPath = join(session, 'ANSWER.md');
  if (!existsSync(answerPath)) {
    errors.push({ code: 'answer.missing', message: 'Нет ANSWER.md' });
    return;
  }

  const text = readText(answerPath);
  const words = wordCount(text);
  info.answer_words = words;

  if (!/статус полноты|completeness/i.test(text)) {
    warnings.push({
      code: 'answer.no_completeness_status',
      message: 'В ANSWER.md нет блока «Статус полноты»',
    });
  }

  if (!/не является|не заменяет|отказ от ответственности|информационн/i.test(text)) {
    warnings.push({
      code: 'answer.no_disclaimer',
      message: 'В ANSWER.md нет disclaimer (информационный характер / не замена эксперта)',
    });
  }

  if (words < 400) {
    warnings.push({
      code: 'answer.too_short',
      message: `ANSWER.md слишком короткий: ~${words} слов (ориентир brief ≥800, full ≥1500)`,
    });
  }

  if (opts.gate === 'full' || opts.gate === 'answer') {
    lintAnswerFiles(session, opts, errors, warnings);
  }
}

function checkAssistant(session, opts, errors, warnings) {
  if (opts.noAssistant) return;

  if (!existsSync(join(session, 'ANSWER_PLAIN.md'))) {
    errors.push({ code: 'assistant.missing_plain', message: 'Нет ANSWER_PLAIN.md (или укажите --no-assistant)' });
  }
  if (!existsSync(join(session, 'glossary', 'glossary.md'))) {
    warnings.push({ code: 'assistant.missing_glossary', message: 'Нет glossary/glossary.md' });
  }
}

function gateOrder(gate) {
  const order = ['intake', 'r1', 'research', 'swarm', 'proposal', 'answer', 'full'];
  return order.indexOf(gate);
}

function run(sessionArg, opts) {
  const session = resolve(sessionArg);
  const errors = [];
  const warnings = [];
  const info = { session, gate: opts.gate, mode: 'swarm' };

  if (!existsSync(session)) {
    errors.push({ code: 'session.not_found', message: `Сессия не найдена: ${session}` });
    return { ok: false, errors, warnings, info };
  }

  if (!existsSync(join(session, 'BRIEF.md'))) {
    errors.push({ code: 'session.no_brief', message: 'Нет BRIEF.md' });
  }

  const g = gateOrder(opts.gate);
  if (g < 0) {
    errors.push({ code: 'gate.invalid', message: `Неизвестный gate: ${opts.gate}` });
    return { ok: false, errors, warnings, info };
  }

  if (g >= 0) {
    checkTriage(session, errors);
    checkIntake(session, opts, errors, warnings);
  }
  if (g >= 1) checkR1(session, opts, errors, warnings, info);
  if (g >= 2) checkResearch(session, errors, warnings);
  if (g >= 3) checkSwarm(session, errors, warnings, opts, info);
  if (g >= 4) checkProposal(session, errors);
  if (g >= 5) {
    checkEditor(session, opts, errors, warnings);
    checkAnswer(session, opts, errors, warnings, info);
  }
  if (g >= 6) checkAssistant(session, opts, errors, warnings);

  const ok = errors.length === 0;
  info.completeness = ok
    ? warnings.some((w) => w.code.includes('partial') || w.code.includes('few_turns'))
      ? 'partial'
      : 'full'
    : 'blocked';

  return { ok, errors, warnings, info };
}

function printHuman(result) {
  const { ok, errors, warnings, info } = result;
  console.log(`\nCongress validate — ${info.session}`);
  console.log(`Gate: ${info.gate} | Mode: ${info.mode} | Completeness: ${info.completeness}`);
  if (info.present_roles) {
    console.log(`Opinions: ${info.present_roles.length} [${info.present_roles.join(', ')}]`);
  }
  if (info.answer_words) console.log(`ANSWER words: ~${info.answer_words}`);

  if (errors.length) {
    console.log('\n❌ Ошибки (блокируют):');
    for (const e of errors) console.log(`  • [${e.code}] ${e.message}`);
  }
  if (warnings.length) {
    console.log('\n⚠️  Предупреждения:');
    for (const w of warnings) console.log(`  • [${w.code}] ${w.message}`);
  }
  if (ok && !warnings.length) console.log('\n✅ Gate пройден');
  else if (ok) console.log('\n✅ Gate пройден с предупреждениями');
  else console.log('\n🛑 Gate НЕ пройден — не публикуйте ANSWER как финальный');
}

const { sessionDir, opts } = parseArgs(process.argv.slice(2));

if (!sessionDir) {
  console.error(`Usage: node congress/scripts/validate-session.mjs <session-dir> [--gate answer] [--no-assistant] [--skip-intake] [--no-lint] [--lint-all] [--warn] [--json]`);
  process.exit(1);
}

const result = run(sessionDir, opts);

if (opts.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  printHuman(result);
}

if (!result.ok) process.exit(1);
if (result.warnings.length && !opts.warn) process.exit(1);
process.exit(result.warnings.length ? 2 : 0);
