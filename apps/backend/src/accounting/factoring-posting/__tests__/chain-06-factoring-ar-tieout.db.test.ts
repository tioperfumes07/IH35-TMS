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
 * Owns a UNIQUE operating company via createIsolatedOperatingCompany (codePrefix TRANSP for Faro
 * entity gate) — never the shared ensureIntegrationPrerequisites() TRANSP singleton. Parallel CI
 * forks previously deadlocked on accounting.factoring_lifecycle_posting_keys composite FKs /
 * (opco,id) unique parents when this suite posted against the shared company while siblings mutated
 * the same JE/advance namespace. Isolation is the root-cause fix (advisory locks only serialized
 * COA-role seeds; they did not cover the poster's separate withCurrentUser connection).
 *
 * Seeds the full poster COA role set on that company (factoring_advance_liability /
 * factor_reserve_held / factor_fee_expense / factoring_recoursed_ar / default_interest_expense /
 * ar_control / cash_clearing) plus an owner Faro FARO_FULL_RECOURSE_V1 binding — no migration change.
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
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../../lib/pg-connection-options.js";
import {
  createIsolatedOperatingCompany,
  deactivateIsolatedOperatingCompany,
  type IsolatedOperatingCompany,
} from "../../../../test-helpers/isolated-company.js";
import { TEST_OWNER_USER_ID, TEST_ENCRYPTION_KEY } from "../../../../test-helpers/constants.js";
import {
  loadExactLinkedChargebackAmounts,
  postFactoringAdvanceEvent,
  postFactoringChargebackEvent,
  postFactoringCustomerPaymentEvent,
  postFactoringDefaultInterestAccrualEvent,
} from "../poster.service.js";
import {
  FARO_FULL_RECOURSE_AGREEMENT_CODE,
  requireEffectiveFaroFullRecourseAgreement,
} from "../faro-agreement-gate.js";
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

function expectPosted(
  outcome: { posted: boolean; reason?: string; journal_entry_id?: string | null },
  label: string
): asserts outcome is { posted: true; journal_entry_id?: string | null } {
  expect(outcome.posted, `${label}: posted=false reason=${outcome.reason ?? "undefined"}`).toBe(true);
}

// Kept in lockstep with scripts/verify-chain-06-factoring-ar-tieout.mjs's ASSERTIONS object, scoped here
// to just the advance ids / JE ids this suite creates on its isolated company.
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
  let isolated: IsolatedOperatingCompany;
  let companyId: string;
  const suffix = randomUUID().slice(0, 6);
  /** Faro factor vendor bound to this suite's isolated TRANSP-prefixed company. */
  const vendorId = randomUUID();
  let seededFaroAgreementId: string | null = null;
  let seededFaroProfileId: string | null = null;
  const customerId = randomUUID();
  const invoiceIds: string[] = [];
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

  async function seedAdvance(opts: {
    invoiceTotalCents: number;
    advanceCents: number;
    reserveCents: number;
    feeCents: number;
    /** When true, seed a linked unpaid invoice so exact recoursed A/R is defined (full-recourse gate). */
    withLinkedInvoice?: boolean;
    /** Fixed Purchase Date (advanced_at). Defaults to now(). Used by the default-interest day-index tests
     *  so the accrual day math is deterministic and lands in the past. */
    advancedAtIso?: string;
  }): Promise<{ id: string; displayId: string }> {
    const id = randomUUID();
    const displayId = `T06-ADV-${suffix}-${advanceIds.length + 1}`;
    await bypass(async () => {
      await db.query(
        `INSERT INTO accounting.factoring_advances
           (id, operating_company_id, factoring_company_vendor_id, display_id, status,
            invoice_total_cents, advance_rate_pct, advance_amount_cents, reserve_pct, reserve_amount_cents,
            factor_fee_pct, factor_fee_cents, advanced_at)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,'advanced',$5,90,$6,8,$7,2,$8,COALESCE($9::timestamptz, now()))`,
        [id, companyId, vendorId, displayId, opts.invoiceTotalCents, opts.advanceCents, opts.reserveCents, opts.feeCents, opts.advancedAtIso ?? null]
      );
      if (opts.withLinkedInvoice) {
        const invId = randomUUID();
        // invoices_display_id_check: ^INV-[0-9]{4}-[0-9]{5}$ — must be unique per opco (shared CI company).
        const invKey = parseInt(invId.replace(/\D/g, "").slice(0, 9) || "1", 10);
        const invDisplay = `INV-${String(1000 + (invKey % 8000)).padStart(4, "0")}-${String(invKey % 100000).padStart(5, "0")}`;
        await db.query(
          `INSERT INTO accounting.invoices
             (id, operating_company_id, customer_id, display_id, issue_date, due_date,
              subtotal_cents, tax_cents, total_cents, status, factoring_advance_id, factoring_status)
           VALUES ($1::uuid,$2::uuid,$3::uuid,$4,CURRENT_DATE,CURRENT_DATE,$5,0,$5,'factored',$6::uuid,'advanced')`,
          [invId, companyId, customerId, invDisplay, opts.invoiceTotalCents, id]
        );
        invoiceIds.push(invId);
      }
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

  /** The single invoice linked to an advance (F1 uses withLinkedInvoice ⇒ exactly one). */
  async function readAdvanceInvoicePaid(advanceId: string): Promise<{ paid: number; status: string }> {
    const rows = await scopedRead<{ amount_paid_cents: string | null; status: string }>(
      `SELECT amount_paid_cents, status FROM accounting.invoices
        WHERE factoring_advance_id = $1::uuid AND operating_company_id = $2::uuid
        ORDER BY created_at ASC LIMIT 1`,
      [advanceId, companyId]
    );
    const row = rows[0];
    if (!row) throw new Error(`no linked invoice for advance ${advanceId}`);
    return { paid: Number(row.amount_paid_cents ?? 0), status: row.status };
  }

  /** The (advance, accrual_date) default-interest accrual ledger row. */
  async function readAccrualRow(
    advanceId: string,
    accrualDate: string
  ): Promise<{ opening: number; interest: number; closing: number; dayIndex: number } | null> {
    const rows = await scopedRead<{
      opening_balance_cents: string;
      interest_cents: string;
      closing_balance_cents: string;
      day_index: number;
    }>(
      `SELECT opening_balance_cents, interest_cents, closing_balance_cents, day_index
         FROM accounting.factoring_default_interest_accruals
        WHERE factoring_advance_id = $1::uuid AND operating_company_id = $2::uuid AND accrual_date = $3::date
        LIMIT 1`,
      [advanceId, companyId, accrualDate]
    );
    const row = rows[0];
    if (!row) return null;
    return {
      opening: Number(row.opening_balance_cents),
      interest: Number(row.interest_cents),
      closing: Number(row.closing_balance_cents),
      dayIndex: Number(row.day_index),
    };
  }

  /** Seed the full poster COA role set on this suite's isolated company (never shared TRANSP). */
  async function seedPosterRoles(): Promise<void> {
    const roles: Array<{ role: string; number: string; name: string; type: string; subtype: string | null }> = [
      { role: "cash_clearing", number: `T06-CASH-${suffix}`, name: `Chain-06 Cash ${suffix}`, type: "Asset", subtype: "CashAndCashEquivalents" },
      { role: "ar_control", number: `T06-AR-${suffix}`, name: `Chain-06 A/R ${suffix}`, type: "Asset", subtype: "AccountsReceivable" },
      { role: "factor_reserve_held", number: `T06-RSV-${suffix}`, name: `Chain-06 Reserve ${suffix}`, type: "Asset", subtype: null },
      { role: "factor_fee_expense", number: `T06-FEE-${suffix}`, name: `Chain-06 Fee Exp ${suffix}`, type: "Expense", subtype: null },
      { role: "factoring_advance_liability", number: `T06-LIAB-${suffix}`, name: `Chain-06 Advance Liab ${suffix}`, type: "Liability", subtype: null },
      { role: "factoring_recoursed_ar", number: `T06-REC-${suffix}`, name: `Chain-06 Recoursed AR ${suffix}`, type: "Asset", subtype: null },
      { role: "default_interest_expense", number: `T06-DI-${suffix}`, name: `Chain-06 Default Interest ${suffix}`, type: "Expense", subtype: null },
    ];
    await bypass(async () => {
      for (const r of roles) {
        const existing = await db.query(
          `SELECT 1 FROM accounting.chart_of_accounts_roles
            WHERE operating_company_id=$1::uuid AND role=$2 AND is_active=true LIMIT 1`,
          [companyId, r.role]
        );
        if ((existing.rowCount ?? 0) > 0) continue;
        const acctId = randomUUID();
        await db.query(
          `INSERT INTO catalogs.accounts
             (id, operating_company_id, account_number, account_name, account_type, account_subtype, is_postable)
           VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,true)`,
          [acctId, companyId, r.number, r.name, r.type, r.subtype]
        );
        await db.query(
          `INSERT INTO accounting.chart_of_accounts_roles
             (operating_company_id, role, account_id, is_active, created_at, updated_at)
           VALUES ($1::uuid,$2,$3::uuid,true,now(),now())
           ON CONFLICT (operating_company_id, role) WHERE is_active DO NOTHING`,
          [companyId, r.role, acctId]
        );
      }
    });
  }

  beforeAll(async () => {
    // TRANSP prefix satisfies Faro contract entity gate (no hard-coded UUID). Unique suffix keeps
    // this suite off the shared ensureIntegrationPrerequisites() TRANSP singleton — root cause of the
    // CI deadlock on factoring_lifecycle_posting_keys under vitest pool:"forks".
    isolated = await createIsolatedOperatingCompany({
      codePrefix: "TRANSP",
      legalNamePrefix: "IH 35 TRANSPORTATION Chain06",
      label: "chain06-tieout",
    });
    companyId = isolated.companyId;
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
    await seedPosterRoles();
    await bypass(async () => {
      seededFaroAgreementId = randomUUID();
      seededFaroProfileId = randomUUID();
      await db.query(
        `INSERT INTO mdata.vendors (id, operating_company_id, vendor_name, vendor_type)
         VALUES ($1::uuid,$2::uuid,$3,'Other')`,
        [vendorId, companyId, `Chain-06 Faro Factor ${suffix}`]
      );
      await db.query(
        `INSERT INTO factoring.factor (
           id, tenant_id, name, advance_rate, fee_rate, reserve_rate, recourse_days, active
         ) VALUES ($1::uuid,$2::uuid,$3,0.9700,0.0150,0.0150,95,true)`,
        [seededFaroProfileId, companyId, `Chain-06 Faro Full Recourse ${suffix}`]
      );
      await db.query(
        `INSERT INTO factoring.canonical_factor_agreements (
           id, tenant_id, factor_profile_id, factor_vendor_id, agreement_code,
           effective_from, effective_to, is_full_recourse,
           fee_rate_tier1, fee_rate_tier2, reserve_rate,
           repurchase_term_days, grace_days, repurchase_deadline_days, default_interest_daily_rate
         ) VALUES (
           $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,
           '2024-12-02'::date,NULL,true,
           0.0150,0.0200,0.0150,
           30,5,95,0.00067000
         )`,
        [
          seededFaroAgreementId,
          companyId,
          seededFaroProfileId,
          vendorId,
          FARO_FULL_RECOURSE_AGREEMENT_CODE,
        ]
      );
      const seededOk = await requireEffectiveFaroFullRecourseAgreement(db, companyId);
      if (!seededOk.ok || seededOk.vendorId !== vendorId) {
        throw new Error(
          `chain-06 Faro seed failed: reason=${"reason" in seededOk ? seededOk.reason : "unknown"} vendor=${"vendorId" in seededOk ? seededOk.vendorId : null}`
        );
      }
      await db.query(
        `INSERT INTO mdata.customers (id, operating_company_id, customer_name, factoring_company_vendor_id)
         VALUES ($1::uuid,$2::uuid,$3,$4::uuid)`,
        [customerId, companyId, `Chain-06 Test Customer ${suffix}`, vendorId]
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

  afterAll(async () => {
    if (!db) return;
    try {
      await bypass(async () => {
        await db.query(`DELETE FROM lib.feature_flag_overrides WHERE flag_key='FACTORING_GL_POSTING_ENABLED' AND operating_company_id=$1::uuid`, [companyId]);
        // Append-only posting_keys / DI accruals REVOKE DELETE — leave JE/advance residue on this
        // isolated company; deactivate the company namespace so it cannot poison later suites.
        await db.query(
          `UPDATE accounting.factoring_default_interest_accruals SET is_active = false, updated_at = now()
            WHERE factoring_advance_id = ANY($1::uuid[]) AND operating_company_id = $2::uuid`,
          [advanceIds, companyId]
        );
        if (seededFaroAgreementId) {
          await db.query(
            `UPDATE factoring.canonical_factor_agreements
                SET effective_to = '2024-12-01'::date
              WHERE id = $1::uuid AND tenant_id = $2::uuid`,
            [seededFaroAgreementId, companyId]
          );
        }
        if (seededFaroProfileId) {
          await db.query(`UPDATE factoring.factor SET active = false WHERE id = $1::uuid AND tenant_id = $2::uuid`, [
            seededFaroProfileId,
            companyId,
          ]);
        }
        await db.query(
          `UPDATE mdata.vendors SET deactivated_at = COALESCE(deactivated_at, now()) WHERE id = $1::uuid`,
          [vendorId]
        );
        await db.query(`DELETE FROM integrations.qbo_connections WHERE operating_company_id=$1::uuid AND realm_id=$2`, [companyId, `TEST-REALM-T06-${suffix}`]);
        if (isolated) {
          await deactivateIsolatedOperatingCompany(db, isolated);
        }
      });
    } catch {
      /* best-effort cleanup */
    }
    await db.end();
  });

  it("Leg B — a clean FUNDING-only advance never posts a line to ar_control (AR untouched at funding)", async () => {
    const { id: advanceId } = await seedAdvance({ invoiceTotalCents: 100_000, advanceCents: 90_000, reserveCents: 8_000, feeCents: 2_000 });
    const outcome = await postFactoringAdvanceEvent({ operating_company_id: companyId, factoring_advance_id: advanceId, actor_user_id: TEST_OWNER_USER_ID });
    expectPosted(outcome, "Leg B funding");
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
    expectPosted(funded, "Leg C funding→payment funding");
    const paid = await postFactoringCustomerPaymentEvent({
      operating_company_id: companyId,
      factoring_advance_id: advanceId,
      actor_user_id: TEST_OWNER_USER_ID,
      amount_cents: 75_000, // customer pays the factor the full invoice face — AR closes here
    });
    expectPosted(paid, "Leg C funding→payment payment");
    await markTerminal(advanceId, "collected");

    const rows = await scopedRead(ASSERTIONS.legC_liabilityRoundTrip([displayId]), [[displayId]]);
    expect(rows).toHaveLength(0); // liability fully round-tripped: funding credit == customer-payment debit
  });

  it("Leg C — funding -> chargeback lifecycle ALSO round-trips the liability to zero (customer never paid)", async () => {
    const { id: advanceId, displayId } = await seedAdvance({
      invoiceTotalCents: 50_000,
      advanceCents: 45_000,
      reserveCents: 4_000,
      feeCents: 1_000,
      withLinkedInvoice: true,
    });
    const funded = await postFactoringAdvanceEvent({
      operating_company_id: companyId,
      factoring_advance_id: advanceId,
      actor_user_id: TEST_OWNER_USER_ID,
    });
    expectPosted(funded, "Leg C funding→chargeback funding");
    // Full recourse only — amounts must equal exact linked outstanding liability + invoice A/R.
    const exact = await loadExactLinkedChargebackAmounts(companyId, advanceId);
    expect(exact.liability_cents).toBeGreaterThan(0);
    expect(exact.recoursed_ar_cents).toBe(50_000);
    const chargedBack = await postFactoringChargebackEvent({
      operating_company_id: companyId,
      factoring_advance_id: advanceId,
      actor_user_id: TEST_OWNER_USER_ID,
      chargeback_amount_cents: exact.liability_cents,
      default_interest_cents: 0,
      recoursed_ar_cents: exact.recoursed_ar_cents,
    });
    expectPosted(chargedBack, "Leg C funding→chargeback chargeback");
    await markTerminal(advanceId, "recourse_returned");

    const rows = await scopedRead(ASSERTIONS.legC_liabilityRoundTrip([displayId]), [[displayId]]);
    expect(rows).toHaveLength(0);
  });

  it("Leg C — CATCHES a terminal advance with NO relief event (liability left dangling — proves the guard is not a no-op)", async () => {
    const { id: advanceId, displayId } = await seedAdvance({ invoiceTotalCents: 20_000, advanceCents: 18_000, reserveCents: 1_500, feeCents: 500 });
    const funded = await postFactoringAdvanceEvent({ operating_company_id: companyId, factoring_advance_id: advanceId, actor_user_id: TEST_OWNER_USER_ID });
    expectPosted(funded, "Leg C dangling-liability funding");
    // Deliberately mark it terminal WITHOUT ever posting a customer-payment or chargeback event.
    await markTerminal(advanceId, "collected");

    const rows = await scopedRead<{ factoring_advance_id: string }>(ASSERTIONS.legC_liabilityRoundTrip([displayId]), [[displayId]]);
    expect(rows).toHaveLength(1);
    expect(rows[0].factoring_advance_id).toBe(advanceId);
  });

  // ── F1 (CPA VETO 36946df7) — partial customer payments must ACCUMULATE amount_paid_cents ────────────
  // Independent code review found the subledger relief was SETTING amount_paid_cents to the latest single
  // allocation, so a second partial payment OVERWROTE the first ($40k then $30k left the invoice showing
  // $30k paid, not $70k). The fix reads the CUMULATIVE ledger-backed customer-payment liability debits
  // (linkedCumulativeCustomerPaymentsCents) and allocates that running total. This proves it end-to-end
  // against the real poster + a live invoice row: $40k ⇒ 40k, then $30k ⇒ 70k (cumulative), still 'partial'.
  it("F1 — two partial customer payments accumulate amount_paid_cents ($40k then $30k ⇒ $70k), never overwrite", async () => {
    const { id: advanceId } = await seedAdvance({
      invoiceTotalCents: 100_000,
      advanceCents: 90_000,
      reserveCents: 8_000,
      feeCents: 2_000,
      withLinkedInvoice: true,
    });
    const funded = await postFactoringAdvanceEvent({
      operating_company_id: companyId,
      factoring_advance_id: advanceId,
      actor_user_id: TEST_OWNER_USER_ID,
    });
    expectPosted(funded, "F1 funding");

    const first = await postFactoringCustomerPaymentEvent({
      operating_company_id: companyId,
      factoring_advance_id: advanceId,
      actor_user_id: TEST_OWNER_USER_ID,
      amount_cents: 40_000,
    });
    expectPosted(first, "F1 first partial $40k");
    const afterFirst = await readAdvanceInvoicePaid(advanceId);
    expect(afterFirst.paid).toBe(40_000);
    expect(afterFirst.status).toBe("partial");

    const second = await postFactoringCustomerPaymentEvent({
      operating_company_id: companyId,
      factoring_advance_id: advanceId,
      actor_user_id: TEST_OWNER_USER_ID,
      amount_cents: 30_000,
    });
    expectPosted(second, "F1 second partial $30k");
    const afterSecond = await readAdvanceInvoicePaid(advanceId);
    // Cumulative ledger-backed paid total — NOT the latest $30k allocation overwriting the first $40k.
    expect(afterSecond.paid).toBe(70_000);
    expect(afterSecond.status).toBe("partial");
  });

  // ── F2 (CPA VETO 36946df7) — default interest compounds on the OUTSTANDING liability after payments ──
  // Independent code review found the daily default-interest base chained a stale prior-closing (or the
  // original invoice face) and ignored intervening customer-payment liability DEBITS, so interest kept
  // compounding on money the customer had already paid back. The fix recomputes each day's base as
  // Net + prior active accrued interest − customer-payment liability debits on/before the accrual date
  // (computeDefaultInterestDayBasis / customerPaymentLiabilityDebitsThroughDate). This proves it:
  //   • advance $100,000, Purchase Date 2026-01-01.
  //   • day 36 (2026-02-06): base 100,000 ⇒ interest round(100000×0.00067)=67, closing 100,067.
  //   • a $40,000 customer payment lands 2026-02-06 (liability debit).
  //   • day 37 (2026-02-07): base = 100,000 + 67 − 40,000 = 60,067 ⇒ interest round(60067×0.00067)=40.
  // The STALE/buggy behavior would compound off closing 100,067 ⇒ interest 67 (ignoring the pay-down);
  // the test asserts the day-37 opening is 60,067 and interest is 40, and explicitly that it is NOT 67.
  it("F2 — default interest base excludes intervening customer payments (day-37 interest 40, not the stale 67)", async () => {
    const advancedAtIso = "2026-01-01T12:00:00Z";
    const dayDate = (n: number): string => {
      const d = new Date(advancedAtIso);
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    };
    const day36 = dayDate(36); // 2026-02-06
    const day37 = dayDate(37); // 2026-02-07

    const { id: advanceId } = await seedAdvance({
      invoiceTotalCents: 100_000,
      advanceCents: 90_000,
      reserveCents: 8_000,
      feeCents: 2_000,
      advancedAtIso,
    });
    const funded = await postFactoringAdvanceEvent({
      operating_company_id: companyId,
      factoring_advance_id: advanceId,
      actor_user_id: TEST_OWNER_USER_ID,
    });
    expectPosted(funded, "F2 funding");

    // Day 36 — first charged day (30 term + 5 grace). No payments yet ⇒ base is the full pledged Net.
    const accr36 = await postFactoringDefaultInterestAccrualEvent({
      operating_company_id: companyId,
      factoring_advance_id: advanceId,
      actor_user_id: TEST_OWNER_USER_ID,
      accrual_date_iso: day36,
    });
    expectPosted(accr36, "F2 day-36 accrual");
    if (accr36.journal_entry_id) journalEntryIds.push(accr36.journal_entry_id);
    const row36 = await readAccrualRow(advanceId, day36);
    expect(row36, "F2 day-36 accrual row").not.toBeNull();
    expect(row36!.dayIndex).toBe(36);
    expect(row36!.opening).toBe(100_000);
    expect(row36!.interest).toBe(67); // round(100000 × 0.00067)
    expect(row36!.closing).toBe(100_067);

    // Customer pays $40,000 on day 36 — a liability DEBIT the next day's interest base must exclude.
    const paid = await postFactoringCustomerPaymentEvent({
      operating_company_id: companyId,
      factoring_advance_id: advanceId,
      actor_user_id: TEST_OWNER_USER_ID,
      amount_cents: 40_000,
      paid_at_iso: day36,
    });
    expectPosted(paid, "F2 $40k customer payment");
    if (paid.journal_entry_id) journalEntryIds.push(paid.journal_entry_id);

    // Day 37 — base = Net(100,000) + prior interest(67) − payments through day 37(40,000) = 60,067.
    const accr37 = await postFactoringDefaultInterestAccrualEvent({
      operating_company_id: companyId,
      factoring_advance_id: advanceId,
      actor_user_id: TEST_OWNER_USER_ID,
      accrual_date_iso: day37,
    });
    expectPosted(accr37, "F2 day-37 accrual");
    if (accr37.journal_entry_id) journalEntryIds.push(accr37.journal_entry_id);
    const row37 = await readAccrualRow(advanceId, day37);
    expect(row37, "F2 day-37 accrual row").not.toBeNull();
    expect(row37!.dayIndex).toBe(37);
    // The payment-adjusted base — proof interest no longer compounds on money already repaid.
    expect(row37!.opening).toBe(60_067);
    expect(row37!.interest).toBe(40); // round(60067 × 0.00067)
    expect(row37!.closing).toBe(60_107);
    // Guard against the stale-closing regression: compounding off day-36 closing (100,067) would be 67.
    expect(row37!.interest).not.toBe(67);
  });
});
