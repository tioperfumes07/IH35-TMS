import { createHash } from "node:crypto";
import { setScopedCompanyContext } from "../../_helpers/scoped-company-context.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export type FeatureFlagContext = {
  operating_company_id?: string | null;
  user_uuid?: string | null;
};

export type FeatureFlagRow = {
  flag_key: string;
  description: string | null;
  default_enabled: boolean;
  rollout_pct: string | number;
  archived_at?: string | null;
};

export type FeatureFlagOverrideRow = {
  uuid: string;
  flag_key: string;
  operating_company_id: string | null;
  user_uuid: string | null;
  user_label: string | null;
  company_label: string | null;
  enabled: boolean;
  set_by_user_uuid: string;
  set_at: string;
  expires_at: string | null;
};

// ── Money-posting flags are PER-ENTITY-ONLY ────────────────────────────────────────────────────────
// A posting flag gates whether TMS writes to the GL for a given operating company. It must NEVER be
// turnable on globally: a global `default_enabled`/`rollout_pct` would flip posting on for EVERY entity
// (incl. USMCA / TRK), defeating the per-entity kill-switch and cross-entity isolation. So for these
// flags we honor ONLY an explicit per-entity (operating_company_id) or per-user override; the global
// rollout and default paths are ignored (treated OFF). Known keys are enumerated for clarity; the
// pattern fallback auto-covers any future `*_GL_POSTING_*` / `*_POSTING_ENABLED` flag.
export const POSTING_FLAG_KEYS: ReadonlySet<string> = new Set([
  "GL_POSTING_ENABLED",
  "AMORTIZATION_GL_POSTING_ENABLED",
  "BANK_FEED_GL_POSTING_ENABLED",
  "BILL_GL_POSTING_ENABLED",
  "BILL_PAYMENT_GL_POSTING_ENABLED",
  // CHAIN-06 GAP — customer-payment (A/R receipt) posting kill switch. payments/apply.service.ts posts a
  // balanced JE (DR real-bank / CR ar_control) via postSourceTransaction('customer_payment') on every
  // payment apply — previously with NO per-entity flag at all. Enrolled per-entity, default OFF, so a
  // global flip can never turn A/R-receipt posting on for EVERY entity (incl. USMCA / TRK). Whether to
  // turn it ON (or leave AR-receipt posting always-on) is an OWNER decision (CHAIN-06); OFF-by-default
  // is the safe state Jorge flips.
  "CUSTOMER_PAYMENT_GL_POSTING_ENABLED",
  "EXPENSE_GL_POSTING_ENABLED",
  "FACTORING_GL_POSTING_ENABLED",
  "INVOICE_AR_GL_POSTING_ENABLED",
  // DISP-01 — two-event delivery revenue latch (earn Unbilled / bill A/R). Key is
  // REVENUE_RECOGNITION_POST_ENABLED (not *_POSTING_ENABLED), so without explicit enrollment it
  // would fall through to global default/rollout. Per-entity only; default OFF (already seeded).
  "REVENUE_RECOGNITION_POST_ENABLED",
  // ACCT-F5701 — billable-cancellation (TONU) charge -> customer invoice. Matches the
  // `*_POSTING_ENABLED` pattern isPostingFlag() already auto-recognizes; enumerated explicitly
  // (belt-and-suspenders) same as its siblings above. Per-entity only, default OFF.
  "TONU_CANCELLATION_AR_POSTING_ENABLED",
  "LEASE_GL_POSTING_ENABLED",
  // Business-Property Allocation: property-tax accrual (Dr expense / Cr payable) + payment (Dr payable /
  // Cr cash) posting, per-entity override (TRANSP/TRK), default OFF. Its key matches the `*_GL_POSTING_ENABLED`
  // pattern isPostingFlag() auto-recognizes, but it is enumerated explicitly (belt-and-suspenders) so the
  // migration-coverage guard and the per-entity money kill-switch both cover it — a global flip can never
  // turn property-tax GL posting on for EVERY entity (incl. USMCA).
  "PROPERTY_TAX_GL_POSTING_ENABLED",
  // SAFETY FINE-GL HOP: the COMPANY-PAID civil fine expense leg (Dr civil_fines_expense / Cr
  // cash_clearing), posted from the fine link-payment path. Its key matches the `*_GL_POSTING_ENABLED`
  // pattern isPostingFlag() auto-recognizes, but it is enumerated explicitly (belt-and-suspenders) so a
  // global rollout/default flip can never turn fine posting on for EVERY entity (incl. USMCA / TRK).
  // Default OFF; seeded default_enabled=false by migration 202608110000.
  "SAFETY_FINE_GL_POSTING_ENABLED",
  // MNT-ECON-01: standalone parts purchase → A/P bill + balanced JE. Enumerated explicitly so a
  // global flip can never turn parts-purchase posting on for EVERY entity. Default OFF
  // (migration 202609030000).
  "PARTS_PURCHASE_GL_POSTING_ENABLED",
  // MNT-ECON-04: warranty reimburse → balanced JE. Default OFF (migration 202609050000).
  "WARRANTY_REIMBURSE_GL_POSTING_ENABLED",
  // INS-02: insurer claim recovery (amount_paid) → balanced JE. Default OFF (migration 202609100020).
  "INSURANCE_CLAIM_RECOVERY_GL_POSTING_ENABLED",
  "SETTLEMENT_GL_POSTING_ENABLED",
  // BANKING-GL-COMPLETION: banking.transfers (bank_to_bank / cc_payment / cash_deposit /
  // owner_contribution / owner_distribution) -> GL posting via postSourceTransaction('transfer').
  // Enumerated explicitly (belt-and-suspenders — its key already matches the `*_GL_POSTING_ENABLED`
  // pattern below) so a global flip can never post transfers for EVERY entity at once. Default OFF.
  "TRANSFER_GL_POSTING_ENABLED",
  // H3-1: BLOCK-6 driver loan/advance posting from bank categorize. It posts a BALANCED JE (DEBIT the
  // driver-advance receivable, CREDIT the source bank) via the existing driver_advance source type, so it
  // is a real money-posting flag — but its key does NOT match the `*_GL_POSTING*` / `*_POSTING_ENABLED`
  // pattern, so without enrolling it here it would fall through to the global rollout/default path and a
  // single global flip could turn posting on for EVERY entity (incl. USMCA / TRK), bypassing the
  // per-entity kill-switch. Enrolled so enable is ONLY via an explicit per-entity/user override. Default OFF.
  "BANK_DRIVER_ADVANCE_ENABLED",
  // B3-DISBURSE: the cash-advance disburse core calls postSourceTransaction('driver_advance')...
  "DRIVER_ADVANCE_GL_POSTING_ENABLED",
  // IMPORT-P0: gates whether TMS pushes journal entries INTO QuickBooks. QBO is the system of record
  // through 12/31/2025 (double books + reconciliation, no sync-back), so this must be per-entity-only —
  // a global flip would start echoing every entity's JEs into QBO. Enable is an explicit per-entity
  // override, owner-controlled.
  "QBO_JE_PUSH_ENABLED",
  // IMPORT-P0b: same, for the six entity write-back handlers (invoice/bill/customer/vendor/account/item).
  // Per-entity-only; default OFF; a global flip would start echoing every entity's masterdata + AR/AP into QBO.
  "QBO_ENTITY_PUSH_ENABLED",
  // 0091-H3-3: void-class flags gate a REAL reversing-JE post (postVoidReversal — a balanced reversing
  // journal entry, the same money-safe mechanics as any other posting flag) but their keys do NOT match
  // the `*_GL_POSTING*` / `*_POSTING_ENABLED` pattern, so without enrolling them here (belt-and-suspenders
  // alongside the `_VOID_ENABLED$` pattern fallback below) they would fall through to the global
  // rollout/default path — a single global flip could post reversing entries for EVERY entity (incl.
  // USMCA / TRK), bypassing the per-entity money kill-switch. VOID_ENFORCEMENT_ENABLED gates
  // invoice/bill void reversal (void.service.ts); WO_VOID_ENABLED gates work-order void's linked
  // bill/expense reversal (work-orders.routes.ts). Both already seeded default OFF (migrations
  // 202606141200 / 202606300040) — NO new GL math, this is classification only.
  "VOID_ENFORCEMENT_ENABLED",
  "WO_VOID_ENABLED",
  // The three held posting flags. 202610161200 (#3746) arms prepaid + FH-3 loan payment for TRK and
  // USMCA; depreciation autopost stays OFF pending the accumulated-depreciation control decision.
  // Each gates a REAL balanced JE, but none of the keys matches an isPostingFlag() pattern —
  // `_POST_ENABLED` and `_AUTOPOST_ENABLED` both miss `_POSTING_ENABLED$` — so unenrolled they fall
  // through to global default_enabled/rollout_pct and one global flip would arm GL posting for
  // EVERY entity, including the ones the owner excluded
  // (TRANSP leases its equipment; booking depreciation there is wrong books, not a preference).
  // Enrolment makes enable possible ONLY through an explicit per-entity override. Default OFF.
  "PREPAID_EXPENSES_POST_ENABLED",
  "FINANCE_HUB_AMORTIZATION_POST_ENABLED",
  "FIXED_ASSET_AUTOPOST_ENABLED",
]);

export function isPostingFlag(flagKey: string): boolean {
  return (
    POSTING_FLAG_KEYS.has(flagKey) ||
    /_GL_POSTING(_ENABLED)?$/.test(flagKey) ||
    /_POSTING_ENABLED$/.test(flagKey) ||
    // 0091-H3-3: any future `*_VOID_ENABLED` flag (a per-surface void-reversal kill switch that posts a
    // reversing JE via postVoidReversal) is auto-recognized as posting-class, so it can never fall
    // through to a global default/rollout enable without an explicit enrollment above.
    /_VOID_ENABLED$/.test(flagKey)
  );
}

// ── Per-entity-only flags (non-posting) ────────────────────────────────────────────────────────────
// FLAG-HARDEN-1: some non-posting features are gated PER OPERATING COMPANY, not per user or globally.
// The rollout_pct instrument is a *user-hash* percentage — it only evaluates when a user_uuid is in
// context, and when it does it enables the flag for a hashed slice of users ACROSS every entity. For a
// feature the owner enables one entity at a time (e.g. RATECON_EXTRACT_ENABLED — the rate-con AI
// extractor, live-enabled for TRANSP only), that is the wrong instrument twice over:
//   1. the extract endpoint calls isEnabled with only operating_company_id (no user_uuid), so a
//      rollout_pct change silently NO-OPs — an owner control that accepts input and does nothing (a
//      trust defect); and
//   2. where a user_uuid IS present, rollout would flip the feature on for that user across ALL
//      entities, breaking per-entity isolation.
// So per-entity-only flags are resolved EXACTLY like posting flags: only an explicit per-entity
// (operating_company_id) or per-user override can enable them; global default_enabled/rollout_pct are
// ignored (treated OFF). Known keys are enumerated; the pattern fallback auto-covers any future flag
// named with the `_PER_ENTITY_ONLY` convention suffix.
export const PER_ENTITY_ONLY_FLAG_KEYS: ReadonlySet<string> = new Set([
  // ACCT-F5322/ORPH-003 (202612640000): gates read/write access to accounting.vendor_payment_methods
  // (the vendor-side counterpart to driver_finance.driver_payment_methods) from the vendor detail
  // surface. Master data only today (no consumer route wired yet), but the migration seeds it
  // explicitly "per-entity owner-gated" — a global default/rollout enable would open vendor
  // bank/payment-method read/write for EVERY entity (incl. USMCA / TRK) the moment a consumer route
  // ships, bypassing the entity-by-entity owner flip the migration's own comment promises.
  // Per-entity override only; default OFF.
  "VENDOR_PAYMENT_METHODS_ENABLED",
  // DRIVER-PAYMENT-METHODS: repoints the settlement payment path to resolve a driver's default ACH/check
  // method from driver_finance.driver_payment_methods (instead of the non-existent mdata.drivers token
  // columns). It changes real payment behavior (ACH becomes possible where it always failed), so it must
  // be flipped ONE ENTITY AT A TIME (TRANSP first) — a global default/rollout enable would alter payment
  // behavior for EVERY entity (incl. USMCA / TRK). Per-entity override only; default OFF. Owner flips.
  "DRIVER_PAYMENT_METHODS_ENABLED",
  // BANK-F16: reverse+reposts bank-feed journal entries whose posted bank leg disagrees with the bank
  // account's CURRENT ledger_account_id (entries written before a bridge was corrected). It REWRITES
  // POSTED LEDGER HISTORY, so a global default/rollout enable would let it loose on every entity at
  // once. Per-entity override only; default OFF; the owner decides when a given entity's history is
  // corrected. Migration 202612110000 seeds it "Per-entity overrides only".
  "BANK_LEDGER_REPOINT_REMEDIATION_ENABLED",
  // RATECON-1: AI rate-con extractor. The extract endpoint passes operating_company_id only (no
  // user_uuid) → rollout_pct silently no-ops. Live-enabled for TRANSP via a tenant override.
  "RATECON_EXTRACT_ENABLED",
  // Task #24: mirror a TMS financial void to QuickBooks — migration seeds it "Resolved per-entity via
  // overrides. Default OFF." A global default/rollout enable would echo voids for EVERY entity into QBO.
  "VOID_QBO_MIRROR_ENABLED",
  // RECON-01: read-only twice-daily QBO↔TMS reconciliation passes — migration seeds it "per-entity
  // owner-gated". Enabling it per operating company (not globally) is the documented intent.
  "TMS_QBO_RECON_ENABLED",
  // REPAIR-A: wires the canonical deduction applier into the driver_finance settlement close. It
  // reduces real net pay owed to drivers (money-affecting), so it must be flipped ONE ENTITY AT A TIME
  // (TRANSP first) — a global default/rollout enable would start applying deductions for EVERY entity
  // (incl. USMCA / TRK). Per-entity override only; default OFF. Owner-controlled (Jorge flips).
  "SETTLEMENT_DEDUCTION_APPLY_ENABLED",
  // BANK-DOM-06: recovers a fuel-card overage from the driver via settlement deduction (legacy path).
  // Per-entity override only; default OFF (migration 202609150000). Keep enrolled while that seed exists.
  "FUEL_CARD_OVERAGE_RECOVERY_ENABLED",
  // FUEL-03: evaluate fuel-card spend vs policy; create overage events (pending_review default).
  // FUEL-03 GL: post Dr fuel_overage_receivable after manager approval + contract authority.
  // Per-entity only — never auto-charge drivers globally. Default OFF.
  "FUEL_CARD_OVERAGE_ENGINE_ENABLED",
  "FUEL_CARD_OVERAGE_GL_POSTING_ENABLED",
  // SETTLEMENT-CONTRACT-TERMS: computes the driver hire-contract bonuses/deductions (MPG +$35, referral
  // $200, late-delivery pass-through, driver fines, reimbursements) at settlement close. It writes real
  // settlement pay lines + real pending deductions (money-affecting once the GL/deduction flags are also
  // on), so it must be flipped ONE ENTITY AT A TIME (TRANSP first) — a global default/rollout enable would
  // start computing for EVERY entity (incl. USMCA / TRK). Per-entity override only; default OFF. Jorge flips.
  "SETTLEMENT_CONTRACT_TERMS_ENABLED",
  // FINHUB-1: the read-only Finance Hub landing dashboard. It is a per-entity surface
  // (operating_company_id required; no cross-entity totals) and its backend gate now resolves this
  // same DB flag as the frontend (kills the prior process.env vs DB split-brain). Enabling it in prod
  // is a per-entity owner (Jorge) sign-off, so it must be per-entity-only — a global default/rollout
  // enable would light the hub up for EVERY entity (incl. USMCA / TRK) at once. Default OFF.
  "FINANCE_HUB_UI_ENABLED",
  // FLAG-SPLIT-BRAIN sweep: read-only finance surfaces whose backend gate now resolves the SAME DB
  // flag the frontend reads (via isEnabled), killing the prior process.env vs DB split-brain. Each is
  // per-entity (operating_company_id required; no cross-entity totals) and enabling it in prod is a
  // per-entity owner (Jorge) sign-off — so it must be per-entity-only: a global default/rollout enable
  // would light the surface up for EVERY entity (incl. USMCA / TRK) at once. All READ-ONLY (never
  // post/write/move money). Default OFF.
  //   FIN-20 AR/AP aging report:
  "AR_AP_AGING_UI_ENABLED",
  //   FIN-23 QBO reconcile / modify-captures (read-only surfacing):
  "QBO_RECONCILE_UI_ENABLED",
  //   F1 Break-Even analysis (read-only what-if inputs):
  "FINANCE_BREAK_EVEN_UI_ENABLED",
  // BANK-ACCOUNT-HIDE: per-entity bank-account hide/exclude (TRANSP/TRK share one Wells Fargo/Plaid
  // login, duplicating all 4 WF accounts into both entities). Hiding an account changes what appears on
  // that entity's balance sheet/cash-flow/categorization/reconciliation, so it must be flipped ONE
  // ENTITY AT A TIME — a global default/rollout enable would hide/reveal accounts for EVERY entity
  // (incl. USMCA / TRK) at once. Per-entity override only; default OFF. Jorge flips.
  "BANK_ACCOUNT_HIDE_ENABLED",
  // AF-2: gates the qbo-sync/*-reconciler.ts healFieldDrift() auto-fix (silently overwrites local
  // vendor/customer/CoA fields from the QBO mirror). Locked decision is "detect only, write stays OFF"
  // — a global default/rollout enable would auto-heal for EVERY entity at once. Default OFF; when OFF
  // the reconcilers record a read-only recon_exceptions (ANCHOR_DRIFT) row instead of mutating the row.
  "QBO_MASTER_DATA_HEAL_ENABLED",
  // AF-4: gates the (not-yet-built) QBO A/P importer WRITE step into accounting.bills/mdata.vendors.
  // Money-affecting master-data + A/P creation — must be flipped ONE ENTITY AT A TIME (TRANSP first).
  // Default OFF; the schema/preview layer (ap_import_batches/ap_import_preview_lines) ships regardless.
  "AP_IMPORT_ENABLED",
  // AF-7: money-control flags — void/reversing-JE UX, period-close action, period-reopen action. Each is
  // a per-entity owner sign-off (CPA tie-out gates all three); a global enable would turn a money control
  // on for EVERY entity at once. All default OFF.
  "MONEY_CONTROL_VOID_REVERSAL_ENABLED",
  "MONEY_CONTROL_PERIOD_CLOSE_ENABLED",
  "MONEY_CONTROL_PERIOD_REOPEN_ENABLED",
  // RELAY-FUEL-INGEST-1 (doc 21/22 Part A gap 2): the Relay fuel-transaction ingest is a per-entity feed —
  // its seed migration is described "per entity" and the ingest cron resolves this DB flag per
  // operating_company_id. Enroll it here so a global default/rollout can never turn it on for EVERY entity
  // (incl. USMCA / TRK) at once; enable is an explicit per-entity owner flip. Default OFF. Staging ingest
  // only (no GL) but per-entity protection matters (each entity's fuel data must stay scoped).
  "RELAY_FUEL_INGEST_ENABLED",
  // 0441-mod7-myaccountant-flag-no-seed: My Accountant read-only accountant workspace (period status,
  // report links, CPA export downloads only — never posts/writes, see MyAccountantPage.guard.test.ts).
  // Same class as FINANCE_HUB_UI_ENABLED / QBO_RECONCILE_UI_ENABLED: a per-entity surface
  // (operating_company_id required; no cross-entity totals) whose enable is an explicit per-entity
  // owner (Jorge) sign-off — a global default/rollout enable would light it up for EVERY entity (incl.
  // USMCA / TRK) at once. Default OFF.
  "MY_ACCOUNTANT_ENABLED",
]);

export function isPerEntityOnlyFlag(flagKey: string): boolean {
  return PER_ENTITY_ONLY_FLAG_KEYS.has(flagKey) || /_PER_ENTITY_ONLY$/.test(flagKey);
}

// A flag is "per-entity gated" (no global default/rollout enable) if it is either a money-posting flag
// or a per-entity-only flag. Both the resolver and the PATCH route consult this to refuse a global
// enable and honor only an explicit per-entity/per-user override.
export function isPerEntityGatedFlag(flagKey: string): boolean {
  return isPostingFlag(flagKey) || isPerEntityOnlyFlag(flagKey);
}

export function rolloutBucket(flagKey: string, userUuid: string): number {
  const digest = createHash("sha256").update(`${flagKey}:${userUuid}`).digest();
  return digest.readUInt32BE(0) % 10000;
}

export function isRolloutEnabled(flagKey: string, userUuid: string, rolloutPct: number): boolean {
  const pct = Number(rolloutPct);
  if (!Number.isFinite(pct) || pct <= 0) return false;
  if (pct >= 100) return true;
  return rolloutBucket(flagKey, userUuid) < Math.round(pct * 100);
}

export function resolveFlagEnabled(
  flag: Pick<FeatureFlagRow, "flag_key" | "default_enabled" | "rollout_pct">,
  overrides: Pick<FeatureFlagOverrideRow, "operating_company_id" | "user_uuid" | "enabled" | "expires_at">[],
  context: FeatureFlagContext
): boolean {
  const now = Date.now();
  const active = overrides.filter((row) => !row.expires_at || Date.parse(row.expires_at) > now);

  if (context.user_uuid) {
    const userOverride = active.find((row) => row.user_uuid === context.user_uuid);
    if (userOverride) return userOverride.enabled;
  }

  if (context.operating_company_id) {
    const tenantOverride = active.find(
      (row) => row.user_uuid == null && row.operating_company_id === context.operating_company_id
    );
    if (tenantOverride) return tenantOverride.enabled;
  }

  // Per-entity-gated flags stop here: with no explicit per-entity/user override above, a money-posting
  // OR per-entity-only flag is OFF. Global rollout_pct / default_enabled can never turn it on (posting
  // flags would enable posting for all entities; per-entity-only flags would either silently no-op or
  // leak across entities via the user-hash rollout). This is the enforcement half of the per-entity
  // kill-switch — enable is ONLY via an explicit tenant/user override.
  if (isPerEntityGatedFlag(flag.flag_key)) {
    return false;
  }

  if (context.user_uuid && Number(flag.rollout_pct) > 0) {
    if (isRolloutEnabled(flag.flag_key, context.user_uuid, Number(flag.rollout_pct))) {
      return true;
    }
  }

  return Boolean(flag.default_enabled);
}

export async function isEnabled(
  client: Queryable,
  flagKey: string,
  context: FeatureFlagContext = {}
): Promise<boolean> {
  const flagRes = await client.query<FeatureFlagRow>(
    `
      SELECT flag_key, description, default_enabled, rollout_pct, archived_at
      FROM lib.feature_flags
      WHERE flag_key = $1
    `,
    [flagKey]
  );
  const flag = flagRes.rows[0];
  if (!flag) return false;
  // LV-DEAD-SEEDED-FLAGS — archived rows stay in the table (never DELETE) but cannot enable.
  if (flag.archived_at) return false;

  // ★ THE PER-ENTITY OVERRIDE IS INVISIBLE UNLESS THE ENTITY GUC IS SET (found live 2026-08-11).
  //
  // `lib.feature_flag_overrides` is FORCE-RLS with policy ff_overrides_select:
  //     is_lucia_bypass() OR user_uuid IS NOT NULL OR operating_company_id IS NULL
  //     OR operating_company_id = current_setting('app.operating_company_id')::uuid
  //
  // Every caller reaches this through withCurrentUser(), which sets app.current_user_id and
  // app.session_id but NOT app.operating_company_id — so the last clause can never match and a
  // per-entity override row is filtered out by RLS BEFORE the WHERE below is evaluated. The query
  // was never wrong; it returned zero rows against correct data, and the flag then fell through to
  // its per-entity-only default of OFF.
  //
  // MEASURED ON PROD, not inferred: as ih35_app, `lib.feature_flag_overrides` showed 2 visible rows
  // against n_live_tup 242, with 0 of the per-entity rows visible (lib.feature_flags read 85 in the
  // same statement, so the connection was healthy). USMCA alone holds 78 override rows — including
  // FINANCE_HUB_UI_ENABLED = true since 2026-07-11 — while GET /api/feature-flags/check?key=
  // FINANCE_HUB_UI_ENABLED&operating_company_id=5c854333… answered {"enabled":false} and the screen
  // rendered "Finance Hub is not enabled for this entity". The flags had been switched on for a
  // month and had never once taken effect on this path.
  //
  // Membership is asserted BEFORE the GUC is set (setScopedCompanyContext does both, in that order),
  // so a caller-named company still cannot widen its own scope — the CLS-GUC law. If the caller is
  // not a member we deliberately do NOT throw: resolution falls through unscoped and yields the
  // same OFF as before, so this fix can only ever turn a legitimately-enabled flag ON.
  if (context.operating_company_id) {
    try {
      const actingUser =
        context.user_uuid ??
        (
          await client.query<{ uid: string | null }>(
            `SELECT NULLIF(current_setting('app.current_user_id', true), '') AS uid`
          )
        ).rows[0]?.uid ??
        null;
      if (actingUser) {
        await setScopedCompanyContext(client, actingUser, context.operating_company_id);
      }
    } catch {
      // Not a member (or no user context) — leave the scope unset and resolve as before.
    }
  }

  const overrideRes = await client.query<FeatureFlagOverrideRow>(
    `
      SELECT uuid, flag_key, operating_company_id::text, user_uuid::text, enabled,
             set_by_user_uuid::text, set_at::text, expires_at::text
      FROM lib.feature_flag_overrides
      WHERE flag_key = $1
        AND (expires_at IS NULL OR expires_at > now())
        AND (
          ($2::uuid IS NOT NULL AND user_uuid = $2::uuid)
          OR ($3::uuid IS NOT NULL AND user_uuid IS NULL AND operating_company_id = $3::uuid)
        )
    `,
    [flagKey, context.user_uuid ?? null, context.operating_company_id ?? null]
  );

  return resolveFlagEnabled(flag, overrideRes.rows, context);
}

export async function listFlags(client: Queryable) {
  const res = await client.query<FeatureFlagRow & { override_count: number }>(
    `
      SELECT f.flag_key, f.description, f.default_enabled, f.rollout_pct,
             (
               SELECT count(*)::int
               FROM lib.feature_flag_overrides o
               WHERE o.flag_key = f.flag_key
                 AND (o.expires_at IS NULL OR o.expires_at > now())
             ) AS override_count
      FROM lib.feature_flags f
      WHERE f.archived_at IS NULL
      ORDER BY f.flag_key
    `
  );
  // Backend is the single source of truth for flag classification. Tag each flag so the admin UI can
  // render a "per-entity only" notice instead of an editable global default/rollout control that the
  // resolver would ignore (a silent no-op). Covers both posting and per-entity-only (non-posting) keys.
  return res.rows.map((row) => ({
    ...row,
    per_entity_only: isPerEntityGatedFlag(row.flag_key),
  }));
}

export async function listOverrides(client: Queryable, flagKey?: string) {
  const res = await client.query<FeatureFlagOverrideRow>(
    `
      SELECT o.uuid::text, o.flag_key, o.operating_company_id::text, o.user_uuid::text, o.enabled,
             COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), u.email) AS user_label,
             COALESCE(NULLIF(TRIM(c.short_name), ''), NULLIF(TRIM(c.code), ''),
                      NULLIF(TRIM(c.legal_name), '')) AS company_label,
             o.set_by_user_uuid::text, o.set_at::text, o.expires_at::text
      FROM lib.feature_flag_overrides o
      LEFT JOIN identity.users u ON u.id = o.user_uuid
      LEFT JOIN org.companies c ON c.id = o.operating_company_id
      WHERE ($1::text IS NULL OR o.flag_key = $1)
        AND (o.expires_at IS NULL OR o.expires_at > now())
      ORDER BY o.set_at DESC
    `,
    [flagKey ?? null]
  );
  return res.rows;
}

// A flag_key must be a stable UPPER_SNAKE identifier, never a UUID. A company/entity UUID getting written
// as a flag_key produced a junk lib.feature_flags row that is not a real flag (2026-07-12). Reject it at the
// app boundary; the DB CHECK constraint (migration 202607360000) is the belt-and-suspenders enforcement.
const UUID_SHAPED_KEY_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Throw if `flagKey` is UUID-shaped (a company/entity id mistakenly used as a flag key) or empty. */
export function assertPlausibleFlagKey(flagKey: string): void {
  if (!flagKey || !flagKey.trim()) throw new Error("invalid_flag_key_empty");
  if (UUID_SHAPED_KEY_RE.test(flagKey.trim())) throw new Error("invalid_flag_key_uuid_shaped");
}

export async function createFlag(
  client: Queryable,
  input: { flag_key: string; description?: string | null; default_enabled?: boolean; rollout_pct?: number }
) {
  assertPlausibleFlagKey(input.flag_key);
  const res = await client.query<FeatureFlagRow>(
    `
      INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
      VALUES ($1, $2, COALESCE($3, false), COALESCE($4, 0))
      RETURNING flag_key, description, default_enabled, rollout_pct
    `,
    [input.flag_key, input.description ?? null, input.default_enabled ?? false, input.rollout_pct ?? 0]
  );
  return res.rows[0];
}

export async function updateFlag(
  client: Queryable,
  flagKey: string,
  input: { description?: string | null; default_enabled?: boolean; rollout_pct?: number }
) {
  const res = await client.query<FeatureFlagRow>(
    `
      UPDATE lib.feature_flags
      SET description = COALESCE($2, description),
          default_enabled = COALESCE($3, default_enabled),
          rollout_pct = COALESCE($4, rollout_pct)
      WHERE flag_key = $1
      RETURNING flag_key, description, default_enabled, rollout_pct
    `,
    [flagKey, input.description ?? null, input.default_enabled ?? null, input.rollout_pct ?? null]
  );
  return res.rows[0] ?? null;
}

export async function setOverride(
  client: Queryable,
  input: {
    flag_key: string;
    operating_company_id?: string | null;
    user_uuid?: string | null;
    enabled: boolean;
    set_by_user_uuid: string;
    expires_at?: string | null;
  }
) {
  assertPlausibleFlagKey(input.flag_key);
  if (!input.operating_company_id && !input.user_uuid) {
    throw new Error("override_target_required");
  }

  // FACT-01 / owner WO 2026-07-29 — FACTORING_GL_POSTING_ENABLED for TRANSP + USMCA only.
  // TRK is the asset holder / not a Faro borrower — refuse enabling there.
  // Owner WO 2026-07-29: TRANSP + USMCA may enable; TRK is asset holder / not a factorer — refuse.
  if (input.flag_key === "FACTORING_GL_POSTING_ENABLED" && input.operating_company_id && input.enabled) {
    const co = await client.query<{ code: string }>(
      `SELECT code FROM org.companies WHERE id = $1::uuid LIMIT 1`,
      [input.operating_company_id]
    );
    const code = co.rows[0]?.code ?? "";
    if (code !== "TRANSP" && code !== "USMCA") {
      throw new Error("factoring_flag_transp_usmca_only");
    }
  }

  if (input.user_uuid) {
    const res = await client.query<FeatureFlagOverrideRow>(
      `
        INSERT INTO lib.feature_flag_overrides (
          flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid, expires_at
        )
        VALUES ($1, NULL, $2::uuid, $3, $4::uuid, $5::timestamptz)
        ON CONFLICT (flag_key, user_uuid) WHERE user_uuid IS NOT NULL
        DO UPDATE SET enabled = EXCLUDED.enabled,
                      set_by_user_uuid = EXCLUDED.set_by_user_uuid,
                      set_at = now(),
                      expires_at = EXCLUDED.expires_at
        RETURNING uuid::text, flag_key, operating_company_id::text, user_uuid::text, enabled,
                  set_by_user_uuid::text, set_at::text, expires_at::text
      `,
      [input.flag_key, input.user_uuid, input.enabled, input.set_by_user_uuid, input.expires_at ?? null]
    );
    return res.rows[0];
  }

  const res = await client.query<FeatureFlagOverrideRow>(
    `
      INSERT INTO lib.feature_flag_overrides (
        flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid, expires_at
      )
      VALUES ($1, $2::uuid, NULL, $3, $4::uuid, $5::timestamptz)
      ON CONFLICT (flag_key, operating_company_id) WHERE user_uuid IS NULL AND operating_company_id IS NOT NULL
      DO UPDATE SET enabled = EXCLUDED.enabled,
                    set_by_user_uuid = EXCLUDED.set_by_user_uuid,
                    set_at = now(),
                    expires_at = EXCLUDED.expires_at
      RETURNING uuid::text, flag_key, operating_company_id::text, user_uuid::text, enabled,
                set_by_user_uuid::text, set_at::text, expires_at::text
    `,
    [input.flag_key, input.operating_company_id, input.enabled, input.set_by_user_uuid, input.expires_at ?? null]
  );
  return res.rows[0];
}

export async function removeOverride(client: Queryable, overrideUuid: string) {
  const res = await client.query<{ uuid: string }>(
    `
      DELETE FROM lib.feature_flag_overrides
      WHERE uuid = $1::uuid
      RETURNING uuid::text
    `,
    [overrideUuid]
  );
  return res.rows[0] ?? null;
}
