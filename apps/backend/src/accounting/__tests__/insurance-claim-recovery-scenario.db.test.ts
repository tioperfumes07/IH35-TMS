/**
 * STAGE-3 SCENARIO 2 — INSURER CLAIM RECOVERY, real engine, real Postgres.
 *
 * Proves the recovery hop end to end and, just as importantly, proves the ASC 450-30 / 610-30 CAP:
 *   1. a recovery inside the recorded loss posts Dr cash_clearing / Cr insurance_recovery (6155),
 *      balanced, and carries transaction_source_links back to the claim;
 *   2. a recovery ABOVE the recorded loss is capped — the excess is reported as an unposted gain
 *      contingency and never reaches the ledger.
 *
 * (2) is the one that matters. Recovery in excess of the loss you actually booked is a gain
 * contingency, not income, and posting it would overstate earnings on a claim that has not settled.
 * insurance_recovery is a CONTRA-EXPENSE (6155 is OtherExpense on all three entities) — never sales
 * income — so an uncapped credit would also drive the expense account negative.
 *
 * Placeholder amounts per STANDING-SESSION-DIRECTIVE §7 (clearly-fake test values, labelled).
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import {
  createIsolatedOperatingCompany, ensureIntegrationPrerequisites, deactivateIsolatedOperatingCompany,
  type IsolatedOperatingCompany,
} from "../../../test-helpers/db-fixture.js";
import { postInsuranceClaimRecovery, INSURANCE_CLAIM_RECOVERY_GL_POSTING_FLAG } from "../insurance-claim-recovery-posting/poster.service.js";

const run = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

// §7 placeholder numbers — obviously fake, labelled as test data.
const CLAIMED_CENTS = 120_000; // $1,200.00 recorded loss
const RECOVERY_CENTS = 100_000; // $1,000.00 insurer pays — inside the loss
const OVER_RECOVERY_CENTS = 150_000; // $1,500.00 — ABOVE the recorded loss, must cap

run("stage-3 · insurer claim recovery (real engine)", () => {
  let db: pg.Client; let companyId: string; let isolated: IsolatedOperatingCompany;
  const s = randomUUID().slice(0, 6);
  const userId = "00000000-0000-4000-8000-0000000000dd";
  const id = { cash: randomUUID(), recovery: randomUUID(), covType: randomUUID(), policy: randomUUID(), claim: randomUUID() };

  async function tx(fn: () => Promise<void>) {
    await db.query("BEGIN"); await db.query("SET LOCAL app.bypass_rls='lucia'");
    if (companyId) await db.query("SELECT set_config('app.operating_company_id',$1,true)", [companyId]);
    try { await fn(); await db.query("COMMIT"); } catch (e) { await db.query("ROLLBACK").catch(()=>{}); throw e; }
  }
  async function read<T=any>(sql: string, p: unknown[]): Promise<T[]> {
    await db.query("BEGIN"); await db.query("SET LOCAL app.bypass_rls='lucia'");
    await db.query("SELECT set_config('app.operating_company_id',$1,true)", [companyId]);
    try { const r = await db.query(sql, p); await db.query("COMMIT"); return r.rows as T[]; }
    catch (e) { await db.query("ROLLBACK").catch(()=>{}); throw e; }
  }

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    isolated = await createIsolatedOperatingCompany(db, `ins-recovery-${s}`);
    companyId = isolated.companyId;

    await tx(async () => {
      // CoA: the two accounts the poster resolves by ROLE. insurance_recovery is deliberately an
      // EXPENSE-type account (contra-expense), mirroring prod where 6155 is OtherExpense on all three
      // entities — if this were ever seeded as Income the scenario would silently book revenue.
      await db.query(`INSERT INTO catalogs.accounts (id,operating_company_id,account_number,account_name,account_type,is_postable) VALUES ($1::uuid,$2::uuid,$3,'Cash Clearing','Asset',true)`, [id.cash, companyId, `CSH${s}`]);
      await db.query(`INSERT INTO catalogs.accounts (id,operating_company_id,account_number,account_name,account_type,is_postable) VALUES ($1::uuid,$2::uuid,$3,'Insurance Claim Recovery','OtherExpense',true)`, [id.recovery, companyId, `6155${s}`]);
      await db.query(`INSERT INTO accounting.chart_of_accounts_roles (operating_company_id,role,account_id,is_active) VALUES ($1::uuid,'cash_clearing',$2::uuid,true)`, [companyId, id.cash]);
      await db.query(`INSERT INTO accounting.chart_of_accounts_roles (operating_company_id,role,account_id,is_active) VALUES ($1::uuid,'insurance_recovery',$2::uuid,true)`, [companyId, id.recovery]);
      // Flag ON for THIS entity only (per-entity override is the real mechanism; default stays OFF).
      // set_by_user_uuid is NOT NULL by design — a posting flag may never be flipped anonymously.
      await db.query(`INSERT INTO lib.feature_flag_overrides (flag_key,operating_company_id,enabled,set_by_user_uuid) VALUES ($1,$2::uuid,true,$3::uuid) ON CONFLICT DO NOTHING`, [INSURANCE_CLAIM_RECOVERY_GL_POSTING_FLAG, companyId, userId]);
      // Policy + claim. amount_claimed_cents is the recorded loss the cap is measured against.
      await db.query(`INSERT INTO insurance.type_catalog (id,tenant_id,code,name) VALUES ($1::uuid,$2::uuid,$3,'Auto Liability')`, [id.covType, companyId, `AL-${s}`]);
      await db.query(`INSERT INTO insurance.policy (id,tenant_id,insurer_name,policy_number,coverage_type,coverage_type_id,effective_date,expiry_date) VALUES ($1::uuid,$2::uuid,'Progressive',$3,'auto_liability',$4::uuid,CURRENT_DATE - 30, CURRENT_DATE + 300)`, [id.policy, companyId, `POL-${s}`, id.covType]);
      await db.query(`INSERT INTO insurance.claim (id,tenant_id,claim_number,policy_id,accident_date,reported_date,amount_claimed_cents,status) VALUES ($1::uuid,$2::uuid,$3,$4::uuid,CURRENT_DATE,CURRENT_DATE,$5,'open')`, [id.claim, companyId, `CLM-${s}`, id.policy, CLAIMED_CENTS]);
    });
  });

  afterAll(async () => {
    if (!db) return;
    try { await tx(async () => {
      await db.query(`DELETE FROM accounting.chart_of_accounts_roles WHERE operating_company_id=$1::uuid`, [companyId]);
      if (isolated) await deactivateIsolatedOperatingCompany(db, isolated);
    }); } catch { /* best effort */ }
    await db.end();
  });

  it("recovery INSIDE the recorded loss posts Dr cash_clearing / Cr insurance_recovery, balanced + source-linked", async () => {
    const res = await postInsuranceClaimRecovery({
      operating_company_id: companyId,
      claim_id: id.claim,
      amount_paid_cents: RECOVERY_CENTS,
      actor_user_id: userId,
      entry_date_iso: new Date().toISOString(),
    });
    expect(res.posted).toBe(true);
    expect(res.journal_entry_id).toBeTruthy();

    const je = await read(`
      SELECT a.account_name, a.account_type, p.debit_or_credit, p.amount_cents::text AS amount_cents
        FROM accounting.journal_entry_postings p
        JOIN catalogs.accounts a ON a.id = p.account_id
       WHERE p.journal_entry_uuid = $1::uuid
       ORDER BY p.debit_or_credit DESC`, [res.journal_entry_id]);
    const dr = je.filter((r:any)=>r.debit_or_credit==="debit").reduce((a:number,r:any)=>a+Number(r.amount_cents),0);
    const cr = je.filter((r:any)=>r.debit_or_credit==="credit").reduce((a:number,r:any)=>a+Number(r.amount_cents),0);
    expect(dr).toBe(cr);
    expect(dr).toBe(RECOVERY_CENTS);

    // Direction matters as much as balance: cash UP (debit), recovery CREDITED against the expense.
    const debit = je.find((r:any)=>r.debit_or_credit==="debit");
    const credit = je.find((r:any)=>r.debit_or_credit==="credit");
    expect(debit.account_name).toBe("Cash Clearing");
    expect(credit.account_name).toBe("Insurance Claim Recovery");
    // The credit leg must NOT be an income account — recovery is a contra-expense, never sales income.
    expect(credit.account_type).not.toBe("Income");

    const links = await read(`
      SELECT DISTINCT tsl.linked_object_type, tsl.linked_object_id::text AS linked_object_id
        FROM accounting.transaction_source_links tsl
        JOIN accounting.journal_entry_postings p ON p.id = tsl.journal_entry_posting_id
       WHERE p.journal_entry_uuid = $1::uuid`, [res.journal_entry_id]);
    expect(links.length).toBeGreaterThan(0);
  });

  it("recovery ABOVE the recorded loss is CAPPED — the excess is an unposted gain contingency", async () => {
    // Second insurer payment pushes the cumulative recovery past the $1,200 recorded loss.
    const res = await postInsuranceClaimRecovery({
      operating_company_id: companyId,
      claim_id: id.claim,
      // amount_paid_cents is CUMULATIVE (claim.amount_paid_cents after the PATCH), not a delta —
      // the poster derives the increment itself, which is what makes the cap stateful.
      amount_paid_cents: OVER_RECOVERY_CENTS,
      actor_user_id: userId,
      entry_date_iso: new Date().toISOString(),
    });

    // Room left was 120,000 - 100,000 = 20,000. Anything beyond that must not post.
    const posted = Number(res.amount_cents ?? 0);
    expect(posted).toBeLessThanOrEqual(CLAIMED_CENTS - RECOVERY_CENTS);
    expect(res.reason === "capped_at_recorded_loss" || posted < OVER_RECOVERY_CENTS - RECOVERY_CENTS).toBe(true);

    // Whatever the engine did, the ledger must never hold more recovery than the recorded loss.
    const [tot] = await read(`
      SELECT COALESCE(SUM(p.amount_cents),0)::text AS credited
        FROM accounting.journal_entry_postings p
        JOIN catalogs.accounts a ON a.id = p.account_id
       WHERE a.id = $1::uuid AND p.debit_or_credit = 'credit'`, [id.recovery]);
    expect(Number(tot.credited)).toBeLessThanOrEqual(CLAIMED_CENTS);
  });
});
