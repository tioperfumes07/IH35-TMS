/**
 * PERFUME-PCA-CODES-REMATCH (owner 2026-11-26 16:31 CT, Review still 4,872): PCA's PDF lines saved before the coded-name
 * reader (#29847) carry their PCA code inside the name ("COS Completely Bare US I0087568 COMPLETELY CLEAN …") and no
 * SKU — measured 22:40Z, all 3,788 PCA lines of the current list, while the 11-10 .xls list had linked 3,718 of 3,761
 * by that same code. Rematch reads the code from the saved name, saves it on the line and links by it.
 * Also: Euro's leading "TT" is a tester. Real Postgres, one transaction rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { rematchReview } from "./desk.service.js";
import { readCodedName } from "./mail/readers.js";
import { identify } from "./normalize.js";

describe("coded name + TT tester (pure)", () => {
  it("reads PCA's code, brand, gender and name from a saved line", () => {
    expect(readCodedName("COS Completely Bare US I0087568 COMPLETELY CLEAN HAND SANITIZER by Completely Bare 8.0oz Spr"))
      .toEqual({ sku: "I0087568", brand: "Completely Bare", gender: null, description: "Completely Bare COMPLETELY CLEAN HAND SANITIZER by Completely Bare 8.0oz Spr" });
    expect(readCodedName("AZZARO POUR HOMME EDT 3.4 OZ SPR (M)")).toBeNull();
  });
  it("a leading TT is a tester; TT inside a name is not", () => {
    expect(identify({ description: "TT-M Benz MAN Fresh edt 100 ml vapo" }).flags).toContain("TESTER");
    expect(identify({ description: "TT ATKINSONS 44 Gerrard Street EDC 100ML vapo" }).flags).toContain("TESTER");
    expect(identify({ description: "ATKINSONS 44 Gerrard Street EDC 100ML vapo" }).flags).not.toContain("TESTER");
  });
});

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("rematch reads PCA codes from saved lines (real Postgres, rolled back)", () => {
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

  it("links the line by PCA's code and saves the code, brand and name on it", async () => {
    const vendor = (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind) VALUES ('PCA CODE TEST', 'buy') RETURNING id`)).rows[0].id;
    const item = (await db.query<{ id: string }>(
      `INSERT INTO perfume.items (brand, name, identity_key, loose_key, display_name) VALUES ('COMPLETELY BARE', 'CLEAN HAND SANITIZER', 'PCATEST|K', 'PCATEST|L', 'Completely Bare hand sanitizer') RETURNING id`)).rows[0].id;
    await db.query(`INSERT INTO perfume.item_aliases (item_id, vendor_id, sku, method) VALUES ($1, $2, 'I0087568', 'import')`, [item, vendor]);
    const list = (await db.query<{ id: string }>(
      `INSERT INTO perfume.price_lists (vendor_id, list_date, file_name, source_kind, rows_read, rows_saved, rows_skipped, price_total_file_cents, price_total_saved_cents, is_current)
       VALUES ($1, '2026-11-25', 'PRICE-LIST-11-24-2026.pdf', 'pdf_text', 1, 1, 0, 599, 599, true) RETURNING id`, [vendor])).rows[0].id;
    const row = (await db.query<{ id: string }>(
      `INSERT INTO perfume.price_list_rows (list_id, row_no, raw, description, price_cents, identity_key, loose_key, match_status)
       VALUES ($1, 1, '{}', 'COS Completely Bare US I0087568 COMPLETELY CLEAN HAND SANITIZER by Completely Bare 8.0oz Spr', 599, 'x', 'x', 'unmatched') RETURNING id`, [list])).rows[0].id;

    const out = await rematchReview(db as never);
    expect(out.codes_read).toBeGreaterThanOrEqual(1);
    const r = (await db.query(`SELECT item_id, match_method, match_status, sku, brand, description FROM perfume.price_list_rows WHERE id = $1`, [row])).rows[0];
    expect(r).toMatchObject({ item_id: item, match_method: "sku", match_status: "matched", sku: "I0087568", brand: "Completely Bare" });
    expect(r.description).toBe("Completely Bare COMPLETELY CLEAN HAND SANITIZER by Completely Bare 8.0oz Spr");
  });
});
