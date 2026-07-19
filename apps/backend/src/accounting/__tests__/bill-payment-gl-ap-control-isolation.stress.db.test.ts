/**
 * REGRESSION — concurrent cash + CC bill-payment GL posting must resolve EACH suite's own
 * ap_control deterministically.
 *
 * Reproduces the pre-isolation race class: parallel workers that each DO UPDATE
 * accounting.chart_of_accounts_roles(ap_control) on a SHARED company clobber each other so a
 * cash/CC debit assertion sees the sibling's account_id. With createIsolatedOperatingCompany(),
 * each worker owns a unique (company, ap_control) namespace — production uniqueness preserved —
 * and concurrent cash/CC setups must always debit the worker's own AP account.
 *
 * Each worker uses its OWN pg.Client (vitest forks / parallel CI workers are multi-connection).
 * Runs only in CI (GITHUB_ACTIONS=true). No product GL changes.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import {
  createIsolatedOperatingCompany,
  deactivateIsolatedOperatingCompany,
  ensureIntegrationPrerequisites,
  type IsolatedOperatingCompany,
} from "../../../test-helpers/db-fixture.js";
import { postSourceTransaction } from "../posting-engine.service.js";
import { postBillPaymentGlIfEnabled } from "../bill-payment-gl.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

type WorkerKind = "cash" | "cc";

type WorkerFixture = {
  kind: WorkerKind;
  client: pg.Client;
  isolated: IsolatedOperatingCompany;
  companyId: string;
  userId: string;
  apAccountId: string;
  bankGlAccountId: string;
  bankAccountId: string;
  ccLiabilityAccountId: string;
  fuelAccountId: string;
  fuelCode: string;
  billIds: string[];
  paymentIds: string[];
};

const ROUNDS = 4;
const WORKERS_PER_ROUND = 4; // 2 cash + 2 cc interleaved

describeIntegration("ap_control isolation stress — concurrent cash/CC bill-payment role resolution", () => {
  const workers: WorkerFixture[] = [];
  let connectCs: string;

  async function bypass(client: pg.Client, companyId: string, fn: () => Promise<void>) {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    try {
      await fn();
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    }
  }

  async function scopedRead<T>(client: pg.Client, companyId: string, sql: string, params: unknown[]): Promise<T[]> {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    try {
      const r = await client.query(sql, params);
      await client.query("COMMIT");
      return r.rows as T[];
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    }
  }

  async function provisionWorker(kind: WorkerKind, round: number, slot: number): Promise<WorkerFixture> {
    const suffix = randomUUID().slice(0, 8);
    const userId = randomUUID();
    const client = new pg.Client(buildPgClientConfig(connectCs));
    await client.connect();
    await client.query("SET ROLE ih35_app");

    // Actor must exist BEFORE createIsolatedOperatingCompany({ actorUserId }) — fail-loud grant.
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    await client.query(
      `INSERT INTO identity.users (id, email, role, preferred_language) VALUES ($1::uuid,$2,'Owner','en') ON CONFLICT (id) DO NOTHING`,
      [userId, `stress-${kind}-${suffix}@test.local`]
    );
    await client.query("COMMIT");

    const isolated = await createIsolatedOperatingCompany({
      label: `stress-${kind}-r${round}-s${slot}`,
      actorUserId: userId,
      client,
    });
    const companyId = isolated.companyId;
    const apAccountId = randomUUID();
    const bankGlAccountId = randomUUID();
    const bankAccountId = randomUUID();
    const ccLiabilityAccountId = randomUUID();
    const fuelAccountId = randomUUID();
    const fuelCode = `FUEL-${suffix}`;

    await bypass(client, companyId, async () => {
      await client.query(
        `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
         VALUES ($1::uuid,$3::uuid,$2,'Stress Fuel','Expense',true)`,
        [fuelAccountId, `SF${suffix}`, companyId]
      );
      await client.query(
        `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
         VALUES ($1::uuid,$3::uuid,$2,'Stress AP','Liability',true)`,
        [apAccountId, `SA${suffix}`, companyId]
      );
      await client.query(
        `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
         VALUES ($1::uuid,$3::uuid,$2,'Stress Bank','Asset',true)`,
        [bankGlAccountId, `SB${suffix}`, companyId]
      );
      await client.query(
        `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
         VALUES ($1::uuid,$3::uuid,$2,'Stress CC','Liability',true)`,
        [ccLiabilityAccountId, `SC${suffix}`, companyId]
      );
      await client.query(
        `INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
         VALUES ($1::uuid,'ap_control',$2::uuid,true)`,
        [companyId, apAccountId]
      );
      await client.query(
        `INSERT INTO accounting.expense_category_account_map (operating_company_id, category_kind, category_code, account_id, posting_side, is_active)
         VALUES ($1::uuid,'fuel',$2,$3::uuid,'debit',true)`,
        [companyId, fuelCode, fuelAccountId]
      );
      await client.query(
        `INSERT INTO banking.bank_accounts (id, operating_company_id, account_name, ledger_account_id, is_active)
         VALUES ($1::uuid,$2::uuid,'Stress Bank',$3::uuid,true)`,
        [bankAccountId, companyId, bankGlAccountId]
      );
      await client.query(
        `INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid)
         VALUES ('BILL_PAYMENT_GL_POSTING_ENABLED',$1::uuid,$2::uuid,true,$2::uuid)
         ON CONFLICT (flag_key, user_uuid) WHERE user_uuid IS NOT NULL DO UPDATE SET enabled = true`,
        [companyId, userId]
      );
    });

    return {
      kind,
      client,
      isolated,
      companyId,
      userId,
      apAccountId,
      bankGlAccountId,
      bankAccountId,
      ccLiabilityAccountId,
      fuelAccountId,
      fuelCode,
      billIds: [],
      paymentIds: [],
    };
  }

  async function runWorkerOnce(w: WorkerFixture): Promise<void> {
    const amount = w.kind === "cash" ? 77_000 : 55_000;
    const billId = randomUUID();
    const paymentId = randomUUID();
    w.billIds.push(billId);
    w.paymentIds.push(paymentId);

    await bypass(w.client, w.companyId, async () => {
      await w.client.query(
        `INSERT INTO accounting.bills (id, operating_company_id, bill_date, status, amount_cents, total_amount, bill_number)
         VALUES ($1::uuid,$2::uuid,CURRENT_DATE,'unpaid',$3,$4,$5)`,
        [billId, w.companyId, amount, amount / 100, `STRESS-${billId.slice(0, 8)}`]
      );
      await w.client.query(
        `INSERT INTO accounting.bill_lines (bill_id, line_sequence, amount, description, category_kind, category_code)
         VALUES ($1::uuid,1,$2,'stress','fuel',$3)`,
        [billId, amount / 100, w.fuelCode]
      );
      if (w.kind === "cash") {
        await w.client.query(
          `INSERT INTO accounting.bill_payments
             (id, operating_company_id, bill_id, payment_date, amount_cents, amount, payment_method,
              from_bank_account_id, status, created_by_user_id)
           VALUES ($1::uuid,$2::uuid,$3::uuid,CURRENT_DATE,$4,$5,'ach',$6::uuid,'posted',$7::uuid)`,
          [paymentId, w.companyId, billId, amount, amount / 100, w.bankAccountId, w.userId]
        );
      } else {
        await w.client.query(
          `INSERT INTO accounting.bill_payments
             (id, operating_company_id, bill_id, payment_date, amount_cents, amount, payment_method,
              cc_account_id, status, payment_source_kind, created_by_user_id)
           VALUES ($1::uuid,$2::uuid,$3::uuid,CURRENT_DATE,$4,$5,'cc',$6::uuid,'posted','cc_bill_payment',$7::uuid)`,
          [paymentId, w.companyId, billId, amount, amount / 100, w.ccLiabilityAccountId, w.userId]
        );
      }
    });

    await postSourceTransaction(
      { operating_company_id: w.companyId, source_transaction_type: "bill", source_transaction_id: billId },
      { userId: w.userId }
    );
    const outcome = await postBillPaymentGlIfEnabled(w.companyId, paymentId, { userId: w.userId });
    expect(outcome.posted).toBe(true);

    const rows = await scopedRead<{ account_id: string; debit_or_credit: string; amount_cents: string }>(
      w.client,
      w.companyId,
      `SELECT account_id::text, debit_or_credit, amount_cents::text
         FROM accounting.journal_entry_postings
        WHERE source_transaction_id=$1 AND source_transaction_type='bill_payment'
        ORDER BY line_sequence ASC`,
      [paymentId]
    );
    const debit = rows.find((r) => r.debit_or_credit === "debit");
    const credit = rows.find((r) => r.debit_or_credit === "credit");
    expect(debit?.account_id).toBe(w.apAccountId);
    expect(Number(debit?.amount_cents)).toBe(amount);
    if (w.kind === "cash") {
      expect(credit?.account_id).toBe(w.bankGlAccountId);
    } else {
      expect(credit?.account_id).toBe(w.ccLiabilityAccountId);
    }
    expect(Number(credit?.amount_cents)).toBe(amount);

    // Live role still points at THIS worker's AP — prove no cross-worker DO UPDATE landed here.
    const role = await scopedRead<{ account_id: string }>(
      w.client,
      w.companyId,
      `SELECT account_id::text AS account_id FROM accounting.chart_of_accounts_roles
        WHERE operating_company_id=$1::uuid AND role='ap_control' AND is_active=true`,
      [w.companyId]
    );
    expect(role).toHaveLength(1);
    expect(role[0]!.account_id).toBe(w.apAccountId);
  }

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    connectCs = cs;
  });

  afterAll(async () => {
    for (const w of workers) {
      try {
        await bypass(w.client, w.companyId, async () => {
          await w.client.query(
            `DELETE FROM accounting.transaction_source_links WHERE linked_object_id = ANY($1) AND linked_object_type IN ('bill','bill_payment')`,
            [[...w.billIds, ...w.paymentIds]]
          );
          await w.client.query(
            `DELETE FROM accounting.journal_entry_postings WHERE source_transaction_id = ANY($1) AND source_transaction_type IN ('bill','bill_payment')`,
            [[...w.billIds, ...w.paymentIds]]
          );
          await w.client.query(
            `DELETE FROM accounting.posting_batches WHERE source_transaction_id = ANY($1) AND source_transaction_type IN ('bill','bill_payment')`,
            [[...w.billIds, ...w.paymentIds]]
          );
          await w.client.query(`DELETE FROM accounting.bill_payments WHERE id = ANY($1::uuid[])`, [w.paymentIds]);
          await w.client.query(`DELETE FROM accounting.bill_lines WHERE bill_id = ANY($1::uuid[])`, [w.billIds]);
          await w.client.query(`DELETE FROM accounting.bills WHERE id = ANY($1::uuid[])`, [w.billIds]);
          await w.client.query(`DELETE FROM banking.bank_accounts WHERE id = $1::uuid`, [w.bankAccountId]);
          await w.client.query(`DELETE FROM accounting.expense_category_account_map WHERE operating_company_id=$1::uuid`, [w.companyId]);
          await w.client.query(`DELETE FROM lib.feature_flag_overrides WHERE operating_company_id=$1::uuid`, [w.companyId]);
          await w.client.query(`DELETE FROM accounting.chart_of_accounts_roles WHERE operating_company_id=$1::uuid`, [w.companyId]);
          await w.client.query(`DELETE FROM catalogs.accounts WHERE id = ANY($1::uuid[])`, [
            [w.fuelAccountId, w.apAccountId, w.bankGlAccountId, w.ccLiabilityAccountId],
          ]);
          await deactivateIsolatedOperatingCompany(w.client, w.isolated);
        });
      } catch {
        /* best-effort */
      } finally {
        await w.client.end().catch(() => {});
      }
    }
  });

  it(`runs ${ROUNDS} rounds × ${WORKERS_PER_ROUND} concurrent cash/CC workers with deterministic ap_control`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const roundWorkers: WorkerFixture[] = [];
      for (let slot = 0; slot < WORKERS_PER_ROUND; slot++) {
        const kind: WorkerKind = slot % 2 === 0 ? "cash" : "cc";
        const w = await provisionWorker(kind, round, slot);
        workers.push(w);
        roundWorkers.push(w);
      }
      // Concurrent conflicting cash/CC setups — each must keep its own ap_control debit account.
      await Promise.all(roundWorkers.map((w) => runWorkerOnce(w)));
    }
  }, 180_000);
});
