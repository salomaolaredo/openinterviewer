/**
 * Database client singleton.
 *
 * Uses postgres.js (postgres package) with Drizzle ORM. Works seamlessly with:
 * - Local Docker Postgres (dev)
 * - Neon serverless Postgres (production on Vercel)
 * - Any standard Postgres instance
 *
 * postgres.js supports transactions natively via Drizzle's db.transaction() API,
 * which we use in interviews/save to atomically write the interview row + batch
 * INSERT all turns.
 *
 * Environment:
 * - Local dev: DATABASE_URL=postgres://noema:noema_dev@localhost:5432/noema_research
 *   (see docker-compose.yml)
 * - Production: DATABASE_URL=<Neon pooled connection string with ?sslmode=require>
 *
 * NOTE: The client is lazy — it is only instantiated on first access. This
 * allows Next.js to statically analyze / collect page data at build time
 * without DATABASE_URL being set. The error is thrown only when a request
 * actually touches the db.
 */

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

type SqlClient = ReturnType<typeof postgres>;
type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as {
  __noemaSqlClient: SqlClient | undefined;
  __noemaDrizzleDb: DrizzleDb | undefined;
};

function createClient(): SqlClient {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env.local and configure it, ' +
        'or run `npm run db:up` to start the local Docker Postgres.'
    );
  }
  // `max: 1` for serverless (each function instance has its own pool of 1).
  // `prepare: false` is required for connection pooling proxies (Neon pooler, pgBouncer).
  return postgres(process.env.DATABASE_URL, {
    max: process.env.NODE_ENV === 'production' ? 1 : 10,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
  });
}

function getSqlClient(): SqlClient {
  if (globalForDb.__noemaSqlClient) return globalForDb.__noemaSqlClient;
  const client = createClient();
  if (process.env.NODE_ENV !== 'production') {
    globalForDb.__noemaSqlClient = client;
  } else {
    globalForDb.__noemaSqlClient = client;
  }
  return client;
}

function getDb(): DrizzleDb {
  if (globalForDb.__noemaDrizzleDb) return globalForDb.__noemaDrizzleDb;
  const instance = drizzle(getSqlClient(), { schema });
  globalForDb.__noemaDrizzleDb = instance;
  return instance;
}

// Proxy so every property access goes through getDb().
// This keeps the `import { db } from ...` ergonomics at call sites while
// deferring actual client creation until the first real use.
export const db: DrizzleDb = new Proxy({} as DrizzleDb, {
  get(_target, prop, receiver) {
    const target = getDb() as unknown as Record<string | symbol, unknown>;
    const value = target[prop as string];
    if (typeof value === 'function') {
      return (value as (...args: unknown[]) => unknown).bind(target);
    }
    return value;
  },
});

export { schema };

// For legacy / edge cases that need the raw postgres client
export function sqlClient(): SqlClient {
  return getSqlClient();
}
