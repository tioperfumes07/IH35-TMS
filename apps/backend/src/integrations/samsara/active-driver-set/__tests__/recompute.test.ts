import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  recomputeActiveDriverSet,
  MAX_SNAPSHOTS_PER_OCI,
  DEFAULT_THRESHOLD_DAYS,
} from "../recompute.service.js";
import type { PoolClient } from "pg";

const OCI_A = "aaaaaaaa-0000-4000-8000-000000000001";
const OCI_B = "bbbbbbbb-0000-4000-8000-000000000002";

function makeSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    uuid: "cccccccc-0000-4000-8000-000000000003",
    operating_company_id: OCI_A,
    snapshot_at: new Date().toISOString(),
    threshold_days: 7,
    active_driver_uuids: ["dddddddd-0000-4000-8000-000000000004"],
    total_driver_count: 5,
    ...overrides,
  };
}

function makeClient(
  activeUuids: string[] = ["dddddddd-0000-4000-8000-000000000004"],
  total = 5,
  ociId = OCI_A
) {
  const snapshot = makeSnapshot({ active_driver_uuids: activeUuids, total_driver_count: total, operating_company_id: ociId });
  const querySpy = vi.fn().mockImplementation((sql: string) => {
    if (sql.includes("set_config")) return Promise.resolve({ rows: [] });
    if (sql.includes("samsara_drivers") && sql.includes("local_driver_id")) {
      return Promise.resolve({
        rows: activeUuids.map((id) => ({ local_driver_id: id, total: String(activeUuids.length) })),
      });
    }
    if (sql.includes("COUNT(*)")) {
      return Promise.resolve({ rows: [{ total: String(total) }] });
    }
    if (sql.includes("INSERT INTO integrations.active_driver_set_cache")) {
      return Promise.resolve({ rows: [snapshot] });
    }
    if (sql.includes("DELETE FROM integrations.active_driver_set_cache")) {
      return Promise.resolve({ rows: [] });
    }
    return Promise.resolve({ rows: [] });
  });

  return { query: querySpy } as unknown as PoolClient;
}

describe("recomputeActiveDriverSet", () => {
  it("creates a snapshot with the correct active driver UUIDs", async () => {
    const uuids = ["dddddddd-0000-4000-8000-000000000004"];
    const client = makeClient(uuids, 3);

    const result = await recomputeActiveDriverSet(client, OCI_A, DEFAULT_THRESHOLD_DAYS);

    expect(result.active_driver_uuids).toEqual(uuids);
    expect(result.total_driver_count).toBe(3);
    expect(result.threshold_days).toBe(DEFAULT_THRESHOLD_DAYS);
    expect(result.operating_company_id).toBe(OCI_A);
  });

  it("calls the retention prune query after insert", async () => {
    const client = makeClient();
    await recomputeActiveDriverSet(client, OCI_A);

    const deleteCalls = (client.query as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([sql]: [string]) => typeof sql === "string" && sql.includes("DELETE FROM")
    );
    expect(deleteCalls.length).toBe(1);
    const deleteArgs = deleteCalls[0] as [string, unknown[]];
    expect(deleteArgs[1]).toContain(MAX_SNAPSHOTS_PER_OCI);
  });

  it("sets operating_company_id via set_config for RLS isolation", async () => {
    const client = makeClient();
    await recomputeActiveDriverSet(client, OCI_A);

    const setCalls = (client.query as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([sql]: [string]) => typeof sql === "string" && sql.includes("set_config")
    );
    expect(setCalls.length).toBeGreaterThan(0);
    expect(setCalls[0][1]).toContain(OCI_A);
  });

  it("produces an empty active set when no drivers are active", async () => {
    const client = makeClient([], 10);
    const result = await recomputeActiveDriverSet(client, OCI_A);
    expect(result.active_driver_uuids).toEqual([]);
    expect(result.total_driver_count).toBe(10);
  });

  it("does not bleed data across OCIs", async () => {
    const clientA = makeClient(["aaaa0000-0000-4000-8000-000000000000"], 2, OCI_A);
    const clientB = makeClient(["bbbb0000-0000-4000-8000-000000000000"], 3, OCI_B);

    const resultA = await recomputeActiveDriverSet(clientA, OCI_A);
    const resultB = await recomputeActiveDriverSet(clientB, OCI_B);

    expect(resultA.operating_company_id).toBe(OCI_A);
    expect(resultB.operating_company_id).toBe(OCI_B);

    const aOciArgs = (clientA.query as ReturnType<typeof vi.fn>).mock.calls
      .filter(([sql]: [string]) => typeof sql === "string" && sql.includes("set_config"))
      .map(([, args]: [string, string[]]) => args[0]);
    expect(aOciArgs.every((v) => v === OCI_A)).toBe(true);
  });
});
