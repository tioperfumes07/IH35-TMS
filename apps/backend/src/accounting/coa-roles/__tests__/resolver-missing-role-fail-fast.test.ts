import { describe, expect, it, vi } from "vitest";
import { CoaRoleResolutionError, resolveRoleAccount } from "../resolver.service.js";

describe("coa-roles resolver fail fast", () => {
  it("throws when no mapping or fallback is available", async () => {
    const query = vi.fn(async () => ({ rows: [] }));

    await expect(
      resolveRoleAccount(
        { query },
        "11111111-1111-4111-8111-111111111111",
        "retained_earnings"
      )
    ).rejects.toBeInstanceOf(CoaRoleResolutionError);
  });
});
