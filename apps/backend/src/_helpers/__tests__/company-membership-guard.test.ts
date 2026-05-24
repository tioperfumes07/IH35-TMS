import { beforeEach, describe, expect, it, vi } from "vitest";

let activeClient: {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: typeof activeClient) => Promise<unknown>) => fn(activeClient),
}));

import { assertCompanyMembership } from "../company-membership-guard.js";

describe("company-membership-guard", () => {
  beforeEach(() => {
    activeClient = {
      query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    };
  });

  it("allows when user belongs to company", async () => {
    activeClient.query = vi.fn(async () => ({ rows: [{ ok: 1 }], rowCount: 1 }));
    await expect(
      assertCompanyMembership("11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222")
    ).resolves.toBeUndefined();
  });

  it("throws 403 when user does not belong to company", async () => {
    await expect(
      assertCompanyMembership("11111111-1111-1111-1111-111111111111", "33333333-3333-3333-3333-333333333333")
    ).rejects.toMatchObject({ message: "forbidden_company_membership", statusCode: 403 });
  });
});
