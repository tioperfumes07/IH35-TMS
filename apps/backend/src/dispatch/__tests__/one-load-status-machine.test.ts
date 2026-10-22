import { describe, expect, it, vi } from "vitest";
import { loadStatusMachineEdges, validateLoadStatusWrite } from "../load-state-machine.js";
import { LoadStatusWriteRefusedError, transitionLoadStatus } from "../load-transition.service.js";

/**
 * LEAD 443.211R — ONE STATUS MACHINE. Fails on the old code: load-state-machine.ts had no validateLoadStatusWrite /
 * loadStatusMachineEdges and load-transition.service.ts had no transitionLoadStatus (every writer ran its own UPDATE).
 */

const OPCO = "11111111-1111-4111-8111-111111111111";
const LOAD = "44444444-4444-4444-8444-444444444444";

function client(status: string | null, updated = true) {
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    if (sql.includes("FOR UPDATE")) return { rows: status == null ? [] : [{ status }] };
    if (sql.includes("UPDATE mdata.loads")) return { rows: updated ? [{ id: LOAD, status: values?.[2] }] : [] };
    return { rows: [] };
  });
  return { query } as never as { query: typeof query };
}

describe("LEAD 443.211R — the machine", () => {
  it("lists forward, billing_reverse and cancel_restore edges once each", () => {
    const e = loadStatusMachineEdges().map((x) => x.join(">"));
    expect(new Set(e).size).toBe(e.length);
    expect(e).toContain("dispatched>in_transit>forward");
    expect(e).toContain("invoiced>delivered>billing_reverse");
    expect(e).toContain("closed>invoiced>billing_reverse");
    expect(e).toContain("cancelled>dispatched>cancel_restore");
    expect(e).not.toContain("invoiced>dispatched>billing_reverse");
  });

  it("refuses a forward move that is not an edge, and a billing reverse into the dispatch lifecycle", () => {
    expect(validateLoadStatusWrite("closed", "draft", "forward").ok).toBe(false);
    expect(validateLoadStatusWrite("invoiced", "dispatched", "billing_reverse").ok).toBe(false);
    expect(validateLoadStatusWrite("dispatched", "in_transit", "forward").ok).toBe(true);
    expect(validateLoadStatusWrite("closed", "invoiced", "billing_reverse").ok).toBe(true);
  });

  it("restores a cancelled load ONLY to the status it held when cancelled (evidence required)", () => {
    expect(validateLoadStatusWrite("cancelled", "dispatched", "cancel_restore")).toEqual({ ok: false, reason: "cancel_restore_requires_the_pre_cancel_status" });
    expect(validateLoadStatusWrite("cancelled", "closed", "cancel_restore", { restoreFrom: "dispatched" }).ok).toBe(false);
    expect(validateLoadStatusWrite("cancelled", "dispatched", "cancel_restore", { restoreFrom: "dispatched" }).ok).toBe(true);
    expect(validateLoadStatusWrite("invoiced", "dispatched", "cancel_restore", { restoreFrom: "dispatched" }).ok).toBe(false);
    expect(validateLoadStatusWrite("cancelled", "invoiced", "cancel_restore", { restoreFrom: "invoiced" }).ok).toBe(false);
  });
});

describe("LEAD 443.211R — the one writer", () => {
  it("writes a machine edge compare-and-set on the status it read", async () => {
    const c = client("dispatched");
    const row = await transitionLoadStatus(c as never, { operatingCompanyId: OPCO, loadId: LOAD, to: "in_transit", kind: "forward", writer: "t" });
    expect(row).toMatchObject({ status: "in_transit" });
    const upd = c.query.mock.calls.find(([s]) => String(s).includes("UPDATE mdata.loads"))!;
    expect(upd[1]).toEqual([LOAD, OPCO, "in_transit", "dispatched"]);
  });

  it("refuses a move that is not an edge and writes nothing", async () => {
    const c = client("closed");
    await expect(transitionLoadStatus(c as never, { operatingCompanyId: OPCO, loadId: LOAD, to: "draft", kind: "forward", writer: "bulk" }))
      .rejects.toBeInstanceOf(LoadStatusWriteRefusedError);
    expect(c.query.mock.calls.some(([s]) => String(s).includes("UPDATE mdata.loads"))).toBe(false);
  });

  it("returns null without writing when the load moved since the writer decided (expectFrom)", async () => {
    const c = client("in_transit");
    const row = await transitionLoadStatus(c as never, { operatingCompanyId: OPCO, loadId: LOAD, to: "invoiced", kind: "forward", writer: "t", expectFrom: "delivered" });
    expect(row).toBeNull();
    expect(c.query.mock.calls.some(([s]) => String(s).includes("UPDATE mdata.loads"))).toBe(false);
  });

  it("refuses a cancel restore without the pre-cancel status evidence", async () => {
    const c = client("cancelled");
    await expect(transitionLoadStatus(c as never, { operatingCompanyId: OPCO, loadId: LOAD, to: "dispatched", kind: "cancel_restore", writer: "reversal" }))
      .rejects.toThrow(/cancel_restore_requires_the_pre_cancel_status/);
  });
});
