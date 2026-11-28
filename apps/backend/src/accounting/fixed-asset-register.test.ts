/** ROUND L.31 M14: ScentsX registers a non-truck asset in its own class, with the class's 1500 / 1600 / 6800 accounts. */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { registerAssetSchema, registerFixedAsset } from "./fixed-asset-register.service.js";

describe.skipIf(process.env.GITHUB_ACTIONS !== "true")("fixed asset register (real Postgres, rolled back)", () => {
  let db: pg.Client;
  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect(); await db.query("BEGIN"); await db.query("SET LOCAL app.bypass_rls = 'lucia'");
  });
  afterAll(async () => { await db?.query("ROLLBACK").catch(() => {}); await db?.end().catch(() => {}); });

  it("store fixtures: class accounts 1500 / 1600 / 6800, class life; a duplicate asset number and a foreign class are refused", async () => {
    const co = (await db.query<{ id: string }>(`SELECT id::text FROM org.companies WHERE code = 'SCENTSX'`)).rows[0]!.id;
    const cls = (await db.query<{ id: string }>(`SELECT id::text FROM accounting.fixed_asset_classes WHERE operating_company_id = $1::uuid AND class_code = 'STORE_FIXTURES'`, [co])).rows[0]!.id;
    const x = registerAssetSchema.parse({ operating_company_id: co, class_id: cls, name: "Zqa display wall", asset_number: "ZQA-1", purchase_price_cents: 840000,
      purchase_date: "2026-11-01", in_service_date: "2026-11-15" });
    const r = await registerFixedAsset(db as never, TEST_OWNER_USER_ID, x);
    const row = (await db.query(
      `SELECT fa.useful_life_months, fa.method, a.account_number AS asset, d.account_number AS accum, e.account_number AS expense, fa.status
         FROM accounting.fixed_assets fa JOIN catalogs.accounts a ON a.id = fa.asset_account_id JOIN catalogs.accounts d ON d.id = fa.accum_depr_account_id
         JOIN catalogs.accounts e ON e.id = fa.depr_expense_account_id WHERE fa.id = $1::uuid`, [r.id])).rows[0];
    expect(row).toEqual({ useful_life_months: 84, method: "straight_line", asset: "1500", accum: "1600", expense: "6800", status: "active" });
    await expect(registerFixedAsset(db as never, TEST_OWNER_USER_ID, x)).rejects.toThrow(/already used/);
    const other = (await db.query<{ id: string }>(`SELECT id::text FROM org.companies WHERE code <> 'SCENTSX' LIMIT 1`)).rows[0]!.id;
    await expect(registerFixedAsset(db as never, TEST_OWNER_USER_ID, { ...x, operating_company_id: other, asset_number: "ZQA-2" })).rejects.toThrow(/not in this company/);
    expect(() => registerAssetSchema.parse({ ...x, salvage_value_cents: 900000 })).toThrow(/Salvage/);
  });
});
