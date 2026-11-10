import { describe, expect, it, vi } from "vitest";

const assertTenantContextMock = vi.fn();
vi.mock("./_helpers/tenant-context-guard.js", () => ({
  assertTenantContext: (...args: unknown[]) => assertTenantContextMock(...args),
}));

import { runCollectionsSyncCronTick } from "./collections-sync.cron.js";

describe("collections-sync cron", () => {
  it("iterates the live company only and syncs it exactly once (ACCT-F11123)", async () => {
    const setConfigCalls: string[] = [];
    const syncCalls: string[] = [];
    const client = {
      query: vi.fn(async (sql: string, values?: unknown[]) => {
        if (sql.includes("FROM org.companies")) {
          return {
            rows: [
              { operating_company_id: "5c854333-6ea5-4faa-af31-67cb272fef80" },
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

    // ACCT-F11123: the other active company (a frozen entity) is never synced.
    expect(setConfigCalls).toEqual(["5c854333-6ea5-4faa-af31-67cb272fef80"]);
    expect(syncCalls).toEqual(["5c854333-6ea5-4faa-af31-67cb272fef80"]);
  });

  it("is idempotent on repeat runs", async () => {
    const syncCalls: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FROM org.companies")) {
          return { rows: [{ operating_company_id: "5c854333-6ea5-4faa-af31-67cb272fef80" }] };
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
      "5c854333-6ea5-4faa-af31-67cb272fef80",
      "5c854333-6ea5-4faa-af31-67cb272fef80",
    ]);
  });

  it("enforces tenant context guard for each company", async () => {
    assertTenantContextMock.mockClear();
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FROM org.companies")) {
          return { rows: [{ operating_company_id: "5c854333-6ea5-4faa-af31-67cb272fef80" }] };
        }
        return { rows: [] };
      }),
    };

    await runCollectionsSyncCronTick({
      withLuciaBypassImpl: async (fn) => fn(client as never),
      syncCollectionTasksImpl: async () => ({ created: 0, updated: 0, resolved: 0, open_count: 0 }),
    });

    expect(assertTenantContextMock).toHaveBeenCalledWith(
      "5c854333-6ea5-4faa-af31-67cb272fef80",
      "accounting.collections_sync_cron"
    );
  });
});
