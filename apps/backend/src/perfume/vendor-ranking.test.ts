/**
 * ROUND L.31 M27: vendor ranking — ScentsX's real bills per vendor (createBillInClientTx through a scentsx.vendor_links link) rank and
 * tier the vendors; POs add ordered / received; a draft bill never counts. Real Postgres, rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { createBillInClientTx } from "../accounting/bills.service.js";
import { createLink } from "../scentsx/links.service.js";
import { vendorRanking } from "./vendor-ranking.service.js";

describe.skipIf(process.env.GITHUB_ACTIONS !== "true")("vendor ranking (real Postgres, rolled back)", () => {
  let db: pg.Client;
  let co: string;
  const u = TEST_OWNER_USER_ID;
  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect(); await db.query("BEGIN"); await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    co = (await db.query<{ id: string }>(`SELECT id::text FROM org.companies WHERE code = 'SCENTSX'`)).rows[0]!.id;
  });
  afterAll(async () => { await db?.query("ROLLBACK").catch(() => {}); await db?.end().catch(() => {}); });

  it("ranks by billed on ScentsX's books, ABC tiers, POs ordered / received, drafts excluded", async () => {
    const acct = (await db.query<{ id: string }>(`SELECT id::text FROM catalogs.accounts WHERE operating_company_id = $1::uuid AND account_number = '6990'`, [co])).rows[0]!.id;
    const mkVendor = async (name: string) => {
      const pv = (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind) VALUES ($1, 'buy') RETURNING id::text`, [name])).rows[0]!.id;
      const v = (await db.query<{ id: string }>(`INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES ($1::uuid, $2, 'Other') RETURNING id::text`, [co, name])).rows[0]!.id;
      await createLink(db, u, "vendor", pv, v);
      return { pv, v };
    };
    const bill = (v: string, no: string, cents: number) => createBillInClientTx(db as never, {
      operatingCompanyId: co, source: "manual", vendorId: v, billNumber: no, autoDisplayId: true, billDate: "2026-11-20", dueDate: "2026-12-20", amountCents: cents,
      lines: [{ amountCents: cents, accountId: acct, description: no }] }, u);
    const big = await mkVendor("ZZ Rank Big Distributor"), mid = await mkVendor("ZZ Rank Mid Distributor"), none = await mkVendor("ZZ Rank Never Bought");
    await bill(big.v, "VR-1", 900000);
    await bill(mid.v, "VR-2", 100000);
    const draft = await bill(none.v, "VR-3", 500000);
    await db.query(`UPDATE accounting.bills SET status = 'draft' WHERE id = $1::uuid`, [draft.id]);
    const po = (await db.query<{ id: string }>(`INSERT INTO perfume.purchase_orders (vendor_id) VALUES ($1::uuid) RETURNING id::text`, [mid.pv])).rows[0]!.id;
    await db.query(`INSERT INTO perfume.purchase_order_lines (po_id, line_no, description, qty, qty_received, unit_cost_cents) VALUES ($1::uuid, 1, 'ZZ EDP', 10, 4, 2500)`, [po]);

    const r = await vendorRanking(db);
    const by = Object.fromEntries(r.rows.map((x) => [x.vendor_id, x]));
    expect(by[big.pv]).toMatchObject({ billed_cents: 900000, billed12_cents: 900000, bills: 1, tier: "A" });
    expect(by[mid.pv]).toMatchObject({ billed_cents: 100000, bills: 1, ordered_cents: 25000, received_cents: 10000, pos: 1 });
    expect(by[none.pv]).toMatchObject({ billed_cents: 0, bills: 0, tier: null, rank: null });
    expect(by[big.pv]!.rank!).toBeLessThan(by[mid.pv]!.rank!);
    expect(r.rows.findIndex((x) => x.vendor_id === big.pv)).toBeLessThan(r.rows.findIndex((x) => x.vendor_id === none.pv));
  });
});
