/**
 * SCENTSX purchase bills (migration 202617120100): a received perfume PO billed through the one bill writer + poster.
 * Receipt: Dr Inventory 1200 / Cr GRNI 2050 (stock-move poster). Bill: Dr GRNI 2050 / Cr A/P 2000 at the vendor's price, the price
 * difference between GRNI and COGS 5000, so GRNI nets to zero for every unit billed. Vendor return: Dr GRNI / Cr Inventory.
 * Real Postgres, rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { createLink } from "./links.service.js";
import { loadSanctionsList, screenParty } from "./sanctions.service.js";
import { fixtureFetcher } from "./__fixtures__/ofac-fixture.js";
import { receivePurchase, returnToVendor } from "../perfume/purchases.service.js";
import { postPendingStockMoves } from "./stock-move-poster.service.js";
import { billablePoLines, billPurchaseOrder, purchaseOrderBills } from "./purchase-bill.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("ScentsX purchase bills (real Postgres, rolled back)", () => {
  let db: pg.Client;
  let co: string;
  const u = TEST_OWNER_USER_ID;
  const net = async (num: string, ids: string[]) => Number((await db.query<{ n: string }>(
    `SELECT coalesce(sum(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END), 0)::text n
       FROM accounting.journal_entry_postings p JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid JOIN catalogs.accounts a ON a.id = p.account_id
      WHERE j.operating_company_id = $1::uuid AND a.account_number = $2 AND p.source_transaction_id = ANY ($3::text[])`, [co, num, ids])).rows[0]!.n);
  const acct = async (num: string) =>
    (await db.query<{ id: string }>(`SELECT id::text FROM catalogs.accounts WHERE operating_company_id = $1::uuid AND account_number = $2 AND deactivated_at IS NULL`, [co, num])).rows[0]!.id;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect();
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    co = (await db.query<{ id: string }>(`SELECT id::text FROM org.companies WHERE code = 'SCENTSX'`)).rows[0]!.id;
    await db.query(
      `INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, enabled, set_by_user_uuid)
       SELECT f.flag_key, $1::uuid, true, $2::uuid FROM lib.feature_flags f WHERE f.flag_key = ANY ($3::text[])
       ON CONFLICT (flag_key, operating_company_id) WHERE user_uuid IS NULL AND operating_company_id IS NOT NULL DO UPDATE SET enabled = true`,
      [co, u, ["GL_POSTING_ENABLED", "BILL_GL_POSTING_ENABLED", "SCENTSX_STOCK_MOVE_GL_POSTING_ENABLED"]]);
  });
  afterAll(async () => {
    await db?.query("ROLLBACK").catch(() => {});
    await db?.end().catch(() => {});
  });

  it("receive → bill at a higher vendor price → GRNI nets to zero, A/P = vendor total; billed once; vendor return reverses the receipt", async () => {
    await db.query(`INSERT INTO perfume.locations (code, name, sort_order, active, kind, own) VALUES ('ZZPB', 'ZZ PB', 995, true, 'warehouse', true) ON CONFLICT (code) DO NOTHING`);
    const pv = (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind) VALUES ('PB test vendor', 'buy') RETURNING id::text`)).rows[0]!.id;
    const mv = (await db.query<{ id: string }>(`INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES ($1::uuid, 'PB test vendor', 'Other') RETURNING id::text`, [co])).rows[0]!.id;
    await createLink(db, u, "vendor", pv, mv);
    await loadSanctionsList(db, u, fixtureFetcher);
    await screenParty(db, u, { kind: "vendor", id: mv });
    const item = (await db.query<{ id: string }>(
      `INSERT INTO perfume.items (internal_code, brand, name, display_name, identity_key, loose_key) VALUES ('PB-TEST-1', 'Test Brand', 'PB EDP', 'PB EDP 100ml', 'pb-edp-100-test', 'pb-edp-test') RETURNING id::text`)).rows[0]!.id;
    const po = (await db.query<{ id: string; number: string }>(
      `INSERT INTO perfume.purchase_orders (vendor_id, location_code, terms) VALUES ($1::uuid, 'ZZPB', 'Net 30') RETURNING id::text, number`, [pv])).rows[0]!;
    const line = (await db.query<{ id: string }>(
      `INSERT INTO perfume.purchase_order_lines (po_id, line_no, item_id, description, qty, unit_cost_cents) VALUES ($1::uuid, 1, $2::uuid, 'PB EDP 100ml', 10, 1500) RETURNING id::text`,
      [po.id, item])).rows[0]!.id;

    // Nothing received → nothing to bill.
    await expect(billPurchaseOrder(db as never, u, po.id, { vendor_invoice_number: "PB-0", bill_date: "2026-11-27", lines: [{ po_line_id: line, qty: 1 }], charges: [] }))
      .rejects.toThrow(/0 received and not billed/);

    await receivePurchase(db as never, u, po.id, {});
    await postPendingStockMoves(db, { userId: u, role: "system" });
    const receiptIds = (await db.query<{ id: string }>(`SELECT id::text FROM perfume.stock_moves WHERE po_line_id = $1::uuid`, [line])).rows.map((r) => r.id);
    expect(await net("2050", receiptIds)).toBe(-15000); // Cr GRNI $150.00
    expect((await billablePoLines(db as never, po.id))[0]).toMatchObject({ received: 10, received_value_cents: 15000, billed: 0, to_bill: 10 });

    // Bill 6 of 10 at the vendor's $16.00 (received at $15.00) + $12.50 freight to 5000-series account 5100 if present, else 5000.
    const freightAcct = await acct("5000");
    const b1 = await billPurchaseOrder(db as never, u, po.id, { vendor_invoice_number: "PB-1001", bill_date: "2026-11-27",
      lines: [{ po_line_id: line, qty: 6, unit_price_cents: 1600 }], charges: [{ account_id: freightAcct, description: "Freight in", amount_cents: 1250 }] });
    expect(b1).toMatchObject({ amount_cents: 6 * 1600 + 1250, variance_cents: 9000 - 9600, units: 6 });
    const bill = (await db.query(`SELECT b.status, b.due_date::text AS due, b.source, b.amount_cents::int AS amt FROM accounting.bills b WHERE b.id = $1::uuid`, [b1.bill_id])).rows[0];
    expect(bill).toMatchObject({ due: "2026-12-27", source: "perfume_purchase", amt: 10850 });
    // Bill: Dr GRNI 9600 + Dr 5000 1250 / Cr A/P 10850. Variance: Dr COGS 600 / Cr GRNI 600 → GRNI for the 6 units = +9600 − 600 = +9000.
    expect(await net("2000", [b1.bill_id])).toBe(-10850);
    expect(await net("2050", [b1.bill_id])).toBe(9600 - 600);
    expect(await net("5000", [b1.bill_id])).toBe(1250 + 600);

    // A unit is billed once: 4 left; 5 refused.
    expect((await billablePoLines(db as never, po.id))[0]).toMatchObject({ billed: 6, to_bill: 4 });
    await expect(billPurchaseOrder(db as never, u, po.id, { vendor_invoice_number: "PB-1002", bill_date: "2026-11-27", lines: [{ po_line_id: line, qty: 5 }], charges: [] }))
      .rejects.toThrow(/4 received and not billed yet — 5 asked/);

    // Send 1 back to the vendor: Dr GRNI / Cr Inventory (was Dr Inventory / Cr COGS) — 3 left to bill.
    await returnToVendor(db as never, u, line, 1);
    await postPendingStockMoves(db, { userId: u, role: "system" });
    const ret = (await db.query<{ id: string }>(`SELECT id::text FROM perfume.stock_moves WHERE po_line_id = $1::uuid AND kind = 'return'`, [line])).rows.map((r) => r.id);
    expect(await net("2050", ret)).toBe(1500);
    expect(await net("1200", ret)).toBe(-1500);
    expect((await billablePoLines(db as never, po.id))[0]).toMatchObject({ received: 9, received_value_cents: 13500, billed: 6, to_bill: 3 });

    // Bill the last 3 at the received price: no variance; GRNI for this PO is back to exactly zero.
    const b2 = await billPurchaseOrder(db as never, u, po.id, { vendor_invoice_number: "PB-1003", bill_date: "2026-11-27", lines: [{ po_line_id: line, qty: 3 }], charges: [] });
    expect(b2).toMatchObject({ amount_cents: 4500, variance_cents: 0, variance_journal_entry_id: null });
    const all = [...receiptIds, ...ret, b1.bill_id, b2.bill_id];
    expect(await net("2050", all)).toBe(0);
    expect(await net("2000", all)).toBe(-(10850 + 4500));
    expect((await purchaseOrderBills(db as never, po.id)).map((b) => b.units)).toEqual([3, 6]);

    // Same vendor invoice number again → refused by the bill writer's duplicate control.
    await db.query(`INSERT INTO perfume.purchase_order_lines (po_id, line_no, item_id, description, qty, qty_received, unit_cost_cents) VALUES ($1::uuid, 2, NULL, 'Handling', 1, 1, 700)`, [po.id]);
    const l2 = (await billablePoLines(db as never, po.id)).find((l) => l.line_no === 2)!;
    await expect(billPurchaseOrder(db as never, u, po.id, { vendor_invoice_number: "PB-1004", bill_date: "2026-11-27", lines: [{ po_line_id: l2.po_line_id, qty: 1 }], charges: [] }))
      .rejects.toThrow(/has no item — pick the account/);
  });
});
