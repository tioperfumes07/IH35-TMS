/**
 * FIN-21 — prepaid amortization + fixed-asset depreciation GL posting (real Postgres). Proves:
 *   (a) flag OFF -> the poster is a NO-OP (zero journal entries / financial rows), prepaid + depreciation.
 *   (b) prepaid happy path -> amortizes to EXACTLY the total (last period clears the remainder); the JE
 *       per period is balanced (Dr expense / Cr prepaid asset); idempotent on re-run; source links present.
 *   (c) depreciation happy path -> matches method/convention (straight-line full-month), accumulated rolls
 *       forward correctly; idempotent on re-run; unit-linked spine event present.
 *   (d) prior_accumulated_depr_cents > 0 -> REFUSED (PRIOR_ACCUM_UNSUPPORTED), zero JEs.
 *   (e) reversal -> reversing JE posted + schedule row un-posted; re-run reverses nothing.
 * Runs only in CI (GITHUB_ACTIONS=true) where a migrated Postgres is available.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites, getIntegrationWorkOrderSeedIds } from "../../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../../test-helpers/constants.js";
import {
  postPrepaidAmortization,
  postDepreciation,
  reverseDepreciation,
  type AmortizationPostingResult,
} from "../amortization-posting.service.js";
import { AmortizationPostingError } from "../amortization-posting.math.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("FIN-21 amortization + depreciation GL posting (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  let unitId: string;
  const suffix = randomUUID().slice(0, 8);
  const userId = TEST_OWNER_USER_ID;

  const acct = {
    prepaidAsset: randomUUID(),
    prepaidExpense: randomUUID(),
    deprExpense: randomUUID(),
    accumDepr: randomUUID(),
  };
  let classId: string;
  const prepaidAssetIds: string[] = [];
  const fixedAssetIds: string[] = [];

  async function bypass(fn: () => Promise<void>) {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    if (companyId) {
      await db.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
      await db.query("SELECT set_config('app.current_operating_company_id', $1, true)", [companyId]);
    }
    try { await fn(); await db.query("COMMIT"); }
    catch (e) { await db.query("ROLLBACK").catch(() => {}); throw e; }
  }

  async function scopedRead<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    await db.query("SELECT set_config('app.current_operating_company_id', $1, true)", [companyId]); // events.event_log RLS GUC
    try { const r = await db.query(sql, params); await db.query("COMMIT"); return r.rows as T[]; }
    catch (e) { await db.query("ROLLBACK").catch(() => {}); throw e; }
  }

  async function setFlag(enabled: boolean) {
    await bypass(async () => {
      await db.query(
        `DELETE FROM lib.feature_flag_overrides WHERE flag_key='AMORTIZATION_GL_POSTING_ENABLED' AND operating_company_id=$1::uuid AND user_uuid IS NULL`,
        [companyId]
      );
      await db.query(
        `INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid)
         VALUES ('AMORTIZATION_GL_POSTING_ENABLED', $1::uuid, NULL, $2, $3::uuid)`,
        [companyId, enabled, userId]
      );
    });
  }

  /** Seed a prepaid asset + its persisted amortization rows (floor split + remainder in the LAST period). */
  async function seedPrepaid(totalCents: number, periods: number): Promise<string> {
    const id = randomUUID();
    const periodCents = Math.floor(totalCents / periods);
    const remainder = totalCents - periodCents * periods;
    await bypass(async () => {
      await db.query(
        `INSERT INTO accounting.prepaid_assets
           (id, operating_company_id, description, purchase_date, start_date, end_date,
            total_amount_cents, periods, period_amount_cents, remainder_cents,
            asset_account_id, expense_account_id, created_by_user_id, updated_by_user_id)
         VALUES ($1::uuid,$2::uuid,$3,'2026-01-01','2026-01-01','2026-12-31',
            $4,$5,$6,$7,$8::uuid,$9::uuid,$10::uuid,$10::uuid)`,
        [id, companyId, `FIN21 prepaid ${suffix}`, totalCents, periods, periodCents, remainder,
         acct.prepaidAsset, acct.prepaidExpense, userId]
      );
      for (let i = 0; i < periods; i++) {
        const amount = i === periods - 1 ? periodCents + remainder : periodCents;
        // period_dates in the past so they are all due relative to the run date.
        const periodDate = `2026-0${i + 1}-01`;
        await db.query(
          `INSERT INTO accounting.prepaid_amortization_rows
             (operating_company_id, asset_id, period_number, period_date, amount_cents, remaining_balance_cents,
              created_by_user_id, updated_by_user_id)
           VALUES ($1::uuid,$2::uuid,$3,$4::date,$5,0,$6::uuid,$6::uuid)`,
          [companyId, id, i + 1, periodDate, amount, userId]
        );
      }
    });
    prepaidAssetIds.push(id);
    return id;
  }

  /** Seed a fixed asset (straight-line, full-month). priorAccum drives the mid-life-takeover refusal test. */
  async function seedFixedAsset(opts: { priceCents: number; salvageCents: number; lifeMonths: number; priorAccumCents: number }): Promise<string> {
    const id = randomUUID();
    await bypass(async () => {
      await db.query(
        `INSERT INTO accounting.fixed_assets
           (id, operating_company_id, owner_operating_company_id, name, class_id, unit_uuid,
            purchase_price_cents, salvage_value_cents, purchase_date, in_service_date,
            method, useful_life_months, convention, prior_accumulated_depr_cents,
            depr_expense_account_id, accum_depr_account_id, created_by_user_id, updated_by_user_id)
         VALUES ($1::uuid,$2::uuid,$2::uuid,$3,$4::uuid,$5::uuid,
            $6,$7,'2026-01-01','2026-01-01',
            'straight_line',$8,'full_month',$9,
            $10::uuid,$11::uuid,$12::uuid,$12::uuid)`,
        [id, companyId, `FIN21 unit asset ${suffix}-${fixedAssetIds.length}`, classId, unitId,
         opts.priceCents, opts.salvageCents, opts.lifeMonths, opts.priorAccumCents,
         acct.deprExpense, acct.accumDepr, userId]
      );
    });
    fixedAssetIds.push(id);
    return id;
  }

  async function jeLineCount(sourceType: string, sourceId: string): Promise<number> {
    const r = await scopedRead<{ c: string }>(
      `SELECT count(*)::text AS c FROM accounting.journal_entry_postings
        WHERE source_transaction_id = $1 AND source_transaction_type = $2`,
      [sourceId, sourceType]
    );
    return Number(r[0].c);
  }

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    ({ unitId } = await getIntegrationWorkOrderSeedIds());
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
    await bypass(async () => {
      await db.query(
        `INSERT INTO identity.users (id, email, role, preferred_language) VALUES ($1::uuid,$2,'Owner','en') ON CONFLICT (id) DO NOTHING`,
        [userId, `fin21-${suffix}@test.local`]
      );
      const mk = async (id: string, n: string, type: string) =>
        db.query(
          `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
           VALUES ($1::uuid,$2::uuid,$3,$4,$5,true)`,
          [id, companyId, `${n}${suffix}`, `FIN21 ${n}`, type]
        );
      await mk(acct.prepaidAsset, "PPA", "Asset");
      await mk(acct.prepaidExpense, "PPEXP", "Expense");
      await mk(acct.deprExpense, "DEPEXP", "Expense");
      await mk(acct.accumDepr, "ACCUM", "Asset");
      const cls = await db.query<{ id: string }>(
        `INSERT INTO accounting.fixed_asset_classes (operating_company_id, class_code, class_name)
         VALUES ($1::uuid,$2,'FIN21 Tractors') RETURNING id::text`,
        [companyId, `FIN21CLS${suffix}`]
      );
      classId = cls.rows[0]!.id;
    });
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await bypass(async () => {
        const allAssetIds = [...prepaidAssetIds, ...fixedAssetIds];
        await db.query(`DELETE FROM accounting.transaction_source_links WHERE linked_object_id = ANY($1)`, [allAssetIds]);
        await db.query(`DELETE FROM accounting.journal_entry_postings WHERE source_transaction_id = ANY($1) AND source_transaction_type IN ('prepaid_amortization','fixed_asset_depreciation')`, [allAssetIds]);
        await db.query(`DELETE FROM accounting.journal_entries WHERE operating_company_id=$1::uuid AND memo LIKE $2`, [companyId, `%${suffix}%`]);
        await db.query(`DELETE FROM accounting.depreciation_schedule_rows WHERE asset_id = ANY($1::uuid[])`, [fixedAssetIds]);
        await db.query(`DELETE FROM accounting.prepaid_amortization_rows WHERE asset_id = ANY($1::uuid[])`, [prepaidAssetIds]);
        await db.query(`DELETE FROM accounting.fixed_assets WHERE id = ANY($1::uuid[])`, [fixedAssetIds]);
        await db.query(`DELETE FROM accounting.prepaid_assets WHERE id = ANY($1::uuid[])`, [prepaidAssetIds]);
        await db.query(`DELETE FROM accounting.fixed_asset_classes WHERE id = $1::uuid`, [classId]);
        await db.query(`DELETE FROM catalogs.accounts WHERE id = ANY($1::uuid[])`, [Object.values(acct)]);
        await db.query(`DELETE FROM lib.feature_flag_overrides WHERE flag_key='AMORTIZATION_GL_POSTING_ENABLED' AND operating_company_id=$1::uuid`, [companyId]);
      });
    } catch { /* best-effort */ }
    await db.end();
  });

  it("(a) flag OFF -> no-op, zero journal entries (prepaid + depreciation)", async () => {
    await setFlag(false);
    const prepaidId = await seedPrepaid(100000, 3);
    const assetId = await seedFixedAsset({ priceCents: 120000, salvageCents: 0, lifeMonths: 12, priorAccumCents: 0 });
    const pr = (await postPrepaidAmortization({ operatingCompanyId: companyId, assetId: prepaidId }, { userId })) as AmortizationPostingResult;
    const dr = (await postDepreciation({ operatingCompanyId: companyId, assetId, runDate: "2030-01-01" }, { userId })) as AmortizationPostingResult;
    expect(pr.result).toBe("skipped_flag_off");
    expect(dr.result).toBe("skipped_flag_off");
    expect(await jeLineCount("prepaid_amortization", prepaidId)).toBe(0);
    expect(await jeLineCount("fixed_asset_depreciation", assetId)).toBe(0);
  });

  it("(b) prepaid amortizes to EXACTLY the total, last period clears the remainder, idempotent", async () => {
    await setFlag(true);
    // 100000c over 3 periods -> 33333, 33333, 33334 (remainder 1 in the last period).
    const prepaidId = await seedPrepaid(100000, 3);
    const result = (await postPrepaidAmortization({ operatingCompanyId: companyId, assetId: prepaidId }, { userId })) as Extract<AmortizationPostingResult, { result: "posted" }>;
    expect(result.result).toBe("posted");
    expect(result.period_count).toBe(3);
    expect(result.total_posted_cents).toBe(100000);

    // Total expense debits across the three balanced JEs == the full prepaid total.
    const sums = await scopedRead<{ dr: string; cr: string }>(
      `SELECT COALESCE(SUM(amount_cents) FILTER (WHERE debit_or_credit='debit'),0)::text AS dr,
              COALESCE(SUM(amount_cents) FILTER (WHERE debit_or_credit='credit'),0)::text AS cr
         FROM accounting.journal_entry_postings
        WHERE source_transaction_id=$1 AND source_transaction_type='prepaid_amortization'`,
      [prepaidId]
    );
    expect(Number(sums[0].dr)).toBe(100000);
    expect(Number(sums[0].cr)).toBe(100000);

    // Last period carries the remainder (33334) on the expense account.
    const last = await scopedRead<{ c: string }>(
      `SELECT count(*)::text AS c FROM accounting.journal_entry_postings
        WHERE source_transaction_id=$1 AND source_transaction_type='prepaid_amortization'
          AND debit_or_credit='debit' AND account_id=$2::uuid AND amount_cents=33334`,
      [prepaidId, acct.prepaidExpense]
    );
    expect(Number(last[0].c)).toBe(1);

    // Source links present (asset + period grain).
    const links = await scopedRead<{ c: string }>(
      `SELECT count(*)::text AS c FROM accounting.transaction_source_links WHERE linked_object_id=$1`,
      [prepaidId]
    );
    expect(Number(links[0].c)).toBeGreaterThanOrEqual(3);

    // All rows marked posted.
    const pending = await scopedRead<{ c: string }>(
      `SELECT count(*)::text AS c FROM accounting.prepaid_amortization_rows WHERE asset_id=$1::uuid AND posted=false`,
      [prepaidId]
    );
    expect(Number(pending[0].c)).toBe(0);

    // Idempotent: a second run posts nothing and does NOT double the ledger.
    const rerun = (await postPrepaidAmortization({ operatingCompanyId: companyId, assetId: prepaidId }, { userId })) as AmortizationPostingResult;
    expect(rerun.result).toBe("nothing_to_post");
    expect(await jeLineCount("prepaid_amortization", prepaidId)).toBe(6); // 3 periods x 2 lines
  });

  it("(c) depreciation matches method/convention, accumulated rolls forward, idempotent + spine event", async () => {
    await setFlag(true);
    // 120000 / 12mo straight-line full-month -> 10000/period.
    const assetId = await seedFixedAsset({ priceCents: 120000, salvageCents: 0, lifeMonths: 12, priorAccumCents: 0 });
    const result = (await postDepreciation({ operatingCompanyId: companyId, assetId, runDate: "2030-01-01" }, { userId })) as Extract<AmortizationPostingResult, { result: "posted" }>;
    expect(result.result).toBe("posted");
    expect(result.period_count).toBe(12);
    expect(result.total_posted_cents).toBe(120000);

    const sums = await scopedRead<{ dr: string; cr: string }>(
      `SELECT COALESCE(SUM(amount_cents) FILTER (WHERE debit_or_credit='debit'),0)::text AS dr,
              COALESCE(SUM(amount_cents) FILTER (WHERE debit_or_credit='credit'),0)::text AS cr
         FROM accounting.journal_entry_postings
        WHERE source_transaction_id=$1 AND source_transaction_type='fixed_asset_depreciation'`,
      [assetId]
    );
    expect(Number(sums[0].dr)).toBe(120000); // Dr depreciation expense total
    expect(Number(sums[0].cr)).toBe(120000); // Cr accumulated depreciation total

    // Materialized schedule: accumulated rolls 10000, 20000, ... 120000.
    const sched = await scopedRead<{ period_number: number; accumulated_to_date_cents: string }>(
      `SELECT period_number, accumulated_to_date_cents::text FROM accounting.depreciation_schedule_rows
        WHERE asset_id=$1::uuid ORDER BY period_number`,
      [assetId]
    );
    expect(Number(sched[0].accumulated_to_date_cents)).toBe(10000);
    expect(Number(sched[11].accumulated_to_date_cents)).toBe(120000);

    // Unit-linked spine event present (subject_type='unit').
    const evt = await scopedRead<{ c: string }>(
      `SELECT count(*)::text AS c FROM events.event_log
        WHERE event_type='amortization.posted' AND subject_type='unit' AND subject_id=$1::uuid`,
      [unitId]
    );
    expect(Number(evt[0].c)).toBeGreaterThanOrEqual(1);

    // Idempotent re-run.
    const rerun = (await postDepreciation({ operatingCompanyId: companyId, assetId, runDate: "2030-01-01" }, { userId })) as AmortizationPostingResult;
    expect(rerun.result).toBe("nothing_to_post");
    expect(await jeLineCount("fixed_asset_depreciation", assetId)).toBe(24); // 12 periods x 2 lines
  });

  it("(d) prior_accumulated_depr_cents > 0 -> REFUSED, zero journal entries", async () => {
    await setFlag(true);
    const assetId = await seedFixedAsset({ priceCents: 120000, salvageCents: 0, lifeMonths: 12, priorAccumCents: 50000 });
    let code: string | null = null;
    try {
      await postDepreciation({ operatingCompanyId: companyId, assetId, runDate: "2030-01-01" }, { userId });
    } catch (e) {
      code = e instanceof AmortizationPostingError ? e.code : `other:${(e as Error).message}`;
    }
    expect(code).toBe("PRIOR_ACCUM_UNSUPPORTED");
    expect(await jeLineCount("fixed_asset_depreciation", assetId)).toBe(0);
  });

  it("(e) depreciation reversal posts a reversing JE + un-posts the schedule; re-run reverses nothing", async () => {
    await setFlag(true);
    const assetId = await seedFixedAsset({ priceCents: 60000, salvageCents: 0, lifeMonths: 6, priorAccumCents: 0 });
    const posted = (await postDepreciation({ operatingCompanyId: companyId, assetId, runDate: "2030-01-01" }, { userId })) as Extract<AmortizationPostingResult, { result: "posted" }>;
    expect(posted.period_count).toBe(6);

    const rev = await reverseDepreciation({ operatingCompanyId: companyId, assetId, reason: "FIN21 test reversal" }, { userId });
    expect(rev.result).toBe("reversed");
    expect(rev.reversed_periods.length).toBe(6);

    // Original JEs voided, schedule rows un-posted.
    const unposted = await scopedRead<{ c: string }>(
      `SELECT count(*)::text AS c FROM accounting.depreciation_schedule_rows
        WHERE asset_id=$1::uuid AND posted=false AND depreciation_amount_cents>0`,
      [assetId]
    );
    expect(Number(unposted[0].c)).toBe(6);

    // Re-running the reversal reverses nothing.
    const rev2 = await reverseDepreciation({ operatingCompanyId: companyId, assetId, reason: "again" }, { userId });
    expect(rev2.result).toBe("nothing_to_reverse");
  });
});
