/**
 * FIN-18 — settlement + deduction GL posting (real Postgres). Proves the OWNER-LOCKED gates:
 *   (a) flag OFF  -> the poster is a NO-OP (zero journal entries / financial rows).
 *   (b) a deduction WITHOUT a signed authorization -> BLOCKED (CONSENT_MISSING), zero JEs.
 *   (c) a deduction breaching the 10% net-pay floor -> BLOCKED (NET_PAY_FLOOR_BREACH), zero JEs.
 *   (d) happy path -> one BALANCED JE (Dr gross = Cr deductions + Cr net clearing) + bucket decremented.
 * Runs only in CI (GITHUB_ACTIONS=true) where a migrated Postgres is available.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../../test-helpers/constants.js";
import { postSettlementToGl, type SettlementPostingResult } from "../settlement-posting.service.js";
import { SettlementPostingError } from "../settlement-posting.math.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("FIN-18 settlement GL posting (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  const suffix = randomUUID().slice(0, 8);
  const userId = TEST_OWNER_USER_ID;

  const acct = {
    driverPay: randomUUID(),
    netClearing: randomUUID(),
    damageRecovery: randomUUID(),
    reimb: randomUUID(),
  };
  const roleKeys = ["driver_pay_expense", "driver_payroll_clearing", "damage_recovery", "reimbursement_expense"];
  let templateId: string;
  const drivers: string[] = [];
  const settlementIds: string[] = [];

  async function bypass(fn: () => Promise<void>) {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    if (companyId) await db.query(`SET LOCAL app.operating_company_id = '${companyId}'`);
    try { await fn(); await db.query("COMMIT"); }
    catch (e) { await db.query("ROLLBACK").catch(() => {}); throw e; }
  }

  async function scopedRead<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query(`SET LOCAL app.operating_company_id = '${companyId}'`);
    try { const r = await db.query(sql, params); await db.query("COMMIT"); return r.rows as T[]; }
    catch (e) { await db.query("ROLLBACK").catch(() => {}); throw e; }
  }

  async function setFlag(enabled: boolean) {
    await bypass(async () => {
      await db.query(
        `DELETE FROM lib.feature_flag_overrides WHERE flag_key='SETTLEMENT_GL_POSTING_ENABLED' AND operating_company_id=$1::uuid AND user_uuid IS NULL`,
        [companyId]
      );
      await db.query(
        `INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid)
         VALUES ('SETTLEMENT_GL_POSTING_ENABLED', $1::uuid, NULL, $2, $3::uuid)`,
        [companyId, enabled, userId]
      );
    });
  }

  async function seedDriver(withConsent: boolean): Promise<string> {
    const id = randomUUID();
    await bypass(async () => {
      await db.query(
        `INSERT INTO mdata.drivers (id, operating_company_id, first_name, last_name, phone)
         VALUES ($1::uuid,$2::uuid,'FIN18','Drv',$3)`,
        [id, companyId, `+1003${randomUUID().slice(0, 7)}`]
      );
      if (withConsent) {
        await db.query(
          `INSERT INTO legal.contract_instances
             (operating_company_id, template_id, template_code, template_version, signer_type, signer_entity_id, signer_name, language, status)
           VALUES ($1::uuid,$2::uuid,'driver_deduction_auth',1,'driver',$3::uuid,'FIN18 Drv','en','signed_electronically')`,
          [companyId, templateId, id]
        );
      }
    });
    drivers.push(id);
    return id;
  }

  /** Seed a locked settlement (+ optional bucketed damage deduction). Dollars are numeric(14,2). */
  async function seedSettlement(opts: {
    driverId: string;
    grossCents: number;
    deductionCents: number;
    netCents: number;
  }): Promise<string> {
    const id = randomUUID();
    await bypass(async () => {
      await db.query(
        `INSERT INTO driver_finance.driver_settlements
           (id, operating_company_id, display_id, driver_id, period_start, period_end, status, locked_at,
            gross_pay, deductions_total, reimbursements_total, net_pay)
         VALUES ($1::uuid,$2::uuid,$3,$4::uuid,CURRENT_DATE - 7, CURRENT_DATE,'locked', now(),
            $5,$6,0,$7)`,
        [id, companyId, `S-${suffix}-${settlementIds.length}`, opts.driverId, opts.grossCents / 100, opts.deductionCents / 100, opts.netCents / 100]
      );
      if (opts.deductionCents > 0) {
        const bucket = await db.query<{ id: string }>(
          `INSERT INTO driver_finance.driver_deduction_buckets
             (operating_company_id, driver_id, bucket_type, is_recurring, charged_to_date_cents, remaining_balance_cents)
           VALUES ($1::uuid,$2::uuid,'damage',false,$3,$3) RETURNING id::text`,
          [companyId, opts.driverId, opts.deductionCents]
        );
        await db.query(
          `INSERT INTO driver_finance.driver_settlement_deductions
             (operating_company_id, driver_id, deduction_type, amount_cents, reason, status, remaining_balance_cents,
              bucket_id, applied_to_settlement_id, created_by_user_id)
           VALUES ($1::uuid,$2::uuid,'damage',$3,'damage chargeback','pending',$3,$4::uuid,$5::uuid,$6::uuid)`,
          [companyId, opts.driverId, opts.deductionCents, bucket.rows[0]!.id, id, userId]
        );
      }
    });
    settlementIds.push(id);
    return id;
  }

  async function jeLineCount(settlementId: string): Promise<number> {
    const r = await scopedRead<{ c: string }>(
      `SELECT count(*)::text AS c FROM accounting.journal_entry_postings
        WHERE source_transaction_id = $1 AND source_transaction_type = 'settlement'`,
      [settlementId]
    );
    return Number(r[0].c);
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
        [userId, `fin18-${suffix}@test.local`]
      );
      const mk = async (id: string, n: string, type: string) =>
        db.query(
          `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
           VALUES ($1::uuid,$2::uuid,$3,$4,$5,true)`,
          [id, companyId, `${n}${suffix}`, `FIN18 ${n}`, type]
        );
      await mk(acct.driverPay, "DPAY", "Expense");
      await mk(acct.netClearing, "NCLR", "Asset");
      await mk(acct.damageRecovery, "DMGR", "Expense");
      await mk(acct.reimb, "RMB", "Expense");
      const bind = async (roleKey: string, accountId: string) =>
        db.query(
          `INSERT INTO catalogs.account_role_bindings (role_key, account_id)
           VALUES ($1,$2::uuid)
           ON CONFLICT (role_key) DO UPDATE SET account_id = EXCLUDED.account_id, deactivated_at = NULL`,
          [roleKey, accountId]
        );
      await bind("driver_pay_expense", acct.driverPay);
      await bind("driver_payroll_clearing", acct.netClearing);
      await bind("damage_recovery", acct.damageRecovery);
      await bind("reimbursement_expense", acct.reimb);
      await db.query(
        `INSERT INTO accounting.settlement_posting_config (operating_company_id, net_pay_floor_pct)
         VALUES ($1::uuid, 0.1000) ON CONFLICT (operating_company_id) DO UPDATE SET net_pay_floor_pct = 0.1000`,
        [companyId]
      );
      const tpl = await db.query<{ id: string }>(
        `INSERT INTO legal.contract_templates
           (operating_company_id, template_code, version, display_name_en, display_name_es, category, content_html_en, content_html_es)
         VALUES ($1::uuid,'driver_deduction_auth',1,'Driver Deduction Auth','Autorizacion','hr','<p>en</p>','<p>es</p>')
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
        await db.query(`DELETE FROM accounting.transaction_source_links WHERE linked_object_id = ANY($1)`, [settlementIds]);
        await db.query(`DELETE FROM accounting.journal_entry_postings WHERE source_transaction_id = ANY($1) AND source_transaction_type='settlement'`, [settlementIds]);
        await db.query(`DELETE FROM driver_finance.driver_deduction_bucket_events WHERE settlement_id = ANY($1::uuid[])`, [settlementIds]);
        await db.query(`DELETE FROM driver_finance.driver_settlement_deductions WHERE applied_to_settlement_id = ANY($1::uuid[])`, [settlementIds]);
        await db.query(`DELETE FROM driver_finance.driver_deduction_bucket_events WHERE bucket_id IN (SELECT id FROM driver_finance.driver_deduction_buckets WHERE driver_id = ANY($1::uuid[]))`, [drivers]);
        await db.query(`DELETE FROM driver_finance.driver_deduction_buckets WHERE driver_id = ANY($1::uuid[])`, [drivers]);
        await db.query(`DELETE FROM driver_finance.driver_settlements WHERE id = ANY($1::uuid[])`, [settlementIds]);
        await db.query(`DELETE FROM legal.contract_instances WHERE signer_entity_id = ANY($1::uuid[])`, [drivers]);
        await db.query(`DELETE FROM legal.contract_templates WHERE id = $1::uuid`, [templateId]);
        await db.query(`DELETE FROM mdata.drivers WHERE id = ANY($1::uuid[])`, [drivers]);
        await db.query(`DELETE FROM catalogs.account_role_bindings WHERE role_key = ANY($1)`, [roleKeys]);
        await db.query(`DELETE FROM accounting.settlement_posting_config WHERE operating_company_id = $1::uuid`, [companyId]);
        await db.query(`DELETE FROM lib.feature_flag_overrides WHERE flag_key = 'SETTLEMENT_GL_POSTING_ENABLED' AND operating_company_id = $1::uuid`, [companyId]);
      });
    } catch { /* best-effort */ }
    await db.end();
  });

  it("(a) flag OFF -> no-op, zero journal entries", async () => {
    await setFlag(false);
    const driver = await seedDriver(true);
    const settlementId = await seedSettlement({ driverId: driver, grossCents: 900000, deductionCents: 50000, netCents: 850000 });
    const result = (await postSettlementToGl({ operatingCompanyId: companyId, settlementId }, { userId })) as SettlementPostingResult;
    expect(result.result).toBe("skipped_flag_off");
    expect(await jeLineCount(settlementId)).toBe(0);
  });

  it("(b) deduction WITHOUT signed authorization -> BLOCKED, zero journal entries", async () => {
    await setFlag(true);
    const driver = await seedDriver(false); // no consent
    const settlementId = await seedSettlement({ driverId: driver, grossCents: 900000, deductionCents: 50000, netCents: 850000 });
    let code: string | null = null;
    try {
      await postSettlementToGl({ operatingCompanyId: companyId, settlementId }, { userId });
    } catch (e) {
      code = e instanceof SettlementPostingError ? e.code : `other:${(e as Error).message}`;
    }
    expect(code).toBe("CONSENT_MISSING");
    expect(await jeLineCount(settlementId)).toBe(0);
  });

  it("(c) deduction breaching the 10% floor -> BLOCKED, zero journal entries", async () => {
    await setFlag(true);
    const driver = await seedDriver(true);
    // gross $1,000, deduction $950 -> net $50 < $100 floor
    const settlementId = await seedSettlement({ driverId: driver, grossCents: 100000, deductionCents: 95000, netCents: 5000 });
    let code: string | null = null;
    try {
      await postSettlementToGl({ operatingCompanyId: companyId, settlementId }, { userId });
    } catch (e) {
      code = e instanceof SettlementPostingError ? e.code : `other:${(e as Error).message}`;
    }
    expect(code).toBe("NET_PAY_FLOOR_BREACH");
    expect(await jeLineCount(settlementId)).toBe(0);
  });

  it("(d) happy path -> one BALANCED JE + bucket decremented", async () => {
    await setFlag(true);
    const driver = await seedDriver(true);
    const settlementId = await seedSettlement({ driverId: driver, grossCents: 900000, deductionCents: 50000, netCents: 850000 });
    const result = (await postSettlementToGl({ operatingCompanyId: companyId, settlementId }, { userId })) as Extract<SettlementPostingResult, { result: "posted" }>;
    expect(result.result).toBe("posted");
    expect(result.debit_total_cents).toBe(900000);
    expect(result.credit_total_cents).toBe(900000);

    const sums = await scopedRead<{ dr: string; cr: string }>(
      `SELECT COALESCE(SUM(amount_cents) FILTER (WHERE debit_or_credit='debit'),0)::text AS dr,
              COALESCE(SUM(amount_cents) FILTER (WHERE debit_or_credit='credit'),0)::text AS cr
         FROM accounting.journal_entry_postings WHERE journal_entry_uuid = $1::uuid`,
      [result.journal_entry_id]
    );
    expect(Number(sums[0].dr)).toBe(900000);
    expect(Number(sums[0].cr)).toBe(900000);

    // net-pay clearing credit lands on the clearing account
    const clearing = await scopedRead<{ c: string }>(
      `SELECT count(*)::text AS c FROM accounting.journal_entry_postings
        WHERE journal_entry_uuid=$1::uuid AND debit_or_credit='credit' AND account_id=$2::uuid AND amount_cents=850000`,
      [result.journal_entry_id, acct.netClearing]
    );
    expect(Number(clearing[0].c)).toBe(1);

    // the bucket was applied (remaining 50000 -> 0) with an application event
    const bucket = await scopedRead<{ remaining: string }>(
      `SELECT remaining_balance_cents::text AS remaining FROM driver_finance.driver_deduction_buckets
        WHERE driver_id=$1::uuid AND bucket_type='damage'`,
      [driver]
    );
    expect(Number(bucket[0].remaining)).toBe(0);
    const appliedEvt = await scopedRead<{ c: string }>(
      `SELECT count(*)::text AS c FROM driver_finance.driver_deduction_bucket_events
        WHERE settlement_id=$1::uuid AND event_type='application'`,
      [settlementId]
    );
    expect(Number(appliedEvt[0].c)).toBe(1);
  });
});
