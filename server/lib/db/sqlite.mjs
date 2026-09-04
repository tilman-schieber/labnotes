import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { translateSql } from './translate.mjs';

// pg parses jsonb columns into objects and returns booleans; SQLite hands back
// strings and 0/1, so rows are normalised by column name on the way out.
const JSON_COLUMNS = new Set(['content', 'metadata', 'attributes', 'quantities', 'aliases']);
const BOOLEAN_COLUMNS = new Set(['signed', 'unchanged', 'isDocument', 'usedInContext']);

export function resolveSqlitePath(url) {
  const location = url.replace(/^sqlite:\/\//, '').replace(/^sqlite:/, '') || 'data/labnotes.db';
  return location === ':memory:' ? location : path.resolve(location);
}

function reviveRow(row) {
  const revived = {};
  for (const [key, value] of Object.entries(row)) {
    if (JSON_COLUMNS.has(key) && typeof value === 'string') {
      try {
        revived[key] = JSON.parse(value);
        continue;
      } catch {
        // Not JSON after all; keep the raw value.
      }
    }
    if (BOOLEAN_COLUMNS.has(key) && (value === 0 || value === 1)) {
      revived[key] = value === 1;
      continue;
    }
    revived[key] = value;
  }
  return revived;
}

export function createSqliteDriver(url) {
  const location = resolveSqlitePath(url);
  if (location !== ':memory:') {
    mkdirSync(path.dirname(location), { recursive: true });
  }

  const database = new DatabaseSync(location);
  database.exec('pragma foreign_keys = on');
  if (location !== ':memory:') {
    database.exec('pragma journal_mode = wal');
  }

  const translated = new Map();
  const translate = (text) => {
    let entry = translated.get(text);
    if (!entry) {
      entry = translateSql(text);
      translated.set(text, entry);
    }
    return entry;
  };

  const run = (text, params) => {
    const { sql, mapParams } = translate(text);
    const statement = database.prepare(sql);

    if (/^\s*(select|with|pragma)\b/i.test(sql) || /\breturning\b/i.test(sql)) {
      const rows = statement.all(...mapParams(params)).map(reviveRow);
      return { rows, rowCount: rows.length };
    }

    const info = statement.run(...mapParams(params));
    return { rows: [], rowCount: Number(info.changes) };
  };

  // Statements are synchronous, but callers await between them, so without a lock a
  // concurrent request's statements would land inside another request's open transaction.
  let chain = Promise.resolve();
  const locked = (task) => {
    const result = chain.then(task, task);
    chain = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };

  const transactionClient = {
    query: async (text, params = []) => run(text, params),
    exec: async (text) => database.exec(text)
  };
  const lockedClient = { query: (text, params = []) => locked(() => run(text, params)) };

  return {
    dialect: 'sqlite',
    getPool: () => lockedClient,
    query: (text, params = []) => locked(() => run(text, params)),
    withTransaction: (callback) =>
      locked(async () => {
        database.exec('begin immediate');
        try {
          const result = await callback(transactionClient);
          database.exec('commit');
          return result;
        } catch (error) {
          database.exec('rollback');
          throw error;
        }
      }),
    close: async () => database.close()
  };
}
