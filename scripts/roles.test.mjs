import { test, describe } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  CORE_VOTING_ROLES,
  OPTIONAL_VOTING_ROLES,
  detectOptionalRolesFromText,
  getInvokedOptionalRoles,
  mergeSwarmRoles,
} from './lib/roles.mjs';

describe('roles', () => {
  test('core has 8 roles', () => {
    assert.equal(CORE_VOTING_ROLES.length, 8);
  });

  test('detects economist from brief text', () => {
    const found = detectOptionalRolesFromText('Нужна юнит-экономика и окупаемость');
    assert.ok(found.some((f) => f.role === 'economist'));
  });

  test('detects marketer from brief', () => {
    const found = detectOptionalRolesFromText('План маркетинговой кампании в TikTok');
    assert.ok(found.some((f) => f.role === 'marketer'));
  });

  test('optional_roles from assumptions yaml', () => {
    const dir = mkdtempSync(join(tmpdir(), 'congress-roles-'));
    writeFileSync(join(dir, 'BRIEF.md'), '# Brief\n\n## Question\nTest\n');
    writeFileSync(join(dir, 'assumptions.yaml'), 'optional_roles: [product-manager]\n');
    mkdirSync(join(dir, 'deliberation'), { recursive: true });
    writeFileSync(join(dir, 'deliberation', 'state.json'), '{}');
    const invoked = getInvokedOptionalRoles(dir);
    assert.deepEqual(invoked, ['product-manager']);
  });

  test('optional_roles_skip blocks auto detect', () => {
    const dir = mkdtempSync(join(tmpdir(), 'congress-roles-'));
    writeFileSync(join(dir, 'BRIEF.md'), '# Brief\n\nМаркетинг и продвижение релиза\n');
    writeFileSync(join(dir, 'assumptions.yaml'), 'optional_roles_skip: [marketer]\n');
    mkdirSync(join(dir, 'deliberation'), { recursive: true });
    writeFileSync(join(dir, 'deliberation', 'state.json'), '{}');
    const invoked = getInvokedOptionalRoles(dir);
    assert.ok(!invoked.includes('marketer'));
  });

  test('mergeSwarmRoles keeps core', () => {
    const r = mergeSwarmRoles(CORE_VOTING_ROLES, ['economist']);
    assert.equal(r.length, 9);
    assert.ok(r.includes('economist'));
    for (const c of CORE_VOTING_ROLES) assert.ok(r.includes(c));
  });

  test('optional voting roles list', () => {
    assert.deepEqual(OPTIONAL_VOTING_ROLES, ['economist', 'marketer', 'product-manager']);
  });
});
