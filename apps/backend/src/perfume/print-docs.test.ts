/**
 * PERFUME M22: the packing slip is the order's shipped lines with UPC and units — never a price — server-rendered like the count
 * sheet; the order's ScentsX invoices are read from scentsx.document_links. Real Postgres, rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { orderInvoices, packingSlipBody, packingSlipHtml, recordDocSent } from "./print-docs.service.js";
import { createLink } from "../scentsx/links.service.js";
import { invoiceSalesOrder } from "../scentsx/sales-invoice.service.js";
import { loadSanctionsList, screenParty } from "../scentsx/sanctions.service.js";
import { fixtureFetcher } from "../scentsx/__fixtures__/ofac-fixture.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("packing slip + order invoices (real Postgres, rolled back)", () => {
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

  it("slip lists shipped lines with UPC and units, no price; invoices come from the document links; the send is in the history", async () => {
    const co = (await db.query<{ id: string }>(`INSERT INTO perfume.contact_companies (name, source) VALUES ('ZZ Slip Buyer', 'test') RETURNING id::text`)).rows[0]!.id;
    const so = (await db.query<{ id: string; number: string }>(
      `INSERT INTO perfume.sales_orders (company_id, customer_name, ship_to, shipping_method) VALUES ($1::uuid, 'ZZ Slip Buyer', '1 Main St\nLaredo TX', 'UPS') RETURNING id::text, number`, [co])).rows[0]!;
    await db.query(`INSERT INTO perfume.sales_order_lines (order_id, line_no, description, upc, qty, qty_shipped, unit_price_cents) VALUES
      ($1::uuid, 1, 'ZZ SLIP EDP <b>100ml</b>', '8000000999901', 10, 6, 4321), ($1::uuid, 2, 'ZZ SLIP EDT', NULL, 2, 0, 1999)`, [so.id]);
    const slip = await packingSlipBody(db as never, so.id);
    expect(slip.title).toBe(`Packing slip ${so.number}`);
    expect(slip.body).toContain("8000000999901");
    expect(slip.body).toContain("ZZ SLIP EDP &lt;b&gt;100ml&lt;/b&gt;"); // escaped
    expect(slip.body).not.toContain("ZZ SLIP EDT"); // nothing shipped on line 2 → only shipped lines
    expect(slip.body).toContain("6 units shipped");
    expect(slip.body).toContain("UPS");
    expect(slip.body).not.toMatch(/43\.21|\$/); // no price anywhere
    expect(await packingSlipHtml(db as never, so.id)).toMatch(/^<!doctype html>/);

    expect(await orderInvoices(db as never, so.id)).toEqual([]);
    const cust = (await db.query<{ id: string }>(
      `INSERT INTO mdata.customers (customer_name, operating_company_id, is_sample_data) VALUES ('ZZ Slip Buyer', scentsx.company_id(), true) RETURNING id::text`)).rows[0]!.id;
    await createLink(db, TEST_OWNER_USER_ID, "customer", co, cust);
    await loadSanctionsList(db, TEST_OWNER_USER_ID, fixtureFetcher);
    await screenParty(db, TEST_OWNER_USER_ID, { kind: "customer", id: cust });
    const inv = await invoiceSalesOrder(db, TEST_OWNER_USER_ID, so.id);
    expect((await orderInvoices(db as never, so.id)).map((i) => i.id)).toEqual([inv.invoice_id]);

    await recordDocSent(db as never, so.id, TEST_OWNER_USER_ID, { doc: "packing_slip", emailed_to: ["buyer@example.com"] });
    const ev = (await db.query<{ kind: string; detail: { emailed_to: string[] } }>(`SELECT kind, detail FROM perfume.sales_order_events WHERE order_id = $1::uuid AND kind = 'exported_pdf'`, [so.id])).rows;
    expect(ev[0]!.detail.emailed_to).toEqual(["buyer@example.com"]);
  });
});
