/**
 * LEAD 443.232 b — a fuel receipt the 443.214 engine moved to its GPS load (reclassify: line-level reversal of the original
 * legs + new legs on the right load) could not be voided: postVoidReversal took EVERY line of every live entry touching the
 * source — the already-reversed original lines and the reclass's own reversal lines — and reversed them again
 * (23505 uq_jep_one_reversal_per_line). Real Postgres, rolled back. Main: the void throws. Branch: it reverses only the live
 * original lines, and every account nets to zero for the source.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { ensureIntegrationLoadId } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { postVoidReversal } from "../void.service.js";
import { applyReclassifyOnClient } from "../reclassify/reclassify.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("void after reclassify (443.232, real Postgres)", () => {
  it("voids a reclassified fuel receipt: no double reversal, every account nets to zero", async () => {
    const fixtureLoadId = await ensureIntegrationLoadId();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      const base = (await db.query<{ company: string; customer: string; trailer: string | null }>(
        `SELECT operating_company_id::text AS company, customer_id::text AS customer, load_trailer_equipment_id::text AS trailer
           FROM mdata.loads WHERE id = $1::uuid`, [fixtureLoadId])).rows[0]!;
      const co = base.company;
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [co]);
      const acct = async (type: string) => (await db.query<{ id: string }>(
        `SELECT id::text FROM catalogs.accounts WHERE operating_company_id = $1::uuid AND account_type = $2 LIMIT 1`, [co, type])).rows[0]?.id;
      const expense = (await acct("CostOfGoodsSold")) ?? (await acct("Expense"));
      const payable = (await acct("Liability")) ?? (await acct("OtherCurrentLiability"));
      expect(expense && payable, "fixture accounts").toBeTruthy();
      const newLoad = async (n: string) => (await db.query<{ id: string }>(
        `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id)
         VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5::uuid) RETURNING id::text`,
        [co, `${n}-${randomUUID().slice(0, 6)}`, base.customer, TEST_OWNER_USER_ID, base.trailer])).rows[0]!.id;
      const loadA = await newLoad("VRA");
      const loadB = await newLoad("VRB");
      const fuelId = randomUUID();
      const je = (await db.query<{ id: string }>(
        `INSERT INTO accounting.journal_entries (operating_company_id, entry_date, status, memo) VALUES ($1::uuid, '2026-09-02', 'posted', 'test fuel receipt') RETURNING id::text`, [co])).rows[0]!.id;
      const leg = async (seq: number, account: string, dc: string) => (await db.query<{ id: string }>(
        `INSERT INTO accounting.journal_entry_postings (operating_company_id, journal_entry_uuid, line_sequence, account_id, debit_or_credit, amount_cents,
                                                        source_transaction_type, source_transaction_id, load_id)
         VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5, 40781, 'fuel_event', $6, $7::uuid) RETURNING id::text`,
        [co, je, seq, account, dc, fuelId, loadA])).rows[0]!.id;
      const dr = await leg(1, expense!, "debit");
      const cr = await leg(2, payable!, "credit");

      // the 443.214 move: the fill's legs to its GPS load through the one reclassify engine
      await applyReclassifyOnClient(db as never, { operating_company_id: co, posting_ids: [dr, cr], to_load_id: loadB, reason: "test GPS move" } as never,
        { userId: TEST_OWNER_USER_ID, role: "Owner" });

      await db.query("SAVEPOINT v");
      const res = await postVoidReversal(db as never, { operatingCompanyId: co, entityType: "fuel_event", entityId: fuelId, originalDate: "2026-09-02", memo: "test void" },
        { userId: TEST_OWNER_USER_ID }).catch((e: { code?: string; message?: string }) => ({ error: `${e.code ?? ""} ${e.message ?? ""}` }));
      expect("error" in res ? res.error : "ok").toBe("ok"); // main: "23505 duplicate key … uq_jep_one_reversal_per_line"
      const nets = (await db.query<{ account_id: string; net: string }>(
        `SELECT p.account_id::text, sum(CASE WHEN p.debit_or_credit ILIKE 'd%' THEN p.amount_cents ELSE -p.amount_cents END)::text AS net
           FROM accounting.journal_entry_postings p JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid AND j.status = 'posted'
          WHERE p.source_transaction_type = 'fuel_event' AND p.source_transaction_id = $1 GROUP BY 1`, [fuelId])).rows;
      for (const n of nets) expect(Number(n.net), `account ${n.account_id}`).toBe(0);
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end().catch(() => {});
    }
  }, 60_000);
});
