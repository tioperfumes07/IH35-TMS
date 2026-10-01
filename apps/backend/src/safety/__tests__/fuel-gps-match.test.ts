import { describe, expect, it, vi } from "vitest";
import { runFuelGpsMatchBatch } from "../fuel-gps-match.service.js";
import { classifyGpsVerdict } from "../../fuel/fuel-gps-verdict.service.js";

describe("fuel gps match (ROUND 306 E-22)", () => {
  it("never places a bank line on a truck by clock coincidence", async () => {
    const upserts: Array<{ txn: string; sql: string }> = [];
    const sqlSeen: string[] = [];
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      sqlSeen.push(sql);
      if (sql.includes("FROM banking.bank_transactions bt")) {
        return {
          rows: [
            { id: "t1", operating_company_id: "oc1", matched_load_id: null, reference_ts: "2026-05-23T10:00:00.000Z" },
            { id: "t2", operating_company_id: "oc1", matched_load_id: "l1", reference_ts: "2026-05-23T10:10:00.000Z" },
          ],
        };
      }
      if (sql.includes("INSERT INTO safety.fuel_gps_matches")) {
        upserts.push({ txn: String(values?.[1] ?? ""), sql });
        return { rows: [], rowCount: 1 };
      }
      return { rows: [] };
    });

    expect(await runFuelGpsMatchBatch({ query } as never, "oc1", 10)).toBe(2);
    expect(upserts.map((u) => u.txn)).toEqual(["t1", "t2"]);
    for (const u of upserts) {
      expect(u.sql).toContain("'no_match'");
      expect(u.sql).toContain("bank_line_has_no_station_location_or_pump_time");
    }
    expect(sqlSeen.some((s) => s.includes("telematics.vehicle_locations"))).toBe(false);
  });

  const at = "2026-09-26T23:30:00.000Z";
  const c = (unit_id: string) => ({ unit_id, unit_number: unit_id, metres: 120, at });

  it("match only when the card truck and the GPS truck agree", () => {
    expect(classifyGpsVerdict({ cardUnitId: "u1", cardUnitHasFixes: true, candidates: [c("u1")] }).verdict).toBe("match");
  });
  it("held when card and GPS name different trucks", () => {
    expect(classifyGpsVerdict({ cardUnitId: "u1", cardUnitHasFixes: true, candidates: [c("u2")] }).verdict).toBe("held");
  });
  it("held when the card truck has GPS in the window but was not at the station", () => {
    expect(classifyGpsVerdict({ cardUnitId: "u1", cardUnitHasFixes: true, candidates: [] }).verdict).toBe("held");
  });
  it("unverifiable when the card truck has no GPS in the window", () => {
    expect(classifyGpsVerdict({ cardUnitId: "u1", cardUnitHasFixes: false, candidates: [] }).verdict).toBe("unverifiable");
  });
  it("proposal on one signal; held when several trucks and no card truck", () => {
    expect(classifyGpsVerdict({ cardUnitId: null, cardUnitHasFixes: false, candidates: [c("u3")] }).verdict).toBe("proposal");
    expect(classifyGpsVerdict({ cardUnitId: null, cardUnitHasFixes: false, candidates: [c("u3"), c("u4")] }).verdict).toBe("held");
    expect(classifyGpsVerdict({ cardUnitId: null, cardUnitHasFixes: false, candidates: [] }).verdict).toBe("no_candidate");
  });
});
