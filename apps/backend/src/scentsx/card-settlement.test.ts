/**
 * ROUND L.31 M9 — a ScentsX card-processor settlement on the ONE deposit poster (postSourceTransactionInClientTx 'bank_deposit'):
 * $150.00 of card receipts in 1090 Undeposited Funds, the processor withheld $4.35 → Dr 1000 Operating Checking $145.65,
 * Dr 6100 Card Processing Fees $4.35, Cr 1090 Undeposited Funds $150.00. Debits = credits. Real Postgres, rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { postSourceTransactionInClientTx } from "../accounting/posting-engine.service.js";
import { resolveRoleAccountOptional } from "../accounting/coa-roles/resolver.service.js";
import { nextDepositDisplayId } from "../accounting/display-id.js";

describe.skipIf(process.env.GITHUB_ACTIONS !== "true")("ScentsX card settlement (real Postgres, rolled back)", () => {
  let db: pg.Client;
  let co: string;
  const acct = async (num: string) =>
    (await db.query<{ id: string }>(`SELECT id::text FROM catalogs.accounts WHERE operating_company_id = $1::uuid AND account_number = $2 AND deactivated_at IS NULL`, [co, num])).rows[0]!.id;
  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect(); await db.query("BEGIN"); await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    co = (await db.query<{ id: string }>(`SELECT id::text FROM org.companies WHERE code = 'SCENTSX'`)).rows[0]!.id;
    await db.query(`SELECT set_config('app.operating_company_id', $1, true)`, [co]);
  });
  afterAll(async () => { await db?.query("ROLLBACK").catch(() => {}); await db?.end().catch(() => {}); });

  it("net to the bank, fee to 6100, gross out of Undeposited Funds", async () => {
    const uf = await resolveRoleAccountOptional(db as never, co, "undeposited_funds");
    expect(uf).toBe(await acct("1090"));
    const bank = (await db.query<{ id: string; ledger: string }>(
      `SELECT b.id::text, b.ledger_account_id::text AS ledger FROM banking.bank_accounts b JOIN catalogs.accounts a ON a.id = b.ledger_account_id
        WHERE b.operating_company_id = $1::uuid AND a.account_number = '1000'`, [co])).rows[0]!;
    const fee = await acct("6100");
    const displayId = await nextDepositDisplayId(db as never, co, new Date("2026-11-27T12:00:00Z"));
    const dep = (await db.query<{ id: string }>(
      `INSERT INTO accounting.deposits (operating_company_id, display_id, deposit_date, bank_account_id, bank_ledger_account_id, undeposited_funds_account_id,
         total_receipts_cents, cash_back_cents, amount_deposited_cents, cash_back_account_id, memo, created_by_user_id, updated_by_user_id)
       VALUES ($1::uuid, $7, '2026-11-27', $2::uuid, $3::uuid, $4::uuid, 15000, 435, 14565, $5::uuid, 'Card settlement', $6::uuid, $6::uuid) RETURNING id::text`,
      [co, bank.id, bank.ledger, uf, fee, TEST_OWNER_USER_ID, displayId])).rows[0]!.id;
    await postSourceTransactionInClientTx(db as never, { operating_company_id: co, source_transaction_type: "bank_deposit", source_transaction_id: dep }, { userId: TEST_OWNER_USER_ID });
    const lines = (await db.query<{ num: string; side: string; cents: string }>(
      `SELECT a.account_number AS num, p.debit_or_credit AS side, p.amount_cents::text AS cents
         FROM accounting.journal_entry_postings p JOIN catalogs.accounts a ON a.id = p.account_id
        WHERE p.source_transaction_type = 'bank_deposit' AND p.source_transaction_id = $1 ORDER BY p.debit_or_credit DESC, a.account_number`, [dep])).rows
      .map((r) => [r.side, r.num, Number(r.cents)]);
    expect(lines).toEqual([["debit", "1000", 14565], ["debit", "6100", 435], ["credit", "1090", 15000]]);
  });
});
