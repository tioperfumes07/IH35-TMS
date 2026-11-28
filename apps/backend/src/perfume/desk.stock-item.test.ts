/**
 * LEAD ROUND L.22 (owner 2026-11-27 16:10 CT): "Stock item N" — and an inactive item — is hidden from the desk's lists and still
 * found by search. Real Postgres, rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { buildGrid, deskListRows, invalidateGridCache } from "./desk.service.js";

describe("deskListRows", () => {
  it("hides listed 0 rows unless searched", () => {
    const rows = [{ id: "a", listed: 1, name: "ONE" }, { id: "b", listed: 0, name: "TWO" }];
    expect(deskListRows(rows, "").map((r) => r.id)).toEqual(["a"]);
    expect(deskListRows(rows, null).map((r) => r.id)).toEqual(["a"]);
  });
});

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("Stock item N / inactive off the desk lists (real Postgres, rolled back)", () => {
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

  it("a Stock item N and an inactive item are listed 0 — off the lists, found by search; a regular item stays listed", async () => {
    const item = async (name: string, stock: boolean, active: boolean) => (await db.query<{ id: string }>(
      `INSERT INTO perfume.items (brand, name, size_ml, conc, gender, identity_key, loose_key, display_name, is_stock_item, is_active)
       VALUES ('ZZSTK', $1, 100, 'EDP', 'M', $2, 'x', $3, $4, $5) RETURNING id`, [name, `ZZSTK|${name}|100|EDP|M|`, `ZZSTK · ${name}`, stock, active])).rows[0].id;
    const reg = await item("KEEPS", true, true), non = await item("NONSTOCK", false, true), off = await item("RETIRED", true, false);
    invalidateGridCache();
    const g = await buildGrid(db as never);
    const by = Object.fromEntries(g.rows.filter((r) => [reg, non, off].includes(String(r.id))).map((r) => [String(r.id), r]));
    expect(by[reg]!.listed).toBe(1);
    expect(by[non]!.listed).toBe(0);
    expect(by[off]!.listed).toBe(0);
    const listed = deskListRows(g.rows, "").map((r) => String(r.id));
    expect(listed).toContain(reg);
    expect(listed).not.toContain(non);
    expect(listed).not.toContain(off);
    expect(deskListRows(g.rows, "ZZSTK NONSTOCK").map((r) => String(r.id))).toContain(non);
  });
});
