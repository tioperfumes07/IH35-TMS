import { describe, expect, it, vi } from "vitest";
import { assertAccessibleCompanyScope } from "../routes.js";

vi.mock("../../../auth/db.js", () => ({
  withCurrentUser: vi.fn(),
}));
vi.mock("../../../auth/session-middleware.js", () => ({
  requireAuth: vi.fn(),
}));

describe("multi-entity company scope access", () => {
  it("returns true when all requested companies are accessible", async () => {
    const query = vi.fn(async () => ({
      rows: [{ id: "11111111-1111-4111-8111-111111111111" }, { id: "22222222-2222-4222-8222-222222222222" }],
    }));
    const ok = await assertAccessibleCompanyScope(
      { query },
      {
        user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "Administrator",
        operating_company_ids: ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"],
      }
    );
    expect(ok).toBe(true);
  });

  it("returns false when at least one company is not accessible", async () => {
    const query = vi.fn(async () => ({
      rows: [{ id: "11111111-1111-4111-8111-111111111111" }],
    }));
    const ok = await assertAccessibleCompanyScope(
      { query },
      {
        user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "Accountant",
        operating_company_ids: ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"],
      }
    );
    expect(ok).toBe(false);
  });
});
