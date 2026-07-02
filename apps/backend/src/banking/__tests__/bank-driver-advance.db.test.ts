/**
 * BLOCK-6 [HOLD] — Driver dimension on bank categorize → loan-to-driver (advance/receivable) posting.
 * Proves the OWNER-GATED / flag-gated contract against a real migrated Postgres (CI only):
 *   (a) flag OFF                         -> NO-OP (reason flag_off); zero driver_advances, zero JEs.
 *   (b) flag ON + an EXPENSE account     -> NO receivable (reason not_advance_account); stays an expense.
 *   (c) flag ON + the Driver-Advance acct -> a BALANCED JE: DEBIT the driver-advance receivable /
 *                                            CREDIT the source bank account, PLUS a recoverable
 *                                            driver_advances + driver_liabilities row (settlement recovery).
 *
 * The posting path is the EXISTING one (createEmployeeLoanCore + disburseDriverAdvanceCore →
 * postSourceTransaction('driver_advance')); this test writes no GL math of its own.
 * Runs only in CI (GITHUB_ACTIONS=true) where a migrated Postgres is available.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import {
  BANK_DRIVER_ADVANCE_FLAG_KEY,
  maybePostBankDriverAdvanceForCategorization,
} from "../bank-driver-advance.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("BLOCK-6 bank-categorize driver advance posting (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  const suffix = randomUUID().slice(0, 8);
  const userId = TEST_OWNER_USER_ID;

  const acct = {
    driverAdvance: randomUUID(), // Other Current Asset — the driver receivable (QBO-149 analog)
    expense: randomUUID(), // an ordinary expense account (the "fine we eat" case)
    bank: randomUUID(), // Bank-type COA account (the register the money leaves)
  };
  const bankAccountId = randomUUID();
  const drivers: string[] = [];
  const bankTxns: string[] = [];
  const advanceIds: string[] = [];

  async function bypass(fn: () => Promise<void>) {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    if (companyId) await db.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
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
    await db.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
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
        [BANK_DRIVER_ADVANCE_FLAG_KEY, companyId]
      );
      await db.query(
        `INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid)
         VALUES ($1, $2::uuid, NULL, $3, $4::uuid)`,
        [BANK_DRIVER_ADVANCE_FLAG_KEY, companyId, enabled, userId]
      );
    });
  }

  async function seedDriver(): Promise<string> {
    const id = randomUUID();
    await bypass(async () => {
      await db.query(
        `INSERT INTO mdata.drivers (id, operating_company_id, first_name, last_name, phone, status)
         VALUES ($1::uuid,$2::uuid,'B6','Drv',$3,'Active')`,
        [id, companyId, `+1006${randomUUID().slice(0, 7)}`]
      );
    });
    drivers.push(id);
    return id;
  }

  /** A money-OUT bank transaction (a fine the company paid) for the given amount in cents. */
  async function seedBankDebit(amountCents: number): Promise<string> {
    const id = randomUUID();
    await bypass(async () => {
      await db.query(
        `INSERT INTO banking.bank_transactions
           (id, bank_account_id, operating_company_id, transaction_date, amount_cents, is_credit, status, description)
         VALUES ($1::uuid,$2::uuid,$3::uuid, CURRENT_DATE, $4, false, 'pending_categorization', 'B6 fine paid for driver')`,
        [id, bankAccountId, companyId, -Math.abs(amountCents)]
      );
    });
    bankTxns.push(id);
    return id;
  }

  async function jePostingsForAdvance(advanceId: string) {
    return scopedRead<{ account_id: string; debit_or_credit: string; amount_cents: string }>(
      `SELECT account_id::text, debit_or_credit, amount_cents::text
       FROM accounting.journal_entry_postings
       WHERE operating_company_id = $1::uuid
         AND source_transaction_type = 'driver_advance'
         AND source_transaction_id = $2
       ORDER BY line_sequence ASC`,
      [companyId, advanceId]
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
        [userId, `b6-${suffix}@test.local`]
      );
      const mk = async (id: string, n: string, type: string) =>
        db.query(
          `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
           VALUES ($1::uuid,$2::uuid,$3,$4,$5,true)`,
          [id, companyId, `${n}${suffix}`, `B6 ${n}`, type]
        );
      await mk(acct.driverAdvance, "DADV", "Asset");
      await mk(acct.expense, "DEXP", "Expense");
      await mk(acct.bank, "DBNK", "Asset");

      // The authoritative driver-advance receivable mapping the posting path resolves + debits.
      await db.query(
        `INSERT INTO accounting.expense_category_account_map
           (operating_company_id, category_kind, category_code, account_id, posting_side, is_active)
         VALUES ($1::uuid,'cash_advance','cash_advance',$2::uuid,'debit',true)
         ON CONFLICT DO NOTHING`,
        [companyId, acct.driverAdvance]
      );

      // A bank account whose ledger register is the bank COA account (the CREDIT side).
      await db.query(
        `INSERT INTO banking.bank_accounts (id, operating_company_id, account_name, ledger_account_id)
         VALUES ($1::uuid,$2::uuid,'B6 Ops Checking',$3::uuid)`,
        [bankAccountId, companyId, acct.bank]
      );
    });
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await bypass(async () => {
        await db.query(
          `DELETE FROM accounting.transaction_source_links WHERE linked_object_id = ANY($1) AND linked_object_type='driver_advance'`,
          [advanceIds]
        );
        await db.query(
          `DELETE FROM accounting.journal_entry_postings WHERE source_transaction_id = ANY($1) AND source_transaction_type='driver_advance'`,
          [advanceIds]
        );
        await db.query(`DELETE FROM driver_finance.deduction_schedule WHERE driver_id = ANY($1::uuid[])`, [drivers]);
        await db.query(`DELETE FROM driver_finance.driver_advances WHERE driver_id = ANY($1::uuid[])`, [drivers]);
        await db.query(`DELETE FROM driver_finance.driver_liabilities WHERE driver_id = ANY($1::uuid[])`, [drivers]);
        await db.query(`DELETE FROM banking.bank_transactions WHERE id = ANY($1::uuid[])`, [bankTxns]);
        await db.query(`DELETE FROM banking.bank_accounts WHERE id = $1::uuid`, [bankAccountId]);
        await db.query(`DELETE FROM mdata.drivers WHERE id = ANY($1::uuid[])`, [drivers]);
        await db.query(
          `DELETE FROM accounting.expense_category_account_map WHERE operating_company_id=$1::uuid AND category_kind='cash_advance' AND account_id=$2::uuid`,
          [companyId, acct.driverAdvance]
        );
        await db.query(`DELETE FROM catalogs.accounts WHERE id = ANY($1::uuid[])`, [[acct.driverAdvance, acct.expense, acct.bank]]);
        await db.query(`DELETE FROM lib.feature_flag_overrides WHERE flag_key = $1 AND operating_company_id = $2::uuid`, [
          BANK_DRIVER_ADVANCE_FLAG_KEY,
          companyId,
        ]);
      });
    } catch {
      /* best-effort */
    }
    await db.end();
  });

  it("(a) flag OFF -> no-op (flag_off), zero driver advances", async () => {
    await setFlag(false);
    const driver = await seedDriver();
    const txn = await seedBankDebit(12_500);

    const res = await maybePostBankDriverAdvanceForCategorization({
      companyId,
      actorUserUuid: userId,
      actorRole: "Owner",
      bankTransactionId: txn,
      driverId: driver,
      glAccountId: acct.driverAdvance,
    });

    expect(res.posted).toBe(false);
    if (!res.posted) expect(res.reason).toBe("flag_off");

    const advances = await scopedRead(
      `SELECT id FROM driver_finance.driver_advances WHERE driver_id = $1::uuid`,
      [driver]
    );
    expect(advances.length).toBe(0);
  });

  it("(b) flag ON + an EXPENSE account -> tag only, NO receivable", async () => {
    await setFlag(true);
    const driver = await seedDriver();
    const txn = await seedBankDebit(9_900);

    const res = await maybePostBankDriverAdvanceForCategorization({
      companyId,
      actorUserUuid: userId,
      actorRole: "Owner",
      bankTransactionId: txn,
      driverId: driver,
      glAccountId: acct.expense, // NOT the driver-advance account
    });

    expect(res.posted).toBe(false);
    if (!res.posted) expect(res.reason).toBe("not_advance_account");

    const advances = await scopedRead(
      `SELECT id FROM driver_finance.driver_advances WHERE driver_id = $1::uuid`,
      [driver]
    );
    expect(advances.length).toBe(0);
  });

  it("(c) flag ON + the Driver-Advance account -> DEBIT receivable / CREDIT bank + recoverable advance", async () => {
    await setFlag(true);
    const driver = await seedDriver();
    const amountCents = 15_000;
    const txn = await seedBankDebit(amountCents);

    const res = await maybePostBankDriverAdvanceForCategorization({
      companyId,
      actorUserUuid: userId,
      actorRole: "Owner",
      bankTransactionId: txn,
      driverId: driver,
      glAccountId: acct.driverAdvance,
      memo: "Speeding fine paid on driver's behalf",
    });

    expect(res.posted).toBe(true);
    if (!res.posted) throw new Error(`expected posted; got ${res.reason} ${res.message ?? ""}`);
    advanceIds.push(res.advance_id);

    expect(res.driver_advance_account_id).toBe(acct.driverAdvance);
    expect(res.amount_cents).toBe(amountCents);
    expect(res.journal_entry_id).toBeTruthy();

    // Balanced JE: DEBIT the driver-advance receivable, CREDIT the source bank register, equal amounts.
    const lines = await jePostingsForAdvance(res.advance_id);
    expect(lines.length).toBe(2);
    const debit = lines.find((l) => l.debit_or_credit === "debit");
    const credit = lines.find((l) => l.debit_or_credit === "credit");
    expect(debit?.account_id).toBe(acct.driverAdvance);
    expect(credit?.account_id).toBe(acct.bank);
    expect(Number(debit?.amount_cents)).toBe(amountCents);
    expect(Number(credit?.amount_cents)).toBe(amountCents);

    // A recoverable advance + its driver liability exist (flows into settlement recovery).
    const advance = await scopedRead<{ id: string; linked_bank_txn_id: string | null; disbursement_status: string }>(
      `SELECT id::text, linked_bank_txn_id::text, disbursement_status
       FROM driver_finance.driver_advances WHERE id = $1::uuid`,
      [res.advance_id]
    );
    expect(advance.length).toBe(1);
    expect(advance[0]?.disbursement_status).toBe("disbursed");
    expect(advance[0]?.linked_bank_txn_id).toBe(txn);

    const liability = await scopedRead(
      `SELECT id FROM driver_finance.driver_liabilities WHERE id = $1::uuid`,
      [res.liability_id]
    );
    expect(liability.length).toBe(1);
  });
});
