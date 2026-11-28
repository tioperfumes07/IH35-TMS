/**
 * SCENTSX M15 landed cost (migration 202617250100): freight-in and customs on a PO bill are spread over the billed stocked lines and
 * moved into the cost of the units still on hand; the share of units already shipped stays in 5100 / 5110. Real Postgres, rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { createLink } from "./links.service.js";
import { loadSanctionsList, screenParty } from "./sanctions.service.js";
import { fixtureFetcher } from "./__fixtures__/ofac-fixture.js";
import { receivePurchase } from "../perfume/purchases.service.js";
import { stockOut } from "../perfume/inventory.service.js";
import { postPendingStockMoves } from "./stock-move-poster.service.js";
import { billPurchaseOrder, purchaseBillSchema, splitCents } from "./purchase-bill.service.js";

describe("splitCents", () => {
  it("parts always sum to the total (largest remainder)", () => {
    expect(splitCents(1000, [1, 1, 1])).toEqual([334, 333, 333]);
    expect(splitCents(5, [0, 0])).toEqual([5, 0]);
    expect(splitCents(999, [2500, 7500])).toEqual([250, 749]);
  });
});

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("ScentsX landed cost on a PO bill (real Postgres, rolled back)", () => {
  let db: pg.Client;
  let co: string;
  const u = TEST_OWNER_USER_ID;
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

  it("receive 10, ship 4, bill 10 + $10 freight + $5 customs → $9 into the 6 on hand, $6 stays in 5100 / 5110", async () => {
    await db.query(`INSERT INTO perfume.locations (code, name, sort_order, active, kind, own) VALUES ('ZZLC', 'ZZ LC', 996, true, 'warehouse', true) ON CONFLICT (code) DO NOTHING`);
    const pv = (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind) VALUES ('LC test vendor', 'buy') RETURNING id::text`)).rows[0]!.id;
    const mv = (await db.query<{ id: string }>(`INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES ($1::uuid, 'LC test vendor', 'Other') RETURNING id::text`, [co])).rows[0]!.id;
    await createLink(db, u, "vendor", pv, mv);
    await loadSanctionsList(db, u, fixtureFetcher);
    await screenParty(db, u, { kind: "vendor", id: mv });
    const item = (await db.query<{ id: string }>(
      `INSERT INTO perfume.items (internal_code, brand, name, display_name, identity_key, loose_key) VALUES ('LC-TEST-1', 'Test Brand', 'LC EDP', 'LC EDP 100ml', 'lc-edp-100-test', 'lc-edp-test') RETURNING id::text`)).rows[0]!.id;
    const po = (await db.query<{ id: string; number: string }>(
      `INSERT INTO perfume.purchase_orders (vendor_id, location_code) VALUES ($1::uuid, 'ZZLC') RETURNING id::text, number`, [pv])).rows[0]!;
    const line = (await db.query<{ id: string }>(
      `INSERT INTO perfume.purchase_order_lines (po_id, line_no, item_id, description, qty, unit_cost_cents) VALUES ($1::uuid, 1, $2::uuid, 'LC EDP 100ml', 10, 1500) RETURNING id::text`,
      [po.id, item])).rows[0]!.id;
    await receivePurchase(db as never, u, po.id, {});
    await stockOut(db as never, u, { kind: "shipment", item_id: item, location_code: "ZZLC", qty: 4 });
    await postPendingStockMoves(db, { userId: u, role: "system" });

    await expect(Promise.resolve().then(() => purchaseBillSchema.parse({ vendor_invoice_number: "X", bill_date: "2026-11-27",
      lines: [{ po_line_id: line, qty: 1 }], charges: [{ description: "Handling", amount_cents: 100 }] }))).rejects.toThrow(/pick the account/);

    const b = await billPurchaseOrder(db as never, u, po.id, purchaseBillSchema.parse({ vendor_invoice_number: "LC-1", bill_date: "2026-11-27",
      lines: [{ po_line_id: line, qty: 10 }],
      charges: [{ description: "Truck to Laredo", amount_cents: 1000, landed: "freight_in" }, { description: "Broker", amount_cents: 500, landed: "customs" }] }));
    expect(b.amount_cents).toBe(15000 + 1500);
    expect(b.landed).toMatchObject({ allocated_cents: 1500, capitalized_cents: 900, expensed_cents: 600 });

    const lot = (await db.query<{ cost: string; left: number }>(`SELECT unit_cost_cents::text AS cost, qty_left AS left FROM perfume.inventory_lots WHERE po_line_id = $1::uuid`, [line])).rows[0]!;
    expect([Number(lot.cost), lot.left]).toEqual([1650, 6]);
    const je = (await db.query<{ num: string; side: string; cents: string }>(
      `SELECT a.account_number AS num, p.debit_or_credit AS side, sum(p.amount_cents)::text AS cents
         FROM accounting.journal_entry_postings p JOIN catalogs.accounts a ON a.id = p.account_id
        WHERE p.journal_entry_uuid = $1::uuid GROUP BY 1, 2 ORDER BY 1, 2`, [b.landed.journal_entry_id])).rows;
    expect(je).toEqual([
      { num: "1200", side: "debit", cents: "900" },
      { num: "5100", side: "credit", cents: "600" },
      { num: "5110", side: "credit", cents: "300" },
    ]);
    const rows = (await db.query<{ kind: string; a: string; c: string; e: string }>(
      `SELECT kind, sum(allocated_cents)::text a, sum(capitalized_cents)::text c, sum(expensed_cents)::text e FROM scentsx.purchase_order_landed_costs
        WHERE bill_id = $1::uuid GROUP BY kind ORDER BY kind`, [b.bill_id])).rows;
    expect(rows).toEqual([{ kind: "customs", a: "500", c: "300", e: "200" }, { kind: "freight_in", a: "1000", c: "600", e: "400" }]);

    // The next shipment takes the landed cost: 6 units out at $16.50.
    const slices = await stockOut(db as never, u, { kind: "shipment", item_id: item, location_code: "ZZLC", qty: 6 });
    expect(slices.reduce((s, x) => s + x.qty * x.unit_cost_cents, 0)).toBe(9900);
  });
});
