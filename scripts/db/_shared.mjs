import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

export function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

export function getTargetEnvironment() {
  return getArgValue('--env') ?? process.env.DB_ENV ?? 'default';
}

export function resolveDatabaseUrl(kind = getTargetEnvironment()) {
  if (kind === 'dev') {
    return process.env.DEV_DATABASE_URL ?? process.env.DATABASE_URL ?? null;
  }

  if (kind === 'prod') {
    return process.env.PROD_DATABASE_URL ?? process.env.DATABASE_URL ?? null;
  }

  return process.env.DATABASE_URL ?? null;
}

export function requireDatabaseUrl(kind = getTargetEnvironment()) {
  const value = resolveDatabaseUrl(kind);
  if (!value) {
    throw new Error(`Missing database URL for environment '${kind}'`);
  }

  return value;
}

export async function runCommand(command, args, extraEnv = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      env: { ...process.env, ...extraEnv }
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code ?? 'unknown'}`));
    });
    child.on('error', reject);
  });
}

export async function makeTempDumpPath() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'labnotes-db-'));
  return path.join(directory, 'sync.dump');
}
