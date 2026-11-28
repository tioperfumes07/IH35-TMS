/**
 * PERFUME M20 (LEAD ROUND L.32): payment terms / shipping method / sales-tax code picked on a quote, carried to its sales
 * order and onto the ScentsX invoice's due date; a value off the catalog is refused; a PO takes no tax code; the PO bill's due
 * date comes from the PO's picked terms. Real Postgres, rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
import { DocCatalogInvalid, docCatalogs, dueFromPickedTerms } from "./doc-catalogs.service.js";
import { createQuote, getQuote, quoteSchema, updateQuote } from "./quotes.service.js";
import { getOrder, orderFromQuote } from "./orders.service.js";
import { createPurchaseOrder, getPurchaseOrder, poSchema } from "./purchases.service.js";
import { createLink } from "../scentsx/links.service.js";
import { invoiceSalesOrder } from "../scentsx/sales-invoice.service.js";
import { loadSanctionsList, screenParty } from "../scentsx/sanctions.service.js";
import { fixtureFetcher } from "../scentsx/__fixtures__/ofac-fixture.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("document catalogs on quote / order / PO / invoice (real Postgres, rolled back)", () => {
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

  it("pick lists come from the engine catalogs; picks are checked, carried quote → order, and set the invoice due date", async () => {
    const cats = await docCatalogs(db as never);
    const net30 = cats.terms.find((t) => t.days === 30);
    expect(net30).toBeTruthy();
    expect(cats.shipping_methods).toContain("UPS");
    expect(cats.tax_codes.map((t) => t.code)).toEqual(expect.arrayContaining(["RESALE_EXEMPT", "EXPORT_EXEMPT"]));
    const resale = cats.tax_codes.find((t) => t.code === "RESALE_EXEMPT")!;
    expect(resale.rate_pct).toBe(0);

    const co = await db.query<{ id: string }>(`INSERT INTO perfume.contact_companies (name, source) VALUES ('ZZ Terms buyer', 'test') RETURNING id::text`);
    const q = await createQuote(db as never, TEST_OWNER_USER_ID, quoteSchema.parse({
      company_id: co.rows[0]!.id, payment_terms_id: net30!.id, shipping_method: "UPS", tax_code_id: resale.id }));
    let full = await getQuote(db as never, q.id);
    expect([full.payment_terms_id, full.terms, full.terms_days, full.shipping_method, full.tax_code_name]).toEqual([net30!.id, net30!.name, 30, "UPS", resale.name]);

    await db.query("SAVEPOINT bad");
    await expect(updateQuote(db as never, TEST_OWNER_USER_ID, q.id, quoteSchema.parse({ shipping_method: "Carrier pigeon" }))).rejects.toBeInstanceOf(DocCatalogInvalid);
    await db.query("ROLLBACK TO SAVEPOINT bad");
    await db.query("SAVEPOINT bad2");
    await expect(updateQuote(db as never, TEST_OWNER_USER_ID, q.id, quoteSchema.parse({ payment_terms_id: "6f1c2b9e-4d3a-4e5b-9c8d-7a6b5c4d3e2f" }))).rejects.toBeInstanceOf(DocCatalogInvalid);
    await db.query("ROLLBACK TO SAVEPOINT bad2");
    full = await getQuote(db as never, q.id);
    expect(full.shipping_method).toBe("UPS");

    await db.query(`INSERT INTO perfume.quote_lines (quote_id, line_no, description, qty, unit_price_cents) VALUES ($1::uuid, 1, 'ZZ Terms EDP', 2, 1500)`, [q.id]);
    const so = await orderFromQuote(db as never, TEST_OWNER_USER_ID, q.id);
    const order = await getOrder(db as never, so.id);
    expect([order.payment_terms_id, order.terms, order.shipping_method, order.tax_code_id]).toEqual([net30!.id, net30!.name, "UPS", resale.id]);

    // The invoice takes its due date from the order's terms: issue date + 30.
    await db.query(`UPDATE perfume.sales_order_lines SET qty_shipped = qty WHERE order_id = $1::uuid`, [so.id]);
    const cust = await db.query<{ id: string }>(
      `INSERT INTO mdata.customers (customer_name, operating_company_id, is_sample_data) VALUES ('ZZ Terms buyer', scentsx.company_id(), true) RETURNING id::text`);
    await createLink(db, TEST_OWNER_USER_ID, "customer", co.rows[0]!.id, cust.rows[0]!.id);
    await loadSanctionsList(db, TEST_OWNER_USER_ID, fixtureFetcher);
    await screenParty(db, TEST_OWNER_USER_ID, { kind: "customer", id: cust.rows[0]!.id });
    const inv = await invoiceSalesOrder(db, TEST_OWNER_USER_ID, so.id);
    const row = (await db.query<{ issue: string; due: string; notes: string }>(
      `SELECT issue_date::text AS issue, due_date::text AS due, internal_notes AS notes FROM accounting.invoices WHERE id = $1::uuid`, [inv.invoice_id])).rows[0]!;
    expect(row.issue).toBe(companyBusinessDate());
    expect(row.due).toBe(await dueFromPickedTerms(db, net30!.id, row.issue));
    expect(row.notes).toContain(`Terms ${net30!.name}`);
    expect(row.notes).toContain(`Sales tax: ${resale.name}`);
  });

  it("a PO takes terms and a shipping method, never a sales-tax code", async () => {
    const cats = await docCatalogs(db as never);
    const net15 = cats.terms.find((t) => t.days === 15)!;
    const v = (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind) VALUES ('ZZ Terms vendor', 'buy') RETURNING id::text`)).rows[0]!.id;
    const po = await createPurchaseOrder(db as never, TEST_OWNER_USER_ID, poSchema.parse({ vendor_id: v, payment_terms_id: net15.id, shipping_method: "LTL freight" }));
    const full = await getPurchaseOrder(db as never, po.id);
    expect([full.payment_terms_id, full.terms, full.terms_days, full.shipping_method]).toEqual([net15.id, net15.name, 15, "LTL freight"]);
    expect(await dueFromPickedTerms(db, net15.id, "2026-11-27")).toBe("2026-12-12");
    expect("tax_code_id" in poSchema.shape).toBe(false);
  });
});
