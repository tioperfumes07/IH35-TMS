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
  "EXPENSE_GL_POSTING_ENABLED",
  "FACTORING_GL_POSTING_ENABLED",
  "INVOICE_AR_GL_POSTING_ENABLED",
  "LEASE_GL_POSTING_ENABLED",
  "SETTLEMENT_GL_POSTING_ENABLED",
]);

export function isPostingFlag(flagKey: string): boolean {
  return (
    POSTING_FLAG_KEYS.has(flagKey) ||
    /_GL_POSTING(_ENABLED)?$/.test(flagKey) ||
    /_POSTING_ENABLED$/.test(flagKey)
  );
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

  // Posting flags stop here: with no explicit per-entity/user override above, a money-posting flag is
  // OFF. Global rollout_pct / default_enabled can never turn it on (would enable posting for all
  // entities). This is the enforcement half of the per-entity kill-switch.
  if (isPostingFlag(flag.flag_key)) {
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
  return res.rows;
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
