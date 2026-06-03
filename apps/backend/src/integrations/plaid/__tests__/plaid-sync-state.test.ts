import { describe, expect, it, vi, beforeEach } from "vitest";
import { markPlaidItemSyncSucceeded, plaidManualSyncErrorResponse } from "../plaid-sync-state.js";

vi.mock("../../../auth/db.js", () => ({
  withLuciaBypass: vi.fn(async (fn: (client: { query: ReturnType<typeof vi.fn> }) => Promise<unknown>) =>
    fn({ query: vi.fn() })
  ),
}));

describe("plaid sync state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes last_synced_at and active status after successful sync", async () => {
    const query = vi.fn(async (sql: string) => {
      expect(sql).toContain("last_synced_at = now()");
      expect(sql).toContain("sync_status = 'active'");
      return { rowCount: 2 };
    });

    const { withLuciaBypass } = await import("../../../auth/db.js");
    vi.mocked(withLuciaBypass).mockImplementationOnce(async (fn) =>
      fn({ query } as never)
    );

    const updated = await markPlaidItemSyncSucceeded("item_test_123");
    expect(updated).toBe(2);
    expect(query).toHaveBeenCalledOnce();
  });

  it("maps ITEM_LOGIN_REQUIRED to reconnect response for manual sync", () => {
    const mapped = plaidManualSyncErrorResponse("ITEM_LOGIN_REQUIRED");
    expect(mapped?.statusCode).toBe(409);
    expect(mapped?.body).toMatchObject({
      error: "item_login_required",
      reconnect_required: true,
      code: "ITEM_LOGIN_REQUIRED",
    });
  });

  it("returns null for unmapped plaid error codes", () => {
    expect(plaidManualSyncErrorResponse("INSTITUTION_DOWN")).toBeNull();
  });
});
