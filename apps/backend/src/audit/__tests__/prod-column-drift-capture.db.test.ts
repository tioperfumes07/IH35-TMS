/**
 * Prod column-drift capture guard (real Postgres). DISPATCH-2 / TASK B.
 *
 * The definitive fresh-DB audit (2026-06-27) found 21 columns present on prod but NOT produced by the clean
 * migration set — so a fresh deploy lacked them and the migration set could not rebuild prod (an AF-1 gate).
 * Migration 202606271520 captures them. This guard runs on the migrated CI Postgres and asserts every
 * captured column exists, so a future migration cannot silently drop the table shape back below prod.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

// schema, table, column — captured by 202606271520 to match prod.
const CAPTURED: Array<[string, string, string]> = [
  ["mdata", "loads", "trailer_type"],
  ["accounting", "journal_entries", "idempotency_key"],
  ["compliance", "drug_alcohol_test_results", "clearinghouse_reference"],
  ["compliance", "drug_alcohol_test_results", "created_by"],
  ["compliance", "drug_alcohol_test_results", "selection_id"],
  ["qbo", "sync_alerts", "kind"],
  ["qbo", "sync_alerts", "message"],
  ["qbo", "sync_alerts", "payload"],
  ["qbo", "sync_alerts", "sync_run_id"],
  ["sms", "queue", "attempts"],
  ["sms", "queue", "error"],
  ["sms", "queue", "provider_message_id"],
  ["sms", "queue", "sent_at"],
  ["sms", "queue", "status"],
  ["sms", "queue", "to_number"],
  ["whatsapp", "queue", "attempts"],
  ["whatsapp", "queue", "body"],
  ["whatsapp", "queue", "error"],
  ["whatsapp", "queue", "provider_message_id"],
  ["whatsapp", "queue", "sent_at"],
  ["whatsapp", "queue", "status"],
];

describeIntegration("prod column-drift capture (real schema)", () => {
  let db: pg.Client;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
  });

  afterAll(async () => {
    if (db) await db.end().catch(() => {});
  });

  it("every captured column exists after a clean migrate (migration set matches prod shape)", async () => {
    const missing: string[] = [];
    for (const [schema, table, col] of CAPTURED) {
      const res = await db.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
        [schema, table, col]
      );
      if (Number(res.rows[0].n) === 0) missing.push(`${schema}.${table}.${col}`);
    }
    expect(missing, `clean migrate is missing prod columns: ${missing.join(", ")}`).toEqual([]);
  });
});
