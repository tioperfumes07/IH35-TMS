import { describe, expect, it } from "vitest";
import { getTripPairingBoard } from "../trip-pairing-board.service.js";

/**
 * FAIL-TP1 — the board's driver column must come from the LOAD's dispatch assignment, with the telematics
 * (Samsara ELD) assignment only as a fallback.
 *
 * The original defect: the driver was resolved SOLELY from telematics.vehicle_driver_assignments keyed by
 * unit, so a unit with no OPEN ELD assignment rendered a blank driver even though
 * mdata.loads.assigned_primary_driver_id was populated — verified on prod, 4 of 5 rows blank while every
 * dispatched/in-transit load had a driver. The same rows resolved fine in the load drawer and on Kanban,
 * because those read the load.
 *
 * `DbClient` is structural ({ query }), so the whole service is exercised here against canned rows — no
 * database. Each case asserts the ORDER of preference, not merely that a driver appears: preferring
 * telematics would let a stale open ELD assignment silently override the dispatcher's own choice on the
 * very surface where the dispatcher picks the return leg.
 */

type Rows = Record<string, unknown>[];

/** Route each query to canned rows by matching the SQL, so column/JOIN changes surface here loudly. */
function makeClient(opts: { eldDriver?: Rows; loads?: Rows; units?: Rows }) {
  const seen: string[] = [];
  const client = {
    async query<R = Record<string, unknown>>(sql: string): Promise<{ rows: R[] }> {
      seen.push(sql);
      if (/set_config/.test(sql)) return { rows: [] as R[] };
      if (/FROM mdata\.units/.test(sql)) {
        return { rows: (opts.units ?? [{ unit_id: "unit-1", unit_number: "T176" }]) as R[] };
      }
      if (/telematics\.vehicle_driver_assignments/.test(sql)) return { rows: (opts.eldDriver ?? []) as R[] };
      if (/FROM mdata\.loads/.test(sql)) return { rows: (opts.loads ?? []) as R[] };
      // positions / anything else
      return { rows: [] as R[] };
    },
  };
  return { client, seen };
}

const LOAD_LEG = {
  load_id: "load-1",
  unit_id: "unit-1",
  tour_id: null,
  trip_type: "NB",
  status: "in_transit",
  pickup_date: "2026-08-08T10:00:00.000Z",
  delivery_city: "Dallas",
  delivery_state: "TX",
  delivery_date: "2026-08-09T10:00:00.000Z",
};

const AS_OF = new Date("2026-08-08T12:00:00.000Z");

describe("FAIL-TP1 trip pairing driver resolution", () => {
  it("uses the load's assigned driver when there is NO open ELD assignment (the reported blank column)", async () => {
    const { client } = makeClient({
      eldDriver: [],
      loads: [{ ...LOAD_LEG, load_driver_id: "drv-load", load_driver_name: "Alfredo Cazares" }],
    });

    const board = await getTripPairingBoard(client, "co-1", AS_OF);

    expect(board.tours).toHaveLength(1);
    expect(board.tours[0]?.driver_id).toBe("drv-load");
    expect(board.tours[0]?.driver_name).toBe("Alfredo Cazares");
  });

  it("prefers the load's dispatch assignment OVER a conflicting open ELD assignment", async () => {
    const { client } = makeClient({
      eldDriver: [{ unit_id: "unit-1", driver_id: "drv-eld", driver_name: "Stale ELD Driver" }],
      loads: [{ ...LOAD_LEG, load_driver_id: "drv-load", load_driver_name: "Alfredo Cazares" }],
    });

    const board = await getTripPairingBoard(client, "co-1", AS_OF);

    // The dispatcher's choice wins. If this ever flips, a stale ELD row silently rewrites who is on the truck.
    expect(board.tours[0]?.driver_id).toBe("drv-load");
    expect(board.tours[0]?.driver_name).toBe("Alfredo Cazares");
  });

  it("falls back to the ELD assignment when the load has no assigned driver", async () => {
    const { client } = makeClient({
      eldDriver: [{ unit_id: "unit-1", driver_id: "drv-eld", driver_name: "Eld Driver" }],
      loads: [{ ...LOAD_LEG, load_driver_id: null, load_driver_name: null }],
    });

    const board = await getTripPairingBoard(client, "co-1", AS_OF);

    expect(board.tours[0]?.driver_id).toBe("drv-eld");
    expect(board.tours[0]?.driver_name).toBe("Eld Driver");
  });

  it("selects assigned_primary_driver_id in the loads query at all", async () => {
    const { client, seen } = makeClient({ loads: [] });
    await getTripPairingBoard(client, "co-1", AS_OF);
    const loadsSql = seen.find((s) => /FROM mdata\.loads/.test(s)) ?? "";
    // Assert the PROJECTION under the exact alias the row assembly reads, not merely that the identifier
    // appears somewhere: `LEFT JOIN mdata.drivers ld ON ld.id = l.assigned_primary_driver_id` also contains
    // the column name, so a bare `toContain("assigned_primary_driver_id")` still passes when the SELECT
    // list has been stripped — verified by mutation, it did.
    expect(loadsSql).toMatch(/l\.assigned_primary_driver_id::text AS load_driver_id/);
    expect(loadsSql).toMatch(/AS load_driver_name/);
    // ...and joins drivers, or the name column would render an id.
    expect(loadsSql).toMatch(/LEFT JOIN mdata\.drivers/);
  });
});
