import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeAnalytics, syncBatchAnalytics } from './analytics.mjs';

test('merging replaces one document\'s entries and keeps the others', () => {
  const existing = [{ documentId: 'd1', entries: [{ id: 'a' }] }, { documentId: 'd2', entries: [{ id: 'b' }] }];
  assert.deepEqual(mergeAnalytics(existing, 'd1', [{ id: 'c' }]), [{ documentId: 'd2', entries: [{ id: 'b' }] }, { documentId: 'd1', entries: [{ id: 'c' }] }]);
  assert.deepEqual(mergeAnalytics(existing, 'd1', []), [{ documentId: 'd2', entries: [{ id: 'b' }] }]);
  assert.deepEqual(mergeAnalytics(undefined, 'd1', [{ id: 'c' }]), [{ documentId: 'd1', entries: [{ id: 'c' }] }]);
});

test('sync writes the mirror for described batches and clears batches no longer described', async () => {
  const rows = { b1: { analytics: [{ documentId: 'd1', entries: [{ id: 'old' }] }] }, b2: { analytics: [{ documentId: 'd1', entries: [{ id: 'gone' }] }] } };
  const writes = [];
  const client = {
    async query(sql, params) {
      if (sql.includes("attributes->>'analytics' like")) {
        return { rowCount: 2, rows: Object.entries(rows).map(([id, attributes]) => ({ id, attributes })) };
      }
      if (sql.startsWith('select attributes')) {
        const attributes = rows[params[0]];
        return attributes ? { rowCount: 1, rows: [{ attributes }] } : { rowCount: 0, rows: [] };
      }
      if (sql.startsWith('update entities')) {
        writes.push([params[0], JSON.parse(params[1]).analytics]);
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`unexpected ${sql}`);
    }
  };
  const content = { type: 'doc', content: [{ type: 'analytics', attrs: { batchId: 'b1', entries: [{ id: 'n', technique: 'TLC', result: 'ok', attachmentIds: [] }] } }, { type: 'analytics', attrs: { batchId: 'missing', entries: [] } }] };
  await syncBatchAnalytics(client, 'd1', content);
  assert.deepEqual(writes, [
    ['b1', [{ documentId: 'd1', entries: [{ id: 'n', technique: 'TLC', result: 'ok', rf: null, attachmentIds: [] }] }]],
    ['b2', []]
  ]);
});
