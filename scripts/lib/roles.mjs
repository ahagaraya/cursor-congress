/**
 * Congress role registry — single source of truth for core, optional, and support roles.
 */
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Always in Round 1 and swarm (8). */
export const CORE_VOTING_ROLES = [
  'critic',
  'architect',
  'pragmatist',
  'tech-lead',
  'developer',
  'lawyer',
  'security',
  'cybersec',
];

/** Invoked only when needed — extra Round 1 opinion + swarm if active. */
export const OPTIONAL_VOTING_ROLES = ['economist', 'marketer', 'product-manager'];

/** Lite commission — 4 core roles when commission_mode: lite */
export const LITE_VOTING_ROLES = ['critic', 'architect', 'pragmatist', 'tech-lead'];

export const ALL_VOTING_ROLES = [...CORE_VOTING_ROLES, ...OPTIONAL_VOTING_ROLES];

/** Non-voting pipeline roles. */
export const SUPPORT_ROLES = ['researcher', 'editor', 'assistant'];

export const ALL_COMMISSIONER_IDS = [...ALL_VOTING_ROLES, ...SUPPORT_ROLES];

/** Auto-suggest optional roles from brief/assumptions text. Chair may override via YAML. */
export const OPTIONAL_ESCALATION = [
  {
    tag: /эконом|выручк|юнит|марж|p&l|roi|окупаемост|бюджет|cash flow|себестоим|прибыл/i,
    role: 'economist',
    label: 'экономика и финансы',
  },
  {
    tag: /маркетинг|продвижен|кампани|бренд|smm|таргет|аудитор|промо|контент-план/i,
    role: 'marketer',
    label: 'маркетинг и рост',
  },
  {
    tag: /продукт|product|фич|беклог|приорит|mvp|go-to-market|jtbd|ценност/i,
    role: 'product-manager',
    label: 'продукт и приоритеты',
  },
];

function readText(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

function parseYamlList(text, key) {
  const re = new RegExp(`^${key}:\\s*\\[([^\\]]*)\\]`, 'm');
  const m = text.match(re);
  if (m) {
    return m[1]
      .split(',')
      .map((s) => s.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }
  const reLines = new RegExp(`^${key}:\\s*$([\\s\\S]*?)(?=^\\w|$)`, 'm');
  const block = text.match(reLines);
  if (block) {
    return block[1]
      .split('\n')
      .map((l) => l.replace(/^\s*-\s*/, '').trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }
  return [];
}

export function detectOptionalRolesFromText(text) {
  const found = [];
  for (const rule of OPTIONAL_ESCALATION) {
    if (rule.tag.test(text || '')) found.push({ role: rule.role, reason: rule.label, source: 'auto' });
  }
  return found;
}

export function readSessionTexts(sessionDir) {
  const session = resolve(sessionDir);
  return {
    brief: readText(join(session, 'BRIEF.md')),
    assumptions: readText(join(session, 'assumptions.yaml')),
    state: existsSync(join(session, 'deliberation', 'state.json'))
      ? JSON.parse(readFileSync(join(session, 'deliberation', 'state.json'), 'utf8'))
      : {},
  };
}

/**
 * Roles chair explicitly invoked or auto-detected (minus skip list).
 */
export function getInvokedOptionalRoles(sessionDir) {
  const session = resolve(sessionDir);
  const { brief, assumptions, state } = readSessionTexts(session);

  const explicit = [
    ...parseYamlList(assumptions, 'optional_roles'),
    ...(state.optional_roles || []),
  ];
  const skip = new Set([
    ...parseYamlList(assumptions, 'optional_roles_skip'),
    ...(state.optional_roles_skip || []),
  ]);

  const auto = detectOptionalRolesFromText(`${brief}\n${assumptions}`).map((x) => x.role);

  const fromOpinions = [];
  const opinionsDir = join(session, 'opinions');
  if (existsSync(opinionsDir)) {
    for (const f of readdirSync(opinionsDir).filter((x) => x.endsWith('.json'))) {
      try {
        const j = JSON.parse(readFileSync(join(opinionsDir, f), 'utf8'));
        for (const r of j.invoke_optional_roles || []) fromOpinions.push(r);
      } catch {
        /* skip */
      }
    }
  }

  const merged = [...new Set([...explicit, ...auto, ...fromOpinions])].filter(
    (r) => OPTIONAL_VOTING_ROLES.includes(r) && !skip.has(r)
  );
  return merged;
}

export function getSwarmRolesFromState(routerState) {
  const active = routerState?.active_roles;
  if (Array.isArray(active) && active.length) return active;
  return [...CORE_VOTING_ROLES];
}

export function mergeSwarmRoles(core, optionalInvoked) {
  return [...new Set([...core, ...optionalInvoked.filter((r) => OPTIONAL_VOTING_ROLES.includes(r))])];
}

export function isCoreRole(role) {
  return CORE_VOTING_ROLES.includes(role);
}

export function isOptionalVotingRole(role) {
  return OPTIONAL_VOTING_ROLES.includes(role);
}

export function isVotingRole(role) {
  return ALL_VOTING_ROLES.includes(role);
}

export function personaPath(role) {
  return `.cursor/skills/congress/references/commissioners/${role}.md`;
}
