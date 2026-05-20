import { getArgValue, requireDatabaseUrl, runCommand } from './_shared.mjs';

const outputPath = getArgValue('--output') ?? 'labnotes.dump';
const databaseUrl = requireDatabaseUrl();

await runCommand('pg_dump', ['--format=custom', '--no-owner', '--file', outputPath, databaseUrl]);
console.log(`Database dump written to ${outputPath}`);
