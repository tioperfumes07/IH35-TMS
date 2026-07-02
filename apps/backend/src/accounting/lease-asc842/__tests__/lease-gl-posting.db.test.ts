/**
 * FIN-22 — lease ASC 842 LESSOR GL posting (real Postgres). Proves the owner-locked gates:
 *   (a) flag OFF  -> every poster is a NO-OP (zero journal entries).
 *   (b) OPERATING -> periodic rental income is a balanced JE (Dr cash / Cr rental_income); the END-OF-TERM
 *       SALE is a balanced disposal JE (Dr accum + Dr cash / Cr asset cost + Cr/Dr gain-loss); idempotent.
 *   (c) OPERATING does NOT derecognize the asset at COMMENCEMENT (asset stays 'active', zero JEs until a
 *       period is posted).
 *   (d) SALES-TYPE -> commencement is a balanced derecognition + lease receivable + selling-profit JE; the
 *       per-period JE is balanced (Dr cash / Cr receivable / Cr interest income); idempotent.
 *   (e) the re-title guard BLOCKS (RETITLE_REQUIRED) when the leased unit is not titled to TRK; zero JEs.
 * Runs only in CI (GITHUB_ACTIONS=true) where a migrated Postgres is available.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../../test-helpers/constants.js";
import { generateSchedule, type LeaseElection } from "../lease.math.js";
import { LeasePostingError } from "../lease.math.js";
import {
  postOperatingRentalPeriod,
  postOperatingEndOfTermSale,
  postSalesTypeCommencement,
  postSalesTypeInterestPeriod,
  type LeasePostResult,
} from "../lease-posting.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("FIN-22 lease ASC 842 GL posting (real Postgres)", () => {
  let db: pg.Client;
  let trkId: string; // the lessor entity (Trucking) — TRK books the lease
  let transpId: string; // a non-TRK entity, to prove the re-title guard
  const suffix = randomUUID().slice(0, 8);
  const userId = TEST_OWNER_USER_ID;

  const acct: Record<string, string> = {};
  const roleKeys = ["rental_income", "lease_receivable", "interest_income", "gain_loss_on_disposal", "undeposited_funds"] as const;
  let classId: string;
  const leaseIds: string[] = [];
  const assetIds: string[] = [];
  const unitIds: string[] = [];

  async function bypass(fn: () => Promise<void>) {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1, true)", [trkId]);
    try { await fn(); await db.query("COMMIT"); }
    catch (e) { await db.query("ROLLBACK").catch(() => {}); throw e; }
  }

  async function scopedRead<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1, true)", [trkId]);
    try { const r = await db.query(sql, params); await db.query("COMMIT"); return r.rows as T[]; }
    catch (e) { await db.query("ROLLBACK").catch(() => {}); throw e; }
  }

  async function setFlag(enabled: boolean) {
    await bypass(async () => {
      await db.query(`DELETE FROM lib.feature_flag_overrides WHERE flag_key='LEASE_GL_POSTING_ENABLED' AND operating_company_id=$1::uuid AND user_uuid IS NULL`, [trkId]);
      await db.query(
        `INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid)
         VALUES ('LEASE_GL_POSTING_ENABLED', $1::uuid, NULL, $2, $3::uuid)`,
        [trkId, enabled, userId]
      );
    });
  }

  async function mkAccount(key: string, type: string): Promise<string> {
    const id = randomUUID();
    await db.query(
      `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
       VALUES ($1::uuid,$2::uuid,$3,$4,$5,true)`,
      [id, trkId, `F22-${key}-${suffix}`, `FIN22 ${key}`, type]
    );
    acct[key] = id;
    return id;
  }

  async function bindRole(role: string, accountId: string) {
    await db.query(
      `INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
       VALUES ($1::uuid,$2,$3::uuid,true)
       ON CONFLICT (operating_company_id, role) WHERE is_active = true
       DO UPDATE SET account_id = EXCLUDED.account_id`,
      [trkId, role, accountId]
    );
  }

  /** Seed a unit (owned by `ownerId`) + an active fixed asset; returns ids. */
  async function seedAsset(opts: { costCents: number; accumCents: number; ownerId: string }): Promise<{ assetId: string; unitId: string }> {
    const unitId = randomUUID();
    const assetId = randomUUID();
    const vin = (`F22${randomUUID().replace(/-/g, "")}`).slice(0, 17);
    await bypass(async () => {
      await db.query(
        `INSERT INTO mdata.units (id, unit_number, vin, owner_company_id, currently_leased_to_company_id)
         VALUES ($1::uuid,$2,$3,$4::uuid,$4::uuid)`,
        [unitId, `F22-${randomUUID().slice(0, 6)}`, vin, opts.ownerId]
      );
      await db.query(
        `INSERT INTO accounting.fixed_assets
           (id, operating_company_id, owner_operating_company_id, name, class_id, unit_uuid, purchase_price_cents,
            salvage_value_cents, purchase_date, in_service_date, prior_accumulated_depr_cents,
            asset_account_id, accum_depr_account_id, depr_expense_account_id, status)
         VALUES ($1::uuid,$2::uuid,$2::uuid,$3,$4::uuid,$5::uuid,$6,0,CURRENT_DATE - 365, CURRENT_DATE - 365, $7,
                 $8::uuid,$9::uuid,$10::uuid,'active')`,
        [assetId, trkId, `FIN22 asset ${suffix}`, classId, unitId, opts.costCents, opts.accumCents, acct.asset_cost, acct.accum_depr, acct.depr_expense]
      );
    });
    assetIds.push(assetId);
    unitIds.push(unitId);
    return { assetId, unitId };
  }

  /** Seed a draft/active lease + asset line + classification + generated schedule (all via bypass). */
  async function seedLease(opts: {
    election: LeaseElection;
    paymentCents: number;
    periods: number;
    discountBps: number | null;
    status?: string;
    asset: { assetId: string; unitId: string };
  }): Promise<string> {
    const leaseId = randomUUID();
    const total = opts.paymentCents * opts.periods;
    const commenceIso = new Date().toISOString().slice(0, 10);
    const endDate = new Date();
    endDate.setUTCMonth(endDate.getUTCMonth() + opts.periods);
    const endIso = endDate.toISOString().slice(0, 10);
    await bypass(async () => {
      await db.query(
        `INSERT INTO accounting.lease_contract
           (id, operating_company_id, lessor_operating_company_id, lessee_name, election, commencement_date,
            end_date, payment_amount_cents, payment_frequency, number_of_periods, total_lease_payments_cents,
            discount_rate_bps, status, created_by_user_id)
         VALUES ($1::uuid,$2::uuid,$2::uuid,$3,$4,$5::date,$6::date,
                 $7,'monthly',$8,$9,$10,$11,$12::uuid)`,
        [leaseId, trkId, `Lessee ${suffix}`, opts.election, commenceIso, endIso, opts.paymentCents, opts.periods, total, opts.discountBps, opts.status ?? "active", userId]
      );
      await db.query(
        `INSERT INTO accounting.lease_classification (operating_company_id, lease_contract_id, election, created_by_user_id)
         VALUES ($1::uuid,$2::uuid,$3,$4::uuid)`,
        [trkId, leaseId, opts.election, userId]
      );
      await db.query(
        `INSERT INTO accounting.lease_asset_line (operating_company_id, lease_contract_id, fixed_asset_id, unit_uuid, created_by_user_id)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid)`,
        [trkId, leaseId, opts.asset.assetId, opts.asset.unitId, userId]
      );
      const schedule = generateSchedule({
        election: opts.election,
        commencement_date: new Date().toISOString().slice(0, 10),
        payment_amount_cents: opts.paymentCents,
        payment_frequency: "monthly",
        number_of_periods: opts.periods,
        discount_rate_bps: opts.discountBps,
      });
      for (const p of schedule) {
        await db.query(
          `INSERT INTO accounting.lease_schedule_period
             (operating_company_id, lease_contract_id, period_number, period_date, payment_cents,
              rental_income_cents, interest_cents, principal_cents, receivable_balance_cents, created_by_user_id)
           VALUES ($1::uuid,$2::uuid,$3,$4::date,$5,$6,$7,$8,$9,$10::uuid)`,
          [trkId, leaseId, p.period_number, p.period_date, p.payment_cents, p.rental_income_cents, p.interest_cents, p.principal_cents, p.receivable_balance_cents, userId]
        );
      }
    });
    leaseIds.push(leaseId);
    return leaseId;
  }

  async function jeLineCount(leaseId: string): Promise<number> {
    const r = await scopedRead<{ c: string }>(
      `SELECT count(*)::text AS c FROM accounting.journal_entry_postings
        WHERE source_transaction_id = $1 AND source_transaction_type IN ('lease_rental','lease_disposal')`,
      [leaseId]
    );
    return Number(r[0].c);
  }

  async function jeBalanced(jeId: string): Promise<{ dr: number; cr: number }> {
    const s = await scopedRead<{ dr: string; cr: string }>(
      `SELECT COALESCE(SUM(amount_cents) FILTER (WHERE debit_or_credit='debit'),0)::text AS dr,
              COALESCE(SUM(amount_cents) FILTER (WHERE debit_or_credit='credit'),0)::text AS cr
         FROM accounting.journal_entry_postings WHERE journal_entry_uuid = $1::uuid`,
      [jeId]
    );
    return { dr: Number(s[0].dr), cr: Number(s[0].cr) };
  }

  beforeAll(async () => {
    transpId = await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
    // Resolve TRK (lessor) by code — never hardcode.
    {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      const r = await db.query<{ id: string }>(`SELECT id FROM org.companies WHERE code = 'TRK' LIMIT 1`);
      await db.query("COMMIT");
      trkId = r.rows[0]!.id;
    }
    await bypass(async () => {
      await db.query(
        `INSERT INTO identity.users (id, email, role, preferred_language) VALUES ($1::uuid,$2,'Owner','en') ON CONFLICT (id) DO NOTHING`,
        [userId, `fin22-${suffix}@test.local`]
      );
      // GL accounts (TRK-scoped) + role bindings.
      await mkAccount("rental_income", "Income");
      await mkAccount("lease_receivable", "Asset");
      await mkAccount("interest_income", "OtherIncome");
      await mkAccount("gain_loss_on_disposal", "OtherIncome");
      await mkAccount("undeposited_funds", "Asset");
      await mkAccount("asset_cost", "Asset");
      await mkAccount("accum_depr", "Asset");
      await mkAccount("depr_expense", "Expense");
      await bindRole("rental_income", acct.rental_income);
      await bindRole("lease_receivable", acct.lease_receivable);
      await bindRole("interest_income", acct.interest_income);
      await bindRole("gain_loss_on_disposal", acct.gain_loss_on_disposal);
      await bindRole("undeposited_funds", acct.undeposited_funds);
      // A fixed-asset class for TRK.
      const cls = await db.query<{ id: string }>(
        `INSERT INTO accounting.fixed_asset_classes (operating_company_id, class_code, class_name)
         VALUES ($1::uuid,$2,'FIN22 Tractors') RETURNING id::text`,
        [trkId, `F22-${suffix}`]
      );
      classId = cls.rows[0]!.id;
    });
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await bypass(async () => {
        await db.query(`DELETE FROM accounting.transaction_source_links WHERE linked_object_id = ANY($1)`, [leaseIds]);
        await db.query(`DELETE FROM accounting.journal_entry_postings WHERE source_transaction_id = ANY($1) AND source_transaction_type IN ('lease_rental','lease_disposal')`, [leaseIds]);
        await db.query(`DELETE FROM accounting.fixed_asset_disposals WHERE lease_contract_id = ANY($1::uuid[])`, [leaseIds]);
        await db.query(`DELETE FROM accounting.lease_schedule_period WHERE lease_contract_id = ANY($1::uuid[])`, [leaseIds]);
        await db.query(`DELETE FROM accounting.lease_asset_line WHERE lease_contract_id = ANY($1::uuid[])`, [leaseIds]);
        await db.query(`DELETE FROM accounting.lease_classification WHERE lease_contract_id = ANY($1::uuid[])`, [leaseIds]);
        await db.query(`DELETE FROM accounting.lease_contract WHERE id = ANY($1::uuid[])`, [leaseIds]);
        await db.query(`DELETE FROM accounting.fixed_assets WHERE id = ANY($1::uuid[])`, [assetIds]);
        await db.query(`DELETE FROM mdata.units WHERE id = ANY($1::uuid[])`, [unitIds]);
        await db.query(`DELETE FROM accounting.fixed_asset_classes WHERE id = $1::uuid`, [classId]);
        await db.query(`DELETE FROM accounting.chart_of_accounts_roles WHERE operating_company_id=$1::uuid AND role = ANY($2)`, [trkId, roleKeys as unknown as string[]]);
        await db.query(`DELETE FROM catalogs.accounts WHERE operating_company_id=$1::uuid AND account_number LIKE $2`, [trkId, `F22-%-${suffix}`]);
        await db.query(`DELETE FROM lib.feature_flag_overrides WHERE flag_key='LEASE_GL_POSTING_ENABLED' AND operating_company_id=$1::uuid`, [trkId]);
      });
    } catch { /* best-effort */ }
    await db.end();
  });

  it("(a) flag OFF -> operating rental is a no-op, zero journal entries", async () => {
    await setFlag(false);
    const asset = await seedAsset({ costCents: 1000000, accumCents: 600000, ownerId: trkId });
    const leaseId = await seedLease({ election: "operating", paymentCents: 250000, periods: 12, discountBps: null, asset });
    const r = (await postOperatingRentalPeriod({ operatingCompanyId: trkId, leaseContractId: leaseId, periodNumber: 1 }, { userId })) as LeasePostResult;
    expect(r.result).toBe("skipped_flag_off");
    expect(await jeLineCount(leaseId)).toBe(0);
  });

  it("(b) operating rental period -> balanced JE (Dr cash / Cr rental_income), idempotent", async () => {
    await setFlag(true);
    const asset = await seedAsset({ costCents: 1000000, accumCents: 600000, ownerId: trkId });
    const leaseId = await seedLease({ election: "operating", paymentCents: 250000, periods: 12, discountBps: null, asset });
    const r = (await postOperatingRentalPeriod({ operatingCompanyId: trkId, leaseContractId: leaseId, periodNumber: 1 }, { userId })) as Extract<LeasePostResult, { result: "posted" }>;
    expect(r.result).toBe("posted");
    expect(r.debit_total_cents).toBe(250000);
    expect(r.credit_total_cents).toBe(250000);
    const { dr, cr } = await jeBalanced(r.journal_entry_id);
    expect(dr).toBe(250000);
    expect(cr).toBe(250000);
    // rental income credit lands on the rental_income account
    const inc = await scopedRead<{ c: string }>(
      `SELECT count(*)::text AS c FROM accounting.journal_entry_postings WHERE journal_entry_uuid=$1::uuid AND debit_or_credit='credit' AND account_id=$2::uuid AND amount_cents=250000`,
      [r.journal_entry_id, acct.rental_income]
    );
    expect(Number(inc[0].c)).toBe(1);
    // idempotent
    const again = (await postOperatingRentalPeriod({ operatingCompanyId: trkId, leaseContractId: leaseId, periodNumber: 1 }, { userId })) as LeasePostResult;
    expect(again.result).toBe("already_posted");
    expect(await jeLineCount(leaseId)).toBe(2);
  });

  it("(c) operating does NOT derecognize the asset at commencement (asset active, zero JEs until posted)", async () => {
    await setFlag(true);
    const asset = await seedAsset({ costCents: 1000000, accumCents: 600000, ownerId: trkId });
    const leaseId = await seedLease({ election: "operating", paymentCents: 250000, periods: 12, discountBps: null, asset });
    // No commencement posting exists for operating — nothing posted yet.
    expect(await jeLineCount(leaseId)).toBe(0);
    const st = await scopedRead<{ status: string }>(`SELECT status FROM accounting.fixed_assets WHERE id=$1::uuid`, [asset.assetId]);
    expect(st[0].status).toBe("active");
  });

  it("(b2) operating end-of-term SALE -> balanced disposal JE with gain, records disposal, idempotent", async () => {
    await setFlag(true);
    const asset = await seedAsset({ costCents: 1000000, accumCents: 600000, ownerId: trkId }); // book value 400000
    const leaseId = await seedLease({ election: "operating", paymentCents: 250000, periods: 12, discountBps: null, asset });
    const r = (await postOperatingEndOfTermSale({ operatingCompanyId: trkId, leaseContractId: leaseId, disposalDate: new Date().toISOString().slice(0, 10), proceedsCents: 500000 }, { userId })) as Extract<LeasePostResult, { result: "posted" }>;
    expect(r.result).toBe("posted");
    expect(r.debit_total_cents).toBe(1100000); // accum 600000 + proceeds 500000
    expect(r.credit_total_cents).toBe(1100000); // asset 1000000 + gain 100000
    // disposal row recorded with gain 100000
    const disp = await scopedRead<{ gl: string; bv: string; ps: string }>(
      `SELECT gain_loss_cents::text AS gl, book_value_at_disposal_cents::text AS bv, posting_status AS ps
         FROM accounting.fixed_asset_disposals WHERE lease_contract_id=$1::uuid AND asset_id=$2::uuid`,
      [leaseId, asset.assetId]
    );
    expect(Number(disp[0].gl)).toBe(100000);
    expect(Number(disp[0].bv)).toBe(400000);
    expect(disp[0].ps).toBe("posted");
    const st = await scopedRead<{ status: string }>(`SELECT status FROM accounting.fixed_assets WHERE id=$1::uuid`, [asset.assetId]);
    expect(st[0].status).toBe("disposed");
    // idempotent
    const again = (await postOperatingEndOfTermSale({ operatingCompanyId: trkId, leaseContractId: leaseId, disposalDate: new Date().toISOString().slice(0, 10), proceedsCents: 500000 }, { userId })) as LeasePostResult;
    expect(again.result).toBe("already_posted");
  });

  it("(d) sales-type commencement + interest period -> balanced JEs, idempotent", async () => {
    await setFlag(true);
    const asset = await seedAsset({ costCents: 800000, accumCents: 200000, ownerId: trkId }); // book value 600000
    const leaseId = await seedLease({ election: "sales_type", paymentCents: 100000, periods: 10, discountBps: 0, asset, status: "active" });
    const commence = (await postSalesTypeCommencement({ operatingCompanyId: trkId, leaseContractId: leaseId }, { userId })) as Extract<LeasePostResult, { result: "posted" }>;
    expect(commence.result).toBe("posted");
    // receivable 1,000,000 + accum 200,000 = 1,200,000 ; asset 800,000 + selling profit 400,000 = 1,200,000
    expect(commence.debit_total_cents).toBe(1200000);
    expect(commence.credit_total_cents).toBe(1200000);
    // lease receivable debited for 1,000,000
    const rec = await scopedRead<{ c: string }>(
      `SELECT count(*)::text AS c FROM accounting.journal_entry_postings WHERE journal_entry_uuid=$1::uuid AND debit_or_credit='debit' AND account_id=$2::uuid AND amount_cents=1000000`,
      [commence.journal_entry_id, acct.lease_receivable]
    );
    expect(Number(rec[0].c)).toBe(1);
    // asset derecognized
    const st = await scopedRead<{ status: string }>(`SELECT status FROM accounting.fixed_assets WHERE id=$1::uuid`, [asset.assetId]);
    expect(st[0].status).toBe("disposed");

    // per-period payment: Dr cash / Cr lease receivable (zero interest at rate 0)
    const per = (await postSalesTypeInterestPeriod({ operatingCompanyId: trkId, leaseContractId: leaseId, periodNumber: 1 }, { userId })) as Extract<LeasePostResult, { result: "posted" }>;
    expect(per.result).toBe("posted");
    expect(per.debit_total_cents).toBe(100000);
    expect(per.credit_total_cents).toBe(100000);

    // idempotent commencement
    const againC = (await postSalesTypeCommencement({ operatingCompanyId: trkId, leaseContractId: leaseId }, { userId })) as LeasePostResult;
    expect(againC.result).toBe("already_posted");
  });

  it("(e) re-title guard fires when the leased unit is not titled to TRK; zero JEs", async () => {
    await setFlag(true);
    const asset = await seedAsset({ costCents: 1000000, accumCents: 100000, ownerId: transpId }); // owned by TRANSP, NOT TRK
    const leaseId = await seedLease({ election: "operating", paymentCents: 250000, periods: 12, discountBps: null, asset });
    let code: string | null = null;
    try {
      await postOperatingRentalPeriod({ operatingCompanyId: trkId, leaseContractId: leaseId, periodNumber: 1 }, { userId });
    } catch (e) {
      code = e instanceof LeasePostingError ? e.code : `other:${(e as Error).message}`;
    }
    expect(code).toBe("RETITLE_REQUIRED");
    expect(await jeLineCount(leaseId)).toBe(0);
  });
});
