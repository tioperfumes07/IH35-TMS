/**
 * BLOCK-03 / CHAIN-05 — Bank-feed categorization → GL posting (gap-closure). Proves the flag-gated,
 * direction-aware, fail-closed, no-double-post contract against a real migrated Postgres (CI only):
 *   (1) flag OFF                         -> NO-OP (reason flag_off); zero journal_entry_postings.
 *   (2) flag ON + money-OUT + expense    -> balanced JE DR expense / CR bank (Math.abs of a NEGATIVE
 *                                           amount_cents); matched_journal_entry_id stamped.
 *   (3) flag ON + money-IN  + income     -> balanced JE DR bank / CR income.
 *   (4) flag ON + money-OUT + liability  -> balanced JE DR liability / CR bank.
 *   (5) flag ON + Driver + advance acct  -> CEDED to BLOCK-6 (reason driver_advance_branch); zero JE.
 *   (6) flag ON + matched_bill_id set    -> SKIP (reason already_matched_to_bill); zero JE.
 *   (7) flag ON + no categorized account -> fail-closed (reason no_account); zero JE.
 *   (8) idempotency                      -> second call already_posted; exactly ONE batch + TWO lines.
 *
 * Direction is derived ONLY from is_credit (never the amount_cents sign). The posting path is the EXISTING
 * postSourceTransaction('bank_categorization') — this test writes no GL math of its own. Runs only in CI
 * (GITHUB_ACTIONS=true) where a migrated Postgres is available.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import {
  BANK_FEED_GL_POSTING_FLAG_KEY,
  maybePostBankCategorizationToGl,
} from "../bank-feed-gl-posting.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("CHAIN-05 bank-feed categorization → GL posting (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  const suffix = randomUUID().slice(0, 8);
  const userId = TEST_OWNER_USER_ID;

  const acct = {
    expense: randomUUID(), // Expense
    income: randomUUID(), // Income
    liability: randomUUID(), // Liability
    bank: randomUUID(), // Bank-type COA (the register)
    driverAdvance: randomUUID(), // Other Current Asset — driver receivable (cede target)
  };
  const bankAccountId = randomUUID();
  const drivers: string[] = [];
  const bankTxns: string[] = [];
  const bills: string[] = [];

  async function bypass(fn: () => Promise<void>) {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    if (companyId) await db.query(`SET LOCAL app.operating_company_id = '${companyId}'`);
    try {
      await fn();
      await db.query("COMMIT");
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    }
  }

  async function scopedRead<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query(`SET LOCAL app.operating_company_id = '${companyId}'`);
    try {
      const r = await db.query(sql, params);
      await db.query("COMMIT");
      return r.rows as T[];
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    }
  }

  async function setFlag(enabled: boolean) {
    await bypass(async () => {
      await db.query(
        `DELETE FROM lib.feature_flag_overrides WHERE flag_key=$1 AND operating_company_id=$2::uuid AND user_uuid IS NULL`,
        [BANK_FEED_GL_POSTING_FLAG_KEY, companyId]
      );
      await db.query(
        `INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid)
         VALUES ($1, $2::uuid, NULL, $3, $4::uuid)`,
        [BANK_FEED_GL_POSTING_FLAG_KEY, companyId, enabled, userId]
      );
    });
  }

  async function seedDriver(): Promise<string> {
    const id = randomUUID();
    await bypass(async () => {
      await db.query(
        `INSERT INTO mdata.drivers (id, operating_company_id, first_name, last_name, phone, status)
         VALUES ($1::uuid,$2::uuid,'C5','Drv',$3,'Active')`,
        [id, companyId, `+1005${randomUUID().slice(0, 7)}`]
      );
    });
    drivers.push(id);
    return id;
  }

  /**
   * Seed a CATEGORIZED bank transaction. is_credit=false (money OUT) is stored NEGATIVE (BLOCK-6/Plaid
   * convention); is_credit=true (money IN) is stored POSITIVE. glAccountId may be null (no_account test).
   */
  async function seedCategorized(opts: {
    amountCents: number;
    isCredit: boolean;
    glAccountId: string | null;
    driverId?: string | null;
    matchedBillId?: string | null;
  }): Promise<string> {
    const id = randomUUID();
    const stored = opts.isCredit ? Math.abs(opts.amountCents) : -Math.abs(opts.amountCents);
    await bypass(async () => {
      await db.query(
        `INSERT INTO banking.bank_transactions
           (id, bank_account_id, operating_company_id, transaction_date, amount_cents, is_credit, status,
            description, categorization_gl_account_id, categorization_driver_id, matched_bill_id)
         VALUES ($1::uuid,$2::uuid,$3::uuid, CURRENT_DATE, $4, $5, 'categorized', 'C5 categorized line',
                 $6::uuid, $7::uuid, $8::uuid)`,
        [id, bankAccountId, companyId, stored, opts.isCredit, opts.glAccountId, opts.driverId ?? null, opts.matchedBillId ?? null]
      );
    });
    bankTxns.push(id);
    return id;
  }

  async function seedBill(): Promise<string> {
    const id = randomUUID();
    await bypass(async () => {
      await db.query(`INSERT INTO accounting.bills (id, operating_company_id) VALUES ($1::uuid,$2::uuid)`, [id, companyId]);
    });
    bills.push(id);
    return id;
  }

  async function jeLines(bankTxnId: string) {
    return scopedRead<{ account_id: string; debit_or_credit: string; amount_cents: string; batch: string }>(
      `SELECT account_id::text, debit_or_credit, amount_cents::text, posting_batch_id::text AS batch
       FROM accounting.journal_entry_postings
       WHERE operating_company_id = $1::uuid
         AND source_transaction_type = 'bank_categorization'
         AND source_transaction_id = $2
       ORDER BY line_sequence ASC`,
      [companyId, bankTxnId]
    );
  }

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
    await bypass(async () => {
      await db.query(
        `INSERT INTO identity.users (id, email, role, preferred_language) VALUES ($1::uuid,$2,'Owner','en') ON CONFLICT (id) DO NOTHING`,
        [userId, `c5-${suffix}@test.local`]
      );
      const mk = async (id: string, n: string, type: string) =>
        db.query(
          `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
           VALUES ($1::uuid,$2::uuid,$3,$4,$5,true)`,
          [id, companyId, `${n}${suffix}`, `C5 ${n}`, type]
        );
      await mk(acct.expense, "CEXP", "Expense");
      await mk(acct.income, "CINC", "Income");
      await mk(acct.liability, "CLIA", "Liability");
      await mk(acct.bank, "CBNK", "Asset");
      await mk(acct.driverAdvance, "CDADV", "Asset");

      // Driver-advance receivable mapping (the cede target — BLOCK-6's authoritative account).
      await db.query(
        `INSERT INTO accounting.expense_category_account_map
           (operating_company_id, category_kind, category_code, account_id, posting_side, is_active)
         VALUES ($1::uuid,'cash_advance','cash_advance',$2::uuid,'debit',true)
         ON CONFLICT DO NOTHING`,
        [companyId, acct.driverAdvance]
      );

      // Bank account whose ledger register is the bank COA account (the cash-GL bridge).
      await db.query(
        `INSERT INTO banking.bank_accounts (id, operating_company_id, account_name, ledger_account_id)
         VALUES ($1::uuid,$2::uuid,'C5 Ops Checking',$3::uuid)`,
        [bankAccountId, companyId, acct.bank]
      );
    });
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await bypass(async () => {
        await db.query(
          `DELETE FROM accounting.transaction_source_links WHERE linked_object_id = ANY($1) AND linked_object_type='bank_categorization'`,
          [bankTxns]
        );
        await db.query(
          `DELETE FROM accounting.journal_entry_postings WHERE source_transaction_id = ANY($1) AND source_transaction_type='bank_categorization'`,
          [bankTxns]
        );
        await db.query(
          `DELETE FROM accounting.posting_batches WHERE source_transaction_id = ANY($1) AND source_transaction_type='bank_categorization'`,
          [bankTxns]
        );
        await db.query(`DELETE FROM banking.bank_transactions WHERE id = ANY($1::uuid[])`, [bankTxns]);
        await db.query(`DELETE FROM banking.bank_accounts WHERE id = $1::uuid`, [bankAccountId]);
        await db.query(`DELETE FROM accounting.bills WHERE id = ANY($1::uuid[])`, [bills]);
        await db.query(`DELETE FROM mdata.drivers WHERE id = ANY($1::uuid[])`, [drivers]);
        await db.query(
          `DELETE FROM accounting.expense_category_account_map WHERE operating_company_id=$1::uuid AND category_kind='cash_advance' AND account_id=$2::uuid`,
          [companyId, acct.driverAdvance]
        );
        await db.query(`DELETE FROM catalogs.accounts WHERE id = ANY($1::uuid[])`, [
          [acct.expense, acct.income, acct.liability, acct.bank, acct.driverAdvance],
        ]);
        await db.query(`DELETE FROM lib.feature_flag_overrides WHERE flag_key=$1 AND operating_company_id=$2::uuid`, [
          BANK_FEED_GL_POSTING_FLAG_KEY,
          companyId,
        ]);
      });
    } catch {
      /* best-effort */
    }
    await db.end();
  });

  it("(1) flag OFF -> no-op (flag_off), zero JE", async () => {
    await setFlag(false);
    const txn = await seedCategorized({ amountCents: 42_000, isCredit: false, glAccountId: acct.expense });
    const res = await maybePostBankCategorizationToGl({ companyId, actorUserUuid: userId, bankTransactionId: txn });
    expect(res.posted).toBe(false);
    if (!res.posted) expect(res.reason).toBe("flag_off");
    expect((await jeLines(txn)).length).toBe(0);
  });

  it("(2) flag ON + money-OUT expense -> DR expense / CR bank (abs of negative)", async () => {
    await setFlag(true);
    const amountCents = 42_000;
    const txn = await seedCategorized({ amountCents, isCredit: false, glAccountId: acct.expense });
    const res = await maybePostBankCategorizationToGl({ companyId, actorUserUuid: userId, bankTransactionId: txn });
    expect(res.posted).toBe(true);
    if (!res.posted) throw new Error(`expected posted; got ${res.reason} ${res.message ?? ""}`);
    expect(res.direction).toBe("money_out");
    expect(res.amount_cents).toBe(amountCents);

    const lines = await jeLines(txn);
    expect(lines.length).toBe(2);
    const debit = lines.find((l) => l.debit_or_credit === "debit");
    const credit = lines.find((l) => l.debit_or_credit === "credit");
    expect(debit?.account_id).toBe(acct.expense);
    expect(credit?.account_id).toBe(acct.bank);
    expect(Number(debit?.amount_cents)).toBe(amountCents);
    expect(Number(credit?.amount_cents)).toBe(amountCents);

    const [row] = await scopedRead<{ matched_journal_entry_id: string | null; review_state: string }>(
      `SELECT matched_journal_entry_id::text, review_state FROM banking.bank_transactions WHERE id=$1::uuid`,
      [txn]
    );
    expect(row?.matched_journal_entry_id).toBe(res.journal_entry_id);
    expect(row?.review_state).toBe("matched");
  });

  it("(3) flag ON + money-IN income -> DR bank / CR income", async () => {
    await setFlag(true);
    const amountCents = 125_000;
    const txn = await seedCategorized({ amountCents, isCredit: true, glAccountId: acct.income });
    const res = await maybePostBankCategorizationToGl({ companyId, actorUserUuid: userId, bankTransactionId: txn });
    expect(res.posted).toBe(true);
    if (!res.posted) throw new Error(`expected posted; got ${res.reason}`);
    expect(res.direction).toBe("money_in");

    const lines = await jeLines(txn);
    const debit = lines.find((l) => l.debit_or_credit === "debit");
    const credit = lines.find((l) => l.debit_or_credit === "credit");
    expect(debit?.account_id).toBe(acct.bank);
    expect(credit?.account_id).toBe(acct.income);
    expect(Number(debit?.amount_cents)).toBe(amountCents);
    expect(Number(credit?.amount_cents)).toBe(amountCents);
  });

  it("(4) flag ON + money-OUT liability -> DR liability / CR bank", async () => {
    await setFlag(true);
    const amountCents = 30_000;
    const txn = await seedCategorized({ amountCents, isCredit: false, glAccountId: acct.liability });
    const res = await maybePostBankCategorizationToGl({ companyId, actorUserUuid: userId, bankTransactionId: txn });
    expect(res.posted).toBe(true);
    const lines = await jeLines(txn);
    const debit = lines.find((l) => l.debit_or_credit === "debit");
    const credit = lines.find((l) => l.debit_or_credit === "credit");
    expect(debit?.account_id).toBe(acct.liability);
    expect(credit?.account_id).toBe(acct.bank);
  });

  it("(5) flag ON + Driver + advance account -> CEDED to BLOCK-6 (driver_advance_branch), zero JE", async () => {
    await setFlag(true);
    const driver = await seedDriver();
    const txn = await seedCategorized({ amountCents: 15_000, isCredit: false, glAccountId: acct.driverAdvance, driverId: driver });
    const res = await maybePostBankCategorizationToGl({ companyId, actorUserUuid: userId, bankTransactionId: txn });
    expect(res.posted).toBe(false);
    if (!res.posted) expect(res.reason).toBe("driver_advance_branch");
    expect((await jeLines(txn)).length).toBe(0);
  });

  it("(6) flag ON + matched_bill_id set -> SKIP (already_matched_to_bill), zero JE", async () => {
    await setFlag(true);
    const billId = await seedBill();
    const txn = await seedCategorized({ amountCents: 20_000, isCredit: false, glAccountId: acct.expense, matchedBillId: billId });
    const res = await maybePostBankCategorizationToGl({ companyId, actorUserUuid: userId, bankTransactionId: txn });
    expect(res.posted).toBe(false);
    if (!res.posted) expect(res.reason).toBe("already_matched_to_bill");
    expect((await jeLines(txn)).length).toBe(0);
  });

  it("(7) flag ON + no categorized account -> fail-closed (no_account), zero JE", async () => {
    await setFlag(true);
    const txn = await seedCategorized({ amountCents: 10_000, isCredit: false, glAccountId: null });
    const res = await maybePostBankCategorizationToGl({ companyId, actorUserUuid: userId, bankTransactionId: txn });
    expect(res.posted).toBe(false);
    if (!res.posted) expect(res.reason).toBe("no_account");
    expect((await jeLines(txn)).length).toBe(0);
  });

  it("(8) idempotent -> second call already_posted; exactly ONE batch + TWO lines", async () => {
    await setFlag(true);
    const txn = await seedCategorized({ amountCents: 77_700, isCredit: false, glAccountId: acct.expense });
    const first = await maybePostBankCategorizationToGl({ companyId, actorUserUuid: userId, bankTransactionId: txn });
    expect(first.posted).toBe(true);
    const second = await maybePostBankCategorizationToGl({ companyId, actorUserUuid: userId, bankTransactionId: txn });
    // Idempotent by matched_journal_entry_id (decide short-circuits to already_posted).
    expect(second.posted).toBe(false);
    if (!second.posted) expect(second.reason).toBe("already_posted");

    const lines = await jeLines(txn);
    expect(lines.length).toBe(2);
    const batches = new Set(lines.map((l) => l.batch));
    expect(batches.size).toBe(1);
  });
});
