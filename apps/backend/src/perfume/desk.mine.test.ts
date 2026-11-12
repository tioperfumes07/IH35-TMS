/**
 * PERFUME-DESK my lists (owner 2026-11-12, real Postgres, rolled back): my inventory gives stock and last cost, my
 * offer list gives my offer price; "Need to buy" = offered and short in stock; the selector narrows the grid.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { buildGrid, filterMine, importList } from "./desk.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("perfume my offer list + my inventory (real Postgres, rolled back)", () => {
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

  it("stock, last cost, offer price, need to buy, and the selector", async () => {
    const v = async (name: string, kind: string) => (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind) VALUES ($1, $2) RETURNING id`, [name, kind])).rows[0].id;
    const sup = await v("MINE TEST SUP", "buy");
    const inv = await v("MINE TEST INV", "inventory");
    const off = await v("MINE TEST OFFER", "offer");
    const line = (row_no: number, upc: string, d: string, price: string, qty?: number) => ({ row_no, upc, brand: "ZZMINE", description: d, price, ...(qty == null ? {} : { qty }) });
    await importList(db as never, TEST_OWNER_USER_ID, { vendor_id: sup, list_date: "2026-11-12", file_name: "s.xlsx", source_kind: "xlsx", rows_read: 2, file_price_total_cents: 3000,
      rows: [line(1, "8100000000011", "ZZMINE ALPHA (W) EDP SP 3.4oz", "15.00"), line(2, "8100000000028", "ZZMINE BETA (M) EDT SP 3.4oz", "15.00")] });
    await importList(db as never, TEST_OWNER_USER_ID, { vendor_id: inv, list_date: "2026-11-12", file_name: "inv.xlsx", source_kind: "xlsx", rows_read: 1, file_price_total_cents: 1400,
      rows: [line(1, "8100000000011", "ZZMINE ALPHA (W) EDP SP 3.4oz", "14.00", 2)] });
    await importList(db as never, TEST_OWNER_USER_ID, { vendor_id: off, list_date: "2026-11-12", file_name: "offer.xlsx", source_kind: "xlsx", rows_read: 2, file_price_total_cents: 4000,
      rows: [line(1, "8100000000011", "ZZMINE ALPHA (W) EDP SP 3.4oz", "20.00", 5), line(2, "8100000000028", "ZZMINE BETA (M) EDT SP 3.4oz", "20.00")] });

    const g = await buildGrid(db as never, {});
    const alpha = g.rows.find((r) => r.name === "ALPHA" && r.brand === "ZZMINE")!;
    const beta = g.rows.find((r) => r.name === "BETA" && r.brand === "ZZMINE")!;
    expect([alpha.my_qty, alpha.my_last_cost, alpha.my_offer_price, alpha.my_need]).toEqual([2, 1400, 2000, 3]);
    expect([beta.my_qty, beta.my_offer_price, beta.my_need]).toEqual([null, 2000, 1]);
    // My lists are never a supplier or a competitor column.
    expect(g.cols.some((c) => c.key.includes(inv) || c.key.includes(off))).toBe(false);
    expect(g.cols.map((c) => c.key)).toEqual(expect.arrayContaining(["my_qty", "my_last_cost", "my_offer_price", "my_need"]));
    const mineRows = (m: "offer" | "inventory" | "need") => filterMine(g.rows, m).filter((r) => r.brand === "ZZMINE").map((r) => r.name).sort();
    expect(mineRows("offer")).toEqual(["ALPHA", "BETA"]);
    expect(mineRows("inventory")).toEqual(["ALPHA"]);
    expect(mineRows("need")).toEqual(["ALPHA", "BETA"]);
  });
});
