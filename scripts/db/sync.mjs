import { getArgValue, makeTempDumpPath, requirePostgresUrl, runCommand } from './_shared.mjs';

const sourceEnv = getArgValue('--source') ?? 'prod';
const targetEnv = getArgValue('--target') ?? 'dev';
const sourceUrl = requirePostgresUrl(sourceEnv);
const targetUrl = requirePostgresUrl(targetEnv);
const dumpPath = await makeTempDumpPath();

await runCommand('pg_dump', ['--format=custom', '--no-owner', '--file', dumpPath, sourceUrl]);
await runCommand('pg_restore', ['--clean', '--if-exists', '--no-owner', '--dbname', targetUrl, dumpPath]);
console.log(`Synchronized ${sourceEnv} into ${targetEnv}`);
