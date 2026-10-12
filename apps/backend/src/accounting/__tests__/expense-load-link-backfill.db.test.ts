/**
 * LEAD 443.112 #1 — real Postgres: linkExpensesToLoads writes the missing expense_attribution.expense_load_links row for
 * a load expense written without one (the Creator's pre-G13 direct writes). Every fixture lives in ONE transaction that
 * is rolled back.
 *
 *  - spine-numbered expenses (`<load>` and `<load>-1`): linked with the expense's own number and the spine sequence it
 *    stands for, the same columns the shared writer writes (one helper: insertExpenseLoadLink), one audit row each,
 *    the load's sequence counter raised to that sequence; amounts / numbers byte-identical;
 *  - an expense number not on its load's spine, another company's load, a number already held by another link: refused;
 *  - a voided expense is never considered; dry run writes nothing; a second run considers 0; a non-Owner is refused.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { ensureIntegrationPrerequisites, prepareCompanyForLoadInserts } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { ExpenseLoadLinkBackfillError, linkExpensesToLoads } from "../expense-load-link-backfill.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("expense load-link backfill (443.112 #1, real Postgres)", () => {
  it("links spine-numbered load expenses; refuses off-spine / foreign / taken; dry run; idempotent; Owner only", async () => {
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
      const tag = `ELL${Date.now().toString(36).toUpperCase()}`;
      const co = async (code: string) =>
        (await db.query<{ id: string }>(
          `INSERT INTO org.companies (code, legal_name, company_type) VALUES ($1, $2, 'operating_carrier') RETURNING id::text AS id`,
          [code, `Expense link test ${code}`]
        )).rows[0]!.id;
      const opco = await co(`${tag}A`);
      const other = await co(`${tag}B`);
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const trailerType = await prepareCompanyForLoadInserts(db, opco);
      const trailerTypeOther = await prepareCompanyForLoadInserts(db, other);
      const one = async <T = { id: string }>(sql: string, params: unknown[]) => (await db.query<T>(sql, params)).rows[0]!;
      const customer = async (c: string) =>
        (await one(`INSERT INTO mdata.customers (operating_company_id, customer_name) VALUES ($1, 'ELL customer') RETURNING id::text AS id`, [c])).id;
      const custA = await customer(opco);
      const custB = await customer(other);
      const load = async (c: string, cust: string, n: string, tt: string = trailerType) =>
        (await one(
          `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id)
           VALUES ($1, $2, $3, $4, $5) RETURNING id::text AS id`,
          [c, `${tag}${n}`, cust, TEST_OWNER_USER_ID, tt]
        )).id;
      let trace = 100_000 + (Date.now() % 800_000);
      const expense = async (loadId: string, number: string) =>
        (await one(
          `INSERT INTO accounting.expenses (operating_company_id, transaction_date, total_amount_cents, trace_no, load_id, expense_number)
           VALUES ($1, current_date, 700, $2, $3, $4) RETURNING id::text AS id`,
          [opco, (trace += 1), loadId, number]
        )).id;

      const l1 = await load(opco, custA, "1");
      const l1n = `${tag}1`;
      const xBase = await expense(l1, l1n); // `<load>` = spine sequence 1
      const xSecond = await expense(l1, `${l1n}-1`); // `<load>-1` = spine sequence 2
      const xOff = await expense(l1, `EXP-${tag}-9`); // not on its load's spine
      const xVoided = await expense(l1, `${l1n}-5`);
      await db.query(`UPDATE accounting.expenses SET voided_at = now(), status = 'void' WHERE id = $1`, [xVoided]);
      const lForeign = await load(other, custB, "2", trailerTypeOther);
      await db.query(`SET LOCAL session_replication_role = replica`); // plant a cross-company row the guard trigger refuses
      const xForeign = await expense(lForeign, `${tag}2`);
      await db.query(`SET LOCAL session_replication_role = origin`);
      const l3 = await load(opco, custA, "3");
      const xTaken = await expense(l3, `${tag}3`);
      const xHolder = await expense(l3, `${tag}3-HOLD`);
      // Another expense's link already holds xTaken's number.
      await db.query(
        `INSERT INTO expense_attribution.expense_load_links (operating_company_id, expense_id, expense_source, load_id, load_number, expense_seq, expense_number, attribution_method, attribution_confidence)
         VALUES ($1, $2, 'accounting', $3, $4, 1, $5, 'user_assigned', 'high')`,
        [opco, xHolder, l3, `${tag}3`, `${tag}3`]
      );

      const money = async () =>
        (await db.query(`SELECT id, total_amount_cents, status, expense_number, load_id FROM accounting.expenses WHERE operating_company_id = $1 ORDER BY id`, [opco])).rows;
      const before = await money();
      const links = async () =>
        (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM expense_attribution.expense_load_links WHERE operating_company_id = $1`, [opco])).rows[0]!.n;

      // Non-Owner: refused (and the refusal is audited).
      await expect(
        linkExpensesToLoads(db as never, { operatingCompanyId: opco, actorUserId: TEST_OWNER_USER_ID, actorRole: "Dispatcher", dryRun: true })
      ).rejects.toBeInstanceOf(ExpenseLoadLinkBackfillError);

      const dry = await linkExpensesToLoads(db as never, { operatingCompanyId: opco, actorUserId: TEST_OWNER_USER_ID, dryRun: true });
      const by = (r: typeof dry) => Object.fromEntries(r.expenses.map((e) => [e.expense_id, e]));
      const d = by(dry);
      expect(dry.considered).toBe(5); // the voided expense is never considered
      expect(d[xVoided]).toBeUndefined();
      expect(d[xBase]).toMatchObject({ outcome: "planned" });
      expect(d[xSecond]).toMatchObject({ outcome: "planned" });
      expect(d[xOff]).toMatchObject({ outcome: "refused", reason: "expense_number_not_on_load_spine" });
      expect(d[xForeign]).toMatchObject({ outcome: "refused", reason: "load_of_another_company" });
      expect(d[xTaken]).toMatchObject({ outcome: "refused", reason: "expense_number_held_by_another_link" });
      expect(await links()).toBe(1);

      const run = await linkExpensesToLoads(db as never, { operatingCompanyId: opco, actorUserId: TEST_OWNER_USER_ID, dryRun: false });
      expect(run.linked).toBe(2);
      expect(run.refused).toBe(3);
      const rows = (
        await db.query(
          `SELECT expense_id::text, expense_source, load_id::text, load_number, expense_seq, expense_number, attribution_method,
                  attribution_confidence, attributed_by_user_id::text, overridden_from_expense_number
             FROM expense_attribution.expense_load_links WHERE expense_id = ANY($1::uuid[]) ORDER BY expense_seq`,
          [[xBase, xSecond]]
        )
      ).rows;
      expect(rows).toEqual([
        { expense_id: xBase, expense_source: "accounting", load_id: l1, load_number: l1n, expense_seq: 1, expense_number: l1n,
          attribution_method: "user_assigned", attribution_confidence: "high", attributed_by_user_id: TEST_OWNER_USER_ID, overridden_from_expense_number: null },
        { expense_id: xSecond, expense_source: "accounting", load_id: l1, load_number: l1n, expense_seq: 2, expense_number: `${l1n}-1`,
          attribution_method: "user_assigned", attribution_confidence: "high", attributed_by_user_id: TEST_OWNER_USER_ID, overridden_from_expense_number: null },
      ]);
      const counter = (await db.query<{ s: number }>(`SELECT last_seq AS s FROM expense_attribution.expense_seq_per_load WHERE load_id = $1`, [l1])).rows[0]!.s;
      expect(counter).toBeGreaterThanOrEqual(2);
      const audit = (await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM audit.audit_events WHERE event_class = 'expense.load_link_backfilled' AND payload->>'operating_company_id' = $1`,
        [opco]
      )).rows[0]!.n;
      expect(audit).toBe(2);
      expect(await money()).toEqual(before);

      const again = await linkExpensesToLoads(db as never, { operatingCompanyId: opco, actorUserId: TEST_OWNER_USER_ID, dryRun: false });
      expect(again.linked).toBe(0);
      expect(again.considered).toBe(3); // only the three refusals remain
      expect(await links()).toBe(3);
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end();
    }
  });
});
