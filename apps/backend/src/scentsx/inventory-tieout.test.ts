/**
 * SCENTSX B10 — the stock sub-ledger ties to the inventory account: before posting the gap is exactly "waiting to post";
 * after the sweep it is in the GL; the difference is zero both times. Real Postgres, rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { inventoryTieOut } from "./inventory-tieout.service.js";
import { postPendingStockMoves } from "./stock-move-poster.service.js";

describe("ScentsX inventory tie-out (real Postgres, rolled back)", () => {
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

  it("sub-ledger = GL + waiting, before and after posting", async () => {
    const before = await inventoryTieOut(db);
    const key = `tieout-test-${Date.now()}`;
    const item = await db.query<{ id: string }>(
      `INSERT INTO perfume.items (brand, name, display_name, identity_key, loose_key) VALUES ('Tie test', 'Tie test 50ml', 'Tie test 50ml', $1, $1) RETURNING id::text`, [key]
    );
    const loc = (await db.query<{ code: string }>(`SELECT code FROM perfume.locations WHERE active ORDER BY sort_order LIMIT 1`)).rows[0]!.code;
    for (const [kind, qty, after] of [["receipt", 10, 10], ["shipment", -4, 6]] as const) {
      await db.query(
        `INSERT INTO perfume.stock_moves (kind, item_id, location_code, qty, unit_cost_cents, qty_after, avg_cost_after_cents)
         VALUES ($1, $2::uuid, $3, $4, 1250, $5, 1250)`, [kind, item.rows[0]!.id, loc, qty, after]
      );
    }
    const mid = await inventoryTieOut(db);
    expect(mid.subledger_cents - before.subledger_cents).toBe(7500);
    expect(mid.waiting_cents - before.waiting_cents).toBe(7500);
    expect(mid.ties).toBe(true);

    const sweep = await postPendingStockMoves(db, { userId: TEST_OWNER_USER_ID, role: "Owner" });
    expect(sweep.failed).toEqual([]);
    const after = await inventoryTieOut(db);
    expect(after.gl_cents - mid.gl_cents).toBe(mid.waiting_cents - after.waiting_cents);
    expect(after.ties).toBe(true);
    expect(after.difference_cents).toBe(0);
  });
});
