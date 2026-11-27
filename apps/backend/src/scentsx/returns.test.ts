/**
 * SCENTSX sales returns (migration 202617080100 — CONTROL Returns parity, owner 2026-11-27 13:50 CT): a return against an issued
 * invoice makes a credit memo to 4800 through the one credit-memo writer (applied while the invoice has a balance, else customer
 * credit) and, when restocked, a 'return' stock move at the cost the units shipped at; never more than was billed. Real Postgres,
 * rolled back.
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
import { stockIn } from "../perfume/inventory.service.js";
import { shipOrder } from "../perfume/orders.service.js";
import { createReturn, listReturns, returnableLines } from "./returns.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("ScentsX sales returns (real Postgres, rolled back)", () => {
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

  it("credit memo to 4800 + restock at shipped cost; caps at what was billed; paid invoice → customer credit; draft refused", async () => {
    await db.query(`INSERT INTO perfume.locations (code, name, sort_order, active, kind, own) VALUES ('ZZRT', 'ZZ RT', 996, true, 'warehouse', true) ON CONFLICT (code) DO NOTHING`);
    const co = await db.query<{ id: string }>(`INSERT INTO perfume.contact_companies (name, source) VALUES ('Return test buyer', 'test') RETURNING id::text`);
    const item = (await db.query<{ id: string }>(
      `INSERT INTO perfume.items (internal_code, brand, name, display_name, identity_key, loose_key) VALUES ('RT-TEST-1', 'Test Brand', 'RT EDP', 'RT EDP 100ml', 'rt-edp-100-test', 'rt-edp-test') RETURNING id::text`)).rows[0]!.id;
    const cid = (await db.query<{ id: string }>(`INSERT INTO mdata.customers (customer_name, operating_company_id, is_sample_data) VALUES ('Return test buyer', scentsx.company_id(), false) RETURNING id::text`)).rows[0]!.id;
    await createLink(db, u, "customer", co.rows[0]!.id, cid);
    await loadSanctionsList(db, u, fixtureFetcher);
    await screenParty(db, u, { kind: "customer", id: cid });
    // 10 in stock at $15.00; order 10 at $25.00; ship all; invoice; issue.
    await stockIn(db as never, u, { kind: "receipt", item_id: item, location_code: "ZZRT", qty: 10, unit_cost_cents: 1500, source: "receipt" });
    const so = (await db.query<{ id: string }>(`INSERT INTO perfume.sales_orders (company_id, customer_name, location_code) VALUES ($1::uuid, 'Return test buyer', 'ZZRT') RETURNING id::text`, [co.rows[0]!.id])).rows[0]!.id;
    const line = (await db.query<{ id: string }>(`INSERT INTO perfume.sales_order_lines (order_id, line_no, item_id, description, qty, unit_price_cents, cost_cents) VALUES ($1::uuid, 1, $2::uuid, 'RT EDP 100ml', 10, 2500, 1500) RETURNING id::text`, [so, item])).rows[0]!.id;
    await shipOrder(db as never, u, so);
    const inv = await invoiceSalesOrder(db, u, so);
    await expect(createReturn(db as never, u, { invoice_id: inv.invoice_id, reason: "damaged", lines: [{ so_line_id: line, qty: 1, restock: false }] })).rejects.toThrow(/only an issued invoice/);
    await db.query(`UPDATE accounting.invoices SET status = 'sent', sent_at = now() WHERE id = $1::uuid`, [inv.invoice_id]);

    // Return 3, back to stock: credit memo $75.00 to 4800 applied to the invoice; 3 units back in at $15.00.
    const r1 = await createReturn(db as never, u, { invoice_id: inv.invoice_id, reason: "wrong_item", lines: [{ so_line_id: line, qty: 3, restock: true }] });
    expect(r1).toMatchObject({ merchandise_cents: 7500, tax_cents: 0 });
    expect(r1.return_no).toMatch(/^RET-\d{4}-\d{5}$/);
    const m1 = (await db.query(`SELECT cm.amount_cents::int, cm.amount_applied_cents::int, cm.status, cm.related_invoice_id::text, a.account_number, cm.journal_entry_id IS NOT NULL AS posted
       FROM accounting.credit_memos cm JOIN catalogs.accounts a ON a.id = cm.account_id WHERE cm.id = $1::uuid`, [r1.credit_memo_ids[0]])).rows[0];
    expect(m1).toMatchObject({ amount_cents: 7500, amount_applied_cents: 7500, status: "applied", related_invoice_id: inv.invoice_id, account_number: "4800", posted: true });
    const mv = (await db.query(`SELECT kind, qty, unit_cost_cents::int AS unit FROM perfume.stock_moves WHERE so_line_id = $1::uuid AND kind = 'return'`, [line])).rows;
    expect(mv).toEqual([{ kind: "return", qty: 3, unit: 1500 }]);
    expect((await db.query(`SELECT qty_shipped FROM perfume.sales_order_lines WHERE id = $1::uuid`, [line])).rows[0]!.qty_shipped).toBe(10); // the sale stands

    // At most 7 more.
    await expect(createReturn(db as never, u, { invoice_id: inv.invoice_id, reason: "other", lines: [{ so_line_id: line, qty: 8, restock: false }] })).rejects.toThrow(/at most 7/);

    // Paid in full ($175.00 left after the credit) → the next return is the customer's credit, not applied; not restocked = no move.
    const pay = (await db.query<{ id: string }>(
      `INSERT INTO accounting.payments (operating_company_id, customer_id, display_id, payment_method, payment_date, amount_cents, created_by_user_id)
       VALUES (scentsx.company_id(), $1::uuid, 'PMT-2026-99902', 'check', CURRENT_DATE, 17500, $2::uuid) RETURNING id::text`, [cid, u])).rows[0]!.id;
    await db.query(`INSERT INTO accounting.payment_applications (operating_company_id, payment_id, invoice_id, target_kind, target_id, amount_cents, amount_applied, applied_by_user_id)
      VALUES (scentsx.company_id(), $1::uuid, $2::uuid, 'invoice', $2::uuid, 17500, 175, $3::uuid)`, [pay, inv.invoice_id, u]);
    const r2 = await createReturn(db as never, u, { invoice_id: inv.invoice_id, reason: "damaged", lines: [{ so_line_id: line, qty: 2, restock: false }] });
    const m2 = (await db.query(`SELECT amount_cents::int, amount_applied_cents::int, status FROM accounting.credit_memos WHERE id = $1::uuid`, [r2.credit_memo_ids[0]])).rows[0];
    expect(m2).toMatchObject({ amount_cents: 5000, amount_applied_cents: 0 });
    expect((await db.query(`SELECT count(*)::int n FROM perfume.stock_moves WHERE so_line_id = $1::uuid AND kind = 'return'`, [line])).rows[0]!.n).toBe(1);

    const rl = await returnableLines(db as never, inv.invoice_id);
    expect(rl.lines[0]).toMatchObject({ billed: 10, returned: 5, can_return: 5 });
    expect(rl.returns.map((r) => r.merchandise_cents)).toEqual([7500, 5000]);
    expect((await listReturns(db as never)).filter((r) => r.invoice_id === inv.invoice_id).map((r) => [r.units, r.restocked])).toEqual([[2, 0], [3, 3]]);
  });
});
