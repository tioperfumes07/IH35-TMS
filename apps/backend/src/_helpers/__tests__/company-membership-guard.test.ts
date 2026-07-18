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

    const sql = String(vi.mocked(activeClient.query).mock.calls[0]?.[0]);
    expect(sql).toContain("JOIN org.companies c");
    expect(sql).toContain("uca.deactivated_at IS NULL");
    expect(sql).toContain("c.is_active = true");
    expect(sql).toContain("c.deactivated_at IS NULL");
  });

  it("uses the caller transaction client when provided", async () => {
    activeClient.query = vi.fn(async () => ({ rows: [{ ok: 1 }], rowCount: 1 }));

    await expect(
      assertCompanyMembership(
        activeClient,
        "11111111-1111-1111-1111-111111111111",
        "22222222-2222-2222-2222-222222222222"
      )
    ).resolves.toBeUndefined();

    expect(activeClient.query).toHaveBeenCalledTimes(1);
  });

  it("throws 403 when user does not belong to company", async () => {
    await expect(
      assertCompanyMembership("11111111-1111-1111-1111-111111111111", "33333333-3333-3333-3333-333333333333")
    ).rejects.toMatchObject({ message: "forbidden_company_membership", statusCode: 403 });
  });

  it("throws 403 when the matching access row is deactivated", async () => {
    activeClient.query = vi.fn(async (sql) => {
      expect(sql).toContain("uca.deactivated_at IS NULL");
      return { rows: [], rowCount: 0 };
    });

    await expect(
      assertCompanyMembership("11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222")
    ).rejects.toMatchObject({ message: "forbidden_company_membership", statusCode: 403 });
  });

  it("throws 403 when the company is inactive or deactivated", async () => {
    activeClient.query = vi.fn(async (sql) => {
      expect(sql).toContain("c.is_active = true");
      expect(sql).toContain("c.deactivated_at IS NULL");
      return { rows: [], rowCount: 0 };
    });

    await expect(
      assertCompanyMembership("11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222")
    ).rejects.toMatchObject({ message: "forbidden_company_membership", statusCode: 403 });
  });
});
