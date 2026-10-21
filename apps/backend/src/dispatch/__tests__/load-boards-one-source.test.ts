import { describe, expect, it, vi } from "vitest";

import * as canonical from "../canonical-active-load-set.js";
import { getTripPairingBoard } from "../trip-pairing-board.service.js";

/**
 * LEAD 443.206 (owner 10-21 "check all loadboards, they are not in sync") — every board reads ONE set and ONE unit gate.
 * Fails on origin/main: the dispatch-work clause carried no row exclusions (views.live_loads applied them privately),
 * there was no shared unit gate (Truck Line used the lease alone), and Trip Pairing showed the LAST leg's status and the
 * last-listed row's driver instead of the truck's current leg.
 */
const CO = "5c854333-6ea5-4faa-af31-67cb272fef80";

describe("443.206 — one board set, one unit gate", () => {
  it("the board set excludes deleted, voided and sample loads", () => {
    const sql = canonical.canonicalDispatchWorkWhereClause("l", "$1::uuid");
    expect(sql).toContain("l.voided_at IS NULL");
    expect(sql).toContain("l.is_sample_data IS NOT TRUE");
    expect(sql).toContain("l.soft_deleted_at IS NULL");
  });

  it("THE unit gate is COALESCE(leased, owner) = company and in service", () => {
    const gate = (canonical as Record<string, unknown>).canonicalBoardUnitGateSql as ((u: string, p: string) => string) | undefined;
    expect(typeof gate).toBe("function");
    const sql = gate!("u", "$1::uuid");
    expect(sql).toContain("COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $1::uuid");
    expect(sql).toContain("'InService'");
  });
});

describe("443.206 D12 — Trip Pairing shows the truck's CURRENT leg", () => {
  it("status and driver come from the earliest-pickup leg, not the last one", async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (/FROM mdata\.units u/.test(sql)) return { rows: [{ unit_id: "U1", unit_number: "T148" }] };
        if (/FROM mdata\.loads l/.test(sql) && /load_driver_id/.test(sql)) {
          return {
            rows: [
              // listed first: the NEXT leg (booked, later pickup, another driver on the booking)
              { load_id: "L2", unit_id: "U1", tour_id: "T", trip_type: "TR", status: "booked", pickup_date: "2026-10-20T12:00:00Z",
                delivery_city: "Denton", delivery_state: "TX", delivery_date: "2026-10-23", load_driver_id: "D2", load_driver_name: "Next Driver" },
              // listed last: the CURRENT leg (dispatched, earlier pickup)
              { load_id: "L1", unit_id: "U1", tour_id: "T", trip_type: "NB", status: "dispatched", pickup_date: "2026-10-16T12:00:00Z",
                delivery_city: "Swedesboro", delivery_state: "NJ", delivery_date: "2026-10-19", load_driver_id: "D1", load_driver_name: "Hugo Gaytan" },
            ],
          };
        }
        return { rows: [] };
      }),
    };
    const board = await getTripPairingBoard(client as never, CO, new Date("2026-10-21T21:00:00Z"));
    expect(board.tours).toHaveLength(1);
    expect(board.tours[0]!.status).toBe("dispatched");
    expect(board.tours[0]!.driver_name).toBe("Hugo Gaytan");
  });
});
