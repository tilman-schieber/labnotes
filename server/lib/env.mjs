// Loading .env here rather than requiring every launcher to export it first: the dev workflow is
// `npm run dev:server`, and a missing DATABASE_URL fails late, as a Postgres role error.
// Import this before anything that reads process.env at module level.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Later files do not overwrite earlier ones, and neither overwrites the real environment,
// so `DATABASE_URL=... npm run dev:server` and CI still win over the file.
for (const name of ['.env.local', '.env']) {
  const file = path.join(root, name);
  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
}

export const envRoot = root;
