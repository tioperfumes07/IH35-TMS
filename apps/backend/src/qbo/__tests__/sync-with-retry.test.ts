import { describe, expect, it, vi } from "vitest";
import { qboSyncWithRetry } from "../sync-with-retry.js";

vi.mock("../../auth/db.js", () => {
  const mkClient = () => ({
    query: vi.fn(async (sql: string) => {
      if (sql.includes("to_regclass('qbo.sync_alerts')")) return { rows: [{ ok: false }] };
      return { rows: [] };
    }),
    release: vi.fn(),
  });

  return {
    pool: {
      connect: vi.fn(async () => mkClient()),
    },
  };
});

describe("qboSyncWithRetry", () => {
  it("returns on first successful attempt", async () => {
    const attempt = vi.fn().mockResolvedValue("ok");
    const result = await qboSyncWithRetry({
      operatingCompanyId: "00000000-0000-4000-8000-0000000000aa",
      entityType: "test_entity",
      operation: "sync",
      attempt,
      swallow_errors: false,
    });
    expect(result).toBe("ok");
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it(
    "swallows errors after exhausting attempts when configured",
    async () => {
      const attempt = vi.fn().mockRejectedValue(new Error("always fails"));
      const result = await qboSyncWithRetry({
        operatingCompanyId: "00000000-0000-4000-8000-0000000000aa",
        entityType: "test_entity",
        operation: "sync",
        attempt,
        swallow_errors: true,
      });
      expect(result).toBeNull();
      expect(attempt).toHaveBeenCalledTimes(3);
    },
    15_000
  );

  it(
    "throws after exhausting attempts when swallow_errors is false",
    async () => {
      const attempt = vi.fn().mockRejectedValue(new Error("always fails"));
      await expect(
        qboSyncWithRetry({
          operatingCompanyId: "00000000-0000-4000-8000-0000000000aa",
          entityType: "test_entity",
          operation: "sync",
          attempt,
          swallow_errors: false,
        })
      ).rejects.toThrow("always fails");
      expect(attempt).toHaveBeenCalledTimes(3);
    },
    15_000
  );
});
