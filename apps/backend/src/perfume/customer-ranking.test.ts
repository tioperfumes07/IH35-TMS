/** ROUND P1.31 L1: ABC tiers on purchases; import has no balance and links by name. */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { abcTiers, companyTier, customerRanking, importPurchaseHistory, relinkPurchaseHistory } from "./customer-ranking.service.js";

describe("abcTiers (Pareto: first 80 % A, next 15 % B, rest C)", () => {
  it("70 / 20 / 6 / 4 → A A B C", () => expect(abcTiers([70, 20, 6, 4])).toEqual(["A", "A", "B", "C"]));
  it("one customer is A", () => expect(abcTiers([5])).toEqual(["A"]));
});

describe.skipIf(process.env.GITHUB_ACTIONS !== "true")("customer ranking (real Postgres, rolled back)", () => {
  let db: pg.Client;
  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect(); await db.query("BEGIN"); await db.query("SET LOCAL app.bypass_rls = 'lucia'");
  });
  afterAll(async () => { await db?.query("ROLLBACK").catch(() => {}); await db?.end().catch(() => {}); });

  it("3 customers → A / B / C exact; linked by name; re-import replaces, never adds", async () => {
    await db.query(`DELETE FROM perfume.customer_purchase_history`);
    const big = (await db.query<{ id: string }>(`INSERT INTO perfume.contact_companies (name, source, role) VALUES ('ZZ Rank Big LLC', 'test', 'customer') RETURNING id::text`)).rows[0]!.id;
    const m = (d: string) => d;
    const rows = [
      { source: "usa_store" as const, customer_no: "1", customer_name: "ZZ Rank Big LLC", period_kind: "month" as const, period_start: m("2026-10-01"), invoices: 5, amount_cents: 8_000_00, currency: "USD" as const },
      { source: "usa_store" as const, customer_no: "1", customer_name: "ZZ Rank Big LLC", period_kind: "month" as const, period_start: m("2021-01-01"), invoices: 2, amount_cents: 1_000_00, currency: "USD" as const },
      { source: "usa_store" as const, customer_no: "2", customer_name: "ZZ Mid", period_kind: "month" as const, period_start: m("2025-01-01"), invoices: 3, amount_cents: 600_00, currency: "USD" as const },
      { source: "usa_store" as const, customer_no: "3", customer_name: "ZZ Small", period_kind: "month" as const, period_start: m("2024-01-01"), invoices: 1, amount_cents: 400_00, currency: "USD" as const },
      { source: "mexico_file" as const, customer_no: "1", customer_name: "ZZ Rank Big LLC", period_kind: "year" as const, period_start: m("2024-01-01"), invoices: null, amount_cents: 50_000_00, currency: "MXN" as const },
    ];
    expect(await importPurchaseHistory(db, TEST_OWNER_USER_ID, rows)).toMatchObject({ rows: 5, inserted: 5 });
    expect(await importPurchaseHistory(db, TEST_OWNER_USER_ID, rows)).toMatchObject({ rows: 5, inserted: 0, updated: 5 });
    const r = await customerRanking(db, { currency: "USD" });
    expect(r.rows.map((x) => [x.customer, x.tier, x.lifetime_cents])).toEqual([["ZZ Rank Big LLC", "A", 900000], ["ZZ Mid", "B", 60000], ["ZZ Small", "C", 40000]]);
    expect(r).toMatchObject({ total_cents: 1000000, tiers: { A: 1, B: 1, C: 1 }, linked: 1 });
    expect(r.rows[0]).toMatchObject({ company_id: big, invoices: 7, months: 2 });
    const t = await companyTier(db, big);
    expect(t.USD).toMatchObject({ tier: "A", rank: 1, of: 3 });
    expect(t.MXN).toMatchObject({ tier: "A", rank: 1, of: 1, lifetime_cents: 5000000 });
    const cols = (await db.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'perfume' AND table_name = 'customer_purchase_history'`)).rows.map((x) => x.column_name);
    expect(cols.some((col: string) => /balance|open|credit/.test(col))).toBe(false); // owner 14:12 CT: no balances
  });

  it("re-link: a row with no company links once the customer exists; a row on a merged company follows the one that stayed", async () => {
    await importPurchaseHistory(db, TEST_OWNER_USER_ID, [
      { source: "usa_store", customer_no: "ZQR-1", customer_name: "Zqr Late Customer LLC", period_kind: "month", period_start: "2026-01-01", invoices: 1, amount_cents: 1000, currency: "USD" }]);
    expect((await db.query(`SELECT company_id FROM perfume.customer_purchase_history WHERE customer_no = 'ZQR-1'`)).rows[0].company_id).toBeNull();
    const late = (await db.query<{ id: string }>(`INSERT INTO perfume.contact_companies (name, source, role) VALUES ('Zqr Late Customer', 'test', 'customer') RETURNING id::text`)).rows[0]!.id;
    const r = await relinkPurchaseHistory(db);
    expect(r.linked).toBeGreaterThanOrEqual(1);
    expect((await db.query(`SELECT company_id::text FROM perfume.customer_purchase_history WHERE customer_no = 'ZQR-1'`)).rows[0].company_id).toBe(late);
    const stays = (await db.query<{ id: string }>(`INSERT INTO perfume.contact_companies (name, source, role) VALUES ('Zqr Stays', 'test', 'customer') RETURNING id::text`)).rows[0]!.id;
    await db.query(`UPDATE perfume.contact_companies SET merged_into_id = $2::uuid, merged_at = now(), archived_at = now() WHERE id = $1::uuid`, [late, stays]);
    expect((await relinkPurchaseHistory(db)).followed_merge).toBeGreaterThanOrEqual(1);
    expect((await db.query(`SELECT company_id::text FROM perfume.customer_purchase_history WHERE customer_no = 'ZQR-1'`)).rows[0].company_id).toBe(stays);
  });
});
