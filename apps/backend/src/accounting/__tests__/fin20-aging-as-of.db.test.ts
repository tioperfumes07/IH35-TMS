/**
 * FIN-20 follow-up — TRUE historical as-of AR/AP aging (real Postgres).
 *
 * Proves accounting.ar_aging_as_of / ap_aging_as_of (migration 202606290040) return the correct
 * OPEN balance AS OF a PRIOR date — i.e. the bucket math keys on the chosen date, NOT CURRENT_DATE —
 * for a hand-checked invoice/bill with a MID-PERIOD payment, and that the functions are
 * operating_company_id-scoped (no cross-entity bleed). Everything runs inside a single bypass
 * transaction and is ROLLED BACK, so the CI verify-DB is left untouched.
 *
 * Runs only in CI (GITHUB_ACTIONS=true) where a migrated Postgres is available.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

// A hand-checked scenario, dollars → cents:
//   Invoice INV total $1,000.00 (100000c), issued 2026-01-01, due 2026-01-31.
//   Payment $400.00 (40000c) received 2026-02-15, applied to the invoice the same day.
// Expected open balance:
//   • AS OF 2026-02-10 (BEFORE the payment): 100000c, bucket 1–30 (10 days past due).
//   • AS OF 2026-03-01 (AFTER the payment):   60000c, bucket 1–30 (29 days past due).
//   • AS OF 2025-12-15 (BEFORE issue):        no row.
// If the function wrongly used CURRENT_DATE it could NOT produce the 100000c "before payment" answer
// (today the invoice is already 40% paid), which is the whole point of true historical aging.
describeIntegration("FIN-20 as-of AR/AP aging (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  const n5 = () => String(Math.floor(10000 + Math.random() * 89999));
  const invDisplay = `INV-2026-${n5()}`;
  const pmtDisplay = `PMT-2026-${n5()}`;
  const billDisplay = `BILL-ASOF-${randomUUID().slice(0, 8)}`;
  const customerId = randomUUID();
  const invoiceId = randomUUID();
  const paymentId = randomUUID();
  const vendorUuid = randomUUID();
  const billId = randomUUID();

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query(`SET LOCAL app.operating_company_id = '${companyId}'`);

    await db.query(
      `INSERT INTO mdata.customers (id, operating_company_id, customer_name) VALUES ($1::uuid,$2::uuid,$3)`,
      [customerId, companyId, `AS-OF Cust ${invDisplay}`]
    );
    await db.query(
      `INSERT INTO accounting.invoices (id, operating_company_id, customer_id, display_id, issue_date, due_date, total_cents, status)
       VALUES ($1::uuid,$2::uuid,$3::uuid,$4,DATE '2026-01-01',DATE '2026-01-31',100000,'sent')`,
      [invoiceId, companyId, customerId, invDisplay]
    );
    await db.query(
      `INSERT INTO accounting.payments (id, operating_company_id, customer_id, display_id, payment_method, payment_date, amount_cents)
       VALUES ($1::uuid,$2::uuid,$3::uuid,$4,'ach',DATE '2026-02-15',40000)`,
      [paymentId, companyId, customerId, pmtDisplay]
    );
    await db.query(
      `INSERT INTO accounting.payment_applications
         (operating_company_id, payment_id, invoice_id, amount_cents, applied_at, target_kind, target_id, amount_applied)
       VALUES ($1::uuid,$2::uuid,$3::uuid,40000,TIMESTAMPTZ '2026-02-15 12:00:00+00','invoice',$3::uuid,400.00)`,
      [companyId, paymentId, invoiceId]
    );

    // AP: vendor + bill $500 (50000c) bill_date 2026-01-05 / due 2026-02-04, $200 (20000c) paid 2026-02-20.
    await db.query(
      `INSERT INTO mdata.vendors (id, operating_company_id, vendor_name, vendor_type) VALUES ($1::uuid,$2::uuid,$3,'Other')`,
      [vendorUuid, companyId, `AS-OF Vend ${billDisplay}`]
    );
    await db.query(
      `INSERT INTO accounting.bills (id, operating_company_id, vendor_id, vendor_uuid, display_id, bill_number, bill_date, due_date, amount_cents, status)
       VALUES ($1::uuid,$2::uuid,$3,$3,$4,$4,DATE '2026-01-05',DATE '2026-02-04',50000,'unpaid')`,
      [billId, companyId, vendorUuid, billDisplay]
    );
    await db.query(
      `INSERT INTO accounting.bill_payments (operating_company_id, bill_id, payment_date, amount_cents, payment_method)
       VALUES ($1::uuid,$2::uuid,DATE '2026-02-20',20000,'ach')`,
      [companyId, billId]
    );
  });

  afterAll(async () => {
    if (db) {
      await db.query("ROLLBACK").catch(() => {});
      await db.end().catch(() => {});
    }
  });

  async function arRow(asOf: string) {
    const r = await db.query<{ total_open_cents: string; current_cents: string; bucket_1_30_cents: string }>(
      `SELECT total_open_cents, current_cents, bucket_1_30_cents FROM accounting.ar_aging_as_of($1::uuid,$2::date) WHERE customer_id = $3::uuid`,
      [companyId, asOf, customerId]
    );
    return r.rows[0];
  }

  it("AR: open balance AS OF a date BEFORE the mid-period payment = full $1,000 in 1–30 bucket", async () => {
    const row = await arRow("2026-02-10");
    expect(row).toBeDefined();
    expect(Number(row!.total_open_cents)).toBe(100000);
    expect(Number(row!.bucket_1_30_cents)).toBe(100000);
    expect(Number(row!.current_cents)).toBe(0);
  });

  it("AR: open balance AS OF a date AFTER the payment = $600 remaining", async () => {
    const row = await arRow("2026-03-01");
    expect(Number(row!.total_open_cents)).toBe(60000);
    expect(Number(row!.bucket_1_30_cents)).toBe(60000);
  });

  it("AR: AS OF before the invoice was issued returns no row", async () => {
    const row = await arRow("2025-12-15");
    expect(row).toBeUndefined();
  });

  it("AR: is operating_company_id-scoped — a different entity sees none of these rows", async () => {
    const r = await db.query(
      `SELECT count(*)::int AS n FROM accounting.ar_aging_as_of($1::uuid,$2::date) WHERE customer_id = $3::uuid`,
      [randomUUID(), "2026-02-10", customerId]
    );
    expect((r.rows[0] as { n: number }).n).toBe(0);
  });

  it("AP: open bill balance AS OF before the bill payment = full $500 in 1–30 bucket", async () => {
    const r = await db.query<{ total_open_cents: string; bucket_1_30_cents: string }>(
      `SELECT total_open_cents, bucket_1_30_cents FROM accounting.ap_aging_as_of($1::uuid,$2::date) WHERE vendor_id = $3::text`,
      [companyId, "2026-02-10", vendorUuid]
    );
    expect(Number(r.rows[0]!.total_open_cents)).toBe(50000);
    expect(Number(r.rows[0]!.bucket_1_30_cents)).toBe(50000);
  });

  it("AP: open bill balance AS OF after the bill payment = $300 remaining", async () => {
    const r = await db.query<{ total_open_cents: string }>(
      `SELECT total_open_cents FROM accounting.ap_aging_as_of($1::uuid,$2::date) WHERE vendor_id = $3::text`,
      [companyId, "2026-03-01", vendorUuid]
    );
    expect(Number(r.rows[0]!.total_open_cents)).toBe(30000);
  });
});
