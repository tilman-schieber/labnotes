// Re-derives mentions, usages and results for every document from its content. Run after a
// change to the recognisers (src/chemistry/usages.ts, results.ts) so old entries catch up.
import { withTransaction, closePool } from '../../server/lib/database.mjs';
import { syncAllDocumentMentions } from '../../server/lib/mentions.mjs';
import { getTargetEnvironment, requireDatabaseUrl } from './_shared.mjs';

process.env.DATABASE_URL = requireDatabaseUrl(getTargetEnvironment());

try {
  await withTransaction(async (client) => {
    await syncAllDocumentMentions(client);
  });
  console.log('Reindexed every document');
} finally {
  await closePool();
}
