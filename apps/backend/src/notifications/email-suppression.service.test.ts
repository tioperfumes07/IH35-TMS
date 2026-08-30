import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();

vi.mock("../auth/db.js", () => ({
  withLuciaBypass: async (fn: (client: { query: typeof query }) => unknown) => fn({ query }),
}));

describe("email suppression provenance", () => {
  beforeEach(() => query.mockReset());

  it("returns the active rule's reason and automatic provenance", async () => {
    query
      .mockResolvedValueOnce({ rows: [{ regclass: "notifications.suppression_rules" }] })
      .mockResolvedValueOnce({ rows: [{ reason: "provider_bounce", auto_suppressed: true }] });
    const { findActiveSuppression } = await import("./email.service.js");

    await expect(findActiveSuppression("00000000-0000-4000-8000-000000000001", "dispatch.delay"))
      .resolves.toEqual({ reason: "provider_bounce", auto_suppressed: true });

    expect(query.mock.calls[1]?.[0]).toContain("SELECT reason, auto_suppressed");
    expect(query.mock.calls[1]?.[0]).toContain("ORDER BY effective_from DESC, created_at DESC");
    expect(query.mock.calls[1]?.[0]).toContain("LIMIT 1");
  });

  it("returns null when no active rule matches", async () => {
    query
      .mockResolvedValueOnce({ rows: [{ regclass: "notifications.suppression_rules" }] })
      .mockResolvedValueOnce({ rows: [] });
    const { findActiveSuppression } = await import("./email.service.js");
    await expect(findActiveSuppression("00000000-0000-4000-8000-000000000001", "dispatch.delay"))
      .resolves.toBeNull();
  });

  it("fails closed when the suppression control is absent", async () => {
    query.mockResolvedValueOnce({ rows: [{ regclass: null }] });
    const { findActiveSuppression } = await import("./email.service.js");
    await expect(findActiveSuppression("00000000-0000-4000-8000-000000000001", "dispatch.delay"))
      .rejects.toThrow("E_SUPPRESSION_CONTROL_UNAVAILABLE");
  });
});
