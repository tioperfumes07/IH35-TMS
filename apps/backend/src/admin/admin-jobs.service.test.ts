import { describe, expect, it } from "vitest";
import { buildIdempotencyKey } from "./admin-jobs.service.js";

describe("buildIdempotencyKey", () => {
  it("builds stable replay key for same payload", () => {
    const a = buildIdempotencyKey({
      operation: "qbo.inbound.replay_since",
      operatingCompanyId: "11111111-1111-1111-1111-111111111111",
      realmId: "realm-1",
      sinceIso: "2026-05-21T00:00:00.000Z",
    });
    const b = buildIdempotencyKey({
      operation: "qbo.inbound.replay_since",
      operatingCompanyId: "11111111-1111-1111-1111-111111111111",
      realmId: "realm-1",
      sinceIso: "2026-05-21T00:00:00.000Z",
    });
    expect(a).toBe(b);
  });

  it("coalesces deep-health keys by minute bucket", () => {
    const a = buildIdempotencyKey({
      operation: "admin.health.deep.refresh",
      operatingCompanyId: "22222222-2222-2222-2222-222222222222",
      integration: "deep_health",
      nowMs: 1_000_000,
    });
    const b = buildIdempotencyKey({
      operation: "admin.health.deep.refresh",
      operatingCompanyId: "22222222-2222-2222-2222-222222222222",
      integration: "deep_health",
      nowMs: 1_010_000,
    });
    const c = buildIdempotencyKey({
      operation: "admin.health.deep.refresh",
      operatingCompanyId: "22222222-2222-2222-2222-222222222222",
      integration: "deep_health",
      nowMs: 1_120_000,
    });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
