import { closePool, withTransaction } from '../../server/lib/database.mjs';
import { seedDatabase } from '../../server/lib/seed.mjs';
import { getTargetEnvironment, requireDatabaseUrl } from './_shared.mjs';

process.env.DATABASE_URL = requireDatabaseUrl(getTargetEnvironment());

try {
  const seeded = await withTransaction((client) => seedDatabase(client));
  console.log(seeded ? 'Database seeded' : 'Database already had content; sync refreshed');
} finally {
  await closePool();
}
