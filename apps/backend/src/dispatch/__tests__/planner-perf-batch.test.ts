import { describe, it, expect } from "vitest";
import { getCurrentClocksForDrivers } from "../../telematics/hos-clocks.service.js";
import { listDriverBlackoutsForDrivers } from "../planner.service.js";

// DB-7 Phase 1 — guard the planner N+1 fix: the batched helpers must issue exactly ONE query
// regardless of how many drivers are passed (constant, not 2×N), and must group results per driver
// identically to the old per-driver path.

const OPCO = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
const WEEK_START = "2026-06-29T00:00:00.000Z";
const WEEK_END = "2026-07-06T00:00:00.000Z";

function mockClient(rows: Record<string, unknown>[]) {
  const calls: { sql: string; values?: unknown[] }[] = [];
  return {
    calls,
    query: async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      return { rows };
    },
  };
}

describe("DB-7 Phase 1 — getCurrentClocksForDrivers (batched, no N+1)", () => {
  it("issues exactly ONE query for many drivers (constant, not per-driver)", async () => {
    const client = mockClient([]);
    const few = await getCurrentClocksForDrivers(client as never, OPCO, ["d1", "d2"]);
    const many = await getCurrentClocksForDrivers(client as never, OPCO, ["d1", "d2", "d3", "d4", "d5", "d6"]);
    // 2 calls total — one per invocation — and never grows with the number of drivers.
    expect(client.calls.length).toBe(2);
    // every requested driver is present (no-event drivers included, like the per-driver path)
    expect([...few.keys()].sort()).toEqual(["d1", "d2"]);
    expect(many.size).toBe(6);
  });

  it("returns no query and an empty map for an empty driver list", async () => {
    const client = mockClient([]);
    const out = await getCurrentClocksForDrivers(client as never, OPCO, []);
    expect(client.calls.length).toBe(0);
    expect(out.size).toBe(0);
  });

  it("groups events by driver and computes a valid status per driver", async () => {
    const client = mockClient([
      { driver_id: "d1", started_at: "2026-06-20T00:00:00.000Z", ended_at: null, duty_status: "off_duty" },
      { driver_id: "d2", started_at: "2026-06-20T00:00:00.000Z", ended_at: null, duty_status: "driving" },
    ]);
    const out = await getCurrentClocksForDrivers(client as never, OPCO, ["d1", "d2", "d3"]);
    expect(client.calls.length).toBe(1);
    for (const id of ["d1", "d2", "d3"]) {
      expect(out.has(id)).toBe(true);
      expect(["ok", "warning_1hr", "warning_15min", "violation"]).toContain(out.get(id)!.status);
    }
  });
});

describe("DB-7 Phase 1 — listDriverBlackoutsForDrivers (batched, no N+1)", () => {
  it("issues exactly ONE query regardless of driver count and groups per driver", async () => {
    const client = mockClient([
      { driver_id: "d1", start_at: WEEK_START, end_at: WEEK_END, duty_status: "off_duty" },
      { driver_id: "d1", start_at: WEEK_START, end_at: WEEK_END, duty_status: "sleeper" },
      { driver_id: "d3", start_at: WEEK_START, end_at: WEEK_END, duty_status: "personal_conveyance" },
    ]);
    const out = await listDriverBlackoutsForDrivers(client as never, OPCO, ["d1", "d2", "d3"], WEEK_START, WEEK_END);
    expect(client.calls.length).toBe(1);
    expect(out.get("d1")?.length).toBe(2);
    expect(out.get("d1")?.[0]).toEqual({ start_at: WEEK_START, end_at: WEEK_END, reason: "off_duty" });
    expect(out.has("d2")).toBe(false); // no blackouts → absent; caller defaults to []
    expect(out.get("d3")?.[0].reason).toBe("personal_conveyance");
  });

  it("returns no query and an empty map for an empty driver list", async () => {
    const client = mockClient([]);
    const out = await listDriverBlackoutsForDrivers(client as never, OPCO, [], WEEK_START, WEEK_END);
    expect(client.calls.length).toBe(0);
    expect(out.size).toBe(0);
  });
});
