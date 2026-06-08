import { describe, expect, it, vi } from "vitest";
import { getActiveDrivers, DEFAULT_MAX_AGE_MINUTES } from "../query.service.js";
import type { PoolClient } from "pg";

const OCI_A = "aaaaaaaa-0000-4000-8000-000000000001";
const OCI_B = "bbbbbbbb-0000-4000-8000-000000000002";

const FRESH_SNAPSHOT = {
  uuid: "cccccccc-0000-4000-8000-000000000003",
  operating_company_id: OCI_A,
  snapshot_at: new Date().toISOString(),
  threshold_days: 7,
  active_driver_uuids: ["dddddddd-0000-4000-8000-000000000004"],
  total_driver_count: 5,
};

function makeClient(opts: { hasFreshSnapshot?: boolean } = {}) {
  const { hasFreshSnapshot = true } = opts;

  const querySpy = vi.fn().mockImplementation((sql: string) => {
    if (sql.includes("set_config")) return Promise.resolve({ rows: [] });

    if (sql.includes("FROM integrations.active_driver_set_cache")) {
      return Promise.resolve({ rows: hasFreshSnapshot ? [FRESH_SNAPSHOT] : [] });
    }

    // Recompute fallback paths
    if (sql.includes("samsara_drivers") && sql.includes("local_driver_id")) {
      return Promise.resolve({
        rows: [{ local_driver_id: "eeeeeeee-0000-4000-8000-000000000005", total: "1" }],
      });
    }
    if (sql.includes("COUNT(*)")) {
      return Promise.resolve({ rows: [{ total: "8" }] });
    }
    if (sql.includes("INSERT INTO integrations.active_driver_set_cache")) {
      return Promise.resolve({
        rows: [
          {
            ...FRESH_SNAPSHOT,
            active_driver_uuids: ["eeeeeeee-0000-4000-8000-000000000005"],
            total_driver_count: 8,
          },
        ],
      });
    }
    if (sql.includes("DELETE FROM")) {
      return Promise.resolve({ rows: [] });
    }

    return Promise.resolve({ rows: [] });
  });

  return { query: querySpy } as unknown as PoolClient;
}

describe("getActiveDrivers", () => {
  it("returns cache_hit=true when a fresh snapshot exists", async () => {
    const client = makeClient({ hasFreshSnapshot: true });
    const result = await getActiveDrivers(client, OCI_A);

    expect(result.cache_hit).toBe(true);
    expect(result.active_driver_uuids).toEqual(FRESH_SNAPSHOT.active_driver_uuids);
    expect(result.total_driver_count).toBe(FRESH_SNAPSHOT.total_driver_count);
  });

  it("falls back to recompute and returns cache_hit=false when stale", async () => {
    const client = makeClient({ hasFreshSnapshot: false });
    const result = await getActiveDrivers(client, OCI_A);

    expect(result.cache_hit).toBe(false);
    expect(result.active_driver_uuids).toEqual(["eeeeeeee-0000-4000-8000-000000000005"]);
    expect(result.total_driver_count).toBe(8);
  });

  it("passes threshold_days to the cache query", async () => {
    const client = makeClient({ hasFreshSnapshot: true });
    await getActiveDrivers(client, OCI_A, 14);

    const cacheQueryCall = (client.query as ReturnType<typeof vi.fn>).mock.calls.find(
      ([sql]: [string]) =>
        typeof sql === "string" && sql.includes("FROM integrations.active_driver_set_cache")
    );
    expect(cacheQueryCall).toBeDefined();
    expect(cacheQueryCall![1]).toContain(14);
  });

  it("isolates OCI_A from OCI_B (RLS set_config called with correct tenant)", async () => {
    const clientA = makeClient({ hasFreshSnapshot: true });
    const clientB = makeClient({ hasFreshSnapshot: true });

    await getActiveDrivers(clientA, OCI_A);
    await getActiveDrivers(clientB, OCI_B);

    const aSetConfig = (clientA.query as ReturnType<typeof vi.fn>).mock.calls.find(
      ([sql]: [string]) => typeof sql === "string" && sql.includes("set_config")
    );
    expect(aSetConfig![1]).toContain(OCI_A);
    expect(aSetConfig![1]).not.toContain(OCI_B);
  });

  it("uses DEFAULT_MAX_AGE_MINUTES cutoff in the cache query", async () => {
    const before = Date.now();
    const client = makeClient({ hasFreshSnapshot: true });
    await getActiveDrivers(client, OCI_A);
    const after = Date.now();

    const cacheQueryCall = (client.query as ReturnType<typeof vi.fn>).mock.calls.find(
      ([sql]: [string]) =>
        typeof sql === "string" && sql.includes("FROM integrations.active_driver_set_cache")
    );
    const cutoffArg = cacheQueryCall![1][2] as string;
    const cutoffMs = new Date(cutoffArg).getTime();
    const expectedMs = before - DEFAULT_MAX_AGE_MINUTES * 60 * 1000;

    expect(cutoffMs).toBeGreaterThanOrEqual(expectedMs - 2000);
    expect(cutoffMs).toBeLessThanOrEqual(after);
  });
});
