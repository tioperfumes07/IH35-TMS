import { describe, expect, it, vi } from "vitest";
import { listLeaseScopedDispatchedRoutes, projectRouteStopEvent } from "./routes-integration.service.js";

describe("Samsara Routes integration", () => {
  it("lists only dispatched loads whose assigned unit is leased to the company", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ load_id: "load-1" }] });
    const rows = await listLeaseScopedDispatchedRoutes({ query }, "5c854333-6ea5-4faa-af31-67cb272fef80");
    expect(rows).toEqual([{ load_id: "load-1" }]);
    const sql = String(query.mock.calls[1]?.[0]);
    expect(sql).toContain("u.currently_leased_to_company_id = $1::uuid");
    expect(sql).toContain("l.operating_company_id = $1::uuid");
    expect(sql).toContain("'dispatched','at_pickup','in_transit','at_delivery'");
    expect(sql).not.toContain("last_seen_at");
  });

  it("projects a RouteStopArrival using canonical load and stop external ids", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: "stop-1" }] });
    const result = await projectRouteStopEvent({ query }, {
      operatingCompanyId: "5c854333-6ea5-4faa-af31-67cb272fef80",
      eventType: "RouteStopArrival",
      payload: {
        data: {
          time: "2026-09-05T20:00:00Z",
          route: { externalIds: { ih35Load: "11111111-1111-4111-8111-111111111111" } },
          routeStopDetails: { externalIds: { ih35Stop: "22222222-2222-4222-8222-222222222222" } },
        },
      },
    });
    expect(result).toEqual({ success: true });
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("l.operating_company_id = $1::uuid");
    expect(sql).toContain("ls.id = $3::uuid AND ls.load_id = l.id");
    expect(query.mock.calls[0]?.[1]).toEqual([
      "5c854333-6ea5-4faa-af31-67cb272fef80",
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      true,
      "2026-09-05T20:00:00Z",
      false,
    ]);
  });

  it("fails closed when route correlation ids are missing", async () => {
    const query = vi.fn();
    const result = await projectRouteStopEvent({ query }, {
      operatingCompanyId: "5c854333-6ea5-4faa-af31-67cb272fef80",
      eventType: "RouteStopDeparture",
      payload: { data: { time: "2026-09-05T20:00:00Z" } },
    });
    expect(result).toEqual({ success: false, error: "route_stop_external_ids_or_time_missing" });
    expect(query).not.toHaveBeenCalled();
  });
});
