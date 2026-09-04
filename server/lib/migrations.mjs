import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool, getDialect, query, withTransaction } from './database.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Each dialect keeps its own migration files; versions are the filenames.
function migrationsDir() {
  return path.resolve(__dirname, '../../db/migrations', getDialect());
}

const ENSURE_MIGRATIONS_TABLE = `
  create table if not exists schema_migrations (
    version text primary key,
    applied_at timestamptz not null default now()
  )
`;

async function getMigrationFiles() {
  const entries = await readdir(migrationsDir(), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort();
}

export async function getMigrationStatus() {
  await query(ENSURE_MIGRATIONS_TABLE);
  const files = await getMigrationFiles();
  const appliedResult = await query('select version from schema_migrations order by version');
  const applied = new Set(appliedResult.rows.map((row) => row.version));

  return files.map((file) => ({
    version: file,
    applied: applied.has(file)
  }));
}

export async function runMigrations() {
  const files = await getMigrationFiles();
  const contents = new Map();
  for (const file of files) {
    contents.set(file, await readFile(path.join(migrationsDir(), file), 'utf8'));
  }

  await withTransaction(async (client) => {
    if (getDialect() === 'postgres') {
      // Serialise concurrent starters (e.g. two server processes) so only one applies a
      // migration. SQLite's `begin immediate` write lock already does this.
      await client.query('select pg_advisory_xact_lock(hashtext($1))', ['labnotes:migrations']);
    }
    await client.query(ENSURE_MIGRATIONS_TABLE);
    const appliedResult = await client.query('select version from schema_migrations');
    const applied = new Set(appliedResult.rows.map((row) => row.version));

    for (const file of files) {
      if (applied.has(file)) {
        continue;
      }

      await client.exec(contents.get(file));
      await client.query('insert into schema_migrations (version) values ($1)', [file]);
    }
  });
}

export async function closeMigrationResources() {
  await closePool();
}
