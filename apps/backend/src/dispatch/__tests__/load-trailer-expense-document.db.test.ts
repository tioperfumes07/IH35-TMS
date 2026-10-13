/**
 * LEAD 443.109 — real Postgres: stampLoadTrailersFromExpenses records a load's physical trailer from the trailer named
 * on its own live expense documents. Every fixture lives in ONE transaction that is rolled back.
 *
 *  - one trailer on the load's expenses: matched; assignment row (reason expense_document_trailer) + the load's other
 *    expense / line with an empty trailer filled + one audit event; the load-trailer rule the driver-bill writers read
 *    now resolves that trailer; amounts identical;
 *  - two different trailers on one load: "two_trailers", nothing written;
 *  - a trailer another company owns: never written; a voided expense's trailer never counts;
 *  - no trailer on any expense: listed; a customer-trailer load is never considered;
 *  - dry run writes nothing; a second run writes nothing (the load now has an assignment trailer).
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { ensureIntegrationPrerequisites, prepareCompanyForLoadInserts } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { sameEntityLoadCompanyTrailerSql } from "../../accounting/load-trailer.sql.js";
import { stampLoadTrailersFromExpenses } from "../load-trailer-expense-document.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("load trailer recorded from its own expense documents (443.109, real Postgres)", () => {
  it("match / two trailers / foreign / voided / none / customer / dry run / idempotent", async () => {
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
      const tag = `TXD${Date.now().toString(36).toUpperCase()}`;
      const co = async (code: string) =>
        (await db.query<{ id: string }>(
          `INSERT INTO org.companies (code, legal_name, company_type) VALUES ($1, $2, 'operating_carrier') RETURNING id::text AS id`,
          [code, `Expense trailer test ${code}`]
        )).rows[0]!.id;
      const opco = await co(`${tag}A`);
      const other = await co(`${tag}B`);
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const trailerType = await prepareCompanyForLoadInserts(db, opco);
      const one = async <T = { id: string }>(sql: string, params: unknown[]) => (await db.query<T>(sql, params)).rows[0]!;
      const customer = (await one(`INSERT INTO mdata.customers (operating_company_id, customer_name) VALUES ($1, 'TXD customer') RETURNING id::text AS id`, [opco])).id;
      const equipment = async (n: string, owner: string) =>
        (await one(`INSERT INTO mdata.equipment (equipment_number, equipment_type, owner_company_id) VALUES ($1, 'Reefer', $2) RETURNING id::text AS id`,
          [`${tag}-${n}`, owner])).id;
      const tA = await equipment("T1", opco);
      const tB = await equipment("T2", opco);
      const tForeign = await equipment("T3", other);
      const nonOwned = (await one(
        `INSERT INTO dispatch.non_owned_trailers (operating_company_id, trailer_number, counterparty_type, counterparty_id) VALUES ($1, $2, 'customer', $3) RETURNING id::text AS id`,
        [opco, `${tag}-C1`, customer]
      )).id;
      const load = async (n: string) =>
        (await one(
          `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id)
           VALUES ($1, $2, $3, $4, $5) RETURNING id::text AS id`,
          [opco, `${tag}${n}`, customer, TEST_OWNER_USER_ID, trailerType]
        )).id;
      let trace = 100_000 + (Date.now() % 800_000);
      const expense = async (loadId: string, trailerId: string | null) =>
        (await one(`INSERT INTO accounting.expenses (operating_company_id, transaction_date, total_amount_cents, trace_no, load_id, trailer_id)
                    VALUES ($1, current_date, 500, $2, $3, $4) RETURNING id::text AS id`, [opco, (trace += 1), loadId, trailerId])).id;

      const lMatch = await load("1");
      await expense(lMatch, tA);
      const xEmpty = await expense(lMatch, null); // the load's other document, trailer empty — filled from the named one
      const lTwo = await load("2");
      await expense(lTwo, tA);
      await expense(lTwo, tB);
      const lForeign = await load("3");
      await db.query(`SET LOCAL session_replication_role = replica`); // plant a cross-company row the guard trigger refuses
      await expense(lForeign, tForeign);
      await db.query(`SET LOCAL session_replication_role = origin`);
      const lVoided = await load("4");
      const xVoided = await expense(lVoided, tB);
      await db.query(`UPDATE accounting.expenses SET voided_at = now(), status = 'void' WHERE id = $1`, [xVoided]);
      const lNone = await load("5");
      await expense(lNone, null);
      const lCustomer = await load("6");
      await expense(lCustomer, tA);
      await db.query(`UPDATE mdata.loads SET trailer_source = 'customer', non_owned_trailer_id = $2 WHERE id = $1`, [lCustomer, nonOwned]);

      const ids = [lMatch, lTwo, lForeign, lVoided, lNone, lCustomer];
      const amounts = async () => (await db.query(`SELECT id, total_amount_cents, status FROM accounting.expenses WHERE operating_company_id = $1 ORDER BY id`, [opco])).rows;
      const before = await amounts();
      const hist = async () => (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM dispatch.load_assignment_history WHERE operating_company_id = $1 AND new_trailer_id IS NOT NULL`, [opco])).rows[0]!.n;

      const dry = await stampLoadTrailersFromExpenses(db as never, { operatingCompanyId: opco, actorUserId: TEST_OWNER_USER_ID, dryRun: true, loadIds: ids });
      expect(dry.loads_considered).toBe(5); // the customer-trailer load is never considered
      const by = (r: typeof dry) => Object.fromEntries(r.loads.map((d) => [d.load_id, d]));
      const d = by(dry);
      expect(d[lMatch]).toMatchObject({ decision: "match", trailer_id: tA, outcome: "planned" });
      expect(d[lTwo]).toMatchObject({ decision: "two_trailers", trailer_id: null });
      expect(d[lTwo].reason).toMatch(/two trailers/);
      expect(d[lForeign]).toMatchObject({ decision: "no_expense_trailer", trailer_id: null });
      expect(d[lForeign].reason).toMatch(/not owned or leased/);
      expect(d[lVoided]).toMatchObject({ decision: "no_expense_trailer" });
      expect(d[lNone]).toMatchObject({ decision: "no_expense_trailer", reason: "no trailer on any expense" });
      expect(await hist()).toBe(0);

      const run = await stampLoadTrailersFromExpenses(db as never, { operatingCompanyId: opco, actorUserId: TEST_OWNER_USER_ID, dryRun: false, loadIds: ids });
      expect(run.stamped_loads).toBe(1);
      expect(run.refused_loads).toBe(0);
      expect(by(run)[lMatch]).toMatchObject({ outcome: "stamped", expenses_stamped: 1 });
      const h = (await db.query(`SELECT load_id::text, new_trailer_id::text, assignment_method, reason_code FROM dispatch.load_assignment_history WHERE operating_company_id = $1 AND new_trailer_id IS NOT NULL`, [opco])).rows;
      expect(h).toEqual([{ load_id: lMatch, new_trailer_id: tA, assignment_method: "auto_reassign", reason_code: "expense_document_trailer" }]);
      expect((await db.query(`SELECT trailer_id::text AS t FROM accounting.expenses WHERE id = $1`, [xEmpty])).rows[0].t).toBe(tA);
      // The one rule every driver-bill writer and the bill stamp read now resolves the load's trailer from its assignment.
      const rule = (await db.query(`SELECT ${sameEntityLoadCompanyTrailerSql("$1::uuid", "$2::uuid")}::text AS t`, [lMatch, opco])).rows[0].t;
      expect(rule).toBe(tA);
      const audit = (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM audit.audit_events WHERE event_class = 'load.trailer_from_expense_document' AND payload->>'operating_company_id' = $1`, [opco])).rows[0]!.n;
      expect(audit).toBe(1);
      expect(await amounts()).toEqual(before);

      const again = await stampLoadTrailersFromExpenses(db as never, { operatingCompanyId: opco, actorUserId: TEST_OWNER_USER_ID, dryRun: false, loadIds: ids });
      expect(again.stamped_loads).toBe(0);
      expect(again.loads.find((x) => x.load_id === lMatch)).toBeUndefined();
      expect(await hist()).toBe(1);
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end();
    }
  });
});
