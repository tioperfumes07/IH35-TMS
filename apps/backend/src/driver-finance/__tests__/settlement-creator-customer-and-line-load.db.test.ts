/**
 * LEAD 443.110 G3 + G5 — real Postgres, one rolled-back transaction (nothing is left behind).
 *
 * G3: the Creator books a load against the customer the document NAMES (or picks by id) — an unmatched name is refused
 *     naming it; it never falls back to the company's oldest active customer (wrong A/R).
 * G5: every reimbursement / reimbursable expense / additional-pay line resolves to a load of this company (typed, the
 *     load covering its date, or the settlement's only load) — the preview lists every line that cannot.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { ensureIntegrationPrerequisites, prepareCompanyForLoadInserts } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { findCreatorCustomer } from "../settlement-creator-seed-loads.js";
import { creatorPreflightRefusals } from "../settlement-creator-preflight.js";
import type { SettlementCreatorDraft } from "../settlement-creator.types.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("443.110 G3 + G5 — Creator customer is the document's, every line carries its load (real Postgres)", () => {
  it("unmatched customer refused by name (no oldest-customer fallback); line loads resolved or listed", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    await ensureIntegrationPrerequisites();
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      const tag = `G35${Date.now().toString(36).toUpperCase()}`;
      const co = async (code: string) =>
        (await db.query<{ id: string }>(
          `INSERT INTO org.companies (code, legal_name, company_type) VALUES ($1, $2, 'operating_carrier') RETURNING id::text AS id`,
          [code, `G35 test ${code}`],
        )).rows[0]!.id;
      const opco = await co(`${tag}A`);
      const other = await co(`${tag}B`);
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const trailer = await prepareCompanyForLoadInserts(db, opco);
      const one = async (sql: string, p: unknown[]) => (await db.query<{ id: string }>(sql, p)).rows[0]!.id;
      // The OLDEST active customer of the company — the one the removed fallback would have picked.
      const oldest = await one(`INSERT INTO mdata.customers (operating_company_id, customer_name, created_at) VALUES ($1, 'G35 Oldest Customer', now() - interval '5 years') RETURNING id::text AS id`, [opco]);
      const named = await one(`INSERT INTO mdata.customers (operating_company_id, customer_name) VALUES ($1, 'G35 Named Shipper') RETURNING id::text AS id`, [opco]);
      const foreign = await one(`INSERT INTO mdata.customers (operating_company_id, customer_name) VALUES ($1, 'G35 Foreign') RETURNING id::text AS id`, [other]);
      const existingLoad = `${tag}9`;
      await db.query(
        `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [opco, existingLoad, named, TEST_OWNER_USER_ID, trailer],
      );

      // G3 — resolver
      expect(await findCreatorCustomer(db as never, opco, { load_number: "L1", customer_name: "  g35 named shipper " })).toEqual({ id: named });
      const unmatched = await findCreatorCustomer(db as never, opco, { load_number: "L1", customer_name: "G35 Typo Shiper" });
      expect(unmatched).toMatchObject({ code: "customer_unmatched" });
      expect("message" in unmatched && unmatched.message).toMatch(/customer "G35 Typo Shiper" on the document is not a customer of this company/);
      expect(JSON.stringify(unmatched)).not.toContain(oldest);
      expect(await findCreatorCustomer(db as never, opco, { load_number: "L1", customer_name: null })).toMatchObject({ code: "customer_required" });
      expect(await findCreatorCustomer(db as never, opco, { load_number: "L1", customer_id: foreign })).toMatchObject({ code: "customer_unmatched" });
      expect(await findCreatorCustomer(db as never, opco, { load_number: "L1", customer_id: named })).toEqual({ id: named });

      // G3 + G5 — the preview lists every refusal
      const draft = {
        operating_company_id: opco,
        settlement_no: "",
        driver_id: TEST_OWNER_USER_ID,
        unit_id: null,
        period_start: "2026-08-04",
        period_end: "2026-08-07",
        loads: [
          { load_number: `${tag}1`, customer_name: "G35 Typo Shiper", customer_po_number: "PO1", loaded_miles: 100, pickup_date: "2026-08-04", delivery_date: "2026-08-05", pickup_lat: 1, pickup_lng: 1, delivery_lat: 1, delivery_lng: 1 },
          { load_number: `${tag}2`, customer_name: "G35 Named Shipper", customer_po_number: "PO2", loaded_miles: 100, pickup_date: "2026-08-06", delivery_date: "2026-08-07", pickup_lat: 1, pickup_lng: 1, delivery_lat: 1, delivery_lng: 1 },
        ],
        fuel_purchases: [],
        expenses: [
          { date: "2026-08-07", item_name: "Lumper", amount_cents: 5000, is_reimbursable: true, is_company_expense: false },
          { date: "2026-08-20", item_name: "Scale", amount_cents: 1200, is_reimbursable: true, is_company_expense: false },
        ],
        reimbursements: [
          { description: "Toll typed", amount_cents: 900, load_number: existingLoad },
          { description: "Ghost", amount_cents: 900, load_number: "NOPE404" },
        ],
        additional_pay: [{ description: "Bonus", amount_cents: 2000, pay_kind: "detention" }],
        deductions: [],
        advances: [],
        escrow: [],
      } as unknown as SettlementCreatorDraft;
      const refusals = await creatorPreflightRefusals(db as never, draft);
      const has = (re: RegExp) => refusals.some((r) => re.test(r));
      expect(has(/customer "G35 Typo Shiper" on the document is not a customer/)).toBe(true);
      expect(has(new RegExp(`Load ${tag}2: customer`))).toBe(false);
      expect(has(/Reimbursable expense "Lumper"/)).toBe(false); // 08-07 is covered by load 2 only
      expect(has(/Reimbursable expense "Scale" on 2026-08-20: no load of this settlement covers/)).toBe(true);
      expect(has(/Reimbursement "Toll typed"/)).toBe(false); // typed, a live load of this company
      expect(has(/Reimbursement "Ghost": load NOPE404 is not a load of this company/)).toBe(true);
      expect(has(/Additional pay "Bonus": type its load number — this settlement has 2 loads/)).toBe(true);
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end();
    }
  });
});
