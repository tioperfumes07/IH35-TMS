import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AP_BILLS_MIRROR_SYNC_KIND } from "../ap-bills-sync-kind.js";

const here = dirname(fileURLToPath(import.meta.url));
const pullerSrc = readFileSync(resolve(here, "../ap-bills-puller.ts"), "utf8");

const withLuciaBypass = vi.hoisted(() => vi.fn());
const isEnabled = vi.hoisted(() => vi.fn());
const qboCompanyContext = vi.hoisted(() => vi.fn());
const qboPaginateEntity = vi.hoisted(() => vi.fn());

vi.mock("../../auth/db.js", () => ({ withLuciaBypass }));
vi.mock("../../lib/feature-flags/service.js", () => ({ isEnabled }));
vi.mock("../../integrations/qbo/qbo-client.js", () => ({
  qboCompanyContext,
  qboPaginateEntity,
}));

import {
  beginApMirrorSyncRun,
  finishApMirrorSyncRun,
  pullApBillsFromQbo,
} from "../ap-bills-puller.js";

describe("ap-bills-puller Stage 1 transaction boundaries (static behavioral contract)", () => {
  it("uses AP mirror sync kind and durable sync_runs audit helpers", () => {
    expect(AP_BILLS_MIRROR_SYNC_KIND).toBe("ap_bills_inbound_mirror");
    expect(pullerSrc).toContain("beginApMirrorSyncRun");
    expect(pullerSrc).toContain("finishApMirrorSyncRun");
    expect(pullerSrc).toContain("AP_BILLS_MIRROR_SYNC_KIND");
    expect(pullerSrc).toContain("INSERT INTO qbo.sync_runs");
    expect(pullerSrc).toMatch(/status = \$3/);
    // Schema columns used (0162/0163): kind TEXT, status running|success|failed, payload jsonb
    expect(pullerSrc).toContain("payload");
    expect(pullerSrc).toContain("'running'");
    expect(pullerSrc).toContain("success ? \"success\" : \"failed\"");
  });

  it("paginates QBO HTTP outside the upsert withLuciaBypass (G5-2)", () => {
    const paginateIdx = pullerSrc.indexOf("for await (const page of qboPaginateEntity");
    const upsertCallIdx = pullerSrc.indexOf("await upsertApBillMirror");
    expect(paginateIdx).toBeGreaterThan(-1);
    expect(upsertCallIdx).toBeGreaterThan(-1);
    expect(paginateIdx).toBeLessThan(upsertCallIdx);

    const pullFn = pullerSrc.slice(pullerSrc.indexOf("export async function pullApBillsFromQbo"));
    const httpSection = pullFn.slice(
      pullFn.indexOf("qboCompanyContext"),
      pullFn.indexOf("await withLuciaBypass(async (client) => {\n      await client.query(`SELECT set_config('app.operating_company_id'")
    );
    expect(httpSection).toContain("qboPaginateEntity");
    expect(httpSection).not.toContain("upsertApBillMirror");
  });

  it("finishes failed audit in catch before rethrow (durable failed audit)", () => {
    expect(pullerSrc).toMatch(/catch \(error\) \{[\s\S]*finishApMirrorSyncRun\([\s\S]*success:\s*false/);
    expect(pullerSrc).toContain("throw error");
  });

  it("gates on isEnabled DB flag (default-OFF / per-entity) — not process.env", () => {
    expect(pullerSrc).toContain("QBO_AP_MIRROR_PULL_ENABLED");
    expect(pullerSrc).toMatch(/isEnabled\(client,\s*AP_MIRROR_PULL_FLAG/);
    expect(pullerSrc).not.toMatch(/process\.env\.QBO_AP_MIRROR_PULL_ENABLED/);
  });

  it("idempotent upsert by (operating_company_id, qbo_id) — never invents from accounting.bills", () => {
    expect(pullerSrc).toContain("ON CONFLICT (operating_company_id, qbo_id)");
    expect(pullerSrc).not.toMatch(/FROM accounting\.bills[\s\S]*INSERT INTO mdata\.qbo_ap_bills/);
    expect(pullerSrc).not.toMatch(/INSERT INTO mdata\.qbo_ap_bills[\s\S]*FROM accounting\.bills/);
  });

  it("does not write TMS→QBO", () => {
    expect(pullerSrc).not.toMatch(/pushBill|tms\.bill\.push|QBO_ENTITY_PUSH|Bill\.create/i);
  });
});

describe("ap-bills-puller Stage 1 runtime behavior (mocked)", () => {
  const companyId = "11111111-1111-4111-8111-111111111111";

  beforeEach(() => {
    vi.clearAllMocks();
    withLuciaBypass.mockImplementation(async (fn: (client: unknown) => Promise<unknown>) => {
      const client = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes("to_regclass('qbo.sync_runs')")) {
            return { rows: [{ ok: true }] };
          }
          if (sql.includes("INSERT INTO qbo.sync_runs")) {
            return { rows: [{ id: "run-1" }] };
          }
          if (sql.includes("UPDATE qbo.sync_runs")) {
            return { rows: [], rowCount: 1 };
          }
          if (sql.includes("INSERT INTO mdata.qbo_ap_bills")) {
            return { rows: [], rowCount: 1 };
          }
          return { rows: [] };
        }),
      };
      return fn(client);
    });
  });

  it("returns enabled:false when pull flag is OFF (no network, no audit)", async () => {
    isEnabled.mockResolvedValue(false);
    const result = await pullApBillsFromQbo(companyId);
    expect(result).toMatchObject({ enabled: false, rowsPulled: 0, rowsUpserted: 0 });
    expect(qboPaginateEntity).not.toHaveBeenCalled();
    expect(qboCompanyContext).not.toHaveBeenCalled();
  });

  it("runs HTTP pagination before upsert txn; commits success audit after upsert", async () => {
    isEnabled.mockResolvedValue(true);
    qboCompanyContext.mockResolvedValue({ realmId: "r1" });
    const order: string[] = [];
    qboPaginateEntity.mockImplementation(async function* () {
      order.push("http");
      yield [
        {
          Id: "B1",
          SyncToken: "0",
          TotalAmt: 100,
          Balance: 100,
          Active: true,
          VendorRef: { value: "V1", name: "Vendor" },
          TxnDate: "2026-07-01",
          DueDate: "2026-07-31",
        },
      ];
    });

    const origBypass = withLuciaBypass.getMockImplementation()!;
    withLuciaBypass.mockImplementation(async (fn: (client: unknown) => Promise<unknown>) => {
      // Detect upsert path by inspecting whether client will INSERT mirror
      const client = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes("to_regclass('qbo.sync_runs')")) return { rows: [{ ok: true }] };
          if (sql.includes("INSERT INTO qbo.sync_runs")) {
            order.push("audit_begin");
            return { rows: [{ id: "run-1" }] };
          }
          if (sql.includes("INSERT INTO mdata.qbo_ap_bills")) {
            order.push("upsert");
            return { rows: [], rowCount: 1 };
          }
          if (sql.includes("UPDATE qbo.sync_runs")) {
            order.push("audit_finish");
            return { rows: [], rowCount: 1 };
          }
          return { rows: [] };
        }),
      };
      return fn(client);
    });

    const result = await pullApBillsFromQbo(companyId);
    expect(result.enabled).toBe(true);
    expect(result.rowsPulled).toBe(1);
    expect(result.rowsUpserted).toBe(1);
    // begin audit → HTTP → upsert → finish success
    expect(order.indexOf("audit_begin")).toBeLessThan(order.indexOf("http"));
    expect(order.indexOf("http")).toBeLessThan(order.indexOf("upsert"));
    expect(order.indexOf("upsert")).toBeLessThan(order.indexOf("audit_finish"));

    withLuciaBypass.mockImplementation(origBypass);
  });

  it("commits failed audit even when upsert transaction throws (no failed-audit rollback)", async () => {
    isEnabled.mockResolvedValue(true);
    qboCompanyContext.mockResolvedValue({ realmId: "r1" });
    qboPaginateEntity.mockImplementation(async function* () {
      yield [{ Id: "B1", TotalAmt: 50, Balance: 50, Active: true }];
    });

    const finishCalls: Array<{ success: boolean; errorMessage?: string | null }> = [];
    let upsertThrown = false;
    const updates: string[] = [];

    withLuciaBypass.mockImplementation(async (fn: (client: unknown) => Promise<unknown>) => {
      const client = {
        query: vi.fn(async (sql: string, params?: unknown[]) => {
          if (sql.includes("to_regclass('qbo.sync_runs')")) return { rows: [{ ok: true }] };
          if (sql.includes("INSERT INTO qbo.sync_runs")) return { rows: [{ id: "run-fail" }] };
          if (sql.includes("INSERT INTO mdata.qbo_ap_bills")) {
            upsertThrown = true;
            throw new Error("upsert boom");
          }
          if (sql.includes("UPDATE qbo.sync_runs")) {
            updates.push(String(params?.[2]));
            finishCalls.push({
              success: params?.[2] === "success",
              errorMessage: (params?.[4] as string | null) ?? null,
            });
            return { rows: [], rowCount: 1 };
          }
          return { rows: [] };
        }),
      };
      return fn(client);
    });

    await expect(pullApBillsFromQbo(companyId)).rejects.toThrow(/upsert boom/);
    expect(upsertThrown).toBe(true);
    expect(finishCalls.some((c) => c.success === false)).toBe(true);
    expect(updates).toContain("failed");
  });

  it("begin/finish helpers write entity-scoped sync_runs rows", async () => {
    const queries: Array<{ sql: string; params?: unknown[] }> = [];
    withLuciaBypass.mockImplementation(async (fn: (client: unknown) => Promise<unknown>) => {
      const client = {
        query: vi.fn(async (sql: string, params?: unknown[]) => {
          queries.push({ sql, params });
          if (sql.includes("to_regclass")) return { rows: [{ ok: true }] };
          if (sql.includes("INSERT INTO qbo.sync_runs")) return { rows: [{ id: "run-x" }] };
          return { rows: [], rowCount: 1 };
        }),
      };
      return fn(client);
    });

    const id = await beginApMirrorSyncRun(companyId);
    expect(id).toBe("run-x");
    await finishApMirrorSyncRun({
      runId: id,
      operatingCompanyId: companyId,
      success: false,
      recordsProcessed: 0,
      errorMessage: "x",
    });

    const insert = queries.find((q) => q.sql.includes("INSERT INTO qbo.sync_runs"));
    expect(insert?.params?.[0]).toBe(companyId);
    expect(insert?.params?.[1]).toBe(AP_BILLS_MIRROR_SYNC_KIND);
    const update = queries.find((q) => q.sql.includes("UPDATE qbo.sync_runs"));
    expect(update?.params?.[1]).toBe(companyId);
    expect(update?.params?.[2]).toBe("failed");
  });

  it("idempotent upsert: same qbo_id reuses ON CONFLICT path (source id key)", async () => {
    isEnabled.mockResolvedValue(true);
    qboCompanyContext.mockResolvedValue({ realmId: "r1" });
    const bill = {
      Id: "B-IDEMP",
      TotalAmt: 10,
      Balance: 10,
      Active: true,
      VendorRef: { value: "V1", name: "V" },
    };
    qboPaginateEntity.mockImplementation(async function* () {
      yield [bill];
      yield [bill]; // second page same id — still ON CONFLICT upsert
    });

    let upsertSql = "";
    withLuciaBypass.mockImplementation(async (fn: (client: unknown) => Promise<unknown>) => {
      const client = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes("to_regclass")) return { rows: [{ ok: true }] };
          if (sql.includes("INSERT INTO qbo.sync_runs")) return { rows: [{ id: "run-i" }] };
          if (sql.includes("INSERT INTO mdata.qbo_ap_bills")) {
            upsertSql = sql;
            return { rows: [], rowCount: 1 };
          }
          if (sql.includes("UPDATE qbo.sync_runs")) return { rows: [], rowCount: 1 };
          return { rows: [] };
        }),
      };
      return fn(client);
    });

    const result = await pullApBillsFromQbo(companyId);
    expect(result.rowsUpserted).toBe(2);
    expect(upsertSql).toContain("ON CONFLICT (operating_company_id, qbo_id)");
  });
});
