import { describe, expect, it, vi } from "vitest";
import { unitTelematicsLinks } from "../telematics-linkage.service.js";

const OC = "11111111-1111-4111-8111-111111111111";
const UNIT = "22222222-2222-4222-8222-222222222222";
const UNIT_ROW = {
  id: UNIT,
  unit_number: "T01",
  samsara_vehicle_id: null,
  load_now: null,
  driver_now: null,
  load_now_number: null,
  driver_now_label: null,
};

describe("unitTelematicsLinks query arity", () => {
  it("documents query receives 2 params ($1 oc, $2 unit_id); every other query receives 3", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [UNIT_ROW] }) // first call: unit lookup
      .mockResolvedValue({ rows: [] }); // all subsequent calls

    await unitTelematicsLinks({ query }, OC, UNIT, 30);

    const calls = query.mock.calls as Array<[string, unknown[]]>;
    expect(calls.length).toBeGreaterThanOrEqual(12);

    for (const [sql, params] of calls) {
      if (sql.includes("docs.files")) {
        expect(params, "documents query must supply exactly 2 params — no windowDays ($3)").toHaveLength(2);
        expect(params[0]).toBe(OC);
        expect(params[1]).toBe(UNIT);
      } else {
        expect(params, `query starting "${sql.trimStart().slice(0, 60)}…" must supply 3 params`).toHaveLength(3);
        expect(params[0]).toBe(OC);
        expect(params[1]).toBe(UNIT);
        expect(params[2]).toBe(30);
      }
    }
  });

  it("returns null when the unit is not found", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const result = await unitTelematicsLinks({ query }, OC, UNIT, 30);
    expect(result).toBeNull();
    expect(query).toHaveBeenCalledTimes(1); // only the unit lookup fires
  });
});
