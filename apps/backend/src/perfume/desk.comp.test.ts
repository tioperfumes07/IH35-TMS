/**
 * PERFUME-DESK competition margin (owner 2026-11-12 5:11 PM ET, real Postgres, rolled back): "a tab … an engine, check
 * the margin of the competition if purchasing from the same vendors, the lowest cost vendors … the cushion .25 under
 * $10, .50 over $10, 1.00 over $30." Their cost ≈ cheapest supplier list price − tiered cushion; they earn = their
 * price − that; margin % = earn ÷ their price.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { DEFAULT_RULES, buildGrid, filterView, importList, tieredCushionCents, upsertVendor } from "./desk.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describe("tieredCushionCents (owner tiers)", () => {
  const t = DEFAULT_RULES.competitor_cushion_tiers;
  it.each([[500, 25], [1000, 25], [1001, 50], [3000, 50], [3001, 100], [9000, 100]])("$%i cents → %i cents", (p, c) => {
    expect(tieredCushionCents(p, t)).toBe(c);
  });
  it("no tiers → no cushion", () => expect(tieredCushionCents(5000, [])).toBe(0));
});

describeIntegration("competition margin tab (real Postgres, rolled back)", () => {
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

  it("cheapest supplier − tier cushion = their cost; earn and margin per competitor", async () => {
    const a = await upsertVendor(db as never, TEST_OWNER_USER_ID, { name: "COMP TEST SUP A", kind: "buy", short_name: "CTA" });
    const b = await upsertVendor(db as never, TEST_OWNER_USER_ID, { name: "COMP TEST SUP B", kind: "buy", short_name: "CTB" });
    const s = await upsertVendor(db as never, TEST_OWNER_USER_ID, { name: "COMP TEST STORE", kind: "sell", short_name: "CTS" });
    const l = (row_no: number, upc: string, d: string, price: string) => ({ row_no, upc, brand: "ZZCOMP", description: d, price });
    const imp = (vendor_id: string, rows: ReturnType<typeof l>[], tot: number) => importList(db as never, TEST_OWNER_USER_ID, { vendor_id, list_date: "2026-11-12", file_name: "x.xlsx", source_kind: "xlsx", rows_read: rows.length, file_price_total_cents: tot, rows });
    // DELTA $35.00 at A and $32.00 at B (cheapest, over $30 → $1.00 cushion); EPSILON $8.00 at A only (≤ $10 → $0.25).
    await imp(a.id, [l(1, "8100000000042", "ZZCOMP DELTA (M) EDT SP 3.4oz", "35.00"), l(2, "8100000000059", "ZZCOMP EPSILON (W) EDP SP 1oz", "8.00")], 4300);
    await imp(b.id, [l(1, "8100000000042", "ZZCOMP DELTA (M) EDT SP 3.4oz", "32.00")], 3200);
    await imp(s.id, [l(1, "8100000000042", "ZZCOMP DELTA (M) EDT SP 3.4oz", "37.00"), l(2, "8100000000059", "ZZCOMP EPSILON (W) EDP SP 1oz", "9.00")], 4600);
    const g = await buildGrid(db as never, {});
    const row = (n: string) => g.rows.find((r) => r.brand === "ZZCOMP" && r.name === n)!;
    const d = row("DELTA"), e = row("EPSILON");
    expect([d.comp_low_vendor, d.comp_low_list, d.comp_cushion, d.comp_cost]).toEqual(["CTB", 3200, 100, 3100]);
    expect([d[`c:${s.id}:price`], d[`c:${s.id}:earn`], d[`c:${s.id}:margin`]]).toEqual([3700, 600, 16.2]);
    expect([e.comp_low_vendor, e.comp_cushion, e.comp_cost, e[`c:${s.id}:earn`], e[`c:${s.id}:margin`]]).toEqual(["CTA", 25, 775, 125, 13.9]);
    expect(g.cols.find((c) => c.key === `c:${s.id}:margin`)).toMatchObject({ label: "Margin %", group: "Margin · CTS", kind: "pct" });
    expect(filterView(g.rows, "comp").filter((r) => r.brand === "ZZCOMP").length).toBe(2);
  });
});
