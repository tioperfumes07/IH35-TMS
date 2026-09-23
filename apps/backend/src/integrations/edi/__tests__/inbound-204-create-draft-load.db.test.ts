/**
 * E6 (Lead ruling, 2026-09-22 / Round 84): createDraftLoadFrom204 was rewired from a direct
 * INSERT INTO mdata.loads / mdata.load_stops to the ONE shared create path,
 * createLoadWithFullSideEffects (source="live_feed") -- the first of the 4 named offenders in
 * verify-one-load-create-path.mjs to land. This replaces the old hand-mocked unit test in
 * inbound-204.test.ts (which faked a single INSERT...RETURNING id call and could never exercise
 * the shared path's real resolver/gate chain) with a REAL Postgres round-trip, same convention as
 * every other `.db.test.ts` in this repo (book-load-zero-dollar-dispatch-gate.db.test.ts is the
 * sibling this file's fixture shape is modeled on).
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites, prepareCompanyForLoadInserts } from "../../../../test-helpers/db-fixture.js";
import { createDraftLoadFrom204, parseX12204Payload } from "../transactions/inbound-204.handler.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

const SAMPLE_204 = [
  "ISA*00*          *00*          *ZZ*SENDER         *ZZ*RECEIVER       *260607*1200*^*00501*000000001*0*P*:~",
  "GS*SM*SENDER*RECEIVER*20260607*1200*1*X*005010~",
  "ST*204*0001~",
  "B2**SCAC**BROKERREF123~",
  "G62*10*20260608~",
  "N1*SH*SHIPPER NAME*LAREDO*TX~",
  "N1*CN*CONSIGNEE NAME*DALLAS*TX~",
  "L5*1*STEEL COILS~",
  "L3*1500.00~",
  "SE*7*0001~",
  "GE*1*1~",
  "IEA*1*000000001~",
].join("");

describeIntegration("createDraftLoadFrom204 -> the shared create path (E6)", () => {
  let db: pg.Client;
  let companyId: string;
  let customerId: string;

  beforeAll(async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    companyId = await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
    await db.query(`SELECT set_config('app.bypass_rls', 'lucia', false)`);
    await db.query(`SELECT set_config('app.operating_company_id', $1::text, false)`, [companyId]);
    await db.query("BEGIN");
    await prepareCompanyForLoadInserts(db, companyId);
    const suf = randomUUID().slice(0, 8);
    const cust = await db.query<{ id: string }>(
      `INSERT INTO mdata.customers (customer_name, operating_company_id) VALUES ($1, $2::uuid) RETURNING id`,
      [`E6-EDI204 customer ${suf}`, companyId]
    );
    customerId = cust.rows[0]!.id;
    await db.query("COMMIT");
  }, 30_000);

  afterAll(async () => {
    await db?.end();
  });

  it("creates a real draft load through createLoadWithFullSideEffects, with facility_name/city/state on both stops", async () => {
    await db.query("BEGIN");
    await db.query("SAVEPOINT edi204_create");
    try {
      const parsed = parseX12204Payload(SAMPLE_204);
      const loadId = await createDraftLoadFrom204(db, {
        operating_company_id: companyId,
        customer_id: customerId,
        parsed,
      });
      expect(loadId).toBeTruthy();

      const loadRow = await db.query<{ status: string; customer_id: string; customer_wo_number: string | null }>(
        `SELECT status, customer_id::text, customer_wo_number FROM mdata.loads WHERE id = $1`,
        [loadId]
      );
      expect(loadRow.rows[0]?.status).toBe("draft");
      expect(loadRow.rows[0]?.customer_id).toBe(customerId);
      // Byte-for-byte preserved from the pre-rewire direct-INSERT behavior.
      expect(loadRow.rows[0]?.customer_wo_number).toBe("BROKERREF123");

      const stops = await db.query<{
        sequence_number: number;
        stop_type: string;
        facility_name: string | null;
        city: string | null;
        state: string | null;
      }>(
        `SELECT sequence_number, stop_type, facility_name, city, state
           FROM mdata.load_stops WHERE load_id = $1 ORDER BY sequence_number`,
        [loadId]
      );
      expect(stops.rows).toHaveLength(2);
      expect(stops.rows[0]).toMatchObject({
        sequence_number: 1,
        stop_type: "pickup",
        facility_name: "SHIPPER NAME",
        city: "LAREDO",
        state: "TX",
      });
      expect(stops.rows[1]).toMatchObject({
        sequence_number: 2,
        stop_type: "delivery",
        facility_name: "CONSIGNEE NAME",
        city: "DALLAS",
        state: "TX",
      });

      const charges = await db.query<{ charge_code: string; amount_cents: string }>(
        `SELECT charge_code, amount_cents FROM dispatch.load_charge_lines WHERE load_id = $1`,
        [loadId]
      );
      expect(charges.rows).toEqual([{ charge_code: "LINEHAUL", amount_cents: "150000" }]);
    } finally {
      await db.query("ROLLBACK TO SAVEPOINT edi204_create");
      await db.query("COMMIT");
    }
  });

  it("still returns null (no side effects) when customer_id is unresolved -- unchanged behavior", async () => {
    await db.query("BEGIN");
    await db.query("SAVEPOINT edi204_null_customer");
    try {
      const parsed = parseX12204Payload(SAMPLE_204);
      const loadId = await createDraftLoadFrom204(db, {
        operating_company_id: companyId,
        customer_id: null,
        parsed,
      });
      expect(loadId).toBeNull();
    } finally {
      await db.query("ROLLBACK TO SAVEPOINT edi204_null_customer");
      await db.query("COMMIT");
    }
  });
});
