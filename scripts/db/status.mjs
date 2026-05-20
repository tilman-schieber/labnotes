import { closeMigrationResources, getMigrationStatus } from '../../server/lib/migrations.mjs';
import { getTargetEnvironment, requireDatabaseUrl } from './_shared.mjs';

process.env.DATABASE_URL = requireDatabaseUrl(getTargetEnvironment());

try {
  const status = await getMigrationStatus();
  status.forEach((migration) => {
    console.log(`${migration.applied ? 'up' : 'pending'} ${migration.version}`);
  });
} finally {
  await closeMigrationResources();
}
