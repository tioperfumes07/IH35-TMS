// Ensures backend modules that eagerly validate DATABASE_URL can load during Vitest collection.
// These defaults do not assume a running Postgres unless individual integration tests connect.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://postgres:postgres@127.0.0.1:5432/postgres";
}
if (!process.env.DATABASE_DIRECT_URL) {
  process.env.DATABASE_DIRECT_URL = process.env.DATABASE_URL;
}
