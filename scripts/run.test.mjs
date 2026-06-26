import { test, describe } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  checkPhase,
  detectCompletedPhases,
  nextIncompletePhase,
  markPhase,
  loadState,
} from './lib/session-state.mjs';
import { getPhaseManifest, formatManifestForChair, allPhasesOrdered } from './lib/context-manifest.mjs';

function minimalSession() {
  const dir = mkdtempSync(join(tmpdir(), 'congress-run-test-'));
  writeFileSync(
    join(dir, 'BRIEF.md'),
    '# Brief\n\n## Question\nTest question\n\n## Context\nFilled\n'
  );
  writeFileSync(join(dir, 'assumptions.yaml'), 'skip_intake: true\nskip_intake_reason: test\ncommission_mode: full\n');
  mkdirSync(join(dir, 'deliberation', 'swarm', 'turns'), { recursive: true });
  mkdirSync(join(dir, 'opinions'), { recursive: true });
  mkdirSync(join(dir, 'research', 'requests'), { recursive: true });
  mkdirSync(join(dir, 'research', 'findings'), { recursive: true });
  writeFileSync(join(dir, 'deliberation', 'state.json'), '{"completed_phases":[],"phase":"setup","mode":"swarm"}');
  return dir;
}

describe('context-manifest', () => {
  test('loads phases in order', () => {
    const phases = allPhasesOrdered();
    assert.ok(phases.length >= 10);
    assert.equal(phases[0].id, 'setup');
    assert.equal(phases[phases.length - 1].id, 'validate');
  });

  test('formatManifestForChair includes reads', () => {
    const text = formatManifestForChair('r1', { slug: 'test', tick: 0 });
    assert.match(text, /Round 1/);
    assert.match(text, /opinions/);
  });
});

describe('session-state', () => {
  test('detects setup and intake skip', () => {
    const session = minimalSession();
    const completed = detectCompletedPhases(session, { skipIntake: true });
    assert.ok(completed.includes('setup'));
    assert.ok(completed.includes('intake'));
    assert.ok(completed.includes('brief'));
  });

  test('next phase after brief is r1', () => {
    const session = minimalSession();
    const next = nextIncompletePhase(session, { skipIntake: true });
    assert.equal(next, 'r1');
  });

  test('markPhase updates state', () => {
    const session = minimalSession();
    markPhase(session, 'brief');
    const state = loadState(session);
    assert.ok(state.completed_phases.includes('brief'));
  });
});
