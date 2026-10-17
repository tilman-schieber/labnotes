// Loads (or removes) the demo fixtures: a lab with a synthesis and a microbiology project,
// written as the app wants to be used, plus the registry behind it.
//
//   npm run db:fixtures              load the demo set, replacing a previous copy
//   npm run db:fixtures -- --keep    load only if it is not there yet
//   npm run db:fixtures -- --remove  take it out again
import { closePool, withTransaction } from '../../server/lib/database.mjs';
import { demoFixtures } from '../../server/lib/fixtures/demo.mjs';
import { loadFixtures, removeFixtures } from '../../server/lib/fixtures/load.mjs';
import { getTargetEnvironment, requireDatabaseUrl } from './_shared.mjs';

process.env.DATABASE_URL = requireDatabaseUrl(getTargetEnvironment());
const remove = process.argv.includes('--remove');
const keep = process.argv.includes('--keep');

try {
  if (remove) {
    await withTransaction((client) => removeFixtures(client, 'demo'));
    console.log('Demo fixtures removed');
  } else {
    const result = await withTransaction((client) => loadFixtures(client, demoFixtures(), { reset: !keep }));
    console.log(result.loaded ? `Demo fixtures loaded: ${result.documents} documents, ${result.entities} entities` : 'Demo fixtures already present (use without --keep to replace them)');
  }
} finally {
  await closePool();
}
