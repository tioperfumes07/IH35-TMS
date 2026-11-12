/**
 * PERFUME-DESK vendor short names (owner 2026-11-12 5:02 PM ET, real Postgres, rolled back): "abbreviate … PCA, MTZ,
 * NAND, PPW … remove 'after cushion' … just cushion." The short name is the column header in every tab; a vendor
 * with no short name keeps its full name; the upsert stores it upper-case.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { buildGrid, importList, upsertVendor, vendorLabel } from "./desk.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describe("vendorLabel", () => {
  it("short name wins, blank falls back to the full name", () => {
    expect(vendorLabel({ name: "Perfume Center of America (Kanak)", short_name: "PCA" })).toBe("PCA");
    expect(vendorLabel({ name: "Darielle", short_name: "  " })).toBe("Darielle");
    expect(vendorLabel({ name: "Darielle", short_name: null })).toBe("Darielle");
  });
});

describeIntegration("perfume vendor short names in the grid (real Postgres, rolled back)", () => {
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

  it("headers use the short name; purchase second column is 'Cushion'", async () => {
    const a = await upsertVendor(db as never, TEST_OWNER_USER_ID, { name: "SHORTNAME TEST SUPPLIER LONG NAME", kind: "buy", short_name: "stsl" });
    expect(a.short_name).toBe("STSL");
    const b = await upsertVendor(db as never, TEST_OWNER_USER_ID, { name: "SHORTNAME TEST STORE", kind: "sell" });
    const line = { row_no: 1, upc: "8100000000035", brand: "ZZSHORT", description: "ZZSHORT GAMMA (W) EDP SP 3.4oz", price: "15.00" };
    await importList(db as never, TEST_OWNER_USER_ID, { vendor_id: a.id, list_date: "2026-11-12", file_name: "a.xlsx", source_kind: "xlsx", rows_read: 1, file_price_total_cents: 1500, rows: [line] });
    await importList(db as never, TEST_OWNER_USER_ID, { vendor_id: b.id, list_date: "2026-11-12", file_name: "b.xlsx", source_kind: "xlsx", rows_read: 1, file_price_total_cents: 1500, rows: [line] });
    const g = await buildGrid(db as never, {});
    const col = (k: string) => g.cols.find((c) => c.key === k)!;
    expect(col(`v:${a.id}:price`)).toMatchObject({ label: "List price", group: "STSL" });
    expect(col(`v:${a.id}:net`)).toMatchObject({ label: "Cushion", group: "STSL" });
    expect(col(`t:${a.id}:list`).group).toBe("Trade · STSL");
    expect(col(`s:${b.id}:price`).group).toBe("Competitor · SHORTNAME TEST STORE");
    expect(g.cols.some((c) => c.label === "After cushion")).toBe(false);
  });
});
