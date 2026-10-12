import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { describe, expect, it } from "vitest";

const { Client } = pg;
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../../..");
const migrationPath = path.join(repoRoot, "db/migrations/0242_drift_reconciliation.sql");
const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;

describe("0242_drift_reconciliation migration", () => {
  it.runIf(Boolean(connectionString))("is idempotent and reconciles all 14 target entries", { timeout: 120_000 }, async () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    const client = new Client({ connectionString });
    await client.connect();

    try {
      // 443.100 — this is the one backend test that replays DDL (ALTER TABLE / CREATE OR REPLACE VIEW / CREATE INDEX)
      // against the SHARED test database while every other file runs DML in parallel. Taking those locks mid-suite
      // deadlocked it with concurrent bookings, and Postgres chose the OTHER test as the victim
      // (book-load-zero-dollar-dispatch-gate got "deadlock detected"). The replay now yields instead: its lock_timeout
      // is below deadlock_timeout (1s), so it aborts before deadlock detection can pick another file, rolls its
      // migration transaction back, and retries. Assertions unchanged: two clean full applies, then the 14 checks.
      await client.query("SET lock_timeout = '500ms'");
      const applyYielding = async () => {
        for (let attempt = 1; ; attempt += 1) {
          try {
            await client.query(sql);
            return;
          } catch (err) {
            await client.query("ROLLBACK").catch(() => undefined);
            const code = (err as { code?: string }).code;
            if ((code !== "55P03" && code !== "40P01") || attempt >= 40) throw err;
            await new Promise((r) => setTimeout(r, 250 * Math.min(attempt, 8)));
          }
        }
      };
      // Runs repeatedly on partially-healed schemas without errors.
      await applyYielding();
      await applyYielding();

      const checks: Array<[string, unknown[]]> = [
        [
          "SELECT 1 FROM information_schema.columns WHERE table_schema='maintenance' AND table_name='work_orders' AND column_name='severity' LIMIT 1",
          [],
        ],
        [
          "SELECT 1 FROM information_schema.views WHERE table_schema='views' AND table_name='ap_aging' LIMIT 1",
          [],
        ],
        [
          "SELECT 1 FROM information_schema.columns WHERE table_schema='mdata' AND table_name='equipment' AND column_name='qbo_vendor_id' LIMIT 1",
          [],
        ],
        [
          "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='i' AND n.nspname='mdata' AND c.relname='idx_mdata_equipment_qbo_vendor' LIMIT 1",
          [],
        ],
        [
          "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='i' AND n.nspname='banking' AND c.relname='idx_bank_accounts_ledger_account' LIMIT 1",
          [],
        ],
        [
          "SELECT 1 FROM information_schema.tables WHERE table_schema='qbo' AND table_name='sync_dead_letter_email_throttle' AND table_type='BASE TABLE' LIMIT 1",
          [],
        ],
        [
          "SELECT 1 FROM information_schema.columns WHERE table_schema='qbo' AND table_name='sync_runs' AND column_name='payload' LIMIT 1",
          [],
        ],
        [
          "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='i' AND n.nspname='accounting' AND c.relname='ix_outbox_events_company_pending' LIMIT 1",
          [],
        ],
        [
          "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='i' AND n.nspname='sms' AND c.relname='ix_sms_queue_company_created_at' LIMIT 1",
          [],
        ],
        [
          "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='i' AND n.nspname='whatsapp' AND c.relname='ix_whatsapp_queue_company_created_at' LIMIT 1",
          [],
        ],
        [
          "SELECT 1 FROM information_schema.columns WHERE table_schema='banking' AND table_name='bank_transactions' AND column_name='source_ref' LIMIT 1",
          [],
        ],
        [
          "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='i' AND n.nspname='banking' AND c.relname='uq_bank_transactions_account_dedup' LIMIT 1",
          [],
        ],
        [
          "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='i' AND n.nspname='mdata' AND c.relname='ix_mdata_loads_company_status_updated' LIMIT 1",
          [],
        ],
        [
          "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='i' AND n.nspname='driver_finance' AND c.relname='ix_driver_settlements_driver_period' LIMIT 1",
          [],
        ],
      ];

      for (const [query, params] of checks) {
        const res = await client.query(query, params);
        expect(res.rowCount).toBeGreaterThan(0);
      }
    } finally {
      await client.end();
    }
  });
});
