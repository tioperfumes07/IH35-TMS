import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { describe, expect, it } from "vitest";

const { Client } = pg;
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../../..");
const migrationPath = path.join(repoRoot, "db/migrations/0262_journal_entries_idempotency_constraint.sql");
const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;

describe("0262_journal_entries_idempotency_constraint migration", () => {
  it.runIf(Boolean(connectionString))("is idempotent and creates company-scoped unique index", async () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    const client = new Client({ connectionString });
    await client.connect();

    try {
      await client.query(sql);
      await client.query(sql);

      const columnRes = await client.query(
        `
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'accounting'
            AND table_name = 'journal_entries'
            AND column_name = 'idempotency_key'
          LIMIT 1
        `
      );
      expect(columnRes.rowCount).toBeGreaterThan(0);

      const indexRes = await client.query(
        `
          SELECT 1
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relkind = 'i'
            AND n.nspname = 'accounting'
            AND c.relname = 'uq_journal_entries_idempotency_key'
          LIMIT 1
        `
      );
      expect(indexRes.rowCount).toBeGreaterThan(0);
    } finally {
      await client.end();
    }
  });
});
