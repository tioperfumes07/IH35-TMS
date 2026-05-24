import { describe, expect, it, vi } from "vitest";

const assertTenantContextMock = vi.fn();
vi.mock("./_helpers/tenant-context-guard.js", () => ({
  assertTenantContext: (...args: unknown[]) => assertTenantContextMock(...args),
}));

import { runCollectionsSyncCronTick } from "./collections-sync.cron.js";

describe("collections-sync cron", () => {
  it("iterates active companies and syncs each tenant exactly once", async () => {
    const setConfigCalls: string[] = [];
    const syncCalls: string[] = [];
    const client = {
      query: vi.fn(async (sql: string, values?: unknown[]) => {
        if (sql.includes("FROM org.companies")) {
          return {
            rows: [
              { operating_company_id: "11111111-1111-1111-1111-111111111111" },
              { operating_company_id: "22222222-2222-2222-2222-222222222222" },
            ],
          };
        }
        if (sql.includes("set_config('app.operating_company_id'")) {
          setConfigCalls.push(String(values?.[0]));
          return { rows: [] };
        }
        return { rows: [] };
      }),
    };

    await runCollectionsSyncCronTick({
      withLuciaBypassImpl: async (fn) => fn(client as never),
      syncCollectionTasksImpl: async ({ operatingCompanyId }) => {
        syncCalls.push(operatingCompanyId);
        return { created: 0, updated: 0, resolved: 0, open_count: 0 };
      },
    });

    expect(setConfigCalls).toEqual([
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    ]);
    expect(syncCalls).toEqual([
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    ]);
  });

  it("is idempotent on repeat runs", async () => {
    const syncCalls: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FROM org.companies")) {
          return { rows: [{ operating_company_id: "11111111-1111-1111-1111-111111111111" }] };
        }
        return { rows: [] };
      }),
    };

    const syncCollectionTasksImpl = async ({ operatingCompanyId }: { operatingCompanyId: string }) => {
      syncCalls.push(operatingCompanyId);
      return { created: 0, updated: 1, resolved: 0, open_count: 1 };
    };

    await runCollectionsSyncCronTick({
      withLuciaBypassImpl: async (fn) => fn(client as never),
      syncCollectionTasksImpl,
    });
    await runCollectionsSyncCronTick({
      withLuciaBypassImpl: async (fn) => fn(client as never),
      syncCollectionTasksImpl,
    });

    expect(syncCalls).toEqual([
      "11111111-1111-1111-1111-111111111111",
      "11111111-1111-1111-1111-111111111111",
    ]);
  });

  it("enforces tenant context guard for each company", async () => {
    assertTenantContextMock.mockClear();
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FROM org.companies")) {
          return { rows: [{ operating_company_id: "11111111-1111-1111-1111-111111111111" }] };
        }
        return { rows: [] };
      }),
    };

    await runCollectionsSyncCronTick({
      withLuciaBypassImpl: async (fn) => fn(client as never),
      syncCollectionTasksImpl: async () => ({ created: 0, updated: 0, resolved: 0, open_count: 0 }),
    });

    expect(assertTenantContextMock).toHaveBeenCalledWith(
      "11111111-1111-1111-1111-111111111111",
      "accounting.collections_sync_cron"
    );
  });
});
