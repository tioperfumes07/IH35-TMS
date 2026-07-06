import { createHash } from "node:crypto";

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
};

export type FeatureFlagOverrideRow = {
  uuid: string;
  flag_key: string;
  operating_company_id: string | null;
  user_uuid: string | null;
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
  "LEASE_GL_POSTING_ENABLED",
  // Business-Property Allocation: property-tax accrual (Dr expense / Cr payable) + payment (Dr payable /
  // Cr cash) posting, per-entity override (TRANSP/TRK), default OFF. Its key matches the `*_GL_POSTING_ENABLED`
  // pattern isPostingFlag() auto-recognizes, but it is enumerated explicitly (belt-and-suspenders) so the
  // migration-coverage guard and the per-entity money kill-switch both cover it — a global flip can never
  // turn property-tax GL posting on for EVERY entity (incl. USMCA).
  "PROPERTY_TAX_GL_POSTING_ENABLED",
  "SETTLEMENT_GL_POSTING_ENABLED",
  // H3-1: BLOCK-6 driver loan/advance posting from bank categorize. It posts a BALANCED JE (DEBIT the
  // driver-advance receivable, CREDIT the source bank) via the existing driver_advance source type, so it
  // is a real money-posting flag — but its key does NOT match the `*_GL_POSTING*` / `*_POSTING_ENABLED`
  // pattern, so without enrolling it here it would fall through to the global rollout/default path and a
  // single global flip could turn posting on for EVERY entity (incl. USMCA / TRK), bypassing the
  // per-entity kill-switch. Enrolled so enable is ONLY via an explicit per-entity/user override. Default OFF.
  "BANK_DRIVER_ADVANCE_ENABLED",
  // IMPORT-P0: gates whether TMS pushes journal entries INTO QuickBooks. QBO is the system of record
  // through 12/31/2025 (double books + reconciliation, no sync-back), so this must be per-entity-only —
  // a global flip would start echoing every entity's JEs into QBO. Enable is an explicit per-entity
  // override, owner-controlled.
  "QBO_JE_PUSH_ENABLED",
  // IMPORT-P0b: same, for the six entity write-back handlers (invoice/bill/customer/vendor/account/item).
  // Per-entity-only; default OFF; a global flip would start echoing every entity's masterdata + AR/AP into QBO.
  "QBO_ENTITY_PUSH_ENABLED",
]);

export function isPostingFlag(flagKey: string): boolean {
  return (
    POSTING_FLAG_KEYS.has(flagKey) ||
    /_GL_POSTING(_ENABLED)?$/.test(flagKey) ||
    /_POSTING_ENABLED$/.test(flagKey)
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
      SELECT flag_key, description, default_enabled, rollout_pct
      FROM lib.feature_flags
      WHERE flag_key = $1
    `,
    [flagKey]
  );
  const flag = flagRes.rows[0];
  if (!flag) return false;

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
      SELECT uuid::text, flag_key, operating_company_id::text, user_uuid::text, enabled,
             set_by_user_uuid::text, set_at::text, expires_at::text
      FROM lib.feature_flag_overrides
      WHERE ($1::text IS NULL OR flag_key = $1)
        AND (expires_at IS NULL OR expires_at > now())
      ORDER BY set_at DESC
    `,
    [flagKey ?? null]
  );
  return res.rows;
}

export async function createFlag(
  client: Queryable,
  input: { flag_key: string; description?: string | null; default_enabled?: boolean; rollout_pct?: number }
) {
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
  if (!input.operating_company_id && !input.user_uuid) {
    throw new Error("override_target_required");
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
      ON CONFLICT (flag_key, operating_company_id) WHERE user_uuid IS NULL
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
