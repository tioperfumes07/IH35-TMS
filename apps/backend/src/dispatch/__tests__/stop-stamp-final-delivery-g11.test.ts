/**
 * LEAD 443.184 G11 — fail-old: a manual / Truck Line delivery departure delivered the load on ANY delivery stop. Only the
 * final active delivery delivers; an earlier drop leaves the load in transit (the driver-app + fence-detector rule).
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("../delivery-evidence-latch.js", () => ({ latchOnDeliveryEvidence: vi.fn(async () => undefined) }));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async () => undefined) }));
const { stampStopDeparture } = await import("../stop-stamp.service.js");

function client(finalStopId: string) {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  return {
    calls,
    query: async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      if (/ORDER BY s\.sequence_number DESC LIMIT 1/.test(sql)) return { rows: [{ id: finalStopId }] };
      if (/UPDATE mdata\.load_stops/.test(sql)) return { rows: [{ id: "x" }] };
      if (/UPDATE mdata\.loads/.test(sql)) return { rows: [{ id: "load-1" }] };
      return { rows: [] };
    },
  };
}
const ctx = { loadId: "load-1", actorUserId: "actor", source: "manual" as never, auditEvent: "x" };

describe("stampStopDeparture — only the final delivery delivers (G11)", () => {
  it("an earlier drop on a multi-drop load leaves the load in transit", async () => {
    const c = client("stop-final");
    await stampStopDeparture(c as never, { id: "stop-1", stop_type: "delivery", load_status: "at_delivery", operating_company_id: "co", status: "arrived" }, ctx);
    const up = c.calls.find((x) => /UPDATE mdata\.loads/.test(x.sql))!;
    expect(up.values?.[1]).toBe("in_transit");
  });
  it("the final active delivery delivers the load", async () => {
    const c = client("stop-final");
    await stampStopDeparture(c as never, { id: "stop-final", stop_type: "delivery", load_status: "at_delivery", operating_company_id: "co", status: "arrived" }, ctx);
    const up = c.calls.find((x) => /UPDATE mdata\.loads/.test(x.sql))!;
    expect(up.values?.[1]).toBe("delivered_pending_docs");
  });
});
