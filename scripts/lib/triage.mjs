/**
 * Congress triage — full vs lite commission mode.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  CORE_VOTING_ROLES,
  LITE_VOTING_ROLES,
  readSessionTexts,
} from './roles.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const COMMISSION_MODES = ['full', 'lite'];

const FULL_SIGNALS =
  /сделк|договор|контракт|юрид|налог|152|стратег|архитект|инвест|milion|миллион|бюджет|риск|безопасност|пдн|compliance|запуск продукта|go-to-market|due diligence/i;

const LITE_SIGNALS =
  /переименова|названи|мелк|быстр|коротк|одна фич|формулировк|черновик|уточни/i;

export const MODE_LABELS = {
  full: {
    id: 'full',
    title: 'Полная комиссия',
    summary: '8 комиссаров, роевой диалог, развёрнутая статья ANSWER',
    roles: CORE_VOTING_ROLES.length,
    swarm: true,
    time_hint: '1–3 часа, ~3–5× токенов одного чата',
  },
  lite: {
    id: 'lite',
    title: 'Краткая комиссия',
    summary: '4 комиссара (критик, архитектор, прагматик, техлид), короче рой и отчёт',
    roles: LITE_VOTING_ROLES.length,
    swarm: true,
    time_hint: '~30–60 мин, меньше токенов',
  },
};

function parseYamlScalar(text, key) {
  const m = text.match(new RegExp(`^${key}:\\s*["']?([^"'\\n#]+)`, 'm'));
  return m ? m[1].trim() : null;
}

export function getCommissionMode(sessionDir) {
  const session = resolve(sessionDir);
  const { assumptions, state } = readSessionTexts(session);
  const fromState = state.commission_mode;
  if (fromState && COMMISSION_MODES.includes(fromState)) return fromState;
  const fromYaml = parseYamlScalar(assumptions, 'commission_mode');
  if (fromYaml && COMMISSION_MODES.includes(fromYaml)) return fromYaml;
  return null;
}

export function suggestCommissionMode(sessionDir) {
  const { brief, assumptions } = readSessionTexts(resolve(sessionDir));
  const text = `${brief}\n${assumptions}`;
  const words = (brief || '').split(/\s+/).filter(Boolean).length;

  let scoreFull = 0;
  let scoreLite = 0;
  if (FULL_SIGNALS.test(text)) scoreFull += 2;
  if (LITE_SIGNALS.test(text)) scoreLite += 2;
  if (words > 120) scoreFull += 1;
  if (words < 40 && words > 0) scoreLite += 1;
  if (/## Question[\s\S]{0,200}$/m.test(brief) && words < 25) scoreLite += 1;

  const suggested = scoreLite > scoreFull ? 'lite' : 'full';
  const confidence = Math.min(0.9, 0.55 + Math.abs(scoreFull - scoreLite) * 0.12);
  return {
    suggested,
    confidence,
    scores: { full: scoreFull, lite: scoreLite },
    labels: MODE_LABELS,
  };
}

export function setCommissionMode(sessionDir, mode) {
  if (!COMMISSION_MODES.includes(mode)) {
    throw new Error(`Invalid mode: ${mode}. Use: ${COMMISSION_MODES.join(', ')}`);
  }
  const session = resolve(sessionDir);
  const assumptionsPath = join(session, 'assumptions.yaml');
  let assumptions = '';
  if (existsSync(assumptionsPath)) {
    assumptions = readFileSync(assumptionsPath, 'utf8');
  }
  if (/^commission_mode:/m.test(assumptions)) {
    assumptions = assumptions.replace(/^commission_mode:.*$/m, `commission_mode: ${mode}`);
  } else {
    assumptions = assumptions.trimEnd() + `\n\ncommission_mode: ${mode}\n`;
  }
  writeFileSync(assumptionsPath, assumptions);

  const statePath = join(session, 'deliberation', 'state.json');
  mkdirSync(dirname(statePath), { recursive: true });
  let state = {};
  if (existsSync(statePath)) {
    try {
      state = JSON.parse(readFileSync(statePath, 'utf8'));
    } catch {
      state = {};
    }
  }
  state.commission_mode = mode;
  state.mode = mode === 'lite' ? 'lite' : 'swarm';
  state.updated = new Date().toISOString();
  const tmp = statePath + '.tmp';
  writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n');
  renameSync(tmp, statePath);

  return { ok: true, mode, session };
}

export function formatTriagePrompt(sessionDir) {
  const suggestion = suggestCommissionMode(sessionDir);
  const full = MODE_LABELS.full;
  const lite = MODE_LABELS.lite;
  return {
    suggestion,
    ask_user: {
      title: 'Режим Congress',
      intro:
        'Перед запуском комиссии выберите режим. После выбора — ответьте на уточняющие вопросы intake (если есть).',
      questions: [
        {
          id: 'commission_mode',
          prompt: 'Какой режим комиссии вам нужен?',
          options: [
            {
              id: 'full',
              label: `${full.title} — ${full.summary} (${full.time_hint})`,
              recommended: suggestion.suggested === 'full',
            },
            {
              id: 'lite',
              label: `${lite.title} — ${lite.summary} (${lite.time_hint})`,
              recommended: suggestion.suggested === 'lite',
            },
          ],
          chair_hint: `Рекомендация по тексту BRIEF: ${suggestion.suggested} (уверенность ~${Math.round(suggestion.confidence * 100)}%)`,
        },
      ],
    },
    cli: `node congress/scripts/triage.mjs ${resolve(sessionDir)} --set full|lite`,
  };
}

export function getActiveCoreRoles(sessionDir) {
  const mode = getCommissionMode(sessionDir) || 'full';
  return mode === 'lite' ? [...LITE_VOTING_ROLES] : [...CORE_VOTING_ROLES];
}

export function minSwarmTurnsForMode(mode) {
  return mode === 'lite' ? 1 : 3;
}
