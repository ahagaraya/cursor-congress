import { test, describe, before } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const congressRoot = mkdtempSync(join(tmpdir(), 'congress-indicator-'));
process.env.CONGRESS_ACTIVE_PATH = join(congressRoot, '.active-session.json');
process.env.CONGRESS_ACTIVE_MD_PATH = join(congressRoot, 'ACTIVE.congress.md');

const { setActive, loadActive, clearActive, formatStatusLine, syncActiveFromSession } = await import(
  './lib/active-indicator.mjs'
);

function makeSession(slug, state) {
  const session = join(congressRoot, 'sessions', slug);
  mkdirSync(join(session, 'deliberation'), { recursive: true });
  writeFileSync(join(session, 'BRIEF.md'), `# Brief\n\n## Question\nTest ${slug}\n`);
  writeFileSync(join(session, 'assumptions.yaml'), 'commission_mode: lite\n');
  writeFileSync(join(session, 'deliberation', 'state.json'), JSON.stringify(state));
  return session;
}

describe('active-indicator', () => {
  before(() => clearActive());

  test('setActive writes marker and markdown', () => {
    const session = makeSession('2026-test', { phase: 'swarm', status: 'running', mode: 'swarm' });
    setActive(session);
    const active = loadActive();
    assert.equal(active.active, true);
    assert.equal(active.slug, '2026-test');
    assert.equal(active.phase, 'swarm');
    assert.equal(active.mode, 'lite');
    assert.ok(existsSync(process.env.CONGRESS_ACTIVE_MD_PATH));
    assert.match(readFileSync(process.env.CONGRESS_ACTIVE_MD_PATH, 'utf8'), /Congress — активная сессия/);

    const line = formatStatusLine(active, {
      model: { display_name: 'Opus' },
      context_window: { used_percentage: 12 },
    });
    assert.match(line, /⚖️ Congress/);
    assert.match(line, /swarm/);
  });

  test('formatStatusLine falls back to model when inactive', () => {
    clearActive();
    const line = formatStatusLine(null, {
      model: { display_name: 'Opus' },
      context_window: { used_percentage: 42 },
    });
    assert.match(line, /Opus/);
    assert.match(line, /42%/);
  });

  test('syncActiveFromSession clears on complete', () => {
    const session = makeSession('done-test', { phase: 'complete', status: 'completed' });
    setActive(session);
    assert.ok(loadActive());
    syncActiveFromSession(session);
    assert.equal(loadActive(), null);
  });
});
