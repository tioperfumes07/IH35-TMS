/**
 * verify-delivered-load-stops-terminal RULE 2 went red after LEAD 443.248: the document engine added the Love's Vinton relay
 * stop printed on the signed settlement to 13541 (invoiced) / 13576 (closed) as status 'pending'. A delivered load cannot keep
 * a stop that never happened. Real Postgres:
 *   a delivered load whose signed settlement prints an extra relay stop → applySettlementDocumentToLoad inserts it AND runs the
 *   one stamping engine (printed date when there is no GPS) → every stop is terminal ('departed'), nothing is left 'pending'.
 * Fail-old: without the stamping call the inserted relay (and the load's own unstamped stops) stay 'pending'.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { createIsolatedOperatingCompany, prepareCompanyForLoadInserts } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { applySettlementDocumentToLoad } from "../settlement-document-load-facts.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("document engine leaves no pending stop on a delivered load (443.248 follow-up, real Postgres)", () => {
  it("inserts the printed relay stop and stamps every stop from the document", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    const { companyId: opco } = await createIsolatedOperatingCompany({ codePrefix: "DST", legalNamePrefix: "443.248 delivered stops" });
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    const tag = `DST${Date.now().toString(36).toUpperCase()}`;
    const one = async (sql: string, params: unknown[]) => (await db.query<{ id: string }>(sql, params)).rows[0]!.id;
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      await db.query(`SELECT set_config('app.current_user_id', $1::text, true)`, [TEST_OWNER_USER_ID]);
      const trailerType = await prepareCompanyForLoadInserts(db, opco);
      const customer = await one(`INSERT INTO mdata.customers (operating_company_id, customer_name) VALUES ($1, $2) RETURNING id::text AS id`, [opco, `${tag} customer`]);
      const loadNumber = `${tag}L`;
      const load = await one(
        `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id, status)
         VALUES ($1, $2, $3, $4, $5, 'delivered_pending_docs'::mdata.load_status_enum) RETURNING id::text AS id`,
        [opco, loadNumber, customer, TEST_OWNER_USER_ID, trailerType]);
      await db.query(
        `INSERT INTO mdata.load_stops (load_id, operating_company_id, sequence_number, stop_type, city, state, scheduled_arrival_at)
         VALUES ($1::uuid, $2::uuid, 1, 'pickup', 'Laredo', 'TX', '2026-10-01T15:00:00Z'),
                ($1::uuid, $2::uuid, 2, 'delivery', 'Lumberton', 'NC', '2026-10-04T15:00:00Z')`, [load, opco]);

      const res = await applySettlementDocumentToLoad(db as never, {
        operatingCompanyId: opco,
        actorUserId: TEST_OWNER_USER_ID,
        geocode: false,
        doc: {
          load_number: loadNumber, settlement_no: 5999, loaded_miles_doc: null, empty_miles_doc: null, practical_miles_doc: null,
          stops: [
            { type: "PICKUP", date: "2026-10-01", company: "Shipper", city: "Laredo", state: "TX", zip: "78045", leg_miles: null },
            { type: "PICKUP", date: "2026-10-02", company: "Love's Travel Stop", city: "Vinton", state: "TX", zip: "79821", leg_miles: null },
            { type: "DELIVER", date: "2026-10-04", company: "Receiver", city: "Lumberton", state: "NC", zip: "28358", leg_miles: null },
          ],
        },
      });
      expect(res.stops_added).toBe(1);
      const rows = (await db.query<{ seq: number; status: string; arr: string | null }>(
        `SELECT sequence_number AS seq, status::text AS status, actual_arrival_at::text AS arr
           FROM mdata.load_stops WHERE load_id = $1::uuid AND soft_deleted_at IS NULL ORDER BY sequence_number`, [load])).rows;
      expect(rows).toHaveLength(3);
      expect(rows.filter((r) => r.status === "pending")).toEqual([]);
      expect(rows.every((r) => r.arr != null)).toBe(true);
      expect(res.stops_stamped).toBe(3);
    } finally {
      await db.query("ROLLBACK").catch(() => undefined);
      await db.end();
    }
  }, 60_000);
});
