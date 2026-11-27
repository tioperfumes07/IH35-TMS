/**
 * SCENTSX Sales inquiry (LEAD ROUND L.20 item 3): every sale line by item / customer / invoice, and the invoice list by customer —
 * issued invoices only, Income lines only (same rule as the Sales by Customer / Item report). Real Postgres, rolled back.
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
import { inquiryCustomers, salesInvoices, salesLines } from "./sales-inquiry.service.js";

describe("ScentsX sales inquiry (real Postgres, rolled back)", () => {
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

  it("lists sale lines by item, customer and invoice; lists invoices by customer; drafts, voids and other dates stay out", async () => {
    const co = await db.query<{ id: string }>(`INSERT INTO perfume.contact_companies (name, source) VALUES ('Inquiry test buyer', 'test') RETURNING id::text`);
    const item = (await db.query<{ id: string }>(
      `INSERT INTO perfume.items (internal_code, brand, name, display_name, identity_key, loose_key) VALUES ('INQ-TEST-1', 'Test Brand', 'Inquiry EDP', 'Inquiry EDP 100ml', 'inquiry-edp-100-test', 'inquiry-edp-test') RETURNING id::text`)).rows[0]!.id;
    const so = await db.query<{ id: string }>(`INSERT INTO perfume.sales_orders (company_id, customer_name) VALUES ($1::uuid, 'Inquiry test buyer') RETURNING id::text`, [co.rows[0]!.id]);
    await db.query(`INSERT INTO perfume.sales_order_lines (order_id, line_no, item_id, description, qty, qty_shipped, unit_price_cents, cost_cents)
       VALUES ($1::uuid, 1, $2::uuid, 'Inquiry EDP 100ml', 10, 10, 2500, 1500)`, [so.rows[0]!.id, item]);
    const cust = (await db.query<{ id: string }>(
      `INSERT INTO mdata.customers (customer_name, operating_company_id, is_sample_data) VALUES ('Inquiry test buyer', scentsx.company_id(), false) RETURNING id::text`)).rows[0]!.id;
    await createLink(db, u, "customer", co.rows[0]!.id, cust);
    await loadSanctionsList(db, u, fixtureFetcher);
    await screenParty(db, u, { kind: "customer", id: cust });
    const inv = await invoiceSalesOrder(db, u, so.rows[0]!.id);
    const acct = (await db.query<{ id: string }>(`SELECT id::text FROM catalogs.accounts WHERE operating_company_id = scentsx.company_id() AND account_number = '4100'`)).rows[0]!.id;
    await createInvoiceLineInClientTx(db, { operatingCompanyId: (await db.query<{ id: string }>(`SELECT scentsx.company_id()::text id`)).rows[0]!.id,
      invoiceId: inv.invoice_id, line_type: "other", description: "Shipping", quantity: 1, unit_amount_cents: 1000, account_id: acct }, u);
    const today = (await db.query<{ d: string }>(`SELECT CURRENT_DATE::text d`)).rows[0]!.d;
    const range = { from: "2026-01-01", to: "2027-12-31" };

    expect((await salesLines(db, { ...range, item_id: item })).rows).toEqual([]); // still a draft
    await db.query(`UPDATE accounting.invoices SET status = 'sent', sent_at = now(), issue_date = $2::date WHERE id = $1::uuid`, [inv.invoice_id, today]);

    const byItem = await salesLines(db, { ...range, item_id: item });
    expect(byItem.rows).toEqual([expect.objectContaining({ invoice_id: inv.invoice_id, issue_date: today, customer_id: cust, item_id: item, item: "Inquiry EDP 100ml",
      qty: 10, unit_price_cents: 2500, amount_cents: 25000 })]);
    expect(byItem.total).toEqual({ lines: 1, invoices: 1, qty: 10, amount_cents: 25000 });

    const drill = await salesLines(db, { ...range, invoice_id: inv.invoice_id });
    expect(drill.rows.map((r) => [r.item, r.description, r.qty, r.amount_cents])).toEqual(expect.arrayContaining([
      ["Inquiry EDP 100ml", expect.any(String), 10, 25000], [null, "Shipping", 1, 1000]]));
    expect(drill.total.amount_cents).toBe(26000);
    expect((await salesLines(db, { ...range, customer_id: cust })).total.lines).toBe(2);

    const list = await salesInvoices(db, { ...range, customer_id: cust });
    expect(list.rows).toEqual([expect.objectContaining({ invoice_id: inv.invoice_id, issue_date: today, customer_id: cust, status: "sent", lines: 2, units: 11, sales_cents: 26000 })]);
    expect(list.total).toMatchObject({ invoices: 1, units: 11, sales_cents: 26000 });
    expect(await inquiryCustomers(db)).toContainEqual({ customer_id: cust, customer: expect.stringMatching(/inquiry test buyer/i), invoices: 1 });

    expect((await salesLines(db, { from: "2025-01-01", to: "2025-12-31", item_id: item })).rows).toEqual([]);
    await expect(salesLines(db, { from: "2026-02-01", to: "2026-01-01" })).rejects.toThrow(/from on or before to/);
    await db.query(`UPDATE accounting.invoices SET status = 'void', voided_at = now() WHERE id = $1::uuid`, [inv.invoice_id]);
    expect((await salesInvoices(db, { ...range, customer_id: cust })).rows).toEqual([]);
  });
});
