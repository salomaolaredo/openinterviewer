import { defineConfig } from 'drizzle-kit';

// Next.js loads .env.local for the app, but drizzle-kit is a standalone CLI.
// Load .env.local manually without depending on dotenv.
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
for (const file of ['.env.local', '.env']) {
  const p = resolve(process.cwd(), file);
  if (existsSync(p)) {
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and configure.');
}

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  verbose: true,
  strict: true,
});
