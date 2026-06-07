import { describe, expect, it } from "vitest";
import {
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
