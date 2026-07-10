import { describe, expect, it, vi } from "vitest";

// RECON-NOCONN: exercise runReconciliationCategoryTick, which wraps its body in withLuciaBypass (a real
// transaction). Mock ONLY withLuciaBypass so it invokes the callback with a per-test mock client; keep
// every other db.js export real so the service's dependency tree loads unchanged.
const h = vi.hoisted(() => ({
  client: null as { query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }> } | null,
}));

vi.mock("../auth/db.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth/db.js")>();
  return {
    ...actual,
    withLuciaBypass: async (cb: (client: unknown) => Promise<unknown>) => cb(h.client),
  };
});

import { runReconciliationCategoryTick } from "./reconciliation-worker.service.js";

const TRANSP = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";

describe("RECON-NOCONN — QBO reconciliation fails loud on 0 connections", () => {
  it("qbo tick with 0 connections throws AND emits a critical no_active_connection audit event", async () => {
    const audits: Array<unknown[]> = [];
    h.client = {
      async query(sql: string, values?: unknown[]) {
        if (sql.includes("FROM integrations.qbo_connections")) return { rows: [] }; // 0 active connections
        if (sql.includes("audit.append_event")) {
          audits.push(values ?? []);
          return { rows: [] };
        }
        return { rows: [] };
      },
    };

    // The tick must REJECT (so the background job records a real failure — not a silent green no-op).
    await expect(runReconciliationCategoryTick("qbo", "transactional")).rejects.toThrow(
      /0 active qbo_connections/
    );

    // audit.append_event(client, class, severity, payload) => SQL params [class, severity, payloadJson, source].
    const critical = audits.find((v) => v[0] === "reconciliation.qbo.no_active_connection");
    expect(critical).toBeTruthy();
    expect(critical?.[1]).toBe("critical");
  });

  it("qbo tick with >=1 connection does NOT throw and enters the reconcile loop (unchanged behavior)", async () => {
    const audits: Array<unknown[]> = [];
    const recentIso = new Date().toISOString();
    h.client = {
      async query(sql: string, _values?: unknown[]) {
        if (sql.includes("FROM integrations.qbo_connections")) {
          return { rows: [{ operating_company_id: TRANSP }] }; // one active connection
        }
        // the RECON-NOCONN stale-feed probe (distinguished by the is_stale projection) — feed is fresh
        if (sql.includes("FROM accounting.qbo_remote_counts") && sql.includes("is_stale")) {
          return { rows: [{ is_stale: false, newest: recentIso }] };
        }
        if (sql.includes("audit.append_event")) {
          audits.push(_values ?? []);
          return { rows: [] };
        }
        return { rows: [] }; // all downstream reconcile queries return benign empties
      },
    };

    await expect(runReconciliationCategoryTick("qbo", "transactional")).resolves.toBeUndefined();

    // No fake-green trap: the no_active_connection critical must NOT fire when a connection exists,
    // and the loop body must have run (tick.started is emitted before per-company reconcile work).
    expect(audits.some((v) => v[0] === "reconciliation.qbo.no_active_connection")).toBe(false);
    expect(audits.some((v) => v[0] === "reconciliation.tick.started")).toBe(true);
  });
});
