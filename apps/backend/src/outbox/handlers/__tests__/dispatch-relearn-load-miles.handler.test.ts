import { describe, expect, it, vi } from "vitest";

const relearnLoadStopLegs = vi.fn();
const recomputeFirstStopDeadhead = vi.fn();
vi.mock("../../../dispatch/load-lane-learning.service.js", () => ({
  relearnLoadStopLegs: (...a: unknown[]) => relearnLoadStopLegs(...a),
  recomputeFirstStopDeadhead: (...a: unknown[]) => recomputeFirstStopDeadhead(...a),
}));

const geocodeStopsWithClient = vi.fn();
vi.mock("../../../telematics/stops-geocode-backfill.service.js", () => ({
  geocodeStopsWithClient: (...a: unknown[]) => geocodeStopsWithClient(...a),
}));
vi.mock("../../../dispatch/mileage/miles-recommendations.service.js", () => ({ recordDocumentMilesSources: vi.fn(async () => ({ recorded: [] })) }));

const CO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const LOAD = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ACTOR = "e4117991-d2c0-406d-8cda-74e98d95bccd";

describe("DispatchRelearnLoadMilesHandler (443.53 #2)", () => {
  it("scopes to the company, relearns the legs, then recomputes the first-stop deadhead", async () => {
    geocodeStopsWithClient.mockResolvedValue({ street_from_place: 1, samsara_matched: 0, zip_center_listed: [] });
    relearnLoadStopLegs.mockResolvedValue({ changed: [{}, {}], kept_owner_legs: 0, unresolved: [] });
    recomputeFirstStopDeadhead.mockResolvedValue({ written: true, method: "google", old: 12, miles: 14.2 });
    const { DispatchRelearnLoadMilesHandler } = await import("../dispatch-relearn-load-miles.handler.js");
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const out = await new DispatchRelearnLoadMilesHandler().deliver(
      { operating_company_id: CO, load_id: LOAD, actor_user_id: ACTOR },
      { client: { query } as never, eventId: "e", instanceId: "t", log: () => {} }
    );
    expect(query).toHaveBeenCalledWith(expect.stringContaining("app.bypass_rls"));
    expect(query).toHaveBeenCalledWith(expect.stringContaining("app.operating_company_id"), [CO]);
    expect(relearnLoadStopLegs).toHaveBeenCalledWith(expect.anything(), { operatingCompanyId: CO, loadId: LOAD, actorUserId: ACTOR });
    expect(recomputeFirstStopDeadhead).toHaveBeenCalledWith(expect.anything(), { operatingCompanyId: CO, loadId: LOAD, actorUserId: ACTOR });
    expect(geocodeStopsWithClient).toHaveBeenCalledWith(expect.anything(), ACTOR, CO, LOAD, { reresolve: true });
    expect(geocodeStopsWithClient.mock.invocationCallOrder[0]).toBeLessThan(relearnLoadStopLegs.mock.invocationCallOrder[0]);
    expect(out.message).toBe("street_from_place:1:samsara:0:zip_listed:0:relearned:2:unresolved:0:deadhead:google");
  });

  it("refuses a payload without a load id", async () => {
    const { DispatchRelearnLoadMilesHandler } = await import("../dispatch-relearn-load-miles.handler.js");
    await expect(new DispatchRelearnLoadMilesHandler().deliver(
      { operating_company_id: CO, actor_user_id: ACTOR },
      { client: { query: vi.fn() } as never, eventId: "e", instanceId: "t", log: () => {} }
    )).rejects.toThrow("load_id_invalid_uuid");
  });
});
