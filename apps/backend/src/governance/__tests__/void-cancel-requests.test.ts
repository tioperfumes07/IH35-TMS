import { describe, it, expect } from "vitest";
import { canVoidCancel } from "../../lib/authz/void-cancel-authz.js";
import {
  executeVoidCancel,
  isVoidCancelEntitySupported,
  knownVoidCancelEntities,
} from "../void-cancel-executors.js";

// A tiny SQL-routing mock client (same style as the maintenance-posting poster tests). Each handler is
// matched by a substring of the SQL; unmatched queries throw so the test fails loud on an unexpected query.
type Handler = { match: (sql: string) => boolean; rows: Record<string, unknown>[] };
function mockClient(handlers: Handler[]) {
  const seen: string[] = [];
  const client = {
    query: async (sql: string) => {
      seen.push(String(sql));
      const h = handlers.find((x) => x.match(String(sql)));
      if (h) return { rows: h.rows };
      // Default: feature-flag lookups (isEnabled) resolve to OFF (no row). The WO-void financial gate
      // now reads WO_VOID_ENABLED per-entity via lib.feature_flags instead of process.env; these tests
      // assert the flag-OFF behavior, so an unseeded flag (= OFF) is exactly right.
      if (String(sql).includes("lib.feature_flags")) return { rows: [] };
      throw new Error(`unexpected SQL in mock: ${String(sql).slice(0, 120)}`);
    },
  };
  return { client, seen };
}

const OCI = "11111111-1111-1111-1111-111111111111";
const WO = "22222222-2222-2222-2222-222222222222";
const APPROVER = "33333333-3333-3333-3333-333333333333";
const REQUESTER = "44444444-4444-4444-4444-444444444444";

describe("governance void/cancel — dispatch map", () => {
  it("wires work_order and registers other entities as unsupported (no silent no-op)", () => {
    expect(isVoidCancelEntitySupported("work_order")).toBe(true);
    expect(isVoidCancelEntitySupported("invoice")).toBe(false);
    expect(isVoidCancelEntitySupported("bill")).toBe(false);
    expect(isVoidCancelEntitySupported("expense")).toBe(false);
    expect(isVoidCancelEntitySupported("not_a_real_entity")).toBe(false);
    expect(knownVoidCancelEntities()).toContain("work_order");
  });

  it("returns unsupported_entity for an unwired entity instead of executing", async () => {
    const { client } = mockClient([]);
    const res = await executeVoidCancel("invoice", {
      client: client as never,
      operatingCompanyId: OCI,
      entityId: "x",
      action: "void",
      userId: APPROVER,
      reason: "test",
    });
    expect(res.kind).toBe("unsupported_entity");
  });
});

describe("governance void/cancel — execute (request -> approve -> execute) for a work order", () => {
  it("open WO with no financial linkage = clean void (kind ok, no reversing entry)", async () => {
    const { client, seen } = mockClient([
      { match: (s) => s.includes("to_regclass('maintenance.work_orders')"), rows: [{ ok: true }] },
      { match: (s) => s.includes("SELECT voided_at FROM maintenance.work_orders"), rows: [{ voided_at: null }] },
      { match: (s) => s.includes("FROM accounting.bills"), rows: [] },
      { match: (s) => s.includes("information_schema.columns"), rows: [] }, // expenses.linked_work_order_uuid "absent"
      { match: (s) => s.includes("FROM accounting.journal_entry_postings"), rows: [{ n: 0 }] },
      {
        match: (s) => s.includes("UPDATE maintenance.work_orders") && s.includes("voided_at = now()"),
        rows: [{ id: WO, status: "open" }],
      },
      { match: (s) => s.includes("audit.append_event"), rows: [] },
    ]);

    const res = await executeVoidCancel("work_order", {
      client: client as never,
      operatingCompanyId: OCI,
      entityId: WO,
      action: "void",
      userId: APPROVER,
      reason: "approved void request",
    });

    expect(res).toEqual({ kind: "ok", reversing_entry_ref: null });
    // proves it actually flipped the WO and wrote the immutable audit event
    expect(seen.some((s) => s.includes("UPDATE maintenance.work_orders") && s.includes("voided_at = now()"))).toBe(true);
    expect(seen.some((s) => s.includes("audit.append_event"))).toBe(true);
  });

  it("WO with posted financials + WO_VOID_ENABLED OFF refuses (financial_blocked, never orphans)", async () => {
    delete process.env.WO_VOID_ENABLED; // flag OFF (default)
    const { client, seen } = mockClient([
      { match: (s) => s.includes("to_regclass('maintenance.work_orders')"), rows: [{ ok: true }] },
      { match: (s) => s.includes("SELECT voided_at FROM maintenance.work_orders"), rows: [{ voided_at: null }] },
      { match: (s) => s.includes("FROM accounting.bills"), rows: [{ id: "b1", bill_date: "2026-06-01" }] },
      { match: (s) => s.includes("information_schema.columns"), rows: [] },
      { match: (s) => s.includes("FROM accounting.journal_entry_postings"), rows: [{ n: 2 }] },
    ]);

    const res = await executeVoidCancel("work_order", {
      client: client as never,
      operatingCompanyId: OCI,
      entityId: WO,
      action: "void",
      userId: APPROVER,
      reason: "approved void request",
    });

    expect(res.kind).toBe("financial_blocked");
    // it bailed BEFORE flipping the WO — no orphaned GL
    expect(seen.some((s) => s.includes("UPDATE maintenance.work_orders"))).toBe(false);
  });

  it("already-voided WO short-circuits to already_done", async () => {
    const { client } = mockClient([
      { match: (s) => s.includes("to_regclass('maintenance.work_orders')"), rows: [{ ok: true }] },
      { match: (s) => s.includes("SELECT voided_at FROM maintenance.work_orders"), rows: [{ voided_at: "2026-06-28T00:00:00Z" }] },
    ]);
    const res = await executeVoidCancel("work_order", {
      client: client as never,
      operatingCompanyId: OCI,
      entityId: WO,
      action: "void",
      userId: APPROVER,
      reason: "approved void request",
    });
    expect(res.kind).toBe("already_done");
  });
});

describe("governance void/cancel — maker/checker gates", () => {
  // The approve route gates on canVoidCancel(role) and blocks self-approval. These mirror that logic.
  const isExecutor = (role: string) => canVoidCancel(role);
  const canApprove = (role: string, requestedBy: string, approver: string) =>
    isExecutor(role) && requestedBy !== approver;

  it("a non-executor cannot approve (must file, not decide)", () => {
    expect(canApprove("Dispatcher", REQUESTER, APPROVER)).toBe(false);
    expect(canApprove("Driver", REQUESTER, APPROVER)).toBe(false);
    expect(canApprove("Manager", REQUESTER, APPROVER)).toBe(false);
  });

  it("an executor cannot approve their OWN request (self-approval rejected)", () => {
    expect(canApprove("Owner", APPROVER, APPROVER)).toBe(false);
    expect(canApprove("Accountant", APPROVER, APPROVER)).toBe(false);
  });

  it("an executor can approve someone else's request", () => {
    expect(canApprove("Owner", REQUESTER, APPROVER)).toBe(true);
    expect(canApprove("Administrator", REQUESTER, APPROVER)).toBe(true);
    expect(canApprove("Accountant", REQUESTER, APPROVER)).toBe(true);
  });
});
