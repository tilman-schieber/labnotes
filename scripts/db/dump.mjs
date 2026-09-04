import { getArgValue, requirePostgresUrl, runCommand } from './_shared.mjs';

const outputPath = getArgValue('--output') ?? 'labnotes.dump';
const databaseUrl = requirePostgresUrl();

await runCommand('pg_dump', ['--format=custom', '--no-owner', '--file', outputPath, databaseUrl]);
console.log(`Database dump written to ${outputPath}`);
