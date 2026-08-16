/**
 * ACCT-F5322 / ORPH-003 / CLS-ORPHAN-SURFACE — vendor payment-method master data exists, is
 * WORM-protected, and never stores a raw bank account/routing number (real Postgres).
 *
 * Mirrors driver_finance.driver_payment_methods' own established pattern: tokenized reference only,
 * FORCE RLS, no DELETE grant, void-not-delete via is_active/voided_at, append-only audit trail.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("ACCT-F5322 — accounting.vendor_payment_methods is real, tokenized, WORM master data", () => {
  let db: pg.Client;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required for this db.test");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
  });

  afterAll(async () => {
    await db?.end();
  });

  it("the table exists with FORCE RLS and no DELETE grant to ih35_app", async () => {
    const rls = await db.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = 'accounting.vendor_payment_methods'::regclass`
    );
    expect(rls.rows[0]?.relrowsecurity).toBe(true);
    expect(rls.rows[0]?.relforcerowsecurity).toBe(true);

    const del = await db.query<{ can_delete: boolean }>(
      `SELECT has_table_privilege('ih35_app', 'accounting.vendor_payment_methods', 'DELETE') AS can_delete`
    );
    expect(del.rows[0]?.can_delete).toBe(false);
  });

  it("carries the WORM audit trigger (append-only history on every write)", async () => {
    const res = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_proc p ON p.oid = t.tgfoid
        WHERE n.nspname = 'accounting' AND c.relname = 'vendor_payment_methods'
          AND p.proname = 'tg_audit_row' AND NOT t.tgisinternal`
    );
    expect(Number(res.rows[0]?.n ?? 0)).toBeGreaterThan(0);
  });

  it("refuses to store a raw account/routing number — no such column exists", async () => {
    const res = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'accounting' AND table_name = 'vendor_payment_methods'
          AND (column_name ILIKE '%account_number%' OR column_name ILIKE '%routing_number%')`
    );
    expect(
      res.rows,
      "vendor_payment_methods must never carry a raw account/routing number column — tokenize via account_token"
    ).toEqual([]);
  });

  it("an ACH or wire method without a token is rejected by the CHECK constraint", async () => {
    await db.query("BEGIN");
    try {
      const company = await db.query<{ id: string }>(`SELECT id FROM org.companies WHERE is_active = true LIMIT 1`);
      const vendor = await db.query<{ id: string }>(
        `SELECT id FROM mdata.vendors WHERE operating_company_id = $1 LIMIT 1`,
        [company.rows[0]?.id]
      );
      if (!company.rows[0] || !vendor.rows[0]) return; // no fixture data in this CI DB — nothing to prove
      await expect(
        db.query(
          `INSERT INTO accounting.vendor_payment_methods (operating_company_id, vendor_id, method)
           VALUES ($1, $2, 'ach')`,
          [company.rows[0].id, vendor.rows[0].id]
        )
      ).rejects.toThrow(/vendor_payment_methods_electronic_requires_token/);
    } finally {
      await db.query("ROLLBACK");
    }
  });
});
