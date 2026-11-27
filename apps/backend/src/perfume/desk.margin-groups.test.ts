/**
 * PERFUME-DESK margin groups (owner 2026-11-27 15:40 CT): "so i can set different percentages for different products, exclusive, new
 * launches, testers, mini, sets, etc. regular goods … these filters must be added to all processes … the same for trading sell to my
 * vendors". Each item lands in one group; the group's saved % prices it (target price, list-analysis minimum margin) and sets what a
 * vendor earns on Trading; a % typed on the tab wins for every row; the Group facet filters the grid.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { buildGrid, filterFacets, getRules, groupPct, invalidateGridCache, marginGroupOf, putRules } from "./desk.service.js";
import { closeCents, priceFromCost } from "./pricing.js";

describe("margin group of an item", () => {
  it("New launch, then Exclusive, then the TESTER / SET / MINI flags, else Regular", () => {
    expect(marginGroupOf({ flags: [] })).toBe("regular");
    expect(marginGroupOf({ flags: ["MINI"] })).toBe("mini");
    expect(marginGroupOf({ flags: ["SET", "MINI"] })).toBe("set");
    expect(marginGroupOf({ flags: ["TESTER", "SET"] })).toBe("tester");
    expect(marginGroupOf({ flags: ["TESTER"], is_exclusive: true })).toBe("exclusive");
    expect(marginGroupOf({ flags: ["TESTER"], is_exclusive: true, is_new_launch: true })).toBe("new_launch");
    expect(groupPct({ tester: 30, set: null }, "tester", 11)).toBe(30);
    expect(groupPct({ tester: 30, set: null }, "set", 11)).toBe(11);
    expect(groupPct(undefined, "regular", 12.5)).toBe(12.5);
  });
});

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("margin groups on the desk grid (real Postgres, rolled back)", () => {
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

  it("each group's % prices its rows; Trading earns by group; a typed % wins; the Group facet filters", async () => {
    const item = async (name: string, flags: string[], marks: { ex?: boolean; nl?: boolean } = {}) => (await db.query<{ id: string }>(
      `INSERT INTO perfume.items (brand, name, size_ml, conc, gender, flags, identity_key, loose_key, display_name, is_exclusive, is_new_launch)
       VALUES ('ZZMG', $1, 100, 'EDP', 'M', $2, $3, 'x', $4, $5, $6) RETURNING id`,
      [name, flags, `ZZMG|${name}|100|EDP|M|${flags.join(",")}`, `ZZMG · ${name}`, marks.ex ?? false, marks.nl ?? false])).rows[0].id;
    const reg = await item("REGULAR", []), tst = await item("TESTER", ["TESTER"]), exc = await item("EXCL", [], { ex: true }), nl = await item("LAUNCH", [], { nl: true });
    const v = (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind, roles) VALUES ('ZZMG Supplier', 'buy', '{purchase,trading}') RETURNING id`)).rows[0].id;
    const l = (await db.query<{ id: string }>(
      `INSERT INTO perfume.price_lists (vendor_id, list_date, file_name, source_kind, rows_read, rows_saved, rows_skipped, price_total_file_cents, price_total_saved_cents, is_current)
       VALUES ($1, current_date, 'mg.xlsx', 'xlsx', 4, 4, 0, 0, 0, true) RETURNING id`, [v])).rows[0].id;
    let n = 0;
    for (const id of [reg, tst, exc, nl]) {
      await db.query(`INSERT INTO perfume.price_list_rows (list_id, row_no, raw, description, price_cents, identity_key, loose_key, item_id, match_method, match_status)
         VALUES ($1, $2, '{}', 'ZZMG LINE', 2000, 'x', 'x', $3, 'key', 'matched')`, [l, ++n, id]);
    }
    await putRules(db as never, TEST_OWNER_USER_ID, { round_step: "25", round_dir: "up", group_margins: { tester: 30, exclusive: 20, new_launch: 25 }, group_earn: { tester: 5 } });
    const rules = await getRules(db as never);
    invalidateGridCache();
    const g = await buildGrid(db as never);
    const row = (id: string) => g.rows.find((r) => r.id === id)!;
    const dflt = g.target_pct;
    for (const [id, group, pct] of [[reg, "Regular", dflt], [tst, "Tester", 30], [exc, "Exclusive", 20], [nl, "New launch", 25]] as const) {
      const r = row(id);
      expect([r.margin_group, r.margin_pct]).toEqual([group, pct]);
      // The price that earns the group's margin on the estimated cost, closed up to the next $0.25.
      expect(r.target_price_margin).toBe(closeCents(priceFromCost(Number(r.landed_likely), pct, "margin"), "25", "up"));
      expect(Number(r.target_price_margin) % 25).toBe(0);
      expect(r["a:min_margin"]).toBe(id === reg ? 15 : pct);
    }
    // Trading: the tester's vendor earns the tester group's 5 %; the regular item the vendor rule.
    expect(row(tst)[`t:${v}:pct`]).toBe(5);
    expect(row(reg)[`t:${v}:pct`]).toBe(rules.vendor_earn_pct);
    // The Group facet.
    expect(filterFacets(g.rows.filter((r) => String(r.brand) === "ZZMG"), { category: [], gender: [], brand: [], group: ["Tester", "Exclusive"] }).map((r) => r.id).sort()).toEqual([tst, exc].sort());
    // A % typed on the tab applies to every row.
    invalidateGridCache();
    const typed = await buildGrid(db as never, { targetPct: 9 });
    expect(typed.rows.filter((r) => [reg, tst, exc].includes(String(r.id))).map((r) => r.margin_pct)).toEqual([9, 9, 9]);
  });
});
