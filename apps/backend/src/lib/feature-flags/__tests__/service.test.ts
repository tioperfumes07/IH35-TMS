import { describe, expect, it } from "vitest";
import {
  isPostingFlag,
  isRolloutEnabled,
  resolveFlagEnabled,
  rolloutBucket,
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
