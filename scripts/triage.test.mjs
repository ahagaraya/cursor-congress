import { test, describe } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  getCommissionMode,
  setCommissionMode,
  suggestCommissionMode,
  getActiveCoreRoles,
  minSwarmTurnsForMode,
} from './lib/triage.mjs';
import { CORE_VOTING_ROLES, LITE_VOTING_ROLES } from './lib/roles.mjs';

function sessionDir() {
  const dir = mkdtempSync(join(tmpdir(), 'congress-triage-'));
  writeFileSync(join(dir, 'BRIEF.md'), '# Brief\n\n## Question\nЗапуск маркетинговой кампании релиза\n');
  writeFileSync(join(dir, 'assumptions.yaml'), 'topic: test\n');
  mkdirSync(join(dir, 'deliberation'), { recursive: true });
  writeFileSync(join(dir, 'deliberation', 'state.json'), '{}');
  return dir;
}

describe('triage', () => {
  test('set and read commission_mode', () => {
    const dir = sessionDir();
    setCommissionMode(dir, 'lite');
    assert.equal(getCommissionMode(dir), 'lite');
    assert.deepEqual(getActiveCoreRoles(dir), LITE_VOTING_ROLES);
  });

  test('full mode uses 8 roles', () => {
    const dir = sessionDir();
    setCommissionMode(dir, 'full');
    assert.deepEqual(getActiveCoreRoles(dir), CORE_VOTING_ROLES);
  });

  test('suggest mode from brief', () => {
    const dir = sessionDir();
    const s = suggestCommissionMode(dir);
    assert.ok(['full', 'lite'].includes(s.suggested));
  });

  test('min swarm turns by mode', () => {
    assert.equal(minSwarmTurnsForMode('lite'), 1);
    assert.equal(minSwarmTurnsForMode('full'), 3);
  });
});
