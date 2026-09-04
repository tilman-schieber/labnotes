import assert from 'node:assert/strict';
import { test } from 'node:test';
import { translateSql } from './translate.mjs';

test('converts numbered placeholders to positional ones, repeats included', () => {
  const { sql, mapParams } = translateSql('select * from t where a = $2 or ($1 = $1 and b = $2)');
  assert.equal(sql, 'select * from t where a = ? or (? = ? and b = ?)');
  assert.deepEqual(mapParams(['one', 'two']), ['two', 'one', 'one', 'two']);
});

test('rewrites any(array) membership and JSON-encodes the parameter', () => {
  const { sql, mapParams } = translateSql('select 1 from m where m.document_id = any($1::text[])');
  assert.equal(sql, 'select 1 from m where m.document_id in (select value from json_each(?))');
  assert.deepEqual(mapParams([['a', 'b']]), ['["a","b"]']);
});

test('rewrites jsonb has-key with a literal key', () => {
  const { sql } = translateSql(`select 1 from e where e.attributes ? 'smiles'`);
  assert.equal(sql, `select 1 from e where json_extract(e.attributes, '$.smiles') is not null`);
});

test('strips casts and row locks, keeps arrow operators', () => {
  const { sql } = translateSql(`select content = $1::jsonb, count(*)::int, size_bytes::int, a->>'k' from t for update`);
  assert.equal(sql, `select content = ?, count(*), size_bytes, a->>'k' from t`);
});

test('translates now() and null-safe equality', () => {
  const { sql } = translateSql('update t set updated_at = now() where a is not distinct from $1');
  assert.equal(sql, `update t set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where a is ?`);
});

test('maps booleans and undefined for the sqlite driver', () => {
  const { mapParams } = translateSql('select $1, $2, $3');
  assert.deepEqual(mapParams([true, false, undefined]), [1, 0, null]);
});
