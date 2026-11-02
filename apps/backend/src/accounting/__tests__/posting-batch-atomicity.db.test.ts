import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import { postValidatedPostingLinesInClientTx } from "../posting-engine.service.js";
import type { PostingLineWrite } from "../posting-line-writer.js";

describe.skipIf(process.env.GITHUB_ACTIONS !== "true")("ENG-28 real transaction atomicity", () => {
  it("a later lineage refusal rolls back every inserted leg and spine, leaving the transaction usable", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    refuseProductionConnectionString(cs);
    await ensureIntegrationPrerequisites();
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      const company = (await db.query(`INSERT INTO org.companies (code, legal_name, company_type)
        VALUES ($1, 'TST batch atomicity', 'operating_carrier') RETURNING id::text`, [`TSTB${Date.now().toString(36)}`])).rows[0].id;
      await db.query(`SELECT set_config('app.operating_company_id', $1, true)`, [company]);
      const account = (await db.query(`INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number)
        VALUES ($1, 'TST batch account', 'Expense', '96909') RETURNING id::text`, [company])).rows[0].id;
      const header = (await db.query(`INSERT INTO accounting.journal_entries (operating_company_id, entry_date, memo)
        VALUES ($1, CURRENT_DATE, 'TST complete batch') RETURNING id::text`, [company])).rows[0].id;
      const input: PostingLineWrite[] = ["debit", "credit"].map((side, i) => ({
        operating_company_id: company, journal_entry_uuid: header, line_sequence: i + 1,
        account_id: account, debit_or_credit: side as "debit" | "credit", amount_cents: 12345,
        description: "TST", source_transaction_type: i === 0 ? "journal_entry" : "deliberately_unclassified_source",
        source_transaction_id: header, idempotency_key: "atomic-test",
      }));
      await expect(postValidatedPostingLinesInClientTx(db as never, input)).rejects.toThrow("unclassified");
      expect((await db.query(`SELECT count(*)::int AS n FROM accounting.journal_entry_postings WHERE journal_entry_uuid = $1`, [header])).rows[0].n).toBe(0);
      expect((await db.query(`SELECT count(*)::int AS n FROM accounting.transaction_source_links WHERE operating_company_id = $1`, [company])).rows[0].n).toBe(0);
      input[1].source_transaction_type = "journal_entry";
      const ids = await postValidatedPostingLinesInClientTx(db as never, input);
      expect(ids).toHaveLength(2);
      expect(await postValidatedPostingLinesInClientTx(db as never, input, { skipOnIdempotencyConflict: true })).toEqual([null, null]);
      expect((await db.query(`SELECT sum(CASE WHEN debit_or_credit = 'debit' THEN amount_cents ELSE -amount_cents END)::text AS net
        FROM accounting.journal_entry_postings WHERE journal_entry_uuid = $1`, [header])).rows[0].net).toBe("0");
      expect((await db.query(`SELECT count(*)::int AS n FROM accounting.transaction_source_links WHERE operating_company_id = $1`, [company])).rows[0].n).toBe(2);
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end();
    }
  });
});
