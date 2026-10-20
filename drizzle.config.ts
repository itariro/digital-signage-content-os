import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './lib/db/schema.pg.ts',
  out: './drizzle',
  dbCredentials: {
    url: (process.env.DATABASE_URL || 'postgres://localhost:5432/dscos').replace(/sslmode=(require|prefer|verify-ca)/g, 'sslmode=verify-full'),
  },
})
