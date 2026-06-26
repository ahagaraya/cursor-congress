import { test, describe } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROUTER = join(__dirname, 'router.mjs');

function runRouter(...args) {
  const out = execFileSync('node', [ROUTER, ...args], { encoding: 'utf8' });
  return out.trim();
}

function setupSession() {
  const dir = mkdtempSync(join(tmpdir(), 'congress-test-'));
  mkdirSync(join(dir, 'deliberation', 'swarm', 'turns'), { recursive: true });
  writeFileSync(
    join(dir, 'deliberation', 'conflicts.json'),
    JSON.stringify({ conflicts: [{ id: 't1', topic: 'test', summary: 'a vs b' }] })
  );
  writeFileSync(join(dir, 'BRIEF.md'), '# Brief\n\n## Question\nTest');
  return dir;
}

describe('router', () => {
  test('init seeds 8 inboxes', () => {
    const session = setupSession();
    const r = JSON.parse(runRouter('init', session));
    assert.equal(r.ok, true);
    assert.equal(r.seeded, 8);
    const status = JSON.parse(runRouter('status', session));
    assert.equal(status.initialized, true);
    assert.equal(status.tick, 0);
  });

  test('active returns roles with inbox', () => {
    const session = setupSession();
    runRouter('init', session);
    const active = JSON.parse(runRouter('active', session));
    assert.equal(active.length, 4);
  });

  test('process and advance-tick', () => {
    const session = setupSession();
    runRouter('init', session);
    const turn = {
      role: 'critic',
      tick: 0,
      content: 'Test message from critic',
      route: { next: [{ to: 'architect', reason: 'structure review', priority: 'high' }] },
      confidence: 0.8,
    };
    const turnPath = join(session, 'deliberation', 'swarm', 'turns', 'critic-t0.json');
    writeFileSync(turnPath, JSON.stringify(turn));
    const proc = JSON.parse(runRouter('process', session, 'critic', turnPath));
    assert.equal(proc.ok, true);
    assert.equal(proc.tick, 0);
    const adv = JSON.parse(runRouter('advance-tick', session));
    assert.equal(adv.tick, 1);
  });

  test('rejects duplicate process without --force', () => {
    const session = setupSession();
    runRouter('init', session);
    const turn = {
      role: 'critic',
      tick: 0,
      message_id: 'msg-dup-test',
      content: 'Once',
      route: { next: [] },
      confidence: 0.8,
    };
    const turnPath = join(session, 'deliberation', 'swarm', 'turns', 'critic-t0.json');
    writeFileSync(turnPath, JSON.stringify(turn));
    runRouter('process', session, 'critic', turnPath);
    assert.throws(
      () => runRouter('process', session, 'critic', turnPath),
      /already processed/i
    );
    const forced = JSON.parse(
      execFileSync('node', [ROUTER, 'process', session, 'critic', turnPath, '--force'], {
        encoding: 'utf8',
      }).trim()
    );
    assert.equal(forced.ok, true);
  });
});
