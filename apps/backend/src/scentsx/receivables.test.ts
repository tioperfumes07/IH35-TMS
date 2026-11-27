/**
 * SCENTSX receivables (owner 2026-11-27 13:50 CT — CONTROL's Aging Balance Report / Customer Account Status / Invoice History):
 * open balances come from the books' own reconstruction; days from the invoice date; buckets follow the aging days the owner types;
 * a draft and a voided invoice are left out; a payment applied to an invoice lowers its balance and shows on its history; a voided
 * payment stops counting. Real Postgres, rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { createLink } from "./links.service.js";
import { invoiceSalesOrder } from "./sales-invoice.service.js";
import { loadSanctionsList, screenParty } from "./sanctions.service.js";
import { fixtureFetcher } from "./__fixtures__/ofac-fixture.js";
import { agingReport, bucketOf, customerAccount } from "./receivables.service.js";

const D = { d1: 30, d2: 60, d3: 90 };

describe("bucketOf", () => {
  it("Current < 30 ≤ 30 days < 60 ≤ 60 days < 90 ≤ 90+", () => {
    expect([0, 29, 30, 59, 60, 89, 90, 1079].map((n) => bucketOf(n, 30, 60, 90))).toEqual(["current", "current", "b1", "b1", "b2", "b2", "b3", "b3"]);
  });
});

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("ScentsX receivables (real Postgres, rolled back)", () => {
  let db: pg.Client;
  const u = TEST_OWNER_USER_ID;
  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect();
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
  });
  afterAll(async () => {
    await db?.query("ROLLBACK").catch(() => {});
    await db?.end().catch(() => {});
  });

  it("ages open invoices by invoice date, applies payments, ignores drafts / voids / voided payments", async () => {
    const co = await db.query<{ id: string }>(`INSERT INTO perfume.contact_companies (name, source) VALUES ('AR test buyer', 'test') RETURNING id::text`);
    const item = await db.query<{ id: string }>(
      `INSERT INTO perfume.items (internal_code, brand, name, display_name, identity_key, loose_key) VALUES ('AR-TEST-1', 'Test Brand', 'AR EDP', 'AR EDP 100ml', 'ar-edp-100-test', 'ar-edp-test') RETURNING id::text`);
    const cust = await db.query<{ id: string }>(`INSERT INTO mdata.customers (customer_name, operating_company_id, is_sample_data) VALUES ('AR test buyer', scentsx.company_id(), false) RETURNING id::text`);
    const cid = cust.rows[0]!.id;
    await createLink(db, u, "customer", co.rows[0]!.id, cid);
    await loadSanctionsList(db, u, fixtureFetcher);
    await screenParty(db, u, { kind: "customer", id: cid });
    const today = (await db.query<{ d: string }>(`SELECT (now() AT TIME ZONE 'America/Chicago')::date::text d`)).rows[0]!.d;
    // Three orders → three invoices: $100 today, $200 45 days ago, $300 120 days ago; a fourth stays a draft.
    const mk = async (cents: number, ageDays: number | null) => {
      const so = await db.query<{ id: string }>(`INSERT INTO perfume.sales_orders (company_id, customer_name) VALUES ($1::uuid, 'AR test buyer') RETURNING id::text`, [co.rows[0]!.id]);
      await db.query(`INSERT INTO perfume.sales_order_lines (order_id, line_no, item_id, description, qty, qty_shipped, unit_price_cents, cost_cents) VALUES ($1::uuid, 1, $2::uuid, 'AR EDP 100ml', 1, 1, $3, 100)`,
        [so.rows[0]!.id, item.rows[0]!.id, cents]);
      const inv = await invoiceSalesOrder(db, u, so.rows[0]!.id);
      if (ageDays != null) await db.query(`UPDATE accounting.invoices SET status = 'sent', sent_at = now(), issue_date = $2::date - $3::int WHERE id = $1::uuid`, [inv.invoice_id, today, ageDays]);
      return inv.invoice_id;
    };
    const a = await mk(10000, 0), b = await mk(20000, 45), c = await mk(30000, 120);
    await mk(99900, null); // draft — never on A/R

    let ag = await agingReport(db, D);
    let row = ag.customers.find((x) => x.customer_id === cid)!;
    expect(row).toMatchObject({ current: 10000, b1: 20000, b2: 0, b3: 30000, total: 60000, invoices: 3, oldest_days: 120, perfume_company_id: co.rows[0]!.id });

    // Aging days are the owner's: 10 / 50 / 100 moves the 45-day invoice to the second bucket, the 120-day one stays 100+.
    const custom = (await agingReport(db, { d1: 10, d2: 50, d3: 100 })).customers.find((x) => x.customer_id === cid)!;
    expect(custom).toMatchObject({ current: 10000, b1: 20000, b2: 0, b3: 30000 });

    // A $250 payment: $200 on the 45-day invoice, $50 on the 120-day one (written the way the payment engine writes it).
    const pay = await db.query<{ id: string }>(
      `INSERT INTO accounting.payments (operating_company_id, customer_id, display_id, payment_method, payment_date, reference, amount_cents, created_by_user_id)
       VALUES (scentsx.company_id(), $1::uuid, 'PMT-2026-99901', 'check', $2::date, 'CHK 101', 25000, $3::uuid) RETURNING id::text`, [cid, today, u]);
    await db.query(`INSERT INTO accounting.payment_applications (operating_company_id, payment_id, invoice_id, target_kind, target_id, amount_cents, amount_applied, applied_by_user_id) VALUES
      (scentsx.company_id(), $1::uuid, $2::uuid, 'invoice', $2::uuid, 20000, 200, $4::uuid), (scentsx.company_id(), $1::uuid, $3::uuid, 'invoice', $3::uuid, 5000, 50, $4::uuid)`, [pay.rows[0]!.id, b, c, u]);

    const acct = await customerAccount(db, cid, D);
    expect(acct.buckets).toMatchObject({ current: 10000, b1: 0, b2: 0, b3: 25000, total: 35000 });
    expect(acct.open_invoices.map((x) => [x.id, x.open_cents])).toEqual([[c, 25000], [a, 10000]]);
    const hist = acct.invoices.find((x) => x.id === c)!;
    expect(hist).toMatchObject({ total_cents: 30000, paid_cents: 5000, open_cents: 25000, bucket: "b3" });
    expect(hist.payments).toEqual([expect.objectContaining({ payment_no: "PMT-2026-99901", amount_cents: 5000, reference: "CHK 101", counted: true })]);
    expect(acct.invoices.find((x) => x.id === b)).toMatchObject({ open_cents: 0, bucket: null });
    expect(acct.payments.map((p) => p.number)).toEqual(["PMT-2026-99901"]);

    // Voided payment → the invoices are open again; voided invoice → off A/R.
    await db.query(`UPDATE accounting.payments SET voided_at = now(), void_reason = 'bounced' WHERE id = $1::uuid`, [pay.rows[0]!.id]);
    ag = await agingReport(db, D);
    row = ag.customers.find((x) => x.customer_id === cid)!;
    expect(row.total).toBe(60000);
    await db.query(`UPDATE accounting.invoices SET status = 'void', voided_at = now() WHERE id = $1::uuid`, [a]);
    expect((await agingReport(db, D)).customers.find((x) => x.customer_id === cid)!).toMatchObject({ current: 0, total: 50000, invoices: 2 });
  });

  it("refuses a customer that is not on ScentsX's books", async () => {
    await expect(customerAccount(db, "00000000-0000-0000-0000-000000000001", D)).rejects.toThrow();
  });
});
