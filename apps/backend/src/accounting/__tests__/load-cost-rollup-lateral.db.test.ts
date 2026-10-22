/**
 * P0B alias-fix regression lock (ACCT-F2026092587 / 443.210R).
 * Before the fix, loadCostRollupLateral used alias "l" (was "cl" before CC-3 rename) inside the
 * lateral and loadCostsRevenueJoin also used "cl" for load_charge_lines → lcl.load_id = cl.id
 * became a self-reference, making proforma revenue always 0.
 * After the fix: inner alias = "lcl", condition = "lcl.load_id = cl.id" (outer load row).
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { prepareCompanyForLoadInserts } from "../../../test-helpers/db-fixture.js";
import { loadCostRollupLateral } from "../load-cost-rollup.sql.js";

describe.skipIf(process.env.GITHUB_ACTIONS !== "true")(
  "loadCostRollupLateral revenue = SUM(charge_lines) — P0B alias-fix regression lock (real PostgreSQL)",
  () => {
    it("proforma revenue equals the sum of active load_charge_lines (alias fix regression lock)", async () => {
      const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
      if (!cs) throw new Error("DATABASE_URL required");
      refuseProductionConnectionString(cs);
      if (!["localhost", "127.0.0.1", "::1"].includes(new URL(cs).hostname)) {
        throw new Error("Loopback PostgreSQL only");
      }
      const db = new pg.Client(buildPgClientConfig(cs));
      await db.connect();
      await refuseProductionDatabase(db);

      const actor = "00000000-0000-4000-8000-0000000000ee";
      const tag = randomUUID().slice(0, 8);

      try {
        await db.query("BEGIN");
        await db.query("SET LOCAL app.bypass_rls = 'lucia'");
        await db.query("SET LOCAL app.allow_owner_bootstrap = '1'");
        await db.query(
          "INSERT INTO identity.users (id,email,role,preferred_language) VALUES ($1,$2,'Owner','en') ON CONFLICT(id) DO NOTHING",
          [actor, `lcr-test-${tag}@test.invalid`]
        );

        const one = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0]!;

        const company = (
          await one(
            "INSERT INTO org.companies (code,legal_name,company_type) VALUES ($1,'LCR Test','operating_carrier') RETURNING id",
            [`LCR${tag}`]
          )
        ).id;
        await db.query("SELECT set_config('app.operating_company_id',$1,true)", [company]);

        const trailerType = await prepareCompanyForLoadInserts(db, company);
        const customer = (
          await one(
            "INSERT INTO mdata.customers (operating_company_id,customer_name) VALUES ($1,'LCR test customer') RETURNING id",
            [company]
          )
        ).id;

        const loadNumber = String(8000000000 + Number.parseInt(tag, 16) % 90000000);
        const load = (
          await one(
            `INSERT INTO mdata.loads
               (operating_company_id,load_number,customer_id,dispatcher_user_id,load_trailer_equipment_id,status,rate_total_cents,is_sample_data)
             VALUES ($1,$2,$3,$4,$5,'delivered',999999,false) RETURNING id`,
            [company, loadNumber, customer, actor, trailerType]
          )
        ).id;

        // Seed two charge lines: 100,000 + 50,000 = 150,000 cents total.
        await db.query(
          `INSERT INTO dispatch.load_charge_lines
             (operating_company_id,load_id,line_kind,charge_code,amount_cents,sort_order,created_by_user_id)
           VALUES ($1,$2,'system','linehaul',100000,10,$3),
                  ($1,$2,'system','fuel_surcharge',50000,20,$3)`,
          [company, load, actor]
        );

        const sql = `
          SELECT lcr.revenue_cents, lcr.revenue_source
            FROM mdata.loads l
            ${loadCostRollupLateral("l.id", "l.operating_company_id")}
           WHERE l.id = $1
             AND l.operating_company_id = $2
        `;
        const row = await one(sql, [load, company]);

        // Before the alias fix, revenue_cents was "0" (lcl.load_id = cl.id was a self-reference).
        expect(row, "rollup row must be present — lateral returned no row").toBeTruthy();
        expect(String(row.revenue_cents)).toBe("150000");
        expect(row.revenue_source).toBe("proforma");
      } finally {
        await db.query("ROLLBACK");
        await db.end();
      }
    }, 30_000);
  }
);
