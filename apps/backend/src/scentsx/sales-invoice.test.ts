/**
 * SCENTSX B3c — a shipped sales order is invoiced in ScentsX's books, each shipped unit exactly once. Real Postgres, rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { createLink, ScentsxLinkInvalid } from "./links.service.js";
import { billableLines, invoiceSalesOrder } from "./sales-invoice.service.js";

describe("ScentsX sales-order invoicing (real Postgres, rolled back)", () => {
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

  it("bills shipped units only, once each, on ScentsX's wholesale revenue account", async () => {
    const co = await db.query<{ id: string }>(`INSERT INTO perfume.contact_companies (name, source) VALUES ('Invoice test buyer', 'test') RETURNING id::text`);
    const so = await db.query<{ id: string }>(
      `INSERT INTO perfume.sales_orders (company_id, customer_name) VALUES ($1::uuid, 'Invoice test buyer') RETURNING id::text`, [co.rows[0]!.id]
    );
    await db.query(
      `INSERT INTO perfume.sales_order_lines (order_id, line_no, description, qty, qty_shipped, unit_price_cents) VALUES ($1::uuid, 1, 'Test EDP 100ml', 10, 4, 2500)`,
      [so.rows[0]!.id]
    );
    await db.query("SAVEPOINT nolink");
    await expect(invoiceSalesOrder(db, TEST_OWNER_USER_ID, so.rows[0]!.id)).rejects.toBeInstanceOf(ScentsxLinkInvalid);
    await db.query("ROLLBACK TO SAVEPOINT nolink");

    const cust = await db.query<{ id: string }>(
      `INSERT INTO mdata.customers (customer_name, operating_company_id, is_sample_data) VALUES ('Invoice test buyer', scentsx.company_id(), true) RETURNING id::text`
    );
    await createLink(db, TEST_OWNER_USER_ID, "customer", co.rows[0]!.id, cust.rows[0]!.id);

    const first = await invoiceSalesOrder(db, TEST_OWNER_USER_ID, so.rows[0]!.id);
    expect(first).toMatchObject({ lines: 1, units: 4 });
    const inv = await db.query<{ co: string; status: string; total_cents: string; acct: string; qty: string }>(
      `SELECT c.code AS co, i.status, i.total_cents::text, a.account_number AS acct, il.quantity::text AS qty
         FROM accounting.invoices i JOIN org.companies c ON c.id = i.operating_company_id
         JOIN accounting.invoice_lines il ON il.invoice_id = i.id JOIN catalogs.accounts a ON a.id = il.account_id
        WHERE i.id = $1::uuid`, [first.invoice_id]
    );
    expect(inv.rows[0]).toMatchObject({ co: "SCENTSX", status: "draft", total_cents: "10000", acct: "4000" });
    expect(Number(inv.rows[0]!.qty)).toBe(4);

    await db.query("SAVEPOINT nothing");
    await expect(invoiceSalesOrder(db, TEST_OWNER_USER_ID, so.rows[0]!.id)).rejects.toThrow(/left to invoice/);
    await db.query("ROLLBACK TO SAVEPOINT nothing");

    await db.query(`UPDATE perfume.sales_order_lines SET qty_shipped = 10 WHERE order_id = $1::uuid`, [so.rows[0]!.id]);
    expect((await billableLines(db, so.rows[0]!.id))[0]).toMatchObject({ shipped: 10, billed: 4, to_bill: 6 });
    const second = await invoiceSalesOrder(db, TEST_OWNER_USER_ID, so.rows[0]!.id, "export");
    expect(second).toMatchObject({ units: 6 });
    const acct2 = await db.query<{ acct: string }>(
      `SELECT a.account_number AS acct FROM accounting.invoice_lines il JOIN catalogs.accounts a ON a.id = il.account_id WHERE il.invoice_id = $1::uuid`, [second.invoice_id]
    );
    expect(acct2.rows[0]!.acct).toBe("4020");
  });
});
