import { Pool } from 'pg';

let pool;

export function getDatabaseUrl() {
  return process.env.DATABASE_URL ?? 'postgres://localhost:5432/labnotes';
}

export function getPool() {
  if (!pool) {
    pool = new Pool({ connectionString: getDatabaseUrl() });
  }

  return pool;
}

export async function query(text, params = []) {
  return getPool().query(text, params);
}

export async function withTransaction(callback) {
  const client = await getPool().connect();

  try {
    await client.query('begin');
    const result = await callback(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (!pool) {
    return;
  }

  await pool.end();
  pool = undefined;
}
