/**
 * SCENTSX B3b — every kind of stock move posts ONE balanced ScentsX journal entry, by role, through the existing writer;
 * a second run posts nothing; the journal entry points back at the move. Real Postgres, rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { moveValueCents, pendingStockMoves, postPendingStockMoves, postStockMove, rolesForMove, STOCK_MOVE_SOURCE } from "./stock-move-poster.service.js";

describe("stock-move posting map (pure)", () => {
  it("debits and credits the design's accounts for every kind", () => {
    expect(rolesForMove("receipt", 10)).toEqual({ debit: "inventory_asset", credit: "goods_received_not_billed" });
    expect(rolesForMove("shipment", -4)).toEqual({ debit: "cogs_goods", credit: "inventory_asset" });
    expect(rolesForMove("transfer_out", -2)).toEqual({ debit: "inventory_in_transit", credit: "inventory_asset" });
    expect(rolesForMove("transfer_in", 2)).toEqual({ debit: "inventory_asset", credit: "inventory_in_transit" });
    expect(rolesForMove("count", -1)).toEqual({ debit: "inventory_shrink", credit: "inventory_asset" });
    expect(rolesForMove("count", 1)).toEqual({ debit: "inventory_asset", credit: "inventory_shrink" });
    expect(rolesForMove("opening", 5)).toEqual({ debit: "inventory_asset", credit: "opening_balance_equity" });
    expect(rolesForMove("write_down", -1)).toEqual({ debit: "inventory_writedown", credit: "inventory_asset" });
    expect(moveValueCents(-4, "1250.5")).toBe(5002);
  });
});

describe("ScentsX stock-move poster (real Postgres, rolled back)", () => {
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

  it("receipt then shipment post balanced entries on ScentsX's inventory, GRNI and COGS accounts — once", async () => {
    const key = `poster-test-${Date.now()}`;
    const item = await db.query<{ id: string }>(
      `INSERT INTO perfume.items (brand, name, display_name, identity_key, loose_key) VALUES ('Poster test', 'Poster test 100ml', 'Poster test 100ml', $1, $1) RETURNING id::text`, [key]
    );
    const loc = (await db.query<{ code: string }>(`SELECT code FROM perfume.locations WHERE active ORDER BY sort_order LIMIT 1`)).rows[0]!.code;
    const mk = async (kind: string, qty: number, after: number) =>
      (await db.query<{ id: string }>(
        `INSERT INTO perfume.stock_moves (kind, item_id, location_code, qty, unit_cost_cents, qty_after, avg_cost_after_cents)
         VALUES ($1, $2::uuid, $3, $4, 1250, $5, 1250) RETURNING id::text`, [kind, item.rows[0]!.id, loc, qty, after]
      )).rows[0]!.id;
    const receipt = await mk("receipt", 10, 10);
    const shipment = await mk("shipment", -4, 6);
    expect((await pendingStockMoves(db)).ids).toEqual(expect.arrayContaining([receipt, shipment]));

    const actor = { userId: TEST_OWNER_USER_ID, role: "Owner" };
    const r1 = await postStockMove(db, receipt, actor);
    expect(r1).toMatchObject({ posted: true, amount_cents: 12500 });
    const sweep = await postPendingStockMoves(db, actor);
    expect(sweep.failed).toEqual([]);
    expect((await postStockMove(db, receipt, actor))).toMatchObject({ posted: false, reason: "already_posted" });

    const lines = await db.query<{ move: string; num: string; side: string; cents: string; co: string }>(
      `SELECT p.source_transaction_id::text AS move, a.account_number AS num, p.debit_or_credit AS side, p.amount_cents::text AS cents, c.code AS co
         FROM accounting.journal_entry_postings p JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid
         JOIN catalogs.accounts a ON a.id = p.account_id JOIN org.companies c ON c.id = j.operating_company_id
        WHERE p.source_transaction_type = $1 AND p.source_transaction_id = ANY ($2::text[]) ORDER BY move, side`,
      [STOCK_MOVE_SOURCE, [receipt, shipment]]
    );
    const of = (m: string) => lines.rows.filter((l) => l.move === m).map((l) => [l.side, l.num, l.cents, l.co]);
    expect(of(receipt)).toEqual([["credit", "2050", "12500", "SCENTSX"], ["debit", "1200", "12500", "SCENTSX"]]);
    expect(of(shipment)).toEqual([["credit", "1200", "5000", "SCENTSX"], ["debit", "5000", "5000", "SCENTSX"]]);
    expect((await pendingStockMoves(db)).ids).not.toEqual(expect.arrayContaining([receipt]));
  });
});
