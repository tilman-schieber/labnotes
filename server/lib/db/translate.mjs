// Rewrites the Postgres-flavoured SQL the server is written in into SQLite SQL.
// Only the constructs actually used in this codebase are translated; queries that
// differ structurally between the dialects live behind `sql` fragments instead
// (see fragments.mjs).

export function translateSql(text) {
  const jsonArrayParams = new Set();
  let sql = text;

  // `= any($N::text[])` with an array parameter -> membership over a JSON array.
  sql = sql.replace(/=\s*any\(\$(\d+)::text\[\]\)/gi, (_match, n) => {
    jsonArrayParams.add(Number(n));
    return `in (select value from json_each($${n}))`;
  });

  // jsonb "has key" with a literal key: `attributes ? 'smiles'`.
  sql = sql.replace(/([\w.]+)\s+\?\s+'([^']+)'/g, (_match, column, key) => `json_extract(${column}, '$.${key}') is not null`);

  // Casts are advisory under SQLite's type affinity.
  sql = sql.replace(/::(jsonb|text\[\]|text|int|bigint|numeric)\b/g, '');

  // SQLite's `is` is null-safe equality.
  sql = sql.replace(/\bis not distinct from\b/gi, 'is');

  // Match the ISO-8601 UTC format pg serialises timestamptz to in JSON. Default
  // expressions must be parenthesised in SQLite DDL.
  sql = sql.replace(/\bdefault now\(\)/gi, `default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);
  sql = sql.replace(/\bnow\(\)/gi, `strftime('%Y-%m-%dT%H:%M:%fZ','now')`);

  // Row locks are meaningless with a single-writer database file.
  sql = sql.replace(/\s+for update\b/gi, '');

  // $N -> positional ?, in order of appearance; the same $N may appear several times.
  const order = [];
  sql = sql.replace(/\$(\d+)/g, (_match, n) => {
    order.push(Number(n));
    return '?';
  });

  const mapParams = (params = []) =>
    order.map((n) => {
      const value = params[n - 1];
      if (jsonArrayParams.has(n)) {
        return JSON.stringify(value ?? []);
      }
      if (value === undefined) {
        return null;
      }
      if (typeof value === 'boolean') {
        return value ? 1 : 0;
      }
      return value;
    });

  return { sql, mapParams };
}
