import { Pool } from 'pg';

export function createPostgresDriver(connectionString) {
  const pool = new Pool({ connectionString });

  return {
    dialect: 'postgres',
    getPool: () => pool,
    query: (text, params = []) => pool.query(text, params),
    async withTransaction(callback) {
      const client = await pool.connect();

      try {
        await client.query('begin');
        const result = await callback({
          query: (text, params = []) => client.query(text, params),
          // Multi-statement scripts (migration files); pg runs them in one round trip.
          exec: (text) => client.query(text)
        });
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end()
  };
}
