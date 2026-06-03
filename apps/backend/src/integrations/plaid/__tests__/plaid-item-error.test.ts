import { describe, expect, it, vi } from "vitest";
import { handleItemError } from "../plaid.service.js";

vi.mock("../../../auth/db.js", () => ({
  withLuciaBypass: vi.fn(async (fn: (client: { query: ReturnType<typeof vi.fn> }) => Promise<unknown>) =>
    fn({ query: vi.fn(async () => ({ rows: [{ id: "acct-1", institution_name: "Amex" }] })) })
  ),
}));

vi.mock("../../../notifications/email.service.js", () => ({
  sendEmail: vi.fn(async () => undefined),
}));

describe("handleItemError", () => {
  it("sets needs_reauth status when ITEM_LOGIN_REQUIRED is returned", async () => {
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      expect(sql).toContain("sync_status = $2");
      expect(params?.[1]).toBe("needs_reauth");
      return { rows: [{ id: "acct-1", institution_name: "Amex" }] };
    });

    const { withLuciaBypass } = await import("../../../auth/db.js");
    vi.mocked(withLuciaBypass).mockImplementationOnce(async (fn) => fn({ query } as never));

    await handleItemError("item_login_required", "ITEM_LOGIN_REQUIRED");
    expect(query).toHaveBeenCalled();
  });
});
