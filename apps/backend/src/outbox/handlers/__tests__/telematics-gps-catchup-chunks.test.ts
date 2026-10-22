import { describe, expect, it, vi } from "vitest";

/** LEAD 443.234 — the GPS catch-up replays at most 30 minutes per delivery (the outbox lease is 5 min) for the units on
 *  live loads, then queues the next chunk; the full 9.5 h window in one delivery timed out and was re-claimed in a loop. */
const h = vi.hoisted(() => ({ catchup: vi.fn(), enqueue: vi.fn(async () => undefined) }));
vi.mock("../../../integrations/samsara/samsara-positions.service.js", () => ({ catchUpSamsaraGpsWindow: h.catchup }));
vi.mock("../../enqueue-outbox-event.js", () => ({ enqueueOutboxEvent: h.enqueue }));
const { TelematicsGpsCatchupHandler } = await import("../telematics-gps-catchup.handler.js");

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ctx = { client: { query: vi.fn(async (q: string) => (q.includes("assigned_unit_id") ? { rows: [{ u: "u1" }, { u: "u2" }] } : { rows: [] })) } };

describe("443.234 — chunked GPS catch-up", () => {
  it("replays 30 minutes for the live-load units and queues the rest", async () => {
    h.catchup.mockResolvedValue({ fetched: 5, inserted: 5, arrivals_triggered: 1, skipped_no_unit: 0, errors: [] });
    const r = await new TelematicsGpsCatchupHandler().deliver({ operating_company_id: OPCO, start_iso: "2026-10-22T05:10:01Z", end_iso: "2026-10-22T14:51:31Z" } as never, ctx as never);
    expect(h.catchup).toHaveBeenCalledWith(ctx.client, OPCO, "2026-10-22T05:10:01Z", "2026-10-22T05:40:01.000Z", ["u1", "u2"]);
    expect(h.enqueue).toHaveBeenCalledWith(ctx.client, "telematics.gps_catchup", expect.anything(),
      { operating_company_id: OPCO, start_iso: "2026-10-22T05:40:01.000Z", end_iso: "2026-10-22T14:51:31Z", unit_ids: ["u1", "u2"] }, expect.stringContaining(":chunk:"));
    expect(r.message).toContain("units:2");
  });
  it("the last chunk queues nothing", async () => {
    h.enqueue.mockClear();
    await new TelematicsGpsCatchupHandler().deliver({ operating_company_id: OPCO, start_iso: "2026-10-22T14:40:00Z", end_iso: "2026-10-22T14:51:31Z", unit_ids: ["u1"] } as never, ctx as never);
    expect(h.enqueue).not.toHaveBeenCalled();
  });
});
