import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { collectQboRemoteCounts, qboRemoteCountEntityTypes } from "./remote-count-collector.js";
import { withLuciaBypass } from "../../auth/db.js";
import { qboCompanyContext, qboQuery } from "./qbo-client.js";

vi.mock("../../auth/db.js", () => ({
  withLuciaBypass: vi.fn(),
}));

vi.mock("./qbo-client.js", () => ({
  qboCompanyContext: vi.fn(),
  qboQuery: vi.fn(),
}));

describe("remote-count-collector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fails fast when operating_company_id is missing", async () => {
    await expect(collectQboRemoteCounts("")).rejects.toThrow("operating_company_id");
  });

  it("returns skipped result when no active QBO connection exists", async () => {
    const queryMock = vi.fn(async (sql: string) => {
      if (sql.includes("FROM integrations.qbo_connections")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    (withLuciaBypass as unknown as Mock).mockImplementation(async (fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
      fn({ query: queryMock })
    );

    const result = await collectQboRemoteCounts("11111111-1111-1111-1111-111111111111");

    expect(result.failed).toBe(false);
    expect(result.collected_count).toBe(0);
    expect(result.run_mode).toBe("delta");
    expect(queryMock.mock.calls.some(([sql]) => String(sql).includes("audit.append_event"))).toBe(true);
  });

  it("persists one row per configured refdata entity on success", async () => {
    const inserts: Array<{ entityType: string; count: number }> = [];

    const queryMock = vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes("FROM integrations.qbo_connections")) {
        return { rows: [{ id: "conn-1" }] };
      }
      if (sql.includes("FROM accounting.qbo_remote_count_collection_state")) {
        return { rows: [{ consecutive_failures: 0, outage_started_at: null }] };
      }
      if (sql.includes("INSERT INTO accounting.qbo_remote_counts")) {
        inserts.push({ entityType: String(values?.[1]), count: Number(values?.[2]) });
        return { rows: [] };
      }
      return { rows: [] };
    });

    (withLuciaBypass as unknown as Mock).mockImplementation(async (fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
      fn({ query: queryMock })
    );
    (qboCompanyContext as unknown as Mock).mockResolvedValue({ operatingCompanyId: "oc-1", realmId: "realm-1" });
    (qboQuery as unknown as Mock).mockResolvedValue({ QueryResponse: { totalCount: 42 } });

    const result = await collectQboRemoteCounts("11111111-1111-1111-1111-111111111111", {
      entityTypes: qboRemoteCountEntityTypes(),
      runMode: "full",
      collectionRunId: "22222222-2222-2222-2222-222222222222",
    });

    expect(result.failed).toBe(false);
    expect(result.collected_count).toBe(5);
    expect(inserts).toHaveLength(5);
    expect(new Set(inserts.map((row) => row.entityType))).toEqual(
      new Set(["qbo_accounts", "qbo_classes", "qbo_items", "qbo_customers", "qbo_vendors"])
    );
    expect(inserts.every((row) => row.count === 42)).toBe(true);
  });
});
