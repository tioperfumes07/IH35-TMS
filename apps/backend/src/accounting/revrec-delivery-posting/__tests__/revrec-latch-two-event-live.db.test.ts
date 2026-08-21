/**
 * LV-REVREC-LEDGER-DBTEST — no test anywhere proved the two-event revenue latch actually POSTS a
 * balanced journal entry through the REAL DB. `poster.service.test.ts` only unit-tests the pure
 * posting-line builders; `posting-engine-revrec-interlock.test.ts` and
 * `revrec-delivery-posting/__tests__/poster-pod-evidence-gate.test.ts` mock the DB client entirely.
 * Static guards (`verify-delivery-evidence-latch-wired.mjs`, `verify-money-side-effect-after-commit.mjs`)
 * can only prove a call is WIRED, not that it POSTED — exactly the blindness that let LV-REVREC-NOT-
 * FIRING run dark for days on prod (see delivery-evidence-latch.ts's own header comment).
 *
 * This test calls `postLoadRevenueLatch()` — the real exported function, no mocks — against a real
 * Postgres connection, through `withLuciaBypass`'s real connection pool, exercising the real
 * `createJournalEntry` (debits===credits enforced by the DB), the real `resolveRoleAccount`, and the
 * real ACCT-F5692 POD-evidence gate. It asserts a BALANCED row lands in
 * `accounting.load_revenue_recognition_postings` and `accounting.journal_entries` for both Event 1
 * (earn) and Event 2 (bill) — the exact gap this board row named.
 *
 * ISOLATION: owns a unique org.companies row (createIsolatedOperatingCompany) — chart_of_accounts_roles
 * is UNIQUE per (company, role), so a shared entity would let parallel forks clobber each other's
 * account_id (same rationale as the sibling acct-f5622/subledger-gl-tieout-ar db tests).
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../../lib/pg-connection-options.js";
import {
  createIsolatedOperatingCompany,
  deactivateIsolatedOperatingCompany,
  ensureIntegrationPrerequisites,
  type IsolatedOperatingCompany,
} from "../../../../test-helpers/db-fixture.js";
import { postLoadRevenueLatch, REVENUE_RECOGNITION_POST_FLAG } from "../poster.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("LV-REVREC-LEDGER-DBTEST — two-event revenue latch posts a real, balanced JE", () => {
  let db: pg.Client;
  let isolated: IsolatedOperatingCompany;
  let companyId: string;

  const suffix = randomUUID().slice(0, 6);
  const userId = "00000000-0000-4000-8000-0000000000f5";
  const revenueAccountId = randomUUID();
  const unbilledAccountId = randomUUID();
  const arAccountId = randomUUID();
  const customerId = randomUUID();
  const driverId = randomUUID();

  const RATE_CENTS = 187_550;

  async function bypass(fn: () => Promise<void>) {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    if (companyId) await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    try {
      await fn();
      await db.query("COMMIT");
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    }
  }

  async function seedLoad(): Promise<{ loadId: string; stopId: string }> {
    const loadId = randomUUID();
    const stopId = randomUUID();
    await bypass(async () => {
      await db.query(
        `INSERT INTO mdata.loads (id, operating_company_id, load_number, customer_id, status, rate_total_cents, dispatcher_user_id, load_trailer_equipment_id)
         VALUES ($1::uuid,$2::uuid,$3,$4::uuid,'delivered_pending_docs',$5,$6::uuid,(SELECT id FROM catalogs.load_trailer_equipment WHERE operating_company_id = $2::uuid AND code = 'DRY_VAN' LIMIT 1))`,
        [loadId, companyId, `L-RVL-${suffix}-${loadId.slice(0, 4)}`, customerId, RATE_CENTS, userId]
      );
      await db.query(
        `INSERT INTO mdata.load_stops (id, load_id, sequence_number, stop_type, actual_departure_at)
         VALUES ($1::uuid, $2::uuid, 2, 'delivery', now())`,
        [stopId, loadId]
      );
    });
    return { loadId, stopId };
  }

  async function insertApprovedPod(loadId: string, stopId: string) {
    await bypass(async () => {
      await db.query(
        `INSERT INTO dispatch.pod_documents (operating_company_id, load_id, stop_id, driver_id, status)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'approved')`,
        [companyId, loadId, stopId, driverId]
      );
    });
  }

  async function latchRow(loadId: string, event: "earn" | "bill") {
    const res = await db.query<{
      id: string;
      journal_entry_id: string;
      amount_cents: string;
      status: string;
    }>(
      `SELECT id, journal_entry_id, amount_cents::text, status
         FROM accounting.load_revenue_recognition_postings
        WHERE operating_company_id = $1::uuid AND load_id = $2::uuid AND event = $3
        LIMIT 1`,
      [companyId, loadId, event]
    );
    return res.rows[0] ?? null;
  }

  async function journalEntryIsBalanced(journalEntryId: string): Promise<{ debits: number; credits: number }> {
    const res = await db.query<{ debits: string; credits: string }>(
      `SELECT
         COALESCE(SUM(amount_cents) FILTER (WHERE debit_or_credit = 'debit'), 0)::text AS debits,
         COALESCE(SUM(amount_cents) FILTER (WHERE debit_or_credit = 'credit'), 0)::text AS credits
       FROM accounting.journal_entry_postings
       WHERE journal_entry_uuid = $1::uuid`,
      [journalEntryId]
    );
    return { debits: Number(res.rows[0]?.debits ?? 0), credits: Number(res.rows[0]?.credits ?? 0) };
  }

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required for this db.test");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();

    await bypass(async () => {
      await db.query(
        `INSERT INTO identity.users (id, email, role, preferred_language)
         VALUES ($1::uuid,$2,'Owner','en') ON CONFLICT (id) DO NOTHING`,
        [userId, `f5692-dbtest-${suffix}@example.test`]
      );
    });

    isolated = await createIsolatedOperatingCompany({
      codePrefix: "RVL",
      legalNamePrefix: "LV-REVREC-LEDGER-DBTEST",
      actorUserId: userId,
    });
    companyId = isolated.companyId;

    await bypass(async () => {
      await db.query(
        `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
         VALUES ($1::uuid,$2::uuid,$3,'Revenue RVL Test','Income',true)`,
        [revenueAccountId, companyId, `RV${suffix}`]
      );
      await db.query(
        `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
         VALUES ($1::uuid,$2::uuid,$3,'Unbilled Revenue RVL Test','Asset',true)`,
        [unbilledAccountId, companyId, `UB${suffix}`]
      );
      await db.query(
        `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
         VALUES ($1::uuid,$2::uuid,$3,'AR RVL Test','Asset',true)`,
        [arAccountId, companyId, `AR${suffix}`]
      );
      await db.query(
        `INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
         VALUES ($1::uuid,'revenue_default',$2::uuid,true),
                ($1::uuid,'unbilled_revenue',$3::uuid,true),
                ($1::uuid,'ar_control',$4::uuid,true)`,
        [companyId, revenueAccountId, unbilledAccountId, arAccountId]
      );
      await db.query(
        `INSERT INTO mdata.customers (id, operating_company_id, customer_name) VALUES ($1::uuid,$2::uuid,$3)`,
        [customerId, companyId, `RVL Cust ${suffix}`]
      );
      await db.query(
        `INSERT INTO mdata.drivers (id, operating_company_id, first_name, last_name, phone, status)
         VALUES ($1::uuid,$2::uuid,'RVL','Driver',$3,'Active')`,
        [driverId, companyId, `95608${suffix.slice(0, 5)}`]
      );
      await db.query(
        `INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, enabled, set_by_user_uuid)
         VALUES ($1, $2::uuid, true, $3::uuid) ON CONFLICT DO NOTHING`,
        [REVENUE_RECOGNITION_POST_FLAG, companyId, userId]
      );
    });
  });

  afterAll(async () => {
    if (!db) return;
    try {
      if (isolated) await deactivateIsolatedOperatingCompany(db, isolated);
    } catch {
      /* best-effort cleanup — never mask a real assertion failure */
    }
    await db.end();
  });

  it("Event 1 (earn) posts a balanced DR Unbilled / CR Revenue JE through the real DB", async () => {
    const { loadId } = await seedLoad();

    const result = await postLoadRevenueLatch({
      operating_company_id: companyId,
      load_id: loadId,
      target_status: "delivered_pending_docs",
      entry_date_iso: new Date().toISOString(),
      actor_user_id: userId,
    });

    expect(result.posted, `earn refused: ${JSON.stringify(result)}`).toBe(true);
    expect(result.event).toBe("earn");

    const row = await latchRow(loadId, "earn");
    expect(row).not.toBeNull();
    expect(row!.status).toBe("posted");
    expect(Number(row!.amount_cents)).toBe(RATE_CENTS);

    const balance = await journalEntryIsBalanced(row!.journal_entry_id);
    expect(balance.debits).toBe(RATE_CENTS);
    expect(balance.credits).toBe(RATE_CENTS);
  });

  it("Event 2 (bill) REFUSES without an approved POD, then POSTS a balanced DR A/R / CR Unbilled JE once one exists — through the real DB (ACCT-F5692)", async () => {
    const { loadId, stopId } = await seedLoad();

    const earned = await postLoadRevenueLatch({
      operating_company_id: companyId,
      load_id: loadId,
      target_status: "delivered_pending_docs",
      entry_date_iso: new Date().toISOString(),
      actor_user_id: userId,
    });
    expect(earned.posted, `earn refused: ${JSON.stringify(earned)}`).toBe(true);

    // ACCT-F5692, proven through the REAL DB (not a mock): no approved POD exists yet, so Event 2
    // must refuse and post nothing.
    const refused = await postLoadRevenueLatch({
      operating_company_id: companyId,
      load_id: loadId,
      target_status: "completed_docs_received",
      entry_date_iso: new Date().toISOString(),
      actor_user_id: userId,
    });
    expect(refused).toEqual({ posted: false, reason: "missing_pod_evidence" });
    expect(await latchRow(loadId, "bill")).toBeNull();

    await insertApprovedPod(loadId, stopId);

    const billed = await postLoadRevenueLatch({
      operating_company_id: companyId,
      load_id: loadId,
      target_status: "completed_docs_received",
      entry_date_iso: new Date().toISOString(),
      actor_user_id: userId,
    });
    expect(billed.posted, `bill refused after approved POD: ${JSON.stringify(billed)}`).toBe(true);
    expect(billed.event).toBe("bill");

    const row = await latchRow(loadId, "bill");
    expect(row).not.toBeNull();
    expect(row!.status).toBe("posted");
    expect(Number(row!.amount_cents)).toBe(RATE_CENTS);

    const balance = await journalEntryIsBalanced(row!.journal_entry_id);
    expect(balance.debits).toBe(RATE_CENTS);
    expect(balance.credits).toBe(RATE_CENTS);
  });
});
