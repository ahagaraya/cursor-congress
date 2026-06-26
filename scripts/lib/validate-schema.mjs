/**
 * JSON schema validation for Congress session artifacts (ajv).
 */
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import Ajv2020 from 'ajv/dist/2020.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONGRESS_ROOT = resolve(__dirname, '../..');
const SCHEMAS_DIR = resolve(CONGRESS_ROOT, '../.cursor/skills/congress/references');

let _ajv = null;
let _validators = null;

function loadSchemas() {
  if (_validators) return _validators;
  _ajv = new Ajv2020({ allErrors: true, strict: false });
  const opinionSchema = JSON.parse(
    readFileSync(join(SCHEMAS_DIR, 'output-schema.json'), 'utf8')
  );
  const swarmSchema = JSON.parse(
    readFileSync(join(SCHEMAS_DIR, 'swarm-message-schema.json'), 'utf8')
  );
  _validators = {
    opinion: _ajv.compile(opinionSchema),
    swarmTurn: _ajv.compile(swarmSchema),
  };
  return _validators;
}

function formatAjvErrors(validate, label) {
  return (validate.errors || []).map((e) => {
    const path = e.instancePath || '/';
    return `${label}: ${path} ${e.message}`;
  });
}

export function validateOpinionData(data, label = 'opinion') {
  const { opinion } = loadSchemas();
  const ok = opinion(data);
  if (ok) return { ok: true, errors: [] };
  return { ok: false, errors: formatAjvErrors(opinion, label) };
}

export function validateSwarmTurnData(data, label = 'turn') {
  const { swarmTurn } = loadSchemas();
  const ok = swarmTurn(data);
  if (ok) return { ok: true, errors: [] };
  return { ok: false, errors: formatAjvErrors(swarmTurn, label) };
}

export function validateSessionOpinions(sessionDir) {
  const session = resolve(sessionDir);
  const dir = join(session, 'opinions');
  const errors = [];
  if (!existsSync(dir)) {
    return { ok: true, errors, checked: 0 };
  }
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  for (const f of files) {
    let data;
    try {
      data = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    } catch {
      errors.push({ file: `opinions/${f}`, message: 'Битый JSON' });
      continue;
    }
    const r = validateOpinionData(data, `opinions/${f}`);
    if (!r.ok) {
      for (const msg of r.errors) {
        errors.push({ file: `opinions/${f}`, message: msg });
      }
    }
  }
  return { ok: errors.length === 0, errors, checked: files.length };
}

export function validateSessionSwarmTurns(sessionDir) {
  const session = resolve(sessionDir);
  const dir = join(session, 'deliberation', 'swarm', 'turns');
  const errors = [];
  if (!existsSync(dir)) {
    return { ok: true, errors, checked: 0 };
  }
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  for (const f of files) {
    let data;
    try {
      data = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    } catch {
      errors.push({ file: `turns/${f}`, message: 'Битый JSON' });
      continue;
    }
    const r = validateSwarmTurnData(data, `turns/${f}`);
    if (!r.ok) {
      for (const msg of r.errors) {
        errors.push({ file: `turns/${f}`, message: msg });
      }
    }
  }
  return { ok: errors.length === 0, errors, checked: files.length };
}

export function validateSessionSchemas(sessionDir, opts = {}) {
  const opinions = opts.opinions !== false ? validateSessionOpinions(sessionDir) : { ok: true, errors: [], checked: 0 };
  const turns = opts.turns !== false ? validateSessionSwarmTurns(sessionDir) : { ok: true, errors: [], checked: 0 };
  const errors = [...opinions.errors, ...turns.errors];
  return {
    ok: opinions.ok && turns.ok,
    errors,
    opinions_checked: opinions.checked,
    turns_checked: turns.checked,
  };
}
