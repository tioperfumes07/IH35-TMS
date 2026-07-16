import { describe, expect, it, vi } from "vitest";
import {
  isEnabled,
  isPerEntityGatedFlag,
  isPerEntityOnlyFlag,
  isPostingFlag,
  isRolloutEnabled,
  POSTING_FLAG_KEYS,
  resolveFlagEnabled,
  rolloutBucket,
  setOverride,
  type FeatureFlagOverrideRow,
  type FeatureFlagRow,
} from "../service.js";

const FLAG: FeatureFlagRow = {
  flag_key: "usmca_hidden",
  description: "USMCA carrier UI",
  default_enabled: false,
  rollout_pct: 50,
};

function override(partial: Partial<FeatureFlagOverrideRow>): FeatureFlagOverrideRow {
  return {
    uuid: "11111111-1111-4111-8111-111111111111",
    flag_key: FLAG.flag_key,
    operating_company_id: null,
    user_uuid: null,
    enabled: true,
    set_by_user_uuid: "22222222-2222-4222-8222-222222222222",
    set_at: "2026-01-01T00:00:00Z",
    expires_at: null,
    ...partial,
  };
}

describe("rolloutBucket", () => {
  it("is deterministic for the same flag and user", () => {
    const user = "33333333-3333-4333-8333-333333333333";
    expect(rolloutBucket(FLAG.flag_key, user)).toBe(rolloutBucket(FLAG.flag_key, user));
  });

  it("returns values in 0..9999 range", () => {
    const bucket = rolloutBucket(FLAG.flag_key, "44444444-4444-4444-8444-444444444444");
    expect(bucket).toBeGreaterThanOrEqual(0);
    expect(bucket).toBeLessThan(10000);
  });
});

describe("isRolloutEnabled", () => {
  it("returns false at 0% rollout", () => {
    expect(isRolloutEnabled(FLAG.flag_key, "user-a", 0)).toBe(false);
  });

  it("returns true at 100% rollout", () => {
    expect(isRolloutEnabled(FLAG.flag_key, "user-a", 100)).toBe(true);
  });
});

describe("resolveFlagEnabled", () => {
  it("prefers user override over tenant override", () => {
    const enabled = resolveFlagEnabled(
      FLAG,
      [
        override({ user_uuid: "user-1", enabled: false }),
        override({ operating_company_id: "company-1", enabled: true }),
      ],
      { user_uuid: "user-1", operating_company_id: "company-1" }
    );
    expect(enabled).toBe(false);
  });

  it("uses tenant override when no user override exists", () => {
    const enabled = resolveFlagEnabled(
      FLAG,
      [override({ operating_company_id: "company-1", enabled: true })],
      { user_uuid: "user-1", operating_company_id: "company-1" }
    );
    expect(enabled).toBe(true);
  });

  it("ignores expired overrides", () => {
    const enabled = resolveFlagEnabled(
      FLAG,
      [override({ user_uuid: "user-1", enabled: true, expires_at: "2020-01-01T00:00:00Z" })],
      { user_uuid: "user-1", operating_company_id: "company-1" }
    );
    expect(enabled).toBe(false);
  });

  it("falls back to default_enabled when no overrides match", () => {
    const enabled = resolveFlagEnabled(FLAG, [], { user_uuid: "user-1", operating_company_id: "company-1" });
    expect(enabled).toBe(false);
  });

  it("uses rollout pct before default when user is present", () => {
    const user = "55555555-5555-4555-8555-555555555555";
    const flagWithRollout: FeatureFlagRow = { ...FLAG, default_enabled: false, rollout_pct: 100 };
    expect(resolveFlagEnabled(flagWithRollout, [], { user_uuid: user })).toBe(true);
  });
});

describe("isPostingFlag", () => {
  it("recognizes known posting flag keys", () => {
    for (const key of [
      "FACTORING_GL_POSTING_ENABLED",
      "BILL_GL_POSTING_ENABLED",
      "INVOICE_AR_GL_POSTING_ENABLED",
      "SETTLEMENT_GL_POSTING_ENABLED",
      "GL_POSTING_ENABLED",
    ]) {
      expect(isPostingFlag(key)).toBe(true);
    }
  });

  it("recognizes future posting flags by pattern", () => {
    expect(isPostingFlag("SOMETHING_NEW_GL_POSTING_ENABLED")).toBe(true);
    expect(isPostingFlag("PAYROLL_POSTING_ENABLED")).toBe(true);
  });

  it("does not treat non-posting flags as posting flags", () => {
    expect(isPostingFlag("usmca_hidden")).toBe(false);
    expect(isPostingFlag("QBO_RECONCILE_UI_ENABLED")).toBe(false);
  });
});

describe("resolveFlagEnabled — posting flags are per-entity-only", () => {
  const POSTING: FeatureFlagRow = {
    flag_key: "FACTORING_GL_POSTING_ENABLED",
    description: "Factoring GL posting",
    default_enabled: false,
    rollout_pct: 0,
  };
  const postingOverride = (partial: Partial<FeatureFlagOverrideRow>): FeatureFlagOverrideRow => ({
    ...override(partial),
    flag_key: POSTING.flag_key,
  });

  it("stays OFF when global default_enabled is true (global default ignored)", () => {
    const flag: FeatureFlagRow = { ...POSTING, default_enabled: true };
    expect(resolveFlagEnabled(flag, [], { operating_company_id: "company-1", user_uuid: "user-1" })).toBe(false);
  });

  it("stays OFF when global rollout is 100% (global rollout ignored)", () => {
    const flag: FeatureFlagRow = { ...POSTING, rollout_pct: 100 };
    expect(resolveFlagEnabled(flag, [], { user_uuid: "user-1" })).toBe(false);
  });

  it("turns ON only via an explicit per-entity override", () => {
    expect(
      resolveFlagEnabled(
        POSTING,
        [postingOverride({ operating_company_id: "company-1", enabled: true })],
        { operating_company_id: "company-1" }
      )
    ).toBe(true);
  });

  it("honors an explicit per-entity OFF override", () => {
    const flag: FeatureFlagRow = { ...POSTING, default_enabled: true };
    expect(
      resolveFlagEnabled(
        flag,
        [postingOverride({ operating_company_id: "company-1", enabled: false })],
        { operating_company_id: "company-1" }
      )
    ).toBe(false);
  });

  it("one entity's ON override does not leak to another entity", () => {
    const overrides = [postingOverride({ operating_company_id: "company-1", enabled: true })];
    expect(resolveFlagEnabled(POSTING, overrides, { operating_company_id: "company-2" })).toBe(false);
  });
});

describe("isPerEntityOnlyFlag / isPerEntityGatedFlag (FLAG-HARDEN-1)", () => {
  it("recognizes the RATECON per-entity-only key", () => {
    expect(isPerEntityOnlyFlag("RATECON_EXTRACT_ENABLED")).toBe(true);
    expect(isPerEntityGatedFlag("RATECON_EXTRACT_ENABLED")).toBe(true);
  });

  it("recognizes future per-entity-only flags by the naming-convention suffix", () => {
    expect(isPerEntityOnlyFlag("SOME_FEATURE_PER_ENTITY_ONLY")).toBe(true);
  });

  it("recognizes the FLAG-SPLIT-BRAIN read-only finance-surface keys as per-entity-only", () => {
    // These now resolve the SAME DB flag their frontend reads (kills the process.env split-brain) and
    // are per-entity owner-flipped — a global default/rollout must never enable them.
    expect(isPerEntityOnlyFlag("AR_AP_AGING_UI_ENABLED")).toBe(true);
    expect(isPerEntityOnlyFlag("QBO_RECONCILE_UI_ENABLED")).toBe(true);
    expect(isPerEntityOnlyFlag("FINANCE_BREAK_EVEN_UI_ENABLED")).toBe(true);
    expect(isPerEntityGatedFlag("AR_AP_AGING_UI_ENABLED")).toBe(true);
  });

  it("does not treat ordinary rollout flags as per-entity-only", () => {
    expect(isPerEntityOnlyFlag("usmca_hidden")).toBe(false);
  });

  it("per-entity-gated covers posting flags too", () => {
    expect(isPerEntityGatedFlag("FACTORING_GL_POSTING_ENABLED")).toBe(true);
    expect(isPerEntityOnlyFlag("FACTORING_GL_POSTING_ENABLED")).toBe(false); // posting, not per-entity-only
  });
});

describe("resolveFlagEnabled — per-entity-only flags ignore global default/rollout (FLAG-HARDEN-1)", () => {
  const RATECON: FeatureFlagRow = {
    flag_key: "RATECON_EXTRACT_ENABLED",
    description: "Rate-con AI extraction",
    default_enabled: false,
    rollout_pct: 0,
  };
  const rateconOverride = (partial: Partial<FeatureFlagOverrideRow>): FeatureFlagOverrideRow => ({
    ...override(partial),
    flag_key: RATECON.flag_key,
  });

  it("stays OFF when global rollout is 100% and endpoint passes no user_uuid (the live defect)", () => {
    const flag: FeatureFlagRow = { ...RATECON, rollout_pct: 100 };
    // The extract endpoint calls isEnabled with operating_company_id only — rollout must NOT flip it on.
    expect(resolveFlagEnabled(flag, [], { operating_company_id: "91e0bf0a-133f-4ce8-a734-2586cfa66d96" })).toBe(false);
  });

  it("stays OFF when global rollout is 100% even with a user_uuid (no cross-entity leak)", () => {
    const flag: FeatureFlagRow = { ...RATECON, rollout_pct: 100 };
    expect(resolveFlagEnabled(flag, [], { user_uuid: "user-1" })).toBe(false);
  });

  it("stays OFF when global default_enabled is true", () => {
    const flag: FeatureFlagRow = { ...RATECON, default_enabled: true };
    expect(resolveFlagEnabled(flag, [], { operating_company_id: "company-1", user_uuid: "user-1" })).toBe(false);
  });

  it("turns ON only via an explicit per-entity (tenant) override — the TRANSP live path", () => {
    const transp = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
    expect(
      resolveFlagEnabled(RATECON, [rateconOverride({ operating_company_id: transp, enabled: true })], {
        operating_company_id: transp,
      })
    ).toBe(true);
  });

  it("one entity's ON override does not leak to another entity", () => {
    const overrides = [rateconOverride({ operating_company_id: "company-1", enabled: true })];
    expect(resolveFlagEnabled(RATECON, overrides, { operating_company_id: "company-2" })).toBe(false);
  });
});

// H3-1 — BANK_DRIVER_ADVANCE_ENABLED is a REAL money-posting flag (BLOCK-6 posts a balanced driver-advance
// JE). Its key does NOT match the `*_GL_POSTING*` / `*_POSTING_ENABLED` pattern, so it must be enrolled in
// POSTING_FLAG_KEYS explicitly or it silently falls through to the global rollout/default path — a global
// flip would enable posting for EVERY entity, bypassing the per-entity money kill-switch.
describe("BANK_DRIVER_ADVANCE_ENABLED is under the per-entity posting kill-switch (H3-1)", () => {
  const FLAG_KEY = "BANK_DRIVER_ADVANCE_ENABLED";

  it("is enrolled in POSTING_FLAG_KEYS and classified as a posting / per-entity-gated flag", () => {
    expect(POSTING_FLAG_KEYS.has(FLAG_KEY)).toBe(true);
    expect(isPostingFlag(FLAG_KEY)).toBe(true);
    expect(isPerEntityGatedFlag(FLAG_KEY)).toBe(true);
    // It is a posting flag, not a (non-posting) per-entity-only flag.
    expect(isPerEntityOnlyFlag(FLAG_KEY)).toBe(false);
  });

  // A minimal mock of the real isEnabled() DB path: it issues EXACTLY TWO reads — (1) lib.feature_flags for
  // the flag row, then (2) lib.feature_flag_overrides for matching per-entity/user overrides. Both are
  // mocked so the resolver runs end-to-end through isEnabled(), not just resolveFlagEnabled() in isolation.
  function makeClient(opts: {
    flag: FeatureFlagRow | null;
    overrides: FeatureFlagOverrideRow[];
  }) {
    const queries: string[] = [];
    const client = {
      query: async <R = Record<string, unknown>>(sql: string) => {
        queries.push(sql);
        if (/FROM\s+lib\.feature_flags\b/i.test(sql)) {
          return { rows: (opts.flag ? [opts.flag] : []) as R[] };
        }
        if (/FROM\s+lib\.feature_flag_overrides\b/i.test(sql)) {
          return { rows: opts.overrides as unknown as R[] };
        }
        throw new Error(`unexpected query: ${sql}`);
      },
    };
    return { client, queries };
  }

  const postingFlag: FeatureFlagRow = {
    flag_key: FLAG_KEY,
    description: "BLOCK-6 driver advance posting",
    default_enabled: false,
    rollout_pct: 0,
  };

  it("stays OFF via isEnabled even when global default_enabled=true + rollout=100 (both reads issued)", async () => {
    const { client, queries } = makeClient({
      flag: { ...postingFlag, default_enabled: true, rollout_pct: 100 },
      overrides: [],
    });
    const enabled = await isEnabled(client, FLAG_KEY, {
      operating_company_id: "91e0bf0a-133f-4ce8-a734-2586cfa66d96",
      user_uuid: "user-1",
    });
    expect(enabled).toBe(false);
    // Both the flag read and the override read were issued.
    expect(queries.some((q) => /FROM\s+lib\.feature_flags\b/i.test(q))).toBe(true);
    expect(queries.some((q) => /FROM\s+lib\.feature_flag_overrides\b/i.test(q))).toBe(true);
  });

  it("turns ON via isEnabled ONLY through an explicit per-entity override", async () => {
    const transp = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
    const { client } = makeClient({
      flag: postingFlag,
      overrides: [
        {
          uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          flag_key: FLAG_KEY,
          operating_company_id: transp,
          user_uuid: null,
          enabled: true,
          set_by_user_uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          set_at: "2026-01-01T00:00:00Z",
          expires_at: null,
        },
      ],
    });
    expect(await isEnabled(client, FLAG_KEY, { operating_company_id: transp })).toBe(true);
  });

  it("one entity's ON override does not leak to another entity via isEnabled", async () => {
    // The override read is scoped by operating_company_id, so a different entity gets no matching row.
    const { client } = makeClient({ flag: postingFlag, overrides: [] });
    expect(await isEnabled(client, FLAG_KEY, { operating_company_id: "company-2" })).toBe(false);
  });
});

describe("setOverride ON CONFLICT targets match partial unique indexes", () => {
  const actor = "22222222-2222-4222-8222-222222222222";
  const companyId = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
  const userId = "33333333-3333-4333-8333-333333333333";

  function makeClient() {
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    const client = {
      query: vi.fn(async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values });
        return {
          rows: [
            {
              uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              flag_key: "TEST_FLAG",
              operating_company_id: companyId,
              user_uuid: null,
              enabled: true,
              set_by_user_uuid: actor,
              set_at: "2026-01-01T00:00:00Z",
              expires_at: null,
            },
          ],
        };
      }),
    };
    return { client, calls };
  }

  it("tenant override uses idx_ff_override_oci predicate exactly", async () => {
    const { client, calls } = makeClient();
    await setOverride(client, {
      flag_key: "TEST_FLAG",
      operating_company_id: companyId,
      enabled: true,
      set_by_user_uuid: actor,
    });
    const insert = calls.find((entry) => entry.sql.includes("INSERT INTO lib.feature_flag_overrides"));
    expect(insert?.sql).toContain(
      "ON CONFLICT (flag_key, operating_company_id) WHERE user_uuid IS NULL AND operating_company_id IS NOT NULL"
    );
    expect(insert?.sql).not.toMatch(
      /ON CONFLICT \(flag_key, operating_company_id\) WHERE user_uuid IS NULL\s*\n\s*DO UPDATE/
    );
  });

  it("user override uses idx_ff_override_user predicate exactly", async () => {
    const { client, calls } = makeClient();
    await setOverride(client, {
      flag_key: "TEST_FLAG",
      user_uuid: userId,
      enabled: true,
      set_by_user_uuid: actor,
    });
    const insert = calls.find((entry) => entry.sql.includes("INSERT INTO lib.feature_flag_overrides"));
    expect(insert?.sql).toContain("ON CONFLICT (flag_key, user_uuid) WHERE user_uuid IS NOT NULL");
  });
});
