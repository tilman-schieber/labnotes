import { createFragments } from './db/fragments.mjs';
import { createPostgresDriver } from './db/postgres.mjs';
import { createSqliteDriver } from './db/sqlite.mjs';

let driver;

export function getDatabaseUrl() {
  return process.env.DATABASE_URL ?? 'postgres://localhost:5432/labnotes';
}

// sqlite is selected by URL shape: `sqlite:notes.db`, `sqlite::memory:`, `:memory:`,
// or a bare path ending in .db/.sqlite/.sqlite3. Everything else is postgres.
export function getDialect(url = getDatabaseUrl()) {
  if (url.startsWith('sqlite:') || url === ':memory:' || /\.(db|sqlite3?)$/i.test(url)) {
    return 'sqlite';
  }
  return 'postgres';
}

// Resolved lazily: the db scripts set DATABASE_URL after importing this module.
function getDriver() {
  if (!driver) {
    const url = getDatabaseUrl();
    driver = getDialect(url) === 'sqlite' ? createSqliteDriver(url) : createPostgresDriver(url);
  }
  return driver;
}

// Dialect-specific fragments for the few queries that cannot be written portably.
export const sql = createFragments(getDialect);

export function getPool() {
  return getDriver().getPool();
}

export function query(text, params = []) {
  return getDriver().query(text, params);
}

export function withTransaction(callback) {
  return getDriver().withTransaction(callback);
}

export async function closePool() {
  if (!driver) {
    return;
  }

  const current = driver;
  driver = undefined;
  await current.close();
}
