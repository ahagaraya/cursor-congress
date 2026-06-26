/**
 * Congress active session marker — Cursor status line, UI banner, ACTIVE.congress.md
 */
import { readFileSync, writeFileSync, unlinkSync, existsSync, renameSync } from 'fs';
import { join, resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { getCommissionMode } from './triage.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const CONGRESS_ROOT = resolve(__dirname, '../..');

export function getActivePath() {
  return process.env.CONGRESS_ACTIVE_PATH || join(CONGRESS_ROOT, '.active-session.json');
}

export function getActiveMdPath() {
  return process.env.CONGRESS_ACTIVE_MD_PATH || join(CONGRESS_ROOT, 'ACTIVE.congress.md');
}

const PHASE_LABELS = {
  setup: 'настройка',
  triage: 'триаж',
  intake: 'intake',
  brief: 'brief',
  r1: 'раунд 1',
  optional_r1: 'эксперты',
  research: 'исследование',
  merge: 'слияние',
  swarm_init: 'swarm init',
  swarm: 'swarm',
  proposal: 'proposal',
  editor: 'редактор',
  assistant: 'ассистент',
  validate: 'валидация',
  complete: 'завершено',
};

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function sessionSlug(sessionPath) {
  return basename(resolve(sessionPath));
}

function briefTitle(sessionPath) {
  try {
    const brief = readFileSync(join(resolve(sessionPath), 'BRIEF.md'), 'utf8');
    const m = brief.match(/^## Question\s*\n+(.+)/m);
    if (m) return m[1].trim().slice(0, 100);
  } catch {}
  return sessionSlug(sessionPath);
}

export function loadActive() {
  return readJson(getActivePath());
}

export function clearActive() {
  const activePath = getActivePath();
  const activeMd = getActiveMdPath();
  if (existsSync(activePath)) unlinkSync(activePath);
  if (existsSync(activeMd)) unlinkSync(activeMd);
}

function writeActiveMarkdown(data) {
  const phaseLabel = PHASE_LABELS[data.phase] || data.phase;
  const mode = data.mode === 'lite' ? 'lite' : data.mode === 'full' ? 'full' : '—';
  const lines = [
    '# ⚖️ Congress — активная сессия',
    '',
    `> **Статус:** работает · фаза **${phaseLabel}** · режим **${mode}**`,
    '',
    '| | |',
    '|---|---|',
    `| Сессия | \`${data.slug}\` |`,
    `| Вопрос | ${data.title} |`,
    `| Обновлено | ${data.updated_at} |`,
    '',
    'Живой UI: `node congress/ui/server.mjs` → http://127.0.0.1:3747',
    '',
    '_Файл обновляется автоматически. После validate исчезнет._',
  ];
  writeFileSync(getActiveMdPath(), `${lines.join('\n')}\n`);
}

export function setActive(sessionPath, extra = {}) {
  const session = resolve(sessionPath);
  let state = {};
  try {
    state = JSON.parse(readFileSync(join(session, 'deliberation', 'state.json'), 'utf8'));
  } catch {}

  const current = loadActive();
  const payload = {
    active: true,
    slug: sessionSlug(session),
    session_path: session,
    phase: state.phase || extra.phase || 'setup',
    status: state.status || extra.status || 'in_progress',
    mode: getCommissionMode(session) || extra.commission_mode || null,
    wave: state.wave || null,
    title: briefTitle(session),
    updated_at: new Date().toISOString(),
    started_at: current?.slug === sessionSlug(session) ? current.started_at : new Date().toISOString(),
  };

  const tmp = `${getActivePath()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`);
  renameSync(tmp, getActivePath());
  writeActiveMarkdown(payload);
  return payload;
}

export function syncActiveFromSession(sessionPath) {
  const session = resolve(sessionPath);
  const statePath = join(session, 'deliberation', 'state.json');
  if (!existsSync(statePath)) return null;

  const state = readJson(statePath) || {};
  const slug = sessionSlug(session);
  const current = loadActive();

  if (state.phase === 'complete' && state.status === 'completed') {
    if (current?.slug === slug) clearActive();
    return null;
  }

  return setActive(session);
}

export function formatStatusLine(active, cursorPayload = {}) {
  if (!active?.active || active.phase === 'complete') {
    const model = cursorPayload?.model?.display_name;
    const pct = cursorPayload?.context_window?.used_percentage;
    if (model != null && pct != null) {
      const p = String(pct).split('.')[0];
      return `\x1b[90m${model}  ctx ${p}%\x1b[0m`;
    }
    return '';
  }

  const phase = PHASE_LABELS[active.phase] || active.phase;
  const mode = active.mode === 'lite' ? 'lite' : active.mode === 'full' ? 'full' : '';
  const modePart = mode ? ` · ${mode}` : '';
  const line1 = `\x1b[33m⚖️ Congress\x1b[0m \x1b[36m${active.slug}\x1b[0m · \x1b[35m${phase}\x1b[0m${modePart}`;
  const line2 = `\x1b[90m${(active.title || '').slice(0, 60)}\x1b[0m`;
  return `${line1}\n${line2}`;
}

export function isCongressActive() {
  const a = loadActive();
  return Boolean(a?.active && a.phase !== 'complete');
}
