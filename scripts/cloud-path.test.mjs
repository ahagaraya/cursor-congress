import { test, describe } from 'node:test';
import assert from 'node:assert';
import { isCloudSyncedPath, cloudPathWarning } from './lib/cloud-path.mjs';

describe('cloud-path', () => {
  test('detects iCloud paths', () => {
    assert.equal(isCloudSyncedPath('/Users/me/Library/Mobile Documents/com~apple~CloudDocs/NEEDS'), true);
  });

  test('detects Dropbox paths', () => {
    assert.equal(isCloudSyncedPath('/Users/me/Dropbox/projects'), true);
  });

  test('ignores normal paths', () => {
    assert.equal(isCloudSyncedPath('/Applications/Programs/NEEDS'), false);
  });

  test('cloudPathWarning returns message for cloud paths', () => {
    const w = cloudPathWarning('/Users/me/Dropbox/foo');
    assert.ok(w);
    assert.match(w, /облачн/i);
  });

  test('cloudPathWarning null for local paths', () => {
    assert.equal(cloudPathWarning('/tmp/congress'), null);
  });
});
