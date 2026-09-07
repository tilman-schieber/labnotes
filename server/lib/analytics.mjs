// Analytics blocks in an experiment describe a product batch; on save, the batch entity gets a
// read-only mirror of them under `attributes.analytics`, keyed by the document they came from,
// so the registry shows a batch's data wherever it is later used. Nothing else writes that key.
import { extractAnalytics } from '../../src/chemistry/analytics.ts';

// Merges the blocks of one document into what the batch already carries from other documents.
export function mergeAnalytics(existing, documentId, entries) {
  const kept = (Array.isArray(existing) ? existing : []).filter((item) => item && item.documentId !== documentId);
  return entries.length > 0 ? [...kept, { documentId, entries }] : kept;
}

export async function syncBatchAnalytics(client, documentId, content) {
  const blocks = extractAnalytics(content);
  const byBatch = new Map();
  for (const block of blocks) {
    if (!block.batchId) {
      continue;
    }
    byBatch.set(block.batchId, [...(byBatch.get(block.batchId) ?? []), ...block.entries]);
  }

  // Batches this document used to describe but no longer does are cleared too.
  const previous = await client.query(
    `select id, attributes from entities where type = 'batch' and attributes->>'analytics' like '%' || $1 || '%'`,
    [documentId]
  );
  for (const row of previous.rows) {
    if (!byBatch.has(row.id)) {
      byBatch.set(row.id, []);
    }
  }

  for (const [batchId, entries] of byBatch) {
    const result = await client.query(`select attributes from entities where id = $1 and type = 'batch'`, [batchId]);
    if (result.rowCount === 0) {
      continue;
    }
    const attributes = result.rows[0].attributes ?? {};
    const analytics = mergeAnalytics(attributes.analytics, documentId, entries);
    await client.query('update entities set attributes = $2::jsonb, updated_at = now() where id = $1', [
      batchId,
      JSON.stringify({ ...attributes, analytics })
    ]);
  }
}
