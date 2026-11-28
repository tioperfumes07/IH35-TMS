/**
 * PERFUME M19: the company center — open A/R from the books' aging, every transaction with the page it opens, notes with
 * history. Real Postgres, rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { companyCenter, saveCompanyNotes } from "./company-center.service.js";
import { createLink } from "../scentsx/links.service.js";
import { invoiceSalesOrder } from "../scentsx/sales-invoice.service.js";
import { loadSanctionsList, screenParty } from "../scentsx/sanctions.service.js";
import { fixtureFetcher } from "../scentsx/__fixtures__/ofac-fixture.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("company center (real Postgres, rolled back)", () => {
  let db: pg.Client;
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

  it("lists quote, order, invoice and PO rows with where each opens; open A/R = the invoice's open amount; notes keep history", async () => {
    const co = (await db.query<{ id: string }>(`INSERT INTO perfume.contact_companies (name, source, role) VALUES ('ZZ Center Co', 'test', 'both') RETURNING id::text`)).rows[0]!.id;
    const q = (await db.query<{ id: string }>(`INSERT INTO perfume.quotes (company_id, customer_name) VALUES ($1::uuid, 'ZZ Center Co') RETURNING id::text`, [co])).rows[0]!.id;
    await db.query(`INSERT INTO perfume.quote_lines (quote_id, line_no, description, qty, unit_price_cents) VALUES ($1::uuid, 1, 'ZZ EDP', 2, 1500)`, [q]);
    const so = (await db.query<{ id: string }>(`INSERT INTO perfume.sales_orders (company_id, customer_name) VALUES ($1::uuid, 'ZZ Center Co') RETURNING id::text`, [co])).rows[0]!.id;
    await db.query(`INSERT INTO perfume.sales_order_lines (order_id, line_no, description, qty, qty_shipped, unit_price_cents) VALUES ($1::uuid, 1, 'ZZ EDP', 4, 4, 2500)`, [so]);
    const cust = (await db.query<{ id: string }>(
      `INSERT INTO mdata.customers (customer_name, operating_company_id, is_sample_data) VALUES ('ZZ Center Co', scentsx.company_id(), false) RETURNING id::text`)).rows[0]!.id;
    await createLink(db, TEST_OWNER_USER_ID, "customer", co, cust);
    await loadSanctionsList(db, TEST_OWNER_USER_ID, fixtureFetcher);
    await screenParty(db, TEST_OWNER_USER_ID, { kind: "customer", id: cust });
    const inv = await invoiceSalesOrder(db, TEST_OWNER_USER_ID, so);
    const pv = (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind, company_id) VALUES ('ZZ Center vendor list', 'buy', $1::uuid) RETURNING id::text`, [co])).rows[0]!.id;
    const po = (await db.query<{ id: string }>(`INSERT INTO perfume.purchase_orders (vendor_id) VALUES ($1::uuid) RETURNING id::text`, [pv])).rows[0]!.id;

    const c1 = await companyCenter(db as never, co);
    const by = Object.fromEntries(c1.transactions.map((t) => [t.type, t]));
    expect(by["Quote"]).toMatchObject({ id: q, tab: "quotes", amount_cents: 3000 });
    expect(by["Sales order"]).toMatchObject({ id: so, tab: "orders", amount_cents: 10000 });
    expect(by["Invoice"]).toMatchObject({ id: inv.invoice_id, path: `/accounting/invoices/${inv.invoice_id}`, amount_cents: 10000 });
    expect(by["Purchase order"]).toMatchObject({ id: po, tab: "purchases" });
    expect(c1.customer_ids).toEqual([cust]);
    // A draft invoice is not on the books' aging yet: the open balance is the aging's, never a sum made here.
    expect(c1.open_ar_cents).toBe(c1.ar_aging.total);
    expect(c1.open_ap_cents).toBe(0);

    expect(await saveCompanyNotes(db as never, TEST_OWNER_USER_ID, co, "Pays by wire on Fridays")).toEqual({ updated: 1 });
    expect(await saveCompanyNotes(db as never, TEST_OWNER_USER_ID, co, "Pays by wire on Fridays")).toEqual({ updated: 0 });
    expect((await companyCenter(db as never, co)).notes).toBe("Pays by wire on Fridays");
    const ev = (await db.query<{ action: string; detail: { from: string | null; to: string } }>(
      `SELECT action, detail FROM perfume.lead_events WHERE company_id = $1::uuid AND action = 'notes_edited'`, [co])).rows;
    expect(ev).toHaveLength(1);
    expect(ev[0]!.detail).toEqual({ from: null, to: "Pays by wire on Fridays" });
  });
});
