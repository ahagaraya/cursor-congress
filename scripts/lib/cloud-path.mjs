/**
 * Detect cloud-synced paths (iCloud, Dropbox, etc.) for session security warnings.
 */
const CLOUD_PATH_PATTERNS = [
  /Mobile Documents/i,
  /com~apple~CloudDocs/i,
  /iCloud/i,
  /Dropbox/i,
  /Google Drive/i,
  /OneDrive/i,
  /Box Sync/i,
];

export function isCloudSyncedPath(path) {
  const p = String(path || '');
  return CLOUD_PATH_PATTERNS.some((re) => re.test(p));
}

export function cloudPathWarning(path) {
  if (!isCloudSyncedPath(path)) return null;
  return `Путь похож на облачную синхронизацию: ${path}. См. congress/docs/security-sessions.md — не синхронизируйте sessions/`;
}
