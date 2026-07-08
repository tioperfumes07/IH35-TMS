/**
 * [HOLD-FOR-JORGE — TIER 1] BLOCK-6 IDEMPOTENCY FIX — a re-run of maybePostBankDriverAdvanceForCategorization
 * against the SAME bank transaction must NEVER double-book the driver loan / double-deduct pay.
 *
 * Root-cause: decide() had no idempotency guard even though Phase 3 of the entry point already stamped
 * driver_finance.driver_advances.linked_bank_txn_id on the advance it created. This proves the new
 * short-circuit (decide() queries that EXISTING column first and returns reason: already_posted) against a
 * real migrated Postgres:
 *   - first call (flag ON, driver-advance account): posts the balanced JE + creates the recoverable advance
 *     + settlement-recovery deduction, exactly as BLOCK-6 always did.
 *   - second call for the SAME bank transaction: posted:false, reason:'already_posted' — zero additional
 *     driver_advances rows, zero additional journal_entry_postings rows, zero additional
 *     driver_settlement_deductions rows. The driver receivable is booked EXACTLY ONCE and pay is deducted
 *     EXACTLY ONCE.
 * Runs only in CI (GITHUB_ACTIONS=true) where a migrated Postgres is available.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import { CASH_ADVANCE_MAP_TEST_LOCK_KEY, TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import {
  BANK_DRIVER_ADVANCE_FLAG_KEY,
  maybePostBankDriverAdvanceForCategorization,
} from "../bank-driver-advance.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("BLOCK-6 IDEMPOTENCY FIX — bank-driver-advance re-run never double-books (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  const suffix = randomUUID().slice(0, 8);
  const userId = TEST_OWNER_USER_ID;

  const acct = {
    driverAdvance: randomUUID(), // Other Current Asset — the driver receivable
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
         VALUES ($1::uuid,$2::uuid,'B6IDEM','Drv',$3,'Active')`,
        [id, companyId, `+1007${randomUUID().slice(0, 7)}`]
      );
    });
    drivers.push(id);
    return id;
  }

  /** A money-OUT bank transaction (an advance disbursement) for the given amount in cents. */
  async function seedBankDebit(amountCents: number): Promise<string> {
    const id = randomUUID();
    await bypass(async () => {
      await db.query(
        `INSERT INTO banking.bank_transactions
           (id, bank_account_id, operating_company_id, transaction_date, amount_cents, is_credit, status, description)
         VALUES ($1::uuid,$2::uuid,$3::uuid, CURRENT_DATE, $4, false, 'pending_categorization', 'B6-IDEM advance disbursement')`,
        [id, bankAccountId, companyId, -Math.abs(amountCents)]
      );
    });
    bankTxns.push(id);
    return id;
  }

  async function jePostingCount(sourceTransactionType: string, sourceTransactionId: string) {
    const rows = await scopedRead<{ n: string }>(
      `SELECT COUNT(*)::text AS n
       FROM accounting.journal_entry_postings
       WHERE operating_company_id = $1::uuid
         AND source_transaction_type = $2
         AND source_transaction_id = $3`,
      [companyId, sourceTransactionType, sourceTransactionId]
    );
    return Number(rows[0]?.n ?? 0);
  }

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
    // Serialize with the other bank-driver-advance / bank-feed-gl-posting .db.test.ts files that mutate
    // the SAME shared TRANSP company's singleton active cash_advance mapping.
    await db.query("SELECT pg_advisory_lock($1::bigint)", [CASH_ADVANCE_MAP_TEST_LOCK_KEY]);
    await bypass(async () => {
      await db.query(
        `INSERT INTO identity.users (id, email, role, preferred_language) VALUES ($1::uuid,$2,'Owner','en') ON CONFLICT (id) DO NOTHING`,
        [userId, `b6idem-${suffix}@test.local`]
      );
      const mk = async (id: string, n: string, type: string) =>
        db.query(
          `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
           VALUES ($1::uuid,$2::uuid,$3,$4,$5,true)`,
          [id, companyId, `${n}${suffix}`, `B6IDEM ${n}`, type]
        );
      await mk(acct.driverAdvance, "DADI", "Asset");
      await mk(acct.bank, "DBNI", "Asset");

      // Repoint the SINGLETON active cash_advance mapping at this test's driver-advance account (same
      // FLAKE FIX pattern as bank-driver-advance.db.test.ts — this test owns the mapping for its duration
      // under the advisory lock above).
      await db.query(
        `INSERT INTO accounting.expense_category_account_map
           (operating_company_id, category_kind, category_code, account_id, posting_side, is_active)
         VALUES ($1::uuid,'cash_advance','cash_advance',$2::uuid,'debit',true)
         ON CONFLICT (operating_company_id, category_kind, category_code, is_active) WHERE is_active = true
         DO UPDATE SET account_id = EXCLUDED.account_id, posting_side = EXCLUDED.posting_side`,
        [companyId, acct.driverAdvance]
      );

      await db.query(
        `INSERT INTO banking.bank_accounts (id, operating_company_id, account_name, ledger_account_id)
         VALUES ($1::uuid,$2::uuid,'B6IDEM Ops Checking',$3::uuid)`,
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
        await db.query(`DELETE FROM driver_finance.driver_settlement_deductions WHERE driver_id = ANY($1::uuid[])`, [drivers]);
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
        await db.query(`DELETE FROM catalogs.accounts WHERE id = ANY($1::uuid[])`, [[acct.driverAdvance, acct.bank]]);
        await db.query(`DELETE FROM lib.feature_flag_overrides WHERE flag_key = $1 AND operating_company_id = $2::uuid`, [
          BANK_DRIVER_ADVANCE_FLAG_KEY,
          companyId,
        ]);
      });
    } catch {
      /* best-effort */
    } finally {
      await db.query("SELECT pg_advisory_unlock($1::bigint)", [CASH_ADVANCE_MAP_TEST_LOCK_KEY]).catch(() => {});
    }
    await db.end();
  });

  it("re-running the SAME bank transaction twice posts the driver receivable + settlement deduction EXACTLY ONCE", async () => {
    await setFlag(true);
    const driver = await seedDriver();
    const amountCents = 22_500;
    const txn = await seedBankDebit(amountCents);

    const input = {
      companyId,
      actorUserUuid: userId,
      actorRole: "Owner",
      bankTransactionId: txn,
      driverId: driver,
      glAccountId: acct.driverAdvance,
      memo: "B6-IDEM first run",
    };

    // First run — posts.
    const first = await maybePostBankDriverAdvanceForCategorization(input);
    if (!first.posted) throw new Error(`expected first run to post; got reason='${first.reason}' message='${first.message ?? ""}'`);
    expect(first.posted).toBe(true);
    advanceIds.push(first.advance_id);

    const advancesAfterFirst = await scopedRead<{ id: string }>(
      `SELECT id::text FROM driver_finance.driver_advances WHERE linked_bank_txn_id = $1::uuid`,
      [txn]
    );
    expect(advancesAfterFirst).toHaveLength(1);
    expect(await jePostingCount("driver_advance", first.advance_id)).toBe(2); // DEBIT + CREDIT, balanced

    const deductionsAfterFirst = await scopedRead(
      `SELECT id FROM driver_finance.driver_settlement_deductions WHERE source_bank_transaction_id = $1::uuid`,
      [txn]
    );
    expect(deductionsAfterFirst).toHaveLength(1);

    // Second run for the SAME bank transaction — must short-circuit, not double-book.
    const second = await maybePostBankDriverAdvanceForCategorization({ ...input, memo: "B6-IDEM replay" });
    expect(second.posted).toBe(false);
    if (!second.posted) expect(second.reason).toBe("already_posted");

    // EXACTLY ONE advance, EXACTLY ONE balanced JE pair, EXACTLY ONE recovery deduction — no double-book,
    // no double-deduct.
    const advancesAfterSecond = await scopedRead<{ id: string }>(
      `SELECT id::text FROM driver_finance.driver_advances WHERE linked_bank_txn_id = $1::uuid`,
      [txn]
    );
    expect(advancesAfterSecond).toHaveLength(1);
    expect(advancesAfterSecond[0]?.id).toBe(first.advance_id);
    expect(await jePostingCount("driver_advance", first.advance_id)).toBe(2);

    const deductionsAfterSecond = await scopedRead(
      `SELECT id FROM driver_finance.driver_settlement_deductions WHERE source_bank_transaction_id = $1::uuid`,
      [txn]
    );
    expect(deductionsAfterSecond).toHaveLength(1);
  });
});
