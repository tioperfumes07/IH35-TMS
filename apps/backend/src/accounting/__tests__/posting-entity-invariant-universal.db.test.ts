/**
 * LEAD 443.113 I-02 — real Postgres: the posting entity invariant is UNIVERSAL. Every source type is classified
 * (posting-line-writer.ts): a PARTY_FROM_DOCUMENT document's posting carries the party its document names (driver
 * liability, newly derived); an unclassified source type is refused; a partyless document posts with no party. One transaction,
 * rolled back — nothing is left behind.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import { UnclassifiedPostingSourceTypeError } from "../posting-line-writer.js";
import { postBalancedSourceLine } from "../../../test-helpers/post-balanced-source-line.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("posting entity invariant is universal (443.113 I-02, real Postgres)", () => {
  it("document party stamped; unclassified refused; partyless allowed", async () => {
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
      const tag = `TST${Date.now().toString(36).toUpperCase()}`;
      const one = async <T = { id: string }>(sql: string, params: unknown[]) => (await db.query<T>(sql, params)).rows[0]!;
      const opco = (await one(`INSERT INTO org.companies (code, legal_name, company_type) VALUES ($1, $2, 'operating_carrier') RETURNING id::text AS id`,
        [`${tag}I`, `I-02 posting party test ${tag}`])).id;
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const driver = (await one(`INSERT INTO mdata.drivers (operating_company_id, first_name, last_name, phone) VALUES ($1, 'Tst', 'I02', '5555550113') RETURNING id::text AS id`, [opco])).id;
      const account = (await one(`INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number) VALUES ($1, 'TST I02 expense', 'Expense', '96913') RETURNING id::text AS id`, [opco])).id;
      const je = (await one(`INSERT INTO accounting.journal_entries (operating_company_id, entry_date, memo) VALUES ($1, CURRENT_DATE, 'TST I02') RETURNING id::text AS id`, [opco])).id;
      const liability = (await one(
        `INSERT INTO driver_finance.driver_liabilities (operating_company_id, driver_id, type, source_description, original_amount, current_balance)
         VALUES ($1, $2, 'advance', 'TST I02', 100, 100) RETURNING id::text AS id`, [opco, driver])).id;

      let seq = 0;
      const post = async (type: string | null, id: string | null) => {
        seq += 1;
        const postingId = await postBalancedSourceLine(db as never, {
          operating_company_id: opco, journal_entry_uuid: je, line_sequence: seq, account_id: account,
          debit_or_credit: seq % 2 ? "debit" : "credit", amount_cents: 100, description: `TST I02 ${type}`,
          source_transaction_type: type, source_transaction_id: id,
        } as never);
        return one<{ entity_uuid: string | null; entity_type: string | null }>(
          `SELECT entity_uuid::text, entity_type FROM accounting.journal_entry_postings WHERE id = $1::uuid`, [postingId]);
      };
      const refused = async (type: string | null, id: string | null, err: new (...a: never[]) => Error) => {
        await db.query("SAVEPOINT r");
        await expect(post(type, id)).rejects.toBeInstanceOf(err);
        await db.query("ROLLBACK TO SAVEPOINT r");
      };

      // A driver liability (PARTY_FROM_DOCUMENT, newly derived) names its driver.
      expect(await post("driver_liability", liability)).toEqual({ entity_uuid: driver, entity_type: "driver" });
      // A source type nobody classified is refused.
      await refused("tst_unclassified_poster", liability, UnclassifiedPostingSourceTypeError);
      // A partyless document posts with no party.
      expect(await post("journal_entry", je)).toEqual({ entity_uuid: null, entity_type: null });
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end();
    }
  });
});
