/**
 * [HOLD-FOR-JORGE — TIER 1] BLOCK-6b IDEMPOTENCY FIX — a re-run of
 * maybeCreateBankCategorizationDriverDeduction against the SAME bank transaction must NEVER
 * double-charge the driver's recoverable-expense bucket.
 *
 * Root-cause: the dedup key (banking.bank_transactions.categorization_deduction_id) ALREADY EXISTED —
 * step 3 of the entry point stamps it after a successful bucket-charge + deduction — but decide() never
 * READ it before charging again. This proves the new short-circuit (reason: already_charged) against a
 * real migrated Postgres:
 *   - first call (flag ON, driver tagged, recover_from_driver=true, consent on file, NOT the
 *     driver-advance account): charges the bucket + creates the pending recoverable deduction, exactly as
 *     BLOCK-6b always did.
 *   - second call for the SAME bank transaction: posted:false, reason:'already_charged' — the bucket's
 *     charged_to_date_cents is unchanged and NO second driver_settlement_deductions row is created. The
 *     driver's bucket is charged EXACTLY ONCE.
 * Runs only in CI (GITHUB_ACTIONS=true) where a migrated Postgres is available.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import {
  BANK_DRIVER_EXPENSE_DEDUCTION_FLAG_KEY,
  maybeCreateBankCategorizationDriverDeduction,
} from "../bank-driver-expense-deduction.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration(
  "BLOCK-6b IDEMPOTENCY FIX — bank-driver-expense-deduction re-run never double-charges the bucket (real Postgres)",
  () => {
    let db: pg.Client;
    let companyId: string;
    let templateId: string;
    const suffix = randomUUID().slice(0, 8);
    const userId = TEST_OWNER_USER_ID;

    const expenseAccountId = randomUUID(); // an ordinary expense account (NOT the driver-advance account)
    const bankAccountId = randomUUID();
    const drivers: string[] = [];
    const bankTxns: string[] = [];
    const bucketIds: string[] = [];
    const deductionIds: string[] = [];

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
          [BANK_DRIVER_EXPENSE_DEDUCTION_FLAG_KEY, companyId]
        );
        await db.query(
          `INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid)
           VALUES ($1, $2::uuid, NULL, $3, $4::uuid)`,
          [BANK_DRIVER_EXPENSE_DEDUCTION_FLAG_KEY, companyId, enabled, userId]
        );
      });
    }

    /** Seed a driver WITH a signed hire-contract-equivalent deduction authorization on file (consent gate). */
    async function seedConsentedDriver(): Promise<string> {
      const id = randomUUID();
      await bypass(async () => {
        await db.query(
          `INSERT INTO mdata.drivers (id, operating_company_id, first_name, last_name, phone, status)
           VALUES ($1::uuid,$2::uuid,'B6bIDEM','Drv',$3,'Active')`,
          [id, companyId, `+1008${randomUUID().slice(0, 7)}`]
        );
        await db.query(
          `INSERT INTO legal.contract_instances
             (operating_company_id, template_id, template_code, template_version, signer_type, signer_entity_id, signer_name, language, status)
           VALUES ($1::uuid,$2::uuid,'driver_deduction_auth',1,'driver',$3::uuid,'B6bIDEM Drv','en','signed_electronically')`,
          [companyId, templateId, id]
        );
      });
      drivers.push(id);
      return id;
    }

    /** A money-OUT bank transaction (a fine the company paid on the driver's behalf) for the given cents. */
    async function seedBankDebit(amountCents: number): Promise<string> {
      const id = randomUUID();
      await bypass(async () => {
        await db.query(
          `INSERT INTO banking.bank_transactions
             (id, bank_account_id, operating_company_id, transaction_date, amount_cents, is_credit, status, description)
           VALUES ($1::uuid,$2::uuid,$3::uuid, CURRENT_DATE, $4, false, 'pending_categorization', 'B6b-IDEM fine paid for driver')`,
          [id, bankAccountId, companyId, -Math.abs(amountCents)]
        );
      });
      bankTxns.push(id);
      return id;
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
          [userId, `b6bidem-${suffix}@test.local`]
        );
        await db.query(
          `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
           VALUES ($1::uuid,$2::uuid,$3,$4,'Expense',true)`,
          [expenseAccountId, companyId, `DEXPI${suffix}`, "B6bIDEM Expense"]
        );
        await db.query(
          `INSERT INTO banking.bank_accounts (id, operating_company_id, account_name)
           VALUES ($1::uuid,$2::uuid,'B6bIDEM Ops Checking')`,
          [bankAccountId, companyId]
        );
        const tpl = await db.query<{ id: string }>(
          `INSERT INTO legal.contract_templates
             (operating_company_id, template_code, version, display_name_en, display_name_es, category, content_html_en, content_html_es)
           VALUES ($1::uuid,'driver_deduction_auth',1,'Driver Deduction Auth','Autorizacion','hr','<p>en</p>','<p>es</p>')
           ON CONFLICT (operating_company_id, template_code, version)
             DO UPDATE SET display_name_en = EXCLUDED.display_name_en
           RETURNING id::text`,
          [companyId]
        );
        templateId = tpl.rows[0]!.id;
      });
    });

    afterAll(async () => {
      if (!db) return;
      try {
        await bypass(async () => {
          await db.query(`DELETE FROM driver_finance.driver_settlement_deductions WHERE id = ANY($1::uuid[])`, [deductionIds]);
          await db.query(`DELETE FROM driver_finance.driver_deduction_bucket_events WHERE bucket_id = ANY($1::uuid[])`, [bucketIds]);
          await db.query(`DELETE FROM driver_finance.driver_deduction_buckets WHERE id = ANY($1::uuid[])`, [bucketIds]);
          await db.query(`DELETE FROM banking.bank_transactions WHERE id = ANY($1::uuid[])`, [bankTxns]);
          await db.query(`DELETE FROM banking.bank_accounts WHERE id = $1::uuid`, [bankAccountId]);
          await db.query(`DELETE FROM legal.contract_instances WHERE signer_entity_id = ANY($1::uuid[])`, [drivers]);
          await db.query(`DELETE FROM mdata.drivers WHERE id = ANY($1::uuid[])`, [drivers]);
          await db.query(`DELETE FROM catalogs.accounts WHERE id = $1::uuid`, [expenseAccountId]);
          await db.query(`DELETE FROM lib.feature_flag_overrides WHERE flag_key = $1 AND operating_company_id = $2::uuid`, [
            BANK_DRIVER_EXPENSE_DEDUCTION_FLAG_KEY,
            companyId,
          ]);
        });
      } catch {
        /* best-effort */
      }
      await db.end();
    });

    it("re-running the SAME bank transaction twice charges the driver's bucket EXACTLY ONCE", async () => {
      await setFlag(true);
      const driver = await seedConsentedDriver();
      const amountCents = 7_500;
      const txn = await seedBankDebit(amountCents);

      const input = {
        companyId,
        actorUserUuid: userId,
        bankTransactionId: txn,
        driverId: driver,
        glAccountId: expenseAccountId,
        recoverFromDriver: true,
        recoverDeductionType: "fine",
        memo: "B6b-IDEM first run",
      };

      // First run — charges the bucket + creates the deduction.
      const first = await maybeCreateBankCategorizationDriverDeduction(input);
      if (!first.posted) throw new Error(`expected first run to post; got reason='${first.reason}' message='${first.message ?? ""}'`);
      expect(first.posted).toBe(true);
      bucketIds.push(first.bucket_id);
      deductionIds.push(first.deduction_id);

      const bucketAfterFirst = await scopedRead<{ charged_to_date_cents: string; remaining_balance_cents: string }>(
        `SELECT charged_to_date_cents::text, remaining_balance_cents::text
         FROM driver_finance.driver_deduction_buckets WHERE id = $1::uuid`,
        [first.bucket_id]
      );
      expect(Number(bucketAfterFirst[0]?.charged_to_date_cents)).toBe(amountCents);
      expect(Number(bucketAfterFirst[0]?.remaining_balance_cents)).toBe(amountCents);

      const deductionsAfterFirst = await scopedRead(
        `SELECT id FROM driver_finance.driver_settlement_deductions WHERE source_bank_transaction_id = $1::uuid`,
        [txn]
      );
      expect(deductionsAfterFirst).toHaveLength(1);

      // Second run for the SAME bank transaction — must short-circuit, not double-charge.
      const second = await maybeCreateBankCategorizationDriverDeduction({ ...input, memo: "B6b-IDEM replay" });
      expect(second.posted).toBe(false);
      if (!second.posted) expect(second.reason).toBe("already_charged");

      // Bucket balance unchanged, EXACTLY ONE deduction — no double-charge.
      const bucketAfterSecond = await scopedRead<{ charged_to_date_cents: string; remaining_balance_cents: string }>(
        `SELECT charged_to_date_cents::text, remaining_balance_cents::text
         FROM driver_finance.driver_deduction_buckets WHERE id = $1::uuid`,
        [first.bucket_id]
      );
      expect(Number(bucketAfterSecond[0]?.charged_to_date_cents)).toBe(amountCents);
      expect(Number(bucketAfterSecond[0]?.remaining_balance_cents)).toBe(amountCents);

      const deductionsAfterSecond = await scopedRead(
        `SELECT id FROM driver_finance.driver_settlement_deductions WHERE source_bank_transaction_id = $1::uuid`,
        [txn]
      );
      expect(deductionsAfterSecond).toHaveLength(1);
      expect(deductionsAfterSecond[0]?.id).toBe(first.deduction_id);
    });
  }
);
