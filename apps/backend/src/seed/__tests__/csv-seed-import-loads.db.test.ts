/**
 * csv-seed-import.ts's `loads` import (real Postgres) -- proves the E20 rewire onto
 * createLoadWithFullSideEffects(source="historical_backfill"): a real import writes through the
 * shared path (charges/stops, not a raw INSERT INTO mdata.loads any more), the per-row
 * dispatcher_email is preserved via the post-insert UPDATE (the shared path has no field for a
 * dispatcher distinct from its own acting user), and MXN is rejected rather than silently
 * coerced to USD. USMCA admission itself (CompanyCode widened, org.companies code lookup) is
 * exercised against the company this repo's own shared integration fixture already grants access
 * to (TRANSP) -- the resolveCompanyId() lookup is by CODE, generic to whichever company row
 * exists, and a live query this same round (docs/bus/OUTBOX-CC-1.md) already confirmed
 * org.companies has a real USMCA row; a dedicated USMCA-scoped fixture (customer + dispatcher
 * company-access) is a larger, separate setup not attempted here. Runs only in CI
 * (GITHUB_ACTIONS=true) per this repo's `.db.test.ts` convention.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import { runAdminCsvImport } from "../csv-seed-import.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("csv-seed-import.ts loads import (real Postgres, shared create path)", () => {
  let db: pg.Client;
  let companyId: string;
  let companyCode: string;
  const suffix = randomUUID().slice(0, 8);
  let customerCode: string;

  async function bypass<T>(fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    try {
      const result = await fn();
      await db.query("COMMIT");
      return result;
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    }
  }

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();

    const codeRow = await bypass(() => db.query<{ code: string }>(`SELECT code FROM org.companies WHERE id = $1::uuid`, [companyId]));
    companyCode = codeRow.rows[0]!.code;

    customerCode = `CSV-CUST-${suffix}`;
    await bypass(() =>
      db.query(
        `INSERT INTO mdata.customers (operating_company_id, customer_name, customer_code) VALUES ($1::uuid, $2, $3)`,
        [companyId, `CSV Import Customer ${suffix}`, customerCode]
      )
    );
  });

  afterAll(async () => {
    await db.end();
  });

  it("imports a load through the shared create path: real charges and stops, no raw INSERT", async () => {
    const loadNumber = `CSV-${suffix}`;
    const header = [
      "company_code",
      "load_number",
      "customer_code",
      "rate_total_cents",
      "status",
      "currency_code",
      "dispatcher_email",
      "assigned_unit_number",
      "primary_driver_cdl",
      "secondary_driver_cdl",
      "pickup_scheduled_arrival_at",
      "pickup_city",
      "pickup_state",
      "pickup_country",
      "delivery_scheduled_arrival_at",
      "delivery_city",
      "delivery_state",
      "delivery_country",
      "notes",
    ].join(",");
    const row = [
      companyCode,
      loadNumber,
      customerCode,
      "125000",
      "booked",
      "USD",
      "",
      "",
      "",
      "",
      "2026-10-01T12:00:00.000Z",
      "Laredo",
      "TX",
      "US",
      "2026-10-02T12:00:00.000Z",
      "San Antonio",
      "TX",
      "US",
      "csv import test",
    ].join(",");
    const csvText = `${header}\n${row}\n`;

    // runAdminCsvImport is a raw admin CLI tool -- it never sets bypass_rls/operating_company_id
    // itself (beginSeedTxn only BEGINs). Set them SESSION-WIDE (not LOCAL) on this same
    // connection before calling it, since its own internal BEGIN would reset a LOCAL setting.
    await db.query(`SELECT set_config('app.bypass_rls', 'lucia', false)`);
    await db.query(`SELECT set_config('app.operating_company_id', $1::text, false)`, [companyId]);
    const result = await runAdminCsvImport(db, { csvText, seedKind: "loads", preview: false });
    expect((result as { errors: unknown[] }).errors).toEqual([]);
    expect((result as { inserted: number }).inserted).toBe(1);

    const loadRow = await bypass(() =>
      db.query<{ id: string }>(`SELECT id::text FROM mdata.loads WHERE operating_company_id = $1::uuid AND load_number = $2`, [
        companyId,
        loadNumber,
      ])
    );
    const loadId = loadRow.rows[0]?.id;
    expect(loadId).toBeTruthy();

    const charges = await bypass(() =>
      db.query<{ amount_cents: number }>(`SELECT amount_cents FROM dispatch.load_charge_lines WHERE load_id = $1::uuid`, [loadId])
    );
    expect(charges.rows.some((r) => Number(r.amount_cents) === 125000)).toBe(true);

    const stops = await bypass(() =>
      db.query<{ stop_type: string }>(`SELECT stop_type FROM mdata.load_stops WHERE load_id = $1::uuid ORDER BY sequence_number`, [loadId])
    );
    expect(stops.rows.map((r) => r.stop_type)).toEqual(["pickup", "delivery"]);
  });

  it("REJECTS MXN rather than silently coercing to USD", async () => {
    const loadNumber = `CSV-MXN-${suffix}`;
    const header = [
      "company_code",
      "load_number",
      "customer_code",
      "rate_total_cents",
      "status",
      "currency_code",
      "dispatcher_email",
      "assigned_unit_number",
      "primary_driver_cdl",
      "secondary_driver_cdl",
      "pickup_scheduled_arrival_at",
      "pickup_city",
      "pickup_state",
      "pickup_country",
      "delivery_scheduled_arrival_at",
      "delivery_city",
      "delivery_state",
      "delivery_country",
      "notes",
    ].join(",");
    const row = [companyCode, loadNumber, customerCode, "50000", "booked", "MXN", "", "", "", "", "", "", "", "", "", "", "", "", ""].join(",");
    const csvText = `${header}\n${row}\n`;

    await db.query(`SELECT set_config('app.bypass_rls', 'lucia', false)`);
    await db.query(`SELECT set_config('app.operating_company_id', $1::text, false)`, [companyId]);
    const result = (await runAdminCsvImport(db, { csvText, seedKind: "loads", preview: false })) as {
      errors: Array<{ message: string }>;
      inserted: number;
    };
    expect(result.inserted).toBe(0);
    expect(result.errors.some((e) => /MXN/.test(e.message))).toBe(true);
  });
});
