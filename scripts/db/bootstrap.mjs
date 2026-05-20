import { runMigrations, closeMigrationResources } from '../../server/lib/migrations.mjs';
import { closePool, withTransaction } from '../../server/lib/database.mjs';
import { seedDatabase } from '../../server/lib/seed.mjs';
import { getTargetEnvironment, requireDatabaseUrl } from './_shared.mjs';

process.env.DATABASE_URL = requireDatabaseUrl(getTargetEnvironment());

try {
  await runMigrations();
  const seeded = await withTransaction((client) => seedDatabase(client));
  console.log(seeded ? 'Database bootstrapped with seed data' : 'Database bootstrapped and already populated');
} finally {
  await closeMigrationResources();
  await closePool();
}
