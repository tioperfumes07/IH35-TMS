import { describe, expect, it, vi } from "vitest";

const assertTenantContextMock = vi.fn();
vi.mock("../_helpers/tenant-context-guard.js", () => ({
  assertTenantContext: (...args: unknown[]) => assertTenantContextMock(...args),
}));

import { runCollectionsSyncCronTick } from "../collections-sync.cron.js";

describe("collections-sync cron tenant guard", () => {
  it("calls assertTenantContext for each live operating company (USMCA only — ACCT-F11123)", async () => {
    assertTenantContextMock.mockClear();
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FROM org.companies")) {
          return {
            rows: [
              { operating_company_id: "5c854333-6ea5-4faa-af31-67cb272fef80" },
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

    expect(assertTenantContextMock).toHaveBeenCalledTimes(1);
    expect(assertTenantContextMock).toHaveBeenNthCalledWith(
      1,
      "5c854333-6ea5-4faa-af31-67cb272fef80",
      "accounting.collections_sync_cron"
    );
  });
});
