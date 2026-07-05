import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findPostedApForWo, isWoPostedApError, WO_POSTED_AP_ERROR, WoPostedApError } from "../work-orders.routes.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const routes = fs.readFileSync(path.resolve(here, "../work-orders.routes.ts"), "utf8");

// ── Fake DB client: matches on SQL substrings, no real Postgres ───────────────
type FakeConfig = {
  tables?: Set<string>; // relations that exist (to_regclass)
  columns?: Set<string>; // "schema.table.column" present in information_schema
  billRows?: Array<{ id: string; status: string | null }>;
  expenseRows?: Array<{ id: string; status: string | null }>;
};

function fakeClient(cfg: FakeConfig) {
  const tables = cfg.tables ?? new Set(["accounting.bills", "accounting.expenses"]);
  const columns =
    cfg.columns ?? new Set(["accounting.bills.revoked_at", "accounting.expenses.linked_work_order_uuid", "accounting.expenses.revoked_at"]);
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async query<R = any>(sql: string, values?: unknown[]): Promise<{ rows: R[]; rowCount?: number }> {
      if (sql.includes("to_regclass")) {
        const rel = String(values?.[0] ?? "");
        return { rows: [{ ok: tables.has(rel) } as unknown as R], rowCount: 1 };
      }
      if (sql.includes("information_schema.columns")) {
        const key = `${values?.[0]}.${values?.[1]}.${values?.[2]}`;
        return columns.has(key) ? { rows: [{ ok: true } as unknown as R], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (sql.includes("FROM accounting.bills")) {
        const rows = (cfg.billRows ?? []) as unknown as R[];
        return { rows, rowCount: rows.length };
      }
      if (sql.includes("FROM accounting.expenses")) {
        const rows = (cfg.expenseRows ?? []) as unknown as R[];
        return { rows, rowCount: rows.length };
      }
      return { rows: [], rowCount: 0 };
    },
  };
}

const COMPANY = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
const WO = "00000000-0000-0000-0000-0000000000aa";

describe("findPostedApForWo — WO cost-edit financial guard", () => {
  it("returns null when only a DRAFT bill exists (draft is safe to edit)", async () => {
    // A draft bill is excluded by the SQL WHERE, so the query yields no rows.
    const client = fakeClient({ billRows: [] });
    expect(await findPostedApForWo(client, COMPANY, WO)).toBeNull();
  });

  it("BLOCKS when a posted/unpaid bill is linked to the WO", async () => {
    const client = fakeClient({ billRows: [{ id: "bill-1", status: "unpaid" }] });
    const posted = await findPostedApForWo(client, COMPANY, WO);
    expect(posted).toEqual({ kind: "bill", id: "bill-1", status: "unpaid" });
  });

  it("returns null when the bill is voided (filtered out by SQL → no rows)", async () => {
    const client = fakeClient({ billRows: [] });
    expect(await findPostedApForWo(client, COMPANY, WO)).toBeNull();
  });

  it("BLOCKS when a posted expense is linked (paid-same-day path)", async () => {
    const client = fakeClient({ billRows: [], expenseRows: [{ id: "exp-1", status: "posted" }] });
    const posted = await findPostedApForWo(client, COMPANY, WO);
    expect(posted).toEqual({ kind: "expense", id: "exp-1", status: "posted" });
  });

  it("returns null when no AP document is linked to the WO", async () => {
    const client = fakeClient({ billRows: [], expenseRows: [] });
    expect(await findPostedApForWo(client, COMPANY, WO)).toBeNull();
  });

  it("does not 500 when the accounting schema is absent (fresh DB)", async () => {
    const client = fakeClient({ tables: new Set(), billRows: [{ id: "x", status: "unpaid" }] });
    expect(await findPostedApForWo(client, COMPANY, WO)).toBeNull();
  });
});

describe("WoPostedApError", () => {
  it("is detectable via isWoPostedApError and carries detail", () => {
    const err = new WoPostedApError({ kind: "bill", id: "b1", status: "unpaid" });
    expect(isWoPostedApError(err)).toBe(true);
    expect(isWoPostedApError(new Error("nope"))).toBe(false);
    expect(err.detail.kind).toBe("bill");
  });
});

// ── Static guards: keep the wiring from regressing ────────────────────────────
describe("work-orders.routes — cost-edit guard wiring (static)", () => {
  it("exposes a stable posted-bill lock error code", () => {
    expect(WO_POSTED_AP_ERROR).toBe("E_WO_POSTED_BILL_LOCK");
    expect(routes).toContain('WO_POSTED_AP_ERROR = "E_WO_POSTED_BILL_LOCK"');
  });

  it("guards BOTH line-item endpoints (POST add + DELETE remove) with findPostedApForWo", () => {
    const guardCalls = routes.match(/const posted = await findPostedApForWo\(client, companyId, params\.data\.id\);/g) ?? [];
    // POST line-items, DELETE line-items, and the PATCH vendor-change branch = 3 call sites.
    expect(guardCalls.length).toBeGreaterThanOrEqual(3);
    expect(routes).toContain("if (posted) throw new WoPostedApError(posted);");
  });

  it("PATCH header blocks a vendor swap when a posted bill exists", () => {
    expect(routes).toContain("postedLock: true as const");
    expect(routes).toMatch(/if \("postedLock" in result && result\.posted\) return postedApReply/);
  });

  it("updateWorkOrderSchema adds only non-cost header fields (no amount/cost fields)", () => {
    for (const field of [
      "wo_priority",
      "vmrs_system_code",
      "out_of_service",
      "repair_complaint",
      "authorization_number",
      "service_location_type",
      "repaired_by",
    ]) {
      expect(routes).toContain(field);
    }
    // The header PATCH schema must NOT accept cost/amount FIELD KEYS — those flow through line-items only.
    const schemaBlock = routes.slice(routes.indexOf("const updateWorkOrderSchema"), routes.indexOf("const transitionSchema"));
    expect(schemaBlock).not.toMatch(/\bunit_cost\s*:/);
    expect(schemaBlock).not.toMatch(/\bamount\s*:/);
    expect(schemaBlock).not.toMatch(/total_cost\s*:/);
    expect(schemaBlock).not.toMatch(/\bquantity\s*:/);
  });

  it("posted-AP reply returns 409 with a void-the-bill-first message", () => {
    expect(routes).toContain("reply.code(409)");
    expect(routes).toMatch(/Void the linked bill first/);
  });
});
