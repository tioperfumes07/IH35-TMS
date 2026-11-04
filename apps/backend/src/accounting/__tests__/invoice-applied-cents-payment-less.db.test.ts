/**
 * ACCT-F11103 — payment-less relief applications count in the dated A/R aging (real Postgres).
 *
 * ACCT-F11070 records poster relief as accounting.payment_applications with payment_id NULL. accounting.ar_aging_as_of()
 * summed applications through an INNER JOIN to accounting.payments, so a $50,000.00 invoice with a $20,000.00 relief
 * application aged at $50,000.00. On the old function the "as of 2026-02-15" assertion below reads 5,000,000, not 3,000,000.
 *
 * Scenario (cents): invoice $50,000.00 issued 2026-01-01, due 2026-01-31.
 *   - relief application $20,000.00, payment_id NULL, applied 2026-02-10
 *   - customer payment $5,000.00 dated 2026-02-20, applied the same day
 * Expected: as of 2026-02-05 open 5,000,000 · as of 2026-02-15 open 3,000,000 · as of 2026-03-01 open 2,500,000
 *           = total − amount_paid_cents the trigger wrote (one rule: accounting.invoice_applied_cents_as_of).
 * Then the relief is unapplied on 2026-03-05: amount_paid_cents 500,000; the 2026-03-01 aging still 2,500,000.
 *
 * One bypass transaction, ROLLED BACK. Runs only in CI (GITHUB_ACTIONS=true) where a migrated Postgres is available.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import { insertInvoiceLine, insertLoadForInvoice } from "../../../test-helpers/load-born-invoice.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("ACCT-F11103 payment-less applications in A/R aging (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  const n5 = () => String(Math.floor(10000 + Math.random() * 89999));
  const invDisplay = `INV-2026-${n5()}`;
  const pmtDisplay = `PMT-2026-${n5()}`;
  const customerId = randomUUID();
  const invoiceId = randomUUID();
  const paymentId = randomUUID();
  let reliefId = "";

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);

    await db.query(`INSERT INTO mdata.customers (id, operating_company_id, customer_name) VALUES ($1::uuid,$2::uuid,$3)`, [
      customerId,
      companyId,
      `F11103 Cust ${invDisplay}`,
    ]);
    const loadId = await insertLoadForInvoice(db, companyId, customerId, { rateTotalCents: 5000000 });
    await db.query(
      `INSERT INTO accounting.invoices (id, operating_company_id, customer_id, display_id, issue_date, due_date, total_cents, status, source_load_id)
       VALUES ($1::uuid,$2::uuid,$3::uuid,$4,DATE '2026-01-01',DATE '2026-01-31',5000000,'draft',$5::uuid)`,
      [invoiceId, companyId, customerId, invDisplay, loadId]
    );
    await insertInvoiceLine(db, companyId, invoiceId, 5000000, { loadId, status: "sent" });

    // Relief exactly as invoice-relief-application.service.ts writes it (payment_id NULL), dated 2026-02-10.
    const relief = await db.query<{ id: string }>(
      `INSERT INTO accounting.payment_applications
         (operating_company_id, payment_id, invoice_id, amount_cents, amount_applied, target_kind, target_id, applied_at)
       VALUES ($1::uuid, NULL, $2::uuid, 2000000, 20000.00, 'invoice', $2::uuid, TIMESTAMPTZ '2026-02-10 12:00:00+00')
       RETURNING id::text`,
      [companyId, invoiceId]
    );
    reliefId = relief.rows[0]!.id;

    await db.query(
      `INSERT INTO accounting.payments (id, operating_company_id, customer_id, display_id, payment_method, payment_date, amount_cents)
       VALUES ($1::uuid,$2::uuid,$3::uuid,$4,'ach',DATE '2026-02-20',500000)`,
      [paymentId, companyId, customerId, pmtDisplay]
    );
    await db.query(
      `INSERT INTO accounting.payment_applications
         (operating_company_id, payment_id, invoice_id, amount_cents, amount_applied, target_kind, target_id, applied_at)
       VALUES ($1::uuid,$2::uuid,$3::uuid,500000,5000.00,'invoice',$3::uuid,TIMESTAMPTZ '2026-02-20 12:00:00+00')`,
      [companyId, paymentId, invoiceId]
    );
  });

  afterAll(async () => {
    if (db) {
      await db.query("ROLLBACK").catch(() => {});
      await db.end().catch(() => {});
    }
  });

  async function openAsOf(asOf: string): Promise<number | undefined> {
    const r = await db.query<{ total_open_cents: string }>(
      `SELECT total_open_cents FROM accounting.ar_aging_as_of($1::uuid,$2::date) WHERE customer_id = $3::uuid`,
      [companyId, asOf, customerId]
    );
    return r.rows[0] ? Number(r.rows[0].total_open_cents) : undefined;
  }

  async function header(): Promise<{ paid: number; status: string }> {
    const r = await db.query<{ paid: string; status: string }>(
      `SELECT amount_paid_cents::text AS paid, status FROM accounting.invoices WHERE id = $1::uuid`,
      [invoiceId]
    );
    return { paid: Number(r.rows[0]!.paid), status: r.rows[0]!.status };
  }

  it("before the relief date the full $50,000.00 is open", async () => {
    expect(await openAsOf("2026-02-05")).toBe(5000000);
  });

  it("a $20,000.00 relief application (payment_id NULL) reduces the dated aging to $30,000.00", async () => {
    expect(await openAsOf("2026-02-15")).toBe(3000000);
  });

  it("after both applications the aging equals total − amount_paid_cents the trigger wrote", async () => {
    const h = await header();
    expect(h.paid).toBe(2500000);
    expect(h.status).toBe("partial");
    expect(await openAsOf("2026-03-01")).toBe(5000000 - h.paid);
    const live = await db.query<{ c: string }>(`SELECT accounting.invoice_applied_cents_as_of($1::uuid, 'infinity'::date)::text AS c`, [invoiceId]);
    expect(Number(live.rows[0]!.c)).toBe(h.paid);
  });

  it("unapplying the relief reverts the header and the aging after that date, not before", async () => {
    await db.query(`UPDATE accounting.payment_applications SET unapplied_at = TIMESTAMPTZ '2026-03-05 12:00:00+00' WHERE id = $1::uuid`, [reliefId]);
    const h = await header();
    expect(h.paid).toBe(500000);
    expect(await openAsOf("2026-03-01")).toBe(2500000);
    expect(await openAsOf("2026-03-10")).toBe(4500000);
  });

  it("a voided payment applies nothing after its void date (same rule for both kinds)", async () => {
    await db.query(`UPDATE accounting.payments SET voided_at = TIMESTAMPTZ '2026-03-12 12:00:00+00' WHERE id = $1::uuid`, [paymentId]);
    expect(await openAsOf("2026-03-10")).toBe(4500000);
    expect(await openAsOf("2026-03-15")).toBe(5000000);
  });
});
