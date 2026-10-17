import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

// The demo dataset is loaded into an in-memory SQLite database and checked the way the app
// reads it back: numbered experiments, derived usages, results and relations, revisions.
process.env.DATABASE_URL = 'sqlite::memory:';
const { runMigrations } = await import('../migrations.mjs');
const { closePool, query, withTransaction } = await import('../database.mjs');
const { demoFixtures } = await import('./demo.mjs');
const { hasFixtures, loadFixtures, removeFixtures } = await import('./load.mjs');

before(async () => {
  await runMigrations();
  await withTransaction((client) => loadFixtures(client, demoFixtures()));
});

after(async () => {
  await closePool();
});

const count = async (sql, params = []) => Number((await query(sql, params)).rows[0].count);

test('documents are numbered per project and carry the fixture marker', async () => {
  const rows = (await query(`select title, kind, metadata from documents where metadata ->> 'fixture' = 'demo' order by created_at, title`)).rows;
  assert.equal(rows.length, 7);
  const experiments = rows.filter((row) => row.kind === 'experiment').map((row) => [row.title, row.metadata.number]);
  assert.deepEqual(experiments.sort(), [
    ['Aspirin from salicylic acid', 2],
    ['Fischer esterification of benzoic acid', 1],
    ['Growth curve of BL21(DE3) pET-28a in LB', 2],
    ['Kanamycin MIC of BL21(DE3) with and without pET-28a', 1]
  ]);
  assert.equal(await count(`select count(*) as count from document_revisions`), 7);
});

test('the registry is filled and mirrored', async () => {
  assert.ok((await count(`select count(*) as count from entities where attributes ->> 'fixture' = 'demo'`)) >= 24);
  assert.equal(await count(`select count(*) as count from entities where type = 'document' and document_id like '%demo%'`), 7);
  assert.equal(await count(`select count(*) as count from templates where id like 'template-demo-%'`), 1);
  assert.equal(await count(`select count(*) as count from entity_aliases where alias = 'MeOH'`), 1);
});

test('usages, results and relations are derived from the prose and the blocks', async () => {
  const usages = (await query(`select label, role from document_usages where document_id = 'experiment-demo-fischer'`)).rows;
  assert.ok(usages.some((usage) => usage.label === 'Benzoic acid'), 'benzoic acid is a usage');
  assert.ok(usages.some((usage) => usage.label === 'Methyl benzoate' && usage.role === 'product'), 'the product role is read from "gave"');

  const results = (await query(`select label, measure, value, source from document_results order by document_id, block_index`)).rows;
  assert.ok(results.some((result) => result.label === 'E. coli BL21(DE3)' && result.measure === 'MIC' && Number(result.value) === 4), 'MIC from prose');
  assert.ok(results.some((result) => result.source === 'plate' && result.measure === 'OD600'), 'plate means');
  assert.ok(results.some((result) => result.source === 'block' && result.measure === 'OD600 6 h' && Number(result.value) === 1.6), 'results block');
  assert.ok(results.some((result) => result.measure === 'Doubling time' && Number(result.value) === 32), 'doubling time from prose');

  const relations = (await query(`select s.label as subject, r.predicate, o.label as object, r.confidence from entity_relations r join entities s on s.id = r.subject_entity_id join entities o on o.id = r.object_entity_id`)).rows;
  const pair = (subject, predicate, object) => relations.some((row) => row.subject === subject && row.predicate === predicate && row.object === object);
  assert.ok(pair('Box 3', 'stored_in', 'Freezer F2'), 'hand-made place');
  assert.ok(pair('Tube 14', 'stored_in', 'Box 3') && pair('Tube 15', 'stored_in', 'Box 3'), 'places read from "stored #A and #B in #C"');
  assert.ok(pair('Tube 14', 'derived_from', 'BL21(DE3) pET-28a'), 'aliquots derived from the culture');
  assert.ok(pair('Flask 1', 'derived_from', 'BL21(DE3) pET-28a'), 'transfer into the flask');
  assert.ok(pair('Kanamycin stock', 'stored_in', 'Freezer F2'), 'put back into the freezer');
  assert.ok(pair('DR-001-A', 'belongs_to', 'Methyl benzoate'), 'the batch belongs to its compound');
});

test('loading again replaces the dataset, removing clears it', async () => {
  await withTransaction((client) => loadFixtures(client, demoFixtures()));
  assert.equal(await count(`select count(*) as count from documents where metadata ->> 'fixture' = 'demo'`), 7);
  await withTransaction(async (client) => {
    assert.equal((await loadFixtures(client, demoFixtures(), { reset: false })).loaded, false, 'without reset an existing dataset is left alone');
    await removeFixtures(client, 'demo');
    assert.equal(await hasFixtures(client, 'demo'), false);
  });
  assert.equal(await count(`select count(*) as count from documents where metadata ->> 'fixture' = 'demo'`), 0);
  assert.equal(await count(`select count(*) as count from entities where attributes ->> 'fixture' = 'demo'`), 0);
  assert.equal(await count(`select count(*) as count from document_results`), 0, 'derived rows went with the documents');
});
