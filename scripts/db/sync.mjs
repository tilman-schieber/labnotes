import { getArgValue, makeTempDumpPath, requireDatabaseUrl, runCommand } from './_shared.mjs';

const sourceEnv = getArgValue('--source') ?? 'prod';
const targetEnv = getArgValue('--target') ?? 'dev';
const sourceUrl = requireDatabaseUrl(sourceEnv);
const targetUrl = requireDatabaseUrl(targetEnv);
const dumpPath = await makeTempDumpPath();

await runCommand('pg_dump', ['--format=custom', '--no-owner', '--file', dumpPath, sourceUrl]);
await runCommand('pg_restore', ['--clean', '--if-exists', '--no-owner', '--dbname', targetUrl, dumpPath]);
console.log(`Synchronized ${sourceEnv} into ${targetEnv}`);
