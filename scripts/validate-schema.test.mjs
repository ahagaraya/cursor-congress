import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readFileSync, mkdirSync, writeFileSync, mkdtempSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import {
  validateOpinionData,
  validateSwarmTurnData,
  validateSessionOpinions,
  validateSessionSwarmTurns,
} from './lib/validate-schema.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, 'fixtures');

function loadFixture(name) {
  return JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));
}

describe('validate-schema', () => {
  test('valid opinion passes', () => {
    const data = loadFixture('valid-opinion.json');
    const r = validateOpinionData(data);
    assert.equal(r.ok, true);
  });

  test('invalid opinion fails (empty key_points)', () => {
    const data = loadFixture('invalid-opinion.json');
    const r = validateOpinionData(data);
    assert.equal(r.ok, false);
    assert.ok(r.errors.length > 0);
  });

  test('valid swarm turn passes', () => {
    const data = loadFixture('valid-turn.json');
    const r = validateSwarmTurnData(data);
    assert.equal(r.ok, true);
  });

  test('invalid swarm turn fails (empty content)', () => {
    const data = loadFixture('invalid-turn.json');
    const r = validateSwarmTurnData(data);
    assert.equal(r.ok, false);
  });

  test('validateSessionOpinions on temp session', () => {
    const dir = mkdtempSync(join(tmpdir(), 'congress-schema-'));
    mkdirSync(join(dir, 'opinions'), { recursive: true });
    writeFileSync(join(dir, 'opinions', 'critic.json'), JSON.stringify(loadFixture('valid-opinion.json')));
    writeFileSync(join(dir, 'opinions', 'bad.json'), JSON.stringify(loadFixture('invalid-opinion.json')));
    const r = validateSessionOpinions(dir);
    assert.equal(r.ok, false);
    assert.equal(r.checked, 2);
  });

  test('validateSessionSwarmTurns on temp session', () => {
    const dir = mkdtempSync(join(tmpdir(), 'congress-schema-'));
    mkdirSync(join(dir, 'deliberation', 'swarm', 'turns'), { recursive: true });
    writeFileSync(
      join(dir, 'deliberation', 'swarm', 'turns', 'critic-t0.json'),
      JSON.stringify(loadFixture('valid-turn.json'))
    );
    const r = validateSessionSwarmTurns(dir);
    assert.equal(r.ok, true);
    assert.equal(r.checked, 1);
  });
});
