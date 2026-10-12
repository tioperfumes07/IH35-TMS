/**
 * LEAD 443.110 G12 — real Postgres: ONE fuel duplicate rule. The base provider invoice is one purchase; a reference
 * carrying a load suffix ("<invoice>-<load>") is that same purchase. The Settlement Creator preflight and the post's
 * refusal give the SAME message, naming the load the purchase is already on, and the preflight never tells the
 * operator to type a suffix (the post strips it and refuses — the contradiction this closes). Rolled back.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { ensureIntegrationPrerequisites, prepareCompanyForLoadInserts } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { creatorPreflightRefusals } from "../settlement-creator-preflight.js";
import { FuelProviderTransactionDuplicateError, refuseDuplicateProviderTransaction } from "../../fuel/fuel-provider-reference.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("one fuel duplicate rule: preflight = post (443.110 G12, real Postgres)", () => {
  it("base invoice already recorded (as <invoice>-<load>) -> same message, existing load named, no suffix advice", async () => {
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
      const tag = `FDP${Date.now().toString(36).toUpperCase()}`;
      const one = async <T = { id: string }>(sql: string, params: unknown[]) => (await db.query<T>(sql, params)).rows[0]!;
      const opco = (await one(
        `INSERT INTO org.companies (code, legal_name, company_type) VALUES ($1, $2, 'operating_carrier') RETURNING id::text AS id`,
        [`${tag}A`, `Fuel duplicate test ${tag}`]
      )).id;
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const trailerType = await prepareCompanyForLoadInserts(db, opco);
      const customer = (await one(`INSERT INTO mdata.customers (operating_company_id, customer_name) VALUES ($1, 'FDP customer') RETURNING id::text AS id`, [opco])).id;
      const vendorName = `${tag} Loves`;
      const vendor = (await one(`INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES ($1, $2, 'other') RETURNING id::text AS id`, [opco, vendorName])).id;
      const loadNumber = `${tag}1`;
      const load = (await one(
        `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING id::text AS id`,
        [opco, loadNumber, customer, TEST_OWNER_USER_ID, trailerType]
      )).id;
      // The purchase was recorded with a load suffix — the SAME provider invoice 99794138.
      const existing = (await one(
        `INSERT INTO fuel.fuel_transactions (operating_company_id, transaction_at, purchased_at, load_id, vendor_id, fuel_type, gallons,
                                             total_cost, transaction_reference, source, source_row_hash, load_required)
         VALUES ($1, now(), now(), $2, $3, 'diesel', 100, 400, $4, 'manual', $5, true) RETURNING id::text AS id`,
        [opco, load, vendor, `99794138-1${String(Date.now() % 10_000).padStart(4, "0")}`, `${tag}:hash`]
      )).id;

      const draft = {
        operating_company_id: opco,
        loads: [],
        fuel_purchases: [{ date: "2026-08-20", invoice: "99794138", vendor_name: vendorName, fuel_type: "diesel", card: "fleet", amount_cents: 40000 }],
      } as never;
      const refusals = await creatorPreflightRefusals(db as never, draft);
      const dup = refusals.filter((m) => /already recorded/.test(m));
      expect(dup).toHaveLength(1);
      expect(dup[0]).toContain(`load ${loadNumber}`);
      expect(dup[0]).toContain(existing);
      expect(refusals.join("\n")).not.toMatch(/<ticket>-<load>|entered as/);

      let postMessage = "";
      try {
        await refuseDuplicateProviderTransaction(db, { operatingCompanyId: opco, vendorId: vendor, reference: "99794138", fuelType: "diesel" });
      } catch (err) {
        expect(err).toBeInstanceOf(FuelProviderTransactionDuplicateError);
        postMessage = (err as Error).message;
      }
      expect(postMessage).toBeTruthy();
      expect(dup[0].endsWith(postMessage)).toBe(true); // the preflight shows exactly the post's refusal

      // Typing the suffix the old preflight suggested is the same purchase — refused with the same message.
      await expect(
        refuseDuplicateProviderTransaction(db, { operatingCompanyId: opco, vendorId: vendor, reference: "99794138-13571", fuelType: "diesel" })
      ).rejects.toThrow(postMessage);
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end();
    }
  });
});
