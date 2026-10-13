/**
 * SETTLEMENT PAY-RUN CLOSE — net-zero + escrow-cap + advance-recovery + flag-gate PROOF (real Postgres).
 * The money-path acceptance for the settlement pay-run (Phase 5). Runs only in CI (GITHUB_ACTIONS=true)
 * against a fully-migrated Postgres. Mirrors the harness/bootstrap of
 * accounting/settlement-posting/__tests__/settlement-bill-payment-posting.db.test.ts.
 *
 *  (1) escrow BELOW cap, flag ON  -> the pay-run JE BALANCES to the cent (sum debits == sum credits); the
 *      escrow credit lands on the driver's OWN Damage-Claim escrow LIABILITY sub-account; the un-recovered
 *      advance is marked recovered EXACTLY ONCE (recovered_in_settlement_id set); the net credits the
 *      payment-method's cash account; exactly ONE driver_finance.payrun_gl_runs anchor row.
 *  (2) escrow AT/OVER the $2,000 cap -> escrow_contribution == 0 (JE still balances).
 *  (3) flag OFF -> preview BALANCES but ZERO rows written to accounting.journal_entries/journal_entry_postings.
 *  (4) maker == checker cash-advance request is REJECTED (DB CHECK backstop); an Owner/authority request
 *      (reviewer NULL) and a distinct maker<>checker request are ALLOWED.
 *  (5) idempotent: a second flag-ON close does NOT double-post (still one JE, advance recovered once).
 */
import crypto, { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import {
  acquireGlobalAccountRoleBindingsLock,
  createIsolatedOperatingCompany,
  deactivateIsolatedOperatingCompany,
  ensureIntegrationPrerequisites,
  releaseGlobalAccountRoleBindingsLock,
  restoreGlobalAccountRoleBindings,
  restoreGlobalCoaRoleDesignations,
  saveGlobalAccountRoleBindings,
  saveGlobalCoaRoleDesignations,
  type SavedAccountRoleBinding,
  type SavedCoaRoleDesignation,
} from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID, TEST_ENCRYPTION_KEY } from "../../../test-helpers/constants.js";
import { upsertDriverAdvanceAccountLink, upsertDriverEscrowAccountLink } from "../../accounting/driver-subaccount-provision.service.js";
import { closeSettlementPayRun, SettlementPayRunError } from "../settlement-payrun-close.service.js";
import { ESCROW_CAP_CENTS } from "../escrow-resolver.service.js";
import { createJournalEntry, createJournalEntryOnClient } from "../../accounting/journal-entries.service.js";
import { accrueDriverPayAtDeliveryInClientTx } from "../driver-pay-delivery-accrual.service.js";
import { loadSettlementLoadBills } from "../settlement-ap-chain.service.js";
import { reverseSettlementForVoid } from "../void-document-callees.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

// createJournalEntry unconditionally enqueues a QBO sync job (enqueueSyncJob -> getValidAccessToken) which
// needs an authorized integrations.qbo_connections row whose access_token decrypts under ENCRYPTION_KEY.
// MUST be the shared TEST_ENCRYPTION_KEY (vitest pool:"forks" reuses a child process across files).
process.env.ENCRYPTION_KEY ??= TEST_ENCRYPTION_KEY;
function encryptTestToken(plain: string): string {
  const iv = crypto.randomBytes(12);
  const key = crypto.createHash("sha256").update(process.env.ENCRYPTION_KEY!, "utf8").digest();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${enc.toString("base64")}`;
}

// Import the real constant — a duplicated literal here silently disagreed with the service when the
// owner raised the cap to $2,500 (C2b, 2026-07-26). A test that hardcodes the value it is meant to
// verify proves nothing.
const CAP = ESCROW_CAP_CENTS;

describeIntegration("SETTLEMENT PAY-RUN CLOSE net-zero (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  const suffix = randomUUID().slice(0, 8);
  const userId = TEST_OWNER_USER_ID;
  const realm = `PAYRUN-REALM-${suffix}`;

  // shared role-binding target accounts + payment method cash account (created once)
  const acct = {
    driverPay: randomUUID(),
    insuranceRecovery: randomUUID(),
    advanceClearing: randomUUID(),
    chargebackRecovery: randomUUID(),
    reimbursementExpense: randomUUID(),
    cash: randomUUID(),
    ap: randomUUID(),
  };
  // GLOBAL catalogs.account_role_bindings UNIQUE(role_key) — share lock with settlement-bill-payment +
  // settlement-gl-posting for save → bind → tests → fail-loud restore.
  const GLOBAL_BIND_KEYS = [
    "driver_pay_expense",
    "insurance_recovery",
    "advance_recovery",
    "abandonment_chargeback_recovery",
    "reimbursement_expense",
    // 443.93: the pay-run also resolves these two — saved and restored like the rest (the company is shared).
    "ap_control",
    "operating_bank",
  ] as const;
  let priorGlobalBindings: SavedAccountRoleBinding[] = [];
  let priorCoaDesignations: SavedCoaRoleDesignation[] = [];
  let heldGlobalBindingsLock = false;
  const paymentMethodId = randomUUID();
  // per-driver escrow liability sub-accounts (grandparent -> parent -> per-driver leaf)
  const escrowGrandparent = randomUUID();
  const escrowParent = randomUUID();
  /** KILL THE SECOND SYSTEM: an opening escrow is seeded as GL (Dr this / Cr the driver's 2100 leaf), never a stored column. */
  const openingEscrowEquity = randomUUID();
  // Distinct, non-Faro (<> 1150040084) QBO ids per escrow account: uq_accounts_company_qbo_account_id forbids
  // reuse within a company, and the escrow resolver only requires a Liability that is NOT Faro (never a
  // specific id) — so each account in the Damage-Claim liability family carries its own id, as in prod.
  const escrowQbo = (tag: string) => `1150040187-${suffix}-${tag}`;

  type Scenario = { driverId: string; escrowSub: string; settlementId: string; displayId: string; advanceId?: string; liabilityId?: string };
  const unitBySettlement = new Map<string, string>();
  const trailerBySettlement = new Map<string, string>();
  const below: Scenario = { driverId: randomUUID(), escrowSub: randomUUID(), settlementId: randomUUID(), displayId: `PR-BELOW-${suffix}` };
  const atcap: Scenario = { driverId: randomUUID(), escrowSub: randomUUID(), settlementId: randomUUID(), displayId: `PR-ATCAP-${suffix}` };
  const off: Scenario = { driverId: randomUUID(), escrowSub: randomUUID(), settlementId: randomUUID(), displayId: `PR-OFF-${suffix}` };
  // GO-22 B7 — same shape as `below` (gross 3000, advance 200 outstanding), dedicated so the
  // blocking-decision tests never share close-once-per-settlement state with (1)/(1b).
  const gate: Scenario = { driverId: randomUUID(), escrowSub: randomUUID(), settlementId: randomUUID(), displayId: `PR-GATE-${suffix}` };
  const mkUser1 = randomUUID();
  const mkUser2 = randomUUID();
  // Dedicated flag actor for THIS file only. The SETTLEMENT_GL_POSTING_ENABLED override is contended on
  // the SHARED TRANSP company by concurrent sibling real-Postgres suites (settlement-gl-posting.db.test.ts
  // + settlement-bill-payment-posting.db.test.ts) under vitest pool:"forks": their setFlag DELETE+INSERTs
  // the (flag_key, operating_company_id, user_uuid IS NULL) tenant row and their afterAll deletes EVERY
  // override for operating_company_id=companyId — so a company-scoped tenant override here can be flipped
  // OFF (or deleted) in the window between our setFlag(true) and closeSettlementPayRun's flag read, making
  // the run PREVIEW instead of POST. We instead pin a USER-scoped override to this dedicated actor
  // (operating_company_id NULL, user_uuid=flagActor) and drive closeSettlementPayRun AS that actor:
  // resolveFlagEnabled checks the per-user override FIRST (beats any tenant row), the siblings never touch
  // a user_uuid-non-NULL / company-NULL row, and they read with a DIFFERENT actor (TEST_OWNER) so they
  // never fetch ours — the flag state is immune in BOTH directions (no cross-suite contamination).
  const flagActor = randomUUID();
  // LEAD 443.116 (c) — booked the real way: an UNSETTLED per-load driver bill on a load pre-linked to the settlement.
  const accrued: Scenario = { driverId: randomUUID(), escrowSub: randomUUID(), settlementId: randomUUID(), displayId: `PR-ACCRUED-${suffix}` };
  const loadBySettlement = new Map<string, string>();
  const allDrivers = [below.driverId, atcap.driverId, off.driverId, gate.driverId, accrued.driverId];

  async function bypass(fn: () => Promise<void>) {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    if (companyId) await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    try { await fn(); await db.query("COMMIT"); }
    catch (e) { await db.query("ROLLBACK").catch(() => {}); throw e; }
  }
  async function read<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    try { const r = await db.query(sql, params); await db.query("COMMIT"); return r.rows as T[]; }
    catch (e) { await db.query("ROLLBACK").catch(() => {}); throw e; }
  }
  async function setFlag(enabled: boolean) {
    // USER-scoped (not company-scoped) so concurrent sibling suites on the SAME TRANSP company cannot race
    // this override (see flagActor note above). operating_company_id is NULL for a pure per-user override
    // (matches idx_ff_override_user + setOverride()); closeSettlementPayRun reads it AS flagActor.
    await bypass(async () => {
      await db.query(
        `DELETE FROM lib.feature_flag_overrides WHERE flag_key='SETTLEMENT_GL_POSTING_ENABLED' AND user_uuid=$1::uuid`,
        [flagActor]
      );
      await db.query(
        `INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid)
         VALUES ('SETTLEMENT_GL_POSTING_ENABLED', NULL, $1::uuid, $2, $3::uuid)`,
        [flagActor, enabled, userId]
      );
      // 443.93: the net pay is a bill payment that must post its own JE (settlement-ap-chain.service.ts:357-382,
      // CASH_PAYMENT_JOURNAL_ENTRY_MISSING) — the same per-user override for BILL_PAYMENT_GL_POSTING_ENABLED, as on
      // every live entity where settlements post.
      await db.query(
        `DELETE FROM lib.feature_flag_overrides WHERE flag_key='BILL_PAYMENT_GL_POSTING_ENABLED' AND user_uuid=$1::uuid`,
        [flagActor]
      );
      await db.query(
        `INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid)
         VALUES ('BILL_PAYMENT_GL_POSTING_ENABLED', NULL, $1::uuid, true, $2::uuid)`,
        [flagActor, userId]
      );
    });
  }

  async function mkAcct(id: string, name: string, type: string, parent: string | null, qbo: string | null) {
    await db.query(
      `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, parent_account_id, qbo_account_id, is_postable)
       VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7,true)`,
      [id, companyId, `A-${id.slice(0, 8)}`, name, type, parent, qbo]
    );
  }
  async function bind(roleKey: string, accountId: string) {
    await db.query(
      `INSERT INTO catalogs.account_role_bindings (role_key, account_id, operating_company_id)
       VALUES ($1,$2::uuid,$3::uuid)
       ON CONFLICT (operating_company_id, role_key) WHERE (operating_company_id IS NOT NULL) DO UPDATE SET account_id = EXCLUDED.account_id, deactivated_at = NULL, operating_company_id = EXCLUDED.operating_company_id`,
      [roleKey, accountId, companyId]
    );
  }

  /** PRIMARY CoA-roles designation (resolver reads this first). */
  async function designate(role: string, accountId: string) {
    await db.query(
      `INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
       VALUES ($1::uuid,$2,$3::uuid,true)
       ON CONFLICT (operating_company_id, role) WHERE is_active
         DO UPDATE SET account_id = EXCLUDED.account_id, is_active = true`,
      [companyId, role, accountId]
    );
  }

  /** Seed a driver + its escrow leaf + bridge + a locked settlement (gross 3000). */
  async function seedDriverAndSettlement(s: Scenario, escrowBalanceCents: number, opts: { bookedUnsettled?: boolean } = {}) {
    await db.query(
      `INSERT INTO mdata.drivers (id, operating_company_id, first_name, last_name, phone)
       VALUES ($1::uuid,$2::uuid,'PayRun',$3,$4)`,
      [s.driverId, companyId, `D-${s.displayId}`, `+1006${randomUUID().slice(0, 7)}`]
    );
    await mkAcct(s.escrowSub, `${s.displayId} — Driver Escrow`, "Liability", escrowParent, escrowQbo(s.displayId));
    await upsertDriverEscrowAccountLink(db, { operatingCompanyId: companyId, driverId: s.driverId, coaAccountId: s.escrowSub });
    // KILL THE SECOND SYSTEM (2026-10-03): readDriverEscrowBalanceCents reads the driver's 2100-00-nnn GL
    // (driver_finance.v_driver_escrow_balance) and accounting.escrow_accounts.balance_cents no longer exists — so the
    // starting balance the cap-check scenarios assert is seeded AS GL: Dr opening equity / Cr the driver's escrow leaf.
    if (escrowBalanceCents > 0) {
      // 443.93: posted on the fixture's OWN connection — its accounts are created in this still-open transaction and are
      // invisible to createJournalEntry's separate connection (journal_entry_postings_account_id_fkey).
      await createJournalEntryOnClient(
        db as never,
        {
          operating_company_id: companyId,
          entry_date: new Date().toISOString().slice(0, 10),
          memo: `TEST DATA — opening driver escrow ${s.displayId}`,
          source: "manual",
          postings: [
            { account_id: openingEscrowEquity, debit_or_credit: "debit", amount_cents: escrowBalanceCents, description: "TEST DATA — opening escrow" },
            { account_id: s.escrowSub, debit_or_credit: "credit", amount_cents: escrowBalanceCents, description: "TEST DATA — opening escrow" },
          ],
        } as never,
        { userId, role: "Owner" }
      );
    }
    // KILL THE SECOND SYSTEM tables 2-5: escrow_balances is an identity row only (no stored amounts) — the summary is
    // driver_finance.v_escrow_balances over the GL seeded above.
    await db.query(
      `INSERT INTO driver_finance.escrow_balances (operating_company_id, driver_id)
       VALUES ($1::uuid,$2::uuid)
       ON CONFLICT (operating_company_id, driver_id) DO NOTHING`,
      [companyId, s.driverId]
    );
    // 443.93: a 'week_calendar' settlement — the model whose escrow contribution the CLOSE computes against the cap
    // (settlement-payrun-close.service.ts:735-747 computeCappedEscrowContributionCents). A 'load_bookended' one sums the
    // escrow lines it accrued per load instead (the cap is applied at accrual), so it could not prove the cap here.
    await db.query(
      `INSERT INTO driver_finance.driver_settlements
         (id, operating_company_id, display_id, driver_id, period_start, period_end, status, locked_at, gross_pay, deductions_total, reimbursements_total, net_pay, settlement_model)
       VALUES ($1::uuid,$2::uuid,$3,$4::uuid,CURRENT_DATE-7,CURRENT_DATE,'locked',now(),3000,0,0,0,'week_calendar')`,
      [s.settlementId, companyId, s.displayId, s.driverId]
    );
    // 443.93: driver pay is A/P to the driver's own vendor (mdata.vendors.driver_id) — the pay-run refuses without it.
    await db.query(
      `INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type, driver_id)
       VALUES ($1::uuid, $2, 'driver', $3::uuid)`,
      [companyId, `PayRun driver ${s.displayId}`, s.driverId]);
    // 443.93: a settlement is load-bookended — the pay-run refuses one with no earnings line on a real load
    // (settlement-payrun-close.service.ts:640-661 SETTLEMENT_HAS_NO_LOAD_ACTIVITY). The fixture gives it the delivered load
    // and the 3000.00 earnings line on it that the Creator writes (gross unchanged).
    const custId = randomUUID();
    const loadId = randomUUID();
    const loadNumber = String(800000000 + Math.floor(Math.random() * 90000000));
    await db.query(`INSERT INTO mdata.customers (id, operating_company_id, customer_name) VALUES ($1::uuid,$2::uuid,$3)`,
      [custId, companyId, `PayRun customer ${s.displayId}`]);
    // 443.101 (P38 Wave-A) — the load runs on a unit its company owns, so the per-load A/P bill must carry that unit.
    const unitId = randomUUID();
    await db.query(
      `INSERT INTO mdata.units (id, owner_company_id, unit_number, vin, is_sample_data) VALUES ($1::uuid,$2::uuid,$3,$4,true)`,
      [unitId, companyId, `PRU${loadNumber.slice(-6)}`, `1PRU${loadNumber}`.slice(0, 17).padEnd(17, "0")]);
    unitBySettlement.set(s.settlementId, unitId);
    await db.query(
      `INSERT INTO mdata.loads (id, operating_company_id, load_number, customer_id, status, rate_total_cents, dispatcher_user_id, load_trailer_equipment_id, assigned_unit_id)
       VALUES ($1::uuid,$2::uuid,$3,$4::uuid,'delivered_pending_docs',300000,$5::uuid,(SELECT id FROM catalogs.load_trailer_equipment WHERE operating_company_id = $2::uuid AND code = 'DRY_VAN' LIMIT 1),$6::uuid)`,
      [loadId, companyId, loadNumber, custId, userId, unitId]);
    loadBySettlement.set(s.settlementId, loadId);
    if (opts.bookedUnsettled) {
      await db.query(`UPDATE mdata.loads SET presettlement_link_id = $2::uuid WHERE id = $1::uuid`, [loadId, s.settlementId]);
    }
    // 443.105 item 1 — the load's assignment records the company trailer it rides, so the per-load A/P bill carries it.
    const trailerId = randomUUID();
    await db.query(
      `INSERT INTO mdata.equipment (id, equipment_number, equipment_type, owner_company_id, is_sample_data) VALUES ($1::uuid,$2,'DryVan',$3::uuid,true)`,
      [trailerId, `PRT${loadNumber.slice(-6)}`, companyId]);
    await db.query(
      `INSERT INTO dispatch.load_assignment_history (operating_company_id, load_id, assignment_method, assigned_by_user_id, new_trailer_id)
       VALUES ($1::uuid,$2::uuid,'inline_quicksave_trailer',$3::uuid,$4::uuid)`,
      [companyId, loadId, userId, trailerId]);
    trailerBySettlement.set(s.settlementId, trailerId);
    // ...and its per-load driver bill (numbered as the load), settled in this settlement — a settlement pays loads.
    await db.query(
      `INSERT INTO driver_finance.driver_bills (id, operating_company_id, load_id, load_number, bill_number, driver_id, gross_amount_cents, status, settled_in_settlement_id)
       VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$4,$5::uuid,300000,'open',$6::uuid)`,
      [randomUUID(), companyId, loadId, loadNumber, s.driverId, opts.bookedUnsettled ? null : s.settlementId]);
    await db.query(
      `INSERT INTO driver_finance.settlement_lines (settlement_id, line_type, description, amount, load_id, is_active)
       VALUES ($1::uuid,'earnings','linehaul earnings',3000.00,$2::uuid,true)`,
      [s.settlementId, loadId]);
    // a plain 'insurance' deduction (400.00) -> insurance_recovery role
    await db.query(
      `INSERT INTO driver_finance.driver_settlement_deductions
         (operating_company_id, driver_id, deduction_type, amount_cents, reason, applied_to_settlement_id, created_by_user_id)
       VALUES ($1::uuid,$2::uuid,'insurance',$3,'insurance recovery',$4::uuid,$5::uuid)`,
      [companyId, s.driverId, 40000, s.settlementId, userId]
    );
    // an abandonment chargeback line (100.00)
    await db.query(
      `INSERT INTO driver_finance.settlement_lines (settlement_id, line_type, description, amount)
       VALUES ($1::uuid,'abandonment_chargeback','abandonment chargeback',-100.00)`,
      [s.settlementId]
    );
    // an un-recovered outstanding advance (200.00) + its liability parent
    s.liabilityId = randomUUID();
    s.advanceId = randomUUID();
    await db.query(
      `INSERT INTO driver_finance.driver_liabilities (id, operating_company_id, driver_id, type, source_description, original_amount, current_balance)
       VALUES ($1::uuid,$2::uuid,$3::uuid,'advance','pay-run advance',200.00,200.00)`,
      [s.liabilityId, companyId, s.driverId]
    );
    await db.query(
      `INSERT INTO driver_finance.driver_advances
         (id, operating_company_id, display_id, driver_id, liability_id, amount, purpose, disbursement_method, disbursement_status, recipient_type, created_by_user_id, status, outstanding_balance)
       VALUES ($1::uuid,$2::uuid,$3,$4::uuid,$5::uuid,200.00,'fuel','ach','disbursed','driver',$6::uuid,'outstanding',200.00)`,
      [s.advanceId, companyId, `ADV-${s.displayId}`, s.driverId, s.liabilityId, userId]
    );
    // 443.93: an advance is outstanding in the GL, not on its row — driver_finance.v_driver_advance_balances reads the
    // 'driver_advance' disbursement posting on the driver's own advance sub-account (a child of the advance_recovery
    // account). The fixture writes what the disbursement engine writes: the sub-account + its link + Dr sub / Cr cash.
    const advanceSub = randomUUID();
    await mkAcct(advanceSub, `${s.displayId} — Driver Advance`, "Asset", acct.advanceClearing, null);
    await upsertDriverAdvanceAccountLink(db as never, { operatingCompanyId: companyId, driverId: s.driverId, coaAccountId: advanceSub, actorUserId: userId });
    await createJournalEntryOnClient(
      db as never,
      {
        operating_company_id: companyId,
        entry_date: new Date().toISOString().slice(0, 10),
        memo: `TEST DATA — advance disbursement ${s.displayId}`,
        source: "auto",
        postings: [
          { account_id: advanceSub, debit_or_credit: "debit", amount_cents: 20000, description: "advance disbursed", source_transaction_type: "driver_advance", source_transaction_id: s.advanceId },
          { account_id: acct.cash, debit_or_credit: "credit", amount_cents: 20000, description: "advance disbursed", source_transaction_type: "driver_advance", source_transaction_id: s.advanceId },
        ],
      } as never,
      { userId, role: "Owner" }
    );
  }

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    // 443.99: this suite designates ap_control (443.93) — a per-company singleton. On the SHARED TRANSP company a
    // sibling fork's ap_control DO UPDATE races it (the cash/CC bill-payment flake), so the suite owns its own
    // company (verify-shared-coa-role-tests-serialized). The GLOBAL bindings lock + restore below still apply.
    companyId = (await createIsolatedOperatingCompany({ codePrefix: "PRC", legalNamePrefix: "PayRun Close" })).companyId;
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
    await acquireGlobalAccountRoleBindingsLock(db);
    heldGlobalBindingsLock = true;
    await bypass(async () => {
      // 443.93: identity.guard_role_escalation (202613312000) admits a fixture Owner only through its documented seed path.
      await db.query("SET LOCAL app.allow_owner_bootstrap = '1'");
      await db.query(
        `INSERT INTO identity.users (id, email, role, preferred_language) VALUES
           ($1::uuid,$2,'Owner','en'),($3::uuid,$4,'Dispatcher','en'),($5::uuid,$6,'Accountant','en'),
           ($7::uuid,$8,'Owner','en')
         ON CONFLICT (id) DO NOTHING`,
        [userId, `pr-owner-${suffix}@test.local`, mkUser1, `pr-mk-${suffix}@test.local`, mkUser2, `pr-ck-${suffix}@test.local`, flagActor, `pr-flag-${suffix}@test.local`]
      );
      // flagActor is the dedicated actor closeSettlementPayRun runs as (its per-user posting-flag override is
      // immune to sibling contamination — see note above). Grant it TRANSP access to mirror production Owners.
      await db.query(
        `INSERT INTO org.user_company_access (user_id, company_id) VALUES ($1::uuid,$2::uuid) ON CONFLICT (user_id, company_id) DO NOTHING`,
        [flagActor, companyId]
      );
      // shared role-target accounts
      await mkAcct(acct.driverPay, `Driver Pay Expense ${suffix}`, "Expense", null, null);
      await mkAcct(acct.insuranceRecovery, `Insurance Recovery ${suffix}`, "Liability", null, null);
      await mkAcct(acct.advanceClearing, `Advance Clearing ${suffix}`, "Asset", null, null);
      await mkAcct(acct.chargebackRecovery, `Chargeback Recovery ${suffix}`, "Income", null, null);
      await mkAcct(acct.reimbursementExpense, `Reimbursement Expense ${suffix}`, "Expense", null, null);
      await mkAcct(acct.cash, `Operating Cash ${suffix}`, "Asset", null, null);
      await mkAcct(acct.ap, `Accounts Payable ${suffix}`, "Liability", null, null);
      await mkAcct(escrowGrandparent, `Damage Claim Escrow ${suffix}`, "Liability", null, escrowQbo("GP"));
      await mkAcct(escrowParent, `Driver Escrow ${suffix}`, "Liability", escrowGrandparent, escrowQbo("P"));
      await mkAcct(openingEscrowEquity, `Opening Escrow Equity ${suffix}`, "Equity", null, null);
      priorGlobalBindings = await saveGlobalAccountRoleBindings(db, GLOBAL_BIND_KEYS);
      // Snapshot SHARED-company PRIMARY designations BEFORE we overwrite them (sibling suites
      // need ap_control / uncategorized_expense intact — never wipe the whole company).
      priorCoaDesignations = await saveGlobalCoaRoleDesignations(db, companyId, GLOBAL_BIND_KEYS);
      // Legacy bindings kept as resolver FALLBACK tier (Rule 07) — prove primary path by also designating.
      await bind("driver_pay_expense", acct.driverPay);
      await bind("insurance_recovery", acct.insuranceRecovery);
      await bind("advance_recovery", acct.advanceClearing);
      await bind("abandonment_chargeback_recovery", acct.chargebackRecovery);
      await bind("reimbursement_expense", acct.reimbursementExpense);
      // PRIMARY designations — the tier closeSettlementPayRun resolves first after the CoA-resolver repoint.
      await designate("driver_pay_expense", acct.driverPay);
      await designate("insurance_recovery", acct.insuranceRecovery);
      await designate("advance_recovery", acct.advanceClearing);
      await designate("abandonment_chargeback_recovery", acct.chargebackRecovery);
      await designate("reimbursement_expense", acct.reimbursementExpense);
      // owner-editable payment method pinned to the cash account
      await db.query(
        // canonical 0152 table is code-keyed (code + display_name), not `name`.
        `INSERT INTO catalogs.payment_methods (id, operating_company_id, code, display_name, gl_account_id, is_active)
         VALUES ($1::uuid,$2::uuid,$3,$4,$5::uuid,true)`,
        [paymentMethodId, companyId, `ACH_${suffix}`, `ACH ${suffix}`, acct.cash]
      );
      // 443.93: the net pays out of the operating bank — an active bank account on the cash ledger, bound to the
      // operating_bank role (the payout refuses without one).
      await db.query(
        `INSERT INTO banking.bank_accounts (operating_company_id, account_name, account_class, is_active, ledger_account_id, sync_status)
         VALUES ($1::uuid, $2, 'depository', true, $3::uuid, 'active')`,
        [companyId, `PayRun Operating ${suffix}`, acct.cash]
      );
      await designate("operating_bank", acct.cash);
      await designate("ap_control", acct.ap);
      await db.query(
        `INSERT INTO integrations.qbo_connections
           (operating_company_id, realm_id, access_token, refresh_token, access_token_expires_at, refresh_token_expires_at, authorized_by_user_id)
         VALUES ($1::uuid,$2,$3,$4, now()+interval '1 year', now()+interval '1 year', $5::uuid)
         ON CONFLICT (operating_company_id, realm_id) WHERE revoked_at IS NULL DO NOTHING`,
        [companyId, realm, encryptTestToken("t"), encryptTestToken("r"), userId]
      );
      await seedDriverAndSettlement(below, 50_000); // below cap -> contributes 25000
      await seedDriverAndSettlement(atcap, CAP);    // at cap    -> contributes 0
      await seedDriverAndSettlement(off, 50_000);   // flag-off preview
      await seedDriverAndSettlement(gate, 50_000);  // GO-22 B7 blocking-decision gate
      await seedDriverAndSettlement(accrued, 50_000, { bookedUnsettled: true }); // 443.116 — pay posted at delivery
      // ACCT-F5613 — an active reimbursement line (50.00) plus an INACTIVE one (999.00, must be
      // excluded by loadReimbursementsCents' is_active filter, same as the existing chargeback filter).
      await db.query(
        `INSERT INTO driver_finance.settlement_lines (settlement_id, line_type, description, amount, is_active)
         VALUES ($1::uuid,'reimbursement','tolls/scales reimbursement',50.00,true),
                ($1::uuid,'reimbursement','voided duplicate reimbursement',999.00,false)`,
        [off.settlementId]
      );
    });
  });

  afterAll(async () => {
    if (!db) return;
    let restoreError: unknown;
    const sids = [below.settlementId, atcap.settlementId, off.settlementId, gate.settlementId];
    // Fixture cleanup in its own txn — a failed DELETE must not abort GLOBAL restore.
    try {
      await bypass(async () => {
        await db.query(`DELETE FROM driver_finance.payrun_gl_runs WHERE settlement_id = ANY($1::uuid[])`, [sids]);
        // Drop posting→link FKs before deleting journal_entry_postings.
        await db.query(
          `DELETE FROM accounting.transaction_source_links tsl
            USING accounting.journal_entry_postings jep
            JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
           WHERE tsl.journal_entry_posting_id = jep.id
             AND je.operating_company_id = $1::uuid
             AND je.memo LIKE $2`,
          [companyId, `Settlement PR-%${suffix}%`]
        );
        await db.query(`DELETE FROM accounting.journal_entry_postings jep USING accounting.journal_entries je
                          WHERE je.id=jep.journal_entry_uuid AND je.operating_company_id=$1::uuid AND je.memo LIKE $2`, [companyId, `Settlement PR-%${suffix}%`]);
        await db.query(`DELETE FROM accounting.journal_entries WHERE operating_company_id=$1::uuid AND memo LIKE $2`, [companyId, `Settlement PR-%${suffix}%`]);
        await db.query(`DELETE FROM driver_finance.settlement_lines WHERE settlement_id = ANY($1::uuid[])`, [sids]);
        await db.query(`DELETE FROM driver_finance.driver_settlement_deductions WHERE applied_to_settlement_id = ANY($1::uuid[])`, [sids]);
        await db.query(`DELETE FROM driver_finance.driver_advances WHERE driver_id = ANY($1::uuid[])`, [allDrivers]);
        await db.query(`DELETE FROM driver_finance.driver_liabilities WHERE driver_id = ANY($1::uuid[])`, [allDrivers]);
        await db.query(`DELETE FROM driver_finance.escrow_ledger WHERE driver_id = ANY($1::uuid[])`, [allDrivers]);
        await db.query(`DELETE FROM driver_finance.escrow_balances WHERE driver_id = ANY($1::uuid[])`, [allDrivers]);
        await db.query(`DELETE FROM driver_finance.cash_advance_requests WHERE driver_id = ANY($1::uuid[])`, [allDrivers]);
        await db.query(`DELETE FROM driver_finance.driver_settlements WHERE id = ANY($1::uuid[])`, [sids]);
        await db.query(`DELETE FROM accounting.escrow_accounts WHERE holder_id = ANY($1::uuid[])`, [allDrivers]);
        await db.query(`DELETE FROM catalogs.payment_methods WHERE id=$1::uuid`, [paymentMethodId]);
        await db.query(`DELETE FROM mdata.drivers WHERE id = ANY($1::uuid[])`, [allDrivers]);
        await db.query(`DELETE FROM lib.feature_flag_overrides WHERE flag_key='SETTLEMENT_GL_POSTING_ENABLED' AND (operating_company_id=$1::uuid OR user_uuid=$2::uuid)`, [companyId, flagActor]);
        await db.query(`DELETE FROM lib.feature_flag_overrides WHERE flag_key='BILL_PAYMENT_GL_POSTING_ENABLED' AND user_uuid=$1::uuid`, [flagActor]);
        await db.query(`DELETE FROM integrations.qbo_connections WHERE operating_company_id=$1::uuid AND realm_id=$2`, [companyId, realm]);
      });
    } catch (fixtureCleanupErr) {
      void fixtureCleanupErr;
    }

    try {
      // Restore GLOBAL legacy bindings + PRIMARY CoA designations BEFORE deleting fixture accounts (FK).
      // FAIL-LOUD — own txn. Never wipe all chart_of_accounts_roles for the shared company
      // (that deleted ap_control and flaked bulk-post-as-bill / CI build-typecheck).
      await bypass(async () => {
        await restoreGlobalAccountRoleBindings(db, GLOBAL_BIND_KEYS, priorGlobalBindings, companyId);
        await restoreGlobalCoaRoleDesignations(db, companyId, GLOBAL_BIND_KEYS, priorCoaDesignations);
      });
    } catch (err) {
      restoreError = err;
    }

    try {
      await bypass(async () => {
        await db.query(`DELETE FROM catalogs.accounts WHERE id = ANY($1::uuid[])`, [
          [below.escrowSub, atcap.escrowSub, off.escrowSub, gate.escrowSub, escrowParent, escrowGrandparent, acct.driverPay, acct.insuranceRecovery, acct.advanceClearing, acct.chargebackRecovery, acct.reimbursementExpense, acct.cash],
        ]);
      });
    } catch (postRestoreCleanupErr) {
      void postRestoreCleanupErr;
    }

    try {
      await bypass(async () => {
        await deactivateIsolatedOperatingCompany(db, companyId);
      });
    } catch (deactivateErr) {
      restoreError ??= deactivateErr;
    }

    if (heldGlobalBindingsLock) {
      try {
        await releaseGlobalAccountRoleBindingsLock(db);
      } catch (unlockErr) {
        restoreError ??= unlockErr;
      }
      heldGlobalBindingsLock = false;
    }
    await db.end();
    if (restoreError) throw restoreError;
  });

  async function jeBalance(jeId: string): Promise<{ dr: number; cr: number }> {
    const rows = await read<{ dr: string; cr: string }>(
      `SELECT COALESCE(SUM(amount_cents) FILTER (WHERE debit_or_credit='debit'),0)::text AS dr,
              COALESCE(SUM(amount_cents) FILTER (WHERE debit_or_credit='credit'),0)::text AS cr
         FROM accounting.journal_entry_postings WHERE journal_entry_uuid=$1::uuid`,
      [jeId]
    );
    return { dr: Number(rows[0]!.dr), cr: Number(rows[0]!.cr) };
  }

  it("(1) below-cap flag-ON: JE balances to the cent; escrow->driver liability sub; advance recovered once; net->cash", async () => {
    await setFlag(true);
    const res = await closeSettlementPayRun(
      { operatingCompanyId: companyId, settlementId: below.settlementId, paymentMethodId },
      { userId: flagActor }
    );
    expect(res.result).toBe("posted");
    expect(res.journal_entry_id).toBeTruthy();
    // breakdown: gross 300000, ded 40000, chargeback 10000, advance 20000, escrow 25000, net 205000
    expect(res.breakdown.gross_cents).toBe(300000);
    expect(res.breakdown.deductions_cents).toBe(40000);
    expect(res.breakdown.chargebacks_cents).toBe(10000);
    expect(res.breakdown.advance_recoveries_cents).toBe(20000);
    expect(res.breakdown.escrow_contribution_cents).toBe(25000);
    expect(res.breakdown.net_cents).toBe(205000);

    // 443.93 — the pay-run posts the per-load A/P chain (settlement-payrun-close.service.ts:1289-1345, ROUND 326 items 2-5):
    // (a) the load's A/P bill  Dr driver pay 300000 / Cr A/P (settlement-ap-chain.service.ts:264),
    // (b) ONE application JE   Dr A/P / Cr insurance 40000 + chargeback 10000 + advance 20000 + escrow 25000 = 95000
    //     (settlement-ap-chain.service.ts:347) — res.journal_entry_id (settlement-payrun-close.service.ts:1347),
    // (c) the net as a bill payment  Dr A/P 205000 / Cr bank (settlement-ap-chain.service.ts:372).
    // Each JE balances to the cent and A/P for the settlement nets to zero.
    const bal = await jeBalance(res.journal_entry_id!);
    expect(bal.dr).toBe(bal.cr);
    expect(bal.dr).toBe(95000);
    const chainRows = await read<{ bill_je: string | null; cash_je: string | null }>(
      `SELECT bill_journal_entry_id::text AS bill_je, cash_journal_entry_id::text AS cash_je
         FROM driver_finance.driver_settlement_gl_bills WHERE settlement_id = $1::uuid`,
      [below.settlementId]
    );
    expect(chainRows.length).toBe(1); // one load -> one A/P bill
    // 443.101 (P38 Wave-A) — the per-load driver-pay bill links to the load's unit as well as its vendor and load.
    const billUnit = await read<{ unit_id: string | null; trailer_id: string | null; line_equipment: string | null; vendor: string | null; line_load: string | null }>(
      `SELECT b.unit_id::text AS unit_id, b.trailer_id::text AS trailer_id, b.mdata_vendor_id::text AS vendor,
              (SELECT bl.equipment_id::text FROM accounting.bill_lines bl WHERE bl.bill_id = b.id AND bl.load_id IS NOT NULL LIMIT 1) AS line_equipment,
              (SELECT bl.load_id::text FROM accounting.bill_lines bl WHERE bl.bill_id = b.id AND bl.load_id IS NOT NULL LIMIT 1) AS line_load
         FROM driver_finance.driver_settlement_gl_bills g JOIN accounting.bills b ON b.id = g.accounting_bill_id
        WHERE g.settlement_id = $1::uuid`,
      [below.settlementId]
    );
    expect(billUnit[0]!.unit_id).toBe(unitBySettlement.get(below.settlementId));
    // 443.105 item 1 — and to the load's trailer (header + its load line).
    expect(billUnit[0]!.trailer_id).toBe(trailerBySettlement.get(below.settlementId));
    expect(billUnit[0]!.line_equipment).toBe(trailerBySettlement.get(below.settlementId));
    expect(billUnit[0]!.vendor).toBeTruthy();
    expect(billUnit[0]!.line_load).toBeTruthy();
    const billBal = await jeBalance(chainRows[0]!.bill_je!);
    expect(billBal.dr).toBe(billBal.cr);
    expect(billBal.dr).toBe(300000);
    const pay = await read<{ total: string }>(
      `SELECT COALESCE(SUM(amount_cents),0)::text AS total FROM accounting.journal_entry_postings
        WHERE journal_entry_uuid=$1::uuid AND debit_or_credit='debit' AND account_id=$2::uuid`,
      [chainRows[0]!.bill_je, acct.driverPay]
    );
    expect(Number(pay[0]!.total)).toBe(300000);
    const apNet = await read<{ v: string }>(
      `SELECT COALESCE(SUM(CASE WHEN debit_or_credit='credit' THEN amount_cents ELSE -amount_cents END),0)::text AS v
         FROM accounting.journal_entry_postings
        WHERE journal_entry_uuid = ANY($1::uuid[]) AND account_id=$2::uuid`,
      [[chainRows[0]!.bill_je, res.journal_entry_id, chainRows[0]!.cash_je], acct.ap]
    );
    expect(Number(apNet[0]!.v)).toBe(0);
    // 443.102 — every A/P leg the settlement writes names the bill's vendor, so the A/P sub-ledger reads per vendor
    // from the line itself (vendor_balances = A/P control per vendor, to the cent).
    const apLegs = await read<{ entity_type: string | null; entity_uuid: string | null }>(
      `SELECT entity_type, entity_uuid::text AS entity_uuid FROM accounting.journal_entry_postings
        WHERE journal_entry_uuid = $1::uuid AND account_id = $2::uuid AND debit_or_credit = 'debit'`,
      [res.journal_entry_id, acct.ap]
    );
    expect(apLegs.length).toBeGreaterThan(0);
    for (const leg of apLegs) {
      expect(leg.entity_type).toBe("vendor");
      expect(leg.entity_uuid).toBe(billUnit[0]!.vendor);
    }

    // escrow credit lands on the driver's OWN Damage-Claim liability sub-account (parent set, Liability)
    const esc = await read<{ account_id: string; amount_cents: string; account_type: string; parent: string | null }>(
      `SELECT jep.account_id::text, jep.amount_cents::text, a.account_type, a.parent_account_id::text AS parent
         FROM accounting.journal_entry_postings jep JOIN catalogs.accounts a ON a.id = jep.account_id
        WHERE jep.journal_entry_uuid=$1::uuid AND jep.debit_or_credit='credit' AND jep.account_id=$2::uuid`,
      [res.journal_entry_id, below.escrowSub]
    );
    expect(esc.length).toBe(1);
    expect(Number(esc[0]!.amount_cents)).toBe(25000);
    expect(esc[0]!.account_type).toBe("Liability");
    expect(esc[0]!.parent).toBeTruthy();

    // net credits the operating bank's cash account — on the net bill payment's JE (settlement-ap-chain.service.ts:372)
    const cash = await read<{ total: string }>(
      `SELECT COALESCE(SUM(amount_cents),0)::text AS total FROM accounting.journal_entry_postings
        WHERE journal_entry_uuid=$1::uuid AND debit_or_credit='credit' AND account_id=$2::uuid`,
      [chainRows[0]!.cash_je, acct.cash]
    );
    expect(Number(cash[0]!.total)).toBe(205000);

    // advance marked recovered EXACTLY ONCE
    expect(res.recovered_advance_ids).toEqual([below.advanceId]);
    const adv = await read<{ recovered: string | null; status: string }>(
      `SELECT recovered_in_settlement_id::text AS recovered, status FROM driver_finance.driver_advances WHERE id=$1::uuid`,
      [below.advanceId]
    );
    expect(adv[0]!.recovered).toBe(below.settlementId);
    expect(adv[0]!.status).toBe("recovered");

    // exactly ONE payrun_gl_runs anchor
    const runs = await read<{ c: string }>(`SELECT count(*)::text AS c FROM driver_finance.payrun_gl_runs WHERE settlement_id=$1::uuid`, [below.settlementId]);
    expect(Number(runs[0]!.c)).toBe(1);

    // SETL-POST-01 — a real post through this poster stamps the header's posted_at/posted_by_user_id
    // (migration 202607520000 added the columns; this is the writer-repoint that never landed until now).
    const posted = await read<{ posted_at: string | null; posted_by_user_id: string | null }>(
      `SELECT posted_at::text, posted_by_user_id::text FROM driver_finance.driver_settlements WHERE id=$1::uuid`,
      [below.settlementId]
    );
    expect(posted[0]!.posted_at).toBeTruthy();
    expect(posted[0]!.posted_by_user_id).toBe(flagActor);
  });

  it("(1b) idempotent: a second flag-ON close does not double-post (one JE, advance recovered once)", async () => {
    await setFlag(true);
    const jeCount = async () => Number((await read<{ c: string }>(
      `SELECT count(*)::text AS c FROM accounting.journal_entries WHERE operating_company_id=$1::uuid AND memo LIKE $2`,
      [companyId, `Settlement ${below.displayId}%`]
    ))[0]!.c);
    const jesBefore = await jeCount();
    const res2 = await closeSettlementPayRun(
      { operatingCompanyId: companyId, settlementId: below.settlementId, paymentMethodId },
      { userId: flagActor }
    );
    expect(res2.result).toBe("posted");
    // no new advances recovered on the re-run (already recovered)
    expect(res2.recovered_advance_ids).toEqual([]);
    const runs = await read<{ c: string }>(`SELECT count(*)::text AS c FROM driver_finance.payrun_gl_runs WHERE settlement_id=$1::uuid`, [below.settlementId]);
    expect(Number(runs[0]!.c)).toBe(1);
    // 443.93: the per-load chain writes several JEs (bill, application, net payment — settlement-ap-chain.service.ts:264/
    // 347/372); the retry adds NONE (idempotent existing-run path, settlement-payrun-close.service.ts:1113) and the A/P bill
    // set stays one per load.
    expect(jesBefore).toBeGreaterThan(0);
    expect(await jeCount()).toBe(jesBefore);
    const bills = await read<{ c: string }>(`SELECT count(*)::text AS c FROM driver_finance.driver_settlement_gl_bills WHERE settlement_id=$1::uuid`, [below.settlementId]);
    expect(Number(bills[0]!.c)).toBe(1);
  });

  it("(2) at/over cap: escrow_contribution == 0 and the JE still balances", async () => {
    await setFlag(true);
    const res = await closeSettlementPayRun(
      { operatingCompanyId: companyId, settlementId: atcap.settlementId, paymentMethodId },
      { userId: flagActor }
    );
    expect(res.result).toBe("posted");
    expect(res.breakdown.escrow_balance_before_cents).toBe(CAP);
    expect(res.breakdown.escrow_contribution_cents).toBe(0);
    // net = 300000 - 40000 - 0 - 20000 - 10000 = 230000
    expect(res.breakdown.net_cents).toBe(230000);
    const bal = await jeBalance(res.journal_entry_id!);
    expect(bal.dr).toBe(bal.cr);
    // no escrow leg on the driver's escrow sub-account
    const esc = await read<{ c: string }>(
      `SELECT count(*)::text AS c FROM accounting.journal_entry_postings WHERE journal_entry_uuid=$1::uuid AND account_id=$2::uuid`,
      [res.journal_entry_id, atcap.escrowSub]
    );
    expect(Number(esc[0]!.c)).toBe(0);
  });

  it("(3) flag OFF: preview balances but ZERO journal entries / postings are written", async () => {
    await setFlag(false);
    const res = await closeSettlementPayRun(
      { operatingCompanyId: companyId, settlementId: off.settlementId, paymentMethodId },
      { userId: flagActor }
    );
    expect(res.result).toBe("previewed");
    expect(res.posting_enabled).toBe(false);
    expect(res.journal_entry_id).toBeNull();
    // ACCT-F5613 — the active $50.00 reimbursement is included; the INACTIVE $999.00 one is not
    // (mirrors the is_active filter already proven on chargebacks).
    expect(res.breakdown.reimbursements_cents).toBe(5000);
    expect(res.breakdown.net_cents).toBe(210000); // 300000 + 5000 - 40000 - 25000 - 20000 - 10000
    const reimbLeg = res.je_preview.find((l) => l.account_id === acct.reimbursementExpense);
    expect(reimbLeg?.debit_or_credit).toBe("debit");
    expect(reimbLeg?.amount_cents).toBe(5000);
    // preview legs balance
    const dr = res.je_preview.filter((l) => l.debit_or_credit === "debit").reduce((s, l) => s + l.amount_cents, 0);
    const cr = res.je_preview.filter((l) => l.debit_or_credit === "credit").reduce((s, l) => s + l.amount_cents, 0);
    expect(dr).toBe(cr);
    expect(dr).toBe(305000); // gross 300000 + reimbursements 5000
    // NOTHING written
    const jes = await read<{ c: string }>(
      `SELECT count(*)::text AS c FROM accounting.journal_entries WHERE operating_company_id=$1::uuid AND memo LIKE $2`,
      [companyId, `Settlement ${off.displayId}%`]
    );
    expect(Number(jes[0]!.c)).toBe(0);
    const runs = await read<{ c: string }>(`SELECT count(*)::text AS c FROM driver_finance.payrun_gl_runs WHERE settlement_id=$1::uuid`, [off.settlementId]);
    expect(Number(runs[0]!.c)).toBe(0);
    // advance NOT recovered under preview
    const adv = await read<{ recovered: string | null }>(
      `SELECT recovered_in_settlement_id::text AS recovered FROM driver_finance.driver_advances WHERE id=$1::uuid`,
      [off.advanceId]
    );
    expect(adv[0]!.recovered).toBeNull();
    // SETL-POST-01 — preview must never stamp posted_at either (flag-OFF writes NOTHING).
    const posted = await read<{ posted_at: string | null }>(
      `SELECT posted_at::text FROM driver_finance.driver_settlements WHERE id=$1::uuid`,
      [off.settlementId]
    );
    expect(posted[0]!.posted_at).toBeNull();
  });

  it("(4) maker==checker cash-advance is rejected; authority (reviewer NULL) and distinct maker<>checker allowed", async () => {
    // maker == checker -> DB CHECK (cash_advance_requests_maker_ne_checker) rejects. The raw insert must
    // supply the base-table NOT-NULL-no-default columns (display_id, submitted_via, reason) so the row
    // reaches the maker<>checker CHECK instead of tripping a not-null on display_id first (0131 base DDL).
    await expect(
      read(
        `INSERT INTO driver_finance.cash_advance_requests
           (operating_company_id, driver_id, display_id, submitted_via, reason, requested_amount_cents, submitted_by_user_id, reviewed_by_user_id)
         VALUES ($1::uuid,$2::uuid,$4,'office','maker equals checker rejection test',5000,$3::uuid,$3::uuid)`,
        [companyId, below.driverId, mkUser1, `CAR-MK-${suffix}`]
      )
    ).rejects.toThrow(/maker_ne_checker|check/i);
    // Owner/authority auto-approve leaves reviewer NULL -> allowed
    await bypass(async () => {
      await db.query(
        `INSERT INTO driver_finance.cash_advance_requests
           (operating_company_id, driver_id, display_id, submitted_via, reason, requested_amount_cents, submitted_by_user_id, reviewed_by_user_id)
         VALUES ($1::uuid,$2::uuid,$4,'office','owner authority auto-approve test',5000,$3::uuid,NULL)`,
        [companyId, below.driverId, userId, `CAR-NULL-${suffix}`]
      );
    });
    // distinct maker <> checker -> allowed
    await bypass(async () => {
      await db.query(
        `INSERT INTO driver_finance.cash_advance_requests
           (operating_company_id, driver_id, display_id, submitted_via, reason, requested_amount_cents, submitted_by_user_id, reviewed_by_user_id)
         VALUES ($1::uuid,$2::uuid,$5,'office','distinct maker and checker test',5000,$3::uuid,$4::uuid)`,
        [companyId, below.driverId, mkUser1, mkUser2, `CAR-DIST-${suffix}`]
      );
    });
    const c = await read<{ c: string }>(`SELECT count(*)::text AS c FROM driver_finance.cash_advance_requests WHERE driver_id=$1::uuid`, [below.driverId]);
    expect(Number(c[0]!.c)).toBe(2);
  });

  // ACCT-F5697 — the mutual-exclusion interlock with the OTHER settlement GL poster
  // (accounting/settlement-posting/settlement-bill-payment-posting.service.ts's
  // postSettlementBillPayment). Live-verified on prod: S-2026-0002 was posted by BOTH posters
  // (bill-payment on 2026-08-11, this pay-run close on 2026-08-21) — Cost of Labor booked twice,
  // operating bank overcredited by the full gross a second time. Real DB, real anchor-table shape
  // (not a mock) — driver_finance.driver_settlement_gl_runs + driver_settlement_gl_bills rows exactly
  // as postSettlementBillPayment's own claim would leave them (ACCT-F348's own completion signal:
  // status='posted' AND a bill_journal_entry_id actually present).
  it("(5) ACCT-F5697: refuses when driver_settlement_gl_runs already shows this settlement posted by the OTHER poster", async () => {
    const interlockDriverId = randomUUID();
    const interlockSettlementId = randomUUID();
    const interlockDisplayId = `PR-INTERLOCK-${suffix}`;
    await bypass(async () => {
      await db.query(
        `INSERT INTO mdata.drivers (id, operating_company_id, first_name, last_name, phone)
         VALUES ($1::uuid,$2::uuid,'Interlock',$3,$4)`,
        [interlockDriverId, companyId, `D-${interlockDisplayId}`, `+1007${randomUUID().slice(0, 7)}`]
      );
      await db.query(
        `INSERT INTO driver_finance.driver_settlements
           (id, operating_company_id, display_id, driver_id, period_start, period_end, status, locked_at, gross_pay, deductions_total, reimbursements_total, net_pay, settlement_model)
         VALUES ($1::uuid,$2::uuid,$3,$4::uuid,CURRENT_DATE-7,CURRENT_DATE,'locked',now(),297.60,0,0,297.60,'load_bookended')`,
        [interlockSettlementId, companyId, interlockDisplayId, interlockDriverId]
      );
      // The other poster's own full FK chain (driver_settlement_gl_bills' driver_bill_id /
      // accounting_bill_id / bill_journal_entry_id are all real FKs, not free-floating uuids) — a
      // minimal load + driver_bills + accounting.bills row, then the anchor row shaped exactly as
      // postSettlementBillPayment's own claim would leave it. The interlock query only checks
      // status/bill_journal_entry_id presence, not JE/bill content.
      const otherRunId = randomUUID();
      const otherJeId = randomUUID();
      const otherLoadId = randomUUID();
      const otherDriverBillId = randomUUID();
      const otherAccountingBillId = randomUUID();
      const otherCustomerId = randomUUID();
      await db.query(
        `INSERT INTO mdata.customers (id, operating_company_id, customer_name) VALUES ($1::uuid,$2::uuid,$3)`,
        [otherCustomerId, companyId, `ACCT-F5697 test customer ${suffix}`]
      );
      await db.query(
        `INSERT INTO mdata.loads (id, operating_company_id, load_number, customer_id, status, rate_total_cents, dispatcher_user_id, load_trailer_equipment_id)
         VALUES ($1::uuid,$2::uuid,$3,$4::uuid,'delivered_pending_docs',29760,$5::uuid,(SELECT id FROM catalogs.load_trailer_equipment WHERE operating_company_id = $2::uuid AND code = 'DRY_VAN' LIMIT 1))`,
        [otherLoadId, companyId, `L-INTERLOCK-${suffix}`, otherCustomerId, userId]
      );
      await db.query(
        `INSERT INTO driver_finance.driver_bills (id, operating_company_id, load_id, load_number, bill_number, driver_id, gross_amount_cents, status, settled_in_settlement_id)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6::uuid,29760,'open',$7::uuid)`,
        [otherDriverBillId, companyId, otherLoadId, `L-INTERLOCK-${suffix}`, `DB-INTERLOCK-${suffix}`, interlockDriverId, interlockSettlementId]
      );
      // 443.93: the close refuses a settlement with no earnings line on a real load BEFORE it reads the interlock
      // (settlement-payrun-close.service.ts:640-661) — the interlock settlement carries its load's earnings line.
      await db.query(
        `INSERT INTO driver_finance.settlement_lines (settlement_id, line_type, description, amount, load_id, is_active)
         VALUES ($1::uuid,'earnings','linehaul earnings',297.60,$2::uuid,true)`,
        [interlockSettlementId, otherLoadId]
      );
      await db.query(
        `INSERT INTO accounting.bills (id, operating_company_id, amount_cents, is_sample_data) VALUES ($1::uuid,$2::uuid,29760,true)`,
        [otherAccountingBillId, companyId]
      );
      await db.query(
        `INSERT INTO accounting.journal_entries (id, operating_company_id, entry_date, memo, status, source, is_sample_data)
         VALUES ($1::uuid,$2::uuid,CURRENT_DATE,'ACCT-F5697 test fixture — other poster','posted','auto',true)`,
        [otherJeId, companyId]
      );
      await db.query(
        `INSERT INTO driver_finance.driver_settlement_gl_runs
           (id, operating_company_id, settlement_id, driver_id, driver_vendor_id, run_key, gross_cents, deductions_cents, net_cents, status, posted_by_user_id)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,'test-vendor',$5,29760,0,29760,'posted',$6::uuid)`,
        [otherRunId, companyId, interlockSettlementId, interlockDriverId, `interlock-${suffix}`, userId]
      );
      await db.query(
        `INSERT INTO driver_finance.driver_settlement_gl_bills
           (operating_company_id, run_id, settlement_id, driver_bill_id, load_id, accounting_bill_id, bill_journal_entry_id)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::uuid)`,
        [companyId, otherRunId, interlockSettlementId, otherDriverBillId, otherLoadId, otherAccountingBillId, otherJeId]
      );
    });

    await setFlag(true);
    await expect(
      closeSettlementPayRun(
        { operatingCompanyId: companyId, settlementId: interlockSettlementId, paymentMethodId },
        { userId: flagActor }
      )
    ).rejects.toMatchObject({ code: "SETTLEMENT_ALREADY_POSTED_BY_OTHER_POSTER" });
    await expect(
      closeSettlementPayRun(
        { operatingCompanyId: companyId, settlementId: interlockSettlementId, paymentMethodId },
        { userId: flagActor }
      )
    ).rejects.toBeInstanceOf(SettlementPayRunError);

    // The whole point: refusing must mean NOTHING hit the ledger from THIS poster.
    const runs = await read<{ c: string }>(
      `SELECT count(*)::text AS c FROM driver_finance.payrun_gl_runs WHERE settlement_id=$1::uuid`,
      [interlockSettlementId]
    );
    expect(Number(runs[0]!.c)).toBe(0);
  });

  // GO-22 B7 (owner direct instruction, 2026-09-02): "If the driver has ANY outstanding loan or
  // debt... a window MUST appear and ask. IT CANNOT BE DEFERRED... the decision MUST BE
  // REGISTERED." requireLoanDecision:true is what the real payrun-close ROUTE always sets — these
  // two cases are that route's contract, proven against real Postgres, not a mock.

  it("(6) B7 blocking gate: requireLoanDecision + an outstanding advance + no decision -> refused, nothing written", async () => {
    await setFlag(true);
    await expect(
      closeSettlementPayRun(
        { operatingCompanyId: companyId, settlementId: gate.settlementId, paymentMethodId, requireLoanDecision: true },
        { userId: flagActor }
      )
    ).rejects.toMatchObject({
      code: "OUTSTANDING_LOAN_DECISION_REQUIRED",
      details: expect.objectContaining({ total_recoverable_cents: 20000 }),
    });
    // Refused before any write — same "nothing hits the ledger" proof as (5).
    const runs = await read<{ c: string }>(`SELECT count(*)::text AS c FROM driver_finance.payrun_gl_runs WHERE settlement_id=$1::uuid`, [gate.settlementId]);
    expect(Number(runs[0]!.c)).toBe(0);
    const adv = await read<{ status: string }>(`SELECT status FROM driver_finance.driver_advances WHERE id=$1::uuid`, [gate.advanceId]);
    expect(adv[0]!.status).not.toBe("recovered");
  });

  it("(6b) B7 blocking gate: mode:'full' decision proceeds identically to (1)'s pre-existing default — same numbers, decision registered in the audit trail", async () => {
    await setFlag(true);
    const res = await closeSettlementPayRun(
      {
        operatingCompanyId: companyId,
        settlementId: gate.settlementId,
        paymentMethodId,
        requireLoanDecision: true,
        loanRecoveryDecision: { mode: "full", decided_by_user_id: flagActor, reason: "standing policy — full recovery" },
      },
      { userId: flagActor }
    );
    expect(res.result).toBe("posted");
    // Identical numbers to (1)'s below-cap scenario — same fixture shape, proves the decision
    // path and the pre-existing default path produce the SAME result for mode:'full'.
    expect(res.breakdown.advance_recoveries_cents).toBe(20000);
    expect(res.breakdown.net_cents).toBe(205000);
    expect(res.recovered_advance_ids).toEqual([gate.advanceId]);

    const adv = await read<{ recovered: string | null; status: string; outstanding_balance: string }>(
      `SELECT recovered_in_settlement_id::text AS recovered, status, outstanding_balance::text FROM driver_finance.driver_advances WHERE id=$1::uuid`,
      [gate.advanceId]
    );
    expect(adv[0]!.recovered).toBe(gate.settlementId);
    expect(adv[0]!.status).toBe("recovered");
    expect(Number(adv[0]!.outstanding_balance)).toBe(0);

    // The decision itself is registered — who, when (created_at), what was chosen.
    const auditRows = await read<{ payload: Record<string, unknown> }>(
      `SELECT payload FROM audit.audit_events
        WHERE event_class = 'driver_finance.settlement.loan_recovery_decision'
          AND payload->>'settlement_id' = $1
        ORDER BY created_at DESC LIMIT 1`,
      [gate.settlementId]
    );
    expect(auditRows.length).toBe(1);
    expect(auditRows[0]!.payload).toMatchObject({ mode: "full", decided_by_user_id: flagActor, applied_this_close_cents: 20000, rolled_forward_cents: 0 });
  });

  // ── LEAD 443.116 #2 + (c), locked design READ-FIRST §3: due date = projected delivery; pay recognized once, at delivery ──
  const accruedLoad = () => loadBySettlement.get(accrued.settlementId)!;
  const accruedBill = async () => (await read<{ id: string; due_date: string | null; basis: string | null; accrued_bill_id: string | null; status: string; settled: string | null; effective: string | null; today: string }>(
    `SELECT id::text, due_date::text, due_date_basis AS basis, accrued_bill_id::text, status, settled_in_settlement_id::text AS settled,
            driver_finance.driver_bill_effective_due_date(due_date, due_date_basis, (now() AT TIME ZONE 'America/Chicago')::date)::text AS effective,
            ((now() AT TIME ZONE 'America/Chicago')::date)::text AS today
       FROM driver_finance.driver_bills WHERE load_id = $1::uuid`,
    [accruedLoad()]
  ))[0]!;
  const chicagoDate = async (offsetDays: number) => (await read<{ d: string }>(
    `SELECT (((now() + make_interval(days => $1::int)) AT TIME ZONE 'America/Chicago')::date)::text AS d`, [offsetDays]
  ))[0]!.d;
  const payPostedCents = async () => Number((await read<{ v: string }>(
    `SELECT COALESCE(SUM(CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END),0)::text AS v
       FROM accounting.journal_entry_postings p
      WHERE p.operating_company_id = $1::uuid AND p.account_id = $2::uuid AND p.load_id = $3::uuid`,
    [companyId, acct.driverPay, accruedLoad()]
  ))[0]!.v);

  it("(7) 443.116 #2: the booked driver bill is due on the projected delivery, moves with the appointment, rolls to today, fixes at delivery", async () => {
    const stopId = randomUUID();
    await bypass(async () => {
      await db.query(
        `INSERT INTO mdata.load_stops (id, load_id, sequence_number, stop_type, appointment_start_at) VALUES ($1::uuid, $2::uuid, 2, 'delivery', now() + interval '3 days')`,
        [stopId, accruedLoad()]
      );
    });
    let b = await accruedBill();
    expect(b.basis).toBe("projected");
    expect(b.due_date).toBe(await chicagoDate(3));
    // Edit Load / re-plan: the appointment moves -> the due date moves (any writer: the stop trigger).
    await bypass(async () => { await db.query(`UPDATE mdata.load_stops SET appointment_start_at = now() + interval '5 days' WHERE id = $1::uuid`, [stopId]); });
    b = await accruedBill();
    expect(b.due_date).toBe(await chicagoDate(5));
    // Late load: the appointment passed undelivered -> stored date stays, effective due date is today.
    await bypass(async () => { await db.query(`UPDATE mdata.load_stops SET appointment_start_at = now() - interval '2 days' WHERE id = $1::uuid`, [stopId]); });
    b = await accruedBill();
    expect(b.due_date).toBe(await chicagoDate(-2));
    expect(b.effective).toBe(b.today);
    // Delivered: fixed at the actual delivery date.
    await bypass(async () => { await db.query(`UPDATE mdata.load_stops SET actual_departure_at = now() WHERE id = $1::uuid`, [stopId]); });
    b = await accruedBill();
    expect(b.basis).toBe("delivered");
    expect(b.due_date).toBe(b.today);
    expect(b.effective).toBe(b.today);
  });

  it("(8) 443.116 (c): at delivery Dr driver pay / Cr A/P posts ONCE on the driver bill; a second delivery event posts nothing", async () => {
    expect(await payPostedCents()).toBe(0);
    let first: Awaited<ReturnType<typeof accrueDriverPayAtDeliveryInClientTx>> | null = null;
    await bypass(async () => {
      first = await accrueDriverPayAtDeliveryInClientTx(db as never, { operatingCompanyId: companyId, loadId: accruedLoad(), actorUserId: flagActor });
    });
    expect(first!.accrued.length).toBe(1);
    expect(first!.accrued[0]!.amount_cents).toBe(300000);
    const b = await accruedBill();
    expect(b.accrued_bill_id).toBe(first!.accrued[0]!.accounting_bill_id);
    expect(b.basis).toBe("delivered");
    const bill = (await read<{ bill_date: string; due_date: string; amount_cents: number; driver_id: string | null; load_id: string | null; unit_id: string | null; vendor: string | null }>(
      `SELECT bill_date::text, due_date::text, amount_cents::int, driver_id::text, load_id::text, unit_id::text, mdata_vendor_id::text AS vendor FROM accounting.bills WHERE id = $1::uuid`,
      [b.accrued_bill_id]
    ))[0]!;
    expect(bill.bill_date).toBe(b.due_date);
    expect(bill.due_date).toBe(b.due_date);
    expect(bill.amount_cents).toBe(300000);
    expect(bill.driver_id).toBe(accrued.driverId);
    expect(bill.load_id).toBe(accruedLoad());
    expect(bill.unit_id).toBe(unitBySettlement.get(accrued.settlementId));
    const je = await jeBalance(first!.accrued[0]!.journal_entry_id);
    expect(je.dr).toBe(300000);
    expect(je.cr).toBe(300000);
    const apCredit = Number((await read<{ v: string }>(
      `SELECT COALESCE(SUM(amount_cents),0)::text AS v FROM accounting.journal_entry_postings WHERE journal_entry_uuid = $1::uuid AND account_id = $2::uuid AND debit_or_credit = 'credit'`,
      [first!.accrued[0]!.journal_entry_id, acct.ap]
    ))[0]!.v);
    expect(apCredit).toBe(300000);
    expect(await payPostedCents()).toBe(300000);
    // Idempotent: the same delivery event again posts nothing.
    let again: Awaited<ReturnType<typeof accrueDriverPayAtDeliveryInClientTx>> | null = null;
    await bypass(async () => {
      again = await accrueDriverPayAtDeliveryInClientTx(db as never, { operatingCompanyId: companyId, loadId: accruedLoad(), actorUserId: flagActor });
    });
    expect(again!.accrued.length).toBe(0);
    expect(await payPostedCents()).toBe(300000);
  });

  it("(9) 443.116 (c): close APPLIES to the delivery bill — 0 new pay postings, A/P nets to 0, TB balances; a settlement void keeps the delivery bill open", async () => {
    await setFlag(true);
    const accrualBillId = (await accruedBill()).accrued_bill_id!;
    const res = await closeSettlementPayRun({ operatingCompanyId: companyId, settlementId: accrued.settlementId, paymentMethodId }, { userId: flagActor });
    expect(res.result).toBe("posted");
    expect(res.breakdown.gross_cents).toBe(300000);
    // Pay is never posted again: still exactly the delivery accrual on this load.
    expect(await payPostedCents()).toBe(300000);
    const spine = await read<{ accounting_bill_id: string; bill_posted_at_delivery: boolean; pay_basis: string }>(
      `SELECT accounting_bill_id::text, bill_posted_at_delivery, pay_basis FROM driver_finance.driver_settlement_gl_bills WHERE settlement_id = $1::uuid AND superseded_at IS NULL`,
      [accrued.settlementId]
    );
    expect(spine).toEqual([{ accounting_bill_id: accrualBillId, bill_posted_at_delivery: true, pay_basis: "per_load_driver_bill" }]);
    // A/P on the delivery bill: Cr 300000 at delivery, Dr applications 95000 + net 205000 at close -> 0.
    const apOnBill = Number((await read<{ v: string }>(
      `SELECT COALESCE(SUM(CASE WHEN p.debit_or_credit='credit' THEN p.amount_cents ELSE -p.amount_cents END),0)::text AS v
         FROM accounting.journal_entry_postings p
        WHERE p.operating_company_id = $1::uuid AND p.account_id = $2::uuid AND p.load_id = $3::uuid`,
      [companyId, acct.ap, accruedLoad()]
    ))[0]!.v);
    expect(apOnBill).toBe(0);
    const paid = (await read<{ paid: number; amount: number }>(`SELECT paid_cents::int AS paid, amount_cents::int AS amount FROM accounting.bills WHERE id = $1::uuid`, [accrualBillId]))[0]!;
    expect(paid.paid).toBe(paid.amount);
    // Trial balance: every entry this company wrote balances (sum debits == sum credits).
    const tb = (await read<{ dr: string; cr: string }>(
      `SELECT COALESCE(SUM(amount_cents) FILTER (WHERE debit_or_credit='debit'),0)::text AS dr, COALESCE(SUM(amount_cents) FILTER (WHERE debit_or_credit='credit'),0)::text AS cr
         FROM accounting.journal_entry_postings WHERE operating_company_id = $1::uuid`,
      [companyId]
    ))[0]!;
    expect(Number(tb.dr)).toBe(Number(tb.cr));

    // Settlement void: reverses what the close did (payments, applications), never the delivery bill or its pay posting.
    await bypass(async () => {
      // A locked settlement is unlocked before it is voided (settlement_reverse_blocked_locked).
      await db.query(`UPDATE driver_finance.driver_settlements SET locked_at = NULL WHERE id = $1::uuid`, [accrued.settlementId]);
      await reverseSettlementForVoid(db as never, { operatingCompanyId: companyId, settlementId: accrued.settlementId, reason: "443.116 test void", actor: { userId: flagActor } });
    });
    const after = (await read<{ revoked: boolean; voided: boolean; paid: number }>(
      `SELECT (revoked_at IS NOT NULL) AS revoked, (voided_at IS NOT NULL) AS voided, COALESCE(paid_cents,0)::int AS paid FROM accounting.bills WHERE id = $1::uuid`,
      [accrualBillId]
    ))[0]!;
    expect(after).toEqual({ revoked: false, voided: false, paid: 0 });
    expect(await payPostedCents()).toBe(300000);
    const db_ = await accruedBill();
    expect(db_.accrued_bill_id).toBe(accrualBillId);
    expect(db_.status).toBe("open");
    expect(db_.settled).toBeNull();
    const tb2 = (await read<{ dr: string; cr: string }>(
      `SELECT COALESCE(SUM(amount_cents) FILTER (WHERE debit_or_credit='debit'),0)::text AS dr, COALESCE(SUM(amount_cents) FILTER (WHERE debit_or_credit='credit'),0)::text AS cr
         FROM accounting.journal_entry_postings WHERE operating_company_id = $1::uuid`,
      [companyId]
    ))[0]!;
    expect(Number(tb2.dr)).toBe(Number(tb2.cr));
  });

  it("(10) 443.128 C: a TEAM driver bill posts one A/P bill per driver at delivery (its split share), once; each driver settles its own", async () => {
    const d1 = randomUUID();
    const d2 = randomUUID();
    const loadId = randomUUID();
    const billId = randomUUID();
    const settlement2 = randomUUID();
    const loadNumber = String(810000000 + Math.floor(Math.random() * 9000000));
    await bypass(async () => {
      for (const [d, n] of [[d1, "One"], [d2, "Two"]] as const) {
        await db.query(`INSERT INTO mdata.drivers (id, operating_company_id, first_name, last_name, phone) VALUES ($1::uuid,$2::uuid,'Team',$3,$4)`, [d, companyId, `${n}-${suffix}`, `+1007${randomUUID().slice(0, 7)}`]);
        await db.query(`INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type, driver_id) VALUES ($1::uuid,$2,'driver',$3::uuid)`, [companyId, `Team ${n} ${suffix}`, d]);
      }
      const cust = randomUUID();
      await db.query(`INSERT INTO mdata.customers (id, operating_company_id, customer_name) VALUES ($1::uuid,$2::uuid,$3)`, [cust, companyId, `Team customer ${suffix}`]);
      const unit = randomUUID();
      await db.query(`INSERT INTO mdata.units (id, owner_company_id, unit_number, vin, is_sample_data) VALUES ($1::uuid,$2::uuid,$3,$4,true)`, [unit, companyId, `TMU${loadNumber.slice(-6)}`, `1TMU${loadNumber}`.slice(0, 17).padEnd(17, "0")]);
      // The load's own team split override: driver One 60 % / driver Two 40 %.
      await db.query(
        `INSERT INTO mdata.loads (id, operating_company_id, load_number, customer_id, status, rate_total_cents, dispatcher_user_id, load_trailer_equipment_id, assigned_unit_id,
                                  assigned_primary_driver_id, assigned_secondary_driver_id, team_split_override_primary_driver_id, team_split_override_secondary_driver_id,
                                  team_split_override_primary_ratio, team_split_override_secondary_ratio, team_split_override_reason, team_split_override_set_by_user_id, team_split_override_set_at)
         VALUES ($1::uuid,$2::uuid,$3,$4::uuid,'delivered_pending_docs',500000,$5::uuid,(SELECT id FROM catalogs.load_trailer_equipment WHERE operating_company_id = $2::uuid AND code = 'DRY_VAN' LIMIT 1),$6::uuid,
                 $7::uuid,$8::uuid,$7::uuid,$8::uuid,0.6,0.4,'one_off_team',$5::uuid,now())`,
        [loadId, companyId, loadNumber, cust, userId, unit, d1, d2]
      );
      await db.query(`INSERT INTO mdata.load_stops (load_id, sequence_number, stop_type, actual_departure_at) VALUES ($1::uuid, 2, 'delivery', now())`, [loadId]);
      await db.query(
        `INSERT INTO driver_finance.driver_bills (id, operating_company_id, load_id, load_number, bill_number, driver_id, team_driver_id, gross_amount_cents, status)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$4,$5::uuid,$6::uuid,300000,'open')`,
        [billId, companyId, loadId, loadNumber, d1, d2]
      );
      await db.query(
        `INSERT INTO driver_finance.driver_settlements (id, operating_company_id, display_id, driver_id, period_start, period_end, status, gross_pay, deductions_total, reimbursements_total, net_pay, settlement_model)
         VALUES ($1::uuid,$2::uuid,$3,$4::uuid,CURRENT_DATE-7,CURRENT_DATE,'draft',1200,0,0,1200,'week_calendar')`,
        [settlement2, companyId, `PR-TEAM2-${suffix}`, d2]
      );
      await db.query(`UPDATE mdata.loads SET presettlement_link_id = $2::uuid WHERE id = $1::uuid`, [loadId, settlement2]);
    });
    let out: Awaited<ReturnType<typeof accrueDriverPayAtDeliveryInClientTx>> | null = null;
    await bypass(async () => { out = await accrueDriverPayAtDeliveryInClientTx(db as never, { operatingCompanyId: companyId, loadId, actorUserId: flagActor }); });
    expect(out!.accrued.map((a) => a.amount_cents).sort()).toEqual([120000, 180000]);
    const bills = await read<{ driver_id: string; amount: number; bill_date: string }>(
      `SELECT b.driver_id::text, b.amount_cents::int AS amount, b.bill_date::text FROM accounting.bills b
        WHERE b.id IN (SELECT accrued_bill_id FROM driver_finance.driver_bills WHERE id = $1::uuid UNION ALL SELECT accrued_team_bill_id FROM driver_finance.driver_bills WHERE id = $1::uuid)
        ORDER BY b.amount_cents DESC`,
      [billId]
    );
    expect(bills.map((b) => [b.driver_id, b.amount])).toEqual([[d1, 180000], [d2, 120000]]);
    // Pay posted once, in full: Dr driver pay 300000 on this load.
    const pay = await read<{ v: string }>(
      `SELECT COALESCE(SUM(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END),0)::text AS v FROM accounting.journal_entry_postings
        WHERE operating_company_id = $1::uuid AND account_id = $2::uuid AND load_id = $3::uuid`,
      [companyId, acct.driverPay, loadId]
    );
    expect(Number(pay[0]!.v)).toBe(300000);
    // Once: the delivery event again posts nothing.
    let again: Awaited<ReturnType<typeof accrueDriverPayAtDeliveryInClientTx>> | null = null;
    await bypass(async () => { again = await accrueDriverPayAtDeliveryInClientTx(db as never, { operatingCompanyId: companyId, loadId, actorUserId: flagActor }); });
    expect(again!.accrued.length).toBe(0);
    // The co-driver's settlement sees ITS OWN delivery-posted bill (not driver One's).
    let loadBills: Awaited<ReturnType<typeof loadSettlementLoadBills>> = [];
    await bypass(async () => { loadBills = await loadSettlementLoadBills(db as never, companyId, settlement2, d2); });
    const team = await read<{ t: string }>(`SELECT accrued_team_bill_id::text AS t FROM driver_finance.driver_bills WHERE id = $1::uuid`, [billId]);
    expect(loadBills.map((b) => b.accruedBillId)).toEqual([team[0]!.t]);
    // The spine accepts both drivers' live rows for the same driver bill (one per A/P bill), never the same pair twice.
    const both = await read<{ a: string; t: string }>(`SELECT accrued_bill_id::text AS a, accrued_team_bill_id::text AS t FROM driver_finance.driver_bills WHERE id = $1::uuid`, [billId]);
    await bypass(async () => {
      const run = (await db.query<{ id: string }>(
        `INSERT INTO driver_finance.driver_settlement_gl_runs (operating_company_id, settlement_id, driver_id, driver_vendor_id, run_key, gross_cents, deductions_cents, net_cents, status, posted_by_user_id)
         VALUES ($1::uuid,$2::uuid,$3::uuid,(SELECT id FROM mdata.vendors WHERE operating_company_id = $1::uuid AND driver_id = $3::uuid LIMIT 1),$4,0,0,0,'posted',$5::uuid) RETURNING id::text`,
        [companyId, settlement2, d2, `team-test:${settlement2}`, flagActor]
      )).rows[0]!.id;
      for (const ab of [both[0]!.a, both[0]!.t]) {
        await db.query(
          `INSERT INTO driver_finance.driver_settlement_gl_bills (operating_company_id, run_id, settlement_id, driver_bill_id, load_id, load_number, accounting_bill_id, gross_cents, deduction_cents, cash_cents)
           VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,$7::uuid,0,0,0)`,
          [companyId, run, settlement2, billId, loadId, loadNumber, ab]
        );
      }
      await expect(db.query(
        `INSERT INTO driver_finance.driver_settlement_gl_bills (operating_company_id, run_id, settlement_id, driver_bill_id, load_id, load_number, accounting_bill_id, gross_cents, deduction_cents, cash_cents)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,$7::uuid,0,0,0)`,
        [companyId, run, settlement2, billId, loadId, loadNumber, both[0]!.t]
      )).rejects.toThrow(/unique|duplicate/i);
      throw new Error("rollback-team-spine-probe");
    }).catch((e) => { if (!String(e).includes("rollback-team-spine-probe")) throw e; });
  });
});
