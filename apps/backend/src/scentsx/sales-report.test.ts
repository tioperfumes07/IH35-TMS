/**
 * SCENTSX B13 — Sales by Customer / Sales by Item read ScentsX's issued invoices only: a draft and a voided invoice are left out,
 * the sales-tax line is left out, a line from a sales order carries its item, units and cost; a hand-typed line is grouped as
 * "(not from a sales order)". Also: ScentsX has 24 open periods (migration 202616980100). Real Postgres, rolled back.
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
import { createInvoiceLineInClientTx } from "../accounting/invoice-line-create.js";
import { salesReport } from "./sales-report.service.js";

describe("ScentsX sales reports and periods (real Postgres, rolled back)", () => {
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

  it("ScentsX has 24 open monthly periods, Jan 2026 to Dec 2027", async () => {
    const r = await db.query<{ n: number; open: number; first: string; last: string }>(
      `SELECT count(*)::int n, count(*) FILTER (WHERE status = 'open')::int open, min(period_start)::text first, max(period_end)::text last
         FROM accounting.periods p JOIN org.companies c ON c.id = p.operating_company_id WHERE c.code = 'SCENTSX'`
    );
    expect(r.rows[0]).toMatchObject({ n: 24, open: 24, first: "2026-01-01", last: "2027-12-31" });
  });

  it("counts issued invoices only, by customer and by item, income lines only", async () => {
    const co = await db.query<{ id: string }>(`INSERT INTO perfume.contact_companies (name, source) VALUES ('Report test buyer', 'test') RETURNING id::text`);
    const item = await db.query<{ id: string }>(
      `INSERT INTO perfume.items (internal_code, brand, name, display_name, identity_key, loose_key) VALUES ('RPT-TEST-1', 'Test Brand', 'Report EDP', 'Report EDP 100ml', 'report-edp-100-test', 'report-edp-test') RETURNING id::text`
    );
    const so = await db.query<{ id: string }>(`INSERT INTO perfume.sales_orders (company_id, customer_name) VALUES ($1::uuid, 'Report test buyer') RETURNING id::text`, [co.rows[0]!.id]);
    await db.query(
      `INSERT INTO perfume.sales_order_lines (order_id, line_no, item_id, description, qty, qty_shipped, unit_price_cents, cost_cents)
       VALUES ($1::uuid, 1, $2::uuid, 'Report EDP 100ml', 10, 10, 2500, 1500)`, [so.rows[0]!.id, item.rows[0]!.id]
    );
    const cust = await db.query<{ id: string }>(
      `INSERT INTO mdata.customers (customer_name, operating_company_id, is_sample_data) VALUES ('Report test buyer', scentsx.company_id(), false) RETURNING id::text`
    );
    await createLink(db, u, "customer", co.rows[0]!.id, cust.rows[0]!.id);
    await loadSanctionsList(db, u, fixtureFetcher);
    await screenParty(db, u, { kind: "customer", id: cust.rows[0]!.id });

    const inv = await invoiceSalesOrder(db, u, so.rows[0]!.id);
    const acct = async (n: string) => (await db.query<{ id: string }>(`SELECT id::text FROM catalogs.accounts WHERE operating_company_id = scentsx.company_id() AND account_number = $1`, [n])).rows[0]!.id;
    // A hand-typed shipping line on the same invoice (the invoice engine only takes Income accounts on a line).
    await createInvoiceLineInClientTx(db, { operatingCompanyId: (await db.query<{ id: string }>(`SELECT scentsx.company_id()::text id`)).rows[0]!.id,
      invoiceId: inv.invoice_id, line_type: "other", description: "Shipping", quantity: 1, unit_amount_cents: 1000, account_id: await acct("4100") }, u);

    const today = (await db.query<{ d: string }>(`SELECT CURRENT_DATE::text d`)).rows[0]!.d;
    // Still a draft → not in the report.
    expect((await salesReport(db, "customer", "2026-01-01", "2027-12-31")).rows).toEqual([]);

    await db.query(`UPDATE accounting.invoices SET status = 'sent', sent_at = now(), issue_date = $2::date WHERE id = $1::uuid`, [inv.invoice_id, today]);
    const byCustomer = await salesReport(db, "customer", "2026-01-01", "2027-12-31");
    expect(byCustomer.rows).toEqual([
      expect.objectContaining({ name: "Report Test Buyer", last_sale_date: today, invoices: 1, units: 10, sales_cents: 26000, cost_cents: 15000, margin_cents: 11000, pct_of_sales: 100 }),
    ]);
    expect(byCustomer.total).toMatchObject({ invoices: 1, sales_cents: 26000 });

    const byItem = await salesReport(db, "item", "2026-01-01", "2027-12-31");
    expect(byItem.rows.map((r) => [r.name, r.units, r.sales_cents, r.cost_cents])).toEqual([
      ["Report EDP 100ml", 10, 25000, 15000],
      ["(not from a sales order)", 0, 1000, null],
    ]);

    // Outside the dates → nothing; voided → nothing.
    expect((await salesReport(db, "item", "2025-01-01", "2025-12-31")).rows).toEqual([]);
    await db.query(`UPDATE accounting.invoices SET status = 'void', voided_at = now() WHERE id = $1::uuid`, [inv.invoice_id]);
    expect((await salesReport(db, "customer", "2026-01-01", "2027-12-31")).total.sales_cents).toBe(0);
  });
});
