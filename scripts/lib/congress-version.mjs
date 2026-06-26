import { readFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_JSON = join(__dirname, '..', '..', 'package.json');

let _version = null;

export function getCongressVersion() {
  if (_version) return _version;
  try {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
    _version = pkg.version || '0.0.0';
  } catch {
    _version = '0.0.0';
  }
  return _version;
}
