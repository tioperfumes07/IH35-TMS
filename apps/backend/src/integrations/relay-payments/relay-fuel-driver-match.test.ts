import { describe, expect, it, vi } from "vitest";
import { resolveRelayDriverMatch } from "./relay-fuel-driver-match.js";
import type { DbClient } from "./db-client.type.js";

function mockClient(responses: Array<{ rows: Array<{ id: string }> }>): DbClient {
  let i = 0;
  return {
    query: vi.fn(async () => {
      const next = responses[i] ?? { rows: [] };
      i += 1;
      return next;
    }),
  } as unknown as DbClient;
}

// Relay (relayed 2026-10-03): "use the integration_id to match transactions". integration_id is the ONLY key —
// no phone, name, email, Relay driver.id or card fallback; an unmatched driver stays unresolved with a reason.
describe("resolveRelayDriverMatch — integration_id only", () => {
  it("matches the one active driver carrying the Relay integration_id", async () => {
    const client = mockClient([{ rows: [{ id: "drv-int" }] }]);
    const match = await resolveRelayDriverMatch(client, "opco", "8029341864745431");
    expect(match).toEqual({ driver_id: "drv-int", unresolved_reason: null });
    expect(client.query).toHaveBeenCalledTimes(1);
    const [sql, params] = (client.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toMatch(/integration_id = \$2/);
    expect(sql).not.toMatch(/phone|first_name|last_name|email/);
    expect(params).toEqual(["opco", "8029341864745431"]);
  });

  it("does NOT fall back to phone or name when integration_id misses — unresolved with a reason", async () => {
    const client = mockClient([{ rows: [] }, { rows: [{ id: "drv-phone" }] }]);
    const match = await resolveRelayDriverMatch(client, "opco", "8029341864745431");
    expect(match).toEqual({ driver_id: null, unresolved_reason: "no_active_driver_with_integration_id" });
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it("leaves a fill with no integration_id unresolved without touching the DB", async () => {
    for (const missing of [null, "", "   "]) {
      const client = mockClient([{ rows: [{ id: "would-be-a-guess" }] }]);
      const match = await resolveRelayDriverMatch(client, "opco", missing);
      expect(match).toEqual({ driver_id: null, unresolved_reason: "relay_integration_id_missing" });
      expect(client.query).not.toHaveBeenCalled();
    }
  });

  it("treats Relay's all-zero placeholder as no key", async () => {
    const client = mockClient([{ rows: [{ id: "drv" }] }]);
    const match = await resolveRelayDriverMatch(client, "opco", "0000000000000000");
    expect(match).toEqual({ driver_id: null, unresolved_reason: "relay_integration_id_placeholder" });
    expect(client.query).not.toHaveBeenCalled();
  });

  it("never picks among several drivers", async () => {
    const client = mockClient([{ rows: [{ id: "a" }, { id: "b" }] }]);
    const match = await resolveRelayDriverMatch(client, "opco", "123");
    expect(match).toEqual({ driver_id: null, unresolved_reason: "integration_id_matches_multiple_drivers" });
  });
});
