import { runMigrations, closeMigrationResources } from '../../server/lib/migrations.mjs';
import { getTargetEnvironment, requireDatabaseUrl } from './_shared.mjs';

process.env.DATABASE_URL = requireDatabaseUrl(getTargetEnvironment());

try {
  await runMigrations();
  console.log('Migrations applied successfully');
} finally {
  await closeMigrationResources();
}
