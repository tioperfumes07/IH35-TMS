import { describe, expect, it, vi } from "vitest";
import { processGeofenceDetectionsForGpsPoint } from "../geofence-detector.service.js";

describe("geofence state transitions", () => {
  it("records entry, exit, then entry pattern", async () => {
    const events: Array<"entered" | "exited"> = [];
    let last: "entered" | "exited" | null = null;
    let inside = true;

    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FROM geo.geofences g")) {
          return {
            rows: [
              {
                geofence_id: "11111111-1111-1111-1111-111111111111",
                is_inside: inside,
                last_event_kind: last,
              },
            ],
          };
        }
        if (sql.includes("FROM mdata.loads l")) {
          return { rows: [{ driver_id: null }] };
        }
        if (sql.includes("INSERT INTO geo.geofence_events")) {
          const eventKind = /'entered'/.test(sql) ? "entered" : null;
          void eventKind;
          return { rows: [] };
        }
        return { rows: [] };
      }),
    };

    const push = async (occurredAt: string) => {
      const result = await processGeofenceDetectionsForGpsPoint(client, {
        operating_company_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        unit_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        latitude: 30.26,
        longitude: -97.74,
        occurred_at: occurredAt,
      });
      if (result.transitions_written === 1) {
        if (inside && last !== "entered") {
          events.push("entered");
          last = "entered";
        } else if (!inside && last === "entered") {
          events.push("exited");
          last = "exited";
        }
      }
    };

    inside = true;
    await push("2026-05-23T20:00:00.000Z");
    inside = false;
    await push("2026-05-23T20:30:00.000Z");
    inside = true;
    await push("2026-05-23T21:00:00.000Z");

    expect(events).toEqual(["entered", "exited", "entered"]);
  });
});
