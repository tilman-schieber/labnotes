import { getArgValue, requirePostgresUrl, runCommand } from './_shared.mjs';

const inputPath = getArgValue('--input');
if (!inputPath) {
  throw new Error('Missing --input <dump-file>');
}

const databaseUrl = requirePostgresUrl();
await runCommand('pg_restore', ['--clean', '--if-exists', '--no-owner', '--dbname', databaseUrl, inputPath]);
console.log(`Database restored from ${inputPath}`);
