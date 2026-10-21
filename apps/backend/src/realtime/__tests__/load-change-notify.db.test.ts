/**
 * LEAD 443.208R — real Postgres: a write to a load table signals at COMMIT (a rolled-back write never does), and the
 * load-change bus delivers it in-process. On main there is no trigger and no bus: nothing is ever delivered.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { createIsolatedOperatingCompany, prepareCompanyForLoadInserts } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { onLoadChanged, startLoadChangeBus, stopLoadChangeBus, type LoadChangedEvent } from "../load-change-bus.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describeIntegration("load_changed signal (443.208R, real Postgres)", () => {
  it("signals at commit only and the bus delivers it", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    const { companyId: opco } = await createIsolatedOperatingCompany({ codePrefix: "LCN", legalNamePrefix: "443.208R load changed" });
    const got: LoadChangedEvent[] = [];
    const off = onLoadChanged((e) => { if (e.company_id === opco) got.push(e); });
    startLoadChangeBus({ info: () => undefined, warn: () => undefined }, { DATABASE_URL: cs } as NodeJS.ProcessEnv);
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    const tag = `LCN${Date.now().toString(36).toUpperCase()}`;
    const begin = async () => {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
    };
    try {
      await wait(1500); // bus connected + LISTEN
      await begin();
      const trailerType = await prepareCompanyForLoadInserts(db, opco);
      const customer = (await db.query<{ id: string }>(`INSERT INTO mdata.customers (operating_company_id, customer_name) VALUES ($1, $2) RETURNING id::text AS id`, [opco, `${tag} customer`])).rows[0]!.id;
      await db.query("COMMIT");

      // rolled back: never signals
      await begin();
      await db.query(`INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id) VALUES ($1, $2, $3, $4, $5)`,
        [opco, `${tag}R`, customer, TEST_OWNER_USER_ID, trailerType]);
      await db.query("ROLLBACK");
      await wait(800);
      expect(got).toEqual([]);

      // committed: signals once with the load id
      await begin();
      const load = (await db.query<{ id: string }>(`INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id) VALUES ($1, $2, $3, $4, $5) RETURNING id::text AS id`,
        [opco, `${tag}C`, customer, TEST_OWNER_USER_ID, trailerType])).rows[0]!.id;
      await db.query("COMMIT");
      for (let i = 0; i < 40 && !got.some((e) => e.load_ids.includes(load)); i++) await wait(100);
      expect(got.some((e) => e.load_ids.includes(load) && e.table === "mdata.loads" && e.op === "INSERT")).toBe(true);

      // a stop write on that load signals the same load
      got.length = 0;
      await begin();
      await db.query(`INSERT INTO mdata.load_stops (load_id, sequence_number, stop_type) VALUES ($1::uuid, 1, 'pickup')`, [load]);
      await db.query("COMMIT");
      for (let i = 0; i < 40 && !got.length; i++) await wait(100);
      expect(got.some((e) => e.load_ids.includes(load) && e.table === "mdata.load_stops")).toBe(true);
    } finally {
      await db.query("ROLLBACK").catch(() => undefined);
      off();
      await stopLoadChangeBus();
      await db.end();
    }
  }, 60_000);
});
