import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.hoisted(() => vi.fn());

vi.mock("../../../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
    fn({ query: queryMock }),
  luciaPool: {},
}));

vi.mock("../../../_helpers/company-membership-guard.js", () => ({
  assertCompanyMembership: vi.fn(),
}));

import { buildTrkMigrationStatus, verifyTrkMigrationReconciliation } from "../trk-migration.js";

describe("TRK QBO migration runbook (P5-T24)", () => {
  beforeEach(() => {
    queryMock.mockReset();
    process.env.QBO_REALM_ID_TRK = "realm-trk-1";
  });

  it("returns runbook steps in read-only mode", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("to_regclass")) return { rows: [{ ok: true }] };
      if (sql.includes("qbo_archive.entities_snapshot")) return { rows: [{ c: 12 }] };
      if (sql.includes("chart_of_accounts")) return { rows: [{ c: 40 }] };
      if (sql.includes("accounting.invoices")) return { rows: [{ total: 50000 }] };
      if (sql.includes("accounting.bills")) return { rows: [{ total: 25000 }] };
      return { rows: [] };
    });

    const status = await buildTrkMigrationStatus({ query: queryMock }, "oc-1");
    expect(status.read_only).toBe(true);
    expect(status.qbo_writes_disabled).toBe(true);
    expect(status.runbook_steps).toHaveLength(6);
    expect(status.runbook_steps.every((s) => s.writes_required === false)).toBe(true);
  });

  it("blocks preflight when TRK realm missing", async () => {
    process.env.QBO_REALM_ID_TRK = "";
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("to_regclass")) return { rows: [{ ok: false }] };
      return { rows: [{ c: 0, total: 0 }] };
    });
    const status = await buildTrkMigrationStatus({ query: queryMock }, "oc-1");
    expect(status.runbook_steps[0]?.status).toBe("blocked");
  });

  it("verify aggregates checks without writes", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("to_regclass")) return { rows: [{ ok: true }] };
      if (sql.includes("qbo_archive.entities_snapshot")) return { rows: [{ c: 5 }] };
      if (sql.includes("chart_of_accounts")) return { rows: [{ c: 10 }] };
      if (sql.includes("accounting.invoices")) return { rows: [{ total: 1000 }] };
      if (sql.includes("accounting.bills")) return { rows: [{ total: 500 }] };
      return { rows: [] };
    });
    const result = await verifyTrkMigrationReconciliation({ query: queryMock }, "oc-1");
    expect(result.note).toContain("no QBO writes");
    expect(result.verification.length).toBeGreaterThan(0);
  });
});
