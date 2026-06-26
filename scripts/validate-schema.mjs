#!/usr/bin/env node
/**
 * CLI — JSON schema validation for Congress session artifacts.
 *
 * Usage:
 *   node congress/scripts/validate-schema.mjs <session-dir> [--json] [--opinions-only] [--turns-only]
 */
import { resolve } from 'path';
import { validateSessionSchemas } from './lib/validate-schema.mjs';

function main() {
  const session = process.argv[2];
  const json = process.argv.includes('--json');
  if (!session) {
    console.error(
      'Usage: node congress/scripts/validate-schema.mjs <session-dir> [--json] [--opinions-only] [--turns-only]'
    );
    process.exit(1);
  }
  const opinionsOnly = process.argv.includes('--opinions-only');
  const turnsOnly = process.argv.includes('--turns-only');
  const result = validateSessionSchemas(session, {
    opinions: !turnsOnly,
    turns: !opinionsOnly,
  });
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`\nCongress schema validate — ${resolve(session)}`);
    console.log(`Opinions: ${result.opinions_checked} | Turns: ${result.turns_checked}`);
    if (result.ok) {
      console.log('✅ Schemas OK');
    } else {
      console.log('❌ Schema errors:');
      for (const e of result.errors) {
        console.log(`  • ${e.file}: ${e.message}`);
      }
    }
  }
  process.exit(result.ok ? 0 : 1);
}

main();
