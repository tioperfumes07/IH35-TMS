/**
 * LEAD 443.184 (05:05Z) — fail-old: the stop-event status write had no home in the status module; each caller issued its
 * own UPDATE with no audit row. Now writeLoadStatusFromStopEventInClientTx validates the same transitions, compares-and-
 * sets on the status the caller read, and audits the stop event.
 */
import { describe, expect, it, vi } from "vitest";
const audit = vi.fn(async () => undefined);
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: audit }));
const { writeLoadStatusFromStopEventInClientTx } = await import("../load-transition.service.js");

const base = { actorUserId: "a", operatingCompanyId: "co", loadId: "l1", stopId: "s1", event: "arrival" as const, source: "driver_app" };

describe("writeLoadStatusFromStopEventInClientTx", () => {
  it("moves dispatched → at_pickup with compare-and-set and an audit row", async () => {
    audit.mockClear();
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    const client = { query: async (sql: string, values?: unknown[]) => { calls.push({ sql, values }); return { rows: [{ id: "l1" }] }; } };
    const r = await writeLoadStatusFromStopEventInClientTx(client, { ...base, fromMdataStatus: "dispatched", toMdataStatus: "at_pickup" });
    expect(r).toEqual({ ok: true });
    expect(calls[0]!.values).toEqual(["l1", "at_pickup", "co", "dispatched"]);
    expect(audit).toHaveBeenCalledWith(client, "a", "dispatch.load.status_from_stop_event", expect.objectContaining({ stop_id: "s1", from_status: "dispatched", to_status: "at_pickup" }), "info", "LEAD-443-184-STOP-STATUS");
  });

  it("refuses an illegal move before writing, and reports a concurrent change", async () => {
    const client = { query: vi.fn(async () => ({ rows: [] })) };
    const bad = await writeLoadStatusFromStopEventInClientTx(client, { ...base, fromMdataStatus: "unassigned", toMdataStatus: "delivered_pending_docs" });
    expect(bad).toMatchObject({ ok: false, error: "invalid_load_state" });
    expect(client.query).not.toHaveBeenCalled();
    const raced = await writeLoadStatusFromStopEventInClientTx(client, { ...base, fromMdataStatus: "dispatched", toMdataStatus: "at_pickup" });
    expect(raced).toEqual({ ok: false, error: "load_transition_conflict" });
  });
});
