/**
 * PERFUME-DESK bulk review (owner 2026-11-12, real Postgres, rolled back): set the gender of many review lines at once
 * (the line re-matches by itself when the gender was the only thing missing) and confirm many lines at once.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { bulkReview, importList } from "./desk.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("perfume bulk review (real Postgres, rolled back)", () => {
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

  it("set_gender re-matches a line that only lacked its gender; the vendor text is never edited", async () => {
    const sup = (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind) VALUES ('BULK SUP', 'buy') RETURNING id`)).rows[0].id;
    const comp = (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind) VALUES ('BULK COMP', 'sell') RETURNING id`)).rows[0].id;
    // Supplier carries ZZBULK GLOW 100 ml EDP for women AND for men: a line with no gender fits both → review.
    await importList(db as never, TEST_OWNER_USER_ID, {
      vendor_id: sup, list_date: "2026-11-10", file_name: "s.xlsx", source_kind: "xlsx", rows_read: 2, file_price_total_cents: 3000,
      rows: [
        { row_no: 1, upc: "8000000000017", brand: "ZZBULK", description: "ZZBULK GLOW (W) EDP SP 3.4oz", price: "15.00" },
        { row_no: 2, upc: "8000000000024", brand: "ZZBULK", description: "ZZBULK GLOW (M) EDP SP 3.4oz", price: "15.00" },
      ],
    });
    const { list_id } = await importList(db as never, TEST_OWNER_USER_ID, {
      vendor_id: comp, list_date: "2026-11-10", file_name: "c.pdf", source_kind: "pdf_text", rows_read: 1, file_price_total_cents: 1800,
      rows: [{ row_no: 1, description: "ZZBULK GLOW 3.4oz EDP", price: "18.00" }],
    });
    const row = (await db.query<{ id: string; match_status: string }>(`SELECT id, match_status FROM perfume.price_list_rows WHERE list_id = $1`, [list_id])).rows[0];
    expect(row.match_status).not.toBe("matched");

    const g = await bulkReview(db as never, TEST_OWNER_USER_ID, { action: "set_gender", row_ids: [row.id], gender: "W" });
    expect(g.now_matched).toBe(1);
    const after = (await db.query<{ match_status: string; gender_override: string; name: string; gender: string }>(
      `SELECT r.match_status, r.gender_override, i.name, i.gender FROM perfume.price_list_rows r JOIN perfume.items i ON i.id = r.item_id WHERE r.id = $1`, [row.id])).rows[0];
    expect(after).toMatchObject({ match_status: "matched", gender_override: "W", name: "GLOW", gender: "W" });

    // The vendor's own text is never edited.
    const raw = (await db.query<{ description: string }>(`SELECT description FROM perfume.price_list_rows WHERE id = $1`, [row.id])).rows[0];
    expect(raw.description).toBe("ZZBULK GLOW 3.4oz EDP");
  });
});
