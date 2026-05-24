import { describe, expect, it, vi } from "vitest";

const assertTenantContextMock = vi.fn();
vi.mock("../_helpers/tenant-context-guard.js", () => ({
  assertTenantContext: (...args: unknown[]) => assertTenantContextMock(...args),
}));

import { runCollectionsSyncCronTick } from "../collections-sync.cron.js";

describe("collections-sync cron tenant guard", () => {
  it("calls assertTenantContext for each operating company", async () => {
    assertTenantContextMock.mockClear();
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FROM org.companies")) {
          return {
            rows: [
              { operating_company_id: "11111111-1111-1111-1111-111111111111" },
              { operating_company_id: "22222222-2222-2222-2222-222222222222" },
            ],
          };
        }
        return { rows: [] };
      }),
    };

    await runCollectionsSyncCronTick({
      withLuciaBypassImpl: async (fn) => fn(client as never),
      syncCollectionTasksImpl: async () => ({ created: 0, updated: 0, resolved: 0, open_count: 0 }),
    });

    expect(assertTenantContextMock).toHaveBeenNthCalledWith(
      1,
      "11111111-1111-1111-1111-111111111111",
      "accounting.collections_sync_cron"
    );
    expect(assertTenantContextMock).toHaveBeenNthCalledWith(
      2,
      "22222222-2222-2222-2222-222222222222",
      "accounting.collections_sync_cron"
    );
  });
});
