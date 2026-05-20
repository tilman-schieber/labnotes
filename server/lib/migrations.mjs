import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool, getPool, withTransaction } from './database.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

async function ensureMigrationsTable(client) {
  await client.query(`
    create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )
  `);
}

async function getMigrationFiles() {
  const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort();
}

export async function getMigrationStatus() {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await ensureMigrationsTable(client);
    const files = await getMigrationFiles();
    const appliedResult = await client.query('select version from schema_migrations order by version');
    const applied = new Set(appliedResult.rows.map((row) => row.version));

    return files.map((file) => ({
      version: file,
      applied: applied.has(file)
    }));
  } finally {
    client.release();
  }
}

export async function runMigrations() {
  const files = await getMigrationFiles();

  await withTransaction(async (client) => {
    await ensureMigrationsTable(client);
    const appliedResult = await client.query('select version from schema_migrations');
    const applied = new Set(appliedResult.rows.map((row) => row.version));

    for (const file of files) {
      if (applied.has(file)) {
        continue;
      }

      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      await client.query(sql);
      await client.query('insert into schema_migrations (version) values ($1)', [file]);
    }
  });
}

export async function closeMigrationResources() {
  await closePool();
}
