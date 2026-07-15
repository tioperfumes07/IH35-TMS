/**
 * CHAIN-06 — invoice -> A/R -> factoring (secured-borrowing) tie-out proof (real Postgres).
 *
 * Read-only proof: drives the REAL poster functions (postFactoringAdvanceEvent /
 * postFactoringCustomerPaymentEvent / postFactoringChargebackEvent, CODER-34, PR #1770) end-to-end
 * against a live-migrated CI Postgres, then exercises the exact SQL in
 * scripts/verify-chain-06-factoring-ar-tieout.mjs (kept in lockstep manually — see
 * docs/specs/qbo-parity/CHAIN-06-FACTORING-AR-TIEOUT-PROOF.md §3/§6), proving:
 *   (1) funding NEVER touches ar_control (Jorge's directive: AR closes only when the customer pays the
 *       factor, never at advance) — a clean funding-only advance produces zero Leg-B violations;
 *   (2) the factoring_advance_liability round-trips to zero once an advance reaches a terminal status,
 *       via EITHER the customer-payment path OR the chargeback path (Leg C);
 *   (3) each assertion actually CATCHES the defect it exists to catch (a fabricated "bad" funding JE
 *       that touches ar_control directly, and a terminal advance with no relief event) — the guard is
 *       not a no-op.
 *
 * Uses the live TRANSP-prerequisite company's already-seeded chart_of_accounts_roles where present
 * (factoring_advance_liability/factor_reserve_held/factor_fee_expense/factoring_recoursed_ar/
 * default_interest_expense from 202607013000/CODER-34) — no migration/schema change. ar_control/
 * cash_clearing are FRESH-DB self-healed below (202607011000 seeds ar_control only by joining prod's
 * real QBO-synced account UUID, which doesn't exist on a fresh CI DB; cash_clearing has never had a
 * seeding migration at all) — a no-op on a prod-copy branch where the real mappings already exist.
 *
 * Also seeds a long-lived fake integrations.qbo_connections row (same pattern as
 * settlement-bill-payment-posting.db.test.ts): createJournalEntry unconditionally calls
 * enqueueSyncJob -> getValidAccessToken, which throws "QBO not authorized" if no connection row exists
 * for the company, even though the JE_QBO_PUSH_ENABLED flag itself stays OFF (push is gated separately,
 * at drain/immediate-push time, not at enqueue time).
 *
 * Runs only in CI (GITHUB_ACTIONS=true) where a migrated Postgres is available.
 */
import crypto, { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID, TEST_ENCRYPTION_KEY } from "../../../../test-helpers/constants.js";
import {
  postFactoringAdvanceEvent,
  postFactoringChargebackEvent,
  postFactoringCustomerPaymentEvent,
} from "../poster.service.js";
import { createJournalEntry } from "../../journal-entries.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

// See test-helpers/constants.ts (TEST_ENCRYPTION_KEY) and settlement-bill-payment-posting.db.test.ts for
// the full rationale (AES-256-GCM round-trip via the real decryptToken call). MUST be the shared
// constant, never a file-local literal — vitest's `pool: "forks"` can reuse one child process across
// multiple `.db.test.ts` files, and getActiveConnectionByCompany has no realm_id filter.
process.env.ENCRYPTION_KEY ??= TEST_ENCRYPTION_KEY;
function encryptTestToken(plain: string): string {
  const iv = crypto.randomBytes(12);
  const key = crypto.createHash("sha256").update(process.env.ENCRYPTION_KEY!, "utf8").digest();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

// Kept in lockstep with scripts/verify-chain-06-factoring-ar-tieout.mjs's ASSERTIONS object, scoped here
// to just the advance ids this test creates (memory shared-company-db-test-contamination: the TRANSP
// prerequisite company is shared across parallel test files — never assert on an un-scoped aggregate).
const ASSERTIONS = {
  legB_fundingTouchesAr: `
    SELECT je.id AS journal_entry_id
      FROM accounting.journal_entries je
      JOIN accounting.journal_entry_postings jep ON jep.journal_entry_uuid = je.id
      JOIN accounting.chart_of_accounts_roles r
        ON r.operating_company_id = je.operating_company_id
       AND r.role = 'ar_control' AND r.is_active AND r.account_id = jep.account_id
     WHERE je.id = ANY($1::uuid[])`,
  legC_liabilityRoundTrip: (displayIds: string[]) => `
    SELECT fa.id AS factoring_advance_id,
           COALESCE(funding.credited, 0)  AS liability_credited_at_funding,
           COALESCE(customer.debited, 0) + COALESCE(chargeback.debited, 0) AS liability_debited_after
      FROM accounting.factoring_advances fa
      LEFT JOIN LATERAL (
        SELECT SUM(jep.amount_cents)::bigint AS credited
          FROM accounting.journal_entries je JOIN accounting.journal_entry_postings jep ON jep.journal_entry_uuid = je.id
         WHERE je.operating_company_id = fa.operating_company_id
           AND je.memo = 'Factoring funding ' || fa.display_id AND jep.debit_or_credit = 'credit'
      ) funding ON true
      LEFT JOIN LATERAL (
        SELECT SUM(jep.amount_cents)::bigint AS debited
          FROM accounting.journal_entries je JOIN accounting.journal_entry_postings jep ON jep.journal_entry_uuid = je.id
         WHERE je.operating_company_id = fa.operating_company_id
           AND je.memo LIKE 'Factoring customer payment ' || fa.display_id || ' (%' AND jep.debit_or_credit = 'debit'
      ) customer ON true
      LEFT JOIN LATERAL (
        SELECT SUM(jep.amount_cents)::bigint AS debited
          FROM accounting.journal_entries je JOIN accounting.journal_entry_postings jep ON jep.journal_entry_uuid = je.id
         WHERE je.operating_company_id = fa.operating_company_id
           AND je.memo LIKE 'Factoring chargeback repay ' || fa.display_id || ' (%' AND jep.debit_or_credit = 'debit'
      ) chargeback ON true
     WHERE fa.display_id = ANY($1::text[])
       AND COALESCE(funding.credited, 0) <> (COALESCE(customer.debited, 0) + COALESCE(chargeback.debited, 0))`,
};

describeIntegration("CHAIN-06 invoice -> A/R -> factoring tie-out proof (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  const suffix = randomUUID().slice(0, 6);
  const vendorId = randomUUID();
  const advanceIds: string[] = [];
  const displayIds: string[] = [];
  const journalEntryIds: string[] = [];

  async function bypass<T>(fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    if (companyId) await db.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    try {
      const out = await fn();
      await db.query("COMMIT");
      return out;
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    }
  }

  async function scopedRead<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]> {
    return bypass(async () => (await db.query(sql, params)).rows as T[]);
  }

  const liveRole = async (role: string): Promise<string> => {
    const r = await scopedRead<{ account_id: string }>(
      `SELECT account_id::text AS account_id FROM accounting.chart_of_accounts_roles
        WHERE operating_company_id=$1::uuid AND role=$2 AND is_active=true ORDER BY updated_at DESC LIMIT 1`,
      [companyId, role]
    );
    const id = r[0]?.account_id;
    if (!id) throw new Error(`no mapped ${role} role for company ${companyId} — CODER-34 migration 202607013000 may not have run`);
    return id;
  };

  async function seedAdvance(opts: { invoiceTotalCents: number; advanceCents: number; reserveCents: number; feeCents: number }): Promise<{ id: string; displayId: string }> {
    const id = randomUUID();
    const displayId = `T06-ADV-${suffix}-${advanceIds.length + 1}`;
    await bypass(async () => {
      await db.query(
        `INSERT INTO accounting.factoring_advances
           (id, operating_company_id, factoring_company_vendor_id, display_id, status,
            invoice_total_cents, advance_rate_pct, advance_amount_cents, reserve_pct, reserve_amount_cents,
            factor_fee_pct, factor_fee_cents, advanced_at)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,'advanced',$5,90,$6,8,$7,2,$8,now())`,
        [id, companyId, vendorId, displayId, opts.invoiceTotalCents, opts.advanceCents, opts.reserveCents, opts.feeCents]
      );
    });
    advanceIds.push(id);
    displayIds.push(displayId);
    return { id, displayId };
  }

  async function markTerminal(advanceId: string, status: string) {
    await bypass(async () => {
      await db.query(`UPDATE accounting.factoring_advances SET status = $2 WHERE id = $1::uuid`, [advanceId, status]);
    });
  }

  // Self-heal cash_clearing/ar_control role mappings for the TRANSP prerequisite company on a FRESH CI
  // Postgres (migration-must-refresh-schema-parity / branch-copy-vs-fresh-DB landmine): 202607011000
  // seeds ap_control/ar_control ONLY by joining prod's real QBO-synced account UUIDs — those rows don't
  // exist on a fresh migrated-from-0001 DB, so the join yields 0 rows and the role stays unmapped there.
  // cash_clearing has never been seeded by any migration at all (0223 only defines the CHECK value). The
  // real poster (poster.service.ts) fails closed via resolveRoleAccount when a role is unmapped — exactly
  // what CHAIN-06 exists to exercise, so the test must guarantee both roles resolve. Idempotent + additive:
  // a no-op on a prod-copy branch where the real mappings already exist (ON CONFLICT ... DO NOTHING), and
  // provisions a minimal Asset account otherwise. No migration touched.
  async function ensureRoleMapped(role: "cash_clearing" | "ar_control"): Promise<void> {
    await bypass(async () => {
      const existing = await db.query(
        `SELECT 1 FROM accounting.chart_of_accounts_roles WHERE operating_company_id=$1::uuid AND role=$2 AND is_active=true LIMIT 1`,
        [companyId, role]
      );
      if ((existing.rowCount ?? 0) > 0) return;
      const acctId = randomUUID();
      const acctNumber = `T06-${role.toUpperCase()}-${suffix}`;
      const acctName = role === "cash_clearing" ? `Chain-06 Test Cash Clearing ${suffix}` : `Chain-06 Test A/R Control ${suffix}`;
      const acctSubtype = role === "cash_clearing" ? "CashAndCashEquivalents" : "AccountsReceivable";
      await db.query(
        `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, account_subtype, is_postable)
         VALUES ($1::uuid,$2::uuid,$3,$4,'Asset',$5,true)`,
        [acctId, companyId, acctNumber, acctName, acctSubtype]
      );
      await db.query(
        `INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active, created_at, updated_at)
         VALUES ($1::uuid,$2,$3::uuid,true,now(),now())
         ON CONFLICT (operating_company_id, role) WHERE is_active DO NOTHING`,
        [companyId, role, acctId]
      );
    });
  }

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
    await ensureRoleMapped("cash_clearing");
    await ensureRoleMapped("ar_control");
    await bypass(async () => {
      await db.query(
        `INSERT INTO mdata.vendors (id, operating_company_id, vendor_name, vendor_type) VALUES ($1::uuid,$2::uuid,$3,'Other')`,
        [vendorId, companyId, `Chain-06 Test Factor ${suffix}`]
      );
      // Ensure the flag is ON via per-entity override so the real poster functions actually post
      // (default is OFF — CLAUDE.md money-flag convention). Cleaned up in afterAll.
      await db.query(
        `INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, enabled, set_by_user_uuid)
         VALUES ('FACTORING_GL_POSTING_ENABLED',$1::uuid,true,$2::uuid)
         ON CONFLICT (flag_key, operating_company_id) WHERE user_uuid IS NULL AND operating_company_id IS NOT NULL
         DO UPDATE SET enabled = true`,
        [companyId, TEST_OWNER_USER_ID]
      );
      // createJournalEntry (called by every real poster event below) unconditionally enqueues a QBO sync
      // job, which requires an authorized connection row to exist even though the JE push flag stays OFF.
      await db.query(
        `INSERT INTO integrations.qbo_connections
           (operating_company_id, realm_id, access_token, refresh_token, access_token_expires_at, refresh_token_expires_at, authorized_by_user_id)
         VALUES ($1::uuid, $2, $3, $4, now() + interval '1 year', now() + interval '1 year', $5::uuid)
         ON CONFLICT (operating_company_id, realm_id) WHERE revoked_at IS NULL DO NOTHING`,
        [companyId, `TEST-REALM-T06-${suffix}`, encryptTestToken("test-access-token"), encryptTestToken("test-refresh-token"), TEST_OWNER_USER_ID]
      );
    });
  });

  // ── Shared-singleton COA-role serialization (TEST HYGIENE — poster.service.ts is UNCHANGED) ──────────
  // ar_control (also seeded by invoice-ar-killswitch.db.test.ts) and cash_clearing are per-(company, role)
  // SINGLETONs on the shared TRANSP prerequisite company — ensureIntegrationPrerequisites() hands every
  // db.test the SAME company. Under vitest pool:"forks" a parallel sibling's afterAll can DELETE the active
  // role row between this file's seed and its liveRole()/poster reads, so liveRole() throws "no mapped
  // ar_control role" (the flake). Serialize on the SAME advisory lock the ap_control writers already use
  // (bill-payment-gl-posting / bank-transaction-splits / settlement-bill-payment) and RE-ENSURE the roles
  // inside the lock before each test, so every test window observes a valid, stable mapping. This does NOT
  // touch the poster's entity-scoped FACTORING_GL_POSTING_ENABLED resolution or its role resolution.
  // Enforced by scripts/verify-shared-coa-role-tests-serialized.mjs.
  const COA_ROLE_TEST_LOCK = 4200000001;
  beforeEach(async () => {
    await db.query("SELECT pg_advisory_lock($1::bigint)", [COA_ROLE_TEST_LOCK]);
    await ensureRoleMapped("cash_clearing");
    await ensureRoleMapped("ar_control");
  });
  afterEach(async () => {
    await db.query("SELECT pg_advisory_unlock($1::bigint)", [COA_ROLE_TEST_LOCK]).catch(() => {});
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await bypass(async () => {
        await db.query(`DELETE FROM lib.feature_flag_overrides WHERE flag_key='FACTORING_GL_POSTING_ENABLED' AND operating_company_id=$1::uuid`, [companyId]);
        await db.query(`DELETE FROM accounting.journal_entry_postings WHERE journal_entry_uuid IN (SELECT id FROM accounting.journal_entries WHERE memo LIKE $1)`, [`%${suffix}%`]);
        await db.query(`DELETE FROM accounting.journal_entries WHERE memo LIKE $1`, [`%${suffix}%`]);
        await db.query(`DELETE FROM accounting.factoring_advances WHERE id = ANY($1::uuid[])`, [advanceIds]);
        await db.query(`DELETE FROM mdata.vendors WHERE id = $1::uuid`, [vendorId]);
        await db.query(`DELETE FROM integrations.qbo_sync_queue WHERE operating_company_id=$1::uuid AND entity_type='journal_entry' AND entity_id = ANY($2::uuid[])`, [companyId, journalEntryIds]);
        await db.query(`DELETE FROM integrations.qbo_connections WHERE operating_company_id=$1::uuid AND realm_id=$2`, [companyId, `TEST-REALM-T06-${suffix}`]);
      });
    } catch {
      /* best-effort cleanup */
    }
    await db.end();
  });

  it("Leg B — a clean FUNDING-only advance never posts a line to ar_control (AR untouched at funding)", async () => {
    const { id: advanceId } = await seedAdvance({ invoiceTotalCents: 100_000, advanceCents: 90_000, reserveCents: 8_000, feeCents: 2_000 });
    const outcome = await postFactoringAdvanceEvent({ operating_company_id: companyId, factoring_advance_id: advanceId, actor_user_id: TEST_OWNER_USER_ID });
    expect(outcome.posted).toBe(true);
    expect(outcome.journal_entry_id).toBeTruthy();
    if (outcome.journal_entry_id) journalEntryIds.push(outcome.journal_entry_id);

    const rows = await scopedRead(ASSERTIONS.legB_fundingTouchesAr, [[outcome.journal_entry_id]]);
    expect(rows).toHaveLength(0);
  });

  it("Leg B — CATCHES a fabricated funding JE that DOES touch ar_control (proves the guard is not a no-op)", async () => {
    const { displayId } = await seedAdvance({ invoiceTotalCents: 40_000, advanceCents: 36_000, reserveCents: 3_000, feeCents: 1_000 });
    const arAccountId = await liveRole("ar_control");
    const cashAccountId = await liveRole("cash_clearing");
    // Deliberately mimic the retired SALE-MODEL defect: a "funding" JE that credits ar_control directly.
    const created = await createJournalEntry(
      {
        operating_company_id: companyId,
        entry_date: new Date().toISOString().slice(0, 10),
        memo: `Factoring funding ${displayId}`,
        source: "auto",
        postings: [
          { account_id: cashAccountId, debit_or_credit: "debit", amount_cents: 40_000 },
          { account_id: arAccountId, debit_or_credit: "credit", amount_cents: 40_000 },
        ],
      },
      { userId: TEST_OWNER_USER_ID, role: "system" }
    );
    journalEntryIds.push(created.id);

    const rows = await scopedRead<{ journal_entry_id: string }>(ASSERTIONS.legB_fundingTouchesAr, [[created.id]]);
    expect(rows).toHaveLength(1);
    expect(rows[0].journal_entry_id).toBe(created.id);
  });

  it("Leg C — funding -> customer-payment lifecycle round-trips the liability to zero on a terminal advance", async () => {
    const { id: advanceId, displayId } = await seedAdvance({ invoiceTotalCents: 75_000, advanceCents: 67_000, reserveCents: 6_000, feeCents: 2_000 });
    const funded = await postFactoringAdvanceEvent({ operating_company_id: companyId, factoring_advance_id: advanceId, actor_user_id: TEST_OWNER_USER_ID });
    expect(funded.posted).toBe(true);
    const paid = await postFactoringCustomerPaymentEvent({
      operating_company_id: companyId,
      factoring_advance_id: advanceId,
      actor_user_id: TEST_OWNER_USER_ID,
      amount_cents: 75_000, // customer pays the factor the full invoice face — AR closes here
    });
    expect(paid.posted).toBe(true);
    await markTerminal(advanceId, "collected");

    const rows = await scopedRead(ASSERTIONS.legC_liabilityRoundTrip([displayId]), [[displayId]]);
    expect(rows).toHaveLength(0); // liability fully round-tripped: funding credit == customer-payment debit
  });

  it("Leg C — funding -> chargeback lifecycle ALSO round-trips the liability to zero (customer never paid)", async () => {
    const { id: advanceId, displayId } = await seedAdvance({ invoiceTotalCents: 50_000, advanceCents: 45_000, reserveCents: 4_000, feeCents: 1_000 });
    const funded = await postFactoringAdvanceEvent({ operating_company_id: companyId, factoring_advance_id: advanceId, actor_user_id: TEST_OWNER_USER_ID });
    expect(funded.posted).toBe(true);
    const chargedBack = await postFactoringChargebackEvent({
      operating_company_id: companyId,
      factoring_advance_id: advanceId,
      actor_user_id: TEST_OWNER_USER_ID,
      chargeback_amount_cents: 50_000, // repay Faro the full advance
      default_interest_cents: 0,
      recoursed_ar_cents: 50_000,
    });
    expect(chargedBack.posted).toBe(true);
    await markTerminal(advanceId, "recourse_returned");

    const rows = await scopedRead(ASSERTIONS.legC_liabilityRoundTrip([displayId]), [[displayId]]);
    expect(rows).toHaveLength(0);
  });

  it("Leg C — CATCHES a terminal advance with NO relief event (liability left dangling — proves the guard is not a no-op)", async () => {
    const { id: advanceId, displayId } = await seedAdvance({ invoiceTotalCents: 20_000, advanceCents: 18_000, reserveCents: 1_500, feeCents: 500 });
    const funded = await postFactoringAdvanceEvent({ operating_company_id: companyId, factoring_advance_id: advanceId, actor_user_id: TEST_OWNER_USER_ID });
    expect(funded.posted).toBe(true);
    // Deliberately mark it terminal WITHOUT ever posting a customer-payment or chargeback event.
    await markTerminal(advanceId, "collected");

    const rows = await scopedRead<{ factoring_advance_id: string }>(ASSERTIONS.legC_liabilityRoundTrip([displayId]), [[displayId]]);
    expect(rows).toHaveLength(1);
    expect(rows[0].factoring_advance_id).toBe(advanceId);
  });
});
